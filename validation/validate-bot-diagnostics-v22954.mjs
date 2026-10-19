import assert from "node:assert/strict";
import { app, BASE, counter, fixture, intercept, failure, putSetting, skill, withClock } from "./lib-audit-v22934.mjs";
import { AB_KAKAO_REPEAT_GUARD, AB_KAKAO_INFLIGHT, cleanupNluOpsRetention, scheduleNluOpsPersistence } from "../src/modules/runtime/ops-telemetry.js";
import {formatDate,nowKstDate} from "../src/modules/nlu/date-payment.js";

const { ok, eq, deepEq, done } = counter("BOT diagnostics V22.9.54");
globalThis.fetch = async () => { throw new Error("External fetch forbidden"); };
const privateText = "합성김민지 강남구 역삼동 010-1234-5678 qa.private@example.test https://example.test/token?code=SYN12345 인증번호 123456";
const drain = async (env, event) => {
  const jobs = [];
  scheduleNluOpsPersistence({ waitUntil: job => jobs.push(job) }, env, event);
  await Promise.all(jobs);
};

await withClock("2026-10-15", async () => {
  for (const config of [
    { NLU_METRICS_ENABLED: "0", NLU_PERSIST_FAILURE_SAMPLES: "0", NLU_STORE_REDACTED_TEXT: "0" },
    { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_STORE_REDACTED_TEXT: "0" },
    { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_STORE_REDACTED_TEXT: "1" },
  ]) await fixture(async fx => {
    AB_KAKAO_REPEAT_GUARD.clear(); AB_KAKAO_INFLIGHT.clear();
    Object.assign(fx.env, config);
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    fx.db.transactions = [];
    const calls = [];
    intercept(({url, method, init}) => {
      if (/unrecognized_inputs|record_nlu_/.test(url.pathname)) {
        calls.push({ method, path: url.pathname, body: JSON.parse(init.body || "null") });
        return new Response("[]", { headers: { "content-type": "application/json" } });
      }
    });
    await skill(fx, "합성 커피 4500원 현금");
    eq(fx.db.transactions[0].raw_text, "합성 커피 4500원 현금", "business raw_text preserved");
    await skill(fx, "수정 01번");
    const reply = await skill(fx, "날짜 " + privateText);
    ok(/날짜|다시|항목|무엇/.test(reply), "edit failure still answers: " + reply);
    eq(fx.db.transactions.length, 1, "explicit failed edit creates no new transaction");
    await new Promise(resolve => setImmediate(resolve));
    eq(calls.filter(c => /unrecognized_inputs/.test(c.path)).length, 0, "legacy raw diagnostic POST absent");
    if (config.NLU_METRICS_ENABLED === "0") eq(calls.length, 0, "all off sends no diagnostics");
    else {
      ok(calls.length > 0, "enabled minimal diagnostics run");
      for (const call of calls) {
        eq(call.method, "POST", "diagnostic method");
        ok(!/합성김민지|역삼동|010-1234|qa\.private|example\.test|SYN12345|123456|kakao_login|house-home|user-bin/.test(JSON.stringify(call.body)), "request body has no input or direct scope");
        if (call.path.endsWith("record_nlu_failure_sample")) eq(call.body.p_redacted_sample, null, "legacy redacted mode never sends text");
      }
    }
    await skill(fx, "취소");
    const before = fx.db.transactions[0].amount;
    await skill(fx, "수정 01번 금액 5000원");
    eq(before, 4500, "pre-edit value");
    eq(fx.db.transactions[0].amount, 5000, "normal editing preserved");
  });
});

for (const outcome of ["ok", "404", "503", "network"]) await fixture(async fx => {
  Object.assign(fx.env, {NLU_METRICS_ENABLED:"1", NLU_PERSIST_FAILURE_SAMPLES:"1", NLU_STORE_REDACTED_TEXT:"1"});
  const calls = [];
  intercept(({url, method, init}) => {
    if (url.pathname.includes("record_nlu_")) {
      calls.push({method, path:url.pathname, body:JSON.parse(init.body)});
      if (outcome === "network") throw new Error(privateText);
      return outcome === "ok" ? new Response("[]") : failure(Number(outcome), privateText);
    }
  });
  await drain(fx.env, {intent:privateText, result:"error", reason:privateText, version:privateText, utterance:privateText});
  eq(calls.length, 2, "both diagnostic requests captured");
  for (const call of calls) {
    ok(!JSON.stringify(call.body).includes("합성김민지"), "arbitrary error/intent/version excluded");
    eq(call.body.p_intent, "UNKNOWN", "intent allowlist");
  }
  AB_KAKAO_REPEAT_GUARD.clear();AB_KAKAO_INFLIGHT.clear();
  putSetting(fx,"kakao_selected_household_v2251:user-bin","house-home");
  fx.db.transactions=[];
  await skill(fx,"진단장애커피 4501원 현금");
  await skill(fx,"수정 01번");
  const reply=await skill(fx,"날짜 "+privateText);
  ok(/날짜|다시|무엇|항목/.test(reply),"diagnostic failure preserves actual edit response "+outcome);
  await skill(fx,"취소");await skill(fx,"수정 01번 금액 5001원");
  eq(fx.db.transactions[0].amount,5001,"diagnostic failure preserves normal edit write "+outcome);
  eq(fx.db.transactions.length,1,"diagnostic failure creates no extra transaction "+outcome);
});

await fixture(async fx => {
  fx.env.NLU_PERSIST_FAILURE_SAMPLES = "0";
  const savedNow = Date.now;
  const now = Date.parse("2026-10-15T15:00:00.000Z");
  Date.now = () => now;
  try {
    const cutoff = now - 14 * 86400000;
    fx.db.nlu_failure_samples = [-1, 0, 1].map((offset, i) => ({id:String(i), last_seen:new Date(cutoff + offset).toISOString()}));
    const calls = [];
    intercept(({url, method, init}) => { if (method === "DELETE") calls.push({method,path:url.pathname,query:url.search,body:init.body}); });
    const result = await cleanupNluOpsRetention(fx.env);
    eq(result.ok, true, "cleanup works with collection off");
    deepEq(fx.db.nlu_failure_samples.map(r => r.id), ["1", "2"], "strict boundary retains exact cutoff and newer");
    eq(calls.length, 1, "single known-table cleanup");
    eq(calls[0].path, "/rest/v1/nlu_failure_samples", "fixed cleanup target");
    eq(new URLSearchParams(calls[0].query).get("last_seen"), "lt." + new Date(cutoff).toISOString(), "exact last_seen cutoff");
    eq(calls[0].body, undefined, "no cleanup body");
    for (const value of ["", "0", "-1", "1.5", "91", "NaN", "Infinity", "14days", null]) {
      fx.env.NLU_FAILURE_RETENTION_DAYS = value;
      await assert.rejects(cleanupNluOpsRetention(fx.env), /nlu_retention_days_invalid/);
      eq(calls.length, 1, "invalid retention sends no DELETE " + value);
    }
    delete fx.env.NLU_FAILURE_RETENTION_DAYS;
    Date.now = () => NaN;
    await assert.rejects(cleanupNluOpsRetention(fx.env), /nlu_retention_clock_invalid/);
    eq(calls.length, 1, "invalid clock sends no DELETE");
    Date.now = () => now;
    intercept(({url, method}) => method === "DELETE" && url.pathname.endsWith("nlu_failure_samples") ? failure(404, "PGRST205") : undefined);
    await assert.rejects(cleanupNluOpsRetention(fx.env));
    ok(true, "missing table is not cleanup success");
  } finally { Date.now = savedNow; }
});
done();
