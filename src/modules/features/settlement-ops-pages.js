
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
  const rows = attachSpenderNames(await fetchAdminRows(env, { month, householdId: selectedHousehold.id, type: "all" }), members);
  const budgets = await fetchBudgets(env, selectedHousehold.id, month);
  const recurring = await fetchRecurring(env, selectedHousehold.id);
  const model = buildBudgetAlertPolishModel({ month, selectedHousehold, rows, budgets, recurring });
  return htmlResponse(renderBudgetAlertPolishHtml({ env, month, households, selectedHousehold, model }));
}

function renderBudgetAlertPolishHtml({ env, month, households, selectedHousehold, model }) {
  const title = escapeHtml(appName(env));
  const opts = safeArray(households).map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selectedHousehold?.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")}</option>`).join("");
  const appHref = `/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const budgetHref = `/budgets?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const recurringHref = `/reserve-plans?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selectedHousehold.id)}`;
  const forecastLabel = model.forecastDiff > 0 ? `예산보다 ${numberWithCommas(model.forecastDiff)}원 초과 예상` : model.totalBudget ? `예산보다 ${numberWithCommas(Math.abs(model.forecastDiff))}원 여유 예상` : "예산 설정 후 계산";
  const afterPendingLabel = model.afterPendingDiff > 0 ? `정기지출 반영 후 ${numberWithCommas(model.afterPendingDiff)}원 초과 가능` : model.totalBudget ? `정기지출 반영 후 ${numberWithCommas(Math.abs(model.afterPendingDiff))}원 여유` : "예산 설정 후 계산";
  const topWarn = [...model.dangerCategories, ...model.warningCategories].slice(0, 5).map((x) => `<span>${escapeHtml(x.category)} ${numberWithCommas(x.rate)}%</span>`).join("") || `<span>주의 분류 없음</span>`;
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 예산 알림</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:26px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#b45309));color:#fff}.hero p{color:#ffedd5;line-height:1.65}.filters{display:grid;grid-template-columns:1fr 160px 110px;gap:8px;margin-top:12px}.filters select,.filters input,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.pill,.state{display:inline-flex;border-radius:999px;padding:6px 10px;font-weight:1000;font-size:12px}.pill.ok,.state.ok{background:#dcfce7;color:#166534}.pill.warn,.state.warn{background:#fef3c7;color:#92400e}.pill.bad,.state.bad{background:#fee2e2;color:#991b1b}.pill.setup{background:#eef2ff;color:#3730a3}.notice{border-radius:20px;padding:16px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;line-height:1.65}.chips{display:flex;flex-wrap:wrap;gap:7px;margin-top:8px}.chips span{display:inline-flex;border-radius:999px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;padding:7px 10px;font-size:12px;font-weight:1000}.actions{display:flex;flex-wrap:wrap;gap:8px}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:14px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 13px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:760px;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:middle}.miniBar{height:9px;background:#eef2f7;border-radius:999px;overflow:hidden;min-width:110px}.miniBar span{display:block;height:100%;border-radius:999px;background:#16a34a}.miniBar span.warn{background:#f59e0b}.miniBar span.bad{background:#ef4444}.recList{display:grid;gap:8px;list-style:none;margin:0;padding:0}.recList li{display:grid;grid-template-columns:1fr auto;gap:6px;border:1px solid #e8edf4;border-radius:16px;padding:12px}.recList span{color:#64748b;font-size:13px}.recList strong{grid-row:1/3;grid-column:2;font-size:18px}.kakaoBox{background:#fefce8;border:1px solid #fde68a;border-radius:18px;padding:14px;color:#713f12;line-height:1.6}.muted{color:#64748b;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}.filters{grid-template-columns:1fr}.metric b{font-size:21px}.recList li{grid-template-columns:1fr}.recList strong{grid-row:auto;grid-column:auto}}</style></head><body>${renderUnifiedNav("budget-alerts", { month, householdId: selectedHousehold.id, householdName: selectedHousehold.name })}<main class="wrap"><section class="hero"><p>${renderBudgetAlertStatusPill(model.status)}</p><h1>예산 알림 센터</h1><p>${escapeHtml(model.statusMessage)}</p><form class="filters" method="get" action="/budget-alerts"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>오늘 사용 가능</span><b>${model.dailyAllowance ? numberWithCommas(model.dailyAllowance) + "원" : "설정 필요"}</b></div><div class="metric"><span>이번 달 사용</span><b>${numberWithCommas(model.spent)}원</b>${model.budget.uncoveredExpense ? `<small style="display:block;color:#64748b;margin-top:3px">예산 잡은 분류 기준 · 예산 밖 지출 ${numberWithCommas(model.budget.uncoveredExpense)}원 별도</small>` : ""}</div><div class="metric"><span>남은 예산</span><b>${model.totalBudget ? numberWithCommas(model.remainingBudget) + "원" : "미설정"}</b></div><div class="metric"><span>월말 예상</span><b>${numberWithCommas(model.forecastExpense)}원</b></div><div class="metric"><span>예산 사용률</span><b>${model.totalBudget ? numberWithCommas(model.rate) + "%" : "-"}</b></div><div class="metric"><span>정기지출 대기</span><b>${numberWithCommas(model.pendingRecurringTotal)}원</b></div></section><section class="card"><h2>이번 달 예산 판단</h2><div class="notice"><b>${escapeHtml(model.statusText)}</b><br/>${escapeHtml(forecastLabel)} · ${escapeHtml(afterPendingLabel)}<div class="chips">${topWarn}</div></div></section><section class="card"><h2>분류별 초과/주의</h2><div class="tableWrap"><table><thead><tr><th>분류</th><th>예산</th><th>사용</th><th>남음</th><th>게이지</th><th>상태</th></tr></thead><tbody>${renderBudgetAlertRows(model)}</tbody></table></div></section><section class="card"><h2>정기지출 반영 예정</h2>${renderPendingRecurringList(model)}</section><section class="card"><h2>카카오 안내 문구</h2><div class="kakaoBox">${escapeHtml(budgetAlertKakaoHint(model))}<br/><br/>추천 발화: <b>남은예산</b>, <b>오늘예산</b>, <b>이번달예상</b>, <b>정기지출</b></div></section><section class="card"><h2>바로가기</h2><div class="actions"><a class="btn" href="${escapeHtml(appHref)}#quick">기록 입력</a><a class="btn light" href="${escapeHtml(budgetHref)}">예산 설정</a><a class="btn light" href="${escapeHtml(recurringHref)}">정기 수입·지출</a><a class="btn light" href="/budget-alert-guide">알림 기준</a></div></section></main></body></html>`;
}

