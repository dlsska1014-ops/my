// V22.9.144 예산 명령의 해 말(V122:K-5): ‘내년 1월 식비 예산 22만원’·‘2027년 1월 식비 예산 22만원’ 이 기록 길의 ‘달력에 없는 날짜여서 …’ 답으로
//  끝났다. 기록 파서는 해·달만 적고 날이 없는 말을 날짜 말로 보지만 날을 찾지 못하고, skill-handler 의 그 답이 예산 처리기보다 앞에 있었다.
//  예산 달 읽기도 ‘내년·올해·작년 …’ 을 읽지 않았다. 그래서 12월에 보낸 ‘내년 7월’ 을 올해 7월로, 분류를 ‘내년 1월 식비’ 로 읽었다.
//  이 검사가 보는 것(판 이름 글자는 적지 않는다):
//  1. 파서(모듈 직접 호출, 시계 고정): 해 말 + N월 → 그해 그달이고, 분류에서 해 말을 뗀다.
//     해 말 없는 ‘1월’ 은 예전처럼 가장 가까운 해다(V22.9.76 D-7). ‘재작년 12월’ 을 그 안의 ‘작년’ 으로 읽지 않는다.
//     해 말만 있고 달이 없으면(‘내년 예산 200만원’) 달 읽기는 예전과 같다. 해 말 목록은 기록 파서(explicitDateIntent)의 것과 같다.
//  2. 카카오 스킬 끝단(픽스처, 1:1·단톡방)
//     - 소유자: 그 달 예산이 저장되고 기록은 늘지 않는다.
//     - 구성원: 권한 안내 그대로다.
//     - 날을 적은 말(‘2월 30일 …’·‘2/30 …’·‘2.30 …’·‘2월 30 예산’·‘내년 2월 30 …’·전각 숫자)과 1~12 밖의 달(‘2027년 13월 …’): 예전처럼 달력 답이고
//       저장하지 않는다(독립 검토 F2). 해 말 없는 ‘13월 식비 예산 …’ 은 이번 달 예산을 덮어쓰지 않는다(F1 — 예전에는 덮어씀).
//     - 열린 수정 창은 이 말을 비켜 간다(‘내년’·‘금년’ 은 칸 이름 ‘내용’·‘금액’ 과 한 글자 차이 — 기록은 그대로, 창은 남는다).
//       열린 단계 흐름(예산 설정·이름·새 가계부·가계부 고르기)은 끊긴다(F3 — 흐름이 이 말을 금액·이름 값으로 받지 않는다).
//     - 가계부를 아직 고르지 않았으면 예전처럼 고르게 하고 저장하지 않는다.
//     - ‘예산 현황’ 도 해 말을 읽는다.
//  3. 원본: 달력 답·수정 창·흐름 끊기가 같은 판정(isKakaoBudgetYearMonthCommand)을 쓴다.
//  오프라인: DB·바깥 요청 없음.
import { readFileSync } from "node:fs";
import { counter, fixture, skill, withClock } from "./lib-audit-v22934.mjs";
import { isKakaoBudgetYearMonthCommand, parseBudgetMonthHint, parseDirectBudgetSetCommand } from "../src/modules/kakao/household-budget-commands.js";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const { ok, eq, done } = counter("V22.9.144 예산 명령의 해 말(내년·올해·작년 + N월)·달력 답 앞 예산 명령 검사 통과");

const CALENDAR = "달력에 없는 날짜여서 기록을 저장하지 않았어요.";
const OWNER_ONLY = "예산은 가계부 소유자 또는 관리자만 설정할 수 있어요.";
const OWNER = "kakao_login:2265";
const MEMBER = "kakao_login:2266";
const ROOM = "room-v229144-budget-year";
const CHOOSE = "사용할 가계부를 선택해 주세요.";
const p = (t) => { const r = parseDirectBudgetSetCommand(t); return r ? `${r.month} ${r.category} ${r.amount}` : null; };

