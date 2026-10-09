// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { checkAdminPassword, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { fetchAdminHouseholds, fetchAdminRows } from "../data/households-members-rows.js";
import { safeArray, safeObject } from "./backup-compare.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { csvSafeText } from "../import/csv-duplicates.js";
import { supabase } from "../data/supabase-client.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function isBackupImportSource(value) {
  return String(value || "").includes("backup_import_");
}

function importHistoryBatchKey(row) {
  const r = safeObject(row);
  const created = String(r.created_at || "");
  const day = created.slice(0, 10) || String(r.transaction_date || "").slice(0, 10) || "날짜없음";
  const hour = created.slice(11, 13) || "00";
  return `${day} ${hour}시`;
}

async function fetchImportHistoryRows(env, { month, householdId }) {
  const rows = await fetchAdminRows(env, { month, householdId, type: "all" });
  return rows.filter((r) => isBackupImportSource(r.source));
}

function summarizeImportHistory(rows = []) {
  const imported = safeArray(rows);
  const total = imported.length;
  const income = imported.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const expense = imported.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const byBatch = {};
  for (const r of imported) {
    const key = importHistoryBatchKey(r);
    if (!byBatch[key]) byBatch[key] = { key, count: 0, income: 0, expense: 0, first_created: r.created_at || "", last_created: r.created_at || "" };
    byBatch[key].count += 1;
    if (r.type === "income") byBatch[key].income += Number(r.amount || 0);
    else byBatch[key].expense += Number(r.amount || 0);
    if (r.created_at && (!byBatch[key].first_created || r.created_at < byBatch[key].first_created)) byBatch[key].first_created = r.created_at;
    if (r.created_at && (!byBatch[key].last_created || r.created_at > byBatch[key].last_created)) byBatch[key].last_created = r.created_at;
  }
  const batches = Object.values(byBatch).sort((a, b) => String(b.last_created || b.key).localeCompare(String(a.last_created || a.key)));
  return { total, income, expense, balance: income - expense, batches };
}

function renderImportHistoryRows(rows = []) {
  const arr = safeArray(rows).slice(0, 300);
  if (!arr.length) return `<tr><td colspan="9">가져오기 이력이 없습니다.</td></tr>`;
  return arr.map((r) => `<tr><td>${escapeHtml(String(r.created_at || "").replace("T", " ").slice(0, 19))}</td><td>${escapeHtml(String(r.transaction_date || ""))}</td><td>${r.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(r.amount || 0)}원</td><td>${escapeHtml(r.category || "")}</td><td>${escapeHtml(r.memo || r.raw_text || "")}</td><td>${escapeHtml(r.payment_method || "")}</td><td>${escapeHtml(r.source || "")}</td><td>${escapeHtml(r.id || "")}</td></tr>`).join("");
}

function renderImportHistoryBatchRows(batches = []) {
  const arr = safeArray(batches);
  if (!arr.length) return `<tr><td colspan="6">가져오기 배치가 없습니다.</td></tr>`;
  return arr.map((b) => `<tr><td><b>${escapeHtml(b.key)}</b></td><td>${numberWithCommas(b.count)}건</td><td>${numberWithCommas(b.income)}원</td><td>${numberWithCommas(b.expense)}원</td><td>${escapeHtml(String(b.first_created || "").replace("T", " ").slice(0, 19))}</td><td>${escapeHtml(String(b.last_created || "").replace("T", " ").slice(0, 19))}</td></tr>`).join("");
}

