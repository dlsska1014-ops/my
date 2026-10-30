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
const runtime = await asset("/assets/mobile-home-v22990.js"); // V22.9.85: v22951 보관본 정리 뒤 지금 홈 런타임을 본다.
const review = await asset("/assets/accountbook-quick-input-v22951.js");
const ast = parse(runtime, { ecmaVersion: "latest" });
const functions = new Map();
function visit(node) {
  if (!node || typeof node !== "object") return;
  if (["FunctionDeclaration", "FunctionExpression"].includes(node.type) && node.id) functions.set(node.id.name, runtime.slice(node.start, node.end));
  for (const value of Object.values(node)) if (Array.isArray(value)) value.forEach(visit); else if (value && typeof value === "object") visit(value);
}
visit(ast);
for (const name of ["quickAmountFieldState", "quickSmartInputController", "moneyTokenSpans", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText"]) ok(functions.has(name), "shipped runtime provides " + name);
ok(!review.includes("queueMicrotask"), "review has no capture microtask recovery");
ok(!review.includes("setCustomValidity"), "review does not compete for amount validity");
ok(!runtime.includes("var raw=this.value.replace(/[^0-9]/g"), "destructive legacy inline formatter is absent");
const create = () => {
  const b = createInputBrowser();
  b.run([...functions.entries()].filter(([name]) => ["quickAmountFieldState", "moneyTokenSpans", "explicitDateIntent", "quickInputDate", "parseMobileAmountText", "transactionTypeFromText", "normalizeInputText", "foldInputWidth", "joinSpacedKoreanAmount", "inputPaymentPatterns"].includes(name)).map(([, source]) => source).join("\n"));
  b.run("const state=(" + functions.get("quickSmartInputController") + ")({amount:parseMobileAmountText,date:quickInputDate,type:text=>transactionTypeFromText(text,[]),category:()=>'',payment:()=> '국민카드',memo:text=>text});smartInput=document.getElementById('smartInput');smartInput.addEventListener('input',()=>state.apply(false));");
  b.run(review); return b;
};
for (const raw of ["1e3", "-10", "1.5", "+10", "0x10", "Infinity", "1,,000", "₩-10", "1 000", "12원원", "2,000,000,001", "0"]) {
  const b = create(); b.set("amountInput", raw);
  eq(b.fields.amountInput.value, raw, "invalid source is preserved " + raw);
  ok(!!b.fields.amountInput.validationMessage, "invalid amount owns a validity error " + raw);
  eq(b.button("amount").textContent, "금액 · 형식 확인", "invalid chip is immediate " + raw);
  b.set("payInput", "다른 결제");
  ok(!!b.fields.amountInput.validationMessage, "another field cannot release error " + raw);
  eq(b.fire(b.form, "submit"), false, "invalid submission blocked " + raw);
  b.set("amountInput", "₩12,000");
  eq(b.fields.amountInput.value, "12,000", "currency correction normalized " + raw);
  eq(b.fields.amountInput.validationMessage, "", "currency correction releases validity " + raw);
  eq(b.button("amount").textContent, "금액 · 12,000원", "corrected chip is immediate " + raw);
  eq(b.fire(b.form, "submit"), true, "corrected value can submit " + raw);
}
for (const [raw, expected] of [["₩12,000", "12,000"], ["8,900원", "8,900"], ["￦ 12,000 원", "12,000"], ["1", "1"], ["2000000000", "2,000,000,000"]]) {
  const b = create(); b.set("amountInput", raw);
  eq(b.fields.amountInput.value, expected, "allowed format normalizes " + raw);
  eq(b.fields.amountInput.validationMessage, "", "allowed format valid " + raw);
  eq(b.button("amount").textContent, "금액 · " + expected + "원", "allowed format chip is immediate " + raw);
}
{
  const b = create(); b.set("catInput", "직접분류"); b.smart.value = "어제 점심 12000 국민카드"; b.fire(b.smart, "input");
  for (const [key, text] of [["date", "날짜 · 2026-07-14"], ["amount", "금액 · 12,000원"], ["type", "구분 · 지출"], ["category", "분류 · 직접분류"], ["payment", "결제수단 · 국민카드"]]) eq(b.button(key).textContent, text, "controller completion updates " + key);
}
console.log(`Lucian A native-input contract V22.9.50: ${checks} checks passed`);
