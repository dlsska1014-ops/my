// @build:imports-start
import { rememberOpsEvent } from "../runtime/ops-telemetry.js";
import { APP_VERSION } from "../public/site-config.js";
import { safeError } from "../runtime/leases.js";
import { htmlResponse, redirectResponse } from "../runtime/http.js";
import { verifyAdminSession } from "../auth/crypto-admin-session.js";
import { normalizeTransactionType } from "./transactions-households.js";
import { fetchCustomCategories } from "../settings/categories-keywords.js";
import { fetchReservePlans } from "../settings/reserve-plans.js";
import {
  fetchAdminHouseholds, fetchAdminRows, fetchHouseholdMembers,
} from "../data/households-members-rows.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { fetchBudgets, fetchRecurring } from "../domain/budgets.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

function backupJsonResponse(data, filename) {
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "content-type": "application/json; charset=utf-8",
      "content-disposition": `attachment; filename="${filename}"`,
      "cache-control": "no-store",
    },
  });
}

function backupScopeParams(month, householdId) {
  const qs = new URLSearchParams();
  qs.set("month", month);
  if (householdId) qs.set("household_id", householdId);
  return qs.toString();
}

async function buildBackupPayload(env, { month, householdId }) {
  const households = await fetchAdminHouseholds(env);
  const selectedHouseholds = householdId ? households.filter((h) => h.id === householdId) : households;
  const transactions = await fetchAdminRows(env, { month, householdId, type: "all" });
  const membersByHousehold = {};
  const budgetsByHousehold = {};
  const recurringByHousehold = {};
  const categoriesByHousehold = {};
  const reservePlansByHousehold = {};
  for (const h of selectedHouseholds) {
    membersByHousehold[h.id] = await fetchHouseholdMembers(env, h.id);
    budgetsByHousehold[h.id] = await fetchBudgets(env, h.id, month);
    recurringByHousehold[h.id] = await fetchRecurring(env, h.id);
    categoriesByHousehold[h.id] = await fetchCustomCategories(env, h.id);
    reservePlansByHousehold[h.id] = await fetchReservePlans(env, h.id);
  }
  return {
    app: "kakao-accountbook",
    version: APP_VERSION,
    exported_at: new Date().toISOString(),
    scope: { month, household_id: householdId || "", household_scope: householdId ? "selected" : "all" },
    counts: {
      households: selectedHouseholds.length,
      transactions: transactions.length,
      members: Object.values(membersByHousehold).reduce((a, v) => a + v.length, 0),
      budgets: Object.values(budgetsByHousehold).reduce((a, v) => a + v.length, 0),
      recurring: Object.values(recurringByHousehold).reduce((a, v) => a + v.length, 0),
      categories: Object.values(categoriesByHousehold).reduce((a, v) => a + v.length, 0),
      reserve_plans: Object.values(reservePlansByHousehold).reduce((a, v) => a + v.length, 0),
    },
    households: selectedHouseholds,
    household_members: membersByHousehold,
    transactions,
    budgets: budgetsByHousehold,
    recurring: recurringByHousehold,
    categories: categoriesByHousehold,
    reserve_plans: reservePlansByHousehold,
    notes: [
      "이 파일은 백업용 JSON입니다.",
      "민감한 가계부 데이터가 포함될 수 있으므로 외부 공유를 피하세요.",
      "복구 자동 반영 기능은 아직 제공하지 않으며, 운영 안정화를 위해 먼저 내보내기만 제공합니다."
    ],
  };
}

async function handleAdminExportJson(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const householdId = String(url.searchParams.get("household_id") || "").trim();
  const payload = await buildBackupPayload(env, { month, householdId });
  const scope = householdId ? "household" : "all";
  return backupJsonResponse(payload, `accountbook_backup_${month}_${scope}.json`);
}

