import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const PUBLISHER_CLIENT = "ca-pub-8422696710972974";
const PUBLISHER_TXT = "pub-8422696710972974";
const SELLER_LINE = `google.com, ${PUBLISHER_TXT}, DIRECT, f08c47fec0942fa0\n`;
const AD_RUNTIME_PATTERN = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead/i;
const AD_COOKIE_PATTERN = /__gads|__gpi|__eoi/i;
let passed = 0;

function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  passed += 1;
}

function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  passed += 1;
}

function countOf(source, text) {
  return String(source || "").split(text).length - 1;
}

const fixture = await createV2265QaFixture();
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

function request(path, options = {}) {
  const env = options.env || fixture.env;
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method: options.method || "GET",
    headers: {
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ...(options.cookie ? { cookie: options.cookie } : {}),
      ...(options.headers || {}),
    },
  }), env, {});
}

try {
  const home = await request("/");
  eq(home.status, 200, "public homepage is available for AdSense review");
  const homeHtml = await home.text();
  eq(countOf(homeHtml, `<meta name="google-adsense-account" content="${PUBLISHER_CLIENT}"/>`), 1, "homepage contains the exact ownership meta once");
  ok(!AD_RUNTIME_PATTERN.test(homeHtml), "homepage stays free of advertising runtime and slots");
  ok(!AD_COOKIE_PATTERN.test(homeHtml), "homepage contains no advertising-cookie runtime");
  ok(homeHtml.includes("개인정보처리방침") && homeHtml.includes("이용약관") && homeHtml.includes("쿠키 정책"), "homepage exposes review policy navigation");
  ok(homeHtml.includes("도담 네트워크") && homeHtml.includes("729-24-02288"), "homepage exposes the operator identity");
  ok(home.headers.get("cache-control")?.includes("public"), "public review page remains crawlable and cacheable");
  eq(home.headers.get("set-cookie"), null, "public homepage creates no cookie during review");
  ok(!/googlesyndication|googleadservices|doubleclick/i.test(home.headers.get("content-security-policy") || ""), "review CSP does not allow advertising hosts");

  const adsTxt = await request("/ads.txt");
  eq(adsTxt.status, 200, "ads.txt is available at the root domain");
  const adsTxtBody = await adsTxt.text();
  eq(adsTxtBody, SELLER_LINE, "ads.txt contains the exact authorized seller line");
  ok(adsTxt.headers.get("content-type")?.startsWith("text/plain"), "ads.txt uses a plain-text content type");
  ok(adsTxt.headers.get("cache-control")?.includes("public"), "ads.txt is publicly cacheable");
  ok(adsTxtBody.charCodeAt(0) !== 0xfeff, "ads.txt has no UTF-8 BOM");
  eq(adsTxt.headers.get("set-cookie"), null, "ads.txt creates no cookie");

  const publicPaths = [
    "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide",
    "/group-accountbook", "/security", "/faq", "/about", "/contact",
    "/privacy", "/terms", "/cookies", "/site-map",
  ];
  for (const path of publicPaths) {
    const response = await request(path);
    eq(response.status, 200, `${path} is available to the review crawler`);
    const html = await response.text();
    eq(countOf(html, `<meta name="google-adsense-account" content="${PUBLISHER_CLIENT}"/>`), 1, `${path} contains exact ownership metadata once`);
    ok(!AD_RUNTIME_PATTERN.test(html) && !AD_COOKIE_PATTERN.test(html), `${path} stays ad-runtime and ad-cookie free before approval`);
    eq(response.headers.get("set-cookie"), null, `${path} creates no review cookie`);
  }

  const publicAliasPaths = [
    "/sitemap", "/service", "/usage-guide", "/kakao-accountbook-guide",
    "/budget-management-guide", "/family-accountbook", "/data-security",
    "/about-service", "/support", "/cookie-policy", "/data-policy", "/service-policy",
  ];
  for (const path of publicAliasPaths) {
    const response = await request(path);
    eq(response.status, 200, `${path} public alias is available to the review crawler`);
    const html = await response.text();
    eq(countOf(html, `<meta name="google-adsense-account" content="${PUBLISHER_CLIENT}"/>`), 1, `${path} public alias contains exact ownership metadata once`);
    ok(!AD_RUNTIME_PATTERN.test(html) && !AD_COOKIE_PATTERN.test(html), `${path} public alias stays ad-runtime and ad-cookie free`);
    eq(response.headers.get("set-cookie"), null, `${path} public alias creates no review cookie`);
  }

  const context = "month=2026-07&household_id=house-home";
  const privatePaths = [
    `/app?${context}`,
    `/app?${context}&view=calendar`,
    `/my/analysis?${context}`,
    `/my/analysis?view=report&${context}`,
    `/receipts?${context}`,
    `/reports?${context}`,
    `/menu?${context}`,
    `/my/households?${context}`,
    `/analysis?${context}`,
    `/calendar?${context}`,
    "/admin-view",
    "/operation-center",
    `/api/calendar?${context}`,
  ];
  for (const path of privatePaths) {
    const response = await request(path, { cookie: fixture.cookie });
    ok(response.status < 500, `${path} responds without a server error`);
    const body = await response.text();
    ok(!body.includes("google-adsense-account"), `${path} has no AdSense ownership metadata`);
    ok(!AD_RUNTIME_PATTERN.test(body) && !AD_COOKIE_PATTERN.test(body), `${path} has no advertising runtime, slot, or cookie code`);
  }

  const adminEnv = { ...fixture.env, ADMIN_API_TOKEN: "qa-admin-review-token" };
  const adminPaths = ["/?legacy=1", "/admin-view", "/operation-center", "/budgets", "/settings", "/backup"];
  for (const path of adminPaths) {
    const response = await request(path, { env: adminEnv, headers: { authorization: "Bearer qa-admin-review-token" } });
    eq(response.status, 200, `${path} renders the authenticated administrator surface`);
    const html = await response.text();
    ok(!html.includes("google-adsense-account"), `${path} administrator surface has no AdSense ownership metadata`);
    ok(!AD_RUNTIME_PATTERN.test(html) && !AD_COOKIE_PATTERN.test(html), `${path} administrator surface has no advertising runtime or cookie code`);
  }

  const overrideEnv = { ...fixture.env, ADSENSE_PUBLISHER_ID: "ca-pub-1111111111111111" };
  const override = await request("/", { env: overrideEnv });
  const overrideHtml = await override.text();
  eq(countOf(overrideHtml, `content="${PUBLISHER_CLIENT}"`), 1, "a legacy valid environment value cannot override the reviewed publisher ID");
  ok(!overrideHtml.includes("ca-pub-1111111111111111"), "legacy valid publisher value is ignored during review");
  ok(!AD_RUNTIME_PATTERN.test(overrideHtml), "legacy publisher value cannot activate advertising runtime");

  const invalidEnv = { ...fixture.env, ADSENSE_PUBLISHER_ID: "invalid-publisher" };
  const invalidAdsTxt = await request("/ads.txt", { env: invalidEnv });
  eq(await invalidAdsTxt.text(), SELLER_LINE, "invalid legacy publisher value cannot alter ads.txt");
  const invalidHome = await request("/", { env: invalidEnv });
  eq(countOf(await invalidHome.text(), `<meta name="google-adsense-account" content="${PUBLISHER_CLIENT}"/>`), 1, "invalid legacy publisher value cannot remove public ownership metadata");

  ok(source.includes(`const DEFAULT_ADSENSE_PUBLISHER_ID = "${PUBLISHER_CLIENT}";`), "source pins the reviewed public publisher ID");
  ok(!source.includes("env.ADSENSE_PUBLISHER_ID") && !source.includes("env.GOOGLE_ADSENSE_ACCOUNT"), "legacy publisher environment variables cannot override the review owner");
  ok(!source.includes("ADSENSE_AUTO_ADS"), "review release cannot accidentally enable Auto ads");
  ok(!source.includes("ADSENSE_ENABLED"), "review release has no advertising enable switch");
  ok(!source.includes("googlesyndication"), "review source contains no Google ad runtime host");
  ok(!/googleadservices|doubleclick|pagead/i.test(source), "review source contains no alternate advertising runtime host");
  ok(!AD_COOKIE_PATTERN.test(source), "review source contains no advertising-cookie identifier");
  ok(source.includes('url.pathname === "/ads.txt"'), "root ads.txt route is registered");
  ok(source.includes('"/privacy", "/terms", "/cookies"'), "review policy pages remain in the public content map");
  ok(source.includes("AdSense review mode is ownership-only"), "source documents the ownership-only review boundary");

  const kakaoCommands = await request("/kakao-commands");
  eq(kakaoCommands.status, 200, "Kakao command guide renders for contrast review");
  const kakaoCommandsHtml = await kakaoCommands.text();
  ok(kakaoCommandsHtml.includes("linear-gradient(135deg,#0b1739,#153878);color:#fff") && kakaoCommandsHtml.includes(".hero p{color:#dbeafe"), "Kakao command hero uses a consistently dark surface with readable foregrounds");
  ok(!kakaoCommandsHtml.includes("linear-gradient(135deg,#111827,#FEE500);color:#111827"), "Kakao command guide no longer mixes dark text with a dark-to-yellow gradient");
  const backupSafety = await request("/backup-safety");
  eq(backupSafety.status, 200, "backup safety guide renders for contrast review");
  const backupSafetyHtml = await backupSafety.text();
  // V22.8.83: 히어로 그라디언트가 컬러톤을 따라간다. 흰 글자를 이고 있으므로
  // 대비 안전 토큰인 --ab12-action 을 읽는다(--ab12-brand 는 8개 조합 중 5개에서
  // 흰 글자 4.5:1 을 못 넘긴다). 폴백은 원래 색이라 셸 밖에서는 그대로다.
  ok(backupSafetyHtml.includes("linear-gradient(135deg,#111827,var(--ab12-action,#92400e));color:#fff") && backupSafetyHtml.includes(".hero p{color:#fff"), "backup safety hero copy meets the stronger foreground rule");
  const siteMap = await request("/site-map");
  const siteMapHtml = await siteMap.text();
  ok(siteMapHtml.includes(".pubFooter{display:grid") && siteMapHtml.includes("color:#596579"), "public footer copy uses the strengthened review-page foreground");
  ok(source.includes(".abBusinessFooter{margin:18px") && source.includes("color:#596579;font-size:11px"), "business identity footer uses the strengthened foreground");
  const householdFlow = await request("/household-flow");
  const householdFlowHtml = await householdFlow.text();
  ok(householdFlowHtml.includes("linear-gradient(135deg,#111827,var(--ab12-action,#0e7490));color:#fff") && householdFlowHtml.includes(".hero p{color:#fff"), "household flow hero keeps readable copy across its full gradient");

  const shellResponse = await request("/assets/accountbook-shell-v22914.css");
  eq(shellResponse.status, 200, "V22.8.38 V5 stabilization stylesheet is served");
  eq(shellResponse.headers.get("etag"), '"accountbook-shell-v22914-css"', "current shell has a fresh immutable ETag");
  const shell = await shellResponse.text();
  // V22.8.97(7.1): "N월 지출" 히어로를 걷어냈다. V22.8.17 이 지키려던 것은
  // "홈이 큰 대표 숫자 하나로 시작한다"였고 그 성질은 그대로다 — 이제 그 자리는
  // P0(이번 달 쓸 수 있는 돈)이고, 34px 토큰을 쓴다. 히어로가 둘이 아니라 하나다.
  ok(shell.includes(".homeBudgetAmount b{font-size:34px") || shell.includes("--ab12-fs-num-xl"), "V2 home hierarchy still leads with one large number");
  ok(shell.includes(".calDay.noRec{background:transparent!important") && shell.includes("opacity:1!important"), "calendar empty dates use transparent readable cells instead of whole-cell opacity");
  ok(shell.includes(".calDay.isToday b"), "calendar stylesheet has a distinct current-day treatment");
  ok(shell.includes(".filterBar{top:8px;margin:12px 0;padding:12px;background:var(--ab12-surface)!important;background:color-mix"), "analysis filter bar has a shared-surface fallback before color-mix enhancement");
  ok(shell.includes(":is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn)") && shell.includes("background:var(--ab12-action)!important;color:#fff!important"), "active analysis filters and apply action keep explicit high-contrast foregrounds");
  ok(shell.includes(".appMenu>summary{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important"), "collapsed mobile analysis menu keeps readable text and surface contrast");
  ok(shell.includes(".tchip.on small{color:#fff!important}"), "active analysis filter metadata remains readable on the action surface");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn)'), "dark analysis active states outrank the legacy inherited-color rule");
  ok(shell.includes(".calDay.hasRec.sel :is(b,strong,em,small){color:#fff!important}"), "selected calendar amounts remain readable across themes and tones");
  ok(shell.includes(".calSelected{background:var(--ab12-accent-soft)!important;color:var(--ab12-text)!important"), "selected-date guidance uses theme-safe foreground and surface tokens");
  ok(shell.includes(".calDow.sun{color:#b4233e!important}") && shell.includes(".calDow.sat{color:#1d4ed8!important}"), "calendar weekday headers preserve weekend meaning");
  ok(shell.includes(".kpi small.up{color:#fca5a5!important}") && shell.includes(".kpi small.down{color:#6ee7b7!important}"), "dark analysis preserves expense-change semantics");
  ok(shell.includes(".iChip.good{background:rgba(6,95,70,.28)!important") && shell.includes(".iChip.bad{background:rgba(127,29,29,.32)!important"), "dark insight chips preserve success and risk states");
  ok(shell.includes("prefers-reduced-motion") && shell.includes("focus-visible"), "V2 layer preserves motion and keyboard-focus safeguards");
  ok(shell.includes('html[data-ab-resolved-theme="dark"]') && shell.includes('data-ab-tone="amber"'), "V2 layer preserves dark mode and all color-tone infrastructure");
  ok(shell.includes("V22.8.18 UI/UX stage 4") && shell.includes("V22.8.23 UI V5 step 3") && shell.includes("V22.8.24 UI V5 shell correctness") && shell.includes("V22.8.25 UI V5 global actions") && shell.includes(".abGlobalDialog::backdrop") && shell.includes("@media(max-width:899px)") && shell.includes("@media(min-width:900px)") && shell.includes("--abNavW:238px"), "V5 shell keeps the unified 238px navigation and adds responsive global actions at the reviewed 900px boundary");
  ok(shell.includes("--bg:var(--ab12-bg)") && shell.includes("--card:var(--ab12-surface)") && shell.includes("--brand:var(--ab12-brand)"), "V5 tokens are mapped to the persisted theme system instead of replacing it");
  ok(shell.includes(".abNavLinks a.active{background:var(--accent-weak)!important;color:var(--accent)!important"), "stage 4 active navigation keeps theme-safe contrast");
  ok(shell.includes("height:calc(64px + var(--abSafeBottom))") && shell.includes("grid-template-columns:repeat(2,minmax(0,1fr))"), "stage 4 mobile navigation and drawer use the supplied responsive layout");
  ok(shell.includes("html[data-ab-resolved-theme=\"dark\"] body.abV22812Shell") && shell.includes("--pos:#6ee7b7;--neg:#fca5a5"), "stage 4 dark mode preserves semantic positive and negative colors");
  ok(shell.includes("V22.8.19 contrast hotfix") && shell.includes("body.abV22812Shell.abPageAssets .hero{background:linear-gradient(135deg,#0b1739,#153878)!important;color:#fff!important"), "payment assets hero stays dark with an explicit white foreground after the shared card cascade");
  ok(shell.includes("body.abV22812Shell.abPageAssets .assetEmptyMark") && shell.includes("body.abV22812Shell.abPageAssets .emptyCta{background:var(--accent)!important;color:#fff!important}"), "payment assets empty state uses contrast-safe semantic tokens");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.zero,.orText){color:var(--ab12-muted)!important}'), "dark settlement and household separator text use the readable muted token");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.flowCard,.copyBox)') && shell.includes("background:var(--ab12-surface-raised)!important"), "signed-in Kakao flow cards use dark surfaces with dark mode");
  ok(shell.includes("body.abV22812Shell .flowCard>span{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important"), "signed-in Kakao flow step badges keep readable dark-mode foregrounds");
  ok(shell.includes("body.abV22812Shell.abPageAnalysisReport .insightList>div") && shell.includes("body.abV22812Shell.abPageAnalysisReport .deltaUp{color:#fca5a5!important}"), "analysis report cards and change values keep readable dark-mode foregrounds");
  ok(shell.includes("body.abV22812Shell.abPageAnalysisReport :is(.trendValue,.seriesLegend span){color:var(--ab12-muted)!important}"), "analysis report zero values and legend labels use the readable dark muted token");
  // V22.9.5: 사이드바 묶음 기준이 시스템 개념(자산·리포트·함께·관리)에서 사용자가
  // 하는 일(적는다·본다·계획한다)로 바뀌었다. 지키려던 성질 — "서버가 그리는
  // 내비게이션이 이름 붙은 그룹으로 앱 전체를 덮는다" — 은 그대로다. 라벨 문자열이
  // 아니라 그 성질을 렌더 결과에서 확인한다.
  ok(source.includes('key: "record", label: "적는다"') && source.includes('key: "review", label: "본다"') && source.includes('key: "plan", label: "계획한다"') && source.includes('key: "settings", label: "설정"'), "stage 4 information architecture is applied to the server navigation");
  ok(source.includes('["stats", "통계", "stats"') && source.includes('["budgets", "예산", "budget"') && source.includes('["groups", "단톡방 연결"') && source.includes('["import", "가져오기"'), "V5 navigation exposes the reviewed mobile destinations and complete available desktop routes");
  ok(source.includes('aria-label="가계부 전체 메뉴"') && source.includes('aria-label="가계부 주요 메뉴"'), "stage 4 navigation regions have accessible names");
  ok(source.includes('aria-controls="abDesktopSidebar" aria-expanded="false"') && source.includes('aria-controls="abDesktopSidebar" aria-expanded="true"'), "mobile and desktop navigation controls expose their expanded state for the same shell");
  ok(source.includes("syncMobileMenu(open)") && source.includes('setAttribute("aria-expanded",open?"true":"false")'), "mobile menu runtime keeps accessibility state synchronized");
  ok(source.includes('class="filterBar abV5FilterBar"') && source.includes('class="kpiRow abV5KpiGrid"'), "interactive analysis uses the shared V5 filter and KPI contracts");
  ok(source.includes('${renderUnifiedNav("stats", { month, householdId: selected.id || "", householdName: selected.name || "가계부", showSidebarDashboard: true') && source.includes('reportChallenge: challenge })}<main class="wrap"><div class="pageMain">'), "interactive statistics uses the shared service shell with its report dashboard context");
  ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22893.js"'), "V5 navigation ships as a separately versioned asset");

  const stage4NavResponse = await request("/assets/accountbook-nav-v22893.js");
  eq(stage4NavResponse.status, 200, "V5 navigation runtime is served");
  eq(stage4NavResponse.headers.get("etag"), '"accountbook-nav-v22893-js"', "V5 navigation runtime has the reviewed immutable ETag");
  const stage4NavRuntime = await stage4NavResponse.text();
  ok(stage4NavRuntime.includes('label: "기록"') && stage4NavRuntime.includes('label: "입력"') && stage4NavRuntime.includes('label: "예산"') && stage4NavRuntime.includes('label: "전체"') && stage4NavRuntime.includes('path === "/my/households"') && stage4NavRuntime.includes('event.key !== "Tab"') && stage4NavRuntime.includes('var sidebarActive = active === "home" ? "app" : active') && stage4NavRuntime.includes('data-abv5-search-open') && stage4NavRuntime.includes('data-ab-theme-choice="dark"'), "V5 runtime keeps route-aware state and connects the reviewed global actions");

  const calendarHome = await request(`/app?${context}&view=calendar`, { cookie: fixture.cookie });
  eq(calendarHome.status, 200, "integrated home calendar renders");
  const calendarHomeHtml = await calendarHome.text();
  // 같은 성질을 실제 렌더에서 확인한다: 대표 숫자 자리가 하나 있고, 그 달의 지출
  // 금액은 사라진 게 아니라 homeMetrics 로 옮겨져 여전히 실제 값으로 보인다.
  ok(calendarHomeHtml.includes('class="homeBudget"') && calendarHomeHtml.includes("이번 달 쓸 수 있는 돈"), "home renders one P0 hierarchy from real data");
  ok(calendarHomeHtml.includes("나간 돈") && /나간 돈[\s\S]{0,120}-[\d,]+원/.test(calendarHomeHtml), "the month expense figure is still shown, from real data");
  ok(!calendarHomeHtml.includes('class="homeSpendHero"'), "the duplicated monthly expense card is gone");
  ok(calendarHomeHtml.includes('class="panel homeCalendar"') && calendarHomeHtml.includes("기록이 없는 날은 배경 없이"), "home calendar uses the V2 empty-date hierarchy");
  ok(calendarHomeHtml.includes("calDay noRec") && calendarHomeHtml.includes("calDay hasRec"), "calendar keeps distinct empty and recorded dates");
  ok(/class="calDay [^"]*\bsun\b/.test(calendarHomeHtml) && /class="calDay [^"]*\bsat\b/.test(calendarHomeHtml), "calendar marks both weekend columns on date cells");
  ok(calendarHomeHtml.includes('class="calDow sun"') && calendarHomeHtml.includes('class="calDow sat"'), "calendar marks both weekend headers");
  // 오늘 표시는 "오늘이 속한 달"에서만 렌더된다. 고정된 2026-07을 쓰면 달이 바뀔 때마다 깨지므로
  // 이 항목만 현재 월 달력을 따로 받아 확인한다.
  const currentMonthKey = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit" }).format(new Date()).slice(0, 7);
  const currentMonthCalendar = await request(`/app?month=${encodeURIComponent(currentMonthKey)}&household_id=house-home&view=calendar`, { cookie: fixture.cookie });
  eq(currentMonthCalendar.status, 200, "current month calendar renders");
  ok((await currentMonthCalendar.text()).includes('aria-current="date"'), "current date is exposed to assistive technology");
  ok(calendarHomeHtml.includes('aria-label="이전 달"') && calendarHomeHtml.includes('aria-label="다음 달"'), "calendar month navigation has accessible names");
  // V22.8.87(M1): 다섯 칸은 유지하되 가운데가 정산 → 기록(＋)으로 바뀌었다.
  // 정산은 통계 화면 머리말의 진입점으로 내려갔고 /settlement-summary 주소는 그대로다.
  ok(calendarHomeHtml.includes('<span>홈</span>') && calendarHomeHtml.includes('<span>거래</span>') && calendarHomeHtml.includes('<span>입력</span>') && calendarHomeHtml.includes('<span>통계</span>') && calendarHomeHtml.includes('<span>예산</span>'), "mobile home uses the V5 five-destination task navigation");
  ok(calendarHomeHtml.includes('class="abNavQuick"') && calendarHomeHtml.includes("data-ab-quick-open"), "the centre destination is the quick-entry action");
  // 정산은 사이드바 "함께" 그룹에 그대로 있다. 사라진 것은 하단 탭 자리뿐이므로
  // 하단 탭 마크업만 떼어 확인한다.
  const calendarBottomNav = (calendarHomeHtml.match(/<nav class="abNavBottom"[\s\S]*?<\/nav>/) || [""])[0];
  ok(calendarBottomNav.length > 0, "the bottom navigation is rendered");
  ok(!calendarBottomNav.includes('data-key="settlement"'), "settlement no longer occupies a bottom tab");
  ok(calendarHomeHtml.includes('href="/settlement-summary?month=2026-07&amp;household_id=house-home"'), "settlement stays reachable from the drawer");
  ok(!calendarHomeHtml.includes('class="tab tabAdd"'), "stage 4 mobile home does not duplicate the visible quick-entry action in bottom navigation");
  ok(calendarHomeHtml.includes('class="abLayoutNav ') && calendarHomeHtml.includes("abNavMobileDrawer") && !calendarHomeHtml.includes('class="homeDesktopNav"'), "home uses the shared V5 sidebar as a functional mobile drawer instead of a home-only copy");
  eq(countOf(calendarHomeHtml, 'href="/assets/accountbook-shell-v22914.css"'), 1, "home loads the current shell exactly once");
  eq(countOf(calendarHomeHtml, 'src="/assets/accountbook-nav-v22893.js"'), 1, "home loads the V5 navigation runtime exactly once after preserved runtimes");

  const selectedCalendarHome = await request(`/app?${context}&view=calendar&date=2026-07-04`, { cookie: fixture.cookie });
  eq(selectedCalendarHome.status, 200, "calendar renders a selected recorded date");
  const selectedCalendarHtml = await selectedCalendarHome.text();
  ok(selectedCalendarHtml.includes('class="calDay hasRec sel') && selectedCalendarHtml.includes('class="calSelected"'), "selected calendar date and guidance remain in the DOM contract");

  const insight = await request(`/my/analysis?${context}`, { cookie: fixture.cookie });
  eq(insight.status, 200, "interactive analysis renders");
  const insightHtml = await insight.text();
  ok(insightHtml.includes("abPageInsight") && insightHtml.includes('class="abLayoutNav ') && !insightHtml.includes('class="appMenu"') && insightHtml.includes("소비 분석"), "interactive analysis receives its isolated scope and shared V5 navigation/header");
  ok(insightHtml.includes('id="filterBar"') && insightHtml.includes('id="periodChips"'), "analysis preserves its period and filter DOM contract");
  ok(insightHtml.includes('id="trendChart"') && insightHtml.includes('id="catChart"') && insightHtml.includes('id="weekChart"'), "analysis preserves its chart DOM contract");
  ok(insightHtml.includes('/my/analysis/app.js?v=V22.9.0-UX-REPAIR'), "analysis keeps the protected external runtime with the new cache version");
  eq(countOf(insightHtml, 'href="/assets/accountbook-shell-v22914.css"'), 1, "analysis loads the current shell exactly once");

  const report = await request(`/my/analysis?view=report&${context}`, { cookie: fixture.cookie });
  eq(report.status, 200, "analysis report renders");
  const reportHtml = await report.text();
  ok(reportHtml.includes("abPageAnalysisReport") && reportHtml.includes("abV5RemainingPage") && reportHtml.includes('class="abLayoutNav ') && !reportHtml.includes('class="appMenu"') && reportHtml.includes("핵심 인사이트"), "analysis report uses the centralized V5 shell without losing report content");

  const calendar = await request(`/calendar?${context}`, { cookie: fixture.cookie });
  eq(calendar.status, 303, "legacy calendar route redirects authenticated users to the integrated calendar");
  ok(calendar.headers.get("location")?.includes("/app?") && calendar.headers.get("location")?.includes("view=calendar"), "calendar redirect preserves the integrated V2 calendar target");
  ok(!calendar.headers.get("location")?.includes("google") && !(await calendar.text()).includes("google-adsense-account"), "calendar redirect remains advertising-free");

  console.log(`smoke_adsense_v2_review: ${passed} checks passed`);
} finally {
  fixture.restore();
}
