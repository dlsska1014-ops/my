// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { checkAdminPassword, verifyAdminSession } from "../auth/crypto-admin-session.js";
import {
  fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import {
  compareBackupTransactions, safeArray, safeObject, transactionComparable, transactionSignature,
  validateBackupPayloadShape,
} from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { activeSpenderExists } from "../my/transactions.js";
import { isUncertainStorageWrite } from "../kakao/response-builders.js";
import { stableShortHash } from "../kakao/identity-chat-first.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import {
  createManualTransaction, escapeHtml, numberWithCommas,
} from "../domain/transactions-core.js";
import { parseStrictAmount, parseStrictDate } from "../domain/strict-input.js";
// @build:imports-end

function renderImportCandidateRows(rows = []) {
  const arr = safeArray(rows).slice(0, 200);
  if (!arr.length) return `<tr><td colspan="8">가져오기 후보가 없습니다.</td></tr>`;
  return arr.map((row, idx) => {
    const r = safeObject(row);
    const key = stableShortHash(JSON.stringify(transactionComparable(r)));
    return `<tr data-candidate-row="1"><td><input class="candidateCheck" type="checkbox" name="candidate_key" value="${escapeHtml(key)}" data-amount="${escapeHtml(r.amount || 0)}" data-type="${escapeHtml(r.type || "expense")}"/></td><td>${idx + 1}</td><td>${escapeHtml(String(r.transaction_date || ""))}</td><td>${r.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(r.amount || 0)}원</td><td>${escapeHtml(r.category || "")}</td><td>${escapeHtml(r.memo || r.raw_text || "")}</td><td>${escapeHtml(r.payment_method || "")}</td></tr>`;
  }).join("");
}

function renderImportCandidateHiddenJson(rows = []) {
  const safeRows = safeArray(rows).slice(0, 200).map((r) => transactionComparable(r));
  return escapeHtml(JSON.stringify(safeRows));
}

