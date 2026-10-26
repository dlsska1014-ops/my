// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { sha256Hex } from "../auth/crypto-admin-session.js";
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import {
  fetchAdminRows, fetchAdminRowsRange, fetchFormerSpenderMembers, fetchHouseholdMembers,
  fetchPostgrestRows, fetchRowsByPlainIds, memberNameMap,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import {
  buildSettlementModel, parseSettlementConditions, settlementConditionPairs,
  settlementConditionQuery, settlementHistoryForSave, settlementHistoryKey, settlementPreviewDigest,
} from "./settlement-ops-pages.js";
import {
  applyRefundLinkNetting, buildRefundReviewItems, isRefundIncomeRow, isRefundLinksAbsentError,
  normalizeRefundLinkRows, rankRefundCandidates, refundDeductionEntries, refundLinkDateAllowed,
  refundLinkErrorCode, refundLinkLockedIdsForPatch, refundLinkLockedReason, refundLinkMessage,
  refundLinkPositiveAmount, refundLinkWindowStart, refundLinksEnabled, refundRecipientEligible,
  refundSettlementNetting,
} from "../domain/refund-links.js";
import { verifyUserSession } from "../auth/user-session.js";
import { parseJsonArraySettingStrict, saveSettingValue } from "../my/reports-premium.js";
import { canManageMyHousehold, getMySelectedHousehold } from "../my/access-control.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import {
  bulkTransactionsAtomic, escapeHtml, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end
// V22.9.79 V44 D-5·V76 M-7: 환불 연결의 읽기·쓰기와 화면. 기능 플래그 REFUND_LINKS_ENABLED 가 켜졌을 때만 부른다
// (라우터·정산 화면·카카오 정산·/ready). 표와 RPC 는 운영자가 검토용 SQL(migrations/V22_9_79_REFUND_LINKS_APPLY_REVIEW_ONLY.sql)을
// 적용해야 생긴다. 표나 RPC 가 없으면(404 PGRST205·PGRST202) 기능을 ‘쓸 수 없음’으로 알리고 정산은 예전 그대로 계산한다.
// 연결·풀기·수입으로 두기는 소유자·관리자만 한다(운영자 답 4, 서버에서 확인하고 RPC 도 다시 확인한다).

const REFUND_LINK_TABLE_SELECT = "id,household_id,expense_id,refund_id,amount,created_at";
const REFUND_LINK_TX_SELECT = "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at";
const REFUND_REVIEW_KEPT_LIMIT = 500;
const REFUND_PICKER_SHOW = 40;
const REFUND_PICKER_SCAN = 300;

function refundLinkIdValid(value) {
  return /^[A-Za-z0-9_-]{1,160}$/.test(String(value || ""));
}

function refundReviewKeptKey(householdId = "") {
  return `refund_review_kept:${String(householdId || "").trim()}`.slice(0, 180);
}

function parseRefundReviewKept(value) {
  let list = [];
  try { list = Array.isArray(value) ? value : value ? JSON.parse(String(value)) : []; } catch (err) { list = []; }
  return new Set(safeArray(list).map((id) => String(id || "").trim()).filter(refundLinkIdValid));
}

// V22.9.81 U-27: 이력의 완료 항목과 완료 달 표식(30건으로 자를 때 남긴다, settlementHistoryForSave)을 함께 본다. 둘 다 month 가 있다.
function settlementMonthCompleted(history = [], month = "") {
  return safeArray(history).some((item) => item && typeof item === "object" && item.month === month);
}

function refundShortDate(value = "") {
  const ymd = String(value || "").slice(0, 10);
  return /^\d{4}-\d{2}-\d{2}$/.test(ymd) ? `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}` : "";
}

function refundRowLabel(row = {}, fallback = "기록") {
  return String(row?.memo || row?.raw_text || row?.category || fallback).replace(/\s+/g, " ").trim().slice(0, 40) || fallback;
}

function refundDayAfter(ymd = "") {
  return new Date(Date.parse(`${String(ymd).slice(0, 10)}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

// 연결 행을 환급 id 나 원지출 id 로 읽는다(100개씩). 표가 없으면 오류를 그대로 던지고 호출부가 isRefundLinksAbsentError 로 가른다.
async function fetchRefundLinkRows(env, householdId, { refundIds = [], expenseIds = [] } = {}) {
  const column = refundIds.length ? "refund_id" : "expense_id";
  const ids = [...new Set(safeArray(refundIds.length ? refundIds : expenseIds).map((id) => String(id || "").trim()).filter(refundLinkIdValid))];
  const rows = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const params = new URLSearchParams();
    params.set("household_id", `eq.${householdId}`);
    params.set(column, `in.(${ids.slice(offset, offset + 100).join(",")})`);
    params.set("select", REFUND_LINK_TABLE_SELECT);
    params.set("order", "created_at.asc,id.asc");
    params.set("limit", "1000");
    rows.push(...safeArray(await supabase(env, `/rest/v1/accountbook_refund_links?${params.toString()}`, { method: "GET" })));
  }
  return rows.filter((row) => String(row?.household_id || householdId) === String(householdId));
}

// 그 달 환급 행에 걸린 연결 상태. 환급 행이 없으면 요청하지 않는다. withExpenses 이면 지난달 원지출 행도 읽는다(웹 화면·W-7).
// 표가 없으면 available:false 로 돌려주고, 다른 읽기 실패는 던진다(정산 금액은 틀리게 보이느니 보이지 않는다).
async function loadRefundLinkMonthState(env, { householdId = "", monthRows = [], withExpenses = false } = {}) {
  const refundRows = safeArray(monthRows).filter(isRefundIncomeRow);
  const state = { enabled: true, available: true, refundRows, links: [], netting: null, kept: new Set(), review: [], needsReviewCount: 0, linkedTotal: 0, expenseRowsById: new Map() };
  if (!refundRows.length) return state;
  let rawLinks = [];
  let keptValue = "";
  try {
    [rawLinks, keptValue] = await Promise.all([
      fetchRefundLinkRows(env, householdId, { refundIds: refundRows.map((row) => row.id) }),
      getSettingValue(env, refundReviewKeptKey(householdId)),
    ]);
  } catch (error) {
    if (isRefundLinksAbsentError(error)) return { ...state, available: false };
    throw error;
  }
  const monthById = new Map(safeArray(monthRows).map((row) => [String(row?.id || ""), row]));
  const expenseRowsById = new Map();
  for (const link of safeArray(rawLinks)) {
    const expense = monthById.get(String(link?.expense_id || ""));
    if (expense) expenseRowsById.set(String(expense.id), expense);
  }
  if (withExpenses) {
    const missing = safeArray(rawLinks).map((link) => String(link?.expense_id || "")).filter((id) => id && !expenseRowsById.has(id));
    for (const row of await fetchRowsByPlainIds(env, "transactions", missing, REFUND_LINK_TX_SELECT)) {
      if (String(row?.household_id || "") === String(householdId)) expenseRowsById.set(String(row.id), row);
    }
  }
  const links = normalizeRefundLinkRows(rawLinks, { householdId, refundRowsById: new Map(refundRows.map((row) => [String(row.id), row])), expenseRowsById });
  const kept = parseRefundReviewKept(keptValue);
  const review = buildRefundReviewItems(refundRows, links, kept);
  return {
    ...state, links, netting: refundSettlementNetting(links), kept, review, expenseRowsById,
    needsReviewCount: review.filter((item) => item.needsReview).length,
    linkedTotal: links.reduce((sum, link) => sum + link.amount, 0),
  };
}

// V22.9.79 M-7 연결점: 지출 합계·분류·예산 화면이 그 달 기록(모든 종류)에 환불 차감을 반영할 때 부른다.
// 플래그가 꺼져 있거나 그 달에 환급 행이 없으면 요청 없이 그대로 돌려준다. 표가 없으면 available:false 로 그대로 돌려준다.
// rows 의 차감 행은 source "refund_link"(음수 지출)라 속도 계산(W-7)에서 골라낼 수 있다.
async function refundNettedMonthRows(env, { householdId = "", monthRows = [] } = {}) {
  if (!refundLinksEnabled(env)) return { enabled: false, available: false, rows: monthRows, deductions: [], total: 0, links: [] };
  const state = await loadRefundLinkMonthState(env, { householdId, monthRows, withExpenses: true });
  if (!state.available || !state.links.length) return { enabled: true, available: state.available, rows: monthRows, deductions: [], total: 0, links: [] };
  return { enabled: true, available: true, links: state.links, ...applyRefundLinkNetting(monthRows, state.links) };
}

// V22.9.80 V76 M-7: 홈·예산·리포트·분석·카카오 요약의 환불 차감. 기간 [start, end)에 들어온 환급의 연결을 한 번에 읽는다
// (환급 행과 원지출 행을 함께 받는다 — 원지출이 지난달이어도 분류·지출자를 안다). 그 기간 기록을 먼저 읽을 필요가 없어
// 화면의 다른 읽기와 같은 단계에서 보낸다(직렬 깊이 그대로). 플래그가 꺼져 있으면 요청 없이 enabled:false 다.
// 표가 없으면 available:false(차감도 안내도 없음). 다른 읽기 실패는 failed:true·entries:null — 화면은 기록 그대로 보이고
// ‘환불 차감 확인 불가’라고 적는다(빈 목록으로 바꾸지 않는다). 한 번에 다 받지 못한 경우(상한)도 확인 불가다.
const REFUND_DEDUCTION_SELECT = "id,household_id,expense_id,refund_id,amount,created_at,"
  + "refund:transactions!accountbook_refund_links_refund_fkey!inner(id,household_id,user_id,type,amount,category,transaction_date),"
  + "expense:transactions!accountbook_refund_links_expense_fkey(id,household_id,user_id,type,amount,category,memo,raw_text,transaction_date)";
const REFUND_DEDUCTION_LIMIT = 2000;
const REFUND_DEDUCTIONS_OFF = Object.freeze({ enabled: false, available: false, failed: false, entries: Object.freeze([]), links: Object.freeze([]) });

function refundDeductionPath(householdId = "", start = "", end = "", limit = REFUND_DEDUCTION_LIMIT) {
  const params = new URLSearchParams();
  params.set("select", REFUND_DEDUCTION_SELECT);
  params.set("household_id", `eq.${householdId}`);
  params.append("refund.transaction_date", `gte.${start}`);
  params.append("refund.transaction_date", `lt.${end}`);
  params.set("order", "created_at.asc,id.asc");
  params.set("limit", String(limit));
  return `/rest/v1/accountbook_refund_links?${params.toString()}`;
}

async function loadRefundDeductions(env, { householdId = "", start = "", end = "" } = {}) {
  if (!refundLinksEnabled(env)) return REFUND_DEDUCTIONS_OFF;
  if (!householdId || !isValidTransactionDateString(start) || !isValidTransactionDateString(end) || start >= end) return { enabled: true, available: true, failed: false, entries: [], links: [] };
  try {
    const raw = await supabase(env, refundDeductionPath(householdId, start, end), { method: "GET" });
    if (!Array.isArray(raw)) throw new Error("refund_deduction_read_invalid");
    if (raw.length >= REFUND_DEDUCTION_LIMIT) throw new Error("refund_deduction_read_limit");
    const refundRowsById = new Map();
    const expenseRowsById = new Map();
    for (const row of raw) {
      if (row?.refund?.id && String(row.refund.household_id || "") === String(householdId)) refundRowsById.set(String(row.refund.id), row.refund);
      if (row?.expense?.id) expenseRowsById.set(String(row.expense.id), row.expense);
    }
    const links = normalizeRefundLinkRows(raw, { householdId, refundRowsById, expenseRowsById })
      .filter((link) => link.refund_date >= start && link.refund_date < end);
    return { enabled: true, available: true, failed: false, entries: refundDeductionEntries(links), links };
  } catch (error) {
    if (isRefundLinksAbsentError(error)) return { enabled: true, available: false, failed: false, entries: [], links: [] };
    rememberOpsEvent({ kind: "refund_deduction_read_failed", severity: "warn", path: "/refund-deductions", method: "GET", detail: safeError(error) });
    return { enabled: true, available: true, failed: true, entries: null, links: null };
  }
}

// 나간 사람 이름 읽기(fetchFormerSpenderMembers)에 넘길 행: 지출 행 + 연결한 환급 행(받은 사람도 정산 참여자가 된다).
function refundSettlementSpenderRows(rows = [], state = {}) {
  if (!state?.links?.length) return rows;
  const linked = new Set(state.links.map((link) => link.refund_id));
  return [...safeArray(rows), ...safeArray(state.refundRows).filter((row) => linked.has(String(row.id)))];
}

// 완료 저장 지문. 연결이 없으면 예전 지문(settlementPreviewDigest)과 같다. 연결이 있으면 연결과 연결한 환급 행(금액·받은 사람)을 넣는다.
async function settlementRefundDigest({ month, mode, conditions = {}, rows = [], links = [] }) {
  if (!safeArray(links).length) return settlementPreviewDigest({ month, mode, conditions, rows });
  const canonical = JSON.stringify([
    "v3-refund-links",
    month,
    mode,
    settlementConditionPairs(mode, conditions).sort(),
    safeArray(rows).filter((row) => row.type !== "income").map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
    links.map((link) => [link.id, link.expense_id, link.refund_id, link.amount]).sort(),
    [...new Map(links.map((link) => [link.refund_id, [link.refund_id, link.refund_amount, link.recipient_user_id]])).values()].sort(),
  ]);
  return (await sha256Hex(canonical)).slice(0, 32);
}

// 정산 화면(플래그 켜짐) 안내 문장.
function settlementRefundNotice(state = {}) {
  if (!state.available) return "환불 연결 기능을 아직 쓸 수 없어 환급은 이 정산에서 빼지 않았습니다. 환급 계산은 미리보기로만 제공합니다.";
  if (state.linkedTotal) return `연결한 환불 ${numberWithCommas(state.linkedTotal)}원은 이 정산과 완료 이력에 반영했습니다. 원래 지출을 고르지 않은 환급은 빼지 않습니다.`;
  return "원래 지출과 연결한 환불만 이 정산과 완료 이력에 반영합니다. 원래 지출을 고르지 않은 환급은 빼지 않습니다.";
}

function renderRefundLinkFlash(url) {
  const msg = String(url.searchParams.get("msg") || "");
  const err = String(url.searchParams.get("err") || "");
  if (/^refund_/.test(msg) && refundLinkMessage(msg)) return `<div class="ok">${escapeHtml(refundLinkMessage(msg))}</div>`;
  if (/^refund_/.test(err) && refundLinkMessage(err)) return `<div class="error">${escapeHtml(refundLinkMessage(err))}</div>`;
  return "";
}

// 정산 화면의 ‘환불·환급’ 구역. 연결한 환불, 확인 대상(원래 지출 고르기·수입으로 두기), 수입으로 둔 환급을 보여 준다.
function renderSettlementRefundSection({ state = {}, month = "", householdId = "", canManage = false, completed = false, members = [] }) {
  const head = `<section class="card" id="refund-links"><h2>환불·환급</h2>`;
  if (!state.available) return `${head}<p class="note">환불 연결 기능을 아직 쓸 수 없어 환급은 이 정산에서 빼지 않았어요. 준비가 끝나면 이곳에서 원래 지출을 고를 수 있어요.</p></section>`;
  if (!safeArray(state.refundRows).length) return `${head}<p class="note">이 달에는 분류가 ‘환급’인 수입이 없어요. 환불을 ‘환급’ 수입으로 기록하면 이곳에서 원래 지출과 연결해 정산과 지출 합계에서 뺄 수 있어요.</p></section>`;
  const names = memberNameMap(members);
  const eligible = new Set(safeArray(members).filter(refundRecipientEligible).map((member) => String(member.user_id)));
  const editable = canManage && !completed;
  const refundById = new Map(safeArray(state.refundRows).map((row) => [String(row.id), row]));
  const hidden = (extra) => `<input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/>${extra}`;
  const button = (action, fields, label) => `<form method="post" action="${action}" style="display:inline-block;margin:4px 6px 0 0">${hidden(fields)}<button type="submit" class="light">${escapeHtml(label)}</button></form>`;
  const item = (body) => `<li style="border:1px solid rgba(148,163,184,.45);border-radius:16px;padding:12px;margin:8px 0;list-style:none">${body}</li>`;
  const linked = safeArray(state.links).map((link) => {
    const refund = refundById.get(link.refund_id) || {};
    const expense = state.expenseRowsById?.get(link.expense_id) || null;
    const expenseText = expense
      ? `${refundShortDate(expense.transaction_date)} ${refundRowLabel(expense, "지출")} ${numberWithCommas(expense.amount)}원(${expense.category || "분류 없음"})`
      : "원래 지출";
    const text = `${refundShortDate(refund.transaction_date)} ${refundRowLabel(refund, "환급")} ${numberWithCommas(link.amount)}원 → ${expenseText}에서 뺐어요`;
    const action = editable ? button("/my/settlement/refund-unlink", `<input type="hidden" name="link_id" value="${escapeHtml(link.id)}"/><input type="hidden" name="amount" value="${escapeHtml(link.amount)}"/>`, "연결 풀기") : "";
    return item(`<span>${escapeHtml(text)}</span>${action ? `<div>${action}</div>` : ""}`);
  });
  const reviewItems = safeArray(state.review).filter((entry) => entry.needsReview).map((entry) => {
    const recipient = String(entry.row.user_id || "");
    const amountText = entry.linked ? `남은 ${numberWithCommas(entry.remaining)}원 확인 대상` : `+${numberWithCommas(entry.amount)}원`;
    const who = recipient ? `받은 사람 ${names[recipient] || "이전 구성원"}` : "받은 사람 미지정";
    const text = `${refundShortDate(entry.row.transaction_date)} ${refundRowLabel(entry.row, "환급")} ${amountText} · ${who}`;
    const blocked = !recipient ? "환급 기록에서 받은 사람을 먼저 정해 주세요." : !eligible.has(recipient) ? "받은 사람이 정산 참여자가 아니라 연결할 수 없어요. 환급 기록의 받은 사람을 바꿔 주세요." : "";
    const pickHref = `/my/settlement/refund-link?household_id=${encodeURIComponent(householdId)}&month=${encodeURIComponent(month)}&refund_id=${encodeURIComponent(entry.id)}`;
    const actions = editable
      ? `${blocked ? "" : `<a class="btn light" href="${escapeHtml(pickHref)}" style="margin:4px 6px 0 0">원래 지출 고르기</a>`}${button("/my/settlement/refund-keep", `<input type="hidden" name="refund_id" value="${escapeHtml(entry.id)}"/><input type="hidden" name="action" value="keep"/>`, "수입으로 두기")}`
      : "";
    return item(`<span>${escapeHtml(text)}</span><small class="muted" style="display:block">${escapeHtml(blocked || "원래 지출을 고르면 정산과 지출 합계에서 뺍니다.")}</small>${actions ? `<div>${actions}</div>` : ""}`);
  });
  const keptItems = safeArray(state.review).filter((entry) => entry.kept && entry.remaining > 0).map((entry) => {
    const text = `${refundShortDate(entry.row.transaction_date)} ${refundRowLabel(entry.row, "환급")} ${numberWithCommas(entry.remaining)}원 · 수입으로 둠`;
    const action = editable ? button("/my/settlement/refund-keep", `<input type="hidden" name="refund_id" value="${escapeHtml(entry.id)}"/><input type="hidden" name="action" value="unkeep"/>`, "다시 확인") : "";
    return item(`<span>${escapeHtml(text)}</span>${action ? `<div>${action}</div>` : ""}`);
  });
  const lock = completed
    ? `<p class="note">정산을 완료한 달이라 연결을 바꿀 수 없어요. 완료 이력은 그대로예요.</p>`
    : !canManage ? `<p class="note">소유자·관리자가 원래 지출을 연결하거나 풀 수 있어요.</p>` : "";
  const list = (title, rows) => rows.length ? `<h3>${escapeHtml(title)}</h3><ul style="padding:0;margin:0">${rows.join("")}</ul>` : "";
  return `${head}<p class="note">원래 지출과 연결한 환불만 이 정산과 지출 합계에서 뺍니다. 환불이 들어온 달에 원래 지출의 분류로 빠지고, 고르지 않은 환급은 수입으로 남습니다.</p>${lock}${list("연결한 환불", linked)}${list("확인할 환급", reviewItems)}${list("수입으로 둔 환급", keptItems)}${!linked.length && !reviewItems.length && !keptItems.length ? `<p class="muted">이 달 환급은 모두 확인했어요.</p>` : ""}</section>`;
}

// 정산 화면에 넣을 조각을 한 번에 만든다(settlement-ops-pages.js 의 화면 틀은 그대로 두고 값만 바꾼다).
function settlementRefundPageParts({ state = {}, model = {}, month = "", householdId = "", canManage = false, history = [], members = [], url }) {
  const completed = settlementMonthCompleted(history, month);
  return {
    notice: settlementRefundNotice(state),
    linkHtml: state.available ? `<a href="#refund-links">환불·환급 연결 확인</a>` : "",
    confirmText: state.available ? "참여자와 연결한 환불을 뺀 금액을 확인했고 완료 이력으로 저장합니다." : "",
    sectionHtml: renderSettlementRefundSection({ state, month, householdId, canManage, completed, members }),
    metricHtml: model.refundTotal ? `<div class="metric"><span>뺀 환불</span><b>${numberWithCommas(model.refundTotal)}원</b></div>` : "",
    flashHtml: url ? renderRefundLinkFlash(url) : "",
  };
}

// V22.9.79 D-5: 카카오 ‘정산’ 답장의 환불 줄(플래그 켜짐·표 있음). 원래 지출 고르기는 웹 정산 화면에서만 한다.
function kakaoRefundSettlementLines(state = {}, model = {}) {
  const lines = [];
  const linked = Math.max(0, Math.round(Number(model.refundTotal || 0)));
  if (linked) lines.push(`연결한 환불 ${numberWithCommas(linked)}원은 이 정산에서 뺐어요.`);
  if (state.needsReviewCount) lines.push(`원래 지출을 고르지 않은 환급 ${numberWithCommas(state.needsReviewCount)}건은 빼지 않았어요. 웹 정산 화면에서 고를 수 있어요.`);
  if (!lines.length) lines.push("환급(돌려받은 돈)은 웹 정산 화면에서 원래 지출과 연결하면 이 정산에서 빼요.");
  return lines;
}

function kakaoRefundSurplusLine(model = {}) {
  return `연결한 환불이 지출보다 ${numberWithCommas(Math.abs(Math.round(Number(model.totalExpense || 0))))}원 많아요. 아래 송금 제안대로 나누면 돼요.`;
}

function refundLinkExpected(row = {}) {
  return {
    amount: Math.round(Number(row.amount || 0)),
    type: String(row.type || ""),
    category: row.category ?? null,
    user_id: row.user_id ? String(row.user_id) : null,
    transaction_date: String(row.transaction_date || "").slice(0, 10),
  };
}

// 고르기 화면과 연결 저장 사이에 두 기록·연결 합계가 바뀌었는지 보는 지문.
async function refundLinkSourceDigest({ refund = {}, expense = {}, refundLinked = 0, expenseLinked = 0 }) {
  const tuple = (row) => [String(row.id || ""), Math.round(Number(row.amount || 0)), String(row.type || ""), String(row.category ?? ""), String(row.user_id || ""), String(row.transaction_date || "").slice(0, 10)];
  return (await sha256Hex(JSON.stringify(["refund-link-source-v22979", tuple(refund), tuple(expense), refundLinked, expenseLinked]))).slice(0, 32);
}

// 연결 저장 전에 Worker 가 먼저 확인한다(RPC 가 잠근 행으로 같은 규칙을 다시 확인한다). 문제가 없으면 "".
function refundLinkPairProblem({ refund = null, expense = null, month = "", amount = 0, householdId = "", members = [], links = [] }) {
  if (!refund || !expense || String(refund.household_id || "") !== String(householdId) || String(expense.household_id || "") !== String(householdId)) return "refund_link_record_not_found";
  if (!isRefundIncomeRow(refund) || expense.type !== "expense") return "refund_link_kind_invalid";
  if (String(refund.transaction_date || "").slice(0, 7) !== month) return "refund_link_input_invalid";
  if (!String(expense.user_id || "").trim()) return "refund_link_spender_required";
  const recipient = String(refund.user_id || "").trim();
  if (!recipient) return "refund_link_recipient_required";
  if (!safeArray(members).some((member) => String(member.user_id) === recipient && refundRecipientEligible(member))) return "refund_link_recipient_invalid";
  if (String(expense.transaction_date || "").slice(0, 10) > String(refund.transaction_date || "").slice(0, 10)) return "refund_link_date_order";
  if (!refundLinkDateAllowed(expense.transaction_date, refund.transaction_date)) return "refund_link_window";
  if (safeArray(links).some((link) => String(link.expense_id) === String(expense.id) && String(link.refund_id) === String(refund.id))) return "refund_link_duplicate";
  if (!refundLinkPositiveAmount(amount)) return "refund_link_amount_invalid";
  const sum = (key, id) => safeArray(links).filter((link) => String(link[key]) === String(id)).reduce((total, link) => total + Math.round(Number(link.amount || 0)), 0);
  if (sum("refund_id", refund.id) + amount > Math.round(Number(refund.amount || 0)) || sum("expense_id", expense.id) + amount > Math.round(Number(expense.amount || 0))) return "refund_link_amount_exceeded";
  return "";
}

function refundLinkLogFailure(path, code, error) {
  if (!["refund_link_failed", "refund_link_unknown", "refund_link_busy", "refund_link_unavailable", "refund_link_history_invalid"].includes(code)) return;
  rememberOpsEvent({ kind: "refund_link_failed", severity: "warn", path, method: "POST", detail: `${code}: ${safeError(error)}`.slice(0, 400) });
}

// 세 POST 의 공통 앞부분: 로그인 → 가계부 → 소유자·관리자.
async function refundLinkPostContext(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return { response: redirectResponse("/my") };
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = (query) => redirectResponse(`/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&${query}#refund-links`);
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return { response: redirectResponse("/my?err=no_household") };
  if (!canManageMyHousehold(selected.role)) return { response: back("err=refund_link_permission_denied") };
  return { userId, form, householdId, month, back };
}

// 완료 이력을 잠금 안에서 다시 읽어, 그 달을 완료했으면 바꾸지 않는다(운영자 답 5). RPC 도 같은 확인을 한다.
async function assertRefundMonthOpen(env, householdId, month) {
  const history = parseJsonArraySettingStrict(await getSettingValueStrict(env, settlementHistoryKey(householdId)), "refund_link_history_invalid");
  if (settlementMonthCompleted(history, month)) throw new Error("refund_link_month_completed");
}

async function handleRefundLinkPost(request, env) {
  const context = await refundLinkPostContext(request, env);
  if (context.response) return context.response;
  const { userId, form, householdId, month, back } = context;
  const refundId = String(form.get("refund_id") || "").trim();
  const expenseId = String(form.get("expense_id") || "").trim();
  const rawAmount = String(form.get("amount") || "").replace(/[,\s원]/g, "");
  const amount = /^\d{1,10}$/.test(rawAmount) ? refundLinkPositiveAmount(Number(rawAmount)) : 0;
  const sourceDigest = String(form.get("source_digest") || "").trim();
  if (!refundLinkIdValid(refundId) || !refundLinkIdValid(expenseId) || refundId === expenseId || !/^[a-f0-9]{32}$/.test(sourceDigest)) return back("err=refund_link_input_invalid");
  if (!amount) return back("err=refund_link_amount_invalid");
  try {
    const [rows, refundLinks, expenseLinks, members] = await Promise.all([
      fetchRowsByPlainIds(env, "transactions", [refundId, expenseId], REFUND_LINK_TX_SELECT),
      fetchRefundLinkRows(env, householdId, { refundIds: [refundId] }),
      fetchRefundLinkRows(env, householdId, { expenseIds: [expenseId] }),
      fetchHouseholdMembers(env, householdId),
    ]);
    const refund = rows.find((row) => String(row.id) === refundId) || null;
    const expense = rows.find((row) => String(row.id) === expenseId) || null;
    const links = [...new Map([...refundLinks, ...expenseLinks].map((link) => [String(link.id), link])).values()];
    const problem = refundLinkPairProblem({ refund, expense, month, amount, householdId, members, links });
    if (problem) return back(`err=${problem}`);
    const refundLinked = refundLinks.reduce((sum, link) => sum + Math.round(Number(link.amount || 0)), 0);
    const expenseLinked = expenseLinks.reduce((sum, link) => sum + Math.round(Number(link.amount || 0)), 0);
    if (sourceDigest !== await refundLinkSourceDigest({ refund, expense, refundLinked, expenseLinked })) return back("err=refund_link_source_changed");
    await withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
      await assertRefundMonthOpen(env, householdId, month);
      assertFresh();
      await supabase(env, "/rest/v1/rpc/accountbook_link_refund_v22979", {
        method: "POST",
        body: JSON.stringify({
          p_household_id: householdId, p_actor_user_id: userId, p_expense_id: expenseId, p_refund_id: refundId, p_amount: amount,
          p_expected: { expense: refundLinkExpected(expense), refund: refundLinkExpected(refund) },
        }),
      });
    });
    return back("msg=refund_linked");
  } catch (error) {
    const code = refundLinkErrorCode(error);
    refundLinkLogFailure("/my/settlement/refund-link", code, error);
    return back(`err=${code}`);
  }
}

async function handleRefundUnlinkPost(request, env) {
  const context = await refundLinkPostContext(request, env);
  if (context.response) return context.response;
  const { userId, form, householdId, back } = context;
  const linkId = String(form.get("link_id") || "").trim();
  const rawAmount = String(form.get("amount") || "").trim();
  const expectedAmount = /^\d{1,10}$/.test(rawAmount) ? refundLinkPositiveAmount(Number(rawAmount)) : 0;
  if (!refundLinkIdValid(linkId) || !expectedAmount) return back("err=refund_link_input_invalid");
  try {
    const params = new URLSearchParams({ id: `eq.${linkId}`, household_id: `eq.${householdId}`, select: REFUND_LINK_TABLE_SELECT, limit: "1" });
    const link = safeArray(await supabase(env, `/rest/v1/accountbook_refund_links?${params.toString()}`, { method: "GET" }))[0] || null;
    if (!link || String(link.household_id || householdId) !== householdId) return back("err=refund_link_not_found");
    if (Math.round(Number(link.amount || 0)) !== expectedAmount) return back("err=refund_link_source_changed");
    const refund = (await fetchRowsByPlainIds(env, "transactions", [link.refund_id], REFUND_LINK_TX_SELECT))[0] || null;
    if (!refund || String(refund.household_id || "") !== householdId) return back("err=refund_link_not_found");
    // 완료 여부는 화면의 달이 아니라 환급 날짜의 달로 본다(RPC 와 같다).
    const refundMonth = String(refund.transaction_date || "").slice(0, 7);
    await withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
      await assertRefundMonthOpen(env, householdId, refundMonth);
      assertFresh();
      await supabase(env, "/rest/v1/rpc/accountbook_unlink_refund_v22979", {
        method: "POST",
        body: JSON.stringify({ p_household_id: householdId, p_actor_user_id: userId, p_link_id: linkId, p_expected_amount: expectedAmount }),
      });
    });
    return back("msg=refund_unlinked");
  } catch (error) {
    const code = refundLinkErrorCode(error);
    refundLinkLogFailure("/my/settlement/refund-unlink", code, error);
    return back(`err=${code}`);
  }
}

