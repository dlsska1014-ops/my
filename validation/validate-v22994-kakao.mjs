// V22.9.94 — 외부 검토(Codex/Astra)가 짚은 카카오 입력 해석·고치기 결함과 문구.
//   C-1 금액을 묻는 수정 세션에 ‘5000원 아니야’ 를 보내면 고치던 4,500원은 그대로 두고 5,000원 지출이 새로 저장됐다(직접·방 모두).
//       금액과 낱말이 있는 강한 입력이라 세션이 끝나고 기록 경로로 넘어갔다. 금액 하나 + 부정 끝맺음은 새 기록도 값도 아니다. 아무것도 바꾸지 않고 다시 묻는다.
//       세션이 없을 때의 같은 말은 운영 그대로 기록이다.
//   C-2 ‘3일⏎커피 4000⏎5일⏎택시 8000’ 의 택시가 3일에 저장되고 ‘3일 5일’ 을 못 읽은 말로 알렸다. 첫 줄이 맨 ‘N일’ 머리말이면 맨 ‘M일’ 줄도 머리말이다.
//       ‘3일 커피 4000⏎5일 택시 8000’ 처럼 낱말이 붙은 줄은 기간 줄(‘10일 렌트 10만원⏎2일 보험 3만원’, Q-115)과 꼴이 같아 가릴 수 없다. 운영 그대로 둔다.
//   C-3 ‘신한카드 1234 결제 5000’ 이 1,234원과 5,000원 두 건으로 저장됐다. 결제 카드 이름 바로 뒤의 홀로 쓴 네 자리 수(끝자리 0 이 아님)는 카드 끝자리다.
//   R-7 카카오 ‘개인정보’ 답이 없는 회원 탈퇴를 약속했다.
// 모두 메모리 픽스처(DB·서버 없음)에서 실제 경로를 돌린다. 방 경로는 Secret 과 botGroupKey 를 실은 요청이다.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parseExpressionAt } from "../tools/vendor/acorn.mjs";
import { app, BASE, fixture, skill, withClock } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { parseMultipleTransactions } from "../src/index.js";
import { KAKAO_EDIT_AMOUNT_V4 } from "../src/modules/kakao/edit-vocabulary.js";
import { normalizeText } from "../src/modules/nlu/amount-parser.js";
import { kakaoDataPolicyText } from "../src/modules/kakao/reply-texts.js";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) failures.push(message); };
const eq = (actual, expected, message) => { checks += 1; if (actual !== expected) failures.push(`${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); };
const TODAY = "2026-07-15";

// 판정 함수는 다른 모듈이 쓰지 않아 내보내기 블록(빌드가 만든다)에 없다. 모듈 원문에서 정규식과 함수를 그대로 떼어 돌린다.
const flowSource = readFileSync(new URL("../src/modules/kakao/edit-flow-v4.js", import.meta.url), "utf8");
const sliceFrom = (needle) => {
  const start = flowSource.indexOf(needle);
  ok(start >= 0, `edit-flow-v4.js 에 ${needle} 이 있다`);
  const node = parseExpressionAt(flowSource, Math.max(0, start), { ecmaVersion: "latest" });
  return flowSource.slice(node.start, node.end);
};
const negatedRegexSource = sliceFrom(`new RegExp(String.raw\`^(?:\${KAKAO_EDIT_AMOUNT_V4}`);
ok(flowSource.includes(`const KAKAO_EDIT_NEGATED_AMOUNT_V22994 = ${negatedRegexSource};`), "C-1 떼어 낸 정규식이 판정 함수가 쓰는 그 상수다");
const isKakaoEditNegatedAmountV22994 = vm.runInNewContext(
  `const KAKAO_EDIT_NEGATED_AMOUNT_V22994 = ${negatedRegexSource};\n(${sliceFrom("function isKakaoEditNegatedAmountV22994(")})`,
  { KAKAO_EDIT_AMOUNT_V4, normalizeText },
);
ok(/const negatedAmount = isKakaoEditNegatedAmountV22994\(utterance\);\s*\n\s*if \(newTransaction && !negatedAmount && !startsWithKakaoEditField\(utterance\)\)/.test(flowSource), "C-1 세션 처리가 새 기록으로 넘기기 전에 판정한다");

// ── 카카오 두 경로 ─────────────────────────────────────────────────────────────
// 문장마다 새 픽스처다. ‘커피 4500’ 을 저장한 뒤 말을 이어 보내고 기록 수·고치던 기록·답을 본다. 프로세스 메모리의 제한·반복 막기는 말마다 비운다.
const clearGuards = () => {
  for (const name of ["__AB_SKILL_RATE_BUCKETS", "__AB_TRAFFIC_BUCKETS", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_INFLIGHT"]) globalThis[name]?.clear();
};
const outcome = (fx, count, before, replies) => ({
  added: fx.db.transactions.length - count,
  row: fx.db.transactions.find((item) => item.id === before.id) || null,
  rows: fx.db.transactions.slice(count),
  replies,
  reply: replies.at(-1) || "",
});
const directRun = (texts, { first = "커피 4500" } = {}) => withClock(TODAY, () => fixture(async (fx) => {
  fx.env.SKILL_RATE_LIMIT = "10000";
  clearGuards();
  await skill(fx, "오늘기록");
  await skill(fx, "2");
  await skill(fx, first);
  const before = { ...fx.db.transactions.at(-1) };
  const count = fx.db.transactions.length;
  const replies = [];
  for (const text of texts) { clearGuards(); replies.push(await skill(fx, text)); }
  return outcome(fx, count, before, replies);
}));
const roomSkill = async (fx, utterance) => {
  const key = "room-owner-v22994", room = "room-v22994";
  const headers = { "content-type": "application/json", "user-agent": "validate-v22994", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET };
  const payload = { bot: { id: "667e5382f2b2f84cb555091c", name: "말해가계부" }, intent: { id: "synthetic-fallback", name: "폴백 블록" }, userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } }, chat: { id: room, type: "botGroupKey", properties: { botGroupKey: room } } } };
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify(payload) }), fx.env, { waitUntil(job) { jobs.push(job); } });
  await Promise.allSettled(jobs);
  const data = await response.json();
  return String(data?.template?.outputs?.map((o) => o?.simpleText?.text || o?.textCard?.description || "").join("\n") || JSON.stringify(data));
};
const roomRun = (texts, { first = "커피 4500" } = {}) => withClock(TODAY, async () => {
  const fx = await createV2265QaFixture();
  const saved = globalThis.fetch;
  try {
    fx.env.SKILL_RATE_LIMIT = "10000";
    fx.env.KAKAO_SKILL_SECRET = "validate-v22994-secret";
    clearGuards();
    await roomSkill(fx, first);
    const before = { ...fx.db.transactions.at(-1) };
    const count = fx.db.transactions.length;
    const replies = [];
    for (const text of texts) { clearGuards(); replies.push(await roomSkill(fx, text)); }
    return outcome(fx, count, before, replies);
  } finally {
    globalThis.fetch = saved;
    fx.restore();
  }
});
const bothPaths = [["직접", directRun], ["방", roomRun]];
const name = (path, steps) => `${path} ${steps.join(" → ")}`;
// 아무것도 바꾸지 않고 새 기록도 없다.
const untouched = async (steps, label, say = []) => {
  for (const [path, run] of bothPaths) {
    const result = await run(steps);
    eq(result.added, 0, `${label} ${name(path, steps)} 은 새 기록이 아니다`);
    eq(result.row?.amount, 4500, `${label} ${name(path, steps)} 은 금액을 바꾸지 않는다`);
    eq(result.row?.memo, "커피", `${label} ${name(path, steps)} 은 내용을 바꾸지 않는다`);
    eq(result.row?.category, "카페/간식", `${label} ${name(path, steps)} 은 분류를 바꾸지 않는다`);
    eq(result.row?.transaction_date, TODAY, `${label} ${name(path, steps)} 은 날짜를 바꾸지 않는다`);
    for (const text of say) ok(result.reply.includes(text), `${label} ${name(path, steps)} 의 답에 ‘${text}’ 가 있다: ${result.reply.slice(0, 160)}`);
  }
};

