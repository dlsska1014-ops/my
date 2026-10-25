// V22.9.79 V44 D-5·V76 M-7·V44 D-21 검사: 환불 연결(기능 플래그 REFUND_LINKS_ENABLED, 기본 꺼짐)과 카카오 정산 ‘외 N명·외 N건’.
// 연결 표·RPC 는 운영 DB 에 아직 없다(migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql, 실행 금지·운영자 승인 전).
// 표 읽기는 픽스처 메모리 표(accountbook_refund_links)를 쓰고, 두 RPC 는 intercept 로 SQL 과 같은 규칙을 흉내 낸다.
// 옛 코드에서도 끝까지 돌도록 새 모듈은 동적으로 읽고, 실패는 모아 끝에 한꺼번에 알린다(옛 코드에서 몇 개가 실패하는지 셀 수 있다).
// FLAG_OFF_GOLDEN 은 V22.9.78 트리(437554e)에서 이 파일을 `--print-golden` 으로 돌려 얻은 값이다. 플래그가 꺼지면 정산 화면 본문·
// 카카오 답장·완료 이력이 그 값과 바이트 단위로 같아야 한다. 다른 판이 정산 화면 틀을 일부러 바꾸면 그 판에서 다시 뽑아 적는다.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { BASE, app, ctx, fixture, intercept, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const PRINT_GOLDEN = process.argv.includes("--print-golden");
const FLAG_OFF_GOLDEN = {
  equalMain: "f9a56cee0b01a6ac1bfdbbf4",
  itemMain: "4903cc82a76e15dc7db1ecfd",
  memberMain: "f209c8f58c13a25522fb11ac",
  afterMain: "f5379a00ee7dbec1f7923b95",
  kakao: "📊 2026-10 정산\n환급(돌려받은 돈)은 이 정산에서 빼지 않아요. 환급 미리보기는 웹 정산 화면에서 볼 수 있고, 일반 정산 금액과 완료 이력에는 반영하지 않습니다.\n총 지출: 130,000원\n참여자: 2명\n1인 기준: 65,000원\n\n• Bin: 35,000원 받기\n• WIFI♥: 35,000원 보내기\n\n송금 제안\n• WIFI♥ → Bin: 35,000원",
  entry: "{\"schema_version\":2,\"month\":\"2026-10\",\"mode\":\"equal\",\"conditions\":{\"weights\":{},\"itemParticipants\":{}},\"total_expense\":130000,\"participant_count\":2,\"shares\":[{\"user_id\":\"user-bin\",\"name\":\"Bin\",\"paid\":100000,\"share\":65000,\"balance\":35000},{\"user_id\":\"user-wifi\",\"name\":\"WIFI♥\",\"paid\":30000,\"share\":65000,\"balance\":-35000}],\"transfers\":[{\"from\":\"WIFI♥\",\"to\":\"Bin\",\"amount\":35000}],\"rows_digest\":\"08cb42034599e093a5c0ab7bcc975449\",\"note\":\"합성 정산\",\"completed_by\":\"user-bin\",\"status\":\"completed\"}",
  routes: "GET /my/settlement/refund-link 404\nPOST /my/settlement/refund-link 404 \nPOST /my/settlement/refund-unlink 404 \nPOST /my/settlement/refund-keep 404 ",
  readyKeys: "ok,ready,version,skill_caller_auth_configured,skill_caller_auth,checked_tables,checked_required_tables,checked_optional_tables,checked_rpcs,failed_tables,unavailable_optional_tables,missing_rpcs,ads_mode",
};

const failures = [];
let checks = 0;
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 400); } catch (_) { return String(value).slice(0, 400); } };
function record(pass, message, detail = "") { checks += 1; if (!pass) failures.push(detail ? `${message} :: ${detail}` : message); }
const t = {
  ok: (value, message) => record(Boolean(value), message),
  eq: (actual, expected, message) => record(actual === expected, message, `실제 ${show(actual)} / 기대 ${show(expected)}`),
  deepEq: (actual, expected, message) => {
    let pass = true;
    try { assert.deepStrictEqual(actual, expected); } catch (_) { pass = false; }
    record(pass, message, `실제 ${show(actual)} / 기대 ${show(expected)}`);
  },
};
const attempt = async (task, fallback = null) => { try { return await task(); } catch (_) { return fallback; } };
async function load(rel) { try { return await import(new URL(rel, import.meta.url).href); } catch (_) { return {}; } }
const domain = await load("../src/modules/domain/refund-links.js");
const feature = await load("../src/modules/features/settlement-refund-links.js");
const settlementPages = await load("../src/modules/features/settlement-ops-pages.js");
const replyTexts = await load("../src/modules/kakao/reply-texts.js");
const call = (mod, name, ...args) => { try { return typeof mod[name] === "function" ? mod[name](...args) : undefined; } catch (_) { return undefined; } };
const plain = (value) => (value === undefined ? undefined : JSON.parse(JSON.stringify(value)));

const HH = "house-home";
const MONTH = "2026-10";
const SUMMARY = `/settlement-summary?month=${MONTH}&household_id=${HH}`;
const tx = (id, user, type, amount, category, memo, date, extra = {}) => ({ id, household_id: HH, user_id: user, type, amount, category, memo, payment_method: "카드", transaction_date: date, source: "my_web", raw_text: memo, created_at: `${date}T09:00:00.000Z`, ...extra });
const BASE_ROWS = () => [
  tx("e0", "user-bin", "expense", 80000, "가전", "가전 구매", "2026-09-20"),
  tx("e1", "user-bin", "expense", 100000, "생활", "쿠팡 주문", "2026-10-03"),
  tx("e2", "user-wifi", "expense", 30000, "식비", "점심", "2026-10-05"),
  tx("s1", "user-bin", "income", 2000000, "급여", "월급", "2026-10-10"),
  tx("r1", "user-bin", "income", 40000, "환급", "쿠팡 환불", "2026-10-12"),
  tx("r2", "user-wifi", "income", 20000, "환급", "가전 환불", "2026-10-14"),
];
const linkRow = (id, expense, refund, amount) => ({ id, household_id: HH, expense_id: expense, refund_id: refund, amount, created_by: "user-bin", created_at: "2026-10-14T01:00:00Z" });

function seed(fx, { flag, rows = BASE_ROWS(), links = [] } = {}) {
  if (flag === undefined) delete fx.env.REFUND_LINKS_ENABLED; else fx.env.REFUND_LINKS_ENABLED = flag;
  // /ready 가 구성 점검에서 멈추지 않고 표 점검까지 가게 한다(validate-skill-auth-purge-v22873 와 같다).
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-secret";
  fx.env.ADMIN_API_TOKEN = "qa-admin-api-token";
  fx.db.transactions = rows;
  fx.db.accountbook_refund_links = links;
  fx.db.accountbook_settings.push({ id: "sel-v22979-refund", key: `kakao_selected_household_v2251:user-bin`, value: HH, created_at: "2026-07-01T00:00:00Z" });
}

