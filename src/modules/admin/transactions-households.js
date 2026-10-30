// @build:imports-start
import { boundedRuntimeNumber, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { HTML_HEADERS } from "../runtime/config-readiness.js";
import { appName } from "../public/site-config.js";
import { explicitDateIntent, moneyTokenSpans } from "../client/shared-input-parsers.js";
import {
  claimOperationLease, operationLeaseOwner, releaseOperationLease, safeError,
  withHouseholdDatabaseLease,
} from "../runtime/leases.js";
import {
  htmlResponse, jsonResponse, redirectResponse, wantsTransactionDeleteJson,
} from "../runtime/http.js";
import {
  checkAdminPassword, makeAdminSession, recordAuthAttempt, safeAdminReturnPath, trafficClientIp,
  verifyAdminSession,
} from "../auth/crypto-admin-session.js";
import { resolveManualInputClassification } from "../settings/payment-assets.js";
import { returnLocation, safeUserReturnPath } from "./bulk-and-return-paths.js";
import {
  bestRoleFromRows, fetchAdminRows, fetchHouseholdMembers, saveMemberAlias,
} from "../data/households-members-rows.js";
import { renderServerDashboardHtml, renderServerLoginHtml } from "./dashboard-page.js";
import { safeArray } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { refundLinkLockedCode } from "../domain/refund-links.js";
import { verifyUserSession } from "../auth/user-session.js";
import { makeDeleteRestoreTicket, makeQuickUndoTicket } from "../auth/identity-reauth.js";
import {
  fetchRawHouseholdMembers, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import {
  canWriteMyHousehold, memberRecordChangeError, memberRecordChangeMessage,
} from "../my/access-control.js";
import { activeSpenderExists, getTransactionForUserEdit } from "../my/transactions.js";
import { purgeHouseholdData } from "../my/households-lifecycle.js";
import { budgetAlertText, fetchBudgets } from "../domain/budgets.js";
import { renderTxEditSuggestionLists, renderV8TxEditForm } from "../my/home-sections.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { markKakaoGroupDeparture } from "../kakao/group-links-first-record.js";
import { markKakaoChatFirstHistory } from "../kakao/identity-chat-first.js";
import {
  getHouseholdMemberRoleStrict, isHouseholdRoleCheckFailure,
} from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import {
  currentMonthKst, extractDate, formatDate, nowKstDate, validMonth,
} from "../nlu/date-payment.js";
import {
  abTransactionRequestId, createManualTransaction, deleteTransactionWithAudit, escapeHtml,
  makeInviteCode, numberWithCommas, updateTransaction,
} from "../domain/transactions-core.js";
// @build:imports-end

async function handleAdminLogin(request, env) {
  const form = await request.formData();
  const password = String(form.get("password") || "").trim();
  const returnTo = safeAdminReturnPath(form.get("return_to") || "", "/?legacy=1");
  const admission = await recordAuthAttempt(env, request, "/login-admission", false, {limit:40});
  if (!admission.allowed) return htmlResponse(renderServerLoginHtml(env, "로그인 요청이 잠시 제한되었습니다.", returnTo), admission.unavailable ? 503 : 429);
  const attempt = await recordAuthAttempt(env, request, "/login", false);
  if (attempt.unavailable) return htmlResponse(renderServerLoginHtml(env, "로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", returnTo), 503);
  if (!attempt.allowed) {
    return htmlResponse(renderServerLoginHtml(env, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.", returnTo), 429, { "retry-after": "900" });
  }
  // V22.9.26: 관리자 비밀번호는 계정이 하나라 클라이언트와 무관한 전체 횟수도 센다.
  const adminAttempt = await recordAuthAttempt(env, request, "/login", false, { scope: "account", key: trafficClientIp(request) + "|admin", limit: boundedRuntimeNumber(env.AUTH_ACCOUNT_RATE_LIMIT, 30, 5, 200) });
  if (adminAttempt.unavailable) return htmlResponse(renderServerLoginHtml(env, "로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", returnTo), 503);
  if (!adminAttempt.allowed) {
    return htmlResponse(renderServerLoginHtml(env, "로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.", returnTo), 429, { "retry-after": "900" });
  }
  let passwordOk = false;
  try {
    passwordOk = await checkAdminPassword(env, password);
  } catch (err) {
    // V22.9.34 감사 S8: 비밀번호 상태를 확인하지 못하면 열지 않고 잠시 뒤 다시 시도하게 한다.
    rememberOpsEvent({ kind: "admin_login_security_unavailable", severity: "error", path: "/login", method: "POST", detail: safeError(err) });
    return htmlResponse(renderServerLoginHtml(env, "로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.", returnTo), 503);
  }
  if (!passwordOk) {
    return htmlResponse(renderServerLoginHtml(env, "비밀번호가 맞지 않습니다.", returnTo), 401);
  }
  await recordAuthAttempt(env, request, "/login", true);
  await recordAuthAttempt(env, request, "/login", true, { scope: "account", key: trafficClientIp(request) + "|admin" });
  try {
    const session = await makeAdminSession(env);
    return redirectResponse(returnTo, {
      "set-cookie": `ab_admin=${encodeURIComponent(session)}; Path=/; Max-Age=43200; HttpOnly; Secure; SameSite=Lax`,
    });
  } catch (err) {
    return htmlResponse(renderServerLoginHtml(env, "운영 보안키가 설정되지 않아 로그인할 수 없습니다. ADMIN_SESSION_SECRET을 먼저 설정하세요.", returnTo), 503);
  }
}

function handleAdminLogout() {
  return redirectResponse("/", {
    "set-cookie": "ab_admin=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax",
  });
}

async function handleAdminPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) {
    const returnTo = safeAdminReturnPath(url?.searchParams?.get("return_to") || "", "/?legacy=1");
    return htmlResponse(renderServerLoginHtml(env, "", returnTo));
  }
  return htmlResponse(await renderServerDashboardHtml(env, url));
}

function dashboardQuery(month, householdId, extra = {}) {
  const qs = new URLSearchParams();
  qs.set("legacy", "1");
  if (month) qs.set("month", month);
  if (householdId) qs.set("household_id", householdId);
  for (const [k, v] of Object.entries(extra)) {
    if (v !== undefined && v !== null && String(v) !== "") qs.set(k, String(v));
  }
  const text = qs.toString();
  return text ? `/?${text}` : "/?legacy=1";
}

function isValidTransactionDateString(value) {
  const v = String(value || "").trim();
  if (!/^20\d{2}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}

function normalizeTransactionType(value) {
  return String(value || "expense").trim() === "income" ? "income" : "expense";
}

// 거래 금액 상한. 초과 입력은 double 정밀도를 벗어나 값이 조용히 바뀌고
// 월 합계 표시가 무너지므로 저장 전에 차단한다.
const MAX_TRANSACTION_AMOUNT = 2_000_000_000;

// 폼의 금액 칸은 사용자가 이미 금액으로 확정한 값이므로 카카오 발화용
// 자연어 추출기(extractAmount)를 거치지 않는다. 추출기는 문장에서 "3인분"
// 같은 표현을 금액으로 오인하지 않으려고 4자리 미만 숫자를 후보에서
// 제외하는데, 그 규칙이 전용 입력 칸까지 적용되면 500원 같은 정상 입력이
// 거부된다.
function parseFormAmountValue(value) {
  const match = String(value ?? "").match(/^\s*(?:[₩￦]\s*)?(\d+|\d{1,3}(?:,\d{3})+)(?:\s*원)?\s*$/);
  if (!match) return 0;
  const amount = Number(match[1].replace(/,/g, ""));
  return Number.isSafeInteger(amount) ? amount : 0;
}

function readTransactionAmount(form) {
  return parseFormAmountValue(form.get("amount"));
}

// 비어 있거나 숫자가 아닌 입력과 사용자가 의도한 0을 구분한다. 둘을 함께
// 0으로 뭉개면 잘못된 입력이 기존 예산을 조용히 0원으로 덮어쓰면서도
// 저장 성공으로 안내된다.
function readOptionalFormAmount(form, field = "amount") {
  const raw = String(form.get(field) ?? "");
  if (!/^\s*(?:[₩￦]\s*)?(?:\d+|\d{1,3}(?:,\d{3})+)(?:\s*원)?\s*$/.test(raw)) return null;
  const amount = parseFormAmountValue(raw);
  return Number.isSafeInteger(Number(raw.replace(/[₩￦원,\s]/g, ""))) ? amount : null;
}

function validateRecordFormFields({ id = "", householdId = "", amount = 0, transactionDate = "", mode = "add" }) {
  if ((mode === "update" || mode === "delete") && !String(id || "").trim()) return "거래 ID가 없습니다.";
  if (mode !== "delete" && !String(householdId || "").trim()) return "가계부를 선택하세요.";
  if (mode !== "delete" && (!Number.isSafeInteger(Number(amount)) || Number(amount) <= 0)) return "금액을 입력하세요.";
  if (mode !== "delete" && Number(amount) > MAX_TRANSACTION_AMOUNT) return `금액은 ${numberWithCommas(MAX_TRANSACTION_AMOUNT)}원 이하로 입력하세요.`;
  if (mode !== "delete" && !isValidTransactionDateString(transactionDate)) return "날짜 형식이 올바르지 않습니다.";
  return "";
}

// 세션이 풀린 채로 저장하면 예전 관리자 화면(/?legacy=1)으로 던져져, 왜 안 됐는지도
// 모르고 적어 둔 내용도 잃었다. 쓰던 화면으로 돌아올 수 있게 로그인으로 보낸다.
function signedOutWriteRedirect(form) {
  const back = safeUserReturnPath(String(form?.get?.("return_to") || ""), "");
  if (!back) return "/?legacy=1";
  let target;
  try { target = new URL(back, "https://accountbook.local"); }
  catch (_error) { return "/?legacy=1"; }
  target.searchParams.set("err", "로그인이 풀려서 저장하지 못했습니다. 다시 로그인하면 적어 두신 내용이 그대로 있습니다.");
  target.searchParams.set("quick", "1");
  return `/my?return_to=${encodeURIComponent(`${target.pathname}${target.search}`)}`;
}

function transactionReturnFallback(month, householdId, extra = {}) {
  return dashboardQuery(month, householdId, { tab: "transactions", ...extra });
}

// V22.9.79 D-27: 역할 조회(household_members)가 503·시간 초과로 실패하면 예전에는 getHouseholdMemberRole 이 빈 역할을 돌려줘
// "기록 입력 권한이 없습니다"·"이 기록을 수정할 권한이 없습니다"·"고정지출 저장 권한이 없습니다"로 안내했다. 권한이 있는 사람에게 권한이 없다고 말한 것이다.
// V22.9.76 이 가계부 이름 바꾸기·나가기·참여자 권한에 적용한 엄격 조회를 여기에도 쓴다. 조회가 실패하면 ok=false 에 lookupFailed·lookupMessage 를
// 실어 돌려준다. 호출한 화면은 거절 문구 대신 안내를 보여 준다(아무것도 바꾸지 않았다는 말과 다시 시도하라는 말). 쿼리로 돌아가는 화면은 lookupCode(formatMessage 가
// 아는 코드 — 자유 문장은 일반 안내로 닫힌다), JSON·조각 응답은 lookupMessage 문장을 쓴다.
const TRANSACTION_ROLE_CHECK_FAILED_MESSAGE = "권한을 확인하지 못해 아무것도 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.";
async function resolveTransactionAccess(request, env, householdId, { manageOnly = false } = {}) {
  if (await verifyAdminSession(request, env)) return { ok: true, admin: true, userId: "", role: "admin" };
  const userId = await verifyUserSession(request, env);
  if (!userId || !householdId) return { ok: false, admin: false, userId: userId || "", role: "" };
  let role = "";
  try {
    role = String(await getHouseholdMemberRoleStrict(env, userId, householdId) || "").toLowerCase();
  } catch (err) {
    if (!isHouseholdRoleCheckFailure(err)) throw err;
    rememberOpsEvent({ kind: "household_role_check_failed", severity: "warn", path: new URL(request.url).pathname, method: request.method, detail: safeError(err) });
    return { ok: false, admin: false, userId, role: "", lookupFailed: true, lookupCode: "household_role_check_failed", lookupMessage: TRANSACTION_ROLE_CHECK_FAILED_MESSAGE };
  }
  const ok = manageOnly ? ["owner", "admin"].includes(role) : canWriteMyHousehold(role) && !!role;
  return { ok, admin: false, userId, role };
}

// V22.9.80 T-34: 기록 입력·수정·삭제를 거절한 이유를 formatMessage 가 아는 코드로 돌려준다. 예전에는 "기록 입력 권한이 없습니다." 같은 자유 문장을 주소의 err 에 실어,
// 코드만 안내로 바꾸는 홈·정기 화면이 ‘입력값을 확인한 뒤 다시 시도해 주세요’로 닫았다 — 조회 전용·이용 제한이 입력 오류처럼 보였다.
//   - 역할 조회 실패(lookupCode)는 그대로 돌려준다.
//   - 새 기록 입력(row 를 넘기지 않음): 조회 전용·승인 대기·이용 제한·참여자 아님을 역할별 코드로 말한다.
//   - 기존 기록을 가리키는 요청(수정·삭제): 그 기록이 요청이 말한 가계부(householdId)의 것일 때만 역할별로 말하고, 기록이 없거나 다른 가계부의 것이거나 남의 기록이면
//     모두 같은 not_my_record 다. 기록 id 가 어느 가계부에 있는지(또는 없는지)가 거절 문구 차이로 새지 않게 한다 — 예전 문장도 모든 경우에 같았다.
function transactionDenialCode(access = {}, { row, householdId = "" } = {}) {
  if (access.lookupCode) return access.lookupCode;
  const role = String(access.role || "").toLowerCase();
  const rowScoped = row === undefined || (!!row && String(row.household_id || "") === String(householdId || ""));
  if (rowScoped) {
    if (role === "viewer") return "write_denied_viewer";
    if (role === "pending") return "write_denied_pending";
    if (role === "blocked") return "write_denied_blocked";
    if (!role && row === undefined) return "write_denied_not_member";
  }
  return "not_my_record";
}

async function fetchTransactionRowById(env, id) {
  if (!id) return null;
  const rows = await supabase(env, `/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&select=id,household_id,user_id&limit=1`, { method: "GET" }) || [];
  return rows[0] || null;
}

async function fetchTransactionRowsByIds(env, ids = []) {
  const clean = [...new Set(safeArray(ids).map((id) => String(id || "").trim()).filter((id) => /^[0-9a-fA-F-]{20,80}$/.test(id)))];
  const rows = [];
  for (let i = 0; i < clean.length; i += 80) {
    const chunk = clean.slice(i, i + 80);
    const params = new URLSearchParams();
    params.set("id", `in.(${chunk.join(",")})`);
    params.set("select", "id,household_id,user_id");
    params.set("limit", String(chunk.length));
    rows.push(...safeArray(await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" })));
  }
  return rows;
}

function transactionAddRedirectExtras(form, extra = {}, mode = "success") {
  const out = { ...extra };
  const raw = String(form.get("return_to") || "");
  if (!raw.startsWith("/app") || raw.startsWith("//")) return out;
  if (mode === "success") out.day_detail = "1";
  else out.quick = "1";
  return out;
}

async function handleAdminAddTransaction(request, env) {
  const form = await request.formData();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const access = await resolveTransactionAccess(request, env, householdId);
  if (!access.ok) {
    if (!access.admin && access.userId) { const denied = transactionDenialCode(access); return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: denied }), transactionAddRedirectExtras(form, { err: denied }, "error"))); }
    return redirectResponse(signedOutWriteRedirect(form));
  }
  const txType = normalizeTransactionType(form.get("type"));
  const transactionDate = String(form.get("transaction_date") || (form.get("quick_manual_date") === "1" ? "" : formatDate(nowKstDate()))).trim();
  const amount = readTransactionAmount(form);
  const smartText=String(form.get("raw_text") || "");
  if (/(?:결제|승인)\s*취소/.test(smartText) && !/(?:^|\s)(?:수입|지출)(?=\s|$)/.test(smartText) && form.get("quick_manual_type")!=="1") {
    const err="취소 내역은 수입 또는 지출을 직접 선택한 뒤 저장해 주세요.";
    return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err}),transactionAddRedirectExtras(form,{err},"error")));
  }
  if (/\d+,\d{1,2}(?!\d)/.test(smartText) && form.get("quick_manual_amount")!=="1") return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"amount_required"}),transactionAddRedirectExtras(form,{err:"amount_required"},"error")));
  if (explicitDateIntent(smartText) && !extractDate(smartText) && form.get("quick_manual_date")!=="1") return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"invalid_date"}),transactionAddRedirectExtras(form,{err:"invalid_date"},"error")));
  // 문장 속 날짜를 서버에서도 다시 풀어, 날짜를 직접 고치지 않았는데 폼 날짜와 다르면 저장하지 않는다(QA B04).
  // 배포 전에 열어 둔 화면처럼 요일 표현을 못 읽는 옛 스크립트가 오늘 날짜를 보내도 다른 날로 집계되지 않는다.
  if (explicitDateIntent(smartText) && form.get("quick_manual_date")!=="1" && extractDate(smartText) && extractDate(smartText)!==transactionDate) return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"invalid_date"}),transactionAddRedirectExtras(form,{err:"invalid_date"},"error")));
  // V22.9.34 감사 N11: 문장 속 금액이 단위 없는 한 자리 숫자("택시 7")뿐이면 7원으로 저장하지 않는다.
  // 정말 그 금액이면 "7원"처럼 원을 붙이거나 금액 칸을 직접 고치면 저장된다.
  const smartSpans = smartText ? moneyTokenSpans(smartText) : [];
  if (smartText && !smartSpans.length && form.get("quick_manual_amount") !== "1" && (form.get("quick_manual_amount") === "0" || /[+\-\u2212\uFE63\uFF0D\uFF0B]\s*(?:[₩￦원]\s*)?\d|\d+\.\d+|\d[eE][+-]?\d/.test(smartText))) {
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "amount_required" }), transactionAddRedirectExtras(form, { err: "amount_required" }, "error")));
  }
  if (smartSpans.length === 1 && smartSpans[0].amount < 10 && !/[원십백천만억]/.test(smartSpans[0].raw) && form.get("quick_manual_amount") !== "1") return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"amount_unit_required"}),transactionAddRedirectExtras(form,{err:"amount_unit_required"},"error")));
  const validationError = validateRecordFormFields({ householdId, amount, transactionDate, mode: "add" });
  if (validationError) {
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: validationError }), transactionAddRedirectExtras(form, { err: validationError }, "error")));
  }
  const requestId = abTransactionRequestId(form.get("request_id")) || crypto.randomUUID();
  try {
    const isManager = access.admin || ["owner", "admin"].includes(access.role);
    const requestedUserId = String(form.get("user_id") || "").trim();
    if (access.admin && !requestedUserId) {
      const error = "지출자를 선택하세요. 관리자 계정은 지출자로 자동 지정되지 않습니다.";
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: error }), transactionAddRedirectExtras(form, { err: error }, "error")));
    }
    if (isManager && requestedUserId) {
      const members = await fetchHouseholdMembers(env, householdId);
      if (!activeSpenderExists(members, requestedUserId)) {
        const error = "선택한 지출자가 이 가계부의 참여자가 아닙니다.";
        return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: error }), transactionAddRedirectExtras(form, { err: error }, "error")));
      }
    }
    const rawText = String(form.get("raw_text") || "").trim();
    const memoText = String(form.get("memo") || "").trim();
    const manualClass = await resolveManualInputClassification(env, householdId, txType, {
      raw_text: rawText,
      memo: memoText,
      category: String(form.get("category") || "").trim(),
      payment_method: String(form.get("payment_method") || "").trim(),
      manual_category: form.get("quick_manual_category") === "1",
      manual_payment: form.get("quick_manual_payment") === "1",
      // V22.9.80 T-18: 빠른 입력이 문장에서 채운 메모("0")는 분류 판정에 다시 넣지 않는다(표식이 없으면 예전처럼 넣는다).
      manual_memo: form.get("quick_manual_memo") === null ? undefined : form.get("quick_manual_memo") === "1",
    });
    const savedTransaction = await createManualTransaction(env, {
      household_id: householdId,
      type: txType,
      transaction_date: transactionDate,
      amount,
      category: manualClass.category,
      memo: memoText,
      payment_method: manualClass.payment_method,
      user_id: isManager ? (requestedUserId || access.userId) : access.userId,
      source: access.admin ? "web_admin" : "web_user",
      raw_text: rawText,
    }, { requestId, preserveEmptyCategory: form.get("quick_manual_category") === "1" && manualClass.category === "", autoMemo: form.get("quick_manual_memo") === "0" && rawText !== "" });
    if (savedTransaction?.__idempotent_replay && !savedTransaction.__replay_same) throw Object.assign(new Error("transaction_request_conflict"), { code: "transaction_request_conflict" });
    const msg = savedTransaction?.__idempotent_replay ? "already_saved" : savedTransaction?.__duplicate_skipped ? "duplicate_skipped" : "added";
    let balert = "";
    try {
      if (txType !== "income" && householdId) {
        const savedCategory = manualClass.category;
        // V22.9.37 감사 D9: 예산 안내는 보고 있던 달(폼의 month)이 아니라 기록한 날짜의 달 기준이다.
        const recordMonth = validMonth(String(transactionDate).slice(0, 7)) || month;
        const budgets = await fetchBudgets(env, householdId, recordMonth);
        const rowsNow = await fetchAdminRows(env, { month: recordMonth, householdId, type: "all" });
        balert = budgetAlertText(rowsNow, budgets, savedCategory);
      }
    } catch (_) {}
    const receipt = String(savedTransaction?.id || "") === requestId && !savedTransaction?.__duplicate_skipped
      ? { saved_rid: requestId, saved_qd: abTransactionRequestId(form.get("quick_draft_token")) } : {};
    // V22.9.87 T-16: 로그인 사용자(관리자 세션 아님)가 이번 요청으로 새로 만든 기록이면(msg=added — 다시 보낸 요청의 already_saved 는 아니다)
    // 저장 알림의 실행 취소 표(60초)를 함께 싣는다. 만들 수 없으면(비밀 없음·오류) 빈 값이고, 화면은 단추 대신 수정·삭제 화면 링크를 둔다.
    // 표는 서명을 다시 확인하는 /my/undo 만 받는다.
    const undo = msg === "added" && receipt.saved_rid && !access.admin && access.userId
      ? await makeQuickUndoTicket(env, { row: savedTransaction, householdId, userId: access.userId }).catch(() => "") : "";
    const saved = { msg, ...receipt, ...(undo ? { undo } : {}), ...(balert ? { balert } : {}) };
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg }), transactionAddRedirectExtras(form, saved, "success")));
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_create_failed", severity: "warn", path: "/admin/transactions", method: "POST", detail: safeError(err) });
    const message = isUncertainStorageWrite(err) ? "db_write_unknown" : err?.code === "transaction_request_conflict" ? "request_conflict" : "거래내역을 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.";
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: message, rid: requestId }), transactionAddRedirectExtras(form, { err: message, rid: requestId }, "error")));
  }
}

