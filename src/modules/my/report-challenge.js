// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAdminRowsRange, fetchHouseholdMembers,
  isRowLimitExceededError,
} from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { verifyUserSession } from "../auth/user-session.js";
import { handleMyLogout } from "../auth/kakao-oauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import { parseJsonSetting, saveSettingValue } from "./reports-premium.js";
import { shiftMonthString } from "./analysis-page.js";
import {
  canManageMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { budgetSummary, fetchBudgets } from "../domain/budgets.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { calculateDashboardAnalysis } from "../domain/analytics.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import {
  calculateStats, calendarDaysFromRows, escapeHtml, nextMonthStart, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

async function getMyPageContext(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return { redirect: redirectResponse("/my") };
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const [user, access] = await Promise.all([
    fetchUserById(env, userId),
    getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || ""),
  ]);
  if (!user) return { redirect: handleMyLogout() };
  const { households, selected, restricted } = access;
  if (restricted) return { redirect: myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month }) };
  if (!selected) return { redirect: htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" })) };
  // V22.9.16: 달력은 같은 달 거래를 한 번 더 읽어 만들고 있었다(같은 질의 2회). 이미 받은
  // 행으로 만든다 — 값은 같고 왕복 하나가 준다.
  const [members, rawRows, budgets] = await Promise.all([
    fetchHouseholdMembers(env, selected.id),
    fetchAdminRows(env, { month, householdId: selected.id, type: "all" }),
    fetchBudgets(env, selected.id, month),
  ]);
  const rows = attachSpenderNames(rawRows, members);
  const calendar = calendarDaysFromRows(rows, month);
  const stats = calculateStats(rows);
  const budget = budgetSummary(rows, budgets);
  const analysis = calculateDashboardAnalysis(rows, rows, calendar, month);
  return { userId, user, month, households, selected, members, rows, calendar, stats, budgets, budget, analysis };
}

function reportChallengeSettingsKey(householdId = "") {
  return `report_challenge:${String(householdId || "").trim()}`.slice(0, 180);
}

function shiftChallengeDate(date = "", days = 0) {
  if (!isValidTransactionDateString(date)) return "";
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() + Number(days || 0));
  return value.toISOString().slice(0, 10);
}

function challengePeriodDays(startDate = "", targetDate = "") {
  if (!isValidTransactionDateString(startDate) || !isValidTransactionDateString(targetDate)) return 0;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const target = Date.parse(`${targetDate}T00:00:00Z`);
  if (!Number.isFinite(start) || !Number.isFinite(target) || target < start) return 0;
  return Math.floor((target - start) / 86400000) + 1;
}

const REPORT_CHALLENGE_TYPES = Object.freeze(["no_spend_days", "daily_spend_limit_days", "category_spend_limit_days"]);

function normalizeReportChallengeType(value = "") {
  const type = String(value || "").trim();
  return REPORT_CHALLENGE_TYPES.includes(type) ? type : "no_spend_days";
}

function reportChallengeTypeMeta(type = "no_spend_days", settings = {}) {
  const normalized = normalizeReportChallengeType(type);
  if (normalized === "daily_spend_limit_days") {
    return { type: normalized, typeLabel: "하루 지출 한도", successLabel: "한도 지킴", failureLabel: "한도 초과", goalLabel: `하루 ${numberWithCommas(settings.targetAmount || 0)}원 이하` };
  }
  if (normalized === "category_spend_limit_days") {
    return { type: normalized, typeLabel: "분류별 하루 한도", successLabel: "분류 한도 지킴", failureLabel: "분류 한도 초과", goalLabel: `${settings.category || "선택 분류"} 하루 ${numberWithCommas(settings.targetAmount || 0)}원 이하` };
  }
  return { type: "no_spend_days", typeLabel: "무지출 일수", successLabel: "무지출 성공", failureLabel: "지출 있음", goalLabel: "지출 0원" };
}

