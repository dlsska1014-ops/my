// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { moneyTokenSpans, quickInputDate } from "../client/shared-input-parsers.js";
import { inputPaymentPatterns } from "../client/shared-input-nlu.js";
import { safeError } from "../runtime/leases.js";
import { jsonResponse, redirectResponse } from "../runtime/http.js";
import { sha256Hex, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchAdminRows, fetchHouseholdMembers } from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { csvCell } from "../admin/import-history-rollback.js";
import {
  myImportDeterministicTransactionId, reconcileImportedTransactionIds,
} from "../my/backup-import.js";
import { activeSpenderExists } from "../my/transactions.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { readJson } from "../api/admin-api.js";
import { supabase } from "../data/supabase-client.js";
import { parseTransaction } from "../nlu/transaction-parser.js";
import { detectType, normalizeText, withNormalizeTextScope } from "../nlu/amount-parser.js";
import {
  currentMonthKst, detectPaymentMethod, formatDate, nowKstDate, parseDateStrict, safeYmd,
  validMonth, withKstNowScope,
} from "../nlu/date-payment.js";
import { cleanMemo, inferCategory } from "../nlu/category-rules.js";
import { numberWithCommas } from "../domain/transactions-core.js";
import { parseStrictAmount, parseStrictDate } from "../domain/strict-input.js";
// @build:imports-end

async function handleImportTemplateCsv(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const header = ["날짜","구분","금액","분류","내용","결제수단","지출자"];
  const rows = [
    ["2026-06-18","지출","12000","식비","점심","카드",""],
    ["2026-06-18","지출","4500","카페/간식","커피","카카오페이",""],
    ["2026-06-25","수입","3000000","급여","월급","계좌이체",""],
  ];
  const csv = [header, ...rows].map(r => r.map(csvCell).join(",")).join("\n");
  return new Response("\ufeff" + csv, {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accountbook_import_template.csv"`,
      "cache-control": "no-store",
    },
  });
}

async function handleImportTemplateXls(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const html = `<!doctype html><html><head><meta charset="utf-8"></head><body><table border="1"><thead><tr><th>날짜</th><th>구분</th><th>금액</th><th>분류</th><th>내용</th><th>결제수단</th><th>지출자</th></tr></thead><tbody><tr><td>2026-06-18</td><td>지출</td><td>12000</td><td>식비</td><td>점심</td><td>카드</td><td></td></tr><tr><td>2026-06-18</td><td>지출</td><td>4500</td><td>카페/간식</td><td>커피</td><td>카카오페이</td><td></td></tr><tr><td>2026-06-25</td><td>수입</td><td>3000000</td><td>급여</td><td>월급</td><td>계좌이체</td><td></td></tr></tbody></table></body></html>`;
  return new Response(html, {
    headers: {
      "content-type": "application/vnd.ms-excel; charset=utf-8",
      "content-disposition": `attachment; filename="accountbook_import_template.xls"`,
      "cache-control": "no-store",
    },
  });
}

const ADMIN_IMPORT_MAX_ROWS = 3000;
const ADMIN_IMPORT_BATCH_ROWS = 1000;

async function handleAdminImportJson(request, env) {
  if (!MY_IMPORT_WRITES_ENABLED_V22959) return jsonResponse({ ok: false, error: "import_recovery_read_only", message: "복구 모드에서는 가져오기를 저장하지 않습니다. 원본과 기존 미리보기를 보관해 주세요." }, 503);
  try {
    if (!(await verifyAdminSession(request, env))) return jsonResponse({ ok: false, error: "unauthorized", message: "로그인 세션이 만료되었습니다. 새로고침 후 다시 로그인하세요." }, 401);
    const body = await readJson(request);
    const householdId = typeof body.household_id === "string" ? body.household_id.trim() : "";
    if (!householdId) return jsonResponse({ ok: false, error: "household_id_required", message: "가계부를 먼저 선택해주세요." }, 400);
    const rawText = String(body.raw_text || "");
    const defaultUserId = String(body.user_id || "").trim();
    const members = await fetchHouseholdMembers(env, householdId);
    if (!defaultUserId || !activeSpenderExists(members, defaultUserId)) {
      return jsonResponse({ ok: false, error: "spender_required", message: "업로드 기본 지출자를 현재 가계부 참여자 중에서 선택해주세요." }, 400);
    }
    const parsed = parseImportedRecords(rawText, householdId, defaultUserId);
    // V22.9.76 감사 E-8: 예전에는 1,000행을 넘는 부분을 말없이 버리고(건너뜀 0건), 행 id 를 요청마다 새로 만들어 응답이 끊긴 뒤
    // 같은 파일을 다시 내면 두 번 저장됐다. 이제 id 를 (가계부·기본 지출자·원문, 행 순서)로 정해 같은 파일을 다시 제출해도 이미
    // 저장된 행은 건너뛴다. 저장은 1,000행씩 나눠 최대 ADMIN_IMPORT_MAX_ROWS 행까지 하고(저장소 호출: 묶음당 1번 + 확인 80행당 1번),
    // 그보다 많거나 파일을 끝까지 읽지 못했으면 아무것도 저장하지 않고 나눠 올리라고 답한다.
    const cleaned = cleanImportedRowsForInsert(parsed.rows);
    if (parsed.analysis_complete === false || cleaned.length > ADMIN_IMPORT_MAX_ROWS) {
      return jsonResponse({ ok: false, error: "import_too_many_rows", rows: cleaned.length, max_rows: ADMIN_IMPORT_MAX_ROWS, message: `저장할 수 있는 행이 ${numberWithCommas(cleaned.length)}행${parsed.analysis_complete === false ? " 넘게 있어" : "이라"} 아무것도 저장하지 않았습니다. 한 번에 ${numberWithCommas(ADMIN_IMPORT_MAX_ROWS)}행까지 가져올 수 있으니 파일을 나눠 올려 주세요.` }, 413);
    }
    const idSeed = `admin:${await sha256Hex(`${householdId}|${defaultUserId}|${rawText}`)}`;
    const rows = [];
    for (const [index, row] of cleaned.entries()) rows.push({ ...row, id: row.id || await myImportDeterministicTransactionId(idSeed, index + 1), user_id: row.user_id || defaultUserId });
    if (!rows.length) return jsonResponse({ ok: false, error: "no_valid_rows", message: "저장 가능한 행을 찾지 못했습니다.", skipped: parsed.skipped }, 400);
    if (rows.some((row) => !activeSpenderExists(members, row.user_id))) return jsonResponse({ ok: false, error: "spender_not_member", message: "가져오기 행의 지출자가 현재 가계부의 활성 참여자가 아닙니다." }, 400);
    let inserted = 0, duplicates = 0, committedRows = 0;
    try {
      for (let start = 0; start < rows.length; start += ADMIN_IMPORT_BATCH_ROWS) {
        const batch = rows.slice(start, start + ADMIN_IMPORT_BATCH_ROWS);
        const result = await commitImportedTransactionRows(env, householdId, batch);
        const summary = Array.isArray(result) ? result[0] : result;
        if (!Number.isInteger(summary?.inserted) || !Number.isInteger(summary?.duplicates) || summary.inserted < 0 || summary.duplicates < 0 || summary.inserted + summary.duplicates !== batch.length) throw Object.assign(new Error("import_summary_invalid"), { importSummaryInvalid: true });
        inserted += summary.inserted;
        duplicates += summary.duplicates;
        committedRows += batch.length;
      }
    } catch (err) {
      if (!committedRows && !isUncertainStorageWrite(err) && !err?.importSummaryInvalid) throw err;
      rememberOpsEvent({ kind: "admin_import_unconfirmed", severity: "error", path: "/admin/import/json", method: "POST", detail: safeError(err) });
      return jsonResponse({ ok: false, error: "import_write_unknown", inserted, confirmed_rows: committedRows, message: `${committedRows ? `앞의 ${numberWithCommas(committedRows)}행은 저장을 확인했지만 ` : ""}나머지 저장 결과를 확인하지 못했습니다. 같은 파일을 그대로 다시 제출하면 이미 저장된 행은 다시 넣지 않습니다.` }, 503);
    }
    const found = await reconcileImportedTransactionIds(env, householdId, rows.map(row => ({ ...row, source: "my_import" })));
    if (found.size !== rows.length) return jsonResponse({ ok: false, error: "import_write_unknown", inserted, message: "저장된 내용을 파일과 맞춰 보지 못했습니다. 거래 목록에서 결과를 확인해 주세요. 같은 파일을 그대로 다시 제출해도 이미 저장된 행은 다시 넣지 않습니다." }, 503);
    return jsonResponse({ ok: true, inserted, skipped: parsed.skipped + duplicates, duplicates, rows: rows.length, date_samples: rows.slice(0, 5).map(r => r.transaction_date), warnings: parsed.warnings.slice(0, 20) });
  } catch (err) {
    rememberOpsEvent({ kind: "admin_import_failed", severity: "error", path: "/admin/import/json", method: "POST", detail: safeError(err) });
    return jsonResponse({ ok: false, error: "import_failed", message: "가져오기를 완료하지 못했습니다. 거래 목록에서 저장 결과를 확인한 뒤 같은 파일을 다시 제출해 주세요." }, 500);
  }
}

// Recovery candidates change only this build-time gate. No environment switch.
const MY_IMPORT_WRITES_ENABLED_V22959 = true;

async function commitImportedTransactionRows(env, householdId, rows, sourceHash = null, expectedValue = null) {
  if (!MY_IMPORT_WRITES_ENABLED_V22959) throw new Error("import_recovery_read_only");
  if (sourceHash !== null && (!/^[a-f0-9]{64}$/.test(sourceHash) || typeof expectedValue !== "string") || sourceHash === null && expectedValue !== null) throw new Error("import_source_scope_invalid");
  return supabase(env, "/rest/v1/rpc/accountbook_commit_import_v22960", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_household_id: householdId, p_rows: rows, p_source_hash: sourceHash, p_expected_value: expectedValue }),
  });
}

