// @build:imports-start
import { boundedRuntimeNumber, rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { myBackupImportClientMain } from "../client/legacy-ui-runtime.js";
import {
  assertSettingsLeaseFresh, claimOperationLease, operationLeaseOwner, parseStrictSettingsObject,
  releaseOperationLease, safeError,
} from "../runtime/leases.js";
import { csvResponse, htmlResponse, jsonResponse, redirectResponse } from "../runtime/http.js";
import {
  makeMyImportPreviewToken, randomHex, sha256Hex, verifyMyImportPreviewToken,
} from "../auth/crypto-admin-session.js";
import {
  IMPORT_REJECTION_GUIDE, MY_IMPORT_WRITES_ENABLED_V22959, cleanImportedRowsForInsert,
  commitImportedTransactionRows, importRejection, importStorageTextIssue,
  parseFlexibleImportRecords,
} from "../import/flexible-import-parser.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAdminRowsRange, fetchHouseholdMembers,
  fetchPostgrestRows, isRowLimitExceededError,
} from "../data/households-members-rows.js";
import { getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import { READABLE_CSV_COLUMNS, buildReadableTransactionsCsv } from "../import/csv-duplicates.js";
import {
  cardImportClientMain, cardImportCss, renderCardImportSection,
} from "./card-import-guide.js";
import {
  importMappingClientMain, renderMyImportMappingEditor, renderMyImportSourceReselect,
} from "../client/lucian-d-import.js";
import {
  canManageMyHousehold, canWriteMyHousehold, getMySelectedHousehold, householdIdWasRemembered,
  householdNotFoundResponse, myAccessStatusResponse,
} from "./access-control.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import {
  abTransactionRequestId, escapeHtml, numberWithCommas,
} from "../domain/transactions-core.js";
// @build:imports-end

// V22.9.78(V76 W-10): 백업 화면의 컬럼 안내는 실제 CSV 열 목록에서 만든다. 예전 안내에는 ‘지출자’가 빠져 있었다.
// 열 이름은 바꾸지 않고(가져오기 호환), 화면 용어와 다른 열만 괄호로 풀어 쓴다.
const BACKUP_CSV_COLUMN_HINTS = Object.freeze({ 구분: "수입·지출", 내용: "메모", 출처: "기록한 곳" });
function backupCsvColumnsNote() {
  return READABLE_CSV_COLUMNS.map((name) => (BACKUP_CSV_COLUMN_HINTS[name] ? `${name}(${BACKUP_CSV_COLUMN_HINTS[name]})` : name)).join(", ");
}

async function handleMyBackupPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { households, selected, restricted, invalidRequested } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (invalidRequested && households.length && !householdIdWasRemembered(request)) return householdNotFoundResponse({ env, user, requestedId: invalidRequested });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
  const hh = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const sample = ["날짜,구분,금액,분류,내용,결제수단", `${formatDate(nowKstDate())},지출,12000,식비,점심,국민카드`, `${formatDate(nowKstDate())},수입,2500000,급여,월급,통장`].join("\n");
  const opts = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(h.name)} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const canImport = canWriteMyHousehold(selected.role);
  const disabled = canImport ? "" : " disabled";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 백업/가져오기</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 48%,#eef2f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#101828;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#e5e7eb;line-height:1.6}.muted{color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.aliasGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.alias{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px}.alias b{display:block}.alias span{display:block;color:#64748b;font-size:13px;line-height:1.5;margin-top:4px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit;background:#fff;min-width:0}textarea{min-height:190px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}button,.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000;cursor:pointer}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:14px;padding:11px}.error,.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:14px;padding:11px;line-height:1.6}.fileStatus{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:14px;padding:10px;line-height:1.5}button:disabled,input:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}@media(max-width:760px){.grid{grid-template-columns:1fr}.wrap{padding:12px}.hero,.card{border-radius:22px}}${cardImportCss()}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain"><section class="hero"><h1>다른 가계부에서 안전하게 옮기기</h1><p>CSV·TSV·TXT·엑셀의 여러 시트를 받고, 제목 유사어와 자연어 행을 함께 분석합니다. 저장 전 미리보기에서 인식 결과와 중복 후보를 확인하고 필요한 행만 선택합니다.</p></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${formatMessage(err)}</div>` : ""}<section class="card"><form method="get" action="/my/backup"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}" style="margin-top:8px"/><p><button type="submit">조회</button> <a class="btn secondary" href="/my?${hh}">내 가계부</a></p></form></section><section class="grid"><div class="card"><h2>백업 다운로드</h2><p class="muted">선택한 월의 기록을 읽기 쉬운 UTF-8 CSV로 받습니다. 원문은 별도 보관하지 않으며 완전 복원용 백업 형식은 아닙니다. 수식 방지용 작은따옴표는 가져오기에서도 유지합니다.</p><p><a class="btn" href="/my/backup.csv?${hh}">CSV 다운로드</a> <a class="btn" href="/my/backup.csv?${hh}&amp;range=all">전체 기간 CSV</a></p><p class="muted">컬럼: ${escapeHtml(backupCsvColumnsNote())}. 컬럼 이름은 예전 백업과 같아 가져오기에서 그대로 읽습니다. 가계부를 삭제하기 전에는 전체 기간 CSV를 받아 두세요.</p></div><div class="card"><h2>파일·붙여넣기 가져오기</h2><p class="muted">첫 단계는 분석 미리보기이며 거래를 저장하지 않습니다. 미리보기에서 행을 선택하고 다시 확인해야 실제 저장됩니다.</p>${canImport ? "" : `<div class="warn"><b>조회 전용 권한</b><br/>현재 권한에서는 백업 다운로드만 가능하고 가져오기는 소유자·관리자·구성원만 할 수 있습니다.</div>`}<form id="myImportForm" method="post" action="/my/import" enctype="multipart/form-data"><input type="hidden" name="import_action" value="preview"/><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><p><input id="myImportFile" type="file" name="csv_file" accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${disabled}/></p><div id="myImportFileStatus" class="fileStatus">CSV·TSV·TXT는 서버에서 바로 읽습니다. XLS/XLSX는 이 브라우저에서 모든 시트를 텍스트 표로 변환합니다.</div><p><textarea id="myImportText" name="csv_text" placeholder="${escapeHtml(sample)}&#10;&#10;또는 자연어:&#10;어제 점심 12000원 국민카드&#10;7월 14일 월급 250만원"${disabled}></textarea></p><label class="muted">연도 없는 날짜의 기준<select name="date_basis_mode"${disabled}><option value="default"${month === currentMonthKst() ? " selected" : ""}>현재 기준일 · 183일 넘는 연말 날짜는 전년으로 보정</option><option value="selected"${month !== currentMonthKst() ? " selected" : ""}>선택한 ${escapeHtml(month.slice(0,4))}년 · 미래 날짜도 지정 연도 유지</option></select></label><p class="muted">파일에 명시한 연도가 하나이면 그 연도를 우선합니다. 분석 결과에서 적용한 기준을 확인해 주세요.</p><label class="muted"><input type="checkbox" name="skip_duplicates" value="1" checked style="width:auto"${disabled}/> 같은 날짜·금액·내용은 중복 후보로 미리 제외</label><p><button id="myImportSubmit" type="submit"${disabled}>1. 분석 미리보기</button></p></form></div></section>${renderCardImportSection({ canImport })}<section class="card"><h2>자동 인식하는 제목 유사어</h2><div class="aliasGrid"><div class="alias"><b>날짜</b><span>날짜, 일자, 거래일, 사용일, 승인일, 결제일, date, datetime</span></div><div class="alias"><b>금액</b><span>금액, 거래금액, 승인금액, 결제금액, 지출·출금, 수입·입금, debit·credit</span></div><div class="alias"><b>내용</b><span>내용, 내역, 적요, 메모, 사용처, 가맹점, 상호, description, merchant</span></div><div class="alias"><b>분류</b><span>분류, 카테고리, 항목, 대·중·소분류, category, tag</span></div><div class="alias"><b>결제수단</b><span>결제수단, 카드, 계좌, 은행, 자산, payment, account</span></div><div class="alias"><b>지출자</b><span>지출자, 결제자, 사용자, 구성원, 담당자, payer, spender</span></div></div></section><section class="card"><h2>붙여넣기 예시</h2><textarea readonly>${escapeHtml(sample)}</textarea><p class="muted">날짜가 없는 자연어 행은 오늘 날짜로 보정하며 미리보기에 표시합니다. 제목이 있는 표에서 날짜가 없거나 형식이 잘못된 행은 임의 저장하지 않고 이유를 안내합니다.</p></section></div></div></main><script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>(function(){var input=document.getElementById('myImportFile');var area=document.getElementById('myImportText');var status=document.getElementById('myImportFileStatus');var form=document.getElementById('myImportForm');var submit=document.getElementById('myImportSubmit');if(!input||!area||!form)return;function setStatus(text,bad){status.textContent=text;status.style.background=bad?'#fff7ed':'#eff6ff';status.style.borderColor=bad?'#fed7aa':'#bfdbfe';status.style.color=bad?'#9a3412':'#1e3a8a';}input.addEventListener('change',function(){var file=input.files&&input.files[0];if(!file)return;var name=String(file.name||'').toLowerCase();if(!/\.xlsx?$/.test(name)){setStatus('선택한 '+file.name+' 파일은 서버에서 제목 유사어와 자연어를 분석합니다.',false);return;}var reader=new FileReader();setStatus('엑셀의 모든 시트를 변환하고 있습니다…',false);reader.onload=function(event){try{if(!window.XLSX)throw new Error('엑셀 변환 라이브러리를 불러오지 못했습니다. 파일을 CSV로 저장하거나 표를 복사해 붙여넣어 주세요.');var workbook=XLSX.read(new Uint8Array(event.target.result),{type:'array',cellDates:false});var chunks=[];workbook.SheetNames.forEach(function(sheetName){var sheet=workbook.Sheets[sheetName];var tsv=XLSX.utils.sheet_to_csv(sheet,{FS:'\t',RS:'\n',rawNumbers:false});if(String(tsv||'').trim())chunks.push('# 시트: '+sheetName+'\n'+String(tsv).trim());});if(!chunks.length)throw new Error('값이 있는 시트를 찾지 못했습니다.');area.value=chunks.join('\n');input.value='';setStatus('엑셀 '+workbook.SheetNames.length+'개 시트를 변환했습니다. 아래 내용 확인 후 미리보기를 누르세요.',false);}catch(error){setStatus(error.message||String(error),true);}};reader.onerror=function(){setStatus('엑셀 파일을 읽지 못했습니다. CSV로 저장하거나 표를 복사해 붙여넣어 주세요.',true);};reader.readAsArrayBuffer(file);});form.addEventListener('submit',function(event){var file=input.files&&input.files[0];if(file&&/\.xlsx?$/.test(String(file.name||'').toLowerCase())){event.preventDefault();setStatus('엑셀 변환이 끝날 때까지 기다리거나 CSV로 저장해 주세요.',true);return;}if(submit&&!submit.disabled){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='미리보기 분석 중…';}});})();</script><script id="cardImportRuntime">(${cardImportClientMain.toString()})({formId:"myImportForm",fileId:"myImportFile",textId:"myImportText"});</script></body></html>`);
}

