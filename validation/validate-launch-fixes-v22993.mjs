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
//  12. 추가 검토의 정답 비교(문장 4만 건): Q-52 앞 낱말의 글자를 수로 읽어 금액이 틀림(‘구두 만원’ 92만·‘이사 백만원’ 2,400만·‘월세 백만원’ 300만·‘명품 백 300만원’ 두 건·‘택시 만5천원’ 5천·‘치킨 3만5’ 30,005·‘7.3 천원’ 7,300),
//      Q-53 한 줄로 이어 쓴 번호 목록(‘1. 김밥 1만 2. 떡볶이 4천원’ 이 10,002원), Q-54 목록 표식 뒤·문장 가운데의 띄어 쓴 날짜가 금액 세 건, Q-55 ‘25년 12월 25일’ 이 올해로 저장되고 메모에 ‘25년’ 이 남음,
//      Q-56 여러 건의 머리 날짜: 앞 조각의 소수가 날짜가 되고(‘1.5L 콜라 2000, 커피 3000’ 의 커피가 1월 5일), 뒤 조각의 소수가 제 날짜로 보이고(‘어제 커피 4000, 택시 1.5만원’ 의 택시가 오늘), 점 날짜가 뒤 금액과 이어짐(‘7.3 커피 4000, 만원 점심’ 의 점심이 73,000원).
//      Q-57 여러 줄·쉼표로 보낸 말 중 금액을 못 읽은 조각이 말없이 빠짐(저장 답에 적는다). Q-58 날짜 뒤에 띄어 쓴 단위, Q-59 세미콜론과 금액 조각.
//  13. 독립 코드 검토(a3f64fd 기준, 후보 32건 + 마지막 점검 5건): Q-60 뜻 없이 지워지거나 덮어써짐(‘1번 기록 삭제 안돼요’·‘세제 8000’·‘7번 금액 5000’·‘아니 삭제하지 마’),
//      Q-61 세션의 띄어 쓴 금액(‘2만 5천원으로 바꿔줘’ 가 5,000원), Q-62 명령 둘·작은 수·다른 이름(‘01번 세트 2로 바꿔줘’ 가 2원), Q-63 금액 둘(‘01번 금액 5000, 3000’ 이 50,003,000원),
//      Q-64 세션 값의 문장부호(‘H&M’·‘19:30 영화’·‘지훈(아빠)’), Q-65 목록 표식과 날짜(‘1. 12.500원 점심’), Q-66 수량이 값이 됨(‘우유 1000미리 2800’), Q-67 기간·번호가 날짜(‘구독 30일에 9900원’),
//      Q-68 이름을 저장 거부(‘메모 패드 3000원’), 소수 수량(‘치킨 1.5마리’), Q-69 끝맺음·명사(‘방금 13000원으로 좀 바꿔줘’·‘1번 건 금액 5000원’), Q-70 메모 잘림(‘맥북프로’·‘이름 없는 식당’),
//      Q-78~Q-88 독립 검토 2회차: 어치·짜리 금액, ‘수정 1번 커피 5000원’, ‘4500원 말고 5000원’, 금액 뒤 끝맺음, ‘천 500원’, ‘결제 카드로’, 고치는 말의 다른 꼴, 쉼표 뒤 날짜, 기간·수량, 합계 끝말, ‘라떼로 변경’.
//      Q-96~Q-105 독립 검토 6회차: 수량 표, 낱말 뒤 수, 단위 + 숫자 + 단위, 표 낱말 앞 수, 날짜 뒤 ‘원’, 말끝 부호, 은·는, 기간 말, 어치, 낱말 속 ‘원’, 날짜 줄, 값만 말하는 고침.
//      Q-106~Q-113 독립 검토 7회차: 날 말 조사(앞 날 말·금액 뒤 설명·비교 말·내일·달 날짜), 여러 줄의 ‘N일’·맨 숫자 줄, 점 수 뒤 ‘원…’, 표 낱말 앞 번호, 붙여 쓴 번호, ‘만1세’, 못 읽은 말 안내.
//      Q-89~Q-93 독립 검토 3·4·5회차: 수량 ‘천 장’, ‘택시 3만이’, 붙여 쓴 가격은 일상 품목만, 숫자 앞 부호, 앞 금액이 조용히 사라지거나 틀리는 꼴. 원 없는 금액의 끝맺음은 운영처럼 다시 묻는다.
//      Q-71 가져오기 날짜, Q-72 첫 기록 점 금액·웹 목록 표식·‘1번 취소해요’, Q-73 ‘방금 거래 수정’ 의 ‘래’, 내용 값 ‘서류 확인’·‘7번 버스’, 조회 전용 안내, ‘10000짜리’, 분류 오탐.
// 모두 메모리 픽스처(DB·서버 없음)에서 실제 경로를 돌린다. 브라우저 쪽은 내려가는 자산에서 함수를 꺼내 서버와 같은 답인지 본다.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parseExpressionAt } from "../tools/vendor/acorn.mjs";
import { api, app, BASE, ctx, fixture, intercept, failure, page, post, putSetting, skill, withClock } from "./lib-audit-v22934.mjs";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { parseDirectBudgetSetCommand, parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { parseAmountValue } from "../src/modules/nlu/amount-parser.js";
import { parseFlexibleImportRecords } from "../src/modules/import/flexible-import-parser.js";
import { isKakaoFirstRecordInput, isStrongKakaoTransactionInput } from "../src/modules/kakao/request-guards.js";

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
  ["어제 점심에 12000 썼어", "2026-07-14", 12000, "점심에"],
  ["그제는 택시 8000", "2026-07-13", 8000, "택시"],
  ["그저께는 술값 50000", "2026-07-13", 50000, "술값"],
  ["그저께에 택시 8000", "2026-07-13", 8000, "택시"],
  ["내일 회비 30000", "2026-07-16", 30000, "회비"],
  ["내일모레 회비 30000", "2026-07-15", 30000, "내일모레 회비"],
  ["내일 모레 회비 30000", "2026-07-16", 30000, "회비"],
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
  ["7/3에 커피 4000", "2026-07-03", "커피"], ["7.13에 커피 4000", "2026-07-13", "커피"], ["07.3에 택시 8000", "2026-07-03", "택시"],
  // 문장 끝의 날짜 말, 붙여 쓴 말
  ["커피 4000 내일모레", TODAY, "커피 내일모레"], ["내일모레 커피 4000", TODAY, "내일모레 커피"],
  ["어제회사 점심 9000", TODAY, "어제회사 점심"], ["어제회비 30000", "2026-07-14", "회비"], ["어제날짜로 커피 4500", TODAY, "어제날짜로 커피"], ["어제날씨 추워서 핫팩 3000", TODAY, "어제날씨 추워서 핫팩"],
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
const kakaoAfter = (texts, { role = "", first = "커피 4500", seed = [] } = {}) => withClock("2026-07-15", () => fixture(async (fx) => {
  fx.env.SKILL_RATE_LIMIT = "10000";
  globalThis.__AB_SKILL_RATE_BUCKETS?.clear();
  globalThis.__AB_TRAFFIC_BUCKETS?.clear();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
  globalThis.__AB_KAKAO_INFLIGHT?.clear();
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  await skill(fx, first);
  const before = { ...fx.db.transactions.at(-1) };
  for (const text of seed) await skill(fx, text);
  const count = fx.db.transactions.length;
  if (role) fx.db.household_members.find((row) => row.household_id === HH && row.role === "owner").role = role;
  let reply = "";
  for (const text of texts) reply = JSON.stringify(await skill(fx, text));
  return { added: fx.db.transactions.length - count, row: fx.db.transactions.find((item) => item.id === before.id) || null, before, last: fx.db.transactions.at(-1), rows: fx.db.transactions, reply };
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
const roomAfter = (texts, { role = "", first = "커피 4500", seed = [] } = {}) => withClock("2026-07-15", async () => {
  const fx = await createV2265QaFixture();
  const saved = globalThis.fetch;
  try {
    fx.env.SKILL_RATE_LIMIT = "10000";
    fx.env.KAKAO_SKILL_SECRET = "validate-v22993-secret";
    globalThis.__AB_SKILL_RATE_BUCKETS?.clear();
    globalThis.__AB_TRAFFIC_BUCKETS?.clear();
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    await roomSkill(fx, first);
    const before = { ...fx.db.transactions.at(-1) };
    for (const text of seed) await roomSkill(fx, text);
    const count = fx.db.transactions.length;
    if (role) fx.db.household_members.find((row) => row.household_id === before.household_id).role = role;
    let reply = "";
    for (const text of texts) {
      globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
      globalThis.__AB_KAKAO_INFLIGHT?.clear();
      reply = await roomSkill(fx, text);
    }
    return { added: fx.db.transactions.length - count, row: fx.db.transactions.find((item) => item.id === before.id) || null, before, last: fx.db.transactions.at(-1), rows: fx.db.transactions, reply };
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

// Q-105 값만 말하는 고침: 표에 없는 카드 낱말, 단위 글자 하나, 금액이 둘로 읽히는 값은 바로 고치지 않는다. 고치는 다른 꼴은 새 기록이 아니다.
for (const [path, run] of bothPaths) {
  for (const text of ["방금 거 포토카드로", "방금 거 생일카드로", "방금 거 선물카드로", "방금 거 백으로", "방금 거 천으로", "01번 금액 만 5000", "01번 금액 이만 5000원", "01번 금액 오천 300", "01번 금액 3만원 5천원", "방금 금액 만 5000", "01번 이만 5000원으로 바꿔줘"]) {
    const result = await run([text]);
    eq(result.added, 0, `Q-105 ${path} ‘${text}’ 은 새 기록이 아니다`);
    eq(result.row?.amount, 4500, `Q-105 ${path} ‘${text}’ 은 금액을 바꾸지 않는다`);
    ok(!result.row?.payment_method, `Q-105 ${path} ‘${text}’ 은 결제수단을 바꾸지 않는다`);
  }
  for (const [text, method] of [["방금 거 신한카드로", "신한카드"], ["방금 거 현대카드로", "현대카드"], ["방금 거 카카오페이로", "카카오페이"], ["방금 거 체크카드로", "체크카드"], ["방금 거 현금으로", "현금"]]) eq((await run([text])).row?.payment_method, method, `Q-105 ${path} ‘${text}’`);
  for (const [text, amount] of [["01번 금액 1만 5천원", 15000], ["01번 금액 15000", 15000], ["01번 2만 5천원으로 바꿔줘", 25000]]) eq((await run([text])).row?.amount, amount, `Q-105 ${path} ‘${text}’`);
  for (const text of ["5000원으로 다시 적어줘", "5000원으로 다시", "5000원으로 다시 입력해 주세요", "5000원으로 좀 부탁", "금액 잘못 넣었어 5000원", "방금 거 만 5000으로"]) {
    const result = await run([text]);
    eq(result.added, 0, `Q-105 ${path} ‘${text}’ 은 새 기록이 아니다`);
    eq(result.row?.amount, 4500, `Q-105 ${path} ‘${text}’ 은 기록을 그대로 둔다`);
  }
}

// Q-95 수정 답 판정이 조사를 뗄 때마다 자기를 다시 부르면 긴 말에서 스택이 넘쳤다.
{
  const { parseEditInput } = await import("../src/modules/kakao/edit-state-machine.js");
  for (const unit of ["로 ", "으로 ", "결제 ", "결제 로 "]) ok(parseEditInput(unit.repeat(8000)) !== undefined, `Q-95 ${JSON.stringify(unit)} 되풀이가 끝난다`);
  eq(parseEditInput("결제 현금으로")?.field, "method", "Q-95 ‘결제 현금으로’ 는 그대로 결제수단이다");
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

// ── Q-52 앞 낱말의 글자를 수로 읽어 금액이 조용히 틀림(‘구두 만원’ 92만, ‘이사 백만원’ 2,400만) ─────────────
const wordAmountCases = [
  ["월세 만원", 10000, "월세"], ["월세 백만원", 1000000, "월세"], ["월세 십만원", 100000, "월세"], ["월세 오십만원", 500000, "월세"], ["월세 백 만 원", 1000000, "월세"], ["전세 천만원", 10000000, "전세"],
  ["식사 만원", 10000, "식사"], ["점심 식사 만원", 10000, "점심 식사"], ["식사 만 원", 10000, "식사"], ["감사 만원", 10000, "감사"], ["복사 천원", 1000, "복사"], ["복사 백원", 100, "복사"], ["조사 천원", 1000, "조사"], ["공사 만원", 10000, "공사"], ["이사 백만원", 1000000, "이사"], ["수리 공사 백만원", 1000000, "수리 공사"],
  ["친구 만원", 10000, "친구"], ["친구 천원", 1000, "친구"], ["축구 만원", 10000, "축구"], ["가구 백만원", 1000000, "가구"], ["문구 천원", 1000, "문구"], ["인터넷 만원", 10000, "인터넷"], ["홍삼 만원", 10000, "홍삼"], ["인삼 천원", 1000, "인삼"], ["교육 만원", 10000, "교육"], ["제육 만원", 10000, "제육"], ["수육 만원", 10000, "수육"], ["수영 만원", 10000, "수영"], ["라디오 만원", 10000, "라디오"], ["부가세 만원", 10000, "부가세"], ["재산세 백만원", 1000000, "재산세"], ["자동차세 십만원", 100000, "자동차세"],
  ["구두 만원", 10000, "구두"], ["오이 천원", 1000, "오이"], ["오이 백원", 100, "오이"], ["호두 천원", 1000, "호두"], ["만두 천원", 1000, "만두"], ["만두 만원", 10000, "만두"], ["만두 백원", 100, "만두"], ["사이 천원", 1000, "사이"], ["나사 만원", 10000, "나사"], ["나이 천원", 1000, "나이"], ["종이 천원", 1000, "종이"], ["놀이 천원", 1000, "놀이"], ["길이 만원", 10000, "길이"], ["우리 아이 만원", 10000, "우리 아이"], ["생일 만원", 10000, "생일"], ["과일 천원", 1000, "과일"], ["천사 만원", 10000, "천사"], ["백일 만원", 10000, "백일"],
  // 수로 남아야 하는 꼴
  ["이 만원", 20000, "기타지출"], ["삼 만원", 30000, "기타지출"], ["세 만원", 30000, "기타지출"], ["이십 만원", 200000, "기타지출"], ["이십오 만원", 250000, "기타지출"], ["오백 만원", 5000000, "기타지출"], ["오백오십 만원", 5500000, "기타지출"], ["삼천 만원", 30000000, "기타지출"], ["천 만원", 10000000, "기타지출"], ["백 만원", 1000000, "기타지출"], ["십 만원", 100000, "기타지출"], ["다섯 만원", 50000, "기타지출"], ["일곱 천원", 7000, "기타지출"], ["여섯 천원", 6000, "기타지출"], ["하나 만원", 10000, "기타지출"],
  ["커피 이 천원", 2000, "커피"], ["택시 오 천원", 5000, "택시"], ["커피오천원", 5000, "커피"], ["택시오천원", 5000, "택시"], ["김밥삼천원", 3000, "김밥"], ["저녁식사 이만원", 20000, "저녁식사"], ["식사이만원", 20000, "식사"], ["만두 오천원", 5000, "만두"], ["인터넷 삼만원", 30000, "인터넷"], ["커피 두 잔 만원", 10000, "커피 두 잔"], ["맥주 세 병 만원", 10000, "맥주 세 병"], ["사과 다섯 개 만원", 10000, "사과 다섯 개"], ["치과 이만원", 20000, "치과"], ["회사 회식 만원", 10000, "회사 회식"], ["생일 선물 만원", 10000, "생일 선물"], ["오일 교환 만원", 10000, "오일 교환"],
  // ‘백’(가방)·‘천’(옷감) 뒤에 값이 오면 낱말이다.
  ["에코 백 3만원", 30000, "에코 백"], ["명품 백 300만원", 3000000, "명품 백"], ["가방 백 30만원", 300000, "가방 백"], ["구두 백 3만원", 30000, "구두 백"], ["가방 백 오만원", 50000, "가방 백"], ["이불 천 3만원", 30000, "이불 천"], ["이불 천 5000원", 5000, "이불 천"],
  // 금액을 앞에 쓴 말. 뒷말의 글자를 금액에 잇지 않는다(‘5만 오이’ 50,052원). 단위가 있으면 수다.
  ["5만 오이", 50000, "오이"], ["3만 이사", 30000, "이사"], ["1만 공사", 10000, "공사"], ["5천 오이", 5000, "오이"], ["2만5천 공사", 25000, "공사"], ["5만 오이지", 50000, "오이지"], ["5만 구두", 50000, "구두"], ["3만 오천원", 35000, "기타지출"], ["5만 삼천", 53000, "기타지출"], ["3만 이백원", 30200, "기타지출"], ["오십 오만 오천원", 555000, "기타지출"],
  // 단위 뒤에 숫자가 바로 오는 꼴, 줄여 쓴 꼴
  ["택시 만5천원", 15000, "택시"], ["버스 천5백원", 1500, "버스"], ["만5천원", 15000, "기타지출"], ["택시 십5만원", 150000, "택시"], ["택시 2만5천원", 25000, "택시"], ["치킨 3만5", 35000, "치킨"], ["치킨 2만5", 25000, "치킨"], ["치킨 1만2", 12000, "치킨"], ["커피 5천5", 5500, "커피"], ["월세 50만5", 505000, "월세"], ["치킨 3만 5", 35000, "치킨"], ["치킨 3만5원", 30005, "치킨"],
  // 날짜 뒤에 띄어 쓴 단위. 소수는 그대로다.
  ["7. 3. 만원 주유", 10000, "주유"], ["7/3 만원 커피", 10000, "커피"], ["2026.10.31 만원 커피", 10000, "커피"], ["택시 1.5 만원", 15000, "택시"], ["1.5 만원 택시", 15000, "택시"], ["택시 1.5만원", 15000, "택시"], ["택시 2.5천원", 2500, "택시"], ["10.31만원 커피", 103100, "커피"],
  // 달력에 없는 수는 소수다.
  ["2.55 만원 커피", 25500, "커피"], ["0.5 천원 커피", 500, "커피"], ["13.5 천원 커피", 13500, "커피"], ["25.5 천원 커피", 25500, "커피"], ["1.50 만원 커피", 15000, "커피"],
];
const wordPayCases = [["카카오페이 천원", 1000, "카카오페이"], ["네이버페이 만원", 10000, "네이버페이"], ["삼성페이 만원", 10000, "삼성페이"], ["커피 카카오페이 천원", 1000, "카카오페이"], ["마트 5만 삼성카드", 50000, "삼성카드"], ["3일 마트 1억 삼성카드", 100000000, "삼성카드"], ["택시 5천 삼성카드", 5000, "삼성카드"]];
const wordRefused = ["월세만원", "월세백만원", "식사만원", "친구만원", "카카오페이천원", "구두만원", "오이천원", "이사백만원", "삼사만원", "이삼천원", "이삼 만원", "사오 만원", "오육천원",
  // 점 숫자가 달력에 있으면 날짜와 소수가 갈린다. 예전에는 소수로만 읽어 ‘10.31 만원 커피’ 가 103,100원이었다. 고칠 때 날짜로만 읽으니 ‘1.25 만원’ 이 1만 원이 돼 둘 다 짐작하지 않는다.
  "10.31 만원 커피", "7.3 천원 다이소", "1.5 천원 커피", "1.25 만원 커피", "12.25 만원 커피", "2.5 백만원 대출",
  // 하이픈은 범위이기도 하다.
  "3-4 만원 커피", "7-3 만원 커피"];
const clauseCases = [
  // Q-53 한 줄로 이어 쓴 번호 목록. Q-52 금액 묶음이 날짜·시각에 겹쳐도 금액은 남는다.
  ["1. 김밥 1만 2. 떡볶이 4천원", [[10000, "김밥"], [4000, "떡볶이"]]], ["1. 김밥 5천 2. 떡볶이 4천", [[5000, "김밥"], [4000, "떡볶이"]]], ["1. 김밥 10000 2. 떡볶이 4000", [[10000, "김밥"], [4000, "떡볶이"]]], ["1. 김밥 1만원 2. 떡볶이 4천원", [[10000, "김밥"], [4000, "떡볶이"]]],
  ["1) 김밥 1만 2) 떡볶이 4천원", [[10000, "김밥"], [4000, "떡볶이"]]], ["1) 김밥 3200원 2) 떡볶이 4000원 3) 순대 5000원", [[3200, "김밥"], [4000, "떡볶이"], [5000, "순대"]]],
  ["식사 12000; 천 원 커튼", [[12000, "식사"], [1000, "커튼"]]], ["식사 12.000; 천 원 커튼", [[12000, "식사"], [1000, "커튼"]]], ["커피 4000; 택시 8000", [[4000, "커피"], [8000, "택시"]]], ["커피 4000；택시 8000", [[4000, "커피"], [8000, "택시"]]],
  // 부호 뒤의 글자는 낱말이다. 금액 앞의 부호는 전과 같이 막는다.
  ["커피 4000 + 구두 5만원", [[4000, "커피"], [50000, "구두"]]], ["커피 4000 + 만두 3000", [[4000, "커피"], [3000, "만두"]]], ["커피 4000 + 백화점 3000", [[4000, "커피"], [3000, "백화점"]]], ["커피 4000 + 오이 2000", [[4000, "커피"], [2000, "오이"]]],
  // 쉼표에 붙은 점 자릿수
  ["이십 만원,12.000원 떡볶이", [[200000, "기타지출"], [12000, "떡볶이"]]], ["제육 만 원,12.000 감사 선물", [[10000, "제육"], [12000, "감사 선물"]]], ["백화점 12.000,S24 케이스 4000", [[12000, "백화점"], [4000, "S24 케이스"]]],
  ["마트 2만 7월 3일 점심 5000", [[20000, "마트"], [5000, "점심"]]], ["2만 3시 영화", [[20000, "3시 영화"]]], ["5만 1번 버스", [[50000, "1번 버스"]]], ["김밥 12.000,떡볶이 4000", [[12000, "김밥"], [4000, "떡볶이"]]],
];
const dateClauseCases = [
  // Q-54 목록 표식 뒤·문장 가운데의 띄어 쓴 날짜
  ["- 26. 10. 31 커피 4000", [[4000, "커피", "2026-10-31"]]], ["- 25. 12. 25 커피 4000", [[4000, "커피", "2025-12-25"]]], ["1) 26. 7. 3 커피 4000", [[4000, "커피", "2026-07-03"]]], ["1) 25. 12. 25 커피 4000", [[4000, "커피", "2025-12-25"]]], ["- 2026. 7. 3 커피 4000", [[4000, "커피", "2026-07-03"]]], ["- 2025. 12. 25 커피 4000", [[4000, "커피", "2025-12-25"]]], ["- 7. 3 커피 4000", [[4000, "커피", "2026-07-03"]]],
  ["커피 4000, 25. 12. 25 점심 9000", [[4000, "커피", "2026-07-15"], [9000, "점심", "2025-12-25"]]], ["커피 4000,25. 12. 25 점심 9000", [[4000, "커피", "2026-07-15"], [9000, "점심", "2025-12-25"]]], ["오늘 커피 4000\n25. 12. 25 점심 9000", [[4000, "커피", "2026-07-15"], [9000, "점심", "2025-12-25"]]], ["26. 7. 3 커피 4000 그리고 26. 7. 4 점심 9000", [[4000, "커피", "2026-07-03"], [9000, "점심", "2026-07-04"]]],
  ["7/3 만원 커피", [[10000, "커피", "2026-07-03"]]], ["6/3 천원 다이소", [[1000, "다이소", "2026-06-03"]]],
  // 날짜 뒤에 띄어 쓴 단위. 달을 잃으면 ‘3일’ 만 읽어 이번 달이 된다(오늘은 7월이므로 6월로 시험한다).
  ["6월 3일 만원 커피", [[10000, "커피", "2026-06-03"]]], ["6월 3일 천원 커피", [[1000, "커피", "2026-06-03"]]], ["6월 3일 백만원 월세", [[1000000, "월세", "2026-06-03"]]], ["6월 3일 오만원 저녁", [[50000, "저녁", "2026-06-03"]]], ["6월3일 만원 커피", [[10000, "커피", "2026-06-03"]]], ["6월3일 천원 커피", [[1000, "커피", "2026-06-03"]]], ["6월 3일에 만원 커피", []], ["2026년 6월 3일 만원 커피", [[10000, "커피", "2026-06-03"]]], ["2026-06-03 만원 커피", [[10000, "커피", "2026-06-03"]]], ["지난달 3일 만원 커피", [[10000, "커피", "2026-06-03"]]],
  // ‘₩’ 은 입구에서 ‘원’ 이 된다.
  ["6. 3 ₩4000 과일", [[4000, "3 과일", TODAY]]], ["2.28 ₩4000 저녁 식사", [[4000, "저녁 식사", "2026-02-28"]]], ["6월 3일 ₩4000 커피", [[4000, "커피", "2026-06-03"]]], ["7/3 ₩4000 커피", [[4000, "커피", "2026-07-03"]]],
  // 쉼표·슬래시 뒤의 띄어 쓴 날짜
  ["커피 1500원, 12. 25 점심 4천원", [[1500, "커피", "2026-07-15"], [4000, "점심", "2026-12-25"]]], ["커피 1500원 / 12. 25 점심 4천원", [[1500, "커피", "2026-07-15"], [4000, "점심", "2026-12-25"]]], ["커피 1500원 / 6. 3. 점심 4천원", [[1500, "커피", "2026-07-15"], [4000, "점심", "2026-06-03"]]],
  // Q-56 머리 날짜는 뒤 조각의 금액과 잇지 않고, 소수는 머리 날짜도 조각의 제 날짜도 아니다.
  ["1.5L 콜라 2000, 커피 3000", [[2000, "1.5L 콜라", "2026-07-15"], [3000, "커피", "2026-07-15"]]], ["1.5리터 물 3000, 커피 4000", [[3000, "1.5리터 물", "2026-07-15"], [4000, "커피", "2026-07-15"]]], ["0.5kg 고기 12000, 만 원 이모", [[12000, "0.5kg 고기", "2026-07-15"], [10000, "이모", "2026-07-15"]]], ["1.5L 콜라 2000, 만원 커피", [[2000, "1.5L 콜라", "2026-07-15"], [10000, "커피", "2026-07-15"]]], ["2.5cm 나사 3000, 커피 4000", [[3000, "2.5cm 나사", "2026-07-15"], [4000, "커피", "2026-07-15"]]],
  ["7.3 커피 4000, 만원 점심", [[4000, "커피", "2026-07-03"], [10000, "점심", "2026-07-03"]]], ["7.3 커피 4000, 천원 점심", [[4000, "커피", "2026-07-03"], [1000, "점심", "2026-07-03"]]], ["7/3 커피 4000, 만원 점심", [[4000, "커피", "2026-07-03"], [10000, "점심", "2026-07-03"]]], ["7.3 커피 4000 그리고 만원 점심", [[4000, "커피", "2026-07-03"], [10000, "점심", "2026-07-03"]]], ["6월 3일 커피 4000, 만원 점심", [[4000, "커피", "2026-06-03"], [10000, "점심", "2026-06-03"]]], ["작년 7.3 커피 4000, 만원 점심", [[4000, "커피", "2025-07-03"], [10000, "점심", "2025-07-03"]]],
  ["어제 커피 4000, 택시 1.5만원", [[4000, "커피", "2026-07-14"], [15000, "택시", "2026-07-14"]]], ["어제 커피 4000, 택시 1.5 만원", [[4000, "커피", "2026-07-14"], [15000, "택시", "2026-07-14"]]], ["어제 커피 4000 택시 1.5만원", [[4000, "커피", "2026-07-14"], [15000, "택시", "2026-07-14"]]], ["어제 커피 4000, 콜라 1.5L 2000", [[4000, "커피", "2026-07-14"], [2000, "콜라 1.5L", "2026-07-14"]]], ["어제 커피 4000, 나사 2.5cm 3000", [[4000, "커피", "2026-07-14"], [3000, "나사 2.5cm", "2026-07-14"]]], ["지난주 금요일 커피 4000, 택시 1.5만원", [[4000, "커피", "2026-07-10"], [15000, "택시", "2026-07-10"]]], ["7월 3일 커피 4000\n택시 1.2만원", [[4000, "커피", "2026-07-03"], [12000, "택시", "2026-07-03"]]],
  // 머리 날짜 뒤의 문장부호
  ["7/3, 커피 4000, 택시 3000", [[4000, "커피", "2026-07-03"], [3000, "택시", "2026-07-03"]]], ["7.3. 커피 4000, 택시 3000", [[4000, "커피", "2026-07-03"], [3000, "택시", "2026-07-03"]]], ["7/3. 커피 4000, 택시 3000", [[4000, "커피", "2026-07-03"], [3000, "택시", "2026-07-03"]]],
  // 조각이 제 날짜를 가지면 머리 날짜를 물려받지 않는다.
  ["어제 커피 4000, 7/3 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", "2026-07-03"]]], ["어제 커피 4000, 7.3 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", "2026-07-03"]]], ["어제 커피 4000, 7/3 만원 택시", [[4000, "커피", "2026-07-14"], [10000, "택시", "2026-07-03"]]],
  // 뒷말이 단위 글자로 시작할 뿐이면 날짜다.
  ["7.3 백화점 5만원", [[50000, "백화점", "2026-07-03"]]], ["7.3 만두 5000", [[5000, "만두", "2026-07-03"]]], ["10.31 천안 기차 3만원", [[30000, "천안 기차", "2026-10-31"]]], ["12.25 백화점 5만원", [[50000, "백화점", "2026-12-25"]]], ["7/3 백화점 5만원", [[50000, "백화점", "2026-07-03"]]], ["6월 3일 백화점 5만원", [[50000, "백화점", "2026-06-03"]]], ["1.5 만화책 3000", [[3000, "만화책", "2026-01-05"]]],
  ["커피 4000,25.11.3 점심 5000", [[4000, "커피", "2026-07-15"], [5000, "점심", "2025-11-03"]]], ["커피 4000,26.10.31 점심 5000", [[4000, "커피", "2026-07-15"], [5000, "점심", "2026-10-31"]]],
  // 금액이 한 조각에만 있으면 세미콜론은 한 건 안의 구분이다.
  ["날짜=2026-06-02; 금액=12000; 메모=점심; 결제수단=국민카드", [[12000, "날짜 금액 메모 점심 결제수단", "2026-06-02"]]], ["2026-06-02;4500;스타벅스;인터넷", [[4500, "스타벅스 인터넷", "2026-06-02"]]], ["커피 4000;", [[4000, "커피", "2026-07-15"]]],
  // Q-55 두 자리 연도
  ["25년 12월 25일 커피 5000", [[5000, "커피", "2025-12-25"]]], ["25년 6월 3일 만원 커피", [[10000, "커피", "2025-06-03"]]], ["26년 6월 3일 만원 커피", [[10000, "커피", "2026-06-03"]]], ["25년 12월 25일에 커피 5000", [[5000, "커피", "2025-12-25"]]], ["커피 4000, 25년 12월 25일 점심 9000", [[4000, "커피", "2026-07-15"], [9000, "점심", "2025-12-25"]]], ["커피 4000,25년 12월 25일 점심 9000", [[4000, "커피", "2026-07-15"], [9000, "점심", "2025-12-25"]]],
];
await withClock("2026-07-15", () => {
  for (const [text, amount, memo] of wordAmountCases) {
    const row = only(text);
    eq(row.amount, amount, `Q-52 ‘${text}’ 의 금액`);
    eq(row.memo, memo, `Q-52 ‘${text}’ 의 내용`);
  }
  for (const [text, amount, pay] of wordPayCases) {
    const row = only(text);
    eq(row.amount, amount, `Q-52 ‘${text}’ 의 금액`);
    eq(row.payment_method, pay, `Q-52 ‘${text}’ 의 결제수단`);
  }
  for (const text of wordRefused) eq(rowsOf(text).length, 0, `Q-52 뜻이 갈리는 ‘${text}’ 는 금액을 짐작해 저장하지 않는다`);
  for (const [text, rows] of clauseCases) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo])), JSON.stringify(rows), `Q-52·53 ‘${text}’`);
  for (const text of ["택시 - 8000원", "택시 -8000원", "-5000 커피", "커피 4000원 +500원", "택시 -천원"]) eq(rowsOf(text).length, 0, `Q-52 금액 앞에 부호가 있는 ‘${text}’ 는 저장하지 않는다`);
  for (const text of ["2/31 만원 커피", "13/3 만원 커피", "6월 3 만원", "6월 3 천원 커피", "2월 31일 만원 커피"]) eq(rowsOf(text).length, 0, `Q-52 ‘${text}’ 는 없는 날짜이거나 뜻이 갈려 저장하지 않는다`);
  for (const [text, rows] of dateClauseCases) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo, row.transaction_date])), JSON.stringify(rows), `Q-54 ‘${text}’`);
});
const { moneyTokenSpans, quickInputDate } = await import("../src/modules/client/shared-input-parsers.js");
const amountSentences = [...wordAmountCases.map((item) => item[0]), ...wordPayCases.map((item) => item[0]), ...wordRefused, ...clauseCases.map((item) => item[0]), ...dateClauseCases.map((item) => item[0])];
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js", "/assets/accountbook-budget-preview-v22993.js"]) {
  const code = fromAsset(await assetText(path), "moneyTokenSpans");
  const browser = vm.runInNewContext(`(${code})`);
  ok(!/\(\?<[=!]/.test(code), `${path} moneyTokenSpans 에 lookbehind 가 없다`);
  for (const text of amountSentences) eq(JSON.stringify(browser(text)), JSON.stringify(moneyTokenSpans(text)), `${path} ‘${text}’ 의 금액이 서버와 같다`);
}
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js"]) {
  const dateFn = vm.runInNewContext(`(${fromAsset(await assetText(path), "quickInputDate")})`);
  for (const text of amountSentences) eq(dateFn(foldInputWidth(text), "2026-07-15"), quickInputDate(foldInputWidth(text), "2026-07-15"), `${path} ‘${text}’ 의 날짜가 서버와 같다`);
}
for (const [path, after] of bothPaths) {
  for (const [text, amount, memo] of [["월세 백만원", 1000000, "월세"], ["구두 만원", 10000, "구두"], ["친구 만원", 10000, "친구"], ["이사 백만원", 1000000, "이사"], ["치킨 3만5", 35000, "치킨"], ["택시 만5천원", 15000, "택시"]]) {
    const result = await after([text]);
    eq(result.added, 1, `Q-52 ${path} ‘${text}’ 은 한 건`);
    eq(result.last?.amount, amount, `Q-52 ${path} ‘${text}’ 의 금액`);
    eq(result.last?.memo, memo, `Q-52 ${path} ‘${text}’ 의 내용`);
  }
  // Q-57 금액을 못 읽은 조각은 저장 답에 적는다.
  {
    const result = await after(["커피 4000\n월세만원\n택시 3000"]);
    eq(result.added, 2, `Q-57 ${path} 두 줄만 저장한다`);
    ok(result.reply.includes("금액을 읽지 못해 저장하지 않은 말: ‘월세만원’"), `Q-57 ${path} 못 읽은 줄을 알린다: ${String(result.reply).slice(0, 160)}`);
    // Q-112 수가 없는 조각은 금액을 놓친 것이 아니다.
    for (const [text, added] of [["커피 4000, 택시", 1], ["친구랑 술 5만원", 1], ["남편이랑 저녁 5만원", 1], ["어제 친구랑 술 5만원", 1], ["오늘 지출\n커피 4000\n택시 8000", 2], ["가계부\n커피 4000", 1], ["점심 9,000원, 국민카드", 1], ["택시 8000 어제도 탔는데 또 탐", 1]]) {
      const one = await after([text]);
      eq(one.added, added, `Q-112 ${path} ‘${text}’ 저장`);
      ok(!one.reply.includes("금액을 읽지 못해"), `Q-112 ${path} ‘${text}’ 에 못 읽은 말 안내가 없다: ${String(one.reply).slice(0, 200)}`);
    }
    const many = await after(["커피 4000\n월세만원\n월세천원\n전세만원\n전세천원\n택시 3000"]);
    ok(/외 \d개/.test(many.reply), `Q-57 ${path} 넷 이상이면 줄여 적는다: ${String(many.reply).slice(0, 240)}`);
    const date = await after(["7/3, 커피 4000"]);
    eq(date.added, 1, `Q-57 ${path} 날짜만 쓴 조각 뒤의 기록은 저장한다`);
    ok(!date.reply.includes("금액을 읽지 못해"), `Q-57 ${path} 날짜만 쓴 조각은 못 읽은 말이 아니다: ${String(date.reply).slice(0, 160)}`);
    const clean = await after(["커피 4000, 택시 3000"]);
    ok(!clean.reply.includes("금액을 읽지 못해"), `Q-57 ${path} 다 읽으면 안내가 없다`);
  }
  const list = await after(["1) 김밥 1만 2) 떡볶이 4천원"]);
  eq(list.added, 2, `Q-53 ${path} 번호 목록은 두 건`);
  ok(list.reply.includes("14,000원"), `Q-53 ${path} 합계가 14,000원이다: ${String(list.reply).slice(0, 80)}`);
}

