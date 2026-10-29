// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { APP_VERSION } from "../public/site-config.js";
import {
  claimOperationLease, isUniqueConstraintError, operationLeaseOwner, parseStrictSettingsArray,
  parseStrictSettingsObject, releaseOperationLease, safeError,
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
import {
  currentMonthKst, formatDate, nowKstDate, qaFixedNowMs, validMonth,
} from "../nlu/date-payment.js";
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

// V22.9.81 U-14: 수동 ‘기록하기’가 지출자 자격이 없는 규칙을 건너뛰고 나머지를 넣는 길. 예전에는 규칙마다 applyRecurringRuleForMonth(기록 확인·
// 저장·표식 3회)를 불러 남은 규칙이 16개쯤이면 요청 한도(50)에 닿아 recurring_apply_incomplete 로 끝났다(V22.9.80 T-14 와 같은 꼴). 예약 자동
// 반영(processChunks)처럼 40개씩 묶어 기록 확인 1회·저장 1회(열 구성마다)·표식 1회로 넣는다. 넣는 기록·금액 0 건너뛰기·표식 규칙(더 나중 달
// 표식은 그대로)은 applyRecurringRuleForMonth 와 같다. 확실히 거절된 묶음만 한 건씩 다시 넣고, 한 건이 거절되면(예전처럼) 거기서 멈춘다.
// 멈출 때도 앞에서 확인한 규칙의 표식은 쓰고, 확인한 규칙이 있으면 오류에 recurringTransactionOutcome 을 달아 호출부가 부분 반영을 알린다.
// 결과를 모르는 저장(응답 없음·응답에 빠진 행)은 표식을 바꾸지 않고 결과 불확실로 던진다. 확인한 규칙은 settled 에 넣고, 넣은 건수를 돌려준다.
async function applyRecurringRulesForMonthBatched(env, householdId, rules = [], month = "", settled = []) {
  let applied = 0;
  for (let index = 0; index < rules.length; index += RECURRING_CRON_CHUNK) {
    const items = rules.slice(index, index + RECURRING_CRON_CHUNK)
      .map((rule) => ({ rule, row: recurringCronTransaction({ ...rule, household_id: householdId }, month) }))
      .filter((item) => item.row.amount > 0);
    if (!items.length) continue;
    const existing = await fetchRecurringCronExisting(env, [householdId], items.map((item) => item.row.raw_text));
    const confirmed = [];
    const groups = new Map();
    let failure = null;
    for (const item of items) {
      if (existing.has(`${householdId}|${item.row.raw_text}`)) { confirmed.push(item.rule); continue; }
      let clean;
      try { clean = sanitizeTransactionBody(item.row); } catch (err) { failure = err; break; }
      const signature = Object.keys(clean).sort().join(",");
      if (!groups.has(signature)) groups.set(signature, []);
      groups.get(signature).push({ ...item, clean });
    }
    for (const group of groups.values()) {
      try {
        const created = await supabase(env, "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: JSON.stringify(group.map((item) => item.clean)) });
        const saved = new Set(safeArray(created).map((row) => `${row.household_id}|${row.raw_text}`));
        for (const item of group) {
          if (saved.has(`${householdId}|${item.row.raw_text}`)) { applied += 1; confirmed.push(item.rule); }
          else failure = failure || Object.assign(new Error("recurring_insert_unconfirmed"), { uncertain_write: true });
        }
      } catch (err) {
        if (isUncertainStorageWrite(err) || recurringCronBudgetStop(err)) { failure = err; break; }
        // 묶음 저장은 한 문장이라 한 건만 걸려도 전부 되돌려진다. 한 건씩 다시 넣는다(같은 때 다른 반영과 겹친 고유 색인 충돌은 이미 있는 기록이다).
        for (const item of group) {
          try {
            await createManualTransaction(env, item.row);
            applied += 1; confirmed.push(item.rule);
          } catch (rowError) {
            if (isUniqueConstraintError(rowError)) { confirmed.push(item.rule); continue; }
            failure = rowError; break;
          }
        }
      }
      if (failure) break;
    }
    // 거래 저장이나 기존 거래 확인이 끝난 규칙만 표식을 바꾼다. 더 나중 달 표식은 되돌리지 않는다(SIM-8, 저장소 조건으로도 막는다).
    const advance = confirmed.filter((rule) => { const marker = String(rule.last_applied_month || ""); return !marker || marker < month; });
    settled.push(...confirmed);
    if (advance.length) {
      const params = new URLSearchParams();
      params.set("id", `in.${recurringCronInList(advance.map((rule) => rule.id))}`);
      params.set("household_id", `eq.${householdId}`);
      params.set("or", `(last_applied_month.is.null,last_applied_month.lt.${month})`);
      try {
        await supabase(env, `/rest/v1/accountbook_recurring?${params}`, { method: "PATCH", headers: { Prefer: "return=minimal" }, body: JSON.stringify({ last_applied_month: month }) });
      } catch (err) {
        // 표식 저장 실패는 이미 확인한 거래 저장을 되돌리지 않는다. 호출부가 부분 반영을 알릴 수 있게 보존한다.
        throw Object.assign(new Error(safeError(err), { cause: err }), { recurringTransactionOutcome: "applied" });
      }
    }
    if (failure) throw settled.length && !failure.recurringTransactionOutcome ? Object.assign(failure, { recurringTransactionOutcome: "applied" }) : failure;
  }
  return applied;
}

// V22.9.76 감사 P0-1(D-1): 자동 반영은 가계부를 다섯 개씩 도는 커서를 버리고 "지정일이 지났는데 그 달 반영 표식이 없는
// 규칙"을 저장소에서 바로 고른다. 예전에는 하루 한 번 실행이 가계부 5개만 보고 다음 날로 넘어가, 가계부가 30개를 넘으면
// 지정일 뒤에 다시 들르기 전에 달이 바뀌어 그 달 몫이 영영 기록되지 않았다(가계부 32개·28일 규칙: 11월분 10건, 12월분 15건 유실).
// 한 번 실행의 저장소 호출(Free 요금제 한 실행 50회 중 이 단계 몫 RECURRING_CRON_DB_CAP=30회, 리포트·NLU 정리가 나머지를 쓴다):
//   고정 4~7회: 실행 잠금·해제 2 + 상태 읽기 1 + 이번 달 목록 1 (+ 지난달 따라잡기 목록 1, 상태 다시 읽기·저장 2는 필요할 때만)
//   묶음마다 최대 4회(규칙 최대 40개): 참여자 확인 + 이미 들어간 기록 확인 + 한 번에 저장 + 반영 표식
// 그래서 한 번에 규칙 약 240개를 넣는다. 다 못 넣으면 partial 로 끝나고 다음 실행이 이어 간다. 반영한 규칙은 표식이 바뀌어
// 목록에서 빠지므로 커서가 필요 없다. 같은 규칙·같은 달은 기록 확인과 (household_id, raw_text) 고유 색인으로 한 번만 들어간다
// (겹친 실행이나 같은 때의 수동 반영과 부딪쳐도 한 건).
// 새 달 첫 실행은 지난달에 실행이 끝까지 처리하지 못한 날짜(checked_date 뒤)의 규칙만 지난달 몫으로 따라잡는다(D-10):
// 지난달이 끝난 뒤 만든 규칙, 지난달 지정일에 꺼 두었던 규칙은 지난달로 넣지 않는다.
// V22.9.77 감사 M-8: 지난 달에 기록을 넣은(따라잡기·?month= 실행) 가계부는 그 달 월간 리포트 스냅숏이 이미 있으면 같은
// 실행 끝에서 다시 만든다. 한 실행에 RECURRING_REPORT_REBUILDS 개(월말 생성과 같은 가계부 2개)까지, 이 단계 몫(30회) 안에서만
// 만들고, 못 만든 가계부·달은 상태 키의 report_rebuild 에 남겨 다음 실행이 잇는다. 넣은 기록이 없는 실행은 예전과 같다.
// V22.9.77 N-17: report_rebuild 는 RECURRING_REPORT_QUEUE_MAX 개까지만 저장한다. 넘친 항목은 저장 때 잘려 그 가계부의 스냅숏이
// 예전 금액으로 남았으므로, 대기에 자리가 없는 가계부·달의 지난 달 몫은 이번 실행에서 넣지 않고 남겨 다음 실행이 잇는다.
// V22.9.78 N-16: 목록은 (지정일·가계부·id) 순서로 500개씩 읽고, 꽉 찬 쪽이면 마지막 규칙 뒤부터 다음 쪽을 읽는다(키셋, 중간에
// 바뀐 규칙이 있어도 쪽이 밀리지 않는다). 예전에는 한 쪽만 읽어 표식이 그대로인 건너뛴 규칙(조회 전용·차단 지출자·저장 거절)이
// 앞쪽을 채우면 뒤 규칙에 닿지 못한 채 '다 처리함'으로 끝났고, 말일이면 checked_date 가 넘어가 다음 달 따라잡기에서도 빠졌다.
// 한 실행은 RECURRING_CRON_PAGES 쪽까지만 읽고(읽기·해석 CPU), 다음 쪽은 저장소 호출 몫이 남을 때만 읽는다. 다 못 읽거나 다 못
// 넣으면 partial 로 끝나고, 앞에서부터 끝까지 처리한 마지막 자리를 상태 키 scan_after 에 달마다 남겨 다음 실행이 그 뒤부터 잇는다.
// checked_date 는 처리하지 못한 가장 앞 규칙(못 읽은 쪽은 마지막으로 읽은 규칙)의 지정일 전날을 넘지 않는다. 그래서 건너뛴 규칙이
// 아무리 많아도 실행마다 앞으로 나아가고, 말일에 닿지 못한 규칙은 새 달 따라잡기가 그 자리부터 잇는다.
const RECURRING_CRON_DB_CAP = 30;
const RECURRING_CRON_PAGE = 500;
const RECURRING_CRON_PAGES = 4;
const RECURRING_CRON_PAGE_ROOM = 5;
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
    scan_after: recurringScanAfter(state.scan_after),
  };
}

