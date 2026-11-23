// V22.9.141 카카오 판 — 운영자 2026-11-22 ‘추천대로 140 공개, 141 카톡 나눠서 진행해줘’ 의 카카오 몫.
//
// ── 무엇을 보나 ──
//  K-1 저장 답 꼴: 새 기록 한 건만 저장한 답은 첫 줄 하나(‘01번 - 김밥 / 4,500원 / 현금 / 분류 · 💸 지출 저장했어요. (날짜)’ — ‘오늘기록’ 목록과 같은 줄,
//      분류까지). 수정·삭제 안내는 단톡방에서는 매번(봇 부르기 붙음), 1:1 에서는 그날 내 첫 기록·오늘이 아닌 날짜의 기록·번호를 모르는 답(그날 500건 이상 — ‘기록 보기’ 안내)에만 붙고 예전 모양 그대로다
//      (‘수정: "수정 01번" 또는 "수정 01번 금액 13000"’). 두 건 이상·중복이 섞인 답은 예전 꼴이다.
//  K-2 여러 줄 글의 머리말(V140:P-5): 첫 줄이 금액 없는 머리말인데 그 줄의 날짜 말(‘지난주 금욜에’·‘… 나 어제 쓴거’)을 해석기가 쓰지 않아 기록이 모두
//      오늘이면, 또는 받은 돈 말(‘회비 걷은거’·‘수입’)이 있는데 기록이 모두 지출이면 저장하지 않고 묻는다. 답의 예문대로 보내면 저장된다.
//      예문의 날짜는 그 말이 가리키는 그날뿐이다(어제·그제·그끄제, 요일 말 = 해석기의 요일 규칙). 하루로 정할 수 없는 말(지난 주말·지난주·
//      지난달)은 날짜를 지어내지 않고 ‘○월 ○일’ 자리만 보인다. 요일 말이 오늘이거나 되풀이 말(‘매주’·‘마다’)이면 묻지 않는다.
//      바르게 저장되던 머리말 꼴(‘어제 ⏎ …’·‘오늘 쓴거 ㅋㅋ ⏎ …’·끝 줄의 혼잣말·입금 알림 앞의 한 줄 등)은 예전 그대로 저장한다.
//      받은 돈 말은 기록이 모두 기본 분류(이름 줄)이거나 첫 줄이 받은 돈 목록(‘걷은거 정리’·‘받은 거’·‘입금된 거’)일 때만 묻는다 — ‘월급 받은 기념
//      플렉스 ⏎ …’·‘회비 걷은 돈으로 ⏎ …’ 는 저장. ‘수입 ⏎ … ⏎ 지출 ⏎ …’ 은 ‘지출’ 줄 앞만 본다. ‘지난달 관리비 ⏎ …’ 는 날짜를 묻지 않는다(독립 검토 4·5).
//  K-3 거스름·나눔의 빈틈: ‘만원 냈는데 600원 받음’·‘5만원 냈는데 2만원 받음’(거스름 낱말 없음)·‘120000 / 4명’ 도 V22.9.126 의 되묻는 답으로 간다.
//      시각(‘19:30 / 4명’)은 나눔 금액으로 보지 않는다(독립 검토 6).
//  K-4 수정 창(독립 검토 1·2·3·7): ‘그사이 기록이 바뀌었어요’·‘어느 기록인지 모를 말’ 다음의 ‘선택’ 단계에 온 이 창의 답 꼴 말(‘1번 9000’·‘금액 9000’·
//      ‘3번 카드’·‘9000’)은 아무것도 바꾸지 않고 다시 고르게 한다(‘수정 01번 …’ 한 줄 명령은 예전처럼). 창을 연 사이 메모·분류만 바뀐 기록도
//      덮어쓰지 않는다(운영처럼 모든 기록에 updated_at 을 찍고 바뀐 기록은 시각을 올린다 — select 에 적은 칸만 돌려주는 __honor_select). 메모의 ‘사원’·‘십원빵’·‘천원샵’ 은 금액이 아니다.
//      분수 되묻기의 긴 줄은 글자 단위로 자른다(이모지가 반으로 남지 않음).
//  (분량/날짜 단추·수정 창 충돌의 기본 흐름·관리자 파일 대상 다시 선택은 validate-v229131-record-safety, /demo 봇 말풍선은 validate-demo-tour-v22992 가 본다.)
// 메모리 픽스처(validation/qa-fixture.mjs)와 실제 /skill 요청(app.fetch)으로 보며 네트워크를 쓰지 않는다.
// 실행: node validation/validate-v229141-kakao.mjs   (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { createHash } from "node:crypto";
import app from "../src/index.js";
import { BASE, fixture, intercept, putSetting } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { ok(actual === expected, `${msg} (실제 ${JSON.stringify(actual)} · 기대 ${JSON.stringify(expected)})`); }
async function section(name, task) {
  try { await task(); } catch (error) { checks += 1; failures.push(`${name}: 예외 ${String(error?.stack || error).split("\n").slice(0, 3).join(" | ").slice(0, 500)}`); }
}

