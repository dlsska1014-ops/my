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
  ensureKakaoLoginUser, findUserByKakaoLoginId, hasBackupLoginIdentity, hasKakaoLoginIdentity,
  householdDeleteReauthCookieName, isPlaceholderUserNickname, kakaoLoginIdentityMatchesUser,
  linkKakaoLoginToUser, makeCredentialProof, makeHouseholdDeleteReauthToken, readPurposeToken,
  signedPurposeToken, verifyCredentialProof,
} from "./identity-reauth.js";
import { fetchUserById, fetchUserHouseholds } from "../data/users-household-create.js";
import { backupLoginKnownCookie, clearSetupCookies } from "../my/setup-page.js";
import { createHouseholdForUserV229104 } from "../my/households-lifecycle.js";
import { addQueryToUrl, recordSignupConsent } from "./local-login-pages.js";
import {
  isKakaoTalkInAppBrowser, kakaoAccountLinkProofAfterKakao, kakaoAutoLoginCookie,
  kakaoAutoLoginFallbackLocation,
} from "./kakao-account-link.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import {
  clearConsentStateCookie, consentStateCookie, kakaoStartOrLoginHtml, readSignupConsentState,
} from "./kakao-start-screen.js";
import { readHouseholdRoleOrFailure } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

// V22.9.104 L-1: 카카오 첫 로그인에 만드는 기본 가계부 이름(가계부 기본 설정 띠가 ‘아직 안 정한 이름’으로 보는 꼴이라 띠가 이름을 정하게 한다).
const KAKAO_FIRST_HOUSEHOLD_NAME = "내 가계부";

