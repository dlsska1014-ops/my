// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { safeAdminReturnPath, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT, readOptionalFormAmount } from "./transactions-households.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAnalysisRowsRange, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { safeArray } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  computeFairMoM, renderReadableDailyTrend, renderWeekdayTrend, shiftMonthString, shortWonLabel,
} from "../my/analysis-page.js";
import { getMySelectedHousehold, myAccessStatusResponse } from "../my/access-control.js";
import {
  budgetCenterSummary, budgetSummary, fetchBudgets, fetchRecurring,
} from "../domain/budgets.js";
import { addQueryToUrl } from "../auth/local-login-pages.js";
import {
  addMonthsYm, calculateDashboardAnalysis, calculateExtendedAnalytics, deltaClass,
  formatSignedPercent, percentChange, renderCategoryCompareTable, renderMonthlyTrendTable,
  renderStrategyCards,
} from "../domain/analytics.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import {
  addDays, currentMonthKst, formatDate, nowKstDate, validMonth, weekdayIndexOfYmd,
} from "../nlu/date-payment.js";
import {
  calculateStats, escapeHtml, getCalendar, nextMonthStart, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

async function handleBudgetSave(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const monthInput = String(form.get("month") || "").trim();
  const month = validMonth(monthInput) || currentMonthKst();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", `/budgets?month=${month}&household_id=${encodeURIComponent(householdId)}`);
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(addQueryToUrl(returnTo, { err: "예산 저장 권한이 없습니다." }));
  }
  // V22.9.37 감사 N8: 틀린 월(2026-13, 빈 값)은 이번 달 예산으로 떨어뜨리지 않고 거절한다.
  if (!validMonth(monthInput)) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_month_invalid" }));
  const rawCategory = String(form.get("category") || "__total").trim() || "__total";
  const customCategory = String(form.get("category_custom") || "").trim().slice(0, 80);
  let category = rawCategory;
  if (rawCategory === "__income_custom") category = customCategory ? `__income:${customCategory}` : "__income";
  if (rawCategory === "__category_custom") category = customCategory || "기타";
  const amount = readOptionalFormAmount(form);
  if (amount === null) return redirectResponse(addQueryToUrl(returnTo, { err: "예산 금액을 숫자로 입력하세요. 기존 예산은 유지됩니다." }));
  // V22.9.37 감사 N9: 단건 예산도 거래 금액 상한(20억)을 넘지 않는다.
  if (amount > MAX_TRANSACTION_AMOUNT) return redirectResponse(addQueryToUrl(returnTo, { err: "amount_too_large" }));
  try {
    await supabase(env, "/rest/v1/accountbook_budgets?on_conflict=household_id,month,category", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ household_id: householdId, month, category, amount }),
    });
    return redirectResponse(addQueryToUrl(returnTo, { msg: "budget_saved" }));
  } catch (err) {
    rememberOpsEvent({ kind: "budget_save_failed", severity: "warn", path: "/admin/budget/save", method: "POST", detail: safeError(err) });
    return redirectResponse(addQueryToUrl(returnTo, { err: "예산 저장을 완료하지 못했습니다." }));
  }
}

async function handleBudgetDelete(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const monthInput = String(form.get("month") || "").trim();
  const month = validMonth(monthInput) || currentMonthKst();
  const category = String(form.get("category") || "").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", `/budgets?month=${month}&household_id=${encodeURIComponent(householdId)}`);
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(addQueryToUrl(returnTo, { err: "예산 삭제 권한이 없습니다." }));
  }
  // V22.9.37 감사 N8: 틀린 월은 이번 달 예산을 지우지 않고 거절한다.
  if (!validMonth(monthInput)) return redirectResponse(addQueryToUrl(returnTo, { err: "budget_month_invalid" }));
  if (!category) return redirectResponse(addQueryToUrl(returnTo, { err: "삭제할 예산을 찾지 못했습니다." }));
  try {
    const tablePath = `/rest/v1/accountbook_budgets?household_id=eq.${encodeURIComponent(householdId)}&month=eq.${encodeURIComponent(month)}&category=eq.${encodeURIComponent(category)}`;
    let tableRows = [];
    try {
      tableRows = safeArray(await supabase(env, `${tablePath}&select=id&limit=1`, { method: "GET" }));
    } catch (tableReadError) {
      const detail = safeError(tableReadError);
      const optionalTableMissing = /(?:\bPGRST205\b|\b42P01\b|relation[^\n]*accountbook_budgets[^\n]*does not exist|could not find[^\n]*accountbook_budgets)/i.test(detail);
      if (!optionalTableMissing) throw tableReadError;
    }
    // 예산은 표 한 곳에만 있다. 없으면 지울 것도 없다.
    if (tableRows.length > 0) {
      await supabase(env, tablePath, { method: "DELETE", headers: { Prefer: "return=minimal" } });
    }
    return redirectResponse(addQueryToUrl(returnTo, { msg: "budget_deleted" }));
  } catch (err) {
    return redirectResponse(addQueryToUrl(returnTo, { err: "예산 삭제를 완료하지 못했습니다." }));
  }
}

