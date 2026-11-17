// V22.9.126 카카오 챗봇 결함 수정(출시 전 최종 점검 2026-11-16) 검사.
//   FC-1  늦은 답(응답 예산 초과): 기록을 바꾸는 명령(지우기·되살리기·고치기)에 그 명령을 다시 보내는 단추·문장을 주지 않는다.
//         뒤 작업이 끝나면 기록은 한 번만 바뀌고, 단추(목록 보기)를 눌러도 바뀌지 않는다. 같은 명령을 다시 보내면 다른 기록이 바뀐다(예전 단추의 결과).
//   FC-4  앞 기록이 쓰기 잠금을 잡고 있을 때 두 번째 기록의 답.
//   FC-5  ‘남은예산’ 의 예산 읽기가 실패하면 ‘불러오지 못했어요’(예전에는 예산이 있어도 ‘아직 예산이 없어요’). 예산이 정말 없을 때의 답은 그대로.
//   FC-10 고치는 금액이 단위 없는 한 자리 수면 새 기록(N11)과 같은 문장으로 다시 묻는다(‘5원’·‘5천원’·‘12’ 는 그대로).
//   FC-11 ‘수정 01번 내용 자동차보험’ 처럼 고치기로 읽히는 말은 공개 안내보다 고치기가 먼저다.
//   FC-12 달 없는 ‘N일’ 이 아직 오지 않은 날로 풀리면 날짜를 고치지 않고 새 기록과 같은 문장으로 다시 묻는다.
//   FC-13 ‘최근 기록’ 목록은 번호 대신 점, 아래 안내는 ‘오늘기록’ 한 줄.
//   FC-16 카카오 ‘정산’ 은 지출자 미지정 금액을 한 줄로 알린다.
//   FC-19 읽지 못하는 저장 표식, 고친 뒤 세션 정리 쓰기 실패, 60자 넘는 문장의 중복 안내.
//   D-7   금액이 분명한 기록 문장의 ‘초대’ 낱말(승인 대기 사람·가계부 고르기 전·반복 방지).
// 네트워크를 쓰지 않는다(메모리 픽스처). 늦은 답 장면은 응답 예산을 하한(200 ms)으로 두고 가짜 저장소 호출마다 그보다 긴 지연을 넣는다.
// 지연은 일을 끝내는 쪽만 늦추므로 기계가 바빠도 늦은 답이 나온다(걸린 시간 자체는 검사하지 않는다). 시계는 2026-11-10(화) 12:00 KST 에서 메시지마다 1분씩 간다.
// 실행: node validation/validate-v229126-kakao.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { randomUUID } from "node:crypto";
import { app, BASE, counter, fixture, failure, putSetting, settingValue } from "./lib-audit-v22934.mjs";

const t = counter("v229126 kakao fixes");
const SECRET = "kakao-fixes-secret-v229126";
const OWNER = "kakao_login:2265"; // user-bin, house-home 소유자(초대코드 HOME2265)
const PENDING_USER = "kakao_login:2296";
const HOME = "house-home";
const SELECT_KEY = "kakao_selected_household_v2251:user-bin";
const MARKER_KEY = `kakao_edit_v2254:${HOME}:pending_write:user-bin`;
const WRITER_LOCK = `kakao-message:writer:${HOME}:user-bin`;
const ROOM = "7".repeat(64);
const TODAY = "2026-11-10", YESTERDAY = "2026-11-09";
const SEED = ["커피 4500", "택시 8000", "점심 12000"];
const SLOW_MS = 250; // 응답 예산 하한(200 ms)보다 길다.
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const noUrl = (text) => !/https?:\/\//i.test(text);
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];

const GUARDS = ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE"];
const clearGuards = () => { for (const name of GUARDS) globalThis[name]?.clear?.(); };

// 가짜 저장소 앞의 그물: 호출마다 지연(net.delayMs)·실패 주입(net.hook). 바뀐 거래 행의 updated_at 은 DB 트리거처럼 새로 찍는다.
let lastStamp = 0;
const stamp = () => { lastStamp = Math.max(Date.now(), lastStamp + 1); return new Date(lastStamp).toISOString(); };
const rowSig = (row) => JSON.stringify(Object.entries(row).filter(([key]) => key !== "updated_at" && key !== "created_at").sort(([a], [b]) => a.localeCompare(b)));
function installNet(fx) {
  const net = { delayMs: 0, hook: null };
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String(init.method || (typeof input === "object" && input.method) || "GET").toUpperCase();
    if (net.hook) { const injected = await net.hook({ url, method, init }); if (injected) return injected; }
    if (net.delayMs && url.hostname === "mock.supabase.co") await sleep(net.delayMs);
    const before = new Map(fx.db.transactions.map((row) => [row.id, rowSig(row)]));
    const response = await inner(input, init);
    for (const row of fx.db.transactions) {
      if (!before.has(row.id)) { if (!row.updated_at) row.updated_at = row.created_at || stamp(); }
      else if (before.get(row.id) !== rowSig(row)) row.updated_at = stamp();
    }
    return response;
  };
  return net;
}

function payloadFor(utterance, { user = OWNER, room = "" } = {}) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
// Secret 으로 확인된 /skill 요청 한 번. 답 뒤 일(waitUntil)은 settle() 로 기다린다. 단추는 [이름, 보내는 말] 목록(빠른 답·카드 단추).
async function send(fx, utterance, { user = OWNER, room = "", clear = true } = {}) {
  if (clear) clearGuards();
  globalThis.__AB_QA_FIXED_NOW_MS += 60_000;
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  let body = null;
  try { body = JSON.parse(raw); } catch (_) {}
  const buttons = [
    ...(body?.template?.quickReplies || []).map((q) => [q.label, q.messageText ?? q.label]),
    ...(body?.template?.outputs || []).flatMap((output) => output.textCard?.buttons || []).filter((b) => b.action === "message").map((b) => [b.label, b.messageText ?? b.label]),
  ];
  return {
    status: response.status, nlu: response.headers.get("x-accountbook-nlu-result") || "", text: body ? textOf(body) : raw, buttons,
    async settle() { for (let round = 0; round < 12 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0)); },
  };
}
async function say(fx, utterance, options) { const reply = await send(fx, utterance, options); await reply.settle(); return reply; }

