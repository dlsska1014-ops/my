// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import { fetchReservePlans, reserveDashboard } from "../settings/reserve-plans.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAdminRowsRange, fetchHouseholdMembers,
  fetchPostgrestRows, getScopedHouseholdsForPage, isRowLimitExceededError,
  selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { buildBudgetAlertPolishModel } from "../features/budget-alerts-annual-goals.js";
import { parseJsonArraySettingStrict, saveSettingValue } from "../my/reports-premium.js";
import {
  canManageMyHousehold, canManageMyRecord, canWriteMyHousehold,
} from "../my/access-control.js";
import { memberCanBeSpender } from "../my/transactions.js";
import { fetchBudgets, fetchRecurring } from "../domain/budgets.js";
import { detectRecurringCandidates } from "../admin/pc-analysis-calendar.js";
import { addMonthsYm } from "../domain/analytics.js";
import { formatMessage, isMissingCategory } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { readJson } from "./admin-api.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { nextMonthStart, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

// V22.8.25 V5 통합 검색: user 세션 스코프로 활성 가계부의 전 기간 거래를 검색한다.
// 기존 admin 전용 /api/* 와 분리된 user 스코프 엔드포인트.
async function handleUserTxSearch(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const q = String(url.searchParams.get("q") || "").trim();
  const requestedHousehold = String(url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requestedHousehold);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  if (!q) {
    return jsonResponse({ ok: true, q: "", household_id: household.id, count: 0, results: [] });
  }
  const members = await fetchHouseholdMembers(env, household.id);
  let rowsRaw;
  try {
    rowsRaw = await fetchAdminRowsRange(env, { householdId: household.id, type: "all", limit: 40000 });
  } catch (err) {
    if (!isRowLimitExceededError(err)) throw err;
    // 일부 기록만 훑으면 오래된 기록이 조용히 빠진다(QA B05).
    return jsonResponse({ ok: false, error: "too_many_rows", reason: "search_row_limit", message: "기록이 너무 많아 전체 기간을 한 번에 검색하지 못했습니다. 거래 화면에서 월을 골라 찾아 주세요." }, 422);
  }
  const rows = attachSpenderNames(rowsRaw, members);
  const needle = q.toLowerCase();
  const digits = q.replace(/[^0-9]/g, "");
  const matched = [];
  let hasMore = false;
  for (const t of rows) {
    const hay = `${t.memo || ""} ${t.category || ""} ${t.payment_method || ""} ${t.raw_text || ""} ${t.spender_name || ""}`.toLowerCase();
    const hit = hay.includes(needle) || (digits.length >= 2 && String(t.amount || "").includes(digits));
    if (!hit) continue;
    if (matched.length >= 50) { hasMore = true; break; }
    matched.push({
      id: t.id,
      type: t.type,
      amount: Number(t.amount || 0),
      category: t.category || "",
      memo: t.memo || t.raw_text || "",
      payment_method: t.payment_method || "",
      transaction_date: t.transaction_date || "",
      month: String(t.transaction_date || "").slice(0, 7),
      member: t.spender_name || "",
    });
  }
  return jsonResponse({ ok: true, q, household_id: household.id, count: matched.length, count_is_total: !hasMore, has_more: hasMore, result_limit: 50, results: matched });
}

async function fetchRecentTransactionRows(env, householdId, month, limit = 80) {
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  params.set("household_id", `eq.${String(householdId || "")}`);
  params.set("transaction_date", `gte.${month}-01`);
  params.append("transaction_date", `lt.${nextMonthStart(month)}`);
  params.set("order", "transaction_date.desc,created_at.desc,id.desc");
  const bounded = Math.max(1, Math.min(80, Number(limit || 80)));
  return fetchPostgrestRows(env, `/rest/v1/transactions?${params.toString()}`, { pageSize: bounded + 1, limit: bounded + 1, maxRows: 1000 });
}