async function pcScopedContext(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return null;
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const [user, access] = await Promise.all([
    fetchUserById(env, userId),
    getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || ""),
  ]);
  if (access.restricted) return { userId, user, month, households: access.households, selectedHousehold: null, restricted: access.restricted };
  const households = access.households;
  const selectedHousehold = access.selected;
  if (!selectedHousehold) return { userId, month, households, selectedHousehold: null, members: [], rows: [], stats: calculateStats([]), budgets: [], budget: budgetSummary([], []), calendar: [] };
  const [members, rawRows, budgets, calendar] = await Promise.all([
    fetchHouseholdMembers(env, selectedHousehold.id),
    fetchAdminRows(env, { month, householdId: selectedHousehold.id, type: "all" }),
    fetchBudgets(env, selectedHousehold.id, month),
    getCalendar(env, selectedHousehold.id, month),
  ]);
  const rows = attachSpenderNames(rawRows, members);
  const stats = calculateStats(rows);
  const budget = budgetSummary(rows, budgets);
  return { userId, month, households, selectedHousehold, members, rows, stats, budgets, budget, calendar };
}

function pcHouseholdMonthFilters(action, households = [], selected = null, month = currentMonthKst()) {
  const opts = safeArray(households).map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${selected?.id === h.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  return `<form class="filters" method="get" action="${escapeHtml(action)}"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form>`;
}

const ANALYSIS_DONUT_COLORS = ["#3182F6", "#7c3aed", "#f59e0b", "#ef4444", "#10b981", "#ec4899", "#94a3b8"];

function renderDonutChart(categories = [], totalExpense = 0) {
  const top = safeArray(categories).filter((c) => Number(c.expense || 0) > 0).slice(0, 6);
  const total = Number(totalExpense || 0);
  if (!top.length || !total) return `<div class="empty">지출 데이터가 없습니다. 기록을 남기면 분류별 비중이 표시됩니다.</div>`;
  const topSum = top.reduce((s, c) => s + Number(c.expense || 0), 0);
  const etc = Math.max(0, total - topSum);
  const slices = [...top.map((c) => ({ name: c.category || "미분류", amount: Number(c.expense || 0) })), ...(etc > 0 ? [{ name: "기타", amount: etc }] : [])];
  const circumference = 2 * Math.PI * 42;
  let dashOffset = 0;
  const segments = slices.map((s, i) => {
    const len = Math.max(0, s.amount / total) * circumference;
    const seg = `<circle r="42" cx="60" cy="60" fill="none" stroke="${ANALYSIS_DONUT_COLORS[i % ANALYSIS_DONUT_COLORS.length]}" stroke-width="17" stroke-dasharray="${len.toFixed(2)} ${(circumference - len).toFixed(2)}" stroke-dashoffset="${(-dashOffset).toFixed(2)}" transform="rotate(-90 60 60)"/>`;
    dashOffset += len;
    return seg;
  }).join("");
  const legend = slices.map((s, i) => `<li><i style="background:${ANALYSIS_DONUT_COLORS[i % ANALYSIS_DONUT_COLORS.length]}"></i><b>${escapeHtml(s.name)}</b><span>${numberWithCommas(s.amount)}원 · ${Math.round(s.amount / total * 100)}%</span></li>`).join("");
  return `<div class="donutWrap"><svg class="donutSvg" viewBox="0 0 120 120" role="img" aria-label="분류별 지출 비중 도넛 차트">${segments}<text x="60" y="55" text-anchor="middle" class="donutLabel">총 지출</text><text x="60" y="73" text-anchor="middle" class="donutValue">${escapeHtml(shortWonLabel(total))}</text></svg><ul class="donutLegend">${legend}</ul></div>`;
}

function renderMonthlySeriesChart(items = []) {
  const list = safeArray(items).slice(-6);
  // V22.9.37 감사 D14: 조회에 실패한 달(failed)은 0원이 아니라 확인 불가다. 0원 막대는 "안 썼다"는 거짓말이 된다.
  const failedCount = list.filter((x) => x.failed).length;
  if (!list.some((x) => x.failed || Number(x.income || 0) > 0 || Number(x.expense || 0) > 0)) return `<div class="empty">아직 월별 흐름을 그릴 데이터가 없습니다.</div>`;
  const max = Math.max(1, ...list.filter((x) => !x.failed).map((x) => Math.max(Number(x.income || 0), Number(x.expense || 0))));
  const cols = list.map((x) => {
    if (x.failed) return `<div class="seriesCol" title="${escapeHtml(x.month)} · 조회 실패"><div class="seriesBars"><i class="in" style="height:3px"></i><i class="ex" style="height:3px"></i></div><b>확인 불가</b><span>${escapeHtml(String(x.month).slice(5))}월</span></div>`;
    const ih = Math.max(3, Math.round(Number(x.income || 0) / max * 118));
    const eh = Math.max(3, Math.round(Number(x.expense || 0) / max * 118));
    return `<div class="seriesCol" title="${escapeHtml(x.month)} · 수입 ${numberWithCommas(x.income)}원 · 지출 ${numberWithCommas(x.expense)}원"><div class="seriesBars"><i class="in" style="height:${ih}px"></i><i class="ex" style="height:${eh}px"></i></div><b>${escapeHtml(shortWonLabel(x.expense))}</b><span>${escapeHtml(String(x.month).slice(5))}월</span></div>`;
  }).join("");
  const failedNote = failedCount ? `<p class="muted">${failedCount}개 달은 조회에 실패해 확인 불가로 표시했어요. 새로고침하면 다시 읽어요.</p>` : "";
  return `<div class="seriesLegend"><span><i class="in"></i>수입</span><span><i class="ex"></i>지출</span></div><div class="seriesChart">${cols}</div>${failedNote}`;
}

function normalizeRecurringKey(row = {}) {
  const memo = String(row.memo || row.raw_text || "").trim().toLowerCase().replace(/\s+/g, "").slice(0, 30);
  const amount = Math.round(Number(row.amount || 0));
  if (!memo || !amount) return "";
  return `${memo}|${amount}`;
}

function detectRecurringCandidates(historyRows = [], month = currentMonthKst(), registered = []) {
  const windowMonths = [addMonthsYm(month, -2), addMonthsYm(month, -1), month];
  const registeredKeys = new Set(safeArray(registered).map((x) => normalizeRecurringKey(x)).filter(Boolean));
  const byKey = Object.create(null);
  for (const r of safeArray(historyRows)) {
    if (r.type === "income" || ["recurring", "recurring_auto"].includes(String(r.source || ""))) continue;
    const ym = String(r.transaction_date || "").slice(0, 7);
    if (!windowMonths.includes(ym)) continue;
    const key = normalizeRecurringKey(r);
    if (!key || registeredKeys.has(key)) continue;
    if (!byKey[key]) byKey[key] = { memo: String(r.memo || r.raw_text || "").trim(), amount: Math.round(Number(r.amount || 0)), categories: Object.create(null), payments: Object.create(null), days: [], months: new Set() };
    // V22.9.37 감사 SIM-4: 분류·결제수단은 처음 만난 기록이 아니라 가장 많이 쓴 값이다. 첫 기록만 비어 있어도 분류를 잃었다.
    const category = String(r.category || "").trim();
    if (category) byKey[key].categories[category] = (byKey[key].categories[category] || 0) + 1;
    const payment = String(r.payment_method || "").trim();
    if (payment) byKey[key].payments[payment] = (byKey[key].payments[payment] || 0) + 1;
    const day = Number(String(r.transaction_date || "").slice(8, 10));
    if (Number.isFinite(day) && day >= 1 && day <= 31) byKey[key].days.push(day);
    byKey[key].months.add(ym);
  }
  const mostCounted = (counts) => Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] || "";
  return Object.values(byKey)
    .filter((v) => v.months.size >= 2 && v.amount >= 1000)
    .map((v) => ({ memo: v.memo, amount: v.amount, category: mostCounted(v.categories), paymentMethod: mostCounted(v.payments), dayOfMonth: v.days.length ? Math.round(v.days.reduce((s, x) => s + x, 0) / v.days.length) : 1, hitMonths: v.months.size }))
    .sort((a, b) => b.hitMonths - a.hitMonths || b.amount - a.amount)
    .slice(0, 8);
}

