// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  parseStrictSettingsArray, safeError, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { randomEntityId, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { fetchCustomCategories } from "./categories-keywords.js";
import { fetchPaymentAssets } from "./payment-assets.js";
import {
  fetchHouseholdMembers, getScopedHouseholdsForPage, renderSpenderOptions,
  selectRequestedScopedHousehold,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import {
  eligibleRecurringSpenders, recurringSpenderEligible,
} from "../cron/recurring-auto-apply.js";
import { budgetPlanMessage, fetchRecurring } from "../domain/budgets.js";
import { moneyPlanTabsCss, renderMoneyPlanTabs } from "../my/money-plan-home-layout.js";
import { renderRecurringEditForm } from "../admin/budget-center-recurring.js";
import { DEFAULT_CATEGORIES, DEFAULT_PAYMENTS } from "../admin/dashboard-fragments.js";
import { formatMessage, mergedOptions } from "../kakao/reply-texts.js";
import { getHouseholdMemberRole } from "../domain/users-households.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText, parseAmountValue } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function reservePlansKey(householdId = "") {
  return `reserve_plans:${String(householdId || "default").trim() || "default"}`;
}

function normalizeReservePlanList(value, householdId = "", options = {}) {
  let raw = value;
  if (options.strict === true) raw = parseStrictSettingsArray(raw, "reserve_plans", { allowItemsObject: true });
  else {
    if (typeof raw === "string") {
      try { raw = raw ? JSON.parse(raw) : []; } catch (_) { raw = []; }
    }
    if (raw && !Array.isArray(raw) && Array.isArray(raw.items)) raw = raw.items;
  }
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((x, i) => {
    const item = safeObject(x);
    const name = String(item.name || "").trim().slice(0, 80);
    if (!name) return null;
    const recurrence = ["annual","semiannual","quarterly","monthly"].includes(item.recurrence) ? item.recurrence : "annual";
    // V22.8.79: 예전 항목에는 이 두 값이 없다. 없으면 지출·반복주기에서 파생해
    // 예전과 똑같이 동작시킨다(하위호환). 저장 JSON 에 필드만 늘린다.
    const type = String(item.type || "") === "income" ? "income" : "expense";
    const isRecurring = item.is_recurring === undefined || item.is_recurring === null
      ? recurrence === "monthly"
      : !!item.is_recurring;
    let dueMonths = Array.isArray(item.due_months) ? item.due_months : String(item.due_months || item.due_month || "").split(/[,\s]+/);
    dueMonths = dueMonths.map((m) => Math.max(1, Math.min(12, Number(m || 0)))).filter(Boolean);
    if (!dueMonths.length) dueMonths = recurrence === "semiannual" ? [6, 12] : recurrence === "quarterly" ? [3, 6, 9, 12] : [12];
    dueMonths = [...new Set(dueMonths)].sort((a, b) => a - b);
    const alertDays = Array.isArray(item.alert_days) ? item.alert_days : String(item.alert_days || "90,60,30").split(/[,\s]+/);
    return {
      id: String(item.id || `reserve_${i}_${name}`).replace(/[^\w가-힣:-]/g, "_").slice(0, 120),
      household_id: item.household_id || householdId || "",
      name,
      amount: Math.max(0, Math.round(Number(item.amount || 0))),
      type,
      is_recurring: isRecurring,
      category: String(item.category || "세금/수수료").trim().slice(0, 80),
      payment_method: String(item.payment_method || "").trim().slice(0, 80),
      recurrence,
      due_months: dueMonths,
      // V22.9.37 감사 N10: 저장값이 숫자가 아니면 NaN(JSON 에서는 null)이 아니라 기본값 1 로 읽는다.
      due_day: Number.isFinite(Number(item.due_day)) && Number(item.due_day) > 0 ? Math.max(1, Math.min(28, Math.round(Number(item.due_day)))) : 1,
      alert_days: [...new Set(alertDays.map((d) => Math.max(1, Math.min(365, Number(d || 0)))).filter(Boolean))].sort((a, b) => b - a),
      memo: String(item.memo || "").trim().slice(0, 160),
      created_at: item.created_at || new Date(0).toISOString(),
    };
  }).filter(Boolean);
}

async function fetchReservePlans(env, householdId = "", options = {}) {
  const strict = options.strict === true;
  try {
    const key = reservePlansKey(householdId);
    const value = strict ? await getSettingValueStrict(env, key) : await getSettingValue(env, key);
    return normalizeReservePlanList(value, householdId, { strict });
  } catch (err) {
    if (strict) throw err;
    return [];
  }
}

async function saveReservePlans(env, householdId = "", plans = []) {
  const cleaned = normalizeReservePlanList(plans, householdId);
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: reservePlansKey(householdId), value: JSON.stringify(cleaned) }),
  });
  return cleaned;
}

const RESERVE_RECURRENCES = ["annual", "semiannual", "quarterly", "monthly"];

// V22.9.37 감사 N10: 월·일·반복주기는 깎거나 기본값으로 바꾸지 않고 틀리면 거절한다(NaN 을 저장하지 않는다). 빈 값만 기본값이다.
function readReserveRecurrence(value, fallback = "annual") {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!RESERVE_RECURRENCES.includes(raw)) throw new Error("reserve_recurrence_invalid");
  return raw;
}

