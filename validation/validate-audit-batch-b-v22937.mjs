// V22.9.37 감사 묶음 B — 카카오 챗봇·가계부 수명주기(AUDIT_FINDINGS_V22_9_33 §4·§5, V22_9_34 §2 이월분).
//   NEW-4 카카오 삭제도 감사 RPC(accountbook_delete_transaction_v227)로, 복구·"먼저 확인" 보호 유지
//   NEW-9 카카오 수정의 감사 기록에 행위자(요청 사용자)·종류(kakao)를 남긴다
//   NEW-8 "50억": 수정 메뉴에서는 금액으로 읽어 상한을 알리고, 예산 단계·"예산 50억"은 20억 상한에서 거절
//   H2 단톡방 참여 명령은 개인 선택을 바꾸지 않는다   H3 "가계부 참여 CODE" 한 줄을 웹·카카오 모두 코드로 읽는다
//   H5 참여자 20명 가계부도 저장소 요청 50회 안에 지워지고 잠금이 남지 않는다
//   H6 공동방 준비의 확정 실패(4xx)는 단계를 되돌려 다음 메시지가 다시 시도한다
//   H7 "같은 이름" 비교는 내가 소유한 가계부와만   H10 초대코드는 소유자·관리자만
//   H13 가계부 이름은 거래 문장 정규화를 거치지 않는다("원정대")   H14 만들기 폼의 표시 이름은 가계부별 이름표만 바꾼다
//   H15 승인 대기 중인 사람이 참여 요청을 취소할 수 있다(웹·카카오)
// 메모리 픽스처만 쓴다. 날짜는 고정 시계(KST 2026-07-15)로 잰다. COLLECT=1 이면 실패를 모아 끝에 보여 준다(재현 조사용).
import assert from "node:assert/strict";
import app, { purgeHouseholdData, kakaoGroupFirstKeys, kakaoGroupLinkItemSettingsKey } from "../src/index.js";
import {
  BASE, ctx, failure, fixture, intercept, page, post, putSetting, settingValue, skill, withClock,
} from "./lib-audit-v22934.mjs";

const COLLECT = process.env.COLLECT === "1";
const failures = [];
let checks = 0;
const ok = (value, message) => { if (COLLECT && !value) failures.push(message); else assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { if (COLLECT && actual !== expected) failures.push(`${message} (actual ${JSON.stringify(actual)})`); else assert.equal(actual, expected, message); checks += 1; };

const TODAY = "2026-07-15";
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const row = (id, date, memo, amount, extra = {}) => ({ id, household_id: "house-home", user_id: "user-bin", source_user_key: BIN, transaction_date: date, type: "expense", amount, category: "식비", memo, payment_method: "현금", source: "kakao_skill", raw_text: `${memo} ${amount}`, created_at: `${date}T0${extra.h || 1}:00:00.000Z`, ...extra, h: undefined });
const kakaoFixture = (task) => withClock(TODAY, () => fixture(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  putSetting(fx, "kakao_selected_household_v2251:user-wifi", "house-home");
  fx.db.transactions.push(row("k1", TODAY, "저녁", 30000, { h: 1 }), row("k2", TODAY, "커피", 5000, { h: 2 }), row("k3", TODAY, "빵", 8000, { h: 3 }));
  return task(fx);
}));
const say = (fx, utterance, options) => skill(fx, utterance, options);
const tx = (fx, id) => fx.db.transactions.find((t) => t.id === id) || null;
const rpc = (fx, name) => fx.db.__rpc_calls.filter((call) => call.name === name);
const member = (fx, hid, uid) => fx.db.household_members.find((m) => m.household_id === hid && m.user_id === uid) || null;
const trace = () => {
  const calls = [];
  const restore = intercept(async ({ url, method, init }) => { if (url.hostname === "mock.supabase.co") calls.push({ url, method, body: init?.body ? String(init.body) : "" }); return null; });
  return { calls, restore };
};
// 실제 스킬 Secret 을 붙인 단톡방 요청(공동방 자동 준비 경로). lib 의 skill() 은 Secret 을 보내지 않는다.
async function groupFirstSkill(fx, utterance, { key, group }) {
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET },
    body: JSON.stringify({ userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botGroupKey: group } } } }),
  }), fx.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  const data = await response.json();
  return String(data?.template?.outputs?.map((o) => o?.simpleText?.text || "").join("\n") || "");
}
const groupMarker = async (fx, group) => { const keys = await kakaoGroupFirstKeys(group); return { keys, marker: JSON.parse(settingValue(fx, keys.marker) || "null"), done: JSON.parse(settingValue(fx, keys.done) || "null") }; };

