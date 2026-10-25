// V22.9.79 — 카카오 명령 답장이 실제로 일어난 일을 말하는지 검사한다(V44 A-18·B-8·B-9·B-10, V77 N-4·N-5, 그리고 같은 판에서 더 고친 네 가지: 최근 기록 창·
// 조회 전용의 날짜 목록·쓰이지 않던 지출자 datalist·기간을 가리킨 ‘뭐 썼어’).
//
// ── 이 파일이 왜 생겼는지 ──
//   A-18 ‘오늘 뭐 썼어’가 날짜와 상관없는 최근 5건을 보여 줬다(헤더만 ‘최근 입력 내역’). 오늘(KST)의 내 기록을 보여야 한다.
//   B-8  ‘복구’가 잠금 충돌로 못 끝났을 때 "다시 ‘복구’를 입력"하라고 했다. 먼저 보낸 복구가 이미 끝났을 수 있어, 그대로 따르면 더 오래된
//        삭제 기록까지 되살아났다. 번호를 붙인 복구가 실패했을 때도 번호를 떼고 "복구"만 다시 보내게 했다.
//   B-9  두 가계부에서 같은 번호를 지운 뒤 지금 가계부에서 ‘복구 01번’을 보내면, 복구 버퍼(한 사람·한 대화에 하나)가 다른 가계부의 01번을 먼저 잡아
//        지금 가계부의 01번을 되살릴 수 없었다.
//   B-10 단톡방 안내가 방의 실제 상태와 달랐다: 승인 대기 사람에게 "관리자가 승인해야"(실제로는 기록 한 번으로 참여), 나간 이력이 있는 사람에게
//        "기록을 보내면 바로 참여"(실제로는 자동 참여 안 함), 한 번도 연결된 적 없거나 만드는 중인 방에 "삭제됐거나 해제된 방"/"기록하면 만들어져요".
//   N-4  카카오 저장 답장의 ‘지출자:’와 웹 지출자 고르기가 서로 다른 이름 규칙이었다(같은 이름 구성원: 답장 ‘카카오사용자’, 웹 목록 ‘카카오사용자’ ×2,
//        카카오 수정 메뉴 ‘카카오사용자·2’, 요약·정산 ‘카카오사용자 2’).
//   P2   ‘최근 기록’·‘방금 삭제·수정’이 가계부 전체의 최근 20~50건 안에서만 내 기록을 찾았다(그 뒤로 다른 구성원이 많이 저장하면 "내 기록이 없어요").
//        조회 전용(viewer)은 ‘오늘 기록 보기’만 되고 ‘어제 기록 보기’는 막혔다. 아무도 쓰지 않는 지출자 이름 datalist(원래 별명 그대로)가 관리자 화면에 있었다.
//        ‘이번 주·이번 달 뭐 썼어’가 그 기간이 아니라 방금 입력한 5건을 보였다.
//   N-5  이름·역할·만든 날이 같은 가계부는 고르는 목록과 저장 답장에서 구분되지 않았고, 단톡방 기록의 저장 답장은 같은 이름 표시를 아예 하지 않았다.
//
// ── 어떻게 잡는가 ──
//   메모리 픽스처(DB·서버 없음)에서 실제 카카오 스킬 경로(/skill)로 발화를 차례로 보내고, 저장된 행·답장 문구·요청 순서를 함께 확인한다.
//   단톡방은 공식 그룹 챗봇 모양(userRequest.chat)과 Secret 헤더로 보낸다. 잠금 충돌은 잠금 RPC 응답을 가로채 만들고, 방의 상태(만드는 중·해제)는
//   방 표식 설정 행을 넣어 만든다. 네트워크는 쓰지 않는다.
//   픽스처는 PostgREST 의 or=/and= 논리 조건을 무시하고 전부 돌려준다. P2 장면은 그 조건(eq·is.null·중첩 and()/or()·큰따옴표 값)을 흉내 내는 가로채기
//   (emulateOwnerFilter)로 서버가 내 기록만 거르는 것처럼 만들고, 보낸 조건 문자열을 그대로 못 박는다 — 실제 PostgREST 가 이 문법을 받는지는 운영에서 본다.
//   V22979_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 확인하는 용도).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, failure, fixture, intercept, page, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22979_SOFT === "1";
const base = counter("V22.9.79 카카오 명령 답장 검사(오늘 뭐 썼어·복구 안내와 가계부 구분·단톡방 안내·지출자 이름·같은 이름 가계부·최근 기록 창·조회 전용 날짜 목록·기간 질문)");
const failures = [];
const ok = (value, message) => {
  if (value) return base.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);

const DAY = "2026-08-05";
const HH = "house-home";
const TRIP = "house-trip";
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const SECRET = "replies-secret-v22979";
const sha = (value) => createHash("sha256").update(String(value)).digest("hex");

function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

