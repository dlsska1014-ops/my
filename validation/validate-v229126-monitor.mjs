// V22.9.126 관제 1.8.0 검사 — FC-28(화면 새로 읽기·7일 이력 읽기)·FC-29(알림 기록을 보내기 전에 쓰기·끊긴 실행·모든 채널 실패·
// 관제 몫 CPU 초과)와 작은 것들. 장면마다 고친 동작과 고치기 전 결함을 함께 본다.
//   1. FC-29 보내는 순간 D1 에 이번 메일의 ‘보내는 중’ 기록이 이미 있다(고치기 전: 보낸 뒤에야 기록).
//   2. FC-29 보내기 앞에서 끊긴 실행 → 다음 실행들이 15분 뒤 정확히 한 번 보낸다(영영 안 보내지 않는다).
//   3. FC-29 보낸 뒤 끊긴 실행 → 5분·10분 뒤 다시 보내지 않고 15분 뒤 많아야 한 번 더, 그 뒤 멈춘다(고치기 전: 다음 실행이 또 보내고,
//      실행마다 끊기면 5분마다 보냄).
//   4. FC-29 모든 채널 실패 → 15분 간격으로 다시 시도하고 그동안 화면에 실패가 남는다(고치기 전: 5분마다 다시 시도).
//   5. FC-29 해소 메일도 2·3 과 같다.
//   6. FC-29 관제 몫 CPU 초과(계정 전체 − 앱)를 주의로 알리고 0 이 되면 해소한다(고치기 전: 경고 없음).
//   7. 한 채널만 닿은 발송의 실패 채널이 ‘확인되지 않은 항목’ 에 다음 발송까지 남는다(고치기 전: 숨음).
//   8. collect 의 D1 실패(매시 정리·실패 기록 쓰기)가 그 실행의 경고 발송·이용 현황을 막지 않는다(고치기 전: 둘 다 빠짐).
//   9. UTC 0시 표본 정리를 놓치면 다음 매시 실행이 메우고 같은 날 다시 하지 않는다(고치기 전: 다음 0시까지 밀림).
//  10. 한도 카드의 값이 없으면 ‘확인 불가’ 에 단위를 붙이지 않는다(고치기 전: ‘확인 불가 회/행’).
//  11. 요청 예측만으로는 실제 사용이 한도의 50% 이상일 때만 ‘전환 검토’ 다(고치기 전: 사용 20% 에 저녁 첨두 한 시간으로 전환 검토).
//  12. FC-28 화면 새로 읽기 300초 — 관제 화면과 앱 /ops-monitor 가 같은 HTML 을 낸다(고치기 전: 60초).
//  13. FC-28 화면용 7일 이력은 그래프 점만 읽는다(48행 이하, 같은 48점·같은 남은 일수. 고치기 전: 2,016행).
// 고치기 전 장면은 monitoring/worker.mjs 원문에 아래 BEFORE 되돌림 변환을 걸어 data: URL 로 읽은 사본에서 돌린다(네트워크 없음).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import vm from "node:vm";
import { counter, fixture, page, post } from "./lib-audit-v22934.mjs";
import * as after from "../monitoring/worker.mjs";
import { quotaStatus } from "../monitoring/model.mjs";
import { dashboardHtml } from "../monitoring/dashboard.mjs";

const { ok, eq, done } = counter("V22.9.126 관제 1.8.0(FC-28 화면 읽기·FC-29 알림 기록 순서·관제 CPU·작은 것) 검사 통과");
const MIN = 60000, HOUR = 60 * MIN, DAY = 24 * HOUR;
const iso = (t) => new Date(t).toISOString();
const kst = (t) => new Date(t + 9 * HOUR).toISOString().replace("T", " ").slice(0, 16) + " KST";
const TOKEN = "v229126-monitor-secret";
const TITLE = "서비스 접속 또는 DB 준비 상태 실패";