function normalizeReportChallenge(value = {}, month = currentMonthKst()) {
  const raw = value && typeof value === "object" ? value : parseJsonSetting(value, {});
  const targetDays = Math.max(1, Math.min(20, Math.round(Number(raw.target_days || 4)) || 4));
  const title = String(raw.title || "무지출 데이").trim().replace(/\s+/g, " ").slice(0, 30) || "무지출 데이";
  const type = normalizeReportChallengeType(raw.type);
  const targetAmount = Math.max(0, Math.min(MAX_TRANSACTION_AMOUNT, Math.round(Number(raw.target_amount || raw.goal?.amount || 0)) || 0));
  const category = String(raw.category || raw.goal?.category || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const today = formatDate(nowKstDate());
  const startDate = isValidTransactionDateString(raw.start_date) ? String(raw.start_date) : `${validMonth(month) || currentMonthKst()}-01`;
  let targetDate = isValidTransactionDateString(raw.target_date) ? String(raw.target_date) : shiftChallengeDate(startDate, targetDays - 1);
  let periodDays = challengePeriodDays(startDate, targetDate);
  if (!periodDays || periodDays > 90) {
    targetDate = shiftChallengeDate(startDate, targetDays - 1);
    periodDays = targetDays;
  }
  const meta = reportChallengeTypeMeta(type, { targetAmount, category });
  return { schemaVersion: Number(raw.schema_version || 1), revision: Math.max(0, Math.round(Number(raw.revision || 0)) || 0), enabled: raw.enabled !== false, targetDays: Math.min(targetDays, periodDays), title, type, targetAmount, category, ...meta, startDate, targetDate, periodDays };
}

function buildReportChallenge(rows = [], month = currentMonthKst(), value = {}) {
  const safeMonth = validMonth(month) || currentMonthKst();
  const settings = normalizeReportChallenge(value,safeMonth);
  const today = formatDate(nowKstDate());
  const yesterday = shiftChallengeDate(today, -1);
  const evaluationEnd = yesterday < settings.targetDate ? yesterday : settings.targetDate;
  const evaluatedDays = evaluationEnd >= settings.startDate ? challengePeriodDays(settings.startDate, evaluationEnd) : 0;
  const expenseByDay = new Map();
  for (const row of safeArray(rows)) {
    if (row.type === "income" || !(Number(row.amount || 0) > 0)) continue;
    const date = String(row.transaction_date || "").slice(0, 10);
    if (date < settings.startDate || date > evaluationEnd) continue;
    if (settings.type === "category_spend_limit_days" && String(row.category || "").trim() !== settings.category) continue;
    expenseByDay.set(date, Number(expenseByDay.get(date) || 0) + Number(row.amount || 0));
  }
  const failedDays = new Set();
  for (let offset = 0; offset < evaluatedDays; offset++) {
    const date = shiftChallengeDate(settings.startDate, offset);
    const spent = Number(expenseByDay.get(date) || 0);
    const failed = settings.type === "no_spend_days" ? spent > 0 : spent > settings.targetAmount;
    if (failed) failedDays.add(date);
  }
  let completed = 0;
  for (let offset = 0; offset < evaluatedDays; offset++) {
    const date = shiftChallengeDate(settings.startDate, offset);
    if (!failedDays.has(date)) completed++;
  }
  const target = settings.targetDays;
  const progress = Math.min(target, completed);
  const rate = target ? Math.min(100, Math.round(progress / target * 100)) : 0;
  const remaining = Math.max(0, target - progress);
  const currentDay = today < settings.startDate ? 0 : Math.min(settings.periodDays, challengePeriodDays(settings.startDate, today));
  const phase = today < settings.startDate ? "scheduled" : today > settings.targetDate ? "ended" : "active";
  const displayMode = settings.periodDays <= 7 ? "daily" : "percent";
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const daySlots = displayMode === "daily"
    ? Array.from({ length: settings.periodDays }, (_unused, offset) => {
        const date = shiftChallengeDate(settings.startDate, offset);
        const day = Number(date.slice(8, 10));
        const weekday = weekdays[new Date(`${date}T00:00:00Z`).getUTCDay()] || "";
        const state = date <= evaluationEnd
          ? (failedDays.has(date) ? "spent" : "success")
          : date === today
            ? "today"
            : "future";
        const stateLabel = state === "success" ? (settings.type === "no_spend_days" ? "무지출 성공" : settings.successLabel) : state === "spent" ? (settings.type === "no_spend_days" ? "지출 있음" : settings.failureLabel) : state === "today" ? "오늘 진행 중" : "예정";
        return { date, day, weekday, state, stateLabel };
      })
    : [];
  return { ...settings, month: safeMonth, today, targetDays: target, completedDays: completed, progress, rate, remaining, evaluatedDays, currentDay, phase, displayMode, daySlots };
}

async function buildReportChallengeForHousehold(env, { householdId = "", month = currentMonthKst(), rows = [], value = {} } = {}) {
  const safeMonth = validMonth(month) || currentMonthKst();
  const settings = normalizeReportChallenge(value,safeMonth);
  const monthStart = `${safeMonth}-01`;
  const monthEnd = nextMonthStart(safeMonth);
  const today = formatDate(nowKstDate());
  const evaluationEnd = shiftChallengeDate(today, -1) < settings.targetDate ? shiftChallengeDate(today, -1) : settings.targetDate;
  let challengeRows = safeArray(rows);
  // 아직 끝나지 않은 오늘과 미래 날짜에는 기록이 없으므로 조회할 필요가 없다.
  // 완료 판정 범위가 현재 월을 실제로 벗어날 때만 추가 범위 조회를 수행한다.
  if (householdId && evaluationEnd >= settings.startDate && (settings.startDate < monthStart || evaluationEnd >= monthEnd)) {
    try {
      challengeRows = await fetchAdminRowsRange(env, {
        householdId,
        start: settings.startDate,
        end: shiftChallengeDate(settings.targetDate, 1),
        type: "all",
        limit: 10000,
      });
    } catch (err) {
      if (!isRowLimitExceededError(err)) throw err;
      // 기간 기록을 다 읽지 못하면 빠진 날을 지출 없는 날로 세게 된다. 챌린지를 그리지 않는다(QA B05).
      return null;
    }
  }
  return buildReportChallenge(challengeRows, safeMonth, value);
}

function reportMonthHref(path = "/my/analysis", month = currentMonthKst(), householdId = "", view = "", extra = {}) {
  const params = new URLSearchParams({ month: validMonth(month) || currentMonthKst() });
  if (householdId) params.set("household_id", String(householdId));
  if (view) params.set("view", String(view));
  // V22.9.38: 생활비 리포트의 주간 보기(range=week)처럼 달을 옮겨도 유지할 조건을 받는다.
  for (const [key, value] of Object.entries(extra || {})) if (value) params.set(key, String(value));
  return `${path}?${params.toString()}`;
}

function renderReportMonthNavigator({ path = "/my/analysis", month = currentMonthKst(), householdId = "", view = "", extra = {} } = {}) {
  const safeMonth = validMonth(month) || currentMonthKst();
  const prev = shiftMonthString(safeMonth, -1);
  const next = shiftMonthString(safeMonth, 1);
  const current = currentMonthKst();
  const extraInputs = Object.entries(extra || {}).filter(([, value]) => value).map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(String(value))}"/>`).join("");
  return `<nav class="reportMonthNav" aria-label="리포트 기준 월 이동"><a class="reportMonthArrow" href="${escapeHtml(reportMonthHref(path, prev, householdId, view, extra))}" aria-label="이전 달 ${escapeHtml(prev)}로 이동">‹ <span>이전 달</span></a><form method="get" action="${escapeHtml(path)}"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/>${view ? `<input type="hidden" name="view" value="${escapeHtml(view)}"/>` : ""}${extraInputs}<label><span>기준 월</span><input type="month" name="month" value="${escapeHtml(safeMonth)}" aria-label="리포트 기준 월"/></label><button type="submit">이동</button></form><a class="reportMonthArrow" href="${escapeHtml(reportMonthHref(path, next, householdId, view, extra))}" aria-label="다음 달 ${escapeHtml(next)}로 이동"><span>다음 달</span> ›</a>${safeMonth === current ? `<span class="reportMonthCurrent" aria-current="date">이번 달</span>` : `<a class="reportMonthCurrent" href="${escapeHtml(reportMonthHref(path, current, householdId, view, extra))}">이번 달</a>`}</nav>`;
}

