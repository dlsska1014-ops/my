// V22.9.29: month-end dates, honest role/search UX, and unknown-write safety.
// All writes below are isolated in-memory fixtures, never production requests.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { normalizeRecurringDay, householdJoinFeedback, supabase, supabaseExactCount, isUncertainStorageWrite, isDefiniteStorageFailure, createUserHousehold, ensureUser, ensureKakaoLoginUser, formatMessage, purgeHouseholdData, joinHouseholdByCode } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const eq = (a, b, label) => { assert.equal(a, b, label); checks++; };
const ok = (a, label) => { assert.ok(a, label); checks++; };
const rejects = async (promise, predicate, label) => { await assert.rejects(promise, predicate, label); checks++; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const patch = readFileSync(new URL("../migrations/01_FIX_RECURRING_MONTH_END_V22_9_29.sql", import.meta.url), "utf8");
const rollback = readFileSync(new URL("../migrations/02_ROLLBACK_RECURRING_MONTH_END_V22_9_29.sql", import.meta.url), "utf8");
const BASE = "https://malhaebook.com";
async function call(fixture, method, path, values) {
  const headers = { cookie: fixture.cookie, accept: "text/html,application/xhtml+xml" };
  const body = values ? new URLSearchParams(values).toString() : undefined;
  if (method !== "GET") Object.assign(headers, { "content-type": "application/x-www-form-urlencoded", origin: BASE, referer: BASE + "/app?household_id=house-home", "sec-fetch-site": "same-origin" });
  return app.fetch(new Request(BASE + path, { method, headers, body }), fixture.env, { waitUntil() {} });
}
const rpc = (fixture, month) => supabase(fixture.env, "/rest/v1/rpc/accountbook_apply_recurring_v227", { method: "POST", body: JSON.stringify({ p_household_id: "house-home", p_month: month }) });

for (const [input, expected] of [[1, 1], [28, 28], [29, 29], [30, 30], [31, 31], [99, 31], [0, 1], [-1, 1], ["bad", 1], [null, 1], [30.8, 31]]) eq(normalizeRecurringDay(input), expected, "recurring day normalization: " + input);
ok(patch.includes("security definer") && patch.includes("set search_path = public"), "SQL retains definer and search path");
ok(patch.includes("to_date(p_month || '-01'") && patch.includes("interval '1 month' - interval '1 day'"), "SQL uses target month, not current date or fixed day 28");
ok(!patch.includes("least(28,"), "new SQL removes fixed day-28 clamp");
ok(rollback.includes("least(28,"), "rollback retains the verified previous definition");
ok(patch.includes("on conflict do nothing") && patch.includes("recurring_spender_required"), "SQL preserves deduplication and whole-batch spender rejection");
ok(!/alter\s+table|drop\s+table|truncate\s+/i.test(patch), "targeted patch does not alter or delete production tables");
ok(!source.includes("unsafeMonthEndRules"), "old manual guard is removed only in SQL-first version");
ok(source.includes('name="day_of_month" min="1" max="31"'), "admin day input supports day 31");

// Independent calendar expectations, including February and year boundary.
for (const [month, lastDay] of [["2026-07", 31], ["2026-04", 30], ["2025-02", 28], ["2024-02", 29], ["2000-02", 29], ["2026-12", 31], ["2027-01", 31]]) {
  const fixture = await createV2265QaFixture();
  try {
    fixture.db.accountbook_recurring = [1, 28, 29, 30, 31, null].map((day, i) => ({ id: "calendar-" + i, household_id: "house-home", user_id: "user-bin", type: i === 0 ? "income" : "expense", amount: 10000 + i, memo: "calendar " + i, category: "QA", payment_method: "QA", day_of_month: day, is_active: i === 5 ? null : true }));
    let result = await rpc(fixture, month);
    eq(result.inserted, 6, month + " inserts every eligible rule");
    for (const [i, day] of [1, 28, 29, 30, 31, null].entries()) {
      const row = fixture.db.transactions.find(t => t.raw_text === "recurring:calendar-" + i + ":" + month);
      eq(row?.transaction_date, month + "-" + String(Math.min(lastDay, day ?? 1)).padStart(2, "0"), month + " actual rule date " + day);
      eq(fixture.db.accountbook_recurring[i].last_applied_month, month, "applied marker follows confirmed insert");
    }
    const count = fixture.db.transactions.length;
    result = await rpc(fixture, month);
    eq(result.inserted, 0, "same month repeat is idempotent");
    eq(fixture.db.transactions.length, count, "repeat produces no extra transaction");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  try {
    const before = JSON.stringify(fixture.db.transactions);
    fixture.db.household_members.find(m => m.household_id === "house-home" && m.user_id === "user-wifi").role = "blocked";
    fixture.db.accountbook_recurring.push({ id: "blocked-rule", household_id: "house-home", user_id: "user-wifi", amount: 31000, day_of_month: 31, is_active: true });
    await rejects(rpc(fixture, "2026-07"), e => /recurring_spender_required/.test(e.message), "blocked spender rejects the complete batch");
    eq(JSON.stringify(fixture.db.transactions), before, "rejected batch changes no transaction");
    ok(!fixture.db.accountbook_recurring.find(r => r.id === "blocked-rule").last_applied_month, "rejected batch publishes no applied marker");
    fixture.db.accountbook_recurring = [{ id: "inactive", household_id: "house-home", user_id: "user-bin", amount: 31000, day_of_month: 31, is_active: false }];
    eq((await rpc(fixture, "2026-07")).inserted, 0, "inactive rule is excluded");
    fixture.db.__operation_rpc_available = false;
    await rejects(rpc(fixture, "2026-07"), e => /Supabase 404/.test(e.message) && !isUncertainStorageWrite(e), "missing RPC is a definite rejection, never fallback writes");
  } finally { fixture.restore(); }
}

ok(isUncertainStorageWrite(new Error("wrapped alias", { cause: { cause: { code: "supabase_write_result_unknown" } } })), "wrapped aliases retain uncertain-write classification");
ok(!isDefiniteStorageFailure(new Error("Supabase 503: synthetic")), "server 5xx cannot authorize destructive compensation");

// Server and web callers must preserve, not escalate, existing roles.
for (const role of ["owner", "admin", "member", "viewer", "pending", "blocked", "invalid"]) {
  const result = householdJoinFeedback({ id: "house-home", join_role: role });
  if (role === "blocked") { eq(result.err, "join_blocked", "blocked is an error"); ok(!result.household_id && !result.msg, "blocked publishes no household or success"); }
  else if (role === "viewer") eq(result.msg, "joined_viewer", "viewer is explicitly read-only");
  else if (role === "pending") eq(result.msg, "approval_pending", "pending is not joined");
  else if (role === "invalid") eq(result.err, "join_failed", "unknown role fails closed");
  else eq(result.msg, "joined", "active role remains joined");
}
ok(source.includes('addQueryToUrl("/my", householdJoinFeedback(joined))'), "local login/signup reuse central role feedback");
ok(formatMessage("join_blocked").includes("차단"), "blocked message is mapped safely");
ok(formatMessage("joined_viewer").includes("조회 전용"), "viewer message is mapped safely");
ok(formatMessage("db_write_unknown").includes("반복하지"), "uncertain outcome does not encourage retry");
{
  const fixture = await createV2265QaFixture();
  try {
    fixture.db.household_members.push({ household_id: "house-trip", user_id: "user-bin", role: "blocked" });
    // Replace the original owner entry; best-role normalization must not mask blocked.
    fixture.db.household_members = fixture.db.household_members.filter(m => !(m.household_id === "house-trip" && m.user_id === "user-bin" && m.role === "owner"));
    const response = await call(fixture, "POST", "/my/join", { invite_code: "TRIP2265" });
    const location = response.headers.get("location") || "";
    ok(location.includes("err=join_blocked") && !location.includes("msg=joined"), "web re-invite never says joined for blocked member");
    eq(fixture.db.household_members.find(m => m.household_id === "house-trip" && m.user_id === "user-bin").role, "blocked", "re-invite does not change role");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  try {
    for (let i = 0; i < 51; i++) fixture.db.transactions.push({ id: "search-" + i, household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-15", amount: 1000 + i, type: "expense", memo: "QA_SEARCH_LIMIT", category: "QA", raw_text: "QA_SEARCH_LIMIT" });
    const response = await call(fixture, "GET", "/u/api/tx/search?q=QA_SEARCH_LIMIT&household=house-home");
    const result = await response.json();
    eq(result.results.length, 50, "search DOM result budget stays 50");
    eq(result.has_more, true, "51st match is disclosed");
    eq(result.count_is_total, false, "display count is not falsely advertised as total");
    eq(result.result_limit, 50, "API exposes explicit display limit");
    ok(source.includes("더 많은 결과가 있어 처음 50건만 표시합니다."), "search UI explains omitted results");
  } finally { fixture.restore(); }
}

// A read deadline must settle even when a test transport ignores AbortSignal.
{
  const originalFetch = globalThis.fetch;
  const env = { SUPABASE_URL: "https://fixture.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-only", __AB_MONITOR_REQUEST: { db_count: 0, db_ms: 0, db_failures: 0 } };
  try {
    globalThis.fetch = () => new Promise(() => {});
    await rejects(supabase(env, "/read", { timeoutMs: 5 }), e => e.code === "supabase_read_timeout", "hanging read is bounded");
    eq(env.__AB_MONITOR_REQUEST.db_count, 1, "timed-out read counted once");
    eq(env.__AB_MONITOR_REQUEST.db_failures, 1, "timed-out read failure counted once");
    await rejects(supabaseExactCount(env, "/rest/v1/transactions", { timeoutMs: 5 }), e => e.code === "supabase_read_timeout", "hanging HEAD exact count is also bounded");
    eq(env.__AB_MONITOR_REQUEST.db_count, 2, "HEAD deadline uses one shared monitor count");
    let writes = 0;
    globalThis.fetch = async () => { writes++; throw new Error("synthetic transport lost after commit"); };
    await rejects(supabase(env, "/write", { method: "POST", body: "{}" }), e => isUncertainStorageWrite(e) && !isDefiniteStorageFailure(e), "unknown POST is typed, not definite rejection");
    eq(writes, 1, "transport failure never automatically retries write");
    globalThis.fetch = async () => new Response("synthetic upstream failure", { status: 500 });
    await rejects(supabase(env, "/write", { method: "PATCH", body: "{}" }), e => isUncertainStorageWrite(e), "mutating 5xx is conservative unknown outcome");
    globalThis.fetch = async () => new Response("synthetic rejected constraint", { status: 400 });
    await rejects(supabase(env, "/write", { method: "POST", body: "{}" }), e => isDefiniteStorageFailure(e) && !isUncertainStorageWrite(e), "authoritative 4xx remains definite rejection");
  } finally { globalThis.fetch = originalFetch; }
}

// Late or absent membership commits must never cause unknown-result deletion.
for (const mode of ["late-owner", "not-yet-committed", "reread-outage", "definite-reject"]) {
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  const id = "qa-household-" + mode;
  let ownerAttempted = false;
  let deletes = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      const method = String(init.method || "GET").toUpperCase();
      if (url.pathname === "/rest/v1/households" && method === "DELETE") deletes++;
      if (url.pathname === "/rest/v1/household_members" && method === "POST") {
        ownerAttempted = true;
        if (mode === "late-owner") await baseFetch(input, init);
        if (mode === "definite-reject") return new Response("synthetic owner rejected", { status: 400 });
        throw new Error("synthetic owner outcome unknown");
      }
      if (mode === "reread-outage" && ownerAttempted && url.pathname === "/rest/v1/household_members" && method === "GET") throw new Error("synthetic read outage");
      return baseFetch(input, init);
    };
    const work = createUserHousehold(fixture.env, "user-bin", "QA " + mode, "QA", { id, skipChatFirstHistory: true });
    if (mode === "late-owner") { const household = await work; eq(household.id, id, "late committed ownership reconciles strictly"); }
    else if (mode === "definite-reject") await rejects(work, e => /Supabase 400/.test(e.message), "definite rejection remains error");
    else await rejects(work, e => isUncertainStorageWrite(e), "unknown ownership remains pending rather than compensated");
    eq(deletes, mode === "definite-reject" ? 1 : 0, "only definite empty-household rejection permits cleanup");
    eq(fixture.db.households.some(h => h.id === id), mode !== "definite-reject", "committed or unresolved candidate is retained");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let creates = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/users" && init.method === "POST") { creates++; throw new Error("synthetic create result unknown"); }
      return baseFetch(input, init);
    };
    await rejects(ensureUser(fixture.env, "qa-unknown-create-22929", "QA"), e => isUncertainStorageWrite(e), "unknown user creation propagates, not bare-POST fallback");
    eq(creates, 1, "unknown create sends exactly one users POST");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let deletes = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.pathname === "/rest/v1/users" && init.method === "DELETE") deletes++;
      if (url.pathname === "/rest/v1/rpc/accountbook_link_kakao_identity_v227") throw new Error("synthetic link result unknown");
      return baseFetch(input, init);
    };
    await rejects(ensureKakaoLoginUser(fixture.env, "99999922929", "QA"), e => isUncertainStorageWrite(e), "unknown OAuth link cannot trigger user deletion");
    eq(deletes, 0, "unknown OAuth link performs zero user DELETEs");
    ok(fixture.db.users.some(u => u.kakao_user_key === "kakao_login:99999922929"), "created OAuth candidate remains available for reconciliation");
  } finally { fixture.restore(); }
}

