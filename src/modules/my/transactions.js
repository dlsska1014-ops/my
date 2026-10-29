// @build:imports-start
import {
  duplicateSkippedReturnLocation, isDatabaseBusyError, rememberOpsEvent, userSafeErrorCode,
} from "../runtime/ops-telemetry.js";
import {
  parseStrictSettingsObject, safeError, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { redirectResponse } from "../runtime/http.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString, normalizeTransactionType,
  parseFormAmountValue,
} from "../admin/transactions-households.js";
import { resolveManualInputClassification } from "../settings/payment-assets.js";
import { safeUserReturnPath } from "../admin/bulk-and-return-paths.js";
import { fetchHouseholdMembers, memberNameMap } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { refundLinkLockedCode } from "../domain/refund-links.js";
import { verifyUserSession } from "../auth/user-session.js";
import { quickUndoFingerprint, readQuickUndoTicket } from "../auth/identity-reauth.js";
import {
  canManageMyRecord, canWriteMyHousehold, getMySelectedHousehold, memberRecordChangeError,
  myReturnLocation,
} from "./access-control.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import {
  createManualTransaction, deleteTransactionWithAudit, updateTransaction,
} from "../domain/transactions-core.js";
// @build:imports-end

function transactionEditHistoryKey(householdId = "") {
  return `transaction_edit_history:${String(householdId || "default").trim() || "default"}`;
}

// 표시용 수정 이력은 가계부마다 설정 JSON 하나에 모인다. 읽기 실패나 깨진 JSON 을 빈 값으로 보고 새 항목만
// 저장하면 가계부 전체의 이력이 사라진다(QA B06). 그래서 잠금 안에서 엄격하게 읽어 병합하고, 읽지 못하면
// 쓰지 않는다. 거래 수정 자체는 이미 원자적 RPC 와 DB 감사에 반영됐으므로 호출부가 이력 실패만 따로 기록한다.
async function fetchTransactionEditHistoryMap(env, householdId = "") {
  const parsed = parseStrictSettingsObject(await getSettingValueStrict(env, transactionEditHistoryKey(householdId)), "transaction_edit_history");
  const out = Object.create(null);
  for (const [id, list] of Object.entries(parsed)) {
    if (id && Array.isArray(list)) out[id] = list.slice(-20);
  }
  return out;
}

function transactionAuditFields() {
  return [
    ["user_id", "지출자"],
    ["type", "구분"],
    ["transaction_date", "날짜"],
    ["amount", "금액"],
    ["memo", "내용"],
    ["category", "분류"],
    ["payment_method", "결제수단"],
  ];
}

function valueForAudit(row = {}, key = "", memberMap = {}) {
  if (key === "user_id") return memberMap[String(row.user_id || "")] || row.user_id || "미지정";
  if (key === "type") return row.type === "income" ? "수입" : "지출";
  if (key === "amount") return `${Number(row.amount || 0).toLocaleString("ko-KR")}원`;
  return String(row[key] ?? "");
}

function buildTransactionChanges(before = {}, after = {}, memberMap = {}) {
  const changes = [];
  for (const [key, label] of transactionAuditFields()) {
    const bRaw = key === "amount" ? Math.round(Number(before[key] || 0)) : String(before[key] ?? "");
    const aRaw = key === "amount" ? Math.round(Number(after[key] || 0)) : String(after[key] ?? "");
    if (String(bRaw) === String(aRaw)) continue;
    changes.push({ field: key, label, before: valueForAudit(before, key, memberMap), after: valueForAudit(after, key, memberMap) });
  }
  return changes;
}

async function appendTransactionEditHistory(env, householdId = "", transactionId = "", before = {}, after = {}, editedBy = "", members = []) {
  if (!householdId || !transactionId) return [];
  const memberMap = memberNameMap(members || []);
  const changes = buildTransactionChanges(before, after, memberMap);
  if (!changes.length) return [];
  return withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
    const map = await fetchTransactionEditHistoryMap(env, householdId);
    const list = Array.isArray(map[transactionId]) ? map[transactionId] : [];
    list.push({ at: new Date().toISOString(), edited_by: editedBy || "", edited_by_name: memberMap[String(editedBy || "")] || "", changes });
    map[transactionId] = list.slice(-20);
    assertFresh();
    await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ key: transactionEditHistoryKey(householdId), value: JSON.stringify(map) }),
    });
    return map[transactionId];
  });
}

