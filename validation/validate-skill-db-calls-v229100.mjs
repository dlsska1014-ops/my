// K-1: synthetic database requests only. Counts are captured at app.fetch's
// response boundary, before reading its body, and again after waitUntil settles.
import { app, BASE, counter, putSetting, settingValue, failure } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { claimOperationLease, deferKakaoAfterReply, releaseOperationLease, runKakaoAfterReply, withSettingsRmwLease } from "../src/modules/runtime/leases.js";

const t = counter("PASS: V22.9.100 room record DB calls, cleanup and snapshot safety");
const measurements = {};
// K-1 historical split retained; V101 now tests first alias registration after reply.
// B-0 에서 ≤ 10 으로 내린다
const caps = { A: [25, 40], B: [10, 12], "B-ordinary": [10, 12], C: [10, 12], D: [20, 32], E: [10, 12], "F-1": [10, 17], "F-1-ordinary": [10, 17], "F-2-strong": [10, 19], "F-2-ordinary": [10, 24], G: [6, 6], H: [11, 14], I: [11, 13], J: [11, 13], K: [11, 13], "V115-J": [38, 48], "V115-K": [28, 38], "V115-L": [30, 40], "V115-M": [12, 14], "V119-direct-first": [42, 49], "V119-web-room-first": [39, 43] };
const textOf = body => (body.template?.outputs || []).map(output => output.simpleText?.text || output.textCard?.description || "").join("\n");
const pathIs = (call, suffix, method) => call.url.pathname.endsWith(suffix) && call.method === method;
const pendingWrite = call => pathIs(call, "/accountbook_settings", "POST") && JSON.stringify(call.body).includes(":pending_write:") ||
  pathIs(call, "/accountbook_settings", "PATCH") && String(call.url.searchParams.get("key")).includes(":pending_write:");
const pendingDelete = call => pathIs(call, "/accountbook_settings", "DELETE") && String(call.url.searchParams.get("key")).includes(":pending_write:");
const claims = calls => calls.filter(call => pathIs(call, "/accountbook_claim_operation", "POST")).map(call => call.body.p_key);
const clearRepeat = () => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear(); globalThis.__AB_KAKAO_INFLIGHT?.clear(); };
const activeLeases = fx => fx.db.accountbook_operation_locks.filter(row => Date.parse(row.locked_until) > Date.now()).length;
let sequence = 0;

async function fixture(task, options) {
  const fx = await createV2265QaFixture(options);
  fx.env.KAKAO_SKILL_SECRET = "synthetic-k1-secret";
  fx.env.SKILL_RATE_LIMIT = "10000";
  fx.db.__honor_select = true;
  fx.prefix = `k1-${++sequence}`;
  fx.room = `${fx.prefix}-room`;
  fx.owner = `${fx.prefix}-owner`;
  fx.member = `${fx.prefix}-member`;
  fx.hook = null;
  const support = globalThis.__AB_POSTGREST_EMBED_SUPPORT;
  const oldSupport = { ...support };
  if (support) Object.assign(support, { household_members_or_embed: true, household_members_households: true, household_members_users: true });
  const memoryFetch = globalThis.fetch;
  let trace = [], replied = false, inFlight = 0, wave = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected external request in K-1 fixture");
    const method = String(init.method || "GET").toUpperCase();
    let body = null;
    if (init.body) body = JSON.parse(String(init.body));
    if (inFlight === 0) wave += 1;
    inFlight += 1;
    const call = { url, method, body, afterReply: replied, wave, done: false };
    trace.push(call);
    try {
      const injected = fx.hook ? await fx.hook(call) : null;
      return injected || await memoryFetch(input, init);
    } finally { call.done = true; inFlight -= 1; }
  };
  fx.say = async (utterance, { key = fx.owner, room = fx.room, properties = {}, noContext = false, settle = true } = {}) => {
    trace = []; replied = false; inFlight = 0; wave = 0;
    const jobs = [];
    const payload = { userRequest: { utterance,
      user: { id: key, type: "botUserKey", properties: { botUserKey: key, ...(room ? { botGroupKey: room } : {}), ...properties } },
      ...(room ? { chat: { id: room, type: "groupChat", properties: { botGroupKey: room } } } : {}) } };
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET }, body: JSON.stringify(payload) }), fx.env, noContext ? undefined : { waitUntil(job) { jobs.push(job); } });
    const before = trace.length;
    const waves = wave;
    replied = true;
    const body = await response.json();
    const finish = async () => { let settled = 0; while (settled < jobs.length) { const batch = jobs.slice(settled); settled = jobs.length; await Promise.allSettled(batch); } };
    if (settle) await finish();
    return { before, total: trace.length, waves, text: textOf(body), body, status: response.status, calls: trace.slice(), settle: finish };
  };
  fx.uid = key => fx.db.users.find(user => user.kakao_user_key === key)?.id;
  try { await task(fx); }
  finally {
    clearRepeat();
    if (support) { for (const key of Object.keys(support)) delete support[key]; Object.assign(support, oldSupport); }
    fx.restore();
  }
}

