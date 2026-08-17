// V22.8.88 — 통합 작업지시서 M2(홈 카드 합치기)·M3(하루 환산) 검사.
//
// M2 의 핵심은 "같은 이야기를 두 번 하지 않는다"였다. 홈에는 "N월 지출" · "이번 달 쓸
// 수 있는 돈" · "오늘 쓴 돈" 세 카드가 따로 있었고, 셋 다 같은 달의 같은 지출을 다른
// 각도로 반복했다. 이제 P0 하나로 합친다.
//
// M3 의 계산식은 이미 있었다(remainDays · dailyAllowanceAmt). 다만 그 값이 "오늘 쓴 돈"의
// 글자색을 고르는 데만 쓰이고 화면에 나온 적이 없었다. 이 릴리스가 그 값을 보여 준다.
//
// 통과 조건은 "DB 질의 수 증가 0건"이다. 새 숫자를 보여 주려고 질의를 하나 더 던지면
// 홈이 느려지고, 그 비용은 화면에 보이지 않는다. 그래서 질의 수를 직접 센다.

import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const currentMonth = new Date().toISOString().slice(0, 7);
const householdId = "house-home";

async function renderHome(setup = () => {}, month = currentMonth) {
  const fixture = await createV2265QaFixture();
  setup(fixture);
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "mock.supabase.co") calls.push(url.pathname);
    return realFetch(input, init);
  };
  try {
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com/app?month=${month}&household_id=${householdId}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), fixture.env, {});
    return { status: response.status, html: await response.text(), calls: calls.slice() };
  } finally {
    globalThis.fetch = realFetch;
    fixture.restore();
  }
}