function readReserveDueDay(value, fallback = 1) {
  const raw = String(value ?? "").trim();
  if (!raw) return fallback;
  if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 28) throw new Error("reserve_due_day_invalid");
  return Number(raw);
}

function readReserveDueMonths(values) {
  const list = Array.isArray(values) ? values : String(values ?? "").split(/[,\s]+/);
  const months = [];
  for (const value of list) {
    const raw = String(value ?? "").trim();
    if (!raw) continue;
    if (!/^\d{1,2}$/.test(raw) || Number(raw) < 1 || Number(raw) > 12) throw new Error("reserve_due_month_invalid");
    months.push(Number(raw));
  }
  return [...new Set(months)].sort((a, b) => a - b);
}

function defaultReserveDueMonths(recurrence = "annual") {
  if (recurrence === "monthly") return Array.from({ length: 12 }, (_, i) => i + 1);
  return recurrence === "semiannual" ? [6, 12] : recurrence === "quarterly" ? [3, 6, 9, 12] : [12];
}

async function addReservePlan(env, householdId = "", data = {}) {
  const hid = String(householdId || "").trim();
  const name = String(data.name || "").trim().slice(0, 80);
  const amount = Math.max(0, Math.round(Number(data.amount || 0)));
  if (!name || !amount) throw new Error("이름과 금액을 입력해주세요.");
  const recurrence = readReserveRecurrence(data.recurrence, "annual");
  let dueMonths = readReserveDueMonths(safeArray(data.due_months));
  if (!dueMonths.length) dueMonths = defaultReserveDueMonths(recurrence);
  const dueDay = readReserveDueDay(data.due_day, 1);
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const current = await fetchReservePlans(env, hid, { strict: true });
    // V22.9.37 감사 SIM-3: 같은 이름이 이미 있으면 바꿔 끼우지 않고 거절한다. 예전에는 기존 항목을 지우고 새 항목을 넣어
    // id·알림 설정이 사라졌다. 같은 이름 두 개를 두지도 않는다 — 수정·삭제는 id 로 찾더라도 사람은 이름으로 구분한다.
    if (current.some((p) => normalizeText(p.name) === normalizeText(name))) throw new Error("reserve_name_duplicate");
    const next = [
      ...current,
      {
        id: randomEntityId("reserve"),
        household_id: hid,
        name,
        amount,
        type: String(data.type || "") === "income" ? "income" : "expense",
        is_recurring: data.is_recurring === undefined ? recurrence === "monthly" : !!data.is_recurring,
        category: String(data.category || "세금/수수료").trim().slice(0, 80),
        payment_method: String(data.payment_method || "").trim().slice(0, 80),
        recurrence,
        due_months: dueMonths,
        due_day: dueDay,
        alert_days: safeArray(data.alert_days).length ? data.alert_days : [90, 60, 30],
        memo: String(data.memo || "").trim().slice(0, 160),
        created_at: new Date().toISOString(),
      },
    ];
    assertFresh();
    await saveReservePlans(env, hid, next);
    return { ok: true };
  });
}

async function updateReservePlan(env, householdId = "", id = "", data = {}) {
  // V22.9.26: 수정·삭제도 strict 읽기 — 읽기 실패를 빈 목록으로 보면 나머지 항목이 모두 지워진다.
  const hid = String(householdId || "").trim();
  const name = String(data.name || "").trim().slice(0, 80);
  const amount = Math.max(0, Math.round(Number(data.amount || 0)));
  if (!name || !amount) throw new Error("이름과 금액을 입력해주세요.");
  // V22.9.37 감사 N10: 월·일·반복주기는 항목을 찾기 전에 검증해 틀린 값을 조용히 깎지 않는다.
  const requestedRecurrence = readReserveRecurrence(data.recurrence, "");
  const requestedDueMonths = readReserveDueMonths(safeArray(data.due_months));
  const requestedDueDay = readReserveDueDay(data.due_day, 0);
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const current = await fetchReservePlans(env, hid, { strict: true });
    const target = current.find((p) => String(p.id) === String(id));
    if (!target) throw new Error("수정할 항목을 찾지 못했습니다.");
    const recurrence = requestedRecurrence || target.recurrence;
    let dueMonths = requestedDueMonths;
    if (!dueMonths.length) dueMonths = recurrence === "monthly" ? Array.from({ length: 12 }, (_, i) => i + 1) : safeArray(target.due_months);
    // V22.9.37 감사 SIM-3: 다른 항목과 같은 이름으로 바꾸면 거절한다. 예전에는 이름이 겹치는 다른 항목을 "정리"해 지웠다.
    if (current.some((p) => String(p.id) !== String(id) && normalizeText(p.name) === normalizeText(name))) throw new Error("reserve_name_duplicate");
    const next = current
      .map((p) => String(p.id) !== String(id) ? p : {
        ...p,
        name,
        amount,
        type: String(data.type || "") === "income" ? "income" : "expense",
        is_recurring: data.is_recurring === undefined ? recurrence === "monthly" : !!data.is_recurring,
        category: String(data.category || p.category || "세금/수수료").trim().slice(0, 80),
        payment_method: String(data.payment_method ?? p.payment_method ?? "").trim().slice(0, 80),
        recurrence,
        due_months: dueMonths,
        due_day: requestedDueDay || Number(p.due_day || 1),
        memo: String(data.memo ?? p.memo ?? "").trim().slice(0, 160),
      });
    assertFresh();
    // Legacy contract: `await saveReservePlans(env, householdId, next);` still uses this same save path;
    // `hid` is the validated household id held by the settings lease.
    await saveReservePlans(env, hid, next);
    return { ok: true };
  });
}

