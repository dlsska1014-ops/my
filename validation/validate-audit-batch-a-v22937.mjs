// V22.9.37 감사 묶음 A 검사 — docs/codex/AUDIT_FINDINGS_V22_9_34.md §2 의 SIM 항목과 V22_9_33 §4·§6 의
// 정기·예산·집계 결함을 메모리 픽스처(validation/qa-fixture.mjs)로 재현하고 고친 뒤를 고정한다. 네트워크를 쓰지 않는다.
//   SIM-3 정기 항목 이름 변경이 같은 이름의 다른 항목을 지우지 않는다(중복 이름은 거절).
//   SIM-2 예산 일괄 저장에서 같은 분류가 다른 금액으로 두 줄이면 저장하지 않는다.
//   SIM-4 추천 반복 거래를 확정하면 원래 기록의 지출자·분류를 이어받는다.
//   SIM-5 고정항목 지출자는 소유자·관리자·구성원만 제안·허용한다(조회 전용·대기·차단·나간 사람 제외).
//   SIM-8 지난 달 수동 반영이 더 나중 달의 반영 표식을 되돌리지 않는다.
//   SIM-9 종류별 예상 수입이 있으면 옛 __income 합계 행은 기준에서 뺀다(없을 때만 호환용).
//   SIM-16 연간 월 평균은 기록 있는 달(이번 해는 지난 달까지)로 나눈다.
//   SIM-18 최장 무지출은 이번 달이면 오늘까지, 앞으로 올 달은 세지 않는다.
//   T7 수동 반영은 문제 규칙만 건너뛰고 알린다. 자격 규칙은 저장·자동·수동이 같다.
//   T8 /my/settings 반복 거래 수정이 지출자를 고친 사람으로 바꾸지 않는다.
//   D7 카카오 예산 현황: 지출 예산이 0원이면 "예산 없음"으로 보고, 분류별 예산이 있을 때 직접 설정한 전체 예산은 쓰지 않음을 말한다.
//   D9 저장 뒤 예산 안내는 보고 있던 달이 아니라 기록한 날짜의 달 기준이다.
//   D10 안내는 실제로 있는 카카오 명령만 말한다.
//   D11~D14 예산 초과 판정은 금액 기준, 홈 지난달 비교는 같은 기간, 월별 추이 조회 실패는 확인 불가, 날짜 묶음 합계는 전체 기록 기준.
//   N8·N9 틀린 월·상한을 넘는 단건 예산은 저장·삭제하지 않는다. N10 적립 계획의 월·일·반복주기를 검증한다.
import { readFileSync } from "node:fs";
import { runRecurringAutoApply } from "../src/index.js";
import { longestNoSpendStreak, renderV8TxDayGroups } from "../src/modules/my/home-sections.js";
import { budgetCenterSummary } from "../src/modules/domain/budgets.js";
import { detectRecurringCandidates, renderMonthlySeriesChart } from "../src/modules/admin/pc-analysis-calendar.js";
import {
  BASE, app, counter, ctx, failure, fixture, formFields, intercept, page, post, putSetting, settingValue, skill, withClock,
} from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.37 감사 묶음 A 통과");
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const HOME = "house-home";
const reservePlans = (fx) => JSON.parse(settingValue(fx, `reserve_plans:${HOME}`) || "[]");
const budgetRows = (fx, month) => fx.db.accountbook_budgets.filter((row) => row.household_id === HOME && row.month === month).map((row) => `${row.category}=${row.amount}`).sort().join(",");
// 리다이렉트 주소는 URLSearchParams 로 만들어져 띄어쓰기가 + 로 온다. 비교 전에 되돌린다.
const loc = (res) => String(res.decoded || "").replace(/\+/g, " ");
const locParam = (res, key) => new URL(res.location, BASE).searchParams.get(key) || "";
// 픽스처의 PATCH 는 행 객체를 새로 만들므로 수정 뒤에는 다시 찾아 읽는다.
const rentRow = (fx) => fx.db.accountbook_recurring.find((row) => row.id === "recurring-rent");
const addViewer = (fx) => {
  fx.db.users.push({ id: "user-view", kakao_user_key: "kakao_login:2267", nickname: "뷰어", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: HOME, user_id: "user-view", role: "viewer", created_at: "2026-07-02T00:00:00.000Z" });
};
const expenseRow = (id, date, amount, extra = {}) => ({ id, household_id: HOME, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: id, payment_method: "현금", source: "web", raw_text: id, created_at: `${date}T09:00:00.000Z`, ...extra });

