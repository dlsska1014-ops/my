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
  getKakaoRedirectUri, inspectKakaoLoginConfig, makeUserSession, randomState, verifyUserSession,
} from "./user-session.js";
import {
  ensureKakaoLoginUser, hasKakaoLoginIdentity, householdDeleteReauthCookieName,
  isPlaceholderUserNickname, kakaoLoginIdentityMatchesUser, linkKakaoLoginToUser,
  makeCredentialProof, makeHouseholdDeleteReauthToken, readPurposeToken, signedPurposeToken,
  verifyCredentialProof,
} from "./identity-reauth.js";
import { fetchUserById, fetchUserHouseholds } from "../data/users-household-create.js";
import { addQueryToUrl } from "./local-login-pages.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

async function handleKakaoLoginStart(request, env, url) {
  const reauthPurpose = ["household-delete", "credential-change"].includes(url.searchParams.get("reauth")) ? url.searchParams.get("reauth") : "";
  const reauthMode = !!reauthPurpose;
  const reauthHouseholdId = String(url.searchParams.get("household_id") || "").trim();
  const reauthReturnTo = safeUserReturnPath(url.searchParams.get("return_to") || "/my/households", "/my/households");
  const config = inspectKakaoLoginConfig(env);
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
    const [role, currentUser] = await Promise.all([
      getHouseholdMemberRole(env, currentUserId, reauthHouseholdId),
      fetchUserById(env, currentUserId),
    ]);
    if (reauthPurpose === "household-delete" && (!reauthHouseholdId || role !== "owner")) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "household_delete_owner_only" }));
    if (!(await hasKakaoLoginIdentity(env, currentUser))) return redirectResponse(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_unavailable" }));
  }
  const state = await signedPurposeToken(env, "kakao-oauth", { nonce: randomState(), user_id: currentUserId, mode: reauthPurpose || (linkMode ? "link" : "login"), household_id: reauthHouseholdId, return_to: reauthReturnTo }, 600);
  const redirectUri = config.redirectUri;
  const qs = new URLSearchParams();
  qs.set("client_id", kakaoRestApiKey(env));
  qs.set("redirect_uri", redirectUri);
  qs.set("response_type", "code");
  qs.set("state", state);
  if (reauthMode) qs.set("prompt", "login");
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
  return redirectResponseWithCookies(`https://kauth.kakao.com/oauth/authorize?${qs.toString()}`, cookies);
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
      renderUserLoginHtml(env, kakaoCallbackErrorMessage(stage, ["cancelled", "state", "config"].includes(stage) ? "" : traceId)),
      status,
      clearOauthCookies
    );
  let stage = "state";
  try {
    const oauthError = String(url.searchParams.get("error") || "");
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
      return errorResponse("state", 400);
    }
    const callbackAttempt = await recordAuthAttempt(env, request, "/auth/kakao/callback", false, {limit: 20});
    if (!callbackAttempt.allowed) return errorResponse("state", callbackAttempt.unavailable ? 503 : 429);
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
      const [identityMatches, role] = await Promise.all([
        kakaoLoginIdentityMatchesUser(env, currentUserId, profile.kakaoId),
        getHouseholdMemberRole(env, currentUserId, reauthHouseholdId),
      ]);
      if (!identityMatches) {
        rememberOpsEvent({ kind: "kakao_reauth_identity_mismatch", severity: "warn", path: "/auth/kakao/callback", method: "GET", detail: `trace=${traceId}` });
        return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "kakao_reauth_account_mismatch" }), clearOauthCookies);
      }
      if (stateProof.mode === "credential-change") {
        const proof = await makeCredentialProof(env, currentUserId);
        return redirectResponseWithCookies("/my/backup-login?msg=account_reauth_verified", [...clearOauthCookies, `ab_credential_reauth=${encodeURIComponent(proof)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`]);
      }
      if (role !== "owner") return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { err: "household_delete_owner_only" }), clearOauthCookies);
      const reauthToken = await makeHouseholdDeleteReauthToken(env, currentUserId, reauthHouseholdId);
      return redirectResponseWithCookies(addQueryToUrl(reauthReturnTo, { msg: "kakao_reauth_verified" }), [
        ...clearOauthCookies,
        `${householdDeleteReauthCookieName()}=${encodeURIComponent(reauthToken)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`,
      ]);
    }
    if (linkUserId && currentUserId && linkUserId === currentUserId) {
      if (stateProof.mode !== "link" || !(await verifyCredentialProof(request, env, currentUserId))) return errorResponse("state", 403);
      await linkKakaoLoginToUser(env, profile.kakaoId, currentUserId, profile);
      return redirectResponseWithCookies("/my?msg=kakao_linked", clearOauthCookies);
    }
    let user = await ensureKakaoLoginUser(env, profile.kakaoId, profile.nickname);
    if (!user?.id) throw kakaoStageError("account", "Kakao user provisioning failed");
    if (user?.id && profile.nickname && isPlaceholderUserNickname(user.nickname) && !isPlaceholderUserNickname(profile.nickname)) {
      await supabase(env, `/rest/v1/users?id=eq.${encodeURIComponent(user.id)}`, {
        method: "PATCH",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify({ nickname: String(profile.nickname).trim().slice(0, 80) }),
      });
      user = { ...user, nickname: String(profile.nickname).trim().slice(0, 80) };
    }
    const session = await makeUserSession(env, user.id);
    const existingHouseholds = await fetchUserHouseholds(env, user.id);
    const next = !existingHouseholds.length ? "/my/households?first=1#create" : "/my";
    return redirectResponseWithCookies(next, [
      ...clearOauthCookies,
      `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    ]);
  } catch (err) {
    const failedStage = String(err?.kakaoStage || stage || "unknown");
    logWorkerError({ event: "kakao_login_error", path: "/auth/kakao/callback", method: "GET", label: failedStage, trace_id: traceId, error: err });
    rememberOpsEvent({ kind: "kakao_login_error", severity: "error", path: "/auth/kakao/callback", method: "GET", detail: `stage=${failedStage};trace=${traceId};${safeError(err)}` });
    return errorResponse(failedStage, 500);
  }
}

function handleMyLogout() {
  return redirectResponse("/my", {
    "set-cookie": "ab_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  });
}
// @build:exports-start
export { handleKakaoLoginCallback, handleKakaoLoginStart, handleMyLogout };
// @build:exports-end
