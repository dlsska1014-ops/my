// V22.9.104 J-9 — 기록 수정·삭제 경쟁(구성원이 고치거나 지우는 사이 관리자가 지출자를 바꿈) 검사.
//
// ── 무엇을 보나 ──
//   구성원은 자기 기록(지출자 = 나)만 고치고 지운다. 그런데 권한을 본 읽기와 저장 사이에 관리자가 그 기록의 지출자를 바꾸면, 예전에는
//   구성원의 저장이 이제 남의 기록이 된 행에 들어갔다(웹 수정 /admin/update 는 바꾸는 칸만 조건에 걸었고, 카카오 수정·웹 삭제·카카오 삭제는
//   조건 없는 감사 RPC 였다). 이제 구성원 저장은 같은 요청 안에서 조건을 건다(새 SQL 없음):
//     · 웹 수정(/admin/update·/my/update)과 카카오 수정(웹에서 만든 내 기록): 같은 PATCH 에 user_id=eq.<나> 조건. 0행이면 다시 읽어 충돌로 답한다.
//     · 웹 삭제(/admin/delete·/my/delete)와 카카오 삭제(웹에서 만든 내 기록): 감사 삭제 함수 대신 일곱 칸(지출자 포함)을 견주는 조건부 삭제 함수
//       (accountbook_delete_transaction_if_v22988, V22.9.88 Y-2 에서 운영 적용).
//   소유자·관리자와 카카오로 쓴 기록(source_user_key — 쓴 사람의 기록)은 예전 그대로다. 보통 경로의 DB 요청 수는 같다(카카오 수정의 감사 한 줄만 답 뒤).
// 모두 메모리 픽스처(validation/qa-fixture.mjs)에서 실제 경로(app.fetch)를 돌린다. 네트워크·DB 없음.
import { readFileSync } from "node:fs";
import { app, BASE, fixture, intercept, page, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";

let checks = 0;
const failures = [];
function ok(condition, message) {
  checks += 1;
  if (!condition) failures.push(message);
}
function eq(actual, expected, message) {
  checks += 1;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) failures.push(`${message} — 실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)}`);
}
async function scenario(name, task) {
  try {
    await task();
  } catch (error) {
    checks += 1;
    failures.push(`${name}: 예외 ${String(error?.stack || error).split("\n").slice(0, 3).join(" / ")}`);
  }
}

const HH = "house-home";
const MONTH = "2026-07";
const TODAY = "2026-07-15";
const WIFI_KEY = "kakao_login:2266";
const BIN_KEY = "kakao_login:2265";
const RETURN_TO = `/app?month=${MONTH}&household_id=${HH}&tab=transactions`;
const CONFLICT_TEXT = "다른 사람이 이 기록을 먼저 바꿨어요. 새로고침한 뒤 다시 확인해 주세요.";
const IF_RPC = "accountbook_delete_transaction_if_v22988";
const V227_DELETE = "accountbook_delete_transaction_v227";
const V227_UPDATE = "accountbook_update_transaction_v227";
const EDIT_KEYS = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"];

const paramsOf = (location) => new URL(location || "/", BASE).searchParams;
const outcomeOf = (res) => {
  const params = paramsOf(res.location);
  if (params.get("msg")) return `msg=${params.get("msg")}`;
  if (params.get("err")) return `err=${params.get("err")}`;
  return `status=${res.status}`;
};
const rowOf = (fx, id) => fx.db.transactions.find((row) => String(row.id) === id) || null;
const updateAudits = (fx, id) => (fx.db.accountbook_transaction_audit || []).filter((row) => row.action === "update" && String(row.transaction_id) === id);
const rpcNames = (fx) => (fx.db.__rpc_calls || []).map((call) => call.name);
const conflictEvents = () => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === "record_edit_conflict");
const withAudit = (task) => fixture(task, { auditDeletes: true });

function editForm(row, changes = {}) {
  const fields = { id: row.id, household_id: row.household_id, month: MONTH, return_to: RETURN_TO, type: row.type, transaction_date: row.transaction_date, amount: String(row.amount), memo: row.memo ?? "", category: row.category ?? "", payment_method: row.payment_method ?? "", user_id: row.user_id };
  for (const key of EDIT_KEYS) fields[`orig_${key}`] = String(row[key] ?? "");
  return { ...fields, ...changes };
}

// DB 요청을 센다(픽스처 Supabase 주소). tx 는 거래 표·감사 표·거래 RPC 만 센 수다.
function trace() {
  const calls = [];
  const stop = intercept(async ({ url, method }) => {
    if (url.hostname === "mock.supabase.co") calls.push({ method, path: url.pathname.replace("/rest/v1/", ""), params: Object.fromEntries(url.searchParams) });
    return null;
  });
  return { calls, stop };
}
const txCalls = (calls) => calls.filter((call) => /^(transactions|accountbook_transaction_audit|rpc\/accountbook_(update|delete)_transaction)/.test(call.path));
const patchesOf = (calls) => calls.filter((call) => call.method === "PATCH" && call.path === "transactions");

