// @build:imports-start
import { kakaoClientSecret, kakaoRestApiKey } from "../runtime/global-state.js";
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { logWorkerError, safeError } from "../runtime/leases.js";
import {
  constantTimeTextEqual, getCookie, htmlResponse, htmlResponseWithCookies, redirectResponse,
  redirectResponseWithCookies,
} from "../runtime/http.js";
import { recordAuthAttempt } from "./crypto-admin-session.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import {
  getKakaoRedirectUri, inspectKakaoLoginConfig, makeUserSession, mergedMarkerFreeName, randomState,
  verifyUserSession,
} from "./user-session.js";
import {
  ensureKakaoLoginUser, findUserByKakaoLoginId, hasKakaoLoginIdentity,
  householdDeleteReauthCookieName, isPlaceholderUserNickname, kakaoLoginIdentityMatchesUser,
  linkKakaoLoginToUser, makeCredentialProof, makeHouseholdDeleteReauthToken, readPurposeToken,
  signedPurposeToken, verifyCredentialProof,
} from "./identity-reauth.js";
import { fetchUserById, fetchUserHouseholds } from "../data/users-household-create.js";
import { addQueryToUrl } from "./local-login-pages.js";
import {
  isKakaoTalkInAppBrowser, kakaoAccountLinkProofAfterKakao, kakaoAutoLoginCookie,
  kakaoAutoLoginFallbackLocation,
} from "./kakao-account-link.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { readHouseholdRoleOrFailure } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