async function handleMyBackupCsv(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const { selected, restricted } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return redirectResponse("/my?err=no_household");
  const members = await fetchHouseholdMembers(env, selected.id);
  // V22.9.26: `range=all` 이면 전 기간을 내보낸다. 영구 삭제 전 백업이 한 달치뿐이면 나머지를 잃는다.
  const allRange = url.searchParams.get("range") === "all";
  // 한도를 넘으면 일부만 담긴 파일을 전체 백업처럼 내려보내지 않고 백업 화면에서 이유를 알린다(QA B05).
  // 전 기간 4만 건은 요청당 DB 호출 예산(50회) 안에서 끝까지 읽을 수 있는 크기다.
  let rawRows;
  try {
    rawRows = allRange
      ? await fetchAdminRowsRange(env, { householdId: selected.id, start: "2000-01-01", end: "2100-01-01", type: "all", limit: 40000 })
      : await fetchAdminRows(env, { month, householdId: selected.id, type: "all" });
  } catch (err) {
    if (!isRowLimitExceededError(err)) throw err;
    return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=backup_too_large`);
  }
  const rows = attachSpenderNames(rawRows, members);
  const csv = buildReadableTransactionsCsv(rows);
  const file = `accountbook_${allRange ? "all" : month}_${String(selected.name || "backup").replace(/[^\w가-힣-]+/g, "_")}.csv`;
  return csvResponse(csv, file);
}

function decodeImportUploadBytes(bytes = new Uint8Array()) {
  if (!(bytes instanceof Uint8Array) || !bytes.length) return "";
  const decode = (encoding, offset = 0) => {
    try { return new TextDecoder(encoding, { fatal: false }).decode(bytes.subarray(offset)); }
    catch (_) { return ""; }
  };
  if (bytes[0] === 0xff && bytes[1] === 0xfe) return decode("utf-16le", 2);
  if (bytes[0] === 0xfe && bytes[1] === 0xff) return decode("utf-16be", 2);
  if (bytes[0] === 0xef && bytes[1] === 0xbb && bytes[2] === 0xbf) return decode("utf-8", 3);
  const sampleLength = Math.min(bytes.length, 1024);
  let evenNul = 0, oddNul = 0;
  for (let i = 0; i < sampleLength; i++) {
    if (bytes[i] !== 0) continue;
    if (i % 2) oddNul += 1;
    else evenNul += 1;
  }
  if (oddNul > sampleLength * 0.12 && oddNul > evenNul * 2) return decode("utf-16le");
  if (evenNul > sampleLength * 0.12 && evenNul > oddNul * 2) return decode("utf-16be");
  const utf8 = decode("utf-8");
  const replacementCount = (utf8.match(/\ufffd/g) || []).length;
  if (replacementCount > Math.max(2, utf8.length * 0.002)) {
    const eucKr = decode("euc-kr");
    const eucReplacementCount = (eucKr.match(/\ufffd/g) || []).length;
    if (eucKr && eucReplacementCount < replacementCount) return eucKr;
  }
  return utf8;
}

async function readImportUploadText(file) {
  if (!file) return "";
  if (typeof file.arrayBuffer === "function") {
    const buffer = await file.arrayBuffer();
    const bytes = new Uint8Array(buffer);
    if (bytes[0] === 0x50 && bytes[1] === 0x4b || bytes[0] === 0xd0 && bytes[1] === 0xcf || bytes[0] === 0x89 && bytes[1] === 0x50 || bytes[0] === 0xff && bytes[1] === 0xd8 || bytes[0] === 0x25 && bytes[1] === 0x50) throw new Error("import_binary_file");
    const text = decodeImportUploadBytes(bytes);
    if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text) || (text.match(/\ufffd/g) || []).length > Math.max(2, text.length * 0.002)) throw new Error("import_file_decode_invalid");
    return text;
  }
  if (typeof file.text === "function") return String(await file.text() || "");
  return "";
}

function buildMyImportMemberLookup(members = []) {
  const lookup = new Map();
  for (const member of safeArray(members)) {
    const key = normalizeText(member.nickname || "").toLowerCase().replace(/\s+/g, "");
    if (!key) continue;
    if (!lookup.has(key)) lookup.set(key, []);
    lookup.get(key).push(member);
  }
  return lookup;
}

function prepareMyImportEntry(entry = {}, userId = "", selected = {}, memberLookup = new Map(), jti = "") {
  const internal = safeObject(entry.row);
  const spender = String(internal._import_spender || "").trim();
  const warnings = [...safeArray(entry.warnings), ...safeArray(internal._import_warnings)];
  const needsConfirmation = internal._import_needs_confirmation === true;
  const row = { ...internal, user_id: userId, source: "my_import" };
  delete row._import_spender;
  delete row._import_warnings;
  delete row._import_needs_confirmation;
  let errorCode = "";
  if (spender) {
    const key = normalizeText(spender).toLowerCase().replace(/\s+/g, "");
    const matches = memberLookup.get(key) || [];
    if (matches.length !== 1 || !canWriteMyHousehold(matches[0].role) || (!canManageMyHousehold(selected.role) && matches[0].user_id !== userId)) {
      errorCode = "invalid_spender";
      warnings.push("명시한 지출자를 현재 권한으로 저장할 수 없습니다. 지출자와 참여 권한을 확인한 뒤 다시 분석해 주세요.");
    } else row.user_id = matches[0].user_id;
  }
  if (jti) row.source_user_key = `import_v2264:${String(jti).slice(0, 48)}:${Number(entry.row_number || 0)}`;
  return {
    row_number: Number(entry.row_number || 0),
    source_location: entry.source_location,
    spender_explicit: !!spender && !errorCode,
    error_code: errorCode,
    raw: String(entry.raw || "").slice(0, 500),
    warnings: [...new Set(warnings.map((item) => String(item || "").trim()).filter(Boolean))],
    needs_confirmation: needsConfirmation,
    row,
  };
}

async function myImportDeterministicTransactionId(jti = "", rowNumber = 0) {
  const hex = await sha256Hex(`my_import_v2264|${String(jti)}|${Number(rowNumber || 0)}`);
  const chars = hex.slice(0, 32).split("");
  chars[12] = "4";
  chars[16] = ["8", "9", "a", "b"][parseInt(chars[16] || "0", 16) % 4];
  const value = chars.join("");
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-${value.slice(12, 16)}-${value.slice(16, 20)}-${value.slice(20, 32)}`;
}

async function findMyImportIdempotencyDuplicate(env, row = {}) {
  const householdId = String(row.household_id || "").trim();
  const sourceKey = String(row.source_user_key || "").trim();
  const transactionId = String(row.id || "").trim();
  if (!householdId || (!sourceKey && !transactionId)) return null;
  try {
    const params = new URLSearchParams();
    params.set("select", "id,household_id,source_user_key");
    params.set("household_id", `eq.${householdId}`);
    if (transactionId) params.set("id", `eq.${transactionId}`);
    else params.set("source_user_key", `eq.${sourceKey}`);
    params.set("limit", "1");
    const rows = await supabase(env, `/rest/v1/transactions?${params.toString()}`, { method: "GET" }) || [];
    return rows[0] || null;
  } catch (err) {
    rememberOpsEvent({ kind: "my_import_idempotency_check_failed", severity: "warn", path: "/my/import", method: "POST", detail: safeError(err) });
    return null;
  }
}

async function importDuplicateCandidates(env, householdId, rows = []) {
  if (!rows.length) return [];
  const amounts = [...new Set(rows.map(row => Math.round(Number(row.amount || 0))))];
  const dates = rows.map(row => row.transaction_date).filter(Boolean).sort();
  const found = [];
  const seenIds = new Set();
  let queries = 0;
  const checkBudget = () => {
    if (++queries > 32 || env.__AB_DB_BUDGET && env.__AB_DB_BUDGET.used >= env.__AB_DB_BUDGET.limit - 6) throw new Error("import_duplicate_query_limit");
  };
  for (let i = 0; i < amounts.length; i += 500) {
    const params = new URLSearchParams({household_id:`eq.${householdId}`, amount:`in.(${amounts.slice(i,i+500).join(",")})`, select:"id,household_id,user_id,transaction_date,type,amount,category,memo,payment_method,raw_text,source,source_user_key", order:"id.asc", limit:"1000"});
    params.append("transaction_date", `gte.${dates[0]}`); params.append("transaction_date", `lte.${dates.at(-1)}`);
    checkBudget();
    const countResponse = await supabase(env, `/rest/v1/transactions?${params}`, { method: "HEAD", headers: { Prefer: "count=exact" }, rawHeadResponse: true });
    const countMatch = String(countResponse.headers.get("content-range") || "").match(/\/(\d+)$/);
    if (!countResponse.ok || !countMatch) throw new Error("import_duplicate_count_unknown");
    const total = Number(countMatch[1]);
    if (found.length + total > 40000) throw new Error("import_duplicate_candidate_limit");
    for (let offset = 0; offset < total;) {
      checkBudget(); params.set("offset", String(offset));
      const page = await supabase(env, `/rest/v1/transactions?${params}`, {method:"GET"});
      if (!Array.isArray(page) || !page.length || offset + page.length > total) throw new Error("import_duplicate_source_incomplete");
      for (const row of page) {
        if (!row.id || seenIds.has(String(row.id))) throw new Error("import_duplicate_source_changed");
        seenIds.add(String(row.id));
      }
      found.push(...page);
      offset += page.length;
    }
  }
  return found;
}

function createImportDuplicateMatcher(candidates = [], reservedIds = []) {
  const used = new Set(reservedIds.map(String)), groups = new Map();
  const normal = row => ({ raw: normalizeText(row.raw_text || ""), basic: JSON.stringify([normalizeText(row.category || ""), normalizeText(row.memo || ""), normalizeText(row.payment_method || "")]) });
  const key = row => JSON.stringify([row.household_id, row.transaction_date, row.type, Number(row.amount)]);
  for (const row of candidates) {
    const groupKey = key(row); if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey).push({ row, ...normal(row) });
  }
  return { consume(row, explicitSpender = false) {
    const value = normal(row);
    const other = (groups.get(key(row)) || []).find(item => !used.has(String(item.row.id)) && (!explicitSpender || String(item.row.user_id) === String(row.user_id)) && (value.raw && value.raw === item.raw || value.basic === item.basic));
    if (!other) return null;
    used.add(String(other.row.id)); return other.row;
  } };
}