// V22.9.78 N-16: 달마다 이어 읽을 자리({month, day, household_id, id}). 예전 상태(칸 없음)와 형식이 틀린 항목은 자리 없음이다.
// 자리가 없으면 앞에서부터 읽으므로(다시 확인할 뿐 빠뜨리지 않는다) 버려도 안전하다.
// V22.9.79 S-4: 그 달 말일 이후에 앞에서부터 시작한 바퀴의 자리는 시작한 날(started)을 함께 적는다. 옛 코드는 이 칸을 읽지 않고
// 버리므로(되돌리면 자리만 남는다) 형식이 같고, 칸이 없거나 틀리면 말일 전에 시작한 바퀴의 자리로 본다.
function recurringScanAfter(values = []) {
  const out = [];
  for (const item of Array.isArray(values) ? values : []) {
    const month = validMonth(item?.month);
    const day = Number(item?.day);
    const householdId = typeof item?.household_id === "string" ? item.household_id : "";
    const id = typeof item?.id === "string" ? item.id : "";
    if (!month || !Number.isSafeInteger(day) || !householdId || !id || householdId.length > 120 || id.length > 120) continue;
    const started = typeof item?.started === "string" && item.started.length === 10 && isValidTransactionDateString(item.started) ? item.started : "";
    if (!out.some((entry) => entry.month === month)) out.push({ month, day, household_id: householdId, id, ...(started ? { started } : {}) });
  }
  return out.slice(0, 2);
}

// 저장소 정렬(지정일·가계부·id)과 같은 순서의 비교 열쇠. 정수끼리는 수로, 나머지(uuid)는 글자로 견준다.
function recurringCronKey(rule = {}) {
  return [Math.round(Number(rule.day_of_month)), String(rule.household_id ?? ""), String(rule.id ?? "")];
}

function recurringCronCompareText(a = "", b = "") {
  if (/^-?\d{1,15}$/.test(a) && /^-?\d{1,15}$/.test(b)) return Number(a) - Number(b);
  return a < b ? -1 : a > b ? 1 : 0;
}

function recurringCronCompareKey(a = [], b = []) {
  return (a[0] - b[0]) || recurringCronCompareText(a[1], b[1]) || recurringCronCompareText(a[2], b[2]);
}

// 한 쪽의 규칙을 자리 뒤의 것만 순서대로 돌려준다. 저장소가 자리·정렬을 지키면 그대로이고, 지키지 않아도(검사 픽스처) 같은
// 순서로 판정해 자리 앞 규칙을 두 번 세지 않는다.
function recurringCronPageRows(rows = [], after = null) {
  const keyed = safeArray(rows).map((rule) => ({ rule, key: recurringCronKey(rule) })).filter((item) => !after || recurringCronCompareKey(item.key, after) > 0);
  if (keyed.some((item, index) => index && recurringCronCompareKey(keyed[index - 1].key, item.key) > 0)) keyed.sort((a, b) => recurringCronCompareKey(a.key, b.key));
  return keyed;
}

// (지정일·가계부·id) > 자리. PostgREST 논리식 값은 큰따옴표로 감싸고, 값 안의 \ 와 " 는 앞에 \ 를 붙여 그대로 보낸다.
function recurringCronAfterFilter(key = []) {
  const day = Math.round(Number(key[0]));
  const quote = (value) => `"${String(value).replace(/[\\"]/g, (ch) => `\\${ch}`)}"`;
  return `(or(day_of_month.gt.${day},and(day_of_month.eq.${day},household_id.gt.${quote(key[1])}),and(day_of_month.eq.${day},household_id.eq.${quote(key[1])},id.gt.${quote(key[2])})))`;
}

