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
import { fetchHouseholdMembers, memberNameMap } from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { verifyUserSession } from "../auth/user-session.js";
import {
  canManageMyRecord, canWriteMyHousehold, getMySelectedHousehold, myReturnLocation,
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
  const out = {};
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
    const created = await createManualTransaction(env, body);
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
    return redirectResponse(myReturnLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "record_update_failed" }));
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
  try {
    await deleteTransactionWithAudit(env, id, selected.id, { actorUserId: userId, actorKind: "user" });
    return redirectResponse(myReturnLocation(month, selected.id, { msg: "deleted" }));
  } catch (err) {
    rememberOpsEvent({ kind: "my_record_delete_failed", severity: "warn", path: "/my/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(myReturnLocation(month, selected.id, { err: isUncertainStorageWrite(err) ? "db_write_unknown" : "record_delete_failed" }));
  }
}
// @build:exports-start
export {
  activeSpenderExists, getTransactionForUserEdit, handleMyAddTransaction, handleMyDeleteTransaction,
  handleMyUpdateTransaction, memberCanBeSpender, transactionEditHistoryKey,
};
// @build:exports-end