// SQL(accountbook_link_refund_v22979·accountbook_unlink_refund_v22979)의 확인 순서를 따른 메모리 흉내.
const rpcError = (message) => new Response(JSON.stringify({ code: "P0001", details: null, hint: null, message }), { status: 400, headers: { "content-type": "application/json" } });
const json = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const minusDays = (ymd, days) => new Date(Date.parse(`${ymd}T00:00:00Z`) - days * 86400000).toISOString().slice(0, 10);
const roleOf = (fx, userId) => { const member = fx.db.household_members.find((row) => row.household_id === HH && row.user_id === userId); return member ? String(member.role || "member").toLowerCase() : ""; };
const historyMonths = (fx) => { try { return JSON.parse(fx.db.accountbook_settings.find((row) => row.key === `settlement_history:${HH}`)?.value || "[]").map((entry) => entry.month); } catch (_) { return null; } };
function linkRpc(fx, body, nextId) {
  const { p_household_id: hid, p_actor_user_id: actor, p_expense_id: eid, p_refund_id: rid, p_amount: amount } = body;
  if (!hid || !actor || !eid || !rid || eid === rid) return rpcError("refund_link_input_invalid");
  if (!Number.isSafeInteger(amount) || amount < 1 || amount > 2000000000) return rpcError("refund_link_amount_invalid");
  if (!["owner", "admin"].includes(roleOf(fx, actor))) return rpcError("refund_link_permission_denied");
  const expense = fx.db.transactions.find((row) => row.id === eid);
  const refund = fx.db.transactions.find((row) => row.id === rid);
  if (!expense || !refund || expense.household_id !== hid || refund.household_id !== hid) return rpcError("refund_link_record_not_found");
  const same = (row, want) => Boolean(want) && Number(row.amount) === Number(want.amount) && row.type === want.type && (row.category ?? null) === (want.category ?? null) && String(row.user_id ?? "") === String(want.user_id ?? "") && String(row.transaction_date).slice(0, 10) === want.transaction_date;
  if (!same(expense, body.p_expected?.expense) || !same(refund, body.p_expected?.refund)) return rpcError("refund_link_source_changed");
  if (expense.type !== "expense" || refund.type !== "income" || refund.category !== "환급") return rpcError("refund_link_kind_invalid");
  if (!expense.user_id) return rpcError("refund_link_spender_required");
  if (!refund.user_id) return rpcError("refund_link_recipient_required");
  if (!["owner", "admin", "member", "viewer"].includes(roleOf(fx, refund.user_id))) return rpcError("refund_link_recipient_invalid");
  if (expense.transaction_date > refund.transaction_date) return rpcError("refund_link_date_order");
  if (expense.transaction_date < minusDays(refund.transaction_date, 365)) return rpcError("refund_link_window");
  const links = fx.db.accountbook_refund_links;
  if (links.some((link) => link.expense_id === eid && link.refund_id === rid)) return rpcError("refund_link_duplicate");
  const sum = (key, id) => links.filter((link) => link[key] === id).reduce((total, link) => total + Number(link.amount), 0);
  if (sum("refund_id", rid) + amount > Number(refund.amount) || sum("expense_id", eid) + amount > Number(expense.amount)) return rpcError("refund_link_amount_exceeded");
  const months = historyMonths(fx);
  if (!months) return rpcError("refund_link_history_invalid");
  if (months.includes(String(refund.transaction_date).slice(0, 7))) return rpcError("refund_link_month_completed");
  const id = nextId();
  links.push({ id, household_id: hid, expense_id: eid, refund_id: rid, amount, created_by: actor, created_at: `2026-10-15T0${links.length % 10}:00:00Z` });
  return json({ ok: true, link_id: id, amount, refund_linked: sum("refund_id", rid), expense_linked: sum("expense_id", eid) });
}
function unlinkRpc(fx, body) {
  const { p_household_id: hid, p_actor_user_id: actor, p_link_id: lid } = body;
  if (!hid || !actor || !lid) return rpcError("refund_link_input_invalid");
  if (!["owner", "admin"].includes(roleOf(fx, actor))) return rpcError("refund_link_permission_denied");
  const links = fx.db.accountbook_refund_links;
  const index = links.findIndex((link) => link.id === lid && link.household_id === hid);
  if (index < 0) return rpcError("refund_link_not_found");
  if (Number(links[index].amount) !== Number(body.p_expected_amount)) return rpcError("refund_link_source_changed");
  const refund = fx.db.transactions.find((row) => row.id === links[index].refund_id);
  const months = historyMonths(fx);
  if (!months) return rpcError("refund_link_history_invalid");
  if (refund && months.includes(String(refund.transaction_date).slice(0, 7))) return rpcError("refund_link_month_completed");
  const [removed] = links.splice(index, 1);
  return json({ ok: true, link_id: removed.id, amount: removed.amount });
}
// table:false 는 표가 없는 운영 DB(404 PGRST205), rpcs:false 는 함수가 없는 DB(픽스처 기본 404 PGRST202)다.
function refundDb(fx, { table = true, rpcs = true } = {}) {
  const log = { requests: [], rpc: [] };
  let seq = 0;
  intercept(async ({ url, method, init }) => {
    if (url.hostname !== "mock.supabase.co") return undefined;
    log.requests.push(`${method} ${url.pathname}${url.search}`);
    if (url.pathname === "/rest/v1/accountbook_refund_links" && !table) {
      return new Response(JSON.stringify({ code: "PGRST205", details: null, hint: null, message: "Could not find the table 'public.accountbook_refund_links' in the schema cache" }), { status: 404, headers: { "content-type": "application/json" } });
    }
    const name = url.pathname.match(/^\/rest\/v1\/rpc\/(accountbook_(?:link|unlink)_refund_v22979)$/)?.[1];
    if (!name || !table || !rpcs) return undefined;
    const body = JSON.parse(String(init.body || "{}"));
    log.rpc.push({ name, body });
    return name === "accountbook_link_refund_v22979" ? linkRpc(fx, body, () => `link-${++seq}`) : unlinkRpc(fx, body);
  });
  // 준비 확인(/ready)은 빈 uuid 로 함수가 있는지만 본다. 실제 호출만 센다.
  log.calls = (name) => log.rpc.filter((entry) => entry.name === name && entry.body.p_household_id);
  log.refundRequests = () => log.requests.filter((line) => /refund_links|refund_review_kept|refund_v22979/.test(line));
  return log;
}

