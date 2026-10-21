// V22.9.75 — 2026-10-14 전체 점검(docs/codex/AUDIT_FINDINGS_V22_9_44.md)에서 아직 재현되던 카카오 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-10-21 다시 돌려 본 재현 스크립트에서: 수정 세션의 메뉴에 "1번"이라고 답하면 오늘의 01번 기록이 바뀌었고(B-2),
// "스타벅스 신메뉴 6500"은 도움말로 바뀌어 저장되지 않았고(A-04), 열린 세션이 "오늘 기록 보기"를 메모 값으로 삼켰고(B-4),
// 세션이 끝난 뒤 "금액 13000"은 새 지출 ‘금액’으로 저장됐다(B-3). 기존 검사는 세션 밖의 번호 명령만 보거나
// 한 낱말 도움말만 보내서 이 갈래를 지나가지 않았다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처(DB·서버 없음)에서 /skill 에 실제 발화를 차례로 보내고, 저장된 행과 답장 문구를 함께 확인한다.
// 절 이름은 점검 문서의 항목 번호다.
import vm from "node:vm";
import { app, BASE, ctx, counter, fixture, withClock } from "./lib-audit-v22934.mjs";
import { quickInputDate } from "../src/modules/client/shared-input-parsers.js";

const t = counter("V22.9.75 카카오 점검 잔여 결함(B-2·A-04·B-4·B-3·A-07·A-12·D-7·A-13·D-6) 검사");
const HH = "house-home";
const DAY = "2026-08-05";

async function say(fx, utterance, { user = "kakao_login:2265" } = {}) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, ctx);
  const data = JSON.parse(await response.text());
  const outputs = data?.template?.outputs || [];
  const text = outputs.map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n");
  const quickReplies = (data?.template?.quickReplies || []).map((q) => [q.label, q.messageText]);
  return { text, quickReplies };
}

const count = (fx) => fx.db.transactions.length;
const newest = (fx) => fx.db.transactions.at(-1);
const byMemo = (fx, memo) => fx.db.transactions.find((row) => row.memo === memo && row.transaction_date >= "2026-08-01");
// 수정 세션은 설정 표에 JSON 으로 저장된다. 시간이 지난 세션을 만들려고 마지막 갱신 시각만 뒤로 돌린다.
function ageEditSession(fx, ms) {
  const row = fx.db.accountbook_settings.find((item) => String(item.key).startsWith("kakao_edit_v4:"));
  if (!row) return false;
  const value = typeof row.value === "string" ? JSON.parse(row.value) : row.value;
  value.updatedAt -= ms;
  row.value = typeof row.value === "string" ? JSON.stringify(value) : value;
  return true;
}
// 같은 발화를 8초 안에 다시 보내면 막는 장치(프로세스 전역)가 앞 장면의 발화를 기억한다. 장면마다 비운다.
function scenario(task, { day = DAY, selections = [["user-bin", HH]] } = {}) {
  return withClock(day, () => fixture(async (fx) => {
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    for (const [userId, householdId] of selections) {
      fx.db.accountbook_settings.push({ id: `sel-${userId}-v22975-audit`, key: `kakao_selected_household_v2251:${userId}`, value: householdId, created_at: "2026-07-01T00:00:00Z" });
    }
    await task(fx);
  }));
}
async function seedToday(fx) {
  for (const text of ["커피 4500", "점심 9000", "택시 12000", "빵 3000", "우유 2500", "김밥 3500"]) await say(fx, text);
}

// ── B-2. 열린 수정 세션의 "1번"·"6번 WIFI♥"·"1번 13000"은 세션의 메뉴 답이다 ─────────────────────
await scenario(async (fx) => {
  await seedToday(fx);
  const total = count(fx);
  await say(fx, "수정 02번");
  const pick = await say(fx, "1번");
  t.ok(pick.text.includes("얼마로 바꿀까요") && !pick.text.includes("01번 - 커피"), "B-2 메뉴에 ‘1번’ → 02번의 금액 묻기(예전: 01번 커피 메뉴로 바뀜)");
  await say(fx, "13000");
  t.eq(byMemo(fx, "점심").amount, 13000, "B-2 이어 보낸 13000 은 02번(점심)에 반영");
  t.eq(byMemo(fx, "커피").amount, 4500, "B-2 01번(커피)은 그대로");
  await say(fx, "수정 02번");
  await say(fx, "1번 13500");
  t.ok(byMemo(fx, "점심").amount === 13500 && byMemo(fx, "커피").amount === 4500, "B-2 한 줄 ‘1번 13500’도 02번 금액(예전: 01번이 바뀜)");
  await say(fx, "수정 03번");
  const payer = await say(fx, "6번 WIFI♥");
  t.ok(byMemo(fx, "택시").user_id === "user-wifi" && byMemo(fx, "김밥").user_id === "user-bin", "B-2 ‘6번 WIFI♥’는 03번(택시)의 지출자(예전: 06번 김밥이 바뀜)");
  t.ok(payer.text.includes("03번 지출자를 'WIFI♥'로 변경했어요"), "B-2 답장도 03번");
  await say(fx, "수정 03번");
  await say(fx, "지출자");
  await say(fx, "1번");
  t.eq(byMemo(fx, "택시").user_id, "user-bin", "B-2 지출자 선택지에 ‘1번’ → 1. Bin(예전: 01번 메뉴로 빠짐)");
  const outside = await say(fx, "1번");
  t.ok(outside.text.includes("01번 - 커피 / 4,500원"), "B-2 세션이 없을 때 ‘1번’은 예전처럼 오늘의 01번 수정 메뉴");
  await say(fx, "취소");
  t.eq(count(fx), total, "B-2 어느 단계에서도 새 기록이 생기지 않는다");
});

