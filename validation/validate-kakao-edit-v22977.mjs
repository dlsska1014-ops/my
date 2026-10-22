// V22.9.77 — 2026-10-14 전체 점검(docs/codex/AUDIT_FINDINGS_V22_9_44.md)과 V22.9.76 출시 전 점검에서 남은 카카오 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 카카오 수정 흐름에는 수입↔지출을 바꾸는 길이 없어, 구분을 잘못 저장하면 지우고 다시 적어야 했다(V76:K-4).
// 같은 이름의 가계부가 둘이면 저장 답장의 "가계부: 이름"만으로는 어느 쪽에 들어갔는지 알 수 없었다(V44:D-6 남은 부분).
// ‘오늘 기록 보기’는 가장 오래된 20건에서 멈추고, 950자를 넘으면 줄 중간에서 잘랐다(V44:A-14).
// 메모를 만들며 단위·서술어를 지우다 낱말 속을 잘랐다(공동구매→공동, 원정 경기→원 경기, ₩→원)(V44:A-15).
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처(DB·서버 없음)에서 /skill 에 실제 발화를 차례로 보내고, 저장된 행과 답장 문구를 함께 확인한다.
// 카카오 답장 길이 자르기(kakaoText)만은 그 길이를 넘는 답장을 대화로 만들기 어려워 함수를 직접 부른다.
// V22977_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 확인하는 용도).
import { app, BASE, ctx, counter, fixture, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { kakaoText } from "../src/modules/kakao/response-builders.js";

const SOFT = process.env.V22977_SOFT === "1";
const base = counter("V22.9.77 카카오 수정 흐름 구분 바꾸기·같은 이름 가계부 저장 답장·오늘 기록 최근순·메모 낱말 보존 검사");
const failures = [];
const t = {
  ok(value, message) {
    if (SOFT && !value) { failures.push(message); return; }
    base.ok(value, message);
  },
  eq(actual, expected, message) {
    if (SOFT && actual !== expected) { failures.push(`${message} (받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`); return; }
    base.eq(actual, expected, message);
  },
};

const HH = "house-home";
const DAY = "2026-08-05";
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const POLICY_KEY = `household_member_policy_v22943:${HH}`;
const RECORD_ONLY = "‘기록만’으로 정해";

async function say(fx, utterance, { user = BIN, groupKey = "" } = {}) {
  const properties = { botUserKey: user, ...(groupKey ? { botGroupKey: groupKey } : {}) };
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: user, type: "botUserKey", properties } };
  if (groupKey) userRequest.chat = { id: groupKey, type: "groupChat", properties: { botGroupKey: groupKey } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, ctx);
  const data = JSON.parse(await response.text());
  const outputs = data?.template?.outputs || [];
  return { text: outputs.map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") };
}

const count = (fx) => fx.db.transactions.length;
const newest = (fx) => fx.db.transactions.at(-1);
const rowById = (fx, id) => fx.db.transactions.find((row) => row.id === id) || {};
const pad = (n) => String(n).padStart(2, "0");
const lineOf = (text, prefix) => text.split("\n").find((line) => line.startsWith(prefix)) || "";
// 같은 발화를 8초 안에 다시 보내면 막는 장치(프로세스 전역)가 앞 장면의 발화를 기억한다. 장면마다 비운다.
async function scenario(name, task, { day = DAY, selections = [["user-bin", HH]] } = {}) {
  const run = () => withClock(day, () => fixture(async (fx) => {
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    for (const [userId, householdId] of selections) {
      fx.db.accountbook_settings.push({ id: `sel-${userId}-v22977`, key: `kakao_selected_household_v2251:${userId}`, value: householdId, created_at: "2026-07-01T00:00:00Z" });
    }
    await task(fx);
  }));
  if (!SOFT) return run();
  try { await run(); } catch (error) { failures.push(`${name} 장면이 멈춤: ${error?.message || error}`); }
}

