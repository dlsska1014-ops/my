// @build:imports-start
import {
  AB_NLU_RUNTIME_EVENTS, AB_NLU_RUNTIME_METRICS, AB_SKILL_EVENTS, AB_SKILL_RATE_BUCKETS,
} from "./global-state.js";
import { APP_MODE, APP_VERSION, publicBaseUrl } from "../public/site-config.js";
import { safeError } from "./leases.js";
import { getCookie, htmlResponse, jsonResponse, wantsTransactionDeleteJson } from "./http.js";
import { myReturnLocation } from "../my/access-control.js";
import {
  KAKAO_GROUP_MENTION_V229134, isUncertainStorageWrite, kakaoGroupMentionLinesV229134,
  kakaoGroupQuotedSegmentsV229134, kakaoSafeText, kakaoText, kakaoTextLinks,
} from "../kakao/response-builders.js";
import { KAKAO_RETRY_DEDUP_SECONDS } from "../kakao/transaction-save.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

function nluOpsConfig(env = {}) {
  return {
    aggregate_metrics_enabled: String(env.NLU_METRICS_ENABLED || "0") === "1",
    failure_samples_enabled: String(env.NLU_PERSIST_FAILURE_SAMPLES || "0") === "1",
    store_redacted_text: String(env.NLU_STORE_REDACTED_TEXT || "0") === "1",
    failure_sample_rate: boundedRuntimeNumber(env.NLU_FAILURE_SAMPLE_RATE, 1, 0, 1),
    retention_days: nluRetentionDays(env),
    memory_event_limit: boundedRuntimeNumber(env.NLU_MEMORY_EVENT_LIMIT, 600, 100, 2000),
  };
}

function nluRetentionDays(env = {}) {
  if (env.NLU_FAILURE_RETENTION_DAYS === undefined) return 14;
  const value = String(env.NLU_FAILURE_RETENTION_DAYS).trim();
  if (!/^[1-9]\d?$/.test(value) || Number(value) > 90) return null;
  return Number(value);
}

// Only server-owned classifications cross the diagnostic persistence boundary.
// The legacy redacted-text flag never authorizes a new text sample.
function nluDiagnosticFields(event = {}) {
  // V22.9.148: 못 알아들음(NO_MATCH)·금액 없음(NO_AMOUNT)·단추 이름만 온 답(BUTTON_LABEL)·인사(GREETING)·가계부 없는 사람의 첫 안내(FIRST_CONTACT)는
  // 답을 만든 곳이 적는 이름이다. 저장하는 줄에는 까닭 칸이 없어서 갈래마다 이름이나 결과를 달리한다(이름·초대·예산·가계부 안내 = NO_MATCH/clarify).
  // (markKakaoNluOutcomeV229148). 예전에는 모두 ‘알 수 없음’(UNKNOWN)에 섞였다.
  const intents = ["EMPTY", "UNKNOWN", "EDIT", "MENU", "START", "CREATE_HOUSEHOLD", "JOIN_HOUSEHOLD", "HOUSEHOLD_SWITCH", "MEMBER_ALIAS_CHANGE", "INVITE_CODE_SHOW", "INVITE_MEMBER", "BUDGET_SETUP", "BUDGET_STATUS", "GROUP_LINK", "SETTLEMENT", "SUMMARY", "RECENT_RECORDS", "INPUT_EXAMPLE", "EDIT_GUIDE", "KEYWORD_GUIDE", "RESERVE_GUIDE", "DATA_POLICY", "CANCEL", "HELP", "WEB_LINK", "TRANSACTION", "NO_MATCH", "NO_AMOUNT", "BUTTON_LABEL", "GREETING", "FIRST_CONTACT"];
  const reasons = ["generic_fallback", "guided_clarification", "handled", "save_failed", "save_uncertain", "safe_error_response", "handler_error", "no_match", "no_amount", "button_label"];
  const reason = String(event.reason || "");
  // V22.9.90: the natural-intent detector names these two HOUSEHOLD_CREATE/HOUSEHOLD_JOIN; the stored names (and the monitor labels) are the ones below.
  const aliases = { HOUSEHOLD_CREATE: "CREATE_HOUSEHOLD", HOUSEHOLD_JOIN: "JOIN_HOUSEHOLD" };
  const intent = aliases[event.intent] || event.intent;
  return {
    intent: intents.includes(intent) ? intent : "UNKNOWN",
    result: ["ok", "fallback", "clarify", "error"].includes(event.result) ? event.result : "error",
    reason: reasons.includes(reason) || /^edit_(?:unrecognized|unrecognized_final|duplicate_reply_guard|restore_error):attempt_[0-3]$/.test(reason) ? reason : "handler_error",
  };
}