async function handleBackupCenterPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const selectedHousehold = households.find((h) => h.id === householdId) || households[0] || null;
  const hid = selectedHousehold?.id || "";
  const rows = await fetchAdminRows(env, { month, householdId: hid, type: "all" });
  const members = hid ? await fetchHouseholdMembers(env, hid) : [];
  const budgets = hid ? await fetchBudgets(env, hid, month) : [];
  const recurring = hid ? await fetchRecurring(env, hid) : [];
  const categories = hid ? await fetchCustomCategories(env, hid) : [];
  const qs = backupScopeParams(month, hid);
  const allQs = backupScopeParams(month, "");
  const cards = [
    ["거래 기록", `${numberWithCommas(rows.length)}건`, "현재 선택한 월의 수입·지출 데이터"],
    ["참여자", `${numberWithCommas(members.length)}명`, "가계부 구성원 정보"],
    ["예산", `${numberWithCommas(budgets.length)}개`, "월 예산/분류 예산"],
    ["고정항목", `${numberWithCommas(recurring.length)}개`, "반복 기록 설정"],
    ["사용자 분류", `${numberWithCommas(categories.length)}개`, "직접 추가한 분류"],
  ].map(([label, value, desc]) => `<div class="metric"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b><small>${escapeHtml(desc)}</small></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>백업센터</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#0f172a,#1d4ed8);color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.filters{display:flex;gap:8px;flex-wrap:wrap}.filters select,.filters input,.filters button{height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px;box-shadow:0 10px 28px rgba(15,23,42,.055)}.metric span,.metric small{display:block;color:#64748b}.metric b{display:block;font-size:25px;margin:6px 0}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.actions{display:flex;gap:8px;flex-wrap:wrap}.stepActions{margin-top:10px;padding-top:10px;border-top:1px solid #e5e7eb}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.btn.green{background:#059669}.btn.light{background:#eff6ff;color:#1e3a8a}.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}@media(max-width:640px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("backup", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>백업센터</h1><p>새 기능을 추가하기 전, 현재 가계부 데이터를 안전하게 내려받아 보관합니다. PC 로컬 저장 구조가 아니라 Supabase 클라우드 데이터를 export합니다.</p><form class="filters" method="get" action="/backup"><select name="household_id">${households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === hid ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("")}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">백업 기준 변경</button></form></section><section class="grid">${cards}</section><section class="card"><h2>내보내기</h2><p class="warn">JSON 백업은 거래 기록, 예산, 고정항목, 사용자 분류, 참여자 정보를 함께 담습니다. CSV는 거래 목록 확인/엑셀 검토용입니다.</p><div class="actions"><a class="btn green" href="/admin/export/json?${escapeHtml(qs)}">1. 현재 가계부 백업</a><a class="btn light" href="/admin/csv?${escapeHtml(qs)}">거래내역 엑셀용 CSV</a><a class="btn" href="/admin/export/json?${escapeHtml(allQs)}">전체 가계부 백업</a></div><div class="actions stepActions"><a class="btn light" href="/backup/preview">2. 백업 파일 확인</a><a class="btn light" href="/backup/compare?${escapeHtml(qs)}">3. 중복/충돌 확인</a><a class="btn light" href="/backup/select?${escapeHtml(qs)}">4. 복구할 항목 고르기</a><a class="btn light" href="/backup/final-check?${escapeHtml(qs)}">5. 복구 전 최종 확인</a><a class="btn light" href="/backup/apply?${escapeHtml(qs)}">6. 선택 항목 복구 실행</a><a class="btn light" href="/backup/import-history?${escapeHtml(qs)}">복구 이력 보기</a><a class="btn light" href="/backup/rollback-candidates?${escapeHtml(qs)}">되돌릴 항목 고르기</a><a class="btn light" href="/backup/rollback-final-check?${escapeHtml(qs)}">되돌리기 전 최종 확인</a></div></section><section class="card"><h2>운영 안전 원칙</h2><ul><li>복구와 되돌리기는 단계별 확인 후 진행합니다. 실제 적용 전에는 반드시 현재 데이터를 먼저 백업하세요.</li><li>백업 파일에는 민감한 가계부 데이터가 포함되므로 외부 공유를 피하세요.</li><li>큰 구조 변경 전에는 이 화면에서 JSON 백업을 먼저 내려받으세요.</li></ul></section></main></body></html>`);
}

