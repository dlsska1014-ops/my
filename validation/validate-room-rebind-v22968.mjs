// Synthetic in-memory requests only. No live Supabase, Kakao or financial data writes.
//
// V22.9.68 — 단톡방에서 ‘새 가계부 만들기’ 뒤 방 연결을 바로 묻는다.
//
// 2026-10-19 운영 보고: 생활 가계부에 연결된 단톡방에서 여행 가계부를 새로 만들었는데, 그 뒤의 기록이 계속
// 생활 가계부에 쌓여 "새 가계부에 옛 기록이 겹쳐 보인다"고 느꼈다. 원인은 두 가지였다.
//   1) 새 가계부를 만들어도 방 연결은 그대로였고, 안내문이 가리킨 ‘단톡방 연결’은 상태 안내만 보여 줬다(연결을 바꾸는
//      길은 ‘가계부 전환’ 또는 초대코드를 직접 치는 것뿐이었다).
//   2) 그래서 사용자는 바뀐 줄 알고 기록했고, 기록은 옛 가계부로 갔다.
// 이 검사는 다음을 고정한다.
//   - 현재 연결 가계부의 소유자·관리자(또는 연결 전 방)는 만든 직후 "이 단톡방을 새 가계부로 바꿀까요?"를 받는다.
//   - 답하기 전의 기록은 어느 가계부에도 저장하지 않고 같은 질문을 다시 보여 준다.
//   - ‘연결하기’ → 연결이 바뀌고 이후 기록·오늘 기록·요약은 새 가계부만 본다. 옛 가계부의 기록은 그대로다.
//   - ‘아니요’ → 연결 유지, 기록은 옛 가계부에 간다. 안내는 "취소"가 아니라 "유지"다.
//   - 권한이 없는 구성원은 질문을 받지 않고 누가 바꿀 수 있는지 듣는다.
//   - 소유자·관리자의 맨 ‘단톡방 연결’은 안내문이 아니라 연결할 가계부 선택으로 간다. ‘단톡방 정보’와 권한 없는 사람은 예전 안내.
//   - 1:1 대화의 만들기 흐름은 바뀌지 않는다.
import assert from "node:assert/strict";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const BASE = "https://malhaebook.com";
// V22.9.65+ renders group replies with buttons as textCard/basicCard; collect every text leaf of every output.
function textLeaves(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (Array.isArray(value)) value.forEach((item) => textLeaves(item, out));
  else if (value && typeof value === "object") for (const [key, item] of Object.entries(value)) { if (key !== "buttons" && key !== "quickReplies") textLeaves(item, out); }
  return out;
}
const textOf = (body) => textLeaves(body.template?.outputs || []).join("\n");
const buttonsOf = (body) => [
  ...(body.template?.outputs || []).flatMap((o) => Object.values(o).flatMap((card) => Array.isArray(card?.buttons) ? card.buttons.map((b) => b.messageText || b.label) : [])),
  ...(body.template?.quickReplies || []).map((q) => q.messageText || q.label),
];

async function withFixture(label, test) {
  const f = await createV2265QaFixture();
  f.env.KAKAO_SKILL_SECRET = "synthetic-v63-skill-secret";
  f.label = label;
  const liveFetch = globalThis.fetch;
  const memoryFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic room-rebind QA");
    return memoryFetch(input, init);
  };
  try { await test(f); } finally { globalThis.fetch = liveFetch; f.restore(); }
}