async function handleAdminDeleteTransaction(request, env) {
  const wantsJson = wantsTransactionDeleteJson(request);
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  if (wantsJson && (!id || !householdId || id.length > 120 || householdId.length > 120)) {
    return jsonResponse({ ok: false, error: "invalid_scope", message: "가계부와 거래 ID를 확인해 주세요." }, 400);
  }
  const targetRow = await fetchTransactionRowById(env, id);
  const rowHousehold = String(targetRow?.household_id || householdId || "");
  const access = await resolveTransactionAccess(request, env, rowHousehold);
  const isManager = access.admin || ["owner", "admin"].includes(access.role);
  const ownRow = targetRow && access.userId && String(targetRow.user_id || "") === String(access.userId);
  if (wantsJson) {
    if (!access.admin && !access.userId) return jsonResponse({ ok: false, error: "unauthorized", message: "로그인이 만료되었습니다. 다시 로그인해 주세요." }, 401);
    if (access.lookupFailed) return jsonResponse({ ok: false, error: "role_check_failed", message: access.lookupMessage }, 503);
    if (!access.ok) return jsonResponse({ ok: false, error: "forbidden", message: "이 기록을 삭제할 권한이 없습니다." }, 403);
    if (!targetRow || rowHousehold !== householdId) return jsonResponse({ ok: false, error: "record_not_found", message: "이 가계부에서 기록을 찾지 못했습니다." }, 404);
    if (!isManager && !ownRow) return jsonResponse({ ok: false, error: "forbidden", message: "이 기록을 삭제할 권한이 없습니다." }, 403);
  }
  if (!access.ok || !targetRow || (!isManager && !ownRow)) {
    if (!access.admin && access.userId) { const denied = transactionDenialCode(access, { row: targetRow, householdId }); return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: denied }), { err: denied })); }
    return redirectResponse(signedOutWriteRedirect(form));
  }
  // V22.9.43: 구성원 권한이 ‘기록만’이면 자기 기록이어도 지우지 못한다(소유자·관리자는 그대로).
  if (!isManager) {
    const policyError = await memberRecordChangeError(env, access.role, rowHousehold);
    if (policyError) return wantsJson ? jsonResponse({ ok: false, error: "record_policy_denied", message: memberRecordChangeMessage(policyError) }, 403) : redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: policyError }), { err: policyError }));
  }
  const validationError = validateRecordFormFields({ id, mode: "delete" });
  if (validationError) {
    if (wantsJson) return jsonResponse({ ok: false, error: "invalid_record", message: validationError }, 400);
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: validationError }), { err: validationError }));
  }
  try {
    const result = await deleteTransactionWithAudit(env, id, rowHousehold, { actorUserId: access.userId || null, actorKind: access.admin ? "admin" : "user" });
    if (!result || result.deleted !== true || String(result.id || "") !== id) {
      const error = new Error("transaction_delete_confirmation_missing");
      error.uncertain_write = true;
      throw error;
    }
    // V22.9.90(사용자 피드백 2026-10-30): 로그인 사용자(관리자 세션 아님)가 지운 기록이면 ‘되돌리기’ 표(60초, /my/restore 만 받음)를
    // 돌아갈 주소의 restore 에 싣는다(T-16 실행 취소 표 undo 와 같은 방식). 홈 알림이 그 표로 ‘되돌리기’ 단추를 그린다. 만들지 못하면(비밀 없음·오류)
    // 싣지 않고, 돌아갈 주소에 남아 있던 앞선 삭제의 표도 지운다(단추가 다른 기록을 되살리지 않게).
    const restoreTicket = !access.admin && access.userId
      ? await makeDeleteRestoreTicket(env, { transactionId: id, householdId: rowHousehold, userId: access.userId }).catch(() => "") : "";
    const returned = new URL(returnLocation(form, transactionReturnFallback(month, householdId, { msg: "deleted" }), { msg: "deleted" }), "https://dummy.local");
    returned.searchParams.delete("restore");
    if (restoreTicket) returned.searchParams.set("restore", restoreTicket);
    const location = returned.pathname + returned.search + returned.hash;
    if (wantsJson) return jsonResponse({ ok: true, deleted: true, transaction_id: id, household_id: rowHousehold, location });
    return redirectResponse(location);
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_delete_failed", severity: "warn", path: "/admin/transactions/delete", method: "POST", detail: safeError(err) });
    const uncertain = isUncertainStorageWrite(err);
    const message = uncertain ? "삭제 결과를 확인하지 못했습니다. 같은 기록을 다시 삭제하지 말고 목록에서 확인해 주세요." : "거래내역을 삭제하지 못했습니다. 기존 기록은 유지됩니다.";
    if (wantsJson) return jsonResponse({ ok: false, error: uncertain ? "db_write_unknown" : "record_delete_failed", uncertain, message }, 503);
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: message }), { err: message }));
  }
}