function renderBackupCandidateSelectHtml({ payload = null, validation = null, compare = null, month = "", householdId = "", households = [], error = "" } = {}) {
  const candidates = safeArray(compare?.newCandidates);
  const conflictCount = Number(compare?.counts?.conflicts || 0);
  const duplicateCount = Number(compare?.counts?.same_id || 0) + Number(compare?.counts?.same_content || 0);
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const errorBox = error ? `<section class="card bad"><h2>후보 분석 실패</h2><p>${escapeHtml(error)}</p></section>` : "";
  const validationBox = validation ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>백업 구조: ${validation.ok ? "정상" : "확인 필요"}</h2>${validation.errors?.length ? `<h3>오류</h3><ul>${validation.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${validation.warnings?.length ? `<h3>주의</h3><ul>${validation.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</section>` : "";
  const summary = compare ? `<section class="grid"><div class="metric"><span>신규 후보</span><b>${numberWithCommas(candidates.length)}</b></div><div class="metric"><span>충돌</span><b>${numberWithCommas(conflictCount)}</b></div><div class="metric"><span>중복 가능</span><b>${numberWithCommas(duplicateCount)}</b></div><div class="metric"><span>현재만 있음</span><b>${numberWithCommas(compare.counts.current_only || 0)}</b></div></section>` : "";
  const riskBox = compare ? `<section class="card ${conflictCount ? "bad" : duplicateCount ? "warn" : "good"}"><h2>${conflictCount ? "충돌 항목 확인 필요" : duplicateCount ? "중복 가능성 있음" : "신규 후보 선택 가능"}</h2><p>${conflictCount ? "같은 ID인데 내용이 다른 항목이 있어 자동 가져오기를 진행하면 안 됩니다." : "아래 신규 후보 중 실제로 가져올 항목을 체크해 가져오기 계획만 만들 수 있습니다. 아직 DB에는 저장하지 않습니다."}</p></section>` : "";
  const candidateBox = compare ? `<section class="card"><div class="cardTitle"><div><h2>가져오기 후보 선택</h2><p class="note">현재 데이터에 없어 보이는 거래만 표시합니다. 체크박스는 가져오기 계획 생성용이며, DB 저장은 하지 않습니다.</p></div><div class="actions"><button type="button" class="btn light" onclick="setCandidateChecks(true)">전체 선택</button><button type="button" class="btn light" onclick="setCandidateChecks(false)">선택 해제</button><button type="button" class="btn green" onclick="downloadImportPlan()">선택 계획 JSON 저장</button></div></div><div class="selectedBar"><b id="candidateSelectedCount">0건 선택</b><span id="candidateSelectedAmount">0원</span></div><input type="hidden" id="candidateJson" value="${renderImportCandidateHiddenJson(candidates)}"/><div class="tableWrap"><table><thead><tr><th>선택</th><th>#</th><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th></tr></thead><tbody>${renderImportCandidateRows(candidates)}</tbody></table></div>${candidates.length > 200 ? `<p class="note">후보가 많아 상위 200건만 표시합니다.</p>` : ""}</section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>가져오기 후보 선택</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#0f172a,#14532d);color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.warn{border-color:#fde68a;background:#fffbeb}.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:25px;margin-top:6px}.upload{display:grid;grid-template-columns:1fr 160px 170px;gap:10px}.upload input,.upload select,.upload button{min-height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.upload input[type=file]{padding:10px}.upload button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.btn.green{background:#059669;color:#fff}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.cardTitle{display:flex;justify-content:space-between;gap:12px;align-items:flex-start;flex-wrap:wrap}.actions{display:flex;gap:8px;flex-wrap:wrap}.selectedBar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0;padding:12px;border-radius:16px;background:#eff6ff;color:#1e3a8a;font-weight:1000}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:860px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.candidateCheck{width:20px;height:20px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.upload{grid-template-columns:1fr}.card{overflow-x:auto}}</style></head><body>${renderUnifiedNav("backup", { month, householdId })}<main class="wrap"><section class="hero"><h1>가져오기 후보 선택</h1><p>백업 파일에서 현재 데이터에 없는 거래 후보만 골라 가져오기 계획을 만듭니다. 이 단계도 DB에 아무것도 저장하지 않습니다.</p><p><a class="btn light" href="/backup">백업센터</a> <a class="btn light" href="/backup/compare">백업 비교</a></p></section><section class="card"><h2>백업 파일 분석</h2><p class="warnBox">복구 자동 적용 전 단계입니다. 선택 결과는 JSON 계획 파일로만 저장되며, Supabase 데이터는 변경하지 않습니다.</p><form class="upload" method="post" action="/backup/select" enctype="multipart/form-data"><input type="file" name="backup_file" accept="application/json,.json" required/><select name="household_id"><option value="">백업 기준 사용/전체</option>${householdOptions}</select><button type="submit">후보 분석</button></form></section>${errorBox}${validationBox}${summary}${riskBox}${candidateBox}</main><script>(function(){function money(n){n=Number(n||0);return n.toLocaleString('ko-KR')+'원'}window.setCandidateChecks=function(v){document.querySelectorAll('.candidateCheck').forEach(function(x){x.checked=!!v});updateCandidateSelection()};function updateCandidateSelection(){var count=0, amount=0;document.querySelectorAll('.candidateCheck').forEach(function(x){if(x.checked){count++;if((x.getAttribute('data-type')||'expense')==='income')amount-=Number(x.getAttribute('data-amount')||0);else amount+=Number(x.getAttribute('data-amount')||0)}});var c=document.getElementById('candidateSelectedCount');var a=document.getElementById('candidateSelectedAmount');if(c)c.textContent=count+'건 선택';if(a)a.textContent='순지출 기준 '+money(amount)}document.querySelectorAll('.candidateCheck').forEach(function(x){x.addEventListener('change',updateCandidateSelection)});window.downloadImportPlan=function(){var raw=document.getElementById('candidateJson');var rows=[];try{rows=JSON.parse(raw?raw.value:'[]')}catch(e){rows=[]}var selected=[];document.querySelectorAll('.candidateCheck').forEach(function(x,idx){if(x.checked&&rows[idx])selected.push(rows[idx])});var payload={app:'kakao-accountbook',version:'V19.8-BUDGET-ALERT',created_at:new Date().toISOString(),mode:'candidate_plan_only_no_db_write',selected_count:selected.length,selected:selected};var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='accountbook_import_candidate_plan.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)};updateCandidateSelection();})();</script></body></html>`;
}

async function handleBackupCandidateSelectPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  return htmlResponse(renderBackupCandidateSelectHtml({ households, householdId, month: currentMonthKst() }));
}

async function handleBackupCandidateSelectPost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (_) {}
  try {
    const form = await request.formData();
    const file = form.get("backup_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderBackupCandidateSelectHtml({ households, error: "업로드된 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 8 * 1024 * 1024) {
      return htmlResponse(renderBackupCandidateSelectHtml({ households, error: "파일이 너무 큽니다. 8MB 이하 JSON만 먼저 분석하세요." }), 400);
    }
    const payload = JSON.parse(raw);
    const validation = validateBackupPayloadShape(payload);
    const scope = safeObject(payload.scope);
    const month = validMonth(scope.month) || currentMonthKst();
    const formHouseholdId = String(form.get("household_id") || "").trim();
    const householdId = formHouseholdId || String(scope.household_id || "").trim();
    if (!validation.ok) {
      return htmlResponse(renderBackupCandidateSelectHtml({ payload, validation, households, month, householdId }), 400);
    }
    const currentRows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const compare = compareBackupTransactions(safeArray(payload.transactions), currentRows);
    return htmlResponse(renderBackupCandidateSelectHtml({ payload, validation, compare, households, month, householdId }));
  } catch (err) {
    rememberOpsEvent({ kind: "backup_candidate_failed", severity: "warn", path: "/backup/import-candidates", method: "POST", detail: safeError(err) });
    return htmlResponse(renderBackupCandidateSelectHtml({ households, error: "가져오기 후보를 분석하지 못했습니다. 파일 구조와 선택한 가계부를 확인해 주세요." }), 400);
  }
}

