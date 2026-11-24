// V22.9.142 애드센스 1주차 판 검사(2026-11-24 — 사용자 "애드센스 승인이 우선이야" 와 물음 창 결정 3·5·7, 계획 review-artifacts 의 FINAL-PLAN A3·A4·A6·E4).
// 1. A3 글 합치기 40 → 31편: 생활비 글 9편을 다섯 편(연말정산·카드·월세·가계동향·관리비)으로 합쳤다. 옛 주소 9개는 GET·HEAD·끝 빗금 모두
//    합친 글의 그 내용 절(Location 의 절 앵커 — 질의 문자열 뒤)로 308 이고 질의 문자열을 그대로 넘긴다. 사이트맵 51·허브 31편·공개 정본·
//    광고 목록·CTA 표·연말정산 시즌 모듈에서 빠졌고, 공개 화면 어디에도(로그인 뒤 /payment-methods 포함) 옛 주소 링크가 없다(끝 빗금·질의·앵커 꼴 포함).
//    독립 검토(2026-11-24)가 짚은 본문(가족 요건은 항목마다 다름·자료 제공 동의·분납 조건·카드 문턱 순서와 합산 대상·전년동월비·주택 공제의
//    같은 해 조건·ISA 이전 등)은 고친 문장이 있고 옛 문장이 없는지 본다.
// 2. 합친 글: 제목·작성일 그대로·수정일 2026-11-24(A6 — 본문을 실제로 바꾼 글만), 세무 글 셋의 V22.9.142 기준 한 줄, 대표 단추는 세무 글 넷 모두
//    국세청·법령 원문(결정 5), 쪽 안 단추가 가리키는 절이 있다. 합치며 되살린 단서(표 가정·중복 공제·경과규정·요금표)와 V22.9.104 사실 확인의
//    고친 내용(연금 외 수령 기타소득세 15%, 세율 안내 주소 mi=2227, 2026년 지출분 교육비)이 옛 모양으로 돌아가지 않았다.
// 3. E4 방문 측정(결정 7): 공개 안내·글 화면의 CSP 만 Cloudflare Web Analytics 스크립트(static.cloudflareinsights.com)와 방문 신호 주소
//    (cloudflareinsights.com)를 script-src·connect-src 끝에 더한다. 다른 지시어는 기본 정책과 같다. 로그인 화면·가계부·관리자 화면은 그대로다.
//    쿠키 안내에 ‘방문 측정’ 절이 있고(수정일 11-24), 개인정보처리방침·약관의 날짜와 동의 기준일은 그대로다.
// 4. A4(이번 판 몫): /about 에서 심사자에게 하는 문장(글 수·분량 반복 부정)을 뺐고 수정일이 11-24 다. /guides 의 글 목록 안내가 31편을 말한다.
// 바깥 요청은 0회여야 한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { stripBuildBlocks } from "../tools/build-worker.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks += 1; };

