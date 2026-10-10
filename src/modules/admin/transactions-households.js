// @build:imports-start
import { boundedRuntimeNumber, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { HTML_HEADERS } from "../runtime/config-readiness.js";
import { appName } from "../public/site-config.js";
import { explicitDateIntent, moneyTokenSpans } from "../client/shared-input-parsers.js";
import {
  claimOperationLease, operationLeaseOwner, releaseOperationLease, safeError,
  withHouseholdDatabaseLease,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
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
import { verifyUserSession } from "../auth/user-session.js";
import {
  fetchRawHouseholdMembers, withKakaoUserLifecycleLease,
} from "../data/users-household-create.js";
import { canWriteMyHousehold } from "../my/access-control.js";
import { activeSpenderExists, getTransactionForUserEdit } from "../my/transactions.js";
import { purgeHouseholdData } from "../my/households-lifecycle.js";
import { budgetAlertText, fetchBudgets } from "../domain/budgets.js";
import { renderV8TxEditForm } from "../my/home-sections.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { markKakaoGroupDeparture } from "../kakao/group-links-first-record.js";
import { markKakaoChatFirstHistory } from "../kakao/identity-chat-first.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
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
  const raw = String(value ?? "").replace(/[,\s]/g, "");
  if (!/^\d+(?:\.\d+)?$/.test(raw)) return 0;
  const amount = Math.round(Number(raw));
  return Number.isFinite(amount) ? amount : 0;
}

function readTransactionAmount(form) {
  return parseFormAmountValue(form.get("amount"));
}

// 비어 있거나 숫자가 아닌 입력과 사용자가 의도한 0을 구분한다. 둘을 함께
// 0으로 뭉개면 잘못된 입력이 기존 예산을 조용히 0원으로 덮어쓰면서도
// 저장 성공으로 안내된다.
function readOptionalFormAmount(form, field = "amount") {
  const raw = String(form.get(field) ?? "").replace(/[,\s]/g, "");
  return /^\d+(?:\.\d+)?$/.test(raw) ? parseFormAmountValue(raw) : null;
}

function validateRecordFormFields({ id = "", householdId = "", amount = 0, transactionDate = "", mode = "add" }) {
  if ((mode === "update" || mode === "delete") && !String(id || "").trim()) return "거래 ID가 없습니다.";
  if (mode !== "delete" && !String(householdId || "").trim()) return "가계부를 선택하세요.";
  if (mode !== "delete" && (!Number.isFinite(Number(amount)) || Number(amount) <= 0)) return "금액을 입력하세요.";
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

async function resolveTransactionAccess(request, env, householdId, { manageOnly = false } = {}) {
  if (await verifyAdminSession(request, env)) return { ok: true, admin: true, userId: "", role: "admin" };
  const userId = await verifyUserSession(request, env);
  if (!userId || !householdId) return { ok: false, admin: false, userId: userId || "", role: "" };
  const role = String(await getHouseholdMemberRole(env, userId, householdId) || "").toLowerCase();
  const ok = manageOnly ? ["owner", "admin"].includes(role) : canWriteMyHousehold(role) && !!role;
  return { ok, admin: false, userId, role };
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
    if (!access.admin && access.userId) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "기록 입력 권한이 없습니다." }), transactionAddRedirectExtras(form, { err: "기록 입력 권한이 없습니다." }, "error")));
    return redirectResponse(signedOutWriteRedirect(form));
  }
  const txType = normalizeTransactionType(form.get("type"));
  const transactionDate = String(form.get("transaction_date") || formatDate(nowKstDate())).trim();
  const amount = readTransactionAmount(form);
  const smartText=String(form.get("raw_text") || "");
  if (/\d+,\d{1,2}(?!\d)/.test(smartText) && form.get("quick_manual_amount")!=="1") return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"amount_required"}),transactionAddRedirectExtras(form,{err:"amount_required"},"error")));
  if (explicitDateIntent(smartText) && !extractDate(smartText) && form.get("quick_manual_date")!=="1") return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"invalid_date"}),transactionAddRedirectExtras(form,{err:"invalid_date"},"error")));
  // 문장 속 날짜를 서버에서도 다시 풀어, 날짜를 직접 고치지 않았는데 폼 날짜와 다르면 저장하지 않는다(QA B04).
  // 배포 전에 열어 둔 화면처럼 요일 표현을 못 읽는 옛 스크립트가 오늘 날짜를 보내도 다른 날로 집계되지 않는다.
  if (explicitDateIntent(smartText) && form.get("quick_manual_date")!=="1" && extractDate(smartText) && extractDate(smartText)!==transactionDate) return redirectResponse(returnLocation(form,transactionReturnFallback(month,householdId,{err:"invalid_date"}),transactionAddRedirectExtras(form,{err:"invalid_date"},"error")));
  // V22.9.34 감사 N11: 문장 속 금액이 단위 없는 한 자리 숫자("택시 7")뿐이면 7원으로 저장하지 않는다.
  // 정말 그 금액이면 "7원"처럼 원을 붙이거나 금액 칸을 직접 고치면 저장된다.
  const smartSpans = smartText ? moneyTokenSpans(smartText) : [];
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
    }, { requestId });
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
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg }), transactionAddRedirectExtras(form, balert ? { msg, balert } : { msg }, "success")));
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_create_failed", severity: "warn", path: "/admin/transactions", method: "POST", detail: safeError(err) });
    const message = isUncertainStorageWrite(err) ? "db_write_unknown" : err?.code === "transaction_request_conflict" ? "request_conflict" : "거래내역을 저장하지 못했습니다. 기존 데이터는 변경되지 않았습니다.";
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: message, rid: requestId }), transactionAddRedirectExtras(form, { err: message, rid: requestId }, "error")));
  }
}

