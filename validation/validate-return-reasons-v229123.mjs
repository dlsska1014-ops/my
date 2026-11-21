// V22.9.123 재방문 장치 1차(2026-11-14 사용자 ‘출시 전 반영’) 검사.
//   ① 카카오 기록 한 건 저장 답 끝의 ‘이번 달 …’ 한 줄(예산 사용률·이번 달 지출·수입). 숫자는 ‘예산 현황’·‘이번 달 요약’ 답과 같아야 한다.
//   ② 오늘의 첫 기록 답에 붙는 요약 단추(월요일 ‘지난주 요약’, 매달 1~5일 ‘지난달 요약’).
//   ③ 첫 기록 답의 채팅방 고정 안내.
//   ④ 끄는 변수 KAKAO_RETURN_HINTS_DISABLED — 켜면 답이 이 판 전과 같다.
// 읽기 둘(예산·이번 달 기록)은 저장과 나란히 던지고 시간 상자로 받는다: 읽기가 실패하거나 늦으면 그 줄만 빠지고 기록은 저장된다.
// 네트워크를 쓰지 않는다(메모리 픽스처). 시계는 장면마다 고정한다(2026-11-10 화, 11-09 월, 11-02 월·월초, 11-05 목·월초).
// 실행: node validation/validate-return-reasons-v229123.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { app, BASE, counter, fixture, intercept, failure } from "./lib-audit-v22934.mjs";
import { kakaoSaveFeedbackTextV229123, budgetSummary } from "../src/index.js";

const t = counter("return reasons");
const SECRET = "return-reasons-secret-v229123";
const OWNER = "kakao_login:2265"; // user-bin, house-home 소유자(초대코드 HOME2265)
const HOME = "house-home";
const SELECT_KEY = "kakao_selected_household_v2251:user-bin";
const PIN_TIP = "💡 이 채팅방을 상단에 고정해 두면 다음에도 바로 기록할 수 있어요.";
const won = (n) => Number(n).toLocaleString("en-US");

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE"]) globalThis[name]?.clear?.();
}
async function at(ymd, task, hm = "12:00") {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${ymd}T${hm}:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}
function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}
const textOf = (body) => (body?.template?.outputs || []).map((output) => output.simpleText?.text || [output.textCard?.title, output.textCard?.description].filter(Boolean).join("\n") || "").join("\n");
// Secret 으로 확인된 /skill 요청 한 번. 답 뒤 일(waitUntil)도 끝까지 기다린다.
async function say(fx, utterance, { user = OWNER, room = "" } = {}) {
  resetIsolateState();
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify(payloadFor(utterance, { user, room })) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const body = JSON.parse(await response.text());
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  const quick = (body?.template?.quickReplies || []).map((q) => `${q.label}|${q.messageText}`);
  const buttons = (body?.template?.outputs || []).flatMap((output) => output.textCard?.buttons || []).map((b) => `${b.label}|${b.messageText || b.action}`);
  return { status: response.status, body, text: textOf(body), quick, buttons };
}
const selectHome = (fx) => {
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== SELECT_KEY);
  fx.db.accountbook_settings.push({ id: "v123-select", key: SELECT_KEY, value: HOME, created_at: "2026-11-01T00:00:00.000Z" });
};
// house-home 의 기록·예산을 비우고 필요한 것만 넣는다.
function clean(fx) {
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HOME);
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HOME);
  selectHome(fx);
}
let serial = 0;
const tx = (fx, date, amount, { type = "expense", category = "식비", user = "user-bin", source = "web" } = {}) => fx.db.transactions.push({ id: `v123-tx-${++serial}`, household_id: HOME, user_id: user, transaction_date: date, type, amount, category, memo: `점검 ${date}`, payment_method: "", source, raw_text: "", created_at: `${date}T00:00:00.000Z` });
const budget = (fx, month, category, amount) => fx.db.accountbook_budgets.push({ id: `v123-b-${++serial}`, household_id: HOME, month, category, amount, created_at: `${month}-01T00:00:00.000Z` });
const lineOf = (text) => text.split("\n").find((line) => /^(?:📊|⚠️|🚨) 이번 달 /u.test(line)) || "";
const homeRows = (fx) => fx.db.transactions.filter((row) => row.household_id === HOME);
const noUrl = (text) => !/https?:\/\//i.test(text);
const FEEDBACK_ROWS_GET = (url, method) => method === "GET" && url.pathname === "/rest/v1/transactions" && url.searchParams.get("select") === "id,type,amount,category,user_id,transaction_date";
const BUDGETS_GET = (url, method) => method === "GET" && url.pathname === "/rest/v1/accountbook_budgets";

