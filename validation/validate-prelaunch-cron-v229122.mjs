// V22.9.122 출시 전 점검(2026-11-14) — 예약 실행(cron) 결함 고침 검사. 오프라인(번들 + 픽스처), 시계는 아래 가짜 시계로 고정한다.
// T-1: 말일 예약 실행(09:10) 뒤에 만들거나 다시 켠 정기 규칙은 그 달 몫이 영영 빠졌다(다른 날 만든 규칙은 다음 날 실행이 넣는다).
//      이제 말일에 저장하면 저장 직후 그 달 몫을 한 번만 넣는다(웹 /my/recurring/save, 관리 /admin/recurring/save, 후보 확정 /my/recurring/from-candidate).
// SCALE-2: 정기 반영이 40개 가계부의 참여자를 한 번에 제한 없이 읽어 PostgREST 1,000행 상한에 잘린 가계부의 규칙이 ‘건너뜀’이 됐다.
// SCALE-1: 자동 리포트 커서에서 제날 한 가계부도 돌지 못한 미리 보기의 확정이 refresh 로 적혀 맨 뒤로 밀렸다(밀린 실행에서 월말·일부 주간 0개).
// 실행: node validation/validate-prelaunch-cron-v229122.mjs  (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
const RealDate = globalThis.Date;
let fakeNow = null;
class FakeDate extends RealDate {
  constructor(...args) { if (args.length === 0) super(fakeNow ?? RealDate.now()); else super(...args); }
  static now() { return fakeNow ?? RealDate.now(); }
}
const previousFixedNow = globalThis.__AB_QA_FIXED_NOW_MS;
// 번들이 Date 를 읽기 전에 바꾼다(픽스처가 만든 시각 created_at 도 같은 가짜 시각이 되게). 끝에서 되돌린다.
globalThis.Date = FakeDate;
const { app, fixture, post, page, counter, intercept, failure, putSetting } = await import("./lib-audit-v22934.mjs");
const { runAutomaticReports } = await import("../src/index.js");

const check = counter("prelaunch cron fixes");
const KST = (ymd, hm = "12:00") => `${ymd}T${hm}:00+09:00`;
function setNow(ymd, hm = "12:00") { fakeNow = RealDate.parse(KST(ymd, hm)); globalThis.__AB_QA_FIXED_NOW_MS = fakeNow; }
function resetRuntime() {
  for (const key of Object.keys(globalThis)) {
    if (key.startsWith("__AB_") && key !== "__AB_QA_FIXED_NOW_MS" && key !== "__AB_CATEGORY_TABLE_ABSENT_UNTIL") delete globalThis[key];
  }
}
async function runCron(fx, ymd, hm = "09:10") {
  setNow(ymd, hm);
  const pending = [];
  await app.scheduled({ cron: "10 0 * * *", scheduledTime: RealDate.parse(KST(ymd, hm)) }, fx.env, { waitUntil(job) { pending.push(job); } });
  for (const job of pending) { try { await job; } catch (_) {} }
}
const HOME = "house-home";
function addedRules(fx, before) { return fx.db.accountbook_recurring.filter((rule) => !before.has(rule.id)); }
async function saveWeb(fx, ymd, hm, fields) {
  setNow(ymd, hm);
  fx.cookie = await fx.cookieFor("user-bin");
  const before = new Set(fx.db.accountbook_recurring.map((rule) => rule.id));
  const res = await post(fx, "/my/recurring/save", { household_id: HOME, month: ymd.slice(0, 7), type: "expense", category: "주거/관리", payment_method: "", amount: "50000", ...fields });
  return { res, rule: addedRules(fx, before)[0] || null };
}
// 규칙 하나가 받은 자동 기록("YYYY-MM@날짜", 정렬).
const shares = (fx, id) => fx.db.transactions
  .filter((row) => row.source === "recurring_auto" && String(row.raw_text || "").startsWith(`recurring:${id}:`))
  .map((row) => `${String(row.raw_text).split(":").pop()}@${row.transaction_date}`).sort();
const markerOf = (fx, id) => fx.db.accountbook_recurring.find((rule) => rule.id === id)?.last_applied_month ?? null;
const strip = (html) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
const savedOk = (res) => res.status === 303 && /msg=recurring_(saved|registered)/.test(res.location) && !/err=/.test(res.location);

