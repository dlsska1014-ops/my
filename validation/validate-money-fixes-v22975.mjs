// V22.9.75 돈 계산·정기 반영 감사 수정 검사. 메모리 픽스처(validation/qa-fixture.mjs)로 재현하며 네트워크를 쓰지 않는다.
//   P0-1 예약 자동 반영이 가계부 5개씩 도는 커서 때문에 월말 규칙을 잃던 문제(가계부 32개·28일 규칙, 10~11월 매일 실행).
//        월말 실행이 멈추거나 한도에 걸린 지난달 몫은 새 달 첫 실행이 따라잡되, 지난달이 끝난 뒤 만든 규칙과
//        지난달 지정일에 꺼 두었던 규칙은 지난달로 넣지 않는다(D-10). 겹친 실행·수동 반영·응답 유실에도 한 건만 들어간다.
//   P0-2 /admin/recurring/save 로 이번 달에 이미 적은 항목을 정기로 등록해도 다음 자동 반영이 한 번 더 넣지 않는다.
//   P1-1 지정일 전에 '반영'을 눌러도 이번 달 추가 가정값(after_pending_assumption)이 줄지 않는다.
//   P1-3 가져오기에서 음수 수입 행을 양수 수입으로 조용히 저장하지 않는다(음수 지출과 같은 규칙: 반대 구분 + 확인 필요).
//   P2-1 분류 예산 밖에만 반영 대기 정기지출이 있을 때 "대기 중인 정기지출이 없습니다"라고 단정하지 않는다.
//   D-26 예약 실행 주소의 잘못된 today·month 는 오늘로 바꿔 실행하지 않고 거절한다.
import app, { parseFlexibleImportRecords, runRecurringAutoApply } from "../src/index.js";
import { fixture, withClock, post, page, api, formFields, counter, intercept, BASE, ctx } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.75 돈 계산·정기 반영 수정 검사");
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const nextDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const strip = (html) => String(html).replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
// 픽스처의 PATCH 는 행을 새 객체로 바꾸므로 규칙은 언제나 저장소에서 다시 찾는다.
const ruleNow = (fx, id) => fx.db.accountbook_recurring.find((r) => r.id === id) || {};
const recurringTx = (fx, ruleId, month) => fx.db.transactions.filter((t) => t.source === "recurring_auto" && t.raw_text === `recurring:${ruleId}:${month}`);

// 예약 실행 한 번(정기 반영 + 자동 리포트 + NLU 정리)을 그날 09:10 KST 로 돌리고 저장소 호출 수를 센다.
async function runCron(fx, ymd, { failRecurringRead = false } = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  let calls = 0;
  const restore = intercept(({ url, method }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    calls += 1;
    if (failRecurringRead && method === "GET" && url.pathname.endsWith("/accountbook_recurring")) return new Response(JSON.stringify({ message: "synthetic outage" }), { status: 503, headers: { "content-type": "application/json" } });
    return null;
  });
  const pending = [];
  let error = null;
  try {
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd) }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  } finally { restore(); }
  return { calls, error };
}