// ── SIM-3 정기 항목 이름 변경 ───────────────────────────────
await fixture(async (fx) => {
  putSetting(fx, `reserve_plans:${HOME}`, JSON.stringify([
    { id: "reserve-1", name: "자동차보험", amount: 1200000, due_months: [8], recurrence: "annual" },
    { id: "reserve-2", name: "재산세", amount: 300000, due_months: [7, 9], recurrence: "semiannual", due_day: 16 },
  ]));
  const renamed = await post(fx, "/admin/reserve-plan/update", { household_id: HOME, month: "2026-07", id: "reserve-1", name: "재산세", amount: "1200000", type: "expense", recurrence: "annual", due_month_1: "8", due_day: "1" });
  ok(renamed.decoded.includes("err=reserve_name_duplicate"), "SIM-3 다른 항목의 이름으로 바꾸면 거절한다");
  eq(reservePlans(fx).map((p) => `${p.id}:${p.name}`).join(","), "reserve-1:자동차보험,reserve-2:재산세", "SIM-3 거절된 이름 변경은 두 항목을 모두 그대로 둔다(예전에는 재산세가 지워졌다)");
  const readded = await post(fx, "/admin/reserve-plan/create", { household_id: HOME, month: "2026-07", name: "재산세", amount: "500000", type: "expense", recurrence: "annual", due_month_1: "9", due_day: "16" });
  ok(readded.decoded.includes("err=reserve_name_duplicate"), "SIM-3 이미 있는 이름으로 추가하면 거절한다(조용히 바꿔 끼우지 않는다)");
  eq(reservePlans(fx).map((p) => `${p.id}:${p.amount}`).join(","), "reserve-1:1200000,reserve-2:300000", "SIM-3 거절된 추가는 기존 항목의 id·금액을 바꾸지 않는다");
  const ok1 = await post(fx, "/admin/reserve-plan/update", { household_id: HOME, month: "2026-07", id: "reserve-1", name: "자동차 보험료", amount: "1300000", type: "expense", recurrence: "annual", due_month_1: "8", due_day: "1" });
  ok(ok1.decoded.includes("msg=reserve_updated") && reservePlans(fx).length === 2 && reservePlans(fx).find((p) => p.id === "reserve-1")?.name === "자동차 보험료", "SIM-3 겹치지 않는 이름으로는 수정되고 다른 항목은 남는다");
  const shown = await page(fx, "/reserve-plans?month=2026-07&household_id=house-home&err=reserve_name_duplicate");
  ok(shown.html.includes("같은 이름의 정기 항목이 이미 있어"), "SIM-3 거절 사유가 화면에 그대로 보인다");
});

// ── N10 적립 계획 월·일·반복주기 검증 ──────────────────────
await fixture(async (fx) => {
  const before = settingValue(fx, `reserve_plans:${HOME}`);
  const create = (extra) => post(fx, "/admin/reserve-plan/create", { household_id: HOME, month: "2026-07", name: "검증항목", amount: "100000", type: "expense", recurrence: "annual", due_month_1: "9", due_day: "16", category: "세금/수수료", ...extra });
  const badDay = await create({ due_day: "35" });
  ok(badDay.decoded.includes("err=reserve_due_day_invalid") && settingValue(fx, `reserve_plans:${HOME}`) === before, "N10 납부일 35 는 28 로 깎지 않고 거절한다");
  const textDay = await create({ due_day: "abc" });
  ok(textDay.decoded.includes("err=reserve_due_day_invalid") && settingValue(fx, `reserve_plans:${HOME}`) === before, "N10 글자 납부일은 NaN 으로 저장하지 않고 거절한다");
  const badMonth = await create({ due_month_1: "13" });
  ok(badMonth.decoded.includes("err=reserve_due_month_invalid") && settingValue(fx, `reserve_plans:${HOME}`) === before, "N10 13월은 12월로 깎지 않고 거절한다");
  const badRecurrence = await create({ recurrence: "weekly" });
  ok(badRecurrence.decoded.includes("err=reserve_recurrence_invalid") && settingValue(fx, `reserve_plans:${HOME}`) === before, "N10 모르는 반복주기는 연 1회로 바꾸지 않고 거절한다");
  const good = await create({});
  ok(good.decoded.includes("msg=reserve_saved"), "N10 올바른 값은 저장된다");
  const saved = reservePlans(fx).find((p) => p.name === "검증항목");
  ok(saved && saved.due_day === 16 && saved.due_months.join() === "9" && !/"due_day":(?:null|NaN)/.test(settingValue(fx, `reserve_plans:${HOME}`)), "N10 저장값에 NaN·null 납부일이 없다");
  const update = await post(fx, "/admin/reserve-plan/update", { household_id: HOME, month: "2026-07", id: saved.id, name: "검증항목", amount: "100000", type: "expense", recurrence: "annual", due_month_1: "9", due_day: "0" });
  ok(update.decoded.includes("err=reserve_due_day_invalid") && reservePlans(fx).find((p) => p.id === saved.id)?.due_day === 16, "N10 수정에서도 납부일 0 은 거절하고 기존 값을 둔다");
  const shown = await page(fx, "/reserve-plans?month=2026-07&household_id=house-home&err=reserve_due_day_invalid");
  ok(shown.html.includes("1~28"), "N10 거절 사유가 화면에 보인다");
});

