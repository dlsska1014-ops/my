// V22.9.94 — 거래 수정·삭제·되돌리기·권한·세션 검사(외부 검토 C-4·C-5·C-9·C-11, 내부 R-3).
//
// ── 무엇을 보나 ──
//   C-4  되살리기 표(delete-restore)는 그 표를 만든 한 번의 삭제만 되돌린다. 예전에는 ‘지운 시각 30초 안의 내 삭제’를 받아서,
//        지움 → 되돌리기 → 금액 고침 → 30초 안에 다시 지움 다음에 첫 표가 두 번째 삭제를 되돌렸다. 이제 표는 그 삭제가 남긴 감사 기록 번호(a)를
//        서명해 싣고, 되살릴 때 그 기록의 가장 최근 삭제 감사가 같은 번호일 때만 되살린다. 번호가 없는 옛 표는 받지 않는다.
//   C-5  관리자 계정 통합 뒤 ‘옛 세션 자동 복구’는 V22.9.30 S-4 부터 한 번도 돌지 않는 죽은 코드였다(통합된 계정은 그 앞에서 거절된다).
//        복구를 되살리면 옛 보조 계정 쿠키가 주 계정 세션이 된다(S-4 가 막은 일). 그래서 복구는 하지 않고 죽은 코드를 지운다.
//   C-9  두 화면이 같은 기록을 고칠 때 비교(읽기)와 저장이 따로라, 읽은 뒤·저장 전에 끼어든 다른 저장을 덮어썼다(둘 다 ‘수정했습니다’).
//        이제 저장은 읽은 값을 PostgREST eq 조건으로 건 조건부 PATCH 이고, 0행이면 다시 읽어 충돌을 알린다(성공이라고 하지 않는다).
//   C-11 일괄 삭제·수정의 결과를 모르는 실패(응답 없음·5xx)에 ‘기존 기록은 유지됩니다’라고 했다. 거절(4xx)과 결과 모름을 나눈다.
//   R-3  가계부 관리자가 소유자를 내리거나 내보낼 수 있었다(소유자 둘일 때). 소유자 역할의 변경·제거·부여와 관리자 지정은 소유자만,
//        관리자는 자기보다 낮은 역할(구성원·조회·대기·차단)만 다룬다. 마지막 소유자 보호는 그대로다.
// 모두 메모리 픽스처(validation/qa-fixture.mjs)에서 실제 경로(app.fetch)를 돌린다. 네트워크·DB 없음.
import { readFileSync } from "node:fs";
import { parse } from "../tools/vendor/acorn.mjs";
import { app, BASE, ctx, fixture, intercept, failure, page, post, withClock } from "./lib-audit-v22934.mjs";
import { readDeleteRestoreTicket, signedPurposeToken } from "../src/modules/auth/identity-reauth.js";

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
const RETURN_TO = `/app?month=${MONTH}&household_id=${HH}&tab=transactions`;
const paramsOf = (location) => new URL(location || "/", BASE).searchParams;
const outcomeOf = (res) => {
  const params = paramsOf(res.location);
  if (params.get("msg")) return `msg=${params.get("msg")}`;
  if (params.get("err")) return `err=${params.get("err")}`;
  return `status=${res.status}`;
};
const rowOf = (fx, id) => fx.db.transactions.find((row) => String(row.id) === id) || null;
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });
const rpcError = (message) => json({ code: "P0001", details: null, hint: null, message }, 400);
const withAudit = (task) => fixture(task, { auditDeletes: true });

function functionSource(source, name) {
  const node = parse(source, { ecmaVersion: "latest", sourceType: "module" }).body.find((n) => n.type === "FunctionDeclaration" && n.id?.name === name);
  return node ? source.slice(node.start, node.end) : "";
}

// ═══ C-4 되살리기 표는 그 삭제 한 번만 ═══════════════════════════════════════════════════════════════
const del = (fx, id, cookie = fx.cookie) => post(fx, "/admin/delete", { id, household_id: HH, month: MONTH, return_to: RETURN_TO }, { cookie, accept: "application/json" });
const ticketFrom = (res) => {
  let data = {};
  try { data = JSON.parse(res.text); } catch (_) { data = {}; }
  return paramsOf(data.location || res.location).get("restore") || "";
};
const restore = (fx, ticket, cookie = fx.cookie) => post(fx, "/my/restore", { ticket, month: MONTH, return_to: RETURN_TO }, { cookie });
const EDIT_KEYS = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"];
// 홈 수정 폼(my/home-sections.js renderV8TxEditForm)과 같은 칸: 지금 값 + orig_* 원래 값(abEditOriginalFields).
function editForm(row, changes = {}, { orig = true } = {}) {
  const fields = {
    id: row.id, household_id: row.household_id, month: MONTH, return_to: RETURN_TO,
    type: row.type, transaction_date: row.transaction_date, amount: String(row.amount),
    memo: row.memo ?? "", category: row.category ?? "", payment_method: row.payment_method ?? "", user_id: row.user_id,
  };
  if (orig) for (const key of EDIT_KEYS) fields[`orig_${key}`] = String(row[key] ?? "");
  return { ...fields, ...changes };
}