// 장면마다 새 픽스처. house-home 을 1:1 의 고른 가계부로 두고, 11월 기록은 이 검사가 넣은 것만 남긴다.
async function scene(task, env = {}) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${TODAY}T12:00:00+09:00`);
  try {
    return await fixture(async (fx) => {
      clearGuards();
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      Object.assign(fx.env, env);
      fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === HOME && String(row.transaction_date || "").startsWith("2026-11")));
      putSetting(fx, SELECT_KEY, HOME);
      const net = installNet(fx);
      return await task(fx, net);
    });
  } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}
// 그날 내 카카오 기록(번호 순서 = 만든 순서)을 ‘메모 금액’ 으로.
const day = (fx, date) => fx.db.transactions
  .filter((row) => row.household_id === HOME && row.transaction_date === date && row.source_user_key === OWNER)
  .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)))
  .map((row) => `${row.memo || row.raw_text} ${Number(row.amount)}`);
const state = (fx) => JSON.stringify({ today: day(fx, TODAY), yesterday: day(fx, YESTERDAY) });
// 열린 수정 세션을 닫는다. 세션 표시(edit-session-v4 의 같은 isolate 메모리)는 장면이 바뀌어도 남아 다음 장면의 반복 방지 등을 바꾼다.
async function closeSession(fx) {
  const reply = await say(fx, "취소");
  t.ok(/취소|끝냈어요|종료/.test(reply.text), `장면 정리: 열린 수정 세션을 닫는다 (${reply.text.split("\n")[0]})`);
}
async function seed(fx, list = SEED, options = {}) {
  for (const utterance of list) {
    const reply = await say(fx, utterance, options);
    t.ok(/저장했어요/.test(reply.text), `준비 ‘${utterance}’ 저장 (${reply.text.split("\n")[0]})`);
  }
}
const changeDeferredText = (list) => `기록 변경 확인이 조금 늦어지고 있어요 😊\n같은 명령을 다시 보내지 말고 잠시 뒤 ‘${list}’에서 확인해 주세요. 다시 보내면 다른 기록까지 바뀔 수 있어요.`;
// 기록을 바꾸는 명령 꼴(단추가 이런 말을 보내면 안 된다).
const CHANGE_WORDS = /(?:삭제|지워|지우|복구|되살|수정|고쳐|바꿔|취소|\d+\s*번)/;

// ── FC-1 늦은 답: 기록을 바꾸는 명령 ─────────────────────────────────────────────
const JULY_10 = "2026-07-10";
const stateOf = state;
const CHANGE_CASES = [
  { command: "삭제 01번", list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["점심 12000"], yesterday: [] } },
  // 2차 검토: ‘방금’ 은 마지막으로 저장한 기록(다른 날일 수 있다)이라 그 기록을 고르는 ‘최근기록’ 에서 확인하게 한다.
  { command: "방금 삭제", list: "최근기록", after: { today: ["커피 4500", "택시 8000"], yesterday: [] }, again: { today: ["커피 4500"], yesterday: [] } },
  { command: "방금 삭제", note: "마지막 기록이 어제", extra: ["어제 우유 3000"], list: "최근기록", after: { today: SEED, yesterday: [] }, again: { today: ["커피 4500", "택시 8000"], yesterday: [] } },
  { command: "복구", prep: ["삭제 01번", "삭제 01번"], list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["커피 4500", "택시 8000", "점심 12000"], yesterday: [] } },
  { command: "수정 01번 날짜 어제", list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: ["커피 4500"] }, again: { today: ["점심 12000"], yesterday: ["커피 4500", "택시 8000"] } },
  // 14자가 넘는 명령(예전에는 ‘같은 내용을 다시 보내 주세요’ 만 했다)과 그날 목록 단추.
  { command: "2026년 11월 9일 삭제 01번", extra: ["어제 우유 3000", "어제 빵 5000"], list: `${YESTERDAY} 기록`,
    after: { today: SEED, yesterday: ["빵 5000"] }, again: { today: SEED, yesterday: [] } },
  { command: "삭제 01번", room: true, list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["점심 12000"], yesterday: [] } },
  // 2차 검토: 본 처리(commandText)처럼 전각 숫자·끝의 ‘ㅠ·ㅋ·.’·앞 그림 문자를 다듬어 읽는다(예전에는 같은 명령 단추를 받았다).
  { command: "삭제 ０１번", list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["점심 12000"], yesterday: [] } },
  { command: "방금 삭제ㅠ", list: "최근기록", after: { today: ["커피 4500", "택시 8000"], yesterday: [] }, again: { today: ["커피 4500"], yesterday: [] } },
  { command: "복구.", prep: ["삭제 01번", "삭제 01번"], list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["커피 4500", "택시 8000", "점심 12000"], yesterday: [] } },
  { command: "🗑️ 삭제 01번", list: "오늘기록", after: { today: ["택시 8000", "점심 12000"], yesterday: [] }, again: { today: ["점심 12000"], yesterday: [] } },
  { command: "어제 삭제 01번ㅠㅠ", extra: ["어제 우유 3000", "어제 빵 5000"], list: `${YESTERDAY} 기록`, after: { today: SEED, yesterday: ["빵 5000"] }, again: { today: SEED, yesterday: [] } },
  { command: "7/10 01번 삭제", extra: ["7월 10일 우유 3000", "7월 10일 빵 5000"], extraDay: JULY_10, list: `${JULY_10} 기록`,
    after: { today: SEED, yesterday: [], [JULY_10]: ["빵 5000"] }, again: { today: SEED, yesterday: [], [JULY_10]: [] } },
];
for (const item of CHANGE_CASES) {
  const label = `FC-1 ${item.room ? "단톡방" : "1:1"} ‘${item.command}’${item.note ? `(${item.note})` : ""}`;
  await scene(async (fx, net) => {
    const state = (fx) => JSON.stringify({ ...JSON.parse(stateOf(fx)), ...(item.extraDay ? { [item.extraDay]: day(fx, item.extraDay) } : {}) });
    const room = item.room ? ROOM : "";
    if (room) t.ok((await say(fx, "단톡방 연결 HOME2265", { room })).text.includes("단톡방 연결 완료"), `${label}: 준비 — 방을 house-home 에 연결`);
    await seed(fx, [...SEED, ...(item.extra || [])], { room });
    for (const utterance of item.prep || []) t.ok(/삭제했어요/.test((await say(fx, utterance, { room })).text), `${label}: 준비 ‘${utterance}’`);
    net.delayMs = SLOW_MS;
    const reply = await send(fx, item.command, { room });
    net.delayMs = 0;
    t.eq(reply.nlu, "deferred", `${label}: 응답 예산을 넘겨 늦은 답이 나간다`);
    t.eq(reply.text, changeDeferredText(item.list), `${label}: 늦은 답 글 — 같은 명령을 다시 보내지 말고 목록에서 확인`);
    t.deepEq(reply.buttons, [[item.list, item.list]], `${label}: 단추는 목록 보기 하나`);
    t.ok(reply.buttons.every(([, sends]) => sends !== item.command && !CHANGE_WORDS.test(sends)), `${label}: 기록을 바꾸는 말을 보내는 단추가 없다`);
    t.ok(!reply.text.includes(`‘${item.command}’`) && noUrl(reply.text), `${label}: 글에 그 명령(다시 보내기)과 주소가 없다`);
    await reply.settle();
    t.eq(state(fx), JSON.stringify(item.after), `${label}: 뒤 작업이 끝나면 기록은 한 번만 바뀐다`);
    const press = await say(fx, item.list, { room });
    t.ok(press.text.includes("기록") && !/삭제했어요|복구했어요|변경했어요/.test(press.text), `${label}: 단추(‘${item.list}’)는 목록만 보여 준다 (${press.text.split("\n")[0]})`);
    t.eq(state(fx), JSON.stringify(item.after), `${label}: 단추를 눌러도 기록은 그대로`);
    // 예전 늦은 답의 단추(같은 명령)를 누른 것과 같다: 이미 끝난 일 위에 한 번 더 — 다른 기록이 바뀐다.
    await say(fx, item.command, { room });
    t.eq(state(fx), JSON.stringify(item.again), `${label}: (예전 단추) 같은 명령을 다시 보내면 다른 기록이 바뀐다`);
  }, { KAKAO_RESPONSE_BUDGET_MS: "200" });
}

// 2차 검토: 기록을 고르지 않는 명령(메뉴만 여는 고치기, 안내 낱말)은 ‘기록 변경’·‘다른 기록까지 바뀔 수 있어요’ 라고 하지 않는다. 다시 보내기 단추도 없다.
const neutralDeferredText = (list) => `확인이 조금 늦어지고 있어요 😊\n잠시 뒤 ‘${list}’에서 확인해 주세요.`;
const NEUTRAL_CASES = [
  { command: "수정 01번", list: "오늘기록", session: true },
  { command: "어제 수정 01번", extra: ["어제 우유 3000"], list: `${YESTERDAY} 기록`, session: true },
  { command: "방금 거 수정", list: "최근기록", session: true },
  { command: "취소", list: "오늘기록" },
  { command: "잘못 입력", list: "오늘기록" },
  { command: "방금 취소", list: "오늘기록" },
  { command: "삭제", list: "오늘기록" },
];
for (const item of NEUTRAL_CASES) {
  const label = `FC-1 기록을 바꾸지 않는 ‘${item.command}’`;
  await scene(async (fx, net) => {
    await seed(fx, [...SEED, ...(item.extra || [])]);
    const before = state(fx);
    net.delayMs = SLOW_MS;
    const reply = await send(fx, item.command);
    net.delayMs = 0;
    t.eq(reply.nlu, "deferred", `${label}: 늦은 답`);
    t.eq(reply.text, neutralDeferredText(item.list), `${label}: ‘기록 변경’ 이라 하지 않는 늦은 답`);
    t.deepEq(reply.buttons, [[item.list, item.list]], `${label}: 단추는 목록 보기 하나`);
    t.ok(reply.buttons.every(([, sends]) => !CHANGE_WORDS.test(sends)), `${label}: 다시 보내기 단추가 없다`);
    await reply.settle();
    t.eq(state(fx), before, `${label}: 기록은 그대로`);
    const press = await say(fx, item.list);
    t.ok(!/삭제했어요|복구했어요|변경했어요/.test(press.text), `${label}: 단추는 목록만 보여 준다 (${press.text.split("\n")[0]})`);
    t.eq(state(fx), before, `${label}: 단추를 눌러도 기록은 그대로`);
    if (item.session) await closeSession(fx);
  }, { KAKAO_RESPONSE_BUDGET_MS: "200" });
}

// 번호 없는 ‘지출자 Bin’ 은 ‘방금’ 기록의 지출자를 바꾼다(끝의 ‘ㅋ’ 는 본 처리처럼 다듬는다) — 그 기록을 고르는 ‘최근기록’ 으로 확인하게 한다.
// 3차 검토: 뒤 작업이 끝난 뒤 ‘방금’ 기록(점심)의 지출자만 한 번 바뀐다. (‘최근기록’·‘오늘기록’ 목록은 지출자를 보여 주지 않는다 — 단추로는 결과 확인 불가.)
// 4차 검토: 세 기록 모두 다른 지출자(Wifi)로 시작해, 다른 기록을 Bin 으로 바꾸는 결함도 드러나게 한다.
const spenders = (fx) => JSON.stringify(fx.db.transactions.filter((row) => row.household_id === HOME && row.transaction_date === TODAY && row.source_user_key === OWNER).map((row) => `${row.memo}:${row.user_id}`));
await scene(async (fx, net) => {
  await seed(fx);
  for (const row of fx.db.transactions) if (row.household_id === HOME && row.transaction_date === TODAY) row.user_id = "user-wifi";
  t.eq(spenders(fx), JSON.stringify(["커피:user-wifi", "택시:user-wifi", "점심:user-wifi"]), "FC-1 ‘지출자 Binㅋ’: 준비 — 세 기록 모두 Wifi");
  net.delayMs = SLOW_MS;
  const reply = await send(fx, "지출자 Binㅋ");
  net.delayMs = 0;
  await reply.settle();
  t.eq(reply.text, changeDeferredText("최근기록"), "FC-1 ‘지출자 Binㅋ’: 기록 변경 늦은 답");
  t.deepEq(reply.buttons, [["최근기록", "최근기록"]], "FC-1 ‘지출자 Binㅋ’: 단추는 ‘최근기록’ 하나");
  t.eq(spenders(fx), JSON.stringify(["커피:user-wifi", "택시:user-wifi", "점심:user-bin"]), "FC-1 ‘지출자 Binㅋ’: 뒤 작업이 끝나면 ‘방금’ 기록(점심)의 지출자만 Bin 으로 바뀐다");
  t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), "FC-1 ‘지출자 Binㅋ’: 다른 칸·다른 기록은 그대로");
}, { KAKAO_RESPONSE_BUDGET_MS: "200" });

// 3차 검토: 금액이 든 기록 문장은 고치는 낱말(삭제·복구·취소·수정)이 있어도 늦은 답이 기록 분기(다시 보내지 말고 목록에서 확인)이고, 한 번만 저장된다.
for (const utterance of ["삭제된 영수증 재발급 3000원", "복구비 50000", "취소 수수료 2000원", "수정테이프 1500"]) {
  await scene(async (fx, net) => {
    await seed(fx);
    net.delayMs = SLOW_MS;
    const reply = await send(fx, utterance);
    net.delayMs = 0;
    await reply.settle();
    t.eq(reply.text, "기록 저장 확인이 조금 늦어지고 있어요 😊\n같은 내용을 다시 보내지 말고 잠시 뒤 ‘오늘기록’에서 확인해 주세요.", `FC-1 ‘${utterance}’: 기록 분기의 늦은 답`);
    t.deepEq(reply.buttons, [["오늘기록", "오늘기록"]], `FC-1 ‘${utterance}’: 단추는 ‘오늘기록’ 하나`);
    t.eq(fx.db.transactions.filter((row) => row.raw_text === utterance).length, 1, `FC-1 ‘${utterance}’: 뒤 작업이 끝나면 한 번 저장된다`);
    t.eq(JSON.stringify(day(fx, TODAY).slice(0, 3)), JSON.stringify(SEED), `FC-1 ‘${utterance}’: 앞 기록은 그대로`);
  }, { KAKAO_RESPONSE_BUDGET_MS: "200" });
}

// 3차 검토: 공백 변형(여러 칸·탭·줄바꿈·끝 공백)도 본 처리처럼 읽는다 — 다시 보내기 단추 없이 목록으로 확인하게 한다.
// 4차 검토: 뒤 작업이 바꾼 기록을 정확히 본다(다른 번호를 지우면 실패한다). ‘방금’ 은 마지막에 저장한 점심이다.
for (const [command, list, prep, after] of [
  ["삭제  01번", "오늘기록", [], ["택시 8000", "점심 12000"]],
  ["삭제\t01번", "오늘기록", [], ["택시 8000", "점심 12000"]],
  ["방금\n삭제", "최근기록", [], ["커피 4500", "택시 8000"]],
  ["복구   ", "오늘기록", ["삭제 02번"], SEED],
]) {
  await scene(async (fx, net) => {
    await seed(fx);
    for (const utterance of prep) await say(fx, utterance);
    if (prep.length) t.eq(state(fx), JSON.stringify({ today: ["커피 4500", "점심 12000"], yesterday: [] }), `FC-1 공백 변형 ${JSON.stringify(command)}: 준비 — 02번(택시)을 지웠다`);
    net.delayMs = SLOW_MS;
    const reply = await send(fx, command);
    net.delayMs = 0;
    await reply.settle();
    t.eq(reply.text, changeDeferredText(list), `FC-1 공백 변형 ${JSON.stringify(command)}: 기록 변경 늦은 답`);
    t.deepEq(reply.buttons, [[list, list]], `FC-1 공백 변형 ${JSON.stringify(command)}: 단추는 목록 보기 하나`);
    t.eq(state(fx), JSON.stringify({ today: after, yesterday: [] }), `FC-1 공백 변형 ${JSON.stringify(command)}: 뒤 작업이 그 기록만 바꾼다`);
  }, { KAKAO_RESPONSE_BUDGET_MS: "200" });
}

// 조회의 늦은 답과 기록 분기(금액이 든 고치기)는 예전 그대로다.
await scene(async (fx, net) => {
  await seed(fx);
  net.delayMs = SLOW_MS;
  const summary = await send(fx, "이번달요약");
  net.delayMs = 0;
  await summary.settle();
  t.eq(summary.nlu, "deferred", "FC-1 조회 ‘이번달요약’: 늦은 답");
  t.eq(summary.text, "확인이 조금 늦어지고 있어요 😊\n잠시 뒤 ‘이번달요약’ 버튼을 눌러 다시 물어봐 주세요.", "FC-1 조회: 늦은 답 글은 예전 그대로(같은 질문을 다시 묻는 단추)");
  t.deepEq(summary.buttons, [["이번달요약", "이번달요약"]], "FC-1 조회: 같은 질문 단추 그대로");
  net.delayMs = SLOW_MS;
  const amountEdit = await send(fx, "수정 01번 금액 13000");
  net.delayMs = 0;
  await amountEdit.settle();
  t.eq(amountEdit.nlu, "deferred", "FC-1 ‘수정 01번 금액 13000’: 늦은 답");
  t.eq(amountEdit.text, "기록 저장 확인이 조금 늦어지고 있어요 😊\n같은 내용을 다시 보내지 말고 잠시 뒤 ‘오늘기록’에서 확인해 주세요.", "FC-1 금액이 든 고치기: 기록 분기의 확인 안내(예전 그대로, 다시 보내라고 하지 않는다)");
  t.deepEq(amountEdit.buttons, [["오늘기록", "오늘기록"]], "FC-1 금액이 든 고치기: 단추는 ‘오늘기록’");
  t.eq(state(fx), JSON.stringify({ today: ["커피 13000", "택시 8000", "점심 12000"], yesterday: [] }), "FC-1 금액이 든 고치기: 뒤 작업이 끝나면 한 번 바뀐다");
}, { KAKAO_RESPONSE_BUDGET_MS: "200" });

// ── FC-4 앞 기록이 쓰기 잠금을 잡고 있을 때 ──────────────────────────────────────
await scene(async (fx) => {
  await seed(fx, ["커피 4500"]);
  // 앞 요청이 아직 잠금을 잡고 있다(첫 기록이 남긴 풀린 잠금 행을 그 요청의 것으로 바꾼다).
  fx.db.accountbook_operation_locks = fx.db.accountbook_operation_locks.filter((row) => row.operation_key !== WRITER_LOCK);
  fx.db.accountbook_operation_locks.push({ operation_key: WRITER_LOCK, owner: "kakao-message:earlier-request", locked_until: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString() });
  const busy = await say(fx, "택시 8000");
  t.eq(busy.text, "앞서 보낸 기록을 저장하는 중이라 이번 내용은 저장하지 않았어요. 같은 내용이면 그대로 두고, 다른 기록이면 잠시 뒤 다시 보내 주세요.", "FC-4 잠금이 잡혀 있으면: 앞 기록 때문이라고 말하고 다른 기록이면 다시 보내라고 한다");
  t.ok(!busy.text.includes("같은 내용을 처리 중"), "FC-4 예전 문구(‘같은 내용을 처리 중’, 다른 내용인데도)가 없다");
  t.eq(state(fx), JSON.stringify({ today: ["커피 4500"], yesterday: [] }), "FC-4 이번 내용은 저장하지 않았다(잠금 동작 그대로)");
  fx.db.accountbook_operation_locks = fx.db.accountbook_operation_locks.filter((row) => row.operation_key !== WRITER_LOCK);
  t.ok(/저장했어요/.test((await say(fx, "택시 8000")).text), "FC-4 앞 기록이 끝난 뒤 다시 보내면 저장된다");
  t.eq(state(fx), JSON.stringify({ today: ["커피 4500", "택시 8000"], yesterday: [] }), "FC-4 다시 보낸 기록 한 건");
});

// ── FC-5 ‘남은예산’ 의 예산 읽기 실패 ─────────────────────────────────────────────
const BUDGET_FAILED = "💰 예산 현황을 불러오지 못했어요. 잠시 후 ‘남은예산’을 다시 입력해 주세요.";
await scene(async (fx, net) => {
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HOME);
  const none = await say(fx, "남은예산");
  t.ok(none.text.includes("아직 예산이 없어요") && !none.text.includes("불러오지 못했어요"), `FC-5 예산이 정말 없으면 예전 답 그대로 (${none.text.split("\n")[0]})`);
  fx.db.accountbook_budgets.push({ id: "v229126-budget", household_id: HOME, month: "2026-11", category: "__total", amount: 500000, created_at: "2026-11-01T00:00:00.000Z" });
  const shown = await say(fx, "남은예산");
  t.ok(shown.text.includes("500,000원") && !shown.text.includes("아직 예산이 없어요"), "FC-5 읽기가 되면 저장된 예산을 보여 준다");
  net.hook = ({ url, method }) => method === "GET" && url.pathname === "/rest/v1/accountbook_budgets" ? failure(500, "simulated budget read failure") : null;
  const failed = await say(fx, "남은예산");
  net.hook = null;
  t.ok(failed.text.includes(BUDGET_FAILED), `FC-5 예산 읽기 실패: ‘불러오지 못했어요’ (${failed.text.split("\n")[0]})`);
  t.ok(!failed.text.includes("아직 예산이 없어요"), "FC-5 예산 읽기 실패: 저장된 예산을 ‘없다’고 하지 않는다");
});

// ── FC-10 고치는 금액이 단위 없는 한 자리 수 ─────────────────────────────────────
const smallAsk = (n) => `금액이 ${n}원으로 읽혀 저장하지 않았어요. 정말 ${n}원이면 "${n}원"처럼 원을 붙여 다시 보내 주세요.`;
await scene(async (fx) => {
  const fresh = await say(fx, "커피 5");
  t.ok(fresh.text.includes(smallAsk(5)), `FC-10 새 기록 ‘커피 5’ 의 N11 문장 (${fresh.text.split("\n")[0]})`);
  await seed(fx);
  const asked = await say(fx, "수정 01번 금액 5");
  t.eq(asked.text, `${smallAsk(5)}\n(그만하려면: 취소)`, "FC-10 ‘수정 01번 금액 5’: 새 기록과 같은 문장으로 다시 묻는다");
  t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), "FC-10 ‘수정 01번 금액 5’: 금액을 바꾸지 않았다");
  t.ok((await say(fx, "5원")).text.startsWith("✅ 01번 금액을 5원으로 변경했어요."), "FC-10 이어서 ‘5원’ 을 보내면 바로 고친다");
  t.eq(day(fx, TODAY)[0], "커피 5", "FC-10 ‘5원’ 으로 고친 금액");
});
for (const [label, steps, expected] of [
  ["‘방금 금액 5’", ["방금 금액 5"], smallAsk(5)],
  ["‘수정 01번 9’", ["수정 01번 9"], smallAsk(9)],
  ["세션에서 금액을 물을 때 ‘5’", ["수정 01번", "금액", "5"], smallAsk(5)],
]) {
  await scene(async (fx) => {
    await seed(fx);
    let reply = null;
    for (const step of steps) reply = await say(fx, step);
    t.eq(reply.text, `${expected}\n(그만하려면: 취소)`, `FC-10 ${label}: 다시 묻는다`);
    t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), `FC-10 ${label}: 기록 그대로`);
    await closeSession(fx);
  });
}
for (const [utterance, amount, shown] of [["수정 01번 금액 5원", 5, "5원"], ["수정 01번 금액 5천원", 5000, "5,000원"], ["수정 01번 금액 12", 12, "12원"]]) {
  await scene(async (fx) => {
    await seed(fx);
    t.ok((await say(fx, utterance)).text.startsWith(`✅ 01번 금액을 ${shown}으로 변경했어요.`), `FC-10 ‘${utterance}’ 는 예전처럼 바로 고친다`);
    t.eq(day(fx, TODAY)[0], `커피 ${amount}`, `FC-10 ‘${utterance}’ 금액`);
  });
}

// ── FC-11 한 줄 수정의 값에 안내 낱말 ───────────────────────────────────────────
await scene(async (fx) => {
  await seed(fx);
  const guide = await say(fx, "자동차보험");
  t.ok(guide.text.includes("📌 정기 수입·지출"), "FC-11 고치기가 아닌 ‘자동차보험’ 은 공개 안내 그대로");
  // ‘방금’ 은 다른 기록을 고치기 전에 보낸다(그 뒤의 ‘방금’ 은 V22.9.116 규칙대로 다시 묻는다).
  for (const [utterance, memo, index] of [["방금 내용 홈페이지", "홈페이지", 2], ["수정 01번 내용 자동차보험", "자동차보험", 0], ["02번 내용 재산세", "재산세", 1]]) {
    const reply = await say(fx, utterance);
    t.ok(reply.text.includes(`내용을 '${memo}'`) && !reply.text.includes("📌"), `FC-11 ‘${utterance}’: 공개 안내가 아니라 고치기 (${reply.text.split("\n")[0]})`);
    t.eq(day(fx, TODAY)[index].split(" ")[0], memo, `FC-11 ‘${utterance}’: 내용이 바뀌었다`);
  }
});

// ── FC-12 달 없는 ‘N일’ 로 날짜 수정 ───────────────────────────────────────────
const FUTURE_HEAD = "‘25일’이 이번 달 25일(11월 25일, 아직 오지 않은 날)로 읽혀서 저장하지 않았어요.\n지난달이면 달을 붙여 다시 보내 주세요.";
const FUTURE_EDIT = `${FUTURE_HEAD}\n10월 25일\n앞으로 낼 돈을 미리 적는 거면 ‘11월 25일’처럼 보내 주세요.\n(그만하려면: 취소)`;
await scene(async (fx) => {
  const fresh = await say(fx, "25일 미용실 30000원");
  t.ok(fresh.text.startsWith(FUTURE_HEAD), `FC-12 새 기록 ‘25일 미용실 30000원’ 의 되묻기 (${fresh.text.split("\n")[0]})`);
  await seed(fx);
  const asked = await say(fx, "수정 01번 날짜 25일");
  t.eq(asked.text, FUTURE_EDIT, "FC-12 ‘수정 01번 날짜 25일’: 새 기록과 같은 두 문장 + 고치는 값 예시로 다시 묻는다");
  t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), "FC-12 ‘수정 01번 날짜 25일’: 날짜를 바꾸지 않았다");
  t.ok((await say(fx, "10월 25일")).text.startsWith("✅ 01번 날짜를 2026-10-25로 변경했어요."), "FC-12 이어서 달을 붙이면 고친다");
  t.eq(JSON.stringify(day(fx, "2026-10-25")), JSON.stringify(["커피 4500"]), "FC-12 고친 날짜");
});
for (const [value, date] of [["5일", "2026-11-05"], ["12월 25일", "2026-12-25"], ["11/25", "2026-11-25"], ["내일", "2026-11-11"]]) {
  await scene(async (fx) => {
    await seed(fx);
    t.ok((await say(fx, `수정 01번 날짜 ${value}`)).text.startsWith(`✅ 01번 날짜를 ${date}로 변경했어요.`), `FC-12 ‘${value}’ 는 예전처럼 바로 고친다`);
    t.eq(JSON.stringify(day(fx, date)), JSON.stringify(["커피 4500"]), `FC-12 ‘${value}’ 날짜`);
  });
}
await scene(async (fx) => {
  await seed(fx);
  await say(fx, "수정 01번");
  await say(fx, "날짜");
  t.eq((await say(fx, "25일")).text, FUTURE_EDIT, "FC-12 세션에서 날짜를 물을 때 ‘25일’: 다시 묻는다");
  await say(fx, "25일");
  const closed = await say(fx, "25일");
  t.eq(closed.text, "😅 01번 수정을 끝냈어요. 기록은 그대로예요.\n이렇게 보내면 바로 돼요:\n👉 수정 01번 날짜 10월 25일", "FC-12 세 번째에는 세션을 닫고 보낼 한 줄을 알려 준다");
  t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), "FC-12 세션: 기록 그대로");
});
// 2차 검토(P3): 1월의 ‘지난달’ 예시는 연도 없는 ‘12월 25일’ 이다. 그대로 보내면 지난해 12월(앞날인 올해 12월이 아님)로 고쳐지는지,
// 말일(3월의 ‘31일’)은 있는 날(‘2월 28일’)을 예시로 주는지 본다.
for (const [today, value, example, exampleDate] of [["2027-01-10", "25일", "12월 25일", "2026-12-25"], ["2026-03-10", "31일", "2월 28일", "2026-02-28"]]) {
  await scene(async (fx) => {
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${today}T12:00:00+09:00`);
    t.ok((await say(fx, "커피 4500")).text.includes("저장했어요"), `FC-12 ${today}: 준비 — 오늘 기록`);
    const asked = await say(fx, `수정 01번 날짜 ${value}`);
    t.ok(asked.text.includes(`\n지난달이면 달을 붙여 다시 보내 주세요.\n${example}\n`), `FC-12 ${today} ‘${value}’: 지난달 예시는 ‘${example}’ (${asked.text.split("\n")[2] || asked.text.split("\n")[0]})`);
    t.eq(JSON.stringify(day(fx, today)), JSON.stringify(["커피 4500"]), `FC-12 ${today} ‘${value}’: 날짜를 바꾸지 않았다`);
    const fixed = await say(fx, example);
    t.ok(fixed.text.startsWith(`✅ 01번 날짜를 ${exampleDate}`) && fixed.text.split("\n")[0].endsWith("변경했어요."), `FC-12 ${today}: 예시 ‘${example}’ 를 그대로 보내면 ${exampleDate} (${fixed.text.split("\n")[0]})`);
    t.eq(JSON.stringify(day(fx, exampleDate)), JSON.stringify(["커피 4500"]), `FC-12 ${today}: 고친 날짜`);
  });
}
await scene(async (fx) => {
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2027-01-10T12:00:00+09:00");
  await say(fx, "커피 4500");
  for (let i = 0; i < 2; i += 1) await say(fx, i ? "25일" : "수정 01번 날짜 25일");
  const closed = await say(fx, "25일");
  t.eq(closed.text, "😅 01번 수정을 끝냈어요. 기록은 그대로예요.\n이렇게 보내면 바로 돼요:\n👉 수정 01번 날짜 12월 25일", "FC-12 1월 세 번째: 보낼 한 줄의 예시도 ‘12월 25일’");
  t.ok((await say(fx, "수정 01번 날짜 12월 25일")).text.startsWith("✅ 01번 날짜를 2026-12-25로 변경했어요."), "FC-12 1월: 그 한 줄을 그대로 보내면 지난해 12월 25일");
  t.eq(JSON.stringify(day(fx, "2026-12-25")), JSON.stringify(["커피 4500"]), "FC-12 1월: 고친 날짜");
});