async function handleBudgetAlertGuidePage(request, env, url) {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 예산 알림 가이드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:960px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#b45309));color:#fff}.hero p{color:#ffedd5;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:10px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px}.box p{color:#64748b;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:14px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 14px}</style></head><body><main class="wrap"><section class="hero"><h1>예산 알림 가이드</h1><p>예산 알림은 사용자를 재촉하는 기능이 아니라 오늘 얼마나 써도 되는지 알려주는 생활 안내판입니다.</p><p><a class="btn" href="/budget-alerts">예산 알림 센터</a></p></section><section class="grid"><div class="box"><h2>오늘 사용 가능</h2><p>남은 예산을 남은 날짜로 나눠 계산합니다. 이번 달 예산을 넘기지 않기 위한 하루 기준 금액입니다.</p></div><div class="box"><h2>월말 예상</h2><p>오늘까지의 평균 지출 속도를 월말까지 이어간다고 가정해 예상 지출을 계산합니다.</p></div><div class="box"><h2>정기지출 반영 예정</h2><p>아직 이번 달에 반영되지 않은 정기지출을 별도로 보여줘서 월말 예상의 빈칸을 줄입니다.</p></div><div class="box"><h2>초과/주의 분류</h2><p>분류별 예산 대비 85% 이상이면 주의, 100% 이상이면 초과로 표시합니다.</p></div></section><section class="card"><h2>운영 기준</h2><p>이 화면은 기존 거래 저장 로직과 권한 구조를 바꾸지 않습니다. 로그인 사용자는 자신이 참여한 가계부 범위 안에서만 예산 알림을 볼 수 있습니다.</p></section></main></body></html>`);
}

function settlementRoleAllowed(role = "") {
  return !["blocked"].includes(String(role || "").toLowerCase());
}

