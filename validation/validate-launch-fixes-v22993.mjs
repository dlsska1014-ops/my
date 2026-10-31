// V22.9.93 — 출시(2026-11-13) 전 입력 시험과 남은 작은 결함 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   출시 전에 실제로 쓸 말투 186줄을 해석기에 넣어 봤더니(2026-10-31) 저장은 되는데 날짜가 조용히 틀리는 문장이 있었다.
//   1. Q-1 ‘어제는 커피 4500’·‘그저께에 택시’·‘어제커피’·‘어제저녁치킨’·‘내일모레 회비’·‘25일에 월세’가 오늘 날짜로 저장됐고,
//      ‘10월 3일에 커피 4000’은 아예 읽지 못했다. 조사를 뗀 말과 붙여 쓴 말을 거래 문장 입구(foldInputWidth)에서 띄어 준다.
//   2. Q-2 ‘회비 12.000원’이 12원으로 저장됐다. 세 자리씩 찍은 점은 자릿수로 읽는다(소수점으로 쓸 일이 없는 꼴만).
//   3. X-27 ‘오늘의집’·‘금일봉’의 ‘오늘’·‘금일’이 메모에서 지워졌다. 날짜 말은 낱말 경계에서만 지운다.
//   4. Q-3 흔한 낱말 303개 중 120개(40%)가 기타지출로 빠졌다. 분류 낱말을 더했다(시험관·알리바바·꽃게 같은 오탐은 막는다).
//   5. X-12·X-13·X-17 추적표에 남은 작은 결함: 가계부 삭제 본인 확인의 역할 읽기 실패 안내, 안내 문장의 이중 이스케이프,
//      손으로 고친 정산 이력의 null 항목.
//   6. Q-4~Q-10 Aside 전체 기능 검수에서 나온 결함: 제출 잠금이 눌린 버튼의 값을 지움(홈 구성 위아래·관리자 일괄 삭제),
//      없는 주소의 원시 JSON, 연간 화면을 거치면 달이 1월로 바뀜, 목표 금액의 부호·단위가 지워짐, 같은 이름 목표,
//      영어 역할 이름, 고칠 수 없는 행의 ‘수정·삭제’ 이름, 160자가 넘는 내용이 말없이 잘림.
//   7. 독립 검토와 Aside 2차 검수: 점 자릿수(문장부호·메모 숫자·같은 줄 금액·소수와 단위), 날짜로 읽으면 안 되는 말, 새 분류 낱말이 넓게 잡던 말,
//      Q-11 웹 저장 판정, Q-12 연간 화면 안의 이동, Q-13 목표 금액 꼴, Q-14 재인증의 허위 조회, Q-15 정기 추가 폼, Q-16~Q-20 화면 깨짐.
//   8. 카카오는 Aside 가 시험할 수 없어 사람이 쓸 고치기·삭제 말 150여 줄을 픽스처로 돌렸다.
//      Q-21 값 칸의 점 자릿수(‘01번 금액 12.000원’ 이 12원), Q-22 ‘방금 12000원으로 바꿔줘’ 가 새 기록, Q-23 조사가 값으로 저장(결제수단 ‘현금으로’),
//      Q-24 고치거나 지우려는 말이 새 기록(‘커피 5000원으로 바꿔줘’·‘커피 4500원 삭제’), Q-25 ‘방금 거 지워줘’ 가 이해 못함, ‘1번 취소’ 가 지워진 줄 알게 함.
//   9. Aside 3차 검수: Q-26 웹 한 줄 입력의 금액 둘이 앞 금액 한 건으로 저장, Q-27 정산 조회 줄의 가계부 칸이 좁은 폭에서 잘림,
//      Q-28 줄머리 목록 표식(웹 ‘1. 김밥 3200원’ 이 1원, 카카오 ‘1) 김밥 3200원’ 이 저장되지 않음). Aside 4차: Q-29 목표 이름 칸의 예시 문구가 360 폭에서 잘림. Aside 5차: Q-51 780 폭에서도 잘림(사이드바가 있는 900~1100 폭은 더 좁았다).
//  10. 독립 검토 2차: Q-30 고치는 말을 막는 가드가 저장 뒤에 있어 실제 방·1:1 첫 기록·세션 넘김에서 새 기록이 됨, Q-31 세션 답의 끝맺음(‘5000원이요’), Q-32 묻는 말·불평이 값으로 저장,
//      Q-33 금액 둘이 이어져 5천만 원대, Q-34 받침을 안 본 조사 떼기(‘종로’→‘종’), Q-35 끝 문장부호·전각, Q-36 ‘세트1로’ 에 ‘원’, Q-37 세션의 취소 말·다른 번호,
//      Q-38 붙여 쓴 금액, Q-39 경고 우회·지운 뒤 임시저장, Q-40 띄어 쓴 날짜, Q-41 금액 뒤 쉼표. 방 경로는 Secret 과 botGroupKey 를 실은 요청으로 따로 시험한다.
//  11. 위 표를 돌리다 찾은 것: Q-42 세션의 ‘02번 12000원으로 바꿔줘’ 가 01번을 바꿈, Q-43 ‘날짜 7/3으로’, Q-44 ‘5000원 부탁해’, Q-45 ‘1번 기록 삭제’ 가 안내로 빠짐,
//      Q-46 소수 단위(‘콜라 1.5L 2500’)를 없는 날짜로 막음, Q-47 메모에 남은 부호(‘점심 ,’), Q-48 두 자리 연도(‘26. 10. 31’ 이 세 건으로 저장).
//      Q-49 긴 입력에서 지수 시간이 걸리는 정규식(‘1번 ’ 되풀이, ‘1만만만…’). Q-50 한 말로 저장한 여러 건 뒤의 ‘방금’ 이 아무 건이나 고치거나 지움.
// 모두 메모리 픽스처(DB·서버 없음)에서 실제 경로를 돌린다. 브라우저 쪽은 내려가는 자산에서 함수를 꺼내 서버와 같은 답인지 본다.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parseExpressionAt } from "../tools/vendor/acorn.mjs";
import { api, app, BASE, ctx, fixture, intercept, failure, page, post, putSetting, skill, withClock } from "./lib-audit-v22934.mjs";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { parseDirectBudgetSetCommand, parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { parseAmountValue } from "../src/modules/nlu/amount-parser.js";

const HH = "house-home";
let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) failures.push(message); };
const eq = (actual, expected, message) => { checks += 1; if (actual !== expected) failures.push(`${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); };
const read = (file) => readFileSync(new URL(`../${file}`, import.meta.url), "utf8");
const rowsOf = (text) => {
  const parsed = parseMultipleTransactions(text, {});
  return Array.isArray(parsed) ? parsed : parsed ? [parsed] : [];
};
const only = (text) => {
  const rows = rowsOf(text);
  eq(rows.length, 1, `‘${text}’ 은 한 건`);
  return rows[0] || {};
};

// ── Q-1 날짜 말투 ──────────────────────────────────────────────────────────────
const dayCases = [
  ["어제는 커피 4500", "2026-07-14", 4500, "커피"],
  ["어제도 커피 4500", "2026-07-14", 4500, "커피"],
  ["어제 커피 4500", "2026-07-14", 4500, "커피"],
  ["어제커피 4500", "2026-07-14", 4500, "커피"],
  ["어제회식 50000", "2026-07-14", 50000, "회식"],
  ["어제저녁치킨 23000", "2026-07-14", 23000, "저녁 치킨"],
  ["어제 점심에 12000 썼어", "2026-07-14", 12000, "점심"],
  ["그제는 택시 8000", "2026-07-13", 8000, "택시"],
  ["그저께는 술값 50000", "2026-07-13", 50000, "술값"],
  ["그저께에 택시 8000", "2026-07-13", 8000, "택시"],
  ["내일 회비 30000", "2026-07-16", 30000, "회비"],
  ["내일모레 회비 30000", "2026-07-17", 30000, "회비"],
  ["내일 모레 회비 30000", "2026-07-17", 30000, "회비"],
  ["모레 회비 30000", "2026-07-17", 30000, "회비"],
  ["오늘도 커피 4500", "2026-07-15", 4500, "커피"],
  ["오늘은 점심 12000", "2026-07-15", 12000, "점심"],
  ["3일에 커피 4000", "2026-07-03", 4000, "커피"],
  ["10일에 월세 500000", "2026-07-10", 500000, "월세"],
  ["7월 3일에 커피 4000", "2026-07-03", 4000, "커피"],
  ["7월3일 커피 4000", "2026-07-03", 4000, "커피"],
  ["그제서야 커피 4000", "2026-07-15", 4000, "그제서야 커피"],
  ["그제야 택시 8000", "2026-07-15", 8000, "그제야 택시"],
];
await withClock("2026-07-15", async () => {
  for (const [text, date, amount, memo] of dayCases) {
    const row = only(text);
    eq(row.transaction_date, date, `Q-1 ‘${text}’ 의 날짜`);
    eq(row.amount, amount, `Q-1 ‘${text}’ 의 금액`);
    eq(row.memo, memo, `Q-1 ‘${text}’ 의 메모`);
  }
});

// ── Q-2 점으로 찍은 자릿수 ──────────────────────────────────────────────────────
await withClock("2026-07-15", async () => {
  for (const [text, amount] of [["회비 12.000원", 12000], ["회비 12.000", 12000], ["월세 1.200.000원", 1200000], ["커피 4.500원", 4500]]) {
    eq(only(text).amount, amount, `Q-2 ‘${text}’ 의 금액`);
  }
  // 점이 자릿수가 아닌 꼴은 그대로다.
  eq(only("커피 1.5만원").amount, 15000, "Q-2 소수 만 단위는 그대로 읽는다");
  eq(only("7.3 커피 4000").transaction_date, "2026-07-03", "Q-2 점으로 쓴 날짜는 날짜로 읽는다");
  eq(only("7.3 커피 4000").amount, 4000, "Q-2 점으로 쓴 날짜 뒤 금액");
  eq(only("2026.07.03 커피 4000").transaction_date, "2026-07-03", "Q-2 네 자리 연도 날짜는 건드리지 않는다");
});

// ── X-27 이름 속 날짜 말 ────────────────────────────────────────────────────────
await withClock("2026-07-15", async () => {
  for (const [text, memo, date = "2026-07-15"] of [
    ["오늘의집 30000", "오늘의집"], ["오늘의집 쿠션 20000원", "오늘의집 쿠션"], ["금일봉 100000", "금일봉"], ["오늘회 30000", "오늘회"],
    ["내일의식탁 20000", "내일의식탁"], ["어제의커피 4500", "어제의커피"], ["어제자 신문 2000", "어제자 신문"],
  ]) {
    const row = only(text);
    eq(row.memo, memo, `X-27 ‘${text}’ 의 메모`);
    eq(row.transaction_date, date, `X-27 ‘${text}’ 의 날짜`);
  }
  eq(only("내일배움카드 50000").memo, "내일배움", "X-27 내일배움카드의 ‘내일’ 을 지우지 않는다(카드는 결제수단 말)");
});

// ── 카카오: 문장이 실제 저장까지 같은 날짜·금액으로 간다 ──────────────────────────
await withClock("2026-07-15", () => fixture(async (fx) => {
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  for (const [text, date, amount, memo] of [
    ["어제는 커피 4500", "2026-07-14", 4500, "커피"], ["그저께에 택시 8000", "2026-07-13", 8000, "택시"],
    ["3일에 커피 4100", "2026-07-03", 4100, "커피"], ["회비 12.000원", "2026-07-15", 12000, "회비"],
    ["오늘의집 쿠션 20000", "2026-07-15", 20000, "오늘의집 쿠션"],
  ]) {
    const before = fx.db.transactions.length;
    await skill(fx, text);
    eq(fx.db.transactions.length, before + 1, `카카오 ‘${text}’ 가 한 건 저장된다`);
    const saved = fx.db.transactions.at(-1) || {};
    eq(saved.transaction_date, date, `카카오 ‘${text}’ 의 날짜`);
    eq(Number(saved.amount), amount, `카카오 ‘${text}’ 의 금액`);
    eq(saved.memo, memo, `카카오 ‘${text}’ 의 메모`);
  }
}));

// ── 브라우저 쪽: 내려가는 자산의 함수가 서버와 같은 답을 낸다 ───────────────────────
const assetText = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  eq(response.status, 200, `${path} 가 내려간다`);
  return response.text();
};
const fromAsset = (source, name) => {
  const start = source.indexOf(`function ${name}(`);
  ok(start >= 0, `자산에 ${name} 이 실린다`);
  const node = parseExpressionAt(source, start, { ecmaVersion: "latest" });
  return source.slice(node.start, node.end);
};
const { foldInputWidth } = await import("../src/modules/client/shared-input-nlu.js");
const sentences = [...dayCases.map((item) => item[0]), "회비 12.000원", "월세 1.200.000원", "7.3 커피 4000", "오늘의집 30000", "금일봉 100000", "어제의커피 4500", "어제자 신문 2000", "내일배움카드 50000", "１２,０００원 점심"];
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js"]) {
  const code = fromAsset(await assetText(path), "foldInputWidth");
  const browser = vm.runInNewContext(`(${code})`);
  for (const text of sentences) eq(browser(text), foldInputWidth(text), `${path} ‘${text}’ 이 서버와 같다`);
  ok(!/\(\?<[=!]/.test(code), `${path} foldInputWidth 에 lookbehind 가 없다`);
}

// ── Q-3 분류 낱말 ──────────────────────────────────────────────────────────────
const categoryWords = {
  "약국": ["비타민"],
  "의료/병원": ["정형외과", "산부인과", "이비인후과", "비뇨기과", "신경외과", "정신과"],
  "차량관리": ["톨게이트", "통행료", "차량수리"],
  "교통": ["따릉이", "킥보드", "쏘카", "그린카", "렌트카", "렌터카"],
  "장보기": ["계란", "달걀", "우유", "과일", "채소", "야채", "컬리", "쓱배송", "SSG"],
  "카페/간식": ["공차", "배스킨라빈스", "파리바게뜨", "뚜레쥬르", "던킨", "도넛", "케이크", "마카롱", "음료"],
  "외식": ["삼겹살", "갈비", "곱창", "족발", "보쌈", "롯데리아", "KFC", "파스타", "스테이크", "돈까스", "돈가스", "라멘", "우동", "설렁탕", "순대국", "김치찌개", "냉면", "칼국수", "짜장면", "짬뽕", "탕수육", "마라탕", "떡볶이", "샐러드", "샌드위치", "서브웨이", "도시락", "브런치", "뷔페", "호프", "야식", "고깃집"],
  "교육/학습": ["과외", "학비", "시험", "토익"],
  "생활용품": ["화장지", "생필품", "수건", "쓰레기봉투", "이케아", "오늘의집", "가구", "침대", "소파", "이불", "가전", "냉장고"],
  "의류/잡화": ["지갑", "안경", "시계", "수선"],
  "미용": ["파마", "왁싱"],
  "쇼핑": ["위메프", "티몬", "알리", "알리익스프레스", "테무", "지그재그", "에이블리", "지마켓", "백화점", "아울렛", "노트북", "태블릿", "아이패드", "이어폰", "에어팟"],
  "여행": ["숙소", "에어비앤비", "비행기"],
  "문화/여가": ["CGV", "롯데시네마", "메가박스", "뮤지컬", "PC방", "피시방", "볼링", "당구"],
  "경조사/선물": ["꽃", "꽃다발", "꽃집", "기부", "후원"],
};
for (const [category, words] of Object.entries(categoryWords)) {
  for (const word of words) eq(parseTransaction(`${word} 10000`, {})?.category, category, `Q-3 ‘${word}’ 의 분류`);
}
for (const [word, wrong] of [["시험관 시술", "교육/학습"], ["알리바바", "쇼핑"], ["꽃게", "경조사/선물"], ["꽃게탕", "경조사/선물"]]) {
  ok(parseTransaction(`${word} 10000`, {})?.category !== wrong, `Q-3 ‘${word}’ 는 ${wrong} 이 아니다`);
}
const rulesAsset = await assetText("/assets/ab-category-rules-v22993.js");
for (const word of ["오늘의집", "삼겹살", "파리바게뜨", "시험관"]) ok(rulesAsset.includes(word), `Q-3 브라우저 분류 규칙에 ‘${word}’ 가 있다`);

// ── X-13 안내 문장 이스케이프 ──────────────────────────────────────────────────
await fixture(async (fx) => {
  for (const path of [`/budgets?err=amount_unit_required&household_id=${HH}`, `/my/households?err=amount_unit_required`, `/my/members?err=amount_unit_required`]) {
    const { status, html } = await page(fx, path);
    eq(status, 200, `X-13 ${path} 가 열린다`);
    ok(html.includes("&quot;7원&quot;"), `X-13 ${path} 는 따옴표를 한 번만 이스케이프한다`);
    ok(!html.includes("&amp;quot;"), `X-13 ${path} 에 이중 이스케이프가 없다`);
  }
  // 코드로 온 값은 표의 문장만 나가고, 주소에 넣은 태그는 일반 안내로 닫힌다.
  const injected = await page(fx, `/budgets?err=${encodeURIComponent("<img src=x onerror=alert(1)>")}&household_id=${HH}`);
  ok(!injected.html.includes("<img src=x"), "X-13 주소에 넣은 태그가 그대로 나가지 않는다");
});
const replyTexts = read("src/modules/my/households-lifecycle.js");
ok(/formatMessageText\(code \|\| ""\)/.test(replyTexts), "X-13 householdPageMessage 는 평문을 돌려준다");

// ── X-17 손으로 고친 정산 이력 ──────────────────────────────────────────────────
await fixture(async (fx) => {
  putSetting(fx, `settlement_history:${HH}`, JSON.stringify([null, 3, "x", { id: "keep", month: "2026-06", mode: "equal", total_expense: 1000, participant_count: 2, shares: [], transfers: [], note: "남은 항목", completed_at: "2026-06-30" }]));
  const summary = await page(fx, `/settlement-summary?month=2026-07&household_id=${HH}`);
  eq(summary.status, 200, "X-17 null 항목이 있어도 정산 화면이 열린다");
  ok(summary.html.includes("2026-06-30"), "X-17 객체 항목은 그대로 보인다");
  const preview = await page(fx, `/settlement-summary?refund_preview=1&month=2026-07&household_id=${HH}`);
  ok(preview.status < 500, `X-17 환급 미리보기가 500 이 아니다(${preview.status})`);
});

// ── X-12 가계부 삭제 본인 확인의 역할 읽기 실패 ──────────────────────────────────
const isRoleRead = (url, method) => method === "GET" && url.pathname.endsWith("/household_members")
  && !!url.searchParams.get("household_id") && !!url.searchParams.get("user_id");
const startReauth = async (fx) => {
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", KAKAO_REDIRECT_URI: "https://malhaebook.com/auth/kakao/callback" });
  const returnTo = `/my/households?household_id=${HH}&manage=${HH}`;
  const response = await app.fetch(new Request(`${BASE}/auth/kakao/start?reauth=household-delete&household_id=${HH}&return_to=${encodeURIComponent(returnTo)}`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  return { status: response.status, location: response.headers.get("location") || "", headers: response.headers };
};
await fixture(async (fx) => {
  const stop = intercept(({ url, method }) => (isRoleRead(url, method) ? failure(503, "role read down") : null));
  let down;
  try { down = await startReauth(fx); } finally { stop(); }
  ok(down.status >= 300 && down.status < 400, `X-12 안내와 함께 돌려보낸다(${down.status})`);
  ok(down.location.includes("err=household_role_check_failed"), `X-12 읽기 실패는 ‘확인하지 못함’ 으로 안내한다(${down.location})`);
  ok(!down.location.includes("household_delete_owner_only"), "X-12 읽기 실패를 ‘소유자만’ 으로 안내하지 않는다");
  const up = await startReauth(fx);
  ok(!up.location.includes("err="), `X-12 소유자는 카카오 본인 확인으로 간다(${up.location})`);
});
await fixture(async (fx) => {
  // 콜백 쪽: 시작은 정상으로 지나고, 돌아온 뒤 역할 읽기가 실패한다.
  const cookiePairs = (headers) => (headers.getSetCookie?.() || []).map((value) => value.split(";")[0]);
  const json = (body) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  let roleDown = false;
  const stop = intercept(({ url, method }) => {
    if (url.hostname === "kauth.kakao.com") return json({ access_token: "synthetic-token", token_type: "bearer" });
    if (url.hostname === "kapi.kakao.com") return json({ id: 2265, properties: { nickname: "Bin" } });
    if (roleDown && isRoleRead(url, method)) return failure(503, "role read down");
    return undefined;
  });
  try {
    const start = await startReauth(fx);
    const state = new URL(start.location).searchParams.get("state");
    roleDown = true;
    const callback = await app.fetch(new Request(`${BASE}/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { headers: { cookie: [fx.cookie, ...cookiePairs(start.headers)].join("; ") } }), fx.env, ctx);
    const location = callback.headers.get("location") || "";
    ok(location.includes("err=household_role_check_failed"), `X-12 콜백의 읽기 실패도 ‘확인하지 못함’ 이다(${location})`);
    ok(!(callback.headers.getSetCookie?.() || []).some((value) => value.startsWith("ab_household_delete_reauth=") && !value.includes("Max-Age=0")), "X-12 읽기 실패에 삭제 본인 확인 표를 주지 않는다");
  } finally { stop(); }
});
ok(!/\bgetHouseholdMemberRole\b/.test(read("src/modules/auth/kakao-oauth.js")), "X-12 kakao-oauth.js 는 느슨한 역할 읽기를 쓰지 않는다");