// ‘수입으로 두기’(운영자 답 7): 분류·금액은 그대로 두고 확인 대상에서만 뺀다. 가계부 설정 refund_review_kept:<가계부> 에 환급 id 를 둔다.
async function handleRefundKeepPost(request, env) {
  const context = await refundLinkPostContext(request, env);
  if (context.response) return context.response;
  const { form, householdId, back } = context;
  const refundId = String(form.get("refund_id") || "").trim();
  const action = String(form.get("action") || "keep") === "unkeep" ? "unkeep" : "keep";
  if (!refundLinkIdValid(refundId)) return back("err=refund_link_input_invalid");
  try {
    const refund = (await fetchRowsByPlainIds(env, "transactions", [refundId], REFUND_LINK_TX_SELECT))[0] || null;
    if (!refund || String(refund.household_id || "") !== householdId || !isRefundIncomeRow(refund)) return back("err=refund_link_record_not_found");
    await withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
      const current = parseJsonArraySettingStrict(await getSettingValueStrict(env, refundReviewKeptKey(householdId)), "refund_review_kept_invalid");
      const ids = current.map((id) => String(id || "").trim()).filter((id) => refundLinkIdValid(id) && id !== refundId);
      if (action === "keep") ids.push(refundId);
      assertFresh();
      await saveSettingValue(env, refundReviewKeptKey(householdId), ids.slice(-REFUND_REVIEW_KEPT_LIMIT));
    });
    return back(`msg=${action === "keep" ? "refund_kept" : "refund_unkept"}`);
  } catch (error) {
    const code = refundLinkErrorCode(error);
    refundLinkLogFailure("/my/settlement/refund-keep", code, error);
    return back(`err=${code}`);
  }
}