// V22.9.37 감사 SIM-7: 계획 파일의 행을 공용 엄격 검증기로 읽는다. transactionComparable 의 Number(r.amount) 는
// "0x10" 을 16원, -5000 을 0원 지출로, 모르는 구분을 지출로 바꿔 저장했다. 형식이 틀린 행은 사유와 함께 뺀다.
function strictCandidatePlanRow(raw) {
  const r = safeObject(raw);
  const problems = [];
  const amount = parseStrictAmount(r.amount, { min: 1 });
  if (amount === null) problems.push(`금액 ‘${String(r.amount ?? "").slice(0, 20)}’은 1원 이상의 정수가 아님`);
  const date = parseStrictDate(typeof r.transaction_date === "string" ? r.transaction_date.slice(0, 10) : "");
  if (!date) problems.push(`날짜 ‘${String(r.transaction_date ?? "").slice(0, 20)}’은 달력에 없음`);
  const type = r.type === "income" || r.type === "expense" ? r.type : "";
  if (!type) problems.push(`구분 ‘${String(r.type ?? "").slice(0, 20)}’은 income·expense 가 아님`);
  const userId = r.user_id === undefined || r.user_id === null ? "" : typeof r.user_id === "string" ? r.user_id.trim() : null;
  if (userId === null) problems.push("지출자(user_id)가 문자열이 아님");
  for (const key of ["category", "memo", "payment_method", "raw_text"]) {
    if (r[key] !== undefined && r[key] !== null && typeof r[key] !== "string") problems.push(`${key} 가 문자열이 아님`);
  }
  if (problems.length) return { row: null, problems, display: { ...transactionComparable(r), amount: 0 } };
  return { row: { ...transactionComparable({ ...r, amount, transaction_date: date, type }), user_id: userId }, problems: [] };
}

function validateImportCandidatePlan(plan) {
  const errors = [];
  const warnings = [];
  const p = safeObject(plan);
  if (!p || !Object.keys(p).length) errors.push("JSON 객체가 아닙니다.");
  if (p.app && p.app !== "kakao-accountbook") warnings.push("app 값이 kakao-accountbook이 아닙니다.");
  if (p.mode && p.mode !== "candidate_plan_only_no_db_write") warnings.push("v10.4 후보 선택 계획 파일이 아닐 수 있습니다.");
  if (!Array.isArray(p.selected) && !Array.isArray(p.rows)) errors.push("selected 배열이 없습니다.");
  const candidates = (Array.isArray(p.selected) ? p.selected : Array.isArray(p.rows) ? p.rows : []).filter((item) => { const r = safeObject(item); return r.transaction_date || r.memo || r.amount; });
  const checked = candidates.map(strictCandidatePlanRow);
  const rows = checked.filter((item) => item.row).map((item) => item.row);
  const invalid = checked.filter((item) => !item.row).map((item) => ({ row: item.display, error: `형식 오류로 제외: ${item.problems.join(", ")}` }));
  if (!rows.length) errors.push(invalid.length ? `가져올 수 있는 후보가 0건입니다(형식 오류 ${invalid.length}건).` : "가져오기 후보가 0건입니다.");
  if (invalid.length) warnings.push(`형식이 잘못된 후보 ${invalid.length}건은 제외합니다 — ${invalid.slice(0, 5).map((item) => item.error.replace(/^형식 오류로 제외: /, "")).join(" / ")}${invalid.length > 5 ? " 외" : ""}`);
  const expected = Number(p.selected_count || candidates.length);
  if (Number.isFinite(expected) && expected !== candidates.length) warnings.push(`selected_count(${expected})와 실제 후보 수(${candidates.length})가 다릅니다.`);
  const income = rows.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const expense = rows.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  return { ok: errors.length === 0, errors, warnings, rows, invalid, counts: { selected: rows.length, income, expense, balance: income - expense } };
}