function recordScene(name, result) {
  measurements[name] = { before: result.before, total: result.total, waves: result.waves };
  t.eq(result.status, 200, `${name}: HTTP 200`);
  t.ok(!result.body.template?.quickReplies || name === "G" || name === "H", `${name}: group reply has no quickReplies`);
}
function lifecycleOrder(result, name) {
  const keys = claims(result.calls);
  const positions = [/^kakao_first_record_lifecycle_v22928:/, /^kakao-group-lifecycle:/, /^household-settings-rmw:/].map(pattern => keys.findIndex(key => pattern.test(key)));
  t.ok(positions.every(index => index >= 0) && positions[0] < positions[1] && positions[1] < positions[2], `${name}: user -> room -> household leases`);
}
function storedBeforeReply(result, name) {
  const marker = result.calls.findIndex(pendingWrite);
  const insert = result.calls.findIndex(call => pathIs(call, "/transactions", "POST"));
  t.ok(marker >= 0 && insert > marker && !result.calls[insert].afterReply, `${name}: marker precedes confirmed transaction before reply`);
}

await fixture(async fx => {
  const a = await fx.say("점심 12000"); recordScene("A", a);
  const hid = fx.db.transactions.at(-1).household_id;
  t.ok(a.text.includes("공동 가계부를 준비했어요"), "A: preparation reply");
  lifecycleOrder(a, "A"); storedBeforeReply(a, "A");
  const b = await fx.say("커피 4500"); recordScene("B", b);
  t.ok(b.text.includes("저장했어요") && b.text.includes("02번"), "B: second daily record number");
  t.deepEq(claims(b.calls), [`kakao-message:writer:${hid}:${fx.uid(fx.owner)}`], "B: writer lease only");
  t.ok(b.calls.filter(call => pendingDelete(call) || pathIs(call, "/accountbook_release_operation", "POST")).every(call => call.afterReply), "B: cleanup starts after response");
  t.eq(b.calls.filter(pendingDelete).length, 1, "B: exactly one marker cleanup");
  t.eq(b.calls.filter(call => pathIs(call, "/accountbook_release_operation", "POST")).length, 1, "B: exactly one release");
  t.ok(b.waves <= 5, `B: at most five fixture waves (${b.waves})`); storedBeforeReply(b, "B");
  const c = await fx.say("택시 8000"); recordScene("C", c);
  t.ok(c.text.includes("03번"), "C: third record number");
  const d = await fx.say("간식 3000", { key: fx.member }); recordScene("D", d);
  t.ok(d.text.includes("참여했어요") && d.text.includes("내 권한: 기록·수정"), "D: membership and policy reply");
  t.ok(d.text.includes("지출자: 카카오사용자 2"), "D: newly joined member keeps disambiguated payer name");
  lifecycleOrder(d, "D"); storedBeforeReply(d, "D");
  const e = await fx.say("저녁 15000", { key: fx.member }); recordScene("E", e);
  t.ok(e.text.includes("02번"), "E: numbering belongs to the member");
  const g = await fx.say("물 1000", { key: fx.member, room: "" }); recordScene("G", g);
  t.ok(g.text.includes("가계부를 선택"), "G: direct-message selection precedes saving");
  putSetting(fx, `kakao_selected_household_v2251:${fx.uid(fx.member)}`, hid);
  // G opened a choice flow; selecting the same ledger ends that flow first.
  await fx.say("1번", { key: fx.member, room: "" });
  const h = await fx.say("생수 1100", { key: fx.member, room: "" }); recordScene("H", h);
  t.ok(h.text.includes("저장했어요"), "H: selected direct-message ledger saves");
  const count = fx.db.transactions.length;
  clearRepeat();
  const i = await fx.say("커피 4500"); recordScene("I", i);
  t.eq(fx.db.transactions.length, count, "I: retry does not add a transaction");
  t.ok(i.text.includes("중복 저장 안 함 1건") && i.text.includes("02번"), "I: duplicate keeps its original number");
  Object.assign(fx.env, { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_FAILURE_SAMPLE_RATE: "1" });
  const j = await fx.say("우유 1900"); recordScene("J", j);
  t.eq(j.calls.filter(call => pathIs(call, "/record_nlu_metric", "POST")).length, 1, "J: one aggregate metric request");
  delete fx.env.NLU_METRICS_ENABLED; delete fx.env.NLU_PERSIST_FAILURE_SAMPLES; delete fx.env.NLU_FAILURE_SAMPLE_RATE;
  let suppressed = 0;
  fx.hook = call => pendingDelete(call) && suppressed++ === 0 ? new Response(null, { status: 204 }) : null;
  await fx.say("청소용품 2400");
  fx.hook = null;
  const previous = fx.db.transactions.length;
  const k = await fx.say("주방용품 3400"); recordScene("K", k);
  t.eq(fx.db.transactions.length, previous + 1, "K: retained confirmed marker does not block the next write");
  t.eq(k.calls.filter(call => pathIs(call, "/transactions", "GET") && call.url.searchParams.has("id")).length, 1, "K: one fixed-ID recovery read");
  t.ok(k.calls.some(call => pendingWrite(call) && call.method === "PATCH"), "K: replaces retained marker by CAS");
  t.eq(activeLeases(fx), 0, "all message and lifecycle leases are released");
});