try {
  // ── T-1-A 감사 재현: 12-20 에 만든 규칙은 다음 날 실행이 넣고(저장 직후에는 넣지 않는다 = 말일이 아닌 날은 예전 그대로),
  //    12-31 예약 실행 뒤(12:00)에 만든 규칙(지정일 5일·31일)은 저장 직후 12월 몫을 받는다. 새 달 실행이 두 번 넣지 않는다.
  resetRuntime();
  setNow("2026-12-01", "09:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [];
    await runCron(fx, "2026-12-20");
    const a = await saveWeb(fx, "2026-12-20", "12:00", { memo: "월세A-20일", day_of_month: "5" });
    check.ok(savedOk(a.res) && a.rule, "T-1-A 12-20 규칙 저장 성공");
    check.deepEq(shares(fx, a.rule.id), [], "T-1-A 말일이 아닌 날 저장은 저장 직후 기록을 넣지 않는다(예전처럼 다음 날 실행이 넣는다)");
    await runCron(fx, "2026-12-21");
    check.deepEq(shares(fx, a.rule.id), ["2026-12@2026-12-05"], "T-1-A 12-20 에 만든 5일 규칙은 12-21 실행이 12월 몫(12-05)을 넣는다");
    await runCron(fx, "2026-12-30");
    await runCron(fx, "2026-12-31");
    const c = await saveWeb(fx, "2026-12-31", "12:00", { memo: "월세C-31일", day_of_month: "5" });
    const d = await saveWeb(fx, "2026-12-31", "12:01", { memo: "관리비D-31일", day_of_month: "31" });
    check.ok(savedOk(c.res) && savedOk(d.res) && c.rule && d.rule, "T-1-A 12-31 규칙 두 개 저장 성공(안내는 예전과 같은 recurring_saved)");
    check.deepEq(shares(fx, c.rule.id), ["2026-12@2026-12-05"], "T-1-A 말일 실행 뒤에 만든 5일 규칙은 저장 직후 12월 몫(12-05)을 받는다");
    check.deepEq(shares(fx, d.rule.id), ["2026-12@2026-12-31"], "T-1-A 말일 실행 뒤에 만든 31일 규칙은 저장 직후 12월 몫(12-31)을 받는다");
    check.eq(markerOf(fx, c.rule.id), "2026-12", "T-1-A 5일 규칙의 반영 표식은 2026-12");
    check.eq(markerOf(fx, d.rule.id), "2026-12", "T-1-A 31일 규칙의 반영 표식은 2026-12");
    setNow("2026-12-31", "20:00");
    fx.cookie = await fx.cookieFor("user-bin");
    const home = strip((await page(fx, `/app?household_id=${HOME}`)).html);
    check.ok(!/아직 안 나감/.test(home) && /모두 기록됐어요/.test(home), "T-1-A 그날 저녁 홈은 ‘이번 달 나갈 항목은 모두 기록됐어요’(예전: ‘아직 안 나감 … 관리비D’)");
    await runCron(fx, "2027-01-01");
    await runCron(fx, "2027-01-02");
    check.deepEq(shares(fx, c.rule.id), ["2026-12@2026-12-05"], "T-1-A 새 달 실행 뒤에도 5일 규칙의 12월 몫은 한 건(1월 몫은 1월 5일에)");
    check.deepEq(shares(fx, d.rule.id), ["2026-12@2026-12-31"], "T-1-A 새 달 실행 뒤에도 31일 규칙의 12월 몫은 한 건");
    const perMonth = new Map();
    for (const row of fx.db.transactions.filter((item) => item.source === "recurring_auto")) perMonth.set(row.raw_text, (perMonth.get(row.raw_text) || 0) + 1);
    check.ok([...perMonth.values()].every((count) => count === 1), "T-1-A 어떤 규칙·달도 자동 기록이 두 건이 아니다");
  });

  // ── T-1-B 첫 실제 말일(2026-11-30): 09:10 실행 뒤 15:00 에 만든 30일·1일 규칙은 11월 몫을 저장 직후 받고, 12-01 실행은 12월 몫만 넣는다.
  resetRuntime();
  setNow("2026-11-30", "09:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [];
    await runCron(fx, "2026-11-29");
    await runCron(fx, "2026-11-30");
    const r30 = await saveWeb(fx, "2026-11-30", "15:00", { memo: "통신비-30일", day_of_month: "30" });
    const r1 = await saveWeb(fx, "2026-11-30", "15:01", { memo: "보험료-1일", day_of_month: "1" });
    check.deepEq(shares(fx, r30.rule.id), ["2026-11@2026-11-30"], "T-1-B 11-30 실행 뒤에 만든 30일 규칙은 11월 몫(11-30)을 받는다");
    check.deepEq(shares(fx, r1.rule.id), ["2026-11@2026-11-01"], "T-1-B 11-30 실행 뒤에 만든 1일 규칙도 11월 몫(11-01)을 받는다(다른 날 만든 규칙의 다음 날 반영과 같은 날짜 규칙)");
    await runCron(fx, "2026-12-01");
    check.deepEq(shares(fx, r30.rule.id), ["2026-11@2026-11-30"], "T-1-B 12-01 실행은 30일 규칙의 11월 몫을 다시 넣지 않는다");
    check.deepEq(shares(fx, r1.rule.id), ["2026-11@2026-11-01", "2026-12@2026-12-01"], "T-1-B 12-01 실행은 1일 규칙의 12월 몫만 넣는다");
  });

  // ── T-1-C 관리 화면 저장(/admin/recurring/save)과 T-1-D 후보 확정(/my/recurring/from-candidate)도 말일 실행 뒤면 저장 직후 넣는다.
  resetRuntime();
  setNow("2026-12-31", "09:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [];
    await runCron(fx, "2026-12-30");
    await runCron(fx, "2026-12-31");
    setNow("2026-12-31", "14:00");
    fx.cookie = await fx.cookieFor("user-bin");
    let before = new Set(fx.db.accountbook_recurring.map((rule) => rule.id));
    const adminRes = await post(fx, "/admin/recurring/save", { household_id: HOME, month: "2026-12", type: "expense", amount: "70000", category: "교육", memo: "학원비-관리", payment_method: "계좌이체", day_of_month: "25", user_id: "user-wifi" });
    const adminRule = addedRules(fx, before)[0];
    check.ok(adminRes.status === 303 && /msg=recurring_saved/.test(adminRes.location) && adminRule, "T-1-C 관리 화면 저장 성공");
    check.deepEq(shares(fx, adminRule.id), ["2026-12@2026-12-25"], "T-1-C 말일 실행 뒤 관리 화면에서 만든 규칙은 저장 직후 12월 몫(12-25)을 받는다");
    check.eq(fx.db.transactions.find((row) => String(row.raw_text) === `recurring:${adminRule.id}:2026-12`)?.user_id, "user-wifi", "T-1-C 그 기록의 지출자는 규칙의 지출자(user-wifi)");
    setNow("2026-12-31", "14:05");
    before = new Set(fx.db.accountbook_recurring.map((rule) => rule.id));
    const candRes = await post(fx, "/my/recurring/from-candidate", { household_id: HOME, month: "2026-12", confirmed: "yes", memo: "넷플릭스-후보", amount: "13500", category: "정기지출", payment_method: "현대카드", day_of_month: "3" });
    const candRule = addedRules(fx, before)[0];
    check.ok(candRes.status === 303 && /msg=recurring_registered/.test(candRes.location) && candRule, "T-1-D 후보 확정 성공");
    check.deepEq(shares(fx, candRule.id), ["2026-12@2026-12-03"], "T-1-D 말일 실행 뒤 확정한 후보 규칙은 저장 직후 12월 몫(12-03)을 받는다");
    await runCron(fx, "2027-01-01");
    check.deepEq([shares(fx, adminRule.id), shares(fx, candRule.id)], [["2026-12@2026-12-25"], ["2026-12@2026-12-03"]], "T-1-C/D 새 달 실행이 12월 몫을 다시 넣지 않는다");
  });

  // ── T-1-E 꺼 둔 규칙을 말일 실행 뒤에 고쳐 다시 켜면(웹 저장은 늘 켬) 그 달 몫을 저장 직후 한 번 넣는다.
  //    T-1-F 말일 실행 전(08:00)에 만든 규칙은 저장 직후 넣고, 09:10 실행은 표식을 보고 다시 넣지 않는다.
  resetRuntime();
  setNow("2026-12-30", "09:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [{ id: "rule-paused", household_id: HOME, type: "expense", amount: 40000, category: "구독", memo: "헬스장", payment_method: "카드", day_of_month: 10, user_id: "user-bin", is_active: false, last_applied_month: "2026-11", created_at: "2026-10-01T00:00:00.000Z" }];
    await runCron(fx, "2026-12-30");
    const early = await saveWeb(fx, "2026-12-31", "08:00", { memo: "가스비-이른", day_of_month: "20" });
    check.deepEq(shares(fx, early.rule.id), ["2026-12@2026-12-20"], "T-1-F 말일 실행 전에 만든 규칙도 저장 직후 12월 몫을 받는다");
    await runCron(fx, "2026-12-31");
    check.deepEq(shares(fx, early.rule.id), ["2026-12@2026-12-20"], "T-1-F 그날 09:10 실행은 같은 몫을 다시 넣지 않는다");
    check.deepEq(shares(fx, "rule-paused"), [], "T-1-E 꺼 둔 규칙은 말일 실행이 넣지 않는다");
    const edit = await saveWeb(fx, "2026-12-31", "16:00", { id: "rule-paused", memo: "헬스장", amount: "40000", category: "구독", day_of_month: "10" });
    check.ok(savedOk(edit.res), "T-1-E 꺼 둔 규칙 고치기(다시 켜기) 저장 성공");
    check.eq(fx.db.accountbook_recurring.find((rule) => rule.id === "rule-paused")?.is_active, true, "T-1-E 저장 뒤 규칙은 켜져 있다");
    check.deepEq(shares(fx, "rule-paused"), ["2026-12@2026-12-10"], "T-1-E 말일 실행 뒤에 다시 켠 규칙은 저장 직후 12월 몫(12-10)을 받는다");
    await runCron(fx, "2027-01-01");
    check.deepEq(shares(fx, "rule-paused"), ["2026-12@2026-12-10"], "T-1-E 새 달 실행이 12월 몫을 다시 넣지 않는다");
  });

  // ── T-1-G 지난달 따라잡기가 끝나지 않은 상태(checked_date 가 지난달 안)면 저장 직후 넣지 않고, 다음 날 따라잡기가 12월 몫을 한 번 넣는다.
  //    T-1-I 같은 지출자가 이번 달 같은 기록을 이미 적었으면(표식 = 이번 달) 넣지 않는다. T-1-J 두 번 보낸 저장은 규칙·기록 한 건.
  resetRuntime();
  setNow("2026-12-31", "12:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [];
    putSetting(fx, "cron_recurring_state_v22976", JSON.stringify({ rev: 5, checked_date: "2026-11-15", pending_month: "2026-11" }));
    const g = await saveWeb(fx, "2026-12-31", "12:00", { memo: "수도료-따라잡기", day_of_month: "5" });
    check.deepEq(shares(fx, g.rule.id), [], "T-1-G 지난달 따라잡기가 남은 상태에서는 저장 직후 넣지 않는다(지난달 몫을 먼저 넣는 실행 순서를 지킨다)");
    fx.db.transactions.push({ id: "tx-dec-mgmt", household_id: HOME, user_id: "user-bin", transaction_date: "2026-12-10", type: "expense", amount: 80000, category: "주거/관리", memo: "관리비", payment_method: "", source: "web", raw_text: "관리비 80000" });
    putSetting(fx, "cron_recurring_state_v22976", JSON.stringify({ rev: 6, checked_date: "2026-12-31", pending_month: "" }));
    const i = await saveWeb(fx, "2026-12-31", "12:10", { memo: "관리비", amount: "80000", day_of_month: "10" });
    check.eq(markerOf(fx, i.rule.id), "2026-12", "T-1-I 이번 달 같은 기록이 있으면 표식이 이번 달");
    check.deepEq(shares(fx, i.rule.id), [], "T-1-I 이미 적은 이번 달 몫은 다시 넣지 않는다");
    const j1 = await saveWeb(fx, "2026-12-31", "12:20", { memo: "주차비-두번", amount: "30000", day_of_month: "15" });
    const j2 = await saveWeb(fx, "2026-12-31", "12:21", { memo: "주차비-두번", amount: "30000", day_of_month: "15" });
    check.ok(j1.rule && !j2.rule && savedOk(j2.res), "T-1-J 두 번 보낸 같은 저장은 규칙 한 개");
    check.deepEq(shares(fx, j1.rule.id), ["2026-12@2026-12-15"], "T-1-J 두 번 보낸 저장도 12월 몫은 한 건");
    putSetting(fx, "cron_recurring_state_v22976", JSON.stringify({ rev: 7, checked_date: "2026-11-15", pending_month: "2026-11" }));
    await runCron(fx, "2027-01-01");
    check.deepEq(shares(fx, g.rule.id), ["2026-12@2026-12-05"], "T-1-G 다음 날 따라잡기가 12월 몫(12-05)을 한 번 넣는다");
    check.deepEq([shares(fx, i.rule.id), shares(fx, j1.rule.id)], [[], ["2026-12@2026-12-15"]], "T-1-G/I/J 따라잡기가 이미 넣었거나 적은 몫을 다시 넣지 않는다");
  });

  // ── T-1-K 2월 말일(28일): 실행 뒤 만든 31일 규칙은 2월 몫을 말일(02-28)로 받는다. T-1-L 기록 저장이 실패해도 규칙 저장은 성공으로 끝난다.
  resetRuntime();
  setNow("2027-02-28", "12:00");
  await fixture(async (fx) => {
    fx.db.accountbook_recurring = [];
    putSetting(fx, "cron_recurring_state_v22976", JSON.stringify({ rev: 3, checked_date: "2027-02-28", pending_month: "" }));
    const k = await saveWeb(fx, "2027-02-28", "13:00", { memo: "적금-31일", day_of_month: "31" });
    check.deepEq(shares(fx, k.rule.id), ["2027-02@2027-02-28"], "T-1-K 2월 말일 실행 뒤에 만든 31일 규칙은 2월 몫을 02-28 로 받는다");
    const restore = intercept(({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/transactions" ? failure(400, "insert rejected") : null));
    let l;
    try { l = await saveWeb(fx, "2027-02-28", "13:30", { memo: "보험-실패", day_of_month: "20" }); } finally { restore(); }
    check.ok(savedOk(l.res) && l.rule, "T-1-L 이번 달 몫 저장이 거절돼도 규칙 저장은 성공 안내로 끝난다(규칙은 남는다)");
    check.deepEq(shares(fx, l.rule.id), [], "T-1-L 거절된 몫은 기록되지 않고 표식도 그대로");
    check.eq(markerOf(fx, l.rule.id), null, "T-1-L 표식은 비어 있다(수동 ‘기록하기’로 넣을 수 있다)");
    await runCron(fx, "2027-03-01");
    check.deepEq(shares(fx, k.rule.id), ["2027-02@2027-02-28"], "T-1-K 3-01 실행은 2월 몫을 다시 넣지 않는다");
  });

  // ── SCALE-2 참여자 30명 가계부 40개(규칙 40개 = 한 묶음)를 PostgREST 1,000행 상한(__max_rows)으로 돌린다. 예전에는 한 번에 1,200행을 읽다 잘려
  //    6개 가계부의 규칙이 ‘건너뜀’이었다. 12-02 실행: 1일 규칙 40개가 첫 묶음, 첫 묶음에서 본 가계부의 다른 지출자 2일 규칙 3개가 둘째 묶음
  //    (구성원 → 넣음, 조회 전용·참여자 아님 → 건너뜀 — 짝으로 기억해도 묶음을 건너 다시 묻는지 본다).
  resetRuntime();
  setNow("2026-12-02", "09:00");
  await fixture(async (fx) => {
    fx.db.__max_rows = 1000;
    fx.db.accountbook_recurring = [];
    const H = 40, M = 30;
    for (let i = 0; i < H; i += 1) {
      const id = String(i).padStart(3, "0"); const hid = `hh-room-${id}`;
      fx.db.households.push({ id: hid, name: `모임${id}`, invite_code: `RM${id}`, created_at: "2026-10-01T00:00:00.000Z" });
      for (let m = 0; m < M; m += 1) {
        const uid = `u-${id}-${m}`;
        fx.db.users.push({ id: uid, kakao_user_key: `kakao_bot:${id}${m}`, nickname: `회원${m}`, created_at: "2026-10-01T00:00:00.000Z" });
        fx.db.household_members.push({ household_id: hid, user_id: uid, role: m === 0 ? "owner" : m === 29 ? "viewer" : "member", created_at: "2026-10-02T00:00:00.000Z" });
      }
      fx.db.accountbook_recurring.push({ id: `rule-${id}`, household_id: hid, type: "expense", amount: 30000, category: "회비", memo: `모임 회비 ${id}`, payment_method: "계좌이체", day_of_month: 1, user_id: `u-${id}-0`, is_active: true, last_applied_month: "2026-11", created_at: "2026-10-01T00:00:00.000Z" });
    }
    const extra = [["rule-x-member", "hh-room-000", "u-000-5"], ["rule-x-viewer", "hh-room-001", "u-001-29"], ["rule-x-outsider", "hh-room-002", "u-003-1"]];
    for (const [id, hid, uid] of extra) fx.db.accountbook_recurring.push({ id, household_id: hid, type: "expense", amount: 10000, category: "회비", memo: id, payment_method: "", day_of_month: 2, user_id: uid, is_active: true, last_applied_month: "2026-11", created_at: "2026-10-01T00:00:00.000Z" });
    const memberReads = [];
    const restore = intercept(({ url, method }) => { if (method === "GET" && url.pathname === "/rest/v1/household_members" && url.searchParams.has("household_id") && /^in\./.test(url.searchParams.get("household_id") || "")) memberReads.push(url.searchParams.get("user_id") || ""); return null; });
    try { await runCron(fx, "2026-12-02"); } finally { restore(); }
    const decRooms = new Set(fx.db.transactions.filter((row) => /^recurring:rule-\d{3}:2026-12$/.test(String(row.raw_text || ""))).map((row) => row.household_id));
    check.eq(decRooms.size, H, "SCALE-2 1,000행 상한에서도 가계부 40개 모두 12월 회비가 들어간다(예전 34/40)");
    check.deepEq(["rule-x-member", "rule-x-viewer", "rule-x-outsider"].map((id) => shares(fx, id).length), [1, 0, 0], "SCALE-2 둘째 묶음: 첫 묶음에서 본 가계부의 구성원 규칙은 넣고, 조회 전용·참여자 아닌 지출자 규칙은 건너뛴다");
    const log = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "cron_run_log_v22978")?.value || "[]");
    const last = (Array.isArray(log) ? log : []).slice().sort((a, b) => String(a.started_at).localeCompare(String(b.started_at))).at(-1) || {};
    check.deepEq([last.recurring?.applied, last.recurring?.skipped, last.recurring?.failed], [41, 2, 0], "SCALE-2 실행 기록: 넣음 41, 건너뜀 2(조회 전용·참여자 아님), 실패 0");
    check.ok(memberReads.length >= 1 && memberReads.every((users) => /^in\./.test(users)), "SCALE-2 참여자 읽기는 묶음 규칙의 지출자만 묻는다(user_id=in.…)");
  });

  // ── SCALE-1 자동 리포트 커서: 제날에 한 가계부도 돌지 못한 미리 보기(11-29, after 없음)는 다음 날 확정으로 바뀔 때 refresh 가 아니다(스냅숏이 없는
  //    가계부를 만드는 범위라 날짜 순서로 먼저 돈다). 일부 돈 미리 보기(11-15)는 예전처럼 뒤쪽(새로 만듦)과 앞쪽(refresh)으로 나뉜다. 예산 0 으로 돌려
  //    아무 범위도 처리하지 않고 저장된 커서의 순서만 본다.
  resetRuntime();
  setNow("2026-11-30", "09:10");
  await fixture(async (fx) => {
    putSetting(fx, "cron_report_cursor_v22930", JSON.stringify({ scopes: [
      { date: "2026-11-15", after: "free_report_preference:hh-m", force: false, weekly: true, monthly: false },
      { date: "2026-11-22", after: "", force: false, weekly: true, monthly: false, final: true, refresh: true },
      { date: "2026-11-29", after: "", force: false, weekly: true, monthly: false },
    ], pushed: "2026-11-29" }));
    const outcome = await runAutomaticReports({ ...fx.env, __AB_DB_BUDGET: { used: 0, limit: 3 } }, { today: "2026-11-30", lock: false });
    check.eq(outcome.generated, 0, "SCALE-1 예산 0 실행은 아무것도 만들지 않는다");
    const scopes = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "cron_report_cursor_v22930")?.value || "{}").scopes || [];
    const label = (scope) => `${scope.date}${scope.final ? "F" : "P"}${scope.refresh ? "R" : ""}${scope.upto ? "u" : scope.after ? "a" : ""}`;
    check.ok(scopes.some((scope) => scope.date === "2026-11-29" && scope.final === true && !scope.refresh), "SCALE-1 제날 못 돈 11-29 미리 보기의 확정은 refresh 가 아니다");
    check.deepEq(scopes.map(label), ["2026-11-15Fa", "2026-11-29F", "2026-11-30P", "2026-11-15FRu", "2026-11-22FR"], "SCALE-1 스냅숏 없는 범위(날짜 순) → 오늘 미리 보기 → refresh 순서(예전: 11-29 가 refresh 로 맨 뒤)");
  });
} finally {
  globalThis.Date = RealDate;
  fakeNow = null;
  globalThis.__AB_QA_FIXED_NOW_MS = previousFixedNow;
}

check.done();