// ── NEW-4 카카오 삭제는 감사 RPC ──────────────────────────────────────
await kakaoFixture(async (fx) => {
  const t = trace();
  let text = "";
  try { text = await say(fx, "삭제 02번"); } finally { t.restore(); }
  const rawDeletes = t.calls.filter((call) => call.method === "DELETE" && call.url.pathname === "/rest/v1/transactions");
  const audited = rpc(fx, "accountbook_delete_transaction_v227");
  eq(rawDeletes.length, 0, "NEW-4 카카오 삭제가 transactions 에 직접 DELETE 를 보내지 않는다");
  eq(audited.length, 1, "NEW-4 카카오 삭제가 감사 RPC 를 한 번 부른다");
  eq(audited[0]?.data?.p_transaction_id, "k2", "NEW-4 감사 RPC 에 지운 기록 id 를 넘긴다");
  eq(audited[0]?.data?.p_household_id, "house-home", "NEW-4 감사 RPC 에 가계부 id 를 넘긴다");
  eq(audited[0]?.data?.p_actor_user_id, "user-bin", "NEW-4 행위자는 요청한 카카오 사용자다");
  eq(audited[0]?.data?.p_actor_kind, "kakao", "NEW-4 행위 종류는 kakao 다");
  ok(!tx(fx, "k2") && text.includes("02번 기록을 삭제했어요") && text.includes("커피") && text.includes("복구 02번"), `NEW-4 삭제 답장과 결과는 그대로다 (${text.split("\n")[0]})`);
  const restored = await say(fx, "복구 02번");
  ok(restored.includes("복구했어요") && restored.includes("커피") && tx(fx, "k2")?.amount === 5000, "NEW-4 복구 NN번은 같은 id 로 되살린다");
});
await kakaoFixture(async (fx) => {
  await say(fx, "수정 03번");
  const text = await say(fx, "7");
  const audited = rpc(fx, "accountbook_delete_transaction_v227");
  ok(audited.length === 1 && audited[0].data.p_transaction_id === "k3" && audited[0].data.p_actor_user_id === "user-bin" && audited[0].data.p_actor_kind === "kakao", "NEW-4 메뉴(7번) 삭제도 행위자와 함께 감사 RPC 를 탄다");
  ok(!tx(fx, "k3") && text.includes("삭제했어요"), "NEW-4 메뉴 삭제 결과는 그대로다");
});
await kakaoFixture(async (fx) => {
  let armed = 1;
  const restore = intercept(async ({ url, forward }) => {
    if (armed && url.pathname.endsWith("/accountbook_delete_transaction_v227")) { armed = 0; await forward(); return failure(503, "lost after commit"); }
    return null;
  });
  let text = "";
  try { text = await say(fx, "삭제 02번"); } finally { restore(); }
  ok(text.includes("삭제 결과를 확인하지 못했어요") && text.includes("먼저 확인") && !text.includes("다시 보내주세요"), `NEW-4 T2 응답을 잃은 감사 RPC 삭제는 다시 보내라고 하지 않는다 (${text.split("\n")[0]})`);
  ok(text.includes("커피") && text.includes("복구 02번") && !tx(fx, "k2"), "NEW-4 결과 모르는 삭제 답장이 기록 이름과 복구 방법을 말한다");
  ok((await say(fx, "복구 02번")).includes("커피") && tx(fx, "k2"), "NEW-4 결과 모르는 삭제도 버퍼에 남아 복구된다");
});
await kakaoFixture(async (fx) => {
  const restore = intercept(async ({ url }) => url.pathname.endsWith("/accountbook_delete_transaction_v227") ? failure(400, "transaction_not_found") : null);
  let text = "";
  try { text = await say(fx, "삭제 02번"); } finally { restore(); }
  ok(text.includes("기록을 지우지 않았어요") && text.includes("거절") && tx(fx, "k2"), `NEW-4 저장소가 거절한 삭제는 지우지 않았다고 말한다 (${text.split("\n")[0]})`);
});

