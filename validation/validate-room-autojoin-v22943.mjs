// V22.9.43 단톡방 자동 참여(승인 단계 없음)와 소유자가 정하는 구성원 권한(기록만/기록·수정) 검사.
// Synthetic in-memory requests only. No live Supabase, Kakao or financial data writes.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import app, * as runtime from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0, sequence = 0;
const eq = (actual, expected, label) => { assert.equal(actual, expected, label); checks++; };
const ok = (actual, label) => { assert.ok(actual, label); checks++; };
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n")).join("\n");
const digest = (value) => createHash("sha256").update(String(value)).digest("hex");
const BASE = "https://malhaebook.com";
const policyKey = (hid) => `household_member_policy_v22943:${hid}`;
const setting = (f, key) => f.db.accountbook_settings.find((item) => item.key === key);
const put = (f, key, value) => {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const previous = setting(f, key);
  if (previous) previous.value = text; else f.db.accountbook_settings.push({ key, value: text });
};
const policyOf = (f, hid) => JSON.parse(setting(f, policyKey(hid))?.value || "null");
const roleOf = (f, userId, hid) => f.db.household_members.find((m) => String(m.user_id) === String(userId) && m.household_id === hid)?.role;
const userIdOf = (f, key) => f.db.users.find((u) => u.kakao_user_key === key)?.id;
const txCount = (f) => f.db.transactions.length;
const txById = (f, id) => f.db.transactions.find((t) => t.id === id);

async function withFixture(test) {
  const f = await createV2265QaFixture();
  f.key = `room-autojoin-qa-${++sequence}`;
  f.group = `${f.key}-room`;
  f.env.KAKAO_SKILL_SECRET = "synthetic-v43-skill-secret";
  const memoryFetch = globalThis.fetch;
  f.trace = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname !== "mock.supabase.co") throw new Error("unexpected live network in synthetic room QA");
    f.trace.push({ url, method: init.method || "GET" });
    return memoryFetch(input, init);
  };
  try { await test(f); } finally { f.restore(); }
}

