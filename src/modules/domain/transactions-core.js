// @build:imports-start
import {
  duplicateGuardSeconds, isDuplicateGuardSource, rememberDuplicateEvent, rememberOpsEvent,
} from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, isUniqueConstraintError, operationLeaseOwner, releaseOperationLease,
  safeError,
} from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, fetchTransactionRowById, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import {
  commitImportedTransactionRows, importStorageTextIssue,
} from "../import/flexible-import-parser.js";
import { fetchPostgrestRows } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { findExactDuplicateTransaction } from "../import/csv-duplicates.js";
import { myImportStoredValue, reconcileImportedTransactionIds } from "../my/backup-import.js";
import { isMissingCategory } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { kakaoRestoreRowV4 } from "../kakao/edit-session-v4.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { inferCategory } from "../nlu/category-rules.js";
// @build:imports-end

function numberWithCommas(n) {
  return Number(n || 0).toLocaleString("ko-KR");
}

function makeInviteCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  const arr = new Uint8Array(8);
  crypto.getRandomValues(arr);
  for (const v of arr) out += chars[v % chars.length];
  return out;
}

function linkText(origin, inviteCode = "") {
  return [
    "웹 가계부",
    `${origin}/my`,
    "로그인 후 전체 기록과 분석을 확인할 수 있습니다.",
  ].join("\n");
}

function helpText(inviteCode = "", origin = "") {
  return [
    "📒 말해가계부 사용법",
    "",
    "처음이라면 첫 기록을 보내 가계부를 준비합니다. 개인 대화에서는 개인 가계부, 단톡방에서는 공동 가계부를 사용해요.",
    "",
    "기록: 점심 12000원 국민카드",
    "조회: 오늘기록 · 이번달요약 · 남은예산",
    "관리: 예산설정 · 가계부전환 · 수정 01번 금액 13000원",
    "내 이름: 이름설정",
    "공유: 초대코드 · 단톡방연결 ABC123",
  ].join("\n");
}

async function getRecentTransactions(env, householdId, userId, limit = 5) {
  const params = new URLSearchParams();
  params.set("select", "id,type,amount,category,memo,payment_method,transaction_date,created_at");
  params.set("household_id", `eq.${householdId}`);
  params.set("user_id", `eq.${userId}`);
  params.set("order", "created_at.desc");
  params.set("limit", String(limit));
  return (await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })) || [];
}

async function deleteLatestUserTransaction(env, householdId, userId) {
  const rows = await getRecentTransactions(env, householdId, userId, 1);
  const latest = rows && rows[0];
  if (!latest) return null;
  await supabase(env, `/rest/v1/transactions?id=eq.${encodeURIComponent(latest.id)}`, {
    method: "DELETE",
    headers: { Prefer: "return=minimal" },
  });
  return latest;
}

function formatRecentTransactions(rows) {
  if (!rows || !rows.length) return "최근 입력 내역이 없습니다.";
  const lines = rows.map((r, i) => {
    const typeText = r.type === "income" ? "수입" : "지출";
    const memo = r.memo || r.category || "-";
    return `${i + 1}. ${r.transaction_date} ${typeText} ${numberWithCommas(r.amount)}원 · ${memo}`;
  });
  return ["🧾 최근 입력 내역", ...lines, "", "오늘 번호로 수정하려면 '오늘기록'을 보내세요.", "예: 01번 금액 13000원 / 01번 삭제"].join("\n");
}

async function listTransactions(env, url) {
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const type = url.searchParams.get("type");
  const householdId = url.searchParams.get("household_id") || "";
  const showAll = url.searchParams.get("all") === "1" || url.searchParams.get("month") === "all";
  const start = `${month}-01`;
  const end = nextMonthStart(month);

  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  if (!showAll) {
    params.set("transaction_date", `gte.${start}`);
    params.append("transaction_date", `lt.${end}`);
  }
  if (type === "income" || type === "expense") params.set("type", `eq.${type}`);
  if (householdId) params.set("household_id", `eq.${householdId}`);
  params.set("order", "transaction_date.desc,created_at.desc");
  params.set("limit", showAll ? "1000" : "500");

  const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  const items = rows.map((r) => ({ ...r, date: r.transaction_date, method: r.payment_method, description: r.memo || r.raw_text || "" }));
  return jsonResponse({ ok: true, month, all: showAll, items });
}

