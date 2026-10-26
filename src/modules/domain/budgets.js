// @build:imports-start
import { sha256Hex } from "../auth/crypto-admin-session.js";
import { normalizePaymentAssetList, paymentAssetsKey } from "../settings/payment-assets.js";
import { normalizeReservePlanList, reservePlansKey } from "../settings/reserve-plans.js";
import {
  distinctPersonLabels, fetchAdminRows, fetchAdminRowsRange, memberAliasSettingsKey,
  normalizeMemberAliasMap,
} from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { isIncomeBudgetCategory } from "../my/groups-budget-bulk.js";
import { reportChallengeSettingsKey } from "../my/report-challenge.js";
import { parseJsonSetting } from "../my/reports-premium.js";
import { homeMemberPolicyValue, memberPolicySettingsKey } from "../my/access-control.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { LEGACY_CATEGORY_SPLITS } from "../nlu/category-rules.js";
import {
  calculateStats, escapeHtml, nextMonthStart, numberWithCommas,
} from "./transactions-core.js";
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
  const request = supabase(env, `/rest/v1/accountbook_budgets?${params.toString()}`, { method: "GET" });
  // V22.9.34 감사 S3: 월 계획을 통째로 바꾸는 폼과 그 저장 직전 대조는 읽기 실패를
  // 빈 계획으로 보면 안 된다. 빈 폼에서 한 칸만 저장해도 그 달 예산이 모두 지워졌다.
  if (options.strict) {
    return request.then((rows) => {
      if (!Array.isArray(rows)) throw new Error("budgets_read_invalid");
      return rows;
    });
  }
  // 표시용 화면은 표를 못 읽으면 빈 목록이다. 폴백이 있던 시절에도 settings 가
  // 비어 있으면 결과는 같았으므로 동작이 달라지지 않는다.
  return request
    .then((rows) => Array.isArray(rows) ? rows : [])
    .catch(() => []);
}

// V22.9.34 감사 S3: 예산 폼은 그린 순간의 월 계획 지문을 싣고, 저장은 지금 계획의 지문이
// 같을 때만 통째로 바꾼다. 폼을 연 뒤 다른 관리자·카카오가 바꾼 예산을 덮어쓰지 않는다.
async function budgetPlanFingerprint(rows) {
  if (!Array.isArray(rows)) throw new Error("budgets_read_invalid");
  // Stored numeric values are canonicalized as decimal coefficients/exponents,
  // without rounding through Number or expanding large exponents. This is not
  // the input contract's duplicate-name normalization or positive-row filter.
  const amountKey = value => {
    if (typeof value !== "string" && (typeof value !== "number" || !Number.isFinite(value))) throw new Error("budgets_read_invalid");
    const match = String(value).match(/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/);
    if (!match || match[0].length !== String(value).length) throw new Error("budgets_read_invalid");
    const fraction = match[2].split(".")[1] || "";
    const digits = match[2].replace(".", "").replace(/^0+/, "");
    if (!digits) return "0";
    const coefficient = digits.replace(/0+$/, "");
    const exponent = BigInt(match[3] || "0") - BigInt(fraction.length) + BigInt(digits.length - coefficient.length);
    return `${match[1] === "-" ? "-" : ""}${coefficient}e${exponent}`;
  };
  const canonical = Array.from(rows, row => {
    if (!row || typeof row.category !== "string") throw new Error("budgets_read_invalid");
    const category = row.category;
    const kind = category === "__total" ? "total" : category === "__income" ? "income-total" : category.startsWith("__income:") ? "income" : "expense";
    return [kind, category, amountKey(row.amount)];
  }).sort((a, b) => {
    // Ordinal comparison of original strings is deterministic even for names
    // that collate equally. Keep duplicate rows and zero/special rows intact.
    for (const index of [1, 0, 2]) { if (a[index] < b[index]) return -1; if (a[index] > b[index]) return 1; }
    return 0;
  });
  return `p2-${await sha256Hex(JSON.stringify(canonical))}`;
}