// ── C-1 열린 수정 세션의 ‘금액 + 부정 끝맺음’ ─────────────────────────────────────
const NEGATED = [
  "5000원 아니야", "5000원 아니", "5000원 아니요", "5000원 아닌데", "5000원 아님", "5000원 아니에요", "5000원 아니예요", "5000원 아닙니다",
  "5000원 아니오", "5000원 아니잖아", "5000원 아니지", "5000원 아닌데요", "5000원이 아니야", "5000원은 아니야", "5000원아니야", "5000 아니야",
  "5,000원 아님", "오천원 아니야", "오천원이 아닌데", "오천 아니요", "5천원 아니요", "5000원 아니야?", "5000원 아니야!!", "５０００원 아니야",
];
const REASK = "아니라고 하셔서 바꾸지 않았어요";
// 전각 숫자는 카카오 처리 앞단이 반각으로 접은 뒤 이 판정에 온다(아래 두 경로 시험이 본다).
for (const text of NEGATED.filter((item) => !/[０-９]/.test(item))) ok(isKakaoEditNegatedAmountV22994(text), `C-1 ‘${text}’ 은 금액 + 부정 끝맺음이다`);
// 넓히지 않는다: 값이 둘이거나, 부정이 앞에 오거나, 낱말이 있거나, 끝맺음이 아닌 말은 이 꼴이 아니다(예전 길 그대로).
for (const text of [
  "5000원 아니고 6000원", "5000원 아니라 6000원", "5000원 아니야 6000원", "4500원 말고 5000원", "아니 5000원", "아니요 5000원", "5000원이야", "5000원",
  "5000원 맞아요", "커피 5000원 아니야", "5000원 커피 아니야", "아니야", "아니", "그거 아니야", "1번 아니야", "점심 9000원", "5000원 아닌가", "5000원 아니면",
  "5000원 아니었어", "5000원 아니고", "5000원 안 냈어", "5000원 아니야 취소", "금액 5000원 아니야", "1번 금액 5000원 아니야", "",
]) ok(!isKakaoEditNegatedAmountV22994(text), `C-1 ‘${text}’ 은 금액 + 부정 끝맺음 꼴이 아니다`);
for (const long of ["1".repeat(20000) + " 아니야x", "1만".repeat(8000) + " 아니x", "오".repeat(20000) + "원 아니x", `${"5000원 ".repeat(4000)}아니야`]) {
  const started = Date.now();
  isKakaoEditNegatedAmountV22994(long);
  ok(Date.now() - started < 200, `C-1 긴 입력(${long.length}자)도 곧 끝난다`);
}