async function createManualTransaction(env, body, options = {}) {
  const row = sanitizeTransactionBody(body, false, options);
  // V22.9.34 proto (B13): a client-chosen UUID v4 becomes the primary key, so a retry hits the PK instead of a time window.
  const requestId = abTransactionRequestId(options.requestId);
  if (requestId) row.id = requestId;
  const source = String(row.source || body.source || "web_admin");
  const dedupSeconds = duplicateGuardSeconds(env, source);
  const replay = existing => {
    if (!sameTransactionCore(existing, row)) throw Object.assign(new Error("transaction_request_conflict"), { code: "transaction_request_conflict" });
    return { ...existing, __idempotent_replay: true, __replay_same: true };
  };
  // The request identity takes precedence over the content/time-window duplicate guard.
  if (requestId) {
    let existing;
    try { existing = await findTransactionForRequest(env, row); }
    catch (cause) { throw Object.assign(new Error("transaction_result_unconfirmed"), { uncertain_write: true, cause }); }
    if (existing) return replay(existing);
  }
  const insertRow = async () => {
    if (!row.id) {
      const created = await supabase(env, "/rest/v1/transactions", {
        method: "POST",
        headers: { Prefer: "return=representation" },
        body: JSON.stringify(row),
      });
      return Array.isArray(created) ? created[0] : created;
    }
    let created;
    try {
      created = await supabase(env, "/rest/v1/transactions?on_conflict=id", {
        method: "POST",
        headers: { Prefer: "resolution=ignore-duplicates,return=representation" },
        body: JSON.stringify(row),
      });
    } catch (err) {
      if (isUncertainStorageWrite(err)) {
        let found = null;
        try { found = await findTransactionForRequest(env, row); } catch (_) {}
        if (found) { replay(found); return { ...found, __reconciled: true }; }
      }
      throw err;
    }
    const inserted = Array.isArray(created) ? created[0] : created;
    if (inserted) return inserted;
    let existing;
    try { existing = await findTransactionForRequest(env, row); }
    catch (cause) { throw Object.assign(new Error("transaction_result_unconfirmed"), { uncertain_write: true, cause }); }
    if (!existing) throw Object.assign(new Error("transaction_request_conflict"), { code: "transaction_request_conflict" });
    return replay(existing);
  };
  if (dedupSeconds > 0 && isDuplicateGuardSource(source) && env.DUPLICATE_GUARD_DISABLED !== "1") {
    const fingerprint = await sha256Hex([
      source,
      row.household_id,
      row.user_id,
      row.type,
      row.transaction_date,
      row.amount,
      normalizeText(row.category || ""),
      normalizeText(row.payment_method || ""),
      normalizeText(row.memo || ""),
      normalizeText(row.raw_text || ""),
    ].join("\u001f"));
    const lease = await claimOperationLease(env, {
      key: `transaction-create:${fingerprint}`,
      owner: operationLeaseOwner("transaction-create"),
      leaseSeconds: dedupSeconds,
    });
    if (!lease.acquired) {
      rememberOpsEvent({ kind: "transaction_create_busy", severity: "warn", path: "/my/transactions", method: "POST", detail: `${source}:${row.household_id}:${row.transaction_date}:${row.amount}` });
      throw new Error("database transaction_create_busy");
    }
    try {
      const dup = await findExactDuplicateTransaction(env, row, { withinSeconds: dedupSeconds });
      if (dup && row.id && String(dup.id) === row.id) return replay(dup);
      if (dup) {
        rememberDuplicateEvent({ kind: "duplicate_skipped", source, household_id: row.household_id, user_id: row.user_id, amount: row.amount, transaction_date: row.transaction_date, detail: row.memo || row.raw_text || "" });
        return { ...dup, __duplicate_skipped: true };
      }
      return await insertRow();
    } finally {
      await releaseOperationLease(env, lease);
    }
  }
  return insertRow();
}

function abTransactionRequestId(value) {
  const v = String(value || "").trim().toLowerCase();
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v) ? v : "";
}

async function findTransactionForRequest(env, row) {
  const params = new URLSearchParams({ select: "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,source_user_key,raw_text,created_at", id: `eq.${row.id}`, household_id: `eq.${row.household_id}`, limit: "1" });
  const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("transaction_request_lookup_invalid");
  return rows[0] || null;
}

function sameTransactionCore(a = {}, b = {}) {
  return Number(a.amount) === Number(b.amount) && ["household_id", "user_id", "type", "transaction_date", "category", "memo", "payment_method", "source", "source_user_key", "raw_text"].every(key => String(a[key] ?? "") === String(b[key] ?? ""));
}

async function updateTransaction(env, id, body, options = {}) {
  const allowed = sanitizeTransactionBody(body, true);
  let householdId = String(options.householdId || "").trim();
  if (!householdId) {
    const target = await fetchTransactionRowById(env, id);
    householdId = String(target?.household_id || "").trim();
  }
  if (!householdId) throw new Error("transaction household not found");
  const updated = await supabase(env, "/rest/v1/rpc/accountbook_update_transaction_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_transaction_id: id,
      p_household_id: householdId,
      p_actor_user_id: options.actorUserId || null,
      p_actor_kind: String(options.actorKind || "system").slice(0, 30),
      p_patch: allowed,
    }),
  });
  return Array.isArray(updated) ? updated[0] : updated;
}

async function deleteTransactionWithAudit(env, id, householdId, options = {}) {
  const deleted = await supabase(env, "/rest/v1/rpc/accountbook_delete_transaction_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_transaction_id: id,
      p_household_id: householdId,
      p_actor_user_id: options.actorUserId || null,
      p_actor_kind: String(options.actorKind || "system").slice(0, 30),
    }),
  });
  return Array.isArray(deleted) ? deleted[0] : deleted;
}

