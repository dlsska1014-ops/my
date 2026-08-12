import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.91-HOME-REPORTS"'), "runtime exposes the amount parsing fix release");

// 1. 숫자 사이 쉼표는 문장 구분자가 아니다.
ok(source.includes("(?<!\\d)[,，](?!\\d)"), "clause splitting skips commas that sit between digits");
// 2. 단위가 이어진 금액은 하나의 토큰으로 잡아야 한다.
ok(/const pattern = \/\(\?:\(\?:\\d\+\(\?:\\\.\\d\+\)\?\\s\*\(\?:억\|만\|천\|백\|십\)\\s\*\)\+/.test(source), "combined unit amounts are one token span");
// 3. 한 글자 조사는 떼어내지 않는다.
ok(source.includes('(에서|으로|에게|한테)(?=\\s|$)/g, "$1 ")'), "only multi-syllable particles are stripped");
ok(!/\(에서\|으로\|에게\|한테\|로\|에\|을\|를\|은\|는\|이\|가\)\(\?=/.test(source), "single-syllable particle stripping is gone");

const ORIGIN = "https://ttokttok-accountbook.com";
const USER = "kakao_login:2265";

async function say(fixture, utterance) {
  const payload = {
    userRequest: { utterance, user: { id: USER, properties: {} } },
    action: { params: {}, detailParams: {} },
    bot: { id: "bot" },
    intent: { id: "intent", name: "폴백블록" },
  };
  const response = await app.fetch(new Request(`${ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(payload),
  }), fixture.env, {});
  const raw = await response.text();
  try { return String(JSON.parse(raw)?.template?.outputs?.[0]?.simpleText?.text || raw); } catch (_error) { return raw; }
}

// 응답 문구가 아니라 저장된 행을 직접 읽는다. "저장했어요"만 보고 넘어가면
// 금액이 틀리게 저장돼도 통과한다.
async function saved(fixture, utterance) {
  const before = fixture.db.transactions.length;
  const text = await say(fixture, utterance);
  const added = fixture.db.transactions.slice(before);
  return { added, text };
}

const fixture = await createV2265QaFixture();
try {
  // 이 검사는 한 사용자로 100건 넘게 보낸다. 분당 60건 상한(별도 검사에서 확인)에 걸리면
  // 파싱이 아니라 리미터를 재게 되므로, 여기서만 상한을 올린다.
  fixture.env.SKILL_RATE_LIMIT = 10000;
  await say(fixture, "안녕");
  ok((await say(fixture, "2")).includes("선택했어요"), "가계부를 선택할 수 있다");

  // ── 금액 표기 ────────────────────────────────────────────────
  // 하나의 입력은 반드시 한 건으로, 쓴 금액 그대로 저장돼야 한다.
  const AMOUNTS = [
    ["6만원", 60000], ["6만", 60000], ["60000", 60000], ["60000원", 60000],
    ["1만5천", 15000], ["1만5천원", 15000], ["3만5천원", 35000], ["3만 5천원", 35000],
    ["10만5000원", 105000], ["1.5만원", 15000], ["3천", 3000], ["3천원", 3000],
    ["250만원", 2500000], ["500원", 500], ["1200원", 1200], ["7500", 7500],
    ["12,345원", 12345], ["60,000", 60000], ["1,200원", 1200], ["100,000원", 100000],
    ["2,500,000원", 2500000],
  ];
  const wrong = [];
  let seed = 0;
  for (const [amountText, expected] of AMOUNTS) {
    // 메모에 숫자가 들어가면 금액 파싱을 오염시켜 검사 자체가 거짓말을 한다. 한글만 쓴다.
    const memo = ["가나", "다라", "마바", "사아", "자차", "카타", "파하", "너더", "러머", "버서"][seed % 10] + ["구", "누", "두", "루", "무"][Math.floor(seed / 10) % 5];
    seed += 1;
    const { added, text } = await saved(fixture, `${memo} ${amountText}`);
    eq(added.length, 1, `"${memo} ${amountText}" 는 한 건으로 저장된다 (${added.length}건, ${text.split("\n")[0].slice(0, 40)})`);
    if (added.length === 1 && Number(added[0].amount) !== expected) {
      wrong.push(`${amountText}→${added[0].amount}(기대 ${expected})`);
    }
    if (added.length === 1) eq(added[0].memo, memo, `"${memo} ${amountText}" 의 메모가 그대로 남는다`);
  }
  eq(wrong.join(", "), "", `금액이 쓴 그대로 저장된다 (${wrong.join(", ") || "이상 없음"})`);

  // ── 낱말 보존 ────────────────────────────────────────────────
  // 조사로 끝나는 멀쩡한 낱말이 잘리면 안 된다.
  const WORDS = ["고양이", "목걸이", "을지로", "어린이", "곰팡이", "호랑이", "신작로", "한강로", "종이", "놀이", "물가", "단가", "오이", "종로", "대로"];
  const cut = [];
  for (const word of WORDS) {
    const { added } = await saved(fixture, `${word} 11000`);
    if (added.length !== 1 || added[0].memo !== word) cut.push(`${word}→${added[0]?.memo ?? "(저장안됨)"}`);
  }
  eq(cut.join(", "), "", `조사로 끝나는 낱말이 잘리지 않는다 (${cut.join(", ") || "이상 없음"})`);

  // 두 글자 조사는 계속 정리된다.
  for (const [utterance, expected] of [["마트에서 12000", "마트"], ["친구에게 20000", "친구"], ["편의점에서 4500", "편의점"]]) {
    const { added } = await saved(fixture, utterance);
    eq(added.length, 1, `"${utterance}" 가 한 건으로 저장된다`);
    eq(added[0]?.memo, expected, `"${utterance}" 의 두 글자 조사는 정리된다`);
  }

  // ── 여러 건 분리는 유지 ───────────────────────────────────────
  for (const utterance of ["커피 3100 그리고 점심 8100", "우유 3200랑 두부 8200", "택시비 5300 또 버스비 1300"]) {
    const { added } = await saved(fixture, utterance);
    eq(added.length, 2, `"${utterance}" 는 두 건으로 나뉜다`);
  }
  // 쉼표로 나눈 여러 건도 계속 동작한다 (숫자 사이 쉼표만 예외다).
  const commaSplit = await saved(fixture, "빵 2600, 우산 4700");
  eq(commaSplit.added.length, 2, "쉼표로 구분한 두 건은 계속 나뉜다");
  const commaAmount = await saved(fixture, "가습기 1,500,000원");
  eq(commaAmount.added.length, 1, "자릿수 쉼표가 든 금액은 한 건으로 저장된다");
  eq(commaAmount.added[0]?.amount, 1500000, "자릿수 쉼표가 든 금액이 그대로 저장된다");

  // ── 결제수단·구분·날짜 ────────────────────────────────────────
  for (const pay of ["국민카드", "신한카드", "현금", "카카오페이", "토스", "계좌이체", "체크카드", "삼성페이"]) {
    const { added } = await saved(fixture, `머거 7000 ${pay}`);
    eq(added[0]?.payment_method, pay, `결제수단 ${pay} 를 인식한다`);
  }
  for (const [utterance, type] of [["월급 250만원", "income"], ["보너스 50만원 입금", "income"], ["점심 9000", "expense"]]) {
    const { added } = await saved(fixture, utterance);
    eq(added[0]?.type, type, `"${utterance}" 의 수입·지출 구분`);
  }
  for (const [utterance, category] of [["점심 9500", "식비"], ["커피 4500", "카페/간식"], ["월세 65만원", "주거/관리"], ["넷플릭스 17000", "구독"]]) {
    const { added } = await saved(fixture, utterance);
    eq(added[0]?.category, category, `"${utterance}" 의 분류 자동추천`);
  }
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.70 amount parsing (${checks} checks)`);