function importedRowDuplicate(candidates, row, exact = true) {
  const norm = v => normalizeText(v || "");
  return candidates.some(other => other.source_user_key && other.source_user_key === row.source_user_key || exact && other.transaction_date === row.transaction_date && other.type === row.type && Number(other.amount) === Number(row.amount) && (norm(row.raw_text) && norm(other.raw_text) === norm(row.raw_text) || norm(other.category) === norm(row.category) && norm(other.memo) === norm(row.memo) && norm(other.payment_method) === norm(row.payment_method)));
}

function myImportStoredValue(row = {}) {
  return JSON.stringify([row.id, row.household_id, row.user_id, row.transaction_date, row.type, Number(row.amount), row.category || "", row.memo || "", row.payment_method || "", row.raw_text || "", row.source || "", row.source_user_key || ""]);
}

async function myImportSourceScope(householdId, sourceHash, stateKey) {
  if (!householdId || !/^[a-f0-9]{64}$/.test(sourceHash) || stateKey !== `my_import_source_v22955:${await sha256Hex(`${householdId}|${sourceHash}`)}`) throw new Error("import_source_scope_invalid");
  return { v: 1, household_id: householdId, source_hash: sourceHash, state_key: stateKey };
}

async function myImportScopePrefix(householdId) {
  return `my_import_scope_v22959:${await sha256Hex(householdId)}:`;
}

async function registerMyImportSourceScope(env, householdId, sourceHash, stateKey, lease) {
  assertSettingsLeaseFresh(lease);
  await myImportSourceStateRpc(env, householdId, sourceHash, stateKey, null, null);
}

async function myImportSourceStateRpc(env, householdId, sourceHash, stateKey, expectedValue, nextValue) {
  const scope = await myImportSourceScope(householdId, sourceHash, stateKey);
  const result = await supabase(env, "/rest/v1/rpc/accountbook_import_source_v22960", {
    method: "POST", headers: { Prefer: "return=representation" },
    body: JSON.stringify({ p_household_id: householdId, p_source_hash: sourceHash, p_expected_value: expectedValue, p_next_value: nextValue }),
  });
  if (!result || Array.isArray(result) || result.key !== stateKey || result.scope_key !== `${await myImportScopePrefix(householdId)}${sourceHash}` || result.scope_value !== JSON.stringify(scope) || result.value !== null && typeof result.value !== "string") throw new Error("import_source_scope_changed");
  return result;
}

async function persistReconciledMyImportState(env, householdId, sourceHash, key, state, assertFresh) {
  // readMyImportSourceState returns logical completion only after comparing every
  // persisted field hash. Persist it with the entire original pending value.
  if (state.state === "complete" && state.stored_value && JSON.parse(state.stored_value).state === "pending") {
    assertFresh();
    return changeMyImportSourceState(env, householdId, sourceHash, key, state, state);
  }
  return state;
}

async function householdMyImportSources(env, householdId, assertFresh) {
  const prefix = await myImportScopePrefix(householdId);
  const rows = await fetchPostgrestRows(env, `/rest/v1/accountbook_settings?key=like.${encodeURIComponent(prefix + "*")}&select=key,value&order=key.asc`, { maxRows: 1000 });
  const scopes = [];
  for (const row of rows) {
    const scope = parseStrictSettingsObject(row.value, "import_source_scope");
    const expected = await myImportSourceScope(householdId, scope.source_hash, scope.state_key);
    if (row.key !== prefix + scope.source_hash || JSON.stringify(scope) !== JSON.stringify(expected)) throw new Error("import_source_scope_invalid");
    const observed = await readMyImportSourceState(env, scope.state_key, householdId);
    const state = await persistReconciledMyImportState(env, householdId, scope.source_hash, scope.state_key, observed, assertFresh);
    // Even after a lease expires, absence does not cancel an earlier RPC.
    if (state.state === "pending") throw new Error("household_import_pending");
    scopes.push({ ...scope, owner_key: row.key, owner_value: row.value, state_value: state.stored_value || "" });
  }
  return scopes;
}

async function importFixedTransactionRows(env, householdId, entries, jti) {
  const prefix = `import_v2264:${jti}:`;
  const filters = [{ source_user_key: `gte.${prefix}` }];
  const ids = [...new Set(entries.map(entry => String(entry.row?.id || "")))];
  if (!/^[a-f0-9]{24}$/i.test(jti) || ids.some(id => !/^[a-f0-9-]{36}$/i.test(id))) throw new Error("import_fixed_id_invalid");
  for (let i = 0; i < ids.length; i += 80) filters.push({ id: `in.(${ids.slice(i, i + 80).join(",")})` });
  const found = new Map(); let queries = 0;
  const checkBudget = () => {
    if (++queries > 32 || env.__AB_DB_BUDGET && env.__AB_DB_BUDGET.used >= env.__AB_DB_BUDGET.limit - 6) throw new Error("import_fixed_id_query_limit");
  };
  for (const filter of filters) {
    const params = new URLSearchParams({ household_id: `eq.${householdId}`, ...filter, select: "*", order: "id.asc", limit: "1000" });
    if (filter.source_user_key) params.append("source_user_key", `lt.${prefix}\uffff`);
    checkBudget();
    const head = await supabase(env, `/rest/v1/transactions?${params}`, { method: "HEAD", headers: { Prefer: "count=exact" }, rawHeadResponse: true });
    const count = String(head.headers.get("content-range") || "").match(/\/(\d+)$/);
    // A single commit contains at most 1,000 rows, but previous_import_token
    // can continue the same jti across the existing 5,000-record input range.
    // The namespace read bound is distinct from the per-commit save limit.
    if (!head.ok || !count || Number(count[1]) > (filter.source_user_key ? 5000 : 80)) throw new Error("import_fixed_id_count_unknown");
    const total = Number(count[1]), seen = new Set();
    for (let offset = 0; offset < total;) {
      checkBudget(); params.set("offset", String(offset));
      const page = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
      if (!Array.isArray(page) || !page.length || offset + page.length > total) throw new Error("import_fixed_id_source_incomplete");
      for (const row of page) {
        const id = String(row.id || "");
        if (!id || seen.has(id) || found.has(id) && myImportStoredValue(found.get(id)) !== myImportStoredValue(row)) throw new Error("import_fixed_id_source_changed");
        seen.add(id); found.set(id, row);
      }
      offset += page.length;
    }
  }
  return [...found.values()];
}

async function readMyImportSourceState(env, key, householdId) {
  const raw = await getSettingValueStrict(env, key);
  if (!raw) return {};
  const state = parseStrictSettingsObject(raw, "import_source_state");
  if (state.v !== 1 || !/^[a-f0-9]{32}$/.test(state.revision) || !raw.startsWith(`{"revision":"${state.revision}",`) || !["preview", "pending", "complete", "failed"].includes(state.state) || !Array.isArray(state.rows) || state.rows.length > 1000) throw new Error("import_source_state_invalid");
  if (typeof state.jti !== "string" || !state.jti || (state.state === "pending" ? !state.rows.length : state.rows.length !== 0) || state.rows.some(row => !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(String(row.id)) || !/^[a-f0-9]{64}$/.test(String(row.hash))) || new Set(state.rows.map(row => row.id)).size !== state.rows.length) throw new Error("import_source_state_invalid");
  if (state.mapping && (!/^[a-f0-9]{32}$/.test(state.mapping.revision) || !/^[a-f0-9]{64}$/.test(state.mapping.hash) || state.mapping.jti !== state.jti || typeof state.mapping.used !== "boolean" || !state.mapping.date_basis)) throw new Error("import_mapping_state_invalid");
  state.stored_value = raw;
  if (state.state !== "pending") return state;
  if (!state.rows.length) throw new Error("import_source_state_invalid");
  const found = new Map();
  for (let i = 0; i < state.rows.length; i += 80) {
    const ids = state.rows.slice(i, i + 80).map(row => row.id);
    if (ids.some(id => !/^[0-9a-f-]{36}$/i.test(String(id)))) throw new Error("import_source_state_invalid");
    const params = new URLSearchParams({ household_id: `eq.${householdId}`, id: `in.(${ids.join(",")})`, select: "*", limit: "80" });
    const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
    if (!Array.isArray(rows)) throw new Error("import_source_state_unknown");
    for (const row of rows) found.set(String(row.id), await sha256Hex(myImportStoredValue(row)));
  }
  if (state.rows.every(row => found.get(String(row.id)) === row.hash)) {
    const complete = { ...state, state: "complete", rows: [], stored_value: raw };
    // Reads (including preview) must never overwrite a later import's pending
    // state. Only the lease-protected commit path may persist transitions.
    return complete;
  }
  // Absence never proves that an in-flight request failed. Keep the original
  // IDs fenced until every exact stored value can be confirmed.
  return state;
}

async function changeMyImportSourceState(env, householdId, sourceHash, key, next, expected = {}) {
  const revision = randomHex(16);
  const mapping = next.mapping || expected.mapping;
  const value = JSON.stringify({ revision, v: 1, state: next.state, jti: next.jti, rows: next.rows, ...(mapping ? { mapping } : {}) });
  if (expected.stored_value && !/^[a-f0-9]{32}$/.test(expected.revision)) throw new Error("import_source_revision_invalid");
  const result = await myImportSourceStateRpc(env, householdId, sourceHash, key, expected.stored_value ?? null, value);
  if (result.value !== value) throw new Error("import_source_state_changed");
  return { ...next, ...(mapping ? { mapping } : {}), revision, stored_value: value };
}

function myImportHtmlResponse(form, html, status = 200) {
  return form.get("import_response") === "json" ? jsonResponse({ ok: status < 400, html }, status) : htmlResponse(html, status);
}

function myImportReasonCounts(outcomes = []) {
  const counts = Object.create(null);
  for (const item of safeArray(outcomes)) {
    const code = String(item?.reason_code || "unsupported_row").slice(0, 40);
    counts[code] = (counts[code] || 0) + 1;
  }
  return counts;
}

function rememberMyImportSummary(kind = "my_import_preview", detail = {}) {
  const safeDetail = {
    total: Number(detail.total || 0),
    recognized: Number(detail.recognized || 0),
    ready: Number(detail.ready || 0),
    selected: Number(detail.selected || 0),
    imported: Number(detail.imported || 0),
    duplicate: Number(detail.duplicate || 0),
    failed: Number(detail.failed || 0),
    limited: Number(detail.limited || 0),
    reasons: safeObject(detail.reasons),
  };
  rememberOpsEvent({ kind, severity: safeDetail.failed ? "warn" : "info", path: "/my/import", method: "POST", detail: JSON.stringify(safeDetail).slice(0, 500) });
}