function safeArray(value) {
  return Array.isArray(value) ? value : [];
}

function safeObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function countObjectArrays(obj) {
  const o = safeObject(obj);
  return Object.values(o).reduce((a, v) => a + (Array.isArray(v) ? v.length : 0), 0);
}

function validateBackupPayloadShape(payload) {
  const errors = [];
  const warnings = [];
  const p = safeObject(payload);
  if (!p || !Object.keys(p).length) errors.push("JSON 객체가 아닙니다.");
  if (p.app !== "kakao-accountbook") warnings.push("app 값이 kakao-accountbook이 아닙니다.");
  if (!String(p.version || "").startsWith("V")) warnings.push("백업 버전 정보가 없습니다.");
  if (!p.exported_at) warnings.push("exported_at 값이 없습니다.");
  if (!safeObject(p.scope).month) warnings.push("백업 기준 월(scope.month)이 없습니다.");
  if (!Array.isArray(p.households)) errors.push("households 배열이 없습니다.");
  if (!Array.isArray(p.transactions)) errors.push("transactions 배열이 없습니다.");
  if (!safeObject(p.household_members) || !Object.keys(safeObject(p.household_members)).length) warnings.push("household_members 정보가 없거나 비어 있습니다.");
  if (!safeObject(p.budgets)) warnings.push("budgets 객체가 없습니다.");
  if (!safeObject(p.recurring)) warnings.push("recurring 객체가 없습니다.");
  if (!safeObject(p.categories)) warnings.push("categories 객체가 없습니다.");

  const transactions = safeArray(p.transactions);
  const missingId = transactions.filter((t) => !safeObject(t).id).length;
  const missingDate = transactions.filter((t) => !safeObject(t).transaction_date).length;
  const badAmount = transactions.filter((t) => !Number.isFinite(Number(safeObject(t).amount))).length;
  if (missingId) warnings.push(`거래 ID가 없는 항목 ${missingId}건`);
  if (missingDate) warnings.push(`거래 날짜가 없는 항목 ${missingDate}건`);
  if (badAmount) warnings.push(`금액이 숫자가 아닌 항목 ${badAmount}건`);

  const counts = {
    households: safeArray(p.households).length,
    transactions: transactions.length,
    members: countObjectArrays(p.household_members),
    budgets: countObjectArrays(p.budgets),
    recurring: countObjectArrays(p.recurring),
    categories: countObjectArrays(p.categories),
  };
  return { ok: errors.length === 0, errors, warnings, counts };
}

function summarizeBackupPayload(payload) {
  const p = safeObject(payload);
  const transactions = safeArray(p.transactions);
  const expense = transactions.filter((t) => safeObject(t).type !== "income").reduce((a, t) => a + Number(safeObject(t).amount || 0), 0);
  const income = transactions.filter((t) => safeObject(t).type === "income").reduce((a, t) => a + Number(safeObject(t).amount || 0), 0);
  const categoryMap = {};
  for (const t of transactions) {
    const row = safeObject(t);
    const c = row.category || "미분류";
    categoryMap[c] = (categoryMap[c] || 0) + Number(row.amount || 0);
  }
  const topCategories = Object.entries(categoryMap).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const byDate = {};
  for (const t of transactions) {
    const row = safeObject(t);
    const d = row.transaction_date || "날짜없음";
    byDate[d] = (byDate[d] || 0) + 1;
  }
  const dateRange = Object.keys(byDate).filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  return {
    version: p.version || "",
    exported_at: p.exported_at || "",
    scope: safeObject(p.scope),
    income,
    expense,
    balance: income - expense,
    topCategories,
    firstDate: dateRange[0] || "",
    lastDate: dateRange[dateRange.length - 1] || "",
  };
}

