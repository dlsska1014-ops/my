// V22.9.79 V76 W-7 ‘월말 예상’ 하나 검사 (docs/codex/PROPOSAL_W7_SPENDING_OUTLOOK_V22_9_78.md, 2026-10-25 운영자가 권장안 채택).
// 예전에는 화면마다 월말 예상이 달랐다: 분석·리포트·스마트 도구는 하루 평균 × 그 달 일수(1일에 적힌 월세가 부풀었다),
// 예산 알림·알림센터는 반영 대기 고정지출을 ‘가정값’ 줄에만 더했고, 홈은 그 둘과 또 다른 한 줄이었다.
// 이제 한 함수(domain/spending-outlook.js 의 monthSpendingOutlook)가 이번 달을
//   오늘까지 기록 + 오늘 뒤 날짜의 정기 기록 + 반영 대기 고정지출 + 남은 정기지출 납부 + round(변동 지출 ÷ 지난 날 × 남은 날)
// 로 센다. 이 검사는 제안서의 시험 계획 1~7과 함께 고친 항목을 본다:
//   V44 D-18(하루 사용 가능 내림), V78 S-1(정기지출·고정지출 짝짓기), V78 S-2(반영 대기 판정·이름 — 홈·예산 알림·알림센터·
//   /reserve-plans·/reports 가 같은 판정, 홈 정기지출 항목 읽기 실패는 확인 불가), V44 D-4(외식 갈래·예산 밖),
//   V44 D-12(예산 없을 때 사용률), V44 D-13(이전 값 0원의 증감률).
// 검사마다 따로 성공·실패를 적는다(옛 코드에서 몇 개가 실패하는지 셀 수 있게). 네트워크는 쓰지 않는다(메모리 픽스처).
import { isDeepStrictEqual } from "node:util";
import { api, failure, fixture, intercept, page, post, putSetting, skill, withClock } from "./lib-audit-v22934.mjs";

const results = [];
async function check(label, fn) {
  try {
    const value = await fn();
    results.push(value === true ? { ok: true, label } : { ok: false, label, detail: String(value) });
  } catch (error) {
    results.push({ ok: false, label, detail: error?.message || String(error) });
  }
}
const same = (actual, expected) => isDeepStrictEqual(actual, expected) || `기대 ${JSON.stringify(expected)}, 실제 ${JSON.stringify(actual)}`;
const has = (text, needle) => String(text).includes(needle) || `없음 ${JSON.stringify(needle)} — ${JSON.stringify(String(text).replace(/\s+/g, " ").slice(0, 240))}`;
const lacks = (text, needle) => !String(text).includes(needle) || `있으면 안 됨 ${JSON.stringify(needle)}`;
const all = (...values) => values.find((value) => value !== true) ?? true;
async function load(rel) {
  try { return await import(rel); } catch (error) { return { __missing: error?.message || String(error) }; }
}
const outlookModule = await load("../src/modules/domain/spending-outlook.js");
const analyticsModule = await load("../src/modules/domain/analytics.js");
const budgetsModule = await load("../src/modules/domain/budgets.js");
const alertsModule = await load("../src/modules/features/budget-alerts-annual-goals.js");
const need = (mod, name) => {
  if (typeof mod[name] !== "function") throw new Error(`${name} 함수가 없다 (${mod.__missing || "내보내지 않음"})`);
  return mod[name];
};
async function atInstant(iso, task) {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(iso);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
}