// ── K-4-1. 메뉴 8번 → 확인 → 네: 지출이 수입이 되고, 요약·예산이 새 구분으로 센다 ─────────────────────
await scenario("K-4-1", async (fx) => {
  fx.db.accountbook_budgets.push({ id: "budget-v22977-out", household_id: HH, month: "2026-08", category: "외식", amount: 300000, created_at: "2026-08-01T00:00:00Z" });
  await say(fx, "점심 12000원");
  const row = newest(fx);
  const before = count(fx);
  t.ok(row.type === "expense" && row.category === "외식" && row.amount === 12000, "K-4 준비: 점심 12000원은 외식 지출");
  t.ok((await say(fx, "남은 예산")).text.includes("• 외식: 12,000원 사용"), "K-4 준비: 외식 예산에 12,000원이 잡힌다");
  const menu = await say(fx, "수정 01번");
  t.ok(menu.text.includes("8. 구분(수입↔지출)") && menu.text.includes("/ 구분 수입"), "K-4 수정 메뉴에 ‘8. 구분(수입↔지출)’과 한 줄 예시 ‘구분 수입’");
  const ask = await say(fx, "8");
  t.ok(ask.text.includes("01번 기록을 지출에서 수입으로 바꿀까요? (네/아니오)"), "K-4 8번을 고르면 반대 구분으로 바꿀지 먼저 묻는다");
  t.eq(rowById(fx, row.id).type, "expense", "K-4 묻는 동안에는 기록이 그대로");
  const done = await say(fx, "네");
  t.ok(done.text.includes("01번 구분을 지출 → 수입으로 바꿨어요") && done.text.includes("분류: 외식 → 기타수입") && done.text.includes("수입 12,000원"), "K-4 ‘네’ 답장이 무엇이 바뀌었는지(구분·분류) 말한다");
  const after = rowById(fx, row.id);
  t.ok(after.type === "income" && after.amount === 12000 && after.category === "기타수입", "K-4 기록: 수입, 금액은 그대로 양수, 분류는 수입 분류(기타수입)");
  t.eq(count(fx), before, "K-4 구분을 바꿔도 새 기록이 생기지 않는다");
  const summary = await say(fx, "이번달요약");
  t.ok(lineOf(summary.text, "수입:").includes("12,000원") && lineOf(summary.text, "지출:").startsWith("지출: 0원"), "K-4 이번 달 요약이 바뀐 기록을 수입으로 센다");
  const budget = await say(fx, "남은 예산");
  t.ok(budget.text.includes("• 외식: 0원 사용 / 300,000원 남음"), "K-4 외식 예산에서 빠진다");
  const back = await say(fx, "수정 01번 구분 지출");
  t.ok(back.text.includes("01번 구분을 수입 → 지출로 바꿨어요") && back.text.includes("분류: 기타수입 → 외식"), "K-4 한 줄 명령 ‘구분 지출’은 묻지 않고 바꾸고, 분류는 메모로 다시 정한다(점심 → 외식)");
  const restored = rowById(fx, row.id);
  t.ok(restored.type === "expense" && restored.category === "외식" && restored.amount === 12000, "K-4 되돌린 기록: 외식 지출 12,000원");
  const same = await say(fx, "수정 01번 구분 지출");
  t.ok(same.text.includes("01번은 이미 지출 기록이에요. 바꾸지 않았어요."), "K-4 같은 구분이면 바꾸지 않았다고 말한다");
  t.eq(count(fx), before, "K-4 한 줄 명령도 새 기록을 만들지 않는다");
});

