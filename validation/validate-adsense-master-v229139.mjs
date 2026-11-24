// V22.9.139 애드센스 재심사 보강 통합 검사(11-22 이어받아 고친 범위 — 사용자 물음 창 "고치고 세무 계산기 빼기").
// 1. 서브도메인 분리(공개 푸터 tools.malhaebook.com 제거) 및 빈 광고 슬롯(data-ad-status="unfilled") 자동 숨김 CSS.
// 2. 본문 인라인 계산표 9종(기존 다행 계산표 6종 + 예산·비상금·카드 실적 미니 계산기 3종). 세무 계산기 셋(카드 공제 전환·월세·연금저축 IRP)은 없다.
// 3. /demo 한 줄 기록 예시 = 카카오톡 봇의 해석기(parseTransaction) 결과. 브라우저에서 따로 읽는 체험 칸·‘실시간 해석기’ 표시는 없다.
// 4. 차트는 계산표 기본 예제와 같은 값을 보여 주는 글 3편에만, 주제별 대표 단추, /articles 9종 계산표 모음, /about 의 생성형 도구 밝힘 문장, 구조화 데이터에 WebApplication 없음.
// 5. 로그인 웹 앱(/menu·/settlement-summary·/reserve-plans·/payment-methods·비로그인 /my)에서 공개 계산표·가이드로의 문맥 연결.
import assert from "node:assert/strict";
import app, { parseTransaction } from "../src/index.js";
import { worksheetComputeV229106 as compute } from "../src/modules/public/worksheet-calculations.js";
import {
  PUBLIC_ALL_CALCULATORS_V229139 as allSpecs,
  PUBLIC_ARTICLE_CHARTS_V229139 as chartSpecs,
  PUBLIC_ARTICLE_CTA_MAP_V229139 as ctaMap,
  PUBLIC_MINI_CALCULATORS_V229139 as miniSpecs,
  PUBLIC_WORKSHEETS_V229106 as sheetSpecs,
  publicWorksheetPathV229106 as worksheetPath,
} from "../src/modules/public/worksheet-pages.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };
const bad = (fn, message) => { assert.throws(fn, undefined, message); checks += 1; };

const ORIGIN = "https://malhaebook.com";
// V22.9.142(사용자 11-24 결정 3·5 — 합치고 규칙은 국세청 안내로): 11~12월 결제수단 글은 카드 소득공제 글로, 시즌 글 다섯 편은 연말정산 글로
// 합쳤다(옛 주소 308). 남은 세무 글 넷 모두 대표 단추가 국세청·법령 원문으로 간다.
const TAX_SLUGS = ["card-income-deduction-basics", "year-end-tax-expense-check", "rent-tax-credit-records", "pension-savings-irp-tax-credit"];
const fx = await createV2265QaFixture();
const ownerCookie = await fx.cookieFor("user-bin");

async function get(path, { cookie = "", env = {}, method = "GET" } = {}) {
  const res = await app.fetch(new Request(`${ORIGIN}${path}`, {
    method,
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", ...(cookie ? { cookie } : {}) },
  }), { ...fx.env, ...env }, { waitUntil() {} });
  return { status: res.status, headers: res.headers, html: await res.text() };
}
const jsonLd = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const heroOf = (html) => (html.match(/<div class="pubHeroActions">([\s\S]*?)<\/div>/) || ["", ""])[1];
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");

const realFetch = globalThis.fetch;
let outbound = 0;

