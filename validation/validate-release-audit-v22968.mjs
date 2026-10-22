// Synthetic in-memory requests only. No live Supabase, Kakao or financial data writes.
//
// V22.9.68 — 출시 전 전체 점검(2026-10-19)에서 확인한 결함의 회귀 검사.
//
// 단톡방 1  단톡방 연결 선택 중 "가계부 바꾸기" 같은 말이 1:1 선택을 바꿨다(V22.9.37 H2 위반). 방에서는 연결(bind)만 있다.
// 단톡방 2  연결 전 방 안내가 방 상태와 어긋났다(해제된 방에 "자동으로 준비해요", 기록 아닌 말에 "방금 입력한 기록은 저장 안 함").
// 단톡방 3  응답을 잃은 준비 단계(create_sent 등)에서 행이 끝내 없으면 방이 영영 "결과 미확정"이었다. 60초 뒤 같은 단계를 다시 보낸다.
// 1:1 1     "수정 01번 금액을 13000원으로"처럼 조사·동의어가 붙은 수정 말이 새 지출로 저장됐다. 수정으로 읽고 기록하지 않는다.
// 1:1 2     "밥 4500원"처럼 한 글자 내용의 첫 기록이 개인 가계부를 만들지 못했다.
// 1:1 3     여러 줄 입력에서 금액 없는 줄이 다음 줄 내용에 붙었고, "1. 점심 12000원" 번호 목록은 1원으로 읽혔다.
// 1:1 4     정산 1인 기준이 반올림이라 아무와도 맞지 않았다. 내림 + 나머지 안내.
// 1:1 7     오늘 기록 보기가 20건에서 말없이 끊겼다. "외 N건" 안내.
// 웹 1      /my/recurring/delete 가 지운 행이 없어도 성공이라고 했다.
// 웹 2      내 가계부가 아닌 household_id 로 들어온 화면이 "가계부 없음" 시작 화면을 그렸다. 찾을 수 없음(404)으로 답한다.
import assert from "node:assert/strict";
import app, * as runtime from "../src/index.js";
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
  f.env.KAKAO_SKILL_SECRET = "synthetic-v63-audit-secret";
  f.label = label;
  const liveFetch = globalThis.fetch;
  const memoryFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic release-audit QA");
    return memoryFetch(input, init);
  };
  try { await test(f); } finally { globalThis.fetch = liveFetch; f.restore(); }
}