await scenario("C-4 재현", () => withAudit(async (fx) => {
  const first = await del(fx, "tx-expense-2");
  const t1 = ticketFrom(first);
  ok(!!t1, "C-4 첫 삭제는 되살리기 표를 싣는다");
  const audits = () => (fx.db.accountbook_transaction_audit || []).filter((row) => row.action === "delete");
  const payload1 = await readDeleteRestoreTicket(fx.env, t1, "user-bin");
  eq(String(payload1?.a ?? ""), String(audits().at(-1)?.id ?? "missing"), "C-4 표는 그 삭제가 남긴 감사 기록 번호(a)를 싣는다");
  eq(outcomeOf(await restore(fx, t1)), "msg=restored", "C-4 첫 표로 되살린다");
  const back = structuredClone(rowOf(fx, "tx-expense-2"));
  eq(outcomeOf(await post(fx, "/admin/update", editForm(back, { amount: "50000" }))), "msg=updated", "C-4 되살린 기록의 금액을 고친다");
  eq(rowOf(fx, "tx-expense-2")?.amount, 50000, "C-4 고친 금액이 저장된다");
  const second = await del(fx, "tx-expense-2");
  const t2 = ticketFrom(second);
  ok(!!t2 && t2 !== t1, "C-4 두 번째 삭제는 새 표를 싣는다");
  eq(rowOf(fx, "tx-expense-2"), null, "C-4 두 번째 삭제로 기록이 없다");
  // 핵심: 30초 안에 다시 지웠어도 첫 표는 두 번째 삭제를 되돌리지 않는다.
  eq(outcomeOf(await restore(fx, t1)), "err=restore_changed", "C-4 첫 표는 두 번째 삭제를 되돌리지 않는다(restore_changed)");
  eq(rowOf(fx, "tx-expense-2"), null, "C-4 첫 표를 거절하면 기록은 그대로 없다");
  eq(outcomeOf(await restore(fx, t2)), "msg=restored", "C-4 두 번째 표는 두 번째 삭제를 되돌린다");
  eq(rowOf(fx, "tx-expense-2")?.amount, 50000, "C-4 두 번째 표가 되살린 기록은 두 번째로 지운 값(50,000원)");
}));

await scenario("C-4 옛 표·꾸민 표", () => withAudit(async (fx) => {
  const now = Math.floor(Date.now() / 1000);
  const res = await del(fx, "tx-expense-2");
  const ticket = ticketFrom(res);
  ok(!!ticket, "C-4 (옛 표) 삭제는 표를 싣는다");
  const legacy = await signedPurposeToken(fx.env, "delete-restore", { r: "tx-expense-2", h: HH, u: "user-bin", d: now }, 60);
  eq(await readDeleteRestoreTicket(fx.env, legacy, "user-bin"), null, "C-4 감사 번호가 없는 옛 표는 읽지 않는다(배포 직후 옛 표는 무효)");
  eq(outcomeOf(await restore(fx, legacy)), "err=restore_expired", "C-4 옛 표로는 되살리지 않는다");
  const forged = await signedPurposeToken(fx.env, "delete-restore", { r: "tx-expense-2", h: HH, u: "user-bin", d: now, a: "audit-delete-999" }, 60);
  eq(outcomeOf(await restore(fx, forged)), "err=restore_changed", "C-4 다른 삭제 번호의 표는 되살리지 않는다");
  eq(rowOf(fx, "tx-expense-2"), null, "C-4 거절한 표는 아무것도 넣지 않는다");
  eq(outcomeOf(await restore(fx, ticket)), "msg=restored", "C-4 그 삭제의 표는 그대로 되살린다");
  const home = await page(fx, `${RETURN_TO}&msg=deleted&restore=${encodeURIComponent(legacy)}`, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } });
  ok(!home.html.includes('action="/my/restore"'), "C-4 옛 표로는 홈에 되돌리기 단추를 그리지 않는다");
}));

await scenario("C-4 감사 번호를 못 읽으면 표 없음", () => fixture(async (fx) => {
  // 픽스처 기본값은 지울 때 감사 기록을 남기지 않는다 — 묶을 삭제 번호가 없으면 표를 싣지 않는다(삭제는 그대로 성공).
  const res = await del(fx, "tx-expense-2");
  const data = JSON.parse(res.text);
  ok(res.status === 200 && data.ok === true && data.deleted === true, "C-4 감사 기록이 없어도 삭제는 성공으로 답한다");
  eq(ticketFrom(res), "", "C-4 묶을 삭제 번호가 없으면 되살리기 표를 싣지 않는다");
  eq(rowOf(fx, "tx-expense-2"), null, "C-4 기록은 지워졌다");
}));

