import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import {
  reportChallengeSettingsKey,
  normalizeReportChallenge,
  buildReportChallenge,
  reportMonthHref,
  renderReportMonthNavigator,
  buildReportDashboardSummary,
  renderReportDashboard,
} from "../src/index.js";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
let checks = 0;

function ok(value, message) {
  checks++;
  if (!value) throw new Error(`FAIL: ${message}`);
}

function eq(actual, expected, message) {
  ok(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

eq(reportChallengeSettingsKey("hh-1"), "report_challenge:hh-1", "challenge settings are household scoped");
eq(normalizeReportChallenge({}).targetDays, 4, "challenge has a useful default target");
eq(normalizeReportChallenge({ target_days: 999 }).targetDays, 20, "challenge target is capped");
eq(normalizeReportChallenge({ title: "  커피   줄이기  " }).title, "커피 줄이기", "challenge title is normalized");
eq(normalizeReportChallenge({ enabled: false }).enabled, false, "challenge can be disabled explicitly");

const pastRows = [
  { type: "expense", amount: 1000, transaction_date: "2025-02-03" },
  { type: "expense", amount: 2000, transaction_date: "2025-02-14" },
];
const challenge = buildReportChallenge(pastRows, "2025-02", { target_days: 4, title: "무지출 데이", start_date: "2025-02-01", target_date: "2025-02-28" });
eq(challenge.completedDays, 26, "past month challenge counts only expense-free days");
eq(challenge.progress, 4, "challenge progress is capped at the target");
eq(challenge.rate, 100, "challenge rate reaches 100 percent");
eq(buildReportChallenge([{ type: "income", amount: 5000, transaction_date: "2025-02-03" }], "2025-02", { start_date: "2025-02-01", target_date: "2025-02-28" }).completedDays, 28, "income does not break a no-spend day");
eq(buildReportChallenge([], "2099-12", { start_date: "2099-12-01", target_date: "2099-12-04" }).evaluatedDays, 0, "future challenge does not earn progress");

const href = reportMonthHref("/my/analysis", "2026-06", "hh A", "report");
ok(href.includes("month=2026-06"), "month link preserves the selected month");
ok(href.includes("household_id=hh+A"), "month link preserves household scope");
ok(href.includes("view=report"), "month link preserves report view");
const nav = renderReportMonthNavigator({ path: "/my/analysis", month: "2026-07", householdId: "hh-1", view: "report" });
ok(nav.includes("month=2026-06"), "navigator exposes previous month");
ok(nav.includes("month=2026-08"), "navigator exposes next month");
ok(nav.includes("이번 달"), "navigator exposes current-month return");
ok(nav.includes('type="month"'), "navigator supports direct month selection");
ok(nav.includes('aria-label="리포트 기준 월 이동"'), "navigator has an accessible name");

const summary = buildReportDashboardSummary([
  { type: "expense", amount: 300000, category: "식비", transaction_date: "2025-02-03" },
  { type: "income", amount: 1000000, category: "급여", transaction_date: "2025-02-01" },
], { totalBudget: 500000, categoryAlerts: [{ category: "식비", spent: 300000, budget: 400000, rate: 75 }] }, "2025-02");
eq(summary.expense, 300000, "dashboard totals expenses");
eq(summary.income, 1000000, "dashboard totals income");
eq(summary.budgetRate, 60, "dashboard calculates budget rate");
eq(summary.remainingBudget, 200000, "dashboard calculates remaining budget");
eq(summary.forecast, 300000, "past-month forecast resolves to the completed total");
const dashboard = renderReportDashboard({ ...summary, householdId: "hh-1" });
ok(dashboard.includes("300,000원"), "dashboard renders full amounts without truncating meaning");
ok(dashboard.includes("reportGauge"), "dashboard renders the central pace gauge");
ok(dashboard.includes("분류별 예산 속도"), "dashboard renders category budget progress");
ok(dashboard.includes("household_id=hh-1"), "dashboard drill-down links preserve household scope");

ok(source.includes('url.pathname === "/my/report-challenge/save"'), "challenge save route is registered");
ok(source.includes("if (!canManageMyHousehold(selected.role))"), "challenge writes require owner or admin capability");
ok(source.includes("reportChallengeSettingsKey(householdId)"), "challenge save uses the household-scoped key");
ok(source.includes("reportChallenge: challenge"), "challenge is supplied to the shared sidebar");
ok(source.includes('renderUnifiedNav("analysis"'), "server report uses the unified navigation shell");
ok(source.includes('renderReportMonthNavigator({ path: "/my/analysis"'), "analysis pages use the shared month navigator");
ok(source.includes('renderReportMonthNavigator({ path: "/reports"'), "monthly report page uses the shared month navigator");
ok(source.includes('action="/my/report-challenge/save"'), "challenge settings use a POST form");
ok(source.includes("min-height:44px"), "report controls meet the 44px touch target");
ok(source.includes("@media(max-width:899px)"), "report dashboard has a mobile layout");
ok(source.includes("var(--ab12-surface,#fff)"), "report surfaces inherit the shared light and dark theme");
ok(source.includes("var(--ab12-brand,#6d5dfc)"), "report progress colors inherit the selected point tone");
ok(source.includes("var(--ab12-input-bg,#fff)"), "month input inherits the shared input theme");
ok(source.includes(".reportMonthNav :is(a,button,input):focus-visible"), "report interactions expose keyboard focus");
ok(source.includes("color-mix(in srgb,var(--ab12-surface,#fff) 94%,transparent)"), "sticky month navigation keeps themed translucency");
ok(source.includes('const APP_VERSION = "V22.8.89-QUICK-SHEET-TWO-TIER"'), "runtime version is explicit");

const fixture = await createV2265QaFixture();
try {
  const context = "month=2026-07&household_id=house-home";
  const request = (path) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  const statsResponse = await request(`/my/analysis?${context}`);
  eq(statsResponse.status, 200, "statistics route renders with the new UX");
  const statsHtml = await statsResponse.text();
  ok(statsHtml.includes('class="reportMonthNav"'), "statistics renders persistent month navigation");
  ok(statsHtml.includes('class="reportCockpit"'), "statistics renders the center dashboard");
  ok(statsHtml.includes('class="reportChallenge"'), "statistics renders the challenge on mobile and content layouts");
  ok(statsHtml.includes('class="abNavChallenge'), "statistics renders the compact desktop sidebar challenge");
  ok(statsHtml.includes("household_id=house-home"), "statistics drill-downs preserve household scope");
  ok(statsHtml.includes("abAppSurface"), "statistics reserves desktop space for the shared sidebar");
  ok(statsHtml.includes('class="reportKpis"') && statsHtml.includes("overflow-wrap:anywhere"), "summary KPI values wrap without losing long-amount meaning");

  const reportResponse = await request(`/my/analysis?view=report&${context}`);
  eq(reportResponse.status, 200, "server report route renders with the new UX");
  const reportHtml = await reportResponse.text();
  ok(reportHtml.includes('class="abLayoutNav') && !reportHtml.includes('class="appMenu"'), "server report uses only the unified navigation shell");
  ok(reportHtml.includes("abAppSurface"), "server report content cannot render beneath the desktop sidebar");
  ok(reportHtml.includes("month=2026-06") && reportHtml.includes("month=2026-08") && reportHtml.includes("view=report"), "server report exposes scoped previous and next month links");
  ok(reportHtml.includes('action="/my/report-challenge/save"'), "manager sees challenge settings");
  // V22.8.75: 한눈에 보기는 요약 화면(소비 분석)이 맡는다. 종합 리포트는 같은 페이지
  // 안에서 KPI 그리드·핵심 인사이트·예산 게이지로 이미 같은 내용을 더 깊게 보여준다.
  ok(!reportHtml.includes('class="reportCockpit"'), "deep report no longer repeats the summary cockpit");

  const monthlyResponse = await request(`/reports?${context}`);
  eq(monthlyResponse.status, 200, "monthly report route renders");
  const monthlyHtml = await monthlyResponse.text();
  ok(monthlyHtml.includes('class="reportMonthNav"'), "monthly report uses the same month navigation");
  ok(monthlyHtml.includes(".reportMonthNav{display:none!important}"), "print mode removes interactive month navigation");
  ok(!/adsbygoogle|googlesyndication|doubleclick/i.test(monthlyHtml), "signed-in report remains advertising-free");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.56 report dashboard UX (${checks} checks)`);