// ── FC-13 ‘최근 기록’ 목록 ──────────────────────────────────────────────────
await scene(async (fx) => {
  await seed(fx);
  const recent = await say(fx, "최근 기록");
  const lines = recent.text.split("\n");
  t.ok(lines.filter((line) => /^• \d{4}-\d{2}-\d{2} (?:지출|수입) [\d,]+원 · .+$/.test(line)).length >= 3, "FC-13 목록 줄은 점(•)으로 시작한다");
  t.ok(!lines.some((line) => /^\d+\.\s/.test(line)), "FC-13 ‘1.’~‘5.’ 번호가 없다(‘01번’ 과 헷갈리지 않게)");
  t.eq(lines[lines.length - 1], "오늘 번호로 수정하려면 '오늘기록'을 보내세요.", "FC-13 아래 안내는 ‘오늘기록’ 한 줄");
  t.ok(!recent.text.includes("예: 01번 금액 13000원 / 01번 삭제"), "FC-13 번호로 고치는 예시 줄이 없다");
});

// ── FC-16 카카오 ‘정산’ 의 지출자 미지정 금액 ─────────────────────────────────────
const unknownRow = (amount) => ({ id: `v229126-unknown-${amount}`, household_id: HOME, user_id: null, transaction_date: "2026-11-05", type: "expense", amount, category: "식비", memo: "지출자 없음", payment_method: "", source: "web", raw_text: "", created_at: "2026-11-05T03:00:00.000Z" });
await scene(async (fx) => {
  fx.db.transactions.push(unknownRow(7000));
  const empty = await say(fx, "정산");
  t.ok(empty.text.includes("아직 정산할 지출이 없어요.\n지출자 미지정 7,000원은 정산에서 제외했어요."), `FC-16 지출자 있는 지출이 없을 때도 뺀 금액을 알린다 (${empty.text.replace(/\n/g, " / ").slice(0, 120)})`);
  await seed(fx, ["점심 12000"]);
  const settled = await say(fx, "정산");
  t.ok(settled.text.includes("지출자 미지정 7,000원은 정산에서 제외했어요."), "FC-16 정산 답에 지출자 미지정 한 줄");
  t.ok(settled.text.includes("총 지출: 12,000원"), "FC-16 총 지출은 지출자 있는 지출만(뺀 금액과 맞다)");
  fx.db.transactions = fx.db.transactions.filter((row) => row.id !== "v229126-unknown-7000");
  t.ok(!(await say(fx, "정산")).text.includes("지출자 미지정"), "FC-16 지출자 미지정 지출이 없으면 그 줄이 없다");
});