function renderRecurringInsightList(candidates = []) {
  if (!candidates.length) return `<p class="muted">최근 3개월에서 같은 이름·같은 금액으로 반복된 지출을 찾지 못했습니다. 구독료나 회비는 메모를 같은 이름으로 적으면 자동으로 잡아드립니다.</p>`;
  return `<ul class="insightList">${candidates.map((c) => `<li><b>${escapeHtml(c.memo || "이름 없음")}</b><span>${escapeHtml(c.category || "미분류")} · 최근 3개월 중 ${c.hitMonths}개월 반복</span><strong>${numberWithCommas(c.amount)}원</strong></li>`).join("")}</ul>`;
}

function findAnomalousExpenses(rows = [], historyRows = [], month = currentMonthKst()) {
  const expenses = safeArray(rows).filter((r) => r.type !== "income" && Number(r.amount || 0) > 0);
  if (!expenses.length) return [];
  const past = safeArray(historyRows).filter((r) => r.type !== "income" && Number(r.amount || 0) > 0 && String(r.transaction_date || "").slice(0, 7) !== month);
  const catSum = Object.create(null);
  const catCount = Object.create(null);
  for (const r of past) {
    const k = r.category || "미분류";
    catSum[k] = (catSum[k] || 0) + Number(r.amount || 0);
    catCount[k] = (catCount[k] || 0) + 1;
  }
  const totalExpense = expenses.reduce((s, r) => s + Number(r.amount || 0), 0);
  return expenses.map((r) => {
    const k = r.category || "미분류";
    const avg = catCount[k] ? Math.round(catSum[k] / catCount[k]) : 0;
    const amount = Number(r.amount || 0);
    const vsAvg = avg > 0 ? Math.round(amount / avg * 10) / 10 : 0;
    const share = totalExpense ? Math.round(amount / totalExpense * 100) : 0;
    if ((avg > 0 && vsAvg >= 3 && amount >= 30000) || share >= 15) return { ...r, avg, vsAvg, share };
    return null;
  }).filter(Boolean).sort((a, b) => Number(b.amount) - Number(a.amount)).slice(0, 3);
}

function renderAnomalyList(items = []) {
  if (!items.length) return `<p class="muted">평소 흐름에서 크게 벗어난 지출이 없습니다. 안정적인 소비 흐름이에요.</p>`;
  return `<ul class="insightList">${items.map((r) => `<li><b>${escapeHtml(r.memo || r.raw_text || r.category || "지출")}</b><span>${escapeHtml(String(r.transaction_date || ""))} · ${escapeHtml(r.category || "미분류")}${r.avg && r.vsAvg >= 3 ? ` · 평소 ${numberWithCommas(r.avg)}원의 ${r.vsAvg}배` : ` · 이번 달 지출의 ${r.share}%`}</span><strong>${numberWithCommas(r.amount)}원</strong></li>`).join("")}</ul>`;
}