await fixture(async fx => {
  await fx.say("점심 12000");
  const result = await fx.say("빵 2500"); recordScene("B-ordinary", result);
  t.ok(result.text.includes("저장했어요") && result.text.includes("02번"), "B-ordinary: original input without appUserId saves and keeps its number");
  storedBeforeReply(result, "B-ordinary");
});

await fixture(async fx => {
  await fx.say("점심 12000");
  const properties = { appUserId: String(980000000 + sequence) };
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" });
  await fx.say("별칭준비 39001원", { properties });
  t.ok(String(settingValue(fx, "user_identity_links")).includes(properties.appUserId), "F-1: setup persists the alias through the real skill route");
  for (const [name, utterance] of [["F-1", "커피 2500원"], ["F-1-ordinary", "빵 2500"]]) {
    const result = await fx.say(utterance, { properties }); recordScene(name, result);
    t.ok(result.text.includes("저장했어요"), `${name}: established alias saves`);
    t.eq(result.calls.filter(call => pathIs(call, "/accountbook_settings", "POST") && call.body?.key === "user_identity_links").length, 0, `${name}: established alias is not registered again`);
  }
});

// Each first-alias variant gets a separate fixture and a unique appUserId.
for (const [name, utterance] of [["F-2-strong", "커피 2500원"], ["F-2-ordinary", "빵 2500"]]) await fixture(async fx => {
  await fx.say("점심 12000");
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" });
  const properties = { appUserId: String(980000000 + sequence) };
  t.ok(!String(settingValue(fx, "user_identity_links")).includes(properties.appUserId), `${name}: no alias exists before this first delivery`);
  const result = await fx.say(utterance, { properties }); recordScene(name, result);
  t.ok(result.text.includes("저장했어요"), `${name}: first alias and record save`);
  t.eq(result.calls.filter(call => pathIs(call, "/accountbook_settings", "POST") && call.body?.key === "user_identity_links").length, 1, `${name}: this request really registers its first alias`);
  t.ok(String(settingValue(fx, "user_identity_links")).includes(properties.appUserId), `${name}: alias is present after completion`);
});