function finalCheckAgainstCurrent(candidateRows, currentRows) {
  const current = safeArray(currentRows);
  const currentBySignature = new Map();
  for (const row of current) {
    const sig = transactionSignature(row);
    if (!currentBySignature.has(sig)) currentBySignature.set(sig, []);
    currentBySignature.get(sig).push(row);
  }
  const stillNew = [];
  const nowDuplicate = [];
  for (const row of safeArray(candidateRows)) {
    const sig = transactionSignature(row);
    if (currentBySignature.has(sig)) nowDuplicate.push({ backup: row, current: currentBySignature.get(sig)[0] });
    else stillNew.push(row);
  }
  const risk = nowDuplicate.length ? "warn" : "good";
  return { risk, stillNew, nowDuplicate, counts: { plan: candidateRows.length, current: current.length, still_new: stillNew.length, now_duplicate: nowDuplicate.length } };
}

function renderFinalCheckRows(rows = []) {
  const arr = safeArray(rows).slice(0, 80);
  if (!arr.length) return `<tr><td colspan="6">표시할 항목이 없습니다.</td></tr>`;
  return arr.map((row) => {
    const r = safeObject(row.backup || row);
    return `<tr><td>${escapeHtml(String(r.transaction_date || ""))}</td><td>${r.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(r.amount || 0)}원</td><td>${escapeHtml(r.category || "")}</td><td>${escapeHtml(r.memo || r.raw_text || "")}</td><td>${escapeHtml(r.payment_method || "")}</td></tr>`;
  }).join("");
}

function renderImportFinalCheckHtml({ households = [], householdId = "", month = "", validation = null, finalCheck = null, passwordOk = false, error = "" } = {}) {
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const errorBox = error ? `<section class="card bad"><h2>최종 확인 실패</h2><p>${escapeHtml(error)}</p></section>` : "";
  const validationBox = validation ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>계획 파일 검증: ${validation.ok ? "정상" : "확인 필요"}</h2><div class="grid mini"><div class="metric"><span>선택 후보</span><b>${numberWithCommas(validation.counts.selected)}</b></div><div class="metric"><span>수입 합계</span><b>${numberWithCommas(validation.counts.income)}원</b></div><div class="metric"><span>지출 합계</span><b>${numberWithCommas(validation.counts.expense)}원</b></div><div class="metric"><span>잔액 영향</span><b>${numberWithCommas(validation.counts.balance)}원</b></div></div>${validation.errors?.length ? `<h3>오류</h3><ul>${validation.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${validation.warnings?.length ? `<h3>주의</h3><ul>${validation.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</section>` : "";
  const finalHtml = finalCheck ? `<section class="card ${finalCheck.risk === "good" ? "good" : "warn"}"><h2>${finalCheck.risk === "good" ? "최종 확인 통과" : "중복 재확인 필요"}</h2><p>${finalCheck.risk === "good" ? "계획 파일의 모든 후보가 현재 DB에 아직 없어 보입니다. 그래도 이 화면은 DB에 저장하지 않습니다." : "계획 생성 이후 현재 DB에 이미 들어간 항목이 있어 보입니다. 실제 가져오기 전 후보 계획을 다시 만드는 것이 안전합니다."}</p><div class="grid mini"><div class="metric"><span>계획 후보</span><b>${numberWithCommas(finalCheck.counts.plan)}</b></div><div class="metric"><span>현재 거래</span><b>${numberWithCommas(finalCheck.counts.current)}</b></div><div class="metric"><span>아직 신규</span><b>${numberWithCommas(finalCheck.counts.still_new)}</b></div><div class="metric"><span>현재 중복</span><b>${numberWithCommas(finalCheck.counts.now_duplicate)}</b></div></div></section><section class="card"><h2>아직 신규 후보</h2><p class="note">다음 실제 가져오기 단계에서 대상이 될 수 있는 항목입니다. 이 화면에서는 저장하지 않습니다.</p><div class="tableWrap"><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th></tr></thead><tbody>${renderFinalCheckRows(finalCheck.stillNew)}</tbody></table></div></section><section class="card"><h2>현재 중복 후보</h2><p class="note">계획 생성 이후 이미 현재 데이터에 있는 것으로 보이는 항목입니다.</p><div class="tableWrap"><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th></tr></thead><tbody>${renderFinalCheckRows(finalCheck.nowDuplicate)}</tbody></table></div></section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>가져오기 최종 확인</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7f1d1d));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.warn{border-color:#fde68a;background:#fffbeb}.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.upload{display:grid;grid-template-columns:1fr 160px 170px 170px;gap:10px}.upload input,.upload select,.upload button{min-height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.upload input[type=file]{padding:10px}.upload button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:760px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}@media(max-width:840px){.wrap{padding:12px}.hero h1{font-size:24px}.upload{grid-template-columns:1fr}.card{overflow-x:auto}}</style></head><body>${renderUnifiedNav("backup", { month, householdId })}<main class="wrap"><section class="hero"><h1>가져오기 최종 확인</h1><p>v10.4에서 저장한 후보 계획 JSON을 실제 가져오기 전 다시 검증하고, 관리자 비밀번호를 재확인합니다. 이 단계도 DB에 아무것도 저장하지 않습니다.</p><p><a class="btn light" href="/backup/select">후보 선택</a> <a class="btn light" href="/backup/compare">백업 비교</a></p></section><section class="card"><h2>후보 계획 파일 최종 확인</h2><p class="warnBox">선택 계획 JSON과 관리자 비밀번호를 함께 확인합니다. 비밀번호가 맞아도 아직 Supabase에는 저장하지 않습니다.</p><form class="upload" method="post" action="/backup/final-check" enctype="multipart/form-data"><input type="file" name="plan_file" accept="application/json,.json" required/><select name="household_id"><option value="">가계부 선택</option>${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month || currentMonthKst())}"/><input type="password" name="admin_password" placeholder="관리자 비밀번호" autocomplete="current-password" required/><button type="submit">최종 확인</button></form></section>${errorBox}${validationBox}${finalHtml}</main></body></html>`;
}

async function handleImportFinalCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  return htmlResponse(renderImportFinalCheckHtml({ households, householdId, month }));
}