async function fetchMobileHomeSettings(env, householdId = "", month = currentMonthKst(), options = {}) {
  if (!householdId) return { aliases: {}, reservePlans: [], paymentAssets: [], challengeValue: {} };
  const keys = [memberAliasSettingsKey(householdId), reportChallengeSettingsKey(householdId)];
  if (options.includeReserve) keys.push(reservePlansKey(householdId));
  if (options.includePayment) keys.push(paymentAssetsKey(householdId));
  // V22.9.43: 구성원 세션이면 구성원 권한(기록만/기록·수정)도 같은 질의로 읽는다(추가 조회 없음). 화면 단추에만 쓴다.
  if (options.includeMemberPolicy) keys.push(memberPolicySettingsKey(householdId));
  const params = new URLSearchParams();
  params.set("key", `in.(${[...new Set(keys)].join(",")})`);
  params.set("select", "key,value");
  params.set("limit", String(keys.length));
  // V22.9.79 V78 S-2: 정기지출 항목은 홈 월말 예상·‘앞으로 나갈 돈’에 들어간다. 같은 한 번의 조회를 엄격하게 읽고, 실패하면
  // reservePlans 만 null 로 돌려준다(‘항목 없음’과 구분 — 화면은 확인 불가·그 몫을 빼고 계산). 나머지 설정은 예전처럼 기본값이다.
  let rows = [];
  let settingsUnavailable = false;
  try {
    const read = await supabase(env, `/rest/v1/accountbook_settings?${params.toString()}`, { method: "GET" });
    if (!Array.isArray(read)) throw new Error("home_settings_read_invalid");
    rows = read;
  } catch (error) {
    settingsUnavailable = true;
  }
  const values = new Map(safeArray(rows).map((row) => [String(row.key || ""), row.value]));
  return {
    aliases: normalizeMemberAliasMap(values.get(memberAliasSettingsKey(householdId)) || {}),
    reservePlans: options.includeReserve ? (settingsUnavailable ? null : normalizeReservePlanList(values.get(reservePlansKey(householdId)) || [], householdId)) : [],
    paymentAssets: options.includePayment ? normalizePaymentAssetList(values.get(paymentAssetsKey(householdId)) || [], householdId) : [],
    challengeValue: parseJsonSetting(values.get(reportChallengeSettingsKey(householdId)) || {}, {}),
    memberPolicy: options.includeMemberPolicy ? homeMemberPolicyValue(values.get(memberPolicySettingsKey(householdId))) : "",
  };
}

async function fetchRecurringStrict(env, householdId) {
  if (!householdId) return [];
  const params = new URLSearchParams();
  params.set("select", "id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month,created_at");
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "day_of_month.asc,created_at.asc");
  const rows = await supabase(env, `/rest/v1/accountbook_recurring?${params.toString()}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("recurring_read_invalid");
  return rows;
}

// Reuse the existing paged GET and its exact-count receipt, with no extra query.
// These totals must not be calculated from a capped or unconfirmed page.
async function fetchObservationMonthRows(env, householdId, month) {
  const result = await fetchAdminRowsRange(env, { householdId, start: `${month}-01`, end: nextMonthStart(month), limit: 100000, complete: false, analysisReceipt: true });
  if (result.receipt.status !== "complete") throw new Error("observation_read_incomplete");
  return result.rows;
}

// V22.9.79 V78 S-2: 그 달 고정지출 반영 표식(raw_text recurring:<규칙 id>:<달>)이 달린 기록만 좁게 읽는다. 홈·예산 알림과 같은
// ‘반영됨’ 판정(그 달 표식 또는 그 달 기록)을 그 달 기록 전체 없이 하려는 화면(/reserve-plans)이 쓴다. 실패하면 던진다.
async function fetchRecurringMarkerRows(env, householdId = "", month = "") {
  if (!householdId || !validMonth(month)) return [];
  const params = new URLSearchParams();
  params.set("select", "raw_text");
  params.set("household_id", `eq.${householdId}`);
  params.set("transaction_date", `gte.${month}-01`);
  params.append("transaction_date", `lt.${nextMonthStart(month)}`);
  params.set("raw_text", `like.recurring:*:${month}`);
  params.set("limit", "1000");
  const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("recurring_marker_read_invalid");
  return rows;
}

async function fetchRecurringRuleByIdStrict(env, id = "") {
  const rid = String(id || "").trim();
  if (!rid) return null;
  const rows = await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(rid)}&select=id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month,created_at&limit=1`, { method: "GET" }) || [];
  return rows[0] || null;
}

