
function buildBudgetAlertPolishModel({ month, selectedHousehold = null, rows = [], budgets = [], recurring = [] }) {
  const budget = budgetSummary(rows, budgets);
  const center = budgetCenterSummary(rows, budgets);
  const today = nowKstDate();
  const todayStr = formatDate(today);
  const sameMonth = todayStr.slice(0, 7) === month;
  const daysInMonth = new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0).getDate() || 30;
  const currentDay = sameMonth ? Number(todayStr.slice(8, 10)) : daysInMonth;
  const remainingDays = sameMonth ? Math.max(1, daysInMonth - currentDay + 1) : 0;
  const spent = Number(budget.budgetedExpense ?? budget.expense ?? 0);
  const totalBudget = Number(budget.totalBudget || 0);
  const remainingBudget = totalBudget ? Math.max(0, totalBudget - spent) : 0;
  const dailyAllowance = totalBudget && remainingDays ? Math.round(remainingBudget / remainingDays) : 0;
  const avgDaily = currentDay ? Math.round(spent / currentDay) : 0;
  const forecastExpense = sameMonth && currentDay ? Math.round((spent / currentDay) * daysInMonth) : spent;
  const forecastDiff = totalBudget ? forecastExpense - totalBudget : 0;
  const rate = totalBudget ? Math.round((spent / totalBudget) * 100) : 0;
  const projectedRate = totalBudget ? Math.round((forecastExpense / totalBudget) * 100) : 0;
  const activeRecurring = safeArray(recurring).filter((r) => r.type !== "income" && r.is_active !== false && Number(r.amount || 0) > 0 && (budget.basis !== "category" || budget.categoryAlerts.some(b => b.category === r.category)));
  const pendingRecurring = activeRecurring.filter((r) => String(r.last_applied_month || "") !== month);
  const recurringTotal = activeRecurring.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const pendingRecurringTotal = pendingRecurring.reduce((sum, r) => sum + Number(r.amount || 0), 0);
  const afterPendingForecast = forecastExpense + pendingRecurringTotal;
  const afterPendingDiff = totalBudget ? afterPendingForecast - totalBudget : 0;
  const status = !totalBudget ? "setup" : spent > totalBudget ? "over" : forecastExpense > totalBudget ? "forecast" : rate >= 85 ? "warning" : "ok";
  const statusText = {
    setup: "예산 설정 필요",
    over: "예산 초과",
    forecast: "월말 초과 예상",
    warning: "주의 구간",
    ok: "정상 흐름",
  }[status] || "확인 필요";
  const statusMessage = {
    setup: "월 전체 예산이나 분류별 예산을 먼저 설정하면 오늘 사용 가능 금액과 월말 예상이 계산됩니다.",
    over: "이미 이번 달 예산을 넘었습니다. 남은 기간에는 고정지출과 필수 지출만 먼저 확인하세요.",
    forecast: "현재 속도라면 월말에 예산을 넘을 수 있습니다. 이번 주 소비 속도를 낮추는 것이 좋습니다.",
    warning: "아직 초과는 아니지만 예산의 85% 이상을 사용했습니다. 남은 기간 지출을 조금 보수적으로 잡으세요.",
    ok: "현재 소비 속도는 예산 안에서 관리되고 있습니다. 오늘 사용 가능 금액 기준으로 기록하면 됩니다.",
  }[status] || "예산 상태를 확인하세요.";
  const sortedAlerts = safeArray(budget.categoryAlerts).filter((x) => Number(x.budget || 0) > 0).sort((a, b) => Number(b.rate || 0) - Number(a.rate || 0));
  const dangerCategories = sortedAlerts.filter((x) => Number(x.spent || 0) > Number(x.budget || 0));
  const warningCategories = sortedAlerts.filter((x) => Number(x.rate || 0) >= 85 && Number(x.spent || 0) <= Number(x.budget || 0));
  return { selectedHousehold, month, budget, center, todayStr, sameMonth, daysInMonth, currentDay, remainingDays, spent, totalBudget, remainingBudget, dailyAllowance, avgDaily, forecastExpense, forecastDiff, rate, projectedRate, recurringTotal, pendingRecurringTotal, afterPendingForecast, afterPendingDiff, activeRecurring, pendingRecurring, sortedAlerts, dangerCategories, warningCategories, status, statusText, statusMessage };
}

