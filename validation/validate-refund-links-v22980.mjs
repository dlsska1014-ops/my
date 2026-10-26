// V22.9.80 환불 연결 후속 검사(기능 플래그 REFUND_LINKS_ENABLED, 기본 꺼짐).
//   T-11  가계부를 지우면 ‘수입으로 두기’ 목록(accountbook_settings 'refund_review_kept:<가계부>')도 지우는 트리거를 검토용 적용 SQL 에 더했다.
//   T-12  연결 보호 트리거(refund_link_guard_v22979)에 막힌 수정: 카카오·웹·관리자·API 가 이유(종류·금액·환급 분류·날짜)를 알리고,
//         일괄 수정은 막힌 기록만 빼고 나머지를 고친 뒤 몇 건을 뺐는지 알린다.
//   T-13  전체 기간 JSON 백업은 연결(거래 id 쌍)을 담고, 복구 후보 화면·CSV 백업 화면·카카오 삭제/복구 답장은 연결을 되살리지 않는다고 알린다.
//   M-7   연결한 환불을 홈·예산·예산 알림·리포트·소비 분석·카카오 요약·남은예산에서 뺀다(환급 날짜의 달, 원지출 분류). 홈 조회는 9회 그대로다.
// 플래그가 꺼져 있으면 화면·답장·파일이 V22.9.79(29ee7cc)와 바이트 단위로 같아야 한다. FLAG_OFF_GOLDEN 은 V22.9.79 트리에서 이 파일을
// `--print-golden` 으로 돌려 얻은 값이다(시계 2026-10-15 KST 고정. 실제 시계가 들어가는 칸 — 백업 exported_at·복구 버퍼 expires_at — 은 빼고
// 비교한다). 연결 표의 내장 조회·트리거·일괄 수정 RPC·기록 삭제의 CASCADE 는 메모리 흉내다(운영 DB 에는 아직 없다, 실행 금지 SQL).
// 옛 코드에서 무엇이 깨지는지 보려면 V22980_SOFT=1 로 돌린다(실패를 모두 적고 끝낸다).
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { BASE, app, ctx, fixture, intercept, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const PRINT_GOLDEN = process.argv.includes("--print-golden");
const SOFT = process.env.V22980_SOFT === "1";
const FLAG_OFF_GOLDEN = {
  "home": "200 d2fe9fe506022ebbc6483528",
  "homeTrend": "200 c2a31086b54624cfd519b3e8",
  "homePrev": "200 45888c13f4201499f5fdb8d6",
  "budgets": "200 05428b7afe8d9aff6eb696cb",
  "budgetAlerts": "200 f65e210c38575d34e01e63b7",
  "notifications": "200 df9761ab7204d02ba148aa42",
  "reports": "200 c97413f03ab672227d8bc452",
  "reportsWeek": "200 44be38f4093c39b764c497df",
  "analysis": "200 e3ad1e86ab62e478e3996b53",
  "backupPage": "200 ac08a74435392b2a4b26fe22",
  "kakao:이번달": "200 98fb6fc3811a3c54849be3cc",
  "kakao:합계": "200 0854d2cb7ed3d096e125ffcb",
  "kakao:남은예산": "200 58c746ce8d2af96e6b3f2920",
  "kakao:지난달 요약": "200 308d7377195a57406450c26d",
  "kakao:이번달 수입": "200 05709e1ead60d8181855b138",
  "backupFull": "200 6687e6f5c01fdef6cb8b18bf",
  "backupMonth": "200 488ae2e5db4dd074b0833406",
  "candidate": "200 3f65e1018b288d426b31637b",
  "legacyErr": "200 2e1abbfc913bd234812827f5",
  "myUpdate": "303 /my?month=2026-10&household_id=house-home&msg=updated#records",
  "apiBatch": "200 {\"ok\":true,\"updatedCount\":1}",
  "adminBulk": "303 /?legacy=1&month=2026-10&household_id=house-home&tab=transactions&msg=1%EA%B1%B4+%EC%9D%BC%EA%B4%84+%EC%88%98%EC%A0%95+%EC%99%84%EB%A3%8C",
  "kakaoDelete": "59d0ab376fbb9feece99ac94",
  "kakaoUndoItem": "4b4cef4eedf1c84f21621d08",
  "kakaoRestore": "6e0dda7e90c6a0802b704a2d",
};

const failures = [];
let checks = 0;
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 300); } catch (_) { return String(value).slice(0, 300); } };
function record(pass, message, detail = "") { checks += 1; if (!pass) failures.push(detail ? `${message} :: ${detail}` : message); }
const t = {
  ok: (value, message) => record(Boolean(value), message),
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
const domain = await load("../src/modules/domain/refund-links.js");
const feature = await load("../src/modules/features/settlement-refund-links.js");
const budgetsMod = await load("../src/modules/domain/budgets.js");
const outlookMod = await load("../src/modules/domain/spending-outlook.js");
const challengeMod = await load("../src/modules/my/report-challenge.js");
const replyTexts = await load("../src/modules/kakao/reply-texts.js");
const editSession = await load("../src/modules/kakao/edit-session-v4.js");
const call = (mod, name, ...args) => { try { return typeof mod[name] === "function" ? mod[name](...args) : undefined; } catch (_) { return undefined; } };
const callAsync = async (mod, name, ...args) => { try { return typeof mod[name] === "function" ? await mod[name](...args) : undefined; } catch (error) { return { thrown: String(error?.message || error) }; } };
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));
const sha = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 24);
const decode = (text = "") => String(text).replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const textOf = (html = "") => decode(String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ");

// ── 자료 ────────────────────────────────────────────────────────────────────────
const HH = "house-home";
const MONTH = "2026-10";
const TODAY = "2026-10-15";
const KAKAO_BIN = "kakao_login:2265";
const uid = (prefix, n) => `${prefix}000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const E0 = uid("0e", 0); const E1 = uid("0e", 1); const E2 = uid("0e", 2); const E9 = uid("0e", 9); const K1 = uid("0e", 11);
const S1 = uid("05", 1); const R1 = uid("0f", 1); const R2 = uid("0f", 2); const R3 = uid("0f", 3); const R9 = uid("0f", 9);
const EOLD = uid("0e", 25); const ROLD = uid("0f", 25);
const tx = (id, user, type, amount, category, memo, date, extra = {}) => ({ id, household_id: HH, user_id: user, type, amount, category, memo, payment_method: "카드", transaction_date: date, source: "my_web", raw_text: memo, created_at: `${date}T09:00:00.000Z`, ...extra });
// 10월(시계 10-15): 지출 142,000원(생활 100,000·식비 42,000), 수입 2,060,000원(급여 2,000,000·환급 60,000).
// 연결: link-1 생활 100,000 ↔ 환급 40,000(10-12), link-2 9월 가전 80,000 ↔ 환급 20,000(10-14, 다른 달 원지출), link-9 9월 식비 ↔ 9월 환급 10,000.
const ROWS = () => [
  tx(E0, "user-bin", "expense", 80000, "가전", "가전 구매", "2026-09-20"),
  tx(E9, "user-bin", "expense", 50000, "식비", "장보기", "2026-09-08"),
  tx(R9, "user-bin", "income", 10000, "환급", "장보기 환불", "2026-09-10"),
  tx(E1, "user-bin", "expense", 100000, "생활", "쿠팡 주문", "2026-10-03"),
  tx(E2, "user-wifi", "expense", 30000, "식비", "점심", "2026-10-05"),
  tx(S1, "user-bin", "income", 2000000, "급여", "월급", "2026-10-10"),
  tx(R1, "user-bin", "income", 40000, "환급", "쿠팡 환불", "2026-10-12"),
  tx(R2, "user-wifi", "income", 20000, "환급", "가전 환불", "2026-10-14"),
  tx(K1, "user-bin", "expense", 12000, "식비", "저녁", TODAY, { source: "kakao_skill", source_user_key: KAKAO_BIN, payment_method: "현금", created_at: `${TODAY}T03:00:00.000Z` }),
];
const linkRow = (id, expense, refund, amount, at) => ({ id, household_id: HH, expense_id: expense, refund_id: refund, amount, created_by: "user-bin", created_at: at });
const LINKS = () => [linkRow("link-9", E9, R9, 10000, "2026-09-10T01:00:00Z"), linkRow("link-1", E1, R1, 40000, "2026-10-12T01:00:00Z"), linkRow("link-2", E0, R2, 20000, "2026-10-14T01:00:00Z")];
const OCT_BUDGET = () => ({ id: "budget-v22980-total", household_id: HH, month: MONTH, category: "__total", amount: 100000, created_at: "2026-10-01T00:00:00.000Z" });

function seed(fx, { flag, rows = ROWS(), links = [], budgets = [OCT_BUDGET()] } = {}) {
  if (flag === undefined) delete fx.env.REFUND_LINKS_ENABLED; else fx.env.REFUND_LINKS_ENABLED = flag;
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
  fx.env.ADMIN_API_TOKEN = "qa-admin-api-token";
  fx.env.ADMIN_PASSWORD = "qa-admin-pass";
  fx.db.transactions = rows;
  fx.db.accountbook_refund_links = links;
  fx.db.accountbook_budgets = [...(fx.db.accountbook_budgets || []), ...budgets];
  fx.db.accountbook_settings.push({ id: "sel-v22980-refund", key: "kakao_selected_household_v2251:user-bin", value: HH, created_at: "2026-07-01T00:00:00Z" });
}

// ── 메모리 흉내: 내장 조회·트리거·일괄 수정 RPC·기록 삭제의 CASCADE ──────────────────────────────
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const rpcError = (message) => json({ code: "P0001", details: null, hint: null, message }, 400);
const absent = () => json({ code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.accountbook_refund_links' in the schema cache" }, 404);
const outage = () => json({ code: "QA", message: "synthetic outage" }, 503);
const minusDays = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const findTx = (fx, id) => fx.db.transactions.find((row) => String(row.id) === String(id)) || null;
// SQL accountbook_refund_link_guard_v22979 와 같은 순서(행 단위, 문장 시작 때의 연결·상대 기록).
function guard(fx, row, patch) {
  const links = fx.db.accountbook_refund_links || [];
  const asExpense = links.filter((l) => l.expense_id === row.id);
  const asRefund = links.filter((l) => l.refund_id === row.id);
  const sum = (list) => list.reduce((total, l) => total + Number(l.amount), 0);
  if (!asExpense.length && !asRefund.length) return "";
  const next = { ...row, ...patch };
  if (String(next.household_id) !== String(row.household_id) || next.type !== row.type) return "refund_link_locked_kind";
  if (next.amount === null || next.amount === undefined || Number(next.amount) < Math.max(sum(asExpense), sum(asRefund))) return "refund_link_locked_amount";
  if (asRefund.length && (next.category ?? null) !== (row.category ?? null)) return "refund_link_locked_category";
  if (String(next.transaction_date) !== String(row.transaction_date)) {
    const day = String(next.transaction_date);
    if (asExpense.some((l) => { const r = findTx(fx, l.refund_id); return r && (day > r.transaction_date || day < minusDays(r.transaction_date, 365)); })) return "refund_link_locked_date";
    if (asRefund.some((l) => { const e = findTx(fx, l.expense_id); return e && (e.transaction_date > day || e.transaction_date < minusDays(day, 365)); })) return "refund_link_locked_date";
  }
  return "";
}
const REFUND_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "transaction_date"];
const EXPENSE_COLS = ["id", "household_id", "user_id", "type", "amount", "category", "memo", "raw_text", "transaction_date"];
const pick = (row, cols) => (row ? Object.fromEntries(cols.map((col) => [col, row[col] ?? null])) : null);
// refund:transactions!accountbook_refund_links_refund_fkey!inner(…)·expense:transactions!…_expense_fkey(…) 와 refund.transaction_date 필터.
function embedRows(fx, url) {
  const hid = String(url.searchParams.get("household_id") || "").replace(/^eq\./, "");
  const filters = url.searchParams.getAll("refund.transaction_date");
  const gte = filters.find((v) => v.startsWith("gte."))?.slice(4) || "";
  const lt = filters.find((v) => v.startsWith("lt."))?.slice(3) || "";
  const limit = Number(url.searchParams.get("limit") || 0) || Infinity;
  return (fx.db.accountbook_refund_links || [])
    .filter((l) => !hid || l.household_id === hid)
    .map((l) => ({ l, refund: findTx(fx, l.refund_id), expense: findTx(fx, l.expense_id) }))
    .filter(({ refund }) => refund && (!gte || refund.transaction_date >= gte) && (!lt || refund.transaction_date < lt))
    .sort((a, b) => String(a.l.created_at).localeCompare(String(b.l.created_at)) || String(a.l.id).localeCompare(String(b.l.id)))
    .slice(0, limit)
    .map(({ l, refund, expense }) => ({ id: l.id, household_id: l.household_id, expense_id: l.expense_id, refund_id: l.refund_id, amount: l.amount, created_at: l.created_at, refund: pick(refund, REFUND_COLS), expense: pick(expense, EXPENSE_COLS) }));
}
function refundDb(fx, { table = true, embed = "ok", linkReads = "ok" } = {}) {
  const log = { requests: [], embeds: [], bulk: [], updates: [] };
  intercept(async ({ url, method, init, forward }) => {
    if (url.hostname !== "mock.supabase.co") return undefined;
    log.requests.push(`${method} ${url.pathname}${decodeURIComponent(url.search)}`);
    if (url.pathname === "/rest/v1/accountbook_refund_links") {
      if (!table) return absent();
      const select = url.searchParams.get("select") || "";
      if (method === "GET" && select.includes("refund:transactions!")) {
        log.embeds.push(decodeURIComponent(url.search));
        if (embed === "fail") return outage();
        if (embed === "relationship") return json({ code: "PGRST200", details: null, hint: null, message: "Could not find a relationship between 'accountbook_refund_links' and 'transactions' in the schema cache" }, 400);
        return json(embedRows(fx, url));
      }
      if (method === "GET" && linkReads === "fail") return outage();
      return undefined;
    }
    if (url.pathname === "/rest/v1/rpc/accountbook_update_transaction_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      const row = findTx(fx, body.p_transaction_id);
      log.updates.push(body.p_transaction_id);
      const locked = row ? guard(fx, row, body.p_patch || {}) : "";
      return locked ? rpcError(locked) : undefined;
    }
    if (url.pathname === "/rest/v1/rpc/accountbook_bulk_transactions_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      const ids = (body.p_transaction_ids || []).map(String);
      log.bulk.push(ids);
      const rows = ids.map((id) => fx.db.transactions.find((row) => String(row.id) === id && row.household_id === body.p_household_id));
      if (rows.some((row) => !row)) return rpcError("bulk_transaction_not_found");
      if (body.p_delete) {
        fx.db.transactions = fx.db.transactions.filter((row) => !ids.includes(String(row.id)));
        return json([{ affected: ids.length }]);
      }
      // 한 문장이라 한 행이라도 막히면 전부 되돌아간다.
      for (const row of rows) { const locked = guard(fx, row, body.p_patch || {}); if (locked) return rpcError(locked); }
      for (const row of rows) Object.assign(row, body.p_patch || {});
      return json([{ affected: ids.length }]);
    }
    if (url.pathname === "/rest/v1/rpc/accountbook_delete_transaction_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      const response = await forward();
      if (response.ok) fx.db.accountbook_refund_links = (fx.db.accountbook_refund_links || []).filter((l) => l.expense_id !== body.p_transaction_id && l.refund_id !== body.p_transaction_id);
      return response;
    }
    return undefined;
  });
  log.linkRequests = () => log.requests.filter((line) => /refund_links|refund_review_kept|refund_v22979/.test(line));
  return log;
}

// 화면이 부르는 DB 요청 수와 직렬 깊이(validate-serial-depth-v22916 과 같은 잣대: 12ms 지연, 앞 요청이 끝난 뒤의 요청이 한 단계 깊다).
async function measureDb(task) {
  const state = { calls: 0, depth: 0, completed: 0 };
  const inner = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const href = typeof input === "string" ? input : input.url;
    if (!String(href).includes("mock.supabase.co")) return inner(input, init);
    const depth = state.completed + 1;
    state.calls += 1;
    state.depth = Math.max(state.depth, depth);
    await new Promise((resolve) => setTimeout(resolve, 12));
    const response = await inner(input, init);
    state.completed = Math.max(state.completed, depth);
    return response;
  };
  try { const result = await task(); return { ...state, result }; } finally { globalThis.fetch = inner; }
}

let adminSeq = 0;
async function adminCookie(fx) {
  adminSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${10 + adminSeq}` },
    body: new URLSearchParams({ password: "qa-admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
async function adminApi(fx, path, method, body) {
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method,
    headers: { authorization: "Bearer qa-admin-api-token", "content-type": "application/json", accept: "application/json", origin: BASE, "sec-fetch-site": "same-origin" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }), fx.env, ctx);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
}
async function exportJson(fx, cookie, query) {
  const response = await page(fx, `/admin/export/json?${query}`, { cookie });
  let data = null;
  try { data = JSON.parse(response.html); } catch (_) {}
  return { status: response.status, data };
}
const stableBackup = (data) => { if (!data || typeof data !== "object") return show(data); const copy = { ...data }; delete copy.exported_at; return JSON.stringify(copy); };
async function uploadBackup(fx, cookie, payload, month = MONTH) {
  const form = new FormData();
  const fixed = payload && typeof payload === "object" && payload.exported_at ? { ...payload, exported_at: "2026-10-15T03:00:00.000Z" } : payload;
  form.append("backup_file", new File([JSON.stringify(fixed)], "backup.json", { type: "application/json" }));
  form.append("household_id", HH);
  form.append("month", month);
  const response = await app.fetch(new Request(`${BASE}/backup/select`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" }, body: form }), fx.env, ctx);
  return { status: response.status, html: await response.text() };
}
const undoItems = (fx) => {
  const row = fx.db.accountbook_settings.find((item) => String(item.key).startsWith("kakao_edit_undo_v4:"));
  try { return JSON.parse(row?.value || "{}").items || []; } catch (_) { return null; }
};
const withoutClock = (items) => (items || []).map((item) => { const copy = { ...item }; delete copy.expires_at; return copy; });

async function scenario(name, task) {
  try {
    await withClock(TODAY, () => fixture(async (fx) => { await task(fx); }));
    record(true, `${name}: 장면이 예외 없이 끝난다`);
  } catch (error) {
    record(false, `${name}: 장면이 예외 없이 끝난다`, String(error?.stack || error).slice(0, 500));
  }
}

const SCREENS = [
  ["home", `/app?month=${MONTH}&household_id=${HH}`],
  ["homeTrend", `/app?month=${MONTH}&household_id=${HH}&trend=monthly`],
  ["homePrev", `/app?month=2026-09&household_id=${HH}`],
  ["budgets", `/budgets?month=${MONTH}&household_id=${HH}`],
  ["budgetAlerts", `/budget-alerts?month=${MONTH}&household_id=${HH}`],
  ["notifications", `/u/api/notifications?household_id=${HH}&month=${MONTH}`],
  ["reports", `/reports?household_id=${HH}&month=${MONTH}`],
  ["reportsWeek", `/reports?household_id=${HH}&month=${MONTH}&range=week`],
  ["analysis", `/my/analysis?household_id=${HH}&month=${MONTH}`],
  ["backupPage", `/my/backup?household_id=${HH}&month=${MONTH}`],
];
const KAKAO = ["이번달", "합계", "남은예산", "지난달 요약", "이번달 수입"];
async function readScreens(fx) {
  const out = Object.create(null);
  for (const [name, path] of SCREENS) { const res = await page(fx, path); out[name] = { status: res.status, html: res.html }; }
  for (const utterance of KAKAO) out[`kakao:${utterance}`] = { status: 200, html: await skill(fx, utterance) };
  return out;
}
const digestScreens = (screens) => Object.fromEntries(Object.entries(screens).map(([name, value]) => [name, `${value.status} ${sha(value.html)}`]));

// ── 1. 계산(요청 없음) ─────────────────────────────────────────────────────────────
{
  // T-12: 트리거 문장 → 이유·코드·문구
  const err = (message) => new Error(`Supabase 400: {"code":"P0001","details":null,"hint":null,"message":"${message}"}`);
  t.deepEq(["refund_link_locked_kind", "refund_link_locked_amount", "refund_link_locked_category", "refund_link_locked_date", "refund_link_locked", "refund_link_locked_zzz", "record_update_failed"].map((m) => call(domain, "refundLinkLockedReason", err(m))), ["kind", "amount", "category", "date", "locked", "locked", ""], "T-12: 트리거 오류 문장에서 이유를 읽는다(모르는 이유는 locked, 다른 오류는 빈 값)");
  t.deepEq(["refund_link_locked_amount", "refund_link_locked", "boom"].map((m) => call(domain, "refundLinkLockedCode", err(m))), ["refund_link_locked_amount", "refund_link_locked", ""], "T-12: 웹 안내 코드(refund_link_locked_<이유>)");
  const kakao = call(domain, "refundLinkLockedKakaoText", "01", "amount");
  t.ok(String(kakao).startsWith("01번 기록은 환불과 연결돼 있어 바꾸지 않았어요. 기록은 그대로예요.") && String(kakao).includes("금액은 연결한 환불 금액보다 작게 바꿀 수 없어요.") && String(kakao).includes("‘환불·환급’에서 풀 수 있어요") && !String(kakao).includes("잠시 후 다시"), "T-12: 카카오 문구는 이유와 푸는 곳을 말하고 ‘잠시 후 다시’를 권하지 않는다");
  for (const code of ["refund_link_locked_kind", "refund_link_locked_amount", "refund_link_locked_category", "refund_link_locked_date"]) {
    const text = String(call(replyTexts, "formatMessage", code) || "");
    t.ok(text.includes("환불과 연결된") && text.includes("‘환불·환급’에서 연결을 먼저 풀어 주세요") && !text.includes("처리하지 못했습니다"), `T-12: formatMessage(${code}) 는 이유별 안내다`);
  }

  // T-12: 일괄 수정에서 트리거가 막을 기록 고르기(상대 기록이 함께 바뀌면 옛 날짜·새 날짜 모두로 본다)
  const rows = new Map(ROWS().map((row) => [row.id, row]));
  const links = LINKS();
  const predict = (ids, patch) => { const result = call(domain, "refundLinkLockedIdsForPatch", { ids, patch, links, rowsById: rows }); return result instanceof Map ? Object.fromEntries(result) : result; };
  t.deepEq(predict([E1, E2], { type: "income" }), { [E1]: "kind" }, "T-12 예측: 연결된 원지출의 구분 변경은 kind, 연결 없는 기록은 고친다");
  t.deepEq(predict([E1], { amount: 30000 }), { [E1]: "amount" }, "T-12 예측: 연결 금액보다 작은 금액은 amount");
  t.deepEq(predict([E1], { amount: 40000 }), {}, "T-12 예측: 연결 금액과 같으면 막지 않는다");
  t.deepEq(predict([R1, E1], { category: "기타" }), { [R1]: "category" }, "T-12 예측: 환급 쪽 분류 변경만 category(원지출 분류는 바꿀 수 있다)");
  t.deepEq(predict([E1, E2], { transaction_date: "2026-10-20" }), { [E1]: "date" }, "T-12 예측: 원지출을 환급보다 늦게 옮기면 date");
  t.deepEq(predict([E1, R1, E2], { transaction_date: "2026-10-20" }), { [E1]: "date" }, "T-12 예측: 짝이 함께 옮겨져도 순서에 따라 막힐 수 있는 쪽(원지출)은 뺀다");
  t.deepEq(predict([R2], { transaction_date: "2027-09-25" }), { [R2]: "date" }, "T-12 예측: 환급을 원지출에서 365일 넘게 옮기면 date");
  t.deepEq(predict(["missing-id"], { type: "income" }), {}, "T-12 예측: 연결이 없는 id 는 막지 않는다");

  // M-7: 차감 항목·반영액·통계
  const rawLinks = [
    { id: "link-1", refund_date: "2026-10-12", amount: 40000, expense_category: "생활", expense_user_id: "user-bin" },
    { id: "link-2", refund_date: "2026-10-14", amount: 20000, expense_category: "가전", expense_user_id: "user-bin" },
    { id: "link-x", refund_date: "2026-13-01", amount: 5000, expense_category: "생활", expense_user_id: "user-bin" },
  ];
  const entries = call(domain, "refundDeductionEntries", rawLinks);
  t.deepEq(plain(entries), [
    { transaction_date: "2026-10-12", amount: 40000, category: "생활", user_id: "user-bin", link_id: "link-1" },
    { transaction_date: "2026-10-14", amount: 20000, category: "가전", user_id: "user-bin", link_id: "link-2" },
  ], "M-7: 연결 → 차감 항목(환급 날짜·원지출 분류·지출자, 날짜가 틀린 연결은 뺀다)");
  t.deepEq(plain(call(domain, "refundDeductionsInRange", entries || [], "2026-10-13", "2026-10-31"))?.map((e) => e.link_id), ["link-2"], "M-7: 기간 안의 차감만 고른다(양 끝 포함)");
  t.deepEq(plain(call(domain, "refundDeductionApplied", 142000, entries || [])), { requested: 60000, applied: 60000, surplus: 0, count: 2 }, "M-7: 지출보다 작은 차감은 모두 반영");
  t.deepEq(plain(call(domain, "refundDeductionApplied", 30000, entries || [])), { requested: 60000, applied: 30000, surplus: 30000, count: 2 }, "M-7: 지출보다 큰 차감은 지출에서 멈추고 남는 몫은 수입으로 둔다");
  const stats = { totals: { income: 2060000, expense: 142000, balance: 1918000 }, categories: [{ category: "생활", income: 0, expense: 100000, total: 100000, count: 1 }, { category: "식비", income: 0, expense: 42000, total: 42000, count: 2 }, { category: "급여", income: 2000000, expense: 0, total: 2000000, count: 1 }, { category: "환급", income: 60000, expense: 0, total: 60000, count: 2 }], daily: { "2026-10-03": { income: 0, expense: 100000, count: 1 } } };
  t.ok(call(domain, "refundAdjustedStats", stats, []) === stats, "M-7: 차감이 없으면 같은 통계 객체를 그대로 돌려준다(플래그 꺼짐과 같은 화면)");
  const adjusted = call(domain, "refundAdjustedStats", stats, entries || []);
  t.deepEq(plain(adjusted?.totals), { income: 2000000, expense: 82000, balance: 1918000 }, "M-7: 지출 −L, 수입 −L, 잔액 그대로");
  t.deepEq(plain(adjusted?.categories?.map((c) => [c.category, c.expense, c.income, c.count])), [["생활", 60000, 0, 1], ["식비", 42000, 0, 2], ["급여", 0, 2000000, 1], ["환급", 0, 0, 2]], "M-7: 원지출 분류에서 빼고(다른 달 원지출의 분류 ‘가전’은 이 달에 없으니 그대로), ‘환급’ 수입을 반영액만큼 줄인다");
  t.deepEq(plain(adjusted?.daily), plain(stats.daily), "M-7: 날짜별 값은 기록 그대로");
  const proto = call(domain, "refundAdjustedStats", { totals: { income: 0, expense: 5000, balance: -5000 }, categories: [{ category: "__proto__", income: 0, expense: 5000, total: 5000, count: 1 }], daily: {} }, [{ transaction_date: "2026-10-01", amount: 2000, category: "__proto__", user_id: "", link_id: "p" }]);
  t.ok(proto?.categories?.[0]?.expense === 3000 && ({}).expense === undefined, "M-7: 분류 이름이 __proto__ 여도 값으로만 뺀다");
  t.deepEq([call(domain, "refundDeductionNote", { applied: 60000 }), call(domain, "refundDeductionNote", { applied: 0 }), call(domain, "refundDeductionNote", null), call(domain, "refundDeductionNote", null, { failed: true })], ["환불 차감 60,000원 반영", "", "", "환불 차감 확인 불가"], "M-7: 화면 문구(반영·없음·확인 불가)");

  // M-7: 예산 계산
  const octRows = ROWS().filter((row) => row.transaction_date.startsWith(MONTH));
  const deductions = [{ transaction_date: "2026-10-12", amount: 40000, category: "생활", user_id: "user-bin" }, { transaction_date: "2026-10-14", amount: 20000, category: "가전", user_id: "user-bin" }];
  const total = [OCT_BUDGET()];
  const base = call(budgetsMod, "budgetSummary", octRows, total);
  t.deepEq(call(budgetsMod, "budgetSummary", octRows, total, { refundDeductions: [] }), base, "M-7 예산: 차감이 없으면 예전 결과와 같다(refundDeduction 칸도 없다)");
  const net = call(budgetsMod, "budgetSummary", octRows, total, { refundDeductions: deductions });
  t.deepEq([net?.expense, net?.budgetedExpense, net?.rate, net?.refundDeduction], [82000, 82000, 82, 60000], "M-7 예산(전체 예산): 사용액 142,000 → 82,000원(82%)");
  const categoryBudgets = [{ id: "b-life", household_id: HH, month: MONTH, category: "생활", amount: 200000 }, { id: "b-food", household_id: HH, month: MONTH, category: "식비", amount: 100000 }];
  const byCategory = call(budgetsMod, "budgetSummary", octRows, categoryBudgets, { refundDeductions: deductions });
  t.deepEq([byCategory?.expense, byCategory?.budgetedExpense, byCategory?.refundDeduction, byCategory?.categoryAlerts?.find((a) => a.category === "생활")?.spent], [82000, 102000, 40000, 60000], "M-7 예산(분류별): 예산 분류(생활)의 사용액만 줄고, 예산 밖 분류(가전)의 차감은 사용률에 넣지 않는다");
  const center = call(budgetsMod, "budgetCenterSummary", octRows, total, { refundDeductions: deductions });
  t.deepEq([center?.stats?.totals?.expense, center?.budget?.budgetedExpense], [82000, 82000], "M-7 예산 센터: 통계와 예산이 같은 차감을 쓴다");
  t.deepEq(plain(call(budgetsMod, "budgetCenterSummary", octRows, total, { refundDeductions: [] })), plain(call(budgetsMod, "budgetCenterSummary", octRows, total)), "M-7 예산 센터: 차감이 없으면 예전 결과와 같다");

  // M-7: 월말 예상(V22.9.79 refundDeductions 입력)과 그 설명 줄
  const outlook = call(outlookMod, "monthSpendingOutlook", { month: MONTH, rows: octRows, today: TODAY, recurring: [], plans: [], budgets: total, refundDeductions: deductions });
  t.eq(outlook?.recorded?.refundDeduction, 60000, "M-7 월말 예상: 연결한 환불을 기록 금액에서 뺀다");
  const lines = call(outlookMod, "spendingOutlookBreakdown", outlook);
  t.ok(JSON.stringify(lines || "").includes("환불 차감 60,000원 반영"), "M-7 월말 예상 설명에 환불 차감 반영 줄이 있다");
  const plainOutlook = call(outlookMod, "monthSpendingOutlook", { month: MONTH, rows: octRows, today: TODAY, recurring: [], plans: [], budgets: total });
  t.ok(!JSON.stringify(call(outlookMod, "spendingOutlookBreakdown", plainOutlook) || "").includes("환불 차감"), "M-7 월말 예상: 차감이 없으면 설명 줄이 없다");

  // M-7: 소비 분석 요약(지출·수입·예산 속도)
  const dashboard = await callAsync(challengeMod, "buildReportDashboardSummary", octRows, net || {}, MONTH, { outlook, refundDeductions: deductions });
  t.deepEq([dashboard?.expense, dashboard?.income, dashboard?.refund?.applied], [82000, 2000000, 60000], "M-7 소비 분석 요약: 지출·수입에서 연결한 환불을 뺀다");
  const dashHtml = call(challengeMod, "renderReportDashboard", dashboard || {});
  t.has(dashHtml, "이번 달 지출 · 환불 차감 60,000원 반영", "M-7 소비 분석 요약 칸에 반영 문구");
  const dashPlain = await callAsync(challengeMod, "buildReportDashboardSummary", octRows, base || {}, MONTH, { outlook: plainOutlook });
  t.ok(dashPlain && !("refund" in dashPlain), "M-7 소비 분석 요약: 차감이 없으면 refund 칸이 없다");

  // T-13: 카카오 삭제·복구 답장 줄
  const note = (count, phase) => call(editSession, "kakaoRefundLinkUndoNoteV4", count, phase);
  t.deepEq([note(undefined, "delete"), note(0, "restore"), note(2, "delete"), note(2, "restore"), note(null, "restore")], ["", "", "\n이 기록에 있던 환불 연결 2건도 함께 풀렸어요. 복구해도 연결은 되살아나지 않아요.", "\n이 기록에 있던 환불 연결 2건은 되살리지 않았어요. 웹 정산 화면의 ‘환불·환급’에서 다시 연결해 주세요.", "\n환불 연결은 확인 불가예요. 연결이 있었다면 웹 정산 화면의 ‘환불·환급’에서 다시 연결해 주세요."], "T-13: 삭제·복구 답장에 붙는 연결 줄(없음·0건은 빈 줄, 못 읽음은 확인 불가)");
  const base1 = String(call(editSession, "kakaoEditDeletedTextV4", ROWS().at(-1), 1) || "");
  t.ok(base1 && call(editSession, "kakaoEditDeletedTextV4", ROWS().at(-1), 1, undefined) === base1 && !base1.includes("환불"), "T-13: 연결 수 칸이 없으면 삭제 답장은 예전과 같다");
}

// ── 2. 플래그 꺼짐: 화면·답장·파일이 V22.9.79 와 같다 ─────────────────────────────────────
const golden = {};
const baseline = {};
for (const flag of [undefined, "0", "false"]) {
  const label = `플래그 ${flag === undefined ? "없음" : `"${flag}"`}`;
  await scenario(label, async (fx) => {
    seed(fx, { flag, links: LINKS() });
    const log = refundDb(fx);
    const screens = await readScreens(fx);
    const values = digestScreens(screens);
    const admin = await adminCookie(fx);
    const full = await exportJson(fx, admin, `household_id=${HH}&range=all`);
    const month = await exportJson(fx, admin, `household_id=${HH}&month=${MONTH}`);
    values.backupFull = `${full.status} ${sha(stableBackup(full.data))}`;
    values.backupMonth = `${month.status} ${sha(stableBackup(month.data))}`;
    const candidate = await uploadBackup(fx, admin, full.data || {});
    values.candidate = `${candidate.status} ${sha(candidate.html)}`;
    const legacy = await page(fx, `/?legacy=1&month=${MONTH}&household_id=${HH}&err=record_update_failed`, { cookie: admin });
    values.legacyErr = `${legacy.status} ${sha(legacy.html)}`;
    // 연결이 없는 기록의 수정·일괄 수정은 예전과 같은 한 번의 요청이다.
    const update = await post(fx, "/my/update", { id: E2, household_id: HH, month: MONTH, type: "expense", amount: "31000", transaction_date: "2026-10-05", memo: "점심", category: "식비", payment_method: "카드" });
    values.myUpdate = `${update.status} ${update.location}`;
    const batch = await adminApi(fx, "/api/transactions/batch", "PATCH", { ids: [E2], category: "외식" });
    values.apiBatch = `${batch.status} ${JSON.stringify(batch.data)}`;
    const bulk = await post(fx, "/admin/bulk", new URLSearchParams([["ids", E2], ["household_id", HH], ["month", MONTH], ["bulk_payment_method", "현금"]]), { cookie: admin });
    values.adminBulk = `${bulk.status} ${bulk.location}`;
    const deleted = await skill(fx, "삭제 01번");
    const items = undoItems(fx);
    const restored = await skill(fx, "복구 01번");
    values.kakaoDelete = sha(deleted);
    values.kakaoUndoItem = sha(JSON.stringify(withoutClock(items)));
    values.kakaoRestore = sha(restored);
    if (flag === undefined) {
      Object.assign(golden, values);
      Object.assign(baseline, { screens, values, bulkCalls: log.bulk.length });
    }
    for (const key of Object.keys(FLAG_OFF_GOLDEN)) t.eq(values[key], FLAG_OFF_GOLDEN[key], `${label}: ${key} 가 V22.9.79 와 같다`);
    t.ok(!PRINT_GOLDEN && Object.keys(FLAG_OFF_GOLDEN).length >= Object.keys(values).length || PRINT_GOLDEN, `${label}: 비교한 화면이 빠지지 않았다(${Object.keys(values).length}개)`);
    t.deepEq(log.linkRequests(), [], `${label}: 연결 표·RPC 를 읽지 않는다`);
    t.ok(log.bulk.length === 2 && log.updates.length === 1, `${label}: 연결이 없는 일괄 수정(API·관리자)·수정은 각각 RPC 한 번`);
    t.ok(Array.isArray(items) && items.length === 1 && !("refund_links" in (items[0] || {})), `${label}: 카카오 복구 버퍼에 연결 칸이 없다`);
    t.ok(full.data && !("refund_links" in full.data) && !("refund_links" in (full.data.counts || {})), `${label}: 전체 기간 백업에 refund_links 가 없다`);
    t.lacks(screens.backupPage.html, "환불 연결은 CSV에 담기지 않아요", `${label}: CSV 백업 화면에 연결 안내가 없다`);
  });
}

// ── 3. 플래그 켜짐·연결 없음: 화면·답장이 플래그 꺼짐과 같고 홈 조회는 9회·3단계 ─────────────────────
await scenario("플래그 켜짐·연결 없음", async (fx) => {
  seed(fx, { flag: "1", links: [] });
  const log = refundDb(fx);
  const screens = await readScreens(fx);
  for (const [name, value] of Object.entries(screens)) {
    if (name === "backupPage") continue;
    t.eq(`${value.status} ${sha(value.html)}`, baseline.values?.[name], `연결 없음: ${name} 가 플래그 꺼짐과 같다`);
  }
  t.has(screens.backupPage.html, "환불 연결은 CSV에 담기지 않아요. 복원하면 환불은 다시 ‘확인 대상’이 됩니다.", "T-13: 플래그가 켜지면 CSV 백업 화면이 연결을 담지 않는다고 알린다");
  t.ok(log.embeds.length >= 8, `연결 없음: 화면마다 차감을 한 번씩 읽는다(${log.embeds.length}회)`);
  t.ok(log.embeds.every((line) => /refund\.transaction_date=gte\.20\d\d-\d\d-\d\d/.test(line) && /refund\.transaction_date=lt\.20\d\d-\d\d-\d\d/.test(line) && /household_id=eq\.house-home/.test(line)), "M-7: 차감 읽기는 가계부와 환급 날짜 범위로 좁힌다");
  await page(fx, SCREENS[0][1]);
  const home = await measureDb(() => page(fx, SCREENS[0][1]));
  t.ok(home.result.status === 200 && home.calls <= 9 && home.depth <= 3, `M-7: 플래그를 켜도 이번 달 홈은 DB 9회·3단계 안이다(${home.calls}회·${home.depth}단계)`);
  // 플래그가 켜진 홈은 홈 구성 줄(home-layout:v1:<가계부>:<사용자>)을 따로 읽지 않고 설정 조회 한 번에 합쳐 읽는다.
  fx.db.accountbook_settings.push({ id: "layout-v22980", key: `home-layout:v1:${HH}:user-bin`, value: JSON.stringify({ shortcuts: { order: ["menu", "add", "budgets", "reserve-plans", "smart-tools", "categories"], hidden: ["smart-tools"] } }), created_at: "2026-10-01T00:00:00Z" });
  const before = log.requests.length;
  const layoutOn = await page(fx, SCREENS[0][1]);
  const layoutReads = log.requests.slice(before).filter((line) => line.includes("/rest/v1/accountbook_settings") && line.includes("home-layout:v1:"));
  fx.env.REFUND_LINKS_ENABLED = "0";
  const layoutOff = await page(fx, SCREENS[0][1]);
  fx.env.REFUND_LINKS_ENABLED = "1";
  t.ok(layoutOff.html.includes("<b>바로가기</b><span>5곳</span>") && layoutOn.html.includes("<b>바로가기</b><span>5곳</span>") && sha(layoutOn.html) === sha(layoutOff.html), "M-7: 플래그를 켜도 저장한 홈 구성(숨긴 바로가기)이 플래그 꺼짐과 똑같이 그려진다");
  t.ok(layoutReads.length === 1 && layoutReads[0].includes("key=in.("), `M-7: 홈 구성 줄은 설정 조회 한 번(in.)에 합쳐 읽는다(${layoutReads.length}회)`);
});

// ── 4. 플래그 켜짐·연결 있음: 화면마다 환불 차감 ─────────────────────────────────────────────
await scenario("플래그 켜짐·연결 있음", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  const log = refundDb(fx);
  await page(fx, SCREENS[0][1]);
  const measured = await measureDb(() => page(fx, SCREENS[0][1]));
  const home = measured.result;
  t.ok(home.status === 200 && measured.calls <= 9 && measured.depth <= 3, `M-7 홈: 연결이 있어도 DB 9회·3단계 안이다(${measured.calls}회·${measured.depth}단계)`);
  t.has(home.html, "나간 돈</span><b class=\"expense\">-82,000원</b>", "M-7 홈: 나간 돈 142,000 → 82,000원");
  t.has(home.html, "<small class=\"homeMomLine\">환불 차감 60,000원 반영</small>", "M-7 홈: 나간 돈 아래 반영 문구");
  t.lacks(home.html, "-142,000원", "M-7 홈: 빼기 전 금액을 나간 돈으로 그리지 않는다");
  const trend = await page(fx, SCREENS[1][1]);
  t.ok(trend.status === 200 && textOf(trend.html).includes("환불 차감 60,000원 반영"), "M-7 홈 월별 흐름: 같은 화면도 반영한다");
  t.ok(trend.html.includes('title="2026-10 · 수입 2,000,000원 · 지출 82,000원"') && trend.html.includes('title="2026-09 · 수입 0원 · 지출 120,000원"'), "M-7 홈 월별 흐름: 달마다 그 달 환급의 차감을 뺀다(9월 130,000 → 120,000)");
  t.has(home.html, "<b>생활</b><span>59% · 60,000원</span>", "M-7 홈 분류 비율: 원지출 분류에서 빼고 비율은 분류 합계로 낸다");
  const budgets = await page(fx, SCREENS[3][1]);
  t.has(textOf(budgets.html), "사용 82,000원 (82%)", "M-7 예산: 사용액·사용률이 차감을 반영한다");
  t.has(budgets.html, "<p class=\"budgetP0Aside\">환불 차감 60,000원 반영</p>", "M-7 예산: 머리 칸에 반영 문구");
  const alerts = await page(fx, SCREENS[4][1]);
  t.ok(alerts.status === 200 && textOf(alerts.html).includes("환불 차감 60,000원 반영"), "M-7 예산 알림: 월 전체 등록액 칸에 반영 문구");
  const notifications = await page(fx, SCREENS[5][1]);
  const listOf = (html) => { try { return JSON.parse(html).notifications || []; } catch (_) { return []; } };
  const offNotes = listOf(baseline.screens?.notifications?.html);
  const notes = listOf(notifications.html);
  t.ok(offNotes.some((n) => String(n.key || "").startsWith("budget-over:")) && !notes.some((n) => String(n.key || "").startsWith("budget-over:")), "M-7 알림: 빼기 전 142% 의 ‘예산 초과’ 알림이 차감 뒤(82%)에는 없다");
  t.ok(notes.some((n) => String(n.key || "").startsWith("budget-") && String(n.body || "").includes("환불 차감 60,000원 반영")), "M-7 알림: 예산 알림 문장에 환불 차감 반영을 붙인다");
  const reports = await page(fx, SCREENS[6][1]);
  t.has(reports.html, "<span>지출</span><b>82,000원</b>", "M-7 리포트: 기간 요약 지출이 차감을 반영한다");
  t.has(textOf(reports.html), "환불 차감 60,000원 반영", "M-7 리포트: 반영 문구");
  t.has(decode(reports.html), "지출 82,000원 (환불 차감 60,000원 반영)", "M-7 리포트: 공유 문장에도 반영");
  const analysis = await page(fx, SCREENS[8][1]);
  t.has(analysis.html, "이번 달 지출 · 환불 차감 60,000원 반영</span><b>82,000원</b>", "M-7 소비 분석: 요약 칸이 차감을 반영한다");
  t.has(analysis.html, "data-refund-deduction-note", "M-7 소비 분석: 아래 그래프는 기록 그대로라고 알린다");
  const month = await skill(fx, "이번달");
  t.has(month, "지출: 82,000원 · 3건 (환불 차감 60,000원 반영)", "M-7 카카오 이번달: 지출 줄");
  t.has(month, "수입: 2,000,000원", "M-7 카카오 이번달: 수입도 같은 금액만큼 줄인다");
  t.ok(month.includes("• 생활: 60,000원") && month.includes("• 식비: 42,000원") && !month.includes("가전"), "M-7 카카오 이번달: 분류는 원지출 분류에서 빼고 0 아래로 내리지 않는다");
  t.ok(month.includes("52,000원") && month.includes("30,000원"), "M-7 카카오 이번달: 지출자별 합계도 원지출의 지출자에서 뺀다");
  const totalReply = await skill(fx, "합계");
  t.ok(totalReply.includes("지출: 82,000원 (환불 차감 60,000원 반영)") && totalReply.includes("수입: 2,000,000원") && totalReply.includes("잔액: 1,918,000원") && totalReply.includes("1. 생활: 60,000원"), "M-7 카카오 합계: 지출·수입·상위 분류에 반영, 잔액 그대로");
  const remain = await skill(fx, "남은예산");
  t.ok(remain.includes("사용 금액: 82,000원 (환불 차감 60,000원 반영)") && remain.includes("남은 예산: 18,000원") && remain.includes("사용률: 82%"), "M-7 카카오 남은예산: 사용액·남은 예산·사용률");
  const last = await skill(fx, "지난달 요약");
  t.has(last, "지출: 120,000원 · 2건 (환불 차감 10,000원 반영)", "M-7 카카오 지난달: 그 달 환급의 차감만 뺀다");
  const prevHome = await page(fx, SCREENS[2][1]);
  t.has(prevHome.html, "나간 돈</span><b class=\"expense\">-120,000원</b>", "M-7 홈(지난달): 9월 환급 차감만 반영");
  t.ok(log.embeds.length >= 10, "M-7: 화면마다 차감을 읽었다");
});

// ── 5. 플래그 켜짐·연결을 못 읽음: ‘확인 불가’, 금액은 기록 그대로 ─────────────────────────────────
await scenario("플래그 켜짐·차감 읽기 실패", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  refundDb(fx, { embed: "fail" });
  const home = await page(fx, SCREENS[0][1]);
  t.ok(home.status === 200 && home.html.includes("-142,000원") && home.html.includes("<small class=\"homeMomLine\">환불 차감 확인 불가</small>"), "M-7 실패: 홈은 열리고 기록 그대로 + ‘환불 차감 확인 불가’");
  const budgets = await page(fx, SCREENS[3][1]);
  t.ok(budgets.status === 200 && budgets.html.includes("환불 차감 확인 불가") && textOf(budgets.html).includes("사용 142,000원"), "M-7 실패: 예산 화면은 기록 그대로 + 확인 불가");
  const reports = await page(fx, SCREENS[6][1]);
  t.ok(reports.status === 200 && reports.html.includes("<span>지출</span><b>142,000원</b>") && textOf(reports.html).includes("환불 차감 확인 불가"), "M-7 실패: 리포트는 기록 그대로 + 확인 불가");
  const month = await skill(fx, "이번달");
  t.ok(month.includes("지출: 142,000원 · 3건") && month.includes("환불 차감은 확인하지 못해 기록 그대로예요.") && !month.includes("환불 차감 0원"), "M-7 실패: 카카오 이번달은 기록 그대로 + 못 읽었다고 말한다");
  const total = await skill(fx, "합계");
  t.ok(total.includes("지출: 142,000원") && total.includes("환불 차감은 확인하지 못해 기록 그대로예요."), "M-7 실패: 카카오 합계도 못 읽었다고 말한다");
  const remain = await skill(fx, "남은예산");
  t.has(remain, "사용 금액: 142,000원 (환불 차감 확인 불가)", "M-7 실패: 남은예산은 확인 불가를 붙인다");
});