// Compatibility belongs to budgets, not to the transaction classifier. A custom
// category with the same normalized name follows this same interpretation.
// V22.9.76 감사 D-4: 예산이 권하는 시작 분류 ‘교통’은 자동분류의 ‘교통’(버스·지하철)만 셌다. 택시·주유/충전·차량관리는
// 따로 분류되므로 권하는 대로 예산을 잡으면 교통비 대부분이 예산 밖으로 빠졌다(교통 예산 30만 원에 사용 10,900원).
// ‘교통’ 예산은 옛 ‘교통/차량’과 같은 갈래(교통·택시·주유/충전·차량관리, 옛 기록의 ‘교통/차량’)를 센다. 웹·홈·카카오가 모두
// budgetSummary 를 쓰므로 한곳에서 맞춘다.
// V22.9.79 감사 V44 D-4(남은 몫): 시작 분류 ‘외식’도 같은 문제였다. 자동분류는 배달·편의점을 따로 나누므로 권하는 대로
// ‘외식’ 예산만 잡으면 배달 음식·편의점 지출이 예산 밖으로 조용히 빠졌다. ‘외식’ 한 줄은 옛 ‘식비’ 갈래(외식·배달·편의점,
// 옛 기록의 ‘식비’)를 센다. 형제 분류(예: 배달)에 따로 예산 행이 있으면 그 행에서만, 진짜 상위 행(식비)이 있으면 하위 행으로
// 남는 규칙은 ‘교통’과 같다. 장보기·카페/간식은 식비 갈래가 아니라 넣지 않는다(V22.9.52: 식비는 장보기·카페를 추정하지 않음).
// 그런 예산 밖 지출은 홈·카카오 남은예산·예산 화면이 ‘예산 밖 지출’로 따로 적어 조용히 빠지지 않게 한다.
const BUDGET_CATEGORY_PARENT_ALIASES = Object.freeze({ "교통": "교통/차량", "외식": "식비" });

function budgetCategoryNames(category = "", explicit = null) {
  const key = normalizeText(category);
  const alias = Object.keys(BUDGET_CATEGORY_PARENT_ALIASES).find((name) => normalizeText(name) === key);
  const aliasParent = alias ? normalizeText(BUDGET_CATEGORY_PARENT_ALIASES[alias]) : "";
  // 진짜 상위 행(교통/차량)이 같은 달 예산에 함께 있으면 ‘교통’은 그 아래 하위 행으로 남는다(V22.9.52 상위·하위 규칙).
  if (aliasParent && !(explicit && explicit.has(aliasParent))) {
    // ‘교통’ 한 줄로 교통비를 잡은 경우다. 따로 예산 행이 있는 갈래(예: 주유/충전)는 그 행에서만 세어, 형제 분류의 지출로
    // 교통 행이 초과 알림을 내지 않게 한다. 진짜 상위 행(식비·교통/차량)의 겹침 규칙은 그대로다.
    const family = Object.keys(LEGACY_CATEGORY_SPLITS).find(name => normalizeText(name) === aliasParent);
    return [...new Set([key, aliasParent, ...(family ? LEGACY_CATEGORY_SPLITS[family].map(normalizeText) : [])])]
      .filter((name) => name === key || !(explicit && explicit.has(name)));
  }
  const legacy = Object.keys(LEGACY_CATEGORY_SPLITS).find(name => normalizeText(name) === key);
  return [...new Set([key, ...(legacy ? LEGACY_CATEGORY_SPLITS[legacy].map(normalizeText) : [])])];
}

