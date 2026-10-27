// @build:imports-start
import {
  boundedRuntimeNumber, buildOpsSnapshot, getSkillOpsSnapshot, getTrafficOpsSnapshot,
  rememberOpsEvent,
} from "../runtime/ops-telemetry.js";
import { APP_VERSION, appName } from "../public/site-config.js";
import { safeError, withHouseholdSettingsRmw } from "../runtime/leases.js";
import { htmlResponse, redirectPublicAwayFromAdmin, redirectResponse } from "../runtime/http.js";
import { sha256Hex, verifyAdminSession } from "../auth/crypto-admin-session.js";
import { fetchReservePlans } from "../settings/reserve-plans.js";
import {
  attachSpenderNames, fetchAdminRows, fetchFormerSpenderMembers, fetchHouseholdMembers,
  memberNameMap,
} from "../data/households-members-rows.js";
import { getSettingValue, getSettingValueStrict } from "../admin/settings-audit-pages.js";
import { safeArray } from "../admin/backup-compare.js";
import { maskKey, userHouseholdRoleLabel } from "../admin/ops-diagnostics-pages.js";
import { renderUnifiedNav } from "../web/unified-nav.js";
import { renderDuplicateSafetyHtml } from "../admin/meme-content-pages.js";
import {
  budgetAlertKakaoHint, buildBudgetAlertPolishModel, renderBudgetAlertRows,
  renderBudgetAlertStatusPill, renderPendingRecurringList,
} from "./budget-alerts-annual-goals.js";
import {
  handleSettlementRefundPreview, validateSettlementRefundLinks,
} from "./settlement-refund-preview.js";
import {
  refundDeductionNote, refundLinkMessage, refundLinksEnabled,
} from "../domain/refund-links.js";
import {
  loadRefundDeductions, loadRefundLinkMonthState, refundSettlementSpenderRows,
  settlementRefundDigest, settlementRefundPageParts,
} from "./settlement-refund-links.js";
import { verifyUserSession } from "../auth/user-session.js";
import { fetchUserById, fetchUserHouseholds } from "../data/users-household-create.js";
import { readScheduledRunLog } from "../cron/recurring-auto-apply.js";
import {
  parseJsonArraySettingStrict, parseJsonSetting, saveSettingValue,
} from "../my/reports-premium.js";
import {
  canManageMyHousehold, canReadMyHousehold, getMySelectedHousehold, myAccessStatusResponse,
} from "../my/access-control.js";
import {
  fetchBudgets, fetchObservationMonthRows, fetchRecurringStrict,
} from "../domain/budgets.js";
import { spendingOutlookBreakdown } from "../domain/spending-outlook.js";
import { ACCOUNTBOOK_THEME_JS_ASSET_PATH } from "../assets/asset-registry.js";
import { currentMonthKst, validMonth } from "../nlu/date-payment.js";
import { escapeHtml, nextMonthStart, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

async function handleBudgetAlertPolishPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  const households = access.households;
  const selected = access.selected;
  if (!selected) return redirectResponse("/my");
  const selectedHousehold = selected;
  const members = await fetchHouseholdMembers(env, selectedHousehold.id);
  const rows = attachSpenderNames(await fetchObservationMonthRows(env, selectedHousehold.id, month), members);
  const budgets = await fetchBudgets(env, selectedHousehold.id, month, { strict: true });
  // V22.9.79 V76 W-7: 월말 예상에 남은 정기지출 납부를 넣으려고 정기지출 항목을 규칙과 같은 단계에서 함께 읽는다(직렬 깊이 그대로).
  // 못 읽으면 null — 그 몫을 빼고 계산했다고 화면에 적는다.
  // V22.9.80 V76 M-7: 연결한 환불 차감도 같은 단계에서 읽는다(플래그가 꺼져 있으면 요청 없음).
  const [recurring, plans, refund] = await Promise.all([
    fetchRecurringStrict(env, selectedHousehold.id).catch(() => null),
    fetchReservePlans(env, selectedHousehold.id, { strict: true }).catch(() => null),
    loadRefundDeductions(env, { householdId: selectedHousehold.id, start: `${month}-01`, end: nextMonthStart(month) }),
  ]);
  const model = buildBudgetAlertPolishModel({ month, selectedHousehold, rows, budgets, recurring, plans, refundDeductions: refund.entries || [] });
  return htmlResponse(renderBudgetAlertPolishHtml({ env, month, households, selectedHousehold, model, refundNote: refundDeductionNote(model.budget.refund, { failed: refund.failed }) }));
}

function renderBudgetAlertPolishHtml({ env, month, households, selectedHousehold, model, refundNote = "" }) {
  const title = escapeHtml(appName(env));
  const opts = safeArray(households).map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selectedHousehold?.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")}</option>`).join("");
  const appHref = `/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const budgetHref = `/budgets?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const recurringHref = `/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const forecastLabel = model.forecastDiff == null ? (model.observation.status === "before" ? "관측 전 · 월말 예상 보류" : model.forecastExpense == null ? "확인 불가 · 월말 예상 보류" : "예산 설정 후 계산") : model.forecastDiff > 0 ? `예산보다 ${numberWithCommas(model.forecastDiff)}원 초과 예상` : model.totalBudget ? `예산보다 ${numberWithCommas(Math.abs(model.forecastDiff))}원 여유 예상` : "예산 설정 후 계산";
  // V22.9.79 V76 W-7: 예전 ‘관측 속도 예상’과 ‘대기 목록을 더한 가정값’ 두 줄은 월말 예상 하나로 합쳤다. 대신 그 내역을 한 줄로 적는다.
  const outlookBreakdown = spendingOutlookBreakdown(model.outlook);
  const observationMoney = amount => amount == null ? (model.observation.status === "before" ? "관측 전" : "확인 불가") : numberWithCommas(amount) + "원";
  const allowanceText = !model.sameMonth ? (model.pastMonth ? "종료된 달" : "관측 전") : !model.totalBudget ? "설정 필요" : observationMoney(model.dailyAllowance);
  const topWarn = [...model.dangerCategories, ...model.warningCategories].slice(0, 5).map((x) => `<span>${escapeHtml(x.category)} ${numberWithCommas(x.rate)}%</span>`).join("") || `<span>주의 분류 없음</span>`;
  // V22.9.79 F-4: 조회 줄(가계부 select·월·조회)이 모바일에서 1fr 한 열이라 긴 가계부 이름이 든 select 가 줄지 못해 줄 전체가 360px 밖(R=637)으로 나갔다.
  // 한 열을 minmax(0,1fr)로 두고 입력칸에 min-width:0 을 준다(연간·목표 화면에 V22.9.37 U11 이 한 것과 같다).
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 예산 알림</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#b45309));color:#fff}.hero p{color:#ffedd5;line-height:1.65}.filters{display:grid;grid-template-columns:minmax(0,1fr) 160px 110px;gap:8px;margin-top:12px}.filters select,.filters input,.filters button{min-width:0;width:100%;height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.pill,.state{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:1000;font-size:12px}.pill.ok,.state.ok{background:#dcfce7;color:#166534}.pill.warn,.state.warn{background:#fef3c7;color:#92400e}.pill.bad,.state.bad{background:#fee2e2;color:#991b1b}.pill.setup{background:#eef2ff;color:#3730a3}.notice{border-radius:20px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.chips span{display:inline-flex;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:7px 10px;font-size:12px;font-weight:1000}.actions{display:flex;flex-wrap:wrap;gap:8px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:14px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:760px;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:middle}.miniBar{height:9px;background:#eef2f7;border-radius:999px;overflow:hidden;min-width:110px}.miniBar span{display:block;height:100%;border-radius:999px;background:#16a34a}.miniBar span.warn{background:#f59e0b}.miniBar span.bad{background:#ef4444}.recList{display:grid;gap:8px;list-style:none;margin:0;padding:0}.recList li{display:grid;grid-template-columns:1fr auto;gap:6px;border:1px solid #e8edf4;border-radius:16px;padding:12px}.recList span{color:#64748b;font-size:13px}.recList strong{grid-row:1/3;grid-column:2;font-size:18px}.kakaoBox{background:#fefce8;border:1px solid #fde68a;border-radius:18px;padding:14px;color:#713f12;line-height:1.6}.muted{color:#64748b;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}.filters{grid-template-columns:minmax(0,1fr)}.metric b{font-size:21px}.recList li{grid-template-columns:1fr}.recList strong{grid-row:auto;grid-column:auto}}</style></head><body>${renderUnifiedNav("budget-alerts", { month, householdId: selectedHousehold.id, householdName: selectedHousehold.name, role: String(selectedHousehold.role || "") })}<main class="wrap"><section class="hero"><p>${renderBudgetAlertStatusPill(model.status)}</p><h1>예산 알림 센터</h1><p>${escapeHtml(model.statusMessage)}</p><form class="filters" method="get" action="/budget-alerts"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>오늘 사용 가능</span><b>${escapeHtml(allowanceText)}</b></div><div class="metric"><span>월 전체 등록액</span><b>${numberWithCommas(model.spent)}원</b>${model.budget.uncoveredExpense ? `<small style="display:block;color:#64748b;margin-top:3px">예산 잡은 분류 기준 · 예산 밖 지출 ${numberWithCommas(model.budget.uncoveredExpense)}원 별도</small>` : ""}${refundNote ? `<small style="display:block;color:#64748b;margin-top:3px">${escapeHtml(refundNote)}</small>` : ""}</div><div class="metric"><span>남은 예산</span><b>${model.totalBudget ? numberWithCommas(model.remainingBudget) + "원" : "미설정"}</b></div><div class="metric"><span>${model.pastMonth ? "월 전체 실적" : "월말 예상 지출"}</span><b>${escapeHtml(observationMoney(model.forecastExpense))}</b><small>하루 평균 ${escapeHtml(observationMoney(model.avgDaily))}</small></div><div class="metric"><span>예산 사용률</span><b>${model.totalBudget ? numberWithCommas(model.rate) + "%" : "-"}</b></div><div class="metric"><span>고정지출 대기</span><b>${model.pendingRecurringTotal == null ? "판단 보류" : numberWithCommas(model.pendingRecurringTotal) + "원"}</b></div></section><section class="card"><h2>선택 월 예산 판단</h2><p class="muted">등록액·잔여 예산·분류별 사용액은 미래 날짜 기록을 포함한 월 전체 기준입니다. 월말 예상은 오늘까지 기록에 남은 고정지출·정기지출과 남은 날 예상(오늘까지 변동 지출의 하루 평균 × 남은 날)을 더한 값이며, 앞 날짜로 미리 적은 일반 지출은 더하지 않습니다. 과거 월은 월 전체 실적으로 표시합니다.</p><div class="notice"><b>${escapeHtml(model.statusText)}</b><br/>${model.pastMonth ? "월 전체 실적 · " : ""}${escapeHtml(forecastLabel.replace(/초과 예상/g, model.pastMonth ? "초과" : "초과 예상").replace(/여유 예상/g, model.pastMonth ? "여유" : "여유 예상"))}${outlookBreakdown ? ` · ${escapeHtml(outlookBreakdown)}` : ""}<div class="chips">${topWarn}</div></div></section><section class="card"><h2>분류별 초과/주의</h2><div class="tableWrap"><table><thead><tr><th>분류</th><th>예산</th><th>사용</th><th>남음</th><th>게이지</th><th>상태</th></tr></thead><tbody>${renderBudgetAlertRows(model)}</tbody></table></div></section><section class="card"><h2>남은 고정지출·정기지출 확인</h2>${renderPendingRecurringList(model)}</section><section class="card"><h2>카카오 안내 문구</h2><div class="kakaoBox">${escapeHtml(budgetAlertKakaoHint(model))}<br/><br/>추천 발화: <b>남은 예산</b>, <b>예산 현황</b>, <b>정기지출</b></div></section><section class="card"><h2>바로가기</h2><div class="actions"><a class="btn" href="${escapeHtml(appHref)}#quick">기록 입력</a><a class="btn light" href="${escapeHtml(budgetHref)}">예산 설정</a><a class="btn light" href="${escapeHtml(recurringHref)}">정기 수입·지출</a><a class="btn light" href="/budget-alert-guide">알림 기준</a></div></section></main></body></html>`;
}