const ORIGIN = "https://malhaebook.com";
const UPDATED = "2026-11-24";
const MERGED = {
  "/year-end-tax-timeline-checklist": "/year-end-tax-expense-check",
  "/medical-education-donation-deductions": "/year-end-tax-expense-check",
  "/single-household-year-end-tax": "/year-end-tax-expense-check",
  "/dual-income-deduction-allocation": "/year-end-tax-expense-check",
  "/tax-refund-money-plan": "/year-end-tax-expense-check",
  "/payment-method-switch-nov-dec": "/card-income-deduction-basics",
  "/housing-deductions-overview": "/rent-tax-credit-records",
  "/inflation-budget-update": "/household-spending-statistics",
  "/utility-bills-seasonality": "/apartment-maintenance-fee",
};
const GONE = Object.keys(MERGED);
// 독립 검토(2026-11-24): 옛 주소는 합친 글의 그 내용 절로 간다 — Location 에 앵커를 붙이지 않으면 브라우저가 옛 주소의 앵커를 이어 붙인다.
const ANCHOR = {
  "/year-end-tax-timeline-checklist": ["#section-2", "한 해 동안 달마다 할 일"],
  "/medical-education-donation-deductions": ["#section-4", "항목별 공제 구조와 기록해 둘 것"],
  "/single-household-year-end-tax": ["#section-6", "가구 형태에 따라 다르게 볼 것"],
  "/dual-income-deduction-allocation": ["#section-6", "가구 형태에 따라 다르게 볼 것"],
  "/tax-refund-money-plan": ["#section-7", "결과가 나온 뒤: 환급금과 추가 납부"],
  "/payment-method-switch-nov-dec": ["#section-5", "11~12월, 남은 결제를 어디에 둘까"],
  "/housing-deductions-overview": ["#section-6", "청약·전세대출·주택담보대출 공제와의 차이"],
  "/inflation-budget-update": ["#section-7", "물가가 오를 때 예산에 반영하는 순서"],
  "/utility-bills-seasonality": ["#section-4", "12개월 고지서로 연평균 월 예산 만들기"],
};
// 옛 주소를 가리키는 링크 꼴(그대로·끝 빗금·질의·앵커, 절대 주소 포함).
const linksTo = (html, from) => new RegExp(`href="(?:https://malhaebook\\.com)?${from.replace(/[-/]/g, (c) => `\\${c}`)}(?:[/?#][^"]*)?"`).test(html);
// 합친(또는 덜어 낸) 글 여섯 편: 제목·작성일.
const ARTICLES = {
  "/year-end-tax-expense-check": ["가계부로 하는 연말정산 준비: 달마다 할 일과 영수증 대조", "2026-10-21"],
  "/card-income-deduction-basics": ["신용카드 소득공제 25% 문턱과 11~12월 결제수단", "2026-10-21"],
  "/rent-tax-credit-records": ["월세 세액공제와 주거 공제, 가계부 기록과 서류 맞추기", "2026-10-21"],
  "/pension-savings-irp-tax-credit": ["연금저축·IRP 세액공제, 한도·공제율과 가계부에 적는 법", "2026-11-03"],
  "/household-spending-statistics": ["가계동향조사 평균·물가 상승률과 우리 집 가계부 비교법", "2026-10-21"],
  "/apartment-maintenance-fee": ["아파트 관리비 고지서 읽기와 공과금 연평균 월 예산 만들기", "2026-10-21"],
};
const TAX = ["/year-end-tax-expense-check", "/card-income-deduction-basics", "/rent-tax-credit-records", "/pension-savings-irp-tax-credit"];
const BASIS_V229142 = "이 글의 공제 숫자는 2026년 지출(2026년 귀속, 2027년 1~2월 정산)에 적용되는 소득세법·조세특례제한법 법문에서 옮겼습니다. 요건과 한도는 해마다 바뀔 수 있으니 신고 전에 국세청 연말정산 안내로 다시 확인하세요.";
const BASIS_V229104 = "이 글은 2026년 지출(2026년 귀속, 2027년 1~2월 정산) 기준이며 숫자는 2026년 11월 3일 시행 중인 소득세법·조세특례제한법으로 확인했습니다.";
// 쪽 안 단추(대표 단추 둘째)와 그 절의 제목.
const IN_PAGE = {
  "/year-end-tax-expense-check": ["달마다 할 일 표 보기", "#section-2", "한 해 동안 달마다 할 일"],
  "/card-income-deduction-basics": ["11~12월 결제수단 사례 보기", "#section-5", "11~12월, 남은 결제를 어디에 둘까"],
  "/rent-tax-credit-records": ["청약·대출 공제와 비교하기", "#section-6", "청약·전세대출·주택담보대출 공제와의 차이"],
  "/apartment-maintenance-fee": ["공과금 연평균 월 예산 만들기", "#section-4", "12개월 고지서로 연평균 월 예산 만들기"],
};
// 합치며 되살린 단서와 V22.9.104 사실 확인 내용(있어야 할 문장)과 옛 모양(없어야 할 문장). 화면 HTML 기준(& 는 &amp;).
const MUST = [
  ["/card-income-deduction-basics", "표의 숫자는 2026년 9월 18일 시행 조세특례제한법 제126조의2로 계산한 가정 사례입니다."],
  ["/card-income-deduction-basics", "문턱 아래에서 수단이 무의미하다는 말은 공제액에 한정됩니다."],
  ["/card-income-deduction-basics", "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2227&amp;cntntsId=7667"],
  ["/card-income-deduction-basics", "2026년 사용분부터 해당 자녀 등이 1명이면 기본 한도는 총급여 7,000만원 이하 350만원·초과 275만원, 2명 이상이면 각각 400만원·300만원입니다."],
  ["/rent-tax-credit-records", "월세 현금영수증은 신용카드 등 사용금액 소득공제에 들어가는 금액입니다."],
  ["/rent-tax-credit-records", "과거 차입금의 경과규정은 차입일과 상환 조건에 따라 다르므로 해당 연도의 국세청 안내와 대출 증명서로 확인합니다."],
  ["/year-end-tax-expense-check", "매년 국세청 안내의 간소화 제공 항목 목록을 한 번 읽어 둡니다."],
  ["/year-end-tax-expense-check", "세액공제. 본인과 가족의 교육비(직계존속의 일반 교육비와 가족의 대학원 교육비는 제외). 2026년 지출분부터 가족의 나이·소득은 따지지 않음"],
  ["/year-end-tax-expense-check", "아니요. 실손의료보험금으로 돌려받은 금액은 의료비 세액공제 대상에서 빠집니다(소득세법 시행령 제118조의5)."],
  ["/pension-savings-irp-tax-credit", "일반적인 연금 외 수령에서는 세액공제를 받은 납입액과 운용수익에 기타소득세 15%(지방소득세 별도)가 적용됩니다."],
  ["/apartment-maintenance-fee", "주택용 누진 구간이나 지역별 수도 요금처럼 요금 체계는 해마다 조정되므로"],
  // 독립 검토(2026-11-24)가 짚어 고친 문장. 옛 의료비·교육비·시기별 일정·환급금 글의 사실(가족 요건은 항목마다 다르다, 1월의 자료 제공 동의,
  // 분납은 10만원 초과)과 카드·가계동향·관리비·월세·연금 글의 빠진 조건을 되살렸다.
  ["/year-end-tax-expense-check", "부양가족은 나이 요건(직계존속 60세 이상, 직계비속·입양자 20세 이하, 형제자매 20세 이하 또는 60세 이상, 장애인은 나이 제한 없음)도 채워야 합니다."],
  ["/year-end-tax-expense-check", "부모님 의료비는 나이와 소득을 따지지 않고 생계를 같이 하는 기본공제대상자 몫이면 넣을 수 있습니다."],
  ["/year-end-tax-expense-check", "다만 부모님 같은 직계존속의 일반 교육비와 가족의 대학원 교육비는 들어가지 않습니다."],
  ["/year-end-tax-expense-check", "보장성 보험료는 나이와 소득 요건을 모두 채운 가족을 피보험자로 한 보험만 들어가고, 기부금은 나이는 보지 않지만 소득 요건은 봅니다."],
  ["/year-end-tax-expense-check", "추가 납부액이 10만원을 넘어 나누어 빠지면 그 석 달 예산에 미리 넣습니다."],
  ["/year-end-tax-expense-check", "가족의 자료 제공 동의, 분류별 합계와 간소화 금액 비교"],
  ["/year-end-tax-expense-check", "가족의 자료 제공 동의가 빠졌는지 먼저 보고"],
  ["/card-income-deduction-basics", "공제액이 이미 한도 가까이 있다면 결제수단을 바꿔도 늘어날 여지가 작습니다."],
  ["/card-income-deduction-basics", "문턱은 신용카드 사용액부터 채우는 것으로 계산하므로, 신용카드만으로 문턱을 넘은 뒤에 쓰는 돈부터 30%·40% 수단의 비중을 늘려야 공제가 가장 많이 늘어납니다."],
  ["/card-income-deduction-basics", "배우자의 연간 소득금액이 100만원(근로소득만 있으면 총급여 500만원)을 넘으면 서로의 사용액을 합칠 수 없고"],
  ["/card-income-deduction-basics", "다른 사람의 기본공제를 받는 가족의 사용액은 합칠 수 없고, 형제자매가 쓴 금액도 대상이 아닙니다."],
  ["/household-spending-statistics", "다만 전년동월비는 지난해 같은 달과의 가격 차이이므로 현재 예산에 일괄적으로 다시 곱하지 않습니다."],
  ["/apartment-maintenance-fee", "이 절의 금액은 구조를 보여 주는 예시이고"],
  ["/apartment-maintenance-fee", "달마다 달라지는 공과금을 예산에서는 매달 같은 금액으로 다루는 것입니다."],
  ["/rent-tax-credit-records", "다만 청약 공제는 그해 동안 무주택이어야 하므로 집을 산 해에는 받을 수 없고"],
  ["/rent-tax-credit-records", "아래 순서대로 나눠 적고 끝의 네 가지를 기록 규칙으로 정해 두면"],
  ["/pension-savings-irp-tax-credit", "만기일부터 60일 이내에 연금계좌로 옮기면 옮긴 금액의 10%와 300만원 가운데 적은 금액만큼 공제 대상 납입액에 더해집니다."],
];
const MUST_NOT = [
  ["/card-income-deduction-basics", "mi=2229"],
  ["/year-end-tax-expense-check", "본인과 기본공제 대상 부양가족의 교육비"],
  ["/year-end-tax-expense-check", "기본공제대상자인 가족을 위해"],
  ["/pension-savings-irp-tax-credit", "공제받은 혜택만큼 세금을 다시 낼 수 있습니다"],
  ["/pension-savings-irp-tax-credit", "세금이 붙을 수 있습니다"],
  // 독립 검토 전의 옛 모양.
  ["/year-end-tax-expense-check", "본인뿐 아니라 기본공제 대상 부양가족의 지출도 합칠 수 있어"],
  ["/year-end-tax-expense-check", "부모님 병원비가 공제 가능한지"],
  ["/year-end-tax-expense-check", "추가 납부는 나누어 빠질 석 달 예산에 미리 넣습니다"],
  ["/year-end-tax-expense-check", "표준세액공제와 월세 세액공제를 함께 받을 수 있나요?"],
  ["/card-income-deduction-basics", "맞벌이 배우자는 연간 소득금액 100만원 이하라는 요건을 넘으므로"],
  ["/card-income-deduction-basics", "문턱을 넘는 달부터는 30%·40% 수단의 비중을 늘립니다."],
  ["/household-spending-statistics", "가계부 예산에 쓰는 것은 전년동월비입니다."],
  ["/apartment-maintenance-fee", "변동비에서 고정비로"],
  ["/apartment-maintenance-fee", "이 글의 숫자는 구조를 보여 주는 예시이고"],
  ["/rent-tax-credit-records", "셋을 함께 받는 해에는"],
];
const ANALYTICS_SCRIPT = "https://static.cloudflareinsights.com";
const ANALYTICS_CONNECT = "https://cloudflareinsights.com";
const ABOUT_REMOVED = "글 수나 분량을 늘리기 위해 같은 설명을 여러 페이지에 반복하지 않습니다";

