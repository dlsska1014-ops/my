// V22.9.79 예약 실행 검사 (V78 S-4 말일 바퀴, V77 N-9 주간 스냅숏 다시 만들기, V77 N-10 규칙 수정 경로의 다시 만들기 실패).
// 메모리 픽스처(validation/qa-fixture.mjs)로 재현하며 네트워크를 쓰지 않는다.
//   S-4  정기 규칙 목록을 여러 실행에 걸쳐 이어 읽는 동안(쪽 한도 4쪽 × 500개), 남긴 자리 앞쪽에 새로 만든 규칙은 앞에서부터
//        다시 읽는 다음 바퀴에서만 보였다. 말일 실행이 자리를 이어 바퀴를 끝내면 checked_date 가 말일로 넘어가 그 규칙의 그 달
//        몫이 빠졌다. 이제 말일 실행과 새 달 따라잡기는 그 달 말일 이후에 앞에서부터 시작한 바퀴가 남긴 자리(started)만 잇고,
//        말일 전 바퀴의 자리는 버리고 앞에서부터 읽는다. 쪽 한도·저장소 호출 몫(50)은 그대로이고, 말일 전 실행이 남기는 자리는
//        V22.9.78 형식(네 칸) 그대로다(옛 코드는 started 를 읽지 않고 버린다).
//   N-9  따라잡기나 늦게 넣은 정기 기록이 이미 끝난 주(일요일 실행이 주간 스냅숏을 만든 주)에 들어가면 그 주 주간 스냅숏도 있으면
//        다시 만든다. 대기 항목은 "그 주 일요일|가계부"(옛 코드는 형식이 틀린 항목으로 보고 버린다)이고, 월간 대기 자리(N-17,
//        300개)는 월간 항목만 센다. 넘치면 주간 항목부터 잘린다.
//   N-10 정기 규칙 수정이 놓친 지난달 몫을 넣고 그 자리에서 스냅숏을 다시 만들지 못하면, 운영 이벤트만 남기지 않고 상태 키의
//        다시 만들기 대기(report_rebuild)에 보태 다음 예약 실행이 잇는다. 고친 내용 저장은 막지 않는다.
//   F-1  (V22.9.79 후속) 수동 반영 '기록하기'(/admin/recurring/apply)로 지난 달이나 이미 끝난 주에 넣은 기록은 그 기간 월간·
//        주간 스냅숏에 빠진 채 남았다(표식이 바뀌어 예약 실행도 다시 보지 않았다). 이제 같은 길로 두 개까지 그 자리에서 다시
//        만들고 남은 것·끝을 맺지 못한 반영은 대기에 넣는다. 오늘(일요일) 아침 실행이 만든 이번 주 스냅숏도 다시 만든다.
//   F-2  (V22.9.79 후속) 예약 실행 끝 상태 저장은 처음 읽은 상태로 계산한 값을 그대로 써서, 실행 중에 실행 밖에서 대기에 보탠
//        항목(F-1·N-10)을 지웠다. 이제 저장 바로 앞에 다시 읽어 새 항목을 붙이고, 다시 읽지 못하면 쓰지 않는다.
// 픽스처는 PostgREST 논리식(and·or)을 무시하고 지정일을 글자 순으로 정렬하므로, 정기 규칙 목록 조회는 V22.9.78 검사와 같은
// 작은 PostgREST 흉내(논리식·지정일 숫자 정렬·limit)로 답한다.
// 사용: node validation/validate-cron-v22979.mjs
import app from "../src/index.js";
import { counter, failure, fixture, intercept, post, putSetting, settingValue } from "./lib-audit-v22934.mjs";

const { ok, eq, deepEq, done } = counter("V22.9.79 예약 실행 말일 바퀴·주간 스냅숏·수정 경로 다시 만들기 검사 통과");
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const STATE_KEY = "cron_recurring_state_v22976";
const readJson = (value) => (value == null || value === "" ? null : typeof value === "string" ? JSON.parse(value) : value);
const stateOf = (fx) => readJson(settingValue(fx, STATE_KEY));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const outage = () => json({ message: "synthetic outage" }, 503);
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const applied = (fx, ruleId, month = "2026-10") => fx.db.transactions.filter((t) => t.source === "recurring_auto" && t.raw_text === `recurring:${ruleId}:${month}`);
// 주 번호는 앱(isoWeekPeriod)과 같은 ISO 주다. 날짜 문자열로 계산해 시간대와 상관없다.
const isoWeek = (ymd) => {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return `${d.getUTCFullYear()}-W${String(Math.ceil(((d - Date.UTC(d.getUTCFullYear(), 0, 1)) / 86400000 + 1) / 7)).padStart(2, "0")}`;
};
const monthlyKey = (hid, month = "2026-10") => `free_report_snapshot:${hid}:monthly:${month}`;
const weeklyKey = (hid, sunday) => `free_report_snapshot:${hid}:weekly:${isoWeek(sunday)}`;
const snapshot = (fx, key) => readJson(settingValue(fx, key));
// 스냅숏이 예전 것보다 넣은 기록만큼(금액·건수) 커졌고 기간은 같은지 본다.
const grew = (now, stale, amount, count) => !!now && !!stale && now.expense === stale.expense + amount && now.transaction_count === stale.transaction_count + count && now.period === stale.period;

