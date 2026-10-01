import assert from "node:assert/strict";
import app from "../src/index.js";
import { summary } from "../monitoring/worker.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const eq = (actual, expected, label) => { assert.deepEqual(actual, expected, label); checks += 1; };
const ok = (value, label) => { assert.ok(value, label); checks += 1; };
const hash = (text) => {
  let value = 2166136261;
  for (const c of text) value = Math.imul(value ^ c.charCodeAt(0), 16777619);
  return (value >>> 0).toString(36);
};
const flowKey = `kakao_flow_v215:user-bin:${hash("direct")}`;
function seed(fixture, flow, householdId) {
  const value = JSON.stringify({ flow, step: flow === "budget_setup" ? "confirm" : "name", data: { household_id: householdId, month: "2026-10", category: "__total", amount: 123456 }, state_version: "v2254", expires_at: Date.now() + 1800000 });
  fixture.db.accountbook_settings.push({ id: "safety-flow", key: flowKey, value }, { id: "safety-selected", key: "kakao_selected_household_v2251:user-bin", value: "house-home" });
  return value;
}
async function say(fixture, utterance) {
  const key = "kakao_login:2265";
  const response = await app.fetch(new Request("https://malhaebook.com/skill", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ userRequest: { utterance, user: { id: key, properties: { botUserKey: key } } }, bot: { id: "fixture-bot" }, intent: { name: "폴백블록" }, action: { params: {}, detailParams: {} } }) }), fixture.env, {});
  eq(response.status, 200, "guided failure remains a Kakao-safe response");
  const data = await response.json();
  eq(data.version, "2.0", "guided response uses the skill schema");
  return JSON.stringify(data);
}
const writes = (fixture) => JSON.stringify({ budgets: fixture.db.accountbook_budgets, aliases: fixture.db.accountbook_settings.filter(row => row.key.startsWith("member_aliases:")), transactions: fixture.db.transactions });

for (const flow of ["budget_setup", "member_alias"]) {
  for (const target of ["deleted", "revoked", "unavailable", "valid"]) {
    const fixture = await createV2265QaFixture();
    try {
      const householdId = target === "deleted" ? "house-deleted" : "house-trip";
      const value = seed(fixture, flow, householdId);
      if (target === "revoked") fixture.db.household_members = fixture.db.household_members.filter(row => !(row.household_id === householdId && row.user_id === "user-bin"));
      const baseFetch = globalThis.fetch;
      let failures = 0;
      if (target === "unavailable") globalThis.fetch = async (input, init) => {
        const url = new URL(typeof input === "string" ? input : input.url);
        if (url.pathname === "/rest/v1/households" && url.searchParams.get("id") === `eq.${householdId}`) { failures += 1; return new Response('{"message":"synthetic unavailable target"}', { status: 503 }); }
        return baseFetch(input, init);
      };
      const before = writes(fixture);
      const selectedBefore = JSON.stringify(fixture.db.accountbook_budgets.filter(row => row.household_id === "house-home"));
      const result = await say(fixture, flow === "budget_setup" ? "응" : "새이름");
      if (target === "valid") {
        ok(writes(fixture) !== before, `${flow}: valid pending target is still updated`);
        eq(JSON.stringify(fixture.db.accountbook_budgets.filter(row => row.household_id === "house-home")), selectedBefore, "valid target never updates the selected household budget");
        ok(result.includes(flow === "budget_setup" ? "예산을 설정했어요" : "이름을 ‘새이름’"), "valid flow retains its success message");
      } else {
        eq(writes(fixture), before, `${flow}: ${target} target causes no budget, alias or transaction writes`);
        ok(!result.includes("예산을 설정했어요") && !result.includes("이름을 ‘새이름’"), "failed target never reports success");
        if (target === "unavailable") {
          ok(failures > 0, "target lookup outage exercised");
          eq(fixture.db.accountbook_settings.find(row => row.key === flowKey).value, value, "transient lookup failure preserves the pending state");
        } else {
          eq(fixture.db.accountbook_settings.find(row => row.key === flowKey).value, "{}", "invalid pending target is cleared");
          if (target === "deleted") ok(result.includes("가계부를 다시 선택"), "deleted target explains reselection");
        }
      }
    } finally { fixture.restore(); }
  }
}