// ── A-04. 금액이 있는 말은 ‘메뉴’·‘기능’이 들어 있어도 기록이다 ─────────────────────────────
await scenario(async (fx) => {
  for (const [text, amount, memo] of [["스타벅스 신메뉴 6500", 6500, "스타벅스 신메뉴"], ["건강기능식품 35000", 35000, "건강기능식품"], ["점심 메뉴 12000", 12000, "점심 메뉴"], ["기능성 티셔츠 30000", 30000, "기능성 티셔츠"]]) {
    const before = count(fx);
    const reply = await say(fx, text);
    t.ok(count(fx) === before + 1 && newest(fx).amount === amount && newest(fx).memo === memo && newest(fx).type === "expense", `A-04 "${text}" 저장(예전: 도움말로 바뀌고 0건)`);
    t.ok(reply.text.includes("💸 지출 저장했어요") && !reply.text.includes("도움말"), `A-04 "${text}" 저장 답장`);
  }
  for (const text of ["메뉴", "도움말", "기능 알려줘"]) {
    const before = count(fx);
    const reply = await say(fx, text);
    t.ok(count(fx) === before && reply.text.includes("말해가계부 도움말"), `A-04 금액 없는 "${text}"는 그대로 도움말`);
  }
});

// ── B-4. 열린 세션 중에도 목록·요약·예산 명령은 원래 답을 받는다. 바꿀 수 없는 지출자 변경은 바로 거절 ─────
await scenario(async (fx) => {
  await seedToday(fx);
  await say(fx, "수정 01번");
  const list = await say(fx, "오늘 기록 보기");
  t.ok(list.text.includes("🧾 2026-08-05 기록") && list.text.includes("01번 - 커피 / 4,500원"), "B-4 세션 중 ‘오늘 기록 보기’ → 목록(예전: ‘내용을 바꾸는 건가요?’)");
  t.eq(byMemo(fx, "커피")?.memo, "커피", "B-4 01번 메모는 그대로");
  const summary = await say(fx, "이번달 요약");
  t.ok(summary.text.includes("📊 이번 달 요약"), "B-4 세션 중 ‘이번달 요약’ → 요약");
  const budget = await say(fx, "예산");
  t.ok(budget.text.includes("예산을 새로 설정할까요"), "B-4 세션 중 ‘예산’ → 예산 안내");
  const menu = await say(fx, "5");
  t.ok(menu.text.includes("날짜를 번호로 고르거나"), "B-4 조회 뒤에도 세션은 남아 이어서 고칠 수 있다");
  await say(fx, "어제");
  t.eq(byMemo(fx, "커피").transaction_date, "2026-08-04", "B-4 날짜 값 ‘어제’는 조회 명령으로 빠지지 않고 세션 값으로 반영");
  // 커피가 어제로 옮겨 갔으므로 어제의 01번이다.
  await say(fx, "어제 수정 01번");
  await say(fx, "5");
  const today = await say(fx, "오늘");
  t.ok(today.text.includes("01번 날짜를 2026-08-05로 변경했어요") && byMemo(fx, "커피").transaction_date === "2026-08-05", "B-4 날짜 값 ‘오늘’도 요약 명령으로 빠지지 않는다");
}, { selections: [["user-bin", HH]] });
await scenario(async (fx) => {
  await say(fx, "커피 4500", { user: "kakao_login:2266" });
  const refused = await say(fx, "지출자 변경", { user: "kakao_login:2266" });
  t.ok(refused.text.includes("지출자는 가계부 소유자·관리자만 바꿀 수 있어요") && !refused.text.includes("번호로 골라주세요"), "B-4 구성원의 ‘지출자 변경’은 선택지 없이 바로 거절(예전: 반드시 거절될 선택지 세션)");
  const budget = await say(fx, "예산 50만원", { user: "kakao_login:2266" });
  t.ok(!budget.text.includes("목록의 번호로 골라주세요"), "B-4 다음 예산 명령이 세션에 먹히지 않는다");
}, { selections: [["user-wifi", HH]] });