// ── 정기 규칙 목록 조회용 작은 PostgREST 흉내(V22.9.78 검사와 같다) ───────────────────────────
function parseLogic(text) {
  let i = 0;
  const fail = () => { throw new Error(`logic parse error at ${i}: ${text}`); };
  const item = () => {
    for (const op of ["and", "or"]) if (text.startsWith(`${op}(`, i)) { i += op.length; return { op, items: list() }; }
    const dot1 = text.indexOf(".", i);
    const dot2 = dot1 < 0 ? -1 : text.indexOf(".", dot1 + 1);
    if (dot1 < 0 || dot2 < 0) fail();
    const column = text.slice(i, dot1);
    const operator = text.slice(dot1 + 1, dot2);
    i = dot2 + 1;
    let value = "";
    if (text[i] === "\"") {
      i += 1;
      while (text[i] !== "\"") { if (i >= text.length) fail(); if (text[i] === "\\") i += 1; value += text[i]; i += 1; }
      i += 1;
    } else {
      while (i < text.length && text[i] !== "," && text[i] !== ")") { value += text[i]; i += 1; }
    }
    return { column, operator, value };
  };
  const list = () => {
    if (text[i] !== "(") fail();
    i += 1;
    const items = [];
    for (;;) {
      items.push(item());
      if (text[i] === ",") { i += 1; continue; }
      if (text[i] === ")") { i += 1; return items; }
      fail();
    }
  };
  const items = list();
  if (i !== text.length) fail();
  return items;
}
const NUMERIC = new Set(["day_of_month", "amount"]);
const compareCell = (column, a, b) => {
  if (NUMERIC.has(column)) return Number(a) - Number(b);
  const x = String(a), y = String(b);
  return x < y ? -1 : x > y ? 1 : 0;
};
function testCell(row, { column, operator, value }) {
  const cell = row[column];
  if (operator === "is") return value === "null" ? cell == null : value === "true" ? cell === true : value === "false" ? cell === false : false;
  if (cell == null) return false;
  if (operator === "in") return value.replace(/^\(|\)$/g, "").split(",").map((part) => part.replace(/^"|"$/g, "")).includes(String(cell));
  const c = compareCell(column, cell, value);
  const result = { eq: c === 0, neq: c !== 0, gt: c > 0, gte: c >= 0, lt: c < 0, lte: c <= 0 }[operator];
  if (result === undefined) throw new Error(`unsupported operator ${operator}`);
  return result;
}
const evaluate = (row, node) => node.op === "and" ? node.items.every((child) => evaluate(row, child)) : node.op === "or" ? node.items.some((child) => evaluate(row, child)) : testCell(row, node);
function recurringQuery(rows, params) {
  let out = rows.filter((row) => {
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      if (key === "and" || key === "or") { if (!evaluate(row, { op: key, items: parseLogic(raw) })) return false; continue; }
      const negate = raw.startsWith("not.");
      const body = negate ? raw.slice(4) : raw;
      const dot = body.indexOf(".");
      const result = testCell(row, { column: key, operator: body.slice(0, dot), value: body.slice(dot + 1) });
      if (negate ? result : !result) return false;
    }
    return true;
  });
  const order = String(params.get("order") || "").split(",").filter(Boolean).map((part) => { const [column, dir = "asc"] = part.split("."); return { column, dir }; });
  out.sort((a, b) => { for (const { column, dir } of order) { const c = compareCell(column, a[column], b[column]); if (c) return dir === "desc" ? -c : c; } return 0; });
  const offset = Number(params.get("offset") || 0);
  out = out.slice(offset, params.has("limit") ? offset + Number(params.get("limit")) : undefined);
  const select = String(params.get("select") || "*");
  if (select === "*") return out;
  const columns = select.split(",");
  return out.map((row) => Object.fromEntries(columns.map((column) => [column, row[column] ?? null])));
}

// 예약 실행 한 번(정기 반영 + 자동 리포트 + NLU 정리 + 실행 기록)을 그날 09:10 KST 로 돌린다. 정기 규칙 목록 조회는 흉내로
// 답하고(failRecurringRead 면 장애), 저장소 호출 수·목록 쪽·스냅숏 조회를 센다.
async function runCron(fx, ymd, { failRecurringRead = false, handler = null } = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  const list = opsEvents();
  const mark = list[list.length - 1];
  const seen = { calls: 0, pages: [], snapshotReads: [] };
  const restore = intercept(async (request) => {
    const { url, method } = request;
    if (url.hostname !== "mock.supabase.co") return null;
    seen.calls += 1;
    if (handler) { const injected = await handler(request); if (injected) return injected; }
    if (method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.search.includes("free_report_snapshot")) seen.snapshotReads.push(decodeURIComponent(url.search));
    if (method === "GET" && url.pathname.endsWith("/accountbook_recurring")) {
      if (failRecurringRead) return outage();
      seen.pages.push(decodeURIComponent(url.search));
      return json(recurringQuery(fx.db.accountbook_recurring, url.searchParams));
    }
    return null;
  });
  let error = null;
  try {
    const pending = [];
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd) }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  } finally { restore(); }
  const after = opsEvents();
  const index = mark ? after.indexOf(mark) : -1;
  return { ...seen, error, events: after.slice(index + 1) };
}

function seedHousehold(fx, id, { viewer = false, weekly = false, monthly = false, tx = [] } = {}) {
  fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  if (viewer) fx.db.household_members.push({ household_id: id, user_id: "user-view", role: "viewer", created_at: "2026-07-01T00:00:00.000Z" });
  if (weekly || monthly) putSetting(fx, `free_report_preference:${id}`, JSON.stringify({ household_id: id, household_name: `${id} 가계부`, enabled: true, weekly, monthly }));
  for (const [date, amount] of tx) fx.db.transactions.push({ id: `${id}-${date}`, household_id: id, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo: "장보기", payment_method: "국민카드", source: "web", raw_text: `장보기 ${amount}원 ${date}`, created_at: `${date}T03:00:00Z` });
}