// ── SIM-2 예산 중복 분류 ────────────────────────────────────
await fixture(async (fx) => {
  const path = "/my/settings?month=2026-07&household_id=house-home";
  const { fields } = formFields((await page(fx, path)).html, "/my/budget-bulk/save");
  const build = (expense) => {
    const next = new URLSearchParams();
    for (const key of ["household_id", "month", "plan_fingerprint"]) next.set(key, fields.get(key) || "");
    fields.getAll("income_name").forEach((name, index) => { next.append("income_name", name); next.append("income_amount", fields.getAll("income_amount")[index] || ""); });
    for (const [name, amount] of expense) { next.append("budget_category", name); next.append("budget_amount", amount); }
    return next;
  };
  const before = budgetRows(fx, "2026-07");
  const conflict = await post(fx, "/my/budget-bulk/save", build([["식비", "100000"], ["교통", "250000"], ["식비", "200000"]]));
  ok(conflict.decoded.includes("err=budget_duplicate_category") && budgetRows(fx, "2026-07") === before, "SIM-2 같은 분류가 다른 금액으로 두 줄이면 저장하지 않는다(예전에는 뒤 줄이 앞 줄을 덮었다)");
  const shown = await page(fx, `${path}&err=budget_duplicate_category`);
  ok(shown.html.includes("같은 분류가 두 줄"), "SIM-2 거절 사유가 설정 화면에 보인다");
  const fresh = formFields((await page(fx, path)).html, "/my/budget-bulk/save").fields;
  fields.set("plan_fingerprint", fresh.get("plan_fingerprint") || "");
  const same = await post(fx, "/my/budget-bulk/save", build([["식비", "100000"], ["교통", "250000"], ["식비", "100000"]]));
  const after = budgetRows(fx, "2026-07");
  ok(same.decoded.includes("msg=budget_saved") && after.includes("식비=100000") && (after.match(/식비=/g) || []).length === 1, "SIM-2 같은 금액의 중복 줄은 하나로 저장한다");
});

// ── SIM-4 추천 반복 거래의 지출자·분류 ──────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    for (const [month, category] of [["2026-05", "구독"], ["2026-06", "구독"], ["2026-07", ""]]) {
      fx.db.transactions.push({ id: `tx-nf-${month}`, household_id: HOME, user_id: "user-wifi", transaction_date: `${month}-03`, type: "expense", amount: 13500, category, memo: "넷플릭스", payment_method: "현대카드", source: "kakao", raw_text: "넷플릭스 13500", created_at: `${month}-03T09:00:00.000Z` });
      fx.db.transactions.push({ id: `tx-yt-${month}`, household_id: HOME, user_id: "user-left", transaction_date: `${month}-09`, type: "expense", amount: 10900, category: "구독", memo: "유튜브", payment_method: "현대카드", source: "kakao", raw_text: "유튜브 10900", created_at: `${month}-09T09:00:00.000Z` });
    }
    const tools = await page(fx, "/smart-tools?month=2026-07&household_id=house-home");
    ok(/name="memo" value="넷플릭스"[^>]*\/><input type="hidden" name="amount" value="13500"\/><input type="hidden" name="category" value="구독"\/>/.test(tools.html), "SIM-4 후보 카드는 첫 기록이 아니라 가장 많이 쓴 분류(구독)를 싣는다");
    const confirmed = await post(fx, "/my/recurring/from-candidate", { household_id: HOME, month: "2026-07", confirmed: "yes", memo: "넷플릭스", amount: "13500", category: "정기지출", payment_method: "현대카드", day_of_month: "3" });
    const rule = fx.db.accountbook_recurring.find((row) => row.memo === "넷플릭스");
    ok(/recurring_registered/.test(confirmed.decoded) && rule, "SIM-4 후보를 확정하면 규칙이 생긴다");
    eq(rule?.user_id, "user-wifi", "SIM-4 규칙의 지출자는 확정한 사람이 아니라 원래 기록의 지출자다");
    eq(rule?.category, "구독", "SIM-4 폼이 기본 분류를 보내도 기록의 분류를 잃지 않는다");
    const left = await post(fx, "/my/recurring/from-candidate", { household_id: HOME, month: "2026-07", confirmed: "yes", memo: "유튜브", amount: "10900", category: "구독", payment_method: "현대카드", day_of_month: "9" });
    const leftRule = fx.db.accountbook_recurring.find((row) => row.memo === "유튜브");
    ok(/recurring_registered/.test(left.decoded) && leftRule?.user_id === "user-bin", "SIM-4 원래 지출자가 더는 참여자가 아니면 확정한 사람을 지출자로 둔다");
  });
});
{
  const rows = [
    { transaction_date: "2026-07-03", type: "expense", amount: 13500, memo: "넷플릭스", category: "", user_id: "a" },
    { transaction_date: "2026-06-03", type: "expense", amount: 13500, memo: "넷플릭스", category: "구독", user_id: "a" },
    { transaction_date: "2026-05-03", type: "expense", amount: 13500, memo: "넷플릭스", category: "구독", user_id: "a" },
  ];
  eq(detectRecurringCandidates(rows, "2026-07", [])[0]?.category, "구독", "SIM-4 후보 분류는 가장 많이 쓴 비어 있지 않은 분류다");
}

// ── SIM-5 구성원 지출자 선택 ────────────────────────────────
await fixture(async (fx) => {
  addViewer(fx);
  const html = (await page(fx, "/reserve-plans?month=2026-07&household_id=house-home")).html;
  const fixed = html.slice(html.indexOf('id="fixed"'));
  ok(fixed.includes('value="user-bin"') && fixed.includes('value="user-wifi"'), "SIM-5 소유자·구성원은 지출자로 제안한다");
  ok(!fixed.includes('value="user-view"'), "SIM-5 조회 전용 참여자는 지출자 선택지에 넣지 않는다");
  const before = fx.db.accountbook_recurring.length;
  const viewer = await post(fx, "/admin/recurring/save", { household_id: HOME, month: "2026-07", type: "expense", memo: "뷰어구독", amount: "9900", category: "구독", day_of_month: "1", user_id: "user-view" });
  ok(viewer.decoded.includes("err=recurring_spender_ineligible") && fx.db.accountbook_recurring.length === before, "SIM-5 조회 전용 참여자를 지출자로 보내면 서버가 거절한다");
  const beforeStranger = fx.db.accountbook_recurring.length;
  const stranger = await post(fx, "/admin/recurring/save", { household_id: HOME, month: "2026-07", type: "expense", memo: "남의구독", amount: "9900", category: "구독", day_of_month: "1", user_id: "user-elsewhere" });
  ok(stranger.decoded.includes("err=") && fx.db.accountbook_recurring.length === beforeStranger, "SIM-5 이 가계부 참여자가 아닌 사용자도 거절한다");
  const shown = await page(fx, "/reserve-plans?month=2026-07&household_id=house-home&err=recurring_spender_ineligible");
  ok(shown.html.includes("소유자·관리자·구성원"), "SIM-5 거절 사유가 화면에 보인다");
});