// ── Q-4 제출 잠금이 눌린 버튼의 값을 지우지 않는다 ─────────────────────────────────
// 실제 클릭은 제출 이벤트 → 마이크로태스크(잠금) → 보낼 값 모으기 순서로 간다. 막힌 버튼은 보낼 값에서 빠진다.
// 스크립트의 button.click() 은 잠금이 값을 모은 뒤에 돌아 이 결함이 보이지 않았다. 아래 흉내는 실제 클릭 순서를 따른다.
const guidedCode = fromAsset(await assetText("/assets/mobile-home-v22993.js"), "guidedUiUxClientMain");
const submitLock = ({ cancelled = false, submitterOutside = false } = {}) => {
  const documentListeners = new Map();
  const windowListeners = new Map();
  const microtasks = [];
  const kept = [];
  let statusElement = null;
  const makeButton = (name, value) => {
    const attributes = new Map();
    return {
      tagName: "BUTTON", name, value, textContent: "↑", dataset: {}, disabled: false, classList: { add() {} },
      setAttribute(key, text) { attributes.set(key, String(text)); },
      getAttribute(key) { return attributes.get(key) || null; },
      removeAttribute(key) { attributes.delete(key); },
    };
  };
  const inner = makeButton("move", "reports:pace:up");
  const outer = makeButton("bulk_quick_type", "expense");
  const attributes = new Map();
  const form = {
    tagName: "FORM", dataset: {},
    getAttribute(key) { return key === "method" ? "post" : key === "action" ? "/home-layout/save" : attributes.get(key) || null; },
    setAttribute(key, text) { attributes.set(key, String(text)); },
    removeAttribute(key) { attributes.delete(key); },
    hasAttribute(key) { return attributes.has(key); },
    contains(node) { return node === inner; },
    checkValidity() { return true; },
    querySelector(selector) {
      if (selector.includes("data-ab-submit-status")) return statusElement;
      return selector.includes('button[type="submit"]') ? inner : null;
    },
    querySelectorAll(selector) {
      if (selector.includes("data-ab-submit-kept")) return [...kept];
      if (selector.includes("data-ab-submit-locked")) return inner.dataset.abSubmitLocked === "1" ? [inner] : [];
      return [];
    },
    appendChild(node) {
      if (node.type !== "hidden") { statusElement = node; return; }
      node.remove = () => kept.splice(kept.indexOf(node), 1);
      kept.push(node);
    },
    dispatchEvent() {},
  };
  const documentStub = {
    body: { classList: { contains() { return false; } } },
    querySelector() { return null; },
    querySelectorAll(selector) { return selector === 'form[method="post"]' ? [form] : []; },
    createElement() { return { dataset: {}, style: {}, textContent: "", setAttribute(key, text) { this[key] = String(text); } }; },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
  };
  const windowStub = { confirm() { return true; }, addEventListener(type, listener) { windowListeners.set(type, listener); }, localStorage: null };
  new Function("document", "window", "queueMicrotask", "Event", `(${guidedCode})();`)(documentStub, windowStub, (task) => microtasks.push(task), class { constructor(type) { this.type = type; } });
  const event = { target: form, submitter: submitterOutside ? outer : inner, defaultPrevented: cancelled, preventDefault() { this.defaultPrevented = true; } };
  documentListeners.get("submit")(event);
  microtasks.splice(0).forEach((task) => task());
  const sent = [...(inner.disabled || event.submitter !== inner ? [] : [[inner.name, inner.value]]), ...(submitterOutside ? [[outer.name, outer.value]] : []), ...kept.map((input) => [input.name, input.value])];
  return { inner, kept, sent, form, restore() { windowListeners.get("pageshow")(); } };
};
{
  const pressed = submitLock();
  ok(pressed.inner.disabled, "Q-4 두 번 누르지 못하게 버튼은 그대로 막는다");
  eq(JSON.stringify(pressed.sent), JSON.stringify([["move", "reports:pace:up"]]), "Q-4 막힌 버튼의 이름·값이 그대로 나간다");
  pressed.restore();
  eq(pressed.kept.length, 0, "Q-4 뒤로 가기로 돌아오면 남긴 값을 지운다(다음 저장에 옛 이동이 섞이지 않는다)");
  ok(!pressed.inner.disabled, "Q-4 뒤로 가기로 돌아오면 버튼이 다시 살아난다");
  const outside = submitLock({ submitterOutside: true });
  eq(outside.kept.length, 0, "Q-4 폼 밖 버튼을 눌렀을 때 폼 안 다른 버튼의 값을 대신 보내지 않는다(일괄 분류가 일괄 삭제로 바뀌면 안 된다)");
  eq(JSON.stringify(outside.sent), JSON.stringify([["bulk_quick_type", "expense"]]), "Q-4 폼 밖 버튼은 자기 값만 나간다");
  const cancelled = submitLock({ cancelled: true });
  ok(!cancelled.inner.disabled && cancelled.kept.length === 0, "Q-4 취소한 제출은 건드리지 않는다");
}
await fixture(async (fx) => {
  const orderOf = (html) => [...html.matchAll(/name="reports_order" value="([^"]+)"/g)].map((match) => match[1]);
  const before = orderOf((await page(fx, `/home-layout?household_id=${HH}&month=2026-07`)).html);
  ok(before.length >= 2, "Q-4 홈 구성 화면에 순서가 있다");
  const form = new URLSearchParams({ household_id: HH, month: "2026-07", move: `reports:${before[1]}:up` });
  for (const id of before) { form.append("reports_order", id); form.append("reports_on", id); }
  ok((await post(fx, "/home-layout/save", form)).location.includes("msg=saved"), "Q-4 저장된다");
  const after = orderOf((await page(fx, `/home-layout?household_id=${HH}&month=2026-07`)).html);
  eq(after.join(), [before[1], before[0], ...before.slice(2)].join(), "Q-4 서버는 받은 값대로 한 칸 옮긴다");
});

