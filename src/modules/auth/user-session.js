// @build:imports-start
import {
  AB_EFFECTIVE_USER_CACHE, AB_REQUEST_RAW_USER_CACHE, AB_REQUEST_USER_CACHE, kakaoClientSecret,
  kakaoRestApiKey,
} from "../runtime/global-state.js";
import { pruneExpiringMap, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { envFlagEnabled, normalizeBaseUrl } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { constantTimeTextEqual, getCookie, redirectResponse } from "../runtime/http.js";
import { hmacSha256, requiredSecret } from "./crypto-admin-session.js";
import { getSettingValue } from "../admin/settings-audit-pages.js";
import { safeObject } from "../admin/backup-compare.js";
import { fetchUserById, supabaseWithEmbedFallback } from "../data/users-household-create.js";
import { optionalSupabase } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
// @build:imports-end

function userSessionSecret(env) {
  return requiredSecret(env, "USER_SESSION_SECRET");
}

async function getUserSessionVersion(env, userId = "") {
  const uid = String(userId || "").trim();
  if (!uid) return 0;
  try {
    const rows = await supabase(env, `/rest/v1/accountbook_user_security?user_id=eq.${encodeURIComponent(uid)}&select=session_version&limit=1`, { method: "GET" }) || [];
    return Math.max(1, Number(rows[0]?.session_version || 1));
  } catch (err) {
    // The security table is part of readiness from V22.7 onward. Treat an
    // unavailable revocation check as an invalid session instead of silently
    // accepting a version-1 token during a database or permission outage.
    rememberOpsEvent({ kind: "user_session_version_unavailable", severity: "error", path: "/rest/v1/accountbook_user_security", method: "GET", detail: safeError(err) });
    return 0;
  }
}

async function makeUserSession(env, userId) {
  const exp = Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 14;
  const version = await getUserSessionVersion(env, userId);
  if (version < 1) throw new Error("user_session_security_unavailable");
  const data = `${userId}|${exp}|${version}`;
  const sig = await hmacSha256(userSessionSecret(env), data);
  return `${data}.${sig}`;
}

// V22.9.16: 서명 확인(CPU)과 세션 판 확인(DB)을 나눴다. 세션 판 조회와 통합 계정 해석은
// 둘 다 토큰의 사용자 ID 만 있으면 되므로 verifyUserSession 이 나란히 던진다.
async function parseUserSessionToken(request, env) {
  const token = getCookie(request, "ab_user");
  if (!token) return null;
  const dot = token.lastIndexOf(".");
  if (dot < 0) return null;
  const data = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const parts = data.split("|");
  if (parts.length !== 2 && parts.length !== 3) return null;
  const userId = parts[0];
  const exp = Number(parts[1]);
  if (!userId || !Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  const expected = await hmacSha256(userSessionSecret(env), data);
  if (!constantTimeTextEqual(expected, sig)) return null;
  const tokenVersion = parts.length === 3 ? Number(parts[2]) : 1;
  return { userId, tokenVersion };
}

function userSessionVersionMatches(tokenVersion, currentVersion) {
  return Number.isFinite(tokenVersion) && tokenVersion === currentVersion;
}

async function verifyRawUserSessionUncached(request, env) {
  const parsed = await parseUserSessionToken(request, env);
  if (!parsed) return "";
  const currentVersion = await getUserSessionVersion(env, parsed.userId);
  if (!userSessionVersionMatches(parsed.tokenVersion, currentVersion)) return "";
  return parsed.userId;
}

async function verifyRawUserSession(request, env) {
  if (!request || (typeof request !== "object" && typeof request !== "function")) {
    return verifyRawUserSessionUncached(request, env);
  }
  let pending = AB_REQUEST_RAW_USER_CACHE.get(request);
  if (!pending) {
    pending = verifyRawUserSessionUncached(request, env);
    AB_REQUEST_RAW_USER_CACHE.set(request, pending);
  }
  try {
    return await pending;
  } catch (error) {
    AB_REQUEST_RAW_USER_CACHE.delete(request);
    throw error;
  }
}

function identityMergeRedirectSettingsKey(secondaryUserId = "") {
  return `identity_merge_redirect:${String(secondaryUserId || "").trim()}`.slice(0, 180);
}

function parseIdentityMergeRedirectValue(value, expectedSecondaryId = "", strict = false) {
  let parsed = value;
  if (typeof parsed === "string") {
    try { parsed = parsed ? JSON.parse(parsed) : {}; } catch (err) { parsed = {}; }
  }
  const item = safeObject(parsed);
  const secondaryId = String(item.secondary_user_id || "").trim();
  const primaryId = String(item.primary_user_id || item.user_id || "").trim();
  if (expectedSecondaryId && secondaryId && secondaryId !== expectedSecondaryId) return "";
  // V22.9.26: 키가 대상 사용자와 묶여 있지 않은 광역 조회에서는 값 안의 secondary_user_id 가
  // 반드시 일치해야 한다. 비어 있는 값을 통과시키면 아무 통합 기록이나 다른 사용자의 세션으로 이어진다.
  if (strict && (!secondaryId || secondaryId !== expectedSecondaryId)) return "";
  return primaryId;
}

// V22.9.26: "(통합됨)" 꼬리표는 계정 통합이 붙이는 내부 표식이다. 사용자나 카카오 프로필에서 온
// 표시 이름에서는 떼어 내, 통합 해석 경로가 입력만으로 켜지지 않게 한다.
function stripMergedMarkerSuffix(value = "") {
  let out = String(value || "");
  for (let i = 0; i < 3; i += 1) out = out.replace(/\s*\(\s*통합됨\s*\)\s*$/u, "");
  return out.trim();
}

function cacheEffectiveUserId(sourceUserId = "", effectiveUserId = "") {
  const source = String(sourceUserId || "").trim();
  const effective = String(effectiveUserId || "").trim();
  if (!source || !effective) return;
  pruneExpiringMap(AB_EFFECTIVE_USER_CACHE);
  AB_EFFECTIVE_USER_CACHE.set(source, { user_id: effective, expires_at: Date.now() + 10 * 60 * 1000 });
  if (source === effective) return;
  AB_EFFECTIVE_USER_CACHE.set(effective, { user_id: effective, expires_at: Date.now() + 10 * 60 * 1000 });
}

function cachedEffectiveUserId(userId = "") {
  const key = String(userId || "").trim();
  const cached = AB_EFFECTIVE_USER_CACHE.get(key);
  if (!cached) return "";
  if (Number(cached.expires_at || 0) < Date.now()) {
    AB_EFFECTIVE_USER_CACHE.delete(key);
    return "";
  }
  return String(cached.user_id || "").trim();
}

function rewireEffectiveUserCache(secondaryUserId = "", primaryUserId = "") {
  const secondary = String(secondaryUserId || "").trim();
  const primary = String(primaryUserId || "").trim();
  if (!secondary || !primary || secondary === primary) return;
  pruneExpiringMap(AB_EFFECTIVE_USER_CACHE);
  const expiresAt = Date.now() + 10 * 60 * 1000;
  for (const [key, value] of AB_EFFECTIVE_USER_CACHE.entries()) {
    if (key === secondary || String(value?.user_id || "") === secondary) {
      AB_EFFECTIVE_USER_CACHE.set(key, { user_id: primary, expires_at: expiresAt });
    }
  }
  AB_EFFECTIVE_USER_CACHE.set(secondary, { user_id: primary, expires_at: expiresAt });
  AB_EFFECTIVE_USER_CACHE.set(primary, { user_id: primary, expires_at: expiresAt });
}

async function fetchLegacyIdentityMergePrimaryId(env, secondaryUserId = "") {
  const sid = String(secondaryUserId || "").trim();
  if (!sid) return "";
  const exactPattern = `identity_merge_audit:*:${sid}`;
  let rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(exactPattern)}&select=key,value&order=key.desc&limit=20`, { method: "GET" }, []) || [];
  let strict = false;
  if (!rows.length) {
    // 구버전에서 키 끝부분이 달라졌거나 이관된 경우를 위한 제한적 호환 조회입니다.
    // V22.9.26: 이 광역 조회는 키가 대상 사용자와 묶여 있지 않으므로 값의 secondary_user_id 일치를 요구한다.
    const broadPattern = "identity_merge_audit:*";
    rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(broadPattern)}&select=key,value&order=key.desc&limit=1000`, { method: "GET" }, []) || [];
    strict = true;
  }
  for (const row of rows) {
    const primaryId = parseIdentityMergeRedirectValue(row?.value, sid, strict);
    if (primaryId && primaryId !== sid) return primaryId;
  }
  return "";
}