// V22.8.86 통합 작업지시서 4.5. 카드에서 뺀 수정 폼을 돌려주는 자리.
// 두 가지 얼굴을 가진다: fragment=1 이면 <form> 만, 아니면 링크로 도달하는 온전한 화면.
// 후자가 있어야 JS 가 없거나 늦어도 수정·삭제에 도달할 수 있다(점진적 향상).
// 권한 판정은 handleAdminUpdateTransaction 과 같은 식을 쓴다 — 여기서 느슨해지면
// 폼을 못 받게 하는 것이 아니라 남의 기록 내용을 보여 주게 된다.
async function handleTransactionEditPage(request, env, url) {
  const id = String(url.searchParams.get("id") || "").trim();
  const wantsFragment = url.searchParams.get("fragment") === "1";
  const targetRow = await fetchTransactionRowById(env, id);
  const rowHousehold = String(targetRow?.household_id || "");
  const access = await resolveTransactionAccess(request, env, rowHousehold);
  const isManager = access.admin || ["owner", "admin"].includes(access.role);
  const ownRow = targetRow && access.userId && String(targetRow.user_id || "") === String(access.userId);
  const month = validMonth(String(targetRow?.transaction_date || "").slice(0, 7)) || currentMonthKst();
  const fallbackPath = `/app?month=${encodeURIComponent(month)}${rowHousehold ? `&household_id=${encodeURIComponent(rowHousehold)}` : ""}`;
  const backTo = safeUserReturnPath(url.searchParams.get("return_to") || "", fallbackPath);

  if (!access.ok || !targetRow || (!isManager && !ownRow)) {
    const denied = access.lookupMessage || "이 기록을 수정할 권한이 없습니다.";
    if (wantsFragment) {
      // 조각 요청에는 리다이렉트가 쓸모없다. 슬롯에 그대로 넣을 수 있는 문장을 준다.
      return new Response(`<p class="v8-editError">${escapeHtml(denied)}</p>`, {
        status: access.lookupFailed ? 503 : 403,
        headers: { ...HTML_HEADERS },
      });
    }
    if (!access.admin && access.userId) {
      const target = new URL(backTo, "https://accountbook.local");
      // V22.9.80 T-34: 돌아가는 화면(홈)은 코드만 안내로 바꾼다 — 조각용 문장(denied)을 주소에 싣지 않는다. 이 화면의 권한은 기록이 속한 가계부(rowHousehold)로 판정했으므로 그 가계부를 범위로 쓴다.
      target.searchParams.set("err", transactionDenialCode(access, { row: targetRow, householdId: rowHousehold }));
      return redirectResponse(`${target.pathname}${target.search}`);
    }
    return redirectResponse(`/my?return_to=${encodeURIComponent(backTo)}`);
  }
  // V22.9.43: 구성원 권한이 ‘기록만’이면 자기 기록이어도 수정 폼을 주지 않는다(소유자·관리자는 그대로).
  if (!isManager) {
    const policyError = await memberRecordChangeError(env, access.role, rowHousehold);
    if (policyError) {
      const message = memberRecordChangeMessage(policyError);
      if (wantsFragment) return new Response(`<p class="v8-editError">${escapeHtml(message)}</p>`, { status: 403, headers: { ...HTML_HEADERS } });
      const target = new URL(backTo, "https://accountbook.local");
      target.searchParams.set("err", policyError);
      return redirectResponse(`${target.pathname}${target.search}`);
    }
  }

  // 권한 판정용 조회(fetchTransactionRowById)는 id·가계부·지출자 세 칸만 가져온다. 운영 DB 는 요청한 칸만
  // 돌려주므로 그 행으로 폼을 그리면 금액·날짜·분류가 빈 폼이 되고, 그대로 저장하면 기록을 덮어쓴다.
  // 그래서 폼은 같은 가계부 범위의 전체 행으로 그린다(V22.9.33 감사 T1).
  const [members, editRow] = await Promise.all([
    fetchHouseholdMembers(env, rowHousehold),
    getTransactionForUserEdit(env, id, rowHousehold),
  ]);
  if (!editRow) {
    const missing = "기록을 찾지 못했습니다. 화면을 새로고침해 주세요.";
    if (wantsFragment) return new Response(`<p class="v8-editError">${escapeHtml(missing)}</p>`, { status: 404, headers: { ...HTML_HEADERS } });
    return redirectResponse(backTo);
  }
  // V22.9.90: 로그인 사용자(관리자 세션 아님)가 지우면 돌아간 홈에 ‘되돌리기’가 있다(handleAdminDeleteTransaction 의 restore 표). 그때만 묻지 않고 바로 지운다.
  const formHtml = renderV8TxEditForm(editRow, backTo, members, isManager, { restorableDelete: !access.admin && !!access.userId });
  if (wantsFragment) {
    // 개인 기록이므로 캐시에 남기지 않는다.
    return new Response(formHtml, {
      status: 200,
      headers: { ...HTML_HEADERS },
    });
  }

  // V22.9.34 감사 T1b: 제목 아래 설명도 권한 판정용 좁은 행이 아니라 전체 행으로 쓴다(예전에는 늘 "기록").
  const memo = editRow.memo || editRow.raw_text || "기록";
  const title = escapeHtml(appName(env));
  // V22.9.79 V44 F-3: 온전한 수정 화면은 폼의 분류·결제수단 칸이 가리키는 제안 목록(datalist)을 폼 뒤에 함께 싣는다(조각에는 싣지 않는다).
  // V22.9.79 F-4: 이 화면은 홈 스타일시트(.v8-edit 격자)를 받지 않아 긴 표시 이름이 든 지출자 select 가 폼 밖(R=620 @360px)으로 나갔다. 폼·라벨을 한 열 격자(minmax(0,1fr))로 두고 입력칸이 줄어들게 한다.
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>기록 수정 · ${title}</title><style>.wrap{max-width:640px;margin:0 auto;padding:16px}.txEditHead{margin:0 0 12px}.txEditHead h1{font-size:20px;margin:0 0 4px}.txEditBack{display:inline-flex;min-height:44px;align-items:center}.v8-edit,.v8-edit-field{display:grid;gap:8px;grid-template-columns:minmax(0,1fr)}.v8-edit-field>span{font-size:12px;font-weight:800}.v8-edit select,.v8-edit input{min-width:0;max-width:100%;width:100%}</style></head><body>${renderUnifiedNav("transactions", { role: access.role })}<main class="wrap" id="main"><section class="txEditHead"><h1>기록 수정</h1><p class="muted">${escapeHtml(String(targetRow.transaction_date || ""))} · ${escapeHtml(memo)}</p></section><section class="card">${formHtml}${renderTxEditSuggestionLists(editRow)}</section><p><a class="txEditBack" href="${escapeHtml(backTo)}">돌아가기</a></p></main></body></html>`);
}

async function handleAdminUpdateTransaction(request, env) {
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const householdId = String(form.get("household_id") || "").trim();
  const targetRow = await fetchTransactionRowById(env, id);
  const rowHousehold = String(targetRow?.household_id || householdId || "");
  const access = await resolveTransactionAccess(request, env, rowHousehold);
  const isManager = access.admin || ["owner", "admin"].includes(access.role);
  const ownRow = targetRow && access.userId && String(targetRow.user_id || "") === String(access.userId);
  if (!access.ok || !targetRow || (!isManager && !ownRow)) {
    if (!access.admin && access.userId) { const denied = transactionDenialCode(access, { row: targetRow, householdId }); return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: denied }), { err: denied })); }
    return redirectResponse(signedOutWriteRedirect(form));
  }
  // V22.9.43: 구성원 권한이 ‘기록만’이면 자기 기록이어도 고치지 못한다(소유자·관리자는 그대로).
  if (!isManager) {
    const policyError = await memberRecordChangeError(env, access.role, rowHousehold);
    if (policyError) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: policyError }), { err: policyError }));
  }
  const typeValues = form.getAll("type").map((v) => String(v || "").trim()).filter(Boolean);
  // V22.9.34 감사 SIM-1: 같은 폼에 서로 다른 type 이 함께 오면(필터 hidden 칸 등) 어느 쪽도 고르지 않고 저장하지 않는다.
  if (new Set(typeValues.map(normalizeTransactionType)).size > 1) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "ambiguous_field" }), { err: "ambiguous_field" }));
  const transactionDate = String(form.get("transaction_date") || formatDate(nowKstDate())).trim();
  const amount = readTransactionAmount(form);
  const validationError = validateRecordFormFields({ id, householdId, amount, transactionDate, mode: "update" });
  if (validationError) {
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: validationError }), { err: validationError }));
  }
  const requestedUserId = String(form.get("user_id") || "").trim();
  if (access.admin && !requestedUserId) {
    const error = "지출자를 선택하세요. 기존 지출자를 유지하려면 현재 참여자를 다시 선택하세요.";
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: error }), { err: error }));
  }
  let members = [];
  if (isManager && requestedUserId) {
    members = await fetchHouseholdMembers(env, rowHousehold);
    if (!activeSpenderExists(members, requestedUserId)) {
      const error = "선택한 지출자가 이 가계부의 참여자가 아닙니다.";
      return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: error }), { err: error }));
    }
  }
  // V22.9.34 proto (B14): only the fields present in the form are candidates, and with orig_* only the ones the user changed.
  const submitted = Object.create(null);
  if (typeValues.length) submitted.type = typeValues[typeValues.length - 1];
  if (form.has("transaction_date")) submitted.transaction_date = transactionDate;
  submitted.amount = amount;
  for (const key of ["category", "memo", "payment_method"]) if (form.has(key)) submitted[key] = String(form.get(key) || "").trim();
  if (isManager && requestedUserId) submitted.user_id = requestedUserId;
  const original = form.has("orig_amount") ? Object.fromEntries(AB_EDIT_FIELDS.filter((key) => form.has(`orig_${key}`)).map((key) => [key, String(form.get(`orig_${key}`) || "")])) : null;
  let lease = null;
  try {
    lease = await claimOperationLease(env, { key: `transaction-edit:${id}`, owner: operationLeaseOwner("transaction-edit"), leaseSeconds: 30 });
    if (!lease.acquired) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "edit_busy" }), { err: "edit_busy" }));
    const current = await getTransactionForUserEdit(env, id, rowHousehold);
    if (!current) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "record_not_found" }), { err: "record_not_found" }));
    const plan = planTransactionEdit(current, submitted, original);
    if (plan.conflicts.length) {
      if (!members.length) members = await fetchHouseholdMembers(env, rowHousehold);
      const backTo = safeUserReturnPath(String(form.get("return_to") || ""), `/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(rowHousehold)}`);
      return htmlResponse(renderTransactionEditConflictHtml(env, current, plan.conflicts, backTo, members, isManager), 409);
    }
    if (Object.keys(plan.patch).length) {
      await updateTransaction(env, id, plan.patch, { householdId: rowHousehold, actorUserId: access.userId || null, actorKind: access.admin ? "admin" : "user" });
    }
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg: "updated" }), { msg: "updated" }));
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_update_failed", severity: "warn", path: "/admin/transactions/update", method: "POST", detail: safeError(err) });
    // V22.9.80 T-12: 환불 연결 보호 트리거가 막은 수정은 ‘수정하지 못했다’가 아니라 이유별 코드로 돌려보낸다(formatMessage 표).
    const message = isUncertainStorageWrite(err) ? "edit_unknown" : refundLinkLockedCode(err) || "record_update_failed";
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: message }), { err: message }));
  } finally {
    if (lease) await releaseOperationLease(env, lease);
  }
}

const AB_EDIT_FIELDS = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"];
const AB_EDIT_LABELS = { type: "구분", transaction_date: "날짜", amount: "금액", category: "분류", memo: "내용", payment_method: "결제수단", user_id: "지출자" };

function abEditValue(field, value) {
  if (field === "amount") return parseFormAmountValue(value);
  if (field === "type") return normalizeTransactionType(value);
  return String(value ?? "").trim();
}

function planTransactionEdit(current = {}, submitted = {}, original = null) {
  const patch = Object.create(null);
  const conflicts = [];
  for (const field of AB_EDIT_FIELDS) {
    if (!Object.hasOwn(submitted, field)) continue;
    const next = abEditValue(field, submitted[field]);
    const now = abEditValue(field, current[field]);
    if (original && Object.hasOwn(original, field)) {
      const before = abEditValue(field, original[field]);
      if (next === before) continue;
      if (now !== before && now !== next) { conflicts.push({ field, label: AB_EDIT_LABELS[field], now, before, next }); continue; }
      if (now !== next) patch[field] = next;
    } else if (now !== next) {
      patch[field] = next;
    }
  }
  return { patch, conflicts };
}

function abEditOriginalFields(t = {}) {
  return AB_EDIT_FIELDS.map((field) => `<input type="hidden" name="orig_${field}" value="${escapeHtml(field === "type" ? (t.type === "income" ? "income" : "expense") : String(t[field] ?? ""))}"/>`).join("");
}

function renderTransactionEditConflictHtml(env, current, conflicts, backTo, members, isManager) {
  const shown = (c) => c.field === "amount" ? `${numberWithCommas(c.now)}원` : c.field === "type" ? (c.now === "income" ? "수입" : "지출") : (c.now || "(비어 있음)");
  const typed = (c) => c.field === "amount" ? `${numberWithCommas(c.next)}원` : c.field === "type" ? (c.next === "income" ? "수입" : "지출") : (c.next || "(비어 있음)");
  const rows = conflicts.map((c) => `<li><b>${escapeHtml(c.label)}</b> 지금 값 ${escapeHtml(shown(c))} · 내가 입력한 값 ${escapeHtml(typed(c))}</li>`).join("");
  // V22.9.79 V44 F-3: 충돌 안내의 수정 폼도 같은 제안 목록을 가진다.
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>기록 수정 · ${escapeHtml(appName(env))}</title></head><body><main class="wrap" id="main"><section class="txEditHead"><h1>기록 수정</h1><div class="error" role="alert"><b>다른 곳에서 이 기록이 먼저 바뀌었어요.</b> 저장하지 않았어요. 지금 값을 확인하고 다시 저장해 주세요.<ul>${rows}</ul></div></section><section class="card">${renderV8TxEditForm(current, backTo, members, isManager)}${renderTxEditSuggestionLists(current)}</section><p><a class="txEditBack" href="${escapeHtml(backTo)}">돌아가기</a></p></main></body></html>`;
}

