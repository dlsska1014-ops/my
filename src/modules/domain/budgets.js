// @build:imports-start
import { normalizePaymentAssetList, paymentAssetsKey } from "../settings/payment-assets.js";
import { normalizeReservePlanList, reservePlansKey } from "../settings/reserve-plans.js";
import {
  fetchAdminRows, memberAliasSettingsKey, normalizeMemberAliasMap,
} from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { isIncomeBudgetCategory } from "../my/groups-budget-bulk.js";
import { reportChallengeSettingsKey } from "../my/report-challenge.js";
import { parseJsonSetting } from "../my/reports-premium.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst } from "../nlu/date-payment.js";
import { calculateStats, escapeHtml, numberWithCommas } from "./transactions-core.js";
// @build:imports-end

async function optionalSupabase(env, path, init = {}, fallback = []) {
  try {
    const v = await supabase(env, path, init);
    return v ?? fallback;
  } catch (err) {
    return fallback;
  }
}

// V22.8.79-1: 예산 settings JSON 폴백을 걷어냈다.
//   budgetsSettingsKey / normalizeBudgetRows / fetchSettingsBudgets(Strict) /
//   mergeBudgetRows / saveSettingsBudget / deleteSettingsBudget /
//   cleanupSettingsBudgetAfterTableSave 가 여기 있었다.
// V22.8.79 SQL(03)이 유니크 인덱스를 만들어 표 저장이 42P10 으로 거절당하던 원인을
// 없앴고, 남아 있던 'budgets:<가계부ID>:<월>' 키를 표로 이관한 뒤 지웠다
// (운영 적용 후 leftover_settings_budget_keys=0). 더 쓰지 않으므로 지운다.
// 되살릴 일이 생기면 git 이력에서 꺼내되, 그때는 SQL 부터 되돌려야 한다.

// V22.8.79-1: 예산은 accountbook_budgets 한 곳에만 있다.
// V22.8.79 SQL(03)이 유니크 인덱스를 만들고 settings JSON 폴백을 표로 이관한 뒤
// 그 키를 지웠다(적용 후 leftover_settings_budget_keys=0). 이중 읽기를 걷어낸다.
async function fetchBudgets(env, householdId, month, options = {}) {
  if (!householdId) return [];
  const params = new URLSearchParams();
  params.set("select", "id,household_id,month,category,amount,created_at");
  params.set("household_id", `eq.${householdId}`);
  params.set("month", `eq.${month}`);
  params.set("order", "category.asc");
  // 표를 못 읽으면 빈 목록이다. 폴백이 있던 시절에도 settings 가 비어 있으면
  // 결과는 같았으므로 동작이 달라지지 않는다.
  return supabase(env, `/rest/v1/accountbook_budgets?${params.toString()}`, { method: "GET" })
    .then((rows) => Array.isArray(rows) ? rows : [])
    .catch(() => []);
}

async function fetchMobileHomeSettings(env, householdId = "", month = currentMonthKst(), options = {}) {
  if (!householdId) return { aliases: {}, reservePlans: [], paymentAssets: [], challengeValue: {} };
  const keys = [memberAliasSettingsKey(householdId), reportChallengeSettingsKey(householdId)];
  if (options.includeReserve) keys.push(reservePlansKey(householdId));
  if (options.includePayment) keys.push(paymentAssetsKey(householdId));
  const params = new URLSearchParams();
  params.set("key", `in.(${[...new Set(keys)].join(",")})`);
  params.set("select", "key,value");
  params.set("limit", String(keys.length));
  const rows = await optionalSupabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET" }, []) || [];
  const values = new Map(safeArray(rows).map((row) => [String(row.key || ""), row.value]));
  return {
    aliases: normalizeMemberAliasMap(values.get(memberAliasSettingsKey(householdId)) || {}),
    reservePlans: options.includeReserve ? normalizeReservePlanList(values.get(reservePlansKey(householdId)) || [], householdId) : [],
    paymentAssets: options.includePayment ? normalizePaymentAssetList(values.get(paymentAssetsKey(householdId)) || [], householdId) : [],
    challengeValue: parseJsonSetting(values.get(reportChallengeSettingsKey(householdId)) || {}, {}),
  };
}