// V22.9.104 독립 검토 P3-1: 방금 만든 첫 가계부로 보낼 때 돌아갈 곳(safeUserReturnPath 를 거친 같은 사이트 주소)의 household_id 를 뺀다.
function withoutHouseholdIdV229104(path = "") {
  if (!path) return "";
  try {
    const parsed = new URL(path, "https://accountbook.local");
    parsed.searchParams.delete("household_id");
    return `${parsed.pathname}${parsed.search}${parsed.hash}`;
  } catch (_) {
    return "";
  }
}

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
  // V22.9.95 R-9 의 동의 체크 칸(consent=1 없으면 400)은 V22.9.114 에서 뺐다(사용자 2026-11-09, 앱 심사 담당자 요청). 보통 로그인(login)도 바로 카카오로
  // 보낸다. 약관 안내는 단추 아래 한 줄(계속하면 동의한 것으로 봄)과 홈의 안내 띠가 맡는다. 주소에 consent 가 붙어 와도 읽지 않는다.
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
  // V22.9.104 L-1: 카카오톡 인앱 브라우저에서 보통 로그인(서명된 상태의 mode login)이 실패·취소되면 긴 로그인 화면 대신 시작 화면에 같은 말을 띄우고
  // 돌아갈 곳(next)을 그대로 싣는다. 인앱이 아니거나 연결·본인 확인 흐름이면 예전 로그인 화면 그대로다.
  const callbackErrorHtml = (message) => (flowProof?.mode === "login" && isKakaoTalkInAppBrowser(request)
    ? kakaoStartOrLoginHtml(request, env, { error: message, returnTo: safeUserReturnPath(String(flowProof?.next || ""), "") })
    : renderUserLoginHtml(env, message));
  const errorResponse = (stage, status = 500) => reauthRequested
    ? redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: stage === "cancelled" ? "kakao_reauth_cancelled" : "kakao_reauth_failed" }), clearOauthCookies)
    : htmlResponseWithCookies(
      callbackErrorHtml(kakaoCallbackErrorMessage(stage, ["cancelled", "state", "config", "busy"].includes(stage) ? "" : traceId)),
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
    // V22.9.114: 화면 있는 보통 로그인(login, auto 아님)은 새 계정을 만든다(V22.9.95 R-9 의 동의 체크 조건을 뺐다 — 로그인 화면·시작 화면의 단추 아래
    // ‘계속하면 이용약관에 동의한 것으로 봅니다’ 한 줄을 보고 누른 로그인이다). 만들었으면 안내 확인 기록(consent:<id>, via kakao)을 남긴다.
    const screenLogin = stateProof.mode === "login" && !autoMode;
    let createdUser = null;
    let user = autoMode ? await findUserByKakaoLoginId(env, profile.kakaoId) : await ensureKakaoLoginUser(env, profile.kakaoId, profile.nickname, { allowCreate: true, onCreated: (created) => { createdUser = created; } });
    if (autoMode && !user?.id) {
      rememberOpsEvent({ kind: "kakao_auto_login_no_account", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
      return autoFallback();
    }
    // V22.9.104 L-3: 방금 남긴 안내 확인 기록은 쿠키 ab_cs=1 로 이어진다(기록이 실패하면 쿠키를 적지 않는다 — 다음 로그인이 다시 읽는다).
    const consentRecorded = createdUser?.id ? await recordSignupConsent(env, createdUser.id, "kakao") : false;
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
    // V22.9.104 L-3: 세션을 만들 때 안내 확인 기록을 한 번 읽어(새 계정은 방금 남긴 결과) 홈 띠 쿠키(ab_cs)를 적는다. 가계부 목록과 함께 읽는다.
    const [existingHouseholds, consentRead] = await Promise.all([
      fetchUserHouseholds(env, user.id),
      createdUser?.id ? (consentRecorded ? true : null) : readSignupConsentState(env, user.id),
    ]);
    // V22.9.104 통합 검토 → V22.9.114: 화면 있는 로그인(screenLogin, 안내 한 줄을 본 로그인)인데 이미 있던 계정에 기록이 없으면(V22.9.95 전에 만든 계정,
    // 단톡방에서 먼저 써 봇이 만든 계정) 여기서 남긴다. 남기지 않으면 홈에서 안내 띠를 또 본다. 저장에 실패하면 ab_cs=0(띠가 다시 받는다).
    // 화면 없는 자동 로그인(auto)은 남기지 않는다(홈 띠가 받는다). 주소를 꾸며 auto=1 에 무엇을 붙여도 화면 없는 로그인이라 남기지 않는다(독립 검토 P2-1).
    const consentState = consentRead === false && screenLogin && !createdUser?.id
      ? await recordSignupConsent(env, user.id, "kakao")
      : consentRead;
    const loginNext = stateProof.mode === "login" ? safeUserReturnPath(String(stateProof.next || ""), "") : "";
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
    // V22.9.104 L-1: 다만 안내 확인 기록이 있는 빈 계정(이을 계정 없음)은 기본 가계부를 만들어 들인다. 기록이 없거나 읽지 못하면 지금처럼 시작 화면으로 간다
    // (V22.9.114 에서도 유지 — 화면 없는 로그인으로 빈 계정을 조용히 활성화하지 않는다. 시작 화면의 ‘카카오로 계속하기’ 가 화면 있는 로그인이다).
    // ‘이을 계정 없음’은 잇기 확인이 끝나 제안이 없었거나(no_offer) 스위치가 꺼진(disabled) 때만이다. 확인이 실패했거나(제안 표 읽기 오류) 다른 결과
    // (카카오 계정 불일치)면 이을 계정이 있을 수 있어 가계부를 만들지 않고 예전처럼 첫 가계부 화면(자동 로그인은 시작 화면)으로 간다.
    const emptyAccount = !existingHouseholds.length && !linkProof?.ok;
    const noLinkOffer = ["no_offer", "disabled"].includes(String(linkProof?.reason || ""));
    if (autoMode && emptyAccount && (consentState !== true || !noLinkOffer)) {
      rememberOpsEvent({ kind: "kakao_auto_login_empty_account", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
      return autoFallback();
    }
    // V22.9.104 L-1(사용자 2026-11-06 "바로 가계부 홈이 나와야"): 카카오 로그인(화면 있는 로그인이든 자동 로그인이든)인데 가계부가 없고 이을 계정도
    // 없으면 첫 가계부 만들기 화면(/my/households?first=1#create)으로 보내지 않고 ‘내 가계부’ 하나를 이 사람 소유로 만든 뒤 돌아갈 곳(없으면 /app)으로 간다.
    // 만들기는 /my/create 폼과 같은 순서(createHouseholdForUserV229104, 새 SQL 없음)다. 잇기 제안이 있으면(linkProof.ok) 만들지 않고 합치기 단계로 간다.
    // 만들지 못하면 예전처럼 첫 가계부 화면으로 가고(자동 로그인은 시작 화면), 운영 이벤트(warn)를 남긴다. 이름은 가계부 기본 설정 띠(V22.9.102)가 정하게 한다.
    // 카카오톡 인앱 브라우저에서만 만든다(독립 검토 P2-2: 사용자 결정 B-1 은 인앱 동의 한 번 → 기본 가계부. 인앱이 아닌 브라우저는 예전처럼 첫 가계부 화면에서
    // 만들기·초대코드 참여를 고른다 — 데스크톱에서 초대코드로 참여하려고 온 사람에게 빈 가계부를 만들지 않으려고).
    let firstHousehold = null;
    if (emptyAccount && noLinkOffer && isKakaoTalkInAppBrowser(request)) {
      try {
        const made = await createHouseholdForUserV229104(env, user.id, KAKAO_FIRST_HOUSEHOLD_NAME, mergedMarkerFreeName(user.nickname || "", 40) || "내");
        firstHousehold = made?.household?.id ? made.household : null;
        if (firstHousehold) rememberOpsEvent({ kind: "kakao_first_household", severity: "info", path: "/auth/kakao/callback", method: "GET", detail: `${made.existed ? "existed" : createdUser?.id ? "new_account" : "empty_account"};${autoMode ? "auto" : "login"};trace=${traceId}` });
      } catch (householdErr) {
        rememberOpsEvent({ kind: "kakao_first_household_failed", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: `${safeError(householdErr)};trace=${traceId}` });
      }
      if (autoMode && !firstHousehold) return autoFallback();
    }
    // 방금 만든 첫 가계부로 갈 때는 돌아갈 곳의 household_id 를 뺀다(그 가계부의 참여자가 아니라 404 화면이 나온다, 독립 검토 P3-1).
    const firstNext = firstHousehold ? withoutHouseholdIdV229104(loginNext) : "";
    const next = existingHouseholds.length ? (loginNext || "/my") : firstHousehold ? (firstNext && firstNext !== "/my" ? firstNext : "/app") : "/my/households?first=1#create";
    const session = await makeUserSession(env, user.id);
    const cookies = [
      ...clearOauthCookies,
      `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    ];
    // V22.9.102 가계부 기본 설정 띠: 내 계정 로그인 비밀번호 유무를 로그인 때 한 번 확인해 쿠키(ab_bk=1/0, 14일)에 적는다. 홈은 이 쿠키만 보고
    // ‘로그인 비밀번호’ 항목을 띄운다(DB 읽기 0회). 확인에 실패하면 쿠키를 적지 않는다(모름 = 띄우지 않음).
    try { cookies.push(backupLoginKnownCookie(await hasBackupLoginIdentity(env, user))); } catch (_) {}
    // 동의 기록을 읽지 못했으면(모름) 이 브라우저에 남은 앞 사람의 ab_cs 를 지운다(모름 = 팝업 없음, 독립 검토 P3-4).
    cookies.push(consentState === null ? clearConsentStateCookie() : consentStateCookie(consentState));
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
  // V22.9.102: 가계부 기본 설정 띠의 판정 쿠키(ab_setup·ab_bk)도 함께 지운다(다음 사람의 로그인에 남지 않게).
  // V22.9.104 L-3: 동의 팝업 쿠키(ab_cs)도 지운다.
  const cookies = ["ab_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", ...clearSetupCookies(), clearConsentStateCookie()];
  if (explicit) cookies.push(kakaoAutoLoginCookie("off"));
  return redirectResponseWithCookies("/my", cookies);
}
// @build:exports-start
export {
  handleKakaoLoginCallback, handleKakaoLoginStart, handleMyLogout,
  kakaoAccountLinkAuthorizeResponse,
};
// @build:exports-end
