// V22.9.82 관제 이용 현황 검사 (관제 1.4.0).
// 수익화 판단용 이용 지표(달마다 기록 이용자·인당 월평균 기록 수·재사용률·기능별 카카오 요청 등)를 관제 1.4.0 이 약 한 시간에 한 번
// 앱(ACCOUNTBOOK → /internal/ops-usage)에서 받아 '이용 현황' 칸에 보인다. 계약: review-artifacts/v82-usage-metrics-2026-10-27/CONTRACT.md.
// 관제 쪽을 본다: 55분 간격·저장(samples 달 행·settings 'usage')·다시 검사(칸·숫자·형식·개수)·오류 분류·경고와 전체 상태와 무관·
// 24개월 보관·/api/summary 의 usage·화면 상태별 문구·나눗셈 값과 0 나눔. 9절은 실제 앱 번들(V22.9.82)과 서비스 바인딩 흉내로 잇는다.
// 관제 Worker 는 Node 22 의 SQLite(실제 SQL)로 돌린다. 네트워크는 쓰지 않는다(Node 22 이상 필요, test-d1 과 같음).
// V22982_SOFT=1 이면 실패를 모아 끝까지 돌고 마지막에 목록을 찍는다.
import assert from "node:assert/strict";
import vm from "node:vm";
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import monitor, { summary, collect, collectUsage, deliverAlerts } from "../monitoring/worker.mjs";
import * as model from "../monitoring/model.mjs";
import { dashboardHtml } from "../monitoring/dashboard.mjs";

const SOFT = process.env.V22982_SOFT === "1" || process.argv.includes("--soft");
const LABEL = "V22.9.82 관제 이용 현황 검사 통과";
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
const ok = (value, message) => guard(() => assert.ok(value, message), message);
const eq = (actual, expected, message) => guard(() => assert.equal(actual, expected, message), message);
const same = (actual, expected, message) => guard(() => assert.deepEqual(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const iso = (t) => new Date(t).toISOString();
const pad = (n) => String(n).padStart(2, "0");
const daysIn = (month) => new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
const SCHEMA = readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8");
const TOKEN = "v22982-monitor-token";
const T = Date.parse("2026-10-27T03:10:00.000Z");
const COLLECTORS = ["alerts", "cloudflare", "d1", "database", "supabase_plan", "token", "uptime"];
// 계약의 intent 이름과 화면 이름(관제 화면용) 26개.
const CONTRACT_LABELS = { TRANSACTION: "기록", SUMMARY: "요약", RECENT_RECORDS: "최근 기록", EDIT: "고치기", EDIT_GUIDE: "고치기 안내", BUDGET_SETUP: "예산 설정", BUDGET_STATUS: "남은 예산", SETTLEMENT: "정산", GROUP_LINK: "단톡방 연결", CREATE_HOUSEHOLD: "가계부 만들기", JOIN_HOUSEHOLD: "초대코드 참여", HOUSEHOLD_SWITCH: "가계부 바꾸기", MEMBER_ALIAS_CHANGE: "이름 설정", INVITE_CODE_SHOW: "초대코드 보기", INVITE_MEMBER: "초대하기", WEB_LINK: "웹 가계부", HELP: "도움말", MENU: "메뉴", START: "시작", INPUT_EXAMPLE: "기록 방법", KEYWORD_GUIDE: "키워드 안내", RESERVE_GUIDE: "예비비 안내", DATA_POLICY: "데이터 안내", CANCEL: "취소", EMPTY: "빈 메시지", UNKNOWN: "알 수 없음" };
const TILES = ["이번 달 기록 이용자", "인당 월평균 기록 수", "많이 쓰는 사람", "재사용률", "카카오 대화 수", "신규 가입·새 가계부", "함께 쓰는 가계부 비율", "기록 경로"];

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
const usageState = (sqlite) => { const row = sqlite.prepare("SELECT value FROM settings WHERE key='usage'").get(); return row ? JSON.parse(row.value) : null; };
const usageRows = (sqlite) => sqlite.prepare("SELECT bucket,collected_at,payload FROM samples WHERE source='usage' ORDER BY bucket").all().map((row) => ({ ...row }));
const putUsage = (sqlite, record) => sqlite.prepare("INSERT INTO settings(key,value) VALUES('usage',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(record));
const putUsageRow = (sqlite, month, collectedAt, payload) => sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES('usage',?,?,?) ON CONFLICT(source,bucket) DO UPDATE SET collected_at=excluded.collected_at,payload=excluded.payload").run(month, collectedAt, typeof payload === "string" ? payload : JSON.stringify(model.sanitizeUsage(payload)));
const putRoundtrip = (sqlite, record) => sqlite.prepare("INSERT INTO settings(key,value) VALUES('roundtrip',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value").run(JSON.stringify(record));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json; charset=utf-8" } });
const decode = (b64) => Buffer.from(b64, "base64").toString("utf8");
const bodyOf = (message) => { const raw = String(message.raw || ""); return decode(raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/\r\n/g, "")); };

// 계약 모양 그대로의 이용 현황(앱 V22.9.82 가 보내는 것). 이번 달 4명·직접 기록 9건, 지난달 같은 기간 2명·4건, 지난달 전체 5명·12건.
const period = (from, to, extra = {}) => ({
  from, to, recorders: 4, records: 9, records_by_source: { kakao: 6, web: 3, import: 2, auto: 1, other: 0 }, median_records_per_recorder: 2,
  heavy_recorders: 1, retained_recorders: 2, prior_month_recorders: 3, active_households: 3, shared_active_households: 1, new_users: 2, new_households: 1,
  kakao_requests: 30, kakao_by_intent: [{ intent: "TRANSACTION", requests: 20 }, { intent: "SUMMARY", requests: 6 }, { intent: "NEW_FEATURE", requests: 4 }], ...extra,
});
function usagePayload({ month = "2026-10", through = 27, generated = "2026-10-27T03:00:00.000Z", current = {}, full = {} } = {}) {
  const prev = model.monthShift(month, -1);
  const daily = [];
  for (const [m, last] of [[prev, daysIn(prev)], [month, through]]) for (let d = 1; d <= last; d += 1) daily.push({ day: `${m}-${pad(d)}`, recorders: d % 3, records: d % 4, kakao_requests: d % 5, new_users: d % 7 === 0 ? 1 : 0 });
  return {
    schema: 1, generated_at: generated, month, through_day: through, heavy_threshold: 30,
    current: period(`${month}-01`, `${month}-${pad(through)}`, current),
    previous_same: period(`${prev}-01`, `${prev}-${pad(Math.min(through, daysIn(prev)))}`, { recorders: 2, records: 4, heavy_recorders: 0, retained_recorders: 1, prior_month_recorders: 2, active_households: 2, shared_active_households: 1, new_users: 1, new_households: 1, kakao_requests: 15, median_records_per_recorder: 1.5, kakao_by_intent: [{ intent: "HELP", requests: 15 }] }),
    previous_full: period(`${prev}-01`, `${prev}-${pad(daysIn(prev))}`, { recorders: 5, records: 12, ...full }),
    daily, totals: { users: 9, households: 6, shared_households: 2 },
  };
}
const clone = (value) => JSON.parse(JSON.stringify(value));
const rejects = (input) => { try { model.sanitizeUsage(input); return false; } catch (error) { return error.message === "invalid_reply"; } };

// 앱(ACCOUNTBOOK) 흉내: /internal/ops-usage 는 answer() 의 답, /internal/ops-metrics 는 평범한 DB 지표. 부른 내용을 calls 에 적는다.
function fakeApp(answer) {
  const calls = { usage: [], metrics: 0, other: [] };
  const binding = {
    async fetch(input, init) {
      const request = new Request(input, init);
      const path = new URL(request.url).pathname;
      if (path === "/internal/ops-metrics") { calls.metrics += 1; return json({ ok: true, metrics: { database_bytes: 1024, connections: 1, max_connections: 60, cpu_counter: { total: 100, idle: 90 } } }); }
      if (path !== "/internal/ops-usage") { calls.other.push(path); return json({ ok: false, error: "not_found" }, 404); }
      calls.usage.push({ url: request.url, method: request.method, authorization: request.headers.get("authorization"), signal: init?.signal });
      return answer(request, calls.usage.length);
    },
  };
  return { calls, binding };
}
async function cron(env, at) {
  const pending = [];
  await monitor.scheduled({ scheduledTime: at }, env, { waitUntil: (job) => pending.push(job) });
  await Promise.all(pending);
}

// 다른 수집기가 모두 정상인 관제 저장소(validate-monitor-v22981 의 seedHealthy 와 같은 값). 요청 표본 수와 왕복 확인 기록만 바꿔 본다.
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
  for (let i = 0; i < samples; i += 1) tel.run(`v22982-user-${i}-sample`, now - MIN - i * 1000, i % 2 ? "web" : "skill", "POST", 200, 300, 2, 20, 0, "ok", "random", `v22982-slot-${i}`);
}
const healthyEnv = (db, now) => ({ MONITOR_DB: db, OPS_MONITOR_TOKEN: TOKEN, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) });
const verdict = (result) => JSON.stringify({ status: result.status, alerts: result.alerts, unknown: result.unknown, notes: result.notes, quotas: result.quotas.map((q) => [q.key, q.status]), states: Object.keys(result.states).sort() });

