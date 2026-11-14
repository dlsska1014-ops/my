// V22.9.122 출시 전 점검(2026-11-14) — 단톡방 참여·저장소 오류 답·잠금 해제의 복원력(KR-1·KR-3·KR-2).
// KR-1: 방의 둘째 이후 사용자를 자동으로 들이는 중 저장소 실패 한 번(참여 POST 503·네트워크 오류, 표식 INSERT 응답 유실)이면 표식만 남고 역할이 없어
//       그 사람은 영영 ‘결과 미확정’이었다. 60초가 지난 같은 사람의 다음 메시지가 같은 고정 POST 를 다시 보내 들이고 기록을 한 번만 저장하는지,
//       나간·내보낸 사람은 다시 들이지 않는지, 다른 사람·첫 소유자 길·역할 규칙은 그대로인지 본다(픽스처, 오프라인, 시계 고정).
import { createHash } from "node:crypto";
import { app, BASE, counter, failure } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const check = counter("prelaunch room resilience fixes");
const scenario = async (label, task) => task();

// ---------- 고정 시계(실제 날짜·시간대와 무관): 2026-07-15 12:00 KST 에서 시작해 advance 로만 흐른다 ----------
const RealDate = Date;
const START_MS = RealDate.parse("2026-07-15T03:00:00.000Z");
let offsetMs = 0;
class FixedDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(START_MS + offsetMs); else super(...args); }
  static now() { return START_MS + offsetMs; }
}
globalThis.Date = FixedDate;
const advance = (ms) => { offsetMs += ms; };
const SEC = 1000, DAY = 86400 * 1000;

const SECRET = "room-resilience-secret-v229122";
const SHARED = "이 방의 공동 가계부";
let serial = 0;
const sha = (text) => createHash("sha256").update(String(text)).digest("hex");
const freshKey = (label) => sha(`${label}-${++serial}`) + "ab";

// 요청마다 새 isolate 처럼: 모듈 전역 캐시를 비운다(감사 하네스와 같은 목록).
const MAPS = ["__AB_KAKAO_CATEGORY_TABLE_WARNED", "__AB_TRAFFIC_EVENTS", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS", "__AB_SKILL_LATENCY",
  "__AB_SKILL_EVENTS", "__AB_OPS_EVENTS", "__AB_NLU_RUNTIME_METRICS", "__AB_NLU_RUNTIME_EVENTS", "__AB_MEMBER_CODE_REMEMBERED_V229121", "__AB_KAKAO_ROOM_OPEN_PROBE",
  "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_LOGIN_CONFLICT_TRACED", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_IDENTITY_WORK_DONE", "__AB_KAKAO_IDENTITY_RESOLVING",
  "__AB_KAKAO_IDENTITY_PENDING", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE", "__AB_EFFECTIVE_USER_CACHE", "__AB_DUPLICATE_EVENTS",
  "__AB_AUTH_WIDE_SETTING_WARNED", "__AB_AUTH_WIDE_BLOCKED"];
function restoreMutex() {
  const m = globalThis.__AB_OPERATION_MUTEXES;
  if (m) { delete m.get; delete m.set; delete m.delete; m.clear(); }
}
function resetIsolate() {
  for (const name of MAPS) {
    const v = globalThis[name];
    if (v instanceof Map || v instanceof Set) v.clear();
    else if (Array.isArray(v)) v.length = 0;
  }
  restoreMutex();
}
// 서로 다른 isolate: 메모리 뮤텍스가 다른 요청을 보지 못한다(DB 잠금만 남는다).
function disableMutex() {
  const m = globalThis.__AB_OPERATION_MUTEXES;
  if (!m) return false;
  m.get = () => undefined; m.set = function () { return this; }; m.delete = () => false;
  return true;
}
const clearRepeat = () => { globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.(); globalThis.__AB_KAKAO_INFLIGHT?.clear?.(); };

async function withFx(task) {
  resetIsolate();
  offsetMs = 0;
  const fx = await createV2265QaFixture();
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  fx.env.KAKAO_SKILL_AUTH_REQUIRED = "1";
  fx.env.SKILL_RATE_LIMIT = "10000";
  fx.db.__honor_select = true;
  const support = globalThis.__AB_POSTGREST_EMBED_SUPPORT;
  if (support) Object.assign(support, { household_members_or_embed: true, household_members_households: true, household_members_users: true });
  const fixtureFetch = globalThis.fetch;
  fx.trace = []; fx.hook = null;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    const call = { method, path: url.pathname.replace("/rest/v1/", ""), search: decodeURIComponent(url.search), body: init.body ? String(init.body) : "" };
    fx.trace.push(call);
    if (fx.hook) { const injected = await fx.hook(call, () => fixtureFetch(input, init)); if (injected) return injected; }
    return fixtureFetch(input, init);
  };
  fx.uid = (key) => fx.db.users.find((u) => u.kakao_user_key === key)?.id;
  try { return await task(fx); }
  finally { globalThis.fetch = fixtureFetch; fx.restore(); restoreMutex(); offsetMs = 0; }
}