// V22.9.88 Y-2(Codex 지적): 실행 취소는 기록을 읽어 견준 뒤 지우기까지 요청이 둘이라, 그 사이에 다른 사람이 고친 기록도 지웠다. DB 함수
// accountbook_delete_transaction_if_v22988 이 행을 잠근 채 일곱 칸(실행 취소 표의 지문과 같은 칸 — 종류·금액·날짜·분류·메모·결제수단·지출자)을
// 읽은 값과 다시 견주고, 같을 때만 감사 기록과 함께 지운다. 돌려주는 값은 "deleted" 또는 "changed"(그대로 둠)다. 함수가 아직 없으면(SQL 적용 전,
// PGRST202) 예전처럼 감사 삭제 함수로 지운다 — 그때는 틈이 남고, migrations/V22_9_88_UNDO_DELETE_IF_UNCHANGED_APPLY_REVIEW_ONLY.sql 적용 뒤 닫힌다.
async function deleteTransactionIfUnchanged(env, row = {}, householdId = "", options = {}) {
  const outcome = await deleteTransactionIfUnchangedResultV229104(env, row, householdId, options);
  return outcome?.changed === true && outcome?.deleted !== true ? "changed" : "deleted";
}

// V22.9.104 J-9: 위 조건부 삭제의 답을 그대로 돌려준다 — 지웠으면 { deleted: true, id }, 일곱 칸이 달라 그대로 뒀으면 { deleted: false, changed: true, id }.
// 함수가 없으면(PGRST202) 예전 감사 삭제 함수의 답이다(그때는 V22.9.88 과 같이 틈이 남는다). 구성원 웹 삭제(/admin/delete)는 지운 기록 번호까지
// 확인해야 해서(결과 모름 판정) 문자열이 아니라 이 답을 쓴다. 일곱 칸에 지출자(user_id)가 들어 있으므로, 같은 요청에서 읽은 행을 넘기면
// ‘읽은 뒤 지출자가 바뀐 기록’은 지우지 않는다(관리자가 그 사이 지출자를 바꾼 경우).
async function deleteTransactionIfUnchangedResultV229104(env, row = {}, householdId = "", options = {}) {
  const expected = Object.fromEntries(["type", "amount", "transaction_date", "category", "memo", "payment_method", "user_id"].map((key) => [key, row[key] ?? null]));
  try {
    const result = await supabase(env, "/rest/v1/rpc/accountbook_delete_transaction_if_v22988", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({
        p_transaction_id: row.id,
        p_household_id: householdId,
        p_actor_user_id: options.actorUserId || null,
        p_actor_kind: String(options.actorKind || "system").slice(0, 30),
        p_expected: expected,
      }),
    });
    const outcome = Array.isArray(result) ? result[0] : result;
    if (outcome?.deleted === true || outcome?.changed === true) return outcome;
    throw new Error("transaction_conditional_delete_invalid");
  } catch (err) {
    if (!/PGRST202|Could not find the function/i.test(safeError(err))) throw err;
  }
  return deleteTransactionWithAudit(env, row.id, householdId, options);
}

