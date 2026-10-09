// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { moneyTokenSpans } from "../client/shared-input-parsers.js";
import { safeError, withSettingsRmwLease } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { safeArray } from "../admin/backup-compare.js";
import { maskKey } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  canManageMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { budgetPlanFingerprint, fetchBudgets, optionalSupabase } from "../domain/budgets.js";
import { addQueryToUrl, renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { DEFAULT_CATEGORIES } from "../admin/dashboard-fragments.js";
import { mergedOptions } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { fetchKakaoGroupLinkMap } from "../kakao/group-links-first-record.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

// 키워드 편집기는 설정 화면과 분류·키워드 화면 두 곳에서 쓴다. 결과를 항상 설정 화면으로 돌려보내면
// 설정 화면을 볼 수 없는 구성원·조회 전용 사용자가 403 화면에 갇히므로, 온 화면으로 되돌린다.
function keywordEditorLocation(returnTo = "", month = currentMonthKst(), householdId = "", extra = {}) {
  if (String(returnTo || "") !== "guide") return mySettingsLocation(month, householdId, extra);
  const qs = new URLSearchParams();
  qs.set("month", validMonth(month) || currentMonthKst());
  if (householdId) qs.set("household_id", householdId);
  for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  return `/keyword-guide?${qs.toString()}`;
}

function mySettingsLocation(month = currentMonthKst(), householdId = "", extra = {}) {
  const qs = new URLSearchParams();
  qs.set("month", validMonth(month) || currentMonthKst());
  if (householdId) qs.set("household_id", householdId);
  for (const [k, v] of Object.entries(extra || {})) if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  return `/my/settings?${qs.toString()}`;
}

async function handleMyGroupsPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { households, selected, restricted } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
  if (!canManageMyHousehold(selected.role)) return myAccessStatusResponse({ env, user, household: selected, role: selected.role, month, manageOnly: true });
  const map = await fetchKakaoGroupLinkMap(env);
  const linked = Object.entries(map).filter(([k, v]) => String(v.household_id || "") === String(selected.id));
  const rows = linked.length ? linked.map(([groupKey, item]) => `<tr><td>${escapeHtml(maskKey(groupKey))}</td><td>${escapeHtml(item.household_name || selected.name)}</td><td>${escapeHtml(String(item.linked_at || "").slice(0, 19).replace("T", " "))}</td><td>${escapeHtml(maskKey(item.linked_by || ""))}</td></tr>`).join("") : `<tr><td colspan="4">아직 연결된 단톡방이 없습니다.</td></tr>`;
  const code = selected.invite_code || "";
  const title = escapeHtml(appName(env));
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 단톡방 연결</title><style>${myNavCss()}body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#dbeafe}.cmd{background:#111827;color:#fff;border-radius:18px;padding:15px;font-size:20px;font-weight:1000;word-break:break-all}.muted{color:#667085;line-height:1.65}.warn{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:18px;padding:14px;line-height:1.65}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left}.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "groups")}<div class="pageMain"><section class="hero"><h1>단톡방-가계부 연결</h1><p>카카오 챗봇이 초대되어 있는 그룹 채팅방에서만 연결할 수 있습니다.</p></section><section class="card"><h2>연결 조건</h2><div class="warn"><b>중요</b><br/>이 기능은 카카오 챗봇이 해당 단톡방에 들어가 있고, 그 방에서 봇에게 메시지를 보낼 수 있을 때만 동작합니다. 일반 웹 화면에서 버튼만 눌러 연결하는 방식이 아닙니다. 웹 접속 사용자와 카카오 챗봇 사용자의 고유키가 다를 수 있으므로, 초대코드를 알고 있는 것을 연결 승인 기준으로 사용합니다.</div></section><section class="card"><h2>연결 명령어</h2><p class="muted">연결하려는 카카오 그룹 채팅방에서 아래 문장을 그대로 보내세요.</p><div class="cmd">단톡방 연결 ${escapeHtml(code)}</div><p class="muted">초대코드는 외부에 공개하지 마세요. 연결 후에는 이 방에서 “점심 12000원 국민카드”, “요약”, “남은예산”을 사용할 수 있습니다.</p><p><a class="btn secondary" href="/my?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}">내 가계부</a> <a class="btn secondary" href="/my/settings?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}">설정</a></p></section><section class="card"><h2>현재 연결 목록</h2><table><thead><tr><th>그룹키</th><th>가계부</th><th>연결일</th><th>연결자</th></tr></thead><tbody>${rows}</tbody></table></section></div></div></main></body></html>`);
}

function incomeBudgetCategory(name = "") {
  const clean = String(name || "").trim().slice(0, 60);
  return clean ? `__income:${clean}` : "__income:기타수입";
}

