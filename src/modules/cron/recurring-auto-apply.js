// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import {
  claimOperationLease, isUniqueConstraintError, operationLeaseOwner, parseStrictSettingsObject,
  releaseOperationLease, safeError,
} from "../runtime/leases.js";
import { jsonResponse } from "../runtime/http.js";
import { verifyCronExecutionAuth } from "../auth/crypto-admin-session.js";
import { isValidTransactionDateString } from "../admin/transactions-households.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { fetchRawHouseholdMembers } from "../data/users-household-create.js";
import { rebuildMonthlyReportSnapshots, saveSettingValue } from "../my/reports-premium.js";
import { addMonthsYm } from "../domain/analytics.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { createManualTransaction, sanitizeTransactionBody } from "../domain/transactions-core.js";
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
    try {
      await supabase(env, `/rest/v1/accountbook_recurring?id=eq.${encodeURIComponent(r.id)}&household_id=eq.${encodeURIComponent(householdId)}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_applied_month: month }) });
    } catch (err) {
      // 적용월 저장 실패가 이미 확인한 거래 저장을 되돌리지 않는다. 호출부가 부분 반영을 알릴 수 있게 보존한다.
      throw Object.assign(new Error(safeError(err), { cause: err }), { recurringTransactionOutcome: outcome });
    }
  }
  return outcome;
}

// V22.9.76 감사 P0-1(D-1): 자동 반영은 가계부를 다섯 개씩 도는 커서를 버리고 "지정일이 지났는데 그 달 반영 표식이 없는
// 규칙"을 저장소에서 바로 고른다. 예전에는 하루 한 번 실행이 가계부 5개만 보고 다음 날로 넘어가, 가계부가 30개를 넘으면
// 지정일 뒤에 다시 들르기 전에 달이 바뀌어 그 달 몫이 영영 기록되지 않았다(가계부 32개·28일 규칙: 11월분 10건, 12월분 15건 유실).
// 한 번 실행의 저장소 호출(Free 요금제 한 실행 50회 중 이 단계 몫 RECURRING_CRON_DB_CAP=30회, 리포트·NLU 정리가 나머지를 쓴다):
//   고정 4~6회: 실행 잠금·해제 2 + 상태 읽기 1 + 이번 달 목록 1 (+ 지난달 따라잡기 목록 1, 상태 저장 1은 필요할 때만)
//   묶음마다 최대 4회(규칙 최대 40개): 참여자 확인 + 이미 들어간 기록 확인 + 한 번에 저장 + 반영 표식
// 그래서 한 번에 규칙 약 240개를 넣는다. 다 못 넣으면 partial 로 끝나고 다음 실행이 이어 간다. 반영한 규칙은 표식이 바뀌어
// 목록에서 빠지므로 커서가 필요 없다. 같은 규칙·같은 달은 기록 확인과 (household_id, raw_text) 고유 색인으로 한 번만 들어간다
// (겹친 실행이나 같은 때의 수동 반영과 부딪쳐도 한 건).
// 새 달 첫 실행은 지난달에 실행이 끝까지 처리하지 못한 날짜(checked_date 뒤)의 규칙만 지난달 몫으로 따라잡는다(D-10):
// 지난달이 끝난 뒤 만든 규칙, 지난달 지정일에 꺼 두었던 규칙은 지난달로 넣지 않는다.
// V22.9.77 감사 M-8: 지난 달에 기록을 넣은(따라잡기·?month= 실행) 가계부는 그 달 월간 리포트 스냅숏이 이미 있으면 같은
// 실행 끝에서 다시 만든다. 한 실행에 RECURRING_REPORT_REBUILDS 개(월말 생성과 같은 가계부 2개)까지, 이 단계 몫(30회) 안에서만
// 만들고, 못 만든 가계부·달은 상태 키의 report_rebuild 에 남겨 다음 실행이 잇는다. 넣은 기록이 없는 실행은 예전과 같다.
const RECURRING_CRON_DB_CAP = 30;
const RECURRING_CRON_PAGE = 500;
const RECURRING_CRON_CHUNK = 40;
const RECURRING_CRON_STATE_KEY = "cron_recurring_state_v22976";
const RECURRING_CRON_SELECT = "id,household_id,type,amount,category,memo,payment_method,day_of_month,user_id,is_active,last_applied_month,created_at";
const RECURRING_REPORT_REBUILDS = 2;
const RECURRING_REPORT_QUEUE_MAX = 300;

function recurringCronLastDay(month = "") {
  return new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate();
}

function recurringCronDueDay(rule = {}, month = "") {
  const raw = Math.round(Number(rule.day_of_month));
  return Math.min(recurringCronLastDay(month), Number.isFinite(raw) && raw >= 1 ? raw : 1);
}

function recurringCronDueDate(rule = {}, month = "") {
  return recurringDateForMonth(month, recurringCronDueDay(rule, month));
}

function recurringCronAddDays(ymd = "", days = 0) {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function recurringCronCreatedMs(rule = {}) {
  const ms = Date.parse(String(rule.created_at || ""));
  return Number.isFinite(ms) ? ms : null;
}

// month 에 이미 있던 규칙인가(D-10: 규칙이 생기기 전 달은 만들지 않는다). 만든 시각이 있으면 그것으로 본다.
// 만든 시각이 없으면 그보다 앞 달에 반영된 적이 있을 때만 있던 규칙이다. 한 번도 반영되지 않았고 만든 시각도 없는
// 옛 규칙은 그 달 실행이 지정일이 지난 규칙을 남기고 끝났을 때(pendingMonth)만 그 달 규칙으로 본다.
function recurringCronExistedIn(rule = {}, month = "", pendingMonth = "") {
  const created = recurringCronCreatedMs(rule);
  if (created != null) return created < Date.parse(`${addMonthsYm(month, 1)}-01T00:00:00+09:00`);
  const marker = String(rule.last_applied_month || "");
  if (marker) return marker < month;
  return pendingMonth === month;
}

function recurringCronState(raw) {
  let state = {};
  try { state = parseStrictSettingsObject(raw, "recurring_state"); }
  catch (err) {
    // 상태가 깨졌다고 모든 정기 반영을 멈추지 않는다. 처음 실행처럼 지난달은 끝난 것으로 보고 다시 쓴다.
    rememberOpsEvent({ kind: "recurring_state_invalid", severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail: safeError(err) });
  }
  return {
    checked_date: isValidTransactionDateString(String(state.checked_date || "")) ? String(state.checked_date) : "",
    pending_month: validMonth(state.pending_month) || "",
    report_rebuild: recurringReportQueue(state.report_rebuild),
  };
}

// V22.9.77 감사 M-8: 월간 스냅숏을 다시 만들 가계부·달 목록("YYYY-MM|가계부ID"). 형식이 틀린 항목·겹친 항목은 버린다.
function recurringReportQueue(values = []) {
  const out = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? "");
    if (text[7] === "|" && validMonth(text.slice(0, 7)) && /^[^|\s"(),]{1,80}$/.test(text.slice(8))) out.add(text);
  }
  return [...out];
}

function recurringReportEntries(queue = []) {
  return queue.map((item) => ({ month: item.slice(0, 7), household_id: item.slice(8) }));
}

function recurringStateBody(checkedDate = "", pendingMonth = "", queue = []) {
  // 다시 만들 스냅숏이 없으면 예전과 같은 두 값만 쓴다.
  return JSON.stringify({ checked_date: checkedDate, pending_month: pendingMonth, ...(queue.length ? { report_rebuild: queue.slice(0, RECURRING_REPORT_QUEUE_MAX) } : {}) });
}

function recurringCronBudgetStop(err) {
  return String(err?.code || "") === "supabase_subrequest_budget_before_dispatch" || /supabase_subrequest_budget_before_dispatch/.test(safeError(err));
}

function recurringCronInList(values = []) {
  return `(${values.map((value) => `"${String(value).split("\"").join("")}"`).join(",")})`;
}

async function fetchRecurringCronRows(env, phase) {
  const params = new URLSearchParams();
  params.set("select", RECURRING_CRON_SELECT);
  params.set("is_active", "not.is.false");
  params.set("amount", "gt.0");
  params.set("or", phase.kind === "catchup" ? `(last_applied_month.is.null,last_applied_month.lt.${phase.month})` : `(last_applied_month.is.null,last_applied_month.neq.${phase.month})`);
  params.set("day_of_month", `lte.${phase.queryDay}`);
  params.set("order", "day_of_month.asc,household_id.asc,id.asc");
  params.set("limit", String(RECURRING_CRON_PAGE));
  const rows = await supabase(env, `/rest/v1/accountbook_recurring?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("recurring_queue_source_invalid");
  return rows;
}

async function fetchRecurringCronMembers(env, householdIds = []) {
  const params = new URLSearchParams();
  params.set("select", "household_id,user_id,role");
  params.set("household_id", `in.${recurringCronInList(householdIds)}`);
  const rows = await supabase(env, `/rest/v1/household_members?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("household_member_source_invalid");
  return rows;
}

async function fetchRecurringCronExisting(env, householdIds = [], rawTexts = []) {
  const params = new URLSearchParams();
  params.set("select", "household_id,raw_text");
  params.set("source", "eq.recurring_auto");
  params.set("household_id", `in.${recurringCronInList(householdIds)}`);
  params.set("raw_text", `in.${recurringCronInList(rawTexts)}`);
  params.set("limit", String(rawTexts.length + 10));
  const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
  if (!Array.isArray(rows)) throw new Error("recurring_duplicate_source_invalid");
  return new Set(rows.map((row) => `${row.household_id}|${row.raw_text}`));
}

// applyRecurringRuleForMonth 와 같은 기록(날짜 규칙·기본 분류·raw_text 식별자)을 만든다.
function recurringCronTransaction(rule = {}, month = "") {
  return {
    household_id: String(rule.household_id || ""),
    user_id: rule.user_id || "",
    type: rule.type === "income" ? "income" : "expense",
    amount: Math.max(0, Math.round(Number(rule.amount || 0))),
    category: rule.category || (rule.type === "income" ? "정기수입" : "정기지출"),
    memo: rule.memo || rule.category || "정기지출",
    payment_method: rule.payment_method || "",
    transaction_date: recurringCronDueDate(rule, month),
    source: "recurring_auto",
    raw_text: `recurring:${rule.id || ""}:${month}`,
  };
}

async function runRecurringAutoApplyUnlocked(env, opts = {}) {
  const today = isValidTransactionDateString(String(opts.today || "")) ? String(opts.today) : formatDate(nowKstDate());
  const currentMonth = today.slice(0, 7);
  const currentDay = Number(today.slice(8, 10));
  const explicitMonth = validMonth(opts.month) || "";
  const previousMonth = addMonthsYm(currentMonth, -1);
  const previousMonthEnd = recurringDateForMonth(previousMonth, 31);
  const used = () => Number(env.__AB_DB_BUDGET?.used || 0);
  const room = (calls) => used() + calls <= RECURRING_CRON_DB_CAP;
  const stats = { scanned: 0, applied: 0, deduplicated: 0, skipped: 0, failed: 0 };
  const touched = new Set();
  const members = new Map();
  const caughtUp = new Set();
  const reportTouched = [];
  const phases = [];
  let stored = null;
  let checkedDate = "";
  let partial = false;
  if (explicitMonth) {
    // 운영자가 ?month= 로 달을 지정하면 그 달만 본다. 지난 달은 모든 날짜, 이번 달은 오늘까지가 지정일이다. 앞으로 올 달은 넣지 않는다.
    if (explicitMonth <= currentMonth) phases.push({ kind: "explicit", month: explicitMonth, dueDay: explicitMonth < currentMonth ? 31 : currentDay });
  } else {
    stored = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY));
    // 상태가 없으면(이 판의 첫 실행) 지난달은 끝난 것으로 본다. 예전 실행이 남긴 지난달 일을 뒤늦게 몰아 넣지 않는다.
    checkedDate = stored.checked_date || previousMonthEnd;
    if (checkedDate < previousMonthEnd) phases.push({ kind: "catchup", month: previousMonth, dueDay: 31, after: checkedDate });
    phases.push({ kind: "current", month: currentMonth, dueDay: currentDay });
  }
  // 말일에는 29~31일 규칙도 그날 몫이다(짧은 달은 말일로 당겨 넣는다). 목록은 31일까지 받고 판정은 당긴 날짜로 한다.
  const lastDay = recurringCronLastDay(currentMonth);
  for (const phase of phases) {
    phase.queryDay = phase.month < currentMonth || phase.dueDay >= lastDay ? 31 : phase.dueDay;
    phase.rows = await fetchRecurringCronRows(env, phase);
  }
  const pendingMonth = stored?.pending_month || "";
  const catchupPhase = phases.find((phase) => phase.kind === "catchup") || null;
  const usable = (rule) => !(rule.is_active === false || String(rule.is_active) === "false") && Number(rule.amount || 0) > 0;
  const catchUpDue = (rule) => {
    if (!catchupPhase || !usable(rule)) return false;
    const marker = String(rule.last_applied_month || "");
    if (marker && marker >= previousMonth) return false;
    if (recurringCronDueDate(rule, previousMonth) <= catchupPhase.after) return false;
    return recurringCronExistedIn(rule, previousMonth, pendingMonth);
  };
  const isCandidate = (rule, phase) => {
    if (!usable(rule)) return false;
    if (phase.kind === "catchup") return catchUpDue(rule);
    if (recurringCronDueDay(rule, phase.month) > phase.dueDay) return false;
    if (String(rule.last_applied_month || "") === phase.month) return false;
    if (phase.month < currentMonth && !recurringCronExistedIn(rule, phase.month)) return false;
    // 지난달 몫이 빠진 규칙은 지난달을 먼저 넣는다. 이번 달을 먼저 넣으면 표식이 이번 달이 되어 지난달을 다시 찾지 못한다.
    if (phase.kind === "current" && !caughtUp.has(String(rule.id)) && catchUpDue(rule)) return false;
    return true;
  };
  const markerOf = (rule) => caughtUp.has(String(rule.id)) ? previousMonth : String(rule.last_applied_month || "");
  const report = (detail, kind = "recurring_auto_apply_failed") => rememberOpsEvent({ kind, severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail });
  const processPhase = async (phase) => {
    const candidates = phase.rows.filter((rule) => isCandidate(rule, phase));
    const done = new Set();
    phase.candidates = candidates.length;
    phase.confirmed = 0;
    stats.scanned += candidates.length;
    for (let index = 0; index < candidates.length; index += RECURRING_CRON_CHUNK) {
      const chunk = candidates.slice(index, index + RECURRING_CRON_CHUNK);
      const missing = [...new Set(chunk.map((rule) => String(rule.household_id || "")))].filter((id) => id && !members.has(id));
      if (!room((missing.length ? 1 : 0) + 3)) { partial = true; break; }
      if (missing.length) {
        let rows;
        try { rows = await fetchRecurringCronMembers(env, missing); }
        catch (err) { stats.failed++; partial = true; report(`${phase.month}:members:${safeError(err)}`, "recurring_household_scan_failed"); break; }
        for (const id of missing) members.set(id, []);
        for (const row of rows) members.get(String(row.household_id || ""))?.push(row);
      }
      const items = [];
      for (const rule of chunk) {
        // 소유자·관리자·구성원 지출자의 규칙만 넣는다(V22.9.37 T7·SIM-5). 건너뛴 규칙의 표식은 그대로 둔다.
        if (!recurringSpenderEligible(members.get(String(rule.household_id || "")) || [], rule.user_id)) { stats.skipped++; done.add(String(rule.id)); continue; }
        items.push({ rule, row: recurringCronTransaction(rule, phase.month) });
      }
      if (!items.length) continue;
      let existing;
      try { existing = await fetchRecurringCronExisting(env, [...new Set(items.map((item) => item.row.household_id))], items.map((item) => item.row.raw_text)); }
      catch (err) {
        // 무인 자동화에서는 확인 실패를 "중복 없음"으로 간주하지 않는다.
        stats.failed++; partial = true; report(`${phase.month}:${safeError(err)}`, "duplicate_check_error"); break;
      }
      const confirmed = [];
      const groups = new Map();
      for (const item of items) {
        if (existing.has(`${item.row.household_id}|${item.row.raw_text}`)) { stats.deduplicated++; confirmed.push(item.rule); continue; }
        let clean;
        try { clean = sanitizeTransactionBody(item.row); }
        catch (err) { stats.failed++; done.add(String(item.rule.id)); report(`${item.row.household_id}:${String(item.rule.id || "")}:${safeError(err)}`); continue; }
        // PostgREST 묶음 저장은 행마다 열 구성이 같아야 한다. 같은 구성끼리 한 번에 보낸다(보통 한 묶음).
        const signature = Object.keys(clean).sort().join(",");
        if (!groups.has(signature)) groups.set(signature, []);
        groups.get(signature).push({ ...item, clean });
      }
      let halted = false;
      for (const group of groups.values()) {
        if (!room(2)) { halted = true; break; }
        try {
          const created = await supabase(env, "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(group.map((item) => item.clean)) });
          const saved = new Set(safeArray(created).map((row) => `${row.household_id}|${row.raw_text}`));
          for (const item of group) {
            if (saved.has(`${item.row.household_id}|${item.row.raw_text}`)) { stats.applied++; confirmed.push(item.rule); continue; }
            // 저장 응답에 없으면 결과를 모르는 것으로 본다. 다음 실행의 기록 확인이 가린다.
            stats.failed++; report(`${item.row.household_id}:${String(item.rule.id || "")}:insert_unconfirmed`);
          }
        } catch (err) {
          if (recurringCronBudgetStop(err) || isUncertainStorageWrite(err)) {
            // 보내지 못했거나 결과를 모르는 저장은 표식을 바꾸지 않는다. 다음 실행의 기록 확인이 저장 여부를 가린다.
            if (!recurringCronBudgetStop(err)) { stats.failed += group.length; report(`${phase.month}:batch:${safeError(err)}`); }
            halted = true; break;
          }
          // 확실히 거절된 묶음(같은 때 수동 반영과 겹친 고유 색인 충돌, 한 건의 잘못된 값)은 한 건씩 다시 넣는다.
          // 묶음 저장은 한 문장이라 한 건만 걸려도 전부 되돌려지므로, 나머지 규칙이 그 한 건에 막히지 않게 한다.
          for (const item of group) {
            if (!room(2)) { halted = true; break; }
            try {
              await createManualTransaction(env, item.row);
              stats.applied++; confirmed.push(item.rule);
            } catch (rowError) {
              if (recurringCronBudgetStop(rowError)) { halted = true; break; }
              if (isUncertainStorageWrite(rowError)) { stats.failed++; report(`${item.row.household_id}:${String(item.rule.id || "")}:${safeError(rowError)}`); halted = true; break; }
              if (isUniqueConstraintError(rowError)) { stats.deduplicated++; confirmed.push(item.rule); continue; }
              stats.failed++; done.add(String(item.rule.id));
              report(`${item.row.household_id}:${String(item.rule.id || "")}:${safeError(rowError)}`);
            }
          }
        }
        if (halted) break;
      }
      // 거래 저장이나 기존 거래 확인이 끝난 규칙만 표식을 바꾼다. 더 나중 달 표식은 되돌리지 않는다(SIM-8).
      const advance = confirmed.filter((rule) => { const marker = markerOf(rule); return !marker || marker < phase.month; });
      // V22.9.77 감사 M-8: 지난 달 몫을 이 실행에서 넣었거나(표식이 그 달에 못 미친 기존 기록 포함) 확인한 가계부는 그 달 월간
      // 스냅숏이 이미 있으면 다시 만든다. 표식이 이미 그 달 이후인 규칙(?month= 재실행의 기존 기록)은 앞선 실행이 맡았다.
      if (phase.month < currentMonth) for (const rule of advance) reportTouched.push(`${phase.month}|${String(rule.household_id || "")}`);
      for (const rule of confirmed) {
        done.add(String(rule.id));
        touched.add(String(rule.household_id || ""));
        phase.confirmed += 1;
        if (phase.kind === "catchup") caughtUp.add(String(rule.id));
      }
      if (advance.length) {
        const params = new URLSearchParams();
        params.set("id", `in.${recurringCronInList(advance.map((rule) => rule.id))}`);
        params.set("household_id", `in.${recurringCronInList([...new Set(advance.map((rule) => rule.household_id))])}`);
        params.set("or", `(last_applied_month.is.null,last_applied_month.lt.${phase.month})`);
        try {
          await supabase(env, `/rest/v1/accountbook_recurring?${params}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_applied_month: phase.month }) });
        } catch (err) {
          // 표식 저장 실패는 이미 들어간 거래를 되돌리지 않는다. 다음 실행이 같은 거래를 확인하고 표식을 다시 쓴다.
          stats.failed++; partial = true; report(`${phase.month}:marker:${safeError(err)}`);
        }
      }
      if (halted) { partial = true; break; }
    }
    phase.remaining = candidates.filter((rule) => !done.has(String(rule.id)));
  };
  for (const phase of phases) await processPhase(phase);
  const remainingOf = (phase) => safeArray(phase?.remaining);
  const remaining = phases.reduce((sum, phase) => sum + remainingOf(phase).length, 0);
  partial = partial || remaining > 0;
  // V22.9.77 감사 M-8: 이번 실행과 앞선 실행이 남긴 가계부·달의 월간 스냅숏을 다시 만든다. 상태 저장 몫(예약 실행 1회,
  // ?month= 실행은 읽기·저장 2회)은 남겨 둔다. 한도에 걸려 못 만든 항목은 상태 키에 남아 다음 실행이 잇는다.
  let reportQueue = recurringReportQueue([...(stored ? stored.report_rebuild : []), ...reportTouched]);
  let reportRebuilt = 0;
  if (reportQueue.length) {
    const reserve = stored ? 1 : 2;
    const outcome = await rebuildMonthlyReportSnapshots(env, recurringReportEntries(reportQueue), { limit: RECURRING_REPORT_REBUILDS, canSpend: (calls) => room(calls + reserve) });
    stats.failed += outcome.failed;
    reportRebuilt = outcome.rebuilt;
    reportQueue = recurringReportQueue(outcome.remaining.map((entry) => `${entry.month}|${entry.household_id}`));
    if (reportQueue.length > RECURRING_REPORT_QUEUE_MAX) report(`report_rebuild_overflow:${reportQueue.length - RECURRING_REPORT_QUEUE_MAX}`, "recurring_report_rebuild_overflow");
  }
  let nextChecked = checkedDate;
  if (stored) {
    // checked_date = 그 날짜까지 지정일인 규칙을 모두 처리했다는 표시. 끝까지 처리한 실행만 오늘로 옮기고, 남은 규칙이
    // 있으면 가장 이른 남은 지정일 전날로 둔다. 다음 달 첫 실행은 그 뒤 날짜의 지난달 규칙만 따라잡는다.
    let base = checkedDate;
    if (catchupPhase && !remainingOf(catchupPhase).length && base < previousMonthEnd) base = previousMonthEnd;
    if (!remaining) nextChecked = base > today ? base : today;
    else {
      const earliest = phases.flatMap((phase) => remainingOf(phase).map((rule) => recurringCronDueDate(rule, phase.month))).sort()[0];
      const before = recurringCronAddDays(earliest, -1);
      nextChecked = base < before ? base : before;
    }
    const currentPhase = phases.find((phase) => phase.kind === "current");
    const nextPending = remainingOf(currentPhase).length ? currentMonth : remainingOf(catchupPhase).length ? previousMonth : "";
    const queueChanged = reportQueue.join(",") !== stored.report_rebuild.join(",");
    if (nextChecked !== stored.checked_date || nextPending !== stored.pending_month || queueChanged) {
      try { await saveSettingValue(env, RECURRING_CRON_STATE_KEY, recurringStateBody(nextChecked, nextPending, reportQueue)); }
      catch (err) { stats.failed++; report(safeError(err), "recurring_state_save_failed"); }
    }
  } else if (reportQueue.length) {
    // ?month= 실행은 상태를 읽지 않았다. 못 만든 스냅숏 목록만 보태고 checked_date·pending_month 는 읽은 값 그대로 쓴다.
    try {
      const current = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY));
      await saveSettingValue(env, RECURRING_CRON_STATE_KEY, recurringStateBody(current.checked_date, current.pending_month, recurringReportQueue([...current.report_rebuild, ...reportQueue])));
    } catch (err) { stats.failed++; report(safeError(err), "recurring_state_save_failed"); }
  }
  const month = catchupPhase && (catchupPhase.confirmed || remainingOf(catchupPhase).length) ? previousMonth : (explicitMonth || currentMonth);
  return {
    ok: stats.failed === 0 && !partial, partial, month, today,
    months: phases.map((phase) => ({ month: phase.month, kind: phase.kind, candidates: phase.candidates || 0, remaining: remainingOf(phase).length })),
    households: touched.size, ...stats, remaining, checked_date: stored ? nextChecked : "",
    ...(reportRebuilt || reportQueue.length ? { report_rebuilt: reportRebuilt, report_rebuild_pending: reportQueue.length } : {}),
  };
}

