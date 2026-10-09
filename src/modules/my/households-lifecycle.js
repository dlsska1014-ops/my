// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import {
  parseStrictSettingsObject, safeError, settingsDataError, withHouseholdDatabaseLease,
  withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse, redirectResponseWithCookies } from "../runtime/http.js";
import {
  categoryKeywordsSettingsKey, categorySettingsKey,
} from "../settings/categories-keywords.js";
import { assetHistoryKey, paymentAssetsKey } from "../settings/payment-assets.js";
import { reservePlansKey } from "../settings/reserve-plans.js";
import { returnLocation, safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import {
  fetchHouseholdMembers, fetchMemberAliasMap, fetchPostgrestRows, memberAliasSettingsKey,
  saveMemberAlias,
} from "../data/households-members-rows.js";
import { safeObject } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { settlementHistoryKey } from "../features/settlement-ops-pages.js";
import { stripMergedMarkerSuffix, verifyUserSession } from "../auth/user-session.js";
import {
  clearHouseholdDeleteReauthCookie, hasBackupLoginIdentity, hasKakaoLoginIdentity,
  verifyHouseholdDeleteReauth, verifyPasswordReauth,
} from "../auth/identity-reauth.js";
import { handleMyLogout } from "../auth/kakao-oauth.js";
import {
  createUserHousehold, fetchUserById, fetchUserHouseholds, withHouseholdCreateLock,
  withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { reportChallengeSettingsKey } from "./report-challenge.js";
import { freeReportPreferenceKey } from "./reports-premium.js";
import {
  canManageMyHousehold, canReadMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { transactionEditHistoryKey } from "./transactions.js";
import { addQueryToUrl, renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderUserLoginHtml } from "../web/login-page-side-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import {
  clearKakaoSelectedHousehold, findExistingKakaoHouseholdByNameV2254, getKakaoSelectedHouseholdId,
  parseBareInviteCode, sanitizeWebHouseholdNameInput,
} from "../kakao/household-budget-commands.js";
import { goalsKey } from "../api/user-api.js";
import {
  fetchLegacyKakaoGroupLinkMap, markKakaoGroupDeparture, markKakaoGroupRetired,
  normalizeKakaoGroupLinkItem, parseKakaoGroupFirstMarker, removeKakaoGroupLinksForHousehold,
  withKakaoGroupLifecycleLease,
} from "../kakao/group-links-first-record.js";
import {
  markKakaoChatFirstHistory, markKakaoChatFirstHistoryBatch, parseKakaoChatFirstMarker,
} from "../kakao/identity-chat-first.js";
import {
  cancelPendingHouseholdJoin, getHouseholdMemberRole, joinHouseholdByCode,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { parseJoinCode } from "../kakao/simple-commands.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function householdTemplatePreset(key = "") {
  const presets = {
    travel: { name: "우리 여행 경비", label: "여행" },
    meeting: { name: "우리 모임 회비", label: "모임" },
    settlement: { name: "단발성 정산", label: "정산" },
    family_event: { name: "가족 행사비", label: "가족 행사" },
  };
  return presets[String(key || "").trim()] || null;
}

function householdPageMessage(code = "") {
  const map = {
    created: "가계부를 만들었습니다. 이제 초대코드를 공유하세요.",
    household_duplicate_selected: "같은 이름의 기존 가계부를 선택했습니다.",
    joined: "이미 참여 중인 가계부를 열었습니다.",
    joined_viewer: "조회 전용으로 참여 중인 가계부입니다. 기록은 볼 수 있지만 저장·수정·삭제할 수 없습니다.",
    join_blocked: "이 가계부에서는 참여가 차단되어 있습니다. 초대코드를 다시 입력해도 권한은 바뀌지 않습니다. 소유자에게 확인해 주세요.",
    db_write_unknown: "처리 결과를 아직 확인하지 못했습니다. 기록·목표·참여 목록을 새로고침해 결과를 먼저 확인하고 같은 요청을 반복하지 마세요.",
    approval_pending: "참여 요청을 보냈습니다. 관리자가 승인하면 열 수 있습니다.",
    household_updated: "가계부 이름을 변경했습니다.",
    household_deleted: "가계부와 모든 기록을 삭제했습니다. 연결된 단톡방도 해제되어 이후 입력은 저장되지 않습니다.",
    household_left: "가계부에서 나왔습니다. 기존 기록은 정산·감사를 위해 지출 당시 이름과 함께 유지됩니다.",
    backup_login_saved: "내 계정 로그인 비밀번호를 안전하게 변경했습니다.",
    household_name_invalid: "가계부 이름은 의미 있는 2~40자로 입력하세요.",
    display_name_required: "이 가계부에서 사용할 내 이름을 입력하세요.",
    personal_password_invalid: "내 계정 로그인 비밀번호가 맞지 않습니다. 다시 확인하거나 계정·보안에서 변경하세요.",
    personal_password_short: "내 계정 로그인 비밀번호는 8자리 이상으로 입력하세요.",
    personal_password_mismatch: "내 계정 로그인 비밀번호 확인이 일치하지 않습니다.",
    account_reauth_required: "영구 삭제 전에 내 계정으로 본인 확인을 완료하세요.",
    kakao_reauth_verified: "카카오 계정 본인 확인을 완료했습니다. 5분 안에 삭제 확인을 마치세요.",
    kakao_reauth_cancelled: "카카오 계정 본인 확인을 취소했습니다. 가계부는 변경되지 않았습니다.",
    kakao_reauth_failed: "카카오 계정 본인 확인을 완료하지 못했습니다. 가계부는 변경되지 않았습니다.",
    kakao_reauth_account_mismatch: "현재 가계부 계정과 다른 카카오 계정입니다. 원래 연결한 카카오 계정으로 다시 확인하세요.",
    kakao_reauth_unavailable: "카카오 본인 확인을 사용할 수 없습니다. 계정·보안에서 로그인 비밀번호를 설정한 뒤 확인하세요.",
    household_manage_not_allowed: "이 가계부의 설정을 변경할 권한이 없습니다.",
    household_update_failed: "가계부 이름을 저장하지 못했습니다. 기존 이름은 유지됩니다.",
    household_delete_owner_only: "가계부 영구 삭제는 소유자만 할 수 있습니다.",
    household_delete_name_mismatch: "확인용 가계부 이름이 현재 이름과 일치하지 않습니다.",
    household_delete_ack_required: "참여자와 모든 기록이 삭제된다는 확인이 필요합니다.",
    household_delete_failed: "가계부 삭제를 완료하지 못했습니다. 데이터는 임의로 숨기지 않았습니다.",
    household_leave_owner_blocked: "소유자는 바로 나갈 수 없습니다. 소유권 이전 기능이 준비되기 전에는 가계부를 삭제하거나 고객지원에 요청해 주세요.",
    household_leave_not_member: "현재 이 가계부의 참여자가 아닙니다.",
    household_leave_ack_required: "가계부에서 나가기 전 확인 항목에 동의해 주세요.",
    household_leave_failed: "가계부에서 나오지 못했습니다. 참여 상태는 그대로 유지됩니다.",
    household_create_failed: "가계부를 만들지 못했습니다. 같은 버튼을 반복해서 누르지 말고 잠시 후 다시 시도하세요.",
    household_create_busy: "같은 이름의 가계부를 다른 곳에서 만드는 중입니다. 잠시 후 다시 시도하면 기존 가계부가 선택됩니다.",
    join_request_cancelled: "참여 요청을 취소했습니다. 다시 참여하려면 초대코드를 다시 입력하세요.",
    join_cancel_failed: "참여 요청을 취소하지 못했습니다. 승인 대기 상태는 그대로입니다.",
  };
  return map[String(code || "")] || formatMessage(code || "");
}

async function handleMyHouseholdsPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchUserHouseholds(env, userId);
  const requestedId = String(url.searchParams.get("manage") || url.searchParams.get("household_id") || "").trim();
  const selected = requestedId
    ? households.find((h) => String(h.id) === requestedId) || null
    : households.find((h) => canReadMyHousehold(h.role)) || households[0] || null;
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const step = url.searchParams.get("step") || "";
  const preset = householdTemplatePreset(url.searchParams.get("template") || "");
  const [hasLocalLogin, hasKakaoLogin, selectedMembers] = await Promise.all([
    hasBackupLoginIdentity(env, user),
    hasKakaoLoginIdentity(env, user),
    selected?.id ? fetchHouseholdMembers(env, selected.id) : Promise.resolve([]),
  ]);
  const kakaoReauthVerified = selected?.id && selected.role === "owner"
    ? await verifyHouseholdDeleteReauth(request, env, userId, selected.id)
    : false;
  const qsFor = (h) => `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}`;
  const cards = households.map((h) => {
    const active = selected?.id === h.id;
    const readable = canReadMyHousehold(h.role);
    const manageable = canManageMyHousehold(h.role);
    const status = h.role === "pending" ? "승인 대기" : h.role === "blocked" ? "이용 제한" : userHouseholdRoleLabel(h.role || "member");
    // V22.9.37 감사 H15: 승인 대기 중인 사람은 자기 참여 요청을 거둘 수 있다(내 pending 행만 지운다).
    const cancelJoin = h.role === "pending"
      ? `<form method="post" action="/my/household/leave" class="cancelJoin" onsubmit="return confirm('이 가계부 참여 요청을 취소할까요? 다시 참여하려면 초대코드를 다시 입력해야 합니다.')"><input type="hidden" name="household_id" value="${escapeHtml(h.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="cancel_pending" value="1"/><button class="cancelJoinButton" type="submit">참여 요청 취소</button></form>`
      : "";
    const actions = readable
      ? `<a class="primary" href="/app?${qsFor(h)}">열기</a><a href="/my/households?${qsFor(h)}&manage=${encodeURIComponent(h.id)}#manage">옵션</a>${manageable ? `<a href="/my/members?${qsFor(h)}">멤버</a>` : ""}`
      : `<a href="/my?household_id=${encodeURIComponent(h.id)}">상태 확인</a>${cancelJoin}`;
    const invite = manageable && h.invite_code
      ? `<details class="inviteFold"><summary>초대코드 보기</summary><div><code>${escapeHtml(h.invite_code)}</code><button type="button" data-copy="가계부 참여 ${escapeHtml(h.invite_code)}">복사</button></div></details>`
      : "";
    return `<article class="hhCard ${active ? "active" : ""}"><div class="hhMain"><div><b>${escapeHtml(h.name || "가계부")}</b><span>${escapeHtml(status)} · ${escapeHtml(formatDateKorean(h.joined_at || h.created_at || ""))}</span></div>${active ? `<em>선택됨</em>` : ""}</div><div class="hhActions">${actions}</div>${invite}</article>`;
  }).join("") || `<div class="empty">아직 가계부가 없습니다. 아래 1단계부터 시작하세요.</div>`;

  const inviteStage = step === "invite" && selected && canManageMyHousehold(selected.role)
    ? `<section class="inviteStage"><span class="stepBadge">3단계 · 초대</span><h2>${escapeHtml(selected.name)} 생성 완료</h2><p>가계부가 준비됐습니다. 이 가계부에는 별도 비밀번호가 없으며, 참여자는 아래 초대코드와 자기 계정으로 들어옵니다.</p><div class="inviteCode">가계부 참여 <b>${escapeHtml(selected.invite_code || "")}</b></div><div class="stageActions"><button type="button" data-copy="가계부 참여 ${escapeHtml(selected.invite_code || "")}">초대 문구 복사</button><a href="/my/members?${qsFor(selected)}">참여자 관리</a><a href="/app?${qsFor(selected)}">홈으로</a></div><p class="exitGuide">지금 초대하지 않아도 가계부 옵션에서 언제든 다시 확인할 수 있습니다.</p></section>`
    : "";

  const securityReturn = `/my/households?month=${encodeURIComponent(month)}${selected?.id ? `&household_id=${encodeURIComponent(selected.id)}&manage=${encodeURIComponent(selected.id)}#manage` : ""}`;
  const loginMethodLabel = hasKakaoLogin && hasLocalLogin ? "카카오 로그인 + 계정 로그인 비밀번호" : hasKakaoLogin ? "카카오 로그인" : hasLocalLogin ? "계정 로그인 비밀번호" : "추가 로그인 수단 미설정";
  const accountSecurityCard = `<section class="accountSecurity"><div><b>가계부 비밀번호는 없습니다</b><span>현재 내 계정 접속 방식: ${escapeHtml(loginMethodLabel)}. 계정 보안은 모든 가계부에 공통으로 적용됩니다.</span></div><a href="/my/backup-login?return_to=${encodeURIComponent(securityReturn)}">내 계정·보안</a></section>`;

  const leaveForm = selected && selected.role !== "owner"
    ? `<form method="post" action="/my/household/leave" class="dangerZone" onsubmit="return confirm('이 가계부에서 나갈까요? 기존 기록은 지출자 정보와 함께 유지됩니다.')"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><h3>가계부에서 나가기</h3><p>현재 로그인한 내 계정의 참여 권한만 해제됩니다. 별도 가계부 비밀번호는 필요하지 않으며, 이미 남긴 기록은 공동 정산과 변경 이력을 위해 삭제되지 않습니다.</p><label class="check"><input name="understand_history" type="checkbox" value="1" required/> 기존 기록은 지출 당시 참여자 기록으로 유지됨을 이해했습니다.</label><button class="danger" type="submit">이 가계부에서 나가기</button></form>`
    : "";

  const deleteBack = selected?.id ? `/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}&manage=${encodeURIComponent(selected.id)}#manage` : "/my/households";
  const kakaoReauthUrl = selected?.id ? `/auth/kakao/start?reauth=household-delete&household_id=${encodeURIComponent(selected.id)}&return_to=${encodeURIComponent(deleteBack)}` : "";
  const kakaoReauthButton = hasKakaoLogin && kakaoReauthUrl ? `<a class="reauthButton" href="${escapeHtml(kakaoReauthUrl)}">카카오 계정으로 본인 확인</a>` : "";
  const deleteFields = selected ? `<input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><h3>가계부 영구 삭제</h3><p>먼저 <a href="/my/backup?${qsFor(selected)}">CSV 백업</a>을 권장합니다. 삭제하면 참여자·기록·설정·단톡방 연결이 함께 제거되며 복구할 수 없습니다.</p><label>가계부 이름을 그대로 입력<input name="confirm_name" placeholder="${escapeHtml(selected.name || "")}" autocomplete="off" required/></label>` : "";
  let ownerDeletePanel = "";
  if (selected?.role === "owner") {
    if (kakaoReauthVerified || hasLocalLogin) {
      const verificationField = kakaoReauthVerified
        ? `<div class="reauthOk">카카오 계정 본인 확인 완료 · 5분 동안 유효</div>`
        : `<label>내 계정 로그인 비밀번호<input name="access_code" type="password" autocomplete="current-password" required/></label>${kakaoReauthButton ? `<div class="orText">또는</div>${kakaoReauthButton}` : ""}`;
      ownerDeletePanel = `<form method="post" action="/my/household/delete" class="dangerZone" onsubmit="return confirm('이 가계부의 모든 기록과 설정을 영구 삭제할까요?')">${deleteFields}${verificationField}<label class="check"><input name="understand_members" type="checkbox" value="1" required/> 참여자 ${numberWithCommas(selectedMembers.length)}명과 모든 기록이 삭제됨을 이해했습니다.</label><button type="submit">이 가계부 영구 삭제</button></form>`;
    } else if (hasKakaoLogin) {
      ownerDeletePanel = `<div class="dangerZone"><h3>가계부 영구 삭제</h3><p>가계부 비밀번호를 요구하지 않습니다. 먼저 이 계정에 연결된 카카오 계정으로 본인 확인을 완료하세요. 확인 후 삭제 입력란이 열립니다.</p>${kakaoReauthButton}</div>`;
    } else {
      ownerDeletePanel = `<div class="dangerZone"><h3>가계부 영구 삭제</h3><p>영구 삭제 전 내 계정 본인 확인 수단이 필요합니다. 가계부용 비밀번호가 아니라 모든 가계부에 공통인 계정 로그인 비밀번호를 먼저 설정하세요.</p><a class="reauthButton" href="/my/backup-login?return_to=${encodeURIComponent(deleteBack)}">내 계정·보안 열기</a></div>`;
    }
  }

  const selectedManage = selected && canReadMyHousehold(selected.role) ? `
    <section class="card manageCard" id="manage">
      <div class="sectionHead"><div><span class="eyebrow">가계부별 옵션</span><h2>${escapeHtml(selected.name)}</h2><p>${escapeHtml(userHouseholdRoleLabel(selected.role || "member"))} · 참여자 ${numberWithCommas(selectedMembers.filter((m) => m.role !== "blocked").length)}명</p></div><a class="closeLink" href="/my/households?month=${encodeURIComponent(month)}">목록만 보기</a></div>
      <div class="optionGrid"><a href="/my/members?${qsFor(selected)}"><b>참여자·초대</b><span>초대코드와 멤버 확인</span></a><a href="/my/settings?${qsFor(selected)}"><b>수입·예산</b><span>분류별 합계 설정</span></a><a href="/my/backup?${qsFor(selected)}"><b>백업·가져오기</b><span>삭제 전 CSV 보관</span></a><a href="/my/groups?${qsFor(selected)}"><b>단톡방 연결</b><span>가계부별 연결 확인</span></a><a href="/app?${qsFor(selected)}"><b>가계부 열기</b><span>홈과 기록으로 이동</span></a></div>
      ${canManageMyHousehold(selected.role) ? `<div class="manageGrid"><form method="post" action="/my/household/update" class="settingsForm"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><h3>가계부 이름 변경</h3><label>새 이름<input name="household_name" value="${escapeHtml(selected.name || "")}" minlength="2" maxlength="40" required/></label><button type="submit">이름 저장</button></form>${ownerDeletePanel}</div>` : `<div class="readOnlyNote">이름·멤버·삭제 관리는 가계부 소유자 또는 관리자만 할 수 있습니다.</div>`}
      ${leaveForm}
    </section>` : "";

  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 가계부 전환·관리</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:#f6f7fb;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px 16px 120px}.hero,.card,.inviteStage,.accountSecurity{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 30px rgba(15,23,42,.055)}.hero h1{margin:0 0 7px;font-size:25px}.hero p,.muted,.inlineHelp,.sectionHead p{color:#667085;line-height:1.6}.flow{display:flex;gap:7px;flex-wrap:wrap;margin-top:14px}.flow span,.stepBadge,.eyebrow{display:inline-flex;border-radius:999px;background:#fff7cc;color:#5c4700;padding:6px 10px;font-size:12px;font-weight:1000}.ok,.error{border-radius:14px;padding:11px;margin:10px 0;line-height:1.55}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca}.createJoin{display:grid;grid-template-columns:minmax(0,1.2fr) minmax(280px,.8fr);gap:12px}.field{display:grid;gap:7px;margin:11px 0}.field label,.settingsForm label,.dangerZone label{display:grid;gap:7px;font-size:13px;font-weight:1000;color:#475467}.field small{font-weight:700;color:#667085}.field input,.settingsForm input,.dangerZone input{width:100%;height:48px;border:1px solid #d0d5dd;border-radius:14px;padding:0 13px;font:inherit;background:#fff}.primaryButton,button,.hhActions a,.stageActions a,.stageActions button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.primaryButton{width:100%}.inlineHelp a,.dangerZone a{color:#1d4ed8;font-weight:1000}.list{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px}.hhCard{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:14px;display:grid;gap:10px;min-width:0}.hhCard.active{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.1);background:#f0fdfa}.hhMain{display:flex;align-items:flex-start;justify-content:space-between;gap:8px}.hhMain b{display:block;font-size:18px;word-break:break-word}.hhMain span{display:block;color:#667085;font-size:12px;margin-top:4px}.hhMain em{font-style:normal;background:#ccfbf1;color:#115e59;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:1000;white-space:nowrap}.hhActions{display:flex;gap:7px;flex-wrap:wrap}.hhActions a{background:#eef2f7;color:#111827!important;min-height:39px}.hhActions a.primary{background:#111827;color:#fff!important}.hhActions .cancelJoin{display:contents}.hhActions .cancelJoinButton{background:#fee2e2;color:#991b1b!important;min-height:39px}.inviteFold{border-top:1px solid #edf0f4;padding-top:8px}.inviteFold summary{cursor:pointer;font-weight:900;color:#475467}.inviteFold div{display:flex;gap:8px;align-items:center;margin-top:8px}.inviteFold code,.inviteCode{background:#fff7cc;border:1px solid #fde68a;border-radius:13px;padding:11px;font-weight:1000;word-break:break-all}.inviteFold button{min-height:38px}.inviteStage{border-color:#fde68a;background:linear-gradient(180deg,#fffef5,#fff)}.inviteStage h2{margin:11px 0 4px}.stageActions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.stageActions a{background:#eef2f7;color:#111827!important}.exitGuide{color:#667085;font-size:13px}.sectionHead{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.sectionHead h2{margin:8px 0 0}.closeLink{color:#475467;font-weight:900}.optionGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin:14px 0}.optionGrid a{display:block;text-decoration:none;color:#101828;background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:13px;min-width:0}.optionGrid b,.optionGrid span{display:block}.optionGrid span{color:#667085;font-size:12px;margin-top:4px;line-height:1.45}.manageGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.settingsForm,.dangerZone{border:1px solid #e5e7eb;border-radius:18px;padding:14px}.settingsForm h3,.dangerZone h3{margin:0 0 10px}.dangerZone{background:#fff7f7;border-color:#fecaca}.dangerZone button{background:#b91c1c;width:100%;margin-top:10px}.dangerZone p{color:#991b1b;font-size:13px;line-height:1.55}.dangerZone .check{grid-template-columns:auto 1fr;align-items:start}.dangerZone .check input{width:20px;height:20px}.accountSecurity{display:flex;align-items:center;justify-content:space-between;gap:14px}.accountSecurity b,.accountSecurity span{display:block}.accountSecurity span{color:#667085;font-size:13px;line-height:1.55;margin-top:4px}.accountSecurity>a,.reauthButton{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#eef2ff;color:#3730a3!important;text-decoration:none;font-weight:1000;padding:0 13px}.reauthOk{background:#ecfdf5;border:1px solid #a7f3d0;color:#166534;border-radius:13px;padding:11px;margin:10px 0;font-weight:900}.orText{text-align:center;color:#667085;font-size:12px;font-weight:900;margin:8px 0}.readOnlyNote,.empty{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:16px;padding:14px;color:#667085}@media(max-width:760px){.wrap{padding:10px 10px 128px}.createJoin,.manageGrid{grid-template-columns:1fr}.list{grid-template-columns:1fr}.optionGrid{grid-template-columns:1fr 1fr}.hero,.card,.inviteStage{border-radius:19px;padding:16px}.hero h1{font-size:22px}.field input,.settingsForm input,.dangerZone input{font-size:16px}.sectionHead{display:block}.closeLink{display:inline-block;margin-top:9px}.stageActions>*{width:100%}.accountSecurity{display:grid}.accountSecurity>a,.reauthButton{width:100%}}@media(max-width:390px){.optionGrid{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("my-households", { month, householdId: selected?.id || "", householdName: selected?.name || "" })}<main class="wrap"><section class="hero"><h1>가계부 전환·관리</h1><p>가계부마다 이름·참여자·초대코드·단톡방·백업·예산을 따로 관리합니다. 가계부 자체에는 비밀번호가 없고, 로그인 보안은 내 계정에 한 번만 설정합니다.</p><div class="flow"><span>1 이름 입력</span><span>2 가계부 생성</span><span>3 초대·단톡방 연결</span></div></section>${msg ? `<div class="ok">${escapeHtml(householdPageMessage(msg))}</div>` : ""}${err ? `<div class="error">${escapeHtml(householdPageMessage(err))}</div>` : ""}${accountSecurityCard}${inviteStage}<section class="createJoin"><div class="card" id="create"><span class="eyebrow">1단계 · 이름</span><h2>${preset ? `${escapeHtml(preset.label)} 템플릿으로 만들기` : "새 가계부 만들기"}</h2><p class="muted">가계부 이름과 이 가계부에서 보일 내 이름만 확인하면 됩니다. 비밀번호를 새로 만들거나 다시 입력하지 않습니다.</p><form method="post" action="/my/create"><input type="hidden" name="template" value="${escapeHtml(url.searchParams.get("template") || "")}"/><div class="field"><label>가계부 이름</label><input name="household_name" value="${escapeHtml(url.searchParams.get("household_name") ?? preset?.name ?? "")}" placeholder="예: 우리집 생활비, 제주 여행 경비" minlength="2" maxlength="40" required/></div><div class="field"><label>이 가계부에서 보일 내 이름</label><input name="display_name" value="${escapeHtml(user.nickname || "카카오사용자")}" autocomplete="nickname" maxlength="40" required/></div><button class="primaryButton" type="submit">가계부 만들기</button></form></div><div class="card"><span class="eyebrow">이미 초대받았나요?</span><h2>초대코드로 참여</h2><p class="muted">받은 코드를 입력하면 참여 요청이 접수됩니다. 승인 대기 중에는 같은 코드를 반복 입력할 필요가 없습니다.</p><form method="post" action="/my/join"><input type="hidden" name="return_to" value="/my/households"/><div class="field"><label>초대코드</label><input name="invite_code" placeholder="예: ABCD1234" autocomplete="off" required/></div><button class="primaryButton" type="submit">참여 요청 보내기</button></form></div></section><section class="card"><h2>내 가계부 ${numberWithCommas(households.length)}개</h2><p class="muted">카드를 열지 않아도 핵심 작업을 바로 선택할 수 있습니다.</p><div class="list">${cards}</div></section>${selectedManage}</main><script>(function(){document.querySelectorAll('[data-copy]').forEach(function(button){button.addEventListener('click',function(){var text=button.getAttribute('data-copy')||'';var done=function(){button.textContent='복사됨';setTimeout(function(){button.textContent='복사';},1400)};if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(text).then(done).catch(function(){window.prompt('복사하세요',text)});}else{window.prompt('복사하세요',text);}});});})();</script></body></html>`);
}

async function handleMyHouseholdsPageLegacyV2264(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchUserHouseholds(env, userId);
  const requestedId = String(url.searchParams.get("household_id") || "").trim();
  const selected = requestedId
    ? households.find((h) => String(h.id) === requestedId) || null
    : households.find((h) => canReadMyHousehold(h.role)) || households[0] || null;
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const rows = households.map((h) => {
    const active = selected?.id === h.id;
    const readable = canReadMyHousehold(h.role);
    const manageable = canManageMyHousehold(h.role);
    const invite = manageable && h.invite_code ? `가계부 참여 ${h.invite_code}` : h.role === "pending" ? "관리자 승인 후 열 수 있습니다." : h.role === "blocked" ? "관리자에게 이용 제한 해제를 요청하세요." : "초대코드는 소유자·관리자만 확인할 수 있습니다.";
    const actions = readable ? `<a href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">열기</a><a class="soft" href="/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">선택</a>` : `<a class="soft" href="/my?household_id=${encodeURIComponent(h.id)}">상태 확인</a>`;
    return `<article class="hhCard ${active ? "active" : ""}"><div><b>${escapeHtml(h.name || "가계부")}</b><span>${escapeHtml(userHouseholdRoleLabel(h.role || "member"))} · ${escapeHtml(formatDateKorean(h.joined_at || h.created_at || ""))}</span></div><div class="hhActions">${actions}</div><p class="inviteText">${escapeHtml(invite)}</p></article>`;
  }).join("") || `<div class="empty">아직 참여 중인 가계부가 없습니다. 아래에서 새로 만들거나 초대코드로 참여하세요.</div>`;
  const selectedInvite = canManageMyHousehold(selected?.role) && selected?.invite_code ? `가계부 참여 ${selected.invite_code}` : selected?.role === "pending" ? "참여 승인 대기 중입니다. 관리자가 승인하면 이용할 수 있습니다." : selected?.role === "blocked" ? "이용이 제한된 가계부입니다. 관리자에게 권한을 확인해 주세요." : "초대 문구는 소유자·관리자만 확인할 수 있습니다.";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 가계부 전환·추가</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1080px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:20px;margin:12px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.list{display:grid;gap:10px}.hhCard{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px;display:grid;gap:9px}.hhCard.active{border-color:#0f766e;box-shadow:0 0 0 3px rgba(15,118,110,.12);background:#f0fdfa}.hhCard b{font-size:18px}.hhCard span,.muted,.inviteText{display:block;color:#64748b;line-height:1.45;font-size:13px}.hhActions{display:flex;gap:8px;flex-wrap:wrap}.hhActions a,.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px}.hhActions a.soft,.soft{background:#eef2f7!important;color:#111827!important}.field{display:grid;gap:7px;margin:10px 0}.field label{font-size:12px;color:#475569;font-weight:1000}.field input{height:46px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;font:inherit;background:#fff}.tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;line-height:1.55}.ok{background:#ecfdf5;border:1px solid #86efac;color:#166534;border-radius:14px;padding:10px;margin:10px 0}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:14px;padding:10px;margin:10px 0}.empty{background:#f8fafc;border:1px dashed #cbd5e1;border-radius:18px;padding:16px;color:#64748b}@media(max-width:760px){.wrap{padding:12px 10px 96px}.hero{border-radius:22px}.grid{grid-template-columns:1fr}.hero h1{font-size:24px}.field input,button,.btn{width:100%;font-size:16px;min-height:46px}}</style></head><body>${renderUnifiedNav("my-households", { month, householdId: selected?.id || "", householdName: selected?.name || "" })}<main class="wrap"><section class="hero"><h1>가계부 전환·추가</h1><p>우리집, 모임, 여행, 단발성 정산 가계부를 분리해서 운영합니다. 이 화면에서는 내가 참여한 가계부만 보이고, 새 가계부 생성과 초대코드 참여를 바로 할 수 있습니다.</p><p><a class="btn soft" href="/households?month=${encodeURIComponent(month)}${selected?.id ? `&household_id=${encodeURIComponent(selected.id)}` : ""}">참여자 관리</a><a class="btn soft" href="/household-create-join">생성·참여 가이드</a></p></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${formatMessage(err)}</div>` : ""}<section class="grid"><div class="card"><h2>새 가계부 만들기</h2><p class="muted">기존 가계부가 있어도 여행/모임/단발성 정산용 가계부를 새로 만들 수 있습니다.</p><form method="post" action="/my/create"><input type="hidden" name="return_to" value="/my/households"/><div class="field"><label>가계부 이름</label><input name="household_name" placeholder="예: 7월 제주여행, 회사 점심모임" required/></div><button type="submit">새 가계부 만들기</button></form></div><div class="card"><h2>초대코드로 참여하기</h2><p class="muted">가족, 모임장, 여행 총무에게 받은 초대코드를 입력하면 해당 가계부에 참여합니다.</p><form method="post" action="/my/join"><input type="hidden" name="return_to" value="/my/households"/><div class="field"><label>초대코드</label><input name="invite_code" placeholder="예: ABCD1234" autocomplete="off" required/></div><button class="soft" type="submit">초대코드로 참여하기</button></form></div></section><section class="card"><h2>내 가계부 목록</h2><div class="list">${rows}</div></section><section class="card"><h2>선택 가계부 초대 문구</h2><div class="tip"><b>${escapeHtml(selected?.name || "선택된 가계부 없음")}</b><br/>${escapeHtml(selectedInvite)}</div><p class="muted">초대 문구를 카카오톡으로 보내면 다른 사용자가 /my에서 로그인 후 초대코드로 참여할 수 있습니다.</p></section><section class="card"><h2>권한 기준</h2><div class="warn">owner/admin은 전체 관리, member는 자기 기록 중심, viewer는 조회 전용입니다. 참여 후에도 모든 화면은 user household scope로 제한되어 다른 가계부는 보이지 않습니다.</div></section></main></body></html>`);
}

function formatDateKorean(value = "") {
  const v = String(value || "").slice(0, 10);
  return /^20\d{2}-\d{2}-\d{2}$/.test(v) ? v : "참여일 미상";
}

async function handleMyCreate(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  let user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  const form = await request.formData();
  const attemptedName = String(form.get("household_name") || "").trim().slice(0,80);
  const name = sanitizeWebHouseholdNameInput(attemptedName);
  const displayName = stripMergedMarkerSuffix(String(form.get("display_name") || user.nickname || "")).slice(0, 40);
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  if (!name) return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&err=household_name_invalid&household_name=${encodeURIComponent(attemptedName)}#create`);
  if (!displayName) return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&err=display_name_required#create`);
  try {
    const result = await withHouseholdCreateLock(env, userId, name, async (lifecycleOptions) => {
      const existing = await findExistingKakaoHouseholdByNameV2254(env, userId, name);
      if (existing) return { household: existing, existed: true };
      return { household: await createUserHousehold(env, userId, name, displayName, lifecycleOptions), existed: false };
    });
    const household = result.household;
    // V22.9.37 감사 H14: 폼의 "이 가계부에서 보일 내 이름"은 새 가계부의 내 이름표(member_aliases)다. 계정 전체 닉네임
    // (users.nickname)과 다른 가계부의 이름표는 바꾸지 않는다. 이름표 저장 실패는 생성 결과를 뒤집지 않는다.
    if (!result.existed && displayName !== String(user.nickname || "")) {
      try { await saveMemberAlias(env, household.id, userId, displayName); }
      catch (aliasErr) { rememberOpsEvent({ kind: "household_create_alias_pending", severity: "warn", path: "/my/create", method: "POST", detail: safeError(aliasErr) }); }
    }
    const msg = result.existed ? "household_duplicate_selected" : "created";
    const step = result.existed ? "manage" : "invite";
    return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(household.id)}&manage=${encodeURIComponent(household.id)}&step=${step}&msg=${msg}#${result.existed ? "manage" : "top"}`);
  } catch (err) {
    // 잠금을 못 잡은 것은 "고장"이 아니라 "지금은 다른 곳에서 만드는 중"이다.
    // 둘을 같은 문구로 묶으면 다시 눌러도 되는 상황인지 알 수 없다.
    const busy = String(err?.message || "") === "household_create_busy";
    rememberOpsEvent({ kind: busy ? "household_create_busy" : "household_create_failed", severity: busy ? "warn" : "error", path: "/my/create", method: "POST", detail: safeError(err) });
    return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&err=${busy ? "household_create_busy" : "household_create_failed"}#create`);
  }
}

async function handleMyCreateLegacyV2264(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const form = await request.formData();
  const rawName = String(form.get("household_name") || "").trim();
  const name = sanitizeWebHouseholdNameInput(rawName);
  if (!name) return redirectResponse(returnLocation(form, "/my/households", { err: "household_name_invalid" }));
  try {
    const result = await withHouseholdCreateLock(env, userId, name, async (lifecycleOptions) => {
      const existing = await findExistingKakaoHouseholdByNameV2254(env, userId, name);
      if (existing) return { household: existing, existed: true };
      return { household: await createUserHousehold(env, userId, name, user?.nickname || "내", lifecycleOptions), existed: false };
    });
    const household = result.household;
    const msg = result.existed ? "household_duplicate_selected" : "created";
    const fallback = `/my/households?household_id=${encodeURIComponent(household.id)}&msg=${msg}`;
    return redirectResponse(returnLocation(form, fallback, { household_id: household.id, msg }));
  } catch (err) {
    const busy = String(err?.message || "") === "household_create_busy";
    rememberOpsEvent({ kind: busy ? "household_create_busy" : "household_create_failed", severity: busy ? "warn" : "error", path: "/my/create", method: "POST", detail: safeError(err) });
    return redirectResponse(returnLocation(form, "/my/households", { err: busy ? "household_create_busy" : "household_create_failed" }));
  }
}

async function handleMyHouseholdUpdate(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const name = sanitizeWebHouseholdNameInput(String(form.get("household_name") || "").trim());
  const role = await getHouseholdMemberRole(env, userId, householdId);
  const back = `/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&manage=${encodeURIComponent(householdId)}#manage`;
  if (!householdId || !name) return redirectResponse(addQueryToUrl(back, { err: "household_name_invalid" }));
  if (!canManageMyHousehold(role)) return redirectResponse(addQueryToUrl(back, { err: "household_manage_not_allowed" }));
  try {
    await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(householdId)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name }),
    });
    return redirectResponse(addQueryToUrl(back, { msg: "household_updated" }));
  } catch (err) {
    rememberOpsEvent({ kind: "household_update_failed", severity: "warn", path: "/my/household/update", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(back, { err: "household_update_failed" }));
  }
}

