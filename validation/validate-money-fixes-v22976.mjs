// V22.9.76 돈 계산·정기 반영 감사 수정 검사. 메모리 픽스처(validation/qa-fixture.mjs)로 재현하며 네트워크를 쓰지 않는다.
//   P0-1 예약 자동 반영이 가계부 5개씩 도는 커서 때문에 월말 규칙을 잃던 문제(가계부 32개·28일 규칙, 10~11월 매일 실행).
//        월말 실행이 멈추거나 한도에 걸린 지난달 몫은 새 달 첫 실행이 따라잡되, 지난달이 끝난 뒤 만든 규칙과
//        지난달 지정일에 꺼 두었던 규칙은 지난달로 넣지 않는다(D-10). 겹친 실행·수동 반영·응답 유실에도 한 건만 들어간다.
//   P0-2 /admin/recurring/save 로 이번 달에 이미 적은 항목을 정기로 등록해도 다음 자동 반영이 한 번 더 넣지 않는다.
//   P1-1 지정일 전에 '반영'을 눌러도 이번 달 추가 가정값(after_pending_assumption)이 줄지 않는다.
//   P1-3 가져오기에서 음수 수입 행을 양수 수입으로 조용히 저장하지 않는다(음수 지출과 같은 규칙: 반대 구분 + 확인 필요).
//   P2-1 분류 예산 밖에만 반영 대기 정기지출이 있을 때 "대기 중인 정기지출이 없습니다"라고 단정하지 않는다.
//   D-26 예약 실행 주소의 잘못된 today·month 는 오늘로 바꿔 실행하지 않고 거절한다.
import app, { parseFlexibleImportRecords, runRecurringAutoApply } from "../src/index.js";
import { fixture, withClock, post, page, api, formFields, counter, intercept, BASE, ctx, putSetting, skill, failure } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("V22.9.76 돈 계산·정기 반영 수정 검사");
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

// ── D-10: 지난달 몫을 놓친 규칙을 새 달에 고치면, 지난달 몫은 고치기 전 값으로 ───────────────
for (const path of ["/admin/recurring/save", "/my/recurring/save"]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedRule(fx, { id: "d10-rent", household_id: "house-home", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: 31 });
    seedRule(fx, { id: "d10-phone", household_id: "house-home", amount: 55000, category: "통신", memo: "휴대폰", day_of_month: 10 });
    for (let day = "2026-10-01"; day <= "2026-11-01"; day = nextDay(day)) await runCron(fx, day, { failRecurringRead: day >= "2026-10-31" }); // 10/31·11/1 실행 실패
    eq(recurringTx(fx, "d10-rent", "2026-10").length, 0, `D-10 ${path} 10월 31일 몫이 아직 없다`);
    globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-01", "20:00");
    const edit = (id, amount, memo, day, category) => post(fx, path, { id, household_id: "house-home", month: "2026-11", type: "expense", memo, amount, day_of_month: day, category, payment_method: "계좌이체", user_id: "user-bin", return_to: "/reserve-plans?household_id=house-home&month=2026-11#fixed" });
    const saved = await edit("d10-rent", "700000", "월세", "31", "주거/관리");
    ok(saved.status === 303 && /recurring_saved/.test(saved.decoded), `D-10 ${path} 월세를 70만 원으로 고친다`);
    eq(recurringTx(fx, "d10-rent", "2026-10").map((t) => `${t.transaction_date}:${t.amount}`).join(","), "2026-10-31:650000", `D-10 ${path} 놓친 10월 몫은 고치기 전 금액(650,000원)으로 먼저 들어간다`);
    eq(ruleNow(fx, "d10-rent").amount, 700000, `D-10 ${path} 규칙은 새 금액으로 저장된다`);
    await edit("d10-phone", "60000", "휴대폰", "10", "통신");
    eq(recurringTx(fx, "d10-phone", "2026-10").length, 1, `D-10 ${path} 10월에 이미 반영된 규칙은 고쳐도 10월 몫이 더 생기지 않는다`);
    for (let day = "2026-11-02"; day <= "2026-11-30"; day = nextDay(day)) await runCron(fx, day);
    eq(recurringTx(fx, "d10-rent", "2026-10").length, 1, `D-10 ${path} 따라잡기가 10월 몫을 다시 넣지 않는다`);
    eq(recurringTx(fx, "d10-rent", "2026-11").map((t) => `${t.transaction_date}:${t.amount}`).join(","), "2026-11-30:700000", `D-10 ${path} 고친 금액은 11월 몫부터 쓴다`);
    eq(recurringTx(fx, "d10-phone", "2026-11").map((t) => t.amount).join(","), "60000", `D-10 ${path} 휴대폰은 11월부터 새 금액`);
  });
}

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

