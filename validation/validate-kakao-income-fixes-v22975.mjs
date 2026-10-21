// V22.9.75 — 카카오 챗봇이 수입을 지출처럼(또는 그 반대로) 다루던 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-10-21 카카오 감사에서 /skill 로 직접 보내 본 결과: "부모님께 용돈 30만원 지출"·"이자 납부 30만원"이 수입으로
// 저장됐고, 수정 메뉴는 수입 기록에도 지출 분류(식비)를 내밀어 그대로 반영했고, "어제수정 01번 금액 13000"은 새 지출로
// 저장됐다. 수입·지출을 함께 보내면 합계가 둘을 더한 값이었고, 수입 기록 답장은 "지출자"라고 했다. 기존 검사는
// 지출 기록만 넣어 보거나 소스 문자열만 확인해서 이 갈래를 한 번도 지나가지 않았다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처(DB·서버 없음)에서 /skill 에 실제 발화를 보내고, 저장된 행(구분·분류·금액·날짜·사람)과 답장 문구를
// 함께 확인한다. 절 번호는 감사 보고서의 번호(1~17)다. 4번(수정 흐름의 구분 바꾸기)은 이번에 하지 않았다.
import vm from "node:vm";
import { app, BASE, ctx, counter, fixture, withClock } from "./lib-audit-v22934.mjs";
import { transactionTypeFromText } from "../src/index.js";

const t = counter("V22.9.75 카카오 수입·지출 혼동 수정 검사");
const HH = "house-home";
const DAY = "2026-08-05";
const YESTERDAY = "2026-08-04";

// lib 의 skill() 은 글만 돌려준다. 바로답장 버튼까지 보려고 응답 JSON 을 그대로 읽는다.
async function say(fx, utterance, { user = "kakao_login:2265" } = {}) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, ctx);
  const data = JSON.parse(await response.text());
  const outputs = data?.template?.outputs || [];
  const text = outputs.map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n");
  const card = outputs.find((o) => o?.textCard)?.textCard || null;
  const quickReplies = (data?.template?.quickReplies || []).map((q) => [q.label, q.messageText]);
  return { text, card, quickReplies };
}

const rowById = (fx, id) => fx.db.transactions.find((row) => row.id === id);
const newest = (fx) => fx.db.transactions.at(-1);
const count = (fx) => fx.db.transactions.length;
// 같은 발화를 8초 안에 다시 보내면 막는 장치(프로세스 전역)가 앞 장면의 발화를 기억한다. 장면마다 비운다.
function scenario(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    fx.db.accountbook_settings.push({ id: "sel-bin-v22975-kakao", key: "kakao_selected_household_v2251:user-bin", value: HH, created_at: "2026-07-01T00:00:00Z" });
    await task(fx);
  }));
}

