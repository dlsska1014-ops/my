// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  fetchAdminHouseholds, selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import { saveSettingValue } from "./reports-premium.js";
import { getMySelectedHousehold, myAccessStatusResponse } from "./access-control.js";
import {
  HOME_LAYOUT_REPORTS, HOME_LAYOUT_SHORTCUTS, homeLayoutKey, normalizeHomeLayout,
} from "./home-sections.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// V22.8.81: 예산(/budgets)·정기(/reserve-plans)·설정(/my/settings) 세 화면이 서로를
//   몰라서 진입점이 흩어져 있었다. 특히 /my/settings 는 좌측 사이드바에서만 열려
//   메인 내비게이션으로는 도달할 길이 없었다. 라우트는 그대로 두고 같은 탭 바를
//   세 화면 위에 올려 하나의 묶음으로 보이게 한다.
//   탭 이름과 부제는 "이번 달만 적용되는 예산"과 "매달 반복되는 정기"를 구분한다.
const MONEY_PLAN_TABS = [
  ["budgets", "월별 예산·수입", "/budgets", "이번 달에만 적용"],
  ["reserve-plans", "정기 수입·지출", "/reserve-plans", "매달·매년 반복"],
  ["settings", "설정 한눈에", "/my/settings", "요약·정기·분류"],
];

function renderMoneyPlanTabs(active = "budgets", { month = currentMonthKst(), householdId = "" } = {}) {
  const qs = `month=${encodeURIComponent(validMonth(month) || currentMonthKst())}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  const links = MONEY_PLAN_TABS.map(([key, label, path, hint]) => {
    const on = key === active;
    return `<a href="${escapeHtml(`${path}?${qs}`)}"${on ? ' class="on" aria-current="page"' : ""}><b>${escapeHtml(label)}</b><small>${escapeHtml(hint)}</small></a>`;
  }).join("");
  return `<nav class="abMoneyPlanTabs" aria-label="예산·정기 설정">${links}</nav>`;
}

function moneyPlanTabsCss() {
  return `.abMoneyPlanTabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}`
    + `.abMoneyPlanTabs a{display:grid;gap:3px;align-content:center;padding:11px 12px;border:1px solid #e5e7eb;border-radius:16px;background:#fff;color:#475467!important;text-decoration:none;min-width:0}`
    + `.abMoneyPlanTabs a b{font-size:14px;font-weight:1000;overflow-wrap:anywhere}`
    + `.abMoneyPlanTabs a small{font-size:11px;color:#667085;font-weight:900}`
    + `.abMoneyPlanTabs a.on{background:#111827;border-color:#111827;color:#fff!important}`
    + `.abMoneyPlanTabs a.on small{color:#cbd5e1}`
    + `@media(max-width:600px){.abMoneyPlanTabs{grid-template-columns:1fr;gap:6px}.abMoneyPlanTabs a{display:flex;align-items:baseline;gap:8px;padding:10px 12px}}`
    + `html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a{background:#1e2026;border-color:#3b475a;color:#edeff3!important}`
    + `html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a small{color:#b3bdc9}`
    + `html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a.on{background:#1d4ed8;border-color:#1d4ed8;color:#fff!important}`
    + `html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a.on small{color:#dbeafe}`;
}

// V22.8.95 (10.1): "마우스 따라오는 표시" 스위치. 기본 켜짐이고 값은 홈 구성과
// 같은 키-값 저장소에 담는다(새 표 없음). 기본값이 켜짐이라 **꺼 둔 사람만** 줄이
// 생긴다 — 대다수 계정에서 저장 자체가 없다.
function cursorPrefKey(householdId, userKey) {
  return `cursor:v1:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared").trim() || "shared"}`;
}
async function handleCursorPreference(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const adminOk = await verifyAdminSession(request, env);
  if (!userId && !adminOk) return jsonResponse({ ok: false, on: true }, 401);
  const householdId = String(url.searchParams.get("household_id") || "").trim();
  const value = String(await getSettingValue(env, cursorPrefKey(householdId, userId || "shared")).catch(() => "") || "");
  // 값이 없으면 켜짐. 이 폴백이 기본값이다.
  return jsonResponse({ ok: true, on: value !== "off" });
}
async function handleCursorPreferenceSave(request, env) {
  const userId = await verifyUserSession(request, env);
  const adminOk = await verifyAdminSession(request, env);
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = `/menu?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  if (!userId && !adminOk) return redirectResponse("/my");
  if (userId) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!role || ["pending", "blocked"].includes(String(role).toLowerCase())) return redirectResponse("/app?err=household_scope");
  }
  const on = String(form.get("cursor") || "") === "on";
  await saveSettingValue(env, cursorPrefKey(householdId, userId || "shared"), on ? "on" : "off");
  return redirectResponse(`${back}&msg=cursor_saved#abAppearanceTitle`);
}