const HH = "house-home";
const MONTH = "2026-10";
const Q = `month=${MONTH}&household_id=${HH}`;
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
let seq = 0;
const tx = (date, amount, extra = {}) => ({ id: `w7-${++seq}`, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", category: "외식", memo: "합성 지출", payment_method: "국민카드", source: "web", raw_text: "합성 지출", amount, ...extra });
const fixedRow = (ruleId, month, date, amount, extra = {}) => tx(date, amount, { category: "주거/관리", memo: "월세", source: "recurring_auto", raw_text: `recurring:${ruleId}:${month}`, ...extra });
const RULE = { id: "r-rent", type: "expense", amount: 650000, category: "주거/관리", memo: "월세", day_of_month: 25, is_active: true, last_applied_month: "2026-09" };
const plan = (id, name, amount, dueDay, extra = {}) => ({ id, name, amount, type: "expense", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: dueDay, ...extra });
const PHONE = plan("w7-phone", "통신비", 55000, 25);
const won = (n) => `${Number(n).toLocaleString("en-US")}원`;
const metric = (html, label) => (String(html).match(new RegExp(`<span>${label}</span><b>([^<]*)</b>`)) || [])[1] || "";
const homePlanNote = (html) => ((((String(html).match(/<div class="homeDailyPlan[^"]*">[\s\S]*?<\/div>/) || [""])[0]).match(/<small>([^<]*)<\/small>/)) || [])[1] || "";
const homeCard = (html) => (String(html).match(/<span>앞으로 나갈 돈<\/span>[\s\S]*?<b>([^<]*)<\/b>/) || [])[1] || "";
const strip = (html) => String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ");
// 이번 달(10월) 기록·예산을 비우고 시나리오 값만 넣는다. 픽스처의 월세 규칙(650,000원, 5일, 마지막 반영 2026-06)은 10월에 반영 대기다.
function seed(fx, rows = [], budgets = [{ category: "__total", amount: 3000000 }], plans = null) {
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH || !String(row.transaction_date || "").startsWith(MONTH));
  fx.db.transactions.push(...structuredClone(rows));
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => row.household_id !== HH || row.month !== MONTH);
  budgets.forEach((row, index) => fx.db.accountbook_budgets.push({ id: `w7-budget-${index}`, household_id: HH, month: MONTH, created_at: `${MONTH}-01T00:00:00.000Z`, ...row }));
  if (plans) putSetting(fx, `reserve_plans:${HH}`, JSON.stringify(plans));
}
async function adminPage(fx, path) {
  fx.env.ADMIN_PASSWORD = "synthetic-outlook-password";
  fx.env.ADMIN_SESSION_SECRET = "synthetic-outlook-session";
  fx.env.AUTH_RATE_LIMIT = 50;
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  return page(fx, `${path}&legacy=1`, { cookie: `${fx.cookie}; ${(login.setCookie.match(/ab_admin=[^;]+/) || [""])[0]}` });
}
function captureReads() {
  const reads = [];
  intercept(({ url, method }) => { if (method === "GET" && url.hostname === "mock.supabase.co") reads.push({ path: url.pathname, key: url.searchParams.get("key") || "" }); });
  return reads;
}
const readsOf = (reads, table, key = "") => reads.filter((read) => read.path.endsWith(`/${table}`) && (!key || read.key === key)).length;

// ── 1. 공통 함수: 정기 항목이 없으면 예전 값과 같다(시험 1) ──────────────────────────────
const D3 = [tx("2026-10-10", 300000), tx("2026-10-25", 150000)];
await withClock("2026-10-15", async () => {
  await check("1 D3 기록(10일 300,000·25일 150,000, 15일 기준)의 월말 예상은 예전 burnForecast 620,000원과 같다", () => {
    const outlook = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: D3, recurring: [], plans: [] });
    return all(same(outlook.expected.total, 620000), same(outlook.expected.total, need(analyticsModule, "monthlyObservedSpending")(D3, MONTH).burnForecast));
  });
  await check("1 내역: 오늘까지 기록 300,000 · 등록액 450,000 · 앞 날짜 일반 지출 150,000은 더하지 않음 · 남은 16일 예상 320,000", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: D3, recurring: [], plans: [] });
    return same([o.status, o.recorded.toDate, o.recorded.registered, o.recorded.futureOrdinary, o.remainingDays, o.expected.pace, o.expected.fixedRemaining], ["complete", 300000, 450000, 150000, 16, 320000, 0]);
  });
  await check("1 예산 범위(식비 700,000)도 같은 620,000원이고 하루 사용 가능은 내림 14,705원이다(D-18)", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: D3, recurring: [], plans: [], budgets: [{ category: "식비", amount: 700000 }], scope: "budgeted" });
    return same([o.expected.total, o.budget.remaining, o.budget.dailyAllowance, o.budget.diff], [620000, 250000, 14705, -80000]);
  });
  await check("1 내역 한 줄: ‘기록 A + 남은 고정·정기 B + 남은 n일 예상 C’", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: D3, recurring: [], plans: [] });
    return same(need(outlookModule, "spendingOutlookBreakdown")(o), "기록 300,000원 + 남은 고정·정기 0원 + 남은 16일 예상 320,000원");
  });
});
// V22.9.89: 남은 날 예상은 미리 적은 일반 지출(31일 999원)보다 작지 않다. 속도 예상이 그보다 크면 예전 식과 같고,
// 작으면(금액 1·7원) 오늘까지 기록 + 999원이다 — 예전에는 이때 월말 예상이 그 달 등록액보다 작았다.
for (const day of ["01", "02", "15", "30", "31"]) {
  await withClock(`2026-10-${day}`, () => check(`1 정기 항목이 없으면 ${day}일에도 예전 식(round(관측 ÷ 지난 날 × 그 달 일수))과 같되, 미리 적은 일반 지출보다 작지 않다`, () => {
    const outlook = need(outlookModule, "monthSpendingOutlook");
    const observed = need(analyticsModule, "monthlyObservedSpending");
    for (const amount of [1, 7, 12345, 300000]) {
      const rows = [tx("2026-10-01", amount), tx(`2026-10-${day}`, amount * 3), tx("2026-10-31", 999)];
      const got = outlook({ month: MONTH, rows, recurring: [], plans: [] }).expected.total;
      const old = observed(rows, MONTH);
      const want = Math.max(old.burnForecast, old.observedExpense + (day === "31" ? 0 : 999));
      if (got !== want) return `금액 ${amount}: ${got} ≠ ${want}`;
      if (amount >= 12345 && got !== old.burnForecast) return `금액 ${amount}: 예전 식 ${old.burnForecast} 과 다름(${got})`;
    }
    return true;
  }));
}
await withClock("2026-10-15", async () => {
  // 예산 1,000,000원(식비), 15일까지 100,000원, 20일로 미리 적은 일반 지출. 속도 예상(16일 106,667원)보다 크면 그 금액을 쓴다.
  const budgets = [{ category: "식비", amount: 1000000 }];
  const rowsWith = (ahead) => [tx("2026-10-05", 100000, { category: "식비" }), tx("2026-10-20", ahead, { category: "식비" })];
  await check("1 V22.9.89 미리 적은 800,000원 > 속도 예상: 월말 예상 900,000원, 월말에 남을 예산(100,000원)이 지금 남은 예산을 넘지 않는다", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: rowsWith(800000), recurring: [], plans: [], budgets, scope: "budgeted" });
    return all(same([o.expected.total, o.expected.pace, o.recorded.futureOrdinary, o.budget.remaining, o.budget.diff, o.budget.runOutDay], [900000, 800000, 800000, 100000, -100000, null]),
      o.budget.total - o.expected.total <= o.budget.remaining || "월말에 남을 예산이 지금 남은 예산보다 크다");
  });
  await check("1 V22.9.89 미리 적은 950,000원으로 예산을 넘으면 그 날(20일)에 바닥난다(12일 먼저)", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: rowsWith(950000), recurring: [], plans: [], budgets, scope: "budgeted" });
    return same([o.expected.total, o.budget.diff, o.budget.runOutDay, o.budget.daysEarly], [1050000, 50000, 20, 12]);
  });
  await check("1 V22.9.89 미리 적은 50,000원 < 속도 예상: 예전처럼 더하지 않는다(D3 계약)", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: rowsWith(50000), recurring: [], plans: [], budgets, scope: "budgeted" });
    return same([o.expected.total, o.expected.pace, o.budget.runOutDay], [206667, 106667, null]);
  });
});

// ── 2. 1일에 적힌 월세는 하루 평균을 부풀리지 않는다(시험 2) ──────────────────────────────
const RENT_FIRST = [fixedRow("r-rent", MONTH, "2026-10-01", 600000), tx("2026-10-04", 200000, { category: "식비" })];
await withClock("2026-10-10", async () => {
  await check("2 10일: 1일 정기 기록 600,000 + 변동 200,000 → 월말 예상 1,220,000원(예전 2,480,000원)", () => {
    const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: RENT_FIRST, recurring: [{ ...RULE, amount: 600000, last_applied_month: MONTH }], plans: [] });
    return all(same([o.expected.total, o.recorded.fixed, o.recorded.variable, o.expected.pace], [1220000, 600000, 200000, 420000]), same(need(analyticsModule, "monthlyObservedSpending")(RENT_FIRST, MONTH).burnForecast, 2480000));
  });
});