function payloadFor(utterance, key, room = "") {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko",
    user: { id: key, type: "botUserKey", properties: { botUserKey: key, ...(room ? { botGroupKey: room } : {}) } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n") || "").join("\n");

async function send(fx, utterance, { key, room = "" }) {
  const jobs = [];
  const start = fx.trace.length;
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, key, room)) }),
    fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let i = 0; i < 20 && jobs.length; i += 1) await Promise.allSettled(jobs.splice(0));
  let json = null; try { json = JSON.parse(raw); } catch (_) {}
  return { status: response.status, json, text: textOf(json), start };
}
async function say(fx, utterance, opts) {
  fx.trace = []; clearRepeat();
  const result = await send(fx, utterance, opts);
  return { ...result, calls: fx.trace.slice() };
}

const isMemberPost = (c) => c.method === "POST" && c.path === "household_members" && c.body.includes('"role":"member"');
const isAttemptPost = (c) => c.method === "POST" && c.path === "accountbook_settings" && c.body.includes("kakao_group_member_attempt_v22943:");
const isAttemptRead = (c) => c.method === "GET" && c.path === "accountbook_settings" && c.search.includes("kakao_group_member_attempt_v22943:");
const memberPosts = (r) => r.calls.filter(isMemberPost).length;
const attemptPosts = (r) => r.calls.filter(isAttemptPost).length;
const UNCERTAIN = "공동 가계부 준비 결과를 아직 확정하지 못했어요";

const FAIL = {
  "503": async () => failure(503, "simulated outage"),
  net: async () => { throw new TypeError("fetch failed (simulated)"); },
  "409": async () => new Response(JSON.stringify({ code: "23503", details: null, hint: null, message: "insert or update violates foreign key constraint" }), { status: 409, headers: { "content-type": "application/json" } }),
  lost: async (forward) => { await forward(); return failure(503, "response lost after commit"); },
  lostnet: async (forward) => { await forward(); throw new TypeError("connection reset after commit (simulated)"); },
};
function failOnce(fx, match, kind) {
  let used = false;
  fx.hook = async (call, forward) => {
    if (used || !match(call)) return null;
    used = true; call.failed = kind;
    return FAIL[kind](forward);
  };
}

const memberRows = (fx, hid, uid) => fx.db.household_members.filter((m) => m.household_id === hid && String(m.user_id) === String(uid));
const roleIn = (fx, hid, uid) => memberRows(fx, hid, uid).map((m) => m.role).join("+") || "none";
const rowsOf = (fx, uid, raw) => fx.db.transactions.filter((t) => String(t.user_id) === String(uid) && t.raw_text === raw).length;
const attemptRows = (fx) => fx.db.accountbook_settings.filter((s) => String(s.key).startsWith("kakao_group_member_attempt_v22943:"));
function invariants(fx) {
  const p = [];
  for (const h of fx.db.households) {
    const owners = fx.db.household_members.filter((m) => m.household_id === h.id && m.role === "owner").length;
    if (owners !== 1) p.push(`household ${h.id} owners=${owners}`);
  }
  const seen = new Set();
  for (const m of fx.db.household_members) {
    const k = `${m.household_id}|${m.user_id}`;
    if (seen.has(k)) p.push(`duplicate member row ${k}`);
    seen.add(k);
  }
  for (const l of fx.db.accountbook_operation_locks || []) if (Date.parse(l.locked_until) > Date.now()) p.push(`active lease ${String(l.operation_key).slice(0, 50)}`);
  return p;
}

// 방 하나와 소유자(첫 기록자)를 만든다.
async function ownerRoom(fx, label) {
  const room = freshKey(`${label}-room`), owner = freshKey(`${label}-owner`);
  const first = await say(fx, "커피 4500원", { key: owner, room });
  const ownerId = fx.uid(owner);
  const hid = fx.db.household_members.find((m) => String(m.user_id) === String(ownerId) && m.role === "owner" && fx.db.households.find((h) => h.id === m.household_id)?.name === SHARED)?.household_id;
  return { room, owner, ownerId, hid, first };
}