// ── 1. 구분 판정: 주는 대상+조사, 보내드림, 이자 납부/출금, 적어 준 "지출"·"수입", 섞인 말은 묻기 ──
await scenario(async (fx) => {
  const cases = [
    ["부모님께 용돈 30만원", "expense", 300000],
    ["엄마에게 용돈 51000원", "expense", 51000],
    ["아이한테 용돈 22000원", "expense", 22000],
    ["용돈 보내드림 103000원", "expense", 103000],
    ["부모님께 용돈 304000원 지출", "expense", 304000],
    ["이자 납부 31만원", "expense", 310000],
    ["이자 출금 5100원", "expense", 5100],
    ["지출 이자 납부 32만원", "expense", 320000],
    ["엄마한테서 용돈 52000원", "income", 52000],
    ["할머니께서 용돈 주심 53000원", "income", 53000],
    ["용돈 30000원", "income", 30000],
    // 리드 조정: 가족이 주는 쪽(이·가·께서)이면 받은 돈이다. 예전에는 "용돈 줬"만 보고 지출로 저장했다.
    ["엄마가 용돈 줬어 54000원", "income", 54000],
    ["형이 용돈 보내줬어 55000원", "income", 55000],
    ["내가 엄마한테 용돈 줬어 56000원", "expense", 56000],
    ["내가 용돈 줬어 57000원", "expense", 57000],
  ];
  for (const [text, type, amount] of cases) {
    const before = count(fx);
    const reply = await say(fx, text);
    t.eq(count(fx), before + 1, `1 한 건 저장: ${text}`);
    const row = newest(fx);
    t.eq(row.type, type, `1 구분: "${text}" → ${type}`);
    t.eq(row.amount, amount, `1 금액: ${text}`);
    t.eq(row.transaction_date, DAY, `1 날짜: ${text}`);
    t.ok(reply.text.includes(type === "income" ? "💰 수입 저장했어요" : "💸 지출 저장했어요"), `1 답장 구분: ${text}`);
  }
  const before = count(fx);
  const mixed = await say(fx, "월급 받아서 카드값 냈어 50만원");
  t.eq(count(fx), before, "1 수입 낱말과 쓰는 말이 섞이면 어느 쪽으로도 저장하지 않는다");
  t.ok(mixed.text.includes("수입인지 지출인지 헷갈려서 아직 저장하지 않았어요") && mixed.text.includes("‘지출 월급 받아서 카드값 냈어 50만원’"), "1 섞인 말: 앞에 구분을 붙여 다시 보내라고 안내한다(단톡방은 버튼이 없으므로 글로도)");
  t.deepEq(mixed.quickReplies, [["지출로 기록", "지출 월급 받아서 카드값 냈어 50만원"], ["수입으로 기록", "수입 월급 받아서 카드값 냈어 50만원"]], "1 섞인 말: 1:1 에는 지출로/수입으로 기록 버튼");
  await say(fx, "지출 월급 받아서 카드값 냈어 50만원");
  t.ok(newest(fx).type === "expense" && newest(fx).amount === 500000 && count(fx) === before + 1, "1 버튼 문장(앞에 ‘지출’)은 지출로 저장된다");
  const cancel = await say(fx, "결제 취소 36000원");
  t.ok(cancel.text.includes("결제·승인 취소 내역으로 보여") && count(fx) === before + 1, "1 결제 취소 안내는 예전 그대로");

  // 화면 빠른입력은 이 함수 본문을 그대로 싣는다. 두 인자로 부르면 문자열을 돌려주고, 밖의 함수 없이 같은 답을 낸다.
  const client = vm.createContext({});
  vm.runInContext(transactionTypeFromText.toString(), client);
  for (const [text, type] of [["부모님께 용돈 30만원", "expense"], ["이자 납부 30만원", "expense"], ["엄마한테서 용돈 5만원", "income"], ["용돈 30000", "income"], ["부모님께 용돈 30만원 지출", "expense"]]) {
    t.eq(vm.runInContext(`transactionTypeFromText(${JSON.stringify(text)}, [])`, client), type, `1 화면 사본: "${text}" → ${type}`);
  }
});