// ── K-4-2. 분류 다시 정하기·자연스러운 말·애매한 말·잘못된 값·날짜 붙은 명령·숫자 메모(B-11) ─────────────
await scenario("K-4-2", async (fx) => {
  await say(fx, "이자 납부 30만원");
  const interest = newest(fx);
  await say(fx, "월급 250만원 들어옴");
  const salary = newest(fx);
  const before = count(fx);
  t.ok(interest.type === "expense" && salary.type === "income" && salary.category === "급여", "K-4 준비: 이자 납부는 지출, 월급은 급여 수입");
  const toIncome = await say(fx, "수정 01번 구분 수입");
  t.ok(rowById(fx, interest.id).type === "income" && rowById(fx, interest.id).category === "이자배당" && toIncome.text.includes("분류: 기타지출 → 이자배당"), "K-4 수입으로 바꾸면 새 기록과 같은 수입 분류기로 고른다(이자 → 이자배당)");
  const toExpense = await say(fx, "수정 02번 구분 지출");
  const salaryAfter = rowById(fx, salary.id);
  t.ok(salaryAfter.type === "expense" && salaryAfter.category === "기타지출" && salaryAfter.amount === 2500000 && toExpense.text.includes("분류: 급여 → 기타지출"), "K-4 맞는 지출 분류가 없으면 기타지출(수입 분류 ‘급여’를 지출에 남기지 않는다)");
  const natural = await say(fx, "수정 02번 수입으로 바꿔줘");
  t.ok(rowById(fx, salary.id).type === "income" && rowById(fx, salary.id).category === "급여" && natural.text.includes("지출 → 수입으로 바꿨어요"), "K-4 ‘수입으로 바꿔줘’도 구분 변경, 분류는 다시 급여");
  const bare = await say(fx, "수정 01번 지출");
  t.ok(bare.text.includes("혹시 구분을 지출로 바꾸는 건가요? (네/아니오)") && rowById(fx, interest.id).type === "income", "K-4 낱말 ‘지출’만 보내면 바로 바꾸지 않고 묻는다");
  await say(fx, "아니오");
  await say(fx, "취소");
  t.eq(rowById(fx, interest.id).type, "income", "K-4 ‘아니오’면 그대로");
  const invalid = await say(fx, "수정 01번 구분 뭐");
  t.ok(invalid.text.includes("구분은 ‘수입’이나 ‘지출’로") && rowById(fx, interest.id).type === "income", "K-4 알 수 없는 구분 값은 바꾸지 않고 다시 묻는다");
  await say(fx, "취소");
  await say(fx, "어제 택시 8000원");
  const taxi = newest(fx);
  const dated = await say(fx, "어제 수정 01번 구분 수입");
  t.ok(rowById(fx, taxi.id).type === "income" && rowById(fx, interest.id).type === "income" && rowById(fx, salary.id).type === "income" && dated.text.includes("지출 → 수입으로 바꿨어요"), "K-4 날짜를 붙인 명령은 그날의 01번만 바꾼다");
  // B-11: 확인을 묻는 중이나 내용 단계에서 숫자가 섞인 말을 보내도 새 기록이 생기지 않는다.
  const middle = count(fx);
  await say(fx, "수정 01번");
  await say(fx, "8");
  await say(fx, "010-1234-5678");
  t.ok(count(fx) === middle && rowById(fx, interest.id).type === "income", "K-4 구분 확인 중 전화번호를 보내도 새 기록·구분 변경 없음(B-11)");
  await say(fx, "4");
  await say(fx, "엄마한테 빌린 돈 010-1234-5678 계좌 110-123-456789");
  const memoRow = rowById(fx, interest.id);
  t.ok(count(fx) === middle && memoRow.memo.includes("010-1234-5678") && memoRow.amount === 300000 && memoRow.type === "income", "K-4 내용 단계의 숫자 메모는 메모로만 들어간다(B-11)");
  t.eq(count(fx), before + 1, "K-4 구분 바꾸기 장면 전체에서 늘어난 기록은 새로 적은 택시 1건뿐");
});

