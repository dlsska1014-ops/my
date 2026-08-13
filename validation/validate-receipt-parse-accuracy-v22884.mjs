import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.92-SCREEN-CLEANUP"'), "runtime exposes the V22.8.84 release");

// ---------------------------------------------------------------------------
// 이 파서는 브라우저로 내려가는 문자열 안에 산다. 소스에서 그대로 떼어 내
// 실제 함수를 돌린다 — 검사에 복사본을 두면 원본이 바뀌어도 계속 통과한다.
// ---------------------------------------------------------------------------
// 브라우저 런타임을 DOM 없이 통째로 돌린다. 기존 영수증 검사와 같은 방식이라
// 파서가 노출 시점(early return 위)에 실제로 살아 있는지도 함께 확인된다.
const runtime = (source.match(/function receiptCaptureClientMain\(\)[\s\S]*?\n\}/) || [])[0];
ok(runtime, "the receipt runtime block is where the test expects it");
const windowStub = {};
const documentStub = {
  getElementById: () => null, querySelectorAll: () => [], querySelector: () => null,
  addEventListener: () => {}, createElement: () => ({}), head: { appendChild: () => {} },
};
new Function("window", "document", `${runtime}\nreceiptCaptureClientMain();`)(windowStub, documentStub);
const parsers = windowStub.__receiptParsers;
ok(parsers, "the parsers are exposed before the DOM-missing early return");
const parseDate = parsers.date;
const parseAmount = parsers.amount;

// ---------------------------------------------------------------------------
// 1. 금액 — 영수증에는 금액보다 큰 숫자가 늘 있다
//   사업자등록번호·카드번호·승인번호·전화번호. 예전 파서는 합계 키워드가 깨지면
//   곧바로 "가장 큰 숫자" 로 폴백해서 그 숫자들을 금액으로 삼았다.
// ---------------------------------------------------------------------------

const amountCases = [
  ["정상 영수증", `스타벅스 강남점
사업자번호 123-45-67890
전화 02-1234-5678
2026-08-10 14:32
아메리카노 4,500
카페라떼 5,000
합계 9,500
카드번호 1234-5678-9012-3456
승인번호 30412857
신한카드`, 9500],
  // 인식률이 나쁘다는 것은 바로 이 줄이 깨진다는 뜻이다.
  ["합계가 힙계로 깨짐", `스타벅스
사업자번호 123-45-67890
아메리카노 4,500
힙계 9,500
승인번호 30412857`, 9500],
  ["합계가 합게로 깨짐", `이마트
사업자번호 220-81-62517
우유 3,200
계란 7,900
합게 11,100`, 11100],
  ["총액이 총맥으로 깨짐", `주유소
사업자 123-45-67890
총맥 55,000
승인번호 88123456`, 55000],
  // 키워드가 통째로 사라져도 승인번호·사업자번호를 집으면 안 된다.
  ["키워드 전멸", `동네슈퍼
사업자번호 220-81-62517
승인번호 30412857
우유 3,200
11,100`, 11100],
  ["받을금액 표기", `이마트
사업자번호 220-81-62517
우유 3,200
받을금액 11,100`, 11100],
  ["쉼표 없는 영수증", `분식집
사업자 123-45-67890
김밥 3500
합계 7500`, 7500],
  // 합계는 아래쪽에 있다. 할인 뒤 실제 결제금액을 집어야 한다.
  ["할인 후 결제금액", `마트
합계 20,000
할인 -2,000
결제금액 18,000`, 18000],
  // 할인 전 금액이 더 크다. 합계 줄이 깨져도 그쪽으로 넘어가면 안 된다.
  ["할인 전 금액이 더 큼 + 합계 깨짐", `마트
상품금액 20,000
할인 -2,000
합게 18,000`, 18000],
  // 포인트 잔액은 산 물건 값이 아니다. 작은 결제일수록 이쪽이 더 크다.
  ["포인트 잔액이 더 큼", `카페
합게 4,800
포인트 잔액 32,150`, 4800],
  // 합계 줄이 아예 없는 영수증에서는 포인트 잔액이 그대로 뽑힌다. 후보에서 빼야 한다.
  ["합계 없이 포인트 잔액만 큼", `카페
카페라떼 4,800
포인트 잔액 32,150`, 4800],
  ["원 단위 표기", `카페
합계 4800원
승인 99887766`, 4800],
  ["금액이 아예 없음", `영수증
사업자번호 123-45-67890`, 0],
];
for (const [name, text, expected] of amountCases) {
  eq(parseAmount(text), expected, `amount: ${name}`);
}

// 되돌림 방지: 예전 폴백(가장 큰 숫자)이 살아 있으면 이 값이 승인번호가 된다.
eq(parseAmount("가게\n사업자번호 220-81-62517\n승인번호 30412857\n합계 5,000"), 5000, "an approval number never wins over a real total");
eq(parseAmount("가게\n카드번호 1234-5678-9012-3456\n힙계 5,000"), 5000, "a card number never wins over a broken total line");