// Overflow cannot omit candidate owners and then purge their household.
{
  const fixture = await createV2265QaFixture();
  try {
    const overflowId = "00000000-0000-4000-8000-000000029001";
    for (let i = 0; i < 1001; i++) fixture.db.accountbook_settings.push({ key: "kakao_first_record_v22928:overflow-" + i, value: JSON.stringify({ version: 1, state: "pending", user_id: "overflow-" + i, candidate_id: overflowId, created_at: new Date().toISOString() }) });
    const before = JSON.stringify(fixture.db.transactions);
    await rejects(purgeHouseholdData(fixture.env, overflowId), e => /안전 한도|안전한도/.test(e.message), "candidate scope overflow fails closed before purge");
    eq(fixture.db.__rpc_calls.filter(c => c.name === "accountbook_purge_household_v227").length, 0, "overflow performs zero purge RPC writes");
    eq(JSON.stringify(fixture.db.transactions), before, "overflow leaves all financial rows untouched");
  } finally { fixture.restore(); }
}

{
  const fixture = await createV2265QaFixture();
  try {
    for (let i = 0; i < 1001; i++) fixture.db.household_members.push({ household_id: "member-overflow", user_id: "overflow-" + i, role: "member" });
    await rejects(purgeHouseholdData(fixture.env, "member-overflow"), e => /안전 한도|안전한도/.test(e.message), "actual member overflow fails closed before purge");
    eq(fixture.db.__rpc_calls.filter(c => c.name === "accountbook_purge_household_v227").length, 0, "member overflow performs zero purge RPC writes");
  } finally { fixture.restore(); }
}