function isIncomeBudgetCategory(category = "") {
  return String(category || "").startsWith("__income:");
}

function incomeBudgetName(category = "") {
  return String(category || "").replace(/^__income:/, "") || "기타수입";
}

function defaultIncomeBudgetNames() {
  return ["월급", "상여/성과급", "부수입", "기타수입"];
}

function defaultExpenseBudgetNames(customCategories = []) {
  return mergedOptions(DEFAULT_CATEGORIES, safeArray(customCategories).map((c) => c.name)).slice(0, 24);
}

function amountOfBudget(budgets = [], category = "") {
  const row = safeArray(budgets).find((b) => normalizeText(b.category) === normalizeText(category));
  return Number(row?.amount || 0);
}

function incomeBudgetRows(budgets = []) {
  const rows = safeArray(budgets)
    .filter((b) => isIncomeBudgetCategory(b.category) && Number(b.amount || 0) > 0)
    .map((b) => ({ ...b, name: incomeBudgetName(b.category), amount: Number(b.amount || 0) }));
  const names = new Set(rows.map((r) => normalizeText(r.name)));
  for (const name of defaultIncomeBudgetNames()) {
    if (!names.has(normalizeText(name))) rows.push({ category: incomeBudgetCategory(name), name, amount: 0 });
  }
  return rows;
}

function expenseBudgetRows(budgets = [], customCategories = []) {
  const defaults = defaultExpenseBudgetNames(customCategories);
  const rows = [];
  const seen = new Set();
  for (const name of defaults) {
    const amount = amountOfBudget(budgets, name);
    rows.push({ category: name, name, amount });
    seen.add(normalizeText(name));
  }
  for (const b of safeArray(budgets)) {
    const cat = String(b.category || "");
    if (!cat || cat === "__total" || cat === "__income" || isIncomeBudgetCategory(cat)) continue;
    if (seen.has(normalizeText(cat))) continue;
    rows.push({ category: cat, name: cat, amount: Number(b.amount || 0) });
    seen.add(normalizeText(cat));
  }
  return rows;
}

function sumBudgetAmounts(rows = []) {
  return safeArray(rows).reduce((a, r) => a + Number(r.amount || 0), 0);
}

function categorySpentMap(rows = []) {
  const map = Object.create(null);
  for (const r of safeArray(rows)) {
    if (r.type === "income") continue;
    const c = r.category || "기타";
    map[c] = (map[c] || 0) + Number(r.amount || 0);
  }
  return map;
}

function recurringSummary(recurring = []) {
  const active = safeArray(recurring).filter((r) => !(r.is_active === false || String(r.is_active) === "false"));
  const income = active.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const expense = active.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  return { income, expense, net: income - expense, count: active.length };
}

async function upsertMyBudgetRow(env, householdId = "", month = currentMonthKst(), category = "", amount = 0) {
  const body = { household_id: householdId, month, category, amount: Math.max(0, Math.round(Number(amount || 0))) };
  try {
    await supabase(env, "/rest/v1/accountbook_budgets?on_conflict=household_id,month,category", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify(body),
    });
  } catch (err) {
    // 예전에는 여기서 settings 폴백에 써서 실패가 보이지 않았다. 이제는 올린다.
    rememberOpsEvent({ kind: "budget_row_upsert_failed", severity: "warn", path: "/budget/upsert", method: "POST", detail: safeError(err) });
    throw err;
  }
  return body;
}