// 카카오 스킬 호출. 같은 발화를 8초 안에 다시 보내면 막는 장치(프로세스 전역)를 매번 비우고, 뒤로 미룬 저장(waitUntil)까지 기다린다.
// fx.env.KAKAO_SKILL_SECRET 이 있으면 Secret 헤더를 실어 확인된 호출로 보낸다(단톡방 첫 기록·자동 참여는 확인된 호출만 한다).
async function say(fx, utterance, { user = BIN, room = "" } = {}) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const headers = { "content-type": "application/json", ...(fx.env.KAKAO_SKILL_SECRET ? { "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET } : {}) };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  await Promise.allSettled(jobs);
  await Promise.allSettled(jobs);
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  const text = (json?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
  return { text, json, raw };
}

const select = (fx, userId, householdId) => putSetting(fx, `kakao_selected_household_v2251:${userId}`, householdId);
const newest = (fx) => fx.db.transactions.at(-1);
const memosOn = (fx, householdId, date = DAY) => fx.db.transactions.filter((row) => row.household_id === householdId && row.transaction_date === date).map((row) => row.memo).join(",");
const listedLines = (text) => text.split("\n").filter((line) => /^\d{2}번 - /.test(line));
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const roleOf = (fx, userId, householdId) => fx.db.household_members.find((m) => m.household_id === householdId && m.user_id === userId)?.role;
const T0 = "2026-07-01T00:00:00.000Z";

// 고정 시계(KST 정오)에서 한 장면을 돈다. 장면마다 새 픽스처에 두 사용자의 가계부 선택을 미리 넣어 둔다.
async function scenario(name, task, { day = DAY, selections = [["user-bin", HH], ["user-wifi", HH]], secret = false } = {}) {
  const run = () => withClock(day, () => fixture(async (fx) => {
    if (secret) fx.env.KAKAO_SKILL_SECRET = SECRET;
    for (const [userId, householdId] of selections) select(fx, userId, householdId);
    await task(fx);
  }));
  if (!SOFT) return run();
  try { await run(); } catch (error) { failures.push(`${name} 장면이 멈춤: ${error?.message || error}`); }
}

// 정확한 순간(오프셋 포함 ISO)에 시계를 맞춘다. KST 자정 직후는 UTC 로는 아직 전날이다.
async function atInstant(iso, task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(iso);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}

// ── A-18. 하루를 가리킨 ‘뭐 썼어’류 조회는 그날(KST)의 내 기록 목록으로 답한다 ─────────────────────────────
await scenario("A-18", async (fx) => {
  await say(fx, "그제 마트 30000");
  await say(fx, "어제 택시 8000");
  await say(fx, "커피 4500");
  await say(fx, "점심 9000");
  await say(fx, "빵 3000", { user: WIFI });
  select(fx, "user-bin", TRIP);
  await say(fx, "렌트카 80000");
  select(fx, "user-bin", HH);
  ok(memosOn(fx, HH, "2026-08-03") === "마트" && memosOn(fx, HH, "2026-08-04") === "택시" && memosOn(fx, HH) === "커피,점심,빵" && memosOn(fx, TRIP) === "렌트카", "A-18 준비: 사흘 치 기록, 다른 구성원의 기록, 다른 가계부의 기록");

  const list = await say(fx, "오늘 기록 보기");
  ok(list.text.includes(`🧾 ${DAY} 기록`) && listedLines(list.text).length === 2, "A-18 준비: ‘오늘 기록 보기’는 오늘 내 기록 두 건");
  for (const phrase of ["오늘 뭐 썼어", "오늘뭐썼어", "오늘 쓴 거", "오늘쓴거", "오늘 기록 보여줘", "오늘 내역 확인해줘", "오늘 뭐 썼는지 알려줘", "@말해가계부 오늘 뭐 썼어"]) {
    const reply = await say(fx, phrase);
    eq(reply.text, list.text, `A-18 ‘${phrase}’는 ‘오늘 기록 보기’와 같은 목록(오늘 KST 의 내 기록, 번호 포함)`);
  }
  const today = (await say(fx, "오늘 뭐 썼어")).text;
  ok(today.includes("01번 - 커피") && today.includes("02번 - 점심") && !/택시|마트|빵|렌트카|최근 입력 내역/.test(today), `A-18 오늘 목록에는 오늘 내 기록만(다른 날·다른 구성원·다른 가계부·최근 5건 말머리 없음) (${today.slice(0, 160)})`);
  const yesterday = (await say(fx, "어제 뭐 썼어")).text;
  ok(yesterday.includes("🧾 2026-08-04 기록") && yesterday.includes("택시") && !/마트|커피|점심|최근 입력 내역/.test(yesterday), "A-18 ‘어제 뭐 썼어’는 어제 기록만");
  const dayBefore = (await say(fx, "그제 뭐 썼어")).text;
  ok(dayBefore.includes("🧾 2026-08-03 기록") && dayBefore.includes("마트") && !/택시|커피|최근 입력 내역/.test(dayBefore), "A-18 ‘그제 뭐 썼어’는 그제 기록만");
  const dated = (await say(fx, "8월 3일 뭐 썼어")).text;
  ok(dated.includes("🧾 2026-08-03 기록") && dated.includes("마트") && !/택시|커피|최근 입력 내역/.test(dated), "A-18 ‘8월 3일 뭐 썼어’도 그날 기록만");
  const empty = (await say(fx, "7월 20일 뭐 썼어")).text;
  ok(empty.includes("🧾 2026-07-20 기록") && empty.includes("아직 기록이 없어요") && listedLines(empty).length === 0 && !/점심|택시|마트|최근 입력 내역/.test(empty), `A-18 기록이 없는 날은 빈 목록 안내(다른 날 기록을 대신 보이지 않는다) (${empty.slice(0, 160)})`);
  const badDate = (await say(fx, "2월 30일 뭐 썼어")).text;
  ok(badDate.includes("달력에 없는 날짜") && !/최근 입력 내역/.test(badDate), "A-18 달력에 없는 날짜는 거절");
  const wifi = (await say(fx, "오늘 뭐 썼어", { user: WIFI })).text;
  ok(wifi.includes("01번 - 빵") && listedLines(wifi).length === 1 && !/커피|점심/.test(wifi), "A-18 다른 구성원은 자기 기록만 본다");
  // 날짜를 가리키지 않은 조회와 여러 날을 말한 조회는 예전처럼 최근 5건이다.
  for (const phrase of ["최근 기록", "내 기록", "마지막", "어제 오늘 뭐 썼어"]) {
    const recent = (await say(fx, phrase)).text;
    ok(recent.includes("🧾 최근 입력 내역") && recent.includes("택시") && recent.includes("마트"), `A-18 ‘${phrase}’는 날짜 없는 최근 입력 내역 그대로`);
  }
});

await scenario("A-18 KST 자정 직후", async (fx) => {
  await atInstant("2026-08-04T23:30:00+09:00", async () => { await say(fx, "야식 7000"); });
  await atInstant("2026-08-05T00:10:00+09:00", async () => {
    await say(fx, "새벽커피 2500");
    ok(memosOn(fx, HH, "2026-08-04") === "야식" && memosOn(fx, HH, "2026-08-05") === "새벽커피", "A-18 준비: 한국 시각 자정 전후로 저장된 기록(서버 UTC 날짜는 아직 전날)");
    const reply = (await say(fx, "오늘 뭐 썼어")).text;
    ok(reply.includes("🧾 2026-08-05 기록") && reply.includes("01번 - 새벽커피") && !reply.includes("야식"), `A-18 ‘오늘’은 KST 날짜다(UTC 날짜가 아니다) (${reply.slice(0, 160)})`);
    const yesterday = (await say(fx, "어제 뭐 썼어")).text;
    ok(yesterday.includes("🧾 2026-08-04 기록") && yesterday.includes("야식") && !yesterday.includes("새벽커피"), "A-18 ‘어제’도 KST 날짜");
  });
});

await scenario("A-18 단톡방", async (fx) => {
  const room = "room-a18";
  const owner = "bot-a18-owner", member = "bot-a18-member";
  const said = (utterance, user) => say(fx, `@말해가계부 ${utterance}`, { user, room });
  await said("점심 30000", owner);
  await said("커피 3000", member);
  await said("어제 택시 8000", member);
  const reply = (await said("오늘 뭐 썼어", member)).text;
  ok(reply.includes(`🧾 ${DAY} 기록`) && reply.includes("01번 - 커피") && listedLines(reply).length === 1 && !/점심|택시|최근 입력 내역/.test(reply), `A-18 단톡방: 그 방 가계부의 오늘 내 기록만 (${reply.slice(0, 200)})`);
  const none = (await said("오늘 뭐 썼어", "bot-a18-newcomer")).text;
  eq(none, "아직 이 방 가계부에 참여 전이에요.\n기록을 한 번 보내면 바로 참여돼요.\n예) @말해가계부 커피 4500원", "A-18 단톡방: 아직 참여하지 않은 사람에게는 이 방 기록을 보이지 않고 참여 전 안내만 한다");
}, { secret: true, selections: [] });

// ── B-8. 복구가 끝나지 않았을 때의 안내: 잠금 충돌이면 먼저 확인, 번호를 붙인 복구는 번호 그대로 ───────────────
// 복구 잠금(복구 버퍼를 읽고-고쳐-쓰는 동안 잡는다)만 이미 다른 요청이 쥐고 있는 것처럼 잠금 RPC 응답을 가로챈다.
const holdUndoLock = () => intercept(async ({ url, init }) => {
  if (!url.pathname.endsWith("/rpc/accountbook_claim_operation")) return null;
  let key = "";
  try { key = JSON.parse(String(init.body || "{}")).p_key || ""; } catch (_) {}
  return key.startsWith("kakao-edit-undo-rmw:") ? new Response(JSON.stringify({ acquired: false }), { status: 200, headers: { "content-type": "application/json" } }) : null;
});
await scenario("B-8", async (fx) => {
  for (const text of ["커피 4500", "점심 9000", "택시 12000"]) await say(fx, text);
  await say(fx, "삭제 03번");
  await say(fx, "삭제 02번");
  eq(memosOn(fx, HH), "커피", "B-8 준비: 택시·점심을 지웠다(복구 버퍼에 둘, 가장 최근 삭제는 점심)");

  const release = holdUndoLock();
  let busyBare, busyNumbered;
  try {
    busyBare = await say(fx, "복구");
    busyNumbered = await say(fx, "복구 03번");
  } finally { release(); }
  eq(memosOn(fx, HH), "커피", "B-8 잠금 충돌 때는 아무것도 되살리지 않는다");
  ok(!busyBare.text.includes("다시 ‘복구’를 입력"), `B-8 잠금 충돌 답장이 "다시 ‘복구’를 입력"하라고 하지 않는다 (${busyBare.text.slice(0, 200)})`);
  ok(busyBare.text.includes("처리하지 않았어요") && busyBare.text.includes("‘오늘기록’") && busyBare.text.includes("다른 삭제 기록까지 되살아날 수 있어요"), "B-8 먼저 되살아났는지 확인하라고 하고, 확인 없이 다시 보내면 다른 기록까지 되살아난다고 알린다");
  ok(busyNumbered.text.includes("‘복구 03번’을 다시 보내") && !busyNumbered.text.includes("다시 ‘복구’를 입력"), `B-8 번호를 붙인 복구의 잠금 충돌 답장은 번호까지 그대로 다시 보내라고 한다 (${busyNumbered.text.slice(0, 200)})`);

  // 번호를 붙인 복구가 (잠금이 아닌 이유로) 끝나지 않으면: 어느 기록인지 말하고, 안내한 말 그대로 다시 보내면 그 기록이 한 번만 되살아난다.
  fx.db.__fail_transaction_writes = 1;
  const failed = await say(fx, "복구 03번");
  ok(failed.text.includes("복구가 잠시 지연") && failed.text.includes("복구하려던 기록: 03번 - 택시"), `B-8 복구가 지연되면 어느 기록을 되살리려던 것인지 적는다 (${failed.text.slice(0, 200)})`);
  eq(memosOn(fx, HH), "커피", "B-8 지연된 복구는 기록을 만들지 않았다");
  const advice = (failed.text.match(/‘(복구[^’]*)’[을를] 다시 보내/) || [])[1];
  eq(advice, "복구 03번", "B-8 안내하는 다시 보낼 말은 번호까지 그대로다(번호를 떼면 가장 최근 삭제가 되살아난다)");
  const followed = await say(fx, advice || "복구"); // 안내를 글자 그대로 따른다
  ok(followed.text.includes("복구했어요") && followed.text.includes("택시"), "B-8 안내대로 다시 보내면 그 기록이 되살아난다");
  eq(memosOn(fx, HH), "커피,택시", "B-8 안내를 따라도 택시 한 건만 되살아나고 점심은 그대로 지워져 있다");
  // 번호 없는 "복구"가 지연되면 같은 말 "복구"를 다시 보내라고 하고, 그러면 같은 기록이 한 번만 되살아난다.
  fx.db.__fail_transaction_writes = 1;
  const bareFailed = await say(fx, "복구");
  ok(bareFailed.text.includes("복구가 잠시 지연") && bareFailed.text.includes("복구하려던 기록: 02번 - 점심") && bareFailed.text.includes("‘복구’를 다시 보내"), "B-8 번호 없는 복구가 지연되면 되살리려던 기록(점심)과 같은 말을 다시 보내라는 안내");
  await say(fx, "복구");
  eq(memosOn(fx, HH), "커피,택시,점심", "B-8 다시 보낸 복구는 점심을 한 번만 되살린다");
});

// ── B-9. 두 가계부에서 같은 번호를 지워도 지금 가계부의 번호를 되살린다 ───────────────────────────────────────
await scenario("B-9", async (fx) => {
  await say(fx, "커피 4500");
  const coffee = newest(fx);
  await say(fx, "삭제 01번");
  select(fx, "user-bin", TRIP);
  await say(fx, "렌트카 80000");
  const rental = newest(fx);
  await say(fx, "삭제 01번");
  select(fx, "user-bin", HH);
  ok(!fx.db.transactions.some((row) => row.id === coffee.id || row.id === rental.id), "B-9 준비: 두 가계부에서 각각 01번을 지웠다(복구 버퍼 하나에 둘 다 01번)");

  const bare = await say(fx, "복구");
  ok(bare.text.includes("7월 제주여행") && bare.text.includes("되살리지 않았어요") && !fx.db.transactions.some((row) => row.id === coffee.id || row.id === rental.id), "B-9 번호 없는 복구는 가장 최근 삭제가 다른 가계부 것이면 되살리지 않고 안내한다(예전과 같음)");
  const here = await say(fx, "복구 01번");
  ok(here.text.includes("복구했어요") && here.text.includes("01번 - 커피"), `B-9 지금 가계부의 ‘복구 01번’은 이 가계부에서 지운 01번을 되살린다 (${here.text.slice(0, 200)})`);
  eq(fx.db.transactions.find((row) => row.id === coffee.id)?.household_id, HH, "B-9 되살린 기록은 원래 가계부·원래 id 그대로");
  ok(!fx.db.transactions.some((row) => row.id === rental.id) && !here.text.includes("렌트카") && !here.text.includes("7월 제주여행"), "B-9 다른 가계부의 기록은 되살리지도, 답장에 보이지도 않는다");
  select(fx, "user-bin", TRIP);
  const there = await say(fx, "복구 01번");
  ok(there.text.includes("복구했어요") && there.text.includes("렌트카") && fx.db.transactions.find((row) => row.id === rental.id)?.household_id === TRIP, "B-9 다른 가계부에서는 그쪽 01번이 되살아난다(버퍼에 남아 있었다)");
  ok(!there.text.includes("커피"), "B-9 그쪽 답장에 이쪽 가계부 기록이 없다");
});

await scenario("B-9 지금 가계부에서 지운 번호 안내", async (fx) => {
  await say(fx, "커피 4500");
  await say(fx, "점심 9000");
  const lunch = newest(fx);
  await say(fx, "삭제 02번");
  select(fx, "user-bin", TRIP);
  await say(fx, "렌트카 80000");
  await say(fx, "삭제 01번");
  select(fx, "user-bin", HH);
  const bare = await say(fx, "복구");
  ok(bare.text.includes("이 기록은 ‘7월 제주여행’에서 지웠어요") && bare.text.includes("‘복구 02번’으로 되살릴 수 있어요"), `B-9 다른 가계부 기록이라 되살리지 않았을 때, 지금 가계부에서 지운 기록의 번호도 알려 준다 (${bare.text.slice(0, 240)})`);
  const mine = await say(fx, "복구 02번");
  ok(mine.text.includes("복구했어요") && fx.db.transactions.find((row) => row.id === lunch.id)?.household_id === HH, "B-9 안내한 번호로 지금 가계부의 기록이 되살아난다");
});

// ── B-10. 단톡방 안내는 방의 실제 상태를 따른다 ────────────────────────────────────────────────────────────
const departedMarker = (householdId) => ({ version: 1, households: { [sha(householdId)]: true } });
await scenario("B-10 연결된 방의 승인 대기·참여 전", async (fx) => {
  const room = "room-b10";
  const owner = "bot-b10-owner";
  const said = (utterance, user) => say(fx, `@말해가계부 ${utterance}`, { user, room });
  await said("점심 30000", owner);
  const hid = newest(fx).household_id;
  const person = (key, name) => { fx.db.users.push({ id: `u-${key}`, kakao_user_key: key, nickname: name, created_at: T0 }); return `u-${key}`; };
  const membership = (userId, householdId, role) => fx.db.household_members.push({ household_id: householdId, user_id: userId, role, created_at: "2026-07-02T00:00:00.000Z" });
  const pendingId = person("bot-b10-pending", "대기자");
  membership(pendingId, hid, "pending");
  membership(pendingId, TRIP, "pending"); // 같은 사람이 다른 가계부에도 승인 대기 중이다(방과 관계없는 가계부)
  const pendingDepartedId = person("bot-b10-pending-departed", "나간대기자");
  membership(pendingDepartedId, hid, "pending");
  putSetting(fx, `kakao_group_departed_v22931:${sha(pendingDepartedId)}`, JSON.stringify(departedMarker(hid)));
  const outsiderDepartedId = person("bot-b10-outsider-departed", "나간사람");
  putSetting(fx, `kakao_group_departed_v22931:${sha(outsiderDepartedId)}`, JSON.stringify(departedMarker(hid)));

  // 승인 대기: 이 방 가계부는 승인 없이 기록 한 번이면 참여한다 — 안내가 그렇게 말하고, 실제로 그렇게 된다.
  for (const command of ["이번 달 요약", "오늘 기록 보기", "남은 예산"]) {
    const reply = (await said(command, "bot-b10-pending")).text;
    ok(!reply.includes("승인해야") && !reply.includes("승인 대기 중입니다") && reply.includes("승인 없이 기록을 한 번 보내면 바로 참여돼요"), `B-10 승인 대기 사람에게 "관리자가 승인해야"라고 하지 않는다: ‘${command}’ (${reply.slice(0, 160)})`);
    ok(!reply.includes("7월 제주여행"), `B-10 방과 관계없는 가계부(내가 승인 대기 중인 다른 가계부)의 이름을 방에 보이지 않는다: ‘${command}’`);
  }
  const info = (await said("단톡방 정보", "bot-b10-pending")).text;
  ok(info.includes("내 권한: 승인대기") && info.includes("이 방에서 거래를 한 번 보내면 바로 참여해요"), `B-10 ‘단톡방 정보’도 승인 대기 사람에게 기록 한 번으로 참여한다고 말한다 (${info.slice(0, 200)})`);
  const joined = (await said("음료 1500", "bot-b10-pending")).text;
  eq(roleOf(fx, pendingId, hid), "member", "B-10 안내한 대로 기록 한 번에 구성원이 된다");
  ok(joined.includes("참여했어요") && joined.includes("음료"), "B-10 그 기록도 저장된다");

  // 나간 이력이 있는 승인 대기: 자동 참여가 없으니 승인을 기다려야 한다고 말하고, 실제로 참여되지 않는다.
  const departedPending = (await said("이번 달 요약", "bot-b10-pending-departed")).text;
  ok(departedPending.includes("나간 이력") && departedPending.includes("승인해야 기록할 수 있어요") && !departedPending.includes("바로 참여돼요"), `B-10 나간 이력이 있는 승인 대기 사람에게는 승인이 필요하다고 말한다 (${departedPending.slice(0, 200)})`);
  const countBefore = fx.db.transactions.length;
  await said("음료 1600", "bot-b10-pending-departed");
  ok(roleOf(fx, pendingDepartedId, hid) === "pending" && fx.db.transactions.length === countBefore, "B-10 그 말대로 기록해도 참여되지 않고 저장되지 않는다");

  // 참여 전: 일반은 예전 문구 그대로, 나간 이력이 있으면 자동 참여가 없다고 말한다.
  const stranger = (await said("이번 달 요약", "bot-b10-stranger")).text;
  eq(stranger, "아직 이 방 가계부에 참여 전이에요.\n기록을 한 번 보내면 바로 참여돼요.\n예) @말해가계부 커피 4500원", "B-10 처음 온 사람의 안내는 예전과 같다");
  const departedOutsider = (await said("이번 달 요약", "bot-b10-outsider-departed")).text;
  ok(departedOutsider.includes("나간 이력") && departedOutsider.includes("자동으로 참여하지 않아요") && !departedOutsider.includes("바로 참여돼요"), `B-10 나간 이력이 있는 사람에게 "기록을 보내면 바로 참여돼요"라고 하지 않는다 (${departedOutsider.slice(0, 200)})`);
  const infoDeparted = (await said("단톡방 정보", "bot-b10-outsider-departed")).text;
  ok(infoDeparted.includes("나간 이력") && !infoDeparted.includes("자동으로 참여해요"), "B-10 ‘단톡방 정보’도 나간 이력이 있으면 자동 참여를 약속하지 않는다");
  const before = fx.db.transactions.length;
  await said("음료 1700", "bot-b10-outsider-departed");
  ok(roleOf(fx, outsiderDepartedId, hid) === undefined && fx.db.transactions.length === before, "B-10 그 말대로 기록해도 참여되지 않는다");
}, { secret: true, selections: [] });

await scenario("B-10 연결 없는 방의 상태", async (fx) => {
  const marker = (room, phase) => putSetting(fx, `kakao_group_first_v22931:${sha(room)}`, JSON.stringify({ version: 1, group_key: room, owner_id: "u-nobody", candidate_id: "11111111-1111-4111-8111-111111111111", phase, created_at: new Date().toISOString() }));
  const retire = (room) => putSetting(fx, `kakao_group_first_retired_v22931:${sha(room)}`, JSON.stringify({ version: 1, group_hash: sha(room) }));
  marker("room-b10-preparing", "create_sent");
  retire("room-b10-retired");
  const asks = async (room) => {
    const out = {};
    for (const command of ["오늘 기록 보기", "단톡방 정보", "시작"]) out[command] = (await say(fx, `@말해가계부 ${command}`, { user: "bot-b10-asker", room })).text;
    return out;
  };
  const never = await asks("room-b10-never");
  for (const [command, text] of Object.entries(never)) ok(!text.includes("어디에도 저장하지 않았어요") && !text.includes("삭제됐거나") && !text.includes("만드는 중"), `B-10 한 번도 연결된 적 없는 방: ‘${command}’ 답이 기록을 저장하지 않았다거나 삭제·해제·만드는 중이라고 하지 않는다`);
  ok(never["오늘 기록 보기"].includes("기록하면 이 방 가계부가 바로 만들어져요") && never["시작"].includes("첫 기록을 보내면 바로 만들어져요"), "B-10 한 번도 연결된 적 없는 방은 기록하면 만들어진다고 말한다(예전과 같음)");
  const preparing = await asks("room-b10-preparing");
  for (const [command, text] of Object.entries(preparing)) ok(text.includes("만드는 중") && !text.includes("바로 만들어져요") && !text.includes("삭제됐거나"), `B-10 가계부를 만드는 중인 방: ‘${command}’ 답이 만드는 중이라고 말한다 (${text.slice(0, 120)})`);
  const retired = await asks("room-b10-retired");
  for (const [command, text] of Object.entries(retired)) ok(text.includes("자동으로 다시 만들지 않아요") && !text.includes("바로 만들어져요") && !text.includes("만드는 중"), `B-10 해제·삭제된 방: ‘${command}’ 답이 자동으로 다시 만들지 않는다고 말한다 (${text.slice(0, 120)})`);
  ok(retired["단톡방 정보"].includes("삭제됐거나 연결이 해제된 방"), "B-10 해제된 방의 ‘단톡방 정보’는 삭제·해제를 말한다");
}, { secret: true, selections: [] });

await scenario("B-10 확인되지 않은 호출의 기록", async (fx) => {
  // Secret 이 없는 호출은 방 가계부를 만들지 못한다. 기록은 저장되지 않고, 안내는 방의 실제 상태를 말해야 한다.
  const marker = (room, phase) => putSetting(fx, `kakao_group_first_v22931:${sha(room)}`, JSON.stringify({ version: 1, group_key: room, owner_id: "u-nobody", candidate_id: "11111111-1111-4111-8111-111111111111", phase, created_at: new Date().toISOString() }));
  marker("room-b10-u-preparing", "create_sent");
  putSetting(fx, `kakao_group_first_retired_v22931:${sha("room-b10-u-retired")}`, JSON.stringify({ version: 1, group_hash: sha("room-b10-u-retired") }));
  const before = fx.db.transactions.length;
  const never = (await say(fx, "@말해가계부 커피 4500원", { user: BIN, room: "room-b10-u-never" })).text;
  ok(never.includes("이 방에는 아직 가계부가 없어") && never.includes("어디에도 저장하지 않았어요") && !never.includes("삭제됐거나"), `B-10 한 번도 연결된 적 없는 방에 "삭제됐거나 해제된 방"이라고 하지 않는다 (${never.slice(0, 160)})`);
  const preparing = (await say(fx, "@말해가계부 커피 4500원", { user: BIN, room: "room-b10-u-preparing" })).text;
  ok(preparing.includes("만드는 중이라 방금 기록은 아직 저장하지 않았어요") && !preparing.includes("삭제됐거나"), `B-10 가계부를 만드는 중인 방은 만드는 중이라고 말한다 (${preparing.slice(0, 160)})`);
  const retired = (await say(fx, "@말해가계부 커피 4500원", { user: BIN, room: "room-b10-u-retired" })).text;
  ok(retired.includes("삭제됐거나 연결이 해제된 방이라 방금 기록은 어디에도 저장하지 않았어요"), "B-10 해제·삭제된 방은 예전 문구 그대로");
  eq(fx.db.transactions.length, before, "B-10 세 방 모두 기록은 저장되지 않았다");
});

// ── N-4. 저장 답장의 지출자 이름 = 웹 지출자 목록·요약·정산·카카오 수정 메뉴의 이름 ─────────────────────────────
await scenario("N-4", async (fx) => {
  const room = "room-n4";
  const keys = ["bot-n4-a", "bot-n4-b", "bot-n4-c"];
  const said = (utterance, user) => say(fx, `@말해가계부 ${utterance}`, { user, room });
  const payerLine = (text) => text.split("\n").find((line) => line.startsWith("지출자:")) || "";
  const first = await said("장보기 30000", keys[0]);
  eq(payerLine(first.text), "지출자: 카카오사용자", "N-4 혼자일 때 첫 입력자의 이름은 그대로 ‘카카오사용자’");
  const second = await said("커피 5000", keys[1]);
  const third = await said("과자 1000", keys[2]);
  const hid = newest(fx).household_id;
  const [a, b, c] = keys.map((key) => userByKey(fx, key)?.id);
  eq(payerLine(second.text), "지출자: 카카오사용자 2", "N-4 같은 이름 둘째의 저장 답장은 요약·정산과 같은 ‘카카오사용자 2’");
  eq(payerLine(third.text), "지출자: 카카오사용자 3", "N-4 셋째는 ‘카카오사용자 3’");

  const summary = (await said("이번 달 요약", keys[0])).text;
  ok(summary.includes("• 카카오사용자 2: 5,000원") && summary.includes("• 카카오사용자 3: 1,000원"), "N-4 준비: 요약의 지출자 이름");
  // 웹 날짜 시트의 지출자 고르기(/u/api/day-transactions 의 members)와 같은 날 목록의 지출자(items.member)
  const response = await app.fetch(new Request(`${BASE}/u/api/day-transactions?date=${DAY}&household_id=${encodeURIComponent(hid)}`, { headers: { cookie: await fx.cookieFor(a), accept: "application/json" } }), fx.env, ctx);
  const day = await response.json();
  const webLabel = (uid) => (day.members || []).find((member) => member.user_id === uid)?.nickname;
  eq((day.members || []).map((member) => member.nickname).join("/"), "카카오사용자 1/카카오사용자 2/카카오사용자 3", `N-4 웹 날짜 시트의 지출자 고르기가 같은 이름이라 같은 이름 구성원도 구별해 고를 수 있다(예전: 셋 다 ‘카카오사용자’)`);
  eq((day.items || []).map((item) => item.member).sort().join("/"), "카카오사용자 1/카카오사용자 2/카카오사용자 3", "N-4 같은 날 목록의 지출자 이름과 지출자 고르기가 같은 규칙");
  eq(`지출자: ${webLabel(b)}`, payerLine(second.text), "N-4 카카오 저장 답장의 지출자 = 웹 지출자 고르기의 같은 사람 이름");
  eq(`지출자: ${webLabel(c)}`, payerLine(third.text), "N-4 셋째도 같다");
  // 카카오 수정 메뉴의 지출자 고르기도 같은 이름(예전: ‘카카오사용자·2’)
  const menu = (await said("수정 01번 지출자", keys[0])).text;
  ok(menu.includes("1. 카카오사용자 1  2. 카카오사용자 2  3. 카카오사용자 3") && !menu.includes("·2"), `N-4 카카오 수정 메뉴의 지출자 고르기도 같은 이름 (${menu.slice(0, 160)})`);
  await said("취소", keys[0]);
  // 별명은 그대로 우선한다.
  putSetting(fx, `member_aliases:${hid}`, JSON.stringify({ [c]: "엄마" }));
  const aliased = await said("우유 2000", keys[2]);
  eq(payerLine(aliased.text), "지출자: 엄마", "N-4 별명이 있으면 별명(웹도 별명)");
  const day2 = await (await app.fetch(new Request(`${BASE}/u/api/day-transactions?date=${DAY}&household_id=${encodeURIComponent(hid)}`, { headers: { cookie: await fx.cookieFor(a), accept: "application/json" } }), fx.env, ctx)).json();
  eq((day2.members || []).find((member) => member.user_id === c)?.nickname, "엄마", "N-4 웹 지출자 고르기도 별명");
}, { secret: true, selections: [] });

await scenario("N-4 응답 경로의 조회", async (fx) => {
  const MEMBERS_READ = "GET household_members?household_id";
  // 이름이 겹칠 일이 드문 사람(별명을 정한 Bin)의 한 건 저장은 예전과 같은 요청만 한다 — 구성원 명단을 읽지 않는다.
  const log = [];
  const release = intercept(async ({ url, method }) => { log.push(`${method} ${url.pathname.split("/").slice(-1)[0]}${url.search.includes("household_id=eq") ? "?household_id" : ""}`); return null; });
  try {
    const named = await say(fx, "커피 4500");
    ok(named.text.includes("지출자: Bin"), "N-4 1:1 저장 답장의 지출자는 별명 그대로(Bin)");
    eq(log.filter((entry) => entry === MEMBERS_READ).length, 0, "N-4 별명이 있는 사람의 한 건 저장은 구성원 명단을 읽지 않는다(응답 경로의 요청 수가 그대로)");
    // 별명도 저장된 이름도 없어 기본 이름(‘카카오사용자’)인 사람은 같은 이름의 구성원과 겹칠 수 있다 — 번호를 매기려고 명단을 한 번 읽는다.
    fx.db.users.push({ id: "u-n4-default", kakao_user_key: "kakao_login:3001", nickname: "카카오사용자", created_at: T0 });
    fx.db.household_members.push({ household_id: HH, user_id: "u-n4-default", role: "member", created_at: "2026-07-03T00:00:00.000Z" });
    fx.db.users.push({ id: "u-n4-default2", kakao_user_key: "kakao_login:3002", nickname: "카카오사용자", created_at: T0 });
    fx.db.household_members.push({ household_id: HH, user_id: "u-n4-default2", role: "member", created_at: "2026-07-04T00:00:00.000Z" });
    select(fx, "u-n4-default", HH);
    select(fx, "u-n4-default2", HH);
    log.length = 0;
    const single = await say(fx, "빵 3000", { user: "kakao_login:3002" });
    ok(single.text.includes("지출자: 카카오사용자 2"), `N-4 기본 이름 사람의 저장 답장은 같은 이름 구성원과 구별한 이름이다 (${single.text.slice(0, 200)})`);
    eq(log.filter((entry) => entry === MEMBERS_READ).length, 1, "N-4 그 사람의 한 건 저장은 구성원 명단을 한 번만 더 읽는다(별명 설정은 다시 읽지 않는다)");
    ok(log.indexOf(MEMBERS_READ) < log.indexOf("POST transactions"), "N-4 그 조회는 저장을 기다리지 않고 저장 전에 던져 둔다(순차 단계가 늘지 않는다)");
    log.length = 0;
    await say(fx, "빵 3000\n우유 2500", { user: "kakao_login:3002" });
    eq(log.filter((entry) => entry === MEMBERS_READ).length, 0, "N-4 지출자 줄이 없는 여러 건 저장은 명단을 읽지 않는다");
  } finally { release(); }
  // 명단을 읽지 못해도 저장 답장은 예전 이름으로 나간다.
  const broken = intercept(async ({ url, method }) => (method === "GET" && url.pathname.endsWith("/household_members") && url.search.includes("household_id=eq")) ? failure(400, "simulated members failure") : null);
  try {
    const fallback = await say(fx, "택시 9000", { user: "kakao_login:3002" });
    ok(fallback.text.includes("저장했어요") && fallback.text.includes("지출자: 카카오사용자"), `N-4 명단 조회가 실패해도 저장 답장은 예전 이름으로 나간다 (${fallback.text.slice(0, 160)})`);
  } finally { broken(); }
}, { selections: [["user-bin", HH]] });

// ── N-5. 이름·역할·만든 날이 같은 가계부 구분 ────────────────────────────────────────────────────────────
const twinBook = (id, createdAt, extra = {}) => ({ id, name: "우리집 생활비", invite_code: id.toUpperCase().replace(/-/g, "").slice(0, 8), created_at: createdAt, ...extra });
await scenario("N-5 목록과 저장 답장", async (fx) => {
  // 우리집 생활비 3개, 모두 소유자, 모두 7월 1일(KST)에 만들었다: 09:05(둘, 5초 차) · 09:40
  const home = fx.db.households.find((h) => h.id === HH);
  home.created_at = "2026-07-01T00:40:00.000Z";
  fx.db.households.push(twinBook("house-twin-a", "2026-07-01T00:05:00.000Z"), twinBook("house-twin-b", "2026-07-01T00:05:05.000Z"));
  for (const id of ["house-twin-a", "house-twin-b"]) fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-02T00:00:00.000Z" });
  const chooser = (await say(fx, "가계부 전환")).text;
  const lines = chooser.split("\n").filter((line) => /^\d\. 우리집 생활비 · /.test(line));
  const tag = (line) => line.replace(/^\d\. 우리집 생활비 · /, "");
  eq(lines.length, 3, `N-5 준비: 같은 이름 가계부 셋이 목록에 있다 (${chooser.slice(0, 300)})`);
  eq(new Set(lines.map(tag)).size, 3, "N-5 세 가계부가 목록에서 서로 다른 줄로 보인다(예전: 소유자 · 만든 날 2026-07-01 이 셋)");
  ok(lines.some((line) => tag(line) === "소유자 · 만든 날 2026-07-01 09:40"), "N-5 만든 날까지 같으면 만든 시각(KST)을 붙인다");
  const sameMinute = lines.map(tag).filter((item) => item.startsWith("소유자 · 만든 날 2026-07-01 09:05"));
  ok(sameMinute.length === 2 && sameMinute.includes("소유자 · 만든 날 2026-07-01 09:05 · 1/2") && sameMinute.includes("소유자 · 만든 날 2026-07-01 09:05 · 2/2"), `N-5 시각까지 같으면 만든 순서(1/2·2/2)를 붙인다 (${sameMinute.join(" | ")})`);
  ok(chooser.includes("이름·역할·만든 날이 같은 가계부가 있어요. 웹 ‘가계부 관리’에서 이름을 바꾸면 구분하기 쉬워요"), "N-5 이름을 바꾸라는 안내 한 줄");
  await say(fx, "취소"); // 목록을 연 채로 두면 다음 발화(기록)를 고르는 말로 읽는다
  // 저장 답장의 ‘가계부:’ 줄 = 목록 줄 꼴
  const savedFor = async (id) => { select(fx, "user-bin", id); return (await say(fx, `커피 ${4000 + id.length}`)).text.split("\n").find((line) => line.startsWith("가계부:")) || ""; };
  eq(await savedFor(HH), "가계부: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:40", "N-5 저장 답장의 가계부 줄이 목록과 같은 꼴(시각 포함)");
  eq(await savedFor("house-twin-a"), "가계부: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05 · 1/2", "N-5 같은 시각의 첫째");
  eq(await savedFor("house-twin-b"), "가계부: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05 · 2/2", "N-5 같은 시각의 둘째");
  // 번호로 고르면 확인 문구가 어느 쪽인지 말한다(역할만 다르면 예전처럼 역할만).
  await say(fx, "가계부 전환");
  const line940 = lines.find((line) => tag(line) === "소유자 · 만든 날 2026-07-01 09:40");
  const picked = (await say(fx, line940.slice(0, 1))).text;
  ok(picked.includes("‘우리집 생활비’(소유자 · 만든 날 2026-07-01 09:40) 가계부를 선택했어요"), `N-5 선택 확인 문구가 어느 가계부인지 말한다 (${picked.slice(0, 160)})`);
});

await scenario("N-5 역할이 다르면 예전 꼴, 만든 날은 KST", async (fx) => {
  fx.db.households.push({ id: "house-trip-2", name: "7월 제주여행", invite_code: "TRIP0002", created_at: "2026-07-01T20:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-trip-2", user_id: "user-bin", role: "member", created_at: "2026-07-05T00:00:00.000Z" });
  const chooser = (await say(fx, "가계부 전환")).text;
  const lines = chooser.split("\n").filter((line) => /^\d\. 7월 제주여행 · /.test(line));
  ok(lines.some((line) => line.endsWith("· 소유자 · 만든 날 2026-07-01")) && lines.some((line) => line.endsWith("· 구성원 · 만든 날 2026-07-02")), `N-5 역할이 다르면 시각을 붙이지 않고, 만든 날은 한국 날짜다(UTC 7월 1일 20시 = KST 7월 2일 05시) (${lines.join(" | ")})`);
  ok(!chooser.includes("이름을 바꾸면"), "N-5 역할이 달라 구분되는 목록에는 이름 바꾸기 안내를 붙이지 않는다");
  await say(fx, "취소");
  select(fx, "user-bin", "house-trip-2");
  const saved = (await say(fx, "택시 9000")).text;
  ok(saved.split("\n").includes("가계부: 7월 제주여행 · 구성원 · 만든 날 2026-07-02"), "N-5 저장 답장도 한국 날짜");
});

await scenario("N-5 단톡방 연결 선택", async (fx) => {
  const room = "room-n5-bind";
  fx.db.households.find((h) => h.id === HH).created_at = "2026-07-01T00:40:00.000Z";
  fx.db.households.push(twinBook("house-twin-a", "2026-07-01T00:05:00.000Z", { invite_code: "TWINA001" }));
  fx.db.household_members.push({ household_id: "house-twin-a", user_id: "user-bin", role: "owner", created_at: "2026-07-02T00:00:00.000Z" });
  const linked = (await say(fx, "단톡방 연결 TWINA001", { room })).text;
  ok(linked.includes("단톡방 연결 완료"), "N-5 준비: 방을 09:05 의 우리집 생활비에 연결했다");
  // 초대코드로 다른 쪽(09:40)을 연결하려 할 때의 확인 글도 현재와 바꿀 가계부를 구별한다.
  const replace = (await say(fx, "단톡방 연결 HOME2265", { room })).text;
  ok(replace.includes("현재: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05") && replace.includes("변경: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:40"), `N-5 초대코드로 연결을 바꿀 때의 확인 글이 현재와 바꿀 가계부를 구별한다 (${replace.slice(0, 260)})`);
  await say(fx, "취소", { room });
  const chooser = (await say(fx, "단톡방연결", { room })).text;
  ok(chooser.includes("현재 연결: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05"), "N-5 가계부를 고르는 글의 ‘현재 연결’ 줄도 어느 쪽인지 말한다");
  ok(chooser.includes("우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05") && chooser.includes("우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:40") && chooser.includes("이름을 바꾸면"), `N-5 단톡방에서 가계부를 고르는 목록도 같은 이름 둘을 시각으로 구별한다 (${chooser.slice(0, 260)})`);
  const number = (chooser.split("\n").find((line) => line.includes("09:40")) || "").slice(0, 1);
  const confirm = (await say(fx, number, { room })).text;
  ok(confirm.includes("현재: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:05") && confirm.includes("변경: 우리집 생활비 · 소유자 · 만든 날 2026-07-01 09:40"), `N-5 연결을 바꿀지 묻는 글이 현재와 바꿀 가계부를 구별한다(예전: 이름만 둘) (${confirm.slice(0, 260)})`);
});

await scenario("N-5 단톡방 기록의 저장 답장", async (fx) => {
  const room = "room-n5-record";
  const said = (utterance, user) => say(fx, `@말해가계부 ${utterance}`, { user, room });
  const homeLine = (text) => text.split("\n").find((line) => line.startsWith("가계부:")) || "";
  fx.db.households.find((h) => h.id === HH).created_at = "2026-07-01T00:40:00.000Z";
  const linked = (await say(fx, "단톡방 연결 HOME2265", { room, user: BIN })).text;
  ok(linked.includes("단톡방 연결 완료"), "N-5 준비: 방을 우리집 생활비에 연결했다");
  // 새 참여자는 자기 개인 가계부도 ‘우리집 생활비’라고 지었다.
  fx.db.users.push({ id: "u-n5-z", kakao_user_key: "bot-n5-z", nickname: "제트", created_at: T0 });
  fx.db.households.push({ id: "house-z", name: "우리집 생활비", invite_code: "ZBOOK001", created_at: "2026-07-09T03:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-z", user_id: "u-n5-z", role: "owner", created_at: "2026-07-09T03:00:00.000Z" });
  const joined = (await said("커피 3000", "bot-n5-z")).text;
  eq(roleOf(fx, "u-n5-z", HH), "member", "N-5 준비: 새 참여자가 이 방 가계부에 참여해 첫 기록을 저장했다");
  eq(homeLine(joined), "가계부: 우리집 생활비 · 구성원 · 만든 날 2026-07-01", `N-5 단톡방 새 참여자의 첫 기록 저장 답장도 어느 ‘우리집 생활비’인지 밝힌다(내 다른 ‘우리집 생활비’는 소유자·7월 9일) (${joined.slice(0, 260)})`);
  ok(!joined.includes("2026-07-09") && !joined.includes("ZBOOK001"), "N-5 그 답장에 방과 관계없는 개인 가계부의 정보는 없다");
  const again = (await said("빵 2000", "bot-n5-z")).text;
  eq(homeLine(again), "가계부: 우리집 생활비 · 구성원 · 만든 날 2026-07-01", "N-5 이미 참여한 사람의 방 기록 답장도 같다");
  // 같은 날 같은 역할로 참여한 같은 이름의 다른 가계부가 있으면 시각까지 붙여 구별한다.
  fx.db.users.push({ id: "u-n5-v", kakao_user_key: "bot-n5-v", nickname: "브이", created_at: T0 });
  fx.db.households.push({ id: "house-v", name: "우리집 생활비", invite_code: "VBOOK001", created_at: "2026-07-01T00:20:00.000Z" });
  fx.db.household_members.push({ household_id: "house-v", user_id: "u-n5-v", role: "member", created_at: "2026-07-01T00:20:00.000Z" });
  const sameDay = (await said("우유 2500", "bot-n5-v")).text;
  eq(homeLine(sameDay), "가계부: 우리집 생활비 · 구성원 · 만든 날 2026-07-01 09:40", `N-5 역할·만든 날이 같은 다른 ‘우리집 생활비’가 내 목록에 있으면 만든 시각까지 붙인다 (${sameDay.slice(0, 200)})`);
  // 같은 이름이 없으면 이름만(예전과 같다)
  const alone = (await said("점심 9000", "bot-n5-w")).text;
  eq(homeLine(alone), "가계부: 우리집 생활비", "N-5 같은 이름의 가계부가 없는 사람의 답장은 이름만(예전과 같다)");
}, { secret: true, selections: [] });

// ═════════════════════════════════════════════════════════════════════════════════════════════
// 조정 요청(2026-10-25)으로 더한 네 항목: 최근 기록 창(P2)·조회 전용의 날짜 목록·쓰이지 않는 지출자 목록 코드·기간 질문
// ═════════════════════════════════════════════════════════════════════════════════════════════

// PostgREST 의 논리 조건을 흉내 낸다 — or=/and= 목록, 중첩 and(...)/or(...), eq·is.null, 큰따옴표로 감싼 값(\" 와 \\ 이스케이프). 픽스처는 or/and 를
// 무시하고 조건이 없는 것처럼 전부 돌려주므로, 서버가 내 기록만 거른 뒤 limit 을 거는 것처럼 보이게 해야 "limit 이 내 기록에만 걸린다"를 볼 수 있다.
function parsePostgrestLogic(source) {
  let i = 0;
  const fail = () => { throw new Error(`논리 조건을 읽지 못함(${i}번째): ${source}`); };
  const list = () => {
    if (source[i] !== "(") fail();
    i += 1;
    const items = [];
    for (;;) {
      items.push(item());
      if (source[i] === ",") { i += 1; continue; }
      if (source[i] === ")") { i += 1; return items; }
      fail();
    }
  };
  const item = () => {
    const group = /^(and|or)\(/.exec(source.slice(i));
    if (group) { i += group[1].length; return { op: group[1], items: list() }; }
    const leaf = /^([a-z_]+)\.(eq|is)\./.exec(source.slice(i));
    if (!leaf) fail();
    i += leaf[0].length;
    let value = "";
    if (source[i] === "\"") {
      i += 1;
      while (i < source.length && source[i] !== "\"") { if (source[i] === "\\") i += 1; value += source[i]; i += 1; }
      if (source[i] !== "\"") fail();
      i += 1;
    } else {
      while (i < source.length && source[i] !== "," && source[i] !== ")") { value += source[i]; i += 1; }
    }
    return { column: leaf[1], op: leaf[2], value };
  };
  const tree = list();
  if (i !== source.length) fail();
  return tree;
}
// SQL 처럼: null 은 eq 와 같지 않고, is.null 만 null 과 같다.
const logicMatches = (node, row) => node.items
  ? (node.op === "and" ? node.items.every((child) => logicMatches(child, row)) : node.items.some((child) => logicMatches(child, row)))
  : node.op === "is" ? (node.value === "null" ? row[node.column] == null : String(row[node.column]) === node.value)
    : (row[node.column] != null && String(row[node.column]) === node.value);

// transactions 조회에 or=/and= 가 있으면 위 규칙으로 거르고 order(created_at 내림차순)·limit 을 적용해 돌려준다. trace 에는 모든 transactions 조회를 적는다.
function emulateOwnerFilter(fx, trace = []) {
  const emulate = intercept(async ({ url, method }) => {
    if (method !== "GET" || !url.pathname.endsWith("/rest/v1/transactions")) return null;
    const orSource = url.searchParams.get("or");
    const andSource = url.searchParams.get("and");
    if (!orSource && !andSource) return null;
    const tree = parsePostgrestLogic(orSource || andSource);
    const household = String(url.searchParams.get("household_id") || "").replace(/^eq\./, "");
    const rows = fx.db.transactions
      .filter((row) => row.household_id === household && (orSource ? tree.some((node) => logicMatches(node, row)) : tree.every((node) => logicMatches(node, row))))
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
      .slice(0, Number(url.searchParams.get("limit")));
    return new Response(JSON.stringify(JSON.parse(JSON.stringify(rows))), { status: 200, headers: { "content-type": "application/json" } });
  });
  const log = intercept(async ({ url, method }) => {
    if (method === "GET" && url.pathname.endsWith("/rest/v1/transactions")) trace.push({ limit: url.searchParams.get("limit"), or: url.searchParams.get("or"), and: url.searchParams.get("and"), date: url.searchParams.get("transaction_date"), id: url.searchParams.get("id") });
    return null;
  });
  return () => { log(); emulate(); };
}

// ── P2. 최근 기록(‘최근 기록’·‘내 기록’·‘마지막’, ‘방금 삭제·수정’)은 같은 가계부의 다른 사람이 20건 넘게 저장한 뒤에도 내 기록을 찾는다 ───────────
// 예전에는 가계부 전체의 최근 max(20, 5×개수)건을 읽은 뒤 내 것만 걸러서 내 기록이 창 밖이면 "아직 내가 기록한 내역이 없어요"가 나왔다.
const OTHER_KEY = "kakao_login:9999";
const OWNER_FILTER = "(source_user_key.eq.\"kakao_login:2265\",and(user_id.eq.\"user-bin\",or(source_user_key.is.null,source_user_key.eq.\"\")))";
const txRow = (id, memo, createdAt, extra = {}) => ({ id, household_id: HH, user_id: "user-bin", type: "expense", amount: 1100, category: "기타지출", memo, payment_method: "", transaction_date: DAY, source: "kakao_skill", source_user_key: BIN, raw_text: memo, created_at: createdAt, ...extra });
const recentMemos = (text) => [...text.matchAll(/^\d+\. \d{4}-\d{2}-\d{2} (?:지출|수입) [\d,]+원 · (.+)$/gm)].map((match) => match[1]);
await scenario("P2 최근 기록 창", async (fx) => {
  fx.db.transactions.push(
    txRow("p2-b1", "내커피1", "2026-08-05T01:00:01.000Z"), txRow("p2-b2", "내커피2", "2026-08-05T01:00:02.000Z"), txRow("p2-b3", "내커피3", "2026-08-05T01:00:03.000Z"),
    txRow("p2-web", "웹점심", "2026-08-05T01:00:00.000Z", { source: "web", source_user_key: null }), // 웹에서 쓴 내 기록: 카카오 키 없음 → 사용자 id 로 내 것
    txRow("p2-empty", "빈키", "2026-08-05T00:59:00.000Z", { source_user_key: "" }),                    // 빈 문자열 키도 키 없음
    txRow("p2-other", "다른키", "2026-08-05T01:30:00.000Z", { source_user_key: OTHER_KEY }),           // 같은 사용자 id 지만 다른 카카오 키 → 내 기록이 아니다
  );
  for (let n = 0; n < 60; n += 1) fx.db.transactions.push(txRow(`p2-w${n}`, `남의기록${n}`, new Date(Date.UTC(2026, 7, 5, 2, 0, 0, n)).toISOString(), { user_id: "user-wifi", source_user_key: WIFI }));
  const trace = [];
  const release = emulateOwnerFilter(fx, trace);
  try {
    for (const phrase of ["최근 기록", "내 기록", "마지막"]) {
      trace.length = 0;
      const recent = (await say(fx, phrase)).text;
      eq(recentMemos(recent).join("/"), "내커피3/내커피2/내커피1/웹점심/빈키", `P2 ‘${phrase}’는 남이 60건 더 저장한 뒤에도 내 기록 5건을 최근 순으로 보인다(다른 키·남의 기록 제외) (${recent.slice(0, 160)})`);
      eq(trace.length, 1, `P2 ‘${phrase}’의 transactions 조회는 한 번 그대로다`);
      eq(trace[0]?.limit, "5", `P2 ‘${phrase}’는 limit 5 를 서버가 내 기록에만 건다(예전: 가계부 전체 50건)`);
    }
    eq(trace[0]?.or, OWNER_FILTER, "P2 서버 조건: 내 카카오 키가 같거나, 키가 비어 있고 사용자 id 가 나인 기록(isKakaoRowOwnedByRequester 와 같은 규칙)");
    // 방금 고치기·지우기도 내 가장 최근 기록을 찾는다.
    trace.length = 0;
    const edit = await say(fx, "방금 금액 7000");
    eq(trace.filter((entry) => !entry.date && !entry.id).length, 1, "P2 ‘방금 금액’의 최근 기록 조회도 한 번이다");
    ok(fx.db.transactions.find((row) => row.id === "p2-b3")?.amount === 7000 && fx.db.transactions.find((row) => row.id === "p2-w59")?.amount === 1100, `P2 ‘방금 금액 7000’은 남이 60건 더 저장한 뒤에도 내 가장 최근 기록(내커피3)만 고친다 (${edit.text.slice(0, 160)})`);
    trace.length = 0;
    const deleted = await say(fx, "방금 삭제");
    eq(trace.filter((entry) => !entry.date && !entry.id)[0]?.limit, "1", "P2 ‘방금 삭제’는 limit 1 을 내 기록에 건다(예전: 가계부 전체 20건)");
    ok(deleted.text.includes("삭제했어요") && deleted.text.includes("내커피3") && !fx.db.transactions.some((row) => row.id === "p2-b3") && fx.db.transactions.filter((row) => row.id.startsWith("p2-w") && row.id !== "p2-web").length === 60, `P2 ‘방금 삭제’는 내 가장 최근 기록을 지운다 (${deleted.text.slice(0, 160)})`);
    const restored = await say(fx, "복구");
    ok(restored.text.includes("복구했어요") && fx.db.transactions.some((row) => row.id === "p2-b3"), "P2 지운 기록은 복구된다");
  } finally { release(); }
  // 다른 사람이 보면 그 사람 기록이 나온다(서버 조건이 사람마다 다르다).
  const wifiTrace = [];
  const wifiRelease = emulateOwnerFilter(fx, wifiTrace);
  try {
    const wifi = (await say(fx, "최근 기록", { user: WIFI })).text;
    ok(recentMemos(wifi).length === 5 && recentMemos(wifi).every((memo) => memo.startsWith("남의기록")) && !wifi.includes("내커피"), "P2 다른 구성원의 ‘최근 기록’은 그 사람의 기록만");
    ok(wifiTrace[0]?.or?.includes("kakao_login:2266") && wifiTrace[0]?.or?.includes("user-wifi") && !wifiTrace[0]?.or?.includes("kakao_login:2265"), "P2 서버 조건은 요청한 사람의 키·사용자 id 로 만든다");
  } finally { wifiRelease(); }
});

await scenario("P2 서버 조건을 거절하면 예전 조회로", async (fx) => {
  fx.db.transactions.push(txRow("p2f-1", "내것1", "2026-08-05T01:00:01.000Z"), txRow("p2f-2", "내것2", "2026-08-05T01:00:02.000Z"), txRow("p2f-3", "남의것", "2026-08-05T01:00:03.000Z", { user_id: "user-wifi", source_user_key: WIFI }));
  const trace = [];
  const reject = intercept(async ({ url, method }) => (method === "GET" && url.pathname.endsWith("/rest/v1/transactions") && (url.searchParams.get("or") || url.searchParams.get("and"))) ? failure(400, "simulated filter rejected") : null);
  const logOnly = intercept(async ({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/rest/v1/transactions")) trace.push({ limit: url.searchParams.get("limit"), filtered: !!(url.searchParams.get("or") || url.searchParams.get("and")) }); return null; });
  try {
    const recent = (await say(fx, "최근 기록")).text;
    ok(recentMemos(recent).slice(0, 2).join("/") === "내것2/내것1" && !recent.includes("남의것"), `P2 서버가 조건을 거절(4xx)해도 예전 조회로 한 번 더 읽어 내 기록을 보인다 (${recent.slice(0, 160)})`);
    eq(trace.map((entry) => `${entry.filtered ? "조건" : "예전"}:${entry.limit}`).join(","), "조건:5,예전:50", "P2 거절되면 조건 조회 한 번 + 예전 조회(가계부 전체 50건) 한 번");
    ok((globalThis.__AB_OPS_EVENTS || []).some((event) => event.kind === "kakao_recent_owner_filter_rejected"), "P2 거절은 운영 이벤트로 남는다(조용히 두 번 읽는 채로 남지 않는다)");
    trace.length = 0;
  } finally { logOnly(); reject(); }
  // 서버 오류(5xx)·시간 초과는 가리지 않는다: 두 번째 조회 없이 안전 안내로 끝난다.
  const down = intercept(async ({ url, method }) => (method === "GET" && url.pathname.endsWith("/rest/v1/transactions") && url.searchParams.get("or")) ? failure(503, "simulated outage") : null);
  const trace2 = [];
  const logOnly2 = intercept(async ({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/rest/v1/transactions") && url.searchParams.get("limit")) trace2.push(url.searchParams.get("limit")); return null; });
  try {
    const failed = (await say(fx, "최근 기록")).text;
    ok(!failed.includes("🧾 최근 입력 내역") && !recentMemos(failed).length, "P2 5xx 는 최근 기록처럼 보이는 답을 내지 않는다");
    eq(trace2.join(","), "5", "P2 5xx 는 예전 조회로 숨기지 않는다(한 번만 시도)");
  } finally { logOnly2(); down(); }
});

// ── 조회 전용(viewer)도 날짜가 붙은 기록 목록을 본다. 쓰는 길은 그대로 닫혀 있다 ───────────────────────────────────
await scenario("조회 전용의 날짜 목록", async (fx) => {
  const wifiMember = fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi");
  fx.db.transactions.push(txRow("v-old", "옛빵", "2026-08-04T03:00:00.000Z", { user_id: "user-wifi", source_user_key: WIFI, transaction_date: "2026-08-04", amount: 3300 }));
  // 이름 입력 흐름을 연 채로 조회 전용이 된 구성원(다른 사람이 권한을 바꿨다): 열려 있던 흐름이 날짜 목록 말을 이름으로 삼키지 않아야 한다.
  await say(fx, "내 이름 설정", { user: WIFI });
  wifiMember.role = "viewer";
  const aliasBefore = settingValue(fx, `member_aliases:${HH}`);
  const staleFlow = (await say(fx, "어제 기록 보기", { user: WIFI })).text;
  ok(staleFlow.includes("🧾 2026-08-04 기록") && staleFlow.includes("01번 - 옛빵"), `조회 전용 ‘어제 기록 보기’는 열려 있던 이름 입력 흐름을 끊고 목록을 보인다 (${staleFlow.slice(0, 160)})`);
  eq(settingValue(fx, `member_aliases:${HH}`), aliasBefore, "조회 전용 구성원의 이름은 바뀌지 않았다(날짜 목록 말이 이름으로 저장되지 않는다)");
  const stillBlocked = (await say(fx, "민지민지", { user: WIFI })).text;
  ok(stillBlocked.includes("조회 전용 권한입니다") && settingValue(fx, `member_aliases:${HH}`) === aliasBefore, "조회 전용이 보낸 이름 말은 막혀 있고 이름은 그대로");

  for (const [phrase, expect] of [["어제 기록 보기", "🧾 2026-08-04 기록"], ["어제 내역", "🧾 2026-08-04 기록"], ["어제 뭐 썼어", "🧾 2026-08-04 기록"], ["8월 4일 기록 보기", "🧾 2026-08-04 기록"], ["2026-08-04 기록", "🧾 2026-08-04 기록"], ["그제 기록 보기", "🧾 2026-08-03 기록"], ["7월 3일 기록 보기", "🧾 2026-07-03 기록"], ["오늘 기록 보기", `🧾 ${DAY} 기록`]]) {
    const reply = (await say(fx, phrase, { user: WIFI })).text;
    ok(reply.includes(expect) && !reply.includes("조회 전용 권한입니다"), `조회 전용 ‘${phrase}’는 날짜 목록을 본다 (${reply.slice(0, 100)})`);
  }
  const summary = (await say(fx, "이번 달 요약", { user: WIFI })).text;
  ok(summary.includes("📊 이번 달 요약"), "조회 전용의 요약 조회는 그대로");

  // 쓰는 길은 여전히 닫혀 있다: 조회 전용 안내가 나가고 아무 데이터도 바뀌지 않는다.
  const snapshot = () => JSON.stringify([fx.db.transactions, fx.db.household_members, fx.db.accountbook_budgets, fx.db.accountbook_recurring,
    fx.db.accountbook_settings.filter((row) => /^(member_aliases|household_member_policy_v22943|budgets|reserve_plans|payment_assets|kakao_edit_undo_v4|kakao_edit_v4)/.test(String(row.key)))]);
  const before = snapshot();
  for (const text of ["커피 4500", "어제 점심 9000", "수정 01번 금액 100", "어제 수정 01번 금액 100", "삭제 01번", "어제 삭제 01번", "복구", "복구 01번", "방금 삭제", "방금 금액 7000", "지출자 변경",
    "예산 설정", "식비 예산 30만원", "내 이름 설정", "구성원 권한 기록만", "별도 구매 추가 커피 4500"]) {
    const reply = (await say(fx, text, { user: WIFI })).text;
    ok(reply.includes("조회 전용 권한입니다"), `조회 전용 ‘${text}’는 막힌다 (${reply.slice(0, 80)})`);
  }
  eq(snapshot(), before, "조회 전용이 보낸 쓰는 말들 뒤에도 기록·구성원·예산·정기·별명·권한·복구 버퍼가 그대로다");
});

// ── 지출자 이름 목록 속 쓰이지 않는 datalist 는 지웠다(웹 날짜 시트·수정 폼의 지출자 고르기는 memberNameMap 이름을 쓴다) ─────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = "replies-admin-v22979";
  fx.env.ADMIN_SESSION_SECRET = "replies-admin-session-v22979";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD, return_to: "/?legacy=1" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  const dashboard = await page(fx, `/?legacy=1&household_id=${HH}`, { cookie: admin });
  eq(dashboard.status, 200, "옛 관리자 화면은 관리자 세션으로 200");
  ok(dashboard.html.includes("<datalist id=\"categoryList\">") && dashboard.html.includes("<datalist id=\"paymentList\">"), "옛 관리자 화면의 분류·결제수단 datalist 는 그대로");
  ok(!dashboard.html.includes("spenderNameList"), "옛 관리자 화면에 아무도 쓰지 않던 지출자 이름 datalist(원래 별명 그대로)가 없다");
  const bundle = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  ok(!bundle.includes("spenderNameList") && !bundle.includes("renderSpenderDatalist"), "번들에 지출자 datalist 도우미가 남지 않았다(서버·클라이언트 자산 어디에도 참조가 없었다)");
});

// ── 기간을 가리킨 ‘뭐 썼어’는 최근 5건이 아니라 그 기간의 요약으로 답한다 ──────────────────────────────────────────
await scenario("기간 질문", async (fx) => {
  await say(fx, "7월 30일 병원 15000"); // 지난 주(7/27~8/2)
  await say(fx, "그제 마트 30000");      // 이번 주(8/3~8/9) 월요일
  await say(fx, "어제 택시 8000");
  await say(fx, "커피 4500");
  await say(fx, "점심 9000");
  const strip = (text) => text.replace(/\n\n상세 분석 보기\n\S+$/, ""); // 첫 요약에만 붙는 ‘상세 분석 보기’ 링크(24시간에 한 번)는 비교에서 뺀다
  for (const [ask, summary, header, expense] of [
    ["이번 주 뭐 썼어", "이번 주 요약", "📊 이번 주 요약", "지출: 51,500원 · 4건"],
    ["이번주 뭐썼어", "이번 주 요약", "📊 이번 주 요약", "지출: 51,500원 · 4건"],
    ["이번 주에 뭐 썼어요", "이번 주 요약", "📊 이번 주 요약", "지출: 51,500원 · 4건"],
    ["이번 달 뭐 썼어", "이번 달 요약", "📊 이번 달 요약", "지출: 51,500원 · 4건"],
    ["이번 달 뭐 썼어?", "이번 달 요약", "📊 이번 달 요약", "지출: 51,500원 · 4건"],
    ["이번 달 뭐 썼는지 알려줘", "이번 달 요약", "📊 이번 달 요약", "지출: 51,500원 · 4건"],
    ["이번 달 쓴 거", "이번 달 요약", "📊 이번 달 요약", "지출: 51,500원 · 4건"],
    ["지난주 뭐 썼어", "지난주 요약", "📊 지난 주 요약", "지출: 15,000원 · 1건"],
    ["저번 주 뭐 썼어", "지난주 요약", "📊 지난 주 요약", "지출: 15,000원 · 1건"],
    ["지난달 쓴 거", "지난달 요약", "📊 7월 요약", "지출: 263,600원 · 4건"],
  ]) {
    const expected = strip((await say(fx, summary)).text);
    const reply = strip((await say(fx, ask)).text);
    ok(reply === expected && reply.includes(header) && reply.includes(expense) && !reply.includes("최근 입력 내역"), `기간 질문 ‘${ask}’는 ‘${summary}’와 같은 기간 요약으로 답한다(${header}, ${expense}) (${reply.slice(0, 90)})`);
  }
  // 하루를 가리킨 말은 그날 기록 목록, 기간 없는 말은 최근 5건 그대로.
  ok((await say(fx, "오늘 뭐 썼어")).text.includes(`🧾 ${DAY} 기록`), "하루를 가리킨 ‘오늘 뭐 썼어’는 그날 기록 목록 그대로");
  const recent = (await say(fx, "최근 기록")).text;
  ok(recent.includes("🧾 최근 입력 내역") && recentMemos(recent).length === 5, "‘최근 기록’은 최근 5건 그대로");
  // 기간을 읽지 못한 말은 이번 달로 바꿔 답하지 않는다(예전과 같다).
  ok(!(await say(fx, "저저번달 뭐 썼어")).text.includes("📊 이번 달 요약"), "읽지 못한 기간을 이번 달 요약으로 바꾸지 않는다");
});

if (SOFT) {
  console.log(`V22979_SOFT: 통과 ${base.done()} · 실패 ${failures.length}`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