// ── B-3. 세션이 끝난 뒤 온 수정 값은 새 기록이 아니다 ─────────────────────────────────
await scenario(async (fx) => {
  await seedToday(fx);
  const total = count(fx);
  await say(fx, "수정 05번");
  t.ok(ageEditSession(fx, 6 * 60 * 1000), "B-3 6분 지난 세션 준비");
  const expired = await say(fx, "금액 13000");
  t.eq(count(fx), total, "B-3 만료 뒤 ‘금액 13000’을 새 지출로 저장하지 않는다(예전: ‘금액 / 13,000원’ 저장)");
  t.eq(byMemo(fx, "우유").amount, 2500, "B-3 05번도 바꾸지 않는다");
  t.ok(expired.text.includes("수정 시간이 지나 05번 수정을 끝냈어요") && expired.text.includes("👉 수정 05번 금액 13000"), "B-3 끝났다고 알리고 보낸 말로 한 줄 명령을 보여 준다");
  await say(fx, "수정 05번");
  ageEditSession(fx, 6 * 60 * 1000);
  const seq = await say(fx, "1번 13000");
  t.ok(byMemo(fx, "커피").amount === 4500 && count(fx) === total && seq.text.includes("수정 시간이 지나 05번"), "B-3 만료 뒤 ‘1번 13000’이 오늘의 01번을 바꾸지 않는다");
});

// ── A-07. 띄어 쓴 한글 금액은 한 금액이다 ─────────────────────────────────────────
await scenario(async (fx) => {
  for (const [text, amount, memo] of [["택시 만 오천원", 15000, "택시"], ["점심 삼만 오천원", 35000, "점심"], ["마트 만 2천원", 12000, "마트"], ["회식 십만 오천원", 105000, "회식"], ["커피 사천 오백원", 4500, "커피"]]) {
    const before = count(fx);
    await say(fx, text);
    t.ok(count(fx) === before + 1 && newest(fx).amount === amount && newest(fx).memo === memo, `A-07 "${text}" → 한 건 ${amount}원(예전: 두 건으로 나뉘거나 뒤 금액이 사라짐) — ${newest(fx).amount}/${newest(fx).memo}`);
  }
  const before = count(fx);
  await say(fx, "점심 만원 커피 오천원");
  t.eq(count(fx), before + 2, "A-07 ‘만원’ 뒤에 다른 내용이 오면 예전처럼 두 건");
});

// ── A-12. 일만 쓴 날이 오늘보다 뒤면 지난달의 그날 ──────────────────────────────────
await scenario(async (fx) => {
  await say(fx, "31일 송년회 50000");
  t.ok(newest(fx).transaction_date === "2026-12-31" && newest(fx).memo === "송년회", `A-12 2027-01-01에 ‘31일’ → 2026-12-31(예전: 2027-01-31 앞날) — ${newest(fx).transaction_date}`);
  await say(fx, "1일 신년회 52000");
  t.eq(newest(fx).transaction_date, "2027-01-01", "A-12 오늘까지의 날은 예전처럼 이번 달");
}, { day: "2027-01-01" });
await scenario(async (fx) => {
  await say(fx, "30일 회식 80000");
  t.eq(newest(fx).transaction_date, "2026-09-30", "A-12 10월 2일에 ‘30일’ → 9월 30일");
}, { day: "2026-10-02" });
{
  // 웹 빠른 입력은 이 함수 본문을 그대로 싣는다. 밖의 함수 없이 같은 답을 내야 웹과 카카오가 같은 날로 읽는다.
  const client = vm.createContext({});
  vm.runInContext(quickInputDate.toString(), client);
  t.eq(vm.runInContext(`quickInputDate("31일 송년회", "2027-01-01")`, client), "2026-12-31", "A-12 화면 사본도 2026-12-31");
  t.eq(vm.runInContext(`quickInputDate("31일", "2026-03-01")`, client), "2026-01-31", "A-12 31일이 없는 달은 건너뛴다(3월 1일 → 1월 31일)");
  t.eq(vm.runInContext(`quickInputDate("5일 점심", "2026-10-14")`, client), "2026-10-05", "A-12 지난 날은 이번 달 그대로");
}