// V22.8.59: 홈 우측 최근 기록은 월 전체를 읽은 뒤 자르지 않고 DB에서 81건만 조회한다.
// 선택 가계부는 로그인 세션이 실제로 참여한 범위 안에서만 결정하며 쓰기 작업은 하지 않는다.
async function handleUserRecentTransactions(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const month = validMonth(String(url.searchParams.get("month") || "")) || currentMonthKst();
  const requested = String(url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requested);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  const [members, fetchedRows] = await Promise.all([
    fetchHouseholdMembers(env, household.id),
    fetchRecentTransactionRows(env, household.id, month, 80),
  ]);
  const hasMore = fetchedRows.length > 80;
  const rawRows = fetchedRows.slice(0, 80);
  const rows = attachSpenderNames(rawRows, members);
  // V22.9.26: nowKstDate() 는 KST 날짜 부품으로 만든 로컬 Date 라 getDay() 가 어디서나 KST 요일이다.
  const todayDate = nowKstDate();
  const today = formatDate(todayDate);
  const weekOffset = todayDate.getDay() === 0 ? -6 : 1 - todayDate.getDay();
  todayDate.setDate(todayDate.getDate() + weekOffset);
  const weekStart = formatDate(todayDate);
  let income = 0;
  let expense = 0;
  for (const row of rows) {
    if (row.type === "income") income += Number(row.amount || 0);
    else expense += Number(row.amount || 0);
  }
  const displayed = rows.map((row) => ({
    id: String(row.id || ""),
    type: row.type === "income" ? "income" : "expense",
    amount: Number(row.amount || 0),
    memo: String(row.memo || row.raw_text || row.category || "기록").slice(0, 100),
    category: String(row.category || (row.type === "income" ? "수입" : "미분류")).slice(0, 60),
    payment_method: String(row.payment_method || "").slice(0, 60),
    member: String(row.spender_name || "").slice(0, 60),
    transaction_date: String(row.transaction_date || "").slice(0, 10),
    created_at: String(row.created_at || ""),
  }));
  return jsonResponse({
    ok: true,
    household_id: household.id,
    household_name: String(household.name || "가계부"),
    month,
    today,
    week_start: weekStart,
    totals: { income, expense, balance: income - expense },
    count: rows.length,
    displayed_count: displayed.length,
    has_more: hasMore,
    rows: displayed,
  });
}

// V22.8.48 UI/UX stage 2: 날짜 클릭 팝업용 사용자 범위 읽기 전용 API.
// V22.8.49 UI/UX stage 3: 기록 입력은 기존 폼과 저장 경로를 그대로 재사용하며 별도 쓰기 API를 추가하지 않는다.
// V22.8.50 UI/UX stage 4: 빠른 실행 독과 저장 피드백·날짜 복귀만 가산하며 거래 쓰기 계약은 변경하지 않는다.
// user/admin 세션이 실제 참여한 가계부만 선택하고, 선택 날짜의 거래만 반환한다.
async function handleUserDayTransactions(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const date = String(url.searchParams.get("date") || "").trim();
  if (!isValidTransactionDateString(date)) {
    return jsonResponse({ ok: false, error: "invalid_date", reason: "invalid_date", message: "조회할 날짜를 확인해 주세요." }, 400);
  }
  const requested = String(url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requested);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  const month = date.slice(0, 7);
  const [members, rawRows] = await Promise.all([
    fetchHouseholdMembers(env, household.id),
    fetchAdminRows(env, { month, householdId: household.id, type: "all", date }),
  ]);
  const rows = attachSpenderNames(rawRows, members);
  const role = String(household.role || "").toLowerCase();
  const canWrite = !!scope.adminOk || canWriteMyHousehold(role);
  const canManageSpender = !!scope.adminOk || canManageMyHousehold(role);
  const activeMembers = safeArray(members).filter(memberCanBeSpender);
  let expense = 0;
  let income = 0;
  for (const row of rows) {
    if (row.type === "income") income += Number(row.amount || 0);
    else expense += Number(row.amount || 0);
  }
  const displayLimit = 250;
  const items = rows.slice(0, displayLimit).map((row) => {
    const canEdit = canWrite && (!!scope.adminOk || canManageMyRecord(role, row, scope.userId));
    return {
      id: String(row.id || ""),
      user_id: String(row.user_id || ""),
      type: row.type === "income" ? "income" : "expense",
      amount: Math.max(0, Number(row.amount || 0)),
      category: String(row.category || ""),
      memo: String(row.memo || row.raw_text || ""),
      // V22.9.34 2차 점검 B14: 날짜 시트의 수정 폼은 저장된 메모 그대로를 칸 값과 원래 값(orig_memo)으로 쓴다.
      // 보여 주기용 memo 는 비어 있으면 원문이라, 그대로 저장하면 금액만 고쳐도 원문이 메모가 됐다.
      memo_raw: String(row.memo || ""),
      payment_method: String(row.payment_method || ""),
      member: String(row.spender_name || ""),
      transaction_date: String(row.transaction_date || "").slice(0, 10),
      can_edit: canEdit,
      can_delete: canEdit,
    };
  });
  return jsonResponse({
    ok: true,
    household_id: household.id,
    household_name: household.name || "가계부",
    date,
    can_write: canWrite,
    can_manage_spender: canManageSpender,
    members: canManageSpender ? activeMembers.map((member) => ({ user_id: String(member.user_id || ""), nickname: String(member.nickname || "구성원"), role: String(member.role || "member") })) : [],
    count: rows.length,
    displayed_count: items.length,
    has_more: rows.length > items.length,
    expense,
    income,
    items,
  });
}

