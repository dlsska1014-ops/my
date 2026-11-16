// 카카오 기록 저장 직전 안전망의 되묻기 아홉 가족 검사(kakao/request-guards.js kakaoGuardMoreV229126, 2026-11-16 가상 문장 점검).
//  막는 말(BLOCK): 가족마다 4~6문장 — 1:1·단톡방 모두 기록이 생기지 않고, 그 가족의 안내 글과 단추(‘오늘기록’)로 답한다(글에 주소 없음).
//  그대로 저장할 말(KEEP): 가족마다 6~10문장 — 가족 낱말이 들었지만 맞게 저장되던 말. 날짜·금액·구분이 그대로다.
//  type_conflict: 답은 skill-handler.js kakaoMixedTypeConfirmationReply 와 같은 글·두 단추이고, 단추가 보내는 ‘수입 …’·‘지출 …’ 은 그 구분으로 한 건 저장된다.
//  기존 안전망이 먼저다(날짜·고치기 말이 함께 든 말은 그 안내), 카드 승인 문자로 읽힌 기록은 보지 않는다.
//  판정 시간: 되풀이 글 350자·1,400자의 판정 시간 비가 8배 이하(길이 4배 — 제곱이면 16배). 절대 시간은 보지 않는다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-10 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 가족들 전)에서는 BLOCK·type_conflict 단언이 실패한다(틀린 값을 저장한다). KEEP 은 그 코드도 저장한다 — 지나치게 막지 않는지 지키는 단언이다.
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { app, BASE, counter, fixture, putSetting, withClock } from "./lib-audit-v22934.mjs";