// ── 1. 문구 함수(조합) ─────────────────────────────────────────────────────────
{
  const rows = [
    { id: "a", type: "expense", amount: 12000, category: "식비" }, { id: "b", type: "expense", amount: 4500, category: "식비" },
    { id: "c", type: "expense", amount: 8000, category: "택시" }, { id: "d", type: "income", amount: 3000000, category: "급여" },
  ];
  const food = { id: "b", type: "expense", category: "식비" };
  t.eq(kakaoSaveFeedbackTextV229123(rows, [], food), "📊 이번 달 지출 24,500원 · 3건", "예산 없음: 이번 달 지출 합계와 건수(수입은 세지 않는다)");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 100000 }], food), "📊 이번 달 식비 예산 17% 사용 · 83,500원 남음", "분류 예산: 사용률(반올림)과 남은 금액");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 19000 }], food), "⚠️ 이번 달 식비 예산 87% 사용 · 2,500원 남음", "분류 예산 85% 이상: 주의 표시");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 16500 }], food), "⚠️ 이번 달 식비 예산 100% 사용 · 0원 남음", "분류 예산을 꼭 맞게 씀: 초과가 아니다");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 10000 }], food), "🚨 이번 달 식비 예산 6,500원 초과 (165%)", "분류 예산 초과: 넘은 금액과 사용률");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "__total", amount: 100000 }], food), "📊 이번 달 예산 25% 사용 · 75,500원 남음", "전체 예산만: 전체 사용률(지출 전부)");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "__total", amount: 20000 }], food), "🚨 이번 달 예산 4,500원 초과 (123%)", "전체 예산 초과");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 100000 }], { id: "c", type: "expense", category: "택시" }), "📊 이번 달 지출 24,500원 · 3건", "분류별 예산이 있지만 저장한 분류에는 예산이 없음: 이번 달 지출 합계");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 100000 }, { category: "__total", amount: 999 }], { id: "c", type: "expense", category: "택시" }), "📊 이번 달 지출 24,500원 · 3건", "분류별 예산이 있으면 직접 정한 전체 예산은 쓰지 않는다(예산 현황과 같은 규칙)");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 0 }], food), "📊 이번 달 지출 24,500원 · 3건", "0원 예산은 예산 없음");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "__income", amount: 5000000 }], food), "📊 이번 달 지출 24,500원 · 3건", "예상 수입만 저장된 달: 예산 없음");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 100000 }], { id: "d", type: "income", category: "급여" }), "📊 이번 달 수입 3,000,000원", "수입을 저장하면 이번 달 수입 합계");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [], food, { refundDeductions: [{ amount: 4000, category: "식비" }] }), "📊 이번 달 지출 20,500원 · 3건", "연결한 환불은 지출 합계에서 뺀다(요약과 같은 규칙)");
  t.eq(kakaoSaveFeedbackTextV229123(rows, [{ category: "식비", amount: 100000 }], food, { refundDeductions: [{ amount: 4000, category: "식비" }] }), "📊 이번 달 식비 예산 13% 사용 · 87,500원 남음", "연결한 환불은 그 분류 사용액에서 뺀다(예산 현황과 같은 규칙)");
  // 예산 계산 함수(budgetSummary)와 같은 숫자다 — 상위·하위 분류를 펼친 사용액 포함.
  const nested = [{ id: "n1", type: "expense", amount: 30000, category: "외식" }, { id: "n2", type: "expense", amount: 9000, category: "식비" }];
  const summary = budgetSummary(nested, [{ category: "식비", amount: 200000 }]);
  const own = summary.categoryAlerts.find((b) => b.category === "식비");
  const line = kakaoSaveFeedbackTextV229123(nested, [{ category: "식비", amount: 200000 }], { id: "n1", type: "expense", category: "외식" });
  t.ok(line === `📊 이번 달 식비 예산 ${own.rate}% 사용 · ${won(own.budget - own.spent)}원 남음`, `하위 분류(외식)를 저장하면 그 분류를 품은 예산 줄의 숫자를 쓴다 (${line})`);
  t.ok(!/https?:|undefined|NaN/.test(line), "문구에 주소·undefined·NaN 없음");
}

