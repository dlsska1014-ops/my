import assert from "node:assert/strict";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const hash = (text) => {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};
async function say(fixture, utterance, group = "") {
  const key = "kakao_login:2265";
  const response = await app.fetch(new Request("https://malhaebook.com/skill", {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({
      userRequest: { utterance, user: { id: key, properties: { botUserKey: key, ...(group ? { botGroupKey: group } : {}) } } },
      bot: { id: "fixture-bot" }, intent: { id: "fixture-intent", name: "폴백블록" },
      action: { params: {}, detailParams: {} },
    }),
  }), fixture.env, {});
  const data = await response.json();
  eq(response.status, 200, "skill failure and success paths remain Kakao-safe HTTP 200");
  eq(data.version, "2.0", "response uses the Kakao skill schema");
  ok(Array.isArray(data.template?.outputs) && data.template.outputs.length > 0, "response has visible output");
  return JSON.stringify(data);
}

// A transient DB outage must not erase an existing group link or create a transaction.
for (const failure of ["http503", "network"]) {
  const fixture = await createV2265QaFixture();
  try {
    const group = `stability-${failure}`;
    const item = { group_key: group, household_id: "house-home", household_name: "집", linked_by: "user-bin" };
    const itemKey = `kakao_group_link_v2254:${hash(group)}:${hash([...group].reverse().join(""))}`;
    fixture.db.accountbook_settings.push(
      { id: `link-${failure}`, key: itemKey, value: JSON.stringify(item) },
      { id: `legacy-${failure}`, key: "kakao_group_links", value: JSON.stringify({ [group]: item }) },
    );
    const before = fixture.db.transactions.length;
    const baseFetch = globalThis.fetch;
    let failures = 0;
    let deletes = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (init.method === "DELETE") deletes += 1;
      if (url.pathname === "/rest/v1/households" && url.searchParams.get("id") === "eq.house-home") {
        failures += 1;
        if (failure === "network") throw new TypeError("synthetic network outage");
        return new Response('{"message":"synthetic DB outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    await say(fixture, "장애보호 6200원", group);
    ok(failures > 0, "the real group lookup failure was exercised");
    eq(deletes, 0, "transient failure never deletes a group link");
    ok(fixture.db.accountbook_settings.some((row) => row.key === itemKey), "authoritative group link survives");
    ok(JSON.parse(fixture.db.accountbook_settings.find((row) => row.key === "kakao_group_links").value)[group], "legacy group link survives");
    eq(fixture.db.transactions.length, before, "failed lookup creates no records");
  } finally { fixture.restore(); }
}

// A numeric reply belongs to an existing edit session even if its DB read fails.
for (const failRead of [true, false]) {
  const fixture = await createV2265QaFixture();
  try {
    const date = new Date(Date.now() + 9 * 3600000).toISOString().slice(0, 10);
    const row = { id: `edit-stability-${failRead}`, household_id: "house-home", user_id: "user-bin", source_user_key: "kakao_login:2265", transaction_date: date, type: "expense", amount: 4500, category: "카페/간식", memo: "기존 기록", payment_method: "현금", source: "kakao_skill", created_at: new Date().toISOString() };
    const key = `kakao_edit_v4:${hash("direct")}:kakao_login:2265`;
    const value = JSON.stringify({ entryNo: "01", entryId: row.id, entryDate: date, householdId: "house-home", userId: "user-bin", step: "awaiting_value", field: "amount", valueOptions: null, pendingField: null, pendingValue: null, repeatCount: 0, totalTurns: 0, guardCount: 0, lastBotMsg: "금액을 입력해 주세요.", updatedAt: Date.now() });
    fixture.db.transactions.push(row);
    fixture.db.accountbook_settings.push({ id: `session-${failRead}`, key, value });
    const before = fixture.db.transactions.length;
    const baseFetch = globalThis.fetch;
    let readFailures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (failRead && url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.${key}`) {
        readFailures += 1;
        return new Response('{"message":"synthetic session outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    await say(fixture, "13000");
    eq(fixture.db.transactions.length, before, "numeric edit reply never creates another transaction");
    eq(fixture.db.transactions.find((item) => item.id === row.id).amount, failRead ? 4500 : 13000, "only a verified edit session changes the original amount");
    if (failRead) {
      eq(readFailures, 1, "session read failure is exercised");
      eq(fixture.db.accountbook_settings.find((item) => item.key === key).value, value, "failed read preserves the active edit session");
    }
  } finally { fixture.restore(); }
}

// Failed flow or selected-household reads preserve the pending budget operation.
for (const failedState of ["flow", "selected"]) {
  const fixture = await createV2265QaFixture();
  try {
    const flowKey = `kakao_flow_v215:user-bin:${hash("direct")}`;
    const selectedKey = "kakao_selected_household_v2251:user-bin";
    const flowValue = JSON.stringify({ flow: "budget_setup", step: "amount", data: { household_id: "house-home", month: "2026-10", category: "__total" }, attempts: 0, state_version: "v2254", expires_at: Date.now() + 30 * 60000 });
    fixture.db.accountbook_settings.push({ id: "flow-state", key: flowKey, value: flowValue }, { id: "selected-state", key: selectedKey, value: "house-home" });
    const failedKey = failedState === "flow" ? flowKey : selectedKey;
    const before = fixture.db.transactions.length;
    const budgets = JSON.stringify(fixture.db.accountbook_budgets);
    const baseFetch = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.${failedKey}`) {
        failures += 1;
        return new Response('{"message":"synthetic state outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    await say(fixture, failedState === "flow" ? "3000000" : "3189420");
    ok(failures > 0, "pending budget state read failure is exercised");
    eq(fixture.db.transactions.length, before, "budget amount never becomes a transaction during a state outage");
    eq(JSON.stringify(fixture.db.accountbook_budgets), budgets, "unverified budget state never changes a budget");
    eq(fixture.db.accountbook_settings.find((row) => row.key === flowKey).value, flowValue, "pending budget flow is preserved");
    eq(fixture.db.accountbook_settings.find((row) => row.key === selectedKey).value, "house-home", "selected household is preserved");
  } finally { fixture.restore(); }
}

// An unreadable authoritative group row must never fall back to an old mirror.
{
  const fixture = await createV2265QaFixture();
  try {
    const group = "stability-authoritative-read";
    const key = `kakao_group_link_v2254:${hash(group)}:${hash([...group].reverse().join(""))}`;
    const item = { group_key: group, household_id: "house-home", linked_by: "user-bin" };
    const value = JSON.stringify(item);
    fixture.db.accountbook_settings.push({ id: "primary-link", key, value }, { id: "old-mirror", key: "kakao_group_links", value: JSON.stringify({ [group]: { ...item, household_id: "house-trip" } }) });
    const before = fixture.db.transactions.length;
    const baseFetch = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.${key}`) {
        failures += 1;
        return new Response('{"message":"synthetic link outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    await say(fixture, "커피 6321원", group);
    eq(failures, 1, "authoritative link failure is exercised");
    eq(fixture.db.transactions.length, before, "authoritative read failure never stores in the mirror household");
    eq(fixture.db.accountbook_settings.find((row) => row.key === key).value, value, "authoritative link is preserved");
  } finally { fixture.restore(); }
}

// Legacy-only rooms retain their existing link when the mirror cannot be read.
{
  const fixture = await createV2265QaFixture();
  try {
    const group = "stability-legacy-read";
    const legacy = JSON.stringify({ [group]: { group_key: group, household_id: "house-home", linked_by: "user-bin" } });
    fixture.db.accountbook_settings.push({ id: "legacy-only", key: "kakao_group_links", value: legacy });
    fixture.db.household_members.find((row) => row.household_id === "house-home" && row.user_id === "user-bin").role = "member";
    const before = fixture.db.transactions.length;
    const baseFetch = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === "eq.kakao_group_links") {
        failures += 1;
        return new Response('{"message":"synthetic legacy outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    await say(fixture, "단톡방 연결 TRIP2265", group);
    ok(failures > 0, "legacy read failure is exercised");
    eq(fixture.db.accountbook_settings.find((row) => row.key === "kakao_group_links").value, legacy, "existing legacy connection is preserved");
    ok(!fixture.db.accountbook_settings.some((row) => row.key.startsWith("kakao_group_link_v2254:")), "legacy read failure never authorizes a replacement link");
    eq(fixture.db.transactions.length, before, "legacy read failure creates no records");
  } finally { fixture.restore(); }
}

// Persist selection before acknowledging it or clearing the choice flow.
{
  const fixture = await createV2265QaFixture();
  try {
    const flowKey = `kakao_flow_v215:user-bin:${hash("direct")}`;
    const selectedKey = "kakao_selected_household_v2251:user-bin";
    const flow = JSON.stringify({ flow: "household_choice", step: "choose", data: { action: "select", household_ids: ["house-home", "house-trip"] }, attempts: 0, state_version: "v2254", expires_at: Date.now() + 30 * 60000 });
    fixture.db.accountbook_settings.push({ id: "choice-flow", key: flowKey, value: flow }, { id: "selected-choice", key: selectedKey, value: "house-home" });
    const baseFetch = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/accountbook_settings" && init.method === "POST" && JSON.parse(init.body || "{}").key === selectedKey) {
        failures += 1;
        return new Response('{"message":"synthetic selection outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    const reply = await say(fixture, "2");
    eq(failures, 1, "selected-household write failure is exercised");
    ok(!reply.includes("선택했어요"), "failed selection is never acknowledged as successful");
    eq(fixture.db.accountbook_settings.find((row) => row.key === selectedKey).value, "house-home", "previous selection survives failed write");
    eq(fixture.db.accountbook_settings.find((row) => row.key === flowKey).value, flow, "choice flow survives failed selection and supports retry");
  } finally { fixture.restore(); }
}

// Slow duplicate lookups are bounded, ordered and fail closed before any INSERT.
for (const failLookup of [false, true]) {
  const fixture = await createV2265QaFixture();
  try {
    fixture.db.accountbook_settings.push({ id: "selected-stability", key: "kakao_selected_household_v2251:user-bin", value: "house-home" });
    const amountBase = failLookup ? 4600 : 4500;
    const before = fixture.db.transactions.length;
    const baseFetch = globalThis.fetch;
    let active = 0;
    let peak = 0;
    let reads = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/transactions" && url.searchParams.has("amount")) {
        reads += 1;
        active += 1;
        peak = Math.max(peak, active);
        try {
          await new Promise((resolve) => setTimeout(resolve, 210));
          if (failLookup && url.searchParams.get("amount") === `eq.${amountBase + 2}`) return new Response('{"message":"synthetic duplicate lookup outage"}', { status: 503 });
          return await baseFetch(input, init);
        } finally { active -= 1; }
      }
      return baseFetch(input, init);
    };
    const utterance = Array.from({ length: 25 }, (_, index) => `커피${String.fromCharCode(0xAC00 + index)} ${amountBase + index}원`).join("; ");
    const start = performance.now();
    await say(fixture, utterance);
    const elapsed = Math.round(performance.now() - start);
    eq(peak, 5, "duplicate checks run with a maximum concurrency of five");
    if (failLookup) {
      eq(reads, 5, "failed batch prevents later lookup batches");
      eq(fixture.db.transactions.length, before, "one failed duplicate check prevents all inserts");
      await new Promise((resolve) => setTimeout(resolve, 25));
    } else {
      eq(reads, 25, "every submitted row is checked for duplicates");
      eq(fixture.db.transactions.length - before, 25, "all valid rows are saved exactly once");
      const saved = fixture.db.transactions.slice(before);
      eq(saved.map((row) => row.amount).join(","), Array.from({ length: 25 }, (_, index) => amountBase + index).join(","), "saved rows retain submitted order");
      ok(elapsed < 2500, `25 slow lookups complete below 2.5 seconds (${elapsed}ms)`);
      console.log(`25-row skill fixture latency: ${elapsed}ms (210ms per duplicate lookup)`);
    }
  } finally { fixture.restore(); }
}

console.log(`Skill stability regression PASS (${checks} checks)`);