// V22.9.77 감사 M-8: 월간 스냅숏을 다시 만들 가계부·달 목록("YYYY-MM|가계부ID"). 형식이 틀린 항목·겹친 항목은 버린다.
// V22.9.79 N-9: 주간 스냅숏은 그 주 일요일로 적는다("YYYY-MM-DD|가계부ID"). 옛 코드(V22.9.77·78)는 이 항목을 형식이 틀린 것으로
// 보고 버리므로 되돌려도 주간 다시 만들기만 빠진다. 월간을 앞에 두어 먼저 만들고, 대기가 넘치면 저장할 때 주간부터 잘린다.
function recurringReportQueue(values = []) {
  const monthly = new Set();
  const weekly = new Set();
  for (const value of Array.isArray(values) ? values : []) {
    const text = String(value ?? "");
    if (text[7] === "|" && validMonth(text.slice(0, 7)) && /^[^|\s"(),]{1,80}$/.test(text.slice(8))) monthly.add(text);
    else if (text[10] === "|" && recurringCronIsWeekEnd(text.slice(0, 10)) && /^[^|\s"(),]{1,80}$/.test(text.slice(11))) weekly.add(text);
  }
  return [...monthly, ...weekly];
}

function recurringReportEntries(queue = []) {
  return queue.map((item) => (item[7] === "|" ? { month: item.slice(0, 7), household_id: item.slice(8) } : { week_end: item.slice(0, 10), household_id: item.slice(11) }));
}

function recurringReportKey(entry = {}) {
  return `${entry.week_end || entry.month}|${entry.household_id}`;
}

// V22.9.79 N-9: 기록 날짜가 든 주의 일요일. 주간 스냅숏은 일요일 실행이 그 주 월~일 기록으로 만든다(isoWeekPeriod).
function recurringCronWeekEnd(ymd = "") {
  if (!isValidTransactionDateString(ymd)) return "";
  return recurringCronAddDays(ymd, (7 - new Date(`${ymd}T00:00:00Z`).getUTCDay()) % 7);
}

function recurringCronIsWeekEnd(ymd = "") {
  return isValidTransactionDateString(ymd) && new Date(`${ymd}T00:00:00Z`).getUTCDay() === 0;
}

function recurringStateBody(checkedDate = "", pendingMonth = "", queue = [], scanAfter = []) {
  // 다시 만들 스냅숏도 이어 읽을 자리도 없으면 예전과 같은 두 값만 쓴다.
  return JSON.stringify({
    checked_date: checkedDate, pending_month: pendingMonth,
    ...(queue.length ? { report_rebuild: queue.slice(0, RECURRING_REPORT_QUEUE_MAX) } : {}),
    ...(scanAfter.length ? { scan_after: scanAfter } : {}),
  });
}

function recurringCronBudgetStop(err) {
  return String(err?.code || "") === "supabase_subrequest_budget_before_dispatch" || /supabase_subrequest_budget_before_dispatch/.test(safeError(err));
}

function recurringCronInList(values = []) {
  return `(${values.map((value) => `"${String(value).split("\"").join("")}"`).join(",")})`;
}

async function fetchRecurringCronRows(env, phase, after = null) {
  const params = new URLSearchParams();
  params.set("select", RECURRING_CRON_SELECT);
  params.set("is_active", "not.is.false");
  params.set("amount", "gt.0");
  params.set("or", phase.kind === "catchup" ? `(last_applied_month.is.null,last_applied_month.lt.${phase.month})` : `(last_applied_month.is.null,last_applied_month.neq.${phase.month})`);
  params.set("day_of_month", `lte.${phase.queryDay}`);
  // V22.9.78 N-16: 따라잡기는 checked_date 다음 지정일부터 읽는다(그 앞 지정일은 따라잡을 몫이 아니다). 자리가 있으면 그 뒤부터.
  if (phase.minDay > 0) params.append("day_of_month", `gt.${phase.minDay}`);
  if (after) params.set("and", recurringCronAfterFilter(after));
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
  let queuedBefore = [];
  let pagesRead = 0;
  const trouble = new Set();
  if (explicitMonth) {
    // 운영자가 ?month= 로 달을 지정하면 그 달만 본다. 지난 달은 모든 날짜, 이번 달은 오늘까지가 지정일이다. 앞으로 올 달은 넣지 않는다.
    if (explicitMonth <= currentMonth) phases.push({ kind: "explicit", month: explicitMonth, dueDay: explicitMonth < currentMonth ? 31 : currentDay });
    // N-17: 지난 달 ?month= 실행도 다시 만들기 대기에 남은 자리를 본다. report_rebuild 만 쓰고 checked_date·pending_month 는 보지 않는다.
    if (explicitMonth < currentMonth) queuedBefore = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY)).report_rebuild;
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
    // V22.9.78 N-16: 앞선 실행이 이 달을 다 못 읽었으면 남긴 자리 뒤부터 읽는다. 따라잡기는 checked_date 가 지난달 안이면 그 다음
    // 지정일부터다. 첫 쪽은 예전처럼 처리 전에 읽는다(읽기 실패는 아무것도 바꾸지 않고 단계 오류로 끝난다).
    const resume = stored?.scan_after.find((entry) => entry.month === phase.month);
    // V22.9.79 S-4: 이어 읽기는 남긴 자리 앞쪽을 다시 보지 않는다. 그래서 여러 실행에 걸쳐 읽는 동안 앞쪽에 새로 만들거나 다시 켠
    // 규칙(반영할 수 있게 된 규칙)은 앞에서부터 다시 읽는 다음 바퀴에서만 보였고, 그 바퀴가 말일을 넘기면 그 달 몫을 놓쳤다.
    // 이제 한 달을 끝내는 바퀴는 그 달 말일 이후에 앞에서부터 시작한 바퀴뿐이다. 말일 실행과 새 달 따라잡기는 말일 이후에 시작한
    // 바퀴가 남긴 자리(started, 오늘 뒤 날짜는 틀린 값)만 잇고, 그 밖의 자리는 버리고 앞에서부터 읽는다(말일에 실행이 여러 번이어도
    // 다시 시작은 한 번).
    // 자리를 버려도 다시 확인할 뿐 두 번 넣지 않는다(넣은 규칙은 표식으로 목록에서 빠지고, 같은 기록은 기록 확인과 고유 색인으로
    // 한 번만 들어간다). 말일 전의 이번 달 실행은 예전처럼 자리를 잇는다.
    const monthEnd = recurringDateForMonth(phase.month, 31);
    const started = String(resume?.started || "");
    const closing = (phase.kind === "catchup" || phase.dueDay >= lastDay) && !(started >= monthEnd && started <= today);
    phase.resume = resume && !closing ? [resume.day, resume.household_id, resume.id] : null;
    phase.started = phase.resume ? started : today;
    phase.monthEnd = monthEnd;
    phase.minDay = phase.kind === "catchup" && phase.after >= `${phase.month}-01` ? Number(phase.after.slice(8, 10)) : 0;
    phase.firstPage = await fetchRecurringCronRows(env, phase, phase.resume);
    pagesRead += 1;
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
  // "yes" 이번 단계가 넣을 규칙, "wait" 지난달 몫을 먼저 넣어야 해 이번 달 몫을 미룬 규칙, "no" 이번 단계 몫이 아닌 규칙.
  const candidacy = (rule, phase) => {
    if (!usable(rule)) return "no";
    if (phase.kind === "catchup") return catchUpDue(rule) ? "yes" : "no";
    if (recurringCronDueDay(rule, phase.month) > phase.dueDay) return "no";
    if (String(rule.last_applied_month || "") === phase.month) return "no";
    if (phase.month < currentMonth && !recurringCronExistedIn(rule, phase.month)) return "no";
    // 지난달 몫이 빠진 규칙은 지난달을 먼저 넣는다. 이번 달을 먼저 넣으면 표식이 이번 달이 되어 지난달을 다시 찾지 못한다.
    if (phase.kind === "current" && !caughtUp.has(String(rule.id)) && catchUpDue(rule)) return "wait";
    return "yes";
  };
  const isCandidate = (rule, phase) => candidacy(rule, phase) === "yes";
  // N-16: 이어 읽을 자리는 끝까지 처리한 앞부분까지만 옮긴다. 넣을 규칙은 처리(넣음·확인·건너뜀·거절)가 끝나야 지나간다. 지난달
  // 몫을 기다리는 이번 달 규칙은 이번 달 몫을 아직 넣지 않았으므로 멈춘다. 따라잡기에서 지출자 자격이 없어 건너뛴 규칙만 이번 달도
  // 똑같이 건너뛰므로 지나간다.
  const ineligible = new Set();
  const unsettled = (item, phase) => {
    const id = String(item.rule.id);
    const state = candidacy(item.rule, phase);
    if (state === "yes") return !phase.done.has(id);
    return state === "wait" && !ineligible.has(id);
  };
  const markerOf = (rule) => caughtUp.has(String(rule.id)) ? previousMonth : String(rule.last_applied_month || "");
  const report = (detail, kind = "recurring_auto_apply_failed") => rememberOpsEvent({ kind, severity: "warn", path: "/cron/recurring/apply", method: "SCHEDULED", detail });
  // V22.9.77 N-17: 지난 달 몫을 넣으면 그 가계부·달이 다시 만들기 대기에 오른다. 대기(앞선 실행이 남긴 것 + 이번 실행)가
  // RECURRING_REPORT_QUEUE_MAX 개를 넘지 않게, 자리가 없는 가계부·달의 규칙은 이번에 넣지 않는다. 그 규칙은 표식이 그대로라
  // 남은 규칙(partial)이 되고 다음 실행이 잇는다. 이번 달 몫은 대기에 오르지 않으므로 그대로 넣는다.
  let reportDeferred = 0;
  const reportQueueWork = (phase, candidates) => {
    if (phase.month >= currentMonth) return candidates;
    // V22.9.79 N-9: 자리는 월간 항목만 센다. 주간 항목은 남는 자리에만 남고, 넘치면 저장할 때 주간부터 잘린다(넘침 운영 이벤트).
    const queued = new Set([...(stored ? stored.report_rebuild : queuedBefore), ...reportTouched].filter((key) => key[7] === "|"));
    const work = candidates.filter((rule) => {
      const key = `${phase.month}|${String(rule.household_id || "")}`;
      if (queued.has(key)) return true;
      if (queued.size >= RECURRING_REPORT_QUEUE_MAX) return false;
      queued.add(key);
      return true;
    });
    if (work.length < candidates.length) {
      reportDeferred += candidates.length - work.length;
      report(`${phase.month}:report_rebuild_full:${candidates.length - work.length}`, "recurring_report_rebuild_deferred");
    }
    return work;
  };
  // 넣을 규칙을 묶음(40개)마다 처리한다. 저장소 호출 몫이 모자라거나 확인·저장 결과를 모르면 멈추고 그 까닭(budget·error)을
  // 돌려준다. 처리하지 못한 규칙은 done 에 없으므로 남은 규칙이 된다.
  const processChunks = async (phase, work) => {
    const done = phase.done;
    for (let index = 0; index < work.length; index += RECURRING_CRON_CHUNK) {
      const chunk = work.slice(index, index + RECURRING_CRON_CHUNK);
      const missing = [...new Set(chunk.map((rule) => String(rule.household_id || "")))].filter((id) => id && !members.has(id));
      if (!room((missing.length ? 1 : 0) + 3)) return "budget";
      if (missing.length) {
        let rows;
        try { rows = await fetchRecurringCronMembers(env, missing); }
        catch (err) { stats.failed++; report(`${phase.month}:members:${safeError(err)}`, "recurring_household_scan_failed"); return "error"; }
        for (const id of missing) members.set(id, []);
        for (const row of rows) members.get(String(row.household_id || ""))?.push(row);
      }
      const items = [];
      for (const rule of chunk) {
        // 소유자·관리자·구성원 지출자의 규칙만 넣는다(V22.9.37 T7·SIM-5). 건너뛴 규칙의 표식은 그대로 둔다.
        if (!recurringSpenderEligible(members.get(String(rule.household_id || "")) || [], rule.user_id)) { stats.skipped++; done.add(String(rule.id)); ineligible.add(String(rule.id)); continue; }
        items.push({ rule, row: recurringCronTransaction(rule, phase.month) });
      }
      if (!items.length) continue;
      let existing;
      try { existing = await fetchRecurringCronExisting(env, [...new Set(items.map((item) => item.row.household_id))], items.map((item) => item.row.raw_text)); }
      catch (err) {
        // 무인 자동화에서는 확인 실패를 "중복 없음"으로 간주하지 않는다.
        stats.failed++; report(`${phase.month}:${safeError(err)}`, "duplicate_check_error"); return "error";
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
      let halted = "";
      for (const group of groups.values()) {
        if (!room(2)) { halted = "budget"; break; }
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
            halted = recurringCronBudgetStop(err) ? "budget" : "error"; break;
          }
          // 확실히 거절된 묶음(같은 때 수동 반영과 겹친 고유 색인 충돌, 한 건의 잘못된 값)은 한 건씩 다시 넣는다.
          // 묶음 저장은 한 문장이라 한 건만 걸려도 전부 되돌려지므로, 나머지 규칙이 그 한 건에 막히지 않게 한다.
          for (const item of group) {
            if (!room(2)) { halted = "budget"; break; }
            try {
              await createManualTransaction(env, item.row);
              stats.applied++; confirmed.push(item.rule);
            } catch (rowError) {
              if (recurringCronBudgetStop(rowError)) { halted = "budget"; break; }
              if (isUncertainStorageWrite(rowError)) { stats.failed++; report(`${item.row.household_id}:${String(item.rule.id || "")}:${safeError(rowError)}`); halted = "error"; break; }
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
      // V22.9.79 N-9: 오늘 앞에 끝난 주에 들어간 기록(따라잡기·늦게 넣은 이번 달 몫)은 그 주 주간 스냅숏도 있으면 다시 만든다.
      // 예전에는 월간만 다시 만들어 일요일에 만든 주간 스냅숏이 그 기록 없이 남았다. 일요일에 그 주 기록을 넣으면 같은 실행의
      // 리포트 단계가 뒤에서 그 주 스냅숏을 만든다.
      for (const rule of advance) {
        const householdId = String(rule.household_id || "");
        if (phase.month < currentMonth) reportTouched.push(`${phase.month}|${householdId}`);
        const weekEnd = recurringCronWeekEnd(recurringCronDueDate(rule, phase.month));
        if (weekEnd && weekEnd < today) reportTouched.push(`${weekEnd}|${householdId}`);
      }
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
          stats.failed++; partial = true; trouble.add("error"); report(`${phase.month}:marker:${safeError(err)}`);
        }
      }
      if (halted) return halted;
    }
    return "";
  };
  // V22.9.78 N-16: 쪽마다 넣을 규칙을 처리하고, 앞에서부터 끝까지 처리한 마지막 자리(cursor)를 옮긴다. 꽉 찬 쪽이면 마지막 규칙
  // 뒤부터 다음 쪽을 읽는다. 처리가 멈췄거나(budget·error), 쪽 한도(page_cap)·호출 몫(budget)에 걸렸거나, 다음 쪽을 못 읽으면
  // (error) 거기서 멈추고 partial 이 된다.
  const processPhase = async (phase) => {
    phase.done = new Set();
    phase.candidates = 0; phase.confirmed = 0; phase.seen = 0; phase.pages = 1;
    phase.remaining = [];
    phase.cursor = phase.resume;
    phase.lastKey = phase.resume;
    let raw = phase.firstPage, after = phase.resume;
    for (;;) {
      const items = recurringCronPageRows(raw, after);
      const candidates = items.map((item) => item.rule).filter((rule) => isCandidate(rule, phase));
      phase.seen += items.length;
      phase.candidates += candidates.length;
      stats.scanned += candidates.length;
      const halt = await processChunks(phase, reportQueueWork(phase, candidates));
      for (const rule of candidates) if (!phase.done.has(String(rule.id))) phase.remaining.push(rule);
      for (const item of items) {
        if (phase.firstUnsettled) break;
        if (unsettled(item, phase)) { phase.firstUnsettled = item; break; }
        phase.cursor = item.key;
      }
      if (items.length) phase.lastKey = items[items.length - 1].key;
      const full = safeArray(raw).length >= RECURRING_CRON_PAGE;
      if (halt) { phase.stop = halt; phase.end = !full; break; }
      if (!full) { phase.end = true; break; }
      // 꽉 찬 쪽인데 자리 뒤 규칙이 없으면 저장소가 자리를 무시한 것이다. 같은 쪽을 되풀이해 읽지 않는다.
      if (!items.length) { phase.stop = "error"; stats.failed++; report(`${phase.month}:page_not_advanced`, "recurring_page_failed"); break; }
      if (pagesRead >= RECURRING_CRON_PAGES) { phase.stop = "page_cap"; break; }
      if (!room(RECURRING_CRON_PAGE_ROOM)) { phase.stop = "budget"; break; }
      after = phase.lastKey;
      try {
        raw = await fetchRecurringCronRows(env, phase, after);
        pagesRead += 1; phase.pages += 1;
      } catch (err) {
        phase.stop = recurringCronBudgetStop(err) ? "budget" : "error";
        if (phase.stop === "error") { stats.failed++; report(`${phase.month}:page:${safeError(err)}`, "recurring_page_failed"); }
        break;
      }
    }
    if (phase.stop) { partial = true; trouble.add(phase.stop); }
  };
  for (const phase of phases) await processPhase(phase);
  const remainingOf = (phase) => safeArray(phase?.remaining);
  const remaining = phases.reduce((sum, phase) => sum + remainingOf(phase).length, 0);
  // 끝까지 읽었고 처리하지 못한 규칙이 없는 단계만 끝난 것이다. 못 읽은 쪽은 마지막으로 읽은 규칙의 지정일부터 남은 일이다.
  const complete = (phase) => !!phase && !!phase.end && !phase.firstUnsettled;
  const unread = phases.some((phase) => !phase.end);
  const frontierOf = (phase) => phase.firstUnsettled ? recurringCronDueDate(phase.firstUnsettled.rule, phase.month)
    : !phase.end ? recurringCronDueDate({ day_of_month: phase.lastKey ? phase.lastKey[0] : 1 }, phase.month) : "";
  partial = partial || remaining > 0 || unread || phases.some((phase) => phase.firstUnsettled);
  // V22.9.77 감사 M-8: 이번 실행과 앞선 실행이 남긴 가계부·달의 월간 스냅숏을 다시 만든다. 상태 저장 몫(다시 읽기·저장 2회,
  // V22.9.79 전 예약 실행은 저장 1회)은 남겨 둔다. 한도에 걸려 못 만든 항목은 상태 키에 남아 다음 실행이 잇는다.
  let reportQueue = recurringReportQueue([...(stored ? stored.report_rebuild : []), ...reportTouched]);
  let reportRebuilt = 0;
  if (reportQueue.length) {
    const reserve = 2;
    const outcome = await rebuildMonthlyReportSnapshots(env, recurringReportEntries(reportQueue), { limit: RECURRING_REPORT_REBUILDS, canSpend: (calls) => room(calls + reserve) });
    stats.failed += outcome.failed;
    reportRebuilt = outcome.rebuilt;
    reportQueue = recurringReportQueue(outcome.remaining.map(recurringReportKey));
    if (reportQueue.length > RECURRING_REPORT_QUEUE_MAX) report(`report_rebuild_overflow:${reportQueue.length - RECURRING_REPORT_QUEUE_MAX}`, "recurring_report_rebuild_overflow");
  }
  let nextChecked = checkedDate;
  if (stored) {
    // checked_date = 그 날짜까지 지정일인 규칙을 모두 처리했다는 표시. 끝까지 처리한 실행만 오늘로 옮긴다. 남은 일이 있으면
    // 처리하지 못한 가장 앞 규칙(못 읽은 쪽은 마지막으로 읽은 규칙)의 지정일 전날을 넘지 않는다. 다음 달 첫 실행은 그 뒤
    // 날짜의 지난달 규칙만 따라잡는다.
    let base = checkedDate;
    if (complete(catchupPhase) && base < previousMonthEnd) base = previousMonthEnd;
    const frontier = phases.map(frontierOf).filter(Boolean).sort()[0];
    if (!frontier) nextChecked = base > today ? base : today;
    else {
      const before = recurringCronAddDays(frontier, -1);
      nextChecked = base < before ? base : before;
    }
    // pending_month 는 예전처럼 남은 규칙이 있는 달이다. 못 읽은 쪽이 있는 달도 남은 규칙이 있는 달로 본다.
    const currentPhase = phases.find((phase) => phase.kind === "current");
    const pendingIn = (phase) => !!phase && (remainingOf(phase).length > 0 || !phase.end);
    const nextPending = pendingIn(currentPhase) ? currentMonth : pendingIn(catchupPhase) ? previousMonth : "";
    // N-16: 끝내지 못한 달만 이어 읽을 자리를 남긴다. 끝낸 달은 자리를 지워 다음 실행이 앞에서부터 다시 본다.
    // S-4: 말일 이후에 시작한 바퀴만 시작한 날을 적는다(따라잡기가 그 자리를 이어도 되는지 볼 때만 쓴다). 그 밖의 자리는 예전 형식이다.
    const scanAfter = phases.filter((phase) => !complete(phase) && phase.cursor)
      .map((phase) => ({ month: phase.month, day: phase.cursor[0], household_id: phase.cursor[1], id: phase.cursor[2], ...(phase.started >= phase.monthEnd ? { started: phase.started } : {}) }));
    const queueChanged = reportQueue.join(",") !== stored.report_rebuild.join(",");
    const scanChanged = JSON.stringify(scanAfter) !== JSON.stringify(stored.scan_after);
    if (nextChecked !== stored.checked_date || nextPending !== stored.pending_month || queueChanged || scanChanged) {
      // V22.9.79: 이 실행이 도는 동안 예약 실행 밖(정기 규칙 수정·수동 반영의 queueRecurringReportRebuild)이 다시 만들기 대기에
      // 보탠 항목을 덮지 않는다. 예전에는 처음 읽은 상태로 계산한 값을 그대로 써서 그 항목이 사라졌다. 저장 바로 앞에 상태를 다시
      // 읽어, 처음 읽은 뒤 새로 생긴 대기 항목을 이 실행의 대기 뒤에 붙인다. 다른 칸은 이 실행의 값이다(예약 실행끼리는 잠금으로
      // 겹치지 않고, 실행 밖에서는 대기만 보탠다). 다시 읽지 못하면 쓰지 않는다(저장 실패와 같다: 다음 실행이 앞선 상태에서 다시
      // 확인한다). 다시 읽은 뒤 저장까지의 한 번 왕복 사이에 보탠 항목은 여전히 덮일 수 있다.
      try {
        const latest = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY));
        const known = new Set(stored.report_rebuild);
        const added = latest.report_rebuild.filter((key) => !known.has(key));
        if (added.length) {
          reportQueue = recurringReportQueue([...reportQueue, ...added]);
          if (reportQueue.length > RECURRING_REPORT_QUEUE_MAX) report(`report_rebuild_overflow:${reportQueue.length - RECURRING_REPORT_QUEUE_MAX}`, "recurring_report_rebuild_overflow");
        }
        await saveSettingValue(env, RECURRING_CRON_STATE_KEY, recurringStateBody(nextChecked, nextPending, reportQueue, scanAfter));
      } catch (err) { stats.failed++; report(safeError(err), "recurring_state_save_failed"); }
    }
  } else if (reportQueue.length) {
    // ?month= 실행은 상태를 읽지 않았다. 못 만든 스냅숏 목록만 보태고 checked_date·pending_month·이어 읽을 자리는 읽은 값 그대로 쓴다.
    try {
      const current = recurringCronState(await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY));
      const merged = recurringReportQueue([...current.report_rebuild, ...reportQueue]);
      // V22.9.79 N-9: 월간 자리는 넣기 전에 셌다. 넘치면 저장할 때 뒤에 둔 주간 항목부터 잘린다.
      if (merged.length > RECURRING_REPORT_QUEUE_MAX) report(`report_rebuild_overflow:${merged.length - RECURRING_REPORT_QUEUE_MAX}`, "recurring_report_rebuild_overflow");
      await saveSettingValue(env, RECURRING_CRON_STATE_KEY, recurringStateBody(current.checked_date, current.pending_month, merged, current.scan_after));
    } catch (err) { stats.failed++; report(safeError(err), "recurring_state_save_failed"); }
  }
  const month = catchupPhase && (catchupPhase.confirmed || remainingOf(catchupPhase).length) ? previousMonth : (explicitMonth || currentMonth);
  const partialReason = !partial ? "" : trouble.has("error") ? "error" : trouble.has("page_cap") ? "page_cap" : trouble.has("budget") ? "budget" : reportDeferred ? "report_queue" : "remaining";
  return {
    ok: stats.failed === 0 && !partial, partial, month, today,
    months: phases.map((phase) => ({ month: phase.month, kind: phase.kind, candidates: phase.candidates || 0, remaining: remainingOf(phase).length, pages: phase.pages || 0, more: !phase.end })),
    households: touched.size, ...stats, remaining, checked_date: stored ? nextChecked : "",
    pages: pagesRead, rules_seen: phases.reduce((sum, phase) => sum + (phase.seen || 0), 0), more: unread,
    ...(partialReason ? { partial_reason: partialReason } : {}),
    ...(reportRebuilt || reportQueue.length ? { report_rebuilt: reportRebuilt, report_rebuild_pending: reportQueue.length } : {}),
    ...(reportDeferred ? { report_rebuild_deferred: reportDeferred } : {}),
  };
}