function memberExists(members = [], userId = "") {
  return safeArray(members).some((m) => String(m.user_id || "") === String(userId || ""));
}

function memberCanBeSpender(member = {}) {
  return !!String(member?.user_id || "").trim() && !["pending", "blocked"].includes(String(member?.role || "member").toLowerCase());
}

function activeSpenderExists(members = [], userId = "") {
  return safeArray(members).some((member) => memberCanBeSpender(member) && String(member.user_id || "") === String(userId || ""));
}

function canManageAllRecords(role = "") {
  return ["owner", "admin"].includes(String(role || ""));
}

async function getTransactionForUserEdit(env, id, householdId) {
  if (!id || !householdId) return null;
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  params.set("id", `eq.${id}`);
  params.set("household_id", `eq.${householdId}`);
  params.set("limit", "1");
  const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  return rows[0] || null;
}

function parseMyAmount(form) {
  return parseFormAmountValue(form.get("amount"));
}

async function handleMyAddTransaction(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(myReturnLocation(month, selected.id, { err: "write_not_allowed" }));
  const type = normalizeTransactionType(String(form.get("type") || "expense"));
  const transactionDate = String(form.get("transaction_date") || formatDate(nowKstDate())).trim();
  const amount = parseMyAmount(form);
  if (!amount || amount <= 0) return redirectResponse(myReturnLocation(month, selected.id, { err: "amount_required" }));
  if (amount > MAX_TRANSACTION_AMOUNT) return redirectResponse(myReturnLocation(month, selected.id, { err: "amount_too_large" }));
  if (!isValidTransactionDateString(transactionDate)) return redirectResponse(myReturnLocation(month, selected.id, { err: "invalid_date" }));
  const members = await fetchHouseholdMembers(env, selected.id);
  const requestedUserId = String(form.get("user_id") || "").trim();
  if (requestedUserId && !activeSpenderExists(members, requestedUserId)) return redirectResponse(myReturnLocation(month, selected.id, { err: "spender_not_member" }));
  const spenderUserId = canManageAllRecords(selected.role) && requestedUserId && activeSpenderExists(members, requestedUserId) ? requestedUserId : userId;
  const rawText = String(form.get("raw_text") || "").trim();
  const memoText = String(form.get("memo") || "").trim();
  const manualClass = await resolveManualInputClassification(env, selected.id, type, {
    raw_text: rawText,
    memo: memoText,
    category: String(form.get("category") || "").trim(),
    payment_method: String(form.get("payment_method") || "").trim(),
    manual_category: form.get("quick_manual_category") === "1",
    manual_payment: form.get("quick_manual_payment") === "1",
    // V22.9.80 T-18: 빠른 입력이 문장에서 채운 메모("0")는 분류 판정에 다시 넣지 않는다(표식이 없으면 예전처럼 넣는다).
    manual_memo: form.get("quick_manual_memo") === null ? undefined : form.get("quick_manual_memo") === "1",
  });
  const body = {
    household_id: selected.id,
    user_id: spenderUserId,
    type,
    transaction_date: transactionDate,
    amount,
    memo: memoText,
    category: manualClass.category,
    payment_method: manualClass.payment_method,
    source: "my_web",
    raw_text: rawText,
  };
  try {
    const created = await createManualTransaction(env, body, { requestId: String(form.get("request_id") || ""), preserveEmptyCategory: form.get("quick_manual_category") === "1" && manualClass.category === "", autoMemo: form.get("quick_manual_memo") === "0" && rawText !== "" });
    if (created?.__duplicate_skipped) {
      return redirectResponse(duplicateSkippedReturnLocation(String(transactionDate).slice(0, 7) || month, selected.id));
    }
    return redirectResponse(myReturnLocation(String(transactionDate).slice(0, 7) || month, selected.id, { msg: "created" }));
  } catch (err) {
    rememberOpsEvent({ kind: "save_error", severity: isDatabaseBusyError(err) ? "warn" : "error", path: "/my/transactions", method: "POST", detail: safeError(err) });
    return redirectResponse(myReturnLocation(month, selected.id, { err: userSafeErrorCode(err) }));
  }
}