const SECRET = "kakao-secret-v229141";
const OWNER = "kakao_login:2265"; // user-bin, house-home 소유자
const HOME = "house-home";
const SELECT_KEY = "kakao_selected_household_v2251:user-bin";
const TODAY = "2026-11-10", YESTERDAY = "2026-11-09";
const BOT = "@말해가계부";
const GUARDS = ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE"];
const clearGuards = () => { for (const name of GUARDS) globalThis[name]?.clear?.(); };
function payloadFor(utterance, { user = OWNER, room = "" } = {}) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
// Secret 으로 확인된 /skill 요청 한 번. 단톡방 답도 봇 부르기를 떼지 않고 그대로 본다(K-1 이 그 말을 본다).
async function say(fx, utterance, { user = OWNER, room = "" } = {}) {
  clearGuards();
  globalThis.__AB_QA_FIXED_NOW_MS += 60_000;
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  let body = null;
  try { body = JSON.parse(raw); } catch (_) {}
  for (let round = 0; round < 12 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const text = body ? textOf(body) : raw;
  return { status: response.status, body, text, lines: text.split("\n") };
}
async function kakaoScene(task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${TODAY}T12:00:00+09:00`);
  try {
    return await fixture(async (fx) => {
      clearGuards();
      fx.env.KAKAO_SKILL_SECRET = SECRET;
      fx.db.transactions = fx.db.transactions.filter((row) => !(row.household_id === HOME && row.source_user_key === OWNER) && !(row.household_id === HOME && /^2026-(?:11|01)/.test(String(row.transaction_date || ""))));
      putSetting(fx, SELECT_KEY, HOME);
      return await task(fx);
    });
  } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}
// 그 가계부의 2026년 기록(만든 순서): ‘날짜 금액 구분 메모’.
const brief = (fx, householdId = HOME) => fx.db.transactions
  .filter((row) => row.household_id === householdId && String(row.transaction_date || "") >= "2026-01-01" && (householdId !== HOME || row.source_user_key === OWNER))
  .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)))
  .map((row) => `${row.transaction_date} ${Number(row.amount)} ${row.type} ${row.memo || row.raw_text}`);
// 같은 요청에서 만든 기록은 만든 시각이 같아 순서가 id 에 달린다 — 목록을 정렬해 견준다.
const sorted = (list) => JSON.stringify([...list].sort());
const roomUser = (name) => createHash("sha256").update(name).digest("hex") + "ab";
const roomHousehold = (fx, user) => String(fx.db.transactions.find((row) => row.source_user_key === user)?.household_id || "");
const hintLines = (reply) => reply.lines.filter((line) => /^(수정|삭제):/.test(line));

// ══ K-1 저장 답 꼴 ═════════════════════════════════════════════════════════════════════════
await section("K-1 1:1 저장 답", async () => {
  await kakaoScene(async (fx) => {
    const first = await say(fx, "김밥 4500원 현금");
    ok(/^01번 - 김밥 \/ 4,500원 \/ 현금 \/ [^\n]+? · 💸 지출 저장했어요\. \(2026-11-10\)$/.test(first.lines[0]), `K-1 그날 첫 기록 답의 첫 줄 = 번호·이름·금액·결제수단·분류 · 저장 (${first.lines[0]})`);
    ok(first.lines.includes("가계부: 우리집 생활비") && first.lines.some((line) => /^지출자: /.test(line)), "K-1 가계부·지출자 줄은 그대로");
    ok(!first.text.includes("새로 저장 1건") && !first.text.includes("날짜: ") && !first.text.includes("지출 저장했어요 😊"), "K-1 한 건 답에는 예전 머리 줄(‘💸 지출 저장했어요 😊’·‘새로 저장 1건 …’·‘날짜:’)이 없다");
    eq(JSON.stringify(hintLines(first)), JSON.stringify(['수정: "수정 01번" 또는 "수정 01번 금액 13000"', '삭제: "삭제 01번"']), "K-1 1:1 그날 첫 기록: 수정·삭제 안내는 예전 모양 그대로");
    const second = await say(fx, "커피 3000원");
    ok(/^02번 - 커피 \/ 3,000원 \/ - \/ [^\n]+? · 💸 지출 저장했어요\. \(2026-11-10\)$/.test(second.lines[0]), `K-1 둘째 기록 답의 첫 줄 (${second.lines[0]})`);
    eq(hintLines(second).length, 0, "K-1 1:1 그날 둘째 기록부터는 수정·삭제 안내를 다시 붙이지 않는다");
    const fixed = await say(fx, "수정 02번 금액 3500");
    ok(fixed.text.includes("변경했어요") && brief(fx).some((row) => row.startsWith(`${TODAY} 3500 expense 커피`)), `K-1 답의 번호(02번)로 바로 고칠 수 있다 (${fixed.lines[0]})`);
    const past = await say(fx, "어제 택시 15000원");
    ok(/^0\d번 - 택시 \/ 15,000원 \/ - \/ [^\n]+? · 💸 지출 저장했어요\. \(2026-11-09\)$/.test(past.lines[0]), `K-1 어제 기록 답의 첫 줄에 그날 날짜 (${past.lines[0]})`);
    ok(hintLines(past).length === 2 && hintLines(past)[0].startsWith('수정: "11월 9일 수정 0') && hintLines(past)[0].includes('금액 13000"') && hintLines(past)[1].startsWith('삭제: "11월 9일 삭제 0'), `K-1 오늘이 아닌 날짜의 기록에는 날짜가 붙은 안내가 늘 붙는다 (${hintLines(past).join(" | ")})`);
    const income = await say(fx, "용돈 50000원 받음");
    ok(/^0\d번 - 용돈 \/ 수입 50,000원 \/ - \/ [^\n]+? · 💰 수입 저장했어요\. \(2026-11-10\)$/.test(income.lines[0]) && income.lines.some((line) => /^수입자: /.test(line)), `K-1 수입 한 건 답 (${income.lines[0]})`);
    const pair = await say(fx, "점심 9000 커피 4500");
    ok(pair.text.includes("새로 저장 2건") && !/ · 💸 지출 저장했어요\. \(/.test(pair.text), `K-1 두 건 답은 예전 꼴 그대로 (${pair.lines[0]})`);
  });
});

// 번호를 읽지 못한 답(그날 기록이 500건 이상이면 번호를 매기지 않는다 — kakaoDailySeqPairFromRowsV229135): 첫 줄에 번호가 없으므로
// 1:1 의 그날 둘째 기록이 아니어도·맞아도 ‘기록 보기’ 에서 번호를 찾으라는 안내가 붙어야 한다(안내 없이 번호도 없는 답이 되지 않게).
await section("K-1 번호를 모르는 답", async () => {
  await kakaoScene(async (fx) => {
    const template = fx.db.transactions.find((row) => row.household_id === HOME) || fx.db.transactions[0];
    ok(!!template, "K-1 준비: 기록 본보기");
    for (let i = 0; i < 500; i += 1) {
      const at = new Date(Date.parse(`${TODAY}T00:00:00Z`) + i * 1000).toISOString();
      fx.db.transactions.push({ ...template, id: `bulk-v229141-${i}`, household_id: HOME, user_id: "user-wifi", source_user_key: "kakao_login:bulk-v229141", type: "expense", amount: 1000 + i, memo: `묶음 ${i}`, raw_text: `묶음 ${i} ${1000 + i}`, category: "기타지출", payment_method: "-", transaction_date: TODAY, created_at: at, updated_at: at, deleted_at: null });
    }
    const reply = await say(fx, "김밥 4500 현금");
    ok(/^김밥 \/ 4,500원 \/ 현금 \/ [^\n]+? · 💸 지출 저장했어요\. \(2026-11-10\)$/.test(reply.lines[0]), `K-1 번호를 모르면 첫 줄에 ‘00번’ 없이 (${reply.lines[0]})`);
    ok(reply.lines.includes("수정할 번호는 ‘오늘 기록 보기’에서 확인해 주세요."), `K-1 번호를 모르는 1:1 답에는 ‘기록 보기’ 안내가 붙는다 (${JSON.stringify(reply.lines.slice(-3))})`);
    ok(brief(fx).some((row) => row.startsWith(`${TODAY} 4500 expense 김밥`)), "K-1 번호를 몰라도 기록은 저장");
  });
});

await section("K-1 단톡방 저장 답", async () => {
  await kakaoScene(async (fx) => {
    const room = "7".repeat(64), alice = roomUser("v141-room-alice"), bora = roomUser("v141-room-bora");
    const first = await say(fx, "김밥 4500원 현금", { user: alice, room });
    const hid = roomHousehold(fx, alice);
    ok(!!hid && hid !== HOME, "K-1 단톡방 준비: 방 가계부에 저장");
    ok(/^01번 - 김밥 \/ 4,500원 \/ 현금 \/ [^\n]+? · 💸 지출 저장했어요\. \(2026-11-10\)$/m.test(first.text), `K-1 단톡방 첫 기록의 첫 줄 (${first.lines[0]})`);
    ok(first.lines.includes(`수정: "${BOT} 수정 01번" 또는 "${BOT} 수정 01번 금액 13000"`) && first.lines.includes(`삭제: "${BOT} 삭제 01번"`), `K-1 단톡방 안내에 봇 부르기 (${hintLines(first).join(" | ")})`);
    const second = await say(fx, "커피 3000원", { user: alice, room });
    ok(second.lines.includes(`수정: "${BOT} 수정 02번" 또는 "${BOT} 수정 02번 금액 13000"`) && second.lines.includes(`삭제: "${BOT} 삭제 02번"`), `K-1 단톡방은 같은 사람의 둘째 기록에도 안내를 붙인다 (${hintLines(second).join(" | ")})`);
    const other = await say(fx, "택시 8000원", { user: bora, room });
    ok(other.lines.includes(`수정: "${BOT} 수정 03번" 또는 "${BOT} 수정 03번 금액 13000"`) && /^03번 - 택시 \/ 8,000원 /m.test(other.text), `K-1 다른 구성원의 기록도 가계부 전체 번호와 안내 (${hintLines(other).join(" | ")})`);
  });
});

// ══ K-2 여러 줄 글의 머리말 ══════════════════════════════════════════════════════════════════
await section("K-2 머리말의 날짜 말", async () => {
  // 예문의 날짜는 그 말이 가리키는 바로 그날이다(2026-11-10 화요일: 지난주 금요일 = 11-06, 가장 가까운 지난 토요일 = 11-07, 어제 = 11-09).
  // 판 의식 중 고침: 첫 작업본은 어제·그제·그끄제가 아닌 말에 ‘오늘−3일’(11월 7일)을 보여, ‘지난주 금욜에’ 의 예문을 그대로 보내면 토요일에 저장됐다.
  for (const [input, word, exampleDate, dayLine, follow, expected] of [
    ["지난주 금욜에\n영화 14000\n팝콘 7500", "지난주", "11월 6일", "그날(11월 6일 금요일) 쓴 거면 첫 줄에 날짜만 적어 다시 보내 주세요.", "11월 6일\n영화 14000\n팝콘 7500", ["2026-11-06 14000 expense 영화", "2026-11-06 7500 expense 팝콘"]],
    ["토욜에\n영화 14000\n팝콘 7500", "토욜", "11월 7일", "그날(11월 7일 토요일) 쓴 거면 첫 줄에 날짜만 적어 다시 보내 주세요.", "11월 7일\n영화 14000\n팝콘 7500", ["2026-11-07 14000 expense 영화", "2026-11-07 7500 expense 팝콘"]],
    ["ㅋㅋ 다들 정산 ㄱㄱ 나 어제 쓴거\n펜션 240000\n장보기 87000\n숯 15000", "어제", "11월 9일", "그날(11월 9일 월요일) 쓴 거면 첫 줄에 날짜만 적어 다시 보내 주세요.", "11월 9일\n펜션 240000\n장보기 87000\n숯 15000", [`${YESTERDAY} 240000 expense 펜션`, `${YESTERDAY} 87000 expense 장보기`, `${YESTERDAY} 15000 expense 숯`]],
  ]) {
    await kakaoScene(async (fx) => {
      const ask = await say(fx, input);
      ok(ask.text.includes(`첫 줄 ‘${input.split("\n")[0]}’에 날짜로 보이는 말(‘${word}’)이 있는데`) && ask.text.includes("오늘(11월 10일)로 읽혀서 저장하지 않았어요."), `K-2 ‘${input.split("\n")[0]}’: 무엇이 어긋났는지 알린다 (${ask.lines[0]})`);
      ok(ask.lines.includes(dayLine), `K-2 ‘${input.split("\n")[0]}’: 그 말이 가리키는 날을 요일과 함께 알린다 (${ask.text.replace(/\n/g, " / ")})`);
      ok(ask.lines.includes(exampleDate) && ask.lines.includes(input.split("\n")[1]), `K-2 ‘${input.split("\n")[0]}’: 첫 줄에 날짜만 적는 예문 (${ask.text.replace(/\n/g, " / ")})`);
      ok(ask.text.includes("오늘 쓴 거면 첫 줄을 빼고 보내 주세요."), "K-2 오늘 쓴 거면 어떻게 하는지도 알린다");
      eq(brief(fx).length, 0, `K-2 ‘${input.split("\n")[0]}’: 한 건도 저장하지 않는다`);
      const saved = await say(fx, follow);
      eq(sorted(brief(fx)), sorted(expected), `K-2 예문대로 보내면 그날로 저장 (${saved.lines[0]})`);
    });
  }
});

// 하루로 정할 수 없는 말(지난 주말·지난주·지난달)은 날짜를 지어내지 않는다 — 예문 날짜 줄 없이 ‘○월 ○일’ 자리만 보인다.
await section("K-2 하루로 정할 수 없는 날짜 말", async () => {
  for (const [input, word] of [["지난 주말에\n영화 14000\n팝콘 7500", "지난 주말"], ["지난주\n영화 14000\n팝콘 7500", "지난주"], ["지난달\n관리비 128000\n가스 30000", "지난달"]]) {
    await kakaoScene(async (fx) => {
      const ask = await say(fx, input);
      ok(ask.text.includes(`첫 줄 ‘${input.split("\n")[0]}’에 날짜로 보이는 말(‘${word}’)이 있는데`), `K-2 ‘${input.split("\n")[0]}’: 묻는다 (${ask.lines[0]})`);
      ok(ask.lines.includes("그날 쓴 거면 첫 줄에 그날 날짜만 ‘○월 ○일’ 처럼 적어 다시 보내 주세요."), `K-2 ‘${input.split("\n")[0]}’: 날짜 자리만 보인다 (${ask.text.replace(/\n/g, " / ")})`);
      ok(!ask.lines.some((line) => /^\d{1,2}월 \d{1,2}일$/.test(line)), `K-2 ‘${input.split("\n")[0]}’: 지어낸 예문 날짜 줄이 없다 (${ask.text.replace(/\n/g, " / ")})`);
      eq(brief(fx).length, 0, `K-2 ‘${input.split("\n")[0]}’: 한 건도 저장하지 않는다`);
    });
  }
});

await section("K-2 머리말의 받은 돈 말", async () => {
  for (const input of ["총무라 회비 걷은거 정리\n지수 3만\n현우 3만\n은비 3만", "수입\n지수 3만\n현우 3만"]) {
    await kakaoScene(async (fx) => {
      const ask = await say(fx, input);
      ok(ask.text.includes(`첫 줄 ‘${input.split("\n")[0]}’에 받은 돈으로 보이는 말이 있는데`) && ask.text.includes("지출로 읽혀서 저장하지 않았어요.") && ask.lines.includes("수입 지수 3만") && ask.text.includes("쓴 돈이면 첫 줄을 빼고 보내 주세요."), `K-2 ‘${input.split("\n")[0]}’: 받은 돈인지 묻는다 (${ask.text.replace(/\n/g, " / ")})`);
      eq(brief(fx).length, 0, `K-2 ‘${input.split("\n")[0]}’: 한 건도 저장하지 않는다`);
    });
  }
  await kakaoScene(async (fx) => {
    await say(fx, "총무라 회비 걷은거 정리\n지수 3만\n현우 3만\n은비 3만");
    await say(fx, "수입 지수 3만\n수입 현우 3만\n수입 은비 3만");
    eq(sorted(brief(fx)), sorted([`${TODAY} 30000 income 지수`, `${TODAY} 30000 income 현우`, `${TODAY} 30000 income 은비`]), "K-2 예문대로 줄마다 ‘수입’ 을 붙이면 수입 세 건");
  });
  // 독립 검토 4 뒤: 받은 사람 이름 줄만 있거나(기본 분류) 첫 줄이 받은 돈의 목록을 가리키면 묻는다.
  for (const input of ["회비 입금됨\n지수 30000\n민수 30000", "환불 받은 거\n쿠팡 23000"]) {
    await kakaoScene(async (fx) => {
      const ask = await say(fx, input);
      ok(ask.text.includes(`첫 줄 ‘${input.split("\n")[0]}’에 받은 돈으로 보이는 말이 있는데`), `K-2 ‘${input.replace(/\n/g, " ⏎ ")}’: 묻는다 (${ask.lines[0]})`);
      eq(brief(fx).length, 0, `K-2 ‘${input.replace(/\n/g, " ⏎ ")}’: 한 건도 저장하지 않는다`);
    });
  }
  // 아래에 ‘지출’ 줄이 따로 있으면 그 앞(수입 쪽)의 기록만 본다.
  await kakaoScene(async (fx) => {
    const ask = await say(fx, "수입\n지수 30000\n지출\n점심 9000");
    ok(ask.text.includes("그 아래 ‘지출’ 줄 앞의 기록이 지출로 읽혀서 저장하지 않았어요.") && ask.lines.includes("수입 지수 30000"), `K-2 ‘수입 ⏎ 지수 30000 ⏎ 지출 ⏎ 점심 9000’: 수입 쪽 줄을 짚어 묻는다 (${ask.text.replace(/\n/g, " / ")})`);
    eq(brief(fx).length, 0, "K-2 ‘수입 ⏎ … ⏎ 지출 ⏎ …’ 의 수입 쪽에 지출이 있으면 저장하지 않는다");
  });
  await kakaoScene(async (fx) => {
    const reply = await say(fx, "수입\n월급 3000000\n지출\n점심 9000");
    eq(sorted(brief(fx)), sorted([`${TODAY} 3000000 income 월급`, `${TODAY} 9000 expense 점심`]), `K-2 ‘수입 ⏎ 월급 3000000 ⏎ 지출 ⏎ 점심 9000’ 은 예전처럼 저장 (${reply.lines[0]})`);
  });
});

await section("K-2 바르게 저장되던 머리말은 그대로", async () => {
  // 앞 넷은 V22.9.139 가 바르게 저장하던 합성 문장(Codex 초안의 여러 줄 차단이 막은 21문장 중 일부), 뒤는 이 판의 규칙이 넘지 말아야 할 꼴.
  // ‘매주 금요일 모임’ 은 고친 판에서 넣었다 — 첫 작업본은 되풀이 말에도 물었다(V22.9.139 는 오늘로 저장).
  for (const [input, expected] of [
    ["오늘 쓴거 ㅋㅋ\n지하철 1450\n김밥 4000\n다이소 6000", [`${TODAY} 1450`, `${TODAY} 4000`, `${TODAY} 6000`]],
    ["ㅋㅋ 다이소 털었다\n수납함 3000\n건전지 2000\n행주 1000", [`${TODAY} 3000`, `${TODAY} 2000`, `${TODAY} 1000`]],
    ["그제 회식 ㅋㅋ\n1차 고기집 32000\n택시비 15000", ["2026-11-08 32000", "2026-11-08 15000"]],
    ["매월 5일 관리비 자동이체 128000\n이번달도 빠짐", null],
    ["어제\n점심 9000\n커피 4500", [`${YESTERDAY} 9000`, `${YESTERDAY} 4500`]],
    ["11월 6일\n영화 14000\n팝콘 7500", ["2026-11-06 14000", "2026-11-06 7500"]],
    ["지난 금요일\n영화 14000\n팝콘 7500", ["2026-11-06 14000", "2026-11-06 7500"]], // 2026-11-10(화)의 지난 금요일
    ["점심 9000\n커피 4500\n어제보다 많이 씀 ㅠ", [`${TODAY} 9000`, `${TODAY} 4500`]],
    ["어제는 안 썼고\n점심 9000", [`${TODAY} 9000`]],
    ["택배 받은 거\n배송비 3000", [`${TODAY} 3000`]],
    ["용돈 받은 걸로 산 거\n책 15000\n커피 4500", [`${TODAY} 15000`, `${TODAY} 4500`]],
    // 요일 말이 오늘이면(2026-11-10 = 화요일) 기록의 날짜와 맞다. 되풀이 말(‘매주’·‘마다’)은 그날 하루가 아니다.
    ["화욜 장보기\n두부 2500\n계란 6900", [`${TODAY} 2500`, `${TODAY} 6900`]],
    ["매주 금요일 모임\n회비 30000\n간식 5000", [`${TODAY} 30000`, `${TODAY} 5000`]],
    // 독립 검토 4·5: 받은 돈으로 쓴 이야기와 ‘지난달’ 몫을 오늘 낸 돈 — 첫 작업본은 이런 글도 물었다(V22.9.140 은 그대로 저장).
    ["월급 받은 기념 플렉스\n운동화 89000\n치킨 20000", [`${TODAY} 89000`, `${TODAY} 20000`]],
    ["보너스 들어온 날\n소고기 85000\n와인 30000", [`${TODAY} 85000`, `${TODAY} 30000`]],
    ["회비 걷은 돈으로\n간식 23000\n음료 12000", [`${TODAY} 23000`, `${TODAY} 12000`]],
    ["용돈 받아서\n책 15000\n커피 4500", [`${TODAY} 15000`, `${TODAY} 4500`]],
    ["정산 받은 돈으로 회식\n고기 45000", [`${TODAY} 45000`]],
    ["지난달 관리비\n관리비 187000", [`${TODAY} 187000`]],
    ["지난달 카드값\n신한카드 450000\n삼성카드 230000", [`${TODAY} 450000`, `${TODAY} 230000`]],
  ]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, input);
      const rows = brief(fx).map((row) => row.split(" ").slice(0, 2).join(" "));
      if (expected) eq(sorted(rows), sorted(expected), `K-2 ‘${input.replace(/\n/g, " ⏎ ")}’ 는 예전처럼 저장 (${reply.lines[0]})`);
      else ok(!reply.text.includes("첫 줄 ‘"), `K-2 ‘${input.replace(/\n/g, " ⏎ ")}’ 에 머리말 안내가 붙지 않는다 (${reply.lines[0]})`);
    });
  }
});

await section("K-2 단톡방도 같은 안전망", async () => {
  await kakaoScene(async (fx) => {
    const room = "6".repeat(64), user = roomUser("v141-room-head");
    await say(fx, "회비 3000원", { user, room });
    const hid = roomHousehold(fx, user);
    const before = brief(fx, hid).length;
    const ask = await say(fx, "지난주 금욜에\n영화 14000\n팝콘 7500", { user, room });
    ok(ask.text.includes("첫 줄 ‘지난주 금욜에’에 날짜로 보이는 말(‘지난주’)이 있는데") && brief(fx, hid).length === before, `K-2 단톡방: 묻고 저장하지 않는다 (${ask.lines[0]})`);
  });
});

// ══ K-3 거스름·나눔 ═══════════════════════════════════════════════════════════════════════
await section("K-3 거스름·나눔의 빈틈", async () => {
  for (const [input, head] of [
    ["나 오늘 장본거\n두부 2500\n계란 6900\n만원 냈는데 600원 받음", "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요."],
    ["만원 냈는데 600원 받음", "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요."],
    ["정산 ㄱㄱ\n펜션 취소수수료 120000 / 4명\n나 30000 보냄", "여럿이 나눠 낸 돈으로 보여서 저장하지 않았어요."],
    // 독립 검토 6: 받은 금액이 단위·한글 수여도 같다(첫 작업본은 숫자만 봤다).
    ["5만원 냈는데 2만원 받음", "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요."],
    ["만원 냈는데 육백원 받음", "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요."],
  ]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, input);
      ok(reply.lines[0] === head, `K-3 ‘${input.replace(/\n/g, " ⏎ ")}’: 되묻는다 (${reply.lines[0]})`);
      eq(brief(fx).length, 0, `K-3 ‘${input.replace(/\n/g, " ⏎ ")}’: 저장하지 않는다`);
    });
  }
  // 독립 검토 6: 시각 뒤의 ‘/ N명’ 은 나눈 말이 아니다(첫 작업본은 ‘19:30 / 4명’ 의 ‘30 / 4명’ 을 나눈 말로 읽었다).
  for (const [input, expected] of [["택시 12000 / 카드", [`${TODAY} 12000`]], ["커피 4500원 냈는데 맛없음", [`${TODAY} 4500`]], ["예약 19:30 / 4명 예약금 20000원", [`${TODAY} 20000`]]]) {
    await kakaoScene(async (fx) => {
      const reply = await say(fx, input);
      eq(sorted(brief(fx).map((row) => row.split(" ").slice(0, 2).join(" "))), sorted(expected), `K-3 ‘${input}’ 는 예전처럼 저장 (${reply.lines[0]})`);
    });
  }
});

// ══ K-4 수정 창(독립 검토 1·2·3) ══════════════════════════════════════════════════════════
const HOLD = "⚠️ 아무것도 바꾸거나 저장하지 않았어요.";
const ledgerOf = (fx) => fx.db.transactions
  .filter((row) => row.household_id === HOME && row.source_user_key === OWNER)
  .sort((a, b) => String(a.created_at || "").localeCompare(String(b.created_at || "")) || String(a.id).localeCompare(String(b.id)))
  .map((row) => `${row.memo}|${Number(row.amount)}|${row.category}|${row.payment_method || "-"}`);
async function seedThree(fx) {
  for (const utterance of ["커피 4500", "택시 8000", "점심 12000"]) {
    const reply = await say(fx, utterance);
    ok(/저장했어요/.test(reply.text), `K-4 준비 ‘${utterance}’ 저장 (${reply.lines[0]})`);
  }
}
const taxiOf = (fx) => fx.db.transactions.find((row) => row.household_id === HOME && row.source_user_key === OWNER && /택시/.test(String(row.memo || "")));

await section("K-4 선택 단계의 답 꼴 말", async () => {
  // 다른 사람이 금액을 바꾼 뒤(그사이 기록이 바뀌었어요) 이 창의 답처럼 보이는 말은 다른 기록을 고치거나 새 기록을 만들지 않는다.
  await kakaoScene(async (fx) => {
    await seedThree(fx);
    await say(fx, "수정 02번");
    taxiOf(fx).amount = 8800;
    const conflict = await say(fx, "1번 9000");
    ok(conflict.text.startsWith("그사이 기록이 바뀌었어요.") && conflict.text.includes("8,800원"), `K-4 바뀐 기록을 알린다 (${conflict.lines[0]})`);
    const before = JSON.stringify(ledgerOf(fx));
    for (const again of ["1번 9000", "금액 9000", "9000", "9000원으로", "3번 카드", "4"]) {
      const hold = await say(fx, again);
      ok(hold.lines[0] === HOLD && hold.text.includes("‘선택한 기록 보기’를 보내 주세요"), `K-4 선택 단계의 ‘${again}’: 아무것도 바꾸지 않고 다시 고르라고 한다 (${hold.lines[0]})`);
      ok((hold.body?.template?.quickReplies || []).some((button) => button.label === "선택한 기록 보기"), `K-4 선택 단계의 ‘${again}’: ‘선택한 기록 보기’ 단추`);
      eq(JSON.stringify(ledgerOf(fx)), before, `K-4 선택 단계의 ‘${again}’: 01번·03번도 그대로이고 새 기록도 없다`);
    }
    const menu = await say(fx, "선택한 기록 보기");
    ok(menu.text.includes("02번 - 택시 / 8,800원"), `K-4 ‘선택한 기록 보기’ 는 지금 내용으로 다시 연다 (${menu.lines[0]})`);
    const fixed = await say(fx, "금액 9000");
    ok(fixed.text.startsWith("✅ 02번 금액을 9,000원으로"), `K-4 다시 고른 뒤의 ‘금액 9000’ 은 02번을 고친다 (${fixed.lines[0]})`);
    eq(JSON.stringify(ledgerOf(fx).map((line) => line.split("|").slice(0, 2).join("|"))), JSON.stringify(["커피|4500", "택시|9000", "점심|12000"]), "K-4 02번만 바뀐다");
  });
  // 고치는 말인지 모를 말 뒤에도 같다. 번호와 수정 말이 함께 있는 ‘수정 01번’ 은 그 기록을 연다(기록을 고르는 명령).
  await kakaoScene(async (fx) => {
    await seedThree(fx);
    await say(fx, "수정 02번");
    const asked = await say(fx, "메모 회비 3만원");
    ok(asked.text.includes("선택한 기록 보기") && asked.text.includes("저장하지 않았어요"), `K-4 준비: 고치는 말인지 묻는다 (${asked.lines[0]})`);
    const before = JSON.stringify(ledgerOf(fx));
    for (const again of ["3번 카드", "1번 13000원으로", "13000"]) {
      const hold = await say(fx, again);
      ok(hold.lines[0] === HOLD, `K-4 모를 말 뒤의 ‘${again}’: 아무것도 바꾸지 않는다 (${hold.lines[0]})`);
      eq(JSON.stringify(ledgerOf(fx)), before, `K-4 모를 말 뒤의 ‘${again}’: 기록 그대로`);
    }
    const other = await say(fx, "수정 01번");
    ok(other.text.includes("01번 - 커피") && other.text.includes("무엇을 바꿀까요?"), `K-4 선택 단계의 ‘수정 01번’ 은 01번 수정 창을 연다 (${other.lines[0]})`);
  });
  // ‘수정’ 을 붙인 한 줄 명령(답이 권하는 꼴)은 앞 단계가 ‘01번 금액 5000’ 으로 바꿔 넘겨도 예전처럼 그 기록을 고친다 — 붙잡으면 권한 대로 보내도 다시 붙잡힌다.
  await kakaoScene(async (fx) => {
    await seedThree(fx);
    await say(fx, "수정 02번");
    taxiOf(fx).amount = 8800;
    await say(fx, "1번 9000");
    const one = await say(fx, "수정 01번 금액 5000");
    ok(one.text.startsWith("✅ 01번 금액을 5,000원으로"), `K-4 선택 단계의 ‘수정 01번 금액 5000’ 은 01번을 고친다 (${one.lines[0]})`);
    eq(JSON.stringify(ledgerOf(fx).map((line) => line.split("|").slice(0, 2).join("|"))), JSON.stringify(["커피|5000", "택시|8800", "점심|12000"]), "K-4 ‘수정 01번 금액 5000’: 01번만 바뀐다");
  });
  // 단톡방: 붙잡는 답의 보낼 말에도 봇 부르기가 붙는다(단톡방의 봇은 불린 말만 받는다 — ‘…’처럼 보내 주세요 꼴, V22.9.134 규칙).
  await kakaoScene(async (fx) => {
    const room = "8".repeat(64), alice = roomUser("v141-room-choose");
    await say(fx, "커피 1370원", { user: alice, room });
    await say(fx, "녹차 1450원", { user: alice, room });
    await say(fx, "수정 01번", { user: alice, room });
    const asked = await say(fx, "메모 회비 3만원", { user: alice, room });
    ok(asked.text.includes("아무것도 바꾸거나 저장하지 않았어요") && asked.text.includes("선택한 기록 보기"), `K-4 단톡방: 금액이 든 메모는 어느 기록인지 묻는다 (${asked.lines[0]})`);
    const hold = await say(fx, "금액 9000", { user: alice, room });
    ok(hold.lines[0] === "⚠️ 아무것도 바꾸거나 저장하지 않았어요." && hold.lines.includes(`다른 기록은 ‘${BOT} 수정 02번’처럼 보내 주세요.`) && hold.text.includes(`‘${BOT} 선택한 기록 보기’를 보내 주세요`), `K-4 단톡방의 붙잡는 답: 보낼 말에 봇 부르기 (${hold.lines.join(" | ")})`);
    const hid = roomHousehold(fx, alice);
    eq(JSON.stringify(fx.db.transactions.filter((row) => row.household_id === hid && !row.deleted_at).map((row) => `${row.memo || row.category}|${row.amount}`)), JSON.stringify(["커피|1370", "녹차|1450"]), "K-4 단톡방: 붙잡은 뒤 기록은 그대로");
  });
});

await section("K-4 수정 창을 연 사이 바뀐 기록(updated_at)", async () => {
  // 운영 DB 는 모든 기록에 updated_at 이 있고(기본값 now()) 고칠 때마다 트리거가 바꾼다. PostgREST 처럼 select 에 적은 칸만 돌려준다(__honor_select).
  const stamp = (fx) => { for (const row of fx.db.transactions) if (row.household_id === HOME && !row.updated_at) row.updated_at = "2026-11-10T03:00:00.000000+00:00"; };
  for (const [label, change, answer] of [
    ["다른 사람이 내용을 바꾼 뒤 ‘내용 버스’", (taxi) => { taxi.memo = "심야택시"; }, "내용 버스"],
    ["다른 사람이 분류를 바꾼 뒤 ‘금액 9000’", (taxi) => { taxi.category = "출장비"; }, "금액 9000"],
  ]) {
    await kakaoScene(async (fx) => {
      fx.db.__honor_select = true;
      await seedThree(fx);
      stamp(fx);
      await say(fx, "수정 02번");
      const taxi = taxiOf(fx);
      change(taxi);
      taxi.updated_at = "2026-11-10T03:05:00.000000+00:00";
      const after = JSON.stringify(ledgerOf(fx));
      const reply = await say(fx, answer);
      ok(reply.text.startsWith("그사이 기록이 바뀌었어요."), `K-4 ${label}: 덮어쓰지 않고 알린다 (${reply.lines[0]})`);
      eq(JSON.stringify(ledgerOf(fx)), after, `K-4 ${label}: 다른 사람이 고친 값이 그대로`);
    });
  }
  // 그사이 바뀐 것이 없으면 그대로 고친다(updated_at 조건이 가짜 충돌을 만들지 않는다).
  await kakaoScene(async (fx) => {
    fx.db.__honor_select = true;
    await seedThree(fx);
    stamp(fx);
    await say(fx, "수정 02번");
    const reply = await say(fx, "내용 버스");
    ok(reply.text.startsWith("✅ 02번 내용을 '버스'로"), `K-4 바뀐 것이 없으면 고친다 (${reply.lines[0]})`);
    ok(ledgerOf(fx).some((line) => line.startsWith("버스|8000|")), "K-4 02번 내용이 ‘버스’");
  });
  // 쓰는 순간(앞서 읽은 뒤 저장 전)에 다른 칸이 바뀌어도 updated_at 조건이 막는다.
  await kakaoScene(async (fx) => {
    fx.db.__honor_select = true;
    await seedThree(fx);
    stamp(fx);
    await say(fx, "수정 02번");
    const taxi = taxiOf(fx);
    let raced = false;
    const reset = intercept(async ({ url, method }) => {
      if (!raced && method === "PATCH" && url.pathname === "/rest/v1/transactions" && url.searchParams.get("id") === "eq." + taxi.id) {
        raced = true;
        taxi.category = "출장비";
        taxi.updated_at = "2026-11-10T03:09:00.000000+00:00";
      }
      return null;
    });
    let reply;
    try { reply = await say(fx, "내용 버스"); } finally { reset(); }
    ok(raced && reply.text.startsWith("그사이 기록이 바뀌었어요."), `K-4 쓰는 순간 다른 칸이 바뀌면 알린다 (${reply?.lines?.[0]})`);
    eq(String(taxi.memo), "택시", "K-4 쓰는 순간 바뀐 기록에 내용을 덮어쓰지 않는다");
  });
});

await section("K-4 메모의 금액 꼴", async () => {
  // 독립 검토 2: 한글 수 한 글자 + ‘원’ 이 든 낱말은 금액이 아니다 — 메모를 바로 고친다.
  for (const [input, memo] of [["메모 사원 식당", "사원 식당"], ["메모 십원빵", "십원빵"], ["내용 다이소 천원샵", "다이소 천원샵"], ["메모 일원동 맛집", "일원동 맛집"]]) {
    await kakaoScene(async (fx) => {
      await seedThree(fx);
      await say(fx, "수정 02번");
      const reply = await say(fx, input);
      ok(reply.text.startsWith(`✅ 02번 내용을 '${memo}'`), `K-4 ‘${input}’ 은 메모를 고친다 (${reply.lines[0]})`);
    });
  }
  // 금액이 든 메모는 예전처럼 묻는다(숫자 금액·천·만이 든 한글 금액 낱말).
  for (const input of ["메모 회비 3만원", "메모 회비 만원"]) {
    await kakaoScene(async (fx) => {
      await seedThree(fx);
      await say(fx, "수정 02번");
      const before = JSON.stringify(ledgerOf(fx));
      const reply = await say(fx, input);
      ok(reply.text.includes("새로 기록할까요?"), `K-4 ‘${input}’ 은 새 기록인지 묻는다 (${reply.lines[0]})`);
      eq(JSON.stringify(ledgerOf(fx)), before, `K-4 ‘${input}’: 묻는 동안 기록 그대로`);
    });
  }
});

await section("K-4 분수 되묻기의 긴 줄", async () => {
  await kakaoScene(async (fx) => {
    const reply = await say(fx, "케이크 1/8 조각 6000원 " + "😀".repeat(50));
    ok(reply.text.includes("은 분량인가요, 날짜인가요?"), `K-4 준비: 분수를 묻는다 (${reply.lines[0]})`);
    ok(!/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/.test(reply.text), "K-4 독립 검토 7: 긴 줄을 줄여도 이모지가 반으로 잘리지 않는다");
  });
});

if (failures.length) {
  console.error(`FAIL: V22.9.141 kakao — ${failures.length} of ${checks} checks`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`PASS: V22.9.141 kakao — save reply line, head-line date/income re-ask, change/split gaps (${checks} checks)`);