async function resolveEffectiveUserId(env, userId = "", options = {}) {
  const original = String(userId || "").trim();
  if (!original) return "";
  const cached = cachedEffectiveUserId(original);
  if (cached && !options.fresh) return cached;

  let current = original;
  let sawMergedMarker = false;
  const visited = new Set();
  for (let depth = 0; depth < 6 && current && !visited.has(current); depth += 1) {
    visited.add(current);
    const user = await fetchUserById(env, current);
    const mergedMarker = String(user?.kakao_user_key || "").startsWith("merged:") || /\(통합됨\)\s*$/.test(String(user?.nickname || ""));
    if (!mergedMarker) break;
    sawMergedMarker = true;

    const directValue = await getSettingValue(env, identityMergeRedirectSettingsKey(current));
    let primaryId = parseIdentityMergeRedirectValue(directValue, current);
    if (!primaryId) primaryId = await fetchLegacyIdentityMergePrimaryId(env, current);
    if (!primaryId || primaryId === current || visited.has(primaryId)) break;
    current = primaryId;
  }

  const effective = current || original;
  // 통합 표시 계정인데 매핑을 일시적으로 찾지 못했다면 음성 캐시하지 않고 다음 요청에서 재시도합니다.
  if (!(sawMergedMarker && effective === original)) {
    for (const sourceId of visited) cacheEffectiveUserId(sourceId, effective);
    cacheEffectiveUserId(original, effective);
  }
  return effective;
}

