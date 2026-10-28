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

// 서버는 KST 기준 달을 쓴다(currentMonthKst). UTC 로 재면 월말 15시 이후 아홉 시간 동안
// 달이 어긋나 픽스처가 지난달에 실리고 "남은 일수"가 0이 된다.
// 모든 속도 시나리오를 10일 정오(KST)에 재현한다. 1일에는 같은 20만원도
// 월말 예상이 600만원 이상이므로 '느린 속도'라는 전제가 성립하지 않는다.
const pinned = new Date(Date.now() + 9 * 3600 * 1000);
const currentMonth = pinned.toISOString().slice(0, 7);
const previousFixedNow = globalThis.__AB_QA_FIXED_NOW_MS;
const pinnedNow = Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth(), 10, 3, 0, 0);
globalThis.__AB_QA_FIXED_NOW_MS = pinnedNow;
const householdId = "house-home";

async function renderHome(setup = () => {}, month = currentMonth) {
  const fixture = await createV2265QaFixture();
  // 공통 픽스처의 2026-07 예산·거래가 7월 시나리오에 섞이지 않도록 분리한다.
  fixture.db.accountbook_budgets = fixture.db.accountbook_budgets.filter((row) => row.household_id !== householdId || row.month !== currentMonth);
  fixture.db.transactions = fixture.db.transactions.filter((row) => row.household_id !== householdId || !String(row.transaction_date).startsWith(currentMonth));
  setup(fixture);
  const realFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "mock.supabase.co") calls.push(url.pathname);
    return realFetch(input, init);
  };
  try {
    const response = await app.fetch(new Request(`https://malhaebook.com/app?month=${month}&household_id=${householdId}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), fixture.env, {});
    return { status: response.status, html: await response.text(), calls: calls.slice() };
  } finally {
    globalThis.fetch = realFetch;
    fixture.restore();
  }
}

const addTotalBudget = (fixture, amount) => fixture.db.accountbook_budgets.push({ id: `total-${amount}`, household_id: householdId, month: currentMonth, category: "__total", amount, created_at: `${currentMonth}-01T00:00:00.000Z` });
// V22.9.76: 홈 속도는 예산 알림과 같이 오늘까지의 기록만 센다. 1일에 재는 갈래는 기록 날짜를 1일로 둔다(day).
const addExpense = (fixture, total, count = 4, day = "02") => {
  for (let index = 0; index < count; index += 1) {
    fixture.db.transactions.push({ id: `plan-${index}`, household_id: householdId, user_id: "user-bin", transaction_date: `${currentMonth}-${day}`, type: "expense", amount: Math.round(total / count), category: "식비", memo: `지출 ${index}`, payment_method: "현금", source: "web", created_at: `${currentMonth}-${day}T09:00:00.000Z` });
  }
};
// V22.9.79 V76 W-7: 하루 계획 아래 한 줄은 월말 예상(기록 + 남은 고정·정기 + 남은 날 예상)으로 말한다. 속도 갈래만 재려고
// 픽스처의 고정지출 규칙(반영 대기 월세)·정기지출 항목을 비운다. 고정지출이 든 갈래는 validate-spending-outlook-v22979 가 본다.
const noFixedItems = (fixture) => {
  fixture.db.accountbook_recurring = fixture.db.accountbook_recurring.filter((rule) => rule.household_id !== householdId);
  fixture.db.accountbook_settings = fixture.db.accountbook_settings.filter((row) => row.key !== `reserve_plans:${householdId}`);
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
// V22.9.16: 11회였던 것이 9회로 줄었다(가계부 행을 참여 행에 포함해 읽고, 홈 구성 설정을 묶음에
// 넣었다). 첫 요청은 통합 계정 캐시가 비어 사용자 행을 한 번 더 읽으므로 9회가 상한이다.
ok(baseline.calls.length <= 9, `홈의 DB 질의 수가 늘지 않는다 (${baseline.calls.length}회, 상한 9회)`);
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
// V22.9.86 T-12(디자인 작업 지시서 §3-6 속도 문장): 하루 계획 줄이 ‘남은 N일 동안 · 하루 N원’ 두 칸에서 한 문장이 됐다.
// 느린 속도(사용률 ≤ 경과율)는 경과율과 사용률을 견주어 말하고, 남은 일수는 빠른 속도(주의) 문장이 말한다(아래).
ok(/이번 달의 \d+%가 지났고 예산은 \d+%만 썼어요/.test(slowPlan.text), `느린 속도는 지난 날과 쓴 예산을 견주어 말한다 (${slowPlan.text})`);
// V22.8.93(9.3): 금액이 <span data-ab-num> 로 감싸져 태그를 걷어내면 숫자와 단위
// 사이에 공백이 생긴다. 화면에 보이는 글자는 그대로다 — 지키려는 것은 "하루 기준
// 금액을 말한다"이므로 태그 경계의 공백은 허용한다.
ok(/하루 [\d,]+\s*원/.test(slowPlan.text), `하루 기준 금액을 말한다 (${slowPlan.text})`);
// 그리고 그 금액에는 스크립트가 굴릴 값이 실려 있어야 한다(9.1).
ok(/<span data-ab-num="\d+" data-ab-num-unit="원">/.test(slowPlan.block), "하루 환산 금액에 전환 대상 값이 실려 있다");
ok(slowPlan.text.includes("월말 예상대로면") && slowPlan.text.includes("남아요"), "느린 속도에서는 남을 금액을 말한다");

// V22.9.16: 이 검사는 "오늘이 며칠인지"에 따라 결과가 달라졌다. 예산 100만원에 80만원을
// 썼을 때 "먼저 끝난다"가 되려면 이 속도로 달 끝까지 갔을 때 예산을 넘어야 하는데,
// 28일에 재면 하루 2.9만원 × 30일 = 86만원이라 넘지 않는다. 그래서 월초에만 통과하고
// 월말(9/28)에는 하네스 전체가 실패했다.
// V22.9.17: 서버의 검증 전용 고정 시계로 "이번 달 10일 정오(KST)"에 고정해 잰다. 어느 날에
// 돌려도 같은 결과가 나오고, 마지막 날에 안내가 비는 갈래는 아래에서 따로 확인한다.
const fast = await renderHome((fixture) => { noFixedItems(fixture); addTotalBudget(fixture, 1000000); addExpense(fixture, 800000); });
const fastPlan = planOf(fast.html);
ok(/예상대로면 예산이 \d+일 먼저 끝나요/.test(fastPlan.text), `빠른 속도에서는 며칠 먼저 끝나는지 말한다 (${fastPlan.text})`);
// V22.9.86 T-12: 빠른 속도(경과율 < 사용률 < 100) 문장이 남은 일수와 하루 금액을 함께 말한다.
ok(/예산은 \d+%를 썼어요\. 남은 \d+일은 하루 [\d,]+\s*원 안에서 써 보세요/.test(fastPlan.text), `빠른 속도에서는 남은 일수와 하루 금액을 말한다 (${fastPlan.text})`);
const lastDay = new Date(Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth() + 1, 0)).getUTCDate();
globalThis.__AB_QA_FIXED_NOW_MS = Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth(), lastDay, 3, 0, 0);
const lastDayPlan = planOf((await renderHome((fixture) => { noFixedItems(fixture); addTotalBudget(fixture, 1000000); addExpense(fixture, 800000); })).html);
// V22.9.86 T-12: 마지막 날은 경과율 100%(사용 80% → 느린 속도 문장)다. 남은 하루로 나누므로 하루 금액이 남은 예산 20만원 전부다.
ok(/이번 달의 100%가 지났고/.test(lastDayPlan.text) && /하루 200,000\s*원씩/.test(lastDayPlan.text), `마지막 날에는 남은 하루로 나눈다 (${lastDayPlan.text})`);
ok(!/먼저 끝나요/.test(lastDayPlan.text), "마지막 날에는 '먼저 끝난다'를 말하지 않는다(달 끝보다 이른 날이 없다)");
// 월초에는 같은 금액도 빠른 속도로 판단하고, 월말에는 느린 속도로 판단한다.
globalThis.__AB_QA_FIXED_NOW_MS = Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth(), 1, 3, 0, 0);
// V22.9.76: 예전에는 2일 날짜 기록 20만원을 1일에 세어 "빠른 속도"가 됐다(미래 날짜 기록까지 지난 날수로 나눈 결함).
// 1일에 쓴 20만원으로 잰다. 2일 날짜 기록만 있으면 아직 쓴 돈이 없으므로 빠르다고 하지 않는다.
const firstDayPlan = planOf((await renderHome((fixture) => { noFixedItems(fixture); addTotalBudget(fixture, 3000000); addExpense(fixture, 200000, 4, "01"); })).html);
const firstDayFuturePlan = planOf((await renderHome((fixture) => { noFixedItems(fixture); addTotalBudget(fixture, 3000000); addExpense(fixture, 200000); })).html);
ok(!/먼저 끝나요/.test(firstDayFuturePlan.text), `1일에 다음 날짜로 미리 적은 지출만 있으면 빠른 속도라고 하지 않는다 (${firstDayFuturePlan.text})`);
ok(/예상대로면 예산이 \d+일 먼저 끝나요/.test(firstDayPlan.text), `1일에는 빠른 속도 안내를 표시한다 (${firstDayPlan.text})`);
globalThis.__AB_QA_FIXED_NOW_MS = Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth(), lastDay, 3, 0, 0);
const slowLastDayPlan = planOf((await renderHome((fixture) => { addTotalBudget(fixture, 3000000); addExpense(fixture, 200000); })).html);
// V22.9.86 T-12: 한 문장이 된 뒤에도 마지막 날은 남은 하루로 나눈다(300만 − 20만 = 하루 280만원).
ok(/이번 달의 100%가 지났고/.test(slowLastDayPlan.text) && /하루 2,800,000\s*원씩/.test(slowLastDayPlan.text), `느린 속도도 마지막 날에는 남은 하루로 나눈다 (${slowLastDayPlan.text})`);
ok(slowLastDayPlan.text.includes("남아요"), "마지막 날에는 남을 금액을 표시한다");
globalThis.__AB_QA_FIXED_NOW_MS = pinnedNow;

const over = await renderHome((fixture) => { addTotalBudget(fixture, 500000); addExpense(fixture, 900000); });
const overPlan = planOf(over.html);
ok(overPlan.block.includes("homeDailyPlanOver"), "초과는 따로 표시된다");
// V22.9.86 T-12: 초과 문장은 §3-6 ‘예산을 N원 넘었어요. …’다(예전 ‘이번 달 예산을 N원 넘겼어요’).
ok(/예산을 [\d,]+원 넘었어요\. 예산을 늘리거나 남은 기간 지출을 줄여 보세요\./.test(overPlan.text), `초과 금액을 말한다 (${overPlan.text})`);
eq(/하루 [\d,]+원/.test(overPlan.text), false, "초과 상태에서 하루 기준 숫자를 함께 보여 주지 않는다");

for (const [name, plan] of [["예산 없음", noBudgetPlan], ["느린 속도", slowPlan], ["빠른 속도", fastPlan], ["초과", overPlan]]) {
  eq(/NaN|Infinity/.test(plan.text), false, `${name}: 계산이 깨지지 않는다`);
  eq(/-\d/.test(plan.text), false, `${name}: 음수를 보여 주지 않는다`);
}

// 지난달을 보고 있으면 "남은 일수"가 성립하지 않으므로 하루 환산을 접는다.
const previousMonth = new Date(Date.UTC(pinned.getUTCFullYear(), pinned.getUTCMonth() - 1, 1)).toISOString().slice(0, 7);
const pastMonth = await renderHome((fixture) => { addTotalBudget(fixture, 1000000); }, previousMonth);
eq(pastMonth.status, 200, "지난달 화면이 열린다");
// V22.9.86 T-12: 하루 계획 줄의 클래스가 ‘homeDailyPlan homePace’가 되어 예전 정확한 태그 비교는 늘 거짓이 된다. 클래스 앞머리로 본다
// (지난달은 초과여도 줄이 없다 — 지시서 §3-6 ‘지난달 보는 중’ 흐름). 이 픽스처의 지난달에는 예산이 없어 예전처럼
// ‘예산을 설정하면 하루 기준이 생겨요’ 링크(homeDailyPlanEmpty)만 있다.
eq(/class="homeDailyPlan(?! homeDailyPlanEmpty")/.test(pastMonth.html), false, "지난달에는 하루 환산을 보여 주지 않는다");
eq(pastMonth.html.includes("--ab-today"), false, "지난달 게이지에는 오늘 표시가 없다");
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
// Lucian E #088: the user authorized exactly one all-time existence read for an empty month.
ok(empty.calls.length <= baseline.calls.length + 1, `빈 상태는 허용한 존재 조회 1회 이내이다 (${empty.calls.length} ≤ ${baseline.calls.length + 1})`);

if (previousFixedNow === undefined) delete globalThis.__AB_QA_FIXED_NOW_MS;
else globalThis.__AB_QA_FIXED_NOW_MS = previousFixedNow;

console.log(`PASS: V22.8.88 home blocks and daily allowance (${checks} checks)`);