// ── Q-5 없는 주소 ──────────────────────────────────────────────────────────────
await fixture(async (fx) => {
  const open = async (path, init = {}) => {
    const response = await app.fetch(new Request(`${BASE}${path}`, init), fx.env, ctx);
    return { status: response.status, type: response.headers.get("content-type") || "", robots: response.headers.get("x-robots-tag") || "", text: await response.text() };
  };
  const browser = await open("/없는주소", { headers: { accept: "text/html,application/xhtml+xml" } });
  eq(browser.status, 404, "Q-5 없는 주소는 404 를 유지한다");
  ok(/text\/html/.test(browser.type) && browser.text.includes("페이지를 찾을 수 없습니다"), "Q-5 브라우저는 한글 안내 화면을 본다");
  ok(browser.text.includes('href="/my"') && browser.text.includes('href="/"'), "Q-5 돌아갈 링크가 있다");
  ok(browser.robots.includes("noindex") && browser.text.includes('content="noindex'), "Q-5 검색에 잡히지 않는다");
  ok(!browser.text.includes('"not_found"'), "Q-5 원시 JSON 이 보이지 않는다");
  for (const [label, path, init] of [
    ["스크립트 요청", "/없는주소", { headers: { accept: "application/json" } }],
    ["accept 없음", "/없는주소", {}],
    ["사용자 API", "/u/api/nope", { headers: { accept: "text/html" } }],
    ["POST", "/없는주소", { method: "POST", headers: { accept: "text/html", origin: BASE, "sec-fetch-site": "same-origin" } }],
  ]) {
    const response = await open(path, init);
    ok(response.status >= 400 && /json/.test(response.type), `Q-5 ${label} 은 JSON 을 유지한다(${response.status} ${response.type})`);
  }
});

// ── Q-6 연간 화면을 거쳐도 보던 달 유지, 스마트 도구의 기준 달 ──────────────────────
await withClock("2026-10-31", () => fixture(async (fx) => {
  const navMonths = (html) => [...new Set([...html.matchAll(/\/reports\?month=(\d{4}-\d{2})/g)].map((match) => match[1]))];
  const home = await page(fx, `/app?month=2026-07&household_id=${HH}`);
  ok(home.html.includes("/annual?month=2026-07"), "Q-6 사이드바의 연간 리포트 링크가 보던 달을 들고 간다");
  const kept = await page(fx, `/annual?month=2026-07&household_id=${HH}`);
  ok(kept.html.includes("/annual?year=2025"), "Q-6 year 가 없으면 그 달의 해를 보여 준다");
  eq(navMonths(kept.html).join(), "2026-07", "Q-6 연간 화면의 다음 링크가 보던 달이다");
  eq(navMonths((await page(fx, `/annual?year=2026&month=2026-07&household_id=${HH}`)).html).join(), "2026-07", "Q-6 year 와 month 가 같이 와도 보던 달이다");
  const lastYear = await page(fx, `/annual?month=2025-03&household_id=${HH}`);
  ok(lastYear.html.includes("/annual?year=2024"), "Q-6 지난해 달을 들고 오면 그 해를 보여 준다");
  eq(navMonths(lastYear.html).join(), "2025-03", "Q-6 지난해 달을 들고 오면 그 달을 유지한다");
  const noMonth = await page(fx, `/annual?year=2026&household_id=${HH}`);
  eq(navMonths(noMonth.html).join(), "2026-10", "Q-6 달을 안 받으면 올해는 이번 달이다(예전에는 1월)");
  const past = await page(fx, `/annual?year=2025&household_id=${HH}`);
  eq(navMonths(past.html).join(), "2025-01", "Q-6 지난해는 그 해 1월이다");
  const otherYear = await page(fx, `/annual?year=2025&month=2026-07&household_id=${HH}`);
  eq(navMonths(otherYear.html).join(), "2025-01", "Q-6 다른 해의 달은 쓰지 않는다");
  const bad = await page(fx, `/annual?year=2026&month=abc&household_id=${HH}`);
  eq(navMonths(bad.html).join(), "2026-10", "Q-6 틀린 달은 무시한다");
  ok((await page(fx, `/smart-tools?month=2026-07&household_id=${HH}`)).html.includes("2026년 7월 기준"), "Q-6 스마트 도구가 기준 달을 보여 준다");
}));

// ── Q-7·Q-8 목표 금액과 같은 이름 ───────────────────────────────────────────────
await fixture(async (fx) => {
  const create = (fields) => api(fx, "/u/api/goals", "POST", { household: HH, action: "create", ...fields });
  const goals = async () => (await api(fx, "/u/api/goals?household=house-home", "GET")).data?.goals || [];
  for (const [name, target, monthly] of [["음수", "-100", ""], ["한글 단위", "10만", ""], ["소수", "1.5", ""], ["영", "0", ""], ["월 음수", "1000", "-5"]]) {
    const response = await create({ name, target, monthly });
    eq(response.status, 400, `Q-7 ‘${target}’·‘${monthly}’ 은 저장하지 않는다`);
    ok(/금액/.test(String(response.data?.message)), "Q-7 금액 안내를 돌려준다");
  }
  eq((await goals()).length, 0, "Q-7 잘못된 금액으로 목표가 생기지 않는다");
  for (const [name, target, saved] of [["쉼표", "100,000", 100000], ["원", "50000원", 50000], ["공백", " 3000 ", 3000]]) {
    const response = await create({ name, target, monthly: "" });
    eq(response.status, 200, `Q-7 ‘${target}’ 은 저장한다`);
    eq(response.data?.goals?.find((goal) => goal.name === name)?.target, saved, `Q-7 ‘${target}’ 의 금액`);
  }
  const twice = await create({ name: "쉼표", target: "200000", monthly: "" });
  eq(twice.status, 409, "Q-8 진행 중인 같은 이름 목표는 또 만들지 않는다");
  eq(twice.data?.error, "duplicate_goal", "Q-8 이유를 코드로 돌려준다");
  ok(/같은 이름/.test(String(twice.data?.message)), "Q-8 안내 문장이 있다");
  eq((await goals()).length, 3, "Q-8 목표 수가 늘지 않는다");
  const spaced = await create({ name: " 쉼표 ", target: "200000", monthly: "" });
  eq(spaced.status, 409, "Q-8 앞뒤 공백만 다른 이름도 같은 이름이다");
  const list = await goals();
  const done = list.find((goal) => goal.name === "공백");
  eq((await api(fx, "/u/api/goals", "POST", { household: HH, action: "fund", id: done.id, amount: 3000 })).status, 200, "Q-8 시험: 목표를 다 모은다");
  eq((await create({ name: "공백", target: "5000", monthly: "" })).status, 200, "Q-8 다 모은 목표는 같은 이름으로 다시 시작할 수 있다");
});
{
  const goalsAsset = await assetText("/assets/accountbook-goals-v22993.js");
  ok(goalsAsset.includes('target: String(f.target.value || "").trim()') && goalsAsset.includes('monthly: String(f.monthly.value || "").trim()'), "Q-7 화면은 적은 금액을 그대로 보낸다");
  ok(!goalsAsset.includes("replace(/[^0-9]/g"), "Q-7 화면이 부호·단위를 지우지 않는다");
}

// ── Q-9 역할 이름, Q-10 권한 없는 행·긴 내용 ───────────────────────────────────────
await fixture(async (fx) => {
  const visible = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ");
  const home = visible((await page(fx, `/app?month=2026-07&household_id=${HH}`)).html);
  ok(/\((소유자|구성원|관리자)\)<\/option>/.test(home), "Q-9 지출자 고르기에 한글 역할이 보인다");
  ok(!/\((owner|admin|member|viewer)\)<\/option>/.test(home), "Q-9 지출자 고르기에 영어 역할이 없다");
  for (const path of [`/smart-tools?month=2026-07&household_id=${HH}`, "/terms", "/household-flow"]) {
    ok(!/owner\/admin/.test(visible((await page(fx, path)).html)), `Q-9 ${path} 에 영어 역할 목록이 없다`);
  }
});
{
  const v5 = await assetText("/assets/accountbook-v5-v22993.js");
  ok(v5.includes('owner: "소유자"') && !v5.includes('esc(member && member.role || "member")'), "Q-9 하루 상세의 지출자 고르기도 한글 역할이다");
  ok(v5.includes('main.tagName === "SUMMARY" ? "수정·삭제 상세 보기" : "상세 보기"'), "Q-10 고칠 수 없는 행을 ‘수정·삭제’ 로 읽어 주지 않는다");
  ok(v5.includes("(내용은 160자까지 저장됩니다)"), "Q-10 긴 내용은 저장 전에 알린다");
}

// ── Q-2 보강(독립 검토): 문장부호·메모 숫자·같은 줄의 다른 금액·금액이 아닌 점 숫자 ─────────────
const digitCases = [
  ["점심 12.000!", 12000], ["점심 12.000?", 12000], ["점심 12.000)", 12000], ["점심 12.000~", 12000], ["(12.000) 점심", 12000], ["점심 12.000.", 12000],
  ["12.000원 점심", 12000], ["12.000 점심", 12000], ["점심 12.000 현금", 12000], ["1.200.000원 월세", 1200000], ["월세 1.200.000", 1200000],
  ["점심 12.500", 12500], ["점심 12.500원", 12500], ["4.500 커피", 4500], ["커피 4.500", 4500],
];
const notAmounts = [
  "저녁 치킨 1/2는 친구 몫 10000", "저녁 3.5쯤 커피 4000", "일 평균 1.5에 3000",
  "환전 1.320 달러 100000", "버전 1.234 업데이트 5000", "금리 3.125 이자 30000", "대출 금리 4.125 이자 250000", "123.456 택시 8000", "주유 45.123 리터 70000", "고기 1.250 kg 30000",
  "1.320 달러", "고기 1.250 kg", "주유 45.123 리터", "버전 1.234 업데이트", "123.456 택시", "커피 3.750",
];
await withClock("2026-07-15", async () => {
  for (const [text, amount] of digitCases) {
    const row = only(text);
    eq(row.amount, amount, `Q-2 ‘${text}’ 의 금액`);
    ok(!/\d/.test(String(row.memo)), `Q-2 ‘${text}’ 의 메모에 숫자 조각이 남지 않는다(${row.memo})`);
  }
  eq(only("점심 12.000 현금").payment_method, "현금", "Q-2 금액 뒤 결제수단을 그대로 읽는다");
  for (const [text, amounts] of [["커피 12.000 점심 9000", "12000,9000"], ["커피 12.000, 점심 9.000", "12000,9000"], ["커피 12.000 점심 9.000", "12000,9000"], ["커피 4.500\n점심 9000", "4500,9000"]]) {
    eq(rowsOf(text).map((row) => row.amount).join(), amounts, `Q-2 ‘${text}’ 의 금액들`);
  }
  // 소수·분수·단위가 붙은 점 숫자는 금액이 아니다. 옛 판과 같이 저장하지 않고 다시 묻는다(조용히 틀리지 않는다).
  for (const text of notAmounts) eq(rowsOf(text).length, 0, `Q-2 ‘${text}’ 는 저장하지 않는다`);
  // 끝이 .000 이면 자릿수로 읽는다: 점 없는 ‘포인트 1000 사용 커피 3000’ 과 같은 두 건이다. 안 이으면 ‘커피 12.000 점심 9000’ 이 12원이 된다.
  eq(rowsOf("포인트 1.000 사용 커피 3000").map((row) => row.amount).join(), "1000,3000", "Q-2 끝이 .000 인 숫자는 앞 낱말과 무관하게 자릿수다");
  for (const [text, amount] of [["식비 예산 300.000원", 300000], ["이번달 예산 1.000.000원", 1000000], ["11월 식비 예산 300.000", 300000], ["식비 예산 30만원", 300000]]) {
    eq(parseDirectBudgetSetCommand(text)?.amount, amount, `Q-2 예산 명령 ‘${text}’ 의 금액`);
  }
});

// ── Q-1 보강(독립 검토): 날짜로 읽으면 안 되는 말과 읽어야 하는 말 ──────────────────────────────
const TODAY = "2026-07-15";
const dayWordCases = [
  // 견주는 말: 날짜가 아니다. 메모도 그대로 둔다.
  ["어제보다 비싼 커피 6000", TODAY, "어제보다 비싼 커피"], ["어제와 같은 점심 9000", TODAY, "어제와 같은 점심"], ["어제처럼 커피 4500", TODAY, "어제처럼 커피"],
  ["어제만큼 쓴 식비 20000", TODAY, "어제만큼 쓴 식비"], ["어제까지 쓴 식비 20000", TODAY, "어제까지 쓴 식비"], ["어제부터 아파서 약 5000", TODAY, "어제부터 아파서 약"], ["어제자로 커피 4500", TODAY, "어제자로 커피"],
  // ‘그제’ 로 시작하는 다른 낱말
  ["그제품 샀어 30000", TODAY, "그제품"], ["그제품 30000", TODAY, "그제품"], ["그제과점 빵 5000", TODAY, "그제과점 빵"], ["그제주도 여행 300000", TODAY, "그제주도 여행"],
  ["그제저녁에 치킨 23000", "2026-07-13", "저녁 치킨"], ["그제밤 택시 20000", "2026-07-13", "밤 택시"],
  // 기간·횟수 뜻
  ["1일에 두 번 먹는 약 5000", TODAY, "1일에 두 번 먹는 약"], ["3일에 한 번 오는 청소 30000", TODAY, "3일에 한 번 오는 청소"], ["7일에 한번 간식 3000", TODAY, "7일에 한번 간식"],
  ["3일은 입원 300000", TODAY, "3일은 입원"], ["2일도 안 쓴 충전기 환불 5000", TODAY, "2일도 안 쓴 충전기 환불"], ["25일은 커피 4000", TODAY, "25일은 커피"], ["25일쯤 커피 4000", TODAY, "25일쯤 커피"],
  // 달을 함께 쓴 날짜·조사 붙은 날짜
  ["7월 3일은 커피 4000", "2026-07-03", "커피"], ["7월 3일도 커피 4000", "2026-07-03", "커피"], ["5일날 커피 4000", "2026-07-05", "커피"],
  ["7/3에 커피 4000", "2026-07-03", "커피"], ["7.13에 커피 4000", "2026-07-13", "커피"], ["07.3에 택시 8000", "2026-07-03", "택시"], ["7/3에 제주 커피 4000", "2026-07-03", "제주 커피"], ["7/3에 저녁 치킨 20000", "2026-07-03", "저녁 치킨"],
  // 문장 끝의 날짜 말, 붙여 쓴 말
  ["커피 4000 내일모레", "2026-07-17", "커피"], ["내일모레에 커피 4000", "2026-07-17", "커피"],
  ["어제회사 점심 9000", "2026-07-14", "회사 점심"], ["어제회비 30000", "2026-07-14", "회비"], ["어제날짜로 커피 4500", "2026-07-14", "날짜로 커피"], ["어제날씨 추워서 핫팩 3000", "2026-07-14", "날씨 추워서 핫팩"],
  ["오늘날 커피값 5000", TODAY, "오늘날 커피값"], ["어제오늘 커피 8000", TODAY, "어제오늘 커피"], ["오늘내일 커피 8000", TODAY, "오늘내일 커피"],
];
const notDates = ["7/3은 커피 4000", "7-3에 커피 4000", "7/3일에 커피 4000", "13.5에 저녁 3000", "맥주 1.5에 3000"];
await withClock("2026-07-15", async () => {
  for (const [text, date, memo] of dayWordCases) {
    const row = only(text);
    eq(row.transaction_date, date, `Q-1 ‘${text}’ 의 날짜`);
    eq(row.memo, memo, `Q-1 ‘${text}’ 의 메모`);
  }
  for (const text of notDates) eq(rowsOf(text).length, 0, `Q-1 ‘${text}’ 는 날짜를 짐작해 저장하지 않는다`);
});
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js"]) {
  const code = fromAsset(await assetText(path), "foldInputWidth");
  const browser = vm.runInNewContext(`(${code})`);
  for (const text of [...digitCases.map((item) => item[0]), ...notAmounts, ...dayWordCases.map((item) => item[0]), ...notDates]) {
    eq(browser(text), foldInputWidth(text), `${path} ‘${text}’ 이 서버와 같다`);
  }
  eq(browser("회비 12.000", true), "회비 12.000", `${path} 메모로 접을 때는 점을 잇지 않는다`);
}