function buildSettlementModel(rows = [], members = [], options = {}) {
  const memberMap = memberNameMap(members);
  const participantIds = new Set();
  for (const m of safeArray(members)) {
    const role = String(m.role || "member").toLowerCase();
    if (m.user_id && settlementRoleAllowed(role) && role !== "pending") participantIds.add(m.user_id);
  }
  const paidBy = {};
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
  const ids = [...participantIds];
  const participantCount = Math.max(1, ids.length || 1);
  const mode = ["equal", "ratio", "headcount", "item"].includes(String(options.mode || "")) ? String(options.mode) : "equal";
  const weights = {};
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
      allocate(row.amount, selected.length ? selected : ids, Object.fromEntries(ids.map((id) => [id, 1])));
    }
  } else {
    allocate(totalExpense, ids, weights);
  }
  const share = Math.round(totalExpense / participantCount);
  const people = ids.map((id) => {
    const paid = Math.round(paidBy[id] || 0);
    const personShare = Math.round(owedBy[id] || 0);
    const balance = paid - personShare;
    return { user_id: id, name: memberMap[id] || "이전 구성원", paid, share: personShare, balance, weight: weights[id] || 1 };
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
  return { mode, totalExpense, participantCount, share, people, transfers, unknownPaid, itemCount: expenseRows.length };
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
  const hhRows = households.length ? households.map((h) => `<tr><td>${escapeHtml(h.name || "가계부")}</td><td>${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</td><td><a class="mini" href="/settlement-summary?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">정산</a> <a class="mini light" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(h.id)}">기록</a></td></tr>`).join("") : `<tr><td colspan="3">로그인 후 내가 참여한 가계부가 표시됩니다.</td></tr>`;
  const templates = [
    ["여행 가계부", "숙소·식비·교통비를 참여자별로 기록하고 마지막에 1/N 정산합니다.", "우리 여행 경비", "✈️", "travel"],
    ["모임비 가계부", "정기 모임 회비, 식사, 장소 대관비를 따로 관리합니다.", "우리 모임 회비", "🍻", "meeting"],
    ["단발성 정산", "하루 행사나 공동구매처럼 짧게 쓰고 종료 후 보관합니다.", "단발성 정산", "🧾", "settlement"],
    ["가족 외식/행사", "가족 모임 지출을 기존 생활비와 분리해 확인합니다.", "가족 행사비", "👨‍👩‍👧‍👦", "family_event"],
  ].map((x) => renderTemplateCreateForm(...x)).join("");
  const loginHint = userId ? `<a class="btn" href="/my/households">가계부 전환·추가</a>` : `<a class="btn" href="/my">로그인하고 만들기</a>`;
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 모임·여행 가계부</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1080px;margin:0 auto;padding:16px 16px 110px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0891b2));color:#fff}.hero p{color:#cffafe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px}.tmpl{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:17px;display:grid;gap:8px}.tmpl .emoji{font-size:32px}.tmpl b{font-size:18px}.tmpl p,.muted{color:#64748b;line-height:1.6}.tmpl small{color:#475569;font-weight:900}.templateStart,.btn,.mini{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border:0;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px;cursor:pointer}.mini{min-height:32px;font-size:12px}.mini.light,.btn.light{background:#eff6ff;color:#1e3a8a!important}table{width:100%;border-collapse:collapse}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left}.steps{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:8px}.step{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:12px;font-weight:900}@media(max-width:760px){.wrap{padding:12px 10px 120px}.hero h1{font-size:25px}.grid{grid-template-columns:1fr}.card{padding:16px;border-radius:19px}}</style></head><body>${renderUnifiedNav("households", { month })}<main class="wrap"><section class="hero"><h1>모임·여행 가계부</h1><p>템플릿은 분류와 진행 순서를 제안할 뿐 이름을 날짜로 확정하지 않습니다. 다음 화면에서 가계부 이름과 이 가계부에서 보일 내 이름만 확인한 뒤 생성합니다.</p><p>${loginHint} <a class="btn light" href="/settlement-summary?month=${encodeURIComponent(month)}">정산 요약</a> <a class="btn light" href="/meeting-archive">보관 가이드</a></p></section><section class="card"><h2>빠른 템플릿</h2><div class="grid">${templates}</div></section><section class="card"><h2>운영 흐름</h2><div class="steps"><div class="step">1. 가계부 이름·내 표시 이름</div><div class="step">2. 가계부 생성</div><div class="step">3. 초대코드 공유</div><div class="step">4. 참여자별 기록·정산</div><div class="step">5. 백업 후 보관 또는 삭제</div></div></section><section class="card"><h2>내가 참여한 가계부</h2><table><thead><tr><th>가계부</th><th>권한</th><th>바로가기</th></tr></thead><tbody>${hhRows}</tbody></table></section></main></body></html>`);
}