try {
  // ── 1. 계산표 9종과 미니 계산기 3종의 순수 계산·예외 ─────────────────────────
  eq(Object.keys(sheetSpecs).length, 6, "기존 다행 계산표 6종 유지");
  eq(Object.keys(miniSpecs).sort(), ["budget-ratio-guide", "card-spending-threshold", "emergency-fund-basics"], "미니 계산기는 예산·비상금·카드 실적 3종");
  eq(Object.keys(allSpecs).length, 9, "계산표 9종 등록");
  for (const slug of TAX_SLUGS) ok(!Object.hasOwn(allSpecs, slug), `세무 계산기 ${slug} 는 등록하지 않는다`);

  const fund = {
    settings: { meal: 90000, taxi: 18000, payer: "A" },
    members: ["A", "B", "C", "D"].map((name, i) => ({ name, dues: 30000, rode: i < 2 ? "yes" : "no" })),
  };
  const settleFund = () => compute("group-accountbook", fund);
  eq(settleFund().tables[0].rows[2], ["공금 잔액", 30000], "회비와 개인 카드를 별도 결산");
  eq(settleFund().tables[1].rows, [["B", "A", 9000]], "두 사람만 택시비 분담");
  fund.members[2].rode = "yes";
  eq(settleFund().tables[1].rows, [["B", "A", 6000], ["C", "A", 6000]], "세 탑승자 분담");
  ok(settleFund().shareText.includes("B → A 6,000원"), "공유 문구에 실제 송금액 표시");
  fund.settings.taxi = 18001;
  fund.settings.payer = "D";
  eq(settleFund().tables[1].rows, [["A", "D", 6001], ["B", "D", 6000], ["C", "D", 6000]], "미탑승 선결제자와 남은 1원");
  fund.settings.meal = 130000;
  eq(settleFund().tables[0].rows[2], ["공금 부족액", 10000], "음수 잔액을 부족액으로 표시");
  fund.members.forEach(row => { row.rode = "no"; });
  assert.throws(settleFund, /탑승/);
  fund.settings.taxi = 0;
  fund.settings.payer = "";
  eq(settleFund().tables[1].rows, [["추가 송금 없음", "", 0]], "택시를 쓰지 않은 모임");
  fund.members[2].name = "A";
  assert.throws(settleFund, /같은 이름/);
  const budget = compute("budget-ratio-guide", structuredClone(miniSpecs["budget-ratio-guide"].example));
  eq([budget.needBudget, budget.wantBudget, budget.saveBudget, budget.variableNeed, budget.weeklyCap], [1500000, 900000, 600000, 550000, 338333], "월 300만 50/30/20 배분 및 주간 한도");
  {
    const ex = structuredClone(miniSpecs["budget-ratio-guide"].example);
    ex.settings.needRatio = 60;
    bad(() => compute("budget-ratio-guide", ex), "비율 합계 100% 아님 거절");
  }
  for (const [fixedNeed, weeklyCap, shortfall] of [[1800000, 140000, 0], [2400000, 0, 0], [3200000, 0, 800000]]) {
    const data = structuredClone(miniSpecs["budget-ratio-guide"].example);
    data.settings.fixedNeed = fixedNeed;
    const result = compute("budget-ratio-guide", data);
    eq([result.weeklyCap, result.shortfall], [weeklyCap, shortfall], "고정비 초과분까지 반영한 주간 한도와 부족액");
  }
  const breakEven = structuredClone(miniSpecs["card-spending-threshold"].example);
  Object.assign(breakEven.settings, { threshold: 300000, recognized: 270000, planned: 15000, benefit: 15000 });
  const cardAtZero = compute("card-spending-threshold", breakEven);
  ok(cardAtZero.netGain === 0 && cardAtZero.notes.join(" ").includes("15,000원이 부족") && cardAtZero.notes.join(" ").includes("같습니다"), "카드 손익 0원에서 추가 결제와 혜택을 일치시킨다");
  const emergency = compute("emergency-fund-basics", structuredClone(miniSpecs["emergency-fund-basics"].example));
  eq([emergency.monthlyEssential, emergency.targetFund, emergency.shortfall, emergency.monthlyTransfer], [1500000, 4500000, 3000000, 300000], "월 필수 생활비 150만 → 3개월 450만 → 월 30만 적립");
  {
    const ex = structuredClone(miniSpecs["emergency-fund-basics"].example);
    ex.settings.targetMonths = 0;
    bad(() => compute("emergency-fund-basics", ex), "0개월 목표 거절");
  }
  const cardExample = structuredClone(miniSpecs["card-spending-threshold"].example);
  const card = compute("card-spending-threshold", cardExample);
  eq([card.totalSwipe, card.gap, card.unplanned, card.netGain], [310000, 50000, 30000, -15000], "실적 부족 5만·비계획 지출 3만 → 순손실 -15,000원");

  // ── 2. 차트 3편: 값은 계산표 기본 예제의 계산 결과와 같다 ───────────────────────
  eq(Object.keys(chartSpecs).sort(), ["budget-ratio-guide", "card-spending-threshold", "emergency-fund-basics"], "차트는 계산표 예제와 같은 값을 보여 주는 글 3편에만");
  const values = (slug) => chartSpecs[slug][1].map((bar) => bar[1]);
  eq(values("budget-ratio-guide"), [budget.needBudget, budget.wantBudget, budget.saveBudget].map((v) => v / 10000), "50/30/20 차트 = 계산표 배분(만 원)");
  eq(values("emergency-fund-basics"), [1, emergency.targetFund / emergency.monthlyEssential, 6].map((n) => (emergency.monthlyEssential * n) / 10000), "비상금 차트 = 월 필수 생활비 × 1·목표·6개월(만 원)");
  eq(values("card-spending-threshold"), [cardExample.settings.threshold, cardExample.settings.recognized, card.gap].map((v) => v / 1000), "전월 실적 차트 = 기준·인정액·부족액(천 원)");
  for (const [slug, [title, bars, caption]] of Object.entries(chartSpecs)) {
    ok(!/가상/.test(title + caption + bars.map((b) => b[0] + b[2]).join("")), `${slug}: 차트 글에 ‘가상’ 없음`);
    ok(caption.includes("계산표 기본 예제와 같은 값"), `${slug}: 차트 설명이 계산표 예제와 같은 값임을 밝힌다`);
  }

  // ── 3. 공개 페이지 렌더링(외부 요청 0회) ──────────────────────────────────────
  globalThis.fetch = async () => { outbound += 1; throw new Error("unexpected outbound fetch during public render"); };
  try {
    // 3-a. 계산표 9종 글: 본문 안 인라인 계산표, 예제 검산 접기, 목차 바로가기, 구조화 데이터에 WebApplication 없음.
    for (const [slug, spec] of Object.entries(allSpecs)) {
      const page = await get(`/${slug}`);
      eq(page.status, 200, `/${slug} 정본 글 200`);
      ok(page.html.includes('<section class="pubInlineTool" id="inline-worksheet"'), `/${slug}: 정본 DOM 안에 인라인 계산표 섹션 포함`);
      const beforeInit = page.html.match(/<form id="worksheet-form"[^>]*>([\s\S]*?)<\/form>/)[1];
      ok(beforeInit.startsWith("<fieldset disabled>") && beforeInit.endsWith("</fieldset>") && !beforeInit.includes('type="submit"'), "스크립트가 시작되기 전에는 제출 가능한 입력칸이 없다");
      ok(page.html.includes('<form id="worksheet-form"') && page.html.includes('id="worksheet-settings"') && page.html.includes('id="worksheet-result"'), `/${slug}: 정본 DOM 안에 입력 폼과 SSR 결과 표 포함`);
      if ((spec.checks || []).length) ok(page.html.includes('<details class="pubToolChecks"><summary>예제 검산 보기</summary>'), `/${slug}: 예제 검산 접기`);
      ok(page.html.includes('<a href="#inline-worksheet">인터랙티브 계산표</a>'), `/${slug}: 목차에 인라인 계산표 바로가기 포함`);
      ok(!page.html.includes("tools.malhaebook.com"), `/${slug}: 서브도메인 푸터 링크 분리`);
      ok(!page.html.includes("WebApplication") && jsonLd(page.html).hasPart === undefined, `/${slug}: 구조화 데이터에 WebApplication·hasPart 없음`);
      if (Object.hasOwn(miniSpecs, slug)) ok(heroOf(page.html).includes('class="pubBtn" href="#inline-worksheet"'), `/${slug}: 미니 계산기 글 대표 단추가 본문 계산표로 이동`);
      const sheet = await get(worksheetPath(slug));
      eq(sheet.status, 200, `${slug}: 오프라인 계산표 자산 200`);
      ok(sheet.html.includes(spec.title) && sheet.html.includes('id="worksheet-form"'), `${slug}: 오프라인 계산표 HTML 정상`);
      const dl = await get(`${worksheetPath(slug)}?download=1`);
      eq(dl.status, 200, `${slug}: 오프라인 계산표 다운로드 200`);
      ok(String(dl.headers.get("content-disposition") || "").includes(`${slug}.html`), `${slug}: 첨부 파일 헤더`);
    }

    // 3-b. 세무 글 셋: 계산기·차트 없이 대표 단추가 글 아래 참고 자료(국세청·법령 원문)로 간다.
    for (const slug of TAX_SLUGS) {
      const page = await get(`/${slug}`);
      eq(page.status, 200, `/${slug}: 글은 그대로 200`);
      ok(!page.html.includes('id="inline-worksheet"') && !page.html.includes("pubDataChart"), `/${slug}: 세무 계산기·차트 없음`);
      ok(heroOf(page.html).includes('<a class="pubBtn" href="#sources">국세청·법령 원문으로 확인하기</a>'), `/${slug}: 대표 단추 → 참고 자료`);
      ok(/<section class="pubSection pubSources" id="sources">[\s\S]*?https:\/\/(www\.)?(law|nts)\.go\.kr/.test(page.html), `/${slug}: 참고 자료에 국세청·법령 원문`);
      eq((await get(worksheetPath(slug))).status, 404, `/${slug}: 세무 계산표 자산 주소 없음`);
    }
    for (const [slug, ctas] of Object.entries(ctaMap)) {
      for (const [label, href] of ctas) {
        if (TAX_SLUGS.some((tax) => href === `/${tax}`)) ok(!/계산표|계산기|바로 계산/.test(label), `${slug}: 세무 글로 가는 단추(${label})에 계산표·계산기 이름 없음`);
        if (href === "#inline-worksheet") ok(Object.hasOwn(allSpecs, slug), `${slug}: 본문 계산표 단추는 계산표가 있는 글에만`);
      }
    }

    // 3-c. 차트는 3편에만, 나머지 글에는 없다. 주제별 대표 단추는 그대로.
    for (const slug of [...Object.keys(ctaMap), ...Object.keys(sheetSpecs)]) {
      const page = await get(`/${slug}`);
      eq(page.status, 200, `/${slug}: 200`);
      const chart = page.html.match(/<figure class="pubDataChart"[^>]* aria-label="([^"]+)">([\s\S]*?)<figcaption>([^<]+)<\/figcaption><\/figure>/);
      if (Object.hasOwn(chartSpecs, slug)) {
        ok(chart && chart[2].includes('<svg class="pubChartSvg"'), `/${slug}: 차트 렌더링`);
        eq(decode(chart[1]), chartSpecs[slug][0], `/${slug}: 차트 제목`);
      } else {
        ok(!chart && !page.html.includes("pubDataChart"), `/${slug}: 차트 없음`);
      }
      if (Object.hasOwn(ctaMap, slug)) ok(!heroOf(page.html).includes('href="/demo">가상 예제로 확인하기</a>'), `/${slug}: 주제별 대표 단추`);
    }

    // 3-d. /articles 계산표 모음 9종과 배지(계산표 포함 6 + 미니 계산기 포함 3).
    const hub = await get("/articles");
    eq(hub.status, 200, "/articles 200");
    const toolHub = (hub.html.match(/<aside class="pubSummary pubToolHub"[\s\S]*?<\/aside>/) || [""])[0];
    ok(toolHub.includes("브라우저에서 바로 계산하는 생활비 계산표 9종") && toolHub.includes("아래 9편의 글에는"), "/articles 계산표 모음 9종");
    eq((toolHub.match(/<a /g) || []).length, 9, "/articles 계산표 모음 링크 9개");
    ok(!TAX_SLUGS.some((slug) => toolHub.includes(`/${slug}`)), "/articles 계산표 모음에 세무 글 없음");
    eq((hub.html.match(/· 계산표 포함<\/small>/g) || []).length, 6, "/articles 다행 계산표 배지 6개");
    eq((hub.html.match(/· 미니 계산기 포함<\/small>/g) || []).length, 3, "/articles 미니 계산기 배지 3개");

    // 3-e. /about 의 작성·검토 원칙은 생성형 도구 사용을 밝힌다(계획 2절 — 숨기지 않는다).
    const about = await get("/about");
    eq(about.status, 200, "/about 200");
    ok(about.html.includes("생성형 글쓰기 도구를 포함한 소프트웨어를 사용하지만"), "/about 에 생성형 도구 밝힘 문장");

    // 3-f. /demo 한 줄 기록 예시: 표의 모든 줄이 봇 해석기 결과와 같고, 따로 읽는 체험 칸은 없다.
    const demo = await get("/demo");
    eq(demo.status, 200, "/demo 200");
    ok(Buffer.byteLength(demo.html) <= 72 * 1024, `/demo 72 KiB 이하 (${Buffer.byteLength(demo.html)} B)`);
    for (const gone of ["parser-sandbox", "sandbox-input", "data-sandbox-sample", "실시간", "해석 완료", "WebApplication"]) ok(!demo.html.includes(gone), `/demo 에 ‘${gone}’ 없음`);
    eq(jsonLd(demo.html).hasPart, undefined, "/demo 구조화 데이터에 hasPart 없음");
    const section = (demo.html.match(/<section class="pubSection" id="kakao-examples"[\s\S]*?<\/section>/) || [""])[0];
    ok(section.includes("카카오톡 봇이 기록할 때 쓰는 해석 코드"), "/demo 예시가 봇 해석기 결과임을 밝힌다");
    const rows = [...section.matchAll(/<tr><th scope="row">([^<]+)<\/th>((?:<td>[^<]*<\/td>){5})<\/tr>/g)].map((m) => [decode(m[1]), ...[...m[2].matchAll(/<td>([^<]*)<\/td>/g)].map((c) => decode(c[1]))]);
    ok(rows.length >= 6, `/demo 예시 ${rows.length}줄`);
    for (const [text, type, amount, category, method, memo] of rows) {
      const parsed = parseTransaction(text, {});
      ok(parsed && parsed.ok !== false, `/demo ‘${text}’: 봇이 다시 묻지 않고 기록하는 문장`);
      eq([type, amount, category, method, memo], [parsed.type === "income" ? "수입" : "지출", `${Number(parsed.amount).toLocaleString("ko-KR")}원`, parsed.category || "-", parsed.payment_method || "-", parsed.memo || "-"], `/demo ‘${text}’: 표 = 봇 해석기 결과`);
    }
    const amountOf = (text) => (rows.find((row) => row[0] === text) || [])[2];
    eq([amountOf("저녁 3만5천원"), amountOf("302호 관리비 230000원")], ["35,000원", "230,000원"], "/demo: ‘3만5천원’·‘302호 … 230000원’ 을 바르게 읽는다");

    // 3-g. 첫 화면(/)·가이드 허브(/guides)에서 /demo 예시로 바로 간다.
    for (const path of ["/", "/guides"]) {
      const page = await get(path);
      eq(page.status, 200, `${path} 200`);
      ok(page.html.includes('href="/demo#kakao-examples"') && !page.html.includes("parser-sandbox"), `${path}: /demo 한 줄 기록 예시로 연결`);
    }

    // 3-h. 광고 live 모드에서 unfilled 광고 슬롯 자동 숨김 CSS.
    const liveArticle = await get("/card-income-deduction-basics", { env: { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" } });
    ok(liveArticle.html.includes('.adSlot[hidden],.adSlot:has(ins[data-ad-status="unfilled"]){display:none!important}'), "live 모드 빈 광고 슬롯(unfilled) 자동 숨김 CSS 포함");
  } finally {
    globalThis.fetch = realFetch;
  }
  eq(outbound, 0, "공개 화면 렌더링 중 외부 요청 0회");

  // ── 4. 로그인 웹 앱 및 로그인 화면에서 공개 계산표·가이드 연결 ─────────────────
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
  ok(paymentPage.html.includes('<a href="/card-income-deduction-basics">카드 소득공제와 11~12월 결제수단</a>') && paymentPage.html.includes('href="/card-spending-threshold"'), "/payment-methods 에 카드 소득공제·11~12월 결제수단 글·전월 실적 계산표 연결(V22.9.142)");

  console.log(`V22.9.139 애드센스 재심사 보강 통합 검사 통과 (${checks} checks)`);
} finally {
  fx.restore();
}