function seedRule(fx, rule) {
  const row = { type: "expense", payment_method: "", user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00+09:00", ...rule };
  fx.db.accountbook_recurring.push(row);
  return row;
}

// ── P0-1: 가계부 32개 · 28일 정기 수입 · 10월 1일~11월 30일 매일 실행 ─────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const rules = [];
  for (let i = 1; i <= 32; i++) {
    const id = `mf-${String(i).padStart(2, "0")}`;
    fx.db.households.push({ id, name: id, created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner" });
    rules.push(seedRule(fx, { id: `mf-inc-${i}`, household_id: id, type: "income", amount: 300000, category: "부수입", memo: "수당", day_of_month: 28 }));
  }
  const firstSeen = new Map();
  let maxCalls = 0;
  for (let day = "2026-10-01"; day <= "2026-11-30"; day = nextDay(day)) {
    const run = await runCron(fx, day);
    maxCalls = Math.max(maxCalls, run.calls);
    for (const t of fx.db.transactions) if (t.source === "recurring_auto" && !firstSeen.has(t.raw_text)) firstSeen.set(t.raw_text, { ran: day, t });
  }
  for (const month of ["2026-10", "2026-11"]) {
    const missing = rules.filter((r) => !firstSeen.has(`recurring:${r.id}:${month}`));
    eq(missing.length, 0, `P0-1 ${month}: 가계부 32개의 28일 정기 수입이 하나도 빠지지 않는다 (빠짐 ${missing.length}건)`);
  }
  for (const month of ["2026-10", "2026-11"]) {
    const seen = rules.map((r) => firstSeen.get(`recurring:${r.id}:${month}`)).filter(Boolean);
    eq(seen.filter((s) => s.ran !== `${month}-28`).length, 0, `P0-1 ${month}: 모두 지정일(28일) 실행에 들어간다(지연 0일)`);
    eq(seen.filter((s) => s.t.transaction_date === `${month}-28` && s.t.type === "income" && Number(s.t.amount) === 300000).length, 32, `P0-1 ${month}: 28일 자 수입 300,000원으로 기록된다`);
  }
  eq(rules.filter((r) => ["2026-10", "2026-11"].some((m) => recurringTx(fx, r.id, m).length !== 1)).length, 0, "P0-1 규칙·달마다 정확히 한 건");
  eq(rules.filter((r) => ruleNow(fx, r.id).last_applied_month !== "2026-11").length, 0, "P0-1 반영 표식이 11월로 남는다");
  ok(maxCalls <= 50, `P0-1 예약 실행 한 번의 저장소 호출 ${maxCalls}회 ≤ 50`);
});

// ── P0-1 / D-10: 월말 실행이 멈춘 지난달 몫 따라잡기 ─────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedRule(fx, { id: "cu-30", household_id: "house-home", amount: 55000, category: "통신", memo: "휴대폰", day_of_month: 30 });
  seedRule(fx, { id: "cu-31", household_id: "house-home", amount: 12000, category: "구독", memo: "음악", day_of_month: 31 });
  seedRule(fx, { id: "cu-paused", household_id: "house-home", amount: 40000, category: "교육", memo: "학원", day_of_month: 25 });
  for (let day = "2026-10-01"; day <= "2026-10-31"; day = nextDay(day)) {
    if (day === "2026-10-20") ruleNow(fx, "cu-paused").is_active = false; // 10월 지정일(25일)에는 꺼져 있다
    const run = await runCron(fx, day, { failRecurringRead: day >= "2026-10-30" }); // 30·31일 실행은 저장소 장애로 실패
    if (day >= "2026-10-30") ok(run.error, `D-1 ${day} 장애 실행은 오류로 끝난다`);
  }
  eq(recurringTx(fx, "cu-30", "2026-10").length + recurringTx(fx, "cu-31", "2026-10").length, 0, "D-1 장애로 10월 30·31일 몫이 아직 없다");
  // 11월 1일 실행 전: 꺼 둔 규칙을 다시 켜고, 새 규칙을 만든다.
  ruleNow(fx, "cu-paused").is_active = true;
  seedRule(fx, { id: "cu-new", household_id: "house-home", amount: 30000, category: "식비", memo: "새 정기", day_of_month: 15, last_applied_month: null, created_at: "2026-11-01T08:00:00+09:00" });
  await runCron(fx, "2026-11-01");
  eq(recurringTx(fx, "cu-30", "2026-10")[0]?.transaction_date, "2026-10-30", "P0-1 11월 첫 실행이 10월 30일 몫을 10월 30일 자로 따라잡는다");
  eq(recurringTx(fx, "cu-31", "2026-10")[0]?.transaction_date, "2026-10-31", "P0-1 11월 첫 실행이 10월 31일 몫을 10월 31일 자로 따라잡는다");
  eq(recurringTx(fx, "cu-new", "2026-10").length, 0, "D-10 11월 1일에 만든 규칙은 10월 몫을 만들지 않는다");
  eq(recurringTx(fx, "cu-paused", "2026-10").length, 0, "D-10 10월 지정일에 꺼져 있던 규칙은 다시 켜도 10월 몫을 만들지 않는다");
  eq(ruleNow(fx, "cu-30").last_applied_month, "2026-10", "P0-1 따라잡은 규칙의 표식은 10월");
  for (let day = "2026-11-02"; day <= "2026-11-30"; day = nextDay(day)) await runCron(fx, day);
  eq(recurringTx(fx, "cu-new", "2026-11")[0]?.transaction_date, "2026-11-15", "D-10 새 규칙은 11월 15일부터 들어간다");
  eq(recurringTx(fx, "cu-paused", "2026-11")[0]?.transaction_date, "2026-11-25", "D-10 다시 켠 규칙은 11월 25일부터 들어간다");
  eq(recurringTx(fx, "cu-31", "2026-11")[0]?.transaction_date, "2026-11-30", "P0-1 31일 규칙은 11월 말일(30일)에 들어간다");
  eq(fx.db.transactions.filter((t) => t.source === "recurring_auto" && /^recurring:cu-/.test(t.raw_text)).length, 6, "P0-1 따라잡기 뒤 규칙·달마다 한 건(10월 2 + 11월 4)");
  eq(["cu-30", "cu-31", "cu-paused", "cu-new"].every((id) => ruleNow(fx, id).last_applied_month === "2026-11"), true, "P0-1 11월 표식");
});