// ===================== KR-1 =====================
// 1. 참여 POST 가 한 번 실패(503·네트워크 오류)한 둘째 사용자: 기록 먼저·호출만(시작·도움말) 모두, 5초 뒤는 미확정, 61초 뒤 들어가 한 번만 저장, 하루 뒤도 정상.
for (const [first, kind] of [["점심 12000원", "503"], ["점심 12000원", "net"], ["시작", "503"], ["시작", "net"], ["도움말", "503"], ["도움말", "net"]]) {
  await scenario(`KR-1 member POST ${kind} on '${first}'`, () => withFx(async (fx) => {
    const tag = `KR-1 member ${kind}/${first}`;
    const { room, hid } = await ownerRoom(fx, `m-${kind}`);
    const key = freshKey(`m-${kind}-second`);
    failOnce(fx, isMemberPost, kind);
    const r1 = await say(fx, first, { key, room });
    fx.hook = null;
    const uid = fx.uid(key);
    check.eq(r1.calls.filter((c) => c.failed).length, 1, `${tag}: the injected failure hit the member POST`);
    check.eq(roleIn(fx, hid, uid), "none", `${tag}: no role after the failed join`);
    check.eq(fx.db.transactions.filter((t) => String(t.user_id) === String(uid)).length, 0, `${tag}: nothing saved on the failed join`);
    if (first === "점심 12000원") check.ok(r1.text.includes(UNCERTAIN), `${tag}: the record reply honestly says the join is not confirmed`);
    const marker = attemptRows(fx);
    check.eq(marker.length, 1, `${tag}: one join attempt marker stays`);
    check.ok(Number.isFinite(Date.parse(String(JSON.parse(marker[0]?.value || "{}").at || ""))), `${tag}: the marker records when the attempt was sent`);

    advance(5 * SEC);
    const r5 = await say(fx, "점심 12000원", { key, room });
    check.ok(r5.text.includes(UNCERTAIN), `${tag}: +5 s resend still gets the honest not-confirmed reply`);
    check.eq(memberPosts(r5), 0, `${tag}: +5 s resend does not repeat the member POST`);
    check.eq(roleIn(fx, hid, uid), "none", `${tag}: +5 s still no role`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 0, `${tag}: +5 s nothing saved`);

    advance(56 * SEC);
    const r61 = await say(fx, "점심 12000원", { key, room });
    check.eq(memberPosts(r61), 1, `${tag}: +61 s resend sends the same member POST once`);
    check.eq(roleIn(fx, hid, uid), "member", `${tag}: +61 s the user is a member`);
    check.eq(memberRows(fx, hid, uid).length, 1, `${tag}: +61 s exactly one member row`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 1, `${tag}: +61 s the record is saved once`);
    check.ok(r61.text.includes("참여했어요") && r61.text.includes("저장했어요"), `${tag}: +61 s reply says joined and saved`);

    advance(DAY);
    const rDay = await say(fx, "택시 8000원", { key, room });
    check.eq(rowsOf(fx, uid, "택시 8000원"), 1, `${tag}: +1 day record saved`);
    check.eq(memberPosts(rDay), 0, `${tag}: +1 day no further member POST`);
    check.eq(memberRows(fx, hid, uid).length, 1, `${tag}: +1 day still one member row`);
    check.deepEq(invariants(fx), [], `${tag}: one owner, no duplicate member rows, no active leases`);
  }));
}

// 2. 참여 POST 는 저장됐는데 응답만 잃음: 같은 요청의 재조회가 역할을 찾아 바로 들어간다(예전과 같음, 중복 없음).
for (const [first, kind] of [["점심 12000원", "lost"], ["시작", "lostnet"], ["도움말", "lost"]]) {
  await scenario(`KR-1 member POST ${kind} on '${first}'`, () => withFx(async (fx) => {
    const tag = `KR-1 member ${kind}/${first}`;
    const { room, hid } = await ownerRoom(fx, `ml-${kind}`);
    const key = freshKey(`ml-${kind}-second`);
    failOnce(fx, isMemberPost, kind);
    const r1 = await say(fx, first, { key, room });
    fx.hook = null;
    const uid = fx.uid(key);
    check.eq(roleIn(fx, hid, uid), "member", `${tag}: a committed join is found by the reread`);
    check.eq(memberRows(fx, hid, uid).length, 1, `${tag}: exactly one member row`);
    if (first === "점심 12000원") check.eq(rowsOf(fx, uid, first), 1, `${tag}: the record is saved once`);
    advance(61 * SEC);
    const r2 = await say(fx, "택시 8000원", { key, room });
    check.eq(memberPosts(r2), 0, `${tag}: a member never sends another join POST`);
    check.eq(rowsOf(fx, uid, "택시 8000원"), 1, `${tag}: later record saved once`);
    check.deepEq(invariants(fx), [], `${tag}: invariants hold`);
  }));
}