function importStorageTextIssue(row = {}) {
  // PostgreSQL LEFT/text length counts Unicode code points, not UTF-16 units.
  for (const [field, max, code] of [["memo", 160, "memo_too_long"], ["payment_method", 40, "payment_too_long"]]) {
    const value = String(row[field] || "");
    if (/\u0000|[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u.test(value)) return "invalid_field";
    if (Array.from(value).length > max) return code;
  }
  return "";
}

function cleanImportedRowsForInsert(rows = []) {
  const uuidRe = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return (rows || []).map((row) => {
    const out = { ...row };
    for (const key of Object.keys(out)) if (key.startsWith("_import_")) delete out[key];
    if (!uuidRe.test(String(out.user_id || ""))) delete out.user_id;
    if (!out.payment_method) out.payment_method = "";
    if (!out.memo) out.memo = "";
    if (!out.category) out.category = out.type === "income" ? "기타수입" : "기타지출";
    // V22.9.37 감사 SIM-7: 저장 직전 금액·날짜·구분을 공용 엄격 검증기로 다시 확인한다. Number("0x10")=16 처럼
    // 조용히 바뀌는 값은 저장하지 않고 행을 뺀다.
    out.amount = parseStrictAmount(out.amount, { min: 1 });
    out.transaction_date = parseStrictDate(out.transaction_date);
    return out;
  }).filter((row) => typeof row.household_id === "string" && row.household_id && (row.type === "income" || row.type === "expense") && row.amount !== null && row.transaction_date !== null && !importStorageTextIssue(row));
}

const IMPORT_FIELD_ALIASES = Object.freeze({
  currency: ["currency","currencycode","통화","통화코드","거래통화"],
  date: ["날짜","일자","일시","기준일","거래일","거래일자","거래일시","거래시간","사용일","사용일자","사용일시","이용일","이용일자","이용일시","승인일","승인일자","승인일시","결제일","결제일자","결제일시","매입일","작성일","등록일","발생일","회계일","전표일","date","datetime","transactiondate","transactiondatetime","purchasedate","approvaldate","postingdate"],
  type: ["구분","유형","종류","거래구분","거래유형","수입지출","수입지출구분","입출금","입출금구분","차변대변","debitcredit","type","transactiontype","inout"],
  income: ["수입","입금","입금액","수입액","수입금액","받은금액","대변","credit","income","deposit","moneyin","맡기신금액"],
  expense: ["지출","출금","출금액","지출액","지출금액","사용금액","사용액","이용액","실지출","실제지출","최종지출","승인금액","결제금액","매입금액","차변","debit","expense","withdrawal","withdraw","moneyout","지급","지급액","찾으신금액"],
  amount: ["금액","거래금액","거래액","원화금액","최종금액","청구금액","합계금액","이용금액","이용액","승인액","amount","value","price","total","transactionamount"],
  memo: ["내용","내역","내역명","거래내용","상세내역","지출내용","수입내용","적요","메모","비고","사용처","가맹점","가맹점명","상호","상호명","품목","품명","제목","설명","거래처","거래처명","수취인","보낸곳","받는분","memo","note","description","details","merchant","payee","title","item"],
  category: ["분류","카테고리","항목","대분류","중분류","소분류","세부분류","상세분류","지출분류","수입분류","태그","category","classification","class","tag"],
  payment: ["결제수단","결제방법","결제계정","지불수단","지급수단","수단","카드","카드명","계좌","계좌명","은행","금융기관","자산","payment","paymentmethod","method","card","account","bank","wallet"],
  spender: ["지출자","결제자","사용자","구성원","담당자","작성자","소유자","이름","닉네임","payer","spender","member","user","owner"],
  raw_text: ["원문","입력문","자연어","원본메모","원본내용","raw","rawtext","original","originaltext"],
  ignore: ["기록id","거래id","승인번호","전표번호","번호","순번","id","잔액","누계","통화","currency","상태","status"],
});

const IMPORT_FIELD_LABELS = Object.freeze({ date: "날짜", type: "구분", income: "수입금액", expense: "지출금액", amount: "금액", memo: "내용", category: "분류", payment: "결제수단", spender: "지출자", raw_text: "원문", ignore: "제외 열" });

const IMPORT_REJECTION_GUIDE = Object.freeze({
  preamble: ["제목·설명 행", "표 위의 제목이나 설명으로 판단했습니다. 거래 행은 그대로 두어도 되며 자동 제외됩니다."],
  repeated_header: ["반복된 제목 행", "여러 시트/표의 새 제목으로 인식해 다음 행부터 새 열 구성을 적용했습니다."],
  summary_row: ["합계·잔액 행", "합계와 잔액은 개별 거래가 아니어서 제외했습니다."],
  missing_date: ["날짜를 찾지 못함", "날짜/일자/거래일 열을 추가하거나 행에 ‘2026-07-15’처럼 날짜를 적어 주세요."],
  invalid_date: ["날짜 형식을 해석하지 못함", "예: 2026-07-15, 2026.7.15, 7월 15일, 46000(엑셀 날짜, 날짜 열) 형식으로 바꿔 주세요. 2000년~내년 밖의 연도는 날짜로 보지 않습니다."],
  missing_amount: ["금액을 찾지 못함", "금액·지출·수입·입금·출금 열을 추가하거나 ‘12,000원’처럼 적어 주세요."],
  invalid_amount: ["금액 형식을 해석하지 못함", "통화문자와 쉼표는 허용됩니다. 숫자 또는 ‘1만2천원’처럼 입력해 주세요."],
  amount_too_large: ["금액이 허용 범위를 초과함", "한 거래 금액은 20억 원 이하로 바꾼 뒤 다시 확인해 주세요. 자동으로 줄여 저장하지 않습니다."],
  ambiguous_amount: ["금액 후보가 여러 개라 확정하지 못함", "잔액/누계 열은 빼고 실제 거래금액 열의 제목을 금액·지출·수입 중 하나로 바꿔 주세요."],
  column_mismatch: ["제목 수와 값 수가 맞지 않음", "쉼표가 든 내용은 큰따옴표로 감싸거나, CSV 대신 탭으로 구분한 표를 붙여넣어 주세요."],
  both_income_expense: ["수입과 지출 금액이 한 행에 함께 있음", "한 거래 행에는 수입 또는 지출 금액 하나만 남겨 주세요."],
  unsupported_row: ["거래로 판단할 정보가 부족함", "날짜와 금액을 넣거나 ‘어제 점심 12000원 카드’처럼 한 문장으로 적어 주세요."],
  duplicate: ["기존 기록과 중복", "중복 건너뛰기가 켜져 있어 저장하지 않았습니다. 의도한 중복이면 옵션을 끄고 다시 가져오세요."],
  over_limit: ["한 번에 처리할 수 있는 행 수 초과", "분석 범위를 넘은 행은 파일을 나누어 다시 확인해 주세요. 앞의 저장 후보를 먼저 저장했다면 같은 연결로 다음 묶음을 분석할 수 있습니다."],
  write_failed: ["저장 안 됨", "이 행은 저장되지 않았어요. 원인을 확인한 뒤 이 행만 다시 가져와 주세요."],
  write_unknown: ["저장 여부 확인 필요", "저장됐는지 확인하지 못했어요. 다시 가져오기 전에 ‘가져온 기록 확인’에서 이 행이 있는지 먼저 확인해 주세요."],
  invalid_csv: ["CSV 따옴표 문법 오류", "표시한 원본 줄의 닫는 큰따옴표와 구분자를 확인해 주세요. 이 구간은 저장하지 않았습니다."],
  structure_limit: ["표 구조의 안전 한도 초과", "열이나 셀이 지나치게 많은 구간입니다. 필요한 거래 열만 남겨 표를 나눈 뒤 다시 확인해 주세요."],
  invalid_field: ["명시한 필드 값 확인 필요", "분류는 80자, 결제수단은 40자 이내이며 제어 문자를 포함할 수 없습니다. 다른 열에서 대신 채우지 않았습니다."],
  memo_too_long: ["메모 저장 한도 초과", "메모는 160자까지 저장할 수 있습니다. 원본을 자르거나 저장하지 않았습니다. 원본을 보관한 뒤 메모를 직접 수정해 다시 분석해 주세요."],
  payment_too_long: ["결제수단 저장 한도 초과", "결제수단은 40자까지 저장할 수 있습니다. 원본을 자르거나 저장하지 않았습니다. 원본을 보관한 뒤 결제수단을 직접 수정해 다시 분석해 주세요."],
  invalid_spender: ["지출자 권한 확인 필요", "현재 가계부의 기록 가능한 참여자 한 명을 지정해야 합니다. 다른 사람의 지출자는 소유자·관리자만 지정할 수 있습니다."],
});

function normalizeImportHeader(value) {
  return String(value ?? "").normalize("NFKC").replace(/^\ufeff/, "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

// Only the finite, product-owned aliases live for the lifetime of an isolate.
// User headers and source text are never retained in a global cache.
const IMPORT_ALIAS_INDEX = (() => {
  const exact = new Map(), fuzzy = [];
  let rank = 0;
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const key = normalizeImportHeader(alias), item = { field, key, rank: rank++ };
      if (!exact.has(key)) exact.set(key, item);
      if (key.length >= 2) fuzzy.push(item);
    }
  }
  fuzzy.sort((a, b) => b.key.length - a.key.length || a.rank - b.rank);
  return { exact, fuzzy };
})();

// V22.9.80 T-29: 비슷한 이름으로 읽을 때 번호·주소 머리글은 내용·결제수단·금액으로 읽지 않는다. 머리글에 별칭 낱말이 들어 있기만 하면 읽어서
// ‘카드번호’(가린 카드번호 1234-56**-…)가 결제수단 이름으로, ‘입금계좌번호’가 수입 금액 열로 저장·판정되고 ‘가맹점주소’·‘가맹점번호’가 내용이
// 되어 주소 낱말(‘병원 앞’)이 분류를 정했다. 영문 ‘No.’ 도 ‘inout’(구분 별칭) 속 글자 둘이라 구분 열로 읽혀 행마다 경고가 붙었다.
// 이런 머리글은 제외 열(ignore)로 둔다 — 열 연결 화면에는 ‘제외 열’로 보이고 사용자가 직접 바꿀 수 있다. 정확히 같은 별칭(‘승인번호’·‘번호’ …)은
// 그대로이고, 예전에 아무 열로도 읽지 않던 머리글(‘주소’)도 그대로다.
const IMPORT_NUMBER_ADDRESS_HEADER = /번호|주소|number|address|^no$/;
// V22.9.81 U-12: 카드 끝자리 머리글(‘카드 끝 4자리’·‘카드뒷자리’·‘Card Last 4’)도 결제수단이 아니다. ‘카드’ 별칭이 들어 있어 결제수단으로 읽혀
// 끝 네 자리(‘1234’)가 결제수단 이름으로 저장됐다. 자리·끝자리 낱말이 든 머리글은 번호 머리글처럼 제외 열로 둔다(정확히 같은 별칭은 그대로).
const IMPORT_DIGIT_POSITION_HEADER = /자리|last\d|digits?$/;

function canonicalImportField(value = "") {
  const key = normalizeImportHeader(value);
  if (!key) return "";
  const exact = IMPORT_ALIAS_INDEX.exact.get(key)?.field;
  if (exact) return exact;
  // V22.9.81 U-12: 머리글이 별칭보다 짧은 쪽(별칭 속에 머리글이 든 경우)은 세 글자 이상이고 별칭의 앞부분일 때만 맞춘다(‘desc’→내용, ‘cat’→분류,
  // ‘pay’→결제수단). 예전에는 아무 자리든 맞춰 ‘결제’·‘사용’·‘이용’이 날짜(결제일자·사용일자·이용일자), ‘거래’가 통화(거래통화), ‘합계’가 금액,
  // ‘분’이 구분(수입지출구분), ‘in’이 원문(original)으로 읽혔다. 영문 ‘No’ 는 그렇게 맞춘 뒤 T-29 가 제외 열로 돌렸으므로 그대로 제외 열이다.
  if (key === "no") return "ignore";
  const fuzzy = IMPORT_ALIAS_INDEX.fuzzy.find((item) => key.includes(item.key) || (key.length >= 3 && item.key.startsWith(key)))?.field || "";
  return fuzzy && (IMPORT_NUMBER_ADDRESS_HEADER.test(key) || IMPORT_DIGIT_POSITION_HEADER.test(key)) ? "ignore" : fuzzy;
}

function canonicalImportHeaderField(value = "") {
  const key = normalizeImportHeader(value);
  if (!key) return "";
  const withoutBracketUnit = normalizeImportHeader(String(value || "").replace(/\([^)]*\)|\[[^\]]*\]/g, ""));
  const variants = [key, withoutBracketUnit, withoutBracketUnit.replace(/외화|원화|USD|EUR|JPY|KRW/gi,""), key.replace(/(?:kst|utc|서울시간|원화|krw|won|원|명|코드)$/i, "")].filter(Boolean);
  let first = null;
  for (const variant of variants) {
    const item = IMPORT_ALIAS_INDEX.exact.get(variant);
    if (item && (!first || item.rank < first.rank)) first = item;
  }
  return first?.field || "";
}

