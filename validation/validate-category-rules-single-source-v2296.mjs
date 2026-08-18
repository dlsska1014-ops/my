// V22.9.6 — 같은 문장에 같은 답을 한다.
//
// 이 앱은 "무엇으로 분류할까"와 "수입인가 지출인가"를 세 곳에서 **따로** 판단했다.
// 세어 보니 규칙이 서로 달랐다:
//
//   서버 CATEGORY_RULES        분류 23개 · 키워드 280개
//   홈 빠른입력 사본           분류 15개 · 키워드 141개   (서버 대비 분류 9개·키워드 94개 부족)
//   다른 화면 사본             분류 11개 · 키워드  79개
//
// 실제로 실행해서 재 보니 대표 문장 16개 중 **13개**에서 세 곳이 다른 답을 냈다.
// "한의원 30000" 은 카카오톡으로 보내면 의료/건강, 홈 빠른입력에 치면 기타지출이었다.
//
// 규칙을 늘린 사람이 잘못한 게 아니다. 늘릴 곳이 셋인 구조가 문제였다. 그래서 정본을
// 하나 두고 클라이언트는 읽기만 하게 바꿨다.
//
// ── 이 검사가 보는 것 ──
// "소스에 같은 상수를 참조한다"가 아니라 **세 곳을 실제로 실행해서 답이 같은지** 본다.
// 참조만 확인하면, 사본이 규칙을 읽고도 다른 알고리즘으로 다른 답을 내는 경우를 놓친다
// (실제로 두 사본의 알고리즘이 달랐다 — 하나는 가중치 합산, 하나는 먼저 걸리는 것).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

// ---------------------------------------------------------------------------
// 1) 정본이 하나 있고, 캐시되는 자산으로 전달된다
// ---------------------------------------------------------------------------
const RULES_ASSET = "/assets/ab-category-rules-v2296.js";
const rulesResponse = await app.fetch(new Request(`${ORIGIN}${RULES_ASSET}`), {}, {});
eq(rulesResponse.status, 200, "분류 규칙 자산이 서빙된다");
eq(rulesResponse.headers.get("etag"), '"ab-category-rules-v2296-js"', "ETag 가 주소와 맞는다");
ok(String(rulesResponse.headers.get("cache-control") || "").includes("immutable"), "1년 캐시 불변 자산이다");
const rulesJs = await rulesResponse.text();

const win = {};
new Function("window", rulesJs)(win);
ok(Array.isArray(win.AB_CATEGORY_RULES) && win.AB_CATEGORY_RULES.length >= 20, `규칙이 실려 있다 (${(win.AB_CATEGORY_RULES || []).length}개 분류)`);
ok(win.AB_TYPE_HINTS && win.AB_TYPE_HINTS.income && win.AB_TYPE_HINTS.expense, "수입·지출 판별 낱말도 같은 자산에 있다");

// 규칙이 정본에서 생성된다 — 자산에 손으로 적은 목록이 아니다.
for (const name of ["보험", "교육/학습", "반려동물", "미용", "세금/수수료", "용돈", "환급"]) {
  ok(win.AB_CATEGORY_RULES.some((rule) => rule.name === name), `클라이언트가 "${name}" 분류를 안다 (예전엔 서버만 알았다)`);
}

// ---------------------------------------------------------------------------
// 2) 통합한 두 사본이 규칙을 **다시 적지** 않는다
// ---------------------------------------------------------------------------
// 되돌아가는 방식은 하나다: 누군가 편한 자리에 목록을 다시 붙여 넣는 것.
// 두 클라이언트 사본 안에 분류 키워드가 직접 적히면 여기서 걸린다.
const mainStart = source.indexOf("function mobileUiUxClientMain()");
const mainBody = source.slice(mainStart, source.indexOf("\nfunction ", mainStart + 40));
for (const word of ["스타벅스", "하이패스", "홈플러스", "넷플릭스", "다이소"]) {
  ok(!mainBody.includes(word), `다른 화면 사본이 "${word}" 를 직접 들고 있지 않다`);
}