async function verifyUserSession(request, env) {
  if (!request || (typeof request !== "object" && typeof request !== "function")) {
    const rawUserId = await verifyRawUserSession(request, env);
    if (!rawUserId) return ""; const effective = await resolveEffectiveUserId(env, rawUserId, { fresh: true }); return effective === rawUserId ? rawUserId : "";
  }
  let pending = AB_REQUEST_USER_CACHE.get(request);
  if (!pending) {
    pending = (async () => {
      // 같은 요청에서 원본 세션을 이미 확인했으면 그 결과를 쓴다(왕복 추가 없음).
      const rawPending = AB_REQUEST_RAW_USER_CACHE.get(request);
      if (rawPending) {
        const rawUserId = await rawPending;
        if (!rawUserId) return ""; const effective = await resolveEffectiveUserId(env, rawUserId, { fresh: true }); return effective === rawUserId ? rawUserId : "";
      }
      // V22.9.16: 세션 판 확인과 통합 계정 해석을 나란히 던진다. 예전에는 "판 확인 → 사용자
      // 행" 순서로 두 번 기다렸다. 세션이 무효면 사용자 행 한 번을 헛읽지만, 그 경우는 드물다.
      const parsed = await parseUserSessionToken(request, env);
      if (!parsed) {
        AB_REQUEST_RAW_USER_CACHE.set(request, Promise.resolve(""));
        return "";
      }
      const snapshot = await supabaseWithEmbedFallback(env, "users_session_security", `/rest/v1/users?id=eq.${encodeURIComponent(parsed.userId)}&select=id,nickname,kakao_user_key,accountbook_user_security(session_version)&limit=1`, `/rest/v1/users?id=eq.${encodeURIComponent(parsed.userId)}&select=id,nickname,kakao_user_key&limit=1`);
      const currentUser = snapshot.rows?.[0];
      if (snapshot.embedded && currentUser && !Object.prototype.hasOwnProperty.call(currentUser,"accountbook_user_security")) return "";
      const security = currentUser?.accountbook_user_security;
      const currentVersion = snapshot.embedded ? Math.max(1, Number((Array.isArray(security) ? security[0] : security)?.session_version || 1)) : await getUserSessionVersion(env, parsed.userId);
      const effectiveUserId = currentUser && !String(currentUser.kakao_user_key || "").startsWith("merged:") && !/\(통합됨\)\s*$/.test(String(currentUser.nickname || "")) ? String(currentUser.id) : "";
      if (currentUser && env.__AB_REQUEST_USER_ROWS) env.__AB_REQUEST_USER_ROWS.set(parsed.userId, currentUser);
      const valid = userSessionVersionMatches(parsed.tokenVersion, currentVersion);
      if (!AB_REQUEST_RAW_USER_CACHE.has(request)) AB_REQUEST_RAW_USER_CACHE.set(request, Promise.resolve(valid ? parsed.userId : ""));
      return valid && effectiveUserId === parsed.userId ? effectiveUserId : "";
    })();
    AB_REQUEST_USER_CACHE.set(request, pending);
  }
  try {
    return await pending;
  } catch (error) {
    AB_REQUEST_USER_CACHE.delete(request);
    AB_REQUEST_RAW_USER_CACHE.set(request,Promise.resolve(""));
    rememberOpsEvent({kind:"user_session_snapshot_unavailable",severity:"error",path:"",method:"GET",detail:safeError(error)});
    return "";
  }
}

function isMergedSessionRecoveryPath(pathname = "") {
  const path = String(pathname || "");
  // This script is fetched immediately after the analysis HTML. Running the
  // account-merge recovery lookup again for a static asset adds database
  // latency to first paint without any recovery benefit; the parent page has
  // already performed the same check.
  if (path === "/my/analysis/app.js") return false;
  return path === "/my" || path.startsWith("/my/") || [
    "/app", "/households", "/keyword-guide", "/payment-methods", "/reserve-plans",
    "/analysis", "/calendar", "/budgets", "/categories",
  ].includes(path);
}

