// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { safeError, withHouseholdDatabaseLease } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { safeAdminReturnPath, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT, resolveTransactionAccess } from "./transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { CATEGORY_KEYWORD_GUIDE } from "./category-guide-pages.js";
import {
  attachSpenderNames, fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
  renderSpenderOptions, selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { safeArray } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchRawHouseholdMembers, fetchUserById } from "../data/users-household-create.js";
import {
  applyRecurringRuleForMonth, eligibleRecurringSpenders, recurringSpenderEligible,
} from "../cron/recurring-auto-apply.js";
import {
  defaultExpenseBudgetNames, defaultIncomeBudgetNames, expenseBudgetRows, incomeBudgetRows,
  parseBudgetFormAmount,
} from "../my/groups-budget-bulk.js";
import {
  getMySelectedHousehold, householdNotFoundResponse, myAccessStatusResponse,
} from "../my/access-control.js";
import { householdPageMessage } from "../my/households-lifecycle.js";
import {
  budgetCenterSummary, budgetPlanFingerprint, budgetPlanMessage, budgetStatusLabel, fetchBudgets,
  fetchRecurringRuleByIdStrict, fetchRecurringStrict, renderBudgetBasisRows,
  renderBudgetConsistencyAlert, renderBudgetRows,
} from "../domain/budgets.js";
import { moneyPlanTabsCss, renderMoneyPlanTabs } from "../my/money-plan-home-layout.js";
import { addQueryToUrl } from "../auth/local-login-pages.js";
import { DEFAULT_CATEGORIES } from "./dashboard-fragments.js";
import { formatMessage, mergedOptions } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleBudgetCenterPage(request, env, url) {
  // V22.9.16: 세션 두 종류, 사용자 행과 가계부 목록, 화면 데이터 네 가지를 각각 함께 던진다.
  const [userId, adminOk] = await Promise.all([
    verifyUserSession(request, env),
    verifyAdminSession(request, env),
  ]);
  if (!userId && !adminOk) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  let householdId = "";
  let selected = null;
  if (userId) {
    const [user, access] = await Promise.all([
      fetchUserById(env, userId),
      getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || ""),
    ]);
    if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
    households = access.households;
    selected = access.selected;
    householdId = selected?.id || "";
  } else {
    households = await fetchAdminHouseholds(env);
    selected = selectRequestedScopedHousehold(households, url.searchParams.get("household_id") || "");
    householdId = selected?.id || "";
  }
  if (!selected) return redirectResponse(userId ? "/my/households?err=no_household" : "/?legacy=1");
  const canManage = adminOk || ["owner", "admin"].includes(String(selected.role || "").toLowerCase());
  const [members, rawRows, budgetRead, customCategories] = await Promise.all([
    fetchHouseholdMembers(env, householdId),
    fetchAdminRows(env, { month, householdId, type: "all" }),
    // V22.9.34 감사 S3: 계획 폼은 엄격하게 읽는다. 못 읽으면 빈 폼을 그리지 않는다.
    fetchBudgets(env, householdId, month, { strict: true }).then((list) => ({ ok: true, rows: list }), (error) => ({ ok: false, rows: [], error })),
    fetchCustomCategories(env, householdId),
  ]);
  if (!budgetRead.ok) rememberOpsEvent({ kind: "budget_plan_read_failed", severity: "warn", path: "/budgets", method: "GET", detail: safeError(budgetRead.error) });
  const budgets = budgetRead.rows;
  const planFingerprint = budgetRead.ok ? budgetPlanFingerprint(budgets) : "";
  const rows = attachSpenderNames(rawRows, members);
  const center = budgetCenterSummary(rows, budgets);
  const incomePlans = incomeBudgetRows(budgets).filter((row) => Number(row.amount || 0) > 0);
  while (incomePlans.length < 2) incomePlans.push({ name: defaultIncomeBudgetNames()[incomePlans.length] || "기타수입", amount: 0 });
  const expensePlans = expenseBudgetRows(budgets, customCategories).filter((row) => Number(row.amount || 0) > 0);
  const editExpenses = expensePlans.length ? expensePlans : ["식비", "교통", "생활용품", "보험", "카페/간식"].map((name) => ({ name, amount: 0 }));
  const incomeOptions = [`<option value="">직접입력</option>`, ...defaultIncomeBudgetNames().map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join("");
  const categoryNames = defaultExpenseBudgetNames(customCategories);
  const categoryOptions = [`<option value="">직접입력</option>`, ...categoryNames.map((name) => `<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`)].join("");
  const incomeInputs = incomePlans.map((row) => `<div class="planLine"><label>수입 종류<input name="income_name" value="${escapeHtml(row.name)}" placeholder="예: 급여, 상여, 부수입"/></label><label>빠른 선택<select class="pickValue">${incomeOptions}</select></label><label>예상 금액<input name="income_amount" inputmode="numeric" value="${Number(row.amount || 0) || ""}" placeholder="예: 2500000"/></label></div>`).join("");
  const expenseInputs = editExpenses.map((row) => `<div class="planLine"><label>지출 분류<input name="budget_category" value="${escapeHtml(row.name)}" placeholder="예: 식비, 교통"/></label><label>빠른 선택<select class="pickValue">${categoryOptions}</select></label><label>한도 금액<input name="budget_amount" inputmode="numeric" value="${Number(row.amount || 0) || ""}" placeholder="예: 500000"/></label></div>`).join("");
  const actualIncomeRows = center.actualIncomeCategories.length
    ? center.actualIncomeCategories.map((item) => `<li><span><b>${escapeHtml(item.category)}</b><small>${numberWithCommas(item.count)}건</small></span><strong>${numberWithCommas(item.amount)}원</strong></li>`).join("")
    : `<li class="empty">아직 이번 달 수입 기록이 없습니다.</li>`;
  const planIncomeRows = incomePlans.filter((row) => Number(row.amount || 0) > 0).length
    ? incomePlans.filter((row) => Number(row.amount || 0) > 0).map((row) => `<li><span><b>${escapeHtml(row.name)}</b><small>예상</small></span><strong>${numberWithCommas(row.amount)}원</strong></li>`).join("")
    : `<li class="empty">예상 수입을 종류별로 입력하면 여기에 합산됩니다.</li>`;
  const usageCards = expensePlans.length ? expensePlans.map((row) => {
    const usage = center.budget.categoryAlerts.find((item) => normalizeText(item.category) === normalizeText(row.name)) || { spent: 0, rate: 0 };
    const remain = Math.max(0, Number(row.amount || 0) - Number(usage.spent || 0));
    // 홈 게이지와 같은 규칙: 막대는 100% 에서 멈추므로 1,019% 와 100% 가 같은 길이다.
    // 글자 배지(초과/여유)는 이미 다르게 말하고 있었는데 막대 색은 늘 강조색이었다.
    // V22.9.37 감사 D11: 초과는 반올림 사용률이 아니라 실제 금액으로 판정한다(99.6% 는 100% 로 반올림돼도 초과가 아니다).
    const isOver = Number(usage.spent || 0) > Number(row.amount || 0);
    const usageState = isOver ? " isOver" : Number(usage.rate || 0) >= 85 ? " isWarn" : "";
    const usageLabel = isOver ? "초과" : Number(usage.spent || 0) === Number(row.amount || 0) ? "소진" : budgetStatusLabel(Math.min(99, Number(usage.rate || 0)));
    return `<article class="usageCard${usageState}"><div><b>${escapeHtml(row.name)}</b><span>${usageLabel}</span></div><dl><div><dt>예산</dt><dd>${numberWithCommas(row.amount)}원</dd></div><div><dt>사용</dt><dd>${numberWithCommas(usage.spent)}원</dd></div><div><dt>남음</dt><dd>${numberWithCommas(remain)}원</dd></div></dl><div class="miniBar"><i style="width:${Math.min(100, Math.max(0, usage.rate || 0))}%"></i></div><small>사용률 ${numberWithCommas(usage.rate || 0)}%</small></article>`;
  }).join("") : `<div class="empty">지출 분류별 한도를 저장하면 사용 현황이 표시됩니다.</div>`;
  const legacyTotal = budgets.find((b) => String(b.category || "") === "__total") || null;
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(householdId) ? " selected" : ""}>${escapeHtml(h.name || "가계부")}</option>`).join("");
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const hh = `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const planForm = canManage && userId && !budgetRead.ok ? `<section class="card" id="plan"><h2>예상 수입과 지출 예산</h2><p class="warn" role="alert">예산을 불러오지 못해 지금은 편집할 수 없습니다. 저장된 예산은 그대로이니 잠시 뒤 새로고침해 주세요.</p></section>` : canManage && userId ? `<section class="card" id="plan"><div class="sectionHead"><div><span class="eyebrow">종류·분류별 입력</span><h2>예상 수입과 지출 예산</h2></div><b>월 총액 직접입력 없음</b></div><p class="muted">급여·부수입 같은 수입 종류와 식비·교통 같은 지출 분류를 입력하면 각각 자동 합산됩니다. 0원이나 빈 행은 저장하지 않습니다.</p><form method="post" action="/my/budget-bulk/save" id="budgetPlanForm"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="plan_fingerprint" value="${escapeHtml(planFingerprint)}"/><div class="planGrid"><div><h3>예상 수입 종류</h3><div id="incomeRows">${incomeInputs}</div><button type="button" class="addLine" data-add="income">+ 수입 종류 추가</button><p class="guide">실제 수입은 기록에서 자동 집계됩니다. 여기는 앞으로 들어올 예상 금액만 입력합니다.</p></div><div><h3>지출 분류별 한도</h3><div id="expenseRows">${expenseInputs}</div><button type="button" class="addLine" data-add="expense">+ 지출 분류 추가</button><p class="guide">분류별 금액의 합계가 이번 달 전체 지출 예산이 됩니다.</p></div></div><button class="savePlan" type="submit">종류별 수입·분류별 예산 저장</button></form></section>` : `<section class="card"><h2>예산 설정</h2><p class="muted">${canManage ? "관리자 세션에서는 사용자 계정으로 가계부를 연 뒤 종류·분류별 계획을 편집하세요." : "가계부 소유자 또는 관리자만 계획을 변경할 수 있습니다."}</p></section>`;
  // V22.8.92 (7.5): 이 화면의 답은 "남은 예산" 하나다. 예산 설정 표가 아니라
  // 남은 돈이 P0 이고, 표는 그 아래에 둔다. 그리고 사용률이 낮게 보이는 이유를
  // P0 가 직접 말한다 — 분류별 예산만 잡은 달에는 예산을 잡지 않은 분류의 지출이
  // 사용률 계산에서 빠지므로(V22.8.81), 그 금액을 P0 보조 줄로 올린다.
  // 표 안에 묻혀 있을 때는 "왜 이렇게 여유로워 보이지"에 아무도 답하지 못했다.
  const budgetP0Remaining = Number(center.budget.remaining || 0);
  const budgetP0Uncovered = Number(center.budget.uncoveredExpense || 0);
  const budgetP0Rate = Math.min(100, Math.max(0, Number(center.budget.rate || 0)));
  // 671% 인 화면이 100% 와 똑같이 보이던 자리. 게이지는 100 에서 멈추고 색도 하나뿐이라,
  // 예산을 6배 넘긴 달과 딱 맞춘 달이 구별되지 않았다. 히어로 전체를 경고색으로 돌린다.
  // V22.9.37 감사 D11: 초과 판정은 반올림 사용률이 아니라 실제 금액이다(V22.9.30 기준).
  const budgetP0State = Number(center.budget.budgetedExpense || 0) > Number(center.totalBudget || 0) ? " isOver" : Number(center.budget.rate || 0) >= 85 ? " isWarn" : "";
  const budgetP0Html = center.totalBudget
    ? `<section class="budgetP0${budgetP0State}" aria-labelledby="budgetP0Title"><span id="budgetP0Title">이번 달 남은 예산</span><b>${numberWithCommas(budgetP0Remaining)}<small>원</small></b><div class="budgetP0Gauge"><i style="width:${budgetP0Rate}%"></i></div><p>전체 예산 ${numberWithCommas(center.totalBudget)}원 · 사용 ${numberWithCommas(center.budget.budgetedExpense)}원 (${numberWithCommas(center.budget.rate || 0)}%)</p>${budgetP0Uncovered ? `<p class="budgetP0Aside">예산 밖 지출 ${numberWithCommas(budgetP0Uncovered)}원 별도 — 예산을 잡은 분류만 사용률에 들어갑니다.</p>` : ""}</section>`
    : `<section class="budgetP0 isEmpty" aria-labelledby="budgetP0Title"><span id="budgetP0Title">이번 달 남은 예산</span><b>아직 없음</b><p>아래에서 지출 분류별 한도를 저장하면 남은 예산이 이 자리에 생깁니다.</p></section>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 수입·예산</title><style>${moneyPlanTabsCss()}*,*:before,*:after{box-sizing:border-box}html,body{max-width:100%;overflow-x:hidden}body{margin:0;background:#f6f7fb;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:16px 16px 126px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 30px rgba(15,23,42,.055)}.hero h1{margin:0 0 7px;font-size:25px}.hero p,.muted{color:#667085;line-height:1.6}.filters{display:grid;grid-template-columns:minmax(0,1fr) 160px 100px;gap:8px;margin-top:14px}.filters select,.filters input,.filters button,.planLine input,.planLine select{width:100%;min-width:0;height:46px;border:1px solid #d0d5dd;border-radius:13px;padding:0 11px;background:#fff;font:inherit}.filters button,.savePlan,.addLine{border:0;border-radius:13px;background:#111827;color:#fff;font-weight:1000;padding:0 14px;min-height:44px}.budgetP0{background:var(--ab12-action,#1d4ed8);color:#fff;border-radius:var(--ab12-r-lg,16px);padding:var(--ab12-sp-5,24px);margin:12px 0}.budgetP0>span{display:block;font-size:var(--ab12-fs-cap,12px);font-weight:1000;opacity:.86}.budgetP0>b{display:block;margin-top:6px;font-size:var(--ab12-fs-num-xl,34px);font-weight:var(--ab12-fw-num-xl,700);line-height:1.1;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.budgetP0>b small{font-size:18px;font-weight:800;margin-left:3px;opacity:.82}.budgetP0Gauge{height:8px;margin:14px 0 10px;border-radius:var(--ab12-r-sm,8px);background:rgba(255,255,255,.26);overflow:hidden}.budgetP0Gauge i{display:block;height:100%;border-radius:inherit;background:#fff}.budgetP0 p{margin:0;font-size:13px;font-weight:900;line-height:1.6;opacity:.9}.budgetP0 p.budgetP0Aside{margin-top:7px;opacity:1;border-top:1px solid rgba(255,255,255,.28);padding-top:8px}.budgetP0.isEmpty>b{font-size:24px}.metrics{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:14px;min-width:0}.metric span,.metric small{display:block;color:#667085;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px;overflow-wrap:anywhere}.metric.actual{background:#ecfdf5;border-color:#bbf7d0}.metric.plan{background:#eff6ff;border-color:#bfdbfe}.twoCol{display:grid;grid-template-columns:1fr 1fr;gap:12px}.moneyList{list-style:none;padding:0;margin:0;display:grid;gap:7px}.moneyList li{display:flex;align-items:center;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:14px;padding:11px 12px}.moneyList li span b,.moneyList li span small{display:block}.moneyList li span small{color:#667085;margin-top:3px}.moneyList li strong{white-space:nowrap}.empty{display:block!important;background:#f8fafc;border:1px dashed #cbd5e1!important;color:#667085;padding:14px!important;border-radius:14px}.sectionHead{display:flex;align-items:flex-start;justify-content:space-between;gap:10px}.sectionHead h2{margin:7px 0 0}.sectionHead>b{background:#dcfce7;color:#166534;border-radius:999px;padding:7px 10px;font-size:12px;white-space:nowrap}.eyebrow{display:inline-flex;background:#fff7cc;color:#5c4700;border-radius:999px;padding:6px 9px;font-size:11px;font-weight:1000}.planGrid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.planLine{display:grid;grid-template-columns:1.1fr .9fr 1fr;gap:7px;margin:8px 0}.planLine label{display:grid;gap:5px;color:#475467;font-size:11px;font-weight:1000}.addLine{background:#eef2ff;color:#3730a3;min-height:40px}.guide{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:14px;padding:11px;font-size:12px;line-height:1.5}.savePlan{width:100%;margin-top:12px;min-height:50px}.usageGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}.usageCard{border:1px solid #e5e7eb;border-radius:17px;padding:13px;min-width:0}.usageCard>div:first-child{display:flex;justify-content:space-between;gap:8px}.usageCard>div:first-child span{font-size:11px;font-weight:1000;color:#475569}.usageCard dl{display:grid;grid-template-columns:repeat(3,1fr);gap:5px;margin:12px 0}.usageCard dl div{min-width:0}.usageCard dt{font-size:10px;color:#667085}.usageCard dd{margin:3px 0 0;font-size:12px;font-weight:1000;overflow-wrap:anywhere}.miniBar{height:9px;background:#eef2f7;border-radius:999px;overflow:hidden}.miniBar i{display:block;height:100%;background:#3182f6;border-radius:999px}.usageCard.isWarn .miniBar i{background:var(--ab12-gauge-warn,#c2410c)}.usageCard.isOver .miniBar i{background:var(--ab12-gauge-over,#b91c1c)}.usageCard.isOver>div:first-child span{color:var(--ab12-gauge-over,#b91c1c)}.budgetP0.isWarn{background:var(--ab12-gauge-warn,#c2410c)}.budgetP0.isOver{background:var(--ab12-gauge-over,#b91c1c)}.usageCard>small{display:block;color:#667085;margin-top:6px}.notice{border-radius:14px;padding:11px}.notice.ok{background:#ecfdf5;color:#166534}.notice.error,.legacy{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa}.legacy{border-radius:14px;padding:11px;font-size:12px;line-height:1.5}@media(max-width:760px){.wrap{padding:10px 10px 132px}.hero,.card{padding:16px;border-radius:19px}.filters,.planGrid,.twoCol{grid-template-columns:1fr}.metrics{grid-template-columns:1fr 1fr}.planLine{grid-template-columns:1fr}.planLine input,.planLine select,.filters select,.filters input{font-size:16px}.sectionHead{display:block}.sectionHead>b{display:inline-flex;margin-top:9px}.usageGrid{grid-template-columns:1fr}.metric b{font-size:20px}}@media(max-width:360px){.metrics{grid-template-columns:1fr}}</style></head><body>${renderUnifiedNav("budgets", { month, householdId, householdName: selected.name })}<main class="wrap">${renderMoneyPlanTabs("budgets", { month, householdId })}<section class="hero"><h1>월별 예산·수입</h1><p><b>이번 달에만 적용되는 계획</b>입니다. 매달 반복되는 항목은 위 <b>정기 수입·지출</b> 탭에서 관리합니다. 실제 수입은 기록에서 자동 합산하고, 예상 수입과 지출 예산은 종류·분류별 금액을 더해 계산합니다.</p><form class="filters" method="get" action="/budgets"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section>${msg ? `<div class="notice ok">${budgetPlanMessage(msg) || escapeHtml(householdPageMessage(msg))}</div>` : ""}${err ? `<div class="notice error">${budgetPlanMessage(err) || escapeHtml(householdPageMessage(err))}</div>` : ""}${budgetP0Html}<section class="metrics"><div class="metric actual"><span>실제 수입 · 기록 자동합계</span><b>${numberWithCommas(center.actualIncome)}원</b><small>${numberWithCommas(center.actualIncomeCategories.reduce((sum, item) => sum + item.count, 0))}건</small></div><div class="metric plan"><span>예상 수입 · 종류별 합계</span><b>${numberWithCommas(center.incomeBudget)}원</b><small>${numberWithCommas(incomePlans.filter((row) => Number(row.amount || 0) > 0).length)}종류</small></div><div class="metric"><span>지출 예산 · 분류별 합계</span><b>${numberWithCommas(center.totalBudget)}원</b><small>${numberWithCommas(expensePlans.length)}개 분류</small></div><div class="metric"><span>이번 달 지출</span><b>${numberWithCommas(center.budget.expense)}원</b><small>예산 사용 ${numberWithCommas(center.budget.rate || 0)}%</small></div><div class="metric"><span>실제 수입 - 실제 지출</span><b>${numberWithCommas(center.actualSavings)}원</b><small>기록 기준 단순 차액</small></div></section><section class="twoCol"><div class="card"><h2>실제 수입 분류</h2><p class="muted">수입으로 기록한 거래가 자동 합산됩니다.</p><ul class="moneyList">${actualIncomeRows}</ul></div><div class="card"><h2>예상 수입 종류</h2><p class="muted">앞으로 들어올 것으로 계획한 금액입니다.</p><ul class="moneyList">${planIncomeRows}</ul>${center.legacyIncomeBudget ? `<div class="legacy"><b>이전 버전의 월 수입 기준 ${numberWithCommas(center.legacyIncomeBudget)}원이 남아 있습니다.</b><br/>종류별 예상 수입이 있으면 이 값은 계산에 사용하지 않습니다. 새 계획을 저장하면 자동으로 정리됩니다.</div>` : ""}</div></section>${planForm}<section class="card"><h2>지출 분류별 사용 현황</h2><p class="muted">월 총액을 따로 정하지 않고 각 분류의 한도를 더해 전체 예산을 계산합니다.</p><div class="usageGrid">${usageCards}</div>${legacyTotal ? `<div class="legacy"><b>이전 버전의 월 총액 ${numberWithCommas(legacyTotal.amount)}원이 남아 있습니다.</b><br/>분류별 예산이 있으면 이 값은 계산에 사용하지 않습니다. 새 계획을 저장하면 자동으로 정리됩니다.</div>` : ""}</section><section class="card"><h2>계산 기준</h2><p class="muted">실제 수입 = 수입 거래 합계 · 예상 수입 = 수입 종류별 계획 합계 · 전체 지출 예산 = 지출 분류별 한도 합계 · 남은 예산 = 전체 지출 예산 - 실제 지출입니다.</p><p><a href="/app?${hh}">홈으로 돌아가기</a> · <a href="/my/settings?${hh}">정기지출·분류 키워드 설정</a></p></section></main><script>(function(){var incomeOptions=${JSON.stringify(incomeOptions)};var categoryOptions=${JSON.stringify(categoryOptions)};function bind(root){root.querySelectorAll('.pickValue').forEach(function(select){select.addEventListener('change',function(){var line=select.closest('.planLine');var input=line&&line.querySelector('input');if(input&&select.value)input.value=select.value;});});}function make(type){var div=document.createElement('div');div.className='planLine';if(type==='income'){div.innerHTML='<label>수입 종류<input name="income_name" placeholder="직접입력: 수입 종류"/></label><label>빠른 선택<select class="pickValue">'+incomeOptions+'</select></label><label>예상 금액<input name="income_amount" inputmode="numeric" placeholder="예상 수입"/></label>';}else{div.innerHTML='<label>지출 분류<input name="budget_category" placeholder="직접입력: 지출 분류"/></label><label>빠른 선택<select class="pickValue">'+categoryOptions+'</select></label><label>한도 금액<input name="budget_amount" inputmode="numeric" placeholder="예산 금액"/></label>';}bind(div);return div;}document.querySelectorAll('[data-add]').forEach(function(button){button.addEventListener('click',function(){var type=button.getAttribute('data-add');document.getElementById(type==='income'?'incomeRows':'expenseRows').appendChild(make(type));});});bind(document);})();</script></body></html>`);
}