for (const failure of ["http503", "network"]) {
  const fixture = await createV2265QaFixture();
  try {
    const value = seed(fixture, "budget_setup", "house-home");
    const before = writes(fixture);
    const baseFetch = globalThis.fetch;
    let attempts = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      const body = init.body ? JSON.parse(init.body) : null;
      if (url.pathname === "/rest/v1/accountbook_settings" && init.method === "POST" && body?.key === flowKey && body.value === "{}") {
        attempts += 1;
        if (failure === "network") throw new TypeError("synthetic cancellation outage");
        return new Response('{"message":"synthetic cancellation outage"}', { status: 503 });
      }
      return baseFetch(input, init);
    };
    const result = await say(fixture, "취소");
    ok(attempts > 0, "cancellation persistence failure exercised");
    ok(!result.includes("취소했어요"), "failed cancellation never reports success");
    eq(writes(fixture), before, "failed cancellation does not mutate financial or alias data");
    eq(fixture.db.accountbook_settings.find(row => row.key === flowKey).value, value, "failed cancellation remains pending for retry");
    globalThis.fetch = baseFetch;
    ok((await say(fixture, "취소")).includes("취소했어요"), "retry confirms cancellation only after persistence succeeds");
    eq(fixture.db.accountbook_settings.find(row => row.key === flowKey).value, "{}", "retry clears the pending state");
    await say(fixture, "응");
    eq(writes(fixture), before, "confirmation after actual cancellation cannot save the former budget");
  } finally { fixture.restore(); }
}

for (const flow of ["budget_setup", "member_alias", "household_choice", "create_household"]) {
  const fixture = await createV2265QaFixture();
  try {
    seed(fixture, flow, "house-home");
    if (flow === "household_choice" || flow === "create_household") {
      const state = JSON.parse(fixture.db.accountbook_settings.find(row => row.key === flowKey).value);
      state.step = flow === "household_choice" ? "choose" : "confirm_name";
      state.data = flow === "household_choice" ? { action: "select", household_ids: ["house-home", "house-trip"] } : { name: "상태정리 검증 가계부", kind: "직접 입력" };
      fixture.db.accountbook_settings.find(row => row.key === flowKey).value = JSON.stringify(state);
    }
    const baseFetch = globalThis.fetch;
    let failures = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      const body = init.body ? JSON.parse(init.body) : null;
      if (url.pathname === "/rest/v1/accountbook_settings" && init.method === "POST" && body?.key === flowKey && body.value === "{}") { failures += 1; return new Response('{"message":"synthetic post-save cleanup outage"}', { status: 503 }); }
      return baseFetch(input, init);
    };
    const before = writes(fixture);
    const householdsBefore = fixture.db.households.length;
    const result = await say(fixture, flow === "member_alias" ? "새이름" : flow === "household_choice" ? fixture.db.households.find(row => row.id === "house-trip").name : "응");
    ok(failures > 0, `${flow}: post-save cleanup failure is exercised`);
    ok(result.includes("진행 상태 정리가 지연"), `${flow}: cleanup delay is disclosed`);
    ok(result.includes(flow === "budget_setup" ? "예산을 설정했어요" : flow === "member_alias" ? "이름을 ‘새이름’" : flow === "household_choice" ? "가계부를 선택했어요" : "가계부를 만들었어요"), `${flow}: successful business write remains acknowledged`);
    if (flow === "budget_setup" || flow === "member_alias") ok(writes(fixture) !== before, "completion message describes a verified mutation");
    if (flow === "create_household") eq(fixture.db.households.length, householdsBefore + 1, "creation occurs once despite cleanup failure");
    if (flow === "household_choice") eq(fixture.db.accountbook_settings.find(row => row.key === "kakao_selected_household_v2251:user-bin").value, "house-trip", "selection success persists before cleanup");
  } finally { fixture.restore(); }
}

