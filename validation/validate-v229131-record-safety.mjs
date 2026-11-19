// V22.9.131 기록 지키기 — 출시 전날(2026-11-19) 독립 점검이 짚은 여덟 가지를 좁게 고친 판의 검사.
//
// ── 무엇을 보나 ──
//  R-1 열린 수정 창: 새 기록 꼴인데 칸 이름·메뉴 번호로 시작하는 말(‘메모지 2000원’·‘가격표 3000원’·‘3번 출구 떡볶이 5000원’)이 그 기록을 묻지 않고
//      바꾸지 않는다. 바꾸지도 저장하지도 않고 두 길을 알린 뒤 창을 닫는다(같은 말을 한 번 더 보내면 새 기록). 고치는 말은 예전 그대로다.
//  R-2 백업 CSV: 1,000건을 넘겨 읽는 사이 기록이 더해지거나 지워져도 같은 기록이 두 번 담기거나 빠지지 않는다(다시 읽고, 끝내 맞지 않으면 파일 없음).
//  R-3 관리자 JSON 백업: 고른 가계부를 id 로 읽는다 — 없는 가계부는 빈 파일이 아니라 404, 목록 범위 밖의 가계부도 참여자·설정까지 담긴다.
//  R-4 카카오: 띄어 쓴 분수 + 분량 낱말(‘케이크 1/8 조각 6000원’)이 날짜로 읽힌 기록은 저장하지 않고 되묻는다. 답의 예문은 그대로 보내면 저장된다.
//  R-5 스마트 도구의 ‘예산 잔여’: 못 읽음(확인 불가)·정한 예산 없음(설정 전)·다 씀(0원)을 가른다.
//  R-6 자동 리포트: 확정 범위에서 한 가계부의 생성이 실패하면 다음 실행이 그 가계부만 다시 만든다(세 번까지, 그 뒤에는 그만둔 것을 남긴다).
//  R-7 즐겨찾기: 메모가 길어 64자를 넘는 표식도 켜지고 지워진다(예전에 잘려 저장된 표식 포함).
//  R-8 첫 비밀번호 안내: 양도 칸·삭제 칸의 문장이 실제 동작(그 방 가계부의 보기 전용 화면이 먼저 열림)과 같고, 그 안내를 읽은 사람이 방 단추에서
//      겪는 일까지 한 장면으로 본다. 방 전용 보기를 끈 운영에서는 예전 문장·예전 동작이다.
// 메모리 픽스처(validation/qa-fixture.mjs)와 실제 요청(app.fetch)으로 보며 네트워크를 쓰지 않는다. 장면마다 따로 잡아 하나가 실패해도 나머지를 본다.
// 실행: node validation/validate-v229131-record-safety.mjs   (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { createHash } from "node:crypto";
import app, { runAutomaticReports } from "../src/index.js";
import { BASE, ctx, failure, fixture, intercept, putSetting, settingValue } from "./lib-audit-v22934.mjs";
import { PASSWORD_KDF_ITERATIONS, newPasswordSalt, pbkdf2PasswordHash } from "../src/modules/auth/crypto-admin-session.js";
import * as rowsModule from "../src/modules/data/households-members-rows.js";

let checks = 0;
const failures = [];
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { ok(actual === expected, `${msg} (실제 ${JSON.stringify(actual)} · 기대 ${JSON.stringify(expected)})`); }
async function section(name, task) {
  try { await task(); } catch (error) { checks += 1; failures.push(`${name}: 예외 ${String(error?.stack || error).split("\n").slice(0, 3).join(" | ").slice(0, 500)}`); }
}
const noUrl = (text) => !/https?:\/\//i.test(text);

// ── 공통: 로그인한 화면 요청(머리글까지 본다) ─────────────────────────────────────────────────────────
async function get(fx, path, { cookie = fx.cookie, headers = {} } = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { ...(cookie ? { cookie } : {}), accept: "text/html", ...headers } }), fx.env, ctx);
  return { status: response.status, location: response.headers.get("location") || "", disposition: response.headers.get("content-disposition") || "", type: response.headers.get("content-type") || "", text: await response.text() };
}
async function api(fx, path, method = "GET", body) {
  globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method, headers: { cookie: fx.cookie, "content-type": "application/json", accept: "application/json", ...(method === "GET" ? {} : { origin: BASE, "sec-fetch-site": "same-origin" }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), fx.env, ctx);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}