// ── P0-1: 말일 몫이 한 실행 한도를 넘으면 다음 실행이 이어 넣는다(가계부 300개 · 31일) ─────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  for (let i = 1; i <= 300; i++) {
    const id = `cap-${String(i).padStart(3, "0")}`;
    fx.db.households.push({ id, name: id });
    fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner" });
    seedRule(fx, { id: `cap-rule-${i}`, household_id: id, amount: 10000 + i, category: "통신", memo: "통신비", day_of_month: 31 });
  }
  let maxCalls = 0;
  for (const day of ["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]) {
    const run = await runCron(fx, day);
    maxCalls = Math.max(maxCalls, run.calls);
    if (day === "2026-10-31") {
      const october = fx.db.transactions.filter((t) => /^recurring:cap-rule-\d+:2026-10$/.test(t.raw_text)).length;
      ok(october > 100 && october < 300, `P0-1 말일 한 실행이 한도 안에서 묶음으로 넣고(${october}건) 나머지를 남긴다`);
    }
  }
  const october = fx.db.transactions.filter((t) => /^recurring:cap-rule-\d+:2026-10$/.test(t.raw_text));
  eq(october.length, 300, "P0-1 남은 10월 31일 몫을 11월 실행이 모두 넣는다");
  eq(new Set(october.map((t) => t.raw_text)).size, 300, "P0-1 이어 넣어도 규칙마다 한 건");
  eq(october.filter((t) => t.transaction_date !== "2026-10-31").length, 0, "P0-1 이어 넣은 몫도 10월 31일 자");
  ok(maxCalls <= 50, `P0-1 한도에 걸린 실행도 저장소 호출 ${maxCalls}회 ≤ 50`);
});