const fixture = await createV2265QaFixture();
try {
  fixture.env.ADMIN_API_TOKEN = "fixture-admin-only";
  fixture.env.OPS_MONITOR_TOKEN = "fixture-monitor-only";
  fixture.env.OPS_MONITOR = { async fetch() { return new Response(JSON.stringify({ ticket: "00000000-0000-4000-8000-000000000000" })); } };
  const monitorOrigin = "https://fixture-monitor.workers.dev";
  fixture.env.OPS_MONITOR_PUBLIC_ORIGIN = monitorOrigin;
  const open = () => app.fetch(new Request("https://malhaebook.com/ops-monitor/open", { headers: { authorization: `Bearer ${fixture.env.ADMIN_API_TOKEN}` } }), fixture.env, {});
  const response = await open();
  eq(response.status, 200, "authenticated SSO produces a page");
  const policy = response.headers.get("content-security-policy");
  const formAction = policy.split(";").map(part => part.trim()).find(part => part.startsWith("form-action "));
  eq(formAction, `form-action 'self' ${monitorOrigin}`, "SSO CSP permits only self and the validated monitor origin");
  ok((await response.text()).includes(`action="${monitorOrigin}/session"`), "SSO form uses the permitted origin");
  ok(policy.includes("frame-ancestors 'none'") && policy.includes("object-src 'none'"), "SSO retains the other security restrictions");
  const login = await app.fetch(new Request("https://malhaebook.com/my"), fixture.env, {});
  ok(login.headers.get("content-security-policy").includes("form-action 'self';"), "ordinary pages keep self-only form actions");
  for (const origin of ["http://fixture-monitor.workers.dev", "https://monitor.example", "https://workers.dev.attacker.example"]) {
    fixture.env.OPS_MONITOR_PUBLIC_ORIGIN = origin;
    eq((await open()).status, 503, "invalid monitor origin is rejected");
  }
} finally { fixture.restore(); }

// Exercise the complete summary with otherwise healthy provider, billing and p95 data.
const now = Date.parse("2026-10-01T12:00:00Z");
const at = new Date(now).toISOString();
const complete = { database_bytes: 1024, cpu_counter: { total: 200, idle: 180 }, connections: 0, max_connections: 60, memory_available_bytes: 800, memory_total_bytes: 1000 };
async function inspectSummary(metrics, previous = { total: 100, idle: 90 }) {
  const states = { cloudflare: { period_start: "2026-10-01T00:00:00Z", period_end: at, today: { requests: 100, errors: 0 }, hour: { requests: 0, errors: 0 }, app: { requests: 100, errors: 0, cpu_limit_errors: 0, resource_limit_errors: 0 } }, database: metrics, uptime: { checks: [{ ok: true }] }, d1: { day: "2026-10-01", rows_read: 1, rows_written: 1, storage_bytes: 1 }, supabase_plan: { plan: "free" } };
  const data = { collector_state: Object.entries(states).map(([name, payload]) => ({ name, status: "ok", last_success_at: at, payload: JSON.stringify(payload) })), manual_usage: ["egress", "cached_egress", "storage"].map(key => ({ key, value: 1, verified_at: at, period_start: "2026-10-01T00:00:00Z", period_end: "2026-11-01T00:00:00Z" })), telemetry: ["skill", "web"].flatMap(route => Array.from({ length: 30 }, () => ({ route, at: now, status: 200, duration_ms: 100, sample_kind: "random", outcome: "ok", db_failures: 0 }))) };
  const db = { prepare(sql) {
    const statement = { bind() { return statement; }, async first() { return previous ? { payload: JSON.stringify({ cpu_counter: previous }) } : null; }, async all() {
      if (sql.includes("FROM samples") || sql.includes("FROM settings")) return { results: [] };
      const table = Object.keys(data).find(key => sql.includes(`FROM ${key}`));
      assert.ok(table, "unexpected summary query");
      return { results: data[table] };
    } };
    return statement;
  } };
  return summary({ MONITOR_DB: db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: at }, now);
}
const healthy = await inspectSummary(complete);
eq(healthy.status, "normal", "complete low-load summary is normal");
eq(healthy.unknown, [], "complete summary has no missing metrics");
eq(healthy.database.connections, 0, "zero connections are observed data");
for (const field of ["cpu_counter", "connections", "max_connections", "memory_available_bytes", "memory_total_bytes"]) {
  const partial = { ...complete };
  delete partial[field];
  const result = await inspectSummary(partial);
  eq(result.status, "unknown", `${field}: partial database data cannot imply global normal`);
  ok(result.unknown.some(label => label.startsWith("DB ")), `${field}: missing load metric is visible`);
  eq(result.quotas.find(q => q.key === "database_size").value, 1024, "observed database size survives partial metrics");
}
const first = await inspectSummary(complete, null);
ok(first.unknown.includes("DB CPU 비교 표본 부족 또는 카운터 초기화"), "first CPU observation explains the need for comparison");
console.log(`PASS: safety fix regression (${checks} checks)`);
