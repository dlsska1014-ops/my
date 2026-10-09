// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { jsonResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { MAX_TRANSACTION_AMOUNT } from "../admin/transactions-households.js";
import { fetchAdminRows, fetchHouseholdMembers } from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { csvCell } from "../admin/import-history-rollback.js";
import { activeSpenderExists } from "../my/transactions.js";
import { readJson } from "../api/admin-api.js";
import { supabase } from "../data/supabase-client.js";
import { parseTransaction } from "../nlu/transaction-parser.js";
import { detectType, normalizeText, parseAmountValue } from "../nlu/amount-parser.js";
import {
  currentMonthKst, detectPaymentMethod, formatDate, normalizePaymentMethod, nowKstDate,
  parseDateStrict, parseExplicitDateFromText, safeYmd, validMonth,
} from "../nlu/date-payment.js";
import { cleanMemo, inferCategory } from "../nlu/category-rules.js";
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

async function handleAdminImportJson(request, env) {
  try {
    if (!(await verifyAdminSession(request, env))) return jsonResponse({ ok: false, error: "unauthorized", message: "로그인 세션이 만료되었습니다. 새로고침 후 다시 로그인하세요." }, 401);
    const body = await readJson(request);
    const householdId = String(body.household_id || "").trim();
    if (!householdId) return jsonResponse({ ok: false, error: "household_id_required", message: "가계부를 먼저 선택해주세요." }, 400);
    const rawText = String(body.raw_text || "");
    const defaultUserId = String(body.user_id || "").trim();
    const members = await fetchHouseholdMembers(env, householdId);
    if (!defaultUserId || !activeSpenderExists(members, defaultUserId)) {
      return jsonResponse({ ok: false, error: "spender_required", message: "업로드 기본 지출자를 현재 가계부 참여자 중에서 선택해주세요." }, 400);
    }
    const parsed = parseImportedRecords(rawText, householdId, defaultUserId);
    const rows = cleanImportedRowsForInsert(parsed.rows.slice(0, 1000)).map((row) => ({ ...row, id: row.id || crypto.randomUUID(), user_id: row.user_id || defaultUserId }));
    if (!rows.length) return jsonResponse({ ok: false, error: "no_valid_rows", message: "저장 가능한 행을 찾지 못했습니다.", skipped: parsed.skipped }, 400);
    if (rows.some((row) => !activeSpenderExists(members, row.user_id))) return jsonResponse({ ok: false, error: "spender_not_member", message: "가져오기 행의 지출자가 현재 가계부의 활성 참여자가 아닙니다." }, 400);
    const result = await supabase(env, "/rest/v1/rpc/accountbook_import_transactions_v227", {
      method: "POST",
      headers: { Prefer: "return=representation" },
      body: JSON.stringify({ p_household_id: householdId, p_rows: rows }),
    });
    const summary = Array.isArray(result) ? result[0] : result;
    return jsonResponse({ ok: true, inserted: Number(summary?.inserted || 0), skipped: parsed.skipped + Number(summary?.duplicates || 0), date_samples: rows.slice(0, 5).map(r => r.transaction_date), warnings: parsed.warnings.slice(0, 20) });
  } catch (err) {
    rememberOpsEvent({ kind: "admin_import_failed", severity: "error", path: "/admin/import/json", method: "POST", detail: safeError(err) });
    return jsonResponse({ ok: false, error: "import_failed", message: "업로드 내용을 저장하지 못했습니다. 기존 기록은 변경되지 않았으니 잠시 후 다시 시도해 주세요." }, 500);
  }
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
    out.amount = Math.max(0, Math.round(Number(out.amount || 0)));
    return out;
  }).filter((row) => row.household_id && row.type && row.amount > 0 && /^20\d{2}-\d{2}-\d{2}$/.test(String(row.transaction_date || "")));
}