function buildReportDashboardSummary(rows = [], budget = {}, month = currentMonthKst()) {
  const safeMonth = validMonth(month) || currentMonthKst();
  const stats = calculateStats(rows);
  const daysInMonth = new Date(Number(safeMonth.slice(0, 4)), Number(safeMonth.slice(5, 7)), 0).getDate() || 30;
  const today = formatDate(nowKstDate());
  const todayMonth = today.slice(0, 7);
  const elapsedDays = safeMonth < todayMonth ? daysInMonth : safeMonth === todayMonth ? Math.min(daysInMonth, Number(today.slice(8, 10)) || 1) : 0;
  const expense = Number(stats.totals?.expense || 0);
  const income = Number(stats.totals?.income || 0);
  const totalBudget = Math.max(0, Number(budget.totalBudget || 0));
  // 예산이 덮는 지출로 견준다. 분류별 예산만 잡은 달에 전체 지출을 얹으면
  // 아무 관계 없는 지출 때문에 사용률이 100% 를 넘어 버린다.
  const budgetedExpense = Number(budget.budgetedExpense ?? expense);
  const budgetRate = totalBudget ? Math.round(budgetedExpense / totalBudget * 100) : 0;
  const elapsedRate = Math.round(elapsedDays / daysInMonth * 100);
  const remainingBudget = Math.max(0, totalBudget - budgetedExpense);
  const forecast = elapsedDays ? Math.round(expense / elapsedDays * daysInMonth) : 0;
  const paceGap = totalBudget ? budgetRate - elapsedRate : 0;
  const categoryAlerts = safeArray(budget.categoryAlerts).filter((item) => Number(item.budget || 0) > 0).sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0)).slice(0, 4);
  let insight = "예산을 설정하면 현재 소비 속도와 남은 하루 한도를 함께 안내합니다.";
  if (totalBudget && paceGap > 8) insight = `달력 진행률보다 예산을 ${Math.abs(paceGap)}%p 빠르게 사용하고 있어요. 사용률이 높은 분류부터 확인해 보세요.`;
  else if (totalBudget && paceGap < -8) insight = `달력 진행률보다 예산 사용이 ${Math.abs(paceGap)}%p 여유로워요. 지금의 소비 흐름을 유지해 보세요.`;
  else if (totalBudget) insight = "달력 진행률과 예산 사용 속도가 비슷해요. 큰 지출 예정이 있다면 남은 예산을 먼저 확인하세요.";
  return { month: safeMonth, expense, income, balance: income - expense, totalBudget, budgetRate, elapsedRate, remainingBudget, forecast, paceGap, categoryAlerts, insight };
}