// ── K-4-3. 권한: 구성원도 자기 기록을 바꾸지만(웹과 같은 수정 권한), ‘기록만’ 구성원은 거절한다 ─────────────
await scenario("K-4-3", async (fx) => {
  await say(fx, "저녁 9000원", { user: WIFI });
  const row = newest(fx);
  t.ok(row.user_id === "user-wifi" && row.type === "expense", "K-4 준비: 구성원 WIFI♥의 저녁 지출");
  const allowed = await say(fx, "수정 01번 구분 수입", { user: WIFI });
  t.ok(allowed.text.includes("지출 → 수입으로 바꿨어요") && rowById(fx, row.id).type === "income", "K-4 기록·수정 권한 구성원은 자기 기록의 구분을 바꾼다");
  await say(fx, "수정 01번", { user: WIFI });
  await say(fx, "8", { user: WIFI });
  putSetting(fx, POLICY_KEY, { version: 1, mode: "record_only" }); // 묻는 사이 소유자가 ‘기록만’으로 바꿨다
  const late = await say(fx, "네", { user: WIFI });
  t.ok(late.text.includes(RECORD_ONLY) && rowById(fx, row.id).type === "income", "K-4 ‘네’ 직후 반영 전에 권한을 다시 본다(기록만이면 구분도 그대로)");
  const oneLine = await say(fx, "수정 01번 구분 지출", { user: WIFI });
  t.ok(oneLine.text.includes(RECORD_ONLY) && rowById(fx, row.id).type === "income", "K-4 ‘기록만’ 구성원의 한 줄 구분 변경도 거절");
  const owner = await say(fx, "점심 7000원");
  t.ok(owner.text.includes("저장했어요"), "K-4 준비: 소유자 기록");
  const ownerRow = newest(fx);
  await say(fx, "수정 01번 구분 수입");
  t.eq(rowById(fx, ownerRow.id).type, "income", "K-4 ‘기록만’ 정책에서도 소유자는 구분을 바꾼다");
}, { selections: [["user-bin", HH], ["user-wifi", HH]] });

await scenario("K-4-4", async (fx) => {
  const ROOM = "room-v22977-kakao-edit";
  const linked = await say(fx, "단톡방 연결 HOME2265", { groupKey: ROOM });
  t.ok(linked.text.includes("단톡방 연결 완료"), "K-4 준비: 단톡방을 우리집 생활비에 연결");
  await say(fx, "저녁 9000원", { user: WIFI, groupKey: ROOM });
  const row = newest(fx);
  const changed = await say(fx, "수정 01번 구분 수입", { user: WIFI, groupKey: ROOM });
  t.ok(changed.text.includes("지출 → 수입으로 바꿨어요") && rowById(fx, row.id).type === "income", "K-4 단톡방 구성원도 자기 기록의 구분을 바꾼다");
  putSetting(fx, POLICY_KEY, { version: 1, mode: "record_only" });
  const refused = await say(fx, "수정 01번 구분 지출", { user: WIFI, groupKey: ROOM });
  t.ok(refused.text.includes(RECORD_ONLY) && rowById(fx, row.id).type === "income", "K-4 단톡방에서도 ‘기록만’ 구성원의 구분 변경은 거절");
});

if (process.env.AB_QA_CATEGORIES_ABSENT !== "1") {
  // 분류 표가 있는 운영: 사용자 수입 분류도 새 기록과 같은 분류기로 찾는다.
  await scenario("K-4-5", async (fx) => {
    await say(fx, "모임비 30000원");
    const row = newest(fx);
    t.eq(row.type, "expense", "K-4 준비: 모임비는 지출(기타지출)로 저장");
    // 총무가 걷은 모임비를 수입으로 적으려고, 저장한 뒤 수입 사용자 분류 ‘모임비’를 만들었다(먼저 있으면 저장 때 이미 수입이 된다).
    fx.db.accountbook_categories.push({ id: "cat-v22977-dues", household_id: HH, name: "모임비", type: "income", sort_order: 1, created_at: "2026-07-01T00:00:00Z" });
    const reply = await say(fx, "수정 01번 구분 수입");
    t.ok(rowById(fx, row.id).type === "income" && rowById(fx, row.id).category === "모임비" && reply.text.includes("분류: 기타지출 → 모임비"), "K-4 수입으로 바꾸면 사용자 수입 분류(모임비)도 찾는다");
  });
}