async function handleAdminHouseholdCreate(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const name = String(form.get("name") || "").trim().slice(0, 80) || "새 가계부";
  await supabase(env, "/rest/v1/households", {
    method: "POST",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ name, invite_code: makeInviteCode() }),
  });
  return redirectResponse("/households?msg=created");
}

async function handleAdminHouseholdUpdate(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const name = String(form.get("name") || "").trim().slice(0, 80);
  if (!id || !name) return redirectResponse("/households?err=missing");
  // V22.9.76 감사 D-27: 저장 실패가 500 안전모드 화면으로 떨어졌다. 실패를 알리고 기존 이름을 둔다.
  try {
    await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ name }),
    });
  } catch (err) {
    rememberOpsEvent({ kind: "admin_household_update_failed", severity: "warn", path: "/admin/household/update", method: "POST", detail: safeError(err) });
    return redirectResponse(`/households?household_id=${encodeURIComponent(id)}&err=${isUncertainStorageWrite(err) ? "db_write_unknown" : "household_update_failed"}`);
  }
  return redirectResponse(`/households?household_id=${encodeURIComponent(id)}&msg=updated`);
}

async function handleAdminHouseholdRegenerate(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  if (!id) return redirectResponse("/households?err=missing");
  await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ invite_code: makeInviteCode() }),
  });
  return redirectResponse(`/households?household_id=${encodeURIComponent(id)}&msg=regenerated`);
}