async function handleImportFinalCheckPost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (_) {}
  try {
    const form = await request.formData();
    const password = String(form.get("admin_password") || "").trim();
    const month = validMonth(form.get("month")) || currentMonthKst();
    const householdId = String(form.get("household_id") || "").trim();
    if (!(await checkAdminPassword(env, password))) {
      return htmlResponse(renderImportFinalCheckHtml({ households, month, householdId, error: "관리자 비밀번호 재확인에 실패했습니다." }), 401);
    }
    const file = form.get("plan_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderImportFinalCheckHtml({ households, month, householdId, error: "업로드된 후보 계획 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 4 * 1024 * 1024) {
      return htmlResponse(renderImportFinalCheckHtml({ households, month, householdId, error: "파일이 너무 큽니다. 4MB 이하 후보 계획 파일만 확인하세요." }), 400);
    }
    const plan = JSON.parse(raw);
    const validation = validateImportCandidatePlan(plan);
    if (!validation.ok) {
      return htmlResponse(renderImportFinalCheckHtml({ households, month, householdId, validation, error: "후보 계획 파일 구조를 먼저 확인해야 합니다." }), 400);
    }
    const currentRows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const finalCheck = finalCheckAgainstCurrent(validation.rows, currentRows);
    return htmlResponse(renderImportFinalCheckHtml({ households, month, householdId, validation, finalCheck, passwordOk: true }));
  } catch (err) {
    rememberOpsEvent({ kind: "backup_final_check_failed", severity: "warn", path: "/backup/import-final-check", method: "POST", detail: safeError(err) });
    return htmlResponse(renderImportFinalCheckHtml({ households, error: "최종 확인을 완료하지 못했습니다. 후보 파일을 다시 생성해 주세요." }), 400);
  }
}

const IMPORT_APPLY_LIMIT = 20;
const IMPORT_CONFIRM_TEXT = "가져오기 적용";

function renderImportApplyRows(rows = [], status = "") {
  const arr = safeArray(rows).slice(0, 80);
  if (!arr.length) return `<tr><td colspan="7">표시할 항목이 없습니다.</td></tr>`;
  return arr.map((item) => {
    const row = safeObject(item.row || item.backup || item);
    const message = item.error ? `실패: ${item.error}` : item.id ? `저장됨: ${item.id}` : status;
    return `<tr><td>${escapeHtml(String(row.transaction_date || ""))}</td><td>${row.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(row.amount || 0)}원</td><td>${escapeHtml(row.category || "")}</td><td>${escapeHtml(row.memo || row.raw_text || "")}</td><td>${escapeHtml(row.payment_method || "")}</td><td>${escapeHtml(message || "")}</td></tr>`;
  }).join("");
}