async function say(f, utterance, { key = `owner-${f.label}`, group = `room-${f.label}` } = {}) {
  const jobs = [];
  const headers = { "content-type": "application/json", "x-kakao-skill-secret": f.env.KAKAO_SKILL_SECRET, "user-agent": `release-audit-${f.label}` };
  const payload = { userRequest: { utterance, user: { id: key, type: "botUserKey", properties: group ? { botGroupKey: group } : {} } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  eq(response.status, 200, `${f.label}: ${utterance.replace(/\n/g, "⏎")} → HTTP 200`);
  const body = await response.json();
  return { body, text: textOf(body) };
}
async function web(f, path, userId, init = {}) {
  const headers = { cookie: await f.cookieFor(userId), ...(init.body ? { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" } : {}) };
  const response = await app.fetch(new Request(BASE + path, { ...init, headers }), f.env, {});
  return { response, html: await response.text() };
}
const newRows = (f) => f.db.transactions.filter((t) => !String(t.id).startsWith("tx-"));
const nameOf = (f, householdId) => f.db.households.find((h) => h.id === householdId)?.name || householdId;
const memosIn = (f, name) => newRows(f).filter((t) => nameOf(f, t.household_id) === name).map((t) => t.memo || t.raw_text);
const userOf = (f, key) => f.db.users.find((u) => String(u.kakao_user_key || "").includes(key)) || null;
const setting = (f, key) => f.db.accountbook_settings.find((row) => row.key === key) || null;
const put = (f, key, value) => { const row = setting(f, key); const text = typeof value === "string" ? value : JSON.stringify(value); if (row) row.value = text; else f.db.accountbook_settings.push({ key, value: text }); };
function selectedHouseholdOf(f, userId) {
  const row = f.db.accountbook_settings.find((item) => String(item.key || "").startsWith("kakao_selected_household") && String(item.key).endsWith(`:${userId}`));
  return row ? String(row.value || "").replace(/^"|"$/g, "") : "";
}
function linkedHouseholdId(f, group) {
  for (const row of f.db.accountbook_settings) {
    if (!String(row.key || "").startsWith("kakao_group_link_v2254:")) continue;
    try { const item = JSON.parse(row.value || "{}"); if (item.group_key === group) return String(item.household_id || ""); } catch (_) {}
  }
  return "";
}

const SHARED = "이 방의 공동 가계부";

// ---------- 단톡방 1: a room choice never becomes a 1:1 select ----------
await withFixture("g1", async (f) => {
  const direct = { group: "" };
  await say(f, "점심 12000원 국민카드", direct);                       // personal book A, selected
  const me = userOf(f, "owner-g1");
  ok(me, "g1: user row exists");
  const personal = selectedHouseholdOf(f, me.id);
  ok(personal, "g1: 1:1 selection points at the personal book");
  await say(f, "커피 4500원");                                          // room provisions shared book B (owner)
  eq(linkedHouseholdId(f, "room-g1"), f.db.households.find((h) => h.name === SHARED)?.id, "g1: room linked to the shared book");
  const menu = await say(f, "가계부 전환");
  ok(menu.text.includes("이 단톡방에 연결할 가계부를 선택해 주세요."), "g1: room 가계부 전환 starts a bind choice");
  const flipped = await say(f, "가계부 바꾸기");
  ok(flipped.text.includes("이 단톡방에 연결할 가계부를 선택해 주세요."), "g1: a switch phrase inside the room choice re-shows the bind list");
  ok(!flipped.text.includes("사용할 가계부를 선택해 주세요."), "g1: the room choice is not turned into a 1:1 select");
  const picked = await say(f, "1");
  ok(!picked.text.includes("가계부를 선택했어요"), "g1: picking a number in the room never reports a 1:1 selection");
  ok(/단톡방 연결을 변경할까요\?|이미 .* 가계부에 연결되어 있어요/.test(picked.text), "g1: picking a number asks to change the room link (or reports already linked)");
  eq(selectedHouseholdOf(f, me.id), personal, "g1: 1:1 selection unchanged by the room flow");
  await say(f, "취소");
  const direct2 = await say(f, "버스 1500원", direct);
  ok(direct2.text.includes(`가계부: ${nameOf(f, personal)}`), "g1: the next 1:1 record still goes to the personal book");
});

// ---------- 단톡방 2: unlinked-room text follows the room state ----------
await withFixture("g2", async (f) => {
  const fresh = await say(f, "안녕");
  ok(fresh.text.includes("‘커피 4500원’처럼 기록하면 이 방 가계부가 바로 만들어져요."), "g2: a non-record in a new room promises auto-provisioning");
  ok(!/방금 (?:입력한 )?기록은 어디에도 저장하지 않았어요/.test(fresh.text), "g2: a non-record is not described as a rejected record");
  ok(!/다시 만들지 않/.test(fresh.text), "g2: a new room is not described as retired");
  const start = await say(f, "시작");
  ok(start.text.includes("바로 만들어져요"), "g2: 시작 in a new room promises auto-provisioning");
  const first = await say(f, "커피 4500원");
  ok(first.text.includes("공동 가계부를 준비했어요"), "g2: the promised record provisions the room");

  // retired room: seed the retired marker for another room and ask around
  const keys = await runtime.kakaoGroupFirstKeys("room-g2-retired");
  put(f, keys.retired, { version: 1, group_hash: keys.hash });
  const retired = { group: "room-g2-retired" };
  const retiredStart = await say(f, "시작", retired);
  ok(retiredStart.text.includes("기록을 보내도 자동으로 다시 만들지 않아요"), "g2: 시작 in a retired room says it will not auto-provision");
  ok(!retiredStart.text.includes("바로 만들어져요"), "g2: 시작 in a retired room never promises auto-provisioning");
  const retiredHelp = await say(f, "도움말", retired);
  ok(retiredHelp.text.includes("자동으로 다시 만들지 않아요"), "g2: 도움말 in a retired room matches");
  ok(!retiredHelp.text.includes("첫 기록을 보내면 바로 만들어져요"), "g2: 도움말 in a retired room does not promise provisioning");
  const before = newRows(f).length;
  const retiredRecord = await say(f, "점심 9000원", retired);
  ok(/다시 (?:준비하|만들)지 않/.test(retiredRecord.text), "g2: a record in a retired room is refused with the retired wording");
  eq(newRows(f).length, before, "g2: no row written in the retired room");
});

// ---------- 단톡방 3: a lost-response phase retries after 60 s ----------
async function seedStuck(f, group, phase, ageMs, { household = false, owner = false } = {}) {
  const keys = await runtime.kakaoGroupFirstKeys(group);
  const candidate = "aaaaaaaa-bbbb-4ccc-8ddd-" + String(Math.abs(hashCode(group))).padStart(12, "0").slice(0, 12);
  const ownerId = `stuck-owner-${group}`;
  // The app stores the raw Kakao key; a differently shaped key would make the caller a brand-new user.
  f.db.users.push({ id: ownerId, kakao_user_key: ownerId, nickname: "Stuck", created_at: new Date().toISOString() });
  put(f, keys.marker, { version: 1, group_key: group, candidate_id: candidate, owner_id: ownerId, phase, created_at: new Date(Date.now() - ageMs).toISOString() });
  if (household) f.db.households.push({ id: candidate, name: SHARED, invite_code: `ST${String(Math.abs(hashCode(group))).slice(0, 6)}`, created_at: new Date().toISOString() });
  if (owner) f.db.household_members.push({ household_id: candidate, user_id: ownerId, role: "owner", created_at: new Date().toISOString() });
  return { candidate, ownerId, keys };
}
function hashCode(text) { let h = 0; for (const ch of String(text)) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; }
await withFixture("g3", async (f) => {
  // fresh create_sent (< 60 s): still "unknown", nothing written
  const freshRoom = await seedStuck(f, "room-g3-fresh", "create_sent", 5 * 1000);
  const fresh = await say(f, "점심 9000원", { key: freshRoom.ownerId, group: "room-g3-fresh" });
  ok(fresh.text.includes("공동 가계부 준비 결과를 아직 확정하지 못했어요"), "g3: a create_sent marker younger than 60 s still waits");
  ok(!f.db.households.some((h) => h.id === freshRoom.candidate), "g3: no household POST repeated inside 60 s");

  // old create_sent, no household row: the same POST is sent again and the room completes
  const oldRoom = await seedStuck(f, "room-g3-old", "create_sent", 5 * 60 * 1000);
  const recovered = await say(f, "점심 9000원", { key: oldRoom.ownerId, group: "room-g3-old" });
  ok(recovered.text.includes("공동 가계부를 준비했어요") && recovered.text.includes("저장했어요"), "g3: an old create_sent marker is retried and the record is saved");
  ok(f.db.households.some((h) => h.id === oldRoom.candidate), "g3: the household was created with the fixed candidate id");
  ok(f.db.household_members.some((m) => m.household_id === oldRoom.candidate && m.user_id === oldRoom.ownerId && m.role === "owner"), "g3: the marker owner is the owner");
  eq(linkedHouseholdId(f, "room-g3-old"), oldRoom.candidate, "g3: the room is linked to the recovered household");
  eq(f.db.households.filter((h) => h.id === oldRoom.candidate).length, 1, "g3: exactly one household for the room");

  // old owner_sent with household but no owner row
  const ownerRoom = await seedStuck(f, "room-g3-owner", "owner_sent", 5 * 60 * 1000, { household: true });
  const ownerDone = await say(f, "커피 4500원", { key: ownerRoom.ownerId, group: "room-g3-owner" });
  ok(ownerDone.text.includes("저장했어요"), "g3: an old owner_sent marker resends the owner row and saves");
  ok(f.db.household_members.some((m) => m.household_id === ownerRoom.candidate && m.user_id === ownerRoom.ownerId && m.role === "owner"), "g3: owner row created on retry");

  // old link_sent with household + owner but no link row
  const linkRoom = await seedStuck(f, "room-g3-link", "link_sent", 5 * 60 * 1000, { household: true, owner: true });
  const linkDone = await say(f, "커피 4500원", { key: linkRoom.ownerId, group: "room-g3-link" });
  ok(linkDone.text.includes("저장했어요"), "g3: an old link_sent marker resends the link row and saves");
  eq(linkedHouseholdId(f, "room-g3-link"), linkRoom.candidate, "g3: link row created on retry");
});

// ---------- 1:1 1: edit phrasings with an amount never become new records ----------
await withFixture("d1", async (f) => {
  const direct = { group: "" };
  await say(f, "점심 12000원 국민카드", direct);
  const me = userOf(f, "owner-d1");
  const rowsBefore = newRows(f).length;
  const lunch = () => newRows(f).find((t) => t.memo === "점심");
  eq(rowsBefore, 1, "d1: one row before editing");
  const cases = [
    ["수정 01번 금액을 13000원으로", 13000],
    ["01번 금액을 13100원으로 바꿔줘", 13100],
    ["수정 01번 가격 13200", 13200],
    ["수정 01번 액수 13400원", 13400],
  ];
  for (const [utterance, expected] of cases) {
    const reply = await say(f, utterance, direct);
    eq(newRows(f).length, rowsBefore, `d1: "${utterance}" does not create a record`);
    ok(!reply.text.includes("지출 저장했어요"), `d1: "${utterance}" is not answered as a new expense`);
    eq(Number(lunch()?.amount), expected, `d1: "${utterance}" edits the amount to ${expected}`);
  }
  for (const utterance of ["수정 01번 13300원으로", "수정 01번 02번 금액 5000"]) {
    const reply = await say(f, utterance, direct);
    eq(newRows(f).length, rowsBefore, `d1: "${utterance}" does not create a record`);
    ok(!reply.text.includes("지출 저장했어요"), `d1: "${utterance}" is not answered as a new expense`);
  }
  const multi = await say(f, "수정 01번 02번 금액 5000", direct);
  ok(multi.text.includes("한 번에 한 건씩만 수정할 수 있어요"), "d1: a two-number edit asks for one number");
  await say(f, "취소", direct);
  // plain records that merely start with a number keep working
  const exit = await say(f, "2번 출구 택시 8000원", direct);
  ok(exit.text.includes("저장했어요"), "d1: a record starting with 2번 출구 is still a record");
  eq(newRows(f).length, rowsBefore + 1, "d1: the 2번 출구 record was written");
  const bus = await say(f, "3번 버스 1500원", direct);
  ok(bus.text.includes("저장했어요"), "d1: a record starting with 3번 버스 is still a record");
  ok(me, "d1: user exists");
});

// ---------- 1:1 2: a one-syllable memo still provisions the personal book ----------
await withFixture("d2", async (f) => {
  const direct = { group: "" };
  const rice = await say(f, "밥 4500원", { ...direct, key: "new-d2-rice" });
  ok(rice.text.includes("개인 가계부를 준비했어요") && rice.text.includes("저장했어요"), "d2: 밥 4500원 provisions and saves for a new user");
  eq(newRows(f).filter((t) => t.memo === "밥").length, 1, "d2: the 밥 row exists");
  const water = await say(f, "물 1000원 현금", { ...direct, key: "new-d2-water" });
  ok(water.text.includes("개인 가계부를 준비했어요"), "d2: 물 1000원 현금 provisions for another new user");
  const bare = await say(f, "밥 4500", { ...direct, key: "new-d2-bare" });
  ok(!bare.text.includes("준비했어요"), "d2: without the 원 unit the first record is not auto-provisioned (unchanged)");
  ok(!userOf(f, "new-d2-bare") || !f.db.household_members.some((m) => m.user_id === userOf(f, "new-d2-bare").id), "d2: no household created for the unit-less input");
  const room = await say(f, "밥 4500원", { key: "new-d2-room", group: "room-d2" });
  ok(room.text.includes("공동 가계부를 준비했어요"), "d2: a one-syllable first record also provisions a room");
});

// ---------- 1:1 3: multi-line input ----------
await withFixture("d3", async (f) => {
  const direct = { group: "" };
  await say(f, "점심 12000원 국민카드", direct);
  const before = newRows(f).length;
  const glued = await say(f, "점심 12100원\n커피\n택시 8100원", direct);
  ok(glued.text.includes("새로 저장 2건"), "d3: two amount lines are saved, the amount-less line is skipped");
  const taxi = newRows(f).find((t) => Number(t.amount) === 8100);
  eq(taxi?.memo, "택시", "d3: the amount-less line is not glued into the next memo");
  eq(newRows(f).length, before + 2, "d3: exactly two rows added");
  const numbered = await say(f, "1. 샐러드 9100원\n2. 주스 4100원", direct);
  ok(numbered.text.includes("새로 저장 2건"), "d3: a numbered list is saved");
  eq(newRows(f).find((t) => Number(t.amount) === 9100)?.memo, "샐러드", "d3: numbered list memo has no marker");
  eq(newRows(f).find((t) => Number(t.amount) === 4100)?.memo, "주스", "d3: second numbered memo");
  const bullets = await say(f, "- 빵 3100원\n- 우유 2100원", direct);
  ok(bullets.text.includes("새로 저장 2건"), "d3: a bullet list is saved");
  eq(newRows(f).find((t) => Number(t.amount) === 3100)?.memo, "빵", "d3: bullet memo has no dash");
  const single = await say(f, "1. 김밥 3200원", direct);
  ok(single.text.includes("저장했어요") && !single.text.includes("1원"), "d3: a single numbered line is not read as 1원");
  eq(newRows(f).find((t) => Number(t.amount) === 3200)?.memo, "김밥", "d3: single numbered memo");
  const dated = await say(f, "어제\n국수 7100원\n커피 4200원", direct);
  ok(dated.text.includes("새로 저장 2건"), "d3: a leading date line applies to the following lines");
  const yesterday = newRows(f).find((t) => Number(t.amount) === 7100);
  ok(yesterday && yesterday.transaction_date < new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10), "d3: the dated lines use the date line");
});

// ---------- 1:1 4: settlement per-head figure ----------
await withFixture("d4", async (f) => {
  await say(f, "점심 40001원");                                  // owner provisions the room book
  await say(f, "커피 4500원", { key: "member2-d4" });            // two members auto-join
  await say(f, "물 1000원", { key: "member3-d4" });
  f.db.transactions = f.db.transactions.filter((t) => String(t.id).startsWith("tx-") || Number(t.amount) === 40001);
  const settle = await say(f, "정산");
  ok(settle.text.includes("참여자: 3명"), "d4: three participants in the room settlement");
  ok(settle.text.includes("1인 기준: 13,333원 (나머지 2원은 마지막 참여자 몫)"), "d4: the Kakao per-head line is floored and names the remainder");
  ok(!settle.text.includes("1인 기준: 13,334원"), "d4: the rounded figure that matched nobody is gone");
  f.db.transactions = f.db.transactions.map((t) => Number(t.amount) === 40001 ? { ...t, amount: 40002 } : t);
  const even = await say(f, "정산");
  ok(even.text.includes("1인 기준: 13,334원") && !even.text.includes("나머지"), "d4: an exact split shows no remainder note");
});

// ---------- 1:1 7: daily list overflow hint ----------
await withFixture("d7", async (f) => {
  const direct = { group: "" };
  await say(f, "점심 12000원 국민카드", direct);
  const lines = Array.from({ length: 22 }, (_, i) => `물건${i + 1} ${1000 + i}원`).join("\n");
  const bulk = await say(f, lines, direct);
  ok(bulk.text.includes("새로 저장 22건"), "d7: 22 rows saved in one message");
  const list = await say(f, "오늘 기록 보기", direct);
  // V22.9.77 감사 A-14: 넘치는 날은 가장 오래된 20건이 아니라 최근 20건을 번호순으로 보이고, 앞쪽에서 뺀 건수와 번호를 말한다.
  ok(list.text.includes("04번 -") && list.text.includes("23번 -") && !list.text.includes("03번 -"), "d7: the list shows the latest 20 rows");
  ok(list.text.includes("외 3건(01~03번)"), "d7: the list says how many earlier rows are left out");
  ok(list.text.includes("최근 20건을 번호순으로 보여요"), "d7: the list states its order");
});

// ---------- 웹 1: /my/recurring/delete reports not-found ----------
await withFixture("w1", async (f) => {
  // user-wifi manages house-home here (recurring rules are manager-only); the foreign rule still belongs to house-trip.
  f.db.household_members = f.db.household_members.map((m) => m.household_id === "house-home" && m.user_id === "user-wifi" ? { ...m, role: "admin" } : m);
  f.db.accountbook_recurring.push({ id: "recurring-trip", household_id: "house-trip", type: "expense", amount: 1000, category: "여행", memo: "TRIP", payment_method: "", day_of_month: 1, user_id: "user-bin", is_active: true });
  const foreign = await web(f, "/my/recurring/delete", "user-wifi", { method: "POST", body: "household_id=house-home&month=2026-07&id=recurring-trip" });
  eq(foreign.response.status, 303, "w1: delete redirects");
  const location = foreign.response.headers.get("location") || "";
  ok(location.includes("err=recurring_not_found"), "w1: a foreign rule id is reported as not found");
  ok(!location.includes("msg=recurring_deleted"), "w1: no false success");
  ok(f.db.accountbook_recurring.some((r) => r.id === "recurring-trip"), "w1: the foreign rule still exists");
  const missing = await web(f, "/my/recurring/delete", "user-bin", { method: "POST", body: "household_id=house-home&month=2026-07&id=does-not-exist" });
  ok((missing.response.headers.get("location") || "").includes("err=recurring_not_found"), "w1: an unknown rule id is reported as not found");
  const own = await web(f, "/my/recurring/delete", "user-bin", { method: "POST", body: "household_id=house-home&month=2026-07&id=recurring-rent" });
  ok((own.response.headers.get("location") || "").includes("msg=recurring_deleted"), "w1: deleting an own rule still succeeds");
  ok(!f.db.accountbook_recurring.some((r) => r.id === "recurring-rent"), "w1: the own rule is gone");
});

// ---------- 웹 2: foreign household_id → not-found page ----------
await withFixture("w2", async (f) => {
  for (const path of ["/app", "/my", "/my/settings", "/my/analysis", "/my/members", "/my/groups", "/my/backup", "/reports"]) {
    const result = await web(f, `${path}?month=2026-07&household_id=house-trip`, "user-wifi");
    eq(result.response.status, 404, `w2: ${path} with a foreign household_id answers 404`);
    ok(result.html.includes("가계부를 찾을 수 없어요"), `w2: ${path} renders the not-found page`);
    ok(!result.html.includes("가계부 시작"), `w2: ${path} does not render the no-household start page`);
    ok(!result.html.includes("숙소 예약"), `w2: ${path} leaks nothing from the foreign household`);
  }
  const own = await web(f, "/app?month=2026-07&household_id=house-home", "user-wifi");
  eq(own.response.status, 200, "w2: own household still renders");
  const none = await web(f, "/my?month=2026-07&household_id=house-trip", "user-nobody");
  ok(none.response.status === 303 || none.response.status === 200, "w2: a user without a session or households is not broken");
});

console.log(`V22.9.68 출시 전 전체 점검 회귀 검사 통과 (${checks} checks)`);
