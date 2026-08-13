import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.93-NUMBER-TRANSITIONS"'), "runtime exposes the V22.8.81 release");

// ---------------------------------------------------------------------------
// 1. 분류별 예산만 잡은 달의 거짓 초과 경보
//   식비 예산 50만원만 잡아 두면 예전에는 "이번 달 전체 지출 ÷ 식비 예산" 이 되어
//   여행비까지 얹힌 채 200% 초과 경보가 떴다. 예산을 잡은 분류의 지출만 견준다.
// ---------------------------------------------------------------------------

ok(source.includes('const basis = categoryBudgetTotal ? "category" : "total";'), "budgetSummary records which basis it used");
// V22.8.92: 합계를 만드는 방식이 한 번 더 좁아졌다 — 예산 행이 아니라 **분류 이름**
// 을 훑는다. 같은 분류의 예산 행이 둘이면 그 분류의 지출이 두 번 더해져 사용액이
// 실제 지출보다 커졌고, 남은 예산은 그만큼 작게 나왔다. V22.8.81 이 지키려던
// "예산을 잡은 분류의 지출만 견준다"는 그대로이고, 중복만 사라진다.
ok(source.includes("const budgetedExpense = basis === \"category\"\n    ? [...new Set(categoryBudgets.map((b) => b.category))].reduce((a, category) => a + Number(byCategory[category] || 0), 0)\n    : expense;"), "the budgeted spend only sums categories that carry a budget");
ok(!/categoryBudgets\.reduce\(\(a, b\) => a \+ Number\(byCategory\[b\.category\] \|\| 0\), 0\)/.test(source), "a duplicated budget row can no longer double-count its category");
ok(source.includes("const uncoveredExpense = Math.max(0, expense - budgetedExpense);"), "spend outside the budgeted categories is kept as a separate figure");
ok(source.includes("basis, budgetedExpense, uncoveredExpense,"), "the summary exposes the new fields");
ok(source.includes("remaining: totalBudget ? Math.max(0, totalBudget - budgetedExpense) : 0,"), "the remaining figure uses the budgeted spend");
ok(source.includes("rate: totalBudget ? Math.round(budgetedExpense / totalBudget * 100) : 0,"), "the rate uses the budgeted spend");
ok(source.includes("diff: budgetedExpense - totalBudget,"), "the over/under difference uses the budgeted spend");
// 전체 지출 자체는 계속 들고 있어야 한다. 다른 화면이 이 값을 쓴다.
ok(source.includes("totalBudget, explicitTotalBudget, categoryBudgetTotal, expense,"), "the raw total expense is still exposed");

// 소비자 4곳이 모두 같은 기준을 쓴다(한 곳이라도 빠지면 화면마다 숫자가 달라진다).
ok(source.includes("const budgetUsed = Number(budget.budgetedExpense ?? stats.totals.expense ?? 0);"), "the home gauge uses the budgeted spend");
ok(source.includes("const spent = Number(budget.budgetedExpense ?? budget.expense ?? 0);"), "the budget alert model uses the budgeted spend");
ok(source.includes("const budgetedExpense = Number(budget.budgetedExpense ?? expense);"), "the report dashboard uses the budgeted spend");
ok(source.includes('name = "예산 잡은 분류 합계"; info = budgetStageInfo(budgeted, total);'), "the kakao alert line names the budgeted-category basis");

// 더 작아진 "사용" 숫자가 오해를 부르지 않도록 예산 밖 지출을 따로 적어 준다.
ok(source.includes("예산 잡은 분류 기준 · 예산 밖 지출 ${numberWithCommas(model.budget.uncoveredExpense)}원 별도"), "the alert centre notes the spend outside the budget");

// ---------------------------------------------------------------------------
// 2. 정기 "수입" 인데 납부라고 부르던 문구
// ---------------------------------------------------------------------------

ok(source.includes('다음 ${isIncome ? "입금" : "납부"}일'), "reserve cards say 입금일 for income and 납부일 for expense");
ok(source.includes("원 들어올 예정`;"), "the kakao reserve alert says money is coming in for income items");
ok(source.includes("🔔 다가오는 정기 수입·지출"), "the kakao reserve alert header covers both directions");
ok(source.includes("<label>납부·입금일<input name=\"due_day\""), "the add form label covers both directions");
ok(source.includes('<label class="dueMonth due1">납부·입금월 1'), "the due month label covers both directions");
eq(/납부일<input name="due_day"/.test(source), false, "no expense-only due-day label remains");

// ---------------------------------------------------------------------------
// 3. 탭 이름이 정기지출이라 수입이 빠져 보이던 문제
// ---------------------------------------------------------------------------

ok(source.includes("<h1>정기 수입·지출</h1>"), "the reserve page heading covers both directions");
ok(source.includes("<b>정기 수입·지출</b><span>세금·보험</span>"), "the home shortcut covers both directions");

