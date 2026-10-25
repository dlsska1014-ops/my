// @build:imports-start
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import { isIncomeReservePlan, reserveDueDateInMonth } from "../settings/reserve-plans.js";
import { safeArray } from "../admin/backup-compare.js";
import { budgetCategoryScope } from "./budgets.js";
import { formatDate, nowKstDate } from "../nlu/date-payment.js";
import { numberWithCommas } from "./transactions-core.js";
// @build:imports-end
// V22.9.79 V76 W-7: 화면마다 따로 계산하던 ‘월말 예상’을 이 함수 하나로 맞춘다
// (docs/codex/PROPOSAL_W7_SPENDING_OUTLOOK_V22_9_78.md, 2026-10-25 운영자가 권장안 채택).
// 예전에는 분석·리포트·스마트 도구·밈·위험 점수(전체 분류, 하루 평균 × 그 달 일수), 예산 알림·알림센터(예산 분류,
// 반영 대기 고정지출은 ‘가정값’ 줄에만), 홈(예산 분류, 오늘까지 속도)이 따로 셌다. 이번 달 식:
//   월말 예상 = 오늘까지 기록 + 오늘 뒤 날짜의 정기 기록 + 반영 대기 고정지출 + 남은 정기지출(준비금) 납부
//             + round(오늘까지 변동 지출 ÷ 지난 날 수 × 남은 날 수)
// - 정기 출처 기록(자동·수동 반영이 만든 기록)은 속도에서 뺀다. 1일에 적힌 월세가 하루 평균으로 부풀지 않는다.
// - 앞 날짜로 미리 적은 일반 지출은 더하지 않고 따로 돌려준다(D3 계약: 미래 거래는 예상에 더하지 않음).
// - 지난달은 예상 = 실적, 미래 달은 관측 전(before), 영수증 불완전·날짜·금액 오류는 확인 불가(unavailable).
// - 고정지출 규칙·정기지출 항목을 못 읽으면(null) 그 몫을 빼고 계산하고 partial 로 알린다.
// - scope "all" 은 전체 지출, "budgeted" 는 예산 화면과 같은 분류 판정(budgetCategoryScope)으로 거른다.
// - 정기 행·대기·준비금이 없으면 예전 burnForecast(round(관측 ÷ 지난 날 × 그 달 일수))와 같은 값이다.
// - refundDeductions: 환불 연결(V44 D-5·V76 M-7)을 통합할 때 넘길 차감 목록 [{ transaction_date, amount(양수), category }].
//   기본은 빈 목록이라 아무것도 바꾸지 않는다. 넘기면 기록(오늘까지·등록액)에서 빼고 속도 계산에는 넣지 않는다.

// 정기 출처 기록: 고정지출 반영(자동·수동)이 만든 기록이거나 그 표식(raw_text recurring:<규칙 id>:<달>)을 단 기록.
function isRecurringSourceRow(row) {
  return !!row && (["recurring", "recurring_auto"].includes(String(row.source || "")) || String(row.raw_text || "").startsWith("recurring:"));
}

// 기록을 만들 수 있는 지출 규칙: 수입이 아니고, 켜져 있고, 금액이 있다(자동 반영이 건너뛰는 규칙은 세지 않는다).
function isOutgoingRecurringRule(rule) {
  return !!rule && String(rule.type || "expense") !== "income" && !(rule.is_active === false || String(rule.is_active) === "false") && Number(rule.amount || 0) > 0;
}

function recurringMarkerSet(rows = []) {
  return new Set(safeArray(rows).map((row) => String(row?.raw_text || "")).filter((text) => text.startsWith("recurring:")));
}

// V22.9.79 V78 S-2: 규칙이 그 달에 이미 기록됐는가 — 홈 ‘앞으로 나갈 돈’(W-5)·예산 알림·알림센터·생활비 리포트가 같이 쓴다.
// 그 달 표식(last_applied_month)이 있거나, 그 규칙이 만든 그 달 기록(raw_text recurring:<규칙 id>:<달>)이 있으면 반영됐다.
// 예전 알림은 표식만 봐서, 표식 저장이 늦은 달에는 이미 기록된 고정지출을 ‘반영 대기’로 한 건 더 셌다.
function recurringRuleAppliedInMonth(rule, month = "", markers = new Set()) {
  if (String(rule?.last_applied_month || "") === month) return true;
  return markers.has(`recurring:${rule?.id}:${month}`);
}

