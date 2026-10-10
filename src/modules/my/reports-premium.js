// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import {
  claimOperationLease, operationLeaseOwner, parseStrictSettingsObject, releaseOperationLease,
  safeError, withHouseholdSettingsRmw,
} from "../runtime/leases.js";
import { htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import { verifyCronExecutionAuth } from "../auth/crypto-admin-session.js";
import {
  MAX_TRANSACTION_AMOUNT, isValidTransactionDateString,
} from "../admin/transactions-households.js";
import {
  fetchPaymentAssets, normalizePaymentAssetList, paymentAssetKindMeta, paymentAssetsKey,
} from "../settings/payment-assets.js";
import {
  normalizeReservePlanList, reservePlanStatus, reservePlansKey,
} from "../settings/reserve-plans.js";
import {
  fetchAdminRows, fetchAdminRowsRange, isRowLimitExceededError,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { computeCardUsageMap } from "../features/payment-methods-page.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { getMyPageContext, renderReportMonthNavigator, reportUxCss } from "./report-challenge.js";
import {
  canManageMyHousehold, canWriteMyHousehold, getMySelectedHousehold,
} from "./access-control.js";
import { fetchRecurring, fetchRecurringStrict } from "../domain/budgets.js";
import {
  buildWeeklyReport, detectRecurringCandidates, findAnomalousExpenses, renderAnomalyList,
} from "../admin/pc-analysis-calendar.js";
import { addMonthsYm, calculateExtendedAnalytics } from "../domain/analytics.js";
import { buildPremiumState } from "../features/meme-engine-premium.js";
import { supabase } from "../data/supabase-client.js";
import {
  currentMonthKst, formatDate, nowKstDate, validMonth, weekdayIndexOfYmd,
} from "../nlu/date-payment.js";
import {
  calculateStats, escapeHtml, nextMonthStart, numberWithCommas,
} from "../domain/transactions-core.js";
import { parseStrictAmount } from "../domain/strict-input.js";
// @build:imports-end

function freeReportPreferenceKey(householdId = "") {
  return `free_report_preference:${String(householdId || "").trim()}`.slice(0, 180);
}

function freeReportSnapshotKey(householdId = "", kind = "weekly", period = "") {
  return `free_report_snapshot:${String(householdId || "").trim()}:${kind}:${period}`.slice(0, 180);
}

function parseJsonSetting(value, fallback = {}) {
  if (value && typeof value === "object") return value;
  try { return value ? JSON.parse(String(value)) : fallback; } catch (err) { return fallback; }
}

function parseJsonArraySettingStrict(value, errorCode = "settings_json_invalid") {
  if (value === "" || value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") {
    try {
      const parsed = JSON.parse(value);
      if (Array.isArray(parsed)) return parsed;
    } catch (err) {}
  }
  throw new Error(errorCode);
}

async function saveSettingValue(env, key, value) {
  await supabase(env, "/rest/v1/accountbook_settings?on_conflict=key", {
    method: "POST",
    headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
    body: JSON.stringify({ key: String(key).slice(0, 180), value: typeof value === "string" ? value : JSON.stringify(value) }),
  });
}

function isoWeekPeriod(date = nowKstDate()) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const day = d.getDay() || 7;
  d.setDate(d.getDate() + 4 - day);
  const yearStart = new Date(d.getFullYear(), 0, 1);
  const week = Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
  return `${d.getFullYear()}-W${String(week).padStart(2, "0")}`;
}

function buildFreeReportSnapshot(rows = [], { householdId = "", householdName = "가계부", kind = "monthly", period = "", generatedAt = new Date().toISOString() } = {}) {
  const safeRows = safeArray(rows);
  const stats = calculateStats(safeRows);
  const expenses = safeRows.filter((row) => row.type !== "income" && Number(row.amount || 0) > 0);
  const topCategories = safeArray(stats.categories).filter((item) => Number(item.expense || 0) > 0).slice(0, 5).map((item) => ({ name: item.category || "미분류", amount: Number(item.expense || 0), count: Number(item.count || 0) }));
  const biggest = expenses.slice().sort((a, b) => Number(b.amount || 0) - Number(a.amount || 0))[0] || null;
  const activeDates = new Set(expenses.map((row) => String(row.transaction_date || "").slice(0, 10)).filter(Boolean));
  return {
    version: 1,
    household_id: householdId,
    household_name: householdName,
    kind,
    period,
    generated_at: generatedAt,
    income: Number(stats.totals?.income || 0),
    expense: Number(stats.totals?.expense || 0),
    balance: Number(stats.totals?.balance || 0),
    transaction_count: safeRows.length,
    spend_days: activeDates.size,
    top_categories: topCategories,
    biggest: biggest ? { memo: biggest.memo || biggest.raw_text || biggest.category || "지출", amount: Number(biggest.amount || 0), date: String(biggest.transaction_date || "") } : null,
  };
}

function freeReportShareText(report = {}) {
  const top = safeArray(report.top_categories).slice(0, 3).map((item, index) => `${index + 1}. ${item.name} ${numberWithCommas(item.amount)}원`).join("\n") || "분류별 지출 없음";
  const label = report.kind === "weekly" ? "주간" : "월간";
  return [`📊 ${report.household_name || "가계부"} ${label} 리포트`, `기간: ${report.period || "-"}`, `수입 ${numberWithCommas(report.income)}원 · 지출 ${numberWithCommas(report.expense)}원`, `잔액 ${numberWithCommas(report.balance)}원 · 기록 ${numberWithCommas(report.transaction_count)}건`, "", "지출 상위", top, report.biggest ? `\n가장 큰 지출: ${report.biggest.memo} ${numberWithCommas(report.biggest.amount)}원` : ""].filter(Boolean).join("\n");
}

async function handleReportPreferenceSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const returnTo = `/reports?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}`;
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(`${returnTo}&err=manage_required`);
  const weekly = String(form.get("weekly") || "") === "1";
  const monthly = String(form.get("monthly") || "") === "1";
  const enabledRequested = String(form.get("enabled") || "") === "1";
  const preference = {
    household_id: selected.id,
    household_name: selected.name || "가계부",
    // 생성 주기를 하나도 고르지 않은 상태에서는 자동 생성을 켜지 않습니다.
    enabled: enabledRequested && (weekly || monthly),
    weekly,
    monthly,
    updated_by: userId,
    updated_at: new Date().toISOString(),
  };
  try {
    await saveSettingValue(env, freeReportPreferenceKey(selected.id), preference);
    return redirectResponse(`${returnTo}&msg=preference_saved`);
  } catch (err) {
    rememberOpsEvent({ kind: "free_report_preference_failed", severity: "warn", path: "/my/report-preference/save", method: "POST", detail: safeError(err) });
    return redirectResponse(`${returnTo}&err=save_failed`);
  }
}

async function runAutomaticReportsUnlocked(env, opts = {}) {
  const invocationDate = opts.today || formatDate(nowKstDate());
  const cursorKey = "cron_report_cursor_v22930";
  const cursor = parseStrictSettingsObject(await getSettingValueStrict(env,cursorKey),"report_cursor");
  if (cursor.scopes !== undefined && !Array.isArray(cursor.scopes)) throw new Error("report_cursor_scope_invalid");
  const scopes = safeArray(cursor.scopes).map(scope => ({...scope}));
  if (scopes.some(scope => !isValidTransactionDateString(scope.date) || typeof scope.after !== "string" || [scope.force,scope.weekly,scope.monthly].some(flag => typeof flag !== "boolean"))) throw new Error("report_cursor_scope_invalid");
  const requested = new Date(`${invocationDate}T12:00:00`);
  const requestedTomorrow = new Date(requested.getFullYear(),requested.getMonth(),requested.getDate()+1);
  if ((opts.force || requested.getDay() === 0 || requestedTomorrow.getMonth() !== requested.getMonth()) && !scopes.some(scope => scope.date === invocationDate)) scopes.push({date:invocationDate,after:"",force:!!opts.force,weekly:!!opts.force || requested.getDay()===0,monthly:!!opts.force || requestedTomorrow.getMonth()!==requested.getMonth()});
  if (!scopes.length) return {ok:true,partial:false,today:invocationDate,invocation_date:invocationDate,scanned:0,generated:0,skipped:0,invalid:0,failed:0};
  await saveSettingValue(env,cursorKey,JSON.stringify({scopes}));
  const active = scopes[0];
  const today = new Date(`${active.date}T12:00:00`), todayString = active.date;
  const tomorrow = new Date(today.getFullYear(),today.getMonth(),today.getDate()+1);
  const isWeekEnd = active.weekly, isMonthEnd = active.monthly, force = active.force;
  const preferenceQuery = new URLSearchParams();
  preferenceQuery.append("key", "gte.free_report_preference:");
  preferenceQuery.append("key", "lt.free_report_preference;");
  preferenceQuery.set("select", "key,value");
  if (active.after) preferenceQuery.append("key", `gt.${active.after}`);
  preferenceQuery.set("order", "key.asc");
  preferenceQuery.set("limit", "3");
  const settings = await supabase(env, `/rest/v1/accountbook_settings?${preferenceQuery}`, {method:"GET"});
  if (!Array.isArray(settings)) throw new Error("report_preferences_source_invalid");
  let after = active.after, partial = settings.length === 3;
  let scanned = 0, generated = 0, skipped = 0, failed = 0, invalid = 0;
  scan: for (const setting of safeArray(settings).slice(0,2)) {
    if ((env.__AB_DB_BUDGET?.used || 0) >= 41) { partial = true; break; }
    const previousAfter = after;
    after = String(setting.key || "");
    const preference = parseJsonSetting(setting.value, {});
    const key = String(setting.key || "");
    const prefix = "free_report_preference:";
    const householdId = key.startsWith(prefix) ? key.slice(prefix.length).trim() : "";
    // 설정 JSON이 변조되거나 오래된 값과 섞여도 다른 가계부를 읽지 않도록
    // 실제 조회 범위는 키에 들어 있는 가계부 ID만 신뢰합니다.
    if (!householdId || (preference.household_id && String(preference.household_id) !== householdId)) {
      invalid++;
      rememberOpsEvent({ kind: "free_report_preference_scope_mismatch", severity: "warn", path: "/cron/reports/generate", method: "SCHEDULED", detail: key.slice(0, 180) });
      continue;
    }
    if (!preference.enabled) { skipped++; continue; }
    scanned++;
    const jobs = [];
    if (preference.weekly && (force || isWeekEnd)) jobs.push({ kind: "weekly", period: isoWeekPeriod(today), start: formatDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 6)), end: formatDate(tomorrow) });
    if (preference.monthly && (force || isMonthEnd)) jobs.push({ kind: "monthly", period: todayString.slice(0, 7), start: `${todayString.slice(0, 7)}-01`, end: formatDate(tomorrow) });
    if (!jobs.length) { skipped++; continue; }
    for (const job of jobs) {
      if ((env.__AB_DB_BUDGET?.used || 0) >= 41) { after = previousAfter; partial = true; break scan; }
      const snapshotKey = freeReportSnapshotKey(householdId, job.kind, job.period);
      try {
        const existing = await getSettingValue(env, snapshotKey);
        if (existing && !force) { skipped++; continue; }
        const rows = await fetchAdminRowsRange(env, { householdId, start: job.start, end: job.end, limit: 9001 });
        const report = buildFreeReportSnapshot(rows, { householdId, householdName: preference.household_name || "가계부", kind: job.kind, period: job.period });
        await saveSettingValue(env, snapshotKey, report);
        generated++;
      } catch (err) {
        if (isRowLimitExceededError(err)) {
          // 기간 기록이 한도를 넘으면 일부만으로 스냅숏을 저장하지 않고 이 기간만 건너뛴다(QA B05).
          failed++;
          rememberOpsEvent({ kind: "free_report_row_limit", severity: "warn", path: "/cron/reports/generate", method: "SCHEDULED", detail: `${householdId}:${job.kind}:${job.period}` });
          continue;
        }
        failed++; after = previousAfter; partial = true;
        rememberOpsEvent({ kind: "free_report_generate_failed", severity: "warn", path: "/cron/reports/generate", method: "SCHEDULED", detail: `${householdId}:${job.kind}:${safeError(err)}` });
        break scan;
      }
    }
  }
  if (partial) active.after = after; else scopes.shift();
  await saveSettingValue(env,cursorKey,JSON.stringify({scopes}));
  partial = partial || scopes.length > 0;
  return { ok: failed === 0 && !partial, partial, cursor:after, today: todayString, invocation_date:invocationDate, pending_scopes:scopes.length, scanned, generated, skipped, invalid, failed };
}

