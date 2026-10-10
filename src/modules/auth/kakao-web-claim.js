// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, operationLeaseOwner, parseStrictSettingsObject, safeError, settingsDataError,
  withSettingsRmwLease,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { recordAuthAttempt, sha256Hex, trafficClientIp } from "./crypto-admin-session.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import {
  identityMergeRedirectSettingsKey, makeUserSession, userSessionSecret,
} from "./user-session.js";
import { makeCredentialProof } from "./identity-reauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { getKakaoBotGroupKey } from "../kakao/group-links-first-record.js";
import {
  getKakaoIdentityAliases, hasChatFirstKakaoIdentity, trustedChatFirstSkillCaller,
} from "../kakao/identity-chat-first.js";
import { ensureUser } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { linkText } from "../domain/transactions-core.js";
// @build:imports-end

const KAKAO_WEB_CLAIM_KEY = "kakao_web_claims_v22928";
const KAKAO_WEB_CLAIM_TTL_MS = 10 * 60 * 1000;
const KAKAO_WEB_CLAIM_CAPACITY = 512;

function normalizeKakaoWebClaimCode(value = "") {
  const raw = String(value || "");
  if (raw.length > 64) return "";
  const code = raw.normalize("NFKC").toUpperCase().replace(/[\s-]/g, "");
  return /^[A-HJ-NP-Z2-9]{32}$/.test(code) ? code : "";
}

function makeKakaoWebClaimCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
}

function parseKakaoWebClaims(value) {
  const claims = parseStrictSettingsObject(value, "kakao_web_claims");
  for (const [hash, record] of Object.entries(claims)) {
    if (!/^[a-f0-9]{64}$/.test(hash) || !record || typeof record !== "object" || Array.isArray(record) ||
        typeof record.user_id !== "string" || !record.user_id || !Number.isInteger(record.session_version) || record.session_version < 1 ||
        !Number.isFinite(Date.parse(String(record.expires_at || "")))) throw settingsDataError("kakao_web_claims", "invalid_shape");
  }
  return claims;
}

function activeKakaoWebClaims(claims = {}, now = Date.now()) {
  return Object.fromEntries(Object.entries(claims).filter(([, record]) => Date.parse(record.expires_at) > now));
}

async function kakaoClaimUserUnmerged(env, userId = "") {
  const user = await fetchUserById(env, userId);
  if (!user || String(user.kakao_user_key || "").startsWith("merged:") || /\(통합됨\)\s*$/.test(String(user.nickname || ""))) return false;
  // Do not use the process-local effective-user cache for bearer-credential decisions.
  const redirect = await getSettingValueStrict(env, identityMergeRedirectSettingsKey(userId));
  return !redirect;
}

async function kakaoClaimSecurityVersion(env, userId = "") {
  const rows = await supabase(env, `/rest/v1/accountbook_user_security?user_id=eq.${encodeURIComponent(userId)}&select=session_version&limit=1`, { method: "GET" }) || [];
  const version = Number(rows[0]?.session_version || 0);
  return Number.isSafeInteger(version) && version > 0 ? version : 0;
}

async function initializeKakaoClaimSecurity(env, userId, assertFresh) {
  const observed = await kakaoClaimSecurityVersion(env, userId);
  if (observed) return observed;
  assertFresh();
  try {
    // A plain insert never overwrites a concurrently advanced security version.
    await supabase(env, "/rest/v1/accountbook_user_security", {
      method: "POST", headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ user_id: String(userId), session_version: 1 }),
    });
  } catch (err) {
    if (!/^Supabase 409\b/.test(safeError(err))) throw err;
  }
  assertFresh();
  const version = await kakaoClaimSecurityVersion(env, userId);
  if (!version) throw new Error("kakao_web_claim_security_unavailable");
  return version;
}

async function retainKakaoClaimTombstone(env, hash, expiresAt) {
  const expires = Date.parse(String(expiresAt || ""));
  if (!Number.isFinite(expires) || expires <= Date.now()) throw new Error("kakao_web_claim_expired");
  const lease = await claimOperationLease(env, {
    key: `kakao-web-claim-used:${hash}`, owner: operationLeaseOwner("kakao-web-claim-used"),
    leaseSeconds: Math.ceil((expires - Date.now()) / 1000) + 30,
  });
  const useExpiry = Date.parse(String(lease.locked_until || ""));
  if (!Number.isFinite(useExpiry) || useExpiry <= expires + 1000) throw new Error("kakao_web_claim_use_lease_invalid");
  // Deliberately do not release the use lease: both use and reissue revoke this hash.
  return lease.acquired;
}