// 바깥 요청을 세는 함수를 먼저 두고 픽스처를 만든다(픽스처는 가짜 DB 가 아닌 요청을 만들 때의 fetch 로 넘긴다).
const realFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async (input) => { outbound += 1; throw new Error(`V22.9.142 검사는 바깥 요청을 하지 않는다: ${String(input?.url || input)}`); };
const fx = await createV2265QaFixture();
const ownerCookie = await fx.cookieFor("user-bin");

async function get(target, { cookie = "", method = "GET", env = {} } = {}) {
  const res = await app.fetch(new Request(`${ORIGIN}${target}`, {
    method,
    headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", accept: "text/html", ...(cookie ? { cookie } : {}) },
  }), { ...fx.env, ...env }, { waitUntil() {} });
  return { status: res.status, headers: res.headers, location: res.headers.get("location") || "", html: await res.text() };
}
const decode = (s) => s.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&#39;/g, "'");
const heroOf = (html) => (html.match(/<header class="pubHero">[\s\S]*?<\/header>/) || [""])[0];
const heroButtons = (html) => [...heroOf(html).matchAll(/<a class="pubBtn[^"]*" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => [decode(m[2]), m[1]]);
const directives = (csp) => new Map(String(csp || "").split(";").map((part) => part.trim()).filter(Boolean).map((part) => { const [name, ...sources] = part.split(/\s+/); return [name, sources]; }));
const siteConfig = stripBuildBlocks(readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8"));
const listOf = (pattern) => [...((siteConfig.match(pattern) || ["", ""])[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);

try {
  // ── 1. 옛 주소 308 ──
  for (const [from, to] of Object.entries(MERGED)) {
    for (const method of ["GET", "HEAD"]) {
      const moved = await get(`${from}?utm_source=article`, { method });
      eq(moved.status, 308, `${from} ${method}: 합친 글로 영구 이동`);
      eq(moved.location, `${ORIGIN}${to}?utm_source=article${ANCHOR[from][0]}`, `${from} ${method}: 대상 ${to}${ANCHOR[from][0]}(질의 문자열 유지, 앵커는 질의 뒤)`);
    }
    const slash = await get(`${from}/`);
    eq([slash.status, slash.location], [308, `${ORIGIN}${to}${ANCHOR[from][0]}`], `${from}/: 끝 빗금도 합친 글의 그 절로`);
  }
  const sitemap = (await get("/sitemap.xml")).html;
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  eq(entries.length, 51, "사이트맵은 공개 정본 51개다(60 − 합친 글 9)");
  for (const from of GONE) ok(!entries.some((e) => e.path === from), `${from}: 사이트맵에 없다`);
  const publicPaths = listOf(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const adKeys = listOf(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  eq(publicPaths.length, 51, "공개 정본 목록은 51개다");
  eq(adKeys.filter((key) => publicPaths.includes(key)).length, 44, "광고 허용 공개 화면은 44쪽이다");
  for (const from of GONE) ok(!publicPaths.includes(from) && !adKeys.includes(from), `${from}: 정본·광고 목록에 없다`);
  const contentSource = readFileSync(new URL("../src/modules/public/content-pages.js", import.meta.url), "utf8");
  for (const [from, to] of Object.entries(MERGED)) ok(contentSource.includes(`["${from}", "${to}", "${ANCHOR[from][0]}"]`), `${from}: 별칭 표에 합친 글과 절 앵커로 있다`);
  eq(Object.keys(ANCHOR).sort(), GONE.slice().sort(), "옛 주소마다 절 앵커가 있다");
  const worksheetSource = readFileSync(new URL("../src/modules/public/worksheet-pages.js", import.meta.url), "utf8");
  for (const from of GONE) ok(!worksheetSource.includes(`"${from.slice(1)}": [[`), `${from}: 대표 단추 표에 옛 글 줄이 없다`);
  const seasonSource = stripBuildBlocks(readFileSync(new URL("../src/modules/public/living-cost-articles-v22997.js", import.meta.url), "utf8"));
  const livingSource = stripBuildBlocks(readFileSync(new URL("../src/modules/public/living-cost-articles-v22974.js", import.meta.url), "utf8"));
  for (const from of GONE) ok(!seasonSource.includes(`"${from.slice(1)}": {`) && !livingSource.includes(`"${from.slice(1)}": {`), `${from}: 글 모듈에서 빠졌다`);

  // 공개 화면 전부 + 로그인 뒤 결제수단 화면에 옛 주소 링크가 없다.
  const pages = new Map();
  for (const { path } of entries) {
    const page = await get(path);
    eq(page.status, 200, `${path}: 200`);
    pages.set(path, page);
    for (const from of GONE) ok(!linksTo(page.html, from), `${path}: ${from} 링크 없음(끝 빗금·질의·앵커 꼴 포함)`);
  }
  const payment = await get("/payment-methods?month=2026-07&household_id=house-home", { cookie: ownerCookie });
  eq(payment.status, 200, "로그인 /payment-methods 200");
  ok(payment.html.includes('<a href="/card-income-deduction-basics">카드 소득공제와 11~12월 결제수단</a>'), "/payment-methods 의 정리 글 링크는 합친 카드 글이다");
  for (const from of GONE) ok(!linksTo(payment.html, from), `/payment-methods: ${from} 링크 없음(끝 빗금·질의·앵커 꼴 포함)`);
  // 절 앵커가 가리키는 절이 합친 글에 그 이름으로 있다.
  for (const [from, [anchor, heading]] of Object.entries(ANCHOR)) ok(pages.get(MERGED[from]).html.includes(`<section class="pubSection" id="${anchor.slice(1)}"><h2>${heading}</h2>`), `${from}: ${MERGED[from]}${anchor} 는 ‘${heading}’ 절이다`);
  ok(linksTo('<a href="/tax-refund-money-plan#x">', "/tax-refund-money-plan") && linksTo('<a href="https://malhaebook.com/tax-refund-money-plan/">', "/tax-refund-money-plan") && !linksTo('<a href="/tax-refund-money-planner">', "/tax-refund-money-plan"), "링크 꼴 찾기가 앵커·끝 빗금·절대 주소를 잡고 다른 주소는 잡지 않는다");
  const hub = pages.get("/articles").html;
  const cards = [...hub.matchAll(/<li><a href="(\/[^"]+)">[^<]*<\/a><p>[^<]*<\/p><small>/g)].map((m) => m[1]);
  eq(cards.length, 31, "글 목록 허브 카드는 31편이다");
  ok(decode(hub).includes("글 31편을 주제 9개로"), "허브 설명이 31편을 말한다");
  ok(decode(pages.get("/guides").html).includes("주제 9개, 31편의 요약과 작성일"), "/guides 의 글 목록 안내가 31편을 말한다");

  // ── 2. 합친 글 ──
  for (const [path, [title, published]] of Object.entries(ARTICLES)) {
    const html = pages.get(path)?.html || "";
    eq(decode((html.match(/<h1>([^<]+)<\/h1>/) || ["", ""])[1]), title, `${path}: 제목`);
    const meta = (html.match(/<p class="pubMeta">([\s\S]*?)<\/p>/) || ["", ""])[1];
    ok(meta.includes(`수정 <time datetime="${UPDATED}">${UPDATED}</time>`) && meta.includes(`작성 <time class="pubPublished" datetime="${published}">${published}</time>`), `${path}: 작성일 ${published} 그대로·수정일 ${UPDATED}`);
    const ld = JSON.parse((html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/) || ["", "{}"])[1]);
    eq([ld.datePublished, ld.dateModified, ld.headline], [published, UPDATED, title], `${path}: JSON-LD 날짜·제목`);
    eq(entries.find((e) => e.path === path)?.lastmod, UPDATED, `${path}: 사이트맵 lastmod`);
    ok(!html.includes("무료"), `${path}: ‘무료’ 없음`);
    for (const m of html.matchAll(/href="#(section-\d+|sources|questions)"/g)) ok(html.includes(`id="${m[1]}"`), `${path}: #${m[1]} 가 있다`);
    const basisCount = html.split('class="pubMeta pubBasis"').length - 1;
    if (path === "/pension-savings-irp-tax-credit") eq(basisCount === 1 && heroOf(html).includes(`<p class="pubMeta pubBasis">${BASIS_V229104}</p>`), true, `${path}: V22.9.104 기준 한 줄 그대로`);
    else if (TAX.includes(path)) eq(basisCount === 1 && heroOf(html).includes(`<p class="pubMeta pubBasis">${BASIS_V229142}</p>`), true, `${path}: V22.9.142 기준 한 줄이 머리에 한 번`);
    else eq(basisCount, 0, `${path}: 세무 글이 아니라 기준 한 줄이 없다`);
    if (TAX.includes(path)) eq(heroButtons(html)[0], ["국세청·법령 원문으로 확인하기", "#sources"], `${path}: 대표 단추는 국세청·법령 원문(결정 5)`);
    if (IN_PAGE[path]) {
      const [label, href, heading] = IN_PAGE[path];
      ok(heroButtons(html).some(([l, h]) => l === label && h === href), `${path}: 쪽 안 단추 ${label}`);
      ok(html.includes(`<section class="pubSection" id="${href.slice(1)}"><h2>${heading}</h2>`), `${path}: ${href} 절 제목이 ${heading}`);
    }
  }
  for (const [path, sentence] of MUST) ok(pages.get(path).html.includes(sentence), `${path}: 있어야 할 문장 — ${sentence.slice(0, 40)}…`);
  for (const [path, sentence] of MUST_NOT) ok(!pages.get(path).html.includes(sentence), `${path}: 옛 모양 없음 — ${sentence}`);
  for (const [path, page] of pages) ok(!page.html.includes("mi=2229"), `${path}: 세율 안내 옛 주소(mi=2229) 없음`);

  // ── 3. E4 방문 측정 CSP ──
  const baseCsp = directives((await get("/my")).headers.get("content-security-policy"));
  ok(baseCsp.size > 5 && !baseCsp.get("script-src").includes(ANALYTICS_SCRIPT) && !baseCsp.get("connect-src").includes(ANALYTICS_CONNECT), "로그인 시작 화면(/my)의 CSP 는 측정 스크립트를 막는다");
  for (const path of ["/", "/articles", "/year-end-tax-expense-check", "/cookies", "/privacy", "/demo", "/support", "/about"]) {
    const page = path === "/" ? await get("/") : pages.get(path) || await get(path);
    const csp = directives(page.headers.get("content-security-policy"));
    eq(csp.get("script-src"), [...baseCsp.get("script-src"), ANALYTICS_SCRIPT], `${path}: script-src 끝에 측정 스크립트만 더한다`);
    eq(csp.get("connect-src"), [...baseCsp.get("connect-src"), ANALYTICS_CONNECT], `${path}: connect-src 끝에 방문 신호 주소만 더한다`);
    for (const [name, sources] of baseCsp) if (!["script-src", "connect-src"].includes(name)) eq(csp.get(name), sources, `${path}: ${name} 는 기본 정책과 같다`);
    eq(csp.size, baseCsp.size, `${path}: 지시어 수가 같다`);
  }
  for (const [path, cookie] of [["/app", ownerCookie], ["/my/settings", ownerCookie], ["/payment-methods?month=2026-07&household_id=house-home", ownerCookie], ["/my", ""]]) {
    const csp = String((await get(path, { cookie })).headers.get("content-security-policy") || "");
    ok(!csp.includes("cloudflareinsights"), `${path}: 로그인·가계부 화면은 측정 스크립트를 허용하지 않는다`);
  }
  const live = await get("/card-income-deduction-basics", { env: { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" } });
  const liveCsp = directives(live.headers.get("content-security-policy"));
  ok(liveCsp.get("script-src").includes("https:") && liveCsp.get("script-src").at(-1) === ANALYTICS_SCRIPT && liveCsp.get("connect-src").at(-1) === ANALYTICS_CONNECT, "광고 live 화면은 광고 확장 뒤에 측정 출처가 붙는다");
  const cookies = pages.get("/cookies").html;
  ok(cookies.includes("<h2>방문 측정</h2>") && decode(cookies).includes("Cloudflare Web Analytics로 화면별 방문 수와 화면을 불러오는 데 걸린 시간을 셉니다.") && decode(cookies).includes("쿠키나 브라우저 저장소를 쓰지 않고"), "쿠키 안내에 방문 측정 절이 있다");
  ok(cookies.includes(`수정 <time datetime="${UPDATED}">`), "쿠키 안내 수정일은 11-24 다");
  for (const path of ["/privacy", "/terms"]) ok(!pages.get(path).html.includes(`수정 <time datetime="${UPDATED}">`), `${path}: 방침·약관 날짜는 이 판에서 바꾸지 않는다`);
  ok(/const POLICY_REVISION_DATE = "2026-11-13";/.test(siteConfig), "동의 기준일 POLICY_REVISION_DATE 는 그대로다");
  ok(siteConfig.includes('const PUBLIC_ANALYTICS_CSP_ADDITIONS_V229142 = Object.freeze([\n  ["script-src", "https://static.cloudflareinsights.com"],\n  ["connect-src", "https://cloudflareinsights.com"],\n]);'), "원본: 더하는 출처는 두 개뿐이다");
  eq((contentSource.match(/publicAnalyticsHeadersV229142\(/g) || []).length, 1, "원본: 측정 허용은 공개 안내·글 처리기 한 곳에서만 쓴다");

  // ── 4. A4 /about ──
  const about = pages.get("/about").html;
  ok(!decode(about).includes(ABOUT_REMOVED), "/about 에 심사자에게 하는 문장이 없다");
  ok(decode(about).includes("각 페이지는 하나의 작업을 다루고, 다른 작업은 관련 가이드로 연결합니다."), "/about 의 나머지 작성 원칙은 그대로다");
  ok(about.includes(`수정 <time datetime="${UPDATED}">`) && entries.find((e) => e.path === "/about")?.lastmod === UPDATED, "/about 수정일·사이트맵이 11-24 다");
} finally {
  fx.restore?.();
  globalThis.fetch = realFetch;
}
eq(outbound, 0, "바깥 요청 0회");
console.log(`V22.9.142 애드센스 1주차(글 합치기·방문 측정·/about) 검사 통과 (${checks} checks)`);