// ── 6. 플래그 켜짐·표 없음(DDL 적용 전): 안내 없이 기록 그대로 ───────────────────────────────────
await scenario("플래그 켜짐·표 없음", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  refundDb(fx, { table: false });
  const screens = await readScreens(fx);
  for (const [name, value] of Object.entries(screens)) {
    if (name === "backupPage") continue;
    t.eq(`${value.status} ${sha(value.html)}`, baseline.values?.[name], `표 없음: ${name} 가 플래그 꺼짐과 같다`);
  }
});

// ── 7. T-12: 연결 보호 트리거에 막힌 수정 ──────────────────────────────────────────────────
await scenario("T-12 수정 안내", async (fx) => {
  seed(fx, { flag: "1", rows: [...ROWS(), tx(R3, "user-bin", "income", 10000, "환급", "저녁 환불", TODAY)], links: [...LINKS(), linkRow("link-3", K1, R3, 10000, "2026-10-15T04:00:00Z")] });
  const log = refundDb(fx);
  const kakao = await skill(fx, "수정 01번 금액 5000");
  t.ok(kakao.includes("01번 기록은 환불과 연결돼 있어 바꾸지 않았어요") && kakao.includes("금액은 연결한 환불 금액보다 작게 바꿀 수 없어요") && !kakao.includes("잠시 후 다시 보내 주세요"), `T-12 카카오: 막힌 이유와 푸는 곳을 말한다(${kakao.split("\n")[0]})`);
  t.eq(findTx(fx, K1)?.amount, 12000, "T-12 카카오: 기록은 그대로");
  const my = await post(fx, "/my/update", { id: E1, household_id: HH, month: MONTH, type: "expense", amount: "30000", transaction_date: "2026-10-03", memo: "쿠팡 주문", category: "생활", payment_method: "카드" });
  t.ok(my.status === 303 && my.location.includes("err=refund_link_locked_amount"), `T-12 /my/update: 이유별 코드로 돌려보낸다(${my.location})`);
  // 홈의 기록 수정 칸(home-sections v8-edit)은 /admin/update 로 보내고 return_to 로 홈에 돌아온다.
  const home = await post(fx, "/admin/update", { id: E1, household_id: HH, month: MONTH, type: "expense", amount: "30000", transaction_date: "2026-10-03", memo: "쿠팡 주문", category: "생활", payment_method: "카드", return_to: `/app?month=${MONTH}&household_id=${HH}` });
  t.ok(home.status === 303 && home.location.startsWith("/app?") && home.location.includes("err=refund_link_locked_amount"), `T-12 홈 수정: 홈으로 이유별 코드를 들고 돌아온다(${home.location})`);
  const homePage = await page(fx, home.location);
  t.has(textOf(homePage.html), "환불과 연결된 기록이라 금액을 연결한 금액보다 작게 바꾸지 않았습니다.", "T-12 홈 수정: 화면에 이유가 보인다");
  t.lacks(textOf(homePage.html), "요청을 처리하지 못했습니다", "T-12 홈 수정: 일반 실패 문장이 아니다");
  const adminForm = await post(fx, "/admin/update", { id: R1, household_id: HH, month: MONTH, type: "income", amount: "40000", transaction_date: "2026-10-12", memo: "쿠팡 환불", category: "기타수입", payment_method: "카드" });
  t.ok(adminForm.status === 303 && adminForm.location.includes("err=refund_link_locked_category"), `T-12 관리자 수정: 환급 분류 변경은 refund_link_locked_category(${adminForm.location})`);
  const admin = await adminCookie(fx);
  const legacy = await page(fx, `/?legacy=1&month=${MONTH}&household_id=${HH}&err=refund_link_locked_category`, { cookie: admin });
  t.ok(legacy.html.includes("<div class=\"error\">환불과 연결된 환급 기록이라 분류를 바꾸지 않았습니다.") && !legacy.html.includes("<div class=\"error\">refund_link_locked_category</div>"), "T-12 관리자 화면: 코드가 아니라 안내 문장을 보인다");
  const single = await adminApi(fx, `/api/transactions/${E1}`, "PATCH", { type: "income" });
  t.ok(single.status === 409 && single.data?.error === "refund_link_locked" && single.data?.reason === "kind", `T-12 API 수정: 409·이유 kind(${single.status} ${show(single.data)})`);
  t.ok(log.updates.length >= 4, "T-12: 수정 요청은 모두 트리거(흉내)를 거쳤다");
});