// ── D-25·D-26: 정기 항목 두 번 보내기와 입력 검증 ─────────────────────────────────
for (const path of ["/admin/recurring/save", "/my/recurring/save"]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-01", "20:00");
    const fields = { household_id: "house-home", month: "2026-10", type: "expense", memo: "넷플릭스", amount: "17000", day_of_month: "15", category: "구독", payment_method: "현대카드", user_id: "user-bin", return_to: "/reserve-plans?household_id=house-home&month=2026-10#fixed" };
    const first = await Promise.all([post(fx, path, fields), post(fx, path, fields)]);
    const resend = await post(fx, path, fields);
    ok([...first, resend].every((r) => r.status === 303), `D-25 ${path} 세 번 모두 응답한다`);
    eq(fx.db.accountbook_recurring.filter((r) => r.memo === "넷플릭스").length, 1, `D-25 ${path} 두 번 누름·다시 보내기에도 규칙은 하나`);
    ok(/recurring_saved/.test(resend.decoded), `D-25 ${path} 다시 보낸 요청도 저장됨으로 답한다`);
    for (const day of ["2026-10-15", "2026-10-16"]) await runCron(fx, day);
    eq(fx.db.transactions.filter((t) => t.household_id === "house-home" && t.memo === "넷플릭스").length, 1, `D-25 ${path} 10월 넷플릭스 기록은 한 건`);
    const before = fx.db.accountbook_recurring.length;
    for (const [value, code] of [["0", "recurring_day_invalid"], ["32", "recurring_day_invalid"], ["", "recurring_day_invalid"], ["1.5", "recurring_day_invalid"]]) {
      const r = await post(fx, path, { ...fields, memo: `날짜 검사 ${value}`, day_of_month: value });
      ok(r.decoded.includes(`err=${code}`), `D-26 ${path} 지정일 ‘${value}’ 은 거절한다`);
    }
    const negative = await post(fx, path, { ...fields, memo: "음수 검사", amount: "-5000" });
    ok(negative.decoded.includes("err=recurring_amount_invalid"), `D-26 ${path} 금액 -5000 은 거절한다`);
    eq(fx.db.accountbook_recurring.length, before, `D-26 ${path} 거절한 입력은 규칙을 만들지 않는다`);
    // 운영에서는 두 번째 요청이 가계부 쓰기 잠금을 못 얻는다. 저장 공간 장애가 아니라 진행 중 안내로 답한다.
    const busyRestore = intercept(({ url, method, init }) => url.pathname.endsWith("/rpc/accountbook_claim_operation") && method === "POST" && String(init.body || "").includes("household-settings-rmw:house-home")
      ? new Response(JSON.stringify([{ acquired: false }]), { status: 200, headers: { "content-type": "application/json" } }) : null);
    let busy;
    try { busy = await post(fx, path, { ...fields, memo: "잠금 검사" }); } finally { busyRestore(); }
    ok(busy.decoded.includes("err=recurring_busy"), `D-25 ${path} 잠금을 못 얻은 두 번째 요청은 진행 중으로 안내한다 (${busy.decoded.slice(0, 120)})`);
    eq(fx.db.accountbook_recurring.filter((r) => r.memo === "잠금 검사").length, 0, `D-25 ${path} 잠금을 못 얻은 요청은 규칙을 만들지 않는다`);
    ok(strip((await page(fx, "/reserve-plans?household_id=house-home&month=2026-10&err=recurring_busy")).html).includes("다른 저장이 진행 중이라"), `D-25 ${path} 진행 중 안내 문장이 화면에 보인다`);
    const shown = strip((await page(fx, "/reserve-plans?household_id=house-home&month=2026-10&err=recurring_day_invalid")).html);
    ok(shown.includes("정기 항목의 날짜는 1~31일 중에서 골라 주세요"), `D-26 ${path} 거절 사유가 화면에 보인다`);
  });
}