async function deleteReservePlan(env, householdId = "", id = "") {
  const hid = String(householdId || "").trim();
  return withHouseholdSettingsRmw(env, hid, async ({ assertFresh }) => {
    const current = await fetchReservePlans(env, hid, { strict: true });
    const next = current.filter((p) => String(p.id) !== String(id));
    if (next.length === current.length) throw new Error("reserve_plan_not_found");
    assertFresh();
    await saveReservePlans(env, hid, next);
    return { ok: true };
  });
}

function recurrenceLabel(v = "") {
  return { annual: "연 1회", semiannual: "반기", quarterly: "분기", monthly: "매월" }[v] || "연 1회";
}

function reserveCycleMonths(plan = {}) {
  if (plan.recurrence === "monthly") return 1;
  if (plan.recurrence === "quarterly") return 3;
  if (plan.recurrence === "semiannual") return 6;
  return 12;
}

function dateOnly(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function daysBetween(a, b) {
  return Math.ceil((dateOnly(b).getTime() - dateOnly(a).getTime()) / 86400000);
}

function nextReserveDue(plan = {}, fromDate = nowKstDate()) {
  const base = dateOnly(fromDate);
  const year = base.getFullYear();
  const candidates = [];
  const months = safeArray(plan.due_months).length ? safeArray(plan.due_months) : [12];
  for (const y of [year, year + 1]) {
    for (const m of months) {
      const d = new Date(y, Number(m) - 1, Math.max(1, Math.min(28, Number(plan.due_day || 1))));
      if (d >= base) candidates.push(d);
    }
  }
  candidates.sort((a, b) => a - b);
  return candidates[0] || new Date(year + 1, 11, 1);
}

function reservePlanStatus(plan = {}, fromDate = nowKstDate()) {
  const due = nextReserveDue(plan, fromDate);
  const daysLeft = Math.max(0, daysBetween(fromDate, due));
  const cycle = reserveCycleMonths(plan);
  const monthlyReserve = cycle ? Math.ceil(Number(plan.amount || 0) / cycle) : Number(plan.amount || 0);
  const monthsLeft = Math.max(1, Math.ceil(daysLeft / 30));
  const catchupMonthly = Math.ceil(Number(plan.amount || 0) / monthsLeft);
  const maxAlert = Math.max(...safeArray(plan.alert_days || [90,60,30]).map(Number), 0);
  // V22.8.82: 알림 창이 주기보다 길면 알림이 영원히 켜져 있다.
  //   매월 항목은 다음 납부일이 늘 30일 안이라 기본값 90일 기준에서 100% 참이었고,
  //   그 결과 "준비 알림 9건 / 등록 항목 9개" 처럼 목록 전체가 강조로 칠해졌다.
  //   전부가 강조면 강조가 아니다. 창을 주기의 1/3 로 좁히되 최소 7일은 남긴다.
  //   연 1회(360일)는 90일 그대로라 재산세·자동차보험의 원래 설계는 바뀌지 않는다.
  const alertWindow = cycle ? Math.min(maxAlert, Math.max(7, Math.round(cycle * 30 / 3))) : maxAlert;
  const alert = daysLeft <= alertWindow;
  return {
    plan,
    due_date: formatDate(due),
    days_left: daysLeft,
    cycle_months: cycle,
    monthly_reserve: monthlyReserve,
    catchup_monthly: catchupMonthly,
    alert_window_days: alertWindow,
    alert,
  };
}

function reserveDashboard(plans = [], fromDate = nowKstDate()) {
  const statuses = safeArray(plans).map((p) => reservePlanStatus(p, fromDate)).sort((a, b) => a.days_left - b.days_left);
  const upcoming = statuses.filter((s) => s.alert);
  const isIncome = (s) => String(s.plan?.type || "expense") === "income";
  const monthlyReserveTotal = statuses.filter((s) => !isIncome(s)).reduce((a, s) => a + Number(s.monthly_reserve || 0), 0);
  const monthlyIncomeTotal = statuses.filter(isIncome).reduce((a, s) => a + Number(s.monthly_reserve || 0), 0);
  const monthlyNetTotal = monthlyIncomeTotal - monthlyReserveTotal;
  return { statuses, upcoming, monthlyReserveTotal, monthlyIncomeTotal, monthlyNetTotal };
}

function reserveAlertText(plans = [], limit = 3) {
  const d = reserveDashboard(plans);
  if (!d.upcoming.length) return "";
  const lines = d.upcoming.slice(0, limit).map((s) => {
    const p = s.plan;
    // 수입 항목에 "준비" 라고 하면 말이 안 된다. 나갈 돈과 들어올 돈을 나눠 쓴다.
    if (String(p.type || "expense") === "income") {
      return `- ${p.name}: ${s.days_left}일 후 ${numberWithCommas(p.amount)}원 들어올 예정`;
    }
    return `- ${p.name}: ${s.days_left}일 후 ${numberWithCommas(p.amount)}원\n  준비 권장: 월 ${numberWithCommas(s.monthly_reserve)}원`;
  });
  return `\n\n🔔 다가오는 정기 수입·지출\n${lines.join("\n")}`;
}

async function kakaoReserveAlert(env, householdId) {
  try {
    const plans = await fetchReservePlans(env, householdId);
    return reserveAlertText(plans, 3);
  } catch (err) {
    return "";
  }
}

function reservePlanTypeRadios(name = "type", value = "expense", idPrefix = "") {
  const income = String(value) === "income";
  return `<span class="reserveTypeSeg"><label><input type="radio" name="${escapeHtml(name)}" value="expense"${income ? "" : " checked"}/><span>지출</span></label><label><input type="radio" name="${escapeHtml(name)}" value="income"${income ? " checked" : ""}/><span>수입</span></label></span>`;
}

function renderReservePlanEditForm(plan = {}) {
  const p = safeObject(plan);
  const dues = safeArray(p.due_months);
  const monthOption = (slot) => Array.from({ length: 12 }, (_, i) => `<option value="${i + 1}"${Number(dues[slot]) === i + 1 ? " selected" : ""}>${i + 1}월</option>`).join("");
  const rec = String(p.recurrence || "monthly");
  const recOption = (value, label) => `<option value="${value}"${rec === value ? " selected" : ""}>${label}</option>`;
  return `<form class="formGrid reserveSmartForm" method="post" action="/admin/reserve-plan/update"><input type="hidden" name="household_id" value="${escapeHtml(p.household_id || "")}"/><input type="hidden" name="id" value="${escapeHtml(p.id || "")}"/><label>수입·지출${reservePlanTypeRadios("type", p.type)}</label><label>항목명<input name="name" value="${escapeHtml(p.name || "")}"/></label><label>금액<input name="amount" inputmode="numeric" value="${Number(p.amount || 0) || ""}"/></label><label class="reserveRepeat"><input type="checkbox" name="is_recurring" value="1"${p.is_recurring ? " checked" : ""}/><span>매월 반복</span></label><label>반복주기<select name="recurrence" class="jsRecurrence">${recOption("monthly", "매월")}${recOption("annual", "연 1회")}${recOption("semiannual", "반기")}${recOption("quarterly", "분기")}</select></label><label class="dueMonth due1">납부·입금월 1<select name="due_month_1"><option value="">선택</option>${monthOption(0)}</select></label><label class="dueMonth due2">납부·입금월 2<select name="due_month_2"><option value="">선택</option>${monthOption(1)}</select></label><label class="dueMonth due3">납부·입금월 3<select name="due_month_3"><option value="">선택</option>${monthOption(2)}</select></label><label class="dueMonth due4">납부·입금월 4<select name="due_month_4"><option value="">선택</option>${monthOption(3)}</select></label><label>납부·입금일<input name="due_day" inputmode="numeric" value="${Number(p.due_day || 1)}"/></label><label>분류<input name="category" list="reserveCategoryList" value="${escapeHtml(p.category || "")}"/></label><label>결제수단<input name="payment_method" value="${escapeHtml(p.payment_method || "")}"/></label><label>메모<input name="memo" value="${escapeHtml(p.memo || "")}"/></label><button type="submit">수정 저장</button></form>`;
}

function renderReserveStatusCards(statuses = [], canManage = true) {
  if (!statuses.length) return `<div class="empty"><b>아직 등록한 정기지출이 없어요.</b><span>보험료·세금처럼 큰 금액부터 하나만 등록해 보세요.</span>${canManage ? `<a class="btn light" href="#reserveAdd">첫 정기지출 추가</a>` : ""}</div>`;
  return statuses.map((s) => {
    const p = s.plan;
    const isIncome = String(p.type || "expense") === "income";
    const sign = isIncome ? "+" : "-";
    return `<div class="reserveCard ${s.alert ? "alert" : ""} ${isIncome ? "isIncome" : ""}"><div><b>${escapeHtml(p.name)}</b><span><em class="reserveKind ${isIncome ? "kindIncome" : "kindExpense"}">${isIncome ? "수입" : "지출"}</em>${p.is_recurring ? `<em class="reserveKind kindRepeat">매월 반복</em>` : ""} ${escapeHtml(recurrenceLabel(p.recurrence))} · ${escapeHtml(p.category || "")}</span><span>다음 ${isIncome ? "입금" : "납부"}일 ${escapeHtml(s.due_date)} · ${numberWithCommas(s.days_left)}일 남음</span></div><div class="reserveAmt"><strong class="${isIncome ? "amtIncome" : "amtExpense"}">${sign}${numberWithCommas(p.amount)}원</strong><small>${isIncome ? "월 환산" : "월 준비"} ${numberWithCommas(s.monthly_reserve)}원</small>${isIncome ? "" : `<small>지금부터 준비 ${numberWithCommas(s.catchup_monthly)}원/월</small>`}</div>${canManage ? `<div class="reserveActions"><details class="reserveEdit"><summary>수정</summary>${renderReservePlanEditForm(p)}</details><form method="post" action="/admin/reserve-plan/delete" onsubmit="return confirm('이 정기지출 항목을 삭제할까요? 이미 기록된 거래는 삭제되지 않습니다.')"><input type="hidden" name="household_id" value="${escapeHtml(p.household_id || "")}"/><input type="hidden" name="id" value="${escapeHtml(p.id)}"/><button class="danger" type="submit">삭제</button></form></div>` : ""}</div>`;
  }).join("");
}

async function handleReservePlansPage(request, env, url) {
  const scoped = await getScopedHouseholdsForPage(request, env);
  if (scoped.scope === "none") return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = scoped.households;
  const requestedHouseholdId = String(url.searchParams.get("household_id") || "").trim();
  const selected = selectRequestedScopedHousehold(households, requestedHouseholdId);
  if (!selected) return redirectResponse("/my?err=no_household");
  const householdId = selected?.id || "";
  const canManage = scoped.scope === "admin" || scoped.adminOk || ["owner", "admin"].includes(String(selected?.role || "").toLowerCase());
  const feedbackCode = String(url.searchParams.get("err") || url.searchParams.get("msg") || "");
  const feedbackHtml = feedbackCode ? `<div class="${url.searchParams.get("err") ? "error" : "ok"}" role="status">${budgetPlanMessage(feedbackCode) || formatMessage(feedbackCode)}</div>` : "";
  // V22.8.79-1: 고정지출(accountbook_recurring)은 홈에서 진입점을 잃었다. 여기로 합친다.
  // 라우트(/admin/recurring/*)와 반영 RPC 는 그대로 두고 화면만 옮긴다.
  // V22.9.16: 다섯 조회가 서로 필요 없다. 한 번에 던진다.
  const [customCategoryRows, paymentAssetRows, plans, recurringRows, recurringMembers] = await Promise.all([
    fetchCustomCategories(env, householdId),
    fetchPaymentAssets(env, householdId),
    fetchReservePlans(env, householdId),
    fetchRecurring(env, householdId),
    fetchHouseholdMembers(env, householdId),
  ]);
  const recurring = safeArray(recurringRows);
  const recurringExpense = recurring.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const recurringIncome = recurring.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const recurringApplied = recurring.filter((r) => String(r.last_applied_month || "") === month).length;
  // V22.9.37 감사 SIM-5: 지출자 선택지는 자동 반영이 실제로 반영하는 참여자(소유자·관리자·구성원)만 보인다.
  const spenderOptions = renderSpenderOptions(eligibleRecurringSpenders(recurringMembers), "", "지출자 선택");
  const dashboard = reserveDashboard(plans);
  const monthDue = dashboard.statuses.filter((st) => String(st.due_date || "").slice(0, 7) === month);
  const monthDueExpense = monthDue.filter((st) => String(st.plan?.type || "expense") !== "income").reduce((a, st) => a + Number(st.plan?.amount || 0), 0);
  const monthDueIncome = monthDue.filter((st) => String(st.plan?.type || "expense") === "income").reduce((a, st) => a + Number(st.plan?.amount || 0), 0);
  const monthDueTotal = monthDueExpense;
  const monthDueNet = monthDueIncome - monthDueExpense;
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const categoryOptions = mergedOptions(DEFAULT_CATEGORIES, customCategoryRows.map((c) => c.name)).map((c) => `<option value="${escapeHtml(c)}">${escapeHtml(c)}</option>`).join("");
  const paymentOptions = mergedOptions(DEFAULT_PAYMENTS, paymentAssetRows.map((p) => p.name)).map((p) => `<option value="${escapeHtml(p)}">${escapeHtml(p)}</option>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>정기지출 준비</title><style>${moneyPlanTabsCss()}*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#b45309));color:#fff;border-radius:28px;padding:22px;margin:12px 0;box-shadow:0 18px 42px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:28px}.hero p{line-height:1.55;opacity:.92}.filters,.formGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:8px;margin-top:12px}.filters select,.filters input,.filters button,.formGrid input,.formGrid select,.formGrid button{height:44px;border:1px solid #d1d5db;border-radius:14px;padding:0 12px;background:#fff;font:inherit}.formGrid label{display:grid;gap:6px;font-size:12px;font-weight:1000;color:#475569}.formGrid label input,.formGrid label select{width:100%}.filters button,.formGrid button{background:#111827;color:#fff;font-weight:1000}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.metricGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:5px}.reserveCard{display:grid;grid-template-columns:1fr auto auto;gap:10px;align-items:center;background:#f8fafc;border:1px solid #e5e7eb;border-radius:20px;padding:14px;margin:8px 0}.reserveCard.alert{background:#fff7ed;border-color:#fdba74}.reserveCard b{display:block;font-size:17px}.reserveCard span:not(.reserveEdit *),.reserveAmt small,.note{display:block;color:#64748b;font-size:13px;line-height:1.45}.reserveAmt{text-align:right}.reserveAmt strong{display:block;font-size:18px}.reserveCard button{height:34px;border:0;border-radius:11px;background:#fee2e2;color:#991b1b;font-weight:900;padding:0 11px}.tip,.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b;border-radius:16px;padding:12px;line-height:1.55}.guideLine{background:#fffdf3;border:1px solid #fde68a;color:#854d0e;border-radius:16px;padding:12px;line-height:1.55;margin:10px 0}.suggestBox{margin:8px 0}.suggestBox strong{display:block;font-size:12px;color:#64748b;margin:0 0 4px}.sectionHeadRow{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.sectionHeadRow h2{margin:0}.fixedSum{color:#64748b;font-size:13px;font-weight:900}.reserveKind{font-style:normal;display:inline-flex;align-items:center;border-radius:999px;padding:3px 8px;font-size:11px;font-weight:1000;margin-right:5px}.kindExpense{background:#fee2e2;color:#991b1b}.kindIncome{background:#dcfce7;color:#166534}.kindRepeat{background:#eef2ff;color:#3730a3}.amtIncome{color:#059669}.amtExpense{color:#b91c1c}.reserveActions{display:grid;gap:7px;align-content:start}.reserveEdit summary{cursor:pointer;list-style:none;height:34px;display:inline-flex;align-items:center;justify-content:center;border-radius:11px;background:#eef2ff;color:#1e3a8a;font-weight:1000;padding:0 13px;font-size:13px}.reserveEdit summary::-webkit-details-marker{display:none}.reserveEdit[open]{grid-column:1/-1;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:12px;margin-top:4px}.reserveEdit .formGrid{margin-top:10px}.reserveTypeSeg{display:flex;gap:6px}.reserveTypeSeg label{flex:1;margin:0;position:relative}.formGrid .reserveTypeSeg input[type=radio],.reserveTypeSeg input[type=radio]{position:absolute;inset:0;opacity:0;width:100%;height:100%;min-height:0;margin:0;cursor:pointer}.reserveTypeSeg input:focus-visible+span{outline:3px solid #2563eb;outline-offset:2px}.reserveTypeSeg span{display:flex;align-items:center;justify-content:center;height:44px;border-radius:14px;background:#f1f5f9;color:#475569;font-weight:1000;cursor:pointer}.reserveTypeSeg input:checked+span{background:#111827;color:#fff}.reserveRepeat{flex-direction:row!important;align-items:center;gap:8px!important;display:flex!important}.reserveRepeat input{width:20px!important;height:20px!important;min-height:0!important;flex:none}@media(max-width:760px){body{overflow-x:hidden}.wrap{padding:12px 10px 96px}.hero{border-radius:22px;padding:18px}.hero h1{font-size:24px;line-height:1.25}.formGrid,.filters{grid-template-columns:1fr}.formGrid input,.formGrid select,.formGrid button,.filters input,.filters select,.filters button{width:100%;font-size:16px;min-height:46px}.card{border-radius:20px;padding:16px}.metricGrid{grid-template-columns:1fr}.reserveCard{grid-template-columns:1fr}.reserveAmt{text-align:left}.guideLine,.tip{font-size:13px}}</style></head><body>${renderUnifiedNav("reserve-plans", { month, householdId, householdName: (households.find((h)=>h.id===householdId)||{}).name })}<main class="wrap">${renderMoneyPlanTabs("reserve-plans", { month, householdId })}${feedbackHtml}<section class="hero"><h1>정기 수입·지출</h1><p><b>매달·매년 반복되는 항목</b>만 모았습니다. 이번 달에만 적용할 한도는 <b>월별 예산·수입</b> 탭에서 정합니다. 재산세·자동차보험처럼 크게 나가는 돈과, 월세·정기 용돈처럼 꾸준히 들어오는 돈을 함께 관리하며 3개월/2개월/1개월 전 기준으로 준비 알림을 보여줍니다.</p><form class="filters" method="get" action="/reserve-plans"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="metricGrid"><div class="metric"><span>등록 항목</span><b>${numberWithCommas(plans.length)}개</b></div><div class="metric"><span>이번 달 나갈 정기지출</span><b>${numberWithCommas(monthDueTotal)}원</b>${monthDueIncome ? `<small style="display:block;color:#059669;margin-top:3px">이번 달 정기수입 +${numberWithCommas(monthDueIncome)}원 · 순액 ${monthDueNet >= 0 ? "+" : "-"}${numberWithCommas(Math.abs(monthDueNet))}원</small>` : ""}${monthDue.length ? `<small style="display:block;color:#64748b;margin-top:3px">${numberWithCommas(monthDue.length)}건 · ${escapeHtml(monthDue.slice(0,2).map((st)=>st.plan?.name||"").filter(Boolean).join(", "))}${monthDue.length>2 ? " 외" : ""}</small>` : `<small style="display:block;color:#64748b;margin-top:3px">이번 달 나갈 항목 없음</small>`}</div><div class="metric"><span>월 준비 권장액</span><b>${numberWithCommas(dashboard.monthlyReserveTotal)}원</b>${dashboard.monthlyIncomeTotal ? `<small style="display:block;color:#059669;margin-top:3px">정기수입 월 환산 +${numberWithCommas(dashboard.monthlyIncomeTotal)}원 · 순액 ${dashboard.monthlyNetTotal >= 0 ? "+" : "-"}${numberWithCommas(Math.abs(dashboard.monthlyNetTotal))}원</small>` : ""}</div><div class="metric"><span>준비 알림</span><b>${numberWithCommas(dashboard.upcoming.length)}건</b></div></section><section class="card"><h2>다가오는 납부</h2><div>${renderReserveStatusCards(dashboard.statuses, canManage)}</div></section><section class="card" id="fixed"><div class="sectionHeadRow"><h2>매월 자동 반영되는 고정지출</h2><span class="fixedSum">${recurring.length ? `${numberWithCommas(recurring.length)}건 · 지출 ${numberWithCommas(recurringExpense)}원${recurringIncome ? ` · 수입 ${numberWithCommas(recurringIncome)}원` : ""}` : "등록된 항목 없음"}</span></div><p class="note">월세·구독료처럼 매달 같은 금액이 나가는 항목입니다. 위의 정기 수입·지출이 "미리 모아 두는 큰돈"이라면, 이쪽은 "버튼 한 번으로 이번 달 기록에 넣는" 항목입니다.</p>${recurring.length ? `<div>${recurring.map((r) => `<div class="reserveCard"><div><b>${escapeHtml(r.memo || "-")}</b><span><em class="reserveKind ${r.type === "income" ? "kindIncome" : "kindExpense"}">${r.type === "income" ? "수입" : "지출"}</em>매월 ${escapeHtml(String(r.day_of_month || 1))}일 · ${escapeHtml(r.category || "기타")}${r.payment_method ? ` · ${escapeHtml(r.payment_method)}` : ""}</span>${String(r.last_applied_month || "") === month ? `<span>이번 달 반영 완료</span>` : `<span>이번 달 아직 반영 안 됨</span>`}${recurringSpenderEligible(recurringMembers, r.user_id) ? "" : `<span class="note">지출자 확인 필요 · 지출자가 활성 참여자(소유자·관리자·구성원)가 아니어서 자동·수동 반영에서 건너뜁니다. 수정에서 지출자를 다시 고르세요.</span>`}</div><div class="reserveAmt"><strong class="${r.type === "income" ? "amtIncome" : "amtExpense"}">${r.type === "income" ? "+" : "-"}${numberWithCommas(r.amount)}원</strong></div>${canManage ? `${renderRecurringEditForm(r, householdId, month, recurringMembers, "/admin/recurring/save")}<form method="post" action="/admin/recurring/delete" onsubmit="return confirm('이 고정지출 항목을 삭제할까요? 이미 기록된 거래는 삭제되지 않습니다.')"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="id" value="${escapeHtml(r.id)}"/><button class="danger" type="submit">삭제</button></form>` : ""}</div>`).join("")}</div>` : `<p class="note">아직 없습니다. 월세·보험·구독료처럼 매달 같은 금액이 나가는 항목을 추가해 보세요.</p>`}${canManage ? `<form class="formGrid" method="post" action="/admin/recurring/save" style="margin-top:12px"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><label>수입·지출<select name="type"><option value="expense">지출</option><option value="income">수입</option></select></label><label>항목명<input name="memo" placeholder="예: 월세, 넷플릭스"/></label><label>금액<input name="amount" inputmode="numeric" placeholder="예: 550000"/></label><label>매월 며칠<input type="number" name="day_of_month" min="1" max="31" value="1"/></label><label>분류<input name="category" list="reserveCategoryList" placeholder="예: 주거/관리"/></label><label>결제수단<select name="payment_method"><option value="">결제수단 선택 안 함</option>${paymentOptions}</select></label><label>지출자<select name="user_id">${spenderOptions}</select></label><button type="submit">고정지출 추가</button></form><form method="post" action="/admin/recurring/apply" style="margin-top:10px"><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><button type="submit">이번 달 고정지출 기록하기${recurringApplied ? ` (${numberWithCommas(recurringApplied)}건 반영됨)` : ""}</button></form><p class="note">같은 달에 여러 번 눌러도 이미 반영된 항목은 다시 들어가지 않습니다.</p>` : `<p class="note">고정지출 추가·반영·삭제는 가계부 소유자·관리자만 할 수 있습니다.</p>`}</section>${canManage ? `<section class="card"><h2>정기 수입·지출 추가</h2><p class="guideLine"><b>입력 기준</b><br/>매월은 납부일만 입력합니다. 연 1회는 납부월 1개, 반기는 납부월 2개, 분기는 납부월 4개를 선택합니다.</p><form class="formGrid reserveSmartForm" method="post" action="/admin/reserve-plan/create"><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><label>수입·지출${reservePlanTypeRadios("type", "expense")}</label><label>항목명<input name="name" placeholder="예: 재산세, 자동차보험"/></label><label>금액<input name="amount" inputmode="numeric" placeholder="예: 850000"/></label><label class="reserveRepeat"><input type="checkbox" name="is_recurring" value="1"/><span>매월 반복</span></label><label>반복주기<select name="recurrence" class="jsRecurrence"><option value="monthly">매월</option><option value="annual">연 1회</option><option value="semiannual">반기</option><option value="quarterly">분기</option></select></label><label class="dueMonth due1">납부·입금월 1<select name="due_month_1"><option value="">선택</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join("")}</select></label><label class="dueMonth due2">납부·입금월 2<select name="due_month_2"><option value="">선택</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join("")}</select></label><label class="dueMonth due3">납부·입금월 3<select name="due_month_3"><option value="">선택</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join("")}</select></label><label class="dueMonth due4">납부·입금월 4<select name="due_month_4"><option value="">선택</option>${Array.from({length:12},(_,i)=>`<option value="${i+1}">${i+1}월</option>`).join("")}</select></label><label>납부·입금일<input name="due_day" inputmode="numeric" placeholder="예: 16"/></label><label>분류<input name="category" list="reserveCategoryList" placeholder="예: 보험, 세금/수수료, 용돈수입"/></label><datalist id="reserveCategoryList">${categoryOptions}</datalist><label>결제수단<select name="payment_method"><option value="">결제수단 선택 안 함</option>${paymentOptions}</select></label><label>메모<input name="memo" placeholder="메모"/></label><button type="submit">저장</button></form><p class="tip">예: 재산세는 반기 7월/9월, 자동차보험은 연 1회 만기월, 통신비는 매월 납부일만 입력하면 됩니다.</p><script>document.querySelectorAll(".reserveSmartForm").forEach((form)=>{const sel=form.querySelector(".jsRecurrence");const months=[...form.querySelectorAll(".dueMonth")];function sync(){const v=sel?.value||"monthly";const need=v==="monthly"?0:v==="annual"?1:v==="semiannual"?2:4;months.forEach((el,i)=>{const on=i<need;el.hidden=!on;const s=el.querySelector("select");if(s){s.disabled=!on;if(!on)s.value="";}});}sel&&sel.addEventListener("change",sync);sync();});</script></section>` : `<section class="card"><h2>정기 수입·지출 추가</h2><p class="note">정기지출 저장/삭제는 가계부 소유자·관리자만 할 수 있습니다.</p></section>`}</main></body></html>`);
}