await scenario("T-12 일괄 수정 건너뛰기", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  const log = refundDb(fx);
  const batch = await adminApi(fx, "/api/transactions/batch", "PATCH", { ids: [E1, R1, E2], transaction_date: "2026-10-20" });
  t.ok(batch.status === 200 && batch.data?.ok === true && batch.data?.updatedCount === 2 && batch.data?.skippedCount === 1 && batch.data?.skipped?.[0]?.id === E1 && batch.data?.skipped?.[0]?.reason === "date", `T-12 API 일괄: 막힌 원지출만 빼고 고친다(${show(batch.data)})`);
  t.deepEq([findTx(fx, E1)?.transaction_date, findTx(fx, R1)?.transaction_date, findTx(fx, E2)?.transaction_date], ["2026-10-03", "2026-10-20", "2026-10-20"], "T-12 API 일괄: 고친 기록과 그대로인 기록");
  t.ok(log.bulk.length === 2 && log.bulk[1].length === 2 && !log.bulk[1].includes(E1), "T-12 API 일괄: 첫 요청이 막히면 연결을 읽고 막힌 기록을 뺀 한 번만 다시 보낸다");
  const all = await adminApi(fx, "/api/transactions/batch", "PATCH", { ids: [E1], type: "income" });
  t.ok(all.status === 409 && all.data?.error === "refund_link_locked" && all.data?.reason === "kind", `T-12 API 일괄: 모두 막히면 409(${show(all.data)})`);
  const admin = await adminCookie(fx);
  const bulk = await post(fx, "/admin/bulk", new URLSearchParams([["ids", E1], ["ids", E2], ["household_id", HH], ["month", MONTH], ["bulk_quick_type", "income"]]), { cookie: admin });
  t.ok(bulk.status === 303 && bulk.decoded.replace(/[+]/g, " ").includes("선택한 2건 중 1건을 수정했습니다. 환불과 연결돼 바꿀 수 없는 1건은 그대로 두었습니다."), `T-12 관리자 일괄: 몇 건을 뺐는지 알린다(${bulk.decoded.replace(/[+]/g, " ").slice(0, 160)})`);
  t.deepEq([findTx(fx, E1)?.type, findTx(fx, E2)?.type], ["expense", "income"], "T-12 관리자 일괄: 연결 없는 기록만 바뀐다");
  const none = await post(fx, "/admin/bulk", new URLSearchParams([["ids", E1], ["household_id", HH], ["month", MONTH], ["bulk_quick_type", "income"]]), { cookie: admin });
  t.ok(none.status === 303 && none.decoded.replace(/[+]/g, " ").includes("환불과 연결된 기록이 있어 아무것도 바꾸지 않았습니다."), "T-12 관리자 일괄: 모두 막히면 아무것도 바꾸지 않았다고 알린다");
});