await scenario("C-4 감사 조회 실패", () => withAudit(async (fx) => {
  const stop = intercept(({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_transaction_audit" ? failure(503, "audit read failed") : null));
  let res;
  try { res = await del(fx, "tx-expense-2"); } finally { stop(); }
  const data = JSON.parse(res.text);
  ok(res.status === 200 && data.deleted === true, "C-4 감사 번호 조회가 실패해도 이미 한 삭제는 성공으로 답한다");
  eq(ticketFrom(res), "", "C-4 감사 번호 조회가 실패하면 표를 싣지 않는다");
  eq(rowOf(fx, "tx-expense-2"), null, "C-4 (조회 실패) 기록은 지워졌다");
}));

// ═══ C-5 통합된 보조 계정의 옛 세션 ═══════════════════════════════════════════════════════════════
await scenario("C-5", () => fixture(async (fx) => {
  // 관리자 통합 뒤의 보조 계정: kakao_user_key 가 merged:<주 계정>, 이름 끝에 (통합됨). 세션 판은 올리지 않았다(관리자 통합).
  fx.db.users.push({ id: "user-old", kakao_user_key: "merged:user-bin", nickname: "옛 계정 (통합됨)", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.accountbook_settings.push({ id: "merge-old", key: "identity_merge_audit:c5:user-old", value: JSON.stringify({ primary_user_id: "user-bin", secondary_user_id: "user-old" }), created_at: "2026-07-01T00:00:00.000Z" });
  const oldCookie = await fx.cookieFor("user-old");
  for (const path of ["/my", `/app?month=${MONTH}&household_id=${HH}`, "/my/profile"]) {
    const res = await app.fetch(new Request(`${BASE}${path}`, { headers: { cookie: oldCookie, accept: "text/html" } }), fx.env, ctx);
    const setCookie = res.headers.get("set-cookie") || "";
    eq(res.headers.get("x-accountbook-session-recovered"), null, `C-5 ${path}: 통합된 보조 계정의 옛 쿠키를 주 계정 세션으로 바꾸지 않는다`);
    ok(!/ab_user=user-bin/.test(decodeURIComponent(setCookie)), `C-5 ${path}: 주 계정 세션 쿠키를 내주지 않는다`);
  }
  const mine = await page(fx, `/app?month=${MONTH}&household_id=${HH}`);
  eq(mine.status, 200, "C-5 주 계정 자신의 세션은 그대로 열린다");
  const source = readFileSync(new URL("../src/modules/auth/user-session.js", import.meta.url), "utf8");
  // 통합 때(코디네이터): 라우터 호출까지 지웠으므로 복구 함수 자체가 없어야 한다.
  ok(!functionSource(source, "mergedUserSessionRecoveryResponse"), "C-5 돌지 않던 복구 함수 mergedUserSessionRecoveryResponse 를 지웠다");
  const router = readFileSync(new URL("../src/modules/worker/router.js", import.meta.url), "utf8");
  ok(!/mergedUserSessionRecoveryResponse/.test(router), "C-5 라우터가 복구 함수를 부르지도 들여오지도 않는다");
  ok(!/function isMergedSessionRecoveryPath/.test(source), "C-5 복구 전용 경로 판정 함수도 지웠다");
}));

// ═══ C-9 동시 수정의 잃어버린 저장 ═══════════════════════════════════════════════════════════════
// A 의 요청이 기록을 읽은 바로 뒤(비교한 뒤)·저장하기 전에 B 의 저장이 끼어드는 경우를 픽스처 읽기 응답 직후에 흉내 낸다.
function raceOnEditRead(fx, id, change) {
  let armed = true;
  return intercept(async ({ url, method, forward }) => {
    if (!armed || method !== "GET" || url.pathname !== "/rest/v1/transactions") return null;
    if (url.searchParams.get("id") !== `eq.${id}` || !String(url.searchParams.get("select") || "").includes("raw_text")) return null;
    armed = false;
    const response = await forward();
    if (typeof change === "function") change(); else Object.assign(rowOf(fx, id), change);
    return response;
  });
}
const updateAudits = (fx) => (fx.db.accountbook_transaction_audit || []).filter((row) => row.action === "update");
const patches = (fx, log) => intercept(({ url, method }) => { if (method === "PATCH" && url.pathname === "/rest/v1/transactions") log.push(Object.fromEntries(url.searchParams)); return null; });

await scenario("C-9 관리 경로 같은 칸 경합", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  eq(row.amount, 72000, "C-9 원래 금액 72,000원");
  const stop = raceOnEditRead(fx, "tx-expense-2", { amount: 9000 });
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(rowOf(fx, "tx-expense-2")?.amount, 9000, "C-9 A 가 읽은 뒤 B 가 저장한 9,000원을 A 의 5,000원이 덮어쓰지 않는다");
  eq(res.status, 409, "C-9 A 에게 충돌 화면(409)을 보인다");
  ok(res.text.includes("다른 곳에서 이 기록이 먼저 바뀌었어요") && res.text.includes("9,000원"), "C-9 충돌 화면은 지금 값(9,000원)을 알린다");
  ok(!String(res.location).includes("msg=updated"), "C-9 충돌은 ‘수정했습니다’로 끝나지 않는다");
}));

await scenario("C-9 관리 경로 다른 칸 경합", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = raceOnEditRead(fx, "tx-expense-2", { memo: "주유(B)" });
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "msg=updated", "C-9 서로 다른 칸이면 A 의 저장은 성공한다");
  eq([rowOf(fx, "tx-expense-2")?.amount, rowOf(fx, "tx-expense-2")?.memo], [5000, "주유(B)"], "C-9 A 의 금액과 B 의 메모가 둘 다 남는다");
}));