// ── D-11: 지난달 화면의 고정지출 기록 단추는 대상 달을 적고, 이번 달이 아니면 확인 화면을 거친다 ─────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-20", "12:00");
  seedRule(fx, { id: "d11-oct", household_id: "house-home", amount: 17000, category: "구독", memo: "넷플릭스", payment_method: "현대카드", day_of_month: 15, last_applied_month: "2026-10", created_at: "2026-10-05T10:00:00+09:00" });
  seedRule(fx, { id: "d11-cur", household_id: "house-home", amount: 30000, category: "통신", memo: "인터넷", day_of_month: 5 });
  const past = await page(fx, "/reserve-plans?month=2026-09&household_id=house-home");
  const pastText = strip(past.html);
  // 리드 병합: 웹 수정이 ‘고정지출’을 ‘고정 수입·지출’로 바꿔 단추 문구도 그 말로 맞췄다.
  ok(pastText.includes("2026년 9월분 기록하기") && !pastText.includes("이번 달분 지금 기록하기"), "D-11 9월 화면의 단추는 ‘2026년 9월 고정지출 기록하기’ 다");
  ok(strip((await page(fx, "/reserve-plans?month=2026-10&household_id=house-home")).html).includes("이번 달분 지금 기록하기"), "D-11 이번 달 화면의 단추는 그대로 ‘이번 달’");
  const { fields } = formFields(past.html, "/admin/recurring/apply");
  eq(fields.get("month"), "2026-09", "D-11 9월 화면의 단추는 9월로 보낸다");
  const before = fx.db.transactions.length;
  const ask = await post(fx, "/admin/recurring/apply", fields);
  const askText = strip(ask.text);
  ok(ask.status === 200 && askText.includes("2026년 9월 날짜로 고정항목을 기록할까요?"), `D-11 이번 달이 아니면 먼저 확인 화면을 보인다 (${ask.status} ${ask.decoded})`);
  ok(askText.includes("2026-09-15 · 넷플릭스") && askText.includes("2026년 9월이 지난 뒤 만든 항목") && !askText.includes("인터넷"), "D-11 확인 화면은 기록할 날짜·항목과 그 달 뒤에 만든 항목을 적고, 9월에 이미 반영된 항목은 빼고 보인다");
  eq(fx.db.transactions.length, before, "D-11 확인 전에는 아무것도 기록하지 않는다");
  eq(ruleNow(fx, "d11-oct").last_applied_month, "2026-10", "D-11 확인 전에는 반영 표식을 바꾸지 않는다");
  const confirm = formFields(ask.text, "/admin/recurring/apply").fields;
  eq(confirm.get("confirmed"), "yes", "D-11 확인 화면의 단추가 확인 값을 보낸다");
  const applied = await post(fx, "/admin/recurring/apply", confirm);
  ok(applied.status === 303 && /고정항목 1건 기록/.test(applied.decoded.replace(/[+]/g, " ")), `D-11 확인하면 9월 날짜로 기록한다 (${applied.decoded})`);
  eq(recurringTx(fx, "d11-oct", "2026-09").map((t) => t.transaction_date).join(","), "2026-09-15", "D-11 넷플릭스는 2026-09-15 로 들어간다");
  eq(ruleNow(fx, "d11-oct").last_applied_month, "2026-10", "D-11 지난달을 기록해도 더 나중 달 표식은 그대로(SIM-8)");
  const current = await post(fx, "/admin/recurring/apply", { household_id: "house-home", month: "2026-10", return_to: "/reserve-plans?household_id=house-home&month=2026-10#fixed" });
  ok(current.status === 303 && /고정항목 1건 기록/.test(current.decoded.replace(/[+]/g, " ")), `D-11 이번 달은 확인 없이 바로 기록한다 (${current.decoded})`);
  eq(recurringTx(fx, "d11-cur", "2026-10").map((t) => t.transaction_date).join(","), "2026-10-05", "D-11 이번 달 기록 날짜");
});

