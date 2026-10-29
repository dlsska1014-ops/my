// V22.9.77 관제 경고 재발송·처리 중 결과·cron CPU 검사 (2026-10-14 감사 V44:G-3·G-5·G-6, 관제 1.2.0).
// G-3: 경고가 임계값 근처에서 깜빡이면 해소 때 기억 행을 지워 '같은 경고 6·24시간 안 재발송 안 함'이 깨졌다
//      (/ready 5분마다 실패·정상 → 1시간 메일 12통, DB CPU 86%·84% → 6통).
// G-5: '처리 중'으로 먼저 답한 뒤 뒤 작업에서 저장이 실패해도 관제에는 outcome=deferred(→unknown)·db_failures=0 표본만 남았다.
// G-6: 5분 cron 의 알림 판정이 summary() 전체로 7일치 표본 2,016행과 요청 표본 1,000행을 받아 해석·정렬했다(약 8.7ms, Free 한도 10ms).
// 관제 Worker 는 Node 22 의 SQLite(실제 SQL)로, 앱은 메모리 픽스처로 돌린다. 네트워크는 쓰지 않는다(Node 22 이상 필요, test-d1 과 같음).
import { DatabaseSync } from "node:sqlite";
import { readdirSync, readFileSync } from "node:fs";
import { performance } from "node:perf_hooks";
import { fileURLToPath } from "node:url";
import monitor, { collectToken, deliverAlerts, summary } from "../monitoring/worker.mjs";
import { MONITOR_VERSION, daysToLimit, sanitizeTelemetry } from "../monitoring/model.mjs";
import { app, BASE, counter, failure, fixture, intercept } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.77 관제 경고 재발송·처리 중 결과·cron CPU 검사 통과");
const MIN = 60000, HOUR = 3600000, DAY = 86400000;
const SCHEMA = readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8");

function monitorDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  const stats = { reads: 0, rows: 0 };
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async all() { const results = statement.all(...args); stats.reads += 1; stats.rows += results.length; return { results }; },
        async first() { const row = statement.get(...args) || null; stats.reads += 1; stats.rows += row ? 1 : 0; return row; },
        run() { const data = statement.run(...args); return { success: true, meta: { changes: data.changes } }; },
      };
      return api;
    },
    async batch(statements) { sqlite.exec("BEGIN"); try { const values = statements.map((s) => s.run()); sqlite.exec("COMMIT"); return values; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } },
  };
  return { sqlite, db, stats };
}

// 관제 수집기가 부르는 바깥 주소(Cloudflare GraphQL·토큰 확인·앱 /health·/ready)를 흉내 낸다.
const world = { uptimeFails: false, hourErrors: 0 };
const asJson = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
// V22.9.77 N-14: Workers(workerd) 의 fetch 는 redirect 로 follow·manual 만 받는다. Node 의 fetch 는 "error" 도 받아서
// 흉내 낸 주소만으로는 운영에서 늘 실패하던 토큰 확인(redirect:"error")이 통과했다. 바깥 주소 흉내가 workerd 처럼 거절한다.
function workerdRedirectGuard(init) {
  if (init?.redirect !== undefined && !["follow", "manual"].includes(String(init.redirect).toLowerCase())) {
    throw new TypeError("Invalid redirect value, must be one of \"follow\" or \"manual\" (\"error\" won't be implemented since it does not make sense at the edge; use \"manual\" and check the response status code).");
  }
}
async function monitorFetch(input, init) {
  workerdRedirectGuard(init);
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "api.cloudflare.com") {
    if (url.pathname === "/client/v4/user/tokens/verify") return asJson({ success: true, result: { id: "t", status: "active", expires_on: null } });
    if (String(init?.body).includes("d1AnalyticsAdaptiveGroups")) return asJson({ data: { viewer: { accounts: [{ usage: [{ sum: { rowsRead: 450000, rowsWritten: 4000 } }], storage: [{ dimensions: { databaseId: "fixture" }, max: { databaseSizeBytes: 1048576 } }] }] } } });
    const group = (requests, errors) => [{ sum: { requests, errors, subrequests: 1, cpuTimeUs: 100 }, dimensions: { status: "success" } }];
    return asJson({ data: { viewer: { accounts: [{ today: group(20000, 0), hour: group(100, world.hourErrors), app: group(19000, 0) }] } } });
  }
  if (url.hostname === "app.example") return asJson(url.pathname === "/ready" ? { ready: !world.uptimeFails, version: "fixture" } : { alive: true, version: "fixture" }, url.pathname === "/ready" && world.uptimeFails ? 503 : 200);
  throw new Error(`unexpected network ${url.href}`);
}