// 관제 화면(dashboard.mjs)의 실제 스크립트를 가짜 DOM 에서 돌리고 render(summary) 결과 HTML 을 받는다(validate-monitor-v22981 과 같은 방식).
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
const PANEL_START = '<section class="card section upanel" aria-labelledby="usageTitle">';
const panelOf = (html) => { const start = html.indexOf(PANEL_START); return start < 0 ? "" : html.slice(start, html.indexOf("</section>", html.indexOf('<ul class="unotes', start)) + 10); };
const textOf = (html) => html.replace(/<[^>]*>/g, " ").replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/\s+/g, " ").trim();
const count = (text, part) => text.split(part).length - 1;

const originalFetch = globalThis.fetch;
const originalError = console.error;
const originalNow = Date.now;
const logged = [];
const network = [];
console.error = (...args) => { logged.push(args.map(String).join(" ")); };
globalThis.fetch = async (input) => { const url = typeof input === "string" ? input : input.url; network.push(url); throw new Error(`unexpected network ${url}`); };
try {
  // ── 0. 관제 판 ─────────────────────────────────────────────────────────────
  await section("0 관제 판", async () => {
    eq(model.MONITOR_VERSION, "1.4.0", "관제 판은 1.4.0 이다(1.3.0 → 1.4.0, V22.9.82 이용 현황)");
    eq((await (await monitor.fetch(new Request("https://monitor.example/health"), {}, {})).json()).version, "1.4.0", "/health 가 1.4.0 을 알린다");
  });

  // ── 1. 관제 모델: 나눗셈 값·변화율·기능 이름·간격·달 ─────────────────────────────
  await section("1 관제 모델", async () => {
    eq(model.usageRatio(9, 4), 2.25, "인당 월평균 기록 수 = 기록 ÷ 기록 이용자");
    ok(model.usageRatio(5, 0) === null && model.usageRatio(0, 0) === null && model.usageRatio(null, 3) === null && model.usageRatio(3, undefined) === null && model.usageRatio(-1, 3) === null, "분모가 0·없음이거나 값이 음수·없음이면 null 이다(화면 '—')");
    ok(model.usageChange(4, 2) === 1 && model.usageChange(0, 2) === -1 && model.usageChange(2, 2) === 0, "지난달 같은 기간 대비 변화율 = (이번 - 지난) ÷ 지난");
    ok(model.usageChange(3, 0) === null && model.usageChange(null, 2) === null && model.usageChange(3, null) === null, "지난달 같은 기간이 0 이거나 값이 없으면 변화율은 null 이다(0 나눔 없음)");
    const derived = model.usageDerived(model.sanitizeUsage(usagePayload()).current);
    same(derived, { records_per_recorder: 2.25, retention_rate: 2 / 3, kakao_per_recorder: 7.5, shared_ratio: 1 / 3, heavy_ratio: 0.25 }, "기간 하나의 나눗셈 값: 인당 기록 9÷4·재사용률 2÷3·카카오 1명당 30÷4·함께 쓰는 비율 1÷3·많이 쓰는 사람 비율 1÷4");
    const empty = model.usageDerived({ ...period("2026-10-01", "2026-10-01"), recorders: 0, records: 0, prior_month_recorders: 0, retained_recorders: 0, active_households: 0, shared_active_households: 0, kakao_requests: 5, heavy_recorders: 0 });
    same(empty, { records_per_recorder: null, retention_rate: null, kakao_per_recorder: null, shared_ratio: null, heavy_ratio: null }, "기록 이용자·지난달 기록 이용자·기록 있는 가계부가 0 이면 나눗셈 값은 모두 null 이다");
    same(Object.fromEntries(Object.keys(CONTRACT_LABELS).map((key) => [key, model.usageIntentLabel(key)])), CONTRACT_LABELS, "계약의 intent 26개가 계약의 화면 이름으로 보인다");
    ok(model.usageIntentLabel("NEW_FEATURE") === "NEW_FEATURE" && model.usageIntentLabel("CONSTRUCTOR") === "CONSTRUCTOR", "목록에 없는 intent 는 이름 그대로 보인다(객체 기본 속성 이름도 그대로)");
    eq(model.USAGE_INTERVAL_MS, 55 * MIN, "묻는 간격은 직전 시도 뒤 55분이다");
    const at = (ms) => ({ last_attempt_at: iso(T - ms) });
    ok(model.usageDue(null, T) && model.usageDue({}, T) && model.usageDue({ last_attempt_at: "어제" }, T), "시도 기록이 없거나 읽을 수 없으면 묻는다");
    ok(!model.usageDue(at(54 * MIN + 59999), T) && model.usageDue(at(55 * MIN), T) && model.usageDue(at(3 * HOUR), T), "직전 시도 뒤 55분이 안 됐으면 묻지 않고, 55분이 지났으면 묻는다");
    ok(!model.usageDue(at(-10 * MIN), T) && model.usageDue(at(-2 * HOUR), T), "시도 시각이 조금 앞서면 기다리고, 55분 넘게 앞선 시각(시계 이상)이면 묻는다");
    ok(model.kstMonth(Date.parse("2026-10-31T14:59:59.999Z")) === "2026-10" && model.kstMonth(Date.parse("2026-10-31T15:00:00.000Z")) === "2026-11", "달은 한국 시간으로 정한다(10-31 15:00Z = 11월 1일 0시 KST)");
    ok(model.monthShift("2026-01", -1) === "2025-12" && model.monthShift("2026-12", 1) === "2027-01" && model.monthShift("2026-10", -24) === "2024-10", "달 옮기기가 해를 넘는다");
  });

  // ── 2. 관제 쪽 다시 검사(sanitizeUsage) ─────────────────────────────────────
  await section("2 다시 검사", async () => {
    const good = usagePayload();
    same(model.sanitizeUsage(clone(good)), good, "계약 모양 그대로의 값은 그대로 남는다");
    const sample = JSON.parse(readFileSync(new URL("./usage-summary-sample-v22982.json", import.meta.url), "utf8"));
    same(model.sanitizeUsage(clone(sample)), sample, "앱 쪽 견본(validation/usage-summary-sample-v22982.json)을 관제도 그대로 받는다");
    const extra = clone(good);
    extra.secret = "x"; extra.current.user_ids = ["u1"]; extra.current.records_by_source.vip = 3; extra.daily[0].names = ["a"]; extra.current.kakao_by_intent[0].text = "점심 12000원"; extra.totals.emails = ["a@b.c"]; extra.previous_full.household_names = ["우리집"];
    const cleaned = model.sanitizeUsage(extra);
    same(cleaned, good, "계약 밖의 칸(맨 위·기간·기록 경로·날마다 줄·기능 항목·누적)은 모두 버린다");
    ok(!/secret|user_ids|vip|names|text|emails|household_names|점심/.test(JSON.stringify(cleaned)), "버린 칸의 이름·값이 저장할 문자열에 남지 않는다");
    const broken = [
      ["판 2", (u) => { u.schema = 2; }], ["판 없음", (u) => { delete u.schema; }], ["달 2026-13", (u) => { u.month = "2026-13"; }], ["달이 숫자", (u) => { u.month = 202610; }],
      ["through_day 0", (u) => { u.through_day = 0; }], ["through_day 32", (u) => { u.through_day = 32; }], ["through_day 1.5", (u) => { u.through_day = 1.5; }], ["heavy_threshold 0", (u) => { u.heavy_threshold = 0; }],
      ["generated_at 글자", (u) => { u.generated_at = "어제"; }], ["current 없음", (u) => { delete u.current; }], ["previous_same 배열", (u) => { u.previous_same = []; }], ["totals 없음", (u) => { delete u.totals; }],
      ["daily 배열 아님", (u) => { u.daily = {}; }], ["기록 수 음수", (u) => { u.previous_full.records = -1; }], ["기록 이용자 NaN", (u) => { u.current.recorders = NaN; }], ["기록 이용자 글자", (u) => { u.current.recorders = "4"; }],
      ["기록 이용자 소수", (u) => { u.current.recorders = 1.5; }], ["기록 이용자 null", (u) => { u.current.recorders = null; }], ["기록 경로 칸 빠짐", (u) => { delete u.current.records_by_source.other; }], ["카카오 요청 Infinity", (u) => { u.current.kakao_requests = Infinity; }],
      ["중앙값 음수", (u) => { u.current.median_records_per_recorder = -1; }], ["중앙값 글자", (u) => { u.current.median_records_per_recorder = "1.5"; }], ["누적 사용자 null", (u) => { u.totals.users = null; }], ["시작일이 끝날보다 늦음", (u) => { u.current.from = "2026-10-28"; }],
      ["날짜가 배열", (u) => { u.current.from = ["2026-10-01"]; }], ["날짜 형식", (u) => { u.current.to = "2026/10/27"; }],
    ];
    for (const [label, change] of broken) { const value = clone(good); change(value); ok(rejects(value), `핵심 모양이 틀리면 통째로 버린다(invalid_reply): ${label}`); }
    ok(rejects(null) && rejects([]) && rejects("usage") && rejects(undefined), "이용 현황이 객체가 아니면 버린다");
    const items = clone(good);
    items.daily.splice(3, 0, { day: "2026-09-02", recorders: 1, records: 1, kakao_requests: 1, new_users: 0 });
    items.daily[10].records = -1; items.daily[11].day = "2026-09-32"; items.daily[12].recorders = "2"; items.daily[13] = null;
    const days = model.sanitizeUsage(items).daily.map((row) => row.day);
    ok(days.length === good.daily.length - 4 && !days.includes(good.daily[10].day) && !days.includes("2026-09-32") && !days.includes(good.daily[12].day) && days.every((day, i) => i === 0 || day > days[i - 1]), "날마다 줄은 틀린 줄(음수·없는 날짜·글자·null)과 순서를 거스르거나 겹친 줄만 버리고 날짜 오름차순을 지킨다");
    const long = clone(good);
    long.daily = Array.from({ length: 70 }, (_, i) => ({ day: iso(Date.parse("2026-08-19T00:00:00Z") + i * DAY).slice(0, 10), recorders: 1, records: 1, kakao_requests: 0, new_users: 0 }));
    const capped = model.sanitizeUsage(long).daily;
    ok(capped.length === 62 && capped[0].day === long.daily[8].day && capped.at(-1).day === long.daily[69].day, `날마다 줄은 가장 늦은 62줄만 남긴다: ${capped.length}줄 ${capped[0]?.day}~${capped.at(-1)?.day}`);
    const intents = clone(good);
    intents.current.kakao_by_intent = [{ intent: "TRANSACTION", requests: 50 }, { intent: "transaction", requests: 40 }, { intent: "A".repeat(41), requests: 39 }, { intent: "HELP", requests: -1 }, { intent: "TRANSACTION", requests: 30 }, { intent: "MENU-1", requests: 3 }, { intent: 7, requests: 3 }, null,
      ...["SUMMARY", "EDIT", "HELP", "MENU", "START", "CANCEL", "EMPTY", "UNKNOWN", "WEB_LINK", "SETTLEMENT", "GROUP_LINK", "INVITE_MEMBER", "DATA_POLICY"].map((intent, i) => ({ intent, requests: 20 - i }))];
    const kept = model.sanitizeUsage(intents).current.kakao_by_intent;
    ok(kept.length === 12 && kept[0].intent === "TRANSACTION" && kept[0].requests === 50 && kept.filter((item) => item.intent === "TRANSACTION").length === 1 && kept.every((item) => /^[A-Z_]{1,40}$/.test(item.intent) && Number.isSafeInteger(item.requests) && item.requests >= 0)
      && kept.find((item) => item.intent === "HELP")?.requests === 18 && kept.at(-1).intent === "GROUP_LINK" && !kept.some((item) => ["INVITE_MEMBER", "DATA_POLICY"].includes(item.intent)),
      `기능 순위는 틀린 이름(소문자·41자·기호·숫자)·음수·겹친 이름을 버리고(버린 HELP -1 뒤의 올바른 HELP 는 남김) 앞에서 12개만 남긴다: ${kept.map((item) => item.intent).join(",")}`);
    const notArray = clone(good); notArray.current.kakao_by_intent = { TRANSACTION: 3 };
    same(model.sanitizeUsage(notArray).current.kakao_by_intent, [], "기능 순위가 배열이 아니면 빈 목록이다(핵심 모양은 아님)");
    const median = clone(good); median.current.median_records_per_recorder = 1.25; median.previous_same.median_records_per_recorder = 2.04;
    const rounded = model.sanitizeUsage(median);
    ok(rounded.current.median_records_per_recorder === 1.3 && rounded.previous_same.median_records_per_recorder === 2, "중앙값은 소수 첫째 자리로 반올림한다");
    eq(model.sanitizeUsage({ ...clone(good), generated_at: "2026-10-27T03:00:00Z" }).generated_at, "2026-10-27T03:00:00.000Z", "DB 기준 시각은 UTC ISO 로 맞춘다");
  });

  // ── 3. 수집: 55분 간격·저장·덮어쓰기·달 바뀜 ──────────────────────────────────
  await section("3 수집 간격과 저장", async () => {
    const fx = monitorDb();
    let recorders = 4, month = "2026-10";
    const fake = fakeApp(() => json({ ok: true, usage: month === "2026-10" ? usagePayload({ current: { recorders: recorders++ } }) : usagePayload({ month: "2026-11", through: 1, generated: "2026-10-31T15:05:00.000Z", full: { recorders: 9 } }) }));
    const env = { MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN, ACCOUNTBOOK: fake.binding };
    await cron(env, T);
    eq(fake.calls.usage.length, 1, "첫 예약 실행에서 이용 현황을 한 번 묻는다(아직 시도 기록 없음)");
    const call = fake.calls.usage[0];
    ok(call.url === "https://accountbook.internal/internal/ops-usage" && call.method === "GET" && call.authorization === `Bearer ${TOKEN}` && call.signal instanceof AbortSignal, `계약의 주소·GET·Bearer 토큰·시한 신호로 묻는다: ${call.method} ${call.url}`);
    const first = usageRows(fx.sqlite);
    ok(first.length === 1 && first[0].bucket === "2026-10" && first[0].collected_at === iso(T), "samples 에 source 'usage'·bucket = 한국 시간 달(2026-10) 한 행을 적는다");
    same(JSON.parse(first[0].payload), model.sanitizeUsage(usagePayload({ current: { recorders: 4 } })), "저장한 값은 다시 검사한 계약 모양 그대로다");
    same(usageState(fx.sqlite), { status: "ok", error_code: null, last_attempt_at: iso(T), last_success_at: iso(T), month: "2026-10" }, "수집 상태는 settings 'usage' 한 행이다(상태·코드·마지막 시도·마지막 성공·달)");
    const names = fx.sqlite.prepare("SELECT name FROM collector_state ORDER BY name").all().map((row) => row.name);
    ok(!names.includes("usage") && names.every((name) => COLLECTORS.includes(name)), `collector_state 에 이용 현황 행이 없다(1.3.0·1.2.1 로 되돌려도 '확인 불가'로 남지 않는다): ${names.join(",")}`);
    const attempts = [0];
    for (let i = 1; i < 36; i += 1) { const before = fake.calls.usage.length; await cron(env, T + i * 5 * MIN); if (fake.calls.usage.length > before) attempts.push(i * 5); }
    same(attempts, [0, 55, 110, 165], "3시간 동안 5분 예약 36번 가운데 직전 시도 뒤 55분이 지난 실행(0·55·110·165분)에서만 묻는다");
    eq(fake.calls.metrics, 36, "DB 수집 요청은 그대로 예약마다 한 번이다(이용 현황이 DB 수집을 막거나 늘리지 않는다)");
    const rows = usageRows(fx.sqlite);
    ok(rows.length === 1 && rows[0].collected_at === iso(T + 165 * MIN) && JSON.parse(rows[0].payload).current.recorders === 7, "같은 달은 한 행을 덮어쓴다(마지막 값·마지막 시각)");
    eq((await collectUsage(env, new Date(T + 166 * MIN))).skipped, true, "직전 시도 뒤 55분 안에는 바로 불러도 묻지 않는다");
    month = "2026-11";
    const mark = fx.log.length;
    await cron(env, Date.parse("2026-10-31T15:05:00.000Z"));
    const months = usageRows(fx.sqlite);
    ok(months.length === 2 && months[0].bucket === "2026-10" && months[0].collected_at === iso(T + 165 * MIN) && JSON.parse(months[0].payload).current.recorders === 7 && months[1].bucket === "2026-11", "한국 시간 달이 바뀌면 새 달 행을 적고 지난달 행은 그 달 마지막 값을 지닌다");
    eq(usageState(fx.sqlite).month, "2026-11", "수집 상태의 달도 새 달이다");
    const run = fx.log.slice(mark);
    const read = run.indexOf("SELECT value FROM settings WHERE key='usage'");
    const lastCollector = run.reduce((last, sql, index) => (/collector_state|'roundtrip'/.test(sql) ? index : last), -1);
    ok(read > 0 && lastCollector >= 0 && lastCollector < read && run.slice(read).every((sql) => sql.includes("'usage'")) && run.slice(read).length === 3,
      `예약 실행에서 이용 현황은 다른 수집기·왕복 확인·알림 발송 기록이 모두 끝난 뒤 마지막에 돌고 문장 3개(읽기·달 행·상태)만 더한다: 읽기 ${read}번째 · 마지막 수집 기록 ${lastCollector}번째 · 뒤 ${run.slice(read).length}개`);
    same(fake.calls.other, [], "관제가 앱에 계약 밖 경로를 묻지 않는다");
  });

  // ── 4. 오류 분류 ─────────────────────────────────────────────────────────────
  await section("4 오류 분류", async () => {
    const cases = [
      ["404(V22.9.81 이하 앱의 실제 답)", () => json({ ok: false, error: "not_found", reason: "not_found", message: "요청한 내용을 찾지 못했습니다." }, 404), "error", "app_not_ready"],
      ["401", () => json({ ok: false, error_code: "unauthorized" }, 401), "error", "unauthorized"],
      ["503 rpc_missing", () => json({ ok: false, error_code: "rpc_missing" }, 503), "error", "rpc_missing"],
      ["503 not_connected", () => json({ ok: false, error_code: "not_connected" }, 503), "not_connected", "not_connected"],
      ["503 usage_unavailable", () => json({ ok: false, error_code: "usage_unavailable" }, 503), "error", "usage_unavailable"],
      ["503 invalid_reply", () => json({ ok: false, error_code: "invalid_reply" }, 503), "error", "invalid_reply"],
      ["503 형식이 틀린 코드", () => json({ ok: false, error_code: "Bad Code!" }, 503), "error", "http_503"],
      ["503 41자 코드", () => json({ ok: false, error_code: "a".repeat(41) }, 503), "error", "http_503"],
      ["503 JSON 아님", () => new Response("Service Unavailable", { status: 503 }), "error", "http_503"],
      ["500 과 코드(503 만 코드를 그대로 씀)", () => json({ ok: false, error_code: "rpc_missing" }, 500), "error", "http_500"],
      ["200 JSON 아님", () => new Response("<html>", { status: 200 }), "error", "invalid_reply"],
      ["200 usage 없음", () => json({ ok: true }), "error", "invalid_reply"],
      ["200 핵심 모양 틀림", () => json({ ok: true, usage: { ...usagePayload(), schema: 2 } }), "error", "invalid_reply"],
      ["200 ok:false 와 코드", () => json({ ok: false, error_code: "rpc_missing" }), "error", "rpc_missing"],
      ["200 32KB 넘음", () => new Response(JSON.stringify({ ok: true, usage: usagePayload(), pad: "x".repeat(40000) })), "error", "payload_too_large"],
      ["시한(TimeoutError)", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, "error", "timeout"],
      ["연결 끊김(TypeError)", () => { throw new TypeError("fetch failed"); }, "error", "collection_failed"],
    ];
    for (const [label, answer, status, code] of cases) {
      const fx = monitorDb();
      const fake = fakeApp(answer);
      const result = await collectUsage({ MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN, ACCOUNTBOOK: fake.binding }, new Date(T));
      const state = usageState(fx.sqlite);
      ok(fake.calls.usage.length === 1 && state?.status === status && state?.error_code === code && result.error_code === code && state.last_attempt_at === iso(T) && state.last_success_at === null && usageRows(fx.sqlite).length === 0,
        `${label}: 상태 ${status}·코드 ${code} 로 적고 달 행은 쓰지 않는다 (받음 ${JSON.stringify(state)})`);
    }
    for (const [label, env] of [["ACCOUNTBOOK 없음", { OPS_MONITOR_TOKEN: TOKEN }], ["OPS_MONITOR_TOKEN 없음", { ACCOUNTBOOK: fakeApp(() => json({ ok: true, usage: usagePayload() })).binding }]]) {
      const fx = monitorDb();
      await collectUsage({ MONITOR_DB: fx.db, ...env }, new Date(T));
      ok(usageState(fx.sqlite)?.status === "not_connected" && usageState(fx.sqlite)?.error_code === "not_connected", `${label}: 앱을 부르지 않고 미연결(not_connected)로 적는다`);
    }
    ok(logged.includes("monitor collector usage failed: rpc_missing") && logged.includes("monitor collector usage failed: app_not_ready"), "실패는 Workers Logs 에 코드로 남는다");
    const fx = monitorDb();
    let mode = "ok";
    const fake = fakeApp(() => mode === "ok" ? json({ ok: true, usage: usagePayload() }) : json({ ok: false, error_code: "usage_unavailable" }, 503));
    const env = { MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN, ACCOUNTBOOK: fake.binding };
    await collectUsage(env, new Date(T));
    const kept = usageRows(fx.sqlite);
    mode = "fail";
    await collectUsage(env, new Date(T + 55 * MIN));
    same(usageState(fx.sqlite), { status: "error", error_code: "usage_unavailable", last_attempt_at: iso(T + 55 * MIN), last_success_at: iso(T), month: "2026-10" }, "성공 뒤 실패하면 상태·코드·시도 시각만 바뀌고 마지막 성공 시각·달은 남는다");
    same(usageRows(fx.sqlite), kept, "실패는 마지막으로 받은 달 행을 건드리지 않는다");
    eq((await collectUsage(env, new Date(T + 109 * MIN))).skipped, true, "실패한 시도 뒤에도 55분을 기다린다(곧바로 다시 묻지 않는다)");
    mode = "ok";
    await collectUsage(env, new Date(T + 110 * MIN));
    ok(usageState(fx.sqlite).status === "ok" && usageState(fx.sqlite).error_code === null && usageState(fx.sqlite).last_success_at === iso(T + 110 * MIN), "다음 시도가 성공하면 정상으로 돌아온다");
  });

  // ── 5. 경고·전체 상태와 무관 ───────────────────────────────────────────────────
  await section("5 경고·전체 상태와 무관", async () => {
    const now = Date.parse("2026-10-27T03:22:00.000Z");
    const okRecord = { status: "ok", checked_at: iso(now - 2 * MIN), error_code: null, last_ok_at: iso(now - 2 * MIN), failures: 0 };
    const failing = { status: "failing", checked_at: iso(now - 2 * MIN), error_code: "not_connected", last_ok_at: iso(now - DAY), failures: 3 };
    const tried = iso(now - 3 * MIN);
    const usageCases = [
      ["수집 전", null, null, "never", null],
      ["앱 배포 전", { status: "error", error_code: "app_not_ready", last_attempt_at: tried, last_success_at: null, month: null }, null, "error", "app_not_ready"],
      ["DB 함수 적용 전", { status: "error", error_code: "rpc_missing", last_attempt_at: tried, last_success_at: null, month: null }, null, "error", "rpc_missing"],
      ["시한 실패 + 지난 자료", { status: "error", error_code: "timeout", last_attempt_at: tried, last_success_at: iso(now - 5 * HOUR), month: "2026-10" }, now - 5 * HOUR, "error", "timeout"],
      ["미연결", { status: "not_connected", error_code: "not_connected", last_attempt_at: tried, last_success_at: null, month: null }, null, "not_connected", "not_connected"],
      ["정상", { status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" }, now - 12 * MIN, "ok", null],
      ["갱신 지연", { status: "ok", error_code: null, last_attempt_at: iso(now - 5 * HOUR), last_success_at: iso(now - 5 * HOUR), month: "2026-10" }, now - 5 * HOUR, "stale", null],
    ];
    for (const [base, record, samples, expected] of [["정상", okRecord, 60, "normal"], ["주의(왕복 확인 실패 3번)", failing, 0, "warning"]]) {
      const plain = monitorDb();
      seedHealthy(plain.sqlite, now, { samples });
      putRoundtrip(plain.sqlite, record);
      const reference = await summary(healthyEnv(plain.db, now), now);
      eq(reference.status, expected, `${base}: 이용 현황 기록이 없는 기준 상태는 ${expected} 이다`);
      for (const [label, state, dataAt, status, code] of usageCases) {
        const fx = monitorDb();
        seedHealthy(fx.sqlite, now, { samples });
        putRoundtrip(fx.sqlite, record);
        if (state) putUsage(fx.sqlite, state);
        if (dataAt !== null) putUsageRow(fx.sqlite, "2026-10", iso(dataAt), usagePayload());
        const env = healthyEnv(fx.db, now);
        const full = await summary(env, now), alerting = await summary(env, now, { alerting: true });
        ok(verdict(full) === verdict(reference) && verdict(alerting) === verdict(reference), `${base} + 이용 현황 ${label}: 전체 상태·경고·확인되지 않은 항목·참고·용량 카드 상태·수집 상태 표가 이용 현황이 없을 때와 같다`);
        ok(full.usage?.status === status && full.usage?.error_code === code && alerting.usage === null && !("usage" in full.states), `${base} + 이용 현황 ${label}: 이용 현황 상태(${status}${code ? `·${code}` : ""})는 usage 칸에만 있고 알림 판정 범위는 읽지 않는다`);
      }
    }
    // 알림 발송: 이용 현황이 실패해도 메일 내용·건수가 같다.
    const mailOf = async (withUsage, record) => {
      const fx = monitorDb();
      seedHealthy(fx.sqlite, now, { samples: record === okRecord ? 60 : 0 });
      putRoundtrip(fx.sqlite, record);
      if (withUsage) { putUsage(fx.sqlite, { status: "error", error_code: "rpc_missing", last_attempt_at: tried, last_success_at: null, month: null }); putUsageRow(fx.sqlite, "2026-10", iso(now - 6 * HOUR), usagePayload()); }
      const mails = [];
      const env = { ...healthyEnv(fx.db, now), APP_ORIGIN: "https://app.example", ALERT_EMAIL: { async send(message) { mails.push(message); } }, ALERT_TO: "ops@example.com", ALERT_FROM: "monitor@app.example" };
      const result = await deliverAlerts(env, new Date(now));
      return { result, bodies: mails.map(bodyOf), alertRows: fx.sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().length };
    };
    const quiet = await mailOf(true, okRecord);
    ok(quiet.result.sent === 0 && quiet.bodies.length === 0 && quiet.alertRows === 0, "정상 저장소에서 이용 현황이 실패해도(rpc_missing) 알림을 보내지도 기억하지도 않는다");
    const [withUsage, without] = [await mailOf(true, failing), await mailOf(false, failing)];
    ok(withUsage.bodies.length === 1 && withUsage.bodies[0] === without.bodies[0] && !/이용 현황|usage|rpc_missing/.test(withUsage.bodies[0]), "다른 경고 메일의 내용은 이용 현황 상태와 상관없이 같고 이용 현황을 말하지 않는다");
  });

  // ── 6. 보관: 이용 현황 달 행은 24개월 ────────────────────────────────────────────
  await section("6 보관", async () => {
    const fx = monitorDb();
    const midnight = Date.parse("2026-10-27T00:00:00.000Z");
    const insert = fx.sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,?)");
    const months = [];
    for (let month = "2024-01"; month <= "2026-10"; month = model.monthShift(month, 1)) { months.push(month); insert.run("usage", month, `${month}-28T00:00:00.000Z`, JSON.stringify({ month })); }
    insert.run("database", iso(midnight - 31 * DAY), iso(midnight - 31 * DAY), "{}");
    insert.run("database", iso(midnight - 29 * DAY), iso(midnight - 29 * DAY), "{}");
    const env = { MONITOR_DB: fx.db };
    await collect(env, new Date(midnight + 5 * MIN));
    eq(fx.sqlite.prepare("SELECT COUNT(*) AS n FROM samples").get().n, months.length + 2, "UTC 0시 0~4분 밖에서는 정리하지 않는다");
    fx.log.length = 0;
    await collect(env, new Date(midnight));
    const kept = fx.sqlite.prepare("SELECT bucket FROM samples WHERE source='usage' ORDER BY bucket").all().map((row) => row.bucket);
    same(kept, months.filter((month) => month >= "2024-10"), "이용 현황 달 행은 이번 달(2026-10) 앞 24개월(2024-10)까지 남고 그보다 오래된 행만 지운다(30일 정리에서 빠진다)");
    ok(kept.length >= 13, `12개월 추이에 필요한 13달 이상을 남긴다: ${kept.length}달`);
    same(fx.sqlite.prepare("SELECT bucket FROM samples WHERE source='database'").all().map((row) => row.bucket), [iso(midnight - 29 * DAY)], "다른 집계는 예전처럼 30일 넘은 행만 지운다");
    eq(fx.log.filter((sql) => sql.startsWith("DELETE FROM samples")).length, 1, "samples 정리는 예전처럼 문장 하나다(D1 문장 수가 늘지 않는다)");
  });

  // ── 7. /api/summary 의 usage ───────────────────────────────────────────────
  await section("7 /api/summary 의 usage", async () => {
    const now = Date.parse("2026-10-27T03:22:00.000Z");
    const fx = monitorDb();
    putUsageRow(fx.sqlite, "2026-05", "2026-05-31T14:55:00.000Z", usagePayload({ month: "2026-05", through: 31, generated: "2026-05-31T14:50:00.000Z", current: { recorders: 6, records: 20 }, full: { recorders: 2, records: 3 } }));
    putUsageRow(fx.sqlite, "2026-09", "2026-09-30T14:55:00.000Z", usagePayload({ month: "2026-09", through: 30, generated: "2026-09-30T14:50:00.000Z", current: { recorders: 3, records: 8 }, full: { recorders: 4, records: 10 } }));
    putUsageRow(fx.sqlite, "2026-10", iso(now - 12 * MIN), usagePayload({ full: { recorders: 5, records: 12 } }));
    putUsage(fx.sqlite, { status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" });
    Date.now = () => now;
    let body;
    try {
      const response = await monitor.fetch(new Request("https://monitor.example/api/summary", { headers: { authorization: `Bearer ${TOKEN}` } }), { MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN }, {});
      eq(response.status, 200, "/api/summary 가 답한다");
      body = await response.json();
    } finally { Date.now = originalNow; }
    const usage = body.usage;
    ok(usage && usage.status === "ok" && usage.error_code === null && usage.age_minutes === 12 && usage.data_is_current === true && usage.current_month === "2026-10" && usage.collected_at === iso(now - 12 * MIN), `/api/summary 의 usage 에 상태·마지막 수집 12분 전·이번 달 자료 여부가 있다: ${JSON.stringify(usage && { status: usage.status, age: usage.age_minutes })}`);
    same(usage.data, model.sanitizeUsage(usagePayload({ full: { recorders: 5, records: 12 } })), "usage.data 는 마지막으로 받은 달의 계약 모양 그대로다");
    same(usage.derived.current, { records_per_recorder: 2.25, retention_rate: 2 / 3, kakao_per_recorder: 7.5, shared_ratio: 1 / 3, heavy_ratio: 0.25 }, "이번 달 나눗셈 값(인당 기록·재사용률·카카오 1명당·함께 쓰는 비율·많이 쓰는 사람 비율)");
    same(usage.change, { recorders: 1, records: 1.25, heavy_recorders: null, kakao_requests: 1, new_users: 1, new_households: 0, records_per_recorder: 0.125 }, "지난달 같은 기간 대비 변화율(지난달 0 이면 null)");
    same(usage.intents, [{ intent: "TRANSACTION", label: "기록", requests: 20, share: 20 / 30 }, { intent: "SUMMARY", label: "요약", requests: 6, share: 0.2 }, { intent: "NEW_FEATURE", label: "NEW_FEATURE", requests: 4, share: 4 / 30 }], "기능 순위에 한국어 이름·요청 수·비율이 붙고 모르는 이름은 그대로다");
    same(usage.trend.map((point) => [point.month, point.recorders, point.complete, point.partial, point.through_day]), [
      ["2026-04", 2, true, false, null], ["2026-05", 6, false, false, 31], ["2026-06", null, false, false, null], ["2026-07", null, false, false, null],
      ["2026-08", 4, true, false, null], ["2026-09", 5, true, false, null], ["2026-10", 4, false, true, 27],
    ], "12개월 추이: 끝난 달은 다음 달 행의 지난달 전체 값(9월 3명 → 5명), 다음 달 행이 없으면 그 달 마지막 값(5월 1~31일), 빠진 달은 빈칸, 이번 달은 진행 중");
    ok(!/user_id|household_id|"name"|memo|amount/.test(JSON.stringify(usage)), "usage 에 사람·가계부·거래 칸이 없다");
    const many = monitorDb();
    for (let month = "2025-08"; month <= "2026-10"; month = model.monthShift(month, 1)) putUsageRow(many.sqlite, month, `${month}-20T00:00:00.000Z`, usagePayload({ month, through: 20, generated: `${month}-20T00:00:00.000Z` }));
    const capped = (await summary({ MONITOR_DB: many.db }, now)).usage.trend;
    ok(capped.length === 12 && capped[0].month === "2025-11" && capped.at(-1).month === "2026-10", `12개월 추이는 가장 늦은 달까지 12칸이다: ${capped.map((point) => point.month).join(",")}`);
    const corrupt = monitorDb();
    putUsageRow(corrupt.sqlite, "2026-10", iso(now - 12 * MIN), "{not json");
    putUsage(corrupt.sqlite, { status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" });
    const broken = (await summary({ MONITOR_DB: corrupt.db }, now)).usage;
    ok(broken.data === null && broken.derived === null && broken.intents.length === 0 && broken.trend.length === 0, "저장된 달 행이 깨진 JSON 이어도 요약은 답하고 이용 현황은 자료 없이 상태만 보인다(json_extract 가 문장을 실패시키지 않는다)");
    putUsageRow(corrupt.sqlite, "2026-09", "2026-09-30T14:55:00.000Z", usagePayload({ month: "2026-09", through: 30, generated: "2026-09-30T14:50:00.000Z" }));
    const older = (await summary({ MONITOR_DB: corrupt.db }, now)).usage;
    ok(older.data?.month === "2026-09" && older.data_is_current === false && older.trend.at(-1)?.month === "2026-09" && !older.trend.some((point) => point.month === "2026-10"), "깨진 이번 달 행은 건너뛰고 읽을 수 있는 가장 늦은 달(9월)을 ‘마지막으로 받은 달’로 보인다");
    // 이용 현황 읽기가 D1 에서 실패해도 요약 전체(전체 상태·경고 판정)는 그대로 답한다.
    const plain = monitorDb();
    seedHealthy(plain.sqlite, now, { samples: 60 });
    putRoundtrip(plain.sqlite, { status: "ok", checked_at: iso(now - 2 * MIN), error_code: null, last_ok_at: iso(now - 2 * MIN), failures: 0 });
    putUsage(plain.sqlite, { status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" });
    const reference = await summary(healthyEnv(plain.db, now), now);
    const flaky = { ...plain.db, prepare(sql) { if (sql.includes("FROM samples WHERE source='usage'")) throw new Error("D1_ERROR: too many requests"); return plain.db.prepare(sql); } };
    const before = logged.length;
    const survived = await summary(healthyEnv(flaky, now), now);
    ok(verdict(survived) === verdict(reference) && survived.usage?.data === null && ["ok", "stale"].includes(survived.usage?.status) && logged.slice(before).some((line) => line.startsWith("monitor usage summary failed: ")),
      `이용 현황 달 행 읽기가 실패해도 요약 전체는 답하고 판정이 같으며 실패는 로그에만 남는다: ${survived.status} · usage ${survived.usage?.status}`);
  });

  // ── 8. 화면 ─────────────────────────────────────────────────────────────────
  await section("8 화면", async () => {
    const now = Date.parse("2026-10-27T03:22:00.000Z");
    const okRecord = { status: "ok", checked_at: iso(now - 2 * MIN), error_code: null, last_ok_at: iso(now - 2 * MIN), failures: 0 };
    const build = async (state, rows = []) => {
      const fx = monitorDb();
      seedHealthy(fx.sqlite, now, { samples: 60 });
      putRoundtrip(fx.sqlite, okRecord);
      if (state) putUsage(fx.sqlite, state);
      for (const [month, at, payload] of rows) putUsageRow(fx.sqlite, month, at, payload);
      return summary(healthyEnv(fx.db, now), now);
    };
    const okResult = await build({ status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" }, [["2026-09", "2026-09-30T14:55:00.000Z", usagePayload({ month: "2026-09", through: 30 })], ["2026-10", iso(now - 12 * MIN), usagePayload()]]);
    const html = renderDashboard(okResult);
    const panel = panelOf(html);
    const text = textOf(panel);
    ok(panel.length > 0 && html.indexOf(PANEL_START) > html.indexOf("유료 전환 비용 참고") && html.indexOf(PANEL_START) < html.indexOf("<h2>수집 연결 상태</h2>"), "‘이용 현황’ 칸은 건강·용량 칸 다음, 수집 연결 상태 표 앞에 있다");
    ok(text.startsWith("이용 현황 수집됨") && text.includes("마지막 수집 12분 전"), `정상: ‘수집됨’과 ‘마지막 수집 12분 전’: ${text.slice(0, 60)}`);
    ok(TILES.every((title) => panel.includes(`<div class="tile"><h3>${title}</h3>`)), "칸 8개: 이번 달 기록 이용자·인당 월평균 기록 수·많이 쓰는 사람·재사용률·카카오 대화 수·신규 가입·새 가계부·함께 쓰는 가계부 비율·기록 경로");
    ok(text.includes("이번 달(2026년 10월) 1~27일 기준") && text.includes("지난달 같은 기간(9월 1일~9월 27일)과 비교"), "‘이번 달 1~27일 기준’과 비교 기간을 적는다");
    for (const part of ["이번 달 기록 이용자 4 명 지난달 같은 기간 2명 · ▲ 100%", "중앙값 2건", "직접 기록 9건", "많이 쓰는 사람 1 명 월 30건 이상 기록 · 기록 이용자의 25% · 지난달 같은 기간 0명", "재사용률 66.7% 지난달 기록한 3명 중 이번 달에도 기록한 사람 2명 · 지난달 같은 기간 50%", "카카오 대화 수 30 회 기록 이용자 1명당 대략 7.5회 · 지난달 같은 기간 15회 · ▲ 100%", "신규 가입·새 가계부 2 명 · 1개 지난달 같은 기간 1명 · 1개", "함께 쓰는 가계부 비율 33.3% 기록이 있는 가계부 3개 중 구성원 2명 이상 1개", "기록 경로 12 건 카카오 6 · 웹 3 · 가져오기 2 · 정기 자동 1 · 기타 0 · 카카오 비율 50%"]) ok(text.includes(part), `칸 내용: ${part}`);
    ok(text.includes("지난달 전체(9월 1일~9월 30일, 참고): 기록 이용자 5명 · 직접 기록 12건"), "지난달 전체를 참고로 보인다");
    ok(/<tr><td>1<\/td><td>기록 <small class="muted">TRANSACTION<\/small><\/td><td>20<\/td><td>66\.7%<\/td><\/tr>/.test(panel) && panel.includes("<td>요약 <small") && panel.includes("<td>NEW_FEATURE</td>"), "기능별 요청 순위 표에 한국어 이름·요청 수·비율이 있고 모르는 이름은 그대로다");
    eq(count(panel, '<th scope="col">'), 13, "표 셋(날마다 5칸·달마다 4칸·기능 순위 4칸)에 머리 칸이 있다");
    eq(count(panel, '<div class="tablewrap"><table>'), count(panel, "<table>"), "모든 표가 가로 스크롤 상자 안에 있다(390px 에서 쪽 전체가 옆으로 밀리지 않는다)");
    const labels = [...panel.matchAll(/<svg class="ubars" viewBox="0 0 600 120" role="img" aria-label="([^"]+)">/g)].map((match) => match[1]);
    ok(labels.length === 3 && labels[0].startsWith("이번 달 날마다 기록 이용자: 10월 1일 → 10월 27일") && labels[1].startsWith("이번 달 날마다 기록 수:") && labels[2].startsWith("최근 12개월 달마다 기록 이용자: 2026년 8월 → 2026년 10월"), `그래프 셋에 대체 글(aria-label)이 있다(12개월은 9월 행의 지난달 전체로 8월부터): ${labels.join(" | ").slice(0, 200)}`);
    ok(panel.includes("<summary>날마다 숫자 표</summary>") && panel.includes("<summary>달마다 숫자 표</summary>") && panel.includes("<td>진행 중 · 1~27일</td>") && panel.includes("<td>그 달 전체</td>"), "그래프마다 숫자 표가 있고 달마다 표에 기준(그 달 전체·진행 중)이 있다");
    ok(count(panel, '<g class="partial">') === 1, "12개월 그래프의 이번 달 막대는 진행 중(흐리게)이다");
    ok(text.includes("‘방문만 하고 기록하지 않은 사람’은 세지 못합니다") && text.includes("거래의 주인(user_id) 기준") && text.includes("카카오 대화 수는 사람별로 세지 않아 1명당 값은 대략입니다"), "계약의 한계(방문만 한 사람·거래 주인 기준·카카오 대략)를 각주로 적는다");
    const states = html.slice(html.indexOf("<h2>수집 연결 상태</h2>"), html.indexOf("<h2>최근 요청 표본</h2>"));
    ok(states.length > 0 && !/이용 현황|usage/.test(states), "수집 연결 상태 표에 이용 현황 줄이 없다");
    const hero = (value) => value.slice(value.indexOf('<section class="hero'), value.indexOf("</section>") + 10);
    const never = await build(null);
    const neverHtml = renderDashboard(never);
    eq(hero(html), hero(neverHtml), "맨 위 전체 상태 칸은 이용 현황 자료가 있든 없든 같다");
    const neverText = textOf(panelOf(neverHtml));
    ok(neverText.startsWith("이용 현황 수집 전 아직 수집 전") && !panelOf(neverHtml).includes('class="ugrid"') && neverText.includes("방문만 하고 기록하지 않은 사람"), `수집 전: ‘아직 수집 전’만 보이고 칸은 없다: ${neverText.slice(0, 60)}`);
    const tried = iso(now - 3 * MIN);
    const notReady = textOf(panelOf(renderDashboard(await build({ status: "error", error_code: "app_not_ready", last_attempt_at: tried, last_success_at: null, month: null }))));
    ok(notReady.includes("앱 V22.9.82 배포 전이라 아직 받을 수 없음") && notReady.includes("마지막 시도"), `app_not_ready: ‘앱 V22.9.82 배포 전이라 아직 받을 수 없음’: ${notReady.slice(0, 80)}`);
    const missing = textOf(panelOf(renderDashboard(await build({ status: "error", error_code: "rpc_missing", last_attempt_at: tried, last_success_at: null, month: null }))));
    ok(missing.includes("DB 집계 함수 적용 전(운영자 승인 필요)"), `rpc_missing: ‘DB 집계 함수 적용 전(운영자 승인 필요)’: ${missing.slice(0, 80)}`);
    const failingPanel = panelOf(renderDashboard(await build({ status: "error", error_code: "usage_unavailable", last_attempt_at: tried, last_success_at: iso(now - 3 * HOUR), month: "2026-10" }, [["2026-10", iso(now - 3 * HOUR), usagePayload()]])));
    const failingText = textOf(failingPanel);
    ok(failingText.includes("수집 실패: usage_unavailable") && failingText.includes("마지막 수집 3시간 전") && failingText.includes("자료를 그대로 보입니다") && failingText.includes("마지막 시도") && failingText.includes("이번 달 기록 이용자 4 명") && failingPanel.includes('<span class="badge warning">수집 실패</span>'),
      `그 밖의 실패: ‘수집 실패: 코드’와 함께 마지막으로 받은 자료와 그 시각을 그대로 보인다: ${failingText.slice(0, 120)}`);
    const offline = textOf(panelOf(renderDashboard(await build({ status: "not_connected", error_code: "not_connected", last_attempt_at: tried, last_success_at: null, month: null }))));
    ok(offline.includes("수집 실패: not_connected"), "미연결도 ‘수집 실패: not_connected’로 보인다");
    const stale = textOf(panelOf(renderDashboard(await build({ status: "ok", error_code: null, last_attempt_at: iso(now - 5 * HOUR), last_success_at: iso(now - 5 * HOUR), month: "2026-10" }, [["2026-10", iso(now - 5 * HOUR), usagePayload()]]))));
    ok(stale.startsWith("이용 현황 갱신 지연") && stale.includes("마지막 수집 5시간 전"), `성공 뒤 130분 넘게 새 성공이 없으면 ‘갱신 지연’: ${stale.slice(0, 80)}`);
    const zero = textOf(panelOf(renderDashboard(await build({ status: "ok", error_code: null, last_attempt_at: iso(now - 12 * MIN), last_success_at: iso(now - 12 * MIN), month: "2026-10" }, [["2026-10", iso(now - 12 * MIN), usagePayload({ current: { recorders: 0, records: 0, heavy_recorders: 0, retained_recorders: 0, prior_month_recorders: 0, active_households: 0, shared_active_households: 0, kakao_requests: 0, kakao_by_intent: [] } })]]))));
    ok(zero.includes("인당 월평균 기록 수 — 건") && zero.includes("재사용률 —") && zero.includes("대략 —회") && zero.includes("함께 쓰는 가계부 비율 —") && zero.includes("기록 이용자의 —") && zero.includes("이번 달 카카오 요청 기록이 없습니다"), `0 나눔은 ‘—’로 보인다: ${zero.slice(zero.indexOf("인당"), zero.indexOf("인당") + 60)}`);
    const hostile = clone(okResult);
    hostile.usage.intents[0].label = '<img src=x onerror=alert(1)>';
    hostile.usage.error_code = '"><script>alert(1)</script>';
    hostile.usage.status = "error";
    const hostilePanel = panelOf(renderDashboard(hostile));
    ok(!hostilePanel.includes("<img src=x") && !hostilePanel.includes("<script>") && hostilePanel.includes("&lt;img src=x"), "기능 이름·오류 코드는 화면에서 글자로만 보인다(이스케이프)");
    const css = dashboardHtml("").match(/<style>([\s\S]*?)<\/style>/)[1];
    const added = css.slice(css.indexOf(".ugrid{"), css.indexOf("@media(max-width:900px)"));
    ok(added.includes("minmax(min(100%,240px),1fr)") && added.includes(".ubars{display:block;width:100%;max-width:640px;height:auto") && !/(?:^|[;{])(?:min-)?width:\s*(?:[4-9]\d\d|\d{4,})px/.test(added), "새 칸의 CSS 는 390px 에서 한 줄로 접히고 고정 너비가 없다(그래프는 너비 100%)");
    ok(added.includes("var(--line)") && added.includes("var(--blue)") && added.includes("var(--muted)") && !/#[0-9a-fA-F]{3,6}\b/.test(added), "새 칸은 기존 색 토큰만 써서 어두운 화면에서도 같은 규칙으로 바뀐다(새 색 값 없음)");
    ok(added.includes("@media(max-width:560px){.upanel table{white-space:normal}.upanel td small{display:block}.upanel th,.upanel td{padding:8px 6px}}") && !/(?:^|[}])(?:table|th|td|th,td)\{/.test(added),
      "좁은 화면(560px 이하)에서는 이 칸의 표만 줄을 바꿔 390px 안에 들어간다(기능 순위의 비율 칸이 가려지지 않는다). 다른 표의 규칙은 바꾸지 않는다");
  });

  // ── 9. 실제 앱 번들(V22.9.82) ↔ 관제 1.4.0 ────────────────────────────────────
  await section("9 실제 앱 번들과 왕복", async () => {
    const { default: app } = await import("../src/index.js");
    const answer = usagePayload();
    let mode = "ok";
    const rpc = [];
    globalThis.fetch = async (input, init) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname === "fixture.supabase.co" && url.pathname === "/rest/v1/rpc/accountbook_usage_summary_v22982") {
        rpc.push(`${init?.method || (typeof input === "string" ? "GET" : input.method)} ${url.search}`);
        return mode === "missing" ? json({ code: "PGRST202", message: "Could not find the function public.accountbook_usage_summary_v22982 in the schema cache" }, 404) : json(answer);
      }
      network.push(url.href);
      throw new Error(`unexpected network ${url.href}`);
    };
    const appEnv = { OPS_MONITOR_TOKEN: TOKEN, SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-only" };
    const binding = (envForApp) => ({ async fetch(input, init) { return app.fetch(new Request(input, init), envForApp, { waitUntil() {} }); } });
    const run = async (envForApp) => { const fx = monitorDb(); await collectUsage({ MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN, ACCOUNTBOOK: binding(envForApp) }, new Date(T)); return fx; };
    const good = await run(appEnv);
    const stored = usageRows(good.sqlite);
    ok(usageState(good.sqlite)?.status === "ok" && stored.length === 1 && stored[0].bucket === "2026-10" && rpc.length === 1, `실제 앱이 DB 함수 답을 넘기고 관제가 정상으로 적는다: ${JSON.stringify(usageState(good.sqlite))} · ${rpc.join(",")}`);
    same(JSON.parse(stored[0]?.payload || "null"), model.sanitizeUsage(answer), "앱이 다시 검사해 보낸 값을 관제도 그대로 받아 적는다(두 쪽 검사가 같은 계약을 본다)");
    mode = "missing";
    eq(usageState((await run(appEnv)).sqlite)?.error_code, "rpc_missing", "DB 함수가 아직 없으면(PostgREST 404 PGRST202) 앱 503 rpc_missing 이 관제까지 그대로 온다");
    mode = "ok";
    eq(usageState((await run({ ...appEnv, OPS_MONITOR_TOKEN: "rotated-on-one-side" })).sqlite)?.error_code, "unauthorized", "두 Worker 의 OPS_MONITOR_TOKEN 이 다르면 unauthorized");
    const offline = usageState((await run({ OPS_MONITOR_TOKEN: TOKEN })).sqlite);
    ok(offline?.status === "not_connected" && offline?.error_code === "not_connected", "앱에 Supabase 설정이 없으면 앱 503 not_connected 가 관제의 미연결로 보인다");
  });

  // ── 10. 문서·등록 ───────────────────────────────────────────────────────────
  await section("10 문서·등록", async () => {
    eq(network.length, 0, `검사 중 바깥 네트워크를 쓰지 않았다: ${network.slice(0, 3).join(",")}`);
    const readme = readFileSync(new URL("../monitoring/README.md", import.meta.url), "utf8");
    ok(readme.includes("## 이용 현황 (1.4.0, V22.9.82)") && readme.includes("/internal/ops-usage") && readme.includes("`settings` 의 `usage`") && readme.includes("24개월") && readme.includes("D1 스키마는 바뀌지 않아 이전(migration)이 없습니다. 새 Secret·바인딩·설정도 없습니다") && readme.includes("validate-monitor-v22982"), "관제 README 에 1.4.0 이용 현황 절(경로·상태 저장·보관·이전 없음·검사기)이 있다");
    const harness = readFileSync(new URL("../.codex/scripts/verify-repository.mjs", import.meta.url), "utf8");
    const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
    ok(harness.includes('"validation/validate-monitor-v22982.mjs"') && pkg.scripts?.["validate:monitor-v22982"] === "node validation/validate-monitor-v22982.mjs", "검사기가 하네스와 package.json 에 등록돼 있다");
  });
} finally {
  globalThis.fetch = originalFetch;
  console.error = originalError;
  Date.now = originalNow;
}

if (SOFT) {
  console.log(`V22982_SOFT: 통과 ${total - failed.length} · 실패 ${failed.length} (검사 ${total}개)`);
  for (const message of failed) console.log(`  실패: ${message}`);
  if (failed.length) process.exitCode = 1;
} else {
  console.log(`${LABEL} (${total} checks)`);
}