await scenario("T-12 일괄 수정·연결 읽기 실패", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  const log = refundDb(fx, { linkReads: "fail" });
  const batch = await adminApi(fx, "/api/transactions/batch", "PATCH", { ids: [E1, E2], type: "income" });
  t.ok(batch.status === 409 && batch.data?.error === "refund_link_locked" && log.bulk.length === 1, `T-12: 막힌 기록을 가려내지 못하면 다시 보내지 않고 아무것도 바꾸지 않는다(${batch.status})`);
  t.deepEq([findTx(fx, E1)?.type, findTx(fx, E2)?.type], ["expense", "expense"], "T-12: 연결 읽기 실패 때 두 기록 모두 그대로");
});

// ── 8. T-13: 백업·복구·카카오 복구 ─────────────────────────────────────────────────────────
await scenario("T-13 JSON 백업", async (fx) => {
  const old = [tx(EOLD, "user-bin", "expense", 15000, "생활", "작년 주문", "2025-12-20"), tx(ROLD, "user-bin", "income", 5000, "환급", "작년 환불", "2025-12-28")];
  seed(fx, { flag: "1", rows: [...ROWS(), ...old], links: [...LINKS(), linkRow("link-old", EOLD, ROLD, 5000, "2025-12-28T01:00:00Z")] });
  refundDb(fx);
  const admin = await adminCookie(fx);
  const full = await exportJson(fx, admin, `household_id=${HH}&range=all`);
  t.ok(full.status === 200 && full.data?.refund_links && Array.isArray(full.data.refund_links[HH]), "T-13: 전체 기간 백업에 가계부별 refund_links 가 있다");
  t.deepEq((full.data?.refund_links?.[HH] || []).map((l) => [l.id, l.expense_id, l.refund_id, l.amount]), [["link-old", EOLD, ROLD, 5000], ["link-9", E9, R9, 10000], ["link-1", E1, R1, 40000], ["link-2", E0, R2, 20000]], "T-13: 연결은 거래 id 쌍과 금액으로 담는다(만든 순서)");
  t.eq(full.data?.counts?.refund_links, 4, "T-13: counts 에 연결 수");
  t.ok((full.data?.notes || []).some((line) => line.includes("환불 연결(refund_links)") && line.includes("되살리지 않습니다")), "T-13: 백업 설명에 복구가 연결을 되살리지 않는다고 적는다");
  const year = await exportJson(fx, admin, `household_id=${HH}&range=all&year=2026`);
  t.deepEq((year.data?.refund_links?.[HH] || []).map((l) => l.id), ["link-9", "link-1", "link-2"], "T-13: 연도별 백업은 그해 거래와 이어진 연결만 담는다");
  const month = await exportJson(fx, admin, `household_id=${HH}&month=${MONTH}`);
  t.ok(month.status === 200 && !("refund_links" in (month.data || {})) && (month.data?.notes || []).some((line) => line.includes("달별 백업에는 환불 연결을 담지 않습니다")), "T-13: 달별 백업은 연결을 담지 않는다고 적는다");
});

