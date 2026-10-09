// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { normalizeImportedRecordDetailed } from "./flexible-import-parser.js";
import { safeArray } from "../admin/backup-compare.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
// @build:imports-end

// Excel·Google Sheets는 =, +, -, @, 탭, 캐리지리턴으로 시작하는 셀을 수식으로
// 실행한다. 가계부는 여러 사람이 함께 쓰므로 한 참여자가 넣은 메모가 다른
// 참여자의 PC에서 실행되지 않도록 내보내기 시점에 무력화한다. 따옴표로 감싸는
// 것은 CSV 구분자 이스케이프일 뿐 수식 실행을 막지 못한다.
function csvSafeText(value) {
  const text = String(value ?? "");
  if (!text) return text;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return text;
  return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function readableCsvCell(value = "") {
  const text = csvSafeText(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

function buildReadableTransactionsCsv(rows = []) {
  const header = ["날짜", "구분", "금액", "분류", "내용", "결제수단", "지출자", "출처", "기록ID"];
  const lines = [header.map(readableCsvCell).join(",")];
  for (const r of rows || []) {
    lines.push([
      r.transaction_date || "",
      r.type === "income" ? "수입" : "지출",
      Number(r.amount || 0),
      r.category || "",
      r.memo || r.raw_text || "",
      r.payment_method || "",
      r.spender_name || "미지정",
      r.source || "",
      r.id || "",
    ].map(readableCsvCell).join(","));
  }
  return lines.join("\r\n");
}

function parseCsvRows(text = "") {
  const src = String(text || "").replace(/^\ufeff/, "");
  const rows = [];
  let row = [], cell = "", quote = false;
  for (let i = 0; i < src.length; i++) {
    const ch = src[i];
    const next = src[i + 1];
    if (quote) {
      if (ch === '"' && next === '"') { cell += '"'; i++; }
      else if (ch === '"') quote = false;
      else cell += ch;
    } else {
      if (ch === '"') quote = true;
      else if (ch === ",") { row.push(cell); cell = ""; }
      else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
      else if (ch === "\r") {}
      else cell += ch;
    }
  }
  row.push(cell);
  if (row.some((v) => String(v || "").trim() !== "")) rows.push(row);
  return rows;
}

function normalizeHeaderName(v = "") {
  return normalizeText(v).replace(/\s+/g, "").toLowerCase();
}

function csvRowsToObjects(text = "") {
  const rows = parseCsvRows(text);
  if (!rows.length) return [];
  const headers = rows[0].map(normalizeHeaderName);
  return rows.slice(1).map((r) => {
    const obj = {};
    for (let i = 0; i < headers.length; i++) obj[headers[i]] = r[i] ?? "";
    return obj;
  }).filter((o) => Object.values(o).some((v) => String(v || "").trim() !== ""));
}

function pickImportValue(row = {}, names = []) {
  for (const name of names) {
    const key = normalizeHeaderName(name);
    if (row[key] !== undefined && String(row[key]).trim() !== "") return String(row[key]).trim();
  }
  return "";
}

function normalizeImportTransaction(row = {}, householdId = "", userId = "") {
  const cells = safeArray(row.__cells).length ? row.__cells : Object.values(row).filter((value) => typeof value !== "object");
  const raw = cells.join(" ");
  const normalized = normalizeImportedRecordDetailed(row, householdId, raw, cells, userId, { natural: false, rowNumber: 1, source: "my_import" }).row;
  if (!normalized) return null;
  delete normalized._import_spender;
  delete normalized._import_warnings;
  delete normalized._import_needs_confirmation;
  return normalized;
}

async function findExactDuplicateTransaction(env, row = {}, options = {}) {
  if (!row.household_id || !row.user_id || !row.transaction_date || !row.amount) return null;
  const params = new URLSearchParams();
  params.set("select", "id,household_id,user_id,type,amount,category,memo,payment_method,transaction_date,source,source_user_key,raw_text,created_at");
  params.set("household_id", `eq.${row.household_id}`);
  // V22.9.26: 가져오기는 가계부 단위로 중복을 본다. 부부가 같은 카드 명세서를 각자 올리면
  // 사용자 단위 판정으로는 모든 거래가 두 번 들어갔다. 카카오 재전송 판정은 사용자 단위 그대로다.
  if (options.scope !== "household") params.set("user_id", `eq.${row.user_id}`);
  params.set("transaction_date", `eq.${row.transaction_date}`);
  params.set("type", `eq.${row.type === "income" ? "income" : "expense"}`);
  params.set("amount", `eq.${Math.round(Number(row.amount || 0))}`);
  params.set("limit", "30");
  let rows = [];
  try {
    rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
  } catch (err) {
    rememberOpsEvent({ kind: "duplicate_check_error", severity: "warn", path: "/rest/v1/transactions", method: "GET", detail: safeError(err) });
    // 중복 확인이 실패했을 때는 새 거래를 만들지 않는 쪽으로 닫습니다.
    throw err;
  }
  const norm = (v) => normalizeText(v || "");
  const targetRaw = norm(row.raw_text);
  const targetMemo = norm(row.memo);
  const targetCat = norm(row.category);
  const targetPay = norm(row.payment_method);
  // withinSeconds: treat only very-recent identical rows as duplicates (kakao retry/idempotency).
  // Without it, identical rows on the same date are always deduped (CSV import safety).
  const withinSeconds = Number(options.withinSeconds || 0);
  const nowMs = Date.now();
  return rows.find((r) => {
    const sameBasic = norm(r.category) === targetCat && norm(r.memo) === targetMemo && norm(r.payment_method) === targetPay;
    const sameRaw = targetRaw && norm(r.raw_text) === targetRaw;
    if (!(sameRaw || sameBasic)) return false;
    if (withinSeconds > 0) {
      const created = Date.parse(r.created_at || "");
      if (!Number.isFinite(created)) return false;
      if ((nowMs - created) > withinSeconds * 1000) return false;
    }
    return true;
  }) || null;
}
// @build:exports-start
export { buildReadableTransactionsCsv, csvSafeText, findExactDuplicateTransaction };
// @build:exports-end
