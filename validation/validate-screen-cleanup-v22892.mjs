// V22.8.92 — 통합 작업지시서 7.2–7.6(화면별 정리) 검사.
//
// 11장이 이 PR 에 건 통과 조건은 하나다: "역할별 쓰기 경로 24개 데이터 변경 0건".
// 표면을 옮기는 작업이라 화면은 크게 바뀌지만 **누가 무엇을 저장할 수 있는가**는
// 한 칸도 움직이면 안 된다. 그래서 이 파일의 마지막 절에서 여섯 개 쓰기 경로 ×
// 권한 없는 네 역할 = 24 조합을 실제로 POST 해 보고, 매번 데이터베이스 스냅샷이
// 그대로인지 센다. 화면 정리가 권한 판정을 건드리면 여기서 즉시 실패한다.
//
// 나머지 절은 각 화면이 지시서대로 정리됐는지 본다.
//   7.2 거래내역 — 날짜 헤더 + 그날 합계, 구분선 목록, 한 줄 칩 바
//   7.3 날짜 상세 — 상태 문구가 첫 열기 *전에* 문서에 붙어 있다
//   7.4 소비 분석 — 두 화면의 역할이 화면 첫 줄에 문장으로 있다
//   7.5 예산     — P0 는 남은 예산이고, 예산 밖 지출을 P0 가 직접 말한다
//   7.6 전체 메뉴 — 서랍은 1열, 항목 높이 48px

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

const ORIGIN = "https://ttokttok-accountbook.com";
async function call(fixture, path, cookie, { method = "GET", body } = {}) {
  const headers = { "user-agent": "Mozilla/5.0", cookie, origin: ORIGIN };
  if (body) headers["content-type"] = "application/x-www-form-urlencoded";
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body }), fixture.env, {});
  return { status: response.status, location: response.headers.get("location") || "", text: await response.text() };
}

// 리다이렉트 상태 코드만 보면 "막혔다"고 착각하기 쉽다. 실제로 값이 남았는지까지 본다.
const snapshot = (db) => JSON.stringify({
  tx: db.transactions.map((t) => `${t.id}:${t.amount}:${t.category}:${t.memo}`).sort(),
  budgets: db.accountbook_budgets.map((b) => `${b.household_id}:${b.month}:${b.category}:${b.amount}`).sort(),
  recurring: db.accountbook_recurring.map((r) => `${r.id}:${r.amount}:${r.name}`).sort(),
  settings: db.accountbook_settings.map((s) => `${s.key}=${String(s.value).length}`).sort(),
  households: db.households.map((h) => `${h.id}:${h.name}`).sort(),
  members: db.household_members.map((m) => `${m.household_id}:${m.user_id}:${m.role}`).sort(),
});

// ---------------------------------------------------------------------------
// 7.6 전체 메뉴 서랍 — 1열, 48px
// ---------------------------------------------------------------------------
// 여기에는 같은 선택자를 서로 다르게 정하는 규칙이 셋 있었다. 하나는 `!important`
// 라서 화면 폭과 무관하게 2열이 이겼고, 420px 이하에서 1열로 내리는 규칙은
// 죽은 채로 남아 있었다. 세 규칙을 같은 값으로 맞춰 "무엇이 이기는지"를 읽을
// 필요 자체를 없앤다.
const drawerRules = [...source.matchAll(/\.abNavMobileDrawer \.abNavLinks\{([^}]*)\}/g)].map((m) => m[1]);
ok(drawerRules.length >= 3, `서랍 목록 규칙을 모두 찾았다 (${drawerRules.length}개)`);
for (const [index, rule] of drawerRules.entries()) {
  const columns = (rule.match(/grid-template-columns:([^;}]*)/) || [])[1] || "";
  eq(columns.trim(), "1fr", `서랍 목록 규칙 ${index + 1}은 1열이다 (${columns.trim()})`);
  eq(/!important/.test(rule), false, `서랍 목록 규칙 ${index + 1}에 !important 가 없다`);
}
const drawerItemRules = [...source.matchAll(/\.abNavMobileDrawer \.abNavLinks a\{([^}]*)\}/g)].map((m) => m[1]);
ok(drawerItemRules.length >= 2, `서랍 항목 규칙을 모두 찾았다 (${drawerItemRules.length}개)`);
for (const [index, rule] of drawerItemRules.entries()) {
  const height = (rule.match(/min-height:(\d+)px/) || [])[1] || "";
  eq(height, "48", `서랍 항목 ${index + 1}의 높이는 48px 다 (${height}px)`);
  eq(/min-height:\d+px!important/.test(rule), false, `서랍 항목 ${index + 1}의 높이에 !important 가 없다`);
}

