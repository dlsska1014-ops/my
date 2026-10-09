// @build:imports-start
import { appName } from "../public/site-config.js";
import { constantTimeTextEqual, jsonResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, fetchTransactionRowById, fetchTransactionRowsByIds,
  isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { fetchHouseholdMembers } from "../data/households-members-rows.js";
import { activeSpenderExists } from "../my/transactions.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import {
  bulkTransactionsAtomic, createManualTransaction, deleteTransactionWithAudit, getCalendar,
  getStats, listTransactions, numberWithCommas, updateTransaction,
} from "../domain/transactions-core.js";
// @build:imports-end

async function handleApi(request, env, url) {
  if (!isAdmin(request, env) && !(await verifyAdminSession(request, env))) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }

  const method = request.method;
  const path = url.pathname;

  if (path === "/api/bootstrap" && method === "GET") {
    const households = await supabase(env, "/rest/v1/households?select=id,name,invite_code,created_at&order=created_at.asc", { method: "GET" }) || [];
    const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
    const householdId = url.searchParams.get("household_id") || "";
    const defaultHouseholdId = households[0]?.id || "";
    const stats = await getStats(env, householdId, month);
    return jsonResponse({ ok: true, app: appName(env), month, selected_household_id: householdId, default_household_id: defaultHouseholdId, households, summary: { total_balance: stats.totals.balance, month_income: stats.totals.income, month_expense: stats.totals.expense }, stats });
  }

  if (path === "/api/transactions" && method === "GET") {
    return listTransactions(env, url);
  }

  if (path === "/api/transactions" && method === "POST") {
    const parsed = await readAdminApiJson(request);
    if (!parsed.ok) return parsed.response;
    const invalid = validateAdminApiTransactionBody(parsed.body, false);
    if (invalid) return invalid;
    const body = normalizeApiTransactionBody(parsed.body);
    const members = await fetchHouseholdMembers(env, body.household_id);
    if (!activeSpenderExists(members, body.user_id)) return jsonResponse({ ok: false, error: "spender_not_household_member", reason: "spender_not_household_member", message: "선택한 지출자가 이 가계부의 활성 참여자가 아닙니다." }, 400);
    const created = await createManualTransaction(env, body);
    return jsonResponse({ ok: true, item: created });
  }

  if (path === "/api/transactions/batch" && method === "PATCH") {
    const parsed = await readAdminApiJson(request);
    if (!parsed.ok) return parsed.response;
    const body = parsed.body;
    const ids = [...new Set((body.ids || []).map((x) => String(x || "").trim()).filter(Boolean))];
    if (!ids.length) return jsonResponse({ ok: false, error: "ids_required", reason: "ids_required", message: "처리할 기록을 먼저 선택해 주세요." }, 400);
    if (ids.length > 500) return jsonResponse({ ok: false, error: "too_many_ids", reason: "too_many_ids", message: "한 번에 최대 500건까지 처리할 수 있습니다." }, 400);
    const invalid = validateAdminApiTransactionBody(body, true);
    if (invalid) return invalid;
    const patch = normalizeApiTransactionBody(body, true);
    if (!Object.keys(patch).length) return jsonResponse({ ok: false, error: "empty_patch", reason: "empty_patch", message: "변경할 내용이 없습니다." }, 400);
    const targets = await fetchTransactionRowsByIds(env, ids);
    const householdIds = [...new Set(targets.map((row) => String(row.household_id || "")).filter(Boolean))];
    if (targets.length !== ids.length || householdIds.length !== 1) return jsonResponse({ ok: false, error: "household_scope_mismatch", reason: "household_scope_mismatch", message: "다른 가계부의 기록이 섞여 있어 처리할 수 없습니다." }, 409);
    if (patch.user_id) {
      const members = await fetchHouseholdMembers(env, householdIds[0]);
      if (!activeSpenderExists(members, patch.user_id)) return jsonResponse({ ok: false, error: "spender_not_household_member", reason: "spender_not_household_member", message: "선택한 지출자가 이 가계부의 활성 참여자가 아닙니다." }, 400);
    }
    await bulkTransactionsAtomic(env, ids, householdIds[0], patch, { actorKind: "admin_api_bulk" });
    return jsonResponse({ ok: true, updatedCount: ids.length });
  }

  const txMatch = path.match(/^\/api\/transactions\/([0-9a-fA-F-]{32,36})$/);
  if (txMatch && method === "PATCH") {
    const parsed = await readAdminApiJson(request);
    if (!parsed.ok) return parsed.response;
    const invalid = validateAdminApiTransactionBody(parsed.body, true);
    if (invalid) return invalid;
    const body = normalizeApiTransactionBody(parsed.body, true);
    if (!Object.keys(body).length) return jsonResponse({ ok: false, error: "empty_patch", reason: "empty_patch", message: "변경할 내용이 없습니다." }, 400);
    const target = await fetchTransactionRowById(env, txMatch[1]);
    if (!target) return jsonResponse({ ok: false, error: "not_found", reason: "not_found", message: "요청한 내용을 찾지 못했습니다." }, 404);
    if (body.user_id) {
      const members = await fetchHouseholdMembers(env, target.household_id);
      if (!activeSpenderExists(members, body.user_id)) return jsonResponse({ ok: false, error: "spender_not_household_member", reason: "spender_not_household_member", message: "선택한 지출자가 이 가계부의 활성 참여자가 아닙니다." }, 400);
    }
    const updated = await updateTransaction(env, txMatch[1], body, { householdId: target.household_id, actorKind: "admin_api" });
    return jsonResponse({ ok: true, item: updated });
  }

  if (txMatch && method === "DELETE") {
    const target = await fetchTransactionRowById(env, txMatch[1]);
    if (!target) return jsonResponse({ ok: false, error: "not_found", reason: "not_found", message: "요청한 내용을 찾지 못했습니다." }, 404);
    await deleteTransactionWithAudit(env, txMatch[1], target.household_id, { actorKind: "admin_api" });
    return jsonResponse({ ok: true });
  }

  if (path === "/api/stats" && method === "GET") {
    const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
    const householdId = url.searchParams.get("household_id") || "";
    const stats = await getStats(env, householdId, month);
    return jsonResponse({ ok: true, month, ...stats });
  }

  if (path === "/api/calendar" && method === "GET") {
    const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
    const householdId = url.searchParams.get("household_id") || "";
    const calendar = await getCalendar(env, householdId, month);
    return jsonResponse({ ok: true, month, days: calendar });
  }

  return jsonResponse({ ok: false, error: "api_not_found", reason: "api_not_found", message: "요청한 API를 찾지 못했습니다." }, 404);
}