// V22.9.76 감사 D-10: 예약 실행이 지난달 말을 놓쳐 지난달 몫이 아직 없는 규칙을 새 달에 고치면, 고치기 전 값으로 지난달 몫을
// 먼저 넣는다. 고친 금액·날짜·분류·지출자는 다음 반영(이번 달)부터 쓴다. 예전에는 새 달의 따라잡기가 고친 뒤 값을 써서
// 11월 1일에 70만 원으로 올린 월세가 10월분도 70만 원으로 기록됐다. 지난달 몫이 따라잡기 대상이 아니면(그 달 지정일까지
// 실행이 끝까지 처리했거나, 지난달에 없던 규칙이거나, 꺼져 있거나 지출자 자격이 없으면) 아무것도 넣지 않는다.
async function settleRecurringBeforeEdit(env, householdId, existing = {}, next = {}) {
  if (!existing?.id || !householdId) return "none";
  const today = formatDate(nowKstDate());
  const previousMonth = addMonthsYm(today.slice(0, 7), -1);
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
  // V22.9.79 N-9: 그 기록이 든 주가 끝났으면 그 주 주간 스냅숏도 있으면 다시 만든다.
  // V22.9.79 N-10: 여기서 못 만든 스냅숏(확인·기록 조회·저장 실패)은 예약 실행의 다시 만들기 대기에 보태 다음 예약 실행이 잇는다.
  if (outcome === "applied" || outcome === "deduplicated") await refreshRecurringReports(env, householdId, [existing], previousMonth);
  return outcome;
}

