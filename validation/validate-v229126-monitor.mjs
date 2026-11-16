// V22.9.126 관제 1.8.0 검사 — FC-28(화면 새로 읽기·7일 이력 읽기)·FC-29(알림 기록을 보내기 전에 쓰기·끊긴 실행·모든 채널 실패·
// 관제 몫 CPU 초과)와 작은 것들. 장면마다 고친 동작과 고치기 전 결함을 함께 본다.
//   1. FC-29 보내는 순간 D1 에 이번 메일이 ‘보내는 중’(attempt)으로 이미 있고 확정 칸은 비어 있다(고치기 전: 보낸 뒤에야 기록).
//   2. FC-29 보내기 앞에서 끊긴 실행 → 15분 뒤 정확히 한 번 보낸다. 그동안 화면에 ‘알림 발송 미확인’ 이 보인다.
//   3. FC-29 보낸 뒤 끊긴 실행 → 15분 뒤 많아야 한 번 더, 확정되면 멈춘다. 실행마다 끊기면 15·30·60·120…분으로 늘려 그 등급의 다시
//      보내는 간격(긴급 6시간·주의 24시간)에서 멈춘다(고치기 전: 5분마다, 2차: 60분마다 끝없이). 보내기 앞에서 끊겨도 같고, 끊김이 멎으면
//      한 번 보낸다. 오른 등급의 메일이 끊긴 뒤 내려오면 확정된 주의를 간격 안에 다시 보내지 않는다(3차).
//   4. FC-29 모든 채널 실패 → 15분 간격으로 다시 시도하고 그동안 화면에 실패가 남는다(고치기 전: 5분마다). 그 메일에 없던 경고·더 높은
//      등급은 기다리지 않는다(2차). 실패가 이어지는 동안 깜빡이는 경고는 새 경고로 치지 않는다(3차).
//   5. FC-29 해소 메일도 2·3 과 같다. 확정 안 된 긴급 경고가 해소되면 ‘[해소] …(앞선 경고 메일 발송 미확인)’ 한 통을 보낸다(3차; 2차는
//      보내지 않음 — 주의는 지금도 보내지 않음). 확정 안 된 해소 뒤 다시 생긴 경고에 ‘해소 뒤 다시 생김’ 을 붙이지 않는다(2차). 출처
//      수집이 멈춰 확인할 수 없는 해소 시도는 24시간 뒤 버린다(3차).
//   6. FC-29 관제 몫 CPU 초과(계정 전체 − 앱)를 주의로 알리고 0 이 되면 해소한다. 앱 행이 비거나 창이 전날이면 판단하지 않는다(2차).
//   7. 한 채널만 닿은 발송의 실패 채널이 ‘확인되지 않은 항목’ 에 다음 발송까지, 길어야 24시간 남는다(고치기 전: 숨음).
//   8. collect 의 D1 실패(매시 정리·실패 기록 쓰기)가 그 실행의 경고 발송·이용 현황을 막지 않는다(고치기 전: 둘 다 빠짐).
//   9. UTC 0시 표본 정리를 놓치면 다음 매시 실행이 메우고, 한도(2000행)를 채우면 다음 매시 실행이 이어 지운다(고치기 전: 다음 0시까지 밀림).
//      끝 표시는 지운 행이 한도보다 적을 때만 지운 뒤에 쓴다(3차: 그 사이 끊기거나 실패해도 밀리지 않음).
//  14. FC-29 보내기 전 기록 쓰기가 실패해도 메일은 나가고, 보낸 뒤에도 못 쓰면 delivery_unrecorded 로 남는다(2차).
//  10. 한도 카드의 값이 없으면 ‘확인 불가’ 에 단위를 붙이지 않는다(고치기 전: ‘확인 불가 회/행’).
//  11. 요청 예측만으로는 실제 사용이 한도의 50% 이상일 때만 ‘전환 검토’ 다(고치기 전: 사용 20% 에 저녁 첨두 한 시간으로 전환 검토).
//  12. FC-28 화면 새로 읽기 300초 — 관제 화면과 앱 /ops-monitor 가 같은 HTML 을 낸다(고치기 전: 60초).
//  13. FC-28 화면용 7일 이력은 그래프 점만 읽는다(48행 이하, 같은 48점·같은 남은 일수. 고치기 전: 2,016행).
// 고치기 전 장면은 monitoring/worker.mjs 원문에 아래 BEFORE 되돌림 변환을 걸고 deliverAlerts 를 1.7.0 원문(OLD_DELIVER)으로 바꾼 사본을
// data: URL 로 읽어 돌린다(네트워크 없음).
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
  ["/^delivery_(?:failed|unrecorded)\\b/", "/^delivery_failed\\b/", "delivery_unrecorded 코드"],
  [/  \/\/ 1\.8\.0\(V22\.9\.126\): 정리 문장이 실패해도[\s\S]*?monitor daily cleanup failed[^\n]*\n  \}\n\}/, OLD_CLEANUP, "매시·0시 정리 보호와 메우기"],
  ["prepare(`SELECT * FROM settings WHERE key IN ('plans','roundtrip','usage','cron')${alerting?\"\":\" OR key LIKE 'alert:%'\"}`)", "prepare(\"SELECT * FROM settings WHERE key IN ('plans','roundtrip','usage','cron')\")", "화면 범위 alert:* 읽기"],
  ["  const history=alerting?[]:await dashboardHistory(env,now);\n  const days=await alertGrowthDays(env,now,db.data?.database_bytes,dbCap);",
    "  const history=alerting?[]:(await env.MONITOR_DB.prepare(\"SELECT collected_at AS at,json_extract(payload,'$.database_bytes') AS value FROM samples WHERE source='database' AND bucket >= ? ORDER BY bucket LIMIT 3000\").bind(new Date(now-7*DAY).toISOString()).all()).results;\n  const days=alerting?await alertGrowthDays(env,now,db.data?.database_bytes,dbCap):daysToLimit(history,db.data?.database_bytes,dbCap);", "화면 7일 이력(FC-28)"],
  ["{fresh:cfFresh,forecast,forecastFrom:0.5}", "{fresh:cfFresh,forecast}", "요청 예측 50%"],
  [/  const monitorCpu=monitorCpuLimitErrors\(cf,now\);\n[^\n]*\n/, "", "관제 몫 CPU 경고"],
  [/  const partial=states\.alerts\?\.fresh[\s\S]*?시도\)`\);\n/, "", "일부 채널 실패·발송 미확인 항목"],
];
// 1.7.0(9c3fa818) monitoring/worker.mjs 의 deliverAlerts 원문. 고치기 전 장면은 이 함수로 돈다(작은 되돌림을 여럿 쌓지 않는다).
const OLD_DELIVER = [
  "export async function deliverAlerts(env,now=new Date()) {",
  "  const channels=[env.ALERT_EMAIL&&env.ALERT_TO?\"email\":null,env.ALERT_WEBHOOK_URL?\"webhook\":null].filter(Boolean);",
  "  if(!channels.length) throw new Error(\"not_connected\");",
  "  const result=await summary(env,now.getTime(),{alerting:true});",
  "  const at=now.getTime();const stamp=now.toISOString();",
  "  const time=value=>{ const parsed=Date.parse(value||\"\"); return Number.isFinite(parsed)?parsed:null; };",
  "  const active=result.alerts.filter(alert=>ALERT_RESEND_MS[alert.status]);",
  "  const rows=(await env.MONITOR_DB.prepare(\"SELECT key,value FROM settings WHERE key LIKE 'alert:%'\").all()).results;",
  "  const remembered=new Map(rows.map(row=>{ try { return [row.key,JSON.parse(row.value)]; } catch(_) { return [row.key,{}]; } }));",
  "  const due=[];const recovered=[];const statements=[];",
  "  const save=(key,record)=>statements.push(env.MONITOR_DB.prepare(\"INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value\").bind(key,JSON.stringify(record)));",
  "  for(const alert of active) {",
  "    const key=alertKey(alert.title);",
  "    const previous=remembered.get(key);",
  "    remembered.delete(key);",
  "    const sentAt=time(previous?.sent_at);",
  "    const recoveredAt=time(previous?.recovered_at);",
  "    // 마지막으로 보낸 메일이 '해소'였다면 운영자는 해소를 믿고 있다. 다시 생긴 것을 한 번 알린다.",
  "    const again=sentAt!==null&&recoveredAt!==null&&recoveredAt>=sentAt;",
  "    if(sentAt!==null&&!again&&at-sentAt<ALERT_RESEND_MS[alert.status]&&(ALERT_RANK[alert.status]||0)<=(ALERT_RANK[previous.status]||0)) {",
  "      // 간격 안: 보내지 않는다. 진행 중이던 해소 판정(연속 정상)만 처음으로 되돌린다.",
  "      if(previous.resolved_at||previous.ok) save(key,{...previous,resolved_at:null,ok:0,ok_since:null});",
  "      continue;",
  "    }",
  "    due.push(again?{...alert,again:true}:alert);",
  "    save(key,{title:alert.title,status:alert.status,sent_at:stamp,resolved_at:null,ok:0,ok_since:null,recovered_at:previous?.recovered_at||null});",
  "  }",
  "  for(const [key,previous] of remembered) {",
  "    let record=previous;",
  "    let resolvedNow=false;",
  "    if(!record?.resolved_at) {",
  "      // 사라진 경고도 같은 출처의 새 정상 측정이 있어야 해소 쪽으로 센다(수집 오류·지연은 세지 않고 되돌리지도 않는다).",
  "      if(!alertRecoveryConfirmed(result,record?.title)) continue;",
  "      const ok=(Number(record.ok)||0)+1;",
  "      const okSince=time(record.ok_since)??at;",
  "      if(ok<ALERT_RECOVERY_CHECKS||at-okSince<ALERT_RECOVERY_MIN_MS) { save(key,{...record,ok,ok_since:new Date(okSince).toISOString()}); continue; }",
  "      record={...record,ok:0,ok_since:null,resolved_at:stamp};",
  "      resolvedNow=true;",
  "    }",
  "    const sentAt=time(record.sent_at);",
  "    const recoveredAt=time(record.recovered_at);",
  "    const owed=record.status===\"critical\"&&sentAt!==null&&!(recoveredAt!==null&&recoveredAt>=sentAt);",
  "    if(owed&&(recoveredAt===null||at-recoveredAt>=ALERT_RESEND_MS.critical)&&(resolvedNow||alertRecoveryConfirmed(result,record.title))) {",
  "      recovered.push(record);",
  "      save(key,{...record,recovered_at:stamp});",
  "    } else if(!owed&&at-Math.max(sentAt??0,recoveredAt??0)>=(ALERT_RESEND_MS[record.status]||ALERT_RESEND_MS.warning)) statements.push(env.MONITOR_DB.prepare(\"DELETE FROM settings WHERE key=?\").bind(key));",
  "    else if(resolvedNow) save(key,record);",
  "  }",
  "  if(!due.length&&!recovered.length) { if(statements.length) await env.MONITOR_DB.batch(statements); return {channels,sent:0,recovered:0,active:active.length,status:result.status}; }",
  "  const counts=[\"critical\",\"upgrade\",\"warning\"].map(status=>`${ALERT_LABELS[status]} ${due.filter(a=>a.status===status).length}`).join(\" · \");",
  "  const subject=`[말해가계부 관제] ${due.length?counts:\"해소 \"+recovered.length}`;",
  "  const text=renderAlertText(result,due,recovered,now,env.APP_ORIGIN||\"\");",
  "  const delivered=[];const failures=[];",
  "  const channelFailed=(channel,error)=>{ const code=failureCode(error); failures.push(`${channel}:${code}`); console.error(`monitor alert ${channel} failed: ${code} — ${String(error?.message||error).replace(/\\s+/g,\" \").slice(0,200)}`); };",
  "  if(channels.includes(\"email\")) { try { await sendAlertEmail(env,subject,text,now); delivered.push(\"email\"); } catch(error) { channelFailed(\"email\",error); } }",
  "  if(channels.includes(\"webhook\")) { try { const response=await fetch(env.ALERT_WEBHOOK_URL,{method:\"POST\",headers:{\"content-type\":\"application/json\"},body:JSON.stringify({text:`${subject}\\n${text}`}),signal:AbortSignal.timeout(8000)}); if(!response.ok) throw new Error(`http_${response.status}`); delivered.push(\"webhook\"); } catch(error) { channelFailed(\"webhook\",error); } }",
  "  if(!delivered.length) throw new Error(`delivery_failed ${failures.join(\" \")}`);",
  "  if(statements.length) await env.MONITOR_DB.batch(statements);",
  "  return {channels,delivered,failures,sent:due.length,recovered:recovered.length,active:active.length,status:result.status,titles:due.map(alert=>alert.title).slice(0,10)};",
  "}",
].join("\n");
const swapDeliver = (text) => {
  const start = text.indexOf("export async function deliverAlerts(env,now=new Date()) {"), end = text.indexOf("\n}\n\nexport default {", start);
  assert.ok(start > 0 && end > start && text.indexOf("export async function deliverAlerts(", start + 1) < 0, "deliverAlerts 를 1.7.0 원문으로 바꿀 자리를 찾는다");
  return text.slice(0, start) + OLD_DELIVER + text.slice(end + 2);
};
const beforeSource = swapDeliver(BEFORE.reduce((text, [from, to, label]) => once(text, from, to, label), readFileSync(new URL("../monitoring/worker.mjs", import.meta.url), "utf8")));
const before = await import("data:text/javascript;charset=utf-8," + encodeURIComponent(beforeSource));
ok(typeof before.deliverAlerts === "function" && typeof before.default?.scheduled === "function", `고치기 전 사본을 만든다(되돌림 변환 ${BEFORE.length}개 + deliverAlerts 1.7.0 원문)`);

