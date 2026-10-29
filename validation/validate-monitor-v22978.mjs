// V22.9.78 관제 토큰 확인 수집 기준 검사 (V77:N-19, 관제 1.2.1).
// N-19: 분석 토큰 만료 확인은 매시 0~4분에만 도는데, 화면은 5분 수집기와 같은 20분 기준으로 판정해
//       정상이어도 매시간 약 40분 '갱신 지연'으로 보였다(2026-10-25 다음 날 확인: 12:00:32 성공, 12:57 화면 갱신 지연).
// 관제 Worker 는 Node 22 의 SQLite(실제 SQL)로 돌린다. 네트워크는 쓰지 않는다(Node 22 이상 필요, test-d1 과 같음).
import { DatabaseSync } from "node:sqlite";
import { readFileSync } from "node:fs";
import monitor, { summary } from "../monitoring/worker.mjs";
import { MONITOR_VERSION } from "../monitoring/model.mjs";
import { counter } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.78 관제 토큰 확인 수집 기준 검사 통과");
const MIN = 60000, DAY = 86400000;
const SCHEMA = readFileSync(new URL("../monitoring/schema.sql", import.meta.url), "utf8");
const iso = (ms) => new Date(ms).toISOString();

function monitorDb() {
  const sqlite = new DatabaseSync(":memory:");
  sqlite.exec(SCHEMA);
  const db = {
    prepare(sql) {
      const statement = sqlite.prepare(sql);
      let args = [];
      const api = {
        bind(...values) { args = values; return api; },
        async all() { return { results: statement.all(...args) }; },
        async first() { return statement.get(...args) || null; },
        run() { const data = statement.run(...args); return { success: true, meta: { changes: data.changes } }; },
      };
      return api;
    },
    async batch(statements) { sqlite.exec("BEGIN"); try { const values = statements.map((s) => s.run()); sqlite.exec("COMMIT"); return values; } catch (error) { sqlite.exec("ROLLBACK"); throw error; } },
  };
  return { sqlite, db };
}

// 수집기 내용은 validate-monitor-v22977 의 정상 값과 같은 모양이다.
const counters = { requests: 0, errors: 0, subrequests: 1, cpu_ms: 1, cpu_limit_errors: 0, resource_limit_errors: 0, observed: true };
const PAYLOAD = {
  database: { database_bytes: 400 * 1024 ** 2, connections: 12, max_connections: 60, memory_total_bytes: 1e9, memory_available_bytes: 4e8, cpu_counter: { total: 1e7, idle: 8e6 } },
  uptime: { checks: [{ path: "/health", ok: true }, { path: "/ready", ok: true }], same_provider: true },
  cloudflare: { today: { ...counters, requests: 20000 }, hour: { ...counters, requests: 900 }, app: { ...counters, requests: 19000 }, period_start: "2026-10-25T00:00:00.000Z" },
  d1: { rows_read: 1, rows_written: 1, storage_bytes: 1, day: "2026-10-25" },
  token: { status: "active", expires_on: "2027-10-23T00:00:00Z" },
  supabase_plan: { plan: "free" },
};

// 수집기마다 마지막 성공이 몇 분 전인지만 정하고 화면 판정(summary 의 states)을 본다.
async function statesAt(now, ages) {
  const { sqlite, db } = monitorDb();
  const insert = sqlite.prepare("INSERT INTO collector_state(name,last_attempt_at,last_success_at,status,error_code,payload) VALUES(?,?,?,'ok',NULL,?)");
  for (const [name, age] of Object.entries(ages)) insert.run(name, iso(now - age), iso(now - age), JSON.stringify(PAYLOAD[name]));
  return (await summary({ MONITOR_DB: db, CF_PLAN: "free", SUPABASE_PLAN: "free", PLAN_VERIFIED_AT: iso(now - DAY) }, now)).states;
}

const fiveMinute = (age) => ({ cloudflare: age, database: age, uptime: age, d1: age });

// 2026-10-25 다음 날 확인 그대로: 12:00:32 KST 성공, 12:57 KST 화면.
const seen = Date.parse("2026-10-25T03:57:00Z"), success = Date.parse("2026-10-25T03:00:32Z");
{
  const states = await statesAt(seen, { ...fiveMinute(3 * MIN), token: seen - success, supabase_plan: seen - success });
  eq(states.token.status, "ok", "매시 한 번 도는 토큰 확인은 56분 전 성공이면 '수집됨'이다(20분 기준이면 '갱신 지연')");
  eq(states.token.fresh, true, "56분 전에 성공한 토큰 확인은 fresh 다");
  eq(states.token.last_success_at, iso(success), "마지막 성공 시각은 그대로 보인다");
  eq(states.supabase_plan.status, "ok", "요금제 자동 확인은 2시간 기준 그대로다");
}
{
  const states = await statesAt(seen, { ...fiveMinute(3 * MIN), token: 70 * MIN });
  eq(states.token.status, "ok", "토큰 확인은 70분까지 '수집됨'이다(1시간 주기 + 여유 10분)");
}
{
  const states = await statesAt(seen, { ...fiveMinute(3 * MIN), token: 71 * MIN });
  eq(states.token.status, "stale", "한 번 거른 토큰 확인(71분 전 성공)은 '갱신 지연'이다");
  eq(states.token.fresh, false, "71분 전 성공은 fresh 가 아니다");
}
{
  const states = await statesAt(seen, { ...fiveMinute(21 * MIN), token: 3 * MIN });
  for (const name of ["cloudflare", "database", "uptime", "d1"]) eq(states[name].status, "stale", `5분 수집기 ${name} 은 20분 기준 그대로다(21분 전 성공 = 갱신 지연)`);
}
{
  const states = await statesAt(seen, { ...fiveMinute(19 * MIN), token: 3 * MIN });
  for (const name of ["cloudflare", "database", "uptime", "d1"]) eq(states[name].status, "ok", `5분 수집기 ${name} 은 19분 전 성공이면 수집됨이다`);
}
{
  const states = await statesAt(seen, { ...fiveMinute(3 * MIN), supabase_plan: 121 * MIN });
  eq(states.supabase_plan.status, "stale", "요금제 자동 확인은 2시간을 넘으면 갱신 지연이다(기준 그대로)");
}

eq(MONITOR_VERSION, "1.3.0", "관제 판은 1.3.0 이다(1.2.1 → 1.3.0, V22.9.81 앱 표본 왕복 확인)");
eq((await (await monitor.fetch(new Request("https://monitor.example/health"), {}, {})).json()).version, "1.3.0", "/health 가 1.3.0 을 알린다");
ok(readFileSync(new URL("../monitoring/worker.mjs", import.meta.url), "utf8").includes('name==="token"?70*60000'), "토큰 수집기 기준은 70분이다");

done();