async function issueKakaoWebClaim(env, userId = "") {
  userSessionSecret(env);
  const code = makeKakaoWebClaimCode();
  const hash = await sha256Hex(`kakao-web-claim:v1:${code}`);
  return await withSettingsRmwLease(env, `settings-rmw:${KAKAO_WEB_CLAIM_KEY}`, async ({ assertFresh }) => {
    const claims = activeKakaoWebClaims(parseKakaoWebClaims(await getSettingValueStrict(env, KAKAO_WEB_CLAIM_KEY)));
    if (!(await kakaoClaimUserUnmerged(env, userId))) throw new Error("kakao_web_claim_identity_changed");
    const sessionVersion = await initializeKakaoClaimSecurity(env, userId, assertFresh);
    for (const [previousHash, record] of Object.entries(claims)) {
      if (record.user_id !== String(userId)) continue;
      assertFresh();
      await retainKakaoClaimTombstone(env, previousHash, record.expires_at);
      delete claims[previousHash];
    }
    if (Object.keys(claims).length >= KAKAO_WEB_CLAIM_CAPACITY) throw new Error("kakao_web_claim_capacity");
    claims[hash] = { user_id: String(userId), session_version: sessionVersion, expires_at: new Date(Date.now() + KAKAO_WEB_CLAIM_TTL_MS).toISOString() };
    assertFresh();
    await saveSettingValue(env, KAKAO_WEB_CLAIM_KEY, JSON.stringify(claims));
    assertFresh();
    if (!(await kakaoClaimUserUnmerged(env, userId)) || await kakaoClaimSecurityVersion(env, userId) !== sessionVersion) throw new Error("kakao_web_claim_identity_changed");
    assertFresh();
    return code.match(/.{1,8}/g).join("-");
  });
}

async function kakaoPrivateWebLinkReply(request, env, payload, kakaoUserKey, nickname, origin) {
  const generic = linkText(origin);
  if (getKakaoBotGroupKey(payload) || !trustedChatFirstSkillCaller(request, env) || !hasChatFirstKakaoIdentity(payload, kakaoUserKey)) return generic;
  try {
    const user = await ensureUser(env, kakaoUserKey, nickname, getKakaoIdentityAliases(payload, kakaoUserKey), { create: false });
    if (!user?.id) return generic;
    const code = await issueKakaoWebClaim(env, user.id);
    return `${generic}\n\n카카오에 기록한 같은 계정으로 웹을 이어 열려면 아래 ‘웹 연결 코드’를 붙여 넣어 주세요.\n${code}\n10분 동안 1회만 사용할 수 있어요. 새 코드를 받으면 이전 코드는 만료됩니다.\n이 코드는 내 계정 접근용이므로 다른 사람이나 단톡방에 공유하지 마세요.\n웹에서 이름·예산을 마무리하고 ‘내 계정·보안’에서 이후 로그인 방법을 연결할 수 있어요.`;
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_web_claim_issue_failed", severity: "error", path: "/skill", method: "POST", detail: safeError(err) });
    return `${generic}\n\n같은 카카오 기록을 여는 웹 연결 코드를 지금 준비하지 못했어요. 1:1 채팅에서 잠시 후 다시 ‘웹 가계부 열기’를 보내 주세요.`;
  }
}