// Review follow-up: pending joins retain unknown causes through failed rereads.
for (const mode of ["absent", "read-failed", "committed"]) {
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let attempted = false;
  let writes = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/household_members" && init.method === "POST") {
        attempted = true; writes++;
        if (mode === "committed") await baseFetch(input, init);
        throw new Error("synthetic pending result unknown");
      }
      if (mode === "read-failed" && attempted && url.pathname === "/rest/v1/household_members" && init.method === "GET") throw new Error("synthetic reread failed");
      return baseFetch(input, init);
    };
    const work = joinHouseholdByCode(fixture.env, "user-wifi", "TRIP2265");
    if (mode === "committed") eq((await work).join_role, "pending", "committed pending is authoritatively reconciled");
    else await rejects(work, e => isUncertainStorageWrite(e), "absent/failing join reread preserves write uncertainty");
    eq(writes, 1, "pending membership is never automatically retried");
  } finally { fixture.restore(); }
}
// All four recurring form handlers must avoid asserting non-commit after loss.
for (const path of ["/my/recurring/save", "/admin/recurring/save", "/my/recurring/delete", "/admin/recurring/delete"]) {
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let writes = 0;
  try {
    const rule = fixture.db.accountbook_recurring.find(r => r.household_id === "house-home");
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/accountbook_recurring" && ["POST", "PATCH", "DELETE"].includes(init.method)) {
        writes++; await baseFetch(input, init); throw new Error("synthetic recurring committed without response");
      }
      return baseFetch(input, init);
    };
    const response = await call(fixture, "POST", path, { household_id: "house-home", month: "2026-07", id: rule.id, user_id: "user-bin", memo: "QA_UNKNOWN_RECURRING", amount: "31000", day_of_month: "31", return_to: "/reserve-plans?household_id=house-home" });
    ok((response.headers.get("location") || "").includes("err=db_write_unknown"), path + " discloses unknown commit");
    eq(writes, 1, path + " sends only one mutation");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let creates = 0;
  try {
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      const data = init.body ? JSON.parse(String(init.body)) : {};
      if (url.pathname === "/rest/v1/accountbook_settings" && init.method === "POST" && String(data.value || "").includes("QA_UNKNOWN_GOAL")) {
        creates++; await baseFetch(input, init); throw new Error("synthetic goal committed without response");
      }
      return baseFetch(input, init);
    };
    const response = await app.fetch(new Request(BASE + "/u/api/goals", { method: "POST", headers: { cookie: fixture.cookie, origin: BASE, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ action: "create", household: "house-home", name: "QA_UNKNOWN_GOAL", target: 30000, monthly: 3000 }) }), fixture.env, { waitUntil() {} });
    const data = await response.json();
    eq(data.error, "db_write_unknown", "goal API reports uncertainty, not save_failed");
    eq(data.uncertain, true, "goal response exposes verification requirement");
    ok(data.message.includes("반복하지") && !data.message.includes("다시 시도"), "goal message never recommends duplicate create");
    const loaded = await call(fixture, "GET", "/u/api/goals?household=house-home");
    const confirmed = await loaded.json();
    eq(confirmed.goals.filter(g => g.name === "QA_UNKNOWN_GOAL").length, 1, "goal reread bypasses cache and shows the late committed goal once");
    eq(creates, 1, "unknown goal create sends no mutation retry");
    const asset = await call(fixture, "GET", "/assets/accountbook-goals-v22929.js");
    eq(asset.status, 200, "changed goals client has fresh immutable URL");
    ok((await asset.text()).includes('load().then(function () { showError(err); })'), "unknown create refreshes list before verification notice");
  } finally { fixture.restore(); }
}
{
  const fixture = await createV2265QaFixture();
  const baseFetch = globalThis.fetch;
  let writes = 0;
  try {
    fixture.env.ADMIN_API_TOKEN = "synthetic-admin-only";
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(String(input));
      if (url.pathname === "/rest/v1/transactions" && init.method === "POST") {
        writes++; await baseFetch(input, init); throw new Error("synthetic transaction committed without response");
      }
      return baseFetch(input, init);
    };
    const response = await app.fetch(new Request(BASE + "/api/transactions", { method: "POST", headers: { authorization: "Bearer synthetic-admin-only", origin: BASE, "content-type": "application/json", accept: "application/json" }, body: JSON.stringify({ household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-20", type: "expense", amount: 1234, memo: "QA_UNKNOWN_API", category: "QA" }) }), fixture.env, { waitUntil() {} });
    const data = await response.json();
    eq(data.error, "db_write_unknown", "top-level financial JSON fallback preserves uncertainty");
    ok(data.message.includes("반복하지") && !data.message.includes("변경되지"), "JSON fallback never asserts no commit");
    eq(writes, 1, "financial API sends no mutation retry");
    eq(fixture.db.transactions.filter(t => t.memo === "QA_UNKNOWN_API").length, 1, "committed financial row is retained, not compensated");
  } finally { fixture.restore(); }
}
console.log(`PASS: remaining operations and uncertainty safety (${checks} checks)`);