// V22.8.94 (8.4) 홈 구성 편집 화면.
// 드래그는 만들지 않는다 — 키보드·스크린리더 비용이 크다. 체크와 "위/아래" 버튼
// 두 가지로만 정하고, 둘 다 폼 submit 이라 JS 없이도 끝까지 동작한다.
function renderHomeLayoutSection(title, note, catalogue, section, field) {
  const labels = Object.fromEntries(catalogue);
  const order = safeArray(section.order);
  const rows = order.map((id, index) => {
    const on = !safeArray(section.hidden).includes(id);
    return `<li class="hlRow"><label class="hlPick"><input type="checkbox" name="${field}_on" value="${escapeHtml(id)}"${on ? " checked" : ""}/><span>${escapeHtml(labels[id] || id)}</span></label><input type="hidden" name="${field}_order" value="${escapeHtml(id)}"/><span class="hlMove"><button type="submit" name="move" value="${escapeHtml(`${field}:${id}:up`)}"${index === 0 ? " disabled" : ""} aria-label="${escapeHtml(`${labels[id] || id} 위로`)}">↑</button><button type="submit" name="move" value="${escapeHtml(`${field}:${id}:down`)}"${index === order.length - 1 ? " disabled" : ""} aria-label="${escapeHtml(`${labels[id] || id} 아래로`)}">↓</button></span></li>`;
  }).join("");
  return `<section class="card"><h2>${escapeHtml(title)}</h2><p class="muted">${escapeHtml(note)}</p><ol class="hlList">${rows}</ol></section>`;
}

async function handleHomeLayoutPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const adminOk = await verifyAdminSession(request, env);
  if (!userId && !adminOk) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  let selected = null;
  if (userId) {
    const user = await fetchUserById(env, userId);
    const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
    if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
    households = access.households;
    selected = access.selected;
  } else {
    households = await fetchAdminHouseholds(env);
    selected = selectRequestedScopedHousehold(households, url.searchParams.get("household_id") || "");
  }
  if (!selected) return redirectResponse(userId ? "/my/households?err=no_household" : "/?legacy=1");
  const householdId = selected.id || "";
  // V22.9.34 감사 S11: 저장된 홈 구성을 못 읽었으면 기본 구성으로 채운 폼을 그리지 않는다.
  // 그 폼은 전체 구성을 다시 저장하므로, 한 칸만 바꿔도 숨겨 둔 카드·순서가 기본값으로 돌아갔다.
  let layoutReadFailed = false;
  let layout;
  try {
    layout = normalizeHomeLayout(await getSettingValueStrict(env, homeLayoutKey(householdId, userId || "shared")));
  } catch (err) {
    layoutReadFailed = true;
    layout = normalizeHomeLayout("");
    rememberOpsEvent({ kind: "layout_settings_read_failed", severity: "warn", path: "/home-layout", method: "GET", detail: safeError(err) });
  }
  const hh = `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const appHref = `/app?${hh}`;
  const msg = url.searchParams.get("msg") || "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 홈 구성</title><style>*,*:before,*:after{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:var(--ab12-bg,#f6f7fb);color:var(--ab12-text,#101828);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:760px;margin:0 auto;padding:16px 16px 120px}.hero,.card{background:var(--ab12-surface,#fff);border:1px solid var(--ab12-line,#e5e7eb);border-radius:var(--ab12-r-lg,16px);padding:var(--ab12-sp-5,20px);margin:12px 0}.hero h1{margin:0 0 7px;font-size:23px}.muted{color:var(--ab12-muted,#667085);line-height:1.6;margin:0 0 12px;font-size:13px}.hlList{list-style:none;margin:0;padding:0;display:grid;gap:8px}.hlRow{display:flex;align-items:center;gap:10px;border:1px solid var(--ab12-line,#e5e7eb);border-radius:var(--ab12-r-md,12px);padding:0 10px;min-height:56px}.hlPick{flex:1;display:flex;align-items:center;gap:10px;min-height:44px;cursor:pointer;font-weight:800}.hlPick input{width:22px;height:22px}.hlMove{display:flex;gap:6px}.hlMove button{width:44px;height:44px;border:1px solid var(--ab12-line,#e5e7eb);border-radius:var(--ab12-r-sm,8px);background:var(--ab12-surface,#fff);color:var(--ab12-text,#111827);font-size:16px;font-weight:1000;cursor:pointer}.hlMove button[disabled]{opacity:.35;cursor:default}.hlSave{width:100%;min-height:52px;border:0;border-radius:var(--ab12-r-md,12px);background:var(--ab12-action,#111827);color:#fff;font-weight:1000;font-size:15px;cursor:pointer;margin-top:12px}.hlBack{display:inline-flex;align-items:center;min-height:44px;color:var(--ab12-action,#1e3a8a);font-weight:900;text-decoration:none}.ok{background:var(--ab12-accent-soft,#ecfdf5);color:var(--ab12-action,#166534);border-radius:var(--ab12-r-md,12px);padding:12px;font-weight:900;margin:12px 0}.err{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:var(--ab12-r-md,12px);padding:12px;font-weight:800;margin:12px 0}.fixedNote{border-left:3px solid var(--ab12-line,#e5e7eb);padding-left:12px;color:var(--ab12-muted,#667085);font-size:13px;line-height:1.7}</style></head><body>${renderUnifiedNav("home", { month, householdId, householdName: selected.name })}<main class="wrap"><section class="hero"><h1>홈 구성</h1><p class="muted">${escapeHtml(selected.name || "가계부")} · 홈에 보일 리포트와 바로가기를 고르고 순서를 정합니다. 이 설정은 이 가계부에서 나에게만 적용됩니다.</p><p class="fixedNote">쓸 수 있는 돈과 최근 내역은 홈의 뼈대라 끄거나 옮길 수 없습니다.</p></section>${msg === "saved" ? `<div class="ok">홈 구성을 저장했습니다.</div>` : ""}${layoutReadFailed ? `<div class="err" role="alert">홈 구성을 불러오지 못해 지금은 바꿀 수 없습니다. 저장된 구성은 그대로이니 잠시 뒤 새로고침해 주세요.</div>` : `<form method="post" action="/home-layout/save"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/>${renderHomeLayoutSection("이번 달 리포트", "체크를 끄면 그 카드가 홈에서 사라집니다. 위아래 버튼으로 순서를 옮깁니다.", HOME_LAYOUT_REPORTS, layout.reports, "reports")}${renderHomeLayoutSection("바로가기", "자주 쓰지 않는 곳은 꺼 두면 홈이 짧아집니다. 전체 메뉴에서는 그대로 갈 수 있습니다.", HOME_LAYOUT_SHORTCUTS, layout.shortcuts, "shortcuts")}<button class="hlSave" type="submit" name="save" value="1">홈 구성 저장</button></form>`}<p><a class="hlBack" href="${escapeHtml(appHref)}">← 홈으로 돌아가기</a></p></main></body></html>`);
}