// 읽기 바로 뒤(권한·값을 본 뒤)·저장 전에 다른 사람(관리자)의 저장이 끼어드는 경우를 흉내 낸다. pick 이 맞는 GET 한 번에만 건다.
function raceAfterRead(fx, id, pick, change) {
  let armed = true;
  return intercept(async ({ url, method, forward }) => {
    if (!armed || method !== "GET" || url.pathname !== "/rest/v1/transactions" || url.searchParams.get("id") !== `eq.${id}`) return null;
    if (!pick(String(url.searchParams.get("select") || ""))) return null;
    armed = false;
    const response = await forward();
    Object.assign(rowOf(fx, id), change);
    return response;
  });
}

// 카카오 한 마디: 답이 나간 시점(답 전)과 답 뒤 일까지 끝난 시점의 DB 요청 수를 함께 센다.
async function say(fx, utterance, user) {
  const jobs = [];
  const t = trace();
  let before = 0;
  let text = "";
  try {
    const response = await app.fetch(new Request(`${BASE}/skill`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userRequest: { utterance, user: { id: user, type: "botUserKey", properties: { botUserKey: user } } } }),
    }), fx.env, { waitUntil(job) { jobs.push(job); } });
    before = t.calls.length;
    const raw = await response.text();
    for (let offset = 0; offset < jobs.length;) { const batch = jobs.slice(offset); offset += batch.length; await Promise.allSettled(batch); }
    try { text = JSON.parse(raw)?.template?.outputs?.map((o) => o?.simpleText?.text || o?.textCard?.description || o?.textCard?.title || "").join("\n") || raw; } catch (_) { text = raw; }
  } finally { t.stop(); }
  return { before, total: t.calls.length, calls: t.calls, text };
}
const kakaoRow = (id, extra = {}) => ({ id, household_id: HH, user_id: "user-wifi", source_user_key: WIFI_KEY, transaction_date: TODAY, type: "expense", amount: 5000, category: "식비", memo: "커피", payment_method: "현금", source: "kakao_skill", raw_text: "커피 5000", created_at: `${TODAY}T01:00:00.000Z`, ...extra });
const webRowExtra = { source_user_key: null, source: "my_web" };
const kakao = (task) => withClock(TODAY, () => withAudit(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  putSetting(fx, "kakao_selected_household_v2251:user-wifi", HH);
  fx.db.transactions = fx.db.transactions.filter((row) => row.transaction_date !== TODAY);
  return task(fx);
}));
const undoItems = (fx, kakaoUserKey) => {
  const entry = fx.db.accountbook_settings.find((row) => String(row.key).startsWith("kakao_edit_undo_v4:") && String(row.key).endsWith(`:${kakaoUserKey}`));
  if (!entry || !entry.value) return [];
  try { return (JSON.parse(entry.value).items || []).map((item) => String(item?.row?.id || "")); } catch (_) { return ["(깨짐)"]; }
};
const noUrl = (text) => !/https?:\/\//i.test(String(text || ""));

// ═══ 1. 웹 수정 /admin/update ═══════════════════════════════════════════════════════════════════════
await scenario("J-9 웹 수정 보통", () => withAudit(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-1"));
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" }), { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); }
  eq(outcomeOf(res), "msg=updated", "J-9 구성원이 지출자 그대로인 자기 기록을 고치면 저장된다");
  eq(rowOf(fx, "tx-expense-1")?.amount, 5000, "J-9 구성원의 금액이 저장된다");
  const patches = patchesOf(t.calls);
  eq(patches.length, 1, "J-9 구성원 저장은 조건부 PATCH 한 번(요청 수 그대로)");
  eq([patches[0]?.params.amount, patches[0]?.params.user_id], ["eq.148000", "eq.user-wifi"], "J-9 PATCH 는 바꾸는 칸의 읽은 값과 함께 ‘지출자 = 나’(user_id=eq.user-wifi)를 건다");
  eq(txCalls(t.calls).map((c) => `${c.method} ${c.path}`), ["GET transactions", "GET transactions", "PATCH transactions", "POST accountbook_transaction_audit"], "J-9 거래 쪽 요청은 예전과 같다(읽기 둘·PATCH·감사 한 줄)");
  eq(updateAudits(fx, "tx-expense-1").length, 1, "J-9 감사 기록 한 줄이 남는다");
  console.log(`  /admin/update 구성원 보통: DB 요청 ${t.calls.length}회`);
}));