function budgetCategoryMatches(category = "", transactionCategory = "") {
  return budgetCategoryNames(category).includes(normalizeText(transactionCategory || "기타"));
}

// V22.9.79 V76 W-7: 예산과 견주는 지출의 범위(어느 분류가 예산 안인가)를 한 함수로 정한다. budgetSummary(예산 화면·홈·카카오)와
// 월말 예상(monthSpendingOutlook 의 scope "budgeted")·예산 알림의 반영 대기 고정지출이 모두 이 판정을 쓴다.
// 분류별 예산이 있으면 그 분류(상위·하위 펼침 포함)만, 없으면 전체 지출이 범위다.
function budgetCategoryScope(budgets = []) {
  const list = safeArray(budgets);
  const categoryBudgets = list.filter((b) => {
    const c = String(b?.category || "");
    return c && c !== "__total" && c !== "__income" && !isIncomeBudgetCategory(c) && Number(b.amount || 0) > 0;
  });
  const categoryBudgetTotal = categoryBudgets.reduce((a, b) => a + Number(b.amount || 0), 0);
  const explicitTotalBudget = Number((list.find((b) => String(b?.category || "") === "__total") || {}).amount || 0);
  const explicitCategories = new Set(categoryBudgets.map((b) => normalizeText(b.category)));
  const groups = categoryBudgets.map((b) => ({ budget: b, categories: budgetCategoryNames(b.category, explicitCategories) }));
  const covered = new Set(groups.flatMap((group) => group.categories));
  const basis = categoryBudgetTotal ? "category" : "total";
  return {
    basis, covered, groups, categoryBudgetTotal, explicitTotalBudget,
    totalBudget: categoryBudgetTotal || explicitTotalBudget,
    includes: (category) => basis !== "category" || covered.has(normalizeText(category || "기타")),
  };
}

function budgetSummary(rows = [], budgets = []) {
  const expenseRows = rows.filter((r) => r.type !== "income");
  const expense = expenseRows.reduce((a, r) => a + Number(r.amount || 0), 0);
  const scope = budgetCategoryScope(budgets);
  const { categoryBudgetTotal, explicitTotalBudget, totalBudget, covered, basis } = scope;
  const byCategory = Object.create(null);
  for (const r of expenseRows) {
    const c = normalizeText(r.category || "기타");
    byCategory[c] = (byCategory[c] || 0) + Number(r.amount || 0);
  }
  const categoryBudgets = scope.groups.map((group) => group.budget);
  const categoryAlerts = scope.groups.map(({ budget: b, categories }) => {
    const spent = categories.reduce((sum, category) => sum + Number(byCategory[category] || 0), 0);
    const amount = Number(b.amount || 0);
    return { category: b.category, budget: amount, spent, diff: spent - amount, rate: amount ? Math.round(spent / amount * 100) : 0, categories };
  }).sort((a, b) => b.rate - a.rate);
  // A transaction contributes once to the union even when parent/child rows overlap.
  // Allocations retain their original sum; row-level usage may overlap.
  const budgetedExpense = basis === "category"
    ? [...covered].reduce((sum, category) => sum + Number(byCategory[category] || 0), 0)
    : expense;
  const coveredCategories = [...new Set([...covered, ...categoryBudgets.map(row => String(row.category)), ...expenseRows.filter(row => covered.has(normalizeText(row.category || "기타"))).map(row => String(row.category || "기타"))])];
  const uncoveredExpense = Math.max(0, expense - budgetedExpense);
  return {
    totalBudget, explicitTotalBudget, categoryBudgetTotal, expense,
    basis, budgetedExpense, uncoveredExpense, coveredCategories,
    remaining: totalBudget ? Math.max(0, totalBudget - budgetedExpense) : 0,
    diff: budgetedExpense - totalBudget,
    rate: totalBudget ? Math.round(budgetedExpense / totalBudget * 100) : 0,
    categoryAlerts,
  };
}