async function handleMyImport(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const importAction = String(form.get("import_action") || "preview").trim().toLowerCase();
  const previewToken = String(form.get("import_token") || "");
  const tokenPayload = importAction === "commit" ? await verifyMyImportPreviewToken(env, previewToken) : null;
  if (importAction === "commit" && (!tokenPayload || tokenPayload.user_id !== userId || form.get("household_id") && form.get("household_id") !== tokenPayload.household_id)) return redirectResponse("/my/backup?err=import_preview_expired");
  const householdId = String(tokenPayload?.household_id || form.get("household_id") || "").trim();
  const month = validMonth(String(tokenPayload?.month || form.get("month") || "")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const { selected, restricted } = await getMySelectedHousehold(env, userId, householdId);
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=write_not_allowed`);
  if (!MY_IMPORT_WRITES_ENABLED_V22959 && importAction === "commit") return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "복구 모드에서는 가져오기를 저장하지 않습니다. 원래 미리보기와 고정 ID를 보관해 주세요. 기존 요청의 결과가 불명확하면 새 ID로 다시 저장하지 않습니다." }), 503);

  if (importAction === "commit") {
    if (!tokenPayload || tokenPayload.user_id !== userId || tokenPayload.household_id !== selected.id) {
      return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_preview_expired`);
    }
    const selectedRows = new Set(form.getAll("selected_rows").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
    const ready = safeArray(tokenPayload.ready);
    if (!selectedRows.size) {
      return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "저장할 행을 한 개 이상 선택해 주세요." }));
    }
    const entries = ready.filter((entry) => selectedRows.has(Number(entry.row_number || 0)));
    if (!entries.length) return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "현재 미리보기에 있는 행을 선택해 주세요." }), 400);
    // V22.9.34 proto (B12): one household import lease covers the duplicate check and the insert.
    let importLease = null;
    try {
      importLease = await claimOperationLease(env, { key: `transaction-import:${selected.id}`, owner: operationLeaseOwner("import"), leaseSeconds: 60 });
    } catch (leaseError) {
      rememberOpsEvent({ kind: "my_import_lease_failed", severity: "warn", path: "/my/import", method: "POST", detail: safeError(leaseError) });
      return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "저장을 시작하지 못했어요. 아직 아무 행도 저장하지 않았어요. 잠시 후 ‘선택한 항목 저장’을 다시 눌러 주세요." }), 503);
    }
    if (!importLease.acquired) {
      return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "다른 가져오기를 저장하고 있어요. 이 미리보기의 행은 아직 저장하지 않았어요. 잠시 후 ‘선택한 항목 저장’을 다시 눌러 주세요." }), 409);
    }
    try {
    const outcomes = safeArray(tokenPayload.outcomes).slice();
    const acceptedWarnings = [];
    const skipDuplicates = tokenPayload.skip_duplicates !== false;
    const members = await fetchHouseholdMembers(env, selected.id);
    const actor = members.find(member => String(member.user_id) === userId);
    const memberIds = new Set(members.filter(member => canWriteMyHousehold(member.role)).map(member => String(member.user_id)));
    if (!actor || !canWriteMyHousehold(actor.role) || entries.some(entry => String(entry.row?.household_id) !== selected.id || !memberIds.has(String(entry.row?.user_id)) || String(entry.row?.user_id) !== userId && !canManageMyHousehold(actor.role))) {
      return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "미리보기 이후 참여 권한이나 지출자 자격이 바뀌었습니다. 현재 권한과 지출자를 확인한 뒤 새로 분석해 주세요. 거래는 저장하지 않았습니다." }), 409);
    }
    const stateKey = String(tokenPayload.source_state_key || "");
    if (!/^my_import_source_v22955:[a-f0-9]{64}$/.test(stateKey)) return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "이전 버전의 미리보기입니다. 현재 원본을 다시 분석해 주세요." }), 409);
    await myImportSourceScope(selected.id, tokenPayload.source_hash, stateKey);
    let sourceState = await readMyImportSourceState(env, stateKey, selected.id);
    sourceState = await persistReconciledMyImportState(env, selected.id, tokenPayload.source_hash, stateKey, sourceState, () => assertSettingsLeaseFresh(importLease));
    if (sourceState.state === "pending" && sourceState.jti !== tokenPayload.jti) return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "이 원본의 이전 저장 결과를 확인하지 못했습니다. 새 거래 ID로 다시 저장하지 않습니다. 기존 미리보기에서 같은 행으로 확인해 주세요." }), 409);
    if (sourceState.mapping) {
      const mapping = sourceState.mapping;
      if (tokenPayload.mapping_revision !== mapping.revision || tokenPayload.mapping_hash !== mapping.hash || tokenPayload.jti !== mapping.jti) return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "열 연결이나 분석 기준이 바뀐 이전 결과입니다. 최신 분석 결과를 확인한 뒤 저장할 행을 다시 선택해 주세요. 거래는 저장하지 않았습니다." }), 409);
    } else if (tokenPayload.mapping_revision) return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, error: "현재 열 연결 상태를 확인하지 못했습니다. 거래는 저장하지 않았습니다. 원본과 최신 분석 결과를 다시 확인해 주세요." }), 409);
    await registerMyImportSourceScope(env, selected.id, tokenPayload.source_hash, stateKey, importLease);
    if (sourceState.mapping && !sourceState.mapping.used) {
      assertSettingsLeaseFresh(importLease);
      sourceState = await changeMyImportSourceState(env, selected.id, tokenPayload.source_hash, stateKey, { ...sourceState, mapping: { ...sourceState.mapping, used: true } }, sourceState);
    }
    let imported = 0, duplicate = 0, failed = 0, unknown = 0;
    const pendingRows = [];
    const pendingEntries = [];
    const fixedRows = await importFixedTransactionRows(env, selected.id, entries, tokenPayload.jti);
    const knownIds = new Map(fixedRows.map(row => [String(row.id), row]));
    const knownKeys = new Map(fixedRows.filter(row => row.source_user_key).map(row => [String(row.source_user_key), row]));
    const duplicateCandidates = await importDuplicateCandidates(env, selected.id, ready.map(entry => entry.row));
    const matcher = createImportDuplicateMatcher(duplicateCandidates, [...safeArray(tokenPayload.duplicate_basis), ...ready.map(entry => String(entry.row?.id || ""))]);
    // Allocate competing DB occurrences over the entire signed file order
    // before applying this request's partial selection.
    for (const entry of ready) {
      const picked = selectedRows.has(Number(entry.row_number || 0));
      const candidate = { ...safeObject(entry.row) };
      if (String(candidate.household_id || "") !== selected.id) {
        if (!picked) continue;
        failed += 1;
        outcomes.push(importRejection("write_failed", entry.row_number, entry.raw));
        continue;
      }
      // V22.9.37 감사 T10: 미리보기에서 행별로 바꾼 구분(row_type_N)을 저장 전에 반영한다. 환급으로 뒤집혔던 행을
      // 지출로 되돌리면 분류도 환급에서 되돌린다. 값은 income·expense 둘만 받는다.
      const typeOverride = String(form.get(`row_type_${Number(entry.row_number || 0)}`) || "");
      if ((typeOverride === "income" || typeOverride === "expense") && typeOverride !== candidate.type) {
        candidate.type = typeOverride;
        if (typeOverride === "expense" && candidate.category === "환급") candidate.category = "기타지출";
        else if (typeOverride === "income" && candidate.category === "기타지출") candidate.category = "기타수입";
      }
      const row = cleanImportedRowsForInsert([candidate])[0];
      if (!row) {
        if (!picked) continue;
        const issue = importStorageTextIssue(candidate);
        if (sourceState.state === "pending") {
          unknown += 1;
          const rejection = importRejection("write_unknown", entry.row_number, entry.raw);
          rejection.suggestion = "이전 미리보기의 값이 현재 저장 한도를 넘습니다. 원래 값과 고정 ID를 유지하며 새 요청을 보내지 않았습니다. 저장 결과를 확인하기 전에는 수정한 원본으로 다시 저장하지 마세요.";
          outcomes.push(rejection);
        } else {
          failed += 1;
          outcomes.push(importRejection(issue || "write_failed", entry.row_number, entry.raw));
        }
        continue;
      }
      const retryHash = sourceState.state === "pending" && picked ? await sha256Hex(myImportStoredValue(row)) : "";
      if (sourceState.state === "pending" && picked && !sourceState.rows.some(item => item.id === row.id && item.hash === retryHash)) {
        return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "이전 저장 결과가 불명확한 동안에는 원래 행·구분·고정 ID만 다시 확인할 수 있습니다. 새 분석이나 다른 값으로 저장하지 않았습니다." }), 409);
      }
      if (knownIds.has(String(row.id)) || row.source_user_key && knownKeys.has(String(row.source_user_key))) {
        if (!picked) continue;
        const stored = knownIds.get(String(row.id)) || knownKeys.get(String(row.source_user_key));
        if (myImportStoredValue(stored) !== myImportStoredValue(row)) {
          const conflict = importRejection(sourceState.state === "pending" ? "write_unknown" : "write_failed", entry.row_number, entry.raw);
          conflict.suggestion = "같은 고정 ID의 기존 기록과 값이 다릅니다. 기존 기록을 덮어쓰거나 새 ID로 다시 저장하지 않았습니다. 원래 미리보기와 기록을 확인해 주세요.";
          outcomes.push(conflict); if (sourceState.state === "pending") unknown++; else failed++; continue;
        }
        duplicate += 1;
        outcomes.push(importRejection("duplicate", entry.row_number, entry.raw));
        continue;
      }
      if (skipDuplicates && matcher.consume(row, entry.spender_explicit === true)) {
        if (!picked) continue;
        duplicate += 1;
        outcomes.push(importRejection("duplicate", entry.row_number, entry.raw));
        continue;
      }
      if (!picked) continue;
      pendingRows.push(row);
      pendingEntries.push(entry);
    }
    if (pendingRows.length) {
      const signatures = sourceState.state === "pending" ? sourceState.rows.slice() : [];
      if (sourceState.state !== "pending") for (const row of pendingRows) signatures.push({ id: row.id, hash: await sha256Hex(myImportStoredValue(row)) });
      assertSettingsLeaseFresh(importLease);
      const pendingState = await changeMyImportSourceState(env, selected.id, tokenPayload.source_hash, stateKey, { v: 1, state: "pending", jti: tokenPayload.jti, rows: signatures }, sourceState);
      assertSettingsLeaseFresh(importLease);
      let rpcSucceeded = false;
      try {
        const result = await commitImportedTransactionRows(env, selected.id, pendingRows, tokenPayload.source_hash, pendingState.stored_value);
        rpcSucceeded = true;
        const summary = Array.isArray(result) ? result[0] : result;
        const inserted = Number(summary?.inserted), duplicates = Number(summary?.duplicates);
        const found = await reconcileImportedTransactionIds(env, selected.id, pendingRows);
        const confirmed = Number.isInteger(inserted) && inserted >= 0 && Number.isInteger(duplicates) && duplicates >= 0 && inserted + duplicates === pendingRows.length && found.size === pendingRows.length;
        if (confirmed) { imported += inserted; duplicate += duplicates; }
        else {
          // HTTP success and an RPC count alone do not confirm stored values.
          unknown += pendingRows.length;
          for (const entry of pendingEntries) outcomes.push(importRejection("write_unknown", entry.row_number, entry.raw));
        }
        try {
          assertSettingsLeaseFresh(importLease);
          if (confirmed) {
            if (pendingRows.length === pendingState.rows.length) await changeMyImportSourceState(env, selected.id, tokenPayload.source_hash, stateKey, { state: "complete", jti: pendingState.jti, rows: [] }, pendingState);
            else {
              const observed = await readMyImportSourceState(env, stateKey, selected.id);
              if (observed.stored_value === pendingState.stored_value) await persistReconciledMyImportState(env, selected.id, tokenPayload.source_hash, stateKey, observed, () => assertSettingsLeaseFresh(importLease));
            }
          }
        }
        catch (_) { rememberOpsEvent({ kind: "my_import_state_confirm_pending", severity: "warn", path: "/my/import", method: "POST", detail: `rows=${pendingRows.length}` }); }
        for (const entry of confirmed ? pendingEntries : []) {
          if (safeArray(entry.warnings).length) acceptedWarnings.push({ row_number: entry.row_number, raw: entry.raw, warnings: entry.warnings });
        }
      } catch (err) {
        // V22.9.34 proto (B15): definite failure (4xx: the RPC is one SQL transaction, nothing stored) vs unknown (5xx/timeout).
        if (rpcSucceeded || isUncertainStorageWrite(err)) {
          let found = null;
          try { found = await reconcileImportedTransactionIds(env, selected.id, pendingRows); } catch (_) { found = null; }
          if (found?.size === pendingRows.length) {
            try {
              const observed = await readMyImportSourceState(env, stateKey, selected.id);
              if (observed.stored_value === pendingState.stored_value) await persistReconciledMyImportState(env, selected.id, tokenPayload.source_hash, stateKey, observed, () => assertSettingsLeaseFresh(importLease));
            } catch (_) { /* Keep the original pending when confirmation/CAS is unavailable. */ }
          }
          pendingEntries.forEach((entry, index) => {
            if (found && found.has(String(pendingRows[index].id))) {
              imported += 1;
              if (safeArray(entry.warnings).length) acceptedWarnings.push({ row_number: entry.row_number, raw: entry.raw, warnings: entry.warnings });
            } else {
              unknown += 1;
              outcomes.push(importRejection("write_unknown", entry.row_number, entry.raw));
            }
          });
        } else if (sourceState.state === "pending") {
          // This retry was rejected, but an earlier dispatched request with
          // these same IDs may still finish. Its fence must remain pending.
          unknown += pendingRows.length;
          for (const entry of pendingEntries) outcomes.push(importRejection("write_unknown", entry.row_number, entry.raw));
        } else {
          assertSettingsLeaseFresh(importLease);
          await changeMyImportSourceState(env, selected.id, tokenPayload.source_hash, stateKey, { v: 1, state: "failed", jti: tokenPayload.jti, rows: [] }, pendingState);
          failed += pendingRows.length;
          for (const entry of pendingEntries) outcomes.push(importRejection("write_failed", entry.row_number, entry.raw));
        }
        rememberOpsEvent({ kind: "my_import_batch_failed", severity: "error", path: "/my/import", method: "POST", detail: `rows=${pendingRows.length} unknown=${unknown} ${safeError(err)}` });
      }
    }
    rememberMyImportSummary("my_import_commit", {
      total: tokenPayload.parsed?.total_rows,
      recognized: tokenPayload.parsed?.accepted_count,
      ready: ready.length,
      selected: entries.length,
      imported,
      duplicate,
      failed,
      limited: tokenPayload.limited,
      reasons: myImportReasonCounts(outcomes),
    });
    return myImportHtmlResponse(form, renderMyImportResultHtml({
      env,
      user,
      selected,
      month,
      parsed: safeObject(tokenPayload.parsed),
      outcomes,
      acceptedWarnings,
      imported,
      duplicate,
      failed,
      unknown,
      limited: Number(tokenPayload.limited || 0),
      importLimit: Number(tokenPayload.import_limit || ready.length || 120),
      selectedCount: entries.length,
    }));
    } finally { await releaseOperationLease(env, importLease); }
  }

  let csvText = String(form.get("csv_text") || "");
  const file = form.get("csv_file");
  const source = String(form.get("input_source") || "");
  const hasFile = !!file && Number(file.size || 0) > 0;
  if (source && !["file", "text", "converted"].includes(source) || !source && hasFile && csvText.trim()) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_source_conflict`);
  if (source === "file") csvText = "";
  const useFile = source === "file" || !source && !csvText.trim();
  const maxBytes = boundedRuntimeNumber(env.MY_IMPORT_MAX_BYTES, 5 * 1024 * 1024, 1024 * 1024, 15 * 1024 * 1024);
  const fileName = String(file?.name || "").toLowerCase();
  const isExcelBinary = /\.xlsx?$/.test(fileName) || !/\.(?:csv|tsv|txt)$/.test(fileName) && /(?:spreadsheetml|ms-excel)/i.test(String(file?.type || ""));
  if (useFile && isExcelBinary) {
    return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=excel_conversion_required`);
  }
  if (useFile && file && Number(file.size || 0) > maxBytes) {
    return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_file_too_large`);
  }
  if (useFile && file && (typeof file.arrayBuffer === "function" || typeof file.text === "function")) {
    try {
      const t = await readImportUploadText(file);
      if (String(t || "").trim()) csvText = t;
    } catch (err) {
      rememberOpsEvent({ kind: "my_import_file_read_failed", severity: "warn", path: "/my/import", method: "POST", detail: safeError(err) });
      return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_file_read_failed`);
    }
  }
  if (new TextEncoder().encode(csvText).length > maxBytes) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_file_too_large`);
  if (!String(csvText || "").trim()) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=empty_import`);
  // V22.9.76 감사 E-4: 기준을 보내지 않은 요청은 화면 기본값과 같게 고른다(이번 달이면 183일 규칙, 다른 달이면 그 해).
  const dateMode = String(form.get("date_basis_mode") || (validMonth(String(form.get("month") || "")) && String(form.get("month")) !== currentMonthKst() ? "selected" : "default"));
  if (!["default", "selected"].includes(dateMode)) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&err=import_date_basis_invalid`);
  const sourceHash = await sha256Hex(csvText);
  const sourceStateKey = `my_import_source_v22955:${await sha256Hex(`${selected.id}|${sourceHash}`)}`;
  const previousToken = String(form.get("previous_import_token") || "");
  const previous = previousToken ? await verifyMyImportPreviewToken(env, previousToken) : null;
  if (previousToken && (!previous || previous.user_id !== userId || previous.household_id !== selected.id || previous.source_hash !== sourceHash)) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&err=import_preview_expired`);
  const mappingProtocol = form.get("mapping_protocol") === "1";
  const mappingError = (message, status = 409) => myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, error: message }), status);
  let mappingDelta = [], mappingOffset = 0;
  if (["mapping_protocol", "mapping_delta", "mapping_offset", "previous_import_token", "date_basis_mode", "csv_file", "csv_text", "input_source", "household_id"].some(name => form.getAll(name).length > 1)) return mappingError("같은 입력 항목이 중복되었습니다. 원본과 연결을 확인한 뒤 다시 분석해 주세요.", 400);
  if (form.has("mapping_delta") && !mappingProtocol || form.has("mapping_protocol") && !mappingProtocol) return mappingError("열 연결 요청 형식을 확인해 주세요.", 400);
  if (mappingProtocol) {
    if (!MY_IMPORT_WRITES_ENABLED_V22959) return mappingError("복구 모드에서는 새 가져오기 상태를 만들지 않습니다. 원래 미리보기와 원본을 보관해 주세요.", 503);
    const rawDelta = String(form.get("mapping_delta") || "[]"), rawOffset = String(form.get("mapping_offset") || "0");
    if (new TextEncoder().encode(rawDelta).length > 16384 || !/^(?:0|[1-9]\d{0,5})$/.test(rawOffset)) return mappingError("열 연결 요청이 너무 크거나 표시 범위가 올바르지 않습니다.", 400);
    try { mappingDelta = JSON.parse(rawDelta); } catch (_) { return mappingError("열 연결 요청을 읽지 못했습니다. 연결을 다시 확인해 주세요.", 400); }
    if (!previous && (!Array.isArray(mappingDelta) || mappingDelta.length)) return mappingError("열 연결을 수정하려면 유효한 이전 분석 결과가 필요합니다. 원본을 먼저 분석한 뒤 연결을 수정해 주세요.", 400);
    mappingOffset = Number(rawOffset);
  }
  let previewLease = null;
  if (mappingProtocol) {
    try { previewLease = await claimOperationLease(env, { key: `transaction-import:${selected.id}`, owner: operationLeaseOwner("import-preview"), leaseSeconds: 60 }); }
    catch (_) { return mappingError("분석 상태를 준비하지 못했습니다. 입력과 연결을 유지한 채 잠시 후 다시 분석해 주세요.", 503); }
    if (!previewLease.acquired) return mappingError("다른 가져오기를 저장하거나 분석하고 있습니다. 입력과 연결을 유지한 채 잠시 후 다시 분석해 주세요.");
  }
  try {
  let sourceState = await readMyImportSourceState(env, sourceStateKey, selected.id);
  if (!previewLease && MY_IMPORT_WRITES_ENABLED_V22959 && sourceState.state === "complete" && sourceState.stored_value && JSON.parse(sourceState.stored_value).state === "pending") {
    previewLease = await claimOperationLease(env, { key: `transaction-import:${selected.id}`, owner: operationLeaseOwner("import-preview-reconcile"), leaseSeconds: 60 });
    if (!previewLease.acquired) return mappingError("다른 가져오기를 처리하고 있습니다. 기존 미리보기와 원본을 보관하고 잠시 후 다시 확인해 주세요.");
  }
  if (previewLease) sourceState = await persistReconciledMyImportState(env, selected.id, sourceHash, sourceStateKey, sourceState, () => assertSettingsLeaseFresh(previewLease));
  if (sourceState.state === "pending") return mappingError("이 원본의 이전 저장 결과를 확인하지 못해 새 분석을 중단했습니다. 기존 미리보기의 고정 ID를 유지합니다. 가져온 기록을 확인해 주세요.");
  if (sourceState.mapping && !mappingProtocol) return mappingError("이 원본의 열 연결을 확인한 최신 분석 화면을 사용해 주세요. 이전 화면에서는 거래를 저장하지 않습니다.");
  if (mappingProtocol && sourceState.stored_value && !sourceState.mapping && !previous) return mappingError("이 원본은 이미 저장을 시작한 기록이 있습니다. 기존 미리보기와 가져온 기록을 먼저 확인해 주세요. 새로운 연결과 거래 ID로 저장하지 않습니다.");
  const storedBasis = sourceState.mapping?.date_basis;
  const previousBasis = previous?.parsed?.date_basis || (sourceState.mapping?.used ? storedBasis : null);
  const sameBasis = previousBasis && (previousBasis.requested_mode || previousBasis.mode) === dateMode && (dateMode === "default" || Number(previous?.month?.slice(0, 4) || sourceState.mapping?.requested_year) === Number(month.slice(0, 4)));
  let parseBasis = sameBasis ? previousBasis : null;
  if (mappingProtocol && parseBasis?.file_year) {
    // Keep the verified clock/requested basis, but derive file-year evidence
    // again when the date column itself may have changed.
    parseBasis = { reference_date: parseBasis.reference_date, max_year: parseBasis.max_year, mode: parseBasis.requested_mode || dateMode, year: dateMode === "default" ? Number(parseBasis.reference_date.slice(0, 4)) : Number(month.slice(0, 4)) };
  }
  let parsed;
  try { parsed = parseFlexibleImportRecords(csvText, selected.id, userId, { source: "my_import", maxRows: 5000, importYear: Number(month.slice(0,4)), dateBasisMode: dateMode, ...(parseBasis ? { dateContext: parseBasis } : {}), ...(mappingProtocol ? { mappingMetadata: true, mappingDelta, mappingOffset } : {}) }); }
  catch (error) { if (String(error.message).startsWith("import_mapping_invalid:")) return mappingError(error.message.slice("import_mapping_invalid:".length), 400); throw error; }
  const basisIdentity = [parsed.date_basis?.reference_date, parsed.date_basis?.year, parsed.date_basis?.mode, parsed.date_basis?.requested_mode || parsed.date_basis?.mode, parsed.date_basis?.max_year, parsed.date_basis?.file_year || 0];
  const mappingHash = mappingProtocol ? await sha256Hex(JSON.stringify([parsed.mapping_delta, basisIdentity, dateMode, dateMode === "selected" ? Number(month.slice(0, 4)) : null])) : "";
  const currentMapping = sourceState.mapping;
  let retryCurrentMapping = false;
  if (mappingProtocol && sourceState.stored_value && !currentMapping && (parsed.mapping_delta.length || !sameBasis)) return mappingError("이 원본은 이전 화면에서 저장을 시작했습니다. 기존 연결과 날짜 기준을 유지해 주세요. 새로운 연결로 저장하지 않습니다.");
  if (currentMapping) {
    const currentPrevious = previous?.mapping_revision === currentMapping.revision && previous.jti === currentMapping.jti;
    const responseRetry = previous?.mapping_revision === currentMapping.request_revision && previous?.jti === currentMapping.request_jti && mappingHash === currentMapping.hash;
    const editingInFlight = !currentMapping.used && !!currentMapping.request_revision && previous?.mapping_revision === currentMapping.parent_revision && previous?.jti === currentMapping.parent_jti;
    if (previous && !currentPrevious && !responseRetry && !editingInFlight) return mappingError("다른 화면에서 열 연결이 바뀌었습니다. 최신 분석 결과를 확인한 뒤 다시 시도해 주세요.");
    if (currentMapping.used && mappingHash !== currentMapping.hash) return mappingError("이 원본은 저장을 시작했으므로 열 연결이나 날짜 기준을 바꿀 수 없습니다. 같은 연결로 다음 묶음을 분석하거나 가져온 기록을 확인해 주세요.");
    retryCurrentMapping = responseRetry;
  }
  const importLimit = boundedRuntimeNumber(env.MY_IMPORT_LIMIT, 120, 10, 1000);
  const outcomes = parsed.rejected.slice();
  let limited = 0;
  const skipDuplicates = form.get("skip_duplicates") === "1";
  const members = await fetchHouseholdMembers(env, selected.id);
  const actor = members.find(member => String(member.user_id) === userId);
  if (!actor || !canWriteMyHousehold(actor.role)) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&err=write_not_allowed`);
  const memberLookup = buildMyImportMemberLookup(members);
  const jti = retryCurrentMapping ? currentMapping.jti : sameBasis ? (previous?.jti || currentMapping?.jti) : randomHex(12);
  const ready = [];
  const duplicateBasis = [];
  let duplicateCandidates;
  try { duplicateCandidates = skipDuplicates || sameBasis ? await importDuplicateCandidates(env, selected.id, parsed.accepted.map(entry => entry.row)) : []; }
  catch (_) { return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, error: "기존 거래를 끝까지 확인하지 못해 분석을 중단했습니다. 거래는 저장하지 않았습니다. 잠시 후 다시 분석해 주세요." }), 503); }
  const knownKeys = new Map(duplicateCandidates.filter(row => row.source_user_key).map(row => [row.source_user_key, row]));
  const ownIds = duplicateCandidates.filter(row => String(row.source_user_key || "").startsWith(`import_v2264:${jti}:`)).map(row => String(row.id));
  const matcher = createImportDuplicateMatcher(duplicateCandidates, ownIds);
  for (const entry of parsed.accepted) {
    const prepared = prepareMyImportEntry(entry, userId, { ...selected, role: actor.role }, memberLookup, jti);
    if (prepared.error_code) { const rejected = importRejection("invalid_spender", entry.row_number, entry.raw); rejected.source_location = entry.source_location; outcomes.push(rejected); continue; }
    const matched = knownKeys.get(prepared.row.source_user_key) || (skipDuplicates && matcher.consume(prepared.row, prepared.spender_explicit));
    if (matched) {
      if (mappingProtocol && matched.source_user_key === prepared.row.source_user_key && myImportStoredValue({ ...prepared.row, id: matched.id }) !== myImportStoredValue(matched)) {
        const conflict = { ...importRejection("write_failed", entry.row_number, entry.raw), source_location: entry.source_location };
        conflict.suggestion = "이미 사용한 고정 ID의 기록과 현재 후보 값이 다릅니다. 같은 저장 성공이나 단순 중복으로 처리하지 않았습니다. 가져온 기록과 이전 구분 수정을 확인해 주세요.";
        outcomes.push(conflict);
        continue;
      }
      duplicateBasis.push(String(matched.id));
      outcomes.push({ ...importRejection("duplicate", entry.row_number, entry.raw), source_location: entry.source_location });
      continue;
    }
    if (ready.length >= importLimit) { limited++; outcomes.push({ ...importRejection("over_limit", entry.row_number, entry.raw), source_location: entry.source_location }); continue; }
    prepared.row.id = await myImportDeterministicTransactionId(jti, entry.row_number);
    ready.push(prepared);
  }
  const parsedMeta = {
    format: parsed.format,
    delimiter: parsed.delimiter,
    total_rows: Number(parsed.total_rows || 0),
    header_row: Number(parsed.header_row || 0),
    accepted_count: parsed.accepted.length,
    mappings: safeArray(parsed.mappings).slice(0, 40).map(item => mappingProtocol ? { ...item, source: String(item.source || "").slice(0, 80) } : item),
    warnings: safeArray(parsed.warnings).slice(0, 30),
    sign_convention: safeObject(parsed.sign_convention),
    two_digit_year_rows: Number(parsed.two_digit_year_rows || 0),
    date_basis: parsed.date_basis,
    analysis_complete: parsed.analysis_complete,
    unprocessed_rows: parsed.unprocessed_rows || 0,
    total_rows_known: parsed.total_rows_known,
    ...(mappingProtocol ? { mapping_schema: parsed.mapping_schema, mapping_delta: parsed.mapping_delta } : {}),
  };
  let mapping = null;
  if (mappingProtocol) {
    await registerMyImportSourceScope(env, selected.id, sourceHash, sourceStateKey, previewLease);
    const keep = currentMapping && currentMapping.hash === mappingHash && (previous || currentMapping.used);
    mapping = keep ? currentMapping : { revision: randomHex(16), parent_revision: currentMapping?.revision || "", parent_jti: currentMapping?.jti || "", request_revision: previous?.mapping_revision || "", request_jti: previous?.jti || "", hash: mappingHash, jti, used: !!sourceState.stored_value && (!currentMapping || currentMapping.used), date_basis: parsed.date_basis, requested_year: Number(month.slice(0, 4)) };
    if (!keep) {
      assertSettingsLeaseFresh(previewLease);
      sourceState = await changeMyImportSourceState(env, selected.id, sourceHash, sourceStateKey, { state: "preview", jti, rows: [], mapping }, sourceState);
    }
  }
  const payload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
    jti,
    source_hash: sourceHash,
    source_state_key: sourceStateKey,
    ...(mapping ? { mapping_revision: mapping.revision, mapping_hash: mapping.hash, mapping_locked: mapping.used } : {}),
    duplicate_basis: duplicateBasis,
    user_id: userId,
    household_id: selected.id,
    month,
    skip_duplicates: skipDuplicates,
    import_limit: importLimit,
    limited,
    parsed: parsedMeta,
    ready,
    outcomes: outcomes.slice(0, 160),
    reason_counts: myImportReasonCounts(outcomes),
  };
  const token = await makeMyImportPreviewToken(env, payload);
  if (token.length > 2 * 1024 * 1024) return mappingError("미리보기의 크기가 안전 한도를 넘었습니다. 긴 내용이나 행이 많은 원본은 파일을 나누어 다시 분석해 주세요. 거래는 저장하지 않았습니다.", 413);
  rememberMyImportSummary("my_import_preview", {
    total: parsed.total_rows,
    recognized: parsed.accepted.length,
    ready: ready.length,
    duplicate: Number(payload.reason_counts.duplicate || 0),
    limited,
    reasons: payload.reason_counts,
  });
  return myImportHtmlResponse(form, renderMyImportPreviewHtml({ env, selected, month, payload, token }));
  } finally { if (previewLease) await releaseOperationLease(env, previewLease); }
}

function importPreviewClientMain() {
  "use strict";
  var form = document.getElementById("myImportCommitForm");
  if (!form || form.dataset.abImportBound) return;
  form.dataset.abImportBound = "1";
  var picks = Array.from(form.querySelectorAll(".importPick"));
  var submit = document.getElementById("commitImport");
  var busy = false;
  function update() {
    var selected = picks.filter(function(pick) { return pick.checked; });
    var income = 0, expense = 0, review = 0;
    selected.forEach(function(pick) {
      var amount = Number(pick.dataset.amount || 0);
      if (pick.dataset.type === "income") income += amount;
      else expense += amount;
      if (pick.dataset.reviewNeeded === "1") review += 1;
    });
    document.getElementById("selectedImportCount").textContent = selected.length.toLocaleString("ko-KR") + "건 선택";
    document.getElementById("selectedImportIncome").textContent = income.toLocaleString("ko-KR") + "원";
    document.getElementById("selectedImportExpense").textContent = expense.toLocaleString("ko-KR") + "원";
    document.getElementById("selectedImportReview").textContent = review ? "선택한 항목 중 확인 필요 " + review + "건" : "선택한 항목에 추가 확인 표시가 없습니다.";
    if (submit) submit.disabled = busy || form.dataset.importStale === "1" || !selected.length;
  }
  picks.forEach(function(pick) { pick.addEventListener("change", update); });
  document.getElementById("selectAllImport").addEventListener("click", function() { picks.forEach(function(pick) { pick.checked = true; }); update(); });
  document.getElementById("clearImport").addEventListener("click", function() { picks.forEach(function(pick) { pick.checked = false; }); update(); });
  Array.from(form.querySelectorAll(".importTypePick")).forEach(function(select) {
    select.addEventListener("change", function() {
      var pick = form.querySelector('.importPick[value="' + select.getAttribute("data-row") + '"]');
      if (pick) pick.dataset.type = select.value === "income" ? "income" : "expense";
      update();
    });
  });
  var reviewButton = document.getElementById("reviewImportRows");
  if (reviewButton) reviewButton.addEventListener("click", function() {
    var onlyReview = reviewButton.getAttribute("aria-pressed") !== "true";
    reviewButton.setAttribute("aria-pressed", onlyReview ? "true" : "false");
    reviewButton.textContent = onlyReview ? "모든 후보 보기" : "확인 필요한 행 보기";
    picks.forEach(function(pick) { pick.closest("tr").hidden = onlyReview && pick.dataset.reviewNeeded !== "1"; });
  });
  form.addEventListener("submit", function(event) {
    if (busy || !picks.some(function(pick) { return pick.checked; })) { event.preventDefault(); return; }
    busy = true;
    if (submit) { submit.disabled = true; submit.setAttribute("aria-busy", "true"); submit.textContent = "선택 항목 저장 중…"; }
  });
  function shown() {
    busy = false;
    if (submit) { submit.removeAttribute("aria-busy"); submit.textContent = "선택한 항목 저장"; }
    update();
  }
  window.addEventListener("pageshow", shown);
  form.addEventListener("ab:import-preview-dispose", function() { window.removeEventListener("pageshow", shown); }, { once: true });
  update();
}

function myImportLocationLabel(entry = {}) {
  const location = entry.source_location;
  if (!location?.start_line) return `${Number(entry.row_number || 0)}번 기록`;
  return `${location.start_line}${location.end_line > location.start_line ? `~${location.end_line}` : ""}행 · 표 ${Number(location.section || 1)}`;
}

function myImportBasisNotice(parsed = {}, limited = 0) {
  const basis = parsed.date_basis;
  const dateNotice = basis ? `<p class="notice" id="importDateBasis">기준일 ${escapeHtml(basis.reference_date)} · 연도 없는 날짜는 ${basis.mode === "file" ? "파일에 명시한" : basis.mode === "selected" ? "선택한" : "현재 기본"} ${Number(basis.year)}년을 기준으로 읽었습니다.${basis.mode === "default" ? " 183일 넘게 뒤인 월일은 전년으로 보정합니다." : ""}</p>` : "";
  const incomplete = parsed.analysis_complete === false ? `<p class="notice" id="importIncomplete">전체 입력의 분석이 완료되지 않았습니다.${parsed.unprocessed_rows ? ` 뒤 ${Number(parsed.unprocessed_rows)}행은 분석하지 않았습니다.` : " 제외 사유에 표시한 오류 구간과 뒤 입력을 확인해 주세요."}${parsed.total_rows_known === false ? " 전체 행 수는 확정하지 않았습니다." : ""}</p>` : "";
  return `${dateNotice}${incomplete}${limited ? `<p class="notice">중복을 제외한 저장 후보 중 ${Number(limited)}행은 이번 저장 한도를 넘었습니다. 이번 묶음을 저장한 뒤 같은 파일을 다시 분석해 다음 묶음을 확인해 주세요.</p>` : ""}`;
}

function renderMyImportPreviewHtml({ env, selected, month, payload = {}, token = "", error = "" }) {
  const ready = safeArray(payload.ready);
  const outcomes = safeArray(payload.outcomes);
  const reasonCounts = safeObject(payload.reason_counts);
  const duplicate = Number(reasonCounts.duplicate || 0);
  const income = ready.filter((entry) => entry.row?.type === "income").reduce((sum, entry) => sum + Number(entry.row?.amount || 0), 0);
  const expense = ready.filter((entry) => entry.row?.type !== "income").reduce((sum, entry) => sum + Number(entry.row?.amount || 0), 0);
  const back = `/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const rows = ready.map((entry) => {
    const row = safeObject(entry.row);
    const reviewNeeded = safeArray(entry.warnings).length > 0 || /취소|환불|승인취소|cancel|refund/i.test([entry.raw, row.memo].join(" "));
    const warning = safeArray(entry.warnings).map((item) => `<small>${escapeHtml(item)}</small>`).join("");
    return `<tr${reviewNeeded ? ' class="importReviewRow"' : ""}><td data-label="선택"><label class="importPickTarget"><input class="importPick" type="checkbox" name="selected_rows" value="${Number(entry.row_number || 0)}" data-amount="${Number(row.amount || 0)}" data-type="${row.type === "income" ? "income" : "expense"}" data-review-needed="${reviewNeeded ? "1" : "0"}"${entry.needs_confirmation ? "" : " checked"} aria-label="${escapeHtml(myImportLocationLabel(entry))} 저장 선택${reviewNeeded ? " · 확인 필요" : ""}"/></label></td><td data-label="행">${escapeHtml(myImportLocationLabel(entry))}</td><td data-label="날짜">${escapeHtml(row.transaction_date || "-")}</td><td data-label="구분"><select class="importTypePick" name="row_type_${Number(entry.row_number || 0)}" data-row="${Number(entry.row_number || 0)}" aria-label="${escapeHtml(myImportLocationLabel(entry))} 구분"><option value="expense"${row.type === "income" ? "" : " selected"}>지출</option><option value="income"${row.type === "income" ? " selected" : ""}>수입</option></select></td><td data-label="금액">${numberWithCommas(row.amount || 0)}원</td><td data-label="분류·내용">${escapeHtml(row.category || "-")}<small>${escapeHtml(row.memo || "-")}</small>${reviewNeeded ? '<small class="importReviewBadge">확인 필요 · 취소·환불 또는 보정 내용을 확인하세요.</small>' : ""}</td><td data-label="결제수단·보정">${escapeHtml(row.payment_method || "-")}${warning}</td></tr>`;
  }).join("") || `<tr><td colspan="7">저장 가능한 행이 없습니다. 제외 사유를 확인해 원본의 해당 행만 수정해 주세요.</td></tr>`;
  const rejectedRows = outcomes.slice(0, 40).map((item) => `<tr><td>${escapeHtml(myImportLocationLabel(item))}</td><td><b>${escapeHtml(item.reason || "제외")}</b><small>${escapeHtml(item.suggestion || "")}</small></td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">제외된 행이 없습니다.</td></tr>`;
  const mappings = safeArray(payload.parsed?.mappings).map((item) => `<span>${escapeHtml(item.source || "-")} → <b>${escapeHtml(item.label || item.field || "-")}</b></span>`).join("") || "제목 행 없이 자연어·행 위치를 기준으로 분석했습니다.";
  // V22.9.37 감사 T10·D6: 추론한 부호 규칙과 두 자리 연도 해석을 미리보기에 밝힌다. 구분은 아래 표에서 행마다 바꿀 수 있다.
  const sign = safeObject(payload.parsed?.sign_convention);
  const signNotice = sign.mode === "signed"
    ? `<p class="notice" id="importSignConvention">부호 규칙: 금액이 있는 ${numberWithCommas(sign.amount_rows || 0)}행 중 ${numberWithCommas(sign.negative_rows || 0)}행이 음수라 <b>음수 = 지출, 양수 = 수입</b>으로 읽었습니다. 아래 표의 구분을 행마다 바꿀 수 있습니다.</p>`
    : Number(sign.negative_rows || 0) > 0 ? `<p class="notice" id="importSignConvention">부호 규칙: 음수 금액 ${numberWithCommas(sign.negative_rows)}행은 취소·환불(수입)로 읽고 확인 필요로 표시했습니다. 아래 표의 구분을 행마다 바꿀 수 있습니다.</p>` : "";
  const twoDigitNotice = Number(payload.parsed?.two_digit_year_rows || 0) > 0 ? `<p class="notice" id="importTwoDigitYear">두 자리 연도 날짜(예: 10/12/25) ${numberWithCommas(payload.parsed.two_digit_year_rows)}행은 월/일/연도 순서로 읽었습니다. 날짜 열을 확인해 주세요.</p>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 가져오기 미리보기</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:21px;margin:13px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:19px;padding:14px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px}.notice,.error{border-radius:16px;padding:12px;line-height:1.6}.notice{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.mapping{display:flex;flex-wrap:wrap;gap:7px}.mapping span{background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;padding:7px 10px;font-size:12px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px;cursor:pointer}.soft{background:#eef2f7;color:#111827}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:17px}table{width:100%;border-collapse:collapse;min-width:860px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;vertical-align:top;font-size:13px}td small{display:block;color:#64748b;line-height:1.45;margin-top:4px}.importPick{width:22px;height:22px}.importTypePick{min-height:36px;border:1px solid #cbd5e1;border-radius:10px;padding:4px 8px;font:inherit;background:#fff;color:#111827}button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:760px){.wrap{padding:12px}.hero{border-radius:22px}.metrics{grid-template-columns:1fr 1fr}.card{padding:16px}.btn,button{width:100%}}</style></head><body class="abImportPreview"><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain"><section class="hero"><h1>저장 전 미리보기</h1><p>${escapeHtml(selected.name || "가계부")}에 저장될 후보를 확인하고 필요한 행만 선택하세요. 아직 거래는 저장되지 않았습니다.</p></section>${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}${renderMyImportSourceReselect(selected, month, payload)}<div id="myImportWorkspace">${renderMyImportMappingEditor(payload)}<section class="metrics"><div class="metric"><span>원본 행</span><b>${numberWithCommas(payload.parsed?.total_rows || 0)}</b></div><div class="metric"><span>인식 행</span><b>${numberWithCommas(payload.parsed?.accepted_count || 0)}</b></div><div class="metric"><span>저장 후보</span><b>${numberWithCommas(ready.length)}</b></div><div class="metric"><span>중복 제외</span><b>${numberWithCommas(duplicate)}</b></div><div class="metric"><span>저장 후보 전체 수입</span><b>${numberWithCommas(income)}원</b></div><div class="metric"><span>저장 후보 전체 지출</span><b>${numberWithCommas(expense)}원</b></div></section><section class="card"><h2>인식 기준</h2><div class="mapping">${mappings}</div>${signNotice}${twoDigitNotice}${myImportBasisNotice(payload.parsed, payload.limited)}<p class="notice"><b>안전 확인 단계</b><br/>체크한 행만 저장합니다. 이 미리보기는 30분 뒤 만료되며, 저장 직전에 중복과 권한을 다시 확인합니다.</p></section><form id="myImportCommitForm" method="post" action="/my/import"><input type="hidden" name="import_action" value="commit"/><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="import_token" value="${escapeHtml(token)}"/><section class="card"><h2>저장할 행 선택</h2><div class="toolbar"><button id="selectAllImport" type="button" class="soft">전체 선택</button><button id="clearImport" type="button" class="soft">전체 해제</button><button id="reviewImportRows" type="button" class="soft" aria-pressed="false">확인 필요한 행 보기</button><b id="selectedImportCount" aria-live="polite">${numberWithCommas(ready.length)}건 선택</b></div><div class="tableWrap"><table><thead><tr><th>선택</th><th>행</th><th>날짜</th><th>구분</th><th>금액</th><th>분류·내용</th><th>결제수단·보정</th></tr></thead><tbody>${rows}</tbody></table></div><section class="importSelectionSummary" aria-label="선택한 항목의 저장 예정 금액"><div><span>선택한 수입</span><b id="selectedImportIncome">${numberWithCommas(income)}원</b></div><div><span>선택한 지출</span><b id="selectedImportExpense">${numberWithCommas(expense)}원</b></div><p id="selectedImportReview" role="status"></p><small>선택한 행 기준입니다. 저장 직전 중복 검사를 거치면 실제 저장 건수와 금액이 줄어들 수 있습니다. 확인 필요 필터를 바꿔도 선택은 유지됩니다.</small></section><div class="toolbar"><button id="commitImport" type="submit"${ready.length ? "" : " disabled"}>선택한 항목 저장</button><a class="btn soft" href="${escapeHtml(back)}">취소하고 돌아가기</a></div></section></form><section class="card"><h2>제외된 행과 이유</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>이유 / 해결 방법</th><th>원본 미리보기</th></tr></thead><tbody>${rejectedRows}</tbody></table></div>${outcomes.length > 40 ? `<p class="notice">처음 40행만 표시했습니다. 전체 사유 건수는 분석 결과에 반영되어 있습니다.</p>` : ""}</section></div></div></div></main><script>(${myBackupImportClientMain.toString()})();(${importMappingClientMain.toString()})(${importPreviewClientMain.toString()});</script></body></html>`;
}

function renderMyImportResultHtml({ env, selected, month, parsed, outcomes = [], acceptedWarnings = [], imported = 0, duplicate = 0, failed = 0, unknown = 0, limited = 0, importLimit = 120, selectedCount = 0 }) {
  const ignoredCodes = new Set(["preamble", "repeated_header", "summary_row"]);
  const ignored = outcomes.filter((item) => ignoredCodes.has(item.reason_code)).length;
  const notRecognized = outcomes.filter((item) => !ignoredCodes.has(item.reason_code) && !["duplicate", "over_limit", "write_failed", "write_unknown"].includes(item.reason_code)).length;
  const reasonCounts = Object.create(null);
  for (const item of outcomes) reasonCounts[item.reason_code] = (reasonCounts[item.reason_code] || 0) + 1;
  const reasonSummary = Object.entries(reasonCounts).map(([code, count]) => {
    const guide = IMPORT_REJECTION_GUIDE[code] || IMPORT_REJECTION_GUIDE.unsupported_row;
    return `<li><b>${escapeHtml(guide[0])}</b><span>${numberWithCommas(count)}행</span></li>`;
  }).join("") || `<li><b>제외된 행 없음</b><span>0행</span></li>`;
  const outcomeRows = outcomes.slice(0, 160).map((item) => `<tr><td>${escapeHtml(myImportLocationLabel(item))}</td><td><b>${escapeHtml(item.reason)}</b><small>${escapeHtml(item.suggestion)}</small></td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">인식하지 못하거나 제외한 행이 없습니다.</td></tr>`;
  const mappingRows = safeArray(parsed.mappings).map((item) => `<tr><td>${escapeHtml(item.source || "-")}</td><td>→</td><td><b>${escapeHtml(item.label || item.field || "-")}</b></td></tr>`).join("") || `<tr><td colspan="3">제목 행 없이 자연어·행 위치를 기준으로 분석했습니다.</td></tr>`;
  const warningRows = acceptedWarnings.slice(0, 100).map((item) => `<tr><td>${escapeHtml(myImportLocationLabel(item))}</td><td>${item.warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">자동 보정 주의사항이 없습니다.</td></tr>`;
  const back = `/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 가져오기 결과</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:21px;margin:13px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:19px;padding:14px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.ok b{color:#166534}.warn b{color:#9a3412}.bad b{color:#b91c1c}.meta{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.6}.reasonList{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.reasonList li{display:flex;justify-content:space-between;gap:8px;border:1px solid #e5e7eb;border-radius:15px;padding:11px}.reasonList span{color:#64748b}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:17px}table{width:100%;border-collapse:collapse;min-width:760px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;vertical-align:top;font-size:13px}td small,td span{display:block;color:#64748b;line-height:1.5;margin-top:4px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}.soft{background:#eef2f7;color:#111827}.notice{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero{border-radius:22px}.metrics{grid-template-columns:1fr 1fr}.card{padding:16px}table{min-width:680px}.btn{width:100%;margin:4px 0}}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain" data-import-unknown="${Number(unknown || 0)}"><section class="hero"><h1>가져오기 결과</h1><p>${escapeHtml(selected.name || "가계부")} · ${escapeHtml(parsed.format === "table" ? "제목이 있는 표" : parsed.format === "headerless_table" ? "제목 없는 표" : "자연어 목록")} · ${escapeHtml(parsed.delimiter || "자연어")}로 인식했습니다.</p><p><a class="btn soft" href="${escapeHtml(back)}">백업·가져오기로 돌아가기</a></p></section><section class="metrics"><div class="metric"><span>선택한 행</span><b>${numberWithCommas(selectedCount || imported + duplicate + failed)}</b></div><div class="metric ok"><span>저장 완료</span><b>${numberWithCommas(imported)}</b></div><div class="metric warn"><span>중복 제외</span><b>${numberWithCommas(duplicate)}</b></div><div class="metric"><span>설명·합계 제외</span><b>${numberWithCommas(ignored)}</b></div><div class="metric bad"><span>미인식</span><b>${numberWithCommas(notRecognized)}</b></div><div class="metric bad"><span>저장 안 됨</span><b>${numberWithCommas(failed)}</b></div><div class="metric warn"><span>확인 필요</span><b>${numberWithCommas(unknown)}</b></div><div class="metric warn"><span>처리 한도 초과</span><b>${numberWithCommas(limited)}</b></div></section><section class="card"><h2>분석 기준</h2><div class="meta">원본 ${numberWithCommas(parsed.total_rows || 0)}행 · 인식 가능 ${numberWithCommas(parsed.accepted_count || parsed.accepted?.length || 0)}행 · 1회 저장 한도 ${numberWithCommas(importLimit)}행${parsed.header_row ? ` · 제목 행 ${numberWithCommas(parsed.header_row)}번째` : " · 제목 행 없음"}</div><p class="notice"><b>원본 파일은 수정하지 않았습니다.</b><br/>저장하지 못한 행은 아래 원인과 수정 방법을 확인한 뒤 해당 행만 다시 가져오면 됩니다. 중복 제외 행도 새 기록으로 만들지 않았습니다.</p></section><section class="card"><h2>인식한 행 제목</h2><div class="tableWrap"><table><thead><tr><th>원본 제목</th><th></th><th>인식 필드</th></tr></thead><tbody>${mappingRows}</tbody></table></div></section><section class="card"><h2>제외·미인식 사유 요약</h2><ul class="reasonList">${reasonSummary}</ul></section><section class="card"><h2>행별 원인과 수정 방법</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>이유 / 해결 방법</th><th>원본 미리보기</th></tr></thead><tbody>${outcomeRows}</tbody></table></div>${outcomes.length > 160 ? `<p class="notice">화면에는 처음 160행만 표시했습니다. 같은 사유 ${numberWithCommas(outcomes.length - 160)}행은 요약에 포함되어 있습니다.</p>` : ""}</section><section class="card"><h2>저장했지만 자동 보정한 행</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>보정 내용</th><th>원본 미리보기</th></tr></thead><tbody>${warningRows}</tbody></table></div></section><section class="card"><a class="btn" href="${escapeHtml(back)}">다른 파일 가져오기</a> <a class="btn soft" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}&feed=all#feed">가져온 기록 확인</a></section></div></div></main><script>try{history.replaceState(null,"",${JSON.stringify(back)});}catch(e){}</script></body></html>`;
}
async function reconcileImportedTransactionIds(env, householdId, expectedRows = []) {
  const found = new Set();
  const expected = new Map(expectedRows.map(row => [String(row.id), myImportStoredValue(row)]));
  const clean = [...expected.keys()].filter(Boolean);
  for (let i = 0; i < clean.length; i += 80) {
    const params = new URLSearchParams({ select: "*", household_id: `eq.${householdId}`, id: `in.(${clean.slice(i, i + 80).join(",")})`, limit: "80" });
    const rows = await supabase(env, `/rest/v1/transactions?${params}`, { method: "GET" });
    if (!Array.isArray(rows)) throw new Error("import_reconcile_invalid");
    for (const row of rows) if (expected.get(String(row.id)) === myImportStoredValue(row)) found.add(String(row.id));
  }
  return found;
}

// Only error renders carry the id back (normal home renders add 0 bytes).
function abEchoQuickRequestId(url, err, html) {
  const rid = abTransactionRequestId(url.searchParams.get("rid"));
  if (!rid || !err) return html;
  return String(html).replace(/<input type="hidden" name="raw_text" id="rawTextInput"\/?>/, (m) => `<input type="hidden" name="request_id" value="${rid}">${m}`);
}

// @build:exports-start
export {
  abEchoQuickRequestId, decodeImportUploadBytes, handleMyBackupCsv, handleMyBackupPage,
  handleMyImport, householdMyImportSources, importPreviewClientMain,
  myImportDeterministicTransactionId, myImportReasonCounts, myImportStoredValue,
  prepareMyImportEntry, reconcileImportedTransactionIds, renderMyImportPreviewHtml,
  renderMyImportResultHtml,
};
// @build:exports-end