// 그 달의 반영 대기 고정지출. 규칙을 못 읽었으면(배열이 아니면) null 이다 — 0건으로 단정하지 않는다.
function pendingRecurringRules(recurring, month = "", rows = []) {
  if (!Array.isArray(recurring)) return null;
  const markers = recurringMarkerSet(rows);
  return recurring.filter((rule) => isOutgoingRecurringRule(rule) && !recurringRuleAppliedInMonth(rule, month, markers));
}

// 그 달에 아직 내지 않은 정기지출(준비금) 항목: 지출 항목이고 금액이 있으며 납부일이 오늘~말일. 지난 납부일·다른 달은 뺀다.
function dueReservePlansInMonth(plans = [], month = "", today = "") {
  return safeArray(plans)
    .filter((plan) => plan && !isIncomeReservePlan(plan) && Number(plan.amount || 0) > 0)
    .map((plan) => ({ plan, date: reserveDueDateInMonth(plan, month) }))
    .filter((entry) => !!entry.date && entry.date >= today);
}

// V22.9.79 V78 S-1: 정기지출 항목과 고정지출 규칙이 같은 지출인지 고르는 기준. 정기지출 항목에는 규칙 id 같은 연결 값이
// 저장돼 있지 않아(settings reserve_plans 의 항목은 이름·금액·납부일·분류뿐), 둘 다 가진 가장 강한 열쇠를 쓴다:
// 금액이 같고, 납부일(1~28일로 맞춤)이나 이름(공백·대소문자 무시)이 같으면 같은 지출이다.
// 예전 W-5 는 이름만 봐서 ‘집세’·‘월세’처럼 이름만 다른 같은 지출은 두 번 세고, 이름만 같은 다른 지출(금액이 다름)은 하나를 뺐다.
// 금액이 다르면 다른 지출로 본다: 빠뜨린 지출은 화면 어디에도 드러나지 않지만, 두 번 센 지출은 카드의 출처별 건수로 보인다.
// 규칙 하나는 항목 하나와만 짝짓는다(이름·날짜가 다 같은 짝 → 이름이 같은 짝 → 날짜가 같은 짝 순서). 꺼 둔 규칙은 짝이 없다.
function matchReservePlansToRules(entries = [], rules = []) {
  const nameKey = (text) => String(text || "").normalize("NFKC").replace(/\s+/g, "").toLowerCase();
  const dayKey = (value) => Math.max(1, Math.min(28, Number(value || 1)));
  const sameName = (entry, rule) => !!nameKey(entry.plan.name) && nameKey(entry.plan.name) === nameKey(rule.memo || rule.category);
  const sameDay = (entry, rule) => dayKey(entry.plan.due_day) === dayKey(rule.day_of_month);
  const passes = [
    (entry, rule) => sameName(entry, rule) && sameDay(entry, rule),
    (entry, rule) => sameName(entry, rule),
    (entry, rule) => sameDay(entry, rule),
  ];
  const matched = new Map();
  const used = new Set();
  for (const test of passes) {
    entries.forEach((entry, index) => {
      if (matched.has(index)) return;
      const rule = rules.find((candidate) => !used.has(candidate) && Number(candidate.amount || 0) === Number(entry.plan.amount || 0) && test(entry, candidate));
      if (!rule) return;
      matched.set(index, rule);
      used.add(rule);
    });
  }
  return matched;
}

// 그 달에 아직 기록되지 않은 지출(반영 대기 고정지출 + 남은 정기지출 납부). 규칙과 짝지은 정기지출은 규칙 쪽으로만 센다 —
// 기록을 만드는 쪽이 규칙이라 규칙이 대기면 규칙 금액으로 한 번, 이미 기록됐으면 둘 다 세지 않는다.
function unrecordedOutgoingInMonth({ month = "", today = "", rows = [], recurring = [], plans = [] } = {}) {
  const rulesKnown = Array.isArray(recurring);
  const outRules = rulesKnown ? recurring.filter(isOutgoingRecurringRule) : [];
  const pending = pendingRecurringRules(recurring, month, rows);
  const due = dueReservePlansInMonth(plans, month, today);
  const matched = matchReservePlansToRules(due, outRules);
  return { rulesKnown, plansKnown: Array.isArray(plans), pending, planEntries: due.filter((_, index) => !matched.has(index)), matchedCount: matched.size };
}

