import assert from "node:assert/strict";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const fixture = await createV2265QaFixture();
const fixtureFetch = globalThis.fetch;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1] || "";
  if (!rpc) return fixtureFetch(input, init);
  const body = init.body ? JSON.parse(String(init.body)) : {};
  if (rpc === "accountbook_update_transaction_v227") {
    const row = fixture.db.transactions.find((item) => item.id === body.p_transaction_id && item.household_id === body.p_household_id);
    if (!row) return json({ message: "transaction_not_found" }, 404);
    Object.assign(row, body.p_patch || {});
    return json(row);
  }
  if (rpc === "accountbook_delete_transaction_v227") {
    const index = fixture.db.transactions.findIndex((item) => item.id === body.p_transaction_id && item.household_id === body.p_household_id);
    if (index < 0) return json({ message: "transaction_not_found" }, 404);
    const [row] = fixture.db.transactions.splice(index, 1);
    return json({ deleted: true, id: row.id });
  }
  return fixtureFetch(input, init);
};

async function post(path, entries, extraHeaders = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, String(value));
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method: "POST",
    redirect: "manual",
    headers: {
      cookie: fixture.cookie,
      "content-type": "application/x-www-form-urlencoded",
      ...extraHeaders,
    },
    body,
  }), fixture.env, {});
}

const editEntries = [
  ["id", "tx-expense-2"],
  ["household_id", "house-home"],
  ["month", "2026-07"],
  ["type", "expense"],
  ["transaction_date", "2026-07-07"],
  ["amount", "72000"],
  ["category", "교통"],
  ["memo", "주유"],
  ["payment_method", "현대카드"],
  ["user_id", "user-wifi"],
  ["return_to", "/app?month=2026-07&household_id=house-home&feed=all#feed"],
];

try {
  let response = await post("/admin/update", editEntries, {
    origin: "null",
    referer: "android-app://com.kakao.talk",
  });
  eq(response.status, 303, "Kakao WebView record edit reaches the mutation handler");
  eq(fixture.db.transactions.find((row) => row.id === "tx-expense-2")?.user_id, "user-wifi", "spender update is persisted");
  ok(String(response.headers.get("location") || "").includes("msg=updated"), "record edit returns to the record list with completion state");

  response = await post("/admin/update", editEntries.map(([key, value]) => key === "amount" ? [key, "99000"] : [key, value]), {
    origin: "https://evil.example",
    "sec-fetch-site": "cross-site",
  });
  eq(response.status, 403, "foreign record edit is rejected before mutation");
  eq(Number(fixture.db.transactions.find((row) => row.id === "tx-expense-2")?.amount), 72000, "blocked request leaves the stored amount unchanged");

  response = await post("/admin/delete", [
    ["id", "tx-expense-2"],
    ["household_id", "house-home"],
    ["month", "2026-07"],
    ["return_to", "/app?month=2026-07&household_id=house-home&feed=all#feed"],
  ], {
    origin: "null",
    referer: "android-app://com.kakao.talk",
  });
  eq(response.status, 303, "Kakao WebView record delete reaches the mutation handler");
  ok(!fixture.db.transactions.some((row) => row.id === "tx-expense-2"), "record delete is persisted");
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}

console.log(`V22.7.3 WebView record mutation smoke passed: ${checks} checks`);
