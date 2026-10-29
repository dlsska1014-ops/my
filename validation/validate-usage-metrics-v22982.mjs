#!/usr/bin/env node
// V22.9.82 이용 현황(앱 쪽) 검사.
// 관제 1.4.0 이 한 시간에 한 번 ACCOUNTBOOK → /internal/ops-usage 로 수익화 판단용 합계 숫자를 받아 간다. 앱은 Supabase 읽기 전용 함수
// accountbook_usage_summary_v22982 를 GET /rest/v1/rpc 로 부르고 계약(review-artifacts/v82-usage-metrics-2026-10-27/CONTRACT.md) 밖의 값을
// 버린다. 이 검사는 실제 번들(src/index.js)의 app.fetch 로 인증·오류 구분·걸러내기를 보고, SQL 파일의 모양(승인 줄·읽기 전용·권한)을 본다.
// usage-summary-sample-v22982.json 은 적용 SQL 을 PGlite(WASM Postgres)에서 실제로 돌린 답이다(증거: review-artifacts/v82-usage-metrics-2026-10-27/sql/).
import { readFileSync } from "node:fs";
import { app, counter } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22982_SOFT === "1" || process.argv.includes("--soft");
const base = counter("V22.9.82 이용 현황(앱) 검사 통과");
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
const deepEq = (actual, expected, message) => guard(() => base.deepEq(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const TOKEN = "v22982-usage-token";
const SAMPLE = JSON.parse(read("./usage-summary-sample-v22982.json"));
const RPC_URL = "https://fixture.supabase.co/rest/v1/rpc/accountbook_usage_summary_v22982?p_heavy_threshold=30";
const clone = (value) => JSON.parse(JSON.stringify(value));

// Supabase 흉내: 이 검사의 부름은 모두 기록하고, answer 가 정한 답을 낸다.
let calls = [];
let answer = () => new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } });
const originalFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const request = new Request(input, init);
  calls.push({ url: request.url, method: request.method, apikey: request.headers.get("apikey"), auth: request.headers.get("authorization"), body: init.body ?? null });
  return answer(request);
};
const json = (body, status = 200) => () => new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

let telemetry = 0;
function appEnv(overrides = {}) {
  return {
    OPS_MONITOR_TOKEN: TOKEN, SUPABASE_URL: "https://fixture.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "fixture-service-key",
    OPS_MONITOR: { async fetch() { telemetry += 1; return new Response("", { status: 202 }); } },
    ...overrides,
  };
}
async function usage(env = appEnv(), { token = TOKEN, method = "GET", path = "/internal/ops-usage" } = {}) {
  calls = [];
  const headers = token === null ? {} : { authorization: `Bearer ${token}` };
  const response = await app.fetch(new Request(`https://accountbook.internal${path}`, { method, headers }), env, { waitUntil() {} });
  const text = await response.text();
  let body = null; try { body = JSON.parse(text); } catch (_) { body = null; }
  return { status: response.status, type: response.headers.get("content-type") || "", body, text };
}