// 3. 표식 INSERT 실패: 저장 안 됨(503·네트워크)은 표식이 없으니 다음 메시지가 바로 들어가고, 저장됐는데 응답 유실(lost·lostnet)은 61초 뒤 들어간다.
for (const [kind, committed] of [["503", false], ["net", false], ["lost", true], ["lostnet", true]]) {
  await scenario(`KR-1 marker insert ${kind}`, () => withFx(async (fx) => {
    const tag = `KR-1 marker ${kind}`;
    const { room, hid } = await ownerRoom(fx, `k-${kind}`);
    const key = freshKey(`k-${kind}-second`);
    failOnce(fx, isAttemptPost, kind);
    const r1 = await say(fx, "점심 12000원", { key, room });
    fx.hook = null;
    const uid = fx.uid(key);
    check.eq(r1.calls.filter((c) => c.failed && isAttemptPost(c)).length, 1, `${tag}: the injected failure hit the marker insert`);
    check.eq(memberPosts(r1), 0, `${tag}: no member POST after an unconfirmed marker`);
    check.ok(r1.text.includes(UNCERTAIN), `${tag}: honest not-confirmed reply`);
    check.eq(attemptRows(fx).length, committed ? 1 : 0, `${tag}: the marker exists only when the insert committed`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 0, `${tag}: nothing saved`);

    advance(5 * SEC);
    const r5 = await say(fx, "점심 12000원", { key, room });
    if (committed) {
      check.ok(r5.text.includes(UNCERTAIN), `${tag}: +5 s a fresh committed marker still waits`);
      check.eq(memberPosts(r5), 0, `${tag}: +5 s no member POST yet`);
      check.eq(roleIn(fx, hid, uid), "none", `${tag}: +5 s no role yet`);
      advance(56 * SEC);
      const r61 = await say(fx, "점심 12000원", { key, room });
      check.eq(memberPosts(r61), 1, `${tag}: +61 s one member POST`);
      check.ok(r61.text.includes("참여했어요") && r61.text.includes("저장했어요"), `${tag}: +61 s joined and saved`);
    } else {
      check.eq(memberPosts(r5), 1, `${tag}: +5 s nothing was in flight, so the join runs at once`);
      check.ok(r5.text.includes("참여했어요") && r5.text.includes("저장했어요"), `${tag}: +5 s joined and saved`);
    }
    check.eq(roleIn(fx, hid, uid), "member", `${tag}: the user ends up a member`);
    check.eq(memberRows(fx, hid, uid).length, 1, `${tag}: exactly one member row`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 1, `${tag}: the record is saved exactly once`);
    check.eq(attemptRows(fx).length, 1, `${tag}: one marker per room, user and ledger`);
    check.deepEq(invariants(fx), [], `${tag}: invariants hold`);
  }));
}

// 4. 호출만 하는 길(시작·도움말)에서 표식 응답을 잃은 사람도 61초 뒤 호출만으로 들어간다.
for (const call of ["시작", "도움말"]) {
  await scenario(`KR-1 call-only marker lost '${call}'`, () => withFx(async (fx) => {
    const tag = `KR-1 call-only lost/${call}`;
    const { room, hid } = await ownerRoom(fx, `c-${call}`);
    const key = freshKey(`c-${call}-second`);
    failOnce(fx, isAttemptPost, "lost");
    await say(fx, call, { key, room });
    fx.hook = null;
    const uid = fx.uid(key);
    check.eq(roleIn(fx, hid, uid), "none", `${tag}: no role after the lost marker response`);
    advance(5 * SEC);
    const r5 = await say(fx, call, { key, room });
    check.eq(memberPosts(r5), 0, `${tag}: +5 s call does not send the member POST`);
    check.eq(roleIn(fx, hid, uid), "none", `${tag}: +5 s still no role`);
    advance(56 * SEC);
    const r61 = await say(fx, call, { key, room });
    check.eq(memberPosts(r61), 1, `${tag}: +61 s call sends the member POST once`);
    check.eq(roleIn(fx, hid, uid), "member", `${tag}: +61 s call joins`);
    check.ok(r61.text.includes("참여했어요"), `${tag}: +61 s reply mentions the join`);
    const rec = await say(fx, "점심 12000원", { key, room });
    check.eq(memberPosts(rec), 0, `${tag}: the next record needs no join POST`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 1, `${tag}: the next record is saved once`);
    check.deepEq(invariants(fx), [], `${tag}: invariants hold`);
  }));
}