async function handleBudgetAlertGuidePage(request, env, url) {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 예산 알림 가이드</title><script src="${ACCOUNTBOOK_THEME_JS_ASSET_PATH}"></script><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:960px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#b45309));color:#fff}.hero p{color:#ffedd5;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px}.box p{color:#64748b;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}code{color:#111827}html[data-ab-resolved-theme="dark"] body{background:#141519;color:#edeff3}html[data-ab-resolved-theme="dark"] .box,html[data-ab-resolved-theme="dark"] .hero{background:#1e2026;border-color:#3b475a;color:#edeff3}html[data-ab-resolved-theme="dark"] .box p{color:#aeb6c8}html[data-ab-resolved-theme="dark"] code{color:#edeff3}</style></head><body><main class="wrap"><section class="hero"><h1>예산 알림 가이드</h1><p>예산 알림은 사용자를 재촉하는 기능이 아니라 오늘 얼마나 써도 되는지 알려주는 생활 안내판입니다.</p><p><a class="btn" href="/budget-alerts">예산 알림 센터</a></p></section><section class="grid"><div class="box"><h2>오늘 사용 가능</h2><p>남은 예산을 남은 날짜로 나눠 계산합니다. 이번 달 예산을 넘기지 않기 위한 하루 기준 금액입니다.</p></div><div class="box"><h2>월말 예상</h2><p>오늘까지 기록에 남은 고정지출·정기지출 납부와 남은 날 예상(오늘까지 변동 지출의 하루 평균 × 남은 날)을 더해 계산합니다. 이미 적힌 고정지출은 하루 평균에 넣지 않습니다.</p></div><div class="box"><h2>고정지출 반영 예정</h2><p>아직 이번 달에 반영되지 않은 고정지출과 납부일이 남은 정기지출을 목록으로 보여 주고 월말 예상에 넣습니다.</p></div><div class="box"><h2>초과/주의 분류</h2><p>분류별 예산 대비 85% 이상이면 주의, 100% 이상이면 초과로 표시합니다.</p></div></section><section class="card"><h2>운영 기준</h2><p>이 화면은 기존 거래 저장 로직과 권한 구조를 바꾸지 않습니다. 로그인 사용자는 자신이 참여한 가계부 범위 안에서만 예산 알림을 볼 수 있습니다.</p></section></main></body></html>`);
}

function settlementRoleAllowed(role = "") {
  return !["blocked"].includes(String(role || "").toLowerCase());
}

// V22.9.76 감사 D-20: 조회 전용(viewer)은 기록할 수 없는데도 정산의 1/N 부담자로 들어가 늘 "보낼 금액"이 생겼다.
// 기본 참여자에서 빼고, 이 달에 실제로 돈이 오간 경우(지출을 냈거나 환급을 받았을 때)에만 정산에 넣는다.
function settlementBaseParticipant(member = {}) {
  const role = String(member?.role || "member").toLowerCase();
  return Boolean(member?.user_id) && settlementRoleAllowed(role) && role !== "pending" && role !== "viewer";
}

function buildSettlementModel(rows = [], members = [], options = {}) {
  const memberMap = memberNameMap(members);
  // V22.9.76 감사 D-20: 나간 사람은 모두 "이전 구성원"으로 같아져 정산 표와 송금 제안에서 누가 누구인지 알 수 없었다.
  // 기록 목록과 같은 조회(fetchFormerSpenderMembers)로 받은 사용자 이름을 쓰고, 이름을 모르면 번호를 붙여 구분한다.
  const formerMap = memberNameMap(safeArray(options.formerMembers));
  const participantIds = new Set();
  for (const m of safeArray(members)) {
    if (settlementBaseParticipant(m)) participantIds.add(m.user_id);
  }
  const paidBy = Object.create(null);
  const expenseRows = [];
  let totalExpense = 0;
  let unknownPaid = 0;
  for (const row of safeArray(rows)) {
    if (row.type === "income") continue;
    const amount = Math.round(Number(row.amount || 0));
    if (!Number.isFinite(amount) || amount <= 0) continue;
    const uid = String(row.user_id || "").trim() || "__unknown";
    if (uid === "__unknown") { unknownPaid += amount; continue; }
    totalExpense += amount;
    expenseRows.push({ ...row, amount, user_id: uid });
    paidBy[uid] = (paidBy[uid] || 0) + amount;
    participantIds.add(uid);
  }
  // V22.9.79 D-5: 환불 연결 플래그가 켜지면 표에 저장한 연결(refundNetting, domain/refund-links.js)로 뺀다. 미리보기(refundLinks)는 그대로다.
  const refundAdjustments = options.refundLinks?.length ? validateSettlementRefundLinks(rows, members, options) : (options.refundNetting || null);
  const grossExpense = totalExpense;
  if (refundAdjustments) {
    totalExpense -= refundAdjustments.total;
    for (const [id, amount] of refundAdjustments.received) { paidBy[id] = (paidBy[id] || 0) - amount; participantIds.add(id); }
  }
  const ids = [...participantIds];
  const participantCount = Math.max(1, ids.length || 1);
  const mode = ["equal", "ratio", "headcount", "item"].includes(String(options.mode || "")) ? String(options.mode) : "equal";
  const weights = Object.create(null);
  for (const id of ids) {
    const raw = mode === "equal" || mode === "item" ? 1 : Number(options.weights?.[id] || 1);
    weights[id] = Math.max(0.1, Math.min(1000, Number.isFinite(raw) ? raw : 1));
  }
  const owedBy = Object.fromEntries(ids.map((id) => [id, 0]));
  const allocate = (amount, selectedIds, selectedWeights = {}) => {
    const targets = selectedIds.filter((id) => ids.includes(id));
    if (!targets.length) return;
    const sumWeight = targets.reduce((sum, id) => sum + Number(selectedWeights[id] || 1), 0) || targets.length;
    let allocated = 0;
    targets.forEach((id, index) => {
      const value = index === targets.length - 1 ? amount - allocated : Math.floor(amount * Number(selectedWeights[id] || 1) / sumWeight);
      owedBy[id] = (owedBy[id] || 0) + value;
      allocated += value;
    });
  };
  if (mode === "item") {
    for (const row of expenseRows) {
      const selected = safeArray(options.itemParticipants?.[row.id]).map(String).filter((id) => ids.includes(id));
      allocate(row.amount - (refundAdjustments?.byExpense.get(String(row.id)) || 0), selected.length ? selected : ids, Object.fromEntries(ids.map((id) => [id, 1])));
    }
    // 원래 지출이 이 달 정산 행에 없으면(지난달 지출의 환불) 그 몫을 모든 참여자에게 똑같이 나눠 뺀다.
    if (options.refundNetting && !options.refundLinks?.length) {
      const itemIds = new Set(expenseRows.map((row) => String(row.id)));
      for (const [expenseId, amount] of options.refundNetting.byExpense) if (!itemIds.has(expenseId)) allocate(-amount, ids, Object.fromEntries(ids.map((id) => [id, 1])));
    }
  } else {
    allocate(totalExpense, ids, weights);
  }
  const share = Math.round(totalExpense / participantCount);
  const departedIds = ids.filter((id) => !memberMap[id]);
  const departedName = (id) => formerMap[id] ? `${formerMap[id]}(나간 구성원)` : departedIds.length > 1 ? `이전 구성원 ${departedIds.indexOf(id) + 1}` : "이전 구성원";
  const people = ids.map((id) => {
    const paid = Math.round(paidBy[id] || 0);
    const personShare = Math.round(owedBy[id] || 0);
    const balance = paid - personShare;
    return { user_id: id, name: memberMap[id] || departedName(id), paid, share: personShare, balance, weight: weights[id] || 1 };
  }).sort((a, b) => b.paid - a.paid);
  const creditors = people.filter((p) => p.balance > 0).map((p) => ({ ...p, remain: p.balance })).sort((a,b)=>b.remain-a.remain);
  const debtors = people.filter((p) => p.balance < 0).map((p) => ({ ...p, remain: -p.balance })).sort((a,b)=>b.remain-a.remain);
  const transfers = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const amount = Math.min(debtors[i].remain, creditors[j].remain);
    if (amount > 0) transfers.push({ from: debtors[i].name, to: creditors[j].name, amount: Math.round(amount) });
    debtors[i].remain -= amount;
    creditors[j].remain -= amount;
    if (debtors[i].remain <= 0) i++;
    if (creditors[j].remain <= 0) j++;
  }
  return { ...(refundAdjustments ? {grossExpense,refundTotal:refundAdjustments.total} : {}), mode, totalExpense, participantCount, share, people, transfers, unknownPaid, itemCount: expenseRows.length };
}