function seedRule(fx, rule) {
  const row = { type: "expense", amount: 10000, category: "구독", memo: "정기", payment_method: "", user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00+09:00", day_of_month: 1, ...rule };
  fx.db.accountbook_recurring.push(row);
  return row;
}

// 지출자가 조회 전용이라 매번 건너뛰는(표식이 그대로라 목록에 남는) 규칙 count 개. 쪽 한도(4쪽 × 500개)를 채운다.
function seedViewerRules(fx, householdId, prefix, count, rule = {}) {
  for (let n = 1; n <= count; n += 1) seedRule(fx, { id: `${prefix}-${String(n).padStart(5, "0")}`, household_id: householdId, amount: 12345, user_id: "user-view", ...rule });
}

const putState = (fx, state) => putSetting(fx, STATE_KEY, JSON.stringify(state));
const resumedAfter = (pageQuery, id) => String(pageQuery || "").includes(`id.gt."${id}"`);
const fromFront = (pageQuery) => !String(pageQuery || "").includes("and=");

// ── S-4-A: 말일 전 바퀴가 남긴 자리 앞에 새로 만든 규칙의 그 달 몫을 말일 실행이 넣는다 ─────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "s4-a", { viewer: true });
  seedViewerRules(fx, "s4-a", "a", 2200);
  putState(fx, { checked_date: "2026-10-29", pending_month: "" });
  const oct30 = await runCron(fx, "2026-10-30");
  eq(oct30.pages.length, 4, "S4-A 10/30 실행은 쪽 한도(4쪽)에서 멈춘다");
  deepEq(stateOf(fx).scan_after, [{ month: "2026-10", day: 1, household_id: "s4-a", id: "a-02000" }], "S4-A 말일 전 실행이 남긴 자리는 V22.9.78 형식(네 칸) 그대로다");
  // 10/30 실행 뒤에 만든 규칙. 순서(지정일·가계부·id)가 남긴 자리보다 앞이다.
  seedRule(fx, { id: "a-00000", household_id: "s4-a", amount: 15000, memo: "새 구독", last_applied_month: null, created_at: "2026-10-30T13:00:00+09:00" });
  const oct31 = await runCron(fx, "2026-10-31");
  ok(fromFront(oct31.pages[0]), `S4-A 말일 실행은 말일 전 바퀴의 자리를 잇지 않고 앞에서부터 읽는다 (${String(oct31.pages[0]).slice(0, 160)})`);
  eq(applied(fx, "a-00000").length, 1, "S4-A 말일 실행이 자리 앞에 새로 만든 규칙의 10월 몫을 넣는다 (예전: 자리 뒤만 읽고 바퀴를 끝내 10월 몫이 빠졌다)");
  eq(applied(fx, "a-00000")[0]?.transaction_date, "2026-10-01", "S4-A 넣은 10월 몫은 지정일(10/1) 날짜다");
  ok(oct31.pages.length <= 4 && oct31.calls <= 50, `S4-A 말일 실행도 쪽 한도 4쪽·저장소 호출 50회 안이다 (${oct31.pages.length}쪽·${oct31.calls}회)`);
  const s31 = stateOf(fx);
  deepEq(s31.scan_after, [{ month: "2026-10", day: 1, household_id: "s4-a", id: "a-01999", started: "2026-10-31" }], "S4-A 말일에 앞에서부터 시작한 바퀴의 자리는 시작한 날(started)을 함께 적는다");
  ok(s31.checked_date < "2026-10-31" && s31.pending_month === "2026-10", `S4-A 바퀴를 끝내지 못한 말일 실행은 checked_date 를 말일로 옮기지 않는다 (${s31.checked_date}·${s31.pending_month})`);
  ok(fx.db.accountbook_recurring.filter((r) => r.user_id === "user-view").every((r) => r.last_applied_month === "2026-09"), "S4-A 건너뛴 규칙의 표식은 그대로다");
  const nov1 = await runCron(fx, "2026-11-01");
  ok(resumedAfter(nov1.pages[0], "a-01999") && nov1.pages[0].includes("last_applied_month.lt.2026-10"), `S4-A 11/1 따라잡기는 말일에 시작한 바퀴의 자리 뒤부터 읽는다 (${String(nov1.pages[0]).slice(0, 160)})`);
  eq(applied(fx, "a-00000").length, 1, "S4-A 10월 몫은 한 번만 들어간다");
  eq(stateOf(fx).checked_date, "2026-10-31", "S4-A 따라잡기가 바퀴를 끝내면 checked_date 는 10월 말일이다");
  ok(nov1.pages.length <= 4 && nov1.calls <= 50, `S4-A 11/1 실행도 쪽 한도·호출 몫 안이다 (${nov1.pages.length}쪽·${nov1.calls}회)`);
});

// ── S-4-B: 말일 실행이 없었으면(장애) 새 달 따라잡기가 말일 전 바퀴의 자리를 버리고 앞에서부터 읽는다 ──────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "s4-b", { viewer: true });
  seedViewerRules(fx, "s4-b", "b", 2200);
  putState(fx, { checked_date: "2026-10-28", pending_month: "" });
  await runCron(fx, "2026-10-29");
  deepEq(stateOf(fx).scan_after, [{ month: "2026-10", day: 1, household_id: "s4-b", id: "b-02000" }], "S4-B 10/29 실행이 말일 전 자리를 남긴다");
  seedRule(fx, { id: "b-00000", household_id: "s4-b", amount: 21000, memo: "새 보험", last_applied_month: null, created_at: "2026-10-29T15:00:00+09:00" });
  for (const day of ["2026-10-30", "2026-10-31"]) await runCron(fx, day, { failRecurringRead: true });
  const nov1 = await runCron(fx, "2026-11-01");
  ok(fromFront(nov1.pages[0]) && nov1.pages[0].includes("last_applied_month.lt.2026-10"), `S4-B 11/1 따라잡기는 말일 전 바퀴의 자리를 잇지 않고 앞에서부터 읽는다 (${String(nov1.pages[0]).slice(0, 160)})`);
  eq(applied(fx, "b-00000").length, 1, "S4-B 따라잡기가 자리 앞에 새로 만든 규칙의 10월 몫을 넣는다 (예전: 자리 뒤부터 읽어 빠뜨렸다)");
  const s1 = stateOf(fx);
  eq(s1.scan_after?.[0]?.started, "2026-11-01", "S4-B 새 달에 앞에서부터 시작한 따라잡기 바퀴의 자리도 시작한 날을 적는다");
  const nov2 = await runCron(fx, "2026-11-02");
  ok(resumedAfter(nov2.pages[0], s1.scan_after?.[0]?.id), `S4-B 11/2 따라잡기는 11/1 에 시작한 바퀴의 자리를 잇는다 (${String(nov2.pages[0]).slice(0, 160)})`);
  eq(stateOf(fx).checked_date, "2026-10-31", "S4-B 따라잡기 바퀴를 끝내면 checked_date 는 10월 말일이다");
  eq(applied(fx, "b-00000").length, 1, "S4-B 10월 몫은 한 번만 들어간다");
});

// ── S-4-C: 말일에 실행이 두 번이면 앞에서부터 다시 읽는 것은 첫 실행뿐이다 ────────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "s4-c", { viewer: true });
  seedViewerRules(fx, "s4-c", "c", 2200);
  putState(fx, { checked_date: "2026-10-29", pending_month: "" });
  await runCron(fx, "2026-10-30");
  const first = await runCron(fx, "2026-10-31");
  ok(fromFront(first.pages[0]), "S4-C 말일 첫 실행은 앞에서부터 읽는다");
  const second = await runCron(fx, "2026-10-31");
  ok(resumedAfter(second.pages[0], "c-02000"), `S4-C 말일 두 번째 실행은 그날 시작한 바퀴의 자리를 잇는다 (${String(second.pages[0]).slice(0, 160)})`);
  const s = stateOf(fx);
  deepEq([s.checked_date, s.pending_month, Object.keys(s).sort()], ["2026-10-31", "", ["checked_date", "pending_month"]], "S4-C 말일에 바퀴를 끝내면 checked_date 는 말일이고 자리는 지운다");
});