async function skill(f, utterance, { key = f.key, group = f.group, auth = true } = {}) {
  const jobs = [];
  const headers = { "content-type": "application/json", "user-agent": f.key };
  if (auth) headers["x-kakao-skill-secret"] = f.env.KAKAO_SKILL_SECRET;
  const payload = { userRequest: { utterance, user: { id: key, type: "botUserKey", properties: group ? { botGroupKey: group } : {} } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), f.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  const body = await response.json();
  return { status: response.status, body, text: textOf(body) };
}

async function post(f, path, userId, values) {
  return app.fetch(new Request(BASE + path, { method: "POST", redirect: "manual", headers: { "content-type": "application/x-www-form-urlencoded", cookie: await f.cookieFor(userId), origin: BASE, "sec-fetch-site": "same-origin", "user-agent": f.key }, body: new URLSearchParams(values) }), f.env, { waitUntil() {} });
}

async function postJson(f, path, userId, value) {
  return app.fetch(new Request(BASE + path, { method: "POST", headers: { "content-type": "application/json", cookie: await f.cookieFor(userId), origin: BASE, "sec-fetch-site": "same-origin", "user-agent": f.key }, body: JSON.stringify(value) }), f.env, { waitUntil() {} });
}

async function get(f, path, userId) {
  return app.fetch(new Request(BASE + path, { headers: { cookie: await f.cookieFor(userId), "user-agent": f.key } }), f.env, { waitUntil() {} });
}

const locationOf = (response) => decodeURIComponent(response.headers.get("location") || "");

// 1. 첫 기록으로 준비한 방: 승인 없이 참여, 카카오 권한 명령, 기록만일 때 카카오 수정·삭제·복구 차단과 소유자 예외.
await withFixture(async (f) => {
  const ownerKey = f.key, memberKey = `${f.key}-member`, lateKey = `${f.key}-late`;
  const first = await skill(f, "커피 4500", { key: ownerKey });
  ok(first.text.includes("참여자 권한: 기록·수정"), "first record tells the owner the default member permission");
  ok(first.text.includes("구성원 권한 기록만"), "first record tells the owner how to switch to record only");
  const ledger = f.db.transactions.at(-1).household_id;
  const ownerId = userIdOf(f, ownerKey);
  eq(roleOf(f, ownerId, ledger), "owner", "first caller owns the room ledger");

  const joined = await skill(f, "우유 3300", { key: memberKey });
  const memberId = userIdOf(f, memberKey);
  eq(roleOf(f, memberId, ledger), "member", "room participant joins without approval");
  eq(f.db.transactions.at(-1).household_id, ledger, "joining record is saved in the room ledger");
  eq(f.db.transactions.at(-1).user_id, memberId, "joining record keeps the participant as spender");
  ok(joined.text.includes("이 방의 공동 가계부에 참여했어요"), "auto room join keeps the shared-ledger wording");
  ok(joined.text.includes("내 권한: 기록·수정"), "join notice states the member permission");
  ok(joined.text.includes("삭제:"), "record-and-edit member still sees edit/delete hints");

  const denied = await skill(f, "구성원 권한 기록만", { key: memberKey });
  ok(denied.text.includes("소유자만"), "member cannot change the member permission");
  ok(!setting(f, policyKey(ledger)), "refused change writes no policy row");
  const shown = await skill(f, "참여자 권한", { key: memberKey });
  ok(shown.text.includes("구성원 권한: 기록·수정") && shown.text.includes("소유자만 바꿀 수"), "member can view the current permission");
  const ownerView = await skill(f, "구성원 권한 확인", { key: ownerKey });
  ok(ownerView.text.includes("구성원 권한 기록만"), "owner view explains how to change it");

  const set = await skill(f, "구성원 권한 기록만", { key: ownerKey });
  ok(set.text.includes("구성원 권한: 기록만"), "owner switches members to record only");
  const stored = policyOf(f, ledger);
  eq(stored?.version, 1, "policy row is versioned");
  eq(stored?.mode, "record_only", "policy row stores record_only");
  eq(stored?.updated_by, ownerId, "policy row records the owner");
  ok(Number.isFinite(Date.parse(stored?.updated_at || "")), "policy row records when it changed");

  const beforeAdd = txCount(f);
  const added = await skill(f, "빵 2500", { key: memberKey });
  eq(txCount(f), beforeAdd + 1, "record-only member can still add records");
  ok(added.text.includes("구성원 권한: 기록만") && !added.text.includes("삭제:"), "record-only save reply drops edit/delete hints");
  const bulkBefore = txCount(f);
  const bulk = await skill(f, "김밥 3000\n라면 4000", { key: memberKey });
  eq(txCount(f), bulkBefore + 2, "record-only member can add several records at once");
  ok(bulk.text.includes("구성원 권한: 기록만") && !bulk.text.includes("수정할 번호는"), "record-only bulk reply drops the edit hint");

  for (const command of ["삭제 01번", "수정 01번 금액 5000", "방금 삭제", "복구", "수정 01번", "01번 삭제"]) {
    const snapshot = JSON.stringify(f.db.transactions);
    const refused = await skill(f, command, { key: memberKey });
    eq(JSON.stringify(f.db.transactions), snapshot, `${command}: record-only member changes nothing`);
    ok(refused.text.includes("기록만"), `${command}: refusal names the record-only permission`);
  }

  const ownerBefore = txCount(f);
  const ownerDelete = await skill(f, "삭제 01번", { key: ownerKey });
  eq(txCount(f), ownerBefore - 1, "owner is not limited by the member permission");
  ok(!ownerDelete.text.includes("기록만"), "owner delete is not refused");
  const ownerRestore = await skill(f, "복구", { key: ownerKey });
  eq(txCount(f), ownerBefore, "owner can restore under record only");
  ok(ownerRestore.text.includes("복구"), "owner restore is confirmed");

  const late = await skill(f, "택시 8000", { key: lateKey });
  eq(roleOf(f, userIdOf(f, lateKey), ledger), "member", "newcomer still joins under record only");
  ok(late.text.includes("내 권한: 기록만"), "newcomer joining under record only is told so");

  const back = await skill(f, "구성원 권한 기록 수정", { key: ownerKey });
  ok(back.text.includes("구성원 권한: 기록·수정"), "owner switches back to record and edit");
  eq(policyOf(f, ledger)?.mode, "record_edit", "policy row stores record_edit");
  const memberBefore = txCount(f);
  await skill(f, "02번 삭제", { key: memberKey });
  eq(txCount(f), memberBefore - 1, "record-and-edit member can delete an own record again");
  const repeat = await skill(f, "구성원 권한 수정 허용", { key: ownerKey });
  ok(repeat.text.includes("기록·수정"), "setting the same permission again is confirmed");
  eq(policyOf(f, ledger)?.mode, "record_edit", "repeated setting keeps the stored value");
});

// 2. 세션을 연 뒤 기록만으로 바뀌면 반영 직전에 막는다. 권한 값이 깨지면 고치지 않는다(저장은 계속된다).
await withFixture(async (f) => {
  const ownerKey = f.key, memberKey = `${f.key}-member`;
  await skill(f, "커피 4500", { key: ownerKey });
  const ledger = f.db.transactions.at(-1).household_id;
  await skill(f, "우유 3300", { key: memberKey });
  const memberRow = f.db.transactions.at(-1);
  const menu = await skill(f, "수정 01번", { key: memberKey });
  ok(!menu.text.includes("기록만"), "record-and-edit member can open the edit menu");
  await skill(f, "구성원 권한 기록만", { key: ownerKey });
  const applied = await skill(f, "금액 5000", { key: memberKey });
  eq(txById(f, memberRow.id)?.amount, 3300, "edit session opened earlier cannot apply under record only");
  ok(applied.text.includes("기록만"), "late edit refusal names the record-only permission");

  put(f, policyKey(ledger), "{broken");
  const snapshot = JSON.stringify(f.db.transactions);
  const broken = await skill(f, "삭제 01번", { key: memberKey });
  eq(JSON.stringify(f.db.transactions), snapshot, "unreadable permission changes nothing");
  ok(broken.text.includes("확인하지 못해"), "unreadable permission is explained");
  const beforeAdd = txCount(f);
  await skill(f, "과자 1800", { key: memberKey });
  eq(txCount(f), beforeAdd + 1, "unreadable permission never blocks adding a record");
  const repaired = await skill(f, "구성원 권한 기록 수정", { key: ownerKey });
  ok(repaired.text.includes("구성원 권한: 기록·수정"), "owner choice repairs an unreadable permission");
  eq(policyOf(f, ledger)?.mode, "record_edit", "repaired permission is stored");
});

// 3. 초대코드로 직접 연결한 방: 연결 안내, 승인 없는 참여, 승인 대기 승격, 나간·내보낸 사람 보호, 인증 없는 요청.
await withFixture(async (f) => {
  const ownerKey = "kakao_login:2265";
  const bind = await skill(f, "단톡방 연결 HOME2265", { key: ownerKey });
  ok(bind.text.includes("단톡방 연결 완료") && bind.text.includes("승인 없이"), "bind result says room participants join without approval");
  ok(bind.text.includes("구성원 권한: 기록·수정"), "bind result shows the current member permission");

  const newKey = `${f.key}-new`;
  const before = txCount(f);
  const joined = await skill(f, "점심 9000", { key: newKey });
  const newId = userIdOf(f, newKey);
  eq(roleOf(f, newId, "house-home"), "member", "manual room participant joins without approval");
  eq(txCount(f), before + 1, "manual room participant's record is saved");
  eq(f.db.transactions.at(-1).household_id, "house-home", "record lands only in the linked ledger");
  ok(joined.text.includes("‘우리집 생활비’ 가계부에 참여했어요"), "manual room join names the linked ledger");

  const outsiderKey = `${f.key}-outsider`;
  const summary = await skill(f, "이번 달 요약", { key: outsiderKey });
  ok(summary.text.includes("거래를 한 번 보내면 자동으로 참여"), "non-member query explains joining by recording");
  ok(!roleOf(f, userIdOf(f, outsiderKey), "house-home"), "a query alone never joins");
  const start = await skill(f, "시작", { key: outsiderKey });
  ok(start.text.includes("아직 참여 전"), "start shows the not-yet-joined state instead of pending");
  const info = await skill(f, "단톡방 연결 상태", { key: outsiderKey });
  ok(!info.text.includes("내 권한: member") && !info.text.includes("내 권한: owner"), "room info never shows raw role codes");

  const untrustedKey = `${f.key}-untrusted`;
  const untrustedBefore = txCount(f);
  await skill(f, "커피 3000", { key: untrustedKey, auth: false });
  eq(txCount(f), untrustedBefore, "untrusted room request saves nothing");
  ok(!f.db.household_members.some((m) => m.household_id === "house-home" && m.user_id === userIdOf(f, untrustedKey)), "untrusted room request never joins");

  f.db.users.push({ id: "user-pending-v43", kakao_user_key: `${f.key}-pending`, nickname: "대기", created_at: "2026-07-01T00:00:00.000Z" });
  f.db.household_members.push({ household_id: "house-home", user_id: "user-pending-v43", role: "pending", created_at: "2026-07-01T00:00:00.000Z" });
  const pendingBefore = txCount(f);
  const promoted = await skill(f, "간식 2000", { key: `${f.key}-pending` });
  eq(roleOf(f, "user-pending-v43", "house-home"), "member", "pending participant becomes a member by recording in the room");
  eq(txCount(f), pendingBefore + 1, "pending participant's record is saved");
  ok(promoted.text.includes("참여했어요"), "pending promotion is explained");

  for (const role of ["viewer", "blocked"]) {
    f.db.household_members.push({ household_id: "house-home", user_id: `user-${role}-v43`, role, created_at: "2026-07-01T00:00:00.000Z" });
    f.db.users.push({ id: `user-${role}-v43`, kakao_user_key: `${f.key}-${role}`, nickname: role, created_at: "2026-07-01T00:00:00.000Z" });
    const count = txCount(f);
    await skill(f, "음료 1500", { key: `${f.key}-${role}` });
    eq(txCount(f), count, `${role}: owner-set role still saves nothing`);
    eq(roleOf(f, `user-${role}-v43`, "house-home"), role, `${role}: owner-set role is never overwritten`);
  }

  const left = await post(f, "/my/household/leave", "user-wifi", { household_id: "house-home", understand_history: "1" });
  eq(left.status, 303, "member can leave");
  const leftBefore = txCount(f);
  const refusedLeft = await skill(f, "과일 7000", { key: "kakao_login:2266" });
  eq(txCount(f), leftBefore, "departed participant is not re-added by recording");
  ok(!roleOf(f, "user-wifi", "house-home"), "departed participant stays absent");
  ok(refusedLeft.text.includes("나간"), "departure refusal is explained");

  const removed = await post(f, "/admin/member/remove", "user-bin", { household_id: "house-home", user_id: newId, return_to: "/my/members?household_id=house-home" });
  eq(removed.status, 303, "owner can remove a room participant");
  ok(!roleOf(f, newId, "house-home"), "removed participant is gone");
  const removedBefore = txCount(f);
  await skill(f, "점심 9100", { key: newKey });
  eq(txCount(f), removedBefore, "removed participant is not re-added by recording");
  ok(!roleOf(f, newId, "house-home"), "removed participant stays absent");

  f.db.household_members.push({ household_id: "house-home", user_id: newId, role: "pending", created_at: "2026-07-01T00:00:00.000Z" });
  const dpBefore = txCount(f);
  const dp = await skill(f, "점심 9200", { key: newKey });
  eq(roleOf(f, newId, "house-home"), "pending", "a departed participant asking again by invite code waits for the owner");
  eq(txCount(f), dpBefore, "departed pending participant saves nothing");
  ok(dp.text.includes("승인 대기"), "departed pending participant sees the pending state");
  ok(setting(f, `kakao_group_departed_v22931:${digest(newId)}`), "removal left the departure marker that blocks auto rejoin");
});

// 4. 방을 다른 가계부로 다시 연결해도 같은 사람이 새 가계부에 참여한다(참여 표식은 방·사용자·가계부마다 하나).
await withFixture(async (f) => {
  const ownerKey = "kakao_login:2265";
  await skill(f, "단톡방 연결 TRIP2265", { key: ownerKey });
  const travelerKey = `${f.key}-traveler`;
  await skill(f, "숙소 50000", { key: travelerKey });
  const travelerId = userIdOf(f, travelerKey);
  eq(roleOf(f, travelerId, "house-trip"), "member", "participant joins the first linked ledger");
  const confirm = await skill(f, "단톡방 연결 HOME2265", { key: ownerKey });
  ok(confirm.text.includes("연결을 변경할까요") && confirm.text.includes("승인 없이"), "relink confirmation warns that participants join without approval");
  const yes = await skill(f, "연결하기", { key: ownerKey });
  ok(yes.text.includes("단톡방 연결 완료") && yes.text.includes("승인 없이"), "relink result repeats the join rule");
  const before = txCount(f);
  await skill(f, "택시 13000", { key: travelerKey });
  eq(roleOf(f, travelerId, "house-home"), "member", "same participant joins the newly linked ledger");
  eq(txCount(f), before + 1, "record after relink is saved");
  eq(f.db.transactions.at(-1).household_id, "house-home", "record after relink lands in the new ledger");
  eq(roleOf(f, travelerId, "house-trip"), "member", "earlier ledger membership is untouched");
  eq(f.db.accountbook_settings.filter((item) => item.key.startsWith("kakao_group_member_attempt_v22943:")).length, 2, "one join marker per room, user and ledger");
});

// 5. 웹: 소유자 저장 화면, 기록만일 때 구성원 수정·삭제·목표·카드 실적 목표 차단, 추가는 허용, 홈 단추 숨김.
await withFixture(async (f) => {
  const home = "house-home";
  const app0 = await (await get(f, `/app?month=2026-07&household_id=${home}`, "user-wifi")).text();
  ok(app0.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-1'), "record-and-edit member sees the edit control for an own row");
  const day0 = await (await get(f, `/u/api/day-transactions?household=${home}&date=2026-07-04`, "user-wifi")).json();
  eq(day0.items.find((item) => item.id === "tx-expense-1")?.can_edit, true, "day sheet allows editing an own row by default");

  const page0 = await (await get(f, `/my/members?household_id=${home}&month=2026-07`, "user-bin")).text();
  ok(page0.includes('id="member-policy"') && page0.includes('action="/my/member-policy/save"'), "owner sees the member permission form");
  ok(page0.includes('value="record_edit" checked'), "default permission is record and edit");
  const memberPage = await get(f, `/my/members?household_id=${home}&month=2026-07`, "user-wifi");
  eq(memberPage.status, 403, "members page stays manager-only");

  const byMember = await post(f, "/my/member-policy/save", "user-wifi", { household_id: home, month: "2026-07", mode: "record_only" });
  ok(locationOf(byMember).includes("err=member_policy_owner_only"), "member cannot save the permission on the web");
  ok(!setting(f, policyKey(home)), "refused web change writes nothing");
  const invalid = await post(f, "/my/member-policy/save", "user-bin", { household_id: home, month: "2026-07", mode: "everything" });
  ok(locationOf(invalid).includes("err=member_policy_failed"), "unknown mode is refused");
  const saved = await post(f, "/my/member-policy/save", "user-bin", { household_id: home, month: "2026-07", mode: "record_only" });
  ok(locationOf(saved).includes("msg=member_policy_saved") && locationOf(saved).includes("#member-policy"), "owner saves the permission and returns to the form");
  eq(policyOf(f, home)?.mode, "record_only", "web save stores record_only");
  const page1 = await (await get(f, `/my/members?household_id=${home}&month=2026-07&msg=member_policy_saved`, "user-bin")).text();
  ok(page1.includes('value="record_only" checked'), "form reflects the saved permission");
  ok(page1.includes("구성원 권한을 저장했습니다"), "save message is shown");

  const original = txById(f, "tx-expense-1").amount;
  const update = await post(f, "/admin/update", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07", type: "expense", transaction_date: "2026-07-04", amount: "1000", category: "식비", memo: "주말 장보기", payment_method: "국민카드" });
  ok(locationOf(update).includes("err=member_record_only"), "record-only member cannot update an own row");
  eq(txById(f, "tx-expense-1").amount, original, "refused update leaves the row unchanged");
  const remove = await post(f, "/admin/delete", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07" });
  ok(locationOf(remove).includes("err=member_record_only"), "record-only member cannot delete an own row");
  ok(txById(f, "tx-expense-1"), "refused delete keeps the row");
  const legacyUpdate = await post(f, "/my/update", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07", amount: "1000", transaction_date: "2026-07-04" });
  ok(locationOf(legacyUpdate).includes("err=member_record_only"), "legacy update route is covered");
  const legacyDelete = await post(f, "/my/delete", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07" });
  ok(locationOf(legacyDelete).includes("err=member_record_only"), "legacy delete route is covered");
  ok(txById(f, "tx-expense-1") && txById(f, "tx-expense-1").amount === original, "legacy routes change nothing");
  const fragment = await get(f, "/transactions/edit?id=tx-expense-1&fragment=1", "user-wifi");
  eq(fragment.status, 403, "edit form fragment is refused");
  ok((await fragment.text()).includes("기록만"), "edit form refusal names the permission");
  const day1 = await (await get(f, `/u/api/day-transactions?household=${home}&date=2026-07-04`, "user-wifi")).json();
  eq(day1.items.find((item) => item.id === "tx-expense-1")?.can_edit, false, "day sheet hides editing under record only");
  eq(day1.can_write, true, "day sheet still allows adding under record only");
  const app1 = await (await get(f, `/app?month=2026-07&household_id=${home}`, "user-wifi")).text();
  ok(!app1.includes("openEdit('tx-expense-1')") && !app1.includes("id=tx-expense-1&"), "home hides edit controls under record only");
  ok(app1.includes('action="/admin/transactions"'), "home keeps the add form under record only");

  const addBefore = txCount(f);
  const added = await post(f, "/admin/transactions", "user-wifi", { household_id: home, month: "2026-07", type: "expense", transaction_date: "2026-07-20", amount: "6000", category: "식비", memo: "점심", payment_method: "현금", return_to: `/app?month=2026-07&household_id=${home}` });
  eq(added.status, 303, "record-only member add request completes");
  eq(txCount(f), addBefore + 1, "record-only member can add on the web");

  const goals = await (await get(f, `/u/api/goals?household=${home}`, "user-wifi")).json();
  eq(goals.can_write, false, "goals are read-only for record-only members");
  const goalWrite = await postJson(f, "/u/api/goals", "user-wifi", { household: home, action: "create", name: "여행", target: 100000 });
  eq(goalWrite.status, 403, "goal changes are refused for record-only members");
  eq((await goalWrite.json()).reason, "member_record_only", "goal refusal names the permission");
  const card = await post(f, "/my/card-target/save", "user-wifi", { household_id: home, month: "2026-07", asset_id: "card-1", target: "300000" });
  ok(locationOf(card).includes("err=member_record_only"), "card targets are refused for record-only members");

  const ownerUpdate = await post(f, "/admin/update", "user-bin", { id: "tx-expense-1", household_id: home, month: "2026-07", type: "expense", transaction_date: "2026-07-04", amount: "150000", category: "식비", memo: "주말 장보기", payment_method: "국민카드" });
  ok(!locationOf(ownerUpdate).includes("member_record_only"), "owner is not limited by the member permission on the web");
  eq(txById(f, "tx-expense-1").amount, 150000, "owner update is applied");
  const ownerGoals = await (await get(f, `/u/api/goals?household=${home}`, "user-bin")).json();
  eq(ownerGoals.can_write, true, "owner keeps goal editing");

  put(f, policyKey(home), "{broken");
  const unavailable = await post(f, "/admin/update", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07", type: "expense", transaction_date: "2026-07-04", amount: "1000", category: "식비", memo: "주말 장보기", payment_method: "국민카드" });
  ok(locationOf(unavailable).includes("err=member_policy_unavailable"), "unreadable permission refuses web edits");
  eq(txById(f, "tx-expense-1").amount, 150000, "unreadable permission changes nothing");
  const page2 = await (await get(f, `/my/members?household_id=${home}&month=2026-07`, "user-bin")).text();
  ok(page2.includes("구성원 권한을 확인하지 못했습니다"), "members page does not guess an unreadable permission");
  const repaired = await post(f, "/my/member-policy/save", "user-bin", { household_id: home, month: "2026-07", mode: "record_edit" });
  ok(locationOf(repaired).includes("msg=member_policy_saved"), "owner can repair an unreadable permission on the web");
  const update2 = await post(f, "/admin/update", "user-wifi", { id: "tx-expense-1", household_id: home, month: "2026-07", type: "expense", transaction_date: "2026-07-04", amount: "149000", category: "식비", memo: "주말 장보기", payment_method: "국민카드" });
  ok(!locationOf(update2).includes("member_record_only"), "record-and-edit member can update again");
  eq(txById(f, "tx-expense-1").amount, 149000, "member update is applied after switching back");
});

// 6. 가계부를 지우면 구성원 권한 줄도 지운다.
await withFixture(async (f) => {
  put(f, policyKey("house-trip"), { version: 1, mode: "record_only", updated_by: "user-bin", updated_at: new Date().toISOString() });
  await runtime.purgeHouseholdData(f.env, "house-trip");
  ok(!setting(f, policyKey("house-trip")), "household purge removes the member permission row");
});

// 7. 실제 카카오 요청 모양(공식 그룹 챗봇 가이드 v1.11.1): 방 키는 userRequest.chat.properties.botGroupKey 와
// type 이 "botGroupKey" 인 chat.id 에 온다. 이 모양이 명시적 키로 인정되지 않아 운영(V22.9.31~42)에서는 새 방 첫 기록이
// "연결된 가계부가 없습니다"로 거절됐다(2026-10-13 운영 단톡방). 위 시나리오의 user.properties 모양과 별도로 확인한다.
async function officialSkill(f, utterance, { key, room, auth = true, chat = null } = {}) {
  const headers = { "content-type": "application/json", "user-agent": f.key };
  if (auth) headers["x-kakao-skill-secret"] = f.env.KAKAO_SKILL_SECRET;
  const payload = {
    bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" },
    intent: { id: "synthetic-fallback", name: "폴백 블록" },
    userRequest: {
      utterance,
      user: { id: key, type: "botUserKey", properties: { botUserKey: key } },
      chat: chat || { id: room, type: "botGroupKey", properties: { botGroupKey: room } },
    },
  };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), f.env, { waitUntil() {} });
  const body = await response.json();
  return { body, text: textOf(body) };
}

await withFixture(async (f) => {
  const room = `${f.key}-official-room`;
  eq(runtime.getExplicitKakaoBotGroupKey({ userRequest: { chat: { id: room, type: "botGroupKey", properties: { botGroupKey: room } } } }), room, "official chat shape is an explicit room key");
  eq(runtime.getExplicitKakaoBotGroupKey({ userRequest: { chat: { id: room, type: "botGroupKey" } } }), room, "typed chat id alone is an explicit room key");
  eq(runtime.getExplicitKakaoBotGroupKey({ userRequest: { chat: { id: room } } }), "", "untyped chat id is still not provisioning proof");
  eq(runtime.getExplicitKakaoBotGroupKey({ userRequest: { chat: { id: room, type: "botGroupKey", properties: { botGroupKey: `${room}-other` } } } }), "", "conflicting room keys are rejected");

  const households = f.db.households.length;
  const first = await officialSkill(f, "@말해가계부 점심 5만원", { key: "kakao_login:2265", room });
  eq(f.db.households.length, households + 1, "official payload: an owner of other ledgers still gets a new room ledger");
  const ledger = f.db.transactions.at(-1).household_id;
  ok(!["house-home", "house-trip"].includes(ledger), "official payload: the first record goes to the new room ledger, not an existing one");
  eq(f.db.transactions.at(-1).amount, 50000, "official payload: the first record is saved");
  eq(roleOf(f, "user-bin", ledger), "owner", "official payload: the first caller owns the room ledger");
  ok(first.text.includes("공동 가계부를 준비했어요") && !first.text.includes("연결된 가계부가 없습니다"), "official payload: no 'no linked ledger' refusal");

  const second = await officialSkill(f, "@말해가계부 커피 4500", { key: "a19b8cd3404d56ff71890edcb9b0be8b6466fd0c6bae2c9b177f3fa12cf21dd9ae", room });
  const secondId = userIdOf(f, "a19b8cd3404d56ff71890edcb9b0be8b6466fd0c6bae2c9b177f3fa12cf21dd9ae");
  eq(roleOf(f, secondId, ledger), "member", "official payload: the second participant joins without approval");
  eq(f.db.transactions.at(-1).household_id, ledger, "official payload: the second participant's record is saved in the room ledger");
  ok(second.text.includes("참여했어요"), "official payload: the join is explained");

  for (const [label, chat] of [["untyped chat id", { id: `${room}-untyped` }], ["conflicting keys", { id: `${room}-x`, type: "botGroupKey", properties: { botGroupKey: `${room}-y` } }]]) {
    const before = f.db.households.length, tx = txCount(f);
    await officialSkill(f, "택시 9000", { key: `${f.key}-${label}`, chat });
    eq(f.db.households.length, before, `${label}: no room ledger is prepared`);
    eq(txCount(f), tx, `${label}: nothing is saved`);
  }
  const untrustedBefore = f.db.households.length;
  await officialSkill(f, "택시 9100", { key: `${f.key}-untrusted`, room: `${room}-untrusted`, auth: false });
  eq(f.db.households.length, untrustedBefore, "official payload without the skill secret prepares nothing");
});

// 8. 소스 계약: 새 역할·SQL 없이 설정 한 줄로 저장하고, 라우터는 await 로 넘기며, 요청마다 권한 캐시를 새로 만든다.
{
  const access = readFileSync(new URL("../src/modules/my/access-control.js", import.meta.url), "utf8");
  const room = readFileSync(new URL("../src/modules/kakao/group-links-first-record.js", import.meta.url), "utf8");
  const router = readFileSync(new URL("../src/modules/worker/router.js", import.meta.url), "utf8");
  ok(access.includes("household_member_policy_v22943:"), "policy is one accountbook_settings row per household");
  ok(!/role:\s*"record_only"|"recorder"/.test(access + room), "no new household_members role value is written");
  ok(!room.includes("if (!role && automaticRoom)"), "joining is no longer limited to rooms prepared by a first record");
  ok(room.includes("kakao_group_member_attempt_v22943:"), "join marker is scoped per ledger");
  ok(router.includes("return await handleMyMemberPolicySave(request, env);"), "router awaits the policy save handler");
  ok(router.includes("__AB_MEMBER_POLICY: new Map()"), "policy cache is per request");
}

console.log(`PASS: V22.9.43 room auto-join without approval and owner-chosen member permission (${checks} checks)`);