function renderReportDashboard(summary = {}) {
  const rate = Math.max(0, Math.min(100, Number(summary.budgetRate || 0)));
  const householdQuery = summary.householdId ? `&household_id=${encodeURIComponent(summary.householdId)}` : "";
  const categories = safeArray(summary.categoryAlerts).map((item) => {
    const itemRate = Math.max(0, Math.min(100, Number(item.rate || 0)));
    return `<li><div><b>${escapeHtml(item.category || "미분류")}</b><span>${numberWithCommas(item.spent || 0)}원 / ${numberWithCommas(item.budget || 0)}원</span></div><strong>${numberWithCommas(item.rate || 0)}%</strong><i><em style="width:${itemRate}%"></em></i></li>`;
  }).join("");
  return `<section class="reportCockpit" aria-labelledby="reportCockpitTitle"><div class="reportCockpitHead"><div><span>MONTHLY DASHBOARD</span><h2 id="reportCockpitTitle">${escapeHtml(summary.month || "")} 한눈에 보기</h2></div><a href="/app?month=${encodeURIComponent(summary.month || currentMonthKst())}${householdQuery}&view=calendar#calendar">거래 캘린더 보기</a></div><div class="reportCockpitGrid"><div class="reportPace"><div class="reportGauge" style="--report-rate:${rate}%"><div><b>${summary.totalBudget ? `${numberWithCommas(summary.budgetRate || 0)}%` : "—"}</b><span>예산 사용</span></div></div><p>${summary.totalBudget ? `월 ${numberWithCommas(summary.totalBudget)}원 기준` : "월 예산 미설정"}</p></div><div class="reportKpis"><div><span>이번 달 지출</span><b>${numberWithCommas(summary.expense || 0)}원</b></div><div><span>이번 달 수입</span><b>${numberWithCommas(summary.income || 0)}원</b></div><div><span>남은 예산</span><b>${summary.totalBudget ? `${numberWithCommas(summary.remainingBudget || 0)}원` : "설정 전"}</b></div><div><span>월말 예상 지출</span><b>${numberWithCommas(summary.forecast || 0)}원</b></div></div></div><div class="reportInsight"><span aria-hidden="true">✦</span><p>${escapeHtml(summary.insight || "")}</p></div>${categories ? `<div class="reportCategoryBudget"><div class="reportSectionTitle"><b>분류별 예산 속도</b><a href="/budgets?month=${encodeURIComponent(summary.month || currentMonthKst())}${householdQuery}">전체 예산 보기</a></div><ul>${categories}</ul></div>` : ""}</section>`;
}

function renderChallengeProgress(challenge = {}, { hydrate = false } = {}) {
  const safe = challenge && typeof challenge === "object" ? challenge : {};
  const enabled = safe.enabled !== false;
  const rate = enabled ? Math.max(0, Math.min(100, Number(safe.rate || 0))) : 0;
  const successLabel = escapeHtml(safe.successLabel || "무지출 성공");
  const failureLabel = escapeHtml(safe.failureLabel || "지출 있음");
  const progressLabel = `${safe.typeLabel || "무지출"} 챌린지 달성률`;
  const legend = safe.type === "no_spend_days" ? "✓ 무지출 · − 지출 · ● 오늘 · ○ 예정" : `✓ ${successLabel} · − ${failureLabel} · ● 오늘 · ○ 예정`;
  if (safe.displayMode === "daily" && safeArray(safe.daySlots).length) {
    if (hydrate) {
      const stateCodes = { success: "s", spent: "x", today: "t", future: "f" };
      const packed = safeArray(safe.daySlots).map((slot) => `${slot.day}:${slot.weekday}:${stateCodes[slot.state] || "f"}`).join(",");
      return `<ol class="reportChallengeDays" data-ab-challenge-slots="${escapeHtml(packed)}" data-ab-challenge-full></ol><small class="reportChallengeLegend">${legend}</small>`;
    }
    const slots = safeArray(safe.daySlots).map((slot) => {
      const state = ["success", "spent", "today", "future"].includes(slot.state) ? slot.state : "future";
      return `<li class="is-${state}" aria-label="${slot.day}일, ${escapeHtml(slot.stateLabel)}"><span>${escapeHtml(slot.weekday)}</span><b>${slot.day}</b></li>`;
    }).join("");
    return `<ol class="reportChallengeDays" aria-label="날짜별 챌린지 진행 상태">${slots}</ol><small class="reportChallengeLegend">${legend}</small>`;
  }
  return `<div class="reportChallengePercent"><b>${rate}%</b><div class="reportChallengeTrack" role="progressbar" aria-label="${escapeHtml(progressLabel)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${rate}"><i style="width:${rate}%"></i></div><span>${safe.progress || 0}/${safe.targetDays || 0}일 달성</span></div>`;
}