async function handleImportHistoryPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const selectedHousehold = households.find((h) => h.id === householdId) || households[0] || null;
  const hid = selectedHousehold?.id || "";
  const rows = await fetchImportHistoryRows(env, { month, householdId: hid });
  const summary = summarizeImportHistory(rows);
  const qs = new URLSearchParams();
  qs.set("month", month);
  if (hid) qs.set("household_id", hid);
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === hid ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>가져오기 이력</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1180px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1e3a8a));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.filters select,.filters input,.filters button{height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:980px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("backup", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>가져오기 이력/감사 로그</h1><p>백업 가져오기로 실제 저장된 거래를 확인합니다. 현재는 source 값이 backup_import_* 인 거래를 기준으로 집계합니다.</p><form class="filters" method="get" action="/backup/import-history"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>가져오기 건수</span><b>${numberWithCommas(summary.total)}건</b></div><div class="metric"><span>수입 합계</span><b>${numberWithCommas(summary.income)}원</b></div><div class="metric"><span>지출 합계</span><b>${numberWithCommas(summary.expense)}원</b></div><div class="metric"><span>잔액 영향</span><b>${numberWithCommas(summary.balance)}원</b></div></section><section class="card"><h2>내보내기</h2><p class="warnBox">가져오기 이력은 실제 저장된 거래 기준입니다. 필요하면 CSV로 내려받아 보관하세요.</p><p><a class="btn light" href="/backup/import-history.csv?${escapeHtml(qs.toString())}">이력 CSV 다운로드</a> <a class="btn" href="/backup/apply?${escapeHtml(qs.toString())}">가져오기 실제 적용</a></p></section><section class="card"><h2>시간대별 요약</h2><div class="tableWrap"><table><thead><tr><th>배치 추정</th><th>건수</th><th>수입</th><th>지출</th><th>시작</th><th>마지막</th></tr></thead><tbody>${renderImportHistoryBatchRows(summary.batches)}</tbody></table></div></section><section class="card"><h2>상세 이력</h2><p class="note">최근 300건까지만 화면에 표시합니다. 전체는 CSV로 확인하세요.</p><div class="tableWrap"><table><thead><tr><th>저장시각</th><th>거래일</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th><th>source</th><th>ID</th></tr></thead><tbody>${renderImportHistoryRows(rows)}</tbody></table></div></section></main></body></html>`);
}

function csvCell(value) {
  return `"${csvSafeText(value).replace(/"/g, '""')}"`;
}

