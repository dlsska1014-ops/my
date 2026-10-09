// @build:imports-start
import {
  boundedRuntimeNumber, rememberDuplicateEvent, rememberOpsEvent,
} from "../runtime/ops-telemetry.js";
import { appName } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { csvResponse, htmlResponse, redirectResponse } from "../runtime/http.js";
import {
  makeMyImportPreviewToken, randomHex, sha256Hex, verifyMyImportPreviewToken,
} from "../auth/crypto-admin-session.js";
import {
  IMPORT_REJECTION_GUIDE, cleanImportedRowsForInsert, importRejection, parseFlexibleImportRecords,
} from "../import/flexible-import-parser.js";
import {
  attachSpenderNames, fetchAdminRows, fetchAdminRowsRange, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { safeArray, safeObject } from "../admin/backup-compare.js";
import { userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById } from "../data/users-household-create.js";
import { buildReadableTransactionsCsv } from "../import/csv-duplicates.js";
import {
  cardImportClientMain, cardImportCss, renderCardImportSection,
} from "./card-import-guide.js";
import {
  canManageMyHousehold, canWriteMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "./access-control.js";
import { renderMyStartChoiceHtml } from "../auth/local-login-pages.js";
import { myNavCss, renderMySideNav } from "../web/login-page-side-nav.js";
import { formatMessage } from "../kakao/reply-texts.js";
import { supabase } from "../data/supabase-client.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { currentMonthKst, formatDate, nowKstDate, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleMyBackupPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const user = await fetchUserById(env, userId);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const { households, selected, restricted } = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return htmlResponse(renderMyStartChoiceHtml({ env, user, err: "no_household" }));
  const hh = `household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  const msg = url.searchParams.get("msg") || "";
  const err = url.searchParams.get("err") || "";
  const sample = ["날짜,구분,금액,분류,내용,결제수단", `${formatDate(nowKstDate())},지출,12000,식비,점심,국민카드`, `${formatDate(nowKstDate())},수입,2500000,급여,월급,통장`].join("\n");
  const opts = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === selected.id ? " selected" : ""}>${escapeHtml(h.name)} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const canImport = canWriteMyHousehold(selected.role);
  const disabled = canImport ? "" : " disabled";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 백업/가져오기</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 48%,#eef2f7);font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#101828;letter-spacing:-.025em}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff}.hero p{color:#e5e7eb;line-height:1.6}.muted{color:#667085;line-height:1.6}.grid{display:grid;grid-template-columns:1fr 1fr;gap:14px}.aliasGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.alias{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px}.alias b{display:block}.alias span{display:block;color:#64748b;font-size:13px;line-height:1.5;margin-top:4px}input,select,textarea{width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit;background:#fff;min-width:0}textarea{min-height:190px;font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:13px}button,.btn{display:inline-flex;align-items:center;justify-content:center;border:0;border-radius:14px;background:#111827;color:#fff!important;padding:11px 14px;text-decoration:none;font-weight:1000;cursor:pointer}.secondary{background:#eef2f7!important;color:#111827!important;border:1px solid #d8dee8}.ok{background:#ecfdf5;color:#166534;border:1px solid #bbf7d0;border-radius:14px;padding:11px}.error,.warn{background:#fff7ed;color:#9a3412;border:1px solid #fed7aa;border-radius:14px;padding:11px;line-height:1.6}.fileStatus{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a;border-radius:14px;padding:10px;line-height:1.5}button:disabled,input:disabled,textarea:disabled{opacity:.55;cursor:not-allowed}@media(max-width:760px){.grid{grid-template-columns:1fr}.wrap{padding:12px}.hero,.card{border-radius:22px}}${cardImportCss()}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain"><section class="hero"><h1>다른 가계부에서 안전하게 옮기기</h1><p>CSV·TSV·TXT·엑셀의 여러 시트를 받고, 제목 유사어와 자연어 행을 함께 분석합니다. 저장 전 미리보기에서 인식 결과와 중복 후보를 확인하고 필요한 행만 선택합니다.</p></section>${msg ? `<div class="ok">${formatMessage(msg)}</div>` : ""}${err ? `<div class="error">${formatMessage(err)}</div>` : ""}<section class="card"><form method="get" action="/my/backup"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}" style="margin-top:8px"/><p><button type="submit">조회</button> <a class="btn secondary" href="/my?${hh}">내 가계부</a></p></form></section><section class="grid"><div class="card"><h2>백업 다운로드</h2><p class="muted">선택한 월의 기록을 UTF-8 CSV로 받습니다. 엑셀에서 바로 열 수 있습니다.</p><p><a class="btn" href="/my/backup.csv?${hh}">CSV 다운로드</a> <a class="btn" href="/my/backup.csv?${hh}&amp;range=all">전체 기간 CSV</a></p><p class="muted">컬럼: 날짜, 구분, 금액, 분류, 내용, 결제수단, 출처, 기록ID. 가계부를 삭제하기 전에는 전체 기간 CSV를 받아 두세요.</p></div><div class="card"><h2>파일·붙여넣기 가져오기</h2><p class="muted">첫 단계는 분석 미리보기이며 거래를 저장하지 않습니다. 미리보기에서 행을 선택하고 다시 확인해야 실제 저장됩니다.</p>${canImport ? "" : `<div class="warn"><b>조회 전용 권한</b><br/>현재 권한에서는 백업 다운로드만 가능하고 가져오기는 소유자·관리자·구성원만 할 수 있습니다.</div>`}<form id="myImportForm" method="post" action="/my/import" enctype="multipart/form-data"><input type="hidden" name="import_action" value="preview"/><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><p><input id="myImportFile" type="file" name="csv_file" accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"${disabled}/></p><div id="myImportFileStatus" class="fileStatus">CSV·TSV·TXT는 서버에서 바로 읽습니다. XLS/XLSX는 이 브라우저에서 모든 시트를 텍스트 표로 변환합니다.</div><p><textarea id="myImportText" name="csv_text" placeholder="${escapeHtml(sample)}&#10;&#10;또는 자연어:&#10;어제 점심 12000원 국민카드&#10;7월 14일 월급 250만원"${disabled}></textarea></p><label class="muted"><input type="checkbox" name="skip_duplicates" value="1" checked style="width:auto"${disabled}/> 같은 날짜·금액·내용은 중복 후보로 미리 제외</label><p><button id="myImportSubmit" type="submit"${disabled}>1. 분석 미리보기</button></p></form></div></section>${renderCardImportSection({ canImport })}<section class="card"><h2>자동 인식하는 제목 유사어</h2><div class="aliasGrid"><div class="alias"><b>날짜</b><span>날짜, 일자, 거래일, 사용일, 승인일, 결제일, date, datetime</span></div><div class="alias"><b>금액</b><span>금액, 거래금액, 승인금액, 결제금액, 지출·출금, 수입·입금, debit·credit</span></div><div class="alias"><b>내용</b><span>내용, 내역, 적요, 메모, 사용처, 가맹점, 상호, description, merchant</span></div><div class="alias"><b>분류</b><span>분류, 카테고리, 항목, 대·중·소분류, category, tag</span></div><div class="alias"><b>결제수단</b><span>결제수단, 카드, 계좌, 은행, 자산, payment, account</span></div><div class="alias"><b>지출자</b><span>지출자, 결제자, 사용자, 구성원, 담당자, payer, spender</span></div></div></section><section class="card"><h2>붙여넣기 예시</h2><textarea readonly>${escapeHtml(sample)}</textarea><p class="muted">날짜가 없는 자연어 행은 오늘 날짜로 보정하며 미리보기에 표시합니다. 제목이 있는 표에서 날짜가 없거나 형식이 잘못된 행은 임의 저장하지 않고 이유를 안내합니다.</p></section></div></div></main><script src="https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js"></script><script>(function(){var input=document.getElementById('myImportFile');var area=document.getElementById('myImportText');var status=document.getElementById('myImportFileStatus');var form=document.getElementById('myImportForm');var submit=document.getElementById('myImportSubmit');if(!input||!area||!form)return;function setStatus(text,bad){status.textContent=text;status.style.background=bad?'#fff7ed':'#eff6ff';status.style.borderColor=bad?'#fed7aa':'#bfdbfe';status.style.color=bad?'#9a3412':'#1e3a8a';}input.addEventListener('change',function(){var file=input.files&&input.files[0];if(!file)return;var name=String(file.name||'').toLowerCase();if(!/\.xlsx?$/.test(name)){setStatus('선택한 '+file.name+' 파일은 서버에서 제목 유사어와 자연어를 분석합니다.',false);return;}var reader=new FileReader();setStatus('엑셀의 모든 시트를 변환하고 있습니다…',false);reader.onload=function(event){try{if(!window.XLSX)throw new Error('엑셀 변환 라이브러리를 불러오지 못했습니다. 파일을 CSV로 저장하거나 표를 복사해 붙여넣어 주세요.');var workbook=XLSX.read(new Uint8Array(event.target.result),{type:'array',cellDates:false});var chunks=[];workbook.SheetNames.forEach(function(sheetName){var sheet=workbook.Sheets[sheetName];var tsv=XLSX.utils.sheet_to_csv(sheet,{FS:'\t',RS:'\n',rawNumbers:false});if(String(tsv||'').trim())chunks.push('# 시트: '+sheetName+'\n'+String(tsv).trim());});if(!chunks.length)throw new Error('값이 있는 시트를 찾지 못했습니다.');area.value=chunks.join('\n');input.value='';setStatus('엑셀 '+workbook.SheetNames.length+'개 시트를 변환했습니다. 아래 내용 확인 후 미리보기를 누르세요.',false);}catch(error){setStatus(error.message||String(error),true);}};reader.onerror=function(){setStatus('엑셀 파일을 읽지 못했습니다. CSV로 저장하거나 표를 복사해 붙여넣어 주세요.',true);};reader.readAsArrayBuffer(file);});form.addEventListener('submit',function(event){var file=input.files&&input.files[0];if(file&&/\.xlsx?$/.test(String(file.name||'').toLowerCase())){event.preventDefault();setStatus('엑셀 변환이 끝날 때까지 기다리거나 CSV로 저장해 주세요.',true);return;}if(submit&&!submit.disabled){submit.disabled=true;submit.setAttribute('aria-busy','true');submit.textContent='미리보기 분석 중…';}});})();</script><script id="cardImportRuntime">(${cardImportClientMain.toString()})({formId:"myImportForm",fileId:"myImportFile",textId:"myImportText"});</script></body></html>`);
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
  const rawRows = allRange
    ? await fetchAdminRowsRange(env, { householdId: selected.id, start: "2000-01-01", end: "2100-01-01", type: "all", limit: 200000 })
    : await fetchAdminRows(env, { month, householdId: selected.id, type: "all" });
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
    return decodeImportUploadBytes(new Uint8Array(buffer));
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
  if (spender) {
    const key = normalizeText(spender).toLowerCase().replace(/\s+/g, "");
    const matches = memberLookup.get(key) || [];
    if (canManageMyHousehold(selected.role) && matches.length === 1) row.user_id = matches[0].user_id || userId;
    else if (matches.length !== 1) warnings.push(`지출자 ‘${spender}’을 현재 참여자 한 명과 정확히 연결하지 못해 가져온 사용자 기록으로 저장합니다.`);
    else if (!canManageMyHousehold(selected.role)) warnings.push("member 권한에서는 다른 지출자를 지정할 수 없어 내 기록으로 저장합니다.");
  }
  if (jti) row.source_user_key = `import_v2264:${String(jti).slice(0, 48)}:${Number(entry.row_number || 0)}`;
  return {
    row_number: Number(entry.row_number || 0),
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
  const amounts = [...new Set(rows.map(row => Math.round(Number(row.amount || 0))))];
  const found = [];
  for (let i = 0; i < amounts.length; i += 500) {
    for (let offset = 0; ; offset += 1000) {
      const params = new URLSearchParams({household_id:`eq.${householdId}`, amount:`in.(${amounts.slice(i,i+500).join(",")})`, select:"*", order:"id.asc", limit:"1000", offset:String(offset)});
      const page = await supabase(env, `/rest/v1/transactions?${params}`, {method:"GET"});
      if (!Array.isArray(page)) throw new Error("import_duplicate_source_invalid");
      found.push(...page);
      if (page.length < 1000) break;
    }
  }
  return found;
}

function importedRowDuplicate(candidates, row, exact = true) {
  const norm = v => normalizeText(v || "");
  return candidates.some(other => other.source_user_key && other.source_user_key === row.source_user_key || exact && other.transaction_date === row.transaction_date && other.type === row.type && Number(other.amount) === Number(row.amount) && (norm(row.raw_text) && norm(other.raw_text) === norm(row.raw_text) || norm(other.category) === norm(row.category) && norm(other.memo) === norm(row.memo) && norm(other.payment_method) === norm(row.payment_method)));
}

function myImportReasonCounts(outcomes = []) {
  const counts = {};
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
  const householdId = String(tokenPayload?.household_id || form.get("household_id") || "").trim();
  const month = validMonth(String(tokenPayload?.month || form.get("month") || "")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const { selected, restricted } = await getMySelectedHousehold(env, userId, householdId);
  if (restricted) return myAccessStatusResponse({ env, user, household: restricted, role: restricted.role, month });
  if (!selected) return redirectResponse("/my?err=no_household");
  if (!canWriteMyHousehold(selected.role)) return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=write_not_allowed`);

  if (importAction === "commit") {
    if (!tokenPayload || tokenPayload.user_id !== userId || tokenPayload.household_id !== selected.id) {
      return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_preview_expired`);
    }
    const selectedRows = new Set(form.getAll("selected_rows").map((value) => Number(value)).filter((value) => Number.isInteger(value) && value > 0));
    const ready = safeArray(tokenPayload.ready);
    if (!selectedRows.size) {
      return htmlResponse(renderMyImportPreviewHtml({ env, selected, month, payload: tokenPayload, token: previewToken, error: "저장할 행을 한 개 이상 선택해 주세요." }));
    }
    const entries = ready.filter((entry) => selectedRows.has(Number(entry.row_number || 0)));
    const outcomes = safeArray(tokenPayload.outcomes).slice();
    const acceptedWarnings = [];
    const skipDuplicates = tokenPayload.skip_duplicates !== false;
    const members = await fetchHouseholdMembers(env, selected.id);
    const memberIds = new Set(members.filter((member) => !["blocked", "pending"].includes(String(member.role || ""))).map((member) => String(member.user_id || "")).filter(Boolean));
    memberIds.add(userId);
    let imported = 0, duplicate = 0, failed = 0;
    const pendingRows = [];
    const pendingEntries = [];
    const duplicateCandidates = await importDuplicateCandidates(env, selected.id, entries.map(entry => entry.row));
    for (const entry of entries) {
      const candidate = safeObject(entry.row);
      if (String(candidate.household_id || "") !== selected.id) {
        failed += 1;
        outcomes.push(importRejection("write_failed", entry.row_number, entry.raw));
        continue;
      }
      if (!memberIds.has(String(candidate.user_id || ""))) candidate.user_id = userId;
      const row = cleanImportedRowsForInsert([candidate])[0];
      if (!row) {
        failed += 1;
        outcomes.push(importRejection("write_failed", entry.row_number, entry.raw));
        continue;
      }
      if (importedRowDuplicate(duplicateCandidates, row, false)) {
        duplicate += 1;
        outcomes.push(importRejection("duplicate", entry.row_number, entry.raw));
        continue;
      }
      if (skipDuplicates && importedRowDuplicate(duplicateCandidates, row)) {
        duplicate += 1;
        outcomes.push(importRejection("duplicate", entry.row_number, entry.raw));
        continue;
      }
      pendingRows.push(row);
      pendingEntries.push(entry);
    }
    if (pendingRows.length) {
      try {
        const result = await supabase(env, "/rest/v1/rpc/accountbook_import_transactions_v227", {
          method: "POST",
          headers: { Prefer: "return=representation" },
          body: JSON.stringify({ p_household_id: selected.id, p_rows: pendingRows }),
        });
        const summary = Array.isArray(result) ? result[0] : result;
        imported += Math.max(0, Number(summary?.inserted || 0));
        duplicate += Math.max(0, Number(summary?.duplicates || 0));
        for (const entry of pendingEntries) {
          if (safeArray(entry.warnings).length) acceptedWarnings.push({ row_number: entry.row_number, raw: entry.raw, warnings: entry.warnings });
        }
      } catch (err) {
        failed += pendingRows.length;
        for (const entry of pendingEntries) outcomes.push(importRejection("write_failed", entry.row_number, entry.raw));
        rememberOpsEvent({ kind: "my_import_batch_failed", severity: "error", path: "/my/import", method: "POST", detail: `rows=${pendingRows.length} ${safeError(err)}` });
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
    return htmlResponse(renderMyImportResultHtml({
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
      limited: Number(tokenPayload.limited || 0),
      importLimit: Number(tokenPayload.import_limit || ready.length || 120),
      selectedCount: entries.length,
    }));
  }

  let csvText = String(form.get("csv_text") || "");
  const file = form.get("csv_file");
  const maxBytes = boundedRuntimeNumber(env.MY_IMPORT_MAX_BYTES, 5 * 1024 * 1024, 1024 * 1024, 15 * 1024 * 1024);
  const fileName = String(file?.name || "").toLowerCase();
  const isExcelBinary = /\.xlsx?$/.test(fileName) || /(?:spreadsheetml|ms-excel)/i.test(String(file?.type || ""));
  if (!csvText.trim() && isExcelBinary) {
    return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=excel_conversion_required`);
  }
  if (!csvText.trim() && file && Number(file.size || 0) > maxBytes) {
    return redirectResponse(`/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}&err=import_file_too_large`);
  }
  if (!csvText.trim() && file && (typeof file.arrayBuffer === "function" || typeof file.text === "function")) {
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
  const parsed = parseFlexibleImportRecords(csvText, selected.id, userId, { source: "my_import", maxRows: 5000, importYear: Number(month.slice(0,4)) });
  const importLimit = boundedRuntimeNumber(env.MY_IMPORT_LIMIT, 120, 10, 1000);
  const entries = parsed.accepted.slice(0, importLimit);
  const outcomes = parsed.rejected.slice();
  const limited = Math.max(0, parsed.accepted.length - entries.length);
  if (limited) {
    for (const entry of parsed.accepted.slice(importLimit)) outcomes.push(importRejection("over_limit", entry.row_number, entry.raw));
    rememberDuplicateEvent({ kind: "bulk_limited", source: "my_import", household_id: selected.id, user_id: userId, detail: `${parsed.accepted.length} valid, ${entries.length} processed`, path: "/my/import", method: "POST" });
  }
  const skipDuplicates = form.get("skip_duplicates") === "1";
  const members = await fetchHouseholdMembers(env, selected.id);
  const memberLookup = buildMyImportMemberLookup(members);
  const jti = randomHex(12);
  const ready = [];
  const duplicateCandidates = skipDuplicates ? await importDuplicateCandidates(env, selected.id, entries.map(entry => entry.row)) : [];
  for (const entry of entries) {
    const prepared = prepareMyImportEntry(entry, userId, selected, memberLookup, jti);
    prepared.row.id = await myImportDeterministicTransactionId(jti, entry.row_number);
    if (skipDuplicates && importedRowDuplicate(duplicateCandidates, prepared.row)) {
      outcomes.push(importRejection("duplicate", entry.row_number, entry.raw));
      continue;
    }
    ready.push(prepared);
  }
  const parsedMeta = {
    format: parsed.format,
    delimiter: parsed.delimiter,
    total_rows: Number(parsed.total_rows || 0),
    header_row: Number(parsed.header_row || 0),
    accepted_count: parsed.accepted.length,
    mappings: safeArray(parsed.mappings).slice(0, 40),
    warnings: safeArray(parsed.warnings).slice(0, 30),
  };
  const payload = {
    v: 1,
    exp: Math.floor(Date.now() / 1000) + 30 * 60,
    jti,
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
  rememberMyImportSummary("my_import_preview", {
    total: parsed.total_rows,
    recognized: parsed.accepted.length,
    ready: ready.length,
    duplicate: Number(payload.reason_counts.duplicate || 0),
    limited,
    reasons: payload.reason_counts,
  });
  return htmlResponse(renderMyImportPreviewHtml({ env, selected, month, payload, token }));
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
    if (submit) submit.disabled = busy || !selected.length;
  }
  picks.forEach(function(pick) { pick.addEventListener("change", update); });
  document.getElementById("selectAllImport").addEventListener("click", function() { picks.forEach(function(pick) { pick.checked = true; }); update(); });
  document.getElementById("clearImport").addEventListener("click", function() { picks.forEach(function(pick) { pick.checked = false; }); update(); });
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
  window.addEventListener("pageshow", function() {
    busy = false;
    if (submit) { submit.removeAttribute("aria-busy"); submit.textContent = "선택한 항목 저장"; }
    update();
  });
  update();
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
    return `<tr${reviewNeeded ? ' class="importReviewRow"' : ""}><td data-label="선택"><label class="importPickTarget"><input class="importPick" type="checkbox" name="selected_rows" value="${Number(entry.row_number || 0)}" data-amount="${Number(row.amount || 0)}" data-type="${row.type === "income" ? "income" : "expense"}" data-review-needed="${reviewNeeded ? "1" : "0"}"${entry.needs_confirmation ? "" : " checked"} aria-label="${Number(entry.row_number || 0)}행 저장 선택${reviewNeeded ? " · 확인 필요" : ""}"/></label></td><td data-label="행">${numberWithCommas(entry.row_number || 0)}</td><td data-label="날짜">${escapeHtml(row.transaction_date || "-")}</td><td data-label="구분"><b>${row.type === "income" ? "수입" : "지출"}</b></td><td data-label="금액">${numberWithCommas(row.amount || 0)}원</td><td data-label="분류·내용">${escapeHtml(row.category || "-")}<small>${escapeHtml(row.memo || "-")}</small>${reviewNeeded ? '<small class="importReviewBadge">확인 필요 · 취소·환불 또는 보정 내용을 확인하세요.</small>' : ""}</td><td data-label="결제수단·보정">${escapeHtml(row.payment_method || "-")}${warning}</td></tr>`;
  }).join("") || `<tr><td colspan="7">저장 가능한 행이 없습니다. 제외 사유를 확인해 원본의 해당 행만 수정해 주세요.</td></tr>`;
  const rejectedRows = outcomes.slice(0, 40).map((item) => `<tr><td>${numberWithCommas(item.row_number || 0)}</td><td><b>${escapeHtml(item.reason || "제외")}</b><small>${escapeHtml(item.suggestion || "")}</small></td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">제외된 행이 없습니다.</td></tr>`;
  const mappings = safeArray(payload.parsed?.mappings).map((item) => `<span>${escapeHtml(item.source || "-")} → <b>${escapeHtml(item.label || item.field || "-")}</b></span>`).join("") || "제목 행 없이 자연어·행 위치를 기준으로 분석했습니다.";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 가져오기 미리보기</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:21px;margin:13px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:9px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:19px;padding:14px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px}.notice,.error{border-radius:16px;padding:12px;line-height:1.6}.notice{background:#eff6ff;border:1px solid #bfdbfe;color:#1e3a8a}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.mapping{display:flex;flex-wrap:wrap;gap:7px}.mapping span{background:#f8fafc;border:1px solid #e5e7eb;border-radius:999px;padding:7px 10px;font-size:12px}.toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin:10px 0}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border:0;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px;cursor:pointer}.soft{background:#eef2f7;color:#111827}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:17px}table{width:100%;border-collapse:collapse;min-width:860px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;vertical-align:top;font-size:13px}td small{display:block;color:#64748b;line-height:1.45;margin-top:4px}.importPick{width:22px;height:22px}button:disabled{opacity:.55;cursor:not-allowed}@media(max-width:760px){.wrap{padding:12px}.hero{border-radius:22px}.metrics{grid-template-columns:1fr 1fr}.card{padding:16px}.btn,button{width:100%}}</style></head><body class="abImportPreview"><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain"><section class="hero"><h1>저장 전 미리보기</h1><p>${escapeHtml(selected.name || "가계부")}에 저장될 후보를 확인하고 필요한 행만 선택하세요. 아직 거래는 저장되지 않았습니다.</p></section>${error ? `<div class="error">${escapeHtml(error)}</div>` : ""}<section class="metrics"><div class="metric"><span>원본 행</span><b>${numberWithCommas(payload.parsed?.total_rows || 0)}</b></div><div class="metric"><span>인식 행</span><b>${numberWithCommas(payload.parsed?.accepted_count || 0)}</b></div><div class="metric"><span>저장 후보</span><b>${numberWithCommas(ready.length)}</b></div><div class="metric"><span>중복 제외</span><b>${numberWithCommas(duplicate)}</b></div><div class="metric"><span>저장 후보 전체 수입</span><b>${numberWithCommas(income)}원</b></div><div class="metric"><span>저장 후보 전체 지출</span><b>${numberWithCommas(expense)}원</b></div></section><section class="card"><h2>인식 기준</h2><div class="mapping">${mappings}</div><p class="notice"><b>안전 확인 단계</b><br/>체크한 행만 저장합니다. 이 미리보기는 30분 뒤 만료되며, 저장 직전에 중복과 권한을 다시 확인합니다.</p></section><form id="myImportCommitForm" method="post" action="/my/import"><input type="hidden" name="import_action" value="commit"/><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="import_token" value="${escapeHtml(token)}"/><section class="card"><h2>저장할 행 선택</h2><div class="toolbar"><button id="selectAllImport" type="button" class="soft">전체 선택</button><button id="clearImport" type="button" class="soft">전체 해제</button><button id="reviewImportRows" type="button" class="soft" aria-pressed="false">확인 필요한 행 보기</button><b id="selectedImportCount" aria-live="polite">${numberWithCommas(ready.length)}건 선택</b></div><div class="tableWrap"><table><thead><tr><th>선택</th><th>행</th><th>날짜</th><th>구분</th><th>금액</th><th>분류·내용</th><th>결제수단·보정</th></tr></thead><tbody>${rows}</tbody></table></div><section class="importSelectionSummary" aria-label="선택한 항목의 저장 예정 금액"><div><span>선택한 수입</span><b id="selectedImportIncome">${numberWithCommas(income)}원</b></div><div><span>선택한 지출</span><b id="selectedImportExpense">${numberWithCommas(expense)}원</b></div><p id="selectedImportReview" role="status"></p><small>선택한 행 기준입니다. 저장 직전 중복 검사를 거치면 실제 저장 건수와 금액이 줄어들 수 있습니다. 확인 필요 필터를 바꿔도 선택은 유지됩니다.</small></section><div class="toolbar"><button id="commitImport" type="submit"${ready.length ? "" : " disabled"}>선택한 항목 저장</button><a class="btn soft" href="${escapeHtml(back)}">취소하고 돌아가기</a></div></section></form><section class="card"><h2>제외된 행과 이유</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>이유 / 해결 방법</th><th>원본 미리보기</th></tr></thead><tbody>${rejectedRows}</tbody></table></div>${outcomes.length > 40 ? `<p class="notice">처음 40행만 표시했습니다. 전체 사유 건수는 분석 결과에 반영되어 있습니다.</p>` : ""}</section></div></div></main><script>(${importPreviewClientMain.toString()})();</script></body></html>`;
}

function renderMyImportResultHtml({ env, selected, month, parsed, outcomes = [], acceptedWarnings = [], imported = 0, duplicate = 0, failed = 0, limited = 0, importLimit = 120, selectedCount = 0 }) {
  const ignoredCodes = new Set(["preamble", "repeated_header", "summary_row"]);
  const ignored = outcomes.filter((item) => ignoredCodes.has(item.reason_code)).length;
  const notRecognized = outcomes.filter((item) => !ignoredCodes.has(item.reason_code) && !["duplicate", "over_limit", "write_failed"].includes(item.reason_code)).length;
  const reasonCounts = {};
  for (const item of outcomes) reasonCounts[item.reason_code] = (reasonCounts[item.reason_code] || 0) + 1;
  const reasonSummary = Object.entries(reasonCounts).map(([code, count]) => {
    const guide = IMPORT_REJECTION_GUIDE[code] || IMPORT_REJECTION_GUIDE.unsupported_row;
    return `<li><b>${escapeHtml(guide[0])}</b><span>${numberWithCommas(count)}행</span></li>`;
  }).join("") || `<li><b>제외된 행 없음</b><span>0행</span></li>`;
  const outcomeRows = outcomes.slice(0, 160).map((item) => `<tr><td>${numberWithCommas(item.row_number || 0)}</td><td><b>${escapeHtml(item.reason)}</b><small>${escapeHtml(item.suggestion)}</small></td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">인식하지 못하거나 제외한 행이 없습니다.</td></tr>`;
  const mappingRows = safeArray(parsed.mappings).map((item) => `<tr><td>${escapeHtml(item.source || "-")}</td><td>→</td><td><b>${escapeHtml(item.label || item.field || "-")}</b></td></tr>`).join("") || `<tr><td colspan="3">제목 행 없이 자연어·행 위치를 기준으로 분석했습니다.</td></tr>`;
  const warningRows = acceptedWarnings.slice(0, 100).map((item) => `<tr><td>${numberWithCommas(item.row_number || 0)}</td><td>${item.warnings.map((warning) => `<span>${escapeHtml(warning)}</span>`).join("")}</td><td>${escapeHtml(item.raw || "-")}</td></tr>`).join("") || `<tr><td colspan="3">자동 보정 주의사항이 없습니다.</td></tr>`;
  const back = `/my/backup?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 가져오기 결과</title><style>${myNavCss()}*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1240px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:26px;padding:21px;margin:13px 0;box-shadow:0 12px 32px rgba(15,23,42,.06)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.metrics{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:9px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:19px;padding:14px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.ok b{color:#166534}.warn b{color:#9a3412}.bad b{color:#b91c1c}.meta{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.6}.reasonList{list-style:none;margin:0;padding:0;display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:8px}.reasonList li{display:flex;justify-content:space-between;gap:8px;border:1px solid #e5e7eb;border-radius:15px;padding:11px}.reasonList span{color:#64748b}.tableWrap{overflow:auto;border:1px solid #e5e7eb;border-radius:17px}table{width:100%;border-collapse:collapse;min-width:760px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;vertical-align:top;font-size:13px}td small,td span{display:block;color:#64748b;line-height:1.5;margin-top:4px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:44px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}.soft{background:#eef2f7;color:#111827}.notice{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:12px;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero{border-radius:22px}.metrics{grid-template-columns:1fr 1fr}.card{padding:16px}table{min-width:680px}.btn{width:100%;margin:4px 0}}</style></head><body><main class="wrap"><div class="appLayout">${renderMySideNav(selected, selected.role, month, "backup")}<div class="pageMain"><section class="hero"><h1>가져오기 결과</h1><p>${escapeHtml(selected.name || "가계부")} · ${escapeHtml(parsed.format === "table" ? "제목이 있는 표" : parsed.format === "headerless_table" ? "제목 없는 표" : "자연어 목록")} · ${escapeHtml(parsed.delimiter || "자연어")}로 인식했습니다.</p><p><a class="btn soft" href="${escapeHtml(back)}">백업·가져오기로 돌아가기</a></p></section><section class="metrics"><div class="metric"><span>선택한 행</span><b>${numberWithCommas(selectedCount || imported + duplicate + failed)}</b></div><div class="metric ok"><span>저장 완료</span><b>${numberWithCommas(imported)}</b></div><div class="metric warn"><span>중복 제외</span><b>${numberWithCommas(duplicate)}</b></div><div class="metric"><span>설명·합계 제외</span><b>${numberWithCommas(ignored)}</b></div><div class="metric bad"><span>미인식</span><b>${numberWithCommas(notRecognized)}</b></div><div class="metric bad"><span>저장 오류</span><b>${numberWithCommas(failed)}</b></div><div class="metric warn"><span>처리 한도 초과</span><b>${numberWithCommas(limited)}</b></div></section><section class="card"><h2>분석 기준</h2><div class="meta">원본 ${numberWithCommas(parsed.total_rows || 0)}행 · 인식 가능 ${numberWithCommas(parsed.accepted_count || parsed.accepted?.length || 0)}행 · 1회 저장 한도 ${numberWithCommas(importLimit)}행${parsed.header_row ? ` · 제목 행 ${numberWithCommas(parsed.header_row)}번째` : " · 제목 행 없음"}</div><p class="notice"><b>원본 파일은 수정하지 않았습니다.</b><br/>저장하지 못한 행은 아래 원인과 수정 방법을 확인한 뒤 해당 행만 다시 가져오면 됩니다. 중복 제외 행도 새 기록으로 만들지 않았습니다.</p></section><section class="card"><h2>인식한 행 제목</h2><div class="tableWrap"><table><thead><tr><th>원본 제목</th><th></th><th>인식 필드</th></tr></thead><tbody>${mappingRows}</tbody></table></div></section><section class="card"><h2>제외·미인식 사유 요약</h2><ul class="reasonList">${reasonSummary}</ul></section><section class="card"><h2>행별 원인과 수정 방법</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>이유 / 해결 방법</th><th>원본 미리보기</th></tr></thead><tbody>${outcomeRows}</tbody></table></div>${outcomes.length > 160 ? `<p class="notice">화면에는 처음 160행만 표시했습니다. 같은 사유 ${numberWithCommas(outcomes.length - 160)}행은 요약에 포함되어 있습니다.</p>` : ""}</section><section class="card"><h2>저장했지만 자동 보정한 행</h2><div class="tableWrap"><table><thead><tr><th>행</th><th>보정 내용</th><th>원본 미리보기</th></tr></thead><tbody>${warningRows}</tbody></table></div></section><section class="card"><a class="btn" href="${escapeHtml(back)}">다른 파일 가져오기</a> <a class="btn soft" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}&feed=all#feed">가져온 기록 확인</a></section></div></div></main><script>try{history.replaceState(null,"",${JSON.stringify(back)});}catch(e){}</script></body></html>`;
}
// @build:exports-start
export {
  decodeImportUploadBytes, handleMyBackupCsv, handleMyBackupPage, handleMyImport,
  myImportDeterministicTransactionId, myImportReasonCounts, prepareMyImportEntry,
  renderMyImportPreviewHtml, renderMyImportResultHtml,
};
// @build:exports-end
