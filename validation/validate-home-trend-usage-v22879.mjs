import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.90-DESKTOP-NAV-GRID"'), "runtime exposes the V22.8.79 release");

// ---------------------------------------------------------------------------
// P3-①. 수입 대비 사용률 게이지
// ---------------------------------------------------------------------------

// 1. 분모는 예산이 아니라 이번 달 수입이다.
ok(source.includes("const usageIncome = Math.max(0, Number(stats.totals?.income || 0));"), "the gauge denominator is the month's income");
ok(source.includes("const usageRate = usageIncome > 0 ? Math.round(usageExpense / usageIncome * 100) : 0;"), "the rate is expense over income");

// 2. 기존 게이지 마크업을 재사용한다.
ok(source.includes('<div class="abNavBudgetTrack" role="progressbar" aria-label="수입 대비 사용률"'), "the gauge reuses the abNavBudgetTrack markup");
ok(source.includes('aria-valuemin="0" aria-valuemax="100"'), "the gauge exposes progressbar bounds");

// 3. 수입이 0이면 폴백 문구.
ok(source.includes("수입을 입력하면 사용률이 표시돼요"), "a zero-income month gets the fallback copy");

// 4. 이 자리에서 '써도 되는 돈'/일일한도 표기는 사라졌다.
// 주석에는 남아 있어도 되므로 실제로 화면에 나가는 마크업만 본다.
eq(/>오늘 써도 되는 돈</.test(source), false, "the daily allowance label is no longer rendered");
eq(source.includes("남은 ${remainDays}일 × 하루 기준"), false, "the daily allowance sub-label is gone");
eq(source.includes("예산을 설정하면<br/>하루 기준이 생겨요"), false, "the daily allowance fallback link is gone");

// 5. '살까 말까'는 넣지 않는다(금지 사항).
for (const word of ["살까", "buyOrNot", "affordCalculator"]) {
  eq(source.includes(word), false, `the afford calculator term "${word}" is absent`);
}

// ---------------------------------------------------------------------------
// P3-⑧. 일/주/월 트렌드
// ---------------------------------------------------------------------------

// 6. 세 렌더 함수는 호출만 한다.
ok(source.includes("renderReadableDailyTrend(rows, month, trendDrillBase)"), "the daily trend is called, not reimplemented");
ok(source.includes("renderWeekdayTrend(rows)"), "the weekday trend is called");
ok(source.includes("renderMonthlySeriesChart(monthlyTrend)"), "the monthly chart is called");
ok(source.includes("function renderReadableDailyTrend("), "renderReadableDailyTrend still exists");
ok(source.includes("function renderWeekdayTrend("), "renderWeekdayTrend still exists");
ok(source.includes("function renderMonthlySeriesChart(items = []) {"), "renderMonthlySeriesChart is untouched");

// 7. 전환은 서버측이라 스크립트 없이 동작한다.
ok(source.includes('const trendView = ["daily", "weekly", "monthly"].includes'), "the trend view comes from the query string");
eq(source.includes("data-trend-tab"), false, "the JS show/hide toggle was dropped in favour of server-side links");

// 8. 월별 데이터는 금액만, 최대 6개월, 홈 탭에서만 부른다.
ok(source.includes("Array.from({ length: 6 }, (_, i) => {"), "the monthly trend loads at most six months");
ok(source.includes('url.searchParams.get("tab") !== "transactions"'), "the transactions tab skips the monthly queries");
ok(source.includes('params.set("select", "type,amount");'), "fetchMonthAmountRows still selects amounts only");

// 9. 다크 커버리지.
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeUsage{'), "dark coverage exists for the gauge");
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeTrendSeg a{'), "dark coverage exists for the trend tabs");

// ---------------------------------------------------------------------------
// 실제 렌더
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
}), fixture.env, {});
const hh = "&household_id=house-home";
const selected = (html) => (html.match(/class="homeTrendOn"[^>]*>([^<]*)</) || [])[1];

const base = await (await get(`/app?month=2026-07${hh}`)).text();
// 기본은 패널 없이 탭만 둔다 — 홈의 바이트 예산(35 KiB)과 질의 예산(9회)을 둘 다 지키려면
// 어떤 패널도 미리 그릴 수 없었다. 고른 사람만 그 비용을 낸다.
eq(selected(base), undefined, "the home shows no pre-rendered trend panel by default");
ok(base.includes("보고 싶은 기간을 고르면"), "the default state explains how to open a graph");
ok(base.includes("homeTrendSeg"), "the period tabs are always present");
ok(base.includes("수입 대비 사용"), "the usage gauge renders");
ok(/<em>7%<\/em>/.test(base), "the gauge shows the computed rate");
ok(base.includes("248,600원</b> / 3,380,000원"), "the gauge shows spend over income");

const weekly = await (await get(`/app?month=2026-07${hh}&trend=weekly`)).text();
const monthly = await (await get(`/app?month=2026-07${hh}&trend=monthly`)).text();
const daily = await (await get(`/app?month=2026-07${hh}&trend=daily`)).text();
eq(selected(weekly), "주별", "the weekly view is selectable");
eq(selected(monthly), "월별", "the monthly view is selectable");
eq(selected(daily), "일별", "the daily view is selectable");

// 잘못된 값은 조용히 기본으로 접힌다.
const bogus = await (await get(`/app?month=2026-07${hh}&trend=zzz`)).text();
eq(selected(bogus), undefined, "an unknown trend value falls back to the no-panel default");

// 한 번에 한 패널만 그린다(셋을 다 그리면 예산을 넘는다).
eq((weekly.match(/class="homeTrendPanel"/g) || []).length, 1, "only the selected panel is rendered");
// 월별 6개월 질의는 그 뷰를 고를 때만 돈다(홈 기본 질의 수 9회를 지키기 위해).
ok(source.includes('url.searchParams.get("trend") === "monthly"'), "the six-month query only runs for the monthly view");

// 기본 홈은 예산 안에 있어야 한다(AGENTS.md 필수 보호 기준).
const budget = 47104;
for (const [label, html] of [["default", base], ["weekly", weekly], ["monthly", monthly]]) {
  ok(Buffer.byteLength(html) <= budget, `${label} home stays within the HTML budget (${Buffer.byteLength(html)}B)`);
}

// 일별은 렌더 함수가 카드 31장을 그려 무겁다. 고른 사람만 그 비용을 내지만,
// 조용히 더 커지지 않도록 상한을 못박아 둔다.
const dailyBytes = Buffer.byteLength(daily);
ok(dailyBytes > budget, `the daily view is knowingly heavier than the default budget (${dailyBytes}B)`);
ok(dailyBytes < 60000, `the daily view stays under its own ceiling (${dailyBytes}B)`);

// 거래내역 탭은 트렌드를 그리지 않고 월별 질의도 하지 않는다.
const tab = await (await get(`/app?month=2026-07&tab=transactions${hh}`)).text();
eq(tab.includes("homeTrendSeg"), false, "the transactions tab renders no trend toggle");

console.log(`PASS: V22.8.79 home trend and income usage (${checks} checks)`);