async function handleImportHistoryCsv(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const householdId = String(url.searchParams.get("household_id") || "").trim();
  const rows = await fetchImportHistoryRows(env, { month, householdId });
  const header = ["created_at", "transaction_date", "type", "amount", "category", "memo", "payment_method", "source", "id"];
  const lines = [header.join(",")];
  for (const r of rows) {
    lines.push([r.created_at, r.transaction_date, r.type, r.amount, r.category, r.memo || r.raw_text || "", r.payment_method, r.source, r.id].map(csvCell).join(","));
  }
  return new Response("\ufeff" + lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="accountbook_import_history_${month}.csv"`,
      "cache-control": "no-store",
    },
  });
}

function renderRollbackCandidateRows(rows = []) {
  const arr = safeArray(rows).slice(0, 500);
  if (!arr.length) return `<tr><td colspan="10">되돌리기 후보가 없습니다.</td></tr>`;
  return arr.map((r, idx) => {
    const row = safeObject(r);
    const json = escapeHtml(JSON.stringify({
      id: row.id || "",
      household_id: row.household_id || "",
      transaction_date: row.transaction_date || "",
      type: row.type === "income" ? "income" : "expense",
      amount: Number(row.amount || 0),
      category: row.category || "",
      memo: row.memo || row.raw_text || "",
      payment_method: row.payment_method || "",
      source: row.source || "",
      created_at: row.created_at || ""
    }));
    return `<tr data-rollback-row="1"><td><input class="rollbackCheck" type="checkbox" data-idx="${idx}" data-amount="${escapeHtml(row.amount || 0)}" data-type="${escapeHtml(row.type || "expense")}"/></td><td>${escapeHtml(String(row.created_at || "").replace("T", " ").slice(0, 19))}</td><td>${escapeHtml(String(row.transaction_date || ""))}</td><td>${row.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(row.amount || 0)}원</td><td>${escapeHtml(row.category || "")}</td><td>${escapeHtml(row.memo || row.raw_text || "")}</td><td>${escapeHtml(row.payment_method || "")}</td><td>${escapeHtml(row.source || "")}</td><td><code>${escapeHtml(row.id || "")}</code><input type="hidden" class="rollbackPayload" value="${json}"/></td></tr>`;
  }).join("");
}

function summarizeRollbackCandidates(rows = []) {
  const arr = safeArray(rows);
  const income = arr.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const expense = arr.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const bySource = {};
  for (const r of arr) {
    const key = r.source || "unknown";
    bySource[key] = (bySource[key] || 0) + 1;
  }
  return { count: arr.length, income, expense, balance: income - expense, bySource };
}

function renderRollbackSourceRows(bySource = {}) {
  const entries = Object.entries(bySource).sort((a, b) => b[1] - a[1]);
  if (!entries.length) return `<tr><td colspan="2">source별 후보가 없습니다.</td></tr>`;
  return entries.map(([source, count]) => `<tr><td>${escapeHtml(source)}</td><td>${numberWithCommas(count)}건</td></tr>`).join("");
}

async function handleRollbackCandidatePage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const selectedHousehold = households.find((h) => h.id === householdId) || households[0] || null;
  const hid = selectedHousehold?.id || "";
  const sourceFilter = String(url.searchParams.get("source") || "").trim();
  let rows = await fetchImportHistoryRows(env, { month, householdId: hid });
  if (sourceFilter) rows = rows.filter((r) => String(r.source || "") === sourceFilter);
  const summary = summarizeRollbackCandidates(rows);
  const qs = new URLSearchParams();
  qs.set("month", month);
  if (hid) qs.set("household_id", hid);
  const allSources = summarizeRollbackCandidates(await fetchImportHistoryRows(env, { month, householdId: hid })).bySource;
  const sourceOptions = Object.keys(allSources).sort().map((src) => `<option value="${escapeHtml(src)}"${src === sourceFilter ? " selected" : ""}>${escapeHtml(src)}</option>`).join("");
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === hid ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>되돌리기 후보</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1200px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c2d12));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.filters{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}.filters select,.filters input,.filters button{height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.btn.green{background:#059669}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.selectedBar{display:flex;gap:10px;align-items:center;flex-wrap:wrap;margin:10px 0;padding:12px;border-radius:16px;background:#fff7ed;color:#9a3412;font-weight:1000}.actions{display:flex;gap:8px;flex-wrap:wrap}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:1080px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.rollbackCheck{width:20px;height:20px}code{background:#f1f5f9;border-radius:8px;padding:3px 6px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("backup", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>되돌리기 후보 화면</h1><p>가져오기 이력 중 되돌릴 후보만 선택해 계획 JSON을 만듭니다. 이 화면은 DB에서 삭제하지 않습니다.</p><form class="filters" method="get" action="/backup/rollback-candidates"><select name="household_id">${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month)}"/><select name="source"><option value="">source 전체</option>${sourceOptions}</select><button type="submit">후보 조회</button></form></section><section class="grid"><div class="metric"><span>되돌리기 후보</span><b>${numberWithCommas(summary.count)}건</b></div><div class="metric"><span>수입 후보</span><b>${numberWithCommas(summary.income)}원</b></div><div class="metric"><span>지출 후보</span><b>${numberWithCommas(summary.expense)}원</b></div><div class="metric"><span>잔액 영향</span><b>${numberWithCommas(summary.balance)}원</b></div></section><section class="card"><h2>주의</h2><p class="warnBox">되돌리기 후보 화면은 계획 파일만 만듭니다. 실제 삭제는 다음 단계에서 관리자 비밀번호 재확인, 확인 문구, 중복/존재 재검사 후 제한적으로 처리하는 방식이 안전합니다.</p><div class="actions"><a class="btn light" href="/backup/import-history?${escapeHtml(qs.toString())}">가져오기 이력으로 돌아가기</a><button type="button" class="btn light" onclick="setRollbackChecks(true)">전체 선택</button><button type="button" class="btn light" onclick="setRollbackChecks(false)">선택 해제</button><button type="button" class="btn green" onclick="downloadRollbackPlan()">선택 계획 JSON 저장</button></div><div class="selectedBar"><b id="rollbackSelectedCount">0건 선택</b><span id="rollbackSelectedAmount">0원</span></div></section><section class="card"><h2>source별 후보</h2><div class="tableWrap"><table><thead><tr><th>source</th><th>건수</th></tr></thead><tbody>${renderRollbackSourceRows(summary.bySource)}</tbody></table></div></section><section class="card"><h2>되돌리기 후보 상세</h2><p class="note">최근 500건까지만 화면에 표시합니다. 선택 계획은 거래 ID와 거래 요약을 포함합니다.</p><div class="tableWrap"><table><thead><tr><th>선택</th><th>저장시각</th><th>거래일</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>수단</th><th>source</th><th>ID</th></tr></thead><tbody>${renderRollbackCandidateRows(rows)}</tbody></table></div></section></main><script>(function(){function money(n){n=Number(n||0);return n.toLocaleString('ko-KR')+'원'}window.setRollbackChecks=function(v){document.querySelectorAll('.rollbackCheck').forEach(function(x){x.checked=!!v});updateRollbackSelection()};function selectedRows(){var out=[];document.querySelectorAll('.rollbackCheck').forEach(function(x){if(!x.checked)return;var tr=x.closest('tr');var payload=tr?tr.querySelector('.rollbackPayload'):null;try{if(payload)out.push(JSON.parse(payload.value||'{}'))}catch(e){}});return out}function updateRollbackSelection(){var rows=selectedRows();var amount=0;rows.forEach(function(r){if((r.type||'expense')==='income')amount-=Number(r.amount||0);else amount+=Number(r.amount||0)});var c=document.getElementById('rollbackSelectedCount');var a=document.getElementById('rollbackSelectedAmount');if(c)c.textContent=rows.length+'건 선택';if(a)a.textContent='되돌리기 순지출 영향 '+money(amount)}document.querySelectorAll('.rollbackCheck').forEach(function(x){x.addEventListener('change',updateRollbackSelection)});window.downloadRollbackPlan=function(){var selected=selectedRows();var payload={app:'kakao-accountbook',version:'V19.8-BUDGET-ALERT',created_at:new Date().toISOString(),mode:'rollback_candidate_plan_only_no_db_write',month:${JSON.stringify(month)},household_id:${JSON.stringify(hid)},selected_count:selected.length,selected:selected};var blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});var a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='accountbook_import_rollback_candidate_plan.json';document.body.appendChild(a);a.click();setTimeout(function(){URL.revokeObjectURL(a.href);a.remove()},1000)};updateRollbackSelection();})();</script></body></html>`);
}

