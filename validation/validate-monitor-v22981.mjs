// V22.9.81 관제 앱 표본 왕복 확인 검사 (V79:T-43, 관제 1.3.0).
// T-43: 관제는 앱 요청 표본이 하루 창 안에 없으면 '미연결'로만 보여 저사용량과 전송 고장을 가르지 못했다(화면 문구도 그렇게 말했다).
//       표본은 사용자 경로 요청의 2% 와 사고 요청만 보내므로 요청이 적은 날에는 경로가 살아 있는지 알 길이 없었다
//       (2026-10-26 확인: 10-25 08:49:32 뒤 25시간 넘게 표본 0건).
// 1.3.0: 관제가 5분마다 앱을 부르는 DB 수집 요청(ACCOUNTBOOK → /internal/ops-metrics)에 왕복 확인 id 를 싣고, 앱은 사용자 표본과 같은
//        전송(OPS_MONITOR → /internal/telemetry)으로 확인 표본 하나를 보낸다. 관제는 그 표본을 받았는지로 정상·실패·확인 불가를 가른다.
// 배포 순서 두 방향을 본다: 새 관제 + 옛 앱 = 확인 불가·경고 없음 / 옛 관제 1.2.1 + 새 앱 = 오늘과 같은 바이트·확인 표본 전송 없음.
// 관제 Worker 는 Node 22 의 SQLite(실제 SQL)로, 앱은 실제 번들(src/index.js)의 app.fetch 로 돌리고 둘을 서비스 바인딩 흉내로 서로 잇는다.
// 네트워크는 쓰지 않는다(Node 22 이상 필요, test-d1 과 같음).
// V22981_SOFT=1 이면 실패를 모아 끝까지 돌고 마지막에 목록을 찍는다(고치기 전 코드에서 몇 개가 깨지는지 셀 때).
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import monitor, { summary } from "../monitoring/worker.mjs";
import * as model from "../monitoring/model.mjs";
import { dashboardHtml } from "../monitoring/dashboard.mjs";
import { app, counter, fixture, page } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22981_SOFT === "1" || process.argv.includes("--soft");
const base = counter("V22.9.81 관제 앱 표본 왕복 확인 검사 통과");
const failed = [];
let total = 0;
function guard(fn, message) {
  total += 1;
  try { fn(); } catch (error) {
    if (!SOFT) throw error;
    const detail = String(error.message).split("\n")[0];
    failed.push(detail === message ? message : `${message} — ${detail.slice(0, 140)}`);
  }
}
const ok = (value, message) => guard(() => base.ok(value, message), message);
const eq = (actual, expected, message) => guard(() => base.eq(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const SCHEMA = readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8");
const TOKEN = "v22981-monitor-token";
const ID = /^[a-f0-9-]{36}$/;
const ALERT_TITLE = "앱 요청 표본 전송 실패";
const TELEMETRY_UNKNOWN = "앱 요청 표본 미관측 또는 갱신 지연";
// Supabase Metrics 원문(앱 쪽 DB 지표 조회). validate-monitoring-v22922 와 같은 값이다.
const RAW = 'pg_database_size_mb{datname="postgres"} 123\npg_database_size_mb{datname="private_db"} 999\nnode_cpu_seconds_total{cpu="0",mode="idle"} 100\nnode_cpu_seconds_total{cpu="0",mode="user"} 20\nprivate_email_metric{email="secret@example.com"} 1\npg_stat_database_numbackends{datname="postgres"} 4';
// V22.9.80(76ea594) 앱이 관제 1.2.1 의 부름에 내는 바이트. 고치기 전 번들로 잰 값이다(옛 관제 + 새 앱 = 이 바이트 그대로).
const GOLDEN_OK = '{"ok":true,"metrics":{"database_bytes":128974848,"connections":4,"cpu_counter":{"total":120,"idle":100}}}';
const GOLDEN_FAIL = '{"ok":false,"error_code":"http_503"}';
const GOLDEN_NOT_CONNECTED = '{"ok":false,"error_code":"not_connected"}';
// V22.9.80 앱의 사용자 요청 표본 칸(관제 1.2.1 이 받는 모양). 새 앱도 같은 칸만 보낸다.
const USER_SAMPLE_KEYS = "at,db_count,db_failures,db_ms,db_retries,duration_ms,id,method,outcome,route,sample_kind,status";

function monitorDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  const log = [];
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async all() { log.push(sql); return { results: statement.all(...args) }; },
        async first() { log.push(sql); return statement.get(...args) || null; },
        run() { log.push(sql); const data = statement.run(...args); return { success: true, meta: { changes: data.changes } }; },
      };
      return api;
    },
    async batch(statements) { sqlite.exec("BEGIN"); try { const values = statements.map((s) => s.run()); sqlite.exec("COMMIT"); return values; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } },
  };
  return { sqlite, db, log };
}
const roundtripOf = (sqlite) => { const row = sqlite.prepare("SELECT value FROM settings WHERE key='roundtrip'").get(); return row ? JSON.parse(row.value) : null; };
const telemetryRows = (sqlite) => sqlite.prepare("SELECT id,sample_kind FROM telemetry").all();
const alertRecord = (sqlite, title) => sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().map((row) => JSON.parse(row.value)).find((value) => value.title === title) || null;
const decode = (b64) => Buffer.from(b64, "base64").toString("utf8");
const bodyOf = (message) => { const raw = String(message.raw || ""); return decode(raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/\r\n/g, "")); };
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// 바깥 주소: 앱의 Supabase Metrics 조회와 관제의 /health·/ready 접속 검사만 흉내 낸다.
const world = { supabase: "ok" };
async function worldFetch(input) {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "fixture.supabase.co" && url.pathname === "/customer/v1/privileged/metrics") return world.supabase === "ok" ? new Response(RAW) : new Response("private provider error text", { status: 503 });
  if (url.hostname === "app.example") return new Response(JSON.stringify(url.pathname === "/ready" ? { ready: true, version: "fixture" } : { alive: true, version: "fixture" }), { headers: { "content-type": "application/json" } });
  throw new Error(`unexpected network ${url.href}`);
}

