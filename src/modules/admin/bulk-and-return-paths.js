// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  fetchTransactionRowsByIds, isValidTransactionDateString, transactionReturnFallback,
} from "./transactions-households.js";
import { fetchHouseholdMembers } from "../data/households-members-rows.js";
import { activeSpenderExists } from "../my/transactions.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { bulkTransactionsAtomic } from "../domain/transactions-core.js";
// @build:imports-end

async function handleAdminBulkUpdate(request, env) {
  let form = null;
  let month = currentMonthKst();
  let householdId = "";
  try {
    if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
    form = await request.formData();
    const ids = [...new Set(form.getAll("ids").map((x) => String(x || "").trim()).filter(Boolean))];
    month = validMonth(String(form.get("month") || "")) || currentMonthKst();
    householdId = String(form.get("household_id") || "").trim();

    if (!ids.length) {
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "선택된 거래가 없습니다." }), { err: "선택된 거래가 없습니다." }));
    }
    if (!householdId) {
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "가계부를 먼저 선택하세요." }), { err: "가계부를 먼저 선택하세요." }));
    }
    const targets = await fetchTransactionRowsByIds(env, ids);
    if (targets.length !== ids.length || targets.some((row) => String(row.household_id || "") !== householdId)) {
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "선택 거래에 다른 가계부 기록이 섞여 있어 작업을 취소했습니다." }), { err: "선택 거래에 다른 가계부 기록이 섞여 있어 작업을 취소했습니다." }));
    }

    if (String(form.get("bulk_delete") || "") === "1") {
      await bulkTransactionsAtomic(env, ids, householdId, {}, { actorKind: "admin_bulk", delete: true });
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg: "bulk_deleted" }), { msg: `${ids.length}건 삭제 완료` }));
    }

    const patch = {};
    const bulkType = String(form.get("bulk_quick_type") || form.get("bulk_type") || "").trim();
    const category = String(form.get("bulk_category") || "").trim();
    const payment = String(form.get("bulk_payment_method") || "").trim();
    const date = String(form.get("bulk_transaction_date") || "").trim();
    const userId = String(form.get("bulk_user_id") || "").trim();
    if (bulkType === "income" || bulkType === "expense") patch.type = bulkType;
    if (category) patch.category = category;
    if (payment || String(form.get("clear_payment_method") || "") === "1") patch.payment_method = payment;
    if (date) {
      if (!isValidTransactionDateString(date)) {
        return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "날짜 형식이 올바르지 않습니다." }), { err: "날짜 형식이 올바르지 않습니다." }));
      }
      patch.transaction_date = date;
    }
    if (userId) {
      const members = await fetchHouseholdMembers(env, householdId);
      if (!activeSpenderExists(members, userId)) {
        return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "선택한 지출자가 이 가계부의 참여자가 아닙니다." }), { err: "선택한 지출자가 이 가계부의 참여자가 아닙니다." }));
      }
      patch.user_id = userId;
    }

    if (!Object.keys(patch).length) {
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "변경할 값이 없습니다." }), { err: "변경할 값이 없습니다." }));
    }

    await bulkTransactionsAtomic(env, ids, householdId, patch, { actorKind: "admin_bulk" });
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg: "bulk_updated" }), { msg: `${ids.length}건 일괄 수정 완료` }));
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_bulk_update_failed", severity: "warn", path: "/admin/transactions/bulk", method: "POST", detail: safeError(err) });
    const message = "선택한 거래내역을 수정하지 못했습니다. 기존 기록은 유지됩니다.";
    const fallback = transactionReturnFallback(month, householdId, { err: message });
    return redirectResponse(form ? returnLocation(form, fallback, { err: message }) : fallback);
  }
}

async function bulkDeleteTransactions(env, ids) {
  const cleanIds = [...new Set((ids || []).map((id) => String(id || "").trim()).filter((id) => /^[0-9a-fA-F-]{20,80}$/.test(id)))];
  if (!cleanIds.length) return { deleted: 0, failed: ids.length, error: "삭제 가능한 거래 ID가 없습니다." };

  let deleted = 0;
  let failed = 0;
  let lastError = "";

  for (let i = 0; i < cleanIds.length; i += 80) {
    const chunk = cleanIds.slice(i, i + 80);
    const params = new URLSearchParams();
    params.set("id", `in.(${chunk.join(",")})`);
    try {
      await supabase(env, `/rest/v1/transactions?${params.toString()}`, {
        method: "DELETE",
        headers: { Prefer: "return=minimal" },
      });
      deleted += chunk.length;
    } catch (err) {
      lastError = safeError(err);
      for (const id of chunk) {
        try {
          await supabase(env, `/rest/v1/transactions?id=eq.${encodeURIComponent(id)}`, {
            method: "DELETE",
            headers: { Prefer: "return=minimal" },
          });
          deleted += 1;
        } catch (innerErr) {
          failed += 1;
          lastError = safeError(innerErr);
        }
      }
    }
  }
  return { deleted, failed, error: lastError };
}

function returnLocation(form, fallback, extra = {}) {
  const raw = String(form.get("return_to") || "");
  let path = raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : fallback;
  if (Object.keys(extra).length) {
    const u = new URL(path, "https://dummy.local");
    for (const [k, v] of Object.entries(extra)) if (v !== undefined && v !== null && String(v) !== "") u.searchParams.set(k, String(v));
    path = u.pathname + u.search + u.hash;
  }
  return path;
}

function safeUserReturnPath(raw = "", fallback = "/my/households") {
  const value = String(raw || "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || /[\\\r\n]/.test(value)) return fallback;
  let parsed;
  try { parsed = new URL(value, "https://accountbook.local"); }
  catch (err) { return fallback; }
  const allowed = [
    "/my", "/app", "/menu", "/budgets", "/settlement-summary", "/keyword-guide",
    "/reserve-plans", "/budget-alerts", "/meeting-households", "/household-create-join",
  ];
  const ok = allowed.some((prefix) => parsed.pathname === prefix || parsed.pathname.startsWith(prefix + "/"));
  return ok ? `${parsed.pathname}${parsed.search}${parsed.hash}` : fallback;
}
// @build:exports-start
export { handleAdminBulkUpdate, returnLocation, safeUserReturnPath };
// @build:exports-end