async function mergedUserSessionRecoveryResponse(request, env, url) {
  try {
    if (!request || !url || !["GET", "HEAD"].includes(String(request.method || "GET").toUpperCase())) return null;
    if (!isMergedSessionRecoveryPath(url.pathname)) return null;
    if (url.pathname === "/my/logout" || url.pathname.startsWith("/auth/kakao/")) return null;
    // V22.9.16: 통합 계정 확인을 먼저 부른다. 그 안에서 세션 판 확인과 사용자 행 조회가 나란히
    // 나가고 원본 세션 결과도 같은 요청 캐시에 남으므로, 뒤의 원본 조회는 왕복 없이 끝난다.
    // 예전 순서(원본 → 통합)는 둘을 줄줄이 기다려 모든 /my·/app 첫 화면에 한 단계를 보탰다.
    const effectiveUserId = await verifyUserSession(request, env);
    if (!effectiveUserId) return null;
    const rawUserId = await verifyRawUserSession(request, env);
    if (!rawUserId || effectiveUserId === rawUserId) return null;
    const session = await makeUserSession(env, effectiveUserId);
    return redirectResponse(`${url.pathname}${url.search}`, {
      "set-cookie": `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
      "x-accountbook-session-recovered": "1",
    });
  } catch (err) {
    rememberOpsEvent({ kind: "merged_session_recovery_deferred", severity: "warn", path: url?.pathname || "", method: request?.method || "GET", detail: safeError(err) });
    return null;
  }
}

function configuredPublicBaseUrl(env = {}) {
  return normalizeBaseUrl(env.PUBLIC_BASE_URL || env.SERVICE_BASE_URL || env.APP_BASE_URL || env.CANONICAL_BASE_URL || "");
}

function getKakaoRedirectUri(env = {}, _url = null) {
  // OAuth callback must never be derived from the current request host. Preview,
  // workers.dev and www/non-www hosts otherwise produce a Kakao KOE006 error.
  return String(env.KAKAO_REDIRECT_URI || "").trim();
}

function inspectKakaoLoginConfig(env = {}) {
  const enabled = envFlagEnabled(env.KAKAO_LOGIN_ENABLED, false);
  const apiKeyConfigured = !!kakaoRestApiKey(env);
  const clientSecretConfigured = !!kakaoClientSecret(env);
  const clientSecretRequired = envFlagEnabled(env.KAKAO_CLIENT_SECRET_REQUIRED, false);
  const publicBase = configuredPublicBaseUrl(env);
  const redirectUri = getKakaoRedirectUri(env);
  const issues = [];
  let publicUrl = null;
  let redirectUrl = null;

  if (enabled) {
    if (!apiKeyConfigured) issues.push("rest_api_key_missing");
    if (!publicBase) issues.push("public_base_url_missing");
    if (!redirectUri) issues.push("redirect_uri_missing");
    if (clientSecretRequired && !clientSecretConfigured) issues.push("client_secret_missing");
  }
  if (publicBase) {
    try {
      publicUrl = new URL(publicBase);
      if (publicUrl.protocol !== "https:" || publicUrl.pathname !== "/" || publicUrl.search || publicUrl.hash) issues.push("public_base_url_invalid");
    } catch (err) {
      issues.push("public_base_url_invalid");
    }
  }
  if (redirectUri) {
    try {
      redirectUrl = new URL(redirectUri);
      if (redirectUrl.protocol !== "https:" || redirectUrl.pathname !== "/auth/kakao/callback" || redirectUrl.search || redirectUrl.hash) issues.push("redirect_uri_invalid");
    } catch (err) {
      issues.push("redirect_uri_invalid");
    }
  }
  if (publicUrl && redirectUrl && publicUrl.origin !== redirectUrl.origin) issues.push("redirect_origin_mismatch");

  const uniqueIssues = [...new Set(issues)];
  return {
    enabled,
    ready: enabled && uniqueIssues.length === 0,
    apiKeyConfigured,
    clientSecretConfigured,
    clientSecretRequired,
    publicBase,
    redirectUri,
    publicOrigin: publicUrl?.origin || "",
    issues: uniqueIssues,
  };
}

function randomState() {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  let out = "";
  for (const v of arr) out += chars[v % chars.length];
  return out;
}

function kakaoLoginEnabled(env = {}) {
  return envFlagEnabled(env.KAKAO_LOGIN_ENABLED, false);
}

function kakaoLoginAvailable(env = {}) {
  return inspectKakaoLoginConfig(env).ready;
}

function kakaoLoginUserKey(kakaoId = "") {
  return `kakao_login:${String(kakaoId || "").trim()}`;
}
// @build:exports-start
export {
  getKakaoRedirectUri, getUserSessionVersion, identityMergeRedirectSettingsKey,
  inspectKakaoLoginConfig, kakaoLoginUserKey, makeUserSession, mergedUserSessionRecoveryResponse,
  parseIdentityMergeRedirectValue, randomState, resolveEffectiveUserId, rewireEffectiveUserCache,
  stripMergedMarkerSuffix, userSessionSecret, verifyUserSession,
};
// @build:exports-end