await scenario("J-9 웹 수정 저장 직전 지출자 바뀜", () => withAudit(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-1"));
  const eventsBefore = conflictEvents().length;
  // 둘째 읽기(getTransactionForUserEdit, select 에 raw_text)가 끝난 뒤 관리자가 지출자를 Bin 으로 바꾼다 → 구성원의 PATCH 는 0행.
  const stop = raceAfterRead(fx, "tx-expense-1", (select) => select.includes("raw_text"), { user_id: "user-bin" });
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000", memo: "장보기 고침" }), { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); stop(); }
  eq(res.status, 409, "J-9 지출자가 바뀌었으면 저장하지 않고 안내(409)를 보인다");
  eq([rowOf(fx, "tx-expense-1")?.amount, rowOf(fx, "tx-expense-1")?.memo, rowOf(fx, "tx-expense-1")?.user_id], [148000, "주말 장보기", "user-bin"], "J-9 이제 남의 기록이 된 행을 덮어쓰지 않는다(금액·메모 그대로, 지출자는 관리자가 바꾼 값)");
  ok(res.text.includes("다른 사람이 이 기록을 먼저 바꿨어요.") && res.text.includes("새로고침한 뒤 다시 확인해 주세요."), "J-9 안내는 ‘다른 사람이 이 기록을 먼저 바꿨어요’ 쉬운 말이다");
  ok(res.text.includes('data-ab-edit-conflict="spender_changed"') && res.text.includes("지출자가 바뀌어"), "J-9 안내는 지출자가 바뀌었다고 말한다");
  ok(res.text.includes("5,000원") && res.text.includes("장보기 고침"), "J-9 입력한 값(금액·내용)은 잃지 않게 글로 남긴다");
  ok(!/<form\b/i.test(res.text) && !res.text.includes("orig_"), "J-9 이제 남의 기록이라 다시 고칠 폼은 주지 않는다");
  ok(!res.text.includes("무료"), "J-9 안내에 ‘무료’ 말이 없다");
  eq(updateAudits(fx, "tx-expense-1").length, 0, "J-9 저장하지 않았으니 수정 감사도 없다");
  eq(patchesOf(t.calls).length, 1, "J-9 PATCH 는 한 번(0행)이고 조건 없는 감사 RPC 로 다시 저장하지 않는다");
  ok(!rpcNames(fx).includes(V227_UPDATE), "J-9 조건 없는 감사 수정 RPC 를 부르지 않는다");
  ok(conflictEvents().length === eventsBefore + 1 && conflictEvents().at(-1)?.severity === "info" && conflictEvents().at(-1)?.path === "/admin/update", "J-9 운영 이벤트 record_edit_conflict(info)를 남긴다");
}));

await scenario("J-9 웹 수정 둘째 읽기 전 지출자 바뀜", () => withAudit(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-1"));
  // 첫 읽기(권한, select=id,household_id,user_id) 뒤에 바뀐다 → 둘째 읽기가 알아채 PATCH 하지 않는다.
  const stop = raceAfterRead(fx, "tx-expense-1", (select) => select === "id,household_id,user_id", { user_id: "user-bin" });
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" }), { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); stop(); }
  eq(res.status, 409, "J-9 둘째 읽기에서 지출자가 다르면 바로 안내(409)");
  eq(patchesOf(t.calls).length, 0, "J-9 그때는 PATCH 를 보내지 않는다");
  eq(rowOf(fx, "tx-expense-1")?.amount, 148000, "J-9 기록은 그대로다");
}));

await scenario("J-9 웹 수정 조건 어긋남 대비", () => withAudit(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-1"));
  // 값은 그대로인데 첫 PATCH 가 0행(eq 비교 어긋남)이면, 감사 RPC(조건 없음)가 아니라 ‘지출자 = 나’ 만 건 PATCH 로 저장한다.
  let first = true;
  const zero = intercept(({ url, method }) => {
    if (first && method === "PATCH" && url.pathname === "/rest/v1/transactions") { first = false; return new Response("[]", { status: 200, headers: { "content-type": "application/json" } }); }
    return null;
  });
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" }), { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); zero(); }
  eq(outcomeOf(res), "msg=updated", "J-9 조건 어긋남 대비 저장은 성공한다");
  eq(rowOf(fx, "tx-expense-1")?.amount, 5000, "J-9 금액이 저장된다");
  const patches = patchesOf(t.calls);
  eq(patches.length, 2, "J-9 PATCH 두 번(0행 → 지출자 조건만)");
  eq([patches[1]?.params.user_id, patches[1]?.params.amount], ["eq.user-wifi", undefined], "J-9 둘째 PATCH 는 지출자 조건만 건다");
  ok(!rpcNames(fx).includes(V227_UPDATE), "J-9 구성원은 조건 없는 감사 수정 RPC 로 가지 않는다");
  eq(updateAudits(fx, "tx-expense-1").length, 1, "J-9 감사 기록 한 줄이 남는다");
}));

await scenario("J-9 웹 수정 소유자 그대로", () => withAudit(async (fx) => {
  const own = structuredClone(rowOf(fx, "tx-expense-2"));
  const t = trace();
  let res;
  try { res = await post(fx, "/admin/update", editForm(own, { amount: "5000" })); } finally { t.stop(); }
  eq(outcomeOf(res), "msg=updated", "J-9 소유자 수정은 그대로 저장된다");
  eq(patchesOf(t.calls)[0]?.params.user_id, undefined, "J-9 소유자 PATCH 에는 지출자 조건을 걸지 않는다(예전 그대로)");
  // 소유자가 구성원 기록을 고치는 사이 지출자가 바뀌어도 소유자는 모든 기록을 고칠 수 있으므로 예전처럼 저장한다.
  const member = structuredClone(rowOf(fx, "tx-expense-1"));
  const stop = raceAfterRead(fx, "tx-expense-1", (select) => select.includes("raw_text"), { user_id: "user-bin" });
  let raced;
  try { raced = await post(fx, "/admin/update", editForm(member, { amount: "7000" })); } finally { stop(); }
  eq(outcomeOf(raced), "msg=updated", "J-9 소유자는 지출자가 바뀌어도 예전처럼 저장한다");
  eq(rowOf(fx, "tx-expense-1")?.amount, 7000, "J-9 소유자의 금액이 저장된다");
}));