// ══ R-1 · R-4 카카오 ════════════════════════════════════════════════════════════════════════════
const SECRET = "record-safety-secret-v229131";
const OWNER = "kakao_login:2265"; // user-bin, house-home 소유자
const HOME = "house-home";
const SELECT_KEY = "kakao_selected_household_v2251:user-bin";
const TODAY = "2026-11-10", YESTERDAY = "2026-11-09";
const SEED = ["커피 4500", "택시 8000", "점심 12000"];
const GUARDS = ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE"];
const clearGuards = () => { for (const name of GUARDS) globalThis[name]?.clear?.(); };
function payloadFor(utterance, { user = OWNER, room = "" } = {}) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
// Secret 으로 확인된 /skill 요청 한 번. clear:false 면 반복 방지 기억을 지우지 않고(바로 다시 보낸 말), advanceMs 만큼만 시계를 민다.
async function say(fx, utterance, { user = OWNER, room = "", clear = true, advanceMs = 60_000 } = {}) {
  if (clear) clearGuards();
  globalThis.__AB_QA_FIXED_NOW_MS += advanceMs;
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  let body = null;
  try { body = JSON.parse(raw); } catch (_) {}
  for (let round = 0; round < 12 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  return { status: response.status, text: body ? textOf(body) : raw };
}
async function kakaoScene(task, env = {}) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${TODAY}T12:00:00+09:00`);
  try {
    return await fixture(async (fx) => {
      clearGuards();
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      Object.assign(fx.env, env);
      fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === HOME && row.source_user_key === OWNER) && !(row.household_id === HOME && /^2026-(?:11|01)/.test(String(row.transaction_date || ""))));
      putSetting(fx, SELECT_KEY, HOME);
      return await task(fx);
    });
  } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}
// 그 가계부의 2026년 기록 전부(만든 순서). 바뀐 시각만 빼고 모든 칸을 견준다.
const ledger = (fx, householdId = HOME) => fx.db.transactions
  .filter((row) => row.household_id === householdId && String(row.transaction_date || "") >= "2026-01-01" && (householdId !== HOME || row.source_user_key === OWNER))
  .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)))
  .map((row) => JSON.stringify(Object.entries(row).filter(([key]) => key !== "updated_at").sort(([a], [b]) => a.localeCompare(b))));
const brief = (fx, householdId = HOME) => fx.db.transactions
  .filter((row) => row.household_id === householdId && String(row.transaction_date || "") >= "2026-01-01" && (householdId !== HOME || row.source_user_key === OWNER))
  .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)))
  .map((row) => `${row.transaction_date} ${row.memo || row.raw_text} ${Number(row.amount)}`);
async function seed(fx, list = SEED, options = {}) {
  for (const utterance of list) {
    const reply = await say(fx, utterance, options);
    ok(/저장했어요/.test(reply.text), `준비 ‘${utterance}’ 저장 (${reply.text.split("\n")[0]})`);
  }
}
const askText = (sentence, no = "02", head = `수정 ${no}번`, examples = [`${head} 금액 13000`, `${head} 내용 점심`]) => [
  `🤔 보낸 말(‘${sentence}’)이 ${no}번 기록을 고치는 말인지 새 기록인지 정하지 못했어요.`,
  `아무것도 바꾸거나 저장하지 않았고, ${no}번 수정은 끝냈어요.`,
  "새 기록이면 같은 말을 한 번 더 보내 주세요.",
  `${no}번을 고치려면 한 줄로 보내 주세요:`,
  ...examples.map((line) => `👉 ${line}`),
].join("\n");
// 칸 이름 그대로 시작한 말은 보낸 말을 그대로 붙인 한 줄 명령을 예문으로 받는다(고치려던 사람은 그 한 줄을 보내면 된다). 분류·결제수단 값에 금액 낱말이 든 말
// (‘결제수단 변경 수수료 1000원’)은 그 한 줄이 통하지 않으므로 붙이지 않는다(독립 검토 3).
const NAMED_START = new Set(["제목 없는 전시 12000원", "이름 스티커 5000원", "내용 증명 우체국 5000원", "메모 12월 회비 3만원"]);
const askFor = (sentence) => (NAMED_START.has(sentence) ? askText(sentence, "02", "수정 02번", [`수정 02번 ${sentence}`]) : askText(sentence));

// 고치기 전에는 02번의 내용·금액·분류·결제수단을 묻지 않고 바꾸던 말 — 이제 바꾸지도 저장하지도 않고 두 길을 알린다.
const AMBIGUOUS = [
  "메모지 2000원", "이름표 3000원", "가격표 3000원", "금액권 5만원", "내용물 택배비 4000원", "분류기 3만원", "항목별 정리함 9000원", "수단과 방법 책 15000원",
  "제목 없는 전시 12000원", "이름 스티커 5000원", "결제수단 변경 수수료 1000원", "내용 증명 우체국 5000원",
  "3번 출구 떡볶이 5000원", "4번 타자 유니폼 5만원", "2번 버스 1500원", "메모 12월 회비 3만원",
];
// 고치기 전에도 바꾸지 않고 묻거나 확인하던 말 — 답도 창도 고치기 전 그대로다(독립 검토 3: 3차 수정까지는 이런 말에도 두 길 안내를 내고 창을 닫아,
// 이어 보낸 ‘1번 13000원으로’ 가 01번을 고치고 ‘13000’ 이 새 기록이 됐다).
const ASKED_BEFORE = [
  ["사과 5000원", "혹시 내용을 '사과 5000원'으로 바꾸는 건가요? (네/아니오)"],
  ["분식 8000원", "혹시 내용을 '분식 8000원'으로 바꾸는 건가요? (네/아니오)"],
  ["가방 5만원", "혹시 금액을 50,000원으로 바꾸는 건가요? (네/아니오)"],
  ["수박 2만원", "혹시 결제수단을 '2만원'으로 바꾸는 건가요? (네/아니오)"],
  ["엄마 용돈 10만원", "✏️ 얼마로 바꿀까요? 예: 13000 · 1만3천원"],
  ["지출 커피 5000원", "혹시 지출자를 '커피 5000원'으로 바꾸는 건가요? (네/아니오)"],
  ["금엑 13000", "혹시 금액을 13,000원으로 바꾸는 건가요? (네/아니오)"],
  ["얼마 전 산 책 15000원", "✏️ 얼마로 바꿀까요? 예: 13000 · 1만3천원"],
  ["7번 국도 휴게소 8000원", "⚠️ 지우지 않았어요. 기록은 그대로예요."],
  ["얼마 13000원인데요", "✏️ 얼마로 바꿀까요? 예: 13000 · 1만3천원"],
  ["1번 커피 5000원", "✏️ 얼마로 바꿀까요? 예: 13000 · 1만3천원"],
  // 상태 기계는 ‘고친다’ 고 답하지만 값 확인(날짜 풀기·구성원 찾기)에서 거절되던 말: 고치기 전처럼 그 자리에서 다시 묻는다(창이 열려 있다).
  ["날짜 커피 1만 3천원", "⚠️ '커피 1만 3천원'을 날짜로 알아듣지 못했어요. 기록은 그대로예요."],
  ["일자 5000원", "⚠️ '5000원'을 날짜로 알아듣지 못했어요. 기록은 그대로예요."],
  ["누가 엄마 카드 5000", "⚠️ '엄마 카드 5000'을 구성원 목록에서 찾지 못했어요."],
];
await section("R-1 열린 수정 창의 기록 꼴 말", async () => {
  for (const sentence of AMBIGUOUS) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      const menu = await say(fx, "수정 02번");
      ok(/02번/.test(menu.text), `R-1 ‘${sentence}’ 준비: 02번 수정 창이 열린다`);
      const before = ledger(fx);
      const reply = await say(fx, sentence);
      eq(reply.text, askFor(sentence), `R-1 ‘${sentence}’: 두 길을 알리는 답`);
      ok(noUrl(reply.text), `R-1 ‘${sentence}’: 답에 주소가 없다`);
      eq(JSON.stringify(ledger(fx)), JSON.stringify(before), `R-1 ‘${sentence}’: 기록은 한 칸도 바뀌지 않고 새 기록도 없다`);
      // 같은 말을 바로 한 번 더(2초 뒤, 반복 방지 기억을 지우지 않고): 창이 닫혀 새 기록 한 건이 된다.
      const again = await say(fx, sentence, { clear: false, advanceMs: 2000 });
      const after = ledger(fx);
      ok(/저장했어요/.test(again.text) && !again.text.includes("수정은 끝내고"), `R-1 ‘${sentence}’: 한 번 더 보내면 새 기록으로 저장된다 (${again.text.split("\n")[0]})`);
      eq(after.length, before.length + 1, `R-1 ‘${sentence}’: 새 기록은 한 건`);
      eq(JSON.stringify(after.slice(0, before.length)), JSON.stringify(before), `R-1 ‘${sentence}’: 한 번 더 보낸 뒤에도 앞 기록은 그대로`);
      eq(fx.db.transactions.filter((row) => row.household_id === HOME && row.raw_text === sentence).length, 1, `R-1 ‘${sentence}’: 원문 그대로 한 번 저장`);
    });
  }
  // 고치기 전에도 묻거나 확인하던 말: 답의 첫 줄이 고치기 전과 같고, 기록은 그대로이고, 창이 열려 있다(‘취소’ 가 그 창을 닫는다).
  for (const [sentence, head] of ASKED_BEFORE) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      const before = ledger(fx);
      const reply = await say(fx, sentence);
      eq(reply.text.split("\n")[0], head, `R-1 고치기 전에도 묻던 말 ‘${sentence}’: 답의 첫 줄`);
      eq(JSON.stringify(ledger(fx)), JSON.stringify(before), `R-1 고치기 전에도 묻던 말 ‘${sentence}’: 기록 그대로`);
      const cancel = await say(fx, "취소");
      ok(cancel.text.startsWith("👌 02번 수정을 취소했어요."), `R-1 고치기 전에도 묻던 말 ‘${sentence}’ 뒤: 창이 열려 있다 (${cancel.text.split("\n")[0]})`);
    });
  }
  // 독립 검토 3 — 1번: 값을 되물은 뒤(창이 열려 있다) 이어 보낸 말은 그 기록의 답으로 다뤄진다. 3차 수정까지는 창이 닫혀 ‘1번 13000원으로’ 가 01번을 고치고
  // ‘3번 현금’ 이 03번을 고치고 ‘13000’ 이 새 기록이 됐다.
  for (const [next, head, rows] of [
    ["1번 13000원으로", "⚠️ 지금은 02번 기록을 고치고 있어요.", [`${TODAY} 커피 4500`, `${TODAY} 택시 8000`, `${TODAY} 점심 12000`]],
    ["3번 현금", "⚠️ 지금은 02번 기록을 고치고 있어요.", [`${TODAY} 커피 4500`, `${TODAY} 택시 8000`, `${TODAY} 점심 12000`]],
    ["13000", "✅ 02번 금액을 13,000원으로 변경했어요.", [`${TODAY} 커피 4500`, `${TODAY} 택시 13000`, `${TODAY} 점심 12000`]],
  ]) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      const before = ledger(fx);
      await say(fx, "얼마 13000원인데요");
      const reply = await say(fx, next);
      ok(reply.text.startsWith(head), `R-1 값을 되물은 뒤의 ‘${next}’ (${reply.text.split("\n")[0]})`);
      eq(brief(fx).join(" / "), rows.join(" / "), `R-1 값을 되물은 뒤의 ‘${next}’: 기록 셋`);
      if (head.startsWith("⚠️")) eq(JSON.stringify(ledger(fx)), JSON.stringify(before), `R-1 값을 되물은 뒤의 ‘${next}’: 다른 기록도 한 칸도 바뀌지 않는다`);
    });
  }
  // 답이 알린 한 줄 명령은 그대로 보내면 그 기록을 고친다. 그 뒤 숫자 말은 창이 닫혀 02번을 바꾸지 않는다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    await say(fx, "메모지 2000원");
    const number = await say(fx, "13000");
    eq(brief(fx)[1], `${TODAY} 택시 8000`, `R-1 되물은 뒤의 ‘13000’ 은 02번을 고치지 않는다 (${number.text.split("\n")[0]})`);
    const amount = await say(fx, "수정 02번 금액 13000");
    ok(amount.text.startsWith("✅ 02번 금액을 13,000원으로"), `R-1 예문 ‘수정 02번 금액 13000’ (${amount.text.split("\n")[0]})`);
    const memo = await say(fx, "수정 02번 내용 점심");
    ok(memo.text.startsWith("✅ 02번 내용을 '점심'으로"), `R-1 예문 ‘수정 02번 내용 점심’ (${memo.text.split("\n")[0]})`);
    eq(brief(fx)[1], `${TODAY} 점심 13000`, "R-1 예문 둘을 보낸 뒤의 02번");
  });
  // 칸 이름으로 시작한 말의 예문(보낸 말 그대로 붙인 한 줄 명령)은 보내면 예전처럼 그 기록을 고친다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const asked = await say(fx, "메모 12월 회비 3만원");
    ok(asked.text.endsWith("\n👉 수정 02번 메모 12월 회비 3만원"), `R-1 칸 이름으로 시작한 말: 예문은 보낸 말 그대로 (${asked.text.split("\n").pop()})`);
    const fix = await say(fx, "수정 02번 메모 12월 회비 3만원");
    ok(fix.text.startsWith("✅ 02번 내용을 '12월 회비 3만원'으로"), `R-1 그 예문을 보내면 그 기록을 고친다 (${fix.text.split("\n")[0]})`);
    eq(brief(fx)[1], `${TODAY} 12월 회비 3만원 8000`, "R-1 그 예문을 보낸 뒤의 02번");
    eq(brief(fx).length, 3, "R-1 그 예문은 새 기록을 만들지 않는다");
  });
  // 값을 묻는 단계·확인 단계에서도 같다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const ask = await say(fx, "4");
    ok(ask.text.includes("내용을 무엇으로"), `R-1 값 단계 준비 (${ask.text.split("\n")[0]})`);
    const before = ledger(fx);
    const reply = await say(fx, "메모지 2000원");
    eq(reply.text, askText("메모지 2000원"), "R-1 값을 묻는 단계의 ‘메모지 2000원’");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 값을 묻는 단계: 기록 그대로");
  });
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const confirm = await say(fx, "떡볶이");
    ok(/바꾸는 건가요/.test(confirm.text), `R-1 확인 단계 준비 (${confirm.text.split("\n")[0]})`);
    const before = ledger(fx);
    const reply = await say(fx, "메모지 2000원");
    eq(reply.text, askText("메모지 2000원"), "R-1 확인 단계의 ‘메모지 2000원’");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 확인 단계: 기록 그대로");
  });
  // 확인 단계에 온, 고치기 전에도 확인으로 가던 말은 고치기 전 그대로 새 확인 질문이다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    await say(fx, "떡볶이");
    const before = ledger(fx);
    const reply = await say(fx, "가방 5만원");
    eq(reply.text.split("\n")[0], "혹시 금액을 50,000원으로 바꾸는 건가요? (네/아니오)", "R-1 확인 단계의 ‘가방 5만원’: 고치기 전과 같은 확인 질문");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 확인 단계의 ‘가방 5만원’: 기록 그대로");
  });
  // 오늘이 아닌 기록의 창: 예문에 날짜가 붙는다.
  await kakaoScene(async (fx) => {
    await seed(fx, ["어제 우유 3000"]);
    const menu = await say(fx, "어제 수정 01번");
    ok(/01번/.test(menu.text), `R-1 어제 기록 준비 (${menu.text.split("\n")[0]})`);
    const reply = await say(fx, "메모지 2000원");
    eq(reply.text, askText("메모지 2000원", "01", "11월 9일 수정 01번"), "R-1 어제 기록의 창: 예문에 날짜");
    eq(brief(fx)[0], `${YESTERDAY} 우유 3000`, "R-1 어제 기록 그대로");
    const fix = await say(fx, "11월 9일 수정 01번 금액 13000");
    ok(fix.text.startsWith("✅ 01번 금액을 13,000원으로"), `R-1 날짜 붙은 예문이 그 기록을 고친다 (${fix.text.split("\n")[0]})`);
  });
  // 40자가 넘는 말은 줄여 보인다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const long = "메모지 스프링 노트 삼색 볼펜 형광펜 포스트잇 수정테이프 클립 문구점에서 한꺼번에 23000원";
    const reply = await say(fx, long);
    ok(reply.text.startsWith(`🤔 보낸 말(‘${long.slice(0, 40)}…’)이 02번 기록을`), `R-1 긴 말은 40자에서 줄인다 (${reply.text.split("\n")[0]})`);
  });
  // 단톡방에서도 같다(방의 첫 호출자가 그 방 가계부의 소유자가 된다).
  await kakaoScene(async (fx) => {
    const room = "8".repeat(64), user = createHash("sha256").update("v131-room-user").digest("hex") + "ab";
    await seed(fx, SEED, { user, room });
    const hid = String(fx.db.transactions.find((row) => row.raw_text === "택시 8000" && row.source_user_key === user)?.household_id || "");
    ok(!!hid && hid !== HOME, "R-1 단톡방 준비: 방 가계부에 저장");
    await say(fx, "수정 02번", { user, room });
    const before = ledger(fx, hid);
    const reply = await say(fx, "가격표 3000원", { user, room });
    eq(reply.text, askText("가격표 3000원"), "R-1 단톡방의 ‘가격표 3000원’");
    eq(JSON.stringify(ledger(fx, hid)), JSON.stringify(before), "R-1 단톡방: 기록 그대로");
    const again = await say(fx, "가격표 3000원", { user, room, clear: false, advanceMs: 2000 });
    ok(/저장했어요/.test(again.text) && ledger(fx, hid).length === before.length + 1, `R-1 단톡방: 한 번 더 보내면 새 기록 (${again.text.split("\n")[0]})`);
  });
  // 예전 그대로인 것: 고치는 말은 고치고, 분명한 새 기록은 창을 닫고 저장하고, 부정·취소는 예전 답이다.
  const UNCHANGED = [
    ["금액 13000", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액만 5000원으로", "✅ 02번 금액을 5,000원으로 변경했어요.", `${TODAY} 택시 5000`],
    ["가격은 9천원으로 바꿔줘", "✅ 02번 금액을 9,000원으로 변경했어요.", `${TODAY} 택시 9000`],
    // 독립 검토 1 — 4번: ‘금액 칸 + 금액 하나’ 뿐인 답은 끝맺음이 달라도 예전처럼 고친다(1차 수정이 되묻던 꼴).
    ["금액만 13000원으로요", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["얼마 13000원으로요", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["1번 13000원으로요", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["1번 13000원으로 좀", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["1 만삼천원으로", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액 1만 3천원으로 좀", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    // 독립 검토 1 — 2번, 독립 검토 2 — 2번: 금액 칸 이름에 수를 붙여 쓴 말은 읽지 않고 묻는다. 예전에는 뒤 낱말만 읽어 ‘금액1만 3천원’ 이 3,000원,
    // ‘금액2만 5천원으로 바꿔줘’ 가 5,000원이 됐다(2차 수정은 붙은 수를 읽어 ‘금액만5천원’ 을 5,000원으로 고쳤다 — 15,000원일 수도 있는 말이다).
    ["금액1만 3천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["가격1만 5천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액2만 5천원으로 바꿔줘", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액만5천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액13000", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액13000원으로", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액은5000원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액이13000", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["가격만원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액이만원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액만원으로 바꿔줘", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    // 독립 검토 2 — 3번: 붙은 것이 수가 아니면 이 판 전과 같다(2차 수정은 ‘금액변경 13000’·‘금액수정 13000원’·‘가격변경 3000’ 을 되물었다).
    ["금액변경 13000", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액수정 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["가격변경 3000", "✅ 02번 금액을 3,000원으로 변경했어요.", `${TODAY} 택시 3000`],
    ["가격표 3000원으로 바꿔줘", "✅ 02번 금액을 3,000원으로 변경했어요.", `${TODAY} 택시 3000`],
    // 금액 칸 이름에 높임말·쉼표가 붙은 답도 이 판 전처럼 고친다(3차 수정 전에는 두 길 안내로 창을 닫았다).
    ["금액이요 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액은요 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액, 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액: 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액이에요 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["가격입니다 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    // 독립 검토 3 — 4번: 금액 칸 이름에 고치는 말(변경·수정)이 붙고 한글 단위 금액이 온 답, 문장부호·끝말이 더 붙은 답도 고치기 전처럼 고친다.
    ["금액변경 5만원", "✅ 02번 금액을 50,000원으로 변경했어요.", `${TODAY} 택시 50000`],
    ["금액수정 5만원", "✅ 02번 금액을 50,000원으로 변경했어요.", `${TODAY} 택시 50000`],
    ["가격변경 3천원", "✅ 02번 금액을 3,000원으로 변경했어요.", `${TODAY} 택시 3000`],
    ["금액변경 13000원으로", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액정정 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액... 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액을요 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액만으로 5000원", "✅ 02번 금액을 5,000원으로 변경했어요.", `${TODAY} 택시 5000`],
    ["금액란 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액칸 1만 3천원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액만, 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    // 독립 검토 4 — 1번: 금액 칸 이름에 고치는 말·칸을 가리키는 말·끝말·기호가 붙은 답도 고치기 전처럼 고친다(4차 수정까지는 두 길 안내였다).
    ["금액좀 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액다시 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액란에 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액인데요 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["금액바꿔 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["가격수정좀 3천원", "✅ 02번 금액을 3,000원으로 변경했어요.", `${TODAY} 택시 3000`],
    ["금액ㅠㅠ 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    // 독립 검토 3 — 2번: 저장 전 안전망이 고치는 말로 보는 말(한 번 더 보내도 새 기록이 되지 않는다)은 고치기 전처럼 그 기록을 고친다.
    ["메모 2025 연말정산으로 바꿔줘", "✅ 02번 내용을 '2025 연말정산'으로 변경했어요.", `${TODAY} 2025 연말정산 8000`],
    ["내용 2026 다이어리로 바꿔줘", "✅ 02번 내용을 '2026 다이어리'로 변경했어요.", `${TODAY} 2026 다이어리 8000`],
    ["금액변경해줘 13000원", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    // 독립 검토 3 — 6번: 칸 이름과 수 사이에 기호가 있어도 붙여 쓴 수는 읽지 않고 묻는다(예전에는 ‘금액:1만 3천원’ 이 3,000원이 됐다).
    ["금액:1만 3천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["금액=2만 5천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    // 독립 검토 2 — 6번: 금액이 아닌 분류·결제수단 값은 이 판 전처럼 바뀐다(2차 수정은 ‘사원’·‘구원’·‘5만 포인트’ 를 금액으로 보고 막았다).
    ["분류 사원 식당", "✅ 02번 분류를 '사원 식당'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["결제수단 사원 카드", "✅ 02번 결제수단을 '사원 카드'로 변경했어요.", `${TODAY} 택시 8000`],
    ["분류 구원", "✅ 02번 분류를 '구원'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["결제수단 5만 포인트", "✅ 02번 결제수단을 '5만 포인트'로 변경했어요.", `${TODAY} 택시 8000`],
    ["분류 10만 적금", "✅ 02번 분류를 '10만 적금'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["결제수단 5만원권", "✅ 02번 결제수단을 '5만원권'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["분류 만원의행복", "✅ 02번 분류를 '만원의행복'으로 변경했어요.", `${TODAY} 택시 8000`],
    // 메뉴 번호로 고른 분류·결제수단·날짜의 값(금액 없음)은 예전 그대로다.
    ["3번 현금", "✅ 02번 결제수단을 '현금'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["2번 외식", "✅ 02번 분류를 '외식'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["5번 어제", "✅ 02번 날짜를 2026-11-09로 변경했어요.", `${YESTERDAY} 택시 8000`],
    ["메모 점심", "✅ 02번 내용을 '점심'으로 변경했어요.", `${TODAY} 점심 8000`],
    ["메모 점심 12000원", "✅ 02번 내용을 '점심 12000원'으로 변경했어요.", `${TODAY} 점심 12000원 8000`],
    ["1번 13000", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["13000", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["날짜 어제", "✅ 02번 날짜를 2026-11-09로 변경했어요.", `${YESTERDAY} 택시 8000`],
    ["5000원 아니야", "⚠️ 아니라고 하셔서 바꾸지 않았어요.", `${TODAY} 택시 8000`],
    ["취소", "👌 02번 수정을 취소했어요.", `${TODAY} 택시 8000`],
  ];
  for (const [sentence, head, second] of UNCHANGED) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      const reply = await say(fx, sentence);
      ok(reply.text.startsWith(head), `R-1 예전 그대로 ‘${sentence}’ (${reply.text.split("\n")[0]})`);
      eq(brief(fx)[1], second, `R-1 예전 그대로 ‘${sentence}’: 02번`);
      eq(brief(fx).length, 3, `R-1 예전 그대로 ‘${sentence}’: 새 기록 없음`);
      await say(fx, "취소");
    });
  }
  // 독립 검토 1 — 3번: 칸 이름·메뉴 번호로 고른 분류·결제수단의 값에 금액이 들어 있으면 바꾸지 않고 다시 묻는다(창은 열려 있다).
  // 예전에는 결제수단이 ‘밥 5000원’·‘떡볶이 5000원’, 분류가 ‘술 3만원’ 이 됐다.
  for (const [sentence, value, label, particle, example] of [
    ["3번 밥 5000원", "밥 5000원", "결제수단", "을", "결제수단 현금"], ["3 떡볶이 5000원", "떡볶이 5000원", "결제수단", "을", "결제수단 현금"],
    ["3번 현금 5000원", "현금 5000원", "결제수단", "을", "결제수단 현금"], ["결제수단 현금 5천원", "현금 5천원", "결제수단", "을", "결제수단 현금"],
    ["2번 술 3만원", "술 3만원", "분류", "를", "분류 카페/간식"], ["분류 술 3만원", "술 3만원", "분류", "를", "분류 카페/간식"],
    // 독립 검토 2 — 1번: 겹친 금액(봇의 예문 꼴 ‘1만3천원’)·한글 수·끝말이 붙은 금액도 같다(2차 수정의 꼴은 이들을 놓쳐 예전처럼 칸이 바뀌었다).
    ["3번 1만3천원", "1만3천원", "결제수단", "을", "결제수단 현금"], ["2번 술 3만5천원", "술 3만5천원", "분류", "를", "분류 카페/간식"],
    ["2번 술 5천5백원", "술 5천5백원", "분류", "를", "분류 카페/간식"], ["분류 술 3만5000원", "술 3만5000원", "분류", "를", "분류 카페/간식"],
    ["2번 술 만5천원", "술 만5천원", "분류", "를", "분류 카페/간식"], ["3번 밥 오천원", "밥 오천원", "결제수단", "을", "결제수단 현금"],
    ["3번 밥 5,000원에", "밥 5,000원에", "결제수단", "을", "결제수단 현금"], ["3번 카드 삼만원", "카드 삼만원", "결제수단", "을", "결제수단 현금"],
  ]) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      const before = ledger(fx);
      const reply = await say(fx, sentence);
      eq(reply.text, `⚠️ ‘${value}’에는 금액이 들어 있어서 ${label}${particle} 바꾸지 않았어요. 기록은 그대로예요.\n${label}만 보내 주세요. 예: ${example}\n새로 기록하려면 먼저 ‘취소’를 보내 주세요.`, `R-1 ‘${sentence}’: 금액이 든 값은 ${label}에 넣지 않는다`);
      eq(JSON.stringify(ledger(fx)), JSON.stringify(before), `R-1 ‘${sentence}’: 기록 그대로`);
      const next = await say(fx, "금액 9000");
      ok(next.text.startsWith("✅ 02번 금액을 9,000원으로"), `R-1 ‘${sentence}’ 뒤: 창은 열려 있어 이어서 고칠 수 있다 (${next.text.split("\n")[0]})`);
    });
  }
  // 독립 검토 2 — 5번: 금액을 묻던 자리에 온 붙여 쓴 말은 이 판 전처럼 그 자리에서 다시 묻고, 이어 보낸 금액으로 고친다(2차 수정은 두 길 안내로 창을 닫아
  // 이어 보낸 ‘13000’ 이 새 기록으로 저장됐다).
  for (const glued of ["금액13000원", "금액1만 3천원"]) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      await say(fx, "1");
      const reply = await say(fx, glued);
      ok(reply.text.startsWith("⚠️ 금액을 알아듣지 못했어요."), `R-1 금액을 묻던 자리의 ‘${glued}’: 그 자리에서 다시 묻는다 (${reply.text.split("\n")[0]})`);
      eq(brief(fx)[1], `${TODAY} 택시 8000`, `R-1 금액을 묻던 자리의 ‘${glued}’: 기록 그대로`);
      const next = await say(fx, "13000");
      ok(next.text.startsWith("✅ 02번 금액을 13,000원으로") && brief(fx).length === 3, `R-1 금액을 묻던 자리의 ‘${glued}’ 뒤: 이어 보낸 금액으로 고친다 (${next.text.split("\n")[0]})`);
      eq(brief(fx)[1], `${TODAY} 택시 13000`, `R-1 금액을 묻던 자리의 ‘${glued}’ 뒤: 02번`);
    });
  }
  // 붙여 쓴 금액을 되물은 뒤 금액만 다시 보내면 그 금액으로 고친다(예전에는 ‘금액1만 3천원’ 이 3,000원이 되고 이어 보낸 금액은 새 기록이 됐다).
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const ask = await say(fx, "금액1만 3천원");
    ok(ask.text.startsWith("✏️ 얼마로 바꿀까요?") && brief(fx)[1] === `${TODAY} 택시 8000`, `R-1 ‘금액1만 3천원’: 값을 묻는다 (${ask.text.split("\n")[0]})`);
    const next = await say(fx, "1만 3천원");
    ok(next.text.startsWith("✅ 02번 금액을 13,000원으로") && brief(fx).length === 3, `R-1 ‘금액1만 3천원’ 뒤의 ‘1만 3천원’: 13,000원으로 고친다 (${next.text.split("\n")[0]})`);
    eq(brief(fx)[1], `${TODAY} 택시 13000`, "R-1 ‘금액1만 3천원’ 뒤의 ‘1만 3천원’: 02번");
  });
  // 다른 칸의 값을 묻던 자리에서는 붙여 쓴 말도 그 칸을 묻지 않고 바꾸지 않는다(내용을 묻던 자리의 ‘금액13000원 점심’ 은 두 길 안내, 결제수단 목록에서는 목록을 다시 보인다).
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    await say(fx, "4");
    const before = ledger(fx);
    const reply = await say(fx, "금액13000원 점심");
    ok(reply.text.startsWith("🤔 보낸 말(‘금액13000원 점심’)이 02번 기록을"), `R-1 내용을 묻던 자리의 ‘금액13000원 점심’: 두 길 안내 (${reply.text.split("\n")[0]})`);
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 내용을 묻던 자리의 ‘금액13000원 점심’: 기록 그대로");
  });
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    await say(fx, "3");
    const before = ledger(fx);
    const reply = await say(fx, "금액13000원 카드");
    ok(reply.text.startsWith("⚠️ 목록의 번호로 골라주세요."), `R-1 결제수단을 묻던 자리의 ‘금액13000원 카드’: 목록을 다시 보인다 (${reply.text.split("\n")[0]})`);
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 결제수단을 묻던 자리의 ‘금액13000원 카드’: 기록 그대로");
  });
  // 한 줄 명령도 같다: 붙여 쓴 수는 묻고, 붙은 것이 수가 아니면 이 판 전처럼 고치고, 분류·결제수단 값의 금액은 바꾸지 않는다.
  for (const [command, head, second] of [
    ["수정 02번 금액1만 3천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 금액13000원으로", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 금액만5천원으로 바꿔줘", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 가격만2천원으로", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 금액변경 13000", "✅ 02번 금액을 13,000원으로 변경했어요.", `${TODAY} 택시 13000`],
    ["수정 02번 금액-1만 5천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 금액,1만 3천원", "✏️ 얼마로 바꿀까요?", `${TODAY} 택시 8000`],
    ["수정 02번 금액변경 5만원", "✅ 02번 금액을 50,000원으로 변경했어요.", `${TODAY} 택시 50000`],
    ["수정 02번 분류 술 1만3천원", "⚠️ ‘술 1만3천원’에는 금액이 들어 있어서 분류를 바꾸지 않았어요.", `${TODAY} 택시 8000`],
    ["수정 02번 결제수단 현금 5000원", "⚠️ ‘현금 5000원’에는 금액이 들어 있어서 결제수단을 바꾸지 않았어요.", `${TODAY} 택시 8000`],
    ["수정 02번 분류 사원 식당", "✅ 02번 분류를 '사원 식당'으로 변경했어요.", `${TODAY} 택시 8000`],
    ["수정 02번 결제수단 5만 포인트", "✅ 02번 결제수단을 '5만 포인트'로 변경했어요.", `${TODAY} 택시 8000`],
  ]) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      const before = ledger(fx);
      const reply = await say(fx, command);
      ok(reply.text.startsWith(head), `R-1 한 줄 명령 ‘${command}’ (${reply.text.split("\n")[0]})`);
      eq(brief(fx)[1], second, `R-1 한 줄 명령 ‘${command}’: 02번`);
      eq(brief(fx).length, 3, `R-1 한 줄 명령 ‘${command}’: 새 기록 없음`);
      if (!head.startsWith("✅")) eq(JSON.stringify(ledger(fx)), JSON.stringify(before), `R-1 한 줄 명령 ‘${command}’: 기록은 한 칸도 바뀌지 않는다`);
      await say(fx, "취소");
    });
  }
  // 칸 이름·메뉴 번호로 시작하고 수가 든 말은 금액 낱말이 없어도 새 기록 꼴이라 두 길 안내를 받는다(예전에는 결제수단·내용이 그 글로 바뀌었다 — 고치려던 말일 수도,
  // ‘원’ 을 빼고 적은 새 기록일 수도 있다). 칸 이름으로 시작한 말은 답의 예문(보낸 말 그대로의 한 줄 명령)을 보내면 고쳐진다.
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const before = ledger(fx);
    const asked = await say(fx, "결제수단 국민 체크카드 1234");
    eq(asked.text, askText("결제수단 국민 체크카드 1234", "02", "수정 02번", ["수정 02번 결제수단 국민 체크카드 1234"]), "R-1 ‘결제수단 국민 체크카드 1234’: 두 길 안내와 보낸 말 그대로의 예문");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 ‘결제수단 국민 체크카드 1234’: 기록 그대로");
    const fix = await say(fx, "수정 02번 결제수단 국민 체크카드 1234");
    ok(fix.text.startsWith("✅ 02번 결제수단을 '국민 체크카드 1234'로"), `R-1 그 예문을 보내면 결제수단을 고친다 (${fix.text.split("\n")[0]})`);
    eq(brief(fx).length, 3, "R-1 그 예문은 새 기록을 만들지 않는다(결제수단)");
  });
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const before = ledger(fx);
    const asked = await say(fx, "3번 국민 1234");
    eq(asked.text, askText("3번 국민 1234"), "R-1 ‘3번 국민 1234’: 두 길 안내");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 ‘3번 국민 1234’: 기록 그대로");
  });
  // 독립 검토 3 — 8번: 분류·결제수단 값에 금액 낱말이 든 새 기록 꼴의 말에는 보낸 말 그대로의 예문을 붙이지 않는다(그 한 줄은 금액 낱말 때문에 거절된다).
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const before = ledger(fx);
    const asked = await say(fx, "결제수단 현금 5000원 결제");
    eq(asked.text, askText("결제수단 현금 5000원 결제"), "R-1 ‘결제수단 현금 5000원 결제’: 두 길 안내(보낸 말 그대로의 예문 없음)");
    eq(JSON.stringify(ledger(fx)), JSON.stringify(before), "R-1 ‘결제수단 현금 5000원 결제’: 기록 그대로");
  });
  // 독립 검토 3 — 8번: 40자가 넘는 말은 글자 단위로 줄인다(이모지가 반으로 잘리지 않는다).
  await kakaoScene(async (fx) => {
    await seed(fx);
    await say(fx, "수정 02번");
    const long = `메모지 ${"가".repeat(35)}😀😀 문구점에서 23000원`;
    const reply = await say(fx, long);
    const shown = reply.text.split("\n")[0];
    ok(shown.startsWith(`🤔 보낸 말(‘${Array.from(long).slice(0, 40).join("")}…’)이 02번 기록을`), `R-1 이모지가 든 긴 말: 글자 단위로 40자 (${shown.slice(0, 30)}…)`);
    ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(reply.text), "R-1 이모지가 든 긴 말: 반쪽 글자가 없다");
  });
  for (const sentence of ["저녁 15000원", "편의점 3500원 카드", "어제 택시 9800원"]) {
    await kakaoScene(async (fx) => {
      await seed(fx);
      await say(fx, "수정 02번");
      const reply = await say(fx, sentence);
      ok(reply.text.startsWith("✏️ 02번 수정은 끝내고, 보낸 내용을 새 기록으로 처리했어요.") && /저장했어요/.test(reply.text), `R-1 분명한 새 기록 ‘${sentence}’ 는 예전처럼 바로 저장 (${reply.text.split("\n")[0]})`);
      eq(brief(fx).length, 4, `R-1 분명한 새 기록 ‘${sentence}’: 한 건 늘었다`);
    });
  }
});

await section("R-4 띄어 쓴 분수가 날짜로 읽힌 기록", async () => {
  const fractionAsk = (text, month, day) => `‘${text}’ 부분이 날짜(${month}월 ${day}일)로 읽혀서 저장하지 않았어요. 이대로면 ${month}월 ${day}일 기록이 돼요.\n분량을 적은 거면 숫자를 빼고 다시 보내 주세요.\n케이크 한 조각 6000원\n날짜가 맞으면 달과 날을 이렇게 적어 주세요.\n${month}월 ${day}일 케이크 6000원`;
  for (const [sentence, text, month, day] of [
    ["케이크 1/8 조각 6000원", "1/8", 1, 8], ["피자 1/2 판 9000원", "1/2", 1, 2], ["수박 1/4 통 8000원", "1/4", 1, 4], ["치즈케이크 1/8 조각을 6500원에 삼", "1/8", 1, 8], ["김밥 2/3 줄 2000원", "2/3", 2, 3],
    // 독립 검토 1 — 1번: 조사 ‘에’·‘으로’ 와 분량 낱말 몇(마리·모·한판).
    ["케이크 1/8 조각에 6000원", "1/8", 1, 8], ["수박 1/2 통에 8000원", "1/2", 1, 2], ["치킨 1/2 마리 9000원", "1/2", 1, 2], ["피자 1/2 한판 9000원", "1/2", 1, 2], ["두부 1/2 모 1500원", "1/2", 1, 2], ["점심 3/4 인분으로 8000원", "3/4", 3, 4],
    // 독립 검토 2 — 4번: 앞에 날짜가 아닌 ‘수.수’·‘수-수’ 가 있어도 되묻고(2차 수정은 이런 줄을 날짜를 따로 적은 줄로 보아 다시 그 날짜로 저장했다),
    // 분량 낱말 뒤의 조사 과·와·하고도 같다.
    ["콜라 1.5L 피자 1/2 판 12000원", "1/2", 1, 2], ["2-3인분 피자 1/2 판 9000원", "1/2", 1, 2], ["콜라 1.2L 피자 1/2 판 12000원", "1/2", 1, 2], ["빵 3.500원 케이크 1/8 조각 6000원", "1/8", 1, 8],
    ["케이크 1/8 조각과 커피 9500원", "1/8", 1, 8], ["치킨 1/2 마리와 맥주 19000원", "1/2", 1, 2], ["떡 1/3 팩하고 식혜 7000원", "1/3", 1, 3],
    // 독립 검토 3 — 5번: 같은 줄의 앞 분수는 ‘따로 적은 날짜’ 가 아니다(3차 수정은 앞 분수를 날짜로 세어 뒤 분수의 기록을 다시 그 날짜로 저장했다).
    ["어제 피자 1/2 판 9000원 치킨 1/2 마리 9000원", "1/2", 1, 2], ["어제 수박 1/4 통 8000원 멜론 1/4 통 9000원", "1/4", 1, 4], ["피자 1/2 판 9000원 치킨 1/2 마리 9000원", "1/2", 1, 2],
    // 독립 검토 4 — 6번: 줄 가운데의 ‘수.수’·‘수-수’ 는 띄어 써도 날짜를 따로 적은 것이 아니다(4차 수정은 이런 줄을 다시 그 날짜로 저장했다).
    ["삼겹살 1.2 kg 피자 1/2 판 9000원", "1/2", 1, 2], ["떡볶이 1-2 인분 피자 1/2 판 9000원", "1/2", 1, 2], ["우유 1.2 L 피자 1/2 판 9000원", "1/2", 1, 2],
  ]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, sentence);
      eq(reply.text, fractionAsk(text, month, day), `R-4 ‘${sentence}’: 되묻는 답`);
      eq(brief(fx).length, 0, `R-4 ‘${sentence}’: 저장하지 않는다`);
    });
  }
  // 답의 예문 둘은 그대로 보내면 저장된다(분량은 오늘, 날짜는 그 날짜).
  await kakaoScene(async (fx) => {
    const piece = await say(fx, "케이크 한 조각 6000원");
    ok(/저장했어요/.test(piece.text), `R-4 예문 ‘케이크 한 조각 6000원’ 저장 (${piece.text.split("\n")[0]})`);
    const dated = await say(fx, "1월 8일 케이크 6000원");
    ok(/저장했어요/.test(dated.text), `R-4 예문 ‘1월 8일 케이크 6000원’ 저장 (${dated.text.split("\n")[0]})`);
    const rows = fx.db.transactions.filter((row) => row.household_id === HOME && row.source_user_key === OWNER && /^2026-(?:11|01)/.test(row.transaction_date));
    eq(rows.map((row) => `${row.transaction_date} ${Number(row.amount)}`).sort().join(" / "), `2026-01-08 6000 / ${TODAY} 6000`, "R-4 예문 둘의 날짜와 금액");
  });
  // 독립 검토 2 — 7번: 다른 줄에서 나온 기록의 날짜는 보지 않는다(2차 수정은 첫 줄의 진짜 1월 2일 때문에 ‘어제’ 를 적은 둘째 줄을 되물었다).
  await kakaoScene(async (fx) => {
    const reply = await say(fx, "1/2 택시 5000원\n어제 피자 1/2 판 9000원");
    const rows = fx.db.transactions.filter((row) => row.household_id === HOME && row.source_user_key === OWNER && String(row.transaction_date || "") >= "2026-01-01").map((row) => `${row.transaction_date} ${Number(row.amount)}`).sort();
    ok(/저장/.test(reply.text) && rows.length === 2, `R-4 두 줄(진짜 날짜 + ‘어제’ 를 적은 분수): 둘 다 저장 (${reply.text.split("\n")[0]})`);
    eq(rows.join(" / "), `2026-01-02 5000 / ${YESTERDAY} 9000`, "R-4 두 줄(진짜 날짜 + ‘어제’ 를 적은 분수): 날짜와 금액");
  });
  // 분수가 날짜로 읽힌 줄이 있으면 여러 줄이어도 되묻고 한 건도 저장하지 않는다.
  for (const [text, fraction, month, day] of [["커피 4500원\n케이크 1/8 조각 6000원", "1/8", 1, 8], ["1/2 택시 5000원\n피자 1/2 판 9000원", "1/2", 1, 2]]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, text);
      eq(reply.text, fractionAsk(fraction, month, day), `R-4 여러 줄 ‘${text.replace("\n", " ⏎ ")}’: 되묻는 답`);
      eq(brief(fx).length, 0, `R-4 여러 줄 ‘${text.replace("\n", " ⏎ ")}’: 한 건도 저장하지 않는다`);
    });
  }
  // 독립 검토 3 — 7번: 기록의 원문에서 기호가 빠진 줄(‘케이크(초코) 1/8 조각’)도 그 줄의 기록만 본다(3차 수정은 첫 줄의 진짜 1월 8일 때문에 둘째 줄을 되물었다).
  await kakaoScene(async (fx) => {
    const reply = await say(fx, "1/8 택시 5000원\n12/25 케이크(초코) 1/8 조각 6000원");
    const rows = fx.db.transactions.filter((row) => row.household_id === HOME && row.source_user_key === OWNER && String(row.transaction_date || "") >= "2026-01-01").map((row) => `${row.transaction_date} ${Number(row.amount)}`).sort();
    ok(/저장/.test(reply.text) && rows.length === 2, `R-4 두 줄(진짜 1월 8일 + 날짜를 적은 기호 든 줄): 둘 다 저장 (${reply.text.split("\n")[0]})`);
    eq(rows.join(" / "), "2026-01-08 5000 / 2026-12-25 6000", "R-4 두 줄(진짜 1월 8일 + 날짜를 적은 기호 든 줄): 날짜와 금액");
  });
  // 독립 검토 4 — 5번: 기록은 줄에 맞춘다. 같은 분수 조각이 다른 줄에도 있거나(‘… 계란 1/2 판’) 다른 줄의 낱말 머리와 겹쳐도(‘1/2 병원’) 그 줄의 기록만 본다
  // (4차 수정은 다른 줄의 진짜 1월 2일 때문에 ‘어제’ 를 적은 줄을 되물었다).
  for (const [text, expected] of [
    ["어제 피자 1/2 판 9000원\n1월 2일 계란 1/2 판 4000원", `2026-01-02 4000 / ${YESTERDAY} 9000`],
    ["어제 소주 1/2 병 2000원\n1/2 병원 15000원", `2026-01-02 15000 / ${YESTERDAY} 2000`],
    ["치킨 1/2 마리랑 콜라 12000원\n1/2 택시 5000원", `2026-01-02 5000 / ${TODAY} 12000`],
  ]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, text);
      const rows = fx.db.transactions.filter((row) => row.household_id === HOME && row.source_user_key === OWNER && String(row.transaction_date || "") >= "2026-01-01").map((row) => `${row.transaction_date} ${Number(row.amount)}`).sort();
      ok(/저장/.test(reply.text) && rows.length === 2, `R-4 두 줄 ‘${text.replace("\n", " ⏎ ")}’: 둘 다 저장 (${reply.text.split("\n")[0]})`);
      eq(rows.join(" / "), expected, `R-4 두 줄 ‘${text.replace("\n", " ⏎ ")}’: 날짜와 금액`);
    });
  }
  // 예전 그대로: 붙여 쓴 분수는 오늘, 분수 꼴이 아닌 날짜(11/8·11/9)·분량 낱말이 다른 낱말의 머리일 뿐인 말·분량 낱말이 없는 말은 날짜다.
  // 독립 검토 1 — 5번: 줄 머리의 분수 꼴은 날짜 자리라 날짜다(1차 수정이 되묻던 꼴). 날짜를 따로 적었으면 그 날짜다.
  for (const [sentence, date, amount] of [
    ["피자 1/2판 9000원", TODAY, 9000], ["수박 1/4통 8000원", TODAY, 8000],
    ["11/8 조각 케이크 6000원", "2026-11-08", 6000], ["11/8 개 사료 30000원", "2026-11-08", 30000], ["11/9 잔 받침 4000원", "2026-11-09", 4000],
    ["1/8 조각케이크 6000원", "2026-01-08", 6000], ["1/8 케이크 6000원", "2026-01-08", 6000], ["1월 8일 조각 케이크 6000원", "2026-01-08", 6000], ["7/3 원피스 3만원", "2026-07-03", 30000],
    ["1/8 조각 케이크 6000원", "2026-01-08", 6000], ["1/5 개 사료 3만원", "2026-01-05", 30000], ["2/7 공기 청정기 필터 3만원", "2026-02-07", 30000], ["3/5 팩 15000원", "2026-03-05", 15000], ["1/3 컵 3000원", "2026-01-03", 3000],
    ["1월 2일 피자 1/2 판 9000원", "2026-01-02", 9000], ["오늘 케이크 1/8 조각 6000원", TODAY, 6000], ["어제 케이크 1/8 조각 6000원", YESTERDAY, 6000],
    // 독립 검토 3 — 7번: 같은 달·날을 숫자 날짜 꼴로 따로 적은 줄도 그 날짜를 쓴 것이다(3차 수정은 되물었다).
    ["2026-01-02 피자 1/2 판 9000원", "2026-01-02", 9000], ["2026.1.2 피자 1/2 판 9000원", "2026-01-02", 9000], ["1.2 피자 1/2 판 9000원", "2026-01-02", 9000], ["1/2 피자 1/2 판 9000원", "2026-01-02", 9000],
    // 독립 검토 4 — 7번: 두 자리 해를 붙인 날짜, 분수 뒤에 적은 ‘N월 M일’, 앞이 기호뿐인 줄 머리의 날짜도 그 날짜를 쓴 것이다(4차 수정까지는 되물었다).
    ["26.1.2 피자 1/2 판 9000원", "2026-01-02", 9000], ["피자 1/2 판 9000원 1월 2일", "2026-01-02", 9000], ["* 1/5 개 사료 3만원", "2026-01-05", 30000],
  ]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, sentence);
      const rows = fx.db.transactions.filter((row) => row.household_id === HOME && row.source_user_key === OWNER && row.raw_text === sentence);
      ok(/저장했어요/.test(reply.text) && rows.length === 1, `R-4 예전 그대로 ‘${sentence}’ 저장 (${reply.text.split("\n")[0]})`);
      eq(rows[0]?.transaction_date, date, `R-4 예전 그대로 ‘${sentence}’ 의 날짜`);
      eq(Number(rows[0]?.amount), amount, `R-4 예전 그대로 ‘${sentence}’ 의 금액`);
    });
  }
});

// ══ R-2 · R-3 백업 ═════════════════════════════════════════════════════════════════════════════
const BULK = "house-bulk";
const bulkRow = (n, date = "2026-08-15") => ({ id: `bulk-${String(n).padStart(4, "0")}`, household_id: BULK, user_id: "user-bin", transaction_date: date, type: "expense", amount: 1000 + n, category: "식비", memo: `기록-${String(n).padStart(4, "0")}`, payment_method: "국민카드", source: "web", raw_text: `기록-${String(n).padStart(4, "0")} ${1000 + n}원`, created_at: new Date(Date.UTC(2026, 7, 15, 0, 0, n)).toISOString() });
function seedBulk(fx, count = 1001) {
  fx.db.households.push({ id: BULK, name: "큰 가계부", invite_code: "BULK2265", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: BULK, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  for (let n = 1; n <= count; n += 1) fx.db.transactions.push(bulkRow(n));
}
const bulkMemos = (fx) => fx.db.transactions.filter((row) => row.household_id === BULK).map((row) => row.memo).sort();
const memosIn = (text) => (String(text).match(/기록-\d{4}/g) || []);
// 큰 가계부의 기록 조회를 지켜본다. onSecondPage(횟수) 는 둘째 쪽(offset=1000) 요청이 저장소에 닿기 직전에 불린다 — 그 사이 다른 구성원이 기록을 바꾼 것처럼.
function watchBulk(fx, onSecondPage = null) {
  const seen = { firstPages: 0, secondPages: 0, counted: 0, uncounted: 0 };
  const restore = intercept(async ({ url, method, init }) => {
    if (url.hostname !== "mock.supabase.co" || method !== "GET" || !url.pathname.endsWith("/transactions") || !url.search.includes(encodeURIComponent(`eq.${BULK}`))) return null;
    if (/count=exact/i.test(new Headers(init.headers || {}).get("prefer") || "")) seen.counted += 1; else seen.uncounted += 1;
    const offset = Number(url.searchParams.get("offset") || 0);
    if (offset === 0) seen.firstPages += 1;
    if (offset === 1000) { seen.secondPages += 1; if (onSecondPage) onSecondPage(seen.secondPages); }
    return null;
  });
  return { seen, restore };
}
const addNewest = (fx, n) => fx.db.transactions.push(bulkRow(n));
const removeNewest = (fx) => {
  const newest = fx.db.transactions.filter((row) => row.household_id === BULK).sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)))[0];
  fx.db.transactions = fx.db.transactions.filter((row) => row !== newest);
};
const sameList = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

await section("R-2 백업 CSV", async () => {
  for (const [label, query] of [["전체 기간", `household_id=${BULK}&month=2026-08&range=all`], ["한 달", `household_id=${BULK}&month=2026-08`]]) {
    // 둘째 쪽을 읽기 직전에 새 기록이 앞에 더해짐: 예전에는 1,000번째 기록이 두 번 담기고 새 기록은 빠졌다.
    await fixture(async (fx) => {
      seedBulk(fx);
      const watch = watchBulk(fx, (time) => { if (time === 1) addNewest(fx, 1002); });
      let csv;
      try { csv = await get(fx, `/my/backup.csv?${query}`); } finally { watch.restore(); }
      const memos = memosIn(csv.text);
      ok(csv.status === 200 && /attachment/.test(csv.disposition), `R-2 ${label}·더해짐: 파일이 내려간다 (${csv.status})`);
      eq(memos.length, 1002, `R-2 ${label}·더해짐: 줄 수 = 지금 기록 수`);
      eq(new Set(memos).size, memos.length, `R-2 ${label}·더해짐: 같은 기록이 두 번 담기지 않는다`);
      ok(sameList(memos, bulkMemos(fx)), `R-2 ${label}·더해짐: 파일의 기록 = 저장소의 기록`);
      eq(watch.seen.firstPages, 2, `R-2 ${label}·더해짐: 처음부터 한 번 다시 읽었다`);
      eq(watch.seen.uncounted, 0, `R-2 ${label}·더해짐: 모든 쪽이 전체 건수를 함께 받는다`);
    });
    // 둘째 쪽을 읽기 직전에 앞쪽 기록이 지워짐: 예전에는 마지막 기록 한 건이 빠졌다.
    await fixture(async (fx) => {
      seedBulk(fx);
      const watch = watchBulk(fx, (time) => { if (time === 1) removeNewest(fx); });
      let csv;
      try { csv = await get(fx, `/my/backup.csv?${query}`); } finally { watch.restore(); }
      const memos = memosIn(csv.text);
      eq(csv.status, 200, `R-2 ${label}·지워짐: 파일이 내려간다`);
      eq(memos.length, 1000, `R-2 ${label}·지워짐: 줄 수 = 지금 기록 수`);
      ok(sameList(memos, bulkMemos(fx)) && memos.includes("기록-0001"), `R-2 ${label}·지워짐: 가장 오래된 기록까지 빠짐없이 담긴다`);
    });
  }
  // 읽을 때마다 바뀌면 세 번 읽고 그만둔다 — 파일 대신 백업 화면에서 이유를 알린다.
  await fixture(async (fx) => {
    seedBulk(fx);
    let next = 1002;
    const watch = watchBulk(fx, () => { addNewest(fx, next); next += 1; });
    let csv;
    try { csv = await get(fx, `/my/backup.csv?household_id=${BULK}&month=2026-08&range=all`); } finally { watch.restore(); }
    eq(csv.status, 303, "R-2 계속 바뀜: 파일을 만들지 않고 돌려보낸다");
    eq(csv.location, `/my/backup?household_id=${BULK}&month=2026-08&err=backup_rows_changed`, "R-2 계속 바뀜: 백업 화면으로");
    eq(watch.seen.firstPages, 3, "R-2 계속 바뀜: 세 번까지만 읽는다");
    ok(!/기록-\d{4}/.test(csv.text), "R-2 계속 바뀜: 응답에 기록이 실리지 않는다");
    const screen = await get(fx, csv.location);
    ok(screen.status === 200 && screen.text.includes("내려받는 동안 기록이 바뀌어 백업 파일을 만들지 않았습니다. 겹치거나 빠진 파일을 내려보내지 않았습니다. 잠시 후 다시 내려받아 주세요."), "R-2 계속 바뀜: 백업 화면이 이유를 알린다");
  });
  // 서버가 한 쪽을 요청보다 짧게 주면(쪽 크기 한도) 예전에는 앞 500건만 담긴 파일이 온전한 백업처럼 내려갔다.
  await fixture(async (fx) => {
    seedBulk(fx);
    fx.db.__transaction_max_rows = 500;
    const csv = await get(fx, `/my/backup.csv?household_id=${BULK}&month=2026-08&range=all`);
    ok(csv.status === 303 && csv.location.endsWith("err=backup_rows_changed") && !/기록-\d{4}/.test(csv.text), `R-2 쪽이 짧게 옴: 일부만 담긴 파일을 만들지 않는다 (${csv.status} ${csv.location})`);
  });
  // 다시 읽는 중에 이 요청의 DB 호출 몫이 떨어지면(쪽이 많은 가계부) 몫 오류가 아니라 ‘읽는 사이 바뀌었다’ 로 끝난다 → 화면은 같은 안내를 낸다.
  // 조회 함수를 작은 몫으로 바로 불러 본다(두 쪽짜리 가계부, 몫 3 = 첫 읽기 두 번 + 다시 읽기의 첫 쪽). 첫 읽기에서 몫이 떨어지면 예전처럼 그 오류 그대로다.
  await fixture(async (fx) => {
    seedBulk(fx);
    const read = (limit) => rowsModule.fetchAdminRowsRange({ ...fx.env, __AB_DB_BUDGET: { used: 0, limit } }, { householdId: BULK, start: "2000-01-01", end: "2100-01-01", type: "all", limit: 40000, stable: true });
    const watch = watchBulk(fx, (time) => { if (time === 1) addNewest(fx, 1002); });
    let again = null, got = null;
    try { got = await read(3); } catch (err) { again = err; } finally { watch.restore(); }
    ok(!got && rowsModule.isRowsChangedDuringReadError?.(again) === true && again?.status === "budget", `R-2 다시 읽는 중에 몫이 떨어짐: ‘읽는 사이 바뀌었다’ 로 끝난다 (${again?.code || (got ? "rows " + got.length : "no error")})`);
    let first = null;
    try { await read(1); } catch (err) { first = err; }
    ok(String(first?.code || "") === "supabase_subrequest_budget_before_dispatch", `R-2 첫 읽기에서 몫이 떨어짐: 예전처럼 그 오류 그대로 (${first?.code || first?.message || "no error"})`);
    const calm = await read(3);
    eq(calm.length, 1002, "R-2 바뀌지 않으면 같은 몫 안에서 모두 읽는다");
  });
  // 바뀌지 않으면 읽는 횟수가 예전과 같다(1,001건 = 두 쪽), 한 쪽으로 끝나는 가계부는 한 번.
  await fixture(async (fx) => {
    seedBulk(fx);
    const watch = watchBulk(fx);
    let csv;
    try { csv = await get(fx, `/my/backup.csv?household_id=${BULK}&month=2026-08&range=all`); } finally { watch.restore(); }
    eq(memosIn(csv.text).length, 1001, "R-2 그대로: 1,001건이 모두 담긴다");
    eq(watch.seen.firstPages + watch.seen.secondPages, 2, "R-2 그대로: 기록 조회는 두 번(쪽마다 한 번)");
  });
  await fixture(async (fx) => {
    let calls = 0;
    const restore = intercept(async ({ url, method }) => { if (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/transactions")) calls += 1; return null; });
    let csv;
    try { csv = await get(fx, `/my/backup.csv?household_id=${HOME}&month=2026-07`); } finally { restore(); }
    const stored = fx.db.transactions.filter((row) => row.household_id === HOME && String(row.transaction_date).startsWith("2026-07")).length;
    ok(csv.status === 200 && stored > 0 && csv.text.trim().split("\n").length === stored + 1, `R-2 한 쪽짜리 가계부: 머리줄 + ${stored}줄 (${csv.text.trim().split("\n").length}줄)`);
    eq(calls, 1, "R-2 한 쪽짜리 가계부: 기록 조회 한 번");
  });
  // 쪽을 넘기는 사이 기록이 지워져 다음 쪽의 시작이 전체 건수를 넘으면 실제 저장소(PostgREST)는 416 으로 답한다(픽스처는 빈 쪽을 준다).
  // 그 답을 한 번 흉내 내, 오류 화면이 아니라 처음부터 다시 읽어 온전한 파일을 주는지 본다.
  await fixture(async (fx) => {
    seedBulk(fx);
    let secondPages = 0;
    const restore = intercept(async ({ url, method }) => {
      if (url.hostname !== "mock.supabase.co" || method !== "GET" || !url.pathname.endsWith("/transactions") || !url.search.includes(encodeURIComponent(`eq.${BULK}`))) return null;
      if (Number(url.searchParams.get("offset") || 0) !== 1000) return null;
      secondPages += 1;
      return secondPages === 1 ? new Response(JSON.stringify({ code: "PGRST103", message: "Requested range not satisfiable" }), { status: 416, headers: { "content-type": "application/json" } }) : null;
    });
    let csv;
    try { csv = await get(fx, `/my/backup.csv?household_id=${BULK}&month=2026-08&range=all`); } finally { restore(); }
    const memos = memosIn(csv.text);
    ok(csv.status === 200 && memos.length === 1001 && new Set(memos).size === 1001, `R-2 둘째 쪽이 416: 다시 읽어 1,001건이 한 번씩 담긴다 (${csv.status}, ${memos.length}줄)`);
    eq(secondPages, 2, "R-2 둘째 쪽이 416: 한 번 다시 읽었다");
  });
  // 서버가 전체 건수를 주지 않으면 견줄 것이 없어 예전처럼 받는다(파일이 막히지 않는다).
  await fixture(async (fx) => {
    seedBulk(fx);
    fx.db.__omit_count_header = true;
    const csv = await get(fx, `/my/backup.csv?household_id=${BULK}&month=2026-08&range=all`);
    ok(csv.status === 200 && memosIn(csv.text).length === 1001, `R-2 건수를 주지 않는 서버: 예전처럼 내려간다 (${csv.status}, ${memosIn(csv.text).length}줄)`);
  });
});

let adminSeq = 0;
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  adminSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${(adminSeq % 200) + 20}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
const parse = (text) => { try { return JSON.parse(text); } catch (_) { return null; } };

await section("R-3 관리자 JSON 백업", async () => {
  // 없는 가계부(지워진 가계부의 옛 링크): 예전에는 가계부 0개·거래 0건인 파일이 200 으로 내려갔다.
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    ok(!!cookie, "R-3 준비: 관리자 로그인");
    for (const query of ["month=2026-07&household_id=house-ghost", "month=2026-07&household_id=house-ghost&range=all", "month=2026-07&household_id=house-ghost&range=all&year=2026"]) {
      const res = await get(fx, `/admin/export/json?${query}`, { cookie });
      const body = parse(res.text);
      ok(res.status === 404 && body?.ok === false && body?.error === "backup_household_not_found" && !res.disposition, `R-3 없는 가계부(${query}): 파일이 아니라 404 (${res.status} ${body?.error || ""})`);
      ok(String(body?.message || "").includes("백업할 가계부를 찾지 못해 파일을 만들지 않았습니다."), `R-3 없는 가계부(${query}): 이유를 적는다`);
    }
    // 거래가 0건인 진짜 가계부는 정상 파일이다(가계부 1개·거래 0건) — 없는 가계부와 구분된다.
    fx.db.households.push({ id: "house-empty", name: "빈 가계부", invite_code: "EMPTY265", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: "house-empty", user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
    for (const query of ["month=2026-07&household_id=house-empty", "month=2026-07&household_id=house-empty&range=all"]) {
      const res = await get(fx, `/admin/export/json?${query}`, { cookie });
      const body = parse(res.text);
      ok(res.status === 200 && /attachment/.test(res.disposition) && body?.counts?.households === 1 && body?.counts?.transactions === 0 && body?.counts?.members === 1, `R-3 거래 0건인 가계부(${query}): 가계부 1·거래 0·참여자 1 인 파일 (${res.status} ${JSON.stringify(body?.counts || {})})`);
      eq(body?.households?.[0]?.id, "house-empty", `R-3 거래 0건인 가계부(${query}): 그 가계부가 담긴다`);
      ok(!("invite_code" in (body?.households?.[0] || { invite_code: 1 })), `R-3 거래 0건인 가계부(${query}): 초대코드는 예전처럼 담지 않는다`);
    }
    // 고른 가계부 하나의 백업은 예전과 같은 내용이다(가계부·참여자·거래).
    const home = parse((await get(fx, `/admin/export/json?month=2026-07&household_id=${HOME}`, { cookie })).text);
    const stored = fx.db.transactions.filter((row) => row.household_id === HOME && String(row.transaction_date).startsWith("2026-07")).length;
    ok(home?.counts?.households === 1 && home?.counts?.transactions === stored && stored > 0 && home?.household_members?.[HOME]?.length > 0, `R-3 고른 가계부: 가계부 1·거래 ${stored}·참여자 있음 (${JSON.stringify(home?.counts || {})})`);
  });
  // 가계부 목록이 서버 한도로 잘려 고른 가계부가 목록에 없을 때: 예전에는 거래만 담기고 참여자·예산·설정이 빠진 파일이 나갔다.
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    seedBulk(fx, 3);
    const restore = intercept(async ({ url, method }) => {
      if (url.hostname !== "mock.supabase.co" || method !== "GET" || !url.pathname.endsWith("/households") || url.searchParams.has("id")) return null;
      return new Response(JSON.stringify(fx.db.households.slice(0, 1)), { headers: { "content-type": "application/json" } });
    });
    let res;
    try { res = await get(fx, `/admin/export/json?month=2026-08&household_id=${BULK}&range=all`, { cookie }); } finally { restore(); }
    const body = parse(res.text);
    ok(res.status === 200 && body?.counts?.households === 1 && body?.counts?.transactions === 3 && body?.household_members?.[BULK]?.length === 1 && Array.isArray(body?.budgets?.[BULK]), `R-3 목록 범위 밖의 가계부: 가계부·참여자·설정까지 담긴다 (${res.status} ${JSON.stringify(body?.counts || {})})`);
  });
  // 한 달 백업(range 없음)도 같은 읽기를 쓴다.
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    seedBulk(fx);
    const watch = watchBulk(fx, (time) => { if (time === 1) addNewest(fx, 1002); });
    let res;
    try { res = await get(fx, `/admin/export/json?month=2026-08&household_id=${BULK}`, { cookie }); } finally { watch.restore(); }
    const ids = (parse(res.text)?.transactions || []).map((row) => row.id);
    ok(res.status === 200 && ids.length === 1002 && new Set(ids).size === 1002, `R-3 한 달 백업을 읽는 사이 더해짐: 1,002건이 한 번씩 담긴다 (${res.status}, ${ids.length}건, 서로 다른 ${new Set(ids).size}건)`);
  });
  // 거래를 쪽으로 넘겨 읽는 사이 바뀜: 다시 읽어 맞추고, 계속 바뀌면 409 로 파일을 만들지 않는다.
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    seedBulk(fx);
    const watch = watchBulk(fx, (time) => { if (time === 1) addNewest(fx, 1002); });
    let res;
    try { res = await get(fx, `/admin/export/json?month=2026-08&household_id=${BULK}&range=all`, { cookie }); } finally { watch.restore(); }
    const ids = (parse(res.text)?.transactions || []).map((row) => row.id);
    ok(res.status === 200 && ids.length === 1002 && new Set(ids).size === 1002, `R-3 읽는 사이 더해짐: 1,002건이 한 번씩 담긴다 (${res.status}, ${ids.length}건, 서로 다른 ${new Set(ids).size}건)`);
  });
  await fixture(async (fx) => {
    const cookie = await adminCookie(fx);
    seedBulk(fx);
    let next = 1002;
    const watch = watchBulk(fx, () => { addNewest(fx, next); next += 1; });
    let res;
    try { res = await get(fx, `/admin/export/json?month=2026-08&household_id=${BULK}&range=all`, { cookie }); } finally { watch.restore(); }
    const body = parse(res.text);
    ok(res.status === 409 && body?.error === "backup_rows_changed" && !res.disposition && !body?.transactions, `R-3 계속 바뀜: 409, 파일 없음 (${res.status} ${body?.error || ""})`);
  });
});

// ══ R-5 스마트 도구의 예산 잔여 ══════════════════════════════════════════════════════════════════
await section("R-5 스마트 도구의 예산 잔여", async () => {
  const PATH = `/smart-tools?household_id=${HOME}&month=2026-07`;
  const metric = (html) => (String(html).match(/<span>예산 잔여<\/span>(.*?)<\/div>/) || [])[1] || "";
  const setBudget = (fx, amount) => {
    fx.db.accountbook_budgets = (fx.db.accountbook_budgets || []).filter((row) => !(row.household_id === HOME && row.month === "2026-07"));
    if (amount != null) fx.db.accountbook_budgets.push({ id: "budget-v131", household_id: HOME, month: "2026-07", category: "__total", amount, created_at: "2026-07-01T00:00:00.000Z" });
  };
  await fixture(async (fx) => {
    setBudget(fx, null);
    const none = await get(fx, PATH);
    eq(metric(none.text), "<b>설정 전</b>", `R-5 정한 예산이 없는 달 (${none.status})`);
    setBudget(fx, 900000000);
    const some = await get(fx, PATH);
    ok(/^<b>[1-9][\d,]*원<\/b>$/.test(metric(some.text)), `R-5 예산이 남은 달: 남은 금액 (${metric(some.text)})`);
    setBudget(fx, 1);
    const used = await get(fx, PATH);
    eq(metric(used.text), "<b>0원</b>", "R-5 정한 예산을 다 쓴 달");
    // 예산 읽기만 실패: 예전에는 예산이 있어도 ‘0원’ 이었다.
    setBudget(fx, 900000000);
    const restore = intercept(async ({ url, method }) => (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/accountbook_budgets") ? failure(503, "simulated budget read failure") : null));
    let failed;
    try { failed = await get(fx, PATH); } finally { restore(); }
    eq(failed.status, 200, "R-5 예산을 읽지 못한 달: 화면은 열린다");
    eq(metric(failed.text), "<b>확인 불가</b><small>예산을 불러오지 못했어요</small>", "R-5 예산을 읽지 못한 달");
    ok(failed.text.includes("<span>월말 예상 지출</span>"), "R-5 예산을 읽지 못한 달: 다른 칸은 그대로 그린다");
  });
});

// ══ R-6 자동 리포트 다시 만들기 ══════════════════════════════════════════════════════════════════
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const CURSOR_KEY = "cron_report_cursor_v22930";
const readJson = (value) => (value == null || value === "" ? null : typeof value === "string" ? JSON.parse(value) : value);
const monthlyKey = (hid, month) => `free_report_snapshot:${hid}:monthly:${month}`;
const snapshotOf = (fx, hid, month = "2026-09") => readJson(settingValue(fx, monthlyKey(hid, month)));
const cursorScopes = (fx) => readJson(settingValue(fx, CURSOR_KEY))?.scopes || [];
function seedReportHousehold(fx, id) {
  fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  putSetting(fx, `free_report_preference:${id}`, JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: true, weekly: false, monthly: true }));
  [["2026-09-03", 12000], ["2026-09-17", 8000]].forEach(([date, amount], index) => fx.db.transactions.push({ id: `${id}-${date}-${index}`, household_id: id, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: `장보기 ${amount}원 ${date}`, created_at: `${date}T03:00:00.000Z` }));
}
// 자동 리포트 한 번. failFor 가계부의 기록 조회는 503 으로 실패시킨다. 가계부별 기록 조회 횟수를 함께 돌려준다.
async function runReports(fx, ymd, failFor = "") {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  const reads = Object.create(null);
  const events = globalThis.__AB_OPS_EVENTS || [];
  const mark = events.length;
  const restore = intercept(async ({ url, method }) => {
    if (url.hostname !== "mock.supabase.co" || method !== "GET" || !url.pathname.endsWith("/transactions")) return null;
    const hid = (url.searchParams.get("household_id") || "").replace(/^eq\./, "");
    reads[hid] = (reads[hid] || 0) + 1;
    return failFor && hid === failFor ? failure(503, "simulated report read failure") : null;
  });
  try { return { result: await runAutomaticReports(fx.env, { today: ymd }), reads, events: (globalThis.__AB_OPS_EVENTS || []).slice(mark) }; }
  finally { restore(); }
}
const finalAt = (snap, ymd) => Date.parse(String(snap?.generated_at || "")) >= Date.parse(`${ymd}T00:00:00+09:00`);
// 말일 아침의 미리 보기 뒤에 들어온 그날 기록(확정본에만 담긴다).
const addLate = (fx, id) => fx.db.transactions.push({ id: `${id}-late`, household_id: id, user_id: "user-bin", transaction_date: "2026-09-30", type: "expense", amount: 5000, category: "식비", memo: "야식", payment_method: "국민카드", source: "web", raw_text: "야식 5000원 2026-09-30", created_at: "2026-09-30T12:00:00.000Z" });
const prefKey = (id) => `free_report_preference:${id}`;

await section("R-6 자동 리포트", async () => {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  try {
    // 한 번 실패한 가계부: 다음 실행이 그 가계부의 확정본만 다시 만든다. 예전에는 미리 보기만 남았다.
    await fixture(async (fx) => {
      seedReportHousehold(fx, "rep-a");
      seedReportHousehold(fx, "rep-b");
      const day1 = await runReports(fx, "2026-09-30");
      ok(snapshotOf(fx, "rep-a")?.expense === 20000 && snapshotOf(fx, "rep-b")?.expense === 20000, `R-6 준비: 말일에 두 가계부의 미리 보기 (${JSON.stringify(day1.result)})`);
      addLate(fx, "rep-a");
      addLate(fx, "rep-b");
      const day2 = await runReports(fx, "2026-10-01", "rep-b");
      eq(day2.result.failed, 1, "R-6 다음 날: 한 가계부의 확정 생성 실패");
      eq(day2.result.retry_queued, 1, "R-6 다음 날: 다시 만들 범위를 하나 넣는다");
      ok(finalAt(snapshotOf(fx, "rep-a"), "2026-10-01") && snapshotOf(fx, "rep-a")?.expense === 25000, "R-6 다음 날: 실패하지 않은 가계부는 확정본(늦은 기록 포함)");
      ok(!finalAt(snapshotOf(fx, "rep-b"), "2026-10-01") && snapshotOf(fx, "rep-b")?.expense === 20000, "R-6 다음 날: 실패한 가계부는 아직 미리 보기(늦은 기록 없음)");
      const queued = cursorScopes(fx).filter((scope) => scope.date === "2026-09-30");
      ok(queued.length === 1 && queued[0].final === true && queued[0].tries === 1 && queued[0].after === prefKey("rep-a") && queued[0].upto === prefKey("rep-b") && queued[0].monthly === true, `R-6 다음 날: 커서에 실패한 가계부만 도는 확정 범위(tries 1)가 남는다 (${JSON.stringify(queued)})`);
      ok(day2.result.partial === true && day2.result.pending_scopes >= 1 && day2.result.ok === false, `R-6 다음 날: 남은 범위로 보인다 (${JSON.stringify(day2.result)})`);
      const day3 = await runReports(fx, "2026-10-02");
      ok(finalAt(snapshotOf(fx, "rep-b"), "2026-10-02") && snapshotOf(fx, "rep-b")?.expense === 25000, `R-6 그다음 날: 실패했던 가계부의 확정본이 생긴다 (${snapshotOf(fx, "rep-b")?.generated_at}, ${snapshotOf(fx, "rep-b")?.expense})`);
      eq(day3.reads["rep-a"] || 0, 0, "R-6 그다음 날: 이미 확정된 가계부의 기록은 다시 읽지 않는다");
      eq(day3.reads["rep-b"], 1, "R-6 그다음 날: 실패했던 가계부만 한 번 읽는다");
      ok(day3.result.failed === 0 && day3.result.generated === 1 && day3.result.retry_queued === undefined, `R-6 그다음 날: 한 건 생성, 실패 없음 (${JSON.stringify(day3.result)})`);
      eq(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").length, 0, "R-6 그다음 날: 그 날짜의 범위가 남지 않는다");
    });
    // 계속 실패하는 가계부: 세 번까지 다시 넣고 그만둔다(그만둔 것을 결과와 운영 이벤트에 남긴다).
    await fixture(async (fx) => {
      seedReportHousehold(fx, "rep-a");
      seedReportHousehold(fx, "rep-b");
      await runReports(fx, "2026-09-30");
      addLate(fx, "rep-a");
      addLate(fx, "rep-b");
      const tries = [];
      for (const ymd of ["2026-10-01", "2026-10-02", "2026-10-03"]) {
        const run = await runReports(fx, ymd, "rep-a");
        tries.push(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").map((scope) => scope.tries).join(","));
        ok(run.result.failed === 1 && run.result.retry_queued === 1 && run.result.gave_up === undefined, `R-6 계속 실패 ${ymd}: 다시 넣는다 (${JSON.stringify(run.result)})`);
      }
      eq(tries.join(" / "), "1 / 2 / 3", "R-6 계속 실패: 다시 넣은 횟수가 실행마다 하나씩 는다");
      const last = await runReports(fx, "2026-10-04", "rep-a");
      ok(last.result.failed === 1 && last.result.gave_up === 1 && last.result.retry_queued === undefined, `R-6 계속 실패 네 번째: 그만둔다 (${JSON.stringify(last.result)})`);
      ok(last.events.some((event) => event.kind === "free_report_final_gave_up" && String(event.detail || "") === "2026-09-30:rep-a"), `R-6 계속 실패 네 번째: 운영 이벤트에 날짜와 가계부를 남긴다 (${JSON.stringify(last.events.map((event) => [event.kind, event.detail]))})`);
      eq(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").length, 0, "R-6 계속 실패 네 번째: 그 날짜의 범위를 더 넣지 않는다");
      const after = await runReports(fx, "2026-10-05");
      ok(after.result.failed === 0 && (after.reads["rep-a"] || 0) === 0, `R-6 그만둔 뒤: 그 기간을 다시 읽지 않는다 (${JSON.stringify(after.result)})`);
      ok(finalAt(snapshotOf(fx, "rep-b"), "2026-10-01") && snapshotOf(fx, "rep-b")?.expense === 25000, "R-6 계속 실패: 다른 가계부의 확정본은 첫날 만들어졌다");
      ok(!finalAt(snapshotOf(fx, "rep-a"), "2026-10-01") && snapshotOf(fx, "rep-a")?.expense === 20000, "R-6 계속 실패: 실패한 가계부는 미리 보기 그대로다(없는 값을 지어내지 않는다)");
    });
    // 한 범위에서 여섯 가계부가 실패하면(저장소가 통째로 답하지 못한 날) 커서가 길어지지 않게 그 날짜 전체를 한 범위로 다시 넣는다.
    await fixture(async (fx) => {
      const ids = ["rep-1", "rep-2", "rep-3", "rep-4", "rep-5", "rep-6"];
      for (const id of ids) seedReportHousehold(fx, id);
      await runReports(fx, "2026-09-30");
      for (const id of ids) addLate(fx, id);
      globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-01");
      const restore = intercept(async ({ url, method }) => (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/transactions") ? failure(503, "simulated outage") : null));
      let outage;
      try { outage = await runAutomaticReports(fx.env, { today: "2026-10-01" }); } finally { restore(); }
      const queued = cursorScopes(fx).filter((scope) => scope.date === "2026-09-30");
      ok(outage.failed === 6 && outage.retry_queued === 1 && queued.length === 1 && queued[0].after === "" && !("upto" in queued[0]) && queued[0].tries === 1, `R-6 여섯 곳 실패: 날짜 전체를 한 범위로 다시 넣는다 (${JSON.stringify(outage)} / ${JSON.stringify(queued)})`);
      const next = await runReports(fx, "2026-10-02");
      ok(next.result.failed === 0 && ids.every((id) => finalAt(snapshotOf(fx, id), "2026-10-02") && snapshotOf(fx, id)?.expense === 25000), `R-6 여섯 곳 실패: 다음 실행이 모두 다시 만든다 (${JSON.stringify(next.result)})`);
      eq(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").length, 0, "R-6 여섯 곳 실패: 다 만든 뒤 범위가 남지 않는다");
    });
    // 범위가 중간에 던져도(둘째 쪽의 설정 읽기 실패) 그때까지 실패한 가계부는 다시 넣는다. 멈춘 범위는 그대로 남아 다음 실행이 잇는다.
    // (설정 스물한 줄 = 두 쪽. 켜 둔 가계부는 첫 줄과 마지막 줄, 나머지 열아홉은 꺼 둔 설정이라 읽기만 하고 넘어간다.)
    await fixture(async (fx) => {
      const keys = Array.from({ length: 21 }, (_, i) => `rep-${String(i + 1).padStart(2, "0")}`);
      for (const id of keys) {
        if (id === "rep-01" || id === "rep-21") seedReportHousehold(fx, id);
        else putSetting(fx, prefKey(id), JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: false, weekly: false, monthly: true }));
      }
      await runReports(fx, "2026-09-30");
      addLate(fx, "rep-01");
      addLate(fx, "rep-21");
      globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-01");
      const restore = intercept(async ({ url, method }) => {
        if (url.hostname !== "mock.supabase.co" || method !== "GET") return null;
        if (url.pathname.endsWith("/transactions") && (url.searchParams.get("household_id") || "") === "eq.rep-01") return failure(503, "simulated report read failure");
        if (url.pathname.endsWith("/accountbook_settings") && url.searchParams.getAll("key").some((value) => value.startsWith("gt.free_report_preference:"))) return failure(503, "simulated settings read failure");
        return null;
      });
      let thrown = null;
      try { await runAutomaticReports(fx.env, { today: "2026-10-01" }); } catch (err) { thrown = err; } finally { restore(); }
      const scopes = cursorScopes(fx).filter((scope) => scope.date === "2026-09-30");
      ok(!!thrown, "R-6 범위가 던짐: 실행은 오류로 끝난다");
      ok(scopes.some((scope) => scope.tries === 1 && scope.after === "" && scope.upto === prefKey("rep-01")), `R-6 범위가 던짐: 그때까지 실패한 가계부는 다시 넣었다 (${JSON.stringify(scopes)})`);
      ok(scopes.some((scope) => !scope.tries && scope.after === prefKey("rep-20")), "R-6 범위가 던짐: 멈춘 범위는 스무 번째 줄 뒤에서 잇는다");
      const next = await runReports(fx, "2026-10-02");
      ok(next.result.failed === 0 && ["rep-01", "rep-21"].every((id) => finalAt(snapshotOf(fx, id), "2026-10-02") && snapshotOf(fx, id)?.expense === 25000), `R-6 범위가 던짐: 다음 실행이 둘 다 만든다 (${JSON.stringify(next.result)})`);
      eq(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").length, 0, "R-6 범위가 던짐: 다 만든 뒤 범위가 남지 않는다");
    });
    // 기록이 한도(9,001건)를 넘는 가계부의 실패는 다시 해도 같으므로 다시 넣지 않는다(저장소가 그 가계부의 기록을 쪽마다 가득 주는 것으로 흉내 낸다).
    await fixture(async (fx) => {
      seedReportHousehold(fx, "rep-a");
      seedReportHousehold(fx, "rep-big");
      await runReports(fx, "2026-09-30");
      addLate(fx, "rep-a");
      globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-01");
      const mark = (globalThis.__AB_OPS_EVENTS || []).length;
      const restore = intercept(async ({ url, method }) => {
        if (url.hostname !== "mock.supabase.co" || method !== "GET" || !url.pathname.endsWith("/transactions") || (url.searchParams.get("household_id") || "") !== "eq.rep-big") return null;
        const offset = Number(url.searchParams.get("offset") || 0), limit = Number(url.searchParams.get("limit") || 1000);
        return new Response(JSON.stringify(Array.from({ length: limit }, (_, i) => ({ id: `big-${offset + i}`, household_id: "rep-big", user_id: "user-bin", type: "expense", amount: 1000, category: "식비", memo: "장보기", payment_method: "", transaction_date: "2026-09-10", source: "web", raw_text: "", created_at: "2026-09-10T00:00:00.000Z" }))), { headers: { "content-type": "application/json" } });
      });
      let big;
      try { big = await runAutomaticReports(fx.env, { today: "2026-10-01" }); } finally { restore(); }
      const events = (globalThis.__AB_OPS_EVENTS || []).slice(mark);
      ok(big.failed === 1 && big.retry_queued === undefined && big.generated === 1 && events.some((event) => event.kind === "free_report_row_limit"), `R-6 한도를 넘는 가계부: 실패로 세되 다시 넣지 않는다 (${JSON.stringify(big)})`);
      eq(cursorScopes(fx).filter((scope) => scope.date === "2026-09-30").length, 0, "R-6 한도를 넘는 가계부: 범위가 남지 않는다");
    });
    // 같은 날짜의 범위 둘이 한 실행에서 각각 여섯 곳씩 실패해도 날짜 전체 범위는 하나만 넣는다(겹쳐 쌓이지 않는다).
    await fixture(async (fx) => {
      const ids = Array.from({ length: 12 }, (_, i) => `rep-${String(i + 1).padStart(2, "0")}`);
      for (const id of ids) seedReportHousehold(fx, id);
      putSetting(fx, CURSOR_KEY, JSON.stringify({ scopes: [
        { date: "2026-09-30", after: "", force: false, weekly: false, monthly: true, final: true, upto: prefKey("rep-06") },
        { date: "2026-09-30", after: prefKey("rep-06"), force: false, weekly: false, monthly: true, final: true },
      ], pushed: "2026-09-30" }));
      globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-01");
      const restore = intercept(async ({ url, method }) => (url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/transactions") ? failure(503, "simulated outage") : null));
      let out;
      try { out = await runAutomaticReports(fx.env, { today: "2026-10-01" }); } finally { restore(); }
      const queued = cursorScopes(fx).filter((scope) => scope.date === "2026-09-30");
      ok(out.failed === 12 && out.retry_queued === 1 && queued.length === 1 && queued[0].after === "" && !("upto" in queued[0]) && queued[0].tries === 1, `R-6 두 범위가 각각 여섯 곳 실패: 날짜 전체 범위 하나 (${JSON.stringify(out)} / ${JSON.stringify(queued)})`);
    });
    // 예약 실행 기록(cron_run_log)에 다시 넣은 범위가 남고 운영 화면이 보여 준다(운영 이벤트는 인스턴스 메모리라 다음 날 보이지 않는다).
    // 실패가 없는 실행의 기록에는 새 칸이 없다(예전 모양).
    await fixture(async (fx) => {
      seedReportHousehold(fx, "rep-a");
      seedReportHousehold(fx, "rep-b");
      await runReports(fx, "2026-09-30");
      addLate(fx, "rep-a");
      addLate(fx, "rep-b");
      const scheduled = async (ymd, failFor = "") => {
        globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
        const restore = intercept(async ({ url, method }) => (failFor && url.hostname === "mock.supabase.co" && method === "GET" && url.pathname.endsWith("/transactions") && (url.searchParams.get("household_id") || "") === `eq.${failFor}` ? failure(503, "simulated report read failure") : null));
        try {
          const pending = [];
          await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd) }, fx.env, { waitUntil(job) { pending.push(job); } });
          await Promise.allSettled(pending);
        } finally { restore(); }
        return (readJson(settingValue(fx, "cron_run_log_v22978")) || [])[0] || null;
      };
      const failedRun = await scheduled("2026-10-01", "rep-b");
      ok(failedRun?.reports?.failed === 1 && failedRun?.reports?.retry_queued === 1 && !("gave_up" in (failedRun?.reports || {})), `R-6 실행 기록: 다시 넣은 범위가 남는다 (${JSON.stringify(failedRun?.reports || null)})`);
      const board = await get(fx, "/ops-dashboard", { cookie: await adminCookie(fx) });
      ok(board.status === 200 && board.text.includes("실패 1 · 다시 넣음 1"), `R-6 운영 화면: 예약 실행 표에 ‘다시 넣음 1’ (${board.status})`);
      const cleanRun = await scheduled("2026-10-02");
      ok(cleanRun?.reports?.generated === 1 && cleanRun.reports.failed === 0 && !("retry_queued" in cleanRun.reports) && !("gave_up" in cleanRun.reports), `R-6 실행 기록: 실패가 없는 실행은 예전 모양 (${JSON.stringify(cleanRun?.reports || null)})`);
    });
    // 실패가 없으면 예전과 같다(다시 넣는 범위도, 결과의 새 칸도 없다).
    await fixture(async (fx) => {
      seedReportHousehold(fx, "rep-a");
      await runReports(fx, "2026-09-30");
      addLate(fx, "rep-a");
      const day2 = await runReports(fx, "2026-10-01");
      ok(day2.result.ok === true && day2.result.failed === 0 && !("retry_queued" in day2.result) && !("gave_up" in day2.result), `R-6 실패 없음: 결과가 예전 모양 (${JSON.stringify(day2.result)})`);
      ok(!cursorScopes(fx).some((scope) => "tries" in scope), "R-6 실패 없음: 다시 넣는 범위가 없다");
      ok(finalAt(snapshotOf(fx, "rep-a"), "2026-10-01"), "R-6 실패 없음: 확정본 생성");
    });
  } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
});

// ══ R-7 즐겨찾기 ═══════════════════════════════════════════════════════════════════════════════
await section("R-7 즐겨찾기의 긴 표식", async () => {
  // 화면(client/nav-search-notif-mains.js favKeyOf)이 만드는 표식.
  const keyOf = (r) => `${r.transaction_date || ""}|${r.type || "expense"}|${r.amount || 0}|${String(r.memo || r.category || "").trim()}`;
  const tx = (memo, extra = {}) => ({ type: "expense", amount: 12000, memo, category: "외식", payment_method: "국민카드", transaction_date: "2026-07-03", month: "2026-07", ...extra });
  const LONG_A = tx("회사 근처 새로 생긴 베트남 쌀국수 집에서 팀 점심 회식하고 디저트 카페까지 들른 날 A");
  const LONG_B = tx("회사 근처 새로 생긴 베트남 쌀국수 집에서 팀 점심 회식하고 디저트 카페까지 들른 날 B");
  const SHORT = tx("점심");
  const FAV_KEY = `favorites:v5:${HOME}:user-bin`;
  const add = (fx, row) => api(fx, "/u/api/favorites", "POST", { household: HOME, id: keyOf(row), tx: { id: keyOf(row), ...row } });
  const remove = (fx, row) => api(fx, "/u/api/favorites", "POST", { household: HOME, id: keyOf(row), remove: true });
  const list = (fx) => api(fx, `/u/api/favorites?household=${HOME}`);
  ok(keyOf(LONG_A).length > 64 && keyOf(LONG_A).slice(0, 64) === keyOf(LONG_B).slice(0, 64) && keyOf(LONG_A) !== keyOf(LONG_B), "R-7 준비: 두 표식은 64자까지 같고 그 뒤가 다르다");
  await fixture(async (fx) => {
    const added = await add(fx, LONG_A);
    ok(added.status === 200 && added.data?.ids?.includes(keyOf(LONG_A)), `R-7 긴 메모: 저장된 표식이 화면의 표식과 같다 (${added.status} ${JSON.stringify(added.data?.ids || [])})`);
    ok((await list(fx)).data?.ids?.includes(keyOf(LONG_A)), "R-7 긴 메모: 다시 읽어도 같은 표식(별이 켜진 것으로 보인다)");
    const both = await add(fx, LONG_B);
    eq(both.data?.count, 2, "R-7 64자까지 같은 두 기록: 따로 저장된다");
    const removed = await remove(fx, LONG_A);
    ok(removed.status === 200 && removed.data?.count === 1 && removed.data?.ids?.[0] === keyOf(LONG_B), `R-7 긴 메모: 지우면 그 기록만 지워진다 (${JSON.stringify(removed.data?.ids || [])})`);
    const short = await add(fx, SHORT);
    ok(short.data?.ids?.includes(keyOf(SHORT)) && (await remove(fx, SHORT)).data?.count === 1, "R-7 짧은 메모는 예전 그대로 켜지고 지워진다");
  });
  // 예전에 64자에서 잘려 저장된 표식: 읽을 때 화면의 표식으로 바꿔 주고, 그 표식으로 지워진다.
  await fixture(async (fx) => {
    putSetting(fx, FAV_KEY, JSON.stringify([{ id: keyOf(LONG_A).slice(0, 64), ...LONG_A }]));
    const read = await list(fx);
    eq(read.data?.ids?.[0], keyOf(LONG_A), "R-7 옛 표식: 읽을 때 화면의 표식으로 바뀐다");
    const removed = await remove(fx, LONG_A);
    eq(removed.data?.count, 0, "R-7 옛 표식: 지워진다");
    eq(JSON.parse(settingValue(fx, FAV_KEY)).length, 0, "R-7 옛 표식: 저장소에서도 지워졌다");
  });
  // 독립 검토 1 — 7번(a): 표식이 정확히 64자인 온전한 기록은 옛 표식이 아니다. 그 표식으로 시작하는 더 긴 표식의 다른 기록을 켜고 꺼도 그대로 남는다
  // (예전에는 둘이 64자로 잘려 하나였다).
  await fixture(async (fx) => {
    const base = "가".repeat(39);
    const EXACT = tx(base), SIBLING = tx(`${base} 둘째`);
    ok(keyOf(EXACT).length === 64 && keyOf(SIBLING).startsWith(keyOf(EXACT)), "R-7 준비: 정확히 64자인 표식과 그 표식으로 시작하는 더 긴 표식");
    await add(fx, EXACT);
    const both = await add(fx, SIBLING);
    ok(both.data?.count === 2 && both.data?.ids?.includes(keyOf(EXACT)) && both.data?.ids?.includes(keyOf(SIBLING)), `R-7 정확히 64자인 표식: 더 긴 표식의 기록을 켜도 남는다 (${both.data?.count})`);
    const removed = await remove(fx, SIBLING);
    ok(removed.data?.count === 1 && removed.data?.ids?.[0] === keyOf(EXACT), `R-7 정확히 64자인 표식: 더 긴 표식의 기록을 꺼도 남는다 (${JSON.stringify(removed.data?.ids || [])})`);
  });
  // 독립 검토 1 — 7번(b): 메모가 200자를 넘어도(메모 없이 원문이 긴 기록) 스냅숏으로 다시 만든 표식이 저장된 표식과 같다 — 즐겨찾기 목록에서도 별이 켜져 보인다.
  await fixture(async (fx) => {
    const LONG = tx(`${"긴 원문 ".repeat(60)}끝`.slice(0, 300));
    const added = await add(fx, LONG);
    const stored = added.data?.favorites?.[0] || {};
    ok(added.status === 200 && stored.id === keyOf(LONG) && keyOf(stored) === stored.id, `R-7 300자 메모: 스냅숏으로 만든 표식 = 저장된 표식 (${String(stored.memo || "").length}자)`);
    eq((await remove(fx, LONG)).data?.count, 0, "R-7 300자 메모: 지워진다");
  });
  // 스냅숏으로 다시 만들 수 없는 옛 표식(메모가 비어 저장된 것)도 같은 기록의 표식으로 지우거나 덮을 수 있다. 다른 기록(64자 앞머리가 다른 것)은 건드리지 않는다.
  await fixture(async (fx) => {
    const legacy = { id: keyOf(LONG_A).slice(0, 64), ...LONG_A, memo: "", category: "" };
    const other = { id: keyOf(SHORT), ...SHORT };
    putSetting(fx, FAV_KEY, JSON.stringify([legacy, other]));
    eq((await list(fx)).data?.ids?.[0], keyOf(LONG_A).slice(0, 64), "R-7 다시 만들 수 없는 옛 표식: 그대로 읽힌다");
    const readded = await add(fx, LONG_A);
    ok(readded.data?.count === 2 && readded.data?.ids?.[0] === keyOf(LONG_A) && readded.data?.ids?.[1] === keyOf(SHORT), `R-7 다시 만들 수 없는 옛 표식: 새로 켜면 그 자리를 바꾼다 (${JSON.stringify(readded.data?.ids || [])})`);
    putSetting(fx, FAV_KEY, JSON.stringify([legacy, other]));
    const removed = await remove(fx, LONG_A);
    ok(removed.data?.count === 1 && removed.data?.ids?.[0] === keyOf(SHORT), `R-7 다시 만들 수 없는 옛 표식: 같은 기록의 표식으로 지워진다 (${JSON.stringify(removed.data?.ids || [])})`);
  });
  // 독립 검토 2 — 8번: 메모가 옛 상한(200자)에서 잘린 옛 항목은 화면의 표식을 다시 만들 수 없다. 읽을 때 그대로 두고(2차 수정은 잘린 메모로 만든 표식으로 바꿔
  // 별이 꺼진 채였고, 별을 다시 누르면 같은 기록이 두 항목이 됐다), 별을 다시 누르면 새 표식의 한 항목으로 바뀌어 켜지고 지워진다.
  await fixture(async (fx) => {
    const FULL = tx(`${"긴 원문 ".repeat(60)}끝`.slice(0, 300));
    const cut = { id: keyOf(FULL).slice(0, 64), ...FULL, memo: FULL.memo.slice(0, 200) };
    ok(FULL.memo.length === 300 && cut.memo.length === 200 && keyOf(cut) !== keyOf(FULL), "R-7 준비: 메모가 200자에서 잘린 옛 항목");
    putSetting(fx, FAV_KEY, JSON.stringify([cut]));
    eq((await list(fx)).data?.ids?.[0], keyOf(FULL).slice(0, 64), "R-7 메모가 잘린 옛 항목: 읽을 때 표식을 바꾸지 않는다");
    const starred = await add(fx, FULL);
    ok(starred.data?.count === 1 && starred.data?.ids?.[0] === keyOf(FULL), `R-7 메모가 잘린 옛 항목: 별을 다시 누르면 새 표식의 한 항목이 된다 (${starred.data?.count}건)`);
    eq((await remove(fx, FULL)).data?.count, 0, "R-7 메모가 잘린 옛 항목: 그 표식으로 지워진다");
  });
});

// ══ R-8 첫 비밀번호 안내와 방 단추 ═══════════════════════════════════════════════════════════════
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const NEW_SENTENCE = "저장하면 다른 기기·브라우저는 로그아웃돼요. 그 뒤 로그인돼 있지 않은 브라우저에서 단톡방의 웹 가계부 단추를 누르면 그 방 가계부만 보기 전용으로 열리고(12시간), 기록하거나 고치려면 로그인 이름과 비밀번호로 로그인해야 해요. 여럿이 쓰는 기기에서는 다 본 뒤 화면 위 ‘보기 끝내기’를 눌러 주세요.";
const OLD_SENTENCE = "저장하면 다른 기기·브라우저는 로그아웃되고, 그 뒤 로그인돼 있지 않은 브라우저에서 단톡방의 웹 가계부 단추를 누르면 홈 대신 로그인 이름과 비밀번호를 먼저 물어요.";
async function http(fx, path, { cookie = "", ua = PC } = {}) {
  const jobs = [];
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: { "user-agent": ua, accept: "text/html", ...(cookie ? { cookie } : {}) } }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const html = await response.text();
  await Promise.allSettled(jobs);
  return { status: response.status, location: response.headers.get("location") || "", cookies: typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [], html };
}
const applySet = (jar, setCookies) => {
  for (const line of setCookies) {
    const first = line.split(";")[0];
    const name = first.slice(0, first.indexOf("="));
    if (/Max-Age=0/i.test(line)) jar.delete(name); else jar.set(name, first.slice(first.indexOf("=") + 1));
  }
  return jar;
};
const jarStr = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
// 방 단추(카카오가 botUserKey·botGroupKey 를 붙인 주소)를 누르고 넘기는 곳까지 따라간다.
async function tapRoomButton(fx, room, ua) {
  const jar = new Map();
  const first = await http(fx, `/my?botUserKey=${room.owner}&botGroupKey=${room.room}`, { ua });
  applySet(jar, first.cookies);
  let last = first;
  for (let hop = 0; hop < 4 && last.status >= 300 && last.status < 400 && last.location.startsWith("/"); hop += 1) {
    last = await http(fx, last.location, { cookie: jarStr(jar), ua });
    applySet(jar, last.cookies);
  }
  return { first, last, jar, session: decodeURIComponent(jar.get("ab_user") || "") };
}
async function roomHousehold(fx, label) {
  const hex = (text) => createHash("sha256").update(text).digest("hex") + "ab";
  const room = { owner: hex(`v131-${label}-owner`), member: hex(`v131-${label}-member`), room: hex(`v131-${label}-room`) };
  await say(fx, "점심 9000원", { user: room.owner, room: room.room });
  await say(fx, "커피 4000원", { user: room.member, room: room.room });
  room.ownerId = String(fx.db.users.find((row) => row.kakao_user_key === room.owner)?.id || "");
  room.hid = String(fx.db.household_members.find((row) => String(row.user_id) === room.ownerId && row.role === "owner")?.household_id || "");
  return room;
}
async function givePassword(fx, userId, loginName) {
  const salt = newPasswordSalt();
  const hash = await pbkdf2PasswordHash("v131-owner-pass", salt, PASSWORD_KDF_ITERATIONS);
  fx.db.accountbook_user_identities.push({ user_id: userId, provider: "local", provider_subject: loginName.toLowerCase(), login_name: loginName, credential_hash: hash, credential_salt: salt, credential_iterations: PASSWORD_KDF_ITERATIONS, credential_version: 2 });
}

await section("R-8 첫 비밀번호 안내와 방 단추", async () => {
  for (const disabled of [false, true]) {
    const mode = disabled ? "방 전용 보기를 끈 운영" : "기본";
    const sentence = disabled ? OLD_SENTENCE : NEW_SENTENCE;
    const other = disabled ? NEW_SENTENCE : OLD_SENTENCE;
    await kakaoScene(async (fx) => {
      const room = await roomHousehold(fx, disabled ? "off" : "on");
      ok(!!room.ownerId && !!room.hid, `R-8 ${mode} 준비: 방 가계부와 채팅만 쓰는 소유자`);
      // ① 채팅만 쓰는 소유자가 카카오톡 안에서 방 단추로 들어와 양도 칸·삭제 칸의 안내를 읽는다.
      const owner = await tapRoomButton(fx, room, INAPP);
      eq(owner.session.split("|")[0], room.ownerId, `R-8 ${mode} ① 소유자는 방 단추로 온전한 세션을 받는다`);
      const members = await http(fx, `/my/members?household_id=${encodeURIComponent(room.hid)}&month=2026-11`, { cookie: jarStr(owner.jar), ua: INAPP });
      ok(members.status === 200 && members.html.includes(`그 비밀번호로 양도할 수 있어요. ${sentence}</p>`) && !members.html.includes(other), `R-8 ${mode} ① 양도 칸의 문장`);
      const households = await http(fx, `/my/households?month=2026-11&household_id=${encodeURIComponent(room.hid)}&manage=${encodeURIComponent(room.hid)}`, { cookie: jarStr(owner.jar), ua: INAPP });
      ok(households.status === 200 && households.html.includes(sentence) && !households.html.includes(other), `R-8 ${mode} ① 삭제 칸의 문장`);
      // ② 안내대로 첫 비밀번호를 저장한 뒤, 로그인돼 있지 않은 브라우저(PC·카카오톡 안)에서 방 단추를 누른다.
      await givePassword(fx, room.ownerId, disabled ? "v131off" : "v131on");
      for (const [name, ua] of [["PC", PC], ["카카오톡 안", INAPP]]) {
        const tap = await tapRoomButton(fx, room, ua);
        if (disabled) {
          ok(!tap.session && /login|my/.test(tap.first.location) && tap.first.location !== `/app?household_id=${room.hid}`, `R-8 ${mode} ② ${name}: 세션 없이 로그인 화면으로 간다 (${tap.first.location})`);
          ok(!tap.last.html.includes("보기 끝내기"), `R-8 ${mode} ② ${name}: 방 전용 보기 띠가 없다`);
        } else {
          eq(tap.first.location, `/app?household_id=${room.hid}`, `R-8 ${mode} ② ${name}: 그 방 가계부 홈으로 간다`);
          ok(tap.session.split("|")[0] === room.ownerId && tap.session.includes(`r:${room.hid}`), `R-8 ${mode} ② ${name}: 그 방만 여는 세션이다`);
          ok(tap.last.status === 200 && tap.last.html.includes("방 전용 보기") && tap.last.html.includes("보기 끝내기"), `R-8 ${mode} ② ${name}: 보기 전용 띠와 [보기 끝내기] 가 보인다 (${tap.last.status})`);
        }
      }
    }, disabled ? { KAKAO_ROOM_VIEW_DISABLED: "1" } : {});
  }
});

if (failures.length) {
  console.error(`FAIL: V22.9.131 record safety — ${failures.length} of ${checks} checks`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`PASS: V22.9.131 record safety — edit-window ambiguity, stable backups, fraction dates, budget remain, report retry, favorites, first-password notice (${checks} checks)`);