function renderReportChallenge(challenge = {}, { householdId = "", canManage = false, home = false } = {}) {
  const safe = challenge && typeof challenge === "object" ? challenge : buildReportChallenge([], currentMonthKst(), {});
  const qs = `month=${encodeURIComponent(safe.month || currentMonthKst())}&household_id=${encodeURIComponent(householdId)}`;
  const dayPosition = safe.phase === "scheduled" ? "시작 전" : `${safe.currentDay}/${safe.periodDays}일차`;
  const status = !safe.enabled
    ? "챌린지가 꺼져 있습니다."
    : safe.phase === "scheduled"
      ? `${safe.startDate}부터 시작합니다.`
      : safe.phase === "ended"
        ? `${safe.targetDate}에 끝난 챌린지입니다. ${safe.remaining ? `목표까지 ${safe.remaining}일을 남기고 끝났습니다.` : "목표를 달성했습니다."}`
        : safe.remaining
          ? `${dayPosition}이며 목표까지 ${safe.remaining}일 남았습니다.`
          : `${safe.typeLabel || "챌린지"} 목표를 달성했습니다.`;
  const action = home
    ? `<a class="reportChallengeManage" href="/my/analysis?view=report&${qs}#reportChallenge">${canManage ? "날짜·목표 설정" : "챌린지 자세히"}</a>`
    : canManage
      ? `<div class="reportChallengeActions"><details><summary>챌린지 설정</summary><form method="post" action="/my/report-challenge/save" data-report-challenge-form><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(safe.month || currentMonthKst())}"/><label><span>이름</span><input name="title" maxlength="30" value="${escapeHtml(safe.title || "무지출 데이")}"/></label><label><span>방식</span><select name="challenge_type" data-report-challenge-type><option value="no_spend_days"${safe.type === "no_spend_days" ? " selected" : ""}>무지출 일수</option><option value="daily_spend_limit_days"${safe.type === "daily_spend_limit_days" ? " selected" : ""}>하루 지출 한도</option><option value="category_spend_limit_days"${safe.type === "category_spend_limit_days" ? " selected" : ""}>분류별 하루 한도</option></select></label><label><span>시작일</span><input type="date" name="start_date" value="${escapeHtml(safe.startDate)}" required/></label><label><span>목표일</span><input type="date" name="target_date" value="${escapeHtml(safe.targetDate)}" required/></label><label><span>성공 목표</span><input type="number" name="target_days" min="1" max="20" value="${safe.targetDays}" inputmode="numeric"/></label><label data-report-challenge-amount><span>하루 한도</span><input type="number" name="target_amount" min="1" max="${MAX_TRANSACTION_AMOUNT}" value="${safe.targetAmount || ""}" inputmode="numeric"/></label><label data-report-challenge-category><span>대상 분류</span><input name="category" maxlength="40" value="${escapeHtml(safe.category || "")}" placeholder="예: 카페"/></label><label class="reportChallengeToggle"><input type="checkbox" name="enabled" value="1"${safe.enabled ? " checked" : ""}/> 챌린지 표시</label><button type="submit">설정 저장</button></form></details><p class="reportChallengeFormStatus" data-report-challenge-status role="status" aria-live="polite" hidden></p></div>`
      : `<p class="reportChallengeReadOnly">소유자·관리자가 목표를 설정할 수 있습니다.</p>`;
  const description = home ? "" : `<p>${escapeHtml(status)}<br/><span class="reportChallengeDates">기간 ${escapeHtml(safe.startDate)} ~ ${escapeHtml(safe.targetDate)} · 오늘 ${escapeHtml(safe.today || formatDate(nowKstDate()))}</span></p>`;
  const progressSummary = safe.type === "no_spend_days" ? `무지출 ${safe.progress}/${safe.targetDays}일` : `${escapeHtml(safe.goalLabel || safe.typeLabel || "챌린지")} · ${safe.progress}/${safe.targetDays}일 성공`;
  return `<section class="reportChallenge" id="reportChallenge"><div class="reportChallengeMain"><span class="reportChallengeBadge"><i aria-hidden="true">🔥</i> ${escapeHtml(safe.typeLabel || "생활 챌린지")}</span><h2>${escapeHtml(safe.title || "무지출 데이")} ${safe.targetDays}일</h2>${description}${renderChallengeProgress(safe, { hydrate: home })}<strong>${safe.enabled ? `${progressSummary} · 기간 ${dayPosition}` : "사용 안 함"}</strong></div>${action}</section>`;
}