// ── D-4: ‘교통’ 예산은 교통 갈래 전체를 세고, 홈·예산 화면·카카오 남은예산이 같은 숫자를 낸다 ─────────
await fixture(async (fx) => {
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-14", "12:00");
  putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
  fx.db.transactions = fx.db.transactions.filter((r) => r.household_id !== "house-home");
  fx.db.accountbook_budgets = fx.db.accountbook_budgets.filter((b) => b.household_id !== "house-home");
  const budget = (category, amount) => fx.db.accountbook_budgets.push({ id: `d4-b-${category}`, household_id: "house-home", month: "2026-10", category, amount, created_at: "2026-10-01T00:00:00.000Z" });
  budget("외식", 200000); budget("교통", 100000); budget("주유/충전", 200000); budget("카페/간식", 50000);
  const tx = (id, date, category, amount, memo) => fx.db.transactions.push({ id: `d4-${id}`, household_id: "house-home", user_id: "user-bin", transaction_date: date, type: "expense", amount, category, memo, payment_method: "현대카드", source: "kakao", raw_text: `${memo} ${amount}` });
  tx("lunch", "2026-10-02", "외식", 12000, "점심"); tx("delivery", "2026-10-03", "배달", 23000, "배달 치킨");
  tx("bus", "2026-10-05", "교통", 1500, "버스"); tx("taxi", "2026-10-06", "택시", 18000, "택시");
  tx("fuel", "2026-10-07", "주유/충전", 150000, "주유"); tx("coffee", "2026-10-08", "카페/간식", 4500, "커피");
  tx("legacy", "2026-10-09", "교통/차량", 5000, "하이패스");
  // 교통 행: 교통 1,500 + 택시 18,000 + 옛 교통/차량 5,000 = 24,500(주유는 따로 예산 행이 있어 주유/충전 행에서만 센다).
  // V22.9.79 감사 V44 D-4(남은 몫): 시작 분류 ‘외식’ 행도 옛 식비 갈래(외식·배달·편의점)를 센다 — 외식 12,000 + 배달 23,000 = 35,000.
  // 예산을 잡은 사용액 214,000원 / 전체 예산 550,000원 = 39%, 남은 예산 336,000원, 예산 밖 지출 없음(예전: 191,000원·35%·배달 23,000원 예산 밖).
  const kakao = await skill(fx, "남은예산");
  ok(kakao.includes("사용 금액: 214,000원") && kakao.includes("남은 예산: 336,000원") && kakao.includes("사용률: 39%"), `D-4 카카오 남은예산 합계 (${kakao.split(String.fromCharCode(10)).join(" ").slice(0, 160)})`);
  ok(kakao.includes("• 교통: 24,500원 사용 / 75,500원 남음 · 25%"), "D-4 카카오 교통 행은 택시·옛 교통/차량까지 센다");
  ok(kakao.includes("• 주유/충전: 150,000원 사용 / 50,000원 남음 · 75%"), "D-4 따로 예산을 잡은 주유/충전은 교통 행에서 빼고 자기 행에서 센다");
  ok(kakao.includes("• 외식: 35,000원 사용 / 165,000원 남음 · 18%"), "D-4(V22.9.79) 카카오 외식 행은 배달까지 센다");
  ok(!kakao.includes("예산 밖 지출"), "D-4(V22.9.79) 예산 밖 지출이 없으면 카카오에 그 줄을 쓰지 않는다");
  const budgets = strip((await page(fx, "/budgets?month=2026-10&household_id=house-home")).html);
  ok(budgets.includes("이번 달 남은 예산 336,000 원 전체 예산 550,000원 · 사용 214,000원 (39%)"), `D-4 예산 화면 합계가 카카오와 같다 (${(budgets.match(/이번 달 남은 예산 .{0,80}/) || [""])[0]})`);
  ok(/교통 [가-힣]+ 예산 100,000원 사용 24,500원/.test(budgets), `D-4 예산 화면 교통 카드도 24,500원 (${(budgets.match(/교통 [가-힣]+ 예산 [0-9,]+원 사용 [0-9,]+원/) || [""])[0]})`);
  ok(/외식 [가-힣]+ 예산 200,000원 사용 35,000원/.test(budgets), `D-4(V22.9.79) 예산 화면 외식 카드도 배달까지 35,000원 (${(budgets.match(/외식 [가-힣]+ 예산 [0-9,]+원 사용 [0-9,]+원/) || [""])[0]})`);
  ok(!/예산 밖 지출 [0-9,]+원/.test(budgets), "D-4(V22.9.79) 배달이 외식 행에 들어가 예산 밖 지출이 남지 않는다");
  const home = strip((await page(fx, "/app?month=2026-10&household_id=house-home")).html);
  ok(/예산 사용률 39%/.test(home) && home.includes("336,000") && /지출 214,000원/.test(home) && !home.includes("예산 밖"), `D-4 홈 대표 숫자도 같다 (${(home.match(/이번 달 쓸 수 있는 돈 .{0,110}/) || [""])[0]})`);
});

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
  // V22.9.79 V76 W-7: forecast 는 대기 고정지출·앞 날짜 정기 기록을 포함한 월말 예상이다. 반영 전(대기)과 뒤(앞 날짜 기록)가 같다.
  eq(after.forecast, before.forecast, "P1-1 월말 예상은 반영 전후 같다");
  eq(after.forecast, after.after_pending_assumption, "P1-1 옛 추가 가정값 키는 한 판 동안 월말 예상과 같은 값이다");
  const alerts = strip((await page(fx, "/budget-alerts?household_id=house-home&month=2026-10")).html);
  ok(alerts.includes("날짜가 아직 오지 않은 반영된 고정지출 1건(650,000원)은 월말 예상에 넣었습니다."), "P1-1 예산 알림 화면이 월말 예상에 남은 반영분을 말한다");
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