// ── 2. 저장 답의 한 줄(개인 대화) — 숫자가 ‘이번 달 요약’·‘예산 현황’ 과 같다 ─────────────────
await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  tx(fx, "2026-11-03", 30000); tx(fx, "2026-11-04", 2000000, { type: "income", category: "급여" }); tx(fx, "2026-10-30", 77000);
  const first = await say(fx, "점심 12100원");
  t.ok(first.text.includes("저장했어요"), "예산 없는 가계부: 저장됨");
  t.eq(lineOf(first.text), "📊 이번 달 지출 42,100원 · 2건", "예산 없는 가계부: 웹에서 넣은 이번 달 기록까지 더한 지출 합계와 건수(지난달 기록·수입은 빼고)");
  const lines = first.text.split("\n");
  t.ok(lines.indexOf(lineOf(first.text)) === lines.findIndex((l) => l.startsWith("지출자:")) + 1, "한 줄은 ‘지출자:’ 바로 아래에 있다");
  t.ok(first.text.includes("수정:") && first.text.includes("삭제:"), "고치는 법 안내는 그대로 있다");
  t.ok(noUrl(first.text) && first.quick.length === 0, "화요일·10일: 단추 없음, 글에 주소 없음");
  const second = await say(fx, "커피 4600원");
  t.eq(lineOf(second.text), "📊 이번 달 지출 46,700원 · 3건", "둘째 기록: 합계와 건수가 늘어난다");
  const summary = await say(fx, "이번 달 요약");
  t.ok(summary.text.includes("46,700원"), `‘이번 달 요약’ 의 지출과 같은 숫자다 (${summary.text.split("\n").filter((l) => l.includes("지출")).join(" / ").slice(0, 120)})`);
  const income = await say(fx, "용돈 50000원 받음");
  t.eq(lineOf(income.text), "📊 이번 달 수입 2,050,000원", "수입 기록: 이번 달 수입 합계");
  t.eq(homeRows(fx).filter((row) => row.source !== "web").length, 3, "세 건 모두 저장됨");
}));

await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  budget(fx, "2026-11", "식비", 300000);
  tx(fx, "2026-11-02", 150000);
  const saved = await say(fx, "점심 36000원");
  const line = lineOf(saved.text);
  t.eq(line, "📊 이번 달 식비 예산 62% 사용 · 114,000원 남음", "분류 예산: 사용률과 남은 금액");
  const status = await say(fx, "예산 현황");
  t.ok(status.text.includes("식비: 186,000원 사용 / 114,000원 남음 · 62%"), `‘예산 현황’ 의 그 분류 줄과 같은 숫자다 (${status.text.split("\n").find((l) => l.includes("식비:")) || ""})`);
  const taxi = await say(fx, "택시 8100원");
  t.eq(lineOf(taxi.text), "📊 이번 달 지출 194,100원 · 3건", "예산을 잡지 않은 분류를 저장하면 이번 달 지출 합계");
  const over = await say(fx, "점심 120000원");
  t.eq(lineOf(over.text), "🚨 이번 달 식비 예산 6,000원 초과 (102%)", "예산을 넘기면 초과 금액");
}));

await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  budget(fx, "2026-11", "__total", 1000000);
  tx(fx, "2026-11-02", 841900);
  const saved = await say(fx, "택시 8100원");
  t.eq(lineOf(saved.text), "⚠️ 이번 달 예산 85% 사용 · 150,000원 남음", "전체 예산만 있는 가계부: 전체 사용률(85% 이상이면 주의 표시)");
  const status = await say(fx, "예산 현황");
  t.ok(status.text.includes("남은 예산: 150,000원") && status.text.includes("사용률: 85%"), "‘예산 현황’ 의 남은 예산·사용률과 같은 숫자다");
}));

// ── 3. 붙이지 않는 경우 ───────────────────────────────────────────────────────
await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  tx(fx, "2026-11-03", 30000);
  const lastMonth = await say(fx, "10월 28일 점심 12200원");
  t.ok(lastMonth.text.includes("저장했어요") && !lineOf(lastMonth.text), "지난달 날짜로 저장한 기록: 한 줄 없음");
  const bulk = await say(fx, "점심 12300원\n커피 4700원");
  t.ok(bulk.text.includes("새로 저장 2건") && !lineOf(bulk.text) && bulk.quick.length === 0, "여러 건 저장: 한 줄·단추 없음");
  const one = await say(fx, "저녁 23100원");
  t.ok(lineOf(one.text), "한 건 저장: 한 줄 있음");
  const dup = await say(fx, "저녁 23100원");
  t.ok(dup.text.includes("중복 저장 안 함") && !lineOf(dup.text), `같은 문장을 바로 다시 보내 중복으로 저장하지 않은 답: 한 줄 없음 (${dup.text.split("\n")[0]})`);
}));