// ── D-6. 같은 이름의 가계부가 또 있으면 저장 답장의 ‘가계부:’ 줄에 고를 때 본 역할·만든 날을 붙인다 ─────────
await scenario("D-6", async (fx) => {
  fx.db.households.push({ id: "house-parents", name: "우리집 생활비", invite_code: "PARENT01", created_at: "2026-07-10T00:00:00.000Z" });
  fx.db.household_members.push(
    { household_id: "house-parents", user_id: "user-wifi", role: "owner", created_at: "2026-07-10T00:00:00.000Z" },
    { household_id: "house-parents", user_id: "user-bin", role: "member", created_at: "2026-07-11T00:00:00.000Z" },
  );
  const mine = "가계부: 우리집 생활비 · 소유자 · 만든 날 2026-07-01";
  const parents = "가계부: 우리집 생활비 · 구성원 · 만든 날 2026-07-10";
  const chooser = await say(fx, "가계부 전환");
  t.ok(chooser.text.includes("우리집 생활비 · 소유자 · 만든 날 2026-07-01"), "D-6 준비: 고르는 목록이 같은 이름을 역할·만든 날로 구별한다");
  await say(fx, "취소");
  const saved = await say(fx, "커피 4500");
  t.ok(newest(fx).household_id === HH && saved.text.split("\n").includes(mine), "D-6 저장 답장이 목록과 같은 꼴로 어느 ‘우리집 생활비’인지 밝힌다(내 가계부)");
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-parents");
  const other = await say(fx, "점심 9000");
  t.ok(newest(fx).household_id === "house-parents" && other.text.split("\n").includes(parents), "D-6 다른 쪽에 저장하면 그쪽 역할·만든 날");
  const bulk = await say(fx, "빵 3000\n우유 2500");
  t.ok(newest(fx).household_id === "house-parents" && bulk.text.split("\n").includes(parents), "D-6 여러 건 저장 답장도 같은 줄");
}, { day: "2026-07-15" });

await scenario("D-6 같은 이름 없음", async (fx) => {
  const saved = await say(fx, "커피 4500");
  t.ok(saved.text.split("\n").includes("가계부: 우리집 생활비"), "D-6 같은 이름이 없으면 예전처럼 이름만");
}, { day: "2026-07-15" });