// ── 2·8·12. 수정 메뉴와 분류는 기록의 구분을 따른다. 수입 기록은 ‘수입자’, 목록 금액 칸에 ‘수입’ ────────────
await scenario(async (fx) => {
  const income = await say(fx, "월급 250만원 들어옴");
  const incomeRow = newest(fx);
  t.ok(incomeRow.type === "income" && incomeRow.category === "급여" && incomeRow.amount === 2500000, "2 수입 기록 준비(급여 2,500,000원)");
  t.ok(income.text.includes("\n수입자: Bin") && !income.text.includes("지출자:"), "8 수입 저장 답장은 ‘수입자’라고 쓴다(예전: 지출자)");
  t.ok(income.text.includes("01번 - 월급 / 수입 2,500,000원"), "12 저장 답장의 번호 줄 금액 칸에 ‘수입’ 표시");
  const expense = await say(fx, "점심 12000원");
  const expenseRow = newest(fx);
  t.ok(expense.text.includes("\n지출자: Bin") && expense.text.includes("02번 - 점심 / 12,000원"), "8·12 지출 저장 답장의 모양은 그대로");

  const menu = await say(fx, "수정 01번");
  t.ok(menu.text.includes("6. 수입자") && menu.text.includes("한 줄로도 돼요: 수입자 엄마"), "8 수입 기록의 수정 메뉴는 ‘수입자’");
  const incomeOptions = await say(fx, "2");
  t.ok(incomeOptions.text.includes("1. 급여  2. 용돈  3. 환급  4. 이자배당  5. 부업/매출  6. 기타수입"), "2 수입 기록의 분류 목록은 표준 수입 분류");
  t.ok(!/식비|외식|카페\/간식|의료/.test(incomeOptions.text), "2 수입 기록의 분류 목록에 지출 분류가 없다");
  await say(fx, "취소");
  const rejectIncome = await say(fx, "수정 01번 분류 식비");
  t.eq(rowById(fx, incomeRow.id).category, "급여", "2 수입 기록에 지출 분류(식비)를 넣지 않는다");
  t.ok(rejectIncome.text.includes("‘식비’ 분류는 지출 분류라서 수입 기록에 넣지 않았어요") && rejectIncome.text.includes("1. 급여"), "2 거절 답장은 이유와 수입 분류 목록을 준다");
  await say(fx, "취소");
  const rejectExpense = await say(fx, "수정 02번 분류 급여");
  t.eq(rowById(fx, expenseRow.id).category, "외식", "2 지출 기록에 수입 분류(급여)를 넣지 않는다(한 줄 명령)");
  t.ok(rejectExpense.text.includes("‘급여’ 분류는 수입 분류라서 지출 기록에 넣지 않았어요"), "2 지출 기록 거절 답장");
  await say(fx, "취소");
  const expenseMenu = await say(fx, "수정 02번");
  t.ok(expenseMenu.text.includes("6. 지출자"), "8 지출 기록 메뉴는 ‘지출자’ 그대로");
  const expenseOptions = await say(fx, "2");
  t.ok(expenseOptions.text.includes("1. 외식") && expenseOptions.text.includes("기타지출") && !expenseOptions.text.includes("급여"), "2 지출 기록의 분류 목록은 표준 지출 분류(예전: 생활·의료처럼 표준이 아닌 이름)");
  await say(fx, "취소");
  await say(fx, "수정 01번 분류 환급");
  t.eq(rowById(fx, incomeRow.id).category, "환급", "2 같은 구분의 분류는 그대로 반영한다");
  const payer = await say(fx, "수정 01번 수입자 WIFI♥");
  t.eq(rowById(fx, incomeRow.id).user_id, "user-wifi", "8 ‘수입자 WIFI♥’로 사람을 바꾼다");
  t.ok(payer.text.includes("수입자를 'WIFI♥'로 변경했어요"), "8 사람 변경 답장도 ‘수입자’");
  await say(fx, "수정 01번 지출자 Bin");
  t.eq(rowById(fx, incomeRow.id).user_id, "user-bin", "8 예전 명령(지출자)도 수입 기록에서 그대로 통한다");
  const list = await say(fx, "오늘기록");
  t.ok(list.text.includes("01번 - 월급 / 수입 2,500,000원") && list.text.includes("02번 - 점심 / 12,000원"), "12 오늘기록: 수입 줄에만 ‘수입’ 표시");
});

