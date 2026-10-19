import assert from "node:assert/strict";
import { mkdirSync, writeFileSync, readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, app, fixture, post, withClock } from "./lib-audit-v22934.mjs";
import { moneyTokenSpans } from "../src/modules/client/shared-input-parsers.js";
let checks = 0;
const records = [];
const ok = (value, label) => { assert.ok(value, label); checks++; };
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks++; };
const params = response => new URL(response.location, BASE).searchParams;
const base = { household_id: "house-home", month: "2026-07", transaction_date: "2026-07-15", type: "expense", amount: "7000", memo: "점심", category: "식비", payment_method: "현금", user_id: "user-bin", raw_text: "점심 7000원 현금", quick_manual_amount: "1", quick_manual_date: "1", return_to: "/app?month=2026-07&household_id=house-home" };
await withClock("2026-07-15", async () => {
  await fixture(async fx => {
    const invalid = ["0", "2,000,000,001", "1.5", "1,,000", ",1000", "1000,", "1 000", "1e3", "+10", "-10", "0x10", "Infinity", "12원원"];
    for (const amount of invalid) {
      const before = structuredClone(fx.db.transactions);
      const added = await post(fx, "/admin/transactions", { ...base, amount });
      eq(fx.db.transactions, before, "add preserves rows for " + amount);
      ok(!!params(added).get("err"), "add refuses " + amount);
      const edited = await post(fx, "/admin/update", { ...base, id: "tx-expense-1", amount });
      eq(fx.db.transactions, before, "update preserves rows for " + amount);
      ok(!!params(edited).get("err"), "update refuses " + amount);
      records.push({ test: "server amount refusal", raw: amount, add: added.location, update: edited.location, newRows: fx.db.transactions.length - before.length });
    }
    for (const amount of ["1", "2,000,000,000", "₩12,345", "8,900원"]) {
      const before = fx.db.transactions.length;
      const response = await post(fx, "/admin/transactions", { ...base, amount, memo: "정상 금액 " + amount, raw_text: "", request_id: crypto.randomUUID() });
      eq(fx.db.transactions.length, before + 1, "valid add " + amount);
      const row = fx.db.transactions.at(-1);
      eq(row.amount, Number(amount.replace(/[^0-9]/g, "")), "valid source amount stored exactly " + amount);
      ok(!!params(response).get("saved_rid"), "confirmed request receipt " + amount);
      records.push({ test: "server valid amount", raw: amount, row: structuredClone(row), location: response.location });
    }
    const row = fx.db.transactions.find(row => row.id === "tx-expense-1");
    await post(fx, "/admin/update", { ...base, id: row.id, amount: "₩12,345", raw_text: "" });
    eq(fx.db.transactions.find(item => item.id === row.id).amount, 12345, "manual correction can update the stored row");
    for (const text of ["점심 -10원", "점심 - 10원", "점심 1.5원", "점심 0.00001만원"]) {
      const count = fx.db.transactions.length;
      const response = await post(fx, "/admin/transactions", { ...base, raw_text: text, amount: "10", quick_manual_amount: "0" });
      eq(params(response).get("err"), "amount_required", "server rejects invalid automatic source " + text);
      eq(fx.db.transactions.length, count, "automatic source refusal stores zero rows");
      await post(fx, "/admin/transactions", { ...base, memo: text, raw_text: text, amount: "10", quick_manual_amount: "1", request_id: crypto.randomUUID() });
      eq(fx.db.transactions.length, count + 1, "explicit manual correction remains available " + text);
    }
  });
  await fixture(async fx => {
    for(const path of ["/admin/transactions","/my/transactions"]){
      const before=fx.db.transactions.length;
      const amount=path==="/admin/transactions"?"5000":"6000";
      const response=await post(fx,path,{...base,memo:"",category:"",payment_method:"",raw_text:`커피 ${amount}원 국민카드`,amount,quick_manual_category:"1",quick_manual_payment:"1",request_id:crypto.randomUUID()});
      eq(fx.db.transactions.length,before+1,"manual empty fields save once "+path);
      const row=fx.db.transactions.at(-1);eq([row.memo,row.category,row.payment_method],["","",""],"manual empty memo category payment survive server classification "+path);
      records.push({test:"manual empty fields",path,location:response.location,row:structuredClone(row)});
    }
    const count=fx.db.transactions.length;
    const emptyDate=await post(fx,"/admin/transactions",{...base,transaction_date:"",quick_manual_date:"1"});
    ok(!!params(emptyDate).get("err"),"explicitly cleared manual date is not defaulted to today");
    eq(fx.db.transactions.length,count,"manual empty date stores zero rows");
  });
  await fixture(async fx => {
    for (const path of ["/admin/budget/save", "/my/budget/save"]) {
      const form = { household_id: "house-home", month: "2026-07", category: "__total", amount: "0", return_to: "/my/settings?household_id=house-home&month=2026-07" };
      const zero = await post(fx, path, form);
      ok(!params(zero).get("err"), "optional budget amount still permits explicit zero " + path);
      for (const amount of ["", "abc", "1,,000", "1.5"]) {
        const refused = await post(fx, path, { ...form, amount });
        ok(!!params(refused).get("err"), "optional budget blank or invalid is not zero " + path + "/" + amount);
      }
    }
  });
  await fixture(async fx => {
    const request_id = crypto.randomUUID(), token = crypto.randomUUID();
    const first = await post(fx, "/admin/transactions", { ...base, request_id, quick_draft_token: token });
    const original = structuredClone(fx.db.transactions.find(row => row.id === request_id));
    ok(!!original, "first request creates row");
    eq(params(first).get("saved_qd"), token, "receipt is tied to submitted draft token");
    const afterFirst = structuredClone(fx.db.transactions);
    const same = await post(fx, "/admin/transactions", { ...base, request_id, quick_draft_token: token });
    eq(params(same).get("msg"), "already_saved", "same ID and same fields is an exact replay");
    eq(fx.db.transactions, afterFirst, "exact replay creates no row");
    for (const changed of [{ amount: "12000" }, { memo: "다른 메모" }, { category: "다른 분류" }, { payment_method: "국민카드" }, { transaction_date: "2026-07-14" }, { type: "income" }, { user_id: "user-wifi" }, { raw_text: "다른 원문 7000원" }]) {
      const response = await post(fx, "/admin/transactions", { ...base, request_id, ...changed });
      eq(params(response).get("err"), "request_conflict", "changed field conflicts " + Object.keys(changed)[0]);
      eq(params(response).get("rid"), request_id, "conflict retains request identity");
      eq(fx.db.transactions, afterFirst, "conflict preserves all rows " + Object.keys(changed)[0]);
      ok(!params(response).has("saved_qd") && !params(response).has("msg"), "conflict issues no success receipt");
      records.push({ test: "request conflict", submitted: { ...base, request_id, ...changed }, location: response.location, row: original, newRows: 0 });
    }
    // A different row matching the edited retry must not conceal the original ID conflict.
    await post(fx, "/admin/transactions", { ...base, amount: "12000", memo: "별도 기록", request_id: crypto.randomUUID() });
    const count = fx.db.transactions.length;
    const response = await post(fx, "/admin/transactions", { ...base, request_id, amount: "12000", memo: "별도 기록" });
    eq(params(response).get("err"), "request_conflict", "ID conflict wins over content duplicate suppression");
    eq(fx.db.transactions.length, count, "edited retry matching another row still creates zero rows");
  });
  await fixture(async fx => {
    const fetchFixture = globalThis.fetch;
    const request_id = crypto.randomUUID();
    let drop = true, rejectRead = false, inserts = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input?.url || input)), method = String(init.method || "GET");
      if (url.pathname === "/rest/v1/transactions" && method === "POST") {
        inserts++;
        const response = await fetchFixture(input, init);
        if (drop) { drop = false; rejectRead = true; throw new TypeError("fixture response lost after commit"); }
        return response;
      }
      if (rejectRead && url.pathname === "/rest/v1/transactions" && url.searchParams.has("id")) { rejectRead = false; throw new TypeError("fixture reconciliation unavailable"); }
      return fetchFixture(input, init);
    };
    try {
      const first = await post(fx, "/admin/transactions", { ...base, request_id });
      eq(params(first).get("err"), "db_write_unknown", "lost response and failed read remain unknown");
      const retry = await post(fx, "/admin/transactions", { ...base, request_id, amount: "12000" });
      eq(params(retry).get("err"), "request_conflict", "edited retry after unknown is not success");
      const rows = fx.db.transactions.filter(row => row.id === request_id);
      eq(rows.length, 1, "unknown retry leaves exactly one final row"); eq(rows[0].amount, 7000, "unknown retry preserves 7000 won");
      eq(inserts, 1, "known ID conflict is detected before another insert");
      records.push({ test: "unknown then edited retry", first: first.location, retry: retry.location, inserts, rows: structuredClone(rows) });
    } finally { globalThis.fetch = fetchFixture; }
  });
});
for (const text of ["점심 -10원", "점심 - 10원", "점심 +10원", "점심 1.5원", "점심 0.00001만원", "점심 1,,000원", "점심 ,1000원", "점심 1e3원", "점심 0만원", "점심 0.0만원", "점심 0억원", "점심 -₩1000", "점심 −1000원", "점심 ₩-1000원", "점심 1.5.0원"]) eq(moneyTokenSpans(text), [], "invalid natural-language amount " + text);
for (const [text, amount] of [["점심 1.5만원",15000],["점심 1.5 만원",15000],["점심 0.5천원",500],["점심 0.29백원",29],["점심 1만5천원",15000],["점심 0만5천원",5000],["점심 1억0만원",100000000],["점심 5000원.",5000],["주유 1.5만원.",15000],["계란 10구 6000원",6000],["10/3 52000 마트",52000],["국민카드 (1234) 승인 7000원 누적 50000원",7000]]) eq(moneyTokenSpans(text)[0]?.amount, amount, "exact natural-language amount " + text);
if (process.argv.includes("--out")) {
  const out = resolve(process.argv[process.argv.indexOf("--out") + 1]);
  const repo = resolve(fileURLToPath(new URL("../", import.meta.url)));
  assert.ok(out !== repo && !out.startsWith(repo + (process.platform === "win32" ? "\\" : "/")), "evidence stays outside repository");
  mkdirSync(out, { recursive: true });
  writeFileSync(join(out,"server-regression.json"),JSON.stringify({ node:process.version, sourceSha256:createHash("sha256").update(readFileSync(new URL("../src/index.js",import.meta.url))).digest("hex"),checks,records },null,2));
}
console.log(`Lucian six fixes V22.9.51: ${checks} checks passed`);
