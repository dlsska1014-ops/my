// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import {
  safeError, withHouseholdDatabaseLease, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import {
  MAX_TRANSACTION_AMOUNT, normalizeTransactionType, readOptionalFormAmount,
} from "../admin/transactions-households.js";
import {
  categoryKeywordKey, fetchCategoryKeywordMap, fetchCustomCategories, normalizeCategoryKeywords,
  saveCategoryKeywordMap, setCategoryKeywords,
} from "../settings/categories-keywords.js";
import { fetchAdminRows } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  categorySpentMap, defaultExpenseBudgetNames, defaultIncomeBudgetNames, expenseBudgetRows,
  incomeBudgetRows, keywordEditorLocation, mySettingsLocation, recurringSummary, sumBudgetAmounts,
} from "./groups-budget-bulk.js";
import {
  canManageMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import {
  budgetCenterSummary, budgetSummary, fetchBudgets, fetchRecurring, fetchRecurringRuleByIdStrict,
  fetchRecurringStrict,
} from "../domain/budgets.js";
import { normalizeRecurringKey } from "../admin/pc-analysis-calendar.js";
import { moneyPlanTabsCss, renderMoneyPlanTabs } from "./money-plan-home-layout.js";
import {
  normalizeRecurringDay, renderRecurringEditForm,
} from "../admin/budget-center-recurring.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { supabase } from "../data/supabase-client.js";
import { parseAmountValue } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleMySettingsPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  // V22.9.16: 아홉 번을 줄줄이 기다리던 화면이다. 서로 필요 없는 조회는 함께 던진다.
  const [user, { households, selected, restricted }] = await Promise.all([
    fetchUserById(env, userId),
    getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || ""),
  ]);
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
  if (!canManageMyHousehold(selected.role)) return myAccessStatusResponse({ env, user, household: selected, role: selected.role, month, manageOnly: true });
  // V22.8.81: 키워드 편집기는 /keyword-guide 한 곳으로 모았다. 여기서는 더 읽지 않는다.
  const [rows, budgets, customCategories, recurring] = await Promise.all([
    fetchAdminRows(env, { month, householdId: selected.id, type: "all" }),
    fetchBudgets(env, selected.id, month),
    fetchCustomCategories(env, selected.id),
    fetchRecurring(env, selected.id),
  ]);
  const budget = budgetSummary(rows, budgets);
  return htmlResponse(renderMySettingsHtml({ env, url, user, month, households, selected, rows, budgets, budget, customCategories, recurring, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

async function handleMyBudgetSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(mySettingsLocation(month, selected.id, { err: "write_not_allowed" }));
  const category = String(form.get("category") || "__total").trim() || "__total";
  const amount = readOptionalFormAmount(form);
  if (amount === null) return redirectResponse(mySettingsLocation(month, selected.id, { err: "budget_amount_invalid" }));
  try {
    await supabase(env, "/rest/v1/accountbook_budgets?on_conflict=household_id,month,category", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ household_id: selected.id, month, category, amount }),
    });
    return redirectResponse(mySettingsLocation(month, selected.id, { msg: "budget_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_budget_save_failed", severity: "warn", path: "/my/budget/save", method: "POST", detail: safeError(err) });
    return redirectResponse(mySettingsLocation(month, selected.id, { err: "budget_save_failed" }));
  }
}

async function handleMyCategoryKeywordsSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = String(form.get("return_to") || "");
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { err: "keyword_manage_only" }));
  const type = String(form.get("type") || "expense").trim() === "income" ? "income" : "expense";
  const name = String(form.get("name") || "").trim().slice(0, 80);
  const keywords = normalizeCategoryKeywords(form.get("keywords") || "");
  if (!name) return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { err: "category_missing" }));
  try {
    await setCategoryKeywords(env, selected.id, type, name, keywords);
    return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { msg: "category_keywords_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_category_keywords_save_failed", severity: "warn", path: "/my/category-keywords/save", method: "POST", detail: safeError(err) });
    return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { err: "category_keywords_save_failed" }));
  }
}

async function handleMyCategoryKeywordsBulkSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = String(form.get("return_to") || "");
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { err: "keyword_manage_only" }));
  const types = form.getAll("kw_type").map((v) => String(v || "expense"));
  const names = form.getAll("kw_name").map((v) => String(v || "").trim().slice(0, 80));
  const keywords = form.getAll("kw_keywords").map((v) => String(v || ""));
  try {
    await withHouseholdSettingsRmw(env, selected.id, async ({ assertFresh }) => {
      // V22.9.26: strict 읽기 — 읽기 실패를 빈 값으로 보면 기존 키워드가 모두 사라진다.
      const map = await fetchCategoryKeywordMap(env, selected.id, { strict: true });
      for (let i = 0; i < names.length; i++) {
        const name = names[i];
        if (!name) continue;
        const type = types[i] === "income" ? "income" : "expense";
        const key = categoryKeywordKey(type, name);
        const list = normalizeCategoryKeywords(keywords[i] || "");
        if (list.length) map[key] = list;
        else delete map[key];
      }
      assertFresh();
      await saveCategoryKeywordMap(env, selected.id, map);
    });
    return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { msg: "category_keywords_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_category_keywords_bulk_failed", severity: "warn", path: "/my/category-keywords/bulk-save", method: "POST", detail: safeError(err) });
    return redirectResponse(keywordEditorLocation(returnTo, month, selected.id, { err: "category_keywords_save_failed" }));
  }
}

async function handleMyRecurringSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(mySettingsLocation(month, selected.id, { err: "write_not_allowed" }));
  const memo = String(form.get("memo") || "").trim().slice(0, 120);
  const amount = Math.max(0, Math.round(parseAmountValue(form.get("amount") || "0")));
  if (!memo || !amount || amount > MAX_TRANSACTION_AMOUNT) return redirectResponse(mySettingsLocation(month, selected.id, { err: "recurring_missing" }));
  const ruleId = String(form.get("id") || "").trim();
  const row = {
    household_id: selected.id,
    type: normalizeTransactionType(String(form.get("type") || "expense")),
    amount,
    category: String(form.get("category") || "정기지출").trim().slice(0, 80),
    memo,
    payment_method: String(form.get("payment_method") || "").trim().slice(0, 80),
    day_of_month: normalizeRecurringDay(form.get("day_of_month")),
    user_id: userId,
    is_active: true,
  };
  try {
    await withHouseholdDatabaseLease(env, selected.id, async ({ assertFresh }) => {
      const existing = ruleId ? await fetchRecurringRuleByIdStrict(env, ruleId) : null;
      if (ruleId && (!existing || String(existing.household_id) !== String(selected.id))) throw new Error("recurring_scope_invalid");
      assertFresh();
      await supabase(env, ruleId ? `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(ruleId)}&household_id=eq.${encodeURIComponent(selected.id)}` : "/rest/v1/accountbook_recurring", {
        method: ruleId ? "PATCH" : "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
    });
    return redirectResponse(mySettingsLocation(month, selected.id, { msg: "recurring_saved" }));
  } catch (err) {
    return redirectResponse(mySettingsLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "recurring_table_required" }));
  }
}