// ── FC-19 ① 읽지 못하는 저장 표식 ───────────────────────────────────────────────
const NON_V4_ID = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"; // v1 꼴 UUID(RFC 4122 의 이름공간 예시)
// 읽지 못함 = JSON 이 아니거나 이 코드가 늘 쓰는 칸(fp·UUID 번호·at)이 없는 꼴. UUID 가 아닌 번호는 행 번호(uuid 칸)일 수 없어 그 번호로 늦게
// 들어올 전송이 없고, at 은 kakaoPendingMarker 가 늘 쓰므로 at 없는 표식은 10분 규칙보다 오래된 옛 꼴이다(막으면 예전처럼 기한 없이 막힌다).
await scene(async (fx) => {
  const broken = [
    ["잘린 값", "{\"fp\":\"", "택시 8000"],
    ["문자 null", "null", "커피 4500"],
    ["UUID 가 아닌 번호", JSON.stringify({ fp: "b".repeat(64), ids: ["not-a-request-id"], at: Date.now() }), "점심 12000"],
    ["at 없는 옛 꼴", JSON.stringify({ fp: "c".repeat(64), ids: [randomUUID()] }), "버스 1500"],
    // 3차 검토: 번호는 다듬지 않은 원래 값으로 본다(그 값이 그대로 주소·거래 POST 에 쓰인다).
    ["앞에 공백이 붙은 번호", JSON.stringify({ fp: "f".repeat(64), ids: [` ${randomUUID()}`], at: Date.now() }), "간식 2500"],
  ];
  const saved = [];
  for (const [label, value, utterance] of broken) {
    putSetting(fx, MARKER_KEY, value);
    const mark = opsEvents().length;
    const reply = await say(fx, utterance);
    saved.push(utterance);
    t.ok(/저장했어요/.test(reply.text), `FC-19 표식(${label})이 있어도 저장된다 (${reply.text.split("\n")[0]})`);
    t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(saved), `FC-19 표식(${label}): 기록 한 건`);
    t.ok(!settingValue(fx, MARKER_KEY), `FC-19 표식(${label}): 저장이 끝나면 표식이 남지 않는다`);
    t.ok(opsEvents().slice(mark).some((event) => event.kind === "kakao_pending_write_expired" && event.detail === "unreadable"), `FC-19 표식(${label}): 기한 지난 표식과 같은 운영 이벤트`);
  }
  // 정상 표식(10분 안, 행 확인 안 됨)은 예전처럼 다른 문장을 막는다. 2차 검토: 번호가 v4 가 아닌 UUID 여도 정상 표식이다.
  for (const [label, id] of [["v4 번호", randomUUID()], ["v4 가 아닌 UUID 번호", NON_V4_ID], ["대문자 UUID 번호", randomUUID().toUpperCase()]]) {
    const valid = JSON.stringify({ fp: "d".repeat(64), ids: [id], at: Date.now() });
    putSetting(fx, MARKER_KEY, valid);
    const blocked = await say(fx, "우유 3000");
    t.ok(!/저장했어요/.test(blocked.text), `FC-19 정상 표식(${label})은 그대로 막는다 (${blocked.text.split("\n")[0]})`);
    t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(saved), `FC-19 정상 표식(${label}): 새 기록 없음`);
    t.eq(settingValue(fx, MARKER_KEY), valid, `FC-19 정상 표식(${label}): 표식 그대로`);
  }
});