// 재현 문장: ‘1번 금액’ 이 값을 묻는 세션을 연 뒤의 답.
for (const text of NEGATED) await untouched(["1번 금액", text], "C-1", [REASK, "얼마로 바꿀까요"]);
// 메뉴에서 금액을 고른 뒤, 메뉴 단계, 확인 단계도 같다.
for (const text of ["5000원 아니야", "5000원 아니요", "5000원 아님"]) {
  await untouched(["수정 01번", "1", text], "C-1 메뉴로 고른 금액", [REASK, "얼마로 바꿀까요"]);
  await untouched(["수정 01번", text], "C-1 메뉴 단계", [REASK, "무엇을 바꿀까요"]);
  await untouched(["01번 커피 5000원", text], "C-1 확인 단계", [REASK, "무엇을 바꿀까요"]);
}
// 다른 칸을 묻는 중이어도 금액 + 부정 끝맺음은 값이 아니다(내용이 ‘5000원 아니’ 가 되거나 새 기록이 되지 않는다).
await untouched(["수정 01번", "4", "5000원 아니"], "C-1 내용 칸", [REASK, "내용을 무엇으로 바꿀까요"]);
await untouched(["수정 01번", "2", "5000원 아니야"], "C-1 분류 칸", [REASK, "분류를 번호로 골라주세요"]);
await untouched(["수정 01번", "5", "5000원 아니요"], "C-1 날짜 칸", [REASK, "날짜를 번호로 고르거나"]);
for (const [path, run] of bothPaths) {
  // 다시 물은 뒤의 바른 답은 그대로 반영한다.
  const next = await run(["1번 금액", "5000원 아니야", "6000원"]);
  eq(next.added, 0, `C-1 ${path} 다시 물은 뒤의 ‘6000원’ 은 새 기록이 아니다`);
  eq(next.row?.amount, 6000, `C-1 ${path} 다시 물은 뒤의 ‘6000원’ 은 금액을 바꾼다`);
  // ‘취소’ 는 세션을 닫는다. 닫힌 뒤의 같은 말은 세션이 없을 때처럼 운영 그대로 기록이다.
  const cancel = await run(["1번 금액", "5000원 아니야", "취소"]);
  eq(cancel.added, 0, `C-1 ${path} 다시 물은 뒤의 ‘취소’ 는 기록이 아니다`);
  ok(cancel.reply.includes("수정을 취소했어요"), `C-1 ${path} ‘취소’ 는 세션을 닫는다: ${cancel.reply.slice(0, 120)}`);
  const closed = await run(["1번 금액", "5000원 아니야", "취소", "5000원 아니야"]);
  eq(closed.added, 1, `C-1 ${path} 세션을 닫은 뒤의 ‘5000원 아니야’ 는 운영처럼 기록이다`);
  eq(closed.row?.amount, 4500, `C-1 ${path} 세션을 닫은 뒤의 말은 앞 기록을 바꾸지 않는다`);
  // 세 번 되풀이하면 상태 기계의 실패처럼 세션을 끝낸다(갇히지 않는다).
  const thrice = await run(["1번 금액", "5000원 아니야", "5000원 아니요", "5000원 아님"]);
  eq(thrice.added, 0, `C-1 ${path} 부정 끝맺음 세 번은 새 기록이 아니다`);
  eq(thrice.row?.amount, 4500, `C-1 ${path} 부정 끝맺음 세 번은 금액을 바꾸지 않는다`);
  ok(thrice.replies[1].includes(REASK), `C-1 ${path} 두 번째도 다시 묻는다: ${thrice.replies[1].slice(0, 120)}`);
  ok(thrice.reply.includes("수정을 끝냈어요") && thrice.reply.includes("기록은 그대로예요"), `C-1 ${path} 세 번째에는 세션을 끝낸다: ${thrice.reply.slice(0, 120)}`);
  const after = await run(["1번 금액", "5000원 아니야", "5000원 아니요", "5000원 아님", "5000원 아니야"]);
  eq(after.added, 1, `C-1 ${path} 끝난 뒤의 ‘5000원 아니야’ 는 세션이 없을 때처럼 기록이다`);
  // 세션이 없을 때의 ‘5000원 아니야’ 는 운영 그대로(5,000원 기록)다.
  const plain = await run(["5000원 아니야"]);
  eq(plain.added, 1, `C-1 ${path} 세션이 없을 때의 ‘5000원 아니야’ 는 운영처럼 기록이다`);
  eq(plain.rows[0]?.amount, 5000, `C-1 ${path} 세션이 없을 때의 ‘5000원 아니야’ 의 금액`);
  eq(plain.row?.amount, 4500, `C-1 ${path} 세션이 없을 때의 ‘5000원 아니야’ 는 앞 기록을 바꾸지 않는다`);
  // 이웃 꼴은 예전 그대로다: 부정이 앞에 오면 값(Q-31), 값이 둘이면 다시 묻기(Q-80), 분명한 새 기록은 세션을 끝내고 저장(T6).
  for (const [text, amount] of [["아니 5000원", 5000], ["아니요 5000원", 5000], ["5000원이야", 5000], ["5000원 맞아요", 5000], ["5000원", 5000]]) {
    const answer = await run(["1번 금액", text]);
    eq(answer.added, 0, `C-1 ${path} 세션의 ‘${text}’ 는 새 기록이 아니다`);
    eq(answer.row?.amount, amount, `C-1 ${path} 세션의 ‘${text}’ 는 예전처럼 값이다`);
  }
  for (const text of ["5000원 아니고 6000원", "4500원 말고 5000원", "5000원 아니라 6000원"]) {
    const two = await run(["1번 금액", text]);
    eq(two.added, 0, `C-1 ${path} 세션의 ‘${text}’ 는 새 기록이 아니다`);
    eq(two.row?.amount, 4500, `C-1 ${path} 세션의 ‘${text}’ 는 값이 둘이라 바꾸지 않는다`);
  }
  const fresh = await run(["1번 금액", "점심 9000원"]);
  eq(fresh.added, 1, `C-1 ${path} 세션 중의 분명한 새 기록은 예전처럼 저장한다`);
  eq(fresh.row?.amount, 4500, `C-1 ${path} 세션 중의 새 기록은 고치던 기록을 바꾸지 않는다`);
}