const mainOf = (html = "") => { const start = html.indexOf("<main"); const end = html.indexOf("</main>"); return start >= 0 && end > start ? html.slice(start, end + 7) : ""; };
const sha = (text) => createHash("sha256").update(String(text)).digest("hex").slice(0, 24);
const decode = (text = "") => String(text).replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const copyText = (html = "") => decode((html.match(/id="settlementCopy">([\s\S]*?)<\/div>/)?.[1] || "").replace(/<br\s*\/?>/g, "\n").replace(/<[^>]+>/g, ""));
const digestOf = (html = "") => html.match(/name="preview_digest" value="([a-f0-9]+)"/)?.[1] || "";
const sectionOf = (html = "") => decode((html.match(/<section class="card" id="refund-links">[\s\S]*?<\/section>/)?.[0] || "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));
// 그린 화면의 POST 폼(속성 순서 무관)을 찾아 입력값을 모은다. 체크 칸도 켠 것으로 본다.
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
const asValues = (fields) => ({ ...(fields || {}) });
const settingOf = (fx, key) => fx.db.accountbook_settings.find((row) => row.key === key)?.value;
const historyOf = (fx) => attempt(async () => JSON.parse(settingOf(fx, `settlement_history:${HH}`) || "[]"), []);
async function completeMonth(fx, html) {
  const form = postForms(html, "/my/settlement/save")[0] || {};
  return post(fx, "/my/settlement/save", { ...asValues(form), note: "합성 정산", confirmed: "yes" });
}
async function pickerForm(fx, refundId, expenseId, query = "", cookie = fx.cookie) {
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${MONTH}&refund_id=${refundId}${query}`, { cookie });
  return { picker, form: postForms(picker.html, "/my/settlement/refund-link").find((fields) => fields.expense_id === expenseId) || null };
}
const ready = async (fx) => attempt(async () => { const response = await app.fetch(new Request(`${BASE}/ready`), fx.env, ctx); const data = await response.json(); delete data.time; return { status: response.status, data }; }, { status: 0, data: {} });
async function scenario(name, task) {
  try {
    await withClock("2026-10-15", () => fixture(async (fx) => { await task(fx); }));
    record(true, `${name}: 장면이 예외 없이 끝난다`);
  } catch (error) {
    record(false, `${name}: 장면이 예외 없이 끝난다`, String(error?.stack || error).slice(0, 400));
  }
}

// ── 1. 계산(요청 없음): 같은 달·지난달 원지출·품목별·음수 총액·W-7 연결점 ─────────────────────────────
{
  const members = [{ household_id: HH, user_id: "user-bin", role: "owner", nickname: "A" }, { household_id: HH, user_id: "user-wifi", role: "member", nickname: "B" }];
  const rows = BASE_ROWS();
  const octExpenses = rows.filter((row) => row.type === "expense" && row.transaction_date.startsWith(MONTH));
  const refundRowsById = new Map(rows.filter((row) => row.category === "환급").map((row) => [row.id, row]));
  refundRowsById.set("r3", tx("r3", "user-bin", "income", 50000, "환급", "가전 환불", "2026-10-12"));
  const expenseRowsById = new Map(rows.filter((row) => row.type === "expense").map((row) => [row.id, row]));
  const normalize = (raw, byExpense = expenseRowsById) => call(domain, "normalizeRefundLinkRows", raw, { householdId: HH, refundRowsById, expenseRowsById: byExpense });
  const model = (links, options = {}, expenseRows = octExpenses) => {
    const netting = call(domain, "refundSettlementNetting", links || []);
    return call(settlementPages, "buildSettlementModel", expenseRows, members, { mode: "equal", ...options, ...(netting ? { refundNetting: netting } : {}) });
  };
  const peopleOf = (m) => m?.people?.map((p) => [p.user_id, p.paid, p.share, p.balance]);

  const same = normalize([linkRow("l1", "e1", "r1", 40000)]);
  t.deepEq(plain(same)?.map((link) => [link.id, link.expense_id, link.refund_id, link.amount, link.recipient_user_id, link.refund_date, link.expense_category, link.expense_user_id]), [["l1", "e1", "r1", 40000, "user-bin", "2026-10-12", "생활", "user-bin"]], "연결 행을 받은 사람·환급 날짜·원지출 분류가 붙은 평평한 모양으로 만든다");
  const sameModel = model(same);
  t.eq(sameModel?.totalExpense, 90000, "같은 달: 연결한 환불 40,000원을 그 달 총 지출에서 뺀다(130,000 → 90,000)");
  t.eq(sameModel?.grossExpense, 130000, "같은 달: 빼기 전 총 지출을 함께 남긴다");
  t.eq(sameModel?.refundTotal, 40000, "같은 달: 뺀 환불 합계");
  t.deepEq(peopleOf(sameModel), [["user-bin", 60000, 45000, 15000], ["user-wifi", 30000, 45000, -15000]], "같은 달: 받은 사람(A)이 낸 돈에서 환불을 뺀다");
  t.deepEq(sameModel?.transfers, [{ from: "B", to: "A", amount: 15000 }], "같은 달: B → A 15,000원");
  const sameItem = model(same, { mode: "item", itemParticipants: { e1: ["user-bin", "user-wifi"], e2: ["user-wifi"] } });
  t.deepEq(sameItem?.transfers, [{ from: "B", to: "A", amount: 30000 }], "품목별 같은 달: 원지출 품목에서 환불을 빼고 그 품목 참여자끼리 나눈다(B → A 30,000원)");

  const cross = normalize([linkRow("l2", "e0", "r2", 20000)]);
  t.eq(plain(cross)?.[0]?.expense_date, "2026-09-20", "지난달 원지출 연결도 원지출 날짜를 붙인다");
  const crossModel = model(cross);
  t.eq(crossModel?.totalExpense, 110000, "지난달 원지출: 차감은 환불이 들어온 달(10월)에 잡힌다(130,000 → 110,000)");
  t.deepEq(peopleOf(crossModel), [["user-bin", 100000, 55000, 45000], ["user-wifi", 10000, 55000, -45000]], "지난달 원지출: 받은 사람(B)이 낸 돈에서 뺀다");
  t.deepEq(crossModel?.transfers, [{ from: "B", to: "A", amount: 45000 }], "지난달 원지출: B → A 45,000원(환불 몫 10,000원이 더해진다)");
  const crossItem = model(cross, { mode: "item", itemParticipants: { e1: ["user-bin"], e2: ["user-wifi"] } });
  t.deepEq(crossItem?.transfers, [{ from: "B", to: "A", amount: 10000 }], "품목별 지난달 원지출: 이 달 품목이 없으면 모든 참여자에게 똑같이 나눠 뺀다(B → A 10,000원)");
  const crossNoExpense = normalize([linkRow("l2", "e0", "r2", 20000)], new Map());
  t.deepEq(plain(crossNoExpense)?.map((link) => [link.id, link.expense_id, link.expense_category]), [["l2", "e0", ""]], "원지출 행을 읽지 않은 경로(카카오)도 연결은 그대로 남긴다(정산은 expense_id 만 쓴다)");
  t.eq(model(crossNoExpense)?.totalExpense, 110000, "원지출 행이 없어도 정산 결과는 같다");

  const surplus = model(normalize([linkRow("l3", "e0", "r3", 50000)]), {}, octExpenses.filter((row) => row.id === "e2"));
  t.eq(surplus?.totalExpense, -20000, "환불이 그 달 지출보다 크면 총액이 음수가 된다(30,000 − 50,000)");
  t.deepEq(surplus?.transfers, [{ from: "A", to: "B", amount: 40000 }], "음수 총액: 환불을 받은 A 가 B 에게 40,000원을 보낸다");
  t.eq(model([])?.totalExpense, 130000, "연결이 없으면 예전 계산과 같다");
  t.eq(call(domain, "refundSettlementNetting", []), null, "연결이 없으면 정산 옵션을 만들지 않는다");

  const months = call(domain, "refundDeductionsByMonth", [...(same || []), ...(cross || []), { id: "lp", expense_id: "ex", refund_id: "rx", amount: 1000, recipient_user_id: "user-bin", refund_date: "2026-11-02", expense_category: "__proto__", expense_user_id: "user-bin" }]);
  t.deepEq(plain(months?.[MONTH]), { month: MONTH, total: 60000, count: 2, byCategory: { 생활: 40000, 가전: 20000 }, bySpender: { "user-bin": 60000 }, byRecipient: { "user-bin": 40000, "user-wifi": 20000 } }, "W-7 연결점: 환급 날짜의 달마다 분류·지출자·받은 사람별 차감");
  t.ok(months && Object.getPrototypeOf(months) === null && Object.getPrototypeOf(months[MONTH]?.byCategory ?? {}) === null, "W-7 연결점: 계산 맵은 원형 없는 객체다");
  t.ok(months?.["2026-11"] && Object.hasOwn(months["2026-11"].byCategory, "__proto__") && months["2026-11"].byCategory.__proto__ === 1000 && ({}).total === undefined, "W-7 연결점: 분류 이름이 __proto__ 여도 값으로만 남는다");

  const partial = normalize([linkRow("l1", "e1", "r1", 40000), linkRow("l4", "e0", "r2", 15000)]);
  const octAll = rows.filter((row) => row.transaction_date.startsWith(MONTH));
  const netted = call(domain, "applyRefundLinkNetting", octAll, partial || []);
  const sumOf = (list, type) => (list || []).filter((row) => row.type === type).reduce((total, row) => total + Number(row.amount), 0);
  t.eq(netted?.total, 55000, "M-7 연결점: 그 달 차감 합계");
  t.eq(sumOf(netted?.rows, "expense"), 75000, "M-7 연결점: 지출 합계 −L(130,000 → 75,000)");
  t.eq(sumOf(netted?.rows, "income"), 2005000, "M-7 연결점: 수입 합계도 −L(2,060,000 → 2,005,000)");
  t.eq(sumOf(netted?.rows, "income") - sumOf(netted?.rows, "expense"), sumOf(octAll, "income") - sumOf(octAll, "expense"), "M-7 연결점: 잔액(수입 − 지출)은 그대로다");
  t.deepEq(plain(netted?.rows?.filter((row) => row.source === "refund_link").map((row) => [row.id, row.amount, row.category, row.user_id, row.transaction_date])), [["refund-link:l1", -40000, "생활", "user-bin", "2026-10-12"], ["refund-link:l4", -15000, "가전", "user-bin", "2026-10-14"]], "M-7 연결점: 차감 행은 환급 날짜·원지출 분류·지출자의 음수 지출(source refund_link)");
  t.ok(netted?.rows && !netted.rows.some((row) => row.id === "r1") && netted.rows.find((row) => row.id === "r2")?.amount === 5000, "M-7 연결점: 다 연결한 환급은 빠지고, 일부만 연결한 환급은 남은 금액만 남는다");
  t.eq(octAll.find((row) => row.id === "r2").amount, 20000, "M-7 연결점: 입력 행을 바꾸지 않는다");
  t.deepEq(plain(call(domain, "refundLinkDeductionRows", partial || [])?.map((row) => row.amount)), [-40000, -15000], "W-7 연결점: 차감 행만 따로 만들 수 있다");

  const allowed = (expense, refund) => call(domain, "refundLinkDateAllowed", expense, refund);
  t.deepEq([allowed("2025-10-14", "2026-10-14"), allowed("2025-10-13", "2026-10-14"), allowed("2026-10-15", "2026-10-14"), allowed("2023-03-01", "2024-02-29"), allowed("2023-02-28", "2024-02-29"), allowed("2026-10-14", "2026-10-14")], [true, false, false, true, false, true], "원지출은 환급 날짜 이하·365일 전까지(운영자 답 6)");
  const candidates = [rows[2], tx("e-nouser", "", "expense", 9000, "생활", "쿠팡 주문", "2026-10-02", { user_id: null }), rows[1], tx("e-late", "user-bin", "expense", 9000, "생활", "쿠팡 주문", "2026-10-20"), tx("e-old", "user-bin", "expense", 9000, "생활", "쿠팡 주문", "2025-10-01"), rows[3], rows[0]];
  t.deepEq(call(domain, "rankRefundCandidates", rows[4], candidates, { remaining: 40000 })?.map((row) => row.id), ["e1", "e0", "e2"], "원래 지출 후보: 같은 내용 → 남은 환급액 이상 → 가까운 날짜, 쓴 사람 없는·늦은·365일 밖·수입 행은 뺀다");
  const absent = (status, code) => call(domain, "isRefundLinksAbsentError", new Error(`Supabase ${status}: {"code":"${code}","message":"x"}`));
  t.deepEq([absent(404, "PGRST205"), absent(404, "PGRST202"), absent(503, "PGRST205"), absent(400, "P0001")], [true, true, false, false], "표·함수 없음(404 PGRST205·PGRST202)만 ‘기능 없음’으로 본다");
  t.deepEq([
    call(domain, "refundLinkErrorCode", new Error("Supabase 400: {\"code\":\"P0001\",\"message\":\"refund_link_permission_denied\"}")),
    call(domain, "refundLinkErrorCode", new Error("Supabase 404: {\"code\":\"PGRST202\",\"message\":\"RPC not found\"}")),
    call(domain, "refundLinkErrorCode", new Error("settings_rmw_busy")),
    call(domain, "refundLinkErrorCode", new Error("boom")),
  ], ["refund_link_permission_denied", "refund_link_unavailable", "refund_link_busy", "refund_link_failed"], "RPC 오류 문장을 안내 코드로 바꾼다");
}

// ── 2. 플래그 꺼짐: 정산 화면·카카오 답장·완료 이력·경로·/ready 가 V22.9.78 과 같다 ─────────────────
const baseline = {};
const golden = {};
for (const flag of [undefined, "0", "false", "", "off", "no", "disabled"]) {
  const label = `플래그 ${flag === undefined ? "없음" : `"${flag}"`}`;
  await scenario(label, async (fx) => {
    seed(fx, { flag });
    const log = refundDb(fx);
    const owner = await page(fx, SUMMARY);
    const item = await page(fx, `${SUMMARY}&mode=item`);
    const member = await page(fx, SUMMARY, { cookie: await fx.cookieFor("user-wifi") });
    const kakao = await skill(fx, "정산");
    const saved = await completeMonth(fx, owner.html);
    const history = await historyOf(fx);
    const entry = { ...(history.at(-1) || {}) };
    delete entry.id; delete entry.completed_at;
    const after = await page(fx, `${SUMMARY}&msg=settlement_completed`);
    const routes = [];
    for (const path of ["/my/settlement/refund-link?household_id=house-home&month=2026-10&refund_id=r1"]) routes.push(`GET ${path.split("?")[0]} ${(await page(fx, path)).status}`);
    for (const path of ["/my/settlement/refund-link", "/my/settlement/refund-unlink", "/my/settlement/refund-keep"]) {
      const res = await post(fx, path, { household_id: HH, month: MONTH, refund_id: "r1", expense_id: "e1", amount: "1000", link_id: "l1", source_digest: "0".repeat(32) });
      routes.push(`POST ${path} ${res.status} ${res.location}`);
    }
    const readiness = await ready(fx);
    const values = {
      equalMain: sha(mainOf(owner.html)), itemMain: sha(mainOf(item.html)), memberMain: sha(mainOf(member.html)), afterMain: sha(mainOf(after.html)),
      kakao, entry: JSON.stringify(entry), routes: routes.join("\n"), readyKeys: Object.keys(readiness.data).join(","),
    };
    if (flag === undefined) {
      Object.assign(golden, values);
      Object.assign(baseline, { kakao, entry: values.entry, digest: digestOf(owner.html), copy: copyText(owner.html), ready: readiness.data, status: owner.status, saved: saved.location });
    }
    for (const key of Object.keys(FLAG_OFF_GOLDEN)) t.eq(values[key], FLAG_OFF_GOLDEN[key], `${label}: ${key} 가 V22.9.78 과 같다`);
    t.eq(saved.status, 303, `${label}: 정산 완료 저장은 예전처럼 끝난다`);
    t.eq(entry.schema_version, 2, `${label}: 완료 이력은 예전 모양(schema_version 2)`);
    t.deepEq(log.refundRequests(), [], `${label}: 연결 표·RPC·수입으로 둔 목록을 읽지 않는다`);
    t.ok(!("refund_links" in readiness.data) && readiness.data.checked_required_tables === 13, `${label}: /ready 에 새 항목이 없고 필수 표는 13개 그대로다`);
  });
}

// ── 3. 플래그 켜짐·표 없음(DDL 적용 전): 오류 없이 ‘쓸 수 없음’을 알리고 정산은 그대로다 ────────────────
await scenario("플래그 켜짐·표 없음", async (fx) => {
  seed(fx, { flag: "1" });
  const log = refundDb(fx, { table: false });
  const owner = await page(fx, SUMMARY);
  t.eq(owner.status, 200, "표 없음: 정산 화면이 열린다");
  t.ok(sectionOf(owner.html).includes("환불 연결 기능을 아직 쓸 수 없어"), "표 없음: 환불 구역이 ‘아직 쓸 수 없음’을 알린다");
  t.ok(owner.html.includes("/my/settlement/refund-preview?household_id=house-home") && !owner.html.includes("refund-unlink") && !owner.html.includes("refund-keep"), "표 없음: 예전 환급 미리보기 링크를 두고 연결 단추는 없다");
  t.eq(digestOf(owner.html), baseline.digest, "표 없음: 완료 지문이 플래그 꺼짐과 같다");
  t.eq(copyText(owner.html).replace(/^.*\n/, "").split("\n").filter((line) => /총 지출|→|참여자/.test(line)).join("|"), baseline.copy?.replace(/^.*\n/, "").split("\n").filter((line) => /총 지출|→|참여자/.test(line)).join("|"), "표 없음: 총 지출·참여자·송금 제안이 플래그 꺼짐과 같다");
  t.eq(await skill(fx, "정산"), baseline.kakao, "표 없음: 카카오 ‘정산’ 답장이 플래그 꺼짐과 글자까지 같다");
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${MONTH}&refund_id=r1`);
  t.ok(picker.status === 200 && picker.html.includes("환불 연결 기능을 아직 쓸 수 없어요"), "표 없음: 원래 지출 고르기 화면도 오류 없이 ‘쓸 수 없음’");
  const crafted = await post(fx, "/my/settlement/refund-link", { household_id: HH, month: MONTH, refund_id: "r1", expense_id: "e1", amount: "40000", source_digest: "a".repeat(32) });
  t.ok(crafted.status === 303 && crafted.location.includes("err=refund_link_unavailable"), "표 없음: 연결 저장 요청은 ‘쓸 수 없음’으로 돌려보낸다");
  const flash = await page(fx, crafted.location.split("#")[0]);
  t.ok(flash.status === 200 && flash.html.includes("환불 연결 기능을 아직 쓸 수 없어요. 아무것도 바꾸지 않았어요.") && !flash.html.includes("정산 상태를 저장하지 못했습니다"), "표 없음: 정산 화면에 환불 안내만 보이고 일반 정산 오류 문장은 없다");
  const saved = await completeMonth(fx, owner.html);
  const entry = { ...((await historyOf(fx)).at(-1) || {}) };
  delete entry.id; delete entry.completed_at;
  t.ok(saved.status === 303 && saved.location.includes("msg=settlement_completed"), "표 없음: 정산 완료가 저장된다");
  t.eq(JSON.stringify(entry), baseline.entry, "표 없음: 완료 이력이 플래그 꺼짐과 같다(schema_version 2)");
  const readiness = await ready(fx);
  t.deepEq(readiness.data.refund_links, { enabled: true, available: false, table: "missing", missing_rpcs: ["accountbook_link_refund_v22979", "accountbook_unlink_refund_v22979"] }, "표 없음: /ready 는 기능 수준으로만 ‘쓸 수 없음’을 알린다");
  t.ok(readiness.data.checked_required_tables === 13 && readiness.data.ready === baseline.ready?.ready && readiness.status !== 0, "표 없음: /ready 판정·필수 표 13개는 플래그 꺼짐과 같다");
  t.ok(!String(readiness.data.failed_tables || "").includes("accountbook_refund_links"), "표 없음: 새 표를 필수 표로 세지 않는다");
  t.deepEq(log.calls("accountbook_link_refund_v22979"), [], "표 없음: 연결 RPC 를 실제로 부르지 않는다(함수도 없다)");
});

