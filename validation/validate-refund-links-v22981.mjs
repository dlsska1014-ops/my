// V22.9.81 환불 연결 후속 검사(기능 플래그 REFUND_LINKS_ENABLED, 기본 꺼짐).
//   U-27  정산 완료 이력은 최근 30건만 남는다. 예전에는 잘려 나간 항목의 달이 ‘완료한 달’에서 빠져 그 달의 환불 연결 잠금
//         (앱 확인·검토용 SQL 두 RPC 의 refund_link_month_completed·환급 미리보기 409)이 풀렸다. 이제 잘려 나가는 달에 남는 완료 항목이
//         없으면 같은 배열 맨 앞에 금액 없는 ‘완료 달 표식’을 남긴다(플래그와 상관없이). 표식은 정산 표에 보이지 않는다.
//   U-26  환불 연결 읽기(100 id 묶음마다 limit=1000 한 번)와 차감 읽기(limit=2000 한 번, 2,000건 이상만 잘림으로 봄)가 PostgREST 최대 행
//         (기본 1,000)에서 말없이 잘렸다. 이제 1,000건 쪽으로 끝까지 읽고, 상한(2,000건)을 넘으면 읽기 실패·‘확인 불가’다.
// 플래그 꺼짐 고정값(V22.9.79·V22.9.80 검사기의 FLAG_OFF_GOLDEN)은 그대로다. 이 검사는 30건 이하 저장 값·요청 순서가 예전과 같고,
// 표식이 있어도 정산 화면이 같은지 본다. 연결 표·RPC·내장 조회는 메모리 흉내다(운영 DB 에는 아직 없다, 실행 금지 SQL).
// 옛 코드에서 무엇이 깨지는지 보려면 V22981_SOFT=1 로 돌린다(실패를 모두 적고 끝낸다).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { fixture, intercept, page, post, putSetting, skill, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22981_SOFT === "1";
const failures = [];
let checks = 0;
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 300); } catch (_) { return String(value).slice(0, 300); } };
function record(pass, message, detail = "") { checks += 1; if (!pass) failures.push(detail ? `${message} :: ${detail}` : message); }
const t = {
  ok: (value, message, detail = "") => record(Boolean(value), message, detail),
  eq: (actual, expected, message) => record(actual === expected, message, `실제 ${show(actual)} / 기대 ${show(expected)}`),
  deepEq: (actual, expected, message) => {
    let pass = true;
    try { assert.deepStrictEqual(actual, expected); } catch (_) { pass = false; }
    record(pass, message, `실제 ${show(actual)} / 기대 ${show(expected)}`);
  },
  has: (text, needle, message) => record(String(text ?? "").includes(needle), message, `‘${needle}’ 없음: ${show(String(text ?? "").slice(0, 200))}`),
  lacks: (text, needle, message) => record(!String(text ?? "").includes(needle), message, `‘${needle}’ 있음`),
};
async function load(rel) { try { return await import(new URL(rel, import.meta.url).href); } catch (_) { return {}; } }
const settlementPages = await load("../src/modules/features/settlement-ops-pages.js");
const feature = await load("../src/modules/features/settlement-refund-links.js");
const call = (mod, name, ...args) => { try { return typeof mod[name] === "function" ? mod[name](...args) : undefined; } catch (_) { return undefined; } };
// 던지면 { thrown, code } 로 돌려준다(읽기 실패를 빈 값과 가르기 위해).
const callAsync = async (mod, name, ...args) => {
  try { return typeof mod[name] === "function" ? await mod[name](...args) : { missing: name }; } catch (error) { return { thrown: String(error?.message || error), code: String(error?.code || "") }; }
};
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const sha = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 24);
const decode = (text = "") => String(text).replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html = "") => decode(String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");
const mainOf = (html = "") => { const start = html.indexOf("<main"); const end = html.indexOf("</main>"); return start >= 0 && end > start ? html.slice(start, end + 7) : ""; };
// 화면 후처리가 card 에 클래스를 더한다(abV5SectionCard).
const historySectionOf = (html = "") => html.match(/<section class="card[^"]*"><h2>정산 완료·이력<\/h2>[\s\S]*?<\/section>/)?.[0] || "";
const refundSectionOf = (html = "") => textOf(html.match(/<section class="card[^"]*" id="refund-links">[\s\S]*?<\/section>/)?.[0] || "");
function postForms(html = "", action = "") {
  const out = [];
  for (const match of String(html).matchAll(/<form\b([^>]*)>([\s\S]*?)<\/form>/g)) {
    const attrs = match[1];
    if (!/method="post"/i.test(attrs) || attrs.match(/action="([^"]*)"/)?.[1] !== action) continue;
    const fields = Object.create(null);
    for (const input of match[2].matchAll(/<input\b([^>]*)>/g)) {
      const name = input[1].match(/\bname="([^"]*)"/)?.[1];
      if (name) fields[name] = decode(input[1].match(/\bvalue="([^"]*)"/)?.[1] ?? "");
    }
    out.push(fields);
  }
  return out;
}

// ── 자료 ────────────────────────────────────────────────────────────────────────
const HH = "house-home";
const OCT = "2026-10";
const OLD = "2024-05"; // 30건 이력의 가장 오래된 달. 31번째 완료에서 잘려 나간다.
const TODAY = "2026-10-15";
const HISTORY_KEY = `settlement_history:${HH}`;
const MARKER_KIND = "settlement_month_completed";
const marker = (month) => ({ kind: MARKER_KIND, month, status: "completed" });
const isMarker = (item) => Boolean(item) && typeof item === "object" && item.kind === MARKER_KIND;
const tx = (id, user, type, amount, category, memo, date, extra = {}) => ({ id, household_id: HH, user_id: user, type, amount, category, memo, payment_method: "카드", transaction_date: date, source: "my_web", raw_text: memo, created_at: `${date}T09:00:00.000Z`, ...extra });
const BASE_ROWS = () => [
  tx("e1", "user-bin", "expense", 100000, "생활", "쿠팡 주문", "2026-10-03"),
  tx("e2", "user-wifi", "expense", 30000, "식비", "점심", "2026-10-05"),
  tx("em1", "user-bin", "expense", 50000, "생활", "가전 주문", "2024-05-03"),
  tx("em2", "user-wifi", "expense", 20000, "식비", "장보기", "2024-05-04"),
  tx("rm1", "user-bin", "income", 30000, "환급", "가전 환불", "2024-05-12"),
];
const LINK_M = () => ({ id: "link-m", household_id: HH, expense_id: "em2", refund_id: "rm1", amount: 5000, created_by: "user-bin", created_at: "2024-05-12T01:00:00Z" });
function monthsFrom(start, count) {
  const out = [];
  let year = Number(start.slice(0, 4));
  let month = Number(start.slice(5, 7));
  for (let i = 0; i < count; i += 1) {
    out.push(`${year}-${String(month).padStart(2, "0")}`);
    month += 1;
    if (month > 12) { month = 1; year += 1; }
  }
  return out;
}
const entry = (month, n) => ({
  id: `hist-${n}`, schema_version: 2, month, mode: "equal", conditions: { weights: {}, itemParticipants: {} },
  total_expense: 1000 + n, participant_count: 2, shares: [], transfers: [], rows_digest: "0".repeat(32),
  note: `이력 ${n}`, completed_by: "user-bin", completed_at: "2026-01-01T00:00:00.000Z", status: "completed",
});
const THIRTY = () => monthsFrom(OLD, 30).map((month, i) => entry(month, i + 1)); // 2024-05 … 2026-10
const storedHistory = (fx) => { try { return JSON.parse(fx.db.accountbook_settings.find((row) => row.key === HISTORY_KEY)?.value || "[]"); } catch (_) { return null; } };

function seed(fx, { flag, rows = BASE_ROWS(), links = [], history = null } = {}) {
  if (flag === undefined) delete fx.env.REFUND_LINKS_ENABLED; else fx.env.REFUND_LINKS_ENABLED = flag;
  fx.db.transactions = rows;
  fx.db.accountbook_refund_links = links;
  fx.db.accountbook_settings.push({ id: "sel-v22981-refund", key: "kakao_selected_household_v2251:user-bin", value: HH, created_at: "2026-07-01T00:00:00Z" });
  if (history) putSetting(fx, HISTORY_KEY, JSON.stringify(history));
}

// ── 메모리 흉내: 두 RPC(완료 달 확인은 검토용 SQL 과 같은 술어)·내장 조회(쪽·최대 행) ────────────────────────
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const rpcError = (message) => json({ code: "P0001", details: null, hint: null, message }, 400);
// SQL: 값이 비면 통과, JSON 배열이 아니면 refund_link_history_invalid,
// EXISTS (… jsonb_array_elements(v_history) h(item) WHERE jsonb_typeof(h.item) = 'object' AND h.item->>'month' = v_month) 이면 막는다.
function sqlMonthCheck(fx, month) {
  const raw = fx.db.accountbook_settings.find((row) => row.key === HISTORY_KEY)?.value;
  if (String(raw ?? "").trim() === "") return "";
  let value;
  try { value = JSON.parse(raw); } catch (_) { return "refund_link_history_invalid"; }
  if (!Array.isArray(value)) return "refund_link_history_invalid";
  return value.some((item) => item !== null && typeof item === "object" && !Array.isArray(item) && item.month === month) ? "refund_link_month_completed" : "";
}
const findTx = (fx, id) => fx.db.transactions.find((row) => String(row.id) === String(id)) || null;
const REFUND_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "transaction_date"];
const EXPENSE_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "memo", "raw_text", "transaction_date"];
const pick = (row, cols) => (row ? Object.fromEntries(cols.map((col) => [col, row[col] ?? null])) : null);
const byCreated = (a, b) => String(a.created_at).localeCompare(String(b.created_at)) || String(a.id).localeCompare(String(b.id));
// PostgREST 쪽 나누기: offset 부터 min(limit, 최대 행) 건. limit 이 없으면 최대 행까지.
const pageOf = (rows, url, cap) => {
  const offset = Math.max(0, Number(url.searchParams.get("offset") || 0));
  const asked = url.searchParams.has("limit") ? Math.max(0, Number(url.searchParams.get("limit"))) : Infinity;
  return rows.slice(offset, offset + Math.min(cap, asked));
};
function embedRows(links, txById, url) {
  const hid = String(url.searchParams.get("household_id") || "").replace(/^eq\./, "");
  const filters = url.searchParams.getAll("refund.transaction_date");
  const gte = filters.find((v) => v.startsWith("gte."))?.slice(4) || "";
  const lt = filters.find((v) => v.startsWith("lt."))?.slice(3) || "";
  return links
    .filter((l) => !hid || l.household_id === hid)
    .map((l) => ({ l, refund: txById(l.refund_id), expense: txById(l.expense_id) }))
    .filter(({ refund }) => refund && (!gte || refund.transaction_date >= gte) && (!lt || refund.transaction_date < lt))
    .sort((a, b) => byCreated(a.l, b.l))
    .map(({ l, refund, expense }) => ({ id: l.id, household_id: l.household_id, expense_id: l.expense_id, refund_id: l.refund_id, amount: l.amount, created_at: l.created_at, refund: pick(refund, REFUND_COLS), expense: pick(expense, EXPENSE_COLS) }));
}
function refundDb(fx, { embedCap = 1000 } = {}) {
  const log = { requests: [], rpc: [] };
  let seq = 0;
  intercept(async ({ url, method, init }) => {
    if (url.hostname !== "mock.supabase.co") return undefined;
    log.requests.push(`${method} ${url.pathname}${decodeURIComponent(url.search)}`);
    if (url.pathname === "/rest/v1/accountbook_refund_links" && method === "GET" && String(url.searchParams.get("select") || "").includes("refund:transactions!")) {
      return json(pageOf(embedRows(fx.db.accountbook_refund_links || [], (id) => findTx(fx, id), url), url, embedCap));
    }
    const name = url.pathname.match(/^\/rest\/v1\/rpc\/(accountbook_(?:link|unlink)_refund_v22979)$/)?.[1];
    if (!name) return undefined; // 연결 표의 일반 읽기는 픽스처가 한다(in.·eq.·order·offset·limit·__max_rows).
    const body = JSON.parse(String(init.body || "{}"));
    log.rpc.push({ name, body });
    if (!body.p_household_id) return rpcError("refund_link_input_invalid");
    const links = fx.db.accountbook_refund_links;
    if (name === "accountbook_link_refund_v22979") {
      const refund = findTx(fx, body.p_refund_id);
      if (!refund) return rpcError("refund_link_record_not_found");
      const blocked = sqlMonthCheck(fx, String(refund.transaction_date).slice(0, 7));
      if (blocked) return rpcError(blocked);
      const id = `link-new-${++seq}`;
      links.push({ id, household_id: HH, expense_id: body.p_expense_id, refund_id: body.p_refund_id, amount: body.p_amount, created_by: body.p_actor_user_id, created_at: "2026-10-15T03:00:00Z" });
      return json({ ok: true, link_id: id, amount: body.p_amount });
    }
    const index = links.findIndex((link) => link.id === body.p_link_id && link.household_id === body.p_household_id);
    if (index < 0) return rpcError("refund_link_not_found");
    const refund = findTx(fx, links[index].refund_id);
    const blocked = refund ? sqlMonthCheck(fx, String(refund.transaction_date).slice(0, 7)) : "";
    if (blocked) return rpcError(blocked);
    const [removed] = links.splice(index, 1);
    return json({ ok: true, link_id: removed.id, amount: removed.amount });
  });
  log.calls = (name) => log.rpc.filter((entry) => entry.name === name && entry.body.p_household_id);
  log.refundRequests = () => log.requests.filter((line) => /refund_links|refund_review_kept|refund_v22979/.test(line));
  log.shape = (from = 0) => log.requests.slice(from).map((line) => line.split("?")[0]);
  return log;
}

