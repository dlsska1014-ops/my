// V22.9.77 지난달 리포트 다시 만들기(M-8)·가져오기 해석 CPU(V44:E-1) 검사. 메모리 픽스처(validation/qa-fixture.mjs)로
// 재현하며 네트워크를 쓰지 않는다.
//   M-8  말일 예약 반영이 멈춰 새 달 실행(1일, 넘치면 2일)이 지난달 몫을 따라잡으면 이미 만든 지난달 월간 스냅숏을 그 실행에서
//        다시 만든다. 한 실행에 2개까지만 만들고 남은 가계부·달은 상태 키(report_rebuild)에 남겨 다음 실행이 잇는다. 스냅숏이 없는
//        가계부는 만들지 않는다. 따라잡을 것이 없는 실행은 스냅숏을 찾지 않고 상태 값도 예전 두 칸 그대로다. ?month= 실행과
//        새 달에 규칙을 고쳐 지난달 몫이 들어가는 경우(D-10)도 같다.
//   N-17 다시 만들기 대기(report_rebuild)는 300개까지만 저장한다. 예전에는 넘친 항목을 저장 때 잘라 그 가계부의 스냅숏이
//        예전 금액으로 남았다. 대기에 자리가 없으면 지난달 몫을 넣지 않고 남겨 다음 실행이 잇는다(M-8-F).
//   E-1  가져오기 해석: KST 형식기를 행마다 만들지 않고(해석 한 번에 1개 이하), 제목 별칭 정규화가 행 수 × 별칭 수로 늘지 않고,
//        수입 분류 낱말 정규식을 행마다 만들지 않는다. 1,000행 해석이 옛 3.1초보다 훨씬 짧다. 결과는 고치기 전(V22.9.76)과
//        바이트 단위로 같다(입력 표본마다 SHA-256), 빠른 수입 판정은 옛 계산식과 모든 표본에서 같다.
// 사용: node validation/validate-cron-import-v22977.mjs [m8|e1] [--print-golden]
import { createHash } from "node:crypto";
import app, { parseFlexibleImportRecords, parseTransaction, runRecurringAutoApply } from "../src/index.js";
import { detectType, detectTypeDetail, normalizeText } from "../src/modules/nlu/amount-parser.js";
import { CATEGORY_RULES } from "../src/modules/nlu/category-rules.js";
import { nowKstDate, withKstNowScope } from "../src/modules/nlu/date-payment.js";
import { transactionTypeFromText } from "../src/modules/client/shared-input-parsers.js";
import { fixture, intercept, post, putSetting, settingValue, counter } from "./lib-audit-v22934.mjs";

const args = process.argv.slice(2);
const only = args.find((arg) => arg === "m8" || arg === "e1") || "";
const printGolden = args.includes("--print-golden");
const { ok, eq, deepEq, done } = counter("V22.9.77 지난달 리포트 다시 만들기·가져오기 해석 CPU 검사");

// ── M-8 ────────────────────────────────────────────────────────────────────────
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const nextDay = (ymd) => { const d = new Date(`${ymd}T00:00:00Z`); d.setUTCDate(d.getUTCDate() + 1); return d.toISOString().slice(0, 10); };
const STATE_KEY = "cron_recurring_state_v22976";
const snapshotKey = (hid, month = "2026-10") => `free_report_snapshot:${hid}:monthly:${month}`;
const readJson = (value) => (value == null ? null : typeof value === "string" ? JSON.parse(value) : value);
const snapshotOf = (fx, hid, month) => readJson(settingValue(fx, snapshotKey(hid, month)));
const stateOf = (fx) => readJson(settingValue(fx, STATE_KEY));
const recurringTx = (fx, ruleId, month = "2026-10") => fx.db.transactions.filter((t) => t.source === "recurring_auto" && t.raw_text === `recurring:${ruleId}:${month}`);
const ruleNow = (fx, id) => fx.db.accountbook_recurring.find((r) => r.id === id) || {};

// 예약 실행 한 번(정기 반영 + 자동 리포트 + NLU 정리)을 그날 09:10 KST 로 돌린다. 저장소 호출 수와 월간 스냅숏 조회를 센다.
async function runCron(fx, ymd, { failRecurringRead = false } = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  let calls = 0;
  const snapshotReads = [];
  const restore = intercept(({ url, method }) => {
    if (url.hostname !== "mock.supabase.co") return null;
    calls += 1;
    if (method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.search.includes("free_report_snapshot")) snapshotReads.push(url.searchParams.toString());
    if (failRecurringRead && method === "GET" && url.pathname.endsWith("/accountbook_recurring")) return new Response(JSON.stringify({ message: "synthetic outage" }), { status: 503, headers: { "content-type": "application/json" } });
    return null;
  });
  const pending = [];
  let error = null;
  try {
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd) }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  } finally { restore(); }
  return { calls, error, snapshotReads };
}

function seedRule(fx, rule) {
  const row = { type: "expense", payment_method: "", user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00+09:00", ...rule };
  fx.db.accountbook_recurring.push(row);
  return row;
}

function seedHousehold(fx, id, { monthly = true } = {}) {
  fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner" });
  fx.db.transactions.push({ id: `${id}-oct`, household_id: id, user_id: "user-bin", transaction_date: "2026-10-10", type: "expense", amount: 30000, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: "장보기 30000원", created_at: "2026-10-10T03:00:00Z" });
  if (monthly) putSetting(fx, `free_report_preference:${id}`, JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: true, weekly: false, monthly: true }));
}