// ── D-7. 연도 없는 달: 요약은 지난 쪽, 예산은 가까운 쪽 ─────────────────────────────
await scenario(async (fx) => {
  await say(fx, "12월 10일 연말 모임 123000");
  t.eq(newest(fx).transaction_date, "2026-12-10", "D-7 준비: 1월에 적은 ‘12월 10일’ 기록은 작년 12월");
  const december = await say(fx, "12월 요약");
  t.ok(december.text.includes("📊 2026년 12월 요약") && december.text.includes("지출: 123,000원"), "D-7 1월에 보낸 ‘12월 요약’ → 작년 12월(예전: 올해 12월로 0원)");
  const last = await say(fx, "지난달 요약");
  t.ok(last.text.includes("📊 2026년 12월 요약") && last.text.includes("지출: 123,000원"), "D-7 ‘지난달 요약’과 제목·금액이 같다");
  const day = await say(fx, "12월 10일 요약");
  t.ok(day.text.includes("📊 2026년 12월 10일 요약") && day.text.includes("123,000원"), "D-7 연도 없는 ‘12월 10일 요약’도 작년");
}, { day: "2027-01-02" });
await scenario(async (fx) => {
  await say(fx, "1월 식비 예산 30만원");
  t.ok(fx.db.accountbook_budgets.some((row) => row.household_id === HH && row.month === "2027-01" && row.category === "식비" && Number(row.amount) === 300000), "D-7 12월에 보낸 ‘1월 식비 예산’ → 2027-01(예전: 2026-01)");
  t.ok(!fx.db.accountbook_budgets.some((row) => row.month === "2026-01" && row.category === "식비"), "D-7 지난 1월에 저장하지 않는다");
  await say(fx, "11월 교통 예산 10만원");
  t.ok(fx.db.accountbook_budgets.some((row) => row.month === "2026-11" && row.category === "교통"), "D-7 가까운 지난달(11월)은 올해 그대로");
}, { day: "2026-12-20" });

// ── A-13. 기간을 못 읽은 요약에 이번 달로 답하지 않는다 ──────────────────────────────
await scenario(async (fx) => {
  for (const [text, title] of [["저번달 요약", "📊 7월 요약"], ["저번주 요약", "📊 지난 주 요약"], ["그제 요약", "📊 그제 요약"], ["7월 지출 현황", "📊 7월 요약"]]) {
    const reply = await say(fx, text);
    t.ok(reply.text.includes(title), `A-13 "${text}" → ${title}(예전: 이번 달 요약)`);
  }
  for (const text of ["저저번달 요약", "작년 요약"]) {
    const reply = await say(fx, text);
    t.ok(reply.text.includes("요약할 기간을 읽지 못했어요") && !reply.text.includes("📊 이번 달 요약"), `A-13 "${text}" → 기간을 읽지 못했다고 답한다`);
  }
  for (const text of ["요약", "월 요약", "이번달 요약"]) {
    const reply = await say(fx, text);
    t.ok(reply.text.includes("📊 이번 달 요약"), `A-13 "${text}"는 예전처럼 이번 달`);
  }
});

// ── D-6. 같은 이름의 가계부를 이름으로 고르면 묻는다 ─────────────────────────────────
await scenario(async (fx) => {
  fx.db.households.push({ id: "house-parents", name: "우리집 생활비", invite_code: "PARENT01", created_at: "2026-07-10T00:00:00.000Z" });
  fx.db.household_members.push(
    { household_id: "house-parents", user_id: "user-wifi", role: "owner", created_at: "2026-07-10T00:00:00.000Z" },
    { household_id: "house-parents", user_id: "user-bin", role: "member", created_at: "2026-07-11T00:00:00.000Z" },
  );
  const selected = () => fx.db.accountbook_settings.find((row) => row.key === "kakao_selected_household_v2251:user-bin")?.value;
  const list = await say(fx, "가계부 전환");
  t.ok(list.text.includes("우리집 생활비 · 구성원 · 만든 날 2026-07-10") && list.text.includes("우리집 생활비 · 소유자 · 만든 날 2026-07-01"), "D-6 목록에서 같은 이름 가계부를 역할·만든 날로 구별한다");
  const asked = await say(fx, "우리집 생활비");
  t.ok(asked.text.includes("‘우리집 생활비’ 이름의 가계부가 2개예요") && selected() !== "house-parents", "D-6 이름으로 고르면 첫 번째(부모님 가계부)를 고르지 않고 번호로 묻는다");
  const mine = asked.text.split("\n").find((line) => line.includes("소유자 · 만든 날 2026-07-01"))?.match(/^(\d+)\./)?.[1] || "";
  const done = await say(fx, mine);
  t.ok(done.text.includes("‘우리집 생활비’(소유자) 가계부를 선택했어요") && selected() === HH, "D-6 번호로 고르면 내 가계부, 확인 문구에 역할");
  await say(fx, "커피 4500");
  t.eq(newest(fx).household_id, HH, "D-6 다음 기록은 고른 가계부에 저장");
}, { day: "2026-07-15", selections: [] });

t.done();
