import assert from "node:assert/strict";
import { parse } from "../tools/vendor/acorn.mjs";
import { createInputBrowser } from "./lib-lucian-a-browser.mjs";
import app from "../src/index.js";

let checks = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (value, label) => { assert.ok(value, label); checks++; };
const asset = async path => {
  const response = await app.fetch(new Request("https://malhaebook.com" + path), {}, {});
  eq(response.status, 200, "served asset " + path);
  return response.text();
};
const runtime = await asset("/assets/mobile-home-v229138.js"); // V22.9.85: v22951 보관본 정리 뒤 지금 홈 런타임을 본다.
const review = await asset("/assets/accountbook-quick-input-v229138.js");
const ast = parse(runtime, { ecmaVersion: "latest" });
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (["FunctionDeclaration", "FunctionExpression"].includes(node.type) && node.id) functions.set(node.id.name, runtime.slice(node.start, node.end));
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === "object") visit(value);
}
visit(ast);
for (const name of ["quickAmountFieldState", "quickSmartInputController", "moneyTokenSpans", "quickAmountCount", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText"]) ok(functions.has(name), "shipped runtime provides " + name);
ok(!review.includes("queueMicrotask"), "review has no capture microtask recovery");
ok(!review.includes("setCustomValidity"), "review does not compete for amount validity");
ok(!runtime.includes("var raw=this.value.replace(/[^0-9]/g"), "destructive legacy inline formatter is absent");
// 이 검사의 컨트롤러는 내용 함수를 그대로 돌려주는 대역(memo:text=>text)이라 내용 칸에 문장 전체가 든다 — 미리보기 줄은 실제 칸 값을 그대로 옮긴다.
// (홈의 실제 설정은 stripQuickMemo 로 ‘점심’ 만 남긴다 — validate-v229138-quick-sheet 가 실제 홈 스크립트로 본다.)
const PREVIEW_AFTER_SMART = "지출 · 직접분류 · 어제 점심 12000 국민카드 · 12,000원 · 국민카드 · 어제";
// V22.9.138: 시계를 2026-07-15 12:00 KST 로 묶는다(가짜 화면의 거래일 기본값 2026-07-15 = ‘오늘’, 한 줄 입력의 ‘어제’ = 2026-07-14 = ‘어제’).
const NOW = Date.parse("2026-07-15T12:00:00+09:00");
const create = () => {
  const b = createInputBrowser({ now: NOW });
  b.run([...functions.entries()].filter(([name]) => ["quickAmountFieldState", "moneyTokenSpans", "quickAmountCount", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText", "normalizeInputText", "foldInputWidth", "joinSpacedKoreanAmount", "inputPaymentPatterns", "foreignCurrencyAmountIn"].includes(name)).map(([, source]) => source).join("\n"));
  b.run("const state=(" + functions.get("quickSmartInputController") + ")({amount:parseMobileAmountText,date:quickInputDate,type:text=>transactionTypeFromText(text,[]),category:()=>'',payment:()=> '국민카드',memo:text=>text});smartInput=document.getElementById('smartInput');smartInput.addEventListener('input',()=>state.apply(false));");
  b.run(review); return b;
};
for (const raw of ["1e3", "-10", "1.5", "+10", "0x10", "Infinity", "1,,000", "₩-10", "1 000", "12원원", "2,000,000,001", "0"]) {
  const b = create(); b.set("amountInput", raw);
  eq(b.fields.amountInput.value, raw, "invalid source is preserved " + raw);
  ok(!!b.fields.amountInput.validationMessage, "invalid amount owns a validity error " + raw);
  // V22.9.138(독립 검토): 저장에 꼭 있어야 하는 내용이 비면 줄이 ‘내용 미입력’ 으로 적는다.
  eq(b.preview(), "지출 · 분류 미입력 · 내용 미입력 · 금액 형식 확인 · 오늘", "invalid preview is immediate " + raw);
  b.set("payInput", "다른 결제");
  ok(!!b.fields.amountInput.validationMessage, "another field cannot release error " + raw);
  eq(b.fire(b.form, "submit"), false, "invalid submission blocked " + raw);
  b.set("amountInput", "₩12,000");
  eq(b.fields.amountInput.value, "12,000", "currency correction normalized " + raw);
  eq(b.fields.amountInput.validationMessage, "", "currency correction releases validity " + raw);
  eq(b.preview(), "지출 · 분류 미입력 · 내용 미입력 · 12,000원 · 다른 결제 · 오늘", "corrected preview is immediate " + raw);
  eq(b.fire(b.form, "submit"), true, "corrected value can submit " + raw);
}
for (const [raw, expected] of [["₩12,000", "12,000"], ["8,900원", "8,900"], ["￦ 12,000 원", "12,000"], ["1", "1"], ["2000000000", "2,000,000,000"]]) {
  const b = create(); b.set("amountInput", raw);
  eq(b.fields.amountInput.value, expected, "allowed format normalizes " + raw);
  eq(b.fields.amountInput.validationMessage, "", "allowed format valid " + raw);
  eq(b.preview(), "지출 · 분류 미입력 · 내용 미입력 · " + expected + "원 · 오늘", "allowed format preview is immediate " + raw);
}
{
  const b = create(); b.set("catInput", "직접분류"); b.smart.value = "어제 점심 12000 국민카드"; b.fire(b.smart, "input");
  // V22.9.138 U-16: 다섯 칩 대신 한 줄(구분 · 분류 · 내용 · 금액 · 결제수단 · 날짜). 날짜는 ISO 가 아니라 ‘어제’ 다(V137:H-7).
  // 옛 칩 다섯(날짜·금액·구분·분류·결제수단)이 보던 값을 그 칸에서 하나씩 본다 — 줄은 이 칸들을 옮겨 적는다.
  eq(b.fields.txDate.value, "2026-07-14", "controller completion sets the actual date field");
  eq(b.fields.amountInput.value, "12,000", "controller completion sets the actual amount field");
  eq(b.fields.expense.checked === true && b.fields.income.checked !== true, true, "controller completion keeps the expense type");
  eq(b.fields.catInput.value, "직접분류", "controller completion keeps the typed category");
  eq(b.fields.payInput.value, "국민카드", "controller completion sets the actual payment field");
  eq(b.preview(), PREVIEW_AFTER_SMART, "controller completion updates the preview line");
}
{
  // V22.9.138(독립 검토): 저장을 막는 까닭은 컨트롤러가 #quickAfter 의 data-ab-quick-block 에 안내 글과 같은 차례로 적고(외화·금액 둘·구분·금액·날짜·내용),
  // 해석 결과 한 줄과 [고치기]가 안내 글이 아니라 그 값을 본다. 실제 홈 런타임의 해석 함수로 문장마다 컨트롤러의 값·안내 글·줄·[고치기]의 초점·3층·구분 묶음 표시를 본다.
  const SCENES = [
    ["점심 결제 취소 12000", "type", "결제·승인 취소 내역입니다. 수입 또는 지출을 직접 선택한 뒤 저장해 주세요.", "구분 확인 필요 · 분류 미입력 · 점심 결제 취소 12000 · 12,000원 · 국민카드 · 오늘", "expense", false, true],
    ["커피 4500 점심 9000", "split", "금액이 둘 이상이에요. 여기서는 한 번에 한 건만 저장돼요. 한 건씩 나눠 적어 주세요.", "지출 · 분류 미입력 · 커피 4500 점심 9000 · 금액 둘 이상 · 국민카드 · 오늘", "smartInput", false, false],
    ["커피 $5", "foreign", "외화 금액은 원화로 바꿔 적어 주세요(예: 커피 130000원). 금액 칸에 원화 금액을 직접 넣어도 돼요.", "지출 · 분류 미입력 · 커피 5 · 금액 미입력 · 국민카드 · 오늘", "amountInput", false, false],
    ["커피 5달러", "amount", "금액이 분명하지 않습니다. 유효한 금액을 직접 입력하거나 문장을 고쳐 주세요.", "지출 · 분류 미입력 · 커피 5달러 · 금액 미입력 · 국민카드 · 오늘", "amountInput", false, false],
    ["2월 30일 점심 12000", "date", "달력에 없는 날짜입니다. 유효한 날짜를 직접 선택하거나 문장을 고쳐 주세요.", "지출 · 분류 미입력 · 2월 30일 점심 12000 · 12,000원 · 국민카드 · 날짜 미입력", "txDate", true, false],
    ["점심 12000", "", null, "지출 · 분류 미입력 · 점심 12000 · 12,000원 · 국민카드 · 오늘", "catInput", true, false],
  ];
  for (const [text, block, afterText, line, focus, opened, marked] of SCENES) {
    const b = create(); const more = b.body.querySelector("#quickMore"); more.open = false;
    b.smart.value = text; b.fire(b.smart, "input");
    eq(b.fields.after.getAttribute("data-ab-quick-block"), block, "controller names the block for " + text);
    if (afterText !== null) eq(b.fields.after.textContent, afterText, "the hint by the save button agrees for " + text);
    eq(b.preview(), line, "the preview line names the block for " + text);
    b.click(b.fix());
    const active = b.document.activeElement;
    eq(active.id || active.getAttribute("value"), focus, "fix goes to the blocking field for " + text);
    eq(more.open, opened, "fix opens the third tier only for its own fields: " + text);
    eq(b.body.querySelector(".seg").hasAttribute("data-ab-fix-target"), marked, "the type group is marked only for the type: " + text);
  }
  {
    // 금액 칸만 채우면 내용이 비어 저장 단추가 꺼진다 — 줄은 ‘내용 미입력’, [고치기]는 내용 칸(1층).
    const b = create(); const more = b.body.querySelector("#quickMore"); more.open = false;
    b.set("amountInput", "12000");
    eq(b.fields.after.getAttribute("data-ab-quick-block"), "memo", "an empty memo is the block when only the amount is set");
    eq(b.fields.after.textContent, "내용을 적으면 저장할 수 있어요", "the hint asks for the memo");
    eq(b.preview(), "지출 · 분류 미입력 · 내용 미입력 · 12,000원 · 오늘", "the preview line names the empty memo");
    b.click(b.fix()); eq(b.document.activeElement, b.fields.memoInput, "fix goes to the memo"); eq(more.open, false, "the memo fix keeps the third tier folded");
  }
  {
    // 구분을 고르면 구분 물음과 묶음 표시가 함께 풀린다.
    const b = create(); b.smart.value = "점심 결제 취소 12000"; b.fire(b.smart, "input"); b.click(b.fix());
    b.fields.expense.checked = true; b.fire(b.fields.expense, "change");
    eq(b.fields.after.getAttribute("data-ab-quick-block"), "", "choosing a type clears the type block");
    eq(b.body.querySelector(".seg").hasAttribute("data-ab-fix-target"), false, "choosing a type clears the mark");
    eq(b.preview(), "지출 · 분류 미입력 · 점심 결제 취소 12000 · 12,000원 · 국민카드 · 오늘", "choosing a type clears the type question");
  }
}
console.log(`Lucian A native-input contract V22.9.50: ${checks} checks passed`);