// ── S-4-D: 30일로 끝나는 달(11월)도 말일(11/30) 실행이 다시 읽고, 12/1 따라잡기가 그 자리를 잇는다 ───────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "s4-d", { viewer: true });
  seedViewerRules(fx, "s4-d", "d", 2200, { last_applied_month: "2026-10" });
  putState(fx, { checked_date: "2026-11-28", pending_month: "" });
  await runCron(fx, "2026-11-29");
  seedRule(fx, { id: "d-00000", household_id: "s4-d", amount: 9000, memo: "새 구독", last_applied_month: null, created_at: "2026-11-29T15:00:00+09:00" });
  const nov30 = await runCron(fx, "2026-11-30");
  ok(fromFront(nov30.pages[0]), "S4-D 11/30(말일) 실행은 앞에서부터 읽는다");
  eq(applied(fx, "d-00000", "2026-11").length, 1, "S4-D 11/30 실행이 자리 앞에 새로 만든 규칙의 11월 몫을 넣는다");
  eq(stateOf(fx).scan_after?.[0]?.started, "2026-11-30", "S4-D 11/30 에 시작한 바퀴의 자리는 started=2026-11-30 이다");
  const dec1 = await runCron(fx, "2026-12-01");
  ok(resumedAfter(dec1.pages[0], "d-01999") && dec1.pages[0].includes("last_applied_month.lt.2026-11"), `S4-D 12/1 따라잡기는 11/30 바퀴의 자리를 잇는다 (${String(dec1.pages[0]).slice(0, 160)})`);
  eq(stateOf(fx).checked_date, "2026-11-30", "S4-D 따라잡기를 끝내면 checked_date 는 11월 말일이다");
});

// ── S-4-E: started 칸이 틀렸으면 말일 전 자리로 보고, 맞으면 잇는다(형식이 틀린 칸으로 실행이 멈추지 않는다) ─────────
for (const [label, started, resume] of [["틀린 started", "2026-13-45", false], ["숫자 started", 20261031, false], ["말일 전 started", "2026-10-30", false], ["오늘 뒤 started", "2026-11-05", false], ["말일 started", "2026-10-31", true]]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "s4-e", { viewer: true });
    seedViewerRules(fx, "s4-e", "e", 3);
    seedRule(fx, { id: "e-00000", household_id: "s4-e", amount: 7000, memo: "앞 규칙", last_applied_month: null, created_at: "2026-10-20T10:00:00+09:00" });
    putState(fx, { checked_date: "2026-09-30", pending_month: "2026-10", scan_after: [{ month: "2026-10", day: 1, household_id: "s4-e", id: "e-00002", started }] });
    const run = await runCron(fx, "2026-11-01");
    eq(run.error, null, `S4-E ${label}: 실행이 오류 없이 끝난다`);
    if (resume) ok(resumedAfter(run.pages[0], "e-00002"), `S4-E ${label}: 말일에 시작한 바퀴의 자리를 잇는다`);
    else {
      ok(fromFront(run.pages[0]), `S4-E ${label}: 말일 전 자리로 보고 앞에서부터 읽는다`);
      eq(applied(fx, "e-00000").length, 1, `S4-E ${label}: 자리 앞 규칙의 10월 몫을 넣는다`);
    }
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], `S4-E ${label}: 끝낸 뒤 상태 값은 예전 두 칸이다`);
  });
}

// ── N-9-A: 따라잡아 넣은 10/31(토) 기록이 든 주(10/26~11/1) 주간 스냅숏을 다시 만든다 ───────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n9-a", { weekly: true, monthly: true, tx: [["2026-10-27", 30000]] });
  seedRule(fx, { id: "n9a-31", household_id: "n9-a", amount: 12000, memo: "음악", day_of_month: 31 });
  putState(fx, { checked_date: "2026-10-29", pending_month: "" });
  for (const day of ["2026-10-30", "2026-10-31", "2026-11-01"]) await runCron(fx, day, { failRecurringRead: true });
  const staleWeek = snapshot(fx, weeklyKey("n9-a", "2026-11-01"));
  const staleMonth = snapshot(fx, monthlyKey("n9-a"));
  ok(staleWeek?.transaction_count === 1 && staleWeek?.expense === 30000, "N9-A 11/1(일) 실행이 10/26~11/1 주간 스냅숏을 만든다(그때는 10/31 정기 기록이 없다)");
  ok(staleMonth?.transaction_count === 1, "N9-A 10/31 실행이 10월 월간 스냅숏을 만든다");
  const nov2 = await runCron(fx, "2026-11-02");
  eq(applied(fx, "n9a-31").length, 1, "N9-A 11/2 따라잡기가 10월 31일 몫을 넣는다");
  ok(grew(snapshot(fx, weeklyKey("n9-a", "2026-11-01")), staleWeek, 12000, 1), `N9-A 11/2 실행이 그 주 주간 스냅숏을 다시 만들어 따라잡은 기록을 담는다 (예전: 월간만 다시 만들었다) ${JSON.stringify(snapshot(fx, weeklyKey("n9-a", "2026-11-01")))}`);
  ok(grew(snapshot(fx, monthlyKey("n9-a")), staleMonth, 12000, 1), "N9-A 10월 월간 스냅숏도 예전처럼 다시 만든다");
  eq(snapshot(fx, weeklyKey("n9-a", "2026-11-01"))?.household_name, "n9-a 가계부", "N9-A 다시 만든 주간 스냅숏은 가계부 이름을 그대로 쓴다");
  deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "N9-A 다 만든 뒤 상태 값은 예전 두 칸이다");
  ok(nov2.calls <= 50, `N9-A 예약 실행 한 번의 저장소 호출 ${nov2.calls}회 ≤ 50`);
  const nov3 = await runCron(fx, "2026-11-03");
  eq(nov3.snapshotReads.length, 0, "N9-A 다음 실행(11/3)은 스냅숏을 찾지 않는다");
});