function renderImportApplyHtml({ households = [], householdId = "", month = "", validation = null, finalCheck = null, result = null, error = "" } = {}) {
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const errorBox = error ? `<section class="card bad"><h2>가져오기 적용 실패</h2><p>${escapeHtml(error)}</p></section>` : "";
  const validationBox = validation ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>계획 파일 검증: ${validation.ok ? "정상" : "확인 필요"}</h2><div class="grid mini"><div class="metric"><span>계획 후보</span><b>${numberWithCommas(validation.counts.selected)}</b></div><div class="metric"><span>수입</span><b>${numberWithCommas(validation.counts.income)}원</b></div><div class="metric"><span>지출</span><b>${numberWithCommas(validation.counts.expense)}원</b></div><div class="metric"><span>잔액 영향</span><b>${numberWithCommas(validation.counts.balance)}원</b></div></div>${validation.errors?.length ? `<h3>오류</h3><ul>${validation.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${validation.warnings?.length ? `<h3>주의</h3><ul>${validation.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</section>` : "";
  const finalBox = finalCheck ? `<section class="card ${finalCheck.counts.now_duplicate ? "warn" : "good"}"><h2>적용 직전 중복 재검사</h2><div class="grid mini"><div class="metric"><span>계획 후보</span><b>${numberWithCommas(finalCheck.counts.plan)}</b></div><div class="metric"><span>아직 신규</span><b>${numberWithCommas(finalCheck.counts.still_new)}</b></div><div class="metric"><span>현재 중복</span><b>${numberWithCommas(finalCheck.counts.now_duplicate)}</b></div><div class="metric"><span>1회 적용 제한</span><b>${numberWithCommas(IMPORT_APPLY_LIMIT)}건</b></div></div><p class="note">${finalCheck.counts.now_duplicate ? "현재 DB에 이미 들어간 항목은 자동으로 제외합니다." : "중복 항목 없이 신규 후보만 적용 대상입니다."}</p></section>` : "";
  const resultBox = result ? `<section class="card ${result.failed || result.unknown ? "warn" : "good"}"><h2>적용 결과</h2><div class="grid mini"><div class="metric"><span>요청 후보</span><b>${numberWithCommas(result.requested)}</b></div><div class="metric"><span>적용 대상</span><b>${numberWithCommas(result.to_apply)}</b></div><div class="metric"><span>성공</span><b>${numberWithCommas(result.applied)}</b></div><div class="metric"><span>실패</span><b>${numberWithCommas(result.failed)}</b></div><div class="metric"><span>확인 필요</span><b>${numberWithCommas(result.unknown || 0)}</b></div><div class="metric"><span>중복 제외</span><b>${numberWithCommas(result.skipped_duplicate)}</b></div><div class="metric"><span>제한 초과 제외</span><b>${numberWithCommas(result.skipped_limit)}</b></div><div class="metric"><span>형식·범위 제외</span><b>${numberWithCommas(result.skipped_excluded || 0)}</b></div></div><p class="note">적용 성공 건은 Supabase transactions 테이블에 저장되었습니다. 실패/제외 항목은 아래 표에서 확인하세요.</p>${result.unknown ? `<p class="dangerBox">저장 여부를 확인하지 못한 행이 ${numberWithCommas(result.unknown)}건 있습니다. 거래 목록에서 확인한 뒤에만 같은 계획을 다시 제출하세요.</p>` : ""}</section><section class="card"><h2>성공 항목</h2><div class="tableWrap"><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th><th>상태</th></tr></thead><tbody>${renderImportApplyRows(result.success, "저장됨")}</tbody></table></div></section><section class="card"><h2>실패/제외 항목</h2><div class="tableWrap"><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th><th>상태</th></tr></thead><tbody>${renderImportApplyRows([...result.failed_rows, ...safeArray(result.unknown_rows), ...result.duplicate_rows, ...result.limit_rows, ...safeArray(result.excluded_rows)])}</tbody></table></div></section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>가져오기 실제 적용</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#4c0519));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.warn{border-color:#fde68a;background:#fffbeb}.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.upload{display:grid;grid-template-columns:1fr 155px 155px 165px 170px;gap:10px}.upload input,.upload select,.upload button{min-height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.upload input[type=file]{padding:10px}.upload button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.btn.danger{background:#dc2626}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.dangerBox{background:#fef2f2;border:1px solid #fecaca;border-radius:16px;padding:12px;color:#991b1b;line-height:1.55;font-weight:800}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:820px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}@media(max-width:980px){.wrap{padding:12px}.hero h1{font-size:24px}.upload{grid-template-columns:1fr}.card{overflow-x:auto}}</style></head><body>${renderUnifiedNav("backup", { month, householdId })}<main class="wrap"><section class="hero"><h1>가져오기 실제 적용</h1><p>후보 계획 JSON을 최종 재검사한 뒤 신규 후보만 Supabase에 저장합니다. 안전을 위해 1회 최대 ${IMPORT_APPLY_LIMIT}건만 적용합니다.</p><p><a class="btn light" href="/backup/final-check">최종 확인</a> <a class="btn light" href="/backup/select">후보 선택</a></p></section><section class="card"><h2>실제 적용 전 확인</h2><p class="dangerBox">이 화면은 실제 DB에 거래를 추가합니다. 적용 전 반드시 백업을 내려받고, 확인 문구에 <b>${IMPORT_CONFIRM_TEXT}</b>을 정확히 입력하세요.</p><form class="upload" method="post" action="/backup/apply" enctype="multipart/form-data"><input type="file" name="plan_file" accept="application/json,.json" required/><select name="household_id" required><option value="">가계부 선택</option>${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month || currentMonthKst())}" required/><input type="password" name="admin_password" placeholder="관리자 비밀번호" autocomplete="current-password" required/><input name="confirm_text" placeholder="${escapeHtml(IMPORT_CONFIRM_TEXT)}" required/><button class="btn danger" type="submit">최대 ${IMPORT_APPLY_LIMIT}건 적용</button></form></section>${errorBox}${validationBox}${finalBox}${resultBox}</main></body></html>`;
}

async function handleImportApplyPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  return htmlResponse(renderImportApplyHtml({ households, householdId, month }));
}

async function handleImportApplyPost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (_) {}
  let month = currentMonthKst();
  let householdId = "";
  try {
    const form = await request.formData();
    const password = String(form.get("admin_password") || "").trim();
    month = validMonth(form.get("month")) || currentMonthKst();
    householdId = String(form.get("household_id") || "").trim();
    const confirmText = String(form.get("confirm_text") || "").trim();
    if (!householdId) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: "가져올 가계부를 선택해야 합니다." }), 400);
    }
    if (confirmText !== IMPORT_CONFIRM_TEXT) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: `확인 문구를 정확히 입력해야 합니다: ${IMPORT_CONFIRM_TEXT}` }), 400);
    }
    if (!(await checkAdminPassword(env, password))) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: "관리자 비밀번호 재확인에 실패했습니다." }), 401);
    }
    const file = form.get("plan_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: "업로드된 후보 계획 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 4 * 1024 * 1024) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: "파일이 너무 큽니다. 4MB 이하 후보 계획 파일만 적용하세요." }), 400);
    }
    const plan = JSON.parse(raw);
    const validation = validateImportCandidatePlan(plan);
    if (!validation.ok) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, validation, error: "후보 계획 파일 구조를 먼저 확인해야 합니다." }), 400);
    }
    // V22.9.37 감사 SIM-7: 가계부는 읽어 온 목록에 있는 것만 받는다(목록을 못 읽었으면 적용하지 않는다).
    if (!households.some((h) => String(h.id) === householdId)) {
      return htmlResponse(renderImportApplyHtml({ households, month, householdId, validation, error: "선택한 가계부를 찾지 못했습니다. 가계부 목록을 다시 불러온 뒤 선택해 주세요. 아무 행도 저장하지 않았습니다." }), 400);
    }
    // V22.9.37 감사 SIM-6: 가계부 설정 잠금 안에서 현재 기록·참여자를 엄격하게 읽고(읽기 실패면 적용하지 않음) 중복
    // 확인과 저장을 한다. 같은 계획을 동시에 두 번 보내면 두 번째는 잠금 뒤에 이미 저장된 행을 중복으로 뺀다.
    const outcome = await withHouseholdSettingsRmw(env, householdId, () => applyCandidatePlanRows(env, { householdId, month, validation }));
    return htmlResponse(renderImportApplyHtml({ households, month, householdId, validation, finalCheck: outcome.finalCheck, result: outcome.result }));
  } catch (err) {
    const detail = safeError(err);
    rememberOpsEvent({ kind: "backup_import_apply_failed", severity: "error", path: "/backup/import-apply", method: "POST", detail });
    const busy = /settings_rmw_busy/.test(detail);
    const message = busy ? "이 가계부의 다른 복구·설정 변경이 진행 중입니다. 아무 행도 저장하지 않았으니 잠시 후 다시 시도해 주세요."
      : /settings_rmw_household_missing/.test(detail) ? "선택한 가계부가 없습니다. 아무 행도 저장하지 않았습니다."
        : "가져오기를 완료하지 못했습니다. 적용 결과를 확인한 뒤 같은 파일을 반복 제출하지 마세요.";
    return htmlResponse(renderImportApplyHtml({ households, month, householdId, error: message }), busy ? 409 : 400);
  }
}