function redactNluOpsSample(text = "") {
  return String(text || "")
    .replace(/https?:\/\/\S+/gi, "[URL]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b\d{2,4}[ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/\b[A-Z0-9]{6,16}\b/g, "[코드]")
    .replace(/\b\d{8,}\b/g, "[긴숫자]")
    .replace(/@?(?:말해가계부|똑똑한가계부)/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 180);
}

function nluOpsFingerprint(text = "") {
  const input = String(text || "");
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return `nlu_${(h >>> 0).toString(16).padStart(8, "0")}`;
}

// V22.9.148(Codex 4차 검토 — V148:C-35·C-36): DB(PostgREST) 오류 글(data/supabase-client.js ‘Supabase 상태: 본문’ — 본문은 응답 글 그대로, 500자)은
// 구조를 읽어 상태·오류 번호(code)와 값이 없는 진단 문구(message)만 남긴다. 앞 고침은 한 가지 직렬화(콜론 뒤 공백 없음)의 "details":"…" 만 찾아,
// 콜론 뒤에 공백이 있는 본문의 막힌 행과 message 가 옮겨 적은 필터 값(PGRST100 ‘failed to parse filter (…)’)이 그대로 남았다. details·hint 와
// 모르는 칸은 값 없이 ‘[값 생략]’, message 는 아래 표의 꼴(따옴표 안은 표·열·제약 이름)이면 그대로, 받은 값을 옮겨 적는 꼴은 값만 빼고, 그 밖은
// ‘[메시지 생략]’. 본문이 잘려 끝을 모르면(safeError 400자) 그 뒤는 모두 버리고 "truncated":true 를 단다. JSON 이 아닌 본문은 ‘[본문 생략]’.
const OPS_DB_ID_V229148 = "[A-Za-z_][A-Za-z0-9_$]{0,62}(?:\\.[A-Za-z_][A-Za-z0-9_$]{0,62})?";
const OPS_DB_QUOTED_V229148 = `"${OPS_DB_ID_V229148}"`;
const OPS_DB_SAFE_MESSAGES_V229148 = Object.freeze([
  new RegExp(`^new row for relation ${OPS_DB_QUOTED_V229148} violates check constraint ${OPS_DB_QUOTED_V229148}$`),
  new RegExp(`^null value in column ${OPS_DB_QUOTED_V229148}(?: of relation ${OPS_DB_QUOTED_V229148})? violates not-null constraint$`),
  new RegExp(`^duplicate key value violates unique constraint ${OPS_DB_QUOTED_V229148}$`),
  new RegExp(`^(?:insert or update|update or delete) on table ${OPS_DB_QUOTED_V229148} violates foreign key constraint ${OPS_DB_QUOTED_V229148}(?: on table ${OPS_DB_QUOTED_V229148})?$`),
  new RegExp(`^conflicting key value violates exclusion constraint ${OPS_DB_QUOTED_V229148}$`),
  new RegExp(`^new row violates row-level security policy(?: ${OPS_DB_QUOTED_V229148})? for table ${OPS_DB_QUOTED_V229148}$`),
  new RegExp(`^permission denied for (?:table|relation|function|schema|sequence|view) ${OPS_DB_ID_V229148}$`),
  new RegExp(`^(?:relation|column|function|type|schema) ${OPS_DB_QUOTED_V229148}(?: of relation ${OPS_DB_QUOTED_V229148})? does not exist$`),
  new RegExp(`^column ${OPS_DB_ID_V229148} does not exist$`),
  new RegExp(`^Could not find the table '${OPS_DB_ID_V229148}' in the schema cache$`),
  new RegExp(`^Could not find the '${OPS_DB_ID_V229148}' column of '${OPS_DB_ID_V229148}' in the schema cache$`),
  new RegExp(`^Could not find the function ${OPS_DB_ID_V229148}(?:\\((?:${OPS_DB_ID_V229148}(?:, ${OPS_DB_ID_V229148})*)?\\)| without parameters) in the schema cache$`),
  new RegExp(`^Could not find a relationship between '${OPS_DB_ID_V229148}' and '${OPS_DB_ID_V229148}' in the schema cache$`),
  /^(?:Could not query the database for the schema cache\. Retrying\.|Database client error\. Retrying the connection\.|Timed out acquiring connection from connection pool\.)$/,
  /^(?:JSON object requested, multiple \(or no\) rows returned|Cannot coerce the result to a single JSON object)$/,
  /^canceling statement due to (?:statement timeout|lock timeout|user request)$/,
  /^(?:could not serialize access due to (?:concurrent update|read\/write dependencies among transactions)|deadlock detected)$/,
  /^(?:there is no unique or exclusion constraint matching the ON CONFLICT specification|ON CONFLICT DO UPDATE command cannot affect row a second time)$/,
  /^(?:value too long for type [a-z ]{1,40}(?:\(\d{1,6}\))?|numeric field overflow|(?:small|big)?int(?:eger)? out of range)$/,
  /^(?:JWT expired|Invalid API key|Empty or invalid json|Requested range not satisfiable|All object keys must match)$/,
]);
// V22.9.148(Codex 5차 검토 — V148:C-50): 우리 SQL 함수가 raise 하는 정해 둔 이름은 꼴이 아니라 이름 그대로 본다 — 저장소 SQL(git 이 아는 *.sql)의
// ‘raise exception '이름'’ 이름 모두와 정해 둔 영문 문장 둘(검사가 SQL 과 대조한다). 앞 고침은 꼴(/^[a-z][a-z0-9_]{2,63}…$/)로만 보아, 짧은 영문 메모
// (‘clinic_visit’)가 그 자리에 오면 그대로 남았다(지금 SQL 이 메모를 raise 하지는 않는다 — 가리기가 둘을 가르지 못했다). 위 표의 따옴표 안 이름은
// Postgres·PostgREST 가 스키마의 표·열·제약·함수 이름으로 채우는 자리다(사용자가 만들 수 있는 이름이 아니다).
const OPS_DB_RAISE_NAMES_V229148 = new Set([
  "accountbook_budgets_required", "accountbook_recurring_required", "asset_action_invalid", "asset_balance_invalid", "asset_history_invalid",
  "asset_id_invalid", "asset_id_required", "asset_invalid", "asset_kind_invalid", "asset_limit_exceeded", "asset_name_duplicate",
  "asset_name_invalid", "asset_not_found", "asset_sensitive_or_invalid", "asset_snapshot_month_invalid", "asset_storage_invalid",
  "asset_text_too_long", "bulk_household_scope_mismatch", "expected_row_required", "household_import_pending", "household_leave_not_applied",
  "household_membership_not_found", "household_not_found", "household_owner_cannot_leave", "household_purge_scope_too_large",
  "import_contract_upgrade_required", "import_household_scope_mismatch", "import_pending_identity_changed", "import_pending_rows_exist",
  "import_pending_rows_missing", "import_pending_unresolved", "import_source_not_pending", "import_source_scope_changed",
  "import_source_scope_invalid", "import_source_state_changed", "import_source_state_invalid", "import_spender_not_member",
  "import_state_contract_upgrade_required", "invalid_bulk_size", "invalid_credential", "invalid_import_amount", "invalid_import_size",
  "invalid_import_type", "invalid_kakao_id", "invalid_login_name", "invalid_month", "invalid_transaction_amount", "invalid_transaction_type",
  "kakao_identity_in_use", "login_name_in_use", "primary_user_not_found", "purge_contract_upgrade_required", "recurring_spender_required",
  "refund_link_amount_exceeded", "refund_link_amount_invalid", "refund_link_date_order", "refund_link_duplicate", "refund_link_history_invalid",
  "refund_link_input_invalid", "refund_link_kind_invalid", "refund_link_locked_amount", "refund_link_locked_category", "refund_link_locked_date",
  "refund_link_locked_kind", "refund_link_month_completed", "refund_link_not_found", "refund_link_permission_denied",
  "refund_link_recipient_invalid", "refund_link_recipient_required", "refund_link_record_not_found", "refund_link_source_changed",
  "refund_link_spender_required", "refund_link_window", "refund_links_already_applied", "refund_links_not_empty",
  "refund_links_prerequisite_table_missing", "rows_must_be_array", "same_user", "secondary_user_not_found", "spender_not_household_member",
  "too_many_budget_rows", "transaction_not_found", "user_not_found", "v229119_review_only_drop_kakao_request_unique_approval_required",
  "v229119_transactions_table_missing", "v229148_review_only_db_advisor_grants_already_applied_2026_11_27", "v229148_trigger_probe_failed",
  "v22959r2_post_contract_changed", "v22959r2_pre_contract_changed", "v22959r2_rollback_post_contract_changed",
  "v22959r2_rollback_pre_contract_changed", "v22979_review_only_refund_links_approval_required",
  "v22979_review_only_refund_links_rollback_approval_required", "v22982_review_only_usage_summary_approval_required",
  "v22982_review_only_usage_summary_rollback_approval_required", "v22988_prerequisite_table_missing",
  "v22988_review_only_undo_delete_approval_required", "v22988_review_only_undo_delete_rollback_approval_required", "v22988_v227_delete_missing",
  "v61_lifecycle_name_already_present_review_required", "v61_review_only_full_schema_and_cutover_approval_required",
  "v61_review_only_recovery_freeze_approval_required", "attempt key is required", "operation key and owner are required",
]);
// 오류 번호(code)는 정해진 번호표에 있는 것만 남긴다(V148:C-50 — 앞 고침은 영숫자 16자까지 받아 ‘clinic_visit’ 도 남겼다).
// V22.9.148(Codex 6차 검토 — V148:C-62): 번호표 그대로 본다 — PostgreSQL 15·17 의 SQLSTATE 모두(src/backend/utils/errcodes.txt 두 판의 합 262개 — 15 에만
// 있는 72000, 17 에만 있는 25P04 포함)·PostgREST 오류 번호 40개(docs/references/errors.rst, 2026-11-28 — 내부 오류 PGRSTX00 포함)·HTTP 상태 세 자리(100~599).
// 5차 고침은 분류 두 글자 뒤 아무 세 글자나 받아 정해지지 않은 ‘HVABC’ 가 남았고, PGRST 뒤는 숫자 셋만 받아 PGRSTX00 을 지웠다. 저장소 SQL 은 raise 의
// 기본 번호(P0001)만 쓴다(검사가 SQL 의 errcode 지정이 없음을 확인한다).
const OPS_DB_SQLSTATE_V229148 = new Set((
  "00000 01000 01003 01004 01006 01007 01008 0100C 01P01 02000 02001 03000 08000 08001 08003 08004 08006 08007 08P01 09000 0A000 0B000 0F000 0F001 0L000 " +
  "0LP01 0P000 0Z000 0Z002 20000 21000 22000 22001 22002 22003 22004 22005 22007 22008 22009 2200B 2200C 2200D 2200F 2200G 2200H 2200L 2200M 2200N 2200S " +
  "2200T 22010 22011 22012 22013 22014 22015 22016 22018 22019 2201B 2201E 2201F 2201G 2201W 2201X 22021 22022 22023 22024 22025 22026 22027 2202E 2202G " +
  "2202H 22030 22031 22032 22033 22034 22035 22036 22037 22038 22039 2203A 2203B 2203C 2203D 2203E 2203F 2203G 22P01 22P02 22P03 22P04 22P05 22P06 22P07 " +
  "23000 23001 23502 23503 23505 23514 23P01 24000 25000 25001 25002 25003 25004 25005 25006 25007 25008 25P01 25P02 25P03 25P04 26000 27000 28000 28P01 " +
  "2B000 2BP01 2D000 2F000 2F002 2F003 2F004 2F005 34000 38000 38001 38002 38003 38004 39000 39001 39004 39P01 39P02 39P03 3B000 3B001 3D000 3F000 40000 " +
  "40001 40002 40003 40P01 42000 42501 42601 42602 42611 42622 42701 42702 42703 42704 42710 42712 42723 42725 42803 42804 42809 42830 42846 42883 428C9 " +
  "42939 42P01 42P02 42P03 42P04 42P05 42P06 42P07 42P08 42P09 42P10 42P11 42P12 42P13 42P14 42P15 42P16 42P17 42P18 42P19 42P20 42P21 42P22 44000 53000 " +
  "53100 53200 53300 53400 54000 54001 54011 54023 55000 55006 55P02 55P03 55P04 57000 57014 57P01 57P02 57P03 57P04 57P05 58000 58030 58P01 58P02 72000 " +
  "F0000 F0001 HV000 HV001 HV002 HV004 HV005 HV006 HV007 HV008 HV009 HV00A HV00B HV00C HV00D HV00J HV00K HV00L HV00M HV00N HV00P HV00Q HV00R HV010 HV014 " +
  "HV021 HV024 HV090 HV091 P0000 P0001 P0002 P0003 P0004 XX000 XX001 XX002"
).trim().split(" "));
const OPS_DB_PGRST_V229148 = new Set((
  "PGRST000 PGRST001 PGRST002 PGRST003 PGRST100 PGRST101 PGRST102 PGRST103 PGRST105 PGRST106 PGRST107 PGRST108 PGRST111 PGRST112 PGRST114 PGRST115 " +
  "PGRST116 PGRST117 PGRST118 PGRST120 PGRST121 PGRST122 PGRST123 PGRST124 PGRST125 PGRST126 PGRST127 PGRST128 PGRST129 PGRST200 PGRST201 PGRST202 " +
  "PGRST203 PGRST204 PGRST205 PGRST300 PGRST301 PGRST302 PGRST303 PGRSTX00"
).trim().split(" "));
const opsDbKnownCodeV229148 = (value = "") => OPS_DB_SQLSTATE_V229148.has(value) || OPS_DB_PGRST_V229148.has(value) || /^[1-5]\d{2}$/.test(value);
// 받은 값을 옮겨 적는 꼴: 값만 뺀다(본문이 잘려 값이 끝나지 않아도 앞부분으로 알아본다).
const OPS_DB_VALUE_MESSAGES_V229148 = Object.freeze([
  [/^(invalid input (?:syntax for type [a-z0-9_ ]{1,40}|value for enum [A-Za-z0-9_.]{1,80})|date\/time field value out of range|invalid byte sequence for encoding "UTF8"): /, (m) => `${m[1]}: [값 생략]`],
  [/^value "[\s\S]*" (is out of range for type [a-z0-9_ ]{1,40})$/, (m) => `value [값 생략] ${m[1]}`],
  [/^value "/, () => "value [값 생략]"],
  [/^"?(failed to parse (?:filter|logic tree|order|select|columns|tree path|range)(?: [a-z]{1,12})?) \(/, (m) => `${m[1]} [값 생략]`],
]);
function opsDbSafeMessageV229148(message = "", whole = true) {
  const text = String(message || "");
  if (whole && (OPS_DB_RAISE_NAMES_V229148.has(text) || OPS_DB_SAFE_MESSAGES_V229148.some((re) => re.test(text)))) return text;
  for (const [re, keep] of OPS_DB_VALUE_MESSAGES_V229148) {
    const found = re.exec(text);
    if (found) return keep(found);
  }
  return "[메시지 생략]";
}
// JSON 글 조각(따옴표 안)을 푼다. 잘린 조각은 끝의 덜 된 이스케이프를 떼고 푼다(값을 알아보는 데만 쓴다).
function opsJsonTextV229148(raw = "") {
  for (const piece of [raw, raw.replace(/\\(?:u[0-9a-fA-F]{0,3})?$/, "")]) {
    try { return JSON.parse(`"${piece}"`); } catch (err) {}
  }
  return raw.replace(/\\(.)/g, "$1");
}
function opsJsonStringEndV229148(text = "", at = 0) {
  for (let i = at + 1; i < text.length; i += 1) {
    if (text[i] === "\\") i += 1;
    else if (text[i] === "\"") return i + 1;
  }
  return -1;
}
// 중첩 값(객체·배열)의 끝 — 따옴표 안을 건너뛰며 짝을 센다. 끝나지 않으면(잘린 본문) -1.
function opsJsonNestedEndV229148(text = "", at = 0) {
  const closers = [];
  for (let i = at; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\"") {
      const end = opsJsonStringEndV229148(text, i);
      if (end < 0) return -1;
      i = end - 1;
    } else if (ch === "{" || ch === "[") closers.push(ch === "{" ? "}" : "]");
    else if (ch === "}" || ch === "]") {
      if (closers.pop() !== ch) return -1;
      if (!closers.length) return i + 1;
    }
  }
  return -1;
}
// 한 DB 응답의 본문(어디서 끝나는지는 아래 opsRedactDbErrorsV229148 가 정한다)을 가린 꼴로 돌려준다.
function opsDbErrorBodyV229148(body = "") {
  const text = String(body || "");
  let at = 0;
  const space = () => { while (at < text.length && /\s/.test(text[at])) at += 1; };
  space();
  if (at >= text.length) return "";
  if (text[at] !== "{") return "[본문 생략]";
  at += 1;
  const fields = [];
  let closed = false;
  for (;;) {
    space();
    if (text[at] === "}") { at += 1; closed = true; break; }
    if (text[at] !== "\"") break;
    const keyEnd = opsJsonStringEndV229148(text, at);
    if (keyEnd < 0) break;
    const key = opsJsonTextV229148(text.slice(at + 1, keyEnd - 1));
    at = keyEnd;
    space();
    if (text[at] !== ":") break;
    at += 1;
    space();
    if (text[at] === "\"") {
      const valueEnd = opsJsonStringEndV229148(text, at);
      if (valueEnd < 0) { fields.push([key, opsJsonTextV229148(text.slice(at + 1)), false]); break; }
      fields.push([key, opsJsonTextV229148(text.slice(at + 1, valueEnd - 1)), true]);
      at = valueEnd;
    } else if (text[at] === "{" || text[at] === "[") {
      // V22.9.148(Codex 5차 검토 — V148:C-55): 중첩 값은 통째로 건너뛰고 다음 칸을 읽는다 — 앞 고침은 거기서 읽기를 멈춰 뒤의 code 를 잃고 잘리지
      // 않은 본문에 truncated 를 달았다(‘{"extra":{"count":1},"code":"23514"}’). 끝나지 않은 중첩 값(잘린 본문)에서만 멈춘다.
      const nestedEnd = opsJsonNestedEndV229148(text, at);
      if (nestedEnd < 0) { fields.push([key, undefined, false]); break; }
      fields.push([key, undefined, true]);
      at = nestedEnd;
    } else {
      const literal = /^(?:null|true|false|-?\d{1,20}(?:\.\d{1,20})?)/.exec(text.slice(at, at + 48));
      if (!literal) { fields.push([key, undefined, false]); break; }
      fields.push([key, literal[0] === "null" ? null : literal[0], true]);
      at += literal[0].length;
    }
    space();
    if (text[at] === ",") { at += 1; continue; }
    if (text[at] === "}") { at += 1; closed = true; }
    break;
  }
  // 열쇠는 오류 본문(바깥 글)에서 온다 — 정해 둔 칸(code·message·details·hint)만 프로토타입 없는 객체에 담고(validate-proto-safety-v22934), 그 밖의 칸은
  // 이름을 쓰지 않고 개수(other_fields)만 적는다(V148:C-50 — 앞 고침은 영문 이름이면 칸 이름을 그대로 남겨, 그 자리의 영문 메모가 남았다).
  const safe = Object.create(null);
  let other = 0;
  for (const [key, value, whole] of fields) {
    if (key === "code") safe.code = whole && typeof value === "string" && opsDbKnownCodeV229148(value) ? value : whole && value === null ? null : "[값 생략]";
    else if (key === "message") safe.message = typeof value === "string" ? opsDbSafeMessageV229148(value, whole) : whole && value === null ? null : "[값 생략]";
    else if (key === "details" || key === "hint") safe[key] = whole && value === null ? null : "[값 생략]";
    else other += 1;
  }
  if (other) safe.other_fields = other;
  if (!closed) safe.truncated = true;
  // V22.9.148(Codex 5차 검토 — V148:C-49): 닫힌 본문 뒤에 남은 이 응답의 글은 ‘[뒤 글 생략]’ — 앞 고침은 첫 객체의 } 를 본문 끝으로 보아 그 뒤의 글
  // (‘{"code":"XX000"} 진료비’)이 그대로 남았다. Worker 가 붙이는 진단은 늘 오류 글 앞에 온다(아래 opsRedactDbErrorsV229148 — V148:C-61).
  return JSON.stringify(safe) + (closed && text.slice(at).trim() ? " [뒤 글 생략]" : "");
}
// V22.9.148(Codex 6차 검토 — V148:C-61): 상세 한 줄에는 DB 오류 글을 하나만, 맨 끝에 둔다 — Worker 가 붙이는 진단(로그인 추적 번호·걸린 시간·단계)은
// 부르는 곳이 오류 글 앞에 적는다(auth/kakao-oauth.js·kakao/skill-handler.js). 그래서 첫 ‘Supabase 상태: ’ 머리 뒤는 글 끝까지 모두 그 응답의 본문이다
// (data/supabase-client.js — 응답 글 500자, 부르는 곳의 safeError 400자). 오류 글이 둘인 상세(가계부 만들기 보상 실패)는 오류 글마다 따로 가린 뒤 잇는다
// (rememberOpsEvent 의 errors). 5차 고침(V148:C-49)은 다음 머리까지를 본문으로 보고 글 끝의 ‘;trace=K…’·‘; latency_ms=N’ 꼴을 Worker 진단으로 남겨,
// 본문(막힌 행의 사용자 값)이 그 꼴로 끝나면 그 글이 남았고, 본문 JSON 값 안의 ‘Supabase 404: ’ 를 둘째 오류로 나눠 code·message 를 잃었다. 검사가
// src/modules 에서 오류 글(safeError) 뒤에 글이 붙는 곳이 없는지 본다.
const OPS_DB_HEAD_V229148 = /Supabase \d{3}: /;
function opsRedactDbErrorsV229148(text = "") {
  const source = String(text || "");
  const head = OPS_DB_HEAD_V229148.exec(source);
  if (!head) return source;
  return source.slice(0, head.index) + head[0] + opsDbErrorBodyV229148(source.slice(head.index + head[0].length));
}

// V22.9.148(Codex 4차 검토 — V148:C-42): 스킬 사건의 상세는 서버가 만든 요청 번호로 시작한다(‘request_id=<UUID>; …’ — kakao/skill-handler.js
// crypto.randomUUID). NLU 사건의 request_id 칸과 그 번호로 잇도록 맨 앞의 그 번호만 떼어 두고 나머지를 가린다. 앞 고침은 이것까지 ‘[사용자식별자]’ 로
// 가려 이을 수 없었다. 번호를 가리기 규칙들에 그대로 넘기면 마지막 열두 자가 모두 숫자인 번호(약 0.35%)를 아래 ‘긴 숫자’ 규칙이 지운다.
// 맨 앞이 아닌 자리의 UUID(오류 글이 옮긴 사용자·가계부 식별자, 사용자가 적은 글)는 그대로 가린다.
const OPS_SERVER_REQUEST_ID_V229148 = /^request_id=[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}; /i;
// V22.9.148(Codex 4차 검토 — V148:C-43): JSON.parse 가 옮겨 적은 글(V8 은 20자까지 그대로, 그보다 길면 10자와 ‘...’)은 V8 문구의 머리(‘Unexpected token '…', ’)와
// 함께 찾는다 — 앞 고침은 머리 없이도 받아, 바로 앞의 다른 따옴표 진단(‘kind="state_read"; ’)의 여는 따옴표부터 지웠다. 머리 없는 ‘"…" is not valid
// JSON’ 꼴은 V8 이 정해 둔 넷(undefined·NaN·Infinity·[object Object])에만 쓴다(사용자 글이 아니다). 첫 글자가 이모지면 V8 은 앞 반쪽 하나만 적는다.
const OPS_V8_QUOTED_V229148 = /Unexpected token '[\s\S]', (?:\.\.\.)?"[\s\S]{0,64}"(?:\.\.\.)? is not valid JSON/g;

function redactOpsDetail(value = "") {
  // V22.9.148(V148:C-33): 아래 값 지우기는 시작할 수 있는 자리마다 뒤를 훑으므로 먼저 1,000자로 자른다(따옴표만 4만 자인 글이 700ms 넘게 걸렸다).
  // 결과는 어차피 260자이고, 부르는 곳의 상세는 오류 글(safeError 400자)과 앞뒤 몇십 자다.
  const text = String(value || "").slice(0, 1000);
  const head = OPS_SERVER_REQUEST_ID_V229148.exec(text)?.[0] || "";
  // V22.9.148(Codex 5차 검토 — V148:C-48): JSON.parse 가 옮겨 적은 글을 DB 오류 글보다 먼저 뺀다 — 옮긴 글 안의 ‘Supabase 400: ’(백업 파일 내용 —
  // admin/backup-compare.js 의 backup_preview_failed)을 DB 가리기가 오류의 시작으로 보아 뒤를 잘라, 이 규칙이 기대는 ‘is not valid JSON’ 이 사라지고
  // 그 앞의 메모가 남았다. (DB 응답 본문 안의 같은 꼴은 따옴표가 \" 로 바뀌어 있어 이 규칙에 걸리지 않는다.)
  const rest = text.slice(head.length).replace(OPS_V8_QUOTED_V229148, "[JSON 이 아닌 글] is not valid JSON");
  return head + opsRedactDbErrorsV229148(rest)
    // V22.9.148(Codex 3차 검토를 고치며 찾음 — V148:C-33): 오류 글이 옮겨 적은 값을 뺀다. DB(PostgREST) 오류의 details 는 막힌 행 전체(‘Failing row contains
    // (…)’ — 카카오 기록이면 메모·원문이 든다)나 키 값(‘Key (…)=(…)’)이고, 형식·범위 오류의 message 는 받은 값(‘… for type uuid: "…"’·‘value "…" is out of
    // range …’)을, JSON.parse 오류는 읽던 글(‘…, "…" is not valid JSON’ — V8 은 20자까지 그대로, 그보다 길면 10자와 ‘...’)을 옮겨 적는다. 이 글은 관리자
    // /ops-snapshot.json 의 운영·스킬·트래픽 사건(카카오 저장 실패·처리 중 오류의 상세)과 최근 NLU 사건의 까닭에 실패 사례 저장 설정과 상관없이 남았다.
    // 상태·오류 번호·제약·열·표 이름은 남긴다. 받은 값은 오류 글 길이(500자) 안, JSON.parse 가 옮긴 글은 64자 안에서만 찾는다(되짚기를 묶고, 64자 넘게
    // 앞에 있는 다른 따옴표부터 지우지 않는다 — V8 은 많아야 21자를 옮긴다). 받은 값에는 줄 바꿈 문자(U+2028 — DB 의 JSON 은 그대로 둔다)도 들 수 있어 . 대신
    // [\s\S] 로 찾는다(아래 공백 줄이기가 그 문자를 빈칸으로 바꾼 뒤에는 값이 그대로 보였다).
    // DB 오류 글은 500자에서 잘려 오므로(data/supabase-client.js) 닫는 따옴표가 잘린 details·받은 값은 글 끝까지 뺀다(끝에 홀로 남은 \ 도).
    // (Codex 4차 검토 이후 ‘Supabase 상태: ’ 본문은 위 opsRedactDbErrorsV229148 가 먼저 구조로 읽는다. 아래 셋은 그 머리 없이 온 같은 꼴의 글을 위한 것이다.)
    .replace(/"details":"(?:[^"\\]|\\.)*\\?(?:"|$)/g, '"details":"[값 생략]"')
    // V22.9.148(Codex 4차 검토 — V148:C-35 / 5차 검토 — V148:C-54): 머리 없이 온 받은 값(‘… for type uuid: \"…’·‘value \"…’)은 끝을 증명할 수 없으므로
    // 그 자리부터 글 끝까지 뺀다. 4차 고침은 끝을 찾은 값만 그 끝에서 멈췄는데, 값 안의 ‘\" is out of range’ 를 끝으로 보아 그 뒤(‘ 진료비’)가 남았다.
    // (6차 검토 — V148:C-61: 끝의 ‘;trace=…’·‘; latency_ms=…’ 꼴도 남기지 않는다 — Worker 진단은 오류 글 앞에 온다.)
    .replace(/(: |value )\\"[\s\S]*$/, "$1[값 생략]")
    // (맨 앞의 서버 요청 번호는 위에서 떼어 두었다 — V148:C-42. 여기 오는 UUID 는 모두 가린다.)
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "[사용자식별자]")
    .replace(/\beyJ[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+){1,2}\b/g, "[토큰]")
    // V22.9.148(Codex 4차 검토를 고치며 찾음 — V148:C-47): 낱말을 묶지 않아 ‘$1’ 이 글자 그대로 남았고(‘$1=[보호됨]’), ‘authorization: Bearer …’ 는
    // 방식 낱말(Bearer)만 가리고 뒤의 값을 남겼다. 낱말을 묶어 남기고, 방식 낱말이 있으면 그 뒤의 값까지 가린다.
    .replace(/(password|access[_-]?code|secret|apikey|api[_-]?key|authorization)\s*[=:]\s*(?:(?:bearer|basic|token|kakaoak|kakaobk)\s+)?[^\s,;]+/gi, "$1=[보호됨]")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[이메일]")
    .replace(/\b01[016789][ -]?\d{3,4}[ -]?\d{4}\b/g, "[전화번호]")
    .replace(/([?&](?:code|token|key|secret|password)=)[^&\s]+/gi, "$1[보호됨]")
    .replace(/\b\d{10,}\b/g, "[긴숫자]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 260);
}

// V22.9.148: 답을 만든 곳이 관제 이름·결과를 직접 적는다. 답 글을 정규식으로 짐작하던 방식은 답 글이 바뀌면 말없이 틀어졌다 — V22.9.67 에
// 못 알아들은 답을 ‘무슨 뜻인지 이해하지 못했어요’ 로 바꾼 뒤로 그 답은 ‘ok’ 로 세어져, 관제가 못 알아들음을 셀 수 없었다.
// 표시는 요청마다 새로 만드는 env.__AB_KAKAO_REQUEST(worker/router.js)에만 둔다. 표지(signature) = 그 답의 첫 줄이고, 마지막 답에 표지가
// 그대로 있을 때만 쓴다(그 사이 다른 답으로 바뀌었으면 예전처럼 글로 읽는다). 남기는 것은 아래에 정해 둔 이름·결과·까닭 낱말뿐이다(글 없음).
const KAKAO_NLU_MARKS_V229148 = Object.freeze({
  greeting: Object.freeze({ intent: "GREETING", result: "ok", reason: "handled" }),
  no_match: Object.freeze({ intent: "NO_MATCH", result: "fallback", reason: "no_match" }),
  no_amount: Object.freeze({ intent: "NO_AMOUNT", result: "fallback", reason: "no_amount" }),
  button_label: Object.freeze({ intent: "BUTTON_LABEL", result: "fallback", reason: "button_label" }),
  hint: Object.freeze({ intent: "NO_MATCH", result: "clarify", reason: "guided_clarification" }),
  // 가계부가 없는 사람의 첫 안내는 기록이 아직 안 된 안내 단계다 — 성공(ok)이 아니라 되묻기(clarify)로 센다(독립 검토: 새 사람의 ‘커피 사먹음’ 이 ok 였다).
  first_contact: Object.freeze({ intent: "FIRST_CONTACT", result: "clarify", reason: "guided_clarification" }),
  // 저장한 답(새로 저장·중복 저장 안 함). 답에 사용자의 메모·원래 문장이 되풀이되므로 글로 읽지 않는다(아래 kakaoNluBotWordsV229148 도 같은 까닭).
  saved: Object.freeze({ intent: "TRANSACTION", result: "ok", reason: "handled" }),
  // V22.9.148(Codex 4차 검토): 사용자가 정한 값이 줄 맨 앞에 오거나 따옴표 없이 되풀이되는 답은 글의 꼴로 봇 말을 가를 수 없다 — 분류 이름이 ‘예: 점심’ 이면
  // 예산 물음(‘예: 점심 예산을 얼마로 설정할까요?’ — guided-flows.js)이 예시 줄로 빠져 ok 로 셌다(V148:C-40), 별도 구매 확인 답의 ‘분류 · 메모 · 결제수단’
  // 줄은 메모 ‘서버 오류 수리비’ 에 오류로 셌다(V148:C-46). 그런 답은 만든 곳이 결과를 적는다. 이 둘은 이름(intent)을 바꾸지 않는다(빈 이름 —
  // skill-handler.js metricIntent 는 빈 표시 이름을 건너뛴다).
  flow_question: Object.freeze({ intent: "", result: "clarify", reason: "guided_clarification" }),
  handled: Object.freeze({ intent: "", result: "ok", reason: "handled" }),
  // V22.9.148(6차 고침 중 찾은 것 — V148:C-73): 기록을 지우지 못한 답(저장소 거절·되돌릴 준비 실패)과 지웠는지 모르는 답은 저장 실패·결과 모름과 같이 센다
  // (kakao/edit-session-v4.js kakaoEditDeleteFailedReplyV229148). 앞 판들은 글에 ‘저장하지 못했어요’·‘저장 확인이 지연’ 이 없어 ok 로 셌다.
  delete_failed: Object.freeze({ intent: "", result: "error", reason: "save_failed" }),
  delete_uncertain: Object.freeze({ intent: "", result: "error", reason: "save_uncertain" }),
  // V22.9.148(Codex 7차 검토 — V148:C-77·C-78): 복구하지 못한 답(저장소가 넣기를 거절함·잠금이 겹쳐 처리하지 않음 = 저장 실패, 넣었는지 모르는 쓰기 = 결과 모름 —
  // kakao/edit-flow-v4.js kakaoRestoreFailedNluV229148)과 ‘방금’ 이 가리킬 기록을 정하려고 읽는 감사 기록을 읽지 못한 답(실패·늦음 = 처리 중 오류)도 만든 곳이
  // 적는다. 앞 판들은 글에 판정 낱말이 없어 ok 로 셌다(6차 고침은 ‘처리함’ 으로 적었다). 답 글은 그대로다.
  restore_failed: Object.freeze({ intent: "", result: "error", reason: "save_failed" }),
  restore_uncertain: Object.freeze({ intent: "", result: "error", reason: "save_uncertain" }),
  read_failed: Object.freeze({ intent: "", result: "error", reason: "safe_error_response" }),
});

function markKakaoNluOutcomeV229148(env, kind = "", replyText = "") {
  const mark = Object.hasOwn(KAKAO_NLU_MARKS_V229148, kind) ? KAKAO_NLU_MARKS_V229148[kind] : null;
  const request = env && typeof env === "object" ? env.__AB_KAKAO_REQUEST : null;
  const source = String(replyText || "");
  if (!mark || !request || typeof request !== "object" || !/\S/.test(source)) return;
  // V148:C-116·C-117(Codex 10차 검토): 표지는 보낼 글로 만든다 — 보내는 kakaoText 와 같은 다듬기(kakaoSafeText: CRLF → LF·앞뒤 공백 빼기·950자를 넘으면 자르기)를
  // 답마다 한 번 한 글. 9차 고침은 950자 안의 주소 없는 답을 다듬지 않아(‘다듬기는 줄이기만 한다’ 고 보았다), 웹 메모의 CRLF 가 든 기록의 단톡방 수정 창에서 단톡방 꼴
  // 첫 줄(번호 물음의 예시는 줄 끝을 본다 — ‘…번호를 보내주세요.\r’ 은 예시를 받지 않는다)이 보낸 첫 줄(CR 을 뺀 뒤 예시를 받음)과 달라 처리함을 오류로 셌다. 첫 줄은
  // 그 글(950자 안팎)에서 첫 줄 바꿈까지만 떼므로 원문 길이에 따라 늘지 않는다(9차 고침은 줄 바꿈 없는 30만 자 메모에서 원문 첫 줄 30만 자를 견줄 줄로 두었다).
  const sent = kakaoSafeText(source);
  // V148:C-104(Codex 9차 검토): 첫 줄만 떼어 낸다 — 긴 답 전체를 줄마다 나누지 않는다.
  const newline = sent.indexOf("\n");
  const signature = (newline < 0 ? sent : sent.slice(0, newline)).trim();
  if (!signature) return;
  // V22.9.148(Codex 7차 검토 — V148:C-76): 보내기 전에 글 속 주소는 링크 단추나 ‘(링크)’ 로 옮긴다(response-builders.js kakaoTextLinks — 1:1·단톡방 모두). 메모에
  // 주소가 든 기록 줄이 첫 줄인 답(수정 창 등)은 보낸 답에 그 첫 줄이 없어 표지를 놓치고 글로 읽어, 메모의 ‘서버 오류’ 로 정상 답을 오류로 셌다. 우리 주소인지는
  // 보낼 때의 주소(origin)로 정해지므로 주소가 든 답(kakaoTextLinks 가 옮기는 꼴과 같은 판정)은 보낼 글을 함께 두고, 견줄 때 보낼 때와 같은 함수로 첫 줄을 만든다
  // (kakaoNluMarkLinesV229148). 요청 표식은 그 요청의 메모리에만 있다(관제에 남기는 것은 이름·결과·까닭 낱말뿐).
  // V22.9.148(Codex 8차 리포트의 ‘확인 필요’ — V148:C-102): 보내기 전에 950자를 넘는 답은 줄 경계에서(없으면 낱말 경계·930자에서) 자른다(response-builders.js
  // kakaoSafeText). 첫 줄이 그보다 긴 답(웹에서 고친 메모 — 길이 제한이 없다 — 가 1,000자인 기록 줄이 첫 줄인 수정 창 등)은 보낸 답에 그 첫 줄이 없어 표지를
  // 놓치고 글로 읽어, 메모 속 ‘서버 오류’ 로 처리함을 오류로 셌다. 보낼 때 잘리는 답도 주소가 든 답처럼 보낼 글을 함께 두고 보낸 꼴의 첫 줄로 견준다.
  // V148:C-104(Codex 9차 검토): 8차 고침은 잘리는지 보려고 답 전체를 두 번 다듬고 답 전체를 표식에 두어 견줄 때 또 다듬었다(줄 바꿈이 CRLF 인 30만 자 메모의 수정 창에서
  // 표지 만들기 6.2 ms·견주기 2.3 ms — 7차는 2.7 ms·0.1 ms, 보내는 쪽 다듬기는 한 번 2.3 ms). 9차 고침은 950자 안의 주소 없는 답을 다듬지 않고 긴 답·주소 든 답만
  // 한 번 다듬어 그 글을 두었다 — 10차 고침(V148:C-116, 위)은 답마다 한 번 다듬은 글로 첫 줄을 만든다. 견줄 때는 둔 글에 주소 옮기기만 한다(줄인 글을 다시 줄이지
  // 않는다 — 930자에서 자른 글은 꼬리 글을 붙여 950자를 넘을 수 있다).
  // V148:C-116: 다듬은 글(sent)로 첫 줄을 만들므로 보낼 때 잘리는 답도 그 첫 줄이 곧 보낸 첫 줄이다 — 글을 둘 것은 보낼 때 주소를 옮기는 답(우리 주소인지는
  // 보낼 때의 주소로 정해진다)뿐이다. 단톡방 꼴 첫 줄도 그 글로 만든다.
  const sentText = /https?:\/\//i.test(sent) ? sent : null;
  // V22.9.148(Codex 6차 검토 — V148:C-65): 단톡방 답은 보내기 전에 줄마다 봇 부르기를 넣는다(response-builders.js kakaoGroupMentionLinesV229134 — 번호 물음은
  // 다음 줄을 보고 예시를 붙인다). 그 함수가 이 답 글로 만드는 첫 줄을 함께 둔다(단톡방 답만 그 줄로도 견준다 — kakaoNluMarkSeenV229148).
  let roomSignature = signature;
  try { roomSignature = kakaoGroupMentionLinesV229134(sent, Infinity).split("\n")[0].trim() || signature; } catch (err) {}
  request.nluMarkV229148 = { ...mark, kind, signature, roomSignature, ...(sentText !== null ? { sentText } : {}) };
}

function kakaoNluMarkV229148(env) {
  const request = env && typeof env === "object" ? env.__AB_KAKAO_REQUEST : null;
  const mark = request && typeof request === "object" ? request.nluMarkV229148 : null;
  return mark && typeof mark === "object" ? mark : null;
}

// V22.9.148: 답의 모든 말풍선 글을 읽는다. 예전에는 첫 말풍선의 simpleText 만 읽어, 단톡방 답(단추가 붙으면 카드로 바뀐다 — response-builders.js
// kakaoGroupCompatibleResponse·kakaoNextStepReply)은 저장 확인 지연·고치기 실패까지 늘 ‘ok’ 였고, 1:1 답의 둘째 말풍선도 읽지 않았다.
// 고를 수 있는 것 = 바로답 + 메시지 단추(단톡방은 바로답을 메시지 단추로 바꾼다). 링크·플러그인 단추는 세지 않는다.
// V22.9.148(Codex 검토): 카드 안의 머리말(carousel·listCard 의 header, itemCard 의 head)과 목록(items·itemList)도 읽는다 — 예전에는 carousel 의
// items 만 읽어 머리말의 ‘저장 확인이 지연되고 있어요.’ 가 빠졌다. 지금 답은 simpleText·textCard·basicCard 만 쓰지만, 단톡방이 받는 카드
// (response-builders.js KAKAO_GROUP_SUPPORTED_OUTPUTS — listCard·itemCard 포함)를 새로 쓰는 답이 생겨도 말없이 빠지지 않게 한다.
const KAKAO_NLU_OUTPUT_KINDS_V229148 = Object.freeze(["simpleText", "textCard", "basicCard", "commerceCard", "listCard", "itemCard", "carousel"]);
function kakaoNluResponsePartsV229148(body) {
  const template = body && typeof body === "object" && body.template && typeof body.template === "object" ? body.template : {};
  const texts = [];
  let choices = Array.isArray(template.quickReplies) ? template.quickReplies.length : 0;
  const read = (part, depth = 0) => {
    if (!part || typeof part !== "object" || depth > 3) return;
    for (const key of ["text", "title", "description"]) if (typeof part[key] === "string" && part[key]) texts.push(part[key]);
    if (Array.isArray(part.buttons)) choices += part.buttons.filter((button) => button && button.action === "message").length;
    for (const key of ["header", "head"]) read(part[key], depth + 1);
    for (const key of ["items", "itemList"]) if (Array.isArray(part[key])) part[key].forEach((item) => read(item, depth + 1));
  };
  for (const output of Array.isArray(template.outputs) ? template.outputs : []) {
    if (!output || typeof output !== "object") continue;
    for (const kind of KAKAO_NLU_OUTPUT_KINDS_V229148) read(output[kind]);
  }
  return { text: texts.join("\n"), choices };
}

// V22.9.148(독립 검토): 문구 판정은 봇이 쓴 말만 본다. 답에 되풀이된 사용자의 글 — 기록 줄의 메모(‘01번 - 서버 오류 수리비 / 30,000원 / …’,
// ‘• 2026-11-30 지출 4,500원 · 메모’), 이름 줄(‘가계부: 이름’)과 따옴표 안의 원래 문장 — 이 ‘서버.*오류’·‘잠시 후 다시’·‘어떤 ’ 에 걸려
// 정상 저장·목록이 오류·되묻기로 세어졌다(1:1 은 예전부터, 이 판이 카드를 읽으면서 단톡방까지). 봇의 실패·되묻기 문장은 그 밖에 있다.
// V22.9.148(Codex 검토): 줄마다 한 번씩만 본다 — 줄 전체를 덮는 정규식(^[^\n]*… 와 따옴표의 [^’\n]*)은 긴 줄을 여러 번 되짚었고, 따옴표는 안쪽
// 짝에서 멈췄다(‘모임 ‘개발’ 서버 오류 대응팀’ 의 뒤쪽이 남아 오류로 셈). 따옴표 짝은 단톡방 답이 봇 부르기를 넣을 때 쓰는 것과 같은 한 번의 훑기다
// (response-builders.js kakaoGroupQuotedSegmentsV229134 — 바깥쪽 짝까지).
// (6차 검토 — V148:C-63·C-64: 기록 줄 ‘… / 5,000원 / …’ 은 이제 글의 꼴로 가리지 않는다 — 아래 kakaoNluBotWordsV229148 의 설명.)
const KAKAO_NLU_RECENT_ROW_V229148 = /^• \d{4}-\d{2}-\d{2} (?:지출|수입) -?[\d,]+원 · /;
// 이름 줄(‘가계부: 이름’·‘📒 가계부: 이름’·‘지출자: 이름’·‘수입자: 이름’)도 사용자가 정한 이름뿐이다(가계부 이름 ‘서버 오류 대응팀’).
// V22.9.148(Codex 검토): 시작·도움말 카드의 ‘이 방 가계부: 이름’·‘지금 가계부: 이름’, 만들기 확인의 ‘가계부 이름: 이름’ 과 그 밖에 사용자가 정한 이름·메모·
// 분류를 한 줄에 적는 꼬리표(src/modules/kakao 의 답 글에서 모았다 — 그 꼬리표 뒤에 봇의 실패·되묻기 문장은 없다)도 뺀다.
const KAKAO_NLU_NAME_LABELS_V229148 = Object.freeze([
  "가계부", "이 방 가계부", "지금 가계부", "가계부 이름", "연결 가계부", "현재 선택 가계부", "현재 연결", "현재", "변경",
  "지출자", "수입자", "분류", "기록", "복구하려던 기록", "마지막에 바뀐 기록", "마지막에 저장한 기록",
  // V22.9.148(Codex 3차 검토): 예시 줄(‘예: …’)은 보낼 말의 본보기다 — 가계부 만들기의 이름 제안(‘예: (카카오 별명) 가계부’ — guided-flows.js)에 별명이
  // 들어, 별명이 ‘서버 오류 대응팀’ 이면 정상 안내가 오류로 셌다. 답 글의 ‘예: ’ 줄에는 봇의 실패·되묻기 낱말이 없다(검사가 답 글을 모두 훑어 본다).
  "예",
]);
const KAKAO_NLU_NAME_LINE_V229148 = new RegExp(`^(?:(?:📒|✅) )?(?:${KAKAO_NLU_NAME_LABELS_V229148.join("|")}): `);
// V22.9.148(Codex 2차 검토): 사용자가 정한 이름·분류가 목록 줄로 되풀이되는 답도 그 줄을 뺀다 — 가계부 고르기·내 가계부 목록
// (‘1. 이름 · 소유자’·‘1. 이름 · 소유자 · 초대코드 …’ — household-budget-commands.js kakaoHouseholdListLines·intent-nlu.js), 이번 달 요약의 상위 지출
// (‘1. 분류: 30,000원’ — transactions-core.js formatSummary), 예산 현황(‘• 분류: 30,000원 사용 / …’ — budgets.js), 기록 고치기의 고를 값
// (‘1. 식비  2. 카페’ — edit-flow-v4.js·edit-state-machine.js, 아래 알리는 줄 규칙). 가계부 이름 ‘서버 오류 대응팀’ 이 든 가계부 고르기가 오류로 셌다.
// 이 줄들에 봇의 실패·되묻기 문장은 없다.
// V22.9.148(Codex 3차 검토): 상위 지출·예산 현황 줄은 만드는 꼴 그대로 본다 — ‘원’ 뒤에 무엇이 와도 빼던 규칙은 분류 이름이 ‘1. 점심: 5000원’ 인
// 예산 물음(‘1. 점심: 5000원 예산을 얼마로 설정할까요?’ — guided-flows.js)까지 빼 되묻기를 ok 로 셌다.
// V22.9.148(Codex 4차 검토 — V148:C-39): 기간 요약의 수입 분류·카테고리·지출자 줄(‘• 이름: 30,000원’ — household-budget-commands.js kakaoDateSummaryParts)과
// 정산의 보내기 줄(‘• 보낼 사람 → 받을 사람: 30,000원’)·사람별 줄(‘• 이름: 낸 돈 60,000원 → 30,000원 받아요’ — simple-commands.js)도 만드는 꼴 그대로 뺀다.
// 3차 고침이 ‘원’ 뒤에 무엇이 와도 빼던 규칙을 좁히면서 이 줄들이 빠져, 지출자 이름 ‘서버 오류 대응팀’ 이면 정상 요약·정산이 오류로 셌다(사람별 줄은 고치며 더 찾음).
// V22.9.148(Codex 5차 검토 — V148:C-58): 이름 자리는 [^\n] 로 본다 — 줄은 \n 으로만 나누는데 . 은 U+2028·U+2029·\r 을 넘지 못해, 웹에서 만든 분류
// 이름 가운데의 U+2028(‘서버 오류<U+2028>수리’ — 이름은 양끝만 다듬는다)이 든 요약 줄이 남아 오류로 셌다.
const KAKAO_NLU_LIST_ROWS_V229148 = Object.freeze([
  /^\d{1,2}\. [^\n]* · (?:소유자|관리자|구성원|조회전용|승인대기|차단)(?: · |$)/,
  /^\d{1,2}\. [^\n]*: [\d,]+원$/,
  /^• [^\n]*: [\d,]+원 사용 \/ [\d,]+원 (?:남음|초과) · [\d.]+%$/,
  /^• [^\n]*: -?[\d,]+원$/,
  /^• [^\n]*: 낸 돈(?: [\d,]+원|보다 환불이 [\d,]+원 많아요) → (?:[\d,]+원 (?:받아요|보내요)|주고받을 돈 없어요)$/,
]);
// 목록을 알리는 줄 바로 다음부터 이어지는 번호 줄(‘1. ’)도 사용자가 정한 이름·값이다 — 기록 고치기의 고를 값(‘…번호로 골라주세요.’·‘분류를 번호로 골라
// 주세요.’·‘목록의 번호로 골라주세요.’ 다음의 ‘1. 서버팀  2. 오류왕’, 값이 하나면 ‘1. 오류왕’ 한 줄)과 참여 취소의 승인 대기 목록(‘승인 대기 중인 가계부가
// 2개예요.’ 다음의 ‘1. 이름’ — skill-handler.js). 번호 줄이 끊기면 다시 읽는다. 알리는 줄 다음에 오는 것은 그 목록뿐이다(모든 꼴을 훑어 확인).
const KAKAO_NLU_LIST_HEADS_V229148 = Object.freeze([
  /번호로 골라 ?주세요\.$/,
  /^승인 대기 중인 가계부가 \d+개예요\.$/,
]);
const KAKAO_NLU_LIST_ITEM_V229148 = /^\d{1,2}\. /;
// V22.9.148(Codex 3차 검토): 단톡방 답은 ‘…번호로 골라주세요.’ 끝에 번호 예시(‘ 예: @말해가계부 1’ — response-builders.js kakaoGroupNumberLineV229135)가
// 붙은 뒤 관제가 읽는다. 알리는 줄은 그 예시를 떼고 본다(예전에는 단톡방의 고를 값 줄이 남아 구성원 이름 ‘서버팀’·‘오류왕’ 에 오류로 셌다 — 1:1 은 ok).
// (다른 모듈의 상수라 묶음 파일의 순서와 상관없게 부를 때 읽는다.)
const kakaoNluListHeadV229148 = (line = "") => {
  const example = ` 예: ${KAKAO_GROUP_MENTION_V229134} 1`;
  const bare = line.endsWith(example) ? line.slice(0, -example.length) : line;
  return KAKAO_NLU_LIST_HEADS_V229148.some((head) => head.test(bare));
};
// V22.9.148(Codex 2차·3차 검토): 이름·메모 안의 짝 없는 따옴표. 공용 훑기(kakaoGroupQuotedSegmentsV229134)는 짝이 맞는 바깥 따옴표까지를 한 조각으로
// 보지만, 사용자 글 안에 짝 없는 따옴표가 있으면 답 글의 따옴표 하나가 짝을 잃는다. 답 글의 따옴표는 늘 짝이 맞으므로 관제에서만 방향별로 늘린다.
// - 짝 없는 여는 따옴표(가계부 이름 ‘서버 오류 ‘개발’, ‘모임 ‘분점’ 서버 오류 ‘개발’ → ‘이 방 가계부 ‘모임 ‘분점’ 서버 오류 ‘개발’에 참여했어요.’)는
//   그 뒤 같은 종류의 마지막 닫는 따옴표까지 — 2차 고침은 뒤의 첫 조각까지만 이어 이름 가운데의 ‘서버 오류’ 가 봇 말로 남았다(3차 검토). 실패 문장이
//   사용자 값 뒤에 오고 그 뒤에 또 따옴표가 있는 답 글은 없다(검사가 답 글을 모두 훑어 본다 — 있으면 그 실패 문장을 삼킨다).
// - 짝 없는 닫는 따옴표(이름 ‘개발’ 서버 오류’)는 그 앞 같은 종류의 가장 가까운 여는 따옴표부터 — 사이의 봇 문장(‘커피’ 기록은 처리하지 못했어요.
//   ‘택시’’ …)은 남는다.
// - 곧은 따옴표(' ")는 여닫는 글자가 같아 공용 훑기가 앞에서부터 둘씩 짝짓는다. 한 줄에 셋 이상이면 첫 따옴표부터 마지막 따옴표까지를 한 값으로 본다
//   (‘⚠️ 'O'서버 오류'Brien's'을 …’ — 답 글 줄은 곧은 따옴표를 한 값의 앞뒤에만 쓴다, 검사가 답 글을 모두 훑어 본다). V22.9.148(Codex 4차 검토 —
//   V148:C-41): 3차 고침은 홀수일 때 남는 마지막 둘만 이어, 따옴표가 여럿인 값(O'서버 오류'Brien's — 다섯)의 가운데 ‘서버 오류’ 가 봇 말로 남았다
//   (넷이면 둘씩 짝지어 가운데가 남았다).
// 단톡방에 보내는 글(봇 부르기)은 공용 훑기 그대로다. 줄 길이에 비례한다(한 번씩 훑는다).
function kakaoNluQuotedSegmentsV229148(text = "") {
  const spans = kakaoGroupQuotedSegmentsV229134(text).map(({ start, end }) => [start, end]);
  for (const [open, close] of [["‘", "’"], ["“", "”"]]) {
    const stack = [];
    let lastOpen = -1, lastClose = -1;
    for (let at = 0; at < text.length; at += 1) {
      if (text[at] === open) { stack.push(at); lastOpen = at; }
      else if (text[at] === close) {
        lastClose = at;
        if (stack.length) stack.pop();
        else if (lastOpen >= 0) spans.push([lastOpen, at + 1]);
      }
    }
    for (const at of stack) if (lastClose > at) spans.push([at, lastClose + 1]);
  }
  for (const mark of ["'", "\""]) {
    let count = 0, first = -1, last = -1;
    for (let at = 0; at < text.length; at += 1) if (text[at] === mark) { count += 1; if (first < 0) first = at; last = at; }
    if (count >= 3) spans.push([first, last + 1]);
  }
  spans.sort((a, b) => a[0] - b[0] || b[1] - a[1]);
  const out = [];
  for (const [start, end] of spans) {
    const before = out[out.length - 1];
    if (before && start < before.end) before.end = Math.max(before.end, end);
    else out.push({ start, end });
  }
  return out;
}
function kakaoNluWithoutQuotedV229148(line = "", segments = kakaoNluQuotedSegmentsV229148(line)) {
  if (!segments.length) return line;
  let out = "", at = 0;
  for (const segment of segments) { out += `${line.slice(at, segment.start)}‘’`; at = segment.end; }
  return out + line.slice(at);
}
// V22.9.148(Codex 4차 검토를 고치며 찾음 — V148:C-45): 줄의 꼴(이름 줄·목록 줄 — 기록 줄은 6차 검토부터 만든 곳이 적는다)은 따옴표 안을 뺀 뒤에 본다. 앞 고침은 꼴을 먼저 보아, 따옴표로
// 되풀이한 사용자 글이 기록 줄처럼 생기면(‘⚠️ '점심 / 5,000원 / 카드' 입력을 이해하지 못했어요.’ — edit-state-machine.js) 봇의 못 알아들음 문장까지
// 줄째 뺐다(ok 로 셈). 따옴표 안을 빼도 기록 줄·이름 줄·목록 줄의 꼴(번호·꼬리표·금액)은 그대로다.
// V22.9.148(Codex 6차 검토 — V148:C-63·C-64): 기록 줄(kakaoRowLabel ‘01번 - 메모 / 5,000원 / 결제수단 / 분류’·kakaoEditRecordLineV4 ‘기록: 메모 /
// 5,000원 / 날짜’)은 글의 꼴로 가리지 않는다. 그 줄을 내는 답은 만든 곳이 결과를 적는다(kakao/edit-flow-v4.js kakaoEditRowReplyV229148·sendKakaoEditReplyV4
// 의 nlu, 저장 답은 kakao/transaction-save.js kakaoSavedReplyV229148 — 검사가 src/modules 의 기록 줄을 모두 모아 그 길과 적는 결과를 대조한다). 5차 고침의
// 꼴 규칙(번호 붙은 줄 C-53·앞뒤 줄로 알아보는 번호 없는 줄 C-60·‘ / 금액 / ’ 줄)은 이름에 그 꼴이 든 되묻기(‘‘모임’ 01번 - “점심 / 5원 / 카드” ‘팀’으로
// 만들려면 … 입력해 주세요.’ — guided-flows.js)의 봇 말까지 줄째 뺐고(되묻기를 ok 로 셈), 웹에서 고친 메모의 줄 바꿈(‘서버 오류 수리⏎부품’ — 서버는 앞뒤
// 공백만 뺀다)은 꼴로 가를 수 없어 삭제 성공을 오류로 셌다.
function kakaoNluBotWordsV229148(text = "") {
  let listed = false;
  return String(text || "").split("\n").map((raw) => {
    const item = listed && KAKAO_NLU_LIST_ITEM_V229148.test(raw);
    listed = item || kakaoNluListHeadV229148(raw);
    if (item) return "";
    const line = kakaoNluWithoutQuotedV229148(raw);
    return KAKAO_NLU_RECENT_ROW_V229148.test(line) || KAKAO_NLU_NAME_LINE_V229148.test(line) || KAKAO_NLU_LIST_ROWS_V229148.some((row) => row.test(line))
      ? "" : line;
  }).join("\n");
}

// V22.9.148(Codex 검토): 표시는 그 첫 줄이 답의 한 줄 전체로 있을 때만 쓴다 — 예전에는 글 어디든 들어 있으면 썼다(바뀐 답의 메모에 앞 답의 첫 줄이
// 인용되기만 해도 표시가 먼저였다). 말풍선 사이·줄 사이의 경계는 그대로라 앞에 붙는 방 참여 안내 줄은 상관없다.
// V22.9.148(Codex 6차 검토 — V148:C-65): 1:1 답은 표지 그대로만 견주고, 단톡방 답은 그 답을 바꾸는 함수(response-builders.js kakaoGroupMentionLinesV229134
// — 봇 부르기·번호 예시를 넣는다)가 그 답 글로 만드는 첫 줄로도 견준다(표시를 적을 때 함께 둔 roomSignature). 5차 고침(V148:C-52)은 1:1·단톡방 모두 양쪽
// 줄의 ‘@말해가계부’ 를 지워 견주어, 1:1 의 저장 실패 답에 사용자가 적어 보낸 ‘예: @말해가계부 점심 예산을 얼마로 설정할까요?’ 줄이 묵은 표지(‘예: 점심
// 예산을 얼마로 설정할까요?’)와 같아져 실패를 되묻기로 셌다. 단톡방인지는 답을 바꾸는 곳과 같은 기준(botGroupKey — kakao/skill-handler.js)으로 넘겨받는다.
// 표지로 견줄 줄: 답의 첫 줄(signature), 단톡방이면 단톡방 꼴의 첫 줄(roomSignature)도 — 둘 다 보낼 글(kakaoText 의 글 다듬기 kakaoSafeText 를 한 글 — V148:C-116)로
// 만들었다. 주소가 든 답(sentText — V148:C-76·C-102·C-104·C-116 — 그 다듬은 글)은 보낸 꼴의 첫 줄도 더한다 — 1:1 은 그 글의 주소 옮기기(kakaoTextLinks), 단톡방은 그 뒤
// 봇 부르기 넣기(kakaoGroupMentionLinesV229134)까지(response-builders.js kakaoDirectLinkResponse·kakaoGroupCompatibleResponse 의 순서). 보낸 꼴을 만들지 못하면
// 예전처럼 앞의 두 줄로만 견준다.
function kakaoNluMarkLinesV229148(mark, { room = false, origin = "" } = {}) {
  const lines = [mark.signature];
  if (room && typeof mark.roomSignature === "string") lines.push(mark.roomSignature);
  if (typeof mark.sentText === "string" && mark.sentText) {
    try {
      const linked = kakaoTextLinks(mark.sentText, origin).text;
      lines.push(linked.split("\n")[0].trim());
      if (room) lines.push(kakaoGroupMentionLinesV229134(linked, Infinity).split("\n")[0].trim());
    } catch (err) {}
  }
  return lines.filter(Boolean);
}

function kakaoNluMarkSeenV229148(text = "", mark = null, { room = false, origin = "" } = {}) {
  if (!mark || typeof mark !== "object" || typeof mark.signature !== "string" || !mark.signature) return false;
  const expected = new Set(kakaoNluMarkLinesV229148(mark, { room, origin }));
  return String(text || "").split("\n").some((line) => expected.has(line.trim()));
}

function nluOutcomeFromKakaoResponse(responseText = "", mark = null, { room = false, origin = "" } = {}) {
  let text = "";
  let quickReplyCount = 0;
  try {
    const parts = kakaoNluResponsePartsV229148(JSON.parse(String(responseText || "{}")));
    text = parts.text;
    quickReplyCount = parts.choices;
  } catch (err) {
    text = String(responseText || "");
  }
  if (kakaoNluMarkSeenV229148(text, mark, { room, origin })) {
    return { result: mark.result, reason: mark.reason, text, quick_reply_count: quickReplyCount, marked: true };
  }
  const words = kakaoNluBotWordsV229148(text);
  // V22.9.148: 표시가 없는 길에서 나온 못 알아들음 답도 놓치지 않게 지금 문장(‘이해하지 못했어요’)을 함께 본다.
  if (/(정확히 이해하지 못했|이해하지 못했어요|아래 예시처럼 보내|원하는 내용을 찾지 못했|다시 보내주세요)/.test(words)) {
    return { result: "fallback", reason: "generic_fallback", text, quick_reply_count: quickReplyCount };
  }
  // V22.9.37(관제): 저장소가 거절한 저장("저장하지 못했어요")과 결과를 모르는 저장("저장 확인이 지연")은 관제에 "ok"로
  // 집계되고 있었다. 실패·불확실로 나눠 센다.
  // V22.9.148(V148:C-73): 기록을 지우지 못한 답·지웠는지 모르는 답도 같이 센다(표시가 없는 길 — 답을 만든 곳의 표시 delete_failed·delete_uncertain 과 같은 결과).
  if (/(저장하지 못했어요|기록되지 않았어요|기록을 지우지 않았어요)/.test(words)) {
    return { result: "error", reason: "save_failed", text, quick_reply_count: quickReplyCount };
  }
  if (/(저장 확인이 지연|삭제 결과를 확인하지 못했어요)/.test(words)) {
    return { result: "error", reason: "save_uncertain", text, quick_reply_count: quickReplyCount };
  }
  if (/(잠시 후 다시|처리 중 오류|서버.*오류|문제가 발생|처리하지 못했어요)/.test(words)) {
    return { result: "error", reason: "safe_error_response", text, quick_reply_count: quickReplyCount };
  }
  if (quickReplyCount > 0 && /(인가요|할까요|선택해|입력해 주세요|어떻게 처리|무엇을|어떤 )/.test(words)) {
    return { result: "clarify", reason: "guided_clarification", text, quick_reply_count: quickReplyCount };
  }
  return { result: "ok", reason: "handled", text, quick_reply_count: quickReplyCount };
}

function nluPercentile(values = [], p = 0.5) {
  const arr = values.map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!arr.length) return 0;
  const idx = Math.max(0, Math.min(arr.length - 1, Math.ceil(arr.length * p) - 1));
  return arr[idx];
}

function rememberNluRuntimeEvent(event = {}, env = {}) {
  try {
    const cfg = nluOpsConfig(env);
    const result = ["ok", "fallback", "clarify", "error"].includes(String(event.result || "")) ? String(event.result) : "error";
    const intent = String(event.intent || "UNKNOWN").slice(0, 80) || "UNKNOWN";
    const latencyMs = Math.max(0, Math.round(Number(event.latency_ms || 0)));
    const at = String(event.at || new Date().toISOString());
    const bucket = `${at.slice(0, 13)}:00:00.000Z`;
    const key = `${bucket}|${intent}|${result}`;
    const prev = AB_NLU_RUNTIME_METRICS.get(key) || { bucket_start: bucket, intent, result, request_count: 0, latency_sum_ms: 0, latency_max_ms: 0 };
    prev.request_count += 1;
    prev.latency_sum_ms += latencyMs;
    prev.latency_max_ms = Math.max(prev.latency_max_ms, latencyMs);
    AB_NLU_RUNTIME_METRICS.set(key, prev);
    while (AB_NLU_RUNTIME_METRICS.size > 1200) AB_NLU_RUNTIME_METRICS.delete(AB_NLU_RUNTIME_METRICS.keys().next().value);

    AB_NLU_RUNTIME_EVENTS.push({
      at,
      request_id: String(event.request_id || "").slice(0, 80),
      intent,
      confidence: Math.max(0, Math.min(1, Number(event.confidence || 0))),
      result,
      // V22.9.148(V148:C-33): 처리 중 오류의 까닭은 오류 글 그대로라(skill-handler.js 의 safeError) 운영 사건과 같이 가린다 — 정해 둔 까닭 이름은 그대로다.
      reason: redactOpsDetail(event.reason || "").slice(0, 100),
      latency_ms: latencyMs,
      block: String(event.block || "").slice(0, 100),
      version: String(event.version || APP_VERSION).slice(0, 100),
      // V22.9.148(Codex 검토): 실패 사례 저장(NLU_PERSIST_FAILURE_SAMPLES)이 꺼져 있으면 Worker 메모리의 최근 사건에도 문장을 남기지 않는다(운영은 꺼짐).
      // 예전에는 ok 가 아니면 가린 문장을 남겨 관리자 화면(/nlu-ops 의 최근 문제)에 보였다 — 이 판이 못 알아들음·금액 없음·첫 안내를 ok 밖으로 세면서
      // 문장이 남는 말이 늘었다(‘민지 병원 다녀옴’). 이름·결과·까닭과 문장 지문(sample_hash)은 그대로 남는다.
      sample: result === "ok" || !cfg.failure_samples_enabled ? "" : redactNluOpsSample(event.utterance || ""),
      sample_hash: nluOpsFingerprint(normalizeText(event.utterance || "")),
    });
    while (AB_NLU_RUNTIME_EVENTS.length > cfg.memory_event_limit) AB_NLU_RUNTIME_EVENTS.shift();
  } catch (err) {}
}

function getNluOpsSnapshot(env = {}) {
  const recent = AB_NLU_RUNTIME_EVENTS.slice().reverse();
  const latency = recent.map((e) => e.latency_ms).filter(Number.isFinite);
  const byResult = recent.reduce((acc, e) => { acc[e.result] = (acc[e.result] || 0) + 1; return acc; }, {});
  const byIntent = recent.reduce((acc, e) => { acc[e.intent] = (acc[e.intent] || 0) + 1; return acc; }, {});
  const total = recent.length;
  const successful = Number(byResult.ok || 0);
  const failureLike = Number(byResult.fallback || 0) + Number(byResult.clarify || 0) + Number(byResult.error || 0);
  return {
    generated_at: new Date().toISOString(),
    config: nluOpsConfig(env),
    total,
    successful,
    failure_like: failureLike,
    success_rate: total ? Math.round((successful / total) * 10000) / 100 : 0,
    fallback_rate: total ? Math.round((Number(byResult.fallback || 0) / total) * 10000) / 100 : 0,
    clarify_rate: total ? Math.round((Number(byResult.clarify || 0) / total) * 10000) / 100 : 0,
    error_rate: total ? Math.round((Number(byResult.error || 0) / total) * 10000) / 100 : 0,
    latency: { p50: nluPercentile(latency, 0.5), p95: nluPercentile(latency, 0.95), p99: nluPercentile(latency, 0.99), max: latency.length ? Math.max(...latency) : 0 },
    by_result: byResult,
    by_intent: byIntent,
    recent: recent.slice(0, 120),
    hourly: [...AB_NLU_RUNTIME_METRICS.values()].sort((a, b) => String(b.bucket_start).localeCompare(String(a.bucket_start))).slice(0, 240),
  };
}

async function persistNluMetricAggregate(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.aggregate_metrics_enabled || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const at = String(event.at || new Date().toISOString());
  const fields = nluDiagnosticFields(event);
  return supabase(env, "/rest/v1/rpc/record_nlu_metric", {
    method: "POST",
    body: JSON.stringify({
      p_bucket_start: `${at.slice(0, 13)}:00:00.000Z`,
      p_intent: fields.intent,
      p_result: fields.result,
      p_latency_ms: Math.max(0, Math.round(Number(event.latency_ms || 0))),
      p_version: APP_VERSION,
    }),
  });
}

async function persistNluFailureSample(env = {}, event = {}) {
  const cfg = nluOpsConfig(env);
  if (!cfg.failure_samples_enabled || !["fallback", "clarify", "error"].includes(String(event.result || ""))) return { skipped: true };
  if (Math.random() > cfg.failure_sample_rate || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  const fields = nluDiagnosticFields(event);
  return supabase(env, "/rest/v1/rpc/record_nlu_failure_sample", {
    method: "POST",
    body: JSON.stringify({
      p_sample_hash: nluOpsFingerprint(JSON.stringify(fields)),
      p_redacted_sample: null,
      p_intent: fields.intent,
      p_result: fields.result,
      p_reason: fields.reason,
      p_version: APP_VERSION,
    }),
  });
}

function scheduleNluOpsPersistence(ctx, env = {}, event = {}) {
  const job = Promise.allSettled([
    persistNluMetricAggregate(env, event),
    persistNluFailureSample(env, event),
  ]).then((results) => {
    for (const r of results) if (r.status === "rejected") rememberOpsEvent({ kind: "nlu_persist_error", severity: "warn", path: "/skill", method: "POST", detail: "diagnostic_storage_failed" });
  });
  if (ctx && typeof ctx.waitUntil === "function") ctx.waitUntil(job);
  else job.catch(() => {});
}

async function cleanupNluOpsRetention(env = {}) {
  const cfg = nluOpsConfig(env);
  if (!env.SUPABASE_URL || !env.SUPABASE_SERVICE_ROLE_KEY) return { skipped: true };
  if (cfg.retention_days === null) throw new Error("nlu_retention_days_invalid");
  const now = Date.now();
  if (!Number.isSafeInteger(now) || now < cfg.retention_days * 86400000 || !Number.isFinite(new Date(now).getTime())) throw new Error("nlu_retention_clock_invalid");
  const cutoff = new Date(now - cfg.retention_days * 86400000).toISOString();
  await supabase(env, `/rest/v1/nlu_failure_samples?last_seen=lt.${encodeURIComponent(cutoff)}`, { method: "DELETE", headers: { prefer: "return=minimal" } });
  return { ok: true, cutoff };
}

// V22.9.148(Codex 2차 검토): 오류·되묻기의 가린 문장도 실패 사례 저장(NLU_PERSIST_FAILURE_SAMPLES)이 켜졌을 때만 남긴다 — 최근 NLU 사건
// (rememberNluRuntimeEvent)과 같은 설정이다. 앞 고침은 그쪽만 막아, 설정이 꺼져 있어도 처리 중 오류(skill-handler.js 의 error)·짧은 말 되묻기(clarify)의
// 문장이 이 목록(관리자 /ops-snapshot.json 의 skill.recent·스킬 운영 화면)에 남았다. env 를 받지 않은 부름은 꺼진 것으로 본다.
function rememberSkillEvent(event = {}, env = {}) {
  try {
    const kind = String(event.kind || "info").slice(0, 40);
    const keepRedactedSample = ["bad_json", "error", "clarify"].includes(kind) && nluOpsConfig(env).failure_samples_enabled;
    AB_SKILL_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      user_key: event.user_key ? nluOpsFingerprint(String(event.user_key)) : "",
      utterance: keepRedactedSample ? redactNluOpsSample(event.utterance || "").slice(0, 120) : "",
      // V22.9.148(V148:C-42): 맨 앞 요청 번호를 남기며 머리가 28자 길어졌다(‘[사용자식별자]’ 8자 → UUID 36자). 오류 글·latency_ms 몫이 줄지 않게 그만큼 늘린다.
      detail: redactOpsDetail(event.detail || "").slice(0, 268),
    });
    while (AB_SKILL_EVENTS.length > 120) AB_SKILL_EVENTS.shift();
  } catch (err) {}
}

function getSkillOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_SKILL_RATE_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_SKILL_RATE_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_SKILL_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function boundedRuntimeNumber(value, fallback, min, max) {
  const parsed = Number(value);
  const safe = Number.isFinite(parsed) ? parsed : Number(fallback);
  return Math.max(min, Math.min(max, safe));
}

function pruneRateBucketMap(map, now, windowMs, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, bucket] of map.entries()) {
    if (!bucket || now - Number(bucket.windowStart || 0) > windowMs * 2) map.delete(key);
  }
  while (map.size > maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneExpiringMap(map, now = Date.now(), maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, value] of map.entries()) {
    if (!value || Number(value.expires_at || 0) <= now) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function pruneTimestampMap(map, now = Date.now(), maxAgeMs = 10 * 60 * 1000, maxEntries = 6000) {
  if (!(map instanceof Map) || map.size < maxEntries) return;
  for (const [key, timestamp] of map.entries()) {
    if (!timestamp || now - Number(timestamp) > maxAgeMs) map.delete(key);
  }
  while (map.size >= maxEntries) {
    const oldest = map.keys().next();
    if (oldest.done) break;
    map.delete(oldest.value);
  }
}

function checkSkillRateLimit(userKey = "", env = {}) {
  const key = String(userKey || "anonymous").slice(0, 120);
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000);
  const limit = boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000);
  pruneRateBucketMap(AB_SKILL_RATE_BUCKETS, now, windowMs);
  let bucket = AB_SKILL_RATE_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) {
    bucket = { windowStart: now, count: 0 };
  }
  bucket.count += 1;
  AB_SKILL_RATE_BUCKETS.set(key, bucket);
  const resetInMs = Math.max(0, windowMs - (now - bucket.windowStart));
  return { ok: bucket.count <= limit, count: bucket.count, limit, resetInMs };
}