async function handleBudgetCenterPageLegacyV2264(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const adminOk = await verifyAdminSession(request, env);
  if (!userId && !adminOk) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  let householdId = "";
  if (userId) {
    const user = await fetchUserById(env, userId);
    const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
    if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
    households = access.households;
    householdId = access.selected?.id || "";
  } else {
    households = await fetchAdminHouseholds(env);
    // V22.9.37 감사 H9: 주소의 가계부가 없으면 첫 가계부로 바꿔 보여 주지 않는다.
    const requestedAdminHousehold = url.searchParams.get("household_id") || "";
    const scopedAdminHousehold = selectRequestedScopedHousehold(households, requestedAdminHousehold);
    if (requestedAdminHousehold && !scopedAdminHousehold) return householdNotFoundResponse({ env, requestedId: requestedAdminHousehold, listHref: "/households" });
    householdId = scopedAdminHousehold?.id || "";
  }
  const canManage = adminOk || ["owner", "admin"].includes(String((households.find((h) => String(h.id) === String(householdId)) || {}).role || "").toLowerCase());
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const customCategoryRows = await fetchCustomCategories(env, householdId);
  const members = householdId ? await fetchHouseholdMembers(env, householdId) : [];
  const rows = attachSpenderNames(await fetchAdminRows(env, { month, householdId, type: "all" }), members);
  const budgets = await fetchBudgets(env, householdId, month);
  const center = budgetCenterSummary(rows, budgets);
  const totalBudgetRow = budgets.find((b) => String(b.category || "") === "__total") || {};
  const incomeBudgetRow = budgets.find((b) => String(b.category || "") === "__income") || {};
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const categoryOptions = mergedOptions(DEFAULT_CATEGORIES, customCategoryRows.map((c) => c.name)).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const incomeOptions = CATEGORY_KEYWORD_GUIDE.filter((g) => g.type === "income").map((g) => `<option value="__income:${escapeHtml(g.category)}">${escapeHtml(g.category)} 수입 기준</option>`).join("");
  const budgetBasisList = renderBudgetBasisRows(budgets);
  const budgetConsistency = renderBudgetConsistencyAlert(budgets, center);
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>예산 관리</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff;border-radius:28px;padding:22px;margin:12px 0;box-shadow:0 18px 42px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:29px}.hero p{line-height:1.55;opacity:.92}.filters,.formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin-top:12px}.filters select,.filters input,.filters button,.formGrid input,.formGrid select,.formGrid button{height:44px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;background:#fff;font:inherit}.filters button,.formGrid button{background:#111827;color:#fff;font-weight:1000}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.metricGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:5px}.modeTag{display:inline-block;font-style:normal;font-size:11px;font-weight:1000;border-radius:999px;padding:2px 7px;margin-left:4px;vertical-align:1px}.modeTag.auto{background:#dcfce7;color:#166534}.modeTag.manual{background:#eff6ff;color:#1e3a8a}.bar{height:14px;background:#e5e7eb;border-radius:999px;overflow:hidden}.bar i{display:block;height:100%;width:var(--w);background:#3182F6;border-radius:999px}.basisGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(320px,1fr));gap:12px;margin-top:12px}.basisGrid>div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:20px;padding:14px;min-width:0}.basisGrid h3{margin:0 0 10px;font-size:17px}.basisGrid ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}.basisGrid li{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:10px;background:#fff;border:1px solid #e5e7eb;border-radius:14px;padding:10px 12px}.basisGrid li b{word-break:keep-all;line-height:1.25}.basisGrid li span{white-space:nowrap;font-weight:1000}.budgetWarn,.budgetOk{border-radius:18px;padding:14px;margin:12px 0;display:grid;gap:5px;line-height:1.45}.budgetWarn{background:#fff7ed;border:1px solid #fdba74;color:#9a3412}.budgetOk{background:#ecfdf5;border:1px solid #86efac;color:#166534}.budgetWarn b,.budgetOk b{font-size:17px}.budgetWarn span,.budgetOk span{font-weight:900}.budgetWarn small{color:#9a3412}.tableWrap{overflow-x:auto}.catUse summary{cursor:pointer;font-weight:1000}.catUse small{display:block;color:#64748b;margin-top:3px}.budgetTree{margin-top:10px;display:grid;gap:7px}.memberUse{background:#f8fafc;border:1px solid #e5e7eb;border-radius:14px;padding:8px}.memberUse summary{cursor:pointer;color:#111827}.memberUse ul{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:5px}.memberUse li{display:grid;grid-template-columns:92px 90px 1fr;gap:8px;font-size:12px;color:#475569}.memberUse li b{color:#111827}.memberUse li em{font-style:normal}.emptyTree{color:#64748b;background:#f8fafc;border:1px dashed #cbd5e1;border-radius:12px;padding:10px}table{width:100%;border-collapse:collapse;min-width:820px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px}.status{display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:1000;font-size:12px}.status.ok{background:#dcfce7;color:#166534}.status.warn{background:#fff7ed;color:#9a3412}.status.bad{background:#fee2e2;color:#991b1b}.mini{height:32px;border:0;border-radius:10px;padding:0 10px;font-weight:900}.danger{background:#fee2e2;color:#991b1b}.okmsg{background:#e8f1e9;color:#365b41;border:1px solid #c9decf;border-radius:12px;padding:10px}.errmsg{background:#f7e8e4;color:#8f463d;border:1px solid #e7c4bd;border-radius:12px;padding:10px}.tip{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}@media(max-width:760px){body{overflow-x:hidden}.wrap{padding:12px 10px 96px}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px;line-height:1.25}.formGrid,.filters{grid-template-columns:1fr}.formGrid input,.formGrid select,.formGrid button,.filters input,.filters select,.filters button{width:100%;font-size:16px;min-height:46px}.card{border-radius:20px;padding:16px}.metricGrid,.basisGrid{grid-template-columns:1fr}.tableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{min-width:760px}.memberUse li{grid-template-columns:1fr;gap:3px}}</style></head><body>${renderUnifiedNav("budgets", { month, householdId, householdName: (households.find((h)=>h.id===householdId)||{}).name })}<main class="wrap"><section class="hero"><h1>예산 관리</h1><p>월 수입 기준으로 전체 예산을 얼마까지 잡았는지 보고, 분류별 예산의 사용금액·잔여금액·사용률을 한눈에 관리합니다.</p><form class="filters" method="get" action="/budgets"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section>${msg ? `<div class="okmsg">${formatMessage(msg)}</div>` : ""}${err ? `<div class="errmsg">${formatMessage(err)}</div>` : ""}<section class="metricGrid"><div class="metric"><span>월 수입 기준</span><b>${numberWithCommas(center.incomeBase)}원</b></div><div class="metric"><span>이번 달 예산 ${center.budget.explicitTotalBudget ? `<i class="modeTag manual">직접 설정</i>` : `<i class="modeTag auto">분류 합계 자동</i>`}</span><b>${numberWithCommas(center.totalBudget)}원</b></div><div class="metric"><span>수입 대비 예산</span><b>${center.budgetIncomeRate}%</b></div><div class="metric"><span>남은 배정 가능 예산</span><b>${numberWithCommas(center.freeAfterBudget)}원</b></div><div class="metric"><span>이번 달 지출</span><b>${numberWithCommas(center.budget.expense)}원</b></div><div class="metric"><span>예산 사용률</span><b>${center.budget.rate || 0}%</b></div></section><section class="card"><h2>수입 대비 예산 비율</h2><div class="bar"><i style="--w:${Math.min(100, Math.max(0, center.budgetIncomeRate))}%"></i></div><p class="tip">월 수입 기준을 입력하면 예산이 수입의 몇 %인지 볼 수 있습니다. 수입 기준을 비워두면 이번 달 기록된 수입을 기준으로 계산합니다.</p></section><section class="card"><h2>월 기준 설정</h2><p class="note">월 예산은 <b>분류별 예산 합계로 자동 산정</b>되므로 따로 설정하지 않아도 됩니다. 수입 기준(이번 달 들어올 돈)만 입력해도 충분하고, 월 전체 예산 직접 설정은 분류 합계와 다르게 잡고 싶을 때만 쓰는 선택 항목입니다. 직접입력을 선택했을 때만 이름 입력칸이 열립니다.</p>${canManage ? `<form class="formGrid smartBudgetForm" method="post" action="/admin/budget/save"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="return_to" value="/budgets?month=${escapeHtml(month)}${escapeHtml(hh)}"/><label>설정 항목<select name="category" class="jsBudgetKind"><option value="__income">월 수입 기준 합계</option>${incomeOptions}<option value="__income_custom">수입 기준 직접입력</option><option value="__total">월 전체 예산 직접 설정 (선택)</option></select></label><label class="jsCustomWrap" hidden>직접입력 이름<input name="category_custom" disabled placeholder="예: 상여, 부수입"/></label><label>금액<input name="amount" inputmode="numeric" placeholder="예: 3500000" value=""/></label><button type="submit">기준 저장</button></form>` : `<p class="note">예산 기준 저장은 가계부 소유자·관리자만 할 수 있습니다.</p>`}<p class="tip">현재 월 수입 기준 합계: ${numberWithCommas(center.incomeBudget || 0)}원 · 분류별 예산 합계(자동): ${numberWithCommas(center.budget.categoryBudgetTotal || 0)}원${Number(totalBudgetRow.amount || 0) ? ` · 직접 설정한 월 전체 예산: ${numberWithCommas(totalBudgetRow.amount)}원` : ""}</p>${Number(totalBudgetRow.amount || 0) && canManage ? `<form method="post" action="/admin/budget/delete" onsubmit="return confirm('직접 설정한 월 전체 예산을 지우고 분류별 합계 자동 산정으로 전환할까요?')"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="category" value="__total"/><input type="hidden" name="return_to" value="/budgets?month=${escapeHtml(month)}${escapeHtml(hh)}"/><button type="submit" class="mini" style="background:#eff6ff;color:#1e3a8a">자동 산정(분류 합계)으로 전환</button></form>` : ""}${budgetConsistency}${budgetBasisList}</section><section class="card"><h2>분류별 예산 추가</h2><p class="note">먼저 기존 분류를 선택하거나, 맨 아래 “분류 직접입력”을 선택하면 이름 입력칸이 열립니다.</p>${canManage ? `<form class="formGrid smartBudgetForm" method="post" action="/admin/budget/save"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="return_to" value="/budgets?month=${escapeHtml(month)}${escapeHtml(hh)}"/><label>분류<select name="category" class="jsBudgetKind">${categoryOptions}<option value="__category_custom">분류 직접입력</option></select></label><label class="jsCustomWrap" hidden>직접입력 분류명<input name="category_custom" disabled placeholder="예: 아이간식, 반려동물, 병원비"/></label><label>예산 금액<input name="amount" inputmode="numeric" placeholder="예: 500000"/></label><button type="submit">분류 예산 저장</button></form>` : `<p class="note">분류별 예산 추가는 가계부 소유자·관리자만 할 수 있습니다.</p>`}<p class="tip">분류별 사용 현황은 아래에서 분류명을 눌러 상세를 확인하세요.</p></section><section class="card"><h2>분류별 사용 현황</h2><p class="note">분류명을 눌러 멤버별 사용 합계를 보고, 멤버명을 한 번 더 누르면 날짜·금액·항목이 표시됩니다.</p><div class="tableWrap"><table><thead><tr><th>분류/상세</th><th>예산</th><th>사용</th><th>남음</th><th>사용률</th><th>상태</th><th>관리</th></tr></thead><tbody>${renderBudgetRows(budgets, center.budget, rows, canManage)}</tbody></table></div></section><script>const BUDGET_CTX={catTotal:${Number(center.budget.categoryBudgetTotal || 0)},incomeBase:${Number(center.incomeBase || 0)},explicitTotal:${Number(center.budget.explicitTotalBudget || 0)}};document.querySelectorAll(".smartBudgetForm").forEach((form)=>{const sel=form.querySelector(".jsBudgetKind");const wrap=form.querySelector(".jsCustomWrap");const input=wrap&&wrap.querySelector("input");function sync(){const v=sel?.value||"";const on=v==="__income_custom"||v==="__category_custom";if(wrap){wrap.hidden=!on;}if(input){input.disabled=!on;if(!on)input.value="";}}sel&&sel.addEventListener("change",sync);sync();form.addEventListener("submit",(e)=>{const kind=sel?.value||"";const amtEl=form.querySelector("input[name=amount]");const amt=Number(String(amtEl?.value||"").replace(/[^0-9]/g,""))||0;if(!amt)return;const won=(n)=>n.toLocaleString("ko-KR")+"원";if(kind&&!kind.startsWith("__")||kind==="__category_custom"){const nextTotal=BUDGET_CTX.catTotal+amt;const limit=BUDGET_CTX.explicitTotal||BUDGET_CTX.incomeBase;if(limit&&nextTotal>limit){const over=nextTotal-limit;const base=BUDGET_CTX.explicitTotal?"직접 설정한 월 전체 예산":"월 수입 기준";if(!confirm("⚠️ 예산 초과 경고\\n\\n이 예산을 저장하면 분류별 예산 합계("+won(nextTotal)+")가 "+base+"("+won(limit)+")를 "+won(over)+" 초과합니다.\\n\\n그래도 저장할까요?")){e.preventDefault();}}}else if(kind==="__total"&&BUDGET_CTX.incomeBase&&amt>BUDGET_CTX.incomeBase){if(!confirm("⚠️ 월 전체 예산("+won(amt)+")이 월 수입 기준("+won(BUDGET_CTX.incomeBase)+")보다 큽니다.\\n\\n그래도 저장할까요?")){e.preventDefault();}}});});</script></main></body></html>`);
}