// 끄는 변수: 답이 이 판 전과 같다(한 줄·단추·고정 안내 없음, 읽기 둘도 보내지 않는다).
for (const value of ["1", "true", "ON", "yes"]) {
  await at("2026-11-02", () => fixture(async (fx) => {
    clean(fx);
    fx.env.KAKAO_RETURN_HINTS_DISABLED = value;
    const calls = [];
    const stop = intercept(({ url, method }) => { calls.push(`${method} ${url.pathname}${url.search}`); });
    try {
      const saved = await say(fx, "점심 12400원");
      t.ok(saved.text.includes("저장했어요") && !lineOf(saved.text) && saved.quick.length === 0 && !saved.text.includes("💡"), `KAKAO_RETURN_HINTS_DISABLED=${value}: 한 줄·단추·안내 없음(월요일·월초인데도)`);
      t.ok(!calls.some((line) => line.includes("accountbook_budgets")) && !calls.some((line) => line.includes("select=id%2Ctype%2Camount%2Ccategory%2Cuser_id%2Ctransaction_date")), `KAKAO_RETURN_HINTS_DISABLED=${value}: 예산·이번 달 기록을 읽지 않는다`);
    } finally { stop(); }
  }));
}
for (const value of ["", "0", "false", "off", "no"]) {
  await at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    fx.env.KAKAO_RETURN_HINTS_DISABLED = value;
    const saved = await say(fx, "점심 12500원");
    t.ok(lineOf(saved.text), `KAKAO_RETURN_HINTS_DISABLED=‘${value}’ 는 끄지 않는다`);
  }));
}

// 저장소 호출 수: 켜면 읽기 둘(예산 GET·이번 달 기록 GET)만 늘고 쓰기는 그대로다. 둘 다 답보다 먼저 보낸다.
{
  const run = (disabled) => at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    if (disabled) fx.env.KAKAO_RETURN_HINTS_DISABLED = "1";
    const calls = [];
    const stop = intercept(({ url, method }) => { calls.push({ method, path: url.pathname, feedback: FEEDBACK_ROWS_GET(url, method) || BUDGETS_GET(url, method) }); });
    try { const saved = await say(fx, "점심 12600원"); return { calls, text: saved.text }; } finally { stop(); }
  }));
  const on = await run(false), off = await run(true);
  t.eq(on.calls.length, off.calls.length + 2, `켜면 저장소 호출이 꼭 둘 는다 (${off.calls.length} → ${on.calls.length})`);
  t.eq(on.calls.filter((c) => c.feedback).length, 2, "는 둘은 예산 읽기 하나와 이번 달 기록 읽기 하나다");
  t.eq(on.calls.filter((c) => c.method !== "GET").length, off.calls.filter((c) => c.method !== "GET").length, "쓰기 호출 수는 그대로다");
  t.eq(on.text.split("\n").filter((l) => l !== lineOf(on.text)).join("\n"), off.text, "한 줄을 빼면 답 글이 끈 답과 글자까지 같다");
}