function refundPickerHtml(title, body, status = 200) {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(title)}</title><style>main{max-width:900px;margin:auto;padding:24px 16px;font-family:system-ui,-apple-system,"Noto Sans KR",sans-serif;line-height:1.6}label{display:inline-block;margin:6px 8px 6px 0}input,select,button{min-height:44px;max-width:100%;font:inherit}ul{padding:0}li{list-style:none;border:1px solid rgba(148,163,184,.5);border-radius:14px;padding:12px;margin:10px 0}li span{display:block;opacity:.8;font-size:14px}.note{border-radius:12px;padding:12px;background:rgba(148,163,184,.15)}</style></head><body><main>${body}</main></body></html>`, status);
}

// 원래 지출 고르기(소유자·관리자). 기본은 환급 날짜 전 365일 안의 최근 지출 300건에서 고르고, 달을 골라 그 달 전체를 볼 수 있다.
async function handleRefundLinkPicker(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const householdId = String(url.searchParams.get("household_id") || "").trim();
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const refundId = String(url.searchParams.get("refund_id") || "").trim();
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  const backHref = `/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}#refund-links`;
  const backLink = `<p><a href="${escapeHtml(backHref)}">정산으로 돌아가기</a></p>`;
  const title = "원래 지출 고르기";
  if (!canManageMyHousehold(selected.role)) return refundPickerHtml(title, `<h1>${title}</h1><p>${escapeHtml(refundLinkMessage("refund_link_permission_denied"))}</p>${backLink}`, 403);
  if (!refundLinkIdValid(refundId)) return refundPickerHtml(title, `<h1>${title}</h1><p>${escapeHtml(refundLinkMessage("refund_link_input_invalid"))}</p>${backLink}`, 400);
  const [refundRows, members, historyValue] = await Promise.all([
    fetchRowsByPlainIds(env, "transactions", [refundId], REFUND_LINK_TX_SELECT),
    fetchHouseholdMembers(env, householdId),
    getSettingValueStrict(env, settlementHistoryKey(householdId)),
  ]);
  const refund = refundRows.find((row) => String(row.id) === refundId) || null;
  if (!refund || String(refund.household_id || "") !== householdId || !isRefundIncomeRow(refund) || String(refund.transaction_date || "").slice(0, 7) !== month) {
    return refundPickerHtml(title, `<h1>${title}</h1><p>이 달의 ‘환급’ 수입 기록을 찾지 못했어요. 이미 지워졌거나 분류·날짜가 바뀌었을 수 있어요.</p>${backLink}`, 404);
  }
  let refundLinks = [];
  try {
    refundLinks = await fetchRefundLinkRows(env, householdId, { refundIds: [refundId] });
  } catch (error) {
    if (!isRefundLinksAbsentError(error)) throw error;
    return refundPickerHtml(title, `<h1>${title}</h1><p class="note">${escapeHtml(refundLinkMessage("refund_link_unavailable"))}</p>${backLink}`);
  }
  const names = memberNameMap(members);
  const refundDate = String(refund.transaction_date).slice(0, 10);
  const refundAmount = Math.round(Number(refund.amount || 0));
  const refundLinked = refundLinks.reduce((sum, link) => sum + Math.round(Number(link.amount || 0)), 0);
  const remaining = Math.max(0, refundAmount - refundLinked);
  const recipient = String(refund.user_id || "");
  const header = `<h1>${title}</h1><p>${escapeHtml(selected.name || "가계부")} · ${escapeHtml(month)}</p><p><b>${escapeHtml(`${refundShortDate(refundDate)} ${refundRowLabel(refund, "환급")}`)}</b><span style="display:block">${escapeHtml(`환급 ${numberWithCommas(refundAmount)}원 · 받은 사람 ${recipient ? names[recipient] || "이전 구성원" : "미지정"} · 남은 ${numberWithCommas(remaining)}원`)}</span></p>`;
  const completed = settlementMonthCompleted(parseJsonArraySettingStrict(historyValue, "refund_link_history_invalid"), month);
  const stop = completed ? refundLinkMessage("refund_link_month_completed")
    : !recipient ? refundLinkMessage("refund_link_recipient_required")
      : !safeArray(members).some((member) => String(member.user_id) === recipient && refundRecipientEligible(member)) ? refundLinkMessage("refund_link_recipient_invalid")
        : remaining <= 0 ? "이 환급은 모두 원래 지출과 연결했어요. 금액을 바꾸려면 정산 화면에서 연결을 먼저 풀어 주세요." : "";
  if (stop) return refundPickerHtml(title, `${header}<p class="note">${escapeHtml(stop)}</p>${backLink}`);
  const windowStart = refundLinkWindowStart(refundDate);
  const months = [];
  for (let offset = 0; offset <= 12; offset += 1) {
    const d = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1 - offset, 1));
    const value = d.toISOString().slice(0, 7);
    if (value < windowStart.slice(0, 7)) break;
    months.push(value);
  }
  const pickMonth = months.includes(String(url.searchParams.get("pick_month") || "")) ? String(url.searchParams.get("pick_month")) : "";
  const query = String(url.searchParams.get("q") || "").replace(/\s+/g, " ").trim().slice(0, 40);
  const candidateRows = pickMonth
    ? await fetchAdminRows(env, { month: pickMonth, householdId, type: "expense" })
    : await fetchAdminRowsRange(env, { householdId, start: windowStart, end: refundDayAfter(refundDate), type: "expense", limit: REFUND_PICKER_SCAN, complete: false });
  const needle = query.toLowerCase();
  const filtered = needle ? candidateRows.filter((row) => `${row.memo || ""} ${row.raw_text || ""} ${row.category || ""} ${row.payment_method || ""}`.toLowerCase().includes(needle)) : candidateRows;
  const ranked = rankRefundCandidates(refund, filtered, { remaining }).slice(0, REFUND_PICKER_SHOW);
  const expenseLinks = ranked.length ? await fetchRefundLinkRows(env, householdId, { expenseIds: ranked.map((row) => row.id) }) : [];
  const usedByExpense = new Map();
  for (const link of expenseLinks) usedByExpense.set(String(link.expense_id), (usedByExpense.get(String(link.expense_id)) || 0) + Math.round(Number(link.amount || 0)));
  const already = new Set(refundLinks.map((link) => String(link.expense_id)));
  const items = [];
  for (const row of ranked) {
    const used = usedByExpense.get(String(row.id)) || 0;
    const expenseRemaining = Math.round(Number(row.amount || 0)) - used;
    if (expenseRemaining <= 0 || already.has(String(row.id))) continue;
    const max = Math.min(remaining, expenseRemaining);
    const digest = await refundLinkSourceDigest({ refund, expense: row, refundLinked, expenseLinked: used });
    const info = `${row.category || "분류 없음"} · ${names[String(row.user_id || "")] || "이전 구성원"} · ${numberWithCommas(row.amount)}원${used ? ` · 이미 연결 ${numberWithCommas(used)}원` : ""}`;
    items.push(`<li><b>${escapeHtml(`${refundShortDate(row.transaction_date)} ${refundRowLabel(row, "지출")}`)}</b><span>${escapeHtml(info)}</span><form method="post" action="/my/settlement/refund-link"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="refund_id" value="${escapeHtml(refundId)}"/><input type="hidden" name="expense_id" value="${escapeHtml(row.id)}"/><input type="hidden" name="source_digest" value="${escapeHtml(digest)}"/><label>뺄 금액 <input type="number" name="amount" min="1" max="${max}" step="1" value="${max}" required/></label><button type="submit">이 지출에서 빼기</button></form></li>`);
  }
  const monthOptions = [`<option value=""${pickMonth ? "" : " selected"}>최근 지출</option>`, ...months.map((value) => `<option value="${value}"${value === pickMonth ? " selected" : ""}>${value}</option>`)].join("");
  const finder = `<form method="get" action="/my/settlement/refund-link"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="refund_id" value="${escapeHtml(refundId)}"/><label>찾을 달 <select name="pick_month">${monthOptions}</select></label><label>내용 <input type="text" name="q" maxlength="40" value="${escapeHtml(query)}"/></label><button type="submit">찾기</button></form>`;
  const note = `<p class="note">고른 지출의 분류·쓴 사람으로 ${escapeHtml(month)} 지출 합계와 정산에서 뺍니다. 원래 지출 기록은 바뀌지 않아요. 환급 날짜 전 365일 안의 지출만 고를 수 있어요.</p>`;
  const list = items.length ? `<ul>${items.join("")}</ul>` : `<p>고를 수 있는 지출이 없어요. 다른 달이나 내용으로 찾아 보세요.</p>`;
  return refundPickerHtml(title, `${header}${note}${finder}${list}${backLink}`);
}

