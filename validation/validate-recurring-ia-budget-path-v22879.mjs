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
// P1-A. 홈 고정지출 폼 → 정기 관리 페이지 진입 카드
// ---------------------------------------------------------------------------

// 1. 홈 템플릿에서 고정지출 섹션이 사라졌다.
eq(source.includes('<section id="fixed" class="panel"><h2>고정지출</h2>'), false, "the home fixed-expense section is gone from the template");

// 2. 라우트와 시그니처는 지우지 않는다(금지 사항).
for (const route of ["/admin/recurring/save", "/admin/recurring/apply", "/admin/recurring/delete"]) {
  ok(source.includes(`"${route}"`), `${route} route is preserved`);
}
ok(source.includes("async function handleRecurringApply"), "the apply handler is preserved");

// 3. 집계는 기존 함수를 호출만 한다.
ok(source.includes("const homeReserve = reserveDashboard(reservePlans);"), "the card reuses reserveDashboard");
ok(source.includes("function reserveDashboard(plans = [], fromDate = nowKstDate()) {"), "reserveDashboard itself is untouched");
// 5단계에서 수입 항목이 생기면서 이 합계는 "지출만" 을 세도록 좁혀졌다.
// 예전 데이터는 전부 지출이라 값은 달라지지 않는다(홈 카드의 뜻도 그대로).
ok(source.includes("const monthlyReserveTotal = statuses.filter((s) => !isIncome(s)).reduce((a, s) => a + Number(s.monthly_reserve || 0), 0);"), "the monthly preparation total sums expense plans");
ok(source.includes("const monthlyIncomeTotal = statuses.filter(isIncome).reduce"), "income plans are totalled separately");

// 4. 정기항목을 안 불러온 달에서는 건수를 단정하지 않는다.
ok(source.includes("const homeReserveHeadline = !reserveLoaded"), "the headline branches on whether reserve data was loaded");
ok(source.includes('? "이번 달 기준으로 관리해요"'), "an unloaded month gets neutral copy");
ok(source.includes("reserveLoaded: includeReserve"), "the loader flag is passed through to the renderer");
ok(source.includes("const includeReserve = !!selectedHousehold && month === currentMonthKst();"), "the loader gate itself is unchanged");

// 5. 카드 문자열은 escapeHtml 을 통과한다.
ok(source.includes("${escapeHtml(homeReserveHeadline)}"), "the headline is escaped");
// V22.9.89 U-07: 작은 줄이 여러 줄(이번 달 아직 안 나감 · 납부·입금 일정)이 되어 줄마다 escapeHtml 을 거친다.
ok(source.includes('${homeReserveSubs.map((line) => `<small>${escapeHtml(line)}</small>`).join("")}'), "the sub copy is escaped");
ok(source.includes("${escapeHtml(homeReserveHref)}"), "the card href is escaped");

// 6. 라이트/다크 스타일이 있다.
ok(source.includes(".homeReserveCard{display:flex"), "light styling exists for the card");
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.txTabHead,.txTabFilter,.homeReserveCard)'), "dark coverage includes the card");

// ---------------------------------------------------------------------------
// P1-B. 예산 진입 동선
// ---------------------------------------------------------------------------

// 7. 리포트 표는 읽기전용이고 상단 링크만 붙는다.
ok(source.includes('<a class="budgetTableSet" href="/budgets?${qs}">예산 설정 →</a>'), "the report budget table links to /budgets");
ok(source.includes("${renderBudgetGaugeRows(budget)}"), "the read-only gauge table stays");
ok(source.includes("function renderBudgetGaugeRows(budget = {}) {"), "renderBudgetGaugeRows is untouched");
// V22.9.80 V76 M-7: 연결한 환불 차감을 받는 선택 인자가 붙었다(기본 빈 목록 — 예전 두 인자 호출의 결과는 같다).
ok(source.includes("function budgetCenterSummary(rows = [], budgets = [], { refundDeductions = [] } = {}) {"), "budgetCenterSummary keeps its two leading arguments");