await scenario("플래그 켜짐·함수 없음", async (fx) => {
  seed(fx, { flag: "true" });
  const log = refundDb(fx, { rpcs: false });
  const { form } = await pickerForm(fx, "r1", "e1");
  t.ok(form?.source_digest?.length === 32 && form.amount === "40000", "함수 없음: 표가 있으면 원래 지출 고르기 화면은 열린다");
  const res = await post(fx, "/my/settlement/refund-link", asValues(form));
  t.ok(res.location.includes("err=refund_link_unavailable"), "함수 없음(404 PGRST202): 연결 저장은 ‘쓸 수 없음’");
  t.eq(fx.db.accountbook_refund_links.length, 0, "함수 없음: 연결 행이 생기지 않는다");
  const readiness = await ready(fx);
  t.deepEq(readiness.data.refund_links, { enabled: true, available: false, table: "ok", missing_rpcs: ["accountbook_link_refund_v22979", "accountbook_unlink_refund_v22979"] }, "함수 없음: /ready 가 빠진 함수를 알린다");
  t.ok(log.requests.length > 0, "함수 없음: 요청 기록이 남는다");
});

// ── 4. 같은 달 원지출 연결 → 정산·카카오·완료 이력 ───────────────────────────────────────────
await scenario("같은 달 연결", async (fx) => {
  seed(fx, { flag: "1" });
  const log = refundDb(fx);
  const before = await page(fx, SUMMARY);
  const section = sectionOf(before.html);
  t.ok(section.includes("10/12 쿠팡 환불 +40,000원 · 받은 사람 Bin") && section.includes("10/14 가전 환불 +20,000원 · 받은 사람 WIFI♥"), "같은 달: 확인할 환급 두 건이 보인다");
  t.ok(before.html.includes(`/my/settlement/refund-link?household_id=house-home&amp;month=2026-10&amp;refund_id=r1`), "같은 달: 원래 지출 고르기 링크");
  const { picker, form } = await pickerForm(fx, "r1", "e1");
  t.ok(picker.status === 200 && postForms(picker.html, "/my/settlement/refund-link")[0]?.expense_id === "e1", "같은 달: 같은 내용(쿠팡)의 지출이 맨 위 후보다");
  t.eq(form?.amount, "40000", "같은 달: 뺄 금액 기본값은 남은 환급액과 원지출 남은 금액 중 작은 값");
  const linked = await post(fx, "/my/settlement/refund-link", asValues(form));
  t.ok(linked.status === 303 && linked.location === `/settlement-summary?month=2026-10&household_id=house-home&msg=refund_linked#refund-links`, "같은 달: 연결하고 정산 화면의 환불 구역으로 돌아간다");
  const calls = log.calls("accountbook_link_refund_v22979");
  t.deepEq(calls.map((entry) => [entry.body.p_household_id, entry.body.p_actor_user_id, entry.body.p_expense_id, entry.body.p_refund_id, entry.body.p_amount]), [[HH, "user-bin", "e1", "r1", 40000]], "같은 달: RPC 를 한 번, 로그인한 소유자 이름으로 부른다");
  t.deepEq(calls[0]?.body.p_expected, { expense: { amount: 100000, type: "expense", category: "생활", user_id: "user-bin", transaction_date: "2026-10-03" }, refund: { amount: 40000, type: "income", category: "환급", user_id: "user-bin", transaction_date: "2026-10-12" } }, "같은 달: RPC 가 잠근 행과 비교할 기대값을 함께 보낸다");
  t.deepEq(fx.db.accountbook_refund_links.map((link) => [link.expense_id, link.refund_id, link.amount]), [["e1", "r1", 40000]], "같은 달: 연결 행 하나");
  t.eq(fx.db.transactions.find((row) => row.id === "r1")?.category, "환급", "같은 달: 원래 기록은 바꾸지 않는다");
  const after = await page(fx, linked.location.split("#")[0]);
  t.ok(after.html.includes("원래 지출과 연결했어요. 이 정산과 지출 합계에서 그 금액을 뺐어요."), "같은 달: 연결 안내");
  t.ok(copyText(after.html).includes("총 지출: 90,000원") && copyText(after.html).includes("WIFI♥ → Bin 15,000원"), "같은 달: 웹 정산이 환불을 뺀 금액(90,000원·WIFI♥ → Bin 15,000원)");
  t.ok(sectionOf(after.html).includes("10/12 쿠팡 환불 40,000원 → 10/3 쿠팡 주문 100,000원(생활)에서 뺐어요"), "같은 달: 연결한 환불 목록");
  t.ok(after.html.includes("<span>뺀 환불</span><b>40,000원</b>") && after.html.includes("참여자와 연결한 환불을 뺀 금액을 확인했고 완료 이력으로 저장합니다."), "같은 달: 뺀 환불 지표와 완료 확인 문장");
  const kakao = await skill(fx, "정산");
  t.eq(kakao, ["📊 2026-10 정산", "연결한 환불 40,000원은 이 정산에서 뺐어요.", "원래 지출을 고르지 않은 환급 1건은 빼지 않았어요. 웹 정산 화면에서 고를 수 있어요.", "총 지출: 90,000원 (환불 40,000원 뺌)", "참여자: 2명", "1인 기준: 45,000원", "", "• Bin: 15,000원 받기", "• WIFI♥: 15,000원 보내기", "", "송금 제안", "• WIFI♥ → Bin: 15,000원"].join("\n"), "같은 달: 카카오 ‘정산’ 답장(새 문구)");
  const duplicate = await post(fx, "/my/settlement/refund-link", asValues(form));
  t.ok(duplicate.location.includes("err=refund_link_duplicate") && fx.db.accountbook_refund_links.length === 1, "같은 달: 같은 두 기록을 다시 연결하지 않는다");
  const { form: other } = await pickerForm(fx, "r2", "e2");
  fx.db.transactions.find((row) => row.id === "e2").amount = 31000;
  const changed = await post(fx, "/my/settlement/refund-link", asValues(other));
  t.ok(changed.location.includes("err=refund_link_source_changed") && log.calls("accountbook_link_refund_v22979").length === 1, "같은 달: 고르기 화면을 연 뒤 원지출이 바뀌면 RPC 전에 막는다");
  fx.db.transactions.find((row) => row.id === "e2").amount = 30000;
  // 화면을 연 뒤 연결이 생기면 완료 저장 지문이 달라져 막힌다.
  const stale = await completeMonth(fx, before.html);
  t.ok(stale.location.includes("err=settlement_changed") && (await historyOf(fx)).length === 0, "같은 달: 연결 전 지문으로는 정산 완료를 저장하지 않는다");
  const fresh = await page(fx, SUMMARY);
  const saved = await completeMonth(fx, fresh.html);
  const entry = (await historyOf(fx)).at(-1) || {};
  t.ok(saved.location.includes("msg=settlement_completed"), "같은 달: 새 지문으로 정산 완료");
  t.deepEq([entry.schema_version, entry.total_expense, entry.gross_expense, entry.refund_total], [3, 90000, 130000, 40000], "같은 달: 완료 이력 schema_version 3 에 뺀 환불을 남긴다");
  t.deepEq(entry.refund_links, [{ id: "link-1", expense_id: "e1", refund_id: "r1", amount: 40000, recipient_user_id: "user-bin" }], "같은 달: 완료 이력에 연결 목록");
  t.deepEq(entry.transfers, [{ from: "WIFI♥", to: "Bin", amount: 15000 }], "같은 달: 완료 이력의 송금 제안");
  const done = await page(fx, `${SUMMARY}&msg=settlement_completed`);
  t.ok(done.html.includes("90,000원 (환불 40,000원 뺌)"), "같은 달: 완료 이력 표에 뺀 환불을 적는다");
});

