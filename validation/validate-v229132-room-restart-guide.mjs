// 삭제·해제된 방의 안내: 가계부가 삭제됐거나 연결이 해제된 단톡방에서 기록이 거절될 때, 왜 저장하지 않았는지와 그 방에서 다시 시작하는 길을 알린다.
//  사용자(2026-11-20, 운영): 가계부를 지운 방에 봇을 다시 초대해 ‘커피2천원’ 을 보냈더니 "이 단톡방의 이전 연결이 해제되거나 가계부가 삭제되어 자동으로
//  다시 준비하지 않았어요. … 소유자 또는 관리자가 사용할 가계부를 직접 연결해 주세요." 만 왔다 — "이런 버그는 왜 나오는걸까".
//  G-1 규칙은 그대로다: 그런 방에서는 기록을 보내도 가계부를 자동으로 다시 만들지 않는다(기록·가계부·구성원 줄이 하나도 생기지 않는다).
//      봇을 내보냈다 다시 초대해도 카카오가 주는 방 값은 같고, 다시 초대됐다는 것을 서버는 알 수 없다.
//  G-1 바뀐 것은 안내다: 기록이 거절되는 답에 까닭 + 두 길(‘가계부만들기’ → ‘연결하기’, ‘단톡방연결’) + 그 단추 둘. 조회 답·도움말의 상태 한 줄에도
//      새로 시작하는 길을 적는다. "직접 연결해 주세요" 처럼 방법이 없는 문장은 어디에도 없다.
//  G-1 안내대로 하면 된다: 단추를 차례로 누르면 새 가계부가 그 방에 연결되고, 그 뒤의 기록이 저장되며, 다른 참여자는 예전처럼 자동으로 들어온다.
//      쓰던 가계부를 붙이는 길(‘단톡방연결’)도 끝까지 된다.
//  그대로인 것: 한 번도 연결된 적 없는 방(첫 호출로 만들어진다)·만드는 중인 방·연결된 방·1:1 채팅의 답, joinOnly 결과 객체의 모양.
// 다음 판(사용자 2026-11-20 "한 번 눌러 새로 시작")에서 새로 시작하는 길이 단추 하나(‘이 방에서 새로 시작’)로 줄었다 — 안내 줄과 단추의 기대값을 그에 맞췄다.
//  이름을 정해 만드는 예전 길(‘가계부만들기’ → 이름 → ‘연결하기’)은 말로 보내면 그대로 되는지 여기서 계속 본다. 단추 하나로 시작하는 길은 그 판의 검사가 본다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-20 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 안내가 없는 판)에서는 G-1 의 단언 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, putSetting, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("삭제·해제된 방의 안내: 다시 만들지 않는 까닭과 다시 시작하는 두 길·단추(안내대로 하면 된다) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 320)}`); } };
const read = (path) => { try { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); } catch (_) { return ""; } };
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");
const hex66 = (label) => createHash("sha256").update(`v229132-guide-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229132-room-restart-guide-secret";
const DAY = "2026-11-20";
const U1 = hex66("user-1"), U2 = hex66("user-2"), U3 = hex66("user-3");
const DEAD_END = "직접 연결해 주세요";
const OLD_REFUSAL = "자동으로 다시 준비하지 않았어요";
const RESTART = "이 방에서 새로 시작";
const NEW_START = "이 방에서 새로 시작하려면 ‘이 방에서 새로 시작’ 을 눌러 주세요(이 말을 보내도 돼요). 누른 분이 새 가계부의 소유자가 돼요.";
const BUTTONS = `${RESTART} · 단톡방연결`;
// 이 판 또는 뒤 판: 단톡방 답의 ‘…’ 을 보내 주세요 꼴에는 따옴표 안에 봇 부르기가 적힌다(이 안내는 단톡방에서만 나온다).
const REATTACH = "쓰던 가계부를 다시 붙이려면 그 가계부의 주인·관리자가 ‘@말해가계부 단톡방연결’ 을 보내 주세요.";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

// 단톡방(room 이 있으면)·1:1 채팅의 한마디. 답의 글(말풍선·카드의 글을 이어서)과 단추 이름(카드 단추 + 바로가기)을 돌려준다.
async function say(fx, utterance, { user = U1, room = "" } = {}) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const data = await response.json().catch(() => ({}));
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const outputs = data?.template?.outputs || [];
  const text = outputs.map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || [o.basicCard?.title, o.basicCard?.description].filter(Boolean).join("\n") || "").filter(Boolean).join("\n");
  const replies = (data?.template?.quickReplies || []).map((item) => ({ label: item.label, messageText: item.messageText, action: item.action }));
  const cards = outputs.flatMap((o) => (o.textCard?.buttons || o.basicCard?.buttons || []).map((button) => ({ label: button.label, messageText: button.messageText, action: button.action })));
  // 단톡방의 답은 바로가기 대신 카드 단추로 나간다. 사람이 누를 수 있는 단추 = 카드 단추(있으면) 또는 바로가기.
  const items = cards.length ? cards : replies;
  return { status: response.status, text, replies, labels: replies.map((item) => item.label), cardButtons: cards.map((item) => item.label), items, buttons: items.map((item) => item.label) };
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
// 그 방에 연결된 가계부 번호(방 연결 줄의 값에서 읽는다).
const linkedHouseholdOf = (fx, room) => {
  for (const row of fx.db.accountbook_settings) {
    if (!String(row.key).startsWith("kakao_group_link")) continue;
    let value = row.value;
    try { value = typeof value === "string" ? JSON.parse(value) : value; } catch (_) { continue; }
    if (value?.group_key === room && value.household_id) return String(value.household_id);
    if (value && typeof value === "object" && value[room]?.household_id) return String(value[room].household_id);
  }
  return "";
};
// 방 가계부를 삭제한 뒤의 모습: 가계부·구성원·기록 줄과 방 연결 줄이 지워지고 ‘준비 끝’ 줄은 남는다(운영의 삭제는 여기에 ‘해제’ 줄도 더한다 — 아래 retire).
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
const retire = (fx, room) => putSetting(fx, `kakao_group_first_retired_v22931:${sha(room)}`, JSON.stringify({ version: 1, group_hash: sha(room) }));

const expectRefusal = (reply, label) => {
  check(() => ok(reply.text.includes("이 단톡방에서 쓰던 가계부가 삭제됐거나 연결이 해제돼 있어요.") && reply.text.includes("가계부를 자동으로 다시 만들지 않아서, 방금 기록은 어디에도 저장하지 않았어요."), `G-1 ${label}: 까닭과 ‘저장하지 않았다’ 를 말한다(${reply.text.slice(0, 90)})`), `${label} reason`);
  check(() => ok(reply.text.includes(NEW_START) && reply.text.includes(REATTACH), `G-1 ${label}: 다시 시작하는 두 길을 적는다`), `${label} two ways`);
  check(() => eq(reply.buttons.join(" · "), BUTTONS, `G-1 ${label}: 단추 둘(이 방에서 새로 시작·단톡방연결)`), `${label} buttons`);
  check(() => ok(reply.items.length === 2 && reply.items.every((item) => item.action === "message" && item.messageText === item.label), `G-1 ${label}: 단추는 그 이름을 그대로 보낸다(단톡방에서는 단추 이름이 말로 나간다)`), `${label} button payload`);
  check(() => ok(!reply.text.includes(DEAD_END) && !reply.text.includes(OLD_REFUSAL), `G-1 ${label}: 방법이 없는 예전 문장이 없다`), `${label} no dead end`);
  check(() => ok(reply.text.split("\n").length === 3 && reply.text.length <= 320, `G-1 ${label}: 세 줄·320자 안(${reply.text.split("\n").length}줄 ${reply.text.length}자)`), `${label} length`);
};

// ── G-1. 삭제된 방(운영에서 본 장면): 방 가계부를 지운 뒤 같은 방의 첫 기록 ─────────────────────────
await scene("삭제된 방의 기록", async (fx) => {
  const room = hex66("room-deleted");
  const first = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  check(() => ok(/공동 가계부를 준비했어요/.test(first.text) && /지출 저장했어요/.test(first.text), `픽스처: 새 방의 첫 기록은 가계부를 준비하고 저장한다(${first.text.slice(0, 60)})`), "fixture first record");
  purgeRoomHousehold(fx, room);
  const before = core(fx);
  const users = fx.db.users.length;
  const reply = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  expectRefusal(reply, "삭제된 방(준비 끝 줄만 남음), 지운 사람의 기록");
  check(() => eq(core(fx), before, "G-1 삭제된 방: 기록·가계부·구성원 줄이 하나도 생기지 않는다(규칙은 그대로)"), "deleted room writes nothing");
  // 다른 참여자가 보내도, 여러 번 보내도 같다. 처음 보는 참여자의 사용자 줄만 생긴다(예전 그대로).
  const other = await say(fx, "@말해가계부 라떼 4500원", { user: U2, room });
  expectRefusal(other, "삭제된 방, 다른 참여자의 기록");
  const again = await say(fx, "@말해가계부 점심 9000원", { user: U1, room });
  check(() => eq(again.text, reply.text, "G-1 삭제된 방: 다시 보내도 같은 안내"), "deleted room repeat");
  check(() => eq(core(fx), before, "G-1 삭제된 방: 그 뒤에도 생긴 줄이 없다"), "deleted room still nothing");
  check(() => ok(fx.db.users.length <= users + 1, "G-1 삭제된 방: 사용자 줄은 처음 보는 참여자 한 명만"), "deleted room users");
  // 운영의 삭제처럼 ‘해제’ 줄까지 있는 방도 같다.
  retire(fx, room);
  resetIsolateState();
  const retiredReply = await say(fx, "@말해가계부 택시 7000원", { user: U1, room });
  check(() => eq(retiredReply.text, reply.text, "G-1 ‘해제’ 줄이 있는 방도 같은 안내"), "retired row same");
  check(() => eq(retiredReply.buttons.join(" · "), BUTTONS, "G-1 ‘해제’ 줄이 있는 방도 같은 단추"), "retired row buttons");
});

// ── G-1. 해제 줄만 있는 방(연결을 끊은 방), 가계부가 사라진 방 ───────────────────────────────────
await scene("해제 줄만 있는 방", async (fx) => {
  const room = hex66("room-retired-only");
  retire(fx, room);
  const before = core(fx);
  const reply = await say(fx, "@말해가계부 커피 2천원", { user: U1, room });
  expectRefusal(reply, "연결을 끊은 방의 기록");
  check(() => eq(core(fx), before, "G-1 연결을 끊은 방: 생긴 줄이 없다"), "retired-only writes nothing");
  // 여러 줄 기록·수입 기록도 같은 안내다.
  for (const text of ["@말해가계부 월급 250만원 수입", "@말해가계부 커피 2000원\n빵 3000원"]) {
    const each = await say(fx, text, { user: U1, room });
    check(() => ok(each.text === reply.text && each.buttons.join(" · ") === BUTTONS, `G-1 연결을 끊은 방: ‘${text.split("\n")[0].slice(7)}’ 도 같은 안내`), `retired-only ${text.slice(7, 14)}`);
  }
});
await scene("연결은 남았는데 가계부가 사라진 방", async (fx) => {
  const room = hex66("room-missing");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  purgeRoomHousehold(fx, room, { keepLink: true });
  const before = core(fx);
  const reply = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  check(() => ok(reply.text.startsWith("이 단톡방에 연결돼 있던 가계부를 찾을 수 없어(삭제된 가계부) 방금 기록은 어디에도 저장하지 않았어요.") || reply.text.includes("가계부를 자동으로 다시 만들지 않아서, 방금 기록은 어디에도 저장하지 않았어요."), `G-1 가계부가 사라진 방: 저장하지 않았다고 말한다(${reply.text.slice(0, 80)})`), "missing reason");
  check(() => ok(reply.text.includes(NEW_START) && reply.text.includes(REATTACH) && reply.buttons.join(" · ") === BUTTONS, "G-1 가계부가 사라진 방: 두 길과 단추 둘"), "missing two ways");
  check(() => ok(!reply.text.includes(DEAD_END), "G-1 가계부가 사라진 방: 방법이 없는 문장이 없다"), "missing no dead end");
  check(() => eq(core(fx), before, "G-1 가계부가 사라진 방: 생긴 줄이 없다"), "missing writes nothing");
  // 연결 줄이 남아 있는 동안은 다음 기록에도 같은 답이다(그 방은 이제 ‘다시 만들지 않는 방’ 으로 적혀 있다).
  const next = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  check(() => ok(next.text === reply.text && next.buttons.join(" · ") === BUTTONS, "G-1 가계부가 사라진 방: 다음 기록에도 같은 안내와 단추"), "missing repeat");
  check(() => ok(fx.db.accountbook_settings.some((row) => row.key === `kakao_group_first_retired_v22931:${sha(room)}`), "G-1 가계부가 사라진 방은 ‘다시 만들지 않는 방’ 으로 적힌다(예전 그대로)"), "missing marks retired");
  check(() => eq(core(fx), before, "G-1 가계부가 사라진 방: 그 뒤에도 생긴 줄이 없다"), "missing still nothing");
});

// ── G-1. 안내대로 하면 된다 ──────────────────────────────────────────────────
await scene("새로 시작하는 길", async (fx) => {
  const room = hex66("room-restart");
  await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  const oldId = purgeRoomHousehold(fx, room);
  retire(fx, room);
  const refused = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  // 단추를 누르면 그 이름이 말로 나간다(단톡방은 봇을 부르는 말로 온다).
  const press = (label, user = U1) => say(fx, `@말해가계부 ${label}`, { user, room });
  // 이름을 정해 만드는 길: ‘가계부만들기’ 를 말로 보낸다(단추에서는 빠졌다 — 단추는 ‘이 방에서 새로 시작’ 이다).
  check(() => ok(refused.buttons[0] === RESTART && !refused.buttons.includes("가계부만들기"), `G-1 거절 답의 첫 단추는 ‘이 방에서 새로 시작’ 이다(${refused.buttons.join("·")})`), "restart button first");
  const start = await press("가계부만들기");
  check(() => ok(/어떤 용도로 쓸 가계부인가요/.test(start.text) && start.buttons.includes("모임 회비"), `G-1 ‘가계부만들기’: 가계부 만들기가 시작된다(${start.text.slice(0, 40)})`), "restart begins");
  const kind = await press("모임 회비");
  check(() => ok(/가계부 이름을 정해 주세요/.test(kind.text), "G-1 용도를 고르면 이름을 묻는다"), "restart kind");
  // 이름은 답이 내준 추천 단추를 누른다(사람이 가장 쉽게 가는 길).
  check(() => ok(kind.buttons[0] === "우리 모임 회비", `G-1 이름 걸음은 추천 이름 단추를 내준다(${kind.buttons.join("·")})`), "restart suggestion");
  const named = await press(kind.buttons[0]);
  check(() => ok(/이 이름으로 만들까요/.test(named.text) && named.buttons.includes("이 이름으로 만들기"), "G-1 이름을 보내면 확인을 묻는다"), "restart name");
  const created = await press("이 이름으로 만들기");
  check(() => ok(created.text.includes("‘우리 모임 회비’ 가계부를 만들었어요.") && created.text.includes("이 단톡방을 ‘우리 모임 회비’ 가계부로 연결할까요?") && created.buttons.includes("연결하기"), `G-1 만든 뒤 이 방에 연결할지 묻는다 — 안내의 ‘연결하기’ 가 여기서 나온다(${created.buttons.join("·")})`), "restart offers link");
  const linked = await press("연결하기");
  check(() => ok(linked.text.includes("단톡방 연결 완료") && linked.text.includes("가계부: 우리 모임 회비"), `G-1 [연결하기]: 이 방이 새 가계부에 연결된다(${linked.text.slice(0, 40)})`), "restart linked");
  const newId = linkedHouseholdOf(fx, room);
  check(() => ok(newId && newId !== oldId && fx.db.households.some((row) => row.id === newId && row.name === "우리 모임 회비"), "G-1 연결된 것은 새로 만든 가계부다(지운 가계부의 번호를 다시 쓰지 않는다)"), "restart new household");
  const owner = userByKey(fx, U1);
  check(() => ok(fx.db.household_members.some((row) => row.household_id === newId && row.user_id === owner?.id && row.role === "owner"), "G-1 만든 사람이 소유자다"), "restart owner");
  const saved = await say(fx, "@말해가계부 커피2천원", { user: U1, room });
  check(() => ok(/지출 저장했어요/.test(saved.text) && saved.text.includes("가계부: 우리 모임 회비") && fx.db.transactions.some((row) => row.household_id === newId && Number(row.amount) === 2000), `G-1 그 뒤의 기록은 새 가계부에 저장된다(${saved.text.slice(0, 40)})`), "restart saves");
  const joined = await say(fx, "@말해가계부 라떼 4500원", { user: U2, room });
  const member = userByKey(fx, U2);
  check(() => ok(/지출 저장했어요/.test(joined.text) && fx.db.household_members.some((row) => row.household_id === newId && row.user_id === member?.id), "G-1 다른 참여자는 예전처럼 기록 한 번으로 들어온다"), "restart others join");
  check(() => ok(!saved.text.includes("자동으로 다시 만들지") && !joined.text.includes("자동으로 다시 만들지"), "G-1 연결된 뒤에는 그 안내가 나오지 않는다"), "restart no more notice");
});
await scene("쓰던 가계부를 붙이는 길", async (fx) => {
  const room = hex66("room-reattach");
  // U3 이 1:1 채팅에서 쓰던 자기 가계부가 있다(첫 기록으로 만들어진다).
  await say(fx, "점심 9000원", { user: U3 });
  const owner = userByKey(fx, U3);
  const own = fx.db.household_members.find((row) => row.user_id === owner?.id && row.role === "owner")?.household_id;
  retire(fx, room);
  const refused = await say(fx, "@말해가계부 커피2천원", { user: U3, room });
  expectRefusal(refused, "쓰던 가계부가 있는 사람의 기록");
  const flow = await say(fx, `@말해가계부 ${refused.buttons[1]}`, { user: U3, room });
  check(() => ok(flow.text.includes("이 단톡방에 연결할 가계부를 선택해 주세요.") && flow.buttons.includes("가계부 선택 1") && !flow.text.includes(DEAD_END), `G-1 [단톡방연결]: 내가 주인·관리자인 가계부를 고르게 한다(${flow.text.slice(0, 50)})`), "reattach begins");
  // 단추를 누르면 그 이름이 말로 나간다 — 고르기 단추도 그 이름 그대로 보낸다.
  const picked = await say(fx, `@말해가계부 ${flow.buttons[0]}`, { user: U3, room });
  check(() => ok(picked.text.includes("단톡방 연결을 변경할까요?") && picked.buttons.includes("연결하기"), `G-1 [가계부 선택 1]: 연결할지 묻는다(${picked.text.slice(0, 40)})`), "reattach picked");
  const step = await say(fx, "@말해가계부 연결하기", { user: U3, room });
  check(() => ok(/단톡방 연결 완료/.test(step.text) && linkedHouseholdOf(fx, room) === String(own), `G-1 [단톡방연결] → 고르기 → [연결하기]: 쓰던 가계부가 이 방에 붙는다(${step.text.slice(0, 40)})`), "reattach linked");
  const saved = await say(fx, "@말해가계부 커피2천원", { user: U3, room });
  check(() => ok(/지출 저장했어요/.test(saved.text) && fx.db.transactions.some((row) => row.household_id === own && Number(row.amount) === 2000), "G-1 그 뒤의 기록은 그 가계부에 저장된다"), "reattach saves");
});

// ── G-1. 기록이 아닌 말의 답에도 새로 시작하는 길 ─────────────────────────────────────────────
await scene("삭제·해제된 방의 조회·도움말", async (fx) => {
  const room = hex66("room-asks");
  retire(fx, room);
  const asks = {};
  for (const command of ["오늘 기록 보기", "시작", "단톡방 정보", "도움말", "이번달요약"]) asks[command] = await say(fx, `@말해가계부 ${command}`, { user: U1, room });
  for (const [command, reply] of Object.entries(asks)) {
    check(() => ok(reply.text.includes("자동으로 다시 만들지 않아요"), `G-1 ‘${command}’: 자동으로 다시 만들지 않는다고 말한다(예전 그대로 — ${reply.text.slice(0, 50)})`), `asks ${command} rule`);
    // V22.9.134: 도움말(‘시작’·‘도움말’)의 상태 한 줄은 ‘새로 시작하려면 ‘…’’ 꼴이라 단톡방에서는 따옴표 안에 봇 부르기가 붙는다. 단추를 누르라는 줄은 그대로다.
    const restartQuote = ["시작", "도움말"].includes(command) ? `‘@말해가계부 ${RESTART}’` : `‘${RESTART}’`;
    check(() => ok(reply.text.includes(restartQuote), `G-1 ‘${command}’: 새로 시작하는 길(${restartQuote})을 적는다`), `asks ${command} restart`);
    check(() => ok(reply.text.includes("‘@말해가계부 단톡방연결 초대코드’") || reply.text.includes("‘@말해가계부 단톡방연결’") || reply.text.includes("단톡방 연결 초대코드"), `G-1 ‘${command}’: 쓰던 가계부를 붙이는 길도 적는다(단톡방이라 따옴표 안에 봇 부르기)`), `asks ${command} reattach`);
    check(() => ok(!reply.text.includes(DEAD_END) && !reply.text.includes("어디에도 저장하지 않았어요"), `G-1 ‘${command}’: 기록이 아닌 말에는 ‘저장하지 않았다’ 고 하지 않는다`), `asks ${command} not a write`);
  }
  check(() => ok(asks["오늘 기록 보기"].text.includes(NEW_START) && asks["오늘 기록 보기"].buttons[0] === RESTART && asks["오늘 기록 보기"].buttons.includes("단톡방연결"), "G-1 조회 답: 새로 시작하는 줄과 그 단추들"), "asks buttons");
  check(() => ok(asks["단톡방 정보"].text.includes(NEW_START) && asks["단톡방 정보"].text.includes("단톡방 연결 초대코드") && asks["단톡방 정보"].buttons.includes("가계부만들기"), "G-1 ‘단톡방 정보’: 새로 시작하는 줄 + 초대코드로 붙이는 법 + [가계부만들기]"), "info card");
  check(() => ok(asks["오늘 기록 보기"].text.split("\n").length === 4, `G-1 조회 답은 네 줄(연결 없음·상태·새로 시작·쓰던 가계부 — ${asks["오늘 기록 보기"].text.split("\n").length}줄)`), "asks four lines");
  check(() => ok(asks["도움말"].cardButtons.length >= 3 && asks["도움말"].text.length <= 400, `G-1 도움말 첫 화면: 카드 글이 400자 안(${asks["도움말"].text.length}자)`), "help card length");
});

// ── 그대로인 것 ─────────────────────────────────────────────────────────────
await scene("한 번도 연결된 적 없는 방·만드는 중인 방", async (fx) => {
  const fresh = hex66("room-fresh");
  const first = await say(fx, "@말해가계부 커피2천원", { user: U1, room: fresh });
  check(() => ok(/공동 가계부를 준비했어요/.test(first.text) && /지출 저장했어요/.test(first.text) && !first.text.includes("가계부만들기") && !first.buttons.includes("단톡방연결"), "그대로: 새 방의 첫 기록은 가계부를 준비하고 저장한다(안내·단추 없음)"), "fresh unchanged");
  const asked = await say(fx, "@말해가계부 오늘 기록 보기", { user: U2, room: hex66("room-fresh-ask") });
  check(() => ok(asked.text.startsWith("이 방의 공동 가계부를 준비했어요.") && !asked.text.includes("새로 시작하려면"), "그대로: 새 방은 조회만 불러도 만들어진다(새로 시작 안내 없음)"), "fresh ask unchanged");
  const preparing = hex66("room-preparing");
  putSetting(fx, `kakao_group_first_v22931:${sha(preparing)}`, JSON.stringify({ version: 1, group_key: preparing, owner_id: "u-nobody", candidate_id: "11111111-1111-4111-8111-111111111111", phase: "create_sent", created_at: new Date().toISOString() }));
  for (const command of ["오늘 기록 보기", "시작", "도움말"]) {
    const reply = await say(fx, `@말해가계부 ${command}`, { user: U1, room: preparing });
    check(() => ok(reply.text.includes("만드는 중") && !reply.text.includes("새로 시작하려면") && !reply.text.includes("삭제됐거나"), `그대로: 만드는 중인 방의 ‘${command}’ 답(${reply.text.slice(0, 50)})`), `preparing ${command}`);
  }
  const direct = await say(fx, "커피 2천원", { user: U3 });
  check(() => ok(/지출 저장했어요/.test(direct.text) && !direct.text.includes("단톡방연결"), "그대로: 1:1 채팅의 기록"), "direct unchanged");
});
await scene("joinOnly 결과 객체", async (fx) => {
  const { tryKakaoGroupFirstRecord } = await import("../src/modules/kakao/group-links-first-record.js");
  const room = hex66("room-joinonly");
  retire(fx, room);
  await say(fx, "안녕", { user: U1 });
  const user = userByKey(fx, U1);
  const env = { ...fx.env, __AB_REQUEST_USER_ROWS: new Map(), __AB_IDENTITY_CONFIRMED: new Map(), __AB_MEMBER_POLICY: new Map() };
  let result = null, threw = "";
  try { result = await tryKakaoGroupFirstRecord(env, { user, groupKey: room, parsedList: [], joinOnly: true }); } catch (error) { threw = String(error?.message || error); }
  check(() => ok(!threw && result && result.ok === false && result.skipped === true && result.reason === "retired", `그대로: 부르기만 한 요청의 결과는 retired(${threw || JSON.stringify(result).slice(0, 80)})`), "joinOnly reason");
  check(() => eq(Object.keys(result || {}).sort().join(","), "firstNotice,household,joinedNow,ok,reason,role,roomCreatedNow,skipped,text", "그대로: 결과 객체의 칸(단추 칸이 더해지지 않는다)"), "joinOnly shape");
  check(() => ok(String(result?.text || "").includes(NEW_START), "결과 객체의 글도 같은 안내다"), "joinOnly text");
});

// ── 원본 ────────────────────────────────────────────────────────────────────
{
  const first = read("src/modules/kakao/group-links-first-record.js");
  const commands = read("src/modules/kakao/household-budget-commands.js");
  const handler = read("src/modules/kakao/skill-handler.js");
  check(() => ok(first.includes('if (!snapshot.link && (snapshot.retired || snapshot.done || marker?.phase === "complete")) {'), "원본: 다시 만들지 않는 조건은 그대로다(연결 없음 + 해제·준비 끝·완료 표식)"), "rule unchanged");
  check(() => eq((first.match(/\.\.\.KAKAO_RETIRED_ROOM_RESTART_LINES_V229132\]\.join\("\\n"\), \{\}, KAKAO_RETIRED_ROOM_RESTART_REPLIES_V229132\);/g) || []).length, 2, "원본: 기록을 거절하는 두 곳(해제·삭제된 방, 가계부가 사라진 방)이 같은 안내와 같은 단추를 쓴다"), "two refusal sites");
  check(() => ok(first.includes('...(phase === "retired" ? [KAKAO_RETIRED_ROOM_RESTART_LINES_V229132[0]] : []),'), "원본: ‘단톡방 정보’ 는 삭제·해제된 방에만 새로 시작하는 줄을 더한다"), "info text adds line");
  check(() => ok(commands.includes("`이 방에서 새로 시작하려면 ‘${KAKAO_ROOM_RESTART_COMMAND_V229133}’ 을 눌러 주세요(이 말을 보내도 돼요). 누른 분이 새 가계부의 소유자가 돼요.`") && commands.includes(`"${REATTACH.replace("@말해가계부 ", "")}"`) && commands.includes('const KAKAO_RETIRED_ROOM_RESTART_REPLIES_V229132 = [[KAKAO_ROOM_RESTART_COMMAND_V229133, KAKAO_ROOM_RESTART_COMMAND_V229133], ["단톡방연결", "단톡방연결"]];') && commands.includes(`const KAKAO_ROOM_RESTART_COMMAND_V229133 = "${RESTART}";`), "원본: 안내 두 줄과 단추는 한 곳에 적혀 있다"), "single source");
  check(() => ok(commands.includes("options?.retired === true ? KAKAO_RETIRED_ROOM_RESTART_LINES_V229132[0] : \"\","), "원본: 조회 답은 삭제·해제된 방에만 새로 시작하는 줄을 더한다"), "start text adds line");
  for (const [name, text] of [["group-links-first-record.js", first], ["household-budget-commands.js", commands], ["skill-handler.js", handler]]) {
    check(() => ok(!text.includes(DEAD_END) && !text.includes(OLD_REFUSAL), `원본: ${name} 에 방법이 없는 예전 문장이 없다`), `no dead end in ${name}`);
  }
  check(() => ok(!/무료|평생|언제나/.test(NEW_START + REATTACH), "원본: 안내에 ‘무료’·앞날 약속이 없다"), "copy rules");
}

if (failures.length) {
  console.error(`삭제·해제된 방의 안내 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
