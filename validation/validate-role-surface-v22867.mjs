import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.74-BUDGET-DARK-CONTRAST"'), "runtime exposes the role surface release");

// 1. 키워드 편집기가 권한 플래그를 받는지 소스에서 확인한다.
ok(/function renderKeywordBulkEditor\(\{.*writable = true.*returnTo/.test(source), "keyword editor accepts a writable flag");
ok(/function keywordEditorCard\(name = "", keywordMap = \{\}, initiallyOpen = false, writable = true\)/.test(source), "keyword card accepts a writable flag");
ok(source.includes("function keywordEditorLocation("), "keyword editor has its own return-location helper");
ok(source.includes(".kwReadOnly .kwRemove{display:none!important}"), "read-only keyword chips hide their delete control");
ok(source.includes(".kwAddRow[hidden]{display:none}"), "hidden keyword add rows really collapse");
ok(source.includes("keyword_manage_only:"), "keyword permission message is defined");
// 저장 결과를 항상 /my/settings 로 돌려보내면 그 화면을 볼 수 없는 역할이 403 에 갇힌다.
eq((source.match(/keywordEditorLocation\(returnTo, month, selected\.id/g) || []).length, 7, "both keyword handlers route every outcome through the return-aware helper");
for (const handler of ["handleMyCategoryKeywordsSave", "handleMyCategoryKeywordsBulkSave"]) {
  const start = source.indexOf(`async function ${handler}(`);
  ok(start > 0, `${handler} exists`);
  const body = source.slice(start, source.indexOf("\n}\n", start));
  ok(!body.includes("mySettingsLocation("), `${handler} no longer hardcodes the settings screen`);
}
// 권한 안내 문구는 화면마다 같은 말을 써야 한다.
ok(!source.includes("owner/admin만"), "role copy uses the same Korean wording everywhere");

const ORIGIN = "https://ttokttok-accountbook.com";

async function call(fixture, path, cookie, { method = "GET", body } = {}) {
  const headers = { "user-agent": "Mozilla/5.0", cookie, origin: ORIGIN };
  if (body) headers["content-type"] = "application/x-www-form-urlencoded";
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, { method, headers, body }), fixture.env, {});
  return { status: response.status, location: response.headers.get("location") || "", text: await response.text() };
}

// 폼 밖에서 온 값도 막히는지 보려면 "실제로 저장되었는지"까지 확인해야 한다.
const snapshot = (db) => JSON.stringify({
  tx: db.transactions.length,
  budgets: db.accountbook_budgets.length,
  recurring: db.accountbook_recurring.length,
  settings: db.accountbook_settings.map((s) => `${s.key}=${String(s.value).length}`).sort(),
  households: db.households.length,
  members: db.household_members.length,
});

const fixture = await createV2265QaFixture();
try {
  const db = fixture.db;
  const createdAt = "2026-07-01T00:00:00.000Z";
  db.users.push(
    { id: "user-view", kakao_user_key: "kakao_login:view", nickname: "조회씨", created_at: createdAt },
    { id: "user-pend", kakao_user_key: "kakao_login:pend", nickname: "대기씨", created_at: createdAt },
    { id: "user-block", kakao_user_key: "kakao_login:block", nickname: "제한씨", created_at: createdAt },
    { id: "user-empty", kakao_user_key: "kakao_login:empty", nickname: "새내기", created_at: createdAt },
  );
  db.household_members.push(
    { household_id: "house-home", user_id: "user-view", role: "viewer", created_at: createdAt },
    { household_id: "house-home", user_id: "user-pend", role: "pending", created_at: createdAt },
    { household_id: "house-home", user_id: "user-block", role: "blocked", created_at: createdAt },
    { household_id: "house-empty", user_id: "user-empty", role: "owner", created_at: createdAt },
  );
  db.households.push({ id: "house-empty", name: "새 가계부", invite_code: "EMPTY001", created_at: createdAt });

  const cookies = {
    owner: fixture.cookie,
    member: await fixture.cookieFor("user-wifi"),
    viewer: await fixture.cookieFor("user-view"),
    pending: await fixture.cookieFor("user-pend"),
    blocked: await fixture.cookieFor("user-block"),
    empty: await fixture.cookieFor("user-empty"),
  };
  const month = "2026-07";
  const q = `month=${month}&household_id=house-home`;

  // 2. 분류·키워드 화면: 소유자만 저장 수단을 본다.
  const ownerGuide = await call(fixture, `/keyword-guide?${q}`, cookies.owner);
  eq(ownerGuide.status, 200, "소유자가 분류·키워드 화면을 연다");
  ok(ownerGuide.text.includes("변경사항 저장"), "소유자에게는 저장 버튼이 있다");
  ok(ownerGuide.text.includes('name="return_to" value="guide"'), "분류·키워드 화면의 폼은 돌아올 화면을 알려준다");
  ok(!/class="kwShell[^"]*kwReadOnly"/.test(ownerGuide.text), "소유자 화면은 보기 전용이 아니다");

  for (const role of ["member", "viewer"]) {
    const page = await call(fixture, `/keyword-guide?${q}`, cookies[role]);
    eq(page.status, 200, `${role}도 분류·키워드 화면을 볼 수 있다`);
    ok(!page.text.includes("변경사항 저장"), `${role}에게는 저장 버튼이 없다`);
    ok(/class="kwShell[^"]*kwReadOnly"/.test(page.text), `${role} 화면은 보기 전용으로 표시된다`);
    ok(page.text.includes("보기 전용"), `${role}에게 권한 안내가 보인다`);
    ok(!/class="kwAdd">/.test(page.text), `${role}에게는 살아 있는 키워드 추가 버튼이 없다`);
  }

  // 3. 저장을 강제로 보내도 저장되지 않고, 볼 수 있는 화면으로 되돌아온다.
  for (const role of ["member", "viewer"]) {
    const before = snapshot(db);
    const post = await call(fixture, "/my/category-keywords/bulk-save", cookies[role], {
      method: "POST",
      body: new URLSearchParams({ household_id: "house-home", month, return_to: "guide", kw_type: "expense", kw_name: "식비", kw_keywords: "강제저장" }).toString(),
    });
    eq(post.status, 303, `${role}의 키워드 저장은 리다이렉트로 끝난다`);
    ok(post.location.startsWith("/keyword-guide?"), `${role}는 볼 수 있는 화면으로 되돌아온다 (${post.location})`);
    ok(post.location.includes("err=keyword_manage_only"), `${role}에게 권한 사유를 알려 준다`);
    eq(snapshot(db), before, `${role}의 키워드 저장은 데이터를 바꾸지 않는다`);
    const landing = await call(fixture, post.location, cookies[role]);
    eq(landing.status, 200, `${role}가 되돌아온 화면은 실제로 열린다`);
    ok(landing.text.includes("분류 키워드 저장은 가계부 소유자·관리자만"), `${role}에게 이유가 화면에 표시된다`);
  }

  // 4. 소유자 저장은 정상 동작하고 같은 화면으로 돌아온다.
  const ownerSave = await call(fixture, "/my/category-keywords/bulk-save", cookies.owner, {
    method: "POST",
    body: new URLSearchParams({ household_id: "house-home", month, return_to: "guide", kw_type: "expense", kw_name: "식비", kw_keywords: "점심,국밥" }).toString(),
  });
  eq(ownerSave.status, 303, "소유자 저장은 리다이렉트로 끝난다");
  ok(ownerSave.location.startsWith("/keyword-guide?"), "소유자도 온 화면으로 되돌아온다");
  ok(ownerSave.location.includes("msg=category_keywords_saved"), "소유자에게 저장 결과를 알려 준다");
  ok(JSON.stringify(db.accountbook_settings).includes("국밥"), "소유자 저장은 실제로 반영된다");
  const ownerLanding = await call(fixture, ownerSave.location, cookies.owner);
  eq(ownerLanding.status, 200, "소유자가 되돌아온 화면이 열린다");
  ok(ownerLanding.text.includes("분류 키워드를 저장했습니다"), "저장 성공이 화면에 표시된다");

  // return_to 가 없을 때는 기존 동작(설정 화면 복귀)을 그대로 지킨다.
  const legacySave = await call(fixture, "/my/category-keywords/bulk-save", cookies.owner, {
    method: "POST",
    body: new URLSearchParams({ household_id: "house-home", month, kw_type: "expense", kw_name: "교통", kw_keywords: "택시" }).toString(),
  });
  ok(legacySave.location.startsWith("/my/settings?"), "return_to 가 없으면 설정 화면으로 돌아간다");

  // 5. 조회 전용·승인 대기·이용 제한은 어떤 쓰기 경로로도 데이터를 바꾸지 못한다.
  const WRITES = [
    ["/my/transactions", { household_id: "house-home", month, text: "침입 9999 현금" }],
    ["/admin/transactions", { household_id: "house-home", month, text: "침입2 8888 현금" }],
    ["/admin/delete", { household_id: "house-home", month, id: "tx-expense-1" }],
    ["/admin/update", { household_id: "house-home", month, id: "tx-expense-1", amount: "1", memo: "변조", category: "식비", payment_method: "현금", transaction_date: "2026-07-04", type: "expense" }],
    ["/my/budget-bulk/save", { household_id: "house-home", month, "amount:식비": "1" }],
    ["/admin/budget/delete", { household_id: "house-home", month, category: "식비" }],
    ["/admin/recurring/delete", { household_id: "house-home", month, id: "recurring-rent" }],
    ["/admin/reserve-plan/delete", { household_id: "house-home", month, id: "reserve-1" }],
    ["/admin/payment-asset/delete", { household_id: "house-home", month, id: "asset-1" }],
    ["/my/household/delete", { id: "house-home", confirm_text: "삭제" }],
    ["/admin/member/update", { household_id: "house-home", user_id: "user-view", role: "owner" }],
    ["/admin/household/delete", { id: "house-home", confirm_text: "삭제" }],
  ];
  for (const role of ["viewer", "pending", "blocked"]) {
    for (const [path, form] of WRITES) {
      const before = snapshot(db);
      const res = await call(fixture, path, cookies[role], { method: "POST", body: new URLSearchParams(form).toString() });
      ok(res.status < 500, `${role} ${path} 는 서버 오류를 내지 않는다 (${res.status})`);
      eq(snapshot(db), before, `${role} 의 ${path} 요청은 데이터를 바꾸지 않는다`);
    }
  }

  // 6. 조회 전용 화면에는 살아 있는 쓰기 폼이 남지 않는다.
  const VIEWER_ROUTES = [
    ["홈", `/app?${q}`],
    ["거래 내역", `/app?${q}&tab=transactions`],
    ["캘린더", `/app?${q}&view=calendar`],
    ["정기지출", `/reserve-plans?${q}`],
    ["영수증", `/receipts?${q}`],
    ["자산·계좌", `/payment-methods?${q}`],
    ["통계", `/my/analysis?${q}`],
    ["종합 리포트", `/my/analysis?${q}&view=report`],
    ["예산", `/budgets?${q}`],
    ["월 마감", `/reports?${q}`],
    ["부부 정산", `/settlement-summary?${q}`],
    ["분류·키워드", `/keyword-guide?${q}`],
    ["가져오기", `/my/backup?${q}&mode=import`],
  ];
  const liveWriteForms = (html) => {
    const found = [];
    for (const [, attrs, inner] of html.matchAll(/<form\b([^>]*method=["']?post["']?[^>]*)>([\s\S]*?)<\/form>/gi)) {
      const action = (attrs.match(/action=["']([^"']+)["']/i) || [])[1] || "";
      if (/^\/(my\/(local-login|local-signup|join|logout)|logout|login)$/.test(action)) continue;
      const submits = [...inner.matchAll(/<button\b([^>]*)>/gi)]
        .filter(([, a]) => !/type=["']?(button|reset)["']?/i.test(a))
        .filter(([, a]) => !/\bdisabled\b/i.test(a));
      if (submits.length) found.push(action);
    }
    for (const m of html.matchAll(/<button\b([^>]*formaction=["']([^"']+)["'][^>]*)>/gi)) {
      if (!/\bdisabled\b/i.test(m[1])) found.push(m[2]);
    }
    return [...new Set(found)];
  };
  for (const [name, path] of VIEWER_ROUTES) {
    const page = await call(fixture, path, cookies.viewer);
    eq(page.status, 200, `조회 전용이 ${name} 화면을 연다`);
    const live = liveWriteForms(page.text);
    eq(live.join(","), "", `${name} 화면에 조회 전용이 누를 수 있는 저장 수단이 없다 (${live.join(", ") || "없음"})`);
  }
  // 같은 검사가 소유자 화면에서는 반드시 무언가를 찾아야 한다 (검사 자체가 죽지 않았는지 확인).
  const ownerHome = await call(fixture, `/app?${q}`, cookies.owner);
  ok(liveWriteForms(ownerHome.text).length > 0, "소유자 홈에는 살아 있는 저장 수단이 있다 (검사 유효성)");

  // 7. 승인 대기·이용 제한은 안내 화면으로 안전하게 막힌다.
  for (const role of ["pending", "blocked"]) {
    const page = await call(fixture, `/app?${q}`, cookies[role]);
    eq(page.status, 403, `${role} 는 기록 화면에 들어가지 못한다`);
    ok(page.text.includes(role === "pending" ? "참여 승인 대기 중" : "이용이 제한"), `${role} 에게 사유가 표시된다`);
    ok(page.text.includes("가계부 전환·추가"), `${role} 에게 다음 행동이 제시된다`);
  }

  // 8. 기록이 하나도 없는 새 가계부에서도 모든 화면이 깨지지 않는다.
  const EMPTY_ROUTES = [
    ["홈", `/app?month=${month}&household_id=house-empty`],
    ["캘린더", `/app?month=${month}&household_id=house-empty&view=calendar`],
    ["통계", `/my/analysis?month=${month}&household_id=house-empty`],
    ["종합 리포트", `/my/analysis?month=${month}&household_id=house-empty&view=report`],
    ["예산", `/budgets?month=${month}&household_id=house-empty`],
    ["월 마감", `/reports?month=${month}&household_id=house-empty`],
    ["연간 리포트", `/annual?year=2026&household_id=house-empty`],
    ["부부 정산", `/settlement-summary?month=${month}&household_id=house-empty`],
    ["자산·계좌", `/payment-methods?month=${month}&household_id=house-empty`],
    ["저축·목표", `/goals?month=${month}&household_id=house-empty`],
    ["스마트 도구", `/smart-tools?month=${month}&household_id=house-empty`],
    ["정기지출", `/reserve-plans?month=${month}&household_id=house-empty`],
  ];
  for (const [name, path] of EMPTY_ROUTES) {
    const page = await call(fixture, path, cookies.empty);
    eq(page.status, 200, `빈 가계부의 ${name} 화면이 열린다`);
    const visible = page.text.replace(/<script[\s\S]*?<\/script>/g, "").replace(/<style[\s\S]*?<\/style>/g, "");
    ok(!/NaN/.test(visible), `빈 가계부 ${name} 화면에 NaN 이 보이지 않는다`);
    ok(!/Infinity/.test(visible), `빈 가계부 ${name} 화면에 Infinity 가 보이지 않는다`);
    ok(!/>\s*undefined\s*<|undefined원|undefined%/.test(visible), `빈 가계부 ${name} 화면에 undefined 가 보이지 않는다`);
  }

  // 9. 기록이 없는 달에 "지난달과 같은 금액" 이라고 말하지 않는다.
  const emptyHome = await call(fixture, `/app?month=${month}&household_id=house-empty`, cookies.empty);
  ok(!emptyHome.text.includes("지난달과 같은 금액을 썼어요"), "기록이 없는 새 가계부에 지난달 비교 문구를 쓰지 않는다");
  ok(emptyHome.text.includes("아직 지출 기록이 없어요"), "기록이 없으면 첫 기록을 권한다");
  ok(emptyHome.text.includes("첫 기록"), "빈 홈이 첫 기록 안내를 유지한다");
  // 기록이 있으면 기존 비교 문구는 그대로 살아 있어야 한다.
  const filledHome = await call(fixture, `/app?${q}`, cookies.owner);
  ok(/지난달보다 [\d,]+원 (더|덜) 썼어요/.test(filledHome.text), "기록이 있는 달은 지난달 비교를 유지한다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.67 role surface and empty state (${checks} checks)`);