// 읽기 실패·지연·상한: 그 줄만 빠지고 기록은 저장된다.
{
  const cases = [
    ["예산 읽기 503", ({ url, method }) => BUDGETS_GET(url, method) ? failure(503) : undefined],
    ["이번 달 기록 읽기 503", ({ url, method }) => FEEDBACK_ROWS_GET(url, method) ? failure(503) : undefined],
    ["이번 달 기록 읽기 통신 오류", ({ url, method }) => { if (FEEDBACK_ROWS_GET(url, method)) throw new TypeError("fetch failed"); }],
    ["이번 달 기록 읽기가 배열이 아님", ({ url, method }) => FEEDBACK_ROWS_GET(url, method) ? new Response(JSON.stringify({ message: "odd" }), { status: 200, headers: { "content-type": "application/json" } }) : undefined],
  ];
  let amount = 13000;
  for (const [label, handler] of cases) {
    await at("2026-11-10", () => fixture(async (fx) => {
      clean(fx);
      budget(fx, "2026-11", "식비", 300000);
      const stop = intercept(handler);
      let saved;
      try { saved = await say(fx, `점심 ${++amount}원`); } finally { stop(); }
      t.ok(saved.text.includes("저장했어요") && !lineOf(saved.text), `${label}: 저장은 되고 한 줄만 빠진다 (${saved.text.split("\n")[0]})`);
      t.eq(homeRows(fx).filter((row) => Number(row.amount) === amount).length, 1, `${label}: 기록 한 건`);
      t.ok(saved.text.includes("수정:"), `${label}: 답의 나머지는 그대로`);
    }));
  }
  // 독립 검토 1: 읽은 줄의 원소가 이상해도(null·숫자·빈 객체) 저장된 기록에 일반 오류 답이 나가지 않는다 — 보통 저장 답에서 그 줄만 빠지거나, 셀 수 있으면 센다.
  for (const [label, body] of [["기록 줄이 [null]", [null]], ["기록 줄이 [1, \"x\"]", [1, "x"]], ["기록 줄이 [{}]", [{}]]]) {
    await at("2026-11-10", () => fixture(async (fx) => {
      clean(fx);
      budget(fx, "2026-11", "식비", 300000);
      const stop = intercept(({ url, method }) => FEEDBACK_ROWS_GET(url, method) ? new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } }) : undefined);
      let saved;
      try { saved = await say(fx, `점심 ${++amount}원`); } finally { stop(); }
      t.ok(saved.text.includes("저장했어요") && saved.text.includes("수정:") && !saved.text.includes("다시 보내"), `${label}: 보통 저장 답이 나간다 (${saved.text.split("\n")[0]})`);
      t.eq(homeRows(fx).filter((row) => Number(row.amount) === amount).length, 1, `${label}: 기록 한 건`);
      t.ok(!/undefined|NaN/.test(saved.text), `${label}: 답에 undefined·NaN 없음`);
    }));
  }
  // 예산 줄의 원소가 이상한 경우도 같다.
  await at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    const stop = intercept(({ url, method }) => BUDGETS_GET(url, method) ? new Response(JSON.stringify([null, 3]), { status: 200, headers: { "content-type": "application/json" } }) : undefined);
    let saved;
    try { saved = await say(fx, `점심 ${++amount}원`); } finally { stop(); }
    t.ok(saved.text.includes("저장했어요") && saved.text.includes("수정:") && !/undefined|NaN/.test(saved.text), `예산 줄이 [null, 3]: 보통 저장 답이 나간다 (${lineOf(saved.text) || "줄 없음"})`);
  }));
  // 늦은 읽기(600 ms): 350 ms 까지만 기다리고 그 줄 없이 답한다.
  await at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    const stop = intercept(async ({ url, method, forward }) => { if (FEEDBACK_ROWS_GET(url, method)) { await new Promise((resolve) => setTimeout(resolve, 600)); return forward(); } });
    const started = Date.now();
    let saved;
    try { saved = await say(fx, "점심 13900원"); } finally { stop(); }
    t.ok(saved.text.includes("저장했어요") && !lineOf(saved.text), "늦은 읽기: 그 줄 없이 답한다");
    t.eq(homeRows(fx).filter((row) => Number(row.amount) === 13900).length, 1, "늦은 읽기: 기록 한 건");
    t.ok(Date.now() - started < 3000, "늦은 읽기: 답이 그 읽기를 끝까지 기다리지 않는다");
  }));
  // 이번 달 기록이 1,000건에 닿으면(잘렸을 수 있다) 붙이지 않는다. 999건이면 붙인다.
  for (const [count, expected] of [[1000, false], [998, true]]) {
    await at("2026-11-10", () => fixture(async (fx) => {
      clean(fx);
      for (let i = 0; i < count; i += 1) tx(fx, "2026-11-0" + (1 + (i % 9)), 100);
      const saved = await say(fx, "점심 14100원");
      t.ok(saved.text.includes("저장했어요") && !!lineOf(saved.text) === expected, `이번 달 기록 ${count}건 + 한 건: 한 줄 ${expected ? "있음" : "없음"}`);
      if (expected) t.eq(lineOf(saved.text), `📊 이번 달 지출 ${won(count * 100 + 14100)}원 · ${count + 1}건`, "999건째: 합계가 맞다");
    }));
  }
  // 읽기가 저장보다 먼저 끝나 방금 기록을 못 본 경우: 그 기록을 더해 센다(한 번만).
  await at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    tx(fx, "2026-11-03", 30000);
    const stop = intercept(async ({ url, method, forward }) => {
      if (!FEEDBACK_ROWS_GET(url, method)) return undefined;
      const response = await forward();
      const rows = (await response.json()).filter((row) => String(row.id).startsWith("v123-tx-"));
      return new Response(JSON.stringify(rows), { status: 200, headers: { "content-type": "application/json" } });
    });
    let saved;
    try { saved = await say(fx, "점심 14200원"); } finally { stop(); }
    t.eq(lineOf(saved.text), "📊 이번 달 지출 44,200원 · 2건", "읽은 줄에 방금 기록이 없어도 합계에 한 번 들어간다");
  }));
  // 읽은 줄에 방금 기록이 있으면 두 번 세지 않는다(읽기가 저장 뒤에 끝난 경우 — 읽기를 늦춘다).
  await at("2026-11-10", () => fixture(async (fx) => {
    clean(fx);
    tx(fx, "2026-11-03", 30000);
    const stop = intercept(async ({ url, method, forward }) => { if (FEEDBACK_ROWS_GET(url, method)) { await new Promise((resolve) => setTimeout(resolve, 120)); return forward(); } });
    let saved;
    try { saved = await say(fx, "점심 14300원"); } finally { stop(); }
    t.ok(["📊 이번 달 지출 44,300원 · 2건", ""].includes(lineOf(saved.text)), `읽기가 저장 뒤에 끝나도 두 번 세지 않는다 (${lineOf(saved.text) || "줄 없음"})`);
  }));
}

