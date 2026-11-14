// V22.9.122 (출시 전 점검 2026-11-14) — 조정자가 직접 고친 것의 검사.
//   K-1  카드 승인 문자 한 통 읽기(nlu/transaction-parser.js readCardApprovalSmsV229122)와 알림 문자 안전망(kakao/request-guards.js kakaoGuardNoticeV229122)
//   INJ-1 금액 하나만 받는 웹 폼 칸(정기 규칙·정기 수입·지출)에 띄어 쓴 수(‘1 000’)가 1원으로 저장되던 것
//   INJ-2 /u/api/favorites·/u/api/goals 에 JSON null 본문을 보내면 500 이던 것
//   F-1  DB 가 잠깐 답하지 못할 때 로그인한 사람이 로그인 화면을 보던 것 → ‘잠시 뒤 다시’ 안내(503)
// 네트워크를 쓰지 않는다(메모리 픽스처). 시계는 2026-11-10(화) 12:00 KST 로 묶는다.
import fs from "node:fs";
import { app, BASE, ctx, counter, fixture, intercept, failure, withClock, page, post, skill, putSetting } from "./lib-audit-v22934.mjs";

const check = counter("prelaunch sweep fixes");
const HOME = "house-home";
const resetIsolate = () => { for (const key of Object.keys(globalThis)) if (key.startsWith("__AB_") && key !== "__AB_QA_FIXED_NOW_MS") delete globalThis[key]; };