await scenario("C-9 관리 경로 보통 수정·감사", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const log = [];
  const stop = patches(fx, log);
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000", memo: "주유 고침" })); } finally { stop(); }
  eq(outcomeOf(res), "msg=updated", "C-9 경합이 없으면 그대로 수정한다");
  eq([rowOf(fx, "tx-expense-2")?.amount, rowOf(fx, "tx-expense-2")?.memo], [5000, "주유 고침"], "C-9 바꾼 두 칸이 저장된다");
  eq(log.length, 1, "C-9 저장은 조건부 PATCH 한 번");
  eq([log[0]?.id, log[0]?.household_id, log[0]?.amount, log[0]?.memo], ["eq.tx-expense-2", `eq.${HH}`, "eq.72000", "eq.주유"], "C-9 PATCH 는 기록·가계부와 바꾸는 칸의 읽은 값을 eq 조건으로 건다");
  const audit = updateAudits(fx);
  eq(audit.length, 1, "C-9 조건부 저장도 수정 감사 기록을 한 줄 남긴다");
  eq([audit[0]?.transaction_id, audit[0]?.household_id, audit[0]?.actor_user_id, audit[0]?.actor_kind], ["tx-expense-2", HH, "user-bin", "user"], "C-9 감사 기록의 기록·가계부·행위자");
  eq([audit[0]?.before_value?.amount, audit[0]?.before_value?.memo, audit[0]?.after_value?.amount, audit[0]?.after_value?.memo], [72000, "주유", 5000, "주유 고침"], "C-9 감사 기록의 바뀌기 전·뒤 값");
  eq(audit[0]?.before_value?.payment_method, "현대카드", "C-9 감사 기록의 바뀌기 전 값은 행 전체(바꾸지 않은 칸 포함)");
}));

await scenario("C-9 관리 경로 순차 옛 폼", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  rowOf(fx, "tx-expense-2").amount = 9000;
  const res = await post(fx, "/admin/update", editForm(row, { amount: "5000" }));
  eq(res.status, 409, "C-9 B 가 먼저 저장한 뒤 A 가 옛 폼을 저장하면 충돌(409)");
  eq(rowOf(fx, "tx-expense-2")?.amount, 9000, "C-9 옛 폼은 B 의 값을 덮어쓰지 않는다");
}));

await scenario("C-9 관리 경로 저장 사이 삭제", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = raceOnEditRead(fx, "tx-expense-2", () => { fx.db.transactions = fx.db.transactions.filter((item) => item.id !== "tx-expense-2"); });
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "err=record_not_found", "C-9 읽은 뒤 지워진 기록은 ‘수정했습니다’가 아니라 기록 없음");
  eq(rowOf(fx, "tx-expense-2"), null, "C-9 지워진 기록을 되살리지 않는다");
}));

await scenario("C-9 관리 경로 결과 모름", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = intercept(async ({ url, method, forward }) => {
    if (!(method === "PATCH" && url.pathname === "/rest/v1/transactions")) return null;
    await forward();
    return failure(503, "lost after commit");
  });
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "err=edit_unknown", "C-9 저장 응답을 잃으면 결과 모름(edit_unknown)으로 안내한다");
}));