// V22.9.78 감사 V76 W-5 → V22.9.79 W-7: 홈 ‘앞으로 나갈 돈’ 카드의 기준(my/home-sections.js 에서 옮겼다). 월말 예상의
// ‘아직 기록되지 않은 것’과 같은 계산이라 카드 합계 = 월말 예상의 반영 대기 고정지출 + 남은 정기지출 납부(전체 분류)다.
//   - 고정지출(매월 자동 기록 규칙): 켜져 있고 금액이 있는 지출 규칙 중 이번 달 몫이 아직 없는 것(recurringRuleAppliedInMonth).
//   - 정기지출(준비 항목): 납부일이 오늘부터 말일 사이인 지출 항목. 같은 지출로 짝지은 규칙이 있으면 규칙 쪽으로만 센다(S-1).
//   - 수입(규칙·항목)은 더하지 않고 "수입만 등록" 안내에만 센다.
// recurring 이 배열이 아니면(읽기 실패) 합계를 낼 수 없다(available: false).
// V22.9.79 V78 S-2: 정기지출 항목도 같다 — plans 가 null(읽기 실패)이면 ‘항목 없음’으로 세지 않고 available: false 다.
// 어느 쪽을 못 읽었는지 rulesKnown·plansKnown 으로 돌려준다(카드 안내 문구).
function homeUpcomingOut({ month = "", today = formatDate(nowKstDate()), rows = [], plans = [], recurring = [] } = {}) {
  const rulesKnown = Array.isArray(recurring);
  const plansKnown = Array.isArray(plans);
  const available = rulesKnown && plansKnown;
  const rules = rulesKnown ? recurring.filter(Boolean) : [];
  const isIncomeRule = (r) => String(r.type || "expense") === "income";
  const allPlans = safeArray(plans).filter(Boolean);
  const outPlans = allPlans.filter((p) => !isIncomeReservePlan(p));
  const unrecorded = unrecordedOutgoingInMonth({ month, today, rows, recurring: rulesKnown ? rules : null, plans: allPlans });
  const fixed = safeArray(unrecorded.pending);
  const fixedTotal = fixed.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const planTotal = unrecorded.planEntries.reduce((sum, entry) => sum + Number(entry.plan.amount || 0), 0);
  return {
    available, rulesKnown, plansKnown, total: fixedTotal + planTotal,
    fixedCount: fixed.length, fixedTotal, planCount: unrecorded.planEntries.length, planTotal,
    expenseItems: rules.filter((r) => !isIncomeRule(r)).length + outPlans.length,
    incomeItems: rules.filter(isIncomeRule).length + allPlans.length - outPlans.length,
  };
}