// 플래그가 켜졌을 때의 정산 완료 저장. 예전 처리(handleSettlementHistorySave)와 같고, 연결 걸기·풀기와 같은 잠금 안에서
// 기록·연결·이력을 읽어 연결한 환불을 뺀 결과를 남긴다. 연결이 있으면 schema_version 3(refund_total·refund_links)이다.
async function handleSettlementHistorySaveV22979(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const rawMode = String(form.get("mode") || "");
  const mode = ["equal", "ratio", "headcount", "item"].includes(rawMode) ? rawMode : "equal";
  const returnTo = `/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&mode=${encodeURIComponent(mode)}`;
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(`${returnTo}&err=manage_required`);
  if (String(form.get("confirmed") || "") !== "yes") return redirectResponse(`${returnTo}&err=confirmation_required`);
  if (rawMode !== mode) return redirectResponse(`${returnTo}&err=invalid_mode`);
  let backTo = returnTo;
  try {
    const submittedDigest = String(form.get("preview_digest") || "").trim();
    const note = String(form.get("note") || "").trim().slice(0, 160);
    const outcome = await withHouseholdSettingsRmw(env, selected.id, async ({ assertFresh }) => {
      const [monthRows, members, historyValue] = await Promise.all([
        fetchAdminRows(env, { month, householdId: selected.id, type: "all" }),
        fetchHouseholdMembers(env, selected.id),
        getSettingValueStrict(env, settlementHistoryKey(selected.id)),
      ]);
      const rows = monthRows.filter((row) => row.type === "expense");
      const refund = await loadRefundLinkMonthState(env, { householdId: selected.id, monthRows });
      const conditions = parseSettlementConditions(form, members, rows);
      backTo = `${returnTo}${settlementConditionQuery(mode, conditions)}`;
      const formerMembers = await fetchFormerSpenderMembers(env, refundSettlementSpenderRows(rows, refund), members);
      const model = buildSettlementModel(rows, members, { mode, ...conditions, formerMembers, ...(refund.netting ? { refundNetting: refund.netting } : {}) });
      const digest = await settlementRefundDigest({ month, mode, conditions, rows, links: refund.links });
      if (submittedDigest && submittedDigest !== digest) return "changed";
      const history = parseJsonArraySettingStrict(historyValue, "settlement_history_json_invalid");
      const duplicate = history.some((item) => {
        const completedAt = Date.parse(String(item.completed_at || ""));
        const recent = Number.isFinite(completedAt) && Date.now() - completedAt >= 0 && Date.now() - completedAt < 5 * 60 * 1000;
        return recent && item.month === month && item.mode === mode && Number(item.total_expense || 0) === Number(model.totalExpense || 0) && String(item.note || "") === note && String(item.completed_by || "") === String(userId) && (!item.rows_digest || item.rows_digest === digest);
      });
      if (duplicate) return "duplicate";
      const linked = refund.links.length > 0;
      history.push({
        id: crypto.randomUUID(),
        schema_version: linked ? 3 : 2,
        month,
        mode,
        conditions,
        total_expense: model.totalExpense,
        ...(linked ? {
          gross_expense: model.grossExpense,
          refund_total: refund.linkedTotal,
          refund_links: refund.links.map((link) => ({ id: link.id, expense_id: link.expense_id, refund_id: link.refund_id, amount: link.amount, recipient_user_id: link.recipient_user_id })),
        } : {}),
        participant_count: model.participantCount,
        shares: model.people.map((person) => ({ user_id: person.user_id, name: person.name, paid: person.paid, share: person.share, balance: person.balance })),
        transfers: model.transfers,
        rows_digest: digest,
        note,
        completed_by: userId,
        completed_at: new Date().toISOString(),
        status: "completed",
      });
      assertFresh();
      // V22.9.81 U-27: 30건으로 자를 때 잘려 나가는 달은 완료 달 표식으로 남긴다(플래그 꺼짐 저장과 같은 규칙).
      await saveSettingValue(env, settlementHistoryKey(selected.id), settlementHistoryForSave(history));
      return "saved";
    });
    if (outcome === "changed") return redirectResponse(`${backTo}&err=settlement_changed`);
    return redirectResponse(`${backTo}&msg=${outcome === "duplicate" ? "settlement_already_completed" : "settlement_completed"}`);
  } catch (err) {
    rememberOpsEvent({ kind: "settlement_history_save_failed", severity: "warn", path: "/my/settlement/save", method: "POST", detail: safeError(err) });
    if (/settings_rmw_busy/.test(safeError(err))) return redirectResponse(`${backTo}&err=settlement_busy`);
    return redirectResponse(`${backTo}&err=settlement_save_failed`);
  }
}