// ── A-14. 오늘 기록 보기: 최근 기록을 번호순으로, 줄 단위로만 줄이고, 빠진 건수와 전체를 볼 곳을 말한다 ─────────
const FRUITS = ["사과", "배", "포도", "귤", "딸기", "수박", "참외", "자두", "복숭아", "망고", "키위", "레몬", "체리", "바나나", "파인애플", "블루베리", "석류", "무화과", "유자", "대추", "살구", "앵두", "모과", "오렌지", "자몽"];
function listChecks(list, total, label) {
  const lines = list.text.split("\n").filter((line) => /^\d{2}번 - /.test(line));
  const numbers = lines.map((line) => Number(line.slice(0, 2)));
  const shown = numbers.length;
  const omitted = total - shown;
  t.ok(list.text.length <= 950 && !list.text.includes("자세한 내용은 메뉴를 눌러 확인해주세요"), `A-14 ${label}: 카카오 길이 안에 들고, 끝을 잘라 내지 않는다(${list.text.length}자)`);
  t.ok(shown > 0 && numbers.at(-1) === total && !numbers.includes(1) && numbers.every((n, i) => i === 0 || n === numbers[i - 1] + 1), `A-14 ${label}: 가장 최근 기록(${pad(total)}번)까지 이어서 보이고 오래된 01번을 뺀다`);
  t.ok(lines.every((line) => /^\d{2}번 - .+ \/ [\d,]+원 \/ .+ \/ .+$/.test(line)), `A-14 ${label}: 줄 중간에서 끊긴 기록 줄이 없다`);
  t.ok(list.text.includes(`최근 ${shown}건을 번호순으로 보여요`) && list.text.includes(`외 ${omitted}건(01~${pad(omitted)}번)은 웹 가계부 기록에서 볼 수 있어요`), `A-14 ${label}: 순서와 빠진 건수(외 ${omitted}건)를 말한다`);
  t.ok(list.text.includes("/my?month=2026-08&household_id=house-home#records") && list.text.includes(`수정 ${pad(numbers[0])}번`), `A-14 ${label}: 전체를 볼 웹 기록 주소와 보이는 번호로 된 안내`);
}
await scenario("A-14 긴 메모", async (fx) => {
  const lines = FRUITS.map((name, i) => `${name} 장보기 메모를 아주 길게 적어 둔 내용 ${1000 + i * 10}원`);
  await say(fx, lines.join("\n"));
  t.eq(count(fx) - fx.db.transactions.filter((row) => row.transaction_date !== DAY).length, 25, "A-14 준비: 오늘 25건 저장");
  listChecks(await say(fx, "오늘 기록 보기"), 25, "긴 메모 25건");
});
await scenario("A-14 짧은 메모", async (fx) => {
  await say(fx, FRUITS.slice(0, 22).map((name, i) => `${name} ${1000 + i * 10}원`).join("\n"));
  listChecks(await say(fx, "오늘 기록 보기"), 22, "짧은 메모 22건");
});
await scenario("A-14 몇 건", async (fx) => {
  for (const text of ["커피 4500", "점심 9000", "택시 12000"]) await say(fx, text);
  const list = await say(fx, "오늘 기록 보기");
  t.ok(list.text.includes("01번 - 커피 / 4,500원") && list.text.includes("03번 - 택시 / 12,000원") && !list.text.includes("최근 ") && !list.text.includes("외 "), "A-14 다 들어가는 날은 예전처럼 01번부터 모두");
});
{
  // 카카오 답장 길이 자르기: 길면 줄 경계에서 자르고 안내를 붙인다(950자 안).
  const source = Array.from({ length: 40 }, (_, i) => `${pad(i + 1)}번 - 아주 긴 메모가 들어간 기록 ${FRUITS[i % FRUITS.length]} / 12,345원 / 국민카드 / 외식`);
  const body = JSON.parse(await kakaoText(source.join("\n")).text());
  const text = body.template.outputs[0].simpleText.text;
  const kept = text.split("\n").filter((line) => line && !line.includes("자세한 내용은 메뉴를 눌러 확인해주세요"));
  t.ok(text.length <= 1000 && text.endsWith("…자세한 내용은 메뉴를 눌러 확인해주세요.") && kept.length > 10 && kept.every((line) => source.includes(line)), "A-14 긴 답장은 줄 경계에서만 자른다(남은 줄이 모두 온전)");
}

// ── A-15. 메모는 금액·단위·서술어만 빼고 낱말을 자르지 않는다 ─────────────────────────────
await scenario("A-15", async (fx) => {
  const cases = [
    ["주차장 사용료 5000", "주차장 사용료", 5000],
    ["공동구매 30000", "공동구매", 30000],
    ["원정 경기 티켓 30000", "원정 경기 티켓", 30000],
    ["점심 김밥 4500원", "점심 김밥", 4500],
    ["점심 ₩12000", "점심", 12000],
    ["커피 만원정도", "커피", 10000],
    ["원정대 회비 20000", "원정대 회비", 20000],
    ["축의금 5만원정", "축의금", 50000],
    ["커피샀어 4500", "커피", 4500],
    ["관리비 납부 150000", "관리비", 150000],
    ["마트에서 장보기 32000원", "마트 장보기", 32000],
  ];
  for (const [text, memo, amount] of cases) {
    const before = count(fx);
    await say(fx, text);
    const row = newest(fx);
    t.ok(count(fx) === before + 1 && row.memo === memo && row.amount === amount, `A-15 "${text}" → 메모 "${memo}", ${amount}원 (받음: "${row.memo}", ${row.amount})`);
  }
});

if (SOFT) {
  console.log(`V22977_SOFT: 통과 ${base.done()} · 실패 ${failures.length}`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