const IMPORT_FIELD_ALIASES = Object.freeze({
  currency: ["currency","currencycode","통화","통화코드","거래통화"],
  date: ["날짜","일자","일시","기준일","거래일","거래일자","거래일시","거래시간","사용일","사용일자","사용일시","이용일","이용일자","이용일시","승인일","승인일자","승인일시","결제일","결제일자","결제일시","매입일","작성일","등록일","발생일","회계일","전표일","date","datetime","transactiondate","transactiondatetime","purchasedate","approvaldate","postingdate"],
  type: ["구분","유형","종류","거래구분","거래유형","수입지출","수입지출구분","입출금","입출금구분","차변대변","debitcredit","type","transactiontype","inout"],
  income: ["수입","입금","입금액","수입액","수입금액","받은금액","대변","credit","income","deposit","moneyin"],
  expense: ["지출","출금","출금액","지출액","지출금액","사용금액","사용액","이용액","실지출","실제지출","최종지출","승인금액","결제금액","매입금액","차변","debit","expense","withdrawal","withdraw","moneyout"],
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
  invalid_date: ["날짜 형식을 해석하지 못함", "예: 2026-07-15, 2026.7.15, 7월 15일, 46000(엑셀 날짜) 형식으로 바꿔 주세요."],
  missing_amount: ["금액을 찾지 못함", "금액·지출·수입·입금·출금 열을 추가하거나 ‘12,000원’처럼 적어 주세요."],
  invalid_amount: ["금액 형식을 해석하지 못함", "통화문자와 쉼표는 허용됩니다. 숫자 또는 ‘1만2천원’처럼 입력해 주세요."],
  amount_too_large: ["금액이 허용 범위를 초과함", "한 거래 금액은 20억 원 이하로 바꾼 뒤 다시 확인해 주세요. 자동으로 줄여 저장하지 않습니다."],
  ambiguous_amount: ["금액 후보가 여러 개라 확정하지 못함", "잔액/누계 열은 빼고 실제 거래금액 열의 제목을 금액·지출·수입 중 하나로 바꿔 주세요."],
  column_mismatch: ["제목 수와 값 수가 맞지 않음", "쉼표가 든 내용은 큰따옴표로 감싸거나, CSV 대신 탭으로 구분한 표를 붙여넣어 주세요."],
  both_income_expense: ["수입과 지출 금액이 한 행에 함께 있음", "한 거래 행에는 수입 또는 지출 금액 하나만 남겨 주세요."],
  unsupported_row: ["거래로 판단할 정보가 부족함", "날짜와 금액을 넣거나 ‘어제 점심 12000원 카드’처럼 한 문장으로 적어 주세요."],
  duplicate: ["기존 기록과 중복", "중복 건너뛰기가 켜져 있어 저장하지 않았습니다. 의도한 중복이면 옵션을 끄고 다시 가져오세요."],
  over_limit: ["한 번에 처리할 수 있는 행 수 초과", "파일을 나누거나 MY_IMPORT_LIMIT을 안전 범위에서 조정한 뒤 다시 가져오세요."],
  write_failed: ["저장 안 됨", "이 행은 저장되지 않았어요. 원인을 확인한 뒤 이 행만 다시 가져와 주세요."],
  write_unknown: ["저장 여부 확인 필요", "저장됐는지 확인하지 못했어요. 다시 가져오기 전에 ‘가져온 기록 확인’에서 이 행이 있는지 먼저 확인해 주세요."],
});

function normalizeImportHeader(value) {
  return String(value ?? "").normalize("NFKC").replace(/^\ufeff/, "").toLowerCase().replace(/[^0-9a-z가-힣]/g, "");
}

function canonicalImportField(value = "") {
  const key = normalizeImportHeader(value);
  if (!key) return "";
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    if (aliases.some((alias) => normalizeImportHeader(alias) === key)) return field;
  }
  const candidates = [];
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    for (const alias of aliases) {
      const normalizedAlias = normalizeImportHeader(alias);
      if (normalizedAlias.length >= 2 && (key.includes(normalizedAlias) || normalizedAlias.includes(key))) candidates.push({ field, alias: normalizedAlias });
    }
  }
  candidates.sort((a, b) => b.alias.length - a.alias.length);
  return candidates[0]?.field || "";
}