function buildWeeklyReport(historyRows = [], month = currentMonthKst()) {
  const todayStr = formatDate(nowKstDate());
  if (todayStr.slice(0, 7) !== month) return null;
  const today = nowKstDate();
  const mondayOffset = (today.getDay() + 6) % 7;
  const thisWeekStart = formatDate(addDays(today, -mondayOffset));
  const lastWeekStart = formatDate(addDays(today, -mondayOffset - 7));
  const lastWeekSamePoint = formatDate(addDays(today, -7));
  const lastWeekEnd = formatDate(addDays(today, -mondayOffset - 1));
  const inRange = (d, a, b) => d >= a && d <= b;
  let thisWeek = 0;
  let lastWeekToPoint = 0;
  let lastWeekTotal = 0;
  const catMap = Object.create(null);
  for (const r of safeArray(historyRows)) {
    if (r.type === "income") continue;
    const d = String(r.transaction_date || "");
    if (!d) continue;
    const amount = Number(r.amount || 0);
    if (inRange(d, thisWeekStart, todayStr)) {
      thisWeek += amount;
      const k = r.category || "미분류";
      catMap[k] = (catMap[k] || 0) + amount;
    }
    if (inRange(d, lastWeekStart, lastWeekSamePoint)) lastWeekToPoint += amount;
    if (inRange(d, lastWeekStart, lastWeekEnd)) lastWeekTotal += amount;
  }
  const topEntry = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0] || null;
  return {
    thisWeekStart,
    todayStr,
    thisWeek,
    lastWeekToPoint,
    lastWeekTotal,
    rate: percentChange(thisWeek, lastWeekToPoint),
    topCategory: topEntry ? { name: topEntry[0], amount: topEntry[1] } : null,
  };
}

function renderWeeklyReportCard(weekly) {
  if (!weekly) return "";
  const cls = weekly.rate > 10 ? "deltaUp" : weekly.rate < -10 ? "deltaDown" : "deltaFlat";
  const message = weekly.rate > 10 ? "지난주보다 소비 속도가 빨라요. 남은 요일을 조금 아껴보세요." : weekly.rate < -10 ? "지난주보다 잘 아끼고 있어요. 이 흐름을 유지해보세요." : "지난주와 비슷한 속도로 쓰고 있어요.";
  const max = Math.max(1, weekly.thisWeek, weekly.lastWeekTotal);
  return `<section class="card"><h2>주간 리포트</h2><p class="muted">이번 주(월요일~오늘) 지출을 지난주 같은 시점까지의 지출과 비교합니다.</p><div class="weeklyHead"><b>${numberWithCommas(weekly.thisWeek)}원</b><span class="${cls}">지난주 같은 시점 대비 ${formatSignedPercent(weekly.rate)}</span></div><div class="trendBars"><div class="trendLine"><div class="trendLabel">이번 주</div><div class="bar"><span style="width:${Math.round(weekly.thisWeek / max * 100)}%"></span></div><div class="trendValue">${numberWithCommas(weekly.thisWeek)}원</div></div><div class="trendLine"><div class="trendLabel">지난주 전체</div><div class="bar"><span style="width:${Math.round(weekly.lastWeekTotal / max * 100)}%"></span></div><div class="trendValue">${numberWithCommas(weekly.lastWeekTotal)}원</div></div></div><p class="muted">${escapeHtml(message)}${weekly.topCategory ? ` 이번 주는 <b>${escapeHtml(weekly.topCategory.name)}</b>에 ${numberWithCommas(weekly.topCategory.amount)}원을 가장 많이 썼어요.` : ""}</p></section>`;
}