function normalizeApiTransactionBody(body = {}, partial = false) {
  const out = Object.create(null);
  const map = {
    household_id: body.household_id,
    user_id: body.user_id,
    type: body.type,
    amount: body.amount,
    category: body.category,
    memo: body.memo ?? body.description,
    payment_method: body.payment_method ?? body.method,
    transaction_date: body.transaction_date ?? body.date,
    source: body.source || "ledger_live",
  };
  for (const [k, v] of Object.entries(map)) {
    if (partial && (v === undefined || v === null || v === "")) continue;
    out[k] = v;
  }
  return out;
}

async function readAdminApiJson(request) {
  const text = await request.text();
  if (!text.trim()) return { ok: false, response: jsonResponse({ ok: false, error: "json_required", reason: "json_required", message: "JSON 요청 본문이 필요합니다." }, 400) };
  try {
    const body = JSON.parse(text);
    if (!body || Array.isArray(body) || typeof body !== "object") throw new Error("json_object_required");
    return { ok: true, body };
  } catch (err) {
    return { ok: false, response: jsonResponse({ ok: false, error: "invalid_json", reason: "invalid_json", message: "올바른 JSON 객체를 보내 주세요." }, 400) };
  }
}

function validateAdminApiTransactionBody(body = {}, partial = false) {
  if (!partial && !String(body.household_id || "").trim()) return jsonResponse({ ok: false, error: "household_required", reason: "household_required", message: "가계부 ID가 필요합니다." }, 400);
  if (!partial && !String(body.user_id || "").trim()) return jsonResponse({ ok: false, error: "spender_required", reason: "spender_required", message: "지출자 ID가 필요합니다." }, 400);
  if (partial && (Object.hasOwn(body, "household_id") || Object.hasOwn(body, "source"))) return jsonResponse({ ok: false, error: "immutable_field", reason: "immutable_field", message: "수정 요청에서 가계부와 원본 출처는 변경할 수 없습니다." }, 400);
  if ((!partial || Object.hasOwn(body, "type")) && !["expense", "income"].includes(String(body.type || ""))) return jsonResponse({ ok: false, error: "invalid_type", reason: "invalid_type", message: "구분은 expense 또는 income이어야 합니다." }, 400);
  if (!partial || Object.hasOwn(body, "amount")) {
    const amount = Number(body.amount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount < 1 || amount > MAX_TRANSACTION_AMOUNT) return jsonResponse({ ok: false, error: "invalid_amount", reason: "invalid_amount", message: `금액은 1원 이상 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원 이하의 정수여야 합니다.` }, 400);
  }
  const date = body.transaction_date ?? body.date;
  if ((!partial || date !== undefined) && !isValidTransactionDateString(String(date || ""))) return jsonResponse({ ok: false, error: "invalid_date", reason: "invalid_date", message: "날짜는 실제 존재하는 YYYY-MM-DD 형식이어야 합니다." }, 400);
  return null;
}

function isAdmin(request, env) {
  const expected = String(env.ADMIN_API_TOKEN || "").trim();
  if (!expected) return false;
  const auth = request.headers.get("authorization") || "";
  return constantTimeTextEqual(auth, `Bearer ${expected}`);
}

async function readJson(request) {
  const text = await request.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch (_) {
    return {};
  }
}
// @build:exports-start
export { handleApi, readJson };
// @build:exports-end