function renderBackupPreviewHtml({ payload = null, validation = null, summary = null, error = "" } = {}) {
  const hasPayload = !!payload;
  const counts = validation?.counts || { households: 0, transactions: 0, members: 0, budgets: 0, recurring: 0, categories: 0 };
  const metricCards = [
    ["가계부", counts.households],
    ["거래", counts.transactions],
    ["참여자", counts.members],
    ["예산", counts.budgets],
    ["고정항목", counts.recurring],
    ["사용자 분류", counts.categories],
  ].map(([k, v]) => `<div class="metric"><span>${escapeHtml(k)}</span><b>${numberWithCommas(v || 0)}</b></div>`).join("");
  const errors = (validation?.errors || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const warnings = (validation?.warnings || []).map((x) => `<li>${escapeHtml(x)}</li>`).join("");
  const topRows = (summary?.topCategories || []).map(([name, amount]) => `<tr><td>${escapeHtml(name)}</td><td>${numberWithCommas(amount)}원</td></tr>`).join("");
  const statusBox = error ? `<section class="card bad"><h2>파일을 읽지 못했습니다</h2><p>${escapeHtml(error)}</p></section>` : hasPayload ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>${validation.ok ? "검증 통과" : "검증 실패"}</h2><p>${validation.ok ? "백업 파일 구조가 정상입니다. 아직 복구 적용은 하지 않고 미리보기만 제공합니다." : "필수 구조가 부족합니다. 이 파일은 복구용으로 사용하지 않는 것이 안전합니다."}</p>${errors ? `<h3>오류</h3><ul>${errors}</ul>` : ""}${warnings ? `<h3>주의</h3><ul>${warnings}</ul>` : ""}</section>` : "";
  const summaryHtml = hasPayload ? `<section class="grid">${metricCards}</section><section class="card"><h2>백업 요약</h2><div class="summaryGrid"><div><span>백업 버전</span><b>${escapeHtml(summary.version || "미상")}</b></div><div><span>생성 시각</span><b>${escapeHtml(summary.exported_at || "미상")}</b></div><div><span>기간</span><b>${escapeHtml(summary.firstDate || "-")} ~ ${escapeHtml(summary.lastDate || "-")}</b></div><div><span>수입</span><b>${numberWithCommas(summary.income || 0)}원</b></div><div><span>지출</span><b>${numberWithCommas(summary.expense || 0)}원</b></div><div><span>잔액</span><b>${numberWithCommas(summary.balance || 0)}원</b></div></div></section><section class="card"><h2>상위 분류</h2><table><thead><tr><th>분류</th><th>금액</th></tr></thead><tbody>${topRows || `<tr><td colspan="2">표시할 분류가 없습니다.</td></tr>`}</tbody></table></section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>백업 미리보기</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:25px;margin-top:6px}.upload{display:grid;gap:10px}.upload input[type=file]{padding:16px;border:2px dashed #cbd5e1;border-radius:18px;background:#f8fafc}.btn,.upload button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;cursor:pointer}.btn.light{background:#eff6ff;color:#1e3a8a}.summaryGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.summaryGrid div{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px}.summaryGrid span{display:block;color:#64748b;font-size:13px}.summaryGrid b{display:block;margin-top:4px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}@media(max-width:640px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("backup")}<main class="wrap"><section class="hero"><h1>백업 미리보기</h1><p>내려받은 JSON 백업 파일을 복구하기 전에 구조와 건수를 확인합니다. 이 화면은 DB에 아무것도 저장하지 않습니다.</p><p><a class="btn light" href="/backup">백업센터로 돌아가기</a></p></section><section class="card"><h2>JSON 백업 파일 선택</h2><p class="warn">민감한 데이터가 포함될 수 있으므로 본인 백업 파일만 확인하세요. 현재 단계에서는 복구 자동 적용을 하지 않습니다.</p><form class="upload" method="post" action="/backup/preview" enctype="multipart/form-data"><input type="file" name="backup_file" accept="application/json,.json" required/><button type="submit">백업 파일 검증/미리보기</button></form></section>${statusBox}${summaryHtml}</main></body></html>`;
}

async function handleBackupPreviewPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  return htmlResponse(renderBackupPreviewHtml());
}