// ---------------------------------------------------------------------------
// 4. 예산·정기·설정 세 화면의 진입점 통합
//   /my/settings 는 좌측 사이드바에서만 열려 메인 내비에서 도달할 길이 없었다.
// ---------------------------------------------------------------------------

ok(source.includes("function renderMoneyPlanTabs(active = \"budgets\""), "the shared section tab helper exists");
ok(source.includes('["budgets", "월별 예산·수입", "/budgets", "이번 달에만 적용"]'), "the monthly budget tab says it applies to this month only");
ok(source.includes('["reserve-plans", "정기 수입·지출", "/reserve-plans", "매달·매년 반복"]'), "the recurring tab says it repeats");
ok(source.includes('["settings", "설정 한눈에", "/my/settings", "요약·정기·분류"]'), "the settings page is reachable as a tab");
ok(source.includes("function moneyPlanTabsCss()"), "the tab styling helper exists");
// 새 CSS 는 다크 커버리지를 함께 넣는다(작업지시 금지사항).
ok(source.includes('html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a{'), "dark coverage exists for the tabs");
ok(source.includes('html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a.on{'), "dark coverage exists for the active tab");
// 세 화면 모두 같은 탭 바를 그린다.
eq((source.match(/\$\{renderMoneyPlanTabs\(/g) || []).length, 3, "all three pages render the shared tab bar");
eq((source.match(/\$\{moneyPlanTabsCss\(\)\}/g) || []).length, 3, "all three pages carry the tab styling");

// 내비게이션은 "예산·정기" 하나로 모인다.
ok(source.includes('["budgets", "예산·정기", `/budgets?month=${encodeURIComponent(month)}${hh}`, "budget"]'), "the sidebar carries one merged entry");
eq(source.includes('["reserve-plans", "정기 수입·지출", `/reserve-plans?month=${encodeURIComponent(month)}${hh}`, "recurring"]'), false, "the records group no longer duplicates the recurring entry");
ok(source.includes('["reserve-plans", "budgets"], ["settings", "budgets"]'), "any tab lights up the merged nav entry");

// 라우트는 하나도 지우지 않는다(금지 사항).
for (const route of ["/reserve-plans", "/my/settings", "/budgets", "/admin/recurring/save", "/admin/recurring/apply", "/admin/recurring/delete", "/admin/reserve-plan/create", "/admin/reserve-plan/update", "/admin/reserve-plan/delete"]) {
  ok(source.includes(`"${route}"`), `${route} is preserved`);
}

// 키워드 편집기 중복 제거: /keyword-guide 한 곳만 남는다.
// 정의 1회 + 호출 1회 = 2. 호출이 2회가 되는 순간 편집기가 다시 두 곳에 붙은 것이다.
eq((source.match(/renderKeywordBulkEditor\(/g) || []).length, 2, "only one page mounts the keyword editor");
ok(source.includes('href="/keyword-guide?${hh}">분류·키워드 관리 열기</a>'), "the settings page points at the single keyword home");
ok(source.includes("function renderKeywordBulkEditor("), "the keyword editor itself is untouched");

// ---------------------------------------------------------------------------
// 5. 부부 전용으로 읽히던 정산 메뉴 이름
// ---------------------------------------------------------------------------

ok(source.includes('["settlement", "정산 요약", `/settlement-summary?month=${encodeURIComponent(month)}${hh}`, "settlement"]'), "the settlement entry no longer assumes a couple");
eq(source.includes("부부 정산"), false, "no couple-only settlement label remains");

// ---------------------------------------------------------------------------
// 실제 왕복
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path, init = {}) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  ...init,
  headers: { cookie: fixture.cookie, ...(init.headers || {}) },
}), fixture.env, {});