function renderBudgetAlertStatusPill(status = "ok") {
  const cls = status === "over" ? "bad" : status === "forecast" || status === "warning" ? "warn" : status === "setup" ? "setup" : "ok";
  const label = { over: "초과", forecast: "예상초과", warning: "주의", setup: "설정필요", ok: "정상" }[status] || "확인";
  return `<span class="pill ${cls}">${escapeHtml(label)}</span>`;
}

function renderBudgetAlertRows(model) {
  const rows = safeArray(model.sortedAlerts).slice(0, 12);
  if (!rows.length) return `<tr><td colspan="6">분류별 예산이 아직 없습니다. 예산 화면에서 분류 예산을 설정하면 초과/주의 분류가 표시됩니다.</td></tr>`;
  return rows.map((x) => {
    const remain = Math.max(0, Number(x.budget || 0) - Number(x.spent || 0));
    const state = Number(x.spent || 0) > Number(x.budget || 0) ? "bad" : Number(x.rate || 0) >= 85 ? "warn" : "ok";
    const link = `/app?month=${encodeURIComponent(model.month)}${model.selectedHousehold?.id ? `&household_id=${encodeURIComponent(model.selectedHousehold.id)}` : ""}&type=expense&category=${encodeURIComponent(x.category || "")}&feed=all#feed`;
    return `<tr><td><a href="${escapeHtml(link)}">${escapeHtml(x.category || "미분류")}</a></td><td>${numberWithCommas(x.budget)}원</td><td>${numberWithCommas(x.spent)}원</td><td>${numberWithCommas(remain)}원</td><td><div class="miniBar"><span class="${state}" style="width:${Math.min(100, Number(x.rate || 0))}%"></span></div></td><td><span class="state ${state}">${budgetStatusLabel(x.rate || 0, x.spent, x.budget)} · ${numberWithCommas(x.rate || 0)}%</span></td></tr>`;
  }).join("");
}

function renderPendingRecurringList(model) {
  const list = safeArray(model.pendingRecurring).slice(0, 8);
  if (!list.length) return `<p class="muted">이번 달에 아직 반영 대기 중인 정기지출이 없습니다.</p>`;
  return `<ul class="recList">${list.map((r) => `<li><b>${escapeHtml(r.memo || r.category || "정기지출")}</b><span>${escapeHtml(r.category || "미분류")} · 매월 ${numberWithCommas(r.day_of_month || 1)}일 예정</span><strong>${numberWithCommas(r.amount || 0)}원</strong></li>`).join("")}</ul>`;
}

function budgetAlertKakaoHint(model) {
  if (!model.totalBudget) return "예산을 먼저 설정하면 카카오톡에서 남은예산, 오늘예산, 이번달예상처럼 확인할 수 있어요.";
  if (model.status === "over") return `이번 달 예산을 ${numberWithCommas(Math.abs(model.budget.diff || 0))}원 초과했어요. 남은 기간은 필수 지출 위주로 관리해 주세요.`;
  if (model.status === "forecast") return `현재 속도라면 월말 예상 지출은 ${numberWithCommas(model.forecastExpense)}원으로 예산보다 ${numberWithCommas(Math.max(0, model.forecastDiff))}원 많을 수 있어요.`;
  return `오늘은 약 ${numberWithCommas(model.dailyAllowance)}원까지 쓰면 이번 달 예산 흐름을 유지할 수 있어요.`;
}