// 잠금 안에서 실행되는 실제 적용. 중복 비교는 선택한 달의 현재 기록과만 하므로 다른 달 날짜는 제외하고 알린다.
async function applyCandidatePlanRows(env, { householdId = "", month = "", validation = {} }) {
  const currentRows = await fetchAdminRows(env, { month, householdId, type: "all" });
  const members = await fetchHouseholdMembers(env, householdId);
  const excludedRows = safeArray(validation.invalid).slice();
  const inScope = [];
  for (const row of safeArray(validation.rows)) {
    if (String(row.transaction_date || "").slice(0, 7) !== month) { excludedRows.push({ row, error: `선택한 달(${month}) 밖의 날짜라 중복을 확인할 수 없어 제외` }); continue; }
    // V22.9.37 감사 SIM-7: 지출자는 비어 있으면 저장할 수 없고(NOT NULL), 있으면 이 가계부의 활성 참여자여야 한다.
    if (!row.user_id) { excludedRows.push({ row, error: "지출자(user_id)가 없어 저장할 수 없음 — 백업 원본의 user_id 를 확인하세요" }); continue; }
    if (!activeSpenderExists(members, row.user_id)) { excludedRows.push({ row, error: "지출자가 이 가계부의 활성 참여자가 아니어서 제외" }); continue; }
    inScope.push(row);
  }
  const finalCheck = finalCheckAgainstCurrent(inScope, currentRows);
  const applyRows = finalCheck.stillNew.slice(0, IMPORT_APPLY_LIMIT);
  const limitRows = finalCheck.stillNew.slice(IMPORT_APPLY_LIMIT).map((row) => ({ row, error: `1회 ${IMPORT_APPLY_LIMIT}건 제한으로 제외` }));
  const duplicateRows = finalCheck.nowDuplicate.map((x) => ({ row: x.backup || x, error: "현재 DB 중복으로 제외" }));
  const success = [];
  const failedRows = [];
  const unknownRows = [];
  const insertedSigs = new Set(currentRows.map((r) => transactionSignature(r)));
  for (let index = 0; index < applyRows.length; index++) {
    const row = applyRows[index];
    const sig = transactionSignature(row);
    if (insertedSigs.has(sig)) {
      duplicateRows.push({ row, error: "적용 중 중복 재감지로 제외" });
      continue;
    }
    try {
      const created = await createManualTransaction(env, {
        household_id: householdId,
        user_id: row.user_id || "",
        type: row.type === "income" ? "income" : "expense",
        transaction_date: row.transaction_date,
        amount: row.amount,
        category: row.category || "",
        memo: row.memo || "",
        payment_method: row.payment_method || "",
        raw_text: row.memo || "",
        source: "backup_import_v19_3",
      });
      insertedSigs.add(sig);
      success.push({ row, id: created?.id || "" });
    } catch (err) {
      rememberOpsEvent({ kind: "backup_import_row_failed", severity: "warn", path: "/backup/import-apply", method: "POST", detail: safeError(err) });
      // V22.9.37 감사 SIM-6(B15 와 같은 결함): 응답을 잃은 저장(5xx·시간 초과)은 "저장하지 못함"이 아니다. 다시 읽어
      // 확인하고, 확인되지 않으면 확인 필요로 알린 뒤 남은 행은 적용하지 않는다(반복 제출의 중복을 막는 쪽으로 멈춘다).
      if (isUncertainStorageWrite(err)) {
        let found = null;
        try { found = (await fetchAdminRows(env, { month, householdId, type: "all" })).find((current) => transactionSignature(current) === sig) || null; } catch (_) { found = null; }
        if (found) { insertedSigs.add(sig); success.push({ row, id: found.id || "" }); continue; }
        unknownRows.push({ row, error: "저장 여부 확인 필요 — 거래 목록에서 이 행을 확인한 뒤에만 다시 제출하세요" });
        for (const rest of applyRows.slice(index + 1)) unknownRows.push({ row: rest, error: "앞선 저장 결과가 불명확해 적용하지 않음(기존 데이터 유지)" });
        break;
      }
      failedRows.push({ row, error: "저장하지 못함(기존 데이터 유지)" });
    }
  }
  const result = {
    requested: safeArray(validation.rows).length + safeArray(validation.invalid).length,
    to_apply: applyRows.length,
    applied: success.length,
    failed: failedRows.length,
    unknown: unknownRows.length,
    skipped_duplicate: duplicateRows.length,
    skipped_limit: limitRows.length,
    skipped_excluded: excludedRows.length,
    success,
    failed_rows: failedRows,
    unknown_rows: unknownRows,
    duplicate_rows: duplicateRows,
    limit_rows: limitRows,
    excluded_rows: excludedRows,
  };
  return { finalCheck, result };
}
// @build:exports-start
export {
  handleBackupCandidateSelectPage, handleBackupCandidateSelectPost, handleImportApplyPage,
  handleImportApplyPost, handleImportFinalCheckPage, handleImportFinalCheckPost,
};
// @build:exports-end