// 월말 예상 하나. 입력은 그 달 전체 행(앞 날짜·수입 포함), 오늘(KST, 요청마다 한 번 정한 값), 고정지출 규칙·정기지출 항목
// (못 읽었으면 null), 예산 행(scope "budgeted" 일 때 범위와 예산 비교), 환불 차감(통합 전에는 비움).
function monthSpendingOutlook({ month = "", rows = [], today = "", receipt = null, recurring = [], plans = [], budgets = [], scope = "all", refundDeductions = [] } = {}) {
  const day = isValidTransactionDateString(String(today || "")) ? String(today) : formatDate(nowKstDate());
  const valid = /^20\d{2}-(?:0[1-9]|1[0-2])$/.test(String(month));
  const daysInMonth = valid ? new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() : 0;
  const monthState = !valid ? "invalid" : month < day.slice(0, 7) ? "past" : month === day.slice(0, 7) ? "current" : "future";
  const rowsReadable = Array.isArray(rows) && rows.every((row) => row && typeof row.transaction_date === "string" && row.transaction_date.length === 10 && isValidTransactionDateString(row.transaction_date) && row.amount != null && String(row.amount).trim() !== "" && Number.isFinite(Number(row.amount)));
  const status = !valid || !rowsReadable || (receipt && receipt.status !== "complete") ? "unavailable" : monthState === "future" ? "before" : "complete";
  const budgeted = scope === "budgeted";
  const range = budgetCategoryScope(budgets);
  const inScope = (category) => !budgeted || range.includes(category);
  const base = { month, today: day, scope: budgeted ? "budgeted" : "all", status, monthState, daysInMonth };
  if (status === "unavailable") return { ...base, elapsedDays: 0, remainingDays: 0, recorded: null, notYetRecorded: null, expected: null, budget: null, partial: false };
  const elapsedDays = monthState === "past" ? daysInMonth : monthState === "current" ? Number(day.slice(8, 10)) : 0;
  const remainingDays = monthState === "current" ? daysInMonth - elapsedDays : 0;
  const first = `${month}-01`;
  const last = `${month}-${String(daysInMonth).padStart(2, "0")}`;
  const end = elapsedDays ? `${month}-${String(elapsedDays).padStart(2, "0")}` : "";
  const sum = (list, pick = (item) => item.amount) => list.reduce((total, item) => total + Number(pick(item) || 0), 0);
  // 지출 판정은 각 범위가 예전에 쓰던 그대로다: 예산 범위는 budgetSummary(수입이 아닌 행), 전체 범위는 예전 burnForecast(지출 행).
  const isExpense = budgeted ? (row) => row.type !== "income" : (row) => row.type === "expense";
  const expenseRows = rows.filter((row) => isExpense(row) && row.transaction_date >= first && row.transaction_date <= last && inScope(row.category));
  const toDateRows = end ? expenseRows.filter((row) => row.transaction_date <= end) : [];
  const laterRows = end ? expenseRows.filter((row) => row.transaction_date > end) : expenseRows;
  const fixedToDate = sum(toDateRows.filter(isRecurringSourceRow));
  const scheduledRows = monthState === "current" ? laterRows.filter(isRecurringSourceRow) : [];
  const futureOrdinaryRows = laterRows.filter((row) => !isRecurringSourceRow(row));
  const deductions = safeArray(refundDeductions).filter((item) => item && isValidTransactionDateString(String(item.transaction_date || "")) && item.transaction_date >= first && item.transaction_date <= last && Number(item.amount) > 0 && inScope(item.category));
  const deductedToDate = end ? sum(deductions.filter((item) => item.transaction_date <= end)) : 0;
  const grossToDate = sum(toDateRows);
  const recorded = {
    toDate: grossToDate - deductedToDate, fixed: fixedToDate, variable: grossToDate - fixedToDate,
    registered: sum(expenseRows) - sum(deductions), refundDeduction: deductedToDate,
    scheduledFixed: sum(scheduledRows), scheduledFixedRows: scheduledRows,
    futureOrdinary: sum(futureOrdinaryRows), futureOrdinaryCount: futureOrdinaryRows.length,
  };
  const current = monthState === "current";
  const unrecorded = current ? unrecordedOutgoingInMonth({ month, today: day, rows, recurring, plans }) : null;
  const pending = safeArray(unrecorded?.pending);
  const pendingIn = pending.filter((rule) => inScope(rule.category));
  const planIn = safeArray(unrecorded?.planEntries).filter((entry) => inScope(entry.plan.category));
  const pendingOut = budgeted ? pending.filter((rule) => !inScope(rule.category)) : [];
  const planOut = budgeted ? safeArray(unrecorded?.planEntries).filter((entry) => !inScope(entry.plan.category)) : [];
  const notYetRecorded = {
    pendingFixed: sum(pendingIn), pendingFixedCount: pendingIn.length, pendingFixedRules: pendingIn,
    reserveRemaining: sum(planIn, (entry) => entry.plan.amount), reserveCount: planIn.length, reservePlans: planIn,
    outsidePendingFixed: sum(pendingOut), outsidePendingRules: pendingOut,
    outsideReserve: sum(planOut, (entry) => entry.plan.amount), outsideReservePlans: planOut,
    rulesKnown: current ? !!unrecorded?.rulesKnown : null, plansKnown: current ? !!unrecorded?.plansKnown : null,
  };
  const partialReasons = current ? [...(Array.isArray(recurring) ? [] : ["recurring"]), ...(Array.isArray(plans) ? [] : ["plans"])] : [];
  const pace = current ? Math.round(recorded.variable / elapsedDays * remainingDays) : 0;
  const fixedRemaining = recorded.scheduledFixed + notYetRecorded.pendingFixed + notYetRecorded.reserveRemaining;
  const expected = status !== "complete" ? null : {
    total: recorded.toDate + fixedRemaining + pace, recorded: recorded.toDate, fixedRemaining, pace,
    pacePerDay: elapsedDays ? Math.round(recorded.variable / elapsedDays) : null,
    partial: partialReasons.length > 0, partialReasons,
  };
  return {
    ...base, elapsedDays, remainingDays, recorded, notYetRecorded, expected,
    budget: budgeted ? outlookBudget({ range, recorded, expected, current, elapsedDays, daysInMonth, scheduledRows, pendingIn, planIn }) : null,
    partial: !!expected?.partial,
  };
}