// ── Q-3 보강(독립 검토): 새 낱말이 넓게 잡던 말 ────────────────────────────────────────────
for (const [text, category] of [
  ["점심 9000 그린카드", "외식"], ["커피 4500 그린카드", "카페/간식"], ["스타벅스 6000 ssg페이", "카페/간식"], ["커피 4500 ssg페이", "카페/간식"],
  ["계란라면 3000", "외식"], ["계란볶음밥 8000", "외식"], ["달걀샌드위치 4500", "외식"], ["야채곱창 12000", "외식"], ["계란빵 2000", "카페/간식"], ["우유식빵 3000", "카페/간식"], ["야채빵 2000", "카페/간식"], ["우유 라떼 4500", "카페/간식"],
  ["옷 수선 8000", "의류/잡화"], ["수선화 꽃 5000", "경조사/선물"], ["그린카 대여 30000", "교통"], ["ssg닷컴 주문 30000", "장보기"], ["쓱배송 40000", "장보기"], ["가구 구매 300000", "생활용품"], ["호프집 20000", "외식"], ["손목시계 100000", "의류/잡화"],
]) eq(rowsOf(text)[0]?.category, category, `Q-3 ‘${text}’ 의 분류`);
for (const [text, wrong] of [
  ["그린카드 연회비 15000", "교통"], ["ssg페이 충전 10000", "장보기"], ["ssg랜더스 야구 티켓 20000", "장보기"], ["공차기 수업 50000", "카페/간식"], ["호프만 책 20000", "외식"],
  ["특가구매 30000", "생활용품"], ["정가구매 30000", "생활용품"], ["최저가구매 30000", "생활용품"], ["휴가전 쇼핑 50000", "생활용품"], ["도매가구입 30000", "생활용품"],
  ["즉시계좌이체 30000", "의류/잡화"], ["도시계획세 30000", "의류/잡화"], ["파마산치즈 9000", "미용"], ["파마산 치즈 9000", "미용"], ["파마산 가루 9000", "미용"],
  ["1기부가세 500000", "경조사/선물"], ["3분기부가세 300000", "경조사/선물"], ["3분기부터 30000", "경조사/선물"], ["자기부담금 300000", "경조사/선물"], ["수리 자기부담금 300000", "경조사/선물"], ["오후원서 5000", "경조사/선물"],
]) ok(rowsOf(text)[0]?.category !== wrong, `Q-3 ‘${text}’ 는 ${wrong} 이 아니다`);

// ── Q-11 웹 저장의 문장 판정도 해석기와 같은 글자를 읽는다 ────────────────────────────────────
await withClock("2026-07-15", () => fixture(async (fx) => {
  const save = (raw_text, amount, memo) => post(fx, "/admin/transactions", { household_id: HH, month: "2026-07", type: "expense", transaction_date: "2026-07-15", amount, category: "기타지출", memo, raw_text });
  for (const [text, amount, memo] of [["월세 1.200.000원", "1200000", "월세"], ["회비 5.000", "5000", "회비"], ["회비 12.000원", "12000", "회비"]]) {
    const before = fx.db.transactions.length;
    const response = await save(text, amount, memo);
    ok(!response.decoded.includes("err="), `Q-11 ‘${text}’ 을 막지 않는다(${response.decoded})`);
    eq(fx.db.transactions.length, before + 1, `Q-11 ‘${text}’ 가 한 건 저장된다`);
    eq(Number(fx.db.transactions.at(-1)?.amount), Number(amount), `Q-11 ‘${text}’ 의 금액`);
    eq(fx.db.transactions.at(-1)?.raw_text, text, `Q-11 ‘${text}’ 의 원문은 고치지 않고 남긴다`);
  }
  const before = fx.db.transactions.length;
  const small = await save("회비 5", "5", "회비");
  ok(small.decoded.includes("amount_unit_required"), `Q-11 단위 없는 한 자리 숫자는 그대로 다시 묻는다(${small.decoded})`);
  eq(fx.db.transactions.length, before, "Q-11 단위를 묻는 동안 저장하지 않는다");
}));