// 8. 사이드·하단 내비의 예산 진입은 /budgets 하나로 모인다.
// V22.8.81 부터 사이드바 항목 이름은 "예산·정기"다(예산·정기·설정을 한 묶음으로 합쳤다).
// 이름은 바뀌었지만 진입 주소가 /budgets 하나라는 계약은 그대로다.
ok(source.includes('["budgets", "예산", `/budgets?month=${encodeURIComponent(month)}${hh}`, "budget"]'), "the sidebar budget entry points at /budgets");
// V22.8.87(M1): 정의에 "가운데 ＋ 인가" 표시가 한 칸 붙었다. 주소 계약은 그대로다.
ok(source.includes('["budgets", "예산", "budget", `/budgets?month=${encodeURIComponent(month)}${hh}`, false]'), "the bottom budget tab points at /budgets");

// ---------------------------------------------------------------------------
// 실제 렌더
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path) => app.fetch(new Request(`https://malhaebook.com${path}`, {
  headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
}), fixture.env, {});
const hh = "&household_id=house-home";
const kstMonth = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);
const cardOf = (html) => (html.match(/<a class="homeReserveCard"[\s\S]*?<\/a>/) || [""])[0];

// 이번 달: 픽스처에 자동차보험(연 1회 1,200,000원)이 있으므로 실제 집계가 나와야 한다.
const nowHome = await (await get(`/app?month=${kstMonth}${hh}`)).text();
const nowCard = cardOf(nowHome);
ok(nowCard, "the reserve entry card renders on the current month");
ok(nowCard.includes("1건"), "the card counts the fixture reserve plan");
// V22.9.89 U-07(사용자 결정 D-9): 홈 카드는 매달 자동 기록(픽스처의 월세 650,000원)을 첫 줄에, 납부·입금 일정은 가장 가까운 한 건을 적는다.
// 월 준비 권장액(1,200,000 / 12)은 정기 수입·지출 화면의 납부·입금 일정 칸으로 옮겼다(아래 reserveHtml 에서 본다).
ok(nowCard.includes("매달 나감 650,000원") && nowCard.includes("납부·입금 일정 1건 · 자동차보험"), "the card shows the monthly fixed items first and the nearest schedule");
ok(nowCard.includes("/reserve-plans?"), "the card links to the reserve plans page");

// 과거 달: 정기항목을 불러오지 않으므로 "없음" 이라고 말하면 안 된다.
const pastHome = await (await get(`/app?month=2026-07${hh}`)).text();
const pastCard = cardOf(pastHome);
ok(pastCard, "the reserve entry card renders on a past month too");
eq(pastCard.includes("아직 등록한 항목이 없어요"), false, "an unloaded month never claims there are no items");
ok(pastCard.includes("이번 달 기준으로 관리해요"), "an unloaded month uses neutral copy");

// 홈에서 고정지출 입력폼이 사라졌다.
for (const html of [nowHome, pastHome]) {
  eq(html.includes("/admin/recurring/save"), false, "the home no longer carries the recurring form");
  eq(html.includes('id="fixed"'), false, "the home no longer renders the fixed section");
}

// 정기 관리 페이지는 그대로 살아 있다.
const reserveRes = await get(`/reserve-plans?month=${kstMonth}${hh}`);
eq(reserveRes.status, 200, "the reserve plans page still renders");
const reserveHtml = await reserveRes.text();
ok(reserveHtml.includes("/admin/reserve-plan/create"), "the reserve plans page keeps its create form");
ok(reserveHtml.includes("자동차보험"), "the reserve plans page lists the fixture plan");
ok(reserveHtml.includes("<span>월 준비 권장액</span><b>100,000원"), "the monthly preparation amount (1,200,000 / 12) lives in the schedule section");

// 리포트: 표는 읽기전용, 링크만 예산으로.
const reportHtml = await (await get(`/my/analysis?month=${kstMonth}${hh}&view=report`)).text();
ok(reportHtml.includes("분류별 예산 사용률"), "the report keeps the budget usage table");
ok(reportHtml.includes("예산 설정 →"), "the report exposes the budget settings link");
const tableBlock = reportHtml.slice(reportHtml.indexOf("분류별 예산 사용률"), reportHtml.indexOf("분류별 예산 사용률") + 1200);
eq(/<form/.test(tableBlock), false, "the report budget table stays read-only");

// 홈 HTML 예산은 그대로 지킨다.
ok(Buffer.byteLength(nowHome) < 47104, `home HTML stays within budget (${Buffer.byteLength(nowHome)}B)`);

console.log(`PASS: V22.8.79 recurring IA and budget path (${checks} checks)`);