// 스냅숏이 그 달 기록 전체(따라잡기 기록 포함)와 같은지: 넣은 정기 기록 금액·건수만큼 커졌는지 본다.
function includes(snapshot, stale, amount, count) {
  return !!snapshot && !!stale && snapshot.expense === stale.expense + amount && snapshot.transaction_count === stale.transaction_count + count && snapshot.period === "2026-10";
}

async function m8() {
  // ── M-8-A: 말일 실행이 멈추고(10/30·10/31·11/1 장애) 2일 실행이 따라잡는다 ───────────────
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "m8-a");
    seedRule(fx, { id: "m8a-29", household_id: "m8-a", amount: 8000, category: "구독", memo: "영상", day_of_month: 29 }); // 10/29 실행이 제때 넣는다
    seedRule(fx, { id: "m8a-30", household_id: "m8-a", amount: 55000, category: "통신", memo: "휴대폰", day_of_month: 30 });
    seedRule(fx, { id: "m8a-31", household_id: "m8-a", amount: 12000, category: "구독", memo: "음악", day_of_month: 31 });
    const runs = {};
    let stale = null, afterFirst = null, maxCalls = 0;
    for (let day = "2026-10-28"; day <= "2026-11-03"; day = nextDay(day)) {
      runs[day] = await runCron(fx, day, { failRecurringRead: day >= "2026-10-30" && day <= "2026-11-01" });
      maxCalls = Math.max(maxCalls, runs[day].calls);
      if (day === "2026-10-31") stale = snapshotOf(fx, "m8-a", "2026-10");
      if (day === "2026-11-01") afterFirst = snapshotOf(fx, "m8-a", "2026-10");
    }
    eq(recurringTx(fx, "m8a-29").map((t) => t.transaction_date).join(","), "2026-10-29", "M-8-A 29일 몫은 10/29 실행이 제때 넣는다");
    ok(stale && stale.transaction_count === 2 && stale.expense === 38000, "M-8-A 10/31 실행이 10월 스냅숏을 만든다(그때는 30·31일 정기 기록이 없다)");
    deepEq(afterFirst, stale, "M-8-A 11/1 도 장애라 스냅숏은 그대로다");
    eq(recurringTx(fx, "m8a-30").length + recurringTx(fx, "m8a-31").length, 2, "M-8-A 11/2 따라잡기가 10월 30·31일 몫을 한 건씩 넣는다");
    const rebuilt = snapshotOf(fx, "m8-a", "2026-10");
    ok(includes(rebuilt, stale, 67000, 2), `M-8-A 11/2 실행이 10월 스냅숏을 다시 만들어 따라잡은 67,000원·2건을 담는다 (지출 ${rebuilt?.expense}·${rebuilt?.transaction_count}건)`);
    eq(rebuilt?.household_name, "m8-a 가계부", "M-8-A 다시 만든 스냅숏은 가계부 이름을 그대로 쓴다");
    ok(runs["2026-11-02"].snapshotReads.length >= 1, "M-8-A 따라잡은 실행이 스냅숏을 확인한다");
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "M-8-A 다 만든 뒤 상태 값은 예전 두 칸이다(report_rebuild 없음)");
    eq(runs["2026-11-03"].snapshotReads.length, 0, "M-8-A 다음 실행(11/3)은 스냅숏을 찾지 않는다");
    deepEq(snapshotOf(fx, "m8-a", "2026-10"), rebuilt, "M-8-A 11/3 실행이 스냅숏을 또 만들지 않는다(한 번만)");
    eq(runs["2026-10-28"].snapshotReads.length + runs["2026-10-29"].snapshotReads.length, 0, "M-8-A 따라잡을 것이 없는 날(10/28, 이번 달 몫만 넣은 10/29)은 스냅숏을 찾지 않는다");
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "M-8-A 상태 키에 새 칸이 생기지 않는다");
    ok(maxCalls <= 50, `M-8-A 예약 실행 한 번의 저장소 호출 ${maxCalls}회 ≤ 50`);
  });

  // ── M-8-B: 1일 실행이 따라잡아도(10/30·10/31 장애) 같은 실행에서 다시 만든다 ─────────────
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "m8-b");
    seedRule(fx, { id: "m8b-31", household_id: "m8-b", amount: 45000, category: "보험", memo: "실손보험", day_of_month: 31 });
    let stale = null;
    for (let day = "2026-10-29"; day <= "2026-11-01"; day = nextDay(day)) {
      await runCron(fx, day, { failRecurringRead: day >= "2026-10-30" && day <= "2026-10-31" });
      if (day === "2026-10-31") stale = snapshotOf(fx, "m8-b", "2026-10");
    }
    eq(recurringTx(fx, "m8b-31").length, 1, "M-8-B 11/1 따라잡기가 10월 31일 몫을 넣는다");
    ok(includes(snapshotOf(fx, "m8-b", "2026-10"), stale, 45000, 1), "M-8-B 11/1 실행이 10월 스냅숏을 다시 만든다");
  });

  // ── M-8-C: 스냅숏 있는 가계부 5개 + 없는 가계부 2개가 한꺼번에 따라잡힌다(한 실행 2개, 나머지는 다음 실행) ─────
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const withReport = ["m8-h1", "m8-h2", "m8-h3", "m8-h4", "m8-h5"], without = ["m8-x1", "m8-x2"];
    for (const id of withReport) seedHousehold(fx, id);
    for (const id of without) seedHousehold(fx, id, { monthly: false });
    for (const id of [...withReport, ...without]) seedRule(fx, { id: `${id}-r`, household_id: id, amount: 10000, category: "구독", memo: "구독료", day_of_month: 31 });
    const stale = {};
    let maxCalls = 0, stateAfterNov2 = null, snapshotsAfterNov2 = {};
    for (let day = "2026-10-29"; day <= "2026-11-04"; day = nextDay(day)) {
      const run = await runCron(fx, day, { failRecurringRead: day >= "2026-10-30" && day <= "2026-11-01" });
      maxCalls = Math.max(maxCalls, run.calls);
      for (const id of withReport) if (!stale[id] && snapshotOf(fx, id, "2026-10")) stale[id] = snapshotOf(fx, id, "2026-10");
      if (day === "2026-11-02") { stateAfterNov2 = stateOf(fx); for (const id of withReport) snapshotsAfterNov2[id] = snapshotOf(fx, id, "2026-10"); }
    }
    // 월말 리포트는 한 실행에 가계부 2개씩 만든다: 10/31 h1·h2, 11/1 h3·h4, 11/2 h5(따라잡기 뒤라 처음부터 담는다).
    eq([...withReport, ...without].filter((id) => recurringTx(fx, `${id}-r`).length === 1).length, 7, "M-8-C 11/2 따라잡기가 가계부 7개의 10월 31일 몫을 넣는다");
    deepEq(stateAfterNov2?.report_rebuild, ["2026-10|m8-h3", "2026-10|m8-h4"], "M-8-C 11/2 실행은 2개(h1·h2)만 다시 만들고 h3·h4 를 상태 키에 남긴다(h5·스냅숏 없는 가계부는 남기지 않는다)");
    ok(["m8-h1", "m8-h2"].every((id) => includes(snapshotsAfterNov2[id], stale[id], 10000, 1)), "M-8-C 11/2 실행 뒤 h1·h2 스냅숏은 따라잡은 기록을 담는다");
    ok(["m8-h3", "m8-h4"].every((id) => snapshotsAfterNov2[id]?.transaction_count === 1), "M-8-C 11/2 실행 뒤 h3·h4 는 아직 예전 스냅숏이다(한 실행 2개 한도)");
    ok(snapshotsAfterNov2["m8-h5"]?.transaction_count === 2 && snapshotsAfterNov2["m8-h5"]?.expense === 40000, "M-8-C h5 는 월말 생성이 따라잡기 뒤에 처음부터 담아 만든다");
    ok(withReport.every((id) => snapshotOf(fx, id, "2026-10")?.transaction_count === 2 && snapshotOf(fx, id, "2026-10")?.expense === 40000), "M-8-C 다음 실행이 남은 h3·h4 를 이어 만들어 다섯 가계부 스냅숏이 모두 10월 기록 전체(2건·40,000원)와 같다");
    ok(without.every((id) => settingValue(fx, snapshotKey(id)) === undefined), "M-8-C 자동 리포트를 켜지 않은 가계부의 스냅숏은 만들지 않는다");
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "M-8-C 남은 목록을 다 만든 뒤 report_rebuild 칸이 사라진다");
    ok(maxCalls <= 50, `M-8-C 예약 실행 한 번의 저장소 호출 ${maxCalls}회 ≤ 50`);
  });

  // ── M-8-D: 새 달에 규칙을 고쳐 지난달 몫(D-10)이 들어가면 그 자리에서 다시 만든다 ───────────
  for (const path of ["/my/recurring/save", "/admin/recurring/save"]) {
    await fixture(async (fx) => {
      fx.db.accountbook_recurring.length = 0;
      putSetting(fx, "free_report_preference:house-home", JSON.stringify({ household_id: "house-home", household_name: "우리집 생활비", enabled: true, weekly: false, monthly: true }));
      seedRule(fx, { id: "m8d-rent", household_id: "house-home", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: 31 });
      let stale = null;
      for (let day = "2026-10-29"; day <= "2026-11-01"; day = nextDay(day)) {
        await runCron(fx, day, { failRecurringRead: day >= "2026-10-31" });
        if (day === "2026-10-31") stale = snapshotOf(fx, "house-home", "2026-10");
      }
      ok(stale && recurringTx(fx, "m8d-rent").length === 0, `M-8-D ${path} 10월 스냅숏은 있고 10월 31일 월세는 아직 없다`);
      globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-01", "20:00");
      const saved = await post(fx, path, { id: "m8d-rent", household_id: "house-home", month: "2026-11", type: "expense", memo: "월세", amount: "700000", day_of_month: "31", category: "주거/관리", payment_method: "계좌이체", user_id: "user-bin", return_to: "/reserve-plans?household_id=house-home&month=2026-11#fixed" });
      ok(saved.status === 303 && /recurring_saved/.test(saved.decoded), `M-8-D ${path} 월세를 70만 원으로 고친다`);
      eq(recurringTx(fx, "m8d-rent").map((t) => t.amount).join(","), "650000", `M-8-D ${path} 놓친 10월 몫이 고치기 전 금액으로 들어간다`);
      const rebuilt = snapshotOf(fx, "house-home", "2026-10");
      ok(includes(rebuilt, stale, 650000, 1), `M-8-D ${path} 고친 요청이 10월 스냅숏을 다시 만든다 (지출 ${rebuilt?.expense})`);
      await runCron(fx, "2026-11-02");
      deepEq(snapshotOf(fx, "house-home", "2026-10"), rebuilt, `M-8-D ${path} 다음 예약 실행은 같은 스냅숏을 또 만들지 않는다`);
    });
  }

  // ── M-8-E: ?month= 실행이 지난 달에 넣으면 다시 만들고, 남은 것은 상태에 보태 다음 예약 실행이 잇는다 ─────
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const ids = ["m8-e1", "m8-e2", "m8-e3"];
    for (const id of ids) {
      seedHousehold(fx, id);
      putSetting(fx, snapshotKey(id), JSON.stringify({ version: 1, household_id: id, household_name: `${id} 가계부`, kind: "monthly", period: "2026-10", generated_at: "2026-10-31T00:10:00.000Z", income: 0, expense: 30000, balance: -30000, transaction_count: 1, spend_days: 1, top_categories: [], biggest: null }));
    }
    await runCron(fx, "2026-11-04");
    const before = stateOf(fx);
    // 예약 따라잡기가 보지 않는 10월 15일 규칙(11/4 이후에 옮겨 온 규칙)을 운영자가 ?month=2026-10 으로 넣는다.
    for (const id of ids) seedRule(fx, { id: `${id}-r`, household_id: id, amount: 20000, category: "교육", memo: "학원", day_of_month: 15 });
    globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-05", "10:00");
    const result = await runRecurringAutoApply(fx.env, { month: "2026-10", today: "2026-11-05" });
    eq(ids.filter((id) => recurringTx(fx, `${id}-r`).length === 1).length, 3, "M-8-E ?month=2026-10 실행이 세 가계부의 10월 15일 몫을 넣는다");
    eq(result.report_rebuilt, 2, "M-8-E ?month= 실행도 스냅숏 2개를 다시 만든다");
    deepEq(stateOf(fx), { checked_date: before.checked_date, pending_month: before.pending_month, report_rebuild: ["2026-10|m8-e3"] }, "M-8-E 남은 1개만 상태에 보태고 checked_date·pending_month 는 그대로 둔다");
    await runCron(fx, "2026-11-06");
    ok(ids.every((id) => snapshotOf(fx, id, "2026-10")?.transaction_count === 2 && snapshotOf(fx, id, "2026-10")?.expense === 50000), "M-8-E 다음 예약 실행이 남은 스냅숏까지 다시 만든다");
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "M-8-E 다 만든 뒤 상태 값은 예전 두 칸이다");
  });

  // ── M-8-F(N-17): 다시 만들기 대기가 거의 찼으면 자리가 나는 만큼만 지난달 몫을 넣고, 대기 항목은 하나도 버리지 않는다 ─────
  // 예전에는 따라잡기가 다 넣은 뒤 저장 때 300개로 잘라 맨 뒤(방금 넣은 가계부)가 사라졌다. 거래와 표식은 이미 바뀐 뒤라
  // 그 가계부의 10월 스냅숏은 다시 만들어지지 않았다.
  const fakeQueue = (fx, count) => Array.from({ length: count }, (_, i) => {
    const id = `m8f-x${String(i + 1).padStart(3, "0")}`;
    putSetting(fx, snapshotKey(id), JSON.stringify({ version: 1, household_id: id, household_name: `${id} 가계부`, kind: "monthly", period: "2026-10", generated_at: "2026-10-31T00:10:00.000Z", income: 0, expense: 0, balance: 0, transaction_count: 0, spend_days: 0, top_categories: [], biggest: null }));
    return `2026-10|${id}`;
  });
  const seedStale = (fx, id) => putSetting(fx, snapshotKey(id), JSON.stringify({ version: 1, household_id: id, household_name: `${id} 가계부`, kind: "monthly", period: "2026-10", generated_at: "2026-10-31T00:10:00.000Z", income: 0, expense: 30000, balance: -30000, transaction_count: 1, spend_days: 1, top_categories: [], biggest: null }));
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    const real = ["m8f-h1", "m8f-h2", "m8f-h3"];
    for (const id of real) { seedHousehold(fx, id); seedStale(fx, id); seedRule(fx, { id: `${id}-r`, household_id: id, amount: 10000, category: "구독", memo: "구독료", day_of_month: 31 }); }
    // 10/31 실행이 없었고(checked_date 10/30) 앞선 따라잡기가 남긴 대기가 300개로 찼다. 예전 코드는 11/1 에 세 가계부를
    // 모두 넣고 303개 중 2개를 다시 만든 뒤 301개를 300개로 잘라 h3 를 잃었다.
    const queued = fakeQueue(fx, 300);
    putSetting(fx, STATE_KEY, JSON.stringify({ checked_date: "2026-10-30", pending_month: "", report_rebuild: queued }));
    let maxQueue = queued.length;
    const results = {}, inserted = {};
    for (const day of ["2026-11-01", "2026-11-02", "2026-11-03", "2026-11-04"]) {
      globalThis.__AB_QA_FIXED_NOW_MS = KST(day);
      results[day] = await runRecurringAutoApply(fx.env, { today: day });
      maxQueue = Math.max(maxQueue, safeQueue(stateOf(fx)).length);
      inserted[day] = real.filter((id) => recurringTx(fx, `${id}-r`).length === 1).join(",");
      if (day === "2026-11-01") {
        const state = stateOf(fx);
        eq(inserted[day], "", "M-8-F 11/1 대기가 300개로 찼으면 지난달 몫을 하나도 넣지 않는다");
        eq(results[day].report_rebuild_deferred, 3, "M-8-F 11/1 자리가 없는 세 가계부의 규칙을 미룬다");
        ok(results[day].partial && results[day].remaining === 3, `M-8-F 11/1 미룬 규칙은 남은 규칙으로 끝난다 (remaining ${results[day].remaining})`);
        ok(state.checked_date === "2026-10-30" && state.pending_month === "2026-10", `M-8-F 11/1 checked_date·pending_month 가 다음 실행이 10월 31일 몫을 잇게 남는다 (${state.checked_date}·${state.pending_month})`);
        eq(safeQueue(state).length, 298, "M-8-F 11/1 실행도 대기에서 2개를 다시 만든다(300 → 298)");
        eq(ruleNow(fx, "m8f-h1-r").last_applied_month, "2026-09", "M-8-F 11/1 미룬 규칙의 표식은 그대로다");
      }
    }
    eq(inserted["2026-11-02"], "m8f-h1,m8f-h2", "M-8-F 11/2 자리가 난 2개만큼 h1·h2 의 10월 몫을 넣는다");
    eq(inserted["2026-11-03"], "m8f-h1,m8f-h2,m8f-h3", "M-8-F 11/3 남은 h3 의 10월 몫을 넣는다(가계부마다 한 건)");
    const finalQueue = safeQueue(stateOf(fx));
    ok(real.every((id) => finalQueue.includes(`2026-10|${id}`)), `M-8-F 넣은 세 가계부가 모두 대기에 남아 있다(잘리지 않는다): ${real.filter((id) => !finalQueue.includes(`2026-10|${id}`)).join(",") || "모두 있음"}`);
    ok(maxQueue <= 300, `M-8-F 대기는 어느 실행 뒤에도 300개를 넘지 않는다 (최대 ${maxQueue})`);
    eq(results["2026-11-04"].applied, 0, "M-8-F 11/4 실행은 이미 넣은 몫을 다시 넣지 않는다");
  });
  // ?month= 지난 달 실행도 대기가 찼으면 넣지 않는다(예전에는 넣은 뒤 상태에 보태며 잘라 그 가계부를 잃었다).
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "m8f-e1"); seedStale(fx, "m8f-e1");
    await runCron(fx, "2026-11-04");
    const before = stateOf(fx);
    const full = fakeQueue(fx, 300);
    putSetting(fx, STATE_KEY, JSON.stringify({ ...before, report_rebuild: full }));
    seedRule(fx, { id: "m8f-e1-r", household_id: "m8f-e1", amount: 20000, category: "교육", memo: "학원", day_of_month: 15 });
    globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-05", "10:00");
    const result = await runRecurringAutoApply(fx.env, { month: "2026-10", today: "2026-11-05" });
    eq(recurringTx(fx, "m8f-e1-r").length, 0, "M-8-F ?month= 대기가 300개로 찼으면 지난 달 몫을 넣지 않는다");
    ok(result.report_rebuild_deferred === 1 && result.partial, `M-8-F ?month= 미룬 규칙을 결과에 적고 partial 로 끝난다 (${JSON.stringify({ deferred: result.report_rebuild_deferred, partial: result.partial })})`);
    deepEq(stateOf(fx), { ...before, report_rebuild: full }, "M-8-F ?month= 상태 키(대기·checked_date·pending_month)는 그대로다");
  });
}
const safeQueue = (state) => (Array.isArray(state?.report_rebuild) ? state.report_rebuild : []);