// ── E-4: 1월에 가져온 연도 없는 12월 날짜 ──────────────────────────────────────────
await fixture(async (fx) => {
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2027-01-05", "12:00");
  const csv = ["이용일,가맹점,이용금액", "12/28,스타벅스,4500", "12.30,이마트,52000", "12월 31일,송년회,80000", "01/03,GS25,3200"].join(String.fromCharCode(10));
  const box = (html, row) => (html.match(new RegExp(`<input[^>]*name="selected_rows"[^>]*value="${row}"[^>]*>`)) || [""])[0];
  const plain = await post(fx, "/my/import", { household_id: "house-home", month: "2027-01", import_action: "preview", csv_text: csv });
  const plainDates = (plain.text.match(/20[0-9]{2}-[0-9]{2}-[0-9]{2}/g) || []).filter((d) => d !== "2027-01-05");
  ok(["2026-12-28", "2026-12-30", "2026-12-31", "2027-01-03"].every((d) => plainDates.includes(d)) && !plainDates.some((d) => d.startsWith("2027-12")), `E-4 기준을 보내지 않은 이번 달 가져오기는 웹·카카오처럼 지난 12월로 읽는다 (${[...new Set(plainDates)].join(",")})`);
  ok(/\bchecked\b/.test(box(plain.text, 2)), "E-4 지난 12월로 읽은 행은 그대로 선택된다");
  const chosen = await post(fx, "/my/import", { household_id: "house-home", month: "2027-01", import_action: "preview", csv_text: csv, date_basis_mode: "selected" });
  ok(chosen.text.includes("연도 없는 날짜를 선택한 2027년으로 읽어 오늘 뒤 날짜(2027-12-28)가 됐습니다. 지난 거래라면 2026-12-28입니다."), "E-4 ‘선택한 연도’로 미래 날짜가 되면 이유와 지난해 날짜를 적는다");
  ok(box(chosen.text, 2).includes("data-review-needed=\"1\"") && !/\bchecked\b/.test(box(chosen.text, 2)), "E-4 그런 행은 기본 선택하지 않는다");
  ok(/\bchecked\b/.test(box(chosen.text, 5)) && box(chosen.text, 5).includes("data-review-needed=\"0\""), "E-4 오늘 전 날짜(01/03)는 확인 표시 없이 선택된다");
  const past = parseFlexibleImportRecords(["이용일,가맹점,이용금액", "12/28,스타벅스,4500"].join(String.fromCharCode(10)), "house-home", "user-bin", { importYear: 2026, dateBasisMode: "selected" }).rows[0];
  ok(past?.transaction_date === "2026-12-28" && past?._import_needs_confirmation === false, "E-4 지난해를 고른 가져오기(2026년 12월)는 표시 없이 그 해로 읽는다");
});

