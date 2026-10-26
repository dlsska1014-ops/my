// @build:imports-start
import { envFlagEnabled } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { safeArray } from "../admin/backup-compare.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { numberWithCommas } from "./transactions-core.js";
// @build:imports-end
// V22.9.79 V44 D-5·V76 M-7: 환불 연결 계산(요청 없음). 연결은 accountbook_refund_links 표(검토용 SQL
// migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql)에 있고, 읽기·쓰기는 features/settlement-refund-links.js 가 한다.
// 기능 플래그 REFUND_LINKS_ENABLED 가 꺼져 있으면(기본) 어느 화면도 이 계산을 부르지 않는다.
// 규칙(변경안 docs/codex/PROPOSAL_REFUND_LINKS_V22_9_78.md ‘계산’, 2026-10-25 운영자 답 4~8):
//   - 원지출과 명시적으로 연결한 환불(분류 ‘환급’ 수입)만 뺀다. 연결하지 않은 환급은 지금처럼 수입이다.
//   - 차감은 환불이 들어온 달(환급 날짜)에 원지출의 분류·지출자로 잡는다. 수입도 연결한 몫만큼 줄어 잔액은 그대로다.
//   - 정산은 그 달 총액에서 빼고, 받은 사람(환급 행 user_id)이 낸 돈에서 뺀다.
//   - 원지출은 환급 날짜보다 늦지 않고 365일 전까지의 지출만 고를 수 있다.
// 연결 행(normalizeRefundLinkRows 가 만드는 평평한 모양, W-7 월말 예상도 이 모양을 받는다):
//   { id, expense_id, refund_id, amount, recipient_user_id, refund_date, refund_amount,
//     expense_date, expense_category, expense_user_id, expense_amount, expense_memo, created_at }
// 원지출을 읽지 않은 경로(카카오 정산)는 지난달 원지출의 expense_* 칸이 비어 있다. 정산 계산은 expense_id 만 쓴다.

const REFUND_LINK_CATEGORY = "환급";
const REFUND_LINK_LOOKBACK_DAYS = 365;

function refundLinksEnabled(env = {}) {
  return envFlagEnabled(env?.REFUND_LINKS_ENABLED, false);
}

function isRefundIncomeRow(row = {}) {
  return row?.type === "income" && String(row?.category ?? "") === REFUND_LINK_CATEGORY;
}

// 환급을 받은 사람이 될 수 있는 구성원(정산 참여자: 차단·승인 대기가 아닌 사람). SQL 의 받은 사람 확인과 같다.
function refundRecipientEligible(member = {}) {
  return Boolean(member?.user_id) && ["owner", "admin", "member", "viewer"].includes(String(member?.role || "member").toLowerCase());
}

function refundLinkPositiveAmount(value) {
  const amount = Number(value);
  return Number.isSafeInteger(amount) && amount > 0 && amount <= MAX_TRANSACTION_AMOUNT ? amount : 0;
}

// 날짜만 있는 값이라 UTC 로 더해도 달력 날짜가 같다(SQL 의 date - 365 와 같은 값).
function refundLinkWindowStart(refundDate = "") {
  const ymd = String(refundDate || "").slice(0, 10);
  if (!isValidTransactionDateString(ymd)) return "";
  return new Date(Date.parse(`${ymd}T00:00:00Z`) - REFUND_LINK_LOOKBACK_DAYS * 86400000).toISOString().slice(0, 10);
}

function refundLinkDateAllowed(expenseDate = "", refundDate = "") {
  const expense = String(expenseDate || "").slice(0, 10);
  const refund = String(refundDate || "").slice(0, 10);
  if (!isValidTransactionDateString(expense) || !isValidTransactionDateString(refund)) return false;
  return expense <= refund && expense >= refundLinkWindowStart(refund);
}