async function handleBackupPreviewPost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  try {
    const form = await request.formData();
    const file = form.get("backup_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderBackupPreviewHtml({ error: "업로드된 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 8 * 1024 * 1024) {
      return htmlResponse(renderBackupPreviewHtml({ error: "파일이 너무 큽니다. 8MB 이하 JSON만 먼저 확인하세요." }), 400);
    }
    const payload = JSON.parse(raw);
    const validation = validateBackupPayloadShape(payload);
    const summary = summarizeBackupPayload(payload);
    return htmlResponse(renderBackupPreviewHtml({ payload, validation, summary }), validation.ok ? 200 : 400);
  } catch (err) {
    rememberOpsEvent({ kind: "backup_preview_failed", severity: "warn", path: "/backup/preview", method: "POST", detail: safeError(err) });
    return htmlResponse(renderBackupPreviewHtml({ error: "JSON 파일 형식이나 백업 구조를 확인해 주세요. 원본 데이터는 변경되지 않았습니다." }), 400);
  }
}

function normalizeComparableText(value) {
  return String(value || "").trim();
}

function transactionComparable(row) {
  const r = safeObject(row);
  return {
    type: normalizeTransactionType(r.type),
    transaction_date: String(r.transaction_date || "").slice(0, 10),
    amount: Number(r.amount || 0),
    category: normalizeComparableText(r.category),
    memo: normalizeComparableText(r.memo || r.raw_text),
    payment_method: normalizeComparableText(r.payment_method),
    user_id: normalizeComparableText(r.user_id),
  };
}

function transactionSignature(row) {
  const r = transactionComparable(row);
  return [r.type, r.transaction_date, r.amount, r.category, r.memo, r.payment_method].join("|");
}

function transactionDiffFields(a, b) {
  const aa = transactionComparable(a);
  const bb = transactionComparable(b);
  const fields = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"];
  return fields.filter((f) => String(aa[f]) !== String(bb[f]));
}

function compareBackupTransactions(backupRows, currentRows) {
  const backup = safeArray(backupRows);
  const current = safeArray(currentRows);
  const currentById = new Map();
  const currentBySignature = new Map();
  for (const row of current) {
    const r = safeObject(row);
    if (r.id) currentById.set(String(r.id), r);
    const sig = transactionSignature(r);
    if (!currentBySignature.has(sig)) currentBySignature.set(sig, []);
    currentBySignature.get(sig).push(r);
  }

  const backupIds = new Set();
  const backupSigs = new Set();
  const sameId = [];
  const contentDuplicates = [];
  const conflicts = [];
  const newCandidates = [];

  for (const row of backup) {
    const r = safeObject(row);
    const id = String(r.id || "");
    const sig = transactionSignature(r);
    if (id) backupIds.add(id);
    backupSigs.add(sig);
    if (id && currentById.has(id)) {
      const cur = currentById.get(id);
      const diff = transactionDiffFields(r, cur);
      if (diff.length) conflicts.push({ backup: r, current: cur, diff });
      else sameId.push(r);
    } else if (currentBySignature.has(sig)) {
      contentDuplicates.push({ backup: r, current: currentBySignature.get(sig)[0] });
    } else {
      newCandidates.push(r);
    }
  }

  const currentOnly = current.filter((row) => {
    const r = safeObject(row);
    const id = String(r.id || "");
    const sig = transactionSignature(r);
    return (!id || !backupIds.has(id)) && !backupSigs.has(sig);
  });

  const risk = conflicts.length ? "danger" : (sameId.length || contentDuplicates.length) ? "warn" : "good";
  return {
    risk,
    counts: {
      backup: backup.length,
      current: current.length,
      same_id: sameId.length,
      same_content: contentDuplicates.length,
      conflicts: conflicts.length,
      new_candidates: newCandidates.length,
      current_only: currentOnly.length,
    },
    sameId,
    contentDuplicates,
    conflicts,
    newCandidates,
    currentOnly,
  };
}