function renderTemplateCreateForm(title, description, suggestedName, emoji, templateKey = "") {
  const href = `/my/households?template=${encodeURIComponent(templateKey)}&suggested_name=${encodeURIComponent(suggestedName)}#create`;
  return `<article class="tmpl"><div class="emoji">${escapeHtml(emoji)}</div><b>${escapeHtml(title)}</b><p>${escapeHtml(description)}</p><small>추천 이름: ${escapeHtml(suggestedName)}</small><a class="templateStart" href="${escapeHtml(href)}">이름·비밀번호 확인 후 만들기</a></article>`;
}

async function handleReleaseCandidateCheckPage(request, env, url) {
  const blocked = await redirectPublicAwayFromAdmin(request, env, "/my");
  if (blocked) return blocked;
  const checks = [
    ["사업자 정보 하단 푸터", true, "도담 네트워크 / 729-24-02288 / 경기도 평택시 신촌3로 12"],
    ["/my 첫 진입", true, "로그인 또는 기존 세션 기준 사용자 홈 진입"],
    ["/app 모바일 입력", true, "V19.5.6 이후 상단 헤더 안정화 유지"],
    ["/my/households 실제 경로", true, "가계부 전환·새 가계부 만들기·초대코드 참여 화면"],
    ["/households 사용자 관리", true, "참여자 관리 화면에도 생성/참여 폼 보강"],
    ["권한 범위", true, "owner/admin/member/viewer/pending/blocked 구조 유지"],
    ["중복/트래픽 방어", true, "V20.2 중복 저장·반복 발화 방어 유지"],
    ["예산 알림", true, "오늘 예산·월말 예상·정기지출 예정 안내 유지"],
    ["카카오 단톡방/OpenBuilder", true, "V20.5 안내/점검 경로 유지"],
    ["베타 UX 가이드", true, "V20.6 사용자 폴리시 가이드 유지"],
  ];
  const rows = checks.map(([name, ok, detail]) => `<tr><td>${escapeHtml(name)}</td><td><span class="${ok ? "okb" : "badb"}">${ok ? "준비" : "확인"}</span></td><td>${escapeHtml(detail)}</td></tr>`).join("");
  const links = [["사용자 홈","/my"],["모바일 앱","/app"],["가계부 전환·추가","/my/households"],["생성·참여 가이드","/household-create-join"],["참여자 관리","/households"],["심사 준비","/review-ready"],["베타 체크","/beta-checklist"],["운영 대시보드","/ops-dashboard"],["중복 방어","/ops-duplicates"],["카카오 발화","/openbuilder-final"]].map(([a,b]) => `<a class="link" href="${escapeHtml(b)}"><b>${escapeHtml(a)}</b><span>${escapeHtml(b)}</span></a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 릴리스 후보 점검</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.6}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:10px}.link{display:block;text-decoration:none;color:#111827;background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:14px}.link span{display:block;color:#64748b;margin-top:5px;font-size:12px}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.okb,.badb{display:inline-flex;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:1000}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.note{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><h1>릴리스 후보 점검</h1><p>${escapeHtml(APP_VERSION)} 기준으로 심사·베타·운영·가계부 생성/참여 흐름을 최종 확인합니다.</p><p><a class="btn" href="/operation-center">운영센터</a><a class="btn" href="/deployment-check">배포점검</a></p></section><section class="card"><h2>최종 확인 항목</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>핵심 경로 바로가기</h2><div class="grid">${links}</div></section><section class="card"><h2>이번 후보판 기준</h2><div class="note">이번 단계는 핵심 저장 로직과 Supabase 구조를 변경하지 않고, 실제 누락되었던 /my/households 진입 경로와 가계부 생성·초대코드 참여 화면을 명확히 노출하는 것을 포함합니다.</div></section></main></body></html>`);
}

async function handleHouseholdCreateJoinGuidePage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const households = userId ? await fetchUserHouseholds(env, userId) : [];
  const rows = households.map((h) => {
    const readable = canReadMyHousehold(h.role);
    const invite = canManageMyHousehold(h.role) && h.invite_code ? `가계부 참여 ${h.invite_code}` : h.role === "pending" ? "승인 대기" : h.role === "blocked" ? "이용 제한" : "관리자만 확인";
    const action = readable ? `<a href="/app?household_id=${encodeURIComponent(h.id)}">열기</a>` : `<a href="/my?household_id=${encodeURIComponent(h.id)}">상태</a>`;
    return `<tr><td>${escapeHtml(h.name || "가계부")}</td><td>${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</td><td>${escapeHtml(invite)}</td><td>${action}</td></tr>`;
  }).join("") || `<tr><td colspan="4">로그인 후 /my/households에서 새 가계부를 만들거나 초대코드로 참여할 수 있습니다.</td></tr>`;
  const login = userId ? `<a class="btn" href="/my/households">내 가계부 전환·추가</a>` : `<a class="btn" href="/my">로그인하고 시작</a>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 가계부 생성·참여 가이드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1040px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.step{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px}.step p{color:#64748b;line-height:1.55}.btn,.step a,td a{display:inline-flex;align-items:center;justify-content:center;min-height:38px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.soft{background:#eef2f7!important;color:#111827!important}.tableWrap{overflow:auto}table{width:100%;border-collapse:collapse;min-width:720px}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.note{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body><main class="wrap"><section class="hero"><h1>가계부 생성·참여 흐름</h1><p>한 사용자가 여러 가계부를 만들거나 참여할 수 있습니다. 우리집 장부, 여행 장부, 모임비 장부를 나눠도 모든 조회는 내가 참여한 가계부 범위 안에서만 열립니다.</p><p>${login}<a class="btn soft" href="/households">참여자 관리</a></p></section><section class="grid"><div class="step"><h2>1. 새 가계부 만들기</h2><p>/my/households에서 이름을 입력하면 owner 권한의 새 가계부가 만들어집니다.</p><a href="/my/households">만들기</a></div><div class="step"><h2>2. 초대코드 공유</h2><p>선택 가계부의 “가계부 참여 코드” 문구를 가족/모임원에게 보냅니다.</p><a href="/my/households">초대코드 확인</a></div><div class="step"><h2>3. 다른 가계부 참여</h2><p>받은 초대코드를 /my/households 또는 /my 첫 화면에 입력해 참여합니다.</p><a href="/my/households">참여하기</a></div><div class="step"><h2>4. 권한 정리</h2><p>owner/admin은 참여자 화면에서 member/viewer/pending/blocked를 조정합니다.</p><a href="/households">권한 관리</a></div></section><section class="card"><h2>내 참여 가계부</h2><div class="tableWrap"><table><thead><tr><th>가계부</th><th>권한</th><th>초대 문구</th><th>진입</th></tr></thead><tbody>${rows}</tbody></table></div></section><section class="card"><h2>운영 원칙</h2><div class="note">새 가계부 생성과 초대코드 참여는 /my/create, /my/join 기존 안전 흐름을 사용합니다. viewer는 입력/수정/삭제가 제한되고, member는 자기 기록 중심, owner/admin은 전체 관리 기준을 유지합니다.</div></section></main></body></html>`);
}