// PR #68: 거래가 저장된 뒤 적용월 저장이나 다음 규칙이 실패해도 미변경으로 안내하지 않는다.
for (const scenario of ["mixed-marker", "rpc-marker", "later-rule"]) {
  await withClock("2026-07-15", () => fixture(async (fx) => {
    const month = scenario === "rpc-marker" ? "2026-06" : "2026-07";
    if (scenario === "rpc-marker") rentRow(fx).last_applied_month = "2026-07";
    else fx.db.accountbook_recurring.push({ ...rentRow(fx), id: "recurring-left", user_id: "user-left" });
    if (scenario === "later-rule") fx.db.accountbook_recurring.push({ ...rentRow(fx), id: "recurring-second", memo: "두 번째 규칙" });
    const before = fx.db.transactions.length;
    const restore = intercept(({ url, method, init }) => {
      if (scenario !== "later-rule" && url.pathname === "/rest/v1/accountbook_recurring" && method === "PATCH") return failure(400, "marker rejected");
      if (scenario === "later-rule" && url.pathname === "/rest/v1/transactions" && method === "POST" && String(init.body).includes("recurring-second")) return failure(400, "second rule rejected");
      return null;
    });
    let result;
    try { result = await post(fx, "/admin/recurring/apply", { household_id: HOME, month }); }
    finally { restore(); }
    eq(fx.db.transactions.length - before, 1, `${scenario}: 실패 전에 거래 한 건이 저장됐다`);
    eq(locParam(result, "err"), "recurring_apply_incomplete", `${scenario}: 부분 반영을 알리고 미변경으로 안내하지 않는다`);
    const shown = await page(fx, `/reserve-plans?household_id=${HOME}&month=${month}&err=recurring_apply_incomplete`);
    ok(shown.html.includes("일부 기록이 이미 반영되었으므로"), `${scenario}: 부분 반영 안내가 실제 화면에 보인다`);
    await post(fx, "/admin/recurring/apply", { household_id: HOME, month });
    eq(fx.db.transactions.filter((row) => row.raw_text === `recurring:recurring-rent:${month}`).length, 1, `${scenario}: 확인 후 다시 반영해도 저장된 거래를 중복 생성하지 않는다`);
  }));
}
await fixture(async (fx) => {
  const before = fx.db.transactions.length;
  const restore = intercept(({ url, method }) => url.pathname === "/rest/v1/accountbook_recurring" && method === "GET" ? failure(400, "read rejected") : null);
  let result;
  try { result = await post(fx, "/admin/recurring/apply", { household_id: HOME, month: "2026-07" }); }
  finally { restore(); }
  eq(fx.db.transactions.length, before, "쓰기 전 조회 실패는 거래를 바꾸지 않는다");
  ok(locParam(result, "err").includes("기존 기록은 변경하지 않았습니다"), "쓰기 전 실패만 미변경으로 안내한다");
});