// V22.8.29 V5 연간 리포트·연말정산 (§3.12) — 신규 user 페이지. fetchAdminRowsRange 재사용, 레거시 무변경.
function classifyDeductionPay(pm) {
  const s = String(pm || "");
  if (/체크/.test(s)) return "check";
  if (/현금/.test(s)) return "cash";
  if (/(카카오페이|네이버페이|페이|간편|토스|toss)/i.test(s)) return "simple";
  if (/카드|신용/.test(s)) return "credit";
  return "other";
}
function buildAnnualReportModel(rows, year) {
  const monthsExp = new Array(12).fill(0);
  const monthsInc = new Array(12).fill(0);
  let totalExp = 0, totalInc = 0, creditSpend = 0, deductibleSpend = 0;
  const catExp = {};
  for (const r of safeArray(rows)) {
    const mi = Number(String(r.transaction_date || "").slice(5, 7)) - 1;
    const amt = Number(r.amount || 0);
    if (r.type === "income") {
      totalInc += amt;
      if (mi >= 0 && mi < 12) monthsInc[mi] += amt;
    } else {
      totalExp += amt;
      if (mi >= 0 && mi < 12) monthsExp[mi] += amt;
      const c = r.category || "미분류";
      catExp[c] = (catExp[c] || 0) + amt;
      const kind = classifyDeductionPay(r.payment_method);
      if (kind === "credit") creditSpend += amt;
      else if (kind !== "other") deductibleSpend += amt;
    }
  }
  const catTop = Object.keys(catExp).map((k) => ({ category: k, amount: catExp[k] }))
    .sort((a, b) => b.amount - a.amount).slice(0, 6);
  return {
    year, monthsExp, monthsInc, totalExp, totalInc,
    savings: totalInc - totalExp,
    monthAvgExp: Math.round(totalExp / 12),
    catTop, maxMonth: Math.max(1, ...monthsExp), creditSpend, deductibleSpend,
  };
}
async function handleAnnualReportPage(request, env, url) {
  const scoped = await getScopedHouseholdsForPage(request, env);
  if (scoped.scope === "none") return redirectResponse("/my");
  const households = scoped.households;
  const selected = selectRequestedScopedHousehold(households, url.searchParams.get("household_id") || "");
  if (!selected) return redirectResponse("/my");
  const nowYear = Number(currentMonthKst().slice(0, 4));
  const nowMonthIdx = Number(currentMonthKst().slice(5, 7)) - 1;
  let year = Math.round(Number(url.searchParams.get("year") || nowYear));
  if (!Number.isFinite(year)) year = nowYear;
  year = Math.max(2000, Math.min(nowYear, year));
  const rows = await fetchAdminRowsRange(env, { householdId: selected.id, start: `${year}-01-01`, end: `${year + 1}-01-01`, type: "all", limit: 20000 });
  const model = buildAnnualReportModel(rows, year);
  return htmlResponse(renderAnnualReportHtml({ env, households, selected, model, nowYear, nowMonthIdx }));
}
function renderAnnualReportHtml({ env, households, selected, model, nowYear, nowMonthIdx }) {
  const title = escapeHtml(appName(env));
  const hh = `&household_id=${encodeURIComponent(selected.id)}`;
  const opts = safeArray(households).map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selected.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")}</option>`).join("");
  const curMonthHighlight = model.year === nowYear ? nowMonthIdx : -1;
  const barsHtml = model.monthsExp.map((v, i) => {
    const h = Math.max(2, Math.round((v / model.maxMonth) * 100));
    return `<div class="annualBarCol"><div class="annualBarTrack"><div class="annualBar${i === curMonthHighlight ? " cur" : ""}" style="height:${h}%" title="${i + 1}월 ${numberWithCommas(v)}원"></div></div><span>${i + 1}</span></div>`;
  }).join("");
  const catMax = Math.max(1, ...model.catTop.map((c) => c.amount));
  const catHtml = model.catTop.length
    ? model.catTop.map((c) => `<li><div class="catRow"><b>${escapeHtml(c.category)}</b><span>${numberWithCommas(c.amount)}원</span></div><div class="miniBar"><span style="width:${Math.round(c.amount / catMax * 100)}%"></span></div></li>`).join("")
    : `<li class="muted">이 해에는 지출 기록이 없습니다.</li>`;
  const prevY = model.year - 1;
  const nextY = model.year + 1;
  const nextDisabled = nextY > nowYear;
  const savingsLabel = model.savings >= 0 ? `저축 ${numberWithCommas(model.savings)}원` : `적자 ${numberWithCommas(Math.abs(model.savings))}원`;
  const creditDeduct = Math.round(model.creditSpend * 0.15);
  const otherDeduct = Math.round(model.deductibleSpend * 0.30);
  const style = `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.6}.yearNav{display:flex;align-items:center;gap:10px;margin-top:12px}.yearNav a,.yearNav span{display:inline-flex;align-items:center;justify-content:center;min-height:40px;padding:0 14px;border-radius:12px;background:rgba(255,255,255,.16);color:#fff!important;text-decoration:none;font-weight:1000}.yearNav a.disabled,.yearNav span.disabled{opacity:.4;pointer-events:none}.yearNav b{font-size:22px;padding:0 6px}.filters{display:grid;grid-template-columns:1fr 130px;gap:8px;margin-top:12px}.filters select,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px}.annualBars{display:flex;align-items:flex-end;gap:6px;height:170px;margin-top:6px}.annualBarCol{flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;min-width:0}.annualBarTrack{width:100%;height:140px;display:flex;align-items:flex-end;background:#eef2f7;border-radius:8px;overflow:hidden}.annualBar{width:100%;background:#93b4f6;border-radius:8px 8px 0 0}.annualBar.cur{background:#1d4ed8}.annualBarCol span{font-size:11px;color:#64748b;font-weight:800}.catList{list-style:none;margin:0;padding:0;display:grid;gap:10px}.catRow{display:flex;justify-content:space-between;gap:10px}.catRow b{font-size:14px}.catRow span{color:#64748b;font-variant-numeric:tabular-nums}.miniBar{height:9px;background:#eef2f7;border-radius:999px;overflow:hidden;margin-top:6px}.miniBar span{display:block;height:100%;border-radius:999px;background:#1d4ed8}.deduct{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.deductBox{background:#f8fafc;border:1px solid #e8edf4;border-radius:18px;padding:15px}.deductBox b{display:block;font-size:20px;margin:4px 0}.deductBox small{color:#64748b}.notice{border-radius:16px;padding:14px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;line-height:1.6;margin-top:10px}.actions{display:flex;flex-wrap:wrap;gap:8px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:14px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 14px;border:0;cursor:pointer;font:inherit}.btn.light{background:#eff6ff;color:#1e3a8a!important}.muted{color:#64748b;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.metric b{font-size:20px}.annualBars{height:150px}.annualBarTrack{height:120px}}@media print{.abLayoutNav,.abNavMobileTop,.abNavBottom,.yearNav,.filters,.actions{display:none!important}body{background:#fff!important}.hero{background:#111827!important}}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 연간 리포트</title><style>${style}</style></head><body>${renderUnifiedNav("annual", { month: `${model.year}-01`, householdId: selected.id, householdName: selected.name })}<main class="wrap"><section class="hero"><h1>${model.year} 연간 리포트</h1><p>한 해의 수입·지출 흐름과 연말정산 참고 자료를 정리했어요.</p><div class="yearNav"><a href="/annual?year=${prevY}${hh}" aria-label="이전 해">‹</a><b>${model.year}</b>${nextDisabled ? `<span class="disabled" aria-disabled="true">›</span>` : `<a href="/annual?year=${nextY}${hh}" aria-label="다음 해">›</a>`}</div><form class="filters" method="get" action="/annual"><input type="hidden" name="year" value="${model.year}"/><select name="household_id">${opts}</select><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>연간 수입</span><b>${numberWithCommas(model.totalInc)}원</b></div><div class="metric"><span>연간 지출</span><b>${numberWithCommas(model.totalExp)}원</b></div><div class="metric"><span>연간 ${model.savings >= 0 ? "저축" : "적자"}</span><b>${numberWithCommas(Math.abs(model.savings))}원</b></div><div class="metric"><span>월 평균 지출</span><b>${numberWithCommas(model.monthAvgExp)}원</b></div></section><section class="card"><h2>월별 지출</h2><div class="annualBars">${barsHtml}</div></section><section class="card"><h2>연간 카테고리 TOP6</h2><ul class="catList">${catHtml}</ul></section><section class="card"><h2>연말정산 참고</h2><p class="muted">${savingsLabel} · 연간 총수입 ${numberWithCommas(model.totalInc)}원</p><div class="deduct"><div class="deductBox"><small>신용카드 사용액</small><b>${numberWithCommas(model.creditSpend)}원</b><small>공제율 15% 안내 · 예상 ${numberWithCommas(creditDeduct)}원</small></div><div class="deductBox"><small>체크·현금·간편결제</small><b>${numberWithCommas(model.deductibleSpend)}원</b><small>공제율 30% 안내 · 예상 ${numberWithCommas(otherDeduct)}원</small></div></div><div class="notice">여기 표시되는 금액과 공제율은 참고용 안내입니다. 실제 소득공제는 국세청 연말정산 간소화 자료와 공제 한도·총급여 기준에 따라 달라집니다.</div></section><section class="card"><h2>내보내기</h2><div class="actions"><button type="button" class="btn" onclick="window.print()">PDF로 저장 / 인쇄</button><a class="btn light" href="/app?month=${encodeURIComponent(model.year + "-01")}${hh}">가계부로 이동</a></div></section></main></body></html>`;
}