// ── 2. 사용자 분류도 구분별로 나눈다. 같은 구분이면 표준 이름과 겹쳐도 받는다 ─────────────────────
await scenario(async (fx) => {
  fx.db.accountbook_categories.push(
    { id: "cat-pet", household_id: HH, name: "반려동물", type: "expense", sort_order: 1, created_at: "2026-07-01T00:00:00Z" },
    { id: "cat-allow", household_id: HH, name: "용돈", type: "expense", sort_order: 2, created_at: "2026-07-01T00:00:00Z" },
    { id: "cat-lecture", household_id: HH, name: "강의료수입", type: "income", sort_order: 3, created_at: "2026-07-01T00:00:00Z" },
  );
  await say(fx, "월급 250만원 들어옴");
  const incomeRow = newest(fx);
  await say(fx, "점심 12000원");
  const expenseRow = newest(fx);
  await say(fx, "수정 01번");
  const incomeOptions = await say(fx, "2");
  t.ok(incomeOptions.text.includes("강의료수입") && !incomeOptions.text.includes("반려동물"), "2 수입 기록 목록에는 수입 사용자 분류만");
  await say(fx, "취소");
  await say(fx, "수정 02번");
  const expenseOptions = await say(fx, "2");
  t.ok(expenseOptions.text.includes("반려동물") && expenseOptions.text.includes("용돈") && !expenseOptions.text.includes("강의료수입"), "2 지출 기록 목록에는 지출 사용자 분류만");
  await say(fx, "취소");
  await say(fx, "수정 02번 분류 용돈");
  t.eq(rowById(fx, expenseRow.id).category, "용돈", "2 지출 사용자 분류 ‘용돈’은 지출 기록에 들어간다");
  await say(fx, "수정 01번 분류 반려동물");
  t.eq(rowById(fx, incomeRow.id).category, "급여", "2 지출 사용자 분류는 수입 기록에 들어가지 않는다");
});

// ── 3·6·7. 날짜를 붙여 쓴 수정 명령과 목록 조회 ─────────────────────────────────────
await scenario(async (fx) => {
  await say(fx, "어제 점심 12000원");
  const row = newest(fx);
  t.eq(row.transaction_date, YESTERDAY, "3 어제 기록 준비");
  const total = count(fx);
  for (const [text, amount] of [["어제수정 01번 금액 13000", 13000], ["8월4일수정 01번 금액 14000", 14000]]) {
    const reply = await say(fx, text);
    t.eq(count(fx), total, `3 새 기록으로 저장하지 않는다: ${text}`);
    t.eq(rowById(fx, row.id).amount, amount, `3 어제의 01번을 고친다: ${text}`);
    t.ok(reply.text.includes("01번 금액을") && reply.text.includes("변경했어요"), `3 수정 답장: ${text}`);
  }
  const missing = await say(fx, "그제수정 01번 금액 5000");
  t.eq(count(fx), total, "3 그제수정: 새 기록으로 저장하지 않는다");
  t.ok(missing.text.includes("2026-08-03 01번 기록을 찾지 못했어요"), "3 그제에 기록이 없으면 찾지 못했다고 답한다");
  const yesterdayList = await say(fx, "어제기록");
  t.ok(yesterdayList.text.includes("🧾 2026-08-04 기록") && yesterdayList.text.includes("01번 - 점심 / 14,000원"), "6 ‘어제기록’(붙여 씀)은 어제 목록(예전: 오늘 목록)");
  const dateList = await say(fx, "8월4일기록");
  t.ok(dateList.text.includes("🧾 2026-08-04 기록") && dateList.text.includes("01번 - 점심 / 14,000원"), "6 ‘8월4일기록’은 그날 목록");
  const dayBefore = await say(fx, "그제기록");
  t.ok(dayBefore.text.includes("🧾 2026-08-03 기록") && dayBefore.text.includes("아직 기록이 없어요."), "6 ‘그제기록’은 그제 목록");
  t.ok(yesterdayList.text.includes("내 기록만 보여요 · 가계부 전체는 ‘8월 4일 요약’"), "7 목록은 내 기록만이라고 말하고 그날 요약으로 안내한다");
  const today = await say(fx, "오늘기록");
  t.ok(today.text.includes("내 기록만 보여요 · 가계부 전체는 ‘오늘 요약’") && today.text.includes("아직 기록이 없어요.\n지금 내역을 기록해 보세요."), "7 빈 오늘기록도 같은 안내(빈 날 문구는 그대로)");
});