// V22.9.79: 예약 실행 밖에서 정기 기록을 넣은 뒤(정기 규칙 수정의 지난달 몫, 수동 반영 '기록하기') 이미 만든 스냅숏 가운데 그
// 기록이 빠진 것. 그 달이 끝났으면(말일이면 그날 만든 이번 달 스냅숏도) 그 달 월간, 기록 날짜가 든 주가 오늘이나 그 앞에
// 끝났으면(일요일 실행이 이미 만들었을 수 있다) 그 주 주간이다. 예약 실행(N-9)은 오늘 끝나는 주·달을 같은 실행의 리포트
// 단계가 뒤에서 만들므로 그 앞에 끝난 것만 본다.
function recurringReportTouches(householdId = "", rules = [], month = "", today = "") {
  if (!householdId || !validMonth(month)) return [];
  const entries = recurringDateForMonth(month, 31) <= today ? [{ household_id: householdId, month }] : [];
  const weeks = new Set();
  for (const rule of safeArray(rules)) {
    const weekEnd = recurringCronWeekEnd(recurringCronDueDate(rule, month));
    if (weekEnd && weekEnd <= today) weeks.add(weekEnd);
  }
  for (const weekEnd of [...weeks].sort()) entries.push({ household_id: householdId, week_end: weekEnd });
  return entries;
}