// V22.8.31 V5 저축·목표 페이지(§3.7) + 로딩 스켈레톤/토스트·Undo(§3.17) — V5 네이티브 클라이언트 서피스.
async function handleGoalsPage(request, env, url) {
  const scoped = await getScopedHouseholdsForPage(request, env);
  if (scoped.scope === "none") return redirectResponse("/my");
  const households = scoped.households;
  const selected = selectRequestedScopedHousehold(households, url.searchParams.get("household_id") || "");
  if (!selected) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const canWrite = scoped.scope === "admin" || canWriteMyHousehold(selected.role);
  let html = renderGoalsHtml({ env, households, selected, month, canWrite });
  if (!canWrite) {
    html = html.replace(
      '<section class="card"><h2>목표 추가</h2>',
      '<section class="card"><h2>읽기 전용</h2><p class="muted">조회 전용 참여자는 목표를 확인할 수 있지만 추가·납입·삭제할 수 없습니다.</p></section><section class="card" hidden><h2>목표 추가</h2>',
    );
  }
  return htmlResponse(html);
}
function renderGoalsHtml({ env, households, selected, month, canWrite = false }) {
  const title = escapeHtml(appName(env));
  const opts = safeArray(households).map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selected.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")}</option>`).join("");
  const skel = `<div class="goalCard goalSkel"><div class="skLine skWide"></div><div class="skBar"></div><div class="skLine"></div></div>`.repeat(3);
  const style = `*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.overall{margin-top:14px}.overall .obar{height:12px;background:rgba(255,255,255,.22);border-radius:999px;overflow:hidden;margin-top:8px}.overall .obar span{display:block;height:100%;background:#5eead4;border-radius:999px;transition:width var(--ab12-dur-gauge,620ms) var(--ab12-ease-gauge,cubic-bezier(.2,.8,.2,1))}.overall b{font-size:22px}.filters{display:grid;grid-template-columns:1fr 110px;gap:8px;margin-top:14px}.filters select,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.goalForm{display:grid;grid-template-columns:1.4fr .6fr 1fr 1fr 1fr auto;gap:8px}.goalForm input{height:44px;border:1px solid #d1d5db;border-radius:12px;padding:0 12px;font:inherit;min-width:0}.goalForm button{height:44px;border:0;border-radius:12px;background:#0f766e;color:#fff;font-weight:1000;padding:0 16px;cursor:pointer}.goalCard{background:var(--card,#fff);color:var(--text,#111827);border:1px solid var(--line,#e8edf4);border-radius:20px;padding:16px;margin:10px 0}.goalHead{display:flex;align-items:center;gap:10px}.goalEmoji{font-size:22px}.goalHead b{font-size:16px}.goalHead small{display:block;color:var(--sub,#64748b);font-size:12px;margin-top:2px}.goalStatus{margin-left:auto;flex:none;border-radius:999px;padding:5px 10px;font-size:12px;font-weight:900}.st-done{background:#dcfce7;color:#166534}.st-onTrack{background:#e0f2fe;color:#075985}.st-behind{background:#fef3c7;color:#92400e}.goalBar{height:12px;background:var(--card-2,#eef2f7);border-radius:999px;overflow:hidden;margin:12px 0 8px}.goalBar span{display:block;height:100%;background:var(--accent,#0f766e);border-radius:999px;transition:width var(--ab12-dur-gauge,620ms) var(--ab12-ease-gauge,cubic-bezier(.2,.8,.2,1))}.goalMeta{display:flex;justify-content:space-between;gap:10px;color:var(--sub,#64748b);font-size:13px;flex-wrap:wrap}.goalMeta b{color:var(--text,#111827)}.goalActions{display:flex;gap:8px;margin-top:12px}.goalActions button{height:40px;border-radius:11px;font-weight:900;padding:0 14px;cursor:pointer;font:inherit;border:1px solid var(--line,#e8edf4)}.goalActions .fund{background:var(--accent,#0f766e);color:#fff;border:0}.goalActions .del{background:transparent;color:var(--sub,#64748b)}.goalEmpty{padding:26px;text-align:center;color:var(--sub,#64748b)}.skLine{height:12px;border-radius:6px;background:#eef2f7;margin:8px 0}.skWide{width:60%}.skBar{height:12px;border-radius:999px;background:#eef2f7;margin:14px 0}.goalSkel{position:relative;overflow:hidden}.goalSkel:after{content:"";position:absolute;inset:0;transform:translateX(-100%);background:linear-gradient(90deg,transparent,rgba(255,255,255,.6),transparent);animation:goalShimmer 1.2s infinite}@keyframes goalShimmer{100%{transform:translateX(100%)}}.goalToast{position:fixed;left:50%;transform:translateX(-50%);bottom:calc(84px + env(safe-area-inset-bottom,0px));z-index:2600;display:flex;align-items:center;gap:14px;background:#111827;color:#fff;border-radius:14px;padding:12px 16px;box-shadow:0 14px 34px rgba(15,23,42,.3);font-weight:700}.goalToast[hidden]{display:none}.goalToast button{background:transparent;border:0;color:#5eead4;font-weight:900;cursor:pointer;font:inherit}@media(min-width:900px){.goalToast{bottom:24px}}@media(max-width:760px){.wrap{padding:12px 10px 96px}.hero h1{font-size:24px}.goalForm{grid-template-columns:1fr 1fr}.goalForm input,.goalForm button{font-size:16px}}@media(prefers-reduced-motion:reduce){.goalSkel:after{animation:none}}`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 저축·목표</title><style>${style}</style></head><body>${renderUnifiedNav("goals", { month, householdId: selected.id, householdName: selected.name })}<main class="wrap"><section class="hero"><h1>저축·목표</h1><p>목표를 정하고 매월 조금씩 모아보세요. 원터치로 납입하고, 실수하면 바로 실행취소할 수 있어요.</p><div class="overall"><span>전체 진행률 <b id="goalsOverallPct">–</b></span><div class="obar"><span id="goalsOverallBar" style="width:0%"></span></div><small id="goalsOverallSub" style="color:#ccfbf1"></small></div><form class="filters" method="get" action="/goals"><select name="household_id">${opts}</select><button type="submit">조회</button></form></section><section class="card"><h2>목표 추가</h2><form id="goalAddForm" class="goalForm" autocomplete="off"><input name="name" placeholder="목표 이름 (예: 여행자금)" aria-label="목표 이름"/><input name="emoji" value="🎯" maxlength="4" aria-label="이모지"/><input name="target" inputmode="numeric" placeholder="목표 금액" aria-label="목표 금액"/><input name="monthly" inputmode="numeric" placeholder="월 납입액" aria-label="월 납입액"/><input name="deadline" type="month" aria-label="마감월"/><button type="submit">추가</button></form></section><div id="goalsRoot">${skel}</div><div id="goalToast" class="goalToast" role="status" hidden><span id="goalToastMsg"></span><button type="button" id="goalToastUndo">실행취소</button></div></main><script src="${ACCOUNTBOOK_GOALS_JS_ASSET_PATH}" defer></script></body></html>`;
}