const AB_TRAFFIC_BUCKETS = globalThis.__AB_TRAFFIC_BUCKETS || (globalThis.__AB_TRAFFIC_BUCKETS = new Map());
const AB_TRAFFIC_EVENTS = globalThis.__AB_TRAFFIC_EVENTS || (globalThis.__AB_TRAFFIC_EVENTS = []);
const AB_OPS_EVENTS = globalThis.__AB_OPS_EVENTS || (globalThis.__AB_OPS_EVENTS = []);
const AB_DUPLICATE_EVENTS = globalThis.__AB_DUPLICATE_EVENTS || (globalThis.__AB_DUPLICATE_EVENTS = []);
const AB_KAKAO_REPEAT_GUARD = globalThis.__AB_KAKAO_REPEAT_GUARD || (globalThis.__AB_KAKAO_REPEAT_GUARD = new Map());
const AB_KAKAO_INFLIGHT = globalThis.__AB_KAKAO_INFLIGHT || (globalThis.__AB_KAKAO_INFLIGHT = new Map());

// V22.9.118 재검토 P3: 남긴 항목을 돌려준다(약관 안내 빠짐 이벤트가 같은 요청 안에서 이유를 고쳐 쓸 때만 쓴다 — 다른 호출은 반환값을 쓰지 않는다). 실패하면 null.
// V22.9.148(Codex 6차 검토 — V148:C-61): 오류 글이 둘 이상인 사건(가계부 만들기 보상 실패 — data/users-household-create.js)은 errors 에 [이름, 오류 글]
// 로 따로 받아, 오류 글마다 따로 가린 뒤 ‘ 이름=’ 으로 잇는다. 한 글로 이으면 가리기가 둘째 오류 글이 어디서 시작하는지 짐작해야 했다(사용자 값 안의
// ‘Supabase 404: ’ 를 경계로 보았다). 이름은 부르는 곳이 정한 영문 소문자 낱말만 받는다. 상세 260자는 남은 몫을 남은 오류 글 수로 나눠 쓴다(앞 글이 덜
// 쓴 몫은 뒤 글이 쓴다).
function opsDetailWithErrorsV229148(detail = "", errors = []) {
  let out = redactOpsDetail(detail);
  const list = (Array.isArray(errors) ? errors : []).filter((pair) => Array.isArray(pair) && /^[a-z_]{1,20}$/.test(String(pair[0] ?? "")));
  list.forEach(([name, error], index) => {
    const lead = `${out ? " " : ""}${name}=`;
    const share = Math.floor((260 - out.length) / (list.length - index)) - lead.length;
    if (share > 0) out += lead + redactOpsDetail(error ?? "").slice(0, share);
  });
  return out.slice(0, 260);
}