// ── Q-60~Q-73 독립 코드 검토 뒤 고친 것 ─────────────────────────────────────────────
const stepsOf = (steps) => (Array.isArray(steps) ? steps : [steps]);
const unchanged = (result, label) => { for (const field of ["amount", "memo", "category", "payment_method", "transaction_date"]) eq(result.row?.[field], result.before[field], `${label} 의 ${field} 은 그대로다`); };
// 기록을 건드리지 않고(say 가 있으면 그 안내로) 끝나는 말
const untouched = async (steps, label, { say = "", paths = bothPaths, ...options } = {}) => {
  for (const [path, run] of paths) {
    const name = `${label} ${path} ${stepsOf(steps).join(" → ")}`;
    const result = await run(stepsOf(steps), options);
    eq(result.added, 0, `${name} 은 새 기록이 아니다`);
    unchanged(result, name);
    if (say) ok(result.reply.includes(say), `${name} 의 답에 ‘${say}’ 가 있다: ${result.reply.slice(0, 120)}`);
  }
};
// 앞 기록은 그대로 두는 말(새 기록은 될 수 있다)
const kept = async (steps, label) => {
  for (const [path, run] of bothPaths) {
    const name = `${label} ${path} ${stepsOf(steps).join(" → ")}`;
    unchanged(await run(stepsOf(steps)), name);
  }
};
const removed = async (steps, label) => {
  for (const [path, run] of bothPaths) eq((await run(stepsOf(steps))).row, null, `${label} ${path} ${stepsOf(steps).join(" → ")} 은 기록을 지운다`);
};
const changed = async (steps, expect, label, options = {}) => {
  for (const [path, run] of bothPaths) {
    const name = `${label} ${path} ${stepsOf(steps).join(" → ")}`;
    const result = await run(stepsOf(steps), options);
    eq(result.added, 0, `${name} 은 새 기록이 아니다`);
    for (const [field, value] of Object.entries(expect)) eq(result.row?.[field], value, `${name} 의 ${field}`);
  }
};
const SAFE_DELETE = "지우지 않았어요";

// Q-60 묻거나 말리는 말은 지우지도 고치지도 않는다.
for (const text of ["1번 기록 삭제 안돼요", "1번 기록 삭제해도 될까", "1번 기록 삭제 하지마", "1번 기록 삭제 가능해?", "1번 기록 삭제 말아줘", "1번 기록 수정 안돼요", "마지막 기록 수정 해도 돼?", "아까 기록 수정 가능?", "최근 기록 수정 방법 알려줘", "방금 내용 알려줘"]) await untouched(text, "Q-60");
for (const text of ["1번 삭제 취소", "1번 삭제 하지마", "01번 삭제 취소"]) await untouched(text, "Q-60", { say: SAFE_DELETE });
for (const text of ["아니 삭제하지 마", "아니요 삭제하지 마세요", "아니 지우지 마", "아니 삭제 안 해", "아니 삭제 취소", "아니 삭제 말고 금액 바꿔줘", "삭제하지 마", "지우지 마", "삭제 말고 금액 5000", "아니 7", "네 7", "7이요"]) await untouched(["수정 01번", text], "Q-60", { say: SAFE_DELETE });
// 분명히 지우는 말은 그대로 지운다.
for (const text of ["1번 삭제", "1번 기록 삭제", "1번 기록 삭제해줘", "삭제 01번", "방금 거 지워줘", "최근 기록 삭제", "방금 거래 삭제"]) await removed(text, "Q-60");
for (const text of ["7", "삭제", "7번", "지우기", "삭제해줘", "지워줘"]) await removed(["수정 01번", text], "Q-60");
// 오타로 읽은 칸은 바로 쓰지 않는다. ‘세제’ 는 ‘삭제’ 의 오타가 아니다.
for (const text of ["세제 8000", "어제 커피 4500", "지갑 30000원", "어제 택시 8000", "가스 40000", "수박 20000"]) { await kept(["수정 01번", text], "Q-60"); await kept(["01번 수정", text], "Q-60"); }
for (const text of ["01번 지갑 30000원", "01번 가방 30000", "01번 수건 12000", "01번 버스 1400", "수정 01번 지갑 30000원"]) await untouched(text, "Q-60", { say: "혹시" });
await untouched("01번 수건 12000", "Q-60 숫자만 남은 값은 결제수단이 아니다", { say: "내용을" });
for (const text of ["수정 01번 세제 12000원", "01번 세제 12000"]) await untouched(text, "Q-60", { first: "세제 4500", say: "혹시" });
for (const text of ["01번 세제 5000원으로 바꿔줘", "1번 세제 5000원으로 바꿔줘"]) await changed(text, { amount: 5000, memo: "세제" }, "Q-60", { first: "세제 4500" });
// 메뉴 번호로 다른 기록을 건드리지 않는다.
for (const text of ["7번 금액 5000", "2번 금액 5000", "3번 5000"]) await untouched(["수정 01번", text], "Q-60", { say: "지금은 01번 기록을 고치고 있어요" });
for (const [path, run] of bothPaths) {
  const result = await run(["수정 02번", "1번 5000원으로 바꿔줘"], { seed: ["점심 9000"] });
  eq(JSON.stringify(result.rows.filter((row) => ["커피", "점심"].includes(row.memo)).map((row) => row.amount)), "[4500,9000]", `Q-60 ${path} 02번을 고치다 온 ‘1번 5000원으로 바꿔줘’ 는 아무것도 바꾸지 않는다`);
  ok(result.reply.includes("지금은 02번 기록을 고치고 있어요"), `Q-60 ${path} 지금 고치는 번호를 알린다`);
}
await changed(["수정 01번", "1번 5000원으로 바꿔줘"], { amount: 5000 }, "Q-60 같은 번호");
await changed(["수정 01번", "1번 13000"], { amount: 13000 }, "Q-60 메뉴 번호와 값");
for (const text of ["방금 수정 바랍니다", "방금 수정 좀 해줘", "방금 거래 수정", "방금 거래 내역 수정", "아까 거래 수정"]) await untouched(text, "Q-60·Q-73 메뉴", { say: "무엇을 바꿀까요" });