await scenario("T-13 JSON 백업·연결 읽기", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  refundDb(fx, { linkReads: "fail" });
  const admin = await adminCookie(fx);
  const failed = await exportJson(fx, admin, `household_id=${HH}&range=all`);
  t.ok(failed.status === 503 && failed.data?.error === "backup_read_failed", `T-13: 연결을 못 읽으면 일부가 빈 백업을 만들지 않는다(${failed.status})`);
});

await scenario("T-13 JSON 백업·표 없음", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  refundDb(fx, { table: false });
  const admin = await adminCookie(fx);
  const full = await exportJson(fx, admin, `household_id=${HH}&range=all`);
  t.ok(full.status === 200 && Array.isArray(full.data?.refund_links?.[HH]) && full.data.refund_links[HH].length === 0 && full.data.counts?.refund_links === 0, "T-13: 연결 표가 없으면(적용 전) 빈 목록으로 담는다");
});

await scenario("T-13 복구 후보 화면", async (fx) => {
  seed(fx, { flag: "1", links: LINKS() });
  refundDb(fx);
  const admin = await adminCookie(fx);
  const full = await exportJson(fx, admin, `household_id=${HH}&range=all`);
  fx.db.transactions = fx.db.transactions.filter((row) => ![E1, R1].includes(row.id));
  fx.db.accountbook_refund_links = fx.db.accountbook_refund_links.filter((l) => l.id !== "link-1");
  const candidate = await uploadBackup(fx, admin, full.data || {});
  t.ok(candidate.status === 200 && candidate.html.includes("data-backup-refund-links") && textOf(candidate.html).includes("백업에 환불 연결 3건이 담겨 있어요. 이 달 복구 후보와 이어진 연결은 1건이에요.") && textOf(candidate.html).includes("연결은 되살리지 않아요"), "T-13: 복구 후보 화면이 후보와 이어진 연결 수와 되살리지 않는다는 사실을 알린다");
  const plainPayload = { ...(full.data || {}) };
  delete plainPayload.refund_links;
  const without = await uploadBackup(fx, admin, plainPayload);
  t.ok(without.status === 200 && !without.html.includes("data-backup-refund-links"), "T-13: 연결이 없는 백업이면 안내가 없다");
});

