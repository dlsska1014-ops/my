// V22.9.88 — Codex 지적 6건(2026-10-29, 문서 docs/codex/FOLLOWUP_FINDINGS_V22_9_88.md 의 Y-1~Y-6)의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// V22.9.87 운영 반영 뒤 Codex 검토가 여섯 가지를 짚었다. 카카오 저장 전 실패가 남긴 표식이 다음 문장을 계속 막음(Y-1), 실행 취소가 그사이
// 다른 사람이 고친 기록도 지움(Y-2), 비밀번호를 바꿨는데 ‘저장하지 못했습니다’라고 함(Y-3), 여러 건 입력의 중복 안내가 다른 거래의 문장을
// 보임(Y-4), 관리자 API 로 메모·결제수단을 지울 수 없음(Y-5), 리포트 다시 만들기 대기의 동시 갱신 틈(Y-6, V79:T-7). 기존 검사는 모두
// 그 갈래를 지나지 않았다(Y-1 은 오히려 표식이 남는 것을 확인했다).
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처(DB·서버 없음)에서 실제 경로(/skill·/admin/transactions·/my/undo·/my/backup-login·/api/transactions·예약 실행)를 돌리고,
// 실패나 끼어든 쓰기를 intercept·__before_rpc 로 그 자리에 넣는다. 각 장면은 예전 코드에서 틀린 결과가 나오는 순서다(메시지의 ‘예전:’).
// 사용: node validation/validate-codex-findings-v22988.mjs
import { readFileSync } from "node:fs";
import { makeCredentialProof, runRecurringAutoApply } from "../src/index.js";
import { refreshRecurringReports } from "../src/modules/cron/recurring-auto-apply.js";
import { app, BASE, counter, failure, fixture, intercept, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.88 Codex 지적 6건(카카오 저장 표식·실행 취소 조건부 삭제·비밀번호 변경 안내·중복 안내 문장·관리자 API 빈 값·예약 상태 조건부 쓰기) 검사");
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const opsEvents = () => globalThis.__AB_OPS_EVENTS || [];
const eventsSince = (mark) => { const list = opsEvents(); const index = mark ? list.indexOf(mark) : -1; return list.slice(index + 1); };

// ── Y-1·Y-4: 카카오 저장 ─────────────────────────────────────────────────────────────
const textOf = (body) => (body.template?.outputs || []).map((o) => o.simpleText?.text || o.textCard?.description || "").join("\n");
async function say(fx, text, { user = "kakao_login:2265" } = {}) {
  const jobs = [];
  const payload = { bot: { id: "synthetic-bot" }, userRequest: { utterance: text, user: { id: user, type: "botUserKey", properties: { botUserKey: user } } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": fx.env.KAKAO_SKILL_SECRET || "" }, body: JSON.stringify(payload) }), fx.env, { waitUntil: (job) => jobs.push(job) });
  const body = await response.json();
  await Promise.allSettled(jobs);
  return { body, text: textOf(body) };
}
async function kakao(task) {
  await fixture(async (fx) => {
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
    globalThis.__AB_KAKAO_INFLIGHT?.clear();
    fx.env.KAKAO_SKILL_SECRET = "synthetic-v22988-secret";
    fx.db.transactions = [];
    putSetting(fx, "kakao_selected_household_v2251:user-bin", "house-home");
    const realNow = Date.now;
    let shift = 0;
    // 같은 문장을 8초 안에 다시 보내면 막는 장치를 피하려고 장면 안의 시계를 앞으로 민다. 표식의 at 도 같은 시계다.
    const later = (ms) => { shift += ms; Date.now = () => realNow() + shift; };
    try { await task(fx, later); } finally { Date.now = realNow; }
  });
}
const markers = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).includes(":pending_write:"));
const dedupeScan = ({ url, method }) => method === "GET" && url.pathname.endsWith("/transactions") && String(url.searchParams.get("amount") || "").startsWith("in.") && String(url.searchParams.get("created_at") || "").startsWith("gte.");
const transactionPost = ({ url, method }) => method === "POST" && url.pathname.endsWith("/transactions");

// Y-1-A 중복 조회가 실패하면(거래 전송 전) 이 요청이 쓴 표식을 지운다 → 다음의 다른 문장이 저장된다.
await kakao(async (fx, later) => {
  const undo = intercept((request) => (dedupeScan(request) ? failure(503, "synthetic dedupe outage") : undefined));
  let first;
  try { first = await say(fx, "중복조회실패 7601원 현금"); } finally { undo(); }
  t.eq(fx.db.transactions.length, 0, "Y-1-A 중복 조회가 실패하면 거래를 보내지 않는다");
  t.eq(markers(fx).length, 0, "Y-1-A 거래를 보내기 전에 실패하면 이 요청이 쓴 저장 표식을 지운다 (예전: 표식이 남아 다음의 다른 문장을 ‘저장 확인 지연’으로 막았다)");
  t.ok(first.text.includes("저장하지 못했어요") && !first.text.includes("다시 보내지 말고"), "Y-1-A 보내지 않았으니 저장 실패로 안내한다(다시 보내도 된다)");
  later(9000);
  const next = await say(fx, "다른문장 8601원 현금");
  t.ok(fx.db.transactions.length === 1 && next.text.includes("저장했어요"), `Y-1-A 그 뒤 다른 문장은 저장된다 (${next.text.slice(0, 60)})`);
  t.eq(markers(fx).length, 0, "Y-1-A 저장을 확인한 뒤 표식은 없다");
});

// Y-1-B 중복이 섞인 입력에서 최종 표식 저장이 실패해도(거래 전송 전) 표식을 지운다.
await kakao(async (fx, later) => {
  await say(fx, "정리원본 7602원 현금");
  t.eq(fx.db.transactions.length, 1, "Y-1-B 원본 기록이 저장된다");
  later(9000);
  const undo = intercept(({ url, method }) => (method === "PATCH" && url.pathname.endsWith("/accountbook_settings") && String(url.searchParams.get("key") || "").includes(":pending_write:") ? failure(503, "synthetic final marker outage") : undefined));
  let mixed;
  try { mixed = await say(fx, "정리원본 7602원 현금 / 정리신규 8602원 현금"); } finally { undo(); }
  t.eq(fx.db.transactions.length, 1, "Y-1-B 최종 표식을 쓰지 못하면 새 거래를 보내지 않는다");
  t.eq(markers(fx).length, 0, "Y-1-B 처음 표식과 최종 표식 어느 것도 남기지 않는다 (예전: 처음 표식이 남았다)");
  t.ok(mixed.text.includes("저장하지 못했어요"), "Y-1-B 저장 실패로 안내한다");
  later(9000);
  await say(fx, "정리다른 8702원 현금");
  t.eq(fx.db.transactions.length, 2, "Y-1-B 그 뒤 다른 문장은 저장된다");
});

// Y-1-C 같은 문장을 다시 보낸 경우(앞 시도의 전송 결과를 모름)는 전송 전에 실패해도 표식을 남겨 같은 번호로 잇는다.
await kakao(async (fx, later) => {
  let undo = intercept((request) => { if (transactionPost(request)) throw new TypeError("synthetic uncertain POST"); });
  try { await say(fx, "재전송원본 7603원 현금"); } finally { undo(); }
  const firstIds = JSON.parse(markers(fx)[0]?.value || "null")?.ids || [];
  t.ok(fx.db.transactions.length === 0 && firstIds.length === 1, "Y-1-C 전송 결과를 모르면 표식(번호)을 남긴다(예전과 같다)");
  later(9000);
  undo = intercept((request) => (dedupeScan(request) ? failure(503, "synthetic dedupe outage") : undefined));
  try { await say(fx, "재전송원본 7603원 현금"); } finally { undo(); }
  t.deepEq(JSON.parse(markers(fx)[0]?.value || "null")?.ids, firstIds, "Y-1-C 같은 문장의 재시도가 전송 전에 실패해도 앞 시도의 번호가 든 표식은 지우지 않는다");
  later(9000);
  await say(fx, "재전송원본 7603원 현금");
  t.ok(fx.db.transactions.length === 1 && fx.db.transactions[0].id === firstIds[0] && markers(fx).length === 0, "Y-1-C 다시 보내면 처음 번호로 한 건만 저장하고 표식을 지운다");
});

// Y-1-D 결과를 모르는 앞 기록 표식은 10분까지만 다른 문장을 막고, 막을 때는 이번 내용을 다시 보내라고 안내한다.
await kakao(async (fx, later) => {
  const undo = intercept((request) => { if (transactionPost(request)) throw new TypeError("synthetic lost POST"); });
  try { await say(fx, "지연원본 7604원 현금"); } finally { undo(); }
  t.ok(markers(fx).length === 1 && fx.db.transactions.length === 0, "Y-1-D 앞 기록은 결과를 모른 채 표식만 남았다");
  later(9000);
  const blocked = await say(fx, "새문장 8604원 현금");
  t.eq(fx.db.transactions.length, 0, "Y-1-D 기한 안에서는 다른 문장을 저장하지 않는다(앞 기록이 늦게 들어올 수 있다)");
  t.ok(blocked.text.includes("앞서 보낸 기록의 저장 결과를 아직 확인하지 못해 이번 내용은 저장하지 않았어요") && blocked.text.includes("잠시 뒤(길어야 10분) 다시 보내 주세요") && !blocked.text.includes("다시 보내지 말고"),
    `Y-1-D 막힌 문장에는 ‘이번 내용은 저장하지 않았으니 잠시 뒤 다시’라고 안내한다 (예전: ‘같은 내용을 다시 보내지 말고 기다려 주세요’) — ${blocked.text.slice(0, 80)}`);
  later(10 * 60 * 1000);
  const mark = opsEvents().at(-1);
  const after = await say(fx, "새문장 9604원 현금");
  t.ok(fx.db.transactions.length === 1 && after.text.includes("저장했어요"), "Y-1-D 10분이 지나면 늦게 들어올 전송은 없다고 보고 다른 문장을 저장한다 (예전: 같은 문장을 다시 보내기 전까지 계속 막혔다)");
  t.ok(eventsSince(mark).some((event) => event.kind === "kakao_pending_write_expired" && /found:0\/1/.test(String(event.detail || ""))), "Y-1-D 기한이 지난 표식을 버리면 운영 이벤트 kakao_pending_write_expired 를 남긴다(행 수만, 내용 없음)");
  t.eq(markers(fx).length, 0, "Y-1-D 새 저장을 확인한 뒤 표식은 없다");
});

// Y-1-E 별도 구매도 같은 기한을 쓴다.
await kakao(async (fx, later) => {
  await say(fx, "커피별도 4505원 현금");
  later(9000);
  const undo = intercept((request) => { if (transactionPost(request)) throw new TypeError("synthetic lost POST"); });
  try { await say(fx, "지연다른 7605원 현금"); } finally { undo(); }
  const separate = () => JSON.parse(fx.db.accountbook_settings.find((row) => String(row.key).includes(":separate:"))?.value || "null");
  later(9000);
  await say(fx, "별도 구매 추가 커피별도 4505원 현금");
  t.eq(separate(), null, "Y-1-E 기한 안에서는 결과를 모르는 앞 기록이 있으면 별도 구매 후보를 만들지 않는다(예전과 같다)");
  later(10 * 60 * 1000);
  await say(fx, "별도 구매 추가 커피별도 4505원 현금");
  t.eq(separate()?.state, "candidate", "Y-1-E 10분이 지난 표식은 버리고 별도 구매 후보를 만든다 (예전: 계속 막혔다)");
});

// Y-4 여러 건 입력: 결과는 입력 순서이고, 중복 안내는 그 중복 거래의 입력 문장이다.
await kakao(async (fx, later) => {
  await say(fx, "중복원본 7701원 현금");
  later(9000);
  const reply = await say(fx, "새점심 8701원 현금 / 중복원본 7701원 현금");
  t.ok(reply.text.includes("새로 저장 1건 · 중복 저장 안 함 1건"), "Y-4 둘째 줄만 중복이다");
  t.ok(reply.text.includes("별도 구매 추가 중복원본 7701원 현금") && !reply.text.includes("별도 구매 추가 새점심"),
    `Y-4 중복 안내는 중복 거래(둘째 줄)의 문장이다 (예전: 결과가 중복부터라 첫째 줄 ‘새점심’을 보였다) — ${reply.text.slice(0, 160)}`);
  const lines = reply.text.split("\n").filter((line) => line.includes(" · 지출 · "));
  t.ok(lines.length === 2 && lines[0].includes("새점심") && lines[1].includes("중복원본"), "Y-4 저장 결과 목록은 입력 순서다(예전: 중복이 먼저)");
});
await kakao(async (fx, later) => {
  await say(fx, "수입중복 31000원 용돈");
  later(9000);
  const reply = await say(fx, "점심새로 8702원 현금 / 수입중복 31000원 용돈");
  t.ok(/별도 기록 추가 수입중복 31000원 용돈/.test(reply.text), `Y-4 수입 중복은 ‘별도 기록 추가’와 그 문장이다 (${reply.text.slice(0, 160)})`);
});

// ── Y-2 실행 취소: DB 가 잠근 행을 다시 견준다 ─────────────────────────────────────────────
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const SAVE = { household_id: HH, month: "2026-07", transaction_date: "2026-07-15", type: "expense", amount: "7000", memo: "점심", category: "식비", payment_method: "현금", user_id: "user-bin", raw_text: "", return_to: HOME };
const params = (location) => new URL(location || "/", BASE).searchParams;
const save = async (fx, extra = {}) => {
  const response = await post(fx, "/admin/transactions", { ...SAVE, request_id: crypto.randomUUID(), ...extra });
  return { rid: params(response.location).get("saved_rid") || "", ticket: params(response.location).get("undo") || "" };
};
const undoPost = (fx, ticket) => post(fx, "/my/undo", { ticket, month: "2026-07", return_to: HOME });
const rowOf = (fx, id) => fx.db.transactions.find((row) => String(row.id) === String(id));
const UNDO_RPC = "accountbook_delete_transaction_if_v22988";
const FIELDS = ["type", "amount", "transaction_date", "category", "memo", "payment_method", "user_id"];

await withClock("2026-07-15", () => fixture(async (fx) => {
  const a = await save(fx);
  t.ok(a.rid && a.ticket, "Y-2 빠른 입력 저장이 실행 취소 표를 준다");
  const before = { ...rowOf(fx, a.rid) };
  const done = await undoPost(fx, a.ticket);
  t.ok(done.status === 303 && params(done.location).get("msg") === "undone" && !rowOf(fx, a.rid), "Y-2-A 바뀌지 않은 기록은 실행 취소로 지운다");
  const call = fx.db.__rpc_calls.filter((item) => item.name === UNDO_RPC).at(-1);
  t.ok(call && call.data.p_transaction_id === a.rid && call.data.p_household_id === HH && call.data.p_actor_user_id === "user-bin" && call.data.p_actor_kind === "user", "Y-2-A 지우기는 조건부 삭제 함수(같은 감사 기록: 누가·user)를 거친다");
  t.deepEq(Object.keys(call?.data?.p_expected || {}), FIELDS, "Y-2-A 견줄 값은 실행 취소 표 지문과 같은 일곱 칸이다");
  t.ok(!!call && FIELDS.every((key) => String(call.data.p_expected?.[key] ?? "") === String(before[key] ?? "")), "Y-2-A 견줄 값은 앱이 방금 읽은 기록의 값이다");
  t.ok(!fx.db.__rpc_calls.some((item) => item.name === "accountbook_delete_transaction_v227" && item.data.p_transaction_id === a.rid), "Y-2-A 함수가 있으면 예전 삭제 함수(v227)는 부르지 않는다");

  // 앱이 읽어 견준 뒤, DB 함수가 행을 잠그기 전에 다른 사람이 메모를 고친다. 예전 삭제 함수(v227) 앞에도 같은 수정을 넣어 예전 코드의
  // 틈(앱에서 견주고 따로 지움)을 그대로 재현한다.
  const b = await save(fx, { memo: "저녁" });
  fx.db.__before_rpc = (name, data) => { if ([UNDO_RPC, "accountbook_delete_transaction_v227"].includes(name) && data.p_transaction_id === b.rid) rowOf(fx, b.rid).memo = "다른 사람이 고친 메모"; };
  const raced = await undoPost(fx, b.ticket);
  fx.db.__before_rpc = null;
  t.eq(params(raced.location).get("err"), "undo_changed", "Y-2-B 견준 뒤 지우기 전에 바뀐 기록은 지우지 않고 undo_changed 로 돌아간다 (예전: 고친 기록을 지웠다)");
  t.eq(rowOf(fx, b.rid)?.memo, "다른 사람이 고친 메모", "Y-2-B 고친 기록은 그대로 남는다");

  // SQL 적용 전(함수 없음, PGRST202): 예전처럼 v227 로 지운다.
  const c = await save(fx, { memo: "간식" });
  fx.db.__missing_rpcs = [UNDO_RPC];
  const fallback = await undoPost(fx, c.ticket);
  fx.db.__missing_rpcs = [];
  t.ok(params(fallback.location).get("msg") === "undone" && !rowOf(fx, c.rid), "Y-2-C 함수가 아직 없으면(SQL 적용 전) 예전처럼 지운다(V22.9.87 과 같은 동작)");
  t.ok(fx.db.__rpc_calls.some((item) => item.name === "accountbook_delete_transaction_v227" && item.data.p_transaction_id === c.rid), "Y-2-C 그때는 예전 감사 삭제 함수(v227)를 부른다");

  // 함수가 다른 오류를 내면 지웠다고 하지 않는다.
  const d = await save(fx, { memo: "야식" });
  const undo = intercept(({ url, method }) => (method === "POST" && url.pathname.endsWith(`/rpc/${UNDO_RPC}`) ? failure(400, "synthetic definite") : undefined));
  let failed;
  try { failed = await undoPost(fx, d.ticket); } finally { undo(); }
  t.ok(params(failed.location).get("err") === "record_delete_failed" && rowOf(fx, d.rid), "Y-2-D 함수가 거절하면 지우지 않고 실패로 안내한다(예전 삭제로 넘어가지 않는다)");
}));

{
  const apply = read("migrations/V22_9_88_UNDO_DELETE_IF_UNCHANGED_APPLY_REVIEW_ONLY.sql");
  const rollback = read("migrations/V22_9_88_UNDO_DELETE_IF_UNCHANGED_ROLLBACK_REVIEW_ONLY.sql");
  const guard = apply.indexOf("RAISE EXCEPTION 'v22988_review_only_undo_delete_approval_required'");
  t.ok(apply.startsWith("-- 실행 금지(DO NOT RUN)") && guard > 0 && guard < apply.indexOf("CREATE OR REPLACE FUNCTION"), "Y-2 적용 SQL 은 검토 전용이다(맨 위 차단 줄이 함수보다 먼저)");
  const body = apply.slice(apply.indexOf("CREATE OR REPLACE FUNCTION public.accountbook_delete_transaction_if_v22988"), apply.indexOf("$undo$;"));
  t.ok(/SECURITY INVOKER/.test(body) && !/SECURITY DEFINER/.test(body) && /FOR UPDATE;/.test(body), "Y-2 함수는 SECURITY INVOKER 이고 행을 잠근다(FOR UPDATE)");
  t.ok(FIELDS.every((key) => body.includes(`'${key}'`)), "Y-2 함수가 견주는 칸은 앱의 일곱 칸과 같다");
  t.ok(body.indexOf("RETURN jsonb_build_object('deleted', false, 'changed', true") < body.indexOf("INSERT INTO public.accountbook_transaction_audit") && body.indexOf("INSERT INTO public.accountbook_transaction_audit") < body.indexOf("DELETE FROM public.transactions"),
    "Y-2 다르면 감사 기록도 삭제도 하지 않고, 같으면 감사 기록 뒤에 지운다");
  t.ok(/'delete', to_jsonb\(v_before\), NULL/.test(body), "Y-2 감사 기록은 v227 과 같다(action delete, before_value = 지운 행)");
  t.ok(/REVOKE ALL ON FUNCTION public\.accountbook_delete_transaction_if_v22988\(uuid, uuid, uuid, text, jsonb\) FROM PUBLIC;/.test(apply) && /FROM anon, authenticated;/.test(apply) && /GRANT EXECUTE ON FUNCTION public\.accountbook_delete_transaction_if_v22988\(uuid, uuid, uuid, text, jsonb\) TO service_role;/.test(apply),
    "Y-2 함수는 service_role 만 부를 수 있다");
  t.ok(rollback.startsWith("-- 실행 금지(DO NOT RUN)") && /DROP FUNCTION IF EXISTS public\.accountbook_delete_transaction_if_v22988\(uuid, uuid, uuid, text, jsonb\);/.test(rollback) && (rollback.match(/DROP /g) || []).length === 1,
    "Y-2 되돌리기 SQL 은 이 함수 하나만 지운다");
  const reauth = read("src/modules/auth/identity-reauth.js");
  const fp = /const fields = \[(row\.type), Number\(row\.amount \|\| 0\), (row\.transaction_date), (row\.category), (row\.memo), (row\.payment_method), (row\.user_id)\]/.test(reauth);
  t.ok(fp, "Y-2 실행 취소 표 지문(quickUndoFingerprint)의 칸이 그대로다(바뀌면 이 검사와 SQL 을 함께 고친다)");
}

// ── Y-3 비밀번호 변경: 결과 불확실 / 바뀐 뒤 새 로그인 실패를 나눠 안내 ─────────────────────────
const credential = { login_name: "y3-login", access_code: "Y3Password123", access_code_confirm: "Y3Password123", return_to: "/my/households" };
async function changePassword(fx, handler) {
  const proof = await makeCredentialProof(fx.env, "user-bin");
  const cookie = `${fx.cookie}; ab_credential_reauth=${encodeURIComponent(proof)}`;
  const undo = handler ? intercept(handler) : () => {};
  try {
    const response = await app.fetch(new Request(`${BASE}/my/backup-login`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", accept: "text/html" }, body: new URLSearchParams(credential) }), fx.env, { waitUntil() {} });
    // 성공 응답은 라우터가 가계부 기억 쿠키(ab_hh)도 함께 지운다(config-readiness.js) — 로그인 쿠키(ab_user) 줄만 본다.
    const userCookie = response.headers.getSetCookie().find((cookie) => cookie.startsWith("ab_user=")) || "";
    return { status: response.status, location: response.headers.get("location") || "", userCookie, html: await response.text() };
  } finally { undo(); }
}
const identityRow = (fx) => fx.db.accountbook_user_identities.find((row) => row.user_id === "user-bin" && row.provider === "local");
const SET_IDENTITY = "/rpc/accountbook_set_local_identity_v227";

await fixture(async (fx) => {
  const before = identityRow(fx)?.credential_hash || "";
  let changed = false;
  const result = await changePassword(fx, async ({ url, method, forward }) => {
    if (method === "POST" && url.pathname.endsWith(SET_IDENTITY)) { const response = await forward(); changed = true; return response; }
    if (changed && url.pathname.endsWith("/accountbook_user_security")) return failure(503, "synthetic session version outage");
  });
  t.ok(changed && identityRow(fx)?.credential_hash && identityRow(fx).credential_hash !== before, "Y-3-A 비밀번호는 바뀌었다(예전 로그인은 모두 끊겼다)");
  t.ok(result.status === 200 && result.html.includes("내 계정 로그인 비밀번호를 바꿨습니다. 보안을 위해 이 기기의 로그인도 끝났어요. 새 비밀번호로 다시 로그인해 주세요.") && !result.html.includes("저장하지 못했습니다"),
    `Y-3-A 바뀐 뒤 새 로그인만 만들지 못하면 ‘바꿨으니 다시 로그인’이라고 안내한다 (예전: ‘저장하지 못했습니다’ 409) — ${result.status}`);
  t.ok(/^ab_user=;/.test(result.userCookie) && /Max-Age=0/.test(result.userCookie), "Y-3-A 끊긴 로그인 쿠키를 지운다");
});
await fixture(async (fx) => {
  const result = await changePassword(fx, async ({ url, method, forward }) => {
    if (method === "POST" && url.pathname.endsWith(SET_IDENTITY)) { await forward(); throw new TypeError("synthetic response loss"); }
  });
  t.ok(result.status === 503 && result.html.includes("비밀번호 변경 결과를 확인하지 못했습니다. 이미 바뀌었을 수 있어요.") && !result.html.includes("저장하지 못했습니다"),
    `Y-3-B 변경 응답을 잃으면 ‘결과를 모름 — 이미 바뀌었을 수 있다’고 안내한다 (예전: ‘저장하지 못했습니다’) — ${result.status}`);
});
await fixture(async (fx) => {
  const result = await changePassword(fx, ({ url, method }) => (method === "POST" && url.pathname.endsWith(SET_IDENTITY) ? failure(400, "synthetic definite rejection") : undefined));
  t.ok(result.status === 409 && result.html.includes("내 계정 로그인 비밀번호를 저장하지 못했습니다."), "Y-3-C 저장소가 분명히 거절하면 예전처럼 저장하지 못했다고 안내한다");
  const taken = await changePassword(fx, ({ url, method }) => (method === "POST" && url.pathname.endsWith(SET_IDENTITY) ? failure(409, "login_name_in_use") : undefined));
  t.ok(taken.status === 409 && taken.html.includes("이미 사용 중인 로그인 이름입니다."), "Y-3-C 이미 쓰는 로그인 이름 안내는 그대로다");
  const ok = await changePassword(fx);
  t.ok(ok.status === 303 && ok.location.includes("msg=backup_login_saved") && /^ab_user=[^;]+/.test(ok.userCookie) && /Max-Age=1209600/.test(ok.userCookie), "Y-3-D 정상 변경은 예전처럼 새 로그인 쿠키와 함께 돌아간다");
});

// ── Y-5 관리자 API: 메모·결제수단을 빈 값으로 지운다 ──────────────────────────────────────
await fixture(async (fx) => {
  fx.env.ADMIN_API_TOKEN = "qa-admin-token";
  const call = async (path, method, body) => {
    const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: { authorization: "Bearer qa-admin-token", origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/json", accept: "application/json" }, body: JSON.stringify(body) }), fx.env, { waitUntil() {} });
    return { status: response.status, data: await response.json().catch(() => null) };
  };
  const ids = ["aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa8801", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa8802", "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaa8803"];
  for (const id of ids) fx.db.transactions.push({ id, household_id: HH, user_id: "user-bin", transaction_date: "2026-07-21", type: "expense", amount: 1000, category: "QA", memo: "지울 메모", payment_method: "국민카드", source: "web_admin", created_at: "2026-07-21T00:00:00.000Z" });
  const row = (id) => fx.db.transactions.find((item) => item.id === id);
  // 일괄 처리 함수(accountbook_bulk_transactions_v227)는 픽스처에 없어 validate-roles-v22981 처럼 흉내 낸다. 운영 함수는 키가 있으면
  // p_patch->>'memo' 를 그대로 넣으므로(schema_v22_7_0_auth_atomicity.sql) 빈 문자열이 곧 지우기다.
  const bulkPatches = [];
  const restoreBulk = intercept(({ url, init }) => {
    if (url.pathname !== "/rest/v1/rpc/accountbook_bulk_transactions_v227") return null;
    const body = JSON.parse(String(init.body || "{}"));
    bulkPatches.push(body.p_patch || {});
    for (const id of body.p_transaction_ids || []) Object.assign(row(String(id)), body.p_patch || {});
    return new Response(JSON.stringify([{ affected: (body.p_transaction_ids || []).length }]), { status: 200, headers: { "content-type": "application/json" } });
  });
  let res = await call(`/api/transactions/${ids[0]}`, "PATCH", { memo: "" });
  t.ok(res.status === 200 && row(ids[0]).memo === "" && row(ids[0]).payment_method === "국민카드", "Y-5 단건 수정의 memo:\"\" 는 메모만 지운다 (예전: 빈 값을 빼서 ‘변경할 내용이 없습니다’도 아닌 무변경 수정이었다)");
  res = await call(`/api/transactions/${ids[0]}`, "PATCH", { payment_method: null });
  t.ok(res.status === 200 && row(ids[0]).payment_method === "", "Y-5 payment_method:null 은 결제수단을 지운다");
  res = await call(`/api/transactions/${ids[1]}`, "PATCH", { description: "", method: "" });
  t.ok(res.status === 200 && row(ids[1]).memo === "" && row(ids[1]).payment_method === "", "Y-5 다른 이름(description·method)의 빈 값도 지운다");
  res = await call(`/api/transactions/${ids[2]}`, "PATCH", { amount: 2000 });
  t.ok(res.status === 200 && row(ids[2]).memo === "지울 메모" && row(ids[2]).payment_method === "국민카드" && row(ids[2]).amount === 2000, "Y-5 보내지 않은 칸은 그대로다");
  res = await call(`/api/transactions/${ids[2]}`, "PATCH", { category: "" });
  t.ok(res.status === 400 && res.data?.error === "empty_patch" && row(ids[2]).category === "QA", "Y-5 분류의 빈 값은 예전처럼 바꾸지 않고, 바꿀 것이 없으면 empty_patch 다");
  const auditsBefore = fx.db.__rpc_calls.filter((item) => item.name === "accountbook_update_transaction_v227").length;
  res = await call(`/api/transactions/${ids[2]}`, "PATCH", {});
  t.ok(res.status === 400 && res.data?.error === "empty_patch" && fx.db.__rpc_calls.filter((item) => item.name === "accountbook_update_transaction_v227").length === auditsBefore,
    "Y-5 빈 수정은 empty_patch 이고 수정 함수(감사 기록)를 부르지 않는다 (예전: 출처 기본값이 끼어 무변경 수정·감사 기록이 남았다)");
  try {
    res = await call("/api/transactions/batch", "PATCH", { ids: [ids[2]], memo: "" });
    t.ok(res.status === 200 && row(ids[2]).memo === "" && row(ids[2]).payment_method === "국민카드", "Y-5 일괄 수정도 memo:\"\" 로 메모만 지운다");
    t.deepEq(bulkPatches.at(-1), { memo: "" }, "Y-5 일괄 수정 함수에 넘기는 값은 메모 한 칸이다(출처 기본값 source 가 끼지 않는다)");
    const calls = bulkPatches.length;
    res = await call("/api/transactions/batch", "PATCH", { ids: [ids[2]] });
    t.ok(res.status === 400 && res.data?.error === "empty_patch" && bulkPatches.length === calls, "Y-5 바꿀 칸이 없는 일괄 수정은 empty_patch 이고 함수를 부르지 않는다");
  } finally { restoreBulk(); }
});

// ── Y-6 예약 실행 상태: 세 경로가 판 번호로 조건부로 쓴다 ─────────────────────────────────────
const STATE_KEY = "cron_recurring_state_v22976";
const KST = (ymd) => Date.parse(`${ymd}T09:10:00+09:00`);
const rawState = (fx) => settingValue(fx, STATE_KEY);
const stateJson = (fx) => JSON.parse(rawState(fx) || "null");
const stateRead = ({ url, method }) => method === "GET" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.${STATE_KEY}`;
const stateWrite = ({ url, method }) => (method === "PATCH" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("key") === `eq.${STATE_KEY}`)
  || (method === "POST" && url.pathname.endsWith("/accountbook_settings") && url.searchParams.get("on_conflict") === "key");
async function cron(fx, ymd, handler = null) {
  globalThis.__AB_QA_FIXED_NOW_MS = KST(ymd);
  const seen = { reads: 0, writes: 0 };
  const undo = intercept(async (request) => {
    if (stateRead(request)) seen.reads += 1;
    if (stateWrite(request) && String(request.init?.body || "").includes("rev")) seen.writes += 1;
    return handler ? handler(request) : undefined;
  });
  try { return { result: await runRecurringAutoApply(fx.env, { lock: false }), ...seen }; } finally { undo(); }
}
const queue = (fx, householdId, month) => refreshRecurringReports(fx.env, householdId, [], month, { queueOnly: true });

await fixture(async (fx) => {
  fx.db.accountbook_recurring = [];
  // 판 번호가 없는 예전 상태(V22.9.87 이하가 쓴 값)를 첫 쓰기가 판 번호 1로 바꾼다.
  putSetting(fx, STATE_KEY, JSON.stringify({ checked_date: "2026-10-19", pending_month: "" }));
  const first = await cron(fx, "2026-10-20");
  t.ok(rawState(fx).startsWith('{"rev":1,"checked_date":"2026-10-20"'), `Y-6-A 예전 상태는 첫 쓰기에서 맨 앞에 판 번호 1이 붙는다 (${rawState(fx).slice(0, 50)})`);
  t.ok(first.reads === 1 && first.writes === 1, `Y-6-A 겹친 쓰기가 없으면 상태는 한 번 읽고 한 번 쓴다(예전: 저장 앞에 다시 읽어 2회) — 읽기 ${first.reads}·쓰기 ${first.writes}`);

  // 실행이 상태를 쓰기 직전에 실행 밖 대기 보태기(V22.9.88 쓰기)가 끼어든다 — V79:T-7 의 남은 틈.
  let injected = false;
  const raced = await cron(fx, "2026-10-21", async (request) => {
    if (!injected && request.method === "PATCH" && stateWrite(request)) {
      injected = true;
      const current = stateJson(fx);
      putSetting(fx, STATE_KEY, `{"rev":${current.rev + 1},${JSON.stringify({ checked_date: current.checked_date, pending_month: current.pending_month, report_rebuild: ["2026-09|y6-late"] }).slice(1)}`);
    }
  });
  const after = stateJson(fx);
  t.ok(injected && (after.report_rebuild || []).includes("2026-09|y6-late") && after.checked_date === "2026-10-21",
    `Y-6-B 다시 읽은 뒤 저장 사이에 보탠 대기 항목도 실행 끝 저장 뒤에 남는다 (예전: 덮여 사라졌다) — ${JSON.stringify(after)}`);
  t.ok(after.rev === 3 && raced.reads === 2 && raced.writes === 2, `Y-6-B 조건이 맞지 않은 쓰기는 다시 읽어 합친 뒤 다시 쓴다(판 번호 1 → 끼어든 2 → 3 = ${after.rev}, 읽기 ${raced.reads}·쓰기 ${raced.writes})`);
});

await fixture(async (fx) => {
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-10-21");
  putSetting(fx, STATE_KEY, `{"rev":5,${JSON.stringify({ checked_date: "2026-10-21", pending_month: "" }).slice(1)}`);
  // 대기 보태기 둘이 겹친다: 첫째가 쓰기 직전에 둘째가 끝까지 쓴다.
  let nested = false;
  const undo = intercept(async (request) => {
    if (!nested && request.method === "PATCH" && stateWrite(request)) { nested = true; await queue(fx, "y6-b", "2026-08"); }
  });
  try { await queue(fx, "y6-a", "2026-09"); } finally { undo(); }
  const state = stateJson(fx);
  t.ok(nested && state.rev === 7 && ["2026-08|y6-b", "2026-09|y6-a"].every((key) => state.report_rebuild.includes(key)),
    `Y-6-C 겹친 대기 보태기 둘이 서로의 항목을 덮지 않는다 (예전: 나중에 쓴 쪽이 앞의 항목을 지웠다) — ${JSON.stringify(state)}`);

  // 매번 다른 쓰기에 밀리면 세 번 뒤 포기하고(던짐) 운영 이벤트를 남긴다. 상태는 밀어낸 쪽의 값 그대로다.
  const mark = opsEvents().at(-1);
  const bump = intercept(async (request) => {
    if (request.method === "PATCH" && stateWrite(request)) { const current = stateJson(fx); putSetting(fx, STATE_KEY, `{"rev":${current.rev + 1},${JSON.stringify({ checked_date: current.checked_date, pending_month: "" }).slice(1)}`); }
  });
  try { await queue(fx, "y6-c", "2026-09"); } finally { bump(); }
  t.ok(eventsSince(mark).some((event) => event.kind === "recurring_report_rebuild_queue_failed" && /recurring_state_write_conflict/.test(String(event.detail || ""))) && !stateJson(fx).report_rebuild,
    "Y-6-D 세 번 모두 밀리면 쓰지 않고 recurring_report_rebuild_queue_failed(recurring_state_write_conflict)를 남긴다");

  // 상태 행이 없으면 없을 때만 넣는다.
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== STATE_KEY);
  await queue(fx, "y6-d", "2026-09");
  t.ok(rawState(fx).startsWith('{"rev":1,') && stateJson(fx).report_rebuild.includes("2026-09|y6-d"), "Y-6-E 상태 행이 없으면 판 번호 1로 새로 넣는다");
});

{
  const source = read("src/modules/cron/recurring-auto-apply.js");
  const writes = (source.match(/saveSettingValue\(env, RECURRING_CRON_STATE_KEY/g) || []).length;
  t.eq(writes, 0, "Y-6 상태 키를 조건 없이 덮어쓰는 저장(saveSettingValue)이 남아 있지 않다");
  t.eq((source.match(/await updateRecurringState\(env,/g) || []).length, 3, "Y-6 상태를 고쳐 쓰는 세 경로(실행 끝·?month=·실행 밖 대기)가 모두 조건부 쓰기를 거친다");
}

t.done();