const addTotalBudget = (fixture, amount) => fixture.db.accountbook_budgets.push({ id: `total-${amount}`, household_id: householdId, month: currentMonth, category: "__total", amount, created_at: `${currentMonth}-01T00:00:00.000Z` });
const addExpense = (fixture, total, count = 4) => {
  for (let index = 0; index < count; index += 1) {
    fixture.db.transactions.push({ id: `plan-${index}`, household_id: householdId, user_id: "user-bin", transaction_date: `${currentMonth}-02`, type: "expense", amount: Math.round(total / count), category: "식비", memo: `지출 ${index}`, payment_method: "현금", source: "web", created_at: `${currentMonth}-02T09:00:00.000Z` });
  }
};
const planOf = (html) => {
  const block = (html.match(/<div class="homeDailyPlan[^"]*">[\s\S]*?<\/div>/) || [""])[0];
  return { block, text: block.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() };
};

// ---------------------------------------------------------------------------
// 1. DB 질의 수는 늘지 않아야 한다. 이 릴리스가 쓰는 값은 전부 이미 받아 둔 것이다.
// ---------------------------------------------------------------------------
const baseline = await renderHome((fixture) => { addTotalBudget(fixture, 1000000); addExpense(fixture, 200000); });
eq(baseline.status, 200, "홈이 렌더된다");
// V22.8.94(8.4): 10 → 11. 홈 구성이 (가계부·사용자) 설정 한 줄을 더 읽는다.
// PR4·PR7 이 지키던 것은 "화면을 더하려고 자료를 다시 받지 않는다"였고 그건 그대로다
// — 거래·예산·가계부 조회는 한 번도 늘지 않았다. 늘어난 하나가 정확히 그 설정 한
// 줄인지는 validate-home-layout-v22894.mjs 가 키까지 보고 확인한다.
eq(baseline.calls.length, 11, `홈의 DB 질의 수가 그대로다 (${baseline.calls.length}회)`);
eq(baseline.calls.filter((path) => path.includes("accountbook_budgets")).length, 1, "예산 질의는 한 번뿐이다");
eq(baseline.calls.filter((path) => path.includes("transactions")).length, 2, "거래 질의 수가 그대로다");

// ---------------------------------------------------------------------------
// 2. M2 합치기. 화면에 34px 대표 숫자는 하나뿐이어야 한다.
// ---------------------------------------------------------------------------
eq((baseline.html.match(/class="homeBudgetAmount"/g) || []).length, 1, "대표 숫자 카드는 화면에 하나다");
ok(baseline.html.includes('class="homeBudgetToday"'), "오늘 쓴 돈이 P0 안의 한 줄로 들어왔다");
eq(baseline.html.includes("homeMetric homeToday"), false, "오늘 쓴 돈이 더 이상 별도 타일이 아니다");
ok(baseline.html.includes("이번 달 쓸 수 있는 돈"), "P0 의 이름은 쓸 수 있는 돈이다");

// ---------------------------------------------------------------------------
// 3. M3 하루 환산 — 네 갈래. 0 으로 나누거나 음수를 보여 주면 안 된다.
// ---------------------------------------------------------------------------
const noBudget = await renderHome();
const noBudgetPlan = planOf(noBudget.html);
ok(noBudgetPlan.block.includes("homeDailyPlanEmpty"), "예산이 없으면 안내 줄로 바뀐다");
ok(noBudgetPlan.text.includes("예산을 설정하면 하루 기준이 생겨요"), "현행 문구를 유지한다");
ok(/href="\/budgets\?/.test(noBudgetPlan.block), "그 줄에서 예산 설정으로 갈 수 있다");

const slow = await renderHome((fixture) => { addTotalBudget(fixture, 3000000); addExpense(fixture, 200000); });
const slowPlan = planOf(slow.html);
ok(/남은 \d+일 동안/.test(slowPlan.text), `남은 일수를 말한다 (${slowPlan.text})`);
// V22.8.93(9.3): 금액이 <span data-ab-num> 로 감싸져 태그를 걷어내면 숫자와 단위
// 사이에 공백이 생긴다. 화면에 보이는 글자는 그대로다 — 지키려는 것은 "하루 기준
// 금액을 말한다"이므로 태그 경계의 공백은 허용한다.
ok(/하루 [\d,]+\s*원/.test(slowPlan.text), `하루 기준 금액을 말한다 (${slowPlan.text})`);
// 그리고 그 금액에는 스크립트가 굴릴 값이 실려 있어야 한다(9.1).
ok(/<span data-ab-num="\d+" data-ab-num-unit="원">/.test(slowPlan.block), "하루 환산 금액에 전환 대상 값이 실려 있다");
ok(slowPlan.text.includes("이 속도면") && slowPlan.text.includes("남습니다"), "느린 속도에서는 남을 금액을 말한다");

const fast = await renderHome((fixture) => { addTotalBudget(fixture, 1000000); addExpense(fixture, 800000); });
const fastPlan = planOf(fast.html);
ok(/지금 속도라면 \d+일 먼저 끝납니다/.test(fastPlan.text), `빠른 속도에서는 며칠 먼저 끝나는지 말한다 (${fastPlan.text})`);

const over = await renderHome((fixture) => { addTotalBudget(fixture, 500000); addExpense(fixture, 900000); });
const overPlan = planOf(over.html);
ok(overPlan.block.includes("homeDailyPlanOver"), "초과는 따로 표시된다");
ok(/이번 달 예산을 [\d,]+원 넘겼어요/.test(overPlan.text), `초과 금액을 말한다 (${overPlan.text})`);
eq(/하루 [\d,]+원/.test(overPlan.text), false, "초과 상태에서 하루 기준 숫자를 함께 보여 주지 않는다");

for (const [name, plan] of [["예산 없음", noBudgetPlan], ["느린 속도", slowPlan], ["빠른 속도", fastPlan], ["초과", overPlan]]) {
  eq(/NaN|Infinity/.test(plan.text), false, `${name}: 계산이 깨지지 않는다`);
  eq(/-\d/.test(plan.text), false, `${name}: 음수를 보여 주지 않는다`);
}

// 지난달을 보고 있으면 "남은 일수"가 성립하지 않으므로 하루 환산을 접는다.
const pastMonth = await renderHome((fixture) => { addTotalBudget(fixture, 1000000); }, "2026-07");
eq(pastMonth.status, 200, "지난달 화면이 열린다");
eq(pastMonth.html.includes('<div class="homeDailyPlan">'), false, "지난달에는 하루 환산을 보여 주지 않는다");
eq(pastMonth.html.includes('class="homeBudgetToday"'), false, "지난달에는 오늘 쓴 돈 줄도 접는다");

// ---------------------------------------------------------------------------
// 4. 온보딩. 완료 후에도 남아 자리를 차지하던 것이 M2 가 지목한 문제였다.
//    이제 기록이 0건일 때만, 최근 내역 자리에 빈 상태로 나온다.
// ---------------------------------------------------------------------------
ok(!baseline.html.includes("homeOnboarding"), "기록이 있으면 온보딩이 없다");
const empty = await renderHome((fixture) => { fixture.db.transactions = fixture.db.transactions.filter((row) => row.household_id !== householdId); });
eq(empty.status, 200, "기록 0건 계정에서도 홈이 열린다");
ok(empty.html.includes("homeOnboarding"), "기록이 0건이면 빈 상태가 나온다");
ok(empty.html.indexOf("homeOnboarding") > empty.html.indexOf('id="v8Feed"'), "빈 상태는 최근 내역 자리에 놓인다");
eq(empty.html.includes('id="v8Search"'), false, "기록이 없을 때 목록 검색칸을 띄우지 않는다");
// 통과 조건은 "증가 0건"이다. 기록이 없는 계정은 오히려 덜 묻는다(9회).
ok(empty.calls.length <= baseline.calls.length, `빈 상태도 질의 수를 늘리지 않는다 (${empty.calls.length} ≤ ${baseline.calls.length})`);

console.log(`PASS: V22.8.88 home blocks and daily allowance (${checks} checks)`);