// ── P0-1: 겹친 실행·수동 반영·응답 유실에도 한 건 ─────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const rules = [1, 2, 3, 4, 5].map((i) => seedRule(fx, { id: `ov-${i}`, household_id: "house-home", amount: 1000 * i, category: "통신", memo: `겹침 ${i}`, day_of_month: 5 }));
  await withClock("2026-10-10", async () => {
    // 잠금이 듣지 않는 상황(lock:false)에서 두 실행과 수동 반영을 함께 돌린다.
    const results = await Promise.all([
      runRecurringAutoApply(fx.env, { today: "2026-10-10", lock: false }),
      runRecurringAutoApply(fx.env, { today: "2026-10-10", lock: false }),
      post(fx, "/admin/recurring/apply", { household_id: "house-home", month: "2026-10", return_to: "/reserve-plans?month=2026-10&household_id=house-home" }),
    ]);
    ok(results[0].failed === 0 && results[1].failed === 0, "P0-1 겹친 실행이 실패로 끝나지 않는다");
  });
  eq(rules.filter((r) => recurringTx(fx, r.id, "2026-10").length !== 1).length, 0, "P0-1 겹친 자동 실행 두 번 + 수동 반영에도 규칙마다 한 건");
  // 저장은 됐지만 응답을 잃은 묶음 저장: 표식을 바꾸지 않고, 다음 실행이 기존 기록을 확인해 한 건으로 끝낸다.
  for (const r of rules) ruleNow(fx, r.id).last_applied_month = "2026-10";
  const late = rules.map((r, i) => seedRule(fx, { id: `lost-${i}`, household_id: "house-home", amount: 2000 + i, category: "통신", memo: `유실 ${i}`, day_of_month: 11 }));
  await withClock("2026-10-11", async () => {
    fx.db.__lose_next_transaction_response = 1;
    const lost = await runRecurringAutoApply(fx.env, { today: "2026-10-11", lock: false });
    ok(!lost.ok && lost.partial, "P0-1 응답을 잃은 저장은 완료로 보고하지 않는다");
    eq(late.filter((r) => ruleNow(fx, r.id).last_applied_month === "2026-10" && recurringTx(fx, r.id, "2026-10").length !== 1).length, 0, "P0-1 기록이 확인되지 않은 규칙의 표식은 바꾸지 않는다");
    const again = await runRecurringAutoApply(fx.env, { today: "2026-10-11", lock: false });
    ok(again.ok && again.deduplicated >= 1, "P0-1 다음 실행은 이미 들어간 기록을 확인해 중복으로 센다");
  });
  eq(late.filter((r) => recurringTx(fx, r.id, "2026-10").length !== 1).length, 0, "P0-1 응답 유실 뒤에도 규칙마다 한 건");
  eq(late.filter((r) => ruleNow(fx, r.id).last_applied_month !== "2026-10").length, 0, "P0-1 확인 뒤 표식을 쓴다");
});

// ── D-26: 예약 실행 주소의 잘못된 범위 ─────────────────────────────────────────
await fixture(async (fx) => {
  const env = { ...fx.env, CRON_SECRET: "money-cron" };
  const call = (query) => app.fetch(new Request(`${BASE}/cron/recurring/apply${query}`, { method: "POST", headers: { "x-cron-secret": "money-cron" } }), env, ctx);
  const before = fx.db.transactions.length;
  for (const query of ["?today=garbage", "?today=2026-13-45", "?month=2026-1", "?month=abc&today=2026-10-10"]) {
    const response = await call(query);
    eq(response.status, 400, `D-26 ${query} 는 거절한다`);
  }
  eq(fx.db.transactions.length, before, "D-26 거절한 호출은 아무것도 기록하지 않는다");
  ok([200, 207].includes((await call("?today=2026-10-10")).status), "D-26 올바른 today 는 그대로 실행한다");
});