async function handleReservePlanCreate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(`/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("정기지출 저장 권한이 없습니다.")}`);
  }
  const recurrence = String(form.get("recurrence") || "monthly");
  // V22.9.37 감사 N10: 선택값을 숫자로 바꾸지 않고 그대로 넘겨 저장 함수가 1~12 를 검증한다(틀린 값을 조용히 버리지 않는다).
  let dueMonths = [form.get("due_month_1"), form.get("due_month_2"), form.get("due_month_3"), form.get("due_month_4")].map((v) => String(v ?? "").trim()).filter(Boolean);
  if (recurrence === "monthly") dueMonths = Array.from({length:12},(_,i)=>i+1);
  try {
    await addReservePlan(env, householdId, {
      name: form.get("name"),
      amount: parseAmountValue(form.get("amount") || "0"),
      type: String(form.get("type") || "expense"),
      is_recurring: form.get("is_recurring") === "1",
      recurrence,
      due_months: dueMonths,
      due_day: form.get("due_day") || 1,
      category: form.get("category") || "세금/수수료",
      payment_method: form.get("payment_method") || "",
      alert_days: [90, 60, 30],
      memo: form.get("memo") || "",
    });
    return redirectResponse(`/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&msg=reserve_saved`);
  } catch (err) {
    // 검증·중복 이름 거절은 코드 그대로 돌려보내 화면이 이유를 말하게 한다. 그 밖의 실패는 예전 문구다.
    const code = safeError(err);
    return redirectResponse(`/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent(/^reserve_[a-z_]+$/.test(code) ? code : "정기지출 저장을 완료하지 못했습니다.")}`);
  }
}