// /ready(플래그 켜짐)에 붙이는 준비 상태. ready 판정과 필수 표 목록에는 넣지 않는다(운영 /ready 는 필수 표 13개를 확인하고,
// DDL 적용 전에 이 표를 필수로 두면 /ready 가 실패한다). RPC 는 잘못된 uuid("")로 불러 본문을 실행하지 않고 존재만 본다.
async function refundRpcAvailable(env, name, body) {
  try {
    await supabase(env, `/rest/v1/rpc/${name}`, { method: "POST", headers: { Prefer: "return=minimal" }, body: JSON.stringify(body) });
    return true;
  } catch (error) {
    return !/PGRST202|Could not find the function/i.test(safeError(error));
  }
}

// V22.9.80 T-13: 카카오 삭제 직전에 이 기록에 걸린 환불 연결 수를 센다. 기록을 지우면 연결은 FK(CASCADE)로 함께 지워지고,
// 같은 id 로 복구해도 되살아나지 않는다 — 삭제·복구 답장이 그 사실을 말한다. 플래그가 꺼져 있거나 연결될 수 없는 기록(환급이 아닌 수입)이면
// undefined(버퍼에 칸을 붙이지 않는다), 연결 표가 없으면 0, 읽지 못하면 null(확인 불가 — 0 으로 바꾸지 않는다).
async function refundLinkCountForRow(env, householdId = "", row = {}) {
  if (!refundLinksEnabled(env)) return undefined;
  const id = String(row?.id || "").trim();
  const refundSide = isRefundIncomeRow(row);
  if (!householdId || !refundLinkIdValid(id) || (row?.type === "income" && !refundSide)) return undefined;
  try {
    const links = await fetchRefundLinkRows(env, householdId, refundSide ? { refundIds: [id] } : { expenseIds: [id] });
    return links.length;
  } catch (error) {
    if (isRefundLinksAbsentError(error)) return 0;
    rememberOpsEvent({ kind: "refund_link_count_read_failed", severity: "warn", path: "kakao:delete", method: "GET", detail: safeError(error) });
    return null;
  }
}