// Q-61 세션의 띄어 쓴 금액은 끝 조각이 아니다.
for (const [text, amount] of [["2만 5천원으로 바꿔줘", 25000], ["1만 2천원으로 수정", 12000], ["3만 5000원으로 변경", 35000], ["1억 2천만원으로 해줘", 120000000], ["1만 2천 5백원으로 바꿔", 12500], ["1천 500원으로 바꿔줘", 1500], ["2만 5천으로 바꿔", 25000]]) await changed(["수정 01번", text], { amount, memo: "커피" }, "Q-61");
for (const text of ["01번 커피 1만 2천원으로 바꿔줘", "01번 커피 1만 2천원으로"]) await changed(text, { amount: 12000, memo: "커피" }, "Q-61");

// Q-62 명령이 둘이면 고치지 않는다. 작은 수는 금액이 아니다. 말한 이름이 그 번호의 기록이 아니면 고치지 않는다.
for (const text of ["01번 5000원으로\n02번 3000원으로", "01번 5000원으로 02번 3000원으로", "1번 5000원으로 바꿔줘\n2번 3000원으로 바꿔줘", "01번 5000원으로 바꿔줘 그리고 02번 3000원으로"]) {
  for (const [path, run] of bothPaths) {
    const result = await run([text], { seed: ["점심 9000"] });
    eq(JSON.stringify(result.rows.filter((row) => ["커피", "점심"].includes(row.memo)).map((row) => row.amount)), "[4500,9000]", `Q-62 ${path} ‘${text}’ 는 아무것도 바꾸지 않는다`);
    ok(result.reply.includes("한 번에 한 건씩만"), `Q-62 ${path} ‘${text}’ 는 한 건씩 보내라고 알린다`);
  }
}
await untouched("01번 5000 3000으로", "Q-62", { seed: ["점심 9000"] });
for (const text of ["01번 세트 2로 바꿔줘", "01번 아이폰 15로 바꿔줘", "01번 라떼 3으로 바꿔줘", "01번 커피 25로 변경", "01번 사이즈 270으로", "01번 버스 302로"]) await untouched(text, "Q-62", { say: "혹시 내용을" });
await changed(["01번 세트 2로 바꿔줘", "네"], { memo: "세트 2", amount: 4500 }, "Q-62");
for (const steps of [["수정 01번", "세트 2로 바꿔줘"], ["수정 01번", "25로"], ["수정 01번", "금액", "커피 2로"]]) await untouched(steps, "Q-62");
for (const text of ["3번 버스 1400원으로", "07번 버스 1500원"]) await untouched(text, "Q-62", { say: "기록을 찾지 못했어요" });
for (const [path, run] of bothPaths) {
  const other = await run(["3번 버스 1400원으로"], { seed: ["점심 9000", "택시 8000"] });
  eq(other.rows.find((row) => row.memo === "택시")?.amount, 8000, `Q-62 ${path} 말한 이름과 다른 기록은 고치지 않는다`);
  ok(other.reply.includes("03번"), `Q-62 ${path} 번호를 다시 확인하게 한다: ${other.reply.slice(0, 120)}`);
  eq((await run(["3번 택시 1400원으로"], { seed: ["점심 9000", "택시 8000"] })).rows.find((row) => row.memo === "택시")?.amount, 1400, `Q-62 ${path} 이름이 맞으면 고친다`);
}
for (const text of ["1번 12000원으로 바꾸기", "1번 12000원으로 바꿈", "1번 12000원으로 변경함", "1번 12000원으로 바꿔놔", "1번 12000원으로 고쳐놔", "1번 12000원으로 맞춰줘", "1번 12000원으로 조정", "1번 12000원으로 바꾸자", "수정 1번 12000원으로 맞춰줘"]) await changed(text, { amount: 12000 }, "Q-62");
await untouched("10번 12000원으로 바꾸기", "Q-62", { say: "기록을 찾지 못했어요" });

// Q-63 금액이 둘인 답은 묻는다. 자릿수 쉼표는 그대로 읽는다.
for (const text of ["01번 금액 5000, 3000", "01번 5000, 3000", "01번 금액 5천 3천", "01번 금액 3만 2만"]) await untouched(text, "Q-63");
for (const steps of [["수정 01번", "금액", "5000, 3000"], ["수정 01번", "금액", "15000, 3500"], ["수정 01번", "1", "1. 5000"], ["수정 01번", "1", "1, 5000"]]) await untouched(steps, "Q-63", { say: "금액을 알아듣지 못했어요" });
for (const [text, amount] of [["15,000", 15000], ["1,500,000", 1500000], ["5,000원", 5000], ["12.000원", 12000]]) await changed(["수정 01번", "금액", text], { amount }, "Q-63");

// Q-64 세션 값은 사용자가 쓴 글자 그대로 저장한다(끝 문장부호만 뗀다).
for (const [text, memo] of [["19:30 영화", "19:30 영화"], ["잔액 5000원 정리", "잔액 5000원 정리"], ["신한카드(1234)", "신한카드(1234)"], ["A&B 카페 (강남)", "A&B 카페 (강남)"], ["H&M", "H&M"], ["대박!!", "대박"]]) await changed(["수정 01번", "4", text], { memo }, "Q-64");
{
  const result = await withClock("2026-07-15", () => fixture(async (fx) => {
    fx.env.SKILL_RATE_LIMIT = "10000";
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    await skill(fx, "오늘기록");
    await skill(fx, "2");
    await skill(fx, "커피 4500");
    const row = fx.db.transactions.at(-1);
    const owner = fx.db.household_members.find((item) => item.household_id === HH && item.role === "owner");
    owner.nickname = "지훈(아빠)";
    await skill(fx, "수정 01번");
    const reply = JSON.stringify(await skill(fx, "지훈(아빠)"));
    return { row: fx.db.transactions.find((item) => item.id === row.id) || null, reply };
  }));
  ok(result.row, `Q-64 등록된 이름 ‘지훈(아빠)’ 는 기록을 지우지 않는다: ${result.reply.slice(0, 120)}`);
  eq(result.row?.amount, 4500, "Q-64 등록된 이름은 금액을 바꾸지 않는다");
}

// Q-70 내용 값은 잘리지 않는다.
for (const [text, memo] of [["01번 내용 코카콜라제로", "코카콜라제로"], ["01번 내용 맥북프로", "맥북프로"], ["01번 내용 고속도로", "고속도로"], ["01번 메모 교차로", "교차로"], ["01번 내용 7번 버스", "7번 버스"], ["방금 내용 2번 출구", "2번 출구"]]) await changed(text, { memo }, "Q-70");
await changed("01번 결제수단 현대카드제로", { payment_method: "현대카드제로" }, "Q-70");
for (const text of ["마시멜로", "이름 없는 식당", "메모 작성", "제목 미정", "내용 증명", "주소 변경", "요금제 변경", "바지 수정", "아니 그게", "서류 확인", "주문 잘못", "계약서 확인", "잘못 결제", "주문 오류", "확인 필요", "7번 버스", "2번 출구", "1번 국도", "302번 버스"]) await changed(["수정 01번", "4", text], { memo: text }, "Q-70·Q-73");
for (const text of ["마시멜로", "이름 없는 식당", "서류 확인", "7번 버스"]) await changed(["수정 01번", "내용", text], { memo: text }, "Q-70·Q-73");
await changed(["수정 01번", "4", "택시로"], { memo: "택시" }, "Q-70 두 글자 낱말의 ‘로’ 는 조사다");
for (const text of ["뭐야", "틀렸어", "얼마야", "금액 확인", "이거 잘못", "확인", "잘못", "3번 5000", "7번", "02번 버스"]) await untouched(["수정 01번", "4", text], "Q-73 값이 아니다");

// Q-68 이름은 기록이다. 고치는 말은 금액 바로 뒤에서만 본다.
for (const text of ["메모 패드 3000원", "분류 작업비 30000원", "3만원 곰팡이 제거", "날짜 변경 30000원", "내용 증명 5000원", "3만원 학원 변경", "5000원 회원 수정", "수정 볼펜 2000원", "수정 화장 3만원"]) await recorded(text, "Q-68");
for (const [path, run] of bothPaths) eq((await run(["우유 4500\n3만원 점 제거"])).added, 2, `Q-68 ${path} 줄마다 기록이다`);

// Q-69 끝맺음·명사
for (const text of ["방금 13000원으로 좀 바꿔줘", "방금 5000원으로 해요", "방금 5000원으로 합니다", "방금 5000원으로 바꿔주세용"]) await changed(text, { amount: Number(text.match(/\d+/)[0]) }, "Q-69");
for (const steps of [["수정 01번", "1", "13000원으로 좀 바꿔줘"]]) await changed(steps, { amount: 13000 }, "Q-69");
await changed(["수정 01번 금액", "5000원으로 해요"], { amount: 5000 }, "Q-69");
for (const text of ["1번 건 금액 5000원", "1번 입력 5000원"]) await changed(text, { amount: 5000 }, "Q-69");
for (const text of ["커피 13000원으로 좀 바꿔줘", "커피 4500원 삭제할게", "커피 4500원 삭제해요", "커피 4500원 삭제 부탁해", "커피 4500원 지워주라", "커피 4500원 삭제합니다", "4500원 아니고 5000원"]) await guided(text, "Q-69");

// Q-72 ‘1번 취소’ 의 끝맺음, 첫 기록의 점 금액, 웹 목록 표식
for (const text of ["1번 취소해요", "1번 취소할래", "1번 취소합니다", "1번 취소하기"]) await untouched(text, "Q-72", { say: "그대로예요" });
for (const [text, amount] of [["월세 1.200.000원", 1200000], ["커피 3.500", 3500]]) {
  const room = await roomAfter(["오늘기록"], { first: text });
  eq(room.before.amount, amount, `Q-72 방의 첫 말 ‘${text}’ 도 저장한다`);
  ok(isKakaoFirstRecordInput(text, rowsOf(text)), `Q-72 ‘${text}’ 는 새 사용자의 첫 기록이다`);
  ok(isStrongKakaoTransactionInput(text, rowsOf(text)), `Q-72 ‘${text}’ 는 강한 기록 말이다`);
}
await withClock("2026-07-15", () => fixture(async (fx) => {
  for (const [raw_text, amount] of [["- 4500원 커피", "4500"], ["- 만원 커피", "10000"], ["1. 4600원 커피", "4600"], ["1) 4700원 커피", "4700"]]) {
    const before = fx.db.transactions.length;
    const response = await post(fx, "/admin/transactions", { household_id: HH, month: "2026-07", type: "expense", transaction_date: "2026-07-15", amount, category: "기타지출", memo: "커피", raw_text });
    ok(!response.decoded.includes("err="), `Q-72 웹 ‘${raw_text}’ 를 막지 않는다(${response.decoded})`);
    eq(fx.db.transactions.length, before + 1, `Q-72 웹 ‘${raw_text}’ 가 한 건 저장된다`);
  }
}));

// Q-73 조회 전용은 조회 전용이라고 알린다.
for (const text of ["최근 기록 삭제", "방금 거 지워줘", "1번 삭제"]) await untouched(text, "Q-73", { role: "viewer", say: "조회 전용" });