async function handleAdminDeleteTransaction(request, env) {
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
    if (!access.admin && access.userId) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "이 기록을 삭제할 권한이 없습니다." }), { err: "이 기록을 삭제할 권한이 없습니다." }));
    return redirectResponse(signedOutWriteRedirect(form));
  }
  const validationError = validateRecordFormFields({ id, mode: "delete" });
  if (validationError) {
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: validationError }), { err: validationError }));
  }
  try {
    await deleteTransactionWithAudit(env, id, rowHousehold, { actorUserId: access.userId || null, actorKind: access.admin ? "admin" : "user" });
    return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { msg: "deleted" }), { msg: "deleted" }));
  } catch (err) {
    rememberOpsEvent({ kind: "transaction_delete_failed", severity: "warn", path: "/admin/transactions/delete", method: "POST", detail: safeError(err) });
    const message = "거래내역을 삭제하지 못했습니다. 기존 기록은 유지됩니다.";
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
    const denied = "이 기록을 수정할 권한이 없습니다.";
    if (wantsFragment) {
      // 조각 요청에는 리다이렉트가 쓸모없다. 슬롯에 그대로 넣을 수 있는 문장을 준다.
      return new Response(`<p class="v8-editError">${escapeHtml(denied)}</p>`, {
        status: 403,
        headers: { ...HTML_HEADERS },
      });
    }
    if (!access.admin && access.userId) {
      const target = new URL(backTo, "https://accountbook.local");
      target.searchParams.set("err", denied);
      return redirectResponse(`${target.pathname}${target.search}`);
    }
    return redirectResponse(`/my?return_to=${encodeURIComponent(backTo)}`);
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
  const formHtml = renderV8TxEditForm(editRow, backTo, members, isManager);
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
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>기록 수정 · ${title}</title><style>.wrap{max-width:640px;margin:0 auto;padding:16px}.txEditHead{margin:0 0 12px}.txEditHead h1{font-size:20px;margin:0 0 4px}.txEditBack{display:inline-flex;min-height:44px;align-items:center}</style></head><body>${renderUnifiedNav("transactions")}<main class="wrap" id="main"><section class="txEditHead"><h1>기록 수정</h1><p class="muted">${escapeHtml(String(targetRow.transaction_date || ""))} · ${escapeHtml(memo)}</p></section><section class="card">${formHtml}</section><p><a class="txEditBack" href="${escapeHtml(backTo)}">돌아가기</a></p></main></body></html>`);
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
    if (!access.admin && access.userId) return redirectResponse(returnLocation(form, transactionReturnFallback(month, householdId, { err: "이 기록을 수정할 권한이 없습니다." }), { err: "이 기록을 수정할 권한이 없습니다." }));
    return redirectResponse(signedOutWriteRedirect(form));
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
    const message = isUncertainStorageWrite(err) ? "edit_unknown" : "record_update_failed";
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
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>기록 수정 · ${escapeHtml(appName(env))}</title></head><body><main class="wrap" id="main"><section class="txEditHead"><h1>기록 수정</h1><div class="error" role="alert"><b>다른 곳에서 이 기록이 먼저 바뀌었어요.</b> 저장하지 않았어요. 지금 값을 확인하고 다시 저장해 주세요.<ul>${rows}</ul></div></section><section class="card">${renderV8TxEditForm(current, backTo, members, isManager)}</section><p><a class="txEditBack" href="${escapeHtml(backTo)}">돌아가기</a></p></main></body></html>`;
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
  await supabase(env, `/rest/v1/households?id=eq.${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { Prefer: "return=minimal" },
    body: JSON.stringify({ name }),
  });
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
  await purgeHouseholdData(env, id);
  return redirectResponse("/households?msg=deleted");
}

async function handleAdminMemberUpdate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  const sessionUserId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const currentRole = await getHouseholdMemberRole(env, sessionUserId, householdId);
    if (!["owner", "admin"].includes(currentRole)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 권한 변경 권한이 없습니다." }));
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
    if (!adminOk && !["owner", "admin"].includes(await getHouseholdMemberRole(env, sessionUserId, householdId))) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 변경 권한이 없습니다." }));
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
    const message = /(23514|check constraint|invalid input value for enum|role.*constraint)/.test(detail)
      ? "현재 데이터베이스 역할 규칙에서 선택한 권한을 저장할 수 없습니다. 기존 권한은 유지됩니다."
      : "참여자 권한을 저장하지 못했습니다. 기존 권한은 유지됩니다. 잠시 후 다시 시도하세요.";
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
      const currentRole = await getHouseholdMemberRole(env, sessionUserId, householdId);
      if (!["owner", "admin"].includes(currentRole)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 삭제 권한이 없습니다." }));
    } catch (err) {
      rememberOpsEvent({ kind: "member_remove_role_check_failed", severity: "error", path: "/admin/member/remove", method: "POST", detail: safeError(err) });
      return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "권한을 확인하지 못해 참여자를 삭제하지 않았습니다. 잠시 후 다시 시도하세요." }));
    }
  }
  const userId = String(form.get("user_id") || "").trim();
  if (!householdId || !userId) return redirectResponse(returnLocation(form, "/households", { err: "member_missing" }));
  try {
    const scopeRows = await fetchRawHouseholdMembers(env, householdId);
    if (!scopeRows.some((row) => String(row.user_id || "") === userId)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "변경할 참여자를 찾지 못했습니다." }));
    return await withKakaoUserLifecycleLease(env, userId, async ({ assertFresh: lifecycleFresh }) => withHouseholdDatabaseLease(env, householdId, async ({ assertFresh: householdFresh }) => {
    const assertFresh = () => { lifecycleFresh(); householdFresh(); };
    if (!adminOk && !["owner", "admin"].includes(await getHouseholdMemberRole(env, sessionUserId, householdId))) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 변경 권한이 없습니다." }));
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
    return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 목록을 확인하지 못해 삭제하지 않았습니다. 잠시 후 다시 시도하세요." }));
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
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, sessionUserId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "참여자 이름 변경 권한이 없습니다." }));
  }
  const userId = String(form.get("user_id") || "").trim();
  const nickname = String(form.get("nickname") || "").trim().slice(0, 80);
  if (!householdId || !userId || !nickname) return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { err: "nickname_missing" }));
  await saveMemberAlias(env, householdId, userId, nickname);
  return redirectResponse(returnLocation(form, `/households?household_id=${encodeURIComponent(householdId)}`, { msg: "member_alias_updated" }));
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