function rememberOpsEvent(event = {}) {
  try {
    const entry = {
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      severity: String(event.severity || "info").slice(0, 20),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      label: String(event.label || "").slice(0, 80),
      detail: event.errors ? opsDetailWithErrorsV229148(event.detail || "", event.errors) : redactOpsDetail(event.detail || ""),
    };
    AB_OPS_EVENTS.push(entry);
    while (AB_OPS_EVENTS.length > 220) AB_OPS_EVENTS.shift();
    return entry;
  } catch (err) { return null; }
}

function getOpsEventsSnapshot() {
  const recent = AB_OPS_EVENTS.slice(-120).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  const bySeverity = recent.reduce((acc, e) => {
    acc[e.severity] = (acc[e.severity] || 0) + 1;
    return acc;
  }, {});
  const lastError = recent.find((e) => e.severity === "error" || e.kind === "server_error" || e.kind === "route_error") || null;
  return { recent, byKind, bySeverity, lastError };
}

function rememberDuplicateEvent(event = {}) {
  try {
    const kind = String(event.kind || "duplicate_guard").slice(0, 40);
    // V22.9.148(Codex 4차 검토 — V148:C-38): 중복으로 건너뛴 기록(카카오 kakao/transaction-save.js·웹 domain/transactions-core.js)의 상세는 그 기록의
    // 메모·원래 문장이었다 — 가린 꼴(redactNluOpsSample — 전화·이메일·긴 숫자만)이라 ‘시험 병원 진료비’ 가 실패 사례 저장 설정과 상관없이 관리자
    // /ops-snapshot.json 의 duplicates.recent 와 운영 사건(duplicate_skipped)에 남았다.
    // V22.9.148(Codex 5차 검토 — V148:C-51): 메모의 지문도 남기지 않는다 — 4차 고침이 남긴 text_hash 는 열쇠 없는 32비트 FNV-1a 라, 스냅샷을 읽는 사람이
    // ‘커피’·‘약국’ 처럼 후보가 적은 메모를 같은 함수에 넣어 맞춰 볼 수 있었고 다른 가계부의 같은 메모끼리 견줄 수 있었다. 중복인지는 이미 정한 뒤라
    // 상세는 비운다(운영 사건의 상세는 예전처럼 출처·날짜·금액). 한꺼번에 보낸 줄 수 제한(bulk_limited)의 상세는 이 코드가 만든 숫자 글이라 그대로다.
    // (되풀이 막기 kakao_repeat 의 utterance_hash 와 NLU 사건의 sample_hash 는 예전부터 같은 꼴의 문장 지문이다 — 추적표 V148:C-59, 결정 필요.)
    const detail = kind === "kakao_repeat"
      ? `utterance_hash=${nluOpsFingerprint(normalizeText(event.detail || ""))}`
      : kind === "bulk_limited" ? redactNluOpsSample(String(event.detail || "")).slice(0, 220) : "";
    AB_DUPLICATE_EVENTS.push({
      at: new Date().toISOString(),
      kind,
      source: String(event.source || "").slice(0, 40),
      household_id: event.household_id ? nluOpsFingerprint(String(event.household_id)) : "",
      user_id: event.user_id ? nluOpsFingerprint(String(event.user_id)) : "",
      amount: Number(event.amount || 0) || 0,
      transaction_date: String(event.transaction_date || "").slice(0, 20),
      detail,
    });
    while (AB_DUPLICATE_EVENTS.length > 180) AB_DUPLICATE_EVENTS.shift();
    if (["duplicate_skipped", "bulk_limited", "kakao_repeat"].includes(kind)) {
      rememberOpsEvent({ kind, severity: "warn", path: event.path || "", method: event.method || "", detail: detail || `${event.source || ""} ${event.transaction_date || ""} ${event.amount || ""}` });
    }
  } catch (err) {}
}