// ── 1. 파서: 12월(2026-12-05) ──────────────────────────────────────────────
await withClock("2026-12-05", async () => {
  eq(p("내년 1월 식비 예산 22만원"), "2027-01 식비 220000", "12월: ‘내년 1월 식비 예산 22만원’ → 2027-01 식비(예전: 분류 ‘내년 1월 식비’)");
  eq(p("2027년 1월 식비 예산 22만원"), "2027-01 식비 220000", "12월: ‘2027년 1월 식비 예산 22만원’ → 2027-01 식비");
  eq(p("1월 식비 예산 21만원"), "2027-01 식비 210000", "12월: 해 말 없는 ‘1월’ 은 예전처럼 가장 가까운 해(2027-01)");
  eq(p("올해 12월 식비 예산 30만원"), "2026-12 식비 300000", "12월: ‘올해 12월’ → 2026-12 식비");
  eq(p("금년 12월 식비 예산 30만원"), "2026-12 식비 300000", "12월: ‘금년 12월’ → 2026-12 식비");
  eq(p("내년 7월 식비 예산 30만원"), "2027-07 식비 300000", "12월: ‘내년 7월’ → 2027-07(예전: 가장 가까운 해 규칙으로 2026-07)");
  eq(p("내년 1월 예산 200만원"), "2027-01 __total 2000000", "12월: ‘내년 1월 예산 200만원’ → 2027-01 전체 예산(예전: 분류 ‘내년 1월’)");
  eq(p("2027년 1월 예산 200만원"), "2027-01 __total 2000000", "12월: ‘2027년 1월 예산 200만원’ → 2027-01 전체 예산");
  eq(p("작년 12월 식비 예산 10만원"), "2025-12 식비 100000", "12월: ‘작년 12월’ → 2025-12(예전: 2026-12)");
  eq(p("재작년 12월 식비 예산 10만원"), "2024-12 식비 100000", "12월: ‘재작년 12월’ → 2024-12(그 안의 ‘작년’ 으로 읽지 않는다)");
  eq(p("지난 해 12월 식비 예산 10만원"), "2025-12 식비 100000", "12월: ‘지난 해 12월’ → 2025-12");
  eq(p("지난해 12월 식비 예산 10만원"), "2025-12 식비 100000", "12월: ‘지난해 12월’ → 2025-12");
  eq(p("다음 해 3월 식비 예산 10만원"), "2027-03 식비 100000", "12월: ‘다음 해 3월’ → 2027-03");
  eq(p("다음해 3월 식비 예산 10만원"), "2027-03 식비 100000", "12월: ‘다음해 3월’ → 2027-03");
  eq(p("내년 1월 식비 예산설정 22만원"), "2027-01 식비 220000", "12월: ‘내년 1월 식비 예산설정 22만원’(달 말 정규식 길) → 2027-01 식비");
  eq(p("내년 1월 예산설정 200만원"), "2027-01 __total 2000000", "12월: ‘내년 1월 예산설정 200만원’(전체 예산 길) → 2027-01 전체 예산");
  eq(p("내년 1월 식비 예산 22.5만원"), "2027-01 식비 225000", "12월: 금액의 소수점(22.5만원)도 그대로");
  eq(p("내년 1월 예산"), null, "12월: 금액 없는 ‘내년 1월 예산’ 은 예산 설정 명령이 아니다(예전과 같음)");
  eq(p("점심 12000원"), null, "‘점심 12000원’ 은 예산 명령이 아니다");
  eq(parseBudgetMonthHint("내년 예산 200만원"), "2026-12", "12월: 달 없이 해 말만 있으면 달 읽기는 예전과 같다(이번 달)");
  eq(parseBudgetMonthHint("내년 7월 예산 현황"), "2027-07", "12월: ‘내년 7월 예산 현황’ 의 달 → 2027-07");
  eq(parseBudgetMonthHint("다음달 식비 예산"), "2027-01", "12월: ‘다음달’ 은 예전과 같다");
  eq(parseBudgetMonthHint("지난달 예산 현황"), "2026-11", "12월: ‘지난달’ 은 예전과 같다");
  eq(parseBudgetMonthHint("12월 예산 현황"), "2026-12", "12월: ‘12월’ 은 예전과 같다");

  // 독립 검토 F1: 1~12 밖의 달은 예산 설정 명령이 아니다(예전에는 이번 달로 떨어져 이번 달 예산을 덮어썼다). 예산 현황의 달은 예전처럼 이번 달.
  eq(p("13월 식비 예산 30만원"), null, "12월: ‘13월 식비 예산 30만원’ 은 예산 설정 명령이 아니다(예전: 2026-12 식비로 저장)");
  eq(p("2027년 13월 예산 200만원"), null, "12월: ‘2027년 13월 예산 200만원’ 은 예산 설정 명령이 아니다");
  eq(p("내년 13월 식비 예산 30만원"), null, "12월: ‘내년 13월 식비 예산 30만원’ 은 예산 설정 명령이 아니다");
  eq(p("내년 0월 식비 예산 30만원"), null, "12월: ‘내년 0월 식비 예산 30만원’ 은 예산 설정 명령이 아니다");
  eq(p("0월 예산 200만원"), null, "12월: ‘0월 예산 200만원’ 은 예산 설정 명령이 아니다");
  eq(parseBudgetMonthHint("13월 예산 현황"), "2026-12", "12월: 예산 현황의 ‘13월’ 은 예전처럼 이번 달");

  // 달력 답을 건너뛰는 판정: 해 말·연도 + N월(뒤에 날 숫자 없음)을 떼고 남은 말에 기록 파서가 날짜 말로 볼 것이 없고, 금액 있는 예산 설정 명령일 때만.
  const yes = ["내년 1월 식비 예산 22만원", "2027년 1월 예산 200만원", "올해 12월 식비 예산 30만원", "내년 １월 식비 예산 ２２만원", "내년 1월 식비 예산 22.5 만원",
    "내년 1월 식비 예산 22.5만원", "재작년 3월 식비 예산 10만원", "지난 해 12월 식비 예산 10만원", "내년 01월 식비 예산 22만원"];
  for (const s of yes) ok(isKakaoBudgetYearMonthCommand(s), `달력 답을 건너뛰는 말이다: ‘${s}’`);
  const no = ["1월 식비 예산 22만원", "내년 2월 30 식비 예산", "내년 2월 30일 식비 예산 22만원", "내년 2월 30 식비 예산 22만원", "2027년 13월 예산 200만원",
    "내년 0월 식비 예산 30만원", "내년 1월 예산", "내년 1월 점심 12000원", "２월 ３０일 식비 예산 30만원", "2월 30 예산", "내년 1월 2/30 식비 예산 22만원",
    "내년 1월 3일 식비 예산 22만원", "내년 예산 200만원"];
  for (const s of no) ok(!isKakaoBudgetYearMonthCommand(s), `달력 답을 건너뛰지 않는 말이다: ‘${s}’`);
  ok(isKakaoBudgetYearMonthCommand("금년 1월 식비 예산 22만원", { leading: true }), "수정 창 판정(leading): 해 말로 시작하는 ‘금년 1월 …’ 은 참");
  ok(isKakaoBudgetYearMonthCommand("내용 내년 1월 식비 예산 22만원") && !isKakaoBudgetYearMonthCommand("내용 내년 1월 식비 예산 22만원", { leading: true }),
    "수정 창 판정(leading): 칸 이름을 먼저 적은 ‘내용 내년 1월 …’ 은 거짓(세션 값으로 남는다)");

  // 해 말 목록 = 기록 파서가 날짜 말로 보는 해 말(client/shared-input-parsers.js explicitDateIntent). 그쪽에 낱말이 늘면 이 검사가 먼저 떨어진다.
  const parsers = read("src/modules/client/shared-input-parsers.js");
  const group = (parsers.match(/\(\?:\^\|\\s\)\(\?:((?:[가-힣]+(?:\\s\*[가-힣]+)?\|?)+)\)\\s\*\\d\{1,2\}\\s\*\(\?:월\|\[\.\/-\]\)/) || [])[1] || "";
  const words = group.split("|").filter(Boolean).map((w) => w.replace(/\\s\*/g, " "));
  eq(words.join(","), "재작년,작년,지난 해,올해,금년,내년,다음 해", "기록 파서의 해 말 목록을 읽었다(바뀌면 예산 달 읽기도 맞춘다)");
  const SHIFT = { 재작년: -2, 작년: -1, "지난 해": -1, 올해: 0, 금년: 0, 내년: 1, "다음 해": 1 };
  for (const word of words) {
    eq(parseBudgetMonthHint(`${word} 3월 식비 예산 10만원`), `${2026 + SHIFT[word]}-03`, `12월: 기록 파서의 해 말 ‘${word} 3월’ 을 예산 달로 읽는다`);
    eq(p(`${word} 3월 식비 예산 10만원`), `${2026 + SHIFT[word]}-03 식비 100000`, `12월: ‘${word} 3월 식비 예산 10만원’ 의 분류에서 해 말을 뗀다`);
  }
});