async function handleMeetingHouseholdTemplatePage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = userId ? (await fetchUserHouseholds(env, userId)).filter((h) => canReadMyHousehold(h.role)) : [];
  // V22.9.80 T-21: 이 화면의 내비는 가계부 id 없이 그려져 참여자·단톡방 링크가 첫 가계부(households[0], getMySelectedHousehold 의 기본값)로 간다 — 그 역할을 넘긴다(추가 읽기 없음).
  const hhRows = households.length ? households.map((h) => `<tr><td>${escapeHtml(h.name || "가계부")}</td><td>${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</td><td><a class="mini" href="/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">정산</a> <a class="mini light" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">기록</a></td></tr>`).join("") : `<tr><td colspan="3">로그인 후 내가 참여한 가계부가 표시됩니다.</td></tr>`;
  const templates = [
    ["여행 가계부", "숙소·식비·교통비를 참여자별로 기록하고 마지막에 1/N 정산합니다.", "우리 여행 경비", "✈️", "travel"],
    ["모임비 가계부", "정기 모임 회비, 식사, 장소 대관비를 따로 관리합니다.", "우리 모임 회비", "🍻", "meeting"],
    ["단발성 정산", "하루 행사나 공동구매처럼 짧게 쓰고 종료 후 보관합니다.", "단발성 정산", "🧾", "settlement"],
    ["가족 외식/행사", "가족 모임 지출을 기존 생활비와 분리해 확인합니다.", "가족 행사비", "👨‍👩‍👧‍👦", "family_event"],
  ].map((x) => renderTemplateCreateForm(...x)).join("");
  const loginHint = userId ? `<a class="btn" href="/my/households">가계부 전환·추가</a>` : `<a class="btn" href="/my">로그인하고 만들기</a>`;
  // V22.9.80 T-31: 다크 모드에서 서식 카드(.tmpl)와 운영 흐름 칸(.step)이 흰 바탕(#fff·#f8fafc)에 밝은 글씨(1.10~1.15:1)였다. 셸 다크 규칙은 .card 안의
  // 글씨를 밝게(color:inherit!important) 바꾸지만 이 두 칸의 바탕은 모르기 때문이다. 바탕·선만 다크 토큰으로 바꾼다(글씨는 셸이 이미 밝다).
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 모임·여행 가계부</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1080px;margin:0 auto;padding:16px 16px 110px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0891b2));color:#fff}.hero p{color:#cffafe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.tmpl{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:17px;display:grid;gap:8px}.tmpl .emoji{font-size:32px}.tmpl b{font-size:18px}.tmpl p,.muted{color:#64748b;line-height:1.6}.tmpl small{color:#475569;font-weight:900}.templateStart,.btn,.mini{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px;cursor:pointer}.mini{min-height:32px;font-size:12px}.mini.light,.btn.light{background:#eff6ff;color:#1e3a8a!important}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.step{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px;font-weight:900}html[data-ab-resolved-theme="dark"] :is(.tmpl,.step){background:var(--ab12-surface-raised,#282b33);border-color:var(--ab12-line,#3b475a)}@media(max-width:760px){.wrap{padding:12px 10px 120px}.hero h1{font-size:25px}.grid{grid-template-columns:1fr}.card{padding:16px;border-radius:19px}}</style></head><body>${renderUnifiedNav("households", { month, role: String(households[0]?.role || "") })}<main class="wrap"><section class="hero"><h1>모임·여행 가계부</h1><p>템플릿은 분류와 진행 순서를 제안할 뿐 이름을 날짜로 확정하지 않습니다. 다음 화면에서 가계부 이름과 이 가계부에서 보일 내 이름만 확인한 뒤 생성합니다.</p><p>${loginHint} <a class="btn light" href="/settlement-summary?month=${encodeURIComponent(month)}">정산 요약</a> <a class="btn light" href="/meeting-archive">보관 가이드</a></p></section><section class="card"><h2>빠른 템플릿</h2><div class="grid">${templates}</div></section><section class="card"><h2>운영 흐름</h2><div class="steps"><div class="step">1. 가계부 이름·내 표시 이름</div><div class="step">2. 가계부 생성</div><div class="step">3. 초대코드 공유</div><div class="step">4. 참여자별 기록·정산</div><div class="step">5. 백업 후 보관 또는 삭제</div></div></section><section class="card"><h2>내가 참여한 가계부</h2><table><thead><tr><th>가계부</th><th>권한</th><th>바로가기</th></tr></thead><tbody>${hhRows}</tbody></table></section></main></body></html>`);
}

function renderSettlementRows(model) {
  if (!model.people.length) return `<tr><td colspan="4">정산할 참여자 또는 지출 기록이 없습니다.</td></tr>`;
  return model.people.map((p) => {
    const cls = p.balance > 0 ? "plus" : p.balance < 0 ? "minus" : "zero";
    const label = p.balance > 0 ? `받을 금액 ${numberWithCommas(p.balance)}원` : p.balance < 0 ? `보낼 금액 ${numberWithCommas(Math.abs(p.balance))}원` : "정산 차액 없음";
    return `<tr><td><b>${escapeHtml(p.name)}</b></td><td>${numberWithCommas(p.paid)}원</td><td>${numberWithCommas(p.share)}원</td><td class="${cls}">${label}</td></tr>`;
  }).join("");
}

function renderTransferRows(transfers = []) {
  if (!transfers.length) return `<tr><td colspan="3">송금 제안이 없습니다. 이미 균등하거나 지출 기록이 부족합니다.</td></tr>`;
  return transfers.map((t) => `<tr><td>${escapeHtml(t.from)}</td><td>${escapeHtml(t.to)}</td><td><b>${numberWithCommas(t.amount)}원</b></td></tr>`).join("");
}

async function handleSettlementSummaryPageLegacyV2265(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  const households = access.households;
  if (!households.length) return redirectResponse("/my?err=household_required");
  const selected = access.selected;
  if (!selected) return redirectResponse("/my?err=no_household");
  const members = await fetchHouseholdMembers(env, selected.id);
  const rows = await fetchAdminRows(env, { month, householdId: selected.id, type: "expense" });
  const model = buildSettlementModel(rows, members);
  const opts = households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}" ${String(h.id)===String(selected.id)?"selected":""}>${escapeHtml(h.name || "가계부")} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const shareText = model.totalExpense ? `${numberWithCommas(model.share)}원` : "-";
  const inviteText = canManageMyHousehold(selected.role) && selected.invite_code ? `가계부 참여 ${selected.invite_code}` : "초대코드는 소유자·관리자만 확인할 수 있습니다.";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 정산 요약</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.65}.filters{display:grid;grid-template-columns:1fr 160px 100px;gap:8px}.filters select,.filters input,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:720px;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:middle}.plus{color:#166534;font-weight:1000}.minus{color:#b91c1c;font-weight:1000}.zero{color:#64748b;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.copy{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:13px;line-height:1.6}.muted{color:#64748b;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.filters{grid-template-columns:1fr}.metric b{font-size:21px}}</style></head><body>${renderUnifiedNav("settlement", { month, householdId: selected.id, householdName: selected.name, role: String(selected.role || "") })}<main class="wrap"><section class="hero"><h1>정산 요약</h1><p>${escapeHtml(selected.name || "가계부")}의 ${escapeHtml(month)} 지출을 참여자별로 1/N 기준 정리합니다. 실제 송금 전에는 참여자와 금액을 반드시 확인하세요.</p><form class="filters" method="get" action="/settlement-summary"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>총 지출</span><b>${numberWithCommas(model.totalExpense)}원</b></div><div class="metric"><span>참여자</span><b>${numberWithCommas(model.participantCount)}명</b></div><div class="metric"><span>1인 부담 기준</span><b>${shareText}</b></div><div class="metric"><span>지출 건수</span><b>${numberWithCommas(rows.length)}건</b></div></section><section class="card"><h2>참여자별 정산</h2><div class="tableWrap"><table><thead><tr><th>참여자</th><th>낸 금액</th><th>1/N 기준</th><th>정산 상태</th></tr></thead><tbody>${renderSettlementRows(model)}</tbody></table></div></section><section class="card"><h2>송금 제안</h2><div class="tableWrap"><table><thead><tr><th>보낼 사람</th><th>받을 사람</th><th>금액</th></tr></thead><tbody>${renderTransferRows(model.transfers)}</tbody></table></div><p class="muted">계산 방식은 단순 1/N입니다. 회비, 제외 인원, 개인별 부담 비율은 실제 모임 규칙에 맞게 확인하세요.</p></section><section class="card"><h2>공유 문구</h2><div class="copy">${escapeHtml(selected.name || "가계부")} 정산 요약<br/>총 지출: ${numberWithCommas(model.totalExpense)}원<br/>참여자: ${numberWithCommas(model.participantCount)}명<br/>1인 기준: ${shareText}<br/>초대/참여 문구: ${escapeHtml(inviteText)}</div><p><a class="btn" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}#quick">기록 추가</a><a class="btn light" href="/meeting-households?month=${encodeURIComponent(month)}">템플릿</a><a class="btn light" href="/meeting-archive">보관 가이드</a></p></section></main></body></html>`);
}

function settlementHistoryKey(householdId = "") {
  return `settlement_history:${String(householdId || "").trim()}`.slice(0, 180);
}

async function handleSettlementHistorySave(request, env) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const form = await request.formData();
  const householdId = String(form.get("household_id") || "").trim();
  const month = validMonth(String(form.get("month") || "")) || currentMonthKst();
  const rawMode = String(form.get("mode") || "");
  const mode = ["equal", "ratio", "headcount", "item"].includes(rawMode) ? rawMode : "equal";
  const returnTo = `/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(householdId)}&mode=${encodeURIComponent(mode)}`;
  const { selected } = await getMySelectedHousehold(env, userId, householdId);
  if (!selected || String(selected.id) !== householdId) return redirectResponse("/my?err=no_household");
  if (!canManageMyHousehold(selected.role)) return redirectResponse(`${returnTo}&err=manage_required`);
  if (String(form.get("confirmed") || "") !== "yes") return redirectResponse(`${returnTo}&err=confirmation_required`);
  if (rawMode !== mode) return redirectResponse(`${returnTo}&err=invalid_mode`);
  let backTo = returnTo;
  try {
    const rows = await fetchAdminRows(env, { month, householdId: selected.id, type: "expense" });
    const members = await fetchHouseholdMembers(env, selected.id);
    // V22.9.34 2차 점검 B11: 완료 폼이 실어 온 비율·인원수·품목별 조건으로 다시 계산한다. 예전에는 조건 없이
    // 다시 계산해 2:1 비율·품목별 부담이 모두 1:1 로 저장됐다. 화면을 연 뒤 기록이 바뀌었으면 저장하지 않는다.
    const conditions = parseSettlementConditions(form, members, rows);
    backTo = `${returnTo}${settlementConditionQuery(mode, conditions)}`;
    const formerMembers = await fetchFormerSpenderMembers(env, rows, members);
    const model = buildSettlementModel(rows, members, { mode, ...conditions, formerMembers });
    const digest = await settlementPreviewDigest({ month, mode, conditions, rows });
    const submittedDigest = String(form.get("preview_digest") || "").trim();
    if (submittedDigest && submittedDigest !== digest) return redirectResponse(`${backTo}&err=settlement_changed`);
    const note = String(form.get("note") || "").trim().slice(0, 160);
    // 정산 이력은 JSON 한 행을 읽고 다시 쓴다. 가계부 설정 잠금(가계부 삭제와 같은 잠금, 감사 S9)으로
    // 서로 다른 완료 요청까지 직렬화해 이력 유실과 중복을 함께 막고, 지운 가계부에 이력을 되살리지 않는다.
    const outcome = await withHouseholdSettingsRmw(env, selected.id, async ({ assertFresh }) => {
      const history = parseJsonArraySettingStrict(await getSettingValueStrict(env, settlementHistoryKey(selected.id)), "settlement_history_json_invalid");
      const duplicate = history.some((item) => {
        const completedAt = Date.parse(String(item.completed_at || ""));
        const recent = Number.isFinite(completedAt) && Date.now() - completedAt >= 0 && Date.now() - completedAt < 5 * 60 * 1000;
        return recent && item.month === month && item.mode === mode && Number(item.total_expense || 0) === Number(model.totalExpense || 0) && String(item.note || "") === note && String(item.completed_by || "") === String(userId) && (!item.rows_digest || item.rows_digest === digest);
      });
      if (duplicate) return "duplicate";
      history.push({
        id: crypto.randomUUID(),
        schema_version: 2,
        month,
        mode,
        conditions,
        total_expense: model.totalExpense,
        participant_count: model.participantCount,
        shares: model.people.map((person) => ({ user_id: person.user_id, name: person.name, paid: person.paid, share: person.share, balance: person.balance })),
        transfers: model.transfers,
        rows_digest: digest,
        note,
        completed_by: userId,
        completed_at: new Date().toISOString(),
        status: "completed",
      });
      assertFresh();
      await saveSettingValue(env, settlementHistoryKey(selected.id), history.slice(-30));
      return "saved";
    });
    return redirectResponse(`${backTo}&msg=${outcome === "duplicate" ? "settlement_already_completed" : "settlement_completed"}`);
  } catch (err) {
    rememberOpsEvent({ kind: "settlement_history_save_failed", severity: "warn", path: "/my/settlement/save", method: "POST", detail: safeError(err) });
    if (/settings_rmw_busy/.test(safeError(err))) return redirectResponse(`${backTo}&err=settlement_busy`);
    return redirectResponse(`${backTo}&err=settlement_save_failed`);
  }
}

