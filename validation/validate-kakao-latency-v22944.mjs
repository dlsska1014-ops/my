// V22.9.44 카카오 5초 제한 대응: 방 기록 경로의 순차 왕복 줄이기(잠금 순서·쓰기 순서는 그대로)와
// 응답 예산(기본 4초)을 넘긴 처리의 먼저 답하기.
// Synthetic in-memory requests only. No live Supabase, Kakao or financial data writes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0, sequence = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const BASE = "https://malhaebook.com";
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || "").join("\n");
const userIdOf = (f, key) => f.db.users.find((u) => u.kakao_user_key === key)?.id;
const roleOf = (f, userId, hid) => f.db.household_members.find((m) => String(m.user_id) === String(userId) && m.household_id === hid)?.role;

async function withFixture(test, { delayMs = 0 } = {}) {
  const f = await createV2265QaFixture();
  f.key = `kakao-latency-qa-${++sequence}`;
  f.room = `${f.key}-room`;
  f.env.KAKAO_SKILL_SECRET = "synthetic-v44-skill-secret";
  f.delayMs = delayMs;
  f.calls = [];
  const memoryFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic latency QA");
    let body = null;
    try { body = init.body ? JSON.parse(String(init.body)) : null; } catch (_) {}
    f.calls.push({ method: init.method || "GET", path: url.pathname, body });
    if (f.delayMs) await new Promise((resolve) => setTimeout(resolve, f.delayMs));
    return memoryFetch(input, init);
  };
  try { await test(f); } finally { f.restore(); }
}

// 실제 카카오 그룹 요청 모양(공식 가이드 v1.11.1): 방 키는 userRequest.chat 에 온다.
async function skill(f, utterance, { key, ctx = "collect" } = {}) {
  const jobs = [];
  const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } }, chat: { id: f.room, type: "botGroupKey", properties: { botGroupKey: f.room } } } };
  const started = Date.now();
  const executionContext = ctx === "none" ? undefined : { waitUntil(job) { jobs.push(job); } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": f.env.KAKAO_SKILL_SECRET }, body: JSON.stringify(payload) }), f.env, executionContext);
  const answeredMs = Date.now() - started;
  const body = await response.json();
  return { response, body, text: textOf(body), answeredMs, settle: () => Promise.allSettled(jobs) };
}

const leaseKeys = (f) => f.calls.filter((c) => c.method === "POST" && c.path === "/rest/v1/rpc/accountbook_claim_operation").map((c) => String(c.body?.p_key || ""));

// 1. 방 기록의 잠금은 예전과 같다: 사용자 → 방 → 가계부 → 메시지 중복 잠금. 준비·참여 쓰기는 없다.
await withFixture(async (f) => {
  const owner = `${f.key}-owner`, member = `${f.key}-member`;
  const first = await skill(f, "@말해가계부 점심 5만원", { key: owner });
  await first.settle();
  const ledger = f.db.transactions.at(-1).household_id;
  ok(first.text.includes("공동 가계부를 준비했어요"), "first record prepares the room ledger");
  const joined = await skill(f, "@말해가계부 커피 4500", { key: member });
  await joined.settle();
  eq(roleOf(f, userIdOf(f, member), ledger), "member", "second participant joins");
  ok(joined.text.includes("참여했어요") && joined.text.includes("내 권한: 기록·수정"), "join notice still states the member permission");

  for (const [who, key, utterance] of [["member", member, "@말해가계부 우유 3300"], ["owner", owner, "@말해가계부 택시 12000"]]) {
    f.calls = [];
    const before = f.db.transactions.length;
    const reply = await skill(f, utterance, { key });
    await reply.settle();
    eq(f.db.transactions.length, before + 1, `${who}: room record is saved`);
    eq(f.db.transactions.at(-1).household_id, ledger, `${who}: record lands in the room ledger`);
    ok(reply.text.includes("저장했어요"), `${who}: normal save reply`);
    const keys = leaseKeys(f);
    const at = (pattern) => keys.findIndex((k) => pattern.test(k));
    ok(at(/^kakao_first_record_lifecycle_v22928:/) >= 0 && at(/^kakao-group-lifecycle:v22931:/) >= 0 && at(new RegExp(`^household-settings-rmw:${ledger}$`)) >= 0 && at(/^kakao-message:/) >= 0, `${who}: user, room, household and message leases are all taken (${keys.join(",")})`);
    ok(at(/^kakao_first_record_lifecycle_v22928:/) < at(/^kakao-group-lifecycle:/) && at(/^kakao-group-lifecycle:/) < at(/^household-settings-rmw:/), `${who}: lease order stays users -> rooms -> households`);
    eq(f.calls.filter((c) => c.method === "POST" && ["/rest/v1/households", "/rest/v1/household_members"].includes(c.path)).length, 0, `${who}: no preparation or membership writes`);
  }
});

