// V22.9.83 — 화면 정리 1차(메뉴 이름·묶음·화면 제목·정기 수입·지출 화면)의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자 지적(2026-10-28): "계획한다라는 단어도 이상하고 본다·적는다 … 메뉴명도 너무 어설퍼 보이고", 통계·리포트류와
// 정기 수입·지출 화면이 이상하다. 화면을 실제로 그려 보니 이런 것들이 나왔다.
//   1. 사이드바 묶음 이름이 동사(적는다·본다·계획한다·함께 쓴다)였고, 한 묶음만 열려 나머지 메뉴가 숨었다.
//   2. 사이드바 항목 이름이 화면 제목과 달랐다(통계 → 화면은 소비 분석, 분석 → 종합 리포트, 정산 요약 → 정산 …).
//   3. 같은 주소(/my/analysis)의 두 보기가 사이드바에 다른 메뉴(통계·분석)로 따로 있었다.
//   4. 서버가 그린 하단 탭(홈·거래·입력·통계·예산)을 브라우저 스크립트가 다른 이름(홈·기록·입력·예산·전체)으로 바꿨다.
//   5. 전체 메뉴(/menu)의 묶음(계획과 자산·가계부 관리·분석과 자동화)이 사이드바와 달랐고, 로그아웃이 파란 주 단추였다.
//   6. 탭 제목에 옛 이름(PC 홈도 "모바일", "무료 리포트", "무료 스마트 도구", "고급 정산")이 남았다.
//   7. 정기 수입·지출 화면에서 브라우저 스크립트가 첫 번째 .reserveSmartForm(이미 등록한 항목의 수정 양식)을 '추가 양식'으로
//      잡아, "다가오는 납부·입금" 구역 제목을 "정기 수입·지출 추가"로 바꾸고 id="reserveAdd" 를 하나 더 붙였다. 진짜 추가 양식은
//      안내 배치를 받지 못했다. 화면 안에서도 '정기'(알림만)와 '고정'(매달 기록)이 섞여 두 기능이 구분되지 않았다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처로 화면과 자산을 실제로 받아 이름·순서·속성을 견준다. 브라우저 스크립트는 자산 바이트에서 확인한다.
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, withClock, page } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.83 화면 정리 1차(메뉴 묶음·이름·하단 탭·전체 메뉴·분석 보기 탭·탭 제목·정기 수입·지출)");
const HH = "house-home";
const Q = `month=2026-07&household_id=${HH}`;
const strip = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/\s+/g, " ");
const count = (text, needle) => String(text).split(needle).length - 1;
const sidebar = (html) => {
  const groups = [...html.matchAll(/<div class="abNavGroup abNavSection" role="group" aria-label="([^"]+)"><p class="abNavLabel" aria-hidden="true">[^<]*<\/p><div class="abNavLinks">([\s\S]*?)<\/div><\/div>/g)];
  return groups.map(([, label, links]) => ({ label, items: [...links.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/g)].map(([a]) => strip(a).trim()) }));
};
const activeSidebar = (html) => [...html.matchAll(/<div class="abNavLinks">([\s\S]*?)<\/div><\/div>/g)]
  .flatMap(([, links]) => [...links.matchAll(/<a\b[^>]*aria-current="page"[^>]*>[\s\S]*?<\/a>/g)].map(([a]) => strip(a).trim()));
const bottomTabs = (html) => {
  const tabs = [...html.matchAll(/<a data-key="([^"]+)"[^>]*href="[^"]*"><i data-ab-nav-icon="[^"]*"><\/i><span>([^<]+)<\/span><\/a>/g)];
  return tabs.map(([, key, label]) => `${key}:${label}`);
};
const title = (html) => (html.match(/<title>([^<]*)<\/title>/) || [])[1] || "";
const asset = async (path) => (await app.fetch(new Request(`${BASE}${path}`), {}, ctx)).text();

const SIDEBAR = [
  { label: "기록", items: ["홈", "거래 내역", "캘린더", "가져오기"] },
  { label: "분석", items: ["소비 분석", "생활비 리포트", "연간 리포트", "스마트 도구"] },
  { label: "예산·자산", items: ["예산", "정기 수입·지출", "예산 알림", "저축·목표", "자산·결제수단"] },
  { label: "함께", items: ["단톡방 연결", "참여자·초대", "정산"] },
  { label: "설정", items: ["가계부 전환·추가", "분류·키워드", "백업·복구", "내 계정·보안"] },
];
const BOTTOM = ["home:홈", "records:내역", "quick:입력", "stats:분석", "budgets:예산"];