// V22.9.80 T-13: 전체 기간 JSON 백업에 담을 이 가계부의 환불 연결(거래 id 쌍). 연결 표가 없으면 빈 목록이고, 다른 읽기 실패는 던진다
// (V22.9.34 S10: 백업은 못 읽은 자료를 빈 값으로 넣지 않는다).
async function fetchRefundLinksForBackup(env, householdId = "") {
  const params = new URLSearchParams();
  params.set("select", REFUND_LINK_TABLE_SELECT);
  params.set("household_id", `eq.${householdId}`);
  params.set("order", "created_at.asc,id.asc");
  try {
    const rows = await fetchPostgrestRows(env, `/rest/v1/accountbook_refund_links?${params.toString()}`, { maxRows: 20000 });
    return safeArray(rows).filter((row) => String(row?.household_id || "") === String(householdId));
  } catch (error) {
    if (isRefundLinksAbsentError(error)) return [];
    throw error;
  }
}

// V22.9.80 T-12: 일괄 수정(관리자 화면·API)에서 환불과 연결된 기록 하나 때문에 전체가 실패하지 않게 한다. 먼저 예전처럼 한 번 보낸다
// (연결된 기록이 없으면 요청·결과가 예전과 같다). 트리거가 막았을 때만 연결과 행을 읽어 막힐 행을 고르고, 나머지로 한 번 더 보낸다.
// 일괄 RPC 는 한 트랜잭션이라 막힌 첫 요청은 아무것도 바꾸지 않았다. 고르지 못했거나(읽기 실패·예상 밖 규칙) 다시 막히면
// 그 잠금 오류를 그대로 던진다 — 호출부는 ‘환불과 연결된 기록이 있어 아무것도 바꾸지 않았다’고 알린다.
async function bulkUpdateSkippingRefundLocks(env, ids = [], householdId = "", patch = {}, options = {}) {
  try {
    const result = await bulkTransactionsAtomic(env, ids, householdId, patch, options);
    return { result, updatedIds: [...ids], skipped: [] };
  } catch (error) {
    if (!refundLinkLockedReason(error)) throw error;
    let locked = null;
    try {
      locked = await refundLockedIdsForBulkPatch(env, { ids, householdId, patch });
    } catch (readError) {
      rememberOpsEvent({ kind: "refund_link_bulk_lock_read_failed", severity: "warn", path: "/admin/bulk", method: "POST", detail: safeError(readError) });
      throw error;
    }
    if (!locked.size) throw error;
    const skipped = ids.filter((id) => locked.has(String(id))).map((id) => ({ id: String(id), reason: locked.get(String(id)) }));
    const rest = ids.filter((id) => !locked.has(String(id)));
    // 모두 막혔으면 트리거가 알려 준 오류(이유 포함)를 그대로 올리고, 어떤 기록이 왜 막혔는지만 붙인다.
    if (!rest.length) throw Object.assign(error, { refundLinkSkipped: skipped });
    const result = await bulkTransactionsAtomic(env, rest, householdId, patch, options);
    return { result, updatedIds: rest, skipped };
  }
}