function canonicalImportHeaderField(value = "") {
  const key = normalizeImportHeader(value);
  if (!key) return "";
  const withoutBracketUnit = normalizeImportHeader(String(value || "").replace(/\([^)]*\)|\[[^\]]*\]/g, ""));
  const variants = [key, withoutBracketUnit, withoutBracketUnit.replace(/외화|원화|USD|EUR|JPY|KRW/gi,""), key.replace(/(?:kst|utc|서울시간|원화|krw|won|원|명|코드)$/i, "")].filter(Boolean);
  for (const [field, aliases] of Object.entries(IMPORT_FIELD_ALIASES)) {
    if (aliases.some((alias) => variants.includes(normalizeImportHeader(alias)))) return field;
  }
  return "";
}

function importHeaderScore(row = []) {
  const cells = safeArray(row);
  const fields = new Set(cells.map(canonicalImportHeaderField).filter((field) => field && field !== "ignore"));
  const hasMoney = ["amount", "income", "expense"].some((field) => fields.has(field));
  // V22.9.26: 날짜나 숫자 금액이 든 행은 제목 행이 아니다. "2026-07-01,지출,4500,스타벅스,카페/간식,카드"
  // 처럼 구분·결제수단 셀이 제목 별칭과 같은 가장 흔한 거래 행이 반복 제목으로 오인돼 저장 0건이 됐다.
  const dataLike = !!findImportDateInValues(cells) || cells.some((cell) => {
    const text = String(cell ?? "").trim();
    return /^[-+]?[\d,]+(?:\.\d+)?\s*원?$/.test(text) && Math.abs(Number(text.replace(/[^\d.-]/g, ""))) >= 1;
  });
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
    const rows = parseDelimitedText(sample, delimiter).slice(0, 30);
    const widths = rows.map((row) => row.length).filter((n) => n > 1);
    if (!widths.length) continue;
    const common = widths.reduce((map, n) => (map[n] = (map[n] || 0) + 1, map), {});
    const stable = Math.max(...Object.values(common));
    const score = widths.length * 10 + stable * 4 + Math.max(...widths);
    if (score > best.score) best = { delimiter, score };
  }
  return best.delimiter;
}

function parseDelimitedText(text, delimiter = "") {
  const src = String(text || "").replace(/^\ufeff/, "");
  const delim = delimiter || detectImportDelimiter(src) || "\t";
  const rows = [];
  let row = [], cell = "", quote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '"' && next === '"') { cell += '"'; i += 1; }
      else if (ch === '"') quote = false;
      else cell += ch;
    } else if (ch === '"') quote = true;
    else if (ch === delim) { row.push(cell.trim()); cell = ""; }
    else if (ch === "\n") { row.push(cell.trim()); if (row.some((v) => String(v).trim())) rows.push(row); row = []; cell = ""; }
    else if (ch !== "\r") cell += ch;
  }
  row.push(cell.trim());
  if (row.some((v) => String(v).trim())) rows.push(row);
  return rows;
}

function splitDelimitedLine(line) {
  return parseDelimitedText(String(line || ""), detectImportDelimiter(line))[0] || [String(line || "").trim()];
}

function looksLikeImportHeader(row) {
  return importHeaderScore(row).isHeader;
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
  for (const [key, value] of Object.entries(obj || {})) {
    if (key.startsWith("__")) continue;
    if (["amount","income","expense"].includes(field) && /외화|해외통화|USD|EUR|JPY|달러|엔화|유로/i.test(key)) continue;
    if (canonicalImportField(key) === field && String(value ?? "").trim()) return String(value).trim();
  }
  return "";
}

function findImportDateInValues(values) {
  for (const value of values || []) {
    const d = parseDateStrict(value);
    if (d) return d;
  }
  return "";
}

function parseImportAmountCell(value = "") {
  const raw = String(value ?? "").normalize("NFKC").trim();
  if (!raw || /^(?:-|—|–|0|0\.0+)$/.test(raw)) return { amount: 0, present: !!raw, valid: !raw || /^0/.test(raw), negative: false, raw };
  const negative = /^\s*-/.test(raw) || /^\(.*\)$/.test(raw) || /-\s*$/.test(raw);
  const numeric = raw.replace(/[()]/g, "").replace(/(?:krw|won|원)/gi, "").replace(/[₩￦,$\s]/g, "").replace(/^-|-$/g, "");
  let amount = 0;
  if (/^\d+(?:\.\d+)?$/.test(numeric)) amount = Number(numeric);
  else amount = parseAmountValue(raw);
  return { amount: Number.isFinite(amount) ? Math.abs(Math.round(amount)) : 0, present: true, valid: Number.isFinite(amount) && amount > 0, negative, raw };
}