// 관제 → 앱(ACCOUNTBOOK)과 앱 → 관제(OPS_MONITOR)를 실제 두 Worker 의 fetch 로 잇는다. accountbook 을 주면 앱 쪽을 그것으로 바꾼다(옛 앱 흉내).
// 1.4.0(V22.9.82): 관제는 55분마다 한 번 /internal/ops-usage 로 이용 현황을 묻는다. 이 검사의 앱 흉내(V22.9.81 까지)에는 그 경로가 없으므로
// 404 로 답하고(관제는 app_not_ready 로 적는다) calls.usage 로 따로 센다. calls.accountbook 은 왕복 확인을 싣는 DB 수집 요청만 센다.
const usageCall = (input, calls) => {
  if (new URL(typeof input === "string" ? input : input.url).pathname !== "/internal/ops-usage") return null;
  calls.usage += 1;
  return new Response("", { status: 404 });
};
function wire({ db, appOverrides = {}, accountbook, mails } = {}) {
  const calls = { accountbook: 0, telemetry: 0, usage: 0, headers: [] };
  const monitorEnv = { MONITOR_DB: db, OPS_MONITOR_TOKEN: TOKEN, APP_ORIGIN: "https://app.example" };
  if (mails) Object.assign(monitorEnv, { ALERT_EMAIL: { async send(message) { mails.push(message); } }, ALERT_TO: "ops@example.com", ALERT_FROM: "monitor@app.example" });
  const appEnv = {
    OPS_MONITOR_TOKEN: TOKEN, SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    OPS_MONITOR: { async fetch(input, init) { calls.telemetry += 1; return monitor.fetch(new Request(input, init), monitorEnv, { waitUntil() {} }); } },
    ...appOverrides,
  };
  monitorEnv.ACCOUNTBOOK = accountbook ? accountbook(appEnv, calls) : {
    async fetch(input, init) {
      const usage = usageCall(input, calls);
      if (usage) return usage;
      calls.accountbook += 1;
      const request = new Request(input, init);
      calls.headers.push(request.headers.get("x-ab-monitor-roundtrip"));
      return app.fetch(request, appEnv, { waitUntil() {} });
    },
  };
  return { monitorEnv, appEnv, calls };
}
// 옛 앱(V22.9.80 이전) 흉내 1: 실제 번들에 왕복 확인 머리를 떼고 보낸다. 머리가 없을 때의 답이 V22.9.80 과 같은 바이트라는 것은 2절이 확인한다.
const strippedApp = (appEnv, calls) => ({
  async fetch(input, init) {
    const usage = usageCall(input, calls);
    if (usage) return usage;
    calls.accountbook += 1;
    const request = new Request(input, init);
    const headers = new Headers(request.headers);
    headers.delete("x-ab-monitor-roundtrip");
    return app.fetch(new Request(request.url, { method: request.method, headers }), appEnv, { waitUntil() {} });
  },
});
// 옛 앱 흉내 2: V22.9.80 의 답 모양을 그대로 낸다(머리를 보지 않는다).
const v80App = (_appEnv, calls) => ({ async fetch(input) { const usage = usageCall(input, calls); if (usage) return usage; calls.accountbook += 1; return new Response(JSON.stringify({ ok: true, metrics: { database_bytes: 30 * 1024 ** 2, connections: 5, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 6e8, cpu_counter: { total: 1000, idle: 800 } } }), { headers: { "content-type": "application/json; charset=utf-8" } }); } });

async function cron(env, at) {
  const pending = [];
  await monitor.scheduled({ scheduledTime: at }, env, { waitUntil: (job) => pending.push(job) });
  await Promise.all(pending);
}
// 앱의 /internal/ops-metrics 를 관제 판별로 부른다. roundtrip 을 주면 1.3.0, 안 주면 1.2.1 의 요청과 같다.
async function probe(env, { roundtrip, token = TOKEN } = {}) {
  const headers = { authorization: `Bearer ${token}` };
  if (roundtrip !== undefined) headers["x-ab-monitor-roundtrip"] = roundtrip;
  const response = await app.fetch(new Request("https://accountbook.internal/internal/ops-metrics", { headers, signal: AbortSignal.timeout(10000) }), env, { waitUntil() {} });
  return { status: response.status, type: response.headers.get("content-type"), text: await response.text() };
}
function appProbeEnv(sent, answer = () => new Response("", { status: 202 })) {
  return {
    OPS_MONITOR_TOKEN: TOKEN, SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only",
    OPS_MONITOR: { async fetch(input, init) { sent.push({ url: String(input), init, body: JSON.parse(String(init?.body)) }); return answer(); } },
  };
}

// 관제 화면(dashboard.mjs)의 실제 스크립트를 가짜 DOM 에서 돌리고 render(summary) 결과 HTML 을 받는다.
function renderDashboard(result) {
  const script = dashboardHtml("/ops-monitor").match(/<script>([\s\S]*?)<\/script>/)[1];
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) elements.set(id, { id, innerHTML: "", textContent: "", value: "", disabled: false, addEventListener() {}, querySelector() { return { disabled: false }; } });
    return elements.get(id);
  };
  const context = vm.createContext({ document: { hidden: true, addEventListener() {}, getElementById: element }, setInterval() {}, console, AbortSignal, fetch() { throw Error("not expected while hidden"); } });
  vm.runInContext(script, context);
  context.__summary = JSON.parse(JSON.stringify(result));
  vm.runInContext("render(__summary)", context);
  return element("content").innerHTML;
}
const textOf = (html) => html.replace(/<[^>]*>/g, "").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