// ── C-2 맨 ‘N일’ 머리 줄 ─────────────────────────────────────────────────────────
const rowsOf = (text) => {
  const parsed = parseMultipleTransactions(text, {});
  return Array.isArray(parsed) ? parsed : [];
};
const shape = (text, withPay = false) => JSON.stringify(rowsOf(text).map((row) => (withPay ? [row.amount, row.memo, row.transaction_date, row.payment_method] : [row.amount, row.memo, row.transaction_date])));
await withClock(TODAY, () => {
  // 새로 읽는 꼴: 첫 줄이 맨 ‘N일’ 이고 뒤에 맨 ‘M일’ 한 줄이 온다.
  for (const [text, rows] of [
    ["3일\n커피 4000\n5일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-05"]]],
    ["3일\n- 커피 4000\n5일\n- 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-05"]]],
    ["3일에\n커피 4000\n5일에\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-05"]]],
    ["3일\n커피 4000\n택시 8000\n5일\n점심 9000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"], [9000, "점심", "2026-07-05"]]],
    ["3일\n커피 4000\n5일\n택시 8000\n어제\n점심 9000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-05"], [9000, "점심", "2026-07-14"]]],
    ["3일\n커피 4000\n어제\n택시 8000\n5일\n점심 9000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-14"], [9000, "점심", "2026-07-05"]]],
    ["1일\n커피 4000\n31일\n택시 8000", [[4000, "커피", "2026-07-01"], [8000, "택시", "2026-07-31"]]],
    ["10일\n점심 9000\n2일\n주차 1만원", [[9000, "점심", "2026-07-10"], [10000, "주차", "2026-07-02"]]],
    // 머리말이 이어지면 마지막 머리말이 날짜다(‘어제⏎그제⏎커피 4000’ 과 같다).
    ["1일\n2일\n커피 4000", [[4000, "커피", "2026-07-02"]]],
    ["3일\n커피 4000\n5일\n6일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-06"]]],
    // 뒤에 기록이 없는 머리말 줄은 ‘어제⏎커피 4000⏎오늘’ 의 ‘오늘’ 처럼 아무것도 하지 않는다(예전에는 ‘3일 5일’ 을 못 읽은 말로 알렸다).
    ["3일\n커피 4000\n5일", [[4000, "커피", "2026-07-03"]]],
  ]) {
    eq(shape(text), JSON.stringify(rows), `C-2 ‘${text}’`);
    eq(parseMultipleTransactions(text, {}).unread, undefined, `C-2 ‘${text}’ 에는 못 읽은 조각이 없다`);
  }
  // 운영 그대로인 꼴: 낱말이 붙은 ‘M일’ 줄(기간과 가릴 수 없다, Q-115), 첫 줄이 맨 ‘N일’ 이 아님, 달이 있는 머리말(달을 옮겨 붙일 수 없다), 달력에 없는 날.
  for (const [text, rows] of [
    ["3일 커피 4000\n5일 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]],
    ["3일에 커피 4000\n5일에 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]],
    ["3일 커피 4000, 5일 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]],
    ["3일\n커피 4000\n5일 택시 8000", [[4000, "커피", "2026-07-03"], [8000, "5일 택시", "2026-07-03"]]],
    ["5일 약국 1만원\n3일 치 약값 9000", [[10000, "약국", "2026-07-05"], [9000, "3일 치 약값", "2026-07-05"]]],
    ["10일 렌트 10만원\n2일 보험 3만원", [[100000, "렌트", "2026-07-10"], [30000, "2일 보험", "2026-07-10"]]],
    ["20일 커피 4000\n30일 구독 9900", [[4000, "커피", "2026-07-20"], [9900, "30일 구독", "2026-07-20"]]],
    ["6월 3일\n커피 4000\n5일\n택시 8000", [[4000, "커피", "2026-06-03"], [8000, "택시", "2026-06-03"]]],
    ["7월 3일\n커피 4000\n5일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"]]],
    ["3일 지출\n커피 4000\n5일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"]]],
    ["어제\n커피 4000\n3일\n택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", "2026-07-14"]]],
    ["커피 4000\n3일\n택시 8000\n5일\n점심 9000", [[4000, "커피", TODAY], [8000, "택시", TODAY], [9000, "점심", TODAY]]],
    ["호텔 20만원\n3일\n조식 2만원", [[200000, "호텔", TODAY], [20000, "조식", TODAY]]],
    ["3일\n커피 4000\n32일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"]]],
    ["3일\n커피 4000\n0일\n택시 8000", [[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-03"]]],
    // 글머리표가 붙은 ‘- 3일’ 은 운영에서도 머리말로 읽지 않는다(오늘로 저장, 이 판에서 넓히지 않음).
    ["- 3일\n- 커피 4000\n- 5일\n- 택시 8000", [[4000, "커피", TODAY], [8000, "택시", TODAY]]],
    ["5일 택시 8000", [[8000, "택시", "2026-07-05"]]],
    ["구독 30일에 9900원", [[9900, "구독 30일에", TODAY]]],
    ["다낭 3박 5일 패키지 80만원", [[800000, "다낭 3박5일 패키지", TODAY]]],
    ["어제\n커피 4000\n오늘\n택시 8000", [[4000, "커피", "2026-07-14"], [8000, "택시", TODAY]]],
    ["어제\n커피 4000\n오늘", [[4000, "커피", "2026-07-14"]]],
  ]) eq(shape(text), JSON.stringify(rows), `C-2 운영 그대로 ‘${text}’`);
});
for (const [path, run] of bothPaths) {
  const saved = await run(["3일\n커피 4000\n5일\n택시 8000"]);
  eq(saved.added, 2, `C-2 ${path} 머리말 두 날의 두 건을 저장한다`);
  eq(JSON.stringify(saved.rows.map((row) => [row.amount, row.memo, row.transaction_date])), JSON.stringify([[4000, "커피", "2026-07-03"], [8000, "택시", "2026-07-05"]]), `C-2 ${path} 두 건의 날짜`);
  ok(!saved.reply.includes("읽지 못"), `C-2 ${path} 머리말 줄을 못 읽은 말로 알리지 않는다: ${saved.reply.slice(0, 200)}`);
  eq(saved.row?.amount, 4500, `C-2 ${path} 앞 기록은 그대로다`);
}