async function handleMyRecurringDelete(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const id = String(form.get("id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(mySettingsLocation(month, selected.id, { err: "write_not_allowed" }));
  try {
    await withHouseholdDatabaseLease(env, selected.id, async ({ assertFresh }) => {
      assertFresh();
      await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(id)}&household_id=eq.${encodeURIComponent(selected.id)}`, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    });
    return redirectResponse(mySettingsLocation(month, selected.id, { msg: "recurring_deleted" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_recurring_delete_failed", severity: "warn", path: "/my/recurring/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(mySettingsLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "recurring_delete_failed" }));
  }
}

async function handleRecurringCandidateConfirm(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = `/smart-tools?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(`${returnTo}&err=manage_required`);
  if (String(form.get("confirmed") || "") !== "yes") return redirectResponse(`${returnTo}&err=confirmation_required`);
  const memo = String(form.get("memo") || "").trim().slice(0, 120);
  const amount = Math.max(0, Math.min(2_000_000_000, Math.round(parseAmountValue(form.get("amount") || "0"))));
  if (!memo || !amount) return redirectResponse(`${returnTo}&err=recurring_missing`);
  const row = {
    household_id: selected.id,
    type: "expense",
    amount,
    category: String(form.get("category") || "정기지출").trim().slice(0, 80) || "정기지출",
    memo,
    payment_method: String(form.get("payment_method") || "").trim().slice(0, 80),
    day_of_month: normalizeRecurringDay(form.get("day_of_month")),
    user_id: userId,
    is_active: true,
  };
  try {
    const created = await withHouseholdDatabaseLease(env, selected.id, async ({ assertFresh }) => {
      const existing = await fetchRecurringStrict(env, selected.id);
      const key = normalizeRecurringKey(row);
      if (safeArray(existing).some((item) => normalizeRecurringKey(item) === key)) return false;
      assertFresh();
      await supabase(env, "/rest/v1/accountbook_recurring", {
        method: "POST",
        headers: { Prefer: "return=minimal" },
        body: JSON.stringify(row),
      });
      return true;
    });
    return redirectResponse(`${returnTo}&msg=${created ? "recurring_registered" : "recurring_exists"}`);
  } catch (err) {
    rememberOpsEvent({ kind: "recurring_candidate_confirm_failed", severity: "warn", path: "/my/recurring/from-candidate", method: "POST", detail: safeError(err) });
    return redirectResponse(`${returnTo}&err=${isUncertainStorageWrite(err) ? "db_write_unknown" : "recurring_save_failed"}`);
  }
}

function renderMySettingsHtml({ env, url, user, month, households, selected, rows = [], budgets, budget, customCategories, recurring, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const hh = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(h.name)} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const incomeRows = incomeBudgetRows(budgets).filter((r) => Number(r.amount || 0) > 0);
  while (incomeRows.length < 2) incomeRows.push({ name: defaultIncomeBudgetNames()[incomeRows.length] || "기타수입", amount: 0 });
  const expenseAllRows = expenseBudgetRows(budgets, customCategories);
  const expenseSetRows = expenseAllRows.filter((r) => Number(r.amount || 0) > 0);
  const starterNames = ["식비", "교통", "생활용품", "보험", "카페/간식"];
  const budgetEditRows = expenseSetRows.length ? expenseSetRows : starterNames.map((name) => ({ name, amount: 0 }));
  const incomePlanTotal = sumBudgetAmounts(incomeRows);
  const expensePlanTotal = sumBudgetAmounts(expenseSetRows);
  const budgetCenter = budgetCenterSummary(rows, budgets);
  const actualIncomeList = budgetCenter.actualIncomeCategories.length
    ? budgetCenter.actualIncomeCategories.map((item) => `<li><span>${escapeHtml(item.category)}</span><b>${numberWithCommas(item.amount)}원</b><small>${numberWithCommas(item.count)}건</small></li>`).join("")
    : `<li class="emptyIncome">아직 이번 달 수입 기록이 없습니다.</li>`;
  const recurringInfo = recurringSummary(recurring);
  const spentMap = categorySpentMap(rows);
  const categoryRows = defaultExpenseBudgetNames(customCategories);
  const categoryOptions = [`<option value="">직접입력</option>`, ...categoryRows.map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)].join("");
  const incomeOptions = [`<option value="">직접입력</option>`, ...defaultIncomeBudgetNames().map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`)].join("");
  const recurringRows = safeArray(recurring).length ? safeArray(recurring).map((r) => `<tr><td>${escapeHtml(r.memo || "")}</td><td>${escapeHtml(r.type === "income" ? "수입" : "지출")}</td><td>${numberWithCommas(r.amount)}원</td><td>${escapeHtml(r.category || "")}</td><td>매월 ${escapeHtml(r.day_of_month || 1)}일</td><td>${escapeHtml(r.last_applied_month || "-")}</td><td>${renderRecurringEditForm(r, selected.id, month, [], "/my/recurring/save")}<form method="post" action="/my/recurring/delete" onsubmit="return confirm('삭제할까요?')"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="id" value="${escapeHtml(r.id || "")}"/><button class="danger" type="submit">삭제</button></form></td></tr>`).join("") : `<tr><td colspan="7">아직 정기지출이 없습니다.</td></tr>`;
  const incomeInputs = incomeRows.map((r) => `<div class="budgetLine incomeLine"><input name="income_name" value="${escapeHtml(r.name)}" placeholder="직접입력: 수입 종류"/><select class="pickValue">${incomeOptions}</select><input name="income_amount" value="${Number(r.amount || 0) || ""}" inputmode="numeric" placeholder="예상 수입"/></div>`).join("");
  // V22.9.26: 설정한 분류를 모두 그린다. 12행만 그리면 저장(월 전체 교체)이 13번째부터 지웠다.
  const expenseInputs = budgetEditRows.map((r) => `<div class="budgetLine expenseLine"><input name="budget_category" value="${escapeHtml(r.name)}" placeholder="직접입력: 예산 분류"/><select class="pickValue">${categoryOptions}</select><input name="budget_amount" value="${Number(r.amount || 0) || ""}" inputmode="numeric" placeholder="예산 금액"/></div>`).join("");
  const budgetListRows = expenseSetRows.length ? expenseSetRows.map((r) => {
    const spent = Number(spentMap[r.name] || 0);
    const remain = Math.max(0, Number(r.amount || 0) - spent);
    const rate = Number(r.amount || 0) ? Math.round(spent / Number(r.amount || 0) * 100) : 0;
    return `<tr><td><b>${escapeHtml(r.name)}</b></td><td>${numberWithCommas(r.amount)}원</td><td>${numberWithCommas(spent)}원</td><td>${numberWithCommas(remain)}원</td><td>${rate}%</td></tr>`;
  }).join("") : `<tr><td colspan="5">아직 저장된 분류별 예산이 없습니다. 필요한 분류만 추가해서 저장하세요.</td></tr>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 설정</title><style>${myNavCss()}${moneyPlanTabsCss()}*,*:before,*:after{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 50%,#eef2f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#101828;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px 16px 120px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 12px 30px rgba(15,23,42,.06)}.hero p,.muted{color:#667085;line-height:1.55;font-size:13px}.summaryGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.summaryBox{background:#f8fafc;border:1px solid #e8edf4;border-radius:18px;padding:14px;min-width:0}.summaryBox b{display:block;font-size:22px;overflow-wrap:anywhere}.toolbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.rowform{display:grid;grid-template-columns:100px 1fr 150px 150px 150px 100px auto;gap:8px;align-items:center}.rowform input,.rowform select{min-width:0;width:100%}.budgetForm{display:grid;grid-template-columns:1fr 1fr;gap:14px}.budgetLine{display:grid;grid-template-columns:1.2fr .9fr 150px;gap:8px;margin:8px 0}.budgetLine>*{min-width:0}.incomeSummary{list-style:none;padding:0;margin:10px 0;display:grid;gap:7px}.incomeSummary li{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:8px;align-items:center;border:1px solid #e8edf4;border-radius:13px;padding:10px 12px}.incomeSummary li span{font-weight:900}.incomeSummary li small{color:#667085}.incomeSummary .emptyIncome{display:block;color:#667085;background:#f8fafc}input,select{border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit;background:#fff}button,.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000;cursor:pointer}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.danger{background:#ef4444!important}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:14px;padding:11px}.error{background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:14px;padding:11px}table{width:100%;border-collapse:collapse;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px}details.fold{border:1px solid #e8edf4;border-radius:22px;background:#fff;padding:6px 14px}details.fold summary{cursor:pointer;font-weight:1000;padding:12px 4px}.sectionNote{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;font-size:13px;line-height:1.55}.keywordGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.keywordCard{display:grid;grid-template-columns:110px 1fr auto;gap:8px;align-items:center;border:1px solid #e8edf4;border-radius:16px;padding:10px;background:#f8fafc}.keywordCard label{font-weight:1000}.addBtn{background:#eef2ff!important;color:#3730a3!important;border:1px solid #c7d2fe}@media(max-width:900px){.budgetForm,.keywordGrid{grid-template-columns:1fr}.budgetLine,.keywordCard,.rowform{grid-template-columns:1fr}.toolbar>*{width:100%}}@media(max-width:600px){.wrap{padding:10px 10px 126px}.hero,.card{padding:16px;border-radius:19px}.summaryGrid{grid-template-columns:1fr 1fr}.summaryBox b{font-size:19px}.incomeSummary li{grid-template-columns:1fr auto}.incomeSummary li small{grid-column:1/-1}.budgetLine input,.budgetLine select{width:100%;font-size:16px}}@media(max-width:360px){.summaryGrid{grid-template-columns:1fr}}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "settings")}<div class="pageMain">${renderMoneyPlanTabs("settings", { month, householdId: selected.id })}<section class="hero"><h1>설정 한눈에</h1><p>이번 달 요약과 예산·정기 설정을 한 화면에서 봅니다. 각 항목은 위 탭에서 더 자세히 볼 수 있습니다. 실제 수입은 기록에서 자동 합산하고, 예상 수입과 지출 한도는 종류·분류별 행의 합계로 계산합니다.</p></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${formatMessage(err)}</div>` : ""}<section class="card"><form method="get" action="/my/settings" class="toolbar"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button><a class="btn secondary" href="/app?${hh}">홈</a></form></section><section class="card"><h2>이번 달 요약</h2><div class="summaryGrid"><div class="summaryBox"><span class="muted">실제 수입 · 기록 자동합계</span><b>${numberWithCommas(budgetCenter.actualIncome)}원</b></div><div class="summaryBox"><span class="muted">예상 수입 · 종류별 합계</span><b>${numberWithCommas(incomePlanTotal)}원</b></div><div class="summaryBox"><span class="muted">지출 예산 · 분류별 합계</span><b>${numberWithCommas(expensePlanTotal)}원</b></div><div class="summaryBox"><span class="muted">이번 달 지출</span><b>${numberWithCommas(budget.expense || 0)}원</b><span class="muted">예산 사용 ${budget.rate || 0}%</span></div></div><h3>실제 수입 분류</h3><ul class="incomeSummary">${actualIncomeList}</ul></section><section class="card"><h2>예상 수입 + 지출 예산</h2><p class="muted">월 총액을 따로 입력하지 않습니다. 수입 종류와 지출 분류별 금액을 입력하면 위 합계가 자동으로 만들어집니다. 빈 행과 0원 행은 저장하지 않습니다.</p><form method="post" action="/my/budget-bulk/save" id="budgetBulkForm"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><div class="budgetForm"><div><h3>예상 수입 종류</h3><div id="incomeRows">${incomeInputs}</div><p><button type="button" class="addBtn" data-add="income">+ 수입 종류 추가</button></p><div class="sectionNote">급여·부수입을 고르거나 왼쪽 칸에 직접 이름을 입력하세요. 입력한 행의 합계가 예상 수입입니다.</div></div><div><h3>지출 분류별 한도</h3><div id="expenseRows">${expenseInputs}</div><p><button type="button" class="addBtn" data-add="expense">+ 지출 분류 추가</button></p><div class="sectionNote">식비·교통 등 필요한 분류만 입력하세요. 분류별 합계가 이번 달 전체 지출 예산입니다.</div></div></div><p><button type="submit">종류별 수입·분류별 예산 저장</button></p></form></section><section class="card"><h2>저장된 분류별 지출 예산</h2><p class="muted">분류별 합계: <b>${numberWithCommas(expensePlanTotal)}원</b></p><div class="scroll"><table><thead><tr><th>분류</th><th>예산</th><th>사용</th><th>남음</th><th>사용률</th></tr></thead><tbody>${budgetListRows}</tbody></table></div></section><section class="card"><h2>정기 수입·지출 자동 기록</h2><div class="summaryGrid"><div class="summaryBox"><span class="muted">정기지출 합계</span><b>${numberWithCommas(recurringInfo.expense)}원</b></div><div class="summaryBox"><span class="muted">정기수입 합계</span><b>${numberWithCommas(recurringInfo.income)}원</b></div><div class="summaryBox"><span class="muted">월 순정기액</span><b>${numberWithCommas(recurringInfo.net)}원</b></div><div class="summaryBox"><span class="muted">등록 건수</span><b>${numberWithCommas(recurringInfo.count)}건</b></div></div><form method="post" action="/my/recurring/save" class="rowform"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><select name="type"><option value="expense">지출</option><option value="income">수입</option></select><input name="memo" placeholder="예: 자동차보험" required/><input name="amount" placeholder="금액" required/><input name="category" placeholder="분류" value="정기지출"/><input name="payment_method" placeholder="결제수단"/><input name="day_of_month" type="number" min="1" max="31" value="1"/><button type="submit">정기항목 저장</button></form><div class="scroll" style="margin-top:14px"><table><thead><tr><th>내용</th><th>구분</th><th>금액</th><th>분류</th><th>일자</th><th>최근 적용월</th><th></th></tr></thead><tbody>${recurringRows}</tbody></table></div></section><section class="card"><h2>분류·키워드</h2><p class="muted">가족이 실제로 쓰는 표현을 수입·지출 분류에 연결하는 화면은 <b>관리 &gt; 분류·키워드</b> 한 곳에만 둡니다. 같은 편집기를 두 곳에서 열면 어느 쪽이 최신인지 헷갈립니다.</p><p><a class="btn secondary" href="/keyword-guide?${hh}">분류·키워드 관리 열기</a></p></section></div></div></main><script>
(function(){
  const incomeOptions = ${JSON.stringify(incomeOptions)};
  const categoryOptions = ${JSON.stringify(categoryOptions)};
  function bindPickers(root){
    root.querySelectorAll('.pickValue').forEach(function(sel){
      sel.addEventListener('change', function(){
        const line = sel.closest('.budgetLine');
        const input = line && line.querySelector('input');
        if (input && sel.value) input.value = sel.value;
      });
    });
  }
  function makeLine(type){
    const div = document.createElement('div');
    div.className = 'budgetLine ' + (type === 'income' ? 'incomeLine' : 'expenseLine');
    if (type === 'income') {
      div.innerHTML = '<input name="income_name" placeholder="직접입력: 수입 종류"/><select class="pickValue">' + incomeOptions + '</select><input name="income_amount" inputmode="numeric" placeholder="예상 수입"/>';
    } else {
      div.innerHTML = '<input name="budget_category" placeholder="직접입력: 예산 분류"/><select class="pickValue">' + categoryOptions + '</select><input name="budget_amount" inputmode="numeric" placeholder="예산 금액"/>';
    }
    bindPickers(div);
    return div;
  }
  document.querySelectorAll('[data-add]').forEach(function(btn){
    btn.addEventListener('click', function(){
      const type = btn.getAttribute('data-add');
      document.getElementById(type === 'income' ? 'incomeRows' : 'expenseRows').appendChild(makeLine(type));
    });
  });
  bindPickers(document);
})();
</script></body></html>`;
}
// @build:exports-start
export {
  handleMyBudgetSave, handleMyCategoryKeywordsBulkSave, handleMyCategoryKeywordsSave,
  handleMyRecurringDelete, handleMyRecurringSave, handleMySettingsPage,
  handleRecurringCandidateConfirm,
};
// @build:exports-end
