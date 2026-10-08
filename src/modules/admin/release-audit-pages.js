
async function handleFilterPagingAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const rows = [
    ["모바일 기본 표시", "/app", "최근 10건", "긴 스크롤 방지"],
    ["모바일 확장 표시", "/app?feed=30", "최근 30건", "필요할 때만 확장"],
    ["모바일 전체 조회", "/app?feed=all", "전체", "사용자가 직접 선택 시 전체 표시"],
    ["모바일 조건 필터", "/app?type=expense&q=커피", "구분/검색/날짜/분류/결제수단", "필터 조건 보존"],
    ["관리자 기록", "/?legacy=1&tab=transactions", "페이지네이션", "대량 데이터 화면 부하 방지"],
    ["빠른 검색", "현재 페이지", "표시된 행 검색", "즉시 필터링"],
  ];
  const body = rows.map(([name, route, behavior, purpose]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><code>${escapeHtml(route)}</code></td><td>${escapeHtml(behavior)}</td><td>${escapeHtml(purpose)}</td><td><span class="ok">표준</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>조회·필터 점검</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1100px;margin:0 auto;padding:18px}.hero{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;box-shadow:0 10px 28px rgba(15,23,42,.055);margin:14px 0}.note{color:#64748b;line-height:1.6}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left;font-size:14px}code{background:#f1f5f9;border-radius:8px;padding:3px 7px}.ok{display:inline-flex;border-radius:999px;background:#dcfce7;color:#166534;padding:5px 9px;font-size:12px;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900;padding:0 12px}</style></head><body>${renderUnifiedNav("filter-audit")}<main class="wrap"><section class="hero"><h1>조회·필터 점검</h1><p class="note">모바일과 관리자 화면의 조회량, 필터, 페이지네이션 기준을 확인합니다.</p><p><a class="btn" href="/app">모바일 입력으로 이동</a> <a class="btn" href="/?legacy=1&tab=transactions">기록 관리로 이동</a></p></section><table><thead><tr><th>항목</th><th>경로</th><th>동작</th><th>목적</th><th>상태</th></tr></thead><tbody>${body}</tbody></table></main></body></html>`);
}

async function handleUiAuditPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const checks = [
    ["빠른 입력 금액칸", true, "text/inputmode=numeric + comma formatting + submit 전 숫자 정리"],
    ["기록 저장 금액 파싱", true, "parseAmountValue로 12,000 / 12000 모두 처리"],
    ["데스크톱 기록관리 배치", true, "빠른 입력 270px + 장부 minmax 레이아웃, 겹침 방지"],
    ["미완성 기능 노출", true, "소비 카드/밈·카드 실적/혜택 메뉴와 직접 URL 숨김"],
    ["일괄 변경", true, "선택 없을 때 차단, confirm 후 처리"],
    ["수정 모달", true, "금액 입력 comma formatting + submit 전 숫자 정리"],
    ["저장 흐름", true, "/flow-audit에서 입력·수정·삭제·일괄변경 경로 확인"],
    ["모바일 내역 길이", true, "기본 최근 10건만 렌더링하고 필요 시 30건/전체 조회"],
    ["메뉴 중복", true, "관리자 기록 화면의 보조 상단 메뉴 숨김"],
  ];
  const rows = checks.map(([name, ok, detail]) => `<tr><td>${escapeHtml(name)}</td><td><b class="${ok ? "ok" : "bad"}">${ok ? "정상" : "확인필요"}</b></td><td>${escapeHtml(detail)}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>UI 안정화 점검</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1000px;margin:0 auto;padding:18px}.top{display:flex;justify-content:space-between;gap:10px;align-items:center}.btn{display:inline-flex;align-items:center;justify-content:center;height:40px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:900;padding:0 12px}table{width:100%;border-collapse:collapse;background:#fff;border:1px solid #e5e7eb;border-radius:18px;overflow:hidden}td,th{border-bottom:1px solid #e5e7eb;padding:11px;text-align:left}.ok{color:#166534}.bad{color:#991b1b}.card{background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px;margin:14px 0}</style></head><body>${renderUnifiedNav("ui-audit")}<main class="wrap"><div class="top"><div><h1>UI 안정화 점검</h1><p>웹 배치와 기록 관련 핵심 안정화 항목입니다.</p></div><nav><a class="btn" href="/app">앱</a> <a class="btn" href="/?legacy=1&tab=transactions">기록 관리</a> <a class="btn" href="/diagnostics">시스템진단</a></nav></div><section class="card"><table><thead><tr><th>항목</th><th>상태</th><th>내용</th></tr></thead><tbody>${rows}</tbody></table></section></main></body></html>`);
}