async function handleKakaoLoginStart(request, env, url) {
  const reauthPurpose = ["household-delete", "credential-change"].includes(url.searchParams.get("reauth")) ? url.searchParams.get("reauth") : "";
  const reauthMode = !!reauthPurpose;
  const reauthHouseholdId = String(url.searchParams.get("household_id") || "").trim();
  const reauthReturnTo = safeUserReturnPath(url.searchParams.get("return_to") || "/my/households", "/my/households");
  // V22.9.91: 카카오톡 인앱 브라우저 자동 로그인(라우터의 kakaoInAppAutoLoginResponse 가 auto=1 로 보낸다). prompt=none 이라 카카오 화면이 뜨지 않는다.
  const autoMode = url.searchParams.get("auto") === "1" && !reauthMode && url.searchParams.get("link") !== "1" && isKakaoTalkInAppBrowser(request);
  const config = inspectKakaoLoginConfig(env);
  if (autoMode && !config.ready) return redirectResponseWithCookies(kakaoAutoLoginFallbackLocation(url.searchParams.get("return_to") || ""), [kakaoAutoLoginCookie("skip")]);
  if (!config.enabled) {
    if (reauthMode) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_unavailable" }));
    return htmlResponse(renderUserLoginHtml(env, "카카오 로그인을 잠시 사용할 수 없습니다. 아래 다른 방법으로 접속해주세요."));
  }
  if (!config.ready) {
    rememberOpsEvent({ kind: "kakao_login_config_blocked", severity: "error", path: "/auth/kakao/start", method: "GET", detail: config.issues.join(",") || "invalid config" });
    if (reauthMode) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_unavailable" }));
    return htmlResponse(renderUserLoginHtml(env, "카카오 로그인 설정을 확인하고 있습니다. 오류 화면으로 보내지 않도록 로그인을 잠시 막았으며, 아래 다른 방법으로 접속할 수 있습니다."), 503);
  }
  if (config.publicOrigin && url.origin !== config.publicOrigin) {
    return redirectResponse(`${config.publicOrigin}/auth/kakao/start${url.search}`);
  }
  const linkMode = url.searchParams.get("link") === "1" || reauthMode;
  const currentUserId = linkMode ? await verifyUserSession(request, env) : "";
  if (linkMode && !currentUserId) return redirectResponse(reauthMode ? addQueryToUrl(reauthReturnTo, { err: "login_required" }) : "/my?err=login_required");
  if (reauthMode && /KAKAOTALK/i.test(request.headers.get("user-agent") || "")) return htmlResponse("<p>본인 확인은 Chrome 또는 Safari에서 이 주소를 열어 진행해 주세요.</p>", 403);
  if (linkMode && !reauthMode && !(await verifyCredentialProof(request, env, currentUserId))) return redirectResponse("/my/backup-login?err=account_reauth_required");
  if (reauthMode) {
    // V22.9.93 X-12: 역할을 읽지 못한 것을 ‘소유자가 아님’으로 안내하지 않는다.
    const [{ role, failed: roleCheckFailed }, currentUser] = await Promise.all([
      readHouseholdRoleOrFailure(env, currentUserId, reauthHouseholdId, { path: "/auth/kakao/start", method: "GET" }),
      fetchUserById(env, currentUserId),
    ]);
    if (reauthPurpose === "household-delete" && roleCheckFailed) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "household_role_check_failed" }));
    if (reauthPurpose === "household-delete" && (!reauthHouseholdId || role !== "owner")) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "household_delete_owner_only" }));
    if (!(await hasKakaoLoginIdentity(env, currentUser))) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_unavailable" }));
  }
  // 로그인(login) 뒤 돌아갈 화면은 next 에 따로 둔다. return_to 의 기본값(/my/households)은 본인 확인용이라 로그인에는 쓰지 않는다.
  const statePayload = { nonce: randomState(), user_id: currentUserId, mode: reauthPurpose || (linkMode ? "link" : "login"), household_id: reauthHouseholdId, return_to: reauthReturnTo };
  if (!linkMode) {
    const loginNext = safeUserReturnPath(url.searchParams.get("return_to") || "", "");
    if (loginNext) statePayload.next = loginNext;
    if (autoMode) statePayload.auto = 1;
  }
  const state = await signedPurposeToken(env, "kakao-oauth", statePayload, 600);
  const cookies = [
    `kakao_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    linkMode && currentUserId
      ? `kakao_oauth_link_user=${encodeURIComponent(currentUserId)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      : "kakao_oauth_link_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    reauthMode
      ? `kakao_oauth_reauth_household=${encodeURIComponent(reauthPurpose === "credential-change" ? "credential-change" : reauthHouseholdId)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      : "kakao_oauth_reauth_household=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    reauthMode
      ? `kakao_oauth_return_to=${encodeURIComponent(reauthReturnTo)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`
      : "kakao_oauth_return_to=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  ];
  if (autoMode) cookies.push(kakaoAutoLoginCookie("try"));
  return redirectResponseWithCookies(kakaoAuthorizeLocation(env, config, state, { reauth: reauthMode, quiet: autoMode }), cookies);
}

function kakaoAuthorizeLocation(env, config, state, { reauth = false, quiet = false } = {}) {
  const qs = new URLSearchParams();
  qs.set("client_id", kakaoRestApiKey(env));
  qs.set("redirect_uri", config.redirectUri);
  qs.set("response_type", "code");
  qs.set("state", state);
  // 본인 확인은 카카오 로그인 화면을 다시 띄운다. 카카오톡 인앱 브라우저의 자동 로그인·잇기 확인은 화면 없이 지나간다(카카오 문서: prompt=none).
  if (reauth) qs.set("prompt", "login");
  else if (quiet) qs.set("prompt", "none");
  return `https://kauth.kakao.com/oauth/authorize?${qs.toString()}`;
}

// V22.9.91 계정 잇기 확인(/my/account-link 의 POST, auth/kakao-account-link.js handleMyAccountLinkStart). 지금 로그인한 사람이 잇기 제안의
// 카카오 계정을 가졌는지 카카오 로그인으로 다시 확인한다. 연결 모드처럼 세션 사용자를 상태와 쿠키에 묶는다. 인앱 브라우저는 화면 없이(prompt=none)
// 지나가고, 그게 안 되면 확인 화면이 interactive 로 다시 보낸다. 설정이 준비되지 않았으면 null(확인 화면이 안내한다).
async function kakaoAccountLinkAuthorizeResponse(request, env, { userId = "", offerUserId = "", interactive = false } = {}) {
  const config = inspectKakaoLoginConfig(env);
  if (!config.ready || !userId || !offerUserId) return null;
  const origin = new URL(request.url).origin;
  if (config.publicOrigin && origin !== config.publicOrigin) return redirectResponse(`${config.publicOrigin}/my/account-link`);
  const quiet = !interactive && isKakaoTalkInAppBrowser(request);
  const payload = { nonce: randomState(), user_id: userId, mode: "account-link", household_id: "", return_to: "/my", offer: offerUserId };
  if (quiet) payload.auto = 1;
  const state = await signedPurposeToken(env, "kakao-oauth", payload, 600);
  return redirectResponseWithCookies(kakaoAuthorizeLocation(env, config, state, { quiet }), [
    `kakao_oauth_state=${encodeURIComponent(state)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    `kakao_oauth_link_user=${encodeURIComponent(userId)}; Path=/; Max-Age=600; HttpOnly; Secure; SameSite=Lax`,
    "kakao_oauth_reauth_household=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    "kakao_oauth_return_to=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  ]);
}

async function fetchKakaoProfileByCode(env, url, code = "") {
  const redirectUri = getKakaoRedirectUri(env, url);
  const tokenBody = new URLSearchParams();
  tokenBody.set("grant_type", "authorization_code");
  tokenBody.set("client_id", kakaoRestApiKey(env));
  tokenBody.set("redirect_uri", redirectUri);
  tokenBody.set("code", code);
  if (kakaoClientSecret(env)) tokenBody.set("client_secret", kakaoClientSecret(env));

  const tokenRes = await fetch("https://kauth.kakao.com/oauth/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
    body: tokenBody,
  });
  const tokenText = await tokenRes.text();
  if (!tokenRes.ok) throw kakaoStageError("token", `Kakao token endpoint returned ${tokenRes.status}`);
  let token = null;
  try {
    token = JSON.parse(tokenText);
  } catch (err) {
    throw kakaoStageError("token", "Kakao token response was not valid JSON");
  }
  if (!token?.access_token) throw kakaoStageError("token", "Kakao access token missing");

  const meRes = await fetch("https://kapi.kakao.com/v2/user/me", {
    headers: { authorization: `Bearer ${token.access_token}` },
  });
  const meText = await meRes.text();
  if (!meRes.ok) throw kakaoStageError("profile", `Kakao profile endpoint returned ${meRes.status}`);
  let me = null;
  try {
    me = JSON.parse(meText);
  } catch (err) {
    throw kakaoStageError("profile", "Kakao profile response was not valid JSON");
  }
  const kakaoId = String(me.id || "");
  const nickname = String(me?.properties?.nickname || me?.kakao_account?.profile?.nickname || "카카오사용자").slice(0, 80);
  if (!kakaoId) throw kakaoStageError("profile", "Kakao id missing");
  return { kakaoId, nickname, raw: me };
}

function kakaoStageError(stage, message) {
  const err = new Error(message);
  err.kakaoStage = stage;
  return err;
}

function kakaoLoginTraceId() {
  return `K${randomState().slice(0, 7).toUpperCase()}`;
}

function kakaoCallbackErrorMessage(stage = "", traceId = "") {
  const suffix = traceId ? ` 문제가 계속되면 관리자에게 오류 코드 ${traceId}를 알려주세요.` : "";
  const messages = {
    cancelled: "카카오 로그인을 취소했습니다. 다시 시도하거나 아래 다른 방법으로 접속할 수 있습니다.",
    provider: `카카오에서 로그인 요청을 완료하지 못했습니다. 잠시 후 다시 시도해주세요.${suffix}`,
    state: "로그인 확인 시간이 지났습니다. 카카오 로그인을 처음부터 다시 시도하거나 아래 다른 방법으로 접속해주세요.",
    config: "카카오 로그인 설정을 확인하고 있습니다. 오류 화면으로 보내지 않도록 로그인을 잠시 막았으며, 아래 다른 방법으로 접속할 수 있습니다.",
    token: `카카오 인증 확인에 실패했습니다. 잠시 후 다시 시도하거나 아래 다른 방법으로 접속해주세요.${suffix}`,
    profile: `카카오 프로필을 불러오지 못했습니다. 잠시 후 다시 시도하거나 아래 다른 방법으로 접속해주세요.${suffix}`,
    account: `로그인은 확인됐지만 계정 정보를 저장하지 못했습니다. 기존 기록은 변경되지 않았습니다.${suffix}`,
    // V22.9.91: 같은 곳(IP)에서 카카오 로그인이 짧은 시간에 많으면 잠시 막는다. 예전에는 ‘확인 시간이 지났습니다’로 보여 이유가 달랐다.
    busy: "카카오 로그인 요청이 잠시 많아 처리하지 못했습니다. 1~2분 뒤 다시 시도하거나 아래 다른 방법으로 접속해주세요.",
  };
  return messages[String(stage || "")] || `카카오 로그인을 완료하지 못했습니다. 기존 기록은 변경되지 않았습니다.${suffix}`;
}

async function handleKakaoLoginCallback(request, env, url) {
  const reauthHouseholdId = String(getCookie(request, "kakao_oauth_reauth_household") || "").trim();
  const reauthReturnTo = safeUserReturnPath(getCookie(request, "kakao_oauth_return_to") || "/my/households", "/my/households");
  const reauthRequested = !!reauthHouseholdId;
  const clearOauthCookies = [
    "kakao_oauth_state=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    "kakao_oauth_link_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    "kakao_oauth_reauth_household=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    "kakao_oauth_return_to=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  ];
  const traceId = kakaoLoginTraceId();
  const errorResponse = (stage, status = 500) => reauthRequested
    ? redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: stage === "cancelled" ? "kakao_reauth_cancelled" : "kakao_reauth_failed" }), clearOauthCookies)
    : htmlResponseWithCookies(
      renderUserLoginHtml(env, kakaoCallbackErrorMessage(stage, ["cancelled", "state", "config", "busy"].includes(stage) ? "" : traceId)),
      status,
      clearOauthCookies
    );
  // V22.9.91: 서명된 상태를 먼저 읽어 자동 로그인(auto)·계정 잇기(account-link) 흐름이 실패했을 때 갈 곳을 고른다. 서명만 확인한 값이라
  // 갈 곳을 고르는 데만 쓰고, 로그인·연결 판단은 아래에서 쿠키와 견준 stateProof 로 한다.
  let flowProof = null;
  try { flowProof = await readPurposeToken(env, "kakao-oauth", String(url.searchParams.get("state") || "")); } catch (_) { flowProof = null; }
  const autoMode = flowProof?.mode === "login" && flowProof?.auto === 1;
  const accountLinkMode = flowProof?.mode === "account-link";
  // 자동 로그인이 안 되면(비회원·오류·쿠키 막힘) 지금처럼 로그인 화면으로 간다. 하루 동안 다시 보내지 않고(skip), 주소의 auto=0 이 쿠키 없이도 되풀이를 끊는다.
  const autoFallback = () => redirectResponseWithCookies(kakaoAutoLoginFallbackLocation(String(flowProof?.next || "")), [...clearOauthCookies, kakaoAutoLoginCookie("skip")]);
  const accountLinkError = (code) => redirectResponseWithCookies(`/my/account-link?err=${encodeURIComponent(code)}`, clearOauthCookies);
  let stage = "state";
  try {
    const oauthError = String(url.searchParams.get("error") || "");
    if (oauthError && accountLinkMode) {
      rememberOpsEvent({ kind: "kakao_account_link_kakao_error", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `error=${oauthError.slice(0, 80)};trace=${traceId}` });
      return accountLinkError(flowProof.auto === 1 ? "kakao_retry" : oauthError === "access_denied" ? "cancelled" : "kakao_unavailable");
    }
    if (oauthError && autoMode) {
      // 카카오 문서: prompt=none 에서 회원이 아니면 consent_required 다. 그때는 로그인하지 않은 화면을 보인다(동의 화면으로 보내지 않는다).
      const nonmember = ["consent_required", "login_required", "interaction_required"].includes(oauthError);
      rememberOpsEvent({ kind: nonmember ? "kakao_auto_login_nonmember" : "kakao_auto_login_error", severity: nonmember ? "info" : "warn", path: "/auth/kakao/callback", method: "GET", detail: `error=${oauthError.slice(0, 80)};trace=${traceId}` });
      return autoFallback();
    }
    if (oauthError) {
      const cancelled = oauthError === "access_denied";
      rememberOpsEvent({
        kind: cancelled ? "kakao_login_cancelled" : "kakao_login_provider_error",
        severity: cancelled ? "info" : "warn",
        path: "/auth/kakao/callback",
        method: "GET",
        detail: `error=${oauthError.slice(0, 80)};trace=${traceId}`,
      });
      return errorResponse(cancelled ? "cancelled" : "provider", 400);
    }
    const config = inspectKakaoLoginConfig(env);
    if (!config.ready) {
      rememberOpsEvent({ kind: "kakao_login_config_blocked", severity: "error", path: "/auth/kakao/callback", method: "GET", detail: `${config.issues.join(",") || "disabled"};trace=${traceId}` });
      if (autoMode) return autoFallback();
      if (accountLinkMode) return accountLinkError("kakao_unavailable");
      return errorResponse("config", 503);
    }
    const code = String(url.searchParams.get("code") || "");
    const state = String(url.searchParams.get("state") || "");
    const savedState = getCookie(request, "kakao_oauth_state");
    const stateProof = await readPurposeToken(env, "kakao-oauth", state);
    if (!code || !state || !savedState || !constantTimeTextEqual(state, savedState) || !stateProof) {
      rememberOpsEvent({
        kind: "kakao_login_state_mismatch",
        severity: "warn",
        path: "/auth/kakao/callback",
        method: "GET",
        detail: `code=${code ? "set" : "missing"};state=${state ? "set" : "missing"};cookie=${savedState ? "set" : "missing"};trace=${traceId}`,
      });
      if (autoMode) return autoFallback();
      if (accountLinkMode) return accountLinkError("expired");
      return errorResponse("state", 400);
    }
    // 이 한도는 성공해도 풀리지 않는다(V22.9.30 감사: 같은 곳의 입장 수는 성공으로 지우지 않는다). 자동 로그인도 카카오가 코드를 준 요청만 센다.
    // V22.9.91 독립 검토: 자동 로그인은 따로 센다. 같은 IP(통신사 공유 IP·회사)의 자동 로그인이 손으로 누른 로그인을 ‘요청이 많아요’로 막지 않게 한다.
    // 자동 로그인 칸이 차면 로그인 화면으로 가고(하루 쉼), 그때 손으로 누른 로그인은 원래 칸을 쓴다.
    const callbackAttempt = await recordAuthAttempt(env, request, autoMode ? "/auth/kakao/callback#auto" : "/auth/kakao/callback", false, {limit: 20});
    if (!callbackAttempt.allowed) {
      if (autoMode) return autoFallback();
      if (accountLinkMode) return accountLinkError("busy");
      return errorResponse("busy", callbackAttempt.unavailable ? 503 : 429);
    }
    if (stateProof.user_id !== (getCookie(request, "kakao_oauth_link_user") || "") || (reauthRequested && stateProof.mode !== (reauthHouseholdId === "credential-change" ? "credential-change" : "household-delete"))) return errorResponse("state", 400);
    if (stateProof.mode === "household-delete" && stateProof.household_id !== reauthHouseholdId) return errorResponse("state", 400);
    if (reauthRequested && /KAKAOTALK/i.test(request.headers.get("user-agent") || "")) return errorResponse("state", 403);
    stage = "token";
    const profile = await fetchKakaoProfileByCode(env, url, code);
    stage = "account";
    const linkUserId = getCookie(request, "kakao_oauth_link_user");
    const currentUserId = await verifyUserSession(request, env);
    if (reauthRequested) {
      if (!linkUserId || !currentUserId || !constantTimeTextEqual(linkUserId, currentUserId)) {
        return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_failed" }), clearOauthCookies);
      }
      const [identityMatches, { role, failed: roleCheckFailed }] = await Promise.all([
        kakaoLoginIdentityMatchesUser(env, currentUserId, profile.kakaoId),
        // V22.9.93: 비밀번호 변경 재인증에는 가계부가 없다(쿠키 값 credential-change). 조회하면 uuid 칸에 글자를 넣어 허위 경보만 남는다.
        stateProof.mode === "credential-change" ? { role: "", failed: false } : readHouseholdRoleOrFailure(env, currentUserId, reauthHouseholdId, { path: "/auth/kakao/callback", method: "GET" }),
      ]);
      if (!identityMatches) {
        rememberOpsEvent({ kind: "kakao_reauth_identity_mismatch", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
        return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_account_mismatch" }), clearOauthCookies);
      }
      if (stateProof.mode === "credential-change") {
        const proof = await makeCredentialProof(env, currentUserId);
        return redirectResponseWithCookies("/my/backup-login?msg=account_reauth_verified", [...clearOauthCookies, `ab_credential_reauth=${encodeURIComponent(proof)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`]);
      }
      if (roleCheckFailed) return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "household_role_check_failed" }), clearOauthCookies);
      if (role !== "owner") return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "household_delete_owner_only" }), clearOauthCookies);
      const reauthToken = await makeHouseholdDeleteReauthToken(env, currentUserId, reauthHouseholdId);
      return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { msg: "kakao_reauth_verified" }), [
        ...clearOauthCookies,
        `${householdDeleteReauthCookieName()}=${encodeURIComponent(reauthToken)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`,
      ]);
    }
    if (stateProof.mode === "account-link") {
      if (!linkUserId || !currentUserId || !constantTimeTextEqual(linkUserId, currentUserId)) return accountLinkError("session");
      const linkProof = await kakaoAccountLinkProofAfterKakao(env, { userId: currentUserId, kakaoId: profile.kakaoId, offerUserId: String(stateProof.offer || ""), mode: "confirm", next: "/my" });
      if (linkProof.ok) return redirectResponseWithCookies("/my/account-link/run", [...clearOauthCookies, linkProof.cookie]);
      rememberOpsEvent({ kind: "kakao_account_link_check_failed", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: `${linkProof.reason};trace=${traceId}` });
      return linkProof.reason === "kakao_account_mismatch" ? accountLinkError("kakao_account_mismatch") : redirectResponseWithCookies("/my", clearOauthCookies);
    }
    if (linkUserId && currentUserId && linkUserId === currentUserId) {
      if (stateProof.mode !== "link" || !(await verifyCredentialProof(request, env, currentUserId))) return errorResponse("state", 403);
      await linkKakaoLoginToUser(env, profile.kakaoId, currentUserId, profile);
      return redirectResponseWithCookies("/my?msg=kakao_linked", clearOauthCookies);
    }
    // V22.9.91 독립 검토: 자동 로그인(auto)은 새 계정을 만들지 않는다. 이 카카오 계정의 웹 계정이 이미 있을 때만 들인다.
    let user = autoMode ? await findUserByKakaoLoginId(env, profile.kakaoId) : await ensureKakaoLoginUser(env, profile.kakaoId, profile.nickname);
    if (autoMode && !user?.id) {
      rememberOpsEvent({ kind: "kakao_auto_login_no_account", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
      return autoFallback();
    }
    if (!user?.id) throw kakaoStageError("account", "Kakao user provisioning failed");
    // V22.9.81 U-23: 프로필 이름 끝의 ‘(통합됨)’은 계정 통합 표식이라 떼고 쓴다(사용자를 만들 때와 같다). 그대로 쓰면 세션 확인이
    // 통합된 계정으로 보고 로그인을 거절했고, 다음 로그인에는 저장된 이름이 자리표시가 아니라서 풀리지 않았다.
    const profileName = mergedMarkerFreeName(profile.nickname, 80);
    if (user?.id && profileName && isPlaceholderUserNickname(user.nickname) && !isPlaceholderUserNickname(profileName)) {
      await supabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ nickname: profileName }),
      });
      user = { ...user, nickname: profileName };
    }
    const existingHouseholds = await fetchUserHouseholds(env, user.id);
    const loginNext = stateProof.mode === "login" ? safeUserReturnPath(String(stateProof.next || ""), "") : "";
    const next = !existingHouseholds.length ? "/my/households?first=1#create" : (loginNext || "/my");
    // V22.9.91 계정 잇기: 이 카카오 계정의 단톡방 기록 계정이 따로 있으면(잇기 제안) 합치기 단계(/my/account-link/run)로 보낸다.
    // 제안 표는 이 카카오 id 로 방금 확인했을 때만 합치기 표를 준다. 읽지 못하면 지금처럼 가계부로 간다.
    let linkProof = null;
    try {
      linkProof = await kakaoAccountLinkProofAfterKakao(env, { userId: user.id, kakaoId: profile.kakaoId, offerUserId: user.id, mode: "login", next: loginNext || "/my" });
    } catch (linkErr) {
      rememberOpsEvent({ kind: "kakao_account_link_check_failed", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: `${safeError(linkErr)};trace=${traceId}` });
    }
    // V22.9.91 독립 검토: 자동 로그인은 가계부가 있거나 이을 계정이 있는 사람만 들인다. 빈 웹 계정에 말없이 들이면 첫 가계부 만들기
    // 화면이 나와, 단톡방 가계부가 따로 있는 사람이 거기서 새 가계부를 만들어 기록이 갈라질 수 있다. 그런 사람은 지금처럼 로그인 화면을 본다.
    if (autoMode && !existingHouseholds.length && !linkProof?.ok) {
      rememberOpsEvent({ kind: "kakao_auto_login_empty_account", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
      return autoFallback();
    }
    const session = await makeUserSession(env, user.id);
    const cookies = [
      ...clearOauthCookies,
      `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    ];
    // 다시 카카오로 로그인했으니 자동 로그인 멈춤(로그아웃 off·비회원 skip)을 푼다. 쿠키가 있을 때만 지운다.
    // 자동 로그인은 되풀이 막기(try, 10분)를 남긴다(V22.9.91 독립 검토). 세션이 붙지 않거나 확인에서 거절되면 다음 화면이 자동 로그인을
    // 다시 보내지 않고 로그인 화면을 보인다. 예전에는 여기서 지워 같은 자리를 되풀이할 수 있었다.
    if (!autoMode && getCookie(request, "ab_kakao_auto")) cookies.push(kakaoAutoLoginCookie(""));
    if (linkProof?.ok) return redirectResponseWithCookies("/my/account-link/run", [...cookies, linkProof.cookie]);
    return redirectResponseWithCookies(next, cookies);
  } catch (err) {
    const failedStage = String(err?.kakaoStage || stage || "unknown");
    logWorkerError({ event: "kakao_login_error", path: "/auth/kakao/callback", method: "GET", label: failedStage, trace_id: traceId, error: err });
    rememberOpsEvent({ kind: "kakao_login_error", severity: "error", path: "/auth/kakao/callback", method: "GET", detail: `stage=${failedStage};trace=${traceId};${safeError(err)}` });
    if (accountLinkMode) return accountLinkError("kakao_unavailable");
    if (autoMode) return autoFallback();
    return errorResponse(failedStage, 500);
  }
}

// V22.9.91: 직접 누른 로그아웃(POST /my/logout)은 이 브라우저의 카카오톡 자동 로그인을 30일 멈춘다. 그러지 않으면 인앱 브라우저에서
// 로그아웃하자마자 /my 가 다시 자동 로그인한다. 다시 카카오로 로그인하면 풀린다. 세션이 풀려 부르는 다른 곳은 멈추지 않는다.
function handleMyLogout({ explicit = false } = {}) {
  const cookies = ["ab_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax"];
  if (explicit) cookies.push(kakaoAutoLoginCookie("off"));
  return redirectResponseWithCookies("/my", cookies);
}
// @build:exports-start
export {
  handleKakaoLoginCallback, handleKakaoLoginStart, handleMyLogout,
  kakaoAccountLinkAuthorizeResponse,
};
// @build:exports-end