async function handleHomeLayoutSave(request, env) {
  const userId = await verifyUserSession(request, env);
  const adminOk = await verifyAdminSession(request, env);
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = `/home-layout?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  if (!userId && !adminOk) return redirectResponse("/my");
  // 홈 구성은 내 화면 설정이라 가계부를 볼 수 있으면 바꿀 수 있다. 다만 볼 수 없는
  // 가계부의 키에 쓰지 못하게 소속은 확인한다.
  if (userId) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!role || ["pending", "blocked"].includes(String(role).toLowerCase())) {
      return redirectResponse(`/app?err=household_scope`);
    }
  }
  const read = (field) => {
    const order = form.getAll(`${field}_order`).map((id) => String(id || "").trim());
    const on = form.getAll(`${field}_on`).map((id) => String(id || "").trim());
    return { order, hidden: order.filter((id) => !on.includes(id)) };
  };
  const next = { reports: read("reports"), shortcuts: read("shortcuts") };
  // "위/아래" 버튼도 같은 폼을 보낸다 — 누른 버튼의 값으로 한 칸만 옮기고 저장한다.
  const move = String(form.get("move") || "").trim();
  const [moveField, moveId, moveDir] = move.split(":");
  if (moveField && next[moveField]) {
    const order = next[moveField].order;
    const at = order.indexOf(moveId);
    const to = moveDir === "up" ? at - 1 : at + 1;
    if (at >= 0 && to >= 0 && to < order.length) {
      order.splice(to, 0, order.splice(at, 1)[0]);
    }
  }
  const layout = normalizeHomeLayout(next);
  await saveSettingValue(env, homeLayoutKey(householdId, userId || "shared"), JSON.stringify(layout));
  return redirectResponse(`${back}&msg=saved`);
}
// @build:exports-start
export {
  cursorPrefKey, handleCursorPreference, handleCursorPreferenceSave, handleHomeLayoutPage,
  handleHomeLayoutSave, moneyPlanTabsCss, renderMoneyPlanTabs,
};
// @build:exports-end
