// V22.9.94 예약 실행·리포트 검사 (외부 검토 C-10, 내부 검토 R-1).
// 메모리 픽스처(validation/qa-fixture.mjs)로 실제 예약 실행(app.scheduled)과 요청 경로를 돌리며 네트워크를 쓰지 않는다.
//   C-10 예약 실행이 다시 만들기 대기의 스냅숏을 다시 만드는 도중(기록을 읽은 뒤·저장 전)에 실행 밖 요청이 그 기간에 기록을 넣고
//        같은 기간 다시 만들기를 요청하면, 대기에 이미 있는 항목이라 요청이 아무것도 쓰지 않거나(중복으로 취급) 그 자리에서 만든
//        새 스냅숏을 실행이 옛 기록으로 덮었다. 실행은 그 항목을 대기에서 지워 다음 실행도 복구하지 않았다. 이제 요청은 늘 판 번호를
//        적어 새 변경으로 남기고, 실행은 자기가 상태를 읽은 뒤에 다시 요청된 항목을 대기에 남겨 다음 실행이 다시 만든다.
//   R-1  자동 리포트는 한 실행에 가계부 2개만 만들었고(limit 3·slice 2), 월간·주간 스냅숏은 말일·일요일 09:10 에 한 번 만든 뒤
//        다시 만들지 않아 그날 뒤 기록이 빠졌다. 이제 남은 저장소 호출 몫(가계부마다 기록 조회 1 + 저장 1)과 한 실행의 기록 행
//        상한 안에서 오래 기다린 가계부부터 처리하고, 말일·일요일에 만든 스냅숏(미리 보기)은 다음 날 아침 그 기간 전체 기록으로
//        다시 만든다(확정).
// 사용: node validation/validate-v22994-cron.mjs
import app, { runAutomaticReports } from "../src/index.js";
import { refreshRecurringReports } from "../src/modules/cron/recurring-auto-apply.js";
import { fixture, intercept, putSetting, settingValue } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { ok(actual === expected, `${msg} (실제 ${JSON.stringify(actual)} · 기대 ${JSON.stringify(expected)})`); }

