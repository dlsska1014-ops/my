// V22.9.81 — 입력 해석 묶음(nlu): V80 새 발견 U-24·U-9·U-25·U-6·U-7·U-8·U-10.
//
// ── 이 파일이 왜 생겼는지 ──
//   U-24 여러 건 입력의 머리 날짜에 ‘지난·저번 + 요일’·‘모레’·‘20260731’·달 없이 쓴 ‘25일’이 없어, "지난 금요일 커피 4500원 택시 8000원"의
//        택시가 오늘로 저장됐다(커피만 7월 31일). 카카오 저장도 같았다.
//   U-9  ‘월세 오십 오만원’이 두 건(50원·50,000원)으로 나뉘었다(서버·웹 같음).
//   U-25 ‘2월 30일 요약’이 3월 2일 금액을 ‘2월 30일’ 제목으로 보였고(분석 링크는 3월), ‘13월 5일 요약’은 ‘2025년 13월 5일’이었다.
//   U-6  ‘지지난달 요약’·‘지지난주 요약’을 지난달·지난주로 읽었다.
//   U-7  같은 ‘통신비 50000 자동이체’가 웹은 자동이체, 카카오는 계좌이체로 저장됐다.
//   U-8  홈 빠른 입력의 분류 이름 맞춤(서버 분류를 못 부를 때)이 낱말 속 이름을 찾았다(‘점심 9000 급여통장’ → 급여).
//   U-10 카카오 기록 수정에서 구분을 바꿀 때 다시 분류하는 근거에 저절로 채운 메모가 들어갔다(‘용돈 9000 농협체크’를 지출로 → 장보기).
//
// ── 어떻게 잡는가 ──
// 같은 문장을 ① 카카오 해석(parseMultipleTransactions)과 POST /skill 저장, ② 홈이 실제로 받는 자산을 가짜 DOM 에서 돌린 웹 빠른 입력,
// ③ 웹 폼 저장(POST /admin/transactions)에 넣어 결과와 서로의 같음을 본다. 항목마다 고쳐진 것(양성)과 예전 그대로여야 하는 것(음성)을 함께 둔다.
// 요일 말은 수요일(2026-08-05)·금요일·토요일·일요일·월요일 기준일에서 모두 본다(‘지난 금요일’과 ‘지난주 금요일’은 주말에 다르다).
// V22981_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 세는 용도).
import vm from "node:vm";
import { app, BASE, ctx, counter, fixture, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { extractLeadingDateHint, hasDateHint } from "../src/modules/nlu/transaction-parser.js";

const SOFT = process.env.V22981_SOFT === "1";
const base = counter("V22.9.81 입력 해석(U-24 여러 건 머리 날짜·U-9 띄어 쓴 금액·U-25 없는 날짜 요약·U-6 지지난달·U-7 자동이체·U-8 분류 이름 낱말·U-10 구분 바꿀 때 분류) 웹·카카오 같은 해석 검사");
const failures = [];
let softChecks = 0;
const t = {
  ok(value, message) {
    if (SOFT) { softChecks += 1; if (!value) failures.push(message); return; }
    base.ok(value, message);
  },
  eq(actual, expected, message) {
    if (SOFT) { softChecks += 1; if (actual !== expected) failures.push(`${message} (받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`); return; }
    base.eq(actual, expected, message);
  },
};
// 장면 하나가 고치기 전 코드에서 예외로 멈춰도(없는 함수 등) SOFT 모드에서는 실패 하나로 세고 다음 장면으로 간다.
async function scene(name, task) {
  if (!SOFT) return task();
  try { await task(); } catch (error) { softChecks += 1; failures.push(`${name} 장면이 멈춤: ${error?.message || error}`); }
}

const HH = "house-home";
const DAY = "2026-08-05"; // 수요일
const BIN = "kakao_login:2265";

// 카카오 스킬 호출. 같은 발화를 막는 장치(프로세스 전역)를 매번 비우고, 뒤로 미룬 저장(waitUntil)까지 기다린다.
async function say(fx, utterance, user = BIN) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  const body = { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  await Promise.allSettled(jobs);
  await Promise.allSettled(jobs);
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  return (json?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}
const rowsOf = (list) => (Array.isArray(list) ? list : []).map((row) => ({ memo: row.memo, amount: row.amount, date: row.transaction_date, payment: row.payment_method || "", category: row.category }));
const show = (list) => JSON.stringify(rowsOf(list).map((row) => `${row.memo}:${row.amount}:${row.date}`));

// ════════════════════════════════════════════════════════════════════════════════════
// U-24. 여러 건 입력의 머리 날짜는 한 건 입력이 그 말을 읽는 날짜를 모든 거래에 준다
// ════════════════════════════════════════════════════════════════════════════════════
// 한 건 파서(quickInputDate·resolveWeekdayPhrase)가 날짜로 읽는 말. 머리 날짜 표(AB_DATE_PHRASES)의 꼴마다 하나 이상 둔다.
const DATE_HEADS = [
  "지난 금요일", "지난금요일", "저번 금요일", "저번금요일", "지난 월요일", "저번 일요일", // U-24 본 결함(V22.9.78 N-12 의 주 없는 꼴)
  "모레", "20260731", "25일", "3일", "31일", // 머리 날짜에서 빠져 있던 다른 꼴
  "지난주 금요일", "저번주 금요일", "전주 화요일", "이번주 월요일", "금주 수요일", "다음주 월요일", "내주 화요일", "금요일", "일요일",
  "오늘", "어제", "그제", "그저께", "엊그제", "그끄저께", "어젯밤", "전날", "내일", "어제저녁", "오늘아침",
  "하루 전", "이틀 전", "사흘 전", "보름 전", "3일 전", "2주 전", "일주일 전", "한 달 전", "두 달 전",
  "지난달 말일", "이번 달 말일", "말일", "지난달 25일", "저번 달 5일", "이번달 3일", "이달 1일",
  "2026.7.31", "2026-07-31", "2026년 7월 31일", "7월 31일", "7/31", "7.31", "작년 12월 25일", "올해 3월 1일", "작년 12/25",
];
// 머리 날짜가 아닌 말: 낱말 속 하루 말·한 건 파서도 그 뜻으로 읽지 않는 주 말·날짜가 아닌 ‘일’
// 때 말이 붙은 하루 말은 하루 말만 머리 날짜로 넘긴다(예전 그대로 — 때 말까지 넘기면 뒤 거래 메모에 ‘저녁’이 붙는다).
const HINT_OF = Object.freeze({ "어제저녁": "어제", "오늘아침": "오늘" });
const NOT_DATE_HEADS = ["오늘의집 쿠션", "내일배움카드", "아모레 크림", "모레아 소품", "15일치 약값", "지난 주말", "다음 금요일", "지지난주 금요일", "저저번주 금요일"];
const CLOCKS = [["2026-08-05", "수"], ["2026-08-07", "금"], ["2026-08-08", "토"], ["2026-08-09", "일"], ["2026-08-03", "월"]];

await scene("U-24 해석", async () => {
  for (const [day, dow] of CLOCKS) {
    await withClock(day, async () => {
      // 말 하나에 검사 하나: 한 건 파서의 날짜(기준) · 머리 날짜 · 조각 날짜 판정 · 네 가지 나눔(띄어쓰기·쉼표·줄바꿈·‘그리고’)의 두 거래 날짜가 모두 맞아야 통과
      for (const head of DATE_HEADS) {
        const want = parseTransaction(`${head} 커피 4500원`, {}).transaction_date;
        const problems = [];
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(want || "") || parseTransaction(`${head} 택시 8000원`, {}).transaction_date !== want) problems.push(`한 건 파서 ${want}`);
        const hint = extractLeadingDateHint(`${head} 커피 4500원 택시 8000원`);
        if (hint !== (HINT_OF[head] || head)) problems.push(`머리 날짜 ${JSON.stringify(hint)}`);
        if (!hasDateHint(`${head} 택시 8000원`)) problems.push("조각 날짜 판정 거짓");
        for (const text of [`${head} 커피 4500원 택시 8000원`, `${head} 커피 4500원, 택시 8000원`, `${head} 커피 4500원\n택시 8000원`, `${head} 커피 4500원 그리고 택시 8000원`]) {
          const rows = rowsOf(parseMultipleTransactions(text, {}));
          if (!(rows.length === 2 && rows.every((row) => row.date === want) && rows[0].amount === 4500 && rows[1].amount === 8000)) problems.push(`${JSON.stringify(text)} → ${show(parseMultipleTransactions(text, {}))}`);
        }
        t.ok(!problems.length, `U-24 (${day} ${dow}) ‘${head}’ 머리 날짜를 여러 건의 두 거래가 한 건과 같은 ${want} 로 받는다 ${problems.join(" · ")}`);
      }
      // 조각이 제 날짜를 가지면 그 날짜다(머리 날짜가 덮지 않는다)
      const today = parseTransaction("커피 4500원", {}).transaction_date;
      for (const [text, wantFirst, wantSecond] of [
        ["어제 커피 4500원 25일 택시 8000원", "어제 커피 4500원", "25일 택시 8000원"],
        ["어제 커피 4500원 모레 택시 8000원", "어제 커피 4500원", "모레 택시 8000원"],
        ["지난 금요일 커피 4500원 어제 택시 8000원", "지난 금요일 커피 4500원", "어제 택시 8000원"],
        ["25일 월세 800000원 지난주 금요일 택시 8000원", "25일 월세 800000원", "지난주 금요일 택시 8000원"],
        ["20260731 커피 4500원 7월 30일 택시 8000원", "20260731 커피 4500원", "7월 30일 택시 8000원"],
      ]) {
        const rows = rowsOf(parseMultipleTransactions(text, {}));
        const first = parseTransaction(wantFirst, {}).transaction_date, last = parseTransaction(wantSecond, {}).transaction_date;
        t.ok(rows.length === 2 && rows[0].date === first && rows[1].date === last, `U-24 (${day}) 제 날짜를 가진 조각은 그 날짜: ${JSON.stringify(text)} → ${first}·${last} (받음 ${show(parseMultipleTransactions(text, {}))})`);
      }
      // 날짜가 아닌 머리 말은 뒤 거래에 넘기지 않는다(예전 그대로)
      const taken = NOT_DATE_HEADS.filter((head) => extractLeadingDateHint(`${head} 20000원 택시 8000원`) !== "");
      t.ok(!taken.length, `U-24 (${day}) 날짜가 아닌 머리 말은 머리 날짜가 아니다 ${JSON.stringify(taken)}`);
      t.ok(!hasDateHint("아모레 크림 30000원") && !hasDateHint("모레아 소품 30000원") && !hasDateHint("15일치 약값 30000원"), "U-24 낱말 속 ‘모레’·‘15일치’는 조각의 날짜가 아니다");
      const cream = rowsOf(parseMultipleTransactions("어제 커피 4500원 아모레 크림 30000원", {}));
      t.ok(cream.length === 2 && cream[1].date === parseTransaction("어제 커피 4500원", {}).transaction_date, `U-24 (${day}) ‘아모레 크림’ 조각은 머리 날짜(어제)를 받는다 (받음 ${JSON.stringify(cream)})`);
      const plain = rowsOf(parseMultipleTransactions("오늘의집 쿠션 20000원 택시 8000원", {}));
      t.ok(plain.length === 2 && plain.every((row) => row.date === today), `U-24 (${day}) 머리 날짜가 없으면 예전처럼 오늘 (받음 ${JSON.stringify(plain)})`);
    });
  }
  // 고른 읽기(V22.9.78 N-12, 운영자 결정 2026-10-23 그대로): 주 없이 쓴 ‘지난·저번 금요일’은 오늘을 뺀 바로 앞의 금요일, ‘지난주 금요일’은
  // 월요일에 시작하는 지난주의 금요일이다. 둘은 토·일요일에 다르다. 여러 건의 모든 거래가 한 건과 같은 쪽을 따른다.
  for (const [day, last, lastWeek] of [["2026-08-05", "2026-07-31", "2026-07-31"], ["2026-08-07", "2026-07-31", "2026-07-31"], ["2026-08-08", "2026-08-07", "2026-07-31"], ["2026-08-09", "2026-08-07", "2026-07-31"], ["2026-08-03", "2026-07-31", "2026-07-31"]]) {
    await withClock(day, async () => {
      t.ok(rowsOf(parseMultipleTransactions("지난 금요일 커피 4500원 택시 8000원", {})).every((row) => row.date === last), `U-24 ${day}: ‘지난 금요일’ 두 건 모두 ${last}`);
      t.ok(rowsOf(parseMultipleTransactions("지난주 금요일 커피 4500원 택시 8000원", {})).every((row) => row.date === lastWeek), `U-24 ${day}: ‘지난주 금요일’ 두 건 모두 ${lastWeek}`);
    });
  }
});

await scene("U-24 카카오 저장", async () => {
  for (const [day, text, dates] of [
    ["2026-08-05", "지난 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-05", "저번 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-08", "지난 금요일 커피 4500원 택시 8000원", ["2026-08-07", "2026-08-07"]],
    ["2026-08-09", "지난주 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-05", "25일 월세 800000원 관리비 200000원", ["2026-07-25", "2026-07-25"]],
  ]) {
    await withClock(day, () => fixture(async (fx) => {
      putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      const saved = fx.db.transactions.slice(before).map((row) => row.transaction_date);
      t.ok(saved.length === 2 && saved.every((date, i) => date === dates[i]), `U-24 카카오 저장(${day}) "${text}" → ${dates.join("·")} (받음 ${JSON.stringify(saved)})`);
      t.ok(dates.every((date) => reply.includes(date)), `U-24 카카오 답장(${day})이 두 거래의 날짜를 보인다`);
    }));
  }
  // 머리 날짜를 뗀 본문이 수정 명령이면 새 기록으로 저장하지 않는다(D3 — ‘지난주 금요일 01번 금액 5000’과 같다). 예전에는 ‘지난 금요일’·‘25일’
  // 머리를 떼지 못해 ‘01번 금액’ 5,000원이 새 지출로 저장됐다.
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    for (const text of ["지난주 금요일 01번 금액 5000", "지난 금요일 01번 금액 5000", "저번 금요일 01번 삭제", "25일 01번 금액 5000", "모레 01번 금액 5000", "지난 금요일 수정 01번 금액 5000"]) {
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      t.ok(fx.db.transactions.length === before && !reply.includes("저장했어요"), `U-24 날짜를 붙인 수정 말 "${text}"는 새 기록이 아니다 (${reply.slice(0, 50).replace(/\n/g, " / ")})`);
    }
  }));
});

if (SOFT) {
  console.log(`V22981_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