// ── E-1 ────────────────────────────────────────────────────────────────────────
const MERCHANTS = ["스타벅스 강남점", "이마트 성수점", "GS25 역삼점", "쿠팡", "배달의민족", "카카오T 택시", "올리브영 신촌", "CGV 용산", "교보문고 광화문", "SK주유소 서초"];
const pad = (n) => String(n).padStart(2, "0");
const won = (n) => n.toLocaleString("en-US");
const cardTsv = (n) => ["이용일자\t이용카드\t이용가맹점\t이용금액\t결제방법\t승인번호", ...Array.from({ length: n }, (_, i) => `2026.09.${pad((i % 28) + 1)}\t본인 1234\t${MERCHANTS[i % 10]} ${i}\t${won(1000 + (i * 137) % 90000)}\t일시불\t${10000000 + i}`)].join("\r\n");
const naturalLines = (n) => Array.from({ length: n }, (_, i) => `${(i % 9) + 1}월 ${(i % 27) + 1}일 ${MERCHANTS[i % 10]} ${1000 + i}원 카드`).join("\n");
const NLU_SENTENCES = [
  "어제 점심 12000원 카드", "오늘 월급 300만원", "지난주 금요일 택시 15000원", "10월 3일 커피 4500원", "용돈 5만원 받음", "환불 23000원",
  "엄마가 용돈 줬어 100000원", "3만5천원 마트 장보기", "적금 이체 200000원", "중고 판매 15000원", "보너스 50만원", "배당 12000원 들어옴",
  "캐시백 3000원", "이자 450원", "수당 지급 30만원", "상여금 1200000원", "알바비 80000원 받았어", "성과급 지급", "축하금 50000원",
  "돌려받은 돈 7000원", "정산받음 25000원", "반환 9000원", "부수입 30000원", "원고료 150000원", "강의료 200000원 입금", "예금이자 1200원",
  "주식배당 5600원", "판매 수익 40000원 결제", "월급날 회식 50000원", "수입 지출 3000원", "환불 수수료 3000원", "카드 이자 납부 2000원",
  "연봉협상 커피 4000원", "일당 120000원", "용돈수입 10000원", "그저께 주유 50000원 현대카드", "2026-09-30 관리비 230000원 계좌이체",
];
const SAMPLES = [
  ["card-tsv", ["○○카드 이용내역 (2026년 9월)", cardTsv(40), "합계\t\t\t1,234,000\t\t", "2026.09.29\t본인 1234\t스타벅스 취소\t-4,500\t일시불\t20000001"].join("\r\n"), { maxRows: 5000, importYear: 2026 }],
  ["bank-csv", ["거래일시,적요,찾으신금액,맡기신금액,잔액,거래점", ...Array.from({ length: 30 }, (_, i) => `2026-09-${pad((i % 28) + 1)} 12:${pad(i % 60)},${MERCHANTS[i % 10]},${i % 5 ? 1000 + i * 13 : 0},${i % 5 ? 0 : 50000 + i},${900000 - i * 100},인터넷`), ",잔액,,,871000,"].join("\n"), { maxRows: 5000 }],
  ["english-csv", ["Date,Description,Amount,Category,Payment", ...Array.from({ length: 20 }, (_, i) => `09/${pad((i % 28) + 1)}/2026,${MERCHANTS[i % 10]} ${i},${i % 7 ? "" : "-"}${1000 + i * 3},Food,Card`), "09/21/2026,Refund,\"(3,000)\",Food,Card", "09/22/2026,Hotel,$120,Travel,Card"].join("\n"), { maxRows: 5000, importYear: 2026 }],
  ["noyear-default-jan", ["날짜,내용,금액,구분", "12/28,송년회,85000,지출", "1/3,월급,3000000,수입", "12월 30일,택시,15000,지출", "1월 4일,커피,4500,지출", "2/14,꽃,30000,지출"].join("\n"), { referenceDate: "2027-01-05", dateBasisMode: "default" }],
  ["noyear-selected-jan", ["날짜,내용,금액,구분", "12/28,송년회,85000,지출", "1/3,월급,3000000,수입", "12월 30일,택시,15000,지출", "1월 4일,커피,4500,지출"].join("\n"), { importYear: 2026, dateBasisMode: "selected", referenceDate: "2027-01-05" }],
  ["negative-variants", ["날짜,내용,금액,구분", "2026-09-01,환불 받은 신발,−5,000,지출", "2026-09-02,취소된 결제,₩-3,000,지출", "2026-09-03,급여 정정,△2,000,수입", "2026-09-04,반품,▲1,500,지출", "2026-09-05,수당 회수,4000-,수입", "2026-09-06,카드 취소,(6000),", "2026-09-07,점심,9000,지출"].join("\n"), { maxRows: 5000, importYear: 2026 }],
  ["signed-file", ["일자,내역,금액", ...Array.from({ length: 12 }, (_, i) => `2026-09-${pad(i + 1)},${MERCHANTS[i % 10]},${i % 4 ? "-" : ""}${2000 + i * 100}`), "2026-09-20,월급,3000000"].join("\n"), { maxRows: 5000, importYear: 2026 }],
  ["natural", NLU_SENTENCES.join("\n"), { maxRows: 5000 }],
  ["headerless", Array.from({ length: 25 }, (_, i) => `2026-09-${pad((i % 28) + 1)},${MERCHANTS[i % 10]},${i % 6 ? 3000 + i : "1,200"}`).join("\n"), { maxRows: 5000 }],
  ["json", JSON.stringify({ transactions: [{ date: "2026-09-01", amount: 12000, memo: "점심", category: "식비" }, { date: "2026-09-02", amount: -5000, memo: "환불", payment: { method: "카드" } }, { 날짜: "2026-09-03", 금액: "3,000", 내용: "커피", 구분: "지출" }, { date: "2026-09-04", amount: "2500000", memo: "월급", type: "income" }] }), { maxRows: 5000 }],
  ["sections", ["# 시트: 9월", "날짜,내용,금액,결제수단", "2026-09-01,점심,9000,카드", "2026-09-02,커피,4500,현금", "날짜,내용,금액,결제수단", "2026-09-03,택시,12000,카드", "# 시트: 10월", "금액,날짜,분류,메모", "15000,2026-10-01,식비,저녁", "3000000,2026-10-05,급여,월급"].join("\n"), { maxRows: 5000, importYear: 2026 }],
  ["two-digit-year", ["날짜,내용,금액", "10/12/25,주유,50000", "25.10.13,마트,32000", "1/2/26,병원,12000"].join("\n"), { maxRows: 5000 }],
  ["serial-dates", ["날짜,내용,금액", "46000,관리비,230000", "46001.5,전기요금,48000", "46002,38000,수도"].join("\n"), { maxRows: 5000, importYear: 2026 }],
  ["key-value", ["날짜: 2026-09-01 | 금액: 5000 | 내용: 커피 | 분류: 카페/간식", "날짜=2026-09-02; 금액=12000; 메모=점심; 결제수단=국민카드", "금액: 3000000 | 구분: 수입 | 날짜: 2026-09-25 | 내용: 월급"].join("\n"), { maxRows: 5000 }],
  ["mapping-delta", cardTsv(12), { maxRows: 5000, importYear: 2026, mappingMetadata: true, mappingDelta: [{ section: 1, column_index: 1, field: "payment" }, { section: 1, column_index: 4, field: "ignore" }] }],
  ["over-limit", ["날짜,내용,금액", ...Array.from({ length: 150 }, (_, i) => `2026-09-${pad((i % 28) + 1)},${MERCHANTS[i % 10]},${1000 + i}`)].join("\n"), { maxRows: 100 }],
  ["quote-errors", ["날짜,내용,금액", "2026-09-01,\"TV 55\" 거치대\",30000", "2026-09-02,\"닫히지 않은 메모,12000", "2026-09-03,점심,9000", "2026-09-04,\"따옴표\"뒤글자,5000"].join("\n"), { maxRows: 5000 }],
  ["card-1000", cardTsv(1000), { maxRows: 5000, importYear: 2026 }],
  ["natural-1000", naturalLines(1000), { maxRows: 5000, importYear: 2026 }],
];
// 고치기 전(V22.9.76 adb66ed) 묶음으로 같은 표본을 해석한 결과의 SHA-256 앞 32자. --print-golden 으로 다시 뽑는다.
const GOLDEN = {
  "card-tsv": "844b5e42768cb72f150da0bd04521445",
  "bank-csv": "5fbc0c8fb6f1ddf9c9bcbea3fdf22574",
  "english-csv": "d25f3dd1a9b6ee3d43518388b58c71b0",
  "noyear-default-jan": "2413f5345a6d00f1e4d004e4c04bc904",
  "noyear-selected-jan": "c40de1f677f3a873004cec5dbcc5fe5a",
  "negative-variants": "6ec7961b102d5d7fb32c0d729150f9f4",
  "signed-file": "0fdf343fa79ce9bc1fee90b97d66833a",
  "natural": "a1755eb53273940d6fed6e71367aa758",
  "headerless": "7f33e583d349a321d2e6e40646bd0ecf",
  "json": "930d43511b9c83957c868335fe6fa054",
  "sections": "3e53ba9424eba5e7e27bfe9292f8ae2b",
  "two-digit-year": "e6919ba6af7303ccc6da02471cb69089",
  "serial-dates": "047b4c0373419c6c2f5475c9656ec7f1",
  "key-value": "60ac2ca6b3ab46076442f1d4bd280f13",
  "mapping-delta": "fde1d21193d3a04ac37a5a40a5e10830",
  "over-limit": "7e3a9c38c2d01b2607223a6831c05cf3",
  "quote-errors": "53f328dad2019fcba48e3ab1c7633775",
  "card-1000": "238b1cd999484f1abffbbd2e05f4590c",
  "natural-1000": "6a25299b8fae7ddc00ae9693c777439c",
  "nlu-sentences": "3ffbcf96de3141c1a1935be12bca66d1",
};
const digest = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex").slice(0, 32);

