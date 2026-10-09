// @build:imports-start
import { appName } from "../public/site-config.js";
import { quickSmartInputController } from "../client/shared-input-parsers.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import { reserveDashboard } from "../settings/reserve-plans.js";
import {
  attachSpenderNames, fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
  fetchPostgrestRows, memberNameMap, renderSpenderOptions,
} from "../data/households-members-rows.js";
import { getSettingValue } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import { buildReportChallengeForHousehold, renderReportChallenge } from "./report-challenge.js";
import {
  renderReadableDailyTrend, renderWeekdayTrend, shiftMonthString, shortWonLabel,
} from "./analysis-page.js";
import {
  canWriteMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { activeSpenderExists, memberCanBeSpender } from "./transactions.js";
import {
  budgetCenterSummary, budgetSummary, fetchBudgets, fetchMobileHomeSettings,
} from "../domain/budgets.js";
import {
  applyHomeLayoutSection, homeLayoutKey, lastNDaysExpense, normalizeHomeLayout,
  renderHomeReportCards, renderHomeWeekStrip, renderV8TxCards, renderV8TxDayGroups, todayExpense,
} from "./home-sections.js";
import { categoryInitial } from "../web/quick-chip-icons.js";
import { MOBILE_HOME_CSS_ASSET_PATH } from "../assets/asset-registry.js";
import { renderMonthlySeriesChart } from "../admin/pc-analysis-calendar.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { addMonthsYm, percentChange } from "../domain/analytics.js";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENTS } from "../admin/dashboard-fragments.js";
import {
  formatMessage, isMissingCategory, isMissingPayment, mergedOptions,
} from "../kakao/reply-texts.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import {
  calculateStats, escapeHtml, nextMonthStart, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

function renderHomeCalendarSection(rows, month, baseQs = "", selectedDate = "") {
  const prevMonth = shiftMonthString(month, -1);
  const nextMonth = shiftMonthString(month, 1);
  const dayMap = {};
  for (const r of safeArray(rows)) {
    const d = r.transaction_date || "";
    if (!d) continue;
    dayMap[d] = dayMap[d] || { expense: 0, income: 0, count: 0 };
    if (r.type === "income") dayMap[d].income += Number(r.amount || 0);
    else dayMap[d].expense += Number(r.amount || 0);
    dayMap[d].count += 1;
  }
  const hh = baseQs ? `&${baseQs}` : "";
  const baseParams = new URLSearchParams(baseQs || "");
  const calendarHouseholdId = baseParams.get("household_id") || "";
  const monthHref = (m) => `/app?month=${encodeURIComponent(m)}${hh}&view=calendar#calendar`;
  const year = Number(month.slice(0, 4));
  const mon = Number(month.slice(5, 7));
  const daysInMonth = new Date(year, mon, 0).getDate();
  const firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
  const today = formatDate(nowKstDate());
  const weekHead = ["일", "월", "화", "수", "목", "금", "토"].map((w, i) => `<span class="calDow${i === 0 ? " sun" : i === 6 ? " sat" : ""}">${w}</span>`).join("");
  const blanks = Array.from({ length: firstDow }, () => `<span class="calDay blank"></span>`).join("");
  const cells = Array.from({ length: daysInMonth }, (_, i) => {
    const day = i + 1;
    const date = `${month}-${String(day).padStart(2, "0")}`;
    const dow = new Date(Date.UTC(year, mon - 1, day)).getUTCDay();
    const dayClass = `${dow === 0 ? " sun" : dow === 6 ? " sat" : ""}${today === date ? " isToday" : ""}`;
    const current = today === date ? ' aria-current="date"' : "";
    const v = dayMap[date];
    if (!v || !v.count) return `<span class="calDay noRec${dayClass}"${current}><b>${day}</b></span>`;
    const href = `/app?month=${encodeURIComponent(month)}${hh}&view=calendar&date=${encodeURIComponent(date)}&feed=all#feed`;
    return `<a class="calDay hasRec${selectedDate === date ? " sel" : ""}${dayClass}"${current} href="${escapeHtml(href)}" data-ab-day="${escapeHtml(date)}" data-ab-household-id="${escapeHtml(calendarHouseholdId)}" title="${escapeHtml(date)} 지출 ${numberWithCommas(v.expense)}원 · ${numberWithCommas(v.count)}건"><b>${day}</b><i class="calRecordDot" aria-hidden="true"></i>${v.expense ? `<strong>-${shortWonLabel(v.expense)}</strong>` : ""}${v.income ? `<em>+${shortWonLabel(v.income)}</em>` : ""}<small>${numberWithCommas(v.count)}건</small></a>`;
  }).join("");
  const clearHref = `/app?month=${encodeURIComponent(month)}${hh}&view=calendar#calendar`;
  const closeHref = `/app?month=${encodeURIComponent(month)}${hh}`;
  return `<section id="calendar" class="panel homeCalendar"><div class="calHead"><h2>${escapeHtml(month)} 캘린더</h2><a class="calClose" href="${escapeHtml(closeHref)}">닫기</a></div><div class="calNav"><a href="${escapeHtml(monthHref(prevMonth))}" aria-label="이전 달">← 이전달</a><b>${escapeHtml(month)}</b><a href="${escapeHtml(monthHref(nextMonth))}" aria-label="다음 달">다음달 →</a></div>${selectedDate ? `<div class="calSelected"><b>${escapeHtml(selectedDate)}</b> 기록을 아래 최근 내역에서 확인·수정하세요. <a href="${escapeHtml(clearHref)}">선택 해제</a></div>` : ""}<div class="calGrid calDows">${weekHead}</div><div class="calGrid">${blanks}${cells}</div><p class="calHint">날짜를 누르면 지출·수입 합계와 실제 거래 항목이 팝업으로 열립니다. 전체 기록 보기는 기존 날짜 필터 화면으로 연결되며, 기록이 없는 날은 배경 없이 간결하게 표시됩니다.</p></section>`;
}

function renderMobileV81Html({ title, month, households, selectedHousehold, members, rows, filteredRows = null, stats, prevStats = null, budgets, reservePlans = [], reserveLoaded = true, monthlyTrend = [], budget, recurring = [], meme = null, categoryOptions, paymentOptions, msg = "", err = "", mobileFeed = "10", mobileFilters = {}, focusTab = "home", txPage = 1, trendView = "", balert = "", homeView = "", calendarRows = null, reportChallenge = null, sessionRole = "admin", sessionUserId = "", isAdminSession = true, homeLayoutSetting = null, sharePrefill = "" }) {
  // 8.4: 저장된 홈 구성이 없거나 깨졌으면 기본 순서다. 이 폴백이 정상 경로다.
  const homeLayout = normalizeHomeLayout(homeLayoutSetting);
  const roleLower = String(sessionRole || "").toLowerCase();
  const appIsManager = isAdminSession || ["owner", "admin"].includes(roleLower);
  const appCanWrite = isAdminSession || canWriteMyHousehold(roleLower);
  const appCanEditRow = (r) => appIsManager || (appCanWrite && sessionUserId && String(r.user_id || "") === String(sessionUserId));
  const householdId = selectedHousehold?.id || "";
  const filterType = mobileFilters.type === "income" ? "income" : mobileFilters.type === "expense" ? "expense" : "all";
  const filterQ = String(mobileFilters.q || "").trim();
  const filterQuality = ["missing_any", "missing_category", "missing_payment", "kakao_only", "web_only"].includes(String(mobileFilters.quality || "")) ? String(mobileFilters.quality) : "all";
  const filterDate = isValidTransactionDateString(mobileFilters.date || "") ? String(mobileFilters.date) : "";
  const filterCategory = String(mobileFilters.category || "").trim();
  const filterPayment = String(mobileFilters.payment_method || "").trim();
  const appParams = new URLSearchParams();
  appParams.set("month", month);
  if (householdId) appParams.set("household_id", householdId);
  if (filterType !== "all") appParams.set("type", filterType);
  if (filterQ) appParams.set("q", filterQ);
  if (filterQuality !== "all") appParams.set("quality", filterQuality);
  if (filterDate) appParams.set("date", filterDate);
  if (filterCategory) appParams.set("category", filterCategory);
  if (filterPayment) appParams.set("payment_method", filterPayment);
  if (homeView === "calendar") appParams.set("view", "calendar");
  const baseAppPath = `/app?${appParams.toString()}`;
  const resetAppPath = `/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  const hasMobileFilter = filterType !== "all" || filterQ || filterQuality !== "all" || filterDate || filterCategory || filterPayment;
  const feedMode = mobileFeed === "all" ? "all" : mobileFeed === "30" ? "30" : "10";
  const currentPath = `${baseAppPath}${feedMode !== "10" ? `&feed=${encodeURIComponent(feedMode)}` : ""}`;
  const feedSource = Array.isArray(filteredRows) ? filteredRows : rows;
  const feedLimit = feedMode === "all" ? feedSource.length : feedMode === "30" ? 30 : 10;
  const feedRows = feedSource.slice(0, feedLimit).map((row) => ({ ...row, __spenderMembers: members, __canEditSpender: appIsManager }));
  const todayStr = formatDate(nowKstDate());
  const todaySpend = rows.filter((r) => r.type !== "income" && String(r.transaction_date || "") === todayStr).reduce((a, r) => a + Number(r.amount || 0), 0);
  const isCurrentMonth = todayStr.slice(0, 7) === month;
  // 서버 기본값은 이미 이번 달이다(validMonth(...) || currentMonthKst()).
  // 문제는 URL 에 month 가 한 번 박히면 앱 내부 링크가 그 달을 계속 물고 다니는 것이라
  // 되돌아올 길만 만들어 준다. 서버가 특정 달로 리다이렉트하게 만들지는 않는다(공유링크가 깨진다).
  const appCurrentMonth = currentMonthKst();
  const backToCurrentMonthParams = new URLSearchParams(appParams);
  backToCurrentMonthParams.set("month", appCurrentMonth);
  const backToCurrentMonthPath = `/app?${backToCurrentMonthParams.toString()}`;
  const monthAwayLabel = month < appCurrentMonth ? "지난달 보는 중" : "다음 달 보는 중";
  const monthAwayHtml = isCurrentMonth
    ? ""
    : `<div class="appMonthAway"><span class="appMonthAwayBadge">${escapeHtml(monthAwayLabel)}</span><a class="appMonthAwayGo" href="${escapeHtml(backToCurrentMonthPath)}">이번 달로 이동</a></div>`;
  const daysInThisMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const remainDays = isCurrentMonth ? Math.max(1, daysInThisMonth - Number(todayStr.slice(8, 10)) + 1) : 0;
  const remainBudgetAmt = Math.max(0, Number(budget.totalBudget || 0) - Number(budget.budgetedExpense ?? budget.expense ?? 0));
  const dailyAllowanceAmt = (isCurrentMonth && budget.totalBudget) ? Math.floor(remainBudgetAmt / remainDays) : 0;
  const todayOk = dailyAllowanceAmt ? todaySpend <= dailyAllowanceAmt : true;
  // V22.8.88 통합 작업지시서 M3(하루 환산). 계산은 이미 위에 있었다 — remainDays 는
  // 오늘을 포함하고(8월 8일이면 24일) Math.max(1,…) 로 묶여 있어 마지막 날에도 0으로
  // 나누지 않는다. 없던 것은 그 값을 사람에게 보여 주는 자리였다. 지금까지 이 숫자는
  // "오늘 쓴 돈"의 글자색을 고르는 데만 쓰이고 화면에 나온 적이 없다.
  // 새 질의는 없다 — budget 과 rows 는 이미 위에서 받아 둔 값이다.
  const budgetOverAmt = Math.max(0, Number(budget.budgetedExpense ?? budget.expense ?? 0) - Number(budget.totalBudget || 0));
  // 지금까지의 하루 평균. 지난달을 보고 있으면 그 달 전체로 나눈다.
  const paceDay = isCurrentMonth ? Math.max(1, Number(todayStr.slice(8, 10))) : daysInThisMonth;
  const paceDaily = Math.round(Number(budget.budgetedExpense ?? budget.expense ?? 0) / paceDay);
  // 이 속도를 유지하면 예산은 며칠째에 바닥나는가. 달 끝보다 이르면 그 차이를 말한다.
  const paceEndDay = paceDaily > 0 && budget.totalBudget ? Math.floor(Number(budget.totalBudget) / paceDaily) : 0;
  const paceDaysEarly = paceEndDay > 0 ? daysInThisMonth - paceEndDay : 0;
  const paceLeftover = budget.totalBudget ? Number(budget.totalBudget) - (paceDaily * daysInThisMonth) : 0;
  const dailyPlanNote = paceDaily > dailyAllowanceAmt && paceDaysEarly > 0
    ? `지금 속도라면 ${paceDaysEarly}일 먼저 끝납니다`
    : paceDaily <= dailyAllowanceAmt && paceLeftover > 0
      ? `이 속도면 ${numberWithCommas(paceLeftover)}원이 남습니다`
      : "";
  // 네 갈래: 예산 없음 · 초과 · 지난달(남은 일수가 성립하지 않음) · 정상.
  const dailyPlanHtml = !Number(budget.totalBudget || 0)
    ? `<div class="homeDailyPlan homeDailyPlanEmpty"><a href="${escapeHtml(`/budgets?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`)}">예산을 설정하면 하루 기준이 생겨요</a></div>`
    : budgetOverAmt > 0
      ? `<div class="homeDailyPlan homeDailyPlanOver"><b>이번 달 예산을 ${numberWithCommas(budgetOverAmt)}원 넘겼어요</b></div>`
      : !isCurrentMonth
        ? ""
        : `<div class="homeDailyPlan"><span>남은 ${remainDays}일 동안</span><b>하루 <span data-ab-num="${dailyAllowanceAmt}" data-ab-num-unit="원">${numberWithCommas(dailyAllowanceAmt)}</span>원</b>${dailyPlanNote ? `<small>${escapeHtml(dailyPlanNote)}</small>` : ""}</div>`;
  const freqMap = {};
  for (const r of rows) {
    if (r.type === "income") continue;
    const label = String(r.memo || r.raw_text || "").trim().slice(0, 12);
    if (!label) continue;
    const key = label.toLowerCase();
    if (!freqMap[key]) freqMap[key] = { label, category: r.category || "", payment: r.payment_method || "", count: 0 };
    freqMap[key].count += 1;
    if (r.category) freqMap[key].category = r.category;
    if (r.payment_method) freqMap[key].payment = r.payment_method;
  }
  const freqChips = Object.values(freqMap).filter((c) => c.count >= 2).sort((a, b) => b.count - a.count).slice(0, 6);
  const defaultChips = [
    { label: "점심", category: "외식", payment: "" },
    { label: "커피", category: "카페/간식", payment: "" },
    { label: "쿠팡", category: "쇼핑", payment: "" },
    { label: "병원", category: "의료/병원", payment: "" },
    { label: "마트", category: "장보기", payment: "" },
  ];
  const inputChips = (freqChips.length >= 3 ? freqChips : defaultChips).map((c) => `<button type="button" data-memo="${escapeHtml(c.label)}" data-cat="${escapeHtml(c.category || "")}" data-pay="${escapeHtml(c.payment || "")}">${escapeHtml(c.label)}${c.count ? `<em>${numberWithCommas(c.count)}</em>` : ""}</button>`).join("");
  const payFreq = {};
  for (const r of rows) { const pm = String(r.payment_method || "").trim(); if (pm) payFreq[pm] = (payFreq[pm] || 0) + 1; }
  const payChips = Object.entries(payFreq).sort((a, b) => b[1] - a[1]).slice(0, 4).map(([pm]) => `<button type="button" data-pay-only="${escapeHtml(pm)}">${escapeHtml(pm)}</button>`).join("");
  const feedLabel = feedMode === "all" ? `전체 ${feedSource.length}건` : `최근 ${Math.min(feedLimit, feedSource.length)}건`;
  const feedLinks = `<div class="feedControls"><span>${escapeHtml(feedLabel)} 표시 중${hasMobileFilter ? ` · 필터 적용 ${numberWithCommas(feedSource.length)}건` : ""}</span><a class="${feedMode === "10" ? "active" : ""}" href="${escapeHtml(baseAppPath)}#feed">최근 10건</a><a class="${feedMode === "30" ? "active" : ""}" href="${escapeHtml(`${baseAppPath}&feed=30`)}#feed">최근 30건</a><a class="${feedMode === "all" ? "active" : ""}" href="${escapeHtml(`${baseAppPath}&feed=all`)}#feed">전체 조회</a></div>`;
  // ── 일/주/월 트렌드 토글 (P3-⑧) ────────────────────────────────────
  // 세 렌더 함수는 호출만 한다(내부 로직 변경 금지). 서버가 셋 다 그려 두고
  // JS 는 보이기/숨기기만 한다 — 스크립트가 막혀도 일별은 보인다.
  const trendDrillBase = `/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  // 셋을 다 미리 그리면 홈 HTML 이 28KB 늘어 예산(46KiB)을 넘는다(일별만 21.5KB).
  // 그래서 JS show/hide 대신 서버측 링크 전환으로 한 번에 하나만 그린다.
  // 덤으로 스크립트 없이도 동작하고, 일별은 고른 사람만 그 비용을 낸다.
  const trendTabPath = (key) => {
    const params = new URLSearchParams(appParams);
    params.set("trend", key);
    return `/app?${params.toString()}#homeTrend`;
  };
  const trendTabs = [["daily", "일별"], ["weekly", "주별"], ["monthly", "월별"]]
    .map(([key, label]) => trendView === key
      ? `<span class="homeTrendOn" aria-current="true">${label}</span>`
      : `<a href="${escapeHtml(trendTabPath(key))}">${label}</a>`)
    .join("");
  const trendBody = trendView === "daily"
    ? renderReadableDailyTrend(rows, month, trendDrillBase)
    : trendView === "monthly"
      ? renderMonthlySeriesChart(monthlyTrend)
      : trendView === "weekly"
        ? renderWeekdayTrend(rows)
        : `<p class="homeTrendHint">보고 싶은 기간을 고르면 그래프가 열립니다.</p>`;
  const homeTrendHtml = `<div class="homeTrend" id="homeTrend"><div class="homeTrendSeg">${trendTabs}</div><div class="homeTrendPanel">${trendBody}</div></div>`;

  // ── 수입 대비 사용률 게이지 (P3-①) ─────────────────────────────────
  // '오늘 써도 되는 돈'(일일한도) 자리를 대신한다. 분모는 예산이 아니라 이번 달 수입이다.
  const usageIncome = Math.max(0, Number(stats.totals?.income || 0));
  const usageExpense = Math.max(0, Number(stats.totals?.expense || 0));
  const usageRate = usageIncome > 0 ? Math.round(usageExpense / usageIncome * 100) : 0;
  const usageBar = Math.max(0, Math.min(100, usageRate));
  const usageState = usageRate > 100 ? "isOver" : usageRate >= 85 ? "isWarn" : "";
  const incomeUsageHtml = usageIncome > 0
    ? `<div class="homeUsage ${usageState}"><span><b>수입 대비 사용</b><em>${numberWithCommas(usageRate)}%</em></span><div class="abNavBudgetTrack" role="progressbar" aria-label="수입 대비 사용률" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${usageBar}"><i style="width:${usageBar}%"></i></div><small><b>${numberWithCommas(usageExpense)}원</b> / ${numberWithCommas(usageIncome)}원</small></div>`
    : `<div class="homeUsage isEmpty"><span><b>수입 대비 사용</b></span><small>수입을 입력하면 사용률이 표시돼요</small></div>`;

  // ── 정기 수입·지출 진입 요약 (P1-A) ──────────────────────────────────
  // 홈에 박혀 있던 고정지출 입력폼을 걷어내고 /reserve-plans 로 보내는 카드만 남긴다.
  // 집계는 기존 reserveDashboard 를 호출만 한다(로직 변경 없음).
  const homeReserve = reserveDashboard(reservePlans);
  const homeReserveCount = safeArray(reservePlans).length;
  const homeReserveHref = `/reserve-plans?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  // 정기항목은 이번 달을 볼 때만 불러온다(과거 달에서 질의를 늘리지 않으려는 기존 판단).
  // 안 불러온 달에서 "없음" 이라고 말하면 거짓이 되므로 건수를 단정하지 않는다.
  const homeReserveHeadline = !reserveLoaded
    ? "이번 달 기준으로 관리해요"
    : homeReserveCount
      ? `${numberWithCommas(homeReserveCount)}건 · 매월 ${numberWithCommas(homeReserve.monthlyReserveTotal)}원 준비`
      : "아직 등록한 항목이 없어요";
  const homeReserveSub = !reserveLoaded
    ? "세금·보험처럼 큰돈이 나가는 달을 미리 준비합니다"
    : homeReserveCount
      ? (homeReserve.upcoming.length ? `준비 알림 ${numberWithCommas(homeReserve.upcoming.length)}건` : "다가오는 납부 없음")
      : "세금·보험처럼 큰돈이 나가는 달을 미리 준비하세요";
  const homeReserveCard = `<a class="homeReserveCard" href="${escapeHtml(homeReserveHref)}"><div class="homeReserveCopy"><span class="homeReserveEyebrow">정기 수입·지출</span><b>${escapeHtml(homeReserveHeadline)}</b><small>${escapeHtml(homeReserveSub)}</small></div><span class="homeReserveGo" aria-hidden="true">관리 →</span></a>`;

  // ── 거래내역 전용 탭 (tab=transactions) ────────────────────────────────
  // 새 라우트를 만들지 않고 같은 함수 안에서 갈라진다. 서버 필터는 홈과 공유하는
  // filterMobileTransactionRows 결과(feedSource)를 그대로 쓰고 로직을 건드리지 않는다.
  const txAll = feedSource;
  const txPageSize = 50;
  const txTotalPages = Math.max(1, Math.ceil(txAll.length / txPageSize));
  const txCurrentPage = Math.min(Math.max(1, Number(txPage) || 1), txTotalPages);
  const txStart = (txCurrentPage - 1) * txPageSize;
  const txRows = txAll.slice(txStart, txStart + txPageSize).map((row) => ({ ...row, __spenderMembers: members, __canEditSpender: appIsManager }));
  const txPagePath = (page) => {
    const params = new URLSearchParams(appParams);
    params.set("tab", "transactions");
    if (page > 1) params.set("page", String(page));
    return `/app?${params.toString()}`;
  };
  // 분류는 자유 입력(datalist)과 함께 select 도 제공한다. 모바일과 카카오 파서
  // 양쪽에서 고르는 편이 확실하다.
  const txCategorySelect = `<label class="txPickLabel"><span>분류로 보기</span><select name="category">${[`<option value="">분류 전체</option>`, ...categoryOptions.map((name) => `<option value="${escapeHtml(name)}"${normalizeText(name) === normalizeText(filterCategory) ? " selected" : ""}>${escapeHtml(name)}</option>`)].join("")}</select></label>`;
  const txSums = txAll.reduce((acc, r) => {
    if (r.type === "income") acc.income += Number(r.amount || 0);
    else acc.expense += Number(r.amount || 0);
    return acc;
  }, { income: 0, expense: 0 });
  const txPager = txTotalPages > 1
    ? `<nav class="txPager" aria-label="거래내역 페이지">${txCurrentPage > 1 ? `<a href="${escapeHtml(txPagePath(txCurrentPage - 1))}">‹ 이전</a>` : `<span aria-disabled="true">‹ 이전</span>`}<b>${txCurrentPage} / ${txTotalPages}</b>${txCurrentPage < txTotalPages ? `<a href="${escapeHtml(txPagePath(txCurrentPage + 1))}">다음 ›</a>` : `<span aria-disabled="true">다음 ›</span>`}</nav>`
    : "";

  const mobileFilterForm = `<form class="mobileFilterForm" method="get" action="/app"><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/>${homeView === "calendar" ? `<input type="hidden" name="view" value="calendar"/>` : ""}<input name="q" value="${escapeHtml(filterQ)}" placeholder="내용 검색: 커피, 병원, 카드"/><div class="filterQuick"><select name="type"><option value="all"${filterType === "all" ? " selected" : ""}>수입·지출 전체</option><option value="expense"${filterType === "expense" ? " selected" : ""}>지출만</option><option value="income"${filterType === "income" ? " selected" : ""}>수입만</option></select><select name="quality"><option value="all"${filterQuality === "all" ? " selected" : ""}>정리상태 전체</option><option value="missing_any"${filterQuality === "missing_any" ? " selected" : ""}>정리 필요</option><option value="missing_category"${filterQuality === "missing_category" ? " selected" : ""}>미분류</option><option value="missing_payment"${filterQuality === "missing_payment" ? " selected" : ""}>결제수단 미입력</option></select></div><details class="filterAdvanced" ${filterDate || filterCategory || filterPayment ? "open" : ""}><summary>날짜·분류·결제수단 상세 필터</summary><div class="filterAdvancedGrid"><input type="date" name="date" value="${escapeHtml(filterDate)}"/><input name="category" list="categoryList" value="${escapeHtml(filterCategory)}" placeholder="분류"/><input name="payment_method" list="paymentList" value="${escapeHtml(filterPayment)}" placeholder="결제수단"/></div></details><div class="filterQuick"><button type="submit">검색 적용</button><a href="${escapeHtml(resetAppPath)}#feed">필터 초기화</a></div></form>`;

  // 필터를 걸어도 거래내역 탭에 남아 있어야 한다(tab hidden). 분류 select 도 얹는다.
  const txFilterForm = mobileFilterForm
    .replace('action="/app">', 'action="/app"><input type="hidden" name="tab" value="transactions"/>')
    .replace('<details class="filterAdvanced"', `${txCategorySelect}<details class="filterAdvanced"`)
    .replace(`href="${escapeHtml(resetAppPath)}#feed"`, `href="${escapeHtml(`${resetAppPath}&tab=transactions`)}"`);
  // V22.8.92 (7.2): 자주 쓰는 필터는 한 줄 칩 바로 먼저 보이고, 나머지 조건은
  // 접어 둔다. 그리드 폼 하나만 두면 390px 에서 가로로 넘쳤다. 칩은 GET 링크라
  // JS 가 없어도 그대로 동작하고, 접힌 폼 안에 기존 조건이 전부 남는다.
  const txChipPath = (patch) => {
    const base = { type: filterType, quality: filterQuality, ...patch };
    const params = new URLSearchParams();
    params.set("month", month);
    if (householdId) params.set("household_id", householdId);
    params.set("tab", "transactions");
    if (filterQ) params.set("q", filterQ);
    if (filterDate) params.set("date", filterDate);
    if (filterCategory) params.set("category", filterCategory);
    if (filterPayment) params.set("payment_method", filterPayment);
    if (base.type && base.type !== "all") params.set("type", base.type);
    if (base.quality && base.quality !== "all") params.set("quality", base.quality);
    return `/app?${params.toString()}`;
  };
  const txChipBar = `<nav class="txChipBar" aria-label="거래내역 빠른 필터">${[
    ["전체", { type: "all", quality: "all" }, filterType === "all" && filterQuality === "all"],
    ["지출만", { type: "expense" }, filterType === "expense"],
    ["수입만", { type: "income" }, filterType === "income"],
    ["정리 필요", { quality: "missing_any" }, filterQuality === "missing_any"],
    ["미분류", { quality: "missing_category" }, filterQuality === "missing_category"],
    ["결제수단 미입력", { quality: "missing_payment" }, filterQuality === "missing_payment"],
  ].map(([label, patch, on]) => `<a class="txChip${on ? " isOn" : ""}" href="${escapeHtml(txChipPath(patch))}"${on ? ` aria-current="true"` : ""}>${escapeHtml(label)}</a>`).join("")}</nav>`;
  const txViewHtml = `<section class="txTabHead" data-count="${txAll.length}" data-income="${txSums.income}" data-expense="${txSums.expense}"><div><h2>거래내역</h2><p>${numberWithCommas(txAll.length)}건${hasMobileFilter ? " · 필터 적용" : ""} · 수입 ${numberWithCommas(txSums.income)}원 · 지출 ${numberWithCommas(txSums.expense)}원</p></div><a class="txTabHome" href="${escapeHtml(resetAppPath)}">홈으로</a></section>${txChipBar}<section class="txTabFilter"><details class="txFilterMore"${hasMobileFilter ? " open" : ""}><summary>날짜 · 분류 · 결제수단 · 검색어로 좁히기</summary>${txFilterForm}<input id="v8Search" placeholder="이 페이지에서 빠른 검색"/></details></section><section class="txTabList">${txRows.length ? `<div id="v8Feed">${renderV8TxDayGroups(txRows, `${currentPath}&tab=transactions`, appCanEditRow)}</div>` : `<div class="empty">조건에 맞는 기록이 없습니다. 필터를 지우면 전체가 보입니다.</div>`}${txPager}</section>`;
  const hidden = `<input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="return_to" value="${escapeHtml(currentPath)}"/>`;
  const today = formatDate(nowKstDate());
  const quickInputDate = filterDate || today;
  const calendarBaseQs = householdId ? `household_id=${encodeURIComponent(householdId)}` : "";
  const homeCalendarHtml = homeView === "calendar"
    ? renderHomeCalendarSection(calendarRows || rows, month, calendarBaseQs, filterDate)
    : `<div class="homeCalendarToggle"><a href="${escapeHtml(`/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}&view=calendar`)}#calendar">📅 캘린더</a></div>`;
  const totalBudgetRow = budgets.find((b) => b.category === "__total");
  const activeSpenders = safeArray(members).filter(memberCanBeSpender);
  const defaultSpenderId = sessionUserId && activeSpenderExists(activeSpenders, sessionUserId) ? sessionUserId : (activeSpenders.length === 1 ? String(activeSpenders[0]?.user_id || "") : "");
  const spenderOptions = renderSpenderOptions(members, defaultSpenderId, "지출자 선택");
  const todaySpent = todayExpense(rows);
  const weekSpent = lastNDaysExpense(rows, 7);
  const budgetCenter = budgetCenterSummary(rows, budgets);
  const budgetTotal = Number(budgetCenter.totalBudget || 0);
  // 분류별 예산만 잡은 달에는 그 분류들의 지출만 견준다(budgetSummary 와 같은 기준).
  const budgetUsed = Number(budget.budgetedExpense ?? stats.totals.expense ?? 0);
  const budgetRemaining = budgetTotal ? Math.max(0, budgetTotal - budgetUsed) : Number(stats.totals.balance || 0);
  const budgetPercent = budgetTotal ? Math.round((budgetUsed / budgetTotal) * 100) : 0;
  // 막대 너비는 100%에서 멈추지만 표기 숫자는 실제 사용률을 그대로 보여준다.
  // 둘을 같은 값으로 쓰면 207% 초과 지출이 홈에서 100%로 보여 초과 사실이 가려진다.
  const budgetBarPercent = Math.max(0, Math.min(100, budgetPercent || 0));
  const displayBudgetPercent = Math.max(0, budgetPercent || 0);
  // 게이지는 100% 에서 멈추므로, 100% 와 384% 가 화면에서 똑같이 "가득 찬 막대"다.
  // 색까지 강조색이면 예산을 4배 쓴 달과 딱 맞춘 달이 구별되지 않는다 — 실제로
  // 384% 인 화면이 성공색으로 가득 차 있었고, 바로 아래 빨간 글씨는 "넘겼어요"라고
  // 말하고 있었다. 색이 글자와 반대말을 하면 사람은 색을 믿는다. 상태를 붙인다.
  const budgetGaugeState = !budgetTotal ? "" : budgetPercent > 100 ? " isOver" : budgetPercent >= 85 ? " isWarn" : "";
  // V22.8.93 (9.5): 퍼센트는 **비율**로 넘긴다. Intl 의 percent 스타일이 다시 100을
  // 곱하므로 26 을 넘기면 2,600% 가 된다. 화면 글자는 서버가 이미 완성해 두었고
  // (9.3), 이 값은 스크립트가 값을 굴릴 때만 쓰인다.
  const budgetUsedRatio = Math.round(Math.max(0, budgetPercent || 0)) / 100;
  // V22.8.93 (8.2): 저장하고 돌아온 화면에서 게이지가 **이전 값에서 출발해** 실제
  // 값으로 움직인다. 이전 값은 방금 저장한 기록을 사용액에서 빼면 나온다 — 새 질의도,
  // 쓰기 경로 변경도 필요 없다. 저장 직후가 아니거나 예산이 없으면 속성을 달지 않고,
  // 그때 게이지는 지금처럼 처음부터 실제 값에 있다.
  // V22.8.94 (8.4): 홈 구성. 설정이 없으면 기본 순서로 그린다 — 이 폴백이 정상
  // 경로다(설정 화면을 한 번도 연 적 없는 계정이 대다수).
  const homeLayoutHref = `/home-layout?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
  const homeShortcutParts = {
    add: `<a href="#add"><b>입력</b><span>바로 기록</span></a>`,
    budgets: `<a href="/budgets?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><b>예산</b><span>남은 돈</span></a>`,
    "reserve-plans": `<a href="/reserve-plans?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><b>정기 수입·지출</b><span>세금·보험</span></a>`,
    "smart-tools": `<a href="/smart-tools?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><b>스마트</b><span>무료 도구</span></a>`,
    categories: `<a href="/categories?household_id=${encodeURIComponent(householdId)}"><b>분류</b><span>키워드</span></a>`,
    menu: `<a href="/menu?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><b>전체</b><span>메뉴</span></a>`,
  };
  const homeShortcutsInner = applyHomeLayoutSection(homeLayout.shortcuts, homeShortcutParts);
  const homeShortcutCount = safeArray(homeLayout.shortcuts?.order).filter((id) => !safeArray(homeLayout.shortcuts?.hidden).includes(id)).length;
  // 바로가기를 전부 꺼도 "홈 구성"으로 돌아갈 길은 남긴다. 길이 없으면 되돌릴 수 없다.
  // V22.8.96 (3장 P3 · M2): 바로가기는 **접기 한 곳**에 모은다. 카드로 펼쳐 두면
  // 홈의 답(P0)과 기록 사이에 진입점 여섯 개가 탭 정지점으로 끼어든다. 접어 두면
  // 정지점이 하나가 되고, 열면 그대로 여섯 개가 나온다 — 도달성은 그대로다.
  // <details> 는 JS 없이 열린다.
  const homeShortcutsHtml = homeShortcutsInner
    ? `<details class="homeQuickFold"><summary><b>바로가기</b><span>${escapeHtml(String(homeShortcutCount))}곳</span></summary><nav class="homeQuick">${homeShortcutsInner}</nav></details>`
    : `<nav class="homeQuick homeQuickEmpty"><a href="${escapeHtml(homeLayoutHref)}"><b>홈 구성</b><span>바로가기 다시 켜기</span></a></nav>`;
  const homeJustSaved = ["added", "created", "updated"].includes(String(msg || ""));
  const homeNewestRow = homeJustSaved
    ? safeArray(rows).filter((r) => r.type !== "income").sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))[0]
    : null;
  const homeCountsToward = homeNewestRow && (budget.basis !== "category"
    || safeArray(budget.categoryAlerts).some((item) => normalizeText(item.category) === normalizeText(homeNewestRow.category || "기타")));
  const homePrevUsed = homeCountsToward ? Math.max(0, budgetUsed - Number(homeNewestRow.amount || 0)) : null;
  const homePrevBarAttr = budgetTotal && homePrevUsed !== null && homePrevUsed !== budgetUsed
    ? ` data-ab-prev-used="${Math.max(0, Math.min(100, Math.round((homePrevUsed / budgetTotal) * 100)))}"`
    : "";
  // V22.8.89 통합 작업지시서 M4. "자세히"는 접힌 채로도 무엇이 들어가는지 보여야 한다.
  // 접힌 헤더가 비어 있으면 열어 보기 전에는 날짜가 오늘인지 어제인지 알 수 없고,
  // 그러면 접는 것이 위험해진다. 서버가 기본값으로 첫 요약을 만들고, 값이 바뀌면
  // 클라이언트가 같은 형식으로 갱신한다.
  const quickDefaultSpender = safeArray(members).find((m) => String(m.user_id || "") === String(sessionUserId));
  const quickMoreSummaryText = [
    quickInputDate === formatDate(nowKstDate()) ? "오늘" : quickInputDate,
    quickDefaultSpender ? (quickDefaultSpender.display_name || quickDefaultSpender.name || "나") : "지출자 선택",
  ].filter(Boolean).join(" · ");
  // 저장 버튼 아래 한 줄. 누르기 전에 결과가 보여야 한다는 것이 M4 의 요구였다.
  // 금액을 아직 적지 않았으면 "저장하면"이라고 말할 수 없으므로 현재 값을 그대로 말한다.
  // JS 가 없어도 이 문장은 참이고, 금액을 적으면 클라이언트가 뺀 값으로 바꿔 쓴다.
  let quickBudgetScope = JSON.stringify([Number(formatDate(nowKstDate()).replace(/-/g,"")),budget.basis==="category" ? budget.categoryAlerts.map(row=>row.category) : 0]);
  if (new TextEncoder().encode(quickBudgetScope).length > 96) quickBudgetScope = JSON.stringify([Number(formatDate(nowKstDate()).replace(/-/g,"")),false]);
  const quickAfterBaseText = budgetTotal
    ? `남은 예산 ${numberWithCommas(budgetRemaining)}원${dailyAllowanceAmt ? ` · 하루 ${numberWithCommas(dailyAllowanceAmt)}원` : ""}`
    : "예산을 설정하면 저장 후 남는 돈이 함께 보여요";
  const firstRecordDone = rows.length > 0;
  const onboardingDone = 1 + (firstRecordDone ? 1 : 0);
  const onboardingHtml = `<section class="homeOnboarding" data-household-id="${escapeHtml(householdId || "default")}" data-first-record="${firstRecordDone ? "1" : "0"}" aria-labelledby="homeOnboardingTitle"><div class="homeOnboardingHead"><div><h2 id="homeOnboardingTitle">첫 사용 3단계</h2><p class="muted">필수 흐름만 끝낸 뒤 예산·자산 설정은 필요할 때 추가하세요.</p></div><span>${onboardingDone}/3 완료</span></div><div class="homeOnboardingSteps"><div class="homeOnboardingStep done"><b>1. 가계부 준비</b><small>${escapeHtml(selectedHousehold?.name || "가계부")} 선택 완료</small></div><div class="homeOnboardingStep ${firstRecordDone ? "done" : "current"}"><b>2. 첫 기록</b><small>${firstRecordDone ? "첫 기록 완료" : "한 줄로 지출을 남겨보세요"}</small>${firstRecordDone ? "" : `<a href="#add">기록하러 가기 →</a>`}</div><div class="homeOnboardingStep ${firstRecordDone ? "current" : ""}"><b>3. 저장 결과 확인</b><small>${firstRecordDone ? "최근 기록에서 금액·내용을 확인하세요" : "첫 기록을 저장하면 확인할 수 있어요"}</small>${firstRecordDone ? `<a href="#feed" data-onboarding-result-check>최근 기록 확인 →</a>` : ""}</div></div></section>`;
  const reserveInfo = reserveDashboard(reservePlans || []);
  const topCatsForHome = stats.categories.filter((c) => c.expense > 0).slice(0, 4);
  const topCatTotal = Number(stats.totals.expense || 0) || 1;
  const mobileMemberNames = memberNameMap(members);
  const homeTimeline = rows.slice(0, 6).map((r) => {
    const isIncome = r.type === "income";
    const icon = categoryInitial(r.category, r.type);
    const dateText = r.transaction_date === today ? "오늘" : String(r.transaction_date || "").slice(5).replace("-", "월 ") + (r.transaction_date ? "일" : "");
    const spenderName = r.user_id ? (mobileMemberNames[String(r.user_id)] || "이전 참여자") : "미지정";
    const content = `<div class="homeTxLeft"><div class="homeIcon">${icon}</div><div><b>${escapeHtml(r.memo || r.raw_text || r.category || "기록")}</b><span>${escapeHtml(dateText)} · ${escapeHtml(r.category || (isIncome ? "수입" : "지출"))} · ${isIncome ? "수입자" : "지출자"} ${escapeHtml(spenderName)}</span></div></div><div class="homeTxAmt ${isIncome ? "income" : "expense"}">${isIncome ? "+" : "-"}${numberWithCommas(r.amount)}원<small>${escapeHtml(r.payment_method || "")}</small></div>`;
    if (!appCanEditRow(r)) return `<div class="homeTx">${content}</div>`;
    return `<button class="homeTx" type="button" onclick="openEdit('${escapeHtml(r.id)}')" aria-label="${escapeHtml(r.memo || r.raw_text || r.category || "기록")} 수정하기">${content}</button>`;
  }).join("") || `<p class="homeEmpty">아직 이번 달 기록이 없습니다. 아래 빠른 입력으로 첫 기록을 남겨보세요.</p>`;
  const homeBars = topCatsForHome.map((c, idx) => {
    const pct = Math.round((Number(c.expense || 0) / topCatTotal) * 100);
    return `<div class="homeBarRow"><div><b>${escapeHtml(c.category)}</b><span>${pct}% · ${numberWithCommas(c.expense)}원</span></div><div class="homeBar"><i class="bar${idx % 4}" style="width:${Math.max(4, pct)}%"></i></div></div>`;
  }).join("") || `<p class="homeEmpty">카테고리 분석은 지출을 기록하면 표시됩니다.</p>`;
  const mainNotice = budgetTotal && budgetPercent >= 100
    ? `전체 예산을 ${budgetPercent}% 사용했습니다. 오늘부터 지출을 줄이는 게 좋아요.`
    : budgetTotal && budgetPercent >= 85
      ? `전체 예산의 ${budgetPercent}%를 사용했습니다. 남은 예산은 ${numberWithCommas(budgetRemaining)}원입니다.`
      : reserveInfo.upcoming.length
        ? `${reserveInfo.upcoming[0].plan.name} 납부가 ${reserveInfo.upcoming[0].days_left}일 남았습니다. 월 ${numberWithCommas(reserveInfo.upcoming[0].monthly_reserve)}원씩 준비하세요.`
        : budgetTotal
          ? `현재 지출 흐름은 안정적입니다. 남은 예산은 ${numberWithCommas(budgetRemaining)}원입니다.`
          : `월 예산을 설정하면 남은 돈과 위험 알림을 더 정확하게 보여드릴게요.`;
  const budgetAlert = budget.totalBudget ? (budget.diff > 0 ? `<div class="appAlert danger">예산보다 <b>${numberWithCommas(budget.diff)}원</b> 초과 지출 중입니다.</div>` : `<div class="appAlert good">예산까지 <b>${numberWithCommas(Math.abs(budget.diff))}원</b> 남았습니다.</div>`) : `<div class="appAlert">월 예산을 설정하면 초과 지출 알림이 표시됩니다.</div>`;
  const categoryList = categoryOptions.map((c) => `<option value="${escapeHtml(c)}"></option>`).join("");
  const paymentList = paymentOptions.map((p) => `<option value="${escapeHtml(p)}"></option>`).join("");
  const appMomRate = prevStats ? percentChange(Number(stats.totals.expense || 0), Number(prevStats.totals.expense || 0)) : null;
  const previousExpense = Number(prevStats?.totals?.expense || 0);
  const expenseDeltaAmount = Number(stats.totals.expense || 0) - previousExpense;
  // 두 달 모두 0원인 새 가계부에 "지난달과 같은 금액"이라고 쓰면 없는 지난달 기록이 있는 것처럼 읽힌다.
  const expenseDeltaText = !prevStats
    ? "이번 달 기록을 기준으로 소비 흐름을 보여드려요."
    : expenseDeltaAmount > 0
      ? `지난달보다 ${numberWithCommas(expenseDeltaAmount)}원 더 썼어요.`
      : expenseDeltaAmount < 0
        ? `지난달보다 ${numberWithCommas(Math.abs(expenseDeltaAmount))}원 덜 썼어요.`
        : Number(stats.totals.expense || 0) === 0 && previousExpense === 0
          ? "아직 지출 기록이 없어요. 한 줄로 첫 기록을 남겨보세요."
          : "지난달과 같은 금액을 썼어요.";
  const expenseDeltaClass = expenseDeltaAmount > 0 ? "spendUp" : expenseDeltaAmount < 0 ? "spendDown" : "spendFlat";
  // V22.8.97 (7.1): "N월 지출" 카드를 걷어낸다. 지시서는 이 카드와 "이번 달 쓸 수
  // 있는 돈" 카드를 **하나의 P0 로 합치라**고 했는데, PR4 는 오늘 쓴 돈과 하루 환산만
  // 흡수하고 이 카드를 남겨 뒀다. 남은 내용은 이미 두 곳에 그대로 있다 —
  // 지출·수입과 전월 대비는 homeMetrics 가, 남은 예산은 P0 헤드라인이 말한다.
  // 같은 이야기를 세 번 하던 것을 한 번으로 줄인다.
  // "챌린지 표시"를 끈 챌린지는 홈에 그리지 않는다(QA B07). 기간이 끝난 챌린지의 상태는 리포트의
  // 챌린지 화면이 기간과 함께 알린다. 설정이 없을 때 쓰는 기본 챌린지(그 달 1~4일)는 매달 5일부터
  // 끝난 상태가 되므로, 끝났다는 이유만으로 홈에서 빼지는 않는다.
  const showHomeChallenge = !!reportChallenge && reportChallenge.enabled !== false;
  const homeChallengeHtml = showHomeChallenge ? renderReportChallenge(reportChallenge, { householdId, canManage: appIsManager, home: true }) : "";
  if (showHomeChallenge && budget && typeof budget === "object") budget.reportChallenge = reportChallenge;
  // The remaining template uses rows.length only for the feed's "view all"
  // affordance. Dashboard summaries above have already been built from all
  // monthly rows, so switch that final count to the filtered feed source.
  rows = feedSource;
  const appNavActive = homeView === "calendar" ? "calendar" : focusTab === "transactions" ? "records" : "app";
  const feedbackKind = err ? "error" : balert ? "warning" : msg ? "success" : "";
  const feedbackTitle = err
    ? "요청을 완료하지 못했습니다"
    : balert
      ? "기록을 저장했고 예산을 확인해야 합니다"
      : msg === "deleted"
        ? "기록을 삭제했습니다"
        : msg === "updated"
          ? "기록을 수정했습니다"
          : msg === "duplicate_skipped"
            ? "중복 기록을 저장하지 않았습니다"
            : "기록을 저장했습니다";
  // V22.8.89 M6: 성공 토스트는 "저장했습니다"에서 멈추지 않고 결과를 말한다.
  // 저장이 끝난 뒤 사용자가 알고 싶은 것은 저장 여부가 아니라 남은 돈이다.
  // 예산이 없으면 말할 남은 돈도 없으므로 붙이지 않는다. 오류·경고는 원문 그대로 둔다.
  // 저장은 msg=added, 그 밖에 created·updated·deleted 가 실제로 오는 값이다
  // ("saved" 는 이 앱이 쓰지 않는 이름이라 formatMessage 가 오류 문구로 되돌린다).
  const feedbackResultLine = !err && !balert && budgetTotal && ["added", "created", "updated", "deleted"].includes(String(msg || ""))
    ? `남은 예산 ${numberWithCommas(budgetRemaining)}원${dailyAllowanceAmt ? ` · 하루 ${numberWithCommas(dailyAllowanceAmt)}원` : ""}`
    : "";
  const feedbackMessage = err ? formatMessage(err) : [msg ? formatMessage(msg) : "", balert ? escapeHtml(balert) : "", feedbackResultLine ? escapeHtml(feedbackResultLine) : ""].filter(Boolean).join("<br/>");
  const saveFeedbackHtml = feedbackKind
    ? `<div class="abSaveFeedback ${feedbackKind === "error" ? "isError" : feedbackKind === "warning" ? "isWarning" : "isSuccess"}" data-ab-save-feedback data-ab-feedback-kind="${feedbackKind}" role="${feedbackKind === "error" ? "alert" : "status"}" aria-live="${feedbackKind === "error" ? "assertive" : "polite"}"><span class="abSaveFeedbackMark" aria-hidden="true">${feedbackKind === "error" ? "!" : feedbackKind === "warning" ? "△" : "✓"}</span><div class="abSaveFeedbackCopy"><b>${escapeHtml(feedbackTitle)}</b><span>${feedbackMessage}</span></div><button type="button" class="abSaveFeedbackClose" data-ab-feedback-close aria-label="알림 닫기">×</button></div>`
    : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="theme-color" content="#3182f6"/><title>${title} · 모바일</title><link rel="stylesheet" href="${MOBILE_HOME_CSS_ASSET_PATH}"/></head><body>${renderUnifiedNav(appNavActive, { month, householdId, householdName: selectedHousehold?.name || "가계부", showSidebarDashboard: true, sidebarRows: rows, sidebarBudget: budget })}<header class="appTop" id="top"><div class="topLine"><h1>${escapeHtml(selectedHousehold?.name || "가계부")}</h1></div><form class="selectLine" method="get" action="/app"><select name="household_id" onchange="this.form.submit()">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}" onchange="this.form.submit()"/></form>${monthAwayHtml}</header><main class="wrap">${focusTab === "transactions" ? txViewHtml : `<section class="homeBudget${budgetGaugeState}"><div class="homeBudgetTop"><span>이번 달 쓸 수 있는 돈</span><em>예산 사용률 <span data-ab-num="${budgetUsedRatio}" data-ab-num-style="percent">${displayBudgetPercent}%</span></em></div><div class="homeBudgetAmount"><b data-ab-num="${budgetRemaining}" data-ab-num-unit="원">${numberWithCommas(budgetRemaining)}</b><small>원</small></div><div class="homeProgress"><i style="width:${budgetBarPercent}%"${homePrevBarAttr}></i></div><div class="homeBudgetFoot"><span>전체 예산 ${numberWithCommas(budgetTotal)}원</span><span>지출 ${numberWithCommas(budgetUsed)}원</span></div>${isCurrentMonth ? `<div class="homeBudgetToday"><span>오늘 쓴 돈</span><b class="${todayOk ? "income" : "expense"}">${numberWithCommas(todaySpend)}원</b></div>` : ""}${Number(stats.totals.expense || 0) ? "" : `<div class="homeBudgetEmpty">아직 지출 기록이 없어요</div>`}${dailyPlanHtml}${dailyAllowanceAmt && isCurrentMonth && !budgetOverAmt ? `<details class="abDailyHelp"><summary>하루 금액 계산</summary><p>남은 예산을 오늘 포함 ${remainDays}일로 나누며 원 미만은 버립니다.</p></details>` : ""}</section>${renderHomeWeekStrip(rows, isCurrentMonth)}${homeChallengeHtml}${renderHomeReportCards({ month, householdId, rows, stats, budgetAlerts: budget.categoryAlerts, reserveHeadline: homeReserveHeadline, reserveHref: homeReserveHref, reserveCount: homeReserveCount, isCurrentMonth, layout: homeLayout, layoutHref: homeLayoutHref })}<section class="homeMetrics">${incomeUsageHtml}<div class="homeMetric"><span>들어온 돈 💰</span><b class="income">+${numberWithCommas(stats.totals.income)}원</b></div><div class="homeMetric"><span>나간 돈 💸</span><b class="expense">-${numberWithCommas(stats.totals.expense)}원</b>${appMomRate === null ? "" : `<small class="homeMomLine ${expenseDeltaClass}">${escapeHtml(expenseDeltaText)}</small>`}</div></section>${homeCalendarHtml}${homeShortcutsHtml}<details class="homeInsights"${trendView !== "daily" ? " open" : ""}><summary>소비 흐름·카테고리</summary><section class="homeGrid"><div class="homeCard"><h2>소비 흐름</h2>${homeTrendHtml}</div><div class="homeCard"><h2 class="homeCategoryHead">카테고리 비율<a href="/analysis?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}" class="homeCategoryLink">월간 리포트 →</a></h2>${homeBars}</div></section></details><section class="homeNotice"><b>SMART NOTICE</b><p>${escapeHtml(mainNotice)}</p></section><section id="add" class="panel"><h2>빠른 입력</h2>${!appCanWrite ? `<div class="empty">현재 권한(조회 전용/승인 대기)은 입력이 제한됩니다. 가계부 관리자에게 권한을 요청하세요.</div>` : `<div class="smartLine"><input id="smartInput" type="text" autocomplete="off" enterkeyhint="done" placeholder="한 줄 입력: 점심 12000 국민카드"${sharePrefill ? ` value="${escapeHtml(sharePrefill)}" data-ab-shared="1"` : ""}/></div><p class="smartHint">내용·금액·결제수단을 적으면 아래 항목에 반영됩니다. 예: 커피 5천 현금</p><form class="form" method="post" action="/admin/transactions">${hidden}<input type="hidden" name="raw_text" id="rawTextInput"/><div class="seg"><label><input type="radio" name="type" value="expense" checked/><span>지출</span></label><label><input type="radio" name="type" value="income"/><span>수입</span></label></div><input id="amountInput" class="amountInput" type="text" name="amount" inputmode="numeric" autocomplete="off" placeholder="예: 12,000" required/><input id="memoInput" name="memo" placeholder="내용 예: 점심, 쿠팡, 병원"/><div class="chipRow" id="freqChips">${inputChips}</div><details class="quickMore" id="quickMore"><summary><span>자세히</span><em id="quickMoreSummary" data-ab-quick-summary>${escapeHtml(quickMoreSummaryText)}</em></summary><div class="quickMoreBody"><div class="dateRow"><input id="txDate" type="date" name="transaction_date" value="${escapeHtml(quickInputDate)}"/><button type="button" class="dateChip" data-day="0">오늘</button><button type="button" class="dateChip" data-day="-1">어제</button></div><div class="grid2"><select name="user_id">${spenderOptions}</select><input name="payment_method" list="paymentList" id="payInput" placeholder="결제수단"/></div>${payChips ? `<div class="chipRow payChips"><span class="chipRowLabel">결제수단</span>${payChips}</div>` : ""}<input id="catInput" name="category" list="categoryList" placeholder="분류 자동추천"/></div></details><div class="quickSubmit"><button type="submit">기록 저장</button><p class="quickAfter" id="quickAfter" data-ab-quick-after data-bsc="${escapeHtml(quickBudgetScope)}" data-remaining="${Math.max(0, Number(budgetRemaining) || 0)}" data-has-budget="${budgetTotal ? "1" : "0"}">${escapeHtml(quickAfterBaseText)}</p></div></form>`}</section>${homeReserveCard}<section id="feed" class="panel"><h2>최근 내역</h2>${firstRecordDone ? `<details class="homeFeedFilter"${hasMobileFilter ? " open" : ""}><summary><b>찾기·거르기</b><span>${hasMobileFilter ? "적용 중" : "전체"}</span></summary>${mobileFilterForm}${feedLinks}<input id="v8Search" class="homeSpender" placeholder="현재 표시된 내역에서 빠른 검색"/></details>` : ""}<div id="v8Feed">${firstRecordDone ? renderV8TxCards(feedRows, currentPath, appCanEditRow) : onboardingHtml}</div>${rows.length > feedRows.length ? `<a class="btn" style="margin-top:10px" href="${escapeHtml(`${baseAppPath}&feed=all`)}#feed">전체 ${numberWithCommas(rows.length)}건 조회</a>` : ""}</section>`}<datalist id="categoryList">${categoryList}</datalist><datalist id="paymentList">${paymentList}</datalist></main>${saveFeedbackHtml}<nav class="bottom"><a class="tab${focusTab === "transactions" ? "" : " active"}" href="${escapeHtml(resetAppPath)}#top"><i>🏠</i><span>홈</span></a><a class="tab${focusTab === "transactions" ? " active" : ""}" href="${escapeHtml(`${resetAppPath}&tab=transactions`)}"><i>📄</i><span>기록</span></a><a class="tab tabAdd" href="#add"><i>＋</i><span>입력</span></a><a class="tab" href="/budgets?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><i>📊</i><span>예산</span></a><a class="tab" href="/menu?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}"><i>☰</i><span>전체</span></a></nav><script>(function(){var q=document.getElementById('v8Search');if(q){q.addEventListener('input',function(){var s=this.value.toLowerCase();document.querySelectorAll('.v8-tx').forEach(function(x){var main=x.querySelector('.v8-tx-main');var hay=((main||x).textContent||'').toLowerCase();x.style.display=hay.indexOf(s)>=0?'block':'none';});});}var amount=document.getElementById('amountInput');if(amount){amount.addEventListener('input',function(){var raw=this.value.replace(/[^0-9]/g,'');this.value=raw?raw.replace(/\\B(?=(\\d{3})+(?!\\d))/g,','):'';});var f=amount.closest('form');if(f){f.addEventListener('submit',function(){amount.value=amount.value.replace(/,/g,'');});}}document.querySelectorAll('.chipRow button').forEach(function(btn){btn.addEventListener('click',function(){var payOnly=this.getAttribute('data-pay-only');var pay=document.getElementById('payInput');if(payOnly){if(pay)pay.value=payOnly;return;}var memo=document.getElementById('memoInput');var cat=document.getElementById('catInput');if(memo)memo.value=this.getAttribute('data-memo')||'';if(cat)cat.value=this.getAttribute('data-cat')||'';var chipPay=this.getAttribute('data-pay');if(pay&&chipPay&&!pay.value)pay.value=chipPay;if(amount&&!amount.value){amount.focus();}});});document.querySelectorAll('.dateChip').forEach(function(btn){btn.addEventListener('click',function(){var d=new Date();d.setDate(d.getDate()+Number(this.getAttribute('data-day')||0));var v=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');var inp=document.getElementById('txDate');if(inp)inp.value=v;document.querySelectorAll('.dateChip').forEach(function(x){x.classList.remove('on');});this.classList.add('on');});});var _tabs=document.querySelectorAll('.bottom a.tab');function _setActive(hash){_tabs.forEach(function(t){var h=t.getAttribute('href')||'';t.classList.toggle('active',h===hash);});}_tabs.forEach(function(t){var h=t.getAttribute('href')||'';if(h.charAt(0)==='#'){t.addEventListener('click',function(){_setActive(h);});}});var _secs=[['#add','add'],['#feed','feed']];window.addEventListener('scroll',function(){var y=window.scrollY+120;var on='#top';_secs.forEach(function(p){var el=document.getElementById(p[1]);if(el&&el.offsetTop<=y)on=p[0];});_setActive(on);},{passive:true});var smart=document.getElementById('smartInput');function parseKoreanAmount(text){return parseMobileAmountText(text);}function abNorm(v){return String(v||'').replace(/[~!@#$%^&*_=+\`|\\\\{}\\[\\]:;"'<>?]/g,' ').replace(/[()]/g,' ').replace(/\\s+/g,' ').trim();}function detectQuickType(text){return transactionTypeFromText(text);}function parseQuickDate(text){return quickInputDate(text);}function detectQuickPayment(text){var raw=abNorm(text);var payOpts=[];document.querySelectorAll('#paymentList option').forEach(function(o){if(o.value)payOpts.push(o.value);});payOpts.sort(function(a,b){return b.length-a.length;});for(var i=0;i<payOpts.length;i++){if(raw.indexOf(payOpts[i])>=0)return payOpts[i];}var brands=['신한','현대','삼성','국민','KB','우리','롯데','하나','농협','NH','BC','비씨','카카오','토스'];for(var j=0;j<brands.length;j++){var re=new RegExp(brands[j]+'\\\\s*카드','i');if(re.test(raw)){var b=brands[j].toUpperCase();return b==='KB'||b==='NH'||b==='BC'?b+'카드':brands[j]+'카드';}}if(/삼성\\s*페이|삼페/.test(raw))return'삼성페이';if(/카카오\\s*페이|카페이/.test(raw))return'카카오페이';if(/네이버\\s*페이|네페/.test(raw))return'네이버페이';if(/애플\\s*페이|애플페이/.test(raw))return'애플페이';if(/토스/.test(raw))return'토스';if(/현금/.test(raw))return'현금';if(/계좌|이체|송금|자동이체|무통장/.test(raw))return'계좌이체';if(/체크/.test(raw))return'체크카드';if(/신용/.test(raw))return'신용카드';if(/카드/.test(raw))return'카드';return'';}var quickRules=(window.AB_CATEGORY_RULES||[]);function inferQuickCategory(text,type){var raw=abNorm(text).toLowerCase();var toks=raw.split(/[^a-z0-9가-힣]+/).filter(Boolean);var optionHit='';document.querySelectorAll('#categoryList option').forEach(function(o){var v=abNorm(o.value);if(v&&raw.indexOf(v)>=0&&!optionHit)optionHit=o.value;});if(optionHit)return optionHit;var best=null;quickRules.forEach(function(r){if(r.type!==type)return;var score=0;r.words.forEach(function(w){if(w&&raw.indexOf(w)>=0)score+=r.weight+Math.min(w.length,8);});(r.exact||[]).forEach(function(w){if(toks.indexOf(w)>=0)score+=r.weight+Math.min(w.length,8);});if(score>0&&(!best||score>best.score))best={name:r.name,score:score};});return best?best.name:(type==='income'?'기타수입':'기타지출');}function stripQuickMemo(text,amountText,payment,category){var rest=abNorm(text);[amountText,payment,category,'수입','입금','지출','출금','사용','결제','구매','납부','정산','기록','가계부','오늘','금일','어제','전날','그제','그저께'].forEach(function(x){if(x)rest=rest.replace(new RegExp(String(x).replace(/[\\\\^$.*+?()[\\]{}|]/g,'\\\\$&'),'g'),' ');});rest=rest.replace(/20\\d{2}[.\\-/년\\s]+\\d{1,2}[.\\-/월\\s]+\\d{1,2}일?/g,' ').replace(/\\d{1,2}\\s*월\\s*\\d{1,2}\\s*일?/g,' ').replace(/(?:^|\\s)\\d{1,2}일(?:\\s|$)/g,' ').replace(/(신용카드|체크카드|카드|현금|삼성페이|삼페|카카오페이|카페이|네이버페이|네페|애플페이|페이코|제로페이|토스|계좌이체|자동이체|무통장|체크|신용)/g,' ').replace(/([가-힣A-Za-z0-9]{2,})(에서|으로|에게|한테)(?=\\s|$)/g,'$1 ').replace(/(?:^|\\s)(에서|으로|에게|한테|로|에|을|를|은|는|이|가|썼어|썼다|썼음|냄|냈어|냈음|샀어|샀음|삼|했어|함|했다|사용|결제|구매|납부|송금|이체)(?=\\s|$)/g,' ').replace(/\\s+/g,' ').trim();return rest||category||'';}var abSmartState = (${quickSmartInputController.toString()})({amount:parseKoreanAmount,date:quickInputDate,type:detectQuickType,payment:detectQuickPayment,category:inferQuickCategory,memo:stripQuickMemo,sync:abQuickSyncMore});function applySmart(clearInput){abSmartState.apply(clearInput);}