function renderBackupCompareRows(rows, type = "new") {
  const arr = safeArray(rows).slice(0, 30);
  if (!arr.length) return `<tr><td colspan="6">표시할 항목이 없습니다.</td></tr>`;
  return arr.map((item) => {
    const row = safeObject(item.backup || item);
    const diff = Array.isArray(item.diff) && item.diff.length ? ` · 차이: ${item.diff.join(", ")}` : "";
    return `<tr><td>${escapeHtml(String(row.transaction_date || ""))}</td><td>${row.type === "income" ? "수입" : "지출"}</td><td>${numberWithCommas(row.amount || 0)}원</td><td>${escapeHtml(row.category || "")}</td><td>${escapeHtml(row.memo || row.raw_text || "")}</td><td>${escapeHtml(row.id || "")}${escapeHtml(diff)}</td></tr>`;
  }).join("");
}

function renderBackupCompareHtml({ payload = null, validation = null, summary = null, compare = null, month = "", householdId = "", households = [], error = "" } = {}) {
  const hasResult = !!compare;
  const riskLabel = compare?.risk === "danger" ? "충돌 위험" : compare?.risk === "warn" ? "중복 가능성" : "안전";
  const riskText = compare?.risk === "danger" ? "같은 ID인데 내용이 다른 거래가 있습니다. 자동 복구/가져오기는 위험합니다." : compare?.risk === "warn" ? "이미 존재하는 거래가 있어 중복 저장 위험이 있습니다. 가져오기 전에 확인이 필요합니다." : "현재 데이터와 충돌·중복 위험이 낮습니다.";
  const cards = compare ? [
    ["백업 거래", compare.counts.backup],
    ["현재 거래", compare.counts.current],
    ["동일 ID", compare.counts.same_id],
    ["동일 내용", compare.counts.same_content],
    ["충돌", compare.counts.conflicts],
    ["신규 후보", compare.counts.new_candidates],
    ["현재만 있음", compare.counts.current_only],
  ].map(([label, value]) => `<div class="metric"><span>${escapeHtml(label)}</span><b>${numberWithCommas(value || 0)}</b></div>`).join("") : "";
  const householdOptions = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${h.id === householdId ? " selected" : ""}>${escapeHtml(h.name)}</option>`).join("");
  const errorBox = error ? `<section class="card bad"><h2>비교 실패</h2><p>${escapeHtml(error)}</p></section>` : "";
  const validationBox = validation ? `<section class="card ${validation.ok ? "good" : "bad"}"><h2>백업 파일 구조: ${validation.ok ? "정상" : "확인 필요"}</h2>${validation.errors?.length ? `<h3>오류</h3><ul>${validation.errors.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}${validation.warnings?.length ? `<h3>주의</h3><ul>${validation.warnings.map((x) => `<li>${escapeHtml(x)}</li>`).join("")}</ul>` : ""}</section>` : "";
  const resultHtml = hasResult ? `<section class="card ${compare.risk}"><h2>비교 결과: ${escapeHtml(riskLabel)}</h2><p>${escapeHtml(riskText)}</p></section><section class="grid">${cards}</section><section class="card"><h2>충돌 항목</h2><p class="note">같은 ID인데 백업과 현재 데이터 내용이 다른 항목입니다.</p><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>ID/차이</th></tr></thead><tbody>${renderBackupCompareRows(compare.conflicts, "conflict")}</tbody></table></section><section class="card"><h2>신규 후보</h2><p class="note">현재 데이터에 없어 보이는 백업 거래입니다. 아직 DB에 저장하지 않습니다.</p><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>ID</th></tr></thead><tbody>${renderBackupCompareRows(compare.newCandidates, "new")}</tbody></table></section><section class="card"><h2>중복 가능 항목</h2><p class="note">ID 또는 내용 기준으로 이미 존재하는 거래입니다.</p><table><thead><tr><th>날짜</th><th>유형</th><th>금액</th><th>분류</th><th>메모</th><th>ID</th></tr></thead><tbody>${renderBackupCompareRows([...compare.sameId.slice(0, 15), ...compare.contentDuplicates.slice(0, 15)], "dup")}</tbody></table></section>` : "";
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>백업 비교</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1140px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c2d12));color:#fff;border-radius:26px;padding:22px;margin:14px 0;box-shadow:0 18px 40px rgba(15,23,42,.18)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.9}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.card.good{border-color:#86efac;background:#f0fdf4}.card.warn{border-color:#fde68a;background:#fffbeb}.card.danger,.card.bad{border-color:#fecaca;background:#fef2f2}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(145px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:25px;margin-top:6px}.upload{display:grid;grid-template-columns:1fr 160px 170px;gap:10px}.upload input,.upload select,.upload button{min-height:42px;border:1px solid #d1d5db;border-radius:13px;padding:0 12px;background:#fff;font:inherit}.upload input[type=file]{padding:10px}.upload button{background:#111827;color:#fff;font-weight:1000;cursor:pointer}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.55}table{width:100%;border-collapse:collapse;background:#fff}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.upload{grid-template-columns:1fr}.card{overflow-x:auto}table{min-width:760px}}</style></head><body>${renderUnifiedNav("backup", { month, householdId })}<main class="wrap"><section class="hero"><h1>백업 비교/중복 위험 분석</h1><p>백업 JSON을 현재 Supabase 데이터와 비교해, 복구 전에 중복·충돌 위험을 확인합니다. 이 화면은 DB에 아무것도 저장하지 않습니다.</p><p><a class="btn light" href="/backup">백업센터</a> <a class="btn light" href="/backup/preview">백업 미리보기</a></p></section><section class="card"><h2>백업 파일 비교</h2><p class="warnBox">복구 자동 적용 전 단계입니다. 같은 ID, 같은 내용, 충돌 항목, 신규 후보만 분석합니다.</p><form class="upload" method="post" action="/backup/compare" enctype="multipart/form-data"><input type="file" name="backup_file" accept="application/json,.json" required/><select name="household_id"><option value="">백업 기준 사용/전체</option>${householdOptions}</select><button type="submit">비교 분석</button></form></section>${errorBox}${validationBox}${resultHtml}</main></body></html>`;
}