// ── P0-2: 이번 달에 이미 적은 항목을 /admin/recurring/save 로 정기 등록 ──────────────
for (const path of ["/admin/recurring/save", "/my/recurring/save"]) {
  await withClock("2026-10-21", () => fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const base = { household_id: "house-home", user_id: "user-bin", payment_method: "" };
    fx.db.transactions.push(
      { ...base, id: "p2-salary", transaction_date: "2026-10-01", type: "income", amount: 3000000, category: "급여", memo: "10월 월급", source: "web", raw_text: "월급" },
      { ...base, id: "p2-rent", transaction_date: "2026-10-05", type: "expense", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", source: "kakao", raw_text: "월세 65만원" },
    );
    const form = await page(fx, path.startsWith("/my") ? "/my/settings?household_id=house-home&month=2026-10" : "/reserve-plans?household_id=house-home&month=2026-10");
    const fields = formFields(form.html, path).fields;
    const make = (values) => { const f = new URLSearchParams(fields); for (const [k, v] of Object.entries(values)) f.set(k, v); return f; };
    const salary = await post(fx, path, make({ household_id: "house-home", month: "2026-10", type: "income", amount: "3000000", category: "급여", memo: "10월 월급", payment_method: "", day_of_month: "1", user_id: "user-bin" }));
    const rent = await post(fx, path, make({ household_id: "house-home", month: "2026-10", type: "expense", amount: "650000", category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: "5", user_id: "user-bin" }));
    ok(/recurring_saved|정기|저장/.test(salary.decoded + rent.decoded) && salary.status === 303 && rent.status === 303, `P0-2 ${path} 저장`);
    eq(fx.db.accountbook_recurring.filter((r) => r.last_applied_month === "2026-10").length, 2, `P0-2 ${path} 이번 달에 이미 적은 두 항목은 이번 달 반영으로 둔다`);
    await runCron(fx, "2026-10-22");
    const october = fx.db.transactions.filter((t) => t.household_id === "house-home" && String(t.transaction_date).startsWith("2026-10"));
    const income = october.filter((t) => t.type === "income" && /월급/.test(t.memo)).reduce((sum, t) => sum + Number(t.amount), 0);
    const rentTotal = october.filter((t) => t.type !== "income" && t.memo === "월세").reduce((sum, t) => sum + Number(t.amount), 0);
    eq(income, 3000000, `P0-2 ${path} 다음 날 자동 반영 뒤에도 10월 월급은 한 번(3,000,000원)`);
    eq(rentTotal, 650000, `P0-2 ${path} 다음 날 자동 반영 뒤에도 10월 월세는 한 번(650,000원)`);
  }));
}

// ── P1-1: 지정일 전에 '반영'을 눌러도 추가 가정값이 그대로 ──────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  ruleNow(fx, "recurring-rent").day_of_month = 25;
  fx.db.accountbook_budgets.push(
    { id: "p11-food", household_id: "house-home", month: "2026-10", category: "식비", amount: 800000 },
    { id: "p11-house", household_id: "house-home", month: "2026-10", category: "주거/관리", amount: 700000 },
  );
  fx.db.transactions.push({ id: "p11-food-1", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-10-03", type: "expense", amount: 200000, category: "식비", memo: "장보기", payment_method: "", source: "web", raw_text: "장보기" });
  const observe = async () => (await api(fx, "/u/api/notifications?household_id=house-home&month=2026-10")).data?.budget_observation || {};
  const before = await observe();
  ok(Number(before.pending_total) >= 650000 && before.after_pending_assumption != null, "P1-1 반영 전에는 월세가 대기 금액에 있다");
  const applied = await post(fx, "/admin/recurring/apply", { household_id: "house-home", month: "2026-10", return_to: "/reserve-plans?month=2026-10&household_id=house-home" });
  eq(applied.status, 303, "P1-1 수동 반영");
  eq(recurringTx(fx, "recurring-rent", "2026-10")[0]?.transaction_date, "2026-10-25", "P1-1 지정일 전 반영은 10월 25일 자로 들어간다");
  const after = await observe();
  eq(Number(after.pending_total), 0, "P1-1 반영 뒤 대기 금액은 0");
  eq(after.after_pending_assumption, before.after_pending_assumption, `P1-1 반영 전후 추가 가정값이 같다(${before.after_pending_assumption} → ${after.after_pending_assumption})`);
  eq(after.forecast, before.forecast, "P1-1 오늘까지의 관측 속도 예상은 그대로");
  const alerts = strip((await page(fx, "/budget-alerts?household_id=house-home&month=2026-10")).html);
  ok(alerts.includes("날짜가 아직 오지 않은 반영된 정기지출 1건(650,000원)은 추가 가정값에 넣었습니다."), "P1-1 예산 알림 화면이 가정값에 남은 반영분을 말한다");
}));

