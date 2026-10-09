// @build:imports-start
import { appName } from "../public/site-config.js";
import { safeArray } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import {
  renderReportChallenge, renderReportMonthNavigator, reportUxCss,
} from "./report-challenge.js";
import { renderMiniCategoryRows } from "./reports-premium.js";
import { canManageMyHousehold } from "./access-control.js";
import {
  renderAnomalyList, renderDonutChart, renderMonthlySeriesChart, renderRecurringInsightList,
  renderWeeklyReportCard,
} from "../admin/pc-analysis-calendar.js";
import { myNavCss } from "../web/login-page-side-nav.js";
import {
  calculateExtendedAnalytics, deltaClass, formatSignedPercent, percentChange,
  renderCategoryCompareTable, renderMonthlyTrendTable, renderStrategyCards,
} from "../domain/analytics.js";
import {
  currentMonthKst, formatDate, nowKstDate, validMonth, weekdayIndexOfYmd,
} from "../nlu/date-payment.js";
import { calculateStats, escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// 진행 중인 달은 지난달 "같은 날짜 범위"와 비교해야 증감률이 공정하다.
// (예: 13일 시점에 지난달 전체와 비교하면 항상 -90%대로 왜곡)

function computeFairMoM(month, rows = [], prevRows = []) {
  const todayStr = formatDate(nowKstDate());
  const isCurrent = todayStr.slice(0, 7) === month;
  const cutDay = isCurrent ? todayStr.slice(8, 10) : "31";
  const prevCut = safeArray(prevRows).filter((r) => String(r.transaction_date || "").slice(8, 10) <= cutDay);
  const cur = calculateStats(safeArray(rows)).totals;
  const prev = calculateStats(prevCut).totals;
  return {
    label: isCurrent ? "지난달 같은 기간 대비" : "지난달 대비",
    expense: percentChange(cur.expense, prev.expense),
    income: percentChange(cur.income, prev.income),
  };
}

function renderPatternBoxes(analysis = {}) {
  const items = [
    ["월말 예상", `${numberWithCommas(analysis.burnForecast || 0)}원`, "현재 지출 속도 기준"],
    ["카페/간식", `${numberWithCommas(analysis.cafeAmount || 0)}원`, `${numberWithCommas(analysis.cafeCount || 0)}건`],
    ["배달/외식", `${numberWithCommas(analysis.deliveryAmount || 0)}원`, `${numberWithCommas(analysis.deliveryCount || 0)}건`],
    ["쇼핑", `${numberWithCommas(analysis.shoppingAmount || 0)}원`, `${numberWithCommas(analysis.shoppingCount || 0)}건`],
    ["구독", `${numberWithCommas(analysis.subscriptionAmount || 0)}원`, `${numberWithCommas(analysis.subscriptionCount || 0)}건`],
    ["고정비 비중", `${analysis.fixedRate || 0}%`, `${numberWithCommas(analysis.fixedExpense || 0)}원`],
    ["주말 지출", `${analysis.weekendRate || 0}%`, `${numberWithCommas(analysis.weekendExpense || 0)}원`],
    ["분류 누락", `${numberWithCommas(analysis.missingAny || 0)}건`, "정리 필요"],
  ];
  return items.map(([a,b,c]) => `<div class="box"><span class="muted">${escapeHtml(a)}</span><b>${escapeHtml(b)}</b><span class="muted">${escapeHtml(c)}</span></div>`).join("");
}

function renderBudgetGaugeCards(budget = {}) {
  const total = Number(budget.totalBudget || 0);
  const expense = Number(budget.budgetedExpense ?? budget.expense ?? 0);
  const remain = Math.max(0, total - expense);
  const rate = total ? Math.min(160, Math.round(expense / total * 100)) : 0;
  const over = Math.max(0, expense - total);
  return `<section class="card"><h2>예산 사용 게이지</h2><div class="gaugeGrid"><div class="gaugeCard"><span>총 예산</span><b>${numberWithCommas(total)}원</b></div><div class="gaugeCard"><span>사용</span><b>${numberWithCommas(expense)}원</b></div><div class="gaugeCard"><span>잔여 예산</span><b>${numberWithCommas(remain)}원</b></div><div class="gaugeCard"><span>초과</span><b>${numberWithCommas(over)}원</b></div></div><div class="meter"><i style="width:${Math.min(100, rate)}%"></i></div><p class="muted">예산 사용률 ${rate}% · 분류별 예산 합계를 기준으로 계산합니다.</p></section>`;
}

function renderBudgetGaugeRows(budget = {}) {
  const rows = safeArray(budget.categoryAlerts).slice(0, 16);
  return rows.length ? rows.map((r) => {
    const remain = Math.max(0, Number(r.budget || 0) - Number(r.spent || 0));
    const rate = Number(r.budget || 0) ? Math.round(Number(r.spent || 0) / Number(r.budget || 0) * 100) : 0;
    return `<tr><td>${escapeHtml(r.category)}</td><td>${numberWithCommas(r.budget)}원</td><td>${numberWithCommas(r.spent)}원</td><td>${numberWithCommas(remain)}원</td><td><div class="miniMeter"><i style="width:${Math.min(100, rate)}%"></i></div>${rate}%</td></tr>`;
  }).join("") : `<tr><td colspan="5">아직 분류별 예산이 없습니다. 예산·분류에서 예산을 먼저 설정하세요.</td></tr>`;
}

function shortWonLabel(amount = 0) {
  const n = Number(amount || 0);
  if (!n) return "0";
  if (Math.abs(n) >= 100000000) {
    // V22.9.26: 1억 단위 반올림은 1억 5천만을 "2억"으로 보여 줬다. 소수 첫째 자리까지 둔다.
    const eok = Math.round(n / 10000000) / 10;
    return `${Number.isInteger(eok) ? eok : eok.toFixed(1)}억`;
  }
  if (Math.abs(n) >= 10000) return `${Math.round(n / 10000)}만`;
  if (Math.abs(n) >= 1000) return `${Math.round(n / 1000)}천`;
  return `${Math.round(n)}`;
}

function renderReadableDailyTrend(rows = [], month = currentMonthKst(), linkBase = "") {
  const daysInMonth = new Date(Number(month.slice(0,4)), Number(month.slice(5,7)), 0).getDate();
  const map = {};
  const countMap = {};
  for (const r of safeArray(rows)) {
    if (r.type === "income") continue;
    const d = Number(String(r.transaction_date || "").slice(8,10));
    if (!d) continue;
    map[d] = (map[d] || 0) + Number(r.amount || 0);
    countMap[d] = (countMap[d] || 0) + 1;
  }
  const max = Math.max(1, ...Object.values(map));
  const cards = Array.from({length: daysInMonth}, (_, i) => {
    const day = i + 1;
    const amount = Number(map[day] || 0);
    const count = Number(countMap[day] || 0);
    const pct = Math.max(amount ? 8 : 0, Math.round(amount / max * 100));
    // 칸마다 링크를 달면 실사용 한 달에서 탭 정지점이 28개 늘어난다. 이 격자를
    // 기본으로 켜자고 키보드 사용성을 깎는 것은 한쪽을 고치고 다른 쪽을 부수는 일이다.
    // 격자는 **그래프**로 두고(정지점 0), 날짜별로 파고드는 길은 아래 링크 하나로
    // 모은다 — 달력 화면이 이미 날짜별 드릴다운을 제대로 하고 있다.
    return `<div class="dailyCell ${amount ? "hasValue" : "noValue"}"><div class="dailyTop"><b>${String(day).padStart(2,"0")}</b>${count ? `<small>${numberWithCommas(count)}건</small>` : ""}</div><span class="dailyAmt">${amount ? shortWonLabel(amount) : "·"}</span><div class="dailyTrack"><i style="width:${pct}%"></i></div></div>`;
  }).join("");
  const drill = linkBase ? `<a class="dailyDrill" href="${escapeHtml(`${linkBase}&view=calendar`)}#calendar">날짜별로 자세히 보기</a>` : "";
  return `<div class="readableTrendGrid" role="img" aria-label="${escapeHtml(`${Number(month.slice(5,7))}월 일별 지출 흐름`)}">${cards}</div>${drill}`;
}

function renderWeekdayTrend(rows = []) {
  const names = ["일", "월", "화", "수", "목", "금", "토"];
  const data = names.map((name) => ({ name, amount: 0, count: 0 }));
  for (const r of safeArray(rows)) {
    if (r.type === "income") continue;
    const date = String(r.transaction_date || "");
    if (!date) continue;
    const weekday = weekdayIndexOfYmd(date);
    const idx = weekday >= 0 ? weekday : 0;
    data[idx].amount += Number(r.amount || 0);
    data[idx].count += 1;
  }
  const max = Math.max(1, ...data.map((x) => x.amount));
  const cells = data.map((x) => {
    const pct = Math.max(x.amount ? 8 : 2, Math.round(x.amount / max * 100));
    const peak = x.amount === max && x.amount > 0;
    return `<div class="weekdayCell${peak ? " peak" : ""}" style="display:grid;gap:7px;background:${peak ? "#FFFBEB" : "#F8F9FB"};border:1px solid ${peak ? "#FDE68A" : "#EEF0F3"};border-radius:14px;padding:11px;box-sizing:border-box;"><div style="display:flex;justify-content:space-between;align-items:center;gap:8px;"><b style="font-size:15px;color:#4E5968;">${escapeHtml(x.name)}</b><span style="font-size:11px;color:#8B95A1;font-weight:800;">${numberWithCommas(x.count)}건</span></div><strong style="font-size:17px;color:#191919;white-space:nowrap;letter-spacing:-.02em;">${shortWonLabel(x.amount)}</strong><div style="height:7px;background:#E8EBEF;border-radius:999px;overflow:hidden;"><i style="display:block;height:100%;width:${pct}%;background:${peak ? "#F5B800" : "#3182F6"};border-radius:999px;"></i></div></div>`;
  }).join("");
  return `<div class="weekdayTrendGrid" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(110px,1fr));gap:8px;width:100%;box-sizing:border-box;">${cells}</div>`;
}

function renderAnalysisToolCards({ budget = {}, analysis = {}, stats = {}, month = currentMonthKst() }) {
  const income = Number(stats.totals?.income || analysis.income || 0);
  const expense = Number(stats.totals?.expense || analysis.expense || 0);
  const saving = income - expense;
  const savingRate = income ? Math.round(saving / income * 100) : 0;
  const budgetRemain = Math.max(0, Number(budget.totalBudget || 0) - Number(budget.budgetedExpense ?? budget.expense ?? 0));
  const risk = analysis.riskScore || 0;
  const tools = [
    ["현금흐름", `${numberWithCommas(saving)}원`, `수입-지출 · 저축률 ${savingRate}%`],
    ["잔여 총예산", `${numberWithCommas(budgetRemain)}원`, `이번 달 사용 가능 금액`],
    ["월말 예상 지출", `${numberWithCommas(analysis.burnForecast || 0)}원`, `현재 속도 기준`],
    ["소비 위험도", `${risk}점`, risk >= 70 ? "주의 필요" : "정상 범위"],
    ["고정비", `${numberWithCommas(analysis.fixedExpense || 0)}원`, `지출 중 ${analysis.fixedRate || 0}%`],
    ["무지출일", `${numberWithCommas(analysis.noSpendDays || 0)}일`, "소비 없는 날짜"],
    ["최대 지출일", `${escapeHtml(analysis.maxDay?.date || "-")}`, `${numberWithCommas(analysis.maxDay?.expense || 0)}원`],
    ["카테고리 집중도", `${analysis.concentration || 0}%`, `${escapeHtml(analysis.topCategory?.category || "없음")} 중심`],
  ];
  return tools.map(([a,b,c]) => `<div class="box"><span class="muted">${escapeHtml(a)}</span><b>${escapeHtml(b)}</b><span class="muted">${escapeHtml(c)}</span></div>`).join("");
}

function renderMyAnalysisHtml({ env, month, selected, rows, stats, budgets = [], budget = {}, analysis, extended = null, recurringCandidates = [], anomalies = [], weeklyReport = null, challenge = {}, truncated = false, msg = "", err = "" }) {
  const title = escapeHtml(appName(env));
  const role = selected?.role || "";
  const topCategory = analysis.topCategory || { category: "없음", expense: 0 };
  const qs = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const ext = extended || calculateExtendedAnalytics({ month, allRows: rows, prevRows: [], historyRows: [], yearRows: [], rowsBase: rows });
  const incomeMoMRate = percentChange(Number(stats.totals?.income || 0), ext.prev.totals.income);
  const fair = ext.fairMoM || { label: "지난달 대비", expense: ext.expenseMoMRate, income: incomeMoMRate };
  const recurringTotal = safeArray(recurringCandidates).reduce((s, c) => s + Number(c.amount || 0), 0);
  const message = msg === "challenge_saved" ? `<div class="reportFlash ok" role="status">이번 달 챌린지 설정을 저장했습니다.</div>` : "";
  const errorMessages = { challenge_write_not_allowed: "챌린지 설정은 가계부 소유자·관리자만 변경할 수 있습니다.", challenge_invalid: "챌린지 이름과 목표 일수(1~20일)를 확인해 주세요.", challenge_save_failed: "챌린지 설정을 저장하지 못했습니다. 연결 상태를 확인한 뒤 다시 시도해 주세요." };
  const error = err ? `<div class="reportFlash error" role="alert">${escapeHtml(errorMessages[err] || "요청을 처리하지 못했습니다.")}</div>` : "";
  const truncation = truncated ? `<div class="reportFlash error" role="alert">최근 12개월 기록이 9,000건을 넘어 일부만 분석했습니다. 정확한 전체 분석은 기간을 나누어 확인해 주세요.</div>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 분석</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 50%,#eef2f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#101828;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#ede9fe}.muted{color:#667085;line-height:1.55;font-size:13px}.grid,.gaugeGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.box,.gaugeCard{background:#f8fafc;border:1px solid #e8edf4;border-radius:18px;padding:14px;min-width:0}.box b,.gaugeCard b{display:block;font-size:22px}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left}.btn{display:inline-flex;border-radius:14px;background:#111827;color:#fff!important;text-decoration:none;padding:10px 14px;font-weight:1000;margin:3px}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.meme{background:linear-gradient(135deg,#111827,#f59e0b);color:#fff}.meme .muted{color:#fff7ed}.meter,.miniMeter{height:16px;background:#eef2f7;border-radius:999px;overflow:hidden;border:1px solid #dbe4ef}.meter i,.miniMeter i{display:block;height:100%;background:linear-gradient(90deg,#22c55e,#f59e0b,#ef4444);border-radius:999px}.miniMeter{height:10px;min-width:100px;margin-bottom:4px}.readableTrendGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(62px,1fr));gap:8px}.dailyCell{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:9px;min-height:86px}.dailyCell.noValue{opacity:.55}.dailyTop{display:flex;justify-content:space-between;gap:6px;align-items:center}.dailyTop b{font-size:17px}.dailyTop span{font-size:12px;font-weight:1000;color:#2563eb}.dailyTrack{height:8px;background:#e5e7eb;border-radius:999px;overflow:hidden;margin:10px 0 7px}.dailyTrack i{display:block;height:100%;background:#2563eb;border-radius:999px}.dailyCell small{color:#64748b;font-weight:800}.weekdayTrendGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:8px}.weekdayCell{background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:12px;display:grid;gap:8px}.weekdayCell.peak{border-color:#FEE500;box-shadow:0 0 0 3px rgba(254,229,0,.28)}.weekdayCell div{display:flex;justify-content:space-between;gap:8px;align-items:center}.weekdayCell b{font-size:18px}.weekdayCell span{font-size:12px;color:#64748b}.weekdayCell strong{font-size:18px}.weekdayCell i{display:block;height:8px;background:#3182F6;border-radius:999px}.trendChart{display:flex;align-items:end;gap:5px;min-height:176px;overflow:auto;padding:12px;border:1px solid #e8edf4;border-radius:18px;background:#f8fafc}.trendBar{display:grid;grid-template-rows:22px 1fr 16px;align-items:end;justify-items:center;min-width:26px;height:156px}.trendBar strong{font-size:10px;color:#334155;white-space:nowrap;writing-mode:vertical-rl;transform:rotate(180deg);align-self:start}.trendBar i{display:block;width:13px;background:#2563eb;border-radius:999px 999px 0 0}.trendBar span{font-size:10px;color:#64748b;margin-top:4px}.pcBox{display:flex;gap:8px;flex-wrap:wrap}.insightList{display:grid;gap:8px}.insightList div{background:#f8fafc;border:1px solid #e8edf4;border-radius:16px;padding:12px}@media(max-width:760px){.pcBox .btn{width:100%}}
.grid2col{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:14px 0}
.grid2col>.card{margin:0}
.insightGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:10px}
.insight{border-radius:18px;border:1px solid #e8edf4;padding:14px;background:#fff}
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
ul.insightList{list-style:none;margin:10px 0;padding:0;display:grid;gap:8px}
ul.insightList li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:2px 12px;border:1px solid #e8edf4;border-radius:14px;padding:10px 12px;background:#f8fafc}
ul.insightList li b{grid-column:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
ul.insightList li span{grid-column:1;color:#64748b;font-size:12px}
ul.insightList li strong{grid-row:1/3;grid-column:2;align-self:center;white-space:nowrap}
.bar{height:10px;background:#e5e7eb;border-radius:999px;overflow:hidden}
.bar span{display:block;height:100%;background:linear-gradient(90deg,#2563eb,#7c3aed)}
.deltaUp{color:#dc2626!important;font-weight:900;font-size:12px}
.deltaDown{color:#16a34a!important;font-weight:900;font-size:12px}
.deltaFlat{color:#64748b!important;font-weight:900;font-size:12px}
.box .deltaUp,.box .deltaDown,.box .deltaFlat{display:block;margin-top:4px}
.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}
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
@media(max-width:760px){.grid2col{grid-template-columns:1fr}.donutWrap{grid-template-columns:1fr}.insightGrid{grid-template-columns:1fr}.seriesCol{min-width:44px}.trendLine{grid-template-columns:70px 1fr}.trendValue{display:none}}.budgetTableHead{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.budgetTableHead h2{margin:0}.budgetTableSet{flex:none;display:inline-flex;align-items:center;min-height:36px;border-radius:12px;background:#eef2ff;color:#1e3a8a;text-decoration:none;padding:0 12px;font-size:12px;font-weight:1000}${reportUxCss()}</style></head><body>${renderUnifiedNav("analysis", { month, householdId: selected.id || "", householdName: selected.name || "가계부", showSidebarDashboard: true, sidebarRows: rows, sidebarBudget: budget, reportChallenge: challenge })}<main class="wrap"><div class="pageMain">${message}${error}${truncation}<section class="hero"><h1>종합 리포트</h1><p>${escapeHtml(selected.name)} · ${escapeHtml(month)} · 깊게 보는 분석 화면입니다. <b>종합 리포트는 이번 달 전체를 고정해 보는 화면</b>이고, <b>소비 분석은 필터로 좁혀 보는 화면</b>입니다. 여기서는 예산, 소비 추이, 고정비, 반복지출, 분류별 지출을 한 화면에서 봅니다.</p><p class="muted">\uD3C9\uADE0\u00B7\uBB34\uC9C0\uCD9C: ${escapeHtml(month)}-01 ~ ${escapeHtml(month)}-${new Date(Number(month.slice(0,4)),Number(month.slice(5,7)),0).getDate()} \uC6D4 \uC804\uCCB4 \uAE30\uC900${month === currentMonthKst() ? " (\uBBF8\uB798 \uB0A0\uC9DC \uD3EC\uD568)" : ""}</p><div class="pcBox"><a class="btn" href="/my/analysis?${qs}#reportCockpitTitle">← 한눈에 보기(소비 분석)</a><a class="btn secondary" href="/budgets?${qs}">예산 설정</a><a class="btn secondary" href="/app?${qs}&view=calendar#calendar">캘린더 보기</a></div></section>${renderReportMonthNavigator({ path: "/my/analysis", month, householdId: selected.id, view: "report" })}${renderReportChallenge(challenge, { householdId: selected.id, canManage: canManageMyHousehold(role) })}<section class="grid"><div class="box"><span class="muted">총 지출</span><b>${numberWithCommas(stats.totals?.expense || 0)}원</b><span class="${deltaClass(fair.expense)}">${escapeHtml(fair.label)} ${formatSignedPercent(fair.expense)}</span></div><div class="box"><span class="muted">총 수입</span><b>${numberWithCommas(stats.totals?.income || 0)}원</b><span class="${fair.income > 0 ? "deltaDown" : fair.income < 0 ? "deltaUp" : "deltaFlat"}">${escapeHtml(fair.label)} ${formatSignedPercent(fair.income)}</span></div><div class="box"><span class="muted">하루 평균 지출</span><b>${numberWithCommas(analysis.avgExpense || 0)}원</b></div><div class="box"><span class="muted">최다 분류</span><b>${escapeHtml(topCategory.category || "없음")}</b><span class="muted">${numberWithCommas(topCategory.expense || 0)}원</span></div><div class="box"><span class="muted">무지출일</span><b>${numberWithCommas(analysis.noSpendDays || 0)}일</b></div><div class="box"><span class="muted">월말 예상 지출</span><b>${numberWithCommas(analysis.burnForecast || 0)}원</b></div></section>${renderWeeklyReportCard(weeklyReport)}<section class="card"><h2>핵심 인사이트</h2><p class="muted">전월 대비 변화, 3개월 평균, 급증 분류, 소비 경보를 한눈에 요약했습니다.</p><div class="insightGrid">${renderStrategyCards(ext, analysis)}</div></section>${renderBudgetGaugeCards(budget)}<section class="card"><div class="budgetTableHead"><h2>분류별 예산 사용률</h2><a class="budgetTableSet" href="/budgets?${qs}">예산 설정 →</a></div><p class="muted">여기서는 사용률만 봅니다. 금액을 바꾸려면 예산 설정으로 이동하세요.</p><div class="scroll"><table><thead><tr><th>분류</th><th>예산</th><th>사용</th><th>잔여</th><th>사용률</th></tr></thead><tbody>${renderBudgetGaugeRows(budget)}</tbody></table></div></section><section class="card"><h2>일별 소비 그래프</h2><p class="muted">날짜별 지출 흐름을 카드형으로 봅니다. 금액이 있는 날을 누르면 그날 기록으로 이동합니다.</p>${renderReadableDailyTrend(rows, month, `/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id || "")}`)}</section><section class="card"><h2>요일별 소비 추이</h2><p class="muted">요일별로 소비가 집중되는 패턴을 확인합니다.</p>${renderWeekdayTrend(rows)}</section><section class="card"><details class="foldSection"><summary>이번 달 지출 구성 (도넛 차트)</summary><div><h2>이번 달 지출 구성</h2><p class="muted">상위 분류가 전체 지출에서 차지하는 비중입니다.</p>${renderDonutChart(safeArray(stats.categories), Number(stats.totals?.expense || 0))}</div></details></section><section class="card"><details class="foldSection"><summary>전월 대비 분류 변화 TOP</summary><div><h2>전월 대비 분류 변화 TOP</h2><p class="muted">지난달보다 크게 늘거나 줄어든 분류입니다.</p>${renderCategoryCompareTable(ext.categoryCompare, true)}</div></details></section><section class="card"><details class="foldSection"><summary>최근 6개월 수입·지출 흐름 · 12개월 상세</summary><div><h2>최근 6개월 수입·지출 흐름</h2><p class="muted">막대에 마우스를 올리면 정확한 금액이 표시됩니다.</p>${renderMonthlySeriesChart(ext.monthlyTrend)}<details class="foldTable"><summary>최근 12개월 상세 표 보기</summary><div>${renderMonthlyTrendTable(ext.monthlyTrend)}</div></details></div></details></section><section class="card"><details class="foldSection"><summary>매달 나가는 돈 (반복 지출 후보)</summary><div><h2>매달 나가는 돈</h2><p class="muted">최근 3개월간 같은 이름·같은 금액으로 반복된 지출입니다.${recurringTotal ? ` 합치면 매달 약 <b>${numberWithCommas(recurringTotal)}원</b>이에요.` : ""}</p>${renderRecurringInsightList(recurringCandidates)}<a class="btn secondary" href="/reserve-plans?${qs}">정기지출로 관리하기</a></div></details></section><section class="card"><details class="foldSection"><summary>큰 지출 체크</summary><div><h2>큰 지출 체크</h2><p class="muted">평소 그 분류에서 쓰던 평균보다 크게 벗어난 지출입니다.</p>${renderAnomalyList(anomalies)}</div></details></section><section class="card"><h2>분석 도구</h2><div class="grid">${renderAnalysisToolCards({ budget, analysis, stats, month })}</div></section><section class="card"><h2>패턴 분석</h2><div class="grid">${renderPatternBoxes(analysis)}</div></section><section class="card"><h2>개선 인사이트</h2><div class="insightList"><div><b>예산 초과/주의 분류</b><br/><span class="muted">사용률이 높은 분류부터 키워드와 예산을 재점검하세요.</span></div><div><b>고정비 점검</b><br/><span class="muted">정기지출과 구독성 지출은 해지/조정 효과가 큽니다.</span></div><div><b>분류 누락 정리</b><br/><span class="muted">분류·결제수단 누락이 많으면 분석 정확도가 떨어지므로 키워드 설정을 보강하세요.</span></div></div></section><section class="card"><h2>분류별 지출/건수</h2><div class="scroll"><table><thead><tr><th>분류</th><th>지출금액</th><th>건수</th></tr></thead><tbody>${renderMiniCategoryRows(stats)}</tbody></table></div></section></div></main></body></html>`;
}

function shiftMonthString(month = currentMonthKst(), delta = 0) {
  const m = validMonth(month) || currentMonthKst();
  const y = Number(m.slice(0, 4));
  const mm = Number(m.slice(5, 7));
  const d = new Date(y, mm - 1 + Number(delta || 0), 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
// @build:exports-start
export {
  computeFairMoM, renderMyAnalysisHtml, renderReadableDailyTrend, renderWeekdayTrend,
  shiftMonthString, shortWonLabel,
};
// @build:exports-end