// 위 스냅숏을 이 요청에서 RECURRING_REPORT_REBUILDS 개까지 다시 만들고(있는 스냅숏만, 확인 1회 + 하나에 2회), 못 만든 것은
// 다시 만들기 대기에 보태 다음 예약 실행이 잇는다(N-10, 읽기·저장 2회). 요청의 저장소 호출 몫이 모자라면 바로 대기에 보탠다.
// queueOnly 면 다시 만들지 않고 대기에만 보탠다. 던지지 않는다(기록 저장 결과를 바꾸지 않는다). 돌려주는 값은 항목 수다.
async function refreshRecurringReports(env, householdId = "", rules = [], month = "", { queueOnly = false, path = "/recurring/edit", method = "POST" } = {}) {
  const entries = recurringReportTouches(householdId, rules, month, formatDate(nowKstDate()));
  if (!entries.length) return 0;
  const budget = env.__AB_DB_BUDGET;
  const canSpend = (calls) => !budget || Number(budget.used || 0) + calls + 2 <= Number(budget.limit || 0);
  try {
    const rebuilt = queueOnly ? { remaining: entries } : await rebuildMonthlyReportSnapshots(env, entries, { limit: RECURRING_REPORT_REBUILDS, canSpend, path, method });
    if (safeArray(rebuilt?.remaining).length) await queueRecurringReportRebuild(env, rebuilt.remaining, { path, method });
  } catch (err) {
    rememberOpsEvent({ kind: "free_report_rebuild_failed", severity: "warn", path, method, detail: safeError(err) });
  }
  return entries.length;
}

