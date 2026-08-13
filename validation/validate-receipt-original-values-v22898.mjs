// V22.8.98 — 통합 작업지시서 7.6(영수증) 검사.
//
// 7.6 은 영수증 흐름의 **순서를 바꾸지 말라**고 못 박은 뒤 두 가지를 요구한다:
//   · 인식 결과에서 **고친 값과 인식 원값을 나란히** 보여 준다
//   · **확인 없이 저장할 수 없게** 한다
//
// 둘째는 이미 있었다(confirmed=yes 가 아니면 저장이 리다이렉트로 끝난다). 이 파일은
// 그게 실제로 데이터를 막는지 끝까지 확인하고, 첫째를 새로 검사한다.
//
// 첫째가 왜 필요한가: 인식이 값을 채우고 나면 사용자가 고치는 순간 원값이 사라졌다.
// 그러면 "잘못 인식한 것을 고쳤다"와 "맞게 인식한 것을 잘못 고쳤다"를 구분할 방법이
// 없다. 영수증은 금액을 다루는 화면이고, 저장 전에 그 차이를 눈으로 볼 수 있어야 한다.
//
// 표시 로직은 브라우저에서 도는 코드라 문자열만 보고 넘어가기 쉽다. 그래서 함수를
// 자산에서 꺼내 **작은 DOM 스텁 위에서 실제로 돌린다**.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

// ---------------------------------------------------------------------------
// 흐름의 순서는 그대로다 — 7.6 이 바꾸지 말라고 한 것
// ---------------------------------------------------------------------------
// 사진 선택 → 명시적 인식 → 원본 확인 → 저장. 인식이 자동으로 일어나면 사용자가
// 원본을 볼 기회 없이 값이 채워진다.
ok(source.includes('if (analyze) analyze.addEventListener("click", function() { applyReceiptText(true); });'), "인식은 버튼을 눌러야 일어난다(자동 인식이 아니다)");
ok(source.includes('if (String(form.get("confirmed") || "") !== "yes") return redirectResponse(`${returnTo}&err=confirmation_required`);'), "확인 체크 없이는 저장이 진행되지 않는다");
ok(source.includes("confirmation_required: \"사진 원본과 인식 결과를 확인했다는 체크가 필요합니다.\""), "확인이 필요한 이유를 문구로 말한다");

// ---------------------------------------------------------------------------
// 표시 로직을 실제로 돌린다
// ---------------------------------------------------------------------------
const helperStart = source.indexOf("  function rememberOcr(field, value) {");
const helperEnd = source.indexOf("  function applyReceiptText(shouldScroll) {");
ok(helperStart > 0 && helperEnd > helperStart, "원값 표시 함수가 있다");
const helpers = source.slice(helperStart, helperEnd);

function makeField(id, value, ocr) {
  const attrs = ocr === undefined ? {} : { "data-ab-ocr": ocr };
  return {
    id, value,
    getAttribute(name) { return Object.prototype.hasOwnProperty.call(attrs, name) ? attrs[name] : null; },
    setAttribute(name, next) { attrs[name] = String(next); },
    removeAttribute(name) { delete attrs[name]; },
  };
}
function run(fields) {
  const notes = Object.keys(fields).map((id) => ({ id, hidden: true, textContent: "", getAttribute: () => id }));
  const documentStub = {
    getElementById(id) { return fields[id] || null; },
    querySelectorAll(selector) { return selector === "[data-ab-ocr-note]" ? notes : []; },
  };
  const factory = new Function("document", `${helpers}\nreturn { rememberOcr: rememberOcr, syncOcrNotes: syncOcrNotes };`);
  const api = factory(documentStub);
  api.syncOcrNotes();
  return { notes: Object.fromEntries(notes.map((n) => [n.id, n])), api };
}

// 1. 인식값과 현재값이 같으면 아무 말도 하지 않는다.
{
  const fields = { receiptAmount: makeField("receiptAmount", "35,400", "35,400") };
  const { notes } = run(fields);
  eq(notes.receiptAmount.hidden, true, "고치지 않은 칸에는 원값을 달지 않는다");
  eq(notes.receiptAmount.textContent, "", "고치지 않은 칸의 문구는 비어 있다");
}

// 2. 고치면 원값이 나란히 보인다.
{
  const fields = { receiptAmount: makeField("receiptAmount", "3,540", "35,400") };
  const { notes } = run(fields);
  eq(notes.receiptAmount.hidden, false, "고친 칸에는 원값이 보인다");
  eq(notes.receiptAmount.textContent, "인식 원값 35,400", "원값을 그대로 보여 준다");
}

