// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, isUniqueConstraintError, operationLeaseOwner, parseStrictSettingsObject,
  releaseOperationLease, safeError,
} from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { verifyCronExecutionAuth } from "../auth/crypto-admin-session.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { fetchRawHouseholdMembers } from "../data/users-household-create.js";
import { saveSettingValue } from "../my/reports-premium.js";
import { fetchRecurringStrict } from "../domain/budgets.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { createManualTransaction } from "../domain/transactions-core.js";
// @build:imports-end

function recurringDateForMonth(month = currentMonthKst(), day = 1) {
  const ym = validMonth(month) || currentMonthKst();
  const y = Number(ym.slice(0, 4));
  const m = Number(ym.slice(5, 7));
  const last = new Date(y, m, 0).getDate();
  const d = Math.min(last, Math.max(1, Number(day || 1)));
  return `${ym}-${String(d).padStart(2, "0")}`;
}

async function findRecurringAutoDuplicate(env, row = {}) {
  if (!row.household_id || !row.transaction_date || !row.amount) return null;
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,raw_text,created_at");
  params.set("household_id", `eq.${row.household_id}`);
  params.set("transaction_date", `eq.${row.transaction_date}`);
  params.set("type", `eq.${row.type === "income" ? "income" : "expense"}`);
  params.set("amount", `eq.${Math.round(Number(row.amount || 0))}`);
  params.set("source", "eq.recurring_auto");
  params.set("raw_text", `eq.${row.raw_text}`);
  params.set("limit", "1");
  let rows = [];
  try {
    rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  } catch (err) {
    rememberOpsEvent({ kind: "duplicate_check_error", severity: "warn", path: "/rest/v1/transactions", method: "GET", detail: safeError(err) });
    // 무인 자동화에서는 확인 실패를 "중복 없음"으로 간주하지 않습니다.
    throw err;
  }
  const norm = (v) => normalizeText(v || "");
  return rows.find(r => String(r.raw_text) === String(row.raw_text)) || null;
}

// V22.9.37 감사 T7·SIM-5: 고정항목 지출자의 자격은 저장·화면·자동·수동 반영이 모두 이 한 함수로 판정한다.
// 소유자·관리자·구성원만 지출자가 될 수 있다. 조회 전용·승인 대기·차단·나간 사람의 규칙은 어디서도 반영하지 않는다.
// 예전에는 자동 반영만 이 규칙을 쓰고 저장·수동 반영은 pending·blocked 만 걸러 조회 전용 지출자의 규칙이 수동으로만 들어갔다.
const RECURRING_SPENDER_ROLES = ["owner", "admin", "member"];

function recurringSpenderEligible(members = [], userId = "") {
  const id = String(userId || "").trim();
  if (!id) return false;
  return safeArray(members).some((m) => String(m?.user_id || "") === id && RECURRING_SPENDER_ROLES.includes(String(m?.role || "").toLowerCase()));
}

function eligibleRecurringSpenders(members = []) {
  return safeArray(members).filter((m) => recurringSpenderEligible([m], m?.user_id));
}

// 규칙 하나를 한 달에 넣는다. 자동 반영의 중복 확인·날짜 규칙(없는 날짜만 말일)·표식 갱신을 그대로 쓰므로
// 수동 반영이 문제 규칙을 건너뛰고 나머지를 넣을 때(T7)도 자동 반영과 같은 기록이 만들어진다.
// SIM-8: 더 나중 달을 이미 반영한 규칙의 표식(last_applied_month)은 지난 달 반영이 되돌리지 않는다.
async function applyRecurringRuleForMonth(env, householdId, r, month) {
  const monthLastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
  const dueDay = Math.min(monthLastDay, Math.max(1, Number(r.day_of_month || 1)));
  const row = {
    household_id: householdId,
    user_id: r.user_id || "",
    type: r.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(r.amount || 0))),
    category: r.category || (r.type === "income" ? "정기수입" : "정기지출"),
    memo: r.memo || r.category || "정기지출",
    payment_method: r.payment_method || "",
    transaction_date: recurringDateForMonth(month, dueDay),
    source: "recurring_auto",
    raw_text: `recurring:${r.id || ""}:${month}`,
  };
  // V22.9.26: 금액 0 항목은 고칠 때까지 건너뛴다. 실패로 세면 매일 scheduled_partial 경고가 반복된다.
  if (!row.amount) return "skipped";
  let outcome = "deduplicated";
  const dup = await findRecurringAutoDuplicate(env, row);
  if (!dup) {
    try {
      const created = await createManualTransaction(env, row);
      outcome = created?.__duplicate_skipped ? "deduplicated" : "applied";
    } catch (err) {
      if (!isUniqueConstraintError(err)) throw err;
    }
  }
  // 거래 저장 또는 기존 동일 거래 확인이 끝난 뒤에만 적용월을 갱신한다. 더 나중 달의 표식은 그대로 둔다.
  if (!(String(r.last_applied_month || "") > month)) {
    await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(r.id)}&household_id=eq.${encodeURIComponent(householdId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_applied_month: month }) });
  }
  return outcome;
}