function householdSettingsKeys(householdId = "") {
  const hid = String(householdId || "").trim();
  return [
    categorySettingsKey(hid), categoryKeywordsSettingsKey(hid), paymentAssetsKey(hid), assetHistoryKey(hid),
    reservePlansKey(hid), memberAliasSettingsKey(hid), transactionEditHistoryKey(hid), settlementHistoryKey(hid),
    reportChallengeSettingsKey(hid), goalsKey(hid), freeReportPreferenceKey(hid),
  ];
}

async function purgeHouseholdData(env, householdId = "") {
  const hid = String(householdId || "").trim();
  if (!hid) throw new Error("household_id_required");
  const readPurgeScope = async () => {
    const [members, markers, roomRows, linkRows, legacy] = await Promise.all([
      fetchPostgrestRows(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(hid)}&select=user_id&order=user_id.asc`, { maxRows: 1000 }),
      fetchPostgrestRows(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent("kakao_first_record_v22928:*")}&value=like.${encodeURIComponent(`*${hid}*`)}&select=key,value&order=key.asc`, { maxRows: 1000 }),
      fetchPostgrestRows(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent("kakao_group_first*")}&value=like.${encodeURIComponent(`*${hid}*`)}&select=key,value&order=key.asc`, { maxRows: 1000 }),
      fetchPostgrestRows(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent("kakao_group_link_v2254:*")}&value=like.${encodeURIComponent(`*${hid}*`)}&select=key,value&order=key.asc`, { maxRows: 1000 }),
      fetchLegacyKakaoGroupLinkMap(env, true),
    ]);
    const candidateUsers = markers.map((row) => parseKakaoChatFirstMarker(row.value)).filter((item) => item?.candidate_id === hid && item.user_id).map((item) => String(item.user_id));
    const roomMarkers = roomRows.map(row => { const raw = parseStrictSettingsObject(row.value, "kakao_group_first"); return parseKakaoGroupFirstMarker(raw, raw.group_key, row.key.startsWith("kakao_group_first_done_v22931:")); }).filter(item => item?.candidate_id === hid);
    const links = linkRows.map(row => { const link = normalizeKakaoGroupLinkItem(row.value); if (!link) throw settingsDataError("kakao_group_link", "invalid_shape"); return link; });
    const groupKeys = [...new Set([...roomMarkers.map(item => item.group_key), ...links.filter(item => item.household_id === hid).map(item => item.group_key), ...Object.entries(legacy).filter(([, item]) => item.household_id === hid).map(([key]) => key)])].sort();
    if (groupKeys.length > 1000) throw new Error("household_purge_scope_too_large");
    return {
      members, groupKeys,
      userIds: [...new Set([...members.map((member) => String(member.user_id || "")), ...candidateUsers, ...roomMarkers.map(item => item.owner_id)].filter(Boolean))].sort(),
      // V22.9.37 감사 H5: 사용자 잠금은 자동 준비 흐름이 잡는 사용자(개인 첫 기록 후보·방 표식 소유자)에만 잡는다.
      leaseUserIds: [...new Set([...candidateUsers, ...roomMarkers.map(item => String(item.owner_id || ""))].filter(Boolean))].sort(),
    };
  };
  let purge;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const before = await readPurgeScope();
    const work = async ({ assertFresh: lifecycleFresh }) => withKakaoGroupLifecycleLease(env, before.groupKeys, async ({ assertFresh: roomFresh }) => withHouseholdSettingsRmw(env, hid, async ({ assertFresh: householdFresh }) => {
      const assertFresh = () => { lifecycleFresh(); roomFresh(); householdFresh(); };
      const current = await readPurgeScope();
      if (JSON.stringify(current.userIds) !== JSON.stringify(before.userIds) || JSON.stringify(current.groupKeys) !== JSON.stringify(before.groupKeys)) throw new Error("household_purge_scope_changed");
      assertFresh();
      // Actual members and server-confirmed provisional candidates are explicitly retired.
      // V22.9.37 감사 H5: 표식은 한 번의 upsert 로 쓴다. 참여자마다 한 건씩 쓰면 하위 요청이 참여자 수에 비례해 늘어난다.
      await markKakaoChatFirstHistoryBatch(env, current.userIds);
      for (const groupKey of current.groupKeys) await markKakaoGroupRetired(env, groupKey, assertFresh);
      assertFresh();
      const result = await supabase(env, "/rest/v1/rpc/accountbook_purge_household_v227", {
        method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ p_household_id: hid }),
      });
      const summary = Array.isArray(result) ? result[0] : result;
      if (!summary?.deleted) throw new Error("household_delete_not_confirmed");
      return { summary, affectedMembers: current.members };
    }));
    try {
      // V22.9.37 감사 H5: 참여자 한 명마다 사용자 잠금을 잡고 풀면 저장소 요청이 둘씩 늘어 17명부터 삭제가 되지 않고
      // 15명부터 잠금이 남았다. 일반 참여자는 가계부 잠금 하나 안에서 표식만 한 번에 쓰고, 사용자 잠금은 자동 준비
      // 후보(개인 첫 기록 표식의 사용자·방 표식 소유자)에만 잡아 진행 중인 첫 기록과 계속 직렬화한다.
      purge = before.leaseUserIds.length ? await withKakaoUserLifecycleLease(env, before.leaseUserIds, work) : await work({ assertFresh() {} });
      break;
    } catch (err) {
      if (!/household_purge_scope_changed/.test(safeError(err)) || attempt === 2) throw err;
    }
  }
  if (!purge) throw new Error("household_delete_not_confirmed");
  if (/^[A-Za-z0-9-]+$/.test(hid)) {
    for (const prefix of ["cursor:v1", "home-layout:v1"]) {
      try { await supabase(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(`${prefix}:${hid}:*`)}`, {method:"DELETE",headers:{Prefer:"return=minimal"}}); }
      catch(error) { rememberOpsEvent({kind:"household_preference_cleanup_pending",severity:"warn",path:"/my/household/delete",method:"POST",detail:safeError(error)}); }
    }
  }

  // Relational data is already committed atomically. External lookup mappings
  // are cleaned afterwards and never make the successful deletion look failed.
  try { await removeKakaoGroupLinksForHousehold(env, hid); } catch (err) {
    rememberOpsEvent({ kind: "household_group_link_cleanup_failed", severity: "warn", path: "/my/household/delete", method: "POST", detail: "deleted household link cleanup pending" });
  }
  // V22.9.37 감사 H5: 참여자마다 선택 상태를 읽고 지우던 왕복(참여자 수에 비례)을 조회 한 번·upsert 한 번으로 줄인다.
  // purge RPC 가 같은 행을 지우므로 여기서는 늦게 남은 행만 비운다.
  try {
    const selections = await fetchPostgrestRows(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent("kakao_selected_household_v2251:*")}&value=eq.${encodeURIComponent(hid)}&select=key&order=key.asc`, { maxRows: 1000 });
    if (selections.length) {
      await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
        method: "POST",
        headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
        body: JSON.stringify(selections.map((row) => ({ key: String(row.key || ""), value: "" }))),
      });
    }
  } catch (err) {
    rememberOpsEvent({ kind: "household_selection_cleanup_failed", severity: "warn", path: "/my/household/delete", method: "POST", detail: "deleted household selection cleanup pending" });
  }
  return { ...safeObject(purge.summary), affectedMembers: purge.affectedMembers.length };
}