// ── NEW-9 카카오 수정의 감사 행위자 ───────────────────────────────────
await kakaoFixture(async (fx) => {
  const text = await say(fx, "수정 01번 금액 13000");
  const calls = rpc(fx, "accountbook_update_transaction_v227");
  eq(calls.length, 1, "NEW-9 한 줄 수정이 감사 RPC 를 한 번 부른다");
  eq(calls[0]?.data?.p_actor_user_id, "user-bin", "NEW-9 수정 감사 기록의 행위자는 요청한 카카오 사용자다");
  eq(calls[0]?.data?.p_actor_kind, "kakao", "NEW-9 수정 감사 기록의 종류는 kakao 다");
  eq(Object.keys(calls[0]?.data?.p_patch || {}).join(","), "amount", "NEW-9 바뀐 칸만 보낸다");
  ok(text.includes("변경했어요") && tx(fx, "k1")?.amount === 13000, "NEW-9 수정 결과는 그대로다");
  await say(fx, "수정 02번");
  await say(fx, "1");
  await say(fx, "7000");
  const second = rpc(fx, "accountbook_update_transaction_v227")[1];
  ok(second?.data?.p_actor_user_id === "user-bin" && second?.data?.p_actor_kind === "kakao" && tx(fx, "k2")?.amount === 7000, "NEW-9 메뉴 경로 수정도 행위자를 남긴다");
});

// ── NEW-8 "50억" ───────────────────────────────────────────────────────
await kakaoFixture(async (fx) => {
  await say(fx, "수정 01번");
  const text = await say(fx, "50억");
  ok(text.includes("금액이 너무 커서 바꾸지 않았어요") && !text.includes("내용을"), `NEW-8 수정 메뉴의 "50억"은 내용이 아니라 금액으로 읽고 상한을 알린다 (${text.split("\n")[0]})`);
  eq(tx(fx, "k1")?.amount, 30000, "NEW-8 상한을 넘는 금액은 바꾸지 않는다");
  ok((await say(fx, "1만3천원")).includes("변경했어요") && tx(fx, "k1")?.amount === 13000, "NEW-8 단위 붙은 금액 표기로 이어서 고칠 수 있다");
  await say(fx, "수정 02번");
  ok((await say(fx, "4")).includes("내용을 무엇으로"), "NEW-8 4번 메뉴는 여전히 내용 입력이다");
  await say(fx, "취소");
});
await kakaoFixture(async (fx) => {
  await say(fx, "예산 설정");
  await say(fx, "전체 월 예산");
  const text = await say(fx, "50억");
  ok(text.includes("금액이 너무 커서 예산을 설정하지 않았어요") && text.includes("2,000,000,000"), `NEW-8 예산 단계의 "50억"은 상한을 알리고 다시 묻는다 (${text.split("\n")[0]})`);
  eq(fx.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.category === "__total")?.amount, 2500000, "NEW-8 예산은 바뀌지 않는다");
  ok((await say(fx, "50만원")).includes("설정할까요"), "NEW-8 상한 안의 금액은 확인 단계로 간다");
  ok((await say(fx, "설정하기")).includes("예산을 설정했어요"), "NEW-8 이어서 설정된다");
  eq(fx.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.category === "__total")?.amount, 500000, "NEW-8 확인한 금액이 저장된다");
  ok((await say(fx, "예산 50억")).includes("금액이 너무 커서 예산을 설정하지 않았어요"), "NEW-8 한 줄 '예산 50억'도 거절한다");
  eq(fx.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.category === "__total")?.amount, 500000, "NEW-8 한 줄 거절은 예산을 바꾸지 않는다");
  ok((await say(fx, "예산 60만원")).includes("예산을 설정했어요"), "NEW-8 상한 안의 한 줄 예산은 그대로 된다");
});

// ── H2 단톡방 참여는 개인 선택을 바꾸지 않는다 ────────────────────────
await kakaoFixture(async (fx) => {
  const group = "qa-room-h2";
  putSetting(fx, kakaoGroupLinkItemSettingsKey(group), JSON.stringify({ group_key: group, household_id: "house-home", household_name: "우리집 생활비" }));
  await say(fx, "초대코드로 참여", { groupKey: group });
  const flowJoin = await say(fx, "TRIP2265", { groupKey: group });
  ok(flowJoin.includes("7월 제주여행"), "H2 단톡방 참여 흐름은 답한다");
  eq(settingValue(fx, "kakao_selected_household_v2251:user-bin"), "house-home", "H2 단톡방 참여 흐름이 1:1 개인 가계부 선택을 바꾸지 않는다");
  const direct = await say(fx, "가계부 참여 TRIP2265", { groupKey: group });
  ok(direct.includes("7월 제주여행"), "H2 단톡방 참여 명령은 답한다");
  eq(settingValue(fx, "kakao_selected_household_v2251:user-bin"), "house-home", "H2 단톡방 참여 명령도 개인 선택을 바꾸지 않는다");
  await say(fx, "가계부 참여 TRIP2265");
  eq(settingValue(fx, "kakao_selected_household_v2251:user-bin"), "house-trip", "H2 1:1 참여는 예전처럼 그 가계부를 선택한다");
});