// ── C-3 카드 끝자리 ────────────────────────────────────────────────────────────
await withClock(TODAY, () => {
  // 카드 끝자리를 뗀 문장과 똑같이 읽는다(금액에서 빠지고 메모에도 남지 않는다).
  for (const [text, same, rows] of [
    ["신한카드 1234 결제 5000", "신한카드 결제 5000", [[5000, "기타지출", TODAY, "신한카드"]]],
    ["국민카드 5678 커피 4500", "국민카드 커피 4500", [[4500, "커피", TODAY, "국민카드"]]],
    ["카드 1234 결제 5000", "카드 결제 5000", [[5000, "기타지출", TODAY, "카드"]]],
    ["KB국민카드 1234 승인 12,000원", "KB국민카드 승인 12,000원", [[12000, "승인", TODAY, "국민카드"]]],
    ["신한카드1234 결제 5000", "신한카드 결제 5000", [[5000, "기타지출", TODAY, "신한카드"]]],
    ["신한 카드 1234 결제 5000", "신한 카드 결제 5000", [[5000, "기타지출", TODAY, "신한카드"]]],
    ["체크카드 4561 점심 9000", "체크카드 점심 9000", [[9000, "점심", TODAY, "체크카드"]]],
    ["현대카드 0412 커피 4500", "현대카드 커피 4500", [[4500, "커피", TODAY, "현대카드"]]],
    ["신한카드 1234 결제 오천원", "신한카드 결제 오천원", [[5000, "기타지출", TODAY, "신한카드"]]],
    ["점심 9000 신한카드 1234 결제", "점심 9000 신한카드 결제", [[9000, "점심", TODAY, "신한카드"]]],
  ]) {
    eq(shape(text, true), shape(same, true), `C-3 ‘${text}’ 는 ‘${same}’ 와 같다`);
    eq(shape(text, true), JSON.stringify(rows), `C-3 ‘${text}’`);
    ok(!rowsOf(text).some((row) => /\d{4}/.test(String(row.memo || "")) && !/\d{4}/.test(same)), `C-3 ‘${text}’ 의 메모에 카드 끝자리가 없다`);
  }
  eq(rowsOf("신한카드 1234 결제 5000")[0]?.raw_text, "신한카드 1234 결제 5000", "C-3 저장하는 원문은 받은 그대로다");
  eq(shape("신한카드 1234 결제 5000\n국민카드 5678 커피 4500", true), JSON.stringify([[5000, "기타지출", TODAY, "신한카드"], [4500, "커피", TODAY, "국민카드"]]), "C-3 줄마다 카드 끝자리를 뗀다");
  // 운영 그대로인 꼴: 다른 금액이 없음, 단위가 붙음, 끝자리 0(원화 금액 꼴), 줄 끝, 뒤에 수·다른 결제수단, 네 자리가 아님, 결제 카드가 아닌 낱말, 다른 줄의 금액.
  for (const [text, rows] of [
    ["신한카드 1234", [[1234, "기타지출", TODAY, "신한카드"]]],
    ["카드 1234원", [[1234, "기타지출", TODAY, "카드"]]],
    ["신한카드 1234원 결제 5000", [[1234, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, ""]]],
    ["카드 1234 원 결제 5000", [[1234, "기타지출", TODAY, "카드"], [5000, "기타지출", TODAY, ""]]],
    ["신한카드 5000 국민카드 3000", [[5000, "기타지출", TODAY, "신한카드"], [3000, "기타지출", TODAY, "국민카드"]]],
    ["신한카드 1230 결제 5000", [[1230, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, ""]]],
    ["카드 5000 현금 3000", [[5000, "기타지출", TODAY, "카드"], [3000, "기타지출", TODAY, "현금"]]],
    ["카드 4567 현금 3000", [[4567, "기타지출", TODAY, "카드"], [3000, "기타지출", TODAY, "현금"]]],
    ["신한카드 1234 국민카드 5678", [[1234, "기타지출", TODAY, "신한카드"], [5678, "기타지출", TODAY, "국민카드"]]],
    ["신한카드 1234 카카오페이 5000", [[1234, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, "카카오페이"]]],
    ["커피 4500 신한카드 1234", [[4500, "커피", TODAY, ""], [1234, "기타지출", TODAY, "신한카드"]]],
    ["신한카드 1234 5000", [[1234, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, ""]]],
    ["신한카드 12345 결제 5000", [[12345, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, ""]]],
    ["신한카드 123 결제 5000", [[123, "기타지출", TODAY, "신한카드"], [5000, "기타지출", TODAY, ""]]],
    ["포토카드 1234 앨범 15000", [[1234, "포토", TODAY, "카드"], [15000, "앨범", TODAY, ""]]],
    ["교통카드 1234 버스 1500", [[1234, "교통", TODAY, "카드"], [1500, "버스", TODAY, ""]]],
    ["신한카드 1234\n커피 4500", [[1234, "기타지출", TODAY, "신한카드"], [4500, "커피", TODAY, ""]]],
  ]) eq(shape(text, true), JSON.stringify(rows), `C-3 운영 그대로 ‘${text}’`);
});
for (const [path, run] of bothPaths) {
  for (const [text, amount, memo, payment] of [["신한카드 1234 결제 5000", 5000, "기타지출", "신한카드"], ["국민카드 5678 커피 4500", 4500, "커피", "국민카드"]]) {
    const saved = await run([text]);
    eq(saved.added, 1, `C-3 ${path} ‘${text}’ 는 한 건이다`);
    eq(saved.rows[0]?.amount, amount, `C-3 ${path} ‘${text}’ 의 금액`);
    eq(saved.rows[0]?.memo, memo, `C-3 ${path} ‘${text}’ 의 내용`);
    eq(saved.rows[0]?.payment_method, payment, `C-3 ${path} ‘${text}’ 의 결제수단`);
  }
}