// ═══ 2. 웹 삭제 /admin/delete (화면 삭제 단추 = JSON, 폼 직접 보내기 = 돌아가기) ═════════════════════════════
const del = (fx, id, cookie, accept = "application/json") => post(fx, "/admin/delete", { id, household_id: HH, month: MONTH, return_to: RETURN_TO }, { cookie, accept });
const beforeIfDelete = (fx, id, change) => { fx.db.__before_rpc = (name, data) => { if (name === IF_RPC && data.p_transaction_id === id) Object.assign(rowOf(fx, id), change); }; };

await scenario("J-9 웹 삭제 보통", () => withAudit(async (fx) => {
  const t = trace();
  let res;
  try { res = await del(fx, "tx-expense-1", await fx.cookieFor("user-wifi")); } finally { t.stop(); }
  const data = JSON.parse(res.text);
  eq([res.status, data.ok, data.deleted, data.transaction_id], [200, true, true, "tx-expense-1"], "J-9 구성원이 지출자 그대로인 자기 기록을 지우면 지워진다");
  eq(rowOf(fx, "tx-expense-1"), null, "J-9 기록이 지워진다");
  const call = fx.db.__rpc_calls.find((item) => item.name === IF_RPC);
  eq([call?.data.p_expected?.user_id, call?.data.p_expected?.amount, call?.data.p_expected?.memo], ["user-wifi", 148000, "주말 장보기"], "J-9 구성원 삭제는 읽은 일곱 칸(지출자 포함)을 견주는 조건부 삭제 함수로 지운다");
  ok(!rpcNames(fx).includes(V227_DELETE), "J-9 구성원은 조건 없는 감사 삭제 함수를 부르지 않는다");
  eq(txCalls(t.calls).map((c) => `${c.method} ${c.path}`), ["GET transactions", `POST rpc/${IF_RPC}`, "GET accountbook_transaction_audit"], "J-9 거래 쪽 요청 수는 예전과 같다(읽기·삭제 함수 하나·되돌리기 감사 번호)");
  const read = t.calls.find((c) => c.method === "GET" && c.path === "transactions");
  ok(String(read?.params.select || "").includes("payment_method"), "J-9 견줄 칸은 권한을 보는 첫 읽기에서 함께 읽는다(요청을 늘리지 않음)");
  ok(paramsOf(data.location).get("restore"), "J-9 되돌리기 표는 예전처럼 싣는다");
  console.log(`  /admin/delete 구성원 보통: DB 요청 ${t.calls.length}회`);
}));

await scenario("J-9 웹 삭제 직전 지출자 바뀜(JSON)", () => withAudit(async (fx) => {
  const eventsBefore = conflictEvents().length;
  beforeIfDelete(fx, "tx-expense-1", { user_id: "user-bin" });
  const res = await del(fx, "tx-expense-1", await fx.cookieFor("user-wifi"));
  fx.db.__before_rpc = null;
  const data = JSON.parse(res.text);
  eq([res.status, data.ok, data.error, data.conflict], [409, false, "record_delete_failed", "record_edit_conflict"], "J-9 지출자가 바뀌었으면 지우지 않고 충돌(409)로 답한다");
  eq(data.message, CONFLICT_TEXT, "J-9 답의 안내 문장");
  ok(data.uncertain !== true, "J-9 결과 모름이 아니다(화면이 기록을 다시 보이고 안내를 띄운다)");
  eq(rowOf(fx, "tx-expense-1")?.user_id, "user-bin", "J-9 이제 남의 기록이 된 행은 남는다");
  ok(conflictEvents().length === eventsBefore + 1 && conflictEvents().at(-1)?.path === "/admin/delete", "J-9 운영 이벤트 record_edit_conflict 를 남긴다");
  // 화면의 삭제 스크립트는 record_delete_failed 를 ‘분명한 실패’로 받아 message 를 띄우고 기록을 다시 보인다(스크립트는 바꾸지 않았다).
  const client = readFileSync(new URL("../src/modules/client/lucian-b-mains.js", import.meta.url), "utf8");
  ok(/var definite = \[[^\]]*"record_delete_failed"[^\]]*\]/.test(client) && client.includes("notice(data.message ||"), "J-9 화면 삭제 스크립트가 이 답의 안내 문장을 그대로 보인다");
}));