const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const STATE_KEY = "cron_recurring_state_v22976";
const CURSOR_KEY = "cron_report_cursor_v22930";
const RUN_LOG_KEY = "cron_run_log_v22978";
const readJson = (value) => (value == null || value === "" ? null : typeof value === "string" ? JSON.parse(value) : value);
const rawState = (fx) => settingValue(fx, STATE_KEY);
const stateOf = (fx) => { const state = readJson(rawState(fx)); if (state && typeof state === "object") delete state.rev; return state; };
const revOf = (fx) => Number((/^\{"rev":(\d+),/.exec(String(rawState(fx) || "")) || [])[1] || 0);
const cursorOf = (fx) => readJson(settingValue(fx, CURSOR_KEY));
const lastRun = (fx) => (readJson(settingValue(fx, RUN_LOG_KEY)) || [])[0] || null;
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const isoWeek = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`;
};
const monthlyKey = (hid, month) => `free_report_snapshot:${hid}:monthly:${month}`;
const weeklyKey = (hid, sunday) => `free_report_snapshot:${hid}:weekly:${isoWeek(sunday)}`;
const snapshot = (fx, key) => readJson(settingValue(fx, key));

// 예약 실행 한 번(정기 반영 + 자동 리포트 + NLU 정리 + 실행 기록)을 그날 hm(기본 09:10) KST 로 돌린다. 저장소 호출 수·스냅숏 조회를 센다.
async function runCron(fx, ymd, { hm = "09:10", handler = null } = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd, hm);
  const list = opsEvents();
  const mark = list[list.length - 1];
  const seen = { calls: 0, snapshotLookups: 0 };
  const restore = intercept(async (request) => {
    if (request.url.hostname !== "mock.supabase.co") return null;
    seen.calls += 1;
    if (request.method === "GET" && request.url.pathname.endsWith("/accountbook_settings") && request.url.search.includes("free_report_snapshot")) seen.snapshotLookups += 1;
    return handler ? (await handler(request)) || null : null;
  });
  let error = null;
  try {
    const pending = [];
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd, hm) }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  } finally { restore(); }
  const after = opsEvents();
  return { ...seen, error, events: after.slice(mark ? after.indexOf(mark) + 1 : 0), log: lastRun(fx) };
}

function seedHousehold(fx, id, { weekly = false, monthly = false, tx = [] } = {}) {
  fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  if (weekly || monthly) putSetting(fx, `free_report_preference:${id}`, JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: true, weekly, monthly }));
  tx.forEach(([date, amount], index) => addTx(fx, id, date, amount, `${index}`));
}

function addTx(fx, householdId, date, amount, tag = "late") {
  fx.db.transactions.push({ id: `${householdId}-${date}-${tag}`, household_id: householdId, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: `장보기 ${amount}원 ${date} ${tag}`, created_at: `${date}T03:00:00Z` });
}

const putState = (fx, state) => putSetting(fx, STATE_KEY, JSON.stringify(state));
const staleMonthly = (hid, month, expense, count) => JSON.stringify({ version: 1, household_id: hid, household_name: `${hid} 가계부`, kind: "monthly", period: month, generated_at: `${month}-30T00:10:00.000Z`, income: 0, expense, balance: -expense, transaction_count: count, spend_days: count, top_categories: [], biggest: null });
// 예약 실행이 다시 만들려고 그 가계부·기간 기록을 읽는 요청(첫 쪽).
const rowsRead = (request, householdId, start) => request.method === "GET" && request.url.pathname.endsWith("/transactions")
  && request.url.searchParams.get("household_id") === `eq.${householdId}` && request.url.searchParams.getAll("transaction_date").includes(`gte.${start}`);

// ── C-10-A: 대기에 있는 9월 스냅숏을 실행이 다시 만드는 도중, 같은 기간 기록을 넣고 다시 만들기를 요청한다(대기에만 넣는 요청) ─────
// 실행은 5,000원을 읽은 뒤 저장한다. 그 사이 7,000원 기록과 같은 기간 요청이 들어온다. 예전에는 대기에 이미 같은 항목이 있어
// 요청이 아무것도 쓰지 않았고(성공으로 돌아옴), 실행이 끝나며 항목을 지워 스냅숏이 5,000원으로 남았다(다음 실행도 그대로).
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "c10a", { monthly: true, tx: [["2026-09-10", 5000]] });
  putSetting(fx, monthlyKey("c10a", "2026-09"), staleMonthly("c10a", "2026-09", 5000, 1));
  putState(fx, { checked_date: "2026-10-20", pending_month: "", report_rebuild: ["2026-09|c10a"] });
  let injected = false, revBefore = 0, revAfter = 0;
  const run = await runCron(fx, "2026-10-21", {
    handler: async (request) => {
      if (injected || !rowsRead(request, "c10a", "2026-09-01")) return null;
      injected = true;
      const response = await request.forward(); // 실행은 5,000원만 읽었다
      addTx(fx, "c10a", "2026-09-25", 7000);
      revBefore = revOf(fx);
      await refreshRecurringReports(fx.env, "c10a", [], "2026-09", { queueOnly: true, path: "/admin/recurring/apply" });
      revAfter = revOf(fx);
      return response;
    },
  });
  ok(injected && !run.error, "C10-A 실행이 9월 기록을 읽은 뒤 같은 기간 요청이 끼어든다");
  ok(revAfter > revBefore, `C10-A 대기에 이미 있는 항목의 요청도 상태에 새 변경으로 적힌다 (판 번호 ${revBefore} → ${revAfter}, 예전: 그대로라 요청이 사라졌다)`);
  eq(snapshot(fx, monthlyKey("c10a", "2026-09"))?.expense, 5000, "C10-A 그 실행이 저장한 스냅숏은 읽은 때의 5,000원이다");
  ok((stateOf(fx)?.report_rebuild || []).includes("2026-09|c10a"), `C10-A 실행이 상태를 읽은 뒤 다시 요청된 항목은 실행 끝에 대기에 남는다 (${JSON.stringify(stateOf(fx))})`);
  await runCron(fx, "2026-10-22");
  const fixed = snapshot(fx, monthlyKey("c10a", "2026-09"));
  ok(fixed?.expense === 12000 && fixed?.transaction_count === 2, `C10-A 다음 실행이 9월 스냅숏을 12,000원·2건으로 다시 만든다 (${fixed?.expense}원·${fixed?.transaction_count}건)`);
  const settled = stateOf(fx);
  ok(!settled?.report_rebuild && !settled?.report_req, `C10-A 다시 만든 뒤 대기·요청 표시가 남지 않는다 (${JSON.stringify(settled)})`);
  await runCron(fx, "2026-10-23");
  ok(!stateOf(fx)?.report_rebuild, "C10-A 그다음 실행은 같은 항목을 또 대기에 올리지 않는다(되풀이 없음)");
});

// ── C-10-B: 요청이 그 자리에서 다시 만든 새 스냅숏을 먼저 기록을 읽은 실행이 옛 기록으로 덮지 않는다 ─────────────────────
// 실행은 확인한 스냅숏이 그대로일 때만 바꾸고(생성 시각 조건), 바뀌었으면 그 항목을 대기에 남겨 다음 실행이 다시 본다.
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "c10b", { monthly: true, tx: [["2026-09-10", 5000]] });
  putSetting(fx, monthlyKey("c10b", "2026-09"), staleMonthly("c10b", "2026-09", 5000, 1));
  putState(fx, { checked_date: "2026-10-20", pending_month: "", report_rebuild: ["2026-09|c10b"] });
  let injected = false, inPlace = null;
  const raced = await runCron(fx, "2026-10-21", {
    handler: async (request) => {
      if (injected || !rowsRead(request, "c10b", "2026-09-01")) return null;
      injected = true;
      const response = await request.forward();
      addTx(fx, "c10b", "2026-09-25", 7000);
      await refreshRecurringReports(fx.env, "c10b", [], "2026-09", { path: "/my/recurring/save" });
      inPlace = snapshot(fx, monthlyKey("c10b", "2026-09"));
      return response;
    },
  });
  eq(inPlace?.expense, 12000, "C10-B 요청은 그 자리에서 12,000원 스냅숏을 만든다");
  eq(snapshot(fx, monthlyKey("c10b", "2026-09"))?.expense, 12000, "C10-B 먼저 기록을 읽은 실행이 늦게 저장해도 요청이 만든 12,000원을 덮지 않는다 (예전: 5,000원으로 덮었다)");
  ok((stateOf(fx)?.report_rebuild || []).includes("2026-09|c10b"), `C10-B 덮지 못한 항목은 실행 끝에 대기에 남는다 (${JSON.stringify(stateOf(fx))})`);
  ok(raced.events.some((e) => e.kind === "free_report_rebuild_conflict") && !raced.log?.errors?.length, "C10-B 겹침은 운영 이벤트 free_report_rebuild_conflict(정보)로 남고 실행 오류가 아니다");
  await runCron(fx, "2026-10-22");
  const settledB = snapshot(fx, monthlyKey("c10b", "2026-09"));
  ok(settledB?.expense === 12000 && settledB?.transaction_count === 2, `C10-B 다음 실행도 12,000원·2건이다 (${settledB?.expense}원·${settledB?.transaction_count}건)`);
  ok(!stateOf(fx)?.report_rebuild && !stateOf(fx)?.report_req, "C10-B 다시 본 뒤 대기·요청 표시가 없다");
});

// ── C-10-C: 실행이 없을 때의 같은 기간 재요청은 대기를 늘리지 않고 판 번호만 새로 적는다. 실행 전 요청은 실행 뒤 남지 않는다 ─────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "c10c", { monthly: true, tx: [["2026-09-10", 5000]] });
  putSetting(fx, monthlyKey("c10c", "2026-09"), staleMonthly("c10c", "2026-09", 0, 0));
  putSetting(fx, STATE_KEY, `{"rev":4,${JSON.stringify({ checked_date: "2026-10-20", pending_month: "", report_rebuild: ["2026-09|c10c"] }).slice(1)}`);
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-20", "20:00");
  await refreshRecurringReports(fx.env, "c10c", [], "2026-09", { queueOnly: true });
  const state = readJson(rawState(fx));
  ok(state.rev === 5 && JSON.stringify(state.report_rebuild) === JSON.stringify(["2026-09|c10c"]), `C10-C 같은 항목은 대기에 한 번만 있고 판 번호가 오른다 (${rawState(fx)})`);
  eq(state.report_req?.["2026-09|c10c"], 5, "C10-C 요청 표시는 그 요청이 쓴 판 번호다");
  eq(state.checked_date, "2026-10-20", "C10-C 요청은 checked_date 를 바꾸지 않는다");
  await runCron(fx, "2026-10-21");
  eq(snapshot(fx, monthlyKey("c10c", "2026-09"))?.expense, 5000, "C10-C 다음 실행이 스냅숏을 다시 만든다");
  ok(JSON.stringify(Object.keys(stateOf(fx)).sort()) === JSON.stringify(["checked_date", "pending_month"]), `C10-C 실행 전 요청은 실행이 읽은 판 안이라 다시 남기지 않는다(상태는 예전 두 칸) (${JSON.stringify(stateOf(fx))})`);
});

// ── C-10-D: 다음 날 확정(R-1)도 기록을 읽은 뒤 다른 곳이 새로 만든 스냅숏을 덮지 않는다(새 단계의 보호) ─────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "c10d", { weekly: true, tx: [["2026-11-24", 5000]] });
  putState(fx, { checked_date: "2026-11-28", pending_month: "" });
  await runCron(fx, "2026-11-29");
  addTx(fx, "c10d", "2026-11-29", 7000, "sun-night");
  let injected = "";
  await runCron(fx, "2026-11-30", {
    handler: async (request) => {
      if (injected || !rowsRead(request, "c10d", "2026-11-23")) return null;
      const response = await request.forward();
      injected = JSON.stringify({ ...snapshot(fx, weeklyKey("c10d", "2026-11-29")), expense: 12000, transaction_count: 2, generated_at: "2026-11-30T00:10:30.000Z" });
      putSetting(fx, weeklyKey("c10d", "2026-11-29"), injected);
      return response;
    },
  });
  ok(!!injected && settingValue(fx, weeklyKey("c10d", "2026-11-29")) === injected, "C10-D 확정은 확인한 뒤 바뀐 스냅숏을 덮지 않는다");
});

// ── R-1-A: 리포트를 켠 가계부 5개(주간·월간). 일요일 미리 보기·월요일(말일) 확정과 미리 보기·화요일(1일) 확정이 한 실행에 다 된다 ─────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const ids = ["r1a-h1", "r1a-h2", "r1a-h3", "r1a-h4", "r1a-h5"];
  for (const id of ids) seedHousehold(fx, id, { weekly: true, monthly: true, tx: [["2026-11-10", 20000], ["2026-11-24", 10000]] });
  putState(fx, { checked_date: "2026-11-28", pending_month: "" });
  const sun = await runCron(fx, "2026-11-29");
  eq(ids.filter((id) => snapshot(fx, weeklyKey(id, "2026-11-29"))?.transaction_count === 1).length, 5, "R1-A 11/29(일) 실행이 다섯 가계부의 주간 스냅숏을 모두 만든다 (예전: 한 실행 2개)");
  ok(sun.calls <= 50 && !sun.error, `R1-A 일요일 실행 저장소 호출 ${sun.calls}회 ≤ 50, 오류 없음`);
  ok(sun.log?.status === "ok" && sun.log?.reports?.generated === 5 && !sun.log?.reports?.pending_scopes, `R1-A 일요일 실행 기록은 정상이고 다 못 돈 범위가 없다 (${JSON.stringify(sun.log?.reports)}·${sun.log?.status})`);
  const sunScopes = cursorOf(fx)?.scopes || [];
  ok(sunScopes.length === 1 && sunScopes[0].date === "2026-11-29" && sunScopes[0].final === true && sunScopes[0].weekly === true && sunScopes[0].monthly === false, `R1-A 일요일 미리 보기 뒤 그 주 확정 범위 하나가 다음 날을 기다린다 (${JSON.stringify(sunScopes)})`);
  // 일요일 저녁 기록. 미리 보기에는 없고 월요일 확정에 들어가야 한다.
  addTx(fx, "r1a-h1", "2026-11-29", 7000, "sun-night");
  const mon = await runCron(fx, "2026-11-30");
  const week1 = snapshot(fx, weeklyKey("r1a-h1", "2026-11-29"));
  ok(week1?.transaction_count === 2 && week1?.expense === 17000, `R1-A 월요일 확정이 일요일 09:10 뒤 기록을 주간 스냅숏에 담는다 (${week1?.transaction_count}건·${week1?.expense}원, 예전: 다시 만들지 않았다)`);
  // h1 은 일요일 저녁 기록까지 3건, 나머지는 2건이다.
  eq(ids.filter((id) => snapshot(fx, monthlyKey(id, "2026-11"))?.transaction_count === (id === "r1a-h1" ? 3 : 2)).length, 5, "R1-A 11/30(말일) 실행이 다섯 가계부의 11월 월간 미리 보기를 모두 만든다");
  ok(mon.calls <= 50 && mon.log?.status === "ok", `R1-A 월요일 실행 호출 ${mon.calls}회 ≤ 50·정상`);
  const previewH3 = snapshot(fx, monthlyKey("r1a-h3", "2026-11"));
  addTx(fx, "r1a-h2", "2026-11-30", 9000, "last-night");
  const tue = await runCron(fx, "2026-12-01");
  const month2 = snapshot(fx, monthlyKey("r1a-h2", "2026-11"));
  ok(month2?.transaction_count === 3 && month2?.expense === 39000, `R1-A 12/1 확정이 말일 09:10 뒤 기록을 11월 월간 스냅숏에 담는다 (${month2?.transaction_count}건·${month2?.expense}원, 예전: 말일 미리 보기 그대로였다)`);
  ok(JSON.stringify(snapshot(fx, monthlyKey("r1a-h3", "2026-11"))) === JSON.stringify(previewH3), "R1-A 기록이 그대로인 가계부의 확정은 스냅숏을 다시 쓰지 않는다(같은 값)");
  ok(tue.calls <= 50 && tue.log?.status === "ok" && !tue.log?.reports?.pending_scopes, `R1-A 12/1 실행 뒤 남은 범위가 없다 (${JSON.stringify(tue.log?.reports)})`);
  const wed = await runCron(fx, "2026-12-02");
  eq(wed.snapshotLookups, 0, "R1-A 할 일이 없는 날(12/2)은 스냅숏을 찾지 않는다");
  const cursor = cursorOf(fx);
  ok(Array.isArray(cursor?.scopes) && cursor.scopes.length === 0, `R1-A 다 끝나면 범위 목록이 비어 있다 (${JSON.stringify(cursor)})`);
});

// ── R-1-B: 리포트를 켠 가계부 30개(주간)는 한 실행 몫을 넘는다. 예산 안에서 이어 가며 아직 못 받은 가계부를 먼저 처리한다 ──────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const ids = Array.from({ length: 30 }, (_, i) => `r1b-${String(i + 1).padStart(2, "0")}`);
  for (const id of ids) seedHousehold(fx, id, { weekly: true, tx: [["2026-11-24", 3000]] });
  // 정기 규칙 몇 개가 같은 날 들어가 정기 반영 단계도 저장소 호출을 쓴다.
  for (const id of ids.slice(0, 3)) fx.db.accountbook_recurring.push({ id: `${id}-rule`, household_id: id, type: "expense", amount: 4000, category: "구독", memo: "구독", payment_method: "", day_of_month: 29, user_id: "user-bin", is_active: true, last_applied_month: "2026-10", created_at: "2026-07-01T00:00:00+09:00" });
  putState(fx, { checked_date: "2026-11-28", pending_month: "" });
  const has = () => ids.filter((id) => !!snapshot(fx, weeklyKey(id, "2026-11-29")));
  const sun = await runCron(fx, "2026-11-29");
  const afterSun = has();
  ok(afterSun.length > 5 && afterSun.length < 30, `R1-B 일요일 실행은 예산 안에서 여러 가계부를 만든다 (${afterSun.length}개, 예전: 2개)`);
  ok(sun.calls <= 50 && sun.log?.status === "partial" && !sun.log?.errors?.length, `R1-B 다 못 한 실행은 일부 남음(오류 아님)이고 호출 ${sun.calls}회 ≤ 50`);
  ok(fx.db.transactions.filter((t) => t.source === "recurring_auto").length === 3, "R1-B 정기 반영 단계는 그대로 그날 몫을 넣는다");
  eq(sun.log?.cleanup?.ok, true, "R1-B 리포트 단계 뒤 NLU 정리 단계도 돈다(몫을 남긴다)");
  const missing = ids.filter((id) => !afterSun.includes(id));
  const mon = await runCron(fx, "2026-11-30");
  ok(missing.every((id) => !!snapshot(fx, weeklyKey(id, "2026-11-29"))), `R1-B 월요일 실행은 아직 못 받은 가계부를 먼저 처리한다 (남은 ${missing.filter((id) => !snapshot(fx, weeklyKey(id, "2026-11-29"))).join(",") || "없음"})`);
  ok(mon.calls <= 50, `R1-B 월요일 실행 호출 ${mon.calls}회 ≤ 50`);
  let day = "2026-12-01", runs = 0, last = mon;
  while (last.log?.reports?.pending_scopes && runs < 5) { last = await runCron(fx, day); ok(last.calls <= 50, `R1-B ${day} 실행 호출 ${last.calls}회 ≤ 50`); day = `2026-12-0${2 + runs}`; runs += 1; }
  ok(!last.log?.reports?.pending_scopes && runs <= 2, `R1-B 30개 주간 확정도 며칠 안에 끝난다 (추가 실행 ${runs}번)`);
  eq(has().length, 30, "R1-B 서른 가계부 모두 주간 스냅숏이 있다");
});

// ── R-1-C: 기록이 많은 가계부는 한 실행 기록 행 상한(2,000행, CPU 10ms 대비)을 넘기면 다음 가계부를 시작하지 않고 다음 날 잇는다 ─────
// 첫 가계부는 상한보다 많아도 늘 처리한다(여기서는 1,500행 가계부 둘: 1,500 < 2,000 이라 둘째도 시작하고, 3,000 에서 멈춘다).
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  const big = ["r1c-a1", "r1c-a2"], small = ["r1c-b1", "r1c-b2", "r1c-b3"];
  for (const id of big) {
    seedHousehold(fx, id, { weekly: true });
    for (let n = 0; n < 1500; n += 1) addTx(fx, id, `2026-11-${String(23 + (n % 7)).padStart(2, "0")}`, 1000 + n, `bulk${n}`);
  }
  for (const id of small) seedHousehold(fx, id, { weekly: true, tx: [["2026-11-25", 4000]] });
  putState(fx, { checked_date: "2026-11-28", pending_month: "" });
  const sun = await runCron(fx, "2026-11-29");
  ok(big.every((id) => snapshot(fx, weeklyKey(id, "2026-11-29"))?.transaction_count === 1500), "R1-C 기록 1,500건 가계부 둘을 만든다(쪽마다 1,000행 조회)");
  ok(small.every((id) => !snapshot(fx, weeklyKey(id, "2026-11-29"))), "R1-C 기록 행 상한을 넘은 뒤에는 다음 가계부를 시작하지 않는다");
  ok(sun.calls <= 50 && sun.log?.status === "partial" && sun.log?.reports?.pending_scopes === 1, `R1-C 행 상한으로 멈춘 실행은 일부 남음이고 다 못 돈 범위 1개를 적는다 (호출 ${sun.calls}회·${JSON.stringify(sun.log?.reports)})`);
  const mon = await runCron(fx, "2026-11-30");
  ok(small.every((id) => snapshot(fx, weeklyKey(id, "2026-11-29"))?.transaction_count === 1), "R1-C 다음 날 남은 가계부를 먼저 처리한다");
  ok(mon.calls <= 50 && !mon.log?.reports?.pending_scopes, `R1-C 월요일 실행 호출 ${mon.calls}회 ≤ 50, 다 못 돈 범위 없음`);
  ok(big.every((id) => snapshot(fx, weeklyKey(id, "2026-11-29"))?.transaction_count === 1500), "R1-C 확정이 큰 가계부 스냅숏을 그대로 둔다(기록 그대로)");
});

// ── R-1-D: 일요일 실행이 없었으면(장애) 다음 실행이 그 주를 확정으로 만든다. 같은 날 두 번 돌아도 범위를 다시 넣지 않는다 ─────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  for (const id of ["r1d-h1", "r1d-h2"]) seedHousehold(fx, id, { weekly: true, tx: [["2026-11-18", 6000]] });
  putState(fx, { checked_date: "2026-11-14", pending_month: "" });
  await runCron(fx, "2026-11-15"); // 일요일: 11/9~15 주
  await runCron(fx, "2026-11-16");
  await runCron(fx, "2026-11-21");
  // 11/22(일)·11/23(월) 실행이 없었다.
  const tue = await runCron(fx, "2026-11-24");
  ok(["r1d-h1", "r1d-h2"].every((id) => snapshot(fx, weeklyKey(id, "2026-11-22"))?.transaction_count === 1), "R1-D 빠진 일요일(11/22)의 주간 스냅숏을 11/24 실행이 만든다 (예전: 그 주는 만들지 않았다)");
  ok(tue.calls <= 50 && !tue.log?.reports?.pending_scopes, "R1-D 따라잡은 뒤 남은 범위가 없다");
  const again = await runCron(fx, "2026-11-24", { hm: "15:00" });
  eq(again.snapshotLookups, 0, "R1-D 같은 날 두 번째 실행은 범위를 다시 넣지 않는다");
});

// ── R-1-E: 커서는 예전 코드도 읽는 모양이다(되돌려도 범위 형식 오류가 나지 않는다). 수동 생성 요청(HTTP)도 그대로다 ─────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "r1e-h1", { weekly: true, monthly: true, tx: [["2026-10-30", 5000]] });
  putState(fx, { checked_date: "2026-10-30", pending_month: "" });
  await runCron(fx, "2026-10-31");
  const cursor = cursorOf(fx);
  const legacyOk = Array.isArray(cursor?.scopes) && cursor.scopes.every((scope) => /^\d{4}-\d{2}-\d{2}$/.test(scope.date) && typeof scope.after === "string" && [scope.force, scope.weekly, scope.monthly].every((flag) => typeof flag === "boolean"));
  ok(legacyOk && cursor.scopes.length === 1 && cursor.scopes[0].final === true && cursor.scopes[0].monthly === true, `R1-E 말일 미리 보기 뒤 확정 범위가 예전 코드도 읽는 칸으로 남는다 (${JSON.stringify(cursor)})`);
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-31", "11:00");
  const result = await runAutomaticReports(fx.env, { today: "2026-10-31", lock: false });
  ok(result.ok && result.partial && result.pending_scopes === 0 && result.generated === 0 && cursorOf(fx)?.scopes?.length === 1, `R1-E 같은 날 다시 불러도 확정 범위는 다음 날까지 기다린다 (${JSON.stringify(result)})`);
  const preview = snapshot(fx, monthlyKey("r1e-h1", "2026-10"));
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-01", "08:00");
  const response = await app.fetch(new Request("https://malhaebook.com/cron/reports/generate?today=2026-11-01", { method: "POST", headers: { "x-cron-secret": "c" } }), { ...fx.env, CRON_SECRET: "c" }, { waitUntil() {}, passThroughOnException() {} });
  const body = await response.json();
  ok(response.status === 200 && body.ok && body.today === "2026-10-31" && body.invocation_date === "2026-11-01" && !body.pending_scopes, `R1-E 수동 생성 요청이 11/1 에 10월 확정을 끝낸다 (${response.status} ${JSON.stringify(body)})`);
  ok(JSON.stringify(snapshot(fx, monthlyKey("r1e-h1", "2026-10"))) === JSON.stringify(preview), "R1-E 기록이 그대로면 10월 월간 미리 보기를 다시 쓰지 않는다");
  eq(snapshot(fx, weeklyKey("r1e-h1", "2026-11-01"))?.transaction_count, 1, "R1-E 같은 요청이 11/1(일) 주간 미리 보기를 만든다");
  const left = cursorOf(fx)?.scopes || [];
  ok(left.length === 1 && left[0].date === "2026-11-01" && left[0].final === true && left[0].weekly === true && left[0].monthly === false, `R1-E 남은 범위는 11/1 주간 확정 하나다 (${JSON.stringify(left)})`);
  // 실제 오늘(11/1 08:00)보다 뒤 날짜로 부른 수동 요청은 pushed 를 앞날로 옮기지 않는다(옮기면 그날까지 예약 실행이 범위를 넣지 않는다).
  await runAutomaticReports(fx.env, { today: "2026-11-30", lock: false });
  eq(cursorOf(fx)?.pushed, "2026-11-01", "R1-E 앞날 today 수동 요청은 pushed 를 옮기지 않는다");
});

// ── R-1-F: 옛 코드가 다 못 돈 말일 범위(커서 after = 둘째 가계부)는 새 달 첫 실행이 확정으로 잇는다. 스냅숏이 없는 가계부부터 만든다 ─────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  for (const id of ["r1f-h1", "r1f-h2", "r1f-h3"]) seedHousehold(fx, id, { monthly: true, tx: [["2026-10-12", 10000]] });
  // 옛 코드(V22.9.93)가 10/31 에 h1·h2 를 만들고 h3 앞에서 멈췄다. 그 뒤 h1 에 10/31 저녁 기록이 들어왔다.
  for (const id of ["r1f-h1", "r1f-h2"]) putSetting(fx, monthlyKey(id, "2026-10"), staleMonthly(id, "2026-10", 10000, 1).replace('"2026-10-30T00:10:00.000Z"', '"2026-10-31T00:10:00.000Z"'));
  addTx(fx, "r1f-h1", "2026-10-31", 3000, "late");
  putSetting(fx, CURSOR_KEY, JSON.stringify({ scopes: [{ date: "2026-10-31", after: "free_report_preference:r1f-h2", force: false, weekly: false, monthly: true }] }));
  putState(fx, { checked_date: "2026-10-31", pending_month: "" });
  const order = [];
  const run = await runCron(fx, "2026-11-01", {
    handler: (request) => {
      const hid = /^eq\.(r1f-h\d)$/.exec(request.url.searchParams.get("household_id") || "")?.[1];
      if (request.method === "GET" && request.url.pathname.endsWith("/transactions") && hid) order.push(hid);
      return null;
    },
  });
  eq(order.join(","), "r1f-h3,r1f-h1,r1f-h2", "R1-F 스냅숏이 없는 h3 를 먼저 만들고 미리 보기만 있는 h1·h2 를 뒤에 확정한다");
  eq(snapshot(fx, monthlyKey("r1f-h3", "2026-10"))?.transaction_count, 1, "R1-F 옛 범위에서 빠진 h3 의 10월 스냅숏을 만든다");
  const h1 = snapshot(fx, monthlyKey("r1f-h1", "2026-10"));
  ok(h1?.transaction_count === 2 && h1?.expense === 13000, `R1-F h1 확정은 말일 저녁 기록까지 담는다 (${h1?.transaction_count}건·${h1?.expense}원)`);
  ok(run.calls <= 50 && run.log?.status === "ok" && !run.log?.reports?.pending_scopes, `R1-F 한 실행에 끝나고 호출 ${run.calls}회 ≤ 50`);
  ok(!(cursorOf(fx)?.scopes || []).some((scope) => scope.date === "2026-10-31"), "R1-F 10월 말일 범위는 남지 않는다");
});

if (failures.length) {
  for (const failure of failures) console.log(`실패: ${failure}`);
  console.log(`V22.9.94 예약 실행 검사 실패 ${failures.length}건 (${checks} checks)`);
  process.exit(1);
}
console.log(`V22.9.94 예약 실행 검사 통과 (${checks} checks)`);