// 3. 되돌려 놓으면 표시도 사라진다 — 남아 있으면 고치지 않은 칸을 고쳤다고 말하게 된다.
{
  const fields = { receiptAmount: makeField("receiptAmount", "3,540", "35,400") };
  const { notes, api } = run(fields);
  eq(notes.receiptAmount.hidden, false, "먼저 고친 상태가 보인다");
  fields.receiptAmount.value = "35,400";
  api.syncOcrNotes();
  eq(notes.receiptAmount.hidden, true, "되돌리면 표시가 사라진다");
}

// 4. 인식하지 못한 칸(원값 없음)에는 아무것도 달지 않는다.
{
  const fields = { merchant: makeField("merchant", "직접 입력한 가게") };
  const { notes } = run(fields);
  eq(notes.merchant.hidden, true, "인식하지 못한 칸에는 원값을 달지 않는다");
}

// 5. 앞뒤 공백만 다른 것은 고친 것이 아니다.
{
  const fields = { merchant: makeField("merchant", "  스타마트 ", "스타마트") };
  const { notes } = run(fields);
  eq(notes.merchant.hidden, true, "공백 차이는 고친 것으로 보지 않는다");
}

// 6. rememberOcr 는 값이 없으면 표식을 지운다 — 지난 인식의 원값이 남으면 안 된다.
{
  const fields = { receiptDate: makeField("receiptDate", "2026-07-02", "2026-07-01") };
  const { api, notes } = run(fields);
  eq(notes.receiptDate.hidden, false, "이전 인식의 원값이 보인다");
  api.rememberOcr(fields.receiptDate, "");
  api.syncOcrNotes();
  eq(notes.receiptDate.hidden, true, "새 인식이 그 칸을 못 찾으면 지난 원값을 지운다");
}

// 인식이 채우는 네 칸 모두 원값을 기억한다.
for (const field of ["merchantField", "dateField", "amountField", "paymentField"]) {
  ok(source.includes(`rememberOcr(${field},`), `${field} 의 인식값을 기억한다`);
}
ok(source.includes('field.addEventListener("input", syncOcrNotes);'), "고치는 동안 표시가 따라온다");

const fixture = await createV2265QaFixture();
try {
  const page = await app.fetch(new Request(`${ORIGIN}/receipts?month=2026-07&household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(page.status, 200, "영수증 화면이 열린다");
  const html = await page.text();

  // 표시 자리가 네 칸에 있고, 처음에는 접혀 있다(인식 전에는 보여 줄 원값이 없다).
  const slots = [...html.matchAll(/<small class="receiptOcrNote" data-ab-ocr-note="([a-zA-Z]+)" hidden><\/small>/g)].map((m) => m[1]);
  eq(slots.sort().join(","), "merchant,receiptAmount,receiptDate,receiptPayment", `인식하는 네 칸에 원값 자리가 있다 (${slots.join(", ")})`);
  ok(html.includes(".receiptOcrNote{"), "원값 표시에 스타일이 있다");
  // 경고면은 톤을 따라가지 않는다(2장) — 원값 표시는 warn 토큰을 쓴다.
  ok(/\.receiptOcrNote\{[^}]*--ab12-warn-bg/.test(html), "원값 표시는 경고 토큰을 쓴다");

  // -------------------------------------------------------------------------
  // 확인 없이 저장할 수 없다 — 실제로 데이터가 남지 않는지까지
  // -------------------------------------------------------------------------
  const before = fixture.db.transactions.length;
  const save = async (extra) => {
    const params = new URLSearchParams({
      household_id: "house-home", month: "2026-07", merchant: "스타마트",
      transaction_date: "2026-07-05", amount: "35400", category: "장보기", ...extra,
    });
    const response = await app.fetch(new Request(`${ORIGIN}/my/receipt/save`, {
      method: "POST",
      headers: { cookie: fixture.cookie, origin: ORIGIN, "content-type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    }), fixture.env, {});
    return { status: response.status, location: response.headers.get("location") || "" };
  };
  const unconfirmed = await save({});
  eq(unconfirmed.status, 303, "확인 없는 저장은 리다이렉트로 끝난다");
  ok(unconfirmed.location.includes("err=confirmation_required"), "확인이 필요하다고 알려 준다");
  eq(fixture.db.transactions.length, before, "확인 없는 저장은 기록을 남기지 않는다");
  // 체크 값이 달라도 통과하지 않는다.
  const wrong = await save({ confirmed: "1" });
  ok(wrong.location.includes("err=confirmation_required"), "체크 값이 다르면 통과하지 않는다");
  eq(fixture.db.transactions.length, before, "그때도 기록이 남지 않는다");
  // 확인하면 저장된다 — 막기만 하고 저장이 안 되면 그것도 결함이다.
  const confirmed = await save({ confirmed: "yes" });
  eq(confirmed.status, 303, "확인하면 저장이 진행된다");
  eq(fixture.db.transactions.length, before + 1, "확인한 저장은 기록으로 남는다");
} finally {
  fixture.restore();
}

console.log(`V22.8.98 영수증 인식 원값·확인 검사 통과 (${checks} checks)`);