// V22.9.34 2차 점검 B11: 미리보기 화면과 완료 저장이 같은 규칙으로 비율·인원수(weight_<참여자>)와
// 품목별 참여자(item_<기록>)를 읽는다. 값이 없는 참여자는 1, 고른 사람이 없는 품목은 전체 참여자다.
function parseSettlementConditions(params, members = [], rows = []) {
  const weights = Object.create(null);
  for (const member of safeArray(members)) {
    const raw = params.get(`weight_${member.user_id}`);
    if (raw === null || raw === undefined || String(raw).trim() === "") continue;
    const value = Number(raw);
    if (Number.isFinite(value)) weights[member.user_id] = Math.max(0.1, Math.min(1000, value));
  }
  const itemParticipants = Object.create(null);
  for (const row of safeArray(rows).slice(0, 40)) {
    const picked = params.getAll(`item_${row.id}`).map((value) => String(value || "").trim()).filter(Boolean);
    if (picked.length) itemParticipants[row.id] = picked;
  }
  return { weights, itemParticipants };
}

function settlementConditionPairs(mode, conditions = {}) {
  const pairs = [];
  if (mode === "ratio" || mode === "headcount") {
    for (const [id, weight] of Object.entries(conditions.weights || {})) pairs.push([`weight_${id}`, String(weight)]);
  }
  if (mode === "item") {
    for (const [rowId, ids] of Object.entries(conditions.itemParticipants || {})) for (const id of ids) pairs.push([`item_${rowId}`, String(id)]);
  }
  return pairs;
}

function settlementConditionQuery(mode, conditions = {}) {
  return settlementConditionPairs(mode, conditions).map(([key, value]) => `&${encodeURIComponent(key)}=${encodeURIComponent(value)}`).join("");
}

// 화면을 그릴 때와 완료할 때의 조건·기록이 같은지 대조하는 지문이다.
async function settlementPreviewDigest({ month, mode, conditions = {}, rows = [] }) {
  const canonical = JSON.stringify([
    month,
    mode,
    settlementConditionPairs(mode, conditions).sort(),
    safeArray(rows).filter((row) => row.type !== "income").map((row) => [String(row.id), Math.round(Number(row.amount || 0)), String(row.user_id || "")]).sort(),
  ]);
  return (await sha256Hex(canonical)).slice(0, 32);
}

function renderSettlementConfig({ mode = "equal", members = [], rows = [], weights = {}, itemParticipants = {}, month = currentMonthKst(), householdId = "" }) {
  // V22.9.76 감사 D-20: 정산 계산과 같은 참여자만 보여 준다(조회 전용은 이 달에 지출을 냈을 때만).
  const paidIds = new Set(safeArray(rows).filter((row) => row.type !== "income" && Number(row.amount || 0) > 0 && row.user_id).map((row) => String(row.user_id)));
  const activeMembers = safeArray(members).filter((m) => settlementBaseParticipant(m) || (String(m.role || "").toLowerCase() === "viewer" && paidIds.has(String(m.user_id || ""))));
  const hidden = `<input type="hidden" name="household_id" value="${escapeHtml(householdId)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="mode" value="${escapeHtml(mode)}"/>`;
  if (mode === "equal") return `<div class="note">모든 참여자가 같은 금액을 부담합니다. 총액의 원 단위 나머지는 마지막 참여자에게 자동 보정됩니다.</div>`;
  if (mode === "ratio" || mode === "headcount") {
    const label = mode === "ratio" ? "부담 비율" : "적용 인원수";
    const fields = activeMembers.map((m) => `<label class="weight"><span>${escapeHtml(m.nickname || "구성원")}</span><input type="number" name="weight_${escapeHtml(m.user_id)}" min="0.1" max="1000" step="0.1" value="${escapeHtml(weights[m.user_id] || 1)}"/><small>${label}</small></label>`).join("");
    return `<form method="get" action="/settlement-summary">${hidden}<div class="weightGrid">${fields}</div><button type="submit">${label}로 다시 계산</button></form>`;
  }
  const memberMap = memberNameMap(members);
  const items = safeArray(rows).slice(0, 40).map((row) => {
    const selected = safeArray(itemParticipants[row.id]);
    const hasSelection = selected.length > 0;
    const checks = activeMembers.map((m) => `<label><input type="checkbox" name="item_${escapeHtml(row.id)}" value="${escapeHtml(m.user_id)}"${!hasSelection || selected.includes(String(m.user_id)) ? " checked" : ""}/> ${escapeHtml(m.nickname || "구성원")}</label>`).join("");
    return `<article class="itemSplit"><div><b>${escapeHtml(row.memo || row.raw_text || row.category || "지출")}</b><span>${escapeHtml(row.transaction_date || "")} · 결제 ${escapeHtml(memberMap[row.user_id] || "지출자 미지정")} · ${numberWithCommas(row.amount)}원</span></div><div class="checks">${checks}</div></article>`;
  }).join("") || `<p>분배할 지출 기록이 없습니다.</p>`;
  return `<form method="get" action="/settlement-summary">${hidden}<p class="note">각 지출을 함께 부담할 참여자를 선택하세요. 선택이 없는 항목은 전체 참여자에게 동일 분배됩니다.</p><div class="itemGrid">${items}</div>${rows.length > 40 ? `<p class="note">화면 성능을 위해 최근 표시 40건까지만 품목별 지정합니다. 나머지는 전체 참여자에게 동일 분배됩니다.</p>` : ""}<button type="submit">품목별 참여자로 다시 계산</button></form>`;
}

// V22.9.80(T-40): completed_at 은 new Date().toISOString() 으로 찍은 UTC 시각이라 앞 10글자를 그대로 보이면 한국 시각 00~09시에 끝낸 정산이
// 전날로 보였다. 시간대가 적힌 값만 한국 날짜로 바꿔 보인다(저장 값은 그대로, 시간대가 없는 옛 값은 예전처럼 앞 10글자).
function settlementCompletedDayKst(value) {
  const text = String(value || "");
  const ms = /(?:[zZ]|[+-][0-9]{2}:?[0-9]{2})$/.test(text) ? Date.parse(text) : NaN;
  return Number.isFinite(ms) ? new Date(ms + 32400000).toISOString().slice(0, 10) : text.slice(0, 10);
}

