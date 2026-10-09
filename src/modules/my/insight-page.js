// @build:imports-start
import { APP_VERSION, appName } from "../public/site-config.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAdminRowsRange, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { getSettingValue } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { handleMyLogout } from "../auth/kakao-oauth.js";
import { fetchUserById } from "../data/users-household-create.js";
import {
  buildReportChallengeForHousehold, buildReportDashboardSummary, getMyPageContext,
  renderReportChallenge, renderReportDashboard, renderReportMonthNavigator,
  reportChallengeSettingsKey, reportUxCss,
} from "./report-challenge.js";
import { budgetExpenseRows, insightClientMain } from "../client/insight-main.js";
import { computeFairMoM, renderMyAnalysisHtml } from "./analysis-page.js";
import {
  canManageMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { budgetSummary, fetchBudgets, fetchRecurring } from "../domain/budgets.js";
import {
  buildWeeklyReport, detectRecurringCandidates, findAnomalousExpenses,
} from "../admin/pc-analysis-calendar.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { addMonthsYm, calculateExtendedAnalytics } from "../domain/analytics.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, nextMonthStart } from "../domain/transactions-core.js";
// @build:imports-end

async function handleMyAnalysisPage(request, env, url) {
  const ctx = await getMyPageContext(request, env, url);
  if (ctx.redirect) return ctx.redirect;
  const householdId = ctx.selected?.id || "";
  const month = ctx.month;
  const [prevRows, historyRaw, registeredRecurring, challengeValue] = await Promise.all([
    householdId ? fetchAdminRows(env, { month: addMonthsYm(month, -1), householdId, type: "all" }) : [],
    householdId ? fetchAdminRowsRange(env, { householdId, start: `${addMonthsYm(month, -11)}-01`, end: nextMonthStart(month), limit: 9001, complete: false }) : [],
    householdId ? fetchRecurring(env, householdId) : [],
    householdId ? getSettingValue(env, reportChallengeSettingsKey(householdId)) : "",
  ]);
  const truncated = historyRaw.length > 9000;
  const historyRows = historyRaw.slice(0, 9000);
  const yearPrefix = `${month.slice(0, 4)}-`;
  const yearRows = historyRows.filter((row) => String(row.transaction_date || "").startsWith(yearPrefix));
  const extended = calculateExtendedAnalytics({ month, allRows: ctx.rows, prevRows, historyRows, yearRows, rowsBase: ctx.rows });
  extended.fairMoM = computeFairMoM(month, ctx.rows, prevRows);
  const recurringCandidates = detectRecurringCandidates(historyRows, month, registeredRecurring);
  const anomalies = findAnomalousExpenses(ctx.rows, historyRows, month);
  const weeklyReport = buildWeeklyReport(historyRows, month);
  const challenge = await buildReportChallengeForHousehold(env, { householdId, month, rows: ctx.rows, value: challengeValue });
  return htmlResponse(renderMyAnalysisHtml({ env, url, ...ctx, extended, recurringCandidates, anomalies, weeklyReport, challenge, truncated, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

// ---------------------------------------------------------------------------
// V22.2 분석 스튜디오: 최근 12개월 기록을 브라우저에서 자유롭게 필터링/시각화
// 서버는 데이터와 껍데기만 내려주고 모든 집계·차트는 클라이언트에서 즉시 계산한다.
// ---------------------------------------------------------------------------

async function handleMyInsightPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  if (!user) return handleMyLogout();
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { selected, restricted } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));

  const dataStart = `${addMonthsYm(month, -11)}-01`;
  const dataEnd = nextMonthStart(month);
  // 30만 사용자 운영을 고려해 불필요한 캘린더·통계 쿼리를 생략하고 3개 요청만 병렬 수행한다.
  const [members, budgets, rawRows, challengeValue] = await Promise.all([
    fetchHouseholdMembers(env, selected.id),
    fetchBudgets(env, selected.id, month),
    fetchAdminRowsRange(env, { householdId: selected.id, start: dataStart, end: dataEnd, limit: 9001, complete: false }),
    getSettingValue(env, reportChallengeSettingsKey(selected.id)),
  ]);
  const truncated = rawRows.length > 9000;
  const rows = attachSpenderNames(rawRows.slice(0, 9000), members);
  const currentStart = `${month}-01`;
  const currentEnd = nextMonthStart(month);
  const currentRows = rows.filter((r) => String(r.transaction_date || "").slice(0, 10) >= currentStart && String(r.transaction_date || "").slice(0, 10) < currentEnd);
  const budget = budgetSummary(currentRows, budgets);
  const challenge = await buildReportChallengeForHousehold(env, { householdId: selected.id, month, rows: currentRows, value: challengeValue });
  const dashboard = { ...buildReportDashboardSummary(currentRows, budget, month), householdId: selected.id };
  return htmlResponse(renderMyInsightHtml({ env, month, selected, rows, currentRows, budget, dashboard, challenge, dataStart, truncated }));
}

function insightAppJsResponse() {
  const body = `${budgetExpenseRows.toString()}\n(${insightClientMain.toString()})();`;
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "public, max-age=600", "x-content-type-options": "nosniff" },
  });
}