// ---------------------------------------------------------------------------
// 7.3 날짜 상세 — 상태 문구는 첫 열기 전에 문서에 있어야 한다
// ---------------------------------------------------------------------------
// aria-live 는 *이미 등록된* 영역의 글자가 바뀔 때만 읽힌다. 시트를 여는 순간
// 만들어 붙이면 그 안의 문구는 변화가 아니라 처음부터 있던 글자다 — 첫 열기가
// 통째로 묵음이 되던 원인이 이것이다. 두 가지를 함께 확인한다:
//   (1) 시트가 첫 열기 전에 붙는가, (2) 여는 순간의 문구가 실제로 달라지는가.
const dayDetailStart = source.indexOf("function accountbookDayDetailClientMain");
ok(dayDetailStart > 0, "날짜 상세 클라이언트 모듈이 있다");
const dayDetail = source.slice(dayDetailStart, source.indexOf("\nfunction accountbookChallengeClientMain", dayDetailStart));
ok(dayDetail.includes("function prepareLiveRegion() { ensure(); }"), "라이브 리전을 미리 붙이는 함수가 있다");
ok(/DOMContentLoaded", function \(\) \{ prepareLiveRegion\(\); autoOpenReturnedDate\(\); \}/.test(dayDetail), "문서가 준비되면 첫 열기 전에 붙인다");
ok(dayDetail.includes("else { prepareLiveRegion(); autoOpenReturnedDate(); }"), "이미 준비된 문서에서도 곧바로 붙인다");
ok(dayDetail.includes('<small id="abDayDetailStatus" aria-live="polite">거래를 불러오는 중입니다.</small>'), "쉬는 상태의 문구가 시트 마크업에 미리 들어 있다");
ok(dayDetail.includes('node.querySelector("#abDayDetailStatus").textContent = titleFor(date) + " 기록을 불러오는 중입니다.";'), "여는 순간의 문구는 쉬는 상태와 달라 실제 변화가 된다");
eq(dayDetail.includes('node.querySelector("#abDayDetailStatus").textContent = "거래를 불러오는 중입니다.";'), false, "여는 순간 같은 글자를 다시 써서 변화를 지우지 않는다");

// ---------------------------------------------------------------------------
// 7.4 소비 분석 · 종합 리포트 — 역할을 화면 첫 줄에 문장으로
// ---------------------------------------------------------------------------
// V22.8.75 가 나눈 역할("빠르게/깊게")은 그대로 두고, 무엇이 실제로 다른지를
// 덧붙인다. 이름만 다른 두 화면 앞에서 사용자가 어느 쪽을 볼지 판단할 근거는
// "요약이냐 상세냐"가 아니라 "필터가 있느냐 없느냐"다.
ok(source.includes("빠르게 보는 요약 화면입니다."), "V22.8.75 의 요약 역할 문장이 남아 있다");
ok(source.includes("깊게 보는 분석 화면입니다."), "V22.8.75 의 상세 역할 문장이 남아 있다");
eq((source.match(/<b>소비 분석은 필터로 좁혀 보는 화면<\/b>/g) || []).length, 2, "두 화면 모두 소비 분석의 역할을 같은 문장으로 말한다");
eq((source.match(/<b>종합 리포트는 이번 달 전체를 고정해 보는 화면<\/b>/g) || []).length, 2, "두 화면 모두 종합 리포트의 역할을 같은 문장으로 말한다");

// ---------------------------------------------------------------------------
// 7.2 / 7.5 — 소스에 고정되어야 하는 것
// ---------------------------------------------------------------------------
ok(source.includes("function renderV8TxDayGroups("), "거래내역을 날짜별로 묶는 함수가 있다");
ok(source.includes("function txDayHeadLabel("), "날짜 헤더 문구를 만드는 함수가 있다");
// 홈 최근 내역은 손대지 않는다 — 날짜 묶음은 거래내역 탭에서만 쓴다.
eq((source.match(/renderV8TxDayGroups\(txRows/g) || []).length, 1, "날짜 묶음은 거래내역 탭에서만 쓴다");
ok(source.includes(`renderV8TxCards(rows, \`\${currentPath}#feed\``) || /renderV8TxCards\(/.test(source), "카드 렌더러는 그대로 남아 홈에서 계속 쓰인다");
ok(source.includes("const budgetP0Uncovered = Number(center.budget.uncoveredExpense || 0);"), "예산 P0 가 예산 밖 지출을 읽는다");
eq(source.includes('<div class="metric"><span>남은 지출 예산</span>'), false, "남은 예산을 표에서 한 번 더 말하지 않는다");

// ---------------------------------------------------------------------------
// 렌더 확인
// ---------------------------------------------------------------------------
const month = "2026-07";
const householdId = "house-home";
const fixture = await createV2265QaFixture();
try {
  const db = fixture.db;
  const createdAt = "2026-07-01T00:00:00.000Z";
  db.users.push(
    { id: "user-view", kakao_user_key: "kakao_login:view", nickname: "조회씨", created_at: createdAt },
    { id: "user-pend", kakao_user_key: "kakao_login:pend", nickname: "대기씨", created_at: createdAt },
    { id: "user-block", kakao_user_key: "kakao_login:block", nickname: "제한씨", created_at: createdAt },
  );
  db.household_members.push(
    { household_id: householdId, user_id: "user-view", role: "viewer", created_at: createdAt },
    { household_id: householdId, user_id: "user-pend", role: "pending", created_at: createdAt },
    { household_id: householdId, user_id: "user-block", role: "blocked", created_at: createdAt },
  );
  // 씨앗 지출의 절반은 예산을 잡지 않은 분류(쇼핑)다 — "예산 밖 지출"이 실제로
  // 생기는 모양이다. 예산은 이미 식비·교통·카페/간식 세 분류에만 잡혀 있다.
  for (let index = 0; index < 9; index += 1) {
    db.transactions.push({
      id: `cl-${index}`, household_id: householdId, user_id: "user-bin",
      transaction_date: `${month}-${String((index % 3) + 20).padStart(2, "0")}`,
      type: index === 8 ? "income" : "expense", amount: 12000 + index * 1100,
      category: index % 2 === 0 ? "식비" : "쇼핑", memo: `정리 ${index}`,
      payment_method: index % 2 === 0 ? "현금" : "", source: "web", created_at: createdAt,
    });
  }
  const q = `month=${month}&household_id=${householdId}`;

  // --- 7.2 거래내역 탭 ------------------------------------------------------
  const tx = await call(fixture, `/app?${q}&tab=transactions`, fixture.cookie);
  eq(tx.status, 200, "거래내역 탭이 열린다");
  const groups = [...tx.text.matchAll(/<section class="txDayGroup"><h3 class="txDayHead"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/h3>([\s\S]*?)<\/section>\s*(?=<section class="txDayGroup"|<\/div>)/g)];
  ok(groups.length >= 3, `날짜마다 헤더가 하나씩 있다 (${groups.length}개)`);
  const money = (text) => Number(String(text).replace(/[^\d]/g, "") || 0);
  for (const [, label, total, body] of groups) {
    ok(/^\d+월 \d+일 \([일월화수목금토]\)$/.test(label), `날짜 헤더에 요일까지 있다 (${label})`);
    ok(/원$/.test(total), `날짜 헤더 오른쪽이 그날 합계다 (${label} ${total})`);
    // 헤더의 합계는 그 묶음 안 금액의 합이어야 한다 — 표시만 그럴듯하면 안 된다.
    const rowExpense = [...body.matchAll(/<strong class="expense">-([\d,]+)원<\/strong>/g)].reduce((a, m) => a + money(m[1]), 0);
    const rowIncome = [...body.matchAll(/<strong class="income">\+([\d,]+)원<\/strong>/g)].reduce((a, m) => a + money(m[1]), 0);
    const headExpense = money((total.match(/-([\d,]+)원/) || [])[1]);
    const headIncome = money((total.match(/\+([\d,]+)원/) || [])[1]);
    eq(headExpense, rowExpense, `${label} 헤더의 지출 합계가 그 아래 행의 합과 같다`);
    eq(headIncome, rowIncome, `${label} 헤더의 수입 합계가 그 아래 행의 합과 같다`);
  }
  // 씨앗으로 넣은 날짜는 데이터베이스와도 직접 견준다.
  const seededDay = groups.find(([, label]) => label.startsWith("7월 20일"));
  ok(seededDay, "7월 20일 묶음이 있다");
  const seededExpense = db.transactions
    .filter((t) => t.household_id === householdId && t.transaction_date === `${month}-20` && t.type !== "income")
    .reduce((a, t) => a + Number(t.amount || 0), 0);
  ok(seededDay[2].includes(seededExpense.toLocaleString("en-US")), `7월 20일 합계가 실제 지출과 같다 (${seededDay[2]})`);
  // 구분선 목록 — 묶음 안 카드는 테두리·그림자를 벗는다.
  ok(source.includes(".txDayGroup .v8-tx{min-height:56px;"), "묶음 안 행은 56px 구분선 목록이다");
  ok(/\.txDayGroup \.v8-tx\{[^}]*box-shadow:none/.test(source), "묶음 안 행은 카드 그림자를 벗는다");

  // 한 줄 칩 바 — 링크라서 JS 없이 동작하고, 지금 걸린 조건을 스스로 말한다.
  const chipBar = (tx.text.match(/<nav class="txChipBar"[\s\S]*?<\/nav>/) || [""])[0];
  ok(chipBar.length > 0, "필터 칩 바가 렌더된다");
  const chips = [...chipBar.matchAll(/<a class="txChip( isOn)?" href="([^"]*)"[^>]*>([^<]*)<\/a>/g)];
  eq(chips.length, 6, `칩은 여섯 개다 (${chips.length})`);
  eq(chips.filter(([, on]) => on).length, 1, "지금 걸린 조건 하나만 켜져 있다");
  eq(chips.find(([, on]) => on)[3], "전체", "조건이 없으면 '전체'가 켜져 있다");
  for (const [, , href] of chips) {
    ok(href.startsWith("/app?"), `칩은 GET 링크다 (${href})`);
    ok(href.includes("tab=transactions"), "칩을 눌러도 거래내역 탭에 남는다");
  }
  // 상세 조건은 접어 두되 사라지지는 않는다.
  ok(tx.text.includes('<details class="txFilterMore"'), "상세 필터는 접힌 채로 남아 있다");
  ok(tx.text.includes('name="payment_method"'), "접힌 폼 안에 결제수단 조건이 그대로 있다");
  ok(tx.text.includes(`<select name="category" aria-label="분류">`), "접힌 폼 안에 분류 조건이 그대로 있다");

  // 칩을 실제로 눌러 본다 — 링크가 조건을 걸고, 켜진 칩이 따라 움직여야 한다.
  const missingHref = chips.find(([, , , label]) => label === "미분류")[2].replace(/&amp;/g, "&");
  const missing = await call(fixture, missingHref, fixture.cookie);
  eq(missing.status, 200, "'미분류' 칩이 실제로 열린다");
  const missingChips = [...missing.text.matchAll(/<a class="txChip( isOn)?"[^>]*>([^<]*)<\/a>/g)];
  eq(missingChips.find(([, on]) => on)[2], "미분류", "누른 칩이 켜진 칩이 된다");
  ok(missing.text.includes('aria-current="true"'), "켜진 칩을 보조기기도 읽을 수 있다");
  eq(missing.text.includes('<details class="txFilterMore" open>'), true, "조건이 걸리면 상세 폼이 펼쳐진다");

  // --- 7.5 예산 화면 --------------------------------------------------------
  const budget = await call(fixture, `/budgets?${q}`, fixture.cookie);
  eq(budget.status, 200, "예산 화면이 열린다");
  const p0 = (budget.text.match(/<section class="budgetP0"[\s\S]*?<\/section>/) || [""])[0];
  ok(p0.length > 0, "예산 화면에 P0 가 있다");
  ok(p0.includes("이번 달 남은 예산"), "P0 는 설정 표가 아니라 남은 예산이다");
  ok(/예산 밖 지출 [\d,]+원 별도/.test(p0), "예산 밖 지출을 P0 가 직접 말한다");
  ok(p0.includes("예산을 잡은 분류만 사용률에 들어갑니다"), "사용률이 낮게 보이는 이유를 P0 가 설명한다");
  // 화면당 대표 숫자는 하나다(3장).
  eq((budget.text.match(/class="budgetP0"/g) || []).length, 1, "대표 숫자 자리는 하나다");
  eq(budget.text.includes("<span>남은 지출 예산</span>"), false, "같은 숫자를 표에서 되풀이하지 않는다");
  // 실제 금액이 맞는지 — 분류 예산만 잡힌 달이므로 사용은 식비 지출만 센다.
  const budgeted = [...new Set(db.accountbook_budgets
    .filter((b) => b.household_id === householdId && b.month === month && Number(b.amount || 0) > 0 && !String(b.category).startsWith("__"))
    .map((b) => b.category))];
  const monthExpense = db.transactions.filter((t) => t.household_id === householdId && String(t.transaction_date).startsWith(month) && t.type !== "income");
  const totalBudget = db.accountbook_budgets
    .filter((b) => b.household_id === householdId && b.month === month && budgeted.includes(b.category))
    .reduce((a, b) => a + Number(b.amount || 0), 0);
  const coveredSpent = monthExpense.filter((t) => budgeted.includes(t.category)).reduce((a, t) => a + Number(t.amount || 0), 0);
  const uncoveredSpent = monthExpense.filter((t) => !budgeted.includes(t.category)).reduce((a, t) => a + Number(t.amount || 0), 0);
  ok(uncoveredSpent > 0, "예산 밖 지출이 실제로 있는 상황이다");
  ok(p0.includes((totalBudget - coveredSpent).toLocaleString("en-US")), "P0 의 남은 예산이 실제 계산과 같다");
  ok(p0.includes(uncoveredSpent.toLocaleString("en-US")), "예산 밖 지출 금액이 실제 계산과 같다");
  // 같은 분류의 예산 행이 둘이면 그 분류의 지출을 두 번 세던 결함을 막는다.
  db.accountbook_budgets.push({ id: "cl-dup-food", household_id: householdId, month, category: "식비", amount: 100000, created_at: createdAt });
  const dup = await call(fixture, `/budgets?${q}`, fixture.cookie);
  const dupP0 = (dup.text.match(/<section class="budgetP0"[\s\S]*?<\/section>/) || [""])[0];
  ok(dupP0.includes(`사용 ${coveredSpent.toLocaleString("en-US")}원`), "예산 행이 겹쳐도 지출을 두 번 세지 않는다");
  db.accountbook_budgets = db.accountbook_budgets.filter((b) => b.id !== "cl-dup-food");

  // 예산이 없는 달에는 빈 P0 가 자리를 지킨다 — 자리 자체가 사라지면 화면이 흔들린다.
  const emptyBudget = await call(fixture, `/budgets?month=2026-05&household_id=${householdId}`, fixture.cookie);
  eq(emptyBudget.status, 200, "예산이 없는 달도 열린다");
  ok(emptyBudget.text.includes('class="budgetP0 isEmpty"'), "예산이 없으면 빈 P0 가 자리를 지킨다");
  ok(emptyBudget.text.includes("지출 분류별 한도를 저장하면 남은 예산이 이 자리에 생깁니다"), "빈 P0 는 다음 할 일을 말한다");

  // --- 7.4 두 화면 ----------------------------------------------------------
  for (const [path, label] of [[`/my/analysis?${q}`, "소비 분석"], [`/my/analysis?view=report&${q}`, "종합 리포트"]]) {
    const page = await call(fixture, path, fixture.cookie);
    eq(page.status, 200, `${label} 화면이 열린다`);
    ok(page.text.includes("소비 분석은 필터로 좁혀 보는 화면"), `${label} 이 소비 분석의 역할을 말한다`);
    ok(page.text.includes("종합 리포트는 이번 달 전체를 고정해 보는 화면"), `${label} 이 종합 리포트의 역할을 말한다`);
  }

  // -------------------------------------------------------------------------
  // 통과 조건 — 역할별 쓰기 경로 24개, 데이터 변경 0건
  // -------------------------------------------------------------------------
  // 화면을 옮겨도 권한 판정은 한 칸도 움직이지 않아야 한다. 여섯 경로 ×
  // 권한 없는 네 역할을 실제로 POST 해 보고, 매번 스냅샷을 견준다.
  const cookies = {
    참여자: await fixture.cookieFor("user-wifi"),
    조회자: await fixture.cookieFor("user-view"),
    대기자: await fixture.cookieFor("user-pend"),
    차단됨: await fixture.cookieFor("user-block"),
  };
  const writePaths = [
    ["/my/budget-bulk/save", { household_id: householdId, month, budget_category: "식비", budget_amount: "999999" }],
    ["/my/category-keywords/bulk-save", { household_id: householdId, month, return_to: "guide", kw_type: "expense", kw_name: "식비", kw_keywords: "강제저장" }],
    ["/my/household/update", { household_id: householdId, month, name: "가로챈 이름" }],
    ["/my/recurring/save", { household_id: householdId, month, name: "강제 정기지출", amount: "50000", day: "5", type: "expense" }],
    ["/my/report-preference/save", { household_id: householdId, month, enabled: "1", weekly: "1" }],
    ["/my/report-challenge/save", { household_id: householdId, month, type: "no_spend_days", target: "5" }],
  ];
  let denied = 0;
  for (const [path, payload] of writePaths) {
    for (const [role, cookie] of Object.entries(cookies)) {
      const before = snapshot(db);
      const post = await call(fixture, path, cookie, { method: "POST", body: new URLSearchParams(payload).toString() });
      ok(post.status === 303 || post.status === 403, `${role}의 ${path} 는 저장 화면으로 이어지지 않는다 (${post.status})`);
      eq(snapshot(db), before, `${role}의 ${path} 는 데이터를 바꾸지 않는다`);
      denied += 1;
    }
  }
  eq(denied, 24, `역할별 쓰기 경로 ${denied}개를 모두 확인했다`);
} finally {
  fixture.restore();
}

console.log(`V22.8.92 화면별 정리(7.2–7.6) 검사 통과 (${checks} checks)`);