function abQuickSyncMore(){var out=document.querySelector('[data-ab-quick-summary]');if(!out)return;var d=document.getElementById('txDate');var pay=document.getElementById('payInput');var cat=document.getElementById('catInput');var who=document.querySelector('#add select[name=user_id]');var today=new Date();var todayKey=today.getFullYear()+'-'+String(today.getMonth()+1).padStart(2,'0')+'-'+String(today.getDate()).padStart(2,'0');var parts=[];var dv=d&&d.value?d.value:'';parts.push(dv===todayKey?'오늘':(dv||'날짜'));if(pay&&pay.value)parts.push(pay.value);if(who&&who.selectedIndex>=0&&who.options[who.selectedIndex]&&who.value)parts.push(who.options[who.selectedIndex].text);if(cat&&cat.value)parts.push(cat.value);out.textContent=parts.join(' · ');}function abQuickSyncAfter(){abSmartState.preview();}var abImeComposing=false;if(smart){smart.addEventListener('compositionstart',function(){abImeComposing=true;});smart.addEventListener('compositionend',function(){abImeComposing=false;applySmart(false);});smart.addEventListener('input',function(){if(abImeComposing)return;applySmart(false);});smart.addEventListener('keydown',function(e){if(e.key==='Enter'){e.preventDefault();applySmart(true);}});if(smart.value&&smart.getAttribute('data-ab-shared')){applySmart(false);}}['txDate','payInput','catInput','amountInput'].forEach(function(id){var el=document.getElementById(id);if(el){el.addEventListener('input',function(){abQuickSyncMore();abQuickSyncAfter();});el.addEventListener('change',function(){abQuickSyncMore();abQuickSyncAfter();});}});var whoSel=document.querySelector('#add select[name=user_id]');if(whoSel)whoSel.addEventListener('change',abQuickSyncMore);document.addEventListener('change',function(e){if(e.target&&e.target.name==='type')abQuickSyncAfter();});abQuickSyncMore();abQuickSyncAfter();var addForm=document.querySelector('#add form.form');if(addForm)addForm.addEventListener('submit',function(){var rawEl=document.getElementById('rawTextInput');if(rawEl&&!rawEl.value){var memo=document.getElementById('memoInput')?.value||'';var amt=document.getElementById('amountInput')?.value||'';var pay=document.getElementById('payInput')?.value||'';var cat=document.getElementById('catInput')?.value||'';rawEl.value=[memo,amt,pay,cat].filter(Boolean).join(' ');}});window.copyMemeText=function(btn){var text=btn.getAttribute('data-share')||'';if(navigator.clipboard){navigator.clipboard.writeText(text).then(function(){btn.textContent='복사됨';});}else{btn.textContent=text;}};})();</script></body></html>`.replace(/(<(?:input|meta|link|br|hr)\b[^>]*?)\/>/g,"$1>");
}

async function fetchMonthAmountRows(env, month, householdId) {
  if (!householdId) return [];
  const params = new URLSearchParams();
  params.set("select", "type,amount");
  params.set("transaction_date", `gte.${month}-01`);
  params.append("transaction_date", `lt.${nextMonthStart(month)}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "transaction_date.desc");
  return fetchPostgrestRows(env, `/rest/v1/transactions?${params.toString()}`, { maxRows: 10000 });
}

