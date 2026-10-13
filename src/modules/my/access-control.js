// @build:imports-start
import { appName } from "../public/site-config.js";
import {
  parseStrictSettingsObject, settingsDataError, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse } from "../runtime/http.js";
import { bestRoleFromRows } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
import { saveSettingValue } from "./reports-premium.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end
function myReturnLocation(month = currentMonthKst(), householdId = "", extra = {}) {
  const qs = new URLSearchParams();
  qs.set("month", validMonth(month) || currentMonthKst());
  if (householdId) qs.set("household_id", householdId);
  for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  return `/my?${qs.toString()}#records`;
}

function canWriteMyHousehold(role = "") {
  const r = String(role || "").toLowerCase();
  return ["owner", "admin", "member"].includes(r);
}

function canReadMyHousehold(role = "") {
  return ["owner", "admin", "member", "viewer"].includes(String(role || "").toLowerCase());
}

function canManageMyHousehold(role = "") {
  return ["owner", "admin"].includes(String(role || "").toLowerCase());
}

function householdAccessTitle(role = "") {
  if (role === "pending") return "참여 승인 대기 중";
  if (role === "blocked") return "이 가계부의 이용이 제한됨";
  return "이 화면은 관리자 전용";
}

function renderMyAccessStatusHtml({ env, user = null, household = null, role = "", month = currentMonthKst(), manageOnly = false }) {
  const normalizedRole = String(role || household?.role || "").toLowerCase();
  const title = manageOnly && canReadMyHousehold(normalizedRole) ? "관리자 권한이 필요한 화면" : householdAccessTitle(normalizedRole);
  let guide = "가계부 목록에서 이용 가능한 가계부를 선택하거나 새 가계부를 만들어 주세요.";
  let steps = ["가계부 전환·추가 화면으로 이동", "이용 가능한 가계부 선택", "문제가 계속되면 가계부 관리자에게 권한 확인 요청"];
  if (normalizedRole === "pending") {
    guide = "참여 요청은 정상 접수됐습니다. 같은 코드를 반복 입력해도 승인이 빨라지지 않으며, 관리자가 승인하면 기록과 조회가 열립니다.";
    steps = ["가계부 관리자에게 참여 승인 요청", "승인 전에는 다른 이용 가능한 가계부 사용", "승인 후 가계부 목록에서 다시 열기"];
  } else if (normalizedRole === "blocked") {
    guide = "초대코드를 다시 입력해도 제한은 해제되지 않습니다. 가계부 관리자만 권한을 변경할 수 있습니다.";
    steps = ["가계부 관리자에게 제한 사유와 권한 확인 요청", "다른 이용 가능한 가계부로 전환", "필요하면 별도의 새 가계부 생성"];
  } else if (manageOnly) {
    guide = "참여자·초대 및 단톡방 연결 정보는 소유자 또는 관리자만 볼 수 있습니다. 현재 권한으로는 기록 조회 화면을 계속 사용할 수 있습니다.";
    steps = ["내 가계부로 돌아가기", "관리 작업이 필요하면 소유자에게 관리자 권한 요청", "조회 전용 사용자는 기록을 변경하지 않고 조회만 이용"];
  }
  const householdName = household?.name || "선택한 가계부";
  const list = steps.map((step, index) => `<li><b>${index + 1}</b><span>${escapeHtml(step)}</span></li>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · ${escapeHtml(title)}</title><style>${MY_ACCESS_STATUS_CSS}</style></head><body><main class="wrap"><section class="card"><span class="badge">${escapeHtml(userHouseholdRoleLabel(normalizedRole || "member"))}</span><h1>${escapeHtml(title)}</h1><p class="sub"><b>${escapeHtml(householdName)}</b><br/>${escapeHtml(user?.nickname || "사용자")}님의 현재 권한을 기준으로 안전하게 접근을 제한했습니다.</p><div class="guide">${escapeHtml(guide)}</div><ol>${list}</ol><div class="actions"><a class="btn" href="/my/households">가계부 전환·추가</a>${canReadMyHousehold(normalizedRole) ? `<a class="btn soft" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(household?.id || "")}">내 가계부</a>` : `<a class="btn soft" href="/my">처음 화면</a>`}</div></section></main></body></html>`;
}