await withClock("2026-07-15", () => fixture(async (fx) => {
  // ── 1·2. 사이드바: 명사 묶음 다섯 개, 늘 펼침, 항목 이름 = 화면 이름 ──
  const home = (await page(fx, `/app?${Q}`)).html;
  t.deepEq(sidebar(home), SIDEBAR, "1 사이드바 묶음과 항목이 기록·분석·예산·자산·함께·설정 순서다");
  for (const verb of ["적는다", "본다", "계획한다", "함께 쓴다"]) t.ok(!strip(home).includes(verb), `1 화면 어디에도 옛 동사 묶음 이름 '${verb}'이 없다`);
  t.ok(!/<details class="abNavGroup/.test(home), "1 사용자 사이드바는 접는 <details> 묶음을 쓰지 않는다(한 묶음만 열리던 것)");
  t.ok(!home.includes("abNavDashboard"), "1 사이드바 달력을 그리지 않는다(아래 묶음이 첫 화면 밖으로 밀리던 것)");
  t.ok(!/<h[1-6][^>]*class="abNavLabel/.test(home) && count(home, 'class="abNavLabel" aria-hidden="true"') === 5, "1 묶음 이름표는 제목 요소가 아니고 화면 읽기에서 두 번 읽히지 않는다");

  // ── 3. 같은 주소의 두 보기: 사이드바는 소비 분석 하나, 화면 위 보기 탭으로 오간다 ──
  const stats = (await page(fx, `/my/analysis?${Q}`)).html;
  const report = (await page(fx, `/my/analysis?${Q}&view=report`)).html;
  t.deepEq(activeSidebar(stats), ["소비 분석"], "3 /my/analysis 는 사이드바의 소비 분석을 켠다");
  t.deepEq(activeSidebar(report), ["소비 분석"], "3 종합 리포트 보기(view=report)도 소비 분석 한 항목을 켠다");
  const views = (html) => (html.match(/<div class="lrSeg abAnalysisViews" role="group" aria-label="소비 분석 보기">([\s\S]*?)<\/div>/) || [])[1] || "";
  t.ok(/aria-current="true"[^>]*>한눈에 보기<\/a>/.test(views(stats)) && !/aria-current="true"[^>]*>종합 리포트/.test(views(stats)), "3 한눈에 보기 화면은 보기 탭의 한눈에 보기를 켠다");
  t.ok(/aria-current="true"[^>]*>종합 리포트<\/a>/.test(views(report)) && !/aria-current="true"[^>]*>한눈에 보기/.test(views(report)), "3 종합 리포트 화면은 보기 탭의 종합 리포트를 켠다");
  const reportHref = (views(stats).match(/<a href="([^"]*view=report[^"]*)">종합 리포트<\/a>/) || [])[1] || "";
  t.ok(reportHref.startsWith("/my/analysis?") && reportHref.includes("month=2026-07") && reportHref.includes(`household_id=${HH}`), `3 보기 탭은 같은 달·같은 가계부로 건너간다 (${reportHref})`);
  for (const [html, name] of [[stats, "한눈에 보기"], [report, "종합 리포트"]]) {
    const text = strip(html);
    t.ok(!text.includes("MONTHLY DASHBOARD") && !text.includes("깊게 보기(종합 리포트)") && !text.includes("← 한눈에 보기(소비 분석)"), `3 ${name}: 영어 머리표와 서로를 설명하던 건너가기 단추가 없다`);
  }
  t.ok(strip(stats).includes("월간 요약"), "3 한눈에 보기의 월간 요약 머리표는 한국어다");

  // ── 4. 하단 탭: 서버와 브라우저가 같은 다섯 칸·같은 이름 ──
  t.deepEq(bottomTabs(home), BOTTOM, "4 서버 하단 탭은 홈·내역·입력·분석·예산이다");
  const reserve = (await page(fx, `/reserve-plans?${Q}`)).html;
  t.ok(/<a data-key="budgets" class="active" aria-current="page"/.test(reserve), "4 정기 수입·지출 화면은 하단 예산 탭을 켠다");
  t.deepEq(activeSidebar(reserve), ["정기 수입·지출"], "2 정기 수입·지출은 사이드바에서 제 항목을 켠다(예산 탭 아래 숨지 않는다)");
  const navPath = (home.match(/\/assets\/accountbook-nav-v\d+\.js/) || [])[0];
  t.ok(navPath === "/assets/accountbook-nav-v22983.js", `4 홈이 바뀐 메뉴 스크립트 주소를 쓴다 (${navPath})`);
  const navJs = await asset(navPath);
  const clientTabs = [...navJs.matchAll(/\{ key: "([a-z]+)", icon: "[a-z]+", label: "([^"]+)", href:/g)].map(([, key, label]) => `${key}:${label}`);
  t.deepEq(clientTabs, BOTTOM, "4 브라우저가 다시 그리는 하단 탭도 같은 다섯 칸·같은 이름이다(화면이 뜨는 순간 이름이 바뀌지 않는다)");
  t.ok(!/label: "전체"/.test(navJs) && !/label: "기록", href/.test(navJs), "4 브라우저 하단 탭에 옛 이름(기록·전체)이 없다");

  // ── 5. 전체 메뉴: 사이드바와 같은 묶음, 로그아웃은 보조 단추 ──
  const menu = (await page(fx, `/menu?${Q}`)).html;
  const menuSections = [...menu.matchAll(/<section class="menuSection"><div class="menuSectionHead"><h2>([^<]+)<\/h2>/g)].map(([, h]) => h);
  t.deepEq(menuSections, SIDEBAR.map((g) => g.label), "5 전체 메뉴 묶음이 사이드바와 같은 이름·순서다");
  const featured = [...menu.matchAll(/<a class="featuredCard"[^>]*>[\s\S]*?<b>([^<]+)<\/b>/g)].map(([, b]) => b);
  t.deepEq(featured, ["기록 입력", "거래 내역", "소비 분석", "예산"], "5 위 네 칸은 하단 탭과 같은 이름을 쓴다");
  const menuText = strip(menu);
  for (const old of ["계획과 자산", "분석과 자동화", "개인 설정과 도움말", "스마트 분석", "최근 기록"]) t.ok(!menuText.includes(old), `5 전체 메뉴에 옛 이름 '${old}'이 없다`);
  const sidebarItems = SIDEBAR.flatMap((g) => g.items).filter((name) => name !== "홈");
  t.ok(sidebarItems.every((name) => menuText.includes(name)), "5 사이드바의 모든 항목이 전체 메뉴에도 같은 이름으로 있다");
  t.ok(menu.includes('<form class="menuLogout" method="post" action="/my/logout"><button class="secondary" type="submit">로그아웃</button>'), "5 로그아웃은 보조 단추(공용 제출 단추 파랑 규칙에서 빠진다)");
  t.ok(/\.menuPage \.menuLogout button\{[^}]*background:transparent!important/.test(menu), "5 로그아웃 단추는 바탕을 칠하지 않는다");

  // ── 6. 탭 제목 = 화면 이름 ──
  t.ok(!title(home).includes("모바일") && title(home).endsWith(" · 홈"), `6 PC 홈 탭 제목에 '모바일'이 없다 (${title(home)})`);
  const titles = {};
  for (const [name, path] of [["reports", `/reports?${Q}`], ["smart", `/smart-tools?${Q}`], ["settlement", `/settlement-summary?${Q}`]]) titles[name] = title((await page(fx, path)).html);
  t.ok(titles.reports.endsWith(" · 생활비 리포트") && !titles.reports.includes("무료"), `6 생활비 리포트 탭 제목 (${titles.reports})`);
  t.ok(titles.smart.endsWith(" · 스마트 도구") && !titles.smart.includes("무료"), `6 스마트 도구 탭 제목 (${titles.smart})`);
  t.ok(!titles.settlement.includes("고급 정산"), `6 정산 탭 제목에 '고급 정산'이 없다 (${titles.settlement})`);
  const settings = (await page(fx, `/my/settings?${Q}`)).html;
  t.ok(strip(settings).includes("전체 요약") && !strip(settings).includes("설정 한눈에"), "6 예산·정기·분류 요약 탭은 '전체 요약'이다(사이드바 설정 묶음과 헷갈리던 '설정 한눈에')");

  // ── 7. 정기 수입·지출: 추가 양식은 하나, 제목 버그 없음, 두 기능 이름 구분 ──
  const text = strip(reserve);
  t.eq((reserve.match(/class="[^"]*\breserveSmartForm\b[^"]*"/g) || []).length, 1, "7 .reserveSmartForm 을 단 요소는 추가 양식 하나뿐이다(브라우저 안내 배치가 첫 번째를 잡는다)");
  t.ok(count(reserve, 'class="formGrid reserveSmartForm" method="post" action="/admin/reserve-plan/create"') === 1, "7 추가 양식이 정확히 하나 있다");
  t.ok(count(reserve, 'class="formGrid reserveEditForm" method="post" action="/admin/reserve-plan/update"') >= 1, "7 등록한 항목의 수정 양식은 다른 이름표(reserveEditForm)를 쓴다");
  t.ok(reserve.includes('document.querySelectorAll(".reserveSmartForm,.reserveEditForm")'), "7 납부월 칸 맞추기는 추가·수정 양식 모두에 걸린다");
  t.eq(count(reserve, 'id="reserveAdd"'), 1, "7 id=reserveAdd 는 하나뿐이다");
  t.ok(/<section class="card[^"]*" id="reserveAdd"><h2>납부·입금 일정 추가<\/h2>/.test(reserve), "7 reserveAdd 는 추가 양식 카드에 붙는다");
  t.ok(/<section class="card[^"]*"><h2>다가오는 납부·입금<\/h2>/.test(reserve), "7 다가오는 납부·입금 구역은 제 제목을 지킨다");
  t.ok(!text.includes("정기 수입·지출 추가") && !text.includes("고정 수입·지출"), "7 화면 안에 '정기 수입·지출 추가'·'고정 수입·지출'이 남지 않는다");
  t.ok(text.includes("매달 자동 기록") && text.includes("납부·입금 일정") && text.includes("기록은 만들지 않습니다"), "7 두 기능(매달 자동 기록·납부·입금 일정)을 이름으로 구분하고 알림만 하는 쪽을 밝힌다");
  t.ok(text.includes("이번 달 납부 일정") && !text.includes("이번 달 나갈 정기지출"), "7 위 숫자 칸은 납부·입금 일정만 센다고 이름으로 말한다");
  t.ok(/<details class="fixedAdd"><summary>자동 기록 항목 추가<\/summary>/.test(reserve), "7 매달 자동 기록이 있으면 추가 양식은 접혀 있다");
  t.ok(text.includes("이번 달분 지금 기록하기"), "7 이번 달분을 지금 넣는 단추 이름");
  // 이 화면은 브라우저 안내 배치(guidedUiUxClientMain)를 인라인으로 받고, 모바일 홈은 같은 함수를 홈 스크립트 자산으로 받는다.
  t.ok(reserve.includes('heading.textContent = "납부·입금 일정 추가"') && !reserve.includes("정기 항목 저장"), "7 이 화면의 인라인 안내 배치가 붙이는 제목도 같다");
  const homeJs = await asset("/assets/mobile-home-v22984.js");
  t.ok(homeJs.includes('heading.textContent = "납부·입금 일정 추가"') && homeJs.includes('submitButton.textContent = "일정 저장"') && !homeJs.includes("정기 항목 저장"), "7 브라우저 안내 배치가 붙이는 제목·단추 이름도 같다");
  t.ok(homeJs.includes('document.querySelector(".reserveSmartForm")'), "7 브라우저 안내 배치는 .reserveSmartForm(이제 추가 양식 하나)을 잡는다");

  // 매달 자동 기록이 하나도 없으면 추가 양식을 펼쳐 둔다.
  fx.db.accountbook_recurring = (fx.db.accountbook_recurring || []).filter((row) => row.household_id !== HH);
  const empty = (await page(fx, `/reserve-plans?${Q}`)).html;
  t.ok(/<details class="fixedAdd" open><summary>자동 기록 항목 추가<\/summary>/.test(empty), "7 매달 자동 기록이 없으면 추가 양식이 펼쳐져 있다");
}));

const version = readFileSync(new URL("../VERSION.txt", import.meta.url), "utf8").trim();
t.ok(/^V22\.9\.\d+-/.test(version), "판 이름 형식");
t.done();