await scenario("C-9 관리 경로 조건 불일치 대비", () => fixture(async (fx) => {
  // 값이 그대로인데 PATCH 가 0행이면(PostgREST eq 비교가 저장 값과 어긋나는 경우) 감사 RPC(accountbook_update_transaction_v227)로 저장한다 — 영원히 저장하지 못하는 기록을 막는다.
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const before = fx.db.__rpc_calls.length;
  const stop = intercept(({ url, method }) => (method === "PATCH" && url.pathname === "/rest/v1/transactions" ? json([]) : null));
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "msg=updated", "C-9 값이 그대로면 감사 RPC 로 저장하고 성공으로 답한다");
  eq(rowOf(fx, "tx-expense-2")?.amount, 5000, "C-9 (대비 경로) 금액이 저장된다");
  eq(fx.db.__rpc_calls.slice(before).filter((call) => call.name === "accountbook_update_transaction_v227").length, 1, "C-9 (대비 경로) 감사 RPC 를 한 번 부른다");
}));

await scenario("C-9 관리 경로 환불 잠금", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = intercept(({ url, method }) => (method === "PATCH" && url.pathname === "/rest/v1/transactions" ? rpcError("refund_link_locked_amount") : null));
  let res;
  try { res = await post(fx, "/admin/update", editForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "err=refund_link_locked_amount", "C-9 환불 연결 트리거가 막은 조건부 저장은 이유별 코드로 돌려보낸다");
  eq(rowOf(fx, "tx-expense-2")?.amount, 72000, "C-9 (환불 잠금) 금액은 그대로");
}));

const myForm = (row, changes = {}) => ({
  id: row.id, household_id: row.household_id, month: MONTH, type: row.type, transaction_date: row.transaction_date,
  amount: String(row.amount), memo: row.memo ?? "", category: row.category ?? "", payment_method: row.payment_method ?? "", ...changes,
});

await scenario("C-9 /my/update 경합", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = raceOnEditRead(fx, "tx-expense-2", { memo: "주유(B)" });
  let res;
  try { res = await post(fx, "/my/update", myForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "err=edit_conflict", "C-9 /my/update: 읽은 뒤 바뀐 기록은 저장하지 않고 충돌(edit_conflict)을 알린다");
  eq([rowOf(fx, "tx-expense-2")?.amount, rowOf(fx, "tx-expense-2")?.memo], [72000, "주유(B)"], "C-9 /my/update: B 의 메모를 덮어쓰지 않는다");
}));

await scenario("C-9 /my/update 보통·삭제·결과 모름", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  eq(outcomeOf(await post(fx, "/my/update", myForm(row, { amount: "5000" }))), "msg=updated", "C-9 /my/update: 경합이 없으면 수정한다");
  eq(rowOf(fx, "tx-expense-2")?.amount, 5000, "C-9 /my/update: 금액이 저장된다");
  eq(updateAudits(fx).length, 1, "C-9 /my/update: 수정 감사 기록을 남긴다");
  const fresh = structuredClone(rowOf(fx, "tx-expense-2"));
  const gone = raceOnEditRead(fx, "tx-expense-2", () => { fx.db.transactions = fx.db.transactions.filter((item) => item.id !== "tx-expense-2"); });
  let res;
  try { res = await post(fx, "/my/update", myForm(fresh, { amount: "6000" })); } finally { gone(); }
  eq(outcomeOf(res), "err=record_not_found", "C-9 /my/update: 읽은 뒤 지워진 기록은 기록 없음");
}));

await scenario("C-9 /my/update 결과 모름", () => fixture(async (fx) => {
  const row = structuredClone(rowOf(fx, "tx-expense-2"));
  const stop = intercept(async ({ url, method, forward }) => {
    if (!(method === "PATCH" && url.pathname === "/rest/v1/transactions")) return null;
    await forward();
    return failure(503, "lost after commit");
  });
  let res;
  try { res = await post(fx, "/my/update", myForm(row, { amount: "5000" })); } finally { stop(); }
  eq(outcomeOf(res), "err=db_write_unknown", "C-9 /my/update: 저장 응답을 잃으면 결과 모름(db_write_unknown)");
}));

await scenario("C-9 충돌 안내 문구", () => fixture(async (fx) => {
  const home = await page(fx, `/app?month=${MONTH}&household_id=${HH}&err=edit_conflict`);
  ok(home.html.includes("다른 곳에서 이 기록이 먼저 바뀌어 저장하지 않았습니다"), "C-9 홈은 edit_conflict 를 한국어 충돌 안내로 보인다");
}));

