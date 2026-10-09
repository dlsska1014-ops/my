// @build:imports-start
import {
  duplicateGuardSeconds, isDuplicateGuardSource, rememberDuplicateEvent, rememberOpsEvent,
} from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, operationLeaseOwner, releaseOperationLease,
} from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, fetchTransactionRowById, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { fetchPostgrestRows } from "../data/households-members-rows.js";
import { safeArray } from "../admin/backup-compare.js";
import { findExactDuplicateTransaction } from "../import/csv-duplicates.js";
import { isMissingCategory } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
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
    "처음이라면 ‘시작’을 입력해 가계부 만들기 또는 초대코드 참여부터 진행하세요.",
    "",
    "기록: 점심 12000원 국민카드",
    "조회: 오늘 기록 보기 · 이번 달 요약 · 남은 예산",
    "관리: 예산 설정 · 가계부 전환 · 수정 01번 금액 13000원",
    "내 이름: 내 이름 설정",
    "공유: 초대코드 · 단톡방 연결 ABC123",
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
  return ["🧾 최근 입력 내역", ...lines, "", "오늘 번호로 수정하려면 '오늘 기록 보기'를 보내세요.", "예: 01번 금액 13000원 / 01번 삭제"].join("\n");
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
  const row = sanitizeTransactionBody(body);
  // V22.9.34 proto (B13): a client-chosen UUID v4 becomes the primary key, so a retry hits the PK instead of a time window.
  const requestId = abTransactionRequestId(options.requestId);
  if (requestId) row.id = requestId;
  const source = String(row.source || body.source || "web_admin");
  const dedupSeconds = duplicateGuardSeconds(env, source);
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
        if (found) return { ...found, __reconciled: true };
      }
      throw err;
    }
    const inserted = Array.isArray(created) ? created[0] : created;
    if (inserted) return inserted;
    const existing = await findTransactionForRequest(env, row);
    if (!existing) throw Object.assign(new Error("transaction_request_conflict"), { code: "transaction_request_conflict" });
    return { ...existing, __idempotent_replay: true, __replay_same: sameTransactionCore(existing, row) };
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
      if (dup && row.id && String(dup.id) === row.id) return { ...dup, __idempotent_replay: true, __replay_same: true };
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
  const params = new URLSearchParams({ select: "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,created_at", id: `eq.${row.id}`, household_id: `eq.${row.household_id}`, limit: "1" });
  const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("transaction_request_lookup_invalid");
  return rows[0] || null;
}

function sameTransactionCore(a = {}, b = {}) {
  return String(a.user_id) === String(b.user_id) && String(a.type) === String(b.type) && Number(a.amount) === Number(b.amount) && String(a.transaction_date) === String(b.transaction_date);
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
function sanitizeTransactionBody(body, partial = false) {
  const src = body && typeof body === "object" ? body : {};
  const own = (key) => Object.prototype.hasOwnProperty.call(src, key) ? src[key] : undefined;
  const out = {};
  if (!partial && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(String(own("id") || ""))) out.id = String(own("id"));
  if (!partial || own("household_id")) out.household_id = String(own("household_id") || "");
  if (own("user_id")) out.user_id = String(own("user_id"));
  if (!partial || own("type")) out.type = own("type") === "income" ? "income" : "expense";
  if (!partial || own("amount") !== undefined) out.amount = Math.max(0, Math.round(Number(own("amount") || 0)));
  if (!partial || own("category") !== undefined) out.category = String(own("category") || "").slice(0, 80);
  if (!partial || own("memo") !== undefined) out.memo = String(own("memo") || "").slice(0, 160);
  if (!partial && (!out.category || isMissingCategory(out.category))) out.category = recommendCategory(`${out.memo || ""} ${own("raw_text") || ""} ${own("payment_method") || ""}`, out.type);
  if (!partial && (!out.category || isMissingCategory(out.category))) out.category = out.type === "income" ? "기타수입" : "기타지출";
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
    `지출: ${numberWithCommas(summary.totals.expense)}원`,
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
// @build:exports-start
export {
  abTransactionRequestId, bulkTransactionsAtomic, calculateStats, calendarDaysFromRows,
  createManualTransaction, deleteTransactionWithAudit, escapeHtml, formatRecentTransactions,
  formatSummary, getCalendar, getMonthSummary, getStats, helpText, jsonForInlineScript, linkText,
  listTransactions, makeInviteCode, nextMonthStart, numberWithCommas, updateTransaction,
};
// @build:exports-end