// 카카오 1:1 한 마디를 새 픽스처에 보내고 답과 새로 생긴 기록을 돌려준다.
async function say(utterance, day = "2026-11-10") {
  return withClock(day, () => fixture(async (fx) => {
    resetIsolate();
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HOME);
    const before = new Set(fx.db.transactions.map((row) => row.id));
    const reply = await skill(fx, utterance);
    const added = fx.db.transactions.filter((row) => !before.has(row.id)).map((row) => ({ date: row.transaction_date, type: row.type, amount: Number(row.amount), memo: row.memo || "", payment: row.payment_method || "" }));
    return { reply, added };
  }));
}
const one = (result, label, expected) => {
  check.eq(result.added.length, 1, `${label}: 한 건만 저장 (${JSON.stringify(result.added)} / ${result.reply.split("\n")[0]})`);
  const row = result.added[0] || {};
  check.eq(row.date, expected.date, `${label}: 날짜`);
  check.eq(row.amount, expected.amount, `${label}: 금액`);
  check.eq(row.type, expected.type || "expense", `${label}: 구분`);
  if (expected.memo !== undefined) check.eq(row.memo, expected.memo, `${label}: 메모`);
  if (expected.payment !== undefined) check.eq(row.payment, expected.payment, `${label}: 결제수단`);
};
const none = (result, label, needle) => {
  check.eq(result.added.length, 0, `${label}: 저장하지 않음 (${JSON.stringify(result.added)})`);
  check.ok(result.reply.includes(needle), `${label}: 답에 ‘${needle}’ (${result.reply.split("\n")[0]})`);
  check.ok(!/https?:\/\//.test(result.reply), `${label}: 답 글에 주소 없음`);
};

// ── K-1 ① 카드 승인 문자 한 통 ────────────────────────────────────────────────
one(await say("[Web발신]\n삼성1234승인 홍*동\n45,000원 일시불\n11/09 19:22 교촌치킨\n누적532,000원"), "삼성 꼴", { date: "2026-11-09", amount: 45000, memo: "교촌치킨", payment: "삼성카드" });
one(await say("[Web발신]\nKB국민카드 5678 승인\n김*수님\n32,000원 일시불\n11/09 14:22 GS25 역삼점\n누적 1,234,560원"), "국민 꼴(띄어 쓴 끝 번호)", { date: "2026-11-09", amount: 32000, memo: "GS25 역삼점", payment: "국민카드" });
one(await say("[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n10/28 19:42\n이마트\n누적1,234,560원"), "날짜 줄 다음 줄이 쓴 곳", { date: "2026-10-28", amount: 45000, memo: "이마트", payment: "신한카드" });
one(await say("[Web발신]\n하나카드(8*2*) 승인\n김*수\n780원 일시불\n11/09 08:12 GS25\n누적 1,234,560원"), "가린 끝 번호·작은 금액", { date: "2026-11-09", amount: 780, memo: "GS25" });
one(await say("[Web발신]\n하나카드(4821)승인\n김*수\n23,800원 일시불\n2026.11.08 19:42\n교보문고\n누적 412,300원"), "해가 붙은 날짜", { date: "2026-11-08", amount: 23800, memo: "교보문고" });
one(await say("매달 이거 나감 ㅋ\n[Web발신]\n현대카드 5678 승인\n김*수\n14,900원 일시불\n11/08 09:00 넷플릭스(정기)\n누적 1,234,560원"), "앞에 붙인 덧말", { date: "2026-11-08", amount: 14900, payment: "현대카드" });
one(await say("[Web발신]\n현대카드 M 승인\n이*희\n660,000원 06개월\n11/09 15:02\n하이마트"), "할부", { date: "2026-11-09", amount: 660000, memo: "하이마트" });
one(await say("NH농협카드 승인\n박*진\n7,700원 체크\n11/09 08:15\n이디야\n잔액 352,100원"), "체크·잔액", { date: "2026-11-09", amount: 7700, memo: "이디야" });
one(await say("[Web발신]\n가나카드(5678)승인\n홍*동\n11/08 21:14\n38,500원 일시불\n누적 412,300원\n○○치킨"), "쓴 곳이 맨 끝 줄", { date: "2026-11-08", amount: 38500, memo: "○○치킨" });
one(await say("어제 밤에 택시탐ㅠ\n하나 1357 승인 23,000원 11/09 23:58 카카오T"), "한 줄 문자 + 덧말(끝 번호가 금액이 되던 꼴)", { date: "2026-11-09", amount: 23000, memo: "카카오T" });
one(await say("10월 31일 문자 이제 봤네 ㅠ\nBC카드 3344 승인 120,000원 10/31 20:40 아웃백"), "덧말의 날짜와 문자의 날짜가 같음", { date: "2026-10-31", amount: 120000, memo: "아웃백" });
one(await say("[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n12/30 19:42\n이마트\n누적1,234,560원", "2027-01-02"), "해 없는 날짜가 앞날이면 지난해", { date: "2026-12-30", amount: 45000, memo: "이마트" });
one(await say("[가상카드] 11/10 12:31 승인 23,000원 일시불 김*수 누적 412,000원"), "쓴 곳 없는 문자", { date: "2026-11-10", amount: 23000 });
// 깨끗이 읽지 못해도 예전 길의 결과가 문자와 같으면 예전대로 저장한다.
one(await say("삼성카드 1111 승인 1,290,000원 12개월 11/02 애플스토어\n아이폰 17 질렀다 ㅎㅎ"), "숫자 든 덧말(예전 길과 같음)", { date: "2026-11-02", amount: 1290000 });
one(await say("이거 반은 친구가 줄거임\n현대카드 승인 48,000원 11/08 누적 900,000"), "정산 말 든 덧말(예전 길과 같음)", { date: "2026-11-08", amount: 48000 });
// 문자의 금액·날짜와 다르게 읽히면 저장하지 않고 되묻는다.
{
  const result = await say("[Web발신]\n하나카드(5678) 승인\n42,000원 일시불\n11/08 21:14\n고기마을 누적 812,300원\n이거 셋이 나눠서 난 14000만");
  none(result, "덧말에 다른 금액", "문자에 적힌 날짜(11월 8일)");
  check.ok(!/\d원/.test(result.reply.split("\n").slice(1).join(" ")) && !result.reply.includes("이마트"), "덧말에 다른 금액: 여러 건이면 예시 없이 순서만 알린다");
}
// 승인 문자가 아닌 말은 예전 그대로다.
one(await say("점심 12000원"), "평범한 기록", { date: "2026-11-10", amount: 12000, memo: "점심" });
one(await say("롯데카드 승인 4,300 11/10 GS25"), "원 없는 한 줄 문자(예전 길)", { date: "2026-11-10", amount: 4300 });
one(await say("[카카오뱅크] 11/05 출금 132,000원 관리비 잔액 845,210원"), "한 줄 출금 문자(예전 길)", { date: "2026-11-05", amount: 132000 });
{
  const two = await say("국민카드 5678 승인 4,500원 11/10 08:12 메가커피 누적 302,000\n국민카드 5678 승인 9,000원 11/10 11:30 김밥천국 누적 311,000");
  check.deepEq(two.added.map((row) => row.amount).sort((a, b) => a - b), [4500, 9000], "문자 두 통은 예전 길 그대로 두 건");
}

// ── K-1 ② 알림 문자 안전망 ────────────────────────────────────────────────────
none(await say("[국민] 승인거절 잔액부족 35,000원 11/10 쿠팡 ㅠ"), "승인 거절", "결제나 출금이 되지 않았다는 알림");
none(await say("[신한] 11/10 자동이체 출금불능 55,000원 사유:잔액부족\n헐 이거 뭐야"), "출금 불능", "결제나 출금이 되지 않았다는 알림");
none(await say("국민카드 3355 승인번호 77881234 23,500원 교보문고"), "승인번호", "카드 끝 번호나 승인번호");
none(await say("[KB국민] 승인번호 04821733\n11월 05일 13:22\n42,000원 일시불\n롯데마트"), "승인번호(여러 줄)", "카드 끝 번호나 승인번호");
none(await say("두개 한번에 넣어줘\n[BC]7788 승인 54,000원 11/08 이마트 누적 640,000원\n[BC]7788 승인 23,000원 11/09 다이소 누적 663,000원"), "끝 번호가 금액으로", "카드 끝 번호나 승인번호");
none(await say("[Web발신]\n신한카드(1234)취소\n김*수\n45,000원\n11/08 14:22\n올리브영"), "취소 문자", "결제·승인 취소 내역으로 보여");
none(await say("[IBK기업] 2026.11.05 14:30 체크취소 25,000원 다이소 잔액 520,000원"), "체크취소", "결제·승인 취소 내역으로 보여");
none(await say("[삼성카드] 부분취소 12,000원 11/05 무신사 누적 488,000원"), "부분취소", "결제·승인 취소 내역으로 보여");
none(await say("[NH농협] 11/09 출금취소 33,000원 잔액 400,100원"), "출금취소", "결제·승인 취소 내역으로 보여");
none(await say("정산 받은거 기록 ㄱㄱ\n[토스] 최*영님이 25,000원을 보냈어요 잔액 401,250원"), "받은 돈 알림", "받은 돈 알림으로 보이는데");
{
  const out = await say("[Web발신]\n신한체크 출금 8,900원\n11/09 14:11 스타벅스\n잔액 152,340원");
  none(out, "출금 문자의 날짜", "문자에 적힌 날짜(11월 9일)");
  check.ok(out.reply.includes("11월 9일 쓴곳 8900원") && !out.reply.includes("이마트"), "출금 문자의 날짜: 예시(지어낸 가게 이름 없음)");
  one(await say("11월 9일 쓴곳 8900원"), "출금 예시를 그대로 보내면", { date: "2026-11-09", amount: 8900, memo: "쓴곳" });
  const income = await say("[Web발신]\n[국민은행] 11/09 14:22\n입금 2,500,000원\n급여\n잔액 3,120,450원");
  none(income, "입금 문자의 날짜", "문자에 적힌 날짜(11월 9일)");
  check.ok(income.reply.includes("11월 9일 수입 2500000원"), "입금 문자의 날짜: 수입 예시");
  one(await say("11월 9일 수입 2500000원"), "입금 예시를 그대로 보내면", { date: "2026-11-09", amount: 2500000, type: "income" });
}
for (const text of ["잔액 3만원 남음", "통장 잔액 32만", "누적 120만원", "카페 4800원 잔액21만", "체크카드 잔액 32만원 남았는데 마트에서 54000 씀ㅜ", "점심 8000원 잔액 12만 3천원", "한도 500만원 남음"]) none(await say(text), `한글 단위 잔액 ‘${text}’`, "잔액·누적·한도 금액이 기록으로 읽힐 수 있어서");
one(await say("카페 4800원"), "잔액 안내의 예시를 그대로 보내면", { date: "2026-11-10", amount: 4800, memo: "카페" });
one(await say("토스 잔액 152,340원 남아서 커피 4500원 삼"), "숫자와 원으로 적은 잔액은 예전 그대로", { date: "2026-11-10", amount: 4500 });
// 안전망이 평범한 말을 막지 않는다.
one(await say("카드 취소하러 은행 갔다가 커피 4500원"), "취소하러(알림 아님)", { date: "2026-11-10", amount: 4500 });
one(await say("체크카드 취소 수수료 3000원"), "취소 수수료(알림 아님)", { date: "2026-11-10", amount: 3000 });
one(await say("11/5 관리비 132000원 냈고 잔액 845210원"), "잔액을 함께 적은 기록", { date: "2026-11-05", amount: 132000 });
one(await say("어제 받은 문자임 커피ㅋ\nNH카드 승인 4,500원 메가커피 잔여한도 2,345,500원"), "날짜 없는 문자는 덧말의 날짜 말을 따르는 예전 길", { date: "2026-11-09", amount: 4500 });

// ── K-1 ③ 독립 검토 1에서 나온 것 ───────────────────────────────────────────────
// (1) 해 없는 앞날 날짜를 지난해로 옮기지 않는다(새해 무렵만 예외). 예전 길과 같은 결과여야 한다.
one(await say("11/15 14:00 카드 승인 예정 노트북 1200000원"), "앞날 날짜 + 승인 예정(예전 길)", { date: "2026-11-15", amount: 1200000 });
one(await say("12/1 승인 6개월 할부 아이폰 1500000원"), "앞날 날짜 + 할부(예전 길)", { date: "2026-12-01", amount: 1500000 });
{
  const tomorrow = await say("[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n11/11 19:42\n이마트\n누적1,234,560원");
  check.ok(tomorrow.added.every((row) => row.date >= "2026-01-01"), "내일 날짜 문자를 지난해로 저장하지 않는다 (" + JSON.stringify(tomorrow.added) + ")");
  const spring = await say("[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n12/30 19:42\n이마트\n누적1,234,560원", "2026-03-10");
  check.ok(spring.added.every((row) => row.date >= "2026-01-01"), "3월에 붙인 12/30 문자를 지난해로 저장하지 않는다 (" + JSON.stringify(spring.added) + ")");
  const due = await say("[Web발신]\n현대카드 승인\n김*수\n45,000원 일시불\n이마트\n결제일 11/25");
  check.ok(due.added.every((row) => row.date >= "2026-01-01"), "‘결제일 11/25’ 를 지난해 결제 날짜로 저장하지 않는다 (" + JSON.stringify(due.added) + ")");
}
// (2) 문자 꼴 글의 앞날 날짜를 날짜 어긋남으로 막지 않는다(예전처럼 저장).
one(await say("12/25 크리스마스 선물 50000원 잔액 120000원"), "앞날 날짜 + 잔액(예전 길)", { date: "2026-12-25", amount: 50000 });
// (3) 되묻는 답의 예시에 지어낸 금액·가게 이름이 없다.
for (const text of ["[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n11/09 19:42\n교촌치킨\n포인트사용 5,000원", "현대카드 승인 4,500원 11/09 19:42 스타벅스 2잔 9000원", "두개 한번에 넣어줘\n[BC]7788 승인 54,000원 11/08 이마트 누적 640,000원\n[BC]7788 승인 23,000원 11/09 다이소 누적 663,000원"]) {
  const out = await say(text);
  if (!out.added.length) check.ok(!/42000|이마트 \d/.test(out.reply), "예시에 지어낸 금액·가게 없음: " + out.reply.replace(/\n/g, " / ").slice(0, 120));
  else check.ok(true, "저장됨(예전 길): " + JSON.stringify(out.added));
}
// 수입으로 읽히는 말은 예전처럼 수입으로 저장한다.
one(await say("11/9 14:30 승인 월급 3000000원"), "승인 + 월급(예전 길 = 수입)", { date: "2026-11-09", amount: 3000000, type: "income" });
// (4) 문자 뒤에 한글 수로 적은 둘째 기록을 말없이 버리지 않는다.
for (const text of ["[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n11/09 19:42\n이마트\n누적1,234,560원\n그리고 택시 만원", "택시 만원\n[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n11/09 19:42\n이마트"]) {
  const out = await say(text);
  const taxi = out.added.some((row) => row.amount === 10000);
  check.ok(taxi || out.added.length === 0, "둘째 기록(택시 만원)이 저장되거나 전체를 되묻는다 — 한 건만 저장하고 끝내지 않는다 (" + JSON.stringify(out.added) + " / " + out.reply.split("\n")[0] + ")");
}
// (5) 결제가 안 돼 다른 방법으로 냈다는 말은 알림이 아니다.
one(await say("카드 승인 거절돼서 현금으로 점심 9000원"), "승인 거절 이야기 + 실제 지출", { date: "2026-11-10", amount: 9000 });
one(await say("결제 실패해서 현금 냄 택시 15000원"), "결제 실패 이야기 + 실제 지출", { date: "2026-11-10", amount: 15000 });
// (6) ‘카드 취소’ 로 끝난 줄 다음의 평범한 기록을 막지 않는다.
{
  const out = await say("어제 쿠팡 카드 취소\n오늘 점심 9000원");
  check.ok(out.added.some((row) => row.amount === 9000), "카드 취소 줄 다음 기록은 저장 (" + JSON.stringify(out.added) + " / " + out.reply.split("\n")[0] + ")");
}
// (7) 카드사를 모르는 ‘카드’ 도 결제수단으로 남는다.
one(await say("회사 카드 승인 11/9 택시 23000원 14:30"), "카드사 없는 카드", { date: "2026-11-09", amount: 23000, payment: "카드" });

// ── K-1 ④ 독립 검토 2에서 나온 것 ───────────────────────────────────────────────
const SMS = "[Web발신]\n신한카드(1234)승인\n김*수\n45,000원 일시불\n11/09 19:42\n";
// (1) ‘승인’ 바로 앞이 카드 이름이 아니면 승인 문자가 아니다 — 수입으로 읽히던 말은 수입 그대로다.
one(await say("11/9 14:30 월급 승인 3000000원"), "월급 승인(수입 그대로)", { date: "2026-11-09", amount: 3000000, type: "income" });
one(await say("환급 승인 45,000원 11/09 19:22"), "환급 승인(수입 그대로)", { date: "2026-11-09", amount: 45000, type: "income" });
{
  const cafe = await say("스타벅스 승인 4,500원 11/09 19:42");
  check.ok(cafe.added.length === 1 && cafe.added[0].amount === 4500 && cafe.added[0].memo.includes("스타벅스"), "가게 이름 + 승인은 예전 길(메모에 가게 이름): " + JSON.stringify(cafe.added));
}
// (2) 쓴 곳 줄이나 같은 줄에 따로 선 숫자·금액 말이 있으면 한 건만 저장하고 끝내지 않는다(둘 다 저장하거나 전체를 되묻는다).
for (const tail of ["교촌치킨 택시 8000", "교촌치킨 택시 8000 커피 4500", "교촌치킨 택시 8천", "이마트 커피 4500", "교촌치킨 택시 만원"]) {
  const out = await say(SMS + tail);
  check.ok(out.added.length !== 1, "문자 + 덧붙인 기록 ‘" + tail + "’: 한 건만 저장하지 않는다 (" + JSON.stringify(out.added) + " / " + out.reply.split("\n")[0] + ")");
}
{
  const total = await say("[Web발신] 신한카드 승인 김*수 일시불 45,000 11/09 19:42 이마트 이번달 이용 532,000원");
  check.ok(!(total.added.length === 1 && total.added[0].amount === 532000), "원 없는 승인 금액 + 이용 누계: 누계만 저장하지 않는다 (" + JSON.stringify(total.added) + ")");
}
// 이름에 붙은 숫자·금액 말은 쓴 곳 이름이다.
one(await say(SMS + "만원의행복"), "가게 이름 ‘만원의행복’", { date: "2026-11-09", amount: 45000, memo: "만원의행복" });
one(await say(SMS + "천원샵 역삼점"), "가게 이름 ‘천원샵 역삼점’", { date: "2026-11-09", amount: 45000, memo: "천원샵 역삼점" });
one(await say(SMS + "11번가"), "가게 이름 ‘11번가’", { date: "2026-11-09", amount: 45000, memo: "11번가" });
// (바로 앞 사례와 같은 말로 정리되면 되풀이 안전망이 ‘방금 처리했어요’ 로 답하므로 금액이 다른 문자를 쓴다.)
one(await say("[Web발신]\n신한카드(1234)승인\n김*수\n25,000원 일시불\n11/09 12:10\n[11번가]"), "꺾쇠 안의 가게 이름", { date: "2026-11-09", amount: 25000, memo: "11번가" });
// (3) 빈칸이 아주 긴 글에서도 안전망 정규식이 오래 걸리지 않는다: 새 정규식의 빈칸 되풀이에는 모두 상한이 있다.
{
  const guards = fs.readFileSync(new URL("../src/modules/kakao/request-guards.js", import.meta.url), "utf8");
  const from = guards.indexOf("const KAKAO_NOTICE_ISSUERS_V229122");
  const to = guards.indexOf("function kakaoRecordGuardV229120(utterance, parsedList");
  check.ok(from > 0 && to > from, "알림 문자 안전망 블록을 찾는다");
  const unbounded = guards.slice(from, to).split("\n").filter((line) => /\\s[*+](?!\?)|\[ \\t\][*+]|\\\\s[*+]/.test(line) && !/^\s*\/\//.test(line));
  check.eq(unbounded.length, 0, "알림 문자 안전망의 빈칸 되풀이에 상한이 없는 줄: " + unbounded.map((line) => line.slice(0, 60)).join(" | "));
  const long = await say("커피 4500원 카드" + " ".repeat(1470) + "x");
  check.ok(long.added.length <= 1, "빈칸이 긴 글도 답한다");
}
// (4) 실패 알림은 알림 문자 꼴일 때만 막는다 — 이야기로 쓴 실제 지출은 저장한다.
for (const [text, amount] of [["잔액 3000원이라 승인 거절, 현금으로 커피 4500원", 4500], ["[메모] 결제실패 후 재결제 배민 23000원", 23000], ["출금불능 떠서 14:00에 다시 이체 월세 500000원", 500000], ["(회사) 승인거절 나서 개인카드로 점심 9000원", 9000], ["(어제) 결제 실패해서 현금으로 택시 15000원", 15000]]) {
  const out = await say(text);
  check.ok(out.added.some((row) => row.amount === amount), "실패 이야기 + 실제 지출 ‘" + text.slice(0, 24) + "’: 저장 (" + JSON.stringify(out.added) + " / " + out.reply.split("\n")[0] + ")");
}
// (5) 거부·불가·미승인 알림도 승인으로 저장하지 않는다.
none(await say("[Web발신]\n현대카드 승인 거부\n김*수\n45,000원\n11/09 19:42\n이마트"), "승인 거부", "결제나 출금이 되지 않았다는 알림");
none(await say("[Web발신]\n신한카드(1234)승인불가\n김*수\n45,000원 11/09 19:42\n이마트 한도초과"), "승인불가", "결제나 출금이 되지 않았다는 알림");
none(await say("[Web발신]\n신한카드(1234) 미승인\n김*수\n45,000원 11/09 19:42\n이마트 (잔액부족)"), "미승인", "결제나 출금이 되지 않았다는 알림");
// (6) 금액이 승인 앞에 온 평범한 말·건수가 뒤따르는 취소 이야기는 막지 않는다.
{
  const parking = await say("주차 2000 승인 점심 8000");
  check.deepEq(parking.added.map((row) => row.amount).sort((a, b) => a - b), [2000, 8000], "‘주차 2000 승인 점심 8000’ 은 두 건 그대로");
  const count = await say("카드 취소 2건 처리하고 점심 9000원");
  check.ok(count.added.some((row) => row.amount === 9000), "‘카드 취소 2건 처리하고 점심 9000원’ 은 저장 (" + JSON.stringify(count.added) + " / " + count.reply.split("\n")[0] + ")");
}
// (7) 받은 돈 알림의 답은 내 금액으로 예시를 든다(지어낸 금액 없음).
{
  const got = await say("[토스] 최*영님이 50,000원을 보냈어요 잔액 401,250원");
  none(got, "받은 돈 알림(5만원)", "받은 돈 알림으로 보이는데");
  check.ok(got.reply.includes("수입 50000원") && !got.reply.includes("25000"), "받은 돈 알림: 예시는 내 금액");
}

// ── INJ-1 금액 하나만 받는 웹 폼 칸 ─────────────────────────────────────────────
const recurringRules = (fx) => fx.db.accountbook_settings.filter((row) => /recurring/i.test(String(row.key || "")) && JSON.stringify(row.value ?? "").includes("월세점검"));
for (const [amount, stored] of [["1 000", null], ["10 000", null], ["1 500 000", null], ["12 000원", null], ["3,000원~5,000원", null], ["12,000", 12000], ["3만", 30000], ["5,000원", 5000], ["월 30만원", 300000]]) {
  await fixture(async (fx) => {
    const before = JSON.stringify(fx.db);
    const saved = await post(fx, "/my/recurring/save", { household_id: HOME, month: "2026-07", type: "expense", memo: "월세점검", amount, category: "주거", payment_method: "", day_of_month: "5" });
    if (stored === null) {
      check.ok(saved.decoded.includes("err=recurring_missing"), `정기 규칙 금액 ‘${amount}’: 금액 오류로 돌아감 (${saved.decoded})`);
      check.eq(JSON.stringify(fx.db), before, `정기 규칙 금액 ‘${amount}’: 저장하지 않음`);
    } else {
      check.ok(saved.decoded.includes("msg=recurring_saved"), `정기 규칙 금액 ‘${amount}’: 저장 (${saved.decoded})`);
      check.ok(new RegExp(`"amount":${stored}[,}]`).test(JSON.stringify(fx.db).replace(before, "")) || JSON.stringify(fx.db).includes(`"amount":${stored}`) || JSON.stringify(fx.db).includes(`\\"amount\\":${stored}`), `정기 규칙 금액 ‘${amount}’: ${stored}원으로 저장`);
    }
  });
}
{
  const settings = fs.readFileSync(new URL("../src/modules/my/settings-page.js", import.meta.url), "utf8");
  const reserve = fs.readFileSync(new URL("../src/modules/settings/reserve-plans.js", import.meta.url), "utf8");
  check.eq(settings.split('parseSingleAmountFieldV229122(form.get("amount")').length - 1, 2, "정기 규칙 저장·후보 확정 두 곳이 한 금액 칸 읽기를 쓴다");
  check.eq(reserve.split('parseSingleAmountFieldV229122(form.get("amount")').length - 1, 2, "정기 수입·지출 추가·수정 두 곳이 한 금액 칸 읽기를 쓴다");
  check.ok(!/parseAmountValue\(form\.get\("amount"\)/.test(settings + reserve), "웹 폼 금액 칸에 대화용 금액 읽기를 직접 쓰지 않는다");
}

// ── INJ-2 JSON null 본문 ───────────────────────────────────────────────────────
await fixture(async (fx) => {
  for (const path of ["/u/api/favorites", "/u/api/goals"]) {
    for (const body of ["null", "[]", "\"text\"", "7"]) {
      const response = await app.fetch(new Request(BASE + path, { method: "POST", headers: { cookie: fx.cookie, "content-type": "application/json", accept: "application/json", origin: BASE, "sec-fetch-site": "same-origin" }, body }), fx.env, ctx);
      check.ok(response.status >= 400 && response.status < 500, `${path} 본문 ${body}: 4xx (${response.status})`);
    }
  }
});

// ── F-1 로그인 확인을 잠깐 못 할 때 ─────────────────────────────────────────────
const usersDown = (kind) => intercept(({ url, method }) => {
  if (!/\/rest\/v1\/users\b/.test(url.pathname) || method !== "GET") return null;
  if (kind === "throw") throw new TypeError("fetch failed");
  return failure(kind === "500" ? 500 : 503);
});
const quiet = async (task) => { const previous = console.error; console.error = () => {}; try { return await task(); } finally { console.error = previous; } };
await quiet(async () => {
  for (const kind of ["503", "500", "throw"]) {
    await fixture(async (fx) => {
      resetIsolate();
      const undo = usersDown(kind);
      try {
        for (const path of ["/app?month=2026-07&household_id=house-home", "/my", "/reports", "/my/settings", "/menu"]) {
          const shown = await page(fx, path);
          check.eq(shown.status, 503, `DB 실패(${kind}) ${path}: 503 안내`);
          check.ok(shown.html.includes("로그인 상태를 잠시 확인하지 못했어요") && shown.html.includes("로그아웃된 것은 아니에요"), `DB 실패(${kind}) ${path}: 안내 글`);
          check.eq(shown.location, "", `DB 실패(${kind}) ${path}: 로그인 화면으로 보내지 않음`);
          check.ok(!/set-cookie/i.test(shown.setCookie) && !/ab_user=;/.test(shown.setCookie), `DB 실패(${kind}) ${path}: 세션 쿠키를 지우지 않음`);
          check.ok(!/supabase|rest\/v1|fetch failed|simulated/i.test(shown.html), `DB 실패(${kind}) ${path}: 내부 글자 없음`);
        }
        // 공개 화면은 로그인한 쿠키가 있어도 그대로 열린다.
        for (const path of ["/", "/faq", "/kakao-guide"]) check.eq((await page(fx, path)).status, 200, `DB 실패(${kind}) 공개 화면 ${path}: 200`);
        // 로그인하지 않은 사람·서명이 틀린 쿠키는 예전처럼 로그인 화면이다.
        const anonymous = await page(fx, "/my", { cookie: "" });
        check.eq(anonymous.status, 200, `DB 실패(${kind}) 쿠키 없음 /my: 로그인 화면 200`);
        check.ok(!anonymous.html.includes("로그인 상태를 잠시 확인하지 못했어요"), `DB 실패(${kind}) 쿠키 없음 /my: 안내 화면 아님`);
        const forged = await page(fx, "/app", { cookie: fx.cookie.slice(0, -4) + "AAAA" });
        check.ok(forged.status !== 503, `DB 실패(${kind}) 서명 틀린 쿠키 /app: 503 안내 아님 (${forged.status})`);
        // JSON API 는 그대로 JSON 으로 답한다.
        const json = await app.fetch(new Request(BASE + "/u/api/tx/recent?household=house-home", { headers: { cookie: fx.cookie, accept: "application/json" } }), fx.env, ctx);
        check.ok(!String(json.headers.get("content-type") || "").includes("text/html"), `DB 실패(${kind}) JSON API: HTML 안내가 아님 (${json.status})`);
        // 폼 제출: 저장하지 않고 안내를 보인다.
        const before = JSON.stringify(fx.db);
        const posted = await post(fx, "/my/recurring/save", { household_id: HOME, month: "2026-07", type: "expense", memo: "월세점검", amount: "500000", category: "주거", payment_method: "", day_of_month: "5" });
        check.eq(posted.status, 503, `DB 실패(${kind}) 폼 제출: 503 안내`);
        check.ok(posted.text.includes("방금 보낸 내용은 저장되지 않았어요"), `DB 실패(${kind}) 폼 제출: 저장되지 않았다는 글`);
        check.eq(JSON.stringify(fx.db), before, `DB 실패(${kind}) 폼 제출: DB 그대로`);
      } finally { undo(); }
      // DB 가 돌아오면 같은 쿠키로 바로 열린다.
      resetIsolate();
      const back = await page(fx, "/app?month=2026-07&household_id=house-home");
      check.eq(back.status, 200, `DB 복구 뒤(${kind}) /app: 200`);
    });
  }
});
// 독립 검토 1: 다시 열기 주소는 경로와 달·가계부·탭 값만 싣는다. 쿠키 없는 사람의 로그인 길은 안내 화면 대상이 아니다.
await quiet(async () => {
  await fixture(async (fx) => {
    resetIsolate();
    const undo = usersDown("503");
    try {
      const shown = await page(fx, "/app?month=2026-07&household_id=house-home&code=SECRETCODE&state=SECRETSTATE&foo=abcdefgh");
      check.eq(shown.status, 503, "주소 값이 붙은 화면 요청: 503 안내");
      check.ok(shown.html.includes('href="/app?month=2026-07&amp;household_id=house-home"'), "다시 열기 주소는 달·가계부만 싣는다");
      check.ok(!/SECRETCODE|SECRETSTATE|abcdefgh/.test(shown.html), "다시 열기 주소에 인증 값 같은 다른 주소 값이 없다");
      const login = await app.fetch(new Request(BASE + "/my/login", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" }, body: "login_name=nobody&password=wrong-password-1" }), fx.env, ctx);
      check.ok(!(await login.text()).includes("로그아웃된 것은 아니에요"), "쿠키 없는 로그인 시도: 안내 화면 아님 (" + login.status + ")");
    } finally { undo(); }
  });
});
// 평소(실패 없음)에는 달라진 것이 없다.
await fixture(async (fx) => {
  resetIsolate();
  check.eq((await page(fx, "/app?month=2026-07&household_id=house-home")).status, 200, "평소 /app: 200");
  const login = await page(fx, "/my", { cookie: "" });
  check.eq(login.status, 200, "평소 쿠키 없음 /my: 200");
  check.ok(!login.html.includes("로그인 상태를 잠시 확인하지 못했어요"), "평소 쿠키 없음 /my: 로그인 화면");
});

check.done();
