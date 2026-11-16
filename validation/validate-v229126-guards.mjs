// 카카오 기록 저장 직전 안전망의 되묻기 아홉 가족 검사(kakao/request-guards.js kakaoGuardMoreV229126, 2026-11-16 가상 문장 점검).
//  막는 말(BLOCK): 가족마다 4~6문장 — 1:1·단톡방 모두 기록이 생기지 않고, 그 가족의 안내 글과 단추(‘오늘기록’)로 답한다(글에 주소 없음).
//  그대로 저장할 말(KEEP): 가족마다 6~10문장 — 가족 낱말이 들었지만 맞게 저장되던 말. 날짜·금액·구분이 그대로다.
//  type_conflict: 답은 실제 섞인 말 확인 답(skill-handler.js kakaoMixedTypeConfirmationReply — 해석기가 섞인 말로 막는 문장을 /skill 로 보내 받은 답)과
//  같은 글·두 단추이고, 단추가 보내는 ‘수입 …’·‘지출 …’ 은 그 구분으로 한 건 저장된다. 여러 건으로 읽힌 말, 앞에 붙인 구분이 해석기에서 떨어져 나가는 말
//  (단추 말이 그 구분 한 건으로 읽히지 않는 말)과 앞에 구분을 붙였는데도 반대 구분 한 건으로 읽힌 말은 단추 없이 한 건씩 보내 달라고 한다.
//  기존 안전망이 먼저다(날짜·고치기 말이 함께 든 말은 그 안내), 카드 승인 문자로 읽힌 기록은 보지 않는다.
//  장면: 별도 구매 추가, 예산 명령, 열린 고치기 세션 뒤의 새 기록, 응답 예산을 넘긴 늦은 답(늦은 답 글과 뒤에서 끝난 저장이 맞는지).
//  판정 시간: 되풀이 글 350자·1,400자의 판정 시간 비가 8배 이하(길이 4배 — 제곱이면 16배). 절대 시간은 보지 않는다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-10 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 가족들 전)에서는 BLOCK·type_conflict 단언이 실패한다(틀린 값을 저장한다). KEEP 은 그 코드도 저장한다 — 지나치게 막지 않는지 지키는 단언이다.
import crypto from "node:crypto";
import { performance } from "node:perf_hooks";
import { app, BASE, counter, fixture, intercept, putSetting, withClock } from "./lib-audit-v22934.mjs";

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
  return { text: body ? textOf(body) : raw.slice(0, 300), labels: replies.map((q) => q.label), messages: replies.map((q) => q.messageText || q.label), result: response.headers.get("x-accountbook-nlu-result") || "" };
}
const view = (r) => [String(r.transaction_date), Number(r.amount), r.type === "income" ? "i" : "e"].join("|");
// 사례 하나: 새 픽스처, 방 경로는 ‘시작’ 으로 방 가계부를 먼저 만든다. 말마다 새로 생긴 기록과 바뀐 예전 기록을 돌려준다.
// late: 응답 예산을 200ms 로 줄이고 픽스처 DB 요청마다 150ms 를 늦춰 늦은 답(kakaoDeferredReply) 길로 보낸다. 뒤 작업이 끝난 뒤의 기록을 센다.
async function run(id, path, turns, { late = false } = {}) {
  return withClock(TODAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    const room = path === "room" ? roomKey(id) : "";
    if (room) await say(fx, "시작", room);
    const seed = new Map(fx.db.transactions.map((r) => [r.id, JSON.stringify(r)]));
    const replies = [], addedPerTurn = [];
    const restore = late ? intercept(async () => { await new Promise((resolve) => setTimeout(resolve, 150)); return null; }) : () => {};
    if (late) fx.env.KAKAO_RESPONSE_BUDGET_MS = "200";
    try {
      for (const turn of turns) {
        const before = new Set(fx.db.transactions.map((r) => r.id));
        replies.push(await say(fx, turn, room));
        addedPerTurn.push(fx.db.transactions.filter((r) => !before.has(r.id)).map(view));
      }
    } finally {
      restore();
      delete fx.env.KAKAO_RESPONSE_BUDGET_MS;
    }
    const touchedSeed = [...seed].filter(([rid, sig]) => { const now = fx.db.transactions.find((r) => r.id === rid); return !now || JSON.stringify(now) !== sig; }).length;
    return { replies, addedPerTurn, touchedSeed, memos: fx.db.transactions.filter((r) => !seed.has(r.id)).map((r) => String(r.memo || "")) };
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
  // 여러 건으로 읽힌 말: 앞에 붙인 ‘수입’ 이 첫 건에만 닿으므로 두 단추 대신 한 건씩 보내 달라고 한다.
  type_conflict: "수입인지 지출인지 헷갈려서 아직 저장하지 않았어요.\n기록을 한 건씩, 앞에 ‘지출’ 이나 ‘수입’ 을 붙여 다시 보내 주세요.\n예: 수입 중고 자전거 15만원",
};
// 실제 섞인 말 확인 답의 원본: 해석기가 섞인 말로 막는 문장(40자 이하·넘는 것 하나씩). 이 문장들의 답에서 예시·단추 말만 바꿔 안전망 답과 견준다.
const REAL_MIXED = ["월급 받아서 카드값 냈어 50만원", "월급 받아서 카드값 냈어 50만원 오늘은 정말 바쁜 하루였고 저녁은 집에서 먹음"];

// BLOCK = [가족, 보낸 말]. 줄바꿈은 \n 으로 적는다.
const BLOCK = [
  ["range", "택시 9000~10000원 나옴"], ["range", "주차비 3000원에서 4000원 사이"], ["range", "미용실 2만~3만"],
  ["range", "간식 5천 ~ 6천원 정도 씀"], ["range", "저녁 1만2천~1만5천원 나왔어"], ["range", "주유 6만에서 7만 사이로 넣음"],
  ["currency", "택시 위안 80 냄"], ["currency", "유로 35 기념품 샀어"], ["currency", "호텔 바트 1200 결제"],
  ["currency", "면세점 엔화 3000 씀"], ["currency", "1달러 1450원으로 치고 30달러 기념품 적어줘"], ["currency", "커피 4500 기념품 20달러"],
  ["change", "택시 2만원 내고 잔돈 4300원 받았어"], ["change", "빵집 5만원 냈는데 3만2천원 거슬러줌"], ["change", "편의점 만원 내고 거스름돈 3200원 받음"],
  ["change", "세탁소 만오천원 드렸는데 오천원 거슬러주심"], ["change", "10만원권 깨서 마트 장봄 잔돈 23,700"],
  ["discount", "치킨 23000 쿠폰 3000 할인"], ["discount", "마트 52000원인데 포인트 2000 씀"], ["discount", "올리브영 3만원 샀는데 5천원 쿠폰 썼어"],
  ["discount", "신발 89000인데 쿠폰 10000 썼어"], ["discount", "마트 52300원 포인트 2300 차감하고 결제함"], ["discount", "주유 70000 - 할인 3500"], ["discount", "치킨 23000 쿠폰1000 할인"],
  ["unit", "4500원짜리 커피 2잔"], ["unit", "빵 3개 각 3500"], ["unit", "치킨 2마리 개당 18000"],
  ["unit", "pc방 시간당 1200 3시간"], ["unit", "영화 2명 한 사람당 15000원 내가 냄"], ["unit", "다이소에서 2000원짜리 3개 샀음"],
  ["split", "택시비 18600 셋이 나눔"], ["split", "삼겹살 84000 4명이서 n빵함"], ["split", "점심 12000 더치페이 내꺼 4000"],
  ["split", "회식비 168000 4명이서 엔빵함 내꺼 42000"], ["split", "치킨 38000 동생이랑 반띵"], ["split", "고기 9만원 3명이서 나눠냄 나 3만"],
  ["total_items", "이마트 총 19200 우유 2500 계란 6900 두부 1800"], ["total_items", "다이소 합계 12000원 수납함 5000 건전지 3000 컵 4000"],
  ["total_items", "장보기 총 31200 (쌀 18000 / 김치 9000 / 계란 4200)"], ["total_items", "편의점 김밥 1500 라면 1800 우유 1700 총 5500"],
  ["total_items", "쿠팡 합계 35,900 휴지 12,900 샴푸 9,800 모래 13,200"], ["total_items", "총 11000원 커피 3000 택시 8000"],
  ["total_items", "회식 2차 총 96 (맥주 48 안주 31 노가리 17)"],
  ["multi_date", "3일 커피 4000\n5일 택시 8000"], ["multi_date", "2일 편의점 3500, 4일 약국 6200"], ["multi_date", "1일 교통카드 충전 50000, 2일 통신비 65000"],
  ["multi_date", "4일 미용실 25000\n6일 세탁소 8000"], ["multi_date", "3일 주유 50000\n7일 세차 12000"],
  // 2차에 좁힌 뒤에도 남는 꼴: 수량과 같은 조각의 단가(‘2마리 한마리’·다음 금액 앞의 ‘2잔 각’·‘2개 1500씩’), 낸 말·말 끝의 나눔, 단위 없는 두 수의 범위.
  ["unit", "치킨 2마리 한마리 18000"], ["unit", "아메리카노 2잔 각 4500 총 9000"], ["unit", "편의점 삼각김밥 2개 1500씩 바나나우유 1700"],
  ["split", "점심 36000 셋이 나눠서 냈어"], ["split", "유튜브 패밀리 23000원 4명이서 나눔 ㅋㅋ 내 몫만 적어줘"], ["range", "용돈 20~30 받음"],
  // 여러 건으로 읽힌 type_conflict, 앞에 붙인 ‘수입’ 이 떨어져 나가는 말(해석기가 ‘수입 … 깜빡하고’ 까지를 한 조각으로 떼어 지출로 읽는다): 단추 없이 한 건씩 보내 달라고 한다.
  ["type_conflict", "택시 8000 커피 4500 신발 환불받은거 12000"], ["type_conflict", "홈플 총 52000 그 중 환불받은 거 8000 (반품한 냄비)"],
  ["type_conflict", "작년에 깜빡하고 안 한 실비 청구 며칠 전에 해놨더니 오늘 벌써 들어왔네요 보험금 58000원"],
  // 앞에 ‘수입’ 을 붙였는데 해석기가 지출 한 건으로 읽은 말도 저장하지 않는다.
  ["type_conflict", "수입 작년에 깜빡하고 안 한 실비 청구 며칠 전에 해놨더니 오늘 벌써 들어왔네요 보험금 58000원"],
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
  // 2차: 할인 말 바로 뒤 ‘1도’(조금도) 는 금액이 아니다 — 1차는 1 을 금액으로 세어 막았다.
  ["discount", "쿠폰 1도 안 먹혀서 그냥 파마 65000", [e(65000)]], ["discount", "할인 1도 안해줌 염색 55000", [e(55000)]],
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
  // 2차: 메뉴 이름 뒤에 붙은 한 자리 수량(‘떡볶이2’)은 금액으로 세지 않는다 — 1차는 금액 셋 이상으로 세어 막았다.
  ["total_items", "분식집 떡볶이2 김밥3 순대1 총 27000원 결제", [e(27000)]], ["total_items", "치킨집 후라이드1 양념2 콜라1 합계 52000원 내가 냄", [e(52000)]],
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
  // 2차(독립 검토가 짚은 꼴 + 같은 뿌리의 변형): 1차가 막았고, 바탕 코드와 같게 저장한다.
  ["split", "피자 23000원 동생이랑 나눠 먹음", [e(23000)]], ["split", "과자 3000원 친구랑 나눠 먹었어", [e(3000)]],
  ["split", "아이 2명 간식 나눠 주려고 과자 6000원", [e(6000)]], ["split", "초밥 32000원 셋이 나눠 먹음", [e(32000)]],
  ["unit", "치킨 한마리 18000 콜라 2병 4000", [e(18000), e(4000)]], ["unit", "통닭 한마리 19000원 생맥 2잔 9000원", [e(19000), e(9000)]],
  ["unit", "족발 한마리 35000 소주 2병 10000", [e(35000), e(10000)]], ["unit", "마사지 6만원짜리 2시간 코스", [e(60000)]],
  ["discount", "편의점 1+1 할인 음료 2400원", [e(2400)]], ["discount", "GS25 할인 김밥 1500 라면 1800", [e(1500), e(1800)]],
  ["discount", "아이폰15 할인 받아서 120만원", [e(1200000)]],
  ["type_conflict", "택시 타서 20분 벌었다 15000원", [e(15000)]], ["type_conflict", "야근하고 들어왔다 택시 21000원", [e(21000)]],
  // 해석기가 ‘들어옴’ 을 수입으로 읽는 말 — 바탕 코드와 같다(안전망은 되묻지 않는다).
  ["type_conflict", "야근하고 택시 타고 들어옴 18000원", [`${TODAY}|18000|i`]],
  // 단위 없는 두 수 옆에 다른 금액이 있으면 범위로 보지 않는다. 해석기는 앞의 수도 기록으로 읽는다 — 바탕 코드와 같다.
  ["range", "24~25 시즌권 15만원", [e(24), e(150000)]], ["range", "운동화 250~255 고민하다 89000원", [e(250), e(255), e(89000)]],
  ["currency", "1파운드 스테이크 32000원", [e(32000)]], ["currency", "3파운드 연어 45000원", [e(45000)]],
  ["multi_date", "치킨 1/2마리 9000원\n피자 1/4판 7000원", [e(9000), e(7000)]], ["multi_date", "수박 1/2통 9000원\n무 1/3개 1500원", [e(9000), e(1500)]],
];
// type_conflict 막는 말(해석기가 반대 구분으로 읽던 꼴의 변형) — 되물은 뒤 단추 말로 다시 보내면 그 구분으로 한 건.
// ‘들어왔·벌었’ 은 같은 줄 앞에 돈 말(환불·청구·…비)이나 금액이 있을 때만 센다 — 그 꼴(뒤 둘)은 계속 되묻는다. 마지막 문장은 40자가 넘는다(예시를 자른다).
const MIXED_AMOUNT = { "지원금 30만원 입금됨": 300000, "보험금 12만원 들어왔다": 120000, "외주비 80만원 입금됐어": 800000, "레슨비 25만원 입금됐어요": 250000, "안 쓰는 가방 팔았다 4만원": 40000,
  "공연 끝나고 환불 안 되는 티켓 99000 결제함": 99000, "이자 받는 날이라 피자 시킴 21000": 21000, "환불 받으러 가는 길에 택시 9800원 냄": 9800,
  "환불된대서 반품했는데 오늘 들어왔네 32000원": 32000, "실손 청구한거 오늘 들어왔더라고요 54000원": 54000,
  "디자인 외주 작업비 80만원 오늘 드디어 입금됐어 ㅎㅎ 이번 달은 진짜 열심히 일했다": 800000 };
const MIXED = Object.keys(MIXED_AMOUNT);
// 늦은 답 장면: [보낸 말, 되묻는 가족(없으면 저장), 뒤 작업이 끝난 뒤 생긴 기록].
const LATE = [["4500원짜리 커피 2잔", "unit", []], ["지원금 30만원 입금됨", "mixed", []], ["피자 23000원 동생이랑 나눠 먹음", "", [e(23000)]], ["커피 4500, 기념품 20달러", "", [e(4500)]]];

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
  // 실제 섞인 말 확인 답(해석기가 섞인 말로 막는 문장)을 같은 경로로 받아, 예시·단추 말만 안전망 문장으로 바꾼 것과 안전망 답을 견준다.
  const real = [];
  for (const sentence of REAL_MIXED) {
    const r = await run(`real-${sentence}`, path, [sentence]);
    check(() => ok(r.addedPerTurn[0].length === 0 && r.replies[0].text.startsWith("수입인지 지출인지 헷갈려서 아직 저장하지 않았어요."), `${path} 실제 섞인 말 확인 답 ‘${sentence.slice(0, 16)}…’ — ${JSON.stringify(r.replies[0].text.slice(0, 60))}`), "mixed");
    real.push({ flat: sentence.replace(/\s+/g, " ").trim(), reply: r.replies[0] });
  }
  const exampleOf = (flat) => (flat.length > 40 ? `${flat.slice(0, 40)}…` : flat);
  for (const utterance of MIXED) {
    const asked = await run(`mixed-${utterance}`, path, [utterance]);
    const reply = asked.replies[0];
    const flat = utterance.replace(/\s+/g, " ").trim();
    const src = real[flat.length > 40 ? 1 : 0];
    check(() => eq(asked.addedPerTurn[0].length, 0, `${path} [type_conflict] ‘${utterance}’: 저장 없음 — ${JSON.stringify(asked.addedPerTurn[0])}`), "mixed");
    check(() => eq(reply.text, src.reply.text.split(exampleOf(src.flat)).join(exampleOf(flat)), `${path} [type_conflict] ‘${utterance}’: 안내 글이 실제 섞인 말 확인 답과 같다`), "mixed");
    check(() => eq(JSON.stringify(reply.labels), JSON.stringify(src.reply.labels), `${path} [type_conflict] ‘${utterance}’: 단추 이름이 실제 답과 같다`), "mixed");
    check(() => eq(JSON.stringify(reply.messages), JSON.stringify(src.reply.messages.map((m) => m.split(src.flat).join(flat))), `${path} [type_conflict] ‘${utterance}’: 단추가 보내는 말이 실제 답과 같은 꼴`), "mixed");
    check(() => eq(JSON.stringify(reply.messages), JSON.stringify([`지출 ${flat}`, `수입 ${flat}`]), `${path} [type_conflict] ‘${utterance}’: 단추가 보내는 말`), "mixed");
    for (const [word, type] of [["수입", "i"], ["지출", "e"]]) {
      const again = await run(`mixed-${word}-${utterance}`, path, [utterance, `${word} ${flat}`]);
      check(() => eq(JSON.stringify(again.addedPerTurn[1]), JSON.stringify([`${TODAY}|${MIXED_AMOUNT[utterance]}|${type}`]), `${path} [type_conflict] ‘${word} ${flat}’: ${word} 한 건 — ${again.replies[1].text.split("\n")[0].slice(0, 60)}`), "mixed");
    }
  }
  // 앞에 ‘기록’ 을 붙이거나 봇을 부른 말: 단추 말에는 붙인 말·부른 이름이 없고, 단추로 저장한 메모에도 없다.
  for (const said of ["기록 지원금 30만원 입금됨", "@말해가계부 지원금 30만원 입금됨"]) {
    const r = await run(`prefix-${said}`, path, [said, "수입 지원금 30만원 입금됨"]);
    check(() => eq(JSON.stringify(r.replies[0].messages), JSON.stringify(["지출 지원금 30만원 입금됨", "수입 지원금 30만원 입금됨"]), `${path} ‘${said}’: 단추 말에 붙인 말이 없다`), "prefix");
    check(() => ok(r.addedPerTurn[0].length === 0 && JSON.stringify(r.addedPerTurn[1]) === JSON.stringify([`${TODAY}|300000|i`]) && r.memos.every((memo) => !/기록|수입|말해가계부|@/.test(memo)), `${path} ‘${said}’ → 단추: 수입 한 건, 메모 ${JSON.stringify(r.memos)}`), "prefix");
  }
  // 장면: 별도 구매 추가는 원래 기록과 같은 한 건을 하나 더 넣는 명령이라 안전망을 거치지 않는다. 단가 꼴은 원래 기록이 생기지 않아 후보도 없다.
  {
    const u = await run("separate-unit", path, ["4500원짜리 커피 2잔", "별도 구매 추가 4500원짜리 커피 2잔"]);
    check(() => ok(JSON.stringify(u.addedPerTurn) === "[[],[]]" && u.replies[0].text.startsWith(TEXT.unit) && u.replies[1].text.includes("같은 내용으로 저장된 원래 기록을 확인하지 못했어요"), `${path} 별도 구매 추가(단가 꼴): 되묻고, 원래 기록이 없어 후보도 없다 — ${JSON.stringify(u.replies[1].text.slice(0, 40))}`), "scene");
    const s = await run("separate-plain", path, ["커피 2잔 4500원", "별도 구매 추가 4500원짜리 커피 2잔"]);
    check(() => ok(JSON.stringify(s.addedPerTurn) === JSON.stringify([[e(4500)], []]) && s.replies[1].text.startsWith("같은 내용의 별도 구매 후보입니다."), `${path} 별도 구매 추가(원래 기록 있음): 안전망이 아니라 별도 구매 후보 — ${JSON.stringify(s.replies[1].text.slice(0, 40))}`), "scene");
  }
  // 장면: 예산 명령은 기록 경로가 아니다(‘20~30만원’ 이 들어도 범위 되묻기가 아니라 예산 안내).
  {
    const r = await run("budget", path, ["예산 식비 300000", "예산 외식 20~30만원"]);
    check(() => ok(JSON.stringify(r.addedPerTurn) === "[[],[]]" && r.replies[0].text.includes("식비 예산을 설정했어요") && !r.replies[1].text.startsWith(TEXT.range), `${path} 예산 명령: 기록 없음, 예산 안내 — ${JSON.stringify(r.replies[1].text.slice(0, 30))}`), "scene");
  }
  // 장면: 열린 고치기 세션 뒤의 새 기록이 안전망에 걸리면 ‘수정은 끝냈어요’ 와 그 되묻기 하나로 답하고, 고치던 기록은 그대로다.
  for (const [said, kind] of [["치킨 2마리 개당 18000", "unit"], ["지원금 30만원 입금됨", "mixed"]]) {
    const r = await run(`edit-${said}`, path, ["커피 4500", "수정 01번", said]);
    const reply = r.replies[2];
    const body = kind === "mixed" ? "수입인지 지출인지 헷갈려서 아직 저장하지 않았어요." : TEXT[kind];
    check(() => ok(JSON.stringify(r.addedPerTurn) === JSON.stringify([[e(4500)], [], []]) && reply.text.startsWith(`✏️ 01번 수정은 끝냈어요.\n${body}`), `${path} 고치기 세션 뒤 ‘${said}’ — ${JSON.stringify(reply.text.slice(0, 60))}`), "scene");
    check(() => eq(JSON.stringify(reply.labels), JSON.stringify(kind === "mixed" ? ["지출로 기록", "수입으로 기록"] : ONE), `${path} 고치기 세션 뒤 ‘${said}’: 단추`), "scene");
  }
  // 장면: 응답 예산을 넘긴 늦은 답과 뒤에서 끝난 저장이 같은 말을 한다(되묻는 말은 늦은 답도 되묻고 저장이 없다, 저장되는 말은 ‘늦어지고 있어요’ 뒤에 저장된다).
  for (const [said, kind, rows] of LATE) {
    const r = await run(`late-${said}`, path, [said], { late: true });
    const reply = r.replies[0];
    const head = kind === "mixed" ? "수입인지 지출인지 헷갈려서 아직 저장하지 않았어요." : kind ? TEXT[kind] : "기록 저장 확인이 조금 늦어지고 있어요";
    check(() => ok(reply.result === "deferred" && reply.text.startsWith(head), `${path} 늦은 답 ‘${said}’: ${reply.result} — ${JSON.stringify(reply.text.slice(0, 50))}`), "late");
    check(() => eq(JSON.stringify(r.addedPerTurn[0]), JSON.stringify(rows), `${path} 늦은 답 ‘${said}’: 뒤 작업이 끝난 뒤 기록`), "late");
  }
  // 기존 안전망이 먼저다: 고치는 말·읽지 못한 날짜 말이 함께 든 말은 그 안내다. 카드 승인 문자로 읽힌 기록은 예전처럼 저장한다.
  // 분수에 세는 말이 붙은 ‘1/2판·1/4조각’ 을 쉼표로 이은 말은 해석기가 날짜로 읽어 예전처럼 ‘달력에 없는 날짜’ 로 답한다(여러 날짜 되묻기가 아니다).
  for (const [utterance, needle] of [["아까 커피 4500~5000 아니고 5500이야 고쳐줘", "기록을 고치거나 지우려는 말로 보여서"], ["지난주 치킨 2마리 각 19000", "날짜로 보이는 ‘지난주’ 부분을 읽지 못해서"],
    ["피자 1/2판 12000원, 케이크 1/4조각 8000원", "달력에 없는 날짜여서"]]) {
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
const TIME_SEEDS = ["ㅋ", "1", "~", "만", " ", "1 ", "1~", "1만 ", "쿠폰1 ", "나 1 ", "3일 ", "들어왔길래 ", "1씩 ", "총1 ", "냄 ", "1/1 ",
  "2마리 한마리 100 ", "2개 100씩 ", "나눠 ", "들어왔 "];
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