async function handleMyHouseholdDelete(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const confirmName = String(form.get("confirm_name") || "").trim();
  const accessCode = String(form.get("access_code") || "").trim();
  const understood = String(form.get("understand_members") || "") === "1";
  const back = `/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&manage=${encodeURIComponent(householdId)}#manage`;
  const memberships = await fetchUserHouseholds(env, userId);
  const household = memberships.find((h) => String(h.id) === householdId) || null;
  if (!household || household.role !== "owner") return redirectResponse(addQueryToUrl(back, { err: "household_delete_owner_only" }));
  if (confirmName !== String(household.name || "").trim()) return redirectResponse(addQueryToUrl(back, { err: "household_delete_name_mismatch" }));
  if (!understood) return redirectResponse(addQueryToUrl(back, { err: "household_delete_ack_required" }));
  const user = await fetchUserById(env, userId);
  const [hasLocalLogin, kakaoReauthVerified] = await Promise.all([
    hasBackupLoginIdentity(env, user),
    verifyHouseholdDeleteReauth(request, env, userId, householdId),
  ]);
  const localVerified = hasLocalLogin && accessCode ? await verifyPasswordReauth(request, env, userId, accessCode) : false;
  if (!localVerified && !kakaoReauthVerified) {
    const code = hasLocalLogin && accessCode ? "personal_password_invalid" : "account_reauth_required";
    return redirectResponse(addQueryToUrl(back, { err: code }));
  }
  try {
    await purgeHouseholdData(env, householdId);
    return redirectResponseWithCookies(`/my/households?month=${encodeURIComponent(month)}&msg=household_deleted`, [clearHouseholdDeleteReauthCookie()]);
  } catch (err) {
    rememberOpsEvent({ kind: "household_delete_failed", severity: "error", path: "/my/household/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(back, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "household_delete_failed" }));
  }
}

async function removeMemberAlias(env, householdId = "", userId = "") {
  const hid = String(householdId || "").trim();
  const uid = String(userId || "").trim();
  if (!hid || !uid) return false;
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const aliases = await fetchMemberAliasMap(env, hid, { strict: true });
    if (!Object.prototype.hasOwnProperty.call(aliases, uid)) return false;
    delete aliases[uid];
    assertFresh();
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: memberAliasSettingsKey(hid), value: JSON.stringify(aliases) }),
    });
    return true;
  }, { missingHousehold: "noop", missingResult: false });
}