// ── 5. 지난달 원지출 연결(운영자 답 6): 차감은 환불이 들어온 달에 ───────────────────────────────
await scenario("지난달 원지출 연결", async (fx) => {
  seed(fx, { flag: "on" });
  const log = refundDb(fx);
  const { picker, form } = await pickerForm(fx, "r2", "e0");
  t.ok(picker.html.includes("9/20 가전 구매") && postForms(picker.html, "/my/settlement/refund-link")[0]?.expense_id === "e0", "지난달: 기본 후보(최근 365일)에 지난달 같은 내용 지출이 맨 위");
  t.eq(form?.amount, "20000", "지난달: 뺄 금액 기본값 20,000원");
  const linked = await post(fx, "/my/settlement/refund-link", asValues(form));
  t.ok(linked.location.includes("msg=refund_linked") && fx.db.accountbook_refund_links.length === 1, "지난달: 연결 저장");
  const october = await page(fx, SUMMARY);
  t.ok(copyText(october.html).includes("총 지출: 110,000원") && copyText(october.html).includes("WIFI♥ → Bin 45,000원"), "지난달: 10월 정산에서 20,000원을 빼고 받은 사람(WIFI♥) 몫을 줄인다");
  t.ok(sectionOf(october.html).includes("10/14 가전 환불 20,000원 → 9/20 가전 구매 80,000원(가전)에서 뺐어요"), "지난달: 웹 화면은 지난달 원지출을 읽어 보여 준다");
  const september = await page(fx, `/settlement-summary?month=2026-09&household_id=${HH}`);
  t.ok(copyText(september.html).includes("총 지출: 80,000원") && !september.html.includes("<span>뺀 환불</span>"), "지난달: 9월 정산은 그대로다");
  const kakao = await skill(fx, "정산");
  t.ok(kakao.includes("총 지출: 110,000원 (환불 20,000원 뺌)") && kakao.includes("• WIFI♥ → Bin: 45,000원") && kakao.includes("원래 지출을 고르지 않은 환급 1건"), "지난달: 카카오 답장도 같은 금액");
  const monthRows = fx.db.transactions.filter((row) => row.transaction_date.startsWith(MONTH));
  const before = log.requests.length;
  const offResult = await attempt(() => call(feature, "refundNettedMonthRows", { ...fx.env, REFUND_LINKS_ENABLED: "0" }, { householdId: HH, monthRows }));
  t.ok(offResult?.rows === monthRows && log.requests.length === before, "M-7 연결점: 플래그가 꺼지면 요청 없이 같은 행을 돌려준다");
  const netted = await attempt(() => call(feature, "refundNettedMonthRows", fx.env, { householdId: HH, monthRows }));
  t.ok(netted?.total === 20000 && !netted.rows.some((row) => row.id === "r2") && netted.rows.some((row) => row.id === "refund-link:link-1" && row.amount === -20000 && row.category === "가전" && row.user_id === "user-bin" && row.transaction_date === "2026-10-14"), "M-7 연결점: 그 달 행에 원지출 분류(가전)·지출자로 −20,000원을 넣는다");
  const byMonth = call(domain, "refundDeductionsByMonth", netted?.links || []);
  t.ok(byMonth?.[MONTH]?.byCategory?.가전 === 20000 && byMonth[MONTH].byRecipient["user-wifi"] === 20000 && !byMonth["2026-09"], "W-7 연결점: 차감은 10월(환급 달)에만 잡힌다");
  const state = await attempt(() => call(feature, "loadRefundLinkMonthState", fx.env, { householdId: HH, monthRows, withExpenses: true }));
  t.ok(state?.available === true && state.links?.length === 1 && state.needsReviewCount === 1 && state.linkedTotal === 20000, "연결 상태: 연결 1건·확인 대상 1건·연결 합계");
});