// ── H3 "가계부 참여 CODE" 한 줄 ────────────────────────────────────────
await kakaoFixture(async (fx) => {
  const text = await say(fx, "가계부 참여 TRIP2265", { user: WIFI });
  ok(!text.includes("초대코드를 입력해 주세요"), `H3 카카오: 초대 문구 한 줄이 참여 흐름 안내로 빠지지 않는다 (${text.split("\n")[0]})`);
  eq(member(fx, "house-trip", "user-wifi")?.role, "pending", "H3 카카오: 그 코드로 바로 참여 요청이 접수된다");
  ok(/승인 대기|참여 요청/.test(text), "H3 카카오: 승인 대기임을 알린다");
  ok((await say(fx, "초대코드로 참여", { user: WIFI })).includes("초대코드를 입력해 주세요"), "H3 코드 없는 참여 명령은 여전히 코드를 묻는다");
});
await fixture(async (fx) => {
  const cookie = await fx.cookieFor("user-wifi");
  const pasted = await post(fx, "/my/join", { invite_code: "가계부 참여 TRIP2265", return_to: "/my/households" }, { cookie });
  ok(pasted.location.includes("msg=approval_pending"), `H3 웹: 초대 문구를 그대로 붙여 넣어도 참여 요청이 접수된다 (${pasted.decoded})`);
  eq(member(fx, "house-trip", "user-wifi")?.role, "pending", "H3 웹: 승인 대기 행이 생긴다");
  const prefixed = await post(fx, "/my/join", { invite_code: "초대코드 trip2265", return_to: "/my/households" }, { cookie });
  ok(prefixed.location.includes("msg=approval_pending"), "H3 웹: '초대코드 code' 소문자도 코드만 읽는다");
  const missing = await post(fx, "/my/join", { invite_code: "가계부 참여 NOPE999", return_to: "/my/households" }, { cookie });
  ok(missing.location.includes("err=invite_code_not_found"), "H3 웹: 없는 코드는 예전처럼 찾지 못했다고 한다");
});

