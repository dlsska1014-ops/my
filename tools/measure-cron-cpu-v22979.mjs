#!/usr/bin/env node
// V22.9.79 감사 V78 S-5: 정기 반영 예약 실행이 한 번에 읽는 4쪽(500개 × 4 = 2,000개 규칙)의 처리 시간을 로컬 Node 에서 잰다.
// 실제 번들(src/index.js)의 runRecurringAutoApply 와 app.scheduled 를 그대로 부르고, 저장소(Supabase)는 fetch 를 가로채
// 미리 만든 응답으로 답한다(네트워크 없음). 저장소 흉내가 쓴 시간은 따로 재서 뺀다. 응답 본문을 글자로 읽고 JSON 으로 푸는
// 일은 Workers 에서도 isolate CPU 이므로 앱 몫에 넣는다.
//
//   node tools/measure-cron-cpu-v22979.mjs            시나리오마다 새 Node 프로세스로 첫 실행(cold)과 반복 실행(warm)을 잰다
//   node tools/measure-cron-cpu-v22979.mjs --json <파일>  결과 JSON 도 남긴다
//
// 시나리오
//   A  규칙 2,000개(가계부 1곳, 지출자가 조회 전용이라 모두 건너뜀) → 4쪽을 다 읽고 쪽 한도에서 멈춘다(S-5 의 4쪽 최악).
//   B  규칙 2,000개(가계부 50곳, 넣을 규칙) → 넣기·확인·표식 호출이 저장소 호출 몫(30)에 걸려 그 안에서 멈춘다(넣는 길).
//   C  A 와 같은 자료로 예약 실행 전체(app.scheduled: 정기 반영·자동 리포트·NLU 정리·실행 기록).
// Windows 의 process.cpuUsage 는 15.6ms 단위라 쪽마다의 값은 벽시계(performance.now)로 잰다. 저장소 응답은 바로 끝나는 약속이라
// 실행 동안 주 스레드는 쉬지 않는다(벽시계 ≈ 주 스레드 CPU). 프로세스 CPU 는 반복 실행 전체를 재어 한 번 몫으로 나눈다.
// Workers 의 실제 CPU 시간은 여기서 알 수 없다('확인 불가'). Node(V8)와 Workers(V8)는 같은 엔진이지만 기계·JIT 상태가 다르다.
import { spawnSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

const option = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : "");
const child = option("--child");
const SELF = fileURLToPath(import.meta.url);
const ROOT = fileURLToPath(new URL("../", import.meta.url));
const WARM_RUNS = 40;
const TODAY = "2026-10-02";
const MONTH = "2026-10";
const STATE_KEY = "cron_recurring_state_v22976";

function uuid(prefix, n) {
  const hex = n.toString(16).padStart(12, "0");
  return `${prefix}0000-0000-4000-8000-${hex}`;
}

// 규칙 count 개를 households 곳에 고르게 나눈다. viewer 면 지출자가 조회 전용(건너뜀)이다. 저장소 정렬(지정일·가계부·id) 순서다.
function makeRules({ count, households, viewer }) {
  const rules = [];
  for (let n = 0; n < count; n += 1) {
    const h = n % households;
    rules.push({
      id: uuid("aaaaaaaa-", n + 1), household_id: uuid("bbbbbbbb-", h + 1), type: "expense", amount: 10000 + (n % 97) * 100,
      category: "구독", memo: `정기 항목 ${n + 1}`, payment_method: "카드", day_of_month: 1 + (n % 2),
      user_id: viewer ? uuid("cccccccc-", 2) : uuid("cccccccc-", 1), is_active: true, last_applied_month: "2026-09",
      created_at: "2026-07-01T00:00:00+09:00",
    });
  }
  const text = (a, b) => (a < b ? -1 : a > b ? 1 : 0);
  return rules.sort((a, b) => a.day_of_month - b.day_of_month || text(a.household_id, b.household_id) || text(a.id, b.id));
}