function normalizeImportTypeValue(value = "") {
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

function importObjectFromHeaders(headers = [], cells = []) {
  const obj = { __canonical: {}, __headers: headers.slice(), __cells: cells.slice() };
  const localMoney = new Set();
  headers.forEach((header, index) => {
    const key = normalizeImportHeader(header) || `col${index + 1}`;
    const value = cells[index] ?? "";
    const field = canonicalImportField(header);
    const moneyField = ["amount", "income", "expense"].includes(field);
    const foreign = /외화|해외통화|USD|EUR|JPY|달러|엔화|유로/i.test(String(header));
    if (foreign && (moneyField || /금액|amount|통화|currency/i.test(String(header)))) { obj.__foreign_money = true; return; }
    obj[key] = value;
    const local = moneyField && /원화|KRW|won|\(원\)|\[원\]/i.test(String(header));
    if (field && field !== "ignore" && String(value).trim()) {
      if (local || !obj.__canonical[field]) obj.__canonical[field] = String(value).trim();
      else if (field === "memo" || field === "category") obj.__canonical[field] = `${obj.__canonical[field]} / ${String(value).trim()}`;
      if (local) localMoney.add(field);
    }
  });
  obj.__local_money = localMoney.size > 0;
  return obj;
}

function alignImportCells(headers = [], cells = []) {
  const out = safeArray(cells).slice();
  const warnings = [];
  if (!headers.length || out.length <= headers.length) return { cells: out, warnings, matched: true };
  const moneyIndexes = headers.map(canonicalImportHeaderField).map((field, index) => (["amount", "income", "expense"].includes(field) ? index : -1)).filter((index) => index >= 0);
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
    const memoIndex = headers.map(canonicalImportHeaderField).findIndex((field) => field === "memo");
    if (memoIndex >= 0 && memoIndex < out.length) {
      const extra = out.length - headers.length;
      out.splice(memoIndex, extra + 1, out.slice(memoIndex, memoIndex + extra + 1).join(", "));
      warnings.push("따옴표 없이 쉼표가 들어간 내용을 한 값으로 합쳤습니다.");
    }
  }
  return { cells: out, warnings, matched: out.length === headers.length };
}

function importKeyValueObject(line = "") {
  const parts = String(line || "").split(/[|;\t]+/).map((part) => part.trim()).filter(Boolean);
  const pairs = [];
  for (const part of parts) {
    const match = part.match(/^([^:=]{1,40})\s*[:=]\s*(.+)$/);
    if (match && canonicalImportField(match[1])) pairs.push([match[1], match[2]]);
  }
  if (pairs.length < 2) return null;
  const obj = { __canonical: {}, __cells: pairs.map(([, value]) => value) };
  for (const [key, value] of pairs) {
    obj[normalizeImportHeader(key)] = value;
    const field = canonicalImportField(key);
    if (field && field !== "ignore" && !obj.__canonical[field]) obj.__canonical[field] = value;
  }
  return obj;
}

function parseImportJsonTable(text = "") {
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
    records = records.filter((record) => record && typeof record === "object" && !Array.isArray(record)).slice(0, 10000);
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
    return [headers, ...flatRecords.map((record) => headers.map((header) => record[header] == null ? "" : String(record[header])))];
  } catch (err) {
    return null;
  }
}