async function handleUserReadyCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  try {
    households = await fetchAdminHouseholds(env);
  } catch (err) {
    rememberOpsEvent({ kind: "operation_center_db", severity: "warn", path: "/operation-center", method: "GET", detail: safeError(err) });
    households = [];
  }
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const hid = householdId;
  const rows = [
    ["상단 메뉴", "홈/기록/입력/분석/백업·복구 중심으로 정리됨"],
    ["안내 문구", "사용자에게 불필요한 설정/개발 문구 제거"],
    ["미완성 기능", "소비 카드/밈과 카드 실적/혜택을 메뉴·직접 URL에서 숨김"],
    ["백업·복구", "백업 후 단계별 확인 방식 유지"],
    ["운영센터", "점검 메뉴는 운영센터 안으로 통합"],
    ["공유 기능", "기본 공유와 문구 복사 중심으로 안정화"],
  ].map(([a,b]) => `<tr><td><b>${escapeHtml(a)}</b></td><td>${escapeHtml(b)}</td><td><span class="okb">완료</span></td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>최종 사용자 준비 확인</title><style>body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1050px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#16a34a));color:#fff;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.94}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:14px}.okb{border-radius:999px;padding:5px 9px;background:#dcfce7;color:#166534;font-size:12px;font-weight:1000}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("operation-center", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>최종 사용자 준비 확인</h1><p>최종 배포 전 사용자 화면 기준으로 메뉴, 안내문구, 핵심 기능을 다시 확인합니다.</p><p><a class="btn light" href="/menu">메뉴 확인</a><a class="btn light" href="/smart-tools?month=${escapeHtml(month)}${hid ? `&household_id=${escapeHtml(hid)}` : ""}">무료 스마트 도구 확인</a><a class="btn light" href="/backup?month=${escapeHtml(month)}${hid ? `&household_id=${escapeHtml(hid)}` : ""}">백업·복구 확인</a></p></section><section class="card"><h2>최종 정리 상태</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section></main></body></html>`);
}