function budgetCenterSummary(rows = [], budgets = []) {
  const stats = calculateStats(rows);
  const budget = budgetSummary(rows, budgets);
  // V22.9.37 감사 SIM-9: 종류별 예상 수입(__income:이름)이 하나라도 있으면 옛 버전의 __income 합계 행은 기준에서 뺀다.
  // 둘이 함께 남은 달에는 예상 수입이 두 번 더해졌고, 폼에 보이지 않는 옛 값이 기준을 바꿨다. 종류별 행이 없을 때만
  // 호환용으로 쓴다 — 분류별 예산 합계가 있으면 __total 을 쓰지 않는 규칙과 같다. 쓰지 않은 옛 값은 화면이 알리도록 따로 돌려준다.
  const typedIncomeBudgets = safeArray(budgets).filter((b) => isIncomeBudgetCategory(String(b.category || "")));
  const legacyIncomeBudgets = safeArray(budgets).filter((b) => String(b.category || "") === "__income");
  const useTypedIncome = typedIncomeBudgets.some((b) => Number(b.amount || 0) > 0);
  const incomeBudgets = useTypedIncome ? typedIncomeBudgets : legacyIncomeBudgets;
  const legacyIncomeBudget = useTypedIncome ? legacyIncomeBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0) : 0;
  const incomeBudget = incomeBudgets.reduce((sum, b) => sum + Number(b.amount || 0), 0);
  const actualIncomeMap = Object.create(null);
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
  return { stats, budget, incomeBudget, legacyIncomeBudget, actualIncome, actualIncomeCategories, incomeBase, totalBudget, budgetIncomeRate, freeAfterBudget, actualSavings, incomeBudgets };
}

function budgetStatusLabel(rate = 0, spent = null, budget = null) {
  if (spent != null && budget != null) { if (Number(spent) > Number(budget)) return "\uCD08\uACFC"; if (Number(spent) === Number(budget)) return "\uC18C\uC9C4"; if (rate >= 85) return "\uC8FC\uC758"; return "\uC0AC\uC6A9\uC911"; }
  if (rate >= 100) return "초과";
  if (rate >= 85) return "주의";
  if (rate >= 60) return "사용중";
  return "여유";
}