// The cold combined-or rejection is two fallback reads (+2 from a 9-call B).
// A database without any embedding additionally needs separate users/households.
await fixture(async fx => {
  await fx.say("준비기록 12001");
  let rejected = 0;
  fx.hook = call => pathIs(call, "/household_members", "GET") && call.url.searchParams.has("or") ? (rejected++, failure(400, "combined or embed unsupported")) : null;
  const cold = await fx.say("폴백기록 12002");
  const warm = await fx.say("폴백다음 12003");
  t.eq(rejected, 1, "combined-or failure is remembered in the isolate");
  t.ok(cold.before <= 11 && warm.before <= 10, `combined-or fallback remains bounded (${cold.before}/${warm.before})`);
  t.ok(cold.text.includes("저장했어요") && warm.text.includes("저장했어요"), "combined fallback preserves saving");
  fx.hook = null;
  fx.db.__embed_unsupported = true;
  const plain = await fx.say("포함없는기록 12004");
  measurements.fullEmbedFallback = { before: plain.before, total: plain.total, waves: plain.waves };
  t.ok(plain.before <= 14 && plain.total <= 16, `all embedding unavailable has a separate explicit bound (${plain.before}/${plain.total})`);
  t.ok(plain.text.includes("저장했어요") && plain.text.includes("04번"), "plain fallback preserves reply fields and number");
});

await fixture(async fx => {
  await fx.say("원본기록 22001");
  const original = fx.db.transactions.at(-1);
  original.source_user_key = "different-source-key";
  clearRepeat();
  const duplicate = await fx.say("원본기록 22001");
  t.eq(fx.db.transactions.filter(row => row.household_id === original.household_id).length, 1, "same user_id with another source key still deduplicates");
  t.ok(duplicate.text.includes("중복 저장 안 함 1건") && !duplicate.text.includes('수정 01번"'), "foreign source ownership never creates an editable number");
  original.source_user_key = fx.owner;
  original.user_id = "different-user-id";
  clearRepeat();
  const separate = await fx.say("원본기록 22001");
  t.eq(fx.db.transactions.filter(row => row.household_id === original.household_id).length, 2, "another user_id is not a dedupe candidate");
  t.ok(separate.text.includes("02번"), "source key ownership still determines numbering");
});

await fixture(async fx => {
  await fx.say("경계준비 23001");
  const row = fx.db.transactions.at(-1);
  const oldTime = new Date(Date.now() - 10000).toISOString();
  fx.db.transactions = Array.from({ length: 500 }, (_, index) => ({ ...row, id: crypto.randomUUID(), amount: 1000 + index, memo: `seed-${index}`, raw_text: `seed-${index}`, created_at: oldTime }));
  fx.db.transactions.push({ ...row, id: crypto.randomUUID(), memo: "경계중복", raw_text: "경계중복 23002", amount: 23002, created_at: new Date(Date.now() - 5000).toISOString() });
  const result = await fx.say("경계중복 23002");
  t.eq(fx.db.transactions.length, 501, "500-row T1 boundary still finds duplicates beyond the first page");
  t.ok(result.calls.some(call => pathIs(call, "/transactions", "GET") && call.url.searchParams.has("amount")), "500-row boundary uses the original complete dedupe scan");
  t.ok(result.text.includes("중복 저장 안 함 1건") && result.text.includes("수정할 번호는"), "bounded snapshot does not invent an edit number");
});

