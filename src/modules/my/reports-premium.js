// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import {
  claimOperationLease, operationLeaseOwner, parseStrictSettingsObject, releaseOperationLease,
  safeError,
} from "../runtime/leases.js";
import { htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import { verifyCronExecutionAuth } from "../auth/crypto-admin-session.js";
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import { fetchAdminRows, fetchAdminRowsRange } from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { verifyUserSession } from "../auth/user-session.js";
import { getMyPageContext, renderReportMonthNavigator, reportUxCss } from "./report-challenge.js";
import { canManageMyHousehold, getMySelectedHousehold } from "./access-control.js";
import { fetchRecurring } from "../domain/budgets.js";
import {
  buildWeeklyReport, detectRecurringCandidates, findAnomalousExpenses, renderAnomalyList,
} from "../admin/pc-analysis-calendar.js";
import { addMonthsYm, calculateExtendedAnalytics } from "../domain/analytics.js";
import { buildPremiumState } from "../features/meme-engine-premium.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import {
  calculateStats, escapeHtml, nextMonthStart, numberWithCommas,
} from "../domain/transactions-core.js";
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

async function handleFreeReportsPage(request, env, url) {
  const ctx = await getMyPageContext(request, env, url);
  if (ctx.redirect) return ctx.redirect;
  const hid = ctx.selected.id;
  const currentWeek = isoWeekPeriod(nowKstDate());
  const [preferenceValue, weeklySnapshotValue, monthlySnapshotValue] = await Promise.all([
    getSettingValue(env, freeReportPreferenceKey(hid)),
    getSettingValue(env, freeReportSnapshotKey(hid, "weekly", currentWeek)),
    getSettingValue(env, freeReportSnapshotKey(hid, "monthly", ctx.month)),
  ]);
  const preference = { enabled: false, weekly: true, monthly: true, ...parseJsonSetting(preferenceValue, {}) };
  const live = buildFreeReportSnapshot(ctx.rows, { householdId: hid, householdName: ctx.selected.name || "가계부", kind: "monthly", period: ctx.month });
  const weeklySnapshot = parseJsonSetting(weeklySnapshotValue, null);
  const monthlySnapshot = parseJsonSetting(monthlySnapshotValue, null);
  return htmlResponse(renderFreeReportsHtml({ env, ...ctx, live, preference, weeklySnapshot, monthlySnapshot, msg: url.searchParams.get("msg") || "", err: url.searchParams.get("err") || "" }));
}

function renderReportTopRows(report = {}) {
  const rows = safeArray(report.top_categories);
  if (!rows.length) return `<tr><td colspan="3">분류할 지출 기록이 없습니다.</td></tr>`;
  return rows.map((item) => `<tr><td><b>${escapeHtml(item.name || "미분류")}</b></td><td>${numberWithCommas(item.amount)}원</td><td>${numberWithCommas(item.count)}건</td></tr>`).join("");
}