function getDuplicateOpsSnapshot() {
  const recent = AB_DUPLICATE_EVENTS.slice(-90).reverse();
  const byKind = recent.reduce((acc, e) => { acc[e.kind] = (acc[e.kind] || 0) + 1; return acc; }, {});
  const bySource = recent.reduce((acc, e) => { acc[e.source || "unknown"] = (acc[e.source || "unknown"] || 0) + 1; return acc; }, {});
  return { recent, byKind, bySource };
}

function duplicateGuardSeconds(env = {}, source = "") {
  const src = String(source || "");
  if (src === "kakao_skill") return boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600);
  if (src === "my_import") return 0;
  return boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600);
}

function isDuplicateGuardSource(source = "") {
  const s = String(source || "");
  return ["my_web", "web_user", "ledger_live", "api", "kakao_skill", "web_admin"].includes(s);
}

function isDatabaseBusyError(err) {
  const m = String(err?.message || err || "").toLowerCase();
  return /supabase|fetch|network|timeout|timed|gateway|503|502|504|failed|database|connection/.test(m);
}

function userSafeErrorCode(err) {
  if (isUncertainStorageWrite(err)) return "db_write_unknown";
  if (isDatabaseBusyError(err)) return "db_delay";
  const raw = safeError(err);
  if (/spender_not_member|transaction_spender_not_member/i.test(raw)) return "spender_not_member";
  if (/amount_required|invalid_amount/i.test(raw)) return "amount_required";
  if (/record_not_found|transaction_not_found/i.test(raw)) return "record_not_found";
  return "save_failed";
}