await fixture(async fx => {
  await fx.say("이전방준비 24001");
  const oldHid = fx.db.transactions.at(-1).household_id;
  const link = fx.db.accountbook_settings.find(row => row.key.startsWith("kakao_group_link_v2254:"));
  let rebound = false;
  fx.db.__before_rpc = (name, body) => {
    if (name === "accountbook_claim_operation" && String(body.p_key).startsWith("kakao-group-lifecycle:") && !rebound) {
      rebound = true;
      const value = JSON.parse(link.value);
      putSetting(fx, link.key, JSON.stringify({ ...value, household_id: "house-home", household_name: "우리집 생활비", invite_code: "HOME2265" }));
    }
  };
  const result = await fx.say("재연결기록 24002", { key: fx.member });
  t.ok(rebound && result.text.includes("저장했어요"), "slow-path locked reread observes rebind");
  t.eq(fx.db.transactions.at(-1).household_id, "house-home", "rebound slow path writes into the newly observed ledger");
  const keys = claims(result.calls);
  t.ok(keys.includes(`kakao-message:writer:${oldHid}:${fx.uid(fx.member)}`) && keys.includes(`kakao-message:writer:house-home:${fx.uid(fx.member)}`), "rebind replaces the speculative writer lease");
  t.eq(activeLeases(fx), 0, "rebind releases both old and replacement leases");
});

await fixture(async fx => {
  await fx.say("동기준비 25001");
  const sync = await fx.say("동기저장 25002", { noContext: true });
  t.ok(sync.text.includes("저장했어요"), "no waitUntil caller retains synchronous saving");
  t.ok(sync.calls.filter(call => pendingDelete(call) || pathIs(call, "/accountbook_release_operation", "POST")).every(call => !call.afterReply), "no waitUntil caller completes cleanup before response");
  t.eq(sync.before, sync.total, "no orphaned work without execution context");
  let rejected = 0;
  fx.hook = call => pathIs(call, "/household_members", "GET") && call.url.searchParams.has("or") ? (rejected++, failure(503, "membership unavailable")) : null;
  const count = fx.db.transactions.length;
  const failed = await fx.say("조회실패 25003");
  t.ok(rejected > 0 && !failed.text.includes("저장했어요"), "snapshot read failure refuses the save");
  t.eq(fx.db.transactions.length, count, "snapshot read failure does not send transactions");
  t.eq(activeLeases(fx), 0, "early read failure releases speculative writer lease");
});

await fixture(async fx => {
  await fx.say("빠른연속준비 26001");
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  fx.hook = async call => { if (pathIs(call, "/accountbook_release_operation", "POST")) await gate; return null; };
  const first = await fx.say("빠른연속첫째 26002", { settle: false });
  const count = fx.db.transactions.length;
  const busy = await fx.say("빠른연속둘째 26003", { settle: false });
  t.ok(first.text.includes("저장했어요") && !busy.text.includes("저장했어요"), "immediate next message respects the still-held writer lease");
  t.eq(fx.db.transactions.length, count, "brief after-reply busy window does not create an unacknowledged record");
  release();
  await first.settle(); await busy.settle();
  fx.hook = null;
  clearRepeat();
  const retried = await fx.say("빠른연속둘째 26003");
  t.ok(retried.text.includes("저장했어요"), "message can be retried after the explicit waitUntil completion");
  t.eq(fx.db.transactions.length, count + 1, "retry after cleanup creates exactly one record");
});