// V22.9.79 감사 N-10: 예약 실행 밖(정기 규칙 수정·수동 반영)에서 다시 만들지 못한 스냅숏을 상태 키의 다시 만들기 대기(report_rebuild)에
// 보태 다음 예약 실행이 잇게 한다. 예전에는 운영 이벤트(free_report_rebuild_failed)만 남았고, 그 규칙은 표식이 지난달로 바뀌어
// 따라잡기에서 빠지므로 다음 실행도 그 가계부·달을 보지 않아 스냅숏이 예전 금액으로 남았다. 상태를 못 읽거나 깨졌으면
// 덮어쓰지 않는다(깨진 상태는 예약 실행이 처음 실행처럼 다시 쓴다). 저장소 호출은 읽기 1회·저장 1회이고, 실패해도 던지지 않고
// 운영 이벤트만 남긴다. 같은 때 도는 예약 실행은 저장 바로 앞에 상태를 다시 읽어 이 항목을 붙인다(그 사이 한 번 왕복에 보탠
// 항목만 덮일 수 있다).
async function queueRecurringReportRebuild(env, entries = [], { path = "/recurring/edit", method = "POST" } = {}) {
  const add = recurringReportQueue(safeArray(entries).map(recurringReportKey));
  if (!add.length) return false;
  try {
    const raw = await getSettingValueStrict(env, RECURRING_CRON_STATE_KEY);
    parseStrictSettingsObject(raw, "recurring_state");
    const state = recurringCronState(raw);
    const queue = recurringReportQueue([...state.report_rebuild, ...add]);
    if (queue.length > RECURRING_REPORT_QUEUE_MAX) rememberOpsEvent({ kind: "recurring_report_rebuild_overflow", severity: "warn", path, method, detail: `report_rebuild_overflow:${queue.length - RECURRING_REPORT_QUEUE_MAX}` });
    if (queue.join(",") !== state.report_rebuild.join(",")) await saveSettingValue(env, RECURRING_CRON_STATE_KEY, recurringStateBody(state.checked_date, state.pending_month, queue, state.scan_after));
    return true;
  } catch (err) {
    rememberOpsEvent({ kind: "recurring_report_rebuild_queue_failed", severity: "warn", path, method, detail: safeError(err) });
    return false;
  }
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

// V22.9.78 N-18: 예약 실행마다 결과 요약을 설정 키 cron_run_log_v22978 에 남긴다(최근 14번, 새것이 앞). 예전에는 결과가 인스턴스
// 메모리 운영 이벤트에만 있어 다른 인스턴스·재시작 뒤에는 지난 실행이 끝까지 됐는지 알 수 없었다. 가계부 id·사람·금액·비밀 값은
// 넣지 않고 건수·상태·짧은 오류 코드만 쓴다. 기록 저장은 덤이라 읽기·저장이 실패해도 실행 결과를 바꾸거나 다시 시도하지 않고
// 운영 이벤트만 남긴다. 저장소 호출은 읽기 1회·저장 1회이고, 예약 실행은 그 몫(SCHEDULED_RUN_LOG_CALLS)을 남겨 두고 단계를 돈다.
const SCHEDULED_RUN_LOG_KEY = "cron_run_log_v22978";
const SCHEDULED_RUN_LOG_MAX = 14;
const SCHEDULED_RUN_LOG_CALLS = 2;
const SCHEDULED_RUN_LOG_BYTES = 16000;
const SCHEDULED_RUN_RECURRING_FIELDS = ["households", "rules_seen", "scanned", "applied", "deduplicated", "skipped", "failed", "remaining", "pages", "report_rebuilt", "report_rebuild_pending", "report_rebuild_deferred"];
const SCHEDULED_RUN_REPORT_FIELDS = ["scanned", "generated", "skipped", "invalid", "failed", "pending_scopes"];

function scheduledRunCount(value) {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) && n > 0 ? Math.min(n, 1000000000) : 0;
}

