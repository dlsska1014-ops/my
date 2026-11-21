// V22.9.139 애드센스 재심사 최종 보강 5대 기둥 통합 검사.
// 1. 서브도메인 분리(공개 푸터 tools.malhaebook.com 제거) 및 빈 광고 슬롯(data-ad-status="unfilled") 자동 숨김 CSS.
// 2. 본문 인라인 인터랙티브 계산표 12종(기존 다행 계산표 6종 + 신규 세무·예산·실적 미니 계산기 6종) SSR DOM·검산·오프라인 파일.
// 3. /demo 실시간 자연어·카드 승인 문자 해석 샌드박스(#parser-sandbox) SSR 노출 및 클라이언트 해석 정확도.
// 4. 생활비 가이드 글 40편 고유 인라인 SVG 데이터 차트(.pubDataChart), 주제별 맞춤 히어로 CTA, /articles 12종 계산표 허브, /about 편집·검산 원칙.
// 5. 로그인 웹 앱(/menu·/settlement-summary·/reserve-plans·/payment-methods·비로그인 /my)에서 공개 계산표·가이드로의 문맥 연결.
import assert from "node:assert/strict";
import vm from "node:vm";
import app from "../src/index.js";
import { worksheetComputeV229106 as compute } from "../src/modules/public/worksheet-calculations.js";
import {
  PUBLIC_ALL_CALCULATORS_V229139 as allSpecs,
  PUBLIC_ARTICLE_CHARTS_V229139 as chartSpecs,
  PUBLIC_MINI_CALCULATORS_V229139 as miniSpecs,
  PUBLIC_WORKSHEETS_V229106 as sheetSpecs,
  publicWorksheetPathV229106 as worksheetPath,
} from "../src/modules/public/worksheet-pages.js";
import { publicSandboxClient } from "../src/modules/public/guide-content.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const bad = (fn, message) => { assert.throws(fn, undefined, message); checks += 1; };

const ORIGIN = "https://malhaebook.com";
const fx = await createV2265QaFixture();
const ownerCookie = await fx.cookieFor("user-bin");

async function get(path, { cookie = "", env = {}, method = "GET" } = {}) {
  const res = await app.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", ...(cookie ? { cookie } : {}) },
  }), { ...fx.env, ...env }, { waitUntil() {} });
  return { status: res.status, headers: res.headers, html: await res.text() };
}

const realFetch = globalThis.fetch;
let outbound = 0;