function normalizeRecurringDay(value) {
  const day = Number(value);
  return Number.isFinite(day) ? Math.min(31, Math.max(1, Math.round(day))) : 1;
}

function renderRecurringEditForm(row, householdId, month, members, action) {
  // V22.9.37 감사 SIM-5: 지출자 선택지는 자동 반영이 실제로 반영하는 참여자(소유자·관리자·구성원)만 보인다.
  const spenders = eligibleRecurringSpenders(members);
  return `<details class="reserveEdit"><summary>수정</summary><form class="formGrid" method="post" action="${escapeHtml(action)}"><input type="hidden" name="id" value="${escapeHtml(row.id)}"/><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="return_to" value="/reserve-plans?month=${escapeHtml(month)}&amp;household_id=${escapeHtml(householdId)}"/><label>내용<input name="memo" value="${escapeHtml(row.memo)}" required/></label><label>금액<input name="amount" inputmode="numeric" value="${Number(row.amount)}" required/></label><label>구분<select name="type"><option value="expense"${row.type !== "income" ? " selected" : ""}>지출</option><option value="income"${row.type === "income" ? " selected" : ""}>수입</option></select></label><label>분류<input name="category" value="${escapeHtml(row.category)}"/></label><label>결제수단<input name="payment_method" value="${escapeHtml(row.payment_method)}"/></label><label>매월 지정일<input name="day_of_month" type="number" min="1" max="31" value="${normalizeRecurringDay(row.day_of_month)}" required/></label>${spenders.length ? `<label>지출자<select name="user_id">${renderSpenderOptions(spenders,row.user_id,"지출자 선택")}</select></label>` : ""}<button type="submit">수정 저장</button><p>같은 항목의 ID와 이미 반영한 월을 유지합니다. 직접 입력한 거래와 정기 항목은 별도 기록입니다.</p></form></details>`;
}