// ── H5 참여자 20명 가계부 삭제 ─────────────────────────────────────────
const bigHousehold = (fx) => {
  fx.db.households.push({ id: "house-big", name: "큰 모임", invite_code: "BIGROOM1", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-big", user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  for (let i = 1; i <= 19; i += 1) {
    fx.db.users.push({ id: `big-user-${i}`, kakao_user_key: `kakao_login:big${i}`, nickname: `참여자${i}`, created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: "house-big", user_id: `big-user-${i}`, role: i % 4 ? "member" : "viewer", created_at: `2026-07-0${1 + (i % 9)}T00:00:00.000Z` });
    if (i % 5 === 0) putSetting(fx, `kakao_selected_household_v2251:big-user-${i}`, "house-big");
  }
  fx.db.transactions.push({ id: "big-tx", household_id: "house-big", user_id: "big-user-1", transaction_date: TODAY, type: "expense", amount: 1000, category: "식비", memo: "회식", payment_method: "현금", source: "my_web", created_at: `${TODAY}T01:00:00.000Z` });
};
await fixture(async (fx) => {
  bigHousehold(fx);
  let calls = 0;
  const restore = intercept(async ({ url }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    calls += 1;
    if (calls > 50) throw new TypeError("synthetic_invocation_subrequest_limit50");
    return null;
  });
  let result = null, error = null;
  try { result = await purgeHouseholdData(fx.env, "house-big"); } catch (err) { error = err; } finally { restore(); }
  ok(!error && result?.deleted, `H5 참여자 20명 가계부가 하위 요청 50회 안에서 지워진다 (${error ? error.message : `${calls} calls`})`);
  ok(calls <= 50, `H5 삭제의 저장소 요청이 50회 이하다 (${calls})`);
  ok(!fx.db.households.some((h) => h.id === "house-big") && !fx.db.transactions.some((t) => t.household_id === "house-big"), "H5 가계부와 기록이 지워졌다");
  eq(fx.db.accountbook_settings.filter((r) => /^kakao_first_record_history_v22928:(?:user-bin|big-user-\d+)$/.test(r.key)).length, 20, "H5 참여자 20명의 표식이 모두 기록된다");
  const leftover = fx.db.accountbook_operation_locks.filter((lock) => Date.parse(lock.locked_until) > Date.now());
  eq(leftover.length, 0, `H5 삭제 뒤 남는 잠금이 없다 (${leftover.map((lock) => lock.operation_key).join(",")})`);
  ok(!fx.db.accountbook_settings.some((r) => r.key.startsWith("kakao_selected_household_v2251:") && String(r.value || "") === "house-big"), "H5 참여자의 선택 상태가 지워진 가계부를 가리키지 않는다");
  eq(rpc(fx, "accountbook_purge_household_v227").length, 1, "H5 purge RPC 는 한 번이다");
});

// ── H6 공동방 준비의 확정 실패는 되돌린다 ─────────────────────────────
const definiteOnce = (matcher) => { let armed = 1; return intercept(async (call) => { if (armed && matcher(call)) { armed = 0; return failure(400, "synthetic definite refusal"); } return null; }); };
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "qa-v22937-skill-secret";
  const key = "group-first-h6-owner", group = "group-first-h6-room";
  const restore = definiteOnce(({ url, method }) => method === "POST" && url.pathname === "/rest/v1/households");
  let first = "";
  try { first = await groupFirstSkill(fx, "커피 4500", { key, group }); } finally { restore(); }
  ok(!first.includes("저장했어요") && first.includes("저장하지 않았어요"), `H6 가계부 생성이 확정 실패하면 저장하지 않았다고 한다 (${first.split("\n")[0]})`);
  const afterFailure = await groupMarker(fx, group);
  eq(afterFailure.marker?.phase, "reserved", "H6 확정 실패 뒤 단계가 reserved 로 되돌아간다");
  const second = await groupFirstSkill(fx, "커피 4600", { key, group });
  ok(second.includes("저장했어요") && second.includes("공동 가계부를 준비했어요"), `H6 다음 메시지가 같은 방을 다시 준비해 저장한다 (${second.split("\n")[0]})`);
  const done = await groupMarker(fx, group);
  ok(done.done?.phase === "complete" && done.done.candidate_id === afterFailure.marker.candidate_id && fx.db.households.some((h) => h.id === afterFailure.marker.candidate_id), "H6 같은 고정 가계부 ID 로 완료한다");
});
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "qa-v22937-skill-secret";
  const key = "group-first-h6-owner2", group = "group-first-h6-room2";
  const restore = definiteOnce(({ url, method, init }) => method === "POST" && url.pathname === "/rest/v1/household_members" && String(init?.body || "").includes('"owner"'));
  try { await groupFirstSkill(fx, "커피 4500", { key, group }); } finally { restore(); }
  eq((await groupMarker(fx, group)).marker?.phase, "create_sent", "H6 소유자 등록이 확정 실패하면 create_sent 로 되돌아간다");
  ok((await groupFirstSkill(fx, "커피 4700", { key, group })).includes("저장했어요"), "H6 소유자 등록 실패 뒤 다음 메시지가 다시 준비해 저장한다");
});
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "qa-v22937-skill-secret";
  const key = "group-first-h6-owner3", group = "group-first-h6-room3";
  const linkKey = kakaoGroupLinkItemSettingsKey(group);
  const restore = definiteOnce(({ url, method, init }) => method === "POST" && url.pathname === "/rest/v1/accountbook_settings" && String(init?.body || "").includes(linkKey));
  try { await groupFirstSkill(fx, "커피 4500", { key, group }); } finally { restore(); }
  eq((await groupMarker(fx, group)).marker?.phase, "owner_sent", "H6 방 연결이 확정 실패하면 owner_sent 로 되돌아간다");
  ok((await groupFirstSkill(fx, "커피 4800", { key, group })).includes("저장했어요"), "H6 연결 실패 뒤 다음 메시지가 다시 연결해 저장한다");
});
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "qa-v22937-skill-secret";
  const key = "group-first-h6-owner4", group = "group-first-h6-room4";
  ok((await groupFirstSkill(fx, "커피 4500", { key, group })).includes("저장했어요"), "H6 방 준비 완료");
  const restore = definiteOnce(({ url, method, init }) => method === "POST" && url.pathname === "/rest/v1/household_members" && String(init?.body || "").includes('"member"'));
  let first = "";
  try { first = await groupFirstSkill(fx, "점심 9000", { key: `${key}-member`, group }); } finally { restore(); }
  ok(!first.includes("저장했어요"), "H6 참여자 등록이 확정 실패하면 저장하지 않는다");
  const second = await groupFirstSkill(fx, "점심 9100", { key: `${key}-member`, group });
  ok(second.includes("저장했어요") && second.includes("참여했어요"), `H6 참여자 등록 실패 뒤 다음 메시지가 참여해 저장한다 (${second.split("\n")[0]})`);
});
await fixture(async (fx) => {
  fx.env.KAKAO_SKILL_SECRET = "qa-v22937-skill-secret";
  const key = "group-first-h6-owner5", group = "group-first-h6-room5";
  let armed = 1;
  const restore = intercept(async ({ url, method }) => { if (armed && method === "POST" && url.pathname === "/rest/v1/households") { armed = 0; throw new TypeError("synthetic network outage"); } return null; });
  try { await groupFirstSkill(fx, "커피 4500", { key, group }); } finally { restore(); }
  eq((await groupMarker(fx, group)).marker?.phase, "create_sent", "H6 결과를 모르는 실패는 예전처럼 단계를 되돌리지 않는다");
});