// ── E-8: 관리자 가져오기(/admin/import/json) 1,000행 초과·다시 제출 ─────────────────────────
await fixture(async (fx) => {
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-14", "12:00");
  fx.env.ADMIN_PASSWORD = "p"; fx.env.ADMIN_SESSION_SECRET = "s";
  const login = await post(fx, "/login", { password: "p", return_to: "/ops-monitor" }, { cookie: "" });
  const adminCookie = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(adminCookie, "E-8 관리자 로그인");
  const NL = String.fromCharCode(10);
  const send = async (raw) => {
    let calls = 0;
    const restore = intercept(({ url }) => { if (url.hostname === "mock.supabase.co") calls += 1; return null; });
    try {
      const res = await app.fetch(new Request(`${BASE}/admin/import/json`, { method: "POST", headers: { cookie: adminCookie, "content-type": "application/json", accept: "application/json", origin: BASE, "sec-fetch-site": "same-origin" }, body: JSON.stringify({ household_id: "house-home", user_id: "user-bin", raw_text: raw }) }), fx.env, ctx);
      return { status: res.status, body: await res.json(), calls };
    } finally { restore(); }
  };
  const count = () => fx.db.transactions.filter((t) => t.household_id === "house-home").length;
  const file = (n, tag) => ["날짜,금액,내용", ...Array.from({ length: n }, (_, i) => `2026-09-${String((i % 28) + 1).padStart(2, "0")},${1000 + i},${tag} ${i}`)].join(NL);
  const t0 = Date.now();
  let before = count();
  const big = await send(file(1050, "천오십"));
  ok(big.status === 200 && big.body.inserted === 1050 && big.body.skipped === 0 && count() - before === 1050, `E-8 1,050행은 1,000행씩 나눠 모두 저장하고 건너뛴 행을 0으로 정확히 알린다 (${big.status} ${JSON.stringify(big.body).slice(0, 140)})`);
  before = count();
  const max = await send(file(3000, "삼천"));
  ok(max.status === 200 && max.body.inserted === 3000 && count() - before === 3000, `E-8 3,000행까지 한 번에 저장한다 (${max.status} ${JSON.stringify(max.body).slice(0, 120)})`);
  ok(max.calls <= 50, `E-8 3,000행 저장의 저장소 호출은 50번 이하 (${max.calls})`);
  before = count();
  const over = await send(file(3001, "초과"));
  ok(over.status === 413 && over.body.error === "import_too_many_rows" && count() === before, `E-8 3,000행을 넘으면 아무것도 저장하지 않는다 (${over.status} ${over.body.message})`);
  ok(String(over.body.message || "").includes("3,001행") && String(over.body.message || "").includes("나눠 올려"), "E-8 넘친 행 수와 나눠 올리라는 안내를 준다");
  const small = ["날짜,금액,내용", "2026-09-01,7000,관리자 점심", "2026-09-02,8000,관리자 저녁"].join(NL);
  before = count();
  const first = await send(small);
  const again = await send(small);
  ok(first.body.inserted === 2 && again.body.inserted === 0 && again.body.duplicates === 2 && again.body.skipped === 2 && count() - before === 2, `E-8 같은 파일을 다시 내면 이미 저장된 행은 건너뛰고 건너뜀으로 센다 (${JSON.stringify([first.body.inserted, again.body.inserted, again.body.skipped])})`);
  const lose = (passBatches) => { let seen = 0; return intercept(async ({ url, forward }) => { if (!url.pathname.endsWith("/rpc/accountbook_commit_import_v22960")) return null; seen += 1; if (seen <= passBatches) return null; await forward(); return failure(503, "lost"); }); };
  const one = ["날짜,금액,내용", "2026-09-03,9000,응답 유실"].join(NL);
  let restore = lose(0);
  let lost;
  try { lost = await send(one); } finally { restore(); }
  ok(lost.status === 503 && lost.body.error === "import_write_unknown" && String(lost.body.message).includes("같은 파일을 그대로 다시 제출하면 이미 저장된 행은 다시 넣지 않습니다"), `E-8 응답이 끊기면 결과 미확인과 안전한 다시 제출을 안내한다 (${lost.status} ${lost.body.message})`);
  const retry = await send(one);
  ok(retry.status === 200 && retry.body.inserted === 0 && fx.db.transactions.filter((t) => t.memo === "응답 유실").length === 1, "E-8 안내대로 다시 제출해도 한 건만 남는다");
  restore = lose(1);
  let partial;
  try { partial = await send(file(1500, "나눔")); } finally { restore(); }
  ok(partial.status === 503 && String(partial.body.message).includes("앞의 1,000행은 저장을 확인했지만"), `E-8 둘째 묶음 응답이 끊기면 확인된 행 수를 알린다 (${partial.status} ${partial.body.message})`);
  const partialRetry = await send(file(1500, "나눔"));
  ok(partialRetry.status === 200 && partialRetry.body.inserted === 0 && partialRetry.body.duplicates === 1500 && fx.db.transactions.filter((t) => String(t.memo || "").startsWith("나눔 ")).length === 1500, `E-8 다시 제출하면 1,500행이 한 번씩만 남는다 (${JSON.stringify(partialRetry.body).slice(0, 120)})`);
  console.log(`E-8 소요 ${Date.now() - t0}ms`);
});

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
  // V22.9.79 V78 S-2: 예산 알림도 홈과 같이 매월 자동 기록 규칙을 ‘고정지출’이라 부른다. 대기분은 월말 예상에 들어간다(W-7).
  ok(!text.includes("이번 달에 아직 반영 대기 중인 고정지출이 없습니다."), "P2-1 예산 밖 대기 항목이 있으면 '대기 중인 고정지출이 없습니다'라고 하지 않는다");
  ok(text.includes("예산을 정한 분류에는 반영을 기다리는 고정지출이 0건입니다."), "P2-1 목록 범위(예산을 정한 분류)를 말한다");
  ok(text.includes("예산 밖 분류의 반영 대기 고정지출·정기지출 1건(650,000원)은 이 목록과 예산과 견주는 월말 예상에 넣지 않았습니다."), "P2-1 예산 밖 대기 건수·금액을 보여 준다");
}));

done();