function makeStore(rules) {
  const index = new Map(rules.map((rule, i) => [rule.id, i]));
  const applied = new Set();
  const stub = { ms: 0, calls: 0, pages: [], counts: Object.create(null) };
  const respond = (body, status = 200) => new Response(body === null ? null : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const handle = (url, method, init) => {
    const path = url.pathname;
    const count = (name) => { stub.counts[name] = (stub.counts[name] || 0) + 1; };
    if (path.endsWith("/accountbook_settings") && method === "GET") {
      count("settings_get");
      if (url.searchParams.get("key") === `eq.${STATE_KEY}`) return respond([{ value: JSON.stringify({ checked_date: "2026-10-01", pending_month: "" }) }]);
      return respond([]);
    }
    if (path.endsWith("/accountbook_recurring") && method === "GET") {
      count("recurring_page");
      const cursor = /id\.gt\."([^"]+)"\)\)\)$/.exec(String(url.searchParams.get("and") || ""));
      const day = Number(String(url.searchParams.getAll("day_of_month").find((v) => v.startsWith("lte.")) || "lte.31").slice(4));
      const start = cursor ? index.get(cursor[1]) + 1 : 0;
      const out = [];
      for (let i = start; i < rules.length && out.length < 500; i += 1) if (!applied.has(rules[i].id) && rules[i].day_of_month <= day) out.push(rules[i]);
      return respond(out);
    }
    if (path.endsWith("/household_members") && method === "GET") {
      count("members");
      const ids = String(url.searchParams.get("household_id") || "").replace(/^in\.\(|\)$/g, "").split(",").map((v) => v.replace(/^"|"$/g, ""));
      return respond(ids.flatMap((hid) => [{ household_id: hid, user_id: uuid("cccccccc-", 1), role: "owner" }, { household_id: hid, user_id: uuid("cccccccc-", 2), role: "viewer" }]));
    }
    if (path.endsWith("/transactions") && method === "GET") { count("existing"); return respond([]); }
    if (path.endsWith("/transactions") && method === "POST") {
      count("insert");
      const rows = JSON.parse(String(init.body || "[]"));
      return respond((Array.isArray(rows) ? rows : [rows]).map((row, i) => ({ id: `tx-${stub.calls}-${i}`, ...row })), 201);
    }
    if (path.endsWith("/accountbook_recurring") && method === "PATCH") {
      count("marker");
      for (const id of String(url.searchParams.get("id") || "").replace(/^in\.\(|\)$/g, "").split(",")) applied.add(id.replace(/^"|"$/g, ""));
      return respond(null, 204);
    }
    if (path.endsWith("/rpc/accountbook_claim_operation")) { count("lease"); return respond([{ acquired: true, locked_until: "2026-10-02T01:00:00Z" }]); }
    count(`${method} ${path.replace(/^\/rest\/v1\//, "")}`);
    return respond(method === "GET" ? [] : [], method === "GET" ? 200 : 201);
  };
  const fetchStub = async (input, init = {}) => {
    const t = performance.now();
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (url.hostname !== "mock.supabase.co") throw new Error(`external fetch blocked: ${url.hostname}`);
    stub.calls += 1;
    if (method === "GET" && url.pathname.endsWith("/accountbook_recurring")) stub.pages.push({ at: t, stubBefore: stub.ms });
    const response = handle(url, method, init);
    stub.ms += performance.now() - t;
    return response;
  };
  return { stub, fetchStub, reset() { applied.clear(); stub.ms = 0; stub.calls = 0; stub.pages = []; stub.counts = Object.create(null); } };
}