const MY_ACCESS_STATUS_CSS = `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff7ed,#f8fafc 50%);color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.08)}.badge{display:inline-flex;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:6px 10px;font-size:12px;font-weight:1000}h1{font-size:28px;margin:14px 0 8px}.sub{color:#64748b;line-height:1.65}.guide{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}ol{list-style:none;padding:0;margin:18px 0;display:grid;gap:10px}li{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;border:1px solid #e5e7eb;border-radius:16px;padding:11px}li b{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#111827;color:#fff}.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}.soft{background:#eef2f7;color:#111827}@media(max-width:620px){.wrap{padding:12px}.card{padding:19px;border-radius:22px}h1{font-size:24px}.actions,.btn{width:100%}}`;

// V22.9.37 감사 H9: 주소의 가계부가 없거나 참여하지 않은 가계부이면 첫 가계부로 바꿔 그리지 않고 이 화면을 낸다(404).
// 기준선: "사용자가 명시한 household_id 가 접근 가능한 가계부가 아니면 첫 가계부로 대체하지 않고 요청을 거부한다."
function renderHouseholdNotFoundHtml({ env, user = null, requestedId = "", listHref = "/my/households" } = {}) {
  const title = "가계부를 찾을 수 없어요";
  const guide = "주소에 적힌 가계부가 삭제되었거나 내가 참여하지 않은 가계부입니다. 다른 가계부로 바꿔 보여 주지 않았습니다.";
  const steps = ["가계부 목록에서 쓸 가계부를 다시 선택", "초대받은 가계부라면 초대코드로 참여 요청", "주소를 저장해 두었다면 새 주소로 다시 저장"];
  const list = steps.map((step, index) => `<li><b>${index + 1}</b><span>${escapeHtml(step)}</span></li>`).join("");
  const safeId = String(requestedId || "").slice(0, 80);
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · ${title}</title><style>${MY_ACCESS_STATUS_CSS}</style></head><body><main class="wrap"><section class="card"><span class="badge">찾을 수 없음</span><h1>${title}</h1><p class="sub">${safeId ? `<b>요청한 가계부 ID: ${escapeHtml(safeId)}</b><br/>` : ""}${escapeHtml(user?.nickname || "사용자")}님이 볼 수 있는 가계부 중에 이 가계부가 없습니다.</p><div class="guide">${escapeHtml(guide)}</div><ol>${list}</ol><div class="actions"><a class="btn" href="${escapeHtml(listHref)}">가계부 목록으로</a><a class="btn soft" href="/my">처음 화면</a></div></section></main></body></html>`;
}

function householdNotFoundResponse(args = {}) {
  return htmlResponse(renderHouseholdNotFoundHtml(args), 404);
}

function myAccessStatusResponse(args = {}, status = 403) {
  return htmlResponse(renderMyAccessStatusHtml(args), status);
}

function canManageMyRecord(role = "", row = {}, userId = "") {
  const r = String(role || "").toLowerCase();
  if (["owner", "admin"].includes(r)) return true;
  return canWriteMyHousehold(r) && String(row.user_id || "") === String(userId || "");
}

// V22.9.43: 소유자가 가계부마다 정하는 구성원 권한. 값이 없으면 기록·수정(구성원이 자기 기록을 고치고 지운다,
// V22.9.42까지와 같다)이다. 기록만이면 구성원은 새 기록만 더하고, 수정·삭제·복구와 공동 설정 변경은 소유자·관리자가 한다.
// DB 역할 값(household_members.role)은 바꾸지 않는다. 역할 제약(V22.8.46) 밖의 새 역할을 만들지 않기 위해서다.
const MEMBER_POLICY_RECORD_ONLY = "record_only";
const MEMBER_POLICY_RECORD_EDIT = "record_edit";

function memberPolicySettingsKey(householdId = "") {
  return `household_member_policy_v22943:${String(householdId || "").trim()}`;
}

function parseMemberPolicyValue(value) {
  const item = parseStrictSettingsObject(value, "household_member_policy");
  if (!Object.keys(item).length) return MEMBER_POLICY_RECORD_EDIT;
  if (item.version !== 1 || ![MEMBER_POLICY_RECORD_ONLY, MEMBER_POLICY_RECORD_EDIT].includes(item.mode)) throw settingsDataError("household_member_policy", "invalid_shape");
  return item.mode;
}

// 읽기 실패와 모양이 틀린 값은 오류로 올린다. 부르는 쪽이 허용으로 넘어가지 않고 거절(막힌 쪽)로 처리한다.
async function fetchHouseholdMemberPolicy(env, householdId = "") {
  const hid = String(householdId || "").trim();
  if (!hid) throw new Error("household_id_required");
  const cache = env?.__AB_MEMBER_POLICY instanceof Map ? env.__AB_MEMBER_POLICY : null;
  if (cache?.has(hid)) return cache.get(hid);
  const mode = parseMemberPolicyValue(await getSettingValueStrict(env, memberPolicySettingsKey(hid)));
  cache?.set(hid, mode);
  return mode;
}

// 기록을 고치고 지우는 권한(자기 기록 기준은 canManageMyRecord 가 따로 본다). 소유자·관리자는 정책과 무관하고,
// 조회 전용·승인 대기·이용 제한은 원래부터 막혀 있다. 구성원만 정책을 한 번 읽는다.
async function canChangeMyHouseholdRecords(env, role = "", householdId = "") {
  const r = String(role || "").toLowerCase();
  if (["owner", "admin"].includes(r)) return true;
  if (r !== "member") return false;
  return (await fetchHouseholdMemberPolicy(env, householdId)) !== MEMBER_POLICY_RECORD_ONLY;
}

// 홈 화면이 다른 설정과 함께 한 번에 읽은 값을 풀 때 쓴다. 깨진 값은 ‘기록만’으로 보고 단추를 숨긴다.
function homeMemberPolicyValue(value) {
  try { return parseMemberPolicyValue(value); } catch (_) { return MEMBER_POLICY_RECORD_ONLY; }
}

// 화면에서 수정·삭제 단추를 보일지 정할 때만 쓴다. 읽지 못하면 단추를 숨긴다(서버 경로는 따로 다시 확인한다).
async function canChangeMyHouseholdRecordsForView(env, role = "", householdId = "") {
  try { return await canChangeMyHouseholdRecords(env, role, householdId); }
  catch (_) { return false; }
}

function memberPolicyLabel(mode = "") {
  return mode === MEMBER_POLICY_RECORD_ONLY ? "기록만" : "기록·수정";
}

function memberPolicyDescription(mode = "") {
  return mode === MEMBER_POLICY_RECORD_ONLY
    ? "구성원은 새 기록만 남기고, 수정·삭제는 소유자·관리자가 해요."
    : "구성원은 기록하고, 자기가 쓴 기록을 고치거나 지울 수 있어요.";
}

function memberRecordChangeMessage(code = "") {
  return code === "member_policy_unavailable"
    ? "구성원 권한을 확인하지 못해 기록을 바꾸지 않았습니다. 잠시 후 다시 시도하세요."
    : "소유자가 구성원 권한을 ‘기록만’으로 정해 기록을 수정·삭제할 수 없습니다. 소유자나 관리자에게 요청하세요.";
}

// 기록을 고치거나 지우는 웹·API 경로가 쓰는 판정. ""이면 허용, 아니면 화면 오류 코드다.
async function memberRecordChangeError(env, role = "", householdId = "") {
  try { return (await canChangeMyHouseholdRecords(env, role, householdId)) ? "" : "member_record_only"; }
  catch (_) { return "member_policy_unavailable"; }
}

// 소유자만 바꾼다. 가계부 잠금 안에서 역할을 다시 엄격하게 읽고 쓰며, 삭제된 가계부에는 쓰지 않는다.
// 저장된 값이 깨져 있으면 소유자가 고른 새 값으로 덮어 고친다.
async function saveHouseholdMemberPolicy(env, householdId = "", actorUserId = "", mode = "") {
  const hid = String(householdId || "").trim();
  const actor = String(actorUserId || "").trim();
  if (!hid || !actor || ![MEMBER_POLICY_RECORD_ONLY, MEMBER_POLICY_RECORD_EDIT].includes(mode)) return { ok: false, error: "member_policy_invalid" };
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const rows = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(hid)}&user_id=eq.${encodeURIComponent(actor)}&select=role`, { method: "GET" });
    if (!Array.isArray(rows)) throw new Error("member_policy_role_source_invalid");
    if (bestRoleFromRows(rows) !== "owner") return { ok: false, error: "member_policy_owner_only" };
    const key = memberPolicySettingsKey(hid);
    let current = "";
    try { current = parseMemberPolicyValue(await getSettingValueStrict(env, key)); } catch (err) { if (err?.code !== "settings_data_invalid") throw err; }
    if (current !== mode) {
      assertFresh();
      await saveSettingValue(env, key, JSON.stringify({ version: 1, mode, updated_by: actor, updated_at: new Date().toISOString() }));
    }
    if (env?.__AB_MEMBER_POLICY instanceof Map) env.__AB_MEMBER_POLICY.set(hid, mode);
    return { ok: true, mode, unchanged: current === mode };
  }, { missingHousehold: "noop", missingResult: { ok: false, error: "member_policy_household_missing" } });
}