async function runAutomaticReports(env, opts = {}) {
  if (!env.__AB_DB_BUDGET) env = {...env,__AB_DB_BUDGET:{used:0,limit:50}};
  const today = String(opts.today || formatDate(nowKstDate())).slice(0, 10);
  if (opts.lock === false) return runAutomaticReportsUnlocked(env, opts);
  const lease = await claimOperationLease(env, {
    key: "cron:reports:v22930",
    owner: operationLeaseOwner("reports"),
    leaseSeconds: Number(env.CRON_REPORT_LEASE_SECONDS || 900),
  });
  if (!lease.acquired) {
    rememberOpsEvent({ kind: "scheduled_duplicate_skipped", severity: "info", path: "/cron/reports/generate", method: "SCHEDULED", detail: `${today}:${lease.mode}` });
    return { ok: true, today, scanned: 0, generated: 0, skipped: 0, invalid: 0, failed: 0, skipped_run: true, reason: "already_running", lock_mode: lease.mode };
  }
  try {
    return { ...(await runAutomaticReportsUnlocked(env, opts)), skipped_run: false, lock_mode: lease.mode };
  } finally {
    await releaseOperationLease(env, lease);
  }
}

async function handleAutomaticReportCron(request, env, url) {
  if (!verifyCronExecutionAuth(request, env)) return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "예약 실행 인증이 필요합니다." }, 401);
  // V22.9.26: 날짜가 아닌 today 는 버린다. 예전에는 "NaN-NaN" 스냅샷 키가 저장됐다.
  const todayParam = String(url.searchParams.get("today") || "").trim();
  const result = await runAutomaticReports(env, { today: isValidTransactionDateString(todayParam) ? todayParam : "", force: url.searchParams.get("force") === "1" });
  return jsonResponse(result, result.ok ? 200 : 207);
}

// ── V22.9.38 생활비 리포트 ────────────────────────────────────────────────────
// /reports 는 합계 네 칸과 상위 분류 표만 있던 "월 마감" 화면이었다. 이제 같은 기록을 주간·월간으로 읽는 생활비
// 리포트다. 비교 기준은 한 가지만 쓰고 화면에 그대로 적는다(지난달 같은 기간 / 지난달 전체 / 지난주 같은 요일까지 /
// 지난주 전체). 늘어난 지출을 "낭비"라고 부르지 않는다 — 얼마나, 어디서 늘었는지만 보여 준다.
// 카드별 사용액은 기록된 금액이지 카드사가 인정하는 실적이 아니다. 실적 목표는 사용자가 적는 값이고, 화면은 "예상"으로만 말한다.
const LIVING_REPORT_RANGES = new Set(["month", "week"]);
const LIVING_REPORT_WEEKDAYS = ["일", "월", "화", "수", "목", "금", "토"];
const LIVING_REPORT_SUBSCRIPTION = /구독|넷플릭스|유튜브|쿠팡와우|멜론|티빙|웨이브|디즈니|스포티파이|멤버십/;
const LIVING_REPORT_GROCERY = /마트|장보기|시장|코스트코|트레이더스|이마트|홈플러스|식자재|슈퍼/;
const LIVING_REPORT_BUCKETS = [
  ["배달", /배달|배민|요기요|쿠팡이츠|치킨|피자|야식|족발|닭발/],
  ["카페·간식", /카페|간식|커피|스타벅스|스벅|투썸|이디야|빽다방|메가커피|컴포즈|디저트/],
  ["외식", /외식|식당|점심|저녁|아침|밥|분식|국밥|고기|회식|술|맥주|소주/],
  ["쇼핑", /쇼핑|쿠팡|네이버쇼핑|무신사|올리브영|택배|구매|주문|옷|의류|신발|가방|화장품/],
];

function cardTargetsKey(householdId = "") {
  return `card_targets:${String(householdId || "").trim()}`.slice(0, 180);
}

function parseCardTargetsStrict(value) {
  const parsed = parseStrictSettingsObject(value, "card_targets");
  const out = Object.create(null);
  for (const key of Object.keys(parsed)) {
    const item = parsed[key];
    if (!key || key.length > 80 || ["__proto__", "constructor", "prototype"].includes(key) || !item || typeof item !== "object" || Array.isArray(item) || typeof item.target !== "number" || parseStrictAmount(item.target, { min: 1000 }) === null || (item.updated_at !== undefined && typeof item.updated_at !== "string")) throw new Error("card_targets_invalid");
    out[key] = { ...item };
  }
  return out;
}

function parseReportPreferenceStrict(value) {
  const parsed = parseStrictSettingsObject(value, "report_preference");
  for (const key of ["enabled", "weekly", "monthly"]) if (parsed[key] !== undefined && typeof parsed[key] !== "boolean") throw new Error("report_preference_invalid");
  return { enabled: false, weekly: true, monthly: true, ...parsed };
}

function parseCardTargets(value) {
  const parsed = parseJsonSetting(value, {});
  const out = Object.create(null);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return out;
  for (const key of Object.keys(parsed)) {
    if (key === "__proto__" || key === "constructor" || key === "prototype" || key.length > 80) continue;
    const target = Math.round(Number(parsed[key]?.target));
    if (Number.isInteger(target) && target > 0 && target <= MAX_TRANSACTION_AMOUNT) out[key] = { target, updated_at: String(parsed[key]?.updated_at || "").slice(0, 40) };
  }
  return out;
}

async function fetchSettingValues(env, keys = []) {
  const wanted = keys.filter(Boolean);
  if (!wanted.length) return new Map();
  const rows = await supabase(env, `/rest/v1/accountbook_settings?key=in.(${wanted.map(encodeURIComponent).join(",")})&select=key,value`, { method: "GET" });
  if (!Array.isArray(rows) || rows.some((row) => !row || typeof row.key !== "string")) throw new Error("report_settings_invalid");
  return new Map(rows.map((row) => [row.key, row.value]));
}