async function handleMyUpdateTransaction(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(myReturnLocation(month, selected.id, { err: "write_not_allowed" }));
  const row = await getTransactionForUserEdit(env, id, selected.id);
  if (!row) return redirectResponse(myReturnLocation(month, selected.id, { err: "record_not_found" }));
  if (!canManageMyRecord(selected.role, row, userId)) return redirectResponse(myReturnLocation(month, selected.id, { err: "not_my_record" }));
  // V22.9.43: 구성원 권한이 ‘기록만’이면 자기 기록이어도 고치거나 지우지 못한다.
  const policyError = await memberRecordChangeError(env, selected.role, selected.id);
  if (policyError) return redirectResponse(myReturnLocation(month, selected.id, { err: policyError }));
  const transactionDate = String(form.get("transaction_date") || row.transaction_date || formatDate(nowKstDate())).trim();
  const amount = parseMyAmount(form);
  if (!amount || amount <= 0) return redirectResponse(myReturnLocation(month, selected.id, { err: "amount_required" }));
  if (amount > MAX_TRANSACTION_AMOUNT) return redirectResponse(myReturnLocation(month, selected.id, { err: "amount_too_large" }));
  if (!isValidTransactionDateString(transactionDate)) return redirectResponse(myReturnLocation(month, selected.id, { err: "invalid_date" }));
  const members = await fetchHouseholdMembers(env, selected.id);
  const requestedUserId = String(form.get("user_id") || "").trim();
  if (requestedUserId && !activeSpenderExists(members, requestedUserId)) return redirectResponse(myReturnLocation(month, selected.id, { err: "spender_not_member" }));
  const patch = {
    type: normalizeTransactionType(String(form.get("type") || row.type || "expense")),
    transaction_date: transactionDate,
    amount,
    memo: String(form.get("memo") || "").trim(),
    category: String(form.get("category") || "").trim(),
    payment_method: String(form.get("payment_method") || "").trim(),
    user_id: canManageAllRecords(selected.role) && requestedUserId && activeSpenderExists(members, requestedUserId) ? requestedUserId : row.user_id,
  };
  try {
    await updateTransaction(env, id, patch, { householdId: selected.id, actorUserId: userId, actorKind: "user" });
    try {
      await appendTransactionEditHistory(env, selected.id, id, row, { ...row, ...patch }, userId, members);
    } catch (historyError) {
      // The atomic transaction RPC already committed the edit and its database
      // audit. A secondary display-history failure must not tell the user that
      // the transaction itself failed or encourage a duplicate retry.
      rememberOpsEvent({ kind: "transaction_edit_history_save_failed", severity: "warn", path: "/my/update", method: "POST", detail: safeError(historyError) });
    }
    return redirectResponse(myReturnLocation(String(transactionDate).slice(0, 7) || month, selected.id, { msg: "updated" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_record_update_failed", severity: "warn", path: "/my/update", method: "POST", detail: safeError(err) });
    // V22.9.79 D-5: 환불과 연결된 기록의 종류·금액·환급 분류·날짜를 바꾸면 DB 트리거(refund_link_guard_v22979)가 막는다.
    // V22.9.80 T-12: 트리거가 알려 준 이유(종류·금액·환급 분류·날짜)별 코드로 돌려보낸다. 이유를 모르면 refund_link_locked.
    const refundLocked = refundLinkLockedCode(err);
    return redirectResponse(myReturnLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : refundLocked || "record_update_failed" }));
  }
}

async function handleMyDeleteTransaction(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(myReturnLocation(month, selected.id, { err: "write_not_allowed" }));
  const row = await getTransactionForUserEdit(env, id, selected.id);
  if (!row) return redirectResponse(myReturnLocation(month, selected.id, { err: "record_not_found" }));
  if (!canManageMyRecord(selected.role, row, userId)) return redirectResponse(myReturnLocation(month, selected.id, { err: "not_my_record" }));
  // V22.9.43: 구성원 권한이 ‘기록만’이면 자기 기록이어도 고치거나 지우지 못한다.
  const policyError = await memberRecordChangeError(env, selected.role, selected.id);
  if (policyError) return redirectResponse(myReturnLocation(month, selected.id, { err: policyError }));
  try {
    await deleteTransactionWithAudit(env, id, selected.id, { actorUserId: userId, actorKind: "user" });
    return redirectResponse(myReturnLocation(month, selected.id, { msg: "deleted" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_record_delete_failed", severity: "warn", path: "/my/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(myReturnLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "record_delete_failed" }));
  }
}

// V22.9.87 T-16(디자인 작업 지시서, 사용자 결정 2026-10-29): 저장 알림의 ‘실행 취소’. 서버가 서명한 표(readQuickUndoTicket — 이 로그인 사용자 것,
// 60초 안)가 있어야 하고, 지울 기록 번호·가계부는 주소가 아니라 표에서 읽는다. 그다음은 위 /my/delete 와 같은 검사(가계부 쓰기 권한·내 기록이거나
// 소유자·관리자·구성원 ‘기록만’ 정책)이고, 저장한 뒤 바뀐 기록(지문이 다르면)은 지우지 않는다. 같은 출처 검사는 라우터 전역(csrfOriginAllowed)이 한다.
// 감사 기록은 보통 삭제와 같은 actor_kind "user" 다(DB 함수가 받는 값을 늘리지 않는다). 돌아갈 곳은 저장했던 화면(return_to)이고 msg=undone 을 붙인다.
async function handleMyQuickUndo(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = (householdId, extra) => {
    const fallback = `/app?month=${encodeURIComponent(month)}${householdId ? `&household_id=${encodeURIComponent(householdId)}` : ""}`;
    const target = new URL(safeUserReturnPath(String(form.get("return_to") || ""), fallback), "https://accountbook.local");
    for (const key of ["msg", "err", "balert", "saved_rid", "saved_qd", "undo", "quick", "day_detail", "rid"]) target.searchParams.delete(key);
    for (const [key, value] of Object.entries(extra)) target.searchParams.set(key, value);
    return `${target.pathname}${target.search}${target.hash}`;
  };
  const ticket = await readQuickUndoTicket(env, form.get("ticket"), userId);
  if (!ticket) return redirectResponse(back("", { err: "undo_expired" }));
  const { selected } = await getMySelectedHousehold(env, userId, ticket.h);
  if (!selected || String(selected.id) !== String(ticket.h)) return redirectResponse(back("", { err: "undo_expired" }));
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(back(selected.id, { err: "write_not_allowed" }));
  const row = await getTransactionForUserEdit(env, ticket.r, selected.id);
  if (!row) return redirectResponse(back(selected.id, { err: "record_not_found" }));
  if (!canManageMyRecord(selected.role, row, userId)) return redirectResponse(back(selected.id, { err: "not_my_record" }));
  const policyError = await memberRecordChangeError(env, selected.role, selected.id);
  if (policyError) return redirectResponse(back(selected.id, { err: policyError }));
  if (await quickUndoFingerprint(row) !== ticket.f) return redirectResponse(back(selected.id, { err: "undo_changed" }));
  try {
    await deleteTransactionWithAudit(env, row.id, selected.id, { actorUserId: userId, actorKind: "user" });
    return redirectResponse(back(selected.id, { msg: "undone" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_record_undo_failed", severity: "warn", path: "/my/undo", method: "POST", detail: safeError(err) });
    return redirectResponse(back(selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "record_delete_failed" }));
  }
}
// @build:exports-start
export {
  activeSpenderExists, getTransactionForUserEdit, handleMyAddTransaction, handleMyDeleteTransaction,
  handleMyQuickUndo, handleMyUpdateTransaction, memberCanBeSpender, transactionEditHistoryKey,
};
// @build:exports-end