function memberRecordOnlyRefusalText(householdName = "") {
  return `‘${householdName || "이 가계부"}’는 소유자가 구성원 권한을 ‘기록만’으로 정해 기록을 고치거나 지울 수 없어요. 고칠 내용은 소유자나 관리자에게 알려 주세요.`;
}

function memberPolicyJoinLine(mode = "") {
  return mode === MEMBER_POLICY_RECORD_ONLY
    ? "내 권한: 기록만 (수정·삭제는 소유자·관리자가 해요)"
    : "내 권한: 기록·수정 (내가 쓴 기록은 고치고 지울 수 있어요)";
}

async function getMySelectedHousehold(env, userId, householdId = "") {
  const memberships = await fetchUserHouseholds(env, userId);
  const households = memberships.filter((h) => canReadMyHousehold(h.role));
  const requestedId = String(householdId || "").trim();
  if (!memberships.length) return { households, memberships, selected: null, restricted: null, invalidRequested: requestedId };
  const requested = requestedId ? memberships.find((h) => String(h.id) === requestedId) || null : null;
  if (requestedId && !requested) return { households, memberships, selected: null, restricted: null, invalidRequested: requestedId };
  if (requested && !canReadMyHousehold(requested.role)) return { households, memberships, selected: null, restricted: requested, invalidRequested: "" };
  if (!households.length) return { households, memberships, selected: null, restricted: requested || memberships[0] || null, invalidRequested: "" };
  const selected = (requested && canReadMyHousehold(requested.role) ? requested : null) || households[0] || null;
  return { households, memberships, selected, restricted: null, invalidRequested: "" };
}
// @build:exports-start
export {
  MEMBER_POLICY_RECORD_EDIT, MEMBER_POLICY_RECORD_ONLY, canChangeMyHouseholdRecords,
  canChangeMyHouseholdRecordsForView, canManageMyHousehold, canManageMyRecord, canReadMyHousehold,
  canWriteMyHousehold, fetchHouseholdMemberPolicy, getMySelectedHousehold, homeMemberPolicyValue,
  householdNotFoundResponse, memberPolicyDescription, memberPolicyJoinLine, memberPolicyLabel,
  memberPolicySettingsKey, memberRecordChangeError, memberRecordChangeMessage,
  memberRecordOnlyRefusalText, myAccessStatusResponse, myReturnLocation, parseMemberPolicyValue,
  renderHouseholdNotFoundHtml, renderMyAccessStatusHtml, saveHouseholdMemberPolicy,
};
// @build:exports-end
