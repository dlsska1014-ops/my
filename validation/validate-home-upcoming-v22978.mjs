// V22.9.78 홈 ‘앞으로 나갈 돈’ 카드 기준 검사 (V76 W-5, 2026-10-23 운영자 결정: 대기 중 고정지출을 중복 없이 넣는다).
// 예전 카드는 정기 지출 항목(준비 항목)의 건수와 월 준비액만 적었고, 알림센터·예산 알림이 세는 ‘반영 대기’ 고정지출은
// 세지 않았다. 이제 카드의 합계는 이번 달에 아직 기록되지 않은 지출이다: 반영 대기 고정지출 + 납부일이 오늘~말일인 정기지출.
//   - 고정지출은 이번 달 표식(last_applied_month)이나 그 규칙의 이번 달 기록(raw_text recurring:<규칙 id>:<달>)이 있으면 뺀다.
//   - 같은 지출로 짝지은 고정지출 규칙이 있는 정기지출은 규칙 쪽으로만 센다. 수입은 더하지 않는다.
//     V22.9.79 V78 S-1: 짝은 이름만이 아니라 금액이 같고 이름이나 납부일이 같은 것이다(validate-spending-outlook-v22979 가 자세히 본다).
// 기준 함수(homeUpcomingOut)를 직접 부르고, 메모리 픽스처(validation/qa-fixture.mjs)로 홈(/app·/m)과 알림센터를 그려 본다.
// 네트워크는 쓰지 않는다. 픽스처의 월세 규칙(650,000원, 5일, 마지막 반영 2026-06)은 10월에 반영 대기다.
// 사용: node validation/validate-home-upcoming-v22978.mjs [unit|pending|applied|overlap|income|empty|agree]
import { api, counter, failure, fixture, intercept, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";

const only = process.argv[2] || "";
const run = (name) => !only || only === name;
const { ok, eq, deepEq, done } = counter("V22.9.78 홈 '앞으로 나갈 돈' 기준 검사 통과");
const HH = "house-home";
const MONTH = "2026-10";
const TODAY = "2026-10-21";
const HOME = `/app?household_id=${HH}&month=${MONTH}`;
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120";
const MOBILE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari";
const EVERY_MONTH = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
const monthly = (name, amount, dueDay, extra = {}) => ({ id: `w5-${name}`, name, amount, type: "expense", is_recurring: true, recurrence: "monthly", due_months: EVERY_MONTH, due_day: dueDay, ...extra });
const PHONE = monthly("통신비", 55000, 25);
const ALLOWANCE = monthly("직무수당", 300000, 25, { type: "income", category: "급여" });
const RENT_RECORD = { id: "w5-rent-oct", household_id: HH, user_id: "user-bin", transaction_date: "2026-10-05", type: "expense", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", source: "recurring_auto", raw_text: `recurring:recurring-rent:${MONTH}` };

const setPlans = (fx, plans) => putSetting(fx, `reserve_plans:${HH}`, JSON.stringify(plans));
const rent = (fx) => fx.db.accountbook_recurring.find((rule) => rule.id === "recurring-rent");
async function home(fx, { path = HOME, ua = DESKTOP } = {}) {
  const response = await page(fx, path, { headers: { "user-agent": ua } });
  const card = (response.html.match(/<article class="homeReport"><div class="homeReportTop"><span>앞으로 나갈 돈<\/span>[\s\S]*?<\/article>/) || [""])[0];
  return { status: response.status, raw: response.html, card, value: (card.match(/<b>([^<]*)<\/b>/) || [])[1] || "", note: (card.match(/<small>([^<]*)<\/small>/) || [])[1] || "" };
}

// ── 1. 기준 함수 ─────────────────────────────────────────────────────────────────
if (run("unit")) {
  // 고치기 전 코드에는 이 함수가 없다. 정적 import 로 받으면 아래 화면 검사까지 못 돌므로 동적으로 읽는다.
  // V22.9.79 W-7: 월말 예상과 같은 계산이라 domain/spending-outlook.js 로 옮겼다.
  const { homeUpcomingOut } = await import("../src/modules/domain/spending-outlook.js");
  ok(typeof homeUpcomingOut === "function", "카드 기준 함수 homeUpcomingOut 이 있다");
  const RULE = { id: "r1", type: "expense", amount: 650000, memo: "월세", category: "주거/관리", day_of_month: 5, is_active: true, last_applied_month: "2026-09" };
  const of = (input) => homeUpcomingOut({ month: MONTH, today: TODAY, rows: [], plans: [], recurring: [], ...input });
  const sum = (m) => [m.total, m.fixedCount, m.planCount];
  deepEq(sum(of({ recurring: [RULE] })), [650000, 1, 0], "반영 대기 고정지출 하나는 그 금액으로 한 번 센다");
  deepEq(sum(of({ recurring: [{ ...RULE, last_applied_month: MONTH }] })), [0, 0, 0], "이번 달 표식이 있는 고정지출은 이미 기록된 것이라 뺀다");
  deepEq(sum(of({ recurring: [RULE], rows: [{ ...RENT_RECORD, raw_text: `recurring:r1:${MONTH}` }] })), [0, 0, 0], "표식 저장이 늦어도 그 규칙의 이번 달 기록이 있으면 뺀다");
  deepEq(sum(of({ recurring: [RULE], rows: [{ ...RENT_RECORD, raw_text: "recurring:r1:2026-09" }] })), [650000, 1, 0], "지난달 기록은 이번 달 반영으로 보지 않는다");
  deepEq(sum(of({ recurring: [{ ...RULE, last_applied_month: "2026-11" }] })), [650000, 1, 0], "다음 달 표식만 있고 이번 달 기록이 없으면 아직 대기다(자동 반영도 이번 달 몫을 넣는다)");
  deepEq(sum(of({ recurring: [{ ...RULE, is_active: false }, { ...RULE, id: "r0", amount: 0 }] })), [0, 0, 0], "꺼 둔 규칙과 금액 0 규칙은 세지 않는다(자동 반영도 건너뛴다)");
  // 같은 항목을 두 곳에 등록한 경우: 금액이 같고 이름(공백·대소문자 무시)이 같은 정기지출은 규칙 쪽으로만 센다.
  // V22.9.79 V78 S-1: 예전에는 이름만 봐서 금액이 다른 항목(600,000원)도 짝이 됐다. 같은 지출이면 금액도 같으므로 650,000원으로 둔다.
  const RENT_PLAN = monthly(" 월 세", 650000, 25);
  deepEq(sum(of({ recurring: [RULE], plans: [RENT_PLAN] })), [650000, 1, 0], "같은 월세가 고정지출·정기지출에 모두 있으면 규칙 금액으로 한 번 센다");
  deepEq(sum(of({ recurring: [{ ...RULE, last_applied_month: MONTH }], plans: [RENT_PLAN] })), [0, 0, 0], "규칙이 이번 달에 이미 기록됐으면 같은 이름의 정기지출도 세지 않는다");
  deepEq(sum(of({ recurring: [{ ...RULE, is_active: false }], plans: [RENT_PLAN] })), [650000, 0, 1], "규칙을 꺼 두면 기록을 만들지 않으므로 정기지출 쪽을 센다");
  deepEq(sum(of({ recurring: [{ ...RULE, memo: "Netflix", category: "구독", amount: 17000 }], plans: [monthly("netflix", 17000, 25)] })), [17000, 1, 0], "영문 대소문자만 다른 이름도 같은 항목이다");
  // 정기지출의 날짜: 오늘부터 말일까지만.
  const plansByDate = [monthly("통신비", 55000, 21), monthly("도시가스", 40000, 10), { id: "w5-tax", name: "자동차세", amount: 240000, type: "expense", recurrence: "semiannual", due_months: [6, 12], due_day: 16 }];
  deepEq(sum(of({ plans: plansByDate })), [55000, 0, 1], "납부일이 오늘인 정기지출은 세고, 이번 달에 이미 지난 납부일과 다른 달 납부는 세지 않는다");
  // 수입은 더하지 않는다.
  const SALARY = { ...RULE, id: "r-pay", type: "income", amount: 3000000, memo: "월급", category: "급여", day_of_month: 25 };
  const income = of({ recurring: [SALARY], plans: [ALLOWANCE] });
  deepEq([income.total, income.expenseItems, income.incomeItems], [0, 0, 2], "수입 규칙·수입 항목은 합계에 넣지 않고 수입 건수로만 센다");
  deepEq(sum(of({ recurring: [RULE, SALARY], plans: [PHONE, ALLOWANCE] })), [705000, 1, 1], "섞여 있어도 지출만 더한다(650,000 + 55,000)");
  const unread = of({ recurring: null, plans: [PHONE] });
  eq(unread.available, false, "고정지출을 못 읽으면(null) 합계를 낼 수 없다고 알린다");
}

// ── 2. 반영 대기 고정지출을 한 번 센다(알림센터의 '반영 대기'와 같은 기준) ──────────────
if (run("pending")) await withClock(TODAY, () => fixture(async (fx) => {
  const card = await home(fx);
  eq(card.status, 200, "이번 달 홈이 열린다");
  eq(card.value, "650,000원", `반영 대기 고정지출(월세)이 '앞으로 나갈 돈' 합계에 들어간다 (${card.value})`);
  eq(card.note, "이번 달 남은 고정지출 1건", `아래 한 줄은 합계에 든 건수를 적는다 (${card.note})`);
  const notices = (await api(fx, `/u/api/notifications?household_id=${HH}&month=${MONTH}`)).data || {};
  const pending = (notices.notifications || []).find((n) => n.key === `recurring-pending:${MONTH}`);
  // V22.9.79 V78 S-2: 알림도 홈과 같은 이름(고정지출)으로 부른다.
  ok(pending && pending.title === "이번 달 반영 대기 고정지출 1건" && pending.body.includes("650,000원"), `알림센터의 반영 대기와 같은 건수·금액이다 (${pending?.title} / ${pending?.body})`);
  eq(notices.budget_observation?.pending_total, 650000, "예산 알림의 반영 대기 합계와 카드의 고정지출 몫이 같다");
  setPlans(fx, [PHONE]);
  const both = await home(fx);
  eq(both.value, "705,000원", `반영 대기 고정지출과 이번 달 남은 정기지출을 더한다 (${both.value})`);
  eq(both.note, "이번 달 남은 고정지출 1건 · 정기지출 1건", `출처별 건수가 합계와 맞다 (${both.note})`);
  ok(!both.note.includes("705,000") && !both.note.includes("650,000"), "해석 줄은 금액을 되풀이하지 않는다");
  ok(Buffer.byteLength(both.raw) < 35 * 1024, `홈 HTML 이 35 KiB 예산 안이다 (${Buffer.byteLength(both.raw)} B)`);
}));

// ── 3. 이미 기록한 고정지출은 뺀다 ──────────────────────────────────────────────────
if (run("applied")) {
  await withClock(TODAY, () => fixture(async (fx) => {
    eq((await home(fx)).value, "650,000원", "기록 전에는 월세가 남아 있다");
    const applied = await post(fx, "/admin/recurring/apply", { household_id: HH, month: MONTH });
    ok(applied.status >= 300 && applied.status < 400 && fx.db.transactions.some((tx) => tx.raw_text === `recurring:recurring-rent:${MONTH}`) && rent(fx).last_applied_month === MONTH, `정기 화면의 기록하기가 이번 달 월세를 기록한다 (${applied.decoded})`);
    const after = await home(fx);
    eq(after.value, "0원", `기록한 고정지출은 '앞으로 나갈 돈'에서 빠진다 (${after.value})`);
    eq(after.note, "이번 달 남은 고정·정기지출이 없어요", `남은 항목이 없다고 말한다 (${after.note})`);
  }));
  await withClock(TODAY, () => fixture(async (fx) => {
    fx.db.transactions.push({ ...RENT_RECORD });
    rent(fx).last_applied_month = "2026-09";
    const lagged = await home(fx);
    eq(lagged.value, "0원", `표식 저장이 늦어도 이번 달 기록이 있는 고정지출은 다시 세지 않는다 (${lagged.value})`);
  }));
  await withClock("2026-10-03", () => fixture(async (fx) => {
    // 지정일(5일) 전에 기록하기를 누르면 기록 날짜는 앞으로 올 5일이다. 이미 기록됐으므로 남은 돈에 넣지 않는다.
    await post(fx, "/admin/recurring/apply", { household_id: HH, month: MONTH });
    ok(fx.db.transactions.some((tx) => tx.raw_text === `recurring:recurring-rent:${MONTH}` && tx.transaction_date === "2026-10-05"), "지정일 전 기록은 지정일 날짜로 들어간다");
    eq((await home(fx)).value, "0원", "날짜가 아직 오지 않았어도 이미 기록한 고정지출은 뺀다");
  }));
}

// ── 4. 같은 항목을 고정지출·정기지출에 함께 등록해도 한 번만 센다 ─────────────────────────
if (run("overlap")) await withClock(TODAY, () => fixture(async (fx) => {
  setPlans(fx, [monthly("월세", 650000, 25, { category: "주거/관리" })]);
  const card = await home(fx);
  eq(card.value, "650,000원", `같은 월세를 두 곳에 등록해도 한 번만 더한다 (${card.value})`);
  eq(card.note, "이번 달 남은 고정지출 1건", `겹친 항목은 기록을 만드는 고정지출 쪽으로만 센다 (${card.note})`);
  await post(fx, "/admin/recurring/apply", { household_id: HH, month: MONTH });
  eq((await home(fx)).value, "0원", "고정지출을 기록하면 같은 이름의 정기지출도 남은 돈에서 빠진다");
}));

// ── 5. 수입은 더하지 않는다 ────────────────────────────────────────────────────────
if (run("income")) await withClock(TODAY, () => fixture(async (fx) => {
  fx.db.accountbook_recurring.push({ id: "w5-salary", household_id: HH, type: "income", amount: 3000000, category: "급여", memo: "월급", payment_method: "", day_of_month: 25, user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00.000Z" });
  setPlans(fx, [ALLOWANCE]);
  const mixed = await home(fx);
  eq(mixed.value, "650,000원", `반영 대기 월급 규칙·정기 수당은 더하지 않는다 (${mixed.value})`);
  eq(mixed.note, "이번 달 남은 고정지출 1건", "수입은 건수에도 넣지 않는다");
  fx.db.accountbook_recurring = fx.db.accountbook_recurring.filter((rule) => rule.type === "income");
  const incomeOnly = await home(fx);
  eq(incomeOnly.value, "나갈 항목 없음", `수입만 등록한 집은 나갈 항목이 없다고 말한다 (${incomeOnly.value})`);
  eq(incomeOnly.note, "정기 수입 2건만 등록돼 있어요", `수입 규칙과 수입 항목을 함께 센다 (${incomeOnly.note})`);
}));

// ── 6. 빈 상태·지난달·읽기 실패 ───────────────────────────────────────────────────
if (run("empty")) await withClock(TODAY, () => fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  setPlans(fx, []);
  const empty = await home(fx);
  eq(empty.value, "등록 없음", `고정·정기 항목이 하나도 없으면 등록 없음 (${empty.value})`);
  eq(empty.note, "세금·보험처럼 큰돈이 나가는 달을 미리 준비합니다", "빈 상태 안내는 예전 그대로다");
  ok(!/NaN|undefined|Infinity/.test(empty.card), "빈 상태에서 계산이 깨지지 않는다");
  fx.db.accountbook_recurring.push({ id: "w5-gym", household_id: HH, type: "expense", amount: 70000, category: "운동", memo: "헬스장", payment_method: "국민카드", day_of_month: 28, user_id: "user-bin", is_active: true, last_applied_month: null, created_at: "2026-10-20T00:00:00.000Z" });
  const first = await home(fx);
  eq(first.value, "70,000원", `처음 등록한 고정지출 하나가 바로 합계가 된다 (${first.value})`);
  let reads = 0;
  const stopCount = intercept(({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/accountbook_recurring")) reads += 1; return null; });
  let past;
  try {
    await home(fx);
    eq(reads, 1, `이번 달 홈은 고정지출 규칙을 한 번 읽는다 (${reads})`);
    reads = 0;
    past = await home(fx, { path: `/app?household_id=${HH}&month=2026-07` });
  } finally { stopCount(); }
  eq(reads, 0, "지난달 홈은 고정지출 규칙을 읽지 않는다(정기 항목과 같은 조건)");
  eq(past.value, "이번 달 기준", "지난달 카드는 예전처럼 단정하지 않는다");
  const stopFail = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? failure() : null));
  let broken;
  try { broken = await home(fx); } finally { stopFail(); }
  eq(broken.status, 200, "고정지출을 못 읽어도 홈은 열린다");
  eq(broken.value, "확인 불가", `못 읽은 고정지출을 0원으로 단정하지 않는다 (${broken.value})`);
  eq(broken.note, "고정지출을 불러오지 못했어요", "무엇을 못 읽었는지 말한다");
}));

// ── 7. 데스크톱(/app)과 모바일(/m)이 같은 숫자를 보여 준다 ──────────────────────────────
if (run("agree")) await withClock(TODAY, () => fixture(async (fx) => {
  setPlans(fx, [PHONE]);
  const desktop = await home(fx);
  const mobile = await home(fx, { path: `/m?household_id=${HH}&month=${MONTH}`, ua: MOBILE });
  eq(desktop.value, "705,000원", `데스크톱 카드 합계 (${desktop.value})`);
  eq(mobile.card, desktop.card, "모바일과 데스크톱이 같은 카드(같은 합계·같은 설명)를 받는다");
  // 모바일은 리포트 앞의 두 장만 보인다. 홈 구성에서 이 카드를 앞으로 옮기면 모바일에도 같은 카드가 보인다.
  putSetting(fx, `home-layout:v1:${HH}:user-bin`, JSON.stringify({ reports: { order: ["reserve", "where", "pace", "budget"], hidden: [] } }));
  const moved = await home(fx, { path: `/m?household_id=${HH}&month=${MONTH}`, ua: MOBILE });
  const grid = (moved.raw.match(/<div class="homeReportGrid">[\s\S]*?<\/section>/) || [""])[0];
  ok(grid.indexOf("앞으로 나갈 돈") >= 0 && grid.indexOf("앞으로 나갈 돈") < grid.indexOf("어디에 썼나"), "홈 구성에서 앞으로 옮긴 카드가 리포트 첫 장이다");
  eq(moved.card, desktop.card, "자리를 옮겨도 같은 숫자다");
}));

done();
