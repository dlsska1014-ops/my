// V22.9.78 예약 실행 검사 (V77 N-16 정기 반영 다음 쪽, N-18 예약 실행 결과 영속 기록). 메모리 픽스처(validation/qa-fixture.mjs)로
// 재현하며 네트워크를 쓰지 않는다.
//   N-16 정기 반영은 (지정일·가계부·id) 순서로 500개씩 읽는다. 예전에는 한 쪽만 읽어, 표식이 그대로인 건너뛴 규칙(조회 전용·
//        나간 지출자·저장 거절)이 앞쪽을 채우면 뒤 규칙에 닿지 못한 채 '다 처리함'으로 끝났고, 말일이면 checked_date 가 넘어가
//        다음 달 따라잡기에서도 빠졌다. 이제 꽉 찬 쪽이면 마지막 규칙 뒤부터 다음 쪽을 읽고, 한 실행의 쪽 한도(4쪽)나 쪽 읽기 실패에
//        걸리면 partial 로 끝나 이어 읽을 자리를 상태 키(scan_after)에 남기고 checked_date 를 처리하지 못한 지정일 앞에 둔다.
//   N-18 예약 실행마다 결과 요약을 설정 키 cron_run_log_v22978 에 남긴다(최근 14번, 새것이 앞, 가계부 id·사람·금액 없음).
//        기록을 읽거나 저장하지 못해도 실행은 그대로 끝나고, 깨진 기록은 새로 시작한다. /ops-dashboard 가 저장된 기록을 보인다.
// 픽스처는 PostgREST 논리식(and·or)을 무시하고 지정일을 글자 순으로 정렬하므로, 정기 규칙 목록 조회는 이 검사 안의 작은
// PostgREST 흉내(논리식·지정일 숫자 정렬·limit)로 답한다.
// 사용: node validation/validate-cron-v22978.mjs
import app, { runRecurringAutoApply } from "../src/index.js";
import { BASE, counter, ctx, fixture, intercept, putSetting, settingValue } from "./lib-audit-v22934.mjs";