function monitorEnv(db, mails, { cpu = () => 80, connections = 5, databaseBytes = () => 30 * 1024 ** 2, verifiedAt } = {}) {
  let total = 1000, idle = 800;
  return {
    MONITOR_DB: db, OPS_MONITOR_TOKEN: "v22977-monitor-token", CF_ANALYTICS_TOKEN: "x", CF_ACCOUNT_ID: "acct", APP_WORKER_NAME: "kakao-accountbook",
    APP_ORIGIN: "https://app.example", SUPABASE_ORG_ID: "org", CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: verifiedAt,
    ALERT_EMAIL: { async send(message) { mails.push(message); } }, ALERT_TO: "ops@example.com", ALERT_FROM: "monitor@app.example",
    ACCOUNTBOOK: { async fetch() { total += 100; idle += 100 - cpu(); return asJson({ ok: true, metrics: { database_bytes: databaseBytes(), connections, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 6e8, cpu_counter: { total, idle } } }); } },
  };
}
async function cron(env, at) {
  const pending = [];
  await monitor.scheduled({ scheduledTime: at }, env, { waitUntil: (job) => pending.push(job) });
  await Promise.all(pending);
}
const decode = (b64) => Buffer.from(b64, "base64").toString("utf8");
const subjectOf = (message) => decode((/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(message.raw || "") || [, ""])[1]);
const bodyOf = (message) => { const raw = String(message.raw || ""); return decode(raw.slice(raw.indexOf("\r\n\r\n") + 4).replace(/\r\n/g, "")); };
const alertRecord = (sqlite, title) => sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().map((row) => JSON.parse(row.value)).find((value) => value.title === title) || null;
const telemetryPost = (env, event) => monitor.fetch(new Request("https://monitor.example/internal/telemetry", { method: "POST", headers: { authorization: `Bearer ${env.OPS_MONITOR_TOKEN}`, "content-type": "application/json" }, body: JSON.stringify(event) }), env, {});