// ── 3. 반영 대기 고정지출은 한 번만(시험 3, V78 S-2) ─────────────────────────────────────
await withClock("2026-10-10", async () => {
  const base = [tx("2026-10-04", 200000, { category: "식비" })];
  const run = (rows, recurring) => need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows, recurring, plans: [] });
  await check("3 대기 고정지출(표식 9월)은 그 금액으로 한 번 더한다: 200,000 + 650,000 + 420,000 = 1,270,000", () => {
    const o = run(base, [RULE]);
    return same([o.notYetRecorded.pendingFixedCount, o.notYetRecorded.pendingFixed, o.expected.total], [1, 650000, 1270000]);
  });
  await check("3 표식 저장이 늦어도(표식 9월) 그 규칙의 10월 기록이 있으면 대기가 아니다", () => {
    const o = run([...base, fixedRow("r-rent", MONTH, "2026-10-05", 650000)], [RULE]);
    return same([o.notYetRecorded.pendingFixedCount, o.recorded.fixed, o.expected.total], [0, 650000, 1270000]);
  });
  await check("3 표식만 있고(10월) 기록이 없어도 대기로 다시 세지 않는다", () => same(run(base, [{ ...RULE, last_applied_month: MONTH }]).notYetRecorded.pendingFixedCount, 0));
  await check("3 표식과 기록이 모두 있으면 기록으로 한 번만 센다", () => {
    const o = run([...base, fixedRow("r-rent", MONTH, "2026-10-05", 650000)], [{ ...RULE, last_applied_month: MONTH }]);
    return same([o.notYetRecorded.pendingFixedCount, o.expected.total], [0, 1270000]);
  });
  await check("3 지정일 전에 반영해도(기록 날짜 25일) 월말 예상이 반영 전과 같다(앞 날짜 정기 기록은 남은 고정으로 센다)", () => {
    const before = run(base, [RULE]);
    const after = run([...base, fixedRow("r-rent", MONTH, "2026-10-25", 650000)], [{ ...RULE, last_applied_month: MONTH }]);
    return same([after.expected.total, after.recorded.scheduledFixed, after.notYetRecorded.pendingFixed, after.recorded.futureOrdinary], [before.expected.total, 650000, 0, 0]);
  });
  await check("3 지난달 기록(recurring:r-rent:2026-09)은 이번 달 반영으로 보지 않는다", () => same(run([...base, fixedRow("r-rent", "2026-09", "2026-10-02", 650000)], [RULE]).notYetRecorded.pendingFixedCount, 1));
  await check("3 꺼 둔 규칙·금액 0 규칙·수입 규칙은 대기로 세지 않는다", () => same(run(base, [{ ...RULE, is_active: false }, { ...RULE, id: "r0", amount: 0 }, { ...RULE, id: "r-pay", type: "income" }]).notYetRecorded.pendingFixedCount, 0));
});

// ── 4. 정기지출(준비 항목) 납부와 V78 S-1 짝짓기 ─────────────────────────────────────────
await withClock("2026-10-10", async () => {
  const run = (recurring, plans) => need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: [], recurring, plans });
  const upcoming = (recurring, plans) => need(outlookModule, "homeUpcomingOut")({ month: MONTH, today: "2026-10-10", rows: [], recurring, plans });
  await check("4 납부일이 오늘인 항목은 넣고, 어제 지난 항목·다음 달 항목은 넣지 않는다", () => {
    const o = run([], [plan("p-today", "도시가스", 40000, 10), plan("p-yesterday", "인터넷", 30000, 9), plan("p-nov", "자동차세", 240000, 16, { due_months: [11] })]);
    return same([o.notYetRecorded.reserveCount, o.notYetRecorded.reserveRemaining], [1, 40000]);
  });
  await check("4 수입 항목은 월말 예상에 넣지 않는다", () => same(run([], [plan("p-pay", "직무수당", 300000, 25, { type: "income" })]).notYetRecorded.reserveRemaining, 0));
  await check("4 S-1 이름이 달라도(집세·월세) 금액·납부일이 같으면 같은 지출로 한 번만 센다", () => {
    const rule = { ...RULE, day_of_month: 5 };
    const u = upcoming([rule], [plan("p-house", "집세", 650000, 5)]);
    return same([u.total, u.fixedCount, u.planCount], [650000, 1, 0]);
  });
  await check("4 S-1 이름이 같아도(보험) 금액이 다르면 다른 지출이라 둘 다 센다", () => {
    const u = upcoming([{ ...RULE, id: "r-ins", memo: "보험", category: "보험", amount: 30000, day_of_month: 12 }], [plan("p-ins", "보험", 1200000, 20, { recurrence: "annual", due_months: [10] })]);
    return same([u.total, u.fixedCount, u.planCount], [1230000, 1, 1]);
  });
  await check("4 S-1 규칙 하나는 정기지출 하나와만 짝짓는다(같은 금액·날짜 항목이 둘이면 하나는 따로 센다)", () => {
    const rule = { ...RULE, day_of_month: 25 };
    const u = upcoming([rule], [plan("p-a", "월세", 650000, 25), plan("p-b", "관리비", 650000, 25)]);
    return same([u.total, u.fixedCount, u.planCount], [1300000, 1, 1]);
  });
  await check("4 S-1 꺼 둔 규칙은 짝이 없다(정기지출 쪽을 센다)", () => {
    const u = upcoming([{ ...RULE, is_active: false }], [plan("p-rent", "월세", 650000, 25)]);
    return same([u.total, u.fixedCount, u.planCount], [650000, 0, 1]);
  });
  await check("4 S-1 이미 기록된 규칙과 짝지은 정기지출은 남은 돈에 넣지 않는다", () => same(upcoming([{ ...RULE, last_applied_month: MONTH }], [plan("p-rent", "월 세", 650000, 28)]).total, 0));
  await check("4 홈 ‘앞으로 나갈 돈’ = 월말 예상의 반영 대기 고정지출 + 남은 정기지출 납부(같은 계산)", () => {
    const rules = [RULE, { ...RULE, id: "r-gym", memo: "헬스장", category: "운동", amount: 70000, day_of_month: 28 }];
    const plans = [PHONE, plan("p-house", "집세", 650000, 25), plan("p-ins", "보험", 1200000, 20, { due_months: [10] })];
    const o = run(rules, plans);
    const u = upcoming(rules, plans);
    return same([u.total, u.fixedTotal, u.planTotal], [o.notYetRecorded.pendingFixed + o.notYetRecorded.reserveRemaining, o.notYetRecorded.pendingFixed, o.notYetRecorded.reserveRemaining]);
  });
});