function reportUxCss() {
  return `
.reportChallenge select{width:100%;min-width:0;max-width:100%;min-height:42px;border:1px solid #4b557c!important;border-radius:10px;background:#111526!important;color:#fff!important;padding:0 10px}.reportChallenge [hidden]{display:none!important}
.reportMonthNav{position:sticky;top:8px;z-index:45;display:grid;grid-template-columns:auto minmax(260px,1fr) auto auto;gap:8px;align-items:center;margin:12px 0;padding:10px;background:color-mix(in srgb,var(--ab12-surface,#fff) 94%,transparent);color:var(--ab12-text,#191f28);backdrop-filter:blur(14px);border:1px solid var(--ab12-line,#e5e9f0);border-radius:18px;box-shadow:0 8px 24px rgba(15,23,42,.08)}
.reportMonthNav a,.reportMonthNav button,.reportMonthNav .reportMonthCurrent{min-height:44px;border:0;border-radius:12px;padding:0 13px;display:inline-flex;align-items:center;justify-content:center;text-decoration:none;font:inherit;font-weight:850;white-space:nowrap}.reportMonthArrow{background:var(--ab12-surface-raised,#f2f4f6);color:var(--ab12-text,#333d4b)}.reportMonthNav form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:7px}.reportMonthNav label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;border:1px solid var(--ab12-line,#d9e0ea);border-radius:12px;padding:0 10px;background:var(--ab12-input-bg,#fff)}.reportMonthNav label span{font-size:12px;color:var(--ab12-muted,#6b7280);font-weight:800}.reportMonthNav input{min-width:0;width:100%;height:40px;border:0!important;padding:0;background:transparent!important;font:inherit;font-weight:850;color:var(--ab12-text,#111827)!important}.reportMonthNav button{background:var(--ab12-action,#2457d6);color:#fff}.reportMonthCurrent{background:var(--ab12-accent-soft,#fff7cc);color:var(--ab12-accent,#665800);border:1px solid var(--ab12-accent,#f2d64b)!important}
.reportCockpit{background:var(--ab12-surface,#fff);color:var(--ab12-text,#191f28);border:1px solid var(--ab12-line,#e5e9f0);border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 10px 30px rgba(15,23,42,.06)}.reportCockpitHead,.reportSectionTitle{display:flex;align-items:center;justify-content:space-between;gap:12px}.reportCockpitHead span{display:block;color:var(--ab12-accent,#2457d6);font-size:11px;font-weight:900;letter-spacing:.08em}.reportCockpitHead h2{margin:4px 0 0;font-size:21px}.reportCockpitHead a,.reportSectionTitle a{color:var(--ab12-accent,#2457d6);text-decoration:none;font-size:12px;font-weight:850}.reportCockpitGrid{display:grid;grid-template-columns:210px minmax(0,1fr);gap:16px;margin-top:18px}.reportPace{display:grid;justify-items:center;align-content:center;border-right:1px solid var(--ab12-line,#edf0f4)}.reportGauge{--report-rate:0%;width:148px;aspect-ratio:1;border-radius:50%;display:grid;place-items:center;background:conic-gradient(var(--ab12-brand,#6d5dfc) var(--report-rate),var(--ab12-surface-raised,#edf0f5) 0);position:relative}.reportGauge:before{content:"";position:absolute;inset:15px;background:var(--ab12-surface,#fff);border-radius:50%}.reportGauge div{position:relative;text-align:center}.reportGauge b{display:block;font-size:27px;letter-spacing:-.04em}.reportGauge span,.reportPace p{color:var(--ab12-muted,#6b7280);font-size:12px;font-weight:800}.reportPace p{margin:9px 0 0}.reportKpis{display:grid;grid-template-columns:1fr 1fr;gap:10px}.reportKpis>div{background:var(--ab12-surface-raised,#f7f8fb);border:1px solid var(--ab12-line,#edf0f4);border-radius:16px;padding:14px}.reportKpis span{display:block;color:var(--ab12-muted,#6b7280);font-size:12px;font-weight:800}.reportKpis b{display:block;margin-top:6px;font-size:clamp(18px,2.1vw,25px);overflow-wrap:anywhere;line-height:1.2}.reportInsight{display:flex;gap:10px;align-items:center;margin-top:14px;padding:13px 15px;border:1px solid color-mix(in srgb,var(--ab12-accent,#d97706) 42%,transparent);border-radius:15px;background:var(--ab12-accent-soft,#fffbeb);color:var(--ab12-text,#713f12)}.reportInsight>span{font-size:20px;color:var(--ab12-accent,#d97706)}.reportInsight p{margin:0;line-height:1.5;font-size:13px;font-weight:750}.reportCategoryBudget{margin-top:16px}.reportCategoryBudget ul{list-style:none;margin:10px 0 0;padding:0;display:grid;grid-template-columns:1fr 1fr;gap:9px}.reportCategoryBudget li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:5px 10px;border:1px solid var(--ab12-line,#edf0f4);border-radius:14px;padding:11px}.reportCategoryBudget li div b,.reportCategoryBudget li div span{display:block}.reportCategoryBudget li div span{color:var(--ab12-muted,#7b8493);font-size:11px;margin-top:2px}.reportCategoryBudget li strong{font-size:12px}.reportCategoryBudget li i{grid-column:1/-1;height:7px;border-radius:999px;background:var(--ab12-surface-raised,#edf0f4);overflow:hidden}.reportCategoryBudget li em{display:block;height:100%;border-radius:inherit;background:var(--ab12-brand,#6d5dfc)}
.reportChallenge{display:grid;grid-template-columns:minmax(0,1fr) 300px;gap:18px;background:linear-gradient(135deg,#171a2b,#222741);color:#fff;border:1px solid #343b5f;border-radius:22px;padding:18px;margin:14px 0}.reportChallengeBadge{display:inline-flex;padding:5px 9px;border-radius:999px;background:var(--ab12-action,#6d5dfc);color:#fff;font-size:11px;font-weight:900}.reportChallenge h2{margin:9px 0 5px;color:#fff!important}.reportChallenge p{margin:0;color:#c7cce0;font-size:13px;line-height:1.5}.reportChallengeTrack{height:9px;border-radius:999px;background:#30364d;overflow:hidden;margin:13px 0 7px}.reportChallengeTrack i{display:block;height:100%;background:linear-gradient(90deg,#ffd45b,var(--ab12-brand,#6d5dfc));border-radius:inherit}.reportChallengeMain>strong{font-size:12px;color:#ffd45b}.reportChallenge details{align-self:center;border:1px solid #3d4569;border-radius:14px;padding:9px}.reportChallenge summary{cursor:pointer;font-weight:850;min-height:36px;display:flex;align-items:center}.reportChallenge form{display:grid;gap:8px;margin-top:8px}.reportChallenge label{display:grid;grid-template-columns:76px minmax(0,1fr);align-items:center;gap:8px;color:#d7dbee;font-size:12px;font-weight:750}.reportChallenge label>span{min-width:0;overflow-wrap:anywhere}.reportChallenge input{width:100%;min-width:0;max-width:100%;min-height:42px;border:1px solid #4b557c!important;border-radius:10px;background:#111526!important;color:#fff!important;padding:0 10px}.reportChallengeToggle{grid-template-columns:auto 1fr!important;justify-content:start}.reportChallengeToggle input{width:18px;min-height:18px}.reportChallenge button{min-height:42px;border:0;border-radius:11px;background:var(--ab12-action,#6d5dfc);color:#fff;font-weight:850}.reportChallengeReadOnly{align-self:center}
.reportChallengeDays{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:7px;margin:14px 0 9px;padding:0}.reportChallengeDays li{position:relative;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;min-height:58px;padding:7px 8px;border:1px solid #3d4569;border-radius:12px;background:#20253b}.reportChallengeDays li>span{font-size:10px;color:#aeb6d3}.reportChallengeDays li>b{grid-row:2;font-size:15px;color:#fff}.reportChallengeDays li>i{grid-column:2;grid-row:1/3;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;font-style:normal;font-size:11px}.reportChallengeDays .is-success{border-color:#387966;background:#17372f}.reportChallengeDays .is-success>i{background:#53d7ad;color:#08251d}.reportChallengeDays .is-spent{border-color:#86515a;background:#3a2229}.reportChallengeDays .is-spent>i{background:#ff7c88;color:#351218}.reportChallengeDays .is-today{border-color:#ffd45b;box-shadow:inset 0 0 0 1px #ffd45b}.reportChallengeDays .is-today>i{background:#ffd45b;color:#332600}.reportChallengeDays .is-future>i{border:1px solid #59617d}.reportChallengeLegend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:-1px 0 9px;color:#c7cce0;font-size:10px;font-weight:750}.reportChallengeLegend .is-success{color:#7ce6c3}.reportChallengeLegend .is-spent{color:#ff9ba4}.reportChallengeLegend .is-today{color:#ffd45b}.reportChallengePercent{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;align-items:center;gap:10px;margin:13px 0 8px}.reportChallengePercent>b{font-size:22px;color:#ffd45b}.reportChallengePercent .reportChallengeTrack{margin:0}.reportChallengePercent>span{font-size:11px;color:#c7cce0;white-space:nowrap}
.reportChallengeDays li:after{content:"";grid-column:2;grid-row:1/3;display:grid;place-items:center;width:21px;height:21px;border:1px solid #59617d;border-radius:50%;font-size:11px}.reportChallengeDays .is-success:after{content:"✓";border-color:#53d7ad;background:#53d7ad;color:#08251d}.reportChallengeDays .is-spent:after{content:"−";border-color:#ff7c88;background:#ff7c88;color:#351218}.reportChallengeDays .is-today:after{content:"●";border-color:#ffd45b;background:#ffd45b;color:#332600}
.reportMonthNav :is(a,button,input):focus-visible,.reportChallenge :is(summary,input,button):focus-visible,.reportCockpit a:focus-visible{outline:3px solid var(--ab12-accent,#2563eb)!important;outline-offset:2px}
.reportFlash{border-radius:14px;padding:12px 14px;margin:10px 0;font-size:13px;font-weight:750;line-height:1.5}.reportFlash.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}.reportFlash.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}
.reportChallenge button{min-height:44px}.reportChallengeActions{align-self:center;min-width:0}.reportChallengeFormStatus{margin:8px 0 0!important;padding:8px 10px;border:1px solid #387966;border-radius:10px;background:#17372f;color:#9af0d3!important;font-size:11px!important;font-weight:750}.reportChallengeFormStatus.isError{border-color:#86515a;background:#3a2229;color:#ffabb3!important}
@media(max-width:899px){.reportMonthNav{top:calc(52px + env(safe-area-inset-top,0px));grid-template-columns:auto minmax(0,1fr) auto}.reportMonthNav>form{grid-column:2;grid-row:1}.reportMonthNav>.reportMonthArrow:first-child{grid-column:1;grid-row:1}.reportMonthNav>form+.reportMonthArrow{grid-column:3;grid-row:1}.reportMonthNav>a.reportMonthCurrent{grid-column:1/-1;grid-row:2;min-height:36px}.reportMonthNav>span.reportMonthCurrent{display:none}.reportMonthArrow span{display:none}.reportMonthArrow{min-width:44px}.reportCockpitGrid{grid-template-columns:1fr}.reportPace{border-right:0;border-bottom:1px solid #edf0f4;padding-bottom:15px}.reportChallenge{grid-template-columns:1fr}}
@media(min-width:900px){html body.abV22812Shell main.wrap.reportPageWrap,html body.abV22812Shell.abV5RemainingPage main.wrap{width:calc(100vw - var(--abNavW,238px) - 32px)!important;max-width:1280px!important;margin-left:auto!important;margin-right:auto!important}html body.abV22812Shell.abNavCollapsed main.wrap.reportPageWrap,html body.abV22812Shell.abV5RemainingPage.abNavCollapsed main.wrap{width:calc(100vw - var(--abNavCollapsed,72px) - 32px)!important}}
@media(max-width:520px){.reportMonthNav{padding:8px;gap:6px}.reportMonthNav form{grid-template-columns:minmax(0,1fr) auto}.reportMonthNav label span{display:none}.reportMonthNav a,.reportMonthNav button{padding:0 10px}.reportCockpit{padding:15px;border-radius:19px}.reportCockpitHead{align-items:flex-start}.reportCockpitHead>div{min-width:0}.reportCockpitHead a{flex:0 0 92px;max-width:92px;text-align:right;white-space:normal;line-height:1.35}.reportKpis,.reportCategoryBudget ul{grid-template-columns:1fr 1fr}.reportKpis>div{padding:11px}.reportKpis b{font-size:17px}.reportChallenge{padding:15px;border-radius:19px}.reportChallengeDays{gap:4px}.reportChallengeDays li{min-height:53px;padding:6px 5px}.reportChallengeDays li>i{width:18px;height:18px}.reportChallengePercent{grid-template-columns:auto 1fr}.reportChallengePercent>span{grid-column:1/-1}}
@media(max-width:360px){.reportKpis,.reportCategoryBudget ul{grid-template-columns:1fr}.reportChallenge label{grid-template-columns:minmax(0,1fr)}.reportChallengeToggle{grid-template-columns:auto minmax(0,1fr)!important}}
@media(prefers-reduced-motion:reduce){.reportGauge,.reportChallengeTrack i,.reportCategoryBudget li em{transition:none!important}}
`;
}

