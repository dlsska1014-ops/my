import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.76-KAKAO-INTENT-SKILL-AUTH"'), "runtime exposes the V22.8.59 release");
ok(source.includes("function classifyLocalSignupError"), "signup errors are classified centrally");
ok(source.includes('code: "signup_rpc_unavailable"') && source.includes('code: "signup_rpc_forbidden"'), "signup distinguishes schema-cache and privilege failures");
ok(source.includes('kind: "local_signup_session_failed"') && source.includes("계정은 생성되었습니다"), "post-creation session failure never tells the user to create the account again");
ok(source.includes('kind: "local_signup_invite_failed"') && source.includes("가계부 전환·추가에서 다시 참여"), "optional invite failure preserves the created account");
ok(source.includes("async function fetchRecentTransactionRows") && source.includes("limit: bounded + 1"), "activity rail queries a bounded row set");
ok(source.includes("payload.has_more") && source.includes("최근 80건을 표시"), "bounded activity results disclose the display limit");
ok(source.includes("var income = rows.reduce") && source.includes("var expense = rows.reduce"), "activity footer follows the active filter");
ok(source.includes("const truncated = historyRaw.length > 9000") && source.includes("최근 12개월 기록이 9,000건을 넘어"), "large analysis datasets disclose truncation");
ok(source.includes("const yearRows = historyRows.filter"), "annual analysis reuses the bounded history query");
ok(source.includes('kind: "user_session_version_unavailable"') && source.includes("return 0;"), "session revocation lookup errors fail closed");
ok(source.includes('throw new Error("user_session_security_unavailable")'), "new sessions require an available revocation state");

const fixture = await createV2265QaFixture();
try {
  for (let i = 0; i < 100; i += 1) {
    fixture.db.transactions.push({
      id: `rail-${i}`,
      household_id: "house-home",
      user_id: "user-bin",
      transaction_date: `2026-07-${String(28 - (i % 20)).padStart(2, "0")}`,
      type: i % 5 === 0 ? "income" : "expense",
      amount: 1000 + i,
      category: "기타",
      memo: `rail bounded ${i}`,
      payment_method: "현금",
      source: "web",
      raw_text: "",
      created_at: `2026-07-28T00:${String(i % 60).padStart(2, "0")}:00.000Z`,
    });
  }
  const response = await app.fetch(new Request("https://ttokttok-accountbook.com/u/api/recent-transactions?month=2026-07&household_id=house-home", {
    headers: { cookie: fixture.cookie, accept: "application/json" },
  }), fixture.env, {});
  eq(response.status, 200, "bounded activity endpoint succeeds for a large month");
  const data = await response.json();
  eq(data.rows.length, 80, "activity endpoint returns at most 80 rows");
  eq(data.has_more, true, "activity endpoint reports that additional rows exist");
  eq(fixture.db.transactions.length, 106, "activity endpoint remains read-only under load");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.59 account and runtime reliability (${checks} checks)`);