await fixture(async fx => {
  await fx.say("설정오류준비 27001");
  const unhandled = [];
  const onUnhandled = error => unhandled.push(error);
  process.on("unhandledRejection", onUnhandled);
  try {
    fx.hook = call => pathIs(call, "/accountbook_settings", "GET") && String(call.url.searchParams.get("key")).includes(":pending_write:") ? failure(503, "S2 unavailable") : null;
    const before = fx.db.transactions.length;
    const result = await fx.say("설정오류기록 27002");
    t.ok(!result.text.includes("저장했어요"), "S2 failure never acknowledges saving");
    t.eq(fx.db.transactions.length, before, "S2 failure sends no transaction");
    t.eq(unhandled.length, 0, "unused derived aliases promise has a rejection handler");
    t.eq(activeLeases(fx), 0, "S2 failure releases the speculative writer lease");
  } finally { process.off("unhandledRejection", onUnhandled); }
});

await fixture(async fx => {
  const lease = await claimOperationLease(fx.env, { key: "k1-budget-release", leaseSeconds: 90 });
  fx.env.__AB_DB_BUDGET = { used: 49, limit: 50 };
  fx.env.__AB_KAKAO_REQUEST = { enabled: true, afterReply: [] };
  let optionalRan = false;
  await deferKakaoAfterReply(fx.env, () => { optionalRan = true; }, { cost: 1 });
  await deferKakaoAfterReply(fx.env, () => releaseOperationLease(fx.env, lease), { cost: 1, critical: true });
  await runKakaoAfterReply(fx.env);
  t.ok(!optionalRan, "optional cleanup preserves the final call for a critical release");
  t.eq(activeLeases(fx), 0, "one remaining DB call releases the writer lease");
  t.eq(fx.env.__AB_DB_BUDGET.used, 50, "critical release respects the 50-call hard limit");
});

for (const outcome of ["failed", "skipped"]) await fixture(async fx => {
  fx.env.__AB_KAKAO_REQUEST = { enabled: true, afterReply: [] };
  await withSettingsRmwLease(fx.env, `k1-gate-${outcome}`, async () => {}, { releaseMode: "defer" });
  if (outcome === "skipped") fx.env.__AB_DB_BUDGET = { used: 50, limit: 50 };
  else fx.hook = call => pathIs(call, "/accountbook_release_operation", "POST") ? failure(400, "release rejected") : null;
  const waiting = withSettingsRmwLease(fx.env, `k1-gate-${outcome}`, async () => "unexpected").then(() => "unexpected", () => "busy");
  await runKakaoAfterReply(fx.env);
  const settled = await Promise.race([waiting, new Promise(resolve => setTimeout(() => resolve("local-deadlock"), 200))]);
  t.eq(settled, "busy", `${outcome} DB release still opens the local mutex gate`);
});

await fixture(async fx => {
  const before = fx.db.households.length;
  // V22.9.115: 가계부 없는 방에서는 어떤 확인된 호출이든 첫 호출자를 소유자로 공동 가계부를 준비하고(기록 경로와 같은 잠금·표식·고정 ID, 잠금은 그 자리에서 해제),
  // 같은 말을 그 가계부 명령으로 잇는다. 그 뒤 처음 부르는 사람은 호출 한 번에 구성원이 된다. 상한은 한 방의 첫 호출(J)·첫 참여(K·L)·구성원(M) 별 고정값.
  const result = await fx.say("빵 2800"); recordScene("V115-J", result);
  t.ok(result.text.startsWith("이 방의 공동 가계부를 준비했어요. 첫 호출자인 내가 소유자예요.\n") && result.text.includes("저장했어요"), "V115-J: a guessed record in a new room provisions the room for the caller and then records");
  t.eq(fx.db.households.length, before + 1, "V115-J: the call-join path creates exactly one room ledger");
  t.eq(fx.db.household_members.filter(row => row.household_id === fx.db.households.at(-1).id).map(row => row.role).join(","), "owner", "V115-J: the first caller is the only member and the owner");
  await fx.say("연결준비 28001");
  const members = fx.db.household_members.length;
  const joined = await fx.say("빵 2900", { key: fx.member }); recordScene("V115-K", joined);
  t.ok(joined.text.startsWith("이 방 가계부 ‘이 방의 공동 가계부’에 참여했어요.\n") && joined.text.includes("저장했어요"), "V115-K: a nonmember's record joins without approval and records");
  t.eq(fx.db.household_members.length, members + 1, "V115-K: one membership row for the caller");
  const query = await fx.say("이번 달 요약", { key: `${fx.prefix}-third` }); recordScene("V115-L", query);
  t.ok(query.text.startsWith("이 방 가계부 ‘이 방의 공동 가계부’에 참여했어요.\n") && query.text.includes("이번 달 요약"), "V115-L: a nonmember's query joins and answers");
  t.eq(fx.db.household_members.length, members + 2, "V115-L: the query caller has a membership row");
  const again = await fx.say("이번 달 요약", { key: `${fx.prefix}-third` }); recordScene("V115-M", again);
  t.ok(!again.text.includes("참여했어요") && again.text.includes("이번 달 요약"), "V115-M: a member's query adds no join work");
});