// 2. 순차 깊이: 호출마다 100ms 지연일 때 구성원의 방 기록은 1.8초, 참여는 3.1초 안에 끝난다(V22.9.43: 2.0초·3.4초).
await withFixture(async (f) => {
  const owner = `${f.key}-owner`, member = `${f.key}-member`;
  await (await skill(f, "@말해가계부 점심 5만원", { key: owner })).settle();
  f.delayMs = 100;
  let started = Date.now();
  const joined = await skill(f, "@말해가계부 커피 4500", { key: member });
  await joined.settle();
  const joinMs = Date.now() - started;
  ok(joinMs < 3100, `join finishes within 31 sequential calls at 100ms each (${joinMs}ms)`);
  started = Date.now();
  const reply = await skill(f, "@말해가계부 우유 3300", { key: member });
  await reply.settle();
  const recordMs = Date.now() - started;
  ok(recordMs < 1800, `member room record finishes within 18 sequential calls at 100ms each (${recordMs}ms)`);
  ok(reply.text.includes("저장했어요"), "slow-network member record still saves normally");
});

// 3. 응답 예산을 넘기면 먼저 '처리 중'으로 답하고, 처리는 뒤에서 끝까지 마친다. 같은 내용을 바로 다시 보내도 두 번 저장하지 않는다.
await withFixture(async (f) => {
  f.env.KAKAO_RESPONSE_BUDGET_MS = "300";
  const owner = `${f.key}-owner`;
  const households = f.db.households.length;
  const slow = await skill(f, "@말해가계부 점심 5만원", { key: owner });
  ok(slow.answeredMs < 1500, `slow request is answered near the budget (${slow.answeredMs}ms)`);
  ok(slow.text.includes("처리 결과 확인이 조금 늦어지고 있어요"), "deferred answer explains the delay");
  ok(slow.text.includes("오늘 기록 보기"), "deferred answer says how to check the result");
  eq(slow.response.status, 200, "deferred answer is HTTP 200 for Kakao");
  eq(slow.response.headers.get("x-accountbook-nlu-result"), "deferred", "deferred answer is marked");
  ok(!slow.body.template?.quickReplies, "deferred group answer has no quickReplies");
  const resend = await skill(f, "@말해가계부 점심 5만원", { key: owner });
  ok(resend.text.includes("방금 같은 내용을 처리했어요"), "identical resend while the first is still running is held by the in-flight guard");
  await Promise.all([slow.settle(), resend.settle()]);
  eq(f.db.households.length, households + 1, "background work prepared the room ledger");
  eq(f.db.transactions.filter((t) => t.amount === 50000).length, 1, "the record is saved exactly once");
  const health = await (await app.fetch(new Request(`${BASE}/health`), f.env, { waitUntil() {} })).json();
  ok(Number(health.skill_latency?.max_ms || 0) >= 1000, `real latency of the deferred request is still recorded (${health.skill_latency?.max_ms}ms)`);
}, { delayMs: 100 });

// 4. 실행 문맥(waitUntil)이 없으면 먼저 답하지 않는다(뒤에서 마칠 수 없으므로). 예산 안에 끝나면 평소 답을 준다.
await withFixture(async (f) => {
  f.env.KAKAO_RESPONSE_BUDGET_MS = "300";
  const noCtx = await skill(f, "@말해가계부 점심 5만원", { key: `${f.key}-owner`, ctx: "none" });
  ok(noCtx.text.includes("공동 가계부를 준비했어요"), "without waitUntil the full answer is returned");
  f.delayMs = 0;
  const fast = await skill(f, "@말해가계부 커피 4500", { key: `${f.key}-member` });
  await fast.settle();
  ok(!fast.text.includes("늦어지고"), "a request within the budget is never deferred");
  ok(fast.text.includes("참여했어요"), "a request within the budget gets its normal answer");
}, { delayMs: 100 });

// 5. 소스 계약: 기본 예산 4초(범위 0.2~4.7초), 남은 처리는 ctx.waitUntil 로, 계정 통합 확인은 첫 쓰기 전에 끝난다.
{
  const handler = readFileSync(new URL("../src/modules/kakao/skill-handler.js", import.meta.url), "utf8");
  const room = readFileSync(new URL("../src/modules/kakao/group-links-first-record.js", import.meta.url), "utf8");
  ok(handler.includes("boundedRuntimeNumber(env.KAKAO_RESPONSE_BUDGET_MS, 4000, 200, 4700)"), "response budget defaults to 4000ms within 200..4700");
  ok(handler.includes("ctx.waitUntil(work.then("), "deferred work continues under waitUntil");
  const unmergedStart = room.indexOf("const userUnmerged = kakaoClaimUserUnmerged(env, user.id);");
  const unmergedAwait = room.indexOf("if (!(await userUnmerged)) throw new Error(\"kakao_group_identity_scope_changed\");");
  const firstWrite = room.indexOf("marker = parseKakaoGroupFirstMarker(await insertKakaoGroupFirstSetting(");
  ok(unmergedStart > 0 && unmergedAwait > unmergedStart && firstWrite > unmergedAwait, "identity merge check is awaited before the first room write");
  ok(room.includes("preparing ? Promise.resolve(null) : supabase(env, roleRowsPath, { method: \"GET\" })"), "household and role are read together only when not preparing");
  ok(room.includes("let roleRows = initialRoleRows || await supabase(env, roleRowsPath, { method: \"GET\" });"), "role is re-read after preparation");
}

console.log(`PASS: V22.9.44 Kakao latency and response budget (${checks} checks)`);