// ── 5. 지난달·미래 달·확인 불가·일부 미포함·예산 밖 규칙(시험 5) ───────────────────────────
await withClock("2026-10-10", async () => {
  const outlook = (input) => need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: [tx("2026-10-04", 200000, { category: "식비" })], recurring: [RULE], plans: [PHONE], ...input });
  await check("5 지난달은 실적이다(대기 규칙·남은 날 예상 없음)", () => {
    const o = outlook({ month: "2026-09", rows: [tx("2026-09-03", 300000), tx("2026-09-30", 10000)] });
    return same([o.status, o.monthState, o.expected.total, o.expected.pace, o.expected.fixedRemaining, need(outlookModule, "spendingOutlookCaption")(o)], ["complete", "past", 310000, 0, 0, "월 전체 실적"]);
  });
  await check("5 미래 달은 관측 전이다(예상 없음)", () => {
    const o = outlook({ month: "2026-11", rows: [tx("2026-11-01", 300000)] });
    return same([o.status, o.expected, need(outlookModule, "spendingOutlookCaption")(o)], ["before", null, "관측 전"]);
  });
  await check("5 영수증이 불완전하면 확인 불가다(0원으로 단정하지 않음)", () => same([outlook({ receipt: { status: "limit" } }).status, outlook({ receipt: { status: "limit" } }).expected], ["unavailable", null]));
  await check("5 날짜·금액이 깨진 기록이 있으면 확인 불가다", () => same([outlook({ rows: [tx("2026-10-32", 1)] }).status, outlook({ rows: [tx("2026-10-02", null)] }).status], ["unavailable", "unavailable"]));
  await check("5 고정지출 규칙을 못 읽으면 그 몫을 빼고 계산하고 일부 미포함이라고 알린다", () => {
    const o = outlook({ recurring: null });
    return all(same([o.status, o.partial, o.expected.partialReasons, o.expected.total], ["complete", true, ["recurring"], 200000 + 55000 + 420000]), has(need(outlookModule, "spendingOutlookBreakdown")(o), "고정지출을 읽지 못해 빼고 계산"));
  });
  await check("5 정기지출 항목을 못 읽으면 그 몫을 빼고 계산하고 일부 미포함이라고 알린다", () => {
    const o = outlook({ plans: null });
    return all(same([o.expected.partialReasons, o.expected.total], [["plans"], 200000 + 650000 + 420000]), has(need(outlookModule, "spendingOutlookCaption")(o), "정기지출 항목 제외"));
  });
  await check("5 예산 범위(식비)는 예산 밖 분류의 대기 고정지출(주거/관리)을 빼고 따로 돌려준다, 전체 범위는 넣는다(M-6)", () => {
    const budgeted = outlook({ plans: [], budgets: [{ category: "식비", amount: 800000 }], scope: "budgeted" });
    const allScope = outlook({ plans: [] });
    return same([budgeted.notYetRecorded.pendingFixed, budgeted.notYetRecorded.outsidePendingFixed, budgeted.expected.total, allScope.expected.total], [0, 650000, 620000, 1270000]);
  });
  await check("5 환불 차감 입력은 기본이 없음이고(빈 목록과 같음), 넘기면 기록에서만 빼고 속도에는 넣지 않는다", () => {
    const plain = outlook({});
    const empty = outlook({ refundDeductions: [] });
    const deducted = outlook({ refundDeductions: [{ transaction_date: "2026-10-06", amount: 50000, category: "식비" }] });
    return same([empty.expected.total, deducted.recorded.toDate, deducted.recorded.refundDeduction, deducted.expected.pace, deducted.expected.total], [plain.expected.total, 150000, 50000, plain.expected.pace, plain.expected.total - 50000]);
  });
});

// ── 6. KST 달 경계(시험 6) ────────────────────────────────────────────────────────────
await check("6 UTC 10-31 14:59:59.999(KST 10-31 23:59)는 아직 10월: 남은 날 0, 대기 고정지출은 넣는다", () => atInstant("2026-10-31T14:59:59.999Z", () => {
  const o = need(outlookModule, "monthSpendingOutlook")({ month: MONTH, rows: [tx("2026-10-04", 200000)], recurring: [RULE], plans: [] });
  return same([o.monthState, o.elapsedDays, o.remainingDays, o.expected.pace, o.expected.total], ["current", 31, 0, 0, 850000]);
}));
await check("6 UTC 10-31 15:00:00(KST 11-01 00:00)부터 10월은 실적이고 11월은 1일째다", () => atInstant("2026-10-31T15:00:00.000Z", () => {
  const run = need(outlookModule, "monthSpendingOutlook");
  const october = run({ month: MONTH, rows: [tx("2026-10-04", 200000)], recurring: [RULE], plans: [] });
  const november = run({ month: "2026-11", rows: [tx("2026-11-01", 30000)], recurring: [RULE], plans: [] });
  return same([october.monthState, october.expected.total, november.monthState, november.elapsedDays, november.remainingDays, november.expected.total], ["past", 200000, "current", 1, 29, 30000 + 650000 + 870000]);
}));
await check("6 KST 11-01 00:00 분석 화면 함수도 10월을 실적으로 본다(calculateDashboardAnalysis)", () => atInstant("2026-10-31T15:00:00.000Z", () => {
  const rows = [tx("2026-10-04", 200000)];
  return same(need(analyticsModule, "calculateDashboardAnalysis")(rows, rows, [], MONTH).burnForecast, 200000);
}));

// ── 예산 바닥 날짜: 예전 속도 안내와 같은 날수, 대기 고정지출은 지정일(지났으면 오늘)에 더한다 ────────────
await withClock("2026-10-10", async () => {
  const run = (input) => need(outlookModule, "monthSpendingOutlook")({ month: MONTH, budgets: [{ category: "__total", amount: 1000000 }], scope: "budgeted", plans: [], ...input });
  await check("예산 100만원에 10일까지 80만원이면 13일에 바닥나 19일 먼저 끝난다(예전 안내와 같은 19일)", () => {
    const o = run({ rows: [tx("2026-10-02", 800000)], recurring: [] });
    return same([o.budget.runOutDay, o.budget.daysEarly], [13, 19]);
  });
  await check("지정일이 지난 대기 고정지출은 오늘 나가는 것으로 본다(오늘 바닥)", () => {
    const o = run({ rows: [tx("2026-10-02", 400000)], recurring: [{ ...RULE, day_of_month: 5 }] });
    return same([o.budget.runOutDay, o.budget.diff > 0], [10, true]);
  });
});