// ── SIM-8 지난 달 반영 / T7 문제 규칙만 건너뛰기 ─────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    rentRow(fx).last_applied_month = "2026-07";
    fx.db.transactions.push({ id: "tx-rent-07", household_id: HOME, user_id: "user-bin", transaction_date: "2026-07-05", type: "expense", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", source: "recurring_auto", raw_text: "recurring:recurring-rent:2026-07", created_at: "2026-07-05T00:00:00.000Z" });
    const june = await post(fx, "/admin/recurring/apply", { household_id: HOME, month: "2026-06" });
    ok(loc(june).includes("고정항목 1건 기록"), "SIM-8 지난 달 반영은 그 달 기록을 만든다");
    ok(fx.db.transactions.some((row) => row.raw_text === "recurring:recurring-rent:2026-06" && row.transaction_date === "2026-06-05"), "SIM-8 기록 날짜는 요청한 달(6월 5일)이다");
    eq(rentRow(fx).last_applied_month, "2026-07", "SIM-8 지난 달 반영이 이번 달 반영 표식을 6월로 되돌리지 않는다");
    const shown = await page(fx, "/reserve-plans?month=2026-07&household_id=house-home");
    ok(shown.html.includes("이번 달 반영 완료"), "SIM-8 이번 달 화면은 여전히 반영 완료라고 말한다");
  });
  await fixture(async (fx) => {
    addViewer(fx);
    fx.db.accountbook_recurring.push(
      { id: "recurring-left", household_id: HOME, type: "expense", amount: 13500, category: "구독", memo: "넷플릭스", payment_method: "현대카드", day_of_month: 3, user_id: "user-left", is_active: true, last_applied_month: "2026-06", created_at: "2026-06-01T00:00:00.000Z" },
      { id: "recurring-viewer", household_id: HOME, type: "expense", amount: 9900, category: "구독", memo: "뷰어구독", payment_method: "현대카드", day_of_month: 2, user_id: "user-view", is_active: true, last_applied_month: "2026-06", created_at: "2026-06-01T00:00:00.000Z" },
    );
    const shown = await page(fx, "/reserve-plans?month=2026-07&household_id=house-home");
    ok(shown.html.includes("지출자 확인 필요"), "T7 지출자가 활성 참여자가 아닌 규칙은 화면에서 미리 알린다");
    const applied = await post(fx, "/admin/recurring/apply", { household_id: HOME, month: "2026-07" });
    ok(loc(applied).includes("고정항목 1건 기록"), "T7 수동 반영이 나간 지출자 하나 때문에 멈추지 않고 가능한 규칙을 넣는다(예전에는 전체가 실패)");
    ok(/2건[^&]*건너/.test(loc(applied)), "T7 건너뛴 규칙 수를 알린다");
    ok(fx.db.transactions.some((row) => row.raw_text === "recurring:recurring-rent:2026-07"), "T7 자격이 있는 월세는 기록된다");
    ok(!fx.db.transactions.some((row) => row.memo === "넷플릭스" || row.memo === "뷰어구독"), "T7 나간 지출자·조회 전용 지출자의 규칙은 수동 반영에서도 건너뛴다(자동 반영과 같은 자격 규칙)");
    eq(fx.db.accountbook_recurring.find((row) => row.id === "recurring-rent").last_applied_month, "2026-07", "T7 반영한 규칙만 표식을 갱신한다");
    eq(fx.db.accountbook_recurring.find((row) => row.id === "recurring-left").last_applied_month, "2026-06", "T7 건너뛴 규칙의 표식은 그대로다");
    const feedback = await page(fx, `/reserve-plans?month=2026-07&household_id=house-home&msg=${encodeURIComponent(locParam(applied, "msg"))}`);
    ok(feedback.html.includes("고정항목 1건 기록") && feedback.html.includes("건너"), "T7 반영 결과 문구가 화면에 그대로 보인다(일반 안내로 바뀌지 않는다)");
    const cron = await runRecurringAutoApply(fx.env, { today: "2026-07-31", month: "2026-07", lock: false });
    ok(cron.ok && !fx.db.transactions.some((row) => row.memo === "뷰어구독"), "T7 자동 반영도 조회 전용 지출자의 규칙을 건너뛴다");
    eq(fx.db.transactions.filter((row) => row.raw_text === "recurring:recurring-rent:2026-07").length, 1, "T7 수동 반영 뒤 자동 반영은 같은 달을 다시 넣지 않는다");
  });
  await fixture(async (fx) => {
    // 자격 문제가 없으면 예전처럼 원자 RPC 한 번으로 반영한다.
    const applied = await post(fx, "/admin/recurring/apply", { household_id: HOME, month: "2026-07" });
    ok(loc(applied).includes("고정항목 1건 기록") && fx.db.__rpc_calls.filter((call) => call.name === "accountbook_apply_recurring_v227").length === 1, "T7 문제 규칙이 없으면 SQL 반영 RPC 한 번으로 끝난다");
  });
});

// ── T8 반복 거래 수정이 지출자를 바꾸지 않는다 ───────────────
await fixture(async (fx) => {
  rentRow(fx).user_id = "user-wifi";
  const edited = await post(fx, "/my/recurring/save", { id: "recurring-rent", household_id: HOME, month: "2026-07", type: "expense", memo: "월세", amount: "660000", category: "주거/관리", payment_method: "계좌이체", day_of_month: "5" });
  ok(edited.decoded.includes("msg=recurring_saved") && Number(rentRow(fx).amount) === 660000, "T8 수정은 저장된다");
  eq(rentRow(fx).user_id, "user-wifi", "T8 지출자를 보내지 않은 수정은 기존 지출자를 유지한다(예전에는 고친 사람으로 바뀌었다)");
  eq(rentRow(fx).last_applied_month, "2026-06", "T8 반영 표식도 그대로다");
  const created = await post(fx, "/my/recurring/save", { household_id: HOME, month: "2026-07", type: "expense", memo: "새구독", amount: "7900", category: "구독", day_of_month: "1" });
  ok(created.decoded.includes("msg=recurring_saved") && fx.db.accountbook_recurring.find((row) => row.memo === "새구독")?.user_id === "user-bin", "T8 새 규칙은 만든 사람을 지출자로 둔다");
  addViewer(fx);
  const viewer = await post(fx, "/my/recurring/save", { id: "recurring-rent", household_id: HOME, month: "2026-07", type: "expense", memo: "월세", amount: "660000", category: "주거/관리", payment_method: "계좌이체", day_of_month: "5", user_id: "user-view" });
  ok(viewer.decoded.includes("err=recurring_spender_ineligible") && rentRow(fx).user_id === "user-wifi", "T8 명시적으로 보낸 지출자도 자격이 없으면 거절한다");
  const shown = await page(fx, "/my/settings?month=2026-07&household_id=house-home&err=recurring_spender_ineligible");
  ok(shown.html.includes("소유자·관리자·구성원"), "T8 거절 사유가 설정 화면에 보인다");
});