function scheduledRunCode(value = "") {
  const text = String(value ?? "").trim().toLowerCase();
  return /^[a-z0-9][a-z0-9_:.-]{0,59}$/.test(text) ? text : "error";
}

// 오류에서 짧은 코드만 꺼낸다. 저장소 오류 본문(값·키가 들어갈 수 있다)은 남기지 않고 상태 번호만 쓴다.
function scheduledRunErrorCode(err) {
  const code = String(err?.code || "");
  if (/^[a-z][a-z0-9_]{2,59}$/i.test(code)) return code.toLowerCase();
  const message = String(err?.message || err || "");
  const status = message.match(/^Supabase (\d{3})\b/);
  if (status) return `db_${status[1]}`;
  const token = message.match(/^([a-z][a-z0-9_]{2,59})(?=:|$)/);
  return token ? token[1] : "error";
}

function scheduledRunStage(value, fields = [], flags = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  if (value.error !== undefined) return { error: scheduledRunCode(value.error) };
  const out = Object.create(null);
  for (const field of fields) out[field] = scheduledRunCount(value[field]);
  for (const flag of flags) if (value[flag] === true) out[flag] = true;
  return out;
}

// 새 기록과 저장돼 있던 기록을 같은 틀로 거른다. 아는 칸만 남기고 수는 0~10억, 글자는 짧은 코드로 줄인다.
function normalizeScheduledRun(entry = {}) {
  if (!entry || typeof entry !== "object" || Array.isArray(entry)) return null;
  const time = (value) => {
    const text = String(value || "");
    return /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,3})?Z$/.test(text) && Number.isFinite(Date.parse(text)) ? text : "";
  };
  const startedAt = time(entry.started_at);
  if (!startedAt) return null;
  const recurring = scheduledRunStage(entry.recurring, SCHEDULED_RUN_RECURRING_FIELDS, ["partial", "more", "skipped_run"]);
  if (recurring && !recurring.error) {
    if (entry.recurring.partial_reason) recurring.partial_reason = scheduledRunCode(entry.recurring.partial_reason);
    if (isValidTransactionDateString(String(entry.recurring.checked_date || ""))) recurring.checked_date = String(entry.recurring.checked_date);
  }
  const reports = scheduledRunStage(entry.reports, SCHEDULED_RUN_REPORT_FIELDS, ["partial", "skipped_run"]);
  const cleanup = scheduledRunStage(entry.cleanup, [], ["ok", "skipped"]);
  const version = typeof entry.version === "string" && /^V[0-9A-Za-z._-]{1,47}$/.test(entry.version) ? entry.version : "";
  return {
    started_at: startedAt, finished_at: time(entry.finished_at) || startedAt,
    status: ["ok", "partial", "error"].includes(entry.status) ? entry.status : "error",
    ...(version ? { version } : {}),
    ...(recurring ? { recurring } : {}), ...(reports ? { reports } : {}), ...(cleanup ? { cleanup } : {}),
    errors: safeArray(entry.errors).slice(0, 6).map(scheduledRunCode),
  };
}

// 실행 요약 하나를 앞에 붙여 저장한다. 앞선 기록을 읽지 못하면(저장소 오류) 이번 기록만으로 덮어쓰지 않고 건너뛴다. 저장된 값이
// 깨졌으면(JSON 아님·배열 아님) 고치려 하지 않고 새로 시작한다. 어떤 경우에도 오류를 던지지 않는다.
async function recordScheduledRun(env, entry = {}) {
  const report = (kind, detail) => rememberOpsEvent({ kind, severity: "warn", path: "/cron/run-log", method: "SCHEDULED", detail });
  try {
    const fresh = normalizeScheduledRun({ ...entry, finished_at: entry.finished_at || new Date(qaFixedNowMs()).toISOString(), version: APP_VERSION });
    if (!fresh) return false;
    let previous;
    try { previous = await getSettingValueStrict(env, SCHEDULED_RUN_LOG_KEY); }
    catch (err) { report("scheduled_run_log_failed", `read:${scheduledRunErrorCode(err)}`); return false; }
    let stored = [];
    try { stored = parseStrictSettingsArray(previous, "scheduled_run_log"); }
    catch (err) { report("scheduled_run_log_invalid", safeError(err)); }
    const entries = [fresh, ...stored.map(normalizeScheduledRun).filter(Boolean)].slice(0, SCHEDULED_RUN_LOG_MAX);
    let body = JSON.stringify(entries);
    while (body.length > SCHEDULED_RUN_LOG_BYTES && entries.length > 1) { entries.pop(); body = JSON.stringify(entries); }
    try { await saveSettingValue(env, SCHEDULED_RUN_LOG_KEY, body); }
    catch (err) { report("scheduled_run_log_failed", `write:${scheduledRunErrorCode(err)}`); return false; }
    return true;
  } catch (err) {
    report("scheduled_run_log_failed", `record:${scheduledRunErrorCode(err)}`);
    return false;
  }
}

// 관리 화면(/ops-dashboard)용. 읽기 실패는 호출부로 던지고, 깨진 값은 빈 기록과 invalid 로 돌려준다.
async function readScheduledRunLog(env) {
  const raw = await getSettingValueStrict(env, SCHEDULED_RUN_LOG_KEY);
  let entries = [];
  try { entries = parseStrictSettingsArray(raw, "scheduled_run_log"); }
  catch (_) { return { entries: [], invalid: true }; }
  return { entries: entries.map(normalizeScheduledRun).filter(Boolean).slice(0, SCHEDULED_RUN_LOG_MAX), invalid: false };
}
// @build:exports-start
export {
  SCHEDULED_RUN_LOG_CALLS, applyRecurringRulesForMonthBatched, eligibleRecurringSpenders,
  handleRecurringCronApply, readScheduledRunLog, recordScheduledRun, recurringDateForMonth,
  recurringSpenderEligible, refreshRecurringReports, runRecurringAutoApply, scheduledRunErrorCode,
  settleRecurringBeforeEdit,
};
// @build:exports-end