function duplicateSkippedReturnLocation(month, householdId, extra = {}) {
  return myReturnLocation(month, householdId, { msg: "duplicate_skipped", ...extra });
}

function getOperationIntegritySnapshot() {
  return {
    profile: "atomic-dedup-and-cron-lease",
    migration: "schema_v22_6_8_operations_integrity.sql",
    database_lock_rpc_required: true,
    active_memory_fallback_leases: 0,
  };
}

function buildOpsSnapshot(env = {}) {
  const traffic = getTrafficOpsSnapshot();
  const skill = getSkillOpsSnapshot();
  const events = getOpsEventsSnapshot();
  const duplicates = getDuplicateOpsSnapshot();
  return {
    app_version: APP_VERSION,
    app_mode: APP_MODE,
    generated_at: new Date().toISOString(),
    traffic,
    skill,
    events,
    duplicates,
    operation_integrity: getOperationIntegritySnapshot(),
    nlu: getNluOpsSnapshot(env),
    limits: {
      traffic_guard_limit: boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000),
      traffic_guard_window_ms: boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000),
      skill_rate_limit: boundedRuntimeNumber(env.SKILL_RATE_LIMIT, 60, 10, 10000),
      skill_rate_window_ms: boundedRuntimeNumber(env.SKILL_RATE_WINDOW_MS, 60000, 10000, 600000),
      duplicate_guard_seconds: boundedRuntimeNumber(env.DUPLICATE_GUARD_SECONDS, 90, 10, 3600),
      kakao_retry_dedup_seconds: boundedRuntimeNumber(env.KAKAO_RETRY_DEDUP_SECONDS, KAKAO_RETRY_DEDUP_SECONDS || 120, 10, 3600),
      kakao_repeat_guard_seconds: boundedRuntimeNumber(env.KAKAO_REPEAT_GUARD_SECONDS, 8, 2, 600),
      my_import_limit: boundedRuntimeNumber(env.MY_IMPORT_LIMIT, 120, 10, 1000),
      kakao_bulk_limit: boundedRuntimeNumber(env.KAKAO_BULK_LIMIT, 25, 1, 80),
    },
  };
}