// 독립 검토 1: 말일 23:59 에 받은 기록의 저장이 자정 뒤에 끝나면 ‘이번 달’ 이라고 부르지 않는다(그 줄을 붙이지 않는다). 자정 전에 끝나면 붙는다.
{
  const run = (shift) => at("2026-11-30", () => fixture(async (fx) => {
    clean(fx);
    tx(fx, "2026-11-03", 30000);
    const stop = intercept(({ url, method }) => { if (shift && method === "POST" && url.pathname === "/rest/v1/transactions") globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-12-01T00:00:01+09:00"); });
    try { return await say(fx, "야식 18100원"); } finally { stop(); }
  }), "23:59");
  const before = await run(false), after = await run(true);
  t.ok(before.text.includes("저장했어요") && before.text.includes("2026-11-30") && lineOf(before.text) === "📊 이번 달 지출 48,100원 · 2건", `말일 23:59 기록(자정 전에 끝남): 한 줄 있음 (${lineOf(before.text) || "줄 없음"})`);
  t.ok(after.text.includes("저장했어요") && after.text.includes("2026-11-30") && !lineOf(after.text), `말일 23:59 기록(저장 중에 달이 넘어감): 한 줄 없음 (${lineOf(after.text) || "줄 없음"})`);
}

// ── 4. 단톡방 ─────────────────────────────────────────────────────────────────
const ROOM = "8".repeat(64);
await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  budget(fx, "2026-11", "식비", 300000);
  const linked = await say(fx, "단톡방 연결 HOME2265", { room: ROOM });
  t.ok(/연결/.test(linked.text), `단톡방 연결 준비: ${linked.text.slice(0, 60)}`);
  const saved = await say(fx, "점심 36100원", { room: ROOM });
  t.eq(lineOf(saved.text), "📊 이번 달 식비 예산 12% 사용 · 263,900원 남음", "단톡방 기록 답에도 한 줄이 붙는다");
  t.ok(noUrl(saved.text) && saved.buttons.length === 0, "단톡방·화요일: 단추 없음, 글에 주소 없음");
  t.ok((saved.body.template.outputs || []).length === 1 && !!saved.body.template.outputs[0].simpleText, "단톡방·화요일: 말풍선 하나(글)");
}));

