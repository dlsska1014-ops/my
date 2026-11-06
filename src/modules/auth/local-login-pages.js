// @build:imports-start
import { renderAccountbookEmptyState } from "../web/lucian-onboarding.js";
import {
  boundedRuntimeNumber, rememberOpsEvent, trafficClientKey,
} from "../runtime/ops-telemetry.js";
import { POLICY_REVISION_DATE, appName, kakaoLoginButtonHtml } from "../public/site-config.js";
import { passwordMatchFeedbackClientMain } from "../client/legacy-ui-runtime.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, redirectResponse, redirectResponseWithCookies } from "../runtime/http.js";
import {
  PASSWORD_KDF_ITERATIONS, newPasswordSalt, pbkdf2PasswordHash, recordAuthAttempt, trafficClientIp,
} from "./crypto-admin-session.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { safeObject } from "../admin/backup-compare.js";
import {
  inspectKakaoLoginConfig, makeUserSession, mergedMarkerFreeName, verifyUserSession,
} from "./user-session.js";
import {
  fetchStrongIdentityForUser, fetchUserIdentityLinks, findUserByLocalLoginIdentity,
  hasBackupLoginIdentity, hasKakaoLoginIdentity, normalizeLocalLoginName, replaceLocalLoginForUser,
  verifyCredentialProof, verifyPasswordReauth,
} from "./identity-reauth.js";
import { handleMyLogout } from "./kakao-oauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import { backupLoginKnownCookie } from "../my/setup-page.js";
import { householdJoinFeedback } from "../my/households-lifecycle.js";
import { renderKakaoClaimForm } from "./kakao-web-claim.js";
import { renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { consentStateCookie, consentStateCookieFor } from "./kakao-start-screen.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { stableShortHash } from "../kakao/identity-chat-first.js";
import { joinHouseholdByCode } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { qaFixedNowMs } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function addQueryToUrl(path, params = {}) {
  const u = new URL(path, "https://local");
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== "") u.searchParams.set(k, String(v));
  return `${u.pathname}${u.search}${u.hash}`;
}

function renderMyStartChoiceHtml({ env, user, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const userName = escapeHtml(user?.nickname || "카카오사용자");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 가계부 시작</title><style>
  *,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9 0%,#f8fafc 48%,#eef2f7 100%);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1000px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e8edf4;border-radius:32px;box-shadow:0 22px 54px rgba(15,23,42,.09);padding:26px;margin:16px 0}.badge{display:inline-flex;background:#FEE500;color:#191919;border-radius:999px;padding:7px 11px;font-size:13px;font-weight:1000}.hero h1{margin:14px 0 10px;font-size:32px;letter-spacing:-.06em}.muted{color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;box-shadow:0 14px 34px rgba(15,23,42,.055)}.card h2{margin:0 0 8px;font-size:22px}.field{display:grid;gap:7px;margin:14px 0}.field label{font-size:12px;font-weight:1000;color:#475467}.field input{height:48px;border:1px solid #d0d5dd;background:#fff;border-radius:16px;padding:0 13px;font:inherit}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:48px;border:0;border-radius:16px;background:#111827;color:#fff;font-weight:1000;padding:0 16px;text-decoration:none;cursor:pointer;width:100%}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.criteria{background:#f8fafc;border:1px solid #edf1f7;border-radius:18px;padding:13px;margin:12px 0}.criteria b{display:block}.criteria span{display:block;color:#667085;font-size:13px;line-height:1.5;margin-top:4px}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:14px;padding:11px;margin:10px 0}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:14px;padding:11px;margin:10px 0}.foot{background:#fffdf3;border:1px solid #fde68a;color:#854d0e;border-radius:20px;padding:14px;margin:14px 0;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.grid{grid-template-columns:1fr}.hero h1{font-size:26px}}</style></head><body><main class="wrap"><section class="hero"><span class="badge">가계부 시작</span><h1>${userName}님,<br/>새로 만들까요? 참여할까요?</h1><p class="muted">아래에서 현재 상황에 맞는 것을 선택하세요. 잘못 선택해도 나중에 다른 가계부를 추가하거나 초대코드로 다시 참여할 수 있습니다.</p>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${formatMessage(err)}</div>` : ""}</section>${renderAccountbookEmptyState()}<section class="grid"><div class="card"><h2>새 가계부 만들기</h2><p class="muted">아직 가계부가 없거나, 내가 우리집/모임 가계부의 시작자가 되는 경우입니다.</p><div class="criteria"><b>이럴 때 선택</b><span>내가 가계부를 만들고 구성원을 초대한 뒤 첫 기록부터 시작할 때</span></div><form method="post" action="/my/create"><div class="field"><label>가계부 이름</label><input name="household_name" placeholder="예: 우리집 가계부" value="우리집 가계부"/></div><button type="submit">새 가계부 만들기</button></form></div><div class="card"><h2>초대코드로 참여하기</h2><p class="muted">가족, 배우자, 모임장이 이미 만든 가계부가 있는 경우입니다.</p><div class="criteria"><b>이럴 때 선택</b><span>이미 받은 초대코드가 있고 같은 가계부에 내 기록을 함께 남길 때</span></div><form method="post" action="/my/join"><div class="field"><label>초대코드</label><input name="invite_code" placeholder="예: 38NDLPNR" required/></div><button class="secondary" type="submit">초대코드로 참여하기</button></form></div><div class="card" id="kakao-record-link" style="grid-column:1/-1"><h2>카카오톡에서 이미 기록하고 있었나요?</h2><p class="muted">단톡방이나 봇과의 1:1 채팅에서 남긴 기록은 이 웹 계정이 아니라 카카오 기록 계정에 있어요. 새 가계부를 만들지 말고 같은 기록을 이어 여세요.</p><div class="criteria"><b>이럴 때 선택</b><span>단톡방의 ‘웹가계부’ 버튼으로 들어왔는데 가계부가 비어 있을 때</span></div><ol class="muted" style="margin:10px 0 14px;padding-left:20px;line-height:1.7"><li>카카오톡에서 봇과의 1:1 채팅을 열고 <b>웹 가계부 열기</b>라고 보냅니다.</li><li>받은 웹 연결 코드를 아래 버튼을 눌러 붙여 넣습니다(10분 동안 1회).</li></ol><a class="btn secondary" href="/my/kakao-claim">카카오 기록 이어 열기</a></div></section><div class="foot"><b>다음 단계</b><br/>가계부 생성 또는 참여 → 구성원 초대·승인 → 단톡방 연결(선택) → 기록 방법 확인 → 첫 기록 순서로 진행하세요. 예산과 분류는 첫 기록 후 필요할 때 설정해도 됩니다.</div></main></body></html>`;
}

// V22.9.95 R-9: 가입 폼과 카카오 로그인이 같이 쓰는 동의 오류 문구(맨 위 요약과 칸 아래에 같은 말).
// V22.9.104 L-2: 동의 칸 문구(이용약관 동의 + 개인정보처리방침 확인)와 같은 말로 맞춘다. 홈 동의 팝업(POST /my/consent)도 이 말을 쓴다.
// V22.9.104 L-2(커밋 B): 동의 칸이 나이를 묻지 않으므로 ‘(만 14세 이상)’을 뺐다.
const SIGNUP_CONSENT_REQUIRED_MESSAGE = "이용약관 동의와 개인정보처리방침 확인이 필요해요";

// V22.9.95 R-9: 새 계정이 만들어질 때만(로컬 가입 성공, 카카오 콜백의 새 사용자) 동의 기록을 설정 표 consent:<user_id> 에 남긴다.
// version 은 방침 개정일이다(V22.9.95~103 의 기록에는 동의 칸이 만 14세 이상 확인을 함께 물어 age14 가 있다). 기록이 실패해도 가입은 막지 않고 운영 이벤트(warn)만 남긴다.
// V22.9.104 L-3: 홈 동의 팝업(POST /my/consent)도 같은 기록을 남긴다(via "popup"). 가입 때 기록이 없던 계정(단톡방에서 먼저 생긴 계정 등)이다.
// V22.9.104 L-2(커밋 B): 동의 칸이 나이를 묻지 않아 새 기록에는 age14 를 적지 않는다. 예전 기록의 age14 는 그대로 두며 읽는 곳은 없다.
async function recordSignupConsent(env, userId = "", via = "local") {
  const id = String(userId || "").trim();
  if (!id) return false;
  const kakao = via === "kakao";
  const popup = via === "popup";
  try {
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: `consent:${id}`.slice(0, 180), value: JSON.stringify({ version: POLICY_REVISION_DATE, at: new Date(qaFixedNowMs()).toISOString(), via: kakao ? "kakao" : popup ? "popup" : "local" }) }),
    });
    return true;
  } catch (err) {
    rememberOpsEvent({ kind: "consent_record_failed", severity: "warn", path: kakao ? "/auth/kakao/callback" : popup ? "/my/consent" : "/my/local-signup", method: kakao ? "GET" : "POST", detail: safeError(err) });
    return false;
  }
}