function rememberTrafficEvent(event = {}) {
  try {
    AB_TRAFFIC_EVENTS.push({
      at: new Date().toISOString(),
      kind: String(event.kind || "info").slice(0, 40),
      path: String(event.path || "").slice(0, 120),
      method: String(event.method || "").slice(0, 12),
      key: event.key ? nluOpsFingerprint(String(event.key || "")) : "",
      detail: redactOpsDetail(event.detail || "").slice(0, 220),
    });
    while (AB_TRAFFIC_EVENTS.length > 160) AB_TRAFFIC_EVENTS.shift();
    if (String(event.kind || "") === "limited") rememberOpsEvent({ kind: "rate_limited", severity: "warn", path: event.path, method: event.method, detail: event.detail });
  } catch (err) {}
}

function trafficClientKey(request) {
  try {
    const ip = request.headers.get("cf-connecting-ip") || request.headers.get("x-forwarded-for") || "unknown";
    const ua = request.headers.get("user-agent") || "";
    return `${String(ip).split(",")[0].trim()}|${String(ua).slice(0, 32)}`.slice(0, 120);
  } catch (err) {
    return "unknown";
  }
}

// KAKAO_SKILL_SECRET을 설정하기 전에는 /skill 요청 본문의 botUserKey를 신원으로
// 사용하므로 값을 바꿔가며 사용자별 제한을 우회할 수 있다. 그룹 챗봇의 정상 유입을
// 막지 않도록 높은 IP 상한을 함께 두고, 운영에서는 OpenBuilder 헤더 인증을 켠다.
function skillIpGuardLimit(env = {}) {
  return boundedRuntimeNumber(env.SKILL_IP_GUARD_LIMIT, 3000, 60, 100000);
}