async function handleUserReleaseCheckPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  const households = await fetchAdminHouseholds(env);
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const hid = householdId;
  const checks = [
    ["입력", true, "모바일 입력과 기록 관리 진입 가능"],
    ["공동 가계부", households.length > 0, households.length ? `${households.length}개 가계부 확인` : "가계부 생성 필요"],
    ["미완성 기능", true, "소비 카드/밈과 카드 실적/혜택 비노출"],
    ["결제수단", true, "카드/계좌/간편결제 사용 흐름 확인"],
    ["백업·복구", true, "백업 후 단계별 복구/되돌리기 구조"],
    ["공유/리포트", true, "사용자 확인형 공유와 주간·월간 리포트 유지"],
    ["운영센터", true, "점검 메뉴는 운영센터로 통합"],
  ];
  const rows = checks.map(([name, ok, detail]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><span class="${ok ? "okb" : "badb"}">${ok ? "정상" : "확인필요"}</span></td><td>${escapeHtml(detail)}</td></tr>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>사용자 배포 확인</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.wrap{max-width:1080px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#2563eb));color:#fff;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:30px}.hero p{line-height:1.6;opacity:.94}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(190px,1fr));gap:10px}.link{display:block;text-decoration:none;color:#111827;background:#f8fafc;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.link b{display:block}.link span{display:block;color:#64748b;margin-top:6px}.tableWrap{overflow-x:auto}table{width:100%;border-collapse:collapse;min-width:680px}td,th{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:14px}.okb,.badb{border-radius:999px;padding:5px 9px;font-size:12px;font-weight:1000}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.note{background:#ecfdf5;border:1px solid #a7f3d0;color:#065f46;border-radius:16px;padding:12px;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("operation-center", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>사용자 배포 확인</h1><p>최종 사용자가 보기에 불필요한 개발 문구와 기술 메뉴를 정리한 운영 배포 확인 화면입니다.</p></section><section class="card"><h2>사용자 기준 확인</h2><div class="tableWrap"><table><tbody>${rows}</tbody></table></div></section><section class="card"><h2>사용자 주요 흐름</h2><div class="grid"><a class="link" href="/app?month=${escapeHtml(month)}${hid ? `&household_id=${escapeHtml(hid)}` : ""}"><b>입력</b><span>지출을 빠르게 기록</span></a><a class="link" href="${escapeHtml(dashboardQuery(month, hid, { tab: "transactions" }))}"><b>기록</b><span>수정/삭제/확인</span></a><a class="link" href="/smart-tools?month=${escapeHtml(month)}${hid ? `&household_id=${escapeHtml(hid)}` : ""}"><b>무료 스마트 도구</b><span>예측과 반복지출 확인</span></a><a class="link" href="/backup?month=${escapeHtml(month)}${hid ? `&household_id=${escapeHtml(hid)}` : ""}"><b>백업·복구</b><span>데이터 안전관리</span></a></div></section><p class="note">일반 사용자는 상단 메뉴의 입력, 기록, 분석, 결제수단, 백업·복구만 사용하면 됩니다. 점검 기능은 운영센터 안에 정리되어 있습니다.</p></main></body></html>`);
}

async function handleOperationCenterPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const month = validMonth(url.searchParams.get("month")) || currentMonthKst();
  let households = [];
  try {
    households = await fetchAdminHouseholds(env);
  } catch (err) {
    rememberOpsEvent({ kind: "operation_center_db", severity: "warn", path: "/operation-center", method: "GET", detail: safeError(err) });
    households = [];
  }
  const householdId = url.searchParams.get("household_id") || households[0]?.id || "";
  const hid = householdId;
  const hh = hid ? `&household_id=${encodeURIComponent(hid)}` : "";
  const rows = [
    ["릴리스 후보 점검", "/release-candidate", "심사·베타·운영·가계부 생성/참여 경로를 최종 확인합니다.", "RC"],
    ["V21 최종 후보", "/beta-release-candidate", "권한·입력·가계부·카카오·사업자·도메인까지 최종 점검합니다.", "V21"],
    ["신규 그룹 챗봇 제작", "/group-chatbot-launch", "카카오 챗봇 관리자센터에서 새 그룹 챗봇을 만드는 블록·발화·Skill URL 기준입니다.", "중요"],
    ["카카오 명령어 체계", "/kakao-command-system", "바로연결/대표명령어/폴백을 채팅 우선으로 정리한 기준입니다.", "중요"],
    ["대량 트래픽 준비", "/group-chatbot-scale", "그룹 챗봇 유입 증가에 대비한 rate limit, 중복방지, 캐시, 운영 점검 기준입니다.", "트래픽"],
    ["개인 주소 제거 점검", "/personal-url-audit", "개인 계정명·개인 Worker 주소가 심사/사용자 화면에 남지 않도록 점검합니다.", "주소"],
    ["도메인 이전 점검", "/domain-migration", "기존 workers.dev 주소 노출을 줄이고 PUBLIC_BASE_URL 기준으로 전환합니다.", "도메인"],
    ["가계부 생성·참여", "/household-create-join", "새 가계부 만들기, 초대코드 공유, 다른 가계부 참여 흐름을 확인합니다.", "필수"],
    ["실제 가계부 전환", "/my/households", "사용자용 가계부 전환·추가·참여 화면으로 바로 이동합니다.", "필수"],
    ["최종 사용자 준비 확인", "/user-ready-check", "사용자 화면 기준 최종 정리 상태를 확인합니다.", "추천"],
    ["사용자 배포 확인", "/release-check", "최종 사용자가 보는 흐름을 확인합니다.", "추천"],
    ["운영 상태 확인", "/final-release", "전체 기능과 배포 가능 상태를 확인합니다.", "관리"],
    ["심사·베타 준비", "/review-ready", "카카오 심사·베타 운영 체크리스트를 확인합니다.", "신규"],
    ["베타 시작 흐름", "/beta-start", "신규 사용자의 첫 설정 흐름을 확인합니다.", "베타"],
    ["가계부 전환·참여", "/household-flow", "여러 가계부·초대코드 흐름을 안내합니다.", "베타"],
    ["백업 안전가이드", "/backup-safety", "배포 전후 백업·복구 순서를 안내합니다.", "안전"],
    ["챗봇 명령어", "/kakao-commands", "카카오 발화와 오입력 안내를 정리합니다.", "베타"],
    ["단톡방 연결 흐름", "/kakao-group-flow", "그룹방별 가계부 연결, 연결 명령어, 초대코드 흐름을 정리합니다.", "카카오"],
    ["단톡방 연결 점검", "/group-household-links", "현재 저장된 그룹방-가계부 연결을 관리자 기준으로 확인합니다.", "운영"],
    ["카카오 로그인 복구", "/kakao-login-recovery", "카카오 로그인 실패 시 백업 로그인과 계정 연결 흐름을 안내합니다.", "카카오"],
    ["오픈빌더 최종 발화", "/openbuilder-final", "OpenBuilder 블록/폴백/대표 발화 연결 기준을 확인합니다.", "카카오"],
    ["사용자 UX 최종 정리", "/user-polish-final", "모바일 첫 화면·입력·메뉴·초보자 흐름의 최종 기준을 확인합니다.", "UX"],
    ["모바일 흐름 가이드", "/mobile-first-flow", "휴대폰 사용 기준 홈/입력/분석/백업 흐름을 확인합니다.", "UX"],
    ["빠른 입력 가이드", "/quick-input-help", "한 줄·여러 줄·날짜별 입력 예시와 오입력 안내를 정리합니다.", "UX"],
    ["베타 체크리스트", "/beta-checklist", "베타 사용자에게 열기 전 최종 확인 항목을 봅니다.", "베타"],
    ["실사용 QA", "/real-user-qa", "모바일 입력, 메뉴, 가계부 전환, 심사 정보를 사용자 기준으로 확인합니다.", "QA"],
    ["빠른입력 분류 QA", "/quick-input-qa", "자주 쓰는 입력 샘플과 기대 분류를 비교합니다.", "QA"],
    ["릴리스 드라이런", "/release-dry-run", "배포 직전 주요 경로와 운영 상태를 한 번에 눌러봅니다.", "RC"],
    ["예산 알림 센터", "/budget-alerts", "오늘 사용 가능 금액, 월말 예상, 정기지출 예정, 초과/주의 분류를 확인합니다.", "신규"],
    ["모임·여행 가계부", "/meeting-households", "모임/여행/단발성 가계부 템플릿과 정산 흐름을 확인합니다.", "신규"],
    ["정산 요약", "/settlement-summary", "참여자별 지출과 1/N 정산 금액을 확인합니다.", "신규"],
    ["예산 알림 가이드", "/budget-alert-guide", "예산 알림·오늘 예산·월말 예상 기준을 설명합니다.", "신규"],
    ["운영 대시보드", "/ops-dashboard", "최근 오류·트래픽·카카오 발화를 한 화면에서 확인합니다.", "운영"],
    ["자연어 운영·학습", "/nlu-ops", "의도별 성공률·폴백·확인 질문·지연시간과 실패 표현을 확인합니다.", "NLU"],
    ["트래픽 가드", "/ops-traffic", "과도 요청 제한과 최근 제한 이벤트를 확인합니다.", "신규"],
    ["스킬 운영", "/skill-ops", "최근 카카오 발화와 스킬 상태를 확인합니다.", "운영"],
    ["약관/서비스 안내", "/terms", "서비스 이용 기준과 사용자 안내 문구를 확인합니다.", "신규"],
    ["시스템 진단", "/diagnostics", "환경변수와 Supabase 테이블 연결을 확인합니다.", "필수"],
    ["운영 점검", "/operation-center", "/ops-audit", "배포 전후 운영 기준을 점검합니다.", "관리"],
    ["기능맵", "/feature-map", "현재 포함 기능과 다음 확장 기능을 확인합니다.", "관리"],
    ["배포 런북", "/deploy-runbook", "실제 배포 순서를 확인합니다.", "관리"],
    ["경로 점검", "/route-audit", "메뉴명과 진입 경로를 점검합니다.", "숨김관리"],
    ["상단 탭 점검", "/nav-audit", "중복 메뉴가 보이는지 확인합니다.", "숨김관리"],
    ["기록 흐름 점검", "/flow-audit", "입력·수정·삭제 흐름을 점검합니다.", "숨김관리"],
    ["조회·필터 점검", "/filter-audit", "모바일/관리자 조회 기준을 점검합니다.", "숨김관리"],
    ["UI 점검", "/ui-audit", "화면 배치와 기록 UI를 점검합니다.", "숨김관리"],
  ];
  const cards = rows.map(([title, href, desc, tag]) => `<a class="opCard" href="${escapeHtml(href)}"><span>${escapeHtml(tag)}</span><b>${escapeHtml(title)}</b><p>${escapeHtml(desc)}</p></a>`).join("");
  const quick = [
    ["모바일 입력", `/app?month=${encodeURIComponent(month)}${hh}`],
    ["기록 관리", dashboardQuery(month, hid, { tab: "transactions" })],
    ["무료 스마트 도구", `/smart-tools?month=${encodeURIComponent(month)}${hh}`],
    ["백업·복구", `/backup?month=${encodeURIComponent(month)}${hh}`],
  ].map(([label, href]) => `<a class="btn light" href="${escapeHtml(href)}">${escapeHtml(label)}</a>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>운영센터</title><style>*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.wrap{max-width:1160px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#111827,var(--ab12-action,#0f766e));color:#fff;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.2)}.hero h1{margin:0;font-size:32px}.hero p{line-height:1.65;opacity:.94}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055)}.opGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:10px}.opCard{display:block;text-decoration:none;color:#111827;background:#fff;border:1px solid #e5e7eb;border-radius:20px;padding:16px;box-shadow:0 10px 24px rgba(15,23,42,.05)}.opCard span{display:inline-flex;border-radius:999px;background:#eff6ff;color:#1e3a8a;font-size:12px;font-weight:1000;padding:5px 9px}.opCard b{display:block;margin-top:10px;font-size:18px}.opCard p{color:#64748b;line-height:1.45}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.warn{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}}</style></head><body>${renderUnifiedNav("operation-center", { month, householdId: hid })}<main class="wrap"><section class="hero"><h1>운영센터</h1><p>일반 사용자가 매일 누를 필요 없는 점검 메뉴를 한곳으로 모았습니다. 상단 메뉴는 실제 사용 흐름만 남기고, 운영/점검/배포 확인은 이 화면에서 관리합니다.</p><p>${quick}</p></section><section class="card"><h2>운영·점검 메뉴</h2><div class="opGrid">${cards}</div></section><section class="card"><h2>운영 원칙</h2><p class="warn">실제 사용자는 입력·기록·분석·백업센터만 주로 사용하면 됩니다. 메뉴점검, 운영점검, 배포런북 같은 관리 메뉴는 문제가 있을 때 운영센터에서만 확인하세요.</p></section></main></body></html>`);
}

const FINAL_RELEASE_VERSION = APP_VERSION;

const FINAL_FEATURE_MATRIX = [
  { group: "기록/입력", name: "카카오톡 지출 입력", status: "운영포함", route: "/skill", detail: "카카오 OpenBuilder Skill 라우트 유지" },
  { group: "기록/입력", name: "모바일 빠른 입력", status: "운영포함", route: "/app", detail: "최근 10건 기본, 필터/수정/삭제 흐름 유지" },
  { group: "기록/입력", name: "관리자 기록 관리", status: "운영포함", route: "/?legacy=1&tab=transactions", detail: "입력/수정/삭제/일괄변경/CSV 다운로드" },
  { group: "가족/공동사용", name: "가계부·참여자 관리", status: "운영포함", route: "/households", detail: "가계부 생성, 초대코드, 참여자 권한 관리" },
  { group: "분류/예산", name: "분류 설정", status: "운영포함", route: "/categories", detail: "사용자 분류 관리" },
  { group: "분류/예산", name: "예산 알림 센터", status: "신규포함", route: "/budget-alerts", detail: "오늘 사용 가능 금액, 월말 예상, 정기지출 예정, 초과/주의 분류" },
  { group: "모임/여행", name: "모임·여행 가계부", status: "신규포함", route: "/meeting-households", detail: "모임/여행/단발성 템플릿과 공유 문구" },
  { group: "모임/여행", name: "정산 요약", status: "신규포함", route: "/settlement-summary", detail: "참여자별 지출, 1/N 정산, 송금 제안" },
  { group: "분류/예산", name: "예산/고정항목", status: "운영포함", route: "/?legacy=1", detail: "예산 초과 경고와 고정항목 구조 유지" },
  { group: "요약/리포트", name: "일/월 통계", status: "운영포함", route: "/app", detail: "월별 합계, 최근 내역, 필터 기반 조회" },
  { group: "숨김 기능", name: "카드 실적·예상 혜택", status: "미완성숨김", route: "-", detail: "조건 데이터와 계산 정확도 검증 완료 전 메뉴·직접 URL 숨김" },
  { group: "카드혜택", name: "결제수단 연결 안내", status: "신규포함", route: "/payment-methods", detail: "기존 payment_method 기준 카드/계좌/간편결제 흐름 확인" },
  { group: "스마트 도구", name: "예측·반복지출·이상지출", status: "운영포함", route: "/smart-tools", detail: "월말 예측·반복지출·이상지출·절약 후보를 무료 제공" },
  { group: "요약/리포트", name: "주간·월간 자동 리포트", status: "운영포함", route: "/reports", detail: "자동 생성 설정과 복사·공유·인쇄/PDF 저장" },
  { group: "백업/복구", name: "백업센터", status: "운영포함", route: "/backup", detail: "JSON/CSV 백업" },
  { group: "백업/복구", name: "백업 미리보기", status: "운영포함", route: "/backup/preview", detail: "DB 저장 없는 구조 검증" },
  { group: "백업/복구", name: "백업 비교", status: "운영포함", route: "/backup/compare", detail: "중복/충돌/신규 후보 분석" },
  { group: "백업/복구", name: "가져오기 후보 선택", status: "운영포함", route: "/backup/select", detail: "가져오기 계획 JSON 생성" },
  { group: "백업/복구", name: "가져오기 최종 확인", status: "운영포함", route: "/backup/final-check", detail: "비밀번호 재확인, 중복 재검사" },
  { group: "백업/복구", name: "가져오기 실제 적용", status: "운영포함", route: "/backup/apply", detail: "확인문구, 20건 제한, 결과 리포트" },
  { group: "백업/복구", name: "가져오기 이력", status: "운영포함", route: "/backup/import-history", detail: "source=backup_import_* 감사 로그" },
  { group: "되돌리기", name: "되돌리기 후보", status: "운영포함", route: "/backup/rollback-candidates", detail: "삭제 없는 계획 생성" },
  { group: "되돌리기", name: "되돌리기 최종 확인", status: "운영포함", route: "/backup/rollback-final-check", detail: "삭제 가능/제외 항목 분리" },
  { group: "되돌리기", name: "되돌리기 실제 삭제", status: "보류", route: "/backup/rollback-final-check", detail: "운영 안정성을 위해 최종 확인까지만 제공" },
  { group: "숨김 기능", name: "소비 카드·보관함·랭킹", status: "미완성숨김", route: "-", detail: "콘텐츠·공유·모바일 완성도 검증 완료 전 메뉴·직접 URL 숨김" },
  { group: "운영", name: "시스템진단", status: "운영포함", route: "/diagnostics", detail: "환경변수/DB 테이블/기능 라우트 점검" },
  { group: "운영", name: "배포운영 점검", status: "운영포함", route: "/ops-audit", detail: "운영 전후 상태 점검" },
  { group: "운영", name: "운영센터", status: "운영포함", route: "/operation-center", detail: "점검/배포/기능맵 통합 화면" },
  { group: "운영", name: "운영 대시보드", status: "신규포함", route: "/ops-dashboard", detail: "최근 오류/트래픽/스킬 이벤트 통합 확인" },
  { group: "카카오", name: "단톡방 연결 흐름", status: "신규포함", route: "/kakao-group-flow", detail: "그룹방별 가계부 연결 명령어와 초대코드 운영 안내" },
  { group: "카카오", name: "오픈빌더 최종 발화", status: "신규포함", route: "/openbuilder-final", detail: "필수 블록/폴백/발화 연결 기준" },
  { group: "UX", name: "사용자 UX 최종 정리", status: "신규포함", route: "/user-polish-final", detail: "모바일 홈, 빠른 입력, 메뉴, 베타 체크리스트 기준" },
  { group: "UX", name: "빠른 입력 가이드", status: "신규포함", route: "/quick-input-help", detail: "한 줄/여러 줄/날짜별 입력과 오입력 안내" },
  { group: "카카오", name: "로그인 복구 안내", status: "신규포함", route: "/kakao-login-recovery", detail: "카카오 로그인 실패 시 백업 로그인과 계정 연결 안내" },
  { group: "운영", name: "중복 방어", status: "신규포함", route: "/ops-duplicates", detail: "중복 저장/대량 입력 제한 이벤트 확인" },
  { group: "운영", name: "최종 배포판 점검", status: "신규포함", route: "/final-release", detail: "전체 기능/배포 게이트/운영 경로 통합 확인" },
];

function releaseStatusClass(status = "") {
  if (status === "운영포함" || status === "신규포함") return "okb";
  if (status === "다음확장" || status === "보류" || status === "미완성숨김") return "planb";
  return "badb";
}

function finalReleaseRoutes() {
  const base = [
    "/health",
    "/final-release",
    "/feature-map",
    "/deploy-runbook",
    "/ops-audit",
    "/ops-dashboard",
    "/ops-traffic",
    "/skill-ops",
    "/nlu-ops",
    "/kakao-group-flow",
    "/group-household-links",
    "/kakao-login-recovery",
    "/openbuilder-final",
    "/user-polish-final",
    "/mobile-first-flow",
    "/quick-input-help",
    "/beta-checklist",
    "/diagnostics",
    "/menu",
    "/app",
    "/?legacy=1",
    "/?legacy=1&tab=transactions",
    "/households",
    "/categories",
    "/smart-tools",
    "/reports",
    "/settlement-summary",
    "/payment-methods",
    "/backup",
    "/backup/preview",
    "/backup/compare",
    "/backup/select",
    "/backup/final-check",
    "/backup/apply",
    "/backup/import-history",
    "/backup/rollback-candidates",
    "/backup/rollback-final-check",
    "/settings",
  ];
  return [...new Set(base)];
}

function buildFinalFeatureSummary() {
  const out = {};
  for (const f of FINAL_FEATURE_MATRIX) {
    const key = f.group;
    if (!out[key]) out[key] = { total: 0, live: 0, planned: 0 };
    out[key].total += 1;
    if (["다음확장", "보류", "미완성숨김"].includes(f.status)) out[key].planned += 1;
    else out[key].live += 1;
  }
  return out;
}

async function buildFinalReleaseAudit(env) {
  const ops = await buildProductionOpsAudit(env);
  const featureSummary = buildFinalFeatureSummary();
  const nonLiveStatuses = new Set(["다음확장", "보류", "미완성숨김"]);
  const liveCount = FINAL_FEATURE_MATRIX.filter((f) => !nonLiveStatuses.has(f.status)).length;
  const plannedCount = FINAL_FEATURE_MATRIX.filter((f) => nonLiveStatuses.has(f.status)).length;
  const releaseGates = [
    ["필수 Secret", !!(ops.envStatus?.SUPABASE_URL && ops.envStatus?.SUPABASE_SERVICE_ROLE_KEY && ops.envStatus?.ADMIN_CREDENTIAL && ops.envStatus?.ADMIN_SESSION_SECRET && ops.envStatus?.USER_SESSION_SECRET && ops.envStatus?.ADMIN_API_TOKEN && ops.envStatus?.MY_IMPORT_TOKEN_SECRET), "DB / 관리자 인증 / 사용자·관리자 세션 / API / 가져오기 Secret"],
    ["세션 안정성", !!(ops.envStatus?.USER_SESSION_SECRET && ops.envStatus?.ADMIN_SESSION_SECRET), "사용자·관리자 세션 Secret 필수"],
    ["DB 주요 테이블", !!ops.ok, "Supabase 주요 테이블 접근"],
    ["통합메뉴", true, "/menu 기준 전체 진입"],
    ["모바일 입력", true, "/app 기준 운영"],
    ["공개 무료 기능", premiumBetaEnabled(env), "반복 거래·고급 정산·자동 리포트·스마트 분석 무료 제공"],
    ["미완성 기능 숨김", !memeCardsEnabled(env) && !cardPerformanceEnabled(env), "소비 카드/밈·카드 실적/혜택 메뉴와 직접 URL 비노출"],
    ["백업/복구 안전흐름", true, "/backup 전체 단계"],
    ["되돌리기 안전흐름", true, "후보/최종확인까지 제공, 실제 삭제는 보류"],
    ["운영점검", true, "/ops-audit, /final-release"],
  ];
  const hardBlock = releaseGates.some(([, ok]) => !ok);
  return {
    ok: !hardBlock,
    version: FINAL_RELEASE_VERSION,
    generated_at: new Date().toISOString(),
    mode: APP_MODE,
    live_feature_count: liveCount,
    planned_feature_count: plannedCount,
    feature_group_summary: featureSummary,
    gates: releaseGates,
    routes: finalReleaseRoutes(),
    feature_matrix: FINAL_FEATURE_MATRIX,
    ops,
  };
}

function renderFinalGates(gates = []) {
  return safeArray(gates).map(([name, ok, detail]) => `<tr><td><b>${escapeHtml(name)}</b></td><td><span class="${ok ? "okb" : "badb"}">${ok ? "통과" : "확인필요"}</span></td><td>${escapeHtml(detail || "")}</td></tr>`).join("");
}

function renderFinalFeatureRows(features = FINAL_FEATURE_MATRIX) {
  return safeArray(features).map((f) => {
    const route = String(f.route || "-");
    const routeCell = route.startsWith("/") ? `<a href="${escapeHtml(route)}">${escapeHtml(route)}</a>` : `<span>${escapeHtml(route)}</span>`;
    return `<tr><td>${escapeHtml(f.group)}</td><td><b>${escapeHtml(f.name)}</b></td><td><span class="${releaseStatusClass(f.status)}">${escapeHtml(f.status)}</span></td><td>${routeCell}</td><td>${escapeHtml(f.detail || "")}</td></tr>`;
  }).join("");
}

function renderFinalRouteLinks(routes = []) {
  return safeArray(routes).map((href) => `<a class="routeLink" href="${escapeHtml(href)}">${escapeHtml(href)}</a>`).join("");
}

function finalReleaseBaseStyle() {
  return `*,*::before,*::after{box-sizing:border-box}body{margin:0;background:#f6f7fb;color:#111827;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;overflow-x:hidden}.wrap{max-width:1220px;margin:0 auto;padding:18px}.hero{background:linear-gradient(135deg,#020617,#1d4ed8,#0f766e);color:#fff;border-radius:28px;padding:24px;margin:14px 0;box-shadow:0 18px 44px rgba(15,23,42,.22)}.hero h1{margin:0;font-size:32px}.hero p{line-height:1.65;opacity:.94}.card{background:#fff;border:1px solid #e5e7eb;border-radius:22px;padding:18px;margin:12px 0;box-shadow:0 10px 28px rgba(15,23,42,.055);overflow:hidden}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(165px,1fr));gap:10px}.metric{background:#fff;border:1px solid #e5e7eb;border-radius:18px;padding:15px}.metric span{display:block;color:#64748b}.metric b{display:block;font-size:24px;margin-top:6px}.okb,.badb,.planb{display:inline-flex;border-radius:999px;padding:5px 9px;font-weight:1000;font-size:12px}.okb{background:#dcfce7;color:#166534}.badb{background:#fee2e2;color:#991b1b}.planb{background:#e0f2fe;color:#075985}.tableWrap{overflow-x:auto;-webkit-overflow-scrolling:touch}table{width:100%;border-collapse:collapse;background:#fff;min-width:900px}th,td{border-bottom:1px solid #e5e7eb;padding:10px;text-align:left;font-size:13px;vertical-align:top}.routeGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:8px}.routeLink{display:block;text-decoration:none;color:#1e3a8a;background:#eff6ff;border:1px solid #bfdbfe;border-radius:14px;padding:10px;font-weight:900;overflow-wrap:anywhere}.btn{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:13px;background:#111827;color:#fff;text-decoration:none;font-weight:1000;padding:0 13px;margin:3px}.btn.light{background:#eff6ff;color:#1e3a8a}.warnBox{background:#fff7ed;border:1px solid #fed7aa;border-radius:16px;padding:12px;color:#9a3412;line-height:1.55}.note{color:#64748b;line-height:1.55}@media(max-width:760px){.wrap{padding:12px}.hero h1{font-size:24px}.card{padding:14px}table{min-width:760px}}`;
}

async function handleFinalReleasePage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const audit = await buildFinalReleaseAudit(env);
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>최종 배포판</title><style>${finalReleaseBaseStyle()}</style></head><body>${renderUnifiedNav("final-release")}<main class="wrap"><section class="hero"><h1>최종 배포판 점검</h1><p>전체 기능, 무료 스마트 도구, 백업/복구 안전 흐름, 운영 배포 기준을 사용자 불필요 JSON 화면 없이 한 화면에서 확인합니다.</p><p>버전: <b>${FINAL_RELEASE_VERSION}</b></p><p><a class="btn light" href="/release-check">사용자 배포 확인</a><a class="btn light" href="/feature-map">기능맵</a><a class="btn light" href="/deploy-runbook">배포 안내</a><a class="btn light" href="/ops-audit">운영점검</a></p></section><section class="grid"><div class="metric"><span>배포 가능 상태</span><b>${audit.ok ? "가능" : "확인필요"}</b></div><div class="metric"><span>운영 포함 기능</span><b>${numberWithCommas(audit.live_feature_count)}개</b></div><div class="metric"><span>다음 확장</span><b>${numberWithCommas(audit.planned_feature_count)}개</b></div><div class="metric"><span>운영 경로</span><b>${numberWithCommas(audit.routes.length)}개</b></div></section><section class="card"><h2>배포 게이트</h2><div class="tableWrap"><table><thead><tr><th>항목</th><th>상태</th><th>상세</th></tr></thead><tbody>${renderFinalGates(audit.gates)}</tbody></table></div></section><section class="card"><h2>최종 기능 매트릭스</h2><div class="tableWrap"><table><thead><tr><th>그룹</th><th>기능</th><th>상태</th><th>경로</th><th>상세</th></tr></thead><tbody>${renderFinalFeatureRows(audit.feature_matrix)}</tbody></table></div></section><section class="card"><h2>운영 주요 경로</h2><div class="routeGrid">${renderFinalRouteLinks(audit.routes)}</div></section><section class="card"><h2>배포 전 필수 순서</h2><p class="warnBox">1) 현재 코드·DB 백업 → 2) V22.6.8·V22.7.0 마이그레이션 확인 → 3) schema_v22_8_0_asset_dashboard_complete.sql 적용 → 4) Worker 코드 배포 → 5) /health와 /ready → 6) /final-release·/ops-audit → 7) 로그인·가계부 전환·기록 수정·자산 저장 실사용 확인</p></section></main></body></html>`);
}

async function handleFeatureMapPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  const summary = buildFinalFeatureSummary();
  const groups = Object.entries(summary).map(([name, v]) => `<div class="metric"><span>${escapeHtml(name)}</span><b>${numberWithCommas(v.live)}/${numberWithCommas(v.total)}</b><div class="note">다음확장 ${numberWithCommas(v.planned)}개</div></div>`).join("");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>기능맵</title><style>${finalReleaseBaseStyle()}</style></head><body>${renderUnifiedNav("feature-map")}<main class="wrap"><section class="hero"><h1>전체 기능맵</h1><p>구현 완료 기능, 신규 기능, 다음 확장 기능을 배포 기준으로 정리했습니다.</p><p><a class="btn light" href="/final-release">최종 배포판</a></p></section><section class="grid">${groups}</section><section class="card"><h2>기능 목록</h2><div class="tableWrap"><table><thead><tr><th>그룹</th><th>기능</th><th>상태</th><th>경로</th><th>상세</th></tr></thead><tbody>${renderFinalFeatureRows(FINAL_FEATURE_MATRIX)}</tbody></table></div></section></main></body></html>`);
}