// ── P1-3: 음수 수입 행 ───────────────────────────────────────────────────────
{
  const csv = ["날짜,구분,금액,분류,내용,결제수단", "2026-10-03,수입,-50000,급여,급여 정정,통장", "2026-10-05,수입,300000,부수입,수당,통장", "2026-10-06,지출,-12000,식비,마트 환불,카드"].join("\n");
  const parsed = parseFlexibleImportRecords(csv, "house-trip", "user-bin", { importYear: 2026 });
  const [reversal, plain, refund] = parsed.rows;
  eq(reversal?.type, "expense", "P1-3 음수 수입 행은 수입으로 저장하지 않는다(수입 취소·정정 = 지출)");
  eq(reversal?.amount, 50000, "P1-3 금액은 부호를 뗀 50,000원");
  eq(reversal?._import_needs_confirmation, true, "P1-3 음수 수입 행은 확인 필요");
  ok(safeWarnings(reversal).some((w) => w.includes("음수 수입 금액")), "P1-3 음수 수입 행에 이유를 적는다");
  eq(plain?.type, "income", "P1-3 양수 수입 행은 그대로 수입");
  eq(plain?._import_needs_confirmation, false, "P1-3 양수 수입 행은 확인 표시 없음");
  eq(refund?.type, "income", "P1-3 음수 지출 행은 예전처럼 환급(수입)");
  eq(refund?._import_needs_confirmation, true, "P1-3 음수 지출 행도 확인 필요");
  await withClock("2026-10-21", () => fixture(async (fx) => {
    const preview = await post(fx, "/my/import", { household_id: "house-trip", month: "2026-10", import_action: "preview", csv_text: csv });
    const box = (row) => (preview.text.match(new RegExp(`<input[^>]*name="selected_rows"[^>]*value="${row}"[^>]*>`)) || [""])[0];
    ok(box(2) && !/\bchecked\b/.test(box(2)) && /data-type="expense"/.test(box(2)), "P1-3 미리보기에서 음수 수입 행은 지출로 보이고 기본 선택하지 않는다");
    ok(/\bchecked\b/.test(box(3)) && /data-type="income"/.test(box(3)), "P1-3 양수 수입 행은 기본 선택");
  }));
}

function safeWarnings(row) { return Array.isArray(row?._import_warnings) ? row._import_warnings : []; }

// ── P2-1: 분류 예산 밖에만 반영 대기 정기지출이 있을 때 ───────────────────────────
await withClock("2026-10-10", () => fixture(async (fx) => {
  // 월세(주거/관리, 5일, 표식 6월)는 대기 중이고 예산은 식비·교통에만 있다.
  fx.db.accountbook_budgets.push(
    { id: "p21-food", household_id: "house-home", month: "2026-10", category: "식비", amount: 800000 },
    { id: "p21-traffic", household_id: "house-home", month: "2026-10", category: "교통", amount: 250000 },
  );
  for (const r of fx.db.accountbook_recurring) if (r.id !== "recurring-rent" && r.type !== "income") r.is_active = false;
  const text = strip((await page(fx, "/budget-alerts?household_id=house-home&month=2026-10")).html);
  ok(!text.includes("이번 달에 아직 반영 대기 중인 정기지출이 없습니다."), "P2-1 예산 밖 대기 항목이 있으면 '대기 중인 정기지출이 없습니다'라고 하지 않는다");
  ok(text.includes("예산을 정한 분류에는 반영을 기다리는 정기지출이 0건입니다."), "P2-1 목록 범위(예산을 정한 분류)를 말한다");
  ok(text.includes("예산 밖 분류의 반영 대기 정기지출 1건(650,000원)은 이 목록과 추가 가정값에 넣지 않았습니다."), "P2-1 예산 밖 대기 건수·금액을 보여 준다");
}));

done();