function isTrafficGuardedPath(path = "", method = "GET") {
  const m = String(method || "GET").toUpperCase();
  const p = String(path || "");
  if (p === "/skill") return m === "POST";
  if (!["POST", "PATCH", "DELETE"].includes(m)) return false;
  return p === "/login" || p === "/my/local-login" || p === "/my/local-signup"
    || p.startsWith("/my/") || p.startsWith("/api/") || p.startsWith("/admin/") || p.startsWith("/backup/") || p.startsWith("/cron/");
}

function checkTrafficGuard(request, env, url) {
  const method = request.method || "GET";
  if (!isTrafficGuardedPath(url?.pathname || "", method)) return { ok: true, skipped: true };
  const now = Date.now();
  const windowMs = boundedRuntimeNumber(env.TRAFFIC_GUARD_WINDOW_MS, 60000, 10000, 600000);
  const authPath = ["/login", "/my/local-login", "/my/local-signup"].includes(String(url?.pathname || ""));
  const skillPath = String(url?.pathname || "") === "/skill";
  const limit = authPath
    ? boundedRuntimeNumber(env.AUTH_RATE_LIMIT, 8, 3, 30)
    : skillPath
      ? skillIpGuardLimit(env)
      : boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000);
  const key = `${trafficClientKey(request)}|${String(url?.pathname || "").slice(0, 60)}`;
  pruneRateBucketMap(AB_TRAFFIC_BUCKETS, now, windowMs);
  let bucket = AB_TRAFFIC_BUCKETS.get(key);
  if (!bucket || now - Number(bucket.windowStart || 0) > windowMs) bucket = { windowStart: now, count: 0 };
  bucket.count += 1;
  AB_TRAFFIC_BUCKETS.set(key, bucket);
  const ok = bucket.count <= limit;
  if (!ok) rememberTrafficEvent({ kind: "limited", path: url?.pathname || "", method, key, detail: `${bucket.count}/${limit}` });
  return { ok, count: bucket.count, limit, resetInMs: Math.max(0, windowMs - (now - bucket.windowStart)), key };
}

function httpOriginFromHeader(value = "") {
  const raw = String(value || "").trim();
  if (!raw || raw.toLowerCase() === "null") return "";
  try {
    const parsed = new URL(raw);
    return ["http:", "https:"].includes(parsed.protocol) ? parsed.origin : "";
  } catch (err) {
    return "";
  }
}

function hasBrowserSessionCookie(request) {
  try { return !!(getCookie(request, "ab_user") || getCookie(request, "ab_admin")); }
  catch (err) { return false; }
}

function isTrustedKakaoTransitionUrl(value = "") {
  try {
    const host = new URL(String(value || "")).hostname.toLowerCase();
    return host === "kakao.com" || host.endsWith(".kakao.com");
  } catch (err) {
    return false;
  }
}

function csrfSignalSummary(request, url) {
  const expected = String(url?.origin || "");
  const originRaw = String(request?.headers?.get("origin") || "").trim();
  const refererRaw = String(request?.headers?.get("referer") || "").trim();
  const origin = httpOriginFromHeader(originRaw);
  const referer = httpOriginFromHeader(refererRaw);
  const classify = (raw, parsed) => !raw ? "missing" : parsed ? (parsed === expected ? "same" : "different") : "opaque";
  return `fetch_site=${String(request?.headers?.get("sec-fetch-site") || "missing").slice(0, 20)};origin=${classify(originRaw, origin)};referer=${classify(refererRaw, referer)};session=${hasBrowserSessionCookie(request) ? "present" : "missing"}`;
}

function csrfOriginAllowed(request, url) {
  const method = String(request?.method || "GET").toUpperCase();
  if (!["POST", "PATCH", "PUT", "DELETE"].includes(method)) return true;
  const path = String(url?.pathname || "");
  if (path === "/skill" || path.startsWith("/cron/")) return true;
  if (/^Bearer\s+\S+/i.test(String(request.headers.get("authorization") || ""))) return true;
  const fetchSite = String(request.headers.get("sec-fetch-site") || "").toLowerCase();
  if (fetchSite === "cross-site") return false;
  const expectedOrigin = String(url?.origin || "");
  const originRaw = String(request.headers.get("origin") || "").trim();
  const origin = httpOriginFromHeader(originRaw);

  // A concrete HTTP(S) Origin is the strongest browser signal. A real mismatch
  // remains blocked even when a WebView reports a confusing Referer.
  if (origin) return origin === expectedOrigin;
  if (originRaw && originRaw.toLowerCase() !== "null") return false;

  // Kakao and a few mobile WebViews can preserve an opaque/app Referer or
  // `Origin: null` after OAuth. Fetch Metadata still identifies a same-site
  // form submission, so do not reject that legitimate request.
  if (["same-origin", "same-site", "none"].includes(fetchSite)) return true;

  const refererRaw = String(request.headers.get("referer") || "").trim();
  const refererOrigin = httpOriginFromHeader(refererRaw);
  if (refererOrigin) {
    if (refererOrigin === expectedOrigin) return true;
    if (originRaw.toLowerCase() === "null" && hasBrowserSessionCookie(request) && isTrustedKakaoTransitionUrl(refererRaw)) return true;
    return false;
  }

  // Older WebViews sometimes omit Fetch Metadata and expose only an opaque
  // app referrer. Accept that case only for an already authenticated browser.
  if ((originRaw || refererRaw) && !hasBrowserSessionCookie(request)) return false;
  return true;
}

function csrfRejectedResponse(url, request = null) {
  if (String(url?.pathname || "").startsWith("/api/") || wantsTransactionDeleteJson(request)) {
    return jsonResponse({ ok: false, error: "cross_site_request_blocked", reason: "cross_site_request_blocked", message: "보안 확인에 실패했습니다. 화면을 새로고침한 뒤 다시 시도해 주세요." }, 403);
  }
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>요청을 확인할 수 없습니다</title></head><body><main style="max-width:680px;margin:48px auto;padding:20px;font-family:system-ui,sans-serif"><h1>요청을 안전하게 차단했습니다.</h1><p>다른 사이트에서 전송된 변경 요청으로 확인됐습니다. 가계부 화면을 새로 열어 다시 시도해주세요.</p><p><a href="/my">내 가계부로 이동</a></p></main></body></html>`, 403);
}

function getTrafficOpsSnapshot() {
  const now = Date.now();
  let activeBuckets = 0;
  for (const [k, v] of AB_TRAFFIC_BUCKETS.entries()) {
    if (!v || now - Number(v.windowStart || 0) > 10 * 60 * 1000) AB_TRAFFIC_BUCKETS.delete(k);
    else activeBuckets++;
  }
  const recent = AB_TRAFFIC_EVENTS.slice(-80).reverse();
  const byKind = recent.reduce((acc, e) => {
    acc[e.kind] = (acc[e.kind] || 0) + 1;
    return acc;
  }, {});
  return { activeBuckets, recent, byKind };
}

function trafficLimitedResponse(url, request, result = {}, env = {}) {
  const retry = Math.max(1, Math.ceil(Number(result.resetInMs || 0) / 1000));
  if (url?.pathname === "/skill") return rateLimitedKakaoText(publicBaseUrl(env, url));
  if (String(url?.pathname || "").startsWith("/api/") || wantsTransactionDeleteJson(request)) return jsonResponse({ ok: false, error: "rate_limited", reason: "rate_limited", message: "요청이 너무 잦아요. 잠시 후 다시 시도해 주세요.", retry_after_seconds: retry }, 429);
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>요청이 잠시 제한되었어요</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:720px;margin:38px auto;padding:18px}.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;box-shadow:0 18px 44px rgba(15,23,42,.08)}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.muted{color:#64748b;line-height:1.6}</style></head><body><main class="wrap"><section class="card"><h1>잠시 후 다시 시도해주세요</h1><p class="muted">짧은 시간에 저장·수정 요청이 많아 데이터 중복을 막기 위해 잠깐 제한했습니다. 약 ${retry}초 뒤 다시 시도해주세요.</p><a class="btn" href="/my">내 가계부로 이동</a></section></main></body></html>`, 429, { "retry-after": String(retry) });
}

// V22.9.88(Y-7): 라우터의 요청 제한(trafficLimitedResponse)에서는 이 답이 응답 마무리 함수(kakaoGroupCompatibleResponse)를 거치지 않고
// 바로 나간다. 그래서 글에 주소를 넣지 않고 웹 가계부는 링크 버튼으로 단다(단톡방·1:1 모두 쓰는 글 카드, 바로가기 없음).
function rateLimitedKakaoText(origin = "") {
  const text = [
    "잠시만요 😊",
    "",
    "짧은 시간에 요청이 많아서 잠깐 쉬었다가 처리할게요.",
    "같은 내용을 여러 번 보내면 중복될 수 있어요.",
    "",
    "잠시 후 아래처럼 다시 보내주세요.",
    "• 요약",
    "• 오늘 기록 보기",
    "• 남은 예산",
  ].join("\n");
  if (!origin) return kakaoText(text);
  return jsonResponse({
    version: "2.0",
    template: { outputs: [{ textCard: { description: text, buttons: [{ label: "가계부 확인", action: "webLink", webLinkUrl: `${origin}/my` }], buttonLayout: "vertical" } }] },
  }, 200);
}
// @build:exports-start
export {
  AB_KAKAO_INFLIGHT, AB_KAKAO_REPEAT_GUARD, boundedRuntimeNumber, buildOpsSnapshot,
  checkSkillRateLimit, checkTrafficGuard, cleanupNluOpsRetention, csrfOriginAllowed,
  csrfRejectedResponse, csrfSignalSummary, duplicateGuardSeconds, duplicateSkippedReturnLocation,
  getNluOpsSnapshot, getSkillOpsSnapshot, getTrafficOpsSnapshot, isDatabaseBusyError,
  isDuplicateGuardSource, kakaoNluMarkV229148, markKakaoNluOutcomeV229148, nluOpsConfig,
  nluOutcomeFromKakaoResponse, pruneExpiringMap, pruneTimestampMap, rateLimitedKakaoText,
  rememberDuplicateEvent, rememberNluRuntimeEvent, rememberOpsEvent, rememberSkillEvent,
  scheduleNluOpsPersistence, skillIpGuardLimit, trafficClientKey, trafficLimitedResponse,
  userSafeErrorCode,
};
// @build:exports-end