async function handleMyHouseholdLeave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const understood = String(form.get("understand_history") || "") === "1";
  const back = `/my/households?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&manage=${encodeURIComponent(householdId)}#manage`;
  const role = await getHouseholdMemberRole(env, userId, householdId);
  if (!role) return redirectResponse(addQueryToUrl(back, { err: "household_leave_not_member" }));
  if (role === "owner") return redirectResponse(addQueryToUrl(back, { err: "household_leave_owner_blocked" }));
  if (role === "blocked") return redirectResponse(addQueryToUrl(back, { err: "join_blocked" }));
  if (role === "pending") {
    // V22.9.37 감사 H15: 승인 대기 중인 사람은 기록도 이력도 없다. 확인 항목 없이 자기 요청 행만 거둔다.
    try {
      const result = await cancelPendingHouseholdJoin(env, userId, householdId);
      if (!result.cancelled) return redirectResponse(addQueryToUrl(back, { err: "join_cancel_failed" }));
      return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&msg=join_request_cancelled`);
    } catch (err) {
      rememberOpsEvent({ kind: "household_join_cancel_failed", severity: "warn", path: "/my/household/leave", method: "POST", detail: safeError(err) });
      return redirectResponse(addQueryToUrl(back, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "join_cancel_failed" }));
    }
  }
  if (!understood) return redirectResponse(addQueryToUrl(back, { err: "household_leave_ack_required" }));
  try {
    const result = await withKakaoUserLifecycleLease(env, userId, async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
      const assertFresh = () => { lifecycleFresh(); householdFresh(); };
      const freshRole = await getHouseholdMemberRole(env, userId, householdId);
      if (!freshRole) throw new Error("household_leave_not_member");
      if (freshRole === "owner") throw new Error("household_owner_cannot_leave");
      if (freshRole === "blocked") throw new Error("household_blocked_member_cannot_leave");
      assertFresh();
      await markKakaoChatFirstHistory(env, userId);
      assertFresh();
      await markKakaoGroupDeparture(env, userId, householdId, assertFresh);
      assertFresh();
      return supabase(env, "/rest/v1/rpc/accountbook_leave_household_v227", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify({ p_household_id: householdId, p_user_id: userId }) });
    }));
    const summary = Array.isArray(result) ? result[0] : result;
    if (!summary?.left) throw new Error("household_leave_not_confirmed");
    try {
      const selectedId = await getKakaoSelectedHouseholdId(env, userId);
      if (String(selectedId) === householdId) await clearKakaoSelectedHousehold(env, userId);
      await removeMemberAlias(env, householdId, userId);
    } catch (cleanupErr) {
      rememberOpsEvent({ kind: "household_leave_cleanup_pending", severity: "warn", path: "/my/household/leave", method: "POST", detail: "selection or alias cleanup pending" });
    }
    return redirectResponse(`/my/households?month=${encodeURIComponent(month)}&msg=household_left`);
  } catch (err) {
    const code = isUncertainStorageWrite(err) ? "db_write_unknown" : /household_owner_cannot_leave/.test(safeError(err)) ? "household_leave_owner_blocked" : "household_leave_failed";
    rememberOpsEvent({ kind: "household_leave_failed", severity: "warn", path: "/my/household/leave", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(back, { err: code }));
  }
}

function householdJoinFeedback(joined) {
  const role = String(joined?.join_role || "");
  if (role === "blocked") return { err: "join_blocked" };
  if (!["owner", "admin", "member", "viewer", "pending"].includes(role)) return { err: "join_failed" };
  return { household_id: String(joined.id || ""), msg: role === "pending" ? "approval_pending" : role === "viewer" ? "joined_viewer" : "joined" };
}

async function handleMyJoin(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  // V22.9.37 감사 H3: 앱이 복사해 주는 "가계부 참여 CODE"·"초대코드 CODE"를 그대로 붙여 넣어도 코드만 읽는다.
  const rawCode = String(form.get("invite_code") || "").trim();
  const code = String(parseJoinCode(rawCode) || parseBareInviteCode(rawCode) || rawCode).toUpperCase();
  if (!code) return redirectResponse(returnLocation(form, "/my/households", { err: "invite_code_missing" }));
  try {
    const joined = await joinHouseholdByCode(env, userId, code);
    if (!joined) return redirectResponse(returnLocation(form, "/my/households", { err: "invite_code_not_found" }));
    const feedback = householdJoinFeedback(joined);
    const fallback = addQueryToUrl("/my/households", feedback);
    return redirectResponse(returnLocation(form, fallback, feedback));
  } catch (err) {
    rememberOpsEvent({ kind: "household_join_failed", severity: "warn", path: "/my/join", method: "POST", detail: safeError(err) });
    return redirectResponse(returnLocation(form, "/my/households", { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "join_failed" }));
  }
}

async function handleMyPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return htmlResponse(renderUserLoginHtml(env, "", safeUserReturnPath(url.searchParams.get("return_to") || "", "")));
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) {
    const user = await fetchUserById(env, userId);
    if (!user) return handleMyLogout();
    return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  }
  const households = access.households;
  if (!access.memberships?.length) {
    const msg = url.searchParams.get("msg") || "";
    const err = url.searchParams.get("err") || "";
    const qs = new URLSearchParams();
    if (msg) qs.set("msg", msg);
    if (err) qs.set("err", err);
    return redirectResponse(`/my/households${qs.toString() ? `?${qs.toString()}` : ""}#create`);
  }
  const selectedHousehold = access.selected;
  if (selectedHousehold) {
    return redirectResponse(`/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`);
  }
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  return htmlResponse(renderMyStartChoiceHtml({ env, user, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}
// @build:exports-start
export {
  handleMyCreate, handleMyHouseholdDelete, handleMyHouseholdLeave, handleMyHouseholdUpdate,
  handleMyHouseholdsPage, handleMyJoin, handleMyPage, householdJoinFeedback, householdPageMessage,
  purgeHouseholdData, removeMemberAlias,
};
// @build:exports-end