// V22.8.27 V5 알림센터: user 세션 스코프로 예산·분류·미분류·정기·준비 규칙을 평가한다.
// 기존 검증된 헬퍼(buildBudgetAlertPolishModel/reserveDashboard/isMissingCategory) 재사용.
async function handleUserNotifications(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const requested = String(url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requested);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const members = await fetchHouseholdMembers(env, household.id);
  const rows = attachSpenderNames(await fetchAdminRows(env, { month, householdId: household.id, type: "all" }), members);
  const budgets = await fetchBudgets(env, household.id, month).catch(() => []);
  const recurring = await fetchRecurring(env, household.id).catch(() => []);
  const plans = await fetchReservePlans(env, household.id).catch(() => []);
  const model = buildBudgetAlertPolishModel({ month, selectedHousehold: household, rows, budgets, recurring });
  const hh = `&household_id=${encodeURIComponent(household.id)}`;
  const mq = encodeURIComponent(month);
  const notifs = [];

  // 1) 총 예산 상태 (danger: 초과 / warn: 월말초과·85%↑)
  if (model.totalBudget) {
    if (model.status === "over") {
      notifs.push({ key: "budget-over", level: "danger", banner: true, title: "이번 달 예산을 초과했어요",
        body: `사용 ${numberWithCommas(model.spent)}원 / 예산 ${numberWithCommas(model.totalBudget)}원 (${numberWithCommas(model.rate)}%)`,
        href: `/budget-alerts?month=${mq}${hh}` });
    } else if (model.status === "forecast" || model.status === "warning") {
      notifs.push({ key: "budget-warn", level: "warn", banner: true,
        title: model.status === "forecast" ? "이대로면 월말 예산 초과 예상" : "예산의 85% 이상 사용했어요",
        body: `사용 ${numberWithCommas(model.spent)}원 · 월말 예상 ${numberWithCommas(model.forecastExpense)}원 / 예산 ${numberWithCommas(model.totalBudget)}원`,
        href: `/budget-alerts?month=${mq}${hh}` });
    }
  }

  // 2) 분류별 예산 초과 (상위 3)
  safeArray(model.dangerCategories).slice(0, 3).forEach((c) => {
    notifs.push({ key: `cat-${c.category}`, level: "danger", title: `${c.category || "미분류"} 예산 초과`,
      body: `사용 ${numberWithCommas(c.spent)}원 / 예산 ${numberWithCommas(c.budget)}원 (${numberWithCommas(c.rate)}%)`,
      href: `/app?month=${mq}${hh}&type=expense&category=${encodeURIComponent(c.category || "")}&feed=all#feed` });
  });

  // 3) 미분류 지출
  const uncategorized = rows.filter((t) => t.type === "expense" && isMissingCategory(t.category));
  if (uncategorized.length) {
    notifs.push({ key: "uncat", level: "info", title: `분류가 필요한 거래 ${uncategorized.length}건`,
      body: "미분류 지출을 정리하면 예산·리포트가 정확해져요.",
      href: `/app?month=${mq}${hh}&quality=missing_category&feed=all#feed` });
  }

  // 4) 이번 달 반영 대기 정기지출
  const pending = safeArray(model.pendingRecurring);
  if (pending.length) {
    notifs.push({ key: "recurring-pending", level: "info", title: `이번 달 반영 대기 정기지출 ${pending.length}건`,
      body: `예상 ${numberWithCommas(model.pendingRecurringTotal)}원 · 한 번에 반영할 수 있어요.`,
      href: `/reserve-plans?month=${mq}${hh}` });
  }

  // 4b) 반복 지출 자동감지 (§3.4): 최근 3개월 반복 메모 → 정기지출 후보 추천 (기존 detectRecurringCandidates 재사용)
  const detectStart = `${addMonthsYm(month, -2)}-01`;
  const detectEnd = nextMonthStart(month);
  const historyRows = await fetchAdminRowsRange(env, { householdId: household.id, start: detectStart, end: detectEnd, limit: 8000, complete: false }).catch(() => []);
  const candidates = detectRecurringCandidates(historyRows, month, recurring);
  if (candidates.length) {
    const names = candidates.slice(0, 3).map((c) => String(c.memo || "").trim()).filter(Boolean).join(", ");
    notifs.push({ key: "recurring-detect", level: "info", title: `반복되는 지출 ${candidates.length}건이 감지됐어요`,
      body: `${names}${candidates.length > 3 ? " 외" : ""} · 정기지출로 등록하면 예산 예측이 정확해져요.`,
      href: `/reserve-plans?month=${mq}${hh}` });
  }

  // 5) 준비 납부 임박 (상위 3)
  const dash = reserveDashboard(plans);
  safeArray(dash.upcoming).slice(0, 3).forEach((s, idx) => {
    notifs.push({ key: `reserve-${s.plan?.id || idx}`, level: s.days_left <= 7 ? "warn" : "info",
      title: `${s.plan?.name || "정기지출"} 납부 ${s.days_left}일 전`,
      body: `${numberWithCommas(s.plan?.amount || 0)}원 · ${s.due_date} 예정 · 월 준비 ${numberWithCommas(s.monthly_reserve)}원`,
      href: `/reserve-plans?month=${mq}${hh}` });
  });

  return jsonResponse({ ok: true, household_id: household.id, month, count: notifs.length, notifications: notifs });
}