// V22.9.90 웹 ‘되돌리기’: 지운 행은 지우는 DB 함수(accountbook_delete_transaction_v227·_if_v22988)가 감사 기록(before_value = 지운 행 전체)에 남긴다.
// 표는 그 한 번의 삭제에만 쓴다(독립 검토): 그 기록의 가장 최근 삭제 감사를 누가 지웠든 읽고(지운 시각 2분 전부터), 그것이 표가 가리키는 삭제일 때만
// 지운 행을 준다. { row } 이고, 없거나 모양이 다르면 reason "expired", 더 뒤의 다른 삭제면 reason "changed" 다.
// V22.9.94 C-4(외부 검토): 예전에는 ‘이 사용자가 지운 시각 30초 뒤까지의 삭제’를 표의 삭제로 봐서(서버·DB 시계 차이 여유), 지움 → 되돌리기 → 고침 →
// 30초 안에 다시 지움 다음에 첫 표가 두 번째 삭제를 되돌렸다. 이제 표는 그 삭제가 남긴 감사 기록 번호(auditId — 삭제 한 번의 고유 번호,
// fetchDeleteAuditIdV22994)를 서명해 싣고, 가장 최근 삭제 감사가 같은 번호일 때만 되살린다(시각 비교 없음). 모든 삭제 경로(웹·카카오·일괄·실행 취소의
// _if_v22988 와 그 대체 v227)가 감사 기록을 남기므로 뒤의 삭제는 늘 새 번호다. 번호가 없는 표(배포 전 표)는 받지 않는다.
async function fetchDeletedTransactionAudit(env, { transactionId = "", householdId = "", userId = "", deletedAt = 0, auditId = "" } = {}) {
  if (!transactionId || !householdId || !userId || !String(auditId || "") || !(Number(deletedAt) > 0)) return { row: null, reason: "expired" };
  const params = new URLSearchParams();
  params.set("select", "id,before_value,actor_user_id,created_at");
  params.set("transaction_id", `eq.${transactionId}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("action", "eq.delete");
  params.set("created_at", `gte.${new Date((Number(deletedAt) - 120) * 1000).toISOString()}`);
  params.set("order", "created_at.desc,id.desc");
  params.set("limit", "1");
  const rows = await supabase(env, `/rest/v1/accountbook_transaction_audit?${params.toString()}`, { method: "GET" }) || [];
  const latest = Array.isArray(rows) ? rows[0] : null;
  const at = Date.parse(String(latest?.created_at || "")) / 1000;
  if (!latest || !Number.isFinite(at)) return { row: null, reason: "expired" };
  if (String(latest.id ?? "") !== String(auditId) || String(latest.actor_user_id || "") !== String(userId)) return { row: null, reason: "changed" };
  const before = latest.before_value;
  if (!before || typeof before !== "object" || Array.isArray(before)) return { row: null, reason: "expired" };
  if (String(before.id || "") !== String(transactionId) || String(before.household_id || "") !== String(householdId)) return { row: null, reason: "expired" };
  return { row: before, reason: "" };
}

// V22.9.94 C-4: 방금 지운 기록의 가장 최근 삭제 감사 기록 번호. 그 감사가 이 사용자의 것일 때만 번호를 주고(아니면 ""), 되살리기 표가 이 번호를 싣는다.
// 지우는 DB 함수가 감사 번호를 돌려주지 않아 지운 뒤 한 번 읽는다. 읽지 못하면 부르는 곳이 표를 싣지 않는다(삭제 결과는 그대로).
async function fetchDeleteAuditIdV22994(env, { transactionId = "", householdId = "", userId = "" } = {}) {
  if (!transactionId || !householdId || !userId) return "";
  const params = new URLSearchParams();
  params.set("select", "id,actor_user_id,created_at");
  params.set("transaction_id", `eq.${transactionId}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("action", "eq.delete");
  params.set("order", "created_at.desc,id.desc");
  params.set("limit", "1");
  const rows = await supabase(env, `/rest/v1/accountbook_transaction_audit?${params.toString()}`, { method: "GET" }) || [];
  const latest = Array.isArray(rows) ? rows[0] : null;
  if (!latest || latest.id === undefined || latest.id === null || String(latest.id) === "") return "";
  return String(latest.actor_user_id || "") === String(userId) ? String(latest.id) : "";
}

// V22.9.94 C-9(외부 검토): 웹 수정(/admin/update·/my/update)은 기록을 읽어 견준 뒤 감사 RPC(accountbook_update_transaction_v227)로 조건 없이 저장해서,
// 읽은 뒤·저장 전에 다른 곳(카카오 수정·다른 화면·관리 API)이 저장한 값을 덮어썼다(두 화면 모두 ‘수정했습니다’). 이제 저장은 바꾸는 칸마다 읽은 값
// (expected)을 PostgREST eq 조건으로 건 조건부 PATCH 한 번이다 — DB 가 그 행을 잠근 채 조건을 보고 바꾸므로 비교와 저장 사이의 틈이 없다.
// 바꾸지 않는 칸은 조건에 걸지 않는다(다른 곳이 그 칸만 바꿨으면 둘 다 남는다 — 예전 칸별 병합과 같다). 바꾸는 칸은 감사 RPC 와 같은 일곱 칸뿐이다.
// 0행이면 다시 읽는다: 없으면 { status: "missing" }, 바꾸려던 칸이 읽은 값과 다르면 { status: "changed", row: 지금 행 } — 부르는 곳이 충돌을 알린다.
// 바꾸려던 칸이 그대로인데 0행이면(eq 비교가 저장된 글자와 어긋나는 드문 경우) 예전 감사 RPC 로 저장한다(그 기록을 영영 못 고치게 두지 않는다).
// 감사 기록: RPC 는 같은 트랜잭션에서 남겼지만 PATCH 는 저장 뒤 한 줄을 따로 남긴다(before = 저장된 행에서 바꾼 칸만 읽은 값으로 되돌린 행 전체).
// 이 한 줄이 실패해도 수정은 이미 저장됐으므로 성공으로 답하고 운영 이벤트만 남긴다. 결과를 모르는 PATCH(응답 없음·5xx)는 supabase() 가 결과 불확실로
// 던진다. 지출자 바꾸기는 부르는 곳이 같은 요청에서 받은 참여자 목록으로 먼저 확인한다(RPC 는 잠근 채 한 번 더 확인했다). 환불 연결 보호 트리거
// (refund_link_guard_v22979, BEFORE UPDATE)는 PATCH 에도 그대로 걸린다.
// V22.9.104 J-9(Codex 검토 V102): 구성원은 자기 기록(지출자 = 나)만 고친다. 그런데 바꾸지 않는 칸은 조건에 걸지 않으므로, 구성원이 금액만 고치는 사이
// 관리자가 그 기록의 지출자를 바꾸면 구성원의 저장이 이제 남의 기록이 된 행에 들어갔다. options.requireUserId(구성원 본인 id)를 주면 지출자 칸을
// 바꾸지 않아도 PATCH 에 user_id=eq.<그 id> 조건을 함께 건다(같은 PATCH 의 조건 하나라 DB 요청은 늘지 않는다). 0행이면 다시 읽어 지출자가 다르면
// { status: "spender_changed", row: 지금 행 } 이다 — 부르는 곳이 충돌을 알리고 아무것도 바꾸지 않는다. 이때 ‘조건 불일치 대비’도 감사 RPC(조건 없음)가 아니라
// 지출자 조건만 건 PATCH 로 저장한다. 소유자·관리자(requireUserId 없음)는 예전 그대로다. options.auditRunner 는 감사 한 줄을 남기는 일을 받아 돌린다
// (기본은 바로 돌림, 카카오 수정은 답장 뒤로 미룬다 — 답 전 DB 요청 수를 감사 RPC 때와 같게 둔다).
const TX_CONDITIONAL_EDIT_COLUMNS_V22994 = ["type", "amount", "transaction_date", "category", "memo", "payment_method", "user_id"];

// V22.9.104 J-9: 구성원이 고치거나 지우려던 기록을 그 사이 다른 사람이 먼저 바꿨을 때(지출자 바뀜 포함) 웹에 보이는 말.
// 웹 수정·삭제의 err=record_edit_conflict 문구(formatMessageText)와 /admin/delete JSON 의 message 가 이 값을 쓴다.
const RECORD_EDIT_CONFLICT_MESSAGE_V229104 = "다른 사람이 이 기록을 먼저 바꿨어요. 새로고침한 뒤 다시 확인해 주세요.";

function txConditionalEditFilterV22994(key, value) {
  if (value === null || value === undefined) return "is.null";
  return `eq.${key === "amount" ? Number(value) : String(value)}`;
}

function txConditionalEditSameV22994(key, a, b) {
  if (key === "amount") return Number(a) === Number(b);
  if (a === null || a === undefined || b === null || b === undefined) return (a ?? null) === (b ?? null);
  return String(a) === String(b);
}

async function updateTransactionIfUnchangedV22994(env, id, body, expected = {}, options = {}) {
  const transactionId = String(id || "").trim();
  const householdId = String(options.householdId || expected?.household_id || "").trim();
  if (!transactionId || !householdId) throw new Error("transaction household not found");
  const sanitized = sanitizeTransactionBody(body, true);
  const patch = Object.fromEntries(TX_CONDITIONAL_EDIT_COLUMNS_V22994.filter((key) => Object.hasOwn(sanitized, key)).map((key) => [key, sanitized[key]]));
  const keys = Object.keys(patch);
  if (!keys.length) return { status: "updated", row: expected };
  const actorKind = String(options.actorKind || "system").slice(0, 30);
  const requireUserId = String(options.requireUserId || "").trim();
  const runAudit = typeof options.auditRunner === "function" ? options.auditRunner : (job) => job();
  const scope = () => {
    const params = new URLSearchParams();
    params.set("id", `eq.${transactionId}`);
    params.set("household_id", `eq.${householdId}`);
    return params;
  };
  const patchWhere = async (params) => {
    // V22.9.104 J-9: 구성원 저장은 지출자 칸을 바꾸지 않아도 ‘지출자 = 나’ 조건을 건다(바꾸는 칸의 조건 뒤에 두어 같은 칸이면 이 값이 남는다).
    if (requireUserId) params.set("user_id", `eq.${requireUserId}`);
    const updated = await supabase(env, `/rest/v1/transactions?${params.toString()}`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify(patch),
    });
    if (!Array.isArray(updated)) throw Object.assign(new Error("transaction_conditional_update_invalid"), { uncertain_write: true });
    return updated[0] || null;
  };
  const audited = async (after) => {
    await runAudit(async () => {
      const before = { ...after };
      for (const key of keys) before[key] = expected?.[key] ?? null;
      try {
        await supabase(env, "/rest/v1/accountbook_transaction_audit", {
          method: "POST",
          headers: { Prefer: "return=minimal" },
          body: JSON.stringify({ transaction_id: transactionId, household_id: householdId, actor_user_id: options.actorUserId || null, actor_kind: actorKind, action: "update", before_value: before, after_value: after }),
        });
      } catch (auditError) {
        rememberOpsEvent({ kind: "transaction_update_audit_failed", severity: "warn", path: String(options.path || ""), method: "POST", detail: safeError(auditError) });
      }
    });
    return { status: "updated", row: after };
  };
  const conditioned = scope();
  for (const key of keys) conditioned.set(key, txConditionalEditFilterV22994(key, expected?.[key]));
  const after = await patchWhere(conditioned);
  if (after) return audited(after);
  const fresh = await txConditionalEditRowV22994(env, transactionId, householdId);
  if (!fresh) return { status: "missing", row: null };
  if (requireUserId && String(fresh.user_id ?? "") !== requireUserId) return { status: "spender_changed", row: fresh };
  if (keys.some((key) => !txConditionalEditSameV22994(key, fresh[key], expected?.[key]))) return { status: "changed", row: fresh };
  rememberOpsEvent({ kind: "transaction_conditional_update_filter_mismatch", severity: "warn", path: String(options.path || ""), method: "PATCH", detail: keys.join(",") });
  if (requireUserId) {
    // V22.9.104 J-9: 값은 그대로인데 0행이었다(eq 비교 어긋남). 감사 RPC 는 지출자 조건을 걸 수 없어 지출자 조건만 건 PATCH 로 저장한다.
    const saved = await patchWhere(scope());
    if (saved) return audited(saved);
    const latest = await txConditionalEditRowV22994(env, transactionId, householdId);
    if (!latest) return { status: "missing", row: null };
    return { status: String(latest.user_id ?? "") !== requireUserId ? "spender_changed" : "changed", row: latest };
  }
  const viaRpc = await updateTransaction(env, transactionId, patch, { householdId, actorUserId: options.actorUserId || null, actorKind });
  return { status: "updated", row: viaRpc || fresh };
}