// ── 1. 파서: 1월(2027-01-10)·7월(2026-07-15) — 해가 바뀐 뒤와 가장 가까운 해 규칙의 경계 ─────────
await withClock("2027-01-10", async () => {
  eq(p("작년 12월 식비 예산 10만원"), "2026-12 식비 100000", "1월: ‘작년 12월’ → 2026-12(예전: 가장 가까운 해 2026-12 와 같지만 해 말로 읽음)");
  eq(p("올해 12월 식비 예산 30만원"), "2027-12 식비 300000", "1월: ‘올해 12월’ → 2027-12(예전: 2026-12)");
  eq(p("12월 식비 예산 40만원"), "2026-12 식비 400000", "1월: 해 말 없는 ‘12월’ 은 예전처럼 가장 가까운 해(2026-12)");
  eq(parseBudgetMonthHint("지난 해 12월 예산 현황"), "2026-12", "1월: ‘지난 해 12월 예산 현황’ 의 달 → 2026-12");
});
await withClock("2026-07-15", async () => {
  eq(p("올해 1월 식비 예산 22만원"), "2026-01 식비 220000", "7월: ‘올해 1월’ → 2026-01(예전: 가장 가까운 해 규칙으로 2027-01)");
  eq(p("1월 식비 예산 21만원"), "2027-01 식비 210000", "7월: 해 말 없는 ‘1월’ 은 예전처럼 앞날(거리 6개월은 앞날)");
  eq(p("내년 7월 식비 예산 30만원"), "2027-07 식비 300000", "7월: ‘내년 7월’ → 2027-07(예전: 2026-07)");
  eq(p("작년 7월 식비 예산 30만원"), "2025-07 식비 300000", "7월: ‘작년 7월’ → 2025-07(예전: 2026-07)");
});