async function fetchRecurring(env, householdId) {
  if (!householdId) return [];
  const params = new URLSearchParams();
  params.set("select", "id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month,created_at");
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "day_of_month.asc,created_at.asc");
  return await optionalSupabase(env, `/rest/v1/accountbook_recurring?${params.toString()}`, { method: "GET" }, []);
}

async function fetchRecurringStrict(env, householdId) {
  if (!householdId) return [];
  const params = new URLSearchParams();
  params.set("select", "id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month,created_at");
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "day_of_month.asc,created_at.asc");
  return (await supabase(env, `/rest/v1/accountbook_recurring?${params.toString()}`, { method: "GET" })) || [];
}

async function fetchRecurringRuleByIdStrict(env, id = "") {
  const rid = String(id || "").trim();
  if (!rid) return null;
  const rows = await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(rid)}&select=id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month&limit=1`, { method: "GET" }) || [];
  return rows[0] || null;
}

function budgetSummary(rows = [], budgets = []) {
  const expenseRows = rows.filter((r) => r.type !== "income");
  const expense = expenseRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const categoryBudgets = budgets.filter((b) => {
    const c = String(b.category || "");
    return c && c !== "__total" && c !== "__income" && !isIncomeBudgetCategory(c) && Number(b.amount || 0) > 0;
  });
  const categoryBudgetTotal = categoryBudgets.reduce((a, b) => a + Number(b.amount || 0), 0);
  const explicitTotalBudget = Number((budgets.find((b) => String(b.category || "") === "__total") || {}).amount || 0);
  // V22.6.5: 분류별 예산 합계를 월 예산의 기준으로 사용합니다.
  // 예전 __total 값은 분류별 예산이 하나도 없을 때만 호환용으로 사용합니다.
  const totalBudget = categoryBudgetTotal || explicitTotalBudget;
  const byCategory = {};
  for (const r of expenseRows) {
    const c = r.category || "기타";
    byCategory[c] = (byCategory[c] || 0) + Number(r.amount || 0);
  }
  const categoryAlerts = categoryBudgets.map((b) => {
    const spent = Number(byCategory[b.category] || 0);
    const amount = Number(b.amount || 0);
    return { category: b.category, budget: amount, spent, diff: spent - amount, rate: amount ? Math.round(spent / amount * 100) : 0 };
  }).sort((a, b) => b.rate - a.rate);
  // V22.8.81: 분류별 예산만 잡아 둔 달에는 그 분류들의 지출만 견준다.
  // 예전에는 식비 예산 하나만 잡아도 "전체 지출 ÷ 식비 예산" 이 되어
  // 아무 관계 없는 지출까지 얹힌 채 예산 초과 경보가 떴다.
  const basis = categoryBudgetTotal ? "category" : "total";
  // V22.8.92: 같은 분류의 예산 행이 둘이면 그 분류의 지출이 두 번 더해졌다.
  // 사용액이 실제 지출보다 커지고, 남은 예산은 그만큼 작게 나왔다. 7.5 에서
  // 남은 예산을 이 화면의 대표 숫자로 올리므로 분류 이름 기준으로 한 번만 센다.
  const budgetedExpense = basis === "category"
    ? [...new Set(categoryBudgets.map((b) => b.category))].reduce((a, category) => a + Number(byCategory[category] || 0), 0)
    : expense;
  const uncoveredExpense = Math.max(0, expense - budgetedExpense);
  return {
    totalBudget, explicitTotalBudget, categoryBudgetTotal, expense,
    basis, budgetedExpense, uncoveredExpense,
    remaining: totalBudget ? Math.max(0, totalBudget - budgetedExpense) : 0,
    diff: budgetedExpense - totalBudget,
    rate: totalBudget ? Math.round(budgetedExpense / totalBudget * 100) : 0,
    categoryAlerts,
  };
}

function budgetCenterSummary(rows = [], budgets = []) {
  const stats = calculateStats(rows);
  const budget = budgetSummary(rows, budgets);
  const incomeBudgets = safeArray(budgets).filter((b) => isIncomeBudgetCategory(String(b.category || "")) || String(b.category || "") === "__income");
  const incomeBudget = incomeBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const actualIncomeMap = {};
  for (const row of safeArray(rows).filter((r) => r.type === "income")) {
    const category = String(row.category || "기타수입").trim() || "기타수입";
    if (!actualIncomeMap[category]) actualIncomeMap[category] = { category, amount: 0, count: 0 };
    actualIncomeMap[category].amount += Number(row.amount || 0);
    actualIncomeMap[category].count += 1;
  }
  const actualIncomeCategories = Object.values(actualIncomeMap).sort((a, b) => b.amount - a.amount);
  const actualIncome = actualIncomeCategories.reduce((sum, item) => sum + Number(item.amount || 0), 0);
  const incomeBase = incomeBudget || actualIncome;
  const totalBudget = Number(budget.totalBudget || 0);
  const budgetIncomeRate = incomeBase ? Math.round((totalBudget / incomeBase) * 100) : 0;
  const freeAfterBudget = incomeBase ? incomeBase - totalBudget : 0;
  const actualSavings = Number(stats.totals.income || 0) - Number(stats.totals.expense || 0);
  return { stats, budget, incomeBudget, actualIncome, actualIncomeCategories, incomeBase, totalBudget, budgetIncomeRate, freeAfterBudget, actualSavings, incomeBudgets };
}

function budgetStatusLabel(rate = 0, spent = null, budget = null) {
  if (spent != null && budget != null) { if (Number(spent) > Number(budget)) return "\uCD08\uACFC"; if (Number(spent) === Number(budget)) return "\uC18C\uC9C4"; if (rate >= 85) return "\uC8FC\uC758"; return "\uC0AC\uC6A9\uC911"; }
  if (rate >= 100) return "초과";
  if (rate >= 85) return "주의";
  if (rate >= 60) return "사용중";
  return "여유";
}

function renderBudgetCategoryUsageTree(category = "", rows = []) {
  const filtered = safeArray(rows).filter((r) => r.type !== "income" && normalizeText(r.category || "기타") === normalizeText(category || "기타"));
  if (!filtered.length) return `<div class="budgetTree emptyTree">아직 이 분류로 사용된 기록이 없습니다.</div>`;
  const groups = {};
  for (const r of filtered) {
    const name = r.spender_name || r.user_name || r.nickname || r.user_id || "미지정";
    if (!groups[name]) groups[name] = { total: 0, rows: [] };
    groups[name].total += Number(r.amount || 0);
    groups[name].rows.push(r);
  }
  return `<div class="budgetTree">${Object.entries(groups).map(([name, group]) => {
    const detailRows = group.rows.sort((a,b)=>String(a.transaction_date||"").localeCompare(String(b.transaction_date||""))).map((r) => `<li><span>${escapeHtml(r.transaction_date || "-")}</span><b>${numberWithCommas(r.amount || 0)}원</b><em>${escapeHtml(r.memo || r.raw_text || "-")}</em></li>`).join("");
    return `<details class="memberUse"><summary>${escapeHtml(name)} · ${numberWithCommas(group.total)}원 · ${numberWithCommas(group.rows.length)}건</summary><ul>${detailRows}</ul></details>`;
  }).join("")}</div>`;
}

function renderBudgetBasisRows(budgets = []) {
  const rows = safeArray(budgets);
  const incomeRows = rows.filter((b) => String(b.category || "") === "__income" || isIncomeBudgetCategory(String(b.category || "")));
  const totalRow = rows.find((b) => String(b.category || "") === "__total") || null;
  const categoryRows = rows.filter((b) => {
    const c = String(b.category || "");
    return c && c !== "__total" && c !== "__income" && !isIncomeBudgetCategory(c);
  });
  const incomeHtml = incomeRows.length ? incomeRows.map((b) => `<li><b>${escapeHtml(String(b.category || "__income").replace("__income:", "").replace("__income", "월 수입 기준 합계") || "월 수입 기준")}</b><span>${numberWithCommas(b.amount || 0)}원</span></li>`).join("") : `<li><b>월 수입 기준</b><span>미설정</span></li>`;
  const categoryHtml = categoryRows.length ? categoryRows.map((b) => `<li><b>${escapeHtml(b.category)}</b><span>${numberWithCommas(b.amount || 0)}원</span></li>`).join("") : `<li><b>분류별 예산</b><span>미설정</span></li>`;
  return `<div class="basisGrid"><div><h3>수입 기준 리스트</h3><ul>${incomeHtml}</ul></div><div><h3>예산 기준 리스트</h3><ul><li><b>월 전체 예산</b><span>${totalRow ? numberWithCommas(totalRow.amount || 0) + "원" : "미설정"}</span></li>${categoryHtml}</ul></div></div>`;
}

function budgetCategoryTotal(budgets = []) {
  return safeArray(budgets).filter((b) => {
    const c = String(b.category || "");
    return c && c !== "__total" && c !== "__income" && !isIncomeBudgetCategory(c);
  }).reduce((sum, b) => sum + Number(b.amount || 0), 0);
}

function renderBudgetConsistencyAlert(budgets = [], center = {}) {
  const rows = safeArray(budgets);
  const totalRow = rows.find((b) => String(b.category || "") === "__total") || null;
  const explicitTotal = Number(totalRow?.amount || 0);
  const categoryTotal = budgetCategoryTotal(rows);
  const totalBudget = categoryTotal || explicitTotal;
  const incomeBase = Number(center.incomeBudget || center.incomeBase || 0);
  const warnings = [];
  if (explicitTotal && !categoryTotal) warnings.push("이전 버전의 월 전체 예산만 남아 있습니다. 분류별 예산을 입력하면 자동 합계 기준으로 전환됩니다.");
  if (incomeBase && totalBudget > incomeBase) warnings.push(`이번 달 예산이 월 수입 기준보다 ${numberWithCommas(totalBudget - incomeBase)}원 큽니다.`);
  if (!warnings.length) {
    return `<div class="budgetOk"><b>월 예산 자동 산정</b><span>분류별 예산 합계 ${numberWithCommas(categoryTotal)}원이 이번 달 예산으로 자동 적용됩니다. 월 총액을 따로 입력하지 않습니다.</span></div>`;
  }
  const hint = explicitTotal && !categoryTotal
    ? "식비·교통 등 필요한 지출 분류를 추가하면 이전 월 총액 대신 분류 합계가 사용됩니다."
    : "예상 수입 종류 또는 지출 분류별 금액을 조정해 계획을 맞추세요.";
  return `<div class="budgetWarn"><b>예산 설정 확인 필요</b><span>${warnings.map(escapeHtml).join("<br/>")}</span><small>${escapeHtml(hint)}</small></div>`;
}

function renderBudgetRows(budgets = [], budget = {}, rowsForDetails = [], canManage = true) {
  const rows = safeArray(budgets).filter((b) => {
    const c = String(b.category || "");
    return c && c !== "__total" && c !== "__income" && !isIncomeBudgetCategory(c);
  });
  if (!rows.length) return `<tr><td colspan="7">아직 분류 예산이 없습니다.</td></tr>`;
  return rows.map((b) => {
    const alert = safeArray(budget.categoryAlerts).find((x) => normalizeText(x.category) === normalizeText(b.category)) || { spent: 0, budget: Number(b.amount || 0), rate: 0 };
    const remain = Math.max(0, Number(b.amount || 0) - Number(alert.spent || 0));
    const tree = renderBudgetCategoryUsageTree(b.category, rowsForDetails);
    return `<tr><td><details class="catUse"><summary><b>${escapeHtml(b.category)}</b><small>사용 내역 보기</small></summary>${tree}</details></td><td>${numberWithCommas(b.amount)}원</td><td>${numberWithCommas(alert.spent)}원</td><td>${numberWithCommas(remain)}원</td><td>${alert.rate || 0}%</td><td><span class="status ${alert.rate >= 100 ? "bad" : alert.rate >= 85 ? "warn" : "ok"}">${budgetStatusLabel(alert.rate || 0, alert.spent, alert.budget)}</span></td><td>${canManage ? `<form method="post" action="/admin/budget/delete"><input type="hidden" name="household_id" value="${escapeHtml(b.household_id || "")}"/><input type="hidden" name="month" value="${escapeHtml(b.month || currentMonthKst())}"/><input type="hidden" name="category" value="${escapeHtml(b.category)}"/><input type="hidden" name="return_to" value="/budgets?month=${escapeHtml(b.month || currentMonthKst())}&household_id=${escapeHtml(b.household_id || "")}"/><button class="mini danger" type="submit">삭제</button></form>` : `<span class="status ok">조회 전용</span>`}</td></tr>`;
  }).join("");
}

function budgetStageInfo(spent = 0, budget = 0) {
  const b = Number(budget || 0);
  const sp = Number(spent || 0);
  const rate = b ? Math.round((sp / b) * 100) : 0;
  const over = Math.max(0, sp - b);
  const remain = Math.max(0, b - sp);
  let stage = "ok";
  if (b && sp > b) stage = "over";
  else if (b && rate >= 85) stage = "warn";
  return { rate, over, remain, stage, budget: b, spent: sp };
}

function budgetAlertText(rows = [], budgets = [], category = "") {
  // Returns a short staged alert string for the *saved category* (or total fallback).
  // Empty when under 80% — we only surface 주의/초과 as an alert.
  const expenseRows = safeArray(rows).filter((r) => r.type !== "income");
  const byCategory = {};
  for (const r of expenseRows) { const c = r.category || "기타"; byCategory[c] = (byCategory[c] || 0) + Number(r.amount || 0); }
  const catBudget = safeArray(budgets).find((b) => b.category && b.category !== "__total" && normalizeText(b.category) === normalizeText(category));
  let name = "", info = null;
  if (catBudget) { name = catBudget.category; info = budgetStageInfo(byCategory[catBudget.category] || 0, catBudget.amount); }
  else {
    const summary = budgetSummary(rows, budgets);
    if (!summary.totalBudget) return "";
    name = "\uC608\uC0B0 \uAE30\uC900";
    info = budgetStageInfo(summary.budgetedExpense, summary.totalBudget);
  }
  if (!info || info.stage === "ok") return "";
  if (info.stage === "over") return `🚨 ${name} 예산 초과 · ${numberWithCommas(info.over)}원 넘었어요 (${info.rate}%)`;
  return `⚠️ ${name} 예산 ${info.rate}% · ${numberWithCommas(info.remain)}원 남음`;
}

function budgetFeedbackLine(rows = [], budgets = [], category = "") {
  const expenseRows = safeArray(rows).filter((r) => r.type !== "income");
  const byCategory = {};
  for (const r of expenseRows) {
    const c = r.category || "기타";
    byCategory[c] = (byCategory[c] || 0) + Number(r.amount || 0);
  }
  const categoryBudget = safeArray(budgets).find((b) => b.category && b.category !== "__total" && normalizeText(b.category) === normalizeText(category));
  if (categoryBudget) {
    const budget = Number(categoryBudget.amount || 0);
    const spent = Number(byCategory[categoryBudget.category] || 0);
    const info = budgetStageInfo(spent, budget);
    const head = info.stage === "over" ? `🚨 ${categoryBudget.category} 예산 초과` : info.stage === "warn" ? `⚠️ ${categoryBudget.category} 예산 주의` : `📊 ${categoryBudget.category} 예산`;
    const tail = info.stage === "over" ? `\n${numberWithCommas(info.over)}원 초과했어요.` : `\n남은 예산: ${numberWithCommas(info.remain)}원`;
    return `\n\n${head}\n사용: ${numberWithCommas(spent)}원 / ${numberWithCommas(budget)}원 (${info.rate}%)${tail}`;
  }
  const summary = budgetSummary(rows, budgets);
  const totalBudget = summary.totalBudget;
  if (totalBudget) {
    const spent = summary.budgetedExpense;
    const info = budgetStageInfo(spent, totalBudget);
    const head = info.stage === "over" ? `🚨 이번 달 전체 예산 초과` : info.stage === "warn" ? `⚠️ 이번 달 전체 예산 주의` : `📊 이번 달 전체 예산`;
    const tail = info.stage === "over" ? `\n${numberWithCommas(info.over)}원 초과했어요.` : `\n남은 예산: ${numberWithCommas(info.remain)}원`;
    return `\n\n${head}\n사용: ${numberWithCommas(spent)}원 / ${numberWithCommas(totalBudget)}원 (${info.rate}%)${tail}`;
  }
  return "";
}

async function kakaoBudgetStatusText(env, householdId, month, origin = "", householdName = "") {
  try {
    const budgets = await fetchBudgets(env, householdId, month);
    const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const stats = calculateStats(rows);
    const budget = budgetSummary(rows, budgets);
    const totalBudget = Number(budget.totalBudget || 0);
    const expense = Number(budget.budgetedExpense ?? budget.expense ?? stats.totals.expense ?? 0);
    const remain = totalBudget ? totalBudget - expense : 0;
    const rate = totalBudget ? Math.round((expense / totalBudget) * 100) : 0;
    if (!totalBudget && !budgets.length) {
      return [`💰 ${month} 예산 현황`, householdName ? `가계부: ${householdName}` : "", "", "아직 예산이 설정되지 않았어요.", `현재 사용 금액: ${numberWithCommas(expense)}원`, "", "‘예산 설정’을 입력하면 카카오톡에서 단계별로 설정할 수 있어요."].join("\n");
    }
    const status = expense > totalBudget ? "초과" : rate >= 85 ? "주의" : rate >= 60 ? "사용중" : "여유";
    const categoryLines = safeArray(budget.categoryAlerts).filter((x) => Number(x.budget || 0) > 0).slice(0, 7).map((x) => {
      const left = Number(x.budget || 0) - Number(x.spent || 0);
      const leftText = left >= 0 ? `${numberWithCommas(left)}원 남음` : `${numberWithCommas(Math.abs(left))}원 초과`;
      return `• ${x.category}: ${numberWithCommas(x.spent)}원 사용 / ${leftText} · ${x.rate || 0}%`;
    });
    return [
      `💰 ${month} 예산 현황`, householdName ? `가계부: ${householdName}` : "", "",
      `전체 예산: ${numberWithCommas(totalBudget)}원`,
      `사용 금액: ${numberWithCommas(expense)}원`,
      `남은 예산: ${remain >= 0 ? numberWithCommas(remain) + "원" : numberWithCommas(Math.abs(remain)) + "원 초과"}`,
      `사용률: ${rate}% (${status})`,
      ...(categoryLines.length ? ["", "카테고리별", ...categoryLines] : []),
    ].join("\n");
  } catch (err) {
    return "💰 예산 현황을 불러오지 못했어요. 잠시 후 ‘남은 예산’을 다시 입력해 주세요.";
  }
}

async function kakaoBudgetFeedback(env, householdId, month, category) {
  try {
    const budgets = await fetchBudgets(env, householdId, month);
    if (!budgets.length) return "";
    const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
    return budgetFeedbackLine(rows, budgets, category);
  } catch (err) {
    return "";
  }
}
// @build:exports-start
export {
  budgetAlertText, budgetCenterSummary, budgetFeedbackLine, budgetStageInfo, budgetStatusLabel,
  budgetSummary, fetchBudgets, fetchMobileHomeSettings, fetchRecurring,
  fetchRecurringRuleByIdStrict, fetchRecurringStrict, kakaoBudgetStatusText, optionalSupabase,
  renderBudgetBasisRows, renderBudgetConsistencyAlert, renderBudgetRows,
};
// @build:exports-end