function normalizeImportedRecordDetailed(obj = {}, householdId = "", raw = "", cells = [], defaultUserId = "", options = {}) {
  const rawText = String(raw || safeArray(cells).join(" ") || Object.values(obj).filter((v) => typeof v !== "object").join(" ")).replace(/\s+/g, " ").trim();
  const warnings = [];
  const natural = !!options.natural;
  const currency = canonicalImportValue(obj,"currency");
  if (currency && !/^(?:KRW|WON|원|원화|₩|￦)$/i.test(String(currency).trim()) && !obj.__local_money) return {row:null,rejection:importRejection("ambiguous_amount",options.rowNumber,rawText),warnings:["원화 통화와 금액을 확인해 주세요. 외화는 자동 환산하지 않습니다."]};
  if (obj.__foreign_money && !obj.__local_money) return {row:null, rejection:importRejection("ambiguous_amount",options.rowNumber,rawText), warnings:["원화 금액 열을 확인해 주세요. 외화는 자동 환산하지 않습니다."]};
  const dateVal = canonicalImportValue(obj, "date");
  let transactionDate = dateVal ? parseDateStrict(dateVal) || parseExplicitDateFromText(dateVal) : "";
  const shortDate = String(dateVal || "").match(/^(\d{1,2})[/-](\d{1,2})$/);
  if (shortDate) transactionDate = safeYmd(Number(options.importYear || nowKstDate().getFullYear()), Number(shortDate[1]), Number(shortDate[2]));
  if (!transactionDate) {
    transactionDate = findImportDateInValues(cells) || parseExplicitDateFromText(rawText);
    if (transactionDate && dateVal) warnings.push("날짜 열 값 대신 행 안의 다른 날짜를 사용했습니다.");
  }
  if (!transactionDate && natural) {
    transactionDate = formatDate(nowKstDate());
    warnings.push("날짜가 없어 오늘 날짜로 보정했습니다.");
  }
  if (!transactionDate) return { row: null, rejection: importRejection(dateVal ? "invalid_date" : "missing_date", options.rowNumber, rawText), warnings };

  const incomeInfo = parseImportAmountCell(canonicalImportValue(obj, "income"));
  const expenseInfo = parseImportAmountCell(canonicalImportValue(obj, "expense"));
  const amountInfo = parseImportAmountCell(canonicalImportValue(obj, "amount"));
  if (incomeInfo.amount > 0 && expenseInfo.amount > 0) return { row: null, rejection: importRejection("both_income_expense", options.rowNumber, rawText), warnings };

  let chosen = incomeInfo.amount > 0 ? incomeInfo : expenseInfo.amount > 0 ? expenseInfo : amountInfo;
  if (/\$|¥|USD|EUR|JPY|달러|유로|엔화/i.test(chosen.raw || "")) return {row:null,rejection:importRejection("ambiguous_amount",options.rowNumber,rawText),warnings:["외화 금액을 원화로 자동 환산하지 않습니다."]};
  let forcedType = incomeInfo.amount > 0 ? "income" : expenseInfo.amount > 0 ? "expense" : "";
  const anyAmountPresent = amountInfo.present || incomeInfo.present || expenseInfo.present;
  if (!chosen.amount && !canonicalImportValue(obj, "amount") && !canonicalImportValue(obj, "income") && !canonicalImportValue(obj, "expense")) {
    const amountCandidates = [];
    for (const cell of cells || []) {
      if (!String(cell || "").trim() || parseDateStrict(cell) || normalizeImportTypeValue(cell)) continue;
      const info = parseImportAmountCell(cell);
      if (info.amount > 0) amountCandidates.push(info);
    }
    const unique = [...new Map(amountCandidates.map((item) => [item.amount, item])).values()];
    if (unique.length === 1) { chosen = unique[0]; warnings.push("금액 제목이 없어 행의 숫자에서 금액을 찾았습니다."); }
    else if (unique.length > 1) return { row: null, rejection: importRejection("ambiguous_amount", options.rowNumber, rawText), warnings };
  }

  let naturalParsed = null;
  if (!chosen.amount && !anyAmountPresent) {
    naturalParsed = parseTransaction(rawText, {});
    if (naturalParsed.ok) chosen = { amount: naturalParsed.amount, negative: false, present: true, valid: true, raw: String(naturalParsed.amount) };
  }
  if (!chosen.amount) return { row: null, rejection: importRejection(anyAmountPresent ? "invalid_amount" : "missing_amount", options.rowNumber, rawText), warnings };
  if (Math.abs(Math.round(Number(chosen.amount || 0))) > MAX_TRANSACTION_AMOUNT) {
    return { row: null, rejection: importRejection("amount_too_large", options.rowNumber, rawText), warnings };
  }

  const typeVal = canonicalImportValue(obj, "type");
  const normalizedType = normalizeImportTypeValue(typeVal);
  let type = normalizedType || forcedType || (chosen.negative ? "expense" : "");
  if (!type) {
    type = naturalParsed?.type || detectType(rawText);
    if (typeVal) warnings.push(`구분 ‘${String(typeVal).slice(0, 30)}’을 직접 해석하지 못해 문맥으로 ${type === "income" ? "수입" : "지출"} 처리했습니다.`);
  }
  type = type === "income" ? "income" : "expense";
  // V22.9.26: 구분 열이 지출인데 금액이 음수면 카드사 명세서의 취소·환불 표기다. 양수 지출로
  // 더하면 원거래와 취소가 둘 다 지출로 집계된다. 환급(수입)으로 돌리고 확인 표시를 남긴다.
  let refundFlipped = false;
  const cancellation = /취소|승인취소|결제취소|cancel(?:led|lation)?|refund/i.test(rawText);
  if (cancellation && !chosen.negative) warnings.push("취소 거래입니다. 원거래·취소 금액과 구분을 확인한 뒤 직접 선택하세요.");
  const genericNegative = chosen.negative && !String(typeVal || "").trim() && !forcedType;
  if (chosen.negative && (normalizedType === "expense" || forcedType === "expense" || genericNegative)) {
    type = "income";
    refundFlipped = true;
    warnings.push("음수 금액이라 취소·환불(수입)로 처리했습니다. 확인 후 저장하세요.");
  }

  let paymentVal = canonicalImportValue(obj, "payment");
  if (!paymentVal && typeVal && !normalizeImportTypeValue(typeVal) && /(카드|현금|계좌|페이|은행)/i.test(typeVal)) paymentVal = typeVal;
  const categoryVal = canonicalImportValue(obj, "category");
  const memoVal = canonicalImportValue(obj, "memo");
  const rawField = canonicalImportValue(obj, "raw_text");
  const payment = paymentVal ? (normalizePaymentMethod(paymentVal) || String(paymentVal).trim()) : (naturalParsed?.payment_method || detectPaymentMethod(rawText));
  const category = refundFlipped ? "환급" : (categoryVal || naturalParsed?.category || inferCategory(`${rawText} ${memoVal}`, type));
  const memo = memoVal || naturalParsed?.memo || cleanMemo(rawText, chosen.raw || String(chosen.amount), type, payment, category) || category;
  const spender = canonicalImportValue(obj, "spender");
  const row = {
    household_id: householdId,
    ...(defaultUserId ? { user_id: defaultUserId } : {}),
    type,
    amount: Math.abs(Math.round(chosen.amount)),
    category: String(category || (type === "income" ? "기타수입" : "기타지출")).slice(0, 80),
    memo: String(memo || "").slice(0, 240),
    payment_method: String(payment || "").slice(0, 80),
    transaction_date: transactionDate,
    source: options.source || "import_smart",
    raw_text: String(rawField || rawText).slice(0, 500),
    _import_spender: String(spender || "").slice(0, 80),
    _import_warnings: warnings.slice(),
    _import_needs_confirmation: refundFlipped || cancellation,
  };
  return { row, rejection: null, warnings };
}