// ── Q-12 연간 화면 안의 이동도 보던 달을 들고 간다 ──────────────────────────────────────────
await withClock("2026-10-31", () => fixture(async (fx) => {
  const annual = (await page(fx, `/annual?month=2026-07&household_id=${HH}`)).html.replaceAll("&amp;", "&");
  ok(annual.includes("/annual?year=2025&month=2025-07"), "Q-12 앞 해 화살표가 같은 달을 들고 간다");
  ok((await page(fx, `/annual?year=2025&month=2025-07&household_id=${HH}`)).html.replaceAll("&amp;", "&").includes("/annual?year=2026&month=2026-07"), "Q-12 뒤 해 화살표가 같은 달을 들고 간다");
  ok(annual.includes('name="month" value="2026-07"'), "Q-12 해 고르기 폼이 보던 달을 보낸다");
  ok(/\/app\?month=2026-07[^"]*"[^>]*>[^<]*가계부로 이동/.test(annual), "Q-12 ‘가계부로 이동’ 이 보던 달로 간다");
}));

// ── Q-13 목표 금액의 원 기호·점 자릿수, 두 번 눌러도 한 건 ──────────────────────────────────
await fixture(async (fx) => {
  const create = (fields) => api(fx, "/u/api/goals", "POST", { household: HH, action: "create", ...fields });
  for (const [name, target, saved] of [["원 기호", "₩100,000", 100000], ["전각 원 기호", "￦50000", 50000], ["점 자릿수", "1.000.000", 1000000]]) {
    const response = await create({ name, target, monthly: "" });
    eq(response.status, 200, `Q-13 ‘${target}’ 은 저장한다`);
    eq(response.data?.goals?.find((goal) => goal.name === name)?.target, saved, `Q-13 ‘${target}’ 의 금액`);
  }
  for (const target of ["0", "00", "-5", "100만"]) {
    const message = String((await create({ name: `안내 ${target}`, target, monthly: "" })).data?.message);
    ok(message.includes("100만") && message.includes("1원부터 1,000억"), `Q-13 ‘${target}’ 을 거절할 때 쓸 수 있는 꼴을 알려 준다(${message})`);
  }
});
ok((await assetText("/assets/accountbook-goals-v22993.js")).includes("if (adding) return;"), "Q-13 목표 추가는 보내는 동안 다시 보내지 않는다");

// ── Q-14 비밀번호 변경 재인증은 가계부가 없으니 역할을 읽지 않는다 ───────────────────────────
await fixture(async (fx) => {
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", KAKAO_REDIRECT_URI: "https://malhaebook.com/auth/kakao/callback" });
  const cookiePairs = (headers) => (headers.getSetCookie?.() || []).map((value) => value.split(";")[0]);
  const json = (body) => new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } });
  let roleReads = 0;
  const stop = intercept(({ url, method }) => {
    if (url.hostname === "kauth.kakao.com") return json({ access_token: "synthetic-token", token_type: "bearer" });
    if (url.hostname === "kapi.kakao.com") return json({ id: 2265, properties: { nickname: "Bin" } });
    if (method === "GET" && url.pathname.endsWith("/household_members") && String(url.searchParams.get("household_id")).includes("credential-change")) roleReads += 1;
    return undefined;
  });
  try {
    const start = await app.fetch(new Request(`${BASE}/auth/kakao/start?reauth=credential-change&return_to=${encodeURIComponent("/my/backup-login")}`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
    const state = new URL(start.headers.get("location") || "https://x.invalid/").searchParams.get("state");
    ok(!!state, "Q-14 시험: 카카오 본인 확인으로 간다");
    const callback = await app.fetch(new Request(`${BASE}/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { headers: { cookie: [fx.cookie, ...cookiePairs(start.headers)].join("; ") } }), fx.env, ctx);
    ok((callback.headers.get("location") || "").includes("msg=account_reauth_verified"), `Q-14 본인 확인이 끝난다(${callback.headers.get("location")})`);
    eq(roleReads, 0, "Q-14 가계부 번호 칸에 글자를 넣어 조회하지 않는다");
  } finally { stop(); }
});

// ── Q-15 정기 추가 폼 ─────────────────────────────────────────────────────────────────
await withClock("2026-10-31", () => fixture(async (fx) => {
  const html = (await page(fx, `/reserve-plans?month=2026-07&household_id=${HH}`)).html;
  ok(/<select name="user_id" required/.test(html), "Q-15 지출자를 비워 두고 보내지 못한다");
  ok(/<input[^>]*name="amount"[^>]*required|<input[^>]*required[^>]*name="amount"/.test(html), "Q-15 금액을 비워 두고 보내지 못한다");
  const back = await post(fx, "/admin/recurring/save", { household_id: HH, month: "2026-07", type: "expense" });
  ok(back.decoded.includes("month=2026-07"), `Q-15 돌아갈 주소가 보던 달을 유지한다(${back.decoded})`);
}));

// ── Q-16~Q-19 화면 깨짐(Aside 2차 검수) ─────────────────────────────────────────────────────
{
  const shell = await assetText("/assets/accountbook-shell-v22993.css");
  const dark = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell ';
  for (const [rule, message] of [
    [".abQuickCompact .abGlobalActionQuick{max-width:56px;padding-right:0;gap:16px}", "Q-16 줄어든 빠른 입력 버튼에 글자 조각이 보이지 않는다"],
    ['@media(max-width:440px){body.abV22812Shell .abV5ControlBar:has(input[type="month"]):not(:has(select~select)),body.abV22812Shell.abPageMenu .menuContext{grid-template-columns:minmax(0,1fr) auto!important}', "Q-17 좁은 폭의 조회 줄에서 달 칸이 넓다"],
    [`${dark}:is(.pill.warn,.state.warn,.goalStatus.st-behind){background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important}`, "Q-18 다크의 ‘부족’ 배지"],
    [`${dark}:is(.pill.bad,.state.bad){background:var(--ab12-bad-bg)!important;color:var(--ab12-bad-text)!important}`, "Q-18 다크의 ‘초과’ 배지"],
    [`${dark}:is(.pill.ok,.state.ok,.goalStatus.st-done){background:var(--ab12-ok-bg)!important;color:var(--ab12-ok-text)!important}`, "Q-18 다크의 ‘완료’ 배지"],
    [`${dark}:is(.pill.setup,.goalStatus.st-onTrack){background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}`, "Q-18 다크의 ‘순항’ 배지"],
    ["--ab12-ok-bg:#123c33;--ab12-ok-text:#bbf7d0;--ab12-bad-bg:#4b1d1d;--ab12-bad-text:#fecaca", "Q-18 다크의 상태 색 토큰"],
    ['body.abV22812Shell .abV5ControlBar:has(input[type="month"]):has(select~select)>select:first-of-type,body.abV22812Shell .abV5ControlBar:has(input[type="month"]):has(select~select)>button{grid-column:1/-1}}', "Q-27 고르는 칸이 둘인 조회 줄은 좁은 폭에서 가계부 칸을 한 줄로 쓴다"],
  ]) ok(shell.includes(rule), message);
}
await fixture(async (fx) => {
  ok(/\.lrBars b\{[^}]*white-space:nowrap/.test((await page(fx, `/reports?month=2026-07&household_id=${HH}`)).html), "Q-19 두 자리 날짜 축이 세로로 갈라지지 않는다");
  ok((await page(fx, `/goals?month=2026-07&household_id=${HH}`)).html.includes('.goalForm input[name="name"],.goalForm button{grid-column:1/-1}'), "Q-29 좁은 폭의 목표 이름 칸과 추가 단추는 한 줄을 쓴다");
  ok((await page(fx, `/goals?month=2026-07&household_id=${HH}`)).html.includes('.goalForm{display:flex;flex-wrap:wrap;gap:8px}') && (await page(fx, `/goals?month=2026-07&household_id=${HH}`)).html.includes('.goalForm input[name="name"]{flex:2 1 210px}'), "Q-51 목표 입력줄은 화면 폭이 아니라 칸 자리에 따라 줄을 바꾼다");
  ok((await page(fx, `/my/backup?month=2026-07&household_id=${HH}`)).html.includes('body.abV22812Shell .cgOpen .cgDot{color:#fff!important}'), "Q-18 다크의 카드사 글자가 흰색이다");
  const missing = await page(fx, "/app?month=2026-07&household_id=no-such-house");
  const member = fx.db.household_members.find((row) => row.household_id === HH && row.user_id === fx.db.household_members.find((item) => item.household_id === HH && item.role === "owner").user_id);
  member.role = "member";
  const notice = await page(fx, `/my/members?month=2026-07&household_id=${HH}`);
  member.role = "owner";
  for (const [name, view, text] of [["찾을 수 없음", missing, "가계부를 찾을 수 없어요"], ["권한 안내", notice, "관리자 권한이 필요한 화면"]]) {
    ok(view.html.includes(text), `Q-20 ${name} 화면을 시험한다`);
    ok(/<script src="\/assets\/accountbook-theme-v\d+\.js"><\/script>/.test(view.html), `Q-20 ${name} 화면에 테마 스크립트가 있다`);
    ok(view.html.includes('html[data-ab-resolved-theme="dark"] body{background:#101217!important'), `Q-20 ${name} 화면에 다크 값이 있다`);
  }
});

// ── Q-26 웹 한 줄 입력의 금액 둘(이 폼은 한 번에 한 건만 저장한다) ─────────────────────────
{
  const { normalizeInputText } = await import("../src/modules/client/shared-input-nlu.js");
  const home = await assetText("/assets/mobile-home-v22993.js");
  const scan = (text) => normalizeInputText(normalizeInputText(foldInputWidth(text)));
  const count = vm.runInNewContext(`${fromAsset(home, "moneyTokenSpans")}\n${fromAsset(home, "quickAmountCount")}\nquickAmountCount`);
  for (const [text, expected] of [
    ["커피 12.000 점심 9000", 2], ["커피 12000 점심 9000", 2], ["빵 2600, 우산 4700", 2], ["빵 2600,우산 4700", 2], ["빵 2600; 우산 4700", 2], ["빵 2600 / 우산 4700", 2], ["빵 2600·우산 4700", 2], ["월세 50만원 관리비 10만원", 2],
    ["커피 12,000원", 1], ["커피 12.000원", 1], ["7월 3일 커피 4000", 1], ["커피 4500 2잔", 1], ["2026-07-03 커피 4000", 1], ["커피", 0],
    // Q-38 다음 항목에 붙은 가격. 수량 단위와 세 자리까지의 숫자는 금액이 아니다.
    ["커피 5000점심 9000", 2], ["커피5000점심9000", 2], ["커피 1,500점심 9000", 2], ["맥주 1000밀리 5000", 1], ["버스 7016번 1500", 1], ["7080노래방 30000", 1], ["맥주 500캔 3000", 1],
    // Q-41 금액 뒤 쉼표는 구분 부호다. 뒤가 숫자이면 그대로 자릿수·금액 없음이다.
    ["점심 9000원, 국민카드", 1], ["점심 9000, 카드", 1], ["택시 8000원, 어제", 1], ["3000,500", 0], ["1,000,000원", 1],
    // Q-40 띄어 쓴 날짜는 금액이 아니다.
    ["2026. 10. 31 커피 4000", 1], ["10. 31 커피 4000", 1], ["12. 25. 케이크 30000", 1],
  ]) eq(count(scan(text)), expected, `Q-26 ‘${text}’ 의 금액 수`);

  const quickPage = () => {
    const browser = createInputBrowser();
    const submit = browser.element("button", { class: "quickSubmit", type: "submit" }, browser.form);
    browser.run(["quickAmountFieldState", "moneyTokenSpans", "quickAmountCount", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText", "normalizeInputText", "foldInputWidth", "joinSpacedKoreanAmount", "inputPaymentPatterns"].map((name) => fromAsset(home, name)).join("\n"));
    browser.run(`const state=(${fromAsset(home, "quickSmartInputController")})({amount:parseMobileAmountText,date:quickInputDate,type:text=>transactionTypeFromText(text,[]),category:()=>"",payment:()=>"",memo:(text,token)=>text.replace(token,"").trim()});`);
    const type = (text, enter = false) => { browser.smart.value = text; browser.run(`state.apply(${enter})`); };
    const warned = () => browser.fields.after.textContent.includes("금액이 둘 이상이에요");
    return { browser, submit, type, warned };
  };
  for (const text of ["커피 12.000 점심 9000", "커피 12000 점심 9000", "빵 2600, 우산 4700"]) {
    const { browser, submit, type, warned } = quickPage();
    type(text);
    ok(warned(), `Q-26 ‘${text}’ 은 나눠 적으라고 안내한다`);
    eq(submit.disabled, true, `Q-26 ‘${text}’ 의 저장 단추가 꺼진다`);
    eq(browser.fire(browser.form, "submit"), false, `Q-26 ‘${text}’ 은 Enter 로도 저장되지 않는다`);
    type(text, true);
    eq(browser.smart.value, text, `Q-26 ‘${text}’ 은 나눠 적을 수 있게 문장을 남긴다`);
    type("");
    eq(browser.fields.amountInput.value, "", `Q-26 ‘${text}’ 을 지우면 금액 칸도 비운다`);
    eq(browser.fields.memoInput.value, "", `Q-26 ‘${text}’ 을 지우면 내용 칸도 비운다`);
    ok(!warned(), `Q-26 ‘${text}’ 을 지우면 안내가 사라진다`);
    eq(submit.disabled, true, `Q-26 ‘${text}’ 을 지운 뒤 빈 칸은 저장되지 않는다`);
  }
  {
    const { browser, submit, type, warned } = quickPage();
    type("커피 12000 점심 9000");
    type("커피 12000");
    ok(!warned(), "Q-26 한 건으로 고치면 안내가 사라진다");
    eq(submit.disabled, false, "Q-26 한 건으로 고치면 저장할 수 있다");
    eq(browser.fields.amountInput.value, "12,000", "Q-26 한 건으로 고친 금액");
    type("커피 12000", true);
    eq(browser.smart.value, "", "Q-26 한 건은 예전처럼 Enter 로 문장을 비운다");
  }
  for (const field of ["amountInput", "memoInput"]) {
    const { browser, submit, type, warned } = quickPage();
    type("커피 12000 점심 9000");
    browser.set(field, field === "amountInput" ? "9000" : "점심");
    ok(!warned(), `Q-26 ${field} 를 손으로 고치면 본 것으로 여긴다`);
    eq(submit.disabled, false, `Q-26 ${field} 를 손으로 고치면 저장할 수 있다`);
    type("");
    eq(browser.fields[field].value, field === "amountInput" ? "9,000" : "점심", `Q-26 손으로 고친 ${field} 는 문장을 지워도 남는다`);
  }
  // Q-39 먼저 고쳐 둔 칸은 경고를 푼 것이 아니다. 경고를 본 뒤 고친 칸만 푼다. 문장이 바뀌면 다시 묻는다.
  for (const [field, typed] of [["memoInput", "점심"], ["amountInput", "9000"]]) {
    const { browser, submit, type, warned } = quickPage();
    browser.set(field, typed);
    type("커피 12000 점심 9000");
    ok(warned(), `Q-39 ${field} 를 먼저 고쳐도 금액 둘인 문장은 묻는다`);
    eq(submit.disabled, true, `Q-39 ${field} 를 먼저 고쳐도 저장 단추가 꺼진다`);
    eq(browser.fire(browser.form, "submit"), false, `Q-39 ${field} 를 먼저 고쳐도 Enter 로 저장되지 않는다`);
    browser.set(field, typed);
    ok(!warned(), `Q-39 경고 뒤에 ${field} 를 고치면 풀린다`);
    eq(submit.disabled, false, `Q-39 경고 뒤에 ${field} 를 고치면 저장할 수 있다`);
    type("커피 12000 점심 9000 택시 3000");
    ok(warned(), `Q-39 문장이 바뀌면 ${field} 를 고쳤어도 다시 묻는다`);
  }
  {
    const { browser, submit, type, warned } = quickPage();
    const raw = browser.element("input", { id: "rawTextInput", type: "hidden", name: "raw_text" }, browser.form);
    type("커피 12000 점심 9000");
    eq(raw.value, "커피 12000 점심 9000", "Q-39 문장의 원문을 담는다");
    type("");
    eq(raw.value, "", "Q-39 금액 둘인 문장을 지우면 원문도 지운다");
    browser.fire(browser.form, "ab:quick-restore", { detail: { manual: {} } });
    ok(!warned(), "Q-39 지운 뒤 임시저장을 되살려도 묻지 않는다");
    eq(browser.fields.amountInput.value, "", "Q-39 지운 뒤 금액 칸은 비어 있다");
    eq(submit.disabled, true, "Q-39 지운 뒤 빈 칸은 저장되지 않는다");
  }
  for (const [text, manual, blocked] of [["커피 12000 점심 9000", {}, true], ["빵 2600, 우산 4700", {}, true], ["커피 12000 점심 9000", { amount: "1" }, false], ["커피 12000", {}, false], ["1. 김밥 3200원", {}, false]]) {
    const { browser, submit, warned } = quickPage();
    browser.element("input", { id: "rawTextInput", type: "hidden", name: "raw_text" }, browser.form).value = text;
    browser.fields.amountInput.value = "12,000";
    browser.fields.memoInput.value = "내용";
    browser.fire(browser.form, "ab:quick-restore", { detail: { manual } });
    eq(warned(), blocked, `Q-26 임시저장에서 되살린 ‘${text}’ (${JSON.stringify(manual)}) 의 안내`);
    eq(submit.disabled, blocked, `Q-26 임시저장에서 되살린 ‘${text}’ (${JSON.stringify(manual)}) 의 저장 단추`);
  }
  for (const text of ["커피 12,000원", "커피 4500 2잔"]) {
    const { submit, type, warned } = quickPage();
    type(text);
    ok(!warned(), `Q-26 ‘${text}’ 은 한 건이다`);
    eq(submit.disabled, false, `Q-26 ‘${text}’ 은 저장할 수 있다`);
  }
  // Q-28 줄머리 목록 표식은 금액이 아니다. 저장하는 원문은 친 그대로다.
  for (const [text, amount, memo] of [["1. 김밥 3200원", "3,200", "김밥"], ["2) 커피 4000원", "4,000", "커피"], ["- 택시 8000원", "8,000", "택시"], ["• 점심 9000원", "9,000", "점심"]]) {
    const { browser, submit, type, warned } = quickPage();
    browser.element("input", { id: "rawTextInput", type: "hidden", name: "raw_text" }, browser.form);
    type(text);
    eq(browser.fields.amountInput.value, amount, `Q-28 ‘${text}’ 의 금액`);
    eq(browser.fields.memoInput.value, memo, `Q-28 ‘${text}’ 의 내용`);
    eq(browser.document.getElementById("rawTextInput").value, text, `Q-28 ‘${text}’ 의 원문은 친 그대로다`);
    ok(!warned(), `Q-28 ‘${text}’ 은 한 건이다`);
    eq(submit.disabled, false, `Q-28 ‘${text}’ 은 저장할 수 있다`);
  }
  // Q-41 금액 뒤 쉼표 다음의 결제수단·날짜 말
  for (const [text, amount] of [["점심 9000원, 국민카드", "9,000"], ["점심 9000, 카드", "9,000"], ["커피 5000원, 현금", "5,000"], ["택시 8000원, 어제", "8,000"]]) {
    const { browser, submit, type, warned } = quickPage();
    type(text);
    eq(browser.fields.amountInput.value, amount, `Q-41 ‘${text}’ 의 금액`);
    ok(!warned(), `Q-41 ‘${text}’ 은 한 건이다`);
    eq(submit.disabled, false, `Q-41 ‘${text}’ 은 저장할 수 있다`);
  }
  // Q-40 줄머리의 띄어 쓴 날짜는 목록 표식이 아니다.
  await withClock("2026-07-15", () => {
    for (const [text, date, amount] of [["2026. 10. 31 커피 4000", "2026-10-31", "4,000"], ["10. 31 커피 4000", "2026-10-31", "4,000"], ["12. 25. 케이크 30000", "2026-12-25", "30,000"], ["7. 3. 커피 4000", "2026-07-03", "4,000"], ["26. 10. 31 커피 4000", "2026-10-31", "4,000"], ["26.10.31 커피 4000", "2026-10-31", "4,000"], ["콜라 1.5L 2500", "2026-07-15", "2,500"], ["주차 1.5시간 3000", "2026-07-15", "3,000"]]) {
      const { browser, submit, type, warned } = quickPage();
      type(text);
      eq(browser.fields.txDate.value, date, `Q-40 ‘${text}’ 의 날짜`);
      eq(browser.fields.amountInput.value, amount, `Q-40 ‘${text}’ 의 금액`);
      ok(!warned(), `Q-40 ‘${text}’ 은 한 건이다`);
      eq(submit.disabled, false, `Q-40 ‘${text}’ 은 저장할 수 있다`);
    }
  });
  for (const text of ["1)김밥 3200원", "(1) 김밥 3200원", "2.커피 4000원"]) {
    const { type, warned } = quickPage();
    type(text);
    ok(warned(), `Q-28 ‘${text}’ 은 앞 숫자를 금액으로 저장하지 않고 묻는다`);
  }
  for (const [text, rows] of [
    ["1) 김밥 3200원", [[3200, "김밥"]]], ["2) 커피 4000원", [[4000, "커피"]]], ["1. 김밥 3200원", [[3200, "김밥"]]], ["- 택시 8000원", [[8000, "택시"]]],
    ["1) 김밥 3200원\n2) 커피 4000원", [[3200, "김밥"], [4000, "커피"]]], ["1. 김밥 3200원\n2. 커피 4000원", [[3200, "김밥"], [4000, "커피"]]],
  ]) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo])), JSON.stringify(rows), `Q-28 카카오 ‘${text}’`);
  // Q-40 표식은 한 번만 뗀다. ‘7. 3.’ 을 표식 둘로 읽으면 날짜를 잃는다.
  await withClock("2026-07-15", () => {
    for (const [text, rows] of [
      ["7. 3. 커피 4000", [[4000, "커피", "2026-07-03"]]], ["1. 3. 커피 4000", [[4000, "커피", "2026-01-03"]]], ["10. 31. 커피 4000", [[4000, "커피", "2026-10-31"]]], ["12. 25. 케이크 30000", [[30000, "케이크", "2026-12-25"]]],
      ["10. 31 커피 4000", [[4000, "커피", "2026-10-31"]]], ["12. 25 케이크 30000", [[30000, "케이크", "2026-12-25"]]], ["2026. 10. 31 커피 4000", [[4000, "커피", "2026-10-31"]]], ["2026. 10. 31. 커피 4000", [[4000, "커피", "2026-10-31"]]],
      ["10. 31 커피 4000\n11. 1 점심 9000", [[4000, "커피", "2026-10-31"], [9000, "점심", "2026-11-01"]]],
    ]) eq(JSON.stringify(parseMultipleTransactions(text).map((row) => [row.amount, row.memo, row.transaction_date])), JSON.stringify(rows), `Q-40 카카오 ‘${text}’`);
    // 날짜 범위 밖이거나 금액 꼴이면 그대로 목록 표식이다.
    for (const [text, rows] of [["1. 5만원 주유", [[50000, "주유"]]], ["2. 3000원 커피", [[3000, "커피"]]], ["1. 12000 점심", [[12000, "점심"]]]]) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo])), JSON.stringify(rows), `Q-40 날짜가 아닌 ‘${text}’`);
  });
  // Q-48 두 자리 연도는 한 건이다(‘26. 10. 31 커피 4000’ 이 10원·31원·4000원 세 건으로 저장됐다).
  await withClock("2026-07-15", () => {
    for (const text of ["26. 10. 31 커피 4000", "26. 10. 31. 커피 4000", "26.10.31 커피 4000", "26.10.31. 커피 4000", "26/10/31 커피 4000", "26-10-31 커피 4000"]) eq(JSON.stringify(parseMultipleTransactions(text).map((row) => [row.amount, row.memo, row.transaction_date])), JSON.stringify([[4000, "커피", "2026-10-31"]]), `Q-48 ‘${text}’`);
    eq(parseMultipleTransactions("25.12.25 케이크 30000")[0]?.transaction_date, "2025-12-25", "Q-48 지난해");
    for (const text of ["26.13.31 커피 4000", "26.10.32 커피 4000"]) eq(parseMultipleTransactions(text).length, 0, `Q-48 없는 날 ‘${text}’ 은 저장하지 않는다`);
    // Q-46 소수 단위는 날짜가 아니다. 날짜 꼴이 달력에 없으면 그대로 막는다.
    for (const [text, memo] of [["콜라 1.5L 2500", "콜라 1.5L"], ["1.5L 콜라 2500", "1.5L 콜라"], ["1.5kg 고기 12000", "1.5kg 고기"], ["주차 1.5시간 3000", "주차 1.5시간"], ["1.5인분 12000", "1.5인분"], ["10.5인치 태블릿 500000", "10.5인치 태블릿"], ["2.5평 원룸 300000", "2.5평 원룸"], ["1.5배 곱빼기 9000", "1.5배 곱빼기"], ["2.5단계 교육 30000", "2.5단계 교육"], ["제주맥주 4.5도 3000원", "제주맥주 4.5도"], ["저녁 맥주 4.5도 5000", "저녁 맥주 4.5도"], ["밤 기온 2.5도 핫팩 3000", "밤 기온 2.5도 핫팩"]]) {
      const rows = parseMultipleTransactions(text);
      eq(rows.length, 1, `Q-46 ‘${text}’ 은 한 건이다`);
      eq(rows[0]?.memo, memo, `Q-46 ‘${text}’ 의 내용`);
      eq(rows[0]?.transaction_date, "2026-07-15", `Q-46 ‘${text}’ 은 오늘 기록이다`);
    }
    for (const text of ["13/45 커피 4000", "13.45 커피 4000", "1.35 커피 4000"]) eq(parseMultipleTransactions(text).blocked?.message, "invalid_transaction_date", `Q-46 달력에 없는 ‘${text}’`);
    for (const [text, date] of [["10.31 커피 4000", "2026-10-31"], ["3.5 커피 4000", "2026-03-05"], ["7/3 커피 4000", "2026-07-03"]]) eq(parseMultipleTransactions(text)[0]?.transaction_date, date, `Q-46 날짜 ‘${text}’`);
    // Q-47 메모 앞뒤에 홀로 남은 부호와 이음말
    for (const [text, rows] of [
      ["커피 5000원.", [[5000, "커피"]]], ["커피 5000원...", [[5000, "커피"]]], ["5000원.", [[5000, "기타지출"]]], ["10.31. 커피 4000", [[4000, "커피"]]], ["2026.10.31. 커피 4000", [[4000, "커피"]]],
      ["커피 5000원 + 점심 9000원", [[5000, "커피"], [9000, "점심"]]], ["커피 5000원 - 점심 9000원", [[5000, "커피"], [9000, "점심"]]], ["커피 5000원과 점심 9000원", [[5000, "커피"], [9000, "점심"]]],
      ["커피 5000원 하고 점심 9000원", [[5000, "커피"], [9000, "점심"]]], ["김밥 3000원와 라면 4000원", [[3000, "김밥"], [4000, "라면"]]], ["커피 5000원. 점심 9000원", [[5000, "커피"], [9000, "점심"]]],
      ["1 + 1 커피 3000", [[3000, "1 + 1 커피"]]], ["2+1 음료 4000", [[4000, "2+1 음료"]]],
    ]) eq(JSON.stringify(parseMultipleTransactions(text).map((row) => [row.amount, row.memo])), JSON.stringify(rows), `Q-47 ‘${text}’`);
  });
  // Q-38 붙여 쓴 가격은 두 건이다(띄어 쓴 문장과 같게 읽는다).
  for (const [text, rows] of [["커피 5000점심 9000", [[5000, "커피"], [9000, "점심"]]], ["커피5000점심9000", [[5000, "커피"], [9000, "점심"]]], ["맥주 1000밀리 5000", [[5000, "맥주 1000밀리"]]], ["7080노래방 30000", [[30000, "7080노래방"]]]]) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo])), JSON.stringify(rows), `Q-38 카카오 ‘${text}’`);
}

// ── Q-21~Q-25 카카오 고치기·삭제 말 ─────────────────────────────────────
// 문장마다 새 픽스처다. ‘커피 4500’ 을 저장한 뒤 그 기록을 고치거나 지우고, 기록 수·금액·칸 값을 본다.
// 픽스처를 새로 만들어도 프로세스 메모리의 분당 제한·같은 말 반복 막기는 이어지므로 문장마다 비운다.
const kakaoAfter = (texts, { role = "" } = {}) => withClock("2026-07-15", () => fixture(async (fx) => {
  fx.env.SKILL_RATE_LIMIT = "10000";
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
  globalThis.__AB_KAKAO_INFLIGHT?.clear();
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  await skill(fx, "커피 4500");
  const before = { ...fx.db.transactions.at(-1) };
  const count = fx.db.transactions.length;
  if (role) fx.db.household_members.find((row) => row.household_id === HH && row.role === "owner").role = role;
  let reply = "";
  for (const text of texts) reply = JSON.stringify(await skill(fx, text));
  return { added: fx.db.transactions.length - count, row: fx.db.transactions.find((item) => item.id === before.id) || null, before, last: fx.db.transactions.at(-1), reply };
}));
// Q-30 실제 카카오 방 모양(Secret 일치 + botGroupKey). 강한 입력은 방 첫 기록 길로 바로 가서 직접 경로의 가드를 지나지 않는다. 직접 경로만 시험해 놓쳤다.
const roomSkill = async (fx, utterance) => {
  const key = "room-owner-q30", room = "room-q30";
  const headers = { "content-type": "application/json", "user-agent": "validate-v22993", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET };
  const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, intent: { id: "synthetic-fallback", name: "폴백 블록" }, userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } }, chat: { id: room, type: "botGroupKey", properties: { botGroupKey: room } } } };
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), fx.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  return JSON.stringify(await response.json());
};
const roomAfter = (texts, { role = "" } = {}) => withClock("2026-07-15", async () => {
  const fx = await createV2265QaFixture();
  const saved = globalThis.fetch;
  try {
    fx.env.SKILL_RATE_LIMIT = "10000";
    fx.env.KAKAO_SKILL_SECRET = "validate-v22993-secret";
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    await roomSkill(fx, "커피 4500");
    const before = { ...fx.db.transactions.at(-1) };
    const count = fx.db.transactions.length;
    if (role) fx.db.household_members.find((row) => row.household_id === before.household_id).role = role;
    let reply = "";
    for (const text of texts) {
      globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
      globalThis.__AB_KAKAO_INFLIGHT?.clear();
      reply = await roomSkill(fx, text);
    }
    return { added: fx.db.transactions.length - count, row: fx.db.transactions.find((item) => item.id === before.id) || null, before, last: fx.db.transactions.at(-1), reply };
  } finally {
    globalThis.fetch = saved;
    fx.restore();
  }
});
const bothPaths = [["직접", kakaoAfter], ["방", roomAfter]];
const edited = async (text, field, value, label) => {
  for (const [path, run] of bothPaths) {
    const result = await run([text]);
    eq(result.added, 0, `${label} ${path} ‘${text}’ 은 새 기록이 아니다`);
    eq(result.row?.[field], value, `${label} ${path} ‘${text}’`);
  }
};
const guided = async (text, label) => {
  for (const [path, run] of bothPaths) {
    const result = await run([text]);
    eq(result.added, 0, `${label} ${path} ‘${text}’ 은 새 기록이 아니다`);
    eq(result.row?.amount, 4500, `${label} ${path} ‘${text}’ 은 기록을 바꾸지 않는다`);
    eq(result.row?.memo, "커피", `${label} ${path} ‘${text}’ 은 내용을 바꾸지 않는다`);
    ok(result.reply.includes("새 기록으로 저장하지 않았어요"), `${label} ${path} ‘${text}’ 에 안내가 간다`);
  }
};
const recorded = async (text, label) => {
  for (const [path, run] of bothPaths) {
    const result = await run([text]);
    eq(result.added, 1, `${label} ${path} ‘${text}’ 은 기록이다`);
    eq(result.row?.amount, 4500, `${label} ${path} ‘${text}’ 은 앞 기록을 바꾸지 않는다`);
  }
};

// Q-21 값 하나만 읽는 칸의 점 자릿수
for (const [text, amount] of [["01번 금액 12.000원", 12000], ["01번 금액 13.000", 13000], ["01번 14.000원으로", 14000], ["방금 금액 15.000원", 15000], ["01번 금액 1.200.000원", 1200000]]) await edited(text, "amount", amount, "Q-21");
{
  const result = await kakaoAfter(["01번 금액 3.750"]);
  eq(result.added, 0, "Q-21 끝이 000 이 아닌 점 숫자는 기록이 아니다");
  eq(result.row?.amount, 4500, "Q-21 끝이 000 이 아닌 점 숫자는 금액을 바꾸지 않는다");
}
for (const [value, amount] of [["12.000", 12000], ["5.000원", 5000], ["1.200.000", 1200000], ["12.500", 12500], ["3.750", 0], ["1.5", 0], ["1.5만원", 15000], [12000, 12000]]) eq(parseAmountValue(value), amount, `Q-21 값 칸 ${value}`);

// Q-22 번호 없이 방금 기록의 금액을 고치는 말
for (const [text, amount] of [["방금 16000원으로 바꿔줘", 16000], ["방금 거 17000원으로 바꿔줘", 17000], ["방금꺼 18000원으로 수정", 18000], ["마지막 거 19000원으로", 19000], ["방금 기록 20.000원으로 수정해줘", 20000], ["방금 12000원으로 바꿔주세요", 12000], ["방금 거 12000원으로 고쳐주세요", 12000], ["아까 거 5000원으로 바꿔줘", 5000], ["방금 5천원으로 바꿔줘", 5000], ["방금 1만2천원으로 바꿔줘", 12000], ["방금 만이천원으로 바꿔줘", 12000], ["방금 금액을 12000원으로 바꿔줘", 12000], ["아까 거 금액 12000", 12000]]) await edited(text, "amount", amount, "Q-22");

// Q-23 조사가 값으로 저장되지 않는다
for (const text of ["01번 결제수단 현금으로", "01번 결제수단을 현금으로 바꿔줘", "방금 결제수단 현금으로", "01번 현금으로", "방금 거 현금으로 바꿔줘"]) await edited(text, "payment_method", "현금", "Q-23 결제수단");
for (const text of ["방금 거 카드로", "01번 카드로 바꿔주세요"]) await edited(text, "payment_method", "카드", "Q-23 결제수단");
for (const text of ["01번 분류 외식으로", "01번 분류를 외식으로 바꿔줘", "방금 분류 외식으로 바꿔줘", "방금 거 외식으로", "방금 거 외식으로 바꿔줘"]) await edited(text, "category", "외식", "Q-23 분류");
for (const [text, memo] of [["01번 내용을 점심으로 바꿔줘", "점심"], ["01번 내용 점심으로", "점심"], ["01번 메모 점심으로 수정", "점심"], ["방금 내용 점심으로", "점심"], ["01번 내용 택시로 바꿔줘", "택시"], ["01번 내용 종로", "종로"], ["01번 내용을 종로로 바꿔줘", "종로"]]) await edited(text, "memo", memo, "Q-23 내용");
for (const text of ["01번 날짜 어제로", "01번 날짜를 어제로 바꿔줘", "방금 날짜 어제로", "01번 어제로 바꿔줘", "방금 거 어제로 바꿔줘"]) await edited(text, "transaction_date", "2026-07-14", "Q-23 날짜");
for (const [text, amount] of [["01번 금액 5천원으로", 5000], ["01번 만이천원으로 바꿔줘", 12000]]) await edited(text, "amount", amount, "Q-23 금액");
for (const [steps, field, value] of [[["수정 01번", "3", "현금으로"], "payment_method", "현금"], [["수정 01번", "5", "어제로"], "transaction_date", "2026-07-14"], [["수정 01번", "4", "점심으로"], "memo", "점심"], [["수정 01번", "1", "5천원으로"], "amount", 5000], [["수정 01번", "2", "외식으로"], "category", "외식"], [["수정 01번", "1", "12000원으로요"], "amount", 12000], [["수정 01번", "5000원으로"], "amount", 5000], [["수정 01번", "현금으로"], "payment_method", "현금"]]) {
  const result = await kakaoAfter(steps);
  eq(result.row?.[field], value, `Q-23 대화로 고치는 값 ${steps.join(" → ")}`);
}
{
  eq((await kakaoAfter(["01번 수입으로 바꿔줘"])).row?.type, "income", "Q-23 ‘수입으로’ 는 그대로 구분 바꾸기다");
  const one = await kakaoAfter(["01번 일로"]);
  eq(one.row?.amount, 4500, "Q-23 ‘일로’ 는 금액 1원이 아니다");
  ok(!/변경했어요/.test(one.reply), "Q-23 ‘일로’ 는 바로 바꾸지 않는다");
}

// Q-24 고치거나 지우려는 말이 새 기록이 되지 않는다
for (const text of ["01번을 12000원으로 수정", "1번 12000원으로 해줘", "01번 12000원으로 바꿔주세요", "01번 금액을 12000원으로 수정해주세요"]) await edited(text, "amount", 12000, "Q-24 번호가 있는 말");
for (const text of ["커피 금액 5000원으로 바꿔줘", "아까 커피 5000원으로 수정", "방금 커피 5000원으로 수정", "커피 5000원으로 바꿔줘", "커피 5000으로 수정", "금액 틀렸어 5000원이야", "금액 5000원으로 수정", "금액 수정 5000원", "5000원으로 수정", "5000원으로 바꿔줘", "5천원으로 바꿔줘", "오천원으로 바꿔줘", "수정 커피 5000원", "삭제 커피 4500원", "커피 4500원 삭제", "커피 4500원 지워줘", "커피 4500 삭제해줘", "커피 삭제", "커피 지워줘", "아까 금액 12000원으로"]) await guided(text, "Q-24");
for (const text of ["바지 수정 5000원", "논문 수정 50000원", "옷 수선 12000원", "수정테이프 3000원", "앱 삭제 대행 3000원", "요금제 변경 5000원", "수리비 변경 없음 30000원", "5000원으로 점심 먹음", "방금 5000원으로 밥 먹음", "방금 택시 12000원 썼어", "아까 커피 5000원", "아까 점심 먹고 8000원", "마지막 커피 3000원", "최근 산 책 15000원", "주유 5만원으로 가득", "환전 10만원으로 바꿈", "5000원으로 바꿨어", "택시로 5000원", "금액권 5000원", "가격표 3000원", "1번 출구 택시 8000원", "2번 버스 1500원", "을지로 칼국수 9000원", "종로 떡볶이 7000원", "세로 액자 12000원"]) await recorded(text, "Q-24");

// Q-30 ‘으로’ 없는 꼴·끝맺음·띄어 쓴 금액도 같은 말이다. 오탐으로 새 기록을 막으면 안 되는 문장도 함께 본다.
for (const text of ["01번 5000원 수정", "01번 5000원 수정해줘", "1번 5000원 변경", "01번 5000원 바꿔줘", "01번 5000원으로 바꿔줘.", "01번 5000원으로바꿔줘", "01번 커피 5000원으로 바꿔줘", "01번 금액 5000원 부탁해"]) await edited(text, "amount", 5000, "Q-30 번호");
for (const text of ["방금 거 5000원", "아까 거 5000원", "마지막 거 5000원", "방금 거 5000원 수정", "방금 12000원으로 바꿔줘.", "방금 5000원으로 바꿔줘요", "방금 5000원으로 바꿔줄래", "방금 5000원으로 바꿔주라"]) await edited(text, "amount", text.includes("12000") ? 12000 : 5000, "Q-30 방금");
for (const [text, amount] of [["01번 3만 5천원으로", 35000], ["01번 1만 2천원으로 바꿔줘", 12000], ["방금 1만 2천원으로 바꿔줘", 12000], ["방금 만 이천원으로 바꿔줘", 12000]]) await edited(text, "amount", amount, "Q-30 띄어 쓴 금액");
for (const text of ["커피 5000원 바꿔줘", "커피 5000원 수정", "커피 5000원 수정해줘", "커피 5000원 변경", "커피 5000원 고쳐줘", "5000원 수정", "5000원 바꿔줘", "방금 점심 12000원 수정", "커피 5000원으로 바꿔줘.", "커피 5000원으로 바꿔줘요", "커피 5000원으로 바꿔줄래", "5000원으로 바꿔주라", "5000원으로 수정 부탁해", "5000원으로 할게요", "5000원으로", "5000원으로요", "5000원이요", "5000원입니다", "12.000원으로", "금액 5000원", "가격 5000원", "내용 점심 5000원", "분류 외식 5000원", "금액을 5000원으로 바꿔줘", "내용을 점심으로 바꿔줘", "날짜 어제로"]) await guided(text, "Q-30");
for (const [path, run] of bothPaths) {
  const askedName = await run(["01번 커피 5000원"]);
  eq(askedName.added, 0, `Q-30 ${path} ‘01번 커피 5000원’ 은 새 기록이 아니다`);
  eq(askedName.row?.amount, 4500, `Q-30 ${path} ‘01번 커피 5000원’ 은 묻기 전에 바꾸지 않는다`);
  ok(askedName.reply.includes("(네/아니오)"), `Q-30 ${path} ‘01번 커피 5000원’ 은 되묻는다`);
  const absent = await run(["2번 택시 8000원으로"]);
  eq(absent.added, 0, `Q-30 ${path} ‘2번 택시 8000원으로’ 은 새 기록이 아니다`);
  ok(absent.reply.includes("찾지 못했어요"), `Q-30 ${path} 없는 번호는 찾지 못했다고 답한다`);
}
for (const text of ["아까 가격표 3000원", "아까 금액권 5000원", "금액 수정 수수료 3000원", "가격 잘못 표시 환불 5000원", "2번 만원으로 먹음", "수정 테이프 3000원", "수정액 2000원", "날짜 변경 수수료 30000원", "방금 5000원", "이름 스티커 5000원", "5000원", "메모지 1500원", "내용증명 5000원", "결제수단 변경 수수료 1000원"]) await recorded(text, "Q-30");
// 번호 표기가 틀린 말, 권한, 처음 쓰는 사람
for (const [path, run] of bothPaths) {
  const viewer = await run(["커피 5000원으로 바꿔줘"], { role: "viewer" });
  eq(viewer.added, 0, `Q-30 ${path} 조회 전용의 고치는 말은 저장되지 않는다`);
  eq(viewer.row?.amount, 4500, `Q-30 ${path} 조회 전용의 고치는 말은 기록을 바꾸지 않는다`);
}

// Q-31 세션 답의 끝맺음. 직접·방 두 경로로 본다(방에서는 이 말이 세션을 끝내고 새 기록이 됐다).
const answers = (steps, label, expect) => Promise.all([]).then(async () => {
  for (const [path, run] of bothPaths) {
    const result = await run(steps);
    eq(result.added, 0, `${label} ${path} ${steps.join(" → ")} 은 새 기록이 아니다`);
    for (const [field, value] of Object.entries(expect)) eq(result.row?.[field], value, `${label} ${path} ${steps.join(" → ")} 의 ${field}`);
  }
});
for (const text of ["5000원이요", "5000원입니다", "5000원이에요", "5000원이야", "5000원임", "5000원 입니다", "5000이요", "5천원이요", "오천원이요", "5000원으로요", "5000원 으로", "5000 원으로", "5000원으로 바꿔줘", "5000원으로 해주세요", "5000원으로 할게요", "5000원으로 수정", "5000원 맞아요", "5000원이 맞아", "아니 5000원", "아니요 5000원", "금액은 5000원", "금액을 5000원으로", "금액 5000원으로 바꿔줘", "커피 5000원으로 바꿔줘"]) await answers(["수정 01번", "1", text], "Q-31", { amount: 5000, memo: "커피" });
await answers(["수정 01번", "5000원으로 바꿔줘"], "Q-31", { amount: 5000 });
await answers(["수정 01번", "커피 5000원으로 바꿔줘"], "Q-31", { amount: 5000, memo: "커피" });
for (const [field, step, text, value] of [["payment_method", "3", "현금이요", "현금"], ["payment_method", "3", "현금요", "현금"], ["payment_method", "3", "현금으로 해줘", "현금"], ["category", "2", "외식이요", "외식"], ["category", "2", "외식으로 바꿔줘", "외식"], ["memo", "4", "내용 점심으로 바꿔줘", "점심"], ["memo", "4", "점심으로 바꿔줘", "점심"], ["memo", "4", "라떼로 해줘", "라떼"], ["memo", "4", "택시로", "택시"], ["memo", "4", "아메리카노로 바꿔줘", "아메리카노"], ["memo", "4", "종로", "종로"], ["memo", "4", "을지로", "을지로"], ["memo", "4", "세종대로", "세종대로"], ["transaction_date", "5", "어제로 바꿔줘", "2026-07-14"], ["transaction_date", "5", "어제입니다", "2026-07-14"]]) await answers(["수정 01번", step, text], "Q-31", { [field]: value });
{
  // 분명한 새 기록은 예전처럼 세션을 끝내고 저장한다.
  const fresh = await kakaoAfter(["수정 01번", "1", "점심 9000원"]);
  eq(fresh.added, 1, "Q-31 세션 중의 분명한 새 기록은 저장한다");
  eq(fresh.row?.amount, 4500, "Q-31 세션 중의 새 기록은 고치던 기록을 바꾸지 않는다");
  // 방 경로에서도 수정이 끝났다고 알린다(다음 말이 값으로 읽히는 줄 알고 ‘5000원’ 을 보내면 또 기록이 된다).
  const inRoom = await roomAfter(["수정 01번", "1", "점심 9000원"]);
  eq(inRoom.added, 1, "Q-31 방 세션 중의 분명한 새 기록은 저장한다");
  ok(inRoom.reply.includes("수정은 끝내고"), "Q-31 방에서도 수정이 끝났다고 알린다");
}

// Q-32 묻는 말·불평·지우는 말은 값이 아니다.
for (const text of ["아까 거 내용 뭐였지", "아까 거 메모 뭐야", "01번 내용 뭐야", "방금 메모 지워줘", "01번 내용 삭제", "방금 내용 맞지?", "방금 결제수단 뭐야", "방금 거 분류 뭐야", "마지막 내용 확인", "방금 거 금액 얼마야", "방금 거 날짜 언제야"]) {
  for (const [path, run] of bothPaths) {
    const result = await run([text]);
    eq(result.added, 0, `Q-32 ${path} ‘${text}’ 은 새 기록이 아니다`);
    eq(result.row?.memo, "커피", `Q-32 ${path} ‘${text}’ 은 내용을 덮어쓰지 않는다`);
    eq(result.row?.amount, 4500, `Q-32 ${path} ‘${text}’ 은 금액을 바꾸지 않는다`);
    eq(result.row?.category, result.before.category, `Q-32 ${path} ‘${text}’ 은 분류를 바꾸지 않는다`);
    ok(result.reply.includes("그대로예요"), `Q-32 ${path} ‘${text}’ 은 기록이 그대로라고 말한다`);
  }
}
for (const [text, asked, next, field, value] of [["방금 금액 틀렸어", "얼마로 바꿀까요", "5000원", "amount", 5000], ["방금 거 내용 틀렸어", "무엇으로 바꿀까요", "점심", "memo", "점심"], ["방금 분류 이상해", "번호", "1", "category", "외식"]]) {
  const first = await kakaoAfter([text]);
  ok(first.reply.includes(asked), `Q-32 ‘${text}’ 은 그 칸을 다시 묻는다`);
  eq(first.added, 0, `Q-32 ‘${text}’ 은 새 기록이 아니다`);
  const result = await kakaoAfter([text, next]);
  eq(result.added, 0, `Q-32 ‘${text}’ 뒤의 ‘${next}’ 은 새 기록이 아니다`);
  eq(result.row?.[field], value, `Q-32 ‘${text}’ 뒤의 ‘${next}’ 이 값이 된다`);
}
for (const text of ["뭐였지", "내용 뭐야", "틀렸어"]) await answers(["수정 01번", "4", text], "Q-32 세션", { memo: "커피" });
for (const [text, memo] of [["01번 내용 지우개", "지우개"], ["01번 내용 맞춤 정장", "맞춤 정장"], ["01번 메모 이상형", "이상형"]]) await edited(text, "memo", memo, "Q-32 값인 낱말");

// Q-33 금액 둘을 이어 읽지 않는다.
for (const text of ["01번 금액 5000 3000", "01번 금액 5000원 3000원", "01번 금액 1,000원 2,000원"]) {
  for (const [path, run] of bothPaths) {
    const result = await run([text]);
    eq(result.row?.amount, 4500, `Q-33 ${path} ‘${text}’ 은 금액을 이어 읽지 않는다`);
    eq(result.added, 0, `Q-33 ${path} ‘${text}’ 은 새 기록이 아니다`);
  }
}
for (const steps of [["수정 01번", "1", "5000 3000"], ["수정 01번", "1", "5000원 3000원"], ["수정 01번", "1", "1,000원 2,000원"], ["수정 01번", "5000 3000", "네"]]) {
  const result = await kakaoAfter(steps);
  ok(result.row?.amount === 4500, `Q-33 세션 ${steps.join(" → ")} 은 금액을 이어 읽지 않는다`);
}
for (const [text, amount] of [["01번 금액 1만 2천원", 12000], ["01번 금액 1 2000", 0], ["01번 금액 12,000", 12000]]) if (amount) await edited(text, "amount", amount, "Q-33 한 금액");

// Q-50 한 말로 저장한 여러 건은 저장 시각이 같다. ‘방금’ 은 번호를 묻고 아무것도 바꾸지 않는다. 한 건 저장 뒤의 ‘방금’ 은 그대로 그 기록이다.
for (const [path, after] of bothPaths) {
  for (const command of ["방금 삭제", "방금 거 금액 5000원으로", "방금 기록 1000원으로 바꿔줘", "지출자 변경"]) {
    const result = await after(["점심 9000 저녁 12000", command]);
    eq(result.added, 2, `Q-50 ${path} ‘${command}’ 은 기록 수를 바꾸지 않는다`);
    ok(result.reply.includes("한 번에 저장한 기록이 2건") && result.reply.includes("아무것도 바꾸지 않았어요") && result.reply.includes("점심") && result.reply.includes("저녁"), `Q-50 ${path} ‘${command}’ 은 두 건을 보여 주고 번호를 묻는다`);
    ok(result.last.amount === 12000 || result.last.amount === 9000, `Q-50 ${path} ‘${command}’ 은 금액을 바꾸지 않는다`);
  }
  const single = await after(["점심 9000", "방금 삭제"]);
  eq(single.added, 0, `Q-50 ${path} 한 건 저장 뒤 ‘방금 삭제’ 는 그 기록을 지운다`);
}

// Q-49 되풀이 말이 처리를 멈추지 않는다. 지수 시간이면 ‘1번 ’ 28번에 4초를 넘고, 고친 뒤에는 수십 ms 다. 기준은 느린 러너를 생각해 넉넉히 둔다.
for (const [label, text] of [["번호 되풀이", "1번 ".repeat(28)], ["번호·쉼표", "1번, ".repeat(28)], ["단위 되풀이", `1${"만".repeat(30)}ㅋ`], ["띄운 단위", `1${" 만".repeat(30)}ㅋ`], ["번호 뒤 단위", `01번 1${"만".repeat(30)}으로ㅋ`]]) {
  await kakaoAfter(["오늘기록"]);
  const started = performance.now();
  await kakaoAfter([text]);
  ok(performance.now() - started < 3000, `Q-49 ${label} 이 처리를 멈추지 않는다`);
}

// Q-34 조사는 받침 규칙을 지킬 때만 뗀다.
for (const [text, memo] of [["01번 내용 종로 바꿔줘", "종로"], ["01번 내용 을지로 수정", "을지로"], ["01번 내용 세종대로 변경", "세종대로"], ["01번 내용 앞으로", "앞으로"], ["01번 내용 커피로 바꿔줘", "커피"], ["01번 내용 점심으로 바꿔줘", "점심"], ["01번 내용 밥으로", "밥"], ["01번 내용 세트1로", "세트1"]]) await edited(text, "memo", memo, "Q-34 내용");
await edited("01번 결제수단 현대카드 제로", "payment_method", "현대카드 제로", "Q-34 결제수단");
await edited("01번 결제수단 현대카드 제로로 바꿔줘", "payment_method", "현대카드 제로", "Q-34 결제수단");

// Q-35 끝 문장부호·전각 숫자
for (const text of ["방금 거 지워줘.", "방금 거 지워줘!!", "방금 거 삭제해줘ㅠㅠ", "1번 제거해주세요", "01번 삭제해 주세요", "01번을 삭제해줘", "1번 기록 삭제"]) {
  const result = await kakaoAfter([text]);
  eq(result.row, null, `Q-35 ‘${text}’ 은 기록을 지운다`);
}
eq((await kakaoAfter(["방금 삭제", "복구해줘."])).row?.amount, 4500, "Q-35 ‘복구해줘.’ 는 되살린다");
await edited("０１번 금액 １２．０００원", "amount", 12000, "Q-35 전각");
for (const text of ["방금 취소해줘", "방금 취소", "취소해줘", "취소할게"]) {
  const result = await kakaoAfter([text]);
  eq(result.row?.amount, 4500, `Q-35 ‘${text}’ 은 지우지 않는다`);
  ok(result.reply.includes("방금 삭제"), `Q-35 ‘${text}’ 에 지우는 말을 알린다`);
}
for (const text of ["01번 취소요", "01번 취소할게", "01번 취소해주세요"]) {
  const result = await kakaoAfter([text]);
  eq(result.row?.amount, 4500, `Q-35 ‘${text}’ 은 지우지 않는다`);
  ok(result.reply.includes("그대로예요"), `Q-35 ‘${text}’ 은 기록이 그대로라고 말한다`);
}

// Q-43 숫자로 끝난 값의 조사. Q-36 ‘으로’ 를 ‘원’ 으로 바꾸는 일은 금액 꼴에만 한다.
await edited("01번 날짜 7/3으로", "transaction_date", "2026-07-03", "Q-43 날짜");
await edited("01번 날짜 7.3으로 바꿔줘", "transaction_date", "2026-07-03", "Q-43 날짜");
await edited("01번 내용 세트3으로", "memo", "세트3", "Q-43 내용");
await answers(["수정 01번", "5", "7/3으로"], "Q-43", { transaction_date: "2026-07-03" });
await edited("01번 금액 5000원 부탁해", "amount", 5000, "Q-44");
await edited("01번 5000원으로 부탁해요", "amount", 5000, "Q-44");
// Q-45 기록을 짚은 말은 안내가 아니라 명령이다. 짚지 않은 말은 그대로 안내다.
for (const text of ["1번 기록 삭제", "01번 기록 삭제해줘", "최근 기록 삭제", "방금 기록 삭제", "마지막 기록 지워줘", "아까 기록 삭제"]) {
  for (const [path, run] of bothPaths) eq((await run([text])).row, null, `Q-45 ${path} ‘${text}’ 은 기록을 지운다`);
}
for (const text of ["1번 기록 수정", "01번 기록 수정해줘", "방금 기록 수정", "1번 거 수정"]) ok((await kakaoAfter([text])).reply.includes("무엇을 바꿀까요"), `Q-45 ‘${text}’ 은 메뉴를 연다`);
for (const text of ["1번 기록 금액 5000원", "1번 거 5000원", "01번 거 금액 5000원으로 바꿔줘", "수정 01번 기록 금액 5000"]) await edited(text, "amount", 5000, "Q-45");
for (const text of ["기록 수정", "어제 기록 삭제", "기록 삭제 방법", "거래 기록 삭제"]) {
  const result = await kakaoAfter([text]);
  eq(result.row?.amount, 4500, `Q-45 ‘${text}’ 은 기록을 바꾸지 않는다`);
  ok(/수정가이드|삭제 01번/.test(result.reply), `Q-45 ‘${text}’ 은 안내다`);
}
await recorded("1번 출구 택시 8000원", "Q-45");
await recorded("1번 기록실 5000원", "Q-45");

await edited("01번 7/3으로", "transaction_date", "2026-07-03", "Q-36 날짜");
await edited("01번 7.3으로", "transaction_date", "2026-07-03", "Q-36 날짜");
{
  const small = await kakaoAfter(["01번 2로 바꿔줘"]);
  eq(small.row?.amount, 4500, "Q-36 ‘2로’ 는 2원이 아니다");
}

// Q-37 세션의 취소 말과 다른 번호
for (const steps of [["수정 01번", "4", "취소할게"], ["수정 01번", "4", "1번 취소"], ["수정 01번", "1번 취소"], ["수정 01번", "4", "취소요"], ["수정 01번", "1", "그만할게"]]) {
  const result = await kakaoAfter(steps);
  eq(result.row?.memo, "커피", `Q-37 ${steps.join(" → ")} 은 값이 아니다`);
  ok(result.reply.includes("취소했어요"), `Q-37 ${steps.join(" → ")} 은 세션을 끝낸다`);
}
// Q-42 메뉴를 기다릴 때의 ‘02번’ 은 기록 번호다.
for (const text of ["02번 12000원으로 바꿔줘", "02번 금액 12000원", "02번 12000원"]) {
  for (const [path, run] of bothPaths) {
    const result = await run(["수정 01번", text]);
    eq(result.row?.amount, 4500, `Q-42 ${path} ‘${text}’ 이 01번을 바꾸지 않는다`);
    eq(result.added, 0, `Q-42 ${path} ‘${text}’ 은 새 기록이 아니다`);
    ok(result.reply.includes("지금은 01번 기록을 고치고 있어요"), `Q-42 ${path} ‘${text}’ 에 고치는 기록을 알린다`);
  }
}
for (const [steps, field, value] of [[["수정 01번", "1번 12000원"], "amount", 12000], [["수정 01번", "4번 점심으로 바꿔줘"], "memo", "점심"], [["수정 01번", "3번 현금으로"], "payment_method", "현금"]]) {
  eq((await kakaoAfter(steps)).row?.[field], value, `Q-42 메뉴 번호 ${steps.join(" → ")}`);
}
{
  const other = await kakaoAfter(["수정 01번", "4", "02번 점심"]);
  eq(other.row?.memo, "커피", "Q-37 다른 번호의 말은 내용이 아니다");
  ok(other.reply.includes("번호 없이"), "Q-37 다른 번호의 말은 값만 보내라고 알린다");
}

// Q-25 번호 없이 지우는 말, ‘취소’ 는 지우지 않는다
for (const text of ["방금 거 지워줘", "방금 거 삭제", "방금꺼 삭제", "마지막 거 삭제해줘", "아까 거 삭제", "아까꺼 지워줘", "최근 기록 삭제", "방금 기록 지워줘", "방금 삭제"]) {
  const result = await kakaoAfter([text]);
  eq(result.row, null, `Q-25 ‘${text}’ 은 방금 기록을 지운다`);
  ok(result.reply.includes("복구"), `Q-25 ‘${text}’ 답에 되돌리는 말이 있다`);
}
for (const steps of [["방금 거 지워줘", "복구"], ["방금 삭제", "복구해줘"], ["방금 삭제", "방금 거 복구"], ["방금 삭제", "되돌려줘"], ["01번 삭제", "01번 복구해줘"], ["01번 삭제", "복구 01번"]]) eq((await kakaoAfter(steps)).row?.amount, 4500, `Q-25 ‘${steps[1]}’ 은 지운 기록을 되살린다`);
for (const text of ["삭제 01", "삭제 1"]) eq((await kakaoAfter([text])).row, null, `Q-25 ‘${text}’ 은 번호를 지운다`);
{
  ok((await kakaoAfter(["수정 01"])).reply.includes("무엇을 바꿀까요"), "Q-25 ‘수정 01’ 은 번호의 메뉴를 연다");
  eq((await kakaoAfter(["수정 01 금액 5000"])).row?.amount, 5000, "Q-25 ‘수정 01 금액 5000’ 은 번호를 고친다");
  for (const text of ["수정 1만원", "삭제 1만원"]) eq((await kakaoAfter([text])).row?.amount, 4500, `Q-25 ‘${text}’ 의 숫자는 기록 번호가 아니다`);
  for (const text of ["예산 삭제", "식비 예산 삭제", "가계부 삭제", "단톡방 연결 삭제"]) ok(!(await kakaoAfter([text])).reply.includes("수정 01번 금액 5000"), `Q-24 ‘${text}’ 은 기록 고치는 법을 안내하지 않는다`);
}
for (const text of ["방금 거 취소", "방금 건 취소", "방금 입력 취소", "아까 거 취소", "잘못 입력했어"]) {
  const result = await kakaoAfter([text]);
  eq(result.row?.amount, 4500, `Q-25 ‘${text}’ 은 지우지 않는다`);
  ok(result.reply.includes("방금 삭제"), `Q-25 ‘${text}’ 에 지우는 말을 알린다`);
}
{
  const cancel = await kakaoAfter(["1번 취소"]);
  eq(cancel.row?.amount, 4500, "Q-25 ‘1번 취소’ 는 지우지 않는다");
  ok(cancel.reply.includes("그대로예요") && cancel.reply.includes("삭제 01번"), "Q-25 ‘1번 취소’ 는 기록이 그대로라고 말한다");
  ok((await kakaoAfter(["수정할래"])).reply.includes("수정가이드"), "Q-25 ‘수정할래’ 는 고치는 법을 알린다");
  const question = await kakaoAfter(["아까 내용 뭐였지"]);
  eq(question.row?.memo, "커피", "Q-25 ‘아까’ 의 물음이 내용을 바꾸지 않는다");
  eq(question.added, 0, "Q-25 ‘아까’ 의 물음은 기록이 아니다");
  // 수정 세션이 끝난 뒤 온 금액 답도 새 기록이 아니다(Q-30).
  const expired = await withClock("2026-07-15", () => fixture(async (fx) => {
    fx.env.SKILL_RATE_LIMIT = "10000";
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    await skill(fx, "오늘기록");
    await skill(fx, "2");
    await skill(fx, "커피 4500");
    await skill(fx, "수정 01번");
    await skill(fx, "1");
    const count = fx.db.transactions.length;
    const row = fx.db.accountbook_settings?.find((item) => String(item.key || "").includes("edit"));
    if (row) { const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value; value.updatedAt = Date.now() - 6 * 60 * 1000; row.value = typeof row.value === "string" ? JSON.stringify(value) : value; }
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    const reply = JSON.stringify(await skill(fx, "5000원으로"));
    return { added: fx.db.transactions.length - count, reply, found: !!row };
  }));
  ok(expired.found, "Q-30 수정 세션을 찾아 시간을 되돌렸다");
  eq(expired.added, 0, "Q-30 끝난 세션의 ‘5000원으로’ 는 새 기록이 아니다");
  ok(expired.reply.includes("수정 시간이 지나"), "Q-30 끝난 세션의 금액 답에 끝났다고 알린다");
  const viewer = await kakaoAfter(["최근 기록 삭제"], { role: "viewer" });
  eq(viewer.row?.amount, 4500, "Q-25 조회 전용은 ‘최근 기록 삭제’ 로 지우지 못한다");
  eq((await kakaoAfter(["커피 5000원으로 바꿔줘"], { role: "viewer" })).added, 0, "Q-24 조회 전용의 고치는 말도 저장되지 않는다");
}

if (failures.length) {
  console.error(failures.slice(0, 60).join("\n"));
  console.error(`V22.9.93 출시 전 수정 검사 실패 ${failures.length}건 / ${checks}`);
  process.exit(1);
}
console.log(`V22.9.93 출시 전 수정 검사 통과 (${checks} checks)`);
