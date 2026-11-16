// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { safeError, withHouseholdDatabaseLease } from "../runtime/leases.js";
import { htmlResponse, redirectResponse, redirectResponseWithCookies } from "../runtime/http.js";
import { fetchHouseholdMembers } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import {
  clearHouseholdDeleteReauthCookie, hasBackupLoginIdentity, hasKakaoLoginIdentity,
  passwordReauthErrorCodeV229126, verifyHouseholdDeleteReauth, verifyPasswordReauth,
} from "../auth/identity-reauth.js";
import { fetchUserById, withKakaoUserLifecycleLease } from "../data/users-household-create.js";
import {
  fetchSupporterFlags, supporterBadgeHtml, supporterHeadHtml, supporterHtmlAttr,
} from "./supporters.js";
import {
  MEMBER_POLICY_RECORD_EDIT, MEMBER_POLICY_RECORD_ONLY, canManageMyHousehold,
  fetchHouseholdMemberPolicy, getMySelectedHousehold, householdChoiceLabelV229118,
  householdIdWasRemembered, householdNotFoundResponse, memberPolicyDescription, memberPolicyLabel,
  myAccessStatusResponse, saveHouseholdMemberPolicy,
} from "./access-control.js";
import { householdPageMessage } from "./households-lifecycle.js";
import { withSupporterAccentCookieV229121 } from "./supporter-accent.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { markKakaoChatFirstHistory } from "../kakao/identity-chat-first.js";
import {
  getHouseholdMemberRoleStrict, isHouseholdRoleCheckFailure,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, jsonForInlineScript, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleMyMembersPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { households, selected, restricted, invalidRequested } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (invalidRequested && households.length && !householdIdWasRemembered(request)) return householdNotFoundResponse({ env, user, requestedId: invalidRequested });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
  if (!canManageMyHousehold(selected.role)) return myAccessStatusResponse({ env, user, household: selected, role: selected.role, month, manageOnly: true, screen: "members" });
  // V22.9.43: 구성원 권한은 참여자 목록과 함께 읽는다. 읽지 못하면 값을 추측하지 않고 확인 불가로 그린다.
  // V22.9.95 후원: 구성원 id 를 모아 후원자 표시를 한 번에 읽는다(구성원 목록 뒤 한 번, 권한 읽기와는 나란히). 읽지 못하면 배지 없이 그린다.
  const [[members, supporterFlags], memberPolicy] = await Promise.all([
    fetchHouseholdMembers(env, selected.id).then(async (rows) => [rows, await fetchSupporterFlags(env, safeArray(rows).map((m) => m.user_id)).catch(() => new Map())]),
    fetchHouseholdMemberPolicy(env, selected.id).catch(() => ""),
  ]);
  // V22.9.121: 보는 사람도 구성원이라 위 조회에 들어 있다 → 포인트 색 쿠키(ab_sp)도 맞춘다(추가 조회 없음). 구성원이 50명을 넘어
  // 보는 사람의 표시를 읽지 않았으면(fetchSupporterFlags 는 앞 50명만 읽는다) 쿠키를 그대로 둔다.
  const viewerFlagRead = [...new Set(safeArray(members).map((m) => String(m?.user_id || "").trim()).filter(Boolean))].slice(0, 50).includes(String(userId));
  const transferReauth = await ownerTransferReauthStateV229126(request, env, String(userId), user, selected, members);
  return withSupporterAccentCookieV229121(request, htmlResponse(renderMyMembersHtml({ env, user, month, households, selected, members, memberPolicy, supporterFlags, transferReauth, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" })), viewerFlagRead ? supporterFlags instanceof Map && supporterFlags.has(String(userId)) : null);
}

// V22.9.126 FC-9: 양도 칸에 가계부 삭제 화면과 같은 본인 확인 칸을 그리려고, 소유자가 보는 화면에 양도할 카드가 있을 때만 로그인 수단과
// 카카오 본인 확인 표(용도 owner-transfer)를 읽는다(가계부 전환·추가 화면의 삭제 칸과 같은 읽기).
async function ownerTransferReauthStateV229126(request, env, userId, user, selected, members) {
  if (String(selected?.role || "").toLowerCase() !== "owner") return null;
  if (!safeArray(members).some((m) => ["admin", "member"].includes(String(m?.role || "")))) return null;
  const [hasLocalLogin, hasKakaoLogin, kakaoVerified] = await Promise.all([
    hasBackupLoginIdentity(env, user),
    hasKakaoLoginIdentity(env, user),
    verifyHouseholdDeleteReauth(request, env, userId, selected.id, "owner-transfer"),
  ]);
  // V22.9.126 FC-9: 카카오 본인 확인 시작은 카카오톡 인앱 브라우저에서 막힌다(kakao-oauth.js 와 같은 판정) — 그 화면에서는 갈 길을 따로 적는다.
  const inApp = /KAKAOTALK/i.test(request.headers.get("user-agent") || "");
  return { hasLocalLogin, hasKakaoLogin, kakaoVerified, inApp };
}

// V22.9.126 FC-9: 가계부 삭제(households-lifecycle.js handleMyHouseholdDelete)와 같은 본인 확인. 로그인 비밀번호가 있으면 비밀번호, 아니면 카카오 본인
// 확인 표(용도 owner-transfer — 삭제용 표로는 안 된다). 시도 제한도 삭제와 같은 것을 쓴다. 통과하면 빈 값, 아니면 안내 코드(확인을 못 하면 양도하지 않는다).
async function ownerTransferReauthErrorV229126(request, env, userId, householdId, accessCode) {
  const user = await fetchUserById(env, userId);
  const lookup = {};
  const [hasLocalLogin, kakaoReauthVerified] = await Promise.all([
    hasBackupLoginIdentity(env, user, lookup),
    verifyHouseholdDeleteReauth(request, env, userId, householdId, "owner-transfer"),
  ]);
  const reauthWhy = {};
  const localVerified = hasLocalLogin && accessCode ? await verifyPasswordReauth(request, env, userId, accessCode, reauthWhy) : false;
  if (localVerified || kakaoReauthVerified) return "";
  if (hasLocalLogin && accessCode) return passwordReauthErrorCodeV229126(reauthWhy.reason);
  // V22.9.126 FC-9: 로그인 수단을 읽지 못해 비밀번호를 대조하지 못했으면 ‘잠시 후 다시’ 로 알린다(양도는 하지 않는다).
  return accessCode && lookup.unavailable ? "password_reauth_unavailable" : "owner_transfer_reauth_required";
}

// V22.9.43: 구성원 권한(기록만/기록·수정) 저장. 소유자만 바꾸며, 결과는 참여자 화면의 같은 칸으로 돌아가 알린다.
async function handleMyMemberPolicySave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const mode = String(form.get("mode") || "");
  const back = (extra) => `/my/members?household_id=${encodeURIComponent(householdId)}&month=${encodeURIComponent(month)}&${extra}#member-policy`;
  if (!householdId || ![MEMBER_POLICY_RECORD_ONLY, MEMBER_POLICY_RECORD_EDIT].includes(mode)) return redirectResponse(back("err=member_policy_failed"));
  try {
    const result = await saveHouseholdMemberPolicy(env, householdId, userId, mode);
    if (!result?.ok) return redirectResponse(back(`err=${result?.error === "member_policy_owner_only" ? "member_policy_owner_only" : "member_policy_failed"}`));
    return redirectResponse(back("msg=member_policy_saved"));
  } catch (err) {
    rememberOpsEvent({ kind: "member_policy_save_failed", severity: "warn", path: "/my/member-policy/save", method: "POST", detail: safeError(err) });
    return redirectResponse(back("err=member_policy_failed"));
  }
}

// V22.9.115(사용자 결정 2026-11-09 "소유자는 양도 가능하도록"): 소유자 양도. 소유자만 하고, 대상은 이 가계부의 관리자·구성원(승인 대기·조회 전용·이용 제한은 먼저 권한을 바꾼다).
// 사용자 잠금(둘)·가계부 잠금 안에서 두 역할을 다시 읽고, 대상을 먼저 소유자로 올린 뒤(현재 역할 조건부 PATCH) 나를 관리자로 내린다(role=eq.owner 조건부 PATCH).
// 두 번째 PATCH 가 실패하면 소유자가 둘 남는다 → owner_transfer_partial 로 알리고, 같은 대상에게 다시 누르면 대상은 이미 소유자라 올리기를 건너뛰고 나만 내린다(복구).
// 반대 순서(나를 먼저 내림)는 실패 때 소유자가 없는 가계부를 남기므로 쓰지 않는다. 단톡방 연결 항목의 linked_by 는 표시용 이력이라 바꾸지 않는다. 새 SQL 없음.
async function handleMyOwnerTransfer(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const targetId = String(form.get("user_id") || "").trim();
  const accessCode = String(form.get("access_code") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = (query) => `/my/members?household_id=${encodeURIComponent(householdId)}&month=${encodeURIComponent(month)}&${query}`;
  if (!householdId || !targetId) return redirectResponse(back("err=owner_transfer_target_invalid"));
  if (targetId === String(userId)) return redirectResponse(back("err=owner_transfer_self"));
  const rowPath = (uid, condition = "") => `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(uid)}${condition}&select=user_id,role`;
  const patchRole = async (uid, condition, role) => {
    const rows = await supabase(env, rowPath(uid, condition), { method: "PATCH", headers: { Prefer: "return=representation" }, body: JSON.stringify({ role }) });
    return Array.isArray(rows) && rows.length === 1 && String(rows[0].user_id || "") === uid && String(rows[0].role || "") === role;
  };
  try {
    // V22.9.126 FC-9(사용자 결정 2026-11-16 "소유자 양도 재확인도 이번에 넣고"): 세션만으로 양도되어, 소유자가 로그인해 둔 기기를 쓰는 구성원이 자기에게
    // 양도한 뒤 가계부를 지울 수 있었다. 잠금 전에 역할을 먼저 보고(관리자·구성원은 예전 안내 그대로) 삭제와 같은 본인 확인을 받는다. 잠금 안의 확인은 그대로다.
    const [actorRoleBefore, targetRoleBefore] = await Promise.all([getHouseholdMemberRoleStrict(env, String(userId), householdId), getHouseholdMemberRoleStrict(env, targetId, householdId)]);
    if (actorRoleBefore !== "owner") return redirectResponse(back("err=owner_transfer_not_owner"));
    if (!["admin", "member", "owner"].includes(targetRoleBefore)) return redirectResponse(back("err=owner_transfer_target_invalid"));
    const reauthError = await ownerTransferReauthErrorV229126(request, env, String(userId), householdId, accessCode);
    if (reauthError) return redirectResponse(back(`err=${reauthError}`));
    const outcome = await withKakaoUserLifecycleLease(env, [String(userId), targetId].sort(), async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
      const assertFresh = () => { lifecycleFresh(); householdFresh(); };
      const [actorRole, targetRole] = await Promise.all([getHouseholdMemberRoleStrict(env, String(userId), householdId), getHouseholdMemberRoleStrict(env, targetId, householdId)]);
      if (actorRole !== "owner") return { code: "owner_transfer_not_owner" };
      if (!["admin", "member", "owner"].includes(targetRole)) return { code: "owner_transfer_target_invalid" };
      assertFresh();
      if (targetRole !== "owner") {
        await markKakaoChatFirstHistory(env, targetId);
        assertFresh();
        if (!(await patchRole(targetId, `&role=eq.${encodeURIComponent(targetRole)}`, "owner"))) throw new Error("owner_transfer_promote_not_applied");
      }
      assertFresh();
      let demoted = false;
      try { demoted = await patchRole(String(userId), "&role=eq.owner", "admin"); }
      catch (err) {
        rememberOpsEvent({ kind: "owner_transfer_partial", severity: "error", path: "/my/household/transfer-owner", method: "POST", detail: safeError(err) });
        return { code: "owner_transfer_partial" };
      }
      if (!demoted) {
        rememberOpsEvent({ kind: "owner_transfer_partial", severity: "error", path: "/my/household/transfer-owner", method: "POST", detail: "demote_not_applied" });
        return { code: "owner_transfer_partial" };
      }
      rememberOpsEvent({ kind: "owner_transferred", severity: "info", path: "/my/household/transfer-owner", method: "POST", detail: targetRole === "owner" ? "recovered_partial_transfer" : `from_${targetRole}` });
      return { code: "owner_transferred" };
    }));
    // V22.9.126 FC-9: 다 끝나면 카카오 본인 확인 표를 지운다(쓴 표). 부분 실패면 남겨 5분 안에 다시 누르는 복구가 되게 한다.
    if (outcome.code === "owner_transferred") return redirectResponseWithCookies(back("msg=owner_transferred"), [clearHouseholdDeleteReauthCookie()]);
    return redirectResponse(back(`err=${outcome.code}`));
  } catch (err) {
    rememberOpsEvent({ kind: "owner_transfer_failed", severity: "warn", path: "/my/household/transfer-owner", method: "POST", detail: safeError(err) });
    const code = isUncertainStorageWrite(err) ? "db_write_unknown" : isHouseholdRoleCheckFailure(err) ? "household_role_check_failed" : "owner_transfer_failed";
    return redirectResponse(back(`err=${code}`));
  }
}

function renderMemberPolicySection({ selected, month, memberPolicy = "" }) {
  const isOwner = String(selected.role || "").toLowerCase() === "owner";
  const intro = `<p class="muted">단톡방에 연결된 가계부는 그 방에서 봇을 부르거나 거래를 보낸 사람이 승인 없이 구성원이 됩니다. 이 설정은 그렇게 참여한 사람과 초대코드로 들어온 구성원 모두에게 적용되고, 소유자·관리자는 언제나 모든 기록을 고칠 수 있습니다.</p>`;
  if (!memberPolicy) return `<section class="card" id="member-policy"><h2>구성원 권한</h2>${intro}<p class="error">구성원 권한을 확인하지 못했습니다. 기존 권한은 그대로이니 잠시 후 새로고침해 주세요.</p></section>`;
  if (!isOwner) return `<section class="card" id="member-policy"><h2>구성원 권한</h2>${intro}<p><b>현재: ${escapeHtml(memberPolicyLabel(memberPolicy))}</b> · ${escapeHtml(memberPolicyDescription(memberPolicy))}</p><p class="muted">구성원 권한은 소유자만 바꿀 수 있습니다.</p></section>`;
  const option = (mode) => `<label class="policyOption"><input type="radio" name="mode" value="${mode}"${memberPolicy === mode ? " checked" : ""}/><span><b>${escapeHtml(memberPolicyLabel(mode))}</b><small>${escapeHtml(memberPolicyDescription(mode))}</small></span></label>`;
  return `<section class="card" id="member-policy"><h2>구성원 권한</h2>${intro}<form method="post" action="/my/member-policy/save" class="policyForm"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/>${option(MEMBER_POLICY_RECORD_EDIT)}${option(MEMBER_POLICY_RECORD_ONLY)}<button type="submit">권한 저장</button></form><p class="muted">카카오톡에서는 ‘구성원 권한 기록만’ 또는 ‘구성원 권한 기록 수정’으로도 바꿀 수 있습니다.</p></section>`;
}

function renderMyMembersHtml({ env, user = null, month, households, selected, members = [], memberPolicy = "", msg = "", err = "", supporterFlags = null, transferReauth = null }) {
  const supporterIds = supporterFlags instanceof Map ? supporterFlags : new Map();
  const supporterBadges = safeArray(members).some((m) => supporterIds.has(String(m.user_id || "")));
  // V22.9.95 후원: 보는 사람도 구성원이라 같은 조회에 들어 있다. 후원자면 이 화면에도 고른 포인트 색을 맞춘다(추가 조회 없음).
  const supporterViewer = supporterIds.has(String(user?.id || ""));
  const title = escapeHtml(appName(env));
  const hh = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const returnTo = `/my/members?${hh}`;
  const opts = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(householdChoiceLabelV229118(h, households) || h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(householdChoiceLabelV229118(h, households) || h.name)} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const viewerIsOwner = String(selected.role || "").toLowerCase() === "owner";
  // V22.9.126 FC-9: 양도 칸 = 가계부 삭제 칸과 같은 본인 확인(카카오 확인이 끝났으면 그 표시, 비밀번호가 있으면 비밀번호 칸 + 카카오 단추,
  // 카카오만 있으면 카카오 단추, 둘 다 없으면 웹 연결 코드로 첫 비밀번호를 정하는 길). 카카오 확인을 마치면 이 화면으로 돌아온다.
  const reauth = transferReauth || {};
  const transferKakaoUrl = `/auth/kakao/start?reauth=owner-transfer&household_id=${encodeURIComponent(selected.id)}&return_to=${encodeURIComponent(returnTo)}`;
  const transferKakaoButton = reauth.hasKakaoLogin ? `<a class="reauthButton" href="${escapeHtml(transferKakaoUrl)}">카카오 계정으로 본인 확인</a>` : "";
  const transferBox = (m) => {
    const form = (field) => `<form method="post" action="/my/household/transfer-owner" class="transferForm" onsubmit="return confirm('이 참여자에게 소유자를 양도할까요? 나는 관리자가 되고, 구성원 권한·가계부 삭제·소유자 양도는 이 참여자만 할 수 있게 됩니다.')"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/>${field}<button class="transferButton" type="submit">소유자 양도</button></form>`;
    if (reauth.kakaoVerified) return `<div class="transferBox">${form(`<div class="reauthOk">카카오 계정 본인 확인 완료 · 5분 동안 유효</div>`)}</div>`;
    if (reauth.hasLocalLogin) return `<div class="transferBox">${form(`<label>내 계정 로그인 비밀번호<input name="access_code" type="password" autocomplete="current-password" required/></label>`)}${transferKakaoButton ? `<div class="orText">또는</div>${transferKakaoButton}` : ""}</div>`;
    if (transferKakaoButton) return `<div class="transferBox"><p class="muted">소유자를 양도하려면 먼저 이 계정에 연결된 카카오 계정으로 본인 확인을 완료하세요. 확인 후 양도 단추가 열립니다.${reauth.inApp ? " 카카오톡 안에서는 카카오 본인 확인이 열리지 않아요. Chrome·Safari에서 ‘카카오 로그인’으로 로그인한 뒤 ‘참여자·초대’에서 이 단추를 눌러 주세요." : ""}</p>${transferKakaoButton}</div>`;
    // V22.9.126 FC-9 2차: 채팅만 쓰는 소유자(비밀번호·카카오 로그인 없음)가 실제로 갈 수 있는 길 — 웹 연결 코드(5분 본인 확인) → 내 계정·보안에서
    // 첫 비밀번호 저장 → 이 화면으로 돌아와 그 비밀번호로 양도. 단추는 코드 칸을 열고, 코드 뒤 내 계정·보안, 저장 뒤 이 화면으로 돌아오게 한다.
    const transferClaimUrl = `/my/kakao-claim?auto=0&return_to=${encodeURIComponent(`/my/backup-login?return_to=${encodeURIComponent(returnTo)}`)}#kakao-claim-start`;
    return `<div class="transferBox"><p class="muted">소유자를 양도하려면 내 계정 로그인 비밀번호가 필요해요. 카카오 1:1 채팅에서 ‘웹 가계부 열기’를 보내 웹 연결 코드를 받은 뒤, 아래 ‘웹 연결 코드 넣기’에서 코드를 붙여 넣으세요. 이어서 열리는 ‘내 계정·보안’에서 5분 안에 로그인 이름과 비밀번호를 저장하면 이 화면으로 돌아와 그 비밀번호로 양도할 수 있어요.</p><a class="reauthButton" href="${escapeHtml(transferClaimUrl)}">웹 연결 코드 넣기</a></div>`;
  };
  const cards = safeArray(members).map((m) => {
    const role = String(m.role || "member");
    const owner = role === "owner";
    const roleForm = owner ? `<span class="ownerBadge">소유자</span>` : `<form method="post" action="/admin/member/update" class="roleForm"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/><select name="role"><option value="member"${role === "member" ? " selected" : ""}>구성원 · 기록 가능</option><option value="viewer"${role === "viewer" ? " selected" : ""}>조회 전용</option><option value="admin"${role === "admin" ? " selected" : ""}>관리자</option><option value="pending"${role === "pending" ? " selected" : ""}>승인 대기</option><option value="blocked"${role === "blocked" ? " selected" : ""}>이용 제한</option></select><button type="submit">권한 저장</button></form>`;
    // V22.9.115: 소유자 양도 단추(소유자가 보는 화면의 관리자·구성원 카드). 승인 대기·조회 전용·이용 제한은 먼저 권한을 바꾼 뒤 양도한다.
    const transfer = owner || !viewerIsOwner || !["admin", "member"].includes(role) ? "" : transferBox(m);
    const remove = owner ? "" : `<form method="post" action="/admin/member/remove" onsubmit="return confirm('이 참여자를 가계부에서 내보낼까요?')"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/><button class="danger" type="submit">내보내기</button></form>`;
    return `<article class="memberCard"><div class="memberHead"><div class="avatar">${escapeHtml(String(m.nickname || "구").slice(0, 1))}</div><div><b>${escapeHtml(m.nickname || "구성원")}${supporterIds.has(String(m.user_id || "")) ? supporterBadgeHtml() : ""}</b><span>${escapeHtml(userHouseholdRoleLabel(role))} · ${escapeHtml(String(m.created_at || "").slice(0, 10) || "참여일 미상")}</span></div></div><form method="post" action="/admin/member/nickname" class="nameForm"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="user_id" value="${escapeHtml(m.user_id || "")}"/><input type="hidden" name="return_to" value="${escapeHtml(returnTo)}"/><label>이 가계부에서 보일 이름<input name="nickname" value="${escapeHtml(m.nickname || "")}" maxlength="40" required/></label><button type="submit">이름 저장</button></form>${roleForm}${transfer}<div class="memberFoot"><small>표시 이름과 권한으로 구분합니다.</small><div class="memberActions">${remove}</div></div></article>`;
  }).join("") || `<div class="empty">참여자가 없습니다.</div>`;
  // V22.9.79 F-4: 줄바꿈 없는 긴 표시 이름(영문 닉네임 등)이 참여자 카드를 360px 밖(R=576)으로 밀고 "이름 저장" 단추가 카드 밖으로 나갔다. 모바일 격자를 minmax(0,1fr)로, 이름 칸에 min-width:0·줄바꿈 허용.
  // V22.9.118 U-1c: 다크에서 초대코드 글씨는 셸이 밝은 파랑으로 바꾸는데 칸 바탕은 흰색 그대로(1.80:1)였다 — 다크 선택자에서만 칸 바탕을 다크 토큰으로.
  return `<!doctype html><html lang="ko"${supporterHtmlAttr(supporterViewer)}><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 참여자·초대</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:#f6f7fb;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px 16px 120px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 30px rgba(15,23,42,.055)}.hero h1{margin:0 0 7px}.hero p,.muted{color:#667085;line-height:1.6}.toolbar{display:grid;grid-template-columns:minmax(0,1fr) 160px 100px;gap:8px}.toolbar select,.toolbar input,.toolbar button,.nameForm input,.roleForm select{width:100%;min-width:0;height:44px;border:1px solid #d0d5dd;border-radius:13px;padding:0 11px;background:#fff;font:inherit}.toolbar button,.nameForm button,.roleForm button,.danger,.btn,.transferButton{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px}.inviteBox{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:center;background:#fffbea;border:1px solid #fde68a;border-radius:18px;padding:14px}.inviteBox code{display:grid;gap:4px;font-family:inherit;font-size:14px;font-weight:400;color:#854d0e;word-break:keep-all}.inviteBox .inviteKey{display:inline-block;width:max-content;max-width:100%;font-family:ui-monospace,"SFMono-Regular",Menlo,Consolas,"Liberation Mono",monospace;font-size:24px;line-height:1.2;font-weight:700;letter-spacing:.16em;color:#111827;background:#fff;border:1px dashed #e4c45a;border-radius:12px;padding:6px 12px 6px 14px;overflow-wrap:anywhere}@media(max-width:560px){.inviteBox{grid-template-columns:1fr}.inviteBox button{width:100%}}.inviteBox button{min-height:42px;border:0;border-radius:13px;background:#FEE500;color:#191919;font-weight:1000;padding:0 14px}.memberGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px}.memberCard{border:1px solid #e5e7eb;border-radius:18px;padding:14px;display:grid;gap:11px;min-width:0}.memberHead{display:flex;gap:10px;align-items:center}.avatar{width:42px;height:42px;border-radius:15px;background:#eef2ff;color:#3730a3;display:grid;place-items:center;font-weight:700;font-size:18px}.memberHead>div:last-child{min-width:0}.avatar{flex:none}.memberHead b{overflow-wrap:anywhere}.memberHead b,.memberHead span{display:block}.memberHead span{color:#667085;font-size:12px;margin-top:3px}.nameForm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.nameForm label{display:grid;gap:6px;color:#475467;font-size:12px;font-weight:1000}.roleForm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}.memberFoot{display:flex;justify-content:space-between;gap:8px;align-items:center;border-top:1px solid #edf0f4;padding-top:9px}.memberFoot small{color:#98a2b3}.danger{background:#fee2e2;color:#991b1b!important;min-height:38px}.transferButton{background:#eef2ff;color:#3730a3!important;min-height:38px}.transferBox{display:grid;gap:8px}.transferBox p{margin:0;font-size:13px;line-height:1.55}.transferForm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:end}.transferForm label{display:grid;gap:6px;color:#475467;font-size:12px;font-weight:600}.transferForm input{width:100%;min-width:0;height:44px;border:1px solid #d0d5dd;border-radius:13px;padding:0 11px;background:#fff;font:inherit}.transferForm .transferButton{min-height:44px}.reauthOk{background:#ecfdf5;border:1px solid #a7f3d0;color:#166534;border-radius:13px;padding:11px;font-size:13px;font-weight:700}.orText{text-align:center;color:#667085;font-size:12px;font-weight:600}.reauthButton{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:13px;background:#eef2ff;color:#3730a3!important;text-decoration:none;font-weight:600;padding:0 13px}@media(max-width:760px){.transferForm{grid-template-columns:minmax(0,1fr)}.transferForm input{font-size:16px}}.memberActions{display:flex;gap:6px;flex-wrap:wrap;justify-content:flex-end}.ownerBadge{display:inline-flex;justify-self:start;background:#dcfce7;color:#166534;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:500}.ok,.error{border-radius:14px;padding:11px;margin:10px 0}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}.empty{padding:16px;color:#667085;background:#f8fafc;border-radius:16px}@media(max-width:760px){.wrap{padding:10px 10px 126px}.toolbar,.nameForm,.roleForm{grid-template-columns:minmax(0,1fr)}.memberGrid{grid-template-columns:minmax(0,1fr)}.hero,.card{padding:16px;border-radius:19px}.inviteBox{grid-template-columns:1fr}.inviteBox button{width:100%}.memberFoot{align-items:flex-start}.nameForm input,.roleForm select,.toolbar select,.toolbar input{font-size:16px}}.policyForm{display:grid;gap:9px}.policyOption{display:flex;gap:10px;align-items:flex-start;border:1px solid #e8edf4;border-radius:16px;padding:12px}.policyOption input{width:20px;height:20px;margin:2px 0 0;flex:none}.policyOption b,.policyOption small{display:block}.policyOption small{color:#667085;margin-top:3px;line-height:1.5}html[data-ab-resolved-theme="dark"] .inviteBox .inviteKey{background:var(--ab12-surface,#1e2026);color:var(--ab12-accent,#93c5fd);border-color:var(--ab12-line,#3b475a)}</style>${supporterHeadHtml({ viewer: supporterViewer, badges: supporterBadges })}</head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "members")}<div class="pageMain"><section class="hero"><h1>참여자·초대 관리</h1><p>초대코드를 공유하고, 승인 대기·기록 가능·조회 전용·이용 제한을 가계부별로 관리합니다. 소유자는 다른 참여자에게 소유자를 양도할 수 있습니다.</p></section>${msg ? `<div class="ok">${escapeHtml(householdPageMessage(msg))}</div>` : ""}${err ? `<div class="error">${escapeHtml(householdPageMessage(err))}</div>` : ""}<section class="card"><form class="toolbar" method="get" action="/my/members"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="card"><h2>초대코드</h2><div class="inviteBox"><code><span>초대 문구 · 단톡방이나 참여자에게 그대로 보내세요</span><span>가계부 참여 <b class="inviteKey">${escapeHtml(selected.invite_code || "")}</b></span></code><button type="button" id="copyInvite">초대 문구 복사</button></div><p class="muted">참여자는 자기 카카오 계정 또는 내 계정 로그인 비밀번호로 접속합니다. 초대코드는 가계부 참여용이며 비밀번호가 아닙니다.</p></section>${renderMemberPolicySection({ selected, month, memberPolicy })}<section class="card"><h2>참여자 ${numberWithCommas(members.length)}명</h2><div class="memberGrid">${cards}</div></section></div></div></main><script>(function(){var b=document.getElementById('copyInvite');if(!b)return;var t=${jsonForInlineScript(`가계부 참여 ${selected.invite_code || ""}`)};b.addEventListener('click',function(){if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(function(){b.textContent='복사됨';});}else{window.prompt('복사하세요',t);}});})();</script></body></html>`;
}

function renderMyMembersHtmlLegacyV2264({ env, month, households, selected, members = [], msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const hh = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const opts = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(householdChoiceLabelV229118(h, households) || h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(householdChoiceLabelV229118(h, households) || h.name)} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const rows = safeArray(members).map((m) => `<tr><td>${escapeHtml(m.nickname || "구성원")}</td><td>${escapeHtml(m.role || "member")}</td><td>${escapeHtml(String(m.created_at || "").slice(0,10))}</td></tr>`).join("") || `<tr><td colspan="3">참여자가 없습니다.</td></tr>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 참여자/초대</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 50%,#eef2f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#101828}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe}.muted{color:#667085;line-height:1.6}input,select{border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit;background:#fff}button,.btn{display:inline-flex;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.code{font-size:24px;font-weight:1000;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:18px;padding:14px;display:inline-block}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "members")}<div class="pageMain"><section class="hero"><h1>참여자/초대 관리</h1><p>가족이나 모임 구성원에게 초대코드를 공유하고, 참여자를 확인합니다.</p></section><section class="card"><form method="get" action="/my/members"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="card"><h2>초대코드</h2><div class="code">${escapeHtml(selected.invite_code || "")}</div><p class="muted">구성원은 /my에서 이름과 개인 접속코드를 입력한 뒤 이 초대코드로 참여할 수 있습니다. 승인/권한 세부 변경이 필요하면 관리자 화면에서 처리하세요.</p></section><section class="card"><h2>참여자 목록</h2><table><thead><tr><th>이름</th><th>권한</th><th>참여일</th></tr></thead><tbody>${rows}</tbody></table></section></div></div></main></body></html>`;
}
// @build:exports-start
export { handleMyMemberPolicySave, handleMyMembersPage, handleMyOwnerTransfer };
// @build:exports-end