try {
  // 판 이름은 validate-version-single-source-v22915 가 한 곳(site-config.js)에서 본다. 여기서 글자로 박지 않는다.
  // ── 1. 인증 ─────────────────────────────────────────────────────────────
  await section("1 인증", async () => {
    const none = await usage(appEnv(), { token: null });
    eq(none.status, 401, "토큰 없이 부르면 401");
    deepEq(none.body, { ok: false, error_code: "unauthorized" }, "401 답은 unauthorized 하나만 말한다");
    eq(calls.length, 0, "401 이면 Supabase 를 부르지 않는다");
    const wrong = await usage(appEnv(), { token: "wrong-token" });
    eq(wrong.status, 401, "틀린 토큰이면 401");
    const unset = await usage(appEnv({ OPS_MONITOR_TOKEN: "" }), { token: "" });
    eq(unset.status, 401, "앱에 OPS_MONITOR_TOKEN 이 없으면 빈 토큰도 401");
    eq(calls.length, 0, "토큰이 없는 앱은 Supabase 를 부르지 않는다");
  });

  // ── 2. 정상 답과 부름 모양 ──────────────────────────────────────────────
  await section("2 정상 답", async () => {
    answer = json(SAMPLE);
    telemetry = 0;
    const good = await usage();
    eq(good.status, 200, "함수가 있으면 200");
    ok(good.type.includes("application/json"), "답은 JSON");
    eq(calls.length, 1, "Supabase 를 한 번만 부른다");
    eq(calls[0].url, RPC_URL, "읽기 전용 함수를 GET 주소(p_heavy_threshold=30)로 부른다");
    eq(calls[0].method, "GET", "GET 으로 부른다(STABLE 함수, 쓰기 경로 아님)");
    eq(calls[0].body, null, "본문을 보내지 않는다");
    eq(calls[0].apikey, "fixture-service-key", "service_role 키로 부른다");
    eq(good.body.ok, true, "ok:true");
    deepEq(good.body.usage, SAMPLE, "실제 SQL 답(PGlite)은 걸러내기를 그대로 통과한다");
    eq(telemetry, 0, "/internal/ops-usage 는 사용자 요청 표본을 보내지 않는다");
    const text = good.text;
    ok(!/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(text), "답에 사용자·가계부 id 가 없다");
  });

  // ── 3. 걸러내기 ─────────────────────────────────────────────────────────
  await section("3 걸러내기", async () => {
    const noisy = clone(SAMPLE);
    noisy.user_ids = ["00000000-0000-4000-8000-000000000001"];
    noisy.current.emails = ["a@example.com"];
    noisy.current.records_by_source.secret = 9;
    noisy.totals.amount_sum = 123456;
    noisy.current.median_records_per_recorder = 2.345;
    noisy.current.kakao_by_intent = [
      ...Array.from({ length: 13 }, (_, i) => ({ intent: `INTENT_${String.fromCharCode(65 + i)}`, requests: 100 - i, memo: "x" })),
    ];
    noisy.current.kakao_by_intent.splice(1, 0, { intent: "lower_case", requests: 5 }, { intent: "TRANSACTION", requests: -1 }, { intent: "SUMMARY", requests: "7" });
    noisy.daily = [
      ...Array.from({ length: 70 }, (_, i) => ({ day: `2026-08-${String((i % 28) + 1).padStart(2, "0")}`, recorders: 1, records: 2, kakao_requests: 3, new_users: 0, nickname: "x" })),
      { day: "2026/10/27", recorders: 1, records: 1, kakao_requests: 1, new_users: 1 },
      { day: "2026-10-27", recorders: -1, records: 1, kakao_requests: 1, new_users: 1 },
    ];
    answer = json(noisy);
    const result = await usage();
    eq(result.status, 200, "모르는 키가 섞여도 핵심 모양이 맞으면 200");
    const u = result.body.usage;
    ok(!("user_ids" in u) && !("emails" in u.current) && !("secret" in u.current.records_by_source) && !("amount_sum" in u.totals), "계약 밖의 키는 버린다");
    eq(u.current.median_records_per_recorder, 2.3, "중앙값은 소수 첫째 자리로 줄인다");
    eq(u.current.kakao_by_intent.length, 12, "기능별 순위는 12개까지");
    ok(u.current.kakao_by_intent.every(row => /^[A-Z_]{1,40}$/.test(row.intent) && Number.isInteger(row.requests) && row.requests >= 0 && Object.keys(row).length === 2), "intent 형식·음수·문자열 수·덧붙은 키를 거른다");
    ok(!u.current.kakao_by_intent.some(row => ["lower_case", "TRANSACTION", "SUMMARY"].includes(row.intent)), "형식이 틀린 intent 행은 버린다");
    ok(u.daily.length <= 62 && u.daily.every(row => /^\d{4}-\d{2}-\d{2}$/.test(row.day) && Object.keys(row).length === 5 && row.recorders >= 0), "일별 행은 62개까지, 날짜 형식·음수·덧붙은 키를 거른다");
    eq(u.daily.length, 60, "일별 행은 뒤쪽(최근) 62개 안에서 형식이 맞는 것만 남긴다");
  });

  // ── 4. 모양이 틀린 답 ───────────────────────────────────────────────────
  await section("4 모양이 틀린 답", async () => {
    const broken = {
      "schema 2": (v) => { v.schema = 2; },
      "음수 수": (v) => { v.current.recorders = -1; },
      "문자열 수": (v) => { v.previous_full.records = "4"; },
      "소수 아닌 중앙값": (v) => { v.current.median_records_per_recorder = "1.5"; },
      "previous_same 없음": (v) => { delete v.previous_same; },
      "through_day 0": (v) => { v.through_day = 0; },
      "through_day 32": (v) => { v.through_day = 32; },
      "month 형식": (v) => { v.month = "2026-1"; },
      "generated_at 형식": (v) => { v.generated_at = "yesterday"; },
      "경로 수 빠짐": (v) => { delete v.current.records_by_source.auto; },
      "누적 수 빠짐": (v) => { delete v.totals.households; },
      "기간 날짜 형식": (v) => { v.current.from = "10월 1일"; },
    };
    for (const [name, mutate] of Object.entries(broken)) {
      const value = clone(SAMPLE); mutate(value);
      answer = json(value);
      const result = await usage();
      eq(`${result.status} ${result.body?.error_code}`, "503 invalid_reply", `${name} → 503 invalid_reply`);
    }
    answer = json("not json at all");
    eq((await usage()).body?.error_code, "invalid_reply", "JSON 이 아닌 답 → invalid_reply");
    answer = json([]);
    eq((await usage()).body?.error_code, "invalid_reply", "배열 답 → invalid_reply");
  });

  // ── 5. 오류 구분 ────────────────────────────────────────────────────────
  await section("5 오류 구분", async () => {
    const missing = await usage(appEnv({ SUPABASE_URL: "" }));
    deepEq([missing.status, missing.body], [503, { ok: false, error_code: "not_connected" }], "Supabase 설정이 없으면 503 not_connected");
    eq(calls.length, 0, "not_connected 이면 부르지 않는다");
    answer = json({ code: "PGRST202", message: "Could not find the function public.accountbook_usage_summary_v22982 in the schema cache" }, 404);
    const rpc = await usage();
    deepEq([rpc.status, rpc.body], [503, { ok: false, error_code: "rpc_missing" }], "함수가 없으면(PGRST202 404) 503 rpc_missing");
    ok(!rpc.text.includes("schema cache") && !rpc.text.includes("PGRST"), "Supabase 오류 본문은 밖으로 내지 않는다");
    for (const status of [401, 403, 500]) {
      answer = json({ code: "42501", message: "permission denied for function" }, status);
      const result = await usage();
      deepEq([result.status, result.body], [503, { ok: false, error_code: "usage_unavailable" }], `Supabase ${status} → 503 usage_unavailable`);
      ok(!result.text.includes("permission"), `Supabase ${status} 본문은 밖으로 내지 않는다`);
    }
    answer = () => { throw new TypeError("fetch failed"); };
    const transport = await usage();
    deepEq([transport.status, transport.body], [503, { ok: false, error_code: "usage_unavailable" }], "전송 오류 → 503 usage_unavailable");
    ok(calls.length >= 1 && calls.length <= 2, "읽기 재시도는 한 번까지(조회 규칙)");
    answer = json(SAMPLE);
  });

  // ── 6. 경로 ─────────────────────────────────────────────────────────────
  await section("6 경로", async () => {
    const post = await usage(appEnv(), { method: "POST" });
    ok(post.status !== 200 || post.body?.usage === undefined, "POST 는 이용 현황을 내지 않는다");
    ok(!calls.some(call => call.url.includes("accountbook_usage_summary_v22982")), "POST 는 집계 함수를 부르지 않는다");
    const metrics = await usage(appEnv(), { path: "/internal/ops-metrics" });
    ok(!calls.some(call => call.url.includes("accountbook_usage_summary_v22982")), "DB 지표 경로(/internal/ops-metrics)는 이용 현황 함수를 부르지 않는다");
    ok(metrics.status === 200 || metrics.status === 503, "기존 DB 지표 경로는 그대로 답한다");
    const router = read("../src/modules/worker/router.js");
    ok(router.indexOf('url.pathname === "/internal/ops-usage"') > router.indexOf('url.pathname === "/internal/ops-metrics"'), "라우터: ops-usage 는 ops-metrics 바로 뒤에서 GET 만 받는다");
  });

  // ── 7. SQL 파일 ─────────────────────────────────────────────────────────
  await section("7 SQL 파일", async () => {
    const apply = read("../migrations/V22_9_82_USAGE_SUMMARY_APPLY_REVIEW_ONLY.sql");
    const rollback = read("../migrations/V22_9_82_USAGE_SUMMARY_ROLLBACK_REVIEW_ONLY.sql");
    const code = (sql) => sql.split("\n").filter(line => !line.trimStart().startsWith("--")).join("\n");
    ok(apply.startsWith("-- 실행 금지(DO NOT RUN) — 운영자 승인 전."), "적용 SQL 첫 줄은 실행 금지 안내");
    ok(/^BEGIN;\r?\nDO \$review_only\$ BEGIN RAISE EXCEPTION 'v22982_review_only_usage_summary_approval_required'; END \$review_only\$;$/m.test(apply), "적용 SQL 은 BEGIN 바로 뒤 승인 줄로 멈춘다");
    ok(code(apply).includes("CREATE OR REPLACE FUNCTION public.accountbook_usage_summary_v22982(p_now timestamptz DEFAULT now(), p_heavy_threshold integer DEFAULT 30)"), "함수 이름·인자");
    ok(/\nSTABLE\nSECURITY INVOKER\nSET search_path TO 'public', 'pg_temp'\nSET timezone TO 'UTC'\n/.test(code(apply).replace(/\r/g, "")), "STABLE·SECURITY INVOKER·search_path·timezone 고정");
    ok(code(apply).includes("FROM PUBLIC;") && code(apply).includes("FROM anon, authenticated;") && code(apply).includes("TO service_role;"), "PUBLIC·anon·authenticated 실행 권한을 빼고 service_role 만 준다");
    ok(!/\b(INSERT|UPDATE|DELETE|TRUNCATE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+TABLE|CREATE\s+INDEX)\b/i.test(code(apply)), "적용 SQL 은 표·행·인덱스를 바꾸지 않는다");
    for (const key of ["recorders", "records", "records_by_source", "median_records_per_recorder", "heavy_recorders", "retained_recorders", "prior_month_recorders", "active_households", "shared_active_households", "new_users", "new_households", "kakao_requests", "kakao_by_intent", "previous_same", "previous_full", "through_day", "heavy_threshold", "shared_households"]) {
      ok(apply.includes(`'${key}'`), `SQL 이 계약 키 ${key} 를 만든다`);
    }
    ok(/^BEGIN;\r?\nDO \$review_only\$ BEGIN RAISE EXCEPTION 'v22982_review_only_usage_summary_rollback_approval_required'; END \$review_only\$;$/m.test(rollback), "되돌리기 SQL 도 승인 줄로 멈춘다");
    ok(code(rollback).includes("DROP FUNCTION IF EXISTS public.accountbook_usage_summary_v22982(timestamptz, integer);") && !/\b(DROP\s+TABLE|DELETE|UPDATE|INSERT)\b/i.test(code(rollback)), "되돌리기 SQL 은 함수만 지운다");
  });

  // ── 8. 문서·등록 ────────────────────────────────────────────────────────
  await section("8 문서·등록", async () => {
    const harness = read("../.codex/scripts/verify-repository.mjs");
    const pkg = JSON.parse(read("../package.json"));
    ok(harness.includes('"validation/validate-usage-metrics-v22982.mjs"') && pkg.scripts?.["validate:usage-metrics-v22982"] === "node validation/validate-usage-metrics-v22982.mjs", "검사기가 하네스와 package.json 에 있다");
    ok(read("../SQL_HISTORY.md").includes("V22_9_82_USAGE_SUMMARY_APPLY_REVIEW_ONLY.sql"), "SQL_HISTORY 에 V22.9.82 집계 함수가 있다");
    ok(read("../migrations/README.md").includes("V22_9_82_USAGE_SUMMARY_APPLY_REVIEW_ONLY.sql"), "migrations/README 에 V22.9.82 파일이 있다");
  });
} finally {
  globalThis.fetch = originalFetch;
}

if (SOFT) {
  console.log(`V22982_SOFT: 통과 ${total - failed.length} · 실패 ${failed.length} (검사 ${total}개)`);
  for (const message of failed) console.log(`  실패: ${message}`);
  if (failed.length) process.exitCode = 1;
} else {
  base.done();
}