// Q-65~Q-68 문장 해석. 서버와 브라우저가 같은 답인지도 본다.
// Q-106~Q-114 독립 검토 7·8회차 문장: 금액과 날짜만 본다. 넓힌 규칙의 꼴에서 벗어나면 운영과 같아야 한다. ‘금액@달-일’, 날짜가 없으면 오늘, ? 는 저장하지 않음, | 는 둘 다 받음.
// Q-114~Q-117 독립 검토 8회차 문장 묶음의 지금 값. 운영과 같거나 검토자 기대와 같은 값만 넣었다. 금액@달-일, ? = 저장 안 함.
const round8Cases = [
  ["어제는 못 산 빵 3000 오늘 샀어","3000"],
  ["어제는 매진이라 못 산 빵 3000 오늘 샀음","3000"],
  ["어제도 못 샀던 커피 4000 오늘 결제","4000"],
  ["어제는 문 닫아서 못 산 책 15000 오늘 샀어","15000"],
  ["어제는 비싸서 안 산 신발 5만원 오늘 질렀다","50000"],
  ["어제도 봤던 신발 5만원 오늘 샀다","50000"],
  ["어제는 못 먹은 치킨 2만원 오늘 시킴","20000"],
  ["어제는 못 탄 택시 8000 오늘 탔어","8000"],
  ["어제도 들렀던 카페 커피 4000 오늘도 감","4000"],
  ["어제는 참았는데 치킨 2만원","20000"],
  ["어제는 참았는데 결국 치킨 시킴 2만원","20000"],
  ["어제는 못 샀는데 커피 4000","4000"],
  ["어제도 마셨는데 또 커피 4000","4000"],
  ["어제도 먹었는데 또 치킨 2만원","20000"],
  ["어제는 안 마셨는데 커피 4000","4000"],
  ["어제는 못 갔고 미용실 3만원","30000"],
  ["어제는 집밥 먹었고 외식 3만원","30000"],
  ["어제도 야근했는데 또 택시 8000","8000"],
  ["어제도 택시 탔는데 또 탔어 8000","8000"],
  ["그제도 샀는데 또 샀어 커피 4000","4000"],
  ["어제는 쉬었으니까 치킨 2만원","20000"],
  ["어제는 비 와서 못 갔는데 이번엔 갔어 미용실 3만원","30000"],
  ["어제는 못 샀고 아까 커피 4000","4000"],
  ["어제도 마셨는데 아까 또 커피 4000","4000"],
  ["어제는 못 갔는데 아까 미용실 3만원","30000"],
  ["어제는 쉬었고 점심에 커피 4000","4000"],
  ["어제도 마셨는데 방금 또 커피 4000","4000"],
  ["어제도 마셨는데 지금 또 커피 4000","4000"],
  ["어제는 못 먹었는데 이따 치킨 2만원","20000"],
  ["어제는 못 샀고\n커피 4000","4000"],
  ["어제도 마셨는데\n또 커피 4000","4000"],
  ["어제는 못 샀는데\n오늘 커피 4000","4000"],
  ["어제는 참았는데\n치킨 2만원","20000"],
  ["어제는 못 샀는데..오늘 커피 4000","4000"],
  ["어제는 못 샀는데...오늘 커피 4000","4000"],
  ["어제는 못 먹었는데ㅠㅠ오늘 치킨 2만원","20000"],
  ["어제는 못 샀는데, 오늘 커피 4000","4000"],
  ["어제는 못 샀는데,오늘 커피 4000","4000"],
  ["어제는 못 샀고(오늘) 커피 4000","4000"],
  ["어제도 마셨는데 (오늘) 또 커피 4000","4000"],
  ["어제도 마셨는데~오늘도 커피 4000","4000"],
  ["어제도 마셨는데!오늘도 커피 4000","4000"],
  ["어제도 마셨는데 \"오늘\"도 커피 4000","4000"],
  ["커피 오천 어제도 마셨어","5000"],
  ["커피 오천 어제도 마심","5000"],
  ["택시 팔천 어제도 탔어","8000"],
  ["점심 구천 어제도 먹었어","9000"],
  ["택시 삼만 어제도 탔음","30000"],
  ["택시 만오천 어제도 탔어","15000"],
  ["커피 사천오백 어제도 마셨어","4500"],
  ["커피 오천 어제는 안 마심","5000"],
  ["커피 오천 어제보단 쌈","5000"],
  ["커피 오천 어제까지만 할인","5000"],
  ["어제산 옷 오늘 환불 삼만","30000"],
  ["어제는 못 샀고 커피 오천 오늘 샀음","5000"],
  ["어제는 쉬었고 7.5 커피 4000","4000@07-05"],
  ["어제는 쉬었고 7-5 커피 4000","4000@07-05"],
  ["어제는 못 갔고 말일 월세 50만원","500000@07-31"],
  ["어제는 못 갔고 일주일 전 커피 4000","4000@07-08"],
  ["어제는 못 샀고 지난달 25일 커피 4000","4000@06-25"],
  ["어제는 못 샀고 이번달 3일 커피 4000","4000@07-03"],
  ["어제는 못 샀고 20260710 커피 4000","4000@07-10"],
  ["어제는 못 샀고 2026.7.10 커피 4000","4000@07-10"],
  ["동네 9900치킨 2마리 2만원","20000"],
  ["가성비 9900치킨 2마리 2만원","20000"],
  ["어제 9900치킨 2마리 2만원","20000@07-14"],
  ["오늘 5900피자 1판 5900원","5900"],
  ["어제 5900피자 1판 5900원","5900@07-14"],
  ["오늘 3000맥주 2잔 6000","6000"],
  ["어제 3000맥주 2잔 6000","6000@07-14"],
  ["회사 앞 2000커피 3잔 6000원","6000"],
  ["편의점 1500커피 2개 3000","3000"],
  ["저녁 9900치킨 2마리 2만원","20000"],
  ["메가 1500커피 2잔 3000","3000"],
  ["이마트 5900피자 2판 11800","11800"],
  ["노브랜드 4900피자 1판 4900","4900"],
  ["어제 1500커피 3000","3000@07-14"],
  ["친구랑 3000맥주 2잔 6000","6000"],
  ["호프집 2000맥주 3잔 6000","6000"],
  ["동네 2000주차 3시간 6000","6000"],
  ["공영 1000주차 3시간 3000","3000"],
  ["1000주차 3시간 3000","3000"],
  ["오늘 2000주차 3시간 6000","6000"],
  ["셀프 1500주유 30리터 45000","45000"],
  ["리터당 1600주유 5만원","50000"],
  ["대리 2만원 3000택시 5000","20000+5000"],
  ["1200택시 3번 3600","3600"],
  ["회사 9900치킨 2마리 2만원","20000"],
  ["치킨 9900치킨 2만원","20000"],
  ["5000담배 1갑 4500","4500"],
  ["오늘 4500담배 2갑 9000","9000"],
  ["어제 4500담배 2갑 9000","9000@07-14"],
  ["택시 5000커피값 3000","5000+3000"],
  ["점심 9000택시비 8000","9000+8000"],
  ["커피 4000주차비 2000","4000+2000"],
  ["1204 월세 냈음","?"],
  ["302 월세 냈음","?"],
  ["오피스텔 1204 월세 입금 완료","?"],
  ["301호 월세 입금 완료","?"],
  ["토익 900 일본어 공부함","?"],
  ["수능 400 일본어 학원 등록","?"],
  ["엔화 10000 일본 돈","?"],
  ["마일리지 3000 일본 항공권","?"],
  ["1234 시내버스 탔음","?"],
  ["버스 1100 시내버스 탔어","?"],
  ["100 시장 구경","?"],
  ["123 일반 게시글","?"],
  ["회원번호 1234 월회비 납부","?"],
  ["공연 2500 시내 구경","?"],
  ["3000 일본 라멘","?"],
  ["4000 분식","4000"],
  ["300 시내버스","?"],
  ["2000 일본","2000"],
  ["1000 시장","1000"],
  ["월세 1000","1000"],
  ["30 프로","30"],
  ["쿠폰 30 프로","30"],
  ["30 프로 할인","30"],
  ["마일 300 포인트","300"],
  ["3000 포인트 적립","3000"],
  ["500 포인트 사용","500"],
  ["5000 포인트 받음","5000"],
  ["1000 달러 환전","1000"],
  ["100 달러","100"],
  ["50 유로","50"],
  ["10 키로 뛰었음","10"],
  ["5 키로 감량","?"],
  ["1000 칼로리","1000"],
  ["2000 칼로리 먹음","2000"],
  ["100 미터 달리기","100"],
  ["500 메가 요금제","500"],
  ["1 테라 외장하드","?"],
  ["30 센치 자","30"],
  ["3 코인","?"],
  ["커피 4000 어제도 마셨어, 택시 8000","4000+8000"],
  ["커피 4000 어제도 마셨어 택시 8000","4000+8000"],
  ["커피 4000 어제도 마심 택시 8000","4000+8000"],
  ["커피 4000 어제도 마심, 택시 8000","4000+8000"],
  ["점심 9000 어제도 여기서 먹음, 커피 4000","9000+4000"],
  ["택시 8000 어제도 탔는데 또 탐, 커피 4000","8000+4000"],
  ["커피 4000 어제는 안 마셨음, 택시 8000","4000+8000"],
  ["점심 9000 어제보단 쌈, 커피 4000","9000+4000"],
  ["커피 4000 어제도 마셨어\n택시 8000","4000+8000"],
  ["커피 4000 어제도 마셨어 ㅋㅋ\n택시 8000","4000+8000"],
  ["어제는 1만보 걸었고 오늘 커피 4000","4000"],
  ["어제는 3천보 걷고 오늘 커피 4000","4000"],
  ["어제는 2만보 걷고 오늘 치킨 2만원","20000"],
  ["어제도 1만보 걸었는데 오늘 또 택시 8000","8000"],
  ["어제는 5천명 왔대 오늘 커피 4000","4000"],
  ["어제는 2천원 아꼈고 오늘 커피 4000","2000@07-14+4000"],
  ["어제는 500 잔 팔았고 오늘 커피 4000","4000"],
  ["어제도 3천보밖에 못 걸어서 오늘 택시 8000","8000"],
  ["어제산 옷 3만원 오늘 환불","30000"],
  ["어제산 옷 3만원 오늘 반품","30000"],
  ["어제시킨 치킨 2만원 오늘 왔어","20000"],
  ["어제주문한 책 15000 오늘 결제","15000"],
  ["어제본 신발 5만원 오늘 샀어","50000"],
  ["오늘은 쉬고 커피 4000 어제 샀음","4000@07-14"],
  ["오늘은 정리만 했어 커피 4000 어제 거","4000@07-14"],
  ["오늘은 영수증 정리 중 택시 8000 어제 탄 거","8000@07-14"],
  ["오늘은 쉬는 날 커피 4000 어제 샀어","4000@07-14"],
  ["오늘은 안 샀고 빵 3000 그저께 샀어","3000@07-13"],
  ["오늘도 커피 4000 어제 샀던 거","4000@07-14"],
  ["오늘은 커피 4000 7월 3일에 산 거","?"],
  ["오늘은 커피 4000 지난주 금요일 영수증","4000@07-10"],
  ["오늘도 야근 택시 8000 3일에 탄 거","8000"],
  ["어제는 바빴음\n오늘 커피 4000\n택시 8000","4000+8000"],
  ["어제는 야근\n오늘 커피 4000\n편의점 3000","4000+3000"],
  ["어제는 쉬었음\n오늘 점심 9000\n커피 4000","9000+4000"],
  ["어제도 바빴고\n오늘 택시 8000\n커피 4000","8000+4000"],
  ["1.5 원룸 월세 50만원, 커피 4000","4000@01-05"],
  ["1.5 원룸 월세 50만원\n커피 4000","4000@01-05"],
  ["5.5 원두 2만원, 택시 8000","8000@05-05"],
  ["3-4 원룸 월세 40만원, 커피 4000","4000@03-04"],
  ["1.5 원룸, 커피 4000","4000@01-05"],
  ["10.5 원 커피 4000","?"],
  ["2.5 원룸 관리비 5만원\n택시 8000","8000@02-05"],
  ["이틀 후에 갚기로 하고 친구한테 5만원 빌려줌","50000"],
  ["일주일 후에 돌려받기로 하고 3만원 빌려줌","30000"],
  ["한달 후에 갚는다고 5만원 빌려감","50000"],
  ["3일 후에 갚는대서 5만원 빌려줌","50000@07-03"],
  ["일주일 전에 산 옷 환불 3만원","30000"],
  ["한달 전에 산 옷 환불 3만원","30000"],
  ["3일 전에 산 신발 환불 5만원","50000@07-03"],
  ["이틀 전에 주문한 책 취소 환불 15000","15000"],
  ["2주 전에 예약한 호텔 취소 수수료 3만원","30000"],
  ["일주일 전에 예약한 미용실 3만원","30000"],
  ["3일 후에 쓸 커피 쿠폰 5000","5000@07-03"],
  ["일주일 후에 제주도 가서 항공권 20만원","200000"],
  ["이틀 전에 샀던 커피 또 4000","4000"],
  ["3일 전에 못 산 커피 4000","4000@07-03"],
  ["일주일 전에 못 샀는데 책 15000","15000"],
  ["3일에 걸친 공사비 30만원","300000"],
  ["2일에 걸친 세미나 10만원","100000"],
  ["3일에 걸쳐 공사 30만원","300000"],
  ["3일에 나눠서 낸 5만원","50000"],
  ["3일에 나눈 할부 5만원","50000"],
  ["3일에 한 통 쓰는 샴푸 9000","9000"],
  ["2일에 한 병 소주값 1만원","10000"],
  ["3일에 하나씩 먹는 약 3만원","30000"],
  ["1일에 커피 세 잔 1만원","10000"],
  ["7일에 한 잔 와인 3만원","30000"],
  ["30일에 구천구백원 구독","9900"],
  ["30일에 오천원 구독","5000"],
  ["3일에 만원 알바","10000"],
  ["1일에 만원씩 저금","10000"],
  ["5일에 끝나는 세일 커피 5000","5000"],
  ["5일에 갚을 돈 5만원 빌림","50000"],
  ["25일에 월급 들어오니까 치킨 2만원","20000"],
  ["25일에 월급 받는데 커피 4000","4000"],
  ["10일에 카드값 나가는데 치킨 2만원","20000"],
  ["1/2에 샀어 3000","?"],
  ["1/3에 팔았어 5만원","?"],
  ["1/2에 샀음 커피 3000","?"],
  ["1. 2 시간 주차 5000","5000"],
  ["2. 3 시간 주차 6000","6000"],
  ["1. 3 킬로 고기 2만원","20000"],
  ["2. 5 킬로 쌀 3만원","30000"],
  ["1. 2 리터 콜라 3000","3000"],
  ["1. 2 근 삼겹살 3만원","30000"],
  ["2. 3 판 계란 2만원","20000"],
  ["1. 5 팩 두부 5000","5000"],
  ["3. 2 줄 김밥 6000","6000"],
  ["1. 3 포기 배추 9000","9000"],
  ["1. 2 통 수박 3만원","30000"],
  ["2. 3 그릇 국밥 3만원","30000"],
  ["1. 2 시간 노래방 2만원\n2. 3 시간 피시방 5000","20000+5000"],
  ["1. 커피 4000\n2. 3 시간 주차 6000","4000+6000"],
  ["1. 5 층 식당 9000","?"],
  ["1. 3 호선 지하철 1500","?"],
  ["2. 5 호선 지하철 1500","?"],
  ["1. 2 차 회식 5만원","?"],
  ["2. 3 차 노래방 3만원","?"],
  ["1. 3 인 식사 3만원","?"],
  ["1. 7 부 바지 3만원","?"],
  ["1. 2 달 치 월세 100만원","?"],
  ["1. 3 개월 할부 30만원","?"],
  ["1. 6 개월 헬스 30만원","?"],
  ["2. 3 년 약정 5만원","50000"],
  ["1. 2 주 치 약값 9000","?"],
  ["1. 5 만원권 지폐","50000"],
  ["1,000 명함 3만원","?"],
  ["1,204 월세 50만원","500000"],
  ["1,500 일반 쓰레기봉투 3,000","?"],
  ["2,500 시장 떡볶이 3,000","?"],
  ["1,000 시장 쿠폰 3000","?"],
  ["직원 1,200 명절 선물 300만원","?"],
  ["1,500 시내버스 탔어","?"],
  ["어제는\n커피 4000\n오늘은\n택시 8000","4000@07-14+8000"],
  ["어제는\n커피 4000\n오늘은\n택시 팔천","4000@07-14+8000"],
  ["어제\n커피 4000\n오늘은\n택시 8000","4000@07-14+8000"],
  ["어제도\n커피 4000\n오늘도\n택시 8000","4000@07-14+8000"],
  ["그제는\n커피 4000\n어제는\n택시 8000","4000@07-13+8000@07-14"],
  ["그제\n커피 4000\n어제는\n택시 8000","4000@07-13+8000@07-14"],
  ["7월 3일은\n커피 4000\n7월 5일은\n택시 8000","4000@07-03+8000@07-05"],
  ["7월 3일에\n커피 4000\n7월 5일에\n택시 8000","4000@07-03+8000@07-05"],
  ["커피 4000 어제도 1만보 걸음","4000"],
  ["커피 4000 어제는 3천보 걸음","4000"],
  ["택시 8000 어제도 2만보 걸었음","8000"],
  ["택시 8000 어제는 버스 1500","8000+1500@07-14"],
  ["커피 4000 어제 택시 8000","4000+8000@07-14"],
  ["어제 커피 4000\n3000맥주 2잔 6000","4000@07-14+6000@07-14"],
  ["오늘 점심 9000\n1500커피 2잔 3000","9000+3000"],
  ["어제\n1500커피 2잔 3000","3000@07-14"],
  ["오늘\n1500커피 2잔 3000","3000"],
  ["어제 지출\n9900치킨 2마리 2만원","20000@07-14"],
  ["어제\n5900피자 1판 5900원","5900@07-14"],
  ["7/3\n9900치킨 2마리 2만원","20000@07-03"],
  ["7월 3일\n3000맥주 2잔 6000","6000@07-03"],
  ["어제, 3000맥주 2잔 6000","6000@07-14"],
  ["어제 택시 8000, 3000맥주 2잔 6000","8000@07-14+6000@07-14"],
  ["택시 8000, 3000맥주 2잔 6000","8000+6000"],
  ["택시 8000\n3000맥주 2잔 6000","8000+6000"],
  ["3000맥주 2잔 6000 어제","6000@07-14"],
  ["어제는 회사에서 일이 너무 많아서 정신없이 바빴고 팀장님이 또 회의를 잡아서 결국 저녁도 못 먹고 야근까지 하느라 아무것도 못 샀는데 오늘 커피 4000","4000"],
  ["어제는 회사에서 일이 너무 많아서 정신없이 바빴고 팀장님이 또 회의를 잡아서 결국 저녁도 못 먹고 야근까지 하느라 아무것도 못 샀는데 정말 힘들었고 비도 많이 오고 우산도 없어서 오늘 택시 8000","8000"],
  ["커피 4000 오늘 아침에 출근하다가 회사 앞 카페에 들러서 사장님이랑 이런저런 얘기 나누면서 아이스 아메리카노 한 잔 시켜서 마셨는데 어제도 마셨어","4000"],
  ["택시 8000 야근 끝나고 회사 앞에서 기다리다가 비가 너무 많이 와서 어쩔 수 없이 집까지 타고 왔는데 기사님이 친절하셔서 좋았음 어제도 탔어","8000"],
  ["커피 4,000 어제도 마셨어","4000"],
  ["택시 8,000원 어제도 탔어","8000"],
  ["커피 4천원 어제도 마셨어","4000"],
  ["커피 4.5천원 어제도 마셨어","4500"],
  ["택시 1.2만 어제도 탔어","12000"],
  ["커피 4000원에 어제도 마심","4000"],
  ["택시 만이천 어제도 탔어","12000"],
  ["커피 천원 어제도 마심","1000"],
  ["커피 오백 어제도 마심","500"],
  ["주차 삼천 어제는 무료였어","3000"],
  ["택시 일만 어제는 버스 탐","10000"],
  ["커피 오천 어제는 택시 팔천","5000+8000@07-14"],
  ["오늘은 어제 먹다 남은 치킨 데워 먹음 맥주 5000","5000@07-14"],
  ["오늘은 어제 산 재료로 요리 고기 3만원","30000@07-14"],
  ["오늘도 어제 그 카페 커피 4000","4000@07-14"],
  ["어제는, 커피 4000","4000"],
  ["어제도, 택시 8000","8000"],
  ["오늘은, 커피 4000","4000"],
  ["커피 4000, 어제는","4000@07-14"],
  ["커피 4000, 어제도","4000@07-14"],
  ["택시 8000, 어제에","8000@07-14"],
  ["커피 4000, 어제","4000@07-14"],
  ["커피 4000 어제","4000@07-14"],
  ["커피 4000 어제는","4000"],
  ["커피 4000 어제도","4000"],
  ["어제에 이은 회식 5만원","50000"],
  ["어제에 대한 보상으로 치킨 2만원","20000"],
  ["어제에 비해서 싸게 점심 7000","7000"],
  ["어제에 견줘 싸게 점심 7000","7000"],
  ["어제와 비교해 싸게 점심 7000","7000"],
  ["어제랑 비교하면 싸게 점심 7000","7000"],
  ["어제 대비 싸게 점심 7000","7000@07-14"],
  ["어제대비 싸게 점심 7000","7000"],
  ["어제보다 오늘 비쌈 커피 5000","5000"],
  ["어제는커녕 오늘도 못 샀어 커피 4000","4000"],
  ["어제고 뭐고 치킨 2만원","20000"],
  ["어제는 어제고 치킨 2만원","20000"],
  ["어제는 어제고 오늘은 치킨 2만원","20000"],
  ["어제라서 커피 4000","4000"],
  ["어제라도 커피 4000","4000"],
  ["어제이긴 한데 커피 4000","4000"],
  ["어제뿐 아니라 오늘도 커피 4000","4000"],
  ["어제랑 달리 커피 4000","4000"],
  ["어제와 달리 커피 4000","4000"],
  ["어제하고 달리 커피 4000","4000"],
  ["어제보단 싸네 커피 3500","3500"],
  ["어제 보단 싸네 커피 3500","3500@07-14"],
  ["어제마냥 커피 4000","4000"],
  ["어제랑은 다르게 커피 4000","4000"],
  ["어제랑도 다르게 커피 4000","4000"],
  ["어제랑 똑같이 커피 4000","4000"],
  ["어제랑 같은 메뉴 점심 9000","9000"],
  ["어제랑 같은 데서 점심 9000","9000"],
  ["어제랑 다르게 점심 8000","8000"],
  ["어제랑 달리 싸게 샀어 커피 3000","3000"],
  ["어제하고 똑같이 커피 4000","4000"],
  ["어제하고 같은 메뉴 점심 9000","9000"],
  ["어제하고 다르게 택시 탔어 8000","8000"],
  ["그제랑 똑같이 커피 4000","4000"],
  ["그저께랑 같은 커피 4000","4000"],
  ["어제랑 비슷하게 5만원 썼어","50000"],
  ["어제랑 비슷한 금액 5만원","50000"],
  ["어제랑 똑같은 택시비 8000","8000"],
  ["오늘이랑 똑같이 커피 4000","4000"],
  ["어제랑은 똑같이 커피 4000","4000"],
  ["어제와 똑같이 커피 4000","4000"],
  ["어제와 같은 메뉴 점심 9000","9000"],
  ["어제랑 오늘 커피값 8000","8000"],
  ["어제하고 오늘 커피값 8000","8000"],
  ["그제랑 어제 택시비 2만원","20000@07-14"],
  ["7월 3일이랑 똑같이 커피 4000","4000@07-03"],
  ["5일 약국 1만원\n3일 치 약값 9000","10000@07-05+9000@07-05"],
  ["5일 병원 3만원\n3일 치 약 9000","30000@07-05+9000@07-05"],
  ["3일 커피 4000\n1일 1식 도시락 9000","4000@07-03+9000@07-03"],
  ["10일 놀이공원 5만원\n1일 이용권 3만원","50000@07-10+30000@07-10"],
  ["10일 렌트 10만원\n2일 보험 3만원","100000@07-10+30000@07-10"],
  ["10일 호텔 20만원\n2일 주차 1만원","200000@07-10+10000@07-10"],
  ["5일 호텔 20만원, 2일 주차 1만원","200000@07-05+10000@07-05"],
  ["5일 약국 1만원, 3일 치 약값 9000","10000@07-05+9000@07-05"],
  ["5일 약국 1만원 3일 치 약값 9000","10000@07-05+9000@07-05"],
  ["3일 커피 4000\n2일 숙박 20만원","4000@07-03+200000@07-03"],
  ["20일 커피 4000\n30일 구독 9900","4000@07-20+9900@07-20"],
  ["20일 커피 4000\n7일 체험권 3000","4000@07-20+3000@07-20"],
  ["10일 점심 9000\n3일째 커피 4000","9000@07-10+4000@07-10"],
  ["10일 점심 9000\n3일 연속 커피 4000","9000@07-10+4000@07-10"],
  ["어제는 2잔 마셨고 커피 8000","8000"],
  ["어제도 3번 탔어 택시 2만원","20000"],
  ["어제의 커피 4000, 오늘의 택시 8000","4000+8000"],
  ["내일모레 시험이라 커피 4000","4000"],
  ["내일모레 여행이라 환전 30만원","300000"],
  ["내일모레가 시험이라 커피 4000","4000"],
  ["내일모레면 월급인데 커피 4000","4000"],
  ["내일모레 월급날이라 치킨 2만원","20000"],
  ["내일 모레 시험이라 커피 4000","4000@07-16"],
  ["내일모레 갚기로 하고 5만원 빌려줌","50000"],
  ["커피 4000 내일모레 또 마실 듯","4000"],
  ["택시 8000 내일모레 또 탐","8000"],
  ["커피 4000 내일모레 시험","4000"],
  ["점심 9000 내일모레 회식","9000"],
  ["어제 커피 4000 내일모레 시험","4000@07-14"],
  ["오늘 커피 4000 내일모레 시험","4000"],
  ["내일모레 커피 4000","4000"],
  ["어제 말고 그제 커피 4000","4000@07-13"],
  ["오늘 말고 어제 커피 4000","4000@07-14"],
  ["어제 말고 오늘 커피 4000","4000"],
  ["어제 아니고 오늘 커피 4000","4000@07-14"],
  ["오늘 말고 내일 갈 거라 커피 4000","4000"],
  ["커피 4000\n어제\n택시 8000\n오늘","4000+8000@07-14"],
  ["어제 저녁\n치킨 2만원\n오늘 아침\n빵 3000","20000@07-14+3000@07-14"],
  ["어제\n치킨 2만원\n오늘\n빵 3000\n어제\n택시 8000","20000@07-14+3000+8000@07-14"],
  ["택시 8000 어제 커피 4000 오늘","8000+4000@07-14"],
  ["시험 전날에 밤새서 커피 4000","4000"],
  ["생일 전날에 케이크 3만원","30000"],
  ["결혼식 전날은 호텔 20만원","200000"],
  ["여행 전날에 장봄 5만원","50000"],
  ["어제 어제 커피 4000","4000@07-14"],
  ["어제는요 커피 4000","4000"],
  ["어제요 커피 4000","4000"],
  ["어제임 커피 4000","4000"],
  ["어제였나 커피 4000","4000"],
  ["어제였나 그제였나 커피 4000","4000"],
  ["어제인가 커피 4000","4000"],
  ["어제인듯 커피 4000","4000"],
  ["오늘인지 어제인지 커피 4000","4000"],
  ["어제부터인가 커피 4000","4000"],
  ["어제까지였던 할인 커피 4000","4000"],
  ["어제까지만 커피 4000","4000"],
  ["어제꺼 오늘 결제 4000","4000"],
  ["어제꺼 오늘 커피 4000","4000"],
  ["어제꺼랑 오늘꺼 커피 8000","8000"],
  ["어제밤새서 커피 4000","4000"],
  ["커피 4000 이틀 전에도 마셨어","4000"],
  ["택시 8000 일주일 전에도 탔어","?"],
  ["점심 9000 한달 전에도 여기서 먹음","9000"],
  ["치킨 2만원 이틀 전에도 시킴","20000"],
  ["미용실 3만원 두달 전에도 감","30000"],
  ["택시 8000 이틀 전에 비해 쌈","8000"],
  ["커피 4000 하루 전에 샀음","4000"],
  ["커피 4000 이틀 전에 샀음","4000"],
  ["커피 4000 이틀 전에는 3500이었음","4000"],
  ["신발 250 백화점에서 5만원","50000"],
  ["구두 270 천연가죽 5만원","50000"],
  ["운동화 265 천 소재 3만원","265000+30000"],
  ["호수 1004 천사 후원 5만원","1004004+50000"],
  ["마일 3000 만료 전에 항공권 30만원","300000"],
  ["포인트 5000 만료 커피 4000","4000"],
  ["쿠폰 3000 만료 전에 커피 5000","5000"],
  ["포인트 5000 만료됨","?"],
  ["쿠폰 3000 만료","?"],
  ["마일리지 1200 만료 예정","?"],
  ["토익 900 만점 목표","?"],
  ["토익 900 만점 목표 학원 30만원","300000"],
  ["수능 400 만점","?"],
  ["아파트 1502 백화점 근처 관리비 15만원","150000"],
  ["버스 1100 백운역 탔음","?"],
  ["버스 1100 백운역 1500원","1500"],
  ["버스 1100 천호역 1500원","1500"],
  ["광역버스 9401 천안 3000","3000"],
  ["지하철 300 만남의광장","?"],
  ["사이즈 270 백화점 5만원","50000"],
  ["모델 500 천연 비누 5000","5000"],
  ["사이즈 95 백화점 세일 3만원","30000"],
  ["100 백화점 쿠폰","?"],
  ["3000 백화점 쿠폰","3000"],
  ["5000 천원샵","5000000"],
  ["1500 만화책","1500"],
  ["2000 백반","2000"],
  ["3000 만두","3000"],
  ["3000 만두 2인분","3000"],
  ["5000 십자수","5000"],
  ["1000 억새","?"],
  ["5000 천일염 택배비 3000","3000"],
  ["3000 만두 5000 백반","3000+5000"],
  ["커피 4000 만두 3000","4000+3000"],
  ["커피 4000 백반 8000","4000+8000"],
  ["커피 4000 천일염 5000","4000+5000"],
  ["월세 50만 백화점 3만","500000+30000"],
  ["택시 1만 천호역","?"],
  ["택시 1만 백운역","?"],
  ["택시 8000 천호역에서","?"],
  ["택시 8000 만남의광장까지","?"],
  ["택시 8000 백운역까지","?"],
  ["택시 8천 백운역까지","?"],
  ["커피 4500 천천히 마심","?"],
  ["커피 4500 만족","?"],
  ["커피 4500 백점","?"],
  ["커피 4500 천국","?"],
  ["김밥 3000 천국","?"],
  ["김밥 3천 천국","?"],
  ["택시 8000 만세","?"],
  ["쿠폰 1000이랑 같이 썼어 커피 4000","4000"],
  ["쿠폰 3000이랑 같이 결제 치킨 2만원","20000"],
  ["포인트 3000이랑 현금으로 커피 5000","5000"],
  ["우유 500이랑 치즈 샀어 8000","8000"],
  ["콜라 500이랑 사이다 샀음 3000","3000"],
  ["신발 270이랑 275 샀어 10만원","275+100000"],
  ["1호기 300이랑 비교했는데 3만원","30000"],
  ["아이패드 256이랑 케이스 80만원","800000"],
  ["마일리지 5000이랑 카드로 항공권 30만원","300000"],
  ["쿠폰 1000이랑 커피 4000","4000"],
  ["버스 240이랑 지하철 갈아타서 1500","1500"],
  ["버스 240이랑 2호선 타고 옴 1500","1500"],
  ["커피 4000이랑 택시 8000","4000+8000"],
  ["택시 8000 시간 없어서 김밥 3000 사먹음","3000"],
  ["커피 4000 시간 때우기 좋아서 빵 3000 샀음","3000"],
  ["택시 8000 시간 없어서","?"],
  ["점심 9000 시간 없어서 김밥","?"],
  ["커피 4000 시간","?"],
  ["주차 5000 시간 초과 벌금 3만원","30000"],
  ["오늘 택시 8000 시간 없어서 탐","?"],
  ["택시 12000 시간 없어서 탔어, 커피 4000","4000"],
  ["3000 시간 노래방","?"],
  ["노래방 2 시간 2만원","20000"],
  ["회비 3000 명","?"],
  ["회식 30000 명","?"],
  ["택시 8000 명동까지","?"],
  ["커피 4000 명동점","?"],
  ["빵 3000 구 청사 앞","?"],
  ["택시 8000 구 청사까지","?"],
  ["택시 8000 정 없네","?"],
  ["커피 4000 봉","?"],
  ["택시 8000 장 보러 감","?"],
  ["커피 4000 장 보고 옴","?"],
  ["커피 4000 장 보고 택시 8000","8000"],
  ["택시 8000 대 박","?"],
  ["커피 4000 잔 비움","?"],
  ["택시 8000 벌 받음","?"],
  ["커피 4000 개 비쌈","?"],
  ["커피 4000 개비쌈","4000"],
  ["커피 4000 줄 서서 삼","?"],
  ["커피 4000 줄 서서 샀고 빵 3000","3000"],
  ["택시 8000 통 큰 기사님","?"],
  ["어제\n버스 1100 천호역 1500원","1500@07-14"],
  ["어제\n구두 270 천연가죽 5만원","50000@07-14"],
  ["어제\n토익 900 만점 목표 학원 30만원","300000@07-14"],
  ["어제\n쿠폰 1000이랑 같이 썼어 커피 4000","4000@07-14"],
  ["어제 지출\n우유 500이랑 치즈 샀어 8000","8000@07-14"],
  ["7월 3일\n포인트 3000이랑 현금으로 커피 5000","5000@07-03"],
  ["오늘\n버스 1100 천호역 1500원","1500"],
  ["오늘 지출\n쿠폰 3000 만료 전에 커피 5000","5000"],
  ["커피 4000\n버스 1100 천호역 1500원","4000+1500"],
  ["커피 4000\n쿠폰 1000이랑 같이 썼어 치킨 2만원","4000+20000"],
  ["1. 커피 4000\n2. 쿠폰 1000이랑 같이 썼어 치킨 2만원","4000+20000"],
  ["점심 9000\n구두 270 천연가죽 5만원","9000+50000"],
  ["어제, 구두 270 천연가죽 5만원","50000@07-14"],
  ["어제 구두 270 천연가죽 5만원","50000@07-14"],
  ["어제 버스 1100 천호역 1500원","1500@07-14"],
  ["어제 쿠폰 1000이랑 같이 썼어 커피 4000","4000@07-14"],
  ["월세 백5만원","1050000"],
  ["월세 천2백만원","12000000"],
  ["보증금 천5백만원","15000000"],
  ["월급 이백5십만원","2500000"],
  ["월급 삼백5십만원","3500000"],
  ["월급 3백5십만원","3500000"],
  ["월급 2백5만원","2050000"],
  ["월세 백2십만원","1200000"],
  ["월세 1백5만원","1050000"],
  ["차 천5백만원","15000000"],
  ["차 이천5백만원","25000000"],
  ["전세 억5천만원","150000000"],
  ["전세 1억5천만원","150000000"],
  ["전세 억5만원","100050000"],
  ["전세 2억5백만원","205000000"],
  ["전세 2억5만원","200050000"],
  ["용돈 십5만원","150000"],
  ["용돈 이십5만원","250000"],
  ["용돈 3십5만원","350000"],
  ["월급 천2백5십만원","12500000"],
  ["월급 2천5백만원","25000000"],
  ["커피 천5백원","1500"],
  ["커피 천5백","1500"],
  ["커피 만5천원","15000"],
  ["커피 천 5백원","1500"],
  ["택시 만 5천원","15000"],
  ["택시 만5천","15000"],
  ["옷 십오만5천원","155000"],
  ["옷 십5만5천원","155000"],
  ["만 3세 입장료 5000","10000+5000"],
  ["만 5세 유치원비 20만원","10000+200000"],
  ["만 65세 이상 지하철 1500","10000+1500"],
  ["만 3세 아동 입장료 5000원","10000+5000"],
  ["만 2세 영유아 검진 3만원","10000+30000"],
  ["천 2장 5000","5000"],
  ["백 3개 5만원","50000"],
  ["백 2개 샀어 5만원","50000"],
  ["종이 백 5개 3000","3000"],
  ["쇼핑 백 3장 500원","500"],
  ["백 5000원","5000"],
  ["쇼핑 백 5개 3000","3000"],
  ["종이 백 10장 2000","2000"],
  ["종이백 5개 3000","3000"],
  ["에코 백 2개 1만원","10000"],
  ["명품 백 1개 300만원","3000000"],
  ["가죽 백 1개 30만원","300000"],
  ["숄더 백 1개 5만원","50000"],
  ["커튼 천 2장 3만원","30000"],
  ["식탁보 천 2장 1만원","10000"],
  ["보자기 천 3장 6000","6000"],
  ["원단 천 3개 5000","5000"],
  ["린넨 천 2개 8000","8000"],
  ["어제 종이 백 5개 3000","3000@07-14"],
  ["종이 백 5장 500원","500"],
  ["비닐 백 3개 300원","300"],
  ["백 5개 3000","3000"],
  ["종이 백 5개 샀음","?"],
  ["명품 백 2개 샀어","?"],
  ["커튼 천 2장 샀어","?"],
  ["쇼핑 백 3개","?"],
  ["에코 백 1개","?"],
  ["종이 백 5개","?"],
  ["원단 천 3개 샀음","?"],
  ["아이스크림 천 2개","?"],
  ["붕어빵 천 3개","?"],
  ["붕어빵 천원 3개","1000"],
  ["커피 5000점심 9000 택시 3000","5000+9000+3000"],
  ["택시 3000, 커피 5000점심 9000","3000+5000+9000"],
  ["커피 4000이랑 택시 8000 점심 9000","4000+8000+9000"],
  ["커피 5000 만두 3000 택시 8000","5000+3000+8000"],
  ["떡볶이 4000 만두 3000 튀김 2000","4000+3000+2000"],
  ["3000 만두 5000 백반","3000+5000"],
  ["5000 만두 오천원","5000+5000"],
  ["신발 250 백화점에서 오만원","50000"],
  ["아파트 1500 백화점 근처 관리비 15만원","150000"],
  ["100 월세","?"],
  ["1/2에 샀어 3000","?"],
  ["어제는 외식했어 3만원","30000"],
  ["어제\n커피 5000점심 9000","5000@07-14+9000@07-14"],
];
// Q-118~Q-120 독립 검토 9회차 재현 문장의 지금 값. 틀린 값을 저장하던 말은 운영 값이거나 ? 다.
const round9Cases = [
  ["어제 커피 4000하고 택시 8000","4000@07-14+8000@07-14"],
  ["커피 4000하고 택시 3만원","4000+30000"],
  ["점심 9000하고 커피 4500 카드","9000+4500"],
  ["월세 50만하고 관리비 10만","500000+100000"],
  ["엄마 용돈 30만하고 아빠 용돈 20만","300000+200000"],
  ["스타벅스 커피 4000하고 택시 8000","4000+8000"],
  ["대출 1억 이자 30만원","?"],
  ["마통 3000만 이자 12만원","?"],
  ["전세 3억 이사비 80만원","?"],
  ["월급 300만 공제 후 270만원","?"],
  ["1000만 영화 티켓 15000","?"],
  ["주식 100만 사고 수수료 500원","?"],
  ["3만 이상 구매 쿠폰 5000","?"],
  ["커피 4천 2잔 8천","?"],
  ["회비 3만 4명 12만원","?"],
  ["시급 1만 8시간 8만원","?"],
  ["옷 3만 10% 할인 27000","?"],
  ["렌트 5만 3일 15만원","?"],
  ["적금 월 30만 12개월 360만원","?"],
  ["도시락 5000 일주일 35000","?"],
  ["BMW 520 월요일 정비 30만원","300000@07-13"],
  ["버스 720 일주일 정기권 2만원","20000"],
  ["맥주 500이랑 치킨 18000","18000"],
  ["소주 360이랑 삼겹살 30000","30000"],
  ["아이패드 11이랑 케이스 30000","30000"],
  ["할인 2000 백숙 3만원","30000"],
  ["정가 5만 백팩 3만원","30000"],
  ["쿠폰 3000 만두 5000","5000"],
  ["마트 9900치킨 9900","9900"],
  ["편의점 1500커피 3000","3000"],
  ["어제는 공짜였는데 5000","5000"],
  ["어제는 쌌는데 5000","5000"],
  ["어제는 참았는데 2만원","20000"],
  ["어제도 마셨는데 4000","4000"],
  ["어제는 무지출 5000","5000"],
  ["어제는 못탔음 1500","1500"],
  ["3일에 한번 5000","5000"],
  ["1일에 두잔 8000","8000"],
  ["30일에 두번 3만원","30000"],
  ["2. 5 킬로 2만원","20000"],
  ["1. 우유 3000\n2. 2 팩 5000","3000+5000"],
  ["1. 1 회 5000","?"],
  ["3. 5 회 5만원","?"],
  ["3일에 한번씩 5000","5000"],
  ["3일에 하나 5000","5000"],
  ["7일에 한권 12000","12000"],
  ["어제는 안먹음 5000","5000"],
  ["어제는 쉼 3만원","30000"],
  ["어제는 못사서 5000","5000"],
  ["어제는 안주 2만원","20000@07-14"],
  ["어제는 점심 9000","9000@07-14"],
  ["2/3에 구매 5000","?"],
  ["3/4에 피자 9000","?"],
  ["1/2에 세일 3000","?"],
  ["1/3에 판매 5만원","?"],
  ["맥주 1000 만두 8000","8000"],
  ["맥주 1000치킨 18000","18000"],
  ["콜라 1500이랑 피자 18000","18000"],
  ["적금 50만원, 6개월 후","500000"],
  ["대출 100만원, 3개월 후","1000000"],
  ["커피 4000, 3일 전","4000@07-12"],
  ["환율 1.300","?"],
  ["리터당 1.700","?"],
  ["1차 5만 2차 3만","50000+30000"],
  ["술값 3만 2차 5만","30000+50000"],
  ["마트 2만 7월 3일 점심 5000","20000+5000@07-03"],
  ["식비 3만 만두 5000","30000+5000"],
  ["종이 백 10장 2000","2000"],
  ["택시 3만이랑 커피 4000","30000+4000"],
  ["커피 4000하고 택시 8000","4000+8000"],
  ["어제 커피 4000랑 택시 8000","4000@07-14+8000@07-14"],
];
const round7Cases = [
  ["어제는 못 샀고 오늘은 커피 4000", "4000"],
  ["어제는 집밥 오늘은 외식 3만원", "30000"],
  ["어제는 쉬었고 오늘은 택시 8000", "8000"],
  ["어제는 없었고 오늘은 커피 4000", "4000"],
  ["어제는 안 갔고 오늘은 갔어 미용실 3만원", "30000"],
  ["어제는 비싸서 못 사고 오늘은 샀어 커피 4000", "4000"],
  ["친구가 어제는 쐈고 오늘은 내가 커피 4000", "4000"],
  ["어제는 못 갔고 오늘도 못 갔어 택시 8000", "8000"],
  ["어제는 못 샀고 오늘은 커피 4000 택시 8000", "4000+8000"],
  ["어제는 2시간 기다렸고 오늘 커피 4000", "4000"],
  ["어제는 3번 갔고 오늘 택시 8000", "8000"],
  ["어제는 3시에 갔고 오늘 커피 4000", "4000"],
  ["어제는 30분 기다렸는데 오늘 커피 4000", "4000"],
  ["어제는 3잔 마셨고 오늘 커피 4000", "4000"],
  ["어제도 마셨는데 오늘 또 커피 4000", "4000"],
  ["어제도 못 샀고 오늘 커피 4000", "4000"],
  ["어제도 야근해서 오늘 택시 8000", "8000"],
  ["어제도 갔는데 오늘 또 미용실 3만원", "30000"],
  ["어제도 치킨 먹었는데 오늘도 치킨 2만원", "20000"],
  ["어제엔 못 샀고 오늘 커피 4000", "4000"],
  ["어제만 참고 오늘 커피 4000", "4000"],
  ["어제저녁도 치킨 먹었는데 오늘 또 치킨 2만원", "20000"],
  ["어제에 이어 오늘도 커피 4000", "4000"],
  ["그제도 갔고 오늘 미용실 3만원", "30000"],
  ["어제도 오늘도 커피 4000", "4000|4000@07-14|?"],
  ["어제도 오늘도 내일도 커피 4000", "4000|?"],
  ["어제산 옷 오늘 환불 3만원", "30000"],
  ["어제시킨 치킨 오늘 왔어 2만원", "20000"],
  ["어제주문한 거 오늘 결제 3만원", "30000"],
  ["어제본 신발 오늘 샀어 5만원", "50000"],
  ["어제예약한 미용실 오늘 3만원", "30000"],
  ["어제빌린 돈 오늘 갚음 5만원", "50000"],
  ["어제커피 못 사서 오늘 커피 4000", "4000"],
  ["어제가 월급날이라 오늘 치킨 2만원", "20000"],
  ["어제가 마지막 할인이었는데 오늘 커피 5000", "5000"],
  ["커피 4000 어제도 마셨어", "4000"],
  ["커피 4000 어제도 마심", "4000"],
  ["택시 8000 어제도 탔어", "8000"],
  ["택시 8000 어제도 탔는데 또 탐", "8000"],
  ["점심 9000 어제도 먹었는데 또 먹음", "9000"],
  ["치킨 2만원 어제도 먹음 ㅠㅠ", "20000"],
  ["커피 4000 어제는 안 마심", "4000"],
  ["커피 4000 어제는 5000이었음", "4000|4000+5000"],
  ["점심 9000 어제보단 쌈", "9000"],
  ["점심 9000 어제보다는 쌈", "9000"],
  ["택시 8000 어제까지만 할인", "8000"],
  ["어제보단 싸게 점심 7000", "7000"],
  ["어제보다는 싸게 점심 7000", "7000"],
  ["어제보다도 비싼 커피 6000", "6000"],
  ["어제와는 다르게 점심 8000", "8000"],
  ["어제랑은 다르게 점심 8000", "8000"],
  ["어제까지는 5000이었는데 오늘 6000", "6000|5000+6000"],
  ["어제까지만 해도 커피 4000", "4000"],
  ["어제부터는 커피 5000", "5000"],
  ["어제까진 커피 4000", "4000"],
  ["어제부턴 커피 5000", "5000"],
  ["어제만큼은 커피 5000", "5000"],
  ["어제처럼은 못 먹어 점심 7000", "7000"],
  ["어제에 비해 싸게 점심 7000", "7000"],
  ["어제가 제일 더웠어 아이스크림 2000", "2000"],
  ["어제를 떠올리며 커피 4000", "4000"],
  ["어제까지가 할인이었는데 커피 5000", "5000"],
  ["어제로 끝난 세일 커피 5000", "5000"],
  ["내일도 쉬는 날 커피 4000", "4000"],
  ["내일도 출근이라 택시 8000", "8000"],
  ["내일도 비 온대서 우산 5000", "5000"],
  ["내일도 회의라 커피 4000", "4000"],
  ["내일도 일찍 나가야 해서 택시 8000", "8000"],
  ["내일엔 쉬니까 치킨 2만원", "20000"],
  ["내일만 버티자 커피 4000", "4000"],
  ["내일에 먹을 빵 3000", "3000"],
  ["택시 8000 내일도 타야함", "8000"],
  ["커피 4000 내일도 마실 듯", "4000"],
  ["주차 3000 내일도 여기", "3000"],
  ["점심 9000 내일도 여기서 먹자", "9000"],
  ["모레도 쉬어서 치킨 2만원", "20000"],
  ["모레엔 이사라 박스 3000", "3000"],
  ["내일모레도 시험이라 커피 4000", "4000"],
  ["커피 4000 모레도 마실 듯", "4000"],
  ["7월 3일은 쉬었고 7월 5일 커피 4000", "4000@07-05"],
  ["7월 3일에 못 사고 7월 5일 커피 4000", "4000@07-05"],
  ["7월 3일도 갔고 7월 5일 미용실 3만원", "30000@07-05"],
  ["3일에 못 사고 5일 커피 4000", "4000@07-05"],
  ["7/3에 못 사고 7/5 커피 4000", "4000@07-05"],
  ["25일에 월급 받고 26일 커피 4000", "4000@07-26|4000@06-26"],
  ["25일날 월급 받고 26일 커피 4000", "4000@07-26|4000@06-26"],
  ["이틀 전에 샀던 커피 오늘 또 4000", "4000"],
  ["어제\n커피 4000\n3일 주차 5000", "4000@07-14+5000@07-14"],
  ["어제 커피 4000\n3일 주차 5000", "4000@07-14+5000@07-14"],
  ["어제\n숙박 20만원\n2일 주차 1만원", "200000@07-14+10000@07-14"],
  ["어제\n렌트카 10만원\n2일 보험 3만원", "100000@07-14+30000@07-14"],
  ["어제 렌트 10만원\n5일 주차 3만원", "100000@07-14+30000@07-14"],
  ["어제 놀이공원 5만원\n1일 이용권 3만원", "50000@07-14+30000@07-14"],
  ["어제\n놀이공원\n1일 이용권 5만원", "50000@07-14"],
  ["오늘\n커피 4000\n1일 1식 도시락 9000", "4000+9000"],
  ["어제 커피 4000\n1일 1식 도시락 9000", "4000@07-14+9000@07-14"],
  ["오늘\n점심 9000\n2일 숙박 20만원", "9000+200000"],
  ["어제 약국 1만원\n3일 치 약값 9000", "10000@07-14+9000@07-14"],
  ["어제 약국\n3일 복용 약값 9000", "9000@07-14"],
  ["어제\n- 커피 4000\n- 3일 주차 5000", "4000@07-14+5000@07-14"],
  ["어제\n1. 커피 4000\n2. 3일 주차 5000", "4000@07-14+5000@07-14"],
  ["어제 지출\n커피 4000\n3일 주차 5000", "4000@07-14+5000@07-14"],
  ["7/3\n커피 4000\n1일 주차권 5000", "4000@07-03+5000@07-03"],
  ["오늘 커피 4000\n20일 렌트 5만원", "4000+50000"],
  ["6월 3일 커피 4000\n5일 택시 8000", "4000@06-03+8000@06-03|4000@06-03+8000@06-05"],
  ["지난달 3일 커피 4000\n5일 택시 8000", "4000@06-03+8000@06-03|4000@06-03+8000@06-05"],
  ["지난달 25일 월세 80만원\n1일 관리비 15만원", "800000@06-25+150000@06-25"],
  ["작년 12월 25일 케이크 3만원\n26일 커피 4000", "30000@12-25+4000@12-25"],
  ["10월 3일 커피 4000\n1일 패스 9000", "4000@10-03+9000@10-03"],
  ["6월 3일\n커피 4000\n5일\n택시 8000", "4000@06-03+8000@06-03|4000@06-03+8000@06-05"],
  ["6/3\n커피 4000\n5일 택시 8000", "4000@06-03+8000@06-03|4000@06-03+8000@06-05"],
  ["어제\n커피 4000\n오늘\n택시 8000", "4000@07-14+8000"],
  ["3일 커피 4000\n5일 택시 8000", "4000@07-03+8000@07-03"],
  ["3일\n커피 4000\n5일\n택시 8000", "4000@07-03+8000@07-03"],
  ["택시 8000\n1.5\n커피 3000", "8000+3000"],
  ["맥주\n3.5\n안주 5000", "5000"],
  ["호텔 20만원\n3일\n조식 2만원", "200000+20000"],
  ["1.5 원룸 월세 50만원", "?"],
  ["1.5 원룸 관리비 5만원", "?"],
  ["5.5 원두 2만원", "?"],
  ["3-4 원룸 월세 40만원", "?"],
  ["2.5 원어치 3000", "?"],
  ["1.5 원가 3000", "?"],
  ["7/3 원피스 3만원", "30000@07-03"],
  ["오피스텔 1204 월세 50만원", "500000"],
  ["원룸 1203 월세 45만원", "450000"],
  ["빌라 1002 월세 40만원", "400000"],
  ["101동 1204 월세 50만원", "500000"],
  ["상가 1001 월세 100만원", "1000000"],
  ["아파트 1503 월세 80만원", "800000"],
  ["우리집 1204 월세 50만원", "500000"],
  ["회원번호 1234 월회비 3만원", "30000"],
  ["회원 1234 월정액 9900원", "9900"],
  ["동호수 1402 월회비 3만원", "30000"],
  ["수강번호 1357 일반 강좌 3만원", "30000"],
  ["버스 1100 시내 1500원", "1500|?"],
  ["경기 1100 시외버스 3000원", "3000|?"],
  ["광역 9401 시내버스 2800원", "2800"],
  ["노선 9401 시외버스 5000원", "5000"],
  ["엔화 10000 일본 돈 9만원", "90000|?"],
  ["마일 3000 일본 항공권 30만원", "300000|?"],
  ["위스키 1990 일본 5만원", "50000"],
  ["직원 1200 명절 선물 300만원", "3000000|?"],
  ["가게 1004 일식집 회식 20만원", "200000"],
  ["쿠폰 1000 일회용품 5000", "5000|?"],
  ["명함 1000 명함집 5000", "5000|?"],
  ["노트북 1650 일반 쓰레기 봉투 3000", "3000"],
  ["1204 월세 50만원", "500000"],
  ["302 월세 50만원", "500000"],
  ["오피스텔 302 월세 50만원", "500000"],
  ["1000 명함 3만원", "30000|?"],
  ["1000 명함 제작 3만원", "30000|?"],
  ["500 시장 쿠폰 3000", "3000|?"],
  ["1990 일본 위스키 5만원", "50000"],
  ["직원 200 명절 선물 3만원", "30000|?"],
  ["토익 900 일본어 5만원", "50000|?"],
  ["5500버스 2800원", "2800"],
  ["9700버스 2800", "2800"],
  ["1100버스 1500원", "1500"],
  ["7000버스 2800원", "2800"],
  ["5000버스 3000", "3000"],
  ["2000버스 1500원", "1500"],
  ["1500버스 1500", "1500"],
  ["5500버스2800원", "2800"],
  ["광역 9700버스 2800원", "2800"],
  ["퇴근 7800버스 2800원", "2800"],
  ["3000맥주 2잔 6000", "6000"],
  ["5900피자 1판 5900원", "5900"],
  ["9900치킨 2마리 2만원", "20000"],
  ["1500커피 3000", "3000"],
  ["2000주차 3000", "3000"],
  ["1000맥주 2000", "2000"],
  ["5000마트 3000", "3000"],
  ["만1세 예방접종 3만원", "30000"],
  ["만5세 유치원비 20만원", "200000"],
  ["아기 만3개월 옷 3만원", "30000"],
  ["만18세 이상 입장료 5000", "5000"],
  ["만65세 교통비 5만원", "50000"],
  ["만6세 아이 키즈카페 1만원", "10000"],
  ["만7세 학원비 30만원", "300000"],
  ["만2살 아기 옷 2만원", "20000"],
  ["만1회 이용권 5000", "5000"],
  ["우리아기 만1세 돌잔치 50만원", "500000"],
  ["돌잔치 만1세 50만원", "500000"],
  ["만3세 보험료 5만원", "50000"],
  ["백1호 월세 30만원", "300000"],
  ["이마트 백1호점 3000원", "3000"],
  ["천5번 버스 1500", "1500"],
  ["백3호실 회비 3만원", "30000"],
  ["어제는 커피 4000", "4000@07-14"],
  ["오늘만 특가 5000", "5000"],
  ["편의점 1500커피 2개 3000", "3000"],
  ["오늘 3000맥주 2잔 6000", "6000"],
  ["어제\n1500커피 2잔 3000", "3000@07-14"],
  ["어제 지출\n9900치킨 2마리 2만원", "20000@07-14"],
  ["버스 1100 천호역 1500원", "1500"],
  ["구두 270 천연가죽 5만원", "50000"],
  ["토익 900 만점 목표 학원 30만원", "300000"],
  ["쿠폰 3000 만료 전에 커피 5000", "5000"],
  ["포인트 5000 만료됨", "?"],
  ["쿠폰 1000이랑 같이 썼어 커피 4000", "4000"],
  ["우유 500이랑 치즈 샀어 8000", "8000"],
  ["포인트 3000이랑 현금으로 커피 5000", "5000"],
  ["종이 백 10장 2000", "2000"],
  ["종이 백 5개 3000", "3000"],
  ["종이 백 5개 샀음", "?"],
  ["쇼핑 백 5개 3000", "3000"],
  ["1,000 명함 3만원", "?"],
  ["1,204 월세 50만원", "500000"],
  ["어제랑 똑같이 커피 4000", "4000"],
  ["어제하고 같은 메뉴 점심 9000", "9000"],
  ["그제랑 똑같이 커피 4000", "4000"],
  ["어제도 마셨는데 또 커피 4000", "4000"],
  ["어제는 참았는데 치킨 2만원", "20000"],
  ["어제는 못 샀고 아까 커피 4000", "4000"],
  ["어제는 못 샀고\n커피 4000", "4000"],
  ["어제는 못 산 빵 3000 오늘 샀어", "3000"],
  ["어제산 옷 3만원 오늘 환불", "30000"],
  ["오늘은 쉬고 커피 4000 어제 샀음", "4000@07-14"],
  ["어제는 못 샀는데..오늘 커피 4000", "4000"],
  ["어제도 마셨는데 (오늘) 또 커피 4000", "4000"],
  ["어제는 쉬었고 7.5 커피 4000", "4000@07-05"],
  ["어제는 못 갔고 말일 월세 50만원", "500000@07-31"],
  ["커피 오천 어제도 마셨어", "5000"],
  ["커피 사천오백 어제도 마셨어", "4500"],
  ["커피 4000 어제도 마셨어, 택시 8000", "4000+8000"],
  ["커피 4000 어제도 마심 택시 8000", "4000+8000"],
  ["어제는 1만보 걸었고 오늘 커피 4000", "4000"],
  ["커피 4000 어제도 1만보 걸음", "4000"],
  ["내일모레 시험이라 커피 4000", "4000"],
  ["커피 4000 내일모레 또 마실 듯", "4000"],
  ["점심 9000 내일모레 회식", "9000"],
  ["커피 4000 이틀 전에도 마셨어", "4000"],
  ["일주일 전에 산 옷 환불 3만원", "30000"],
  ["이틀 후에 갚기로 하고 친구한테 5만원 빌려줌", "50000"],
  ["한달 후에 갚는다고 5만원 빌려감", "50000"],
  ["3일에 걸친 공사비 30만원", "300000"],
  ["3일에 한 통 쓰는 샴푸 9000", "9000"],
  ["1일에 만원씩 저금", "10000"],
  ["5일에 갚을 돈 5만원 빌림", "50000"],
  ["5일 약국 1만원\n3일 치 약값 9000", "10000@07-05+9000@07-05"],
  ["3일 커피 4000\n1일 1식 도시락 9000", "4000@07-03+9000@07-03"],
  ["10일 점심 9000\n3일 연속 커피 4000", "9000@07-10+4000@07-10"],
  ["10일 놀이공원 5만원\n1일 이용권 3만원", "50000@07-10+30000@07-10"],
  ["5일 호텔 20만원, 2일 주차 1만원", "200000@07-05+10000@07-05"],
  ["2. 3 시간 주차 6000", "6000"],
  ["1. 3 킬로 고기 2만원", "20000"],
  ["2. 5 킬로 쌀 3만원", "30000"],
  ["1. 커피 4000\n2. 3 시간 주차 6000", "4000+6000"],
  ["어제는 바빴음\n오늘 커피 4000\n택시 8000", "4000+8000"],
  ["어제는\n커피 4000\n오늘은\n택시 8000", "4000@07-14+8000"],
  ["어제 커피 4000\n오늘은\n택시 8000", "4000@07-14+8000"],
  ["1204 월세 냈음", "?"],
  ["회원번호 1234 월회비 납부", "?"],
  ["토익 900 일본어 공부함", "?"],
  ["어제에 이은 회식 5만원", "50000"],
  ["어제는 어제고 치킨 2만원", "20000"],
  ["오늘 말고 내일 갈 거라 커피 4000", "4000"],
  ["1/2에 샀어 3000", "?"],
  ["7/3에 제주 커피 4000", "?"],
  ["7/3에 저녁 치킨 20000", "?"],
  ["어제만 해도 커피 5000", "5000"],
  ["오늘만은 커피 4000", "4000"],
  ["커피 4000 오늘만 특가", "4000"],
  ["어제도 커피 4500", "4500@07-14"],
  ["어제커피 4000", "4000@07-14"],
  ["어제는 커피 4000, 오늘은 택시 8000", "4000@07-14+8000"],
  ["어제는 커피 4000 오늘은 택시 8000", "4000@07-14+8000"],
  ["커피 4000 어제는 택시 8000", "4000+8000@07-14"],
  ["어제 커피 4000 오늘은 택시 8000", "4000@07-14+8000"],
  ["어제저녁은 치킨 2만원", "20000@07-14"],
  ["어제저녁에 치킨 2만원", "20000@07-14"],
  ["7월 3일은 커피 4000", "4000@07-03"],
  ["7월 3일에 커피 4000", "4000@07-03"],
  ["커피 4000 7월 3일에 샀어", "?"],
  ["3일에 커피 4000", "4000@07-03"],
  ["이틀 전에 커피 4000", "4000@07-13"],
  ["다낭 3박 5일 패키지 90만원", "900000"],
  ["호텔 1박 3일 결제 12만원", "120000@07-03"],
  ["택시 만5000원", "?"],
  ["커튼 천3만원", "?"],
  ["명품 백30만원", "?"],
  ["택시 천500원", "?"],
  ["택시 만5천원", "15000"],
  ["버스 천5백원", "1500"],
  ["월세 5000", "5000"],
  ["5000 월세", "5000"],
  ["3만 영화", "30000"],
  ["소주 4000 테라 5000", "?"],
  ["커피 4000 월세 5000", "?"],
  ["3000 천안 호두과자", "3000"],
  ["김밥 3000커피 4000", "4000"],
  ["점심 9000커피 4000", "9000+4000"],
];