const originalFetch = globalThis.fetch;
globalThis.fetch = monitorFetch;
try {
  // ── 0. 관제 판 ───────────────────────────────────────────────────────────────
  eq(MONITOR_VERSION, "1.4.0", "관제 판은 1.4.0 이다(1.3.0 → 1.4.0, V22.9.82 이용 현황)");
  eq((await (await monitor.fetch(new Request("https://monitor.example/health"), {}, {})).json()).version, "1.4.0", "/health 가 1.4.0 을 알린다");

  // ── 1. G-3 긴급 경고 깜빡임: /ready 가 5분마다 실패·정상 ────────────────────────
  {
    const UPTIME = "서비스 접속 또는 DB 준비 상태 실패";
    const { sqlite, db } = monitorDb();
    const mails = [];
    const t0 = Date.parse("2026-10-14T03:10:00.000Z");
    const env = monitorEnv(db, mails, { verifiedAt: new Date(t0 - DAY).toISOString() });
    const run = async (minute, fails) => { world.uptimeFails = fails; const before = mails.length; await cron(env, t0 + minute * MIN); return mails.slice(before); };
    for (let i = 0; i < 12; i += 1) await run(i * 5, i % 2 === 0);
    eq(mails.length, 1, "/ready 가 1시간 동안 5분마다 실패·정상을 오가도 긴급 메일은 1통이다(예전 12통)");
    ok(bodyOf(mails[0]).includes(`[긴급] ${UPTIME}`) && !mails.some((m) => subjectOf(m).includes("해소")), "깜빡이는 동안 '해소' 메일을 보내지 않는다");
    // 깜빡임의 마지막 수집(55분)이 정상 1번째다. 60분은 2번째, 65분이 3번째(10분)다.
    eq((await run(60, false)).length, 0, "정상 두 번까지는 해소로 보지 않는다");
    const recovery = await run(65, false);
    ok(recovery.length === 1 && bodyOf(recovery[0]).includes(`[해소] ${UPTIME}`), "세 번째 연속 정상(10분)에서 해소 메일을 한 번 보낸다");
    const kept = alertRecord(sqlite, UPTIME);
    ok(kept?.sent_at === new Date(t0).toISOString() && kept?.resolved_at === new Date(t0 + 65 * MIN).toISOString(), "해소된 경고도 기억 행과 마지막 발송 시각을 남긴다(예전에는 지웠다)");
    const again = await run(70, true);
    ok(again.length === 1 && bodyOf(again[0]).includes(`[긴급] ${UPTIME} · 해소 뒤 다시 생김`), "해소를 알린 뒤 다시 생기면 한 번 더 알린다(해소를 믿는 운영자에게 침묵하지 않는다)");
    let flapping = 0;
    for (let i = 0; i < 12; i += 1) flapping += (await run(75 + i * 5, i % 2 === 1)).length;
    for (const minute of [140, 145, 150]) flapping += (await run(minute, false)).length;
    eq(flapping, 0, "재발을 알린 뒤 6시간 안의 깜빡임과 다시 해소는 메일이 없다(해소 메일은 같은 경고에 6시간에 한 번)");
    const late = await run(65 + 6 * 60, false);
    ok(late.length === 1 && bodyOf(late[0]).includes(`[해소] ${UPTIME} · `) && bodyOf(late[0]).includes("부터 정상"), "미뤄 둔 해소는 6시간이 지나 아직 정상이면 해소 시각과 함께 보낸다");
    await run(70 + 12 * 60, false);
    eq(alertRecord(sqlite, UPTIME), null, "간격이 지난 해소 기록은 지운다");
  }

  // ── 2. G-3 주의 경고 깜빡임: DB CPU 86%·84% ───────────────────────────────────
  {
    const CPU = "DB CPU 사용률 상승";
    const { sqlite, db } = monitorDb();
    const mails = [];
    const t0 = Date.parse("2026-10-14T03:10:00.000Z");
    let busy = 86;
    world.uptimeFails = false;
    const env = monitorEnv(db, mails, { cpu: () => busy, verifiedAt: new Date(t0 - DAY).toISOString() });
    const cpuMails = (list) => list.filter((m) => bodyOf(m).includes(CPU)).length;
    for (let i = 0; i < 13; i += 1) { busy = i % 2 === 0 ? 86 : 84; await cron(env, t0 + i * 5 * MIN); }
    eq(cpuMails(mails), 1, "DB CPU 가 1시간 동안 86%·84% 를 오가도 주의 메일은 1통이다(예전 6통)");
    busy = 60;
    for (const minute of [65, 70, 75, 80]) await cron(env, t0 + minute * MIN);
    ok(alertRecord(sqlite, CPU)?.resolved_at === new Date(t0 + 75 * MIN).toISOString() && cpuMails(mails) === 1, "DB CPU 주의는 연속 정상 세 번에 해소되고(주의는 해소 메일 없음) 기록은 남는다");
    busy = 90;
    const before = mails.length;
    await cron(env, t0 + 3 * HOUR);
    eq(cpuMails(mails.slice(before)), 0, "주의 경고는 해소된 뒤에도 24시간 안에 다시 생기면 보내지 않는다(마지막 발송 시각 보존)");
    await cron(env, t0 + DAY + 10 * MIN);
    eq(cpuMails(mails.slice(before)), 1, "24시간이 지나 다시 생기면 다시 보낸다");
  }

  // ── 3. G-3 등급 깜빡임: Workers 오류율 2%(주의)·6%(긴급) ─────────────────────────
  {
    const { db } = monitorDb();
    const mails = [];
    const t0 = Date.parse("2026-10-14T03:10:00.000Z");
    const env = monitorEnv(db, mails, { verifiedAt: new Date(t0 - DAY).toISOString() });
    const levels = [];
    for (const [i, errors] of [2, 6, 2, 6, 2, 6].entries()) {
      world.hourErrors = errors;
      const before = mails.length;
      await cron(env, t0 + i * 5 * MIN);
      levels.push(mails.slice(before).map((m) => (/\[(긴급|주의)\] Workers 런타임 오류 증가/.exec(bodyOf(m)) || [, ""])[1]).join(""));
    }
    world.hourErrors = 0;
    eq(levels.join(","), "주의,긴급,,,,", "등급이 오를 때만 바로 보내고, 같은 경고의 등급 깜빡임은 메일이 없다(예전에는 바뀔 때마다 6통)");
  }

  // ── 4. G-6 5분 cron: 알림 판정은 7일치를 읽지 않는다 ─────────────────────────────
  const now = Date.parse("2026-10-14T03:12:00.000Z");
  const iso = (t) => new Date(t).toISOString();
  function seedWeek({ sqlite }, { bytes = (i) => 400 * 1024 ** 2 + i * 30000, telemetry = 1000, slowSkill = false, failures = 0 } = {}) {
    const insert = sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,?)");
    let total = 1e7, idle = 8e6, last = null;
    for (let i = 2016; i >= 1; i -= 1) {
      const t = now - i * 300000;
      total += 600; idle += 480;
      last = { database_bytes: bytes(2016 - i), connections: 12, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 4e8, cpu_counter: { total, idle } };
      insert.run("database", iso(Math.floor(t / 300000) * 300000), iso(t), JSON.stringify(last));
    }
    const state = sqlite.prepare("INSERT INTO collector_state(name,last_attempt_at,last_success_at,status,error_code,payload) VALUES(?,?,?,'ok',NULL,?)");
    state.run("database", iso(now), iso(now), JSON.stringify({ ...last, cpu_counter: { total: total + 600, idle: idle + 480 } }));
    state.run("uptime", iso(now), iso(now), JSON.stringify({ checks: [{ path: "/health", ok: true }, { path: "/ready", ok: true }], checked_at: iso(now), same_provider: true }));
    const counters = { requests: 0, errors: 0, subrequests: 1, cpu_ms: 1, cpu_limit_errors: 0, resource_limit_errors: 0, observed: true };
    state.run("cloudflare", iso(now), iso(now), JSON.stringify({ today: { ...counters, requests: 20000 }, hour: { ...counters, requests: 900 }, app: { ...counters, requests: 19000 }, period_start: "2026-10-14T00:00:00.000Z", period_end: iso(now - 300000) }));
    state.run("d1", iso(now), iso(now), JSON.stringify({ rows_read: 1, rows_written: 1, storage_bytes: 1, day: "2026-10-14" }));
    const tel = sqlite.prepare("INSERT INTO telemetry(id,at,route,method,status,duration_ms,db_count,db_ms,db_failures,outcome,sample_kind,slot) VALUES(?,?,?,?,?,?,?,?,?,?,?,?)");
    for (let i = 0; i < telemetry; i += 1) {
      const route = i % 3 ? "web" : "skill";
      const duration = slowSkill && route === "skill" ? 3000 + (i % 20) * 60 : 300 + (i % 50) * 10;
      tel.run(`v22977-${i}-sample`, now - 60000 - i * 80000, route, "POST", 200, duration, 4, 120, i < failures ? 1 : 0, "ok", i % 2 ? "random" : "incident", `slot-${i}`);
    }
  }
  {
    const fx = monitorDb();
    seedWeek(fx);
    const mails = [];
    const env = monitorEnv(fx.db, mails, { verifiedAt: iso(now - DAY), databaseBytes: () => 470 * 1024 ** 2 });
    const parse = JSON.parse, sort = Array.prototype.sort;
    let parses = 0, sorted = 0;
    fx.stats.rows = 0; fx.stats.reads = 0;
    JSON.parse = function countedParse(...args) { parses += 1; return parse.apply(this, args); };
    Array.prototype.sort = function countedSort(...args) { sorted += this.length; return sort.apply(this, args); };
    try { await cron(env, now + 3 * MIN); } finally { JSON.parse = parse; Array.prototype.sort = sort; }
    console.log(`측정: 5분 cron 한 번 D1 ${fx.stats.reads}회·${fx.stats.rows}행 받음, JSON.parse ${parses}번, 정렬한 값 ${sorted}개`);
    ok(fx.stats.rows <= 40, `5분 cron 한 번이 D1 에서 받는 행이 40행 이하다(7일치 2,016행+요청 1,000행이 아님): ${fx.stats.rows}행·${fx.stats.reads}회`);
    ok(parses <= 40, `5분 cron 한 번의 JSON.parse 가 40번 이하다(예전 2,000번 넘음): ${parses}번`);
    ok(sorted <= 10, `5분 cron 한 번이 정렬하는 값이 10개 이하다(예전 7일치 2,016개를 비교마다 Date.parse 로 정렬): ${sorted}개`);
    const state = JSON.parse(fx.sqlite.prepare("SELECT payload FROM collector_state WHERE name='alerts'").get().payload);
    ok(state.titles?.includes("DB 논리 용량"), "7일치를 읽지 않아도 성장 예측(7일 안 한도) 경고를 그대로 보낸다");
  }

  // ── 5. G-6 알림 판정 범위와 화면 범위의 결과가 같다 ───────────────────────────────
  const scopeView = (result) => JSON.stringify({ status: result.status, alerts: result.alerts, unknown: result.unknown, notes: result.notes, quotas: result.quotas.map((q) => [q.key, q.status, q.value, q.days_to_limit ?? null]), database: result.database,
    application: { ...result.application, recent: undefined, web_p95_ms: undefined }, plans: result.plans, token: result.token });
  for (const [label, seed, titles] of [
    ["7일 성장·느린 카카오·실패 표본", { slowSkill: true, failures: 3 }, ["DB 논리 용량", "카카오 응답 지연", "최근 처리 실패 기록"]],
    ["성장 없음·정상 표본", { bytes: () => 30 * 1024 ** 2 }, []],
    ["요청 표본 없음", { telemetry: 0 }, ["DB 논리 용량"]],
  ]) {
    const fx = monitorDb();
    seedWeek(fx, seed);
    const env = { MONITOR_DB: fx.db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) };
    const full = await summary(env, now), alerting = await summary(env, now, { alerting: true });
    eq(full.alerts.map((a) => a.title).sort().join(","), [...titles].sort().join(","), `${label}: 화면 범위 경고가 픽스처가 의도한 것이다`);
    eq(scopeView(alerting), scopeView(full), `${label}: 알림 판정 범위의 경고·상태·한도·지표가 화면 범위와 같다`);
  }
  {
    // 성장 예측 SQL(첫 점·끝 점·개수)이 화면용 daysToLimit 과 같은 값을 낸다(숫자가 아닌 값·빈 값 섞임 포함).
    const fx = monitorDb();
    const values = [];
    seedWeek(fx, { bytes: (i) => (i === 0 || i % 97 === 5 ? null : 380 * 1024 ** 2 + i * 41000), telemetry: 0 });
    for (const row of fx.sqlite.prepare("SELECT collected_at,payload FROM samples WHERE source='database'").all()) values.push({ at: row.collected_at, value: JSON.parse(row.payload).database_bytes });
    const full = await summary({ MONITOR_DB: fx.db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) }, now);
    const alerting = await summary({ MONITOR_DB: fx.db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) }, now, { alerting: true });
    const reference = daysToLimit(values, full.quotas.find((q) => q.key === "database_size").value, 500 * 1024 ** 2);
    ok(reference !== null && Math.abs(alerting.quotas.find((q) => q.key === "database_size").days_to_limit - reference) < 1e-9, `성장 예측 SQL 이 7일치 전체 계산과 같은 남은 일수를 낸다(${reference?.toFixed(2)}일)`);
    eq(full.database_history.length, 48, "화면은 그대로 7일치 그래프 점 48개를 받는다");
    eq(alerting.database_history.length, 0, "알림 판정은 그래프 점을 만들지 않는다");
  }

  // ── 6. G-6 CPU: 알림 판정 범위는 화면 범위보다 훨씬 싸다 ──────────────────────────
  {
    const fx = monitorDb();
    seedWeek(fx, { slowSkill: true });
    // 실제 D1 처럼 질의는 Worker 밖에서 돈다고 보고, 미리 받은 결과의 복사본을 돌려주는 D1 으로 Worker 쪽 처리만 잰다.
    const cache = new Map();
    const cached = {
      prepare(sql) {
        let args = [];
        const statement = fx.sqlite.prepare(sql);
        const key = () => `${sql}|${JSON.stringify(args)}`;
        const api = {
          bind(...values) { args = values; return api; },
          async all() { const k = key(); if (!cache.has(k)) cache.set(k, statement.all(...args)); return { results: cache.get(k).map((row) => ({ ...row })) }; },
          async first() { const k = `${key()}#first`; if (!cache.has(k)) cache.set(k, statement.get(...args) || null); const row = cache.get(k); return row ? { ...row } : null; },
        };
        return api;
      },
    };
    const env = { MONITOR_DB: cached, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) };
    // 한 번씩 재고 중앙값을 쓴다(CI 의 GC·스케줄링 튐 한두 번이 판정을 흔들지 않게).
    const measure = async (options, rounds) => { const times = []; for (let i = 0; i < rounds; i += 1) { const start = performance.now(); await summary(env, now, options); times.push(performance.now() - start); } return times.sort((a, b) => a - b)[Math.floor(rounds / 2)]; };
    await measure({}, 3); await measure({ alerting: true }, 3);
    const full = await measure({}, 31), alerting = await measure({ alerting: true }, 31);
    console.log(`측정: summary Worker 쪽 처리 중앙값 알림 판정 ${alerting.toFixed(2)}ms · 화면 ${full.toFixed(2)}ms`);
    ok(alerting < 2.5, `알림 판정 summary 의 Worker 쪽 처리가 중앙값 2.5ms 미만이다(감사 때 전체 8.7ms, Free 한도 10ms): ${alerting.toFixed(2)}ms`);
    ok(alerting < full * 0.4, `알림 판정 범위가 화면 범위의 40% 미만이다: ${alerting.toFixed(2)}ms / ${full.toFixed(2)}ms`);
  }

  // ── 7. G-5 관제: "deferred" 표본과 최종 결과 표본 ─────────────────────────────────
  {
    const at = Date.now();
    const first = { id: "11111111-aaaa-4aaa-8aaa-111111111111", at, route: "skill", method: "POST", status: 200, duration_ms: 4010, db_count: 12, db_ms: 40, db_failures: 0, outcome: "deferred", sample_kind: "incident" };
    const final = { ...first, id: "22222222-bbbb-4bbb-8bbb-222222222222", ref: first.id, at: at + 600, duration_ms: 4600, db_count: 14, db_ms: 600, db_failures: 1, outcome: "error" };
    eq(sanitizeTelemetry(first).outcome, "deferred", "관제가 'deferred' 결과를 그대로 받는다(예전에는 unknown)");
    eq(sanitizeTelemetry({ ...first, ref: final.id }).ref, null, "'deferred' 표본 자신은 다른 표본을 가리킬 수 없다");
    for (const order of [["first", "final"], ["final", "first"]]) {
      const { sqlite, db } = monitorDb();
      const env = { MONITOR_DB: db, OPS_MONITOR_TOKEN: "v22977-monitor-token" };
      for (const name of order) eq((await telemetryPost(env, name === "first" ? first : final)).status, 202, `${order.join("→")}: ${name} 표본을 받는다`);
      const rows = sqlite.prepare("SELECT id,outcome,db_failures,duration_ms FROM telemetry").all();
      ok(rows.length === 1 && rows[0].id === first.id && rows[0].outcome === "error" && rows[0].db_failures === 1 && rows[0].duration_ms === 4600, `${order.join("→")}: 한 요청은 한 행이고 최종 결과(error·DB 실패 1)로 남는다: ${JSON.stringify(rows)}`);
      const view = await summary(env, at + MIN, { alerting: true });
      ok(view.alerts.some((a) => a.title === "최근 처리 실패 기록"), `${order.join("→")}: 처리 중 답 뒤 저장 실패가 '최근 처리 실패 기록' 경고에 걸린다`);
    }
    {
      const { db } = monitorDb();
      const env = { MONITOR_DB: db, OPS_MONITOR_TOKEN: "v22977-monitor-token" };
      await telemetryPost(env, first);
      for (const [offset, expected, label] of [[MIN, false, "최종 결과를 기다리는 10분 안에는 실패로 세지 않는다"], [11 * MIN, true, "10분 넘게 최종 결과가 없으면 결과 미확인 실패로 센다"]]) {
        const full = await summary(env, at + offset), alerting = await summary(env, at + offset, { alerting: true });
        ok(full.alerts.some((a) => a.title === "최근 처리 실패 기록") === expected && alerting.alerts.some((a) => a.title === "최근 처리 실패 기록") === expected, `'deferred' 만 있는 요청: ${label}`);
      }
      const mails = [];
      const sent = await deliverAlerts({ ...env, ALERT_EMAIL: { async send(message) { mails.push(message); } }, ALERT_TO: "ops@example.com", ALERT_FROM: "monitor@app.example", APP_ORIGIN: "https://app.example" }, new Date(at + 11 * MIN));
      ok(sent.titles?.includes("최근 처리 실패 기록") && bodyOf(mails[0]).includes("'처리 중'으로 먼저 답한 뒤"), "결과 미확인 요청이 알림 메일로 나간다");
    }
  }

  // ── 7b. N-14 분석 토큰 확인: workerd 가 받는 redirect 값으로 보내고, 정상 토큰은 성공으로 남긴다 ─────────────
  // 1.1.2 는 redirect:"error" 로 보내 workerd 가 TypeError 로 거절했고, 관제는 그것을 token_user_transport 로 적었다
  // (2026-10-23 21:00·10-24 00:00 실측). 같은 api.cloudflare.com 의 사용량 수집은 그 값을 쓰지 않아 성공했다.
  {
    const ACCOUNT = "0123456789abcdef0123456789abcdef";
    const verified = { success: true, result: { id: "t", status: "active", expires_on: "2027-10-23T14:59:59Z" } };
    const seen = [];
    const tokenFetch = (answers) => async (input, init) => {
      workerdRedirectGuard(init);
      const url = new URL(typeof input === "string" ? input : input.url);
      const scope = url.pathname.startsWith(`/client/v4/accounts/${ACCOUNT}/`) ? "account" : url.pathname === "/client/v4/user/tokens/verify" ? "user" : "";
      if (!scope) throw new Error(`unexpected network ${url.href}`);
      seen.push({ scope, redirect: init?.redirect });
      const answer = answers[scope];
      if (answer === "network") throw new TypeError("fetch failed");
      if (answer === 302) return new Response(null, { status: 302, headers: { location: "https://elsewhere.example/verify" } });
      if (typeof answer === "number") return asJson({ success: false, errors: [{ code: 1000, message: "Invalid API Token" }] }, answer);
      return asJson(answer);
    };
    const attempt = async (answers) => {
      globalThis.fetch = tokenFetch(answers);
      try { return { value: await collectToken({ CF_ANALYTICS_TOKEN: "x", CF_ACCOUNT_ID: ACCOUNT }) }; }
      catch (error) { return { error: String(error?.message || error) }; }
      finally { globalThis.fetch = monitorFetch; }
    };
    const user = await attempt({ user: verified });
    eq(JSON.stringify(user.value), JSON.stringify({ status: "active", expires_on: "2027-10-23T14:59:59Z", scope: "user" }), `N-14 사용자 토큰 확인이 workerd 에서도 성공해 상태·만료일을 남긴다 (${user.error || "성공"})`);
    ok(seen.length > 0 && seen.every((call) => call.redirect === "manual"), `N-14 토큰 확인 요청은 workerd 가 받는 redirect:manual 로 보낸다 (${[...new Set(seen.map((call) => call.redirect))].join(",")})`);
    eq((await attempt({ user: 401, account: verified })).value?.scope, "account", "N-14 사용자 경로 401 이면 계정 경로로 한 번 더 확인한다(1.1.2 동작 유지)");
    eq((await attempt({ user: "network", account: verified })).value?.scope, "account", "N-14 사용자 경로 연결 실패도 계정 경로로 한 번 더 확인한다");
    eq((await attempt({ user: "network", account: "network" })).error, "token_user_transport;token_account_transport", "N-14 두 경로가 모두 연결 실패면 그 사실만 비밀 없이 남긴다");
    eq((await attempt({ user: 302 })).error, "token_user_http_302", "N-14 3xx 는 따라가지 않고 token_user_http_302 로 남긴다(토큰을 다른 주소로 보내지 않는다)");

    // 매시 0~4분 수집이 실제로 토큰 행을 '수집됨'으로 쓴다(바깥 주소 흉내는 workerd 처럼 redirect 값을 거른다).
    const { sqlite, db } = monitorDb();
    await cron(monitorEnv(db, []), Date.parse("2026-10-24T01:00:30.000Z"));
    const tokenRow = sqlite.prepare("SELECT status, error_code FROM collector_state WHERE name='token'").get();
    eq(`${tokenRow?.status}/${tokenRow?.error_code ?? ""}`, "ok/", "N-14 매시 수집의 토큰 확인 행이 '수집됨'이고 오류 코드가 없다");

    // Workers 에서 도는 코드(앱 서버 모듈·관제 Worker)에 workerd 가 거절하는 redirect 값이 없다. 브라우저 코드(client/)와
    // Node 로 도는 외부 점검(external-check.mjs)은 "error" 를 받으므로 보지 않는다.
    const workerSources = [];
    const walk = (dir) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) { if (!["client", "assets"].includes(entry.name)) walk(path); }
        else if (/\.(?:m?js)$/.test(entry.name)) workerSources.push(path);
      }
    };
    walk(fileURLToPath(new URL("../src/modules", import.meta.url)));
    for (const name of ["worker.mjs", "model.mjs", "dashboard.mjs"]) workerSources.push(fileURLToPath(new URL(`../monitoring/${name}`, import.meta.url)));
    const offenders = workerSources.filter((path) => /redirect\s*:\s*["'`]error["'`]/.test(readFileSync(path, "utf8")));
    ok(workerSources.length > 50 && offenders.length === 0, `N-14 Workers 코드 ${workerSources.length}개 파일에 redirect:"error" 가 없다 ${offenders.join(", ")}`);
  }
} finally {
  globalThis.fetch = originalFetch;
  world.uptimeFails = false;
}