// 2차 검토: 이 코드가 쓰는 표식에는 120초 중복으로 건너뛴 기존 행의 DB 번호가 들어간다. 그 번호가 v4 가 아니어도(가져오기·옛 경로 행) 표식은 읽혀야
// 같은 문장의 번호 재사용(늦게 들어온 첫 전송과 겹치지 않는다)과 다른 문장의 10분 보류가 그대로다.
const txPost = ({ url, method }) => method === "POST" && url.pathname === "/rest/v1/transactions";
async function unknownAfterNonV4Duplicate(fx, net) {
  t.ok(/저장했어요/.test((await say(fx, "커피 4500")).text), "FC-19 v4 아닌 번호: 준비 ‘커피 4500’");
  fx.db.transactions.find((row) => row.household_id === HOME && row.memo === "커피" && row.transaction_date === TODAY).id = NON_V4_ID;
  let posted = null;
  net.hook = (call) => { if (txPost(call)) { posted = JSON.parse(call.init.body); return failure(503, "simulated unknown result"); } return null; };
  const first = await say(fx, "커피 4500 택시 8000");
  net.hook = null;
  t.ok(!/저장했어요/.test(first.text) && posted?.length === 1, `FC-19 v4 아닌 번호: 커피는 중복, 택시 전송은 결과를 모른다 (${first.text.split("\n")[0]})`);
  const marker = JSON.parse(settingValue(fx, MARKER_KEY) || "null");
  t.ok(marker?.ids?.includes(NON_V4_ID) && marker.ids.includes(posted[0].id) && Number.isSafeInteger(marker.at), "FC-19 v4 아닌 번호: 이 코드가 쓴 표식에 건너뛴 행의 v4 아닌 번호가 들어간다");
  return posted;
}
await scene(async (fx, net) => {
  const posted = await unknownAfterNonV4Duplicate(fx, net);
  const mark = opsEvents().length;
  // 첫 택시 전송이 늦게(두 번째 요청의 중복 조회 뒤, 그 요청의 전송 직전에) 들어온다.
  let landed = false;
  net.hook = (call) => { if (!landed && txPost(call)) { landed = true; fx.db.transactions.push({ ...posted[0], created_at: new Date().toISOString() }); } return null; };
  const again = await say(fx, "커피 4500 택시 8000");
  net.hook = null;
  t.ok(landed, "FC-19 v4 아닌 번호: 늦은 첫 전송을 넣었다");
  t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(["커피 4500", "택시 8000"]), `FC-19 v4 아닌 번호: 같은 문장을 다시 보내도 택시는 한 건 (${again.text.split("\n")[0]})`);
  t.ok(!opsEvents().slice(mark).some((event) => event.detail === "unreadable"), "FC-19 v4 아닌 번호: ‘읽지 못함’ 으로 보지 않는다");
});
await scene(async (fx, net) => {
  await unknownAfterNonV4Duplicate(fx, net);
  const held = await say(fx, "점심 12000");
  t.ok(/앞서 보낸 기록/.test(held.text) && !/저장했어요/.test(held.text), `FC-19 v4 아닌 번호: 10분 안의 다른 문장은 예전처럼 보류 (${held.text.split("\n")[0]})`);
  t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(["커피 4500"]), "FC-19 v4 아닌 번호: 보류된 문장은 저장하지 않았다");
  // 10분이 지나면 기한 지난 표식으로 덮어 쓴다(행 확인 결과를 남기는 예전 이벤트).
  putSetting(fx, MARKER_KEY, JSON.stringify({ ...JSON.parse(settingValue(fx, MARKER_KEY) || "{}"), at: Date.now() - 11 * 60_000 }));
  const mark = opsEvents().length;
  const late = await say(fx, "점심 12000");
  t.ok(/저장했어요/.test(late.text), `FC-19 v4 아닌 번호: 10분 뒤에는 저장된다 (${late.text.split("\n")[0]})`);
  const expired = opsEvents().slice(mark).filter((event) => event.kind === "kakao_pending_write_expired");
  t.ok(expired.length > 0 && expired.every((event) => /^found:/.test(event.detail)), `FC-19 v4 아닌 번호: 기한 지난 정상 표식의 이벤트 (${JSON.stringify(expired.map((event) => event.detail))})`);
});

// 2차 검토(P3): 값 칸은 text 라 늘 글자지만 길이 제한이 없다. 200자가 넘는 읽지 못한 값은 앞부분으로 비교해 주소가 짧다(예전에는 값 전체를 주소에 실었다).
await scene(async (fx, net) => {
  const long = JSON.stringify({ fp: "e".repeat(64), ids: [randomUUID()], rows: [{ household_id: HOME, raw_text: "아주 긴 옛 기록 문장 ".repeat(100) }] });
  t.ok(long.length > 1000, "FC-19 긴 값: 준비 — 1,000자가 넘는 at 없는 옛 꼴 표식");
  putSetting(fx, MARKER_KEY, long);
  const urls = [];
  net.hook = ({ url, method }) => { if (method === "PATCH" && url.pathname === "/rest/v1/accountbook_settings") urls.push(url.href); return null; };
  const mark = opsEvents().length;
  const reply = await say(fx, "택시 8000");
  net.hook = null;
  t.ok(/저장했어요/.test(reply.text), `FC-19 긴 값: 저장된다 (${reply.text.split("\n")[0]})`);
  t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(["택시 8000"]), "FC-19 긴 값: 기록 한 건");
  t.ok(!settingValue(fx, MARKER_KEY), "FC-19 긴 값: 표식이 남지 않는다");
  t.ok(urls.length > 0 && urls.every((href) => href.length < 1500), `FC-19 긴 값: 비교 주소가 짧다 (${urls.map((href) => href.length).join(",")}자)`);
  t.ok(opsEvents().slice(mark).some((event) => event.kind === "kakao_pending_write_expired" && event.detail === "unreadable"), "FC-19 긴 값: 같은 운영 이벤트");
});
// 3차 검토(P3): 앞부분이 짧으면(특수 문자로 시작하면 빈 값) ‘like.<앞부분>*’ 이 이 키의 다른 표식까지 덮는다 — 값 전체(eq)로 비교해, 그 사이 다른 요청이 쓴
// 새 표식은 덮지 않는다. 200번째 글자가 서로게이트 쌍의 앞쪽이면 쌍 앞에서 자른다(반쪽은 주소에서 U+FFFD 가 되어 맞지 않아 예전처럼 막혔다).
const markerPatch = ({ url, method }) => method === "PATCH" && url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.${MARKER_KEY}`;
const LONG_BASE = `{"fp":"${"e".repeat(64)}","ids":["${randomUUID()}"],"note":"`;
const LONG_EDGE_CASES = [
  { label: "밑줄로 시작", value: `_${"가".repeat(300)}`, op: "eq.", utterance: "택시 8000" },
  { label: "앞 네 글자 뒤 밑줄", value: `{"fp_${"가".repeat(300)}`, op: "eq.", utterance: "커피 4500" },
  { label: "200번째 글자가 쌍의 앞쪽", value: `${LONG_BASE}${"가".repeat(199 - LONG_BASE.length)}${"😀".repeat(60)}"}`, op: "like.", utterance: "점심 12000" },
];
for (const item of LONG_EDGE_CASES) {
  await scene(async (fx, net) => {
    putSetting(fx, MARKER_KEY, item.value);
    const filters = [];
    net.hook = (call) => { if (markerPatch(call)) filters.push(call.url.searchParams.get("value")); return null; };
    const reply = await say(fx, item.utterance);
    net.hook = null;
    t.ok(/저장했어요/.test(reply.text), `FC-19 긴 값(${item.label}): 저장된다 (${reply.text.split("\n")[0]})`);
    t.ok(filters.length === 1 && filters[0].startsWith(item.op), `FC-19 긴 값(${item.label}): 비교는 ${item.op === "eq." ? "값 전체" : "앞부분"} (${String(filters[0]).slice(0, 12)}…)`);
    if (item.op === "like.") t.ok(filters[0] === `like.${item.value.slice(0, 199)}*` && !filters[0].includes("�"), `FC-19 긴 값(${item.label}): 쌍 앞(199자)에서 자른다`);
    t.ok(!settingValue(fx, MARKER_KEY), `FC-19 긴 값(${item.label}): 표식이 남지 않는다`);
  });
  if (item.op !== "eq.") continue;
  // 읽은 뒤 다른 요청이 새 표식을 썼다(비교·교체가 살아 있어야 한다).
  await scene(async (fx, net) => {
    putSetting(fx, MARKER_KEY, item.value);
    const newer = JSON.stringify({ fp: "9".repeat(64), ids: [randomUUID()], at: Date.now() });
    net.hook = (call) => { if (markerPatch(call)) putSetting(fx, MARKER_KEY, newer); return null; };
    const reply = await say(fx, item.utterance);
    net.hook = null;
    t.ok(!/저장했어요/.test(reply.text) && day(fx, TODAY).length === 0, `FC-19 긴 값(${item.label}): 그 사이 바뀐 표식이면 저장하지 않는다 (${reply.text.split("\n")[0]})`);
    t.eq(settingValue(fx, MARKER_KEY), newer, `FC-19 긴 값(${item.label}): 다른 요청이 쓴 새 표식을 덮지 않는다`);
  });
}

// 단톡방 기록은 방 가계부의 설정을 따로 읽는다(group-links-first-record.js) — 같은 결과여야 한다.
await scene(async (fx) => {
  t.ok((await say(fx, "단톡방 연결 HOME2265", { room: ROOM })).text.includes("단톡방 연결 완료"), "FC-19 단톡방: 준비 — 방을 house-home 에 연결");
  putSetting(fx, MARKER_KEY, "{\"fp\":\"");
  const mark = opsEvents().length;
  const reply = await say(fx, "택시 8000", { room: ROOM });
  t.ok(/저장했어요/.test(reply.text), `FC-19 단톡방: 읽지 못하는 표식이 있어도 저장된다 (${reply.text.split("\n")[0]})`);
  t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(["택시 8000"]), "FC-19 단톡방: 기록 한 건");
  t.ok(!settingValue(fx, MARKER_KEY), "FC-19 단톡방: 표식이 남지 않는다");
  t.ok(opsEvents().slice(mark).some((event) => event.kind === "kakao_pending_write_expired" && event.detail === "unreadable"), "FC-19 단톡방: 운영 이벤트");
});