const TODAY = "2026-11-10";
const SECRET = "validate-v229126-guards-secret";
const USER = "kakao_login:2265";
const roomKey = (id) => crypto.createHash("sha256").update(`v229126-guards-room-${id}`).digest("hex");
const { ok, eq, done } = counter("카카오 저장 직전 안전망 되묻기 아홉 가족(범위·외화·거스름돈·할인·단가·나눠 냄·총액·여러 날짜·수입/지출) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };

const KEEP_GLOBALS = new Set(["__AB_QA_FIXED_NOW_MS", "__AB_CATEGORY_TABLE_ABSENT_UNTIL"]);
function resetIsolateState() {
  for (const name of Object.keys(globalThis)) {
    if (!name.startsWith("__AB_") || KEEP_GLOBALS.has(name)) continue;
    const value = globalThis[name];
    if (value instanceof Map || value instanceof Set) value.clear();
    else if (Array.isArray(value)) value.length = 0;
  }
}
const clearGuards = () => { for (const name of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[name]?.clear?.(); };
const payloadFor = (utterance, room) => {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: USER, type: "botUserKey", properties: { botUserKey: USER } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
};
const textOf = (body) => (body?.template?.outputs || []).map((o) => o.simpleText?.text || [o.textCard?.title, o.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
async function say(fx, utterance, room) {
  clearGuards();
  globalThis.__AB_QA_FIXED_NOW_MS += 60_000;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, room)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let body = null;
  try { body = JSON.parse(raw); } catch (_) {}
  // 1:1 은 바로가기(quickReplies), 단톡방은 같은 단추가 textCard 세로 버튼으로 나간다.
  const buttons = (body?.template?.outputs || []).flatMap((o) => o?.textCard?.buttons || []);
  const replies = [...(body?.template?.quickReplies || []), ...buttons];
  return { text: body ? textOf(body) : raw.slice(0, 300), labels: replies.map((q) => q.label), messages: replies.map((q) => q.messageText || q.label) };
}
const view = (r) => [String(r.transaction_date), Number(r.amount), r.type === "income" ? "i" : "e"].join("|");
// 사례 하나: 새 픽스처, 방 경로는 ‘시작’ 으로 방 가계부를 먼저 만든다. 말마다 새로 생긴 기록과 바뀐 예전 기록을 돌려준다.
async function run(id, path, turns) {
  return withClock(TODAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    const room = path === "room" ? roomKey(id) : "";
    if (room) await say(fx, "시작", room);
    const seed = new Map(fx.db.transactions.map((r) => [r.id, JSON.stringify(r)]));
    const replies = [], addedPerTurn = [];
    for (const turn of turns) {
      const before = new Set(fx.db.transactions.map((r) => r.id));
      replies.push(await say(fx, turn, room));
      addedPerTurn.push(fx.db.transactions.filter((r) => !before.has(r.id)).map(view));
    }
    const touchedSeed = [...seed].filter(([rid, sig]) => { const now = fx.db.transactions.find((r) => r.id === rid); return !now || JSON.stringify(now) !== sig; }).length;
    return { replies, addedPerTurn, touchedSeed };
  }));
}

const ONE = ["오늘기록"];
const TEXT = {
  range: "금액이 범위로 적혀 있어서 저장하지 않았어요.\n실제로 쓴 금액 하나로 다시 보내 주세요.\n예: 택시 9500원",
  currency: "원화가 아닌 금액으로 보여서 저장하지 않았어요.\n원으로 바꾼 금액으로 다시 보내 주세요.\n예: 기념품 43500원",
  change: "낸 돈과 거스름돈이 함께 적혀 있어서 저장하지 않았어요.\n실제로 쓴 금액만 다시 보내 주세요.\n예: 편의점 6800원",
  discount: "할인·쿠폰·포인트 금액이 함께 적혀 있어서 저장하지 않았어요.\n실제로 낸 금액만 다시 보내 주세요.\n예: 다이소 7000원",
  unit: "개당 가격과 개수가 함께 적혀 있어서 저장하지 않았어요.\n합계 금액으로 다시 보내 주세요.\n예: 치킨 2마리 36000원",
  split: "여럿이 나눠 낸 돈으로 보여서 저장하지 않았어요.\n내가 낸 금액만 다시 보내 주세요.\n예: 택시 6200원",
  total_items: "총액과 내역이 함께 적혀 있어서 저장하지 않았어요.\n총액 하나만 보내거나 내역만 보내 주세요.\n예: 마트 43500원",
  multi_date: "날짜가 둘 이상 적혀 있어서 저장하지 않았어요.\n날짜가 다른 기록은 한 줄씩 보내 주세요.\n예: 11월 2일 편의점 3500원",
};
// kakaoMixedTypeConfirmationReply 와 같은 글(40자에서 자른 예시).
const mixedText = (utterance) => {
  const text = utterance.replace(/\s+/g, " ").trim();
  const example = text.length > 40 ? `${text.slice(0, 40)}…` : text;
  return `수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.\n쓴 돈이면 ‘지출 ${example}’, 들어온 돈이면 ‘수입 ${example}’처럼 앞에 구분을 붙여 다시 보내 주세요.`;
};

// BLOCK = [가족, 보낸 말]. 줄바꿈은 \n 으로 적는다.
const BLOCK = [
  ["range", "택시 9000~10000원 나옴"], ["range", "주차비 3000원에서 4000원 사이"], ["range", "미용실 2만~3만"],
  ["range", "간식 5천 ~ 6천원 정도 씀"], ["range", "저녁 1만2천~1만5천원 나왔어"], ["range", "주유 6만에서 7만 사이로 넣음"],
  ["currency", "택시 위안 80 냄"], ["currency", "유로 35 기념품 샀어"], ["currency", "호텔 바트 1200 결제"],
  ["currency", "면세점 엔화 3000 씀"], ["currency", "1달러 1450원으로 치고 30달러 기념품 적어줘"], ["currency", "커피 4500 기념품 20달러"],
  ["change", "택시 2만원 내고 잔돈 4300원 받았어"], ["change", "빵집 5만원 냈는데 3만2천원 거슬러줌"], ["change", "편의점 만원 내고 거스름돈 3200원 받음"],
  ["change", "세탁소 만오천원 드렸는데 오천원 거슬러주심"], ["change", "10만원권 깨서 마트 장봄 잔돈 23,700"],
  ["discount", "치킨 23000 쿠폰 3000 할인"], ["discount", "마트 52000원인데 포인트 2000 씀"], ["discount", "올리브영 3만원 샀는데 5천원 쿠폰 썼어"],
  ["discount", "신발 89000인데 쿠폰 10000 썼어"], ["discount", "마트 52300원 포인트 2300 차감하고 결제함"], ["discount", "주유 70000 - 할인 3500"],
  ["unit", "4500원짜리 커피 2잔"], ["unit", "빵 3개 각 3500"], ["unit", "치킨 2마리 개당 18000"],
  ["unit", "pc방 시간당 1200 3시간"], ["unit", "영화 2명 한 사람당 15000원 내가 냄"], ["unit", "다이소에서 2000원짜리 3개 샀음"],
  ["split", "택시비 18600 셋이 나눔"], ["split", "삼겹살 84000 4명이서 n빵함"], ["split", "점심 12000 더치페이 내꺼 4000"],
  ["split", "회식비 168000 4명이서 엔빵함 내꺼 42000"], ["split", "치킨 38000 동생이랑 반띵"], ["split", "고기 9만원 3명이서 나눠냄 나 3만"],
  ["total_items", "이마트 총 19200 우유 2500 계란 6900 두부 1800"], ["total_items", "다이소 합계 12000원 수납함 5000 건전지 3000 컵 4000"],
  ["total_items", "장보기 총 31200 (쌀 18000 / 김치 9000 / 계란 4200)"], ["total_items", "편의점 김밥 1500 라면 1800 우유 1700 총 5500"],
  ["total_items", "쿠팡 합계 35,900 휴지 12,900 샴푸 9,800 모래 13,200"], ["total_items", "총 11000원 커피 3000 택시 8000"],
  ["multi_date", "3일 커피 4000\n5일 택시 8000"], ["multi_date", "2일 편의점 3500, 4일 약국 6200"], ["multi_date", "1일 교통카드 충전 50000, 2일 통신비 65000"],
  ["multi_date", "4일 미용실 25000\n6일 세탁소 8000"], ["multi_date", "3일 주유 50000\n7일 세차 12000"],
];
// KEEP = [가족, 보낸 말, 저장 값(날짜|금액|구분 e 지출·i 수입)].
const e = (amount, date = TODAY) => `${date}|${amount}|e`;
const KEEP = [
  ["range", "커피 4500~", [e(4500)]], ["range", "택시 8000원~~", [e(8000)]], ["range", "편의점에서 5000", [e(5000)]],
  ["range", "1일~3일 여행 숙박 30만원", [e(300000, "2026-11-01")]], ["range", "11/3~11/5 숙박 20만원", [e(200000, "2026-11-03")]],
  ["range", "10:00~12:00 주차 6000", [e(6000)]], ["range", "택시 8000원~ 커피 4500원", [e(8000), e(4500)]], ["range", "커피 4500 ~ 맛있었다", [e(4500)]],
  ["currency", "달러구트 책 15000", [e(15000)]], ["currency", "유로스타 티켓 250000원", [e(250000)]], ["currency", "환전 수수료 3000원", [e(3000)]],
  ["currency", "엔빵 12000", [e(12000)]], ["currency", "100엔샵 3000원", [e(3000)]], ["currency", "엔화 5만원 환전", [e(50000)]], ["currency", "1달러샵 5000원", [e(5000)]],
  // 쉼표로 떨어진 외화 조각은 해석기가 ‘금액을 읽지 못해 저장하지 않은 말’ 로 알리고 나머지만 저장한다 — 되묻지 않는다.
  ["currency", "커피 4500, 기념품 20달러", [e(4500)]], ["currency", "간식 300엔, 커피 4500", [e(4500)]],
  ["change", "잔돈 모아 저금 3000원", [e(3000)]], ["change", "점심 13000인데 15000 내고 잔돈은 안 받고 나옴", [e(15000)]],
  ["change", "잔돈 계좌로 3000원 넣음", [e(3000)]], ["change", "잔돈 모아서 저금 3000원 커피 4500원", [e(3000), e(4500)]],
  ["change", "거스름돈 없게 6800원 딱 맞춰 냄", [e(6800)]], ["change", "동전 잔돈 교환 수수료 500원", [e(500)]],
  ["discount", "포인트 충전 30000", [e(30000)]], ["discount", "기프티콘 선물 15000원", [e(15000)]], ["discount", "할인마트 5000, 다이소 3000", [e(5000), e(3000)]],
  ["discount", "쿠폰북 3000 커피 4500", [e(3000), e(4500)]], ["discount", "타임세일 할인 받아 신발 79000", [e(79000)]], ["discount", "20%할인 받아서 신발 79000", [e(79000)]],
  ["discount", "포인트 5000원 충전하고 커피 4500", [e(5000), e(4500)]], ["discount", "5천원 쿠폰 샀어 커피 4500", [e(5000), e(4500)]],
  ["unit", "커피 2잔 9000", [e(9000)]], ["unit", "치킨 2마리 38000", [e(38000)]], ["unit", "매달 5만원씩 적금 넣음", [e(50000)]],
  ["unit", "각티슈 3000", [e(3000)]], ["unit", "각자 계산 12000", [e(12000)]], ["unit", "한 개에 3000원 주고 삼", [e(3000)]],
  ["unit", "동창회 30명 왔음 회비 2만원씩", [e(20000)]], ["unit", "동기 6명이랑 술마심 1인당 3만원 냄", [e(30000)]], ["unit", "2개월 할부 월 5만원씩 커피 4500", [e(50000), e(4500)]],
  ["split", "반반치킨 23000", [e(23000)]], ["split", "더치커피 5000", [e(5000)]], ["split", "나눔장터 3000", [e(3000)]],
  ["split", "셋이 저녁 45000 내가 냄", [e(45000)]], ["split", "회식 n빵 23000", [e(23000)]], ["split", "n빵해서 32000 냈음", [e(32000)]],
  ["split", "뒤풀이 총 12만인데 4명이 나눠서 난 3만 냄", [e(30000)]], ["split", "친구랑 반띵해서 15000 냈어", [e(15000)]],
  ["total_items", "총무한테 30000 보냄", [e(30000)]], ["total_items", "합계 15000", [e(15000)]], ["total_items", "총각네 야채 15000 과일 8000", [e(15000), e(8000)]],
  ["total_items", "총 15000 결제", [e(15000)]], ["total_items", "토탈 3만원 마트", [e(30000)]], ["total_items", "총 5번 갔어 커피 4500", [e(4500)]],
  // 합이 맞는 끝 총액은 해석기가 빼고 내역만 저장한다(V22.9.93 Q-87) — 되묻지 않는다.
  ["total_items", "커피 3000 택시 8000 총 11000원", [e(3000), e(8000)]], ["total_items", "편의점 김밥 1500 라면 1800 우유 1700 총 5000", [e(1500), e(1800), e(1700)]],
  ["total_items", "커피 4000\n택시 8000\n합계 12000", [e(4000), e(8000)]],
  ["multi_date", "3일\n커피 4000\n5일\n택시 8000", [e(4000, "2026-11-03"), e(8000, "2026-11-05")]],
  ["multi_date", "3일 커피 4000\n1일 1식 도시락 9000", [e(4000, "2026-11-03"), e(9000, "2026-11-03")]],
  ["multi_date", "10일 점심 9000\n3일 연속 커피 4000", [e(9000), e(4000)]],
  ["multi_date", "5일 약국 1만원\n3일 치 약값 9000", [e(10000, "2026-11-05"), e(9000, "2026-11-05")]],
  ["multi_date", "제주 2박3일 숙소 30만원\n5일 렌트 8만원", [e(300000), e(80000, "2026-11-05")]],
  ["multi_date", "어제 커피 4500, 택시 8000", [e(4500, "2026-11-09"), e(8000, "2026-11-09")]],
  ["type_conflict", "수입 과외비 60만원 들어왔다", [`${TODAY}|600000|i`]], ["type_conflict", "지출 환불 안 되는 티켓 99000 결제함", [e(99000)]],
  ["type_conflict", "서류 수정 대행비 3만원 입금했어요", [e(30000)]], ["type_conflict", "총무님 경조사비 5만원 입금했습니다", [e(50000)]],
  ["type_conflict", "환불받으러 매장까지 가느라 택시비 12000원 씀", [e(12000)]], ["type_conflict", "2일 회식 정산 받음 35000 (민수가 보냄)", ["2026-11-02|35000|i"]],
  ["type_conflict", "홍삼 30000", [e(30000)]], ["type_conflict", "용돈 5만원 들어왔다", [`${TODAY}|50000|i`]],
];
// type_conflict 막는 말(해석기가 반대 구분으로 읽던 꼴의 변형) — 되물은 뒤 단추 말로 다시 보내면 그 구분으로 한 건.
const MIXED = ["지원금 30만원 입금됨", "보험금 12만원 들어왔다", "외주비 80만원 입금됐어", "레슨비 25만원 입금됐어요", "안 쓰는 가방 팔았다 4만원",
  "공연 끝나고 환불 안 되는 티켓 99000 결제함", "이자 받는 날이라 피자 시킴 21000", "환불 받으러 가는 길에 택시 9800원 냄"];
const MIXED_AMOUNT = { "지원금 30만원 입금됨": 300000, "보험금 12만원 들어왔다": 120000, "외주비 80만원 입금됐어": 800000, "레슨비 25만원 입금됐어요": 250000, "안 쓰는 가방 팔았다 4만원": 40000,
  "공연 끝나고 환불 안 되는 티켓 99000 결제함": 99000, "이자 받는 날이라 피자 시킴 21000": 21000, "환불 받으러 가는 길에 택시 9800원 냄": 9800 };

for (const path of ["direct", "room"]) {
  for (const [kind, utterance] of BLOCK) {
    const r = await run(`${kind}-${utterance}`, path, [utterance]);
    const reply = r.replies[0];
    check(() => eq(r.addedPerTurn[0].length, 0, `${path} [${kind}] ‘${utterance}’: 저장 없음 — ${JSON.stringify(r.addedPerTurn[0])}`), "block");
    check(() => ok(reply.text.startsWith(TEXT[kind]), `${path} [${kind}] ‘${utterance}’: 안내 글 — ${JSON.stringify(reply.text.slice(0, 90))}`), "block");
    check(() => eq(JSON.stringify(reply.labels), JSON.stringify(ONE), `${path} [${kind}] ‘${utterance}’: 단추`), "block");
    check(() => ok(!/https?:\/\//.test(reply.text), `${path} [${kind}] ‘${utterance}’: 글에 주소 없음`), "block");
    check(() => eq(r.touchedSeed, 0, `${path} [${kind}] ‘${utterance}’: 예전 기록 그대로`), "block");
  }
  for (const [kind, utterance, rows] of KEEP) {
    const r = await run(`${kind}-${utterance}`, path, [utterance]);
    check(() => eq(JSON.stringify([...r.addedPerTurn[0]].sort()), JSON.stringify([...rows].sort()), `${path} [${kind}] ‘${utterance}’: 그대로 저장 — ${r.replies[0].text.split("\n")[0].slice(0, 60)}`), "keep");
  }
  for (const utterance of MIXED) {
    const asked = await run(`mixed-${utterance}`, path, [utterance]);
    const reply = asked.replies[0];
    const flat = utterance.replace(/\s+/g, " ").trim();
    check(() => eq(asked.addedPerTurn[0].length, 0, `${path} [type_conflict] ‘${utterance}’: 저장 없음 — ${JSON.stringify(asked.addedPerTurn[0])}`), "mixed");
    check(() => eq(reply.text, mixedText(utterance), `${path} [type_conflict] ‘${utterance}’: 안내 글이 섞인 말 확인 답과 같다`), "mixed");
    check(() => eq(JSON.stringify(reply.labels), JSON.stringify(["지출로 기록", "수입으로 기록"]), `${path} [type_conflict] ‘${utterance}’: 두 단추`), "mixed");
    check(() => eq(JSON.stringify(reply.messages), JSON.stringify([`지출 ${flat}`, `수입 ${flat}`]), `${path} [type_conflict] ‘${utterance}’: 단추가 보내는 말`), "mixed");
    for (const [word, type] of [["수입", "i"], ["지출", "e"]]) {
      const again = await run(`mixed-${word}-${utterance}`, path, [utterance, `${word} ${flat}`]);
      check(() => eq(JSON.stringify(again.addedPerTurn[1]), JSON.stringify([`${TODAY}|${MIXED_AMOUNT[utterance]}|${type}`]), `${path} [type_conflict] ‘${word} ${flat}’: ${word} 한 건 — ${again.replies[1].text.split("\n")[0].slice(0, 60)}`), "mixed");
    }
  }
  // 기존 안전망이 먼저다: 고치는 말·읽지 못한 날짜 말이 함께 든 말은 그 안내다. 카드 승인 문자로 읽힌 기록은 예전처럼 저장한다.
  for (const [utterance, needle] of [["아까 커피 4500~5000 아니고 5500이야 고쳐줘", "기록을 고치거나 지우려는 말로 보여서"], ["지난주 치킨 2마리 각 19000", "날짜로 보이는 ‘지난주’ 부분을 읽지 못해서"]]) {
    const r = await run(`order-${utterance}`, path, [utterance]);
    check(() => eq(r.addedPerTurn[0].length, 0, `${path} 기존 안전망 먼저 ‘${utterance}’: 저장 없음`), "order");
    check(() => ok(r.replies[0].text.includes(needle), `${path} 기존 안전망 먼저 ‘${utterance}’: ${JSON.stringify(r.replies[0].text.slice(0, 80))}`), "order");
  }
  {
    const r = await run("sms", path, ["[Web발신]\n삼성1234승인 홍*동\n45,000원 일시불\n11/09 19:22 교촌치킨\n누적532,000원"]);
    check(() => eq(JSON.stringify(r.addedPerTurn[0]), JSON.stringify(["2026-11-09|45000|e"]), `${path} 카드 승인 문자: 문자 날짜·금액으로 한 건`), "sms");
  }
}

// 판정 시간: 같은 씨앗을 되풀이한 350자·1,400자 글(1,500자 상한 아래)의 판정 시간 비. 예열 뒤 여러 번 되풀이한 묶음의 한 번 평균 가운데 가장 짧은 것,
// 0.05 ms 밑은 0.05 ms 로 올려 비율이 흔들리지 않게 한다. 새 가족이 끝까지 도는 꼴(금액 자리·할인 말·내 몫 말·날짜·움직임 말이 많은 글)을 고른다.
const GUARD_URL = new URL("../src/modules/kakao/request-guards.js", import.meta.url).href;
const { kakaoRecordGuardV229120: guardFn } = await import(GUARD_URL);
const TIME_SEEDS = ["ㅋ", "1", "~", "만", " ", "1 ", "1~", "1만 ", "쿠폰1 ", "나 1 ", "3일 ", "들어왔길래 ", "1씩 ", "총1 ", "냄 ", "1/1 "];
const timeRows = (text) => [{ transaction_date: TODAY, amount: 4500, type: "expense", memo: text.slice(0, 160), raw_text: text.slice(0, 300) }, { transaction_date: TODAY, amount: 3000, type: "expense", memo: "빵" }];
const timeBody = (seed, n) => seed.repeat(Math.ceil(n / seed.length)).slice(0, n);
const TIME_FLOOR_MS = 0.05;
function guardTime(text) {
  const rows = timeRows(text);
  guardFn(text, rows, TODAY);
  const started = performance.now();
  guardFn(text, rows, TODAY);
  const reps = Math.max(1, Math.min(64, Math.ceil(2 / Math.max(performance.now() - started, 0.001))));
  let best = Infinity;
  for (let batch = 0; batch < 5; batch += 1) {
    const at = performance.now();
    for (let i = 0; i < reps; i += 1) guardFn(text, rows, TODAY);
    best = Math.min(best, (performance.now() - at) / reps);
  }
  return best;
}
for (const seed of TIME_SEEDS) {
  const shape = (body) => `커피 4500 ${body} 빵 3000`;
  const short = guardTime(shape(timeBody(seed, 350)));
  const long = guardTime(shape(timeBody(seed, 1400)));
  check(() => ok(Math.max(long, TIME_FLOOR_MS) <= 8 * Math.max(short, TIME_FLOOR_MS), `씨앗 ${JSON.stringify(seed)}: 1,400자 ${long.toFixed(3)} ms 가 350자 ${short.toFixed(3)} ms 의 8배 이하(길이 4배, 제곱이면 16배)`), "time");
}

if (failures.length) {
  console.error(`실패 ${failures.length}건:`);
  for (const line of failures.slice(0, 80)) console.error(`  - ${line}`);
  process.exit(1);
}
done();