// ── 5. 요약 단추: 오늘 날짜로 남긴 오늘의 첫 기록 답에만 ─────────────────────────────
{
  const scene = (ymd, room, task) => at(ymd, () => fixture(async (fx) => {
    clean(fx);
    if (room) await say(fx, "단톡방 연결 HOME2265", { room });
    return task(fx);
  }));
  // 월요일(11-09): ‘지난주 요약’. 그날 둘째 기록부터는 없다.
  await scene("2026-11-09", "", async (fx) => {
    const first = await say(fx, "점심 15100원");
    t.eq(first.quick.join(","), "지난주 요약|지난주 요약", "월요일 첫 기록(개인 대화): ‘지난주 요약’ 바로가기");
    const second = await say(fx, "커피 4800원");
    t.eq(second.quick.length, 0, "월요일 둘째 기록: 단추 없음");
    const before = homeRows(fx).length;
    const tapped = await say(fx, "지난주 요약");
    t.ok(/지난 ?주 요약/.test(tapped.text) && homeRows(fx).length === before, `단추를 누르면 지난주 요약이 나오고 기록은 늘지 않는다 (${tapped.text.split("\n")[0]})`);
  });
  // 월요일이면서 1~5일(11-02): 둘 다.
  await scene("2026-11-02", "", async (fx) => {
    const first = await say(fx, "점심 15200원");
    t.eq(first.quick.join(","), "지난주 요약|지난주 요약,지난달 요약|지난달 요약", "월요일이면서 월초: 두 단추");
    const before = homeRows(fx).length;
    const tapped = await say(fx, "지난달 요약");
    t.ok(/10월 요약/.test(tapped.text) && homeRows(fx).length === before, `‘지난달 요약’ 단추도 요약 명령이다 (${tapped.text.split("\n")[0]})`);
  });
  // 1~5일이지만 월요일이 아님(11-05 목): ‘지난달 요약’ 만.
  await scene("2026-11-05", "", async (fx) => {
    const first = await say(fx, "점심 15300원");
    t.eq(first.quick.join(","), "지난달 요약|지난달 요약", "월초(목요일): ‘지난달 요약’ 만");
  });
  // 6일(금)·화요일: 없음.
  await scene("2026-11-06", "", async (fx) => t.eq((await say(fx, "점심 15400원")).quick.length, 0, "6일 금요일: 단추 없음"));
  // 월요일이지만 어제 날짜로 남긴 기록: 없음(오늘의 첫 기록이 아니다). 그 뒤 오늘 날짜 첫 기록에는 붙는다.
  await scene("2026-11-09", "", async (fx) => {
    const yesterday = await say(fx, "어제 점심 15500원");
    t.ok(yesterday.text.includes("2026-11-08") && yesterday.quick.length === 0, "월요일에 어제 날짜로 남긴 기록: 단추 없음");
    const today = await say(fx, "저녁 15600원");
    t.eq(today.quick.join(","), "지난주 요약|지난주 요약", "그 뒤 오늘 날짜의 첫 기록: 단추 있음");
  });
  // ‘오늘의 첫 기록’ 은 답의 번호(01번 = 내가 오늘 남긴 첫 줄)로 본다. 다른 사람의 기록은 막지 않고, 내가 오늘 웹에서 먼저 넣은 기록이 있으면 02번이라 붙지 않는다.
  await scene("2026-11-09", "", async (fx) => {
    tx(fx, "2026-11-09", 5000, { source: "web", user: "user-someone-else" });
    tx(fx, "2026-11-09", 6000, { source: "kakao_skill", user: "user-someone-else" });
    const first = await say(fx, "점심 15700원");
    // V22.9.135 N-2: 답의 번호는 이제 가계부 전체 순서다(다른 사람의 두 기록 다음이라 03번). ‘오늘의 첫 기록’ 은 내 기록만 센 번호로 따로 본다.
    t.ok(first.text.includes("03번 - 점심"), "다른 사람의 오늘 기록이 있으면 번호는 가계부 전체 순서(03번)");
    t.eq(first.quick.join(","), "지난주 요약|지난주 요약", "다른 사람의 오늘 기록이 있어도 내 오늘 첫 기록에는 붙는다");
  });
  await scene("2026-11-09", "", async (fx) => {
    tx(fx, "2026-11-09", 5000, { source: "web" });
    const second = await say(fx, "점심 15900원");
    t.ok(second.text.includes("02번") && second.quick.length === 0, "내가 오늘 웹에서 먼저 넣은 기록이 있으면 02번이고 단추는 붙지 않는다");
  });
  // 단톡방 월요일: 글 + 세로 메시지 단추(이름 = 보내는 말) 카드 하나.
  await scene("2026-11-09", ROOM, async (fx) => {
    const first = await say(fx, "점심 15800원", { room: ROOM });
    const outputs = first.body.template.outputs || [];
    t.ok(outputs.length === 1 && !!outputs[0].textCard, `단톡방 월요일 첫 기록: 카드 하나 (${outputs.map((o) => Object.keys(o)[0]).join(",")})`);
    t.eq(first.buttons.join(","), "지난주 요약|지난주 요약", "단톡방 월요일 첫 기록: 메시지 단추 ‘지난주 요약’(이름 = 보내는 말)");
    t.ok(first.text.includes("저장했어요") && !!lineOf(first.text) && noUrl(first.text), "단톡방 카드 글에 저장 답과 한 줄이 그대로 있다");
    t.ok(!first.body.template.quickReplies, "단톡방 답에는 바로가기(quickReplies)가 없다");
    const second = await say(fx, "커피 4900원", { room: ROOM });
    t.ok(second.buttons.length === 0 && !!(second.body.template.outputs || [])[0]?.simpleText, "단톡방 월요일 둘째 기록: 단추 없는 글");
    const tapped = await say(fx, "지난주 요약", { room: ROOM });
    t.ok(/지난 ?주 요약/.test(tapped.text), "단톡방에서 단추를 누르면 지난주 요약");
  });
}