// ── 6. 정산을 완료한 달은 연결·풀기를 막는다(운영자 답 5) ──────────────────────────────────────
await scenario("완료한 달", async (fx) => {
  seed(fx, { flag: "1", links: [linkRow("link-a", "e1", "r1", 40000)] });
  const log = refundDb(fx);
  const { form } = await pickerForm(fx, "r2", "e2");
  t.ok(form?.source_digest?.length === 32, "완료한 달: 완료 전에 연 고르기 화면의 폼");
  const owner = await page(fx, SUMMARY);
  const saved = await completeMonth(fx, owner.html);
  t.ok(saved.location.includes("msg=settlement_completed"), "완료한 달: 10월 정산 완료");
  const locked = await page(fx, SUMMARY);
  t.ok(sectionOf(locked.html).includes("정산을 완료한 달이라 연결을 바꿀 수 없어요."), "완료한 달: 환불 구역이 잠김을 알린다");
  t.ok(!postForms(locked.html, "/my/settlement/refund-unlink").length && !postForms(locked.html, "/my/settlement/refund-keep").length && !locked.html.includes("원래 지출 고르기</a>"), "완료한 달: 연결 풀기·수입으로 두기·고르기 단추가 없다");
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${MONTH}&refund_id=r2`);
  t.ok(picker.html.includes("정산을 완료한 달의 환급은 연결하거나 풀 수 없어요.") && !postForms(picker.html, "/my/settlement/refund-link").length, "완료한 달: 고르기 화면도 후보를 내지 않는다");
  const link = await post(fx, "/my/settlement/refund-link", asValues(form));
  t.ok(link.location.includes("err=refund_link_month_completed") && log.calls("accountbook_link_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 1, "완료한 달: 열어 둔 폼으로 보내도 서버가 RPC 전에 막는다");
  const unlink = await post(fx, "/my/settlement/refund-unlink", { household_id: HH, month: MONTH, link_id: "link-a", amount: "40000" });
  t.ok(unlink.location.includes("err=refund_link_month_completed") && fx.db.accountbook_refund_links.length === 1, "완료한 달: 연결 풀기도 막는다");
  const otherMonth = await post(fx, "/my/settlement/refund-unlink", { household_id: HH, month: "2026-09", link_id: "link-a", amount: "40000" });
  t.ok(otherMonth.location.includes("err=refund_link_month_completed") && log.calls("accountbook_unlink_refund_v22979").length === 0, "완료한 달: 폼의 달을 바꿔도 환급 날짜의 달로 막는다");
  const kakao = await skill(fx, "정산");
  t.ok(kakao.includes("총 지출: 90,000원 (환불 40,000원 뺌)"), "완료한 달: 이미 연결한 환불은 그대로 반영된다");
});

// ── 7. 소유자·관리자만(운영자 답 4): 화면에서 숨기는 것만이 아니라 서버가 막는다 ───────────────────────
await scenario("구성원 권한", async (fx) => {
  seed(fx, { flag: "1", links: [linkRow("link-a", "e1", "r1", 40000)] });
  const log = refundDb(fx);
  const { form } = await pickerForm(fx, "r2", "e2");
  const wifi = await fx.cookieFor("user-wifi");
  const view = await page(fx, SUMMARY, { cookie: wifi });
  t.ok(view.status === 200 && sectionOf(view.html).includes("소유자·관리자가 원래 지출을 연결하거나 풀 수 있어요.") && sectionOf(view.html).includes("10/12 쿠팡 환불 40,000원 → 10/3 쿠팡 주문 100,000원(생활)에서 뺐어요"), "구성원: 연결은 보이지만 바꾸는 안내는 소유자·관리자 몫");
  t.ok(!postForms(view.html, "/my/settlement/refund-unlink").length && !postForms(view.html, "/my/settlement/refund-keep").length && !view.html.includes("원래 지출 고르기</a>"), "구성원: 단추가 없다");
  const picker = await page(fx, `/my/settlement/refund-link?household_id=${HH}&month=${MONTH}&refund_id=r2`, { cookie: wifi });
  t.ok(picker.status === 403 && !postForms(picker.html, "/my/settlement/refund-link").length, "구성원: 고르기 화면은 403");
  const link = await post(fx, "/my/settlement/refund-link", asValues(form), { cookie: wifi });
  t.ok(link.location.includes("err=refund_link_permission_denied") && log.calls("accountbook_link_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 1, "구성원: 소유자 화면의 폼을 그대로 보내도 서버가 막는다(RPC 를 부르지 않는다)");
  const unlink = await post(fx, "/my/settlement/refund-unlink", { household_id: HH, month: MONTH, link_id: "link-a", amount: "40000" }, { cookie: wifi });
  t.ok(unlink.location.includes("err=refund_link_permission_denied") && fx.db.accountbook_refund_links.length === 1, "구성원: 연결 풀기도 막는다");
  const keep = await post(fx, "/my/settlement/refund-keep", { household_id: HH, month: MONTH, refund_id: "r2", action: "keep" }, { cookie: wifi });
  t.ok(keep.location.includes("err=refund_link_permission_denied") && settingOf(fx, `refund_review_kept:${HH}`) === undefined, "구성원: 수입으로 두기도 막는다");
  const denied = await page(fx, link.location.split("#")[0], { cookie: wifi });
  t.ok(denied.html.includes("소유자·관리자만 환불을 연결하거나 풀 수 있어요."), "구성원: 막힌 이유를 알린다");
  fx.db.household_members.find((row) => row.household_id === HH && row.user_id === "user-wifi").role = "admin";
  const admin = await post(fx, "/my/settlement/refund-link", asValues(form), { cookie: wifi });
  t.ok(admin.location.includes("msg=refund_linked") && log.calls("accountbook_link_refund_v22979").at(-1)?.body.p_actor_user_id === "user-wifi", "관리자: 같은 폼으로 연결할 수 있다");
});

await scenario("다른 사이트 요청", async (fx) => {
  seed(fx, { flag: "1" });
  const log = refundDb(fx);
  const { form } = await pickerForm(fx, "r1", "e1");
  const response = await app.fetch(new Request(`${BASE}/my/settlement/refund-link`, { method: "POST", headers: { cookie: fx.cookie, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site", accept: "text/html" }, body: new URLSearchParams(asValues(form)).toString() }), fx.env, ctx);
  t.ok(!String(response.headers.get("location") || "").includes("refund_link") && log.calls("accountbook_link_refund_v22979").length === 0 && fx.db.accountbook_refund_links.length === 0, "다른 사이트에서 보낸 연결 요청은 공통 CSRF 확인이 RPC 전에 막는다");
});

// ── 8. 연결 풀기 ───────────────────────────────────────────────────────────────────────────
await scenario("연결 풀기", async (fx) => {
  seed(fx, { flag: "1", links: [linkRow("link-a", "e1", "r1", 40000)] });
  const log = refundDb(fx);
  const owner = await page(fx, SUMMARY);
  const form = postForms(owner.html, "/my/settlement/refund-unlink")[0];
  t.ok(form?.link_id === "link-a" && form.amount === "40000", "풀기: 연결한 환불마다 풀기 폼");
  const stale = await post(fx, "/my/settlement/refund-unlink", { ...asValues(form), amount: "39000" });
  t.ok(stale.location.includes("err=refund_link_source_changed") && fx.db.accountbook_refund_links.length === 1, "풀기: 금액이 다르면(화면이 오래되면) 풀지 않는다");
  const missing = await post(fx, "/my/settlement/refund-unlink", { ...asValues(form), link_id: "link-zzz" });
  t.ok(missing.location.includes("err=refund_link_not_found"), "풀기: 없는 연결");
  const done = await post(fx, "/my/settlement/refund-unlink", asValues(form));
  t.ok(done.location.includes("msg=refund_unlinked") && fx.db.accountbook_refund_links.length === 0, "풀기: 연결을 지운다");
  t.deepEq(log.calls("accountbook_unlink_refund_v22979").map((entry) => [entry.body.p_link_id, entry.body.p_expected_amount, entry.body.p_actor_user_id]), [["link-a", 40000, "user-bin"]], "풀기: RPC 를 한 번 부른다");
  const after = await page(fx, done.location.split("#")[0]);
  t.ok(after.html.includes("연결을 풀었어요.") && copyText(after.html).includes("총 지출: 130,000원") && sectionOf(after.html).includes("10/12 쿠팡 환불 +40,000원"), "풀기: 정산이 돌아오고 환급은 다시 확인 대상");
  const kakao = await skill(fx, "정산");
  t.ok(kakao.includes("원래 지출을 고르지 않은 환급 2건은 빼지 않았어요.") && kakao.includes("총 지출: 130,000원\n"), "풀기: 카카오 답장도 돌아온다");
});

// ── 9. 365일 창·날짜 순서(운영자 답 6) ─────────────────────────────────────────────────────────
await scenario("365일 창", async (fx) => {
  seed(fx, { flag: "1", rows: [...BASE_ROWS(), tx("e-old", "user-bin", "expense", 50000, "가전", "TV", "2025-10-13"), tx("e-edge", "user-bin", "expense", 30000, "가전", "TV 받침", "2025-10-14"), tx("e-late", "user-bin", "expense", 10000, "교통", "택시", "2026-10-20")] });
  const log = refundDb(fx);
  const edge = await pickerForm(fx, "r2", "e-edge", "&pick_month=2025-10");
  t.ok(edge.form && !postForms(edge.picker.html, "/my/settlement/refund-link").some((fields) => fields.expense_id === "e-old"), "365일: 2025-10 을 고르면 정확히 365일 전(10/14)은 후보, 10/13 은 아니다");
  const recent = await pickerForm(fx, "r2", "e-late");
  t.ok(!recent.form && postForms(recent.picker.html, "/my/settlement/refund-link").length >= 2, "날짜 순서: 환급보다 늦은 지출은 후보가 아니다");
  const old = await post(fx, "/my/settlement/refund-link", { household_id: HH, month: MONTH, refund_id: "r2", expense_id: "e-old", amount: "1000", source_digest: "0".repeat(32) });
  t.ok(old.location.includes("err=refund_link_window"), "365일: 창 밖 지출을 직접 보내도 막는다");
  const late = await post(fx, "/my/settlement/refund-link", { household_id: HH, month: MONTH, refund_id: "r2", expense_id: "e-late", amount: "1000", source_digest: "0".repeat(32) });
  t.ok(late.location.includes("err=refund_link_date_order"), "날짜 순서: 늦은 지출을 직접 보내도 막는다");
  t.eq(log.calls("accountbook_link_refund_v22979").length, 0, "365일·날짜 순서: RPC 를 부르기 전에 막는다");
  const linked = await post(fx, "/my/settlement/refund-link", asValues(edge.form));
  t.ok(linked.location.includes("msg=refund_linked") && fx.db.accountbook_refund_links[0]?.expense_id === "e-edge", "365일: 정확히 365일 전 지출은 연결된다");
  const otherMonth = await post(fx, "/my/settlement/refund-link", { household_id: HH, month: "2026-09", refund_id: "r1", expense_id: "e1", amount: "1000", source_digest: "0".repeat(32) });
  t.ok(otherMonth.location.includes("err=refund_link_input_invalid"), "환급은 그 환급이 있는 달의 정산 화면에서만 연결한다");
});

// ── 10. 수입으로 두기(운영자 답 7): 분류는 그대로, 확인 대상에서만 뺀다 ─────────────────────────────
await scenario("수입으로 두기", async (fx) => {
  seed(fx, { flag: "1" });
  refundDb(fx);
  const owner = await page(fx, SUMMARY);
  const form = postForms(owner.html, "/my/settlement/refund-keep").find((fields) => fields.refund_id === "r2");
  t.eq(form?.action, "keep", "수입으로 두기: 확인할 환급마다 폼");
  const kept = await post(fx, "/my/settlement/refund-keep", asValues(form));
  t.ok(kept.location.includes("msg=refund_kept") && settingOf(fx, `refund_review_kept:${HH}`) === JSON.stringify(["r2"]), "수입으로 두기: 가계부 설정에 환급 id 를 둔다");
  const row = fx.db.transactions.find((item) => item.id === "r2");
  t.ok(row.category === "환급" && row.amount === 20000 && row.type === "income", "수입으로 두기: 분류·금액·종류는 그대로");
  const after = await page(fx, SUMMARY);
  t.ok(sectionOf(after.html).includes("10/14 가전 환불 20,000원 · 수입으로 둠") && !after.html.includes("refund_id=r2\"") && !after.html.includes("refund_id=r2&"), "수입으로 두기: ‘수입으로 둔 환급’으로 옮기고 고르기 링크를 뺀다");
  t.ok(copyText(after.html).includes("총 지출: 130,000원"), "수입으로 두기: 정산 금액은 그대로");
  t.ok((await skill(fx, "정산")).includes("원래 지출을 고르지 않은 환급 1건"), "수입으로 두기: 카카오 확인 대상 수에서 빠진다");
  const unkeepForm = postForms(after.html, "/my/settlement/refund-keep").find((fields) => fields.refund_id === "r2");
  t.eq(unkeepForm?.action, "unkeep", "수입으로 두기: ‘다시 확인’ 폼");
  const unkept = await post(fx, "/my/settlement/refund-keep", asValues(unkeepForm));
  t.ok(unkept.location.includes("msg=refund_unkept") && settingOf(fx, `refund_review_kept:${HH}`) === "[]", "다시 확인: 목록에서 뺀다");
  t.ok(sectionOf(await page(fx, SUMMARY).then((res) => res.html)).includes("10/14 가전 환불 +20,000원"), "다시 확인: 다시 확인 대상");
});

// ── 11. V44 D-21: 카카오 정산이 8명·8건을 넘으면 남은 수를 알린다(플래그와 무관) ─────────────────────
async function crowd(fx, extra) {
  seed(fx, { rows: [tx("big", "user-bin", "expense", 100000, "식비", "회식", "2026-10-03")] });
  const aliases = { "user-bin": "Bin", "user-wifi": "WIFI♥" };
  for (let i = 3; i < 3 + extra; i += 1) {
    fx.db.users.push({ id: `user-m${i}`, kakao_user_key: `kakao_login:39${i}`, nickname: `멤버${i}`, created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: HH, user_id: `user-m${i}`, role: "member", created_at: `2026-07-0${Math.min(9, i)}T00:00:00.000Z` });
    aliases[`user-m${i}`] = `멤버${i}`;
  }
  fx.db.accountbook_settings.find((row) => row.key === `member_aliases:${HH}`).value = JSON.stringify(aliases);
  const text = await skill(fx, "정산");
  const [peoplePart, transferPart = ""] = text.split("송금 제안");
  return { text, people: peoplePart.split("\n").filter((line) => line.startsWith("• ")).length, transfers: transferPart.split("\n").filter((line) => line.startsWith("• ")).length };
}
await scenario("D-21 10명", async (fx) => {
  const reply = await crowd(fx, 8);
  t.ok(reply.text.includes("참여자: 10명") && reply.people === 8 && reply.transfers === 8, "D-21: 참여자 10명·송금 9건 중 8줄씩 보인다");
  t.ok(reply.text.includes("외 2명은 웹 정산 화면에서 볼 수 있어요."), "D-21: ‘외 2명’ 줄");
  t.ok(reply.text.includes("외 1건은 웹 정산 화면에서 볼 수 있어요."), "D-21: ‘외 1건’ 줄");
  t.ok(reply.text.indexOf("외 2명") < reply.text.indexOf("송금 제안") && reply.text.trim().endsWith("외 1건은 웹 정산 화면에서 볼 수 있어요."), "D-21: 사람 목록 끝·송금 제안 끝에 붙는다");
});
await scenario("D-21 9명", async (fx) => {
  const reply = await crowd(fx, 7);
  t.ok(reply.text.includes("외 1명은 웹 정산 화면에서 볼 수 있어요.") && reply.transfers === 8 && !/외 \d+건/.test(reply.text), "D-21: 송금 8건이면 ‘외 N건’ 줄이 없다");
});

// ── 12. /ready(플래그 켜짐·표 있음): 기능 수준 준비만 붙고 필수 표 13개는 그대로 ─────────────────────
await scenario("/ready 켜짐", async (fx) => {
  seed(fx, { flag: "1" });
  const log = refundDb(fx);
  const readiness = await ready(fx);
  t.deepEq(readiness.data.refund_links, { enabled: true, available: true, table: "ok", missing_rpcs: [] }, "/ready: 표와 두 함수가 있으면 available");
  t.ok(readiness.data.checked_required_tables === 13 && readiness.data.ready === baseline.ready?.ready, "/ready: 판정·필수 표 수는 그대로");
  t.ok(log.rpc.length === 2 && log.rpc.every((entry) => entry.body.p_household_id === "") && fx.db.accountbook_refund_links.length === 0, "/ready: 함수 확인은 빈 uuid 로만 부르고 아무것도 바꾸지 않는다");
});

// ── 13. 연결된 기록 수정이 DB 트리거에 막히면 ‘지연’이 아니라 이유를 알린다 ───────────────────────────
await scenario("연결된 기록 수정", async (fx) => {
  seed(fx, { flag: "1", links: [linkRow("link-a", "e1", "r1", 40000)] });
  refundDb(fx);
  intercept(({ url }) => (url.pathname === "/rest/v1/rpc/accountbook_update_transaction_v227" ? rpcError("refund_link_locked_amount") : undefined));
  const res = await post(fx, "/my/update", { id: "e1", household_id: HH, month: MONTH, type: "expense", amount: "30000", transaction_date: "2026-10-03", memo: "쿠팡 주문", category: "생활", payment_method: "카드" });
  t.ok(res.status === 303 && res.location.includes("err=refund_link_locked"), "수정: 트리거 오류(refund_link_locked_*)를 refund_link_locked 로 돌려보낸다");
  t.ok(String(call(replyTexts, "formatMessage", "refund_link_locked") || "").includes("환불과 연결된 기록이라 이 변경은 저장하지 않았습니다."), "수정: 막힌 이유와 푸는 곳을 알린다");
});

// ── 14. 검토용 SQL: 실행 금지 머리말·RAISE 가드·되돌리기 스크립트 ─────────────────────────────────
{
  const read = (rel) => { const path = new URL(`../${rel}`, import.meta.url); return existsSync(path) ? readFileSync(path, "utf8") : ""; };
  const apply = read("migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql");
  const rollback = read("migrations/V22_9_79_REFUND_LINKS_ROLLBACK_REVIEW_ONLY.sql");
  for (const [name, sql, guard] of [["적용", apply, "v22979_review_only_refund_links_approval_required"], ["되돌리기", rollback, "v22979_review_only_refund_links_rollback_approval_required"]]) {
    t.ok(sql.split("\n")[0].includes("실행 금지(DO NOT RUN)") && sql.split("\n")[0].includes("운영자 승인 전"), `${name} SQL: 첫 줄이 실행 금지 머리말`);
    const guardAt = sql.indexOf(`RAISE EXCEPTION '${guard}'`);
    const firstChange = Math.min(...["CREATE ", "DROP ", "ALTER ", "INSERT ", "DELETE "].map((word) => { const at = sql.search(new RegExp(`^\\s*${word}`, "m")); return at < 0 ? Infinity : at; }));
    t.ok(guardAt > sql.indexOf("BEGIN;") && sql.indexOf("BEGIN;") >= 0 && guardAt < firstChange, `${name} SQL: 바꾸는 문장보다 먼저 RAISE 가드가 막는다`);
  }
  t.ok(/CREATE TABLE public\.accountbook_refund_links/.test(apply) && /UNIQUE \(expense_id, refund_id\)/.test(apply) && /ON DELETE CASCADE/.test(apply), "적용 SQL: 연결 표(두 기록 쌍 하나·기록 삭제 때 함께 지움)");
  t.ok(/FUNCTION public\.accountbook_link_refund_v22979\(/.test(apply) && /FUNCTION public\.accountbook_unlink_refund_v22979\(/.test(apply) && /CREATE TRIGGER refund_link_guard_v22979/.test(apply), "적용 SQL: 두 RPC 와 트리거(_v22979)");
  t.ok((apply.match(/'refund_link_permission_denied'/g) || []).length >= 2 && (apply.match(/'refund_link_month_completed'/g) || []).length >= 2 && (apply.match(/\('owner', 'admin'\)/g) || []).length >= 2, "적용 SQL: 두 RPC 모두 소유자·관리자와 완료한 달을 DB 에서도 확인한다");
  t.ok(/REVOKE ALL ON TABLE public\.accountbook_refund_links FROM PUBLIC, anon, authenticated/.test(apply) && !/GRANT [^;]* TO (anon|authenticated)/.test(apply), "적용 SQL: anon·authenticated 권한이 없다");
  t.ok(/DROP TABLE IF EXISTS public\.accountbook_refund_links/.test(rollback) && /refund_links_not_empty/.test(rollback), "되돌리기 SQL: 연결이 남아 있으면 지우지 않는다");
}

if (PRINT_GOLDEN) {
  console.log(JSON.stringify(golden, null, 2));
  process.exit(0);
}
if (failures.length) {
  console.error(`V22.9.79 환불 연결·카카오 정산 외 N명 검사: ${failures.length} of ${checks} checks failed`);
  for (const line of failures) console.error(` - ${line}`);
  process.exit(1);
}
console.log(`V22.9.79 환불 연결·카카오 정산 외 N명 검사 (${checks} checks)`);