function renderSettlementRows(model) {
  if (!model.people.length) return `<tr><td colspan="4">정산할 참여자 또는 지출 기록이 없습니다.</td></tr>`;
  return model.people.map((p) => {
    const cls = p.balance > 0 ? "plus" : p.balance < 0 ? "minus" : "zero";
    const label = p.balance > 0 ? `받을 금액 ${numberWithCommas(p.balance)}원` : p.balance < 0 ? `보낼 금액 ${numberWithCommas(Math.abs(p.balance))}원` : "정산 완료";
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
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 정산 요약</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.65}.filters{display:grid;grid-template-columns:1fr 160px 100px;gap:8px}.filters select,.filters input,.filters button{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 12px;font:inherit}.filters button{background:#111827;color:#fff;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:24px;margin-top:5px}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:720px;background:#fff}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:middle}.plus{color:#166534;font-weight:1000}.minus{color:#b91c1c;font-weight:1000}.zero{color:#64748b;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff!important;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a!important}.copy{background:#f8fafc;border:1px solid #e5e7eb;border-radius:16px;padding:13px;line-height:1.6}.muted{color:#64748b;line-height:1.6}@media(max-width:760px){.wrap{padding:12px}.filters{grid-template-columns:1fr}.metric b{font-size:21px}}</style></head><body>${renderUnifiedNav("settlement", { month, householdId: selected.id, householdName: selected.name })}<main class="wrap"><section class="hero"><h1>정산 요약</h1><p>${escapeHtml(selected.name || "가계부")}의 ${escapeHtml(month)} 지출을 참여자별로 1/N 기준 정리합니다. 실제 송금 전에는 참여자와 금액을 반드시 확인하세요.</p><form class="filters" method="get" action="/settlement-summary"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><button type="submit">조회</button></form></section><section class="grid"><div class="metric"><span>총 지출</span><b>${numberWithCommas(model.totalExpense)}원</b></div><div class="metric"><span>참여자</span><b>${numberWithCommas(model.participantCount)}명</b></div><div class="metric"><span>1인 부담 기준</span><b>${shareText}</b></div><div class="metric"><span>지출 건수</span><b>${numberWithCommas(rows.length)}건</b></div></section><section class="card"><h2>참여자별 정산</h2><div class="tableWrap"><table><thead><tr><th>참여자</th><th>낸 금액</th><th>1/N 기준</th><th>정산 상태</th></tr></thead><tbody>${renderSettlementRows(model)}</tbody></table></div></section><section class="card"><h2>송금 제안</h2><div class="tableWrap"><table><thead><tr><th>보낼 사람</th><th>받을 사람</th><th>금액</th></tr></thead><tbody>${renderTransferRows(model.transfers)}</tbody></table></div><p class="muted">계산 방식은 단순 1/N입니다. 회비, 제외 인원, 개인별 부담 비율은 실제 모임 규칙에 맞게 확인하세요.</p></section><section class="card"><h2>공유 문구</h2><div class="copy">${escapeHtml(selected.name || "가계부")} 정산 요약<br/>총 지출: ${numberWithCommas(model.totalExpense)}원<br/>참여자: ${numberWithCommas(model.participantCount)}명<br/>1인 기준: ${shareText}<br/>초대/참여 문구: ${escapeHtml(inviteText)}</div><p><a class="btn" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}#quick">기록 추가</a><a class="btn light" href="/meeting-households?month=${encodeURIComponent(month)}">템플릿</a><a class="btn light" href="/meeting-archive">보관 가이드</a></p></section></main></body></html>`);
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
  let lease = null;
  try {
    const rows = await fetchAdminRows(env, { month, householdId: selected.id, type: "expense" });
    const members = await fetchHouseholdMembers(env, selected.id);
    const model = buildSettlementModel(rows, members, { mode });
    const note = String(form.get("note") || "").trim().slice(0, 160);
    // 정산 이력은 JSON 한 행을 읽고 다시 쓰므로 가계부 단위 잠금으로
    // 서로 다른 완료 요청까지 직렬화해 이력 유실과 중복을 함께 막습니다.
    lease = await claimOperationLease(env, {
      key: `settlement-history:${selected.id}`,
      owner: operationLeaseOwner("settlement"),
      leaseSeconds: Number(env.SETTLEMENT_LEASE_SECONDS || 60),
    });
    if (!lease.acquired) return redirectResponse(`${returnTo}&err=settlement_busy`);
    const history = parseJsonArraySettingStrict(await getSettingValueStrict(env, settlementHistoryKey(selected.id)), "settlement_history_json_invalid");
    const duplicate = history.some((item) => {
      const completedAt = Date.parse(String(item.completed_at || ""));
      const recent = Number.isFinite(completedAt) && Date.now() - completedAt >= 0 && Date.now() - completedAt < 5 * 60 * 1000;
      return recent && item.month === month && item.mode === mode && Number(item.total_expense || 0) === Number(model.totalExpense || 0) && String(item.note || "") === note && String(item.completed_by || "") === String(userId);
    });
    if (duplicate) return redirectResponse(`${returnTo}&msg=settlement_already_completed`);
    history.push({ id: crypto.randomUUID(), month, mode, total_expense: model.totalExpense, participant_count: model.participantCount, note, completed_by: userId, completed_at: new Date().toISOString(), status: "completed" });
    await saveSettingValue(env, settlementHistoryKey(selected.id), history.slice(-30));
    return redirectResponse(`${returnTo}&msg=settlement_completed`);
  } catch (err) {
    rememberOpsEvent({ kind: "settlement_history_save_failed", severity: "warn", path: "/my/settlement/save", method: "POST", detail: safeError(err) });
    return redirectResponse(`${returnTo}&err=settlement_save_failed`);
  } finally {
    if (lease?.acquired) await releaseOperationLease(env, lease);
  }
}

function renderSettlementConfig({ mode = "equal", members = [], rows = [], weights = {}, itemParticipants = {}, month = currentMonthKst(), householdId = "" }) {
  const activeMembers = safeArray(members).filter((m) => m.user_id && settlementRoleAllowed(m.role) && String(m.role || "") !== "pending");
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

function renderSettlementHistory(history = []) {
  const rows = safeArray(history).slice().reverse().slice(0, 8);
  if (!rows.length) return `<p class="muted">완료 처리한 정산이 아직 없습니다.</p>`;
  return `<div class="tableWrap"><table><thead><tr><th>완료일</th><th>대상 월</th><th>방식</th><th>총 지출</th><th>메모</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${escapeHtml(String(item.completed_at || "").slice(0, 10))}</td><td>${escapeHtml(item.month || "")}</td><td>${escapeHtml({ equal: "동일", ratio: "비율", headcount: "인원수", item: "품목별" }[item.mode] || item.mode || "동일")}</td><td>${numberWithCommas(item.total_expense)}원</td><td>${escapeHtml(item.note || "-")}</td></tr>`).join("")}</tbody></table></div>`;
}

async function handleSettlementSummaryPage(request, env, url) {
  const userId = await verifyUserSession(request, env);
  if (!userId) return redirectResponse("/my");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const user = await fetchUserById(env, userId);
  const access = await getMySelectedHousehold(env, userId, url.searchParams.get("household_id") || "");
  if (access.restricted) return myAccessStatusResponse({ env, user, household: access.restricted, role: access.restricted.role, month });
  if (!access.selected) return redirectResponse("/my?err=household_required");
  const selected = access.selected;
  const [members, rows, historyValue] = await Promise.all([fetchHouseholdMembers(env, selected.id), fetchAdminRows(env, { month, householdId: selected.id, type: "expense" }), getSettingValue(env, settlementHistoryKey(selected.id))]);
  const mode = ["equal", "ratio", "headcount", "item"].includes(String(url.searchParams.get("mode") || "")) ? String(url.searchParams.get("mode")) : "equal";
  const weights = {};
  for (const member of safeArray(members)) weights[member.user_id] = Math.max(0.1, Number(url.searchParams.get(`weight_${member.user_id}`) || 1));
  const itemParticipants = {};
  for (const row of safeArray(rows).slice(0, 40)) itemParticipants[row.id] = url.searchParams.getAll(`item_${row.id}`).map(String);
  const model = buildSettlementModel(rows, members, { mode, weights, itemParticipants });
  const history = parseJsonSetting(historyValue, []);
  const opts = access.households.map((h) => `<option value="${escapeHtml(h.id)}" data-household-name="${escapeHtml(h.name || "가계부")}"${String(h.id) === String(selected.id) ? " selected" : ""}>${escapeHtml(h.name || "가계부")} · ${escapeHtml(userHouseholdRoleLabel(h.role || "member"))}</option>`).join("");
  const modeOptions = [["equal", "동일 분배"], ["ratio", "비율 분배"], ["headcount", "인원수 분배"], ["item", "품목별 참여자"]].map(([value, label]) => `<option value="${value}"${mode === value ? " selected" : ""}>${label}</option>`).join("");
  const modeLabel = { equal: "동일 분배", ratio: "비율 분배", headcount: "인원수 분배", item: "품목별 분배" }[mode];
  const transferText = model.transfers.map((t) => `${t.from} → ${t.to} ${numberWithCommas(t.amount)}원`).join("\n") || "송금 제안 없음";
  const inviteText = canManageMyHousehold(selected.role) && selected.invite_code ? `가계부 참여 ${selected.invite_code}` : "초대코드는 소유자·관리자만 확인할 수 있습니다.";
  const canComplete = canManageMyHousehold(selected.role);
  const settlementMessage = url.searchParams.get("msg") || "";
  const message = settlementMessage === "settlement_completed"
    ? `<div class="ok">정산 완료 상태와 이력을 저장했습니다.</div>`
    : settlementMessage === "settlement_already_completed"
      ? `<div class="ok">같은 조건의 완료 이력이 이미 있어 중복 저장하지 않았습니다.</div>`
      : "";
  const settlementError = url.searchParams.get("err") || "";
  const error = settlementError === "settlement_busy"
    ? `<div class="error">다른 정산 저장이 진행 중입니다. 같은 버튼을 반복해서 누르지 말고 잠시 후 이력을 확인해 주세요.</div>`
    : settlementError === "settlement_save_failed"
      ? `<div class="error">정산 완료 이력을 저장하지 못했습니다. 기존 이력은 유지됩니다. 같은 버튼을 반복하지 말고 잠시 후 다시 시도해 주세요.</div>`
    : settlementError
      ? `<div class="error">정산 상태를 저장하지 못했습니다. 확인 체크와 관리 권한을 확인해 주세요.</div>`
      : "";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><meta name="robots" content="noindex,nofollow"/><title>${escapeHtml(appName(env))} · 고급 정산</title><style>*{box-sizing:border-box}body{margin:0;background:#f7f8fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1120px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:12px 0;box-shadow:0 12px 30px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff}.hero p{color:#ccfbf1;line-height:1.6}.filters{display:grid;grid-template-columns:1fr 150px 160px 100px;gap:8px}.filters select,.filters input,.filters button,.weight input{height:44px;border:1px solid #d1d5db;border-radius:14px;background:#fff;padding:0 11px;font:inherit}.filters button,button{background:#111827;color:#fff;border:0;font-weight:1000}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e8edf4;border-radius:19px;padding:15px}.metric span{display:block;color:#64748b;font-size:12px;font-weight:900}.metric b{display:block;font-size:23px;margin-top:5px}.tableWrap{overflow:auto;border:1px solid #e8edf4;border-radius:18px}table{width:100%;border-collapse:collapse;min-width:680px}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px}.plus{color:#166534;font-weight:1000}.minus{color:#b91c1c;font-weight:1000}.zero{color:#64748b;font-weight:1000}.weightGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:8px;margin:10px 0}.weight{display:grid;gap:5px;border:1px solid #e5e7eb;border-radius:16px;padding:11px}.weight span{font-weight:1000}.weight small{color:#64748b}.itemGrid{display:grid;gap:9px;margin:10px 0}.itemSplit{border:1px solid #e5e7eb;border-radius:17px;padding:13px}.itemSplit span{display:block;color:#64748b;font-size:12px;margin-top:4px}.checks{display:flex;gap:8px;flex-wrap:wrap;margin-top:9px}.checks label{background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:12px}.btn,button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;padding:0 13px;text-decoration:none;color:#fff!important;cursor:pointer}.light{background:#eff6ff!important;color:#1e3a8a!important}.note,.copy,.ok,.error{border-radius:16px;padding:13px;line-height:1.6}.note,.copy{background:#f8fafc;border:1px solid #e5e7eb;color:#475569}.ok{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46}.error{background:#fef2f2;border:1px solid #fecaca;color:#991b1b}.muted{color:#64748b;line-height:1.6}.complete{display:grid;gap:9px}.complete input[type=text]{width:100%;border:1px solid #cbd5e1;border-radius:14px;padding:11px;font:inherit}@media(max-width:760px){.wrap{padding:12px}.filters{grid-template-columns:1fr}.btn,button{width:100%;margin:4px 0}.checks{display:grid}.hero h1{font-size:25px}}</style></head><body>${renderUnifiedNav("settlement", { month, householdId: selected.id, householdName: selected.name })}<main class="wrap">${message}${error}<section class="hero"><h1>고급 정산</h1><p>${escapeHtml(selected.name || "가계부")} · 동일, 비율, 인원수, 품목별 참여자 중 실제 모임 규칙에 맞는 방식을 선택하세요.</p><form class="filters" method="get" action="/settlement-summary"><select name="household_id">${opts}</select><input type="month" name="month" value="${escapeHtml(month)}"/><select name="mode">${modeOptions}</select><button type="submit">조회</button></form></section><section class="card"><h2>${escapeHtml(modeLabel)} 설정</h2>${renderSettlementConfig({ mode, members, rows, weights, itemParticipants, month, householdId: selected.id })}</section><section class="grid"><div class="metric"><span>정산 대상 지출</span><b>${numberWithCommas(model.totalExpense)}원</b></div><div class="metric"><span>참여자</span><b>${numberWithCommas(model.participantCount)}명</b></div><div class="metric"><span>평균 부담</span><b>${numberWithCommas(model.share)}원</b></div><div class="metric"><span>지출 건수</span><b>${numberWithCommas(model.itemCount)}건</b></div><div class="metric"><span>최소 송금 제안</span><b>${numberWithCommas(model.transfers.length)}건</b></div></section>${model.unknownPaid ? `<section class="card"><div class="error">지출자 미지정 ${numberWithCommas(model.unknownPaid)}원은 정산에서 제외했습니다. 기록 화면에서 지출자를 지정한 뒤 다시 계산하세요.</div></section>` : ""}<section class="card"><h2>참여자별 정산</h2><div class="tableWrap"><table><thead><tr><th>참여자</th><th>낸 금액</th><th>부담액</th><th>정산 상태</th></tr></thead><tbody>${renderSettlementRows(model)}</tbody></table></div></section><section class="card"><h2>송금 횟수를 줄인 제안</h2><div class="tableWrap"><table><thead><tr><th>보낼 사람</th><th>받을 사람</th><th>금액</th></tr></thead><tbody>${renderTransferRows(model.transfers)}</tbody></table></div><p class="muted">받을 금액과 보낼 금액을 큰 순서로 맞춰 불필요한 교차 송금을 줄였습니다. 실제 송금 전에 참여자와 금액을 확인하세요.</p></section><section class="card"><h2>공유 문구</h2><div class="copy" id="settlementCopy">${escapeHtml(selected.name || "가계부")} ${escapeHtml(month)} 정산<br/>방식: ${escapeHtml(modeLabel)}<br/>총 지출: ${numberWithCommas(model.totalExpense)}원<br/>참여자: ${numberWithCommas(model.participantCount)}명<br/><br/>${escapeHtml(transferText).replace(/\n/g, "<br/>")}<br/><br/>초대/참여 문구: ${escapeHtml(inviteText)}</div><p><button type="button" id="copySettlement">문구 복사</button><a class="btn light" href="/app?month=${encodeURIComponent(month)}&household_id=${encodeURIComponent(selected.id)}#quick">기록 추가</a></p></section><section class="card"><h2>정산 완료·이력</h2>${canComplete ? `<form class="complete" method="post" action="/my/settlement/save"><input type="hidden" name="household_id" value="${escapeHtml(selected.id)}"/><input type="hidden" name="month" value="${escapeHtml(month)}"/><input type="hidden" name="mode" value="${escapeHtml(mode)}"/><input type="text" name="note" placeholder="예: 7월 여행 정산 완료" maxlength="160"/><label><input type="checkbox" name="confirmed" value="yes" required/> 참여자와 금액을 확인했고 완료 이력으로 저장합니다.</label><button type="submit">정산 완료로 저장</button></form>` : `<p class="note">소유자·관리자가 완료 상태를 저장할 수 있습니다.</p>`}${renderSettlementHistory(history)}</section></main><script>(function(){var b=document.getElementById('copySettlement'),box=document.getElementById('settlementCopy');if(!b||!box)return;b.addEventListener('click',function(){var text=box.innerText;var done=function(){b.textContent='복사됨';};if(navigator.clipboard&&navigator.clipboard.writeText)navigator.clipboard.writeText(text).then(done);else{window.prompt('복사하세요',text);}});})();</script></body></html>`);
}