async function handleReportChallengeSave(request, env) {
  const inline = request.headers.get("x-accountbook-inline") === "1";
  const inlineError = (error, message, status, fallback) => inline
    ? jsonResponse({ ok: false, error, reason: error, message }, status)
    : redirectResponse(fallback);
  const userId = await verifyUserSession(request, env);
  if (!userId) return inlineError("session_required", "로그인이 만료되었습니다. 다시 로그인해 주세요.", 401, "/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = `/my/analysis?view=report&month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return inlineError("no_household", "이 가계부에 접근할 수 없습니다.", 404, "/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return inlineError("challenge_write_not_allowed", "챌린지 설정은 가계부 소유자·관리자만 변경할 수 있습니다.", 403, `${returnTo}&err=challenge_write_not_allowed#reportChallenge`);
  const targetDays = Math.round(Number(form.get("target_days") || 0));
  const title = String(form.get("title") || "").trim().replace(/\s+/g, " ").slice(0, 30);
  const challengeType = String(form.get("challenge_type") || "no_spend_days").trim();
  const targetAmount = Math.round(Number(form.get("target_amount") || 0));
  const category = String(form.get("category") || "").trim().replace(/\s+/g, " ").slice(0, 40);
  const startDate = String(form.get("start_date") || "").trim();
  const targetDate = String(form.get("target_date") || "").trim();
  const periodDays = challengePeriodDays(startDate, targetDate);
  const typeInvalid = !REPORT_CHALLENGE_TYPES.includes(challengeType);
  const amountInvalid = challengeType !== "no_spend_days" && (!Number.isInteger(targetAmount) || targetAmount < 1 || targetAmount > MAX_TRANSACTION_AMOUNT);
  const categoryInvalid = challengeType === "category_spend_limit_days" && !category;
  if (typeInvalid || amountInvalid || categoryInvalid || !Number.isInteger(targetDays) || targetDays < 1 || targetDays > 20 || title.length < 2 || !periodDays || periodDays > 90 || targetDays > periodDays) return inlineError("challenge_invalid", "이름·방식·기간·목표 일수와 한도 조건을 확인해 주세요. 목표 일수는 설정 기간보다 길 수 없습니다.", 422, `${returnTo}&err=challenge_invalid#reportChallenge`);
  const value = { schema_version: 2, type: challengeType, enabled: String(form.get("enabled") || "") === "1", target_days: targetDays, target_amount: challengeType === "no_spend_days" ? null : targetAmount, category: challengeType === "category_spend_limit_days" ? category : null, title, start_date: startDate, target_date: targetDate, updated_by: userId, updated_at: new Date().toISOString() };
  try {
    // V22.9.34 감사 S9: 챌린지 설정은 가계부 설정 잠금(가계부 삭제와 같은 잠금) 안에서 쓴다.
    // 따로 쓰던 잠금은 삭제와 직렬화되지 않아, 삭제 직후 도착한 저장이 지운 가계부의 설정을 되살렸다.
    await withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
      assertFresh();
      await saveSettingValue(env, reportChallengeSettingsKey(householdId), value);
    });
  } catch (err) {
    if (/settings_rmw_busy/.test(safeError(err))) return inlineError("challenge_busy", "다른 챌린지 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요.", 409, `${returnTo}&err=challenge_busy#reportChallenge`);
    rememberOpsEvent({ kind: "report_challenge_save_failed", severity: "warn", path: "/my/report-challenge/save", method: "POST", detail: safeError(err) });
    return inlineError("challenge_save_failed", "챌린지 설정을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요.", 503, `${returnTo}&err=challenge_save_failed#reportChallenge`);
  }
  if (!inline) return redirectResponse(`${returnTo}&msg=challenge_saved#reportChallenge`);
  try {
    const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const challenge = await buildReportChallengeForHousehold(env, { householdId, month, rows, value });
    return jsonResponse({
      ok: true,
      saved: true,
      message: "챌린지 설정을 저장했습니다.",
      challenge_html: renderReportChallenge(challenge, { householdId, canManage: true }),
    });
  } catch (err) {
    rememberOpsEvent({ kind: "report_challenge_refresh_failed", severity: "warn", path: "/my/report-challenge/save", method: "POST", detail: safeError(err) });
    return jsonResponse({ ok: true, saved: true, refresh_required: true, message: "설정은 저장했습니다. 다음 화면 이동 때 최신 진행률이 표시됩니다." });
  }
}
// @build:exports-start
export {
  buildReportChallenge, buildReportChallengeForHousehold, buildReportDashboardSummary,
  challengePeriodDays, getMyPageContext, handleReportChallengeSave, normalizeReportChallenge,
  renderReportChallenge, renderReportDashboard, renderReportMonthNavigator,
  reportChallengeSettingsKey, reportMonthHref, reportUxCss, shiftChallengeDate,
};
// @build:exports-end
