// V22.9.79 — 카카오 명령 답장이 실제로 일어난 일을 말하는지 검사한다(V44 A-18·B-8·B-9·B-10, V77 N-4·N-5).
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
//   N-5  이름·역할·만든 날이 같은 가계부는 고르는 목록과 저장 답장에서 구분되지 않았고, 단톡방 기록의 저장 답장은 같은 이름 표시를 아예 하지 않았다.
//
// ── 어떻게 잡는가 ──
//   메모리 픽스처(DB·서버 없음)에서 실제 카카오 스킬 경로(/skill)로 발화를 차례로 보내고, 저장된 행·답장 문구·요청 순서를 함께 확인한다.
//   단톡방은 공식 그룹 챗봇 모양(userRequest.chat)과 Secret 헤더로 보낸다. 잠금 충돌은 잠금 RPC 응답을 가로채 만들고, 방의 상태(만드는 중·해제)는
//   방 표식 설정 행을 넣어 만든다. 네트워크는 쓰지 않는다.
//   V22979_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 확인하는 용도).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { app, BASE, ctx, counter, failure, fixture, intercept, putSetting, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22979_SOFT === "1";
const base = counter("V22.9.79 카카오 명령 답장 검사(오늘 뭐 썼어·복구 안내와 가계부 구분·단톡방 안내·지출자 이름·같은 이름 가계부)");
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

if (SOFT) {
  console.log(`V22979_SOFT: 통과 ${base.done()} · 실패 ${failures.length}`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