// ── H7 같은 이름 비교는 소유한 가계부와만 ────────────────────────────
const viewerClub = (fx) => {
  fx.db.households.push({ id: "house-club", name: "동네 독서모임", invite_code: "CLUB2265", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-club", user_id: "user-bin", role: "viewer", created_at: "2026-07-01T00:00:00.000Z" });
};
await fixture(async (fx) => {
  viewerClub(fx);
  const created = await post(fx, "/my/create", { household_name: "동네 독서모임", display_name: "Bin", month: "2026-07" });
  ok(created.location.includes("msg=created") && !created.location.includes("house-club"), `H7 참여만 한 같은 이름 가계부가 있어도 새로 만든다 (${created.decoded})`);
  eq(fx.db.households.filter((h) => h.name === "동네 독서모임").length, 2, "H7 새 가계부 행이 생긴다");
  const duplicate = await post(fx, "/my/create", { household_name: "우리집 생활비", display_name: "Bin", month: "2026-07" });
  ok(duplicate.location.includes("msg=household_duplicate_selected") && duplicate.location.includes("house-home"), "H7 내가 소유한 같은 이름은 여전히 기존 가계부를 선택한다");
});
await kakaoFixture(async (fx) => {
  viewerClub(fx);
  await say(fx, "새 가계부 만들기 동네 독서모임");
  const text = await say(fx, "이 이름으로 만들기");
  ok(text.includes("만들었어요") && !text.includes("이미 있어"), `H7 카카오도 참여만 한 가계부와 비교하지 않는다 (${text.split("\n")[0]})`);
  eq(fx.db.households.filter((h) => h.name === "동네 독서모임").length, 2, "H7 카카오로 새 가계부가 생긴다");
});

// ── H10 초대코드는 소유자·관리자만 ────────────────────────────────────
await kakaoFixture(async (fx) => {
  const memberReply = await say(fx, "초대코드", { user: WIFI });
  ok(!memberReply.includes("HOME2265"), "H10 일반 참여자에게 초대코드를 보여 주지 않는다");
  ok(/소유자.*관리자/.test(memberReply), `H10 소유자·관리자만 볼 수 있다고 안내한다 (${memberReply.split("\n")[0]})`);
  ok((await say(fx, "초대코드 보여줘")).includes("HOME2265"), "H10 소유자는 초대코드를 본다");
  const group = "qa-room-h10";
  putSetting(fx, kakaoGroupLinkItemSettingsKey(group), JSON.stringify({ group_key: group, household_id: "house-home", household_name: "우리집 생활비" }));
  ok(!(await say(fx, "초대 코드", { user: WIFI, groupKey: group })).includes("HOME2265"), "H10 단톡방에서도 일반 참여자에게 코드를 보여 주지 않는다");
  ok((await say(fx, "초대코드 알려줘", { groupKey: group })).includes("HOME2265"), "H10 단톡방의 소유자는 코드를 본다");
  // 선택 전 초대 후보: 참여만 한 가계부는 빠지고 내가 관리하는 가계부만 남는다.
  fx.db.households.push({ id: "house-wifi", name: "WIFI 개인", invite_code: "WIFI2265", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-wifi", user_id: "user-wifi", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  putSetting(fx, "kakao_selected_household_v2251:user-wifi", "");
  const choice = await say(fx, "초대코드 확인", { user: WIFI });
  ok(choice.includes("WIFI 개인") && !choice.includes("우리집 생활비") && !choice.includes("HOME2265"), `H10 초대 후보에는 내가 관리하는 가계부만 남는다 (${choice.split("\n")[0]})`);
  const picked = await say(fx, "1", { user: WIFI });
  ok(picked.includes("WIFI2265") && !picked.includes("HOME2265"), "H10 고른 내 가계부의 코드만 보여 준다");
});

// ── H13 가계부 이름은 거래 문장 정규화를 거치지 않는다 ────────────────
await kakaoFixture(async (fx) => {
  const confirm = await say(fx, "새 가계부 만들기 원정대");
  ok(confirm.includes("가계부 이름: 원정대"), `H13 카카오 만들기 명령이 '원정대'를 그대로 읽는다 (${confirm.split("\n")[0]})`);
  const made = await say(fx, "이 이름으로 만들기");
  ok(made.includes("‘원정대’") && fx.db.households.some((h) => h.name === "원정대"), "H13 '원정대' 그대로 만들어진다");
  await say(fx, "새 가계부 만들기");
  await say(fx, "5");
  await say(fx, "원정대 두번째");
  await say(fx, "이 이름으로 만들기");
  ok(fx.db.households.some((h) => h.name === "원정대 두번째"), "H13 단계형 이름 입력도 그대로다");
});
await fixture(async (fx) => {
  await post(fx, "/my/create", { household_name: "원정대 모임", display_name: "Bin", month: "2026-07" });
  ok(fx.db.households.some((h) => h.name === "원정대 모임"), "H13 웹 만들기도 이름을 그대로 저장한다");
  await post(fx, "/my/household/update", { household_id: "house-trip", household_name: "원정대 여행", month: "2026-07" });
  eq(fx.db.households.find((h) => h.id === "house-trip")?.name, "원정대 여행", "H13 웹 이름 변경도 그대로다");
  const invalid = await post(fx, "/my/create", { household_name: "https://evil.example", display_name: "Bin", month: "2026-07" });
  ok(invalid.location.includes("err=household_name_invalid"), "H13 링크 이름은 여전히 거절한다");
  const symbols = await post(fx, "/my/create", { household_name: 'A"', display_name: "Bin", month: "2026-07" });
  ok(symbols.location.includes("err=household_name_invalid"), "H13 글자·숫자가 둘 미만인 이름은 여전히 거절한다(V22.9.30 보호)");
  await post(fx, "/my/create", { household_name: "2026 (제주) 모임", display_name: "Bin", month: "2026-07" });
  ok(fx.db.households.some((h) => h.name === "2026 (제주) 모임"), "H13 괄호 같은 기호가 섞인 이름은 그대로 저장한다");
});

// ── H14 만들기 폼의 표시 이름은 가계부별 이름표만 바꾼다 ───────────────
await fixture(async (fx) => {
  const created = await post(fx, "/my/create", { household_name: "새살림 장부", display_name: "엄마", month: "2026-07" });
  const household = fx.db.households.find((h) => h.name === "새살림 장부");
  ok(created.location.includes("msg=created") && household, "H14 가계부가 만들어진다");
  eq(fx.db.users.find((u) => u.id === "user-bin")?.nickname, "Bin", "H14 만들기 폼의 표시 이름이 계정 전체 닉네임을 바꾸지 않는다");
  eq(JSON.parse(settingValue(fx, `member_aliases:${household?.id}`) || "{}")["user-bin"], "엄마", "H14 표시 이름은 그 가계부의 내 이름표로만 저장된다");
  eq(JSON.parse(settingValue(fx, "member_aliases:house-home") || "{}")["user-bin"], "Bin", "H14 다른 가계부의 이름표는 그대로다");
  const members = await page(fx, `/my/members?household_id=${encodeURIComponent(household?.id || "")}&month=2026-07`);
  ok(members.html.includes("엄마"), "H14 새 가계부의 참여자 화면에 가계부별 이름이 보인다");
  const home = await page(fx, "/my/members?household_id=house-home&month=2026-07");
  ok(!home.html.includes("엄마") && home.html.includes("Bin"), "H14 기존 가계부 화면에는 이전 이름이 그대로다");
});

// ── H15 승인 대기 중인 사람의 참여 요청 취소 ───────────────────────────
await fixture(async (fx) => {
  fx.db.household_members.push({ household_id: "house-trip", user_id: "user-wifi", role: "pending", created_at: "2026-07-10T00:00:00.000Z" });
  const cookie = await fx.cookieFor("user-wifi");
  const html = (await page(fx, "/my/households?month=2026-07", { cookie })).html;
  ok(html.includes('name="cancel_pending"') && html.includes("참여 요청 취소"), "H15 승인 대기 카드에 참여 요청 취소가 있다");
  const cancelled = await post(fx, "/my/household/leave", { household_id: "house-trip", month: "2026-07", cancel_pending: "1" }, { cookie });
  ok(cancelled.location.includes("msg=join_request_cancelled"), `H15 승인 대기 중인 사람이 참여 요청을 취소한다 (${cancelled.decoded})`);
  ok(!member(fx, "house-trip", "user-wifi"), "H15 내 승인 대기 행만 지운다");
  eq(member(fx, "house-trip", "user-bin")?.role, "owner", "H15 소유자 행은 그대로다");
  eq(member(fx, "house-home", "user-wifi")?.role, "member", "H15 다른 가계부의 참여는 그대로다");
  const asMember = await post(fx, "/my/household/leave", { household_id: "house-home", month: "2026-07", cancel_pending: "1" }, { cookie });
  ok(asMember.location.includes("err=household_leave_ack_required") && member(fx, "house-home", "user-wifi"), "H15 활성 참여자는 취소 경로로 나갈 수 없다(기존 나가기 확인 유지)");
  const after = (await page(fx, "/my/households?month=2026-07&msg=join_request_cancelled", { cookie })).html;
  ok(after.includes("참여 요청을 취소했습니다"), "H15 취소 완료 안내가 보인다");
});
await fixture(async (fx) => {
  fx.db.household_members.push({ household_id: "house-trip", user_id: "user-wifi", role: "pending", created_at: "2026-07-10T00:00:00.000Z" });
  const cookie = await fx.cookieFor("user-wifi");
  const restore = intercept(async ({ url, method }) => method === "DELETE" && url.pathname === "/rest/v1/household_members" ? failure(503, "lost") : null);
  let result;
  try { result = await post(fx, "/my/household/leave", { household_id: "house-trip", month: "2026-07", cancel_pending: "1" }, { cookie }); } finally { restore(); }
  ok(result.location.includes("err=db_write_unknown") && member(fx, "house-trip", "user-wifi")?.role === "pending", "H15 결과를 모르는 취소는 먼저 확인하라고 하고 행은 그대로다");
});
await kakaoFixture(async (fx) => {
  fx.db.household_members = fx.db.household_members.filter((m) => m.user_id !== "user-wifi");
  fx.db.household_members.push({ household_id: "house-trip", user_id: "user-wifi", role: "pending", created_at: "2026-07-10T00:00:00.000Z" });
  putSetting(fx, "kakao_selected_household_v2251:user-wifi", "");
  ok((await say(fx, "이번 달 요약", { user: WIFI })).includes("승인 대기"), "H15 승인 대기 중에는 조회가 막힌다(기존)");
  const text = await say(fx, "참여 취소", { user: WIFI });
  ok(text.includes("참여 요청을 취소했어요") && text.includes("7월 제주여행"), `H15 카카오 '참여 취소'가 내 승인 대기 요청을 지운다 (${text.split("\n")[0]})`);
  ok(!member(fx, "house-trip", "user-wifi") && member(fx, "house-trip", "user-bin")?.role === "owner", "H15 카카오 취소도 내 pending 행만 지운다");
  ok((await say(fx, "참여 요청 취소", { user: WIFI })).includes("취소할 참여 요청이 없어요"), "H15 취소할 요청이 없으면 그렇게 말한다");
});

if (COLLECT) { console.log(`FAILED ${failures.length}/${checks}`); for (const f of failures) console.log(` - ${f}`); }
else console.log(`V22.9.37 감사 묶음 B(카카오·가계부) 통과 (${checks} checks)`);