function safeRollbackPlanRows(plan) {
  const p = safeObject(plan);
  const rows = Array.isArray(p.selected) ? p.selected : Array.isArray(p.rows) ? p.rows : [];
  return rows.map((r) => {
    const row = safeObject(r);
    return {
      id: String(row.id || "").trim(),
      household_id: String(row.household_id || "").trim(),
      transaction_date: String(row.transaction_date || "").slice(0, 10),
      type: row.type === "income" ? "income" : "expense",
      amount: Number(row.amount || 0),
      category: String(row.category || "").slice(0, 80),
      memo: String(row.memo || row.raw_text || "").slice(0, 160),
      payment_method: String(row.payment_method || "").slice(0, 40),
      source: String(row.source || "").slice(0, 80),
      created_at: String(row.created_at || ""),
    };
  }).filter((r) => r.id || r.transaction_date || r.memo || r.amount);
}

function validateRollbackCandidatePlan(plan) {
  const errors = [];
  const warnings = [];
  const p = safeObject(plan);
  if (!p || !Object.keys(p).length) errors.push("JSON 객체가 아닙니다.");
  if (p.app && p.app !== "kakao-accountbook") warnings.push("app 값이 kakao-accountbook이 아닙니다.");
  if (p.mode && p.mode !== "rollback_candidate_plan_only_no_db_write") warnings.push("v10.9 되돌리기 후보 계획 파일이 아닐 수 있습니다.");
  if (!Array.isArray(p.selected) && !Array.isArray(p.rows)) errors.push("selected 배열이 없습니다.");
  const rows = safeRollbackPlanRows(p);
  if (!rows.length) errors.push("되돌리기 후보가 0건입니다.");
  const missingId = rows.filter((r) => !r.id).length;
  const badAmount = rows.filter((r) => !Number.isFinite(Number(r.amount))).length;
  const nonImport = rows.filter((r) => !isBackupImportSource(r.source)).length;
  if (missingId) errors.push(`거래 ID가 없는 후보 ${missingId}건`);
  if (badAmount) errors.push(`금액이 숫자가 아닌 후보 ${badAmount}건`);
  if (nonImport) errors.push(`가져오기 source가 아닌 후보 ${nonImport}건`);
  const expected = Number(p.selected_count || rows.length);
  if (Number.isFinite(expected) && expected !== rows.length) warnings.push(`selected_count(${expected})와 실제 후보 수(${rows.length})가 다릅니다.`);
  const income = rows.filter((r) => r.type === "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  const expense = rows.filter((r) => r.type !== "income").reduce((a, r) => a + Number(r.amount || 0), 0);
  return { ok: errors.length === 0, errors, warnings, rows, counts: { selected: rows.length, income, expense, balance: income - expense } };
}

async function fetchTransactionsByIds(env, ids = []) {
  const out = [];
  for (const id of safeArray(ids).map((x) => String(x || "").trim()).filter(Boolean).slice(0, 200)) {
    try {
      const rows = await supabase(env, `/rest/v1/transactions?id=eq.${encodeURIComponent(id)}&select=*`, { method: "GET" }) || [];
      if (Array.isArray(rows) && rows[0]) out.push(rows[0]);
    } catch (_) {}
  }
  return out;
}

function compareRollbackPlanToCurrent(planRows = [], currentRows = []) {
  const currentById = new Map();
  for (const row of safeArray(currentRows)) currentById.set(String(safeObject(row).id || ""), safeObject(row));
  const deletable = [];
  const missing = [];
  const mismatch = [];
  const blocked = [];
  for (const planRow of safeArray(planRows)) {
    const current = currentById.get(String(planRow.id || ""));
    if (!current) {
      missing.push({ plan: planRow, error: "현재 DB에 거래가 없음" });
      continue;
    }
    if (!isBackupImportSource(current.source)) {
      blocked.push({ plan: planRow, current, error: "현재 거래 source가 가져오기 항목이 아님" });
      continue;
    }
    const diff = [];
    for (const field of ["transaction_date", "type", "amount", "category", "memo", "payment_method", "source"]) {
      const a = field === "amount" ? Number(planRow[field] || 0) : String(planRow[field] || "");
      const b = field === "amount" ? Number(current[field] || 0) : String((field === "memo" ? (current.memo || current.raw_text || "") : current[field]) || "");
      if (String(a) !== String(b)) diff.push(field);
    }
    if (diff.length) mismatch.push({ plan: planRow, current, diff, error: `현재 데이터와 차이: ${diff.join(", ")}` });
    else deletable.push({ plan: planRow, current });
  }
  const income = deletable.filter((x) => x.plan.type === "income").reduce((a, x) => a + Number(x.plan.amount || 0), 0);
  const expense = deletable.filter((x) => x.plan.type !== "income").reduce((a, x) => a + Number(x.plan.amount || 0), 0);
  return {
    ok: mismatch.length === 0 && blocked.length === 0,
    counts: {
      plan: planRows.length,
      deletable: deletable.length,
      missing: missing.length,
      mismatch: mismatch.length,
      blocked: blocked.length,
      income,
      expense,
      balance: income - expense,
    },
    deletable,
    missing,
    mismatch,
    blocked,
  };
}

function renderRollbackFinalRows(items = [], mode = "plan") {
  const arr = safeArray(items).slice(0, 120);
  if (!arr.length) return `<tr><td colspan="8">표시할 항목이 없습니다.</td></tr>`;
  return arr.map((item) => {
    const row = safeObject(item.plan || item.current || item);
    const reason = item.error || (Array.isArray(item.diff) ? `차이: ${item.diff.join(", ")}` : "");
    return `<tr><td>${escapeHtml(String(row.id || ""))}</td><td>${escapeHtml(String(row.transaction_date || ""))}</td><td>${row.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(row.amount || 0)}원</td><td>${escapeHtml(row.category || "")}</td><td>${escapeHtml(row.memo || row.raw_text || "")}</td><td>${escapeHtml(row.source || "")}</td><td>${escapeHtml(reason)}</td></tr>`;
  }).join("");
}

function renderRollbackFinalCheckHtml({ households = [], householdId = "", month = "", validation = null, finalCheck = null, error = "" } = {}) {
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const errorBox = error ? `<section class="card bad"><h2>최종 확인 실패</h2><p>${escapeHtml(error)}</p></section>` : "";
  const validationBox = validation ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>계획 파일 검증: ${validation.ok ? "정상" : "확인 필요"}</h2><div class="grid mini"><div class="metric"><span>선택 후보</span><b>${numberWithCommas(validation.counts.selected)}</b></div><div class="metric"><span>수입 후보</span><b>${numberWithCommas(validation.counts.income)}원</b></div><div class="metric"><span>지출 후보</span><b>${numberWithCommas(validation.counts.expense)}원</b></div><div class="metric"><span>잔액 영향</span><b>${numberWithCommas(validation.counts.balance)}원</b></div></div>${validation.errors?.length ? `<h3>오류</h3><ul>${validation.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${validation.warnings?.length ? `<h3>주의</h3><ul>${validation.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</section>` : "";
  const finalHtml = finalCheck ? `<section class="card ${finalCheck.ok ? "good" : "warn"}"><h2>${finalCheck.ok ? "삭제 전 최종 확인 통과" : "삭제 전 확인 필요"}</h2><p>${finalCheck.ok ? "계획 파일의 후보가 현재 DB에도 동일하게 존재합니다. 그래도 이 화면은 DB에서 삭제하지 않습니다." : "일부 후보가 현재 DB와 다르거나 삭제 대상이 아닙니다. 실제 삭제 전 계획을 다시 만드는 것이 안전합니다."}</p><div class="grid mini"><div class="metric"><span>계획 후보</span><b>${numberWithCommas(finalCheck.counts.plan)}</b></div><div class="metric"><span>삭제 가능 후보</span><b>${numberWithCommas(finalCheck.counts.deletable)}</b></div><div class="metric"><span>현재 없음</span><b>${numberWithCommas(finalCheck.counts.missing)}</b></div><div class="metric"><span>내용 차이</span><b>${numberWithCommas(finalCheck.counts.mismatch)}</b></div><div class="metric"><span>차단</span><b>${numberWithCommas(finalCheck.counts.blocked)}</b></div><div class="metric"><span>지출 되돌림 영향</span><b>${numberWithCommas(finalCheck.counts.expense)}원</b></div></div></section><section class="card"><h2>삭제 가능 후보</h2><p class="note">다음 실제 되돌리기 단계에서 대상이 될 수 있는 항목입니다. 이 화면에서는 삭제하지 않습니다.</p><div class="tableWrap"><table><thead><tr><th>ID</th><th>거래일</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>source</th><th>상태</th></tr></thead><tbody>${renderRollbackFinalRows(finalCheck.deletable)}</tbody></table></div></section><section class="card"><h2>삭제 제외/확인 필요</h2><p class="note">현재 없거나, source가 다르거나, 내용이 달라진 항목입니다.</p><div class="tableWrap"><table><thead><tr><th>ID</th><th>거래일</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>source</th><th>사유</th></tr></thead><tbody>${renderRollbackFinalRows([...finalCheck.missing, ...finalCheck.mismatch, ...finalCheck.blocked])}</tbody></table></div></section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>되돌리기 최종 확인</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7f1d1d));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.warn{border-color:#fde68a;background:#fffbeb}.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.upload{display:grid;grid-template-columns:1fr 160px 170px 170px;gap:10px}.upload input,.upload select,.upload button{min-height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.upload input[type=file]{padding:10px}.upload button,.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.55}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;background:#fff;min-width:900px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}@media(max-width:840px){.wrap{padding:12px}.hero h1{font-size:24px}.upload{grid-template-columns:1fr}.card{overflow-x:auto}}</style></head><body>${renderUnifiedNav("backup", { month, householdId })}<main class="wrap"><section class="hero"><h1>되돌리기 최종 확인</h1><p>v10.9에서 만든 되돌리기 계획 JSON을 실제 삭제 전 다시 검증하고, 관리자 비밀번호를 재확인합니다. 이 단계도 DB에서 아무것도 삭제하지 않습니다.</p><p><a class="btn light" href="/backup/rollback-candidates">되돌리기 후보</a> <a class="btn light" href="/backup/import-history">가져오기 이력</a></p></section><section class="card"><h2>되돌리기 계획 파일 최종 확인</h2><p class="warnBox">계획 JSON과 관리자 비밀번호를 함께 확인합니다. 비밀번호가 맞아도 아직 Supabase에서 삭제하지 않습니다.</p><form class="upload" method="post" action="/backup/rollback-final-check" enctype="multipart/form-data"><input type="file" name="rollback_plan_file" accept="application/json,.json" required/><select name="household_id"><option value="">가계부 선택</option>${householdOptions}</select><input type="month" name="month" value="${escapeHtml(month || currentMonthKst())}"/><input type="password" name="admin_password" placeholder="관리자 비밀번호" autocomplete="current-password" required/><button type="submit">최종 확인</button></form></section>${errorBox}${validationBox}${finalHtml}</main></body></html>`;
}

async function handleRollbackFinalCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  return htmlResponse(renderRollbackFinalCheckHtml({ households, householdId, month }));
}

async function handleRollbackFinalCheckPost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (_) {}
  try {
    const form = await request.formData();
    const password = String(form.get("admin_password") || "").trim();
    const month = validMonth(form.get("month")) || currentMonthKst();
    const householdId = String(form.get("household_id") || "").trim();
    if (!(await checkAdminPassword(env, password))) {
      return htmlResponse(renderRollbackFinalCheckHtml({ households, month, householdId, error: "관리자 비밀번호 재확인에 실패했습니다." }), 401);
    }
    const file = form.get("rollback_plan_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderRollbackFinalCheckHtml({ households, month, householdId, error: "업로드된 되돌리기 계획 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 4 * 1024 * 1024) {
      return htmlResponse(renderRollbackFinalCheckHtml({ households, month, householdId, error: "파일이 너무 큽니다. 4MB 이하 되돌리기 계획 파일만 확인하세요." }), 400);
    }
    const plan = JSON.parse(raw);
    const validation = validateRollbackCandidatePlan(plan);
    if (!validation.ok) {
      return htmlResponse(renderRollbackFinalCheckHtml({ households, month, householdId, validation, error: "되돌리기 계획 파일 구조를 먼저 확인해야 합니다." }), 400);
    }
    const currentRows = await fetchTransactionsByIds(env, validation.rows.map((r) => r.id));
    const finalCheck = compareRollbackPlanToCurrent(validation.rows, currentRows);
    return htmlResponse(renderRollbackFinalCheckHtml({ households, month, householdId, validation, finalCheck }));
  } catch (err) {
    rememberOpsEvent({ kind: "rollback_final_check_failed", severity: "warn", path: "/rollback/final-check", method: "POST", detail: safeError(err) });
    return htmlResponse(renderRollbackFinalCheckHtml({ households, error: "되돌리기 최종 확인을 완료하지 못했습니다. 계획 파일을 다시 생성해 주세요." }), 400);
  }
}
// @build:exports-start
export {
  csvCell, handleImportHistoryCsv, handleImportHistoryPage, handleRollbackCandidatePage,
  handleRollbackFinalCheckPage, handleRollbackFinalCheckPost,
};
// @build:exports-end