function counting(target, onConstruct) {
  return new Proxy(target, { construct(real, argv, newTarget) { onConstruct(); return Reflect.construct(real, argv, newTarget); } });
}

function measure(task, { regexp = false, formatter = false, nfkc = false } = {}) {
  const counts = { regexp: 0, formatter: 0, nfkc: 0 };
  const RealRegExp = globalThis.RegExp, RealFormat = Intl.DateTimeFormat, realNormalize = String.prototype.normalize;
  if (regexp) globalThis.RegExp = counting(RealRegExp, () => { counts.regexp++; });
  if (formatter) Intl.DateTimeFormat = counting(RealFormat, () => { counts.formatter++; });
  if (nfkc) String.prototype.normalize = function (form) { if (form === "NFKC") counts.nfkc++; return realNormalize.call(this, form); };
  try { counts.result = task(); }
  finally { globalThis.RegExp = RealRegExp; Intl.DateTimeFormat = RealFormat; String.prototype.normalize = realNormalize; }
  return counts;
}

function e1() {
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-14T12:00:00+09:00");
  const parse = ([, text, options]) => parseFlexibleImportRecords(text, "house-home", "user-bin", options);
  const actual = Object.fromEntries(SAMPLES.map((sample) => [sample[0], digest(parse(sample))]));
  actual["nlu-sentences"] = digest(NLU_SENTENCES.map((text) => parseTransaction(text, {})));
  if (printGolden) { console.log(JSON.stringify(actual, null, 2)); return; }

  // 1) 고치기 전과 같은 결과
  const changed = Object.keys(GOLDEN).filter((name) => actual[name] !== GOLDEN[name]);
  eq(Object.keys(GOLDEN).length, SAMPLES.length + 1, "E-1 표본마다 고치기 전 결과의 지문이 있다");
  deepEq(changed, [], `E-1 표본 ${SAMPLES.length}개(카드·통장·영문·연도 없는 날짜·음수 표기·부호 파일·자연어·제목 없는 표·JSON·여러 표·두 자리 연도·엑셀 일련번호·키:값·열 연결·한도 초과·따옴표 오류·1,000행)와 카카오 문장 해석이 고치기 전과 바이트 단위로 같다`);

  // 1-2) 가져오기 해석 범위(withKstNowScope) 안의 KST 현재 시각: 형식기는 하나만 만들고 같은 1초 안에서만 읽은 시각을 다시 쓴다.
  //      시계가 바뀌면 바로 따라가고, 돌려준 Date 를 바꿔도 다음 값은 그대로다.
  const at = (iso) => { globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(iso); return nowKstDate(); };
  const stamp = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${d.getMilliseconds()}`;
  const scoped = measure(() => withKstNowScope(() => {
    at("2026-10-31T23:59:59.100+09:00").setFullYear(2000);
    return ["2026-10-31T23:59:59.900+09:00", "2026-11-01T00:00:00.200+09:00", "2026-11-01T00:00:00.700+09:00"].map((iso) => stamp(at(iso)));
  }), { formatter: true });
  deepEq(scoped.result, ["2026-10-31 23:59:59.0", "2026-11-01 00:00:00.0", "2026-11-01 00:00:00.0"], "E-1 해석 범위 안 KST 현재 시각: 돌려준 Date 를 바꿔도 같은 초의 다음 값은 그대로이고(밀리초는 예전처럼 0), 초가 바뀌면 바로 새로 읽는다(자정 넘김)");
  eq(scoped.formatter, 1, "E-1 해석 범위 안에서는 KST 형식기를 하나만 만든다");
  const yesterdayAt = (iso) => { globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(iso); return parseTransaction("어제 점심 12000원", {}).transaction_date; };
  deepEq([yesterdayAt("2026-10-31T23:59:59.500+09:00"), yesterdayAt("2026-11-01T00:00:00.500+09:00"), yesterdayAt("2027-01-01T09:00:00+09:00")], ["2026-10-30", "2026-10-31", "2026-12-31"], "E-1 카카오 문장 '어제'가 시계를 따라간다(자정·연도 넘김)");
  const importYesterdayAt = (iso) => { globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(iso); return parseFlexibleImportRecords("어제 점심 12000원", "house-home", "user-bin", {}).accepted[0]?.row.transaction_date; };
  deepEq([importYesterdayAt("2026-10-31T23:59:59.500+09:00"), importYesterdayAt("2026-11-01T00:00:00.500+09:00"), importYesterdayAt("2027-01-01T09:00:00+09:00")], ["2026-10-30", "2026-10-31", "2026-12-31"], "E-1 자연어 가져오기 '어제'도 해석마다 시계를 따라간다(자정·연도 넘김)");
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-14T12:00:00+09:00");

  // 2) 빠른 수입 판정 = 옛 계산식(규칙 전체를 넘기는 transactionTypeFromText)
  const incomeWords = CATEGORY_RULES.filter((rule) => rule.type === "income").flatMap((rule) => rule.words || []);
  const corpus = [...NLU_SENTENCES, ...MERCHANTS, "", "   ", "수입", "지출 급여", "급여 환불 수수료"];
  for (const word of incomeWords) for (const before of ["", " ", "오늘 ", "가", "x", "\t", "2026-09-01,"]) for (const after of ["", " ", "1", " 30000원", "금", "x", ".", ",", " 결제", "\n"]) corpus.push(`${before}${word}${after}`);
  // 앞 낱말은 경계가 틀리고 뒤 낱말만 맞는 문장: 먼저 찾은 낱말이 틀린 자리면 옛 계산식과 달라진다.
  for (const first of incomeWords) for (const second of incomeWords) if (first !== second) corpus.push(`가${first} ${second}`, `${first}금 ${second} 3000원`);
  for (const sample of SAMPLES.slice(0, -2)) corpus.push(...String(sample[1]).split(/\r?\n/));
  const mismatches = corpus.filter((text) => detectType(text) !== transactionTypeFromText(normalizeText(text), CATEGORY_RULES) || JSON.stringify(detectTypeDetail(text)) !== JSON.stringify(transactionTypeFromText(normalizeText(text), CATEGORY_RULES, { detail: true })));
  deepEq(mismatches, [], `E-1 수입 판정 문장 ${corpus.length}개에서 빠른 판정이 옛 계산식과 같다(수입 낱말 ${incomeWords.length}개 × 앞뒤 경계·두 낱말 조합)`);
  ok(corpus.some((text) => detectType(text) === "income") && corpus.some((text) => detectType(text) === "expense"), "E-1 판정 표본에 수입·지출이 모두 있다");

  // 3) 행마다 다시 만들던 것들
  detectType("점심 12000원");
  const typeCounts = measure(() => { for (let i = 0; i < 200; i++) detectType(`${MERCHANTS[i % 10]} ${1000 + i}원`); }, { regexp: true });
  eq(typeCounts.regexp, 0, `E-1 지출 문장 200개 수입 판정이 정규식을 새로 만들지 않는다(옛 방식은 문장마다 ${incomeWords.length}개)`);
  const card120 = cardTsv(120), card1000 = cardTsv(1000), natural1000 = naturalLines(1000);
  const options = { maxRows: 5000, importYear: 2026 };
  parseFlexibleImportRecords(card1000, "house-home", "user-bin", options);
  const cardRegexp = measure(() => parseFlexibleImportRecords(card1000, "house-home", "user-bin", options), { regexp: true });
  ok(cardRegexp.result.accepted.length === 1000 && cardRegexp.regexp < 5 * 1000, `E-1 카드 1,000행 해석의 new RegExp ${cardRegexp.regexp}회 < 행당 5회(옛 방식 행당 ${incomeWords.length}회)`);
  const naturalFormat = measure(() => parseFlexibleImportRecords(natural1000, "house-home", "user-bin", options), { formatter: true });
  ok(naturalFormat.result.accepted.length === 1000 && naturalFormat.formatter <= 1, `E-1 자연어 1,000행 해석의 KST 형식기 ${naturalFormat.formatter}개 ≤ 1(옛 방식 행마다 1개)`);
  const cardFormat = measure(() => parseFlexibleImportRecords(card1000, "house-home", "user-bin", options), { formatter: true });
  ok(cardFormat.formatter <= 1, `E-1 카드 1,000행 해석의 KST 형식기 ${cardFormat.formatter}개 ≤ 1`);
  // 행마다 제목 행인지 볼 때(자연어 줄, 표의 반복 제목 판정) 별칭을 다시 정규화하면 행당 NFKC 가 별칭 수(행당 100회 이상)만큼 늘어난다.
  // 칸 값 정규화(행당 몇 회)는 괜찮다.
  for (const [label, make] of [["카드 표", cardTsv], ["자연어", naturalLines]]) {
    const small = measure(() => parseFlexibleImportRecords(make(120), "house-home", "user-bin", options), { nfkc: true });
    const large = measure(() => parseFlexibleImportRecords(make(1000), "house-home", "user-bin", options), { nfkc: true });
    const perRow = (large.nfkc - small.nfkc) / 880;
    ok(perRow <= 30, `E-1 ${label}: 제목 별칭 정규화가 행 수 × 별칭 수로 늘지 않는다(행당 NFKC ${perRow.toFixed(2)}회 ≤ 30)`);
  }

  // 4) 시간: 데운 뒤 1,000행(옛 V22.9.44 카드 1,000행 약 3.1초)
  for (const [label, text] of [["카드", card1000], ["자연어", natural1000]]) {
    parseFlexibleImportRecords(text, "house-home", "user-bin", options);
    const started = performance.now();
    parseFlexibleImportRecords(text, "house-home", "user-bin", options);
    const ms = performance.now() - started;
    ok(ms < 1500, `E-1 ${label} 1,000행 해석 ${ms.toFixed(0)}ms < 1,500ms`);
  }
}

if (!only || only === "e1") e1();
if (!printGolden && (!only || only === "m8")) await m8();
if (!printGolden) done();