async function handleMeetingArchiveGuidePage(request, env, url) {
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${escapeHtml(appName(env))} · 모임 보관 가이드</title><style>body{margin:0;background:#f8fafc;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:960px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e5e7eb;border-radius:24px;padding:22px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#7c3aed));color:#fff}.hero p{color:#ede9fe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.box{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px}.box p{color:#64748b;line-height:1.6}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.note{background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;border-radius:16px;padding:13px;line-height:1.6}</style></head><body><main class="wrap"><section class="hero"><h1>모임 종료·보관 가이드</h1><p>단발성 모임이나 여행 가계부는 정산 후 삭제보다 보관을 권장합니다. 기록을 남기되, 추가 입력을 막는 방식은 권한 조정으로 운영합니다.</p><p><a class="btn" href="/my/households">가계부 전환·참여</a><a class="btn" href="/settlement-summary">정산 요약</a></p></section><section class="grid"><div class="box"><h2>1. 정산 완료</h2><p>/settlement-summary에서 참여자별 금액과 송금 제안을 확인합니다.</p></div><div class="box"><h2>2. 백업</h2><p>/backup에서 CSV 또는 JSON 백업을 받은 뒤 종료 처리를 진행합니다.</p></div><div class="box"><h2>3. 권한 조정</h2><p>owner/admin이 참여자를 viewer로 바꾸면 조회는 가능하고 추가 입력은 제한됩니다.</p></div><div class="box"><h2>4. 이름 정리</h2><p>가계부 이름 앞에 [종료] 또는 [보관]을 붙여 실사용 장부와 구분합니다.</p></div></section><section class="card"><h2>운영 원칙</h2><div class="note">이번 버전은 별도 보관 테이블을 만들지 않습니다. 기존 권한 구조와 가계부 범위 안전성을 유지하면서 “정산 완료 후 viewer 전환 + 이름 변경 + 백업” 흐름으로 관리합니다.</div></section></main></body></html>`);
}

async function handleDuplicateSafetyPage(request, env, url) {
  const adminOk = await verifyAdminSession(request, env);
  if (!adminOk) return redirectResponse("/admin-view");
  return htmlResponse(renderDuplicateSafetyHtml(env));
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
  const status = errCount ? "주의" : warnCount ? "관찰" : "정상";
  const statusClass = errCount ? "bad" : warnCount ? "warn" : "ok";
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>${title} · 운영 대시보드</title><style>*,*:before,*:after{box-sizing:border-box}body{margin:0;background:#f8fafc;color:#101828;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;letter-spacing:-.025em}.wrap{max-width:1180px;margin:0 auto;padding:16px}.hero,.card{background:#fff;border:1px solid #e8edf4;border-radius:24px;padding:20px;margin:14px 0;box-shadow:0 14px 34px rgba(15,23,42,.055)}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#1d4ed8));color:#fff}.hero p{color:#dbeafe;line-height:1.65}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.box{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:15px}.box span{display:block;color:#64748b;font-size:12px;font-weight:900}.box b{display:block;margin-top:6px;font-size:25px}.ok{color:#166534}.warn{color:#b45309}.bad{color:#b91c1c}.scroll{overflow:auto;border:1px solid #e8edf4;border-radius:18px;background:#fff}table{width:100%;border-collapse:collapse;min-width:780px}td,th{border-bottom:1px solid #e8edf4;padding:10px;text-align:left;font-size:13px;vertical-align:top}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 12px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.note{color:#64748b;line-height:1.6}.badge{display:inline-flex;border-radius:999px;padding:7px 11px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:1000}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:25px}table{min-width:680px}}</style></head><body>${renderUnifiedNav("operation-center", { showOps: true })}<main class="wrap"><section class="hero"><span class="badge">${escapeHtml(APP_VERSION)}</span><h1>운영 대시보드</h1><p>최근 오류, 과도 요청 제한, 카카오 발화 이벤트를 한 화면에서 확인합니다. 장기 저장은 하지 않는 인스턴스 메모리 기반 운영 패널입니다.</p><p><a class="btn light" href="/operation-center">운영센터</a><a class="btn light" href="/ops-monitor">종합 관제 · 사용량과 이력</a><a class="btn light" href="/ops-traffic">트래픽</a><a class="btn light" href="/ops-duplicates">중복 방어</a><a class="btn light" href="/skill-ops">스킬 운영</a><a class="btn light" href="/ops-snapshot.json">JSON 스냅샷</a></p></section><section class="grid"><div class="box"><span>현재 인스턴스의 관측 상태</span><b class="${statusClass}">${status}</b></div><div class="box"><span>최근 오류</span><b>${numberWithCommas(errCount)}</b></div><div class="box"><span>최근 경고</span><b>${numberWithCommas(warnCount)}</b></div><div class="box"><span>Traffic 활성 버킷</span><b>${numberWithCommas(traffic.activeBuckets || 0)}</b></div><div class="box"><span>Skill 활성 버킷</span><b>${numberWithCommas(skill.activeBuckets || 0)}</b></div><div class="box"><span>쓰기 제한 기준</span><b>${numberWithCommas(snap.limits.traffic_guard_limit)}/분</b></div></section><section class="card"><h2>최근 운영 이벤트</h2><div class="scroll"><table><thead><tr><th>시간</th><th>등급</th><th>종류</th><th>Method</th><th>Path</th><th>상세</th></tr></thead><tbody>${opsRows}</tbody></table></div><p class="note">안전모드 전환, 서버 오류, 예약 실행 오류, 과도 요청 제한이 여기에 표시됩니다.</p></section><section class="card"><h2>최근 과도 요청 제한</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>Method</th><th>Path</th><th>상세</th></tr></thead><tbody>${trafficRows}</tbody></table></div></section><section class="card"><h2>최근 카카오 발화 이벤트</h2><div class="scroll"><table><thead><tr><th>시간</th><th>종류</th><th>User Key</th><th>발화</th><th>상세</th></tr></thead><tbody>${skillRows}</tbody></table></div></section></main></body></html>`);
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