function renderSettlementHistory(history = []) {
  const rows = safeArray(history).slice().reverse().slice(0, 8);
  if (!rows.length) return `<p class="muted">완료 처리한 정산이 아직 없습니다.</p>`;
  return `<div class="tableWrap"><table><thead><tr><th>완료일</th><th>대상 월</th><th>방식</th><th>총 지출</th><th>부담액</th><th>메모</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(settlementCompletedDayKst(item.completed_at))}</td><td>${escapeHtml(item.month || "")}</td><td>${escapeHtml({ equal: "동일", ratio: "비율", headcount: "인원수", item: "품목별" }[item.mode] || item.mode || "동일")}</td><td>${numberWithCommas(item.total_expense)}원${Number(item.refund_total) > 0 ? ` (환불 ${numberWithCommas(item.refund_total)}원 뺌)` : ""}</td><td>${Array.isArray(item.shares) && item.shares.length ? item.shares.map((share) => `${escapeHtml(share.name || "구성원")} ${numberWithCommas(share.share)}원`).join(" · ") : "-"}</td><td>${escapeHtml(item.note || "-")}</td></tr>`).join("")}</tbody></table></div>`;
}

async function handleSettlementSummaryPage(request, env, url) {
  if (url.searchParams.get("refund_preview") === "1") return await handleSettlementRefundPreview(request,env,url);
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  if (!access.selected) return redirectResponse("/my?err=household_required");
  const selected = access.selected;
  // V22.9.79 D-5: 환불 연결 플래그가 켜지면 같은 달 환급 행까지 한 번에 읽어 연결을 붙인다. 정산 계산·지문·설정에는 지출 행만 쓴다.
  const refundLinksOn = refundLinksEnabled(env);
  const [members, monthRows, historyValue] = await Promise.all([fetchHouseholdMembers(env, selected.id), fetchAdminRows(env, { month, householdId: selected.id, type: refundLinksOn ? "all" : "expense" }), getSettingValue(env, settlementHistoryKey(selected.id))]);
  const rows = refundLinksOn ? monthRows.filter((row) => row.type === "expense") : monthRows;
  const refundState = refundLinksOn ? await loadRefundLinkMonthState(env, { householdId: selected.id, monthRows, withExpenses: true }) : null;
  const mode = ["equal", "ratio", "headcount", "item"].includes(String(url.searchParams.get("mode") || "")) ? String(url.searchParams.get("mode")) : "equal";
  // V22.9.34 2차 점검 B11: 완료 저장과 같은 규칙으로 조건을 읽고, 완료 폼에 조건과 미리보기 지문을 싣는다.
  const conditions = parseSettlementConditions(url.searchParams, members, rows);
  const { weights, itemParticipants } = conditions;
  const formerMembers = await fetchFormerSpenderMembers(env, refundState ? refundSettlementSpenderRows(rows, refundState) : rows, members);
  const model = buildSettlementModel(rows, members, { mode, weights, itemParticipants, formerMembers, ...(refundState?.netting ? { refundNetting: refundState.netting } : {}) });
  const previewDigest = refundState ? await settlementRefundDigest({ month, mode, conditions, rows, links: refundState.links }) : await settlementPreviewDigest({ month, mode, conditions, rows });
  const completionHidden = [...settlementConditionPairs(mode, conditions), ["preview_digest", previewDigest]].map(([key, value]) => `<input type="hidden" name="${escapeHtml(key)}" value="${escapeHtml(value)}"/>`).join("");
  const history = parseJsonSetting(historyValue, []);
  const opts = access.households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selected.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const modeOptions = [["equal", "동일 분배"], ["ratio", "비율 분배"], ["headcount", "인원수 분배"], ["item", "품목별 참여자"]].map(([value, label]) => `<option value="${value}"${mode === value ? " selected" : ""}>${label}</option>`).join("");
  const modeLabel = { equal: "동일 분배", ratio: "비율 분배", headcount: "인원수 분배", item: "품목별 분배" }[mode];
  const transferText = model.transfers.map((t) => `${t.from} → ${t.to} ${numberWithCommas(t.amount)}원`).join("\n") || "송금 제안 없음";
  const inviteText = canManageMyHousehold(selected.role) && selected.invite_code ? `가계부 참여 ${selected.invite_code}` : "초대코드는 소유자·관리자만 확인할 수 있습니다.";
  const canComplete = canManageMyHousehold(selected.role);
  // V22.9.79 D-5: 플래그가 켜지면 안내·연결 구역·완료 확인 문장을 환불 연결 기준으로 바꾼다(꺼지면 예전 문장 그대로).
  const refundParts = refundState ? settlementRefundPageParts({ state: refundState, model, month, householdId: selected.id, canManage: canComplete, history, members, url }) : null;
  const refundNotice = refundParts ? refundParts.notice : "환급 계산은 미리보기로만 제공합니다. 일반 정산 금액과 완료 이력에는 반영하지 않습니다.";
  const refundLink = refundParts?.linkHtml || (canComplete ? `<a href="/my/settlement/refund-preview?household_id=${encodeURIComponent(selected.id)}&month=${encodeURIComponent(month)}">환급 연결 미리보기</a>` : "소유자·관리자가 환급 미리보기를 확인할 수 있습니다.");
  const settlementMessage = url.searchParams.get("msg") || "";
  const message = settlementMessage === "settlement_completed"
    ? `<div class="ok">정산 완료 상태와 이력을 저장했습니다. ${refundNotice}</div>`
    : settlementMessage === "settlement_already_completed"
      ? `<div class="ok">같은 조건의 완료 이력이 이미 있어 중복 저장하지 않았습니다. ${refundNotice}</div>`
      : "";
  const settlementError = refundParts?.flashHtml && refundLinkMessage(url.searchParams.get("err") || "") ? "" : url.searchParams.get("err") || "";
  const error = settlementError === "settlement_busy"
    ? `<div class="error">다른 정산 저장이 진행 중입니다. 같은 버튼을 반복해서 누르지 말고 잠시 후 이력을 확인해 주세요.</div>`
    : settlementError === "settlement_changed"
      ? `<div class="error">화면을 연 뒤 이 달 지출 기록이 바뀌어 저장하지 않았습니다. 바뀐 기록으로 다시 계산된 금액을 확인한 뒤 완료해 주세요.</div>`
    : settlementError === "settlement_save_failed"
      ? `<div class="error">정산 완료 이력을 저장하지 못했습니다. 기존 이력은 유지됩니다. 같은 버튼을 반복하지 말고 잠시 후 다시 시도해 주세요.</div>`
    : settlementError
      ? `<div class="error">정산 상태를 저장하지 못했습니다. 확인 체크와 관리 권한을 확인해 주세요.</div>`
      : "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 고급 정산</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 30px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.filters{display:grid;grid-template-columns:1fr 150px 160px 100px;gap:8px}.filters select,.filters input,.filters button,.weight input{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 11px;font:inherit}.filters button,button{background:#111827;color:#fff;border:0;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:19px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:680px}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px}.plus{color:#166534;font-weight:1000}.minus{color:#b91c1c;font-weight:1000}.zero{color:#64748b;font-weight:1000}.weightGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:10px 0}.weight{display:grid;gap:5px;border:1px solid #e5e7eb;border-radius:16px;padding:11px}.weight span{font-weight:1000}.weight small{color:#64748b}.itemGrid{display:grid;gap:9px;margin:10px 0}.itemSplit{border:1px solid #e5e7eb;border-radius:17px;padding:13px}.itemSplit span{display:block;color:#64748b;font-size:12px;margin-top:4px}.checks{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.checks label{background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:12px}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;padding:0 13px;text-decoration:none;color:#fff!important;cursor:pointer}.light{background:#eff6ff!important;color:#1e3a8a!important}.note,.copy,.ok,.error{border-radius:16px;padding:13px;line-height:1.6}.note,.copy{background:#f8fafc;border:1px solid #e5e7eb;color:#475569;overflow-wrap:anywhere}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.muted{color:#64748b;line-height:1.6}.complete{display:grid;gap:9px}.complete input[type=text]{width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit}@media(max-width:760px){.wrap{padding:12px}.filters{grid-template-columns:1fr}.btn,button{width:100%;margin:4px 0}.checks{display:grid}.hero h1{font-size:25px}}</style></head><body>${renderUnifiedNav("settlement", { month, householdId: selected.id, householdName: selected.name, role: String(selected.role || "") })}<main class="wrap">${message}${error}${refundParts?.flashHtml || ""}<section class="hero"><h1>고급 정산</h1><p>${escapeHtml(selected.name || "가계부")} · 동일, 비율, 인원수, 품목별 참여자 중 실제 모임 규칙에 맞는 방식을 선택하세요.</p><form class="filters" method="get" action="/settlement-summary"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><select name="mode">${modeOptions}</select><button type="submit">조회</button></form></section><section class="card"><h2>${escapeHtml(modeLabel)} 설정</h2><p>${refundLink}</p><p class="note">${refundNotice}</p>${renderSettlementConfig({ mode, members, rows, weights, itemParticipants, month, householdId: selected.id })}</section>${refundParts?.sectionHtml || ""}<section class="grid"><div class="metric"><span>정산 대상 지출</span><b>${numberWithCommas(model.totalExpense)}원</b></div><div class="metric"><span>참여자</span><b>${numberWithCommas(model.participantCount)}명</b></div><div class="metric"><span>평균 부담</span><b>${numberWithCommas(model.share)}원</b></div><div class="metric"><span>지출 건수</span><b>${numberWithCommas(model.itemCount)}건</b></div><div class="metric"><span>최소 송금 제안</span><b>${numberWithCommas(model.transfers.length)}건</b></div>${refundParts?.metricHtml || ""}</section>${model.unknownPaid ? `<section class="card"><div class="error">지출자 미지정 ${numberWithCommas(model.unknownPaid)}원은 정산에서 제외했습니다. 기록 화면에서 지출자를 지정한 뒤 다시 계산하세요.</div></section>` : ""}<section class="card"><h2>참여자별 정산</h2><div class="tableWrap"><table><thead><tr><th>참여자</th><th>낸 금액</th><th>부담액</th><th>정산 상태</th></tr></thead><tbody>${renderSettlementRows(model)}</tbody></table></div></section><section class="card"><h2>송금 횟수를 줄인 제안</h2><div class="tableWrap"><table><thead><tr><th>보낼 사람</th><th>받을 사람</th><th>금액</th></tr></thead><tbody>${renderTransferRows(model.transfers)}</tbody></table></div><p class="muted">받을 금액과 보낼 금액을 큰 순서로 맞춰 불필요한 교차 송금을 줄였습니다. 실제 송금 전에 참여자와 금액을 확인하세요.</p></section><section class="card"><h2>공유 문구</h2><div class="copy" id="settlementCopy">${escapeHtml(selected.name || "가계부")} ${escapeHtml(month)} 정산<br/>${refundNotice}<br/>방식: ${escapeHtml(modeLabel)}<br/>총 지출: ${numberWithCommas(model.totalExpense)}원<br/>참여자: ${numberWithCommas(model.participantCount)}명<br/><br/>${escapeHtml(transferText).replace(/\n/g, "<br/>")}<br/><br/>초대/참여 문구: ${escapeHtml(inviteText)}</div><p><button type="button" id="copySettlement">문구 복사</button><a class="btn light" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}#quick">기록 추가</a></p></section><section class="card"><h2>정산 완료·이력</h2><p class="note">${refundNotice} 완료 이력은 저장 당시 일반 정산 결과입니다. 과거 이력은 다시 계산하거나 변경하지 않습니다.</p>${canComplete ? `<form class="complete" method="post" action="/my/settlement/save"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="mode" value="${escapeHtml(mode)}"/>${completionHidden}<input type="text" name="note" placeholder="예: 7월 여행 정산 완료" maxlength="160"/><label><input type="checkbox" name="confirmed" value="yes" required/> ${refundParts?.confirmText || "참여자와 환급 미리보기 계산이 포함되지 않은 금액을 확인했고 완료 이력으로 저장합니다."}</label><button type="submit">정산 완료로 저장</button></form>` : `<p class="note">소유자·관리자가 완료 상태를 저장할 수 있습니다.</p>`}${renderSettlementHistory(history)}</section></main><script>(function(){var b=document.getElementById('copySettlement'),box=document.getElementById('settlementCopy');if(!b||!box)return;b.addEventListener('click',function(){var text=box.innerText;var done=function(){b.textContent='복사됨';};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done);else{window.prompt('복사하세요',text);}});})();</script></body></html>`);
}