async function handleRecurringSave(request, env) {
  const form = await request.formData();
  const _hh = String(form.get("household_id") || "").trim();
  const _month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const _access = await resolveTransactionAccess(request, env, _hh, { manageOnly: true });
  if (!_access.ok) {
    if (!_access.admin && _access.userId) return redirectResponse(`/reserve-plans?month=${encodeURIComponent(_month)}&household_id=${encodeURIComponent(_hh)}&err=${encodeURIComponent("고정지출 저장 권한이 없습니다.")}#fixed`);
    return redirectResponse("/?legacy=1");
  }
  const householdId = String(form.get("household_id") || "").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", `/reserve-plans?household_id=${encodeURIComponent(String(form.get("household_id") || "").trim())}#fixed`);
  const members = await fetchHouseholdMembers(env, householdId);
  const spenderId = String(form.get("user_id") || "").trim();
  const ruleId = String(form.get("id") || "").trim();
  const row = {
    household_id: householdId,
    type: String(form.get("type") || "expense") === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(parseBudgetFormAmount(form.get("amount") || 0))),
    category: String(form.get("category") || "기타").slice(0, 80),
    memo: String(form.get("memo") || "").slice(0, 160),
    payment_method: String(form.get("payment_method") || "").slice(0, 40),
    day_of_month: normalizeRecurringDay(form.get("day_of_month")),
    user_id: spenderId,
    is_active: true,
  };
  if (!row.amount || !Number.isFinite(row.amount) || row.amount > MAX_TRANSACTION_AMOUNT) return redirectResponse(addQueryToUrl(returnTo, { err: "고정항목 금액을 입력하세요." }));
  // V22.9.37 감사 SIM-5·T7: 자동 반영과 같은 자격(소유자·관리자·구성원)만 받는다. 조회 전용·대기·차단·나간 지출자의 규칙은
  // 어디서도 반영되지 않으므로 저장 단계에서 막는다.
  if (!spenderId || !recurringSpenderEligible(members, spenderId)) return redirectResponse(addQueryToUrl(returnTo, { err: "recurring_spender_ineligible" }));
  try {
    await withHouseholdDatabaseLease(env, householdId, async ({ assertFresh }) => {
      const existing = ruleId ? await fetchRecurringRuleByIdStrict(env, ruleId) : null;
      if (ruleId && (!existing || String(existing.household_id) !== String(householdId))) throw new Error("recurring_scope_invalid");
      assertFresh();
      await supabase(env, ruleId ? `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(ruleId)}&household_id=eq.${encodeURIComponent(householdId)}` : "/rest/v1/accountbook_recurring", { method: ruleId ? "PATCH" : "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(row) });
    });
    return redirectResponse(addQueryToUrl(returnTo, { msg: "recurring_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "recurring_save_failed", severity: "warn", path: "/admin/recurring/save", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(returnTo, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "고정항목을 저장하지 못했습니다. 기존 항목은 유지되므로 잠시 후 다시 시도해 주세요." }));
  }
}

async function handleRecurringDelete(request, env) {
  const form = await request.formData();
  const requestedHouseholdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const id = String(form.get("id") || "").trim();
  const existingRule = id ? await fetchRecurringRuleByIdStrict(env, id) : null;
  const householdId = String(existingRule?.household_id || "").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", `/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId || requestedHouseholdId)}#fixed`);
  if (!id || !existingRule || !householdId) return redirectResponse(addQueryToUrl(returnTo, { err: "삭제할 고정항목이 없습니다." }));
  const access = await resolveTransactionAccess(request, env, householdId, { manageOnly: true });
  if (!access.ok) {
    if (!access.admin && access.userId) return redirectResponse(addQueryToUrl(returnTo, { err: "고정지출 삭제 권한이 없습니다." }));
    return redirectResponse("/?legacy=1");
  }
  try {
    const deleted = await withHouseholdDatabaseLease(env, householdId, async ({ assertFresh }) => {
      assertFresh();
      return supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(id)}&household_id=eq.${encodeURIComponent(householdId)}`, { method: "DELETE", headers: { Prefer: "return=representation" } });
    });
    if (!Array.isArray(deleted) || !deleted.length) throw new Error("recurring_not_found");
    return redirectResponse(addQueryToUrl(returnTo, { msg: "recurring_deleted" }));
  } catch (err) {
    rememberOpsEvent({ kind: "recurring_delete_failed", severity: "warn", path: "/recurring/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(returnTo, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "고정항목을 삭제하지 못했습니다. 기존 항목은 유지됩니다." }));
  }
}

async function handleRecurringApply(request, env) {
  const form = await request.formData();
  const _hh = String(form.get("household_id") || "").trim();
  const _month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const _access = await resolveTransactionAccess(request, env, _hh, { manageOnly: true });
  if (!_access.ok) {
    if (!_access.admin && _access.userId) return redirectResponse(`/reserve-plans?month=${encodeURIComponent(_month)}&household_id=${encodeURIComponent(_hh)}&err=${encodeURIComponent("고정지출 반영 권한이 없습니다.")}#fixed`);
    return redirectResponse("/?legacy=1");
  }
  const householdId = String(form.get("household_id") || "");
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", `/reserve-plans?month=${month}&household_id=${encodeURIComponent(householdId)}#fixed`);
  let mutationConfirmed = false;
  try {
    return await withHouseholdDatabaseLease(env, householdId, async ({ assertFresh }) => {
      // V22.9.29 requires the month-end RPC patch before this Worker is deployed.
      // The RPC preserves the requested day and clamps only to this target month's last day.
      assertFresh();
      // V22.9.37 감사 T7·SIM-8: 반영 전에 규칙과 참여자를 읽어 둔다. 지출자 자격은 자동 반영과 같은 함수로 판정한다.
      // 자격이 없는 규칙(나간·조회 전용·대기·차단 지출자)이 하나라도 있으면 RPC 가 전체를 거절하거나(나간 지출자)
      // 자동 반영과 다르게 넣으므로(조회 전용), 그때만 가능한 규칙을 자동 반영과 같은 길로 한 건씩 넣고 문제 규칙은 건너뛰어 알린다.
      const [rules, rawMembers] = await Promise.all([fetchRecurringStrict(env, householdId), fetchRawHouseholdMembers(env, householdId)]);
      const pending = safeArray(rules).filter((r) => !(r.is_active === false || String(r.is_active) === "false") && String(r.last_applied_month || "") !== month);
      const blocked = pending.filter((r) => !recurringSpenderEligible(rawMembers, r.user_id));
      let count = 0;
      if (!blocked.length) {
        const result = await supabase(env, "/rest/v1/rpc/accountbook_apply_recurring_v227", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ p_household_id: householdId, p_month: month }),
        });
        const summary = Array.isArray(result) ? result[0] : result;
        count = Math.max(0, Number(summary?.inserted || 0));
        mutationConfirmed = true;
        // SIM-8: 지난 달을 반영해도 더 나중 달의 반영 표식은 되돌리지 않는다. RPC 는 요청한 달로 표식을 덮어쓰므로 되살린다.
        for (const r of pending) {
          const previous = String(r.last_applied_month || "");
          if (previous > month) await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(r.id)}&household_id=eq.${encodeURIComponent(householdId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_applied_month: previous }) });
        }
      } else {
        for (const r of pending) {
          if (blocked.includes(r)) continue;
          const outcome = await applyRecurringRuleForMonth(env, householdId, r, month);
          if (outcome !== "skipped") mutationConfirmed = true;
          if (outcome === "applied") count += 1;
        }
      }
      const skippedNote = blocked.length ? ` · ${blocked.length}건은 지출자가 활성 참여자가 아니어서 건너뜀` : "";
      return redirectResponse(addQueryToUrl(returnTo, { msg: `고정항목 ${count}건 기록${skippedNote}` }));
    });
  } catch (err) {
    rememberOpsEvent({ kind: "recurring_atomic_apply_failed", severity: "warn", path: "/recurring/apply", method: "POST", detail: safeError(err) });
    const message = isUncertainStorageWrite(err) ? "db_write_unknown" : mutationConfirmed || err?.recurringTransactionOutcome ? "recurring_apply_incomplete" : /recurring_spender_required/.test(safeError(err)) ? "고정항목의 지출자를 먼저 지정하세요." : "고정항목 반영을 완료하지 못했습니다. 기존 기록은 변경하지 않았습니다.";
    return redirectResponse(addQueryToUrl(returnTo, { err: message }));
  }
}
// @build:exports-start
export {
  handleBudgetCenterPage, handleRecurringApply, handleRecurringDelete, handleRecurringSave,
  normalizeRecurringDay, renderRecurringEditForm,
};
// @build:exports-end
