// @build:imports-start
import { appName } from "../public/site-config.js";
import { htmlResponse } from "../runtime/http.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { fetchUserHouseholds } from "../data/users-household-create.js";
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
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · ${escapeHtml(title)}</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff7ed,#f8fafc 50%);color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.08)}.badge{display:inline-flex;border-radius:999px;background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;padding:6px 10px;font-size:12px;font-weight:1000}h1{font-size:28px;margin:14px 0 8px}.sub{color:#64748b;line-height:1.65}.guide{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}ol{list-style:none;padding:0;margin:18px 0;display:grid;gap:10px}li{display:grid;grid-template-columns:34px 1fr;gap:10px;align-items:center;border:1px solid #e5e7eb;border-radius:16px;padding:11px}li b{display:grid;place-items:center;width:30px;height:30px;border-radius:50%;background:#111827;color:#fff}.actions{display:flex;gap:8px;flex-wrap:wrap}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}.soft{background:#eef2f7;color:#111827}@media(max-width:620px){.wrap{padding:12px}.card{padding:19px;border-radius:22px}h1{font-size:24px}.actions,.btn{width:100%}}</style></head><body><main class="wrap"><section class="card"><span class="badge">${escapeHtml(userHouseholdRoleLabel(normalizedRole || "member"))}</span><h1>${escapeHtml(title)}</h1><p class="sub"><b>${escapeHtml(householdName)}</b><br/>${escapeHtml(user?.nickname || "사용자")}님의 현재 권한을 기준으로 안전하게 접근을 제한했습니다.</p><div class="guide">${escapeHtml(guide)}</div><ol>${list}</ol><div class="actions"><a class="btn" href="/my/households">가계부 전환·추가</a>${canReadMyHousehold(normalizedRole) ? `<a class="btn soft" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(household?.id || "")}">내 가계부</a>` : `<a class="btn soft" href="/my">처음 화면</a>`}</div></section></main></body></html>`;
}

function myAccessStatusResponse(args = {}, status = 403) {
  return htmlResponse(renderMyAccessStatusHtml(args), status);
}

function canManageMyRecord(role = "", row = {}, userId = "") {
  const r = String(role || "").toLowerCase();
  if (["owner", "admin"].includes(r)) return true;
  return canWriteMyHousehold(r) && String(row.user_id || "") === String(userId || "");
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
  canManageMyHousehold, canManageMyRecord, canReadMyHousehold, canWriteMyHousehold,
  getMySelectedHousehold, myAccessStatusResponse, myReturnLocation, renderMyAccessStatusHtml,
};
// @build:exports-end