function localWebUserKey(nickname = "", accessCode = "") {
  const seed = `${normalizeText(nickname)}|${String(accessCode || "").trim()}`;
  return `local_web:${stableShortHash(seed)}`;
}

async function ensureLocalLoginUser(env, nickname = "", accessCode = "") {
  return await findUserByLocalLoginIdentity(env, nickname, accessCode);
}

async function createLocalLoginUser(env, loginName = "", displayName = "", accessCode = "") {
  const cleanLoginName = String(loginName || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 80);
  // V22.9.81 U-23: NFKC 로 전각 괄호 ‘（통합됨）’이 표식 ‘(통합됨)’이 되므로 바꾼 뒤에 표식을 뗀다(자른 끝도 함께).
  const cleanDisplayName = mergedMarkerFreeName(String(displayName || cleanLoginName).normalize("NFKC").trim().replace(/\s+/g, " "), 80);
  const cleanCode = String(accessCode || "").trim();
  if (normalizeLocalLoginName(cleanLoginName).length < 2) throw new Error("invalid_login_name");
  if (cleanCode.length < 8) throw new Error("password_too_short");
  const legacy = await supabase(env, `/rest/v1/users?nickname=ilike.${encodeURIComponent(cleanLoginName)}&kakao_user_key=like.local_web%3A*&select=id&limit=1`, {method:"GET"});
  if (legacy?.length) throw new Error("login_name_in_use:legacy_recovery_required");
  const links = await fetchUserIdentityLinks(env);
  if (Object.entries(links).some(([key,value]) => key.startsWith("local_web:") && normalizeLocalLoginName(safeObject(value).nickname) === normalizeLocalLoginName(cleanLoginName))) throw new Error("login_name_in_use:legacy_recovery_required");
  const salt = newPasswordSalt();
  const hash = await pbkdf2PasswordHash(cleanCode, salt, PASSWORD_KDF_ITERATIONS);
  const result = await supabase(env, "/rest/v1/rpc/accountbook_create_local_user_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_login_name: cleanLoginName,
      p_nickname: cleanDisplayName,
      p_credential_hash: hash,
      p_credential_salt: salt,
      p_credential_iterations: PASSWORD_KDF_ITERATIONS,
    }),
  });
  return Array.isArray(result) ? result[0] : result;
}