// ── N-9-B: 이번 달에 늦게 넣은 기록(10/20 에 만든 15일 규칙)이 든 지난주(10/12~18) 주간 스냅숏을 다시 만든다 ─────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n9-b", { weekly: true, tx: [["2026-10-14", 8000]] });
  putState(fx, { checked_date: "2026-10-17", pending_month: "" });
  await runCron(fx, "2026-10-18");
  const stale = snapshot(fx, weeklyKey("n9-b", "2026-10-18"));
  ok(stale?.transaction_count === 1, "N9-B 10/18(일) 실행이 10/12~18 주간 스냅숏을 만든다");
  seedRule(fx, { id: "n9b-15", household_id: "n9-b", amount: 9900, memo: "학습지", day_of_month: 15, last_applied_month: null, created_at: "2026-10-20T10:00:00+09:00" });
  await runCron(fx, "2026-10-21");
  eq(applied(fx, "n9b-15").map((t) => t.transaction_date).join(","), "2026-10-15", "N9-B 10/21 실행이 10월 15일 몫을 넣는다");
  ok(grew(snapshot(fx, weeklyKey("n9-b", "2026-10-18")), stale, 9900, 1), "N9-B 10/21 실행이 그 기록이 든 주(10/12~18) 주간 스냅숏을 다시 만든다");
  deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "N9-B 상태 값은 예전 두 칸이다");
});

// ── N-9-C: 지정일 당일에 넣은 기록(그 주가 끝나지 않음)은 스냅숏을 찾지 않는다. 일요일 기록은 같은 실행의 리포트가 담는다 ─────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n9-c", { weekly: true, monthly: true });
  seedRule(fx, { id: "n9c-21", household_id: "n9-c", amount: 5000, memo: "구독", day_of_month: 21 });
  seedRule(fx, { id: "n9c-25", household_id: "n9-c", amount: 6000, memo: "구독2", day_of_month: 25 });
  putState(fx, { checked_date: "2026-10-20", pending_month: "" });
  const wed = await runCron(fx, "2026-10-21");
  eq(applied(fx, "n9c-21").length, 1, "N9-C 10/21 실행이 그날 몫을 넣는다");
  eq(wed.snapshotReads.length, 0, "N9-C 그날 몫만 넣은 실행은 스냅숏을 찾지 않는다");
  for (const day of ["2026-10-22", "2026-10-23", "2026-10-24"]) await runCron(fx, day);
  const sun = await runCron(fx, "2026-10-25");
  eq(applied(fx, "n9c-25").length, 1, "N9-C 10/25(일) 실행이 그날 몫을 넣는다");
  const week = snapshot(fx, weeklyKey("n9-c", "2026-10-25"));
  ok(week?.transaction_count === 2 && week?.expense === 11000, `N9-C 같은 실행의 리포트가 그 주 스냅숏에 두 정기 기록을 담는다 (${week?.transaction_count}건·${week?.expense}원)`);
  ok(!stateOf(fx).report_rebuild, "N9-C 일요일 당일 몫은 다시 만들기 대기에 오르지 않는다");
  ok(sun.snapshotReads.every((query) => !query.includes("key=in.")), "N9-C 일요일 실행은 다시 만들기 조회를 하지 않는다");
});

// ── N-9-D: 주간 항목은 월간 대기 자리(N-17)를 쓰지 않고, 넘치면 주간 항목부터 잘린다 ─────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n9-d", { monthly: true });
  putSetting(fx, monthlyKey("n9-d"), JSON.stringify({ version: 1, household_id: "n9-d", household_name: "n9-d 가계부", kind: "monthly", period: "2026-10", generated_at: "2026-10-31T00:10:00.000Z", income: 0, expense: 0, balance: 0, transaction_count: 0, spend_days: 0, top_categories: [], biggest: null }));
  seedRule(fx, { id: "n9d-31", household_id: "n9-d", amount: 7000, memo: "구독", day_of_month: 31 });
  const weekly = Array.from({ length: 300 }, (_, i) => `2026-10-25|n9d-w${String(i + 1).padStart(3, "0")}`);
  putState(fx, { checked_date: "2026-10-30", pending_month: "", report_rebuild: weekly });
  // 다시 만들기 조회(key=in.)가 실패하면 대기는 하나도 줄지 않는다: 월간 1개 + 주간 300개 → 300개로 저장.
  const run = await runCron(fx, "2026-11-02", { handler: ({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.search.includes("key=in.") ? outage() : null) });
  eq(applied(fx, "n9d-31").length, 1, "N9-D 대기에 주간 항목 300개가 있어도 지난달 몫을 미루지 않는다(월간 자리는 월간 항목만 센다)");
  const queue = stateOf(fx).report_rebuild || [];
  eq(queue.length, 300, "N9-D 대기는 300개를 넘지 않는다");
  eq(queue[0], "2026-10|n9-d", "N9-D 넘치면 월간 항목은 앞에 남고 주간 항목부터 잘린다");
  eq(queue.filter((key) => key[10] === "|").length, 299, "N9-D 주간 항목은 남는 자리(299개)만큼 남는다");
  ok(run.events.some((e) => e.kind === "recurring_report_rebuild_overflow"), "N9-D 잘린 항목은 운영 이벤트 recurring_report_rebuild_overflow 로 남는다");
  ok(queue.filter((key) => key[10] === "|").every((key) => key[7] !== "|"), "N9-D 주간 항목은 옛 코드(V22.9.77·78)가 형식이 틀린 항목으로 버리는 모양이다");
});

// ── N-10-A: 규칙 수정이 넣은 지난달 몫의 스냅숏을 못 만들면 대기에 넣고, 다음 예약 실행이 다시 만든다 ──────────────
for (const path of ["/my/recurring/save", "/admin/recurring/save"]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    putSetting(fx, "free_report_preference:house-home", JSON.stringify({ household_id: "house-home", household_name: "우리집 생활비", enabled: true, weekly: false, monthly: true }));
    seedRule(fx, { id: "n10-rent", household_id: "house-home", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: 31 });
    putState(fx, { checked_date: "2026-10-28", pending_month: "" });
    for (const day of ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) await runCron(fx, day, { failRecurringRead: day >= "2026-10-31" });
    const stale = snapshot(fx, monthlyKey("house-home"));
    ok(stale && applied(fx, "n10-rent").length === 0, `N10-A ${path} 10월 스냅숏은 있고 10월 31일 월세는 아직 없다`);
    globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-01", "20:00");
    const list = opsEvents();
    const mark = list[list.length - 1];
    const restore = intercept(({ url, method, init }) => (method === "POST" && url.pathname.endsWith("/accountbook_settings") && String(init.body || "").includes(monthlyKey("house-home")) ? failure(503) : null));
    let saved;
    try {
      saved = await post(fx, path, { id: "n10-rent", household_id: "house-home", month: "2026-11", type: "expense", memo: "월세", amount: "700000", day_of_month: "31", category: "주거/관리", payment_method: "계좌이체", user_id: "user-bin", return_to: "/reserve-plans?household_id=house-home&month=2026-11#fixed" });
    } finally { restore(); }
    const events = opsEvents().slice(mark ? opsEvents().indexOf(mark) + 1 : 0);
    ok(saved.status === 303 && /recurring_saved/.test(saved.decoded), `N10-A ${path} 스냅숏을 못 만들어도 고친 내용은 저장된다 (${saved.decoded.slice(0, 120)})`);
    eq(applied(fx, "n10-rent").map((t) => t.amount).join(","), "650000", `N10-A ${path} 놓친 10월 몫이 고치기 전 금액으로 들어간다`);
    deepEq(snapshot(fx, monthlyKey("house-home")), stale, `N10-A ${path} 그 요청은 10월 스냅숏을 다시 만들지 못했다`);
    ok(events.some((e) => e.kind === "free_report_rebuild_failed"), `N10-A ${path} 운영 이벤트 free_report_rebuild_failed 는 예전처럼 남는다`);
    deepEq(stateOf(fx)?.report_rebuild, ["2026-10|house-home"], `N10-A ${path} 못 만든 10월 스냅숏을 상태 키의 다시 만들기 대기에 넣는다 (예전: 운영 이벤트만 남았다)`);
    eq(stateOf(fx)?.checked_date, "2026-10-30", `N10-A ${path} 대기만 보태고 checked_date 는 그대로 둔다`);
    await runCron(fx, "2026-11-02");
    ok(grew(snapshot(fx, monthlyKey("house-home")), stale, 650000, 1), `N10-A ${path} 다음 예약 실행(11/2)이 10월 스냅숏을 다시 만들어 고치기 전 월세를 담는다`);
    deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], `N10-A ${path} 다 만든 뒤 상태 값은 예전 두 칸이다`);
  });
}