async function clearMyBudgetPlan(env, householdId = "", month = currentMonthKst()) {
  const hid = String(householdId || "").trim();
  const m = validMonth(month) || currentMonthKst();
  if (!hid) return;
  await optionalSupabase(env, `/rest/v1/accountbook_budgets?household_id=eq.${encodeURIComponent(hid)}&month=eq.${encodeURIComponent(m)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  }, null);
}

// V22.9.26: 예산 폼의 금액은 문장이 아니라 숫자 칸이다. 문장 파서는 "999" 같은 네 자리 미만을
// 금액으로 보지 않아 0원이 됐고, 0원은 그 분류 삭제였다. 순수 숫자는 그대로 읽고 "50만" 같은
// 표기만 문장 파서에 맡긴다.
function parseBudgetFormAmount(value = "") {
  const raw = String(value ?? "").trim();
  if (!raw) return 0;
  if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?\s*원?$/.test(raw)) return Math.round(Number(raw.replace(/[^\d.]/g, "")));
  const spans = moneyTokenSpans(raw);
  return spans.length === 1 && spans[0].raw === raw ? spans[0].amount : NaN;
}

async function handleMyBudgetBulkSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const monthInput = String(form.get("month") || "").trim();
  const month = validMonth(monthInput) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const returnTo = String(form.get("budget_return") || "") === "budgets"
    ? `/budgets?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`
    : mySettingsLocation(month, householdId);
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(addQueryToUrl(returnTo, { err: "write_not_allowed" }));
  // V22.9.26: 달이 깨진 폼은 현재 달 계획을 통째로 바꾸지 않고 거절한다.
  if (monthInput && month !== monthInput) return redirectResponse(addQueryToUrl(returnTo, { err: "invalid_month" }));

  const incomeNames = form.getAll("income_name").map((v) => String(v || "").trim().slice(0, 60));
  const incomeAmounts = form.getAll("income_amount").map((v) => parseBudgetFormAmount(v));
  const expenseNames = form.getAll("budget_category").map((v) => String(v || "").trim().slice(0, 80));
  const expenseAmounts = form.getAll("budget_amount").map((v) => parseBudgetFormAmount(v));
  if ([...incomeAmounts,...expenseAmounts].some(amount => !Number.isFinite(amount) || amount < 0 || amount > MAX_TRANSACTION_AMOUNT)) return redirectResponse(addQueryToUrl(returnTo, {err:"invalid_budget_amount"}));
  // V22.9.34 감사 S3: 이 저장은 그 달 계획 전체를 바꾼다. 폼이 그려질 때의 계획 지문이 없거나
  // (읽기 실패로 빈 폼이 그려졌거나 배포 전에 열어 둔 화면) 지금 계획과 다르면 덮어쓰지 않는다.
  const submittedFingerprint = String(form.get("plan_fingerprint") || "").trim();
  if (!/^p1-\d+-[0-9a-f]{8}$/.test(submittedFingerprint)) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_form_stale" }));

  try {
    const plan = new Map();
    for (let i = 0; i < incomeNames.length; i++) {
      const name = incomeNames[i] || defaultIncomeBudgetNames()[i] || `수입${i + 1}`;
      const amount = Math.max(0, Math.min(2000000000, Math.round(Number(incomeAmounts[i] || 0))));
      if (!amount) continue;
      plan.set(normalizeText(incomeBudgetCategory(name)), { category: incomeBudgetCategory(name), amount });
    }
    for (let i = 0; i < expenseNames.length; i++) {
      const name = expenseNames[i];
      if (!name) continue;
      const amount = Math.max(0, Math.min(2000000000, Math.round(Number(expenseAmounts[i] || 0))));
      if (!amount) continue;
      plan.set(normalizeText(name), { category: name, amount });
    }
    const rows = [...plan.values()];
    if (rows.length > 100) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_plan_too_many" }));
    const outcome = await withBudgetPlanLease(env, selected.id, month, async ({ assertFresh }) => {
      let current;
      try {
        current = await fetchBudgets(env, selected.id, month, { strict: true });
      } catch (readErr) {
        rememberOpsEvent({ kind: "my_budget_bulk_read_failed", severity: "warn", path: "/my/budget-bulk/save", method: "POST", detail: safeError(readErr) });
        return "read_failed";
      }
      if (budgetPlanFingerprint(current) !== submittedFingerprint) return "changed";
      assertFresh();
      await supabase(env, "/rest/v1/rpc/accountbook_replace_budget_plan_v227", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify({ p_household_id: selected.id, p_month: month, p_rows: rows }),
      });
      return "saved";
    });
    if (outcome === "read_failed") return redirectResponse(addQueryToUrl(returnTo, { err: "budget_read_failed" }));
    if (outcome === "changed") return redirectResponse(addQueryToUrl(returnTo, { err: "budget_changed" }));
    return redirectResponse(addQueryToUrl(returnTo, { msg: "budget_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_budget_bulk_save_failed", severity: "warn", path: "/my/budget-bulk/save", method: "POST", detail: safeError(err) });
    if (/settings_rmw_busy/.test(safeError(err))) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_busy" }));
    return redirectResponse(addQueryToUrl(returnTo, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "budget_save_failed" }));
  }
}

// V22.9.34 감사 S3·S6: 그 달 예산 계획을 통째로 바꾸는 쓰기(웹 일괄 저장, 카카오 "지난달 예산 복사")는
// 같은 가계부·같은 달 잠금 안에서 지금 계획을 다시 읽고 바꾼다.
function withBudgetPlanLease(env, householdId, month, task) {
  return withSettingsRmwLease(env, `budget-plan:${householdId}:${month}`, task, { householdId });
}
// @build:exports-start
export {
  categorySpentMap, defaultExpenseBudgetNames, defaultIncomeBudgetNames, expenseBudgetRows,
  handleMyBudgetBulkSave, handleMyGroupsPage, incomeBudgetRows, isIncomeBudgetCategory,
  keywordEditorLocation, mySettingsLocation, parseBudgetFormAmount, recurringSummary,
  sumBudgetAmounts, upsertMyBudgetRow, withBudgetPlanLease,
};
// @build:exports-end