await scenario("T-13 카카오 삭제·복구", async (fx) => {
  seed(fx, { flag: "1", rows: [...ROWS(), tx(R3, "user-bin", "income", 10000, "환급", "저녁 환불", TODAY)], links: [linkRow("link-3", K1, R3, 10000, "2026-10-15T04:00:00Z")] });
  refundDb(fx);
  const deleted = await skill(fx, "삭제 01번");
  t.ok(deleted.includes("01번 기록을 삭제했어요") && deleted.includes("이 기록에 있던 환불 연결 1건도 함께 풀렸어요. 복구해도 연결은 되살아나지 않아요."), `T-13 카카오 삭제: 연결이 함께 풀렸다고 말한다(${deleted.split("\n").at(-1)})`);
  t.ok(undoItems(fx)?.[0]?.refund_links === 1 && fx.db.accountbook_refund_links.length === 0 && !findTx(fx, K1), "T-13 카카오 삭제: 버퍼에 연결 수를 적고, 기록과 연결은 지워졌다");
  const restored = await skill(fx, "복구 01번");
  t.ok(restored.includes("기록을 복구했어요") && restored.includes("이 기록에 있던 환불 연결 1건은 되살리지 않았어요. 웹 정산 화면의 ‘환불·환급’에서 다시 연결해 주세요."), `T-13 카카오 복구: 연결 없이 되살렸다고 말한다(${restored.split("\n").at(-1)})`);
  t.ok(findTx(fx, K1) && fx.db.accountbook_refund_links.length === 0, "T-13 카카오 복구: 기록만 돌아오고 연결은 없다(환급은 다시 확인 대상)");
});