// 5. 한 사람이 막힌 동안 셋째·넷째 사람은 평소처럼 들어간다. 평소 길은 표식 INSERT 1번·참여 POST 1번뿐(표식 재조회 없음). 첫 소유자 길은 표식을 쓰지 않는다.
await scenario("KR-1 others while one is stuck", () => withFx(async (fx) => {
  const tag = "KR-1 others";
  const { room, hid, owner, ownerId, first } = await ownerRoom(fx, "o");
  check.ok(first.text.includes("공동 가계부를 준비했어요") && first.text.includes("저장했어요"), `${tag}: the first caller prepares the room and saves`);
  check.eq(roleIn(fx, hid, ownerId), "owner", `${tag}: the first caller owns the room ledger`);
  check.eq(attemptPosts(first), 0, `${tag}: the owner path never writes a member join marker`);
  const stuck = freshKey("o-stuck");
  failOnce(fx, isMemberPost, "503");
  await say(fx, "점심 12000원", { key: stuck, room });
  fx.hook = null;
  const third = freshKey("o-third"), fourth = freshKey("o-fourth");
  const r3 = await say(fx, "택시 8000원", { key: third, room });
  check.eq(roleIn(fx, hid, fx.uid(third)), "member", `${tag}: a third user joins while the second is stuck`);
  check.eq(rowsOf(fx, fx.uid(third), "택시 8000원"), 1, `${tag}: the third user's record is saved once`);
  check.eq(attemptPosts(r3), 1, `${tag}: normal join writes the marker once`);
  check.eq(memberPosts(r3), 1, `${tag}: normal join sends one member POST`);
  check.eq(r3.calls.filter(isAttemptRead).length, 0, `${tag}: normal join never rereads the marker`);
  const r4 = await say(fx, "시작", { key: fourth, room });
  check.eq(roleIn(fx, hid, fx.uid(fourth)), "member", `${tag}: a fourth user joins by calling the bot`);
  check.eq(memberPosts(r4), 1, `${tag}: the call-only join sends one member POST`);
  check.eq(roleIn(fx, hid, fx.uid(stuck)), "none", `${tag}: the stuck user is still waiting inside 60 s`);
  advance(61 * SEC);
  await say(fx, "점심 12000원", { key: stuck, room });
  check.eq(roleIn(fx, hid, fx.uid(stuck)), "member", `${tag}: the stuck user joins after 60 s`);
  check.eq(roleIn(fx, hid, ownerId), "owner", `${tag}: the owner is unchanged`);
  check.eq(fx.db.household_members.filter((m) => m.household_id === hid).length, 4, `${tag}: four members, no extra rows`);
  check.deepEq(invariants(fx), [], `${tag}: invariants hold`);
  void owner;
}));

// 6. 나간·내보낸 사람은 오래된 표식이 있어도 다시 들이지 않는다(나간 이력 확인이 먼저).
await scenario("KR-1 removed member stays out", () => withFx(async (fx) => {
  const tag = "KR-1 removed";
  const { room, hid, ownerId } = await ownerRoom(fx, "r");
  const key = freshKey("r-second");
  failOnce(fx, isMemberPost, "503");
  await say(fx, "점심 12000원", { key, room });
  fx.hook = null;
  advance(61 * SEC);
  await say(fx, "점심 12000원", { key, room });
  const uid = fx.uid(key);
  check.eq(roleIn(fx, hid, uid), "member", `${tag}: the stuck user joined after 60 s`);
  const removed = await app.fetch(new Request(`${BASE}/admin/member/remove`, { method: "POST", redirect: "manual",
    headers: { "content-type": "application/x-www-form-urlencoded", cookie: await fx.cookieFor(ownerId), origin: BASE, "sec-fetch-site": "same-origin" },
    body: new URLSearchParams({ household_id: hid, user_id: String(uid), return_to: `/my/members?household_id=${hid}` }) }), fx.env, { waitUntil() {} });
  check.eq(removed.status, 303, `${tag}: the owner removes the participant on the web`);
  check.eq(roleIn(fx, hid, uid), "none", `${tag}: the participant is gone`);
  check.eq(attemptRows(fx).length, 1, `${tag}: the old join marker is still there`);
  advance(2 * 60 * SEC);
  const again = await say(fx, "점심 9000원", { key, room });
  check.ok(again.text.includes("나간 이력"), `${tag}: the removed participant is told why they were not re-added`);
  check.eq(memberPosts(again), 0, `${tag}: no member POST for a removed participant`);
  check.eq(attemptPosts(again), 0, `${tag}: the departure check runs before the marker`);
  check.eq(roleIn(fx, hid, uid), "none", `${tag}: the removed participant stays out`);
  check.eq(rowsOf(fx, uid, "점심 9000원"), 0, `${tag}: nothing saved for the removed participant`);
  const call = await say(fx, "도움말", { key, room });
  check.eq(memberPosts(call), 0, `${tag}: a call does not re-add the removed participant either`);
  check.eq(roleIn(fx, hid, uid), "none", `${tag}: still out after a call`);
}));