await scenario("J-9 웹 삭제 직전 내용 바뀜(폼)", () => withAudit(async (fx) => {
  beforeIfDelete(fx, "tx-expense-1", { amount: 9000 });
  const res = await del(fx, "tx-expense-1", await fx.cookieFor("user-wifi"), "text/html");
  fx.db.__before_rpc = null;
  eq(outcomeOf(res), "err=record_edit_conflict", "J-9 폼으로 지울 때도 그 사이 바뀐 기록은 지우지 않고 err=record_edit_conflict 로 돌아간다");
  eq(rowOf(fx, "tx-expense-1")?.amount, 9000, "J-9 바뀐 기록은 남는다");
  const landing = await page(fx, `/app?month=${MONTH}&household_id=${HH}&err=record_edit_conflict`, { cookie: await fx.cookieFor("user-wifi") });
  ok(landing.html.includes(CONFLICT_TEXT), "J-9 돌아간 화면에 안내 문장이 보인다");
}));

await scenario("J-9 웹 삭제 소유자·관리자 그대로", () => withAudit(async (fx) => {
  fx.db.users.push({ id: "user-adm", kakao_user_key: "kakao_login:2267", nickname: "Adm", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: HH, user_id: "user-adm", role: "admin", created_at: "2026-07-02T00:00:00.000Z" });
  const owner = await del(fx, "tx-expense-2", fx.cookie);
  eq([owner.status, JSON.parse(owner.text).deleted], [200, true], "J-9 소유자 삭제는 그대로 지워진다");
  const admin = await del(fx, "tx-expense-1", await fx.cookieFor("user-adm"));
  eq([admin.status, JSON.parse(admin.text).deleted], [200, true], "J-9 관리자 삭제도 그대로 지워진다");
  eq(rpcNames(fx).filter((name) => [V227_DELETE, IF_RPC].includes(name)), [V227_DELETE, V227_DELETE], "J-9 소유자·관리자는 예전처럼 감사 삭제 함수(v227)로 지운다");
}));

await scenario("J-9 웹 삭제 함수 없음 대비", () => withAudit(async (fx) => {
  fx.db.__missing_rpcs = [IF_RPC];
  const res = await del(fx, "tx-expense-1", await fx.cookieFor("user-wifi"));
  fx.db.__missing_rpcs = [];
  eq([res.status, JSON.parse(res.text).deleted], [200, true], "J-9 조건부 삭제 함수가 없으면(PGRST202) 예전처럼 지운다(V22.9.88 과 같은 대비)");
  ok(rpcNames(fx).includes(V227_DELETE), "J-9 그때는 감사 삭제 함수(v227)를 부른다");
}));

// ═══ 3. 웹 /my/update·/my/delete ═══════════════════════════════════════════════════════════════════
const myUpdate = { id: "tx-expense-1", household_id: HH, month: MONTH, amount: "5000", memo: "장보기", category: "식비", payment_method: "국민카드", transaction_date: "2026-07-04", type: "expense" };