await scenario("T-13 카카오 삭제·연결 읽기 실패", async (fx) => {
  seed(fx, { flag: "1", rows: [...ROWS(), tx(R3, "user-bin", "income", 10000, "환급", "저녁 환불", TODAY)], links: [linkRow("link-3", K1, R3, 10000, "2026-10-15T04:00:00Z")] });
  refundDb(fx, { linkReads: "fail" });
  const deleted = await skill(fx, "삭제 01번");
  t.ok(deleted.includes("01번 기록을 삭제했어요") && deleted.includes("환불 연결이 있었는지 확인하지 못했어요."), "T-13: 연결 수를 못 읽어도 삭제는 하고, 못 읽었다고 말한다");
  t.ok(undoItems(fx)?.[0]?.refund_links === null, "T-13: 버퍼에는 0 이 아니라 null(확인 불가)");
  const restored = await skill(fx, "복구 01번");
  t.has(restored, "환불 연결은 확인 불가예요.", "T-13: 복구 답장도 확인 불가라고 말한다");
});

{
  const counted = [];
  const stop = intercept(({ url }) => { if (url.hostname === "mock.supabase.co") { counted.push(url.pathname); return json([]); } return undefined; });
  try {
    const env = { REFUND_LINKS_ENABLED: "1", SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "qa" };
    const income = await callAsync(feature, "refundLinkCountForRow", env, HH, { id: S1, type: "income", category: "급여" });
    const off = await callAsync(feature, "refundLinkCountForRow", {}, HH, { id: E1, type: "expense", category: "생활" });
    const expense = await callAsync(feature, "refundLinkCountForRow", env, HH, { id: E1, type: "expense", category: "생활" });
    t.deepEq([income, off, expense, counted.length], [undefined, undefined, 0, 1], "T-13: 환급이 아닌 수입·플래그 꺼짐은 연결을 읽지 않고, 지출은 한 번 읽는다");
  } finally { stop(); }
}