function importColumnMetadata(headers = []) {
  return headers.map((header) => {
    const key = normalizeImportHeader(header);
    const timeKey = (/[\[(]/.test(String(header)) ? normalizeImportHeader(String(header).replace(/\([^)]*\)|\[[^\]]*\]/g, "")) : key).replace(/(?:kst|utc|서울시간)$/, "");
    const timeOnly = /^(?:거래시간|사용시간|이용시간|승인시간|결제시간|시간|time|transactiontime)$/.test(timeKey);
    const field = timeOnly ? "time" : canonicalImportField(header);
    return { key, field, original_money: ["amount", "income", "expense"].includes(field), exact: timeOnly ? "time" : canonicalImportHeaderField(header), foreign: /외화|해외통화|USD|EUR|JPY|달러|엔화|유로/i.test(String(header)), local: /원화|KRW|won|\(원\)|\[원\]/i.test(String(header)) };
  });
}

const IMPORT_EDITABLE_FIELDS = Object.freeze(["date", "amount", "type", "income", "expense", "memo", "category", "payment", "spender", "ignore"]);

// V22.9.79 감사 E-15: 백업 CSV 내보내기(csvSafeText)는 =, +, -, @, 탭, 캐리지리턴으로 시작하는 글 앞에 엑셀 수식 방지용 작은따옴표를 붙인다.
// 다시 가져올 때 그 작은따옴표를 뺀다. 작은따옴표가 하나 이상 이어진 뒤에 수식 기호가 올 때만 하나를 빼므로, 진짜로 작은따옴표로
// 시작하는 글('점심')은 그대로 남고, 작은따옴표 뒤에 수식 기호가 오는 글('=x)은 내보낼 때 이미 하나가 더 붙어 있어 되돌아온다.
const IMPORT_GUARDED_FIELDS = new Set(["memo", "category", "payment", "spender", "raw_text"]);
function unguardImportText(value) {
  return typeof value === "string" && value.charCodeAt(0) === 39 && /^'+[=+\-@\t\r]/.test(value) ? value.slice(1) : value;
}

// V22.9.79 감사 E-15: 이 앱이 내보낸 백업 CSV(열 9개가 모두 있는 표)인지. 내보낸 파일의 빈 칸은 "값이 없음"이므로 가져올 때 글에서 추측해
// 채우지 않는다. 열 이름은 import/csv-duplicates.js READABLE_CSV_COLUMNS 와 같아야 한다(검사기가 맞춰 본다).
const BACKUP_EXPORT_HEADER_KEYS = ["날짜", "구분", "금액", "분류", "내용", "결제수단", "지출자", "출처", "기록ID"].map(normalizeImportHeader);
function isBackupExportColumns(columns = []) {
  const keys = new Set(safeArray(columns).map((column) => column?.key));
  return BACKUP_EXPORT_HEADER_KEYS.every((key) => keys.has(key));
}

// V22.9.79 감사 E-11: 카드 명세서의 ‘결제방법’ 열에는 결제수단이 아니라 일시불·할부 같은 결제 방식이 적힌다. 이 값을 결제수단 이름으로 쓰면
// 결제수단별 통계에 ‘일시불’이 한 갈래로 생긴다. 이런 말만 적힌 칸은 결제수단으로 읽지 않는다(‘이용카드’ 열이 있으면 그 값을 쓴다).
const IMPORT_INSTALLMENT_LABEL = /^(?:일시불(?:\s*\([^)]*\))?|할부|무이자(?:\s*할부)?|\d{1,2}\s*개월(?:\s*(?:무이자\s*)?할부)?|할부\s*\d{1,2}\s*개월?|\d{1,2}\s*회\s*할부)$/;
function isInstallmentLabel(value) {
  return IMPORT_INSTALLMENT_LABEL.test(String(value ?? "").trim());
}