async function runChild(name) {
  globalThis.fetch = async () => { throw new Error("external fetch blocked"); };
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${TODAY}T09:10:00+09:00`);
  const quiet = console.log;
  const worker = await import(pathToFileURL(`${ROOT}src/index.js`).href);
  const scenario = { A: { count: 2000, households: 1, viewer: true, full: false }, B: { count: 2000, households: 50, viewer: false, full: false }, C: { count: 2000, households: 1, viewer: true, full: true } }[name];
  const rules = makeRules(scenario);
  const store = makeStore(rules);
  const env = { SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "measure-key", APP_ENV: "measure" };
  const once = async () => {
    store.reset();
    globalThis.fetch = store.fetchStub;
    console.log = () => {};
    let result;
    const t0 = performance.now();
    try {
      if (scenario.full) {
        const pending = [];
        await worker.default.scheduled({ cron: "10 0 * * *", scheduledTime: Date.parse(`${TODAY}T09:10:00+09:00`) }, { ...env }, { waitUntil(p) { pending.push(p); } });
        for (const p of pending) { try { await p; } catch (_) { /* 결과는 아래 시간만 본다 */ } }
      } else {
        result = await worker.runRecurringAutoApply({ ...env, __AB_DB_BUDGET: { used: 0, limit: 48 } }, { today: TODAY, lock: false });
      }
    } finally { console.log = quiet; }
    const t1 = performance.now();
    // 쪽마다: k 번째 쪽을 읽은 때부터 다음 쪽을 읽은 때(마지막 쪽은 실행 끝)까지, 그 사이 흉내 시간을 뺀다.
    const marks = store.stub.pages;
    const segments = [];
    const firstAt = marks.length ? marks[0].at : t1;
    segments.push({ label: "준비(상태 읽기·첫 쪽 요청 전)", ms: firstAt - t0 - (marks.length ? marks[0].stubBefore : store.stub.ms) });
    for (let k = 0; k < marks.length; k += 1) {
      const end = k + 1 < marks.length ? marks[k + 1].at : t1;
      const stubEnd = k + 1 < marks.length ? marks[k + 1].stubBefore : store.stub.ms;
      segments.push({ label: k + 1 < marks.length ? `${k + 1}쪽 처리` : `${k + 1}쪽 처리 + 마무리(상태 저장 등)`, ms: end - marks[k].at - (stubEnd - marks[k].stubBefore) });
    }
    return { totalMs: t1 - t0 - store.stub.ms, stubMs: store.stub.ms, calls: store.stub.calls, counts: { ...store.stub.counts }, segments, result: result ? { pages: result.pages, rules_seen: result.rules_seen, applied: result.applied, skipped: result.skipped, partial_reason: result.partial_reason || "", remaining: result.remaining } : null };
  };
  const cold = await once();
  const warm = [];
  const cpu0 = process.cpuUsage();
  let stubTotal = 0;
  for (let i = 0; i < WARM_RUNS; i += 1) { const run = await once(); warm.push(run); stubTotal += run.stubMs; }
  const cpu = process.cpuUsage(cpu0);
  const sorted = warm.map((run) => run.totalMs).sort((a, b) => a - b);
  const pick = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  const median = warm.find((run) => run.totalMs === pick(0.5)) || warm[0];
  return {
    scenario: name, rules: scenario.count, households: scenario.households, viewer: scenario.viewer, full: scenario.full,
    cold, warmMedian: median, warm: { runs: WARM_RUNS, medianMs: pick(0.5), p90Ms: pick(0.9), minMs: sorted[0], maxMs: sorted[sorted.length - 1] },
    processCpuPerRunMs: ((cpu.user + cpu.system) / 1000 - stubTotal) / WARM_RUNS,
  };
}

if (child) {
  const out = await runChild(child);
  process.stdout.write(`@@RESULT ${JSON.stringify(out)}\n`);
  process.exit(0);
}

const results = [];
for (const name of ["A", "B", "C"]) {
  const run = spawnSync(process.execPath, [SELF, "--child", name], { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const line = String(run.stdout || "").split("\n").find((text) => text.startsWith("@@RESULT "));
  if (run.status !== 0 || !line) { console.error(run.stderr || run.stdout); process.exit(1); }
  results.push(JSON.parse(line.slice(9)));
}
const f = (ms) => `${ms.toFixed(2)}ms`;
console.log(`정기 반영 예약 실행 CPU 측정 (V78 S-5) — Node ${process.version}, ${process.platform}, 반복 ${WARM_RUNS}회, 저장소 흉내 시간 제외`);
for (const r of results) {
  const what = r.full ? "예약 실행 전체(app.scheduled)" : "정기 반영 단계(runRecurringAutoApply)";
  console.log(`\n[${r.scenario}] 규칙 ${r.rules}개 · 가계부 ${r.households}곳 · ${r.viewer ? "모두 건너뜀(조회 전용 지출자)" : "넣을 규칙"} · ${what}`);
  if (r.cold.result) console.log(`  결과: ${r.cold.result.pages}쪽 · 확인 ${r.cold.result.rules_seen}개 · 넣음 ${r.cold.result.applied} · 건너뜀 ${r.cold.result.skipped} · 멈춘 까닭 ${r.cold.result.partial_reason || "없음"} · 저장소 호출 ${r.cold.calls}회`);
  else console.log(`  저장소 호출 ${r.cold.calls}회 (${Object.entries(r.cold.counts).map(([k, v]) => `${k} ${v}`).join(", ")})`);
  console.log(`  첫 실행(cold, 새 프로세스): ${f(r.cold.totalMs)}  ·  반복 실행(warm) 중앙값 ${f(r.warm.medianMs)} · p90 ${f(r.warm.p90Ms)} · 최소 ${f(r.warm.minMs)} · 최대 ${f(r.warm.maxMs)}`);
  console.log(`  반복 실행 프로세스 CPU(모든 스레드, 한 번 몫): ${f(r.processCpuPerRunMs)}`);
  console.log(`  쪽마다(cold → warm 중앙값 실행):`);
  for (let i = 0; i < r.cold.segments.length; i += 1) console.log(`    ${r.cold.segments[i].label}: ${f(r.cold.segments[i].ms)} → ${f(r.warmMedian.segments[i]?.ms ?? NaN)}`);
}
console.log("\nWorkers 한도: 무료 요금제 호출당 CPU 10ms. 앱은 표준(standard) 사용량 모델이며 기본 CPU 한도는 호출당 30초(설정으로 늘릴 수 있음)다.");
console.log("Workers 에서의 실제 CPU 시간은 이 측정으로 알 수 없다(확인 불가). 같은 V8 이지만 기계 성능·JIT 상태·런타임 오버헤드가 다르다.");
const jsonPath = option("--json");
if (jsonPath) writeFileSync(jsonPath, `${JSON.stringify({ node: process.version, platform: process.platform, warmRuns: WARM_RUNS, results }, null, 2)}\n`);