// ── 9. /ready: 표 점검은 차감 읽기와 같은 내장 조회 ───────────────────────────────────────────────
await scenario("/ready 내장 조회", async (fx) => {
  seed(fx, { flag: "1" });
  const log = refundDb(fx);
  intercept(({ url }) => (/^\/rest\/v1\/rpc\/accountbook_(?:link|unlink)_refund_v22979$/.test(url.pathname) ? rpcError("refund_link_input_invalid") : undefined));
  const ok = await app.fetch(new Request(`${BASE}/ready`), fx.env, ctx).then((r) => r.json()).catch(() => ({}));
  t.ok(ok.refund_links?.table === "ok" && log.embeds.some((line) => line.includes("refund:transactions!accountbook_refund_links_refund_fkey!inner") && line.includes("expense:transactions!accountbook_refund_links_expense_fkey")), "/ready: 표 점검이 외래키 이름으로 붙여 읽는다");
});
await scenario("/ready 외래키 이름 다름", async (fx) => {
  seed(fx, { flag: "1" });
  refundDb(fx, { embed: "relationship" });
  const data = await app.fetch(new Request(`${BASE}/ready`), fx.env, ctx).then((r) => r.json()).catch(() => ({}));
  t.ok(data.refund_links?.table === "error" && data.refund_links?.available === false, "/ready: 외래키 이름이 달라 붙여 읽지 못하면 table error(플래그를 켜기 전에 보인다)");
});

// ── 10. T-11 검토용 SQL ───────────────────────────────────────────────────────────────────
{
  const read = (rel) => { const path = new URL(`../${rel}`, import.meta.url); return existsSync(path) ? readFileSync(path, "utf8") : ""; };
  const apply = read("migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql");
  const rollback = read("migrations/V22_9_79_REFUND_LINKS_ROLLBACK_REVIEW_ONLY.sql");
  const fn = apply.match(/CREATE FUNCTION public\.accountbook_refund_review_kept_cleanup_v22980\(\)[\s\S]*?\$body\$;/)?.[0] || "";
  t.ok(/RETURNS trigger/.test(fn) && /SECURITY DEFINER/.test(fn) && /SET search_path = pg_catalog, pg_temp/.test(fn), "T-11: 정리 함수는 SECURITY DEFINER·고정 search_path 트리거 함수");
  t.has(fn, "DELETE FROM public.accountbook_settings WHERE key = 'refund_review_kept:' || OLD.id::text;", "T-11: 지운 가계부의 refund_review_kept:<가계부 id> 한 줄만 지운다");
  t.ok(/CREATE TRIGGER refund_review_kept_cleanup_v22980\s+AFTER DELETE ON public\.households\s+FOR EACH ROW EXECUTE FUNCTION public\.accountbook_refund_review_kept_cleanup_v22980\(\);/.test(apply), "T-11: households 행이 지워질 때(같은 트랜잭션) 실행된다");
  t.has(apply, "REVOKE ALL ON FUNCTION public.accountbook_refund_review_kept_cleanup_v22980() FROM PUBLIC, anon, authenticated;", "T-11: 정리 함수는 누구에게도 실행 권한을 주지 않는다");
  const at = apply.indexOf("CREATE FUNCTION public.accountbook_refund_review_kept_cleanup_v22980");
  t.ok(at > apply.indexOf("RAISE EXCEPTION 'v22979_review_only_refund_links_approval_required'") && at < apply.indexOf("COMMIT;"), "T-11: 새 절도 RAISE 가드 뒤·COMMIT 앞(한 트랜잭션)");
  const dropTrigger = rollback.indexOf("DROP TRIGGER IF EXISTS refund_review_kept_cleanup_v22980 ON public.households;");
  const dropFunction = rollback.indexOf("DROP FUNCTION IF EXISTS public.accountbook_refund_review_kept_cleanup_v22980();");
  t.ok(dropTrigger > 0 && dropFunction > dropTrigger && dropFunction < rollback.indexOf("COMMIT;") && dropTrigger > rollback.indexOf("RAISE EXCEPTION 'v22979_review_only_refund_links_rollback_approval_required'"), "T-11: 되돌리기 SQL 이 트리거 → 함수 순서로 지운다(가드 뒤)");
  const applied = read("docs/db-review/v22961/10_APPLY_LIFECYCLE_REVIEW_ONLY.sql");
  t.eq(createHash("sha256").update(applied).digest("hex"), "e1ed86ea4e191e46c880e4d33012e7d1451e022b34e7f285c6dcc0e2f75005a1", "T-11: 적용된 V22.9.61 수명 SQL(삭제 키 목록)은 그대로다");
}

if (PRINT_GOLDEN) {
  console.log(JSON.stringify(golden, null, 2));
  process.exit(0);
}
if (SOFT) {
  console.log(`V22.9.80 환불 연결 후속 검사: 검사 ${checks}개 중 ${failures.length}개 실패(V22980_SOFT=1)`);
  for (const line of failures) console.log(`  ✗ ${line}`);
  process.exit(0);
}
if (failures.length) {
  console.error(`V22.9.80 환불 연결 후속 검사: ${failures.length} of ${checks} checks failed`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`V22.9.80 환불 연결 후속(T-11·T-12·T-13·M-7) 검사 통과 (${checks} checks)`);