// ── 알려진 예외 하나를 적어 둔다 ──
// recommendCategory 는 **다른 분류 체계**(30개: 외식·배달·편의점·택시·약국·통신비…)를
// 갖고 있고, 거래를 저장할 때 분류가 비어 있으면 그 이름이 그대로 DB 에 들어간다
// (sanitizeTransactionBody). 즉 화면은 "식비"라고 제안하는데 저장은 "외식"이 될 수 있다.
// 이건 규칙이 갈린 게 아니라 **분류 체계를 둘 중 무엇으로 할지**의 문제라 사람이 정해야
// 한다. 여기서는 고치지 않고, 그 사이에 이 두 번째 체계가 조용히 더 자라지 않도록
// 크기만 고정해 둔다.
const recStart = source.indexOf("function recommendCategory(");
const recBody = source.slice(recStart, source.indexOf("\n}\n", recStart));
const recNames = [...recBody.matchAll(/\["([^"]+)", \//g)].map((m) => m[1]);
eq(recNames.length, 30, `저장 경로의 두 번째 분류 체계가 30개 그대로다 (정본은 ${win.AB_CATEGORY_RULES.length}개) — 늘리려면 통합부터 결정해야 한다`);
ok(source.includes("out.category = recommendCategory("), "그 체계가 저장 경로에서 쓰이고 있다는 사실 자체를 기록해 둔다");

// ---------------------------------------------------------------------------
// 3) 세 곳을 실제로 돌려서 답을 맞춰 본다
// ---------------------------------------------------------------------------
function slice(text, from, to) {
  const start = text.indexOf(from);
  assert.ok(start >= 0, `조각을 못 찾음: ${from.slice(0, 40)}`);
  const end = text.indexOf(to, start);
  assert.ok(end > start, `조각 끝을 못 찾음: ${to.slice(0, 40)}`);
  return text.slice(start, end);
}

// ① 홈 빠른입력 — 홈이 실제로 받는 캐시 자산에서 떼어낸다. 소스 문자열을 자르면
//    템플릿 리터럴 이스케이프가 한 겹 더 껴서 브라우저가 받는 것과 다른 코드를 재게 된다.
const shellJs = await (await app.fetch(new Request(`${ORIGIN}/assets/mobile-home-shell-v2296.js`), {}, {})).text();
ok(shellJs.includes("window.AB_CATEGORY_RULES=["), "홈 셸 자산이 규칙을 함께 싣는다(요청이 늘지 않는다)");
const noDom = { querySelectorAll: () => [] };
const homeAsk = new Function("window", "document",
  slice(shellJs, "function abNorm(v){", "function parseQuickDate(text){")
  + slice(shellJs, "var quickRules=", "function stripQuickMemo(")
  + "\nreturn function(t){var ty=detectQuickType(t);return ty + \"/\" + inferQuickCategory(t,ty);};")(win, noDom);

// ② 다른 화면(mobileUiUxClientMain)
const mainAt = source.indexOf("function mobileUiUxClientMain()");
const otherAsk = new Function("window",
  slice(source.slice(mainAt), "  function normalizeText(value) {", "  function detectPayment(text) {")
  + slice(source.slice(mainAt), "  function detectCategory(text, type) {", "\n  function ")
  + '\nreturn function(t){var raw=normalizeText(t);var ty=detectType(raw);return ty + "/" + (detectCategory(raw,ty)||"기타지출");};')(win);

// ③ 서버
const serverAsk = new Function(
  slice(source, "const AB_TYPE_HINTS = Object.freeze({", "});") + "});"
  + "\n" + slice(source, "const CATEGORY_RULES = [", "\n];") + "\n];"
  + '\nfunction normalizeText(v){return String(v||"").replace(/\\s+/g," ").trim();}\n'
  + slice(source, "function inferCategory(text, type) {", "\nfunction cleanMemo")
  + "\n" + slice(source, "function detectType(text) {\n  const raw = normalizeText(text);", "\n}\n") + "\n}\n"
  + '\nreturn function(t){var ty=detectType(t);return ty + "/" + inferCategory(t,ty);};')();

// 개편 전 이 16개 중 13개에서 세 곳이 갈렸다. 그 13개가 여기 그대로 들어 있다.
//
// 마지막 두 문장은 **알고리즘**을 가르는 자리다. 처음엔 위 16개만 넣었는데, 사본을
// 옛 방식(목록에서 먼저 걸리는 것)으로 되돌리는 실패를 주입해도 그대로 통과했다 —
// 16개 모두 한 분류에만 걸려서 어느 알고리즘이든 답이 같았기 때문이다. "규칙을 같이
// 읽는다"와 "같은 답을 낸다"는 다르고, 후자를 재려면 여러 분류가 동시에 걸리는
// 문장이 있어야 한다. 아래 둘은 목록 순서로는 "쇼핑"(쿠팡), 가중치 합으로는
// "구독"(쿠팡와우·넷플릭스)이 이긴다.
const SENTENCES = [
  "한의원 30000", "영양제 25000", "코스트코 84000", "알뜰폰 요금 19800",
  "대리운전 25000", "SRT 47000", "용돈 받았어 50000", "강아지 사료 32000",
  "미용실 커트 20000", "자동차세 180000", "실비보험 42000", "학원비 350000",
  "넷플릭스 17000", "축의금 100000", "점심 12000", "월급 3000000",
  "쿠팡와우 구독 결제 17000", "쿠팡에서 넷플릭스 결제 17000",
];
for (const sentence of SENTENCES) {
  const server = serverAsk(sentence);
  eq(homeAsk(sentence), server, `"${sentence}" — 홈 빠른입력이 서버와 같은 답을 한다 (${server})`);
  eq(otherAsk(sentence), server, `"${sentence}" — 다른 화면도 같은 답을 한다 (${server})`);
}

// 답이 그냥 "기타"로 몰려서 같아진 게 아니라는 것도 본다. 전부 기타로 만들면
// 위 32개가 통과하므로, 그 통과에 의미가 있으려면 이 줄이 필요하다.
const resolved = SENTENCES.filter((s) => !serverAsk(s).includes("기타")).length;
ok(resolved >= 16, `대부분 실제 분류로 떨어진다 (${resolved}/${SENTENCES.length}) — "전부 기타"로 맞춘 게 아니다`);

console.log(`V22.9.6 분류 규칙 정본 검사 통과 (${checks} checks)`);