// ═══ C-11 일괄 삭제·수정의 결과 모름 ═══════════════════════════════════════════════════════════════
const txId = (n) => `0e994000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const errorBox = (html) => (String(html || "").match(/<div class="error">([^<]*)<\/div>/) || [, null])[1];
let adminSeq = 0;
async function adminLogin(fx) {
  adminSeq += 1;
  fx.env.ADMIN_SESSION_SECRET = "qa-admin-session-v22994";
  fx.env.ADMIN_PASSWORD = "qa-admin-pass-v22994";
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${30 + adminSeq}` },
    body: new URLSearchParams({ password: fx.env.ADMIN_PASSWORD, return_to: "/?legacy=1" }).toString(),
  }), fx.env, ctx);
  const cookie = ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
  if (!cookie) throw new Error("관리자 로그인 쿠키를 받지 못했다");
  return cookie;
}
// 일괄 처리 RPC(accountbook_bulk_transactions_v227)는 픽스처에 없어 흉내 낸다. mode: ok(적용·성공) / lost(적용 뒤 응답 잃음 503)
// network(응답 없음) / reject(거절 400, 바꾸지 않음).
async function bulkCase(mode, form, task) {
  return withClock("2026-07-15", () => fixture(async (fx) => {
    for (const n of [1, 2, 3]) fx.db.transactions.push({ id: txId(n), household_id: HH, user_id: "user-bin", transaction_date: "2026-07-10", type: "expense", amount: 1000 * n, category: "식비", memo: `일괄 ${n}`, payment_method: "카드", source: "web", created_at: `2026-07-10T0${n}:00:00.000Z` });
    const admin = await adminLogin(fx);
    const stop = intercept(async ({ url, init }) => {
      if (url.pathname !== "/rest/v1/rpc/accountbook_bulk_transactions_v227") return null;
      const body = JSON.parse(String(init.body || "{}"));
      const ids = (body.p_transaction_ids || []).map(String);
      if (mode === "reject") return rpcError("bulk_household_scope_mismatch");
      if (mode === "network") throw new TypeError("fetch failed");
      if (body.p_delete) fx.db.transactions = fx.db.transactions.filter((row) => !ids.includes(String(row.id)));
      else for (const row of fx.db.transactions.filter((item) => ids.includes(String(item.id)))) Object.assign(row, body.p_patch || {});
      if (mode === "lost") return failure(503, "response lost after commit");
      return json({ processed: ids.length });
    });
    try {
      const res = await post(fx, "/admin/bulk", new URLSearchParams([["ids", txId(1)], ["ids", txId(2)], ["household_id", HH], ["month", MONTH], ...form]), { cookie: admin });
      const shown = res.location ? errorBox((await page(fx, res.location, { cookie: admin })).html) : null;
      await task({ fx, res, shown, err: paramsOf(res.location).get("err") || "", msg: paramsOf(res.location).get("msg") || "" });
    } finally { stop(); }
  }));
}
const left = (fx) => fx.db.transactions.filter((row) => [txId(1), txId(2)].includes(row.id)).length;
const DELETE_UNKNOWN = "삭제 결과를 확인하지 못했습니다. 같은 요청을 다시 보내지 말고, 목록을 새로 고쳐 선택한 기록이 지워졌는지 먼저 확인해 주세요.";
const DELETE_FAILED = "선택한 거래내역을 삭제하지 못했습니다. 기존 기록은 유지됩니다.";
const UPDATE_UNKNOWN = "일괄 수정 결과를 확인하지 못했습니다. 같은 요청을 다시 보내지 말고, 목록을 새로 고쳐 바뀌었는지 먼저 확인해 주세요.";
const UPDATE_FAILED = "선택한 거래내역을 수정하지 못했습니다. 기존 기록은 유지됩니다.";

await scenario("C-11 삭제 응답 잃음", () => bulkCase("lost", [["bulk_delete", "1"]], async ({ fx, err, shown }) => {
  eq(left(fx), 0, "C-11 (응답 잃음) DB 에서는 실제로 지워졌다");
  eq(err, DELETE_UNKNOWN, "C-11 지운 뒤 응답을 잃으면 ‘결과를 확인하지 못했다’고 알린다");
  ok(!String(err).includes("유지됩니다"), "C-11 결과를 모르는데 ‘기존 기록은 유지됩니다’라고 하지 않는다");
  eq(shown, DELETE_UNKNOWN, "C-11 옛 관리자 화면 오류 칸에 그 문장이 그대로 보인다");
}));
await scenario("C-11 삭제 응답 없음", () => bulkCase("network", [["bulk_delete", "1"]], async ({ err }) => {
  eq(err, DELETE_UNKNOWN, "C-11 응답이 없으면(연결 끊김·시한) 결과 모름으로 알린다");
}));
await scenario("C-11 삭제 거절", () => bulkCase("reject", [["bulk_delete", "1"]], async ({ fx, err, shown }) => {
  eq(left(fx), 2, "C-11 (거절) 기록은 그대로");
  eq(err, DELETE_FAILED, "C-11 저장소가 거절(4xx)한 삭제는 ‘삭제하지 못했습니다. 기존 기록은 유지됩니다’");
  eq(shown, DELETE_FAILED, "C-11 (거절) 화면에도 그 문장");
}));
await scenario("C-11 삭제 성공", () => bulkCase("ok", [["bulk_delete", "1"]], async ({ fx, msg }) => {
  eq([msg, left(fx)], ["bulk_deleted", 0], "C-11 성공한 일괄 삭제는 그대로 bulk_deleted");
}));
await scenario("C-11 수정 응답 잃음", () => bulkCase("lost", [["bulk_payment_method", "현금"]], async ({ fx, err }) => {
  ok(fx.db.transactions.filter((row) => [txId(1), txId(2)].includes(row.id)).every((row) => row.payment_method === "현금"), "C-11 (수정 응답 잃음) DB 에서는 실제로 바뀌었다");
  eq(err, UPDATE_UNKNOWN, "C-11 일괄 수정도 응답을 잃으면 결과 모름으로 알린다");
}));
await scenario("C-11 수정 거절", () => bulkCase("reject", [["bulk_payment_method", "현금"]], async ({ err }) => {
  eq(err, UPDATE_FAILED, "C-11 거절된 일괄 수정은 예전 문장(기존 기록은 유지됩니다)");
}));

