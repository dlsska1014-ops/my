// V22.9.73 (요청 멈춤 대비): Worker→Supabase 조회 요청이 응답 없이 멈추면 짧은 시한(기본 3초, 최소 500ms) 뒤 한 번 더 보내고,
// 쓰기 요청은 다시 보내지 않되 시한(기본 15초, 최소 3초)에 걸리면 '결과 불확실'로 올린다. 2026-10-20 12:07~12:09 운영 단톡방
// 테스트에서 조회 요청 일부가 Supabase 에 도착하지 못한 채 10초 제한에 걸려 세 요청이 실패한 일에 대한 완화책이다.
// Synthetic fetch stubs only. No live Supabase, Kakao or financial data writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { supabase } from "../src/modules/data/supabase-client.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const between = (value, min, max, label) => { assert.ok(value >= min && value <= max, `${label} (${value} not in ${min}..${max})`); checks++; };

const realFetch = globalThis.fetch;
const stalled = (init) => new Promise((_, reject) => {
  const signal = init?.signal;
  if (!signal) return;
  if (signal.aborted) return reject(Object.assign(new Error("aborted"), { name: "AbortError" }));
  signal.addEventListener("abort", () => reject(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
});
const okJson = (body = [{ ok: 1 }]) => Promise.resolve(new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }));
function makeEnv(extra = {}) {
  return {
    SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
    SUPABASE_READ_ATTEMPT_MS: "500", SUPABASE_WRITE_TIMEOUT_MS: "3000",
    __AB_MONITOR_REQUEST: { db_count: 0, db_ms: 0, db_failures: 0, db_retries: 0 },
    __AB_DB_BUDGET: { used: 0, limit: 50 },
    ...extra,
  };
}
async function withFetch(stub, run) {
  const calls = [];
  globalThis.fetch = (input, init = {}) => { calls.push({ url: String(typeof input === "string" ? input : input.url), method: init.method || "GET", signal: init.signal }); return stub(calls.length, init, input); };
  try { return await run(calls); } finally { globalThis.fetch = realFetch; }
}
// 시간은 단조 시계로 잰다. 2026-10-20 GitHub windows-latest 러너에서 첫 검사가 1272ms(기대 약 500ms, 재시도 없음)로 재여
// 실패했다 — 러너 멈춤이나 벽시계 보정이 섞인 값이다. 상한은 그런 멈춤을 견디게 두되, 잘못된 기본값(조회 첫 시한 3초·
// 쓰기 시한 15초)이 쓰이면 걸리게 잡는다. 하한(설정 경계값의 핵심)은 그대로다.
const timed = async (fn) => { const started = performance.now(); let error = null, value; try { value = await fn(); } catch (e) { error = e; } return { ms: Math.round(performance.now() - started), error, value }; };