function ymdShift(ymd = "", days = 0) {
  const d = new Date(`${String(ymd).slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + Number(days || 0));
  return d.toISOString().slice(0, 10);
}
function mondayOfYmd(ymd = "") {
  const idx = weekdayIndexOfYmd(ymd);
  return ymdShift(ymd, idx === 0 ? -6 : 1 - idx);
}
function monthLastYmd(month = "") { return ymdShift(nextMonthStart(month), -1); }
function daysBetweenYmd(a = "", b = "") { return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000); }
function shortYmdKo(ymd = "") { return `${Number(ymd.slice(5, 7))}/${Number(ymd.slice(8, 10))}`; }
function ymdWithWeekday(ymd = "") { return `${shortYmdKo(ymd)}(${LIVING_REPORT_WEEKDAYS[weekdayIndexOfYmd(ymd)] || ""})`; }

function livingReportHref({ month = currentMonthKst(), householdId = "", range = "month", week = "" } = {}) {
  const params = new URLSearchParams({ month: validMonth(month) || currentMonthKst() });
  if (householdId) params.set("household_id", String(householdId));
  if (range === "week") { params.set("range", "week"); if (week) params.set("week", week); }
  return `/reports?${params.toString()}`;
}

// 기간과 비교 기준. 지금 진행 중인 기간은 오늘까지와 "같은 길이의 직전 기간"을, 끝난 기간은 전체끼리 견준다.
function livingReportPeriod({ range = "month", month = currentMonthKst(), week = "", today = "" } = {}) {
  const monthStart = `${month}-01`;
  const monthEnd = monthLastYmd(month);
  const todayMonth = today.slice(0, 7);
  if (range === "week") {
    const requestedStart = isValidTransactionDateString(week) ? mondayOfYmd(week) : "";
    const overlaps = requestedStart && requestedStart <= monthEnd && ymdShift(requestedStart, 6) >= monthStart;
    const anchor = overlaps ? week : month === todayMonth ? today : month < todayMonth ? monthEnd : monthStart;
    const start = mondayOfYmd(anchor);
    const end = ymdShift(start, 6);
    const live = today >= start && today <= end;
    const basisEnd = live ? today : today > end ? end : "";
    const elapsed = basisEnd ? daysBetweenYmd(start, basisEnd) + 1 : 0;
    return {
      range: "week", start, end, basisEnd, elapsed, live,
      prevStart: ymdShift(start, -7), prevEnd: ymdShift(basisEnd || end, -7),
      label: `${shortYmdKo(start)}~${shortYmdKo(end)}`, title: `${ymdWithWeekday(start)}부터 한 주`,
      basisLabel: live ? "지난주 같은 요일까지 대비" : "지난주 전체 대비",
      basisNote: live ? `이번 주 월요일부터 오늘(${ymdWithWeekday(today)})까지를 지난주 같은 요일까지와 견줍니다.` : "지난주 7일 전체와 견줍니다.",
    };
  }
  const live = month === todayMonth;
  const basisEnd = live ? today : month < todayMonth ? monthEnd : "";
  const elapsed = basisEnd ? daysBetweenYmd(monthStart, basisEnd) + 1 : 0;
  const prevMonth = addMonthsYm(month, -1);
  const prevFull = monthLastYmd(prevMonth);
  const prevSameDay = basisEnd ? `${prevMonth}-${basisEnd.slice(8, 10)}` : prevFull;
  const prevEnd = live && basisEnd ? (prevSameDay > prevFull ? prevFull : prevSameDay) : prevFull;
  const clippedPreviousMonth = live && prevSameDay > prevFull;
  return {
    range: "month", start: monthStart, end: monthEnd, basisEnd, elapsed, live,
    prevStart: `${prevMonth}-01`, prevEnd,
    label: `${Number(month.slice(5, 7))}월`, title: `${month.slice(0, 4)}년 ${Number(month.slice(5, 7))}월`,
    basisLabel: live ? (clippedPreviousMonth ? `지난달 1~${Number(prevEnd.slice(8, 10))}일 대비` : `지난달 같은 기간(1~${Number(prevEnd.slice(8, 10))}일) 대비`) : "지난달 전체 대비",
    basisNote: live ? `이번 달 1일부터 오늘(${ymdWithWeekday(today)})까지를 지난달 1일부터 ${Number(prevEnd.slice(8, 10))}일까지와 견줍니다.${clippedPreviousMonth ? " 지난달은 마지막 날까지만 비교합니다." : ""}` : "지난달 한 달 전체와 견줍니다.",
  };
}

function livingReportWeeks(month = currentMonthKst(), today = "") {
  const last = monthLastYmd(month);
  const weeks = [];
  for (let start = mondayOfYmd(`${month}-01`); start <= last && weeks.length < 6; start = ymdShift(start, 7)) {
    const end = ymdShift(start, 6);
    weeks.push({ start, end, current: today >= start && today <= end, future: start > today });
  }
  return weeks;
}

function livingReportBucket(row = {}) {
  const text = `${row.category || ""} ${row.memo || ""} ${row.raw_text || ""}`;
  if (LIVING_REPORT_BUCKETS[0][1].test(text)) return "배달";
  if (LIVING_REPORT_BUCKETS[1][1].test(text)) return "카페·간식";
  if (LIVING_REPORT_GROCERY.test(text)) return "장보기";
  if (LIVING_REPORT_BUCKETS[2][1].test(text)) return "외식";
  if (LIVING_REPORT_BUCKETS[3][1].test(text)) return "쇼핑";
  return "";
}

function buildLivingReport({ month = currentMonthKst(), range = "month", week = "", historyRows = [], recurring = [], assets = [], targets = Object.create(null), reservePlans = [], historyAvailable = true, recurringAvailable = true, settingsAvailable = true, today = formatDate(nowKstDate()) } = {}) {
  const period = livingReportPeriod({ range, month, week, today });
  const inWindow = (row, start, end) => { const d = String(row.transaction_date || "").slice(0, 10); return d >= start && d <= end; };
  const rowsAll = safeArray(historyRows);
  const expenseRows = rowsAll.filter((r) => r.type !== "income" && Number(r.amount || 0) > 0);
  const curEnd = period.basisEnd || period.end;
  const cur = period.basisEnd ? expenseRows.filter((r) => inWindow(r, period.start, curEnd)) : [];
  const currentRows = period.basisEnd ? rowsAll.filter((r) => inWindow(r, period.start, curEnd)) : [];
  const income = currentRows.filter((r) => r.type === "income").reduce((s, r) => s + Number(r.amount || 0), 0);
  const comparisonAvailable = historyAvailable && !!period.basisEnd;
  const currentAvailable = historyAvailable || (period.start >= `${month}-01` && period.end <= monthLastYmd(month));
  const prev = expenseRows.filter((r) => inWindow(r, period.prevStart, period.prevEnd));
  const sum = (rows) => rows.reduce((s, r) => s + Number(r.amount || 0), 0);
  const expense = sum(cur);
  const prevExpense = sum(prev);
  const delta = expense - prevExpense;
  const deltaPct = prevExpense > 0 ? Math.round(delta / prevExpense * 100) : null;
  const spendDays = new Set(cur.map((r) => String(r.transaction_date || "").slice(0, 10))).size;
  const dailyAvg = period.elapsed ? Math.round(expense / period.elapsed) : 0;
  const byDay = Object.create(null);
  for (const r of cur) { const d = String(r.transaction_date || "").slice(0, 10); byDay[d] = (byDay[d] || 0) + Number(r.amount || 0); }
  const days = [];
  for (let d = period.start; d <= period.end && days.length < 40; d = ymdShift(d, 1)) days.push({ date: d, amount: byDay[d] || 0, future: !period.basisEnd || d > period.basisEnd });
  const topDays = days.filter((d) => d.amount > 0).sort((a, b) => b.amount - a.amount).slice(0, 3);
  const stats = calculateStats(cur);
  const topCategories = safeArray(stats.categories).filter((c) => Number(c.expense || 0) > 0).slice(0, 5).map((c) => ({ name: c.category || "미분류", amount: Number(c.expense || 0), count: Number(c.count || 0), share: expense ? Math.round(Number(c.expense || 0) / expense * 100) : 0 }));
  let weekendSum = 0, weekendDays = 0, weekdaySum = 0, weekdayDays = 0;
  for (const d of days) {
    if (d.future) continue;
    const idx = weekdayIndexOfYmd(d.date);
    if (idx === 0 || idx === 6) { weekendSum += d.amount; weekendDays += 1; } else { weekdaySum += d.amount; weekdayDays += 1; }
  }
  const weekend = { amount: weekendSum, days: weekendDays, avg: weekendDays ? Math.round(weekendSum / weekendDays) : 0, weekdayAmount: weekdaySum, weekdayDays, weekdayAvg: weekdayDays ? Math.round(weekdaySum / weekdayDays) : 0, share: expense ? Math.round(weekendSum / expense * 100) : 0 };
  const buckets = ["배달", "카페·간식", "외식", "장보기", "쇼핑"].map((name) => {
    const c = cur.filter((r) => livingReportBucket(r) === name);
    const p = prev.filter((r) => livingReportBucket(r) === name);
    return { name, amount: sum(c), count: c.length, prevAmount: sum(p), prevCount: p.length, delta: sum(c) - sum(p) };
  });
  const biggestIncrease = comparisonAvailable ? buckets.filter((b) => b.delta > 0).sort((a, b) => b.delta - a.delta)[0] || null : null;
  const rules = safeArray(recurring).filter((r) => r.is_active !== false && String(r.type || "expense") !== "income");
  const monthRows = expenseRows.filter((r) => inWindow(r, `${month}-01`, monthLastYmd(month)));
  const ruleItems = rules.map((rule) => {
    const applied = monthRows.some((r) => String(r.raw_text || "") === `recurring:${rule.id}:${month}`);
    return { id: String(rule.id || ""), memo: String(rule.memo || rule.category || "정기지출"), amount: Number(rule.amount || 0), day: Number(rule.day_of_month || 1), category: String(rule.category || ""), applied };
  });
  const fixedTotal = ruleItems.reduce((s, r) => s + r.amount, 0);
  const candidates = historyAvailable && recurringAvailable ? detectRecurringCandidates(rowsAll, month, recurring).slice(0, 5) : [];
  const subscriptionRows = cur.filter((r) => LIVING_REPORT_SUBSCRIPTION.test(`${r.category || ""} ${r.memo || ""} ${r.raw_text || ""}`));
  const subscription = { amount: sum(subscriptionRows), count: subscriptionRows.length };
  const fromDate = new Date(`${today}T00:00:00`);
  const upcoming = safeArray(reservePlans).map((plan) => reservePlanStatus(plan, fromDate)).filter((s) => Number(s.days_left) <= 30).sort((a, b) => a.days_left - b.days_left).slice(0, 5)
    .map((s) => ({ name: String(s.plan?.name || "적립 계획"), amount: Number(s.plan?.amount || 0), due_date: s.due_date, days_left: s.days_left, monthly_reserve: s.monthly_reserve }));
  const cards = safeArray(assets).filter((a) => paymentAssetKindMeta(a.kind).group === "card");
  const usage = computeCardUsageMap(cards, cur);
  const prevUsage = computeCardUsageMap(cards, prev);
  const cardItems = cards.map((c) => {
    const u = usage[c.id] || { count: 0, amount: 0 };
    const target = Number(targets[c.id]?.target || 0);
    return { id: String(c.id), name: String(c.name || "카드"), issuer: String(c.issuer || ""), amount: u.amount, count: u.count, prevAmount: Number((prevUsage[c.id] || {}).amount || 0), target, rate: target ? Math.min(999, Math.round(u.amount / target * 100)) : null, remaining: target ? Math.max(0, target - u.amount) : null, reached: historyAvailable && range === "month" && period.elapsed > 0 && target > 0 && u.amount >= target };
  });
  const noSpendDays = days.filter((d) => !d.future && d.amount === 0).length;
  const badges = [];
  if (period.elapsed >= 3 && noSpendDays >= 3) badges.push({ emoji: "🌿", text: `무지출 ${noSpendDays}일` });
  if (comparisonAvailable && prevExpense > 0 && delta < 0) badges.push({ emoji: "📉", text: `${period.basisLabel.replace(/ 대비$/, "")}보다 ${Math.abs(deltaPct)}% 적게` });
  if (ruleItems.length) badges.push({ emoji: "📌", text: `고정비 ${ruleItems.length}건 등록` });
  for (const c of cardItems) if (c.reached) badges.push({ emoji: "💳", text: `${c.name} 실적 목표 달성` });
  if (period.elapsed >= 5 && spendDays >= Math.ceil(period.elapsed * 0.6)) badges.push({ emoji: "✍️", text: `${spendDays}일 꾸준히 기록` });
  return { month, period, historyAvailable, recurringAvailable, settingsAvailable, currentAvailable, comparisonAvailable, expense, prevExpense, delta, deltaPct, income, count: currentRows.length, spendDays, dailyAvg, days, topDays, topCategories, weekend, buckets, biggestIncrease, ruleItems, fixedTotal, candidates, subscription, upcoming, cards: cardItems, badges: historyAvailable && period.elapsed > 0 ? badges : [], noSpendDays };
}

function livingReportChangeText(report = {}) {
  const basis = String(report.period?.basisLabel || "").replace(/ 대비$/, "");
  if (!report.period?.basisEnd) return "아직 오지 않은 기간이라 지출이 없어요.";
  if (!report.historyAvailable) return "이전 기록을 불러오지 못해 비교할 수 없어요.";
  if (!(report.prevExpense > 0)) return `${basis} 기록이 없어 비교하지 않아요.`;
  if (report.delta === 0) return `${basis}와 같아요.`;
  return `${basis}보다 ${numberWithCommas(Math.abs(report.delta))}원 ${report.delta > 0 ? "더" : "덜"} 썼어요 (${report.delta > 0 ? "+" : "−"}${Math.abs(report.deltaPct)}%).`;
}

function livingReportShareText(report = {}, householdName = "가계부") {
  const p = report.period || {};
  if (!report.currentAvailable) return `${householdName} 생활비 리포트\n기간: ${p.title || ""}\n기간 전체 기록을 불러오지 못해 합계와 무지출 일수를 확인할 수 없습니다. 새로고침한 뒤 다시 확인해 주세요.`;
  const top = safeArray(report.topCategories).slice(0, 3).map((item, index) => `${index + 1}. ${item.name} ${numberWithCommas(item.amount)}원`).join("\n") || "분류별 지출 없음";
  const lines = [`📊 ${householdName} ${p.range === "week" ? "주간" : "월간"} 생활비 리포트`, `기간: ${p.title || ""}${p.live ? " (오늘까지)" : ""}`, `지출 ${numberWithCommas(report.expense)}원 · ${livingReportChangeText(report)}`, `기록 ${numberWithCommas(report.count)}건 · 지출한 날 ${numberWithCommas(report.spendDays)}일 · 하루 평균 ${numberWithCommas(report.dailyAvg)}원`, "", "지출 상위", top];
  if (report.fixedTotal > 0) lines.push("", `${p.range === "week" ? "월 정기 예정액" : "고정비"} ${numberWithCommas(report.fixedTotal)}원 (정기 항목 ${report.ruleItems.length}건)`);
  if (report.topDays?.length) lines.push(`가장 많이 쓴 날: ${ymdWithWeekday(report.topDays[0].date)} ${numberWithCommas(report.topDays[0].amount)}원`);
  if (report.badges?.length) lines.push("", report.badges.map((b) => `${b.emoji} ${b.text}`).join("  "));
  lines.push("", `기준: ${p.basisLabel || ""} · 말해가계부`);
  return lines.join("\n");
}

async function handleFreeReportsPage(request, env, url) {
  const ctx = await getMyPageContext(request, env, url);
  if (ctx.redirect) return ctx.redirect;
  const hid = ctx.selected.id;
  const month = ctx.month;
  const range = LIVING_REPORT_RANGES.has(String(url.searchParams.get("range") || "")) ? String(url.searchParams.get("range")) : "month";
  const week = isValidTransactionDateString(String(url.searchParams.get("week") || "")) ? String(url.searchParams.get("week")) : "";
  const currentWeek = isoWeekPeriod(nowKstDate());
  const keys = { preference: freeReportPreferenceKey(hid), weekly: freeReportSnapshotKey(hid, "weekly", currentWeek), monthly: freeReportSnapshotKey(hid, "monthly", month), assets: paymentAssetsKey(hid), targets: cardTargetsKey(hid), reserve: reservePlansKey(hid) };
  // 지난달·지지난달까지 한 번에 읽는다(비교 기준·정기 지출 후보·주간 창이 달을 넘는 경우). 설정 여섯 개는 한 질의로 받는다.
  const period = livingReportPeriod({ range, month, week, today: formatDate(nowKstDate()) });
  const historyStart = [`${addMonthsYm(month, -2)}-01`, period.prevStart, period.start].sort()[0];
  const historyEnd = [nextMonthStart(month), ymdShift(period.end, 1)].sort().at(-1);
  const [historyResult, settingsResult, recurringResult] = await Promise.all([
    fetchAdminRowsRange(env, { householdId: hid, start: historyStart, end: historyEnd, type: "all" }).then((rows) => ({ rows, truncated: false })).catch((err) => ({ rows: null, truncated: isRowLimitExceededError(err), error: safeError(err) })),
    fetchSettingValues(env, Object.values(keys)).catch((err) => { rememberOpsEvent({ kind: "living_report_settings_unavailable", severity: "warn", path: "/reports", method: "GET", detail: safeError(err) }); return null; }),
    fetchRecurringStrict(env, hid).then((rows) => ({ rows, available: true })).catch(() => ({ rows: [], available: false })),
  ]);
  const historyRows = Array.isArray(historyResult.rows) ? historyResult.rows : ctx.rows;
  const historyLimited = !Array.isArray(historyResult.rows);
  const values = settingsResult || new Map();
  let settingsUnavailable = !settingsResult;
  let preference = null, targets = Object.create(null);
  try {
    if (settingsResult) { preference = parseReportPreferenceStrict(values.get(keys.preference)); targets = parseCardTargetsStrict(values.get(keys.targets)); }
  } catch { settingsUnavailable = true; }
  const live = buildFreeReportSnapshot(ctx.rows, { householdId: hid, householdName: ctx.selected.name || "가계부", kind: "monthly", period: month });
  const weeklySnapshot = parseJsonSetting(values.get(keys.weekly), null);
  const monthlySnapshot = parseJsonSetting(values.get(keys.monthly), null);
  const assets = normalizePaymentAssetList(values.get(keys.assets), hid);
  const reservePlans = normalizeReservePlanList(values.get(keys.reserve), hid);
  const report = buildLivingReport({ month, range, week, historyRows, recurring: recurringResult.rows, assets, targets, reservePlans, historyAvailable: !historyLimited, recurringAvailable: recurringResult.available, settingsAvailable: !settingsUnavailable, today: formatDate(nowKstDate()) });
  return htmlResponse(renderFreeReportsHtml({ env, ...ctx, report, range, week, live, preference, weeklySnapshot, monthlySnapshot, historyLimited, settingsUnavailable, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

async function handleCardTargetSave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const range = String(form.get("range") || "") === "week" ? "week" : "month";
  const week = isValidTransactionDateString(String(form.get("week") || "")) ? String(form.get("week")) : "";
  const returnTo = livingReportHref({ month, householdId, range, week });
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(`${returnTo}&err=card_target_write_not_allowed#cards`);
  const assetId = String(form.get("asset_id") || "").trim().slice(0, 80);
  const rawTarget = String(form.get("target") || "").trim();
  const target = rawTarget === "" ? 0 : parseStrictAmount(rawTarget, { allowCommas: true });
  const clear = target === 0;
  if (!assetId || assetId === "__proto__" || assetId === "constructor" || assetId === "prototype" || (!clear && !(Number.isInteger(target) && target >= 1000 && target <= MAX_TRANSACTION_AMOUNT))) return redirectResponse(`${returnTo}&err=card_target_invalid#cards`);
  try {
    await withHouseholdSettingsRmw(env, householdId, async ({ assertFresh }) => {
      // 감사 S2~S11 규칙: 엄격한 읽기로 지금 값을 받고, 바꾸는 카드 하나만 고쳐 쓴다. 읽기 실패를 빈 값으로 보지 않는다.
      const access = await getMySelectedHousehold(env, userId, householdId);
      if (!access.selected || String(access.selected.id) !== householdId || !canWriteMyHousehold(access.selected.role)) throw new Error("card_target_write_not_allowed");
      const current = parseCardTargetsStrict(await getSettingValueStrict(env, cardTargetsKey(householdId)));
      const assets = await fetchPaymentAssets(env, householdId, { strict: true });
      if (!assets.some((a) => String(a.id) === assetId && paymentAssetKindMeta(a.kind).group === "card")) throw new Error("card_target_asset_missing");
      if (clear) delete current[assetId]; else current[assetId] = { target, updated_at: new Date().toISOString() };
      assertFresh();
      await saveSettingValue(env, cardTargetsKey(householdId), current);
    });
  } catch (err) {
    const reason = safeError(err);
    if (/card_target_write_not_allowed/.test(reason)) return redirectResponse(`${returnTo}&err=card_target_write_not_allowed#cards`);
    if (/settings_rmw_busy/.test(reason)) return redirectResponse(`${returnTo}&err=card_target_busy#cards`);
    if (/card_target_asset_missing/.test(reason)) return redirectResponse(`${returnTo}&err=card_target_asset_missing#cards`);
    rememberOpsEvent({ kind: "card_target_save_failed", severity: "warn", path: "/my/card-target/save", method: "POST", detail: reason });
    return redirectResponse(`${returnTo}&err=card_target_save_failed#cards`);
  }
  return redirectResponse(`${returnTo}&msg=${clear ? "card_target_cleared" : "card_target_saved"}#cards`);
}

function renderReportTopRows(report = {}) {
  const rows = safeArray(report.top_categories);
  if (!rows.length) return `<tr><td colspan="3">분류할 지출 기록이 없습니다.</td></tr>`;
  return rows.map((item) => `<tr><td><b>${escapeHtml(item.name || "미분류")}</b></td><td>${numberWithCommas(item.amount)}원</td><td>${numberWithCommas(item.count)}건</td></tr>`).join("");
}

function livingReportCss() {
  return `*{box-sizing:border-box}body{margin:0;background:var(--ab12-bg,#f2f4f6);color:var(--ab12-text,#191f28);font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;font-feature-settings:"tnum"}.wrap{max-width:1080px;margin:0 auto;padding:18px}.hero,.card{background:var(--ab12-surface,#fff);border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-radius,20px);padding:20px;margin:12px 0;box-shadow:var(--ab12-elev-card,0 10px 28px rgba(15,23,42,.055))}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero h1{margin:0 0 6px;font-size:24px;letter-spacing:-.02em}.hero p{color:#dbeafe;line-height:1.6;margin:6px 0}.card h2{margin:0 0 4px;font-size:var(--ab12-fs-title,16px);letter-spacing:-.01em}.card .lead{margin:0 0 12px;color:var(--ab12-muted,#5f6b7a);font-size:13px;line-height:1.55}.lrSeg{display:inline-flex;gap:4px;padding:4px;border-radius:var(--ab12-r-lg,16px);background:var(--ab12-surface-raised,#eef1f5);margin:12px 0 0}.lrSeg a{min-height:40px;display:inline-flex;align-items:center;justify-content:center;padding:0 16px;border-radius:var(--ab12-r-md,12px);text-decoration:none;font-weight:850;color:var(--ab12-muted,#5f6b7a)}.lrSeg a[aria-current="true"]{background:var(--ab12-surface,#fff);color:var(--ab12-text,#191f28);box-shadow:var(--ab12-elev-card,0 2px 8px rgba(15,23,42,.08))}.lrWeeks{display:flex;gap:8px;overflow-x:auto;padding:4px 0 6px;margin:0;list-style:none;scrollbar-width:none}.lrWeeks a{display:inline-flex;align-items:center;gap:6px;min-height:44px;padding:0 14px;border-radius:999px;border:1px solid var(--ab12-line,#e5e9f0);background:var(--ab12-surface,#fff);color:var(--ab12-text,#191f28);text-decoration:none;font-weight:800;font-size:13px;white-space:nowrap}body.abV22812Shell .lrWeeks a[aria-current="true"],.lrWeeks a[aria-current="true"]{background:var(--ab12-action,#1d4ed8);border-color:var(--ab12-action,#1d4ed8);color:#fff!important}.lrWeeks a.isFuture{color:var(--ab12-placeholder,#9aa5b5)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-lg,16px);padding:14px;background:var(--ab12-surface,#fff)}.metric span{display:block;color:var(--ab12-muted,#5f6b7a);font-size:var(--ab12-fs-cap,12px);font-weight:800}.metric b{display:block;font-size:22px;margin-top:6px;letter-spacing:-.02em}.metric small{display:block;margin-top:4px;color:var(--ab12-muted,#5f6b7a);font-size:12px;font-weight:650}.lrChange{margin:10px 0 0;padding:12px 14px;border-radius:var(--ab12-r-md,12px);background:var(--ab12-accent-soft,#eaf1ff);color:var(--ab12-text,#191f28);font-weight:750;line-height:1.5}.lrBasis{display:block;margin-top:4px;color:var(--ab12-muted,#5f6b7a);font-size:12px;font-weight:650}.lrBadges{display:flex;flex-wrap:wrap;gap:8px;margin:12px 0 0;padding:0;list-style:none}.lrBadges li{display:inline-flex;align-items:center;gap:6px;min-height:36px;padding:0 12px;border-radius:999px;background:var(--ab12-surface-raised,#eef1f5);font-weight:800;font-size:13px}.tableWrap{overflow:auto;border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-lg,16px)}table{width:100%;border-collapse:collapse}.abV2281 .tableWrap.tableFit:before,.tableWrap.tableFit:before{content:none;display:none}th,td{padding:10px;border-bottom:1px solid var(--ab12-line,#e5e9f0);text-align:left;font-size:14px}th{color:var(--ab12-muted,#5f6b7a);font-size:12px}.lrBars{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(0,1fr);align-items:end;gap:3px;height:132px;padding:8px 0 0;margin:8px 0 0}.lrBars i{display:block;min-height:3px;max-height:calc(100% - 18px);border-radius:4px 4px 0 0;background:var(--ab12-brand,#3182f6)}.lrBars i.isTop{background:var(--ab12-action,#1d4ed8)}.lrBars i.isFuture{background:var(--ab12-surface-raised,#eef1f5)}.lrBars b{display:block;font-size:10px;color:var(--ab12-muted,#5f6b7a);text-align:center;font-weight:650;margin-top:4px}.lrBars>span{display:flex;flex-direction:column;justify-content:flex-end;height:100%;min-width:0}.lrList{list-style:none;margin:8px 0 0;padding:0;display:grid;gap:8px}.lrList li{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center;padding:10px 12px;border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-md,12px)}.lrList li b{font-size:14px}.lrList li small{display:block;color:var(--ab12-muted,#5f6b7a);font-size:12px;margin-top:2px}.lrList li .amt{font-weight:850;white-space:nowrap}.lrTag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:800;background:var(--ab12-surface-raised,#eef1f5);color:var(--ab12-muted,#5f6b7a);margin-left:6px}.lrTag.isOk{background:var(--ab12-accent-soft,#eaf1ff);color:var(--ab12-accent,#1d4ed8)}.lrTag.isWarn{background:var(--ab12-warn-bg,#fff4e5);color:var(--ab12-warn-text,#8a4b00)}.lrTwo{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:12px}.lrBox{border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-lg,16px);padding:14px}.lrBox h3{margin:0 0 8px;font-size:14px}.lrBox p{margin:4px 0;font-size:13px;line-height:1.5}.lrDelta{font-weight:800}.lrDelta.isUp{color:var(--ab12-warn-text,#8a4b00)}.lrDelta.isDown{color:var(--ab12-accent,#1d4ed8)}.lrCard{border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-lg,16px);padding:14px;display:grid;gap:8px}.lrCard h3{margin:0;font-size:15px;display:flex;align-items:center;justify-content:space-between;gap:8px}.lrTrack{height:10px;border-radius:999px;background:var(--ab12-surface-raised,#eef1f5);overflow:hidden}.lrTrack i{display:block;height:100%;background:var(--ab12-brand,#3182f6);border-radius:inherit}.lrTrack i.isOver{background:var(--ab12-action,#1d4ed8)}.lrCard form{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;align-items:center}.lrCard input{min-height:44px;border:1px solid var(--ab12-line,#d9e0ea);border-radius:var(--ab12-r-md,12px);padding:0 12px;font:inherit;background:var(--ab12-input-bg,#fff);color:var(--ab12-text,#191f28);min-width:0;width:100%}.settings{display:grid;gap:10px}.settings label{border:1px solid var(--ab12-line,#e5e9f0);border-radius:var(--ab12-r-lg,16px);padding:12px;min-height:44px;display:flex;align-items:center;gap:8px}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:var(--ab12-r-md,12px);background:var(--ab12-action,#1d4ed8);color:#fff!important;text-decoration:none;font-weight:900;padding:0 14px;margin:3px;cursor:pointer;font:inherit;font-weight:900}.light{background:var(--ab12-accent-soft,#eaf1ff)!important;color:var(--ab12-accent,#1d4ed8)!important}.share{width:100%;min-height:220px;border:1px solid var(--ab12-line,#cbd5e1);border-radius:var(--ab12-r-lg,16px);padding:13px;font:inherit;line-height:1.6;background:var(--ab12-input-bg,#fff);color:var(--ab12-text,#191f28)}.ok,.error,.note{border-radius:var(--ab12-r-lg,16px);padding:12px;line-height:1.6;font-size:13px}.ok{background:var(--ab12-accent-soft,#ecfdf5);color:var(--ab12-accent,#065f46);border:1px solid var(--ab12-line,#a7f3d0)}.error{background:var(--ab12-warn-bg,#fef2f2);color:var(--ab12-warn-text,#991b1b);border:1px solid var(--ab12-warn-line,#fecaca)}.note{background:var(--ab12-accent-soft,#eff6ff);color:var(--ab12-text,#1e3a8a)!important;border:1px solid var(--ab12-line,#bfdbfe)}.empty{padding:14px;border:1px dashed var(--ab12-line,#d9e0ea);border-radius:var(--ab12-r-lg,16px);color:var(--ab12-muted,#5f6b7a);font-size:13px;line-height:1.55}.empty a{color:var(--ab12-accent,#1d4ed8);font-weight:800}@media(max-width:760px){.wrap{padding:12px}.hero,.card{padding:16px}.btn,button{width:100%;margin:4px 0}.lrCard form{grid-template-columns:1fr}.lrBars{height:104px}}@media print{.abLayoutNav,.abNavMobileTop,.abNavMobileDrawer,.abNavBottom,.noPrint,.reportMonthNav{display:none!important}body{padding:0!important;background:#fff}.wrap{max-width:none}.hero{background:#fff!important;color:#111827!important}.hero p{color:#475569!important}}`;
}

function renderLivingReportSections({ report, selected, month, range, week, canWrite, msg = "", err = "" }) {
  const p = report.period;
  const hid = selected.id;
  const hrefMonth = livingReportHref({ month, householdId: hid, range: "month" });
  const hrefWeek = livingReportHref({ month, householdId: hid, range: "week", week: range === "week" ? p.start : "" });
  const weeks = livingReportWeeks(month, formatDate(nowKstDate()));
  const won = (n) => `${numberWithCommas(Math.round(Number(n) || 0))}원`;
  const deltaText = (delta, prev) => !report.comparisonAvailable ? "비교 확인 불가" : !(prev > 0) && delta === 0 ? "비교 기록 없음" : delta === 0 ? "같음" : `${delta > 0 ? "+" : "−"}${numberWithCommas(Math.abs(delta))}원`;
  const deltaClass = (delta) => delta > 0 ? "lrDelta isUp" : delta < 0 ? "lrDelta isDown" : "lrDelta";
  const topDaysText = report.topDays.length ? report.topDays.map((d) => `${ymdWithWeekday(d.date)} ${won(d.amount)}`).join(" · ") : "아직 지출한 날이 없어요";
  const maxDay = Math.max(1, ...report.days.map((d) => d.amount));
  const topSet = new Set(report.topDays.map((d) => d.date));
  const bars = report.days.map((d) => `<span><i class="${topSet.has(d.date) ? "isTop" : d.future ? "isFuture" : ""}" style="height:${Math.max(3, Math.round(d.amount / maxDay * 100))}%" title="${escapeHtml(ymdWithWeekday(d.date))} ${escapeHtml(won(d.amount))}"></i><b>${p.range === "week" ? escapeHtml(LIVING_REPORT_WEEKDAYS[weekdayIndexOfYmd(d.date)] || "") : Number(d.date.slice(8, 10)) % 5 === 1 || d.date.slice(8, 10) === "01" ? Number(d.date.slice(8, 10)) : ""}</b></span>`).join("");
  const segment = `<div class="lrSeg noPrint" role="group" aria-label="리포트 기간 단위"><a href="${escapeHtml(hrefMonth)}"${range === "month" ? ' aria-current="true"' : ""}>월간</a><a href="${escapeHtml(hrefWeek)}"${range === "week" ? ' aria-current="true"' : ""}>주간</a></div>`;
  const weekChips = range === "week" ? `<ul class="lrWeeks noPrint" aria-label="주 선택">${weeks.map((w) => `<li><a href="${escapeHtml(livingReportHref({ month, householdId: hid, range: "week", week: w.start }))}"${w.start === p.start ? ' aria-current="true"' : ""} class="${w.future ? "isFuture" : ""}">${escapeHtml(shortYmdKo(w.start))}~${escapeHtml(shortYmdKo(w.end))}${w.current ? " · 이번 주" : ""}</a></li>`).join("")}</ul>` : "";
  const flash = { card_target_saved: ["ok", "카드 실적 목표를 저장했어요."], card_target_cleared: ["ok", "카드 실적 목표를 지웠어요."], preference_saved: ["ok", "자동 리포트 설정을 저장했습니다."] }[msg];
  const flashErr = { card_target_invalid: "실적 목표는 1,000원 이상의 금액으로 적어 주세요. 비우면 목표를 지웁니다.", card_target_write_not_allowed: "조회 전용 참여자는 실적 목표를 바꿀 수 없어요.", card_target_busy: "다른 설정 변경을 처리 중이에요. 잠시 뒤 다시 시도해 주세요.", card_target_asset_missing: "그 카드를 찾지 못했어요. 자산·결제수단에서 카드가 남아 있는지 확인해 주세요.", card_target_save_failed: "실적 목표를 저장하지 못했어요. 연결 상태를 확인한 뒤 다시 시도해 주세요." }[err] || (err ? "설정을 저장하지 못했습니다. 가계부 관리 권한과 연결 상태를 확인해 주세요." : "");
  const summary = !report.currentAvailable ? `<section class="card" id="summary"><h2>기간 요약</h2><p>선택한 주의 일부 날짜를 불러오지 못해 합계·기록 수·무지출 일수를 확인할 수 없어요.</p></section>` : `<section class="card" id="summary"><h2>기간 요약</h2><p class="lead">${escapeHtml(p.title)}${p.live ? " · 오늘까지" : ""} · ${escapeHtml(selected.name || "가계부")}</p><div class="grid abV5KpiGrid"><div class="metric"><span>지출</span><b>${won(report.expense)}</b><small>${p.elapsed ? `${p.elapsed}일 동안` : "기록 없음"}</small></div><div class="metric"><span>수입</span><b>${won(report.income)}</b><small>${p.live ? "오늘까지" : p.elapsed ? "기간 전체" : "아직 오지 않은 기간"}</small></div><div class="metric"><span>하루 평균</span><b>${won(report.dailyAvg)}</b><small>지출한 날 ${numberWithCommas(report.spendDays)}일</small></div><div class="metric"><span>기록</span><b>${numberWithCommas(report.count)}건</b><small>무지출 ${numberWithCommas(report.noSpendDays)}일</small></div></div><p class="lrChange">${escapeHtml(livingReportChangeText(report))}<span class="lrBasis">기준: ${escapeHtml(p.basisLabel)} · ${escapeHtml(p.basisNote)} 비교 기준은 한 가지만 씁니다.</span></p>${report.badges.length ? `<ul class="lrBadges" aria-label="달성 배지">${report.badges.map((b) => `<li><span aria-hidden="true">${escapeHtml(b.emoji)}</span>${escapeHtml(b.text)}</li>`).join("")}</ul>` : ""}</section>`;
  const fixed = `<section class="card" id="fixed"><h2>고정비와 구독</h2><p class="lead">정기 항목으로 등록한 지출과, 기록에서 반복이 보이는 지출입니다. 등록하지 않은 반복 지출은 "후보"로만 보여 줍니다.</p><div class="lrTwo"><div class="lrBox"><h3>${range === "week" ? "월 정기 예정액" : "매달 나가는 정기 항목"} ${report.recurringAvailable ? won(report.fixedTotal) : "확인 불가"}</h3>${!report.recurringAvailable ? `<p class="empty">정기 항목을 불러오지 못했습니다. 새로고침하면 다시 시도합니다.</p>` : report.ruleItems.length ? `<ul class="lrList">${report.ruleItems.map((r) => `<li><div><b>${escapeHtml(r.memo)}</b><small>매월 ${r.day}일${r.category ? ` · ${escapeHtml(r.category)}` : ""}</small></div><div class="amt">${won(r.amount)}<span class="lrTag ${r.applied ? "isOk" : ""}">${!report.historyAvailable ? "반영 확인 불가" : r.applied ? month === currentMonthKst() ? "이번 달 반영" : "선택한 달 반영" : "반영 전"}</span></div></li>`).join("")}</ul>` : `<p class="empty">등록한 정기 지출이 없어요. <a href="/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(hid)}#fixed">정기 수입·지출</a>에서 월세·통신비 같은 고정비를 등록하면 여기에 모입니다.</p>`}</div><div class="lrBox"><h3>구독·반복 지출</h3>${report.currentAvailable ? `<p>구독으로 보이는 지출 <b>${won(report.subscription.amount)}</b> (${numberWithCommas(report.subscription.count)}건)</p>` : `<p>기간 구독 지출 확인 불가</p>`}${!report.historyAvailable || !report.recurringAvailable ? `<p class="empty">조회하지 못한 기록이나 정기 항목이 있어 반복 지출 후보를 확인할 수 없어요.</p>` : report.candidates.length ? `<p>최근 석 달에 두 번 이상 보인 지출(후보)</p><ul class="lrList">${report.candidates.map((c) => `<li><div><b>${escapeHtml(c.memo || c.category || "반복 지출")}</b><small>${c.hitMonths}개월 반복 · 매월 ${c.dayOfMonth}일 무렵</small></div><div class="amt">${won(c.amount)}</div></li>`).join("")}</ul><p class="empty">후보는 기록상 패턴일 뿐이에요. 정기 지출이 맞으면 <a href="/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(hid)}#fixed">정기 항목으로 등록</a>하세요.</p>` : `<p class="empty">반복 지출 후보가 아직 없어요. 석 달 넘게 기록이 쌓이면 찾아 드립니다.</p>`}${report.upcoming.length ? `<p>30일 안에 나갈 적립 계획</p><ul class="lrList">${report.upcoming.map((u) => `<li><div><b>${escapeHtml(u.name)}</b><small>${escapeHtml(u.due_date)} · D-${numberWithCommas(u.days_left)}</small></div><div class="amt">${won(u.amount)}</div></li>`).join("")}</ul>` : ""}</div></div></section>`;
  const daily = !report.currentAvailable ? `<section class="card" id="daily"><h2>날짜별 지출</h2><p>선택한 주의 날짜별 기록을 모두 불러온 뒤 표시합니다.</p></section>` : `<section class="card" id="daily"><h2>날짜별 지출</h2><p class="lead">지출이 큰 날: ${escapeHtml(topDaysText)}</p><div class="lrBars" role="img" aria-label="${escapeHtml(p.title)} 날짜별 지출 막대. ${escapeHtml(topDaysText)}">${bars}</div></section>`;
  const weekendLine = report.weekend.weekdayDays && report.weekend.days ? `주말 하루 평균 ${won(report.weekend.avg)} · 평일 하루 평균 ${won(report.weekend.weekdayAvg)} (주말 비중 ${report.weekend.share}%)` : "주말과 평일을 견줄 기록이 아직 없어요.";
  const pattern = !report.currentAvailable ? `<section class="card" id="pattern"><h2>생활 패턴</h2><p>기간 기록을 확인할 수 없어요.</p></section>` : `<section class="card" id="pattern"><h2>생활 패턴</h2><p class="lead">${escapeHtml(weekendLine)}</p><div class="lrTwo">${report.buckets.map((b) => `<div class="lrBox"><h3>${escapeHtml(b.name)} ${won(b.amount)}</h3><p>${numberWithCommas(b.count)}건 · <span class="${deltaClass(b.delta)}">${escapeHtml(deltaText(b.delta, b.prevAmount))}</span> <small>(${escapeHtml(p.basisLabel)})</small></p></div>`).join("")}</div><p class="note">${!report.comparisonAvailable ? "기간 비교를 확인할 수 없어요." : report.biggestIncrease ? `${escapeHtml(report.biggestIncrease.name)} 지출이 ${escapeHtml(p.basisLabel.replace(/ 대비$/, ""))}보다 ${won(report.biggestIncrease.delta)} 늘었어요. 줄일 곳을 찾는다면 여기부터 보면 좋아요. 늘어난 금액이 곧 낭비라는 뜻은 아니에요.` : "지난 기간보다 늘어난 생활비 항목이 없어요."}</p></section>`;
  const cards = `<section class="card" id="cards"><h2>카드별 사용액과 실적 목표</h2><p class="lead">기록된 결제수단 기준 사용액이에요. 카드사가 인정하는 실적과 다를 수 있으니 "예상"으로 보세요. 실적 목표는 카드마다 직접 적습니다${range === "week" ? " (목표 진행률은 월간에서 봅니다)" : ""}.</p>${!report.currentAvailable ? `<p class="empty">기간 기록을 모두 불러오지 못해 카드 사용액을 확인할 수 없어요.</p>` : !report.settingsAvailable ? `<p class="empty">카드 설정을 불러오지 못해 사용액과 목표를 확인할 수 없어요.</p>` : report.cards.length ? `<div class="lrTwo">${report.cards.map((c) => `<div class="lrCard"><h3><span>${escapeHtml(c.name)}</span><span class="amt">${won(c.amount)}</span></h3><p class="lead" style="margin:0">${numberWithCommas(c.count)}건 · <span class="${deltaClass(c.amount - c.prevAmount)}">${escapeHtml(deltaText(c.amount - c.prevAmount, c.prevAmount))}</span> <small>(${escapeHtml(p.basisLabel)})</small></p>${c.target && range === "month" && report.historyAvailable && p.elapsed > 0 ? `<div class="lrTrack" role="progressbar" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${Math.min(100, c.rate)}" aria-label="${escapeHtml(c.name)} 실적 목표 진행률"><i class="${c.reached ? "isOver" : ""}" style="width:${Math.min(100, c.rate)}%"></i></div><p class="lead" style="margin:0">목표 ${won(c.target)} 중 ${c.rate}% · ${c.reached ? "예상 실적 목표 달성" : `${won(c.remaining)} 남음(예상)`}</p>` : c.target ? `<p class="lead" style="margin:0">월 실적 목표 ${won(c.target)}</p>` : `<p class="lead" style="margin:0">실적 목표가 없어요.</p>`}${canWrite ? `<form method="post" action="/my/card-target/save"><input type="hidden" name="household_id" value="${escapeHtml(hid)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="range" value="${escapeHtml(range)}"/><input type="hidden" name="week" value="${escapeHtml(range === "week" ? p.start : "")}"/><input type="hidden" name="asset_id" value="${escapeHtml(c.id)}"/><input type="text" inputmode="numeric" name="target" value="${c.target ? escapeHtml(String(c.target)) : ""}" placeholder="월 실적 목표(원)" aria-label="${escapeHtml(c.name)} 월 실적 목표"/><button type="submit">${c.target ? "목표 바꾸기" : "목표 저장"}</button></form>` : ""}</div>`).join("")}</div>` : `<p class="empty">등록한 카드가 없어요. <a href="/payment-methods?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(hid)}">자산·결제수단</a>에 카드를 등록하면 카드별 사용액과 실적 목표를 볼 수 있어요.</p>`}</section>`;
  return { segment, weekChips, flash, flashErr, summary, fixed, daily, pattern, cards };
}

function livingReportCopyMain() {
  const button = document.getElementById("copyReport"), text = document.getElementById("reportShare");
  if (!button || !text) return;
  button.addEventListener("click", async function() {
    try {
      if (!navigator.clipboard || !navigator.clipboard.writeText) throw new Error("clipboard_unavailable");
      await navigator.clipboard.writeText(text.value);
      button.textContent = "복사됨";
    } catch {
      text.focus(); text.select();
      let copied = false;
      try { copied = document.execCommand("copy") === true; } catch {}
      button.textContent = copied ? "복사됨" : "문구를 선택했어요. 직접 복사해 주세요.";
    }
  });
}

function renderFreeReportsHtml({ env, month, selected, report, range = "month", week = "", live = {}, preference = {}, weeklySnapshot = null, monthlySnapshot = null, historyLimited = false, settingsUnavailable = false, msg = "", err = "" }) {
  const qs = `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}`;
  const canManage = canManageMyHousehold(selected.role);
  const canWrite = canWriteMyHousehold(selected.role) && !settingsUnavailable;
  const share = livingReportShareText(report, selected.name || "가계부");
  const savedSummary = [weeklySnapshot ? `주간 ${escapeHtml(weeklySnapshot.period || "")}` : "주간 대기", monthlySnapshot ? `월간 ${escapeHtml(monthlySnapshot.period || "")}` : "월간 대기"].join(" · ");
  const parts = renderLivingReportSections({ report, selected, month, range, week, canWrite, msg, err });
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 무료 리포트</title><style>${livingReportCss()}${reportUxCss()}</style></head><body>${renderUnifiedNav("reports", { month, householdId: selected.id, householdName: selected.name })}<main class="wrap">${parts.flash ? `<div class="${parts.flash[0]}">${parts.flash[1]}</div>` : ""}${parts.flashErr ? `<div class="error">${escapeHtml(parts.flashErr)}</div>` : ""}<section class="hero"><h1>생활비 리포트</h1><p>${escapeHtml(selected.name || "가계부")} · 같은 기록을 주간과 월간으로 읽습니다. 고정비·구독, 날짜별 지출, 생활 패턴, 카드별 사용액을 한 화면에서 봅니다.</p>${parts.segment}<p class="noPrint"><a class="btn light" href="/my/analysis?${qs}">상세 분석</a><button type="button" onclick="window.print()">인쇄·PDF 저장</button></p></section>${renderReportMonthNavigator({ path: "/reports", month, householdId: selected.id, extra: range === "week" ? { range: "week" } : {} })}${parts.weekChips}${historyLimited ? `<div class="note">기간 전체 기록을 불러오지 못했습니다. 아래 합계는 불러온 선택 월 기록만 포함하며, 기간 비교·반복 후보·달성 배지는 표시하지 않습니다.</div>` : ""}${settingsUnavailable ? `<div class="note">카드·적립 계획 설정을 불러오지 못해 그 부분은 비워 두었어요. 새로고침하면 다시 시도합니다.</div>` : ""}${parts.summary}${parts.fixed}${parts.daily}<section class="card"><h2>지출 상위 분류</h2><p class="lead">${escapeHtml(report.period.title)}${report.period.live ? " 오늘까지" : ""} 기준</p><div class="tableWrap tableFit"><table><thead><tr><th>분류</th><th>금액</th><th>건수</th></tr></thead><tbody>${report.currentAvailable ? renderReportTopRows({ top_categories: report.topCategories }) : `<tr><td colspan="3">기간 기록 확인 불가</td></tr>`}</tbody></table></div></section>${parts.pattern}${parts.cards}<section class="card noPrint"><h2>자동 생성 설정</h2><p class="note">모든 기능은 무료입니다. 자동 생성은 가계부 전체 설정이므로 소유자·관리자만 바꿀 수 있습니다. 생성 상태: ${savedSummary}</p>${settingsUnavailable ? `<p>설정을 확인할 수 없어 변경할 수 없습니다. 새로고침한 뒤 다시 확인해 주세요.</p>` : canManage ? `<form class="settings" method="post" action="/my/report-preference/save"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><label><input type="checkbox" name="enabled" value="1"${preference.enabled ? " checked" : ""}/> 자동 리포트 생성 사용</label><label><input type="checkbox" name="weekly" value="1"${preference.weekly ? " checked" : ""}/> 매주 일요일 주간 리포트</label><label><input type="checkbox" name="monthly" value="1"${preference.monthly ? " checked" : ""}/> 매월 말 월간 리포트</label><button type="submit">설정 저장</button></form>` : `<p>현재 권한에서는 리포트 조회·복사·PDF 저장을 사용할 수 있고, 자동 생성 설정은 소유자·관리자가 변경합니다.</p>`}</section><section class="card noPrint"><h2>카카오톡에 공유할 문구</h2><textarea id="reportShare" class="share" readonly>${escapeHtml(share)}</textarea><p><button type="button" id="copyReport">문구 복사</button><a class="btn light" href="/my/analysis?${qs}">상세 분석</a></p><p class="note">서비스가 사용자 대신 임의로 메시지를 보내지 않습니다. 문구를 복사해 원하는 대화방에 직접 공유하면 오발송을 막을 수 있습니다.</p></section></main><script>(${livingReportCopyMain.toString()})();</script></body></html>`;
}

function renderMiniCategoryRows(stats = {}) {
  const rows = safeArray(stats.categories).filter((c) => Number(c.expense || 0) > 0).slice(0, 12);
  return rows.length ? rows.map((c) => `<tr><td>${escapeHtml(c.category || "미분류")}</td><td>${numberWithCommas(c.expense || 0)}원</td><td>${numberWithCommas(c.count || 0)}건</td></tr>`).join("") : `<tr><td colspan="3">아직 지출 데이터가 없습니다.</td></tr>`;
}

async function handleMyPremiumPage(request, env, url) {
  const ctx = await getMyPageContext(request, env, url);
  if (ctx.redirect) return ctx.redirect;
  const householdId = ctx.selected?.id || "";
  const month = ctx.month;
  const historyStart = `${addMonthsYm(month, -2)}-01`;
  const historyEnd = nextMonthStart(month);
  const [prevRows, historyRows, registeredRecurring] = await Promise.all([
    householdId ? fetchAdminRows(env, { month: addMonthsYm(month, -1), householdId, type: "all" }) : [],
    householdId ? fetchAdminRowsRange(env, { householdId, start: historyStart, end: historyEnd }) : [],
    householdId ? fetchRecurring(env, householdId) : [],
  ]);
  const extended = calculateExtendedAnalytics({ month, allRows: ctx.rows, prevRows, historyRows, yearRows: historyRows, rowsBase: ctx.rows });
  const recurringCandidates = detectRecurringCandidates(historyRows, month, registeredRecurring);
  const anomalies = findAnomalousExpenses(ctx.rows, historyRows, month);
  const weeklyReport = buildWeeklyReport(historyRows, month);
  const premium = buildPremiumState({ env, month, allRows: ctx.rows, analysis: ctx.analysis, extended });
  return htmlResponse(renderMyPremiumHtml({ env, ...ctx, premium, recurringCandidates, anomalies, weeklyReport, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

function renderRecurringCandidateCards(candidates = [], selected = {}, month = currentMonthKst()) {
  if (!candidates.length) return `<p class="muted">최근 3개월에서 같은 이름·금액으로 반복된 새 후보가 없습니다. 메모를 같은 이름으로 기록하면 더 정확하게 찾아드립니다.</p>`;
  const canManage = canManageMyHousehold(selected?.role || "");
  return `<div class="candidateGrid">${candidates.map((c) => {
    const day = Math.min(28, Math.max(1, Number(c.dayOfMonth || 1)));
    const hidden = `<input type="hidden" name="household_id" value="${escapeHtml(selected?.id || "")}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="memo" value="${escapeHtml(c.memo || "정기지출")}"/><input type="hidden" name="amount" value="${escapeHtml(c.amount || 0)}"/><input type="hidden" name="category" value="${escapeHtml(c.category || "정기지출")}"/><input type="hidden" name="payment_method" value="${escapeHtml(c.paymentMethod || "")}"/><input type="hidden" name="day_of_month" value="${escapeHtml(day)}"/>`;
    return `<article class="candidate"><div><b>${escapeHtml(c.memo || "이름 없음")}</b><span>${escapeHtml(c.category || "미분류")} · ${c.hitMonths}개월 반복 · 매월 ${day}일 제안</span></div><strong>${numberWithCommas(c.amount)}원</strong>${canManage ? `<form method="post" action="/my/recurring/from-candidate">${hidden}<label><input type="checkbox" name="confirmed" value="yes" required/> 매월 자동 기록에 동의</label><button type="submit">확정하고 자동 등록</button></form>` : `<small>소유자·관리자가 확정할 수 있습니다.</small>`}</article>`;
  }).join("")}</div>`;
}

function renderMyPremiumHtml({ env, month, selected, rows = [], budget = {}, analysis = {}, premium = {}, recurringCandidates = [], anomalies = [], weeklyReport = null, msg = "", err = "" }) {
  const role = selected?.role || "";
  const qs = `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected?.id || "")}`;
  const recurringTotal = safeArray(recurringCandidates).reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const anomalyTotal = safeArray(anomalies).reduce((sum, x) => sum + Number(x.amount || 0), 0);
  const budgetRemain = Math.max(0, Number(budget.totalBudget || 0) - Number(budget.budgetedExpense ?? budget.expense ?? 0));
  const weeklyText = weeklyReport ? `${numberWithCommas(weeklyReport.thisWeek || 0)}원` : "집계 대기";
  const title = escapeHtml(appName(env));
  const message = msg === "recurring_registered" ? `<div class="ok">반복지출 후보를 확정했습니다. 지정일이 되면 같은 달 중복 없이 자동 기록됩니다.</div>` : msg === "recurring_exists" ? `<div class="ok">이미 같은 이름·금액의 반복지출이 등록되어 있습니다.</div>` : "";
  const error = err ? `<div class="error">처리하지 못했습니다. 입력값과 가계부 관리 권한을 확인해 주세요.</div>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${title} · 무료 스마트 도구</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;box-shadow:0 10px 28px rgba(15,23,42,.055);margin:12px 0}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero h1{margin:10px 0 6px;font-size:30px}.hero p{line-height:1.65;color:#ccfbf1}.badge{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:7px 11px;font-size:12px;font-weight:1000}.grid,.features,.candidateGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:25px;margin-top:7px}.feature,.candidate{border:1px solid #e5e7eb;border-radius:18px;padding:15px;background:#f8fafc}.feature b,.candidate b{display:block;font-size:16px;color:#166534}.feature span,.candidate span,.candidate small{display:block;color:#64748b;line-height:1.55;margin-top:5px}.candidate{display:grid;gap:9px}.candidate strong{font-size:20px}.candidate form{display:grid;gap:8px}.candidate label{font-size:12px;color:#475569}.candidate button{border:0;border-radius:13px;min-height:42px;background:#111827;color:#fff;font-weight:1000}.muted{color:#64748b;line-height:1.6}.insightList{list-style:none;margin:0;padding:0;display:grid;gap:9px}.insightList li{display:grid;grid-template-columns:minmax(120px,1fr) minmax(180px,2fr) auto;gap:10px;align-items:center;padding:12px;border:1px solid #e5e7eb;border-radius:16px;background:#f8fafc}.insightList span{color:#64748b;font-size:13px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#ecfdf5;color:#065f46!important}.ok,.error{border-radius:16px;padding:13px;line-height:1.6;margin:12px 0}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.notice{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:16px;padding:13px;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.metricGrid{grid-template-columns:1fr 1fr}.metricGrid .metric{padding:14px}.metricGrid .metric b{font-size:20px}.insightList li{grid-template-columns:1fr}.btn{width:100%;margin:4px 0}}</style></head><body>${renderUnifiedNav("smart-tools", { month, householdId: selected?.id || "", householdName: selected?.name || "" })}<main class="wrap">${message}${error}<section class="hero"><span class="badge">초기 서비스 · 모두 무료</span><h1>스마트 생활 도구</h1><p>${escapeHtml(selected?.name || "가계부")}의 예측·자동화·정산·리포트를 한 곳에서 사용합니다. 현재 공개된 기능은 결제나 구독 등급 없이 모두 무료입니다.</p><p><a class="btn" href="/reports?${qs}">자동 리포트</a><a class="btn light" href="/settlement-summary?${qs}">고급 정산</a></p></section><section class="grid metricGrid"><div class="card metric"><span>월말 예상 지출</span><b>${numberWithCommas(analysis.burnForecast || 0)}원</b></div><div class="card metric"><span>예산 잔여</span><b>${numberWithCommas(budgetRemain)}원</b></div><div class="card metric"><span>반복지출 후보</span><b>${recurringCandidates.length}건</b><small>월 약 ${numberWithCommas(recurringTotal)}원</small></div><div class="card metric"><span>이상지출 후보</span><b>${anomalies.length}건</b><small>${numberWithCommas(anomalyTotal)}원</small></div><div class="card metric"><span>이번 주 지출</span><b>${weeklyText}</b></div><div class="card metric"><span>절약 후보</span><b>${numberWithCommas(premium.savingPotential || 0)}원</b></div></section><section class="card"><h2>무료로 사용할 수 있는 기능</h2><div class="features"><div class="feature"><b>반복 거래 자동화</b><span>후보를 가계부 소유자·관리자가 명시적으로 확정하면 지정일에 월 1회만 자동 반영합니다.</span></div><div class="feature"><b>고급 정산</b><span>동일·비율·인원수·품목별 분배와 최소 송금 제안을 제공합니다.</span></div><div class="feature"><b>주간·월간 리포트</b><span>자동 생성 설정, 복사·공유, 인쇄/PDF 저장을 제공합니다.</span></div><div class="feature"><b>스마트 예산·미션</b><span>현재 지출에서 추천 예산과 현실적인 절약 후보를 계산합니다.</span></div><div class="feature"><b>가족별 비교 분석</b><span>참여자와 분류별 기록을 기존 분석 화면에서 비교합니다.</span></div></div><p><a class="btn light" href="/my/analysis?${qs}">상세 분석</a><a class="btn light" href="/payment-methods?${qs}">자산·결제수단</a></p></section><section class="card"><h2>반복지출 후보 확정</h2><p class="muted">자동 등록 전 반드시 동의해야 하며, 같은 이름·금액은 중복 등록하지 않습니다. 금액이 바뀌면 새 후보로 다시 확인합니다.</p>${renderRecurringCandidateCards(recurringCandidates, selected, month)}</section><section class="card"><h2>큰 지출 점검</h2>${renderAnomalyList(anomalies)}</section><p class="notice"><b>무료 제공 원칙</b><br/>초기 서비스에서는 별도 유료 등급, 결제, 사용량 제한을 두지 않습니다. 가계부 역할 권한(owner/admin/member/viewer)과 데이터 격리는 그대로 유지합니다. 준비가 끝나지 않은 기능은 메뉴와 직접 경로에서 숨깁니다.</p></main></body></html>`;
}
// @build:exports-start
export {
  cardTargetsKey, freeReportPreferenceKey, handleAutomaticReportCron, handleCardTargetSave,
  handleFreeReportsPage, handleMyPremiumPage, handleReportPreferenceSave,
  parseJsonArraySettingStrict, parseJsonSetting, renderMiniCategoryRows, runAutomaticReports,
  saveSettingValue,
};
// @build:exports-end