// ── D1·바깥 요청 흉내 ────────────────────────────────────────────────────────────
// test-d1.mjs 와 같은 node:sqlite D1. fail(sql) 이 참인 문장은 D1 오류로 던지고(batch 는 통째로), failSingle(sql) 은 단독 run() 문장만
// 던진다(3차: 정리 끝 표시 쓰기). counting 이면 samples 를 읽는 문장이 지나간 행 수를 센다(verify/F rows-read 와 같은 방법).
function monitorDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8"));
  let ticks = 0;
  sqlite.function("v126_tick", { deterministic: false }, () => { ticks += 1; return 1; });
  const fx = { sqlite, fail: null, failSingle: null, counting: false, visits: [], ran: [] };
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
        async run() { if (fx.failSingle?.(sql)) throw new Error("D1_ERROR: simulated failure"); return api.runNow(); },
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
const subjectOf = (message) => Buffer.from((/Subject: =\?UTF-8\?B\?([^?]+)\?=/.exec(String(message.raw)) || ["", ""])[1], "base64").toString("utf8");
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
    const pendingView = await mod.summary(monitorEnv(fx), T0 + MIN);
    const sends = [];
    for (let i = 1; i <= 12; i += 1) {
      const t = T0 + i * 5 * MIN;
      setState(fx, "uptime", t, uptime(t, false));
      const count = box.mails.length;
      if (everyRunKilled) { const again = killedSend(box, delivered); await deliver(mod, fx, t, { ALERT_EMAIL: again.binding }, again); }
      else await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
      sends.push(box.mails.length - count);
    }
    const finalView = await mod.summary(monitorEnv(fx), T0 + 61 * MIN);
    return { first, atSend, pendingView, finalView, sends: sends.join(""), mails: box.mails, record: recordOf(fx, TITLE), fx };
  }
  const pendingLine = (t, recovery = false) => `알림 발송 미확인(${recovery ? "[해소] " : ""}${TITLE} · ${kst(t)} 시도)`;
  {
    const cut = await killScene(after, false);
    eq(cut.first, "killed", "2 첫 실행은 보내는 자리에서 끊긴다");
    ok(cut.atSend?.sent_at === null && cut.atSend.status === null && cut.atSend.attempt?.kind === "alert" && cut.atSend.attempt.at === iso(T0) && cut.atSend.attempt.n === 1 && cut.atSend.attempt.status === "critical", `1 보내는 순간 D1 에 이번 경고가 ‘보내는 중’(attempt)으로 이미 있고, 닿은 메일만 뜻하는 sent_at·status 는 비어 있다: ${JSON.stringify(cut.atSend)}`);
    const old = await killScene(before, false);
    eq(old.atSend, null, "1 고치기 전: 보내는 순간 D1 에 기록이 없다(보낸 뒤에야 썼다)");
    ok(cut.pendingView.unknown.includes(pendingLine(T0)) && !old.pendingView.unknown.some((item) => item.startsWith("알림 발송 미확인")), `2 확정되기 전에는 화면의 확인되지 않은 항목에 ‘${pendingLine(T0)}’ 이 보인다(고치기 전: 아무 표시 없음)`);
    eq(cut.sends, "001000000000", "2 보내기 앞에서 끊긴 뒤: 5분·10분 실행은 보내지 않고 15분 실행이 정확히 한 번 보낸 뒤 1시간 동안 더 보내지 않는다");
    ok(cut.mails.length === 1 && bodyOf(cut.mails[0]).includes(`[긴급] ${TITLE}`), "2 그 한 번이 끊긴 경고 메일이다(영영 안 보내지 않는다)");
    ok(cut.record?.sent_at === iso(T0 + 15 * MIN) && cut.record.status === "critical" && !("attempt" in cut.record), `2 닿은 뒤에는 확정 값이 적히고 ‘보내는 중’ 표시가 지워진다: ${JSON.stringify(cut.record)}`);
    ok(!cut.finalView.unknown.some((item) => item.startsWith("알림 발송 미확인")), "2 확정된 뒤에는 ‘알림 발송 미확인’ 이 사라진다");
  }
  {
    const cut = await killScene(after, true);
    eq(cut.sends, "001000000000", "3 보낸 뒤 끊긴 뒤: 5분·10분 실행은 다시 보내지 않고, 15분 실행이 많아야 한 번 더 보낸 뒤 멈춘다(끊긴 실행이 보냈는지 알 수 없어 한 번은 다시 보낸다)");
    eq(cut.mails.length, 2, "3 메일은 끊긴 실행의 것과 다시 보낸 것 둘뿐이다");
    const old = await killScene(before, true);
    eq(old.sends, "100000000000", "3 고치기 전: 보낸 뒤 끊기면 기록이 없어 바로 다음 5분 실행이 같은 메일을 또 보냈다");
    const always = await killScene(after, true, { everyRunKilled: true });
    eq(always.sends, "001000001000", "3 보내는 실행마다 보낸 뒤 끊기면 확정될 때까지 15분·30분(그 뒤 60분) 간격으로만 다시 보낸다(끊긴 시도마다 많아야 1통)");
    ok(always.record?.attempt?.n === 3 && always.record.sent_at === null, `3 확정되지 않는 동안 기록은 몇 번째 시도인지만 늘고 닿은 것으로 적지 않는다: ${JSON.stringify(always.record)}`);
    const oldAlways = await killScene(before, true, { everyRunKilled: true });
    eq(oldAlways.sends, "111111111111", "3 고치기 전: 보내는 실행마다 끊기면 5분마다 같은 메일을 보냈다(1시간 12통)");
  }
  {
    // 2차 검토 P2: 실행마다 보내기 앞에서 끊기면(관제 CPU 초과가 같은 자리에서 되풀이) 7시간 동안 시도가 언제 있었는지, 끊김이 멎은 뒤 몇 통 가는지 본다.
    const scene = async (mod) => {
      const fx = monitorDb(), box = mailbox();
      const tries = [];
      for (let i = 0; i <= 84; i += 1) {
        const t = T0 + i * 5 * MIN;
        setState(fx, "uptime", t, uptime(t, false));
        let reached = false;
        const kill = killedSend(box, false);
        kill.at.then(() => { reached = true; });
        await deliver(mod, fx, t, { ALERT_EMAIL: kill.binding }, kill);
        if (reached) tries.push(i * 5);
      }
      const view = await mod.summary(monitorEnv(fx), T0 + 421 * MIN);
      const sends = [];
      for (let i = 85; i <= 96; i += 1) {
        const t = T0 + i * 5 * MIN;
        setState(fx, "uptime", t, uptime(t, false));
        const count = box.mails.length;
        await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
        sends.push(box.mails.length - count);
      }
      return { tries, view, sends: sends.join(""), mails: box.mails.length };
    };
    const fixed = await scene(after);
    // 3차 검토 4: 2차의 ‘0,15,45,105,165,…,405’(60분마다 끝없이)는 의도한 변경이다 — 간격을 두 배씩 늘려 그 등급의 다시 보내는 간격에서 멈춘다.
    eq(fixed.tries.join(","), "0,15,45,105,225", "3 실행마다 보내기 앞에서 끊기면 15·30·60·120분으로 간격을 두 배씩 늘려 다시 시도한다(3차; 2차는 60분마다)");
    ok(fixed.view.unknown.includes(pendingLine(T0 + 225 * MIN)), "3 그동안 화면에는 마지막 시도 시각과 함께 ‘알림 발송 미확인’ 이 보인다");
    ok(fixed.sends === "000000001000" && fixed.mails === 1, `3 끊김이 멎으면 다음 시도(465분)에 정확히 한 통 가고 확정된다: ${fixed.sends}`);
    const old = await scene(before);
    ok(old.tries.length === 85 && old.sends === "100000000000", `3 고치기 전: 끊기는 동안 5분마다 보내러 갔고(85번) 멎은 첫 실행에 바로 보냈다`);
  }
  {
    // 3차 검토 4: 보내는 실행마다 보낸 뒤 끊기는 하루(최악) — 시도 시각(=나간 메일)이 긴급·주의 모두 그 등급의 다시 보내는 간격 앞에서 멈춘다.
    const WORKERS = "Workers 일간 요청";
    const day = async (mod, status) => {
      const fx = monitorDb(), box = mailbox();
      const tries = [];
      for (let i = 0; i <= 288; i += 1) {
        const t = T0 + i * 5 * MIN;
        setState(fx, "uptime", t, uptime(t, status !== "critical"));
        if (status === "warning") setState(fx, "cloudflare", t, cloudflare(t, { today: 72000, app: 70000 }));
        let reached = false;
        const kill = killedSend(box, true);
        kill.at.then(() => { reached = true; });
        await deliver(mod, fx, t, { ALERT_EMAIL: kill.binding }, kill);
        if (reached) tries.push(i * 5);
      }
      return { tries: tries.join(","), mails: box.mails.length, titles: new Set(box.mails.map(bodyOf).map((text) => (status === "critical" ? text.includes(`[긴급] ${TITLE}`) : text.includes(`[주의] ${WORKERS}`)))) };
    };
    const critical = await day(after, "critical");
    ok(critical.tries === "0,15,45,105,225,465,825,1185" && critical.mails === 8 && [...critical.titles].join() === "true", `3 긴급: 하루 동안 8통(중복 7통) — 간격이 6시간에 닿으면 6시간마다(하루 4통, 확정된 긴급을 다시 보내는 간격과 같다): ${critical.tries}`);
    const warning = await day(after, "warning");
    ok(warning.tries === "0,15,45,105,225,465,945" && warning.mails === 7 && [...warning.titles].join() === "true", `3 주의: 하루 동안 7통(중복 6통) — 그 뒤 간격은 24시간에서 멈춘다(하루 1통): ${warning.tries}`);
    // 간격이 등급의 다시 보내는 간격에서 멈추는지: 열두 번째 시도(15분×2^11 이면 21일)를 그 간격 5분 앞과 그 간격에 둔다.
    const capped = async (mod, status, cap) => {
      const fx = monitorDb(), box = mailbox();
      const seed = (t) => { setState(fx, "uptime", t, uptime(t, status !== "critical")); if (status === "warning") setState(fx, "cloudflare", t, cloudflare(t, { today: 72000, app: 70000 })); };
      seed(T0);
      const first = killedSend(box, true);
      await deliver(mod, fx, T0, { ALERT_EMAIL: first.binding }, first);
      const t = T0 + 2 * DAY;
      fx.sqlite.prepare("UPDATE settings SET value=json_set(value,'$.attempt.n',12,'$.attempt.at',?) WHERE key LIKE 'alert:%' AND key<>'alert:hold'").run(iso(t - cap + 5 * MIN));
      const sends = [];
      for (const offset of [0, 5]) { seed(t + offset * MIN); const count = box.mails.length; await deliver(mod, fx, t + offset * MIN, { ALERT_EMAIL: box.ok }); sends.push(box.mails.length - count); }
      return sends.join("");
    };
    eq(await capped(after, "critical", 6 * HOUR), "01", "3 긴급의 열두 번째 시도 뒤 간격은 6시간이다(5시간 55분에는 보내지 않고 6시간에 보낸다)");
    eq(await capped(after, "warning", DAY), "01", "3 주의의 열두 번째 시도 뒤 간격은 24시간이다(23시간 55분에는 보내지 않고 24시간에 보낸다)");
  }
  {
    // 3차 검토 6: 주의가 확정된 뒤 같은 경고가 긴급으로 올라 그 메일이 끊기고 다시 주의로 내려오면, 이미 받은 주의를 24시간 안에 다시 보내지 않는다.
    const WORKERS = "Workers 일간 요청";
    const rankDown = async (mod, delivered) => {
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, true));
      setState(fx, "cloudflare", T0, cloudflare(T0, { today: 72000, app: 70000 }));
      await deliver(mod, fx, T0, { ALERT_EMAIL: box.ok });
      const U = T0 + HOUR;
      setState(fx, "uptime", U, uptime(U, true));
      setState(fx, "cloudflare", U, cloudflare(U, { today: 96000, app: 90000 }));
      const kill = killedSend(box, delivered);
      await deliver(mod, fx, U, { ALERT_EMAIL: kill.binding }, kill);
      const sends = [];
      for (let i = 1; i <= 12; i += 1) {
        const t = U + i * 5 * MIN;
        setState(fx, "uptime", t, uptime(t, true));
        setState(fx, "cloudflare", t, cloudflare(t, { today: 72000, app: 70000 }));
        const count = box.mails.length;
        await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
        sends.push(box.mails.length - count);
      }
      return { sends: sends.join(""), record: recordOf(fx, WORKERS), view: await mod.summary(monitorEnv(fx), U + 61 * MIN) };
    };
    for (const delivered of [false, true]) {
      const fixed = await rankDown(after, delivered);
      ok(fixed.sends === "000000000000" && fixed.record?.status === "warning" && fixed.record.sent_at === iso(T0) && !("attempt" in fixed.record) && !fixed.view.unknown.some((item) => item.startsWith("알림 발송 미확인")), `3 오른 등급(긴급) 메일이 ${delivered ? "보낸 뒤" : "보내기 앞에서"} 끊기고 주의로 내려오면 그 시도를 버리고 확정된 주의(T0)를 24시간 안에 다시 보내지 않는다: ${fixed.sends} ${JSON.stringify(fixed.record)}`);
    }
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
    ok(recordOf(failed.fx, TITLE) === null && holdOf(failed.fx)?.at === iso(T0 + 30 * MIN) && holdOf(failed.fx)?.codes === "email:E_SENDER_NOT_VERIFIED" && Object.values(holdOf(failed.fx)?.ranks || {}).join() === "3", `4 실패한 경고 기록은 보내기 전으로 되돌리고(없던 기록은 지움) 실패 시각·실은 경고의 등급만 alert:hold 에 남는다: ${JSON.stringify(holdOf(failed.fx))}`);
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
  {
    // 2차 검토 P3: 15분 기다림은 실패한 그 메일만 늦춘다. 그 메일에 없던 경고·오른 등급은 기다리지 않는다(등급이 오르면 바로 보내는 규칙이 앞선다).
    const failing = { async send() { throw Object.assign(new Error("sender domain is not verified"), { code: "E_SENDER_NOT_VERIFIED" }); } };
    const WORKERS = "Workers 일간 요청";
    const holdScene = async (next) => {
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, true));
      setState(fx, "cloudflare", T0, cloudflare(T0, { today: 72000, app: 70000 }));
      await deliver(after, fx, T0, { ALERT_EMAIL: failing });
      const sends = [];
      for (const offset of [5, 10]) {
        const t = T0 + offset * MIN;
        next(fx, t);
        const count = box.mails.length;
        await deliver(after, fx, t, { ALERT_EMAIL: box.ok });
        sends.push(box.mails.length - count);
      }
      return { sends: sends.join(""), bodies: box.mails.map(bodyOf), hold: holdOf(fx) };
    };
    const same = await holdScene((fx, t) => { setState(fx, "uptime", t, uptime(t, true)); setState(fx, "cloudflare", t, cloudflare(t, { today: 72000, app: 70000 })); });
    ok(same.sends === "00" && same.hold !== null, `4 실패한 메일과 같은 주의 경고뿐이면 15분 동안 다시 보내지 않는다: ${same.sends}`);
    const fresh = await holdScene((fx, t) => { setState(fx, "uptime", t, uptime(t, false)); setState(fx, "cloudflare", t, cloudflare(t, { today: 72000, app: 70000 })); });
    ok(fresh.sends === "10" && fresh.bodies[0].includes(`[긴급] ${TITLE}`) && fresh.bodies[0].includes(`[주의] ${WORKERS}`) && fresh.hold === null, `4 그 메일에 없던 긴급 경고가 5분 뒤 생기면 기다리지 않고 기다리던 주의 경고와 함께 보낸다: ${fresh.sends}`);
    const raised = await holdScene((fx, t) => { setState(fx, "uptime", t, uptime(t, true)); setState(fx, "cloudflare", t, cloudflare(t, { today: 96000, app: 90000 })); });
    ok(raised.sends === "10" && raised.bodies[0].includes(`[긴급] ${WORKERS}`) && raised.hold === null, `4 같은 경고가 주의에서 긴급으로 오르면 기다리지 않고 보낸다: ${raised.sends}`);
    // 3차 검토 2: 채널이 계속 실패하는 30분 동안 경고가 5분마다 켜졌다 꺼지면, 실패가 이어지는 동안 앞선 hold 의 등급과 합쳐 새 경고로 치지 않는다.
    const flicker = async (mod, steady) => {
      const fx = monitorDb();
      let attempts = 0;
      const always = { async send() { attempts += 1; throw Object.assign(new Error("sender domain is not verified"), { code: "E_SENDER_NOT_VERIFIED" }); } };
      const tries = [];
      for (let i = 0; i <= 6; i += 1) {
        const t = T0 + i * 5 * MIN;
        setState(fx, "uptime", t, uptime(t, i % 2 === 1));
        setState(fx, "cloudflare", t, steady || i % 2 === 1 ? cloudflare(t, { today: 72000, app: 70000 }) : cloudflare(t));
        const count = attempts;
        await deliver(mod, fx, t, { ALERT_EMAIL: always });
        tries.push(attempts - count);
      }
      return { tries: tries.join(""), ranks: Object.values(holdOf(fx)?.ranks || {}).sort().join() };
    };
    const steady = await flicker(after, true), alternating = await flicker(after, false);
    ok(steady.tries === "1001001" && steady.ranks === "1,3", `4 주의는 그대로이고 긴급이 5분마다 깜빡여도 15분 간격으로만 시도한다(2차: 1001100): ${steady.tries} · hold 등급 ${steady.ranks}`);
    ok(alternating.tries === "1100100" && alternating.ranks === "1,3", `4 긴급과 주의가 5분마다 번갈아 켜져도 15분 기다림이 이어진다(2차: 1111111 — 1.7.0 과 같았다): ${alternating.tries} · hold 등급 ${alternating.ranks}`);
    eq((await flicker(before, false)).tries, "1111111", "4 고치기 전: 5분마다 시도했다");
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
    const pendingView = await mod.summary(monitorEnv(fx), third + MIN);
    const sends = [];
    for (let i = 1; i <= 10; i += 1) {
      const t = third + i * 5 * MIN;
      setState(fx, "uptime", t, uptime(t, true));
      const count = box.mails.length;
      await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
      sends.push(box.mails.length - count);
    }
    return { first, atSend, pendingView, third, sends: sends.join(""), recoveries: box.mails.filter((m) => bodyOf(m).includes(`[해소] ${TITLE}`)).length, record: recordOf(fx, TITLE) };
  }
  {
    const cut = await recoveryScene(after, false);
    ok(cut.first === "killed" && cut.atSend?.attempt?.kind === "recovery" && cut.atSend.attempt.at === iso(cut.third) && cut.atSend.recovered_at === null && cut.atSend.resolved_at === iso(cut.third), `5 해소 메일도 보내기 전에 ‘보내는 중’ 을 쓰고, 닿은 해소만 뜻하는 recovered_at 은 비워 둔다: ${JSON.stringify(cut.atSend)}`);
    ok(cut.pendingView.unknown.includes(pendingLine(cut.third, true)), `5 확정되기 전에는 화면에 ‘${pendingLine(cut.third, true)}’ 이 보인다`);
    ok(cut.sends === "0010000000" && cut.recoveries === 1, `5 해소 메일을 보내기 앞에서 끊기면 15분 뒤 한 번 보낸다(${cut.sends}, 해소 ${cut.recoveries}통)`);
    ok(cut.record?.recovered_at === iso(cut.third + 15 * MIN) && !("attempt" in cut.record), "5 닿은 해소 기록에는 표시가 없다");
    const sent = await recoveryScene(after, true);
    ok(sent.sends === "0010000000" && sent.recoveries === 2, `5 해소 메일을 보낸 뒤 끊기면 15분 뒤 많아야 한 번 더 보내고 멈춘다(${sent.sends}, 해소 ${sent.recoveries}통)`);
    const old = await recoveryScene(before, true);
    ok(old.sends.startsWith("1") && old.recoveries === 2, `5 고치기 전: 해소 메일을 보낸 뒤 끊기면 바로 다음 5분 실행이 또 보냈다(${old.sends})`);
  }
  {
    // 3차 검토 3: 확정 안 된 긴급 경고가 다시 보내기 전에 해소되면, 그 메일은 닿았을 수 있으므로(보낸 뒤 끊김) ‘[해소]’ 를 한 통 보내되
    // 앞선 경고 메일이 확인되지 않았다고 적는다(2차는 조용히 버려 해소 없는 [긴급] 만 남았다). 보내기 앞 끊김과 구별할 수 없어 둘 다 같다.
    const SUFFIX = " (앞선 경고 메일 발송 미확인)", TAIL = " · 앞선 경고 메일은 발송이 확인되지 않았습니다", NOTE = `[해소] ${TITLE}${TAIL}`;
    const unsent = async (mod, delivered, failingRuns = 0) => {
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, false));
      const kill = killedSend(box, delivered);
      await deliver(mod, fx, T0, { ALERT_EMAIL: kill.binding }, kill);
      const sends = [];
      for (let i = 1; i <= 8; i += 1) { const t = T0 + i * 5 * MIN; setState(fx, "uptime", t, uptime(t, i > failingRuns)); const count = box.mails.length; await deliver(mod, fx, t, { ALERT_EMAIL: box.ok }); sends.push(box.mails.length - count); }
      return { sends: sends.join(""), mails: box.mails, record: recordOf(fx, TITLE), view: await mod.summary(monitorEnv(fx), T0 + 41 * MIN) };
    };
    const flagged = (scene, at, count) => scene.mails.length === count && subjectOf(scene.mails.at(-1)) === `[말해가계부 관제] 해소 1${SUFFIX}` && bodyOf(scene.mails.at(-1)).includes(NOTE) && scene.record?.recovered_at === iso(at) && !("attempt" in scene.record) && !("unconfirmed" in scene.record) && !scene.view.unknown.some((item) => item.startsWith("알림 발송 미확인"));
    for (const [label, failingRuns, expected] of [["5·10·15분이 정상", 0, "00100000"], ["5·10분까지 실패하고 15·20·25분이 정상", 2, "00001000"]]) {
      const fixed = await unsent(after, true, failingRuns);
      const resolvedAt = T0 + (failingRuns + 3) * 5 * MIN;
      ok(fixed.sends === expected && flagged(fixed, resolvedAt, 2), `5 보낸 뒤 끊긴 긴급 경고가 다시 보내기 전에 해소되면(${label}) ‘[말해가계부 관제] 해소 1${SUFFIX}’ 한 통이 가고 기록·‘발송 미확인’ 이 정리된다: ${fixed.sends} ${fixed.mails.map(subjectOf).join(" | ")}`);
    }
    const oldActive = await unsent(before, true, 2);
    ok(oldActive.mails.length === 3 && bodyOf(oldActive.mails[2]).includes(`[해소] ${TITLE}`), `5 고치기 전(1.7.0): 경고가 5분 뒤에도 남아 있으면 바로 다시 보내 확정하고 해소 때 ‘[해소]’ 를 보냈다(메일 ${oldActive.mails.length}통 — 2차는 [긴급] 한 통뿐이었다)`);
    const fixed = await unsent(after, false);
    ok(flagged(fixed, T0 + 15 * MIN, 1), `5 보내기 앞에서 끊겨도 같다(받지 못한 경고의 해소일 수 있다고 적는다 — 메일은 그 ‘[해소]’ 한 통): ${fixed.mails.map(subjectOf).join(" | ")}`);
    eq((await unsent(before, false)).mails.length, 0, "5 1.7.0 은 보내기 앞에서 끊기고 바로 해소되면 메일이 없었다");
    {
      // 주의·전환 검토는 해소 메일이 없는 등급이라 예전처럼 조용히 버린다.
      const WORKERS = "Workers 일간 요청";
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, true));
      setState(fx, "cloudflare", T0, cloudflare(T0, { today: 72000, app: 70000 }));
      const kill = killedSend(box, true);
      await deliver(after, fx, T0, { ALERT_EMAIL: kill.binding }, kill);
      for (const offset of [5, 10, 15, 20]) { const t = T0 + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); setState(fx, "cloudflare", t, cloudflare(t)); await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); }
      ok(box.mails.length === 1 && recordOf(fx, WORKERS) === null, `5 보낸 뒤 끊긴 주의 경고가 해소되면 해소 메일 없이 기록을 지운다(메일 ${box.mails.length}통)`);
    }
    {
      // 그 ‘[해소]’ 메일마저 끊기면 다시 보낼 때도 같은 표시를 단다.
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, false));
      const kill = killedSend(box, true);
      await deliver(after, fx, T0, { ALERT_EMAIL: kill.binding }, kill);
      for (const offset of [5, 10]) { const t = T0 + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); }
      setState(fx, "uptime", T0 + 15 * MIN, uptime(T0 + 15 * MIN, true));
      const again = killedSend(box, false);
      await deliver(after, fx, T0 + 15 * MIN, { ALERT_EMAIL: again.binding }, again);
      const pending = await after.summary(monitorEnv(fx), T0 + 16 * MIN);
      for (const offset of [20, 25, 30]) { const t = T0 + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); }
      const line = bodyOf(box.mails.at(-1)).split("\n").find((text) => text.startsWith(`[해소] ${TITLE}`)) || "";
      ok(pending.unknown.includes(pendingLine(T0 + 15 * MIN, true)) && box.mails.length === 2 && subjectOf(box.mails[1]).endsWith(SUFFIX) && line === `[해소] ${TITLE} · ${kst(T0 + 15 * MIN)}부터 정상${TAIL}` && recordOf(fx, TITLE)?.recovered_at === iso(T0 + 30 * MIN), `5 끊긴 ‘[해소]’ 를 15분 뒤 다시 보낼 때도 ‘${SUFFIX.trim()}’ 와 본문 표시를 단다: ${box.mails.map(subjectOf).join(" | ")} · ${line}`);
    }
    // 2차 검토 P3: 해소 메일이 확정되기 전에 경고가 다시 생기면 다음 실행이 바로 알리되 ‘해소 뒤 다시 생김’ 은 붙이지 않는다(해소를 받았는지 모른다).
    const recur = async (mod, delivered) => {
      const fx = monitorDb(), box = mailbox();
      setState(fx, "uptime", T0, uptime(T0, false));
      await deliver(mod, fx, T0, { ALERT_EMAIL: box.ok });
      const R = T0 + 2 * HOUR;
      for (const offset of [0, 5]) { const t = R + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); await deliver(mod, fx, t, { ALERT_EMAIL: box.ok }); }
      const third = R + 10 * MIN;
      setState(fx, "uptime", third, uptime(third, true));
      const kill = killedSend(box, delivered);
      await deliver(mod, fx, third, { ALERT_EMAIL: kill.binding }, kill);
      const count = box.mails.length, sends = [];
      for (let i = 1; i <= 12; i += 1) { const t = third + i * 5 * MIN; setState(fx, "uptime", t, uptime(t, false)); const c = box.mails.length; await deliver(mod, fx, t, { ALERT_EMAIL: box.ok }); sends.push(box.mails.length - c); }
      return { sends: sends.join(""), later: box.mails.slice(count).map(bodyOf) };
    };
    for (const delivered of [false, true]) {
      const fixed = await recur(after, delivered);
      ok(fixed.sends === "100000000000" && fixed.later.length === 1 && fixed.later[0].includes(`[긴급] ${TITLE}`) && !fixed.later[0].includes("해소 뒤 다시 생김"), `5 해소 메일을 ${delivered ? "보낸 뒤" : "보내기 앞에서"} 끊긴 뒤 경고가 다시 생기면 다음 실행이 한 번 알리고 ‘해소 뒤 다시 생김’ 은 붙이지 않는다: ${fixed.sends}`);
    }
    const old = await recur(before, true);
    eq(old.sends, "000000000000", "5 고치기 전: 해소 메일을 보낸 뒤 끊기고 경고가 다시 생기면 1시간 동안 알리지 않았다(운영자는 해소만 받았다)");
  }
  {
    // 3차 검토 4: 해소 메일이 끊긴 뒤 그 출처 수집이 멈추면(해소를 다시 확인할 수 없음) 그 시도는 24시간 뒤 버린다. 해소를 알릴 몫은 남아
    // 출처가 다시 정상을 보이면 그때 보낸다.
    const fx = monitorDb(), box = mailbox();
    setState(fx, "uptime", T0, uptime(T0, false));
    await deliver(after, fx, T0, { ALERT_EMAIL: box.ok });
    const R = T0 + HOUR;
    for (const offset of [0, 5]) { const t = R + offset * MIN; setState(fx, "uptime", t, uptime(t, true)); await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); }
    const third = R + 10 * MIN;
    setState(fx, "uptime", third, uptime(third, true));
    const kill = killedSend(box, false);
    await deliver(after, fx, third, { ALERT_EMAIL: kill.binding }, kill);
    const pendingAt = async (t) => (await after.summary(monitorEnv(fx), t)).unknown.includes(pendingLine(third, true));
    const seen = [];
    for (const t of [third + HOUR, third + 12 * HOUR, third + DAY - 5 * MIN, third + DAY]) { await deliver(after, fx, t, { ALERT_EMAIL: box.ok }); seen.push(await pendingAt(t + MIN)); }
    const kept = recordOf(fx, TITLE);
    ok(seen.join() === "true,true,true,false" && box.mails.length === 1 && kept?.resolved_at === iso(third) && kept.recovered_at === null && !("attempt" in kept), `5 출처 수집이 멈춘 해소 메일 시도는 24시간 동안만 ‘발송 미확인’ 으로 보이고 그 뒤 버린다(해소 몫은 남는다): ${seen.join()} ${JSON.stringify(kept)}`);
    const back = third + DAY + 5 * MIN;
    setState(fx, "uptime", back, uptime(back, true));
    await deliver(after, fx, back, { ALERT_EMAIL: box.ok });
    ok(box.mails.length === 2 && bodyOf(box.mails[1]).includes(`[해소] ${TITLE}`) && !bodyOf(box.mails[1]).includes("발송이 확인되지 않았습니다") && recordOf(fx, TITLE)?.recovered_at === iso(back), `5 출처가 다시 정상을 보이면 그때 ‘[해소]’ 를 보낸다(앞선 [긴급] 은 닿은 메일이라 표시 없음): 메일 ${box.mails.length}통`);
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
    // 2차 검토 P3: 앱 행이 비면(observed:false) 계정 전체를 관제 몫으로 세지 않고, UTC 0시 직후 실행의 창(전날)을 ‘오늘’ 로 쓰지 않는다.
    const monitorAlert = async (t) => (await after.summary(monitorEnv(fx), t, { alerting: true })).alerts.find((alert) => alert.title === title) || null;
    setState(fx, "cloudflare", T0, { ...cloudflare(T0, { todayCpu: 3 }), app: { requests: null, errors: null, subrequests: null, cpu_ms: null, cpu_limit_errors: null, resource_limit_errors: null, observed: false } });
    eq(await monitorAlert(T0), null, "6 앱 행이 비면 관제 몫을 판단하지 않는다(계정 전체 3건을 관제 몫으로 알리지 않는다)");
    const midnight = Date.parse("2026-11-17T00:02:00.000Z");
    setState(fx, "cloudflare", midnight, cloudflare(midnight, { todayCpu: 4, appCpu: 1 }));
    eq(await monitorAlert(midnight), null, "6 UTC 00:02 실행은 창이 전날(00:00~23:55)이라 그 건수를 ‘오늘’ 관제 몫으로 알리지 않는다");
    setState(fx, "cloudflare", midnight + 5 * MIN, cloudflare(midnight + 5 * MIN, { todayCpu: 4, appCpu: 1 }));
    ok((await monitorAlert(midnight + 5 * MIN))?.message.includes("3건"), "6 같은 날 창이 되면(00:07) 다시 관제 몫을 센다");
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
  {
    // 2차 검토 P3: 그 채널을 고친 뒤 보낼 경고가 없어도 실패 항목이 영영 남지 않게 24시간이 지나면 내린다.
    const fx = monitorDb();
    const hookEnv = { ALERT_EMAIL: mailbox().ok, ALERT_WEBHOOK_URL: "https://hooks.example/alert" };
    const payload = (failedAt) => ({ channels: ["email", "webhook"], sent: 0, recovered: 0, active: 0, status: "normal", failures: ["webhook:http_500"], failures_at: iso(failedAt) });
    const partialItems = async (t) => (await after.summary(monitorEnv(fx, hookEnv), t)).unknown.filter((item) => item.startsWith("알림 발송 일부"));
    setState(fx, "alerts", T0, payload(T0 - 23 * HOUR));
    eq((await partialItems(T0 + MIN)).join(), `알림 발송 일부 채널 실패(webhook:http_500 · ${kst(T0 - 23 * HOUR)} 발송)`, "7 실패한 지 24시간 안이면 보인다");
    setState(fx, "alerts", T0, payload(T0 - 25 * HOUR));
    eq((await partialItems(T0 + MIN)).length, 0, "7 실패한 지 24시간이 지나면 화면에서 내린다");
    setState(fx, "alerts", T0, payload(T0 - 23 * HOUR));
    setState(fx, "uptime", T0 + 2 * HOUR, uptime(T0 + 2 * HOUR, true));
    await deliver(after, fx, T0 + 2 * HOUR, hookEnv);
    const carried = JSON.parse(alertsState(fx)?.payload || "{}");
    ok(alertsState(fx)?.status === "ok" && carried.sent === 0 && !carried.failures, `7 조용한 실행도 24시간이 지난 실패 채널은 이어 적지 않는다: ${JSON.stringify(carried)}`);
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
    // 2차 검토 P3: 하루 넘게 밀려 한 번에 지우는 한도(2000행)를 채우면 그날 끝난 것으로 적지 않고 다음 매시 실행이 이어 지운다.
    const backlog = async (mod) => {
      const fx = monitorDb(), box = mailbox();
      const insert = fx.sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,'{}')");
      for (let i = 0; i < 3500; i += 1) insert.run("uptime", iso(D0 - 45 * DAY + i * 5 * MIN), iso(D0 - 45 * DAY + i * 5 * MIN));
      const stale = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM samples WHERE source='uptime' AND bucket < ?").get(iso(D0 - 30 * DAY)).n;
      const left = [];
      for (const t of [D0, D0 + HOUR, D0 + 2 * HOUR]) { await scheduledRun(mod, fx, t, box); left.push(stale()); }
      return { left: left.join(","), marker: fx.sqlite.prepare("SELECT value FROM settings WHERE key='samples_cleanup'").get()?.value || null };
    };
    const fixedBacklog = await backlog(after);
    ok(fixedBacklog.left === "1500,0,0" && fixedBacklog.marker === iso(D0 + HOUR), `9 밀린 3,500행: 0시가 2,000행을 지우고 01:00 매시 실행이 나머지를 이어 지운 뒤에야 끝난 것으로 적는다(${fixedBacklog.left} · ${fixedBacklog.marker})`);
    eq((await backlog(before)).left, "1500,1500,1500", "9 고치기 전: 한도를 채운 뒤 남은 행은 다음 0시까지 남았다");
    // 3차 검토 8: 0시 실행이 지운 뒤 다음 문장(2차: 끝 표시를 지우기, 3차: 끝 표시 쓰기)이 실패·끊겨도 남은 행이 다음 0시까지 밀리지 않는다.
    const markFails = async (mod) => {
      const fx = monitorDb(), box = mailbox();
      const insert = fx.sqlite.prepare("INSERT INTO samples(source,bucket,collected_at,payload) VALUES(?,?,?,'{}')");
      for (let i = 0; i < 3500; i += 1) insert.run("uptime", iso(D0 - 45 * DAY + i * 5 * MIN), iso(D0 - 45 * DAY + i * 5 * MIN));
      const stale = () => fx.sqlite.prepare("SELECT COUNT(*) AS n FROM samples WHERE source='uptime' AND bucket < ?").get(iso(D0 - 30 * DAY)).n;
      fx.failSingle = (sql) => sql.includes("samples_cleanup") && !sql.startsWith("SELECT");
      const left = [];
      for (const t of [D0, D0 + HOUR, D0 + 2 * HOUR]) { await scheduledRun(mod, fx, t, box); left.push(stale()); }
      return left.join(",");
    };
    eq(await markFails(after), "1500,0,0", "9 0시가 2,000행을 지운 뒤 끝 표시 문장이 실패해도 01:00 매시 실행이 나머지를 지운다(표시는 다 지운 뒤에만 쓴다)");
  }

  // ── 14. FC-29 보내기 전 기록 쓰기 실패 ─────────────────────────────────────────
  {
    // 2차 검토 P3: 보내기 전 쓰기가 실패해도 메일은 1.7.0 처럼 나간다. 보낸 뒤 쓰기가 되면 확정하고, 그마저 실패하면 delivery_unrecorded 로 남긴다.
    const writes = (sql) => sql.startsWith("INSERT INTO settings");
    const recordFails = async (mod, failing) => {
      const fx = monitorDb(), box = mailbox();
      let left = failing === "first" ? 1 : Infinity;
      const batch = fx.db.batch;
      fx.db.batch = async (statements) => { if (left > 0 && statements.some((statement) => writes(statement.sql))) { left -= 1; throw new Error("D1_ERROR: simulated batch failure"); } return batch(statements); };
      const sends = [];
      let firstRun = null;
      for (const offset of [0, 5, 10]) {
        const t = T0 + offset * MIN;
        if (offset === 5) left = 0;
        setState(fx, "uptime", t, uptime(t, false));
        const count = box.mails.length;
        await deliver(mod, fx, t, { ALERT_EMAIL: box.ok });
        sends.push(box.mails.length - count);
        if (offset === 0) firstRun = { state: alertsState(fx), view: await mod.summary(monitorEnv(fx), t + MIN), record: recordOf(fx, TITLE) };
      }
      return { sends: sends.join(""), ...firstRun };
    };
    const firstOnly = await recordFails(after, "first");
    ok(firstOnly.sends === "100" && firstOnly.state?.status === "ok" && firstOnly.record?.sent_at === iso(T0) && !("attempt" in firstOnly.record), `14 보내기 전 쓰기만 실패하면 메일은 나가고 보낸 뒤 확정 기록을 쓴다(다시 보내지 않는다): ${firstOnly.sends} ${JSON.stringify(firstOnly.record)}`);
    const always = await recordFails(after, "always");
    ok(always.state?.status === "error" && always.state.error_code === "delivery_unrecorded collection_failed sent:email" && always.record === null, `14 보낸 뒤 쓰기도 실패하면 알림 발송에 delivery_unrecorded 가 남는다: ${JSON.stringify(always.state)}`);
    ok(always.view.unknown.includes("알림 발송(delivery_unrecorded collection_failed sent:email)"), "14 화면의 확인되지 않은 항목에 ‘알림 발송(delivery_unrecorded …)’ 이 보인다");
    eq(always.sends, "110", "14 쓰기가 살아난 다음 실행은 기록이 없어 한 번 더 보내고(많아야 1통 중복) 그 뒤 확정되어 멈춘다");
    const old = await recordFails(before, "always");
    ok(old.sends === "110" && old.state?.error_code === "collection_failed", `14 1.7.0 도 쓰기가 실패하는 동안 메일은 보냈다(기록 실패는 collection_failed 로만 보였다): ${old.sends} ${old.state?.error_code}`);
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