function isImportSheetMarker(cells = []) {
  return /^(?:#\s*)?(?:시트|sheet)\s*[:：]/i.test(String(cells[0] || "").trim());
}

function importMappingPlan(table, headerIndex, maxRows, options = {}) {
  const delta = options.mappingDelta === undefined ? [] : options.mappingDelta;
  const fail = (message) => { throw new Error(`import_mapping_invalid:${message}`); };
  if (!Array.isArray(delta) || delta.length > 256) fail("열 연결은 한 번에 256개 이하로 수정해 주세요.");
  const sections = new Map();
  if (headerIndex >= 0) {
    let id = 1;
    sections.set(id, { id, header_index: headerIndex, headers: table[headerIndex], base: importColumnMetadata(table[headerIndex]) });
    for (let i = headerIndex + 1; i < Math.min(table.length, maxRows); i++) {
      if (!table[i].csv_error && !isImportSheetMarker(table[i]) && looksLikeImportHeader(table[i], options)) {
        id++;
        sections.set(id, { id, header_index: i, headers: table[i], base: importColumnMetadata(table[i]) });
      }
    }
  }
  const seen = new Set(), normalized = [];
  for (const item of delta) {
    if (!item || typeof item !== "object" || Array.isArray(item) || Object.keys(item).sort().join(",") !== "column_index,field,section") fail("열 연결 요청 형식을 확인해 주세요.");
    if (!Number.isInteger(item.section) || !Number.isInteger(item.column_index) || item.section < 1 || item.column_index < 0 || typeof item.field !== "string" || !IMPORT_EDITABLE_FIELDS.includes(item.field)) fail("표 구간·열 번호와 연결할 항목을 확인해 주세요.");
    const section = sections.get(item.section), key = `${item.section}:${item.column_index}`;
    if (!section || item.column_index >= section.headers.length || seen.has(key)) fail("없는 열이나 중복된 열 연결을 요청했습니다. 연결을 다시 확인해 주세요.");
    seen.add(key);
    const original = section.base[item.column_index];
    if (["currency", "raw_text", "time"].includes(original.field)) fail("통화·원문·시간 열은 자동 연결을 유지합니다. 이 열은 수정할 수 없습니다.");
    if (original.field !== item.field) normalized.push({ section: item.section, column_index: item.column_index, field: item.field });
  }
  normalized.sort((a, b) => a.section - b.section || a.column_index - b.column_index);
  for (const section of sections.values()) section.columns = section.base;
  for (const item of normalized) {
    const section = sections.get(item.section);
    if (section.columns === section.base) section.columns = section.base.map(column => ({ ...column }));
    Object.assign(section.columns[item.column_index], { field: item.field, exact: item.field });
  }
  for (const section of sections.values()) {
    if (section.columns === section.base) continue;
    const count = (columns, field) => columns.filter(column => column.field === field).length;
    for (const field of ["date", "amount", "type", "income", "expense", "payment", "spender"]) {
      if (count(section.columns, field) > Math.max(1, count(section.base, field))) fail(`${section.id}번째 표에서 ‘${IMPORT_FIELD_LABELS[field] || field}’ 연결이 겹칩니다. 기존 연결을 무시로 바꾸거나 새 연결을 해제해 주세요.`);
    }
    const mixed = columns => count(columns, "amount") > 0 && (count(columns, "income") > 0 || count(columns, "expense") > 0);
    if (mixed(section.columns) && !mixed(section.base)) fail(`${section.id}번째 표에 단일 금액과 수입·지출 금액이 함께 연결되었습니다. 사용할 금액 방식 하나를 선택해 주세요.`);
  }
  return { sections, headerIndexes: new Set([...sections.values()].map(section => section.header_index)), delta: normalized };
}

function effectiveImportColumns(headers, section, options = {}) {
  return options.mappingPlan?.sections.get(section)?.columns || importColumnMetadata(headers);
}

function importMappingSchema(table, plan, options = {}) {
  const limit = 64, total = [...plan.sections.values()].reduce((sum, section) => sum + section.headers.length, 0);
  const offset = Math.min(Math.max(0, Number.isInteger(options.mappingOffset) ? options.mappingOffset : 0), Math.max(0, total - 1));
  const sections = [];
  let position = 0;
  for (const section of plan.sections.values()) {
    const columns = [];
    const next = plan.sections.get(section.id + 1)?.header_index ?? table.length;
    const sample = table.slice(section.header_index + 1, Math.min(next, section.header_index + 4)).find(row => !row.csv_error && row.some(cell => String(cell).trim()));
    const aligned = sample ? alignImportCells(section.headers, sample, section.columns) : null;
    for (let index = 0; index < section.headers.length; index++, position++) {
      if (position < offset || position >= offset + limit) continue;
      const column = section.columns[index], base = section.base[index];
      columns.push({ column_index: index, title: String(section.headers[index]).slice(0, 80), automatic: base.field || "", field: column.field || "", readonly: ["currency", "raw_text", "time"].includes(base.field), sample: String((aligned?.matched ? aligned.cells : sample)?.[index] ?? "").slice(0, 48).replace(/\s+/g, " ") });
    }
    if (columns.length) sections.push({ section: section.id, header_row: section.header_index + 1, total_columns: section.headers.length, columns });
  }
  return { total_columns: total, offset, limit, shown: Math.min(limit, Math.max(0, total - offset)), sections };
}

function importHeaderScore(row = [], options = {}) {
  const cells = safeArray(row);
  // V22.9.26: 날짜나 숫자 금액이 든 행은 제목 행이 아니다. "2026-07-01,지출,4500,스타벅스,카페/간식,카드"
  // 처럼 구분·결제수단 셀이 제목 별칭과 같은 가장 흔한 거래 행이 반복 제목으로 오인돼 저장 0건이 됐다.
  const dataLike = cells.some((cell) => {
    const text = String(cell ?? "").trim();
    return /^[-+]?[\d,]+(?:\.\d+)?\s*원?$/.test(text) && Math.abs(Number(text.replace(/[^\d.-]/g, ""))) >= 1;
  }) || !!findImportDateInValues(cells, options);
  if (dataLike) return { score: 0, fields: new Set(), isHeader: false };
  const fields = new Set(cells.map(canonicalImportHeaderField).filter((field) => field && field !== "ignore"));
  const hasMoney = ["amount", "income", "expense"].some((field) => fields.has(field));
  let score = 0;
  if (fields.has("date")) score += 2;
  if (hasMoney) score += 3;
  if (fields.has("type")) score += 1;
  if (fields.has("memo")) score += 1;
  if (fields.has("category")) score += 1;
  if (fields.has("payment")) score += 1;
  return { score, fields, isHeader: !dataLike && hasMoney && fields.size >= 2 && score >= 4 };
}

function detectImportDelimiter(text = "") {
  const src = String(text || "").replace(/^\ufeff/, "");
  const sample = src.slice(0, 65536);
  const candidates = ["\t", ",", ";", "|"];
  let best = { delimiter: "", score: 0 };
  for (const delimiter of candidates) {
    const rows = parseDelimitedText(sample, delimiter, { retainRows: 30, sample: true });
    const widths = rows.map((row) => row.length).filter((n) => n > 1);
    if (!widths.length) continue;
    const common = widths.reduce((map, n) => (map[n] = (map[n] || 0) + 1, map), {});
    const stable = Math.max(...Object.values(common));
    const score = widths.length * 10 + stable * 4 + Math.max(...widths);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function parseDelimitedText(text, delimiter = "", options = {}) {
  const src = String(text || "").replace(/^\ufeff/, "");
  const delim = delimiter || detectImportDelimiter(src) || "\t";
  const rows = [], retainRows = options.retainRows || 10100;
  let row = [], state = "start", line = 1, startLine = 1, total = 0, cells = 0, error = "", firstBreak = -1, recovered = false;
  let cellStart = 0, segmentStart = 0, parts = null, chunks = null, recordStart = 0;
  // An escaped quote must not allocate an array entry for the entire cell's
  // lifetime. Compact small fragments into bounded chunks while scanning.
  const addPart = part => {
    if (!part) return;
    parts.push(part);
    if (parts.length >= 1024) { chunks.push(parts.join("")); parts = []; }
  };
  const value = end => {
    if (!parts) return src.slice(cellStart, end).trim();
    if (segmentStart >= 0) addPart(src.slice(segmentStart, end));
    chunks.push(parts.join(""));
    return chunks.join("").trim();
  };
  const resetCell = start => { cellStart = start; segmentStart = start; parts = null; chunks = null; state = "start"; };
  const finish = end => {
    row.push(value(end));
    if (row.some(item => String(item).trim()) || error) {
      total++;
      if (rows.length < retainRows) {
        Object.defineProperties(row, { source_location: { value: { start_line: startLine, end_line: line, record: total } }, csv_error: { value: error } });
        rows.push(row);
      }
    }
    row = []; resetCell(end + 1); error = ""; firstBreak = -1;
  };
  for (let i = 0; i <= src.length; i++) {
    if (i === src.length) {
      if (state === "quoted") {
        error = "unclosed_quote";
        // Recover once at the first physical break. A second malformed tail is
        // explicitly rejected as a range, avoiding quadratic rescans.
        if (firstBreak >= 0 && !recovered && !options.sample) {
          recovered = true;
          const resume = firstBreak;
          row = []; parts = null; cellStart = recordStart; state = "plain";
          line = startLine; finish(resume);
          i = resume; line++; startLine = line; recordStart = resume + 1;
          continue;
        }
      }
      finish(i); break;
    }
    const ch = src[i], next = src[i + 1];
    if (state === "quoted") {
      if (ch === '"' && next === '"') { addPart(src.slice(segmentStart, i)); addPart('"'); segmentStart = i + 2; i++; }
      else if (ch === '"') { addPart(src.slice(segmentStart, i)); segmentStart = -1; state = "closed"; }
      else if (ch === "\n" || ch === "\r") {
        if (firstBreak < 0) firstBreak = ch === "\r" && next === "\n" ? i + 1 : i;
        line++; if (ch === "\r" && next === "\n") i++;
      }
    } else if (ch === delim) {
      row.push(value(i)); resetCell(i + 1); cells++;
      if (row.length >= 4096 || cells >= 250000) { error = "structure_limit"; finish(i + 1); rows.limited = true; break; }
    } else if (ch === "\n" || ch === "\r") {
      finish(i); if (ch === "\r" && next === "\n") { i++; resetCell(i + 1); }
      line++; startLine = line; recordStart = i + 1;
      if (options.sample && rows.length >= retainRows) break;
    } else if (ch === '"' && state === "start" && !src.slice(cellStart, i).trim()) { state = "quoted"; parts = []; chunks = []; segmentStart = i + 1; }
    else if (state === "closed") { if (!/\s/.test(ch)) error = "unexpected_after_quote"; }
    else state = "plain";
  }
  rows.total_rows = total; rows.physical_lines = line;
  return rows;
}

function splitDelimitedLine(line) {
  return parseDelimitedText(String(line || ""), detectImportDelimiter(line))[0] || [String(line || "").trim()];
}

function looksLikeImportHeader(row, options = {}) {
  return importHeaderScore(row, options).isHeader;
}

function getImportValue(obj, patterns) {
  const entries = Object.entries(obj || {}).map(([key, value]) => [normalizeImportHeader(key), value]);
  for (const pattern of patterns || []) {
    const p = normalizeImportHeader(pattern);
    const exact = entries.find(([key]) => key === p);
    if (exact && String(exact[1] ?? "").trim()) return exact[1];
  }
  return "";
}

function canonicalImportValue(obj = {}, field = "") {
  const direct = safeObject(obj.__canonical)[field];
  if (direct !== undefined && String(direct ?? "").trim()) return String(direct).trim();
  if (obj.__mapped === true) return "";
  for (const [key, value] of Object.entries(obj || {})) {
    if (key.startsWith("__")) continue;
    if (["amount","income","expense"].includes(field) && /외화|해외통화|USD|EUR|JPY|달러|엔화|유로/i.test(key)) continue;
    if (canonicalImportField(key) === field && String(value ?? "").trim()) return String(value).trim();
  }
  return "";
}

function findImportDateInValues(values, options = {}) {
  for (const value of values || []) {
    const d = parseImportDateCell(value, options);
    if (d) return d;
  }
  return "";
}

// V22.9.37 감사 N5·D6: 가져오기 날짜 전용 해석. 카카오·웹이 함께 쓰는 parseDateStrict 는 그대로 두고, 가져오기만
// 다음을 다르게 본다. (1) 다섯 자리 숫자(엑셀 일련번호)는 날짜 열 값일 때만(allowSerial) 날짜다 — 금액 칸의 38000·
// 52000 이 2004·2042년이 되지 않는다. (2) 두 자리 연도의 세 토막 날짜는 SheetJS 가 날짜 셀을 적는 M/D/YY 를 먼저
// 본다(10/12/25 → 2025-10-12). 월이 13 이상이면 YY/MM/DD 다(25.10.12 → 2025-10-12). (3) 연도는 2000년부터
// 내년까지만 받는다. 그 밖은 날짜가 아니라고 보고 행을 확인 필요(invalid_date)로 보낸다.
function importDateContext(options = {}) {
  if (options.dateContext) return options.dateContext;
  const referenceDate = parseStrictDate(options.referenceDate) || formatDate(nowKstDate());
  const explicit = Number.isInteger(Number(options.importYear)) && Number(options.importYear) >= 2000;
  const mode = ["default", "selected", "file"].includes(options.dateBasisMode) ? options.dateBasisMode : explicit ? "selected" : "default";
  return { reference_date: referenceDate, year: explicit ? Number(options.importYear) : Number(referenceDate.slice(0, 4)), mode, max_year: Number(referenceDate.slice(0, 4)) + 1 };
}

function importDateYearAllowed(ymd = "", options = {}) {
  const year = Number(String(ymd || "").slice(0, 4));
  return Number.isFinite(year) && year >= 2000 && year <= importDateContext(options).max_year ? String(ymd) : "";
}

function isTwoDigitYearImportDate(value = "") {
  return /^\d{1,2}\s*[.\/-]\s*\d{1,2}\s*[.\/-]\s*\d{2}(?:\s|$)/.test(String(value ?? "").trim());
}

// V22.9.79 감사 E-1: 한 번의 해석 동안만 쓰는 기억 칸. 같은 날짜 칸을 제목 행 판정·합계 행 판정·부호 규칙·연도 찾기·본 해석에서
// 행마다 네다섯 번 읽는데, 값과 날짜 기준(dateContext)이 같으면 결과도 같다. 사용자 칸 값은 전역에 남기지 않고 해석이 끝나면 버린다.
let importParseScope = null;
const IMPORT_SCOPE_DATE_LIMIT = 8192;
const IMPORT_SCOPE_TYPE_LIMIT = 4096;

function parseImportDateCell(value, options = {}) {
  const scope = importParseScope, context = options.dateContext;
  if (!scope || !context) return readImportDateCell(value, options);
  let known = scope.dates.get(context);
  if (!known) scope.dates.set(context, known = new Map());
  const key = (options.allowSerial === true ? "s|" : "-|") + String(value ?? "");
  let date = known.get(key);
  if (date === undefined) {
    date = readImportDateCell(value, options);
    if (known.size < IMPORT_SCOPE_DATE_LIMIT) known.set(key, date);
  }
  return date;
}

function readImportDateCell(value, options = {}) {
  const text = String(value ?? "").replace(/\ufeff/g, "").trim().replace(/^["']|["']$/g, "").trim();
  if (!text) return "";
  if (/^\d{5}(?:\.\d+)?$/.test(text)) return options.allowSerial === true ? importDateYearAllowed(parseDateStrict(text), options) : "";
  const parts = text.match(/^(\d{1,2})\s*[.\/-]\s*(\d{1,2})\s*[.\/-]\s*(\d{1,2})(?:\s|$)/);
  if (parts) {
    const monthDayYear = parts[3].length === 2 ? safeYmd(2000 + Number(parts[3]), Number(parts[1]), Number(parts[2])) : "";
    const yearMonthDay = parts[1].length === 2 ? safeYmd(2000 + Number(parts[1]), Number(parts[2]), Number(parts[3])) : "";
    return importDateYearAllowed(monthDayYear || yearMonthDay, options);
  }
  const short = text.match(/^(\d{1,2})\s*(?:[./-]|월\s*)(\d{1,2})\s*일?$/);
  if (short) {
    const context = importDateContext(options);
    let year = context.year;
    const date = safeYmd(year, Number(short[1]), Number(short[2]));
    if (date && context.mode === "default" && (Date.parse(date) - Date.parse(context.reference_date)) / 86400000 > 183) year--;
    return importDateYearAllowed(safeYmd(year, Number(short[1]), Number(short[2])), options);
  }
  return importDateYearAllowed(parseDateStrict(text), options);
}

// 자연어·행 전체 텍스트에서 날짜를 찾을 때도 다섯 자리 숫자 하나뿐인 텍스트는 엑셀 일련번호로 읽지 않는다.
function importDateFromFreeText(text = "", options = {}) {
  const raw = String(text ?? "").trim();
  if (!raw || /^\d{5}(?:\.\d+)?$/.test(raw)) return "";
  const strict = parseImportDateCell(raw, options);
  if (strict) return strict;
  const context = importDateContext(options);
  const monthDay = raw.match(/(?:^|\s)(\d{1,2})\s*(?:월\s*|[./-])(\d{1,2})\s*일?(?=\s|$|[.,!?])/);
  if (monthDay && context.mode !== "default" && !/(?:재작년|작년|지난\s*해|올해|금년|내년|다음\s*해)/.test(raw)) return parseImportDateCell(`${monthDay[1]}/${monthDay[2]}`, options);
  return importDateYearAllowed(quickInputDate(raw, context.reference_date), options);
}

// 날짜 열(제목 표의 date 필드, 키:값 행의 날짜 항목, 객체의 날짜 키)이 있는 행인지.
function importHasDateField(obj = {}) {
  if (obj.__mapped === true) return obj.__has_date === true;
  if (safeArray(obj.__headers).some((header) => canonicalImportField(header) === "date")) return true;
  if (Object.prototype.hasOwnProperty.call(safeObject(obj.__canonical), "date")) return true;
  return Object.keys(obj || {}).some((key) => !key.startsWith("__") && canonicalImportField(key) === "date");
}

// V22.9.37 감사 T9: 칸 경계가 곧 단어 경계다. "합계,,123000" 처럼 쉼표로 이은 행의 합계 칸은 쉼표에 붙어 있어 예전의
// 공백 경계 규칙에 걸리지 않았고, 날짜가 있으면 지출로 저장됐다. 합계·총계·소계·월계는 칸 하나가 그 말이면(앞에
// "7월"·"지출"·"총" 같은 말, 뒤에 숫자·콜론만 허용) 날짜가 있어도 거래가 아니다. 누계·잔액은 메모에 섞일 수 있어
// 예전처럼 날짜 없는 행에서만 본다.
function isImportSummaryRow(cells = [], raw = "", options = {}) {
  const summaryCell = (cell, pattern) => {
    const match = cell.match(pattern);
    if (!match) return false;
    const prefix = cell.slice(0, match.index).trim();
    return !prefix || /^[0-9A-Za-z가-힣\s]+$/.test(prefix) && prefix.split(/\s+/).length <= 3;
  };
  const totalCell = /(?:합계|총계|소계|월계)\s*[:：]?\s*(?:[-−]?[\d,.]+\s*원?)?$/;
  const balanceCell = /(?:누계|잔액)\s*[:：]?\s*(?:[-−]?[\d,.]+\s*원?)?$/;
  const values = safeArray(cells).map((cell) => String(cell ?? "").replace(/\s+/g, " ").trim()).filter(Boolean);
  if (values.some((cell) => summaryCell(cell, totalCell))) return true;
  if (findImportDateInValues(values, options)) return false;
  return values.some((cell) => summaryCell(cell, balanceCell)) || /(?:^|\s)(합계|총계|소계|월계|누계|잔액)(?:\s|$)/.test(String(raw || ""));
}

// V22.9.37 감사 T10: 파일 전체의 부호 규칙. 금액이 있는 행 중 둘 이상·절반 이상이 음수이고, 양수인데 지출로 적힌 행과
// 음수인데 수입으로 적힌 행이 하나도 없으면 "음수 = 지출, 양수 = 수입"으로 내보낸 파일(signed)이다. 그 밖(양수 지출
// 사이의 음수 몇 건)은 예전처럼 취소·환불로 본다(default). 제목 행이 없는 표·자연어는 규칙을 정하지 않는다.
function detectImportSignConvention(table = [], headerIndex = -1, maxRows = 5000, options = {}) {
  const summary = { mode: "default", amount_rows: 0, negative_rows: 0 };
  if (headerIndex < 0 || !safeArray(table[headerIndex]).length) return summary;
  let headers = table[headerIndex];
  let sectionId = 1;
  let columns = effectiveImportColumns(headers, sectionId, options);
  let fields = columns.map((column) => column.field);
  let positiveExpense = 0;
  let negativeIncome = 0;
  for (let i = headerIndex + 1; i < Math.min(table.length, maxRows); i++) {
    const cells = safeArray(table[i]);
    if (!cells.some((cell) => String(cell ?? "").trim())) continue;
    if (cells.csv_error) continue;
    if (isImportSheetMarker(cells)) continue;
    if (options.mappingPlan?.headerIndexes.has(i)) { headers = cells; columns = effectiveImportColumns(headers, ++sectionId, options); fields = columns.map(column => column.field); continue; }
    const aligned = alignImportCells(headers, cells, columns);
    let money = null;
    let typed = "";
    if (aligned.matched) {
      fields.forEach((field, index) => {
        const value = String(aligned.cells[index] ?? "").trim();
        if (!value) return;
        if (field === "type") typed = normalizeImportTypeValue(value) || typed;
        if (!["amount", "income", "expense"].includes(field) || money || /외화|해외통화|USD|EUR|JPY|달러|엔화|유로/i.test(String(headers[index]))) return;
        const info = parseImportAmountCell(value);
        if (info.amount > 0) { money = info; if (field !== "amount") typed = field; }
      });
    }
    // 금액이 없는 행만 제목 행인지 본다(제목 판정은 비싸고, 금액이 있는 행은 제목이 아니다).
    if (!money) {
      if (!options.mappingPlan && looksLikeImportHeader(cells, options)) { headers = cells; columns = effectiveImportColumns(headers, ++sectionId, options); fields = columns.map((column) => column.field); }
      continue;
    }
    const inferenceCells = aligned.cells.filter((_, index) => ["date", "amount", "income", "expense", "memo", "type", "category", "payment"].includes(columns[index]?.field));
    if (isImportSummaryRow(inferenceCells, inferenceCells.join(" "), options)) continue;
    summary.amount_rows += 1;
    if (money.negative) { summary.negative_rows += 1; if (typed === "income") negativeIncome += 1; }
    else if (typed === "expense") positiveExpense += 1;
  }
  if (summary.negative_rows >= 2 && summary.negative_rows * 2 >= summary.amount_rows && positiveExpense === 0 && negativeIncome === 0) summary.mode = "signed";
  return summary;
}

function parseImportAmountCell(value = "") {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw || /^(?:-|—|–)$/.test(raw)) return { amount: 0, present: !!raw, valid: true, negative: false, raw };
  let numeric = raw, negative = false, signs = 0;
  if (/^\(.*\)$/.test(numeric)) { negative = true; signs++; numeric = numeric.slice(1, -1).trim(); }
  const stripCurrency = text => text.replace(/^(?:₩|￦|\$|krw(?=[\d\s−△▲-])|won(?=[\d\s−△▲-]))\s*/i, "").replace(/\s*(?:원|krw|won)$/i, "").trim();
  numeric = stripCurrency(numeric);
  if (/^[-−△▲]/.test(numeric)) { negative = true; signs++; numeric = numeric.slice(1).trim(); }
  if (/[-−]$/.test(numeric)) { negative = true; signs++; numeric = numeric.slice(0, -1).trim(); }
  numeric = stripCurrency(numeric);
  let amount = 0;
  if (signs > 1) amount = NaN;
  else if (/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.0+)?$/.test(numeric)) amount = Number(numeric.replace(/,/g, ""));
  else if (numeric.length <= 120 && /^[0-9일이삼사오육칠팔구십백천만억영공.,\s]+$/.test(numeric) && /[십백천만억]/.test(numeric)) {
    const spans = moneyTokenSpans(numeric);
    amount = spans.length === 1 && spans[0].start === 0 && spans[0].end === numeric.length ? spans[0].amount : NaN;
  }
  else amount = NaN;
  return { amount: Number.isFinite(amount) ? amount : 0, present: true, valid: Number.isSafeInteger(amount) && amount >= 0, negative, raw };
}

// V22.9.79 감사 E-1: 구분 칸은 "지출"·"수입"처럼 같은 값이 거의 모든 행에서 반복된다. 빈 칸은 바로 돌려주고, 같은 값은 해석 한 번 안에서 다시 계산하지 않는다.
function normalizeImportTypeValue(value = "") {
  if (value === "" || value === null || value === undefined) return "";
  const scope = importParseScope;
  if (scope && typeof value === "string") {
    let type = scope.types.get(value);
    if (type === undefined) {
      type = readImportTypeValue(value);
      if (scope.types.size < IMPORT_SCOPE_TYPE_LIMIT) scope.types.set(value, type);
    }
    return type;
  }
  return readImportTypeValue(value);
}

function readImportTypeValue(value = "") {
  const text = normalizeText(value).toLowerCase();
  if (!text) return "";
  if (/(수입|입금|받음|급여|매출|대변|credit|income|deposit|money\s*in|\bin\b)/i.test(text)) return "income";
  if (/(지출|출금|사용|결제|구매|매입|차변|debit|expense|withdraw|money\s*out|\bout\b)/i.test(text)) return "expense";
  return "";
}

function importRejection(code = "unsupported_row", rowNumber = 0, raw = "") {
  const [reason, suggestion] = IMPORT_REJECTION_GUIDE[code] || IMPORT_REJECTION_GUIDE.unsupported_row;
  return { row_number: rowNumber, reason_code: code, reason, suggestion, raw: String(raw || "").replace(/\s+/g, " ").trim().slice(0, 240) };
}

function importObjectFromHeaders(headers = [], cells = [], columns = importColumnMetadata(headers), backup = false) {
  const obj = Object.assign(Object.create(null), { __canonical: Object.create(null), __mapped: true, __backup: backup === true, __has_date: columns.some((column) => column.field === "date"), __context: [], __headers: headers, __cells: cells });
  const localMoney = new Set();
  headers.forEach((header, index) => {
    const column = columns[index];
    const key = column.key || `col${index + 1}`;
    const field = column.field;
    const cell = cells[index] ?? "";
    const value = IMPORT_GUARDED_FIELDS.has(field) ? unguardImportText(cell) : cell;
    const moneyField = ["amount", "income", "expense"].includes(field);
    const foreign = column.foreign;
    if (foreign && (moneyField || column.original_money || /금액|amount|통화|currency/i.test(String(header)))) { obj.__foreign_money = true; return; }
    obj[key] = value;
    const local = moneyField && column.local;
    if (["date", "amount", "income", "expense", "memo", "type", "category", "payment"].includes(field)) obj.__context.push(value);
    if (field && !["ignore", "time"].includes(field) && String(value).trim() && !(field === "payment" && isInstallmentLabel(value))) {
      if (local || !obj.__canonical[field]) obj.__canonical[field] = String(value).trim();
      else if (field === "memo" || field === "category") obj.__canonical[field] = `${obj.__canonical[field]} / ${String(value).trim()}`;
      if (local) localMoney.add(field);
    }
  });
  obj.__local_money = localMoney.size > 0;
  return obj;
}

function alignImportCells(headers = [], cells = [], columns = null) {
  const out = safeArray(cells).slice();
  const warnings = [];
  if (!headers.length || out.length <= headers.length) return { cells: out, warnings, matched: true };
  const fields = (columns || importColumnMetadata(headers)).map((column) => column.exact);
  const moneyIndexes = fields.map((field, index) => (["amount", "income", "expense"].includes(field) ? index : -1)).filter((index) => index >= 0);
  for (const index of moneyIndexes) {
    while (out.length > headers.length && index + 1 < out.length) {
      const left = String(out[index] || "").normalize("NFKC").trim().replace(/[₩￦$\s]/g, "");
      const right = String(out[index + 1] || "").normalize("NFKC").trim().replace(/[₩￦$\s]/g, "");
      if (!/^\(?-?\d{1,3}(?:,\d{3})*$/.test(left) || !/^\d{3}(?:\.\d+)?(?:원|krw|won)?\)?$/i.test(right)) break;
      out.splice(index, 2, `${out[index]},${out[index + 1]}`);
      if (!warnings.includes("따옴표 없이 쉼표가 들어간 금액을 한 값으로 복원했습니다.")) warnings.push("따옴표 없이 쉼표가 들어간 금액을 한 값으로 복원했습니다.");
    }
  }
  if (out.length > headers.length) {
    if (moneyIndexes.some(index => /^[-−]?\d+$/.test(String(out[index] || "").trim()) && /^\d{1,2}$/.test(String(out[index + 1] || "").trim()))) return { cells: out, warnings, matched: false };
    const memoIndex = fields.findIndex((field) => field === "memo");
    if (memoIndex >= 0 && memoIndex < out.length) {
      const extra = out.length - headers.length;
      out.splice(memoIndex, extra + 1, out.slice(memoIndex, memoIndex + extra + 1).join(", "));
      warnings.push("따옴표 없이 쉼표가 들어간 내용을 한 값으로 합쳤습니다.");
    }
  }
  return { cells: out, warnings, matched: out.length === headers.length };
}

// V22.9.80 T-28: ‘키: 값’ 줄에서 분류를 추정하는 데 쓰는 항목. 내용·분류·구분·원문의 값만 글로 읽는다(날짜·금액·결제수단·지출자·제외 열은 글이 아니다).
const IMPORT_EVIDENCE_FIELDS = new Set(["memo", "category", "type", "raw_text"]);

function importKeyValueObject(line = "") {
  const parts = String(line || "").split(/[|;\t]+/).map((part) => part.trim()).filter(Boolean);
  const pairs = [];
  // V22.9.80 T-28: 분류 근거로 읽을 말. 위 항목의 값과 ‘키: 값’ 꼴이 아닌 글만 든다. 알 수 없는 키(‘지점: 인터넷’)의 값과 날짜·금액·결제수단
  // 같은 항목은 뺀다 — 예전에는 줄 전체를 근거로 써서 ‘인터넷’이 통신비를 정했다(제목이 있는 표가 읽는 열의 글만 근거로 쓰는 것과 같은 기준).
  const evidence = [];
  for (const part of parts) {
    const match = part.match(/^([^:=]{1,40})\s*[:=]\s*(.+)$/);
    const field = match ? canonicalImportField(match[1]) : "";
    if (field) {
      pairs.push([match[1], match[2]]);
      if (IMPORT_EVIDENCE_FIELDS.has(field)) evidence.push(match[2]);
    } else if (!match || !/[A-Za-z가-힣]/.test(match[1])) evidence.push(part);
  }
  if (pairs.length < 2) return null;
  const obj = { __canonical: {}, __cells: pairs.map(([, value]) => value), __evidence: evidence };
  for (const [key, value] of pairs) {
    obj[normalizeImportHeader(key)] = value;
    const field = canonicalImportField(key);
    if (field && field !== "ignore" && !obj.__canonical[field]) obj.__canonical[field] = value;
  }
  return obj;
}

function parseImportJsonTable(text = "", options = {}) {
  const source = String(text || "").trim();
  if (!/^[\[{]/.test(source)) return null;
  try {
    const parsed = JSON.parse(source);
    let records = Array.isArray(parsed) ? parsed : [];
    if (!records.length && parsed && typeof parsed === "object") {
      for (const key of ["transactions", "records", "items", "data", "rows", "history"]) {
        if (Array.isArray(parsed[key])) { records = parsed[key]; break; }
      }
      if (!records.length && Object.values(parsed).some((value) => typeof value !== "object" || value === null)) records = [parsed];
    }
    records = records.filter((record) => record && typeof record === "object" && !Array.isArray(record));
    const totalRecords = records.length;
    records = records.slice(0, (options.maxRows || 10000) + 100);
    if (!records.length) return null;
    const flatRecords = records.map((record) => {
      const out = Object.create(null);
      for (const [key, value] of Object.entries(record)) {
        if (value && typeof value === "object" && !Array.isArray(value)) {
          for (const [childKey, childValue] of Object.entries(value)) out[`${key}.${childKey}`] = childValue;
        } else out[key] = Array.isArray(value) ? value.join(" ") : value;
      }
      return out;
    });
    const headers = [...new Set(flatRecords.flatMap((record) => Object.keys(record)))];
    if (headers.length > 4096 || headers.length * flatRecords.length > 250000) {
      const row = ["JSON structure limit"];
      Object.defineProperty(row, "csv_error", { value: "structure_limit" });
      const table = [row]; table.limited = true; table.total_rows = totalRecords + 1; return table;
    }
    const table = [headers, ...flatRecords.map((record) => headers.map((header) => record[header] == null ? "" : String(record[header])))];
    table.total_rows = totalRecords + 1;
    return table;
  } catch (err) {
    return null;
  }
}

// V22.9.80 T-28: 제목 행이 없는 줄(‘키: 값’ 줄·머리글 없는 표)에서 분류를 추정할 근거 글. 예전에는 줄 전체를 썼다.
//  · ‘키: 값’ 줄은 importKeyValueObject 가 모은 글(읽는 키의 값과 키 없는 글)만 쓴다 — 알 수 없는 키(‘지점: 인터넷’)의 값은 뺀다.
//  · 머리글 없는 표는 칸의 뜻을 모르므로 금액·날짜·결제수단으로 읽은 것만 뺀다: 날짜나 금액으로 읽히는 칸은 통째로, 결제수단은 그 판정을 한 낱말
//    (‘카페이’·‘신한카드’)만 칸 안에서 지운다. 나머지 글은 그대로 근거다(칸의 뜻을 모르므로 ‘인터넷’ 같은 칸이 남는 것은 어쩔 수 없다).
// 제목 있는 표는 읽는 열의 글(contextText)이라 그대로다.
function importCategoryEvidence(obj = {}, contextText = "", cells = [], payment = "", options = {}) {
  if (obj.__mapped === true) return contextText;
  if (Array.isArray(obj.__evidence)) return obj.__evidence.join(" ");
  const paymentWord = payment ? inputPaymentPatterns().methods.find(([, method]) => method === payment)?.[0] : null;
  const pieces = [];
  for (const cell of safeArray(cells).length ? cells : [contextText]) {
    const piece = String(cell ?? "").trim();
    if (!piece || parseImportDateCell(piece, options) || parseImportAmountCell(piece).amount > 0) continue;
    pieces.push(paymentWord ? normalizeText(piece).replace(paymentWord, " ") : piece);
  }
  return pieces.join(" ");
}

function normalizeImportedRecordDetailed(obj = {}, householdId = "", raw = "", cells = [], defaultUserId = "", options = {}) {
  const rawText = String(raw || safeArray(cells).join(" ") || Object.values(obj).filter((v) => typeof v !== "object").join(" ")).replace(/\s+/g, " ").trim();
  options = { ...options, dateContext: importDateContext(options) };
  const contextCells = obj.__mapped === true ? obj.__context : cells;
  const contextText = obj.__mapped === true ? contextCells.join(" ") : rawText;
  const warnings = [];
  const natural = !!options.natural;
  const backup = obj.__backup === true;
  const currency = canonicalImportValue(obj,"currency");
  if (currency && !/^(?:KRW|WON|원|원화|₩|￦)$/i.test(String(currency).trim()) && !obj.__local_money) return {row:null,rejection:importRejection("ambiguous_amount",options.rowNumber,rawText),warnings:["원화 통화와 금액을 확인해 주세요. 외화는 자동 환산하지 않습니다."]};
  if (obj.__foreign_money && !obj.__local_money) return {row:null, rejection:importRejection("ambiguous_amount",options.rowNumber,rawText), warnings:["원화 금액 열을 확인해 주세요. 외화는 자동 환산하지 않습니다."]};
  const dateVal = canonicalImportValue(obj, "date");
  // V22.9.37 감사 N5·D6: 날짜 열이 있는 행은 그 칸에서만 날짜를 읽는다. 비었거나 해석되지 않으면 다른 칸(금액 38000 →
  // 2004년)에서 날짜를 찍어 내지 않고 missing_date·invalid_date 로 확인 필요에 보낸다. 날짜 열이 없는 행만 예전처럼
  // 행 안의 다른 값과 자연어에서 날짜를 찾는다(엑셀 일련번호 제외).
  const resolveImportRowDate = (opts) => {
    let value = dateVal ? parseImportDateCell(dateVal, { ...opts, allowSerial: true }) : "";
    if (!value && dateVal && /[가-힣]/.test(dateVal)) value = importDateFromFreeText(dateVal, opts);
    if (!value && !importHasDateField(obj)) value = findImportDateInValues(contextCells, opts) || importDateFromFreeText(contextText, opts);
    return value;
  };
  let transactionDate = resolveImportRowDate(options);
  // V22.9.76 감사 E-4: ‘선택한 연도’ 기준이면 연도 없는 날짜를 그 해로 둔다. 그 결과가 오늘 뒤 날짜이고 기본 기준(183일 넘게
  // 뒤면 전년, 웹·카카오와 같음)과 다르면(1월에 가져온 12/28 → 올해 12월) 미래 날짜로 조용히 저장하지 않게 경고와 확인 필요를 남긴다.
  let yearBasisReview = false;
  if (transactionDate && options.dateContext.mode === "selected") {
    const reference = String(options.dateContext.reference_date || "");
    const basisDate = resolveImportRowDate({ ...options, dateContext: { ...options.dateContext, mode: "default", year: Number(reference.slice(0, 4)) } });
    if (basisDate && basisDate !== transactionDate && transactionDate > reference) {
      yearBasisReview = true;
      warnings.push(`연도 없는 날짜를 선택한 ${options.dateContext.year}년으로 읽어 오늘 뒤 날짜(${transactionDate})가 됐습니다. 지난 거래라면 ${basisDate}입니다. 확인 후 저장하세요.`);
    }
  }
  if (!transactionDate && natural) {
    transactionDate = options.dateContext.reference_date;
    warnings.push("날짜가 없어 오늘 날짜로 보정했습니다.");
  }
  if (!transactionDate) return { row: null, rejection: importRejection(dateVal ? "invalid_date" : "missing_date", options.rowNumber, rawText), warnings };

  const incomeInfo = parseImportAmountCell(canonicalImportValue(obj, "income"));
  const expenseInfo = parseImportAmountCell(canonicalImportValue(obj, "expense"));
  const amountInfo = parseImportAmountCell(canonicalImportValue(obj, "amount"));
  if ([incomeInfo, expenseInfo, amountInfo].some((info) => info.present && !info.valid)) return { row: null, rejection: importRejection("invalid_amount", options.rowNumber, rawText), warnings };
  if (incomeInfo.amount > 0 && expenseInfo.amount > 0) return { row: null, rejection: importRejection("both_income_expense", options.rowNumber, rawText), warnings };

  let chosen = incomeInfo.amount > 0 ? incomeInfo : expenseInfo.amount > 0 ? expenseInfo : amountInfo;
  if (/\$|¥|USD|EUR|JPY|달러|유로|엔화/i.test(chosen.raw || "")) return {row:null,rejection:importRejection("ambiguous_amount",options.rowNumber,rawText),warnings:["외화 금액을 원화로 자동 환산하지 않습니다."]};
  let forcedType = incomeInfo.amount > 0 ? "income" : expenseInfo.amount > 0 ? "expense" : "";
  const anyAmountPresent = amountInfo.present || incomeInfo.present || expenseInfo.present;
  if (!chosen.amount && !canonicalImportValue(obj, "amount") && !canonicalImportValue(obj, "income") && !canonicalImportValue(obj, "expense")) {
    const amountCandidates = [];
    for (const cell of contextCells || []) {
      if (!String(cell || "").trim() || parseImportDateCell(cell, options) || normalizeImportTypeValue(cell)) continue;
      const info = parseImportAmountCell(cell);
      if (info.amount > 0) amountCandidates.push(info);
    }
    const unique = [...new Map(amountCandidates.map((item) => [item.amount, item])).values()];
    if (unique.length === 1) { chosen = unique[0]; warnings.push("금액 제목이 없어 행의 숫자에서 금액을 찾았습니다."); }
    else if (unique.length > 1) return { row: null, rejection: importRejection("ambiguous_amount", options.rowNumber, rawText), warnings };
  }

  let naturalParsed = null;
  if (!chosen.amount && !anyAmountPresent) {
    naturalParsed = parseTransaction(contextText, {});
    if (naturalParsed.ok) chosen = { amount: naturalParsed.amount, negative: false, present: true, valid: true, raw: String(naturalParsed.amount) };
  }
  if (!chosen.amount) return { row: null, rejection: importRejection(anyAmountPresent ? "invalid_amount" : "missing_amount", options.rowNumber, rawText), warnings };
  if (Math.abs(Math.round(Number(chosen.amount || 0))) > MAX_TRANSACTION_AMOUNT) {
    return { row: null, rejection: importRejection("amount_too_large", options.rowNumber, rawText), warnings };
  }

  const typeVal = canonicalImportValue(obj, "type");
  const normalizedType = normalizeImportTypeValue(typeVal);
  // V22.9.37 감사 T9: 문맥으로 구분을 정할 때는 칸을 구분자 대신 공백으로 이어 본다. "…,급여,월급,…" 처럼 쉼표에
  // 붙은 수입 말은 단어 경계(공백) 규칙에 걸리지 않아 월급·판매가 지출이 됐다. 규칙 자체는 공용 detectType(D2)이다.
  const cellsText = safeArray(contextCells).length > 1 ? contextCells.map((cell) => String(cell ?? "")).join(" ") : contextText;
  // V22.9.37 감사 T10: 파일 전체가 부호로 수입·지출을 적은 내보내기(음수 = 지출, 양수 = 수입)면 음수를 환불로 뒤집지 않는다.
  const signedFile = options.signConvention === "signed";
  let type = normalizedType || forcedType || (chosen.negative ? "expense" : "");
  if (!type && signedFile) {
    type = "income";
    if (detectType(cellsText) === "expense") warnings.push("파일 전체의 부호 규칙(양수 = 수입)으로 수입 처리했습니다. 내용이 지출로 보여 확인이 필요합니다.");
  }
  if (!type) {
    type = naturalParsed?.type || detectType(cellsText);
    if (typeVal) warnings.push(`구분 ‘${String(typeVal).slice(0, 30)}’을 직접 해석하지 못해 문맥으로 ${type === "income" ? "수입" : "지출"} 처리했습니다.`);
  }
  type = type === "income" ? "income" : "expense";
  // V22.9.26: 구분 열이 지출인데 금액이 음수면 카드사 명세서의 취소·환불 표기다. 양수 지출로
  // 더하면 원거래와 취소가 둘 다 지출로 집계된다. 환급(수입)으로 돌리고 확인 표시를 남긴다.
  let refundFlipped = false;
  // V22.9.79 감사 E-15: 이 앱이 내보낸 백업 CSV 는 구분(수입·지출)이 이미 정해져 있고 취소·환불 표기를 풀어 읽을 파일이 아니므로 메모의 ‘취소’
  // 같은 말로 확인 필요 표시를 하지 않는다(예전에는 그런 행이 기본 선택에서 빠져 복원 때 조용히 빠졌다).
  const cancellation = !backup && /취소|승인취소|결제취소|cancel(?:led|lation)?|refund/i.test(contextText) && !/취소\s*수수료/.test(contextText);
  if (cancellation && !chosen.negative) warnings.push("취소 거래입니다. 원거래·취소 금액과 구분을 확인한 뒤 직접 선택하세요.");
  const genericNegative = chosen.negative && !String(typeVal || "").trim() && !forcedType;
  if (!signedFile && chosen.negative && (normalizedType === "expense" || forcedType === "expense" || genericNegative)) {
    type = "income";
    refundFlipped = true;
    warnings.push("음수 금액이라 취소·환불(수입)로 처리했습니다. 확인 후 저장하세요.");
  }
  // V22.9.76 감사 P1-3: 구분 열이 수입인데 금액이 음수면 수입 취소·정정이다. 예전에는 부호를 떼어 양수 수입으로 저장해
  // 수입이 오히려 늘었다. 음수 지출과 같은 규칙으로 반대 구분(지출)으로 돌리고, 확인 표시를 남겨 미리보기에서 기본 선택하지 않는다.
  let incomeReversed = false;
  if (!signedFile && chosen.negative && !refundFlipped && (normalizedType === "income" || (!normalizedType && forcedType === "income"))) {
    type = "expense";
    incomeReversed = true;
    warnings.push("음수 수입 금액이라 수입 취소·정정(지출)으로 처리했습니다. 확인 후 저장하세요.");
  }

  let paymentVal = canonicalImportValue(obj, "payment");
  if (!paymentVal && typeVal && !normalizeImportTypeValue(typeVal) && /(카드|현금|계좌|페이|은행)/i.test(typeVal)) paymentVal = typeVal;
  const categoryVal = canonicalImportValue(obj, "category");
  const memoVal = canonicalImportValue(obj, "memo");
  const rawField = canonicalImportValue(obj, "raw_text");
  if (categoryVal.length > 80 || [paymentVal, categoryVal].some((value) => /[\u0000-\u001f\u007f]/.test(value))) return { row: null, rejection: importRejection("invalid_field", options.rowNumber, rawText), warnings };
  // V22.9.79 감사 E-15: 이 앱이 내보낸 백업 CSV 는 빈 결제수단·분류·내용 칸이 "값이 없음"이다. 내용 글에서 결제수단·분류를 추측하거나 빈 내용을
  // 분류 이름으로 채우지 않고 파일에 적힌 그대로 되살린다(분류가 비면 구분별 기본 분류).
  const payment = paymentVal ? String(paymentVal).trim() : backup ? "" : (naturalParsed?.payment_method || detectPaymentMethod(contextText));
  // 분류 근거 글(T-28)은 분류와 메모(U-11)가 함께 쓰므로 한 번만 만든다.
  let evidenceText = null;
  const evidence = () => (evidenceText ??= importCategoryEvidence(obj, contextText, cells, payment, options));
  const category = refundFlipped ? "환급" : incomeReversed ? "기타지출" : (categoryVal || (backup ? (type === "income" ? "기타수입" : "기타지출") : naturalParsed?.category || inferCategory(obj.__mapped === true ? contextText : `${evidence()} ${memoVal}`, type)));
  // V22.9.81 U-11: 제목 없는 줄(‘키: 값’ 줄·칸이 여럿인 머리글 없는 표)의 메모는 읽는 키의 값과 남은 글(분류 근거와 같은 글)로만 만든다. 예전에는
  // 줄 전체를 다듬어 키 이름(‘날짜 금액 지점 인터넷’)과 구분자(‘, ,스타벅스,인터넷’)가 메모가 됐다. 제목 있는 표·칸이 하나인 자연어 줄은 예전 그대로다.
  const memoSource = obj.__mapped !== true && (Array.isArray(obj.__evidence) || safeArray(cells).length > 1) ? evidence() : contextText;
  const memo = backup ? memoVal : (memoVal || naturalParsed?.memo || cleanMemo(memoSource, chosen.raw || String(chosen.amount), type, payment, category) || category);
  const textIssue = importStorageTextIssue({ memo, payment_method: payment });
  if (textIssue) return { row: null, rejection: importRejection(textIssue, options.rowNumber, rawText), warnings };
  const spender = canonicalImportValue(obj, "spender");
  const row = {
    household_id: householdId,
    ...(defaultUserId ? { user_id: defaultUserId } : {}),
    type,
    amount: Math.abs(Math.round(chosen.amount)),
    category: String(category || (type === "income" ? "기타수입" : "기타지출")).slice(0, 80),
    memo: String(memo || ""),
    payment_method: String(payment || ""),
    transaction_date: transactionDate,
    source: options.source || "import_smart",
    // 백업 CSV 에는 원문(raw_text) 열이 없고 내보낼 때 내용 칸에 메모(메모가 비면 원문)를 적는다. 열 전체를 이은 글(기록ID·출처까지 든 줄)을
    // 원문으로 남기지 않고 내용 칸 값을 원문으로 둔다 — 메모가 비어 있던 기록은 원문이 그대로 돌아온다.
    raw_text: String(rawField || (backup ? memoVal : rawText)).slice(0, 500),
    _import_spender: String(spender || "").slice(0, 80),
    _import_warnings: warnings.slice(),
    _import_needs_confirmation: refundFlipped || incomeReversed || cancellation || yearBasisReview,
  };
  return { row, rejection: null, warnings, twoDigitYear: isTwoDigitYearImportDate(dateVal) };
}

// V22.9.77 감사 E-1: 해석 한 번 동안 KST 현재 시각 형식기를 하나만 쓴다(자연어 행마다 새로 만들던 것). 결과는 그대로다.
// V22.9.79 감사 E-1: 같은 범위에서 날짜 칸·구분 칸의 해석 결과와 같은 글의 정규화 결과도 기억한다(importParseScope, withNormalizeTextScope).
// 해석이 끝나면(예외로 끝나도) 버린다. 검사용: options.scopeMemo === false 면 기억 없이 예전처럼 매번 계산한다(결과는 같다).
function parseFlexibleImportRecords(rawText, householdId, defaultUserId = "", options = {}) {
  if (options?.scopeMemo === false) return withKstNowScope(() => parseFlexibleImportRecordsInScope(rawText, householdId, defaultUserId, options));
  const outer = importParseScope;
  importParseScope = { dates: new WeakMap(), types: new Map() };
  try {
    return withNormalizeTextScope(() => withKstNowScope(() => parseFlexibleImportRecordsInScope(rawText, householdId, defaultUserId, options)));
  } finally {
    importParseScope = outer;
  }
}

function parseFlexibleImportRecordsInScope(rawText, householdId, defaultUserId = "", options = {}) {
  const text = String(rawText || "").replace(/^\ufeff/, "");
  const result = { rows: [], accepted: [], rejected: [], skipped: 0, warnings: [], mappings: [], delimiter: "", format: "natural_text", header_row: 0, total_rows: 0, sign_convention: { mode: "default", amount_rows: 0, negative_rows: 0 }, two_digit_year_rows: 0 };
  if (!text.trim()) return result;
  const maxRows = Math.min(10000, Math.max(100, Number(options.maxRows || 5000)));
  options = { ...options, dateContext: importDateContext(options) };
  result.date_basis = { ...options.dateContext };
  const requestedDateContext = { ...options.dateContext };
  if (new TextEncoder().encode(text).length > 5 * 1024 * 1024) {
    result.rejected.push(importRejection("over_limit", 1, "입력은 5 MiB 이하여야 합니다.")); result.skipped = 1; result.analysis_complete = false; return result;
  }
  const jsonTable = parseImportJsonTable(text, { maxRows });
  const delimiter = jsonTable ? "" : detectImportDelimiter(text);
  const table = jsonTable || parseDelimitedText(text, delimiter, { retainRows: maxRows + 100 });
  result.delimiter = jsonTable ? "JSON" : delimiter === "\t" ? "탭(TSV)" : delimiter === "," ? "쉼표(CSV)" : delimiter === ";" ? "세미콜론" : delimiter === "|" ? "파이프" : "자연어";
  result.total_rows = table.total_rows ?? table.length;
  result.physical_lines = table.physical_lines || 0;
  result.analysis_complete = !table.limited && result.total_rows <= maxRows;
  result.total_rows_known = !table.limited;
  if (table.limited) result.warnings.push("표 구조의 안전 한도에 도달해 뒤 입력은 분석하지 않았습니다. 원본 전체 분석이 완료된 결과가 아닙니다.");
  let headerIndex = -1;
  for (let i = 0; i < Math.min(100, table.length); i++) {
    if (!table[i].csv_error && !isImportSheetMarker(table[i]) && looksLikeImportHeader(table[i], options)) { headerIndex = i; break; }
  }
  result.header_row = headerIndex >= 0 ? headerIndex + 1 : 0;
  result.format = headerIndex >= 0 ? "table" : (delimiter ? "headerless_table" : "natural_text");
  // V22.9.37 감사 T10: 본 해석 전에 파일 전체의 부호 규칙을 정한다(제목 행이 있는 표만).
  let signConvention = detectImportSignConvention(table, headerIndex, maxRows, options);
  let twoDigitYearRows = 0;

  const addRejected = (rejection) => {
    const location = table[rejection.row_number - 1]?.source_location;
    if (location) rejection.source_location = { ...location, section: sectionId };
    result.rejected.push(rejection); result.warnings.push(`${location?.start_line || rejection.row_number}행: ${rejection.reason}`);
  };
  let sectionId = 1;
  let currentHeaders = headerIndex >= 0 ? table[headerIndex] : [];
  let columns = effectiveImportColumns(currentHeaders, sectionId, options);
  let backupExport = isBackupExportColumns(columns);
  // An unambiguous explicit year in a dated table is stronger evidence than a
  // missing year. No request-global clock or module-load year is used.
  if (headerIndex >= 0 && !options.dateContext.file_year) {
    const years = new Set();
    let yearColumns = columns, yearSectionId = 1;
    for (let i = headerIndex + 1; i < Math.min(table.length, maxRows); i++) {
      if (table[i].csv_error || isImportSheetMarker(table[i])) continue;
      if (looksLikeImportHeader(table[i], options)) { yearColumns = effectiveImportColumns(table[i], ++yearSectionId, options); continue; }
      yearColumns.forEach((column, index) => {
        const value = String(table[i][index] || "");
        if (column.field !== "date" || !/(?:20\d{2})|^\d{1,2}[./-]\d{1,2}[./-]\d{2}(?:\s|$)/.test(value)) return;
        const date = parseImportDateCell(value, options); if (date) years.add(Number(date.slice(0, 4)));
      });
    }
    if (years.size === 1) {
      const year = [...years][0];
      options.dateContext = { ...options.dateContext, mode: "file", requested_mode: options.dateContext.mode, year, file_year: year };
      result.date_basis = { ...options.dateContext };
    }
  }
  if (options.mappingMetadata || options.mappingDelta !== undefined) {
    // Freeze source header identities after the baseline file-year pass. A
    // mapping edit must not silently retarget section IDs when a leap date
    // changes whether a data row resembles another header.
    options.mappingPlan = importMappingPlan(table, headerIndex, maxRows, options);
    result.mapping_delta = options.mappingPlan.delta;
    columns = effectiveImportColumns(currentHeaders, sectionId, options);
    if (result.mapping_delta.length) {
      const years = new Set();
      let dateColumns = columns, dateHeaders = currentHeaders, dateSection = 1;
      for (let i = headerIndex + 1; headerIndex >= 0 && i < Math.min(table.length, maxRows); i++) {
        if (table[i].csv_error || isImportSheetMarker(table[i])) continue;
        if (options.mappingPlan.headerIndexes.has(i)) { dateHeaders = table[i]; dateColumns = effectiveImportColumns(dateHeaders, ++dateSection, options); continue; }
        const aligned = alignImportCells(dateHeaders, table[i], dateColumns);
        if (!aligned.matched) continue;
        dateColumns.forEach((column, index) => {
          const value = String(aligned.cells[index] || "");
          if (column.field !== "date" || !/(?:20\d{2})|^\d{1,2}[./-]\d{1,2}[./-]\d{2}(?:\s|$)/.test(value)) return;
          const date = parseImportDateCell(value, options); if (date) years.add(Number(date.slice(0, 4)));
        });
      }
      const mode = requestedDateContext.requested_mode || requestedDateContext.mode;
      const basis = { reference_date: requestedDateContext.reference_date, max_year: requestedDateContext.max_year, mode, year: mode === "default" ? Number(requestedDateContext.reference_date.slice(0, 4)) : Number(options.importYear || requestedDateContext.year) };
      options.dateContext = years.size === 1 ? { ...basis, mode: "file", requested_mode: mode, year: [...years][0], file_year: [...years][0] } : basis;
      result.date_basis = { ...options.dateContext };
      signConvention = detectImportSignConvention(table, headerIndex, maxRows, options);
    }
    if (options.mappingMetadata) result.mapping_schema = importMappingSchema(table, options.mappingPlan, options);
  }
  result.sign_convention = signConvention;
  if (signConvention.mode === "signed") result.warnings.push(`부호 규칙: 금액이 있는 ${signConvention.amount_rows}행 중 ${signConvention.negative_rows}행이 음수라 음수를 지출, 양수를 수입으로 읽었습니다.`);
  const registerMappings = (headers) => {
    for (const [index, header] of headers.entries()) {
      const field = columns[index].field;
      if (!field) continue;
      const key = `${sectionId}:${index}`;
      result.mappings.push({ key, section: sectionId, column_index: index, source: String(header).trim(), field, label: IMPORT_FIELD_LABELS[field] || field });
    }
  };
  if (currentHeaders.length) registerMappings(currentHeaders);

  for (let i = 0; i < Math.min(table.length, maxRows); i++) {
    const rowNumber = i + 1;
    const cells = table[i];
    const raw = cells.join(delimiter || " | ").trim();
    if (cells.csv_error) {
      const rejection = importRejection(cells.csv_error === "structure_limit" ? "structure_limit" : "invalid_csv", rowNumber, raw);
      rejection.syntax_error = cells.csv_error;
      if (cells.csv_error === "unclosed_quote") rejection.suggestion = "이 줄에서 연 큰따옴표가 파일 끝까지 닫히지 않았습니다. 첫 줄바꿈 뒤의 거래는 따로 복구하여 분석했습니다.";
      if (cells.csv_error === "unexpected_after_quote") rejection.suggestion = "닫는 큰따옴표 뒤에는 구분자나 줄바꿈만 올 수 있습니다. 뒤에 붙은 문자를 확인해 주세요.";
      addRejected(rejection);
      result.analysis_complete = false; continue;
    }
    if (!raw) continue;
    if (i < headerIndex) { addRejected(importRejection("preamble", rowNumber, raw)); continue; }
    if (i === headerIndex) continue;
    if (isImportSheetMarker(cells)) { addRejected(importRejection("preamble", rowNumber, raw)); continue; }
    if (options.mappingPlan ? options.mappingPlan.headerIndexes.has(i) : looksLikeImportHeader(cells, options)) {
      sectionId++;
      currentHeaders = cells;
      columns = effectiveImportColumns(currentHeaders, sectionId, options);
      backupExport = isBackupExportColumns(columns);
      registerMappings(currentHeaders);
      addRejected(importRejection("repeated_header", rowNumber, raw));
      continue;
    }
    // V22.9.37 감사 T9: 합계 칸은 칸 단위로 본다(제목 행 판정 뒤 — "잔액" 열이 있는 제목 행을 합계로 오인하지 않는다).
    let obj = null;
    let natural = headerIndex < 0;
    let effectiveCells = cells;
    let alignmentWarnings = [];
    if (currentHeaders.length) {
      const aligned = alignImportCells(currentHeaders, cells, columns);
      if (!aligned.matched) { addRejected(importRejection("column_mismatch", rowNumber, raw)); continue; }
      effectiveCells = aligned.cells;
      alignmentWarnings = aligned.warnings;
      obj = importObjectFromHeaders(currentHeaders, effectiveCells, columns, backupExport);
    } else obj = importKeyValueObject(raw) || { __canonical: {}, __cells: cells.slice() };
    const summaryCells = obj.__mapped === true ? obj.__context : cells;
    // V22.9.80 T-25: 이 앱이 내보낸 백업 표(열 9개)의 날짜가 읽히는 행은 기록이다. 합계 행 거르기는 은행·카드사 파일에 끼는 합계 줄을 위한 것이라,
    // 메모가 ‘카드값 합계’·‘7월 소계’로 끝나는 기록까지 합계 행으로 빼고 있었다(되살리기에서 조용히 빠졌다). 날짜가 읽히지 않는 행(엑셀에서 손으로
    // 더한 ‘합계’ 줄)은 예전처럼 합계 행 안내와 함께 제외한다.
    const backupRecord = obj.__backup === true && !!parseImportDateCell(canonicalImportValue(obj, "date"), { ...options, allowSerial: true });
    if (!backupRecord && isImportSummaryRow(summaryCells, summaryCells.join(" "), options)) { addRejected(importRejection("summary_row", rowNumber, raw)); continue; }
    if (obj && Object.keys(safeObject(obj.__canonical)).length) natural = false;
    if (!currentHeaders.length && delimiter === "," && /\d{1,3},\d{3}(?:,\d{3})*(?:원)?(?:\s|$)/.test(raw) && !findImportDateInValues(cells, options)) effectiveCells = [raw];
    const detailed = normalizeImportedRecordDetailed(obj, householdId, raw, effectiveCells, defaultUserId, { ...options, natural, rowNumber, source: options.source || "import_smart", signConvention: signConvention.mode });
    if (!detailed.row) { addRejected(detailed.rejection || importRejection("unsupported_row", rowNumber, raw)); continue; }
    if (detailed.twoDigitYear) twoDigitYearRows += 1;
    if (alignmentWarnings.length) {
      detailed.warnings = [...alignmentWarnings, ...safeArray(detailed.warnings)];
      detailed.row._import_warnings = [...alignmentWarnings, ...safeArray(detailed.row._import_warnings)];
    }
    result.rows.push(detailed.row);
    result.accepted.push({ row_number: rowNumber, source_location: { ...(cells.source_location || { record: rowNumber }), section: sectionId }, raw: raw.slice(0, 240), row: detailed.row, warnings: detailed.warnings || [] });
  }
  if (result.total_rows > maxRows) {
    for (let i = maxRows; i < Math.min(table.length, maxRows + 100); i++) addRejected(importRejection("over_limit", i + 1, table[i].join(delimiter || " | ")));
    result.unprocessed_rows = result.total_rows - maxRows;
    if (result.total_rows > maxRows + 100) result.warnings.push(`${result.total_rows - maxRows - 100}개 행은 표시 한도를 넘어 요약만 남겼습니다. 이 행들은 분석하지 않았습니다.`);
  }
  result.two_digit_year_rows = twoDigitYearRows;
  if (twoDigitYearRows) result.warnings.push(`두 자리 연도 날짜(예: 10/12/25) ${twoDigitYearRows}행은 월/일/연도 순서로 읽었습니다. 날짜 열을 확인해 주세요.`);
  result.skipped = result.rejected.length;
  return result;
}

function parseImportedRecords(rawText, householdId, defaultUserId = "") {
  return parseFlexibleImportRecords(rawText, householdId, defaultUserId, { source: "import_smart", maxRows: 5000 });
}

function normalizeImportedArray(cells, householdId, raw, defaultUserId = "") {
  return normalizeImportedRecordDetailed({ __canonical: {}, __cells: cells }, householdId, raw || cells.join(" "), cells, defaultUserId, { natural: true, rowNumber: 1, source: "import_smart" }).row;
}

function normalizeImportedObject(obj, householdId, raw, cells = [], defaultUserId = "") {
  return normalizeImportedRecordDetailed(obj, householdId, raw, cells, defaultUserId, { natural: false, rowNumber: 1, source: "import_smart" }).row;
}

async function handleAdminCsv(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const householdId = url.searchParams.get("household_id") || "";
  const type = url.searchParams.get("type") || "all";
  const date = url.searchParams.get("date") || "";
  const q = url.searchParams.get("q") || "";
  const quality = url.searchParams.get("quality") || "all";
  const category = url.searchParams.get("category") || "";
  const paymentMethod = url.searchParams.get("payment_method") || "";
  const rows = await fetchAdminRows(env, { month, householdId, type, date, q, quality, category, payment_method: paymentMethod });
  const header = ["date", "type", "amount", "category", "memo", "payment_method", "source", "raw_text"];
  const lines = [header.join(",")];
  for (const t of rows) {
    const row = [t.transaction_date, t.type, t.amount, t.category, t.memo, t.payment_method, t.source, t.raw_text].map(csvCell);
    lines.push(row.join(","));
  }
  return new Response("\ufeff" + lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accountbook_${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}
// @build:exports-start
export {
  IMPORT_EDITABLE_FIELDS, IMPORT_REJECTION_GUIDE, MY_IMPORT_WRITES_ENABLED_V22959, alignImportCells,
  canonicalImportField, cleanImportedRowsForInsert, commitImportedTransactionRows, handleAdminCsv,
  handleAdminImportJson, handleImportTemplateCsv, handleImportTemplateXls, importRejection,
  importStorageTextIssue, normalizeImportedRecordDetailed, parseFlexibleImportRecords,
};
// @build:exports-end