function renderBudgetCategoryUsageTree(category = "", rows = [], categories = null) {
  // V22.9.76 D-4: 카드의 사용액과 같은 분류 목록(budgetSummary 의 행 categories)으로 사용 내역을 보인다.
  const filtered = safeArray(rows).filter((r) => r.type !== "income" && (Array.isArray(categories) ? categories.includes(normalizeText(r.category || "기타")) : budgetCategoryMatches(category, r.category)));
  if (!filtered.length) return `<div class="budgetTree emptyTree">아직 이 분류로 사용된 기록이 없습니다.</div>`;
  // V22.9.77 감사 B-5: 사람별 묶음은 사용자 id 로 만든다(이름으로 묶으면 같은 이름의 구성원·나간 사람이 한 묶음이 됐다).
  const groups = new Map();
  for (const r of filtered) {
    const name = r.spender_name || r.user_name || r.nickname || r.user_id || "미지정";
    const key = String(r.user_id ?? "").trim() || `name:${name}`;
    if (!groups.has(key)) groups.set(key, { name, total: 0, rows: [] });
    groups.get(key).total += Number(r.amount || 0);
    groups.get(key).rows.push(r);
  }
  const groupLabels = distinctPersonLabels([...groups].map(([key, group]) => ({ id: key, label: group.name })));
  return `<div class="budgetTree">${[...groups].map(([key, group]) => [groupLabels.get(key) || group.name, group]).map(([name, group]) => {
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
    ? "외식·교통 등 필요한 지출 분류를 추가하면 이전 월 총액 대신 분류 합계가 사용됩니다."
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
    const alert = safeArray(budget.categoryAlerts).find((x) => x.category === b.category)
      || safeArray(budget.categoryAlerts).find((x) => normalizeText(x.category) === normalizeText(b.category))
      || { spent: 0, budget: Number(b.amount || 0), rate: 0 };
    const remain = Math.max(0, Number(b.amount || 0) - Number(alert.spent || 0));
    const tree = renderBudgetCategoryUsageTree(b.category, rowsForDetails, alert.categories || null);
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
  const summary = budgetSummary(rows, budgets);
  const catBudget = summary.categoryAlerts.find(b => b.category === category)
    || summary.categoryAlerts.find(b => normalizeText(b.category) === normalizeText(category))
    || summary.categoryAlerts.find(b => b.categories.includes(normalizeText(category)));
  let name = "", info = null;
  if (catBudget) { name = catBudget.category; info = budgetStageInfo(catBudget.spent, catBudget.budget); }
  else {
    if (!summary.totalBudget) return "";
    name = "예산 기준";
    info = budgetStageInfo(summary.budgetedExpense, summary.totalBudget);
  }
  if (!info || info.stage === "ok") return "";
  if (info.stage === "over") return `🚨 ${name} 예산 초과 · ${numberWithCommas(info.over)}원 넘었어요 (${info.rate}%)`;
  return `⚠️ ${name} 예산 ${info.rate}% · ${numberWithCommas(info.remain)}원 남음`;
}

function budgetFeedbackLine(rows = [], budgets = [], category = "") {
  const summary = budgetSummary(rows, budgets);
  const categoryBudget = summary.categoryAlerts.find(b => b.category === category)
    || summary.categoryAlerts.find(b => normalizeText(b.category) === normalizeText(category))
    || summary.categoryAlerts.find(b => b.categories.includes(normalizeText(category)));
  if (categoryBudget) {
    const budget = Number(categoryBudget.budget || 0);
    const spent = Number(categoryBudget.spent || 0);
    const info = budgetStageInfo(spent, budget);
    const head = info.stage === "over" ? `🚨 ${categoryBudget.category} 예산 초과` : info.stage === "warn" ? `⚠️ ${categoryBudget.category} 예산 주의` : `📊 ${categoryBudget.category} 예산`;
    const tail = info.stage === "over" ? `\n${numberWithCommas(info.over)}원 초과했어요.` : `\n남은 예산: ${numberWithCommas(info.remain)}원`;
    return `\n\n${head}\n사용: ${numberWithCommas(spent)}원 / ${numberWithCommas(budget)}원 (${info.rate}%)${tail}`;
  }
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
  return (await kakaoBudgetStatusParts(env, householdId, month, origin, householdName)).text;
}

// V22.9.72: 예산이 없을 때는 "예산을 정하고 지출을 기록하면 남은 예산을 볼 수 있다"는 짧은 안내만 돌려주고(noBudget),
// 호출부가 예산설정·기록하기 버튼을 붙인다(2026-10-20 디자이너 피드백).
async function kakaoBudgetStatusParts(env, householdId, month, origin = "", householdName = "", { canManage = true } = {}) {
  try {
    const budgets = await fetchBudgets(env, householdId, month);
    const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const stats = calculateStats(rows);
    const budget = budgetSummary(rows, budgets);
    const totalBudget = Number(budget.totalBudget || 0);
    const expense = Number(budget.budgetedExpense ?? budget.expense ?? stats.totals.expense ?? 0);
    const remain = totalBudget ? totalBudget - expense : 0;
    const rate = totalBudget ? Math.round((expense / totalBudget) * 100) : 0;
    if (!totalBudget) {
      // V22.9.37 감사 D7: 지출 예산이 0원이면(예상 수입만 저장된 달 포함) "남은 예산 0원(초과)"가 아니라 예산 없음이다.
      const incomeOnly = budgets.some((b) => isIncomeBudgetCategory(String(b.category || "")) || String(b.category || "") === "__income");
      return { noBudget: true, text: [
        `💰 ${month} 예산 현황`, householdName ? `가계부: ${householdName}` : "", "",
        incomeOnly ? "아직 지출 예산이 설정되지 않았어요. 예상 수입만 저장되어 있어요." : "아직 예산이 없어요.",
        canManage ? "예산을 정하고 지출을 기록하면 남은 예산을 바로 볼 수 있어요." : "가계부 주인·관리자가 ‘예산설정’으로 예산을 정하면 남은 예산을 볼 수 있어요.",
        `이번 달 지출: ${numberWithCommas(expense)}원`,
      ].filter(Boolean).join("\n") };
    }
    // 분류별 예산이 있는 달에는 직접 설정한 전체 예산(__total)을 쓰지 않는다(V22.6.5 규칙). "예산 50만원"으로 저장한 값이
    // 왜 보이지 않는지 알 수 있게 그 사실을 적는다.
    const ignoredTotal = budget.basis === "category" && Number(budget.explicitTotalBudget || 0) > 0
      ? `직접 설정한 전체 예산 ${numberWithCommas(budget.explicitTotalBudget)}원은 분류별 예산이 있어 계산에 쓰지 않아요.`
      : "";
    const status = expense > totalBudget ? "초과" : rate >= 85 ? "주의" : rate >= 60 ? "사용중" : "여유";
    const categoryLines = safeArray(budget.categoryAlerts).filter((x) => Number(x.budget || 0) > 0).slice(0, 7).map((x) => {
      const left = Number(x.budget || 0) - Number(x.spent || 0);
      const leftText = left >= 0 ? `${numberWithCommas(left)}원 남음` : `${numberWithCommas(Math.abs(left))}원 초과`;
      return `• ${x.category}: ${numberWithCommas(x.spent)}원 사용 / ${leftText} · ${x.rate || 0}%`;
    });
    return { noBudget: false, text: [
      `💰 ${month} 예산 현황`, householdName ? `가계부: ${householdName}` : "", "",
      `전체 예산: ${numberWithCommas(totalBudget)}원${budget.basis === "category" ? " (분류별 예산 합계)" : ""}`,
      ...(ignoredTotal ? [ignoredTotal] : []),
      `사용 금액: ${numberWithCommas(expense)}원`,
      // V22.9.79 감사 V44 D-4: 분류별 예산이면 예산을 잡지 않은 분류의 지출(예: 장보기)은 사용률에 들지 않는다. 조용히 빠지지 않게 적는다.
      ...(budget.basis === "category" && Number(budget.uncoveredExpense || 0) > 0 ? [`예산 밖 지출: ${numberWithCommas(budget.uncoveredExpense)}원 (예산을 잡지 않은 분류라 사용률에 넣지 않아요)`] : []),
      `남은 예산: ${remain >= 0 ? numberWithCommas(remain) + "원" : numberWithCommas(Math.abs(remain)) + "원 초과"}`,
      `사용률: ${rate}% (${status})`,
      ...(categoryLines.length ? ["", "카테고리별", ...categoryLines, "상위·하위 행의 사용액은 겹칠 수 있어요. 전체 사용액은 거래마다 한 번만 셉니다."] : []),
    ].join("\n") };
  } catch (err) {
    return { noBudget: false, text: "💰 예산 현황을 불러오지 못했어요. 잠시 후 ‘남은예산’을 다시 입력해 주세요." };
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

// V22.9.37: 이 묶음에서 새로 생긴 안내 코드. formatMessage 는 모르는 코드를 일반 안내로 닫으므로 예산·정기·설정 화면이
// 먼저 이 표를 본다. 수동 반영 결과("고정항목 N건 기록 …")는 숫자가 들어 있어 코드가 될 수 없으므로 형식을 확인한 뒤 그대로 보여 준다.
// 돌려주는 값은 formatMessage 와 같이 HTML 이스케이프가 끝난 문장이고, 모르는 코드는 빈 문자열이다.
function budgetPlanMessage(code = "") {
  const text = String(code || "");
  if (/^고정항목 \d{1,6}건 기록(?: · \d{1,6}건은 지출자가 활성 참여자가 아니어서 건너뜀)?$/.test(text)) return escapeHtml(text);
  switch (text) {
    case "recurring_apply_incomplete": return escapeHtml("고정항목 반영을 끝내지 못했습니다. 일부 기록이 이미 반영되었으므로 거래내역과 반영 상태를 먼저 확인해 주세요.");
    case "budget_month_invalid": return escapeHtml("월 형식이 올바르지 않아 저장하지 않았습니다(예: 2026-07). 다른 달의 예산도 바꾸지 않았습니다.");
    case "budget_duplicate_category": return escapeHtml("같은 분류가 두 줄 이상 서로 다른 금액으로 들어 있어 저장하지 않았습니다. 한 줄만 남기고 다시 저장해 주세요. 기존 예산은 그대로입니다.");
    case "reserve_name_duplicate": return escapeHtml("같은 이름의 정기 항목이 이미 있어 저장하지 않았습니다. 기존 항목을 수정하거나 다른 이름을 써 주세요. 두 항목 모두 그대로 있습니다.");
    case "reserve_due_day_invalid": return escapeHtml("납부·입금일은 1~28 사이 숫자로 입력해 주세요. 저장하지 않았습니다.");
    case "reserve_due_month_invalid": return escapeHtml("납부·입금월은 1~12월 중에서 골라 주세요. 저장하지 않았습니다.");
    case "reserve_recurrence_invalid": return escapeHtml("반복주기는 매월·연 1회·반기·분기 중 하나여야 합니다. 저장하지 않았습니다.");
    case "recurring_busy": return escapeHtml("같은 가계부의 다른 저장이 진행 중이라 이 요청은 저장하지 않았습니다. 두 번 누른 경우 첫 요청이 저장했을 수 있으니 목록을 먼저 확인해 주세요.");
    case "recurring_day_invalid": return escapeHtml("정기 항목의 날짜는 1~31일 중에서 골라 주세요. 그 달에 없는 날(예: 2월 30일)은 말일에 기록됩니다. 저장하지 않았습니다.");
    case "recurring_amount_invalid": return escapeHtml("정기 항목 금액은 0보다 큰 숫자로 입력해 주세요. 음수는 받지 않으며 저장하지 않았습니다.");
    case "recurring_spender_ineligible": return escapeHtml("고정항목의 지출자는 이 가계부의 소유자·관리자·구성원 중에서 골라야 합니다. 조회 전용·승인 대기·차단·나간 참여자의 규칙은 반영되지 않아 저장하지 않았습니다.");
    default: return "";
  }
}
// @build:exports-start
export {
  budgetAlertText, budgetCategoryScope, budgetCenterSummary, budgetFeedbackLine,
  budgetPlanFingerprint, budgetPlanMessage, budgetStageInfo, budgetStatusLabel, budgetSummary,
  fetchBudgets, fetchMobileHomeSettings, fetchObservationMonthRows, fetchRecurringMarkerRows,
  fetchRecurringRuleByIdStrict, fetchRecurringStrict, kakaoBudgetStatusParts, optionalSupabase,
  renderBudgetBasisRows, renderBudgetConsistencyAlert, renderBudgetRows,
};
// @build:exports-end