// 사용자가 실제로 겪은 상황을 그대로 만든다.
//   식비 예산 500,000원만 설정 · 식비 지출 100,000원 · 예산 없는 여행 지출 900,000원
fixture.db.accountbook_budgets.push({ id: "b81-food", household_id: "house-home", month: "2026-08", category: "식비", amount: 500000, created_at: "2026-08-01T00:00:00.000Z" });
fixture.db.transactions.push(
  { id: "tx81-food", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-08-03", type: "expense", amount: 100000, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: "장보기 100000" },
  { id: "tx81-trip", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-08-04", type: "expense", amount: 900000, category: "여행", memo: "항공권", payment_method: "국민카드", source: "web", raw_text: "항공권 900000" },
);

const alertsHtml = await (await get("/budget-alerts?month=2026-08&household_id=house-home")).text();
const metric = (label) => (alertsHtml.match(new RegExp(`<span>${label}</span><b>([^<]*)</b>`)) || [])[1];
eq(metric("예산 사용률"), "20%", "the rate compares the budgeted category only (100,000 / 500,000)");
eq(metric("이번 달 사용"), "100,000원", "the spend figure counts only the budgeted category");
eq(metric("남은 예산"), "400,000원", "the remaining budget is not eaten by unbudgeted spend");
eq(/예산 초과/.test(alertsHtml), false, "no false over-budget alarm is raised");
ok(alertsHtml.includes("예산 밖 지출 900,000원 별도"), "the unbudgeted spend is disclosed instead of hidden");

// 총액(__total) 예산만 있는 달은 예전 그대로 전체 지출을 견준다.
fixture.db.accountbook_budgets.push({ id: "b81-total", household_id: "house-home", month: "2026-09", category: "__total", amount: 1000000, created_at: "2026-09-01T00:00:00.000Z" });
fixture.db.transactions.push({ id: "tx81-sep", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-09-02", type: "expense", amount: 400000, category: "여행", memo: "숙소", payment_method: "국민카드", source: "web", raw_text: "숙소 400000" });
const totalHtml = await (await get("/budget-alerts?month=2026-09&household_id=house-home")).text();
const totalMetric = (label) => (totalHtml.match(new RegExp(`<span>${label}</span><b>([^<]*)</b>`)) || [])[1];
eq(totalMetric("예산 사용률"), "40%", "a total-only budget still compares the whole month's spend");
eq(totalHtml.includes("예산 밖 지출"), false, "a total-only budget has no spend outside the budget");

// 세 화면이 서로를 가리키고, 현재 탭만 켜진다.
for (const [path, activeLabel] of [
  ["/budgets?month=2026-08&household_id=house-home", "월별 예산·수입"],
  ["/reserve-plans?month=2026-08&household_id=house-home", "정기 수입·지출"],
  ["/my/settings?month=2026-08&household_id=house-home", "설정 한눈에"],
]) {
  const res = await get(path);
  eq(res.status, 200, `${path} renders`);
  const html = await res.text();
  ok(html.includes('class="abMoneyPlanTabs"'), `${path} shows the section tabs`);
  ok(html.includes(".abMoneyPlanTabs a.on{"), `${path} ships the tab styling`);
  eq((html.match(/class="on" aria-current="page"><b>([^<]*)/) || [])[1], activeLabel, `${path} marks its own tab as current`);
  for (const target of ["/budgets?", "/reserve-plans?", "/my/settings?"]) {
    ok(html.includes(target), `${path} links to ${target}`);
  }
}

// 설정 화면에서 키워드 편집기가 사라지고 링크만 남았다.
const settingsHtml = await (await get("/my/settings?month=2026-08&household_id=house-home")).text();
ok(settingsHtml.includes("분류·키워드 관리 열기"), "the settings page links to the keyword manager");
eq(settingsHtml.includes("/my/category-keywords/bulk-save"), false, "the duplicate keyword editor is gone from settings");
const keywordHtml = await (await get("/keyword-guide?month=2026-08&household_id=house-home")).text();
ok(keywordHtml.includes("/my/category-keywords/bulk-save"), "the keyword manager still carries the editor");

// 내비에서 정기 항목은 예산·정기 하나로 모였고, 정산은 부부를 벗어났다.
const homeHtml = await (await get("/app?month=2026-08&household_id=house-home")).text();
ok(homeHtml.includes("예산·정기"), "the nav shows the merged entry");
eq(homeHtml.includes('data-key="reserve-plans"'), false, "the nav no longer carries a separate recurring entry");
eq(homeHtml.includes("부부 정산"), false, "the couple-only label is gone from the nav");
ok(homeHtml.includes("정산 요약"), "the settlement entry keeps a neutral name");
ok(homeHtml.includes("/reserve-plans?"), "the home still offers a shortcut to the recurring page");

// 정기 화면에서 수입 항목은 입금이라고 말한다.
const created = await get("/admin/reserve-plan/create", {
  method: "POST",
  body: new URLSearchParams({ household_id: "house-home", month: "2026-08", name: "월세수입", amount: "600000", type: "income", is_recurring: "1", recurrence: "monthly", due_day: "5", category: "기타수입" }),
  headers: { "content-type": "application/x-www-form-urlencoded" },
});
eq(created.status, 303, "an income plan can be created");
const reserveHtml = await (await get("/reserve-plans?month=2026-08&household_id=house-home")).text();
ok(reserveHtml.includes("다음 입금일"), "an income plan says 입금일");
ok(reserveHtml.includes("다음 납부일"), "an expense plan still says 납부일");

// 홈 HTML 예산은 그대로 지킨다.
ok(Buffer.byteLength(homeHtml) < 47104, `home HTML stays within budget (${Buffer.byteLength(homeHtml)}B)`);

console.log(`PASS: V22.8.81 budget basis, income wording and IA merge (${checks} checks)`);