// ── 5. 여러 건 저장 답장의 합계는 구분별 ──────────────────────────────────────────
await scenario(async (fx) => {
  const mixed = await say(fx, "점심 12000원\n월급 300만원 들어옴");
  t.ok(mixed.text.includes("지출 합계 12,000원 · 수입 합계 3,000,000원") && !mixed.text.includes("3,012,000"), "5 수입·지출을 함께 보내면 합계를 나눠 보인다(예전: 3,012,000원)");
  const incomes = await say(fx, "월급 310만원 들어옴\n이자 3100원 받음");
  t.ok(incomes.text.includes("수입 합계 3,103,100원"), "5 수입만이면 ‘수입 합계’");
  const expenses = await say(fx, "커피 4500원\n김밥 3500원");
  t.ok(expenses.text.includes("· 합계 8,000원") && !expenses.text.includes("지출 합계"), "5 지출만이면 예전처럼 ‘합계’");
});

// ── 11. 중복 안내는 보낸 문장으로, 수입은 ‘별도 기록’ ────────────────────────────────
await scenario(async (fx) => {
  await say(fx, "월급 250만원 들어옴");
  const total = count(fx);
  const duplicate = await say(fx, "오늘 월급 250만원 들어옴");
  t.eq(count(fx), total, "11 같은 날 같은 수입은 중복으로 저장하지 않는다(예전 동작 유지)");
  t.ok(duplicate.text.includes("따로 들어온 돈이라면 ‘별도 기록 추가 오늘 월급 250만원 들어옴’라고 보내 후보를 확인해 주세요."), "11 수입 중복 안내: 별도 기록 + 보낸 문장");
  t.ok(!duplicate.text.includes("구매"), "11 수입 중복 안내에 ‘구매’가 없다");
  await say(fx, "점심 12000원");
  const expenseDuplicate = await say(fx, "오늘 점심 12000원");
  t.ok(expenseDuplicate.text.includes("서로 다른 구매라면 ‘별도 구매 추가 오늘 점심 12000원’라고"), "11 지출 중복 안내도 보낸 문장으로 예시를 만든다");
  const candidate = await say(fx, "별도 기록 추가 월급 250만원 들어옴");
  t.ok(candidate.text.includes("같은 내용의 별도 기록 후보입니다"), "11 ‘별도 기록 추가’를 받아 후보를 보인다");
  const confirm = candidate.quickReplies.find(([label]) => label === "별도 기록 확정")?.[1] || "";
  t.ok(/^별도 기록 확인 [a-f0-9]{16}$/.test(confirm), "11 확정 버튼은 ‘별도 기록 확인 …’");
  const before = count(fx);
  const done = await say(fx, confirm);
  t.ok(count(fx) === before + 1 && newest(fx).type === "income" && newest(fx).amount === 2500000, "11 확정하면 수입 한 건을 더 저장한다");
  t.ok(done.text.includes("별도 기록 한 건을 저장했어요"), "11 저장 답장도 ‘별도 기록’");
  await say(fx, "이자 3300원 받음");
  const again = await say(fx, "이자 3300원 받음");
  t.ok(again.text.includes("‘별도 기록 추가 이자 3300원 받음’"), "11 같은 수입 문장을 바로 다시 보내도 ‘별도 기록 추가 <보낸 문장>’으로 안내한다");
});