// 현금 영수증: "받은금액"(낸 돈)은 합계가 아니다. 받을금액과 한 글자 차이라
// 총액으로 오해하기 쉽고, 그러면 낸 돈이 지출로 기록된다.
eq(parseAmount(`분식집
합게 9,500
받은금액 10,000
거스름돈 500`), 9500, "cash tendered never outranks the real total");
eq(parseAmount(`분식집
합계 9,500
거스름돈 500`), 9500, "change never outranks the real total");
// 합계 줄이 통째로 깨진 달에는 낸 돈이 "가장 큰 금액" 이 된다. 후보에서 빼야 한다.
eq(parseAmount(`분식집
물건값 9,500
받은금액 10,000
거스름돈 500`), 9500, "cash tendered is not even a candidate when no total line survives");
// 받을금액(낼 돈)은 반대로 합계가 맞다. 한 글자 차이를 실제로 갈라내는지 본다.
eq(parseAmount(`마트
우유 3,200
받을금액 11,100`), 11100, "amount due is still treated as the total");

// 쉼표도 원도 없는 맨숫자는 돈처럼 생긴 것보다 앞설 수 없다.
// 영수증에는 주문번호·영수증번호처럼 금액보다 큰 맨숫자가 흔하다.
eq(parseAmount(`동네슈퍼
주문번호 9999999
우유 3,200`), 3200, "a bare order number never outranks a money-shaped value");

// ---------------------------------------------------------------------------
// 2. 날짜 — 첫 매치가 날짜가 아니면 예전에는 포기했다
// ---------------------------------------------------------------------------

const dateCases = [
  ["연도 4자리", `사업자번호 123-45-67890
2026-08-10 14:32`, "2026-08-10"],
  ["연도 2자리 + 사업자번호", `사업자 123-45-67890
26.08.10`, "2026-08-10"],
  ["사업자번호가 앞줄", `123-45-67890
26/08/10`, "2026-08-10"],
  ["년월일 표기", `2026년 8월 10일 결제`, "2026-08-10"],
  ["날짜 없음", `영수증
합계 5,000`, ""],
];
for (const [name, text, expected] of dateCases) {
  eq(parseDate(text), expected, `date: ${name}`);
}
// 말이 안 되는 날짜는 계속 거른다.
eq(parseDate("2026-45-99"), "", "an impossible month or day is still rejected");

// 번호 줄 세탁이 없으면 단말기번호가 그럴듯한 날짜로 읽혀 진짜 날짜를 이긴다.
// 두 자리 연도끼리 겨루게 둔다. 네 자리 연도가 있으면 그쪽이 먼저 잡혀서
// 번호 줄 세탁이 일을 하는지 알 수 없다.
eq(parseDate(`마트
단말기번호 21-05-30
26.08.10 결제`), "2026-08-10", "an identifier that looks like a date never wins");
// 번호가 아닌 줄에 날짜꼴 쓰레기가 있어도 포기하지 않고 계속 찾는다.
eq(parseDate(`주문 45-67-89
26.08.10`), "2026-08-10", "a bad date-shaped match does not stop the search");

// ---------------------------------------------------------------------------
// 3. 계약을 소스에서도 못박는다
// ---------------------------------------------------------------------------

ok(source.includes("var RECEIPT_ID_LINE ="), "identifier lines are recognised in one place");
ok(source.includes("var RECEIPT_ID_TOKEN ="), "identifier-shaped tokens are recognised in one place");
ok(source.includes("var RECEIPT_TOTAL_LINE ="), "total lines are recognised in one place");
ok(source.includes("var RECEIPT_NOT_TOTAL_LINE ="), "cash-tendered lines are excluded in one place");
eq(source.includes("받을\\s*금액|받은\\s*금액"), false, "amount-due and amount-received are no longer conflated");
ok(source.includes("function receiptScanLines(raw)"), "both parsers scrub identifiers through the same helper");
// 두 파서 모두 같은 세탁을 거쳐야 한다. 한쪽이 빠지면 그쪽만 번호에 걸려 넘어진다.
// 정의 1회 + 호출 2회(parseDate·parseAmount) = 3. 2가 되면 한쪽이 세탁을 건너뛴 것이다.
eq((source.match(/receiptScanLines\(raw\)/g) || []).length, 3, "date and amount both scrub identifiers");
// 예전 정규식은 문자군에 공백을 넣어 "2026 08 10" 을 한 숫자로 삼켰다.
eq(source.includes("line.match(/\\d[\\d,.\\s]{2,}\\s*원?/g)"), false, "the whitespace-swallowing number pattern is gone");
eq(source.includes("return candidates.length ? candidates[0].value : 0;"), false, "the largest-number fallback is gone");

console.log(`PASS: V22.8.84 receipt parse accuracy (${checks} checks)`);