async function handleMyKakaoClaim(request, env) {
  const form = await request.formData();
  const returnTo = safeUserReturnPath(String(form.get("return_to") || ""), "");
  const fail = (message, status = 401, headers = {}) => htmlResponse(renderUserLoginHtml(env, message, returnTo, "kakao_claim"), status, headers);
  const code = normalizeKakaoWebClaimCode(form.get("kakao_claim_code"));
  if (!code) return fail("카카오 1:1 채팅에서 받은 웹 연결 코드를 그대로 붙여 넣어 주세요.", 400);
  const hash = await sha256Hex(`kakao-web-claim:v1:${code}`);
  // V22.9.37 감사 H12: IP 단위(20회)와 IP+UA 단위로만 세어 같은 IP 뒤의 사용자(회사·학교 망)가 모두 막혔다.
  // 계정 로그인(V22.9.26)과 같은 틀로 센다 — IP 입장 제한은 느슨한 상한으로, 실제 제한은 코드 해시·IP 묶음으로.
  const admission = await recordAuthAttempt(env, request, "/my/kakao-claim-admission", false, { limit: 40 });
  if (admission.unavailable) return fail("연결 보호 기능을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  if (!admission.allowed) return fail("웹 연결 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.", 429, { "retry-after": "900" });
  const claimSubject = `${trafficClientIp(request)}|${hash.slice(0, 32)}`;
  const attempt = await recordAuthAttempt(env, request, "/my/kakao-claim", false, { scope: "subject-client", key: claimSubject });
  if (attempt.unavailable) return fail("연결 보호 기능을 확인하지 못했어요. 잠시 후 다시 시도해 주세요.", 503);
  if (!attempt.allowed) return fail("웹 연결 시도가 너무 많아요. 잠시 후 다시 시도해 주세요.", 429, { "retry-after": "900" });
  try {
    const session = await withSettingsRmwLease(env, `settings-rmw:${KAKAO_WEB_CLAIM_KEY}`, async ({ assertFresh }) => {
      const claims = parseKakaoWebClaims(await getSettingValueStrict(env, KAKAO_WEB_CLAIM_KEY));
      const record = claims[hash];
      if (!record || Date.parse(record.expires_at) <= Date.now()) return "";
      if (!(await kakaoClaimUserUnmerged(env, record.user_id)) || await kakaoClaimSecurityVersion(env, record.user_id) !== record.session_version) return "";
      const token = await makeUserSession(env, record.user_id);
      // Bind redemption to the security version at issue time. A password change or
      // account merge invalidates old codes instead of minting a newly valid session.
      if (Number(token.slice(0, token.lastIndexOf(".")).split("|")[2]) !== record.session_version || Date.parse(record.expires_at) <= Date.now()) return "";
      assertFresh();
      // Keep this atomic per-code lease through the code's entire remaining lifetime.
      // Even a late global JSON write cannot resurrect an already-used credential.
      if (!(await retainKakaoClaimTombstone(env, hash, record.expires_at))) return "";
      // Deliberately do not release the use lease, including on an uncertain write.
      delete claims[hash];
      assertFresh();
      await saveSettingValue(env, KAKAO_WEB_CLAIM_KEY, JSON.stringify(activeKakaoWebClaims(claims)));
      assertFresh();
      if (Date.parse(record.expires_at) <= Date.now()) throw new Error("kakao_web_claim_expired_during_redeem");
      if (!(await kakaoClaimUserUnmerged(env, record.user_id)) || await kakaoClaimSecurityVersion(env, record.user_id) !== record.session_version) return "";
      assertFresh();
      return token;
    });
    if (!session) return fail("웹 연결 코드가 만료되었거나 이미 사용되었어요. 카카오 1:1 채팅에서 ‘웹 가계부 열기’를 다시 보내 주세요.");
    await recordAuthAttempt(env, request, "/my/kakao-claim", true, { scope: "subject-client", key: claimSubject });
    const response = redirectResponse(returnTo || "/my", {
      "set-cookie": `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    });
    response.headers.append("set-cookie", "ab_hh=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax");
    const userId = session.slice(0,session.lastIndexOf(".")).split("|")[0];
    const proof = await makeCredentialProof(env,userId);
    response.headers.append("set-cookie", `ab_credential_reauth=${encodeURIComponent(proof)}; Path=/; Max-Age=300; HttpOnly; Secure; SameSite=Lax`);
    return response;
  } catch (err) {
    rememberOpsEvent({ kind: "kakao_web_claim_redeem_failed", severity: "error", path: "/my/kakao-claim", method: "POST", detail: safeError(err) });
    return fail("웹 연결을 완료하지 못했어요. 잠시 후 다시 시도하고, 코드가 만료되었다면 1:1 채팅에서 새 코드를 받아 주세요.", 503);
  }
}

function renderKakaoClaimForm(backField = "", open = false) {
  return `<details class="loginOptional" id="kakao-claim-start"${open ? " open" : ""}><summary style="min-height:44px;display:flex;align-items:center">카카오에서 기록한 가계부 이어 열기</summary><p class="muted">카카오 1:1 채팅에서 ‘웹 가계부 열기’를 보내고 받은 웹 연결 코드를 붙여 넣으세요. 초대코드와는 다르며, 같은 기록 계정으로 접속합니다. 현재 웹 계정이 있다면 이 카카오 기록 계정으로 전환하며 계정을 합치지는 않습니다.</p><form method="post" action="/my/kakao-claim">${backField}<div class="field"><label for="kakaoClaimCode">웹 연결 코드</label><input id="kakaoClaimCode" name="kakao_claim_code" autocomplete="one-time-code" autocapitalize="characters" spellcheck="false" maxlength="64" enterkeyhint="go" placeholder="1:1 채팅에서 받은 코드 붙여 넣기" required/></div><button type="submit" class="secondary">카카오 기록 이어 열기</button></form><p class="hint">10분 동안 1회 사용합니다. 다른 사람에게 공유하지 마세요. 접속 후 내 계정·보안에서 이후 로그인 방법을 설정할 수 있습니다.</p></details>`;
}

function loginEntryAnchorClientMain() {
  document.querySelectorAll("[data-signup-entry]").forEach(function(link) {
    link.addEventListener("click",function() { const panel=document.getElementById("signup-start"); if (panel) panel.open=true; });
  });
}
// @build:exports-start
export {
  handleMyKakaoClaim, kakaoClaimUserUnmerged, kakaoPrivateWebLinkReply, loginEntryAnchorClientMain,
  renderKakaoClaimForm,
};
// @build:exports-end