// ═══ R-3 소유자·관리자 권한 행렬 ═══════════════════════════════════════════════════════════════
const MEMBERS_BACK = `/my/members?household_id=${HH}&month=${MONTH}`;
async function membersCase(task) {
  return fixture(async (fx) => {
    const at = "2026-07-01T00:00:00.000Z";
    const people = [["user-own2", "owner", "둘째 소유자"], ["user-adm", "admin", "관리자"], ["user-adm2", "admin", "관리자둘"], ["user-mem", "member", "구성원"], ["user-view", "viewer", "조회"], ["user-pend", "pending", "대기"]];
    for (const [id, role, nickname] of people) {
      fx.db.users.push({ id, kakao_user_key: `kakao_login:${id}`, nickname, created_at: at });
      fx.db.household_members.push({ household_id: HH, user_id: id, role, created_at: at });
    }
    const cookies = { owner: fx.cookie, admin: await fx.cookieFor("user-adm"), member: await fx.cookieFor("user-mem") };
    return task(fx, cookies);
  });
}
const roleOf = (fx, userId) => fx.db.household_members.find((m) => m.household_id === HH && m.user_id === userId)?.role || "";
const setRole = (fx, cookie, userId, role) => post(fx, "/admin/member/update", { household_id: HH, user_id: userId, role, return_to: MEMBERS_BACK }, { cookie });
const removeMember = (fx, cookie, userId) => post(fx, "/admin/member/remove", { household_id: HH, user_id: userId, return_to: MEMBERS_BACK }, { cookie });
const DENIED = "err=member_manage_not_allowed";