// 수정 화면·충돌 화면이 쓰는 칸 그대로(my/transactions.js getTransactionForUserEdit 와 같은 select).
async function txConditionalEditRowV22994(env, id, householdId) {
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  params.set("id", `eq.${id}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("limit", "1");
  const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  return Array.isArray(rows) ? rows[0] || null : null;
}

// 지운 기록 한 건을 같은 기록 번호로 다시 넣는다. 카카오 ‘복구’(kakao/edit-flow-v4.js)와 같은 칸(KAKAO_TX_RESTORE_COLUMNS_V4)·같은 순서다 —
// 가져오기 기록은 가져오기 저장 경로로 넣고 번호로 다시 확인하며, 결과를 모르거나 같은 번호가 이미 있으면 다시 넣지 않고 번호로 확인한다
// (번호를 뺀 재삽입은 중복을 만든다). findById(id) 는 지금 있는 행을 돌려준다. 되살린 행을 돌려주고, 확인하지 못하면 던진다.
async function reinsertDeletedTransaction(env, householdId = "", row = {}, findById = async () => null) {
  const body = kakaoRestoreRowV4(row, householdId);
  if (!body.id) throw new Error("restore_row_invalid");
  const imported = ["my_import", "backup_import_v19_3"].includes(body.source);
  let restored = null;
  try {
    if (imported) {
      if (importStorageTextIssue(body)) throw new Error("import_restore_fields_invalid");
      await commitImportedTransactionRows(env, householdId, [body]);
      const found = await reconcileImportedTransactionIds(env, householdId, [body]);
      if (!found.has(String(body.id))) throw Object.assign(new Error("import_restore_unconfirmed"), { uncertain_write: true });
      restored = body;
    } else {
      const inserted = await supabase(env, "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(body) });
      restored = (Array.isArray(inserted) && inserted[0]) || body;
    }
  } catch (err) {
    if (!isUncertainStorageWrite(err) && !isUniqueConstraintError(err)) throw err;
    restored = await findById(body.id);
    if (!restored) throw err;
  }
  if (imported && myImportStoredValue(restored) !== myImportStoredValue(body)) throw new Error("import_restore_unconfirmed");
  return restored;
}

async function bulkTransactionsAtomic(env, ids = [], householdId = "", patch = {}, options = {}) {
  const cleanIds = [...new Set(safeArray(ids).map((id) => String(id || "").trim()).filter(Boolean))];
  if (!cleanIds.length || cleanIds.length > 500) throw new Error("invalid bulk size");
  const result = await supabase(env, "/rest/v1/rpc/accountbook_bulk_transactions_v227", {
    method: "POST",
    headers: { Prefer: "return=representation" },
    body: JSON.stringify({
      p_transaction_ids: cleanIds,
      p_household_id: householdId,
      p_actor_user_id: options.actorUserId || null,
      p_actor_kind: String(options.actorKind || "system").slice(0, 30),
      p_patch: sanitizeTransactionBody(patch, true),
      p_delete: options.delete === true,
    }),
  });
  return Array.isArray(result) ? result[0] : result;
}

// V22.9.15: 이 함수는 30개짜리 **다른 분류 체계**를 따로 갖고 있었다. 거래를 분류 없이
// 저장하면 그 이름이 그대로 DB 에 들어가서, 화면은 "식비"라고 제안하는데 저장은 "외식"이
// 되는 일이 벌어졌다. 사용자가 30개(잘게) 쪽을 정본으로 정했으므로 CATEGORY_RULES 를
// 그 체계로 다시 쓰고, 이 함수는 정본에 위임만 한다 — 표가 하나가 되었다.
function recommendCategory(text = "", type = "expense") {
  return inferCategory(text, type === "income" ? "income" : "expense");
}

// V22.9.34 감사 SIM-10: 분류·결제수단 이름은 집계 맵의 키가 된다. "__proto__" 같은 이름은 받지 않는다.
function isPrototypeKeyName(value) {
  return ["__proto__", "constructor", "prototype"].includes(String(value ?? "").trim());
}

// V22.9.34 감사 SIM-10·N3: 입력의 칸은 자기 속성만 본다. 원형이 오염됐을 때 상속된 값이 부분 수정의 칸으로
// 들어가 금액이 0원이 되던 길을 막는다. 금액 상한(20억)은 카카오 수정처럼 다른 검증을 거치지 않는 경로를 위해
// 저장 직전에도 지킨다.
function sanitizeTransactionBody(body, partial = false, options = {}) {
  const src = body && typeof body === "object" ? body : {};
  const own = (key) => Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
  const out = {};
  if (!partial && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(own("id") || ""))) out.id = String(own("id"));
  if (!partial || own("household_id")) out.household_id = String(own("household_id") || "");
  if (own("user_id")) out.user_id = String(own("user_id"));
  if (!partial || own("type")) out.type = own("type") === "income" ? "income" : "expense";
  if (!partial || own("amount") !== undefined) {
    const amount = own("amount");
    if (typeof amount !== "number" && (typeof amount !== "string" || !/^\d+$/.test(amount))) throw new Error("invalid_transaction_amount");
    if (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0) throw new Error("invalid_transaction_amount");
    out.amount = Number(amount);
  }
  if (!partial || own("category") !== undefined) out.category = String(own("category") || "").slice(0, 80);
  if (!partial || own("memo") !== undefined) out.memo = String(own("memo") || "").slice(0, 160);
  const preserveEmptyCategory = options.preserveEmptyCategory === true && out.category === "";
  // V22.9.80 T-18: 비었거나 ‘기타’인 분류를 다시 정할 때 결제수단 칸은 넣지 않는다(고른 결제수단 ‘농협’이 장보기를 정했다 — 카카오는 문장만
  // 본다). 빠른 입력이 문장에서 저절로 채운 메모(options.autoMemo)도 넣지 않는다 — ‘모임 9000 농협체크’의 메모 ‘모임 농협’에 남은 ‘농협’이
  // 막아 둔 낱말을 되살렸다(웹 빠른 입력 A-10 고침과 같은 기준). 직접 적은 메모와 원문은 예전처럼 본다.
  if (!partial && !preserveEmptyCategory && (!out.category || isMissingCategory(out.category))) out.category = recommendCategory(`${options.autoMemo === true ? "" : out.memo || ""} ${own("raw_text") || ""}`, out.type);
  if (!partial && !preserveEmptyCategory && (!out.category || isMissingCategory(out.category))) out.category = out.type === "income" ? "기타수입" : "기타지출";
  if (!partial || own("payment_method") !== undefined) out.payment_method = String(own("payment_method") || "").slice(0, 40);
  if (!partial || own("transaction_date") !== undefined) {
    // V22.9.34 감사 N4·D5: 달력에 없는 날짜를 오늘로 바꿔 저장하지 않는다. 비어 있을 때만 오늘이다.
    const date = String(own("transaction_date") || "").trim();
    if (date && !isValidTransactionDateString(date)) throw new Error("invalid_transaction_date");
    out.transaction_date = date || formatDate(nowKstDate());
  }
  if (!partial) out.source = own("source") || "web_admin";
  if (!partial && own("source_user_key")) out.source_user_key = String(own("source_user_key")).slice(0, 180);
  if (!partial && own("raw_text")) out.raw_text = String(own("raw_text")).slice(0, 500);
  if (isPrototypeKeyName(out.category) || isPrototypeKeyName(out.payment_method)) throw new Error("reserved_name");
  if (out.amount !== undefined && out.amount > MAX_TRANSACTION_AMOUNT) throw new Error("amount_too_large");
  if (!partial && !out.household_id) throw new Error("household_id is required");
  if (!partial && !out.user_id) throw new Error("spender user_id is required");
  if (!partial && !out.amount) throw new Error("amount is required");
  return out;
}

async function getStats(env, householdId, month) {
  const rows = await fetchMonthRows(env, householdId, month);
  return calculateStats(rows);
}

async function getMonthSummary(env, householdId, month) {
  const rows = await fetchMonthRows(env, householdId, month);
  return calculateStats(rows);
}

async function fetchMonthRows(env, householdId, month) {
  const start = `${month}-01`;
  const end = nextMonthStart(month);
  const params = new URLSearchParams();
  params.set("select", "id,type,amount,category,memo,transaction_date");
  params.set("transaction_date", `gte.${start}`);
  params.append("transaction_date", `lt.${end}`);
  if (householdId) params.set("household_id", `eq.${householdId}`);
  params.set("order", "transaction_date.desc,id.desc");
  return fetchPostgrestRows(env, `/rest/v1/transactions?${params.toString()}`);
}

function calculateStats(rows) {
  const totals = { income: 0, expense: 0, balance: 0 };
  const categories = Object.create(null);
  const daily = Object.create(null);

  for (const row of rows || []) {
    const amount = Number(row.amount || 0);
    if (row.type === "income") totals.income += amount;
    else totals.expense += amount;

    const key = row.category || (row.type === "income" ? "기타수입" : "기타지출");
    if (!categories[key]) categories[key] = { income: 0, expense: 0, total: 0, count: 0 };
    categories[key][row.type === "income" ? "income" : "expense"] += amount;
    categories[key].total += amount;
    categories[key].count += 1;

    const day = row.transaction_date;
    if (!daily[day]) daily[day] = { income: 0, expense: 0, count: 0 };
    daily[day][row.type] += amount;
    daily[day].count += 1;
  }
  totals.balance = totals.income - totals.expense;

  const categoryRows = Object.entries(categories)
    .map(([category, v]) => ({ category, ...v }))
    .sort((a, b) => b.expense - a.expense || b.income - a.income);

  return { totals, categories: categoryRows, daily };
}

async function getCalendar(env, householdId, month) {
  const rows = await fetchMonthRows(env, householdId, month);
  return calendarDaysFromRows(rows, month);
}

// V22.9.16: 이미 받아 둔 달 거래로 달력을 만든다. 같은 달을 두 번 읽던 화면이 이것을 쓴다.
function calendarDaysFromRows(rows = [], month = "") {
  const stats = calculateStats(safeArray(rows));
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const days = [];
  for (let d = 1; d <= daysInMonth; d++) {
    const date = `${month}-${String(d).padStart(2, "0")}`;
    days.push({ date, income: stats.daily[date]?.income || 0, expense: stats.daily[date]?.expense || 0, count: stats.daily[date]?.count || 0 });
  }
  return days;
}

function nextMonthStart(month) {
  const y = Number(month.slice(0, 4));
  const m = Number(month.slice(5, 7));
  const d = new Date(y, m, 1);
  return formatDate(d);
}

function formatSummary(summary, month) {
  const topExpenses = summary.categories
    .filter((c) => c.expense > 0)
    .slice(0, 3)
    .map((c, i) => `${i + 1}. ${c.category}: ${numberWithCommas(c.expense)}원`)
    .join("\n");

  return [
    `📊 ${month} 요약`,
    `수입: ${numberWithCommas(summary.totals.income)}원`,
    // V22.9.80 V76 M-7: 연결한 환불을 뺀 요약(refundAdjustedStats)이면 지출 줄에 반영한 금액을 적는다.
    `지출: ${numberWithCommas(summary.totals.expense)}원${Number(summary.refund?.applied || 0) > 0 ? ` (환불 차감 ${numberWithCommas(summary.refund.applied)}원 반영)` : ""}`,
    `잔액: ${numberWithCommas(summary.totals.balance)}원`,
    topExpenses ? "\n상위 지출:" : "",
    topExpenses,
  ]
    .filter(Boolean)
    .join("\n");
}

// V22.9.26: <script> 안에 서버 값을 JSON 으로 넣을 때 `</script` 와 줄 구분 문자로 스크립트가
// 끊기지 않게 한다. 초대코드처럼 지금은 안전한 값도 입력 경로가 생기면 저장형 XSS 가 된다.
function jsonForInlineScript(value) {
  return JSON.stringify(value)
    .replace(/</g, "\\u003c")
    .replace(new RegExp(String.fromCharCode(8232), "g"), "\\u2028")
    .replace(new RegExp(String.fromCharCode(8233), "g"), "\\u2029");
}

function escapeHtml(s) {
  return String(s ?? "").replace(/[&<>'"]/g, (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[ch]));
}

// V22.9.109 G-1·G-7(Gemini ①): 홈·기록 탭 필터(V22.9.102 J-1, my/mobile-home.js)와 상단 통합 검색(/u/api/tx/search, api/user-api.js)이
// 같은 낱말 규칙을 쓴다. 검색어는 띄어쓰기로 나눈 낱말(최대 8개)마다 맞추고 모두 맞아야 한다. 낱말은 내용·분류·결제수단·원문·지출자 이름의
// 부분 일치이고, 숫자 낱말(‘4500’·‘4,500’·‘4500원’)은 금액 완전 일치다. 예전 상단 검색은 검색어 전체를 한 덩어리로 대고(‘카페 라떼’ 0건)
// 검색어의 숫자를 모두 이어 붙여 금액 부분 일치를 OR 로 더해 ‘점심 12000’ 이 112,000원 거래까지, ‘커피 4500 택시 8000’ 은 ‘45008000’ 으로 아무것도 못 찾았다.
// 정의는 빌드 도구가 관리하는 exports 블록 앞에 둔다(블록 안은 빌드 때 다시 생성된다).
function filterNeedleTokens(q = "") {
  return String(q || "").trim().toLowerCase().split(/\s+/).filter(Boolean).slice(0, 8);
}

function filterRowMatchesToken(row, token) {
  const hay = `${row.memo || ""} ${row.category || ""} ${row.payment_method || ""} ${row.raw_text || ""} ${row.spender_name || ""}`.toLowerCase();
  if (hay.includes(token)) return true;
  const digits = token.replace(/,/g, "").replace(/원$/, "");
  if (digits && /^\d+$/.test(digits)) return String(Math.round(Number(row.amount) || 0)) === digits;
  return false;
}
// @build:exports-start
export {
  RECORD_EDIT_CONFLICT_MESSAGE_V229104, abTransactionRequestId, bulkTransactionsAtomic,
  calculateStats, calendarDaysFromRows, createManualTransaction, deleteTransactionIfUnchanged,
  deleteTransactionIfUnchangedResultV229104, deleteTransactionWithAudit, escapeHtml,
  fetchDeleteAuditIdV22994, fetchDeletedTransactionAudit, filterNeedleTokens, filterRowMatchesToken,
  findTransactionForRequest, formatRecentTransactions, formatSummary, getCalendar, getMonthSummary,
  getStats, helpText, jsonForInlineScript, linkText, listTransactions, makeInviteCode,
  nextMonthStart, numberWithCommas, reinsertDeletedTransaction, sameTransactionCore,
  sanitizeTransactionBody, updateTransaction, updateTransactionIfUnchangedV22994,
};
// @build:exports-end