async function handleAdminHouseholdDelete(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const form = await request.formData();
  const id = String(form.get("id") || "").trim();
  const confirmText = String(form.get("confirm_text") || "").trim();
  if (!id || confirmText !== "삭제") return redirectResponse(`/households?household_id=${encodeURIComponent(id)}&err=delete_confirm_required`);
  // V22.9.76 감사 G-2: 삭제가 거절되거나 실패하면 500 안전모드 대신 이유를 알린다.
  try {
    await purgeHouseholdData(env, id);
  } catch (err) {
    rememberOpsEvent({ kind: "admin_household_delete_failed", severity: "error", path: "/admin/household/delete", method: "POST", detail: safeError(err) });
    const detail = String(err?.message || "");
    const code = /^(household_import_pending|household_import_busy)$/.test(detail) ? detail : detail === "household_purge_too_large" ? "household_delete_too_large" : isUncertainStorageWrite(err) ? "db_write_unknown" : "household_delete_failed";
    return redirectResponse(`/households?household_id=${encodeURIComponent(id)}&err=${code}`);
  }
  return redirectResponse("/households?msg=deleted");
}

async function handleAdminMemberUpdate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  const sessionUserId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    // V22.9.76 감사 D-27: 역할 조회 실패를 '권한 없음'으로 답하지 않는다. 안내는 참여자 화면이 읽는 코드로 보낸다.
    let currentRole = "";
    try {
      currentRole = await getHouseholdMemberRoleStrict(env, sessionUserId, householdId);
    } catch (err) {
      rememberOpsEvent({ kind: "member_role_check_failed", severity: "warn", path: "/admin/member/update", method: "POST", detail: safeError(err) });
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "household_role_check_failed" }));
    }
    if (!["owner", "admin"].includes(currentRole)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "member_manage_not_allowed" }));
  }
  const userId = String(form.get("user_id") || "").trim();
  const role = String(form.get("role") || "").trim().toLowerCase();
  if (!householdId || !userId) return redirectResponse(returnLocation(form, "/households", { err: "member_missing" }));
  const allowedRoles = new Set(["owner", "admin", "member", "viewer", "pending", "blocked"]);
  if (!allowedRoles.has(role)) {
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "선택한 참여자 권한이 올바르지 않습니다." }));
  }
  try {
    const scopeRows = await fetchRawHouseholdMembers(env, householdId);
    if (!scopeRows.some((row) => String(row.user_id || "") === userId)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "변경할 참여자를 찾지 못했습니다." }));
    return await withKakaoUserLifecycleLease(env, userId, async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
    const assertFresh = () => { lifecycleFresh(); householdFresh(); };
    if (!adminOk && !["owner", "admin"].includes(await getHouseholdMemberRoleStrict(env, sessionUserId, householdId))) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "member_manage_not_allowed" }));
    // 권한 변경은 보안 작업이므로 선택 조회 실패를 빈 목록으로 간주하지 않는다.
    const rows = await supabase(env, `/rest/v1/household_members?select=household_id,user_id,role&household_id=eq.${encodeURIComponent(householdId)}`);
    if (!Array.isArray(rows)) throw new Error("member_role_source_invalid");
    const targetRows = rows.filter((m) => String(m.user_id || "") === userId);
    if (!targetRows.length) {
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "변경할 참여자를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 확인하세요." }));
    }
    const targetRole = bestRoleFromRows(targetRows);
    const ownerIds = [...new Set(rows.filter((m) => String(m.role || "") === "owner").map((m) => String(m.user_id || "")).filter(Boolean))];
    if (role === "owner" && ownerIds.some((id) => id !== userId)) {
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "이미 소유자가 있습니다. 계정 중복이면 관리자 계정 통합을 먼저 실행하세요." }));
    }
    if (targetRole === "owner" && role !== "owner" && ownerIds.length <= 1) {
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "유일한 소유자는 다른 역할로 변경할 수 없습니다." }));
    }
    assertFresh();
    await markKakaoChatFirstHistory(env, userId);
    assertFresh();
    const updated = await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}&select=user_id,role`, {
      method: "PATCH",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ role }),
    });
    const applied = Array.isArray(updated) && updated.some((row) => String(row.user_id || "") === userId && String(row.role || "") === role);
    if (!applied) throw new Error("member_role_update_not_applied");
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { msg: "member_updated" }));
    }));
  } catch (err) {
    rememberOpsEvent({ kind: "member_role_update_failed", severity: "error", path: "/admin/member/update", method: "POST", detail: safeError(err) });
    const detail = safeError(err).toLowerCase();
    const message = isHouseholdRoleCheckFailure(err) ? "household_role_check_failed"
      : /(23514|check constraint|invalid input value for enum|role.*constraint)/.test(detail) ? "member_role_rule_rejected"
      : "member_role_save_failed";
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: message }));
  }
}

async function handleAdminMemberRemove(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  const sessionUserId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    try {
      const currentRole = await getHouseholdMemberRoleStrict(env, sessionUserId, householdId);
      if (!["owner", "admin"].includes(currentRole)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "member_manage_not_allowed" }));
    } catch (err) {
      rememberOpsEvent({ kind: "member_remove_role_check_failed", severity: "error", path: "/admin/member/remove", method: "POST", detail: safeError(err) });
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "household_role_check_failed" }));
    }
  }
  const userId = String(form.get("user_id") || "").trim();
  if (!householdId || !userId) return redirectResponse(returnLocation(form, "/households", { err: "member_missing" }));
  try {
    const scopeRows = await fetchRawHouseholdMembers(env, householdId);
    if (!scopeRows.some((row) => String(row.user_id || "") === userId)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "변경할 참여자를 찾지 못했습니다." }));
    return await withKakaoUserLifecycleLease(env, userId, async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
    const assertFresh = () => { lifecycleFresh(); householdFresh(); };
    if (!adminOk && !["owner", "admin"].includes(await getHouseholdMemberRoleStrict(env, sessionUserId, householdId))) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "member_manage_not_allowed" }));
    const rows = await fetchRawHouseholdMembers(env, householdId);
    const targetRole = bestRoleFromRows(rows.filter((m) => String(m.user_id || "") === userId));
    const ownerIds = [...new Set(rows.filter((m) => String(m.role || "") === "owner").map((m) => String(m.user_id || "")).filter(Boolean))];
    if (!targetRole) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "삭제할 참여자를 찾지 못했습니다. 목록을 새로고침한 뒤 다시 확인하세요." }));
    if (targetRole === "owner" && ownerIds.length <= 1) {
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "유일한 소유자는 삭제할 수 없습니다." }));
    }
    assertFresh();
    await markKakaoChatFirstHistory(env, userId);
    assertFresh();
    await markKakaoGroupDeparture(env, userId, householdId, assertFresh);
    assertFresh();
    await supabase(env, `/rest/v1/household_members?household_id=eq.${encodeURIComponent(householdId)}&user_id=eq.${encodeURIComponent(userId)}`, {
      method: "DELETE",
      headers: { Prefer: "return=minimal" },
    });
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { msg: "member_removed" }));
    }));
  } catch (err) {
    rememberOpsEvent({ kind: "member_remove_failed", severity: "error", path: "/admin/member/remove", method: "POST", detail: safeError(err) });
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: isHouseholdRoleCheckFailure(err) ? "household_role_check_failed" : "member_remove_failed" }));
  }
}

function normalizeHouseholdRole(value = "") {
  const role = String(value || "member").trim().toLowerCase();
  return ["owner", "admin", "member", "viewer", "pending", "blocked"].includes(role) ? role : "member";
}

async function handleAdminMemberNickname(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  const sessionUserId = adminOk ? "" : await verifyUserSession(request, env);
  const back = `/households?household_id=${encodeURIComponent(householdId)}`;
  if (!adminOk) {
    let role = "";
    try {
      role = await getHouseholdMemberRoleStrict(env, sessionUserId, householdId);
    } catch (err) {
      rememberOpsEvent({ kind: "member_alias_role_check_failed", severity: "warn", path: "/admin/member/nickname", method: "POST", detail: safeError(err) });
      return redirectResponse(returnLocation(form, back, { err: "household_role_check_failed" }));
    }
    if (!["owner", "admin"].includes(role)) return redirectResponse(returnLocation(form, back, { err: "member_manage_not_allowed" }));
  }
  const userId = String(form.get("user_id") || "").trim();
  const nickname = String(form.get("nickname") || "").trim().slice(0, 80);
  if (!householdId || !userId || !nickname) return redirectResponse(returnLocation(form, back, { err: "nickname_missing" }));
  // V22.9.76 감사 D-27: 이 처리만 try/catch 가 없어 대상이 이미 나갔거나 설정 읽기가 잠깐 실패하면 500 안전모드
  // 화면이 됐다. 이유를 알리고 기존 이름을 둔다.
  try {
    await saveMemberAlias(env, householdId, userId, nickname);
  } catch (err) {
    rememberOpsEvent({ kind: "member_alias_save_failed", severity: "warn", path: "/admin/member/nickname", method: "POST", detail: safeError(err) });
    const code = /member_alias_target_missing/.test(String(err?.message || "")) ? "member_missing" : isUncertainStorageWrite(err) ? "db_write_unknown" : "member_alias_save_failed";
    return redirectResponse(returnLocation(form, back, { err: code }));
  }
  return redirectResponse(returnLocation(form, back, { msg: "member_alias_updated" }));
}
// @build:exports-start
export {
  MAX_TRANSACTION_AMOUNT, abEditOriginalFields, dashboardQuery, fetchTransactionRowById,
  fetchTransactionRowsByIds, handleAdminAddTransaction, handleAdminDeleteTransaction,
  handleAdminHouseholdCreate, handleAdminHouseholdDelete, handleAdminHouseholdRegenerate,
  handleAdminHouseholdUpdate, handleAdminLogin, handleAdminLogout, handleAdminMemberNickname,
  handleAdminMemberRemove, handleAdminMemberUpdate, handleAdminPage, handleAdminUpdateTransaction,
  handleTransactionEditPage, isValidTransactionDateString, normalizeTransactionType,
  parseFormAmountValue, readOptionalFormAmount, resolveTransactionAccess, transactionReturnFallback,
};
// @build:exports-end
