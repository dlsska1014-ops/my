
const SKIP_TO_CONTENT_TARGET_ID = "abMainContent";

// 건너뛰기 링크는 문서에서 "첫 번째로 포커스되는 것"이어야 뜻이 있다. body 바로 뒤에 넣는다.
// 평소에는 보이지 않다가 포커스를 받으면 나타난다. display:none 이나 visibility:hidden 으로
// 감추면 포커스 자체가 가지 않아 링크가 없는 것과 같아진다.
function addSkipToContentLink(source = "") {
  if (!source || source.includes('class="abSkipLink"')) return source;
  if (!/<main\b/i.test(source)) return source;
  let targetId = "";
  const withTarget = source.replace(/<main\b([^>]*)>/i, (full, attrs) => {
    const raw = String(attrs || "");
    // 이미 id 가 있으면 그것을 목적지로 쓴다. 남의 id 를 갈아 끼우면 그 id 를 쓰던 링크가 끊긴다.
    const existing = raw.match(/\bid\s*=\s*(["'])(.*?)\1/i);
    targetId = existing ? existing[2] : SKIP_TO_CONTENT_TARGET_ID;
    // 목적지가 포커스를 받아야 다음 Tab 이 본문에서 이어진다. 없으면 주소만 바뀌고 포커스는 그대로다.
    const focusable = /\btabindex\s*=/.test(raw) ? "" : ` tabindex="-1"`;
    return existing ? `<main${focusable}${raw}>` : `<main id="${SKIP_TO_CONTENT_TARGET_ID}"${focusable}${raw}>`;
  });
  if (!targetId) return source;
  return withTarget.replace(/<body\b[^>]*>/i, (full) => `${full}<a class="abSkipLink" href="#${escapeHtml(targetId)}">본문 바로가기</a>`);
}

function normalizeUserFacingUi(html = "") {
  let source = String(html || "").replace(/,maximum-scale=1/g, "");
  source = source.replace(".sep{text-align:center;color:#7b8494;", ".sep{text-align:center;color:#667085;");
  source = source.replaceAll("https://cdn.sheetjs.com/xlsx-latest/package/dist/xlsx.full.min.js", "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js");
  source = source.replace('<a class="btn" style="margin-top:10px" href=', '<a class="btn homeFeedAllBtn" style="margin-top:10px" href=');
  source = deferHeavyBrowserTools(source);
  // Destructive controls must remain visually explicit even when client-side
  // enhancement is blocked or delayed.
  source = source.replaceAll('<button type="submit">이 가계부 영구 삭제</button>', '<button class="danger" type="submit">이 가계부 영구 삭제</button>');
  source = source.replaceAll('<button type="submit">계정 통합 실행</button>', '<button class="danger" type="submit">계정 통합 실행</button>');
  source = source.replace(/(<form\b[^>]*action=["']\/admin\/meme\/delete["'][^>]*>[\s\S]*?)<button type="submit">삭제<\/button>/gi, '$1<button class="danger" type="submit">삭제</button>');

  const oldPublicSteps = '<div class="grid"><div class="step"><b>1. 내 이름과 접속코드</b><span>/my에서 본인만 아는 코드로 접속합니다.</span></div><div class="step"><b>2. 새 가계부 만들기 또는 초대 참여</b><span>가족/모임별로 가계부를 나눕니다.</span></div><div class="step"><b>3. 수입·예산 설정</b><span>분류별 예산 합계가 월 예산이 됩니다.</span></div><div class="step"><b>4. 정기지출 등록</b><span>보험, 통신비, 관리비처럼 반복되는 돈을 등록합니다.</span></div><div class="step"><b>5. 키워드 연결</b><span>자주 쓰는 표현을 분류에 연결합니다.</span></div><div class="step"><b>6. 기록/분석 확인</b><span>홈, 캘린더, 종합분석에서 흐름을 확인합니다.</span></div></div>';
  const newPublicSteps = '<div class="grid"><div class="step"><b>1. 가계부 만들기</b><span>새 가계부의 용도와 이름을 정합니다.</span></div><div class="step"><b>2. 초대·참여</b><span>초대코드를 공유하거나 받은 코드로 참여합니다.</span></div><div class="step"><b>3. 단톡방 연결</b><span>관리자가 단톡방과 사용할 가계부를 한 번 연결합니다.</span></div><div class="step"><b>4. 기록 튜토리얼</b><span>한 줄 입력 예시로 저장될 값을 확인합니다.</span></div><div class="step"><b>5. 첫 기록</b><span>첫 기록을 저장하고 오늘 기록에서 결과를 확인합니다.</span></div></div>';
  source = source.replace("카카오 로그인 없이도 이름과 개인 접속코드로 시작할 수 있습니다.", "가계부를 만들거나 참여한 뒤 단톡방 연결과 첫 기록까지 차례로 진행해보세요.");
  source = source.replace(oldPublicSteps, newPublicSteps);
  source = source.replace("가계부가 연결되면 시작가이드에서 월 수입, 예산, 분류·키워드, 카드·현금·통장, 정기지출을 순서대로 설정하면 됩니다.", "가계부를 만들거나 참여한 뒤 단톡방을 연결하고 첫 기록을 남겨보세요. 예산과 분류 설정은 첫 기록 후 필요할 때 추가하면 됩니다.");
  source = source.replace("처음에는 기능을 많이 설명하기보다 “가계부 생성 → 예산 → 결제수단 → 정기지출 → 카카오 기록 → 분석 확인” 흐름만 안내합니다. 오류가 나면 안전화면과 백업 가이드를 먼저 보여줍니다.", "처음에는 ‘가계부 생성·참여 → 초대·승인 → 단톡방 연결(선택) → 기록 방법 → 첫 기록’까지만 안내합니다. 예산·분류·자동화는 첫 기록 후 선택적으로 이어가고, 오류가 나면 원인과 돌아갈 경로를 함께 보여줍니다.");
  source = source.replace(/CSV·TSV·TXT·엑셀의 여러 시트/g, "CSV·TSV·TXT·JSON·엑셀의 여러 시트");
  source = source.replace(/CSV·TSV·TXT는 서버에서 바로 읽습니다\./g, "CSV·TSV·TXT·JSON은 서버에서 바로 읽습니다.");
  source = source.replace('accept=".csv,.tsv,.txt,.xls,.xlsx,text/csv,text/tab-separated-values,text/plain,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"', 'accept=".csv,.tsv,.txt,.json,.xls,.xlsx,text/csv,text/tab-separated-values,text/plain,application/json,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"');

  if (source.includes("가계부에 접속하세요.")) {
    source = source.replace("현재 브라우저에 로그인 세션이 없으면 이 화면이 표시됩니다. 카카오 로그인이 아직 준비되지 않았으면 아래 이름 + 개인 접속코드로 접속하세요.", "카카오로 로그인하면 참여 중인 가계부를 바로 이어서 사용할 수 있습니다. 다른 접속 방법도 아래에서 선택할 수 있어요.");
    source = source.replace("<h2>가계부 접속</h2><p class=\"muted\">기존 사용자나 카카오 로그인이 준비되지 않은 경우 이름과 개인 접속코드로 들어갈 수 있습니다.</p>", "<h2>다른 방법으로 접속</h2><p class=\"muted\">미리 설정한 이름과 개인 접속코드가 있다면 여기에서 접속하세요.</p>");
    source = source.replace(/<div class="card"><h2>카카오 연동 안내<\/h2>[\s\S]*?<\/ul><\/div><\/section>/, '<div class="card"><h2>접속 도움말</h2><p class="muted">기존 가계부가 보이지 않으면 이전에 사용하던 접속 방법으로 먼저 로그인한 뒤 카카오 계정을 연결해주세요.</p><div class="warn"><b>접속코드는 본인만 사용하세요</b><br/>공용 기기에서는 사용 후 반드시 로그아웃해주세요.</div></div></section>');
  }

  if (source.includes("카카오 로그인 점검</h1>")) {
    source = source.replace("<b>Redirect URI 형식</b>", "<b>KAKAO_REDIRECT_URI 명시값</b>");
    source = source.replace("로컬 설정 일치 · 로그인 버튼 표시", "로컬 설정 일치 · 카카오 로그인 버튼 표시됨");
    source = source.replace(
      "<b>마지막 외부 확인</b><br/>",
      "<b>로컬 구성만 확인한 상태입니다</b><br/>접속 주소 기반 자동 생성은 사용하지 않으므로, "
    );
    source = source.replace(
      "이 화면에서는 카카오 관리자센터 등록 여부까지 자동 확인할 수 없습니다.",
      "이 화면에서는 카카오 관리자센터 등록 여부까지 자동 확인할 수 없습니다. 등록값이 다르면 KOE006이 발생합니다."
    );
  }

  if (/프리미엄|유료 전환/.test(source)) {
    source = source.replace(/프리미엄 1차 베타|프리미엄 베타/g, "무료 스마트 도구");
    source = source.replace(/<p>([^<]*?) · 현재 결제 기능은 연결하지 않았습니다\. 실제 데이터에서 가치와 정확도를 검증한 뒤 유료 전환합니다\.<\/p>/, "<p>$1 · 초기 서비스에서는 모든 스마트 기능을 무료로 사용할 수 있습니다.</p>");
    source = source.replace(/<span>월말 예상 지출<\/span><b>([\d,]+)원<\/b>/, function(_, amount) { return "<span>월말 예상 지출</span><b>" + approximateWonLabel(amount) + "</b>"; });
    source = source.replace(/<span>절약 후보<\/span><b>([\d,]+)원<\/b>/, function(_, amount) { return "<span>절약 후보</span><b>" + approximateWonLabel(amount) + "</b>"; });
    source = source.replace("프리미엄 1차 개발 예정", "무료 스마트 기능");
    source = source.replace(/<p class="notice"><b>운영 원칙<\/b><br\/>밈카드와 카드 실적 기능은[\s\S]*?<\/p>/, "");
    const today = nowKstDate();
    const basis = (today.getMonth() + 1) + "/" + today.getDate();
    source = source.replace('</section><section class="card"><h2>현재 동작하는 무료 스마트 도구</h2>', '</section><p class="metricBasis">' + basis + ' 기준 · 월말 예상은 현재 월의 단순 일평균을 사용하며 실제 지출에 따라 달라질 수 있습니다.</p><section class="card"><h2>현재 동작하는 스마트 분석</h2>');
  }

  source = source.replace("일반 사용자가 매일 쓰는 메뉴만 모았습니다. 운영/점검/배포/진단 메뉴는 이 화면에 노출하지 않고 운영센터에서만 관리합니다.", "기록, 정산, 가계부 관리와 개인 설정을 한곳에서 찾을 수 있습니다.");
  source = source.replace("추천 흐름: 홈·입력 → 기록 보기 → 예산알림 → 분석 → 백업·복구. 새 모임이나 여행은 가계부 전환·추가에서 만드세요.", "추천 흐름: 모임 선택 → 기록 입력 → 기록 확인 → 정산. 예산과 분석은 필요할 때 이어서 사용하세요.");
  source = source.replace(/컬럼: 날짜, 구분, 금액, 분류, 내용, 결제수단, 출처, 기록ID/g, "컬럼: 날짜, 구분, 금액, 분류, 내용, 결제수단, 지출자, 출처, 기록ID");
  if (source.includes(" · 프로필</title>") && !/<nav\b/i.test(source)) {
    source = source.replace("<body><main", `<body>${renderUnifiedNav("menu")}<main`);
  }

  // The combined budget editor is shared by two pages. Preserve the page the
  // user started from after saving instead of unexpectedly opening settings.
  if (source.includes('id="budgetPlanForm"')) {
    source = source.replace('id="budgetPlanForm">', 'id="budgetPlanForm"><input type="hidden" name="budget_return" value="budgets"/>');
  }

  if (source.includes(" · 수입·예산</title>")) {
    source = source.replace(
      /<section class="card"><h2>계산 기준<\/h2>[\s\S]*?<\/section>/,
      '<details class="card calculationHelp"><summary>계산 기준 보기</summary><p>실제 수입은 수입 기록의 합계, 예상 수입은 종류별 계획의 합계입니다. 전체 지출 예산은 분류별 한도를 더해 계산하고 남은 예산은 여기에서 실제 지출을 뺀 금액입니다.</p></details>'
    );
  }

  if (source.includes("<title>정기 수입·지출</title>")) {
    source = source.replace("재산세, 자동차세, 자동차보험처럼 반기·연단위로 나가는 큰돈을 미리 준비합니다. 3개월/2개월/1개월 전 기준으로 준비 알림을 보여줍니다.", "보험료·세금처럼 가끔 크게 나가는 돈을 등록하면 매달 준비할 금액을 계산해 드려요.");
    source = source.replace('<section class="card"><h2>정기 수입·지출 추가</h2>', '<section class="card" id="reserveAdd"><h2>정기 수입·지출 추가</h2>');
  }

  if (source.includes(" · 고급 정산</title>")) {
    source = source.replace('<section class="hero"><h1>고급 정산</h1><p>', '<section class="hero abV5PageHeader"><div class="abV5PageHeaderTop"><div class="abV5PageTitle"><h1>정산</h1><p>');
    source = source.replace('</p><form class="filters" method="get" action="/settlement-summary">', '</p></div></div><form class="filters abV5ControlBar" method="get" action="/settlement-summary">');
    source = source.replaceAll('<section class="card">', '<section class="card abV5SectionCard">');
    source = source.replace('<section class="grid">', '<section class="grid abV5KpiGrid">');
    source = source.replaceAll('<div class="metric">', '<div class="metric abV5Kpi">');
  }

  if (source.includes("<title>전체 메뉴</title>")) {
    source = source.replace(
      /<p class="note">추천 흐름:[\s\S]*?<\/p>/,
      '<section class="card firstUseCard"><h2>처음이라면 이 순서대로</h2><p class="muted">설정을 전부 끝낼 필요 없이 첫 기록부터 시작할 수 있어요.</p><div class="menuSteps"><div class="menuStep"><b>1. 가계부 선택</b><span>쓸 가계부가 맞는지 확인합니다.</span></div><div class="menuStep"><b>2. 첫 기록</b><span>금액과 내용만 입력해 저장합니다.</span></div><div class="menuStep"><b>3. 결과 확인</b><span>기록과 월 지출을 확인합니다.</span></div></div></section>'
    );
  }

  if (source.includes(" · 모바일</title>")) {
    source = source.replace('<meta name="theme-color" content="#2563eb"/>', '<meta name="theme-color" content="#3182f6"/>');
    source = source.replace(
      `<link rel="stylesheet" href="${MOBILE_HOME_CSS_ASSET_PATH}"/>`,
      `<link rel="stylesheet" href="${MOBILE_HOME_CSS_ASSET_PATH}"/><link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`
    );
    source = source.replace(/<nav class="bottom"[^>]*>[\s\S]*?<\/nav>/, "");
    source = source.replace('<div class="topLine"><b>', '<div class="topLine"><h1>');
    source = source.replace('</b><a href="/analysis?', '</h1><a href="/analysis?');
    // V22.9.9: 눈썹("기록")과 설명문을 뺀다.
    //   · 눈썹은 옛 사이드바 그룹명이었다. V22.9.5 에서 그룹을 적는다·본다·계획한다·
    //     설정으로 바꿨으므로 지금은 **틀린 이름**을 띄우고 있었다. 현재 위치는
    //     사이드바 활성 표시와 하단 탭이 이미 알려 준다.
    //   · "이번 달 흐름과 빠른 기록을 한곳에서 확인합니다" 는 정보가 0인 문장이면서
    //     첫 화면 세로 공간을 먹었다. 홈에서 가장 중요한 숫자(쓸 수 있는 돈)가 그만큼
    //     접힘 아래로 밀렸다.
    // 홈에서 가계부 이름은 세 번 나왔다 — 상단 바, 이 제목, 그리고 가계부 고르는
    // select. 제목은 상단 바와 **글자까지 같은** 중복이라 눈에만 지우고 문서 구조에는
    // 남긴다(화면에 h1 이 하나도 없으면 보조기기 사용자가 현재 문서를 잃는다).
    source = source.replace('<header class="appTop" id="top"><div class="topLine"><h1>', '<header class="appTop abV5PageHeader" id="top"><div class="topLine abV5PageHeaderTop"><div class="abV5PageTitle"><h1 class="srOnly">');
    source = source.replace('</h1></div><form class="selectLine"', '</h1></div></div><form class="selectLine abV5ControlBar"');
    source = source.replace('<section class="homeMetrics">', '<section class="homeMetrics abV5KpiGrid">');
    const runtimeMarker = "<script>(function(){var q=document.getElementById('v8Search');";
    const runtimeStart = source.indexOf(runtimeMarker);
    const runtimeEnd = runtimeStart < 0 ? -1 : source.indexOf("</script>", runtimeStart + runtimeMarker.length);
    if (runtimeStart >= 0 && runtimeEnd > runtimeStart) {
      source = source.slice(0, runtimeStart)
        + `<script id="mobileAppInlineRuntime" src="${MOBILE_HOME_SHELL_JS_ASSET_PATH}" defer></script>`
        + source.slice(runtimeEnd + 9);
    }
  }
  source = promoteLegacyUserLayoutToV5(source);
  source = normalizeUiV5RemainingPages(source);
  source = source.replace(/\/my\/premium/g, "/smart-tools");
  source = source.replace(/프리미엄 1차 개발 순서|프리미엄 1차 개발 예정/g, "무료 스마트 기능");
  source = source.replace(/프리미엄 1차 베타|프리미엄 베타|프리미엄/g, "무료 스마트 도구");
  source = source.replace(/실제 데이터에서 가치와 정확도를 검증한 뒤 유료 전환합니다\./g, "초기 서비스에서는 모든 기능을 무료로 제공합니다.");
  source = source.replace('<span class="abNavLogo">💛</span>', '<span class="abNavLogo" aria-hidden="true"><span class="abBrandMark"><i></i><i></i><i></i></span></span>');
  source = source.replace(/<div class="abNavMobileTop"><a([^>]*)>💛\s*/i, '<div class="abNavMobileTop"><a$1><span class="abBrandMark" aria-hidden="true"><i></i><i></i><i></i></span>');
  source = source.replace("🌱 시작가이드", "처음 사용 가이드");
  source = source.replace("처음이라면 여기부터", "처음 3단계만 따라해 보세요");
  source = source.replaceAll("<i>🏠</i>", "<i>⌂</i>");
  source = source.replaceAll("<i>📄</i>", "<i>▤</i>");
  source = source.replaceAll("<i>📊</i>", "<i>◒</i>");
  source = source.replaceAll("오늘 쓴 돈 ☀️", "오늘 쓴 돈");
  source = source.replaceAll("들어온 돈 💰", "들어온 돈");
  source = source.replaceAll("나간 돈 💸", "나간 돈");
  if (source.includes('<aside class="abLayoutNav"') && !source.includes('id="v2281GuidedNavStyle"')) {
    source = source.replace('</style><aside class="abLayoutNav"', `</style>${V2281_GUIDED_NAV_STYLE}<aside class="abLayoutNav"`);
  }
  for (const styleId of ["unifiedNavStyle", "v2281GuidedNavStyle"]) {
    const marker = `<style id="${styleId}">`;
    const start = source.indexOf(marker);
    const end = start < 0 ? -1 : source.indexOf("</style>", start + marker.length);
    if (start >= 0 && end > start && source.indexOf("</head>") >= 0 && start > source.indexOf("</head>")) {
      const styleBlock = source.slice(start, end + 8);
      source = source.slice(0, start) + source.slice(end + 8);
      source = source.replace("</head>", `${styleBlock}</head>`);
    }
  }
  const bodyClasses = ["abV2281"];
  if (/\bclass=["'][^"']*\babLayoutNav\b/.test(source)) bodyClasses.push("abAppSurface");
  if (source.includes('id="smartInput"')) bodyClasses.push("abMobileAppSurface");
  if (source.includes("<title>자산·결제수단</title>")) bodyClasses.push("abPageAssets");
  if (source.includes("<title>정기지출 준비</title>")) bodyClasses.push("abPageReserve");
  if (source.includes(" · 수입·예산</title>")) bodyClasses.push("abPageBudgets");
  if (source.includes(" · 가계부 전환·관리</title>")) bodyClasses.push("abPageHouseholds");
  if (source.includes(" · 참여자·초대</title>")) bodyClasses.push("abPageMembers");
  if (source.includes(" · 고급 정산</title>")) bodyClasses.push("abPageSettlement");
  if (source.includes(" · 설정</title>") && source.includes('action="/my/settings"')) bodyClasses.push("abPageSettings");
  if (source.includes("<title>전체 메뉴</title>")) bodyClasses.push("abPageMenu");
  if (source.includes(" · 시작</title>") && source.includes('action="/my/local-login"')) bodyClasses.push("abPageLogin");
  if (source.includes(" · 내 계정·보안</title>") && source.includes('action="/my/backup-login"')) bodyClasses.push("abPageAccountSecurity");
  if (source.includes("시작가이드</title>")) bodyClasses.push("abPageGuide");
  if (source.includes('id="keywordBulkForm"')) bodyClasses.push("abPageKeywords");
  if (source.includes(" · 백업/가져오기</title>")) bodyClasses.push("abPageBackup");
  if (source.includes(" · 무료 리포트</title>")) bodyClasses.push("abPageReports");
  if (source.includes(" · 무료 스마트 도구</title>")) bodyClasses.push("abPageSmartTools");
  if (source.includes(" · 분류 설정</title>")) bodyClasses.push("abPageCategories");
  if (source.includes(" · 단톡방 연결</title>")) bodyClasses.push("abPageGroups");
  if (source.includes("abV5RemainingPage")) bodyClasses.push("abV5RemainingPage");
  if (source.includes('id="filterBar"') && source.includes('id="kpis"')) bodyClasses.push("abPageInsight");
  if (source.includes(" · 종합 리포트</title>") || (source.includes(" · 분석</title>") && source.includes("핵심 인사이트"))) bodyClasses.push("abPageAnalysisReport");
  if (source.includes(" · 캘린더</title>")) bodyClasses.push("abPageCalendar");
  const hasLegacyAdminPageMarker = source.includes('class="desktopLedger') || source.includes('class="pcSidebar');
  if (hasLegacyAdminPageMarker) source = source.replaceAll('data-nav-scope="user"', 'data-nav-scope="admin"');
  const hasUserNavScope = source.includes('data-nav-scope="user"');
  const hasRestrictedShellScope = source.includes('data-nav-scope="ops"')
    || source.includes('data-nav-scope="admin"')
    || hasLegacyAdminPageMarker;
  const useV22812Shell = !hasRestrictedShellScope && (
    hasUserNavScope
      || source.includes('class="appMenu"')
      || source.includes('id="smartInput"')
      || source.includes('action="/my/local-login"')
      || source.includes('action="/my/backup-login"')
      || source.includes(" · 가계부 시작</title>")
  );
  if (useV22812Shell) bodyClasses.push("abV22812Shell");
  source = source.replace(/<body\b([^>]*)>/i, function(full, attrs) {
    const classMatch = String(attrs || "").match(/\bclass\s*=\s*(["'])(.*?)\1/i);
    if (classMatch) {
      const merged = [...new Set([...String(classMatch[2] || "").split(/\s+/).filter(Boolean), ...bodyClasses])].join(" ");
      return full.replace(classMatch[0], `class="${merged}"`);
    }
    return `<body class="${bodyClasses.join(" ")}"${attrs || ""}>`;
  });
  // 키보드 사용자는 화면마다 상단바·사이드바를 먼저 지나야 본문에 닿는다. 데스크톱 홈은
  // 사이드바 달력 때문에 Tab 을 55번 눌러야 첫 본문 요소에 도착했다. 화면을 넘길 때마다
  // 그 55번을 처음부터 다시 눌러야 하므로, 첫 번째 포커스 자리에 본문 바로가기를 둔다.
  if (useV22812Shell) source = addSkipToContentLink(source);
  if (useV22812Shell && source.includes("</head>")) {
    const themeScript = `<script src="${ACCOUNTBOOK_THEME_JS_ASSET_PATH}"></script>`;
    const shellLink = `<link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`;
    if (!source.includes(`src="${ACCOUNTBOOK_THEME_JS_ASSET_PATH}"`)) {
      source = source.replace("</head>", `${themeScript}</head>`);
    }
    if (!source.includes(`href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"`)) {
      source = source.replace("</head>", `${shellLink}</head>`);
    }
  }
  if (useV22812Shell && source.includes("</body>") && !source.includes(ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH)) {
    // V22.8.34: 검색·알림·행즐겨찾기를 단일 immutable 번들로 주입(오버레이 마크업은 번들 JS가 생성).
    source = source.replace("</body>", `<script src="${ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH}" defer></script></body>`);
  }
  return source;
}

function legacyUiV5ActiveKey(source = "") {
  const title = String(source || "").match(/<title>([\s\S]*?)<\/title>/i)?.[1] || "";
  if (/가계부 전환·관리/.test(title)) return "my-households";
  if (/참여자[·/]초대|가계부·참여자/.test(title)) return "members";
  if (/백업\/가져오기|가져오기 (?:미리보기|결과)/.test(title)) return "backup";
  if (/단톡방 연결/.test(title)) return "groups";
  if (/무료 스마트 도구/.test(title)) return "smart-tools";
  if (/무료 리포트/.test(title)) return "reports";
  if (/수입·예산 설정|·\s*설정$/.test(title)) return "budgets";
  if (/종합 리포트| · 분석/.test(title)) return "analysis";
  if (/시작가이드/.test(title)) return "guide";
  return "app";
}

function decodeUiV5QueryPart(value = "") {
  try { return decodeURIComponent(String(value || "")); } catch (_error) { return String(value || ""); }
}

function decodeUiV5HtmlText(value = "") {
  return String(value || "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function promoteLegacyUserLayoutToV5(html = "") {
  let source = String(html || "");
  const layoutMarker = '<div class="appLayout">';
  const pageMarker = '<div class="pageMain">';
  const layoutStart = source.indexOf(layoutMarker);
  const pageStart = layoutStart < 0 ? -1 : source.indexOf(pageMarker, layoutStart + layoutMarker.length);
  if (layoutStart < 0 || pageStart < 0 || !source.slice(layoutStart, pageStart).includes('class="appMenu"')) return source;
  const queryMatch = source.match(/href="\/app\?household_id=([^"&]+)&(?:amp;)?month=([^"&#]+)/i);
  const householdId = decodeUiV5QueryPart(queryMatch?.[1] || "");
  const month = validMonth(decodeUiV5QueryPart(queryMatch?.[2] || "")) || currentMonthKst();
  const selectedHouseholdOption = source.match(/<option\b([^>]*\bselected\b[^>]*)>([^<]+)<\/option>/i);
  const householdName = decodeUiV5HtmlText(selectedHouseholdOption?.[1]?.match(/\bdata-household-name="([^"]*)"/i)?.[1] || selectedHouseholdOption?.[2] || "");
  const active = legacyUiV5ActiveKey(source);
  const nav = renderUnifiedNav(active, { month, householdId, householdName });
  source = source.slice(0, layoutStart) + pageMarker + source.slice(pageStart + pageMarker.length);
  const legacyClosing = source.lastIndexOf("</div></div></main>");
  if (legacyClosing >= 0) source = source.slice(0, legacyClosing) + "</div></main>" + source.slice(legacyClosing + 19);
  source = source.replace(/<body\b([^>]*)>/i, (full, attrs) => `${full}${nav}`);
  return source;
}

function normalizeUiV5RemainingPages(html = "") {
  let source = String(html || "");
  const remainingPage = /(?:무료 리포트|무료 스마트 도구|수입·예산|가계부 전환·관리|참여자[·/]초대|백업\/가져오기|분류 설정|단톡방 연결|종합 리포트|내 계정·보안)<\/title>/.test(source)
    || source.includes("가계부·참여자</title>")
    || source.includes("<title>자산·결제수단</title>")
    || source.includes("<title>정기지출 준비</title>")
    || source.includes("시작가이드</title>")
    || source.includes('id="budgetBulkForm"')
    || source.includes('id="keywordBulkForm"')
    || (source.includes(" · 분석</title>") && source.includes("핵심 인사이트"));
  if (!remainingPage) return source;
  if (source.includes("내 계정·보안</title>") && !source.includes('class="abLayoutNav"')) {
    source = source.replace(/<body\b([^>]*)>/i, (full) => `${full}${renderUnifiedNav("backup-login")}`);
  }
  source = source.replace(/<body\b([^>]*)>/i, (full, attrs) => {
    if (/\bclass\s*=/.test(attrs || "")) return full.replace(/\bclass\s*=\s*(["'])(.*?)\1/i, (_m, _q, classes) => `class="${classes} abV5RemainingPage"`);
    return `<body class="abV5RemainingPage"${attrs || ""}>`;
  });
  source = source.replace(/<section class="hero(?![^"]*abV5PageHeader)([^"]*)"/i, '<section class="hero$1 abV5PageHeader abV5RemainingHeader"');
  if (source.includes("<title>자산·결제수단</title>") && !source.includes("<h1>자산·결제수단</h1>")) {
    source = source.replace('<section class="hero abV5PageHeader abV5RemainingHeader"><p class="heroLabel">', '<section class="hero abV5PageHeader abV5RemainingHeader"><div class="abV5PageTitle"><h1>자산·결제수단</h1></div><p class="heroLabel">');
  }
  source = source.replace(/<section class="card(?![^"]*abV5SectionCard)([^"]*)"/gi, '<section class="card$1 abV5SectionCard"');
  source = source.replace(/class="(toolbar|filters)(?![^"]*abV5ControlBar)([^"]*)"/gi, 'class="$1$2 abV5ControlBar"');
  source = source.replace(/class="(metricGrid|summaryGrid)(?![^"]*abV5KpiGrid)([^"]*)"/gi, 'class="$1$2 abV5KpiGrid"');
  source = source.replace('class="grid metricGrid"', 'class="grid metricGrid abV5KpiGrid"');
  if (/무료 리포트|종합 리포트/.test(source)) source = source.replace('<section class="grid">', '<section class="grid abV5KpiGrid">');
  return source;
}

function attachUiUxRuntime(html = "") {
  let source = attachAccessibleControlNames(normalizeUserFacingUi(html));
  const optimizedMobileHome = source.includes(`href="${MOBILE_HOME_CSS_ASSET_PATH}"`)
    && (source.includes(`src="${MOBILE_HOME_JS_ASSET_PATH}"`) || source.includes(`src="${MOBILE_HOME_SHELL_JS_ASSET_PATH}"`));
  // 여기가 홈을 뺀 열네 화면이 매 요청마다 20~30 KB 의 CSS 를 인라인으로 실어 보내던
  // 자리다. 홈만 캐시되는 스타일시트를 링크해서 인라인 CSS 가 1% 였고, 나머지 화면은
  // 27~50% 였다. 같은 CSS 를 화면마다 다시 보내는 것이라 합계 260 KB 가 낭비였다.
  //
  // 이제 링크 한 줄로 바꾼다. **끼워 넣는 위치는 그대로 </head> 직전**이다 — 이 뒤에
  // 셸 링크가 다시 마지막으로 옮겨가므로 캐스케이드 순서가 이전과 똑같이 유지된다.
  // 인라인이든 링크든 문서 순서로 적용되므로 어느 규칙이 이기는지는 바뀌지 않는다.
  //
  // v2285 의 내비 조각만 인라인으로 남는다. 그 조각은 :root 에 변수를 전역으로 푸는
  // 유일한 것이라(다른 조각들은 전부 페이지 클래스로 가드돼 있다) 공유 자산에 담으면
  // 내비가 없는 화면에도 변수가 정의된다. 1,952 B 라 그대로 두는 편이 안전하다.
  if (!optimizedMobileHome && source && !source.includes(`href="${AB_UIUX_CSS_ASSET_PATH}"`) && source.includes("</head>")) {
    const uiuxLink = `<link rel="stylesheet" href="${AB_UIUX_CSS_ASSET_PATH}"/>`;
    source = source.replace("</head>", uiuxLink + v2285NavStyleFor(source) + "</head>");
  }
  const v22812ShellLink = `<link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`;
  if (source.includes(v22812ShellLink) && source.includes("</head>")) {
    source = source.replaceAll(v22812ShellLink, "").replace("</head>", `${v22812ShellLink}</head>`);
  }
  // 홈 화면에 추가할 때만 쓰이는 링크 한 줄. 아이콘 자체는 브라우저가 스스로 요청하므로
  // 아이콘 링크는 넣지 않고, 매니페스트만 붙여 홈 HTML 증가를 최소로 유지한다.
  if (source.includes("</head>") && !source.includes(AB_MANIFEST_LINK)) {
    source = source.replace("</head>", `${AB_MANIFEST_LINK}</head>`);
  }

  // V22.9.7: 이 앱은 링크로 도는 MPA 라 월 전환·탭 전환이 전부 전체 페이지 로드다.
  // Speculation Rules 는 바로 그 구조를 위해 만들어진 API 라 SPA 로 갈아엎지 않고
  // 다음 화면을 미리 준비할 수 있다. JS 0줄, 이 JSON 한 덩어리가 전부다.
  //
  // eagerness 를 conservative 로 둔 이유가 이 변경의 핵심이다.
  //   · moderate/eager 는 마우스를 올리거나 링크가 화면에 들어오기만 해도 그 주소를
  //     **실제로 연다.** 홈 한 번 여는 데 DB 호출이 10회쯤 드는 앱에서, 누르지도 않은
  //     링크마다 그만큼이 더 나간다 — 무료 한도를 쓰는 방식으로는 맞지 않다.
  //   · conservative 는 사용자가 이미 누르기 시작한 뒤(pointerdown)에야 움직인다.
  //     그 요청은 어차피 일어날 요청이므로 **서버 부하가 늘지 않는다.** 얻는 것은
  //     누르고 놓는 사이의 100~200ms 를 미리 쓰는 것이다.
  //
  // prerender 는 그 주소를 진짜로 여는 것이므로, GET 인데 데이터를 바꾸는 주소가
  // 있으면 안 된다. 홈에서 링크되는 45개 주소를 GET 으로 열어 쓰기가 생기는지 세어
  // 확인했다(0건). 그래도 쓰기 계열 경로는 규칙에서 이름으로 빼 둔다 — 나중에
  // 누가 그런 주소를 링크해도 여기서 막힌다.
  //
  // 미지원 브라우저(현재 Firefox·Safari)는 이 script 태그를 그냥 무시한다.
  // 폴백 코드가 필요 없다는 뜻이다.
  // V22.9.9: 화면마다 머리말에 붙는 안내문을 접을 수 있게 한다.
  //
  // 재 보니 첫 844px 중 머리말이 차지하는 비율이 화면당 25~77% 였다(자산 547px,
  // 정산 400px, 예산 388px). 그 대부분이 "이 화면은 무엇을 하는 곳인가"를 설명하는
  // 문장인데, 세 번째 방문부터는 읽지 않으면서 자리는 계속 차지한다.
  //
  // 지우지는 않는다 — 예산 화면의 안내문처럼 실제 규칙을 설명하는 것이 섞여 있다.
  // 대신 접을 수 있게 하고, 접은 상태를 그 브라우저에 기억시킨다(localStorage,
  // 서버 비용 0). 다시 펼 수 있는 버튼은 항상 남는다.
  //
  // 무엇이 "안내문"인가: 머리말 안의 **class 없는 <p>** 와 <p class="heroDelta">.
  // 자산 화면의 .heroLabel/.heroNet/.heroChips 처럼 클래스가 붙은 문단은 값이므로
  // 건드리지 않는다 — 실제로 그 화면의 순자산 금액이 <p> 형제로 들어 있다.
  if (source.includes("abV5PageHeader")) {
    const noteKey = (source.match(/<title>([^<]*)<\/title>/) || ["", "page"])[1]
      .replace(/[^가-힣A-Za-z0-9]+/g, "-").slice(0, 40) || "page";
    const wrap = (inner) => `<div class="abHeadNote" data-ab-note="${escapeHtml(noteKey)}"><p>${inner}</p>`
      + `<button type="button" class="abHeadNoteToggle" aria-expanded="true">접기</button></div>`;
    let wrapped = 0;
    source = source.replace(/<\/h1><p>([\s\S]*?)<\/p>/, (full, inner) => { wrapped += 1; return `</h1>${wrap(inner)}`; });
    if (!wrapped) source = source.replace(/<p class="heroDelta([^"]*)">([\s\S]*?)<\/p>/, (full, extra, inner) => `<div class="abHeadNote" data-ab-note="${escapeHtml(noteKey)}"><p class="heroDelta${extra}">${inner}</p><button type="button" class="abHeadNoteToggle" aria-expanded="true">접기</button></div>`);
  }

  if (source.includes("</head>") && !source.includes('type="speculationrules"')) {
    source = source.replace("</head>", `${AB_SPECULATION_RULES_TAG}</head>`);
  }
  const needsRuntime = source.includes('id="smartInput"') || source.includes('class="appMenu"') || source.includes('class="abNavMobileTop"');
  if (!optimizedMobileHome && needsRuntime && !source.includes('id="v2262UiUxRuntime"') && source.includes("</body>")) {
    const needsSmartRuntime = source.includes('id="smartInput"') && !source.includes('id="mobileAppInlineRuntime"');
    const runtime = needsSmartRuntime
      ? moneyTokenSpans.toString() + "\n" + transactionTypeFromText.toString() + "\n" + quickInputDate.toString() + "\n" + explicitDateIntent.toString() + "\n" + parseMobileAmountText.toString() + "\n(" + mobileUiUxClientMain.toString() + ")();"
      : "(" + mobileShellUiClientMain.toString() + ")();";
    // 분류 규칙은 이 런타임보다 먼저 있어야 한다. 평범한 <script src> 는 순서대로
    // 실행되므로 이 한 줄이면 충분하다(defer·async 를 붙이면 순서가 깨진다).
    const rulesTag = needsSmartRuntime ? AB_CATEGORY_RULES_SCRIPT_TAG : "";
    const script = rulesTag + '<script id="v2262UiUxRuntime">' + runtime + '</script>';
    source = source.replace("</body>", script + "</body>");
  }
  const needsGuidedRuntime = /class=["'][^"']*\b(?:abPageReserve|abPageBudgets|abPageGuide)\b/i.test(source)
    || source.includes("homeOnboarding")
    || /<form\b[^>]*method=["']post["']/i.test(source)
    || /<form\b[^>]*action=["'][^"']+["'][^>]*method=["']post["']/i.test(source);
  if (!optimizedMobileHome && needsGuidedRuntime && !source.includes('id="v2281GuidedUiUxRuntime"') && source.includes("</body>")) {
    const script = '<script id="v2281GuidedUiUxRuntime">(' + guidedUiUxClientMain.toString() + ')();</script>';
    source = source.replace("</body>", script + "</body>");
  }
  // V22.8.18 (B) 제출 위치 인라인 결과: POST 폼 또는 상단 결과 배너가 있는
  // 모든 사용자 화면에 부착한다. 모바일 홈(optimizedMobileHome)도 빠른 입력의
  // 저장 결과가 상단에만 떠서 안 보이는 문제가 있으므로 예외 없이 포함한다.
  const needsInlineResultRuntime = /<form\b[^>]*method=["']post["']/i.test(source)
    || /class="(?:notice )?(?:ok|error|err)"/.test(source);
  if (needsInlineResultRuntime && !source.includes('id="v22818InlineResult"') && source.includes("</body>")) {
    if (!source.includes('id="v22818InlineResultStyle"') && source.includes("</head>")) {
      // 셸 CSS 링크는 항상 마지막 스타일 캐스케이드여야 한다(다크모드 보호 규칙).
      // 셸 링크가 있으면 그 앞에, 없으면 </head> 직전에 넣는다.
      const shellLinkTag = `<link rel="stylesheet" href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"/>`;
      if (source.includes(shellLinkTag)) {
        source = source.replace(shellLinkTag, `${V22818_INLINE_RESULT_STYLE}${shellLinkTag}`);
      } else {
        source = source.replace("</head>", `${V22818_INLINE_RESULT_STYLE}</head>`);
      }
    }
    const script = '<script id="v22818InlineResult">(' + inlineActionResultClientMain.toString() + ')();</script>';
    source = source.replace("</body>", script + "</body>");
  }
  const needsMutationGuard = /<form[^>]+method=["']post["'][^>]+action=["']\/my\/(?:create|join)["']/i.test(source)
    || /<form[^>]+action=["']\/my\/(?:create|join)["'][^>]+method=["']post["']/i.test(source);
  if (needsMutationGuard && !source.includes('id="v2263MutationGuard"') && source.includes("</body>")) {
    // The shared submit lock owns disabling and bfcache restoration. This
    // helper only supplies a contextual label after that lock succeeds.
    const guard = `<script id="v2263MutationGuard">(function(){document.querySelectorAll('form[method="post"][action="/my/create"],form[method="post"][action="/my/join"]').forEach(function(form){form.addEventListener('submit',function(event){var button=event.submitter&&form.contains(event.submitter)?event.submitter:form.querySelector('button[type="submit"],input[type="submit"]');var label=function(){if(event.defaultPrevented||!button||button.dataset.abSubmitLocked!=="1")return;if(button.tagName==="BUTTON")button.textContent=form.action.indexOf('/join')>=0?'참여 요청 중…':'가계부 만드는 중…';};if(typeof queueMicrotask==="function")queueMicrotask(label);else Promise.resolve().then(label);});});})();</script>`;
    source = source.replace("</body>", guard + "</body>");
  }
  if (source.includes(`href="${ACCOUNTBOOK_SHELL_CSS_ASSET_PATH}"`)
    && !source.includes(`src="${ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH}"`)
    && source.includes("</body>")) {
    const stage4Nav = `<script id="v22818Stage4NavRuntime" src="${ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH}" defer></script>`;
    source = source.replace("</body>", stage4Nav + "</body>");
  }
  return source;
}

function attachBusinessInfoFooter(html = "") {
  const source = String(html || "");
  // Shared responsive CSS can mention `.abBusinessFooter` before the actual
  // element is appended. Only a real footer element should stop insertion.
  if (!source || /<footer\b[^>]*class=["'][^"']*\babBusinessFooter\b/i.test(source)) return source;
  // 사업자 정보는 공개 서비스·정책 페이지에서만 노출한다. 인증 후 앱 화면에서는
  // 고정 하단 메뉴와 겹쳐 작은 화면을 가리므로 삽입하지 않는다.
  if (!/class=["'][^"']*\bpubHeader\b/i.test(source)) return source;
  const footer = renderBusinessInfoFooter();
  if (source.includes("</main></body></html>")) return source.replace("</main></body></html>", `${footer}</main></body></html>`);
  if (source.includes("</body></html>")) return source.replace("</body></html>", `${footer}</body></html>`);
  return source;
}