async function refundLockedIdsForBulkPatch(env, { ids = [], householdId = "", patch = {} } = {}) {
  const [asExpense, asRefund] = await Promise.all([
    fetchRefundLinkRows(env, householdId, { expenseIds: ids }),
    fetchRefundLinkRows(env, householdId, { refundIds: ids }),
  ]);
  // 고른 행에 지출 쪽과 환급 쪽이 함께 있으면 같은 연결이 두 번 온다. 연결 id 로 한 번만 센다.
  const links = [...new Map([...safeArray(asExpense), ...safeArray(asRefund)].map((link) => [String(link?.id || ""), link])).values()];
  if (!links.length) return new Map();
  const wanted = [...new Set([...ids.map(String), ...links.flatMap((link) => [String(link.expense_id || ""), String(link.refund_id || "")])].filter(Boolean))];
  const rows = await fetchRowsByPlainIds(env, "transactions", wanted, "id,household_id,type,amount,category,transaction_date");
  const rowsById = new Map(safeArray(rows).filter((row) => String(row?.household_id || "") === String(householdId)).map((row) => [String(row.id), row]));
  return refundLinkLockedIdsForPatch({ ids, patch, links, rowsById });
}

async function refundLinksReadiness(env) {
  // V22.9.80 M-7: 표 점검은 홈·리포트가 쓰는 차감 읽기(환급·원지출 행을 함께 받는 외래키 이름)와 같은 모양으로 한다.
  // 외래키 이름이 SQL 과 달라 그 읽기가 실패하면 표가 있어도 "error" 다(플래그를 켜기 전에 운영자가 본다).
  const [table, link, unlink] = await Promise.all([
    supabase(env, `/rest/v1/accountbook_refund_links?${new URLSearchParams({ select: REFUND_DEDUCTION_SELECT, limit: "1" }).toString()}`, { method: "GET" }).then(() => "ok", (error) => (isRefundLinksAbsentError(error) ? "missing" : "error")),
    refundRpcAvailable(env, "accountbook_link_refund_v22979", { p_household_id: "", p_actor_user_id: "", p_expense_id: "", p_refund_id: "", p_amount: 0, p_expected: {} }),
    refundRpcAvailable(env, "accountbook_unlink_refund_v22979", { p_household_id: "", p_actor_user_id: "", p_link_id: "", p_expected_amount: 0 }),
  ]);
  const missingRpcs = [["accountbook_link_refund_v22979", link], ["accountbook_unlink_refund_v22979", unlink]].filter(([, available]) => !available).map(([name]) => name);
  return { enabled: true, available: table === "ok" && !missingRpcs.length, table, missing_rpcs: missingRpcs };
}
// @build:exports-start
export {
  bulkUpdateSkippingRefundLocks, fetchRefundLinksForBackup, handleRefundKeepPost,
  handleRefundLinkPicker, handleRefundLinkPost, handleRefundUnlinkPost,
  handleSettlementHistorySaveV22979, kakaoRefundSettlementLines, kakaoRefundSurplusLine,
  loadRefundDeductions, loadRefundLinkMonthState, refundLinkCountForRow, refundLinksReadiness,
  refundNettedMonthRows, refundSettlementSpenderRows, settlementRefundDigest,
  settlementRefundPageParts,
};
// @build:exports-end