// 관리자(가계부 역할 admin)는 자기보다 낮은 역할만.
for (const [label, action, target, role, expectedRole] of [
  ["소유자를 구성원으로 내리기(소유자 둘)", "update", "user-own2", "member", "owner"],
  ["소유자를 관리자로 내리기", "update", "user-own2", "admin", "owner"],
  ["소유자 내보내기(소유자 둘)", "remove", "user-own2", null, "owner"],
  ["구성원을 소유자로 올리기", "update", "user-mem", "owner", "member"],
  ["구성원을 관리자로 올리기", "update", "user-mem", "admin", "member"],
  ["다른 관리자를 구성원으로 내리기", "update", "user-adm2", "member", "admin"],
  ["다른 관리자 내보내기", "remove", "user-adm2", null, "admin"],
  ["자기 자신(관리자)을 구성원으로 내리기", "update", "user-adm", "member", "admin"],
]) {
  await scenario(`R-3 관리자 ${label}`, () => membersCase(async (fx, cookies) => {
    const res = action === "remove" ? await removeMember(fx, cookies.admin, target) : await setRole(fx, cookies.admin, target, role);
    eq(outcomeOf(res), DENIED, `R-3 관리자는 ${label}를 할 수 없다`);
    eq(roleOf(fx, target), expectedRole, `R-3 (${label}) 대상 역할은 그대로`);
    ok(new URL(res.location || "/", BASE).pathname === "/my/members", `R-3 (${label}) 참여자 화면으로 돌아간다`);
  }));
}
for (const [label, action, target, role, expectedRole, expected] of [
  ["구성원을 조회 전용으로", "update", "user-mem", "viewer", "viewer", "msg=member_updated"],
  ["조회 전용을 구성원으로", "update", "user-view", "member", "member", "msg=member_updated"],
  ["승인 대기를 구성원으로(승인)", "update", "user-pend", "member", "member", "msg=member_updated"],
  ["구성원을 차단", "update", "user-mem", "blocked", "blocked", "msg=member_updated"],
  ["구성원 내보내기", "remove", "user-mem", null, "", "msg=member_removed"],
]) {
  await scenario(`R-3 관리자 ${label}`, () => membersCase(async (fx, cookies) => {
    const res = action === "remove" ? await removeMember(fx, cookies.admin, target) : await setRole(fx, cookies.admin, target, role);
    eq(outcomeOf(res), expected, `R-3 관리자는 ${label} 할 수 있다`);
    eq(roleOf(fx, target), expectedRole, `R-3 (${label}) 역할이 바뀐다`);
  }));
}
// 소유자는 모두(둘째 소유자 금지·마지막 소유자 보호는 그대로).
for (const [label, action, target, role, expectedRole, expected] of [
  ["다른 소유자를 구성원으로(소유자 둘)", "update", "user-own2", "member", "member", "msg=member_updated"],
  ["다른 소유자 내보내기(소유자 둘)", "remove", "user-own2", null, "", "msg=member_removed"],
  ["구성원을 관리자로", "update", "user-mem", "admin", "admin", "msg=member_updated"],
  ["관리자를 구성원으로", "update", "user-adm", "member", "member", "msg=member_updated"],
  ["관리자 내보내기", "remove", "user-adm", null, "", "msg=member_removed"],
]) {
  await scenario(`R-3 소유자 ${label}`, () => membersCase(async (fx, cookies) => {
    const res = action === "remove" ? await removeMember(fx, cookies.owner, target) : await setRole(fx, cookies.owner, target, role);
    eq(outcomeOf(res), expected, `R-3 소유자는 ${label} 할 수 있다`);
    eq(roleOf(fx, target), expectedRole, `R-3 (소유자 ${label}) 역할이 바뀐다`);
  }));
}
await scenario("R-3 소유자 보호 규칙", () => membersCase(async (fx, cookies) => {
  const second = await setRole(fx, cookies.owner, "user-mem", "owner");
  ok(String(paramsOf(second.location).get("err") || "").includes("이미 소유자가 있습니다"), "R-3 소유자가 있으면 둘째 소유자를 만들지 않는다(그대로)");
  eq(roleOf(fx, "user-mem"), "member", "R-3 (둘째 소유자 금지) 역할 그대로");
  eq(outcomeOf(await removeMember(fx, cookies.owner, "user-own2")), "msg=member_removed", "R-3 소유자 둘 중 하나는 소유자가 내보낼 수 있다");
  const last = await setRole(fx, cookies.owner, "user-bin", "member");
  ok(String(paramsOf(last.location).get("err") || "").includes("유일한 소유자는 다른 역할로 변경할 수 없습니다"), "R-3 마지막 소유자는 역할을 바꾸지 못한다(그대로)");
  const lastRemove = await removeMember(fx, cookies.owner, "user-bin");
  ok(String(paramsOf(lastRemove.location).get("err") || "").includes("유일한 소유자는 삭제할 수 없습니다"), "R-3 마지막 소유자는 내보내지 못한다(그대로)");
  eq(roleOf(fx, "user-bin"), "owner", "R-3 마지막 소유자는 소유자로 남는다");
}));
await scenario("R-3 운영 관리자 세션", () => membersCase(async (fx) => {
  const ops = await adminLogin(fx);
  eq(outcomeOf(await setRole(fx, ops, "user-own2", "member")), "msg=member_updated", "R-3 운영 관리자 세션은 소유자를 내릴 수 있다(소유자 둘)");
  const last = await removeMember(fx, ops, "user-bin");
  ok(String(paramsOf(last.location).get("err") || "").includes("유일한 소유자는 삭제할 수 없습니다"), "R-3 운영 관리자 세션도 마지막 소유자는 내보내지 못한다");
}));
await scenario("R-3 구성원·안내 문구", () => membersCase(async (fx, cookies) => {
  eq(outcomeOf(await setRole(fx, cookies.member, "user-view", "member")), DENIED, "R-3 구성원은 역할을 바꾸지 못한다(그대로)");
  eq(outcomeOf(await removeMember(fx, cookies.member, "user-view")), DENIED, "R-3 구성원은 내보내지 못한다(그대로)");
  const landing = await page(fx, `${MEMBERS_BACK}&err=member_manage_not_allowed`, { cookie: cookies.admin });
  ok(landing.html.includes("참여자를 바꿀 권한이 없습니다"), "R-3 거절 안내는 참여자 화면에 한국어 문장으로 보인다");
}));

if (failures.length) {
  for (const message of failures) console.error(`실패: ${message}`);
  console.error(`V22.9.94 거래·권한 검사 실패 ${failures.length}건 (${checks} checks)`);
  process.exit(1);
}
console.log(`V22.9.94 거래·권한 검사 통과 (${checks} checks)`);