// ── 7. 화면끼리 같은 숫자(시험 7): /budget-alerts·알림 JSON·홈·/my/analysis·?view=report·/smart-tools ─────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  // 기록 150,000(10월 3·8일) + 앞 날짜 일반 지출 50,000(20일, 더하지 않음) + 대기 월세 650,000 + 통신비 55,000(25일)
  // + 남은 21일 예상 315,000 = 1,170,000원. 예산은 월 전체 300만 원(예산 범위 = 전체 분류).
  seed(fx, [tx("2026-10-03", 120000, { category: "식비" }), tx("2026-10-08", 30000, { category: "교통" }), tx("2026-10-20", 50000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], [PHONE]);
  const expected = won(1170000);
  const alerts = (await page(fx, `/budget-alerts?${Q}`)).html;
  const notes = (await api(fx, `/u/api/notifications?${Q}`)).data || {};
  const home = (await page(fx, `/app?${Q}`)).html;
  const insight = (await page(fx, `/my/analysis?${Q}`)).html;
  const report = (await page(fx, `/my/analysis?view=report&${Q}`)).html;
  const smart = (await page(fx, `/smart-tools?${Q}`)).html;
  await check("7 /budget-alerts 월말 예상 지출 1,170,000원", () => same(metric(alerts, "월말 예상 지출"), expected));
  await check("7 /budget-alerts 내역 줄", () => has(alerts, "기록 150,000원 + 남은 고정·정기 705,000원 + 남은 21일 예상 315,000원"));
  await check("7 /budget-alerts 에 예전 ‘관측 속도 월말 예상’·‘가정값’ 줄이 없다", () => all(lacks(alerts, "관측 속도 월말 예상"), lacks(alerts, "대기 목록을 모두 더한 가정값")));
  await check("7 알림 JSON forecast 1,170,000 · expected_parts 내역 · 옛 키 after_pending_assumption 은 한 판 동안 같은 값", () => {
    const b = notes.budget_observation || {};
    return same([b.forecast, b.after_pending_assumption, b.expected_parts], [1170000, 1170000, { recorded: 150000, fixed_remaining: 705000, pace: 315000, remaining_days: 21, reserve_state: "complete", partial: false }]);
  });
  // V22.9.89 U-03(V2 작업 지시서): 범위를 말하고 큰 금액은 만 원 단위 근사로 쓴다. 근거 숫자(300만 − 1,170,000)는 그대로다.
  await check("7 홈 하루 계획 한 줄: 이대로면 월말에 예산이 약 183만 원 남아요(300만 − 1,170,000)", () => same(homePlanNote(home), "이대로면 월말에 예산이 약 183만 원 남아요"));
  await check("7 홈 ‘앞으로 나갈 돈’ 705,000원 = 알림 JSON 남은 고정·정기", () => all(same(homeCard(home), won(705000)), same(notes.budget_observation?.expected_parts?.fixed_remaining, 705000)));
  await check("7 /my/analysis 월말 예상 지출 1,170,000원", () => same(metric(insight, "월말 예상 지출"), expected));
  await check("7 /my/analysis?view=report 월말 예상 1,170,000원(두 카드)", () => all(has(report, `<span class="muted">월말 예상 지출</span><b>${expected}</b>`), has(report, `<span class="muted">월말 예상</span><b>${expected}</b>`)));
  await check("7 ?view=report 부제는 ‘기록 + 남은 고정 + 남은 날 예상’", () => all(has(report, "기록 + 남은 고정 + 남은 날 예상"), lacks(report, "현재 지출 속도 기준"), lacks(report, ">현재 속도 기준<")));
  await check("7 /smart-tools 월말 예상 지출 1,170,000원", () => same(metric(smart, "월말 예상 지출"), expected));
}));

// ── 7b. 같은 숫자로 ‘월말 초과 예상’을 판정한다(운영자 결정 Q3) ─────────────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  // 예산 100만 원, 기록 100,000 → 예전 속도 예상 310,000원(정상 흐름). 대기 월세 650,000 + 통신비 55,000을 넣으면 1,015,000원.
  seed(fx, [tx("2026-10-05", 100000, { category: "식비" })], [{ category: "__total", amount: 1000000 }], [PHONE]);
  const alerts = (await page(fx, `/budget-alerts?${Q}`)).html;
  const notes = (await api(fx, `/u/api/notifications?${Q}`)).data || {};
  const home = (await page(fx, `/app?${Q}`)).html;
  await check("7b /budget-alerts 가 대기 고정지출까지 더해 월말 초과 예상이라고 말한다", () => all(same(metric(alerts, "월말 예상 지출"), won(1015000)), has(alerts, "월말 초과 예상"), has(alerts, "남은 고정지출과 지금 속도를 더하면 월말에 예산을 넘을 수 있어요.")));
  await check("7b 카카오 안내 문구도 같은 숫자다", () => has(alerts, "남은 고정지출과 지금 속도를 더하면 월말 예상 지출은 1,015,000원으로 예산보다 15,000원 많을 수 있어요."));
  await check("7b 알림센터도 같은 숫자로 초과 예상 알림을 낸다", () => {
    const warn = (notes.notifications || []).find((item) => item.key === `budget-warn:${MONTH}`);
    return all(same(notes.budget_observation?.forecast, 1015000), has(warn?.body || "", "남은 고정지출까지 더한 월말 예상 1,015,000원 / 예산 1,000,000원"));
  });
  await check("7b 홈도 같은 근거로 예산이 먼저 끝난다고 말한다(30일 바닥 → 2일 먼저)", () => same(homePlanNote(home), "이대로면 예산이 2일 먼저 끝나요")); // V22.9.89 U-03 문구
}));

// ── 3b. 화면에서도 반영 대기를 한 번만, 같은 판정·같은 이름으로(V78 S-2) ─────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], []);
  const notes = (await api(fx, `/u/api/notifications?${Q}`)).data || {};
  const pending = (notes.notifications || []).find((item) => item.key === `recurring-pending:${MONTH}`);
  await check("3b 반영 대기 알림은 홈과 같은 이름(고정지출)이다", () => same(pending?.title, "이번 달 반영 대기 고정지출 1건"));
  await check("3b /budget-alerts 대기 칸 이름도 고정지출이다", async () => has((await page(fx, `/budget-alerts?${Q}`)).html, "<span>고정지출 대기</span><b>650,000원</b>"));
  // 표식 저장이 늦은 달: 10월 기록은 있는데 표식은 9월이다. 홈은 이미 반영으로 보는데 알림은 한 건 더 셌다.
  fx.db.transactions.push(fixedRow("recurring-rent", MONTH, "2026-10-05", 650000, { id: "w7-rent-oct" }));
  fx.db.accountbook_recurring.find((rule) => rule.id === "recurring-rent").last_applied_month = "2026-09";
  const lagged = (await api(fx, `/u/api/notifications?${Q}`)).data || {};
  const laggedHome = (await page(fx, `/app?${Q}`)).html;
  const laggedAlerts = (await page(fx, `/budget-alerts?${Q}`)).html;
  await check("3b 표식이 늦은 달: 알림센터도 반영 대기 0건(홈 ‘앞으로 나갈 돈’과 같은 판정)", () => all(same((lagged.notifications || []).some((item) => item.key === `recurring-pending:${MONTH}`), false), same(lagged.budget_observation?.pending_total, 0), same(homeCard(laggedHome), "0원")));
  await check("3b 표식이 늦은 달: 예산 알림 대기 칸도 0원이고 월말 예상은 기록된 월세로 한 번만 센다", () => all(has(laggedAlerts, "<span>고정지출 대기</span><b>0원</b>"), same(metric(laggedAlerts, "월말 예상 지출"), won(200000 + 650000 + 420000))));
}));
await withClock("2026-10-10", () => fixture(async (fx) => {
  // 지정일(25일) 전 수동 반영: 반영 전후 월말 예상이 같다(대기 → 앞 날짜 정기 기록).
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], []);
  fx.db.accountbook_recurring.find((rule) => rule.id === "recurring-rent").day_of_month = 25;
  const before = (await api(fx, `/u/api/notifications?${Q}`)).data?.budget_observation || {};
  const applied = await post(fx, "/admin/recurring/apply", { household_id: HH, month: MONTH });
  const after = (await api(fx, `/u/api/notifications?${Q}`)).data?.budget_observation || {};
  const afterAlerts = (await page(fx, `/budget-alerts?${Q}`)).html;
  await check("3b 지정일 전 반영 뒤에도 알림센터 월말 예상이 같다(1,270,000원)", () => all(same(applied.status, 303), same([before.forecast, after.forecast, after.pending_total], [1270000, 1270000, 0])));
  await check("3b 지정일 전 반영 뒤 예산 알림은 앞 날짜 기록을 월말 예상에 넣었다고 말한다", () => all(same(metric(afterAlerts, "월말 예상 지출"), won(1270000)), has(strip(afterAlerts), "날짜가 아직 오지 않은 반영된 고정지출 1건(650,000원)은 월말 예상에 넣었습니다.")));
}));