// 표에서 읽은 연결을 그 달 환급 행·원지출 행과 맞춰 평평한 모양으로 만든다. 환급 행이 이 목록에 없거나 환급이 아니면,
// 받은 사람이 없으면, 금액이 맞지 않으면 버린다(트리거가 막는 상태라 정상이면 생기지 않는다).
function normalizeRefundLinkRows(rawLinks = [], { householdId = "", refundRowsById = new Map(), expenseRowsById = new Map() } = {}) {
  const out = [];
  const seen = new Set();
  for (const link of safeArray(rawLinks)) {
    const id = String(link?.id || "").trim();
    const refundId = String(link?.refund_id || "").trim();
    const expenseId = String(link?.expense_id || "").trim();
    const amount = refundLinkPositiveAmount(link?.amount);
    if (!id || seen.has(id) || !refundId || !expenseId || refundId === expenseId || !amount) continue;
    if (householdId && link?.household_id && String(link.household_id) !== String(householdId)) continue;
    const refund = refundRowsById.get(refundId);
    const recipient = String(refund?.user_id || "").trim();
    if (!refund || !isRefundIncomeRow(refund) || !recipient) continue;
    const expense = expenseRowsById.get(expenseId) || null;
    if (expense && (expense.type !== "expense" || (householdId && String(expense.household_id || householdId) !== String(householdId)))) continue;
    seen.add(id);
    out.push({
      id, expense_id: expenseId, refund_id: refundId, amount, recipient_user_id: recipient,
      refund_date: String(refund.transaction_date || "").slice(0, 10),
      refund_amount: Math.round(Number(refund.amount || 0)),
      expense_date: expense ? String(expense.transaction_date || "").slice(0, 10) : "",
      expense_category: expense ? String(expense.category || "") : "",
      expense_user_id: expense ? String(expense.user_id || "").trim() : "",
      expense_amount: expense ? Math.round(Number(expense.amount || 0)) : 0,
      expense_memo: expense ? String(expense.memo || expense.raw_text || "") : "",
      created_at: String(link?.created_at || ""),
    });
  }
  return out.sort((a, b) => a.refund_date.localeCompare(b.refund_date) || a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}

// buildSettlementModel 의 refundNetting 옵션 모양. 연결이 없으면 null(정산은 지금과 같다).
function refundSettlementNetting(links = []) {
  const byExpense = new Map();
  const received = new Map();
  let total = 0;
  for (const link of safeArray(links)) {
    const amount = refundLinkPositiveAmount(link?.amount);
    const recipient = String(link?.recipient_user_id || "").trim();
    if (!amount || !recipient || !link?.expense_id) continue;
    byExpense.set(String(link.expense_id), (byExpense.get(String(link.expense_id)) || 0) + amount);
    received.set(recipient, (received.get(recipient) || 0) + amount);
    total += amount;
  }
  return total ? { byExpense, received, total } : null;
}

// 그 달 환급 행마다 연결 상태. 남은 금액이 있고 ‘수입으로 두기’를 하지 않은 환급이 확인 대상이다(운영자 답 7: 분류는 그대로).
function buildRefundReviewItems(refundRows = [], links = [], kept = new Set()) {
  const byRefund = new Map();
  for (const link of safeArray(links)) {
    if (!byRefund.has(link.refund_id)) byRefund.set(link.refund_id, []);
    byRefund.get(link.refund_id).push(link);
  }
  return safeArray(refundRows).filter(isRefundIncomeRow).map((row) => {
    const id = String(row.id || "");
    const rowLinks = byRefund.get(id) || [];
    const amount = Math.max(0, Math.round(Number(row.amount || 0)));
    const linked = rowLinks.reduce((sum, link) => sum + link.amount, 0);
    const remaining = Math.max(0, amount - linked);
    const isKept = kept.has(id);
    return { row, id, amount, linked, remaining, links: rowLinks, kept: isKept, needsReview: remaining > 0 && !isKept };
  }).sort((a, b) => String(a.row.transaction_date || "").localeCompare(String(b.row.transaction_date || "")) || a.id.localeCompare(b.id));
}

// V22.9.79 W-7 연결점: 달마다 환불 차감. 키는 환급 날짜의 달(YYYY-MM)이고, 원지출의 분류·지출자와 받은 사람별로 나눈다.
// 맵은 모두 원형 없는 객체다(분류 이름이 키가 된다). 원지출을 읽지 않은 연결은 분류·지출자가 "" 로 모인다.
function refundDeductionsByMonth(links = []) {
  const months = Object.create(null);
  for (const link of safeArray(links)) {
    const month = String(link?.refund_date || "").slice(0, 7);
    const amount = refundLinkPositiveAmount(link?.amount);
    if (!/^\d{4}-\d{2}$/.test(month) || !amount) continue;
    if (!months[month]) months[month] = { month, total: 0, count: 0, byCategory: Object.create(null), bySpender: Object.create(null), byRecipient: Object.create(null) };
    const bucket = months[month];
    const category = String(link.expense_category || "");
    const spender = String(link.expense_user_id || "");
    const recipient = String(link.recipient_user_id || "");
    bucket.total += amount;
    bucket.count += 1;
    bucket.byCategory[category] = (bucket.byCategory[category] || 0) + amount;
    bucket.bySpender[spender] = (bucket.bySpender[spender] || 0) + amount;
    bucket.byRecipient[recipient] = (bucket.byRecipient[recipient] || 0) + amount;
  }
  return months;
}

// 차감 행: 환급 날짜에 원지출의 분류·지출자로 잡는 음수 지출. 기록 합계에는 넣고, 속도(하루 평균) 계산에서는 뺀다(W-7 변경안 6).
// source 가 "refund_link" 라 다른 계산이 골라낼 수 있다.
function refundLinkDeductionRows(links = []) {
  return safeArray(links).filter((link) => refundLinkPositiveAmount(link?.amount) && isValidTransactionDateString(link?.refund_date)).map((link) => ({
    id: `refund-link:${link.id}`,
    user_id: String(link.expense_user_id || ""),
    type: "expense",
    amount: -refundLinkPositiveAmount(link.amount),
    category: String(link.expense_category || ""),
    memo: link.expense_memo ? `환불 차감 · ${link.expense_memo}` : "환불 차감",
    payment_method: "",
    transaction_date: link.refund_date,
    source: "refund_link",
    refund_link_id: link.id,
    expense_id: link.expense_id,
    refund_id: link.refund_id,
  }));
}

// 그 달 행에 차감을 반영한 목록: 연결한 몫만큼 환급(수입) 행을 줄이고(다 연결되면 뺀다) 차감 행을 더한다.
// 지출 합계는 −L, 수입 합계는 −L, 잔액은 그대로다. 기록 목록 화면에는 쓰지 않는다(합계·분류·예산 계산용).
function applyRefundLinkNetting(rows = [], links = []) {
  const present = new Set(safeArray(rows).map((row) => String(row?.id || "")));
  const monthLinks = safeArray(links).filter((link) => present.has(String(link?.refund_id || "")) && refundLinkPositiveAmount(link?.amount));
  const linkedByRefund = new Map();
  for (const link of monthLinks) linkedByRefund.set(link.refund_id, (linkedByRefund.get(link.refund_id) || 0) + link.amount);
  const out = [];
  for (const row of safeArray(rows)) {
    const linked = linkedByRefund.get(String(row?.id || "")) || 0;
    if (!linked || !isRefundIncomeRow(row)) { out.push(row); continue; }
    const rest = Math.round(Number(row.amount || 0)) - linked;
    if (rest > 0) out.push({ ...row, amount: rest, refund_linked_amount: linked });
  }
  const deductions = refundLinkDeductionRows(monthLinks);
  return { rows: [...out, ...deductions], deductions, total: deductions.reduce((sum, row) => sum - row.amount, 0) };
}

function normalizeRefundMemo(text = "") {
  return String(text || "").toLowerCase()
    .replace(/부분\s*환불|환불|환급|취소|반품|주문|결제|구매/g, "")
    .replace(/[\s·.,:;!?~'"()[\]{}<>/\\|_+=*&^%$#@-]+/g, "");
}

// 원래 지출 후보: 같은 가계부의 지출(쓴 사람 있음), 환급 날짜 이하·365일 안.
// 같은 내용 → 같은 결제수단 → 남은 환급액 이상 → 가까운 날짜 순.
function rankRefundCandidates(refund = {}, expenses = [], { remaining = 0 } = {}) {
  const refundDate = String(refund?.transaction_date || "").slice(0, 10);
  const memo = normalizeRefundMemo(refund?.memo || refund?.raw_text || "");
  const payment = String(refund?.payment_method || "").trim();
  const need = Math.max(0, Number(remaining) || 0);
  return safeArray(expenses)
    .filter((row) => row && row.type === "expense" && String(row.id || "") && String(row.id) !== String(refund?.id || "")
      && String(row.user_id || "").trim() && refundLinkPositiveAmount(row.amount) && refundLinkDateAllowed(row.transaction_date, refundDate))
    .map((row) => {
      const rowMemo = normalizeRefundMemo(row.memo || row.raw_text || "");
      const sameMemo = memo && rowMemo ? (memo === rowMemo ? 2 : memo.includes(rowMemo) || rowMemo.includes(memo) ? 1 : 0) : 0;
      const samePayment = payment && String(row.payment_method || "").trim() === payment ? 1 : 0;
      const covers = Number(row.amount) >= need ? 1 : 0;
      return { row, rank: [sameMemo, samePayment, covers] };
    })
    .sort((a, b) => b.rank[0] - a.rank[0] || b.rank[1] - a.rank[1] || b.rank[2] - a.rank[2]
      || String(b.row.transaction_date || "").localeCompare(String(a.row.transaction_date || ""))
      || Number(b.row.amount) - Number(a.row.amount) || String(a.row.id).localeCompare(String(b.row.id)))
    .map((item) => item.row);
}

// 표·RPC 가 아직 없을 때(404 + PGRST205 표 없음 · PGRST202 함수 없음, 옛 PostgREST 의 42P01·42883).
function isRefundLinksAbsentError(error) {
  const raw = safeError(error);
  return /Supabase 404\b/.test(raw) && /PGRST205|PGRST202|42P01|42883/.test(raw);
}

const REFUND_LINK_MESSAGES = Object.freeze({
  refund_linked: "원래 지출과 연결했어요. 이 정산과 지출 합계에서 그 금액을 뺐어요.",
  refund_unlinked: "연결을 풀었어요. 이 환급은 다시 확인 대상이에요.",
  refund_kept: "수입으로 두었어요. 분류는 그대로이고 확인 대상에서만 뺐어요.",
  refund_unkept: "다시 확인 대상으로 돌렸어요.",
  refund_link_unavailable: "환불 연결 기능을 아직 쓸 수 없어요. 아무것도 바꾸지 않았어요.",
  refund_link_permission_denied: "소유자·관리자만 환불을 연결하거나 풀 수 있어요.",
  refund_link_month_completed: "정산을 완료한 달의 환급은 연결하거나 풀 수 없어요. 완료 이력은 그대로예요.",
  refund_link_amount_exceeded: "연결 금액이 남은 환급액이나 원래 지출의 남은 금액보다 커요. 아무것도 바꾸지 않았어요.",
  refund_link_amount_invalid: "연결 금액을 확인해 주세요. 1원 이상, 기록 금액 이하만 연결할 수 있어요.",
  refund_link_source_changed: "화면을 연 뒤 기록이나 연결이 바뀌어 저장하지 않았어요. 다시 열어 확인해 주세요.",
  refund_link_window: "원래 지출은 환급 날짜 기준 365일 안의 기록만 고를 수 있어요.",
  refund_link_date_order: "원래 지출은 환급 날짜보다 늦을 수 없어요.",
  refund_link_kind_invalid: "분류가 ‘환급’인 수입과 지출 기록만 연결할 수 있어요.",
  refund_link_spender_required: "원래 지출에 쓴 사람이 없어 연결할 수 없어요. 기록에서 쓴 사람을 먼저 정해 주세요.",
  refund_link_recipient_required: "환급 기록에 받은 사람을 먼저 정해 주세요.",
  refund_link_recipient_invalid: "환급을 받은 사람이 이 가계부의 정산 참여자가 아니에요. 환급 기록의 받은 사람을 먼저 바꿔 주세요.",
  refund_link_duplicate: "이미 연결한 두 기록이에요. 금액을 바꾸려면 연결을 풀고 다시 연결해 주세요.",
  refund_link_not_found: "연결을 찾지 못했어요. 이미 풀렸거나 기록이 지워졌을 수 있어요.",
  refund_link_record_not_found: "연결할 기록을 찾지 못했어요. 이미 지워졌거나 이 가계부의 기록이 아니에요.",
  refund_link_history_invalid: "정산 완료 이력을 읽지 못해 바꾸지 않았어요. 잠시 후 다시 시도해 주세요.",
  refund_link_input_invalid: "연결할 기록을 다시 골라 주세요. 아무것도 바꾸지 않았어요.",
  refund_link_busy: "다른 정산 저장이 진행 중이에요. 잠시 후 한 번만 다시 시도해 주세요.",
  refund_link_unknown: "연결 결과를 확인하지 못했어요. 정산 화면을 새로 열어 바뀌었는지 먼저 확인해 주세요.",
  refund_link_failed: "환불 연결을 저장하지 못했어요. 기존 기록과 연결은 그대로예요.",
});

function refundLinkMessage(code = "") {
  return Object.prototype.hasOwnProperty.call(REFUND_LINK_MESSAGES, code) ? REFUND_LINK_MESSAGES[code] : "";
}

function refundLinkErrorCode(error) {
  const raw = safeError(error);
  if (isRefundLinksAbsentError(error)) return "refund_link_unavailable";
  if (/settings_rmw_busy/.test(raw)) return "refund_link_busy";
  if (isUncertainStorageWrite(error)) return "refund_link_unknown";
  const code = raw.match(/\brefund_link_[a-z_]+/)?.[0] || "";
  return refundLinkMessage(code) ? code : "refund_link_failed";
}

// V22.9.80 T-12: 연결 보호 트리거(refund_link_guard_v22979)가 막은 수정. 트리거 오류 문구는 refund_link_locked_<이유>
// (kind·amount·category·date)다. 표가 있으면 트리거도 있으므로 플래그와 상관없이 알아본다. 모르는 이유는 "locked".
const REFUND_LINK_LOCK_REASONS = Object.freeze(["kind", "amount", "category", "date"]);
const REFUND_LINK_LOCK_TEXTS = Object.freeze({
  kind: "환불과 연결된 기록은 수입·지출 구분이나 가계부를 바꿀 수 없어요.",
  amount: "금액은 연결한 환불 금액보다 작게 바꿀 수 없어요.",
  category: "연결된 환급 기록은 분류를 바꿀 수 없어요.",
  date: "이 날짜로 옮기면 원래 지출이 환급보다 늦어지거나 둘 사이가 365일을 넘어요.",
});

function refundLinkLockedReason(error) {
  const match = safeError(error).match(/\brefund_link_locked(?:_([a-z]+))?/);
  if (!match) return "";
  return REFUND_LINK_LOCK_REASONS.includes(match[1] || "") ? match[1] : "locked";
}

// 웹 화면 주소의 err 코드(formatMessage 표에 있다). 잠금이 아니면 "".
function refundLinkLockedCode(error) {
  const reason = refundLinkLockedReason(error);
  return !reason ? "" : reason === "locked" ? "refund_link_locked" : `refund_link_locked_${reason}`;
}

function refundLinkLockedText(reason = "") {
  return Object.prototype.hasOwnProperty.call(REFUND_LINK_LOCK_TEXTS, reason) ? REFUND_LINK_LOCK_TEXTS[reason] : "";
}

// 카카오 ‘수정 NN번’ 답장. 예전에는 ‘잠시 후 다시 보내 주세요’였다 — 다시 보내도 같은 이유로 막힌다.
function refundLinkLockedKakaoText(entryNo = "", reason = "") {
  const why = refundLinkLockedText(reason);
  return `${entryNo}번 기록은 환불과 연결돼 있어 바꾸지 않았어요. 기록은 그대로예요.${why ? `\n${why}` : ""}\n연결은 소유자·관리자가 웹 정산 화면의 ‘환불·환급’에서 풀 수 있어요.`;
}

// V22.9.80 T-12: 일괄 수정에서 트리거가 막을 행을 고른다(트리거와 같은 규칙). links 는 표 행 [{ expense_id, refund_id, amount }],
// rowsById 는 고른 행과 연결 상대 행(household_id·type·amount·category·transaction_date). 연결 상대도 같은 일괄 수정에
// 들어 있으면 상대가 먼저 바뀔지 나중에 바뀔지 모르므로(트리거는 행마다 본다) 상대의 지금 날짜와 새 날짜를 모두 견준다.
// 행을 읽지 못한 연결 행은 막힌 것으로 본다. 돌려주는 값은 id → 이유(Map).
function refundLinkLockedIdsForPatch({ ids = [], patch = {}, links = [], rowsById = new Map() } = {}) {
  const selected = new Set(safeArray(ids).map((id) => String(id || "")));
  const has = (key) => Object.prototype.hasOwnProperty.call(patch || {}, key) && patch[key] !== undefined;
  const locked = new Map();
  const datesOf = (otherId, next) => {
    const other = rowsById.get(otherId);
    const dates = other ? [String(other.transaction_date || "").slice(0, 10)] : [];
    if (selected.has(otherId)) dates.push(next);
    return dates;
  };
  for (const id of selected) {
    const asExpense = safeArray(links).filter((link) => String(link?.expense_id || "") === id);
    const asRefund = safeArray(links).filter((link) => String(link?.refund_id || "") === id);
    if (!asExpense.length && !asRefund.length) continue;
    const row = rowsById.get(id);
    if (!row) { locked.set(id, "locked"); continue; }
    const linkedAsExpense = asExpense.reduce((sum, link) => sum + Number(link.amount || 0), 0);
    const linkedAsRefund = asRefund.reduce((sum, link) => sum + Number(link.amount || 0), 0);
    if ((has("household_id") && String(patch.household_id) !== String(row.household_id || "")) || (has("type") && String(patch.type) !== String(row.type || ""))) { locked.set(id, "kind"); continue; }
    if (has("amount") && !(Number(patch.amount) >= Math.max(linkedAsExpense, linkedAsRefund))) { locked.set(id, "amount"); continue; }
    if (linkedAsRefund > 0 && has("category") && String(patch.category ?? "") !== String(row.category ?? "")) { locked.set(id, "category"); continue; }
    if (has("transaction_date") && String(patch.transaction_date) !== String(row.transaction_date || "").slice(0, 10)) {
      const next = String(patch.transaction_date).slice(0, 10);
      const badExpense = asExpense.some((link) => { const dates = datesOf(String(link.refund_id || ""), next); return !dates.length || dates.some((refundDate) => !refundLinkDateAllowed(next, refundDate)); });
      const badRefund = asRefund.some((link) => { const dates = datesOf(String(link.expense_id || ""), next); return !dates.length || dates.some((expenseDate) => !refundLinkDateAllowed(expenseDate, next)); });
      if (badExpense || badRefund) locked.set(id, "date");
    }
  }
  return locked;
}

// V22.9.80 V76 M-7: 화면 합계에 넣는 환불 차감 항목. W-7 월말 예상(monthSpendingOutlook)의 refundDeductions 와 같은 모양에
// 원지출 지출자를 더했다: { transaction_date: 환급 날짜, amount(양수), category: 원지출 분류, user_id: 원지출 지출자, link_id }.
function refundDeductionEntries(links = []) {
  return safeArray(links).map((link) => ({
    transaction_date: String(link?.refund_date || "").slice(0, 10),
    amount: refundLinkPositiveAmount(link?.amount),
    category: String(link?.expense_category || ""),
    user_id: String(link?.expense_user_id || ""),
    link_id: String(link?.id || ""),
  })).filter((entry) => entry.amount && isValidTransactionDateString(entry.transaction_date));
}

// [start, endInclusive] 안의 차감 항목.
function refundDeductionsInRange(entries = [], start = "", endInclusive = "") {
  return safeArray(entries).filter((entry) => entry && entry.transaction_date >= start && entry.transaction_date <= endInclusive && Number(entry.amount) > 0);
}

// 합계에 반영할 차감액. 지출 합계는 0 아래로 내리지 않는다 — 지출보다 큰 환불은 남는 몫(surplus)을 수입으로 둔다.
// 그래서 지출·수입이 같은 금액(applied)만큼 줄고 잔액은 그대로다(변경안 ‘계산’: 지출 −L, 수입 −L, 잔액 그대로).
function refundDeductionApplied(grossExpense = 0, entries = []) {
  const requested = safeArray(entries).reduce((sum, entry) => sum + Math.max(0, Number(entry?.amount || 0)), 0);
  const applied = Math.max(0, Math.min(requested, Math.max(0, Number(grossExpense || 0))));
  return { requested, applied, surplus: requested - applied, count: safeArray(entries).length };
}

// calculateStats 결과에 차감을 반영한다. 차감이 없으면 같은 객체를 그대로 돌려준다(플래그 꺼짐과 같은 화면).
// 분류는 원지출 분류에서 빼되 0 아래로 내리지 않고(건수는 그대로), ‘환급’ 수입 분류는 반영한 몫만큼 줄인다.
// 날짜별(daily) 값은 기록 그대로다. 반영 내역은 refund 로 붙인다.
function refundAdjustedStats(stats, entries = []) {
  const list = safeArray(entries).filter((entry) => entry && Number(entry.amount) > 0);
  if (!stats || !stats.totals || !list.length) return stats;
  const grossExpense = Number(stats.totals.expense || 0);
  const refund = refundDeductionApplied(grossExpense, list);
  const cut = Object.create(null);
  for (const entry of list) {
    const key = entry.category || "기타지출";
    cut[key] = (cut[key] || 0) + Number(entry.amount);
  }
  let incomeLeft = refund.applied;
  const categories = safeArray(stats.categories).map((row) => {
    let next = row;
    const minus = cut[row.category] || 0;
    if (minus && Number(row.expense || 0) > 0) {
      const expense = Math.max(0, Number(row.expense) - minus);
      next = { ...row, expense, total: Number(row.income || 0) + expense, refundDeduction: Number(row.expense) - expense };
    }
    if (row.category === REFUND_LINK_CATEGORY && Number(row.income || 0) > 0 && incomeLeft > 0) {
      const income = Math.max(0, Number(row.income) - incomeLeft);
      incomeLeft -= Number(row.income) - income;
      next = { ...next, income, total: income + Number(next.expense || 0) };
    }
    return next;
  }).sort((a, b) => b.expense - a.expense || b.income - a.income);
  return {
    ...stats,
    totals: { ...stats.totals, income: Number(stats.totals.income || 0) - refund.applied, expense: grossExpense - refund.applied, balance: Number(stats.totals.balance || 0) },
    categories,
    refund,
  };
}

// 화면에 붙이는 짧은 문구. 반영한 차감이 없고 읽기도 실패하지 않았으면 "".
function refundDeductionNote(refund = null, { failed = false } = {}) {
  if (failed) return "환불 차감 확인 불가";
  if (!refund || !(Number(refund.applied) > 0)) return "";
  return `환불 차감 ${numberWithCommas(refund.applied)}원 반영`;
}
// @build:exports-start
export {
  applyRefundLinkNetting, buildRefundReviewItems, isRefundIncomeRow, isRefundLinksAbsentError,
  normalizeRefundLinkRows, rankRefundCandidates, refundAdjustedStats, refundDeductionApplied,
  refundDeductionEntries, refundDeductionNote, refundDeductionsByMonth, refundDeductionsInRange,
  refundLinkDateAllowed, refundLinkDeductionRows, refundLinkErrorCode, refundLinkLockedCode,
  refundLinkLockedIdsForPatch, refundLinkLockedKakaoText, refundLinkLockedReason, refundLinkMessage,
  refundLinkPositiveAmount, refundLinkWindowStart, refundLinksEnabled, refundRecipientEligible,
  refundSettlementNetting,
};
// @build:exports-end