// ── D7 카카오 예산 현황 ─────────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HOME);
    fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((row) => !(row.month === "2026-07" && !String(row.category).startsWith("__income")));
    const incomeOnly = await skill(fx, "남은 예산");
    ok(/예산 현황/.test(incomeOnly) && /아직 지출 예산이 설정되지 않았어요/.test(incomeOnly), "D7 수입 예산만 있으면 지출 예산 없음으로 안내한다");
    ok(!/초과/.test(incomeOnly) && !/남은 예산: 0원/.test(incomeOnly), "D7 수입 예산만 있을 때 \"남은 예산 0원(초과)\"라고 하지 않는다");
    ok(/예상 수입만/.test(incomeOnly), "D7 예상 수입만 저장된 상태임을 말한다");
    fx.db.accountbook_budgets.push(
      { id: "d7-food", household_id: HOME, month: "2026-07", category: "식비", amount: 800000, created_at: "2026-07-01T00:00:00.000Z" },
      { id: "d7-total", household_id: HOME, month: "2026-07", category: "__total", amount: 500000, created_at: "2026-07-01T00:00:00.000Z" },
    );
    const withCategory = await skill(fx, "예산 현황");
    ok(/전체 예산: 800,000원/.test(withCategory), "D7 분류별 예산이 있으면 전체 예산은 분류 합계다");
    ok(/직접 설정한 전체 예산 500,000원[^\n]*쓰지 않아요/.test(withCategory), "D7 직접 설정한 전체 예산이 계산에 쓰이지 않음을 설명한다");
  });
});

// ── D9 저장 뒤 예산 안내는 기록한 달 기준 ───────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    fx.db.accountbook_budgets.push({ id: "d9-june-food", household_id: HOME, month: "2026-06", category: "식비", amount: 100000, created_at: "2026-06-01T00:00:00.000Z" });
    const saved = await post(fx, "/admin/transactions", { household_id: HOME, month: "2026-07", type: "expense", transaction_date: "2026-06-20", amount: "150000", category: "식비", memo: "지난달 장보기", payment_method: "현금", return_to: "/app?month=2026-07&household_id=house-home" });
    ok(saved.status === 303 && /msg=added/.test(saved.decoded), "D9 다른 달 날짜의 기록이 저장된다");
    ok(/balert=[^&]*식비 예산 초과/.test(loc(saved)), "D9 예산 안내는 보고 있던 7월이 아니라 기록한 6월 예산(10만원) 기준이다");
  });
});

// ── D10 안내는 있는 카카오 명령만 말한다 ────────────────────
ok(source.includes('["예산", "남은예산, 예산 현황, 예산 설정, 정기지출", "예산 블록 → Skill", skill]'), "D10 오픈빌더 발화표의 예산 줄은 실제 명령만 적는다");
ok(source.includes('"남은예산 / 예산 현황 / 예산 설정 / 정기지출",'), "D10 복사용 발화 목록도 실제 명령만 적는다");
ok(!/오늘예산|이번달예상/.test(source.slice(source.indexOf("function openBuilderFinalRows("), source.indexOf("function openBuilderFinalRows(") + 4000)), "D10 발화표에 없는 명령(오늘예산·이번달예상)이 남아 있지 않다");
ok(!/오늘예산, 이번달예상/.test(source), "D10 예산 알림 화면의 카카오 안내도 없는 명령을 말하지 않는다");
await fixture(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HOME);
  for (const utterance of ["남은예산", "예산 현황", "정기지출"]) {
    const reply = await skill(fx, utterance);
    ok(!/이해하지 못했어요/.test(reply) && reply.length > 10, `D10 안내가 말하는 명령 "${utterance}" 이 실제로 통한다`);
  }
});

// ── D11 초과 판정은 금액 기준 ───────────────────────────────
await fixture(async (fx) => {
  fx.db.transactions.push(expenseRow("tx-d11", "2026-07-11", 648800));
  const html = (await page(fx, "/budgets?month=2026-07&household_id=house-home")).html;
  const card = html.match(/<article class="usageCard([^"]*)"><div><b>식비<\/b><span>([^<]*)<\/span>/);
  ok(card && card[2] === "주의" && !card[1].includes("isOver"), `D11 99.6% 는 반올림 100% 라도 초과가 아니다 (${card?.[2]} / ${card?.[1]})`);
  fx.db.transactions.push(expenseRow("tx-d11b", "2026-07-12", 3300));
  const over = (await page(fx, "/budgets?month=2026-07&household_id=house-home")).html.match(/<article class="usageCard([^"]*)"><div><b>식비<\/b><span>([^<]*)<\/span>/);
  ok(over && over[2] === "초과" && over[1].includes("isOver"), "D11 실제로 넘으면 문구와 색이 함께 초과다");
});

// ── D12 홈 지난달 비교는 같은 기간 ──────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    fx.db.transactions.push(expenseRow("tx-jun-a", "2026-06-05", 10000), expenseRow("tx-jun-b", "2026-06-25", 500000));
    const home = await page(fx, "/app?month=2026-07&household_id=house-home");
    ok(/지난달 1~15일보다 238,600원 더 썼어요/.test(home.html), "D12 이번 달은 지난달 1~15일(같은 기간)과 견주고 그 기준을 문장에 적는다(예전에는 6월 전체 51만원과 견줘 덜 썼다고 했다)");
    ok(!/지난달보다 261,400원 덜 썼어요/.test(home.html), "D12 지난달 전체와 견준 옛 문장이 남지 않는다");
    const past = await page(fx, "/app?month=2026-06&household_id=house-home");
    ok(/지난달보다 510,000원 더 썼어요/.test(past.html) && !/지난달 1~\d+일보다/.test(past.html), "D12 지난 달 화면은 월 전체끼리 견주고 같은 기간 표시를 붙이지 않는다");
  });
});