// V22.9.76 감사 D-10: 예약 실행이 지난달 말을 놓쳐 지난달 몫이 아직 없는 규칙을 새 달에 고치면, 고치기 전 값으로 지난달 몫을
// 먼저 넣는다. 고친 금액·날짜·분류·지출자는 다음 반영(이번 달)부터 쓴다. 예전에는 새 달의 따라잡기가 고친 뒤 값을 써서
// 11월 1일에 70만 원으로 올린 월세가 10월분도 70만 원으로 기록됐다. 지난달 몫이 따라잡기 대상이 아니면(그 달 지정일까지
// 실행이 끝까지 처리했거나, 지난달에 없던 규칙이거나, 꺼져 있거나 지출자 자격이 없으면) 아무것도 넣지 않는다.
async function settleRecurringBeforeEdit(env, householdId, existing = {}, next = {}) {
  if (!existing?.id || !householdId) return "none";
  const previousMonth = addMonthsYm(formatDate(nowKstDate()).slice(0, 7), -1);
  const marker = String(existing.last_applied_month || "");
  if (marker && marker >= previousMonth) return "none";
  if (existing.is_active === false || String(existing.is_active) === "false" || !(Number(existing.amount || 0) > 0)) return "none";
  const changed = ["type", "amount", "category", "memo", "payment_method", "day_of_month", "user_id"]
    .some((key) => Object.prototype.hasOwnProperty.call(next, key) && String(next[key] ?? "") !== String(existing[key] ?? ""));
  if (!changed) return "none";
  const state = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY));
  const checked = state.checked_date || recurringDateForMonth(previousMonth, 31);
  if (recurringCronDueDate(existing, previousMonth) <= checked) return "none";
  if (!recurringCronExistedIn(existing, previousMonth, state.pending_month)) return "none";
  if (!recurringSpenderEligible(await fetchRawHouseholdMembers(env, householdId), existing.user_id)) return "none";
  const outcome = await applyRecurringRuleForMonth(env, householdId, existing, previousMonth);
  // V22.9.77 감사 M-8: 이 지난달 몫은 따라잡기가 넣었을 기록인데 표식이 지난달로 바뀌어 다음 예약 실행은 이 가계부를 다시
  // 보지 않는다. 지난달 월간 스냅숏이 이미 있으면 여기서 다시 만든다(실패해도 고친 내용 저장은 막지 않는다).
  if (outcome === "applied" || outcome === "deduplicated") await rebuildMonthlyReportSnapshots(env, [{ household_id: householdId, month: previousMonth }], { limit: 1, path: "/recurring/edit", method: "POST" });
  return outcome;
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
  // V22.9.76(D-26): 잘못된 today·month 를 오늘·자동 범위로 바꿔 실행하지 않는다. 날짜를 지정한 운영 호출이 다른 날로 기록되지 않게 거절한다.
  const requestedToday = String(url.searchParams.get("today") || "").trim();
  const requestedMonth = String(url.searchParams.get("month") || "").trim();
  if ((requestedToday && !isValidTransactionDateString(requestedToday)) || (requestedMonth && !validMonth(requestedMonth))) {
    return jsonResponse({ ok: false, error: "invalid_cron_scope", reason: "invalid_cron_scope", message: "today 는 YYYY-MM-DD, month 는 YYYY-MM 형식이어야 합니다." }, 400);
  }
  const result = await runRecurringAutoApply(env, { month: requestedMonth, today: requestedToday || formatDate(nowKstDate()) });
  return jsonResponse(result, result.ok ? 200 : 207);
}
// @build:exports-start
export {
  applyRecurringRuleForMonth, eligibleRecurringSpenders, handleRecurringCronApply,
  recurringDateForMonth, recurringSpenderEligible, runRecurringAutoApply, settleRecurringBeforeEdit,
};
// @build:exports-end