// V22.8.28 V5 즐겨찾기: 스키마 없이 accountbook_settings 키-값 저장소에 (가계부·사용자)별 스냅샷 보관.
function favoritesKey(householdId, userKey) {
  return `favorites:v5:${String(householdId || "default").trim() || "default"}:${String(userKey || "shared").trim() || "shared"}`;
}
function normalizeFavoriteSnapshot(x) {
  const o = safeObject(x);
  const id = String(o.id || "").trim();
  if (!id) return null;
  return {
    id: id.slice(0, 64),
    type: o.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(o.amount || 0))),
    category: String(o.category || "").slice(0, 80),
    memo: String(o.memo || "").slice(0, 200),
    payment_method: String(o.payment_method || "").slice(0, 80),
    transaction_date: String(o.transaction_date || "").slice(0, 10),
    month: String(o.month || String(o.transaction_date || "").slice(0, 7)).slice(0, 7),
  };
}
function normalizeFavoriteList(value) {
  let raw = value;
  if (typeof raw === "string") { try { raw = raw ? JSON.parse(raw) : []; } catch (e) { raw = []; } }
  const arr = Array.isArray(raw) ? raw : [];
  const seen = Object.create(null);
  const out = [];
  for (const x of arr) {
    const s = normalizeFavoriteSnapshot(x);
    if (!s || seen[s.id]) continue;
    seen[s.id] = true;
    out.push(s);
    if (out.length >= 100) break;
  }
  return out;
}
async function handleUserFavorites(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const method = request.method;
  const body = method === "POST" ? await readJson(request) : {};
  const requested = String((method === "POST" ? body.household : url.searchParams.get("household")) || url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requested);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  const key = favoritesKey(household.id, scope.userId || "shared");
  const payload = (list) => jsonResponse({ ok: true, household_id: household.id, count: list.length, ids: list.map((f) => f.id), favorites: list });
  // 읽기 실패나 깨진 JSON 을 빈 목록으로 보고 새 항목만 저장하면 기존 즐겨찾기가 통째로 사라진다(QA B02).
  // 그래서 엄격하게 읽고, 바꾸는 요청은 가계부 설정 잠금 안에서 읽기·병합·쓰기를 한다.
  const readFavorites = async () => normalizeFavoriteList(parseJsonArraySettingStrict(await getSettingValueStrict(env, key), "favorite_settings_json_invalid"));
  if (method !== "POST") {
    try {
      return payload(await readFavorites());
    } catch (err) {
      rememberOpsEvent({ kind: "favorite_settings_read_failed", severity: "warn", path: "/u/api/favorites", method: "GET", detail: `${household.id}:${safeError(err)}` });
      return jsonResponse({ ok: false, error: "read_failed", reason: "favorite_read_failed", message: "즐겨찾기를 불러오지 못했습니다. 잠시 후 다시 시도해 주세요." }, 503);
    }
  }
  const id = String(body.id || (body.tx && body.tx.id) || "").trim();
  if (!id) return jsonResponse({ ok: false, error: "id_required", reason: "id_required", message: "거래를 찾지 못했습니다." }, 400);
  const snap = body.remove ? null : normalizeFavoriteSnapshot(body.tx || body);
  if (!body.remove && !snap) return jsonResponse({ ok: false, error: "invalid_tx", reason: "invalid_tx", message: "즐겨찾기할 거래 정보가 부족합니다." }, 400);
  try {
    const list = await withHouseholdSettingsRmw(env, household.id, async ({ assertFresh }) => {
      const current = await readFavorites();
      const next = body.remove ? current.filter((f) => f.id !== id) : [snap, ...current.filter((f) => f.id !== snap.id)].slice(0, 100);
      assertFresh();
      await saveSettingValue(env, key, JSON.stringify(next));
      return next;
    });
    return payload(list);
  } catch (err) {
    rememberOpsEvent({ kind: "favorite_settings_write_failed", severity: "warn", path: "/u/api/favorites", method: "POST", detail: `${household.id}:${safeError(err)}` });
    if (String(err?.message || "") === "settings_rmw_busy") return jsonResponse({ ok: false, error: "busy", reason: "favorite_write_in_progress", message: "다른 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요." }, 409);
    if (isUncertainStorageWrite(err)) return jsonResponse({ ok: false, error: "db_write_unknown", reason: "db_write_unknown", uncertain: true, message: formatMessage("db_write_unknown") }, 503);
    return jsonResponse({ ok: false, error: "save_failed", reason: "favorite_save_failed", message: "즐겨찾기를 바꾸지 못했습니다. 기존 즐겨찾기는 그대로입니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}

// V22.8.31 V5 저축·목표(§3.7) — 스키마 없이 accountbook_settings 키-값 저장소에 가계부별 목표 보관.
function goalsKey(householdId) {
  return `goals:v5:${String(householdId || "default").trim() || "default"}`;
}
// 목표 금액·모은 금액은 0 이상 정수 원이며 1,000억 원을 넘지 않는다. Number("1e309") 는 Infinity 라
// "> 0" 검사를 통과한 뒤 JSON 에서 null 이 되어 다음 조회 때 0원이 된다(QA B01). 그래서 입력은 숫자
// 문자열(쉼표·공백·끝의 "원" 허용)이나 안전한 정수만 받고, 지수·소수·음수·상한 초과는 저장 전에 거부한다.
const MAX_GOAL_AMOUNT = 100_000_000_000;
function parseGoalAmountInput(value, { allowZero = true, max = MAX_GOAL_AMOUNT } = {}) {
  if (value === undefined || value === null || value === "") return allowZero ? 0 : null;
  let amount;
  if (typeof value === "number") amount = value;
  else {
    const text = String(value).replace(/[,\s]/g, "").replace(/원$/, "");
    if (!/^\d{1,15}$/.test(text)) return null;
    amount = Number(text);
  }
  if (!Number.isSafeInteger(amount) || amount < 0 || amount > max) return null;
  if (!allowZero && amount === 0) return null;
  return amount;
}
function storedGoalAmount(value) {
  const amount = Math.round(Number(value || 0));
  return Number.isFinite(amount) && amount > 0 ? Math.min(amount, MAX_GOAL_AMOUNT) : 0;
}
function goalAmountsFromInput(source = {}, fallback = {}) {
  const pick = (key) => (source[key] == null ? fallback[key] : source[key]);
  const target = parseGoalAmountInput(pick("target"), { allowZero: false });
  const saved = parseGoalAmountInput(pick("saved"));
  const monthly = parseGoalAmountInput(pick("monthly"));
  return target === null || saved === null || monthly === null ? null : { target, saved, monthly };
}
const GOAL_AMOUNT_INVALID = { ok: false, error: "invalid_amount", reason: "invalid_amount", message: "금액은 0 이상 1,000억 원 이하의 숫자로 입력해 주세요." };
function normalizeGoal(x) {
  const o = safeObject(x);
  const name = String(o.name || "").trim().slice(0, 60);
  if (!name) return null;
  return {
    id: String(o.id || `goal_${crypto.randomUUID()}`).replace(/[^\w가-힣:-]/g, "_").slice(0, 64),
    name,
    emoji: String(o.emoji || "🎯").slice(0, 8),
    target: storedGoalAmount(o.target),
    saved: storedGoalAmount(o.saved),
    monthly: storedGoalAmount(o.monthly),
    deadline: /^\d{4}-\d{2}$/.test(String(o.deadline || "")) ? String(o.deadline) : "",
    created_at: o.created_at || new Date().toISOString(),
  };
}
function normalizeGoalList(value) {
  let raw = value;
  if (typeof raw === "string") { try { raw = raw ? JSON.parse(raw) : []; } catch (e) { raw = []; } }
  const arr = Array.isArray(raw) ? raw : [];
  const seen = Object.create(null);
  const out = [];
  for (const x of arr) {
    const g = normalizeGoal(x);
    if (!g || seen[g.id]) continue;
    seen[g.id] = true;
    out.push(g);
    if (out.length >= 50) break;
  }
  return out;
}
function enrichGoal(g) {
  const progress = g.target > 0 ? Math.min(100, Math.round((g.saved / g.target) * 100)) : 0;
  const remaining = Math.max(0, g.target - g.saved);
  let monthsLeft = null, neededMonthly = null, status;
  if (g.target > 0 && g.saved >= g.target) {
    status = "done";
  } else if (g.deadline) {
    const [ny, nm] = currentMonthKst().split("-").map(Number);
    const [dy, dm] = g.deadline.split("-").map(Number);
    monthsLeft = Math.max(1, (dy - ny) * 12 + (dm - nm) + 1);
    neededMonthly = Math.ceil(remaining / monthsLeft);
    status = g.monthly >= neededMonthly ? "onTrack" : "behind";
  } else {
    status = g.monthly > 0 ? "onTrack" : "behind";
  }
  return { ...g, progress, remaining, monthsLeft, neededMonthly, status };
}
function goalsPayload(householdId, list) {
  const goals = list.map(enrichGoal);
  const totalTarget = goals.reduce((a, g) => a + g.target, 0);
  const totalSaved = goals.reduce((a, g) => a + g.saved, 0);
  return {
    ok: true, household_id: householdId, count: goals.length,
    total_target: totalTarget, total_saved: totalSaved,
    overall_progress: totalTarget > 0 ? Math.min(100, Math.round((totalSaved / totalTarget) * 100)) : 0,
    goals,
  };
}
async function handleUserGoals(request, env, url) {
  const scope = await getScopedHouseholdsForPage(request, env);
  if (scope.scope === "none" || !safeArray(scope.households).length) {
    return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "로그인이 필요합니다. 다시 로그인해 주세요." }, 401);
  }
  const method = request.method;
  const body = method === "POST" ? await readJson(request) : {};
  const requested = String((method === "POST" ? body.household : url.searchParams.get("household")) || url.searchParams.get("household") || url.searchParams.get("household_id") || "").trim();
  const household = selectRequestedScopedHousehold(scope.households, requested);
  if (!household) {
    return jsonResponse({ ok: false, error: "no_household", reason: "no_household", message: "가계부를 찾지 못했습니다." }, 404);
  }
  const canWrite = scope.scope === "admin" || canWriteMyHousehold(household.role);
  const key = goalsKey(household.id);
  if (method !== "POST") {
    try {
      const list = normalizeGoalList(parseJsonArraySettingStrict(await getSettingValueStrict(env, key), "goal_settings_json_invalid"));
      return jsonResponse({ ...goalsPayload(household.id, list), can_write: canWrite });
    } catch (err) {
      rememberOpsEvent({ kind: "goal_settings_read_failed", severity: "warn", path: "/u/api/goals", method: "GET", detail: `${household.id}:${safeError(err)}` });
      return jsonResponse({ ok: false, error: "read_failed", reason: "goal_read_failed", message: "목표를 불러오지 못했습니다. 기존 목표는 변경되지 않았으니 잠시 후 다시 시도해 주세요." }, 503);
    }
  }
  if (!canWrite) {
    return jsonResponse({ ok: false, error: "forbidden", reason: "viewer_read_only", message: "조회 전용 참여자는 목표를 변경할 수 없습니다." }, 403);
  }
  try {
    // V22.9.34 감사 S9: 목표 저장은 가계부 설정 잠금(가계부 삭제와 같은 잠금)을 쓴다. 따로 쓰던 goals-write
    // 잠금은 삭제와 직렬화되지 않아, 삭제 직후 도착한 저장이 지운 가계부의 목표를 되살렸다.
    // 이 잠금은 안에서 가계부가 아직 있는지도 확인한다.
    return await withHouseholdSettingsRmw(env, household.id, async ({ assertFresh }) => {
      let list = normalizeGoalList(parseJsonArraySettingStrict(await getSettingValueStrict(env, key), "goal_settings_json_invalid"));
      const action = String(body.action || "").trim();
      if (action === "create") {
        const amounts = goalAmountsFromInput(body);
        if (!amounts) return jsonResponse(GOAL_AMOUNT_INVALID, 400);
        const g = normalizeGoal({ name: body.name, emoji: body.emoji, ...amounts, deadline: body.deadline });
        if (!g || !(g.target > 0)) return jsonResponse({ ok: false, error: "invalid_goal", reason: "invalid_goal", message: "목표 이름과 0원보다 큰 목표 금액을 확인해 주세요." }, 400);
        if (list.length >= 50) return jsonResponse({ok:false,error:"goal_limit",message:"\uBAA9\uD45C\uB294 50\uAC1C\uAE4C\uC9C0 \uC800\uC7A5\uD560 \uC218 \uC788\uC2B5\uB2C8\uB2E4."},400);
        list = [...list, g];
      } else if (action === "restore") {
        const amounts = goalAmountsFromInput(safeObject(body.goal));
        if (!amounts) return jsonResponse(GOAL_AMOUNT_INVALID, 400);
        const g = normalizeGoal({ ...safeObject(body.goal), ...amounts });
        if (!g || !(g.target > 0)) return jsonResponse({ ok: false, error: "invalid_goal", reason: "invalid_goal", message: "복구할 목표 정보를 확인해 주세요." }, 400);
        const remaining = list.filter(x=>x.id!==g.id);
        if (remaining.length >= 50) return jsonResponse({ok:false,error:"goal_limit"},400);
        list = [...remaining,g];
      } else if (action === "fund" || action === "update" || action === "delete") {
        const id = String(body.id || "").trim();
        const idx = list.findIndex((x) => x.id === id);
        if (idx < 0) return jsonResponse({ ok: false, error: "not_found", reason: "not_found", message: "목표를 찾지 못했습니다." }, 404);
        if (action === "delete") {
          list = list.filter((x) => x.id !== id);
        } else if (action === "fund") {
          const delta = parseGoalAmountInput(body.amount, { allowZero: false, max: MAX_TRANSACTION_AMOUNT });
          if (delta === null) return jsonResponse({ ok: false, error: "invalid_amount", reason: "invalid_amount", message: "납입 금액을 확인해 주세요." }, 400);
          const nextSaved = list[idx].saved + delta;
          if (!Number.isSafeInteger(nextSaved) || nextSaved > MAX_GOAL_AMOUNT) return jsonResponse({ ok: false, error: "invalid_amount", reason: "goal_saved_limit", message: "모은 금액이 1,000억 원을 넘을 수 없습니다." }, 400);
          list[idx] = normalizeGoal({ ...list[idx], saved: nextSaved });
        } else {
          const amounts = goalAmountsFromInput({ target: body.target, monthly: body.monthly }, list[idx]);
          if (!amounts) return jsonResponse(GOAL_AMOUNT_INVALID, 400);
          const updated = normalizeGoal({ ...list[idx], name: body.name ?? list[idx].name, emoji: body.emoji ?? list[idx].emoji, target: amounts.target, monthly: amounts.monthly, deadline: body.deadline ?? list[idx].deadline });
          if (!updated || !(updated.target > 0)) return jsonResponse({ ok: false, error: "invalid_goal", reason: "invalid_goal", message: "목표 이름과 금액을 확인해 주세요." }, 400);
          list[idx] = updated;
        }
      } else {
        return jsonResponse({ ok: false, error: "bad_action", reason: "bad_action", message: "지원하지 않는 요청입니다." }, 400);
      }
      assertFresh();
      await saveSettingValue(env, key, JSON.stringify(list));
      return jsonResponse({ ...goalsPayload(household.id, list), can_write: true });
    });
  } catch (err) {
    if (/settings_rmw_busy/.test(safeError(err))) {
      return jsonResponse({ ok: false, error: "busy", reason: "goal_write_in_progress", message: "다른 목표 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요." }, 409);
    }
    if (/settings_rmw_household_missing/.test(safeError(err))) {
      return jsonResponse({ ok: false, error: "not_found", reason: "household_missing", message: "가계부를 찾지 못했습니다. 화면을 새로고침해 주세요." }, 404);
    }
    rememberOpsEvent({ kind: "goal_settings_write_failed", severity: "warn", path: "/u/api/goals", method: "POST", detail: `${household.id}:${safeError(err)}` });
    if (isUncertainStorageWrite(err)) return jsonResponse({ ok: false, error: "db_write_unknown", reason: "db_write_unknown", uncertain: true, message: formatMessage("db_write_unknown") }, 503);
    return jsonResponse({ ok: false, error: "save_failed", reason: "goal_save_failed", message: "목표 변경을 저장하지 못했습니다. 기존 목표는 유지됩니다. 잠시 후 다시 시도해 주세요." }, 503);
  }
}
// @build:exports-start
export {
  goalsKey, handleUserDayTransactions, handleUserFavorites, handleUserGoals,
  handleUserNotifications, handleUserRecentTransactions, handleUserTxSearch,
};
// @build:exports-end
