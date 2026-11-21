// 함께 고치는 가계부(운영자 2026-11-21 — 물음 창에서 ‘구성원 누구나’, 그날 시험 단톡방의 M-11).
//  N-2 번호는 그날 가계부 기록 전체의 순서다(누가 보내도 같은 기록을 가리킨다). 구성원은 채팅과 웹에서 다른 사람의 기록도 고치고 지운다.
//      그대로인 것: 구성원 권한이 ‘기록만’ 이면 구성원은 새 기록만 남긴다, 지출자(수입자) 바꾸기는 소유자·관리자만, 조회 전용은 바꾸지 못한다,
//      ‘방금’ 은 내 기록이다, 복구는 지운 사람이 한다(되돌리기 목록은 지운 사람마다 따로), 다른 가계부의 기록은 건드리지 못한다.
//      ‘오늘기록’ 은 가계부 모두의 기록이고, 다른 사람의 기록이 있으면 줄 끝 괄호에 지출자(수입은 수입자) 이름을 적는다(이름은 0.8초까지만 기다린다).
//      지우거나 고치거나 되살린 답의 기록 줄에도 그 기록의 지출자 이름을 적는다. 그날 첫 기록의 요약 단추는 ‘내 그날 첫 기록’ 에 붙는다(번호가 01번이 아니어도).
//      웹 저장의 J-9 조건(그 사이 지출자가 바뀌면 저장하지 않음)은 ‘지출자 = 읽은 지출자’ 로 건다(예전에는 ‘= 나’ — 남의 기록이면 늘 충돌이 났다).
//  M-11 단톡방 수정 창의 ‘무엇을 바꿀까요? 번호를 보내주세요.’ 처럼 번호로 답하라는 줄에는 봇 부르기 예시(‘예: @말해가계부 1’)를 붙인다.
//      단톡방에서는 번호만 보내면 봇에 닿지 않는다(시험 단톡방 2026-11-21). 1:1 답은 그대로다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음). 판 이름 글자는 적지 않는다. 바탕 코드(이 판 앞)에서는 N-2·M-11 단언 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, intercept, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { kakaoGroupCompatibleResponse, kakaoText } from "../src/modules/kakao/response-builders.js";