// ── FC-19 ② 고친 뒤 세션 정리 쓰기만 실패 ────────────────────────────────────────
// 2차 검토: 정리 쓰기를 삼키면 세션이 5분 동안 살아 있어 다음 숫자 말(‘5000’)이 같은 기록을 또 고쳤고, ‘취소’ 는 취소했다고 답하면서 세션이 남았다.
// 이제 한 번 더 써 보고, 그래도 실패하면 답(바꾼 결과·바꾸지 않은 이유)에 남은 세션의 위험을 한 줄 붙인다. 사용자가 한 ‘취소’ 만 예전처럼 오류로 끝낸다.
// 3차 검토: 그 줄은 위험부터 말하고, 그 세션이 실제로 남아 무엇을 바꿀 수 있을 때만 붙는다. 세션이 없으면 정리 쓰기도 없다.
// 4차 검토: 줄은 번호를 적지 않는다(창을 열 때의 번호라 날짜를 고치거나 앞 기록을 지우면 다른 기록을 가리킨다). 창의 기록이 지워졌거나 없으면
// 되살린 뒤의 위험을 말한다(‘복구’ 는 창을 비켜 같은 기록을 되살리고, 창은 다시 그 기록을 고친다).
// 각 장면은 다음 말이 실제로 무엇을 하는지까지 본다(줄이 말한 대로인지).
const sessionKeyCall = ({ url, init }) => url.pathname === "/rest/v1/accountbook_settings" && (/"key":"kakao_edit_v4:/.test(String(init?.body || "")) || decodeURIComponent(url.search).includes("key=eq.kakao_edit_v4:"));
const sessionWrite = (call) => call.method === "POST" && sessionKeyCall(call);
const CLOSE_LINE = "⚠️ 5분 안에 숫자나 짧은 말을 보내면 수정 창에 열려 있던 기록이 바뀌거나 지워질 수 있어요(수정 창을 닫지 못했어요). 새 기록은 5분 뒤에 ‘커피 4500원’처럼 내용과 금액을 함께 보내 주세요.";
const CLOSE_LINE_GONE = "⚠️ 5분 안에 이 기록을 되살린 뒤 숫자나 짧은 말을 보내면 그 기록이 바뀌거나 지워질 수 있어요(수정 창을 닫지 못했어요). 새 기록은 5분 뒤에 ‘커피 4500원’처럼 내용과 금액을 함께 보내 주세요.";
const CLOSE_HEAD = "수정 창을 닫지 못했어요";
const GENERIC_ERROR = "일시적인 오류로 이번 요청을 끝내지 못했어요.";
const removeRow = (memo) => (fx) => { fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === HOME && row.transaction_date === TODAY && row.memo === memo)); };
const setRole = (role) => (fx) => { fx.db.household_members.find((member) => member.household_id === HOME && member.user_id === "user-bin").role = role; };
const STALE_CASES = [
  { name: "세션 고치기, 다시 쓰기 성공", prep: ["수정 02번", "금액"], send: "9000", fails: 1, head: "✅ 02번 금액을 9,000원으로 변경했어요.", line: "",
    next: "5000", after: { today: ["커피 4500", "택시 9000", "점심 12000", "기타지출 5000"], yesterday: [] } },
  { name: "세션 고치기, 두 번 실패", prep: ["수정 02번", "금액"], send: "9000", fails: 2, head: "✅ 02번 금액을 9,000원으로 변경했어요.", line: CLOSE_LINE,
    next: "5000", after: { today: ["커피 4500", "택시 5000", "점심 12000"], yesterday: [] } },
  { name: "취소, 다시 쓰기 성공", prep: ["수정 02번", "금액"], send: "취소", fails: 1, head: "👌 02번 수정을 취소했어요.", line: "",
    next: "13000", after: { today: ["커피 4500", "택시 8000", "점심 12000", "기타지출 13000"], yesterday: [] } },
  { name: "취소, 두 번 실패", prep: ["수정 02번", "금액"], send: "취소", fails: 2, head: GENERIC_ERROR, line: "",
    next: "13000", after: { today: ["커피 4500", "택시 13000", "점심 12000"], yesterday: [] } },
  // 내용 칸 세션은 숫자도 내용으로 받는다(줄의 ‘짧은 말’).
  { name: "내용 고치기, 두 번 실패", prep: ["수정 02번", "4"], send: "간식", fails: 2, head: "✅ 02번 내용을 '간식'으로 변경했어요.", line: CLOSE_LINE,
    next: "5000", after: { today: ["커피 4500", "5000 8000", "점심 12000"], yesterday: [] } },
  // 다른 날 기록의 창도 같은 줄이다(번호·날짜를 적지 않는다). 다음 숫자 말은 그 창의 기록(어제 간식)을 고친다.
  { name: "어제 기록 고치기, 두 번 실패", yesterdaySeed: ["라면 3000", "간식 2000"], prep: ["어제 수정 02번"], send: "금액 9000", fails: 2, head: "✅ 02번 금액을 9,000원으로 변경했어요.",
    line: CLOSE_LINE, next: "5000", after: { today: SEED, yesterday: ["라면 3000", "간식 5000"] } },
  // 4차 검토: 날짜를 어제로 옮겨도 창은 그 기록(택시)을 따라간다 — 지금 오늘 목록의 02번(점심)이 아니다. 줄이 번호를 적지 않는 까닭.
  { name: "날짜를 어제로 고치기, 두 번 실패", prep: ["수정 02번", "5"], send: "어제", fails: 2, head: `✅ 02번 날짜를 ${YESTERDAY}로 변경했어요.`, line: CLOSE_LINE,
    mid: { today: ["커피 4500", "점심 12000"], yesterday: ["택시 8000"] }, next: "오늘", after: { today: SEED, yesterday: [] } },
  // 3차 검토: 열린 세션이 없던 한 줄 고치기는 정리 쓰기를 하지 않는다(줄도 없다). 다음 숫자 말은 새 기록이다.
  { name: "세션 없이 한 줄 고치기", prep: [], send: "수정 01번 금액 13000", fails: 2, writes: 0, head: "✅ 01번 금액을 13,000원으로 변경했어요.", line: "",
    next: "5000", after: { today: ["커피 13000", "택시 8000", "점심 12000", "기타지출 5000"], yesterday: [] } },
  // 앞서 연 다른 기록의 창이 남는다 — 다음 숫자 말은 방금 고친 점심이 아니라 그 창의 커피를 고친다.
  { name: "01번 메뉴 위 ‘방금 거 금액 13000’, 두 번 실패", prep: ["수정 01번"], send: "방금 거 금액 13000", fails: 2, head: "✅ 03번 금액을 13,000원으로 변경했어요.", line: CLOSE_LINE,
    next: "5000", after: { today: ["커피 5000", "택시 8000", "점심 13000"], yesterday: [] } },
  // 4차 검토: 창의 기록을 지웠거나 찾지 못하면 되살린 뒤의 위험을 말한다. 되살리지 않으면 숫자 말은 저장되지 않고 ‘찾지 못했어요’ 를 받는다(되살린 장면은 아래).
  { name: "메뉴 삭제, 두 번 실패", prep: ["수정 02번"], send: "7", fails: 2, head: "🗑️ 02번 기록을 삭제했어요.", line: CLOSE_LINE_GONE,
    next: "5000", nextHead: "수정하려던 02번 기록을 찾지 못했어요.", after: { today: ["커피 4500", "점심 12000"], yesterday: [] } },
  // 4차 검토: 앞 기록을 지우면 창의 기록(점심)의 번호가 03 에서 02 로 당겨진다 — 줄은 번호 없이 창의 기록을 말하고, 다음 숫자 말은 점심을 고친다.
  { name: "03번 메뉴 위 한 줄 삭제, 두 번 실패", prep: ["수정 03번"], send: "삭제 01번", fails: 2, head: "🗑️ 01번 기록을 삭제했어요.", line: CLOSE_LINE,
    next: "5000", after: { today: ["택시 8000", "점심 5000"], yesterday: [] } },
  { name: "지운 기록의 메뉴 위 한 줄 삭제, 두 번 실패", prep: ["수정 01번"], send: "삭제 01번", fails: 2, head: "🗑️ 01번 기록을 삭제했어요.", line: CLOSE_LINE_GONE,
    next: "5000", nextHead: "수정하려던 01번 기록을 찾지 못했어요.", after: { today: ["택시 8000", "점심 12000"], yesterday: [] } },
  { name: "세션 없이 한 줄 삭제, 두 번 실패", prep: [], send: "삭제 01번", fails: 2, head: "🗑️ 01번 기록을 삭제했어요.", line: "",
    next: "5000", after: { today: ["택시 8000", "점심 12000", "기타지출 5000"], yesterday: [] } },
  // 호출 예산이 바닥나면 세션 읽기·쓰기가 보내기 전에 모두 실패한다 — 읽기도 실패하는 꼴로 본다. 4차 검토: 그때는 정리 전에 본 메모리 힌트로 정한다
  // (창이 있었으면 번호 없는 줄, 없었으면 줄 없음). 읽기 훅이 실제 세션 읽기에 한 번 맞았는지 센다.
  { name: "03번 메뉴 위 한 줄 삭제, 세션 읽기도 실패", prep: ["수정 03번"], send: "삭제 01번", fails: 2, reads: 1, head: "🗑️ 01번 기록을 삭제했어요.", line: CLOSE_LINE,
    next: "5000", after: { today: ["택시 8000", "점심 5000"], yesterday: [] } },
  { name: "세션 없이 한 줄 삭제, 세션 읽기도 실패", prep: [], send: "삭제 01번", fails: 2, reads: 1, head: "🗑️ 01번 기록을 삭제했어요.", line: "",
    next: "5000", after: { today: ["택시 8000", "점심 12000", "기타지출 5000"], yesterday: [] } },
  // 3차 검토: 기록이 그대로라는 답(세 번째 실패의 끝·찾지 못함·같은 문장)은 오류로 바꾸지 않는다. 남은 세션은 다음 말로 그 기록을 바꿀 수 있다.
  { name: "FC-12 세 번째 실패의 끝, 두 번 실패", prep: ["수정 02번", "5", "25일", "25일"], send: "25일", fails: 2, head: "😅 02번 수정을 끝냈어요. 기록은 그대로예요.", line: CLOSE_LINE,
    next: "어제", after: { today: ["커피 4500", "점심 12000"], yesterday: ["택시 8000"] } },
  { name: "찾지 못함(그 사이 지워짐), 두 번 실패", prep: ["수정 02번", "금액"], mutate: removeRow("택시"), send: "9000", fails: 2, head: "수정하려던 02번 기록을 찾지 못했어요.", line: CLOSE_LINE_GONE,
    next: "5000", nextHead: "수정하려던 02번 기록을 찾지 못했어요.", after: { today: ["커피 4500", "점심 12000"], yesterday: [] } },
  { name: "같은 문장(어제 같은 기록), 두 번 실패", yesterdaySeed: ["커피 4500"], prep: ["수정 01번", "5"], send: "2", fails: 2, head: "01번 기록을 바꾸지 않았어요. 기록은 그대로예요.", line: CLOSE_LINE,
    next: "3", after: { today: ["택시 8000", "점심 12000"], yesterday: ["커피 4500"] } },
  // 바꿀 수 없게 된 사람(조회 전용)의 거절은 남은 세션도 바꾸지 못하므로 줄이 없다.
  { name: "조회 전용으로 바뀐 뒤, 두 번 실패", prep: ["수정 02번", "금액"], mutate: setRole("viewer"), send: "9000", fails: 2, head: "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요.", line: "",
    next: "5000", nextHead: "현재 가계부 권한으로는 기록을 수정하거나 삭제할 수 없어요.", after: { today: SEED, yesterday: [] } },
];
for (const item of STALE_CASES) {
  const label = `FC-19 ${item.name}`;
  await scene(async (fx, net) => {
    if (item.yesterdaySeed) {
      fx.db.__kakao_request_unique = true; // 운영 DB 의 같은 문장 유니크 인덱스(409/23505)를 흉내 낸다.
      const today = globalThis.__AB_QA_FIXED_NOW_MS;
      globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${YESTERDAY}T12:00:00+09:00`);
      await seed(fx, item.yesterdaySeed);
      globalThis.__AB_QA_FIXED_NOW_MS = today;
    }
    await seed(fx);
    for (const utterance of item.prep) await say(fx, utterance);
    item.mutate?.(fx);
    let failed = 0, writes = 0, reads = 0;
    net.hook = (call) => {
      if (sessionWrite(call)) { writes += 1; if (failed < item.fails) { failed += 1; return failure(503, "simulated session write failure"); } }
      else if (item.reads && call.method === "GET" && sessionKeyCall(call)) { reads += 1; return failure(503, "simulated session read failure"); }
      return null;
    };
    const reply = await say(fx, item.send);
    net.hook = null;
    if (item.writes === undefined) t.eq(failed, item.fails, `${label}: 세션 정리 쓰기 실패 ${item.fails}번을 넣었다`);
    else t.eq(writes, item.writes, `${label}: 세션 정리 쓰기 ${item.writes}번`);
    if (item.reads) t.eq(reads, item.reads, `${label}: 세션 읽기 실패 ${item.reads}번을 넣었다(훅이 실제 읽기에 맞았다)`);
    t.ok(reply.text.startsWith(item.head), `${label}: 답 (${reply.text.split("\n")[0]})`);
    if (item.line) t.ok(reply.text.endsWith(`\n${item.line}`), `${label}: 답 끝에 ${item.line === CLOSE_LINE_GONE ? "되살린 뒤의" : "남은 창의"} 위험을 말하는 줄`);
    else t.ok(!reply.text.includes(CLOSE_HEAD), `${label}: ‘수정 창을 닫지 못했어요’ 줄이 없다`);
    if (item.send === "취소") t.eq(reply.text.includes("취소했어요"), item.fails < 2, `${label}: 세션을 닫지 못했으면 취소했다고 하지 않는다`);
    if (item.mid) t.eq(state(fx), JSON.stringify(item.mid), `${label}: ‘${item.send}’ 뒤 기록`);
    const next = await say(fx, item.next);
    if (item.nextHead) t.ok(next.text.startsWith(item.nextHead), `${label}: 다음 ‘${item.next}’ 의 답 (${next.text.split("\n")[0]})`);
    t.eq(state(fx), JSON.stringify(item.after), `${label}: 다음 ‘${item.next}’ 뒤 기록 (${next.text.split("\n")[0]})`);
    await say(fx, "취소");
  });
}

// 4차 검토: 창의 기록을 지운 뒤 답의 ‘복구’ 를 따르면 복구는 창을 비켜 같은 기록을 되살리고, 5분 안의 숫자 말은 되살린 기록을 고친다(줄이 말한 대로).
for (const [prep, send, restore, after] of [
  [["수정 02번"], "7", "복구 02번", ["커피 4500", "택시 5000", "점심 12000"]],
  [["수정 01번"], "삭제 01번", "복구 01번", ["커피 5000", "택시 8000", "점심 12000"]],
]) {
  const label = `FC-19 ${prep[0]} → ‘${send}’(정리 두 번 실패) → ‘${restore}’ → ‘5000’`;
  await scene(async (fx, net) => {
    await seed(fx);
    for (const utterance of prep) await say(fx, utterance);
    let failed = 0;
    net.hook = (call) => { if (sessionWrite(call) && failed < 2) { failed += 1; return failure(503, "simulated session write failure"); } return null; };
    const deleted = await say(fx, send);
    net.hook = null;
    t.eq(failed, 2, `${label}: 세션 정리 쓰기 실패 2번을 넣었다`);
    t.ok(deleted.text.endsWith(`\n${CLOSE_LINE_GONE}`), `${label}: 삭제 답 끝에 되살린 뒤의 위험을 말하는 줄`);
    const restored = await say(fx, restore);
    t.ok(restored.text.startsWith("↩️ 기록을 복구했어요."), `${label}: 복구는 창을 비켜 명령으로 처리된다 (${restored.text.split("\n")[0]})`);
    t.eq(state(fx), JSON.stringify({ today: SEED, yesterday: [] }), `${label}: 복구 뒤 기록`);
    const next = await say(fx, "5000");
    t.eq(state(fx), JSON.stringify({ today: after, yesterday: [] }), `${label}: 남은 창이 되살린 기록을 고친다 (${next.text.split("\n")[0]})`);
    await say(fx, "취소");
  });
}

// 3차 검토: 숫자·기록 문장·‘취소’ 를 두 경우(정리가 이번만 실패 / 계속 실패)로 확인한다. ‘커피 4500원’ 이 이미 있으면 중복 확인이 먼저라 바탕 기록을 바꾼다.
// 계속 실패하면 새 기록은 오류 답(저장하지 않았다고 말한다)이고 고치던 기록은 그대로다. ‘취소’ 도 오류 답이다(줄은 ‘취소’ 를 권하지 않는다).
const TABLE_SEED = ["라면 3000", "택시 8000", "점심 12000"];
const TABLE_SEED_AFTER_9000 = ["라면 3000", "택시 9000", "점심 12000"];
const TABLE_CASES = [
  { mode: "transient", next: "5000", head: "✅ 02번 금액을 5,000원으로 변경했어요.", line: false, after: ["라면 3000", "택시 5000", "점심 12000"], open: false },
  { mode: "persistent", next: "5000", head: "✅ 02번 금액을 5,000원으로 변경했어요.", line: true, after: ["라면 3000", "택시 5000", "점심 12000"], open: true },
  { mode: "transient", next: "커피 4500원", head: "✏️ 02번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.", line: false, after: ["라면 3000", "택시 9000", "점심 12000", "커피 4500"], open: false },
  { mode: "persistent", next: "커피 4500원", head: `${GENERIC_ERROR} 기록은 저장하지 않았어요.`, line: false, after: ["라면 3000", "택시 9000", "점심 12000"], open: true },
  { mode: "transient", next: "취소", head: "👌 02번 수정을 취소했어요.", line: false, after: ["라면 3000", "택시 9000", "점심 12000"], open: false },
  { mode: "persistent", next: "취소", head: GENERIC_ERROR, line: false, after: ["라면 3000", "택시 9000", "점심 12000"], open: true },
];
for (const item of TABLE_CASES) {
  const label = `FC-19 정리 ${item.mode === "transient" ? "이번만" : "계속"} 실패 뒤 ‘${item.next}’`;
  await scene(async (fx, net) => {
    await seed(fx, TABLE_SEED);
    for (const utterance of ["수정 02번", "금액"]) await say(fx, utterance);
    let failed = 0;
    net.hook = (call) => { if (sessionWrite(call) && (item.mode === "persistent" || failed < 2)) { failed += 1; return failure(503, "simulated session write failure"); } return null; };
    const first = await say(fx, "9000");
    t.ok(first.text.endsWith(`\n${CLOSE_LINE}`), `${label}: 준비 — ‘9000’ 의 답에 줄이 붙는다`);
    const reply = await say(fx, item.next);
    net.hook = null;
    t.ok(reply.text.startsWith(item.head), `${label}: 답 (${reply.text.split("\n")[0]})`);
    t.eq(reply.text.endsWith(`\n${CLOSE_LINE}`), item.line, `${label}: 줄이 ${item.line ? "다시 붙는다(창이 아직 열려 있다)" : "없다"}`);
    t.eq(JSON.stringify(day(fx, TODAY)), JSON.stringify(item.after), `${label}: 기록`);
    // 그 뒤(쓰기가 되는 때) 숫자 말: 창이 남았으면 02번을 고치고, 닫혔으면 새 기록이다.
    const probe = await say(fx, "3000");
    t.eq(probe.text.startsWith("✅ 02번 금액을 3,000원으로 변경했어요."), item.open, `${label}: 그 뒤 ‘3000’ 은 ${item.open ? "남은 창이 02번을 고친다" : "새 기록이다"} (${probe.text.split("\n")[0]})`);
    await say(fx, "취소");
  });
}
// 3차 검토: 줄의 ‘5분 뒤에’ — 남은 창은 만료되면 그 기록의 답을 받지 않는다(정리가 계속 실패해도). 기록 문장은 새 기록이 된다.
// 5분 안에는 칸 이름으로 시작하는 기록 문장(‘메모지 2000원’)도 메뉴의 답(내용 칸)이 될 수 있어 줄이 새 기록을 5분 뒤로 권한다.
for (const mode of ["transient", "persistent"]) {
  for (const next of ["5000", "메모지 2000원"]) {
    const label = `FC-19 정리 ${mode === "transient" ? "이번만" : "계속"} 실패 뒤 5분이 지나 ‘${next}’`;
    await scene(async (fx, net) => {
      await seed(fx, TABLE_SEED);
      await say(fx, "수정 02번");
      let failed = 0;
      net.hook = (call) => { if (sessionWrite(call) && (mode === "persistent" || failed < 2)) { failed += 1; return failure(503, "simulated session write failure"); } return null; };
      const first = await say(fx, "금액 9000");
      t.ok(first.text.endsWith(`\n${CLOSE_LINE}`), `${label}: 준비 — 메뉴에서 바로 고친 답에 줄이 붙는다`);
      const stale = fx.db.accountbook_settings.find((row) => String(row.key).startsWith("kakao_edit_v4:") && row.value);
      stale.value = JSON.stringify({ ...JSON.parse(stale.value), updatedAt: Date.now() - 6 * 60 * 1000 });
      const reply = await say(fx, next);
      net.hook = null;
      t.eq(JSON.stringify(day(fx, TODAY).slice(0, 3)), JSON.stringify(TABLE_SEED_AFTER_9000), `${label}: 02번은 9,000원 그대로 (${reply.text.split("\n")[0]})`);
      if (next !== "5000") t.eq(fx.db.transactions.filter((row) => row.raw_text === next).length, 1, `${label}: 새 기록으로 한 번 저장된다`);
    });
  }
}
// 세션을 이어 가는 답(메뉴)은 예전처럼 저장이 실패하면 그 답을 보내지 않는다(I6: 보낸 답과 저장된 세션이 짝).
await scene(async (fx, net) => {
  await seed(fx);
  net.hook = (call) => sessionWrite(call) ? failure(503, "simulated session write failure") : null;
  const menu = await say(fx, "수정 03번");
  net.hook = null;
  t.ok(!menu.text.includes("무엇을 바꿀까요?"), `FC-19 세션을 여는 답은 저장 실패 때 보내지 않는다 (${menu.text.split("\n")[0]})`);
  // 실패한 저장도 메모리 힌트는 켜 두므로(다음 장면의 반복 가드에 닿는다) 세션을 정상으로 열고 닫아 힌트를 지운다.
  t.ok((await say(fx, "수정 03번")).text.includes("무엇을 바꿀까요?"), "FC-19 장면 정리: 메뉴를 다시 연다");
  await closeSession(fx);
});

// ── FC-19 ③ 60자 넘는 문장의 중복 안내 ─────────────────────────────────────────
// 쪼개지지 않는 한 덩어리 내용이라 기록의 원래 문장이 60자를 넘는다(예전 예시는 금액 앞에서 잘렸다).
const LONG = "회사근처이탈리안레스토랑에서팀원다섯명이함께먹은파스타피자샐러드세트메뉴와음료디저트까지모두포함한점심식사비용전체합계 48000원";
await scene(async (fx) => {
  t.ok(LONG.length > 60, "FC-19 시험 문장은 60자를 넘는다");
  const first = await send(fx, LONG);
  await first.settle();
  t.ok(/저장했어요/.test(first.text), "FC-19 긴 문장 첫 저장");
  // 저장 직후 같은 말(8초 안, 메모리 반복 방지)과 2분 안의 같은 말(DB 중복 확인) 두 길.
  const repeat = await send(fx, LONG, { clear: false });
  await repeat.settle();
  t.ok(repeat.text.startsWith("방금 같은 내용을 처리했어요 😊") && repeat.text.includes("\n서로 다른 구매라면 원래 문장 앞에 ‘별도 구매 추가’를 붙여 보내 주세요."), `FC-19 반복 방지 안내: 예시 없이 원래 문장 앞에 붙이라고만 한다 (${repeat.text.split("\n")[0]})`);
  const dbDup = await say(fx, LONG);
  t.ok(dbDup.text.includes("중복 저장 안 함 1건"), `FC-19 같은 긴 문장 다시: 중복 (${dbDup.text.split("\n")[0]})`);
  t.ok(dbDup.text.includes("\n서로 다른 구매라면 원래 문장 앞에 ‘별도 구매 추가’를 붙여 보내 주세요."), "FC-19 중복 안내: 예시 없이 원래 문장 앞에 붙이라고만 한다");
  t.ok(![repeat.text, dbDup.text].some((text) => text.includes(`‘별도 구매 추가 ${LONG.slice(0, 20)}`)), "FC-19 60자에서 잘린 예시가 없다");
  const candidate = await say(fx, `별도 구매 추가 ${LONG}`);
  t.ok(candidate.text.startsWith("같은 내용의 별도 구매 후보입니다."), `FC-19 안내대로 원래 문장 앞에 붙이면 후보가 나온다 (${candidate.text.split("\n")[0]})`);
  const cut = await say(fx, `별도 구매 추가 ${LONG.slice(0, 60)}`);
  t.ok(!cut.text.startsWith("같은 내용의 별도 구매 후보입니다."), `FC-19 (예전 예시) 60자에서 자른 문장으로는 후보가 나오지 않는다 (${cut.text.split("\n")[0]})`);
  await say(fx, "택시 8000");
  const short = await say(fx, "택시 8000");
  t.ok(short.text.includes("\n서로 다른 구매라면 ‘별도 구매 추가 택시 8000’라고 원래 기록 문장을 보내 후보를 확인해 주세요."), "FC-19 짧은 문장의 중복 안내는 예시 그대로");
});

// ── D-7 금액이 분명한 기록 문장의 ‘초대’ ────────────────────────────────────────
await scene(async (fx) => {
  fx.db.users.push({ id: "user-pend", kakao_user_key: PENDING_USER, nickname: "Pend", created_at: "2026-11-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-trip", user_id: "user-pend", role: "pending", created_at: "2026-11-01T00:00:00.000Z" });
  const invite = await say(fx, "초대권 15000원 대기", { user: PENDING_USER });
  const plain = await say(fx, "점심 15000원 대기", { user: PENDING_USER });
  t.ok(plain.text.includes("아직 승인 대기 중입니다"), `D-7 승인 대기 사람의 기록 문장: 승인 대기 안내 (${plain.text.split("\n")[0]})`);
  t.eq(invite.text, plain.text, "D-7 승인 대기 사람: ‘초대권 15000원’ 도 같은 승인 대기 안내(초대 안내가 먼저 나가지 않는다)");
  t.eq(fx.db.transactions.filter((row) => /대기$/.test(String(row.raw_text || ""))).length, 0, "D-7 승인 대기 사람: 저장하지 않았다");
});
// 1:1 에서 가계부를 고르기 전(가계부 둘의 소유자). 고르기 흐름이 열리면 다음 말을 그 답으로 읽으므로 문장마다 새 장면.
const pickFirstLine = (utterance) => scene(async (fx) => {
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== SELECT_KEY);
  const reply = await say(fx, utterance);
  t.eq(fx.db.transactions.filter((row) => row.raw_text === utterance).length, 0, `D-7 가계부를 고르기 전 ‘${utterance}’: 아직 저장하지 않는다`);
  return reply.text.split("\n")[0];
});
const pickInvite = await pickFirstLine("초대권 15000원 미선택");
const pickPlain = await pickFirstLine("점심 15000원 미선택");
t.ok(!pickInvite.includes("초대코드를 확인할 가계부"), `D-7 가계부를 고르기 전: 초대코드 확인 흐름이 아니다 (${pickInvite})`);
t.eq(pickInvite, pickPlain, "D-7 가계부를 고르기 전: 다른 기록 문장과 같은 가계부 고르기");
await scene(async (fx) => {
  t.ok(/저장했어요/.test((await say(fx, "초대권 15000원")).text), "D-7 주 경로: 가계부를 골랐으면 그대로 저장(예전과 같다)");
  t.ok((await say(fx, "초대코드")).text.includes("HOME2265"), "D-7 기록이 아닌 초대 명령은 그대로 초대코드 안내");
  for (const utterance of ["친구 초대 선물 31000원", "점심 31000원"]) {
    const first = await send(fx, utterance);
    await first.settle();
    const second = await send(fx, utterance, { clear: false });
    await second.settle();
    t.ok(second.text.startsWith("방금 같은 내용을 처리했어요 😊"), `D-7 ‘${utterance}’ 를 잇달아 보내면 반복 방지 안내 (${second.text.split("\n")[0]})`);
    t.eq(fx.db.transactions.filter((row) => row.raw_text === utterance && row.household_id === HOME).length, 1, `D-7 ‘${utterance}’: 한 건만 저장`);
  }
});

t.done();