async function handleReservePlanUpdate(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const back = `/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(`${back}&err=${encodeURIComponent("정기 항목 수정 권한이 없습니다.")}`);
  }
  const id = String(form.get("id") || "").trim();
  if (!id) return redirectResponse(`${back}&err=${encodeURIComponent("수정할 항목을 찾지 못했습니다.")}`);
  const recurrence = String(form.get("recurrence") || "monthly");
  // V22.9.37 감사 N10: 선택값을 그대로 넘겨 저장 함수가 1~12 를 검증한다.
  let dueMonths = [form.get("due_month_1"), form.get("due_month_2"), form.get("due_month_3"), form.get("due_month_4")].map((v) => String(v ?? "").trim()).filter(Boolean);
  if (recurrence === "monthly") dueMonths = Array.from({ length: 12 }, (_, i) => i + 1);
  try {
    await updateReservePlan(env, householdId, id, {
      name: form.get("name"),
      amount: parseAmountValue(form.get("amount") || "0"),
      type: String(form.get("type") || "expense"),
      is_recurring: form.get("is_recurring") === "1",
      recurrence,
      due_months: dueMonths,
      due_day: form.get("due_day") || 1,
      category: form.get("category") || "",
      payment_method: form.get("payment_method") || "",
      memo: form.get("memo") || "",
    });
    return redirectResponse(`${back}&msg=reserve_updated`);
  } catch (err) {
    return redirectResponse(`${back}&err=${encodeURIComponent(safeError(err).slice(0, 80) || "정기 항목 수정을 완료하지 못했습니다.")}`);
  }
}

async function handleReservePlanDelete(request, env) {
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const adminOk = await verifyAdminSession(request, env);
  const userId = adminOk ? "" : await verifyUserSession(request, env);
  if (!adminOk) {
    const role = await getHouseholdMemberRole(env, userId, householdId);
    if (!["owner", "admin"].includes(role)) return redirectResponse(`/reserve-plans?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("정기지출 삭제 권한이 없습니다.")}`);
  }
  const id = String(form.get("id") || "").trim();
  if (!id) return redirectResponse(`/reserve-plans?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("삭제할 정기 항목을 찾지 못했습니다.")}`);
  try {
    await deleteReservePlan(env, householdId, id);
    return redirectResponse(`/reserve-plans?household_id=${encodeURIComponent(householdId)}&msg=reserve_deleted`);
  } catch (err) {
    rememberOpsEvent({ kind: "reserve_plan_delete_failed", severity: "warn", path: "/admin/reserve-plan/delete", method: "POST", detail: safeError(err) });
    return redirectResponse(`/reserve-plans?household_id=${encodeURIComponent(householdId)}&err=${encodeURIComponent("정기 항목 삭제를 완료하지 못했습니다. 기존 항목은 유지됩니다.")}`);
  }
}
// @build:exports-start
export {
  addReservePlan, deleteReservePlan, fetchReservePlans, handleReservePlanCreate,
  handleReservePlanDelete, handleReservePlanUpdate, handleReservePlansPage, kakaoReserveAlert,
  normalizeReservePlanList, reserveDashboard, reservePlansKey, updateReservePlan,
};
// @build:exports-end