// ── 6. 첫 기록 답의 채팅방 고정 안내 ──────────────────────────────────────────────
await at("2026-11-10", () => fixture(async (fx) => {
  const newbie = "c".repeat(64);
  const first = await say(fx, "점심 16100원", { user: newbie });
  t.ok(first.text.includes("저장했어요"), `처음 온 사람의 첫 기록(개인 대화): 저장됨 (${first.text.split("\n")[0]})`);
  t.eq(first.text.split(PIN_TIP).length - 1, 1, "첫 기록 답에 채팅방 고정 안내가 한 번 있다");
  t.ok(!lineOf(first.text), "첫 기록 답에는 ‘이번 달 …’ 한 줄을 붙이지 않는다(저장소 호출이 가장 많은 요청)");
  t.ok(noUrl(first.text), "첫 기록 답 글에 주소 없음");
  const second = await say(fx, "커피 5100원", { user: newbie });
  t.ok(second.text.includes("저장했어요") && !second.text.includes(PIN_TIP), "둘째 기록 답에는 고정 안내가 없다");
  t.ok(!!lineOf(second.text), "둘째 기록부터 ‘이번 달 …’ 한 줄이 붙는다");
  t.eq(lineOf(second.text), "📊 이번 달 지출 21,200원 · 2건", "둘째 기록의 합계는 첫 기록까지 더한 값");
}));
await at("2026-11-10", () => fixture(async (fx) => {
  const room = "9".repeat(64), opener = "d".repeat(64), joiner = "e".repeat(64);
  const first = await say(fx, "회식 80100원", { user: opener, room });
  t.ok(first.text.includes("저장했어요") && first.text.includes(PIN_TIP), `가계부 없는 방의 첫 기록: 저장 + 고정 안내 (${first.text.split("\n")[0]})`);
  const joined = await say(fx, "택시 9100원", { user: joiner, room });
  t.ok(joined.text.includes("저장했어요"), `그 방 둘째 사람의 첫 기록: 저장됨 (${joined.text.split("\n")[0]})`);
  t.ok(joined.text.split(PIN_TIP).length - 1 <= 1, "둘째 사람의 첫 기록: 고정 안내는 많아야 한 번");
  const again = await say(fx, "커피 5200원", { user: opener, room });
  t.ok(again.text.includes("저장했어요") && !again.text.includes(PIN_TIP), "방을 연 사람의 둘째 기록: 고정 안내 없음");
}));
// 끄면 첫 기록 답에도 고정 안내가 없다.
await at("2026-11-10", () => fixture(async (fx) => {
  fx.env.KAKAO_RETURN_HINTS_DISABLED = "1";
  const first = await say(fx, "점심 16200원", { user: "f".repeat(64) });
  t.ok(first.text.includes("저장했어요") && !first.text.includes("💡"), "끄면 첫 기록 답에 고정 안내 없음");
}));

// ── 7. 기록만 가능한 구성원·조회 전용·수입: 권한과 저장 규칙은 그대로 ─────────────────────
await at("2026-11-10", () => fixture(async (fx) => {
  clean(fx);
  const before = homeRows(fx).length;
  const query = await say(fx, "오늘기록");
  t.ok(!lineOf(query.text) && homeRows(fx).length === before, "조회 명령 답에는 붙지 않는다");
  const edited = await say(fx, "점심 17100원");
  const fix = await say(fx, "수정 01번 금액 17200");
  t.ok(!lineOf(fix.text), `고치기 답에는 붙지 않는다 (${fix.text.split("\n")[0]})`);
  t.ok(!!lineOf(edited.text), "그 앞의 저장 답에는 붙었다");
}));

t.done();