const parseCases = [
  // Q-65 목록 표식 뒤의 점 금액·소수·단위. 뒤 두 칸이 달력이면 날짜다. 앞 칸이 4 이상이면 달로 읽는다.
  ["1. 1.5만원 커피", [[15000, "커피", TODAY]]], ["1. 12.500원 점심", [[12500, "점심", TODAY]]], ["1. 1.200.000원 월세", [[1200000, "월세", TODAY]]], ["1. 5 만원 커피", [[50000, "커피", TODAY]]], ["2. 3 천원 사탕", [[3000, "사탕", TODAY]]], ["3. 5 천원 커피", [[5000, "커피", TODAY]]], ["2. 3 만원 회비", [[30000, "회비", TODAY]]],
  ["1. 4.500원 커피\n2. 12.500원 점심", [[4500, "커피", TODAY], [12500, "점심", TODAY]]], ["1. 12.000원 점심\n2. 3.500원 커피", [[12000, "점심", TODAY], [3500, "커피", TODAY]]],
  ["1. 7.14 커피 4000", [[4000, "커피", "2026-07-14"]]], ["2. 10. 31 커피 4000", [[4000, "커피", "2026-10-31"]]], ["1. 2 인분 치킨 20000", [[20000, "2 인분 치킨", TODAY]]],
  // 줄머리의 ‘7. 3 백만원’ 은 운영과 같이 목록 번호 뒤의 금액이다. 날 뒤에 점이 있거나 앞에 연도·표식·쉼표가 있으면 날짜다.
  ["7. 3 백만원 물", [[3000000, "물", TODAY]]], ["4. 5 만원 커피", [[50000, "커피", TODAY]]], ["12. 25 천원 커피", [[25000, "커피", TODAY]]], ["7. 3. 만원 주유", [[10000, "주유", "2026-07-03"]]], ["- 7. 3 만원 주유", [[10000, "주유", "2026-07-03"]]], ["2026. 7. 3 만원 주유", [[10000, "주유", "2026-07-03"]]], ["커피 4000, 7. 3 만원 주유", [[4000, "커피", TODAY], [10000, "주유", "2026-07-03"]]],
  // 세 칸은 뒤에 금액 단위가 오거나 둘째 칸이 달이 못 되면 앞 두 칸이 날짜다. 줄 안 번호 목록의 날짜는 접는다.
  ["1. 5. 3 만원 약국", [[30000, "약국", "2026-01-05"]]], ["7. 3. 1 만 2 천 원 택시", [[12000, "택시", "2026-07-03"]]], ["10. 31. 3 만원 19:30 영화", [[30000, "영화", "2026-10-31"]]], ["10. 31. 3 커피 4000", []], ["1. 7. 3 커피 4000", [[4000, "커피", "2026-07-03"]]], ["2. 7. 3 5000원 커피", []], ["13. 5. 3 만원 커피", [[10000, "커피", "2026-05-03"]]],
  ["1. 커피 4000 2. 12. 25 점심 9000", [[4000, "커피", TODAY], [9000, "점심", "2026-12-25"]]], ["1. 홍삼 천 원 2. 12. 25 라디오 만원", [[1000, "홍삼", TODAY], [10000, "라디오", "2026-12-25"]]], ["1) 커피 4000 2) 12. 25 점심 9000", [[4000, "커피", TODAY], [9000, "점심", "2026-12-25"]]],
  // Q-74 금액 뒤 낱말의 첫 글자는 단위가 아니다. 조사가 붙거나 떨어져 있으면 단위다. 두 자리 이하는 수량이라 짐작하지 않는다.
  ["커피 5000 만두 3000", [[5000, "커피", TODAY], [3000, "만두", TODAY]]], ["제육 9000 백반 8000", [[9000, "제육", TODAY], [8000, "백반", TODAY]]], ["우유 3000 천도복숭아 5000", [[5000, "우유 3000 천도복숭아", TODAY]]], ["택시 8000 백화점 30000", [[8000, "택시", TODAY], [30000, "백화점", TODAY]]], ["떡볶이 4000 만두 3000 튀김 2000", [[4000, "떡볶이", TODAY], [3000, "만두", TODAY], [2000, "튀김", TODAY]]],
  ["5000 만두", [[5000, "만두", TODAY]]], ["12000 백반", [[12000, "백반", TODAY]]], ["3000 천안 호두과자", [[3000, "천안 호두과자", TODAY]]], ["2000 만화카페", [[2000, "만화카페", TODAY]]], ["12000 십자수", [[12000, "십자수", TODAY]]], ["2000 천일염", [[2000, "천일염", TODAY]]], ["3,000 만두", [[3000, "만두", TODAY]]],
  ["3만 영화", [[30000, "영화", TODAY]]], ["3만 공과금", [[30000, "공과금", TODAY]]], ["3만 삼천리 자전거", []], ["3만 만두", [[30000, "만두", TODAY]]], ["1.5만 백반", [[15000, "백반", TODAY]]], ["3만 천안 기차", [[30000, "천안 기차", TODAY]]], ["2천 만두", [[2000, "만두", TODAY]]], ["3만 천 커피", [[31000, "커피", TODAY]]], ["3만 천원 커피", [[31000, "커피", TODAY]]],
  ["5000 월세", [[5000, "월세", TODAY]]], ["500000 월세", [[500000, "월세", TODAY]]], ["5000 일식", [[5000, "일식", TODAY]]], ["4000 분식", [[4000, "분식", TODAY]]], ["3000 시장", [[3000, "시장", TODAY]]], ["2000 명란", [[2000, "명란", TODAY]]], ["1,500 분유", [[1500, "분유", TODAY]]], ["커피 4000 월세 5000", []], ["지하철 1500 시장 3000", []],
  ["2025 년 커피 5000", [[5000, "2025 년 커피", TODAY]]], ["300 일치 약 5000", [[5000, "300 일치 약", TODAY]]], ["100 일 기념 5000", [[5000, "100 일 기념", TODAY]]],
  ["2026 월급 300만원", [[3000000, "2026 월급", TODAY]]], ["2030 월세 50만원", [[500000, "2030 월세", TODAY]]], ["2000 분식", [[2000, "분식", TODAY]]],
  // Q-77 떨어진 ‘원’ 뒤에 낱말이 이어지면 낱말의 첫 글자다. 조사·끝맺음이 이어지면 원이다.
  ["12000 원두", [[12000, "원두", TODAY]]], ["30000 원피스", [[30000, "원피스", TODAY]]], ["커피 4000 원두 12000", [[4000, "커피", TODAY], [12000, "원두", TODAY]]], ["20000 원데이클래스", [[20000, "원데이클래스", TODAY]]],
  ["5000 원 커피", [[5000, "커피", TODAY]]], ["5000 원에 커피", [[5000, "커피", TODAY]]], ["5000 원짜리 커피", [[5000, "커피", TODAY]]],
  ["택시 3만 오천이요", []], ["택시 3만 오천정도", []], ["5000 만이요", []], ["5000 만두요", [[5000, "만두요", TODAY]]], ["택시 3만 오천이에요", []], ["택시 3만 오천이상", []], ["택시 3만 오천만큼", []], ["택시 3만 오천원이요", [[35000, "택시", TODAY]]],
  ["5000 만 커피", [[50000000, "커피", TODAY]]], ["5000 백", [[500000, "기타지출", TODAY]]], ["커피 5000 만", [[50000000, "커피", TODAY]]], ["5000 만원 노트북", [[50000000, "노트북", TODAY]]], ["300 만원 월세", [[3000000, "월세", TODAY]]], ["5 만두", []], ["5 만두 3000", [[3000, "5 만두", TODAY]]],
  // Q-76 금액으로 시작해 낱말로 끝나는 줄은 금액 앞에서 나눈다. 숫자로 끝나면 예전대로다.
  ["4000 커피 5000 라면", [[4000, "커피", TODAY], [5000, "라면", TODAY]]], ["5000원 커피 3000원 라면", [[5000, "커피", TODAY], [3000, "라면", TODAY]]], ["3만원 점심 2만원 저녁", [[30000, "점심", TODAY], [20000, "저녁", TODAY]]], ["어제 4000 커피 5000 라면", [[4000, "커피", "2026-07-14"], [5000, "라면", "2026-07-14"]]], ["7/3 4000 커피 5000 라면", [[4000, "커피", "2026-07-03"], [5000, "라면", "2026-07-03"]]], ["5000 커피 4000", [[5000, "기타지출", TODAY], [4000, "커피", TODAY]]], ["커피 4000 라면 5000", [[4000, "커피", TODAY], [5000, "라면", TODAY]]], ["4000 커피 5000 일식", []],
  // Q-66 수량은 값이 아니다.
  ["우유 1000미리 2800", [[2800, "우유 1000미리", TODAY]]], ["퍼즐 1000피스 12000", [[12000, "퍼즐 1000피스", TODAY]]], ["환전 1000달러 130만원", [[1300000, "환전 1000달러", TODAY]]], ["주유 50000어치 49000", [[49000, "주유 50000어치", TODAY]]], ["5000포인트 3000", [[3000, "5000포인트", TODAY]]], ["2026-07-15 우유 1000미리 2500", [[2500, "우유 1000미리", TODAY]]], ["상품권 10000짜리 9000", [[9000, "상품권 10000짜리", TODAY]]], ["티켓 5000짜리 4500", [[4500, "티켓 5000짜리", TODAY]]], ["상품권 10000원짜리 9000", [[9000, "상품권 10000원짜리", TODAY]]], ["만원짜리 상품권 9000", [[9000, "만원짜리 상품권", TODAY]]], ["주유 5만원어치 49000", [[49000, "주유 5만원어치", TODAY]]],
  // Q-67 기간은 날짜가 아니다. 줄머리의 ‘3일에’ 는 날짜다.
  ["구독 30일에 9900원", [[9900, "구독 30일에", TODAY]]], ["헬스 주 3일에 5만원", [[50000, "헬스 주 3일에", TODAY]]], ["제주도 2박 3일에 50만원", [[500000, "제주도 2박 3일에", TODAY]]], ["주차 3일에 5만원", [[50000, "주차 3일에", TODAY]]], ["이용권 7일에 15000", [[15000, "이용권 7일에", TODAY]]], ["렌트카 2일에 10만원", [[100000, "렌트카 2일에", TODAY]]], ["3일에 만원 커피", [[10000, "3일에 커피", TODAY]]], ["1/2에 커피 5000원", []],
  // 문장 가운데의 버전·규격은 다른 해의 기록이 되지 않는다.
  ["버전 23.1.2 구독 5000", []], ["쿠폰 22-1-5 5000원", []], ["비료 20-10-10 30000", []], ["앱 25.3.1 업데이트 1100", []], ["모델 24-5-11 부품 3000", []],
  // Q-68 소수 수량
  ["치킨 1.5마리 30000", [[30000, "치킨 1.5마리", TODAY]]], ["삼겹살 1.5근 20000", [[20000, "삼겹살 1.5근", TODAY]]],
  // Q-78 어치·짜리 금액은 다음 금액이 그 값일 때만 뺀다. 낱말 사이에 있거나 마지막이면 금액이다.
  ["커피 4000 주유 5만원어치", [[4000, "커피", TODAY], [50000, "주유", TODAY]]], ["주유 5만원어치 커피 4000", [[50000, "주유", TODAY], [4000, "커피", TODAY]]], ["택시 8000원 쌀 2만원어치", [[8000, "택시", TODAY], [20000, "쌀", TODAY]]],
  ["5만원어치 주유 커피 4000", [[50000, "기타지출", TODAY], [4000, "주유 커피", TODAY]]], ["3만원짜리 티셔츠 바지 5만원", [[30000, "기타지출", TODAY], [50000, "티셔츠 바지", TODAY]]],
  ["커피 5000원짜리 라떼 6000원", [[5000, "커피", TODAY], [6000, "라떼", TODAY]]], ["5000원짜리 커피 3000원짜리 빵", [[5000, "커피", TODAY], [3000, "빵", TODAY]]], ["주유 5만원어치", [[50000, "주유", TODAY]]], ["주유 5만원어치, 커피 4000", [[50000, "주유", TODAY], [4000, "커피", TODAY]]],
  ["상품권 10000원짜리 9000", [[9000, "상품권 10000원짜리", TODAY]]], ["주유 5만원어치 49000", [[49000, "주유 5만원어치", TODAY]]], ["만원짜리 상품권 9000", [[9000, "만원짜리 상품권", TODAY]]], ["1000원짜리 3개 3000원", [[3000, "1000원짜리 3개", TODAY]]],
  // Q-81 금액 뒤 끝맺음. 단위가 있거나 세 자리 이상일 때만 금액이다.
  ["커피 4000이랑 택시 8000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000 이랑 택시 8000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["택시 3만이랑 커피 4000", [[30000, "택시", TODAY], [4000, "커피", TODAY]]], ["택시 3만이", [[30000, "택시", TODAY]]], ["택시 3만이 나왔어", [[30000, "택시 나왔어", TODAY]]], ["택시 3만이천", [[32000, "택시", TODAY]]],
  ["택시 5000이요", []], ["택시 오천쯤", []], ["택시 만원이요", []], ["택시 5000원이요", [[5000, "택시", TODAY]]], ["택시 5000임", []], ["택시 5000 쯤", [[5000, "택시", TODAY]]], ["택시 오천이요", []],
  ["택시 삼만 오천쯤", []], ["택시 삼만 오천이요", []], ["택시 만 오천쯤", []],
  ["명품 백에 3만원", [[30000, "명품 백에", TODAY]]], ["커튼 천에 300원", [[300, "커튼 천에", TODAY]]], ["오랜만에 커피 4000", [[4000, "오랜만에 커피", TODAY]]], ["택시 천요", []], ["택시 만쯤", []],
  // 원 없는 금액의 끝맺음은 저장하지 않고 다시 묻는다. 번호·측정값·설명과 글로는 가릴 수 없다.
  ["커피 4000이요 택시 8000이요", []], ["커피 4000임 택시 8000임", []], ["커피 4000에 택시 8000에", []], ["커피 4000쯤 택시 8000쯤", []], ["점심 1만2천이요 저녁 2만이요", []], ["커피 사천이요 택시 팔천이요", []], ["점심 만원이요 저녁 이만원이요", []],
  ["제 키는 170입니다", []], ["비밀번호 1234요", []], ["인증번호 123456입니다", []], ["올해는 2026임", []], ["신발 사이즈 270입니다", []], ["고향 이천입니다", []], ["저는 오십이요", []], ["숙소 구천이요", []],
  ["택시 8천~9천쯤", []], ["주유 5만~6만쯤", []], ["택시 8000이나 9000쯤", []], ["주유 5만에서 6만쯤", []],
  // 숫자 앞의 부호는 뒤 말과 상관없이 줄 전체를 다시 묻는다.
  ["아파트 101-302호 관리비 15만원", []], ["관리비 101-302호 15만원", []], ["택배비 3000 101-302호", []], ["사건 2026-123호 수임료 50만원", []], ["100-200개 5만원", []], ["주문 123-456호 커피 5000원", []],
  // 붙여 쓴 가격은 일상 품목만 읽는다. 그 밖의 낱말은 앞 수가 값이 아니다.
  ["정가 10000인데 7000원", [[7000, "정가 10000인데", TODAY]]], ["원래 5000인데 3000에 샀어", []], ["커피 2000할인 3000", [[3000, "커피 2000할인", TODAY]]], ["택시 5000환불 3000", [[3000, "택시 5000환불", TODAY]]], ["환전 1000파운드 180만원", [[1800000, "환전 1000파운드", TODAY]]], ["1200호실 3만원", [[30000, "1200호실", TODAY]]], ["맥주 1000씨씨 5000", [[5000, "맥주 1000씨씨", TODAY]]],
  ["커피 5000택시 8000", [[5000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 5000택시비 8000", [[5000, "커피", TODAY], [8000, "택시비", TODAY]]], ["점심 10000저녁 15000", [[10000, "점심", TODAY], [15000, "저녁", TODAY]]],
  // Q-82 천 미만의 수가 뒤따르는데 잇지 못하면 앞 금액을 없애지 않고 줄 전체를 다시 묻는다.
  ["버스 천 5백 냈어", []], ["우유 천 8백 샀어", []], ["버스 천 500원에 탔어", []], ["버스 천 500원.", []], ["라면 백 5십 샀어", []], ["버스 천 50", []], ["버스 천 오백원", [[1500, "버스", TODAY]]], ["보증금 천 5백만 입금", []], ["대출 천 2백만 받음", []], ["월급 백 5십만 받음", []], ["급여 백 5십만 입금", []], ["에코 백 500원", []],
  ["커튼 천 5000원", [[5000, "커튼 천", TODAY]]], ["커튼 천 5천원", [[5000, "커튼 천", TODAY]]], ["커튼 천 5,000원", [[5000, "커튼 천", TODAY]]], ["커튼 천 3개 5000원", [[5000, "커튼 천 3개", TODAY]]], ["명품 백 300만원", [[3000000, "명품 백", TODAY]]], ["월세 백 20만원", [[200000, "월세 백", TODAY]]], ["구두 백 5천만원", [[50000000, "구두 백", TODAY]]],
  // Q-75 뒤에 낱말이 이어지기만 해서는 풀지 않는다. 표의 일상 품목만 금액이다.
  ["토익 800 시험 봤어", []], ["1000 일기념일이야", []], ["100 일잔치 떡 30만원", [[300000, "100 일잔치 떡", TODAY]]], ["BMW 520 시승 3만원", [[30000, "BMW 520 시승", TODAY]]], ["성수동 123 번지 택배 5000원", [[5000, "성수동 123 번지 택배", TODAY]]], ["1990 년생 모임 3만원", [[30000, "1990 년생 모임", TODAY]]], ["500 명분 도시락 200만원", [[2000000, "500 명분 도시락", TODAY]]], ["벤츠 300 시리즈 주유 5만원", [[50000, "벤츠 300 시리즈 주유", TODAY]]],
  ["5000 일반 쓰레기봉투", []], ["5000 월급 들어옴", []], ["30000 명절 선물", []], ["12000 시계줄", [[12000, "시계줄", TODAY]]],
  // Q-78 앞에 낱말이 없어도 다음 금액 뒤에 낱말이 있으면 다른 물건이다.
  ["만원어치 주유 8000원 택시", [[10000, "주유", TODAY], [8000, "택시", TODAY]]], ["3만원어치 장봄 8000원 택시", [[30000, "장봄", TODAY], [8000, "택시", TODAY]]], ["5000원짜리 라면 4000원 김밥", [[5000, "라면", TODAY], [4000, "김밥", TODAY]]], ["3000원짜리 볼펜 1000원 지우개", [[3000, "볼펜", TODAY], [1000, "지우개", TODAY]]],
  ["3만원짜리 옷 2만원에 샀어", [[20000, "3만원짜리 옷", TODAY]]], ["3만원짜리 옷 2만원 주고 삼", [[20000, "3만원짜리 옷 주고", TODAY]]], ["3만원짜리 옷 2만원에 구매", [[20000, "3만원짜리 옷", TODAY]]], ["만원짜리 상품권 9000", [[9000, "만원짜리 상품권", TODAY]]],
  // 띄어 쓴 ‘30000 어치’ 도 금액이다.
  ["주유 30000 어치", [[30000, "주유", TODAY]]], ["5000 짜리 커피", [[5000, "커피", TODAY]]], ["커피 5000 짜리", [[5000, "커피", TODAY]]], ["3000 짜리 라면", [[3000, "라면", TODAY]]], ["상품권 10000 짜리 9000", [[9000, "상품권 10000", TODAY]]],
  // Q-93 앞 금액이 조용히 사라지거나 틀리는 꼴은 다시 묻는다.
  ["커피 오천원이고 택시 3만원", []], ["커피 천오백원과 택시 3만원", []], ["커피 사천원쯤 택시 오천원", []], ["커피 오천원이요 택시 사천원", []], ["택시 오천원이요", []],
  ["차 1억 2천", []], ["차 2억 5000", []], ["차 1억5천", []], ["전세 1억 5000원", []], ["차 1억 2천만원", [[120000000, "차", TODAY]]], ["전세 2억", [[200000000, "전세", TODAY]]], ["전세 3억 5천만", [[350000000, "전세", TODAY]]],
  ["5500-1번 버스 2800원", []], ["1100-1번 버스 1500원", []], ["123-45번지 택배 3000원", []], ["A300-1 5000원", []], ["2026-03-05 커피 4000", [[4000, "커피", "2026-03-05"]]], ["010-1234-5678 택배 3000원", [[3000, "010-1234-5678 택배", TODAY]]],
  // 첫 조각이 날짜뿐이면 머리 날짜 꼴이다. 뒤의 날짜 조각을 앞 건에 붙이지 않는다.
  ["어제, 커피 4000, 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", "2026-07-14"]]], ["어제, 커피 4000, 오늘, 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]], ["7월 3일, 커피 4000, 7월 4일, 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-04"]]], ["커피 4000, 어제, 택시 8000, 오늘", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]],
  // 쉼표 뒤 날짜는 금액과 이어 붙어도 날짜다(표의 요일 말).
  ["택시 8000, 월요일", [[8000, "택시", "2026-07-13"]]], ["택시 8000, 일요일", [[8000, "택시", "2026-07-12"]]], ["택시 8000, 일주일 전", [[8000, "택시", "2026-07-08"]]], ["택시 8000, 화요일", [[8000, "택시", "2026-07-14"]]],
  // 날짜 조사 바로 뒤에 금액이 오면 기간과 가릴 수 없다(운영과 같다).
  ["3일에 15만원 렌트", [[150000, "3일에 렌트", TODAY]]], ["3일에 커피 4000", [[4000, "커피", "2026-07-03"]]], ["10/31에 커피 4000", [[4000, "커피", "2026-10-31"]]],
  // 문장 가운데의 끝맺음 앞 수는 금액이 아니다. 뒤 금액 한 건이다(운영과 같다).
  ["커피 4000에 빵 3000", [[3000, "커피 4000에 빵", TODAY]]], ["커피 4000이고 택시 8000", [[8000, "커피 4000이고 택시", TODAY]]], ["전세 3억에 이사비 80만원", [[800000, "전세 3억에 이사비", TODAY]]], ["개당 1000에 3개 3000원", [[3000, "개당 1000에 3개", TODAY]]], ["보증금 1000에 월세 50만원", [[500000, "보증금 1000에 월세", TODAY]]], ["정가 10000이고 할인가 7000원", [[7000, "정가 10000이고 할인가", TODAY]]],
  ["시급 10000이고 8시간 80000원", [[80000, "시급 10000이고 8시간", TODAY]]], ["원래 5000이고 3000에 샀어", []], ["커피 4000+500에 샷추가", []], ["101-302에 택배비 3000", []], ["1000+500에 커피 4000", []], ["할인 -500에 커피 4000", []], ["5000 - 500에 커피 샀어", []], ["벤츠 E-300에 주유 5만원", [[50000, "벤츠 E-300에 주유", TODAY]]],
  ["택시 삼만 오천 쯤", [[35000, "택시", TODAY]]], ["택시 삼만 오천 정도", [[35000, "택시", TODAY]]], ["아이 백 명 간식 30만원", [[300000, "아이 백 명 간식", TODAY]]],
  ["환율 1320.5에 환전 100만원", [[1000000, "환율 13 환전", TODAY]]], ["환전 100만원 환율 1320.5에", [[1000000, "환전 환율 13", TODAY]]],
  ["천만에", []], ["천만이요", []], ["백만이요", []], ["이만요", []], ["이만이요", []], ["오늘은 이만요", []], ["수고하셨습니다 이만요", []], ["이만이고 뭐고", []], ["백일만에 먹은 치킨", []], ["이천에 다녀옴", []], ["3000에 산 우산", []], ["택시 오천에 갔어", []],
  ["택시 50에", []], ["밥 300이나 먹음", []], ["커피 2잔 5000씩", []],
  // Q-82 ‘천’ 뒤의 세 자리 아래 수는 한 금액이다. 네 자리부터는 ‘천’ 이 옷감이다.
  ["버스 천 500원", [[1500, "버스", TODAY]]], ["커피 천 500원", [[1500, "커피", TODAY]]], ["천 500원", [[1500, "기타지출", TODAY]]], ["버스 천 50원", [[1050, "버스", TODAY]]], ["커튼 천 5000원", [[5000, "커튼 천", TODAY]]], ["커튼 천 1000", [[1000, "커튼 천", TODAY]]], ["명품 백 300만원", [[3000000, "명품 백", TODAY]]], ["버스 천 500이요", []], ["천 500 버스", [[1500, "버스", TODAY]]], ["종이 천 500 매 3000원", [[3000, "종이 천 500 매", TODAY]]], ["버스 천 500 카드", [[1500, "버스", TODAY]]],
  ["종이 천 장 3000원", [[3000, "종이 천 장", TODAY]]], ["고양이 백 마리 사료 3만원", [[30000, "고양이 백 마리 사료", TODAY]]], ["명함 천 장 3만원", [[30000, "명함 천 장", TODAY]]], ["커피 백 잔 30만원", [[300000, "커피 백 잔", TODAY]]],
  // Q-85 쉼표 뒤의 날짜. 줄이 다르면 잇지 않는다.
  ["커피 4000, 어제", [[4000, "커피", "2026-07-14"]]], ["커피 4000, 7월 3일", [[4000, "커피", "2026-07-03"]]], ["커피 4000, 택시 8000, 어제", [[4000, "커피", "2026-07-14"], [8000, "택시", "2026-07-14"]]], ["커피 4000 / 어제", [[4000, "커피", "2026-07-14"]]], ["월세 50만원, 25일", [[500000, "월세", TODAY]]], ["택시 8000, 26. 3. 5", [[8000, "택시", "2026-03-05"]]], ["택시 8000, 2026.3.5", [[8000, "택시", "2026-03-05"]]], ["택시 8000, 2026-03-05", [[8000, "택시", "2026-03-05"]]], ["택시 8000, 2026년 3월 5일", [[8000, "택시", "2026-03-05"]]], ["숙박 20만원, 2일", [[200000, "숙박", TODAY]]], ["콜라 2000, 1.5", [[2000, "콜라", TODAY]]], ["쿠폰 1000, 1/2", [[1000, "쿠폰", TODAY]]], ["헬스 30만원, 90일", [[300000, "헬스", TODAY]]], ["커피 4000, 지난주 금요일", [[4000, "커피", "2026-07-10"]]], ["커피 4000, 어제, 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]],
  ["어제, 커피 4000", [[4000, "커피", "2026-07-14"]]], ["커피 4000\n어제\n택시 8000", [[4000, "커피", TODAY], [8000, "택시", "2026-07-14"]]],
  // Q-86 기간·수량·‘말고’
  ["3일 전에 커피 4000", [[4000, "커피", "2026-07-12"]]], ["이틀 전에 커피 4000", [[4000, "커피", "2026-07-13"]]], ["일주일 전에 커피 4000", [[4000, "커피", "2026-07-08"]]], ["하루 전엔 커피 4000", [[4000, "커피", "2026-07-14"]]], ["점심 전에 커피 4000", [[4000, "점심 전에 커피", TODAY]]],
  ["제주도 2박 3일 50만원", [[500000, "제주도 2박3일", TODAY]]], ["콜라 1.5 리터 2000", [[2000, "콜라 1.5리터", TODAY]]], ["맥주 1.6 L 5000", [[5000, "맥주 1.6L", TODAY]]], ["소고기 1.5 근 3만원", [[30000, "소고기 1.5근", TODAY]]], ["쌀 3.5 kg 1만원", [[10000, "쌀 3.5kg", TODAY]]], ["무박 2일 등산 3만원", [[30000, "무박2일 등산", TODAY]]], ["호텔 1박 10일 12만원", [[120000, "호텔 1박", "2026-07-10"]]], ["유럽 10박 11일 500만원", [[5000000, "유럽 10박11일", TODAY]]], ["펜션 1박 3일 전 20만원", [[200000, "펜션 1박", "2026-07-12"]]], ["호텔 2박 10일 결제 30만원", [[300000, "호텔 2박", "2026-07-10"]]], ["오늘 말고 어제 커피 5000", [[5000, "커피", "2026-07-14"]]], ["어제 말고 오늘 커피 5000", [[5000, "커피", TODAY]]], ["오늘 말고 내일 말고 커피 5000", [[5000, "말고 말고 커피", TODAY]]],
  // Q-87 합이 정확히 맞는 끝말은 한 건이 아니다.
  ["커피 4000 택시 8000 총 12000원", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000, 택시 8000 합계 12000원", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000\n택시 8000\n합계 12000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]],
  // Q-96 일상어이기도 한 단위 앞의 수: 혼자면 금액, 다른 금액이 있으면 어느 쪽인지 몰라 다시 묻는다.
  ["소주 4000 테라 5000", []], ["맥주 5000 코인 노래방 3000", []], ["점심 9000 메가 커피 2000", []], ["회비 30000 미리 냄 커피 4000", []], ["커피 4000 회비 30000 미리 냄", []], ["커피 5000 포인트 3000", []], ["우유 500 미리 1800원", []], ["환전 1000 달러 130만원", []], ["맥북 14 프로 250만원", []],
  ["회비 30000 미리 냄", [[30000, "회비 미리", TODAY]]], ["5000 코인 노래방", [[5000, "코인 노래방", TODAY]]], ["20000 테라 맥주", [[20000, "테라 맥주", TODAY]]], ["5000 메가 커피", [[5000, "메가 커피", TODAY]]], ["커피 5000 메가", [[5000, "커피 메가", TODAY]]], ["호텔 100000 미리 결제", [[100000, "호텔 미리", TODAY]]], ["커피 4000, 회비 30000 미리 냄", [[4000, "커피", TODAY], [30000, "회비 미리", TODAY]]],
  // Q-97 ‘3만 오천나옴’ 의 뒤 수를 낱말로 보면 앞 수만 저장된다. 낱말의 첫 글자로 볼 수 있을 때만 푼다.
  ["택시 3만 오천나옴", []], ["식비 2만 삼천들었어", []], ["커피 3천 오백나옴", []], ["월세 50만 오천인가", []], ["택시 3만 오천이고 커피 4000", []], ["택시 3만 구천나옴", []], ["택시 3만 오백이네", []], ["2000 천일염", [[2000, "천일염", TODAY]]], ["커피 5000 만두 3000", [[5000, "커피", TODAY], [3000, "만두", TODAY]]],
  // Q-98 뒤 단위가 작을 때만 한 덩이다. 낱말 속 단위는 낱말이고, 낱말 밖 단위 뒤에 숫자가 붙으면 다시 묻는다.
  ["에코백3만원", [[30000, "에코백", TODAY]]], ["숄더백30만원", [[300000, "숄더백", TODAY]]], ["인천3만원", [[30000, "인천", TODAY]]], ["인천5백원", [[500, "인천", TODAY]]], ["택시 만5천원", [[15000, "택시", TODAY]]], ["택시 천5백원", [[1500, "택시", TODAY]]],
  ["커튼 천3만원", []], ["명품 백30만원", []], ["가방 백5천원", []], ["택시 만5000원", []], ["택시 만5000", []], ["택시 천500원", []], ["버스 천250원", []], ["택시 이만5000원", []], ["택시 삼천500원", []],
  // Q-99 표 낱말 앞의 수는 앞에 낱말이 있고 값이 금액 꼴일 때만 다른 금액과 함께 금액이다.
  ["300 시내버스 1500원", []], ["700 시내버스 1500", []], ["500 명함 2만원", []], ["1988 일식 3만원", [[30000, "1988 일식", TODAY]]], ["100 일회용 컵 8000", []], ["보증금 500 월세 50", []], ["보증금 1000 월세 60", []], ["5000 월세 3월 2일 3000 커피", []], ["500000 월세", [[500000, "월세", TODAY]]], ["4000 분식", [[4000, "분식", TODAY]]],
  // Q-100 날짜 뒤의 ‘원…’ 낱말. 날짜가 사라져 오늘이 됐다.
  ["7/3 원피스 3만원", [[30000, "원피스", "2026-07-03"]]], ["1.5 원룸 월세 50만원", []], ["3-4 원룸 월세 40만원", []], ["5.5 원두 2만원", []], ["7/3 원두 5000", [[5000, "원두", "2026-07-03"]]], ["10/31 원단 3만원", [[30000, "원단", "2026-10-31"]]], ["커피 5000 7/3 원두 3000", [[5000, "커피", TODAY], [3000, "원두", "2026-07-03"]]], ["7.3 원피스 3만원", []],
  // Q-101 문장 부호로 끝나는 ‘천 + 수’ 와 낱말 뒤의 ‘백 + 수’.
  ["버스 천 500.", []], ["버스 천 500,", []], ["어제 버스 천 500.", []], ["천 500.", []], ["종이 백 500.", []], ["종이 백 500원", []], ["종이 백 5000원", []], ["구두 천 5000원", []], ["만두 백 5000원", []], ["종이 백 3만원", [[30000, "종이 백", TODAY]]],
  // Q-102 은·는 을 뗀 날 말이 뒤의 날 말을 이기지 않는다. 앞날은 떼지 않는다.
  ["어제는 못 샀고 오늘 커피 4000", [[4000, "어제는 못 샀고 커피", TODAY]]], ["오늘은 아니고 어제 커피 4000", [[4000, "오늘은 아니고 커피", "2026-07-14"]]], ["어제는 아니고 그제 커피 4000", [[4000, "어제는 아니고 커피", "2026-07-13"]]], ["내일은 쉬어서 오늘 치맥 3만원", [[30000, "내일은 쉬어서 치맥", TODAY]]], ["내일은 쉬는 날 커피 4000", [[4000, "내일은 쉬는 날 커피", TODAY]]], ["어제는 커피 4000", [[4000, "커피", "2026-07-14"]]], ["어제는 커피 4000 오늘 택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]],
  // Q-103 ‘N일에’ 뒤의 기간 말, 어치 금액 뒤의 금액, 낱말 속 ‘원’, 떨어진 끝수.
  ["3일에 걸쳐 이사 30만원", [[300000, "3일에 걸쳐 이사", TODAY]]], ["3일에 나눠서 결제 5만원", [[50000, "3일에 나눠서", TODAY]]], ["1일에 세 끼 식비 3만원", [[30000, "1일에 세 끼 식비", TODAY]]], ["주유 5만원어치 3000원 세차", []], ["과일 만원어치 5천원 커피", []],
  ["한강공원인데 치킨 2만원", [[20000, "한강공원인데 치킨", TODAY]]], ["신입 사원과 점심 3만원", [[30000, "신입 사원과 점심", TODAY]]], ["연구원이고 점심 9000원", [[9000, "연구원이고 점심", TODAY]]], ["올림픽공원이라 커피 4000원", [[4000, "올림픽공원이라 커피", TODAY]]], ["커피 오천원이고요 택시 3만원", []], ["커피 오천원이었고 택시 3만원", []], ["커피 오천원에요", []],
  ["택시 3만 5 현금", []], ["택시 2만 5 카드", []], ["택시 1만 2 어제", []], ["택시 5천 5 현금", []], ["커피 3천 2 잔", [[3000, "커피 2 잔", TODAY]]], ["커피 3천 2잔", [[3000, "커피 2잔", TODAY]]],
  // Q-104 날짜만 쓴 줄은 다음 줄들의 날짜고, 날로 시작하는 줄은 제 날짜다. 기간은 여행 꼴만 뺀다.
  ["어제\n커피 4000\n오늘\n택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]], ["7월 1일\n커피 4000\n7월 2일\n택시 8000", [[4000, "커피", "2026-07-01"], [8000, "택시", "2026-07-02"]]], ["월요일\n커피 4000\n화요일\n택시 8000", [[4000, "커피", "2026-07-13"], [8000, "택시", "2026-07-14"]]], ["3일\n커피 4000\n5일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"]]], ["3일 커피 4000\n5일 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]], ["3일에 커피 4000\n5일에 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]], ["3일 커피 4000, 5일 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]], ["어제 커피 4000, 3일 주차 5000", [[4000, "커피", "2026-07-14"], [5000, "주차", "2026-07-14"]]],
  ["다낭 3박 5일 패키지 80만원", [[800000, "다낭 3박5일 패키지", TODAY]]], ["유럽 5박 7일 300만원", [[3000000, "유럽 5박7일", TODAY]]], ["무박 3일 여행 30만원", [[300000, "무박3일 여행", TODAY]]], ["3박 3일 출장비 50만원", [[500000, "3박3일 출장비", TODAY]]], ["호텔 1박 3일 결제 12만원", [[120000, "호텔 1박", "2026-07-03"]]],
  ["커피 4000 택시 8000 총 15000원", [[4000, "커피", TODAY], [8000, "택시", TODAY], [15000, "총", TODAY]]], ["합계 12000", [[12000, "합계", TODAY]]], ["커피 4000 택시 8000 전체 12000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["밥 총 5000 술 총 5000", [[5000, "밥 총", TODAY], [5000, "술 총", TODAY]]], ["부분 염색 5만원 전체 5만원", [[50000, "부분 염색", TODAY], [50000, "전체", TODAY]]], ["일부 3000 전체 3000", [[3000, "일부", TODAY], [3000, "전체", TODAY]]], ["커피 4000 택시 8000 다해서 12000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000 택시 8000 도합 12000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000 택시 8000 토탈 12000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]], ["커피 4000 총 4000", [[4000, "커피", TODAY]]],
];
await withClock("2026-07-15", () => {
  for (const [text, rows] of parseCases) eq(JSON.stringify(rowsOf(text).map((row) => [row.amount, row.memo, row.transaction_date])), JSON.stringify(rows), `Q-65~Q-68 ‘${text}’`);
  for (const [text, want] of [...round7Cases, ...round8Cases, ...round9Cases]) {
    const got = rowsOf(text).map((row) => `${row.amount}${row.transaction_date === TODAY ? "" : `@${String(row.transaction_date).slice(5)}`}`).join("+") || "?";
    ok(want.split("|").includes(got), `독립 검토 7~9회차 ‘${text}’: ${got} ≠ ${want}`);
  }
});
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js", "/assets/accountbook-budget-preview-v22993.js"]) {
  const browser = vm.runInNewContext(`(${fromAsset(await assetText(path), "moneyTokenSpans")})`);
  for (const [text] of [...parseCases, ...round7Cases, ...round8Cases, ...round9Cases]) eq(JSON.stringify(browser(text)), JSON.stringify(moneyTokenSpans(text)), `${path} ‘${text}’ 의 금액이 서버와 같다`);
}
for (const path of ["/assets/mobile-home-v22993.js", "/assets/mobile-home-shell-v22993.js"]) {
  const fold = vm.runInNewContext(`(${fromAsset(await assetText(path), "foldInputWidth")})`);
  const dateFn = vm.runInNewContext(`(${fromAsset(await assetText(path), "quickInputDate")})`);
  for (const [text] of parseCases) {
    eq(fold(text), foldInputWidth(text), `${path} ‘${text}’ 의 접기가 서버와 같다`);
    eq(dateFn(foldInputWidth(text), "2026-07-15"), quickInputDate(foldInputWidth(text), "2026-07-15"), `${path} ‘${text}’ 의 날짜가 서버와 같다`);
  }
}

// Q-71 가져오기 문장의 날짜도 거래 해석기와 같다.
await withClock("2026-07-15", () => {
  for (const [text, date] of [["10월 3일에 커피 4000", "2026-10-03"], ["10월 3일날 커피 4000", "2026-10-03"], ["7. 3. 커피 4000", "2026-07-03"], ["10.31에 커피 4000", "2026-10-31"]]) {
    const parsed = parseFlexibleImportRecords(text, HH, "", {});
    eq(parsed.rows?.[0]?.transaction_date, date, `Q-71 ‘${text}’ 의 날짜`);
    eq(parsed.rows?.[0]?.amount, 4000, `Q-71 ‘${text}’ 의 금액`);
  }
});

// Q-73 분류 낱말이 다른 낱말 속에서 잡히지 않는다.
for (const [text, category] of [["그린카페 5000", "카페/간식"], ["렌트카페 3000", "카페/간식"], ["그린카 30000", "교통"], ["그린카 대여 30000", "교통"], ["라멘 9000", "외식"], ["돈코츠라멘 12000", "외식"], ["파마 50000", "미용"], ["기부 30000", "경조사/선물"], ["기부금 30000", "경조사/선물"], ["유니세프 기부 30000", "경조사/선물"]]) eq(rowsOf(text)[0]?.category, category, `Q-73 ‘${text}’ 의 분류`);
for (const [text, wrong] of [["그린카레 12000", "교통"], ["필라멘트 전구 5000", "외식"], ["프라멘트 3000", "외식"], ["양파마늘 3000", "미용"], ["대파마늘 3000", "미용"], ["동기부여 5000", "경조사/선물"], ["초기부담금 300000", "경조사/선물"], ["장기부채 300000", "경조사/선물"]]) ok(rowsOf(text)[0]?.category !== wrong, `Q-73 ‘${text}’ 는 ${wrong} 이 아니다`);

// Q-79 ‘수정’ 을 앞에 쓴 말은 번호가 한 자리여도 새 기록이 아니다.
for (const text of ["수정 1번 커피 5000원", "수정 1번 라떼 5000원", "수정 01번 점심 5000원"]) await untouched(text, "Q-79");
await changed("수정 1번 금액 13000원", { amount: 13000 }, "Q-79");
await removed("수정 1번 삭제", "Q-79");

// Q-80 ‘A 말고 B’ 는 고치는 말이다. 낱말이 있으면 두 기록이다.
for (const text of ["4500원 말고 5000원", "4500 말고 5000", "4500말고 5000", "방금 거 4500원 말고 5000원", "4500원 아니야 5000원", "4500원 아닌데 5000원이야", "4500원 아닙니다 5000원"]) await untouched(text, "Q-80", { say: "새 기록으로 저장하지 않았어요" });
for (const text of ["1번 4500원 말고 5000원", "수정 1번 4500원 말고 5000원"]) await untouched(text, "Q-80");
await untouched(["수정 1번", "금액", "4500원 말고 5000원"], "Q-80");
for (const text of ["오천원 말고 오만원", "오천 말고 육천", "커피 8000 아니 9000", "4500원 말구 5000원", "4500원 아니고요 5000원이요", "4500원 말고 5000원 맞아"]) await untouched(text, "Q-80", { say: "새 기록으로 저장하지 않았어요" });
for (const [path, run] of bothPaths) eq((await run(["팁 5000원 말고 1000원 더 줌"])).added, 2, `Q-80 ${path} 뒤에 말이 이어지면 기록이다`);
await untouched("5000원이 아니라 3000원으로", "Q-80", { say: "새 기록으로 저장하지 않았어요" });
for (const [path, run] of bothPaths) eq((await run(["커피 4500 말고 라떼 5000"])).added, 1, `Q-80 ${path} 낱말이 있으면 기록이다`);

// Q-83 앞 낱말이 있는 카드는 결제수단으로 짐작하지 않는다. ‘결제’ 는 칸 이름이다.
for (const [text, payment_method] of [["1번 결제 카드로 바꿔줘", "카드"], ["방금 결제 카드로 바꿔줘", "카드"], ["1번 결제 국민카드로", "국민카드"], ["1번 결제 현금으로", "현금"], ["1번 국민 카드로", "국민 카드"], ["1번 신한 체크카드로", "신한 체크카드"], ["1번 회사 카드로 바꿔줘", "회사 카드"], ["1번 현금으로 바꿔줘", "현금"], ["1번 국민카드로", "국민카드"]]) await changed(text, { payment_method }, "Q-83");
for (const [text, payment_method] of [["1번 남편 카드", "남편 카드"], ["1번 엄마 카드로", "엄마 카드"], ["1번 결제 남편 카드", "남편 카드"], ["1번 애플 페이", "애플 페이"]]) await changed(text, { payment_method }, "Q-83");
await changed(["수정 1번", "남편 카드"], { payment_method: "남편 카드" }, "Q-83");
await changed(["수정 1번", "엄마 카드"], { payment_method: "엄마 카드" }, "Q-83");
for (const text of ["1번 생일 카드로 바꿔줘", "1번 월급 페이로", "1번 명함 카드로", "1번 내 포토카드로 바꿔줘", "1번 딸 교통카드로"]) await untouched(text, "Q-83", { say: "바꾸는 건가요" });
await untouched("1번 엄마 생일카드로 바꿔줘", "Q-83");
await untouched(["수정 1번", "명함 카드로"], "Q-83", { say: "바꾸는 건가요" });

// Q-84 시키는 말의 다른 꼴. 지난 일을 적은 말은 기록이다.
for (const text of ["5000원으로 맞춰줘", "커피 5000원으로 맞춰줘", "커피 5000원으로 조정", "5000원으로 해", "바꿔줘 5000원", "고쳐줘 5000원", "변경해줘 5000원", "정정 5000원", "틀렸어 5000원이야", "잘못 입력했어 5000원이야", "그거 5000원으로", "이거 5000원으로", "방금 거 5000원 맞아"]) await untouched(text, "Q-84", { say: "새 기록으로 저장하지 않았어요" });
await changed("1번은 5000원", { amount: 5000 }, "Q-84");
await changed("1번은 5000원으로 바꿔줘", { amount: 5000 }, "Q-84");
for (const text of ["환전 10만원으로 바꿈", "시계 3만원으로 고침", "타이어 30만원 바꿈", "커피 5000원으로 고침", "이거 5000원으로 샀어", "2번 은행 수수료 500원", "잘못 샀어 5000원", "아까 거 환불 5000원", "아까 거 계산 5000원", "아까 건 취소하고 택시 8000원", "방금 거 커피 5000", "병원 말고 3만원", "학원 아니고 30만원", "공원 아니고 3000", "이번만 말고 5000", "아까 거 3000원 환불", "아까 건 8000원 택시", "방금 건 5000원 커피", "아까 거 5000원 더"]) for (const [path, run] of bothPaths) eq((await run([text])).added, 1, `Q-84 ${path} ‘${text}’ 은 기록이다`);

// Q-88 조사 뒤의 ‘변경’ 은 고치는 말이다. 이름의 일부면 그대로다.
await changed(["수정 1번", "내용", "라떼로 변경"], { memo: "라떼" }, "Q-88");
await changed(["수정 1번", "날짜", "어제로 변경"], { transaction_date: "2026-07-14" }, "Q-88");
await changed(["수정 1번", "결제수단", "현금으로 변경"], { payment_method: "현금" }, "Q-88");
await changed(["수정 1번", "현금으로 변경"], { payment_method: "현금" }, "Q-88");
await changed(["수정 1번", "내용", "주소 변경"], { memo: "주소 변경" }, "Q-88");
await changed(["수정 1번", "내용", "바지 수정"], { memo: "바지 수정" }, "Q-88");
await changed(["수정 1번", "내용", "경로 변경"], { memo: "경로 변경" }, "Q-88");
await changed(["수정 1번", "내용", "도로 수정"], { memo: "도로 수정" }, "Q-88");
await changed(["수정 1번", "내용", "대학로 변경"], { memo: "대학로 변경" }, "Q-88");

// Q-81 수정 중인 답은 끝맺음이 있어도 새 기록이 아니다. 문장 가운데의 수도 내용이다.
for (const text of ["5000정도", "5천정도", "5000가량", "5000 정도", "5000원 정도", "5000쯤", "5000원 정도요", "5000 정도요", "5000원쯤이요"]) await changed(["수정 1번", "금액", text], { amount: 5000 }, "Q-81");
await changed(["수정 1번", "5000원 정도요"], { amount: 5000 }, "Q-81");
await changed(["수정 1번", "5000정도"], { amount: 5000 }, "Q-81");
for (const text of ["3000에 산 우산", "백일만에 먹은 치킨", "벤츠 300에 주유", "이천에 다녀옴"]) await changed(["수정 1번", "내용", text], { memo: text }, "Q-81");
await changed(["수정 1번", "내용", "커피 4000이요 택시 8000이요"], { memo: "커피 4000이요 택시 8000이요" }, "Q-81");

// Q-86 수정 날짜도 같은 입구를 지난다.
await changed(["수정 1번", "날짜", "3일 전에"], { transaction_date: "2026-07-12" }, "Q-86");
await changed(["수정 1번", "날짜", "이틀 전에"], { transaction_date: "2026-07-13" }, "Q-86");
await changed(["수정 1번", "날짜", "오늘 말고 어제"], { transaction_date: "2026-07-14" }, "Q-86");
await changed("수정 1번 날짜 어제 말고 오늘", { transaction_date: "2026-07-15" }, "Q-86");

// Q-79 번호만 두 자리로 맞춘다.
for (const [path, run] of bothPaths) {
  eq((await run(["수정 1번째 금액 5000"])).last?.memo?.includes("1번째"), true, `Q-79 ${path} ‘1번째’ 는 번호가 아니다`);
  eq((await run(["수정 1번, 금액 5000"])).added, 0, `Q-79 ${path} 쉼표 뒤의 고치는 말`);
}

// Q-78·Q-81·Q-85·Q-87 은 실제 저장까지 본다.
for (const [path, run] of bothPaths) {
  eq((await run(["주유 5만원어치 커피 4000"])).added, 2, `Q-78 ${path} 금액이 사라지지 않는다`);
  eq((await run(["커피 4000이랑 택시 8000"])).added, 2, `Q-81 ${path} 앞 금액이 사라지지 않는다`);
  eq((await run(["전세 3억에 이사비 80만원"])).added, 1, `Q-81 ${path} 설명하는 수는 기록이 아니다`);
  eq((await run(["5만원어치 주유 커피 4000"])).added, 2, `Q-78 ${path} 맨 앞 어치 금액도 사라지지 않는다`);
  eq((await run(["커피 4000, 어제"])).last?.transaction_date, "2026-07-14", `Q-85 ${path} 쉼표 뒤 날짜`);
  eq((await run(["커피 3000 택시 8000 총 11000원"])).added, 2, `Q-87 ${path} 합계는 한 건이 아니다`);
}

if (failures.length) {
  console.error(failures.slice(0, 60).join("\n"));
  console.error(`V22.9.93 출시 전 수정 검사 실패 ${failures.length}건 / ${checks}`);
  process.exit(1);
}
console.log(`V22.9.93 출시 전 수정 검사 통과 (${checks} checks)`);