function filterMobileTransactionRows(rows = [], filters = {}) {
  const type = filters.type === "income" ? "income" : filters.type === "expense" ? "expense" : "all";
  const needle = String(filters.q || "").trim().toLowerCase();
  const quality = String(filters.quality || "all");
  const date = String(filters.date || "");
  const category = String(filters.category || "");
  const payment = String(filters.payment_method || "");
  return safeArray(rows).filter((row) => {
    if (type !== "all" && row.type !== type) return false;
    if (date && String(row.transaction_date || "") !== date) return false;
    if (needle && !String(`${row.memo || ""} ${row.category || ""} ${row.payment_method || ""} ${row.raw_text || ""}`).toLowerCase().includes(needle)) return false;
    if (category && !(category === "__missing" ? isMissingCategory(row.category) : String(row.category || "") === category)) return false;
    if (payment && !(payment === "__missing" ? isMissingPayment(row.payment_method) : String(row.payment_method || "") === payment)) return false;
    if (quality === "missing_category" && !isMissingCategory(row.category)) return false;
    if (quality === "missing_payment" && !(row.type === "expense" && isMissingPayment(row.payment_method))) return false;
    if (quality === "missing_any" && !(isMissingCategory(row.category) || (row.type === "expense" && isMissingPayment(row.payment_method)))) return false;
    if (quality === "kakao_only" && !String(row.source || "").includes("kakao")) return false;
    if (quality === "web_only" && !String(row.source || "").includes("web")) return false;
    return true;
  });
}

