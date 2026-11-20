// 지운 방에서 한 번 눌러 새로 시작: 가계부가 삭제됐거나 연결이 해제된 단톡방의 거절 답에 단추 [이 방에서 새로 시작] 을 달고, 누르면 새 가계부를 만들어 그 방에 연결한다.
//  사용자(2026-11-20, 물음 창): 가계부를 지운 방을 어떻게 할지에 "한 번 눌러 새로 시작" — 거절 답의 단추 하나로 만들기와 연결을 한 번에, 누른 사람이 소유자.
//  R-1 누르면 된다: 새 가계부 하나(새 번호)·누른 사람이 소유자·그 방의 연결 줄이 새 가계부를 가리킨다. 지운 가계부의 번호는 다시 쓰지 않고 방의 표식은 그대로다.
//      처음 들어온 사람에게 보이는 약관 안내가 붙는다.
//  R-2 그 뒤: 그 방의 기록이 새 가계부에 저장되고 다른 참여자는 예전처럼 자동으로 들어온다.
//  R-3 다시 눌러도·함께 눌러도 가계부는 하나다.
//  R-4 기록을 보내는 것만으로는 여전히 다시 만들지 않는다(V22.9.31 규칙 그대로). 새 가계부를 또 지우면 같은 안내로 돌아가고, 다시 누르면 또 새 번호다.
//  R-5 다른 자리: 연결된 방(아무것도 하지 않음)·한 번도 연결된 적 없는 방과 만드는 중인 방(‘시작’ 과 같다)·1:1 채팅(안내만)·확인되지 않은 방 요청(만들지 않음).
//  R-6 정확히 그 말일 때만: ‘새로 시작’·‘이 방에서 새로 시작해줘’ 같은 말과 금액이 붙은 말은 새로 시작하지 않는다. 띄어쓰기·앞뒤 따옴표·끝의 마침표만 다른 말은 받는다.
//  R-7 도중에 실패해도 누른 사람이 다시 누르면 같은 가계부로 이어 한다. 그동안 다른 사람이 눌러도 가계부가 늘지 않는다. 만들기가 실패하면 아무것도 생기지 않는다.
//      이어 하기 표식이 남아 있어도 지운 번호·오래된 시도·쓰던 가계부는 다시 쓰지 않는다.
//  R-8 저장소 요청 수: 한 번 누를 때의 하위 요청이 Workers 의 요청당 한도(50)에서 넉넉히 아래다.
//  R-9 원본: 다시 만들지 않는 조건은 그대로, 잠금 순서, 새 번호, 단추 이름 = 보내는 말(14자 이하), 시작·설명서 판별보다 먼저 가린다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-20 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 단추가 없는 판)에서는 R-1~R-8 의 단언 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, putSetting, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("지운 방에서 한 번 눌러 새로 시작: 단추 하나로 새 가계부를 만들고 그 방에 연결(누른 사람이 소유자·가계부는 하나·기록만으로는 다시 만들지 않음) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 320)}`); } };
const read = (path) => { try { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); } catch (_) { return ""; } };
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const hex66 = (label) => createHash("sha256").update(`v229133-restart-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229133-room-restart-secret";
const DAY = "2026-11-20";
const U1 = hex66("user-1"), U2 = hex66("user-2"), U3 = hex66("user-3");
const RESTART = "이 방에서 새로 시작";
const ROOM_NAME = "이 방의 공동 가계부";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const DONE_TEXT = "✅ 이 방의 가계부를 새로 시작했어요.";
const ALREADY = "새로 시작하지 않았어요.";
const REFUSAL = "가계부를 자동으로 다시 만들지 않아서, 방금 기록은 어디에도 저장하지 않았어요.";
const FAILED = "이 방의 가계부를 새로 시작하지 못했어요. 잠시 뒤 다시 눌러 주세요.";
const NOT_LINKED = `새 가계부 ‘${ROOM_NAME}’ 는 만들었지만 이 방에 연결하지 못했어요.`;
const MARKER_PREFIX = "kakao_room_restart_v229133:";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

// 단톡방(room 이 있으면)·1:1 채팅의 한마디. 답의 글(말풍선·카드의 글을 이어서), 말풍선마다의 글, 단추 이름(카드 단추, 없으면 바로가기), 저장소 요청 수를 돌려준다.
//  chat: 방 값을 싣는 모양을 직접 줄 때(확인되지 않은 방 요청을 만들 때). env: 이 요청에만 더할 운영 변수.
async function say(fx, utterance, { user = U1, room = "", clear = true, chat = null, env = null } = {}) {
  if (clear) { globalThis.__AB_KAKAO_INFLIGHT?.clear?.(); globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.(); }
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (chat) userRequest.chat = chat;
  else if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const inner = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, init = {}) => { calls += 1; return inner(input, init); };
  let response, data;
  try {
    response = await app.fetch(new Request(`${BASE}/skill`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
      body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
    }), env ? { ...fx.env, ...env } : fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
    data = await response.json().catch(() => ({}));
    for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  } finally { globalThis.fetch = inner; }
  const outputs = data?.template?.outputs || [];
  const bubbles = outputs.map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || [o.basicCard?.title, o.basicCard?.description].filter(Boolean).join("\n") || "").filter(Boolean);
  const replies = (data?.template?.quickReplies || []).map((item) => ({ label: item.label, messageText: item.messageText, action: item.action }));
  const cards = outputs.flatMap((o) => (o.textCard?.buttons || o.basicCard?.buttons || []).map((button) => ({ label: button.label, messageText: button.messageText, action: button.action })));
  const items = cards.length ? cards : replies;
  return { status: response.status, text: bubbles.join("\n"), bubbles, items, buttons: items.map((item) => item.label), calls };
}

async function scene(name, task) {
  try {
    await withClock(DAY, () => fixture(async (fx) => {
      resetIsolateState();
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      try { await task(fx); } finally { resetIsolateState(); }
    }));
  } catch (error) { failures.push(`장면 ‘${name}’ 이 끝까지 가지 못함: ${String(error?.message || error).split(/\r?\n/)[0].slice(0, 240)}`); }
}
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const core = (fx) => JSON.stringify(["transactions", "households", "household_members"].map((table) => (fx.db[table] || []).length));
const counts = (fx) => ({ households: fx.db.households.length, members: fx.db.household_members.length, transactions: fx.db.transactions.length });
// 그 방에 연결된 가계부 번호들(방마다 한 줄 + 옛 지도 줄 — 둘 다 같은 가계부를 가리켜야 한다).
const linksOf = (fx, room) => {
  const found = [];
  for (const row of fx.db.accountbook_settings) {
    if (!String(row.key).startsWith("kakao_group_link")) continue;
    let value = row.value;
    try { value = typeof value === "string" ? JSON.parse(value) : value; } catch (_) { continue; }
    if (value?.group_key === room && value.household_id) found.push(String(value.household_id));
    else if (value && typeof value === "object" && value[room]?.household_id) found.push(String(value[room].household_id));
  }
  return found;
};
const linkedHouseholdOf = (fx, room) => linksOf(fx, room)[0] || "";
const hasSetting = (fx, key) => fx.db.accountbook_settings.some((row) => row.key === key);
const doneKey = (room) => `kakao_group_first_done_v22931:${sha(room)}`;
const retiredKey = (room) => `kakao_group_first_retired_v22931:${sha(room)}`;
const markerKey = (room) => `${MARKER_PREFIX}${sha(room)}`;
const retire = (fx, room) => putSetting(fx, retiredKey(room), JSON.stringify({ version: 1, group_hash: sha(room) }));
// 방 가계부를 삭제한 뒤의 모습: 가계부·구성원·기록 줄과 방 연결 줄이 지워지고 ‘준비 끝’ 줄은 남는다.
const purgeRoomHousehold = (fx, room, { keepLink = false } = {}) => {
  const householdId = linkedHouseholdOf(fx, room);
  if (!householdId) throw new Error("room has no linked household to purge");
  fx.db.households = fx.db.households.filter((row) => row.id !== householdId);
  fx.db.household_members = fx.db.household_members.filter((row) => row.household_id !== householdId);
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== householdId);
  if (!keepLink) fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !(String(row.key).startsWith("kakao_group_link") && JSON.stringify(row.value).includes(householdId)));
  resetIsolateState();
  return householdId;
};
const ownersOf = (fx, householdId) => fx.db.household_members.filter((row) => row.household_id === householdId && row.role === "owner").map((row) => row.user_id);
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
// 저장소 요청을 골라 실패시킨다(match 가 참인 요청에 status 로 답한다). 돌려주는 값 = 막은 횟수를 읽는 함수.
async function withStorageFailure(match, status, task) {
  const original = globalThis.fetch;
  let blocked = 0;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    const method = String(init.method || "GET").toUpperCase();
    if (match({ url, method, body: String(init.body || "") })) { blocked += 1; return new Response(JSON.stringify({ message: "simulated" }), { status, headers: { "content-type": "application/json" } }); }
    return original(input, init);
  };
  try { return { result: await task(), blocked: () => blocked }; } finally { globalThis.fetch = original; }
}
const isLinkWrite = ({ url, method, body }) => /\/rest\/v1\/accountbook_settings/.test(url) && method === "POST" && body.includes("kakao_group_link_v2254:");

// 새로 시작한 뒤의 모습을 한꺼번에 본다.
function expectRestarted(fx, reply, { room, presser, before, oldIds = [], label }) {
  const user = userByKey(fx, presser);
  const newId = linkedHouseholdOf(fx, room);
  const household = fx.db.households.find((row) => row.id === newId);
  check(() => ok(reply.text.startsWith(DONE_TEXT) && reply.text.includes(`가계부: ${ROOM_NAME} · 소유자는 방금 누른 나예요.`), `R-1 ${label}: 새로 시작했다고 답한다(${reply.text.slice(0, 60)})`), `${label} reply`);
  check(() => ok(reply.text.includes("이제 이 방의 기록은 새 가계부에 저장되고") && reply.text.includes("예전 가계부의 기록은 새 가계부로 옮겨지지 않아요. 저장하지 못한 기록은 다시 보내 주세요."), `R-1 ${label}: 어디에 저장되는지와 예전 기록은 옮겨지지 않는다는 것을 말한다`), `${label} reply lines`);
  check(() => eq(reply.buttons.join(" · "), "기록방법 · 이번달요약 · 이용약관 · 개인정보처리방침", `R-1 ${label}: 다음에 할 일 단추와 약관 안내의 단추`), `${label} reply buttons`);
  check(() => ok(reply.bubbles.length === 2 && reply.bubbles[1].includes("이용약관에 동의한 것으로 봐요"), `R-1 ${label}: 새 가계부에 처음 들어온 사람에게 보이는 약관 안내가 붙는다(${reply.bubbles.length}장)`), `${label} terms notice`);
  check(() => ok(!reply.text.includes(REFUSAL) && !/https?:\/\//.test(reply.text) && reply.bubbles[0].length <= 400, `R-1 ${label}: 거절 글·주소가 없고 카드 한 장에 든다(${reply.bubbles[0].length}자)`), `${label} reply shape`);
  check(() => eq(JSON.stringify(counts(fx)), JSON.stringify({ households: before.households + 1, members: before.members + 1, transactions: before.transactions }), `R-1 ${label}: 가계부 한 개와 구성원 줄 하나만 생긴다(기록은 그대로)`), `${label} counts`);
  check(() => ok(household && household.name === ROOM_NAME && UUID.test(String(household.id)) && String(household.invite_code || "").length >= 6, `R-1 ${label}: 새 가계부(이름·번호·초대코드 — ${household?.name} ${String(household?.id).slice(0, 8)})`), `${label} household`);
  check(() => ok(newId && !oldIds.includes(newId), `R-1 ${label}: 지운 가계부의 번호를 다시 쓰지 않는다(새 번호)`), `${label} new id`);
  check(() => eq(JSON.stringify(fx.db.household_members.filter((row) => row.household_id === newId).map((row) => [row.user_id, row.role])), JSON.stringify([[user?.id, "owner"]]), `R-1 ${label}: 구성원은 누른 사람 한 명, 소유자다`), `${label} owner`);
  const links = linksOf(fx, room);
  check(() => ok(links.length === 2 && links.every((id) => id === newId), `R-1 ${label}: 그 방의 연결 줄(방 줄·옛 지도 줄)이 모두 새 가계부를 가리킨다(${links.length}줄)`), `${label} links`);
  const item = fx.db.accountbook_settings.find((row) => String(row.key).startsWith("kakao_group_link_v2254:") && JSON.stringify(row.value).includes(newId));
  let linkedBy = "";
  try { linkedBy = JSON.parse(typeof item?.value === "string" ? item.value : JSON.stringify(item?.value || {})).linked_by || ""; } catch (_) {}
  check(() => eq(linkedBy, user?.id, `R-1 ${label}: 연결한 사람 = 누른 사람`), `${label} linked_by`);
  check(() => ok(hasSetting(fx, retiredKey(room)), `R-1 ${label}: 방의 ‘다시 만들지 않는 방’ 표식은 남는다(새 가계부를 또 지우면 같은 규칙으로 돌아간다)`), `${label} retired kept`);
  check(() => ok(!fx.db.accountbook_settings.some((row) => String(row.key).startsWith(MARKER_PREFIX)), `R-1 ${label}: 이어 하기 표식은 끝나면 지워진다`), `${label} marker cleared`);
  check(() => ok(hasSetting(fx, `kakao_first_record_history_v22928:${user?.id}`), `R-1 ${label}: 누른 사람의 ‘첫 기록 이력’ 표식이 남는다(답 뒤에 쓴다)`), `${label} history`);
  check(() => ok(reply.calls > 0 && reply.calls <= 40, `R-8 ${label}: 이 요청의 저장소 요청 ${reply.calls}개(요청당 한도 50)`), `${label} calls`);
  return newId;
}

// ── R-1·R-2. 삭제된 방: 거절 답의 단추를 누른다 ─────────────────────────────────────────────
await scene("삭제된 방에서 누른다", async (fx) => {
  const room = hex66("room-deleted");
  const first = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  check(() => ok(/공동 가계부를 준비했어요/.test(first.text) && /지출 저장했어요/.test(first.text), `픽스처: 새 방의 첫 기록은 가계부를 준비하고 저장한다(${first.text.slice(0, 50)})`), "fixture first record");
  const oldId = purgeRoomHousehold(fx, room);
  check(() => ok(hasSetting(fx, doneKey(room)) && !hasSetting(fx, retiredKey(room)), "픽스처: 지운 방에는 ‘준비 끝’ 줄이 남아 있다"), "fixture done marker");
  // 지운 사람이 아닌 다른 참여자가 기록을 보낸다 → 거절 답과 단추.
  const refused = await say(fx, "@말해가계부 커피2천원", { user: U2, room });
  check(() => ok(refused.text.includes(REFUSAL) && refused.text.includes(`이 방에서 새로 시작하려면 ‘${RESTART}’ 을 눌러 주세요(이 말을 보내도 돼요). 누른 분이 새 가계부의 소유자가 돼요.`), `R-1 거절 답이 단추 하나로 시작하는 길을 말한다(${refused.text.slice(0, 60)})`), "refusal line");
  check(() => eq(refused.buttons.join(" · "), `${RESTART} · 단톡방연결`, "R-1 거절 답의 단추 둘(이 방에서 새로 시작·단톡방연결)"), "refusal buttons");
  check(() => ok(refused.items[0]?.action === "message" && refused.items[0]?.messageText === RESTART && RESTART.length <= 14, `R-1 그 단추는 이름을 그대로 보낸다(단톡방의 카드 단추는 이름이 말로 나간다 — ${RESTART.length}자)`), "button payload");
  const before = counts(fx);
  const users = fx.db.users.length;
  // 단추를 누른다: 단톡방에서는 단추 이름이 그대로 말로 온다.
  const reply = await say(fx, refused.buttons[0], { user: U2, room });
  const newId = expectRestarted(fx, reply, { room, presser: U2, before, oldIds: [oldId], label: "삭제된 방(준비 끝 줄만), 다른 참여자가 누름" });
  check(() => eq(fx.db.users.length, users, "R-1 사용자 줄은 늘지 않는다"), "no new user");
  check(() => ok(hasSetting(fx, doneKey(room)), "R-1 방의 ‘준비 끝’ 표식도 그대로다"), "done kept");
  const old = userByKey(fx, U1);
  check(() => ok(!fx.db.household_members.some((row) => row.household_id === newId && row.user_id === old?.id), "R-1 지운 가계부의 소유자였던 사람은 새 가계부에 저절로 들어가 있지 않다"), "old owner not member");
  // R-2: 그 뒤의 기록과 다른 참여자.
  const saved = await say(fx, "@말해가계부 커피2천원", { user: U2, room });
  check(() => ok(/지출 저장했어요/.test(saved.text) && saved.text.includes(`가계부: ${ROOM_NAME}`) && fx.db.transactions.some((row) => row.household_id === newId && Number(row.amount) === 2000), `R-2 그 뒤의 기록은 새 가계부에 저장된다(${saved.text.slice(0, 40)})`), "saves after restart");
  const joined = await say(fx, "@말해가계부 라떼 4500원", { user: U1, room });
  check(() => ok(/지출 저장했어요/.test(joined.text) && fx.db.household_members.some((row) => row.household_id === newId && row.user_id === old?.id && row.role !== "owner"), "R-2 다른 참여자(지운 가계부의 소유자였던 사람 포함)는 기록 한 번으로 구성원으로 들어온다"), "others join");
  check(() => eq(JSON.stringify(ownersOf(fx, newId)), JSON.stringify([userByKey(fx, U2)?.id]), "R-2 소유자는 여전히 누른 사람 한 명이다"), "one owner");
  const started = await say(fx, "@말해가계부 시작", { user: U3, room });
  check(() => ok(started.text.includes(`이 방 가계부: ${ROOM_NAME}`) && !started.text.includes("자동으로 다시 만들지"), `R-2 ‘시작’ 은 이 방 가계부를 말한다(${started.text.slice(0, 60)})`), "start after restart");
  check(() => ok(!saved.text.includes(REFUSAL) && !joined.text.includes(REFUSAL), "R-2 연결된 뒤에는 거절 답이 나오지 않는다"), "no more refusal");
});

// ── R-1. 해제 줄만 있는 방 · 연결 줄은 남았는데 가계부가 사라진 방 · 처음 보는 사람 ─────────────────────
await scene("해제 줄만 있는 방에서 누른다", async (fx) => {
  const room = hex66("room-retired-only");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = counts(fx);
  // 봇을 부르는 말(멘션)이 앞에 붙어 와도 같다.
  const reply = await say(fx, `@말해가계부 ${RESTART}`, { user: U1, room });
  expectRestarted(fx, reply, { room, presser: U1, before, label: "연결을 끊은 방, 멘션이 붙은 말" });
});
await scene("가계부가 사라진 방에서 누른다", async (fx) => {
  const room = hex66("room-missing");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  const oldId = purgeRoomHousehold(fx, room, { keepLink: true });
  check(() => ok(linksOf(fx, room).includes(oldId), "픽스처: 연결 줄이 사라진 가계부를 가리킨 채 남아 있다"), "fixture dangling link");
  await say(fx, "안녕", { user: U2 });
  const before = counts(fx);
  // 기록을 먼저 보내지 않고 바로 눌러도 된다(연결 줄이 가리키는 가계부가 없으면 그 줄을 지우고 새로 시작한다).
  const reply = await say(fx, "이방에서새로시작", { user: U2, room });
  const newId = expectRestarted(fx, reply, { room, presser: U2, before, oldIds: [oldId], label: "가계부가 사라진 방, 붙여 쓴 말" });
  check(() => ok(!linksOf(fx, room).includes(oldId) && newId !== oldId, "R-1 사라진 가계부를 가리키던 연결 줄은 남지 않는다"), "dangling link replaced");
});
await scene("봇을 처음 쓰는 사람이 누른다", async (fx) => {
  // 남이 받은 거절 카드의 단추만 눌러도 된다: 사용자 줄이 생기고 소유자가 되며, 약관 안내를 받는다. 가계부가 사라진 연결 줄까지 겹친, 저장소 요청이 가장 많은 조합이다.
  const room = hex66("room-first-timer");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  const oldId = purgeRoomHousehold(fx, room, { keepLink: true });
  const before = counts(fx);
  const users = fx.db.users.length;
  const reply = await say(fx, RESTART, { user: U3, room, env: { NLU_METRICS_ENABLED: "1", NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_FAILURE_SAMPLE_RATE: "1" } });
  expectRestarted(fx, reply, { room, presser: U3, before, oldIds: [oldId], label: "처음 보는 사람 + 가계부가 사라진 연결 줄" });
  check(() => eq(fx.db.users.length, users + 1, "R-1 처음 보는 사람의 사용자 줄 하나가 생긴다"), "first timer user row");
  check(() => ok(events("kakao_terms_notice_dropped").length === 0, "R-1 약관 안내가 빠졌다는 이벤트가 없다"), "terms not dropped");
});

// ── R-3. 다시 눌러도·함께 눌러도 하나 ─────────────────────────────────────────────────
await scene("다시 누른다", async (fx) => {
  const room = hex66("room-again");
  retire(fx, room);
  await say(fx, RESTART, { user: U1, room });
  const newId = linkedHouseholdOf(fx, room);
  await say(fx, "안녕", { user: U2 });
  const before = core(fx);
  for (const [who, text, label] of [[U1, RESTART, "같은 사람"], [U2, RESTART, "구성원이 아닌 다른 사람"], [U1, "이방에서새로시작", "붙여 쓴 말"], [U2, `@말해가계부 ${RESTART}`, "멘션이 붙은 말"]]) {
    const again = await say(fx, text, { user: who, room });
    check(() => ok(again.text === `이 방은 이미 ‘${ROOM_NAME}’ 가계부에 연결돼 있어요. ${ALREADY}` && again.buttons.join(" · ") === "이번달요약 · 기록방법", `R-3 다시 누르면(${label}) 이미 연결돼 있다고 답한다(${again.text.slice(0, 50)})`), `again ${label}`);
    check(() => ok(core(fx) === before && linkedHouseholdOf(fx, room) === newId, `R-3 다시 눌러도(${label}) 가계부·구성원·기록·연결이 그대로다`), `again ${label} nothing`);
    check(() => ok(again.calls <= 20, `R-8 다시 누름(${label}): 저장소 요청 ${again.calls}개`), `again ${label} calls`);
  }
});
await scene("두 사람이 함께 누른다", async (fx) => {
  const room = hex66("room-together");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  await say(fx, "안녕", { user: U2 });
  const before = counts(fx);
  const replies = await Promise.all([say(fx, RESTART, { user: U1, room, clear: false }), say(fx, RESTART, { user: U2, room, clear: false })]);
  const wins = replies.filter((reply) => reply.text.startsWith(DONE_TEXT)).length;
  const newId = linkedHouseholdOf(fx, room);
  check(() => eq(fx.db.households.length, before.households + 1, `R-3 두 사람이 함께 눌러도 가계부는 하나만 생긴다(${fx.db.households.length - before.households}개)`), "together one household");
  check(() => eq(wins, 1, `R-3 한 사람만 ‘새로 시작했어요’ 를 받는다(${replies.map((reply) => reply.text.slice(0, 22)).join(" / ")})`), "together one winner");
  check(() => ok(replies.every((reply) => reply.text.startsWith(DONE_TEXT) || reply.text.includes(ALREADY) || reply.text.includes("처리 중이에요")), "R-3 늦은 쪽은 ‘이미 연결됨’ 이나 ‘처리 중’ 을 받는다(고장 났다는 글이 아니다)"), "together loser reply");
  const owners = ownersOf(fx, newId);
  check(() => ok(owners.length === 1 && [userByKey(fx, U1)?.id, userByKey(fx, U2)?.id].includes(owners[0]) && linksOf(fx, room).every((id) => id === newId), "R-3 연결된 가계부의 소유자는 누른 두 사람 가운데 한 명이다"), "together owner");
  check(() => eq(fx.db.household_members.length, before.members + 1, "R-3 구성원 줄도 하나만 생긴다"), "together members");
  check(() => ok(events("kakao_room_restart_failed").length === 0, "R-3 함께 누른 것은 실패 이벤트로 남지 않는다"), "together no failure event");
});

// ── R-4. 기록만으로는 여전히 다시 만들지 않는다 ─────────────────────────────────────────
await scene("새 가계부를 또 지운다", async (fx) => {
  const room = hex66("room-twice");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  const firstId = purgeRoomHousehold(fx, room);
  // 누르기 전: 기록·조회·시작·도움말 어느 말로도 만들어지지 않는다.
  const beforePress = core(fx);
  for (const text of ["@말해가계부 커피 2천원", "@말해가계부 오늘 기록 보기", "@말해가계부 시작", "@말해가계부 도움말", "@말해가계부 이번달요약"]) await say(fx, text, { user: U1, room });
  check(() => eq(core(fx), beforePress, "R-4 누르기 전에는 기록·조회·시작·도움말 어느 말로도 가계부가 만들어지지 않는다(규칙은 그대로)"), "no auto recreate");
  await say(fx, RESTART, { user: U1, room });
  const secondId = linkedHouseholdOf(fx, room);
  await say(fx, "@말해가계부 점심 9000원", { user: U1, room });
  purgeRoomHousehold(fx, room);
  await say(fx, "안녕", { user: U2 });
  const before = counts(fx);
  const refused = await say(fx, "@말해가계부 커피 2천원", { user: U2, room });
  check(() => ok(refused.text.includes(REFUSAL) && refused.buttons[0] === RESTART && JSON.stringify(counts(fx)) === JSON.stringify(before), "R-4 새 가계부를 또 지우면 같은 안내로 돌아가고 기록으로는 만들어지지 않는다"), "refuses again");
  // 같은 사람이 곧바로 다시 눌러도(이어 하기 표식은 지워졌다) 지운 번호를 다시 쓰지 않는다.
  const reply = await say(fx, refused.buttons[0], { user: U1, room });
  expectRestarted(fx, reply, { room, presser: U1, before, oldIds: [firstId, secondId], label: "두 번째로 새로 시작" });
});

// ── R-5. 다른 자리 ─────────────────────────────────────────────────────────
await scene("연결된 방·새 방·만드는 중인 방·1:1·확인되지 않은 요청", async (fx) => {
  // 연결된 방(지운 적 없음): 아무것도 하지 않는다.
  const linked = hex66("room-linked");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room: linked });
  const linkedId = linkedHouseholdOf(fx, linked);
  await say(fx, "안녕", { user: U2 });
  let before = core(fx);
  const onLinked = await say(fx, RESTART, { user: U2, room: linked });
  check(() => ok(onLinked.text.includes(ALREADY) && onLinked.text.includes(`‘${ROOM_NAME}’`) && linkedHouseholdOf(fx, linked) === linkedId, `R-5 연결된 방에서는 새로 시작하지 않는다(${onLinked.text.slice(0, 50)})`), "linked no-op");
  check(() => ok(core(fx) === before && !ownersOf(fx, linkedId).includes(userByKey(fx, U2)?.id), "R-5 연결된 방: 가계부가 늘지 않고 누른 사람이 소유자가 되지도 않는다"), "linked nothing");
  // 한 번도 연결된 적 없는 방: ‘시작’ 과 같다(부른 사람이 첫 호출자로 준비한다 — 예전 길).
  const fresh = hex66("room-fresh");
  const startLike = await say(fx, "@말해가계부 시작", { user: U3, room: hex66("room-fresh-start") });
  const onFresh = await say(fx, RESTART, { user: U3, room: fresh });
  check(() => eq(onFresh.text.replace(/\s+/g, " "), startLike.text.replace(/\s+/g, " "), "R-5 한 번도 연결된 적 없는 방에서는 ‘시작’ 과 같은 답이다"), "fresh like start");
  check(() => ok(onFresh.text.includes("첫 호출자인 내가 소유자예요") && ownersOf(fx, linkedHouseholdOf(fx, fresh)).includes(userByKey(fx, U3)?.id) && !onFresh.text.startsWith(DONE_TEXT), "R-5 그 방은 예전처럼 첫 호출로 준비된다(새로 시작 답이 아니다)"), "fresh prepared the old way");
  // 만드는 중인 방: 새로 만들지 않고 ‘시작’ 과 같은 답이다.
  const preparing = hex66("room-preparing"), preparingStart = hex66("room-preparing-start");
  for (const room of [preparing, preparingStart]) putSetting(fx, `kakao_group_first_v22931:${sha(room)}`, JSON.stringify({ version: 1, group_key: room, owner_id: "u-nobody", candidate_id: "11111111-1111-4111-8111-111111111111", phase: "create_sent", created_at: new Date().toISOString() }));
  before = core(fx);
  const startOnPreparing = await say(fx, "@말해가계부 시작", { user: U1, room: preparingStart });
  const onPreparing = await say(fx, RESTART, { user: U1, room: preparing });
  check(() => ok(onPreparing.text === startOnPreparing.text && onPreparing.text.includes("만드는 중") && !onPreparing.text.startsWith(DONE_TEXT), `R-5 만드는 중인 방에서는 ‘시작’ 과 같은 답이다(${onPreparing.text.slice(0, 50)})`), "preparing like start");
  check(() => ok(core(fx) === before && !linkedHouseholdOf(fx, preparing) && !fx.db.accountbook_settings.some((row) => String(row.key).startsWith(MARKER_PREFIX)), "R-5 만드는 중인 방에서는 아무것도 만들지 않는다"), "preparing nothing");
  // 1:1 채팅: 안내만.
  before = core(fx);
  const direct = await say(fx, RESTART, { user: U1 });
  check(() => ok(direct.text.includes("단톡방에서 쓰는 말이에요") && direct.buttons.join(" · ") === "시작" && core(fx) === before, `R-5 1:1 채팅에서는 안내만 한다(${direct.text.slice(0, 50)})`), "direct only explains");
  // 확인되지 않은 방 요청(방 값이 종류 표시 없이 실린 옛 모양 — 읽기·연결에는 쓰여도 가계부를 준비할 근거는 아니다): 만들지 않는다.
  const loose = hex66("room-loose");
  retire(fx, loose);
  before = core(fx);
  const onLoose = await say(fx, RESTART, { user: U1, chat: { id: loose } });
  check(() => ok(onLoose.text.startsWith("이 요청으로는 이 방의 가계부를 새로 시작할 수 없어요.") && core(fx) === before && !linkedHouseholdOf(fx, loose), `R-5 확인되지 않은 방 요청으로는 만들지 않는다(${onLoose.text.slice(0, 50)})`), "unverified room request");
  const onTyped = await say(fx, RESTART, { user: U1, room: loose });
  check(() => ok(onTyped.text.startsWith(DONE_TEXT), "R-5 같은 방도 확인된 요청으로 누르면 된다"), "verified room request");
});

// ── R-6. 정확히 그 말일 때만 ────────────────────────────────────────────────────
await scene("말 가리기", async (fx) => {
  const room = hex66("room-words");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = core(fx);
  for (const text of ["새로 시작", "이 방에서 새로 시작해줘", "이 방에서 새로 시작 할래요", "이 방에서 다시 시작", "이 방 새로 시작", "새로 시작하기", "시작", "가계부 새로 시작", `${RESTART} 5000원`, `커피 5000원 ${RESTART}`, `${RESTART}?`, `그 ${RESTART}`]) {
    const reply = await say(fx, `@말해가계부 ${text}`, { user: U1, room });
    check(() => ok(!reply.text.startsWith(DONE_TEXT) && core(fx) === before && !linkedHouseholdOf(fx, room), `R-6 ‘${text}’ 는 새로 시작하지 않는다(${reply.text.slice(0, 40)})`), `not the command: ${text}`);
  }
  const amount = await say(fx, `@말해가계부 ${RESTART} 5000원`, { user: U1, room });
  check(() => ok(amount.text.includes(REFUSAL) && amount.buttons[0] === RESTART, "R-6 금액이 붙은 말은 기록으로 읽혀 거절 답(단추 포함)을 받는다"), "amount is a record");
  const help = await say(fx, "@말해가계부 시작", { user: U1, room });
  // V22.9.134: 단톡방 답이라 보낼 말로 적힌 자리(‘새로 시작하려면 ‘…’’)에는 따옴표 안에 봇 부르기가 붙는다.
  check(() => ok(help.text.includes(`새로 시작하려면 ‘@말해가계부 ${RESTART}’`) && help.text.includes("해제되어") && help.bubbles[0].length <= 400, `R-6 ‘시작’ 은 도움말 첫 화면이고 상태 한 줄이 그 말을 알려 준다(${help.bubbles[0].length}자)`), "start shows the command");
  const asked = await say(fx, "@말해가계부 오늘 기록 보기", { user: U1, room });
  check(() => ok(asked.buttons[0] === RESTART && asked.buttons.includes("단톡방연결") && asked.text.includes(`‘${RESTART}’`), `R-6 조회 답에도 그 단추가 맨 앞에 달린다(${asked.buttons.join("·")})`), "query reply button");
  const info = await say(fx, "@말해가계부 단톡방 정보", { user: U1, room });
  check(() => ok(info.buttons[0] === RESTART && info.buttons.includes("가계부만들기") && info.text.includes(`‘${RESTART}’ 을 눌러 주세요`), `R-6 ‘단톡방 정보’ 에도 그 단추가 맨 앞에 달린다(${info.buttons.join("·")})`), "info reply button");
  check(() => eq(core(fx), before, "R-6 여기까지 아무것도 만들어지지 않았다"), "still nothing");
  // 받는 말: 앞뒤 따옴표(안내문이 ‘ ’ 로 싸서 적는다)·끝의 마침표·느낌표만 다른 것. 방마다 한 번씩 눌러 본다.
  for (const text of [`‘${RESTART}’`, `${RESTART}.`, `"${RESTART}"!`, ` 이 방에서  새로   시작 `]) {
    const other = hex66(`room-words-${text}`);
    retire(fx, other);
    const reply = await say(fx, `@말해가계부 ${text}`, { user: U1, room: other });
    check(() => ok(reply.text.startsWith(DONE_TEXT) && !!linkedHouseholdOf(fx, other), `R-6 ‘${text.trim()}’ 는 그 말로 받는다`), `the command: ${text}`);
  }
  // 열려 있던 가계부 만들기 흐름은 닫히고 새로 시작한다.
  await say(fx, "@말해가계부 가계부만들기", { user: U1, room });
  const counted = counts(fx);
  const reply = await say(fx, RESTART, { user: U1, room });
  expectRestarted(fx, reply, { room, presser: U1, before: counted, label: "가계부 만들기 흐름을 열어 둔 채 누름" });
  const after = await say(fx, "@말해가계부 모임 회비", { user: U1, room });
  check(() => ok(!/가계부 이름을 정해 주세요/.test(after.text), "R-6 열려 있던 가계부 만들기 흐름은 닫혔다(용도 답으로 읽지 않는다)"), "flow closed");
});
await scene("열어 둔 수정 창", async (fx) => {
  // 기록의 수정 창을 열어 둔 채(5분) 연결이 끊긴 방에서 눌러도 그 말이 수정 창으로 가지 않는다.
  const room = hex66("room-edit-session");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  const opened = await say(fx, "@말해가계부 수정 01번", { user: U1, room });
  check(() => ok(/01번/.test(opened.text), `픽스처: 수정 창이 열렸다(${opened.text.slice(0, 40)})`), "fixture edit session");
  const oldId = linkedHouseholdOf(fx, room);
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !(String(row.key).startsWith("kakao_group_link") && JSON.stringify(row.value).includes(oldId)));
  retire(fx, room);
  resetIsolateState();
  const before = counts(fx);
  const amountBefore = fx.db.transactions.find((row) => row.household_id === oldId)?.amount;
  const reply = await say(fx, RESTART, { user: U1, room });
  expectRestarted(fx, reply, { room, presser: U1, before, oldIds: [oldId], label: "수정 창을 열어 둔 채 누름(연결만 끊은 방)" });
  check(() => eq(fx.db.transactions.find((row) => row.household_id === oldId)?.amount, amountBefore, "R-6 그 말이 열린 수정 창으로 가서 예전 기록을 바꾸지 않는다"), "edit session not fed");
});

// ── R-7. 도중에 실패해도 다시 누르면 이어 한다 ──────────────────────────────────────────
await scene("연결 줄 쓰기가 실패한다", async (fx) => {
  const room = hex66("room-link-fails");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = counts(fx);
  // 실패가 이어지는 동안 네 번 누른다: 가계부는 하나만 생긴다(같은 가계부로 이어 한다).
  const tries = await withStorageFailure(isLinkWrite, 503, async () => { const out = []; for (let n = 0; n < 4; n += 1) out.push(await say(fx, RESTART, { user: U1, room })); return out; });
  const reply = tries.result[0];
  check(() => ok(tries.blocked() >= 4, `픽스처: 방 연결 줄 쓰기를 막았다(${tries.blocked()}번)`), "link blocked");
  check(() => ok(tries.result.every((item) => item.text.startsWith(NOT_LINKED) && item.text.includes(`‘${RESTART}’ 을 다시 눌러 주세요. 누른 분이 30분 안에 다시 누르면 같은 가계부로 이어서 연결해요.`) && item.buttons.join(" · ") === `${RESTART} · 단톡방연결`), `R-7 연결이 실패하면 다시 누르라고 답한다(${reply.text.slice(0, 60)})`), "link failure reply");
  check(() => ok(!reply.text.startsWith(DONE_TEXT) && !linkedHouseholdOf(fx, room), "R-7 방은 연결되지 않은 그대로다(새로 시작했다고 하지 않는다)"), "link failure not linked");
  check(() => eq(JSON.stringify(counts(fx)), JSON.stringify({ households: before.households + 1, members: before.members + 1, transactions: before.transactions }), "R-7 네 번 눌러도 가계부는 하나만 생겼다(누른 사람이 소유자)"), "link failure one household");
  check(() => eq(events("kakao_room_restart_bind_failed").length, 4, "R-7 운영 이벤트가 누른 만큼 남는다"), "link failure events");
  const created = fx.db.households.find((row) => row.name === ROOM_NAME && ownersOf(fx, row.id).includes(userByKey(fx, U1)?.id) && !fx.db.transactions.some((tx) => tx.household_id === row.id));
  check(() => ok(created && hasSetting(fx, markerKey(room)), "R-7 만들다 만 가계부의 번호가 방의 이어 하기 표식에 남아 있다"), "marker kept");
  // 저장소가 돌아온 뒤 다시 누른다: 같은 가계부가 연결된다.
  const retry = await say(fx, reply.buttons[0], { user: U1, room });
  check(() => ok(retry.text.startsWith(DONE_TEXT) && linkedHouseholdOf(fx, room) === created?.id, `R-7 다시 누르면 그 가계부로 이어서 연결된다(${retry.text.slice(0, 30)})`), "resumes same household");
  check(() => ok(fx.db.households.length === before.households + 1 && fx.db.household_members.length === before.members + 1 && !hasSetting(fx, markerKey(room)), "R-7 가계부는 여전히 하나만 늘었고 표식은 지워졌다"), "resume totals");
});
await scene("소유자 줄 쓰기가 실패한다", async (fx) => {
  // 가계부는 만들어졌는데 소유자 줄의 결과를 모르는 실패(503)가 이어진다: 누를 때마다 가계부가 늘지 않고, 돌아오면 그 가계부로 끝난다.
  const room = hex66("room-owner-fails");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = counts(fx);
  const tries = await withStorageFailure(({ url, method }) => /\/rest\/v1\/household_members/.test(url) && method === "POST", 503, async () => { const out = []; for (let n = 0; n < 3; n += 1) out.push(await say(fx, RESTART, { user: U1, room })); return out; });
  check(() => ok(tries.blocked() >= 3 && tries.result.every((item) => item.text === FAILED && item.buttons.join(" · ") === RESTART), `R-7 소유자 줄을 쓰지 못하면 다시 누르라고 답한다(${tries.result[0].text.slice(0, 40)})`), "owner failure reply");
  check(() => ok(fx.db.households.length === before.households + 1 && !linkedHouseholdOf(fx, room), `R-7 세 번 눌러도 가계부는 하나만 생겼고 방은 그대로다(${fx.db.households.length - before.households}개)`), "owner failure one household");
  const retry = await say(fx, RESTART, { user: U1, room });
  expectRestarted(fx, retry, { room, presser: U1, before, label: "소유자 줄 실패 뒤 다시 누름" });
});
await scene("만들기가 실패한다 · 이력 표식 쓰기가 실패한다", async (fx) => {
  const room = hex66("room-create-fails");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = core(fx);
  const tried = await withStorageFailure(({ url, method }) => /\/rest\/v1\/households(?:\?|$)/.test(url) && method === "POST", 400, () => say(fx, RESTART, { user: U1, room }));
  const reply = tried.result;
  check(() => ok(tried.blocked() >= 1 && reply.text === FAILED && reply.buttons.join(" · ") === RESTART, `R-7 만들기가 실패하면 다시 누르라고 답한다(${reply.text.slice(0, 50)})`), "create failure reply");
  check(() => ok(core(fx) === before && !linkedHouseholdOf(fx, room), "R-7 만들기가 실패하면 가계부·구성원·기록·연결이 그대로다"), "create failure nothing");
  check(() => ok(events("kakao_room_restart_failed").length === 1, "R-7 운영 이벤트 한 건이 남는다"), "create failure event");
  // 다시 누르면 된다(없는 번호를 다시 쓰지 않는다 — 새 번호로 만든다).
  const counted = counts(fx);
  const retry = await say(fx, reply.buttons[0], { user: U1, room });
  expectRestarted(fx, retry, { room, presser: U1, before: counted, label: "만들기 실패 뒤 다시 누름" });
  // ‘첫 기록 이력’ 표식 쓰기가 실패해도 새로 시작은 끝난 것이다(답 뒤에 쓰는 표식이다).
  const other = hex66("room-history-fails");
  retire(fx, other);
  await say(fx, "안녕", { user: U2 });
  const second = counts(fx);
  const history = await withStorageFailure(({ url, method, body }) => /\/rest\/v1\/accountbook_settings/.test(url) && method === "POST" && body.includes("kakao_first_record_history_v22928:"), 503, () => say(fx, RESTART, { user: U2, room: other }));
  check(() => ok(history.blocked() >= 1 && history.result.text.startsWith(DONE_TEXT) && fx.db.households.length === second.households + 1 && !!linkedHouseholdOf(fx, other), "R-7 이력 표식을 쓰지 못해도 새로 시작은 끝난다(가계부 하나, 방 연결됨)"), "history failure harmless");
});
await scene("그 사이 계정이 통합됐다", async (fx) => {
  // 누른 사람의 계정이 이 요청이 사용자 줄을 읽은 뒤에 다른 계정으로 통합됐다(방 상태를 읽을 때 통합 표식이 보인다): 만들지 않는다.
  const room = hex66("room-merged");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const user = userByKey(fx, U1);
  const before = core(fx);
  const original = globalThis.fetch;
  let injected = false;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (!injected && /accountbook_settings/.test(url) && decodeURIComponent(url).includes("kakao_group_first_v22931:")) { injected = true; putSetting(fx, `identity_merge_redirect:${user.id}`, "users-merged-into"); }
    return original(input, init);
  };
  let reply = null;
  try { reply = await say(fx, RESTART, { user: U1, room }); } finally { globalThis.fetch = original; }
  check(() => ok(injected && reply.text.startsWith("계정 통합으로 사용자 정보가 바뀌어 새로 시작하지 않았어요.") && core(fx) === before && !linkedHouseholdOf(fx, room), `R-7 통합된 계정은 새 가계부의 소유자가 되지 못한다(${reply.text.slice(0, 50)})`), "merged account refused");
});

await scene("다른 사람이 시작하다 만 방", async (fx) => {
  // U1 이 눌렀는데 연결 줄 쓰기가 실패했다. 그동안 다른 사람들이 번갈아 눌러도 가계부는 늘지 않고, U1 이 다시 누르면 U1 의 가계부로 이어진다.
  const room = hex66("room-pending-other");
  retire(fx, room);
  for (const who of [U1, U2, U3]) await say(fx, "안녕", { user: who });
  const before = counts(fx);
  await withStorageFailure(isLinkWrite, 503, () => say(fx, RESTART, { user: U1, room }));
  const pendingId = fx.db.households.find((row) => row.name === ROOM_NAME && ownersOf(fx, row.id).includes(userByKey(fx, U1)?.id) && !linksOf(fx, room).includes(row.id))?.id;
  check(() => ok(pendingId && fx.db.households.length === before.households + 1, "픽스처: U1 이 만든 가계부가 연결되지 않은 채 남았다"), "fixture pending household");
  const afterFirst = core(fx);
  for (const who of [U2, U3, U2]) {
    const other = await say(fx, RESTART, { user: who, room });
    check(() => ok(other.text.startsWith("다른 분이 이 방의 새 가계부를 만드는 중이에요(연결이 아직 끝나지 않았어요).") && other.text.includes(`그분이 ‘${RESTART}’ 을 다시 누르면 이어서 연결돼요.`) && other.buttons.join(" · ") === RESTART, `R-7 다른 사람이 시작하다 만 방에서는 만들지 않고 그렇게 알린다(${other.text.slice(0, 40)})`), `pending other reply ${who.slice(0, 4)}`);
    check(() => ok(core(fx) === afterFirst && !linkedHouseholdOf(fx, room) && !other.text.includes("소유자는 방금 누른 나예요"), "R-7 그 사람은 가계부를 만들지도, 남의 가계부를 이 방에 붙이지도 않는다"), `pending other nothing ${who.slice(0, 4)}`);
  }
  const resumed = await say(fx, RESTART, { user: U1, room });
  check(() => ok(resumed.text.startsWith(DONE_TEXT) && linkedHouseholdOf(fx, room) === pendingId && fx.db.households.length === before.households + 1, "R-7 시작한 사람이 다시 누르면 그 가계부로 이어서 연결된다(가계부는 하나)"), "pending other resumed by starter");
  check(() => eq(JSON.stringify(ownersOf(fx, pendingId)), JSON.stringify([userByKey(fx, U1)?.id]), "R-7 소유자는 시작한 사람이다"), "pending other owner");
});
await scene("남아 있는 이어 하기 표식", async (fx) => {
  await say(fx, "안녕", { user: U1 });
  await say(fx, "안녕", { user: U2 });
  const me = userByKey(fx, U1), someone = userByKey(fx, U2);
  const nowIso = () => new Date().toISOString();
  const addHousehold = (id, ownerId, { used = false } = {}) => {
    fx.db.households.push({ id, name: ROOM_NAME, invite_code: `QA${id.slice(0, 6).toUpperCase()}`, created_at: nowIso() });
    fx.db.household_members.push({ household_id: id, user_id: ownerId, role: "owner", created_at: nowIso() });
    if (used) fx.db.transactions.push({ id: `tx-${id.slice(0, 8)}`, household_id: id, user_id: ownerId, type: "expense", amount: 1000, memo: "쓰던 기록", date: DAY, created_at: nowIso() });
  };
  const mark = (room, householdId, ownerId, minutesAgo = 1) => putSetting(fx, markerKey(room), JSON.stringify({ version: 1, household_id: householdId, owner_id: ownerId, created_at: new Date(Date.now() - minutesAgo * 60 * 1000).toISOString() }));
  const cases = [
    // [이름, 표식이 가리키는 번호, 그 가계부를 만들어 둘지(주인·쓰던 것인지), 표식의 주인, 몇 분 전]
    ["표식이 가리키는 가계부가 지워졌다(지운 번호)", "aaaaaaaa-1111-4111-8111-aaaaaaaaaaa1", null, me.id, 1],
    ["30분이 지난 내 시도", "aaaaaaaa-2222-4222-8222-aaaaaaaaaaa2", { owner: me.id }, me.id, 31],
    ["표식이 남은 채 쓰던 내 가계부(기록이 있다)", "aaaaaaaa-3333-4333-8333-aaaaaaaaaaa3", { owner: me.id, used: true }, me.id, 1],
    ["남의 표식인데 그 가계부는 쓰던 것이다", "aaaaaaaa-4444-4444-8444-aaaaaaaaaaa4", { owner: someone.id, used: true }, someone.id, 1],
    ["30분이 지난 남의 시도", "aaaaaaaa-5555-4555-8555-aaaaaaaaaaa5", { owner: someone.id }, someone.id, 31],
  ];
  for (const [label, staleId, existing, markerOwner, minutesAgo] of cases) {
    const room = hex66(`room-stale-${label}`);
    retire(fx, room);
    if (existing) addHousehold(staleId, existing.owner, existing);
    mark(room, staleId, markerOwner, minutesAgo);
    const before = counts(fx);
    const reply = await say(fx, RESTART, { user: U1, room });
    const linkedTo = linkedHouseholdOf(fx, room);
    check(() => ok(reply.text.startsWith(DONE_TEXT) && linkedTo && linkedTo !== staleId && UUID.test(linkedTo), `R-7 ${label}: 그 번호를 다시 쓰지 않고 새 번호로 시작한다(${reply.text.slice(0, 24)})`), `stale marker ${label}`);
    check(() => ok(fx.db.households.length === before.households + 1 && JSON.stringify(ownersOf(fx, linkedTo)) === JSON.stringify([me.id]), `R-7 ${label}: 새 가계부 하나, 소유자는 누른 사람`), `stale marker ${label} owner`);
    check(() => ok(!fx.db.households.some((row) => row.id === staleId) === !existing && !linksOf(fx, room).includes(staleId), `R-7 ${label}: 표식이 가리키던 가계부는 이 방에 붙지 않는다`), `stale marker ${label} untouched`);
  }
});
await scene("다른 요청이 이 방의 잠금을 쥐고 있다", async (fx) => {
  // 다른 isolate 의 요청이 이 방의 잠금을 쥐고 있는 때: 고장이 아니다 — ‘처리 중’ 이라고 답하고 아무것도 만들지 않는다.
  const room = hex66("room-busy");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const before = core(fx);
  fx.db.accountbook_operation_locks.push({ operation_key: `kakao-group-lifecycle:v22931:${sha(room)}`, owner: "another-isolate", locked_until: new Date(Date.now() + 60 * 1000).toISOString(), updated_at: new Date().toISOString() });
  const reply = await say(fx, RESTART, { user: U1, room });
  check(() => ok(reply.text === "이 방의 공동 가계부를 준비하거나 바꾸는 요청이 처리 중이에요. 잠시 뒤 다시 눌러 주세요." && reply.buttons.join(" · ") === RESTART, `R-7 방의 잠금을 다른 요청이 쥐고 있으면 ‘처리 중’ 이라고 답한다(${reply.text.slice(0, 40)})`), "busy reply");
  check(() => ok(core(fx) === before && !linkedHouseholdOf(fx, room) && events("kakao_room_restart_failed").length === 0, "R-7 그때는 아무것도 만들지 않고 실패 이벤트도 남기지 않는다"), "busy nothing");
});

// ── R-9. 원본 ───────────────────────────────────────────────────────────────
{
  const first = read("src/modules/kakao/group-links-first-record.js");
  const commands = read("src/modules/kakao/household-budget-commands.js");
  const handler = read("src/modules/kakao/skill-handler.js");
  check(() => ok(first.includes('if (!snapshot.link && (snapshot.retired || snapshot.done || marker?.phase === "complete")) {') && first.includes('return rejected("retired", ['), "원본: 기록을 보내는 것만으로는 다시 만들지 않는 조건이 그대로다"), "rule unchanged");
  const whole = first.slice(first.indexOf("async function restartKakaoRoomV229133("), first.indexOf("async function kakaoGroupInfoText("));
  const body = whole.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  check(() => ok(body.length > 400 && body.includes("withKakaoUserLifecycleLease(env, user.id,") && body.indexOf("withKakaoUserLifecycleLease(") < body.indexOf("withKakaoGroupLifecycleLease("), "원본: 잠금 순서는 사용자 → 방이다(다른 길과 같다)"), "lock order");
  check(() => ok(body.includes("if (!(await kakaoClaimUserUnmerged(env, user.id, { userRow: user, redirectValue: snapshot.redirectValue, redirectUnderLease: true }))) return { ok: false, reason: \"merged\" };"), "원본: 방 잠금 안에서 읽은 값으로 계정 통합을 확인한다(첫 기록 길과 같다)"), "merge check");
  check(() => ok(body.includes("await getLinkedKakaoGroupHousehold(env, key, { roomLeaseHeld: true, assertFresh })") && body.includes('if (phase !== "retired") return'), "원본: 방 잠금 안에서 연결과 방 상태를 다시 읽고, 삭제·해제된 방일 때만 만든다"), "recheck under lease");
  check(() => ok(body.includes("const id = crypto.randomUUID();") && body.includes("await createUserHousehold(env, user.id, KAKAO_ROOM_RESTART_NAME_V229133, nickname, { id, lifecycleLeaseHeld: true, assertFresh, skipChatFirstHistory: true });") && !body.includes("kakaoGroupCandidateId"), "원본: 새 가계부는 새 번호로 만든다(방 값에서 정해지는 고정 번호를 쓰지 않는다)"), "fresh id");
  check(() => ok(body.indexOf("await saveSettingValue(env, markerKey,") > 0 && body.indexOf("await saveSettingValue(env, markerKey,") < body.indexOf("await createUserHousehold("), "원본: 만들기 전에 이번 시도의 번호를 이어 하기 표식에 적는다"), "marker before create");
  check(() => ok(body.includes("if (marker && Date.now() - marker.createdAt < KAKAO_ROOM_RESTART_RESUME_MS_V229133) {") && body.includes("const pending = await getHouseholdById(env, marker.household_id);") && body.includes("if (pending && Array.isArray(used) && !used.length) {") && body.includes("if (marker.owner_id !== String(user.id)) return { ok: false, reason: \"pending_other\" };") && body.includes("if (!/owner_already_exists/.test(safeError(err))) throw err;"), "원본: 이어 하기는 30분 안·그 번호의 가계부가 있고 기록이 없을 때만이고, 남이 시작한 것이면 만들지 않으며, 소유자 줄을 쓰지 못한 오류는 새 번호로 넘어가지 않는다"), "resume rule");
  check(() => ok(body.includes("if (!snapshot.retired) await markKakaoGroupRetired(env, key, assertFresh);") && body.includes("const link = await saveKakaoGroupLink(env, key, household, user.id);") && !body.includes("bindKakaoGroupByInviteCode("), "원본: 연결 줄은 방 잠금 안에서 바로 쓴다(해제 표식 → 연결 줄 — 단톡방 연결의 마지막 두 걸음과 같다)"), "link writes");
  check(() => ok(body.includes("await deferKakaoAfterReply(env, () => markKakaoChatFirstHistory(env, user.id).catch(() => {}));") && body.indexOf("deferKakaoAfterReply(") > body.indexOf("saveKakaoGroupLink("), "원본: ‘첫 기록 이력’ 표식은 연결 뒤, 답 뒤로 미룬다"), "history deferred");
  check(() => ok(first.includes(`const KAKAO_ROOM_RESTART_NAME_V229133 = "${ROOM_NAME}";`) && first.includes("const KAKAO_ROOM_RESTART_RESUME_MS_V229133 = 30 * 60 * 1000;"), "원본: 새 가계부의 이름은 방 가계부의 이름과 같고 이어 하기는 30분이다"), "name");
  check(() => ok(commands.includes(`const KAKAO_ROOM_RESTART_COMMAND_V229133 = "${RESTART}";`) && commands.includes("return bare === KAKAO_ROOM_RESTART_COMMAND_V229133.replace(/\\s+/g, \"\");"), "원본: 단추 이름 = 보내는 말이고, 정확히 그 말만 받는다"), "command");
  const flag = handler.indexOf("const roomRestartCommand = !strongTransactionInput && !separatePurchaseCommand && !editLikeUtterance && isKakaoRoomRestartCommandV229133(utterance);");
  const manual = handler.indexOf("const manualTopic = strongTransactionInput || roomRestartCommand ? \"\"");
  const bypass = handler.indexOf("const bypassPublic = roomRestartCommand ||");
  const session = handler.indexOf("if (!separatePurchaseCommand && !roomRestartCommand && skillConfigured && kakaoUserKey && !isKakaoEditSessionBypassCommand(utterance) &&");
  const branch = handler.indexOf("  if (roomRestartCommand) {");
  const menu = handler.indexOf("  if (!strongTransactionInput && isCommandMenuCommand(utterance)) {\n    return kakaoManualReply(\"home\", { group: !!botGroupKey });\n  }\n\n  if (!strongTransactionInput && isKakaoStartCommand(utterance)) {");
  check(() => ok(flag > 0 && flag < manual && manual < bypass && bypass < session && session < branch && branch < menu, "원본: 그 말은 설명서·공개 안내·열린 수정 창·시작 명령 판별보다 먼저 가려지고, 처리 자리는 시작 명령 앞이다"), "handler order");
  const block = handler.slice(branch, menu);
  check(() => ok(block.includes("if (!roomJoinEligible) return kakaoText(") && block.indexOf("if (!roomJoinEligible)") < block.indexOf("restartKakaoRoomV229133(env,"), "원본: 확인된 단톡방 요청에서만 한다(첫 기록 자동 준비와 같은 조건)"), "trusted only");
  check(() => ok(handler.includes("const householdsPromise = roomRestartCommand ? Promise.resolve({ value: [] })") && handler.includes("const linkedGroupPromise = botGroupKey && !groupFirstRecord && !roomRestartCommand"), "원본: 이 말에는 가계부 목록·방 연결을 미리 읽지 않는다(저장소 요청 수)"), "no eager reads");
  check(() => ok(block.includes("if (env.__AB_KAKAO_REQUEST) env.__AB_KAKAO_REQUEST.termsNoticeV229118 = true;"), "원본: 새로 시작한 답에 약관 안내를 켠다"), "terms flag");
  check(() => eq((handler.match(/restartKakaoRoomV229133\(/g) || []).length, 1, "원본: 새로 시작을 부르는 곳은 한 곳이다"), "one call site");
  check(() => ok(!/무료|평생|언제나/.test(block), "원본: 답 글에 ‘무료’·앞날 약속이 없다"), "copy rules");
}

if (failures.length) {
  console.error(`지운 방에서 한 번 눌러 새로 시작 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