async function completeMonth(fx, month, note) {
  const summary = await page(fx, `/settlement-summary?month=${month}&household_id=${HH}`);
  const form = postForms(summary.html, "/my/settlement/save")[0] || {};
  return post(fx, "/my/settlement/save", { ...form, note, confirmed: "yes" });
}
async function pickerForm(fx, refundId, expenseId, month) {
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${month}&refund_id=${refundId}`);
  return { picker, form: postForms(picker.html, "/my/settlement/refund-link").find((fields) => fields.expense_id === expenseId) || null };
}
async function scenario(name, task) {
  try {
    await withClock(TODAY, () => fixture(async (fx) => { await task(fx); }));
    record(true, `${name}: 장면이 예외 없이 끝난다`);
  } catch (error) {
    record(false, `${name}: 장면이 예외 없이 끝난다`, String(error?.stack || error).slice(0, 500));
  }
}

// ── 1. U-27 저장 규칙(요청 없음) ─────────────────────────────────────────────────────────────
{
  const forSave = (list) => plain(call(settlementPages, "settlementHistoryForSave", list));
  t.ok(typeof settlementPages.settlementHistoryForSave === "function", "U-27: 두 저장 경로가 함께 쓰는 저장 규칙 settlementHistoryForSave 가 있다");
  // 30건 이하: 예전 history.slice(-30) 과 바이트 단위로 같다(플래그 꺼짐 저장 값 그대로).
  const sameAsOld = [0, 1, 5, 29, 30].every((count) => {
    const list = monthsFrom("2020-01", count).map((month, i) => entry(month, i));
    return JSON.stringify(forSave(list)) === JSON.stringify(list.slice(-30));
  });
  t.ok(sameAsOld, "U-27: 완료 항목이 30건 이하면 저장 값이 예전(slice(-30))과 같다");
  const t31 = monthsFrom(OLD, 31).map((month, i) => entry(month, i));
  const saved31 = forSave(t31);
  t.eq(saved31?.length, 31, "U-27: 31건이면 표식 1개 + 최근 30건");
  t.deepEq(saved31?.[0], marker(OLD), "U-27: 잘려 나간 달(그 달의 완료 항목이 더 없음)은 맨 앞 표식으로 남는다");
  t.deepEq(saved31?.slice(1), t31.slice(1), "U-27: 남는 30건은 예전과 같은 최근 30건(순서 그대로)");
  // 같은 달의 완료 항목이 남아 있으면 표식을 만들지 않는다.
  const sameMonth = [entry(OLD, 0), ...monthsFrom("2024-06", 29).map((month, i) => entry(month, i + 1)), entry(OLD, 99)];
  t.deepEq(forSave(sameMonth), sameMonth.slice(-30), "U-27: 잘려 나간 달의 완료 항목이 남아 있으면 표식이 없다");
  // 있던 표식은 지우지 않고 달 순서로 맨 앞에 둔다. 표식은 30건에 세지 않고 같은 달 표식은 하나다.
  const withMarkers = [marker("2023-05"), marker("2023-01"), entry("2023-05", 50), ...t31];
  const savedMarkers = forSave(withMarkers);
  t.deepEq(savedMarkers?.slice(0, 3), [marker("2023-01"), marker("2023-05"), marker(OLD)], "U-27: 있던 표식은 그대로, 새 표식과 함께 달 순서, 같은 달은 하나");
  t.deepEq(savedMarkers?.slice(3), t31.slice(1), "U-27: 표식은 30건에 세지 않는다");
  // 같은 달이 여러 번 잘려도 표식은 하나, 달을 읽을 수 없는 항목·객체가 아닌 항목은 표식을 만들지 않는다.
  const messy = [entry("2023-02", 1), entry("2023-02", 2), { ...entry("2026-13", 3) }, { note: "달 없음" }, null, ...monthsFrom("2024-01", 30).map((month, i) => entry(month, 10 + i))];
  t.deepEq(forSave(messy)?.filter(isMarker), [marker("2023-02")], "U-27: 같은 달 여러 건은 표식 하나, 잘못된 달·달 없음·null 은 표식 없음");
  // 100번 완료해도 완료한 달이 모두 잠긴 채로 남는다(표식 70 + 완료 항목 30).
  let history = [];
  const months100 = monthsFrom("2016-01", 100);
  for (const [i, month] of months100.entries()) history = forSave([...(history || []), entry(month, i)]) || [];
  const locked = new Set(history.map((item) => item?.month));
  t.ok(history.length === 100 && history.filter(isMarker).length === 70 && history.slice(70).every((item) => !isMarker(item)), "U-27: 100번 완료하면 표식 70개 + 최근 완료 30건");
  t.ok(months100.every((month) => locked.has(month)), "U-27: 100번 완료해도 완료한 달 100개가 모두 남는다(잠금이 풀리지 않는다)");
  t.ok(JSON.stringify(history.slice(0, 70)).length < 70 * 80, "U-27: 표식은 짧다(달 하나에 80바이트 미만, 달은 2000-01~2099-12 1,200개뿐)");
}

// ── 2. U-27 플래그 꺼짐: 30건 이하는 예전 그대로, 31번째 완료에서 표식, 요청 순서 그대로 ─────────────────────────
let shapeAtFive = [];
await scenario("플래그 꺼짐·이력 5건", async (fx) => {
  const five = monthsFrom("2026-05", 5).map((month, i) => entry(month, i + 1));
  seed(fx, { history: five });
  const log = refundDb(fx);
  const summary = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  const form = postForms(summary.html, "/my/settlement/save")[0] || {};
  const from = log.requests.length;
  const saved = await post(fx, "/my/settlement/save", { ...form, note: "합성 정산 6", confirmed: "yes" });
  shapeAtFive = log.shape(from);
  const history = storedHistory(fx);
  t.ok(saved.location.includes("msg=settlement_completed"), "꺼짐 5건: 완료 저장");
  t.ok(history?.length === 6 && !history.some(isMarker), "꺼짐 5건: 표식 없이 6건");
  t.deepEq(history?.slice(0, 5), five, "꺼짐 5건: 앞 5건은 저장 전 값 그대로");
  t.eq(log.refundRequests().length, 0, "꺼짐 5건: 연결 표·RPC 요청 없음");
});
await scenario("플래그 꺼짐·31번째 완료", async (fx) => {
  seed(fx, { history: THIRTY() });
  const log = refundDb(fx);
  const summary = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  const form = postForms(summary.html, "/my/settlement/save")[0] || {};
  const from = log.requests.length;
  const saved = await post(fx, "/my/settlement/save", { ...form, note: "합성 정산 31", confirmed: "yes" });
  const history = storedHistory(fx);
  t.ok(saved.location.includes("msg=settlement_completed"), "꺼짐 31번째: 완료 저장");
  t.eq(history?.length, 31, "꺼짐 31번째: 표식 1개 + 완료 30건");
  t.deepEq(history?.[0], marker(OLD), "꺼짐 31번째: 잘려 나간 2024-05 는 맨 앞 표식으로 남는다(플래그가 꺼져 있어도)");
  t.deepEq(history?.slice(1, 30), THIRTY().slice(1), "꺼짐 31번째: 남는 옛 완료 29건은 그대로");
  t.ok(history?.[30]?.month === OCT && history?.[30]?.note === "합성 정산 31" && history?.[30]?.schema_version === 2, "꺼짐 31번째: 새 완료가 맨 뒤(예전 모양)");
  t.deepEq(log.shape(from), shapeAtFive, "꺼짐 31번째: 저장 요청의 순서·주소는 30건 이하 저장과 같다(더한 요청 없음)");
  t.eq(log.refundRequests().length, 0, "꺼짐 31번째: 연결 표·RPC 요청 없음");
  t.eq(sqlMonthCheck(fx, OLD), "refund_link_month_completed", "꺼짐 31번째: 저장된 값으로 SQL 의 완료 달 확인도 2024-05 를 막는다");
  t.eq(sqlMonthCheck(fx, "2024-04"), "", "꺼짐 31번째: 완료하지 않은 달은 막지 않는다");
  // 정산 화면: 표식은 보이지 않고, 표식을 뺀 이력과 화면이 바이트 단위로 같다.
  const withMarker = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  putSetting(fx, HISTORY_KEY, JSON.stringify(history.filter((item) => !isMarker(item))));
  const withoutMarker = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  putSetting(fx, HISTORY_KEY, JSON.stringify(history));
  t.ok(withMarker.status === 200 && sha(mainOf(withMarker.html)) === sha(mainOf(withoutMarker.html)), "꺼짐 31번째: 정산 화면은 표식이 있어도 없을 때와 같다");
  t.lacks(withMarker.html, MARKER_KIND, "꺼짐 31번째: 화면에 표식 이름이 나오지 않는다");
  t.eq((historySectionOf(withMarker.html).match(/<tr><td>/g) || []).length, 8, "꺼짐 31번째: 이력 표는 최근 8건 그대로");
  // 환급 미리보기(플래그와 상관없음)도 잘려 나간 달을 완료한 달로 본다.
  const preview = await page(fx, `/my/settlement/refund-preview?household_id=${HH}&month=${OLD}`);
  t.ok(preview.status === 409 && preview.html.includes("완료 이력이 있는 달은 환급을 다시 계산하지 않습니다."), "꺼짐 31번째: 환급 미리보기도 2024-05 를 완료한 달로 막는다(409)");
  const open = await page(fx, `/my/settlement/refund-preview?household_id=${HH}&month=2024-04`);
  t.ok(open.status !== 409, "꺼짐 31번째: 완료하지 않은 달의 미리보기는 그대로 열린다");
});
await scenario("표식이 섞인 짧은 이력", async (fx) => {
  seed(fx, { history: [marker("2024-01"), entry("2026-08", 1), entry("2026-09", 2)] });
  refundDb(fx);
  const summary = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  const section = historySectionOf(summary.html);
  t.ok(summary.status === 200 && (section.match(/<tr><td>/g) || []).length === 2 && !section.includes("<td>2024-01</td>"), "U-27: 이력 표는 표식을 빼고 완료 항목만 그린다");
});

// ── 3. U-27 플래그 켜짐: 잘려 나간 달의 연결·풀기·고르기를 막는다(앱 확인·SQL 확인) ─────────────────────────────
await scenario("플래그 켜짐·잘려 나간 달", async (fx) => {
  seed(fx, { flag: "1", links: [LINK_M()] });
  const log = refundDb(fx);
  const { form } = await pickerForm(fx, "rm1", "em1", OLD);
  t.ok(form?.source_digest?.length === 32, "켜짐: 이력이 비었을 때 연 고르기 화면의 폼(2024-05 환급 ↔ 가전 주문)");
  putSetting(fx, HISTORY_KEY, JSON.stringify(THIRTY()));
  const saved = await completeMonth(fx, OCT, "합성 정산 31");
  const history = storedHistory(fx);
  t.ok(saved.location.includes("msg=settlement_completed") && history?.length === 31, "켜짐: 31번째 완료(플래그 켜짐 저장)");
  t.deepEq(history?.[0], marker(OLD), "켜짐: 플래그 켜짐 저장도 잘려 나간 달을 표식으로 남긴다");
  const locked = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${OLD}&refund_id=rm1`);
  t.ok(locked.html.includes("정산을 완료한 달의 환급은 연결하거나 풀 수 없어요.") && !postForms(locked.html, "/my/settlement/refund-link").length, "켜짐: 고르기 화면은 잘려 나간 달도 잠김을 알리고 후보를 내지 않는다");
  const link = await post(fx, "/my/settlement/refund-link", { ...(form || {}) });
  t.ok(link.location.includes("err=refund_link_month_completed"), "켜짐: 열어 둔 폼으로 연결해도 refund_link_month_completed");
  t.ok(log.calls("accountbook_link_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 1, "켜짐: RPC 를 부르지 않고 연결도 늘지 않는다");
  const unlink = await post(fx, "/my/settlement/refund-unlink", { household_id: HH, month: OLD, link_id: "link-m", amount: "5000" });
  t.ok(unlink.location.includes("err=refund_link_month_completed") && log.calls("accountbook_unlink_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 1, "켜짐: 잘려 나간 달의 연결 풀기도 막는다");
  const summary = await page(fx, `/settlement-summary?month=${OLD}&household_id=${HH}`);
  t.ok(summary.status === 200 && refundSectionOf(summary.html).includes("정산을 완료한 달이라 연결을 바꿀 수 없어요.") && !postForms(summary.html, "/my/settlement/refund-unlink").length, "켜짐: 2024-05 정산 화면의 환불 구역이 잠김을 알리고 풀기 단추가 없다");
  t.eq(sqlMonthCheck(fx, OLD), "refund_link_month_completed", "켜짐: 앱 확인을 건너뛰어도 SQL 의 완료 달 확인이 표식으로 막는다");
});
await scenario("플래그 꺼짐에서 잘린 뒤 켜기", async (fx) => {
  seed(fx, { flag: "1", links: [LINK_M()] });
  const log = refundDb(fx);
  const { form } = await pickerForm(fx, "rm1", "em1", OLD);
  t.ok(form?.source_digest?.length === 32, "꺼짐→켜짐: 켜기 전에 연 고르기 화면의 폼");
  delete fx.env.REFUND_LINKS_ENABLED;
  putSetting(fx, HISTORY_KEY, JSON.stringify(THIRTY()));
  const before = log.refundRequests().length;
  const saved = await completeMonth(fx, OCT, "꺼진 채 31번째");
  t.ok(saved.location.includes("msg=settlement_completed") && log.refundRequests().length === before, "꺼짐→켜짐: 꺼진 채 31번째 완료(연결 표 요청 없음)");
  t.deepEq(storedHistory(fx)?.[0], marker(OLD), "꺼짐→켜짐: 꺼진 채 저장해도 표식이 남는다");
  fx.env.REFUND_LINKS_ENABLED = "1";
  const link = await post(fx, "/my/settlement/refund-link", { ...(form || {}) });
  t.ok(link.location.includes("err=refund_link_month_completed") && log.calls("accountbook_link_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 1, "꺼짐→켜짐: 켠 뒤에도 플래그를 켜기 전에 완료한 달은 잠겨 있다");
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${OLD}&refund_id=rm1`);
  t.ok(picker.html.includes("정산을 완료한 달의 환급은 연결하거나 풀 수 없어요."), "꺼짐→켜짐: 고르기 화면도 잠김");
});

// ── 4. U-26 연결 읽기·차감 읽기(직접 부름, 서버 최대 행 1,000) ───────────────────────────────────────
const ENV = { REFUND_LINKS_ENABLED: "1", SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "qa" };
const inList = (value = "") => (String(value).match(/^in\.\((.*)\)$/)?.[1] || "").split(",").map((id) => id.replace(/^"|"$/g, "")).filter(Boolean);
// 연결 표(일반 읽기·내장 조회)만 흉내 내는 서버. 설정 읽기는 빈 목록. shape:"object" 는 배열이 아닌 200 응답.
async function withLinkServer(links, task, { cap = 1000, shape = "array", txById = () => null } = {}) {
  const requests = [];
  const stop = intercept(({ url, method }) => {
    if (url.hostname !== "mock.supabase.co") return undefined;
    if (method !== "GET" || url.pathname !== "/rest/v1/accountbook_refund_links") return json([]);
    requests.push(decodeURIComponent(url.search));
    if (shape !== "array") return json({ rows: [] });
    if (String(url.searchParams.get("select") || "").includes("refund:transactions!")) return json(pageOf(embedRows(links, txById, url), url, cap));
    const hid = String(url.searchParams.get("household_id") || "").replace(/^eq\./, "");
    const refundIds = url.searchParams.has("refund_id") ? new Set(inList(url.searchParams.get("refund_id"))) : null;
    const expenseIds = url.searchParams.has("expense_id") ? new Set(inList(url.searchParams.get("expense_id"))) : null;
    const rows = links.filter((l) => l.household_id === hid && (!refundIds || refundIds.has(l.refund_id)) && (!expenseIds || expenseIds.has(l.expense_id))).sort(byCreated);
    return json(pageOf(rows, url, cap));
  });
  try { return { result: await task(), requests }; } finally { stop(); }
}
const pad = (n) => String(n).padStart(5, "0");
const at = (n) => `2026-10-12T${String(Math.floor(n / 3600) % 24).padStart(2, "0")}:${String(Math.floor(n / 60) % 60).padStart(2, "0")}:${String(n % 60).padStart(2, "0")}Z`;
const REFUND = tx("rbig", "user-bin", "income", 2000000, "환급", "큰 환불", "2026-10-12");
const EXPENSE = tx("ebig", "user-bin", "expense", 2000000, "생활", "큰 지출", "2026-10-03");
const manyLinks = (count, { expense = (i) => `ex-${pad(i)}`, refund = () => "rbig", amount = 10 } = {}) => Array.from({ length: count }, (_, i) => ({ id: `ln-${pad(i)}`, household_id: HH, expense_id: expense(i), refund_id: refund(i), amount, created_by: "user-bin", created_at: at(i) }));
{
  const state = (links, options) => withLinkServer(links, () => callAsync(feature, "loadRefundLinkMonthState", ENV, { householdId: HH, monthRows: [REFUND], withExpenses: false }), options);
  const small = await state(manyLinks(999));
  t.ok(small.result?.links?.length === 999 && small.requests.length === 1, "U-26: 연결 999건은 한 번 읽기(요청 수 그대로)");
  const mid = await state(manyLinks(1500));
  t.ok(mid.result?.links?.length === 1500 && mid.result?.linkedTotal === 15000, "U-26: 한 환급에 연결 1,500건(최대 행 1,000)도 끝까지 읽는다(합계 15,000원)");
  t.ok(mid.requests.length === 2 && mid.requests[1].includes("offset=1000"), "U-26: 1,000건 쪽 두 번(offset 0·1000)");
  const over = await state(manyLinks(2500));
  t.ok(over.result?.thrown && over.result.code === "row_limit_exceeded", "U-26: 연결이 상한(2,000건)을 넘으면 일부로 계산하지 않고 읽기 실패(row_limit_exceeded)", show(over.result?.links?.length));
  const bad = await state(manyLinks(3), { shape: "object" });
  t.ok(Boolean(bad.result?.thrown), "U-26: 배열이 아닌 응답은 ‘연결 없음’이 아니라 읽기 실패");
  const count = (links) => withLinkServer(links, () => callAsync(feature, "refundLinkCountForRow", ENV, HH, { id: "ebig", type: "expense", category: "생활" }));
  t.eq((await count(manyLinks(1500, { expense: () => "ebig", refund: (i) => `rf-${pad(i)}` }))).result, 1500, "U-26: 카카오 삭제 답장의 연결 수도 1,000건에서 잘리지 않는다");
  t.eq((await count(manyLinks(2500, { expense: () => "ebig", refund: (i) => `rf-${pad(i)}` }))).result, null, "U-26: 상한을 넘으면 연결 수는 null(‘확인 불가’)");

  const txById = (id) => (id === "rbig" ? REFUND : id === "ebig" ? EXPENSE : null);
  const deductions = (count) => withLinkServer(manyLinks(count, { expense: () => "ebig", amount: 1 }), () => callAsync(feature, "loadRefundDeductions", ENV, { householdId: HH, start: "2026-10-01", end: "2026-11-01" }), { txById });
  const d10 = await deductions(10);
  t.ok(d10.result?.failed === false && d10.result?.entries?.length === 10 && d10.requests.length === 1, "U-26: 차감 10건은 한 번 읽기(홈 조회 수 그대로)");
  const d1500 = await deductions(1500);
  t.ok(d1500.result?.failed === false && d1500.result?.entries?.length === 1500, "U-26: 차감 1,500건(최대 행 1,000)도 끝까지 읽는다", show({ failed: d1500.result?.failed, entries: d1500.result?.entries?.length }));
  const d2000 = await deductions(2000);
  t.ok(d2000.result?.failed === false && d2000.result?.entries?.length === 2000 && d2000.requests.length === 3, "U-26: 정확히 2,000건은 두 쪽 + 한 건 확인 뒤 모두 쓴다", show({ failed: d2000.result?.failed, entries: d2000.result?.entries?.length, requests: d2000.requests.length }));
  const d2001 = await deductions(2001);
  t.ok(d2001.result?.failed === true && d2001.result?.entries === null && d2001.result?.links === null, "U-26: 2,000건을 넘으면 ‘확인 불가’(entries·links null)", show({ failed: d2001.result?.failed, entries: d2001.result?.entries?.length }));
  const dBad = await withLinkServer([], () => callAsync(feature, "loadRefundDeductions", ENV, { householdId: HH, start: "2026-10-01", end: "2026-11-01" }), { shape: "object" });
  t.ok(dBad.result?.failed === true && dBad.result?.entries === null, "U-26: 배열이 아닌 차감 응답도 ‘확인 불가’");
  const off = await withLinkServer(manyLinks(5), () => callAsync(feature, "loadRefundDeductions", {}, { householdId: HH, start: "2026-10-01", end: "2026-11-01" }));
  t.ok(off.result?.enabled === false && off.requests.length === 0, "U-26: 플래그가 꺼져 있으면 차감을 읽지 않는다");
}

// ── 5. U-26 화면·답장(픽스처, 최대 행 1,000) ─────────────────────────────────────────────────────
const crowdRows = (count) => [
  tx("rb", "user-bin", "income", 50000, "환급", "모아 받은 환불", "2026-10-12"),
  ...Array.from({ length: count }, (_, i) => tx(`eb-${pad(i)}`, "user-bin", "expense", 100, "생활", `소모품 ${i}`, "2026-10-03", { created_at: at(i) })),
];
const crowdLinks = (count) => manyLinks(count, { expense: (i) => `eb-${pad(i)}`, refund: () => "rb" });
await scenario("연결 1,200건", async (fx) => {
  seed(fx, { flag: "1", rows: crowdRows(1200), links: crowdLinks(1200) });
  fx.db.__max_rows = 1000;
  refundDb(fx);
  const summary = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  t.ok(summary.status === 200 && summary.html.includes("연결한 환불 12,000원은 이 정산과 완료 이력에 반영했습니다."), "U-26 화면: 정산 화면은 연결 1,200건을 모두 반영한다(12,000원)", show(summary.html.match(/연결한 환불 [\d,]+원/)?.[0] || summary.status));
  const reply = await skill(fx, "정산");
  t.has(reply, "(환불 12,000원 뺌)", "U-26 답장: 카카오 정산도 1,200건을 모두 뺀다");
});
await scenario("연결 2,500건", async (fx) => {
  seed(fx, { flag: "1", rows: crowdRows(3), links: crowdLinks(2500) });
  fx.db.__max_rows = 1000;
  refundDb(fx);
  const summary = await page(fx, `/settlement-summary?month=${OCT}&household_id=${HH}`);
  t.ok(summary.status !== 200 && !summary.html.includes("연결한 환불"), "U-26 화면: 상한을 넘으면 일부 연결로 정산하지 않는다(안전 화면)", show(summary.status));
  const reply = await skill(fx, "정산");
  t.ok(!reply.includes("총 지출:") && !/환불 [\d,]+원 뺌/.test(reply), "U-26 답장: 카카오 정산도 일부 연결로 금액을 말하지 않는다", show(reply.slice(0, 120)));
  const saved = await completeMonth(fx, OCT, "넘친 연결");
  t.ok(!saved.location.includes("msg=settlement_completed") && !(storedHistory(fx) || []).length, "U-26: 완료 저장도 일부 연결로 남기지 않는다");
});
await scenario("차감 2,500건", async (fx) => {
  const rows = [tx("rd", "user-bin", "income", 50000, "환급", "환불", "2026-10-12"), tx("ed", "user-bin", "expense", 90000, "생활", "주문", "2026-10-03")];
  seed(fx, { flag: "1", rows, links: manyLinks(2500, { expense: () => "ed", refund: () => "rd", amount: 1 }) });
  refundDb(fx, { embedCap: 1000 });
  const home = await page(fx, `/app?month=${OCT}&household_id=${HH}`);
  t.ok(home.status === 200 && home.html.includes("환불 차감 확인 불가"), "U-26 홈: 차감이 상한을 넘으면 ‘환불 차감 확인 불가’(기록 그대로)");
  t.ok(!/환불 차감 [\d,]+원 반영/.test(home.html), "U-26 홈: 일부(1,000건)만 뺀 금액을 보이지 않는다");
});

// ── 6. 검토용 SQL·가계부 삭제 SQL ─────────────────────────────────────────────────────────────
{
  const read = (rel) => { const path = new URL(`../${rel}`, import.meta.url); return existsSync(path) ? readFileSync(path, "utf8") : ""; };
  const apply = read("migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql");
  const rollback = read("migrations/V22_9_79_REFUND_LINKS_ROLLBACK_REVIEW_ONLY.sql");
  const lifecycle = read("docs/db-review/v22961/10_APPLY_LIFECYCLE_REVIEW_ONLY.sql");
  t.ok(apply.split("\n")[0].includes("실행 금지(DO NOT RUN)") && apply.split("\n")[0].includes("운영자 승인 전"), "SQL: 첫 줄이 실행 금지 머리말 그대로");
  const guardAt = apply.indexOf("RAISE EXCEPTION 'v22979_review_only_refund_links_approval_required'");
  const firstChange = Math.min(...["CREATE ", "DROP ", "ALTER ", "INSERT ", "DELETE "].map((word) => { const found = apply.search(new RegExp(`^\\s*${word}`, "m")); return found < 0 ? Infinity : found; }));
  t.ok(apply.indexOf("BEGIN;") >= 0 && guardAt > apply.indexOf("BEGIN;") && guardAt < firstChange, "SQL: 바꾸는 문장보다 먼저 RAISE 가드가 막는다");
  const fnBody = (name) => apply.match(new RegExp(`CREATE FUNCTION public\\.${name}\\([\\s\\S]*?\\$body\\$;`))?.[0] || "";
  for (const name of ["accountbook_link_refund_v22979", "accountbook_unlink_refund_v22979"]) {
    const body = fnBody(name);
    t.ok(body.includes("WHERE s.key = 'settlement_history:' || p_household_id::text FOR SHARE")
      && body.includes("WHERE jsonb_typeof(h.item) = 'object' AND h.item->>'month' = v_month")
      && body.includes("RAISE EXCEPTION 'refund_link_month_completed'"), `SQL ${name}: 이력 배열의 객체 항목 month 로 막는다(표식도 같은 술어로 막힌다)`);
  }
  t.ok(apply.includes("V22.9.81 U-27") && apply.includes(`{"kind":"${MARKER_KIND}","month":"YYYY-MM","status":"completed"}`), "SQL: 머리말이 완료 달 표식의 모양을 적는다");
  t.eq(call(settlementPages, "settlementHistoryForSave", monthsFrom(OLD, 31).map((month, i) => entry(month, i)))?.[0]?.kind, MARKER_KIND, "SQL·앱: 앱이 쓰는 표식 kind 가 SQL 설명과 같다");
  const after = apply.slice(apply.lastIndexOf("COMMIT;"));
  const checkLines = apply.split("\n").filter((line) => line.includes("jsonb_array_length(s.value::jsonb)"));
  t.ok(checkLines.length >= 2 && checkLines.every((line) => line.trimStart().startsWith("--")) && after.includes("jsonb_array_length(s.value::jsonb) >= 30"), "SQL: 이력이 30건에 닿은 가계부 찾기는 COMMIT 뒤 주석(읽기 전용)");
  t.ok(!/settlement_completed_months|completed_months:/.test(apply + rollback), "SQL: 따로 된 키·표가 없다(표식은 같은 이력 줄)");
  t.ok(rollback.includes(MARKER_KIND) && rollback.split("\n")[0].includes("실행 금지(DO NOT RUN)"), "되돌리기 SQL: 표식이 이력에 남는다고 적고 머리말 그대로");
  t.ok(lifecycle.includes("'settlement_history:' || p_household_id::text"), "가계부 삭제 SQL(적용됨): settlement_history 줄을 지운다 — 표식도 함께 지워진다");
}

if (SOFT) {
  console.log(`V22.9.81 환불 연결 후속 검사: 검사 ${checks}개 중 ${failures.length}개 실패(V22981_SOFT=1)`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(0);
}
if (failures.length) {
  console.error(`V22.9.81 환불 연결 후속(U-26·U-27) 검사: ${failures.length} of ${checks} checks failed`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`V22.9.81 환불 연결 후속(U-26·U-27) 검사 통과 (${checks} checks)`);