async function runRecurringAutoApplyUnlocked(env, opts = {}) {
  const today = opts.today || formatDate(nowKstDate());
  const requestedMonth = validMonth(opts.month) || String(today).slice(0, 7) || currentMonthKst();
  let month = requestedMonth;
  const cursorKey = opts.month ? `cron_recurring_cursor_v22930:${month}` : "cron_recurring_cursor_v22930";
  const cursor = parseStrictSettingsObject(await getSettingValueStrict(env, cursorKey), "recurring_cursor");
  if (!opts.month && (cursor.pending || cursor.after) && validMonth(cursor.month) && cursor.month < requestedMonth) month = cursor.month;
  const currentDay = month < String(today).slice(0,7) ? 31 : Number(String(today).slice(8, 10) || "1");
  await saveSettingValue(env,cursorKey,JSON.stringify({after:String(cursor.after || ""),month,pending:true}));
  const params = new URLSearchParams({select:"id,name,created_at",order:"id.asc",limit:"6"});
  if (cursor.after) params.set("id", `gt.${cursor.after}`);
  const households = await supabase(env, `/rest/v1/households?${params}`, {method:"GET"});
  if (!Array.isArray(households)) throw new Error("cron_household_source_invalid");
  let after = String(cursor.after || ""), partial = households.length === 6;
  let scanned = 0, applied = 0, deduplicated = 0, skipped = 0, failed = 0;
  for (const household of households.slice(0,5)) {
    if ((env.__AB_DB_BUDGET?.used || 0) >= 30) { partial = true; break; }
    const householdId = household.id;
    if (!householdId) continue;
    let items = [];
    try {
      items = await fetchRecurringStrict(env, householdId);
    } catch (err) {
      failed++;
      rememberOpsEvent({ kind: "recurring_household_scan_failed", severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail: `${householdId}:${safeError(err)}` });
      partial = true; break;
    }
    const members = items.some(r => String(r.last_applied_month || "") !== month) ? await fetchRawHouseholdMembers(env, householdId) : [];
    let householdComplete = true;
    for (const r of safeArray(items)) {
      if (r.is_active === false || String(r.is_active) === "false") { skipped++; continue; }
      scanned++;
      if (String(r.last_applied_month || "") === month) { skipped++; continue; }
      if ((env.__AB_DB_BUDGET?.used || 0) >= 30) { householdComplete = false; partial = true; break; }
      if (!recurringSpenderEligible(members, r.user_id)) { skipped++; continue; }
      // V22.9.26: 29·30·31일 항목은 짧은 달에는 말일에 적용한다. 예전에는 2월에 31일을
      // 기다리다 3월이 되면서 last_applied_month 가 넘어가 그 달 치가 영영 만들어지지 않았다.
      const monthLastDay = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
      const dueDay = Math.min(monthLastDay, Math.max(1, Number(r.day_of_month || 1)));
      if (currentDay < dueDay) { skipped++; continue; }
      try {
        // V22.9.37 감사 T7: 수동 반영과 같은 한 건 반영(중복 확인·날짜 규칙·표식 갱신)을 쓴다.
        const outcome = await applyRecurringRuleForMonth(env, householdId, r, month);
        if (outcome === "applied") applied++;
        else if (outcome === "deduplicated") deduplicated++;
        else skipped++;
      } catch (err) {
        failed++;
        householdComplete = false;
        rememberOpsEvent({ kind: "recurring_auto_apply_failed", severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail: `${householdId}:${String(r.id || "")}:${safeError(err)}` });
      }
    }
    if (!householdComplete) { partial = true; break; }
    after = String(householdId);
  }
  if (!partial) after = "";
  await saveSettingValue(env, cursorKey, JSON.stringify({after,month,pending:partial}));
  return { ok: failed === 0 && !partial, partial, cursor:after, month, today, households: households.length, scanned, applied, deduplicated, skipped, failed };
}

async function runRecurringAutoApply(env, opts = {}) {
  if (!env.__AB_DB_BUDGET) env = {...env,__AB_DB_BUDGET:{used:0,limit:50}};
  const month = validMonth(opts.month) || String(opts.today || formatDate(nowKstDate())).slice(0, 7) || currentMonthKst();
  if (opts.lock === false) return runRecurringAutoApplyUnlocked(env, opts);
  const lease = await claimOperationLease(env, {
    key: "cron:recurring:v22930",
    owner: operationLeaseOwner("recurring"),
    leaseSeconds: Number(env.CRON_RECURRING_LEASE_SECONDS || 900),
  });
  if (!lease.acquired) {
    rememberOpsEvent({ kind: "scheduled_duplicate_skipped", severity: "info", path: "/cron/recurring/apply", method: "SCHEDULED", detail: `${month}:${lease.mode}` });
    return { ok: true, month, today: opts.today || formatDate(nowKstDate()), households: 0, scanned: 0, applied: 0, deduplicated: 0, skipped: 0, failed: 0, skipped_run: true, reason: "already_running", lock_mode: lease.mode };
  }
  try {
    return { ...(await runRecurringAutoApplyUnlocked(env, opts)), skipped_run: false, lock_mode: lease.mode };
  } finally {
    await releaseOperationLease(env, lease);
  }
}

async function handleRecurringCronApply(request, env, url) {
  if (!verifyCronExecutionAuth(request, env)) return jsonResponse({ ok: false, error: "unauthorized", reason: "unauthorized", message: "예약 실행 인증이 필요합니다." }, 401);
  const result = await runRecurringAutoApply(env, { month: validMonth(url.searchParams.get("month")) || "", today: url.searchParams.get("today") || formatDate(nowKstDate()) });
  return jsonResponse(result, result.ok ? 200 : 207);
}
// @build:exports-start
export {
  applyRecurringRuleForMonth, eligibleRecurringSpenders, handleRecurringCronApply,
  recurringSpenderEligible, runRecurringAutoApply,
};
// @build:exports-end