try {
  // ── 1. 신규 세무·예산·실적 미니 계산기 6종 순수 계산 및 예외 검증 ─────────────────
  eq(Object.keys(sheetSpecs).length, 6, "기존 다행 계산표 6종 유지");
  eq(Object.keys(miniSpecs).length, 6, "신규 세무·예산·실적 미니 계산기 6종 추가");
  eq(Object.keys(allSpecs).length, 12, "총 12종 인터랙티브 계산표 등록");

  // 1-a. payment-method-switch-nov-dec
  {
    const ex = structuredClone(miniSpecs["payment-method-switch-nov-dec"].example);
    const out = compute("payment-method-switch-nov-dec", ex);
    eq(out.threshold, 12000000, "총급여 4,800만 원의 25% 문턱 = 1,200만 원");
    eq(out.current, 765000, "1~10월 누적 공제액 = 765,000원");
    eq(out.keepCredit, 1215000, "11~12월 신용 유지 시 1,215,000원");
    eq(out.switchDebit, 1665000, "11~12월 체크·현금 전환 시 1,665,000원");
    eq(out.diffApplied, 450000, "전환 시 소득공제 450,000원 증가");
    ex.settings.salary = 0;
    bad(() => compute("payment-method-switch-nov-dec", ex), "총급여 0원 거절");
  }

  // 1-b. rent-tax-credit-records
  {
    const ex = structuredClone(miniSpecs["rent-tax-credit-records"].example);
    const out = compute("rent-tax-credit-records", ex);
    eq(out.annualRent, 7800000, "연간 월세 780만 원");
    eq(out.creditRate, 17, "5,500만 원 이하 17% 세액공제율");
    eq(out.taxCredit, 1326000, "월세 세액공제 1,326,000원");
    eq(out.cashDeduction, 2340000, "현금영수증 30% 소득공제 2,340,000원");
    eq(out.cashTaxSaved, 351000, "한계세율 15% 기준 현금영수증 세금 감소 351,000원");
    eq(out.difference, 975000, "월세 세액공제가 975,000원 더 유리");
    ex.settings.salary = 85000000;
    const high = compute("rent-tax-credit-records", ex);
    eq(high.taxCredit, 0, "총급여 8,000만 원 초과는 월세 세액공제 0원");
    ex.settings.months = 13;
    bad(() => compute("rent-tax-credit-records", ex), "13개월 입력 거절");
  }

  // 1-c. pension-savings-irp-tax-credit
  {
    const ex = structuredClone(miniSpecs["pension-savings-irp-tax-credit"].example);
    const out = compute("pension-savings-irp-tax-credit", ex);
    eq([out.eligiblePension, out.eligibleIrp, out.eligibleTotal, out.totalCredit], [6000000, 3000000, 9000000, 1485000], "연금저축 600만 + IRP 300만 → 16.5% 1,485,000원");
    ex.settings.salary = 60000000;
    ex.settings.pension = 7000000;
    ex.settings.irp = 4000000;
    const high = compute("pension-savings-irp-tax-credit", ex);
    eq([high.eligiblePension, high.eligibleIrp, high.eligibleTotal, high.excessDeposit, high.totalCredit], [6000000, 3000000, 9000000, 2000000, 1188000], "5,500만 초과 13.2% 및 한도 초과 원금 200만 원 분리");
  }

  // 1-d. budget-ratio-guide
  {
    const ex = structuredClone(miniSpecs["budget-ratio-guide"].example);
    const out = compute("budget-ratio-guide", ex);
    eq([out.needBudget, out.wantBudget, out.saveBudget, out.variableNeed, out.weeklyCap], [1500000, 900000, 600000, 550000, 338333], "월 300만 50/30/20 배분 및 주간 한도");
    ex.settings.needRatio = 60;
    bad(() => compute("budget-ratio-guide", ex), "비율 합계 100% 아님 거절");
  }

  // 1-e. emergency-fund-basics
  {
    const ex = structuredClone(miniSpecs["emergency-fund-basics"].example);
    const out = compute("emergency-fund-basics", ex);
    eq([out.monthlyEssential, out.targetFund, out.shortfall, out.monthlyTransfer], [1500000, 4500000, 3000000, 300000], "월 필수 생활비 150만 → 3개월 450만 → 월 30만 적립");
    ex.settings.targetMonths = 0;
    bad(() => compute("emergency-fund-basics", ex), "0개월 목표 거절");
  }

  // 1-f. card-spending-threshold
  {
    const ex = structuredClone(miniSpecs["card-spending-threshold"].example);
    const out = compute("card-spending-threshold", ex);
    eq([out.totalSwipe, out.gap, out.unplanned, out.netGain], [310000, 50000, 30000, -15000], "실적 부족 5만·비계획 지출 3만 → 순손실 -15,000원");
  }

  // ── 2. 공개 페이지 렌더링(외부 네트워크 요청 0회) 및 12종 인라인 계산표·40편 차트 ──
  globalThis.fetch = async () => { outbound += 1; throw new Error("unexpected outbound fetch during public render"); };
  try {
    // 2-a. 12종 계산표 글 모두 본문 안에 #inline-worksheet 와 #worksheet-form·#worksheet-result·.pubToolChecks·Schema.org WebApplication 구조화 데이터를 직접 포함한다.
    for (const [slug, spec] of Object.entries(allSpecs)) {
      const page = await get(`/${slug}`);
      eq(page.status, 200, `/${slug} 정본 글 200`);
      ok(page.html.includes('<section class="pubInlineTool" id="inline-worksheet"'), `/${slug}: 정본 DOM 안에 인라인 계산표 섹션 포함`);
      ok(page.html.includes('<form id="worksheet-form"') && page.html.includes('id="worksheet-settings"') && page.html.includes('id="worksheet-result"'), `/${slug}: 정본 DOM 안에 입력 폼과 SSR 결과 표 포함`);
      ok(page.html.includes('<details class="pubToolChecks"><summary>검산 공식과 예외 처리 기준 보기</summary>'), `/${slug}: 정본 인라인 계산표 안에 검산 공식과 예외 규칙 아코디언 포함`);
      ok(page.html.includes('<a href="#inline-worksheet">인터랙티브 계산표</a>'), `/${slug}: 목차에 인라인 계산표 바로가기 포함`);
      ok(!page.html.includes("tools.malhaebook.com"), `/${slug}: 서브도메인 푸터 링크 완전 분리`);
      const ld = JSON.parse(page.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
      eq(ld.hasPart?.["@type"], "WebApplication", `/${slug}: JSON-LD hasPart WebApplication 명시`);
      eq(ld.hasPart?.applicationCategory, "FinanceApplication", `/${slug}: JSON-LD FinanceApplication 명시`);
      eq(ld.hasPart?.url, `${ORIGIN}/${slug}#inline-worksheet`, `/${slug}: JSON-LD 인라인 계산표 주소`);
      if (Object.hasOwn(miniSpecs, slug)) {
        const heroActions = (page.html.match(/<div class="pubHeroActions">([\s\S]*?)<\/div>/) || ["", ""])[1];
        ok(heroActions.includes('class="pubBtn" href="#inline-worksheet"'), `/${slug}: 미니 계산기 글 대표 히어로 단추가 본문 인라인 계산표(#inline-worksheet)로 바로 이동`);
      }
      const sheet = await get(worksheetPath(slug));
      eq(sheet.status, 200, `${slug}: 오프라인 계산표 자산 200`);
      ok(sheet.html.includes(spec.title) && sheet.html.includes('id="worksheet-form"'), `${slug}: 오프라인 계산표 HTML 정상`);
      const dl = await get(`${worksheetPath(slug)}?download=1`);
      eq(dl.status, 200, `${slug}: 오프라인 계산표 다운로드 200`);
      ok(String(dl.headers.get("content-disposition") || "").includes(`${slug}.html`), `${slug}: 첨부 파일 헤더`);
    }

    // 2-b. 40편의 생활비 가이드 글 모두 고유 인라인 SVG 데이터 차트(.pubDataChart)와 맞춤 히어로 CTA 를 가진다.
    const slugs = Object.keys(chartSpecs);
    eq(slugs.length, 40, "생활비 가이드 글 40편 전체에 차트 명세 존재");
    const seenChartTitles = new Set();
    const seenChartCaptions = new Set();
    for (const slug of slugs) {
      const page = await get(`/${slug}`);
      eq(page.status, 200, `/${slug}: 200`);
      const chartMatch = page.html.match(/<figure class="pubDataChart"[^>]* aria-label="([^"]+)">([\s\S]*?)<figcaption>([^<]+)<\/figcaption><\/figure>/);
      ok(chartMatch, `/${slug}: 인라인 SVG 데이터 차트(.pubDataChart) 렌더링`);
      const [, chartTitle, svgBody, chartCaption] = chartMatch;
      ok(svgBody.includes('<svg class="pubChartSvg"') && (svgBody.match(/<rect /g) || []).length >= 7, `/${slug}: SVG 막대 그래프 요소 포함`);
      ok(!seenChartTitles.has(chartTitle), `/${slug}: 고유한 차트 제목 (${chartTitle})`);
      ok(!seenChartCaptions.has(chartCaption), `/${slug}: 고유한 차트 설명 (${chartCaption})`);
      seenChartTitles.add(chartTitle);
      seenChartCaptions.add(chartCaption);
      const heroActions = (page.html.match(/<div class="pubHeroActions">([\s\S]*?)<\/div>/) || ["", ""])[1];
      ok(!heroActions.includes('href="/demo">가상 예제로 확인하기</a><a class="pubBtn secondary" href="/guides">전체 사용 가이드</a>'), `/${slug}: 획일적인 기본 CTA 대신 주제별 맞춤 CTA 적용`);
    }

    // 2-c. /articles 허브의 12종 계산표 바로가기 상자와 배지(계산표 포함 6 + 미니 계산기 포함 6).
    const hub = await get("/articles");
    eq(hub.status, 200, "/articles 200");
    ok(hub.html.includes('class="pubSummary pubToolHub"') && hub.html.includes("브라우저에서 바로 계산하는 생활비·세금 계산표 12종"), "/articles 상단에 12종 계산표 바로가기 허브 표시");
    eq((hub.html.match(/· 계산표 포함<\/small>/g) || []).length, 6, "/articles 다행 계산표 배지 6개");
    eq((hub.html.match(/· 미니 계산기 포함<\/small>/g) || []).length, 6, "/articles 미니 계산기 배지 6개");

    // 2-d. /about 작성·검토 원칙에서 생성형 도구 문구 제거 및 자체 검산 스크립트 명시.
    const about = await get("/about");
    eq(about.status, 200, "/about 200");
    ok(!about.html.includes("생성형 글쓰기 도구"), "/about 에 생성형 글쓰기 도구 문구가 없다");
    ok(about.html.includes("자체 검산 스크립트로 직접 검증하고 책임집니다"), "/about 에 운영자의 직접 법령·통계 대조 및 자체 검산 책임 명시");

    // 2-e. /demo 실시간 자연어·카드 승인 문자 해석 샌드박스(#parser-sandbox) 및 첫 화면(/)·가이드 허브(/guides) 연결 검증.
    const home = await get("/");
    eq(home.status, 200, "/ 200");
    ok(home.html.includes('href="/demo#parser-sandbox"'), "/ 첫 화면에서 실시간 문장·카드문자 해석기(/demo#parser-sandbox)로 바로 연결");
    const guidesHub = await get("/guides");
    eq(guidesHub.status, 200, "/guides 200");
    ok(guidesHub.html.includes('href="/demo#parser-sandbox"'), "/guides 에서 실시간 문장·카드문자 해석기로 바로 연결");
    for (const slug of Object.keys(allSpecs)) {
      ok(guidesHub.html.includes(`href="/${slug}"`), `/guides 에서 인터랙티브 계산표 글 /${slug} 로 직접 연결`);
    }

    const demo = await get("/demo");
    eq(demo.status, 200, "/demo 200");
    ok(Buffer.byteLength(demo.html) <= 72 * 1024, `/demo 72 KiB 이하 (${Buffer.byteLength(demo.html)} B)`);
    ok(demo.html.includes('id="parser-sandbox"') && demo.html.includes('<form id="sandbox-form"'), "/demo 에 숨기지 않은 SSR 자연어·카드문자 해석기 폼 노출");
    eq((demo.html.match(/data-sandbox-sample="/g) || []).length, 5, "/demo 에 5종의 즉시 체험 예시 칩 제공");
    const demoLd = JSON.parse(demo.html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    eq(demoLd.hasPart?.length, 2, "/demo JSON-LD 에 두 가지 WebApplication(예산 시뮬레이터·실시간 문장 해석기) 명시");

    const sandboxEls = new Map();
    const sampleBtns = [
      "[Web발신] 삼성1234승인 45,000원 일시불 11/15 교촌치킨 누적532,000원",
      "월급 320만원 국민은행",
      "택시 14,500원 카카오페이",
    ].map((sample) => ({
      handlers: new Map(),
      getAttribute: (k) => (k === "data-sandbox-sample" ? sample : ""),
      addEventListener(type, fn) { this.handlers.set(type, fn); },
    }));
    for (const id of ["sandbox-form", "sandbox-input", "sandbox-reset", "sandbox-status", "sandbox-type", "sandbox-amount", "sandbox-category", "sandbox-method", "sandbox-memo", "sandbox-after"]) {
      sandboxEls.set(id, {
        value: id === "sandbox-input" ? "점심 김치찌개 11,000원 신한카드" : "",
        textContent: "",
        attrs: new Map(),
        handlers: new Map(),
        addEventListener(type, fn) { this.handlers.set(type, fn); },
        setAttribute(k, v) { this.attrs.set(k, v); },
        querySelectorAll: () => sampleBtns,
      });
    }
    vm.runInNewContext(`(${publicSandboxClient.toString()})();`, { document: { getElementById: (id) => sandboxEls.get(id) } });
    const runSubmit = () => sandboxEls.get("sandbox-form").handlers.get("submit")({ preventDefault() {} });
    runSubmit();
    eq(sandboxEls.get("sandbox-amount").textContent, "11,000원", "기본 문장 금액 해석");
    eq(sandboxEls.get("sandbox-category").textContent, "식비", "기본 문장 분류 해석");
    eq(sandboxEls.get("sandbox-after").textContent, "164,000원", "기본 문장 예산 차감 반영");

    // 카드 승인 문자 칩 클릭 시 카드 끝번호(1234)·날짜(11/15)·누적금액(532,000)을 걸러내고 45,000원·삼성카드로 해석
    sampleBtns[0].handlers.get("click")();
    eq(sandboxEls.get("sandbox-type").textContent, "지출", "카드 승인 문자 구분");
    eq(sandboxEls.get("sandbox-amount").textContent, "45,000원", "카드 승인 문자 결제 금액만 정확히 추출");
    eq(sandboxEls.get("sandbox-method").textContent, "삼성카드", "카드 승인 문자 카드사 추출");
    eq(sandboxEls.get("sandbox-after").textContent, "130,000원", "카드 승인 문자 식비 예산 차감");

    // 월급 320만원 수입 칩 클릭
    sampleBtns[1].handlers.get("click")();
    eq(sandboxEls.get("sandbox-type").textContent, "수입", "만원 단위 월급 수입 구분");
    eq(sandboxEls.get("sandbox-amount").textContent, "3,200,000원", "320만원 → 3,200,000원 변환");
    eq(sandboxEls.get("sandbox-category").textContent, "급여·수입", "급여·수입 자동 분류");

    // 금액 없는 잘못된 입력
    sandboxEls.get("sandbox-input").value = "금액 없는 문장 테스트";
    runSubmit();
    eq(sandboxEls.get("sandbox-input").attrs.get("aria-invalid"), "true", "금액 없는 문장 aria-invalid 표시");

    // 2-f. 광고 live 모드에서 unfilled 광고 슬롯 자동 숨김 CSS 확인
    const liveArticle = await get("/payment-method-switch-nov-dec", { env: { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" } });
    ok(liveArticle.html.includes('.adSlot[hidden],.adSlot:has(ins[data-ad-status="unfilled"]){display:none!important}'), "live 모드 빈 광고 슬롯(unfilled) 자동 숨김 CSS 포함");
  } finally {
    globalThis.fetch = realFetch;
  }
  eq(outbound, 0, "공개 화면 렌더링 중 외부 요청 0회");

  // ── 3. 로그인 웹 앱 및 로그인 화면에서 공개 계산표·가이드 연결 확인 ──────────────
  const loginPage = await get("/my");
  eq(loginPage.status, 200, "비로그인 /my 200");
  ok(loginPage.html.includes('<a href="/articles">생활비 계산표</a>') && loginPage.html.includes('<a href="/guides">사용 가이드</a>'), "비로그인 /my 하단에 생활비 계산표·사용 가이드 링크 노출");

  const menuPage = await get("/menu?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(menuPage.status, 200, "로그인 /menu 200");
  ok(menuPage.html.includes('href="/articles"') && menuPage.html.includes("생활비 계산표·가이드 글") && menuPage.html.includes('href="/guides"'), "/menu 도움말과 안내에 공개 계산표·가이드 허브 연결");

  const settlementPage = await get("/settlement-summary?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(settlementPage.status, 200, "로그인 /settlement-summary 200");
  ok(settlementPage.html.includes('href="/shared-living-cost-rules"') && settlementPage.html.includes('href="/roommate-shared-ledger"'), "/settlement-summary 에 공동 생활비·입퇴거 일할 계산표 연결");

  const reservePage = await get("/reserve-plans?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(reservePage.status, 200, "로그인 /reserve-plans 200");
  ok(reservePage.html.includes('href="/sinking-fund-annual-expenses"') && reservePage.html.includes('href="/emergency-fund-basics"'), "/reserve-plans 에 비정기 지출·비상금 계산표 연결");

  const paymentPage = await get("/payment-methods?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(paymentPage.status, 200, "로그인 /payment-methods 200");
  ok(paymentPage.html.includes('href="/payment-method-switch-nov-dec"') && paymentPage.html.includes('href="/card-spending-threshold"'), "/payment-methods 에 연말정산 카드 전환·전월 실적 계산표 연결");

  console.log(`V22.9.139 애드센스 재심사 5대 기둥 통합 검사 통과 (${checks} checks)`);
} finally {
  fx.restore();
}