// 예산과 견준 값. 하루 사용 가능 = floor(남은 예산 ÷ 오늘 포함 남은 날)(V44 D-18: 홈·예산 알림 모두 내림).
// 바닥나는 날도 같은 근거다: 오늘까지 기록 + 날짜가 정해진 남은 고정·정기(지정일이 지난 대기 규칙은 오늘)
// + 하루 변동 속도 × 지난 날을 더한 누계가 예산을 처음 넘는 날. 넘지 않으면 null.
function outlookBudget({ range, recorded, expected, current, elapsedDays, daysInMonth, scheduledRows = [], pendingIn = [], planIn = [] }) {
  const total = Number(range.totalBudget || 0);
  const remaining = total ? Math.max(0, total - recorded.registered) : 0;
  const daysLeft = current ? daysInMonth - elapsedDays + 1 : 0;
  const dailyAllowance = current && total && expected ? Math.floor(remaining / daysLeft) : null;
  const diff = total && expected ? expected.total - total : null;
  let runOutDay = null;
  if (current && total && expected) {
    const dated = [
      ...scheduledRows.map((row) => [Number(row.transaction_date.slice(8, 10)), Number(row.amount || 0)]),
      ...pendingIn.map((rule) => [Math.max(elapsedDays, Math.min(daysInMonth, Number(rule.day_of_month || 1))), Number(rule.amount || 0)]),
      ...planIn.map((entry) => [Number(entry.date.slice(8, 10)), Number(entry.plan.amount || 0)]),
    ];
    const perDay = recorded.variable / elapsedDays;
    for (let d = elapsedDays; d <= daysInMonth; d += 1) {
      const known = dated.filter(([when]) => when <= d).reduce((sum, [, amount]) => sum + amount, 0);
      if (recorded.toDate + known + perDay * (d - elapsedDays) > total) { runOutDay = d; break; }
    }
  }
  return { total, basis: range.basis, spent: recorded.registered, remaining, dailyAllowance, diff, runOutDay, daysEarly: runOutDay ? daysInMonth - runOutDay + 1 : 0 };
}

// 예산 알림·알림센터에 보이는 내역 한 줄: “기록 A + 남은 고정·정기 B + 남은 n일 예상 C”. 이번 달이 아니면 빈 문자열.
function spendingOutlookBreakdown(outlook) {
  if (!outlook || outlook.monthState !== "current" || !outlook.expected) return "";
  const e = outlook.expected;
  const notes = [
    ...(e.partialReasons.includes("recurring") ? ["고정지출을 읽지 못해 빼고 계산"] : []),
    ...(e.partialReasons.includes("plans") ? ["정기지출 항목을 읽지 못해 빼고 계산"] : []),
  ];
  return `기록 ${numberWithCommas(e.recorded)}원 + 남은 고정·정기 ${numberWithCommas(e.fixedRemaining)}원 + 남은 ${numberWithCommas(outlook.remainingDays)}일 예상 ${numberWithCommas(e.pace)}원${notes.length ? ` (${notes.join(" · ")})` : ""}`;
}

// 분석·리포트 카드의 ‘월말 예상’ 부제. 지난달은 실적, 미래 달은 관측 전, 고정지출 규칙·정기지출 항목을 읽지 않은 화면은 빠진 몫을 적는다.
function spendingOutlookCaption(outlook) {
  if (!outlook || outlook.status === "unavailable") return "확인 불가";
  if (outlook.monthState === "past") return "월 전체 실적";
  if (outlook.monthState !== "current") return "관측 전";
  const reasons = safeArray(outlook.expected?.partialReasons);
  const missing = [...(reasons.includes("recurring") ? ["반영 대기 고정지출"] : []), ...(reasons.includes("plans") ? ["정기지출 항목"] : [])];
  return `기록 + 남은 고정 + 남은 날 예상${missing.length ? ` · ${missing.join("·")} 제외` : ""}`;
}
// @build:exports-start
export {
  homeUpcomingOut, isOutgoingRecurringRule, monthSpendingOutlook, pendingRecurringRules,
  recurringMarkerSet, recurringRuleAppliedInMonth, spendingOutlookBreakdown, spendingOutlookCaption,
};
// @build:exports-end