try {
  // 첫 사용 비용(Node 가 처음 쓸 때 불러오는 Headers·Response·AbortController, 첫 호출)이 첫 시간 검사에 섞이지 않게
  // 정상 경로와 멈춤(중단) 경로를 미리 한 번씩 부른다. 이 검증기는 하네스 맨 앞에서 돌아 그 비용을 혼자 떠안는다.
  new Headers(); new Response(null);
  await withFetch(() => okJson(), () => supabase(makeEnv(), "/rest/v1/warmup?select=id", { method: "GET" }));
  await withFetch((n, init) => stalled(init), () => supabase(makeEnv(), "/rest/v1/warmup?select=id", { method: "GET", timeoutMs: 1 }).catch(() => null));

  // 0. 설정 경계값(동작으로 확인): 조회 첫 시한은 500ms 아래로 내려가지 않고, 쓰기 시한은 3초 아래로 내려가지 않는다.
  //    (설정 함수는 다른 모듈이 쓰지 않아 내보내지 않는다 — annotate 단계가 내보내기 목록을 사용처로 만든다.)
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv({ SUPABASE_READ_ATTEMPT_MS: "200" });
    const result = await timed(() => supabase(env, "/rest/v1/x?select=id", { method: "GET", timeoutMs: 700 }));
    eq(result.error?.code, "supabase_read_timeout", "read attempt floor: still a read timeout");
    eq(calls.length, 1, "read attempt floor: a 200ms setting does not produce a shorter first attempt (no retry room)");
    between(result.ms, 450, 2500, "read attempt floor is about 500ms");
  });
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv({ SUPABASE_WRITE_TIMEOUT_MS: "100" });
    const result = await timed(() => supabase(env, "/rest/v1/transactions", { method: "POST", body: "{}" }));
    eq(result.error?.code, "supabase_write_result_unknown", "write timeout floor: still uncertain");
    eq(calls.length, 1, "write timeout floor: one dispatch");
    between(result.ms, 2900, 8000, "write timeout floor is about 3000ms");
  });
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv({ SUPABASE_READ_ATTEMPT_MS: "abc" });
    const result = await timed(() => supabase(env, "/rest/v1/x?select=id", { method: "GET", timeoutMs: 1200 }));
    eq(result.error?.code, "supabase_read_timeout", "junk attempt setting: still a read timeout");
    eq(calls.length, 1, "junk attempt setting falls back to the 3000ms default (no retry room in 1200ms)");
    between(result.ms, 1100, 3500, "junk attempt setting: ends at the total budget");
  });

  // 1. 평소 조회: 한 번만 보내고 재시도 기록이 없다.
  await withFetch((n) => okJson([{ id: n }]), async (calls) => {
    const env = makeEnv();
    const data = await supabase(env, "/rest/v1/users?select=id", { method: "GET" });
    eq(JSON.stringify(data), JSON.stringify([{ id: 1 }]), "normal read returns the parsed body");
    eq(calls.length, 1, "normal read dispatches once");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 0, "normal read has no retry");
    eq(env.__AB_MONITOR_REQUEST.db_count, 1, "normal read counts one logical call");
    eq(env.__AB_DB_BUDGET.used, 1, "normal read uses one subrequest");
    ok(calls[0].url.startsWith("https://mock.supabase.co/rest/v1/users"), "read goes to the configured Supabase origin");
  });

  // 2. 첫 조회가 멈추면 짧은 시한 뒤 한 번 더 보내 성공한다. 전체 시한(10초)은 지키고 재시도를 기록한다.
  await withFetch((n, init) => (n === 1 ? stalled(init) : okJson([{ recovered: true }])), async (calls) => {
    const env = makeEnv();
    const result = await timed(() => supabase(env, "/rest/v1/household_members?select=role", { method: "GET" }));
    eq(result.error, null, "stalled first read recovers");
    eq(JSON.stringify(result.value), JSON.stringify([{ recovered: true }]), "retry returns the second response");
    eq(calls.length, 2, "stalled read dispatches twice");
    between(result.ms, 450, 2500, "recovery takes about one attempt budget");
    ok(calls[0].signal?.aborted, "the stalled first attempt was aborted");
    ok(!calls[1].signal?.aborted, "the second attempt was not aborted");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 1, "one retry recorded");
    eq(env.__AB_MONITOR_REQUEST.db_failures, 0, "a recovered read is not a failure");
    eq(env.__AB_MONITOR_REQUEST.db_count, 1, "still one logical call");
    eq(env.__AB_DB_BUDGET.used, 2, "both attempts count against the subrequest budget");
  });

  // 3. 연결 오류(TypeError)도 응답이 없었으면 한 번 더 보낸다.
  await withFetch((n) => (n === 1 ? Promise.reject(new TypeError("Network connection lost")) : okJson([{ again: 1 }])), async (calls) => {
    const env = makeEnv();
    const data = await supabase(env, "/rest/v1/households?select=id", { method: "GET" });
    eq(JSON.stringify(data), JSON.stringify([{ again: 1 }]), "network error read recovers on retry");
    eq(calls.length, 2, "network error read dispatches twice");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 1, "network error retry recorded");
  });

  // 4. 두 번 다 멈추면 전체 시한 안에서 supabase_read_timeout 으로 끝난다(재시도는 한 번뿐).
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv();
    // 전체 시한 2초: 첫 시도(500ms) 타이머가 러너 사정으로 늦어도 재시도 여유(300ms)가 남게 한다.
    const result = await timed(() => supabase(env, "/rest/v1/transactions?select=id", { method: "GET", timeoutMs: 2000 }));
    eq(result.error?.code, "supabase_read_timeout", "double stall ends as read timeout");
    eq(calls.length, 2, "double stall dispatches exactly twice");
    between(result.ms, 1900, 4500, "double stall respects the total budget");
    eq(env.__AB_MONITOR_REQUEST.db_failures, 1, "double stall is one failure");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 1, "double stall recorded one retry");
  });

  // 5. 남은 시한이 300ms 미만이면 다시 보내지 않는다.
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv();
    const result = await timed(() => supabase(env, "/rest/v1/x?select=id", { method: "GET", timeoutMs: 700 }));
    eq(result.error?.code, "supabase_read_timeout", "short budget stall ends as read timeout");
    eq(calls.length, 1, "no retry when the remaining budget is under 300ms");
    between(result.ms, 450, 2500, "short budget stall ends after the first attempt");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 0, "no retry recorded for a short budget");
  });

  // 6. 응답이 온 뒤의 오류(5xx·4xx)는 재시도하지 않는다(상태가 있으면 멈춤이 아니다).
  await withFetch(() => Promise.resolve(new Response("boom", { status: 503 })), async (calls) => {
    const env = makeEnv();
    const result = await timed(() => supabase(env, "/rest/v1/x?select=id", { method: "GET" }));
    ok(/^Supabase 503/.test(result.error?.message || ""), "5xx read throws the status error");
    eq(calls.length, 1, "5xx read is not retried");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 0, "5xx read records no retry");
  });

  // 7. 호출부가 취소한 요청은 보내지 않는다.
  await withFetch((n) => okJson(), async (calls) => {
    const controller = new AbortController(); controller.abort();
    const result = await timed(() => supabase(makeEnv(), "/rest/v1/x", { method: "GET", signal: controller.signal }));
    ok(/cancelled_before_dispatch/.test(result.error?.message || ""), "pre-aborted upstream signal is refused");
    eq(calls.length, 0, "pre-aborted request never dispatches");
  });

  // 8. 쓰기: 멈추면 시한 뒤 결과 불확실로 올리고, 다시 보내지 않는다.
  await withFetch((n, init) => stalled(init), async (calls) => {
    const env = makeEnv();
    const result = await timed(() => supabase(env, "/rest/v1/transactions", { method: "POST", body: JSON.stringify({ amount: 1 }) }));
    eq(result.error?.code, "supabase_write_result_unknown", "stalled write ends as uncertain write");
    eq(result.error?.uncertain_write, true, "stalled write carries the uncertain flag");
    eq(calls.length, 1, "stalled write is never retried");
    between(result.ms, 2900, 8000, "stalled write ends at the write timeout");
    ok(calls[0].signal?.aborted, "stalled write was aborted at the deadline");
    eq(env.__AB_MONITOR_REQUEST.db_failures, 1, "stalled write is a failure");
    eq(env.__AB_MONITOR_REQUEST.db_retries, 0, "stalled write records no retry");
  });

  // 9. 평소 쓰기는 그대로 한 번에 끝난다(상태 2xx, 본문 없음).
  await withFetch(() => Promise.resolve(new Response(null, { status: 204 })), async (calls) => {
    const env = makeEnv();
    const data = await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", { method: "POST", body: "{}", headers: { Prefer: "resolution=merge-duplicates,return=minimal" } });
    eq(data, null, "empty 204 write returns null");
    eq(calls.length, 1, "normal write dispatches once");
    eq(env.__AB_MONITOR_REQUEST.db_failures, 0, "normal write is not a failure");
  });

  // 10. 실패한 쓰기(4xx)는 예전처럼 상태 오류로 올린다(불확실 아님).
  await withFetch(() => Promise.resolve(new Response("bad", { status: 400 })), async () => {
    const result = await timed(() => supabase(makeEnv(), "/rest/v1/transactions", { method: "POST", body: "{}" }));
    ok(/^Supabase 400/.test(result.error?.message || ""), "4xx write stays a status error");
    ok(!result.error?.uncertain_write, "4xx write is not uncertain");
  });

  // 11. HEAD 원본 응답 계약 유지.
  await withFetch(() => Promise.resolve(new Response(null, { status: 200, headers: { "content-range": "0-0/7" } })), async (calls) => {
    const res = await supabase(makeEnv(), "/rest/v1/transactions?select=id", { method: "HEAD", rawHeadResponse: true, headers: { Prefer: "count=exact" } });
    eq(res.headers.get("content-range"), "0-0/7", "HEAD raw response is returned untouched");
    eq(calls.length, 1, "HEAD dispatches once");
  });

  // 12. 예산을 다 쓴 요청은 보내지 않고 재시도도 하지 않는다.
  await withFetch(() => okJson(), async (calls) => {
    const env = makeEnv({ __AB_DB_BUDGET: { used: 50, limit: 50 } });
    const result = await timed(() => supabase(env, "/rest/v1/x", { method: "GET" }));
    eq(result.error?.code, "supabase_subrequest_budget_before_dispatch", "exhausted budget refuses before dispatch");
    eq(calls.length, 0, "exhausted budget never dispatches");
  });

  // 13. 카카오 단톡방 조회: 첫 저장소 호출이 멈춰도 4초 예산 안에서 정상 답이 나간다.
  {
    const f = await createV2265QaFixture();
    f.env.KAKAO_SKILL_SECRET = "synthetic-v73-secret";
    f.env.SUPABASE_READ_ATTEMPT_MS = "500";
    const memoryFetch = globalThis.fetch;
    let stallArmed = false, stalls = 0;
    globalThis.fetch = async (input, init = {}) => {
      const url = new URL(typeof input === "string" ? input : input.url);
      if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic stall QA");
      if (stallArmed && (init.method || "GET") === "GET") { stallArmed = false; stalls += 1; return stalled(init); }
      return memoryFetch(input, init);
    };
    const room = "stall-room", owner = "stall-owner";
    const skill = async (utterance) => {
      const jobs = [];
      const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, userRequest: { utterance, user: { id: owner, type: "botUserKey", properties: { botUserKey: owner } }, chat: { id: room, type: "botGroupKey", properties: { botGroupKey: room } } } };
      const started = performance.now();
      const response = await app.fetch(new Request("https://malhaebook.com/skill", { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": f.env.KAKAO_SKILL_SECRET }, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
      const body = await response.json();
      // 답이 나간 시간만 잰다. 뒤에 도는 waitUntil 작업은 카카오 4초 예산 밖이다.
      const ms = Math.round(performance.now() - started);
      await Promise.allSettled(jobs);
      const text = (body.template?.outputs || []).map((o) => o.simpleText?.text || o.textCard?.description || "").join("\n");
      return { ms, result: response.headers.get("x-accountbook-nlu-result"), text };
    };
    try {
      ok((await skill("@말해가계부 점심 5만원")).text.includes("준비했어요"), "room ledger prepared without stalls");
      stallArmed = true;
      const summary = await skill("@말해가계부 이번달요약");
      eq(stalls, 1, "one read was stalled during the summary");
      eq(summary.result, "ok", "summary still answers normally after one stalled read");
      ok(summary.text.includes("지출: 50,000원"), "summary carries the data from the retried read");
      between(summary.ms, 450, 3500, "summary answers inside the Kakao budget despite the stall");
    } finally {
      globalThis.fetch = realFetch;
      f.restore();
    }
  }

  // 14. 번들·관제 기록.
  const bundle = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  ok(bundle.includes("function supabaseReadAttemptMs(") && bundle.includes("function supabaseWriteTimeoutMs("), "stall guard helpers are in the bundle");
  ok(bundle.includes("SUPABASE_READ_ATTEMPT_MS") && bundle.includes("SUPABASE_WRITE_TIMEOUT_MS"), "stall guard env names are in the bundle");
  const monitor = readFileSync(new URL("../src/modules/runtime/ops-monitor.js", import.meta.url), "utf8");
  ok(monitor.includes("db_retries: 0") && monitor.includes("db_retries: record.db_retries || 0") && monitor.includes("(record.db_retries || 0) > 0"), "monitor records retries and treats them as incidents");
  const handler = readFileSync(new URL("../src/modules/kakao/skill-handler.js", import.meta.url), "utf8");
  ok(handler.includes("db_retries=${env.__AB_MONITOR_REQUEST?.db_retries || 0}"), "skill ok event notes retries");

  console.log(`V22.9.73 요청 멈춤 대비(조회 재시도·쓰기 시한) 검사 통과 (${checks} checks)`);
} catch (error) {
  console.error(error.stack || error.message);
  process.exit(1);
} finally {
  globalThis.fetch = realFetch;
}