// ── D14 월별 추이 조회 실패는 확인 불가 ─────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const restore = intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/transactions") && url.searchParams.getAll("transaction_date").includes("gte.2026-05-01") ? failure(503, "simulated trend failure") : null));
    const home = await page(fx, "/app?month=2026-07&household_id=house-home&trend=monthly");
    restore();
    ok(home.status === 200 && /<b>확인 불가<\/b><span>05월<\/span>/.test(home.html), "D14 조회에 실패한 달은 0원이 아니라 확인 불가로 그린다");
    ok(/<b>[^<]+<\/b><span>07월<\/span>/.test(home.html) && !/<b>0<\/b><span>05월<\/span>/.test(home.html), "D14 다른 달은 그대로 그리고 실패한 달에 0 을 쓰지 않는다");
  });
});
{
  const chart = renderMonthlySeriesChart([{ month: "2026-05", income: 0, expense: 0, failed: true }, { month: "2026-06", income: 100, expense: 50000 }]);
  ok(chart.includes("확인 불가") && chart.includes("조회 실패") && !chart.includes("<b>0</b>"), "D14 추이 차트는 실패한 달을 확인 불가로 표시하고 제목에 조회 실패를 적는다");
}

// ── D14 날짜 묶음 합계는 전체 기록 기준 ─────────────────────
{
  const rows = [];
  for (let i = 0; i < 90; i += 1) rows.push({ id: `g-${i}`, household_id: HOME, user_id: "user-bin", transaction_date: i < 70 ? "2026-07-10" : "2026-07-09", type: "expense", amount: 1000, category: "식비", memo: `g${i}` });
  const html = renderV8TxDayGroups(rows, "/app", null, [], false);
  const heads = [...html.matchAll(/<h3 class="txDayHead"><span>([^<]*)<\/span><b>([^<]*)<\/b><\/h3>/g)].map((m) => `${m[1]}|${m[2]}`);
  eq(heads.length, 2, "D14 날짜 묶음은 두 날이다");
  ok(heads[1].includes("-20,000원") && heads[1].includes("20건 중 10건 표시"), `D14 잘린 날의 합계는 그날 전체 기록으로 내고 잘림을 표시한다 (${heads[1]})`);
  ok(heads[0] === "7월 10일 (금)|-70,000원", `D14 잘리지 않은 날은 예전 그대로다 (${heads[0]})`);
}

// ── SIM-9 옛 수입 예산 ─────────────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_budgets.push(
    { id: "s9-legacy", household_id: HOME, month: "2026-08", category: "__income", amount: 3500000, created_at: "2026-08-01T00:00:00.000Z" },
    { id: "s9-typed", household_id: HOME, month: "2026-08", category: "__income:급여", amount: 3200000, created_at: "2026-08-01T00:00:00.000Z" },
    { id: "s9-only-legacy", household_id: HOME, month: "2026-09", category: "__income", amount: 3500000, created_at: "2026-09-01T00:00:00.000Z" },
  );
  const metric = (html) => (html.match(/예상 수입 · 종류별 합계<\/span><b>([^<]*)<\/b>/) || [])[1];
  const both = (await page(fx, "/budgets?month=2026-08&household_id=house-home")).html;
  eq(metric(both), "3,200,000원", "SIM-9 종류별 예상 수입이 있으면 옛 __income 합계 행은 더하지 않는다(예전에는 6,700,000원)");
  ok(both.includes("이전 버전의 월 수입 기준 3,500,000원이 남아 있습니다"), "SIM-9 쓰지 않은 옛 값이 남아 있음을 화면이 알린다");
  const legacyOnly = (await page(fx, "/budgets?month=2026-09&household_id=house-home")).html;
  eq(metric(legacyOnly), "3,500,000원", "SIM-9 종류별 예상 수입이 없을 때만 옛 값을 호환용으로 쓴다");
  ok(!legacyOnly.includes("이전 버전의 월 수입 기준"), "SIM-9 옛 값을 실제로 쓰는 달에는 남아 있다는 경고를 띄우지 않는다");
  const summary = budgetCenterSummary([], [{ category: "__income", amount: 3500000 }, { category: "__income:급여", amount: 3200000 }]);
  ok(summary.incomeBudget === 3200000 && summary.legacyIncomeBudget === 3500000, "SIM-9 요약 함수가 쓰지 않은 옛 값을 따로 돌려준다");
});

// ── SIM-16 연간 월 평균 ────────────────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    fx.db.transactions.push(expenseRow("tx-2025-a", "2025-03-10", 100000), expenseRow("tx-2025-b", "2025-09-10", 300000));
    const avg = (html) => html.match(/<span>월 평균 지출([^<]*)<\/span><b>([^<]*)<\/b>/) || [];
    const current = avg((await page(fx, "/annual?year=2026&household_id=house-home")).html);
    eq(current[2], "248,600원", "SIM-16 이번 해 월 평균은 12 가 아니라 기록 있는 달(7월 하나)로 나눈다");
    ok(/기록 있는 1개월/.test(current[1] || ""), `SIM-16 몇 개월 평균인지 적는다 (${current[1]})`);
    const past = avg((await page(fx, "/annual?year=2025&household_id=house-home")).html);
    eq(past[2], "200,000원", "SIM-16 지난 해는 기록 있는 2개월(3월·9월)로 나눈다");
    ok(/기록 있는 2개월/.test(past[1] || ""), "SIM-16 지난 해도 기준 달 수를 적는다");
  });
});