// 다른 수집기가 모두 정상인 관제 저장소(9절 상태 표·8절 화면). 요청 표본 수와 왕복 확인 기록만 바꿔 본다.
function seedHealthy(sqlite, now, { samples = 0 } = {}) {
  const dayStart = new Date(now); dayStart.setUTCHours(0, 0, 0, 0);
  const monthStart = new Date(dayStart); monthStart.setUTCDate(1);
  const monthEnd = new Date(monthStart); monthEnd.setUTCMonth(monthEnd.getUTCMonth() + 1);
  const at = iso(now - 2 * MIN);
  const counters = { requests: 0, errors: 0, subrequests: 1, cpu_ms: 1, cpu_limit_errors: 0, resource_limit_errors: 0, observed: true };
  const state = sqlite.prepare("INSERT INTO collector_state(name,last_attempt_at,last_success_at,status,error_code,payload) VALUES(?,?,?,'ok',NULL,?)");
  state.run("cloudflare", at, at, JSON.stringify({ today: { ...counters, requests: 20000 }, hour: { ...counters, requests: 900 }, app: { ...counters, requests: 19000 }, period_start: dayStart.toISOString(), period_end: iso(now - 5 * MIN) }));
  state.run("database", at, at, JSON.stringify({ database_bytes: 30 * 1024 ** 2, connections: 5, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 6e8, cpu_counter: { total: 2000, idle: 1600 } }));
  state.run("uptime", at, at, JSON.stringify({ checks: [{ path: "/health", ok: true }, { path: "/ready", ok: true }], checked_at: at, same_provider: true }));
  state.run("d1", at, at, JSON.stringify({ rows_read: 1, rows_written: 1, storage_bytes: 1, day: iso(now).slice(0, 10) }));
  state.run("supabase_plan", at, at, JSON.stringify({ plan: "free", scope: "organization" }));
  sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES('database',?,?,?)").run(iso(now - 7 * MIN), iso(now - 7 * MIN), JSON.stringify({ cpu_counter: { total: 1000, idle: 800 } }));
  for (const key of ["egress", "cached_egress", "storage"]) sqlite.prepare("INSERT INTO manual_usage(key,value,period_start,period_end,verified_at,scope) VALUES(?,?,?,?,?,'organization')").run(key, 1024, monthStart.toISOString(), monthEnd.toISOString(), iso(now - HOUR));
  const tel = sqlite.prepare("INSERT INTO telemetry(id,at,route,method,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,slot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
  for (let i = 0; i < samples; i += 1) tel.run(`v22981-user-${i}-sample`, now - MIN - i * 1000, i % 2 ? "web" : "skill", "POST", 200, 300, 2, 20, 0, "ok", "random", `v22981-slot-${i}`);
}
const healthyEnv = (db, now) => ({ MONITOR_DB: db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) });
const putRoundtrip = (sqlite, record) => sqlite.prepare("INSERT INTO settings(key,value) VALUES('roundtrip',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(record));
const view = (result) => JSON.stringify({ status: result.status, alerts: result.alerts, unknown: result.unknown, notes: result.notes });

const originalFetch = globalThis.fetch;
const originalError = console.error;
const logged = [];
console.error = (...args) => { logged.push(args.map(String).join(" ")); };
globalThis.fetch = worldFetch;
try {
  // ── 0. 관제 판 ─────────────────────────────────────────────────────────────
  await section("0 관제 판", async () => {
    eq(model.MONITOR_VERSION, "1.4.0", "관제 판은 1.4.0 이다(1.3.0 → 1.4.0, V22.9.82 이용 현황. 1.3.0 은 V79:T-43 앱 표본 왕복 확인)");
    eq((await (await monitor.fetch(new Request("https://monitor.example/health"), {}, {})).json()).version, "1.4.0", "/health 가 1.4.0 을 알린다");
  });

  // ── 1. 관제 모델: 왕복 확인 표본의 종류와 기록 ─────────────────────────────────
  await section("1 관제 모델", async () => {
    const sample = { id: "aaaaaaaa-1111-4222-8333-444444444444", at: Date.now(), route: "api", method: "GET", status: 200, duration_ms: 0, db_count: 0, db_ms: 0, db_failures: 0, db_retries: 0, outcome: "ok", sample_kind: "roundtrip" };
    eq(model.sanitizeTelemetry(sample).sample_kind, "roundtrip", "관제가 왕복 확인 표본의 종류를 그대로 받는다(예전에는 incident 로 바뀌어 오류·지연 표본에 섞였다)");
    eq(model.sanitizeTelemetry({ ...sample, ref: "bbbbbbbb-1111-4222-8333-444444444444" }).ref, null, "왕복 확인 표본은 다른 표본 행을 고칠 수 없다(ref 를 버린다)");
    eq(model.sanitizeTelemetry({ ...sample, sample_kind: "other" }).sample_kind, "incident", "모르는 종류는 예전처럼 오류·지연 표본이다");
    eq(model.sanitizeTelemetry({ ...sample, sample_kind: "random" }).sample_kind, "random", "무작위 표본은 예전 그대로다");
    const record = model.roundtripRecord, look = model.roundtripView;
    ok(typeof record === "function" && typeof look === "function", "왕복 확인 기록(roundtripRecord)·판정(roundtripView) 함수가 있다");
    if (typeof record !== "function" || typeof look !== "function") return;
    const t0 = Date.parse("2026-10-27T03:10:00.000Z");
    let r = record(null, { status: "failing", error_code: "not_connected" }, iso(t0));
    eq(`${r.status}/${r.failures}/${r.last_ok_at}`, "failing/1/null", "첫 실패는 연속 실패 1번이고 마지막 정상이 없다");
    r = record(r, { status: "failing", error_code: "not_connected" }, iso(t0 + 5 * MIN));
    r = record(r, { status: "unknown", error_code: "timeout" }, iso(t0 + 10 * MIN));
    eq(`${r.status}/${r.failures}/${r.error_code}`, "unknown/2/timeout", "확인하지 못한 회차(unknown)는 연속 실패를 세지도 지우지도 않는다");
    r = record(r, { status: "failing", error_code: "not_connected" }, iso(t0 + 15 * MIN));
    eq(r.failures, model.ROUNDTRIP_ALERT_FAILURES, "정상 확인 없이 세 번째 실패에서 경고 기준(3번)에 닿는다");
    r = record(r, { status: "ok", error_code: null }, iso(t0 + 20 * MIN));
    eq(`${r.status}/${r.failures}/${r.error_code}/${r.last_ok_at}`, `ok/0/null/${iso(t0 + 20 * MIN)}`, "정상 확인 한 번이 연속 실패를 0 으로 되돌리고 마지막 정상 시각을 남긴다");
    eq(record(r, { status: "unknown", error_code: "unsupported" }, iso(t0 + 25 * MIN)).last_ok_at, iso(t0 + 20 * MIN), "확인 불가 회차도 마지막 정상 시각을 지우지 않는다");
    eq(look(null, t0).status, "unknown", "기록이 없으면 확인 불가다");
    eq(look(null, t0).error_code, "not_checked", "기록이 없으면 오류 분류가 not_checked 다");
    eq(look(r, t0 + 20 * MIN + 19 * MIN).status, "ok", "19분 전 정상 확인은 정상이다");
    const stale = look(r, t0 + 20 * MIN + 21 * MIN);
    eq(`${stale.status}/${stale.error_code}`, "unknown/stale", "20분 넘게 확인이 없으면 정상 기록도 확인 불가(stale)다");
    eq(look({ ...r, checked_at: iso(t0 + 30 * MIN) }, t0 + 20 * MIN).status, "unknown", "앞날 시각의 기록은 믿지 않는다");
    eq(look({ status: "weird", checked_at: iso(t0), failures: -4 }, t0).status, "unknown", "모르는 상태 값은 확인 불가다");
  });

  // ── 2. 옛 관제 1.2.1 + 새 앱: 머리 없는 부름은 V22.9.80 과 같은 바이트, 확인 표본 없음 ──────────────
  await section("2 옛 관제 + 새 앱", async () => {
    const sent = [];
    const env = appProbeEnv(sent);
    world.supabase = "ok";
    const plain = await probe(env);
    ok(plain.status === 200 && plain.type === "application/json; charset=utf-8" && plain.text === GOLDEN_OK, `관제 1.2.1 의 부름(인증 머리만)에 V22.9.80 과 같은 바이트로 답한다: ${plain.status} ${plain.text}`);
    world.supabase = "fails";
    const failing = await probe(env);
    ok(failing.status === 503 && failing.text === GOLDEN_FAIL, `DB 지표 실패도 V22.9.80 과 같은 바이트다: ${failing.status} ${failing.text}`);
    world.supabase = "ok";
    const unset = await probe({ ...env, SUPABASE_URL: "" });
    ok(unset.status === 503 && unset.text === GOLDEN_NOT_CONNECTED, `DB 지표 미연결도 V22.9.80 과 같은 바이트다: ${unset.status} ${unset.text}`);
    for (const value of ["", "short", "x".repeat(65), "has space 12345", "../../internal/x", "<script>alert(1)</script>"]) {
      const odd = await probe(env, { roundtrip: value });
      ok(odd.status === 200 && odd.text === GOLDEN_OK, `왕복 확인 머리가 id 꼴이 아니면(${JSON.stringify(value.slice(0, 20))}) 머리가 없을 때와 같은 바이트다`);
    }
    eq(sent.length, 0, "관제 1.2.1 의 부름(왕복 확인 머리 없음·꼴이 아님)에는 관제로 아무것도 보내지 않는다");
    const wrong = await probe(env, { roundtrip: "cccccccc-1111-4222-8333-444444444444", token: "not-the-token" });
    ok(wrong.status === 401 && sent.length === 0, `토큰이 틀린 부름은 왕복 확인 머리가 있어도 401 이고 아무것도 보내지 않는다(${wrong.status})`);
  });

  // ── 3. 새 관제 + 새 앱: 머리가 있으면 사용자 표본과 같은 전송으로 확인 표본 하나 ─────────────────
  await section("3 새 관제 부름", async () => {
    const id = "dddddddd-1111-4222-8333-444444444444";
    const sent = [];
    const env = appProbeEnv(sent);
    world.supabase = "ok";
    const before = Date.now();
    const answered = await probe(env, { roundtrip: id });
    eq(answered.status, 200, "왕복 확인을 실은 부름도 DB 지표가 정상이면 200 이다");
    eq(answered.text, `${GOLDEN_OK.slice(0, -1)},"roundtrip":{"id":"${id}","result":"sent"}}`, "답은 V22.9.80 의 바이트에 roundtrip(같은 id·sent)만 덧붙인다");
    eq(sent.length, 1, "확인 표본을 정확히 하나 보낸다");
    const [one] = sent;
    ok(one?.url === "https://monitor.internal/internal/telemetry" && one?.init?.method === "POST" && one?.init?.headers?.authorization === `Bearer ${TOKEN}` && one?.init?.headers?.["content-type"] === "application/json", "사용자 표본과 같은 주소·방식·토큰·형식으로 보낸다");
    ok(one?.init?.signal instanceof AbortSignal, "사용자 표본과 같이 시한(AbortSignal)을 건다");
    eq(Object.keys(one?.body || {}).sort().join(","), USER_SAMPLE_KEYS, "확인 표본의 칸은 사용자 표본 칸과 같다(주소·발화·사용자·가계부 칸이 없다)");
    ok(one?.body?.id === id && one?.body?.sample_kind === "roundtrip" && one?.body?.route === "api" && one?.body?.outcome === "ok" && one?.body?.status === 200, `확인 표본은 관제가 준 id·종류 roundtrip 이다: ${JSON.stringify(one?.body)}`);
    ok(one?.body?.at >= before - 1000 && one?.body?.at <= Date.now() + 1000, "확인 표본 시각은 지금이다(관제가 10분 밖 표본을 버리므로)");
    ok(!JSON.stringify(one?.body || {}).includes("fixture-only") && !JSON.stringify(one?.body || {}).includes(TOKEN), "확인 표본에 비밀 값이 없다");
    world.supabase = "fails";
    const dbDown = await probe(env, { roundtrip: id });
    eq(`${dbDown.status} ${dbDown.text}`, `503 {"ok":false,"error_code":"http_503","roundtrip":{"id":"${id}","result":"sent"}}`, "DB 지표가 실패해도 왕복 확인 결과는 붙인다(DB 수집 실패와 표본 경로를 따로 판정)");
    world.supabase = "ok";
    const noBinding = await probe({ ...env, OPS_MONITOR: undefined }, { roundtrip: id });
    eq(JSON.parse(noBinding.text).roundtrip?.result, "not_connected", "앱에 OPS_MONITOR 연결이 없으면 not_connected 로 답한다(사용자 표본도 못 보내는 상태)");
    const eventsBefore = (globalThis.__AB_OPS_EVENTS || []).length;
    const rejected = await probe(appProbeEnv([], () => new Response('{"ok":false,"error":"storage_not_connected"}', { status: 503 })), { roundtrip: id });
    eq(JSON.parse(rejected.text).roundtrip?.result, "http_503", "관제가 503 으로 거절하면 http_503 으로 답한다");
    ok((globalThis.__AB_OPS_EVENTS || []).slice(eventsBefore).some((event) => event.kind === "monitor_send_failed" && String(event.detail).includes("http_503")), "확인 표본 전송 실패도 사용자 표본처럼 운영 이벤트(monitor_send_failed)로 남는다");
    const thrown = await probe(appProbeEnv([], () => { throw new TypeError("network connection lost"); }), { roundtrip: id });
    eq(JSON.parse(thrown.text).roundtrip?.result, "transport", "관제 연결이 끊기면 transport 로 답한다");
    const slow = await probe(appProbeEnv([], () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }), { roundtrip: id });
    eq(JSON.parse(slow.text).roundtrip?.result, "timeout", "관제가 2초 안에 답하지 않으면 timeout 으로 답한다");
    // 확인 표본은 DB 지표 조회와 함께 나간다: Supabase 흉내가 확인 표본 전송이 시작될 때까지(최대 1초) 기다린다.
    let started; const monitorStarted = new Promise((resolve) => { started = resolve; });
    let overlap = "";
    globalThis.fetch = async () => { overlap = await Promise.race([monitorStarted.then(() => "parallel"), sleep(1000).then(() => "serial")]); return new Response(RAW); };
    try { await probe(appProbeEnv([], () => { started(); return new Response("", { status: 202 }); }), { roundtrip: id }); } finally { globalThis.fetch = worldFetch; }
    eq(overlap, "parallel", "확인 표본은 DB 지표 조회를 기다리지 않고 함께 보낸다(관제의 10초 시한 안에 답이 늦어지지 않게)");
  });

  // ── 4. 새 앱의 사용자 요청 표본은 그대로(관제 1.2.1 이 받는 모양) ─────────────────────────────
  await section("4 사용자 표본", async () => {
    await fixture(async (fx) => {
      const sent = [];
      fx.env.OPS_MONITOR_TOKEN = "v22981-app-monitor-token";
      fx.env.OPS_MONITOR = { async fetch(input, init) { sent.push({ url: String(input), body: JSON.parse(String(init.body)) }); return new Response("", { status: 202 }); } };
      const random = Math.random;
      Math.random = () => 0;
      try {
        for (const path of ["/app?month=2026-07&household_id=house-home", "/reports?month=2026-07&household_id=house-home"]) ok((await page(fx, path)).status === 200, `${path.split("?")[0]} 화면이 열린다`);
        await sleep(60);
      } finally { Math.random = random; }
      eq(sent.length, 2, "사용자 화면 요청마다 표본 하나다(예전과 같음)");
      ok(sent.every((event) => event.url === "https://monitor.internal/internal/telemetry" && Object.keys(event.body).sort().join(",") === USER_SAMPLE_KEYS), "사용자 표본의 주소·칸이 V22.9.80 과 같다");
      ok(sent.every((event) => event.body.sample_kind === "random" && event.body.route === "web"), "사용자 표본은 무작위·웹 표본이고 왕복 확인 종류가 아니다");
    });
  });

  // ── 5. 새 관제 + 새 앱: 실제 왕복 ───────────────────────────────────────────
  await section("5 새 관제 + 새 앱", async () => {
    const fx = monitorDb();
    const { monitorEnv, calls } = wire({ db: fx.db });
    world.supabase = "ok";
    const t0 = Date.parse("2026-10-27T03:10:00.000Z");
    fx.log.length = 0;
    await cron(monitorEnv, t0);
    eq(calls.accountbook, 1, "5분 수집 한 번에 DB 수집 요청은 한 번이다(왕복 확인을 위한 요청을 더하지 않는다. 1.4.0 이용 현황 요청은 calls.usage 로 따로 센다)");
    ok(ID.test(calls.headers[0] || ""), `DB 수집 요청에 왕복 확인 id 를 싣는다: ${calls.headers[0]}`);
    eq(calls.telemetry, 1, "앱이 확인 표본 하나를 관제 /internal/telemetry 로 보낸다");
    const r = roundtripOf(fx.sqlite);
    eq(`${r?.status}/${r?.failures}/${r?.error_code}/${r?.last_ok_at}`, `ok/0/null/${iso(t0)}`, "관제가 받은 확인 표본으로 왕복 확인을 정상으로 적는다");
    eq(telemetryRows(fx.sqlite).length, 0, "받은 확인 표본 행은 확인하면서 지운다(요청 표본 표에 남지 않는다)");
    eq(fx.sqlite.prepare("SELECT status FROM collector_state WHERE name='database'").get()?.status, "ok", "같은 요청의 DB 지표 수집도 그대로 정상이다");
    const roundtripStatements = fx.log.filter((sql) => /DELETE FROM telemetry WHERE id=\? RETURNING id|SELECT value FROM settings WHERE key='roundtrip'|INSERT INTO settings\(key,value\) VALUES\('roundtrip'/.test(sql)).length;
    eq(roundtripStatements, 3, "왕복 확인 판정은 cron 한 번에 D1 문장 3개(받은 행 지우기·이전 기록 읽기·기록 쓰기)만 더한다");
    const full = await summary(monitorEnv, t0 + MIN), alerting = await summary(monitorEnv, t0 + MIN, { alerting: true });
    eq(full.application.roundtrip?.status, "ok", "화면 요약의 왕복 확인이 정상이다");
    eq(JSON.stringify(alerting.application.roundtrip), JSON.stringify(full.application.roundtrip), "알림 판정 범위와 화면 범위의 왕복 확인이 같다");
    eq(full.application.telemetry_status, "not_connected", "사용자 표본이 없으면 요청 표본 수신은 그대로 '미연결'이다(확인 표본은 요청 표본으로 세지 않는다)");
    ok(!full.unknown.includes(TELEMETRY_UNKNOWN), "왕복 확인이 정상이면 표본 0건을 확인되지 않은 항목으로 두지 않는다");
    ok(full.notes.some((note) => note.startsWith("최근 24시간 앱 요청 표본 없음(왕복 확인 정상")), "왕복 확인이 정상이면 표본 0건을 '요청이 적음' 참고 사항으로 보인다");
    ok(!full.alerts.some((a) => a.title === ALERT_TITLE), "정상 왕복에는 전송 실패 경고가 없다");
    await cron(monitorEnv, t0 + 5 * MIN);
    ok(calls.accountbook === 2 && calls.telemetry === 2 && telemetryRows(fx.sqlite).length === 0 && roundtripOf(fx.sqlite)?.last_ok_at === iso(t0 + 5 * MIN), "다음 수집도 DB 수집 요청 한 번·확인 표본 한 번이고 표에 남는 행이 없다");
    const names = fx.sqlite.prepare("SELECT name FROM collector_state ORDER BY name").all().map((row) => row.name);
    ok(names.every((name) => ["alerts", "cloudflare", "d1", "database", "supabase_plan", "token", "uptime"].includes(name)), `수집 상태 표에 새 행이 없다(1.2.1 로 되돌려도 모르는 수집기가 '확인 불가'로 남지 않는다): ${names.join(",")}`);
    ok(fx.sqlite.prepare("SELECT key FROM settings WHERE key NOT LIKE 'alert:%' AND key NOT LIKE 'ticket:%'").all().map((row) => row.key).sort().join(",") === "roundtrip,usage", "왕복 확인 기록은 settings 의 'roundtrip' 한 행뿐이고 그 밖에는 1.4.0 이용 현황 수집 상태 'usage' 한 행뿐이다(1.2.1 은 두 행을, 1.3.0 은 'usage' 를 읽지 않는다)");
  });

  // ── 6. 새 관제 + 옛 앱: 확인 불가로 보이고 경고는 없다 ──────────────────────────────
  await section("6 새 관제 + 옛 앱", async () => {
    for (const [label, accountbook] of [["머리를 떼어 보낸 실제 번들", strippedApp], ["V22.9.80 답 모양", v80App]]) {
      const fx = monitorDb();
      const mails = [];
      const { monitorEnv, calls } = wire({ db: fx.db, accountbook, mails });
      const t0 = Date.parse("2026-10-27T03:10:00.000Z");
      const codes = new Set();
      for (let i = 0; i < 36; i += 1) { await cron(monitorEnv, t0 + i * 5 * MIN); codes.add(`${roundtripOf(fx.sqlite)?.status}/${roundtripOf(fx.sqlite)?.error_code}/${roundtripOf(fx.sqlite)?.failures}`); }
      eq([...codes].join(","), "unknown/unsupported/0", `${label}: 3시간 내내 왕복 확인은 확인 불가(unsupported)·연속 실패 0 이다`);
      ok(calls.accountbook === 36 && calls.telemetry === 0 && telemetryRows(fx.sqlite).length === 0, `${label}: 옛 앱은 확인 표본을 보내지 않고 관제도 DB 수집 요청을 더하지 않는다`);
      ok(!mails.some((message) => bodyOf(message).includes(ALERT_TITLE)) && alertRecord(fx.sqlite, ALERT_TITLE) === null, `${label}: 전송 실패 경고를 보내지도 기억하지도 않는다`);
      const now = t0 + 35 * 5 * MIN + MIN;
      const result = await summary(monitorEnv, now);
      eq(result.application.roundtrip?.status, "unknown", `${label}: 화면 요약의 왕복 확인이 확인 불가다`);
      ok(!result.alerts.some((a) => a.title === ALERT_TITLE), `${label}: 화면 요약에 전송 실패 경고가 없다`);
      ok(result.unknown.includes(TELEMETRY_UNKNOWN), `${label}: 표본 0건은 1.2.1 처럼 확인되지 않은 항목이다`);
      fx.sqlite.prepare("DELETE FROM settings WHERE key='roundtrip'").run();
      eq(view(result), view(await summary(monitorEnv, now)), `${label}: 상태·경고·확인되지 않은 항목·참고가 왕복 확인 기록이 없을 때(1.2.1 판정)와 같다`);
      if (accountbook === strippedApp) {
        const text = textOf(renderDashboard(result));
        ok(text.includes("왕복 확인 확인 불가") && text.includes("앱이 왕복 확인을 지원하지 않는 판입니다(V22.9.80 까지)") && text.includes("저사용량과 연결 실패를 자동으로 구분하지 못합니다"), "화면: 옛 앱이면 왕복 확인 '확인 불가'와 그 이유·구분하지 못한다는 안내를 보인다");
      }
    }
    // 옛 앱이 토큰 불일치로 401 이면(DB 수집도 unauthorized) 확인 불가이고 경고가 없다.
    const fx = monitorDb();
    const mails = [];
    const { monitorEnv, calls } = wire({ db: fx.db, mails, appOverrides: { OPS_MONITOR_TOKEN: "rotated-on-one-side" } });
    for (let i = 0; i < 4; i += 1) await cron(monitorEnv, Date.parse("2026-10-27T03:10:00.000Z") + i * 5 * MIN);
    const r = roundtripOf(fx.sqlite);
    ok(r?.status === "unknown" && r?.error_code === "unauthorized" && calls.telemetry === 0 && !mails.some((message) => bodyOf(message).includes(ALERT_TITLE)), `토큰이 서로 다르면(앱 401) 확인 불가(unauthorized)이고 확인 표본·경고가 없다: ${JSON.stringify(r)}`);
    eq(fx.sqlite.prepare("SELECT error_code FROM collector_state WHERE name='database'").get()?.error_code, "unauthorized", "그때 DB 수집 쪽에 unauthorized 가 따로 보인다");
  });

  // ── 7. 새 관제 + 새 앱의 실패 판정 ──────────────────────────────────────────
  await section("7 실패 판정", async () => {
    const t0 = Date.parse("2026-10-27T03:10:00.000Z");
    {
      // 앱에 OPS_MONITOR 연결이 빠진 채 배포됨 → 사용자 표본도 안 나간다. 정상 확인 없이 3번이면 주의 경고 메일.
      const fx = monitorDb();
      const mails = [];
      const { monitorEnv, appEnv, calls } = wire({ db: fx.db, mails });
      const binding = appEnv.OPS_MONITOR;
      appEnv.OPS_MONITOR = undefined;
      const alertMails = () => mails.filter((message) => bodyOf(message).includes(`[주의] ${ALERT_TITLE}`)).length;
      await cron(monitorEnv, t0);
      ok(roundtripOf(fx.sqlite)?.status === "failing" && roundtripOf(fx.sqlite)?.error_code === "not_connected" && roundtripOf(fx.sqlite)?.failures === 1 && alertMails() === 0, `연결이 빠지면 첫 회차는 실패 1번이고 아직 메일이 없다: ${JSON.stringify(roundtripOf(fx.sqlite))}`);
      await cron(monitorEnv, t0 + 5 * MIN);
      eq(alertMails(), 0, "두 번째 실패에도 메일이 없다(일시 장애로 메일을 보내지 않음)");
      await cron(monitorEnv, t0 + 10 * MIN);
      eq(alertMails(), 1, "정상 확인 없이 세 번째 실패(10분)에서 주의 메일을 한 통 보낸다");
      ok(mails.some((message) => bodyOf(message).includes("not_connected") && bodyOf(message).includes("OPS_MONITOR")), "경고 메일이 실패 이유(not_connected)와 확인할 곳(OPS_MONITOR)을 적는다");
      ok(logged.some((line) => line.includes("monitor roundtrip failing: not_connected")), "실패는 Workers Logs 에도 남는다");
      const failingView = await summary(monitorEnv, t0 + 10 * MIN + MIN);
      ok(failingView.status === "warning" && failingView.alerts.some((a) => a.title === ALERT_TITLE && a.status === "warning") && failingView.unknown.includes(TELEMETRY_UNKNOWN), "화면 요약: 전체 상태 주의·전송 실패 경고, 표본 0건은 확인되지 않은 항목으로 남는다");
      await cron(monitorEnv, t0 + 15 * MIN);
      eq(alertMails(), 1, "같은 경고는 24시간 안에 다시 보내지 않는다");
      appEnv.OPS_MONITOR = binding;
      for (const minute of [20, 25]) await cron(monitorEnv, t0 + minute * MIN);
      ok(alertRecord(fx.sqlite, ALERT_TITLE)?.resolved_at === null || alertRecord(fx.sqlite, ALERT_TITLE)?.resolved_at === undefined, "연결을 되살린 뒤 정상 두 번으로는 아직 해소가 아니다");
      await cron(monitorEnv, t0 + 30 * MIN);
      eq(alertRecord(fx.sqlite, ALERT_TITLE)?.resolved_at, iso(t0 + 30 * MIN), "정상 확인 세 번(10분 이상)에 해소로 기록한다(주의 경고라 해소 메일은 없다)");
      ok(roundtripOf(fx.sqlite)?.status === "ok" && roundtripOf(fx.sqlite)?.failures === 0 && calls.telemetry === 3, "되살린 뒤 확인 표본이 오가고 연속 실패가 0 이다");
    }
    {
      // 실패·정상이 번갈아 나오면 경고가 없다. 확인 불가 회차는 연속 실패를 끊지 않는다.
      const fx = monitorDb();
      const mails = [];
      let reachable = true;
      const { monitorEnv, appEnv } = wire({ db: fx.db, mails });
      const binding = appEnv.OPS_MONITOR;
      const real = monitorEnv.ACCOUNTBOOK;
      monitorEnv.ACCOUNTBOOK = { async fetch(input, init) { if (!reachable) throw new TypeError("fetch failed"); return real.fetch(input, init); } };
      for (let i = 0; i < 8; i += 1) { appEnv.OPS_MONITOR = i % 2 ? binding : undefined; await cron(monitorEnv, t0 + i * 5 * MIN); }
      ok(!mails.some((message) => bodyOf(message).includes(ALERT_TITLE)) && roundtripOf(fx.sqlite)?.failures === 0, "실패·정상이 번갈아 나오면 경고 메일이 없다");
      appEnv.OPS_MONITOR = undefined;
      await cron(monitorEnv, t0 + 40 * MIN);
      await cron(monitorEnv, t0 + 45 * MIN);
      reachable = false;
      await cron(monitorEnv, t0 + 50 * MIN);
      ok(roundtripOf(fx.sqlite)?.status === "unknown" && roundtripOf(fx.sqlite)?.failures === 2 && !mails.some((message) => bodyOf(message).includes(ALERT_TITLE)), `관제가 앱을 부르지 못한 회차는 확인 불가이고 연속 실패 2번을 그대로 둔다: ${JSON.stringify(roundtripOf(fx.sqlite))}`);
      reachable = true;
      await cron(monitorEnv, t0 + 55 * MIN);
      ok(roundtripOf(fx.sqlite)?.failures === 3 && mails.some((message) => bodyOf(message).includes(`[주의] ${ALERT_TITLE}`)), "확인 불가를 사이에 둔 세 번째 실패에서 경고한다");
    }
    {
      // 앱의 OPS_MONITOR 가 다른 관제(다른 저장소)를 가리킴 → 앱은 보냈다고 하지만 이 관제에는 없다.
      const fx = monitorDb(), other = monitorDb();
      const { monitorEnv } = wire({ db: fx.db, appOverrides: { OPS_MONITOR: { async fetch(input, init) { return monitor.fetch(new Request(input, init), { MONITOR_DB: other.db, OPS_MONITOR_TOKEN: TOKEN }, {}); } } } });
      await cron(monitorEnv, t0);
      const r = roundtripOf(fx.sqlite);
      ok(r?.status === "failing" && r?.error_code === "not_received" && other.sqlite.prepare("SELECT COUNT(*) AS n FROM telemetry WHERE sample_kind='roundtrip'").get().n === 1, `앱이 보냈다는 확인 표본이 이 관제에 없으면 실패(not_received)다: ${JSON.stringify(r)}`);
    }
    {
      // 관제의 표본 받기가 거절(503) → 앱이 http_503 으로 답한다.
      const fx = monitorDb();
      const { monitorEnv } = wire({ db: fx.db, appOverrides: { OPS_MONITOR: { async fetch() { return new Response('{"ok":false,"error":"storage_not_connected"}', { status: 503 }); } } } });
      await cron(monitorEnv, t0);
      eq(`${roundtripOf(fx.sqlite)?.status}/${roundtripOf(fx.sqlite)?.error_code}`, "failing/http_503", "관제의 표본 받기가 503 이면 실패(http_503)다");
    }
    {
      // 배포 전환 중 옛 관제 인스턴스가 확인 표본을 'incident' 로 받아 둔 경우: 받은 것으로 보고 그 행도 지운다.
      const fx = monitorDb();
      let monitorEnvRef = null;
      const { monitorEnv } = wire({ db: fx.db, appOverrides: { OPS_MONITOR: { async fetch(input, init) { const body = JSON.parse(String(init.body)); return monitor.fetch(new Request(input, { ...init, body: JSON.stringify({ ...body, sample_kind: "incident" }) }), monitorEnvRef, {}); } } } });
      monitorEnvRef = monitorEnv;
      await cron(monitorEnv, t0);
      ok(roundtripOf(fx.sqlite)?.status === "ok" && telemetryRows(fx.sqlite).length === 0, "옛 관제가 'incident' 로 받아 둔 확인 표본도 받은 것으로 보고 지운다(오류·지연 표본 수에 남지 않는다)");
    }
    {
      // 관제 쪽 DB 수집 설정이 없으면(ACCOUNTBOOK·토큰 없음) 확인 불가(not_connected), 경고 없음.
      const fx = monitorDb();
      await cron({ MONITOR_DB: fx.db, APP_ORIGIN: "https://app.example" }, t0);
      eq(`${roundtripOf(fx.sqlite)?.status}/${roundtripOf(fx.sqlite)?.error_code}`, "unknown/not_connected", "관제에 앱 연결이 없으면 확인 불가(not_connected)다");
    }
  });

  // ── 8·9. 상태 표와 화면 ─────────────────────────────────────────────────────
  await section("8·9 상태 표와 화면", async () => {
    const now = Date.parse("2026-10-27T03:12:00.000Z");
    const okRecord = { status: "ok", checked_at: iso(now - 2 * MIN), error_code: null, last_ok_at: iso(now - 2 * MIN), failures: 0 };
    const failing = (n) => ({ status: "failing", checked_at: iso(now - 2 * MIN), error_code: "not_connected", last_ok_at: iso(now - DAY), failures: n });
    const unsupported = { status: "unknown", checked_at: iso(now - 2 * MIN), error_code: "unsupported", last_ok_at: null, failures: 0 };
    const results = {};
    for (const [label, record, samples, status, telemetryUnknown, quietNote, alert] of [
      ["정상 + 표본 0건", okRecord, 0, "normal", false, true, false],
      ["정상 + 표본 있음", okRecord, 60, "normal", false, false, false],
      ["실패 3번 + 표본 0건", failing(3), 0, "warning", true, false, true],
      ["실패 2번 + 표본 0건", failing(2), 0, "unknown", true, false, false],
      ["실패 3번 + 표본 있음", failing(3), 60, "warning", false, false, true],
      ["옛 앱 + 표본 0건", unsupported, 0, "unknown", true, false, false],
      ["옛 앱 + 표본 있음", unsupported, 60, "normal", false, false, false],
      ["기록 없음 + 표본 0건", null, 0, "unknown", true, false, false],
      ["25분 전 정상 + 표본 0건", { ...okRecord, checked_at: iso(now - 25 * MIN), last_ok_at: iso(now - 25 * MIN) }, 0, "unknown", true, false, false],
    ]) {
      const fx = monitorDb();
      seedHealthy(fx.sqlite, now, { samples });
      if (record) putRoundtrip(fx.sqlite, record);
      const env = healthyEnv(fx.db, now);
      const full = await summary(env, now), alerting = await summary(env, now, { alerting: true });
      results[label] = full;
      ok(full.status === status && full.unknown.includes(TELEMETRY_UNKNOWN) === telemetryUnknown && full.notes.some((note) => note.includes("앱 요청 표본 없음(왕복 확인 정상")) === quietNote && full.alerts.some((a) => a.title === ALERT_TITLE) === alert,
        `${label}: 전체 상태 ${status}·표본 미관측 항목 ${telemetryUnknown}·요청 적음 참고 ${quietNote}·전송 실패 경고 ${alert} (받음 ${full.status}·${full.unknown.join("|")}·${full.alerts.map((a) => a.title).join("|")})`);
      eq(view(alerting), view(full), `${label}: 알림 판정 범위의 상태·경고·항목·참고가 화면 범위와 같다`);
    }
    {
      // 지우지 못하고 남은 확인 표본 행(답을 잃은 회차)은 요청 표본으로 세지 않는다.
      const fx = monitorDb();
      seedHealthy(fx.sqlite, now);
      fx.sqlite.prepare("INSERT INTO telemetry(id,at,route,method,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,slot) VALUES('eeeeeeee-1111-4222-8333-444444444444',?,'api','GET',200,0,0,0,0,'ok','roundtrip','orphan-slot')").run(now - MIN);
      const full = await summary(healthyEnv(fx.db, now), now), alerting = await summary(healthyEnv(fx.db, now), now, { alerting: true });
      ok(full.application.telemetry_status === "not_connected" && full.application.random_samples === 0 && full.application.incident_count === 0 && full.application.recent.length === 0, "남은 확인 표본 행은 화면의 요청 표본(수신 상태·표본 수·최근 표본)에 들어가지 않는다");
      ok(alerting.application.telemetry_status === "not_connected" && alerting.application.incident_count === 0, "남은 확인 표본 행은 알림 판정의 요청 표본에도 들어가지 않는다");
    }
    // 화면: 같은 요약을 실제 화면 스크립트로 그린다.
    const quiet = textOf(renderDashboard(results["정상 + 표본 0건"]));
    ok(quiet.includes("요청 표본 수신 미연결 · 왕복 확인 정상") && quiet.includes("표본 경로는 살아 있으므로 표본이 없는 것은 요청이 적기 때문입니다"), "화면: 왕복 확인 정상 + 표본 0건이면 '요청이 적기 때문'이라고 보인다");
    ok(!quiet.includes("저사용량과 연결 실패는 자동으로 구분하지 못합니다"), "화면: 왕복 확인이 정상이면 '구분하지 못한다' 문구를 보이지 않는다");
    ok(textOf(renderDashboard(results["정상 + 표본 있음"])).includes("왕복 확인 정상(마지막 확인") && textOf(renderDashboard(results["정상 + 표본 있음"])).includes("표본 경로가 동작합니다"), "화면: 표본이 있고 왕복 확인도 정상이면 경로가 동작한다고 보인다");
    const failingText = textOf(renderDashboard(results["실패 3번 + 표본 0건"]));
    ok(failingText.includes("왕복 확인 실패") && failingText.includes("not_connected · 연속 3번") && failingText.includes("OPS_MONITOR 연결과 OPS_MONITOR_TOKEN") && failingText.includes(ALERT_TITLE), "화면: 왕복 확인 실패·연속 횟수·확인할 곳과 전송 실패 경고를 보인다");
    const failingHtml = renderDashboard(results["실패 3번 + 표본 0건"]);
    ok(failingHtml.includes('왕복 확인 <span class="badge critical">실패</span>') && renderDashboard(results["정상 + 표본 0건"]).includes('왕복 확인 <span class="badge normal">정상</span>') && renderDashboard(results["옛 앱 + 표본 0건"]).includes('왕복 확인 <span class="badge unknown">확인 불가</span>'), "화면: 왕복 확인 배지가 정상·실패·확인 불가 셋으로 나뉜다");
    ok(/<tr><td>앱 표본 왕복 확인<\/td><td><span class="badge critical">실패<\/span><\/td><td>[^<]+<\/td><td>[^<]+<\/td><td>not_connected<\/td><\/tr>/.test(failingHtml), "화면: 수집 연결 상태 표에 '앱 표본 왕복 확인' 줄(상태·마지막 성공·마지막 시도·오류 분류)이 있다");
    const legacy = textOf(renderDashboard(results["옛 앱 + 표본 있음"]));
    ok(legacy.includes("왕복 확인 확인 불가") && legacy.includes("V22.9.80 까지"), "화면: 옛 앱이면 표본이 있어도 왕복 확인은 확인 불가로 보인다");
    ok(results["정상 + 표본 0건"].limitations.some((line) => line.includes("왕복 확인") && line.includes("요청 표본 수·p95·실패 수에 넣지 않으며")), "화면의 '지표의 범위와 제한'이 왕복 확인 표본을 통계에 넣지 않는다고 적는다");
  });

  // ── 10. 문서·등록 ───────────────────────────────────────────────────────────
  await section("10 문서·등록", async () => {
    const readme = readFileSync(new URL("../monitoring/README.md", import.meta.url), "utf8");
    ok(readme.includes("## 앱 표본 왕복 확인 (1.3.0, V22.9.81)") && readme.includes("x-ab-monitor-roundtrip") && readme.includes("validate-monitor-v22981"), "관제 README 에 1.3.0 왕복 확인 절(머리 이름·검사기)이 있다");
    const harness = readFileSync(new URL("../.codex/scripts/verify-repository.mjs", import.meta.url), "utf8");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    ok(harness.includes('"validation/validate-monitor-v22981.mjs"') && pkg.scripts?.["validate:monitor-v22981"] === "node validation/validate-monitor-v22981.mjs", "검사기가 하네스와 package.json 에 등록돼 있다");
  });
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  world.supabase = "ok";
}

if (SOFT) {
  console.log(`V22981_SOFT: 통과 ${total - failed.length} · 실패 ${failed.length} (검사 ${total}개)`);
  for (const message of failed) console.log(`  실패: ${message}`);
  if (failed.length) process.exitCode = 1;
} else {
  base.done();
}