// ── R-7 개인정보 답 ────────────────────────────────────────────────────────────
{
  const text = kakaoDataPolicyText("https://malhaebook.com");
  ok(!/탈퇴하면/.test(text), "R-7 없는 회원 탈퇴를 약속하지 않는다");
  for (const words of ["웹에서 직접 삭제", "영구 삭제", "가계부에서 나가도 함께 쓴 기록은 남습니다", "계정 탈퇴 기능은 아직 없습니다", "개인정보처리방침에 적힌 문의 경로로 요청해 주세요"]) ok(text.includes(words), `R-7 개인정보 답에 ‘${words}’ 가 있다`);
  // 공개 개인정보처리방침(3절 보유기간과 삭제)과 가계부 삭제 화면이 말하는 길과 같다.
  const pages = readFileSync(new URL("../src/modules/public/content-pages.js", import.meta.url), "utf8");
  const privacy = pages.slice(pages.indexOf("privacy: {"), pages.indexOf("terms: {"));
  for (const words of ["웹에서 직접 수정·삭제할 수 있습니다", "가계부 소유자가 영구 삭제를 완료하면 해당 가계부의 거래와 관련 설정을 삭제합니다", "가계부 나가기는 참여 권한을 종료하며 공동 거래 이력은 보존합니다", "계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로"]) {
    ok(privacy.includes(words), `R-7 개인정보처리방침이 같은 길을 적는다: ‘${words}’`);
  }
}
for (const [path, send] of [["직접", (fx) => skill(fx, "개인정보")], ["방", (fx) => { fx.env.KAKAO_SKILL_SECRET = "validate-v22994-secret"; return roomSkill(fx, "개인정보"); }]]) {
  const reply = await withClock(TODAY, () => fixture(async (fx) => { clearGuards(); return send(fx); }));
  ok(reply.includes("계정 탈퇴 기능은 아직 없습니다") && !reply.includes("탈퇴하면"), `R-7 ${path} ‘개인정보’ 답: ${reply.slice(0, 200)}`);
}

if (failures.length) {
  console.error(`V22.9.94 카카오 검사 실패 ${failures.length}건 / ${checks}`);
  for (const line of failures.slice(0, 80)) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`V22.9.94 카카오 검사 통과 (${checks} checks)`);