function parseFlexibleImportRecords(rawText, householdId, defaultUserId = "", options = {}) {
  const text = String(rawText || "").replace(/^\ufeff/, "").trim();
  const result = { rows: [], accepted: [], rejected: [], skipped: 0, warnings: [], mappings: [], delimiter: "", format: "natural_text", header_row: 0, total_rows: 0 };
  if (!text) return result;
  const jsonTable = parseImportJsonTable(text);
  const delimiter = jsonTable ? "" : detectImportDelimiter(text);
  const table = jsonTable || parseDelimitedText(text, delimiter);
  const maxRows = Math.min(10000, Math.max(100, Number(options.maxRows || 5000)));
  result.delimiter = jsonTable ? "JSON" : delimiter === "\t" ? "탭(TSV)" : delimiter === "," ? "쉼표(CSV)" : delimiter === ";" ? "세미콜론" : delimiter === "|" ? "파이프" : "자연어";
  result.total_rows = table.length;
  let headerIndex = -1;
  for (let i = 0; i < Math.min(100, table.length); i++) {
    if (looksLikeImportHeader(table[i])) { headerIndex = i; break; }
  }
  result.header_row = headerIndex >= 0 ? headerIndex + 1 : 0;
  result.format = headerIndex >= 0 ? "table" : (delimiter ? "headerless_table" : "natural_text");

  const addRejected = (rejection) => { result.rejected.push(rejection); result.warnings.push(`${rejection.row_number}행: ${rejection.reason}`); };
  let currentHeaders = headerIndex >= 0 ? table[headerIndex] : [];
  const registerMappings = (headers) => {
    for (const header of headers) {
      const field = canonicalImportField(header);
      if (!field) continue;
      const key = `${normalizeImportHeader(header)}:${field}`;
      if (!result.mappings.some((item) => item.key === key)) result.mappings.push({ key, source: String(header).trim(), field, label: IMPORT_FIELD_LABELS[field] || field });
    }
  };
  if (currentHeaders.length) registerMappings(currentHeaders);

  for (let i = 0; i < Math.min(table.length, maxRows); i++) {
    const rowNumber = i + 1;
    const cells = table[i];
    const raw = cells.join(delimiter || " | ").trim();
    if (!raw) continue;
    if (i < headerIndex) { addRejected(importRejection("preamble", rowNumber, raw)); continue; }
    if (i === headerIndex) continue;
    if (/^(?:#\s*)?(?:시트|sheet)\s*[:：]/i.test(raw)) { addRejected(importRejection("preamble", rowNumber, raw)); continue; }
    if (/(?:^|\s)(합계|총계|소계|월계|누계|잔액)(?:\s|$)/.test(raw) && !findImportDateInValues(cells)) { addRejected(importRejection("summary_row", rowNumber, raw)); continue; }
    if (looksLikeImportHeader(cells)) {
      currentHeaders = cells;
      registerMappings(currentHeaders);
      addRejected(importRejection("repeated_header", rowNumber, raw));
      continue;
    }

    let obj = null;
    let natural = headerIndex < 0;
    let effectiveCells = cells;
    let alignmentWarnings = [];
    if (currentHeaders.length) {
      const aligned = alignImportCells(currentHeaders, cells);
      if (!aligned.matched) { addRejected(importRejection("column_mismatch", rowNumber, raw)); continue; }
      effectiveCells = aligned.cells;
      alignmentWarnings = aligned.warnings;
      obj = importObjectFromHeaders(currentHeaders, effectiveCells);
    } else obj = importKeyValueObject(raw) || { __canonical: {}, __cells: cells.slice() };
    if (obj && Object.keys(safeObject(obj.__canonical)).length) natural = false;
    if (!currentHeaders.length && delimiter === "," && /\d{1,3},\d{3}(?:,\d{3})*(?:원)?(?:\s|$)/.test(raw) && !findImportDateInValues(cells)) effectiveCells = [raw];
    const detailed = normalizeImportedRecordDetailed(obj, householdId, raw, effectiveCells, defaultUserId, { natural, rowNumber, importYear: options.importYear, source: options.source || "import_smart" });
    if (!detailed.row) { addRejected(detailed.rejection || importRejection("unsupported_row", rowNumber, raw)); continue; }
    if (alignmentWarnings.length) {
      detailed.warnings = [...alignmentWarnings, ...safeArray(detailed.warnings)];
      detailed.row._import_warnings = [...alignmentWarnings, ...safeArray(detailed.row._import_warnings)];
    }
    result.rows.push(detailed.row);
    result.accepted.push({ row_number: rowNumber, raw: raw.slice(0, 240), row: detailed.row, warnings: detailed.warnings || [] });
  }
  if (table.length > maxRows) {
    for (let i = maxRows; i < Math.min(table.length, maxRows + 100); i++) addRejected(importRejection("over_limit", i + 1, table[i].join(delimiter || " | ")));
    if (table.length > maxRows + 100) result.warnings.push(`${table.length - maxRows - 100}개 행은 표시 한도를 넘어 요약만 남겼습니다.`);
  }
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
  IMPORT_REJECTION_GUIDE, alignImportCells, canonicalImportField, cleanImportedRowsForInsert,
  handleAdminCsv, handleAdminImportJson, handleImportTemplateCsv, handleImportTemplateXls,
  importRejection, normalizeImportedRecordDetailed, parseFlexibleImportRecords,
};
// @build:exports-end