function renderMyInsightHtml({ env, month, selected, rows, currentRows = [], budget = {}, dashboard = {}, challenge = {}, dataStart, truncated = false }) {
  const title = escapeHtml(appName(env));
  const qs = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const slim = safeArray(rows).map((r) => [
    String(r.transaction_date || "").slice(0, 10),
    r.type === "income" ? 1 : 0,
    Number(r.amount || 0),
    String(r.category || "").slice(0, 40),
    String(r.payment_method || "").slice(0, 40),
    String(r.memo || r.raw_text || "").slice(0, 90),
    String(r.spender_name || "").slice(0, 30),
  ]);
  const payload = {
    month,
    start: dataStart,
    today: formatDate(nowKstDate()),
    name: String(selected.name || ""),
    hid: String(selected.id || ""),
    budget: {
      month,
      total: Number(budget.totalBudget || 0),
      basis: budget.basis,
      cats: safeArray(budget.categoryAlerts).map((a) => [String(a.category || ""), Number(a.budget || 0)]),
    },
    rows: slim,
    truncated: !!truncated,
  };
  const dataJson = JSON.stringify(payload).replace(/</g, "\\u003c");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 분석</title><style>
*,*:before,*:after{box-sizing:border-box}
[hidden]{display:none!important}
body{margin:0;background:#F7F8FA;color:#191F28;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.02em}
.wrap{max-width:1240px;margin:0 auto;padding:16px}
.hero,.card{background:#fff;border:1px solid #E8EBEF;border-radius:20px;padding:20px;margin:12px 0;box-shadow:0 2px 14px rgba(15,23,42,.05)}
.heroTop{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}
.hero h1{margin:0 0 4px;font-size:21px}
.hero p{margin:0;color:#6B7280;font-size:13px;line-height:1.55}
.heroBtns{display:flex;gap:6px;flex-wrap:wrap}
.heroBtns a{display:inline-flex;align-items:center;background:#F2F4F6;color:#333D4B;border-radius:11px;padding:8px 11px;text-decoration:none;font-weight:800;font-size:12px}
.filterBar{position:sticky;top:0;z-index:30;background:rgba(247,248,250,.96);backdrop-filter:blur(8px);margin:0 -4px;padding:8px 4px 2px;border-bottom:1px solid #E8EBEF}
.chipScroll{display:flex;gap:6px;overflow-x:auto;padding:2px;scrollbar-width:none}
.chipScroll::-webkit-scrollbar{display:none}
.pchip{flex:0 0 auto;border:1px solid #E5E8EB;background:#fff;color:#4E5968;border-radius:999px;padding:8px 13px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.pchip.on{background:#191F28;border-color:#191F28;color:#fff}
.fRow{display:flex;gap:6px;align-items:center;margin:8px 2px;flex-wrap:wrap}
.seg{display:inline-flex;background:#EDF0F3;border-radius:12px;padding:3px;flex:0 0 auto}
.seg button{border:0;background:transparent;border-radius:9px;padding:7px 13px;font:inherit;font-size:13px;font-weight:800;color:#6B7684;cursor:pointer}
.seg button.on{background:#fff;color:#191F28;box-shadow:0 1px 5px rgba(15,23,42,.12)}
.searchBox{flex:1 1 150px;min-width:120px;position:relative}
.searchBox input{width:100%;border:1px solid #E5E8EB;border-radius:12px;background:#fff;padding:9px 12px;font:inherit;font-size:13px}
.fBtn{border:1px solid #E5E8EB;background:#fff;color:#4E5968;border-radius:12px;padding:9px 12px;font:inherit;font-size:13px;font-weight:800;cursor:pointer;white-space:nowrap}
.fBtn.on{border-color:#3182F6;color:#1D6BF3;background:#EFF6FF}
.fPanel{background:#fff;border:1px solid #E8EBEF;border-radius:16px;padding:12px;margin:0 2px 8px;display:grid;gap:12px}
.fGroup b{display:block;font-size:12px;color:#6B7684;margin:0 0 7px;font-weight:900}
.tchips{display:flex;gap:6px;flex-wrap:wrap}
.tchip{border:1px solid #E5E8EB;background:#F9FAFB;color:#4E5968;border-radius:999px;padding:6px 11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
.tchip.on{background:#EFF6FF;border-color:#3182F6;color:#1D6BF3}
.tchip small{color:#8B95A1;font-weight:700;margin-left:3px}
.tchip.on small{color:#5c9bf5}
.rangeRow{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.rangeRow input{border:1px solid #E5E8EB;border-radius:11px;padding:8px 10px;font:inherit;font-size:13px;background:#fff;min-width:0}
.rangeRow input[type=number]{width:110px}
.applyBtn{border:0;background:#191F28;color:#fff;border-radius:11px;padding:9px 13px;font:inherit;font-size:13px;font-weight:800;cursor:pointer}
.activeChips{display:flex;gap:6px;flex-wrap:wrap;margin:0 2px 8px}
.aChip{display:inline-flex;align-items:center;gap:6px;background:#EFF6FF;color:#1D6BF3;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:800;border:0;cursor:pointer}
.aChip i{font-style:normal;opacity:.7}
.kpiRow{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:8px;margin:12px 0}
.kpi{background:#fff;border:1px solid #E8EBEF;border-radius:16px;padding:14px;min-width:0}
.kpi span{display:block;color:#6B7684;font-size:12px;font-weight:800}
.kpi b{display:block;font-size:20px;margin-top:5px;letter-spacing:-.03em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.kpi small{display:block;margin-top:4px;font-size:11px;font-weight:800;color:#8B95A1}
.kpi small.up{color:#D03B3B}.kpi small.down{color:#006300}
.insightChips{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 4px}
.iChip{background:#fff;border:1px solid #E8EBEF;border-radius:999px;padding:7px 11px;font-size:12px;font-weight:800;color:#4E5968}
.iChip.good{background:#F0FAF4;border-color:#cdeeda;color:#006300}
.iChip.bad{background:#FDF3F3;border-color:#f3d5d5;color:#B3261E}
.cardHead{display:flex;justify-content:space-between;gap:10px;align-items:baseline;flex-wrap:wrap;margin:0 0 6px}
.cardHead h2{margin:0!important;font-size:16px}
.cardHead .sub{color:#8B95A1;font-size:12px;font-weight:700}
.chartBox{position:relative}
.grid2{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:12px 0}
.grid2>.card{margin:0}
.tt{position:absolute;pointer-events:none;background:#191F28;color:#fff;border-radius:12px;padding:9px 11px;font-size:12px;line-height:1.5;box-shadow:0 8px 22px rgba(15,23,42,.28);opacity:0;transition:opacity var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1));z-index:5;min-width:120px}
.tt b{display:block;font-size:11px;color:#B0B8C1;font-weight:800;margin-bottom:3px}
.tt .row{display:flex;align-items:center;gap:6px;white-space:nowrap}
.tt .key{display:inline-block;width:10px;height:3px;border-radius:2px}
.tt .val{font-weight:900;font-variant-numeric:tabular-nums}
.legendRow{display:flex;gap:12px;align-items:center;color:#6B7684;font-size:12px;font-weight:800}
.legendRow i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
.donutWrap{display:grid;grid-template-columns:180px minmax(0,1fr);gap:16px;align-items:center}
.dLegend{display:grid;gap:4px}
.dRow{display:grid;grid-template-columns:12px minmax(0,1fr) auto auto;gap:8px;align-items:center;border:0;background:transparent;padding:7px 8px;border-radius:12px;font:inherit;text-align:left;cursor:pointer}
.dRow:hover{background:#F5F7F9}
.dRow.dim{opacity:.45}
.dRow.sel{background:#EFF6FF}
.dRow i{width:10px;height:10px;border-radius:3px}
.dRow b{font-size:13px;color:#191F28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.dRow .pct{color:#8B95A1;font-size:12px;font-weight:800}
.dRow .amt{font-size:13px;font-weight:900;color:#333D4B;font-variant-numeric:tabular-nums;white-space:nowrap}
.hRows{display:grid;gap:4px}
.hRow{display:grid;gap:5px;border:0;background:transparent;padding:8px;border-radius:12px;font:inherit;text-align:left;cursor:pointer}
.hRow:hover{background:#F5F7F9}
.hRow.dim{opacity:.45}
.hRow.sel{background:#EFF6FF}
.hTop{display:flex;justify-content:space-between;gap:8px;align-items:baseline}
.hTop b{font-size:13px;color:#191F28;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.hTop span{font-size:13px;font-weight:900;color:#333D4B;font-variant-numeric:tabular-nums;white-space:nowrap}
.hTop span small{color:#8B95A1;font-weight:700;margin-left:4px}
.hTrack{height:8px;background:#EFF3F8;border-radius:999px;overflow:hidden}
.hFill{display:block;height:100%;border-radius:999px;background:#2a78d6}
.meterBig{height:14px;background:#EFF3F8;border-radius:999px;overflow:hidden;margin:10px 0 6px}
.meterBig i{display:block;height:100%;border-radius:999px}
.bRow{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 10px;padding:8px 0;border-bottom:1px solid #F2F4F6}
.bRow:last-child{border-bottom:0}
.bRow b{font-size:13px}
.bRow .m{grid-column:1/-1}
.bRow span{font-size:12px;color:#6B7684;font-variant-numeric:tabular-nums;white-space:nowrap}
.txGroup{margin:0 0 4px}
.txDate{display:flex;justify-content:space-between;gap:8px;align-items:baseline;padding:10px 2px 6px;border-bottom:1px solid #F2F4F6}
.txDate b{font-size:12px;color:#6B7684;font-weight:900}
.txDate span{font-size:12px;color:#8B95A1;font-weight:800;font-variant-numeric:tabular-nums}
.txRow{display:grid;grid-template-columns:8px minmax(0,1fr) auto;gap:10px;align-items:center;padding:9px 6px;border-bottom:1px solid #F7F8FA}
a.txRow{text-decoration:none;color:inherit;border-radius:12px}
a.txRow:hover{background:#F5F7F9}
.txRow .dot{width:8px;height:8px;border-radius:999px}
.txRow .mid b{display:block;font-size:14px;font-weight:800;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.txRow .mid span{display:block;font-size:12px;color:#8B95A1;margin-top:2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.txRow .amt{font-size:14px;font-weight:900;font-variant-numeric:tabular-nums;white-space:nowrap}
.txRow .amt.in{color:#006300}
.moreBtn{display:block;width:100%;border:1px solid #E5E8EB;background:#fff;border-radius:13px;padding:12px;font:inherit;font-weight:800;color:#4E5968;cursor:pointer;margin-top:10px}
.csvBtn{border:1px solid #E5E8EB;background:#fff;border-radius:11px;padding:8px 11px;font:inherit;font-size:12px;font-weight:800;color:#4E5968;cursor:pointer}
.emptyBox{padding:26px 10px;text-align:center;color:#8B95A1;font-size:13px;line-height:1.6}
details.twin{margin-top:10px}
details.twin summary{cursor:pointer;font-size:12px;font-weight:900;color:#1D6BF3;list-style:none}
details.twin summary::-webkit-details-marker{display:none}
details.twin table{width:100%;border-collapse:collapse;margin-top:8px}
details.twin th,details.twin td{border-bottom:1px solid #F2F4F6;padding:8px 6px;text-align:right;font-size:12px;font-variant-numeric:tabular-nums}
details.twin th:first-child,details.twin td:first-child{text-align:left}
details.twin th{color:#8B95A1;font-weight:800}
.dataNote{color:#8B95A1;font-size:12px;line-height:1.6;margin:16px 4px 24px}
svg text{font-family:inherit}
@media(max-width:820px){.grid2{grid-template-columns:1fr}.donutWrap{grid-template-columns:150px minmax(0,1fr)}.kpi b{font-size:18px}}
@media(max-width:520px){.donutWrap{grid-template-columns:1fr;justify-items:center}.dLegend{width:100%}}
${reportUxCss()}
</style></head><body>${renderUnifiedNav("stats", { month, householdId: selected.id || "", householdName: selected.name || "가계부", showSidebarDashboard: true, sidebarRows: currentRows, sidebarBudget: budget, reportChallenge: challenge })}<main class="wrap reportPageWrap"><div class="pageMain">
<section class="hero abV5PageHeader"><div class="heroTop abV5PageHeaderTop"><div class="abV5PageTitle"><h1>소비 분석</h1><p>${escapeHtml(selected.name)} · 빠르게 보는 요약 화면입니다. <b>소비 분석은 필터로 좁혀 보는 화면</b>이고, <b>종합 리포트는 이번 달 전체를 고정해 보는 화면</b>입니다. 여기서는 최근 12개월 기록을 기간·분류·결제수단·구성원·금액·검색어로 조합해 봅니다.</p></div><div class="heroBtns abV5HeaderActions"><a class="primary" href="/my/analysis?view=report&${qs}">깊게 보기(종합 리포트)</a><a href="/settlement-summary?${qs}">정산</a><a href="/my/settings?${qs}">예산 설정</a></div></div></section>
${renderReportMonthNavigator({ path: "/my/analysis", month, householdId: selected.id })}
${renderReportDashboard(dashboard)}
${renderReportChallenge(challenge, { householdId: selected.id, canManage: canManageMyHousehold(selected.role) })}
<section class="filterBar abV5FilterBar" id="filterBar">
  <div class="chipScroll" id="periodChips"></div>
  <div class="fRow">
    <div class="seg" id="typeSeg"></div>
    <div class="searchBox"><input id="searchInput" type="search" placeholder="메모·분류·결제수단 검색" aria-label="기록 검색"/></div>
    <button class="fBtn" id="panelBtn" type="button">상세 필터</button>
    <button class="fBtn" id="resetBtn" type="button">초기화</button>
  </div>
  <div class="rangeRow" id="customRange" hidden>
    <input type="date" id="startDate" aria-label="시작일"/><span>~</span><input type="date" id="endDate" aria-label="종료일"/>
    <button class="applyBtn" id="rangeApply" type="button">적용</button>
  </div>
  <div class="fPanel" id="filterPanel" hidden>
    <div class="fGroup"><b>분류</b><div class="tchips" id="catChips"></div></div>
    <div class="fGroup"><b>결제수단</b><div class="tchips" id="payChips"></div></div>
    <div class="fGroup" id="whoGroup"><b>구성원</b><div class="tchips" id="whoChips"></div></div>
    <div class="fGroup"><b>금액대</b><div class="rangeRow"><input type="number" id="minAmt" inputmode="numeric" placeholder="최소 금액"/><span>~</span><input type="number" id="maxAmt" inputmode="numeric" placeholder="최대 금액"/><button class="applyBtn" id="amtApply" type="button">적용</button></div></div>
  </div>
  <div class="activeChips" id="activeChips"></div>
</section>
<div class="card" id="insightLoadErr" hidden><b>분석 화면을 불러오지 못했어요.</b><p class="dataNote" style="margin:6px 0 0">네트워크 문제일 수 있어요. 새로고침하거나 <a href="/my/analysis?view=report&${qs}">종합 리포트</a>를 이용해 주세요.</p></div>
<section class="kpiRow abV5KpiGrid" id="kpis"></section>
<div class="insightChips" id="insights"></div>
<section class="card"><div class="cardHead"><h2 id="trendTitle">지출 흐름</h2><span class="legendRow" id="trendLegend"></span></div><div class="chartBox" id="trendChart"></div><details class="twin"><summary>표로 보기</summary><div id="trendTable"></div></details></section>
<div class="grid2">
  <section class="card"><div class="cardHead"><h2 id="catTitle">분류별 구성</h2><span class="sub" id="catSub"></span></div><div id="catChart"></div></section>
  <section class="card"><div class="cardHead"><h2>요일 패턴</h2><span class="sub" id="weekSub"></span></div><div class="chartBox" id="weekChart"></div></section>
</div>
<div class="grid2">
  <section class="card"><div class="cardHead"><h2 id="payTitle">결제수단별</h2></div><div id="payChart"></div></section>
  <section class="card" id="whoCard"><div class="cardHead"><h2 id="whoTitle">구성원별</h2></div><div id="whoChart"></div></section>
</div>
<section class="card" id="budgetCard" hidden><div class="cardHead"><h2>예산 소비 페이스</h2><span class="sub">한눈에 보기의 예산 요약을 날짜별 속도로 펼쳐 봅니다. 필터와 무관하게 이 달 전체 지출 기준</span></div><div id="budgetBox"></div></section>
<section class="card"><div class="cardHead"><h2 id="topTitle">큰 금액 TOP</h2><span class="sub" id="topSub"></span></div><div id="topList"></div></section>
<section class="card"><div class="cardHead"><h2>기록 <span class="sub" id="txCount"></span></h2><button class="csvBtn" id="csvBtn" type="button">CSV 내려받기</button></div><div id="txList"></div><button class="moreBtn" id="moreBtn" type="button" hidden>더 보기</button></section>
<p class="dataNote">${truncated ? "최근 12개월 중 최신 9,000건을 기준으로 계산합니다. 기록이 많은 가계부는 필터 결과 CSV와 종합 리포트를 함께 확인해 주세요." : `이 화면은 ${escapeHtml(dataStart)} 이후 최근 12개월 기록을 기준으로 계산합니다.`} 그 이전 기록은 백업·가져오기에서 CSV로 확인할 수 있어요. 주간 리포트·반복지출 탐지는 <a href="/my/analysis?view=report&${qs}">종합 리포트</a>에 있습니다.</p>
</div></main>
<noscript><p style="text-align:center;color:#6B7280">분석 화면은 자바스크립트가 필요합니다. <a href="/my/analysis?view=report&${qs}">종합 리포트</a>를 이용해 주세요.</p></noscript>
<script>window.__INSIGHT__=${dataJson};</script>
<script src="/my/analysis/app.js?v=${encodeURIComponent(APP_VERSION)}" onerror="(function(){var e=document.getElementById('insightLoadErr');if(e)e.hidden=false;})()"></script>
</body></html>`;
}
// @build:exports-start
export { handleMyAnalysisPage, handleMyInsightPage, insightAppJsResponse };
// @build:exports-end