// ── 고치기 전 사본 ───────────────────────────────────────────────────────────────
const once = (text, from, to, label) => {
  const hits = typeof from === "string" ? text.split(from).length - 1 : (text.match(new RegExp(from.source, "g")) || []).length;
  assert.equal(hits, 1, `되돌림 변환 ‘${label}’ 의 기준 글이 한 번만 있어야 한다(${hits}번) — monitoring/worker.mjs 를 고쳤다면 이 변환도 맞춘다`);
  return text.replace(from, typeof to === "function" ? to : () => to);
};
const OLD_CLEANUP = [
  "  if(now.getUTCMinutes()<5) await env.MONITOR_DB.batch([",
  "    env.MONITOR_DB.prepare(\"DELETE FROM telemetry WHERE id IN (SELECT id FROM telemetry WHERE at < ? ORDER BY at LIMIT 1000)\").bind(now.getTime()-7*DAY),",
  "    env.MONITOR_DB.prepare(\"DELETE FROM settings WHERE key LIKE 'ticket:%' AND CAST(value AS INTEGER) < ?\").bind(now.getTime())",
  "  ]);",
  "  if(now.getUTCHours()===0&&now.getUTCMinutes()<5) await env.MONITOR_DB.prepare(\"DELETE FROM samples WHERE (source,bucket) IN (SELECT source,bucket FROM samples WHERE (source<>'usage' AND bucket < ?1) OR (source='usage' AND bucket < ?2) LIMIT 2000)\").bind(new Date(now.getTime()-30*DAY).toISOString(),monthShift(kstMonth(now.getTime()),-USAGE_KEEP_MONTHS)).run();",
  "}",
].join("\n");
const BEFORE = [
  ["\"./model.mjs\"", JSON.stringify(new URL("../monitoring/model.mjs", import.meta.url).href), "model.mjs 주소"],
  ["\"./dashboard.mjs\"", JSON.stringify(new URL("../monitoring/dashboard.mjs", import.meta.url).href), "dashboard.mjs 주소"],
  ["monthlyForecast, growthDaysToLimit,", "monthlyForecast, daysToLimit, growthDaysToLimit,", "daysToLimit 가져오기"],
  [/    try \{ (await env\.MONITOR_DB\.prepare\("INSERT INTO collector_state\(name,last_attempt_at,status,error_code\)[^\n]*?\.run\(\);) \}\n    catch\(writeError\)[^\n]*\n/, (_, statement) => `    ${statement}\n`, "실패 기록 쓰기 보호"],
  [/  \/\/ 1\.8\.0\(V22\.9\.126\): 정리 문장이 실패해도[\s\S]*?monitor daily cleanup failed[^\n]*\n  \}\n\}/, OLD_CLEANUP, "매시·0시 정리 보호와 메우기"],
  ["  const history=alerting?[]:await dashboardHistory(env,now);\n  const days=await alertGrowthDays(env,now,db.data?.database_bytes,dbCap);",
    "  const history=alerting?[]:(await env.MONITOR_DB.prepare(\"SELECT collected_at AS at,json_extract(payload,'$.database_bytes') AS value FROM samples WHERE source='database' AND bucket >= ? ORDER BY bucket LIMIT 3000\").bind(new Date(now-7*DAY).toISOString()).all()).results;\n  const days=alerting?await alertGrowthDays(env,now,db.data?.database_bytes,dbCap):daysToLimit(history,db.data?.database_bytes,dbCap);", "화면 7일 이력(FC-28)"],
  ["{fresh:cfFresh,forecast,forecastFrom:0.5}", "{fresh:cfFresh,forecast}", "요청 예측 50%"],
  [/  const monitorCpu=monitorCpuLimitErrors\(cf\);\n[^\n]*\n/, "", "관제 몫 CPU 경고"],
  [/  const partial=states\.alerts\?\.fresh[^\n]*\n[^\n]*\n/, "", "일부 채널 실패 항목"],
  ["const hold=failedAt!==null&&at-failedAt<ALERT_RETRY_MS;", "const hold=false;", "모든 채널 실패 뒤 간격"],
  [/  const retryDue=\(record,kind\)=>[^\n]*\n/, "  const retryDue=()=>false;\n", "끊긴 발송 다시 보내기"],
  ["save(key,{...done,attempt:{kind:\"alert\",at:stamp,retry}});", "save(key,done);", "경고 ‘보내는 중’ 표시"],
  ["save(key,{...done,attempt:{kind:\"recovery\",at:stamp,retry}});", "save(key,done);", "해소 ‘보내는 중’ 표시"],
  [/  \/\/ 1\.8\.0\(V22\.9\.126 FC-29\): 보내기 전에 기록부터 쓴다[^\n]*\n  await env\.MONITOR_DB\.batch\(statements\);\n/, "", "보내기 전 쓰기"],
  [/  if\(!delivered\.length\) \{\n[\s\S]*?\n  \}\n/, "  if(!delivered.length) throw new Error(`delivery_failed ${failures.join(\" \")}`);\n", "모든 채널 실패 때 되돌리기"],
  ["await env.MONITOR_DB.batch([...mail.map(item=>put(item.key,item.done)),...(holdRecord?[drop(ALERT_HOLD_KEY)]:[])]);", "if(statements.length) await env.MONITOR_DB.batch(statements);", "보낸 뒤 쓰기(1.7.0 순서)"],
];
const beforeSource = BEFORE.reduce((text, [from, to, label]) => once(text, from, to, label), readFileSync(new URL("../monitoring/worker.mjs", import.meta.url), "utf8"));
const before = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(beforeSource));
ok(typeof before.deliverAlerts === "function" && typeof before.default?.scheduled === "function", `고치기 전 사본을 만든다(되돌림 변환 ${BEFORE.length}개)`);

// ── D1·바깥 요청 흉내 ────────────────────────────────────────────────────────────
// test-d1.mjs 와 같은 node:sqlite D1. fail(sql) 이 참인 문장은 D1 오류로 던지고(batch 는 통째로), counting 이면 samples 를 읽는 문장이
// 지나간 행 수를 센다(verify/F rows-read 와 같은 방법: WHERE 앞에 세는 함수를 끼운다).
function monitorDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8"));
  let ticks = 0;
  sqlite.function("v126_tick", { deterministic: false }, () => { ticks += 1; return 1; });
  const fx = { sqlite, fail: null, counting: false, visits: [], ran: [] };
  const execute = (sql, task) => {
    if (fx.fail?.(sql)) throw new Error("D1_ERROR: simulated failure");
    fx.ran.push(sql);
    if (!fx.counting) return task(sql);
    ticks = 0;
    const value = task(sql.replace(/FROM samples WHERE /g, "FROM samples WHERE v126_tick() AND "));
    fx.visits.push({ sql, rows: ticks });
    return value;
  };
  fx.db = {
    prepare(sql) {
      let args = [];
      const api = {
        sql,
        bind(...values) { args = values; return api; },
        async all() { return { results: execute(sql, (text) => sqlite.prepare(text).all(...args)) }; },
        async first() { return execute(sql, (text) => sqlite.prepare(text).get(...args)) || null; },
        async run() { return api.runNow(); },
        runNow() { return execute(sql, (text) => { const data = sqlite.prepare(text).run(...args); return { success: true, meta: { changes: data.changes } }; }); },
      };
      return api;
    },
    async batch(statements) {
      if (statements.some((statement) => fx.fail?.(statement.sql))) throw new Error("D1_ERROR: simulated batch failure");
      sqlite.exec("BEGIN");
      try { const values = statements.map((statement) => statement.runNow()); sqlite.exec("COMMIT"); return values; } catch (error) { sqlite.exec("ROLLBACK"); throw error; }
    },
  };
  return fx;
}
const world = { ready: true, webhook: 200, hooks: [] };
const fakeFetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "hooks.example") { if (world.webhook !== 200) return new Response("down", { status: world.webhook }); world.hooks.push(JSON.parse(String(init.body))); return new Response("ok"); }
  if (url.pathname === "/ready") return new Response(JSON.stringify({ ready: world.ready }), { status: world.ready ? 200 : 503 });
  if (url.pathname === "/health") return new Response(JSON.stringify({ alive: true, version: "fixture" }));
  return new Response(JSON.stringify({ ok: false }), { status: 404 });
};
const setState = (fx, name, t, payload) => fx.sqlite.prepare("INSERT INTO collector_state(name,last_attempt_at,last_success_at,status,error_code,payload) VALUES(?,?,?,'ok',NULL,?) ON CONFLICT(name) DO UPDATE SET last_attempt_at=excluded.last_attempt_at,last_success_at=excluded.last_success_at,status='ok',error_code=NULL,payload=excluded.payload").run(name, iso(t), iso(t), JSON.stringify(payload));
const uptime = (t, readyOk) => ({ checks: [{ path: "/health", ok: true, probed_at: iso(t) }, { path: "/ready", ok: readyOk, probed_at: iso(t) }], checked_at: iso(t), same_provider: true });
const counters = (requests, extra = {}) => ({ requests, errors: 0, subrequests: 1, cpu_ms: 1, cpu_limit_errors: 0, resource_limit_errors: 0, observed: true, ...extra });
const cloudflare = (t, { today = 20000, hour = 100, app = 19000, todayCpu = 0, appCpu = 0 } = {}) => {
  const start = new Date(t - 5 * MIN); start.setUTCHours(0, 0, 0, 0);
  return { today: counters(today, { cpu_limit_errors: todayCpu }), hour: counters(hour), app: counters(app, { cpu_limit_errors: appCpu }), period_start: start.toISOString(), period_end: iso(t - 5 * MIN), scope: "account", includes_monitor: true, sampled: true };
};
const recordOf = (fx, title) => fx.sqlite.prepare("SELECT value FROM settings WHERE key LIKE 'alert:%'").all().map((row) => JSON.parse(row.value)).find((value) => value.title === title) || null;
const holdOf = (fx) => { const row = fx.sqlite.prepare("SELECT value FROM settings WHERE key='alert:hold'").get(); return row ? JSON.parse(row.value) : null; };
const alertsState = (fx) => fx.sqlite.prepare("SELECT status,error_code,payload FROM collector_state WHERE name='alerts'").get() || null;
const T0 = Date.parse("2026-11-16T03:10:00.000Z");
const monitorEnv = (fx, extra = {}) => ({ MONITOR_DB: fx.db, OPS_MONITOR_TOKEN: TOKEN, APP_ORIGIN: "https://app.example", CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(T0 - DAY), ALERT_TO: "ops@example.com", ALERT_FROM: "monitor@app.example", ...extra });
const mailbox = () => { const mails = []; return { mails, ok: { async send(message) { mails.push(message); } } }; };
const bodyOf = (message) => Buffer.from(String(message.raw).split("\r\n\r\n")[1].replace(/\r\n/g, ""), "base64").toString("utf8");
// 실행이 끊긴 것을 흉내 낸다: 메일 보내기가 끝나지 않아 그 뒤 코드(확정·되돌리기·수집 상태 쓰기)가 영영 돌지 않는다.
// delivered 면 메일은 이미 나갔다(보낸 뒤 끊김), 아니면 나가지 않았다(보내기 앞에서 끊김).
const killedSend = (box, delivered) => { let reached; const at = new Promise((resolve) => { reached = resolve; }); return { at, binding: { send(message) { if (delivered) box.mails.push(message); reached(); return new Promise(() => {}); } } }; };
// 예약 실행의 알림 단계와 같은 꼴(writeCollector("alerts", deliverAlerts)). 끊기면 "killed" 를 돌려주고 그 실행은 버린다.
async function deliver(mod, fx, t, extra, kill = null) {
  const env = monitorEnv(fx, extra);
  const run = mod.writeCollector(env, "alerts", () => mod.deliverAlerts(env, new Date(t)), new Date(t)).then(() => "done");
  return kill ? Promise.race([run, kill.at.then(() => "killed")]) : run;
}