// 7. 나간 이력이 있는 사람의 막힌 표식(역할 없음): 나간 이력이 먼저라 아무것도 보내지 않는다.
await scenario("KR-1 departed stuck user", () => withFx(async (fx) => {
  const tag = "KR-1 departed stuck";
  const { room, hid } = await ownerRoom(fx, "d");
  const key = freshKey("d-second");
  failOnce(fx, isMemberPost, "net");
  await say(fx, "점심 12000원", { key, room });
  fx.hook = null;
  const uid = fx.uid(key);
  fx.db.accountbook_settings.push({ id: "qa-departed", key: `kakao_group_departed_v22931:${sha(uid)}`, value: JSON.stringify({ version: 1, households: { [sha(hid)]: true } }), created_at: new Date().toISOString() });
  advance(61 * SEC);
  const r = await say(fx, "점심 12000원", { key, room });
  check.ok(r.text.includes("나간 이력"), `${tag}: departure wins over the retry`);
  check.eq(memberPosts(r), 0, `${tag}: no member POST`);
  check.eq(roleIn(fx, hid, uid), "none", `${tag}: not re-added`);
}));

// 8. 이 판 전에 막힌 사람(at 없는 표식)과 V22.9.31 표식(같은 가계부)은 오래된 것으로 보고 바로 들인다. 다른 가계부를 가리키는 옛 표식은 상관없다.
for (const variant of ["no-at", "legacy-same", "legacy-other"]) {
  await scenario(`KR-1 old marker ${variant}`, () => withFx(async (fx) => {
    const tag = `KR-1 old marker ${variant}`;
    const { room, hid } = await ownerRoom(fx, `old-${variant}`);
    const key = freshKey(`old-${variant}-second`);
    const uid = `user-old-${variant}`;
    fx.db.users.push({ id: uid, kakao_user_key: key, nickname: "Old", created_at: "2026-07-01T00:00:00.000Z" });
    const value = (householdId) => JSON.stringify({ version: 1, user_id: uid, household_id: householdId, phase: "member_sent" });
    if (variant === "no-at") fx.db.accountbook_settings.push({ id: "qa-old", key: `kakao_group_member_attempt_v22943:${sha(room)}:${sha(uid)}:${sha(hid)}`, value: value(hid), created_at: "2026-07-01T00:00:00.000Z" });
    else fx.db.accountbook_settings.push({ id: "qa-legacy", key: `kakao_group_member_attempt_v22931:${sha(room)}:${sha(uid)}`, value: value(variant === "legacy-same" ? hid : "house-trip"), created_at: "2026-07-01T00:00:00.000Z" });
    const r = await say(fx, "점심 12000원", { key, room });
    check.eq(fx.uid(key), uid, `${tag}: the seeded user is the caller`);
    check.eq(memberPosts(r), 1, `${tag}: one member POST`);
    check.eq(roleIn(fx, hid, uid), "member", `${tag}: the user joins`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), 1, `${tag}: the record is saved once`);
    check.ok(r.text.includes("참여했어요"), `${tag}: the reply says joined`);
  }));
}