// ── SIM-18 최장 무지출 ─────────────────────────────────────
await withClock("2026-07-15", async () => {
  const rows = [
    { transaction_date: "2026-07-04", type: "expense", amount: 1 },
    { transaction_date: "2026-07-07", type: "expense", amount: 1 },
    { transaction_date: "2026-07-09", type: "expense", amount: 1 },
    { transaction_date: "2026-07-12", type: "income", amount: 1 },
  ];
  eq(longestNoSpendStreak(rows, "2026-07"), 6, "SIM-18 이번 달 최장 무지출은 오늘(15일)까지만 센다: 10~15일 = 6일(예전에는 31일까지 22일)");
  eq(longestNoSpendStreak(rows, "2026-08"), 0, "SIM-18 앞으로 올 달은 세지 않는다");
  eq(longestNoSpendStreak([{ transaction_date: "2026-06-10", type: "expense", amount: 1 }], "2026-06"), 20, "SIM-18 지난 달은 월 전체로 센다(11~30일 = 20일)");
  eq(longestNoSpendStreak(rows, "2026-07-xx"), 0, "SIM-18 깨진 달 문자열은 0 이다");
});

// ── N8 틀린 월 / N9 단건 예산 상한 ──────────────────────────
await withClock("2026-07-15", async () => {
  await fixture(async (fx) => {
    const before = budgetRows(fx, "2026-07");
    const badMonth = await post(fx, "/admin/budget/save", { household_id: HOME, month: "2026-13", category: "식비", amount: "300000", return_to: "/budgets?month=2026-07&household_id=house-home" });
    ok(badMonth.decoded.includes("err=budget_month_invalid") && budgetRows(fx, "2026-07") === before && !fx.db.accountbook_budgets.some((row) => row.month === "2026-13"), "N8 틀린 월의 예산 저장은 이번 달로 떨어지지 않고 거절한다");
    const noMonth = await post(fx, "/admin/budget/save", { household_id: HOME, month: "", category: "식비", amount: "300000", return_to: "/budgets?month=2026-07&household_id=house-home" });
    ok(noMonth.decoded.includes("err=budget_month_invalid") && budgetRows(fx, "2026-07") === before, "N8 월이 빠진 저장도 거절한다");
    const badDelete = await post(fx, "/admin/budget/delete", { household_id: HOME, month: "2026-1x", category: "식비", return_to: "/budgets?month=2026-07&household_id=house-home" });
    ok(badDelete.decoded.includes("err=budget_month_invalid") && budgetRows(fx, "2026-07") === before, "N8 틀린 월의 예산 삭제는 이번 달 예산을 지우지 않는다");
    const myBad = await post(fx, "/my/budget/save", { household_id: HOME, month: "2026-99", category: "식비", amount: "300000" });
    ok(myBad.decoded.includes("err=budget_month_invalid") && budgetRows(fx, "2026-07") === before, "N8 /my/budget/save 도 틀린 월을 거절한다");
    const huge = await post(fx, "/admin/budget/save", { household_id: HOME, month: "2026-07", category: "식비", amount: "99999999999", return_to: "/budgets?month=2026-07&household_id=house-home" });
    ok(huge.decoded.includes("err=amount_too_large") && budgetRows(fx, "2026-07") === before, "N9 상한(20억)을 넘는 단건 예산은 저장하지 않는다");
    const myHuge = await post(fx, "/my/budget/save", { household_id: HOME, month: "2026-07", category: "식비", amount: "2000000001" });
    ok(myHuge.decoded.includes("err=amount_too_large") && budgetRows(fx, "2026-07") === before, "N9 /my/budget/save 도 상한을 넘는 금액을 거절한다");
    const fine = await post(fx, "/admin/budget/save", { household_id: HOME, month: "2026-07", category: "식비", amount: "640000", return_to: "/budgets?month=2026-07&household_id=house-home" });
    ok(fine.decoded.includes("msg=budget_saved") && budgetRows(fx, "2026-07").includes("식비=640000"), "N8·N9 올바른 월과 금액은 예전처럼 저장된다");
    const shown = await page(fx, "/budgets?month=2026-07&household_id=house-home&err=budget_month_invalid");
    ok(shown.html.includes("월 형식이 올바르지 않아"), "N8 거절 사유가 예산 화면에 보인다");
  });
});

// ── 공통: 자격 규칙은 저장·자동·수동이 한 함수를 쓴다 ─────────
ok(source.includes("if (!recurringSpenderEligible(members, r.user_id)) { skipped++; continue; }"), "T7 자동 반영이 공용 자격 함수를 쓴다");
eq((source.match(/recurringSpenderEligible\(/g) || []).length >= 5, true, `T7 저장·화면·수동 반영도 같은 자격 함수를 쓴다 (${(source.match(/recurringSpenderEligible\(/g) || []).length}곳)`);

done();