// ── 2. 카카오 스킬 끝단(픽스처) ──────────────────────────────────────────────
function makeRun(fx, user, groupKey = "") {
  return async function run(utterance) {
    const rows = () => JSON.stringify((fx.db.accountbook_budgets || []).map((row) => [row.month, row.category, row.amount]).sort());
    const before = (fx.db.transactions || []).length;
    const budgetsBefore = rows();
    const r = await skill(fx, utterance, { user, groupKey });
    const budget = (month, category) => (fx.db.accountbook_budgets || []).find((row) => row.month === month && row.category === category);
    return { text: String(r == null ? "" : r), added: (fx.db.transactions || []).length - before, budgetChanged: budgetsBefore !== rows(), budget };
  };
}

await withClock("2026-12-05", () => fixture(async (fx) => {
  // 픽스처의 소유자 계정에는 가계부가 둘이라 1:1 이 먼저 가계부를 고르게 한다 — V22.9.113 검사처럼 ‘우리집 생활비’ 를 골라 둔다.
  fx.db.accountbook_settings.push({ id: "sel-v144-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  fx.db.accountbook_settings.push({ id: "sel-v144-wifi", key: "kakao_selected_household_v2251:user-wifi", value: "house-home", created_at: "2026-07-01T00:00:00Z" });
  const run = makeRun(fx, OWNER);
  const julyFood = JSON.stringify((fx.db.accountbook_budgets || []).find((row) => row.month === "2026-07" && row.category === "식비") || null);

  const nextJan = await run("내년 1월 식비 예산 22만원");
  eq(nextJan.added, 0, "1:1 소유자 ‘내년 1월 식비 예산 22만원’ 은 기록을 늘리지 않는다");
  ok(!nextJan.text.includes(CALENDAR), "1:1 소유자 ‘내년 1월 식비 예산 22만원’ 의 답이 달력 답이 아니다(예전: 달력 답)");
  ok(nextJan.text.includes("✅ 2027-01 식비 예산을 설정했어요."), "1:1 소유자 ‘내년 1월 식비 예산 22만원’ → 2027-01 식비 예산 설정 답");
  eq(nextJan.budget("2027-01", "식비")?.amount, 220000, "2027-01 식비 예산이 220,000원이다");

  const yearJan = await run("2027년 1월 예산 200만원");
  eq(yearJan.added, 0, "1:1 소유자 ‘2027년 1월 예산 200만원’ 은 기록을 늘리지 않는다");
  ok(yearJan.text.includes("✅ 2027-01 전체 월 예산을 설정했어요."), "1:1 소유자 ‘2027년 1월 예산 200만원’ → 2027-01 전체 월 예산 설정 답");
  eq(yearJan.budget("2027-01", "__total")?.amount, 2000000, "2027-01 전체 예산이 2,000,000원이다");

  const nextJuly = await run("내년 7월 식비 예산 30만원");
  eq(nextJuly.added, 0, "1:1 소유자 ‘내년 7월 식비 예산 30만원’ 은 기록을 늘리지 않는다");
  eq(nextJuly.budget("2027-07", "식비")?.amount, 300000, "‘내년 7월 식비 예산 30만원’ → 2027-07 식비 300,000원");
  eq(JSON.stringify(nextJuly.budget("2026-07", "식비") || null), julyFood, "2026-07 식비 예산은 그대로다(예전에는 올해 7월에 저장)");

  const decimal = await run("내년 1월 식비 예산 22.5만원");
  eq(decimal.added, 0, "‘내년 1월 식비 예산 22.5만원’ 은 기록을 늘리지 않는다");
  eq(decimal.budget("2027-01", "식비")?.amount, 225000, "‘내년 1월 식비 예산 22.5만원’ → 2027-01 식비 225,000원(소수점 금액은 날로 보지 않는다)");

  const plainJan = await run("1월 식비 예산 21만원");
  eq(plainJan.budget("2027-01", "식비")?.amount, 210000, "해 말 없는 ‘1월 식비 예산 21만원’ 도 예전처럼 2027-01 식비");

  const spacedDecimal = await run("내년 2월 식비 예산 22.5 만원");
  eq(spacedDecimal.budget("2027-02", "식비")?.amount, 225000, "‘내년 2월 식비 예산 22.5 만원’(소수점 금액 뒤 띄어쓰기) → 2027-02 식비 225,000원");
  const wide = await run("내년 ３월 식비 예산 ２３만원");
  eq(wide.budget("2027-03", "식비")?.amount, 230000, "전각 숫자 ‘내년 ３월 식비 예산 ２３만원’ → 2027-03 식비 230,000원");

  // 독립 검토 F1: 해 말 없는 ‘13월 …’ 은 이번 달 예산을 덮어쓰지 않는다(예전에는 덮어씀). 해 말·연도 + 13월·0월은 예전처럼 달력 답.
  const month13 = await run("13월 식비 예산 31만원");
  ok(!month13.budgetChanged && month13.added === 0, "‘13월 식비 예산 31만원’ 은 예산도 기록도 바꾸지 않는다(예전: 2026-12 식비를 덮어씀)");
  ok(!month13.text.includes("예산을 설정했어요"), "‘13월 식비 예산 31만원’ 의 답은 예산 설정 답이 아니다");

  // 독립 검토 F2: 날을 적은 말·1~12 밖의 달은 예전처럼 달력 답(저장 없음).
  for (const utterance of ["2027년 13월 예산 200만원", "내년 0월 식비 예산 30만원", "2월 30 예산", "내년 2월 30 식비 예산", "２월 ３０일 식비 예산 30만원", "내년 2월 30 식비 예산 22만원"]) {
    const r = await run(utterance);
    ok(r.text.startsWith(CALENDAR), `‘${utterance}’ 는 예전처럼 달력 답이다`);
    ok(r.added === 0 && !r.budgetChanged, `‘${utterance}’ 는 기록도 예산도 바꾸지 않는다`);
  }

  // 독립 검토 F3: 열린 수정 창은 해 말 예산 명령을 비켜 간다 — 기록은 그대로이고 창은 남아 다음 ‘금액 …’ 을 받는다.
  const saved = await skill(fx, "김밥 3500원", { user: OWNER, groupKey: "" });
  const seq = (String(saved || "").match(/(\d{2})번 - 김밥/) || [])[1];
  const gimbapId = ((fx.db.transactions || []).find((row) => row.memo === "김밥" && Number(row.amount) === 3500) || {}).id;
  const gimbap = () => (fx.db.transactions || []).find((row) => row.id === gimbapId) || {};
  ok(!!seq && !!gimbapId, "수정 창 시험용 기록 ‘김밥 3500원’ 을 저장했다");
  const open = await skill(fx, `수정 ${seq}번`, { user: OWNER, groupKey: "" });
  ok(String(open || "").includes("무엇을 바꿀까요?"), "‘수정 N번’ 으로 수정 창을 열었다");
  for (const [utterance, month, amount] of [["내년 8월 식비 예산 23만원", "2027-08", 230000], ["금년 2월 식비 예산 24만원", "2026-02", 240000], ["2027년 9월 식비 예산 25만원", "2027-09", 250000]]) {
    const r = await run(utterance);
    eq(r.budget(month, "식비")?.amount, amount, `열린 수정 창에서도 ‘${utterance}’ → ${month} 식비 예산(예전: 달력 답 — 이번 판 첫 고침에서는 ‘내용’ 값으로 삼킴)`);
    ok(!/내용을|금액을/.test(r.text), `열린 수정 창이 ‘${utterance}’ 를 칸 값으로 묻지 않는다`);
    eq(`${gimbap().memo}|${gimbap().amount}`, "김밥|3500", `‘${utterance}’ 뒤에도 기록은 그대로다`);
  }
  const afterBypass = await skill(fx, "금액 3600", { user: OWNER, groupKey: "" });
  ok(String(afterBypass || "").includes("금액을 3,600원으로 변경했어요"), "비켜 간 뒤에도 수정 창은 남아 ‘금액 3600’ 을 받는다");
  eq(Number(gimbap().amount), 3600, "기록 금액이 3,600원으로 바뀌었다");
  // 칸 이름을 먼저 적은 말은 비켜 가지 않고 세션이 받는다(세션은 새 기록인지 되묻고 아무것도 바꾸지 않는다).
  await skill(fx, `수정 ${seq}번`, { user: OWNER, groupKey: "" });
  const fieldFirst = await run("내용 내년 10월 식비 예산 26만원");
  ok(!fieldFirst.budgetChanged && fieldFirst.added === 0, "칸 이름을 먼저 적은 ‘내용 내년 10월 …’ 은 예산도 기록 수도 바꾸지 않는다(비켜 가지 않는다)");
  eq(`${gimbap().memo}|${gimbap().amount}`, "김밥|3600", "칸 이름을 먼저 적은 말도 묻지 않고 기록을 바꾸지 않는다");

  // 독립 검토 F3: 열린 단계 흐름은 끊기고 예산 처리기가 받는다(흐름의 달·이름·새 가계부 값으로 받지 않는다).
  const householdsBefore = (fx.db.households || []).length;
  const flows = [
    [["예산설정", "카테고리별 예산", "식비"], "내년 4월 식비 예산 26만원", "2027-04", 260000, "설정하기", "예산 설정 흐름(금액 단계)"],
    [["예산설정", "전체 월 예산"], "2027년 5월 예산 270만원", "2027-05", 2700000, "설정하기", "예산 설정 흐름(전체 예산 금액 단계)"],
    [["내 이름 설정"], "내년 6월 식비 예산 27만원", "2027-06", 270000, "", "이름 흐름"],
    [["새 가계부 만들기", "직접 입력"], "내년 7월 식비 예산 28만원", "2027-07", 280000, "네", "새 가계부 흐름(이름 단계)"],
    [["가계부 전환"], "내년 11월 식비 예산 29만원", "2027-11", 290000, "", "가계부 고르기(이미 고른 가계부가 있음)"],
  ];
  for (const [steps, utterance, month, amount, after, label] of flows) {
    for (const step of steps) await skill(fx, step, { user: OWNER, groupKey: "" });
    const r = await run(utterance);
    const category = month === "2027-05" ? "__total" : "식비";
    eq(r.budget(month, category)?.amount, amount, `${label}: ‘${utterance}’ → ${month} 예산(흐름 값으로 받지 않는다)`);
    eq(r.added, 0, `${label}: ‘${utterance}’ 는 기록을 늘리지 않는다`);
    if (after) {
      const next = await run(after);
      ok(!next.budgetChanged, `${label}: 끊긴 뒤의 ‘${after}’ 는 예산을 바꾸지 않는다(흐름이 닫혔다)`);
    }
  }
  eq((fx.db.households || []).length, householdsBefore, "새 가계부 흐름에서 해 말 예산 명령이 가계부 이름이 되지 않았다(가계부 수 그대로)");
  const selected = (fx.db.accountbook_settings || []).find((row) => row.key === "kakao_selected_household_v2251:user-bin");
  eq(selected?.value, "house-home", "가계부 고르기가 끊겨도 고른 가계부는 그대로다");

  for (const utterance of ["2월 30일 식비 예산 30만원", "2/30 식비 예산 30만원", "2.30 식비 예산 30만원", "2월 30일 점심 12000원"]) {
    const r = await run(utterance);
    ok(r.text.startsWith(CALENDAR), `날을 적은 ‘${utterance}’ 는 예전처럼 달력 답이다`);
    eq(r.added, 0, `‘${utterance}’ 는 기록을 늘리지 않는다`);
    ok(!r.budgetChanged, `‘${utterance}’ 는 예산도 바꾸지 않는다`);
  }

  const view = await run("내년 7월 예산 현황");
  ok(view.text.includes("2027-07 예산 현황"), "‘내년 7월 예산 현황’ → 2027-07 예산 현황(예전: 2026-07)");
  eq(view.added, 0, "‘내년 7월 예산 현황’ 은 기록을 늘리지 않는다");

  const noAmount = await run("내년 1월 예산");
  eq(noAmount.added, 0, "금액 없는 ‘내년 1월 예산’ 은 기록을 늘리지 않는다");
  ok(!noAmount.budgetChanged && !noAmount.text.includes(CALENDAR), "금액 없는 ‘내년 1월 예산’ 은 예산을 바꾸지 않고 달력 답도 아니다(예전과 같은 되묻기)");

  // 단톡방: 방을 잇고 소유자·구성원이 같은 말을 보낸다.
  const link = await skill(fx, "단톡방 연결 HOME2265", { user: OWNER, groupKey: ROOM });
  ok(String(link || "").includes("단톡방 연결 완료"), "시험 방을 가계부에 이었다");
  const roomOwner = makeRun(fx, OWNER, ROOM);
  const thisDec = await roomOwner("올해 12월 식비 예산 30만원");
  eq(thisDec.added, 0, "단톡방 소유자 ‘올해 12월 식비 예산 30만원’ 은 기록을 늘리지 않는다");
  ok(thisDec.text.includes("✅ 2026-12 식비 예산을 설정했어요."), "단톡방 소유자 ‘올해 12월 식비 예산 30만원’ → 2026-12 식비 예산 설정 답(예전: 달력 답)");
  eq(thisDec.budget("2026-12", "식비")?.amount, 300000, "2026-12 식비 예산이 300,000원이다");
  const lastDec = await roomOwner("작년 12월 식비 예산 10만원");
  eq(lastDec.budget("2025-12", "식비")?.amount, 100000, "단톡방 소유자 ‘작년 12월 식비 예산 10만원’ → 2025-12 식비 100,000원");
  eq(thisDec.budget("2026-12", "식비")?.amount, 300000, "‘작년 12월’ 은 2026-12 식비 예산을 건드리지 않는다");

  const roomMember = makeRun(fx, MEMBER, ROOM);
  for (const utterance of ["내년 1월 식비 예산 22만원", "내년 1월 예산 200만원"]) {
    const r = await roomMember(utterance);
    eq(r.text.trim(), OWNER_ONLY, `단톡방 구성원 ‘${utterance}’ → 예전과 같은 권한 안내(달력 답이 아니다)`);
    eq(r.added, 0, `단톡방 구성원 ‘${utterance}’ 는 기록을 늘리지 않는다`);
    ok(!r.budgetChanged, `단톡방 구성원 ‘${utterance}’ 는 예산을 바꾸지 않는다`);
  }
  const memberView = await roomMember("내년 7월 예산 현황");
  ok(memberView.text.includes("2027-07 예산 현황"), "단톡방 구성원 ‘내년 7월 예산 현황’ → 2027-07 예산 현황");
}));

// 가계부를 아직 고르지 않은 1:1(가계부 둘): 예전처럼 고르게 하고 아무 가계부에도 저장하지 않는다(흐름 안에서도).
await withClock("2026-12-05", () => fixture(async (fx) => {
  const run = makeRun(fx, OWNER);
  const first = await run("내년 1월 식비 예산 22만원");
  ok(first.text.includes(CHOOSE) && !first.budgetChanged, "고른 가계부가 없으면 ‘내년 1월 식비 예산 22만원’ 은 가계부를 고르게 하고 저장하지 않는다");
  await skill(fx, "가계부 전환", { user: OWNER, groupKey: "" });
  const inFlow = await run("내년 2월 식비 예산 22만원");
  ok(inFlow.text.includes(CHOOSE) && !inFlow.budgetChanged, "가계부 고르기 흐름 안에서도 고른 가계부가 없으면 저장하지 않는다");
  await skill(fx, "2", { user: OWNER, groupKey: "" });
  const picked = await run("내년 3월 식비 예산 22만원");
  eq(picked.budget("2027-03", "식비")?.amount, 220000, "가계부를 고른 뒤에는 ‘내년 3월 식비 예산 22만원’ 이 저장된다");
}));

// ── 3. 원본: 달력 답의 예외는 예산 처리기보다 앞이고 날을 적은 말을 거른다 ─────────────
const handler = read("src/modules/kakao/skill-handler.js");
const calendarAt = handler.indexOf(`return kakaoText("${CALENDAR}`);
const budgetAt = handler.indexOf("const directBudget = parseDirectBudgetSetCommand(utterance);");
ok(calendarAt > 0 && budgetAt > calendarAt, "skill-handler: 달력 답이 예산 처리기보다 앞에 있다(그래서 예외가 필요하다)");
const calendarLine = handler.slice(handler.lastIndexOf("if (!separatePurchaseCommand", calendarAt), calendarAt);
ok(calendarLine.includes("!isKakaoBudgetYearMonthCommand(utterance)"), "skill-handler: 달력 답 조건의 예외는 해 말 예산 명령 판정 하나다");
const bypass = handler.slice(handler.indexOf("function isKakaoEditSessionBypassCommand("), handler.indexOf("function isKakaoEditSessionBypassCommand(") + 2400);
const leadingAt = bypass.indexOf("isKakaoBudgetYearMonthCommand(t, { leading: true })");
ok(leadingAt > 0 && leadingAt < bypass.indexOf("startsWithKakaoEditField(t)"), "skill-handler: 수정 창은 칸 이름 판정보다 먼저 해 말로 시작하는 예산 명령을 비켜 보낸다");
ok(/shouldInterruptKakaoFlowV2254\(activeFlowBeforeRouting, utterance\) \|\| isKakaoBudgetYearMonthCommand\(utterance\)/.test(handler), "skill-handler: 새 가계부·참여·가계부 고르기 흐름은 해 말 예산 명령에서 끊긴다");
const flowsSrc = read("src/modules/kakao/guided-flows.js");
ok(/\|\| isKakaoBudgetYearMonthCommand\(utterance\)\) \{\n\s*await clearKakaoFlowState/.test(flowsSrc), "guided-flows: 예산 설정·이름 흐름은 해 말 예산 명령에서 끊긴다");

const versionTxt = read("VERSION.txt").trim();
const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);

done();