// ── 5b. 화면에서 읽기 실패: 그 몫을 빼고 계산했다고 적는다 ───────────────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], [PHONE]);
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? failure() : null));
  let alerts;
  let notes;
  try { alerts = (await page(fx, `/budget-alerts?${Q}`)).html; notes = (await api(fx, `/u/api/notifications?${Q}`)).data || {}; } finally { stop(); }
  await check("5b 고정지출 규칙을 못 읽으면 예산 알림이 그 몫을 빼고 계산했다고 적는다", () => all(has(alerts, "(고정지출을 읽지 못해 빼고 계산)"), same(metric(alerts, "월말 예상 지출"), won(200000 + 55000 + 420000))));
  await check("5b 알림 JSON 도 일부 미포함·대기 확인 불가를 알린다", () => same([notes.budget_observation?.pending_state, notes.budget_observation?.expected_parts?.partial, notes.budget_observation?.after_pending_assumption], ["unavailable", true, null]));
  const stopHome = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? failure() : null));
  let home;
  try { home = (await page(fx, `/app?${Q}`)).html; } finally { stopHome(); }
  await check("5b 고정지출 규칙을 못 읽은 홈은 남는 돈을 부풀려 말하지 않는다(한 줄 없음, 카드는 확인 불가)", () => all(same(homePlanNote(home), ""), same(homeCard(home), "확인 불가"), has(home, "homeDailyPlan")));
}));
await withClock("2026-10-10", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], [PHONE]);
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.reserve_plans:${HH}` ? failure() : null));
  let alerts;
  let notes;
  try { alerts = (await page(fx, `/budget-alerts?${Q}`)).html; notes = (await api(fx, `/u/api/notifications?${Q}`)).data || {}; } finally { stop(); }
  await check("5b 정기지출 항목을 못 읽으면 0건으로 단정하지 않고 빼고 계산했다고 적는다", () => all(has(alerts, "정기지출 항목을 읽지 못해 빼고 계산"), has(strip(alerts), "정기지출 항목을 읽지 못해 남은 납부액은 월말 예상에서 빼고 계산했습니다."), same(metric(alerts, "월말 예상 지출"), won(200000 + 650000 + 420000))));
  await check("5b 알림 JSON 도 정기지출 항목 확인 불가를 알린다", () => same([notes.budget_observation?.expected_parts?.reserve_state, notes.budget_observation?.expected_parts?.partial], ["unavailable", true]));
}));

// ── 읽기 수: 홈은 추가 요청 없음, 분석은 제안서대로 ─────────────────────────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })]);
  await page(fx, `/app?${Q}`);
  const homeReads = captureReads();
  await page(fx, `/app?${Q}`);
  await check("읽기 홈은 9회 그대로(규칙·정기 항목은 이미 읽은 값으로 계산)", () => all(same(homeReads.length <= 9, true), same(readsOf(homeReads, "accountbook_settings", `eq.reserve_plans:${HH}`), 0)));
  const insightReads = captureReads();
  await page(fx, `/my/analysis?${Q}`);
  await check("읽기 /my/analysis 는 고정지출 규칙·정기지출 항목을 한 번씩 읽는다(+2)", () => same([readsOf(insightReads, "accountbook_recurring"), readsOf(insightReads, "accountbook_settings", `eq.reserve_plans:${HH}`)], [1, 1]));
  const reportReads = captureReads();
  await page(fx, `/my/analysis?view=report&${Q}`);
  await check("읽기 ?view=report 는 규칙을 한 번만(반복 후보와 같은 값), 정기지출 항목을 한 번 읽는다", () => same([readsOf(reportReads, "accountbook_recurring"), readsOf(reportReads, "accountbook_settings", `eq.reserve_plans:${HH}`)], [1, 1]));
  const smartReads = captureReads();
  await page(fx, `/smart-tools?${Q}`);
  await check("읽기 /smart-tools 도 규칙 한 번·정기지출 항목 한 번", () => same([readsOf(smartReads, "accountbook_recurring"), readsOf(smartReads, "accountbook_settings", `eq.reserve_plans:${HH}`)], [1, 1]));
}));

// ── V44 D-18: ‘하루 X원’은 홈·예산 알림·관리자 분석 모두 내림 ───────────────────────────────
await withClock("2026-10-15", async () => {
  await check("D-18 예산 알림 모델의 하루 사용 가능은 내림(250,000 ÷ 17일 = 14,705)", () => same(need(alertsModule, "buildBudgetAlertPolishModel")({ month: MONTH, rows: D3, budgets: [{ category: "식비", amount: 700000 }], recurring: [] }).dailyAllowance, 14705));
  await fixture(async (fx) => {
    seed(fx, D3, [{ category: "식비", amount: 700000 }]);
    const home = (await page(fx, `/app?${Q}`)).html;
    const alerts = (await page(fx, `/budget-alerts?${Q}`)).html;
    const pc = await adminPage(fx, `/analysis?${Q}`);
    await check("D-18 홈 하루 14,705원", () => has(home, 'data-ab-num="14705"'));
    await check("D-18 예산 알림 오늘 사용 가능 14,705원(홈과 같은 숫자)", () => same(metric(alerts, "오늘 사용 가능"), won(14705)));
    await check("D-18 관리자 PC 분석 하루 14,705원", () => all(same(pc.status, 200), has(pc.html, "하루 14,705원"), lacks(pc.html, "하루 14,706원")));
  });
});

// ── V44 D-4: 시작 분류 ‘외식’은 배달·편의점까지, 장보기는 예산 밖으로 따로 적는다 ───────────────
{
  const rows = [["외식", 12000], ["배달", 13000], ["편의점", 2000], ["장보기", 9000], ["식비", 1000], ["카페/간식", 5000]].map(([category, amount]) => ({ type: "expense", category, amount }));
  await check("D-4 ‘외식’ 예산 한 줄은 외식·배달·편의점·옛 식비를 센다(28,000)", () => same(need(budgetsModule, "budgetSummary")(rows, [{ category: "외식", amount: 100000 }]).budgetedExpense, 28000));
  await check("D-4 장보기·카페는 외식 갈래가 아니라 예산 밖으로 남는다(14,000)", () => same(need(budgetsModule, "budgetSummary")(rows, [{ category: "외식", amount: 100000 }]).uncoveredExpense, 14000));
  await check("D-4 진짜 상위 행(식비)이 있으면 외식은 하위 행으로 남는다", () => same(need(budgetsModule, "budgetSummary")(rows, [{ category: "식비", amount: 100000 }, { category: "외식", amount: 50000 }]).categoryAlerts.find((row) => row.category === "외식").spent, 12000));
}
await withClock("2026-10-14", () => fixture(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  seed(fx, [tx("2026-10-02", 12000), tx("2026-10-03", 23000, { category: "배달" }), tx("2026-10-04", 9000, { category: "장보기" })], [{ category: "외식", amount: 200000 }]);
  const kakao = await skill(fx, "남은예산");
  const home = (await page(fx, `/app?${Q}`)).html;
  const budgets = strip((await page(fx, `/budgets?${Q}`)).html);
  await check("D-4 카카오 남은예산: 외식 예산이 배달까지 센다(35,000원)", () => has(kakao, "사용 금액: 35,000원"));
  await check("D-4 카카오 남은예산: 예산 밖 지출(장보기 9,000원)을 조용히 빼지 않고 적는다", () => has(kakao, "예산 밖 지출: 9,000원"));
  // V22.9.89 U-02: 홈 예산 카드 아랫줄은 용어 사전(metric-labels.js) 이름을 쓴다(‘지출’→‘예산 쓴 돈’, ‘예산 밖’→‘예산 안 정한 지출’). 숫자는 같다.
  await check("D-4 홈: 예산 쓴 돈 35,000원 아래에 예산 안 정한 지출 9,000원을 적는다", () => has(home, "<span>예산 쓴 돈 35,000원<br>예산 안 정한 지출 9,000원</span>"));
  await check("D-4 예산 화면도 같은 숫자다(사용 35,000원, 예산 밖 9,000원)", () => all(has(budgets, "사용 35,000원"), has(budgets, "예산 밖 지출 9,000원")));
}));

// ── V44 D-12: 예산이 없으면 ‘예산 사용률 0%’를 쓰지 않는다 ───────────────────────────────────
await withClock("2026-10-14", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-02", 12000)], []);
  const none = (await page(fx, `/app?${Q}`)).html;
  seed(fx, [tx("2026-10-02", 12000)], [{ category: "__total", amount: 100000 }]);
  const some = (await page(fx, `/app?${Q}`)).html;
  await check("D-12 예산이 없는 홈에는 예산 사용률 문구가 없다(금액 자리는 예산 미설정)", () => all(lacks(none, "예산 사용률"), has(none, "예산 미설정")));
  await check("D-12 예산이 있으면 사용률을 그대로 보인다(12%)", () => has(some, 'data-ab-num-style="percent">12%</span>'));
}));

// ── V44 D-13: 이전 값이 0원이면 +100% 를 지어내지 않는다(관리자 화면·주간 리포트) ─────────────────
await check("D-13 formatChangeAgainst: 이전 0원 → 비교 기록 없음, 둘 다 0 → 0%, 그 밖에는 증감률", () => {
  const fmt = need(analyticsModule, "formatChangeAgainst");
  return same([fmt("지난달", 500, 0), fmt("지난달", 0, 0), fmt("지난달", 450000, 300000), fmt("전월", 0, 500)], ["지난달 비교 기록 없음", "지난달 대비 0%", "지난달 대비 +50%", "전월 대비 -100%"]);
});
await withClock("2026-10-15", () => fixture(async (fx) => {
  // 9월 기록이 없고 10월에만 있다. 이번 주(12~15일)만 쓰고 지난주 같은 시점(5~8일)에는 쓰지 않았다.
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH || !String(row.transaction_date || "").startsWith("2026-09"));
  seed(fx, [tx("2026-10-13", 30000)]);
  const pc = await adminPage(fx, `/analysis?${Q}`);
  const dash = await adminPage(fx, `/admin-view?tab=overview&${Q}`);
  const report = (await page(fx, `/my/analysis?view=report&${Q}`)).html;
  const weekly = (report.match(/<div class="weeklyHead">[\s\S]*?<\/div>/) || [""])[0];
  await check("D-13 관리자 PC 분석: 지난달 0원이면 ‘지난달 비교 기록 없음’", () => all(has(pc.html, "지난달 비교 기록 없음"), lacks(pc.html, "지난달 대비 +100%")));
  await check("D-13 관리자 대시보드: 전월 0원이면 ‘전월 비교 기록 없음’", () => all(has(dash.html, "전월 비교 기록 없음"), lacks(dash.html, "전월 대비 +100%")));
  await check("D-13 주간 리포트: 지난주 같은 시점 0원이면 비교 기록 없음(빠르다는 판단도 없음)", () => all(has(weekly, "지난주 같은 시점 비교 기록 없음"), lacks(weekly, "+100%"), has(weekly, 'class="deltaFlat"'), lacks(report, "지난주보다 소비 속도가 빨라요")));
  await check("D-13 관리자 분석 ‘월말 예상’ 부제는 기록만으로 계산했다고 적는다(규칙·항목을 읽지 않는 옛 화면)", () => has(pc.html, "기록 + 남은 고정 + 남은 날 예상 · 반영 대기 고정지출·정기지출 항목 제외"));
}));
await withClock("2026-10-15", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-10", 450000)]);
  fx.db.transactions.push(tx("2026-09-10", 300000));
  const pc = await adminPage(fx, `/analysis?${Q}`);
  await check("D-13 이전 값이 있으면 예전처럼 증감률을 보인다(지난달 대비 +50%)", () => has(pc.html, "지난달 대비 +50%"));
}));

// ── V78 S-2 마무리: 모든 화면이 같은 ‘반영됨’ 판정·같은 ‘못 읽음’ 처리를 쓴다 ───────────────────────────────
// (a) 홈의 정기지출 항목 읽기가 실패하면 ‘항목 없음’이 아니라 확인 불가다(조회 수는 그대로 9회).
await check("S-2 homeUpcomingOut: 정기지출 항목을 못 읽으면(null) 합계를 내지 않고 무엇을 못 읽었는지 돌려준다", () => {
  const u = need(outlookModule, "homeUpcomingOut")({ month: MONTH, today: "2026-10-10", rows: [], recurring: [RULE], plans: null });
  const both = need(outlookModule, "homeUpcomingOut")({ month: MONTH, today: "2026-10-10", rows: [], recurring: null, plans: null });
  return same([u.available, u.rulesKnown, u.plansKnown, both.rulesKnown, both.plansKnown], [false, true, false, false, false]);
});
await withClock("2026-10-10", () => fixture(async (fx) => {
  seed(fx, [tx("2026-10-04", 200000, { category: "식비" })], [{ category: "__total", amount: 3000000 }], [PHONE]);
  await page(fx, `/app?${Q}`);
  const reads = captureReads();
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_settings") && String(url.searchParams.get("key") || "").startsWith("in.(") && String(url.searchParams.get("key") || "").includes(`reserve_plans:${HH}`) ? failure() : null));
  let home;
  try { home = await page(fx, `/app?${Q}`); } finally { stop(); }
  await check("S-2 홈 정기지출 항목 읽기 실패: ‘앞으로 나갈 돈’은 확인 불가이고 정기지출을 못 읽었다고 적는다", () => all(same(home.status, 200), same(homeCard(home.html), "확인 불가"), has(home.html, "정기지출을 불러오지 못했어요")));
  await check("S-2 홈 정기지출 항목 읽기 실패: 정기 수입·지출 카드가 ‘등록한 항목이 없어요’라고 하지 않는다", () => all(lacks(home.html, "아직 등록한 항목이 없어요"), has(home.html, "정기 항목을 불러오지 못했어요")));
  await check("S-2 홈 정기지출 항목 읽기 실패: 월말 예상 한 줄은 빠진 몫을 빼고 말하지 않는다(숨김)", () => same(homePlanNote(home.html), ""));
  await check("S-2 홈 정기지출 항목 읽기 실패에도 조회는 9회 그대로다(같은 설정 조회를 엄격하게 읽을 뿐)", () => same(reads.length <= 9, true));
}));
// (b) /reserve-plans ‘반영 완료’도 홈·예산 알림과 같은 판정이다(그 달 표식 또는 그 달 기록).
const reservePage = async (fx) => (await page(fx, `/reserve-plans?${Q}`)).html;
const reserveBadge = (html) => (String(html).match(/<b>월세<\/b><span>[\s\S]*?<\/span><span>(이번 달 [^<]*)<\/span>/) || [])[1] || "";
const applyButtonCount = (html) => (String(html).match(/분 (?:지금 )?기록하기( \([0-9,]+건 반영됨\))?<\/button>/) || [])[1] || "";
await withClock("2026-10-10", () => fixture(async (fx) => {
  const rule = fx.db.accountbook_recurring.find((item) => item.id === "recurring-rent");
  rule.last_applied_month = "2026-09";
  fx.db.transactions.push(fixedRow("recurring-rent", MONTH, "2026-10-05", 650000, { id: "s2-rent-oct" }));
  const reads = [];
  intercept(({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/transactions")) reads.push(url.searchParams.getAll("raw_text").join("&")); });
  const html = await reservePage(fx);
  await check("S-2 /reserve-plans: 표식 저장이 늦어도(9월) 그 달 기록이 있으면 ‘이번 달 반영 완료’다(홈·예산 알림과 같음)", () => all(same(reserveBadge(html), "이번 달 반영 완료"), same(applyButtonCount(html), " (1건 반영됨)")));
  await check("S-2 /reserve-plans: 그 달 반영 표식이 달린 기록만 한 번 읽는다(+1)", () => same(reads, [`like.recurring:*:${MONTH}`]));
  rule.last_applied_month = MONTH;
  fx.db.transactions = fx.db.transactions.filter((row) => row.id !== "s2-rent-oct");
  await check("S-2 /reserve-plans: 반영된 기록을 지워도 표식이 그 달이면 반영 완료다(예전과 같음)", async () => same(reserveBadge(await reservePage(fx)), "이번 달 반영 완료"));
  rule.last_applied_month = "2026-09";
  fx.db.transactions.push(fixedRow("recurring-rent", MONTH, "2026-10-05", 650000, { id: "s2-rent-oct" }));
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/transactions") ? failure() : null));
  let failed;
  try { failed = await page(fx, `/reserve-plans?${Q}`); } finally { stop(); }
  await check("S-2 /reserve-plans: 표식 기록을 못 읽어도 화면은 열리고 예전처럼 표식(last_applied_month)만으로 센다", () => all(same(failed.status, 200), same(reserveBadge(failed.html), "이번 달 아직 반영 안 됨")));
}));
// (c) 생활비 리포트(/reports)의 ‘이번 달 반영’도 같은 판정이다.
const reportTag = (html) => (String(html).match(/<b>월세<\/b><small>[^<]*<\/small><\/div><div class="amt">[^<]*<span class="lrTag[^"]*">([^<]*)<\/span>/) || [])[1] || "";
await withClock("2026-10-10", () => fixture(async (fx) => {
  const rule = fx.db.accountbook_recurring.find((item) => item.id === "recurring-rent");
  rule.last_applied_month = MONTH;
  await check("S-2 /reports: 반영된 기록을 지워도 표식이 그 달이면 ‘이번 달 반영’이다(홈은 반영됨으로 본다)", async () => all(same(reportTag((await page(fx, `/reports?${Q}`)).html), "이번 달 반영"), same(homeCard((await page(fx, `/app?${Q}`)).html), "0원")));
  rule.last_applied_month = "2026-09";
  fx.db.transactions.push(fixedRow("recurring-rent", MONTH, "2026-10-05", 650000, { id: "s2-rent-report" }));
  await check("S-2 /reports: 표식 저장이 늦어도 그 달 기록이 있으면 ‘이번 달 반영’이다(예전과 같음)", async () => same(reportTag((await page(fx, `/reports?${Q}`)).html), "이번 달 반영"));
  fx.db.transactions = fx.db.transactions.filter((row) => row.id !== "s2-rent-report");
  await check("S-2 /reports: 표식도 기록도 없으면 ‘반영 전’이다", async () => same(reportTag((await page(fx, `/reports?${Q}`)).html), "반영 전"));
}));

const failed = results.filter((result) => !result.ok);
for (const result of failed) console.error(`FAIL: ${result.label}\n      ${result.detail}`);
if (failed.length) {
  console.error(`V22.9.79 월말 예상 하나 검사: ${failed.length} of ${results.length} checks failed`);
  process.exitCode = 1;
} else {
  console.log(`V22.9.79 월말 예상 하나 검사 통과 (${results.length} checks)`);
}