// 9. 역할 규칙은 그대로: 조회 전용·이용 제한은 오래된 표식이 있어도 들이지 않고, 승인 대기는 예전처럼 구성원으로 바뀐다.
for (const role of ["viewer", "blocked", "pending"]) {
  await scenario(`KR-1 role ${role} with old marker`, () => withFx(async (fx) => {
    const tag = `KR-1 role ${role}`;
    const { room, hid } = await ownerRoom(fx, `role-${role}`);
    const key = freshKey(`role-${role}-second`);
    const uid = `user-role-${role}`;
    fx.db.users.push({ id: uid, kakao_user_key: key, nickname: "Role", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: hid, user_id: uid, role, created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.accountbook_settings.push({ id: "qa-old-role", key: `kakao_group_member_attempt_v22943:${sha(room)}:${sha(uid)}:${sha(hid)}`, value: JSON.stringify({ version: 1, user_id: uid, household_id: hid, phase: "member_sent" }), created_at: "2026-07-01T00:00:00.000Z" });
    advance(61 * SEC);
    const r = await say(fx, "점심 12000원", { key, room });
    check.eq(memberPosts(r), 0, `${tag}: no member POST for an existing role`);
    check.eq(roleIn(fx, hid, uid), role === "pending" ? "member" : role, `${tag}: role ends as before the fix`);
    check.eq(rowsOf(fx, uid, "점심 12000원"), role === "pending" ? 1 : 0, `${tag}: saving follows the role`);
  }));
}

// 10. 분명한 실패(409)는 표식을 되돌려 다음 메시지가 바로 다시 시도한다(예전과 같음).
await scenario("KR-1 definite member failure", () => withFx(async (fx) => {
  const tag = "KR-1 definite 409";
  const { room, hid } = await ownerRoom(fx, "def");
  const key = freshKey("def-second");
  failOnce(fx, isMemberPost, "409");
  const r1 = await say(fx, "점심 12000원", { key, room });
  fx.hook = null;
  const uid = fx.uid(key);
  check.ok(!r1.text.includes(UNCERTAIN), `${tag}: a definite failure is not described as unconfirmed`);
  check.eq(attemptRows(fx).length, 0, `${tag}: the marker is rolled back`);
  advance(5 * SEC);
  const r5 = await say(fx, "점심 12000원", { key, room });
  check.eq(memberPosts(r5), 1, `${tag}: the next message retries at once`);
  check.eq(roleIn(fx, hid, uid), "member", `${tag}: joined`);
  check.eq(rowsOf(fx, uid, "점심 12000원"), 1, `${tag}: saved once`);
}));

// 11. 서로 다른 isolate(메모리 뮤텍스 없음)에서 막힌 사람이 61초 뒤 서로 다른 기록 둘을 동시에 보내도(같은 글이면 메모리 중복 막기가 먼저 멈춘다)
//     DB 잠금이 둘을 가르고, 참여 행은 하나, 각 기록은 많아야 한 번 저장된다.
await scenario("KR-1 separate isolates", () => withFx(async (fx) => {
  const tag = "KR-1 isolates";
  const { room, hid } = await ownerRoom(fx, "iso");
  const key = freshKey("iso-second");
  failOnce(fx, isMemberPost, "503");
  await say(fx, "점심 12000원", { key, room });
  fx.hook = null;
  const uid = fx.uid(key);
  advance(61 * SEC);
  check.ok(disableMutex(), `${tag}: the in-memory mutex is switched off`);
  fx.trace = []; clearRepeat();
  const [a, b] = await Promise.all([send(fx, "점심 12000원", { key, room }), send(fx, "택시 8000원", { key, room })]);
  check.ok(a.status === 200 && b.status === 200 && a.json && b.json, `${tag}: both requests get a Kakao reply`);
  check.ok(fx.trace.filter(isMemberPost).length >= 1 && fx.trace.filter(isMemberPost).length <= 2, `${tag}: the join POST is resent, at most once per request`);
  check.eq(memberRows(fx, hid, uid).length, 1, `${tag}: exactly one member row`);
  check.ok(rowsOf(fx, uid, "점심 12000원") <= 1 && rowsOf(fx, uid, "택시 8000원") <= 1, `${tag}: no record is saved twice`);
  check.ok(rowsOf(fx, uid, "점심 12000원") + rowsOf(fx, uid, "택시 8000원") >= 1, `${tag}: at least the request holding the lease saves its record`);
  check.deepEq(invariants(fx), [], `${tag}: no duplicate rows and no leases left`);
  restoreMutex();
  advance(2 * SEC);
  const later = await say(fx, "우유 2000원", { key, room });
  check.eq(memberPosts(later), 0, `${tag}: the member needs no further join`);
  check.eq(rowsOf(fx, uid, "우유 2000원"), 1, `${tag}: later record saved once`);
}));

// ---------------- V22.9.122 KR-3: 저장소 오류가 맨 바깥 catch 까지 올라온 답 ----------------
const NOT_SAVED = "일시적인 오류로 이번 내용은 저장하지 않았어요. 잠시 뒤 같은 내용을 다시 보내 주세요.";
const DELAYED = "지금은 저장 확인이 지연되고 있어요. 중복될 수 있으니 같은 내용을 다시 보내지 말고 기다려 주세요.";
const GENERIC = "잠시 처리 흐름을 정리하고 있어요";
const isClaim = (c) => c.method === "POST" && c.path === "rpc/accountbook_claim_operation";
const contentOf = (fx) => JSON.stringify([fx.db.transactions.map((t) => `${t.id}:${t.raw_text}:${t.amount}:${t.deleted_at || ""}`).sort(),
  (fx.db.accountbook_budgets || []).map((b) => `${b.month}:${b.category}:${b.amount}`).sort()]);
function failKth(fx, k, kind) {
  let n = 0;
  fx.hook = async (call, forward) => {
    n += 1;
    if (n !== k) return null;
    call.failed = kind;
    return FAIL[kind](forward);
  };
}
async function directUser(fx, label) {
  const key = freshKey(label);
  await say(fx, "아침 3000원", { key });
  check.eq(rowsOf(fx, fx.uid(key), "아침 3000원"), 1, `KR-3 ${label}: setup record saved`);
  advance(2 * SEC);
  return key;
}

for (const kind of ["503", "net", "lost", "lostnet"]) await scenario(`KR-3 claim ${kind}`, () => withFx(async (fx) => {
  const tag = `KR-3 lease claim ${kind}`;
  const key = await directUser(fx, `claim-${kind}`);
  const uid = fx.uid(key);
  failOnce(fx, isClaim, kind);
  const r = await say(fx, "택시 8000원", { key });
  fx.hook = null;
  check.ok(r.calls.some((c) => c.failed), `${tag}: the lease claim failed`);
  check.ok(r.status === 200 && r.text.includes(NOT_SAVED), `${tag}: the reply says this message was not saved`);
  check.ok(!r.text.includes(GENERIC) && !r.text.includes(DELAYED), `${tag}: no generic or ‘wait’ fallback`);
  check.ok(!/https?:\/\//.test(r.text), `${tag}: no URL in the reply text`);
  check.eq(rowsOf(fx, uid, "택시 8000원"), 0, `${tag}: nothing saved`);
  advance(91 * SEC);
  const again = await say(fx, "택시 8000원", { key });
  check.eq(rowsOf(fx, uid, "택시 8000원"), 1, `${tag}: resending after the lease time saves it once`);
  check.ok(!again.text.includes(NOT_SAVED), `${tag}: the resend gets a normal reply`);
}));

// 한 요청의 호출을 하나씩 실패시켜 본다: 일반 대체 답은 없어야 하고, ‘저장하지 않았어요’는 내용(거래·예산)이 그대로일 때만 나와야 한다.
async function sweepCells(label, makeCtx, utterance) {
  for (const kind of ["503", "net", "lost", "lostnet"]) {
    let notSaved = 0, cells = 0, generic = 0, wrongNotSaved = 0, markerWait = 0;
    for (let k = 1; k < 90; k += 1) {
      const finished = await withFx(async (fx) => {
        const ctx = await makeCtx(fx);
        const before = contentOf(fx);
        failKth(fx, k, kind);
        const r = await say(fx, utterance, ctx);
        fx.hook = null;
        const failed = r.calls.find((c) => c.failed);
        if (!failed) return true;
        cells += 1;
        if (r.text.includes(GENERIC)) generic += 1;
        if (r.text.includes(NOT_SAVED)) { notSaved += 1; if (contentOf(fx) !== before) wrongNotSaved += 1; }
        if (failed.method === "POST" && failed.path === "accountbook_settings" && failed.body.includes('"key":"kakao_') && contentOf(fx) === before &&
            r.text.includes(DELAYED) && !r.text.includes("오늘기록")) markerWait += 1;
        return false;
      });
      if (finished) break;
    }
    const tag = `KR-3 every single failure, ${label}, ${kind}`;
    check.ok(cells > 3, `${tag}: the sweep reached the request's calls`);
    check.eq(generic, 0, `${tag}: no storage failure gets the generic fallback`);
    check.eq(wrongNotSaved, 0, `${tag}: ‘not saved’ only when no record or budget changed`);
    check.ok(notSaved >= 1, `${tag}: at least one failure gets the ‘not saved’ reply`);
    check.eq(markerWait, 0, `${tag}: a failed kakao_ marker write alone does not get the ‘wait’ reply`);
  }
}
await scenario("KR-3 sweep existing", () => sweepCells("existing 1:1 user record", async (fx) => ({ key: await directUser(fx, "sweep") }), "택시 8000원"));
await scenario("KR-3 sweep new", () => sweepCells("new 1:1 user record", async () => ({ key: freshKey("sweep-new") }), "점심 12000원"));

for (const kind of ["503", "lost"]) await scenario(`KR-3 budget ${kind}`, () => withFx(async (fx) => {
  const tag = `KR-3 budget write ${kind}`;
  const key = await directUser(fx, `budget-${kind}`);
  const before = (fx.db.accountbook_budgets || []).length;
  failOnce(fx, (c) => c.method === "POST" && c.path === "accountbook_budgets", kind);
  const r = await say(fx, "월 예산 200만원", { key });
  fx.hook = null;
  check.ok(r.calls.some((c) => c.failed), `${tag}: the budget write failed`);
  check.ok(r.text.includes(DELAYED) && !r.text.includes(NOT_SAVED), `${tag}: a write that may have landed gets the ‘wait’ reply, never ‘not saved’`);
  check.ok(!r.text.includes("오늘기록"), `${tag}: no record-list hint for a budget`);
  check.eq((fx.db.accountbook_budgets || []).length - before, kind === "lost" ? 1 : 0, `${tag}: fixture state matches the failure kind`);
}));

globalThis.Date = RealDate;
check.done();