const { ok, eq, done } = counter("함께 고치는 가계부: 가계부 전체 번호 · 구성원이 다른 사람의 기록도 고치고 지움(채팅·웹) · 단톡방 번호 물음의 봇 부르기 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 420)}`); } };
const read = (path) => { try { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); } catch (_) { return ""; } };
const key = (label) => createHash("sha256").update(`v229135-shared-edit-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229135-shared-edit-secret";
const DAY = "2026-11-20";
const BOT = "@말해가계부";
const HEAD = "구성원 모두의 기록이에요 · 괄호 안은 지출자(수입은 수입자)";
const BIN = "kakao_login:2265", WIFI = "kakao_login:2266"; // 픽스처 ‘우리집 생활비’ 의 소유자(user-bin, Bin)·구성원(user-wifi, WIFI♥)
const HH = "house-home";
const MONTH = "2026-07";
const IF_RPC = "accountbook_delete_transaction_if_v22988";
const V227_DELETE = "accountbook_delete_transaction_v227";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

// 단톡방(room 이 있으면)·1:1 채팅의 한마디. 답의 글(말풍선을 이어서), 줄, 말풍선 단추·바로가기 이름을 돌려준다.
async function say(fx, utterance, { user = key("u1"), room = "" } = {}) {
  for (const name of ["__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const started = Date.now();
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const data = await response.json().catch(() => ({}));
  const ms = Date.now() - started;
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const outputs = data?.template?.outputs || [];
  const bubbles = outputs.map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || "").filter(Boolean);
  const buttons = [...outputs.flatMap((o) => (o.textCard?.buttons || []).map((button) => button.label)), ...(data?.template?.quickReplies || []).map((reply) => reply.label)];
  return { status: response.status, ms, text: bubbles.join("\n"), lines: bubbles.join("\n").split("\n"), buttons };
}
async function scene(name, task, { day = DAY } = {}) {
  try {
    await withClock(day, () => fixture(async (fx) => {
      resetIsolateState();
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
      putSetting(fx, "kakao_selected_household_v2251:user-wifi", HH);
      try { await task(fx); } finally { resetIsolateState(); }
    }, { auditDeletes: true, auditUpdates: true }));
  } catch (error) { failures.push(`장면 ‘${name}’ 이 끝까지 가지 못함: ${String(error?.stack || error).split(/\r?\n/).slice(0, 2).join(" | ").slice(0, 300)}`); }
}
const userByKey = (fx, userKey) => fx.db.users.find((user) => user.kakao_user_key === userKey);
const rowOf = (fx, id) => fx.db.transactions.find((row) => String(row.id) === String(id)) || null;
const rowsOn = (fx, householdId, day) => fx.db.transactions.filter((row) => row.household_id === householdId && row.transaction_date === day);
const byMemo = (fx, householdId, memo) => fx.db.transactions.find((row) => row.household_id === householdId && String(row.memo || "") === memo) || null;
const numbered = (reply) => reply.lines.filter((line) => /^\d{2,3}번 - /.test(line));
// 단톡방 사람 이름을 정한다(방에서 처음 말한 사람은 이름 없이 만들어진다). 이름 목록은 말할 때마다 다시 읽는다.
function rename(fx, userKey, nickname) {
  const user = userByKey(fx, userKey);
  if (user) user.nickname = nickname;
  resetIsolateState();
  return user;
}

// ── N-2 가. 단톡방: 가계부 전체 번호와 이름 ─────────────────────────────────────────────
await scene("단톡방 가계부 전체 번호", async (fx) => {
  const room = key("room-numbers"), A = key("a"), B = key("b");
  const first = await say(fx, "점심 12000원", { user: A, room });
  check(() => ok(first.text.includes("01번 - 점심 / 12,000원"), `N-2 방의 첫 기록은 01번(${first.lines.find((line) => line.includes("번 - ")) || first.text.slice(0, 80)})`), "first number");
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  rename(fx, A, "민지");
  const mine = await say(fx, "오늘기록", { user: A, room });
  check(() => ok(numbered(mine).length === 1 && /^01번 - 점심 \/ 12,000원 \/ [^()]+$/.test(numbered(mine)[0]) && !mine.text.includes("구성원 모두의 기록이에요") && !mine.text.includes("내 기록만 보여요"), `N-2 내 기록만 있는 날은 이름·머리 줄 없이 예전 모양(${numbered(mine).join(" | ")})`), "all mine list");
  const second = await say(fx, "커피 4500원", { user: B, room });
  check(() => ok(second.text.includes("02번 - 커피 / 4,500원") && !second.text.includes("01번 - 커피"), `N-2 다른 사람의 첫 기록은 그날 가계부 순서로 02번(${second.lines.find((line) => line.includes("번 - ")) || second.text.slice(0, 120)})`), "second person number");
  check(() => ok(second.lines.includes(`삭제: "${BOT} 삭제 02번"`), "N-2 저장 답의 삭제 안내도 그 번호(02번)"), "second person hint");
  rename(fx, B, "준호");
  const third = await say(fx, "택시 8000원", { user: A, room });
  check(() => ok(third.text.includes("03번 - 택시 / 8,000원"), `N-2 같은 사람의 둘째 기록도 그날 가계부 순서로 03번(${third.lines.find((line) => line.includes("번 - ")) || ""})`), "third number");
  for (const [who, label] of [[A, "소유자"], [B, "구성원"]]) {
    const list = await say(fx, "오늘기록", { user: who, room });
    const rows = numbered(list);
    check(() => ok(rows.length === 3 && /^01번 - 점심 \/ 12,000원 \/ .+ \(민지\)$/.test(rows[0]) && /^02번 - 커피 \/ 4,500원 \/ .+ \(준호\)$/.test(rows[1]) && /^03번 - 택시 \/ 8,000원 \/ .+ \(민지\)$/.test(rows[2]), `N-2 ${label}의 ‘오늘기록’: 가계부 모두의 기록을 번호순으로, 줄 끝에 지출자 이름(${rows.join(" | ")})`), `list rows ${label}`);
    check(() => ok(list.lines.includes(HEAD) && list.lines.indexOf(HEAD) < list.lines.indexOf(rows[0]) && !list.text.includes("내 기록만 보여요"), `N-2 ${label}의 목록 머리에 ‘${HEAD}’`), `list head ${label}`);
    check(() => ok(list.lines.includes(`수정: "${BOT} 수정 01번" 또는 "${BOT} 수정 01번 금액 13000"`) && list.lines.includes(`삭제: "${BOT} 삭제 01번"`), `N-2 ${label}의 목록 끝 수정·삭제 안내(봇 부르기)`), `list hints ${label}`);
  }
  check(() => ok(householdId && rowsOn(fx, householdId, DAY).length === 3, "픽스처: 방 가계부에 그날 기록 셋"), "fixture three rows");
  // 없는 번호: 그날 기록이 몇 번까지인지 말한다(누가 보내도 같은 수). 기록이 없는 날은 그렇게 말한다. 아무것도 바꾸지 않는다.
  const missingDelete = await say(fx, "삭제 09번", { user: B, room });
  check(() => ok(missingDelete.lines[0] === `${DAY} 09번 기록을 찾지 못했어요. 이 날 기록은 03번까지예요.` && rowsOn(fx, householdId, DAY).length === 3, `N-2 없는 번호를 지우려 하면 그날 기록이 몇 번까지인지 말한다(${missingDelete.lines[0]})`), "missing delete number");
  const missingEdit = await say(fx, "수정 09번 금액 5000", { user: A, room });
  check(() => ok(missingEdit.lines[0] === `${DAY} 09번 기록을 찾지 못했어요. 이 날 기록은 03번까지예요.`, `N-2 없는 번호를 고치려 해도 같은 말(${missingEdit.lines[0]})`), "missing edit number");
  const emptyDay = await say(fx, "어제 삭제 01번", { user: B, room });
  check(() => ok(emptyDay.lines[0] === "2026-11-19 01번 기록을 찾지 못했어요. 이 날은 기록이 없어요." && rowsOn(fx, householdId, DAY).length === 3, `N-2 기록이 없는 날의 번호는 ‘이 날은 기록이 없어요’(${emptyDay.lines[0]})`), "missing empty day");
});

// ── N-2 나. 단톡방: 구성원이 다른 사람의 기록을 고치고 지우고, 지운 사람이 되살린다 ─────────────────────
await scene("단톡방 구성원이 다른 사람의 기록을", async (fx) => {
  const room = key("room-shared"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  await say(fx, "택시 8000원", { user: A, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  rename(fx, A, "민지"); rename(fx, B, "준호");
  const a = userByKey(fx, A), b = userByKey(fx, B);
  check(() => ok(fx.db.household_members.some((m) => m.household_id === householdId && m.user_id === b?.id && m.role === "member"), "픽스처: B 는 방 가계부의 구성원(member)"), "fixture member");
  const lunch = () => byMemo(fx, householdId, "점심"), taxi = () => byMemo(fx, householdId, "택시");
  // 한 줄 수정: 구성원 B 가 소유자 A 의 점심을 고친다.
  const edit = await say(fx, "수정 01번 금액 13000", { user: B, room });
  check(() => ok(edit.text.includes("01번 금액을 13,000원으로 변경했어요") && Number(lunch()?.amount) === 13000 && lunch()?.user_id === a?.id, `N-2 구성원이 다른 사람의 기록을 번호로 고친다(지출자는 그대로)(${edit.lines.slice(0, 2).join(" | ")})`), "member edits other");
  check(() => ok(edit.lines.some((line) => /^기록: 점심 \/ 13,000원 \/ .+ \(민지\)$/.test(line)), `N-2 고친 답의 기록 줄 끝에 그 기록의 지출자 이름(${edit.lines.join(" | ").slice(0, 200)})`), "member edit owner name");
  // 삭제: 구성원 B 가 A 의 택시를 지운다.
  const removed = await say(fx, "삭제 03번", { user: B, room });
  check(() => ok(removed.lines[0] === "🗑️ 03번 기록을 삭제했어요." && /^03번 - 택시 \/ 8,000원 \/ .+ \(민지\)$/.test(removed.lines[1] || "") && removed.lines.includes(`되돌리려면: ${BOT} 복구 03번`) && !taxi(), `N-2 구성원이 다른 사람의 기록을 번호로 지우고, 답에 그 기록의 지출자 이름과 복구 안내(${removed.lines.slice(0, 3).join(" | ")})`), "member deletes other");
  // 복구: 지우지 않은 A 는 되살리지 못하고 누가 되살리는지 듣는다. 지운 B 가 되살린다.
  const notMine = await say(fx, "복구 03번", { user: A, room });
  check(() => ok(notMine.text.startsWith("복구할 삭제 기록이 없어요.\n복구는 기록을 지운 사람이 삭제 직후 안내된 번호로 할 수 있어요.") && !taxi(), `N-2 지우지 않은 사람의 ‘복구’ 는 되살리지 않고 누가 복구하는지 말한다(${notMine.lines.slice(0, 2).join(" | ")})`), "restore by non-deleter");
  const restored = await say(fx, "복구 03번", { user: B, room });
  check(() => ok(restored.text.includes("기록을 복구했어요") && taxi()?.user_id === a?.id && Number(taxi()?.amount) === 8000 && restored.lines.some((line) => /^\d{2}번 - 택시 \/ 8,000원 \/ .+ \(민지\)$/.test(line)), `N-2 지운 사람이 되살리면 원래 지출자 그대로 돌아오고 답에 그 이름(${restored.lines.slice(0, 2).join(" | ")})`), "restore by deleter");
  // 지출자 바꾸기는 그대로 소유자·관리자만.
  const payer = await say(fx, "수정 01번 지출자 준호", { user: B, room });
  check(() => ok(payer.text.includes("지출자는 가계부 소유자·관리자만 바꿀 수 있어요. 기록은 그대로예요.") && lunch()?.user_id === a?.id, `N-2 구성원은 다른 사람의 기록이어도 지출자는 바꾸지 못한다(${payer.lines[0]})`), "member payer refused");
  // 수정 창: 번호 물음에 봇 부르기 예시(M-11), 번호 → 값 → 저장.
  const menu = await say(fx, "수정 01번", { user: B, room });
  check(() => ok(menu.lines.includes(`무엇을 바꿀까요? 번호를 보내주세요. 예: ${BOT} 1`), `M-11 단톡방 수정 창의 번호 물음에 ‘예: ${BOT} 1’(${menu.lines.slice(0, 3).join(" | ")})`), "room session prompt");
  check(() => ok(/^01번 - 점심 \/ 13,000원 \/ .+$/.test(menu.lines[0] || ""), `N-2 수정 창은 다른 사람의 기록도 연다(${menu.lines[0]})`), "room session opens other");
  const ask = await say(fx, "1", { user: B, room });
  check(() => ok(ask.text.includes(`예: ${BOT} 13000`), `N-2 수정 창이 번호(1 = 금액)를 받아 값을 묻는다(${ask.lines.slice(0, 2).join(" | ")})`), "room session number");
  const changed = await say(fx, "9000", { user: B, room });
  check(() => ok(changed.text.includes("01번 금액을 9,000원으로 변경했어요") && Number(lunch()?.amount) === 9000 && lunch()?.user_id === a?.id, `N-2 수정 창으로 다른 사람의 기록을 고친다(${changed.lines[0]})`), "room session done");
  // 수정 창의 날짜 고르기(5)와 구분 바꾸기 확인(8)도 단톡방에서 보낼 말의 예시를 받는다(독립 검토 2026-11-21 — 단추가 없는 물음).
  await say(fx, "수정 01번", { user: B, room });
  const dateAsk = await say(fx, "5", { user: B, room });
  check(() => ok(dateAsk.lines.includes(`✏️ 날짜를 번호로 고르거나 직접 입력해주세요. 예: ${BOT} 1`) && dateAsk.lines.includes(`1. 오늘  2. 어제  3. 그제  (직접 입력 예: ${BOT} 7월 20일)`), `M-11 단톡방 수정 창의 날짜 물음에 번호 예시와 직접 입력 예시의 봇 부르기(${dateAsk.lines.slice(0, 3).join(" | ")})`), "room session date prompt");
  await say(fx, "취소", { user: B, room });
  await say(fx, "수정 01번", { user: B, room });
  const typeAsk = await say(fx, "8", { user: B, room });
  check(() => ok(typeAsk.lines.some((line) => line === `✏️ 01번 기록을 지출에서 수입으로 바꿀까요? (네/아니오) 예: ${BOT} 네`) && lunch()?.type === "expense", `M-11 단톡방 수정 창의 구분 바꾸기 확인에 ‘예: ${BOT} 네’(${typeAsk.lines.slice(0, 2).join(" | ")})`), "room session type confirm");
  await say(fx, "취소", { user: B, room });
  // 소유자 A 도 구성원 B 의 기록을 번호로 지운다(예전에도 웹에서는 됐다).
  const owner = await say(fx, "삭제 02번", { user: A, room });
  check(() => ok(owner.lines[0] === "🗑️ 02번 기록을 삭제했어요." && /^02번 - 커피 \/ 4,500원 \/ .+ \(준호\)$/.test(owner.lines[1] || "") && !byMemo(fx, householdId, "커피"), `N-2 소유자가 구성원의 기록을 번호로 지운다(${owner.lines.slice(0, 2).join(" | ")})`), "owner deletes member");
  const after = await say(fx, "오늘기록", { user: B, room });
  check(() => ok(numbered(after).length === 2 && /^01번 - 점심 \/ 9,000원 .+\(민지\)$/.test(numbered(after)[0]) && /^02번 - 택시 \/ 8,000원 .+\(민지\)$/.test(numbered(after)[1]) && after.lines.includes(HEAD), `N-2 지운 뒤에는 번호가 당겨진다(그날 가계부 순서)(${numbered(after).join(" | ")})`), "numbers after delete");
});

// ── N-2 다. ‘기록만’ 정책·조회 전용은 그대로 막는다 ────────────────────────────────────────
await scene("단톡방 기록만·조회 전용", async (fx) => {
  const room = key("room-policy"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunch = () => byMemo(fx, householdId, "점심");
  const policyNow = await say(fx, "구성원 권한", { user: A, room });
  check(() => ok(policyNow.text.includes("구성원은 기록하고, 다른 사람의 기록도 고치거나 지울 수 있어요.") && !policyNow.text.includes("자기가 쓴 기록"), `N-2 ‘구성원 권한’ 의 기본(기록·수정) 설명(${policyNow.text.replace(/\n/g, " | ").slice(0, 160)})`), "policy text");
  const policy = await say(fx, "구성원 권한 기록만", { user: A, room });
  check(() => ok(/기록만/.test(policy.text), `픽스처: 소유자가 구성원 권한을 ‘기록만’ 으로 바꿨다(${policy.text.slice(0, 50)})`), "fixture record only");
  const refusedDelete = await say(fx, "삭제 01번", { user: B, room });
  const refusedEdit = await say(fx, "수정 01번 금액 5000", { user: B, room });
  check(() => ok(refusedDelete.text.includes("소유자나 관리자에게") && refusedEdit.text.includes("소유자나 관리자에게") && lunch() && Number(lunch().amount) === 12000, `N-2 ‘기록만’ 가계부의 구성원은 다른 사람의 기록을 고치거나 지우지 못한다(${refusedDelete.lines[0]})`), "record only refuses");
  const ownDelete = await say(fx, "삭제 02번", { user: B, room });
  check(() => ok(ownDelete.text.includes("소유자나 관리자에게") && byMemo(fx, householdId, "커피"), "N-2 ‘기록만’ 이면 자기 기록도 그대로 못 지운다(예전 그대로)"), "record only own");
  const saved = await say(fx, "간식 3000원", { user: B, room });
  check(() => ok(saved.text.includes("03번 - 간식 / 3,000원"), `N-2 ‘기록만’ 이어도 기록은 남기고 번호는 그날 가계부 순서(${saved.lines.find((line) => line.includes("번 - ")) || saved.text.slice(0, 80)})`), "record only save");
  await say(fx, "구성원 권한 기록·수정", { user: A, room });
  const b = userByKey(fx, B);
  for (const member of fx.db.household_members) if (member.household_id === householdId && member.user_id === b?.id) member.role = "viewer";
  resetIsolateState();
  const viewer = await say(fx, "삭제 01번", { user: B, room });
  const viewerEdit = await say(fx, "수정 01번 금액 5000", { user: B, room });
  check(() => ok(lunch() && Number(lunch().amount) === 12000 && !viewer.text.includes("기록을 삭제했어요") && !viewerEdit.text.includes("변경했어요"), `N-2 조회 전용 구성원은 고치거나 지우지 못한다(${viewer.lines[0]} / ${viewerEdit.lines[0]})`), "viewer refused");
});

// ── N-2 라. ‘방금’ 은 내 기록, 같은 시각 기록 묻기도 내 기록만 센다 ───────────────────────────────
await scene("단톡방 방금", async (fx) => {
  const room = key("room-latest"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  // 두 사람의 기록이 같은 시각에 저장된 것처럼 맞춘다(한 말로 여러 건을 저장한 경우만 ‘한 번에 저장한 기록’ 으로 묻는다).
  const lunch0 = byMemo(fx, householdId, "점심"), coffee0 = byMemo(fx, householdId, "커피");
  if (lunch0 && coffee0) coffee0.created_at = lunch0.created_at;
  const latest = await say(fx, "방금 삭제", { user: A, room });
  check(() => ok(!byMemo(fx, householdId, "점심") && byMemo(fx, householdId, "커피") && latest.text.includes("기록을 삭제했어요") && latest.text.includes("점심") && !latest.text.includes("한 번에 저장한 기록이"), `N-2 ‘방금 삭제’ 는 내 마지막 기록을 지운다(같은 시각의 다른 사람 기록은 묻지 않는다)(${latest.lines.slice(0, 2).join(" | ")})`), "latest own delete");
  const theirs = await say(fx, "방금 거 금액 5000원으로", { user: B, room });
  check(() => ok(Number(byMemo(fx, householdId, "커피")?.amount) === 5000, `N-2 ‘방금’ 은 말한 사람의 마지막 기록(${theirs.lines[0]})`), "latest own edit");
});

// ── N-2 라-2. 남의 기록을 고친 직후의 ‘방금’ 은 고르지 않고 번호로 묻는다(V22.9.116 과 같은 규칙 — 내가 고친 기록은 감사 기록으로 안다) ──
const TOUCHED_HEAD = "마지막에 저장한 뒤에 다른 기록이 바뀌어서 ‘방금’이 어느 기록인지 정하지 못했어요. 아무것도 바꾸지 않았어요.";
await scene("남의 기록을 고친 뒤 방금", async (fx) => {
  const room = key("room-touched"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunch = () => byMemo(fx, householdId, "점심"), coffee = () => byMemo(fx, householdId, "커피");
  const b = userByKey(fx, B);
  // 저장 시각을 몇 초 앞으로 옮겨 둔다(고친 시각과 같은 밀리초가 되지 않게 — 순서는 그대로).
  if (lunch() && coffee()) { lunch().created_at = new Date(Date.now() - 20000).toISOString(); coffee().created_at = new Date(Date.now() - 10000).toISOString(); }
  const edited = await say(fx, "수정 01번 금액 13000", { user: B, room });
  check(() => ok(edited.text.includes("01번 금액을 13,000원으로 변경했어요") && Number(lunch()?.amount) === 13000, `픽스처: 구성원 B 가 A 의 점심을 고쳤다(${edited.lines[0]})`), "touched fixture edit");
  check(() => ok((fx.db.accountbook_transaction_audit || []).some((row) => row.action === "update" && row.actor_user_id === b?.id && row.transaction_id === lunch()?.id && row.after_value?.amount === 13000), "픽스처: 고친 길이 감사 기록(행위자 B, 고친 뒤의 행)을 남긴다(운영과 같은 칸)"), "touched fixture audit");
  // 감사 기록 읽기가 거르는 칸: 이 가계부 · 말한 사람 · 고친 줄(action update)만(지운 줄 같은 다른 줄은 ‘고친 기록’ 이 아니다).
  const auditReads = [];
  const spy = intercept(async ({ url, method }) => { if (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit") auditReads.push(new URLSearchParams(url.searchParams)); return null; });
  let ask;
  try { ask = await say(fx, "방금 거 지워줘", { user: B, room }); } finally { spy(); }
  check(() => ok(auditReads.length === 1 && auditReads[0].get("action") === "eq.update" && auditReads[0].get("actor_user_id") === `eq.${b?.id}` && auditReads[0].get("household_id") === `eq.${householdId}`, `N-2 감사 기록은 이 가계부에서 말한 사람이 고친 줄(action update)만 읽는다(${auditReads.map((params) => params.toString()).join(" | ")})`), "audit read filters");
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 13,000원 /.test(line)) && ask.lines.some((line) => /^마지막에 저장한 기록: 02번 - 커피 \/ 4,500원 /.test(line)) && lunch() && coffee(), `N-2 남의 기록을 고친 직후의 ‘방금 거 지워줘’ 는 어느 쪽도 지우지 않고 번호로 묻는다(${ask.lines.slice(0, 3).join(" | ")})`), "touched other delete asks");
  check(() => ok(ask.lines.includes(`번호로 보내 주세요. 예: ${BOT} 수정 01번 금액 13000 / ${BOT} 삭제 01번`), `N-2 묻는 답의 예시는 고친 기록의 번호(가계부 전체 번호 01번 — 봇 부르기)(${ask.lines.at(-1)})`), "touched other example");
  const askEdit = await say(fx, "방금 거 금액 5000원으로", { user: B, room });
  check(() => ok(askEdit.lines[0] === TOUCHED_HEAD && Number(lunch()?.amount) === 13000 && Number(coffee()?.amount) === 4500, `N-2 ‘방금 거 금액 …’ 도 묻기만 한다(${askEdit.lines[0]})`), "touched other edit asks");
  // A 의 ‘방금’ 은 A 가 마지막에 저장한 점심이다 — B 가 고친 것도 그 기록이라 묻지 않는다(예전 그대로).
  const ownerLatest = await say(fx, "방금 거 금액 12000원으로", { user: A, room });
  check(() => ok(Number(lunch()?.amount) === 12000 && ownerLatest.lines[0] !== TOUCHED_HEAD, `N-2 기록한 사람의 ‘방금’ 은 그대로 자기 마지막 기록(${ownerLatest.lines[0]})`), "touched owner latest");
  // 그 뒤 A 가 같은 기록을 또 고쳤다 — B 에게 묻는 답은 감사 기록에 남은 B 의 값(13,000원)이 아니라 지금 값을 보인다.
  const askNow = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(askNow.lines[0] === TOUCHED_HEAD && askNow.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 12,000원 /.test(line)) && !askNow.text.includes("13,000원") && lunch() && coffee(), `N-2 묻는 답의 고친 기록은 지금 값(그 뒤 A 가 12,000원으로 고쳤다)(${askNow.lines.slice(0, 2).join(" | ")})`), "touched shows current");
  // 고친 뒤에 새로 저장하면 ‘방금’ 은 그 새 기록이다.
  await say(fx, "간식 3000원", { user: B, room });
  const fresh = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(fresh.text.includes("기록을 삭제했어요") && fresh.text.includes("간식") && !byMemo(fx, householdId, "간식") && lunch() && coffee(), `N-2 고친 뒤에 새로 저장했으면 ‘방금’ 은 새 기록(${fresh.lines.slice(0, 2).join(" | ")})`), "touched then saved");
  // 감사 기록을 읽지 못하면 예전과 같다(내 마지막 기록) — 답은 늦지 않게 나간다. (감사 기록을 읽는 GET 은 거르는 칸과 상관없이 모두 막는다.)
  await say(fx, "수정 01번 금액 14000", { user: B, room });
  const stop = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit" ? new Response(JSON.stringify({ code: "QA", message: "audit read down" }), { status: 503, headers: { "content-type": "application/json" } }) : null));
  let blind;
  try { blind = await say(fx, "방금 거 금액 4800원으로", { user: B, room }); } finally { stop(); }
  check(() => ok(blind.status === 200 && Number(coffee()?.amount) === 4800 && Number(lunch()?.amount) === 14000, `N-2 감사 기록 읽기가 실패하면 V22.9.134 처럼 내 마지막 기록(${blind.lines[0]})`), "touched audit down");
});

// ── N-2 라-3. 다른 사람이 자기 기록을 고친 것은 내 ‘방금’ 을 묻게 하지 않는다(감사 기록은 말한 사람이 고친 줄만 본다 — 남이 내 다른 기록을 고친 경우는
//    내 기록의 바뀐 순서(V22.9.116)로 묻는다: E-11) ──
await scene("다른 사람이 자기 기록을 고친 뒤 내 방금", async (fx) => {
  const room = key("room-others-edit"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunch = () => byMemo(fx, householdId, "점심"), coffee = () => byMemo(fx, householdId, "커피");
  if (lunch() && coffee()) { lunch().created_at = new Date(Date.now() - 20000).toISOString(); coffee().created_at = new Date(Date.now() - 10000).toISOString(); }
  const edited = await say(fx, "수정 02번 금액 5000", { user: B, room });
  check(() => ok(edited.text.includes("02번 금액을 5,000원으로 변경했어요") && Number(coffee()?.amount) === 5000, `픽스처: B 가 A 의 마지막 저장 뒤에 자기 커피를 고쳤다(${edited.lines[0]})`), "others edit fixture");
  const mine = await say(fx, "방금 거 지워줘", { user: A, room });
  check(() => ok(mine.lines[0] !== TOUCHED_HEAD && mine.text.includes("기록을 삭제했어요") && mine.text.includes("점심") && !lunch() && Number(coffee()?.amount) === 5000, `N-2 다른 사람이 자기 기록을 고친 것으로는 내 ‘방금’ 이 묻지 않는다 — 내 마지막 기록을 지운다(${mine.lines.slice(0, 2).join(" | ")})`), "others edit not mine");
});

// ── N-2 라-4. 내가 고친 남의 기록이 그 뒤 지워졌으면 ‘방금’ 의 후보가 아니다(내 기록의 바뀐 순서도 지운 기록은 세지 않는다 — 독립 검토 2026-11-21 2차) ──
await scene("고친 기록이 지워진 뒤 방금", async (fx) => {
  const room = key("room-edited-gone"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "택시 8000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunch = () => byMemo(fx, householdId, "점심"), taxi = () => byMemo(fx, householdId, "택시"), coffee = () => byMemo(fx, householdId, "커피");
  const b = userByKey(fx, B);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  if (lunch() && taxi() && coffee()) { lunch().created_at = ago(30000); taxi().created_at = ago(25000); coffee().created_at = ago(20000); }
  // B 가 A 의 점심(01번)을 고치고, 이어서 택시(02번)를 고친다 — 점심 쪽 감사 줄을 5초 앞으로 옮겨 순서가 겹치지 않게 한다.
  await say(fx, "수정 01번 금액 13000", { user: B, room });
  const lunchAudit = (fx.db.accountbook_transaction_audit || []).find((row) => row.action === "update" && row.actor_user_id === b?.id && row.transaction_id === lunch()?.id);
  if (lunchAudit) lunchAudit.created_at = ago(5000);
  const taxiEdit = await say(fx, "수정 02번 금액 9000", { user: B, room });
  check(() => ok(lunchAudit && Number(lunch()?.amount) === 13000 && Number(taxi()?.amount) === 9000 && taxiEdit.text.includes("02번 금액을 9,000원으로 변경했어요"), `픽스처: B 가 A 의 점심과 택시를 차례로 고쳤다(${taxiEdit.lines[0]})`), "edited gone fixture");
  // A 가 택시를 지운다 — B 가 마지막에 고친 기록이 없어졌다. 그 앞에 고친 점심은 아직 있다.
  const taxiGone = await say(fx, "삭제 02번", { user: A, room });
  check(() => ok(!taxi() && taxiGone.text.includes("기록을 삭제했어요"), `픽스처: A 가 택시를 지웠다(${taxiGone.lines[0]})`), "edited gone fixture delete");
  const ask = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 13,000원 /.test(line)) && ask.lines.some((line) => /^마지막에 저장한 기록: 02번 - 커피 \/ 4,500원 /.test(line)) && !ask.text.includes("택시") && lunch() && coffee(), `N-2 마지막에 고친 기록이 지워졌으면 그 앞에 고친 기록(아직 있는 점심)으로 묻는다(${ask.lines.slice(0, 3).join(" | ")})`), "edited gone older edit");
  // 점심도 지워지면 B 가 고친 기록은 모두 없다 — ‘방금’ 은 B 가 마지막에 저장한 커피다.
  await say(fx, "삭제 01번", { user: A, room });
  const direct = await say(fx, "방금 거 금액 5000원으로", { user: B, room });
  check(() => ok(!lunch() && direct.lines[0] !== TOUCHED_HEAD && Number(coffee()?.amount) === 5000, `N-2 고친 기록이 모두 지워졌으면 ‘방금’ 은 묻지 않고 내 마지막 기록(${direct.lines[0]})`), "edited gone direct");
  // 고친 기록을 내가 지운 경우도 같다: A 의 김밥을 B 가 고치고 B 가 지운 뒤의 ‘방금’ 은 B 의 커피다.
  await say(fx, "김밥 3000원", { user: A, room });
  const kimbap = () => byMemo(fx, householdId, "김밥");
  if (kimbap()) kimbap().created_at = ago(15000);
  if (coffee()) coffee().created_at = ago(10000);
  await say(fx, "수정 01번 금액 3500", { user: B, room });
  await say(fx, "삭제 01번", { user: B, room });
  const mineGone = await say(fx, "방금 거 금액 5500원으로", { user: B, room });
  check(() => ok(!kimbap() && mineGone.lines[0] !== TOUCHED_HEAD && Number(coffee()?.amount) === 5500, `N-2 고친 기록을 내가 지운 뒤의 ‘방금’ 도 내 마지막 기록(${mineGone.lines[0]})`), "edited own delete direct");
  // 감사 줄이 다른 가계부의 기록을 가리키면(고친 뒤의 행이 이 가계부라고 적혀 있어도) 그 기록은 이 가계부에서 찾지 못한다 — 묻지 않고, 그 기록의 글도 보이지 않는다.
  const stop = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit" ? Response.json([{ transaction_id: "tx-trip-1", created_at: new Date().toISOString(), after_value: { id: "tx-trip-1", household_id: householdId, type: "expense", transaction_date: DAY, memo: "감사 줄의 글", amount: 777, category: "기타" } }]) : null));
  let elsewhere;
  try { elsewhere = await say(fx, "방금 거 금액 5600원으로", { user: B, room }); } finally { stop(); }
  check(() => ok(rowOf(fx, "tx-trip-1") && elsewhere.lines[0] !== TOUCHED_HEAD && !elsewhere.text.includes("숙소 예약") && !elsewhere.text.includes("감사 줄의 글") && Number(coffee()?.amount) === 5600, `N-2 다른 가계부의 기록을 가리키는 감사 줄은 이 가계부에서 다시 읽어 걸러진다(${elsewhere.lines[0]})`), "audit points elsewhere");
});

// ── N-2 라-5. 내 기록과 남의 기록을 차례로 고친 뒤: 묻는 답은 더 늦게 고친 기록 · 지운 줄은 고친 기록이 아니다 · 엉뚱한 감사 줄은 믿지 않는다 ──
await scene("두 기록을 고친 뒤 방금", async (fx) => {
  const room = key("room-two-edits"), A = key("a"), B = key("b");
  await say(fx, "간식 3000원", { user: B, room });
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const snack = () => byMemo(fx, householdId, "간식"), lunch = () => byMemo(fx, householdId, "점심"), coffee = () => byMemo(fx, householdId, "커피");
  const b = userByKey(fx, B);
  const ago = (ms) => new Date(Date.now() - ms).toISOString();
  if (snack() && lunch() && coffee()) { snack().created_at = ago(30000); lunch().created_at = ago(20000); coffee().created_at = ago(10000); }
  // B 가 자기 간식(01번)을 고친 뒤 몇 초 지나 A 의 점심(02번)을 고친다 — 고친 시각이 겹치지 않게 간식 쪽을 5초 앞으로 옮긴다.
  const ownEdit = await say(fx, "수정 01번 금액 3500", { user: B, room });
  const snackAudit = (fx.db.accountbook_transaction_audit || []).find((row) => row.action === "update" && row.actor_user_id === b?.id && row.transaction_id === snack()?.id);
  if (snack()) snack().updated_at = ago(5000);
  if (snackAudit) snackAudit.created_at = ago(5000);
  check(() => ok(ownEdit.text.includes("01번 금액을 3,500원으로 변경했어요") && Number(snack()?.amount) === 3500 && snackAudit, `픽스처: B 가 자기 간식을 고쳤다(감사 한 줄)(${ownEdit.lines[0]})`), "two edits fixture own");
  const otherEdit = await say(fx, "수정 02번 금액 13000", { user: B, room });
  check(() => ok(otherEdit.text.includes("02번 금액을 13,000원으로 변경했어요") && Number(lunch()?.amount) === 13000, `픽스처: 이어서 B 가 A 의 점심을 고쳤다(${otherEdit.lines[0]})`), "two edits fixture other");
  const ask = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => /^마지막에 바뀐 기록: 02번 - 점심 \/ 13,000원 /.test(line)) && ask.lines.some((line) => /^마지막에 저장한 기록: 03번 - 커피 \/ 4,500원 /.test(line)) && snack() && lunch() && coffee(), `N-2 두 기록을 고쳤으면 묻는 답의 ‘마지막에 고친 기록’ 은 더 늦게 고친 남의 점심(내 간식이 아니다)(${ask.lines.slice(0, 3).join(" | ")})`), "two edits later one");
  // 고친 뒤에 지운 것(감사 기록의 지운 줄)은 ‘고친 기록’ 이 아니다 — 여전히 마지막에 고친 점심으로 묻는다(번호는 하나씩 당겨진다).
  const removed = await say(fx, "삭제 01번", { user: B, room });
  check(() => ok(removed.text.includes("기록을 삭제했어요") && !snack() && (fx.db.accountbook_transaction_audit || []).some((row) => row.action === "delete" && row.actor_user_id === b?.id), `픽스처: B 가 간식을 지웠다(감사 기록의 지운 줄)(${removed.lines[0]})`), "two edits fixture delete");
  const askAfterDelete = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(askAfterDelete.lines[0] === TOUCHED_HEAD && askAfterDelete.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 13,000원 /.test(line)) && askAfterDelete.lines.some((line) => /^마지막에 저장한 기록: 02번 - 커피 \/ 4,500원 /.test(line)) && lunch() && coffee(), `N-2 고친 뒤에 다른 기록을 지웠어도 ‘방금’ 은 묻는다 — 지운 줄은 고친 기록이 아니다(${askAfterDelete.lines.slice(0, 3).join(" | ")})`), "two edits delete is not an edit");
  // 감사 줄은 그 기록을 이 가계부에서 다시 읽어 찾을 때만 믿는다(감사 줄에 적힌 고친 뒤의 값은 쓰지 않는다). 이 가계부에 없는 기록을 가리키는 줄은 없는 것으로 —
  // 내 마지막 기록.
  const forged = (after) => intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit" ? Response.json([{ transaction_id: after.id === "tx-v135-forged" ? "tx-v135-forged" : "tx-v135-other", created_at: new Date().toISOString(), after_value: after }]) : null));
  const base = { type: "expense", transaction_date: DAY, memo: "남의 가계부", amount: 999, category: "기타" };
  let stop = forged({ ...base, id: "tx-v135-forged", household_id: "house-v135-elsewhere" });
  let otherHouse;
  try { otherHouse = await say(fx, "방금 거 금액 4800원으로", { user: B, room }); } finally { stop(); }
  check(() => ok(otherHouse.lines[0] !== TOUCHED_HEAD && !otherHouse.text.includes("남의 가계부") && Number(coffee()?.amount) === 4800, `N-2 이 가계부에 없는 기록(다른 가계부라고 적힌 줄)을 가리키는 감사 줄은 믿지 않는다 — 내 마지막 기록을 고친다(${otherHouse.lines[0]})`), "audit other household ignored");
  stop = forged({ ...base, id: "tx-v135-forged-mismatch", household_id: householdId });
  let mismatch;
  try { mismatch = await say(fx, "방금 거 금액 4900원으로", { user: B, room }); } finally { stop(); }
  check(() => ok(mismatch.lines[0] !== TOUCHED_HEAD && !mismatch.text.includes("남의 가계부") && Number(coffee()?.amount) === 4900, `N-2 이 가계부에 없는 기록(고친 뒤의 행과 번호도 맞지 않는 줄)을 가리키는 감사 줄은 믿지 않는다(${mismatch.lines[0]})`), "audit mismatched row ignored");
  // 이 가계부에 있는 기록을 가리키면 그 기록의 지금 값으로 묻는다 — 감사 줄에 적힌 값(엉뚱한 메모·금액)은 보이지 않는다.
  stop = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit" ? Response.json([{ transaction_id: lunch()?.id, created_at: new Date().toISOString(), after_value: { ...base, id: lunch()?.id, household_id: householdId, memo: "감사 줄의 글", amount: 777 } }]) : null));
  let reread;
  try { reread = await say(fx, "방금 거 지워줘", { user: B, room }); } finally { stop(); }
  check(() => ok(reread.lines[0] === TOUCHED_HEAD && reread.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 13,000원 /.test(line)) && !reread.text.includes("감사 줄의 글") && !reread.text.includes("777원") && lunch() && coffee(), `N-2 감사 줄에 적힌 값은 쓰지 않는다 — 이 가계부에서 다시 읽은 지금 값으로 묻는다(${reread.lines.slice(0, 2).join(" | ")})`), "audit value not used");
});

// ── N-2 라-6. 고친 남의 기록을 그 뒤 다른 사람이 다른 날로 옮겼으면, 묻는 답은 그 기록의 지금 날짜·번호다 ──
await scene("고친 기록의 날짜가 바뀐 뒤 방금", async (fx) => {
  const room = key("room-edited-moved"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunchId = byMemo(fx, householdId, "점심")?.id, coffeeId = byMemo(fx, householdId, "커피")?.id;
  const lunch = () => rowOf(fx, lunchId), coffee = () => rowOf(fx, coffeeId);
  if (lunch() && coffee()) { lunch().created_at = new Date(Date.now() - 20000).toISOString(); coffee().created_at = new Date(Date.now() - 10000).toISOString(); }
  await say(fx, "수정 01번 금액 13000", { user: B, room });
  // A 가 그 점심을 어제로 옮긴다(수정 창의 날짜 고르기 — 2 = 어제).
  await say(fx, "수정 01번", { user: A, room });
  await say(fx, "5", { user: A, room });
  const moved = await say(fx, "2", { user: A, room });
  check(() => ok(lunch()?.transaction_date === "2026-11-19" && Number(lunch()?.amount) === 13000, `픽스처: A 가 B 가 고친 점심을 어제로 옮겼다(${moved.lines[0]})`), "edited moved fixture");
  const ask = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => /^마지막에 바뀐 기록: 11월 19일 01번 - 점심 \/ 13,000원 /.test(line)) && ask.lines.some((line) => /^마지막에 저장한 기록: 01번 - 커피 \/ 4,500원 /.test(line)) && lunch() && coffee(), `N-2 고친 기록이 다른 날로 옮겨졌으면 묻는 답은 그 기록의 지금 날짜·번호(${ask.lines.slice(0, 3).join(" | ")})`), "edited moved day");
});

// ── N-2 라-7. 운영처럼 고른 칸만 돌려줄 때(PostgREST select): 감사 기록 읽기는 고친 시각을, 다시 읽기는 묻는 답에 쓰는 칸(날짜·메모·금액)을 고른다 ──
// 픽스처는 보통 모든 칸을 돌려주어 고르지 않은 칸을 쓰는 코드도 통과한다 — 이 장면은 고른 칸만 돌려준다(__honor_select).
await scene("고른 칸만 돌려줄 때 방금", async (fx) => {
  fx.db.__honor_select = true;
  const room = key("room-honor-select"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunchId = byMemo(fx, householdId, "점심")?.id, coffeeId = byMemo(fx, householdId, "커피")?.id;
  const lunch = () => rowOf(fx, lunchId), coffee = () => rowOf(fx, coffeeId);
  if (lunch() && coffee()) { lunch().created_at = new Date(Date.now() - 20000).toISOString(); coffee().created_at = new Date(Date.now() - 10000).toISOString(); }
  const edited = await say(fx, "수정 01번 금액 13000", { user: B, room });
  check(() => ok(Number(lunch()?.amount) === 13000, `픽스처: 고른 칸만 돌려줘도 B 가 A 의 점심을 고쳤다(${edited.lines[0]})`), "honor select fixture edit");
  const ask = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => /^마지막에 바뀐 기록: 01번 - 점심 \/ 13,000원 /.test(line)) && ask.lines.some((line) => /^마지막에 저장한 기록: 02번 - 커피 \/ 4,500원 /.test(line)) && lunch() && coffee(), `N-2 고른 칸만 돌려줘도 남의 기록을 고친 뒤의 ‘방금’ 은 번호로 묻는다 — 감사 기록 읽기가 고친 시각을 고른다(${ask.lines.slice(0, 3).join(" | ")})`), "honor select asks");
  // 그 점심이 다른 날로 옮겨지면 다시 읽은 행의 날짜로 그날 목록을 찾는다 — 다시 읽기가 날짜 칸을 고르지 않으면 오늘 목록에서 찾지 못해 메모·금액 없이 적힌다.
  await say(fx, "수정 01번", { user: A, room });
  await say(fx, "5", { user: A, room });
  await say(fx, "2", { user: A, room });
  const moved = await say(fx, "방금 거 지워줘", { user: B, room });
  check(() => ok(lunch()?.transaction_date === "2026-11-19" && moved.lines[0] === TOUCHED_HEAD && moved.lines.some((line) => /^마지막에 바뀐 기록: 11월 19일 01번 - 점심 \/ 13,000원 /.test(line)) && lunch() && coffee(), `N-2 고른 칸만 돌려줘도 옮겨진 고친 기록은 지금 날짜·번호로 묻는다 — 다시 읽기가 날짜 칸을 고른다(${moved.lines.slice(0, 2).join(" | ")})`), "honor select moved day");
});

// ── N-2 마. 1:1 채팅(월요일): 번호·이름·그날 첫 기록의 요약 단추 ──────────────────────────────────
const MONDAY = "2026-11-16";
await scene("1:1 가계부 전체 번호와 요약 단추", async (fx) => {
  check(() => ok(rowsOn(fx, HH, MONDAY).length === 0, "픽스처: 2026-11-16 에는 ‘우리집 생활비’ 기록이 없다"), "fixture monday empty");
  const binFirst = await say(fx, "점심 12000원", { user: BIN });
  check(() => ok(binFirst.text.includes("01번 - 점심 / 12,000원") && binFirst.buttons.includes("지난주 요약"), `N-2 소유자의 그날 첫 기록: 01번, 월요일 요약 단추(${binFirst.buttons.join(",")})`), "direct bin first");
  const wifiFirst = await say(fx, "커피 4500원", { user: WIFI });
  check(() => ok(wifiFirst.text.includes("02번 - 커피 / 4,500원") && wifiFirst.buttons.includes("지난주 요약"), `N-2 구성원의 그날 첫 기록은 02번이어도 그 사람의 첫 기록이라 요약 단추가 붙는다(${wifiFirst.lines.find((line) => line.includes("번 - ")) || ""} · ${wifiFirst.buttons.join(",")})`), "direct wifi first");
  const binSecond = await say(fx, "택시 8000원", { user: BIN });
  check(() => ok(binSecond.text.includes("03번 - 택시 / 8,000원") && !binSecond.buttons.includes("지난주 요약"), `N-2 같은 사람의 둘째 기록에는 요약 단추가 없다(${binSecond.buttons.join(",")})`), "direct bin second");
  const list = await say(fx, "오늘기록", { user: WIFI });
  check(() => ok(numbered(list).length === 3 && /^01번 - 점심 \/ 12,000원 .+\(Bin\)$/.test(numbered(list)[0]) && /^02번 - 커피 \/ 4,500원 .+\(WIFI♥\)$/.test(numbered(list)[1]) && /^03번 - 택시 \/ 8,000원 .+\(Bin\)$/.test(numbered(list)[2]) && list.lines.includes(HEAD), `N-2 1:1 ‘오늘기록’ 도 가계부 모두의 기록과 이름(${numbered(list).join(" | ")})`), "direct list");
  check(() => ok(!list.text.includes(BOT), "N-2 1:1 답에는 봇 부르기가 붙지 않는다"), "direct no mention");
  const removed = await say(fx, "삭제 01번", { user: WIFI });
  check(() => ok(removed.lines[0] === "🗑️ 01번 기록을 삭제했어요." && /^01번 - 점심 \/ 12,000원 .+\(Bin\)$/.test(removed.lines[1] || "") && removed.lines.includes("되돌리려면: 복구 01번") && !byMemo(fx, HH, "점심"), `N-2 1:1 구성원이 소유자의 기록을 번호로 지운다(${removed.lines.slice(0, 3).join(" | ")})`), "direct member deletes owner");
  const restored = await say(fx, "복구 01번", { user: WIFI });
  check(() => ok(restored.text.includes("기록을 복구했어요") && byMemo(fx, HH, "점심")?.user_id === "user-bin", "N-2 1:1 지운 구성원이 되살리면 원래 지출자(소유자) 그대로"), "direct restore");
}, { day: MONDAY });

// ── N-2 바. 이름을 늦게 읽으면 이름 없이 답한다(0.8초까지만 기다린다) ───────────────────────────
await scene("이름 읽기가 늦을 때", async (fx) => {
  await say(fx, "점심 12000원", { user: BIN });
  await say(fx, "커피 4500원", { user: WIFI });
  let delayed = 0;
  const stop = intercept(async ({ url, method }) => {
    if (method !== "GET" || url.pathname !== "/rest/v1/household_members" || !String(url.searchParams.get("select") || "").includes("users(")) return null;
    delayed += 1;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return null;
  });
  let slow;
  try { slow = await say(fx, "오늘기록", { user: BIN }); } finally { stop(); }
  check(() => ok(delayed >= 1, "픽스처: 이름 읽기(구성원 + 사용자)를 늦췄다"), "fixture delayed");
  check(() => ok(numbered(slow).length === 2 && numbered(slow).every((line) => !/\((Bin|WIFI♥)\)$/.test(line)) && slow.lines.includes("구성원 모두의 기록이에요") && !slow.lines.includes(HEAD), `N-2 이름을 0.8초 안에 못 읽으면 이름 없이 ‘구성원 모두의 기록이에요’ 만(${slow.lines.slice(0, 4).join(" | ")})`), "names timeout");
  check(() => ok(slow.status === 200 && slow.ms < 3500, `N-2 이름을 기다리느라 답이 늦지 않다(${slow.ms}ms)`), "names timeout fast");
});

// ── M-11 단톡방 수정 창의 물음에 적힌 예시대로(봇 부르기를 붙여) 답하면 그 걸음으로 받는다 · 값 짐작 확인에는 예시만 붙는다(독립 검토 2026-11-21 2차) ──
await scene("단톡방 수정 창의 예시대로 답하기", async (fx) => {
  const room = key("room-m11-answers"), A = key("a"), B = key("b");
  await say(fx, "점심 12000원", { user: A, room });
  await say(fx, "커피 4500원", { user: B, room });
  const householdId = fx.db.transactions.find((row) => row.memo === "점심" && row.transaction_date === DAY)?.household_id;
  const lunchId = byMemo(fx, householdId, "점심")?.id, coffeeId = byMemo(fx, householdId, "커피")?.id;
  const lunch = () => rowOf(fx, lunchId), coffee = () => rowOf(fx, coffeeId);
  if (lunch() && coffee()) { lunch().created_at = new Date(Date.now() - 20000).toISOString(); coffee().created_at = new Date(Date.now() - 10000).toISOString(); }
  // 날짜 고르기(5)에 ‘@말해가계부 2’(어제) — 점심이 어제로 간다.
  await say(fx, "수정 01번", { user: B, room });
  await say(fx, "5", { user: B, room });
  const dated = await say(fx, `${BOT} 2`, { user: B, room });
  check(() => ok(lunch()?.transaction_date === "2026-11-19" && dated.text.includes("01번 날짜를 2026-11-19로 변경했어요"), `M-11 날짜 물음에 ‘${BOT} 2’ 로 답하면 어제로 바뀐다(${dated.lines[0]})`), "m11 answer date");
  // 이제 오늘의 01번은 커피다. 알아듣지 못한 값 ‘zzz’ 는 내용으로 짐작해 묻는다 — 그 답에는 예시만 붙고 끝 한 줄은 붙지 않는다(따옴표 안은 보낸 값의 되풀이).
  await say(fx, "수정 01번", { user: B, room });
  const guess = await say(fx, "zzz", { user: B, room });
  check(() => eq(guess.text, `혹시 내용을 'zzz'로 바꾸는 건가요? (네/아니오) 예: ${BOT} 네`, "M-11 값 짐작 확인에는 예시만(끝 한 줄 없음)"), "m11 guess no footer");
  const guessed = await say(fx, `${BOT} 네`, { user: B, room });
  check(() => ok(coffee()?.memo === "zzz" && guessed.lines[0] === "✅ 01번 내용을 'zzz'로 변경했어요.", `M-11 짐작 확인에 ‘${BOT} 네’ 로 답하면 내용이 바뀐다(${guessed.lines[0]})`), "m11 answer guess");
  // 구분 바꾸기 확인(8)에 ‘@말해가계부 네’ — 수입이 된다.
  await say(fx, "수정 01번", { user: B, room });
  await say(fx, "8", { user: B, room });
  const typed = await say(fx, `${BOT} 네`, { user: B, room });
  check(() => ok(coffee()?.type === "income" && typed.lines[0] === "✅ 01번 구분을 지출 → 수입으로 바꿨어요.", `M-11 구분 바꾸기 확인에 ‘${BOT} 네’ 로 답하면 수입이 된다(${typed.lines[0]})`), "m11 answer type");
});

// ── M-11 규칙만: 응답 마무리에 글을 넣어 본다 ─────────────────────────────────────────────
{
  const roomPayload = { userRequest: { utterance: "", user: { id: key("unit-user"), type: "botUserKey", properties: { botUserKey: key("unit-user") } }, chat: { id: key("unit-room"), type: "botGroupKey", properties: { botGroupKey: key("unit-room") } } } };
  const directPayload = { userRequest: { utterance: "", user: { id: key("unit-user"), type: "botUserKey", properties: { botUserKey: key("unit-user") } } } };
  const through = async (text, payload) => {
    const data = await (await kakaoGroupCompatibleResponse(kakaoText(text), payload, BASE)).json();
    return (data?.template?.outputs || []).map((o) => o?.simpleText?.text ?? o?.textCard?.description ?? "").join("\n----\n");
  };
  const EX = ` 예: ${BOT} 1`;
  // [넣는 글의 줄, 단톡방에서 그 줄이 되어야 하는 모양, 설명] — 실제 답의 글(수정 창·분류·결제수단·지출자·가계부 고르기)
  const LINES = [
    ["무엇을 바꿀까요? 번호를 보내주세요.", `무엇을 바꿀까요? 번호를 보내주세요.${EX}`, "수정 창의 첫 물음"],
    ["✏️ 지출자를 누구로 바꿀까요? 번호로 골라주세요.", `✏️ 지출자를 누구로 바꿀까요? 번호로 골라주세요.${EX}`, "지출자 고르기"],
    ["결제수단을 번호로 골라주세요.", `결제수단을 번호로 골라주세요.${EX}`, "결제수단 고르기"],
    ["분류를 번호로 골라주세요.", `분류를 번호로 골라주세요.${EX}`, "분류 고르기"],
    ["지출 분류를 번호로 골라 주세요.", `지출 분류를 번호로 골라 주세요.${EX}`, "띄어 쓴 ‘골라 주세요’"],
    ["1~5 사이의 번호로 골라주세요.", `1~5 사이의 번호로 골라주세요.${EX}`, "범위 밖 번호"],
    ["‘우리집’ 이름의 가계부가 2개예요. 어느 가계부인지 번호로 골라 주세요.", `‘우리집’ 이름의 가계부가 2개예요. 어느 가계부인지 번호로 골라 주세요.${EX}`, "같은 이름의 가계부 고르기"],
    ["번호만 보내도 돼요: 1 금액 / 2 분류 / 3 결제수단", `번호 앞에 ${BOT} 를 붙여 보내도 돼요: 1 금액 / 2 분류 / 3 결제수단`, "‘번호만 보내도 돼요’ 는 단톡방에서 맞지 않는 말이라 바꾼다"],
    ["번호를 보내면 → 바꿀 값도 번호로 골라요", `번호를 보내면(예: ${BOT} 1) → 바꿀 값도 번호로 골라요`, "도움말의 ‘번호를 보내면 →’"],
    // 독립 검토(2026-11-21): 수정 창의 날짜 고르기와 네·아니오 물음도 단추가 없어 단톡방에서 그냥 보낸 답은 봇에 닿지 않는다.
    ["날짜를 번호로 고르거나 직접 입력해주세요.", `날짜를 번호로 고르거나 직접 입력해주세요.${EX}`, "날짜 고르기"],
    ["날짜를 번호로 고르거나 직접 입력해 주세요.", `날짜를 번호로 고르거나 직접 입력해 주세요.${EX}`, "날짜를 알아듣지 못한 뒤의 다시 묻기(띄어 씀)"],
    ["✏️ 03번 기록을 지출에서 수입으로 바꿀까요? (네/아니오)", `✏️ 03번 기록을 지출에서 수입으로 바꿀까요? (네/아니오) 예: ${BOT} 네`, "구분 바꾸기 확인"],
    ["혹시 금액을 50,000원으로 바꾸는 건가요? (네/아니오)", `혹시 금액을 50,000원으로 바꾸는 건가요? (네/아니오) 예: ${BOT} 네`, "값 짐작 확인"],
    // 독립 검토(2026-11-21 2차): 실제로 나오는 짐작 확인은 값을 따옴표로 되풀이한다 — 그 따옴표 값은 남은 안내가 아니다(예시만, 끝 한 줄 없음).
    ["혹시 내용을 'zzz'로 바꾸는 건가요? (네/아니오)", `혹시 내용을 'zzz'로 바꾸는 건가요? (네/아니오) 예: ${BOT} 네`, "값 짐작 확인(따옴표로 되풀이한 값)"],
    ["혹시 분류를 '식비'로 바꾸는 건가요? (네/아니오)", `혹시 분류를 '식비'로 바꾸는 건가요? (네/아니오) 예: ${BOT} 네`, "값 짐작 확인(분류)"],
  ];
  for (const [line, expected, label] of LINES) {
    const input = `${line}\n1. 민지\n2. 준호`;
    const room = await through(input, roomPayload);
    const direct = await through(input, directPayload);
    check(() => eq(room.split("\n")[0], expected, `M-11 단톡방 ${label}`), `m11 room ${label}`);
    check(() => ok(!room.includes("단톡방에서는 말 앞에") && room.split(BOT).length - 1 === 1, `M-11 봇 부르기가 생겼으니 끝 한 줄은 붙지 않고 봇 부르기는 한 번 — ${label}`), `m11 no footer ${label}`);
    check(() => eq(direct, input, `M-11 1:1 답은 그대로 — ${label}`), `m11 direct ${label}`);
    const again = await through(room, roomPayload);
    check(() => eq(again, room, `M-11 한 번 고친 글을 다시 넣어도 그대로 — ${label}`), `m11 again ${label}`);
  }
  // 예시를 붙인 줄의 따옴표 값만 세지 않는다 — 같은 답의 다른 줄에 봇 부르기 없는 보낼 말('취소'·'도움말' — 같은 답이 되풀이되면 붙는 줄)이 남으면 끝 한 줄은 그대로다.
  {
    const input = "혹시 내용을 'zzz'로 바꾸는 건가요? (네/아니오)\n(입력이 계속 인식되지 않으면 '취소' 또는 '도움말'을 보내보세요)";
    const room = await through(input, roomPayload);
    check(() => eq(room, `혹시 내용을 'zzz'로 바꾸는 건가요? (네/아니오) 예: ${BOT} 네\n(입력이 계속 인식되지 않으면 '취소' 또는 '도움말'을 보내보세요)\n\n단톡방에서는 말 앞에 ${BOT} 를 붙여 보내 주세요.`, "M-11 예시를 붙인 줄 밖에 봇 부르기 없는 보낼 말이 남으면 끝 한 줄은 그대로"), "m11 footer for other lines");
  }
  // 다음 줄이 예시(예: …)이면 예시를 더하지 않는다(그 줄에 봇 부르기가 붙는다).
  const withExample = await through("🤔 무엇을 바꿀지 못 알아들었어요.\n항목 이름이나 번호를 보내주세요.\n예: 지출자 엄마 / 금액 13000 / 6", roomPayload);
  check(() => ok(withExample.split("\n")[1] === "항목 이름이나 번호를 보내주세요." && withExample.split("\n")[2].startsWith(`예: ${BOT} `), `M-11 다음 줄이 예시면 그 줄에 맡긴다(${withExample.replace(/\n/g, " | ")})`), "m11 next example");
  // 날짜를 직접 적는 예시에는 봇 부르기를 넣는다(날짜 물음 줄은 번호 예시를 받는다). 1:1 은 그대로, 다시 넣어도 그대로.
  {
    const input = "날짜를 번호로 고르거나 직접 입력해주세요.\n1. 오늘  2. 어제  3. 그제  (직접 입력 예: 7월 20일)\n(그만하려면: 취소)";
    const room = await through(input, roomPayload);
    check(() => eq(room, `날짜를 번호로 고르거나 직접 입력해주세요.${EX}\n1. 오늘  2. 어제  3. 그제  (직접 입력 예: ${BOT} 7월 20일)\n(그만하려면: ${BOT} 취소)`, "M-11 단톡방 날짜 물음 — 번호 예시·직접 입력 예시·그만하기"), "m11 date room");
    const direct = await through(input, directPayload), again = await through(room, roomPayload);
    check(() => eq(direct, input, "M-11 1:1 날짜 물음은 그대로"), "m11 date direct");
    check(() => eq(again, room, "M-11 날짜 물음을 다시 넣어도 그대로"), "m11 date again");
  }
  // 이미 봇 부르기가 든 줄, 끝이 아닌 곳의 같은 말, 번호와 상관없는 ‘보내주세요’ 는 예시를 더하지 않는다.
  for (const line of [`번호를 보내주세요. 예: ${BOT} 1`, "번호를 보내주세요 그러면 고쳐요", "사진을 보내주세요.", "영수증 번호를 보내 주실 필요는 없어요.", "날짜를 번호로 고르거나 직접 입력해주세요 그러면 바꿔요"]) {
    const room = await through(line, roomPayload);
    check(() => ok(!room.split("\n")[0].endsWith(`${EX}${EX}`) && (line.includes(BOT) || !room.split("\n")[0].endsWith(EX)), `M-11 예시를 더하지 않는 줄 — ‘${line}’ → ‘${room.split("\n")[0]}’`), `m11 skip ${line}`);
  }
  // 네·아니오 물음은 수정 창의 두 꼴만 — 다른 네·아니오 물음(단추로 답할 수 있다 — V22.9.134 의 규칙)과 끝이 아닌 곳은 예시를 받지 않는다.
  // (through 는 글을 받아 스스로 kakaoText 로 감싼다 — 단추가 있는 답은 만든 응답을 그대로 넣는다.)
  const throughReply = async (reply, payload) => {
    const data = await (await kakaoGroupCompatibleResponse(reply, payload, BASE)).json();
    return (data?.template?.outputs || []).map((o) => o?.simpleText?.text ?? o?.textCard?.description ?? "").join("\n----\n");
  };
  for (const line of ["이 답은 (네/아니오)", "정산할까요? (네/아니오)", "바꿀까요? (네/아니오) 라고 물으면 답해요"]) {
    for (const [how, reply] of [["단추 있음", kakaoText(line, [["네", "네"], ["아니오", "아니오"]])], ["단추 없음", kakaoText(line)]]) {
      const room = await throughReply(reply, roomPayload);
      check(() => ok(room.startsWith(line), `픽스처: 넣은 물음이 답에 그대로 있다(${how}) — ‘${room.split("\n")[0]}’`), `m11 yes-no input ${how} ${line}`);
      check(() => ok(!room.includes(`${BOT} 네`), `M-11 수정 창 밖의 네·아니오 물음은 예시를 받지 않는다(${how}) — ‘${line}’ → ‘${room.split("\n")[0]}’`), `m11 yes-no skip ${how} ${line}`);
    }
  }
  // 봇 부르기가 이미 든 줄은 번호 물음·번호 안내의 꼴이어도 그대로 둔다(두 번 붙이지 않는다).
  for (const line of [`${BOT} 를 붙여 번호를 보내주세요.`, `번호만 보내도 돼요: ${BOT} 1`, `번호를 보내면 → ${BOT} 1 처럼 보내요`, `${BOT} 네 로 답해 주세요. 바꿀까요? (네/아니오)`, `날짜는 (직접 입력 예: ${BOT} 7월 20일)`]) {
    const room = await through(line, roomPayload);
    check(() => eq(room.split("\n")[0], line, `M-11 봇 부르기가 이미 든 줄은 그대로 — ‘${line}’`), `m11 has mention ${line}`);
  }
  // 실제 원본 글에 그 물음이 그대로 있다(글이 바뀌면 이 규칙이 닿지 않는다).
  const sources = { "src/modules/kakao/edit-session-v4.js": ['"무엇을 바꿀까요? 번호를 보내주세요."'], "src/modules/kakao/edit-state-machine.js": ["를 누구로 바꿀까요? 번호로 골라주세요.\\n", "`결제수단을 번호로 골라주세요.\\n", "`분류를 번호로 골라주세요.\\n", "사이의 번호로 골라주세요.`", "`\\n번호만 보내도 돼요: 1 금액", "`번호를 보내면 → 바꿀 값도 번호로 골라요\\n`", "`날짜를 번호로 고르거나 직접 입력해주세요.\\n${numbered(options)}  (직접 입력 예: 7월 20일)`", " 바꿀까요? (네/아니오)\\n", " 바꾸는 건가요? (네/아니오)`"], "src/modules/kakao/edit-flow-v4.js": [" 분류를 번호로 골라 주세요.\\n", "`번호로 골라주세요.\\n", "\\n날짜를 번호로 고르거나 직접 입력해 주세요.\\n1. 오늘  2. 어제  3. 그제  (직접 입력 예: 7월 20일)`"], "src/modules/kakao/guided-flows.js": ["어느 가계부인지 번호로 골라 주세요.`"] };
  for (const [path, parts] of Object.entries(sources)) {
    const text = read(path);
    for (const part of parts) check(() => ok(text.includes(part), `M-11 원본 ${path} 에 ‘${part}’ 가 그대로 있다`), `m11 source ${part}`);
  }
}

// ── N-2 사. 웹: 구성원(WIFI♥)이 소유자(Bin)의 기록 tx-expense-2 를 고치고 지운다 ──────────────────────────
const RETURN_TO = `/app?month=${MONTH}&household_id=${HH}&tab=transactions`;
const EDIT_KEYS = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"];
function editForm(row, changes = {}) {
  const fields = { id: row.id, household_id: row.household_id, month: MONTH, return_to: RETURN_TO, type: row.type, transaction_date: row.transaction_date, amount: String(row.amount), memo: row.memo ?? "", category: row.category ?? "", payment_method: row.payment_method ?? "", user_id: row.user_id };
  for (const name of EDIT_KEYS) fields[`orig_${name}`] = String(row[name] ?? "");
  return { ...fields, ...changes };
}
const outcomeOf = (res) => {
  const params = new URL(res.location || "/", BASE).searchParams;
  if (params.get("msg")) return `msg=${params.get("msg")}`;
  if (params.get("err")) return `err=${params.get("err")}`;
  return `status=${res.status}`;
};
function trace() {
  const calls = [];
  const stop = intercept(async ({ url, method }) => {
    if (url.hostname === "mock.supabase.co") calls.push({ method, path: url.pathname.replace("/rest/v1/", ""), params: Object.fromEntries(url.searchParams) });
    return null;
  });
  return { calls, stop };
}
const patchesOf = (calls) => calls.filter((call) => call.method === "PATCH" && call.path === "transactions");
const rpcNames = (fx) => (fx.db.__rpc_calls || []).map((call) => call.name);
function raceAfterRead(fx, id, pick, change) {
  let armed = true;
  return intercept(async ({ url, method, forward }) => {
    if (!armed || method !== "GET" || url.pathname !== "/rest/v1/transactions" || url.searchParams.get("id") !== `eq.${id}`) return null;
    if (!pick(String(url.searchParams.get("select") || ""))) return null;
    armed = false;
    const response = await forward();
    Object.assign(rowOf(fx, id), change);
    return response;
  });
}
async function web(name, task) {
  try { await fixture(async (fx) => { resetIsolateState(); try { await task(fx, await fx.cookieFor("user-wifi")); } finally { resetIsolateState(); } }, { auditDeletes: true }); }
  catch (error) { failures.push(`웹 장면 ‘${name}’ 이 끝까지 가지 못함: ${String(error?.stack || error).split(/\r?\n/).slice(0, 2).join(" | ").slice(0, 300)}`); }
}
const setRole = (fx, userId, role) => { for (const member of fx.db.household_members) if (member.household_id === HH && member.user_id === userId) member.role = role; };
const addAdmin = (fx) => {
  fx.db.users.push({ id: "user-adm", kakao_user_key: "kakao_login:2267", nickname: "Adm", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: HH, user_id: "user-adm", role: "admin", created_at: "2026-07-02T00:00:00.000Z" });
};

await web("수정 폼과 저장", async (fx, wifi) => {
  check(() => ok(rowOf(fx, "tx-expense-2")?.user_id === "user-bin" && rowOf(fx, "tx-expense-1")?.user_id === "user-wifi", "픽스처: tx-expense-2 는 소유자(Bin), tx-expense-1 은 구성원(WIFI♥)의 기록"), "fixture rows");
  const form = await page(fx, `/transactions/edit?id=tx-expense-2&return_to=${encodeURIComponent(RETURN_TO)}`, { cookie: wifi });
  check(() => ok(form.status === 200 && /<form\b[^>]*action="\/admin\/update"/.test(form.html) && form.html.includes('name="orig_user_id" value="user-bin"'), `N-2 구성원에게 다른 사람의 기록 수정 폼이 열린다(${form.status} ${form.location})`), "web edit page");
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" }), { cookie: wifi }); } finally { t.stop(); }
  const patches = patchesOf(t.calls);
  check(() => eq(outcomeOf(res), "msg=updated", "N-2 /admin/update 구성원이 다른 사람의 기록을 고친다"), "admin update");
  check(() => ok(Number(rowOf(fx, "tx-expense-2")?.amount) === 5000 && rowOf(fx, "tx-expense-2")?.user_id === "user-bin", "N-2 금액만 바뀌고 지출자는 그대로"), "admin update row");
  check(() => ok(patches.length === 1 && patches[0]?.params.user_id === "eq.user-bin", `N-2 J-9 PATCH 의 지출자 조건은 ‘읽은 지출자’(user_id=eq.user-bin) — 예전 ‘= 나’ 면 늘 충돌(${patches.map((p) => p.params.user_id).join(",")})`), "admin update condition");
  // 구성원은 다른 사람의 기록이어도 지출자를 바꾸지 못한다(예전 그대로).
  const payer = await post(fx, "/admin/update", editForm(structuredClone(rowOf(fx, "tx-expense-2")), { user_id: "user-wifi" }), { cookie: wifi });
  // 구성원이 보낸 지출자 칸은 읽지 않는다(예전 그대로 — 저장은 되고 지출자는 그대로).
  check(() => ok(rowOf(fx, "tx-expense-2")?.user_id === "user-bin", `N-2 구성원의 지출자 바꾸기는 웹에서도 되지 않는다(${outcomeOf(payer)} · 지출자 ${rowOf(fx, "tx-expense-2")?.user_id})`), "admin update payer");
});

await web("저장 직전 지출자 바뀜", async (fx, wifi) => {
  addAdmin(fx);
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = raceAfterRead(fx, "tx-expense-2", (select) => select.includes("raw_text"), { user_id: "user-adm" });
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000", memo: "주유 고침" }), { cookie: wifi }); } finally { stop(); }
  check(() => ok(res.status === 409 && res.text.includes("그 사이 이 기록의 지출자가 바뀌어 저장하지 않았어요.") && res.text.includes('data-ab-edit-conflict="spender_changed"'), `N-2 J-9 다른 사람의 기록을 고치는 사이 지출자가 바뀌면 저장하지 않는다(${res.status})`), "race conflict");
  check(() => ok(Number(rowOf(fx, "tx-expense-2")?.amount) === 72000 && rowOf(fx, "tx-expense-2")?.memo === "주유" && rowOf(fx, "tx-expense-2")?.user_id === "user-adm", "N-2 J-9 바뀐 기록을 덮어쓰지 않는다"), "race row");
  check(() => ok(res.text.includes("5,000원") && res.text.includes("주유 고침") && !/<form\b/i.test(res.text), "N-2 J-9 입력한 값은 글로 남기고 다시 고칠 폼은 주지 않는다"), "race page");
});

await web("/my/update·/my/delete", async (fx, wifi) => {
  const t = trace();
  let res;
  try { res = await post(fx, "/my/update", { id: "tx-expense-2", household_id: HH, month: MONTH, amount: "6000", memo: "주유", category: "교통", payment_method: "현대카드", transaction_date: "2026-07-07", type: "expense" }, { cookie: wifi }); } finally { t.stop(); }
  const patches = patchesOf(t.calls);
  check(() => ok(outcomeOf(res) === "msg=updated" && Number(rowOf(fx, "tx-expense-2")?.amount) === 6000 && rowOf(fx, "tx-expense-2")?.user_id === "user-bin", `N-2 /my/update 구성원이 다른 사람의 기록을 고친다(${outcomeOf(res)})`), "my update");
  check(() => ok(patches.length === 1 && patches[0]?.params.user_id === "eq.user-bin", `N-2 /my/update 의 J-9 조건도 ‘읽은 지출자’(${patches.map((p) => p.params.user_id).join(",")})`), "my update condition");
  // 구성원이 보낸 지출자 칸은 /my/update 에서도 읽지 않는다(예전 그대로 — 저장은 되고 지출자는 그대로).
  const payer = await post(fx, "/my/update", { id: "tx-expense-2", household_id: HH, month: MONTH, amount: "6500", memo: "주유", category: "교통", payment_method: "현대카드", transaction_date: "2026-07-07", type: "expense", user_id: "user-wifi" }, { cookie: wifi });
  check(() => ok(rowOf(fx, "tx-expense-2")?.user_id === "user-bin" && Number(rowOf(fx, "tx-expense-2")?.amount) === 6500, `N-2 /my/update 구성원의 지출자 바꾸기는 되지 않는다(${outcomeOf(payer)} · 지출자 ${rowOf(fx, "tx-expense-2")?.user_id})`), "my update payer");
  const deleted = await post(fx, "/my/delete", { id: "tx-expense-2", household_id: HH, month: MONTH }, { cookie: wifi });
  const call = (fx.db.__rpc_calls || []).find((item) => item.name === IF_RPC && item.data?.p_transaction_id === "tx-expense-2");
  check(() => ok(outcomeOf(deleted) === "msg=deleted" && !rowOf(fx, "tx-expense-2") && call?.data?.p_expected?.user_id === "user-bin" && !rpcNames(fx).includes(V227_DELETE), `N-2 /my/delete 구성원이 다른 사람의 기록을 조건부 삭제 함수로 지운다(${outcomeOf(deleted)} · ${call?.data?.p_expected?.user_id})`), "my delete");
});

await web("/admin/delete", async (fx, wifi) => {
  const res = await post(fx, "/admin/delete", { id: "tx-expense-2", household_id: HH, month: MONTH, return_to: RETURN_TO }, { cookie: wifi, accept: "application/json" });
  const data = JSON.parse(res.text || "{}");
  const call = (fx.db.__rpc_calls || []).find((item) => item.name === IF_RPC && item.data?.p_transaction_id === "tx-expense-2");
  check(() => ok(res.status === 200 && data.ok === true && data.deleted === true && !rowOf(fx, "tx-expense-2"), `N-2 /admin/delete 구성원이 다른 사람의 기록을 지운다(${res.status})`), "admin delete");
  check(() => ok(call?.data?.p_expected?.user_id === "user-bin" && !rpcNames(fx).includes(V227_DELETE), "N-2 구성원은 읽은 지출자를 견주는 조건부 삭제 함수로 지운다(조건 없는 감사 삭제 함수가 아니다)"), "admin delete conditional");
  check(() => ok(new URL(data.location || "/", BASE).searchParams.get("restore"), "N-2 되돌리기 표는 예전처럼 싣는다"), "admin delete restore");
});

// ── N-2 라-8. 웹에서 남의 기록을 고친 뒤의 채팅 ‘방금’ 도 묻는다(감사 기록은 웹·채팅 어느 길로 고쳐도 남는다) ──
await scene("웹에서 고친 뒤 채팅의 방금", async (fx) => {
  await say(fx, "커피 4500원", { user: WIFI });
  const coffee = () => fx.db.transactions.find((row) => row.household_id === HH && row.memo === "커피" && row.transaction_date === DAY) || null;
  if (coffee()) coffee().created_at = new Date(Date.now() - 10000).toISOString();
  const wifi = await fx.cookieFor("user-wifi");
  const res = await post(fx, "/admin/update", editForm(structuredClone(rowOf(fx, "tx-expense-2")), { amount: "5000" }), { cookie: wifi });
  check(() => ok(outcomeOf(res) === "msg=updated" && Number(rowOf(fx, "tx-expense-2")?.amount) === 5000 && (fx.db.accountbook_transaction_audit || []).some((row) => row.action === "update" && row.actor_user_id === "user-wifi" && row.transaction_id === "tx-expense-2"), `픽스처: 구성원이 웹에서 소유자의 기록을 고쳤고 감사 기록이 남았다(${outcomeOf(res)})`), "web touched fixture");
  const ask = await say(fx, "방금 삭제", { user: WIFI });
  check(() => ok(ask.lines[0] === TOUCHED_HEAD && ask.lines.some((line) => line.startsWith("마지막에 바뀐 기록: ") && line.includes("주유 / 5,000원")) && coffee() && rowOf(fx, "tx-expense-2"), `N-2 웹에서 남의 기록을 고친 뒤 채팅의 ‘방금 삭제’ 도 묻는다(${ask.lines.slice(0, 3).join(" | ")})`), "web touched asks");
});

await web("다른 가계부·조회 전용·기록만", async (fx, wifi) => {
  const trip = await post(fx, "/admin/delete", { id: "tx-trip-1", household_id: "house-trip", month: MONTH, return_to: RETURN_TO }, { cookie: wifi, accept: "application/json" });
  check(() => ok([403, 404].includes(trip.status) && rowOf(fx, "tx-trip-1"), `N-2 구성원이 아닌 가계부의 기록은 지우지 못한다(${trip.status})`), "other household");
  const tripEdit = await post(fx, "/admin/update", editForm(structuredClone(rowOf(fx, "tx-trip-1")), { amount: "1000" }), { cookie: wifi });
  check(() => ok(Number(rowOf(fx, "tx-trip-1")?.amount) === 215000 && outcomeOf(tripEdit) !== "msg=updated", `N-2 구성원이 아닌 가계부의 기록은 고치지 못한다(${outcomeOf(tripEdit)})`), "other household edit");
  const home = await page(fx, `/app?month=${MONTH}&household_id=${HH}&tab=transactions`, { cookie: wifi });
  check(() => ok(home.status === 200 && home.html.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-2') && home.html.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-1'), `N-2 구성원의 거래내역에 다른 사람의 기록도 수정·삭제 단추가 열린다(${home.status})`), "home buttons member");
  setRole(fx, "user-wifi", "viewer");
  resetIsolateState();
  const viewerHome = await page(fx, `/app?month=${MONTH}&household_id=${HH}&tab=transactions`, { cookie: wifi });
  check(() => ok(viewerHome.status === 200 && !viewerHome.html.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-2'), "N-2 조회 전용에게는 수정·삭제 단추가 없다"), "home buttons viewer");
  const viewerEdit = await post(fx, "/admin/update", editForm(structuredClone(rowOf(fx, "tx-expense-2")), { amount: "1000" }), { cookie: wifi });
  const viewerDelete = await post(fx, "/admin/delete", { id: "tx-expense-2", household_id: HH, month: MONTH, return_to: RETURN_TO }, { cookie: wifi, accept: "application/json" });
  check(() => ok(Number(rowOf(fx, "tx-expense-2")?.amount) === 72000 && outcomeOf(viewerEdit) !== "msg=updated" && viewerDelete.status === 403, `N-2 조회 전용은 웹에서도 고치거나 지우지 못한다(${outcomeOf(viewerEdit)} · ${viewerDelete.status})`), "viewer web");
  setRole(fx, "user-wifi", "member");
  putSetting(fx, "household_member_policy_v22943:house-home", { version: 1, mode: "record_only" });
  resetIsolateState();
  const policyHome = await page(fx, `/app?month=${MONTH}&household_id=${HH}&tab=transactions`, { cookie: wifi });
  check(() => ok(policyHome.status === 200 && !policyHome.html.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-2') && !policyHome.html.includes('data-ab-edit-src="/transactions/edit?id=tx-expense-1'), "N-2 ‘기록만’ 이면 구성원에게 수정·삭제 단추가 없다(자기 기록도)"), "home buttons record only");
  const policyEdit = await post(fx, "/admin/update", editForm(structuredClone(rowOf(fx, "tx-expense-2")), { amount: "1000" }), { cookie: wifi });
  check(() => ok(outcomeOf(policyEdit) === "err=member_record_only" && Number(rowOf(fx, "tx-expense-2")?.amount) === 72000, `N-2 ‘기록만’ 이면 웹에서도 다른 사람의 기록을 고치지 못한다(${outcomeOf(policyEdit)})`), "record only web");
});

// ── 원본 확인 ───────────────────────────────────────────────────────────────────────────────
{
  const save = read("src/modules/kakao/transaction-save.js");
  check(() => ok(save.includes("dailyRows ? kakaoDailySeqPairFromRowsV229135(dailyRows, saved, user.id, kakaoUserKey)") && save.includes("ownSeq === 1"), "원본: 저장 답의 번호는 저장 전에 읽은 그날 기록으로 매긴다(저장 뒤 다시 읽지 않는다 — DB 요청 수 그대로), 그날 첫 기록은 내 번호(ownSeq)로 본다"), "source save seq");
  const access = read("src/modules/my/access-control.js");
  check(() => ok(access.includes('"구성원은 기록하고, 다른 사람의 기록도 고치거나 지울 수 있어요."') && access.includes('"내 권한: 기록·수정 (이 가계부의 기록을 고치고 지울 수 있어요)"') && !access.includes("자기가 쓴 기록을 고치거나") && !access.includes("내가 쓴 기록은 고치고"), "원본: 구성원 권한 설명이 새 규칙과 같다"), "source policy texts");
  const texts = read("src/modules/kakao/reply-texts.js");
  check(() => ok(texts.includes('not_my_record: "이 기록을 바꿀 권한이 없습니다. 지금 가계부의 기록인지 확인하거나 소유자·관리자에게 요청해 주세요."'), "원본: 권한 없음 답은 ‘내 기록이 아니’ 라고 하지 않는다(다른 가계부·없는 기록도 같은 답)"), "source not my record");
  const guides = ["src/modules/admin/guide-pages.js", "src/modules/features/settlement-ops-pages.js", "src/modules/my/households-lifecycle.js"].map(read).join("\n");
  check(() => ok(guides.includes("다른 사람의 기록 포함") && !/member\s*(?:는|은)?\s*자기 기록/.test(guides), "원본: 안내 화면의 권한 설명도 새 규칙"), "source guides");
  const builders = read("src/modules/kakao/response-builders.js");
  check(() => ok(builders.includes("const KAKAO_GROUP_NUMBER_PROMPT_V229135 = /(?:번호를 보내 ?주세요|번호로 골라 ?주세요|번호로 고르거나 직접 입력해 ?주세요)[.]$/;") && builders.includes("const KAKAO_GROUP_YES_NO_PROMPT_V229135 = /(?:바꿀까요|바꾸는 건가요)[?] [(]네\\/아니오[)]$/;") && builders.includes("const numbered = kakaoGroupNumberLineV229135(line, lines[index + 1] || \"\");"), "원본: 번호·네아니오 물음 규칙은 응답 마무리의 줄 고치기 한 곳"), "source m11");
  const all = ["src/modules/kakao/edit-flow-v4.js", "src/modules/kakao/edit-session-v4.js", "src/modules/kakao/reply-texts.js", "src/modules/my/access-control.js"].map(read).join("\n");
  check(() => ok(!/["`][^"`\n]*(?:내 기록만 보여요|번호는 기록한 사람마다)[^"`\n]*["`]/.test(all), "원본: 답 글에 ‘내 기록만 보여요’·‘번호는 기록한 사람마다’ 가 남지 않았다"), "source old texts");
  check(() => ok(!/무료|평생/.test(builders.slice(builders.indexOf("KAKAO_GROUP_NUMBER_PROMPT_V229135"), builders.indexOf("KAKAO_GROUP_NUMBER_PROMPT_V229135") + 1200)), "원본: 고친 글에 ‘무료’·앞날 약속이 없다"), "copy rules");
}

if (failures.length) {
  console.error(`함께 고치는 가계부 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