// ── 9·17. 수입을 묻는 말은 요약으로, 수입 메모 말끝 정리 ──────────────────────────────
await scenario(async (fx) => {
  await say(fx, "월급 250만원 들어옴");
  await say(fx, "점심 12000원");
  for (const text of ["이번달 수입", "월급 얼마 들어왔어", "수입 내역"]) {
    const reply = await say(fx, text);
    t.ok(reply.text.includes("📊 이번 달 요약") && reply.text.includes("수입: 2,500,000원 · 1건") && reply.text.includes("수입 분류") && reply.text.includes("• 급여: 2,500,000원"), `9 "${text}" → 이번 달 요약 + 수입 분류`);
  }
  const lastMonth = await say(fx, "지난달 수입");
  t.ok(lastMonth.text.includes("📊 7월 요약") && lastMonth.text.includes("수입: 3,380,000원 · 2건"), "9 ‘지난달 수입’ → 7월 요약");
  const plain = await say(fx, "이번달요약");
  t.ok(plain.text.includes("📊 이번 달 요약") && !plain.text.includes("수입 분류"), "9 그냥 요약은 예전 모양 그대로");
  await say(fx, "이자 받았어 3000원");
  t.ok(newest(fx).type === "income" && newest(fx).memo === "이자" && newest(fx).category === "이자배당", `17 ‘이자 받았어’ 메모는 ‘이자’(예전: ‘이자 어’) — ${newest(fx).memo}`);
  await say(fx, "월급 들어왔어 260만원");
  t.ok(newest(fx).type === "income" && newest(fx).memo === "월급", `17 ‘월급 들어왔어’ 메모는 ‘월급’ — ${newest(fx).memo}`);
});

// ── 10·13·14·15·16. 안내 문구 ───────────────────────────────────────────────
await scenario(async (fx) => {
  const manual = await say(fx, "기록하는 법");
  t.ok(manual.card?.description.includes("수입 예) 월급 250만원 들어옴") && manual.card.description.split("\n").length <= 4, "10 기록하는 법에 수입 예시(설명은 4줄 이하 유지)");

  await say(fx, "예산설정");
  const copied = await say(fx, "지난달 예산 복사");
  t.ok(/2026-07 예산 \d+개를 2026-08로 복사했어요/.test(copied.text) && copied.text.includes("분류별 예산 3개 · 전체 예산 · 수입 목표 2개"), "13 예산 복사 답장은 무엇을 셌는지 나눠 말한다");
  const august = fx.db.accountbook_budgets.filter((row) => row.household_id === HH && row.month === "2026-08");
  t.ok(august.filter((row) => !String(row.category).startsWith("__")).length === 3 && august.some((row) => row.category === "__total") && august.filter((row) => String(row.category).startsWith("__income")).length === 2, "13 답장의 개수가 실제로 복사된 행과 같다");

  await say(fx, "점심 12000원");
  await say(fx, "환급 5000원");
  const settlement = await say(fx, "정산");
  t.ok(settlement.text.includes("환급(돌려받은 돈)은 이 정산에서 빼지 않아요") && settlement.text.includes("웹 정산 화면") && settlement.text.includes("일반 정산 금액과 완료 이력에는 반영하지 않습니다."), "14 정산 답장은 환급을 빼지 않는다고 사실대로 말한다");
  t.ok(!settlement.text.includes("환급 계산은 미리보기 전용"), "14 이 답장에 없는 환급 미리보기를 약속하던 문장이 없다");
  t.ok(settlement.text.includes("총 지출: 12,000원"), "14 문장대로 환급 5,000원을 빼지 않은 총 지출");

  const alias = await say(fx, "내 이름 빈빈");
  t.ok(alias.text.includes("앞으로 내가 기록한 수입·지출은 ‘빈빈’ 이름으로 집계됩니다.") && !alias.text.includes("지출로 집계"), "15 이름 설정 답장은 수입도 포함한다(바로 바꾸기)");
  await say(fx, "이름설정");
  const flowAlias = await say(fx, "빈둥");
  t.ok(flowAlias.text.includes("앞으로 내가 기록한 수입·지출은 ‘빈둥’ 이름으로 집계됩니다."), "15 이름 설정 단계형 답장도 같다");

  const keyword = await say(fx, "키워드 안내");
  t.ok(keyword.text.includes("키워드 등록·수정은 웹 가계부 설정 화면에서 할 수 있어요.") && keyword.text.includes("https://malhaebook.com/my/settings"), "16 키워드 안내는 할 곳과 주소를 준다");
  t.ok(!keyword.text.includes("요청했을 때만"), "16 ‘키워드 안내를 요청했을 때만 연결’이라는 앞뒤 안 맞는 문장이 없다");
});

t.done();