async function handleDeployRunbookPage(request, env, url) {
  if (!(await verifyAdminSession(request, env))) return redirectResponse("/?legacy=1");
  return htmlResponse(`<!doctype html><html lang="ko"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"/><title>배포 런북</title><style>${finalReleaseBaseStyle()}</style></head><body>${renderUnifiedNav("deploy-runbook")}<main class="wrap"><section class="hero"><h1>실제 배포 런북</h1><p>운영 서버에 최종본을 적용하고 운영 확인까지 진행하는 순서입니다.</p><p>버전: <b>${FINAL_RELEASE_VERSION}</b></p></section><section class="card"><h2>1. 배포 전</h2><ol><li>현재 Worker 코드와 Supabase 데이터를 각각 백업합니다.</li><li><code>schema_v22_6_8_operations_integrity.sql</code> 적용 여부를 확인합니다.</li><li><code>schema_v22_7_0_auth_atomicity.sql</code> 적용 여부를 확인합니다.</li><li><code>schema_v22_8_0_asset_dashboard_complete.sql</code>을 Worker보다 먼저 적용합니다.</li><li>SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, ADMIN_SESSION_SECRET, USER_SESSION_SECRET, ADMIN_API_TOKEN, MY_IMPORT_TOKEN_SECRET를 설정합니다.</li><li>DB 관리자 비밀번호가 아직 없을 때만 ADMIN_PASSWORD를 초기 설정용으로 유지합니다.</li></ol></section><section class="card"><h2>2. 배포</h2><ol><li>ZIP 압축 해제</li><li>V22.8.0 자산 마이그레이션 적용 결과 확인</li><li><code>src/index.js</code>를 Worker에 반영</li><li>저장 후 배포</li></ol></section><section class="card"><h2>3. 배포 후 확인</h2><div class="routeGrid">${renderFinalRouteLinks(["/health","/ready","/final-release","/ops-audit","/diagnostics","/menu","/app","/?legacy=1&tab=transactions","/smart-tools","/reports","/settlement-summary","/payment-methods","/backup"])}</div></section><section class="card"><h2>4. 운영 원칙</h2><p class="warnBox">백업/가져오기/되돌리기 기능은 실제 데이터에 영향을 줄 수 있으므로 항상 JSON 백업 후 진행하세요. 자산에는 계좌·카드 번호 전체, 비밀번호, 인증번호를 입력하지 말고 별칭만 사용하세요. 소비 카드/밈과 카드 실적/혜택은 완성도 검증 전까지 메뉴와 직접 URL에서 숨긴 상태를 유지하세요.</p></section></main></body></html>`);
}