async function say(f, utterance, { key = `owner-${f.label}`, group = `room-${f.label}` } = {}) {
  const jobs = [];
  const headers = { "content-type": "application/json", "x-kakao-skill-secret": f.env.KAKAO_SKILL_SECRET, "user-agent": `room-rebind-${f.label}` };
  const payload = { userRequest: { utterance, user: { id: key, type: "botUserKey", properties: group ? { botGroupKey: group } : {} } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  eq(response.status, 200, `${f.label}: ${utterance} → HTTP 200`);
  const body = await response.json();
  eq(body.version, "2.0", `${f.label}: ${utterance} → Kakao v2 envelope`);
  if (group) ok(!body.template?.quickReplies, `${f.label}: group reply has no quickReplies`);
  return { body, text: textOf(body) };
}

const householdNamed = (f, name) => f.db.households.find((h) => h.name === name) || null;
const memosIn = (f, name) => f.db.transactions.filter((t) => !String(t.id).startsWith("tx-") && f.db.households.find((h) => h.id === t.household_id)?.name === name).map((t) => t.memo || t.raw_text);
const newRowCount = (f) => f.db.transactions.filter((t) => !String(t.id).startsWith("tx-")).length;
function linkedHouseholdId(f, group) {
  for (const row of f.db.accountbook_settings) {
    if (!String(row.key || "").startsWith("kakao_group_link_v2254:")) continue;
    try { const item = JSON.parse(row.value || "{}"); if (item.group_key === group) return String(item.household_id || ""); } catch (_) {}
  }
  return "";
}
function flowStates(f) {
  return f.db.accountbook_settings.filter((row) => String(row.key || "").startsWith("kakao_flow_v215:")).map((row) => { try { return JSON.parse(row.value || "{}"); } catch (_) { return {}; } }).filter((s) => s.flow);
}

const SHARED = "이 방의 공동 가계부";
const TRIP = "제주 여행";
const CREATE_PROMPT = `이 단톡방을 ‘${TRIP}’ 가계부로 바꿀까요?`;

async function provisionRoom(f) {
  const first = await say(f, "점심 12000원 국민카드");
  ok(first.text.includes("공동 가계부를 준비했어요"), `${f.label}: first record provisions the room's shared book`);
  ok(householdNamed(f, SHARED), `${f.label}: shared household exists`);
  eq(linkedHouseholdId(f, `room-${f.label}`), householdNamed(f, SHARED).id, `${f.label}: room linked to the shared book`);
}

async function createTrip(f, options = {}) {
  await say(f, "새 가계부 만들기", options);
  await say(f, "여행", options);
  await say(f, TRIP, options);
  const done = await say(f, "응", options);
  ok(done.text.includes(`‘${TRIP}’ 가계부를 만들었어요`), `${f.label}: trip book created`);
  ok(householdNamed(f, TRIP), `${f.label}: trip household row exists`);
  return done;
}

// V1: 소유자 — 질문 → 답하기 전 기록은 저장 안 함 → 연결하기 → 이후 기록·목록·요약은 새 가계부만.
await withFixture("v1", async (f) => {
  await provisionRoom(f);
  await say(f, "커피 4500원");
  eq(memosIn(f, SHARED).length, 2, "v1: two rows in the shared book before creating");
  const created = await createTrip(f);
  ok(created.text.includes(`이 단톡방의 기록은 아직 ‘${SHARED}’ 가계부에 저장돼요.`), "v1: creation reply states where room records currently go");
  ok(created.text.includes(CREATE_PROMPT), "v1: creation reply asks to switch the room");
  ok(created.text.includes(`연결하면 이 방에서 거래를 보내는 참여자는 승인 없이 ‘${TRIP}’ 구성원이 돼요.`), "v1: creation reply repeats the auto-join consequence");
  ok(buttonsOf(created.body).includes("연결하기") && buttonsOf(created.body).includes("아니요"), "v1: group reply offers the two answers as buttons");
  ok(!created.text.includes("자동 연결되지는 않아요") && !created.text.includes("‘단톡방 연결’을 진행"), "v1: old dead-end guidance is gone");
  const pending = flowStates(f).find((s) => s.flow === "household_choice" && s.step === "confirm_bind");
  ok(pending, "v1: confirm_bind flow state saved");
  eq(pending?.data?.origin, "create", "v1: flow state marks the create origin");
  eq(pending?.data?.target_household_id, householdNamed(f, TRIP).id, "v1: flow state targets the new book");
  eq(pending?.data?.current_household_id, householdNamed(f, SHARED).id, "v1: flow state remembers the current link");
  eq(linkedHouseholdId(f, "room-v1"), householdNamed(f, SHARED).id, "v1: link unchanged until the owner answers");

  const before = newRowCount(f);
  const early = await say(f, "숙소 150000원");
  ok(early.text.includes(`아직 이 단톡방을 ‘${TRIP}’ 가계부로 바꿀지 답하지 않았어요.`), "v1: record before answering is refused with the same question");
  ok(early.text.includes("방금 보낸 내용은 저장하지 않았어요."), "v1: refusal says the record was not saved");
  ok(buttonsOf(early.body).includes("연결하기") && buttonsOf(early.body).includes("아니요"), "v1: refusal repeats the two answer buttons");
  eq(newRowCount(f), before, "v1: no transaction row written before the answer");
  eq(memosIn(f, TRIP).length, 0, "v1: nothing in the trip book yet");
  ok(flowStates(f).some((s) => s.step === "confirm_bind"), "v1: question still pending after the refused record");

  const bound = await say(f, "연결하기");
  ok(bound.text.includes("✅ 단톡방 연결 완료") && bound.text.includes(`가계부: ${TRIP}`), "v1: 연결하기 switches the room");
  eq(linkedHouseholdId(f, "room-v1"), householdNamed(f, TRIP).id, "v1: link row now points at the trip book");
  ok(!flowStates(f).some((s) => s.step === "confirm_bind"), "v1: question cleared after the answer");

  const saved = await say(f, "숙소 150000원");
  ok(saved.text.includes("저장했어요") && saved.text.includes(`가계부: ${TRIP}`), "v1: next record goes to the trip book");
  await say(f, "저녁 30000원");
  assert.deepEqual(memosIn(f, TRIP), ["숙소", "저녁"], "v1: trip book holds only the records after the switch"); checks += 1;
  assert.deepEqual(memosIn(f, SHARED), ["점심", "커피"], "v1: shared book rows untouched"); checks += 1;

  const list = await say(f, "오늘 기록 보기");
  ok(list.text.includes(`가계부: ${TRIP}`) && list.text.includes("숙소") && list.text.includes("저녁"), "v1: daily list shows the trip rows");
  ok(!list.text.includes("점심") && !list.text.includes("커피"), "v1: daily list does not mix in the old book's rows");
  const summary = await say(f, "이번 달 요약");
  ok(summary.text.includes(`가계부: ${TRIP}`) && summary.text.includes("지출: 180,000원 · 2건"), "v1: monthly summary counts only the trip book");
});

// V2: 소유자 — ‘아니요’는 유지. 안내는 취소가 아니라 유지이고 기록은 옛 가계부로 간다.
await withFixture("v2", async (f) => {
  await provisionRoom(f);
  await createTrip(f);
  const kept = await say(f, "아니요");
  ok(kept.text.includes(`‘${TRIP}’ 가계부는 만들어졌고, 이 단톡방의 기록은 계속 ‘${SHARED}’ 가계부에 저장돼요.`), "v2: 아니요 keeps the current link and says so");
  ok(kept.text.includes("‘가계부전환’을 입력해 주세요"), "v2: 아니요 tells how to switch later");
  ok(!kept.text.includes("취소했어요"), "v2: keeping is not worded as a cancel");
  eq(linkedHouseholdId(f, "room-v2"), householdNamed(f, SHARED).id, "v2: link unchanged");
  ok(!flowStates(f).some((s) => s.step === "confirm_bind"), "v2: question cleared");
  const saved = await say(f, "숙소 150000원");
  ok(saved.text.includes(`가계부: ${SHARED}`), "v2: record after 아니요 goes to the shared book");
  assert.deepEqual(memosIn(f, TRIP), [], "v2: trip book stays empty"); checks += 1;
});

// V3: 권한 없는 구성원 — 질문 없이 누가 바꿀 수 있는지 듣고, 기록은 옛 가계부에 간다.
await withFixture("v3", async (f) => {
  await provisionRoom(f);
  const member = { key: "member-v3" };
  const joined = await say(f, "커피 4500원", member);
  ok(joined.text.includes("참여했어요"), "v3: second user auto-joins the room's book");
  const created = await createTrip(f, member);
  ok(!created.text.includes(CREATE_PROMPT), "v3: member is not asked to switch the room");
  ok(created.text.includes(`새 가계부로 바꾸려면 ‘${SHARED}’의 소유자·관리자가 ‘가계부전환’을 입력해야 해요.`), "v3: member is told who can switch");
  ok(!flowStates(f).some((s) => s.step === "confirm_bind"), "v3: no pending question for the member");
  const saved = await say(f, "숙소 150000원", member);
  ok(saved.text.includes(`가계부: ${SHARED}`), "v3: member's record still goes to the shared book");
  eq(linkedHouseholdId(f, "room-v3"), householdNamed(f, SHARED).id, "v3: link unchanged");
});

// V4: 맨 ‘단톡방 연결’ — 소유자는 현재 연결과 선택 목록을 받고, 고르면 확인 뒤 바뀐다. ‘단톡방 정보’는 상태 안내.
await withFixture("v4", async (f) => {
  await provisionRoom(f);
  await createTrip(f);
  await say(f, "아니요");
  const menu = await say(f, "단톡방 연결");
  ok(menu.text.startsWith(`현재 연결: ${SHARED}`), "v4: bare 단톡방 연결 shows the current link first");
  ok(menu.text.includes("이 단톡방에 연결할 가계부를 선택해 주세요."), "v4: bare 단톡방 연결 starts the bind choice");
  ok(menu.text.includes(TRIP) && menu.text.includes(SHARED), "v4: both manageable books are listed");
  ok(!menu.text.includes("단톡방 연결 초대코드"), "v4: owner no longer gets the invite-code-only instructions");
  const confirm = await say(f, TRIP);
  ok(confirm.text.includes("단톡방 연결을 변경할까요?") && confirm.text.includes(`변경: ${TRIP}`), "v4: choosing a book asks for confirmation");
  const bound = await say(f, "응");
  ok(bound.text.includes("✅ 단톡방 연결 완료"), "v4: confirmation switches the room");
  eq(linkedHouseholdId(f, "room-v4"), householdNamed(f, TRIP).id, "v4: link row updated");
  const saved = await say(f, "저녁 30000원");
  ok(saved.text.includes(`가계부: ${TRIP}`), "v4: record after the switch goes to the trip book");
  const info = await say(f, "단톡방 정보");
  ok(info.text.includes("👥 단톡방 연결 상태") && info.text.includes(`연결 가계부: ${TRIP}`), "v4: 단톡방 정보 still shows the status text");
  ok(!info.text.includes("연결할 가계부를 선택"), "v4: 단톡방 정보 does not start the bind choice");
});

// V5: 1:1 대화 — 만들면 바로 선택되고 다음 기록은 새 가계부로. 질문은 없다.
await withFixture("v5", async (f) => {
  const direct = { group: "" };
  const first = await say(f, "점심 12000원 국민카드", direct);
  ok(first.text.includes("저장했어요"), "v5: first direct record saved");
  const created = await createTrip(f, direct);
  ok(created.text.includes("단톡방에서는 소유자 또는 관리자가 한 번 연결해 주세요."), "v5: direct creation keeps its guidance");
  ok(!created.text.includes(CREATE_PROMPT), "v5: direct creation never asks about a room");
  const saved = await say(f, "숙소 150000원", direct);
  ok(saved.text.includes(`가계부: ${TRIP}`), "v5: direct record after creation goes to the new book");
  eq(memosIn(f, TRIP).length, 1, "v5: one row in the trip book");
});

// V6: 관리할 가계부가 없는 구성원의 맨 ‘단톡방 연결’ — 예전처럼 상태 안내, 빠른 답장은 제자리걸음이 아니다.
await withFixture("v6", async (f) => {
  await provisionRoom(f);
  const member = { key: "member-v6" };
  await say(f, "커피 4500원", member);
  const info = await say(f, "단톡방 연결", member);
  ok(info.text.includes("👥 단톡방 연결 상태") && info.text.includes(`연결 가계부: ${SHARED}`), "v6: member gets the status text");
  ok(!info.text.includes("연결할 가계부를 선택"), "v6: member cannot start the bind choice");
  ok(buttonsOf(info.body).includes("가계부만들기"), "v6: follow-up buttons offer creating a book instead of repeating the same command");
  ok(!buttonsOf(info.body).includes("단톡방 연결"), "v6: no self-referencing 단톡방 연결 button");
});

// V7: 연결 전 방 — 새 가계부를 만들면 연결할지 묻고, ‘연결하기’로 바로 연결된다.
await withFixture("v7", async (f) => {
  const created = await createTrip(f);
  ok(created.text.includes("이 단톡방은 아직 어떤 가계부에도 연결되지 않았어요."), "v7: unlinked room is described as unlinked");
  ok(created.text.includes(`이 단톡방을 ‘${TRIP}’ 가계부로 연결할까요?`), "v7: unlinked room asks to link the new book");
  const bound = await say(f, "연결하기");
  ok(bound.text.includes("✅ 단톡방 연결 완료"), "v7: 연결하기 links the room");
  eq(linkedHouseholdId(f, "room-v7"), householdNamed(f, TRIP).id, "v7: link row points at the new book");
  const saved = await say(f, "숙소 150000원");
  ok(saved.text.includes(`가계부: ${TRIP}`), "v7: record after linking goes to the new book");
  eq(f.db.households.filter((h) => h.name === SHARED).length, 0, "v7: no shared book was auto-provisioned on the side");
});

console.log(`V22.9.68 단톡방 새 가계부 연결 질문 검사 통과 (${checks} checks)`);