async function handleBackupComparePage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  return htmlResponse(renderBackupCompareHtml({ households, householdId, month: currentMonthKst() }));
}

async function handleBackupComparePost(request, env) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  let households = [];
  try { households = await fetchAdminHouseholds(env); } catch (_) {}
  try {
    const form = await request.formData();
    const file = form.get("backup_file");
    if (!file || typeof file.text !== "function") {
      return htmlResponse(renderBackupCompareHtml({ households, error: "업로드된 JSON 파일이 없습니다." }), 400);
    }
    const raw = await file.text();
    if (raw.length > 8 * 1024 * 1024) {
      return htmlResponse(renderBackupCompareHtml({ households, error: "파일이 너무 큽니다. 8MB 이하 JSON만 먼저 비교하세요." }), 400);
    }
    const payload = JSON.parse(raw);
    const validation = validateBackupPayloadShape(payload);
    const summary = summarizeBackupPayload(payload);
    const scope = safeObject(payload.scope);
    const month = validMonth(scope.month) || currentMonthKst();
    const formHouseholdId = String(form.get("household_id") || "").trim();
    const householdId = formHouseholdId || String(scope.household_id || "").trim();
    if (!validation.ok) {
      return htmlResponse(renderBackupCompareHtml({ payload, validation, summary, households, month, householdId }), 400);
    }
    const currentRows = await fetchAdminRows(env, { month, householdId, type: "all" });
    const compare = compareBackupTransactions(safeArray(payload.transactions), currentRows);
    return htmlResponse(renderBackupCompareHtml({ payload, validation, summary, compare, households, month, householdId }));
  } catch (err) {
    rememberOpsEvent({ kind: "backup_compare_failed", severity: "warn", path: "/backup/compare", method: "POST", detail: safeError(err) });
    return htmlResponse(renderBackupCompareHtml({ households, error: "백업 비교를 완료하지 못했습니다. 파일 구조와 선택한 가계부를 확인해 주세요." }), 400);
  }
}
// @build:exports-start
export {
  compareBackupTransactions, handleAdminExportJson, handleBackupCenterPage, handleBackupComparePage,
  handleBackupComparePost, handleBackupPreviewPage, handleBackupPreviewPost, safeArray, safeObject,
  transactionComparable, transactionSignature, validateBackupPayloadShape,
};
// @build:exports-end