await scenario("J-9 /my/update", () => withAudit(async (fx) => {
  const t = trace();
  let res;
  try { res = await post(fx, "/my/update", myUpdate, { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); }
  eq(outcomeOf(res), "msg=updated", "J-9 /my/update 보통 수정은 저장된다");
  const patches = patchesOf(t.calls);
  eq([patches.length, patches[0]?.params.user_id], [1, "eq.user-wifi"], "J-9 /my/update 는 PATCH 한 번에 ‘지출자 = 나’ 조건");
  const raced = await withAudit(async (fy) => {
    const stop = raceAfterRead(fy, "tx-expense-1", (select) => select.includes("raw_text"), { user_id: "user-bin" });
    try { return { res: await post(fy, "/my/update", myUpdate, { cookie: await fy.cookieFor("user-wifi") }), row: () => rowOf(fy, "tx-expense-1") }; } finally { stop(); }
  });
  eq(outcomeOf(raced.res), "err=record_edit_conflict", "J-9 /my/update 는 그 사이 지출자가 바뀌면 저장하지 않고 err=record_edit_conflict");
}));

await scenario("J-9 /my/update 덮어쓰지 않음", () => withAudit(async (fx) => {
  const stop = raceAfterRead(fx, "tx-expense-1", (select) => select.includes("raw_text"), { user_id: "user-bin" });
  try { await post(fx, "/my/update", myUpdate, { cookie: await fx.cookieFor("user-wifi") }); } finally { stop(); }
  eq([rowOf(fx, "tx-expense-1")?.amount, rowOf(fx, "tx-expense-1")?.user_id], [148000, "user-bin"], "J-9 /my/update 는 남의 기록이 된 행을 덮어쓰지 않는다");
  // /my 는 가계부 화면(/app)으로 넘기며 err 를 그대로 싣는다. 그 화면에 안내 문장이 보인다.
  const cookie = await fx.cookieFor("user-wifi");
  const hop = await page(fx, `/my?month=${MONTH}&household_id=${HH}&err=record_edit_conflict`, { cookie });
  const landing = hop.location ? await page(fx, hop.location, { cookie }) : hop;
  ok(paramsOf(hop.location || "/my").get("err") === "record_edit_conflict" || hop.html.includes(CONFLICT_TEXT), "J-9 /my 에서 돌아간 주소가 err=record_edit_conflict 를 지닌다");
  ok(landing.html.includes(CONFLICT_TEXT), "J-9 /my 에서 돌아간 화면에 안내 문장이 보인다");
}));

await scenario("J-9 /my/delete", () => withAudit(async (fx) => {
  const t = trace();
  let res;
  try { res = await post(fx, "/my/delete", { id: "tx-expense-1", household_id: HH, month: MONTH }, { cookie: await fx.cookieFor("user-wifi") }); } finally { t.stop(); }
  eq([outcomeOf(res), rowOf(fx, "tx-expense-1")], ["msg=deleted", null], "J-9 /my/delete 보통 삭제는 지워진다");
  eq(txCalls(t.calls).map((c) => `${c.method} ${c.path}`), ["GET transactions", `POST rpc/${IF_RPC}`], "J-9 /my/delete 는 읽기 한 번과 조건부 삭제 함수 하나(예전 감사 삭제 함수 자리)");
  fx.db.transactions.push({ id: "tx-wifi-2", household_id: HH, user_id: "user-wifi", transaction_date: "2026-07-05", type: "expense", amount: 9900, category: "식비", memo: "간식", payment_method: "현금", source: "web", raw_text: "간식 9900" });
  beforeIfDelete(fx, "tx-wifi-2", { user_id: "user-bin" });
  const raced = await post(fx, "/my/delete", { id: "tx-wifi-2", household_id: HH, month: MONTH }, { cookie: await fx.cookieFor("user-wifi") });
  fx.db.__before_rpc = null;
  eq(outcomeOf(raced), "err=record_edit_conflict", "J-9 /my/delete 는 그 사이 지출자가 바뀌면 지우지 않고 err=record_edit_conflict");
  eq(rowOf(fx, "tx-wifi-2")?.user_id, "user-bin", "J-9 /my/delete 는 남의 기록이 된 행을 지우지 않는다");
  const owner = await post(fx, "/my/delete", { id: "tx-expense-2", household_id: HH, month: MONTH });
  eq(outcomeOf(owner), "msg=deleted", "J-9 소유자 /my/delete 는 그대로 지워진다");
  eq(rpcNames(fx).at(-1), V227_DELETE, "J-9 소유자 /my/delete 는 예전처럼 감사 삭제 함수(v227)");
}));

// ═══ 4. 카카오 수정 ═════════════════════════════════════════════════════════════════════════════════
// 두 장면(카카오로 쓴 기록 = 예전 감사 RPC 경로, 웹에서 만든 기록 = 새 조건부 PATCH)은 따로 된 픽스처에서 같은 조건으로 잰다
// (같은 픽스처의 둘째 장면은 분류 표 없음 모드에서 첫 장면이 남긴 ‘표 없음’ 기억으로 요청이 하나 준다).
await scenario("J-9 카카오 수정 보통·요청 수", async () => {
  const kakaoRecorded = await kakao(async (fx) => {
    fx.db.transactions.push(kakaoRow("kx1"));
    const r = await say(fx, "수정 01번 금액 13000", WIFI_KEY);
    eq(rowOf(fx, "kx1")?.amount, 13000, "J-9 카카오로 쓴 기록 수정은 그대로 저장된다");
    ok(r.calls.some((c) => c.path === `rpc/${V227_UPDATE}`) && !patchesOf(r.calls).length, "J-9 카카오로 쓴 기록(source_user_key)은 예전처럼 감사 수정 RPC");
    return r;
  });
  await kakao(async (fx) => {
    fx.db.transactions.push(kakaoRow("kx2", webRowExtra));
    const webMade = await say(fx, "수정 01번 금액 13000", WIFI_KEY);
    ok(webMade.text.startsWith("✅ 01번 금액을 13,000원으로 변경했어요."), "J-9 웹에서 만든 내 기록도 카카오로 고쳐진다");
    eq(rowOf(fx, "kx2")?.amount, 13000, "J-9 금액이 저장된다");
    const patches = patchesOf(webMade.calls);
    eq([patches.length, patches[0]?.params.user_id, patches[0]?.params.amount], [1, "eq.user-wifi", "eq.5000"], "J-9 웹에서 만든 기록은 ‘지출자 = 나’ 를 건 조건부 PATCH 로 저장한다");
    ok(!webMade.calls.some((c) => c.path === `rpc/${V227_UPDATE}`), "J-9 그때 조건 없는 감사 수정 RPC 는 부르지 않는다");
    const audit = updateAudits(fx, "kx2");
    eq([audit.length, audit[0]?.actor_kind, audit[0]?.actor_user_id, audit[0]?.before_value?.amount, audit[0]?.after_value?.amount], [1, "kakao", "user-wifi", 5000, 13000], "J-9 감사 한 줄(행위자 카카오·구성원)이 남는다");
    eq(webMade.before, kakaoRecorded.before, "J-9 답 전 DB 요청 수는 예전(감사 RPC 경로)과 같다");
    eq(webMade.total, kakaoRecorded.total + 1, "J-9 감사 한 줄만 답 뒤에 더한다(전체 +1)");
    const auditIndex = webMade.calls.findIndex((c) => c.method === "POST" && c.path === "accountbook_transaction_audit");
    ok(auditIndex >= webMade.before, "J-9 감사 한 줄은 답이 나간 뒤에 쓴다");
    console.log(`  카카오 수정 구성원: 카카오로 쓴 기록 답 전 ${kakaoRecorded.before}·전체 ${kakaoRecorded.total}, 웹에서 만든 기록 답 전 ${webMade.before}·전체 ${webMade.total}`);
  });
});

await scenario("J-9 카카오 수정 저장 직전 지출자 바뀜", () => kakao(async (fx) => {
  fx.db.transactions.push(kakaoRow("kx1", webRowExtra));
  const eventsBefore = conflictEvents().length;
  const stop = raceAfterRead(fx, "kx1", (select) => select.includes("source_user_key"), { user_id: "user-bin" });
  let r;
  try { r = await say(fx, "수정 01번 금액 13000", WIFI_KEY); } finally { stop(); }
  ok(r.text.includes("다른 사람이 01번 기록을 먼저 바꿔서 수정하지 않았어요.") && r.text.includes("지출자가 바뀌어 이제 내 기록이 아니에요."), `J-9 카카오는 짧은 충돌 답을 보낸다: ${r.text.split("\n")[0]}`);
  ok(noUrl(r.text), "J-9 충돌 답 글에 주소가 없다");
  eq([rowOf(fx, "kx1")?.amount, rowOf(fx, "kx1")?.user_id], [5000, "user-bin"], "J-9 이제 남의 기록이 된 행을 덮어쓰지 않는다");
  eq(updateAudits(fx, "kx1").length, 0, "J-9 저장하지 않았으니 수정 감사도 없다");
  ok(!r.calls.some((c) => c.path === `rpc/${V227_UPDATE}`), "J-9 조건 없는 감사 수정 RPC 로 다시 저장하지 않는다");
  ok(conflictEvents().length === eventsBefore + 1 && conflictEvents().at(-1)?.path === "/skill", "J-9 운영 이벤트 record_edit_conflict 를 남긴다");
}));

await scenario("J-9 카카오 수정 저장 직전 같은 칸 바뀜", () => kakao(async (fx) => {
  fx.db.transactions.push(kakaoRow("kx1", webRowExtra));
  const stop = raceAfterRead(fx, "kx1", (select) => select.includes("source_user_key"), { amount: 7000 });
  let r;
  try { r = await say(fx, "수정 01번 금액 13000", WIFI_KEY); } finally { stop(); }
  ok(r.text.includes("다른 사람이 01번 기록을 먼저 바꿔서 수정하지 않았어요.") && r.text.includes("기록 보기’로 지금 기록을 확인해 주세요."), "J-9 같은 칸이 먼저 바뀌었으면 고치지 않고 지금 기록을 보라고 한다");
  ok(noUrl(r.text), "J-9 답 글에 주소가 없다");
  eq(rowOf(fx, "kx1")?.amount, 7000, "J-9 다른 사람이 먼저 저장한 값이 남는다");
}));

await scenario("J-9 카카오 수정 소유자 그대로", () => kakao(async (fx) => {
  fx.db.transactions.push(kakaoRow("kx1", { user_id: "user-bin", source_user_key: null, source: "my_web" }));
  const r = await say(fx, "수정 01번 금액 13000", BIN_KEY);
  eq(rowOf(fx, "kx1")?.amount, 13000, "J-9 소유자의 카카오 수정은 그대로 저장된다");
  ok(r.calls.some((c) => c.path === `rpc/${V227_UPDATE}`) && !patchesOf(r.calls).length, "J-9 소유자는 웹에서 만든 기록도 예전처럼 감사 수정 RPC");
  eq(r.before, r.total, "J-9 소유자 수정은 답 뒤 DB 요청이 없다(예전 그대로)");
}));

// ═══ 5. 카카오 삭제 ═════════════════════════════════════════════════════════════════════════════════
await scenario("J-9 카카오 삭제 보통·요청 수", async () => {
  const kakaoRecorded = await kakao(async (fx) => {
    fx.db.transactions.push(kakaoRow("kx1"));
    const r = await say(fx, "삭제 01번", WIFI_KEY);
    ok(r.text.startsWith("🗑️ 01번 기록을 삭제했어요."), "J-9 카카오로 쓴 기록 삭제는 그대로");
    ok(r.calls.some((c) => c.path === `rpc/${V227_DELETE}`), "J-9 카카오로 쓴 기록은 예전처럼 감사 삭제 함수(v227)");
    return r;
  });
  await kakao(async (fx) => {
    fx.db.transactions.push(kakaoRow("kx2", webRowExtra));
    const webMade = await say(fx, "삭제 01번", WIFI_KEY);
    ok(webMade.text.startsWith("🗑️ 01번 기록을 삭제했어요."), "J-9 웹에서 만든 내 기록도 카카오로 지워진다");
    eq(rowOf(fx, "kx2"), null, "J-9 기록이 지워진다");
    ok(webMade.calls.some((c) => c.path === `rpc/${IF_RPC}`) && !webMade.calls.some((c) => c.path === `rpc/${V227_DELETE}`), "J-9 웹에서 만든 기록은 조건부 삭제 함수로 지운다");
    const call = fx.db.__rpc_calls.find((item) => item.name === IF_RPC);
    eq(call?.data.p_expected?.user_id, "user-wifi", "J-9 조건부 삭제는 읽은 지출자(나)를 견준다");
    eq([webMade.before, webMade.total], [kakaoRecorded.before, kakaoRecorded.total], "J-9 카카오 삭제의 DB 요청 수는 예전과 같다(답 전·전체)");
    ok(undoItems(fx, WIFI_KEY).includes("kx2"), "J-9 지운 기록은 예전처럼 복구 목록에 있다");
    console.log(`  카카오 삭제 구성원: 카카오로 쓴 기록 답 전 ${kakaoRecorded.before}·전체 ${kakaoRecorded.total}, 웹에서 만든 기록 답 전 ${webMade.before}·전체 ${webMade.total}`);
  });
});

await scenario("J-9 카카오 삭제 직전 지출자 바뀜", () => kakao(async (fx) => {
  fx.db.transactions.push(kakaoRow("kx1", { ...webRowExtra, created_at: `${TODAY}T01:00:00.000Z` }));
  fx.db.transactions.push(kakaoRow("kx2", { ...webRowExtra, memo: "빵", raw_text: "빵 3000", amount: 3000, created_at: `${TODAY}T02:00:00.000Z` }));
  const first = await say(fx, "삭제 02번", WIFI_KEY);
  ok(first.text.startsWith("🗑️ 02번 기록을 삭제했어요.") && undoItems(fx, WIFI_KEY).join() === "kx2", "J-9 앞선 삭제(02번)가 복구 목록에 있다");
  const eventsBefore = conflictEvents().length;
  beforeIfDelete(fx, "kx1", { user_id: "user-bin" });
  const r = await say(fx, "삭제 01번", WIFI_KEY);
  fx.db.__before_rpc = null;
  ok(r.text.includes("다른 사람이 이 기록을 먼저 바꿔서 지우지 않았어요.") && r.text.includes("기록 보기’로 지금 기록을 확인해 주세요."), `J-9 카카오 삭제는 짧은 충돌 답을 보낸다: ${r.text.split("\n")[0]}`);
  ok(!r.text.includes("복구") && noUrl(r.text), "J-9 지운 것이 없으니 ‘복구’ 를 권하지 않고, 답 글에 주소가 없다");
  eq(rowOf(fx, "kx1")?.user_id, "user-bin", "J-9 이제 남의 기록이 된 행은 남는다");
  eq(undoItems(fx, WIFI_KEY), ["kx2"], "J-9 복구 목록은 앞의 값으로 되돌린다(지우지 않은 기록을 넣지 않음)");
  ok(conflictEvents().length === eventsBefore + 1 && conflictEvents().at(-1)?.path === "/skill", "J-9 운영 이벤트 record_edit_conflict 를 남긴다");
}));

await scenario("J-9 카카오 삭제 소유자 그대로", () => kakao(async (fx) => {
  fx.db.transactions.push(kakaoRow("kx1", { user_id: "user-bin", source_user_key: null, source: "my_web" }));
  const r = await say(fx, "삭제 01번", BIN_KEY);
  ok(r.text.startsWith("🗑️ 01번 기록을 삭제했어요."), "J-9 소유자의 카카오 삭제는 그대로");
  ok(r.calls.some((c) => c.path === `rpc/${V227_DELETE}`) && !r.calls.some((c) => c.path === `rpc/${IF_RPC}`), "J-9 소유자는 예전처럼 감사 삭제 함수(v227)");
}));

// ═══ 6. 문구 ═══════════════════════════════════════════════════════════════════════════════════════
await scenario("J-9 문구", async () => {
  const sources = ["admin/transactions-households.js", "domain/transactions-core.js", "kakao/edit-flow-v4.js", "kakao/edit-session-v4.js", "my/transactions.js"]
    .map((file) => readFileSync(new URL(`../src/modules/${file}`, import.meta.url), "utf8"));
  const added = sources.join("\n").split("\n").filter((line) => line.includes("V22.9.104 J-9") || line.includes("record_edit_conflict") || line.includes("먼저 바꿔"));
  ok(added.length >= 10, "J-9 고친 자리에 V22.9.104 J-9 주석이 있다");
  ok(!added.some((line) => line.includes("무료")), "J-9 새 문구·주석에 ‘무료’ 말이 없다");
  const replies = readFileSync(new URL("../src/modules/kakao/reply-texts.js", import.meta.url), "utf8");
  ok(/record_edit_conflict: RECORD_EDIT_CONFLICT_MESSAGE_V229104/.test(replies), "J-9 웹 안내 표(formatMessageText)에 record_edit_conflict 가 있다");
});

if (failures.length) {
  for (const message of failures) console.error(`실패: ${message}`);
  console.error(`V22.9.104 J-9 수정·삭제 경쟁 검사 실패 ${failures.length}건 (${checks} checks)`);
  process.exit(1);
}
console.log(`V22.9.104 J-9 수정·삭제 경쟁 검사 통과 (${checks} checks)`);