// ── 8. G-5 앱: '처리 중' 답 뒤 뒤 작업이 끝나면 최종 결과 표본을 보낸다 ─────────────────
for (const mode of ["fails", "saves"]) {
  await fixture(async (fx) => {
    const sent = [], jobs = [];
    fx.env.OPS_MONITOR_TOKEN = "v22977-app-monitor-token";
    fx.env.OPS_MONITOR = { async fetch(_input, init) { sent.push(JSON.parse(String(init.body))); return new Response("", { status: 202 }); } };
    fx.env.KAKAO_RESPONSE_BUDGET_MS = "200";
    fx.env.KAKAO_SKILL_SECRET = "v22977-skill-secret"; // 인증된 카카오 요청이어야 새 사용자의 첫 기록을 받는다.
    const random = Math.random;
    Math.random = () => 0.5; // 무작위 표본을 끈다: 오류·지연 표본만 나간다.
    const restore = intercept(async ({ url, method, forward }) => {
      if (method !== "POST" || url.pathname !== "/rest/v1/transactions") return null;
      await new Promise((resolve) => setTimeout(resolve, 500));
      return mode === "fails" ? failure(503, "v22977 simulated save failure") : forward();
    });
    try {
      const user = `v22977-${mode}-user`;
      const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET }, body: JSON.stringify({ bot: { id: "v22977-bot", name: "말해가계부" }, userRequest: { utterance: "점심 15000 관제확인", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } } }) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
      await response.text();
      eq(response.headers.get("x-accountbook-nlu-result"), "deferred", `${mode}: 저장이 응답 예산(0.2초)을 넘겨 '처리 중'으로 먼저 답한다`);
      ok(sent.length <= 1 && sent.every((event) => !event.ref), `${mode}: 응답 시점에는 최종 결과 표본을 보내지 않는다(응답 경로에 요청을 더하지 않음)`);
      for (let round = 0; round < 10 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
      const saved = fx.db.transactions.filter((row) => String(row.raw_text || "").includes("관제확인")).length;
      eq(saved, mode === "fails" ? 0 : 1, `${mode}: 뒤 작업의 실제 저장 결과(${mode === "fails" ? "실패" : "저장"})`);
      eq(sent.length, 2, `${mode}: 관제 표본이 두 개다(처리 중 답 + 최종 결과)`);
      const [first, final] = sent;
      ok(first.outcome === "deferred" && first.sample_kind === "incident", `${mode}: 첫 표본은 응답 예산이 3.5초보다 짧아도 '처리 중' 오류·지연 표본이다`);
      ok(final.ref === first.id && final.id !== first.id && final.route === "skill" && final.duration_ms > first.duration_ms, `${mode}: 최종 결과 표본이 첫 표본을 가리키고 뒤 작업까지 걸린 시간을 담는다`);
      if (mode === "fails") ok(final.outcome === "error" && final.db_failures >= 1, `fails: 최종 결과가 저장 실패(error, DB 실패 ${final.db_failures})다(예전에는 deferred·DB 실패 0 만 남았다)`);
      else ok(final.outcome === "ok" && final.db_failures === 0, "saves: 정상 저장은 최종 결과 ok·DB 실패 0 이다");
      ok(!JSON.stringify(sent).includes("관제확인") && !JSON.stringify(sent).includes(user), `${mode}: 표본에 발화·사용자 키가 없다`);
    } finally { restore(); Math.random = random; }
  });
}
{
  const handler = readFileSync(new URL("../src/modules/kakao/skill-handler.js", import.meta.url), "utf8");
  const deferAt = handler.indexOf("ctx.waitUntil(work.then(() => {}, () => {}));");
  ok(deferAt > 0 && handler.indexOf('abMonitorOutcome(env, "deferred", work);') > deferAt, "스킬 처리가 '처리 중' 답을 고른 자리에서만 뒤 작업을 관제에 넘긴다");
}

done();