function classifyLocalSignupError(error) {
  const detail = safeError(error);
  if (/login_name_in_use|duplicate key|23505/i.test(detail)) {
    return { status: 409, code: "login_name_in_use", message: "이미 사용 중인 로그인 이름입니다. 다른 이름을 선택하세요." };
  }
  if (/invalid_login_name/i.test(detail)) {
    return { status: 400, code: "invalid_login_name", message: "로그인 이름은 공백을 제외하고 2자 이상 입력하세요." };
  }
  if (/invalid_credential/i.test(detail)) {
    return { status: 400, code: "invalid_credential", message: "비밀번호 정보를 안전하게 처리하지 못했습니다. 비밀번호를 다시 입력해 주세요." };
  }
  if (/PGRST202|42883|could not find (?:the )?function|accountbook_create_local_user_v227.*404/i.test(detail)) {
    return { status: 503, code: "signup_rpc_unavailable", message: "계정 생성 기능을 준비하지 못했습니다. V22.7 인증 SQL 적용과 PostgREST 스키마 새로고침 상태를 확인해 주세요." };
  }
  if (/42501|permission denied|insufficient_privilege/i.test(detail)) {
    return { status: 503, code: "signup_rpc_forbidden", message: "계정 생성 권한 설정을 확인해야 합니다. 관리자에게 인증 SQL 권한 점검을 요청해 주세요." };
  }
  if (/PGRST00[0-3]|Supabase (?:500|502|503|504)|timeout|fetch failed|network/i.test(detail)) {
    return { status: 503, code: "signup_service_unavailable", message: "계정 저장 서버가 일시적으로 응답하지 않습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { status: 500, code: "signup_failed", message: "계정을 만들지 못했습니다. 잠시 후 다시 시도해 주세요." };
}

async function handleMyLocalLogin(request, env) {
  const form = await request.formData();
  const nickname = String(form.get("login_name") || form.get("nickname") || "").trim().slice(0, 80);
  const accessCode = String(form.get("access_code") || "").trim();
  const inviteCode = String(form.get("invite_code") || "").trim().toUpperCase();
  // 로그인이 풀려 튕겨 온 사람은 비밀번호를 틀려도 복귀 주소를 잃으면 안 된다.
  const loginReturnTo = safeUserReturnPath(String(form.get("return_to") || ""), "");
  if (!nickname) return htmlResponse(renderUserLoginHtml(env, "로그인 이름을 입력하세요.", loginReturnTo), 400);
  if (accessCode.length < 4) return htmlResponse(renderUserLoginHtml(env, "비밀번호를 4자리 이상 입력하세요.", loginReturnTo), 400);
  const admission = await recordAuthAttempt(env, request, "/my/local-login-admission", false, {limit:40});
  if (!admission.allowed) return htmlResponse(renderUserLoginHtml(env, "로그인 요청이 잠시 제한되었습니다.", loginReturnTo), admission.unavailable ? 503 : 429);
  const clientSubject = trafficClientIp(request) + "|" + normalizeLocalLoginName(nickname) + "|" + trafficClientKey(request);
  const attempt = await recordAuthAttempt(env, request, "/my/local-login", false, {scope:"subject-client",key:clientSubject});
  if (attempt.unavailable) return htmlResponse(renderUserLoginHtml(env, "로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요."), 503);
  if (!attempt.allowed) return htmlResponse(renderUserLoginHtml(env, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요."), 429, { "retry-after": "900" });
  // V22.9.26: 로그인 이름 단위로도 센다. 클라이언트 키는 User-Agent 를 바꾸면 비껴가지만
  // 계정 단위 횟수는 어디서 보내든 같은 계정이면 함께 줄어든다.
  const accountKey = trafficClientIp(request) + "|" + normalizeLocalLoginName(nickname);
  const accountAttempt = await recordAuthAttempt(env, request, "/my/local-login", false, { scope: "account", key: accountKey, limit: boundedRuntimeNumber(env.AUTH_ACCOUNT_RATE_LIMIT, 10, 3, 50) });
  if (accountAttempt.unavailable) return htmlResponse(renderUserLoginHtml(env, "로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요."), 503);
  if (!accountAttempt.allowed) return htmlResponse(renderUserLoginHtml(env, "이 로그인 이름으로 시도가 너무 많습니다. 잠시 후 다시 시도하세요."), 429, { "retry-after": "900" });
  try {
    const user = await ensureLocalLoginUser(env, nickname, accessCode);
    if (!user?.id) return htmlResponse(renderUserLoginHtml(env, "로그인 이름 또는 비밀번호가 맞지 않습니다. 처음이라면 새 계정 만들기를 이용하세요.", loginReturnTo), 401);
    await recordAuthAttempt(env, request, "/my/local-login", true, {scope:"subject-client",key:clientSubject});
    await recordAuthAttempt(env, request, "/my/local-login", true, { scope: "account", key: accountKey });
    let location = loginReturnTo || "/my";
    if (inviteCode) {
      const joined = await joinHouseholdByCode(env, user.id, inviteCode);
      location = joined
        ? addQueryToUrl("/my", householdJoinFeedback(joined))
        : `/my/households?err=${encodeURIComponent("초대코드를 찾지 못했습니다. 로그인은 완료되었습니다.")}`;
    }
    const session = await makeUserSession(env, user.id);
    // V22.9.102: 로그인 이름으로 들어왔으면 내 계정 로그인 비밀번호가 있는 계정이다(가계부 기본 설정 띠의 비밀번호 항목 쿠키).
    // V22.9.104 L-3: 동의 기록을 한 번 읽어 홈 동의 팝업 쿠키(ab_cs=1/0)를 적는다. 읽지 못하면 남은 ab_cs 를 지운다(모름 = 팝업 없음).
    return redirectResponseWithCookies(location, [
      `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
      backupLoginKnownCookie(),
      await consentStateCookieFor(env, user.id),
    ]);
  } catch (err) {
    await recordAuthAttempt(env, request, "/my/local-login", true, {scope:"subject-client",key:clientSubject});
    await recordAuthAttempt(env, request, "/my/local-login", true, {scope:"account",key:accountKey});
    const missingSecret = /USER_SESSION_SECRET/.test(safeError(err));
    // V22.9.35: 로그인 처리 오류는 운영 이벤트에 남지 않아 원인을 볼 자리가 없었다(가입 오류는 local_signup_failed).
    rememberOpsEvent({ kind: "local_login_failed", severity: "error", path: "/my/local-login", method: "POST", detail: safeError(err) });
    return htmlResponse(renderUserLoginHtml(env, missingSecret ? "운영 보안키가 설정되지 않아 로그인할 수 없습니다." : "로그인을 처리하지 못했습니다. 잠시 후 다시 시도하세요."), missingSecret ? 503 : 500);
  }
}

async function handleMyLocalSignup(request, env) {
  const form = await request.formData();
  const loginName = String(form.get("login_name") || "").trim().slice(0, 80);
  const displayName = mergedMarkerFreeName(String(form.get("display_name") || loginName), 80);
  const accessCode = String(form.get("access_code") || "").trim();
  const confirm = String(form.get("access_code_confirm") || "").trim();
  const inviteCode = String(form.get("invite_code") || "").trim().toUpperCase();
  // V22.9.76 감사 F-9: 오류로 폼을 다시 그릴 때 비밀이 아닌 칸만 되돌려 준다(비밀번호 두 칸은 비운다).
  const keep = { login_name: loginName, display_name: String(form.get("display_name") || "").trim().slice(0, 80), invite_code: inviteCode };
  if (normalizeLocalLoginName(loginName).length < 2) return htmlResponse(renderUserLoginHtml(env, "로그인 이름은 2자 이상 입력하세요.", "", "signup", keep), 400);
  if (!displayName) return htmlResponse(renderUserLoginHtml(env, "가계부에 표시할 이름을 입력하세요.", "", "signup", keep), 400);
  if (accessCode.length < 8) return htmlResponse(renderUserLoginHtml(env, "새 비밀번호는 8자리 이상 입력하세요.", "", "signup", keep), 400);
  if (accessCode !== confirm) return htmlResponse(renderUserLoginHtml(env, "비밀번호 확인이 일치하지 않습니다.", "", "signup", keep), 400);
  // V22.9.95 R-9: 약관·개인정보처리방침 동의와 만 14세 이상 확인(동의 칸 consent=1) 없이는 계정을 만들지 않는다. 다른 칸 검사 뒤, 횟수 제한 전에 본다
  // (빠뜨린 칸 때문에 가입 시도 횟수를 쓰지 않게). 다시 그린 폼은 비밀이 아닌 칸만 되살리고 동의 칸은 비워 둔다.
  if (String(form.get("consent") || "") !== "1") return htmlResponse(renderUserLoginHtml(env, SIGNUP_CONSENT_REQUIRED_MESSAGE, "", "signup", keep), 400);
  const attempt = await recordAuthAttempt(env, request, "/my/local-signup", false, {scope:"client"});
  if (attempt.unavailable) return htmlResponse(renderUserLoginHtml(env, "계정 생성 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", "", "signup", keep), 503);
  if (!attempt.allowed) return htmlResponse(renderUserLoginHtml(env, "계정 생성 시도가 너무 많습니다. 잠시 후 다시 시도하세요.", "", "signup", keep), 429, { "retry-after": "900" });
  // V22.9.26: 가입은 성공해도 횟수를 지우지 않고, User-Agent 를 뺀 IP 단위 상한도 함께 둔다.
  // 예전에는 가입이 될 때마다 횟수가 지워져 한 클라이언트가 계정을 무한히 만들 수 있었다.
  const ipAttempt = await recordAuthAttempt(env, request, "/my/local-signup", false, { scope: "ip", limit: boundedRuntimeNumber(env.AUTH_SIGNUP_IP_LIMIT, 20, 5, 200) });
  if (ipAttempt.unavailable) return htmlResponse(renderUserLoginHtml(env, "계정 생성 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", "", "signup", keep), 503);
  if (!ipAttempt.allowed) return htmlResponse(renderUserLoginHtml(env, "계정 생성 시도가 너무 많습니다. 잠시 후 다시 시도하세요.", "", "signup", keep), 429, { "retry-after": "900" });
  let user = null;
  try {
    user = await createLocalLoginUser(env, loginName, displayName, accessCode);
    if (!user?.id) throw new Error("local_signup_failed");
  } catch (err) {
    const classified = classifyLocalSignupError(err);
    if (classified.status >= 500) { await recordAuthAttempt(env, request, "/my/local-signup", true, {scope:"client"}); }
    rememberOpsEvent({ kind: "local_signup_failed", severity: classified.status >= 500 ? "error" : "warn", path: "/my/local-signup", method: "POST", detail: `${classified.code}; ${safeError(err)}` });
    return htmlResponse(renderUserLoginHtml(env, classified.message, "", "signup", keep), classified.status);
  }

  const consentRecorded = await recordSignupConsent(env, user.id, "local");

  let session = "";
  try {
    session = await makeUserSession(env, user.id);
  } catch (err) {
    rememberOpsEvent({ kind: "local_signup_session_failed", severity: "error", path: "/my/local-signup", method: "POST", detail: safeError(err) });
    return htmlResponse(renderUserLoginHtml(env, "계정은 생성되었습니다. 자동 로그인 보안 설정을 확인한 뒤 기존 계정 로그인으로 접속해 주세요.", "", "signup"), 503);
  }

  let location = "/my/households?first=1";
  if (inviteCode) {
    try {
      const joined = await joinHouseholdByCode(env, user.id, inviteCode);
      location = joined
        ? addQueryToUrl("/my", householdJoinFeedback(joined))
        : `/my/households?first=1&msg=signup_created_invite_missing#create`;
    } catch (err) {
      rememberOpsEvent({ kind: "local_signup_invite_failed", severity: "warn", path: "/my/local-signup", method: "POST", detail: safeError(err) });
      location = isUncertainStorageWrite(err) ? "/my/households?first=1&err=db_write_unknown" : `/my/households?first=1&err=${encodeURIComponent("계정은 생성되었지만 초대 참여를 완료하지 못했습니다. 가계부 전환·추가에서 다시 참여해 주세요.")}`;
    }
  }
  // V22.9.104 L-3: 방금 남긴 동의 기록은 홈 동의 팝업 쿠키 ab_cs=1 로 이어진다(기록이 실패하면 적지 않는다).
  return redirectResponseWithCookies(location, [
    `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    consentRecorded ? consentStateCookie(true) : "",
  ]);
}

function kakaoLoginStatusBlock(env, returnTo = "", { consentError = "" } = {}) {
  const config = inspectKakaoLoginConfig(env);
  if (config.ready) {
    // V22.9.87 T-20: 카카오 로그인 버튼(§3-4: #FEE500 면, 검은 말풍선 심볼, 라벨 ‘카카오 로그인’). 시작 화면에서 첫 화면의 유일한 채운 버튼이다.
    // 예전 ‘가장 간편한 방법’ 안내 상자와 ‘다른 방법으로 접속’ 구분선은 없앴다. 로그인 이름 칸은 바로 아래 접힌 칸(로그인 이름으로 로그인)이다.
    // V22.9.95 R-9: 단추 위 동의 칸과 함께 그린다. 서버가 동의 없는 시작을 되돌린 화면이면 칸 아래에 오류를 적는다.
    return kakaoLoginButtonHtml(returnTo, { consentError });
  }
  if (!config.enabled) {
    return `<div class="warn"><b>카카오 로그인을 잠시 사용할 수 없어요</b><br/>기존 로그인 이름과 내 계정 로그인 비밀번호로 접속할 수 있습니다.</div><div class="mobileAccessHelp"><b>PC에서는 이미 사용 중인가요?</b><br/>PC의 전체 메뉴 → 내 계정·보안에서 한 번 설정한 뒤, 모바일에서 같은 로그인 이름과 비밀번호를 입력하세요.</div>`;
  }
  return `<div class="warn"><b>카카오 로그인 설정을 확인하고 있어요</b><br/>주소나 앱 설정이 맞기 전에는 오류 페이지로 이동하지 않도록 버튼을 숨깁니다.</div><div class="mobileAccessHelp"><b>지금 모바일에서 접속하려면</b><br/>PC의 전체 메뉴 → 내 계정·보안에서 계정 로그인 비밀번호를 설정한 뒤 아래 기존 계정 로그인을 사용하세요.</div>`;
}

async function handleMyBackupLoginPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  const first = url.searchParams.get("first") === "1";
  // V22.9.102: 카카오 연결 칸은 카카오 로그인 계정이 이미 있으면 ‘연결됨’으로만 보이고, 없을 때만 본인 확인 칸을 그린다.
  const [hasBackup, hasKakao, identity] = await Promise.all([
    hasBackupLoginIdentity(env, user),
    hasKakaoLoginIdentity(env, user).catch(() => false),
    fetchStrongIdentityForUser(env, "local", user.id),
  ]);
  const returnTo = safeUserReturnPath(url.searchParams.get("return_to") || "", first ? "/my/households" : "/my/households");
  // V22.9.102: 이 화면은 비밀번호 유무를 실제로 확인했으니 기본 설정 띠가 보는 쿠키(ab_bk=1/0)를 함께 적는다.
  return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName: identity?.login_name || identity?.provider_subject || user.nickname || "", first, hasBackup, hasKakao, returnTo, msg: url.searchParams.get("msg") || "", err: backupLoginErrorText(url.searchParams.get("err") || "") }), 200, { "set-cookie": backupLoginKnownCookie(hasBackup) });
}

async function handleMyBackupLoginSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  let hasBackup = false;
  try {
    hasBackup = await hasBackupLoginIdentity(env, user);
  } catch (err) {
    rememberOpsEvent({ kind: "backup_login_status_deferred", severity: "warn", path: "/my/backup-login", method: "POST", detail: safeError(err) });
  }
  const form = await request.formData();
  const loginName = String(form.get("login_name") || "").normalize("NFKC").trim().replace(/\s+/g, " ").slice(0, 80);
  const accessCode = String(form.get("access_code") || "").trim();
  const accessCode2 = String(form.get("access_code_confirm") || "").trim();
  const returnTo = safeUserReturnPath(form.get("return_to") || "", "/my/households");
  if (normalizeLocalLoginName(loginName).length < 2) return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, first: true, hasBackup: false, returnTo, err: "로그인 이름은 2자 이상 입력하세요." }), 400);
  if (accessCode.length < 8) return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, first: true, hasBackup: false, returnTo, err: "내 계정 로그인 비밀번호는 8자리 이상으로 입력하세요." }), 400);
  if (accessCode !== accessCode2) return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, first: true, hasBackup: false, returnTo, err: "확인 입력이 일치하지 않습니다." }), 400);
  const currentPassword = String(form.get("current_password") || "");
  const reauthenticated = await verifyCredentialProof(request, env, userId) || (currentPassword && await verifyPasswordReauth(request, env, userId, currentPassword));
  if (!reauthenticated) return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, hasBackup, returnTo, err: "현재 로그인 비밀번호 또는 원래 연결한 카카오 계정으로 먼저 본인 확인을 완료하세요." }), 403);
  try {
    await replaceLocalLoginForUser(env, loginName, accessCode, userId, { revokeSessions: true });
  } catch (err) {
    const detail = safeError(err);
    // V22.9.88 Y-3(Codex 지적): 응답을 잃은 변경은 이미 반영됐을 수 있다(그러면 예전 로그인이 모두 끊겨 이 기기도 로그아웃된다). 예전에는
    // ‘저장하지 못했습니다’라고 해 바뀐 비밀번호를 모르는 채 예전 비밀번호로 로그인하다 막혔다.
    if (isUncertainStorageWrite(err)) {
      rememberOpsEvent({ kind: "backup_login_save_unknown", severity: "warn", path: "/my/backup-login", method: "POST", detail });
      return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, first: true, hasBackup, returnTo, err: "비밀번호 변경 결과를 확인하지 못했습니다. 이미 바뀌었을 수 있어요. 이 화면을 다시 열어 로그인 화면이 나오면 새 비밀번호로 로그인하고, 그대로 열리면 바뀌지 않은 것이니 다시 저장해 주세요." }), 503);
    }
    const message = /login_name_in_use|duplicate key|409/i.test(detail) ? "이미 사용 중인 로그인 이름입니다." : "내 계정 로그인 비밀번호를 저장하지 못했습니다. V22.7 인증 마이그레이션 적용 상태를 확인하세요.";
    return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, first: true, hasBackup, returnTo, err: message }), 409);
  }
  // V22.9.88 Y-3: 여기서부터 비밀번호는 바뀌었고 예전 로그인은 모두 끊겼다. 이 기기의 새 로그인을 만들지 못하면(세션 판 조회 실패 등) 저장 실패가
  // 아니라 ‘바꿨으니 새 비밀번호로 다시 로그인’이라고 안내하고, 끊긴 쿠키를 지운다.
  let session = "";
  try { session = await makeUserSession(env, userId); }
  catch (err) {
    rememberOpsEvent({ kind: "backup_login_session_reissue_failed", severity: "warn", path: "/my/backup-login", method: "POST", detail: safeError(err) });
    return htmlResponse(renderMyBackupLoginHtml({ env, user, loginName, hasBackup: true, returnTo, msg: "backup_login_saved_relogin" }), 200, {
      "set-cookie": "ab_user=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
    });
  }
  return redirectResponseWithCookies(addQueryToUrl(returnTo, { msg: "backup_login_saved" }), [
    `ab_user=${encodeURIComponent(session)}; Path=/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax`,
    backupLoginKnownCookie(),
  ]);
}

// V22.9.102: 주소의 오류 코드(account_reauth_required 등)를 그대로 보여 주지 않고 사람 말로 바꾼다. 모르는 코드는 일반 문장이다.
function backupLoginErrorText(code = "") {
  const known = {
    account_reauth_required: "현재 로그인 비밀번호가 맞지 않거나 본인 확인이 아직이에요. 현재 비밀번호를 다시 입력하거나 원래 연결한 카카오 계정으로 본인 확인을 해 주세요.",
    credential_reauth_required: "로그인 이름·비밀번호를 바꾸려면 먼저 본인 확인이 필요해요. 현재 비밀번호를 입력하거나 원래 연결한 카카오 계정으로 확인해 주세요.",
    kakao_link_failed: "카카오 계정을 연결하지 못했어요. 잠시 후 다시 시도해 주세요.",
  };
  const key = String(code || "").trim();
  if (!key) return "";
  return known[key] || "요청을 처리하지 못했어요. 다시 시도해 주세요.";
}

function renderMyBackupLoginHtml({ env, user, loginName = "", first = false, hasBackup = false, hasKakao = false, returnTo = "/my/households", msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const userName = escapeHtml(user?.nickname || "사용자");
  const safeReturn = escapeHtml(safeUserReturnPath(returnTo, "/my/households"));
  const reauthVerified = msg === "account_reauth_verified";
  // V22.9.102(사용자 2026-11-05 “카카오 연결 전 현재 비밀번호 확인 입력란 배치 엉망”): 한 장에 흩어져 있던 칸을 ‘1 본인 확인 → 2 로그인 이름·비밀번호’
  // 두 단계 묶음으로 바꾸고, 카카오 연결은 따로 한 칸이다 — 카카오 로그인 계정이 있으면 ‘연결됨’, 없으면 현재 비밀번호 칸(.field)과 단추, 본인 확인이 끝난
  // 뒤(5분)에는 연결 단추만 보인다. 주소의 오류 코드는 backupLoginErrorText 가 사람 말로 바꾼다.
  const kakaoCard = hasKakao
    ? `<div class="ok"><b>카카오 계정이 연결되어 있어요.</b><br/>카카오 로그인으로도 이 계정에 들어올 수 있습니다.</div>`
    : reauthVerified
      ? `<div class="ok"><b>본인 확인이 끝났어요.</b><br/>5분 안에 아래 단추로 카카오 계정을 연결하세요.</div><p><a class="btn" href="/my/kakao-link">카카오 로그인 연결하기</a></p>`
      : `<p class="muted">카카오 계정을 연결하면 다음부터 카카오 로그인으로 바로 들어올 수 있어요. 먼저 현재 로그인 비밀번호로 본인 확인을 합니다.</p><form method="post" action="/my/account-reauth"><div class="field"><label for="kakaoLinkPassword">현재 로그인 비밀번호</label><input id="kakaoLinkPassword" name="current_password" type="password" autocomplete="current-password" required/></div><button type="submit">본인 확인 후 카카오 연결</button></form>`;
  // V22.9.79 F-4: "현재 표시 이름" 상자(.identity)가 줄바꿈 없는 긴 영문 닉네임(글자 끝 R=492 @360px)을 상자 밖으로 흘렸다 → overflow-wrap:anywhere.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 내 계정·보안</title><style>
*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 52%,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:18px 18px 110px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.badge{display:inline-flex;background:#FEE500;color:#191919;border-radius:999px;padding:7px 11px;font-size:13px;font-weight:1000}.hero h1{font-size:28px;letter-spacing:-.05em}.muted{color:#667085;line-height:1.65}.field{display:grid;gap:7px;margin:14px 0}.field label{font-size:13px;font-weight:1000;color:#475467}.field input{width:100%;height:50px;border:1px solid #d0d5dd;border-radius:14px;padding:0 13px;font:inherit}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:50px;border:0;border-radius:14px;background:#111827;color:#fff!important;font-weight:1000;padding:0 16px;text-decoration:none;width:100%}.btn:disabled,button:disabled{cursor:not-allowed;opacity:.55}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:16px;padding:13px;line-height:1.6}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:16px;padding:13px;line-height:1.6}.guide{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}.identity{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:13px;color:#475467;line-height:1.6;overflow-wrap:anywhere}.credentialFeedback{min-height:20px;margin:-4px 0 12px;color:#667085;font-size:13px;line-height:1.45}.credentialFeedback[data-state="error"]{color:#b42318}.credentialFeedback[data-state="success"]{color:#067647;font-weight:800}.step{border:1px solid #e8edf4;border-radius:18px;padding:6px 14px 14px;margin:14px 0;min-width:0}.step legend{display:flex;align-items:center;gap:8px;padding:0 6px;font-weight:1000}.stepNo{display:inline-flex;width:24px;height:24px;border-radius:50%;background:#111827;color:#fff;font-size:13px;align-items:center;justify-content:center}.step .muted{margin:8px 0 0}.step .btn{margin-top:8px}.card h2{margin:0 0 8px}@media(max-width:620px){.wrap{padding:12px 12px 110px}.hero,.card{padding:18px;border-radius:20px}.hero h1{font-size:24px}}
</style></head><body><main class="wrap"><section class="hero"><span class="badge">${title}</span><h1>내 계정·보안</h1><p class="muted">이 비밀번호는 가계부마다 만드는 비밀번호가 아닙니다. 모든 가계부에 공통인 내 계정 로그인·복구 수단이며 다른 참여자와 공유하지 않습니다.</p>${hasBackup ? `<div class="ok">내 계정 로그인 비밀번호가 설정되어 있습니다. 새로 저장하면 이전 비밀번호는 사용할 수 없게 바뀝니다.</div>` : ""}${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${escapeHtml(err)}</div>` : ""}</section><section class="card"><h2>로그인 이름·비밀번호</h2><div class="identity"><b>현재 표시 이름</b><br/>${userName}<br/><span class="muted">표시 이름은 내 프로필에서 별도로 변경합니다. 여기서 정하는 로그인 이름과는 다릅니다.</span></div><form method="post" action="/my/backup-login"><input type="hidden" name="return_to" value="${safeReturn}"/><fieldset class="step"><legend><span class="stepNo">1</span>본인 확인</legend><p class="muted">${hasBackup ? "바꾸려면 현재 로그인 비밀번호를 적거나, 원래 연결한 카카오 계정으로 본인 확인을 합니다." : "처음 정할 때는 원래 연결한 카카오 계정으로 본인 확인을 합니다. 현재 비밀번호 칸은 비워 두세요."}</p><div class="field"><label for="currentPassword">현재 로그인 비밀번호</label><input id="currentPassword" name="current_password" type="password" autocomplete="current-password"/></div><a class="btn secondary" href="/auth/kakao/start?reauth=credential-change&amp;return_to=%2Fmy%2Fbackup-login">원래 연결한 카카오 계정으로 본인 확인</a></fieldset><fieldset class="step"><legend><span class="stepNo">2</span>로그인 이름·비밀번호</legend><div class="field"><label for="backupLoginName">로그인 이름</label><input id="backupLoginName" name="login_name" value="${escapeHtml(loginName || user?.nickname || "")}" placeholder="로그인할 때 사용할 이름" autocomplete="username" minlength="2" required/></div><div class="field"><label for="backupPassword">내 계정 로그인 비밀번호</label><input id="backupPassword" name="access_code" type="password" minlength="8" autocomplete="new-password" placeholder="8자리 이상" aria-describedby="backupPasswordStatus" required/></div><div class="field"><label for="backupPasswordConfirm">내 계정 로그인 비밀번호 확인</label><input id="backupPasswordConfirm" name="access_code_confirm" type="password" minlength="8" autocomplete="new-password" placeholder="같은 비밀번호를 한 번 더 입력" aria-describedby="backupPasswordStatus" required/></div><div id="backupPasswordStatus" class="credentialFeedback" data-state="hint" role="status" aria-live="polite">비밀번호는 8자리 이상 입력해 주세요.</div><button id="backupPasswordSubmit" type="submit">저장하고 이전 화면으로</button></fieldset></form><p><a class="btn secondary" href="${safeReturn}">취소하고 이전 화면으로</a></p></section><section class="card"><h2>카카오 로그인 연결</h2>${kakaoCard}</section><section class="guide"><b>이탈 방지 안내</b><br/>저장하면 현재 세션을 새 보안 버전으로 갱신한 뒤 지금 보던 화면으로 자동 복귀합니다.</section><section class="card"><h2>카카오 챗봇 기록 계정</h2>${renderKakaoClaimForm("", false)}</section><section class="card" aria-labelledby="logoutTitle"><h2 id="logoutTitle">로그아웃</h2><p class="muted">이 기기에서 로그인을 끝냅니다. 여러 사람이 쓰는 PC 라면 사용 뒤 꼭 로그아웃하세요.</p><form method="post" action="/my/logout"><button type="submit" class="secondary">로그아웃</button></form></section></main><script id="credentialMatchRuntime">(${passwordMatchFeedbackClientMain.toString()})({passwordId:"backupPassword",confirmationId:"backupPasswordConfirm",statusId:"backupPasswordStatus",buttonId:"backupPasswordSubmit"});</script></body></html>`;
}

function renderKakaoLoginCheckHtml(env, url) {
  const title = escapeHtml(appName(env));
  const config = inspectKakaoLoginConfig(env);
  const originMatch = !config.issues.includes("redirect_origin_mismatch") && !!config.publicBase && !!config.redirectUri;
  const redirectFormatOk = !config.issues.includes("redirect_uri_invalid") && !!config.redirectUri;
  const issueLabels = {
    rest_api_key_missing: "REST API 키 없음",
    public_base_url_missing: "공개 기준 주소 없음",
    public_base_url_invalid: "공개 기준 주소 형식 오류",
    redirect_uri_missing: "Redirect URI 없음",
    redirect_uri_invalid: "Redirect URI 형식 오류",
    redirect_origin_mismatch: "공개 주소와 Redirect URI 호스트 불일치",
    client_secret_missing: "활성화된 Client Secret 없음",
  };
  const issues = config.issues.map((item) => issueLabels[item] || item).join(", ");
  const row = (name, ok, detail) => `<tr><td><b>${escapeHtml(name)}</b></td><td><span class="${ok ? "ok" : "bad"}">${ok ? "정상" : "확인"}</span></td><td>${detail}</td></tr>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 카카오 로그인 점검</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:900px;margin:0 auto;padding:18px}.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:12px;text-align:left;vertical-align:top}.ok{color:#166534;background:#dcfce7;border-radius:999px;padding:5px 9px;font-weight:1000}.bad{color:#991b1b;background:#fee2e2;border-radius:999px;padding:5px 9px;font-weight:1000}code{background:#f1f5f9;border-radius:8px;padding:2px 6px;overflow-wrap:anywhere}.btn{display:inline-flex;background:#111827;color:#fff!important;text-decoration:none;border-radius:14px;padding:11px 14px;font-weight:1000}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:13px;line-height:1.6}</style></head><body><main class="wrap"><section class="card"><h1>카카오 로그인 점검</h1><p>카카오 로그인은 명시적으로 켜고, 공개 주소와 Redirect URI가 정확히 일치할 때만 사용자에게 표시됩니다.</p><table><tbody>${row("KAKAO_LOGIN_ENABLED", config.enabled, "명시적으로 <code>1</code> 설정")}${row("KAKAO_REST_API_KEY", config.apiKeyConfigured, "카카오 앱의 REST API 키 설정")}${row("PUBLIC_BASE_URL", !!config.publicBase && !config.issues.includes("public_base_url_invalid"), `<code>${escapeHtml(config.publicBase || "미설정")}</code>`)}${row("Redirect URI 형식", redirectFormatOk, `<code>${escapeHtml(config.redirectUri || "미설정")}</code>`)}${row("공개 주소와 호스트 일치", originMatch, originMatch ? "같은 HTTPS 호스트" : "PUBLIC_BASE_URL과 Redirect URI의 호스트를 같게 설정")}${row("Client Secret", !config.clientSecretRequired || config.clientSecretConfigured, config.clientSecretRequired ? "필수 모드: Secret 설정 필요" : "카카오 앱에서 Client Secret을 켰을 때만 설정")}${row("사용 가능 상태", config.ready, config.ready ? "로컬 설정 일치 · 로그인 버튼 표시" : escapeHtml(issues || "기능이 꺼져 있음"))}</tbody></table><p class="warn"><b>마지막 외부 확인</b><br/>위 Redirect URI와 완전히 같은 주소를 동일한 카카오 앱의 Redirect URI 목록에 등록해야 합니다. 이 화면에서는 카카오 관리자센터 등록 여부까지 자동 확인할 수 없습니다.</p><p><a class="btn" href="/my">로그인 화면으로 돌아가기</a></p></section></main></body></html>`;
}
// @build:exports-start
export {
  SIGNUP_CONSENT_REQUIRED_MESSAGE, addQueryToUrl, handleMyBackupLoginPage, handleMyBackupLoginSave,
  handleMyLocalLogin, handleMyLocalSignup, kakaoLoginStatusBlock, recordSignupConsent,
  renderKakaoLoginCheckHtml, renderMyStartChoiceHtml,
};
// @build:exports-end