const realFetch = globalThis.fetch, realError = console.error;

// ── 12(앞부분). 앱 /ops-monitor 가 관제의 화면 HTML 을 그대로 낸다 ───────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = "v229126-monitor-admin";
  fx.env.ADMIN_SESSION_SECRET = "v229126-monitor-session-secret";
  fx.env.OPS_MONITOR_TOKEN = TOKEN;
  const monitorFx = monitorDb();
  const calls = [];
  fx.env.OPS_MONITOR = { fetch: (url, init) => { calls.push(String(url)); return after.default.fetch(new Request(url, init), monitorEnv(monitorFx), {}); } };
  const login = await post(fx, "/login", { password: "v229126-monitor-admin", return_to: "/ops-monitor" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "12 관리자로 로그인한다");
  const screen = await page(fx, "/ops-monitor", { cookie: admin });
  eq(screen.status, 200, "12 앱 /ops-monitor 가 화면을 낸다");
  ok(calls.length === 1 && calls[0].endsWith("/dashboard?base=/ops-monitor"), `12 앱은 관제의 /dashboard?base=/ops-monitor 를 부른다: ${calls.join(",")}`);
  eq(screen.html, dashboardHtml("/ops-monitor"), "12 앱 /ops-monitor 의 HTML 은 관제가 낸 화면 그대로다(앱 쪽을 고치지 않아도 새로 읽기 간격이 같이 바뀐다)");
  ok(screen.html.includes("setInterval(load,300000)") && !screen.html.includes("setInterval(load,60000)"), "12 앱 /ops-monitor 화면도 300초마다 새로 읽는다");
  monitorFx.sqlite.close();
});

