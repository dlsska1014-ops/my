import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(/const APP_VERSION = "V\d+\.\d+\.\d+[-A-Z0-9]*"/.test(source), "runtime exposes the V22.8.79 release");

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
// V22.9.0: 기본은 이제 일별 격자다.
//
// 원래 이 자리는 "패널 없이 탭만" 이었고, 이유는 바이트였다 — 일별 격자가 27 KB 라
// 예산을 넘긴다는 것. 그런데 실기기로 열어 보니 홈에서 가장 큰 카드가 늘 비어 있고
// "고르면 열립니다" 만 떠 있었다. 예산이 UX 를 깎고 있었던 자리다.
//
// 무게부터 없앴다. 31칸이 칸마다 style="" 로 같은 CSS 를 700 B 씩 다시 보내고 있었고,
// 그 CSS 를 1년 캐시 셸 자산으로 옮기니 실사용 부하 기준 27,160 B → 7,997 B 가 됐다.
// 그러고 남은 무게만 예산에 반영했다(근거는 validate-deferred-edit-forms 에 있다).
//
// 질의 예산은 그대로다 — 일별 격자는 이미 받아 둔 rows 만 쓰고 새 질의를 하지 않는다.
// 아래 질의 수 단언이 그것을 계속 지킨다.
eq(selected(base), "일별", "홈은 기본으로 일별 흐름을 그려 둔다");
ok(base.includes('class="readableTrendGrid"'), "기본 화면에 일별 격자가 실제로 있다");
ok(!base.includes("보고 싶은 기간을 고르면"), "비어 있던 안내 문구는 더 이상 기본이 아니다");
// 인라인 style 을 걷어낸 것이 되돌아오면 여기서 걸린다 — 칸마다 style="" 을 다시
// 붙이는 순간 27 KB 가 돌아오고, 그러면 이 기본값을 유지할 수 없게 된다.
eq((base.match(/class="dailyCell[^"]*" style=/g) || []).length, 0, "일별 칸은 인라인 style 을 다시 달지 않는다");
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

// 잘못된 값은 조용히 기본으로 되돌아간다(오류를 내지 않는다). 기본이 "빈 패널"에서
// "일별"로 바뀌었으므로 되돌아가는 자리도 함께 옮긴다 — 지키는 성질은 그대로다.
const bogus = await (await get(`/app?month=2026-07${hh}&trend=zzz`)).text();
eq(selected(bogus), "일별", "an unknown trend value falls back to the default view");

// 한 번에 한 패널만 그린다(셋을 다 그리면 예산을 넘는다).
eq((weekly.match(/class="homeTrendPanel"/g) || []).length, 1, "only the selected panel is rendered");
// 월별 6개월 질의는 그 뷰를 고를 때만 돈다(홈 기본 질의 수 9회를 지키기 위해).
ok(source.includes('url.searchParams.get("trend") === "monthly"'), "the six-month query only runs for the monthly view");

// 기본 홈은 예산 안에 있어야 한다(AGENTS.md 필수 보호 기준).
const budget = 47104;
for (const [label, html] of [["default", base], ["weekly", weekly], ["monthly", monthly], ["daily", daily]]) {
  ok(Buffer.byteLength(html) <= budget, `${label} home stays within the HTML budget (${Buffer.byteLength(html)}B)`);
}

// V22.9.0: 여기 있던 단언은 "일별은 예산보다 무겁다" 였다. 그게 사실이었기 때문에
// 기본으로 켤 수 없었고, 그래서 홈의 큰 카드가 늘 비어 있었다. 인라인 style 을
// 걷어낸 지금 일별은 더 이상 예산 밖이 아니다 — 그래서 위 반복문에 함께 넣었다.
//
// 지키던 성질("일별이 조용히 더 커지지 않는다")은 없애지 않고 더 조인다. 절대값
// 상한 대신 **가장 가벼운 뷰와의 차이**로 재면, 홈 전체가 커져도 이 격자 자체가
// 다시 뚱뚱해지는 것만 골라서 잡는다. 인라인 style 이 돌아오면 이 차이가 27 KB 로
// 튀므로 여기서 걸린다.
const dailyBytes = Buffer.byteLength(daily);
const dailyCost = dailyBytes - Buffer.byteLength(monthly);
ok(dailyCost > 0, `일별 격자는 실제로 무언가를 그린다 (${dailyCost}B)`);
ok(dailyCost < 6 * 1024, `일별 격자 31칸이 6 KiB 안에 들어온다 (${dailyCost}B)`);

// 거래내역 탭은 트렌드를 그리지 않고 월별 질의도 하지 않는다.
const tab = await (await get(`/app?month=2026-07&tab=transactions${hh}`)).text();
eq(tab.includes("homeTrendSeg"), false, "the transactions tab renders no trend toggle");

console.log(`PASS: V22.8.79 home trend and income usage (${checks} checks)`);