function renderPcAnalysisHtml({ month, households, selectedHousehold, rows, stats, budgets, budget, calendar, extended = null, recurringCandidates = [], anomalies = [], weeklyReport = null }) {
  const selected = selectedHousehold || {};
  const analysis = calculateDashboardAnalysis(rows, rows, calendar, month);
  const center = budgetCenterSummary(rows, budgets);
  const ext = extended || calculateExtendedAnalytics({ month, allRows: rows, prevRows: [], historyRows: [], yearRows: [], rowsBase: rows });
  const incomeMoMRate = percentChange(stats.totals.income, ext.prev.totals.income);
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() || 30;
  const todayStr = formatDate(nowKstDate());
  const remainingDays = todayStr.slice(0, 7) === month ? Math.max(1, daysInMonth - Number(todayStr.slice(8, 10)) + 1) : 0;
  const remainingBudget = Math.max(0, center.totalBudget - center.budget.budgetedExpense);
  const dailyAllowance = center.totalBudget && remainingDays ? Math.round(remainingBudget / remainingDays) : 0;
  const recurringTotal = safeArray(recurringCandidates).reduce((s, c) => s + Number(c.amount || 0), 0);
  const drillBase = `/app?month=${encodeURIComponent(month)}${selected.id ? `&household_id=${encodeURIComponent(selected.id)}` : ""}`;
  const topRows = stats.categories.filter((c) => c.expense > 0).slice(0, 10).map((c) => `<tr><td><a class="drillLink" href="${escapeHtml(`${drillBase}&type=expense&category=${encodeURIComponent(c.category)}&feed=all`)}#feed">${escapeHtml(c.category)}</a></td><td>${numberWithCommas(c.expense)}원</td><td>${numberWithCommas(c.count || 0)}건</td><td>${stats.totals.expense ? Math.round(c.expense / stats.totals.expense * 100) : 0}%</td></tr>`).join("") || `<tr><td colspan="4">지출 데이터가 없습니다.</td></tr>`;
  const patternRows = [
    ["월말 예상 지출", `${numberWithCommas(analysis.burnForecast || 0)}원`, "현재 지출 속도 기준"],
    ["고정비 비중", `${analysis.fixedRate || 0}%`, `${numberWithCommas(analysis.fixedExpense || 0)}원`],
    ["주말 지출 비중", `${analysis.weekendRate || 0}%`, `${numberWithCommas(analysis.weekendExpense || 0)}원`],
    ["카테고리 집중도", `${analysis.concentration || 0}%`, `${escapeHtml(analysis.topCategory?.category || "없음")} 중심`],
    ["소비 위험도", `${analysis.riskScore || 0}점`, (analysis.riskScore || 0) >= 70 ? "주의" : "정상"],
    // V22.9.34 2차 점검 U01: 이번 달은 오늘까지, 앞으로 올 달은 세지 않는다.
    ["무지출일", analysis.basisDays === 0 ? "-" : `${analysis.noSpendDays || 0}일`, analysis.basisDays === 0 ? "아직 오지 않은 달" : month === currentMonthKst() ? "오늘까지 소비 없는 날짜" : "그 달 소비 없는 날짜"],
  ].map(([a,b,c]) => `<div class="metric"><span>${a}</span><b>${b}</b><small>${c}</small></div>`).join("");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(selected.name || "가계부")} · 분석</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero h1{margin:0;font-size:30px}.hero p{opacity:.9}.filters{display:grid;grid-template-columns:1fr 200px 140px;gap:8px;margin-top:14px}.filters select,.filters input,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.metricGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px}.metric span,.metric small{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin:5px 0}.trendChart{display:flex;align-items:end;gap:5px;min-height:176px;overflow:auto;padding:12px;border:1px solid #e8edf4;border-radius:18px;background:#f8fafc}.trendBar{display:grid;grid-template-rows:22px 1fr 16px;align-items:end;justify-items:center;min-width:26px;height:156px}.trendBar strong{font-size:10px;color:#334155;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);align-self:start}.trendBar i{display:block;width:13px;background:#2563eb;border-radius:999px 999px 0 0}.trendBar span{font-size:10px;color:#64748b}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.btn{display:inline-flex;background:#111827;color:#fff!important;border-radius:14px;text-decoration:none;padding:10px 14px;font-weight:1000}.soft{background:#eef2f7!important;color:#111827!important}@media(max-width:760px){body{overflow-x:hidden}.wrap{padding:12px 10px 96px}.filters{grid-template-columns:1fr}.filters select,.filters input,.filters button{width:100%;font-size:16px}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px;line-height:1.25}.metricGrid{grid-template-columns:1fr 1fr;gap:8px}.metric{padding:13px;border-radius:18px}.metric b{font-size:20px}.card{border-radius:20px;padding:16px}.trendChart{min-height:150px}.tableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{min-width:680px}}
.muted{color:#64748b;font-size:13px;line-height:1.5}
.grid2col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.grid2col>.card{margin:0}
.insightGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.insight{border-radius:18px;border:1px solid #e5e7eb;padding:14px;background:#fff}
.insight.warn{background:#fff7ed;border-color:#fed7aa}
.insight.danger{background:#fef2f2;border-color:#fecaca}
.insight.good{background:#f0fdf4;border-color:#bbf7d0}
.insight b{display:block;margin-bottom:4px}
.donutWrap{display:grid;grid-template-columns:230px 1fr;gap:18px;align-items:center}
.donutSvg{width:100%;max-width:230px}
.donutLabel{font-size:9px;fill:#64748b;font-weight:700}
.donutValue{font-size:15px;fill:#111827;font-weight:1000}
.donutLegend{list-style:none;margin:0;padding:0;display:grid;gap:9px}
.donutLegend li{display:grid;grid-template-columns:14px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:13px}
.donutLegend i{width:12px;height:12px;border-radius:4px}
.donutLegend b{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.donutLegend span{color:#64748b;white-space:nowrap}
.seriesChart{display:flex;align-items:flex-end;gap:14px;padding:14px;border:1px solid #e8edf4;border-radius:18px;background:#f8fafc;overflow-x:auto}
.seriesCol{display:grid;justify-items:center;gap:4px;min-width:52px}
.seriesBars{display:flex;align-items:flex-end;gap:4px;height:124px}
.seriesBars i{display:inline-block;width:15px;border-radius:6px 6px 0 0}
.seriesBars i.in,.seriesLegend i.in{background:#10b981}
.seriesBars i.ex,.seriesLegend i.ex{background:#3182F6}
.seriesCol b{font-size:11px;color:#334155}
.seriesCol span{font-size:11px;color:#64748b}
.seriesLegend{display:flex;gap:14px;margin:0 0 8px;color:#64748b;font-size:12px;align-items:center}
.seriesLegend span{display:inline-flex;align-items:center}
.seriesLegend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
.insightList{list-style:none;margin:10px 0;padding:0;display:grid;gap:8px}
.insightList li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;border:1px solid #e5e7eb;border-radius:14px;padding:10px 12px;background:#f8fafc}
.insightList li b{grid-column:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.insightList li span{grid-column:1;color:#64748b;font-size:12px}
.insightList li strong{grid-row:1/3;grid-column:2;align-self:center;white-space:nowrap}
.bar{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed)}
.deltaUp{color:#dc2626!important;font-weight:900}
.deltaDown{color:#16a34a!important;font-weight:900}
.deltaFlat{color:#64748b!important;font-weight:900}
.statTable th,.statTable td{font-size:13px}
details.foldTable{margin-top:12px}
details.foldTable summary{cursor:pointer;font-weight:1000;color:#2563eb}
details.foldTable>div{margin-top:10px}
details.foldSection summary{cursor:pointer;font-weight:1000;color:#2563eb;padding:2px 0}
details.foldSection>div{margin-top:10px}
details.foldSection summary h2{display:inline;font-size:inherit}
.drillLink{color:#2563eb;text-decoration:none;font-weight:1000}.drillLink:hover{text-decoration:underline}
.weeklyHead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:6px 0 10px}
.weeklyHead b{font-size:26px;letter-spacing:-.04em}
.trendBars{display:grid;gap:10px}
.trendLine{display:grid;grid-template-columns:84px 1fr 130px;gap:10px;align-items:center}
.trendLabel{font-size:12px;font-weight:900;color:#334155}
.trendValue{text-align:right;font-size:12px;color:#64748b}
@media(max-width:760px){.grid2col{grid-template-columns:1fr}.donutWrap{grid-template-columns:1fr}.insightGrid{grid-template-columns:1fr}.seriesCol{min-width:44px}.trendLine{grid-template-columns:70px 1fr}.trendValue{display:none}}</style></head><body>${renderUnifiedNav("analysis", { month, householdId: selected.id || "", householdName: selected.name || "가계부" })}<main class="wrap"><section class="hero"><h1>${escapeHtml(selected.name || "가계부")} 분석</h1><p>전월 대비 변화, 월별 흐름, 지출 구성, 반복 지출과 큰 지출까지 월간 리포트처럼 한 화면에서 확인합니다.</p>${pcHouseholdMonthFilters("/analysis", households, selected, month)}</section><section class="metricGrid"><div class="metric"><span>총 지출</span><b>${numberWithCommas(stats.totals.expense)}원</b><small class="${deltaClass(ext.expenseMoMRate)}">지난달 대비 ${formatSignedPercent(ext.expenseMoMRate)}</small></div><div class="metric"><span>총 수입</span><b>${numberWithCommas(stats.totals.income)}원</b><small class="${incomeMoMRate > 0 ? "deltaDown" : incomeMoMRate < 0 ? "deltaUp" : "deltaFlat"}">지난달 대비 ${formatSignedPercent(incomeMoMRate)}</small></div><div class="metric"><span>잔여 예산</span><b>${numberWithCommas(remainingBudget)}원</b>${center.totalBudget && remainingDays ? `<small>남은 ${remainingDays}일 · 하루 ${numberWithCommas(dailyAllowance)}원</small>` : ""}</div><div class="metric"><span>예산 사용률</span><b>${center.budget.rate || 0}%</b></div><div class="metric"><span>하루 평균 지출</span><b>${numberWithCommas(analysis.avgExpense || 0)}원</b></div><div class="metric"><span>월말 예상</span><b>${numberWithCommas(analysis.burnForecast || 0)}원</b></div></section><section class="card"><h2>핵심 인사이트</h2><p class="muted">전월 대비 변화, 3개월 평균, 급증 분류, 소비 경보를 한눈에 요약했습니다.</p><div class="insightGrid">${renderStrategyCards(ext, analysis)}</div></section>${renderWeeklyReportCard(weeklyReport)}<section class="card"><h2>일별 소비 그래프</h2><p class="muted">금액이 있는 날을 누르면 그날 기록 목록으로 이동합니다.</p>${renderReadableDailyTrend(rows, month, drillBase)}</section><section class="card"><h2>요일별 소비 추이</h2><p class="muted">요일별로 소비가 집중되는 패턴을 확인합니다.</p>${renderWeekdayTrend(rows)}</section><section class="card"><details class="foldSection"><summary>이번 달 지출 구성 (도넛 차트)</summary><div><h2>이번 달 지출 구성</h2><p class="muted">상위 분류가 전체 지출에서 차지하는 비중입니다.</p>${renderDonutChart(stats.categories, stats.totals.expense)}</div></details></section><section class="card"><details class="foldSection"><summary>전월 대비 분류 변화 TOP</summary><div><h2>전월 대비 분류 변화 TOP</h2><p class="muted">지난달보다 크게 늘거나 줄어든 분류입니다.</p>${renderCategoryCompareTable(ext.categoryCompare, true)}</div></details></section><section class="card"><details class="foldSection"><summary>최근 6개월 수입·지출 흐름 · 12개월 상세</summary><div><h2>최근 6개월 수입·지출 흐름</h2><p class="muted">막대에 마우스를 올리면 정확한 금액이 표시됩니다.</p>${renderMonthlySeriesChart(ext.monthlyTrend)}<details class="foldTable"><summary>최근 12개월 상세 표 보기</summary><div>${renderMonthlyTrendTable(ext.monthlyTrend)}</div></details></div></details></section><section class="card"><details class="foldSection"><summary>매달 나가는 돈 (반복 지출 후보)</summary><div><h2>매달 나가는 돈</h2><p class="muted">최근 3개월간 같은 이름·같은 금액으로 반복된 지출입니다.${recurringTotal ? ` 합치면 매달 약 <b>${numberWithCommas(recurringTotal)}원</b>이에요.` : ""}</p>${renderRecurringInsightList(recurringCandidates)}<a class="btn soft" href="/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id || "")}">정기지출로 관리하기</a></div></details></section><section class="card"><details class="foldSection"><summary>큰 지출 체크</summary><div><h2>큰 지출 체크</h2><p class="muted">평소 그 분류에서 쓰던 평균보다 크게 벗어난 지출입니다.</p>${renderAnomalyList(anomalies)}</div></details></section><section class="card"><h2>정밀 분석 도구</h2><div class="metricGrid">${patternRows}</div></section><section class="card"><h2>분류별 지출 랭킹</h2><div class="tableWrap"><table><thead><tr><th>분류</th><th>금액</th><th>건수</th><th>비중</th></tr></thead><tbody>${topRows}</tbody></table></div></section><section class="card"><a class="btn" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id || "")}&view=calendar#calendar">캘린더로 보기</a> <a class="btn soft" href="/budgets?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id || "")}">예산관리로 이동</a></section></main></body></html>`;
}

async function handlePcAnalysisPage(request, env, url) {
  const ctx = await pcScopedContext(request, env, url);
  if (!ctx) return redirectResponse("/my");
  if (ctx.restricted) return myAccessStatusResponse({ env, user: ctx.user, household: ctx.restricted, role: ctx.restricted.role, month: ctx.month });
  const householdId = ctx.selectedHousehold?.id || "";
  const month = ctx.month;
  const prevRows = householdId ? await fetchAdminRows(env, { month: addMonthsYm(month, -1), householdId, type: "all" }) : [];
  const historyResult = householdId ? await fetchAnalysisRowsRange(env, { householdId, start: `${addMonthsYm(month, -11)}-01`, end: nextMonthStart(month) }) : { rows: [], truncated: false };
  const yearResult = householdId ? await fetchAnalysisRowsRange(env, { householdId, start: `${month.slice(0, 4)}-01-01`, end: `${Number(month.slice(0, 4)) + 1}-01-01` }) : { rows: [], truncated: false };
  const historyRows = historyResult.rows;
  const yearRows = yearResult.rows;
  const registeredRecurring = householdId ? await fetchRecurring(env, householdId) : [];
  const extended = calculateExtendedAnalytics({ month, allRows: ctx.rows, prevRows, historyRows, yearRows, rowsBase: ctx.rows });
  extended.historyTruncated = historyResult.truncated || yearResult.truncated;
  extended.fairMoM = computeFairMoM(month, ctx.rows, prevRows);
  const recurringCandidates = detectRecurringCandidates(historyRows, month, registeredRecurring);
  const anomalies = findAnomalousExpenses(ctx.rows, historyRows, month);
  const weeklyReport = buildWeeklyReport(historyRows, month);
  return htmlResponse(renderPcAnalysisHtml({ ...ctx, extended, recurringCandidates, anomalies, weeklyReport }));
}

function renderPcCalendarHtml({ month, households, selectedHousehold, rows, stats, calendar }) {
  const selected = selectedHousehold || {};
  const prevMonth = shiftMonthString(month, -1);
  const nextMonth = shiftMonthString(month, 1);
  const daily = Object.create(null);
  for (const r of safeArray(rows)) {
    const d = String(r.transaction_date || "");
    if (!daily[d]) daily[d] = { expense: 0, income: 0, count: 0, rows: [] };
    if (r.type === "income") daily[d].income += Number(r.amount || 0); else daily[d].expense += Number(r.amount || 0);
    daily[d].count += 1;
    daily[d].rows.push(r);
  }
  const dayNames = ["일","월","화","수","목","금","토"];
  const maxDayExpense = Math.max(1, ...safeArray(calendar).map((d) => Number(d.expense || 0)));
  const heatLevel = (exp) => exp <= 0 ? 0 : Math.min(5, Math.max(1, Math.ceil(exp / maxDayExpense * 5)));
  const dayCard = (d, compact = false) => {
    const date = String(d.date || "");
    const dayName = dayNames[weekdayIndexOfYmd(date)] || "";
    const has = Number(d.count || 0) > 0;
    return `<a class="day ${compact ? "compactDay" : ""} ${has ? "hasSpend" : "emptyDay"} heat${heatLevel(Number(d.expense || 0))}" href="#day-${escapeHtml(date)}" title="${escapeHtml(date)} 지출 ${numberWithCommas(d.expense || 0)}원 · ${numberWithCommas(d.count || 0)}건"><b>${escapeHtml(String(date).slice(8,10))}</b><em>${escapeHtml(dayName)}</em><span>${has ? escapeHtml(shortWonLabel(d.expense || 0)) : ""}</span><small>${has ? `${numberWithCommas(d.count || 0)}건` : ""}</small></a>`;
  };
  const activeDays = calendar.filter((d) => Number(d.count || 0) > 0);
  const activeDayCards = activeDays.map((d) => dayCard(d, true)).join("") || `<p class="muted">이번 달 기록이 있는 날짜가 없습니다.</p>`;
  const days = calendar.map((d) => dayCard(d)).join("");
  const detail = Object.entries(daily).filter(([,v])=>v.count).sort(([a],[b])=>a.localeCompare(b)).map(([date, v]) => `<section class="card dayDetail" id="day-${escapeHtml(date)}"><h2>${escapeHtml(date)} · ${numberWithCommas(v.expense)}원 · ${numberWithCommas(v.count)}건</h2>${v.rows.map((r)=>`<div class="record"><div><b>${escapeHtml(r.memo || r.raw_text || r.category || "기록")}</b><span>${escapeHtml(r.spender_name || "미지정")} · ${escapeHtml(r.category || "미분류")} · ${escapeHtml(r.payment_method || "")}</span></div><strong class="${r.type === "income" ? "income" : "expense"}">${r.type === "income" ? "+" : "-"}${numberWithCommas(r.amount)}원</strong></div>`).join("")}</section>`).join("") || `<section class="card">기록이 있는 날짜가 없습니다.</section>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(selected.name || "가계부")} · 캘린더</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero h1{margin:0;font-size:30px}.filters{display:grid;grid-template-columns:1fr 200px 120px 120px 120px;gap:8px;margin-top:14px}.filters select,.filters input,.filters button,.filters a{height:44px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;background:#fff;font:inherit;display:flex;align-items:center;justify-content:center;text-decoration:none;color:#111827}.filters button,.filters a.dark{background:#111827;color:#fff;font-weight:1000}.activeDayGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.fullCalendar summary{cursor:pointer;font-weight:1000;background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin-bottom:10px}.calendarGrid{display:grid;grid-template-columns:repeat(7,1fr);gap:8px}.day{display:grid;grid-template-columns:auto auto;align-content:start;text-decoration:none;color:#111827;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;min-height:96px;box-shadow:0 8px 18px rgba(15,23,42,.035)}.day.hasSpend{border-color:#99f6e4;background:#f0fdfa}.day.heat1{background:#f0fdfa;border-color:#ccfbf1}.day.heat2{background:#ccfbf1;border-color:#99f6e4}.day.heat3{background:#99f6e4;border-color:#5eead4}.day.heat4{background:#5eead4;border-color:#2dd4bf}.day.heat5{background:#2dd4bf;border-color:#14b8a6}.day.heat4 span,.day.heat5 span{color:#134e4a}.heatLegend{display:flex;align-items:center;gap:5px;color:#64748b;font-size:12px;font-weight:900;margin:8px 0}.heatLegend i{display:inline-block;width:20px;height:12px;border-radius:4px;border:1px solid #e5e7eb}.heatLegend i.h1{background:#f0fdfa}.heatLegend i.h2{background:#ccfbf1}.heatLegend i.h3{background:#99f6e4}.heatLegend i.h4{background:#5eead4}.heatLegend i.h5{background:#2dd4bf}.day.emptyDay{opacity:.58}.day b{font-size:22px;line-height:1}.day em{font-style:normal;justify-self:end;color:#64748b;font-size:12px;font-weight:900}.day span{grid-column:1/-1;display:block;color:#0f766e;font-weight:1000;margin-top:8px}.day small{grid-column:1/-1;display:block;color:#64748b;margin-top:2px}.record{display:flex;justify-content:space-between;gap:10px;border:1px solid #e5e7eb;border-radius:16px;padding:12px;margin:8px 0}.record span{display:block;color:#64748b;font-size:13px}.income{color:#059669}.expense{color:#dc2626}@media(max-width:760px){body{overflow-x:hidden}.wrap{padding:12px 10px 96px}.filters{grid-template-columns:1fr 1fr}.filters select{grid-column:1/-1}.filters select,.filters input,.filters button,.filters a{width:100%;font-size:15px}.calendarGrid{grid-template-columns:repeat(7,minmax(0,1fr));gap:4px}.day{min-height:58px;padding:7px 3px;grid-template-columns:1fr;align-content:start;justify-items:center;border-radius:11px;box-shadow:none}.day b{font-size:13px;line-height:1}.day em{display:none}.day span{grid-column:1/-1;margin-top:5px;font-size:10px;text-align:center;white-space:nowrap;max-width:100%;overflow:hidden;text-overflow:ellipsis}.day small{display:none}.record{display:block}.record strong{display:block;margin-top:6px}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px;line-height:1.25}.card{border-radius:20px;padding:16px}}</style></head><body>${renderUnifiedNav("calendar", { month, householdId: selected.id || "", householdName: selected.name || "가계부" })}<main class="wrap"><section class="hero"><h1>${escapeHtml(selected.name || "가계부")} 캘린더</h1><p>월 이동과 일별 지출금액/건수를 한 화면에서 확인합니다.</p><form class="filters" method="get" action="/calendar"><select name="household_id">${households.map((h)=>`<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button><a class="dark" href="/calendar?month=${encodeURIComponent(prevMonth)}&household_id=${encodeURIComponent(selected.id || "")}">이전달</a><a class="dark" href="/calendar?month=${encodeURIComponent(nextMonth)}&household_id=${encodeURIComponent(selected.id || "")}">다음달</a></form></section><section class="card"><h2>기록 있는 날짜</h2><div class="activeDayGrid">${activeDayCards}</div></section><section class="card"><details class="fullCalendar"><summary>전체 날짜 달력 펼쳐 보기</summary><div class="heatLegend">지출 적음 <i class="h1"></i><i class="h2"></i><i class="h3"></i><i class="h4"></i><i class="h5"></i> 많음 · 색이 진할수록 그날 지출이 큽니다</div><div class="calendarGrid">${days}</div></details></section>${detail}</main></body></html>`;
}

async function handlePcCalendarPage(request, env, url) {
  const ctx = await pcScopedContext(request, env, url);
  if (!ctx) return redirectResponse("/my");
  if (ctx.restricted) return myAccessStatusResponse({ env, user: ctx.user, household: ctx.restricted, role: ctx.restricted.role, month: ctx.month });
  return htmlResponse(renderPcCalendarHtml(ctx));
}
// @build:exports-start
export {
  buildWeeklyReport, detectRecurringCandidates, findAnomalousExpenses, handleBudgetDelete,
  handleBudgetSave, handlePcAnalysisPage, handlePcCalendarPage, normalizeRecurringKey,
  renderAnomalyList, renderDonutChart, renderMonthlySeriesChart, renderRecurringInsightList,
  renderWeeklyReportCard,
};
// @build:exports-end