async function handleMeetingArchiveGuidePage(request, env, url) {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 모임 보관 가이드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:960px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#ede9fe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px}.box p{color:#64748b;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.note{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:13px;line-height:1.6}</style></head><body><main class="wrap"><section class="hero"><h1>모임 종료·보관 가이드</h1><p>단발성 모임이나 여행 가계부는 정산 후 삭제보다 보관을 권장합니다. 기록을 남기되, 추가 입력을 막는 방식은 권한 조정으로 운영합니다.</p><p><a class="btn" href="/my/households">가계부 전환·참여</a><a class="btn" href="/settlement-summary">정산 요약</a></p></section><section class="grid"><div class="box"><h2>1. 정산 완료</h2><p>/settlement-summary에서 참여자별 금액과 송금 제안을 확인합니다.</p></div><div class="box"><h2>2. 백업</h2><p>/backup에서 CSV 또는 JSON 백업을 받은 뒤 종료 처리를 진행합니다.</p></div><div class="box"><h2>3. 권한 조정</h2><p>owner/admin이 참여자를 viewer로 바꾸면 조회는 가능하고 추가 입력은 제한됩니다.</p></div><div class="box"><h2>4. 이름 정리</h2><p>가계부 이름 앞에 [종료] 또는 [보관]을 붙여 실사용 장부와 구분합니다.</p></div></section><section class="card"><h2>운영 원칙</h2><div class="note">이번 버전은 별도 보관 테이블을 만들지 않습니다. 기존 권한 구조와 가계부 범위 안전성을 유지하면서 “정산 완료 후 viewer 전환 + 이름 변경 + 백업” 흐름으로 관리합니다.</div></section></main></body></html>`);
}

async function handleDuplicateSafetyPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return redirectResponse("/admin-view");
  return htmlResponse(renderDuplicateSafetyHtml(env));
}

// V22.9.78 N-18: 저장된 예약 실행 요약 한 줄. 값은 recordScheduledRun 이 거른 건수·짧은 코드뿐이다.
function renderScheduledRunRow(run = {}) {
  const kst = (iso) => { const ms = Date.parse(iso); return Number.isFinite(ms) ? new Date(ms + 9 * 3600000).toISOString().slice(0, 16).replace("T", " ") : ""; };
  const statusLabel = { ok: "정상", partial: "일부 남음", error: "오류" }[run.status] || "오류";
  const statusClass = run.status === "ok" ? "ok" : run.status === "partial" ? "warn" : "bad";
  const reasonLabel = { page_cap: "읽기 한도", budget: "호출 한도", error: "오류", report_queue: "스냅숏 대기", remaining: "남은 규칙" };
  const count = (value) => numberWithCommas(Number(value || 0));
  const r = run.recurring || {};
  const recurring = !run.recurring ? "-" : r.error ? `오류 ${r.error}` : r.skipped_run ? "다른 실행이 처리 중이라 건너뜀"
    : `적용 ${count(r.applied)} · 건너뜀 ${count(r.skipped)} · 실패 ${count(r.failed)} · 남음 ${count(r.remaining)} · ${count(r.pages)}쪽${r.partial_reason ? ` · ${reasonLabel[r.partial_reason] || r.partial_reason}` : ""}`;
  const p = run.reports || {};
  const reports = !run.reports ? "-" : p.error ? `오류 ${p.error}` : p.skipped_run ? "다른 실행이 처리 중이라 건너뜀"
    : `생성 ${count(p.generated)} · 실패 ${count(p.failed)}${p.pending_scopes ? ` · 남은 범위 ${count(p.pending_scopes)}` : ""}`;
  const c = run.cleanup || {};
  const cleanup = !run.cleanup ? "-" : c.error ? `오류 ${c.error}` : c.skipped ? "건너뜀" : "완료";
  return `<tr><td>${escapeHtml(kst(run.started_at))}</td><td class="${statusClass}">${statusLabel}</td><td>${escapeHtml(recurring)}</td><td>${escapeHtml(reports)}</td><td>${escapeHtml(cleanup)}</td><td>${escapeHtml((run.errors || []).join(", ") || "-")}</td></tr>`;
}

async function handleOpsDashboardPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return redirectResponse("/admin-view");
  const title = escapeHtml(appName(env));
  const snap = buildOpsSnapshot(env);
  const traffic = snap.traffic || {};
  const skill = snap.skill || {};
  const events = snap.events || {};
  const errCount = Number((events.bySeverity || {}).error || 0);
  const warnCount = Number((events.bySeverity || {}).warn || 0);
  const skillRows = (skill.recent || []).slice(0, 12).map((e) => `<tr><td>${escapeHtml(e.at)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(maskKey(e.user_key || ""))}</td><td>${escapeHtml(e.utterance || "")}</td><td>${escapeHtml(e.detail || "")}</td></tr>`).join("") || `<tr><td colspan="5">최근 카카오 발화 이벤트가 없습니다.</td></tr>`;
  const opsRows = (events.recent || []).slice(0, 16).map((e) => `<tr><td>${escapeHtml(e.at)}</td><td>${escapeHtml(e.severity)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.method)}</td><td>${escapeHtml(e.path)}</td><td>${escapeHtml(e.detail)}</td></tr>`).join("") || `<tr><td colspan="6">최근 운영 이벤트가 없습니다.</td></tr>`;
  const trafficRows = (traffic.recent || []).slice(0, 12).map((e) => `<tr><td>${escapeHtml(e.at)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.method)}</td><td>${escapeHtml(e.path)}</td><td>${escapeHtml(e.detail)}</td></tr>`).join("") || `<tr><td colspan="5">최근 제한 이벤트가 없습니다.</td></tr>`;
  // V22.9.78 N-18: 예약 실행 요약은 설정 키에 남아 다른 인스턴스·재시작 뒤에도 보인다. 읽지 못하면 그렇다고만 보인다.
  let runLog = null;
  try { runLog = await readScheduledRunLog(env); } catch (_) { runLog = null; }
  const runRows = !runLog ? `<tr><td colspan="6">예약 실행 기록을 불러오지 못했어요.</td></tr>`
    : runLog.entries.map(renderScheduledRunRow).join("") || `<tr><td colspan="6">${runLog.invalid ? "저장된 예약 실행 기록이 깨져 있어요. 다음 예약 실행이 새로 씁니다." : "아직 저장된 예약 실행 기록이 없어요."}</td></tr>`;
  const status = errCount ? "주의" : warnCount ? "관찰" : "정상";
  const statusClass = errCount ? "bad" : warnCount ? "warn" : "ok";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 운영 대시보드</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1180px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.box{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.box span{display:block;color:#64748b;font-size:12px;font-weight:900}.box b{display:block;margin-top:6px;font-size:25px}.ok{color:#166534}.warn{color:#b45309}.bad{color:#b91c1c}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px;background:#fff}table{width:100%;border-collapse:collapse;min-width:780px}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:top}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.6}.badge{display:inline-flex;border-radius:999px;padding:7px 11px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:1000}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}table{min-width:680px}}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="badge">${escapeHtml(APP_VERSION)}</span><h1>운영 대시보드</h1><p>최근 오류, 과도 요청 제한, 카카오 발화 이벤트를 한 화면에서 확인합니다. 예약 실행 요약 말고는 장기 저장을 하지 않는 인스턴스 메모리 기반 운영 패널입니다.</p><p><a class="btn light" href="/operation-center">운영센터</a><a class="btn light" href="/ops-monitor">종합 관제 · 사용량과 이력</a><a class="btn light" href="/ops-traffic">트래픽</a><a class="btn light" href="/ops-duplicates">중복 방어</a><a class="btn light" href="/skill-ops">스킬 운영</a><a class="btn light" href="/ops-snapshot.json">JSON 스냅샷</a></p></section><section class="grid"><div class="box"><span>현재 인스턴스의 관측 상태</span><b class="${statusClass}">${status}</b></div><div class="box"><span>최근 오류</span><b>${numberWithCommas(errCount)}</b></div><div class="box"><span>최근 경고</span><b>${numberWithCommas(warnCount)}</b></div><div class="box"><span>Traffic 활성 버킷</span><b>${numberWithCommas(traffic.activeBuckets || 0)}</b></div><div class="box"><span>Skill 활성 버킷</span><b>${numberWithCommas(skill.activeBuckets || 0)}</b></div><div class="box"><span>쓰기 제한 기준</span><b>${numberWithCommas(snap.limits.traffic_guard_limit)}/분</b></div></section><section class="card"><h2>최근 예약 실행</h2><div class="scroll"><table><thead><tr><th>시작(KST)</th><th>상태</th><th>정기 반영</th><th>자동 리포트</th><th>기록 정리</th><th>오류 코드</th></tr></thead><tbody>${runRows}</tbody></table></div><p class="note">매일 예약 실행(정기 반영·자동 리포트·기록 정리)의 결과 요약입니다. 저장소에 최근 14번까지 남아 인스턴스가 바뀌어도 보입니다.</p></section><section class="card"><h2>최근 운영 이벤트</h2><div class="scroll"><table><thead><tr><th>시간</th><th>등급</th><th>종류</th><th>Method</th><th>Path</th><th>상세</th></tr></thead><tbody>${opsRows}</tbody></table></div><p class="note">안전모드 전환, 서버 오류, 예약 실행 오류, 과도 요청 제한이 여기에 표시됩니다.</p></section><section class="card"><h2>최근 과도 요청 제한</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>Method</th><th>Path</th><th>상세</th></tr></thead><tbody>${trafficRows}</tbody></table></div></section><section class="card"><h2>최근 카카오 발화 이벤트</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>User Key</th><th>발화</th><th>상세</th></tr></thead><tbody>${skillRows}</tbody></table></div></section></main></body></html>`);
}

async function handleTrafficOpsPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return redirectResponse("/admin-view");
  const title = escapeHtml(appName(env));
  const traffic = getTrafficOpsSnapshot();
  const skill = getSkillOpsSnapshot();
  const trafficRows = traffic.recent.map((e) => `<tr><td>${escapeHtml(e.at)}</td><td>${escapeHtml(e.kind)}</td><td>${escapeHtml(e.method)}</td><td>${escapeHtml(e.path)}</td><td>${escapeHtml(e.detail)}</td></tr>`).join("") || `<tr><td colspan="5">최근 제한 이벤트가 없습니다.</td></tr>`;
  const skillKind = Object.entries(skill.byKind || {}).map(([k,v]) => `<span>${escapeHtml(k)} ${numberWithCommas(v)}건</span>`).join("") || "<span>스킬 이벤트 없음</span>";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 트래픽 운영</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1160px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c2d12));color:#fff}.hero p{color:#fed7aa;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.box{background:#f8fafc;border:1px solid #e8edf4;border-radius:18px;padding:14px}.box b{display:block;font-size:24px;margin-top:5px}.chips{display:flex;gap:8px;flex-wrap:wrap}.chips span{border-radius:999px;padding:7px 10px;background:#eef2ff;color:#3730a3;font-size:12px;font-weight:900}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;background:#fff;min-width:760px}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px}.note{color:#64748b;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}</style></head><body><main class="wrap"><section class="hero"><h1>트래픽 운영센터</h1><p>쓰기 요청과 카카오 스킬 요청의 과도 호출을 1차로 방어하고, 최근 제한 이벤트를 확인합니다.</p><p><a class="btn light" href="/operation-center">운영센터</a><a class="btn light" href="/skill-ops">스킬 운영</a><a class="btn light" href="/deployment-check">배포점검</a></p></section><section class="grid"><div class="box"><span>Traffic 활성 버킷</span><b>${numberWithCommas(traffic.activeBuckets)}</b></div><div class="box"><span>Traffic 제한 이벤트</span><b>${numberWithCommas(traffic.recent.length)}</b></div><div class="box"><span>Skill 활성 버킷</span><b>${numberWithCommas(skill.activeBuckets)}</b></div><div class="box"><span>쓰기 제한 기준</span><b>${numberWithCommas(boundedRuntimeNumber(env.TRAFFIC_GUARD_LIMIT, 240, 20, 10000))}/분</b></div></section><section class="card"><h2>스킬 이벤트 요약</h2><div class="chips">${skillKind}</div><p class="note">인스턴스 메모리 기반 임시 상태입니다. 장기 통계가 필요하면 다음 단계에서 Supabase 운영 로그 테이블 또는 외부 로그 저장소로 분리합니다.</p></section><section class="card"><h2>최근 과도 요청 제한</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>Method</th><th>Path</th><th>상세</th></tr></thead><tbody>${trafficRows}</tbody></table></div></section></main></body></html>`);
}

