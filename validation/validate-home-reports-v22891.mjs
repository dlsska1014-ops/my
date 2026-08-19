// V22.8.91 — 통합 작업지시서 4.3(중앙 리포트 4장) 검사.
//
// 통과 조건은 "홈이 기존 집계를 재사용(새 쿼리 0)"이다. 네 장은 전부 홈이 이미
// 계산해 둔 값으로 만든다 — 카드를 넣으려고 질의를 하나 더 던지면 홈이 느려지고
// 그 비용은 화면에 보이지 않는다. 그래서 질의 수를 직접 센다.
//
// 카드가 지켜야 하는 성질:
//   - 한 장은 한 질문에만 답한다(넷이 서로 다른 질문이어야 한다).
//   - 하단 한 줄은 숫자를 다시 적지 않고 뜻을 말한다.
//   - 링크는 카드마다 하나다.
//   - "쓰는 속도"는 이번 달 주차가 아니라 지난 4주다. 자료가 없는 주를 0원으로
//     그리면 "안 썼다"는 거짓말이 되므로 빈 자리로 둔다.

import { readFileSync } from "node:fs";
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

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const month = new Date().toISOString().slice(0, 7);
const householdId = "house-home";

async function renderHome(setup = () => {}, ua = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120") {
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
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com/app?month=${month}&household_id=${householdId}`, { headers: { cookie: fixture.cookie, "user-agent": ua } }), fixture.env, {});
    return { status: response.status, html: await response.text(), calls: calls.slice() };
  } finally {
    globalThis.fetch = realFetch;
    fixture.restore();
  }
}

const seed = (fixture) => {
  fixture.db.accountbook_budgets.push({ id: "rep-total", household_id: householdId, month, category: "__total", amount: 1000000, created_at: `${month}-01T00:00:00.000Z` });
  fixture.db.accountbook_budgets.push({ id: "rep-food", household_id: householdId, month, category: "식비", amount: 200000, created_at: `${month}-01T00:00:00.000Z` });
  for (let index = 0; index < 20; index += 1) {
    fixture.db.transactions.push({ id: `rep-${index}`, household_id: householdId, user_id: "user-bin", transaction_date: `${month}-${String((index % 11) + 1).padStart(2, "0")}`, type: "expense", amount: 15000 + index * 900, category: index % 3 === 0 ? "식비" : index % 3 === 1 ? "교통" : "쇼핑", memo: `기록 ${index}`, payment_method: "현금", source: "web", created_at: `${month}-01T09:00:00.000Z` });
  }
};

const home = await renderHome(seed);
eq(home.status, 200, "데스크톱 홈이 렌더된다");

// 1. 통과 조건 — 새 질의 0.
// V22.8.94(8.4): 10 → 11. 홈 구성이 (가계부·사용자) 설정 한 줄을 더 읽는다.
// PR4·PR7 이 지키던 것은 "화면을 더하려고 자료를 다시 받지 않는다"였고 그건 그대로다
// — 거래·예산·가계부 조회는 한 번도 늘지 않았다. 늘어난 하나가 정확히 그 설정 한
// 줄인지는 validate-home-layout-v22894.mjs 가 키까지 보고 확인한다.
eq(home.calls.length, 11, `홈의 DB 질의 수가 그대로다 (${home.calls.length}회)`);
ok(source.includes("renderHomeReportCards({ month, householdId, rows, stats, budgetAlerts: budget.categoryAlerts"), "리포트가 이미 받아 둔 값만 넘겨받는다");
eq(source.includes("await fetchAdminRowsRange(env, { householdId, start: weekStart"), false, "리포트를 위해 새 조회를 덧붙이지 않았다");

// 2. 네 장이 있고, 서로 다른 질문에 답한다.
const section = (home.html.match(/<section class="homeReports"[\s\S]*?<\/section>/) || [""])[0];
ok(section.length > 0, "리포트 섹션이 렌더된다");
const cards = [...section.matchAll(/<article class="homeReport">([\s\S]*?)<\/article>/g)].map((m) => m[1]);
eq(cards.length, 4, `리포트는 네 장이다 (${cards.length})`);
const questions = cards.map((card) => (card.match(/<span>([^<]*)<\/span>/) || [])[1] || "");
eq(questions.join(","), "어디에 썼나,쓰는 속도,예산 항목,앞으로 나갈 돈", `네 질문이 지시서와 같다 (${questions.join(", ")})`);
eq(new Set(questions).size, 4, "네 질문이 서로 다르다");

// 3. 카드마다 링크는 하나. 둘 이상이면 어디로 가는 카드인지 흐려진다.
for (const [index, card] of cards.entries()) {
  const links = (card.match(/<a\b/g) || []).length;
  eq(links, 1, `${questions[index]} 카드의 링크는 하나다 (${links})`);
}
// 기존 분석 화면으로 간다 — 같은 계산을 두 번 구현하지 않고 진입점 역할만 한다(7.4).
ok(section.includes('href="/my/analysis?month='), "소비 분석으로 가는 길이 있다");
ok(section.includes("view=report"), "종합 리포트로 가는 길이 있다");
ok(section.includes('href="/budgets?month='), "예산 설정으로 가는 길이 있다");

// 4. 하단 한 줄은 해석이다. 대표 숫자를 그대로 다시 적으면 안 된다.
for (const [index, card] of cards.entries()) {
  const headline = (card.match(/<b>([^<]*)<\/b>/) || [])[1] || "";
  const read = (card.match(/<small>([^<]*)<\/small>/) || [])[1] || "";
  ok(read.length > 0, `${questions[index]} 카드에 해석 줄이 있다`);
  const amount = (headline.match(/[\d,]{4,}/) || [])[0];
  if (amount) eq(read.includes(amount), false, `${questions[index]} 해석이 대표 숫자를 그대로 반복하지 않는다 (${read})`);
}

// 5. 쓰는 속도 — 지난 4주. 자료가 없는 주는 빈 자리로 둔다.
const paceCard = cards[1];
eq((paceCard.match(/<i\b/g) || []).length, 4, "막대는 네 개다");
ok(source.includes("if (startKey < monthStart) return { covered: false, amount: 0 };"), "달 시작보다 앞선 주는 자료 없음으로 표시한다");
ok(source.includes('class="isBlank"'), "자료 없는 주는 0원 막대가 아니라 빈 자리다");
ok(source.includes("const end = addDays(todayDate, -7 * back);"), "이번 달 주차가 아니라 오늘 기준 지난 4주를 센다");
// 8월 12일 기준으로는 4주가 이 달에 담기지 않으므로 비교 문구가 유보되어야 한다.
const paceRead = (paceCard.match(/<small>([^<]*)<\/small>/) || [])[1] || "";
ok(paceRead.length > 0, `쓰는 속도에 해석이 있다 (${paceRead})`);

// 6. 대표 숫자는 P0 하나뿐이라는 3장 규칙을 깨지 않는다 — 리포트는 num-lg 다.
eq((home.html.match(/class="homeBudgetAmount"/g) || []).length, 1, "34px 대표 숫자는 여전히 화면에 하나다");
const shellFixture = await createV2265QaFixture();
try {
  const shell = await app.fetch(new Request("https://ttokttok-accountbook.com/assets/accountbook-shell-v22912.css"), shellFixture.env, {});
  const css = await shell.text();
  ok(css.includes("body.abV22812Shell .homeReport>b{font-size:var(--ab12-fs-num-lg,22px)"), "리포트 숫자는 num-lg 를 쓴다");
  ok(css.includes("body.abV22812Shell .homeReportGrid{display:grid;grid-template-columns:1fr 1fr"), "데스크톱은 2×2 로 놓는다");
  // 5장 M2 의 "리포트 2칸" — 같은 마크업을 CSS 로 나눈다.
  ok(css.includes("body.abV22812Shell .homeReport:nth-child(n+3){display:none}"), "모바일은 앞의 두 장만 보여 준다");
  // 4.4: 우측 열은 1180px 이하에서 사라진다.
  ok(css.includes("@media(min-width:1181px)"), "우측 열 기준점이 1180px 다");
  eq(css.includes("@media(min-width:1320px)"), false, "옛 1320px 기준점이 남아 있지 않다");
} finally {
  shellFixture.restore();
}

// 7. 모바일에서도 같은 마크업이 온다(바이트를 두 번 싣지 않는다).
const mobile = await renderHome(seed, "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)");
const mobileSection = (mobile.html.match(/<section class="homeReports"[\s\S]*?<\/section>/) || [""])[0];
eq(mobileSection, section, "모바일과 데스크톱이 같은 리포트 마크업을 받는다");
// 모바일은 사이드바 대시보드를 그리지 않아 한 번 덜 묻는다. 늘지만 않으면 된다.
ok(mobile.calls.length <= home.calls.length, `모바일도 질의 수가 늘지 않는다 (${mobile.calls.length} ≤ ${home.calls.length})`);

// 8. 기록이 없는 계정에서도 깨지지 않는다.
const empty = await renderHome((fixture) => { fixture.db.transactions = fixture.db.transactions.filter((row) => row.household_id !== householdId); });
eq(empty.status, 200, "기록 0건에서도 홈이 열린다");
const emptySection = (empty.html.match(/<section class="homeReports"[\s\S]*?<\/section>/) || [""])[0];
ok(emptySection.includes("아직 기록 없음"), "기록이 없으면 그렇게 말한다");
eq(/NaN|Infinity|undefined/.test(emptySection), false, "빈 상태에서 계산이 깨지지 않는다");

console.log(`PASS: V22.8.91 home reports (${checks} checks)`);
