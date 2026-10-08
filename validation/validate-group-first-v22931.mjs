// Synthetic in-memory requests only. No live Supabase, Kakao or financial data writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import app, * as runtime from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0, sequence = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const textOf = body => body.template?.outputs?.map(output => output.simpleText?.text || "").join("\n") || "";
const row = (f, key) => f.db.accountbook_settings.find(item => item.key === key);
const put = (f, key, value) => { const previous = row(f, key); if (previous) previous.value = typeof value === "string" ? value : JSON.stringify(value); else f.db.accountbook_settings.push({ key, value: typeof value === "string" ? value : JSON.stringify(value) }); };
const digest = value => createHash("sha256").update(String(value)).digest("hex");
const BASE = "https://malhaebook.com";
const codePattern = /[A-HJ-NP-Z2-9]{8}(?:-[A-HJ-NP-Z2-9]{8}){3}/;

async function withFixture(test) {
  const f = await createV2265QaFixture();
  f.key = `group-first-qa-${++sequence}`;
  f.group = `${f.key}-room`;
  f.env.KAKAO_SKILL_SECRET = "synthetic-v31-skill-secret";
  const memoryFetch = globalThis.fetch;
  f.trace = [];
  f.intercept = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic group QA");
    const call = { url, method: init.method || "GET", body: init.body ? JSON.parse(String(init.body)) : null, headers: new Headers(init.headers || {}) };
    f.trace.push(call);
    if (f.enforce50 && f.trace.length > 50) throw new Error("synthetic_invocation_subrequest_limit50");
    const intercepted = f.intercept ? await f.intercept(call, input, init, memoryFetch) : undefined;
    return intercepted || memoryFetch(input, init);
  };
  try { await test(f); } finally { f.restore(); }
}