globalThis.fetch = fakeFetch;
console.error = () => {};
try {
  // ── 1·2·3. FC-29 끊긴 실행 ──────────────────────────────────────────────────────
  // T0 에 /ready 실패(긴급)가 생겨 메일을 보내다 실행이 끊긴다. 그 뒤 1시간 동안 5분 실행(경고는 그대로)을 돌려 실행마다 나간 메일 수를 센다.
  // everyRunKilled 면 그 뒤 메일을 보내는 실행도 모두 같은 자리에서 끊긴다(같은 원인이 이어지는 경우).
  async function killScene(mod, delivered, { everyRunKilled = false } = {}) {
    const fx = monitorDb(), box = mailbox();
    setState(fx, "uptime", T0, uptime(T0, false));
    const kill = killedSend(box, delivered);
    const first = await deliver(mod, fx, T0, { ALERT_EMAIL: kill.binding }, kill);
    const atSend = recordOf(fx, TITLE);
    const sends = [];
    for (let i = 1; i <= 12; i += 1) {
      const t = T0 + i * 5 * MIN;
      setState(fx, "uptime", t, uptime(t, false));
      const count = box.mails.length;
      if (everyRunKilled) { const again = killedSend(box, delivered); await deliver(mod, fx, t, { ALERT_EMAIL: again.binding }, again); }
      else await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
      sends.push(box.mails.length - count);
    }
    return { first, atSend, sends: sends.join(""), mails: box.mails, record: recordOf(fx, TITLE), fx };
  }
  {
    const cut = await killScene(after, false);
    eq(cut.first, "killed", "2 첫 실행은 보내는 자리에서 끊긴다");
    ok(cut.atSend?.sent_at === iso(T0) && cut.atSend.attempt?.kind === "alert" && cut.atSend.attempt.at === iso(T0) && cut.atSend.attempt.retry === false, `1 보내는 순간 D1 에 이번 경고 기록이 ‘보내는 중’(attempt) 표시와 함께 이미 있다: ${JSON.stringify(cut.atSend)}`);
    const old = await killScene(before, false);
    eq(old.atSend, null, "1 고치기 전: 보내는 순간 D1 에 기록이 없다(보낸 뒤에야 썼다)");
    eq(cut.sends, "001000000000", "2 보내기 앞에서 끊긴 뒤: 5분·10분 실행은 보내지 않고 15분 실행이 정확히 한 번 보낸 뒤 1시간 동안 더 보내지 않는다");
    ok(cut.mails.length === 1 && bodyOf(cut.mails[0]).includes(`[긴급] ${TITLE}`), "2 그 한 번이 끊긴 경고 메일이다(영영 안 보내지 않는다)");
    ok(cut.record?.sent_at === iso(T0 + 15 * MIN) && !("attempt" in cut.record), `2 닿은 뒤에는 ‘보내는 중’ 표시가 지워진다: ${JSON.stringify(cut.record)}`);
  }
  {
    const cut = await killScene(after, true);
    eq(cut.sends, "001000000000", "3 보낸 뒤 끊긴 뒤: 5분·10분 실행은 다시 보내지 않고, 15분 실행이 많아야 한 번 더 보낸 뒤 멈춘다(끊긴 실행이 보냈는지 알 수 없어 한 번은 다시 보낸다)");
    eq(cut.mails.length, 2, "3 메일은 끊긴 실행의 것과 다시 보낸 것 둘뿐이다");
    const old = await killScene(before, true);
    eq(old.sends, "100000000000", "3 고치기 전: 보낸 뒤 끊기면 기록이 없어 바로 다음 5분 실행이 같은 메일을 또 보냈다");
    const always = await killScene(after, true, { everyRunKilled: true });
    eq(always.sends, "001000000000", "3 보내는 실행마다 보낸 뒤 끊겨도 15분 뒤 한 번만 더 보내고 멈춘다(다시 보낸 기록은 다시 보내지 않는다)");
    ok(always.record?.attempt?.retry === true, "3 그 기록은 ‘다시 보낸 것’ 표시를 지닌다");
    const oldAlways = await killScene(before, true, { everyRunKilled: true });
    eq(oldAlways.sends, "111111111111", "3 고치기 전: 보내는 실행마다 끊기면 5분마다 같은 메일을 보냈다(1시간 12통)");
  }

  // ── 4. FC-29 모든 채널 실패 ─────────────────────────────────────────────────────
  async function totalFailure(mod) {
    const fx = monitorDb();
    let attempts = 0;
    const failing = { async send() { attempts += 1; throw Object.assign(new Error("sender domain is not verified"), { code: "E_SENDER_NOT_VERIFIED" }); } };
    const tries = [], codes = [];
    for (let i = 0; i <= 6; i += 1) {
      const t = T0 + i * 5 * MIN;
      setState(fx, "uptime", t, uptime(t, false));
      const count = attempts;
      await deliver(mod, fx, t, { ALERT_EMAIL: failing });
      tries.push(attempts - count);
      codes.push(String(alertsState(fx)?.error_code || ""));
    }
    return { fx, tries: tries.join(""), codes };
  }
  {
    const failed = await totalFailure(after);
    eq(failed.tries, "1001001", "4 모든 채널이 실패하면 15분 간격으로 다시 시도한다(30분에 세 번)");
    ok(failed.codes.every((code) => code === "delivery_failed email:E_SENDER_NOT_VERIFIED"), `4 다시 시도하지 않는 실행도 알림 발송을 실패로 남긴다(화면 ‘확인되지 않은 항목’ 에 계속 보인다): ${[...new Set(failed.codes)].join(" | ")}`);
    ok(recordOf(failed.fx, TITLE) === null && holdOf(failed.fx)?.at === iso(T0 + 30 * MIN) && holdOf(failed.fx)?.codes === "email:E_SENDER_NOT_VERIFIED", `4 실패한 경고 기록은 보내기 전으로 되돌리고(없던 기록은 지움) 실패 시각만 alert:hold 에 남는다: ${JSON.stringify(holdOf(failed.fx))}`);
    const view = await after.summary(monitorEnv(failed.fx), T0 + 31 * MIN);
    ok(view.unknown.includes("알림 발송(delivery_failed email:E_SENDER_NOT_VERIFIED)"), "4 화면의 확인되지 않은 항목에 알림 발송 실패가 보인다");
    const old = await totalFailure(before);
    eq(old.tries, "1111111", "4 고치기 전: 모든 채널이 실패하면 5분마다 다시 시도했다(30분에 일곱 번)");
    // 채널이 살아난 뒤: 마지막 실패(30분) 뒤 15분이 지나야 보낸다.
    const box = mailbox();
    const sent = [];
    for (const offset of [35, 40, 45, 50]) {
      const t = T0 + offset * MIN;
      setState(failed.fx, "uptime", t, uptime(t, false));
      const count = box.mails.length;
      await deliver(after, failed.fx, t, { ALERT_EMAIL: box.ok });
      sent.push(box.mails.length - count);
    }
    eq(sent.join(""), "0010", "4 채널이 살아나도 마지막 실패 15분 뒤에 한 번 보낸다");
    ok(holdOf(failed.fx) === null && recordOf(failed.fx, TITLE)?.sent_at === iso(T0 + 45 * MIN) && alertsState(failed.fx)?.status === "ok", "4 닿으면 alert:hold 를 지우고 경고 기록을 적고 알림 발송이 정상으로 돌아온다");
  }

  // ── 5. FC-29 해소 메일 ─────────────────────────────────────────────────────────
  async function recoveryScene(mod, delivered) {
    const fx = monitorDb(), box = mailbox();
    setState(fx, "uptime", T0, uptime(T0, false));
    await deliver(mod, fx, T0, { ALERT_EMAIL: box.ok });
    const R = T0 + 5 * HOUR;
    for (const offset of [0, 5]) { const t = R + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); await deliver(mod, fx, t, { ALERT_EMAIL: box.ok }); }
    const third = R + 10 * MIN;
    setState(fx, "uptime", third, uptime(third, true));
    const kill = killedSend(box, delivered);
    const first = await deliver(mod, fx, third, { ALERT_EMAIL: kill.binding }, kill);
    const atSend = recordOf(fx, TITLE);
    const sends = [];
    for (let i = 1; i <= 10; i += 1) {
      const t = third + i * 5 * MIN;
      setState(fx, "uptime", t, uptime(t, true));
      const count = box.mails.length;
      await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
      sends.push(box.mails.length - count);
    }
    return { first, atSend, third, sends: sends.join(""), recoveries: box.mails.filter((m) => bodyOf(m).includes(`[해소] ${TITLE}`)).length, record: recordOf(fx, TITLE) };
  }
  {
    const cut = await recoveryScene(after, false);
    ok(cut.first === "killed" && cut.atSend?.attempt?.kind === "recovery" && cut.atSend.recovered_at === iso(cut.third), `5 해소 메일도 보내기 전에 ‘보내는 중’ 기록을 쓴다: ${JSON.stringify(cut.atSend)}`);
    ok(cut.sends === "0010000000" && cut.recoveries === 1, `5 해소 메일을 보내기 앞에서 끊기면 15분 뒤 한 번 보낸다(${cut.sends}, 해소 ${cut.recoveries}통)`);
    ok(cut.record?.recovered_at === iso(cut.third + 15 * MIN) && !("attempt" in cut.record), "5 닿은 해소 기록에는 표시가 없다");
    const sent = await recoveryScene(after, true);
    ok(sent.sends === "0010000000" && sent.recoveries === 2, `5 해소 메일을 보낸 뒤 끊기면 15분 뒤 많아야 한 번 더 보내고 멈춘다(${sent.sends}, 해소 ${sent.recoveries}통)`);
    const old = await recoveryScene(before, true);
    ok(old.sends.startsWith("1") && old.recoveries === 2, `5 고치기 전: 해소 메일을 보낸 뒤 끊기면 바로 다음 5분 실행이 또 보냈다(${old.sends})`);
  }

  // ── 6. FC-29 관제 몫 CPU 초과 ──────────────────────────────────────────────────
  {
    const fx = monitorDb();
    const title = "관제 Worker의 CPU 제한 초과";
    setState(fx, "cloudflare", T0, cloudflare(T0, { todayCpu: 5, appCpu: 2 }));
    const view = await after.summary(monitorEnv(fx), T0, { alerting: true });
    const hit = view.alerts.find((alert) => alert.title === title);
    ok(hit?.status === "warning" && hit.message.includes("5건") && hit.message.includes("3건") && hit.message.includes("Workers Logs"), `6 계정 전체 5건 − 앱 2건 = 관제 몫 3건을 주의로 알린다: ${JSON.stringify(hit)}`);
    ok(view.alerts.some((alert) => alert.title === "앱 Worker의 CPU 제한 초과"), "6 앱 몫(2건)은 예전처럼 앱 경고로 따로 알린다");
    const oldView = await before.summary(monitorEnv(fx), T0, { alerting: true });
    ok(!oldView.alerts.some((alert) => alert.title === title) && oldView.alerts.length === view.alerts.length - 1, "6 고치기 전: 관제 몫 CPU 초과는 경고가 없었다(계정 전체 건수를 세고도 앱 몫만 보았다)");
    const box = mailbox();
    await deliver(after, fx, T0, { ALERT_EMAIL: box.ok });
    ok(box.mails.length === 1 && bodyOf(box.mails[0]).includes(`[주의] ${title}`), "6 관제 몫 CPU 초과가 경고 메일에 실린다");
    for (const [label, cpu] of [["앱 몫뿐", { todayCpu: 4, appCpu: 4 }], ["초과 없음", {}]]) {
      setState(fx, "cloudflare", T0, cloudflare(T0, cpu));
      ok(!(await after.summary(monitorEnv(fx), T0, { alerting: true })).alerts.some((alert) => alert.title === title), `6 ${label}이면 관제 몫 경고가 없다`);
    }
    // 다음 UTC 날 건수가 0 으로 돌아오면 정상 3번(10분 이상)으로 해소한다(주의라 해소 메일은 없다).
    const next = Date.parse("2026-11-17T01:00:00.000Z");
    for (const offset of [0, 5, 10]) { const t = next + offset * MIN; setState(fx, "cloudflare", t, cloudflare(t)); await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); }
    ok(recordOf(fx, title)?.resolved_at === iso(next + 10 * MIN) && box.mails.length === 1, `6 관제 몫이 0 이 되면 정상 3번(10분 이상)으로 해소로 적는다(주의라 해소 메일은 없다): ${JSON.stringify(recordOf(fx, title))} · 메일 ${box.mails.length}`);
  }

  // ── 7. 한 채널만 닿은 발송 ─────────────────────────────────────────────────────
  async function partialScene(mod) {
    const fx = monitorDb(), box = mailbox();
    world.webhook = 500;
    const hookEnv = { ALERT_EMAIL: box.ok, ALERT_WEBHOOK_URL: "https://hooks.example/alert" };
    setState(fx, "uptime", T0, uptime(T0, false));
    await deliver(mod, fx, T0, hookEnv);
    const sentView = await mod.summary(monitorEnv(fx, hookEnv), T0 + MIN);
    setState(fx, "uptime", T0 + 5 * MIN, uptime(T0 + 5 * MIN, false));
    await deliver(mod, fx, T0 + 5 * MIN, hookEnv);
    const quietView = await mod.summary(monitorEnv(fx, hookEnv), T0 + 6 * MIN);
    world.webhook = 200;
    return { fx, box, hookEnv, sentView, quietView };
  }
  {
    const line = `알림 발송 일부 채널 실패(webhook:http_500 · ${kst(T0)} 발송)`;
    const partial = await partialScene(after);
    ok(partial.box.mails.length === 1 && partial.sentView.delivery.status === "ok", "7 이메일은 닿고 웹훅은 실패한 발송은 성공으로 적힌다");
    ok(partial.sentView.unknown.includes(line), `7 실패한 웹훅이 확인되지 않은 항목에 보인다: ${partial.sentView.unknown.join(" / ")}`);
    ok(partial.quietView.unknown.includes(line), "7 다음 조용한 실행(보낼 것 없음)이 덮어도 그 항목이 남는다");
    const oldPartial = await partialScene(before);
    ok(!oldPartial.sentView.unknown.some((item) => item.startsWith("알림 발송")) && !oldPartial.quietView.unknown.some((item) => item.startsWith("알림 발송")), "7 고치기 전: 한 채널이 실패해도 화면에 아무 표시가 없었다");
    // 웹훅을 떼면 그 채널의 실패는 더 남기지 않는다. 두 채널이 다 닿는 다음 발송이 지운다.
    const t1 = T0 + 10 * MIN;
    setState(partial.fx, "uptime", t1, uptime(t1, false));
    await deliver(after, partial.fx, t1, { ALERT_EMAIL: partial.box.ok });
    ok(!(await after.summary(monitorEnv(partial.fx, { ALERT_EMAIL: partial.box.ok }), t1 + MIN)).unknown.some((item) => item.startsWith("알림 발송 일부")), "7 그 채널을 떼면 실패 항목도 사라진다");
    const t2 = T0 + 6 * HOUR + 5 * MIN;
    setState(partial.fx, "uptime", t2, uptime(t2, false));
    const hooks = world.hooks.length;
    await deliver(after, partial.fx, t2, partial.hookEnv);
    const healed = await after.summary(monitorEnv(partial.fx, partial.hookEnv), t2 + MIN);
    ok(partial.box.mails.length === 2 && world.hooks.length === hooks + 1 && !healed.unknown.some((item) => item.startsWith("알림 발송")), "7 두 채널이 다 닿은 다음 발송(6시간 뒤 다시 보냄)이 실패 항목을 지운다");
  }

  // ── 8·9. collect 의 D1 실패와 0시 정리 ─────────────────────────────────────────
  const usageCalls = [];
  const appBinding = { async fetch(input) {
    const path = new URL(typeof input === "string" ? input : input.url).pathname;
    if (path === "/internal/ops-usage") { usageCalls.push(path); return new Response(JSON.stringify({ ok: false, error_code: "rpc_missing" }), { status: 503 }); }
    return new Response(JSON.stringify({ ok: true, metrics: { database_bytes: 30 * 1024 ** 2, connections: 5, max_connections: 60, cpu_counter: { total: 100, idle: 80 } } }));
  } };
  async function scheduledRun(mod, fx, t, box) {
    const jobs = [];
    await mod.default.scheduled({ scheduledTime: t }, monitorEnv(fx, { ALERT_EMAIL: box.ok, ACCOUNTBOOK: appBinding }), { waitUntil: (job) => jobs.push(job) });
    return (await Promise.allSettled(jobs)).every((job) => job.status === "fulfilled");
  }
  for (const [label, fail, at] of [
    ["매시 정리 문장", (sql) => sql.startsWith("DELETE FROM telemetry"), Date.parse("2026-11-16T04:00:00.000Z")],
    ["수집 실패 기록 쓰기", (sql) => sql.startsWith("INSERT INTO collector_state(name,last_attempt_at,status,error_code)"), Date.parse("2026-11-16T04:10:00.000Z")],
  ]) {
    const outcome = async (mod) => {
      const fx = monitorDb(), box = mailbox();
      world.ready = false; usageCalls.length = 0;
      fx.fail = fail;
      const settled = await scheduledRun(mod, fx, at, box);
      world.ready = true;
      return { settled, mails: box.mails.length, usage: usageCalls.length, alerts: alertsState(fx)?.status || null };
    };
    const fixed = await outcome(after), old = await outcome(before);
    ok(fixed.settled && fixed.mails === 1 && fixed.alerts === "ok" && fixed.usage === 1, `8 ${label} D1 실패에도 그 실행의 경고 발송과 이용 현황 요청이 이어 돈다: ${JSON.stringify(fixed)}`);
    ok(!old.settled && old.mails === 0 && old.alerts === null && old.usage === 0, `8 고치기 전: ${label} D1 실패로 collect 가 멈춰 그 실행의 경고 발송·이용 현황이 빠졌다: ${JSON.stringify(old)}`);
  }
  {
    const D0 = Date.parse("2026-11-17T00:00:00.000Z");
    const cleanupScene = async (mod) => {
      const fx = monitorDb(), box = mailbox();
      const insert = fx.sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,'{}')");
      for (let i = 0; i < 3; i += 1) insert.run("uptime", iso(D0 - 31 * DAY + i * 5 * MIN), iso(D0 - 31 * DAY + i * 5 * MIN));
      const stale = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM samples WHERE source='uptime' AND bucket < ?").get(iso(D0 - 30 * DAY)).n;
      const deletes = () => fx.ran.filter((sql) => sql.startsWith("DELETE FROM samples")).length;
      const marks = () => fx.ran.filter((sql) => sql.includes("key='samples_cleanup'")).length;
      fx.fail = (sql) => sql.startsWith("DELETE FROM samples");
      const midnight = await scheduledRun(mod, fx, D0, box);
      fx.fail = null;
      const steps = [];
      for (const t of [D0 + HOUR, D0 + HOUR + 10 * MIN, D0 + 2 * HOUR, D0 + DAY]) {
        const [d, m] = [deletes(), marks()];
        await scheduledRun(mod, fx, t, box);
        steps.push({ stale: stale(), deletes: deletes() - d, marks: marks() - m });
      }
      return { midnight, steps };
    };
    const fixed = await cleanupScene(after);
    ok(fixed.midnight && fixed.steps[0].stale === 0 && fixed.steps[0].deletes === 1, `9 0시 정리가 실패하면 01:00 매시 실행이 메운다: ${JSON.stringify(fixed.steps[0])}`);
    ok(fixed.steps[1].deletes === 0 && fixed.steps[1].marks === 0 && fixed.steps[2].deletes === 0 && fixed.steps[2].marks === 1, `9 메운 뒤 같은 날 매시 실행은 마지막 정리 시각 한 행만 읽고 다시 지우지 않는다(매시가 아닌 실행은 읽지도 않는다): ${JSON.stringify(fixed.steps.slice(1, 3))}`);
    ok(fixed.steps[3].deletes === 1 && fixed.steps[3].marks === 0, `9 다음 날 0시에는 예전처럼 정리 시각을 읽지 않고 정리한다: ${JSON.stringify(fixed.steps[3])}`);
    const old = await cleanupScene(before);
    ok(!old.midnight && old.steps[0].stale === 3 && old.steps[2].stale === 3 && old.steps[3].deletes === 1, `9 고치기 전: 0시 정리가 실패하면 그날은 다시 지우지 않아 다음 0시까지 밀렸다: ${JSON.stringify(old.steps.map((s) => s.stale))}`);
  }

  // ── 10·12. 화면: 단위·새로 읽기 간격 ───────────────────────────────────────────
  const dashScript = (html) => html.match(/<script>([\s\S]*?)<\/script>/)[1];
  const OLD_DASH = [["setInterval(load,300000)", "setInterval(load,60000)"], ["(q.value===null||q.value===undefined?'':q.unit==='rows'?' 행':' 회')", "(q.unit==='rows'?' 행':' 회')"]];
  const renderDash = (script, data) => {
    const elements = new Map();
    const element = (id) => { if (!elements.has(id)) elements.set(id, { id, innerHTML: "", textContent: "", value: "", disabled: false, addEventListener() {}, querySelector() { return { disabled: false }; } }); return elements.get(id); };
    const intervals = [];
    const context = vm.createContext({ document: { hidden: true, addEventListener() {}, getElementById: element }, setInterval(task, ms) { intervals.push(ms); }, console, AbortSignal, fetch() { throw new Error("not expected while hidden"); } });
    vm.runInContext(script, context);
    context.__summary = JSON.parse(JSON.stringify(data));
    vm.runInContext("render(__summary)", context);
    return { html: element("content").innerHTML, intervals };
  };
  {
    const fx = monitorDb();
    const blank = await after.summary(monitorEnv(fx), T0);
    ok(blank.quotas.some((q) => q.unit === "requests" && q.value === null) && blank.quotas.some((q) => q.unit === "rows" && q.value === null), "10 값이 없는 요청·행 한도 카드가 있다");
    const script = dashScript(dashboardHtml(""));
    const oldScript = OLD_DASH.reduce((text, [from, to]) => once(text, from, to, `화면 ${from.slice(0, 24)}`), script);
    const fixed = renderDash(script, blank), old = renderDash(oldScript, blank);
    ok(fixed.html.includes('<div class="metric">확인 불가</div>') && !/확인 불가 [회행]/.test(fixed.html), "10 값이 없는 한도 카드는 ‘확인 불가’ 만 보인다");
    ok(old.html.includes("확인 불가 회") && old.html.includes("확인 불가 행"), "10 고치기 전: ‘확인 불가 회’·‘확인 불가 행’ 으로 보였다");
    eq(fixed.intervals.join(","), "300000", "12 관제 화면은 300초마다 새로 읽는다");
    eq(old.intervals.join(","), "60000", "12 고치기 전: 60초마다 새로 읽었다(자료는 5분마다만 바뀐다)");
    ok(dashboardHtml("").includes("화면은 5분마다 저장된 최신 기록을 조회하며") && !dashboardHtml("").includes("화면은 60초마다"), "12 화면 아래 안내도 5분이다");
    fx.sqlite.close();
  }

  // ── 11. 요청 예측 50% ──────────────────────────────────────────────────────────
  {
    eq(quotaStatus(20000, 100000, { forecast: 108000 }).status, "upgrade", "11 고치기 전 판정 꼴: 사용 20% 라도 예측이 한도를 넘으면 전환 검토였다");
    eq(quotaStatus(20000, 100000, { forecast: 108000, forecastFrom: 0.5 }).status, "normal", "11 실제 사용이 50% 미만이면 예측만으로 올리지 않는다");
    eq(quotaStatus(55000, 100000, { forecast: 110000, forecastFrom: 0.5 }).status, "upgrade", "11 실제 사용이 50% 이상이면 예측으로 전환 검토다");
    eq(quotaStatus(72000, 100000, { forecast: 90000, forecastFrom: 0.5 }).status, "warning", "11 70% 주의 기준은 그대로다");
    const fx = monitorDb();
    const evening = Date.parse("2026-11-16T13:00:00.000Z");
    const requests = (view) => view.quotas.find((q) => q.key === "worker_requests");
    setState(fx, "cloudflare", evening, cloudflare(evening, { today: 20000, hour: 8000, app: 19000 }));
    const fixed = await after.summary(monitorEnv(fx), evening, { alerting: true }), old = await before.summary(monitorEnv(fx), evening, { alerting: true });
    ok(requests(fixed).forecast_ratio >= 1 && requests(fixed).ratio < 0.5 && requests(fixed).status === "normal" && !fixed.alerts.some((a) => a.title === "Workers 일간 요청"), `11 22시(KST) 첨두 한 시간 8,000건 × 남은 11시간 예측(${Math.round(requests(fixed).forecast)}건)만으로는 전환 검토가 아니다`);
    ok(requests(old).status === "upgrade" && old.alerts.some((a) => a.title === "Workers 일간 요청" && a.status === "upgrade"), "11 고치기 전: 같은 값으로 ‘Workers 일간 요청’ 전환 검토 경고가 났다");
    setState(fx, "cloudflare", evening, cloudflare(evening, { today: 55000, hour: 5000, app: 50000 }));
    ok(requests(await after.summary(monitorEnv(fx), evening, { alerting: true })).status === "upgrade", "11 사용 55% 에 예측이 한도를 넘으면 그대로 전환 검토다");
  }

  // ── 13. FC-28 화면용 7일 이력 ──────────────────────────────────────────────────
  {
    const fx = monitorDb();
    const now = Date.parse("2026-11-16T03:12:00.000Z");
    const insert = fx.sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES('database',?,?,?)");
    let last = null;
    for (let i = 2016; i >= 1; i -= 1) {
      const t = now - i * 5 * MIN;
      last = { database_bytes: 400 * 1024 ** 2 + (2016 - i) * 30000, connections: 12, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 4e8, cpu_counter: { total: 1e7 + i, idle: 8e6 } };
      insert.run(iso(Math.floor(t / (5 * MIN)) * 5 * MIN), iso(t), JSON.stringify(last));
    }
    setState(fx, "database", now, last);
    const env = monitorEnv(fx);
    const rowsOf = (pattern) => fx.visits.filter((visit) => pattern.test(visit.sql)).reduce((sum, visit) => sum + visit.rows, 0);
    fx.counting = true;
    fx.visits = []; const fixed = await after.summary(env, now);
    const fixedRows = rowsOf(/AS first,|bucket IN \(|json_type\(payload/);
    fx.visits = []; const old = await before.summary(env, now);
    const oldRows = rowsOf(/ORDER BY bucket LIMIT 3000/);
    fx.counting = false;
    console.log(`측정: 화면 한 번의 7일 이력 읽기 ${oldRows}행 → ${fixedRows}행(남은 일수 SQL 포함). 탭 하나 하루 ${(oldRows * 1440).toLocaleString("en-US")}행(60초) → ${(fixedRows * 288).toLocaleString("en-US")}행(300초)`);
    ok(oldRows >= 2015 && fixedRows <= 64, `13 화면용 이력은 그래프 점 48행과 첫·끝 점·남은 일수 SQL 몇 행만 읽는다(고치기 전 ${oldRows}행 → ${fixedRows}행)`);
    eq(fixed.database_history.length, 48, "13 그래프 점은 그대로 48개다");
    eq(JSON.stringify(fixed.database_history), JSON.stringify(old.database_history), "13 빠진 칸이 없는 7일이면 고치기 전과 같은 48점이다");
    const days = (view) => view.quotas.find((q) => q.key === "database_size").days_to_limit;
    const alerting = await after.summary(env, now, { alerting: true });
    ok(days(fixed) !== null && Math.abs(days(fixed) - days(old)) < 1e-9 && days(alerting) === days(fixed), `13 남은 일수는 고치기 전 화면 계산·알림 판정과 같다(${days(fixed)?.toFixed(2)}일)`);
    eq(alerting.database_history.length, 0, "13 알림 판정은 그래프 점을 읽지 않는다(그대로)");
    fx.sqlite.close();
  }
} finally {
  globalThis.fetch = realFetch;
  console.error = realError;
}
done();