// V22.9.119 O-10: 운영 꼴 설정(Secret 강제·카카오 로그인·계정 잇기 스위치·NLU 집계)에서 한 요청 DB 호출 예산(기본 50)에 가장 가까운 두 장면.
// 1:1 에서 처음 보는 사람의 첫 기록, 웹 계정(kakao_login:2265)이 있는 사람이 새 봇 키로 새 방에서 처음 부름. 상한은 이 판의 실측값으로 고정한다.
const prodLikeEnv = fx => Object.assign(fx.env, { KAKAO_SKILL_AUTH_REQUIRED: "1", KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1", NLU_METRICS_ENABLED: "1" });
const measureScene = (name, result) => {
  measurements[name] = { before: result.before, total: result.total, waves: result.waves };
  t.eq(result.status, 200, `${name}: HTTP 200`);
};

await fixture(async fx => {
  prodLikeEnv(fx);
  const key = `${fx.prefix}-direct`;
  const result = await fx.say("점심 12000", { key, room: "", properties: { appUserId: String(980000000 + sequence) } }); measureScene("V119-direct-first", result);
  t.ok(result.text.includes("저장했어요"), "V119-direct-first: an unseen person's first direct-message record saves");
  t.eq(fx.db.transactions.filter(row => row.source_user_key === key).length, 1, "V119-direct-first: exactly one record");
  t.eq(activeLeases(fx), 0, "V119-direct-first: every lease is released inside the request budget");
});

await fixture(async fx => {
  prodLikeEnv(fx);
  const key = `${fx.prefix}-bot-of-bin`;
  const result = await fx.say("빵 2800", { key, properties: { appUserId: "2265" } }); measureScene("V119-web-room-first", result);
  t.ok(result.text.includes("저장했어요"), "V119-web-room-first: a web-account person's first call in a new room records");
  t.eq(fx.db.transactions.filter(row => row.source_user_key === key).length, 1, "V119-web-room-first: exactly one record");
  t.eq(fx.db.transactions.filter(row => row.source_user_key === key)[0]?.user_id, "user-bin", "V119-web-room-first: the record belongs to the existing web account");
  t.eq(activeLeases(fx), 0, "V119-web-room-first: every lease is released inside the request budget");
});

// Always exercise the same assertions in both category modes. Only measured
// counts differ; primary caps are fixed, never derived from the implementation.
if (process.argv.includes("--measure")) console.error(JSON.stringify(measurements));
const capFailures = [];
for (const [name, [before, total]] of Object.entries(caps)) {
  for (const [actual, cap, boundary] of [[measurements[name].before, before, "before-reply"], [measurements[name].total, total, "total"]]) {
    try { t.ok(actual <= cap, `${name}: ${boundary} ${actual} <= ${cap}`); }
    catch (error) { capFailures.push(error); }
  }
}
if (capFailures.length) throw new AggregateError(capFailures, capFailures.map(error => error.message).join("; "));
t.done();