const { ok, eq, deepEq, done } = counter("V22.9.78 예약 실행 다음 쪽·실행 기록 검사 통과");
const KST = (ymd, hm = "09:10") => Date.parse(`${ymd}T${hm}:00+09:00`);
const STATE_KEY = "cron_recurring_state_v22976";
const LOG_KEY = "cron_run_log_v22978";
const readJson = (value) => (value == null || value === "" ? null : typeof value === "string" ? JSON.parse(value) : value);
// V22.9.88 Y-6: 상태 맨 앞의 판 번호(rev)는 조건부 쓰기용 칸이라 칸 비교에서 뺀다(판 번호 동작은 validate-codex-findings-v22988 이 본다).
const stateOf = (fx) => { const state = readJson(settingValue(fx, STATE_KEY)); if (state && typeof state === "object") delete state.rev; return state; };
const logOf = (fx) => { try { const log = readJson(settingValue(fx, LOG_KEY)); return Array.isArray(log) ? log : []; } catch (_) { return []; } };
const applied = (fx, prefix, month = "2026-10") => fx.db.transactions.filter((t) => t.source === "recurring_auto" && String(t.raw_text).startsWith(`recurring:${prefix}`) && String(t.raw_text).endsWith(`:${month}`));
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const outage = () => json({ message: "synthetic outage" }, 503);
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const isLogWrite = (url, method, init) => {
  if (method !== "POST" || !url.pathname.endsWith("/accountbook_settings")) return false;
  try { return JSON.parse(String(init.body || "{}")).key === LOG_KEY; } catch (_) { return false; }
};
const isLogRead = (url, method) => method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.${LOG_KEY}`;

// ── 정기 규칙 목록 조회용 작은 PostgREST 흉내 ─────────────────────────────────────────────
// 논리식 and(...)/or(...), "따옴표 값"(\ 이스케이프), eq·neq·gt·gte·lt·lte·is·in, not. 접두, 여러 열 정렬, limit·offset.
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
function recurringQuery(rows, params, { ignoreCursor = false } = {}) {
  let out = rows.filter((row) => {
    for (const [key, raw] of params) {
      if (["select", "order", "limit", "offset"].includes(key)) continue;
      if (key === "and" || key === "or") {
        if (key === "and" && ignoreCursor) continue;
        if (!evaluate(row, { op: key, items: parseLogic(raw) })) return false;
        continue;
      }
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

// 정기 규칙 목록 조회를 흉내로 답하고 나머지는 픽스처로 보낸다. handler 가 Response 를 돌려주면 그 응답을 쓴다.
async function withStore(fx, task, { handler = null, ignoreCursor = false } = {}) {
  const seen = { calls: 0, pages: [] };
  const restore = intercept(async (request) => {
    const { url, method } = request;
    if (url.hostname !== "mock.supabase.co") return null;
    seen.calls += 1;
    if (handler) { const injected = await handler(request); if (injected) return injected; }
    if (method === "GET" && url.pathname.endsWith("/accountbook_recurring")) {
      seen.pages.push(decodeURIComponent(url.search));
      return json(recurringQuery(fx.db.accountbook_recurring, url.searchParams, { ignoreCursor }));
    }
    return null;
  });
  try { seen.result = await task(); } finally { restore(); }
  return seen;
}

// 예약 실행 한 번(정기 반영 + 자동 리포트 + NLU 정리 + 실행 기록)을 그날 09:10 KST 로 돌린다.
async function runCron(fx, ymd, options = {}) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  const list = opsEvents();
  const mark = list[list.length - 1];
  let error = null;
  const seen = await withStore(fx, async () => {
    const pending = [];
    await app.scheduled({ cron: "10 0 * * *", scheduledTime: KST(ymd) }, fx.env, { waitUntil(p) { pending.push(p); } });
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
  }, options);
  const after = opsEvents();
  const index = mark ? after.indexOf(mark) : -1;
  return { ...seen, error, events: after.slice(index + 1) };
}

function seedHousehold(fx, id, members = []) {
  fx.db.households.push({ id, name: `${id} 가계부`, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-07-01T00:00:00.000Z" });
  for (const [userId, role] of members) fx.db.household_members.push({ household_id: id, user_id: userId, role, created_at: "2026-07-01T00:00:00.000Z" });
}

// 금액 12,345원은 실행 기록에 금액이 새지 않는지 볼 때 찾는 값이다.
function seedRules(fx, householdId, prefix, from, count, rule = {}) {
  for (let n = from; n < from + count; n += 1) {
    fx.db.accountbook_recurring.push({
      id: `${prefix}-${String(n).padStart(5, "0")}`, household_id: householdId, type: "expense", amount: 12345, category: "구독", memo: "정기",
      payment_method: "", user_id: "user-bin", is_active: true, last_applied_month: "2026-09", created_at: "2026-07-01T00:00:00+09:00", day_of_month: 1, ...rule,
    });
  }
}

const freshState = (fx, checked) => putSetting(fx, STATE_KEY, JSON.stringify({ checked_date: checked, pending_month: "" }));

// ── N-16-A: 500개가 넘는 지정 규칙(앞 480개는 조회 전용 지출자)을 두 쪽에 걸쳐 모두 처리한다 ───────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-a", [["user-view", "viewer"]]);
  seedRules(fx, "n16-a", "a", 1, 480, { user_id: "user-view" });
  seedRules(fx, "n16-a", "a", 1001, 100, { day_of_month: 2 });
  freshState(fx, "2026-10-01");
  const run = await runCron(fx, "2026-10-02");
  eq(run.error, null, "N16-A 실행이 오류 없이 끝난다");
  eq(applied(fx, "a-01").length, 100, `N16-A 지정 규칙 580개 중 넣을 100개를 한 실행에서 모두 넣는다 (예전 20개, 지금 ${applied(fx, "a-01").length})`);
  eq(run.pages.length, 2, "N16-A 꽉 찬 첫 쪽 뒤 둘째 쪽을 읽는다");
  const secondPage = String(run.pages[1] || "");
  ok(secondPage.includes("id.gt.\"a-01020\"") && secondPage.includes("day_of_month.eq.2"), `N16-A 둘째 쪽은 첫 쪽 마지막 규칙(2일·n16-a·a-01020) 뒤부터다 (${secondPage.slice(0, 240)})`);
  ok(fx.db.accountbook_recurring.filter((r) => r.user_id === "user-view").every((r) => r.last_applied_month === "2026-09"), "N16-A 건너뛴 규칙의 표식은 그대로다");
  const state = stateOf(fx);
  eq(state.checked_date, "2026-10-02", "N16-A 끝까지 처리한 실행은 checked_date 를 오늘로 옮긴다");
  deepEq(Object.keys(state).sort(), ["checked_date", "pending_month"], "N16-A 이어 읽을 자리가 없으면 상태 값은 예전 두 칸 그대로다");
  const entry = logOf(fx)[0] || {};
  eq(entry.status, "ok", "N16-A 실행 기록 상태 ok");
  deepEq([entry.recurring?.pages, entry.recurring?.rules_seen, entry.recurring?.applied, entry.recurring?.skipped, entry.recurring?.remaining], [2, 580, 100, 480, 0], "N16-A 실행 기록: 2쪽·580개 확인·100개 넣음·480개 건너뜀·남음 0");
  ok(run.calls <= 50, `N16-A 예약 실행 한 번의 저장소 호출 ${run.calls}회 ≤ 50`);
  const again = await runCron(fx, "2026-10-02");
  eq(applied(fx, "a-01").length, 100, "N16-A 같은 날 다시 돌려도 두 번 넣지 않는다");
  eq(logOf(fx)[0]?.recurring?.applied, 0, "N16-A 다시 돌린 실행은 넣은 것이 없다");
  eq(again.pages.length, 1, "N16-A 넣은 규칙은 목록에서 빠져 한 쪽만 남는다");
});

// ── N-16-A2: 다음 쪽 읽기가 실패하면 partial, 읽은 쪽의 일은 남기고 다음 실행이 그 뒤부터 잇는다 ──────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-a", [["user-view", "viewer"]]);
  seedRules(fx, "n16-a", "a", 1, 480, { user_id: "user-view" });
  seedRules(fx, "n16-a", "a", 1001, 100, { day_of_month: 2 });
  freshState(fx, "2026-10-01");
  const run = await runCron(fx, "2026-10-02", { handler: ({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") && url.searchParams.has("and") ? outage() : null) });
  eq(applied(fx, "a-01").length, 20, "N16-A2 첫 쪽의 20개는 넣는다");
  const entry = logOf(fx)[0] || {};
  eq(entry.recurring?.partial_reason, "error", "N16-A2 다음 쪽을 못 읽은 실행은 partial(error)이다");
  eq(entry.status, "error", "N16-A2 쪽 읽기 실패는 실패로 센다(실행 오류)");
  ok(run.events.some((e) => e.kind === "recurring_page_failed"), "N16-A2 운영 이벤트 recurring_page_failed");
  const state = stateOf(fx);
  eq(state.checked_date, "2026-10-01", "N16-A2 못 읽은 쪽의 지정일(2일) 앞에 checked_date 를 둔다");
  deepEq(state.scan_after, [{ month: "2026-10", day: 2, household_id: "n16-a", id: "a-01020" }], "N16-A2 끝까지 처리한 첫 쪽 마지막 자리를 남긴다");
  const next = await runCron(fx, "2026-10-03");
  eq(next.error, null, "N16-A2 다음 실행은 오류 없이 끝난다");
  eq(applied(fx, "a-01").length, 100, "N16-A2 다음 실행이 남은 80개를 넣는다");
  ok(next.pages[0].includes("id.gt.\"a-01020\""), "N16-A2 다음 실행 첫 쪽은 남긴 자리 뒤부터다");
  deepEq(Object.keys(stateOf(fx)).sort(), ["checked_date", "pending_month"], "N16-A2 끝내면 자리를 지운다");
});

// ── N-16-B: 앞쪽을 채운 건너뛸 규칙(조회 전용 900·나간 지출자 300·저장 거절 20)이 뒤 규칙을 가리지 않는다 ──────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-b", [["user-view", "viewer"]]);
  seedRules(fx, "n16-b", "b", 1, 900, { user_id: "user-view" });
  seedRules(fx, "n16-b", "b", 1001, 300, { user_id: "user-gone" });
  seedRules(fx, "n16-b", "b", 2001, 20, { amount: 2500000000 });
  seedRules(fx, "n16-b", "b", 3001, 25, { day_of_month: 2 });
  freshState(fx, "2026-10-01");
  const run = await runCron(fx, "2026-10-02");
  eq(applied(fx, "b-03").length, 25, `N16-B 건너뛸 규칙 1,220개 뒤의 25개를 같은 실행에서 넣는다 (예전 0개, 지금 ${applied(fx, "b-03").length})`);
  eq(applied(fx, "b-02").length, 0, "N16-B 저장이 거절된 규칙은 들어가지 않는다");
  eq(run.pages.length, 3, "N16-B 세 쪽을 읽는다");
  const entry = logOf(fx)[0] || {};
  deepEq([entry.recurring?.applied, entry.recurring?.skipped, entry.recurring?.failed, entry.recurring?.pages], [25, 1200, 20, 3], "N16-B 실행 기록: 25 넣음·1,200 건너뜀·20 실패·3쪽");
  eq(entry.status, "error", "N16-B 저장 거절은 예전처럼 실패로 센다");
  ok(run.error && /scheduled_recurring_failed/.test(String(run.error.message)), "N16-B 실패가 있으면 예약 실행은 예전처럼 오류로 끝난다");
  ok(fx.db.accountbook_recurring.filter((r) => r.id < "b-03001").every((r) => r.last_applied_month === "2026-09"), "N16-B 건너뛰거나 거절된 규칙의 표식은 그대로다");
  eq(stateOf(fx).checked_date, "2026-10-02", "N16-B 모두 처리했으면 checked_date 는 오늘이다");
});

// ── N-16-C: 쪽 한도(4쪽)에 걸리면 partial, checked_date 를 옮기지 않고 다음 실행이 이어서 끝낸다 ──────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-c", [["user-view", "viewer"]]);
  seedRules(fx, "n16-c", "c", 1, 2200, { user_id: "user-view" });
  seedRules(fx, "n16-c", "c", 3001, 30, { day_of_month: 3 });
  freshState(fx, "2026-10-02");
  const first = await runCron(fx, "2026-10-03");
  eq(first.error, null, "N16-C 쪽 한도는 오류가 아니다");
  eq(first.pages.length, 4, "N16-C 한 실행은 4쪽까지만 읽는다");
  eq(applied(fx, "c-03").length, 0, "N16-C 닿지 못한 3일 규칙은 아직 넣지 않았다");
  const s1 = stateOf(fx);
  eq(s1.checked_date, "2026-09-30", "N16-C checked_date 는 처리하지 못한 지정일(10/1) 전날이다(오늘로 옮기지 않는다)");
  eq(s1.pending_month, "2026-10", "N16-C 남은 달은 2026-10");
  deepEq(s1.scan_after, [{ month: "2026-10", day: 1, household_id: "n16-c", id: "c-02000" }], "N16-C 끝까지 처리한 마지막 자리를 남긴다");
  const e1 = logOf(fx)[0] || {};
  deepEq([e1.status, e1.recurring?.partial_reason, e1.recurring?.more, e1.recurring?.pages, e1.recurring?.rules_seen], ["partial", "page_cap", true, 4, 2000], "N16-C 실행 기록: partial·page_cap·남은 쪽 있음·4쪽·2,000개");
  ok(first.events.some((e) => e.kind === "scheduled_partial"), "N16-C 예전 운영 이벤트 scheduled_partial 도 남는다");
  ok(first.calls <= 50, `N16-C 예약 실행 한 번의 저장소 호출 ${first.calls}회 ≤ 50`);
  // 운영자의 ?month= 실행은 그 실행 안에서만 쪽을 넘기고 상태(이어 읽을 자리)는 바꾸지 않는다.
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-03");
  const explicit = await withStore(fx, () => runRecurringAutoApply(fx.env, { month: "2026-10", today: "2026-10-03" }));
  deepEq([explicit.result.pages, explicit.result.partial_reason, explicit.result.ok], [4, "page_cap", false], "N16-C ?month= 실행도 쪽 한도에서 partial 로 멈춘다");
  deepEq(stateOf(fx), s1, "N16-C ?month= 실행은 상태 키를 바꾸지 않는다");
  const second = await runCron(fx, "2026-10-04");
  eq(second.error, null, "N16-C 다음 실행은 오류 없이 끝난다");
  ok(second.pages[0].includes("id.gt.\"c-02000\""), "N16-C 다음 실행 첫 쪽은 남긴 자리 뒤부터다");
  eq(second.pages.length, 1, "N16-C 남은 230개는 한 쪽이다");
  eq(applied(fx, "c-03").length, 30, "N16-C 다음 실행이 남은 30개를 넣는다");
  const s2 = stateOf(fx);
  deepEq([s2.checked_date, s2.pending_month], ["2026-10-04", ""], "N16-C 끝낸 실행은 checked_date 를 오늘로 옮긴다");
  deepEq(Object.keys(s2).sort(), ["checked_date", "pending_month"], "N16-C 끝내면 이어 읽을 자리를 지운다");
  eq(logOf(fx)[0]?.status, "ok", "N16-C 이어서 끝낸 실행 기록은 ok");
  const third = await runCron(fx, "2026-10-05");
  ok(!third.pages[0].includes("and="), "N16-C 자리를 지운 뒤 실행은 앞에서부터 다시 읽는다");
});

// ── N-16-D: 말일에 쪽 한도로 닿지 못한 31일 규칙은 다음 달 1일 따라잡기가 10월 몫으로 넣는다 ──────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-d", [["user-view", "viewer"]]);
  seedRules(fx, "n16-d", "d", 1, 2100, { user_id: "user-view" });
  seedRules(fx, "n16-d", "d", 3001, 20, { day_of_month: 31 });
  freshState(fx, "2026-10-30");
  await runCron(fx, "2026-10-31");
  eq(applied(fx, "d-03").length, 0, "N16-D 말일 실행은 쪽 한도에 걸려 31일 규칙에 닿지 못했다");
  const s = stateOf(fx);
  ok(s.checked_date < "2026-10-31", `N16-D 말일 실행이 checked_date 를 말일로 옮기지 않는다 (${s.checked_date})`);
  eq(s.pending_month, "2026-10", "N16-D 남은 달 2026-10");
  const nov1 = await runCron(fx, "2026-11-01");
  const oct = applied(fx, "d-03", "2026-10");
  eq(oct.length, 20, `N16-D 11/1 따라잡기가 10월 몫 20개를 넣는다 (예전 0개, 지금 ${oct.length})`);
  ok(oct.every((t) => t.transaction_date === "2026-10-31"), "N16-D 10월 몫은 10월 31일 날짜다");
  eq(applied(fx, "d-03", "2026-11").length, 0, "N16-D 11월 몫(지정일 30일로 당김)은 아직이다");
  ok(nov1.pages[0].includes("id.gt.\"d-02000\"") && nov1.pages[0].includes("last_applied_month.lt.2026-10"), "N16-D 따라잡기는 말일 실행이 남긴 자리 뒤부터 읽는다");
  ok(fx.db.accountbook_recurring.filter((r) => r.id >= "d-03001").every((r) => r.last_applied_month === "2026-10"), "N16-D 따라잡은 규칙의 표식은 2026-10");
  eq(stateOf(fx).checked_date, "2026-10-31", "N16-D 따라잡기를 끝내면 checked_date 는 10월 말일까지다");
});

// ── N-16-E: 예전 상태 값(두 칸·report_rebuild)과 깨진 scan_after 도 그대로 읽는다 ───────────────────────────────
for (const [label, stored] of [
  ["V22.9.76 두 칸", { checked_date: "2026-10-04", pending_month: "" }],
  ["V22.9.77 report_rebuild", { checked_date: "2026-10-04", pending_month: "", report_rebuild: ["2026-09|n16-e"] }],
  ["깨진 scan_after", { checked_date: "2026-10-04", pending_month: "", scan_after: [{ month: "2026-10", day: "x", household_id: 5, id: null }, "junk", { month: "2026-13", day: 1, household_id: "n16-e", id: "e-00001" }] }],
  ["다른 달 scan_after", { checked_date: "2026-10-04", pending_month: "", scan_after: [{ month: "2026-08", day: 9, household_id: "n16-e", id: "e-00009" }] }],
]) {
  await fixture(async (fx) => {
    fx.db.accountbook_recurring.length = 0;
    seedHousehold(fx, "n16-e");
    seedRules(fx, "n16-e", "e", 1, 3, { day_of_month: 5 });
    putSetting(fx, STATE_KEY, JSON.stringify(stored));
    const run = await runCron(fx, "2026-10-05");
    eq(run.error, null, `N16-E ${label}: 실행이 오류 없이 끝난다`);
    ok(!run.pages[0].includes("and="), `N16-E ${label}: 쓸 수 있는 자리가 없으면 앞에서부터 읽는다`);
    eq(applied(fx, "e-").length, 3, `N16-E ${label}: 지정 규칙을 넣는다`);
    const state = stateOf(fx);
    deepEq([Object.keys(state).sort(), state.checked_date], [["checked_date", "pending_month"], "2026-10-05"], `N16-E ${label}: 새로 쓴 상태는 예전 두 칸 형식이다`);
  });
}

// ── N-16-F: 저장소가 이어 읽을 자리를 무시해 같은 쪽을 돌려주면 되풀이하지 않고 멈춘다 ────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-f", [["user-view", "viewer"]]);
  seedRules(fx, "n16-f", "f", 1, 600, { user_id: "user-view" });
  freshState(fx, "2026-10-01");
  const run = await runCron(fx, "2026-10-02", { ignoreCursor: true });
  eq(run.pages.length, 2, "N16-F 같은 쪽이 돌아오면 둘째 쪽에서 멈춘다");
  ok(run.events.some((e) => e.kind === "recurring_page_failed" && /page_not_advanced/.test(e.detail)), "N16-F 운영 이벤트 recurring_page_failed(page_not_advanced)");
  eq(logOf(fx)[0]?.recurring?.partial_reason, "error", "N16-F 실행 기록 partial_reason=error");
  ok(stateOf(fx).checked_date < "2026-10-02", "N16-F checked_date 를 오늘로 옮기지 않는다");
});

// ── N-16-G: 다음 쪽을 읽을 저장소 호출 몫이 없으면 partial(budget)로 멈추고 자리를 남긴다 ──────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n16-g", [["user-view", "viewer"]]);
  seedRules(fx, "n16-g", "m", 1, 520, { user_id: "user-view" });
  seedRules(fx, "n16-g", "m", 1001, 5, { day_of_month: 2 });
  freshState(fx, "2026-10-01");
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-02");
  // 앞 단계가 22회를 쓴 셈: 잠금 1·상태 1·첫 쪽 1·구성원 1 → 26회, 다음 쪽 몫(읽기+묶음 5회)이 정기 반영 한도 30 을 넘는다.
  const tight = await withStore(fx, () => runRecurringAutoApply({ ...fx.env, __AB_DB_BUDGET: { used: 22, limit: 50 } }, { today: "2026-10-02" }));
  deepEq([tight.result.partial, tight.result.partial_reason, tight.result.pages, tight.result.more], [true, "budget", 1, true], "N16-G 호출 몫이 모자라면 다음 쪽을 읽지 않고 partial(budget)");
  deepEq(stateOf(fx).scan_after, [{ month: "2026-10", day: 1, household_id: "n16-g", id: "m-00500" }], "N16-G 첫 쪽 끝 자리를 남긴다");
  const next = await runCron(fx, "2026-10-03");
  eq(applied(fx, "m-01").length, 5, "N16-G 다음 실행이 남은 쪽의 5개를 넣는다");
  ok(next.pages[0].includes("id.gt.\"m-00500\""), "N16-G 다음 실행은 남긴 자리 뒤부터 읽는다");
});

// ── N-18-A: 실행 기록은 최근 14번, 새것이 앞, 정해진 칸과 짧은 코드만, 가계부 id·사람·금액이 없다 ──────────────
const ALLOWED = {
  entry: ["started_at", "finished_at", "status", "version", "recurring", "reports", "cleanup", "errors"],
  recurring: ["households", "rules_seen", "scanned", "applied", "deduplicated", "skipped", "failed", "remaining", "pages", "report_rebuilt", "report_rebuild_pending", "report_rebuild_deferred", "partial", "more", "skipped_run", "partial_reason", "checked_date", "error"],
  reports: ["scanned", "generated", "skipped", "invalid", "failed", "pending_scopes", "partial", "skipped_run", "error"],
  cleanup: ["ok", "skipped", "error"],
};
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n18-a");
  seedRules(fx, "n18-a", "g", 1, 2, { day_of_month: 3 });
  freshState(fx, "2026-09-30");
  for (let day = 1; day <= 16; day += 1) await runCron(fx, `2026-10-${String(day).padStart(2, "0")}`);
  const raw = String(settingValue(fx, LOG_KEY) || "");
  const log = logOf(fx);
  eq(log.length, 14, "N18-A 16번 실행해도 최근 14번만 남는다");
  eq(log[0]?.started_at, new Date(KST("2026-10-16")).toISOString(), "N18-A 맨 앞이 가장 새 실행이다");
  ok(log.every((entry, index) => !index || log[index - 1].started_at > entry.started_at), "N18-A 새것이 앞(시작 시각 내림차순)");
  eq(log[13]?.started_at, new Date(KST("2026-10-03")).toISOString(), "N18-A 가장 오래된 기록은 10/3 실행이다");
  ok(log.every((entry) => ["ok", "partial", "error"].includes(entry.status)), "N18-A 상태는 ok·partial·error 중 하나");
  ok(log.every((entry) => Object.keys(entry).every((key) => ALLOWED.entry.includes(key))
    && ["recurring", "reports", "cleanup"].every((stage) => Object.keys(entry[stage] || {}).every((key) => ALLOWED[stage].includes(key)))), "N18-A 정해진 칸만 있다(가계부 cursor 등은 넣지 않는다)");
  ok(log.length > 0 && log.every((entry) => entry.version && /^V22\.9\./.test(entry.version)), "N18-A 실행한 앱 판이 남는다");
  eq(log.find((entry) => entry.started_at === new Date(KST("2026-10-03")).toISOString())?.recurring?.applied, 2, "N18-A 10/3 실행 기록에 2개 넣음");
  ok(!/n18-a|house-home|user-bin|12345|g-0000/.test(raw), "N18-A 기록에 가계부 id·사람·금액·규칙 id 가 없다");
  ok(raw.length <= 16000, `N18-A 기록 크기 ${raw.length}자 ≤ 16,000`);
  eq(log[0]?.status, "ok", "N18-A 평범한 실행은 ok");
});

// ── N-18-B: 깨진 예전 기록은 새로 시작하고, 배열 안의 이상한 항목은 버리거나 줄인다 ────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  freshState(fx, "2026-10-01");
  putSetting(fx, LOG_KEY, "{not json");
  const broken = await runCron(fx, "2026-10-02");
  eq(broken.error, null, "N18-B 깨진 기록이 있어도 실행은 오류 없이 끝난다");
  eq(logOf(fx).length, 1, "N18-B 깨진 기록(JSON 아님)은 새 기록 하나로 바꾼다");
  ok(broken.events.some((e) => e.kind === "scheduled_run_log_invalid"), "N18-B 운영 이벤트 scheduled_run_log_invalid");
  putSetting(fx, LOG_KEY, JSON.stringify({ items: [] }));
  await runCron(fx, "2026-10-03");
  eq(logOf(fx).length, 1, "N18-B 배열이 아닌 기록도 새로 시작한다");
  putSetting(fx, LOG_KEY, JSON.stringify([1, "x", { started_at: "어제" }, { started_at: "2026-10-01T00:10:00.000Z", status: "weird", recurring: { applied: "9e99", household_id: "n18-secret" }, errors: ["Supabase 400: secret", "recurring:db_503"], memo: "user-bin" }]));
  await runCron(fx, "2026-10-04");
  const log = logOf(fx);
  eq(log.length, 2, "N18-B 이상한 항목은 버리고 쓸 만한 예전 기록 하나는 남긴다");
  const old = log[1] || {};
  deepEq([old.status, old.recurring?.applied, old.recurring?.household_id, old.memo, old.errors], ["error", 1000000000, undefined, undefined, ["error", "recurring:db_503"]], "N18-B 예전 기록도 정해진 칸·범위로 줄인다");
  ok(!String(settingValue(fx, LOG_KEY)).includes("n18-secret"), "N18-B 예전 기록의 모르는 칸은 다시 쓰지 않는다");
});

// ── N-18-C: 기록 저장·읽기가 실패해도 실행은 그대로 끝나고 다시 시도하지 않는다 ─────────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n18-c");
  seedRules(fx, "n18-c", "h", 1, 3, { day_of_month: 2 });
  freshState(fx, "2026-10-01");
  putSetting(fx, LOG_KEY, JSON.stringify([{ started_at: "2026-10-01T00:10:00.000Z", finished_at: "2026-10-01T00:10:01.000Z", status: "ok", errors: [] }]));
  const before = settingValue(fx, LOG_KEY);
  let writes = 0;
  const failedWrite = await runCron(fx, "2026-10-02", { handler: ({ url, method, init }) => (isLogWrite(url, method, init) ? (writes += 1, outage()) : null) });
  eq(failedWrite.error, null, "N18-C 기록 저장이 실패해도 예약 실행은 오류로 끝나지 않는다");
  eq(applied(fx, "h-").length, 3, "N18-C 기록 저장 실패와 상관없이 정기 반영은 들어갔다");
  eq(writes, 1, "N18-C 기록 저장은 한 번만 시도한다(다시 시도하지 않는다)");
  ok(failedWrite.events.some((e) => e.kind === "scheduled_run_log_failed" && e.detail === "write:supabase_write_result_unknown"), "N18-C 운영 이벤트 scheduled_run_log_failed(write:supabase_write_result_unknown, 503 저장은 결과를 모르는 저장)");
  eq(settingValue(fx, LOG_KEY), before, "N18-C 저장에 실패하면 예전 기록이 그대로다");
  eq(stateOf(fx).checked_date, "2026-10-02", "N18-C 정기 반영 상태는 따로 저장됐다");
  let readWrites = 0;
  const failedRead = await runCron(fx, "2026-10-03", { handler: ({ url, method, init }) => { if (isLogWrite(url, method, init)) readWrites += 1; return isLogRead(url, method) ? outage() : null; } });
  eq(failedRead.error, null, "N18-C 기록을 못 읽어도 예약 실행은 오류로 끝나지 않는다");
  eq(readWrites, 0, "N18-C 앞선 기록을 못 읽으면 덮어쓰지 않는다");
  ok(failedRead.events.some((e) => e.kind === "scheduled_run_log_failed" && e.detail === "read:db_503"), "N18-C 운영 이벤트 scheduled_run_log_failed(read:db_503)");
  eq(settingValue(fx, LOG_KEY), before, "N18-C 읽기 실패 뒤에도 예전 기록이 그대로다");
});

// ── N-18-D: 상태 ok·partial·error 와 /ops-dashboard 의 저장된 기록 ───────────────────────────────────────────
await fixture(async (fx) => {
  fx.db.accountbook_recurring.length = 0;
  seedHousehold(fx, "n18-d", [["user-view", "viewer"]]);
  seedRules(fx, "n18-d", "k", 1, 2100, { user_id: "user-view" });
  freshState(fx, "2026-10-01");
  const failed = await runCron(fx, "2026-10-02", { handler: ({ url, method }) => (method === "GET" && url.pathname.endsWith("/accountbook_recurring") ? outage() : null) });
  ok(failed.error, "N18-D 정기 규칙 목록을 못 읽으면 예약 실행은 예전처럼 오류로 끝난다");
  const e1 = logOf(fx)[0] || {};
  deepEq([e1.status, e1.recurring?.error, e1.errors?.includes("recurring:db_503"), !!e1.reports, e1.cleanup?.ok], ["error", "db_503", true, true, true], "N18-D 오류 실행도 기록한다(정기 반영 db_503, 리포트·정리 결과 포함)");
  ok(failed.calls <= 50, `N18-D 오류 실행의 저장소 호출 ${failed.calls}회 ≤ 50`);
  const partial = await runCron(fx, "2026-10-02");
  eq(partial.error, null, "N18-D 쪽 한도 실행은 오류가 아니다");
  eq(logOf(fx)[0]?.status, "partial", "N18-D 쪽 한도에 걸린 실행은 partial");
  fx.db.accountbook_recurring.length = 0;
  const fine = await runCron(fx, "2026-10-03");
  eq(fine.error, null, "N18-D 평범한 실행");
  deepEq(logOf(fx).slice(0, 3).map((entry) => entry.status), ["ok", "partial", "error"], "N18-D 기록 상태 ok·partial·error 가 새것부터 남는다");
  fx.env.ADMIN_API_TOKEN = "qa-admin-token-v22978";
  const dashboard = async (handler = null) => {
    const stop = handler ? intercept(handler) : () => {};
    try {
      const response = await app.fetch(new Request(`${BASE}/ops-dashboard`, { headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, accept: "text/html" } }), fx.env, ctx);
      return { status: response.status, html: await response.text() };
    } finally { stop(); }
  };
  const page = await dashboard();
  eq(page.status, 200, "N18-D 운영 대시보드가 열린다");
  const section = page.html.slice(page.html.indexOf("최근 예약 실행"), page.html.indexOf("최근 운영 이벤트"));
  ok(section.includes("<td class=\"ok\">정상</td>") && section.includes("<td class=\"warn\">일부 남음</td>") && section.includes("<td class=\"bad\">오류</td>"), "N18-D 대시보드에 저장된 실행 세 번(정상·일부 남음·오류)이 보인다");
  ok(section.includes("읽기 한도") && section.includes("오류 db_503") && section.includes("2026-10-03 09:10"), "N18-D 남은 까닭·오류 코드·시작 시각(KST)이 보인다");
  ok(!/n18-d|user-view|12345/.test(section), "N18-D 대시보드 기록에 가계부 id·사람·금액이 없다");
  const unread = await dashboard(({ url, method }) => (isLogRead(url, method) ? outage() : null));
  eq(unread.status, 200, "N18-D 기록을 못 읽어도 대시보드는 열린다");
  ok(unread.html.includes("예약 실행 기록을 불러오지 못했어요."), "N18-D 기록을 못 읽으면 그렇다고 보인다");
});

done();
