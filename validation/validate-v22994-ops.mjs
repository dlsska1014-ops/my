#!/usr/bin/env node
// V22.9.94 준비 상태 점검(/ready)·예약 실행 기록(관제용) 검사 — 내부 검토 R-2·R-4 의 앱 쪽.
//   R-2 /ready: ① 함수 점검 결과를 나눈다. 없음(PGRST202)·권한(401/403/42501)·인자·정의 불일치(PGRST203 등)·확인 불가(시한·5xx·전송 오류)는
//               모두 실패이고, 정상 답과 입력 거절(22P02·P0001 같은 4xx)만 ‘있음’이다(예전에는 PGRST202 말고는 모두 있음).
//               ② V22.9.88 조건부 삭제 함수(accountbook_delete_transaction_if_v22988)를 점검 목록에 넣는다(없으면 삭제가 조용히 옛 함수로 돈다).
//               ③ 같은 인스턴스에서 60초 동안 마지막 점검 결과를 다시 쓴다(cached:true·checked_at). 예전에는 부를 때마다 Supabase 를 32번 불렀다.
//   R-4 /internal/ops-usage: 관제 1.5.0 이 x-ab-monitor-cron: 1 을 보내면 예약 실행 마지막 기록(cron 칸)을 Supabase 한 번으로 읽어 붙인다.
//               머리가 없으면 답은 예전과 같다(관제 1.4.0·V22.9.82 검사).
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음. 등록은 코디네이터가 한다.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import { app, ctx, fixture, intercept, putSetting } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 260); } catch (_) { return String(value).slice(0, 260); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 320)}`);
  }
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

// ── 공통 준비 ────────────────────────────────────────────────────────────────
// 점검 목록은 소스에서 읽는다(목록이 바뀌어도 이 검사가 따로 낡지 않게).
const configSource = read("../src/modules/runtime/config-readiness.js");
const listOf = (name) => [...(configSource.match(new RegExp(`const ${name} = \\[([\\s\\S]*?)\\n\\];`))?.[1] || "").matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]);
const CORE = listOf("READINESS_CORE_RPCS");
const ALT = listOf("READINESS_ALTERNATIVE_RPC_GROUPS");
const TABLE_COUNT = listOf("READINESS_REQUIRED_TABLES").length + listOf("READINESS_OPTIONAL_TABLES").length;
const V88 = "accountbook_delete_transaction_if_v22988";
const TARGET = "accountbook_set_local_identity_v227";
const [ALT_NEW, ALT_OLD] = ALT;
const EXPECTED_RPCS = [...new Set([...CORE, V88, ...ALT])].sort();
const EXPECTED_RPC_COUNT = EXPECTED_RPCS.length;
const READY_ENV = { ADMIN_SESSION_SECRET: "qa-v22994-admin-session", ADMIN_API_TOKEN: "qa-v22994-admin-token" };
// V22.9.93 의 /ready 칸 순서(validate-refund-links-v22979 의 readyKeys 와 같다) + time.
const GOLDEN_KEYS = ["ok", "ready", "version", "skill_caller_auth_configured", "skill_caller_auth", "checked_tables", "checked_required_tables", "checked_optional_tables", "checked_rpcs", "failed_tables", "unavailable_optional_tables", "missing_rpcs", "ads_mode", "time"];

const pg = (status, body) => new Response(body === null ? null : typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const INVALID_UUID = { code: "22P02", details: null, hint: null, message: 'invalid input syntax for type uuid: "readiness-invalid-uuid"' };
const RAISED = { code: "P0001", details: null, hint: null, message: "invalid_operation_key" };
// 운영 함수가 점검 본문에 내는 답(스키마 SQL 기준): uuid 인자가 있으면 22P02, 없으면 첫 검사의 P0001, release(null,null)는 그냥 끝난다.
function productionRpc(rpc, body) {
  if (rpc === "accountbook_release_operation") return pg(204, null);
  return JSON.stringify(body).includes("readiness-invalid-uuid") ? pg(400, INVALID_UUID) : pg(400, RAISED);
}
// 픽스처 Supabase 앞에서 부름을 세고, answer 가 정한 답을 낸다(undefined 면 픽스처가 답한다).
function supabaseRecorder(answer) {
  const log = { calls: 0, rpc: [], tables: [], requests: [], bodies: Object.create(null) };
  const restore = intercept(async ({ url, method, init }) => {
    if (url.hostname !== "mock.supabase.co") return undefined;
    log.calls += 1;
    log.requests.push(`${method} ${url.pathname}${url.search}`);
    const rpc = url.pathname.match(/^\/rest\/v1\/rpc\/([a-z0-9_]+)$/)?.[1] || "";
    let body = {};
    try { body = init?.body ? JSON.parse(String(init.body)) : {}; } catch (_) { body = {}; }
    if (rpc) { log.rpc.push(rpc); log.bodies[rpc] = body; } else log.tables.push(url.pathname.split("/").at(-1));
    return answer ? answer({ url, method, init, rpc, body }) : undefined;
  });
  return { log, restore };
}
const productionLike = ({ rpc, body }) => (rpc ? productionRpc(rpc, body) : undefined);
async function readyOf(fx, env = {}) {
  const response = await app.fetch(new Request("https://malhaebook.com/ready"), { ...fx.env, ...READY_ENV, ...env }, ctx);
  const text = await response.text();
  let body = null; try { body = JSON.parse(text); } catch (_) { body = null; }
  return { status: response.status, body: body || {}, text };
}

// ── 1. 함수 점검 분류(R-2 ①②) ─────────────────────────────────────────────────
await section("1 함수 점검 분류", async () => {
  // 1-0. 점검 목록이 소스에서 읽혔다(이 검사의 전제).
  ok(CORE.length >= 16 && ALT.length === 2 && TABLE_COUNT >= 14, `1-0 점검 목록을 소스에서 읽었다(핵심 ${CORE.length}·대체 ${ALT.length}·표 ${TABLE_COUNT})`);

  // 1-a. 운영과 같은 답이면 준비됨. V88 함수도 부른다.
  await fixture(async (fx) => {
    const { log, restore } = supabaseRecorder(productionLike);
    try {
      const r = await readyOf(fx);
      eq(r.status, 200, "1-a 운영과 같은 함수 답(22P02·P0001·204)이면 /ready 200");
      eq(r.body.ready, true, "1-a ready:true");
      eq(r.body.checked_rpcs, EXPECTED_RPC_COUNT, `1-a 점검 함수는 ${EXPECTED_RPC_COUNT}개(핵심 ${CORE.length} + V22.9.88 조건부 삭제 1 + 대체 묶음 ${ALT.length})`);
      eq([...new Set(log.rpc)].sort(), EXPECTED_RPCS, "1-a V22.9.88 조건부 삭제 함수(accountbook_delete_transaction_if_v22988)도 실제로 부른다");
      eq(log.rpc.length, EXPECTED_RPC_COUNT, "1-a 함수마다 한 번씩만 부른다");
      eq(log.calls, TABLE_COUNT + EXPECTED_RPC_COUNT, `1-a 한 번 점검에 Supabase ${TABLE_COUNT + EXPECTED_RPC_COUNT}번(표 ${TABLE_COUNT}·함수 ${EXPECTED_RPC_COUNT})`);
      eq(log.bodies[V88], { p_transaction_id: "readiness-invalid-uuid", p_household_id: "readiness-invalid-uuid", p_actor_user_id: "readiness-invalid-uuid", p_actor_kind: "readiness", p_expected: {} }, "1-a V88 점검 본문은 바꿀 수 없는 uuid 값이다(아무것도 지우지 않는다)");
      eq(r.body.missing_rpcs, [], "1-a 빠진 함수 없음");
      ok(!("rpc_failures" in r.body), "1-a 실패가 없으면 rpc_failures 칸을 더하지 않는다");
      eq(Object.keys(r.body), GOLDEN_KEYS, "1-a 새로 점검한 답의 칸과 순서는 V22.9.93 과 같다");
    } finally { restore(); }
  });

  // 1-b. 대상 함수 하나만 다른 답을 낼 때.
  const permission = { code: "42501", details: null, hint: null, message: `permission denied for function ${TARGET}` };
  const cases = [
    // [이름, 답, 기대 HTTP, 기대 rpc_failures 항목(null 이면 칸 없음), 빠진 함수에 들어가는지, 답에 나오면 안 되는 글자]
    ["PGRST202 함수 없음", () => pg(404, { code: "PGRST202", details: `Searched for the function public.${TARGET} with parameters p_credential_hash, p_user_id but no matches were found in the schema cache.`, hint: null, message: `Could not find the function public.${TARGET}(p_credential_hash, p_user_id) in the schema cache` }), 503, null, true, "Searched for"],
    ["PGRST202 같은 이름 다른 인자", () => pg(404, { code: "PGRST202", details: "Searched for the function with other parameters", hint: `Perhaps you meant to call the function public.${TARGET}(p_user_id, p_login_name)`, message: `Could not find the function public.${TARGET}(p_credential_hash) in the schema cache` }), 503, { status: "mismatch", reason: "PGRST202" }, true, "Perhaps you meant"],
    ["403 42501 권한 없음", () => pg(403, permission), 503, { status: "forbidden", reason: "42501" }, true, "permission denied"],
    ["401 코드 없음(키 거절)", () => pg(401, { message: "Invalid API key", hint: "Double check your Supabase `anon` or `service_role` API key." }), 503, { status: "forbidden", reason: "http_401" }, true, "Invalid API key"],
    ["300 PGRST203 겹친 정의", () => pg(300, { code: "PGRST203", details: null, hint: "Try renaming the parameters or the function itself in the database so function overloading can be resolved", message: `Could not choose the best candidate function between: public.${TARGET}(a), public.${TARGET}(b)` }), 503, { status: "mismatch", reason: "PGRST203" }, true, "Could not choose"],
    ["404 42P01 함수 안의 표 없음", () => pg(404, { code: "42P01", details: null, hint: null, message: 'relation "accountbook_user_security" does not exist' }), 503, { status: "mismatch", reason: "42P01" }, true, "does not exist"],
    ["503 PGRST001 연결 실패", () => pg(503, { code: "PGRST001", details: null, hint: null, message: "Database client error. Retrying the connection." }), 503, { status: "unknown", reason: "PGRST001" }, true, "Retrying"],
    ["500 XX000", () => pg(500, { code: "XX000", details: null, hint: null, message: "internal error in function" }), 503, { status: "unknown", reason: "XX000" }, true, "internal error in"],
    ["504 본문 JSON 아님", () => new Response("upstream request timeout", { status: 504 }), 503, { status: "unknown", reason: "http_504" }, true, "upstream request"],
    ["404 코드 없음(경로 없음)", () => pg(404, { message: "no Route matched with those values" }), 503, { status: "unknown", reason: "http_404" }, true, "no Route"],
    ["429 요청 제한", () => pg(429, { message: "Too many requests to the gateway" }), 503, { status: "unknown", reason: "http_429" }, true, "Too many"],
    ["시한 초과(TimeoutError)", () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }, 503, { status: "unknown", reason: "timeout" }, true, "aborted due"],
    ["전송 오류(TypeError)", () => { throw new TypeError("fetch failed: socket hang up"); }, 503, { status: "unknown", reason: "network" }, true, "socket hang"],
    ["409 23505 입력 거절", () => pg(409, { code: "23505", details: null, hint: null, message: "duplicate key value violates unique constraint" }), 200, null, false, "duplicate key"],
    ["400 코드 없음 입력 거절", () => pg(400, { message: "invalid_credential" }), 200, null, false, "invalid_credential"],
    ["400 함수가 정한 코드", () => pg(400, { code: "QA_ASSET_ACTION_INVALID", message: "asset action invalid" }), 200, null, false, "asset action"],
    ["200 실행됨", () => pg(200, "null"), 200, null, false, ""],
  ];
  for (const [name, answer, status, failure, missing, secret] of cases) {
    await fixture(async (fx) => {
      const { restore } = supabaseRecorder(({ rpc, body }) => (rpc === TARGET ? answer() : rpc ? productionRpc(rpc, body) : undefined));
      try {
        const r = await readyOf(fx);
        eq(r.status, status, `1-b ${name}: /ready ${status}`);
        eq(r.body.ready, status === 200, `1-b ${name}: ready=${status === 200}`);
        eq(r.body.missing_rpcs, missing ? [TARGET] : [], `1-b ${name}: missing_rpcs`);
        if (failure) eq(r.body.rpc_failures, [{ rpc: TARGET, ...failure }], `1-b ${name}: rpc_failures 에 함수·분류·원인 코드`);
        else ok(!("rpc_failures" in r.body), `1-b ${name}: rpc_failures 칸 없음`);
        if (secret) ok(!r.text.includes(secret), `1-b ${name}: 저장소 오류 원문을 공개 답에 싣지 않는다`);
      } finally { restore(); }
    });
  }

  // 1-c. 실제 시한(쓰기 시한 3초): 함수 하나가 답하지 않으면 확인 불가로 실패한다.
  await fixture(async (fx) => {
    const { restore } = supabaseRecorder(({ rpc, body, init }) => {
      if (rpc !== TARGET) return rpc ? productionRpc(rpc, body) : undefined;
      return new Promise((_, reject) => { init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }); });
    });
    try {
      const started = Date.now();
      const r = await readyOf(fx, { SUPABASE_WRITE_TIMEOUT_MS: "3000" });
      eq(r.status, 503, "1-c 함수가 쓰기 시한(3초) 안에 답하지 않으면 /ready 503");
      eq(r.body.rpc_failures, [{ rpc: TARGET, status: "unknown", reason: "timeout" }], "1-c 시한 초과는 unknown·timeout 으로 보인다");
      ok(Date.now() - started < 9000, "1-c 시한에서 끝난다(멈추지 않는다)");
    } finally { restore(); }
  });

  // 1-d. 대체 묶음: 둘 다 못 쓰면 실패, 하나라도 쓸 수 있으면 통과.
  const altCases = [
    ["새 함수 권한 없음 + 옛 함수 없음", { [ALT_NEW]: () => pg(403, { code: "42501", message: "permission denied" }), [ALT_OLD]: () => pg(404, { code: "PGRST202", hint: null, message: "Could not find the function" }) }, 503, [{ rpc: ALT_NEW, status: "forbidden", reason: "42501" }]],
    ["새 함수 없음 + 옛 함수 있음", { [ALT_NEW]: () => pg(404, { code: "PGRST202", hint: null, message: "Could not find the function" }) }, 200, null],
    ["새 함수 시한 + 옛 함수 있음", { [ALT_NEW]: () => { throw new DOMException("timeout", "TimeoutError"); } }, 200, null],
  ];
  for (const [name, answers, status, failuresExpected] of altCases) {
    await fixture(async (fx) => {
      const { restore } = supabaseRecorder(({ rpc, body }) => (answers[rpc] ? answers[rpc]() : rpc ? productionRpc(rpc, body) : undefined));
      try {
        const r = await readyOf(fx);
        eq(r.status, status, `1-d ${name}: /ready ${status}`);
        eq(r.body.missing_rpcs, status === 200 ? [] : [`${ALT_NEW}|${ALT_OLD}`], `1-d ${name}: missing_rpcs`);
        if (failuresExpected) eq(r.body.rpc_failures, failuresExpected, `1-d ${name}: 묶음 안의 권한 실패를 알린다`);
        else ok(!("rpc_failures" in r.body), `1-d ${name}: rpc_failures 칸 없음`);
      } finally { restore(); }
    });
  }

  // 1-e. V88 함수가 없으면 준비되지 않음(예전에는 목록에 없어 200 이었다).
  await fixture(async (fx) => {
    const { restore } = supabaseRecorder(({ rpc, body }) => (rpc === V88 ? pg(404, { code: "PGRST202", hint: null, message: `Could not find the function public.${V88}` }) : rpc ? productionRpc(rpc, body) : undefined));
    try {
      const r = await readyOf(fx);
      eq(r.status, 503, "1-e V22.9.88 조건부 삭제 함수가 없으면 /ready 503");
      eq(r.body.missing_rpcs, [V88], "1-e missing_rpcs 에 V88 함수 이름");
    } finally { restore(); }
  });

  // 1-f. 기본 픽스처(빠진 함수 셋 = PGRST202): 칸과 순서는 V22.9.93 그대로, rpc_failures 없음.
  await fixture(async (fx) => {
    const r = await readyOf(fx);
    eq(r.status, 503, "1-f 기본 픽스처는 빠진 함수가 있어 503");
    eq(Object.keys(r.body), GOLDEN_KEYS, "1-f 함수 없음(PGRST202)만 있으면 칸과 순서가 V22.9.93 과 같다");
    ok(r.body.missing_rpcs.length > 0 && r.body.missing_rpcs.every((name) => typeof name === "string"), "1-f missing_rpcs 는 이름 목록");
  });
});

// ── 2. 60초 다시 쓰기(R-2 ③) ─────────────────────────────────────────────────
await section("2 60초 다시 쓰기", async () => {
  const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
  const T0 = Date.parse("2026-11-05T10:00:00+09:00");
  const FRESH = TABLE_COUNT + EXPECTED_RPC_COUNT;
  try {
    await fixture(async (fx) => {
      globalThis.__AB_QA_FIXED_NOW_MS = T0;
      const first = supabaseRecorder(productionLike);
      try {
        const a = await readyOf(fx);
        eq(first.log.calls, FRESH, `2-a 첫 점검은 Supabase ${FRESH}번`);
        ok(!("cached" in a.body) && !("checked_at" in a.body), "2-a 새로 점검한 답에는 cached·checked_at 이 없다");
        globalThis.__AB_QA_FIXED_NOW_MS = T0 + 30000;
        const b = await readyOf(fx);
        eq(first.log.calls, FRESH, "2-b 60초 안의 두 번째 /ready 는 Supabase 를 부르지 않는다");
        eq(b.body.cached, true, "2-b 다시 쓴 답은 cached:true");
        eq(b.body.checked_at, new Date(T0).toISOString(), "2-b checked_at 은 실제로 점검한 시각");
        eq(b.status, a.status, "2-b HTTP 상태는 점검 때와 같다");
        for (const key of ["ok", "ready", "version", "checked_tables", "checked_required_tables", "checked_optional_tables", "checked_rpcs", "failed_tables", "unavailable_optional_tables", "missing_rpcs"]) eq(b.body[key], a.body[key], `2-b ${key} 는 점검 때와 같다`);
        eq(Object.keys(b.body), [...GOLDEN_KEYS.slice(0, -1), "cached", "checked_at", "time"], "2-b 다시 쓴 답은 V22.9.93 칸 뒤·time 앞에 cached·checked_at 만 더한다");
        // 설정에서 나오는 값은 다시 쓰지 않고 매번 계산한다.
        const adfit = await readyOf(fx, { ADS_MODE: "adfit" });
        eq([adfit.body.cached, adfit.body.ads_mode, adfit.body.adfit_unit], [true, "adfit", "missing"], "2-c 다시 쓴 답에서도 ads_mode·adfit_unit 은 이번 요청의 설정이다");
        const live = await readyOf(fx, { ADS_MODE: "live" });
        eq([live.body.cached, live.body.ads_mode, "adfit_unit" in live.body], [true, "live", false], "2-c 광고 설정이 바뀌면 그 값으로 답한다(애드핏이 아니면 adfit_unit 칸 없음)");
        const skill = await readyOf(fx, { KAKAO_SKILL_SECRET: "qa-v22994-skill-secret" });
        eq([skill.body.cached, skill.body.skill_caller_auth_configured, a.body.skill_caller_auth_configured], [true, true, false], "2-c 카카오 스킬 인증 설정도 이번 요청 값이다");
        eq(first.log.calls, FRESH, "2-c 설정만 다른 요청도 Supabase 를 부르지 않는다");
        globalThis.__AB_QA_FIXED_NOW_MS = T0 + 59999;
        await readyOf(fx);
        eq(first.log.calls, FRESH, "2-d 59.999초까지는 다시 쓴다");
        globalThis.__AB_QA_FIXED_NOW_MS = T0 + 60000;
        const c = await readyOf(fx);
        eq(first.log.calls, FRESH * 2, "2-e 60초가 지나면 다시 점검한다");
        ok(!("cached" in c.body), "2-e 다시 점검한 답에는 cached 가 없다");
        globalThis.__AB_QA_FIXED_NOW_MS = T0 + 30000;
        await readyOf(fx);
        eq(first.log.calls, FRESH * 3, "2-f 시계가 마지막 점검 시각보다 앞이면 다시 쓰지 않고 새로 점검한다");
      } finally { first.restore(); }

      // 실패 결과도 60초 동안 다시 쓴다(실패 때 몰리는 요청이 Supabase 를 33번씩 부르지 않게).
      globalThis.__AB_QA_FIXED_NOW_MS = T0 + 120000;
      const failing = supabaseRecorder(({ rpc, body }) => (rpc === TARGET ? pg(403, { code: "42501", message: "permission denied" }) : rpc ? productionRpc(rpc, body) : undefined));
      try {
        const bad = await readyOf(fx);
        eq(failing.log.calls, FRESH, "2-g 전송(fetch)이 바뀌면 다시 쓰지 않고 새로 점검한다");
        eq(bad.status, 503, "2-g 권한 실패 점검은 503");
        globalThis.__AB_QA_FIXED_NOW_MS = T0 + 150000;
        const again = await readyOf(fx);
        eq(failing.log.calls, FRESH, "2-g 실패 결과도 60초 동안 다시 쓴다");
        eq([again.status, again.body.cached, again.body.ready], [503, true, false], "2-g 다시 쓴 실패 답도 503·ready:false");
        eq(again.body.rpc_failures, bad.body.rpc_failures, "2-g 다시 쓴 실패 답에도 함수별 원인이 남는다");
        eq(Object.keys(again.body).slice(-4), ["ads_mode", "cached", "checked_at", "time"], "2-g 실패 답에서도 cached·checked_at 은 time 바로 앞이다");
      } finally { failing.restore(); }

      // 필수 설정이 빈 답은 기록하지도 다시 쓰지도 않는다.
      const third = supabaseRecorder(productionLike);
      try {
        const missing = await readyOf(fx, { ADMIN_SESSION_SECRET: "" });
        eq([missing.status, missing.body.error, third.log.calls], [503, "missing_required_configuration", 0], "2-h 필수 설정이 비면 Supabase 를 부르지 않고 503");
        ok(!("cached" in missing.body) && !("checked_at" in missing.body), "2-h 필수 설정 누락 답에는 cached·checked_at 이 없다");
        await readyOf(fx);
        eq(third.log.calls, FRESH, "2-h 필수 설정 누락 답은 기록을 남기지 않는다(다음 정상 요청은 새로 점검)");
        const missingAgain = await readyOf(fx, { ADMIN_SESSION_SECRET: "" });
        eq(missingAgain.body.error, "missing_required_configuration", "2-h 점검 기록이 있어도 필수 설정이 비면 그 503 을 낸다");
        // 환불 연결 플래그가 바뀌면(점검 항목이 달라짐) 새로 점검한다.
        const flagged = await readyOf(fx, { REFUND_LINKS_ENABLED: "1" });
        ok(third.log.calls > FRESH && !("cached" in flagged.body), "2-i 환불 연결 플래그가 바뀌면 다시 쓰지 않고 새로 점검한다");
        eq(flagged.body.refund_links?.enabled, true, "2-i 플래그를 켠 점검에는 refund_links 가 붙는다");
        const flaggedAgain = await readyOf(fx, { REFUND_LINKS_ENABLED: "1" });
        eq([flaggedAgain.body.cached, flaggedAgain.body.refund_links?.enabled], [true, true], "2-i 같은 플래그의 다음 요청은 refund_links 까지 다시 쓴다");
      } finally { third.restore(); }
    });
  } finally {
    globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
  }
});

// ── 3. 관제용 예약 실행 기록(R-4) ─────────────────────────────────────────────
const cronSource = read("../src/modules/cron/recurring-auto-apply.js");
const LOG_KEY = cronSource.match(/const SCHEDULED_RUN_LOG_KEY = "([a-z0-9_]+)";/)?.[1] || "";
const STATE_KEY = cronSource.match(/const RECURRING_CRON_STATE_KEY = "([a-z0-9_]+)";/)?.[1] || "";
await section("3 관제용 예약 실행 기록", async () => {
  ok(LOG_KEY && STATE_KEY, `3-0 예약 실행 기록·상태 키를 예약 실행 모듈에서 읽었다(${LOG_KEY}·${STATE_KEY})`);
  const SAMPLE = JSON.parse(read("./usage-summary-sample-v22982.json"));
  const TOKEN = "qa-v22994-monitor-token";
  const usageRpc = ({ url }) => (url.pathname === "/rest/v1/rpc/accountbook_usage_summary_v22982" ? pg(200, SAMPLE) : undefined);
  async function usageOf(fx, { header = true, token = TOKEN } = {}) {
    const headers = token === null ? {} : { authorization: `Bearer ${token}` };
    if (header) headers["x-ab-monitor-cron"] = "1";
    const response = await app.fetch(new Request("https://accountbook.internal/internal/ops-usage", { headers }), fx.env, ctx);
    const text = await response.text();
    let body = null; try { body = JSON.parse(text); } catch (_) { body = null; }
    return { status: response.status, body: body || {}, text };
  }
  const stage = { households: 0, rules_seen: 0, scanned: 0, applied: 0, deduplicated: 0, skipped: 0, failed: 0, remaining: 0, pages: 0, report_rebuilt: 0, report_rebuild_pending: 0, report_rebuild_deferred: 0, checked_date: "2026-11-01" };
  const reports = { scanned: 0, generated: 0, skipped: 0, invalid: 0, failed: 0, pending_scopes: 0 };
  const entry = (over = {}) => ({ started_at: "2026-11-01T00:10:02.000Z", finished_at: "2026-11-01T00:10:09.000Z", status: "ok", version: "V22.9.93-LAUNCH-FIXES", recurring: { ...stage }, reports: { ...reports }, cleanup: { ok: true }, errors: [], ...over });
  const older = entry({ started_at: "2026-10-31T00:10:01.000Z", finished_at: "2026-10-31T00:10:05.000Z", version: "V22.9.92-ADFIT-READY" });
  async function cronWith(seed, answer = usageRpc) {
    return fixture(async (fx) => {
      fx.env.OPS_MONITOR_TOKEN = TOKEN;
      seed(fx);
      const recorder = supabaseRecorder(answer);
      try { return { result: await usageOf(fx), log: recorder.log }; } finally { recorder.restore(); }
    });
  }

  // 3-a/3-b 머리 유무.
  await fixture(async (fx) => {
    fx.env.OPS_MONITOR_TOKEN = TOKEN;
    putSetting(fx, LOG_KEY, JSON.stringify([entry(), older]));
    putSetting(fx, STATE_KEY, '{"rev":3,"month":"2026-11","done":[]}');
    const { log, restore } = supabaseRecorder(usageRpc);
    try {
      const plain = await usageOf(fx, { header: false });
      eq(plain.status, 200, "3-a 머리가 없으면 예전처럼 200");
      eq(Object.keys(plain.body), ["ok", "usage"], "3-a 머리가 없으면 답은 예전처럼 ok·usage 두 칸이다(관제 1.4.0)");
      eq(log.calls, 1, "3-a 머리가 없으면 Supabase 를 한 번(이용 현황 함수)만 부른다");
      const withHeader = await usageOf(fx);
      eq(withHeader.status, 200, "3-b 머리가 있어도 200");
      eq(Object.keys(withHeader.body), ["ok", "usage", "cron"], "3-b 머리가 있으면 같은 답 끝에 cron 칸 하나만 더한다");
      eq(withHeader.body.usage, plain.body.usage, "3-b 이용 현황 값은 머리 유무와 같다");
      eq(log.calls, 3, "3-b 예약 실행 기록은 Supabase 한 번으로 읽는다(이용 현황 1 + 기록 1)");
      const settingsReads = log.requests.filter((line) => line.startsWith("GET /rest/v1/accountbook_settings"));
      ok(settingsReads.length === 1 && settingsReads[0].includes(LOG_KEY) && settingsReads[0].includes(STATE_KEY), `3-b 기록·상태 두 키를 한 번의 GET 으로 읽는다: ${settingsReads.join(" | ")}`);
      ok(log.requests.every((line) => line.startsWith("GET ")), "3-b 읽기만 한다(쓰기 없음)");
      eq(withHeader.body.cron, { ok: true, last_run_at: "2026-11-01T00:10:02.000Z", last_status: "ok", last_error: null, version: "V22.9.93-LAUNCH-FIXES", rev: 3 }, "3-b cron 칸 = 가장 최근 실행의 시각·결과·오류·판 + 정기 처리 상태 rev");
    } finally { restore(); }
  });

  // 3-c~3-h 기록 모양별.
  const shapes = [
    ["실패 실행", () => [entry({ status: "error", errors: ["db_503", "reports_failed"] }), older], { last_status: "error", last_error: "db_503" }],
    ["정기 처리 일부(page_cap)", () => [entry({ status: "partial", recurring: { ...stage, partial: true, partial_reason: "page_cap" } }), older], { last_status: "partial", last_error: "recurring:page_cap" }],
    ["리포트 일부", () => [entry({ status: "partial", reports: { ...reports, partial: true } }), older], { last_status: "partial", last_error: "reports:partial" }],
    ["맨 앞 기록이 깨짐(시각 없음)", () => [{ status: "ok", errors: [] }, older], { last_run_at: "2026-10-31T00:10:01.000Z", version: "V22.9.92-ADFIT-READY" }],
    ["모르는 결과·판 형식", () => [entry({ status: "weird", version: "v1 <script>" })], { last_status: "error", version: null }],
  ];
  for (const [name, entries, expected] of shapes) {
    const { result } = await cronWith((fx) => { putSetting(fx, LOG_KEY, JSON.stringify(entries())); putSetting(fx, STATE_KEY, '{"rev":7,"month":"2026-11"}'); });
    const base = { ok: true, last_run_at: "2026-11-01T00:10:02.000Z", last_status: "ok", last_error: null, version: "V22.9.93-LAUNCH-FIXES", rev: 7 };
    eq(result.body.cron, { ...base, ...expected }, `3-c ${name}: cron 칸`);
  }
  {
    const { result } = await cronWith((fx) => { putSetting(fx, STATE_KEY, '{"rev":2,"month":"2026-11"}'); });
    eq(result.body.cron, { ok: true, last_run_at: null, last_status: null, last_error: null, version: null, rev: 2 }, "3-d 실행 기록이 없으면 시각·결과는 null(관제가 ‘기록 없음’으로 본다)");
  }
  {
    const { result } = await cronWith((fx) => { putSetting(fx, LOG_KEY, JSON.stringify([entry()])); putSetting(fx, STATE_KEY, '{"month":"2026-11"}'); });
    eq(result.body.cron?.rev, null, "3-e 상태에 rev 가 없으면 null");
  }
  {
    const { result } = await cronWith((fx) => { putSetting(fx, LOG_KEY, "{not json"); });
    eq(result.body.cron, { ok: false, error_code: "log_invalid" }, "3-f 실행 기록이 깨졌으면 ok:false·log_invalid");
    eq(result.status, 200, "3-f 기록이 깨져도 이용 현황 답(200)은 그대로");
  }
  {
    const failSettings = (args) => (args.url.pathname === "/rest/v1/accountbook_settings" ? pg(503, { code: "PGRST001", message: "connection" }) : usageRpc(args));
    const { result } = await cronWith((fx) => { putSetting(fx, LOG_KEY, JSON.stringify([entry()])); }, failSettings);
    eq(result.body.cron, { ok: false, error_code: "db_503" }, "3-g 기록 읽기가 실패하면 ok:false·상태 번호 코드만(원문 없음)");
    eq([result.status, result.body.ok, Boolean(result.body.usage)], [200, true, true], "3-g 기록 읽기가 실패해도 이용 현황 숫자는 그대로 준다");
    ok(!result.text.includes("connection"), "3-g 저장소 오류 원문을 싣지 않는다");
  }
  {
    // 이용 현황 함수가 없어도(503 rpc_missing) cron 칸은 붙인다.
    const { result } = await cronWith((fx) => { putSetting(fx, LOG_KEY, JSON.stringify([entry()])); putSetting(fx, STATE_KEY, '{"rev":1,"month":"2026-11"}'); }, () => undefined);
    eq([result.status, result.body.ok, result.body.error_code], [503, false, "rpc_missing"], "3-h 이용 현황 함수가 없으면 예전처럼 503 rpc_missing");
    eq(result.body.cron?.last_run_at, "2026-11-01T00:10:02.000Z", "3-h 이용 현황이 실패해도 cron 칸은 붙인다");
  }
  // 3-i 인증: 틀린 토큰·토큰 없음은 예전 401 그대로, Supabase 를 부르지 않는다.
  await fixture(async (fx) => {
    fx.env.OPS_MONITOR_TOKEN = TOKEN;
    putSetting(fx, LOG_KEY, JSON.stringify([entry()]));
    const { log, restore } = supabaseRecorder(usageRpc);
    try {
      const wrong = await usageOf(fx, { token: "wrong-token" });
      eq([wrong.status, wrong.body], [401, { ok: false, error_code: "unauthorized" }], "3-i 틀린 토큰 + 머리면 401 unauthorized 만");
      const none = await usageOf(fx, { token: null });
      eq([none.status, none.body], [401, { ok: false, error_code: "unauthorized" }], "3-i 토큰 없음 + 머리면 401 unauthorized 만");
      eq(log.calls, 0, "3-i 인증 실패면 Supabase 를 부르지 않는다");
      delete fx.env.OPS_MONITOR_TOKEN;
      const unset = await usageOf(fx, { token: "" });
      eq(unset.status, 401, "3-i 앱에 OPS_MONITOR_TOKEN 이 없으면 빈 토큰도 401");
      eq(log.calls, 0, "3-i 토큰 없는 앱도 Supabase 를 부르지 않는다");
    } finally { restore(); }
  });
  // 3-j 머리 값이 정확히 1 일 때만.
  await fixture(async (fx) => {
    fx.env.OPS_MONITOR_TOKEN = TOKEN;
    const { restore } = supabaseRecorder(usageRpc);
    try {
      const response = await app.fetch(new Request("https://accountbook.internal/internal/ops-usage", { headers: { authorization: `Bearer ${TOKEN}`, "x-ab-monitor-cron": "yes" } }), fx.env, ctx);
      const body = await response.json();
      ok(!("cron" in body), "3-j 머리 값이 1 이 아니면 cron 칸을 붙이지 않는다");
    } finally { restore(); }
  });
});

// ── 4. 소스 대조 ─────────────────────────────────────────────────────────────
await section("4 소스 대조", async () => {
  const sql = read("../migrations/V22_9_88_UNDO_DELETE_IF_UNCHANGED_APPLY_REVIEW_ONLY.sql");
  const params = (sql.match(/CREATE OR REPLACE FUNCTION public\.accountbook_delete_transaction_if_v22988\(([\s\S]*?)\)\s*RETURNS/)?.[1] || "").split(",").map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  eq(params, ["p_transaction_id", "p_household_id", "p_actor_user_id", "p_actor_kind", "p_expected"], "4-a V88 운영 함수의 인자 이름(V22_9_88_UNDO_DELETE_IF_UNCHANGED_APPLY_REVIEW_ONLY.sql)");
  const pages = read("../src/modules/admin/settings-audit-pages.js");
  ok(pages.includes(`"${LOG_KEY}"`) && pages.includes(`"${STATE_KEY}"`), "4-b 관제용 기록 읽기는 예약 실행 모듈과 같은 두 키를 쓴다");
  const router = read("../src/modules/worker/router.js");
  ok(/x-ab-monitor-cron/.test(router) && /READINESS_CACHE_MS_V22994 = 60000/.test(router), "4-c 라우터에 관제 머리(x-ab-monitor-cron)와 60초 다시 쓰기 기준이 있다");
});

if (failures.length) {
  for (const line of failures) console.error(`실패: ${line}`);
  console.error(`V22.9.94 준비 상태·경고 검사 실패 ${failures.length}건 (${checks} checks)`);
  process.exit(1);
}
console.log(`V22.9.94 준비 상태·경고 검사 통과 (${checks} checks)`);