async function handleMobileV8Page(request, env, url) {
  const [userId, adminOk] = await Promise.all([
    verifyUserSession(request, env),
    verifyAdminSession(request, env),
  ]);
  if (!userId && !adminOk) return redirectResponse("/my");
  const title = escapeHtml(appName(env));
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  let selectedHousehold = null;
  if (userId) {
    const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
    if (access.restricted) {
      const user = await fetchUserById(env, userId);
      return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
    }
    households = access.households;
    selectedHousehold = access.selected;
    if (!selectedHousehold) {
      const user = await fetchUserById(env, userId);
      return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
    }
  } else {
    households = await fetchAdminHouseholds(env);
    const requestedId = url.searchParams.get("household_id") || households[0]?.id || "";
    selectedHousehold = households.find((h) => h.id === requestedId) || households[0] || null;
  }
  const householdId = selectedHousehold?.id || "";
  const mobileType = url.searchParams.get("type") === "income" ? "income" : url.searchParams.get("type") === "expense" ? "expense" : "all";
  const mobileQ = String(url.searchParams.get("q") || "").trim();
  const mobileQuality = ["missing_any", "missing_category", "missing_payment", "kakao_only", "web_only"].includes(String(url.searchParams.get("quality") || "")) ? String(url.searchParams.get("quality")) : "all";
  const mobileDate = isValidTransactionDateString(url.searchParams.get("date") || "") ? String(url.searchParams.get("date")) : "";
  const mobileCategory = String(url.searchParams.get("category") || "").trim();
  const mobilePayment = String(url.searchParams.get("payment_method") || "").trim();
  const canLoadWriteOptions = !!selectedHousehold && (adminOk || canWriteMyHousehold(String(selectedHousehold.role || "")));
  const includeReserve = !!selectedHousehold && month === currentMonthKst();
  const homeSettingsPromise = selectedHousehold
    ? fetchMobileHomeSettings(env, householdId, month, { includeReserve, includePayment: canLoadWriteOptions })
    : Promise.resolve({ aliases: {}, reservePlans: [], paymentAssets: [], challengeValue: {} });
  // V22.8.94 (8.4): 홈 구성은 (가계부·사용자)별 설정 한 줄이다. 읽지 못해도 홈은
  // 기본 순서로 그려야 하므로 실패를 삼킨다 — 설정 조회가 홈을 막을 이유는 없다.
  // V22.9.16: 렌더 직전에 따로 기다리던 것을 아래 묶음에 같이 넣었다(왕복 한 단계 절감).
  const homeLayoutSettingPromise = getSettingValue(env, homeLayoutKey(selectedHousehold?.id || "", userId || "shared")).catch(() => "");
  const [members, rawMonthlyRows, prevAmountRows, monthlyTrendRows, budgets, homeSettings, homeLayoutSetting] = await Promise.all([
    selectedHousehold ? fetchHouseholdMembers(env, selectedHousehold.id, { aliasesPromise: homeSettingsPromise.then((settings) => settings.aliases) }) : [],
    selectedHousehold ? fetchAdminRows(env, { month, householdId, type: "all" }) : [],
    selectedHousehold ? fetchMonthAmountRows(env, addMonthsYm(month, -1), householdId) : [],
    // P3-⑧ 월별 트렌드: 금액만, 최근 6개월까지. 거래내역 탭에서는 쓰지 않으므로 건너뛴다.
    (selectedHousehold && url.searchParams.get("tab") !== "transactions" && url.searchParams.get("trend") === "monthly")
      ? Promise.all(Array.from({ length: 6 }, (_, i) => {
          const ym = addMonthsYm(month, i - 5);
          return fetchMonthAmountRows(env, ym, householdId).then((rs) => {
            const st = calculateStats(safeArray(rs));
            return { month: ym, income: st.totals.income, expense: st.totals.expense };
          }).catch(() => ({ month: ym, income: 0, expense: 0 }));
        }))
      : [],
    selectedHousehold ? fetchBudgets(env, householdId, month) : [],
    homeSettingsPromise,
    homeLayoutSettingPromise,
  ]);
  const reservePlans = homeSettings.reservePlans;
  const paymentAssetRows = homeSettings.paymentAssets;
  const rows = attachSpenderNames(rawMonthlyRows, members);
  const filteredRows = filterMobileTransactionRows(rows, {
    type: mobileType,
    q: mobileQ,
    quality: mobileQuality,
    date: mobileDate,
    category: mobileCategory,
    payment_method: mobilePayment,
  });
  const stats = calculateStats(rows);
  const prevStats = calculateStats(prevAmountRows);
  const budget = budgetSummary(rows, budgets);
  const reportChallenge = await buildReportChallengeForHousehold(env, { householdId, month, rows, value: homeSettings.challengeValue });
  const categoryOptions = mergedOptions(DEFAULT_CATEGORIES, rows.map((r) => r.category).filter(Boolean));
  const paymentOptions = mergedOptions(DEFAULT_PAYMENTS, [...paymentAssetRows.map((p) => p.name).filter(Boolean), ...rows.map((r) => r.payment_method).filter(Boolean)]);
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const mobileFeed = url.searchParams.get("feed") === "all" ? "all" : url.searchParams.get("feed") === "30" ? "30" : "10";
  const focusTab = url.searchParams.get("tab") === "transactions" ? "transactions" : "home";
  const txPage = Math.max(1, Math.min(9999, Math.floor(Number(url.searchParams.get("page")) || 1)));
  // 기본값이 빈 문자열이라 "소비 흐름" 카드는 늘 "고르면 열립니다" 만 띄우고 있었다.
  // 홈에서 가장 크게 자리를 차지하는 카드가 아무것도 안 보여 주는 상태가 기본이었다.
  // 인라인 style 을 걷어내 일별 격자가 싸졌으므로(27KB → 3KB) 이제 기본으로 켠다.
  const trendView = ["daily", "weekly", "monthly"].includes(String(url.searchParams.get("trend") || "")) ? String(url.searchParams.get("trend")) : "daily";
  const balert = String(url.searchParams.get("balert") || "").slice(0, 120);
  const homeView = url.searchParams.get("view") === "calendar" ? "calendar" : "";
  // V22.9.8: 공유 시트로 들어온 텍스트. 매니페스트의 share_target 이 카드 결제 알림·문자를
  // 이 세 파라미터로 넘긴다. 제목·본문 순으로 붙이는데, 안드로이드 공유는 앱마다
  // 어느 쪽에 내용을 담는지가 달라서 둘 다 봐야 한다(문자 앱은 text, 알림 공유는 title
  // 에 담는 경우가 있다). 주소는 붙이지 않는다 — 금액·가맹점과 섞여 파서를 헷갈리게 한다.
  const sharePrefill = [url.searchParams.get("share_title") || "", url.searchParams.get("share_text") || ""]
    .map((part) => String(part).replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .join(" ")
    .slice(0, 200);
  const calendarRows = rows;
  return htmlResponse(renderMobileV81Html({ title, month, households, selectedHousehold, members, rows, filteredRows, stats, prevStats, budgets, reservePlans, budget, recurring: [], meme: null, categoryOptions, paymentOptions, msg, err, mobileFeed, mobileFilters: { type: mobileType, q: mobileQ, quality: mobileQuality, date: mobileDate, category: mobileCategory, payment_method: mobilePayment }, focusTab, txPage, trendView, reserveLoaded: includeReserve, monthlyTrend: monthlyTrendRows, balert, homeView, calendarRows, reportChallenge, sessionRole: adminOk ? "admin" : String(selectedHousehold?.role || ""), sessionUserId: userId || "", isAdminSession: !!adminOk, homeLayoutSetting, sharePrefill }));
}
// @build:exports-start
export { handleMobileV8Page, renderMobileV81Html };
// @build:exports-end