function renderFreeReportsHtml({ env, month, selected, live = {}, preference = {}, weeklySnapshot = null, monthlySnapshot = null, msg = "", err = "" }) {
  const qs = `month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}`;
  const canManage = canManageMyHousehold(selected.role);
  const share = freeReportShareText(live);
  const savedSummary = [weeklySnapshot ? `주간 ${escapeHtml(weeklySnapshot.period || "")}` : "주간 대기", monthlySnapshot ? `월간 ${escapeHtml(monthlySnapshot.period || "")}` : "월간 대기"].join(" · ");
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 무료 리포트</title><style>*{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1080px;margin:0 auto;padding:18px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:10px}.metric{border:1px solid #e5e7eb;border-radius:18px;padding:15px;background:#fff}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:6px}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:17px}table{width:100%;border-collapse:collapse}.abV2281 .tableWrap.tableFit:before,.tableWrap.tableFit:before{content:none;display:none}th,td{padding:10px;border-bottom:1px solid #e5e7eb;text-align:left}.settings{display:grid;gap:10px}.settings label{border:1px solid #e5e7eb;border-radius:15px;padding:12px}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px;cursor:pointer}.light{background:#eff6ff!important;color:#1e3a8a!important}.share{width:100%;min-height:220px;border:1px solid #cbd5e1;border-radius:15px;padding:13px;font:inherit;line-height:1.6}.ok,.error,.note{border-radius:15px;padding:12px;line-height:1.6}.ok{background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}.error{background:#fef2f2;color:#991b1b;border:1px solid #fecaca}.note{background:#eff6ff;color:#1e3a8a;border:1px solid #bfdbfe}@media(max-width:760px){.wrap{padding:12px}.btn,button{width:100%;margin:4px 0}}@media print{.abLayoutNav,.abNavMobileTop,.abNavMobileDrawer,.abNavBottom,.noPrint,.reportMonthNav{display:none!important}body{padding:0!important;background:#fff}.wrap{max-width:none}.hero{background:#fff!important;color:#111827!important}.hero p{color:#475569!important}}${reportUxCss()}</style></head><body>${renderUnifiedNav("reports", { month, householdId: selected.id, householdName: selected.name })}<main class="wrap">${msg === "preference_saved" ? `<div class="ok">자동 리포트 설정을 저장했습니다.</div>` : ""}${err ? `<div class="error">설정을 저장하지 못했습니다. 가계부 관리 권한과 연결 상태를 확인해 주세요.</div>` : ""}<section class="hero"><h1>주간·월간 무료 리포트</h1><p>${escapeHtml(selected.name || "가계부")} · 현재 기록을 즉시 요약하고, 설정 시 매주 일요일과 매월 말에 중복 없이 스냅샷을 생성합니다.</p><p class="noPrint"><a class="btn light" href="/smart-tools?${qs}">스마트 도구</a><button type="button" onclick="window.print()">인쇄·PDF 저장</button></p></section>${renderReportMonthNavigator({ path: "/reports", month, householdId: selected.id })}<section class="grid"><div class="metric"><span>수입</span><b>${numberWithCommas(live.income)}원</b></div><div class="metric"><span>지출</span><b>${numberWithCommas(live.expense)}원</b></div><div class="metric"><span>잔액</span><b>${numberWithCommas(live.balance)}원</b></div><div class="metric"><span>기록</span><b>${numberWithCommas(live.transaction_count)}건</b></div><div class="metric"><span>지출한 날</span><b>${numberWithCommas(live.spend_days)}일</b></div></section><section class="card"><h2>지출 상위 분류</h2><div class="tableWrap tableFit"><table><thead><tr><th>분류</th><th>금액</th><th>건수</th></tr></thead><tbody>${renderReportTopRows(live)}</tbody></table></div></section><section class="card noPrint"><h2>자동 생성 설정</h2><p class="note">모든 기능은 무료입니다. 자동 생성은 가계부 전체 설정이므로 소유자·관리자만 바꿀 수 있습니다. 생성 상태: ${savedSummary}</p>${canManage ? `<form class="settings" method="post" action="/my/report-preference/save"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><label><input type="checkbox" name="enabled" value="1"${preference.enabled ? " checked" : ""}/> 자동 리포트 생성 사용</label><label><input type="checkbox" name="weekly" value="1"${preference.weekly ? " checked" : ""}/> 매주 일요일 주간 리포트</label><label><input type="checkbox" name="monthly" value="1"${preference.monthly ? " checked" : ""}/> 매월 말 월간 리포트</label><button type="submit">설정 저장</button></form>` : `<p>현재 권한에서는 리포트 조회·복사·PDF 저장을 사용할 수 있고, 자동 생성 설정은 소유자·관리자가 변경합니다.</p>`}</section><section class="card noPrint"><h2>카카오톡에 공유할 문구</h2><textarea id="reportShare" class="share" readonly>${escapeHtml(share)}</textarea><p><button type="button" id="copyReport">문구 복사</button><a class="btn light" href="/my/analysis?${qs}">상세 분석</a></p><p class="note">서비스가 사용자 대신 임의로 메시지를 보내지 않습니다. 문구를 복사해 원하는 대화방에 직접 공유하면 오발송을 막을 수 있습니다.</p></section></main><script>(function(){var b=document.getElementById('copyReport'),t=document.getElementById('reportShare');if(!b||!t)return;b.addEventListener('click',function(){var done=function(){b.textContent='복사됨';};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(t.value).then(done);else{t.select();document.execCommand('copy');done();}});})();</script></body></html>`;
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
  freeReportPreferenceKey, handleAutomaticReportCron, handleFreeReportsPage, handleMyPremiumPage,
  handleReportPreferenceSave, parseJsonArraySettingStrict, parseJsonSetting, renderMiniCategoryRows,
  runAutomaticReports, saveSettingValue,
};
// @build:exports-end