async function handleBrandKitPage(request, env, url) {
  const title = escapeHtml(appName(env));
  const slogan = "말하면 알아서 정리되는 우리집 가계부";
  const review = [
    "말해가계부는 카카오톡에서 지출·수입을 간단히 기록하고, 가족/모임 가계부를 함께 확인할 수 있는 생활비 기록 도우미입니다.",
    "사용자가 봇에게 직접 보낸 명령어와 가계부 기록에 필요한 데이터만 처리합니다.",
    "정기지출, 예산, 최근 기록, 월별 요약은 사용자 웹 화면에서 직접 확인하고 관리할 수 있습니다.",
  ];
  const avoid = ["카카오가계부", "카톡가계부", "공식가계부", "AI은행", "투자비서", "대출도우미"].map((x) => `<span>${escapeHtml(x)}</span>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 브랜드 가이드</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:linear-gradient(180deg,#fff9d9,#f8fafc 48%,#eef2f7);color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1060px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:28px;padding:22px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.075)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#f59e0b));color:#fff}.hero p{color:#fff7ed}.logo{width:112px;height:112px;border-radius:30px;background:#fff7d6;border:8px solid #111827;display:grid;place-items:center;font-size:48px;box-shadow:inset 0 -12px 0 rgba(245,158,11,.22)}.brand{display:flex;gap:18px;align-items:center;flex-wrap:wrap}.brand h1{font-size:42px;margin:0;letter-spacing:-.08em}.muted{color:#667085;line-height:1.65}.grid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.chip{display:flex;gap:8px;flex-wrap:wrap}.chip span{border-radius:999px;padding:8px 12px;background:#f1f5f9;border:1px solid #e8edf4;font-weight:900;font-size:13px}.bad span{background:#fee2e2;color:#991b1b;border-color:#fecaca}textarea{width:100%;min-height:150px;border:1px solid #cbd5e1;border-radius:18px;padding:14px;font:inherit;line-height:1.6}@media(max-width:760px){.grid{grid-template-columns:1fr}.brand h1{font-size:32px}}</style></head><body><main class="wrap"><section class="hero"><div class="brand"><div class="logo">📒</div><div><h1>${title}</h1><p>${escapeHtml(slogan)}</p></div></div></section><section class="grid"><div class="card"><h2>브랜드 톤</h2><div class="chip"><span>직관적</span><span>친근함</span><span>가족 생활비</span><span>기록 도우미</span><span>비금융사</span></div><p class="muted">서비스 설명은 투자/대출/금융 조언이 아니라 생활비 기록과 공동 가계부 관리로 표현합니다.</p></div><div class="card"><h2>로고 방향</h2><p class="muted">둥근 장부, 차곡차곡 쌓이는 동전, 체크 표시를 조합합니다. 카카오 말풍선이나 카카오 공식 CI처럼 보이는 형태는 피합니다.</p></div></section><section class="card"><h2>심사 문구 초안</h2><textarea readonly>${escapeHtml(review.join("\\n\\n"))}</textarea></section><section class="card"><h2>피해야 할 이름/표현</h2><div class="chip bad">${avoid}</div><p class="muted">카카오 공식 서비스로 오인될 수 있는 명칭, 금융회사·투자·대출처럼 보이는 표현은 사용하지 않습니다.</p></section></main></body></html>`);
}

async function handleDataPolicyPage(request, env, url) {
  const title = escapeHtml(appName(env));
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 개인정보 안내</title><style>body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:900px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#d1fae5}.muted{color:#667085;line-height:1.7}li{margin:8px 0}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:14px;line-height:1.65}</style></head><body><main class="wrap"><section class="hero"><h1>개인정보·데이터 안내</h1><p>${title}는 봇에게 직접 보낸 명령어와 가계부 기록에 필요한 데이터만 처리합니다.</p></section><section class="card"><h2>처리하는 데이터</h2><ul><li>사용자가 입력한 수입·지출 기록</li><li>가계부 이름, 참여자 권한, 초대코드</li><li>가계부 안 표시명, 예산, 분류 키워드, 정기지출 설정</li><li>카카오 봇 사용자키, 그룹방 연결키 같은 식별키</li></ul></section><section class="card"><h2>하지 않는 것</h2><div class="ok">단톡방 전체 대화를 읽거나 학습하지 않습니다.<br/>봇에게 전달된 명령어와 기록 요청만 처리합니다.<br/>카카오 공식 서비스로 오인되도록 표현하지 않습니다.</div></section><section class="card"><h2>보관 기간과 삭제</h2><p class="muted">입력한 기록과 설정값은 <b>가계부를 이용하는 동안 보관</b>합니다. 사용자가 웹 화면에서 직접 수정·삭제할 수 있고, 삭제한 기록은 서비스에서 제거됩니다. 가계부 나가기는 참여 권한을 종료하고 공동 거래 이력은 보존합니다. 가계부 소유자의 영구 삭제는 해당 가계부의 거래·관련 설정을 삭제합니다. 계정 자체 탈퇴·삭제는 온라인에서 제공하지 않으며 문의 경로를 통해 요청해야 합니다. 카카오 발화 원문은 기록 처리에 필요한 범위에서만 저장하며 같은 기준으로 관리합니다. 백업으로 내려받은 파일은 사용자가 직접 보관·관리합니다. 참여자 권한과 표시명은 관리자 또는 가계부 설정 화면에서 관리합니다.</p></section></main></body></html>`);
}
// @build:exports-start
export {
  buildSettlementModel, handleBrandKitPage, handleBudgetAlertGuidePage, handleBudgetAlertPolishPage,
  handleDuplicateSafetyPage, handleHouseholdCreateJoinGuidePage, handleMeetingArchiveGuidePage,
  handleMeetingHouseholdTemplatePage, handleOpsDashboardPage, handleReleaseCandidateCheckPage,
  handleSettlementHistorySave, handleSettlementSummaryPage, handleTrafficOpsPage,
  parseSettlementConditions, renderSettlementRows, renderTransferRows, settlementConditionPairs,
  settlementConditionQuery, settlementHistoryKey, settlementPreviewDigest, settlementRoleAllowed,
};
// @build:exports-end