async function skill(f, utterance, { key = f.key, group = f.group, auth = true, wrong = false, type = "botUserKey", properties = {}, requestFields = {}, rootFields = {} } = {}) {
  const jobs = [];
  const headers = { "content-type": "application/json", "user-agent": f.key };
  if (auth) headers["x-kakao-skill-secret"] = wrong ? "synthetic-wrong-secret" : f.env.KAKAO_SKILL_SECRET;
  const payload = { userRequest: { utterance, user: { id: key, type, properties: { ...properties, ...(group ? { botGroupKey: group } : {}) } }, ...requestFields }, ...rootFields };
  const response = await app.fetch(new Request(BASE + "/skill", { method: "POST", headers, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
  const background = await Promise.allSettled(jobs);
  return { response, body: await response.json(), background, text: undefined };
}
async function web(f, path, userId, values) {
  return app.fetch(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", cookie: await f.cookieFor(userId), origin: BASE, "sec-fetch-site": "same-origin", "user-agent": f.key }, body: new URLSearchParams(values) }), f.env, { waitUntil() {} });
}
function writes(f, table) { return f.trace.filter(call => call.method === "POST" && call.url.pathname === `/rest/v1/${table}`); }
async function auto(f) {
  const keys = await runtime.kakaoGroupFirstKeys(f.group);
  return { keys, marker: JSON.parse(row(f, keys.marker)?.value || "null"), done: JSON.parse(row(f, keys.done)?.value || "null") };
}
function assertEnvelope(result, label) {
  eq(result.response.status, 200, `${label}: Skill HTTP200`);
  eq(result.body.version, "2.0", `${label}: Kakao v2 envelope`);
  ok(!result.body.template?.quickReplies, `${label}: no group quickReplies`);
  const allowed = new Set(["simpleText", "simpleImage", "textCard", "basicCard", "listCard", "itemCard"]);
  ok(result.body.template.outputs.every(output => Object.keys(output).length === 1 && allowed.has(Object.keys(output)[0])), `${label}: supported group outputs`);
  ok(result.body.template.outputs.length <= 3, `${label}: maximum three outputs`);
  ok(!JSON.stringify(result.body).includes("commerceCard") && !JSON.stringify(result.body).includes("carousel"), `${label}: no commerce or carousel`);
  ok(!codePattern.test(textOf(result.body)), `${label}: no private web credential`);
}

// Count every actual Data API/RPC fetch, including collected NLU background jobs.
for (const variant of [{ count: 1 }, { count: 3 }, { count: 25 }, { count: 25, mixed: true }]) {
  await withFixture(async f => {
    f.enforce50 = true;
    Object.assign(f.env, { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_FAILURE_SAMPLE_RATE: "1" });
    const before = { users: f.db.users.length, households: f.db.households.length, tx: f.db.transactions.length };
    const utterance = Array.from({ length: variant.count }, (_, index) => `커피 ${4500 + index}`).join(", ");
    const result = await skill(f, utterance, { properties: variant.mixed ? { botUserKey: f.key, appUserId: `synthetic-app-${sequence}` } : {} });
    const coldCalls = f.trace.length;
    console.log(`group startup ${variant.count}${variant.mixed ? " bot+app" : ""}: ${coldCalls} subrequests including collected background`);
    assertEnvelope(result, `cold${variant.count}`);
    ok(result.background.every(job => job.status === "fulfilled"), "NLU background promises fulfill within invocation50");
    ok(coldCalls <= 50, "actual cold fetches respect invocation50");
    eq(f.db.users.length - before.users, 1, "one new stable identity");
    eq(f.db.households.length - before.households, 1, "one shared room ledger");
    eq(f.db.transactions.length - before.tx, variant.count, "complete cold first batch actually stored");
    const state = await auto(f), saved = f.db.transactions.at(-1);
    eq(state.marker.phase, "complete", "persistent preparation completed");
    eq(state.done.candidate_id, saved.household_id, "completion marker fixed ledger matches transactions");
    eq(state.done.owner_id, saved.user_id, "first caller remains owner");
    eq(f.db.household_members.find(member => member.household_id === saved.household_id && member.user_id === saved.user_id)?.role, "owner", "fresh owner row exists");
    ok(textOf(result.body).includes("공동") && textOf(result.body).includes("소유자"), "first reply explains shared visibility and first owner");
    ok(!f.db.accountbook_settings.some(item => item.key.startsWith("kakao_first_record_v22928:")), "group does not seed a private first-use marker");
    ok(!row(f, `kakao_selected_household_v2251:${saved.user_id}`), "group does not publish a private selection");
    f.trace = [];
    const repeat = await skill(f, utterance + " ");
    eq(f.db.transactions.length - before.tx, variant.count, "warm retransmission keeps original rows");
    ok(f.trace.length <= 50, "warm repeat and NLU fit invocation50");
    assertEnvelope(repeat, "warm retry");
  });
}

// Returning users, personal selection and lifecycle history never prevent fresh A/B/C rooms.
for (const kind of ["new", "existing-empty", "existing-selected"]) {
  await withFixture(async f => {
    let userId = "";
    if (kind === "existing-empty") { userId = `${f.key}-returning`; f.db.users.push({ id: userId, kakao_user_key: f.key, nickname: "Returning" }); put(f, `kakao_first_record_history_v22928:${userId}`, { version: 1, user_id: userId }); }
    if (kind === "existing-selected") { userId = "user-bin"; f.key = "kakao_login:2265"; put(f, `kakao_selected_household_v2251:${userId}`, "house-home"); }
    const before = f.db.households.length;
    const ids = [];
    for (const name of ["A", "B", "C"]) {
      const beforeTx = f.db.transactions.length;
      const result = await skill(f, "커피 4500", { group: `${f.group}-${name}` });
      eq(f.db.transactions.length, beforeTx + 1, `${kind}/${name}: first room record saved`);
      const saved = f.db.transactions.at(-1);
      if (!userId) userId = saved.user_id;
      eq(saved.user_id, userId, `${kind}/${name}: stable identity reused`);
      ids.push(saved.household_id);
      assertEnvelope(result, `${kind}/${name}`);
    }
    eq(new Set(ids).size, 3, `${kind}: each room owns a different ledger`);
    eq(f.db.households.length, before + 3, `${kind}: exactly one ledger per room`);
    eq(row(f, `kakao_selected_household_v2251:${userId}`)?.value || "", kind === "existing-selected" ? "house-home" : "", `${kind}: existing selection preserved`);
    ok(f.db.transactions.some(tx => tx.household_id === "house-home" && tx.id === "tx-income-1"), `${kind}: original financial rows preserved`);
  });
}

await withFixture(async f => {
  const beforeTx = f.db.transactions.length;
  await skill(f, "커피 4500");
  const first = f.db.transactions.at(-1), secondKey = `${f.key}-second`;
  const result = await skill(f, "커피 4500", { key: secondKey });
  assertEnvelope(result, "second room participant");
  eq(f.db.transactions.length, beforeTx + 2, "second caller actually stores a shared record");
  const second = f.db.transactions.at(-1);
  eq(second.household_id, first.household_id, "two callers share the same room ledger");
  ok(second.user_id !== first.user_id, "two callers retain separate identities");
  const member = f.db.household_members.find(item => item.user_id === second.user_id && item.household_id === first.household_id);
  eq(member.role, "member", "absent second caller receives member permission");
  eq((await auto(f)).done.owner_id, first.user_id, "first owner never changes");
  ok(textOf(result.body).includes("공동") && textOf(result.body).includes("참여"), "second response explains shared membership");
  for (const role of ["pending", "blocked", "viewer"]) {
    member.role = role;
    const count = f.db.transactions.length;
    f.trace = [];
    const rejected = await skill(f, "우유 3300", { key: secondKey });
    eq(f.db.transactions.length, count, `${role}: zero writes after owner role change`);
    eq(member.role, role, `${role}: membership is never overwritten`);
    eq(writes(f, "household_members").length, 0, `${role}: no automatic membership POST`);
    ok(textOf(rejected.body).includes(role === "pending" ? "승인 대기" : role === "blocked" ? "사용이 제한" : "조회 전용"), `${role}: actual role is explained`);
  }
  member.role = "member";
  const changed = await web(f, "/my/household/update", first.user_id, { household_id: first.household_id, household_name: "가족 공동 기록" });
  eq(changed.status, 303, "existing household-name settings work for prepared ledger");
  await skill(f, "예산 50만원");
  ok(f.db.accountbook_budgets.some(item => item.household_id === first.household_id && item.amount === 500000), "existing budget path configures the same ID");
  await skill(f, "과자 2300", { key: secondKey });
  eq(f.db.transactions.at(-1).household_id, first.household_id, "renaming and budgeting keep the original ledger");
  eq(f.db.households.find(item => item.id === first.household_id).name, "가족 공동 기록", "recording does not reset customized name");
});

// Exact configured Secret + strong actor identity guard every command on a completed auto room.
for (const mode of ["off", "observe"]) {
  await withFixture(async f => {
    await skill(f, "커피 5000");
    f.env.KAKAO_SKILL_AUTH_MODE = mode;
    if (mode === "off") f.env.KAKAO_SKILL_SECRET = ""; // Actual off mode requires no configured Secret.
    for (const auth of [{ auth: false }, { wrong: true }, { key: "legacy-actor", type: "plusfriendUserKey", properties: { plusfriendUserKey: "legacy-actor" } }]) {
      for (const utterance of ["커피 5000", "이번 달 요약", "오늘 기록 보기", "예산 50만원", "가계부 전환", "월 정기 등록"] ) {
        f.trace = [];
        const count = f.db.transactions.length, members = JSON.stringify(f.db.household_members);
        const result = await skill(f, utterance, auth);
        eq(f.db.transactions.length, count, `${mode}/${utterance}: untrusted actor saves no rows`);
        eq(JSON.stringify(f.db.household_members), members, `${mode}/${utterance}: untrusted actor receives no membership`);
        eq(f.trace.filter(call => ["transactions", "accountbook_budgets", "accountbook_recurring"].some(table => call.url.pathname === `/rest/v1/${table}`)).length, 0, `${mode}/${utterance}: no financial read or write`);
        ok(textOf(result.body).includes("인증된"), `${mode}/${utterance}: authentication failure stated`);
        assertEnvelope(result, `${mode}/${utterance}`);
      }
    }
  });
}

// General conversation/help/query, legacy group inference and untrusted new requests never create.
for (const options of [{ group: "" }, { group: "", requestFields: { chat: { id: "legacy-chat-only" } } }, { group: "", properties: { groupKey: "legacy-group-only" } }, { key: "legacy-user", type: "plusfriendUserKey", properties: { plusfriendUserKey: "legacy-user" } }, { auth: false }, { wrong: true }]) {
  await withFixture(async f => {
    f.env.KAKAO_SKILL_AUTH_MODE = "observe";
    const before = f.db.households.length, members = f.db.household_members.length;
    await skill(f, "커피 5000", options);
    if (options.group !== "" || options.requestFields || options.properties?.groupKey) {
      eq(f.db.households.length, before, "untrusted or inferred room cannot prepare a ledger");
      eq(f.db.household_members.length, members, "untrusted or inferred room cannot autojoin");
    }
  });
}
for (const utterance of ["안녕", "도움말", "시작", "이번 달 요약", "오늘 기록 보기", "예산 설정", "5000", "내일 보자", "웹 가계부 열기"]) {
  await withFixture(async f => {
    const before = f.db.households.length, members = f.db.household_members.length;
    const result = await skill(f, utterance);
    eq(f.db.households.length, before, `${utterance}: no preparation without an explicit transaction`);
    eq(f.db.household_members.length, members, `${utterance}: no automatic membership`);
    ok(!codePattern.test(textOf(result.body)), `${utterance}: group contains no private web code`);
  });
}

await withFixture(async f => {
  const manual = await runtime.bindKakaoGroupByInviteCode(f.env, { id: "user-bin" }, f.group, "HOME2265");
  ok(manual.ok, "existing manual group binding remains available to its owner");
  const before = f.db.transactions.length, households = f.db.households.length;
  f.trace = [];
  await skill(f, "커피 5000");
  eq(f.db.transactions.length, before, "manual ledger never autojoins an unrelated room caller");
  eq(f.db.households.length, households, "manual ledger never creates a fallback ledger");
  eq(writes(f, "household_members").length, 0, "manual ledger membership remains explicit");
  const user = f.db.users.find(item => item.kakao_user_key === f.key);
  const pending = await runtime.joinHouseholdByCode(f.env, user.id, "HOME2265");
  eq(pending.join_role, "pending", "existing manual invitation approval policy stays pending");
});

await withFixture(async f => {
  const start = f.db.households.length, count = f.db.transactions.length;
  await Promise.all([skill(f, "점심 11000"), skill(f, "커피 5100", { key: `${f.key}-other` })]);
  eq(f.db.households.length, start + 1, "concurrent distinct first callers prepare one ledger");
  const state = await auto(f), ledger = state.done.candidate_id;
  eq(f.db.household_members.filter(item => item.household_id === ledger && item.role === "owner").length, 1, "concurrent room has one initial owner");
  await skill(f, "과자 2100", { key: `${f.key}-other` });
  ok(f.db.transactions.length >= count + 2, "queued or retried caller actually records on same ledger");
  ok(f.db.transactions.slice(count).every(tx => tx.household_id === ledger), "concurrent calls never split room scope");
  eq((await auto(f)).done.owner_id, state.done.owner_id, "retry does not change first owner");
});

// Unknown remote writes: phase was persisted before sending; absent fixed rereads never resend.
for (const stage of ["households", "owner", "member", "link"]) {
  for (const commit of [false, true]) {
    await withFixture(async f => {
      let actor = f.key;
      if (stage === "member") { await skill(f, "점심 10000"); actor += "-new-member"; }
      const initialCount = f.db.transactions.length, initialHouseholds = f.db.households.length;
      let sent = 0, intercepted = false, delayedCommit;
      f.intercept = async (call, input, init, memoryFetch) => {
        const target = call.method === "POST" && (stage === "households" ? call.url.pathname === "/rest/v1/households" : stage === "owner" || stage === "member" ? call.url.pathname === "/rest/v1/household_members" && call.body.role === (stage === "owner" ? "owner" : "member") : call.url.pathname === "/rest/v1/accountbook_settings" && call.body.key === runtime.kakaoGroupLinkItemSettingsKey(f.group));
        if (!target) return;
        sent++;
        if (!intercepted) { intercepted = true; delayedCommit = () => memoryFetch(input, init); if (commit) await delayedCommit(); throw new Error("synthetic lost write response"); }
      };
      const first = await skill(f, "커피 5500", { key: actor });
      eq(sent, 1, `${stage}/${commit}: one remote stage POST`);
      eq(f.db.transactions.length, initialCount + (commit ? 1 : 0), `${stage}/${commit}: only confirmed preparation saves a transaction`);
      if (!commit) ok(textOf(first.body).includes("확정"), `${stage}: unknown stage is described as unresolved`);
      const candidate = (await auto(f)).marker.candidate_id;
      await skill(f, "우유 3500", { key: actor });
      eq(sent, 1, `${stage}/${commit}: next invocation never repeats unknown POST`);
      eq((await auto(f)).marker.candidate_id, candidate, `${stage}/${commit}: candidate ID remains fixed`);
      eq(f.db.households.length, initialHouseholds + (stage === "member" ? 0 : stage === "households" && !commit ? 0 : 1), `${stage}/${commit}: no compensation or replacement ledger`);
      eq(f.trace.filter(call => call.method === "DELETE" && call.url.pathname === "/rest/v1/households").length, 0, `${stage}/${commit}: no compensation DELETE`);
      if (!commit) {
        await delayedCommit();
        await skill(f, "과자 2500", { key: actor });
        eq(f.db.transactions.length, initialCount + 1, `${stage}: late commit is recovered by fixed-ID reads`);
        eq(sent, 1, `${stage}: recovery never repeats the original remote POST`);
        eq((await auto(f)).done.candidate_id, candidate, `${stage}: late confirmation keeps original candidate`);
      }
    });
  }
}

await withFixture(async f => {
  await skill(f, "점심 10000");
  const state = await auto(f), ledger = state.done.candidate_id, owner = state.done.owner_id;
  await skill(f, "커피 5000", { key: `${f.key}-member` });
  const member = f.db.transactions.at(-1).user_id;
  const left = await web(f, "/my/household/leave", member, { household_id: ledger, understand_history: "1" });
  eq(left.status, 303, "shared member can leave through existing route");
  ok(left.headers.get("location").includes("household_left"), "leave succeeds with confirmed result");
  const count = f.db.transactions.length;
  const rejected = await skill(f, "과자 2500", { key: `${f.key}-member` });
  eq(f.db.transactions.length, count, "departed member is not automatically rejoined");
  ok(textOf(rejected.body).includes("나간"), "departure refusal explains manual rejoin");
  ok(!f.db.household_members.some(item => item.user_id === member && item.household_id === ledger), "departure stays absent");
  ok(f.db.transactions.some(tx => tx.user_id === member && tx.household_id === ledger), "leaving preserves shared historical rows");
  // Blocked callers still cannot use leave to escape the owner's restriction.
  f.db.household_members.push({ user_id: member, household_id: ledger, role: "blocked" });
  const blocked = await web(f, "/my/household/leave", member, { household_id: ledger, understand_history: "1" });
  ok(blocked.headers.get("location").includes("join_blocked"), "blocked leave protection remains");
  eq(f.db.household_members.find(item => item.user_id === member && item.household_id === ledger)?.role, "blocked", "blocked row not removed");
  eq(f.db.household_members.find(item => item.user_id === owner && item.household_id === ledger)?.role, "owner", "owner remains unchanged");
});

for (const action of ["unbind", "purge"]) {
  await withFixture(async f => {
    await skill(f, "점심 10000");
    const state = await auto(f), ledger = state.done.candidate_id;
    const count = f.db.transactions.length;
    if (action === "unbind") await runtime.removeKakaoGroupLink(f.env, f.group);
    else {
      put(f, `arbitrary:${ledger}:retained`, "not-a-purge-prefix");
      await runtime.purgeHouseholdData(f.env, ledger);
      ok(row(f, `arbitrary:${ledger}:retained`), "fixture mirrors explicit SQL purge prefixes");
      ok(row(f, state.keys.marker) && row(f, state.keys.done), "group preparation metadata survives atomic purge");
    }
    const households = f.db.households.length;
    const result = await skill(f, "우유 3500");
    eq(f.db.households.length, households, `${action}: no replacement ledger`);
    eq(f.db.transactions.length, action === "unbind" ? count : count - 1, `${action}: no fallback record`);
    ok(row(f, state.keys.retired), `${action}: separate durable retirement exists`);
    ok(textOf(result.body).includes("어디에도 저장하지"), `${action}: zero save is explicit`);
    // A delayed pending-marker completion must not resurrect a retired room.
    put(f, state.keys.marker, { ...state.marker, phase: "reserved" });
    const other = await skill(f, "과자 2500", { key: `${f.key}-late` });
    eq(f.db.households.length, households, `${action}: late pending state cannot recreate`);
    ok(textOf(other.body).includes("저장하지"), `${action}: late state still rejects`);
  });
}

// Manual rebinding preserves old rows and disables automatic membership in the new ledger.
await withFixture(async f => {
  await skill(f, "점심 10000");
  const state = await auto(f), old = state.done.candidate_id, owner = state.done.owner_id;
  f.db.household_members.push({ user_id: owner, household_id: "house-trip", role: "admin" });
  const rebound = await runtime.bindKakaoGroupByInviteCode(f.env, { id: owner }, f.group, "TRIP2265", { allowReplace: true });
  ok(rebound.ok, "existing owner/admin can explicitly rebind a prepared room");
  ok(f.db.transactions.some(tx => tx.household_id === old && tx.memo === "점심"), "rebind preserves records in old ledger");
  const before = f.db.transactions.length;
  await skill(f, "커피 5500", { key: `${f.key}-outsider` });
  eq(f.db.transactions.length, before, "new manual target cannot autojoin an outsider");
  await skill(f, "택시 12500");
  eq(f.db.transactions.at(-1).household_id, "house-trip", "explicitly authorized target gets later records");
  ok(f.db.transactions.some(tx => tx.household_id === old), "old records are never migrated to new target");
});

// Strict bundled settings/member reads fail closed, including existing financial scope.
for (const failure of ["settings", "membership", "malformed-household", "null-household", "malformed-role", "malformed-marker", "malformed-departure"]) {
  await withFixture(async f => {
    await skill(f, "점심 10000");
    const state = await auto(f), before = f.db.transactions.length;
    if (failure === "malformed-marker") put(f, state.keys.marker, "{broken");
    if (failure === "malformed-departure") put(f, `kakao_group_departed_v22931:${digest(state.done.owner_id)}`, "[]");
    f.intercept = call => {
      if (failure === "malformed-household" && call.method === "GET" && call.url.pathname === "/rest/v1/households") return new Response(JSON.stringify({ incomplete: true }), { status: 200 });
      if (failure === "null-household" && call.method === "GET" && call.url.pathname === "/rest/v1/households") return new Response("null", { status: 200 });
      if (failure === "malformed-role" && call.method === "GET" && call.url.pathname === "/rest/v1/household_members" && call.url.searchParams.has("household_id")) return new Response("[{}]", { status: 200 });
      if (call.method === "GET" && (failure === "settings" && call.url.pathname === "/rest/v1/accountbook_settings" && call.url.searchParams.get("key")?.startsWith("in.") || failure === "membership" && call.url.pathname === "/rest/v1/household_members" && call.url.searchParams.has("household_id"))) return new Response(JSON.stringify({ message: "synthetic strict read outage" }), { status: 503 });
    };
    f.trace = [];
    await skill(f, "우유 3500");
    eq(f.db.transactions.length, before, `${failure}: zero records on unknown reads`);
    eq(writes(f, "household_members").length, 0, `${failure}: no permission repair on unknown reads`);
    eq(writes(f, "households").length, 0, `${failure}: no substitute household`);
  });
}

// A query/help invocation by a new participant does not itself grant room membership.
await withFixture(async f => {
  await skill(f, "커피 4500");
  const before = f.db.household_members.length, count = f.db.transactions.length;
  for (const utterance of ["시작", "도움말", "이번 달 요약", "오늘 기록 보기", "웹 가계부 열기"]) {
    const result = await skill(f, utterance, { key: `${f.key}-observer` });
    eq(f.db.household_members.length, before, `${utterance}: no automatic participation from reading`);
    eq(f.db.transactions.length, count, `${utterance}: no recording from reading`);
    ok(!codePattern.test(textOf(result.body)), `${utterance}: no observer web credential`);
  }
});

for (const utterance of [Array.from({ length: 26 }, () => "커피 4500").join(", "), "커피 999999999999원"]) {
  await withFixture(async f => {
    const before = f.db.households.length, count = f.db.transactions.length;
    const result = await skill(f, utterance);
    eq(f.db.households.length, before, "rejected amount/batch does not prepare a room");
    eq(f.db.transactions.length, count, "rejected amount/batch saves zero rows");
    ok(textOf(result.body).includes("저장하지"), "rejected batch clearly states no save");
  });
}
await withFixture(async f => {
  const before = f.db.transactions.length;
  await skill(f, "커피 4500, 커피 4500");
  eq(f.db.transactions.length, before + 2, "same-message identical entries are two legitimate rows");
});

// A collaborating bind/unbind/leave/purge waits until the in-flight record is committed.
for (const mutation of ["bind", "unbind", "leave", "purge"]) {
  await withFixture(async f => {
    await skill(f, "커피 4500");
    const state = await auto(f), ledger = state.done.candidate_id, owner = state.done.owner_id;
    let actor = f.key, actorId = owner;
    if (mutation === "bind") f.db.household_members.push({ household_id: "house-trip", user_id: owner, role: "admin" });
    if (mutation === "leave") { actor += "-member"; await skill(f, "점심 10000", { key: actor }); actorId = f.db.transactions.at(-1).user_id; }
    let entered, resume;
    const enteredPromise = new Promise(resolve => { entered = resolve; });
    const resumePromise = new Promise(resolve => { resume = resolve; });
    let paused = false;
    f.intercept = async call => {
      if (!paused && call.method === "POST" && call.url.pathname === "/rest/v1/transactions") { paused = true; entered(); await resumePromise; }
    };
    const count = f.db.transactions.length;
    const record = skill(f, "택시 12500", { key: actor });
    await enteredPromise;
    let finished = false;
    const mutate = (mutation === "bind" ? runtime.bindKakaoGroupByInviteCode(f.env, { id: owner }, f.group, "TRIP2265", { allowReplace: true }) : mutation === "unbind" ? runtime.removeKakaoGroupLink(f.env, f.group) : mutation === "purge" ? runtime.purgeHouseholdData(f.env, ledger) : web(f, "/my/household/leave", actorId, { household_id: ledger, understand_history: "1" })).then(result => { finished = true; return result; });
    await new Promise(resolve => setTimeout(resolve, 5));
    eq(finished, false, `${mutation}: lifecycle mutation waits for record's room/user lease`);
    resume();
    const saved = await record;
    ok(textOf(saved.body).includes("저장했어요"), `${mutation}: pre-mutation record confirms its save`);
    const result = await mutate;
    ok(finished, `${mutation}: mutation proceeds after commit and response`);
    if (mutation === "purge") {
      ok(result.deleted, "purge confirms deletion after record finishes");
      ok(!f.db.transactions.some(tx => tx.household_id === ledger), "purge atomically deletes the committed record too");
    } else {
      eq(f.db.transactions.length, count + 1, `${mutation}: record commits exactly once`);
      eq(f.db.transactions.at(-1).household_id, ledger, `${mutation}: in-flight record stays in the scope it locked`);
    }
    if (mutation === "bind") eq((await runtime.readKakaoGroupFirstSnapshot(f.env, f.group)).link.household_id, "house-trip", "manual rebind becomes active after previous record");
    if (mutation === "unbind") ok(!(await runtime.readKakaoGroupFirstSnapshot(f.env, f.group)).link, "unbind removes room scope after previous record");
    if (mutation === "leave") ok(!f.db.household_members.some(item => item.user_id === actorId && item.household_id === ledger), "leave removes member after previous record");
  });
}

// An unknown stage followed by a failed confirmation read remains unknown, never retryable.
for (const stage of ["households", "owner", "member", "link"]) {
  await withFixture(async f => {
    let actor = f.key;
    if (stage === "member") { await skill(f, "커피 4500"); actor += "-new-member"; }
    let issued = false, sent = 0;
    f.intercept = call => {
      const target = call.method === "POST" && (stage === "households" ? call.url.pathname === "/rest/v1/households" : stage === "owner" || stage === "member" ? call.url.pathname === "/rest/v1/household_members" && call.body.role === (stage === "owner" ? "owner" : "member") : call.url.pathname === "/rest/v1/accountbook_settings" && call.body.key === runtime.kakaoGroupLinkItemSettingsKey(f.group));
      if (target) { sent++; issued = true; throw new Error("synthetic unknown remote stage"); }
      if (issued && call.method === "GET" && (stage === "households" ? call.url.pathname === "/rest/v1/households" : stage === "owner" || stage === "member" ? call.url.pathname === "/rest/v1/household_members" : call.url.pathname === "/rest/v1/accountbook_settings")) return new Response(JSON.stringify({ message: "confirmation read unavailable" }), { status: 503 });
    };
    const count = f.db.transactions.length;
    const result = await skill(f, "택시 12500", { key: actor });
    eq(f.db.transactions.length, count, `${stage}: no record after uncertain write/read pair`);
    eq(sent, 1, `${stage}: no automatic write retry after unreadable confirmation`);
    ok(textOf(result.body).includes("확정"), `${stage}: unknown outcome survives its read failure`);
  });
}

await withFixture(async f => {
  let delayedCommit;
  f.intercept = (call, input, init, memoryFetch) => {
    if (call.method === "POST" && call.url.pathname === "/rest/v1/households") { delayedCommit = () => memoryFetch(input, init); throw new Error("synthetic delayed creation"); }
  };
  await skill(f, "커피 4500");
  const state = await auto(f), count = f.db.transactions.length;
  await runtime.removeKakaoGroupLink(f.env, f.group);
  await delayedCommit();
  await skill(f, "점심 10000");
  eq(f.db.transactions.length, count, "retirement prevents continuation after late remote create");
  ok(row(f, state.keys.retired), "late remote create cannot remove durable retirement");
  ok(!f.db.household_members.some(item => item.household_id === state.marker.candidate_id), "retired partial ledger receives no automatic owner/member");
});

await withFixture(async f => {
  await skill(f, "커피 4500");
  const state = await auto(f), broken = { ...state.marker };
  delete broken.group_key;
  put(f, state.keys.marker, broken);
  f.trace = [];
  let failure;
  try { await runtime.purgeHouseholdData(f.env, state.done.candidate_id); } catch (err) { failure = err; }
  ok(failure && failure.code === "settings_data_invalid", "purge rejects a persisted marker with missing room scope");
  ok(f.db.households.some(item => item.id === state.done.candidate_id), "malformed purge scope preserves the household");
  eq(f.trace.filter(call => call.url.pathname === "/rest/v1/rpc/accountbook_purge_household_v227").length, 0, "malformed room scope never reaches purge RPC");
});

await withFixture(async f => {
  await skill(f, "커피 4500");
  const state = await auto(f), old = state.done.candidate_id, owner = state.done.owner_id;
  const linkKey = runtime.kakaoGroupLinkItemSettingsKey(f.group), oldLink = row(f, linkKey).value;
  f.db.household_members.push({ household_id: "house-trip", user_id: owner, role: "admin" });
  let failed = false;
  f.intercept = call => {
    if (!failed && call.method === "DELETE" && call.url.pathname === "/rest/v1/accountbook_settings" && call.url.searchParams.get("key") === `eq.${linkKey}`) { failed = true; return new Response(JSON.stringify({ message: "synthetic link cleanup outage" }), { status: 503 }); }
  };
  await runtime.purgeHouseholdData(f.env, old);
  eq(row(f, linkKey)?.value, oldLink, "failed post-purge cleanup leaves the original stale link");
  let entered, resume;
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const resumePromise = new Promise(resolve => { resume = resolve; });
  let paused = false;
  f.intercept = async call => {
    if (!paused && call.method === "GET" && call.url.pathname === "/rest/v1/households" && call.url.searchParams.get("id") === `eq.${old}`) { paused = true; entered(); await resumePromise; return new Response("[]", { status: 200 }); }
  };
  const staleLookup = skill(f, "시작");
  await enteredPromise;
  const rebound = await runtime.bindKakaoGroupByInviteCode(f.env, { id: owner }, f.group, "TRIP2265");
  ok(rebound.ok, "owner of the new target rebinds while an older missing-household lookup waits");
  resume();
  await staleLookup;
  eq((await runtime.readKakaoGroupFirstSnapshot(f.env, f.group)).link?.household_id, "house-trip", "stale missing-household cleanup cannot remove a newer successful rebind");
  const skipped = await runtime.removeKakaoGroupLink(f.env, f.group, { expectedHouseholdId: old });
  eq(skipped, false, "post-purge expected-scope cleanup skips a changed room link");
  eq((await runtime.readKakaoGroupFirstSnapshot(f.env, f.group)).link?.household_id, "house-trip", "skipped purge cleanup preserves the current target");
  await skill(f, "택시 12500");
  eq(f.db.transactions.at(-1).household_id, "house-trip", "later record uses the successfully rebound target");
});

// Model only the effects of the checked-in merge RPC; never contact a live DB.
function applyStoredMergeSql(f, { p_primary_user_id: primary, p_secondary_user_id: secondary }) {
  const ranks = { owner: 60, admin: 50, member: 40, viewer: 30, pending: 20, blocked: 10 };
  for (const old of f.db.household_members.filter(item => item.user_id === secondary)) {
    const existing = f.db.household_members.find(item => item.user_id === primary && item.household_id === old.household_id);
    if (existing) { if (ranks[old.role] > ranks[existing.role]) existing.role = old.role; }
    else f.db.household_members.push({ ...old, user_id: primary });
  }
  for (const name of ["transactions", "accountbook_recurring"]) for (const item of f.db[name]) if (item.user_id === secondary) item.user_id = primary;
  f.db.accountbook_user_identities = f.db.accountbook_user_identities.filter(item => !(item.user_id === secondary && f.db.accountbook_user_identities.some(other => other.user_id === primary && other.provider === item.provider)));
  for (const item of f.db.accountbook_user_identities) if (item.user_id === secondary) item.user_id = primary;
  f.db.household_members = f.db.household_members.filter(item => item.user_id !== secondary);
  f.db.accountbook_user_security = f.db.accountbook_user_security.filter(item => item.user_id !== secondary);
  put(f, `identity_merge_redirect:${secondary}`, { primary_user_id: primary, secondary_user_id: secondary, merged_at: new Date().toISOString() });
  const old = f.db.users.find(item => item.id === secondary);
  old.kakao_user_key = `merged:${secondary}:synthetic`;
  old.nickname += " (통합됨)";
  return Response.json({ merged: true });
}
async function adminMerge(f, secondary = "user-wifi") {
  f.env.ADMIN_API_TOKEN = "synthetic-group-merge-admin";
  return app.fetch(new Request(BASE + "/admin/identity/merge", { method: "POST", headers: {
    "content-type": "application/x-www-form-urlencoded", authorization: `Bearer ${f.env.ADMIN_API_TOKEN}`, origin: BASE, "sec-fetch-site": "same-origin", "user-agent": f.key,
  }, body: new URLSearchParams({ household_id: "house-home", primary_user_id: "user-bin", secondary_user_id: secondary, confirm_text: "통합" }) }), f.env, { waitUntil() {} });
}
const isMergeRpc = call => call.url.pathname === "/rest/v1/rpc/accountbook_merge_users_v227";
const departureKey = user => `kakao_group_departed_v22931:${digest(user)}`;
function isolatedMergeSecondary(f) {
  const id = `${f.key}-merge-secondary`, key = `${f.key}-merge-key`;
  f.db.users.push({ ...f.db.users.find(item => item.id === "user-wifi"), id, kakao_user_key: key });
  f.db.household_members.push({ household_id: "house-home", user_id: id, role: "member" });
  return { id, key };
}

await withFixture(async f => {
  await skill(f, "커피 4500");
  await skill(f, "점심 11000", { key: f.key + "-member" });
  const member = f.db.transactions.at(-1).user_id, ledger = f.db.transactions.at(-1).household_id;
  const left = await web(f, "/my/household/leave", member, { household_id: ledger, understand_history: "1" });
  ok(left.headers.get("location").includes("household_left"), "merge fixture has a confirmed departure");
  const count = f.db.transactions.length;
  await skill(f, "과자 2300", { key: f.key + "-member" });
  eq(f.db.transactions.length, count, "departure blocks the original account before merging");
  f.db.household_members.push({ household_id: "house-home", user_id: member, role: "member" });
  let calls = 0;
  f.intercept = call => { if (isMergeRpc(call)) { calls++; return applyStoredMergeSql(f, call.body); } };
  const merged = await adminMerge(f, member);
  ok(merged.headers.get("location").includes("msg="), "supported admin merge succeeds");
  eq(calls, 1, "the stored merge RPC model actually ran once");
  ok(f.db.users.find(item => item.id === member).kakao_user_key.startsWith("merged:"), "secondary has the SQL merged marker");
  const result = await skill(f, "우유 3500", { key: f.key + "-member" });
  eq(f.db.transactions.length, count, "canonical identity preserves opt-out after merging");
  ok(!f.db.household_members.some(item => item.household_id === ledger && item.user_id === "user-bin"), "merge does not silently enroll the primary account");
  ok(row(f, departureKey(member)), "secondary departure source remains intact");
  ok(JSON.parse(row(f, departureKey("user-bin")).value).households[digest(ledger)], "primary inherits the hashed departure");
  ok(textOf(result.body).includes("나간 이력"), "primary sees the actual departure reason");
});

await withFixture(async f => {
  let entered, resume, paused = false, calls = 0;
  const secondary = isolatedMergeSecondary(f);
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const resumePromise = new Promise(resolve => { resume = resolve; });
  f.intercept = async call => {
    if (!paused && call.method === "GET" && call.url.pathname.endsWith("/accountbook_settings") && (call.url.searchParams.get("key") || "").startsWith("in.") && (call.url.searchParams.get("key") || "").includes("kakao_group_first_v22931:")) { paused = true; entered(); await resumePromise; }
    if (isMergeRpc(call)) { calls++; return applyStoredMergeSql(f, call.body); }
  };
  const before = f.db.transactions.length, households = f.db.households.length;
  const pending = skill(f, "택시 12500", { key: secondary.key });
  await enteredPromise;
  const merged = await adminMerge(f, secondary.id);
  eq(calls, 1, "identity merges before the first-record lifecycle lease");
  ok(merged.headers.get("location").includes("msg="), "race merge passes the real admin route");
  resume();
  const result = await pending;
  eq(f.db.transactions.length, before, "stale secondary creates no transaction");
  eq(f.db.households.length, households, "stale secondary creates no room ledger");
  ok(!f.db.household_members.some(item => item.user_id === secondary.id), "stale identity cannot resurrect ownership");
  ok(!(await auto(f)).done, "stale identity publishes no completed room marker");
  ok(textOf(result.body).includes("계정"), "stale request reports its changed identity");
});

await withFixture(async f => {
  const secondary = isolatedMergeSecondary(f);
  const candidate = crypto.randomUUID();
  const keys = await runtime.kakaoGroupFirstKeys(f.group);
  f.db.households.push({ id: candidate, name: "Partial shared room", invite_code: "PARTIAL" });
  put(f, keys.marker, { version: 1, group_key: f.group, candidate_id: candidate, owner_id: secondary.id, phase: "create_sent", created_at: new Date().toISOString() });
  let calls = 0;
  f.intercept = call => { if (isMergeRpc(call)) { calls++; return applyStoredMergeSql(f, call.body); } };
  await adminMerge(f, secondary.id);
  eq(calls, 1, "pending creator is merged by the supported admin route");
  const before = f.db.transactions.length;
  await skill(f, "커피 4500");
  eq(f.db.transactions.length, before, "another caller cannot resume a merged pending creator");
  ok(!f.db.household_members.some(item => item.household_id === candidate), "merged pending creator receives no owner/member resurrection");
  ok(!row(f, keys.done), "pending creator change publishes no done marker");
});

await withFixture(async f => {
  let entered, resume, paused = false, calls = 0;
  const secondary = isolatedMergeSecondary(f);
  const enteredPromise = new Promise(resolve => { entered = resolve; });
  const resumePromise = new Promise(resolve => { resume = resolve; });
  f.intercept = async call => {
    if (!paused && call.method === "POST" && call.url.pathname === "/rest/v1/transactions") { paused = true; entered(); await resumePromise; }
    if (isMergeRpc(call)) { calls++; return applyStoredMergeSql(f, call.body); }
  };
  const pending = skill(f, "커피 4500", { key: secondary.key });
  await Promise.race([enteredPromise, pending.then(result => { throw new Error(`record finished before transaction hook: ${textOf(result.body)}; ${f.trace.map(call => call.url.pathname).join(",")}`); })]);
  const queuedMerge = adminMerge(f, secondary.id);
  await new Promise(resolve => setTimeout(resolve, 5));
  eq(calls, 0, "record's lifecycle lease prevents concurrent merge RPC");
  resume();
  await pending;
  const ledger = f.db.transactions.at(-1).household_id;
  const merged = await queuedMerge;
  ok(merged.headers.get("location").includes("msg="), "queued merge completes after the record");
  eq(calls, 1, "merge succeeds after the record releases its lifecycle lease");
  const before = f.db.transactions.length;
  await skill(f, "택시 12500", { key: secondary.key });
  eq(f.db.transactions.length, before + 1, "completed ledger remains usable by its actual primary owner");
  eq(f.db.transactions.at(-1).household_id, ledger, "owner merge keeps the same completed room ID");
  eq(f.db.transactions.at(-1).user_id, "user-bin", "continued record uses the current canonical owner");
});

for (const failure of ["read", "value-missing", "foreign-key", "union-unknown", "rpc-rejected", "rpc-unknown-late"]) {
  await withFixture(async f => {
    const hash = digest("synthetic-opt-out-room");
    put(f, departureKey("user-wifi"), { version: 1, households: { [hash]: true } });
    let calls = 0, lateCommit;
    f.intercept = call => {
      if (call.method === "GET" && call.url.pathname.endsWith("/accountbook_settings") && (call.url.searchParams.get("key") || "").startsWith("in.") && (call.url.searchParams.get("key") || "").includes(departureKey("user-wifi"))) {
        if (failure === "read") return new Response('{"message":"synthetic departure read outage"}', { status: 503 });
        if (failure === "value-missing") return Response.json([{ key: departureKey("user-bin") }]);
        if (failure === "foreign-key") return Response.json([{ key: "unrelated", value: "{}" }]);
      }
      if (failure === "union-unknown" && call.method === "POST" && call.body?.key === departureKey("user-bin")) { put(f, call.body.key, call.body.value); throw new Error("synthetic committed union with lost response"); }
      if (isMergeRpc(call)) {
        calls++;
        if (failure === "rpc-rejected") return new Response('{"message":"synthetic definite merge refusal"}', { status: 400 });
        if (failure === "rpc-unknown-late") { lateCommit = () => applyStoredMergeSql(f, call.body); throw new Error("synthetic late merge with lost response"); }
        return applyStoredMergeSql(f, call.body);
      }
    };
    const count = f.db.transactions.length, members = JSON.stringify(f.db.household_members);
    const result = await adminMerge(f);
    ok(result.headers.get("location").includes("err="), `${failure}: failed/unknown merge does not claim success`);
    eq(calls, failure.startsWith("rpc-") ? 1 : 0, `${failure}: unreadable union never sends merge RPC`);
    eq(f.db.transactions.length, count, `${failure}: no transaction is created`);
    eq(JSON.stringify(f.db.household_members), members, `${failure}: no membership is added by departure handling`);
    ok(JSON.parse(row(f, departureKey("user-wifi")).value).households[hash], `${failure}: original departure is never cleared`);
    if (["union-unknown", "rpc-rejected", "rpc-unknown-late"].includes(failure)) ok(JSON.parse(row(f, departureKey("user-bin")).value).households[hash], `${failure}: conservative primary opt-out survives failure`);
    if (failure === "rpc-unknown-late") { lateCommit(); ok(JSON.parse(row(f, departureKey("user-bin")).value).households[hash], "late merge commit cannot lose the pre-preserved opt-out"); }
  });
}

console.log(`PASS: V22.9.31 shared-room first records and lifecycle (${checks} checks)`);