// ── N-10-B: 대기에 넣으려고 상태 키를 다시 읽다 실패하면 상태를 쓰지 않고 운영 이벤트만 남긴다(저장은 그대로 성공) ─────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  putSetting(fx, "free_report_preference:house-home", JSON.stringify({ household_id: "house-home", household_name: "우리집 생활비", enabled: true, weekly: false, monthly: true }));
  seedRule(fx, { id: "n10b-rent", household_id: "house-home", amount: 650000, category: "주거/관리", memo: "월세", payment_method: "계좌이체", day_of_month: 31 });
  putState(fx, { checked_date: "2026-10-28", pending_month: "" });
  for (const day of ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01"]) await runCron(fx, day, { failRecurringRead: day >= "2026-10-31" });
  const before = settingValue(fx, STATE_KEY);
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-01", "20:00");
  const list = opsEvents();
  const mark = list[list.length - 1];
  let stateReads = 0;
  const restore = intercept(({ url, method, init }) => {
    if (method === "POST" && url.pathname.endsWith("/accountbook_settings") && String(init.body || "").includes(monthlyKey("house-home"))) return failure(503);
    if (method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.${STATE_KEY}` && ++stateReads >= 2) return failure(503);
    return null;
  });
  let saved;
  try {
    saved = await post(fx, "/my/recurring/save", { id: "n10b-rent", household_id: "house-home", month: "2026-11", type: "expense", memo: "월세", amount: "700000", day_of_month: "31", category: "주거/관리", payment_method: "계좌이체", user_id: "user-bin", return_to: "/my/settings?household_id=house-home" });
  } finally { restore(); }
  const events = opsEvents().slice(mark ? opsEvents().indexOf(mark) + 1 : 0);
  ok(saved.status === 303 && /recurring_saved/.test(saved.decoded), `N10-B 대기에 넣지 못해도 고친 내용은 저장된다 (${saved.decoded.slice(0, 120)})`);
  eq(applied(fx, "n10b-rent").length, 1, "N10-B 놓친 10월 몫은 들어간다");
  eq(settingValue(fx, STATE_KEY), before, "N10-B 상태 키를 읽지 못하면 덮어쓰지 않는다");
  ok(events.some((e) => e.kind === "recurring_report_rebuild_queue_failed"), "N10-B 운영 이벤트 recurring_report_rebuild_queue_failed 를 남긴다");
});

// ── N-10-C: 새 달 3일에 고쳐 넣은 10/31 몫은 그 주(10/26~11/1) 주간 스냅숏도 그 자리에서 다시 만든다 ────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  putSetting(fx, "free_report_preference:house-home", JSON.stringify({ household_id: "house-home", household_name: "우리집 생활비", enabled: true, weekly: true, monthly: true }));
  seedRule(fx, { id: "n10c-sub", household_id: "house-home", amount: 13000, category: "구독", memo: "영상", day_of_month: 31 });
  putState(fx, { checked_date: "2026-10-28", pending_month: "" });
  for (const day of ["2026-10-29", "2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]) await runCron(fx, day, { failRecurringRead: day >= "2026-10-31" });
  const staleMonth = snapshot(fx, monthlyKey("house-home"));
  const staleWeek = snapshot(fx, weeklyKey("house-home", "2026-11-01"));
  ok(staleMonth && staleWeek && applied(fx, "n10c-sub").length === 0, "N10-C 10월 월간·10/26~11/1 주간 스냅숏은 있고 10월 31일 몫은 아직 없다");
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-03", "10:00");
  const saved = await post(fx, "/my/recurring/save", { id: "n10c-sub", household_id: "house-home", month: "2026-11", type: "expense", memo: "영상", amount: "15000", day_of_month: "31", category: "구독", payment_method: "", user_id: "user-bin", return_to: "/my/settings?household_id=house-home" });
  ok(saved.status === 303 && /recurring_saved/.test(saved.decoded), "N10-C 고친 내용을 저장한다");
  eq(applied(fx, "n10c-sub").map((t) => `${t.transaction_date}:${t.amount}`).join(","), "2026-10-31:13000", "N10-C 놓친 10월 31일 몫이 고치기 전 금액으로 들어간다");
  ok(grew(snapshot(fx, monthlyKey("house-home")), staleMonth, 13000, 1), "N10-C 고친 요청이 10월 월간 스냅숏을 다시 만든다");
  ok(grew(snapshot(fx, weeklyKey("house-home", "2026-11-01")), staleWeek, 13000, 1), "N10-C 고친 요청이 그 기록이 든 주 주간 스냅숏도 다시 만든다 (예전: 월간만)");
  ok(!stateOf(fx)?.report_rebuild, "N10-C 다 만들었으면 대기에 남기지 않는다");
});

// ── F1-A: 지난달 '기록하기'(수동 반영)가 그 달 월간·끝난 주 주간 스냅숏을 다시 만들고, 남은 것은 대기에 넣는다 ─────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "f1-a", { weekly: true, monthly: true, tx: [["2026-10-07", 8000], ["2026-10-14", 7000]] });
  putState(fx, { checked_date: "2026-10-10", pending_month: "" });
  for (const day of ["2026-10-11", "2026-10-18", "2026-10-31"]) await runCron(fx, day);
  const staleWeek1 = snapshot(fx, weeklyKey("f1-a", "2026-10-11"));
  const staleWeek2 = snapshot(fx, weeklyKey("f1-a", "2026-10-18"));
  const staleMonth = snapshot(fx, monthlyKey("f1-a"));
  ok(staleWeek1?.transaction_count === 1 && staleWeek2?.transaction_count === 1 && staleMonth?.transaction_count === 2, "F1-A 10월 월간·10/5~11·10/12~18 주간 스냅숏이 있다");
  // 11월에 만든 규칙 둘(6일·15일)을 10월 몫으로 기록한다(D-11 확인 화면을 거친 요청).
  seedRule(fx, { id: "f1a-06", household_id: "f1-a", amount: 9900, memo: "학습지", day_of_month: 6, last_applied_month: null, created_at: "2026-11-02T10:00:00+09:00" });
  seedRule(fx, { id: "f1a-15", household_id: "f1-a", amount: 4500, memo: "음악", day_of_month: 15, last_applied_month: null, created_at: "2026-11-02T10:00:00+09:00" });
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-03", "10:00");
  const res = await post(fx, "/admin/recurring/apply", { household_id: "f1-a", month: "2026-10", confirmed: "yes" });
  ok(res.status === 303 && /고정항목.2건.기록/.test(res.decoded), `F1-A 10월 몫 두 건을 기록한다 (${res.decoded.slice(0, 120)})`);
  ok(grew(snapshot(fx, monthlyKey("f1-a")), staleMonth, 14400, 2), "F1-A 그 요청이 10월 월간 스냅숏을 다시 만든다 (예전: 예전 금액으로 남았고 표식이 바뀌어 예약 실행도 다시 보지 않았다)");
  ok(grew(snapshot(fx, weeklyKey("f1-a", "2026-10-11")), staleWeek1, 9900, 1), "F1-A 그 요청이 10/6 기록이 든 주(10/5~11) 주간 스냅숏을 다시 만든다");
  deepEq(snapshot(fx, weeklyKey("f1-a", "2026-10-18")), staleWeek2, "F1-A 한 요청은 스냅숏을 두 개까지만 다시 만든다");
  deepEq(stateOf(fx)?.report_rebuild, ["2026-10-18|f1-a"], "F1-A 못 만든 10/12~18 주간 스냅숏은 다시 만들기 대기에 넣는다");
  eq(stateOf(fx)?.checked_date, "2026-10-31", "F1-A 대기만 보태고 checked_date 는 그대로 둔다");
  await runCron(fx, "2026-11-04");
  ok(grew(snapshot(fx, weeklyKey("f1-a", "2026-10-18")), staleWeek2, 4500, 1), "F1-A 다음 예약 실행(11/4)이 10/15 기록이 든 주 주간 스냅숏을 다시 만든다");
  ok(!stateOf(fx)?.report_rebuild, "F1-A 다 만든 뒤 대기는 비어 있다");
});

// ── F1-B: 이번 달 '기록하기'는 끝난 주와 오늘(일요일) 아침 만든 이번 주 주간 스냅숏을 다시 만든다. 다음 주 기록·이번 달 월간은 그대로 ───
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "f1-b", { weekly: true, monthly: true, tx: [["2026-10-14", 7000], ["2026-10-21", 6000]] });
  putState(fx, { checked_date: "2026-10-17", pending_month: "" });
  for (const day of ["2026-10-18", "2026-10-25"]) await runCron(fx, day);
  const staleLast = snapshot(fx, weeklyKey("f1-b", "2026-10-18"));
  const staleThis = snapshot(fx, weeklyKey("f1-b", "2026-10-25"));
  ok(staleLast?.transaction_count === 1 && staleThis?.transaction_count === 1, "F1-B 10/12~18·10/19~25 주간 스냅숏이 있다");
  for (const [id, day, amount] of [["f1b-13", 13, 3000], ["f1b-22", 22, 5000], ["f1b-28", 28, 7000]]) seedRule(fx, { id, household_id: "f1-b", amount, memo: `구독${day}`, day_of_month: day, last_applied_month: null, created_at: "2026-10-25T12:00:00+09:00" });
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-25", "20:00");
  const res = await post(fx, "/admin/recurring/apply", { household_id: "f1-b", month: "2026-10" });
  ok(res.status === 303 && /고정항목.3건.기록/.test(res.decoded), `F1-B 이번 달 몫 세 건을 기록한다 (${res.decoded.slice(0, 120)})`);
  ok(grew(snapshot(fx, weeklyKey("f1-b", "2026-10-18")), staleLast, 3000, 1), "F1-B 끝난 주(10/12~18) 주간 스냅숏을 다시 만든다 (예전: 예전 금액)");
  ok(grew(snapshot(fx, weeklyKey("f1-b", "2026-10-25")), staleThis, 5000, 1), "F1-B 오늘(일요일) 아침 예약 실행이 만든 이번 주 스냅숏도 다시 만든다(10/28 기록은 다음 주 몫)");
  ok(!settingValue(fx, monthlyKey("f1-b")), "F1-B 이번 달 월간 스냅숏은 만들지 않는다(말일 실행이 만든다)");
  ok(!stateOf(fx)?.report_rebuild, "F1-B 다 만들었으면 대기에 남기지 않는다");
});

// ── F1-C: 기록은 들어갔는데 반영 표식 되살리기(SIM-8)가 실패하면 스냅숏은 대기에 넣어 다음 예약 실행이 다시 만든다 ───────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "f1-c", { monthly: true, tx: [["2026-10-14", 7000]] });
  putState(fx, { checked_date: "2026-10-30", pending_month: "" });
  await runCron(fx, "2026-10-31");
  const stale = snapshot(fx, monthlyKey("f1-c"));
  ok(stale?.transaction_count === 1, "F1-C 10월 월간 스냅숏이 있다");
  // 표식이 이미 11월인 규칙의 10월 몫을 넣는다. RPC 뒤 표식을 11월로 되살리는 요청이 실패한다.
  seedRule(fx, { id: "f1c-20", household_id: "f1-c", amount: 8800, memo: "보험", day_of_month: 20, last_applied_month: "2026-11", created_at: "2026-09-01T10:00:00+09:00" });
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-11-03", "10:00");
  const restore = intercept(({ url, method }) => (method === "PATCH" && url.pathname.endsWith("/accountbook_recurring") ? failure(503) : null));
  let res;
  try { res = await post(fx, "/admin/recurring/apply", { household_id: "f1-c", month: "2026-10", confirmed: "yes" }); } finally { restore(); }
  ok(res.status === 303 && /err=/.test(res.decoded), `F1-C 끝을 맺지 못한 반영은 오류로 안내한다 (${res.decoded.slice(0, 120)})`);
  eq(applied(fx, "f1c-20").length, 1, "F1-C 10월 몫 기록은 들어갔다");
  deepEq(snapshot(fx, monthlyKey("f1-c")), stale, "F1-C 그 요청은 스냅숏을 다시 만들지 않는다");
  deepEq(stateOf(fx)?.report_rebuild, ["2026-10|f1-c", "2026-10-25|f1-c"], "F1-C 10월 월간·10/19~25 주간 스냅숏을 다시 만들기 대기에 넣는다 (예전: 아무것도 남지 않았다)");
  await runCron(fx, "2026-11-04");
  ok(grew(snapshot(fx, monthlyKey("f1-c")), stale, 8800, 1), "F1-C 다음 예약 실행이 10월 월간 스냅숏을 다시 만든다");
  ok(!stateOf(fx)?.report_rebuild, "F1-C 없는 주간 스냅숏 항목은 버리고 대기를 비운다");
});

// ── F2: 예약 실행이 도는 동안 실행 밖에서 다시 만들기 대기에 보탠 항목을 실행 끝 상태 저장이 지우지 않는다 ─────────────────
// 실행이 첫 쪽을 읽을 때(상태를 처음 읽은 뒤) 규칙 수정·수동 반영이 대기에 '2026-09|f2'를 보탠 것처럼 상태 키를 바꾼다.
const stateRead = ({ url, method }) => method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.${STATE_KEY}`;
function queueDuringRun(fx, entry, { failReread = false } = {}) {
  const seen = { stateReads: 0, injected: false };
  const handler = (request) => {
    if (stateRead(request)) { seen.stateReads += 1; if (failReread && seen.stateReads >= 2) return outage(); }
    if (!seen.injected && request.method === "GET" && request.url.pathname.endsWith("/accountbook_recurring")) {
      seen.injected = true;
      const state = stateOf(fx);
      putState(fx, { ...state, report_rebuild: [...(state.report_rebuild || []), entry] });
    }
    return null;
  };
  return { seen, handler };
}
for (const failReread of [false, true]) {
  await fixture(async (fx) => {
    const tag = failReread ? "F2-B" : "F2-A";
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "f2", { monthly: true, tx: [["2026-09-10", 5000]] });
    putState(fx, { checked_date: "2026-09-29", pending_month: "" });
    await runCron(fx, "2026-09-30");
    const stale = snapshot(fx, monthlyKey("f2", "2026-09"));
    await runCron(fx, "2026-10-20");
    ok(stale?.transaction_count === 1 && stateOf(fx)?.checked_date === "2026-10-20", `${tag} 9월 월간 스냅숏이 있고 checked_date 는 10/20 이다`);
    // 실행 밖에서 넣은 9월 기록(규칙 수정의 지난달 몫 같은 것). 그 스냅숏 다시 만들기를 실행 중에 대기에 보탠다.
    fx.db.transactions.push({ id: "f2-late", household_id: "f2", user_id: "user-bin", transaction_date: "2026-09-20", type: "expense", amount: 7700, category: "구독", memo: "늦은 기록", payment_method: "", source: "recurring_auto", raw_text: "recurring:f2-late:2026-09", created_at: "2026-10-21T00:00:00Z" });
    const during = queueDuringRun(fx, "2026-09|f2", { failReread });
    const run = await runCron(fx, "2026-10-21", { handler: during.handler });
    ok(during.seen.injected && run.calls <= 50, `${tag} 실행 중에 대기가 보태졌고 호출은 50회 안이다 (${run.calls}회)`);
    if (!failReread) {
      eq(during.seen.stateReads, 2, "F2-A 상태를 바꾸는 실행은 저장 바로 앞에 상태를 다시 읽는다(처음 1회 + 저장 앞 1회)");
      deepEq(stateOf(fx)?.report_rebuild, ["2026-09|f2"], "F2-A 실행 중에 보탠 대기 항목이 실행 끝 저장 뒤에도 남는다 (예전: 처음 읽은 상태로 덮여 사라졌다)");
      eq(stateOf(fx)?.checked_date, "2026-10-21", "F2-A checked_date 등 다른 칸은 이 실행의 값이다");
      await runCron(fx, "2026-10-22");
      ok(grew(snapshot(fx, monthlyKey("f2", "2026-09")), stale, 7700, 1), "F2-A 다음 실행이 그 항목의 9월 스냅숏을 다시 만든다");
      ok(!stateOf(fx)?.report_rebuild, "F2-A 다 만든 뒤 대기는 비어 있다");
      // 상태가 바뀌지 않는 실행(같은 날 두 번째)은 다시 읽지도 쓰지도 않고, 그 사이 보탠 항목은 그대로 남는다.
      const again = queueDuringRun(fx, "2026-09|f2");
      await runCron(fx, "2026-10-22", { handler: again.handler });
      ok(again.seen.injected && again.seen.stateReads === 1 && (stateOf(fx)?.report_rebuild || []).includes("2026-09|f2"), `F2-A 상태가 그대로인 실행은 상태를 한 번만 읽고 보탠 항목을 건드리지 않는다 (읽기 ${again.seen.stateReads}회)`);
    } else {
      deepEq(stateOf(fx), { checked_date: "2026-10-20", pending_month: "", report_rebuild: ["2026-09|f2"] }, "F2-B 상태를 다시 읽지 못하면 쓰지 않아 보탠 항목이 남는다(저장 실패와 같다: 다음 실행이 다시 확인한다)");
      ok(run.events.some((e) => e.kind === "recurring_state_save_failed"), "F2-B 운영 이벤트 recurring_state_save_failed 를 남긴다");
      await runCron(fx, "2026-10-22");
      ok(grew(snapshot(fx, monthlyKey("f2", "2026-09")), stale, 7700, 1) && stateOf(fx)?.checked_date === "2026-10-22", "F2-B 다음 실행이 9월 스냅숏을 다시 만들고 checked_date 를 옮긴다");
    }
  });
}

done();
