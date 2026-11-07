// V22.9.97 생활비 글 검사: 연말정산·절세 시즌 글 8편(public/living-cost-articles-v22997.js)·글 목록 허브 40편·사이트맵 60·광고 화면 목록.
// V22.9.74 글과 같은 규칙(작성일·요약·출처·함께 읽을 글·표현·광고·40자 창 중복 0)에 더해 지침의 분량(절 본문 한글 1,800~2,600자)·
// 절 5~6개·출처 2~4개(이번 판에 열어 본문을 확인한 공식 주소만)·글마다 다른 구조를 본다. 기본 env 로 그리고 바깥 요청은 0회여야 한다.
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { stripBuildBlocks } from "../tools/build-worker.mjs";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks++; if (!value) failures.push(message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (기대 ${expected}, 실제 ${actual})`);

const origin = "https://malhaebook.com";
const get = (path, method = "GET", env = {}) => app.fetch(new Request(`${origin}${path}`, { method }), env, {});
const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");
const REVISION = "2026-11-03";
// V22.9.104 A-4: H-10 사실 확인 고침으로 8편의 수정일만 2026-11-06 이 됐다(작성일 REVISION 은 그대로).
// 원본 상수 living-cost-articles-v22997.js PUBLIC_TAX_ARTICLES_UPDATED_V229104 와 같은 값이다.
const UPDATED = "2026-11-07";
const updatedFor = (path) => path === '/payment-method-switch-nov-dec' ? '2026-11-06' : UPDATED;
const HUB = "/articles";
// 새 글 8편과 분류. 새 분류는 만들지 않는다.
const NEW = {
  "/year-end-tax-timeline-checklist": "카드·세금",
  "/payment-method-switch-nov-dec": "카드·세금",
  "/medical-education-donation-deductions": "카드·세금",
  "/dual-income-deduction-allocation": "카드·세금",
  "/pension-savings-irp-tax-credit": "카드·세금",
  "/single-household-year-end-tax": "카드·세금",
  "/tax-refund-money-plan": "저축·비상금·부채",
  "/housing-deductions-overview": "카드·세금",
};
const NEW_PATHS = Object.keys(NEW);
const V22974 = [
  "/household-spending-statistics", "/single-household-living-cost", "/food-cost-benchmark", "/utility-bills-seasonality",
  "/inflation-budget-update", "/card-income-deduction-basics", "/year-end-tax-expense-check", "/rent-tax-credit-records",
  "/apartment-maintenance-fee", "/mobile-plan-cost-review", "/sinking-fund-annual-expenses", "/debt-repayment-order",
  "/savings-rate-tracking", "/first-job-budget", "/car-ownership-cost", "/childcare-cost-planning",
  "/couple-account-structure", "/roommate-shared-ledger", "/monthly-closing-routine", "/expense-review-questions",
];
const V22940 = ["/budget-ratio-guide", "/fixed-cost-checklist", "/subscription-cleanup", "/card-spending-threshold", "/shared-living-cost-rules", "/accountbook-habit", "/payday-budget-cycle", "/expense-category-rules", "/emergency-fund-basics", "/weekly-report-reading", "/family-roles-accountbook", "/cash-flow-table"];
const OLD = [...V22940, ...V22974];
const FORBIDDEN = ["낭비", "헛돈", "추천 카드", "대출 추천", "투자 추천", "후기", "사용자 수", "무조건", "최고의", "반드시", "대박", "꿀팁", "완벽"];
const SOURCE_HOST = /(^|\.)(go\.kr|gov\.kr)$|^(www\.)?(kosis\.kr|fss\.or\.kr|finlife\.fss\.or\.kr|bok\.or\.kr|ecos\.bok\.or\.kr|smartchoice\.or\.kr|nhis\.or\.kr|nps\.or\.kr|kftc\.or\.kr|policies\.google\.com|support\.google\.com)$/;
const AD_RUNTIME = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead/i;
// 2026-11-03 에 열어 본문(조문·안내)을 확인한 공식 출처. 글의 참고 자료는 이 안에서만 고른다. 새 출처는 먼저 열어 보고 더한다.
const VERIFIED_SOURCES = new Set([
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?cntntsId=7885&mi=6605",
  "https://www.law.go.kr/법령/소득세법시행령/제118조의3",
  "https://www.nts.go.kr/nts/na/ntt/selectNttInfo.do?mi=2201&bbsId=1028&nttSn=1347979",
  // V22.9.104 A-4(P3-8): 세율 안내는 메뉴 번호 mi=2227 로 열어야 머리말이 ‘세율’ 이다(H-10 보고 2026-11-04 확인).
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2227&cntntsId=7667",
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40978&cntntsId=239040",
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=40609&cntntsId=239021",
  "https://www.nts.go.kr/nts/cm/cntnts/cntntsView.do?mi=2305&cntntsId=7706",
  "https://call.nts.go.kr/call/qna/selectQnaInfo.do?mi=1318&ctgId=CTG11909",
  ...["소득세법/제137조", "소득세법/제70조", "소득세법/제50조", "소득세법/제52조", "소득세법/제59조의3", "소득세법/제59조의4", "소득세법/제61조",
    "소득세법시행령/제40조의2", "소득세법시행령/제118조의5", "소득세법시행령/제118조의6", "국세기본법/제45조의2",
    "조세특례제한법/제87조", "조세특례제한법/제95조의2", "조세특례제한법/제126조의2", "조세특례제한법시행령/제121조의2"].map((p) => `https://www.law.go.kr/법령/${p}`),
]);

const articleOf = (html) => (html.match(/<article>([\s\S]*?)<\/article>/) || [])[1] || "";
const sectionsOf = (html) => [...html.matchAll(/<section class="pubSection" id="section-\d+">([\s\S]*?)<\/section>/g)].map((m) => m[1]);
const textOf = (fragment) => decode(fragment.replace(/<\/(p|li|td|th|caption|h2|aside|a|small|summary)>/g, "\n").replace(/<[^>]+>/g, " "));
const bodyOf = (html) => articleOf(html).replace(/<header class="pubHero">[\s\S]*?<\/header>/, "").replace(/<nav class="pubToc"[\s\S]*?<\/nav>/, "");
const hangul = (text) => (text.match(/[가-힣]/g) || []).length;
const linesOf = (html) => sectionsOf(html).map(textOf).join("\n").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const structuredOf = (html) => { try { return JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]); } catch { return {}; } };
const h1Of = (html) => decode((html.match(/<h1>([^<]+)<\/h1>/) || [])[1] || "");

const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("V22.9.97 articles must not contact a data service"); };

try {
  // 1. 사이트맵 60: 기존 52 + 새 글 8. 새 글과 허브의 lastmod 는 새 글 작성일이다.
  const xml = await (await get("/sitemap.xml")).text();
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  eq(entries.length, 60, "사이트맵은 공개 정본 60개다(52 + 새 글 8)");
  for (const path of NEW_PATHS) eq(entries.find((e) => e.path === path)?.lastmod, updatedFor(path), `${path}: 사이트맵에 있고 lastmod 가 수정일이다`);
  eq(entries.find((e) => e.path === HUB)?.lastmod, UPDATED, "허브 lastmod 가 새 글 수정일로 올라간다");

  // 2. 공개 정본을 모두 그린다(함께 읽을 글·본문 링크가 실제 정본인지, 40자 창 비교에 쓴다).
  const pages = new Map();
  for (const entry of entries) {
    const response = await get(entry.path);
    eq(response.status, 200, `${entry.path}: 공개 페이지가 그려진다`);
    pages.set(entry.path, await response.text());
  }

  // 3. 새 글마다: 응답·정본·구조·분량·작성일·요약·출처·함께 읽을 글·표현·광고.
  const oldTitles = new Set(OLD.map((p) => h1Of(pages.get(p) || "")));
  const seenTitles = new Set();
  const signatures = new Map();
  const sectionCounts = new Set();
  const windows = new Map();
  const addWindows = (path, html) => {
    for (const line of linesOf(html)) for (let i = 0; i + 40 <= line.length; i++) {
      const piece = line.slice(i, i + 40);
      if (!windows.has(piece)) windows.set(piece, new Set());
      windows.get(piece).add(path);
    }
  };
  for (const path of NEW_PATHS) {
    const html = pages.get(path) || "";
    const response = await get(path);
    eq(response.headers.get("x-robots-tag"), "index, follow", `${path}: 색인 허용`);
    eq(response.headers.get("set-cookie"), null, `${path}: 쿠키 없음`);
    ok(String(response.headers.get("cache-control")).includes("public"), `${path}: 공개 캐시`);
    ok(html.includes(`<link rel="canonical" href="${origin}${path}"/>`), `${path}: 정본 주소`);
    const head = await get(path, "HEAD");
    eq(head.status, 200, `${path}: HEAD 200`);
    eq(await head.text(), "", `${path}: HEAD 본문 없음`);
    const slash = await get(`${path}/`);
    eq(slash.status, 308, `${path}/: 끝 빗금은 정본으로 모은다`);
    eq(slash.headers.get("location"), `${origin}${path}`, `${path}/: 정본 대상`);

    const h1 = h1Of(html);
    eq((html.match(/<h1[ >]/g) || []).length, 1, `${path}: H1 하나`);
    ok(h1 && !oldTitles.has(h1) && !seenTitles.has(h1), `${path}: 제목이 40편 안에서 겹치지 않는다 (${h1})`);
    seenTitles.add(h1);
    ok(`${h1} · 말해가계부`.length <= 40, `${path}: 제목 태그 40자 이하`);
    const description = decode((html.match(/name="description" content="([^"]+)"/) || [])[1] || "");
    ok(description.length >= 70 && description.length <= 110, `${path}: 설명 70~110자 (${description.length})`);
    const sections = sectionsOf(html);
    ok(sections.length >= 5 && sections.length <= 6, `${path}: 주제 절 5~6개 (${sections.length})`);
    sectionCounts.add(sections.length);
    const h2 = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => decode(m[1]));
    ok(h2.includes("자주 묻는 질문"), `${path}: 자주 묻는 질문 절`);
    ok(!h2.includes("말해가계부에서는") && !h2.includes("다음에 읽을 글"), `${path}: 틀로 찍은 마무리 절 없음`);
    const sectionHangul = hangul(sections.map(textOf).join("\n"));
    ok(sectionHangul >= 1800 && sectionHangul <= 2600, `${path}: 절 본문 한글 ${sectionHangul}자 (1,800~2,600)`);
    const bodyHangul = hangul(textOf(bodyOf(html)));
    ok(bodyHangul >= 2400 && bodyHangul <= 5200, `${path}: 글 전체 한글 ${bodyHangul}자 (V22.9.74 기준 2,400~5,200)`);
    ok(/<aside class="pubSummary" aria-label="핵심 요약"><b>핵심 요약<\/b><ul>(<li>[^<]+<\/li>){3}<\/ul><\/aside>/.test(html), `${path}: 핵심 요약 세 줄`);
    const meta = (html.match(/<p class="pubMeta">([\s\S]*?)<\/p>/) || [])[1] || "";
    ok(meta.includes(`수정 <time datetime="${updatedFor(path)}">${updatedFor(path)}</time>`) && meta.includes(`작성 <time class="pubPublished" datetime="${REVISION}">${REVISION}</time>`), `${path}: 작성일 ${REVISION}·수정일 ${UPDATED}`);
    ok(meta.includes('작성·관리: <a href="/about">도담 네트워크 운영팀</a>'), `${path}: 작성자 줄이 소개 페이지로 이어진다`);
    ok(/읽는 시간 약 \d+분/.test(meta), `${path}: 읽는 시간`);
    ok(html.includes('<a href="/articles">생활비 가이드 글</a> / '), `${path}: 이동 경로가 허브를 지난다`);

    const structured = structuredOf(html);
    eq(structured["@type"], "Article", `${path}: JSON-LD Article`);
    eq(structured.headline, h1, `${path}: JSON-LD 제목`);
    eq(structured.datePublished, REVISION, `${path}: JSON-LD 작성일`);
    eq(structured.dateModified, updatedFor(path), `${path}: JSON-LD 수정일`);
    eq(structured.articleSection, NEW[path], `${path}: JSON-LD 분류`);
    eq(structured.author?.url, `${origin}/about`, `${path}: 책임 작성자 페이지`);
    eq(structured.isAccessibleForFree, true, `${path}: 무료 글`);
    eq(structured.mainEntityOfPage, `${origin}${path}`, `${path}: JSON-LD 정본`);
    ok(html.includes(`<span class="pubEyebrow">생활비 가이드 · ${NEW[path]}</span>`), `${path}: 머리 분류 표시`);

    const related = (html.match(/<aside class="pubRelated"><b>함께 읽을 글<\/b>([\s\S]*?)<\/aside>/) || [])[1] || "";
    const relatedLinks = [...related.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], decode(m[2])]);
    ok(relatedLinks.length >= 2 && relatedLinks.length <= 3, `${path}: 함께 읽을 글 2~3개 (${relatedLinks.length})`);
    for (const [href, label] of relatedLinks) ok(pages.has(href) && href !== path && label.length >= 8, `${path}: 함께 읽을 글 ${href} 는 다른 공개 글이고 설명이 있다`);
    const faq = (html.match(/<section class="pubSection" id="questions">([\s\S]*?)<\/section>/) || [])[1] || "";
    const questions = (faq.match(/<details>/g) || []).length;
    ok(questions >= 2 && questions <= 4, `${path}: 자주 묻는 질문 2~4개 (${questions})`);
    ok(faq.includes('href="/articles"'), `${path}: 질문 절이 허브로 돌아간다`);
    const sources = (html.match(/<section class="pubSection pubSources" id="sources">([\s\S]*?)<\/section>/) || [])[1] || "";
    const sourceLinks = [...sources.matchAll(/<a href="([^"]+)"/g)].map((m) => m[1]);
    ok(sourceLinks.length >= 2 && sourceLinks.length <= (["/dual-income-deduction-allocation", "/pension-savings-irp-tax-credit"].includes(path) ? 5 : 4), `${path}: 참고 자료 2~4개(추가 예외 근거가 필요한 두 글은 5개) (${sourceLinks.length})`);
    for (const href of sourceLinks) {
      const url = decode(href);
      ok(url.startsWith("https://") && SOURCE_HOST.test(new URL(url).hostname), `${path}: 출처 ${url} 는 공식 https 호스트`);
      ok(VERIFIED_SOURCES.has(url), `${path}: 출처 ${url} 는 이번 판에 열어 확인한 주소`);
      ok(sources.includes(`<a href="${href}" target="_blank" rel="noopener noreferrer">`), `${path}: 출처 ${url} 는 새 탭에서 안전하게 열린다`);
    }
    const body = bodyOf(html);
    for (const [, href] of body.matchAll(/href="(https?:[^"]+)"/g)) ok(SOURCE_HOST.test(new URL(decode(href)).hostname), `${path}: 바깥 링크 ${href} 는 허용 출처`);
    for (const [, href] of body.matchAll(/href="(\/[^"#]*)"/g)) ok(pages.has(href), `${path}: 안쪽 링크 ${href} 는 공개 정본`);
    ok(!/https?:\/\//.test(sections.map(textOf).join("\n")), `${path}: 본문에 날 주소가 없다`);

    const visible = `${h1}\n${description}\n${sections.map(textOf).join("\n")}\n${textOf(faq)}`;
    for (const word of FORBIDDEN) ok(!visible.includes(word), `${path}: "${word}" 없음`);
    ok(!visible.includes("말해가계부"), `${path}: 본문이 서비스를 홍보하지 않는다`);
    ok(!AD_RUNTIME.test(html), `${path}: 기본 env 에서 광고 코드 없음`);
    eq((html.match(/<meta name="google-adsense-account"/g) || []).length, 1, `${path}: 소유권 메타 하나`);
    ok(html.includes('<div class="pubReadingNext"><a href="/articles">'), `${path}: 글 끝 링크가 허브로 돌아간다`);
    for (const table of html.match(/<table class="pubTable">[\s\S]*?<\/table>/g) || []) ok(table.includes("<caption") && table.includes('<th scope="col">'), `${path}: 표에 제목과 열 머리가 있다`);
    ok(/<table class="pubTable">/.test(html) || /<section class="pubSection"[^>]*>[\s\S]*?<ol>/.test(html), `${path}: 표나 번호 단계가 있다`);

    const signature = sections.map((s) => `${/<table/.test(s) ? "t" : ""}${/<ol>/.test(s) ? "s" : ""}${/<ul>/.test(s) ? "b" : ""}${/<p>/.test(s) ? "p" : ""}${/<aside class="pubNote">/.test(s) ? "n" : ""}`).join("-");
    if (!signatures.has(signature)) signatures.set(signature, path);
    addWindows(path, html);
  }
  eq(signatures.size, NEW_PATHS.length, "새 글 8편의 절 구조가 서로 다르다(틀로 찍은 글이 아님)");
  ok(sectionCounts.size >= 2, `새 글의 절 수가 두 가지 이상이다 (${[...sectionCounts].sort().join(",")})`);

  // 4. 40자 창: 새 글끼리, 그리고 기존 32편(V22.9.40 12 + V22.9.74 20)과 40자 이상 같은 구절이 없다.
  for (const path of OLD) addWindows(path, pages.get(path) || "");
  let repeated = 0;
  for (const [piece, owners] of windows) if (owners.size > 1 && [...owners].some((p) => NEW_PATHS.includes(p))) { repeated++; if (repeated <= 8) console.error(`repeated: ${[...owners].join(", ")} :: ${piece}`); }
  eq(repeated, 0, "새 글과 다른 글 사이에 40자 이상 같은 구절이 없다");

  // 5. 허브: 40편을 주제별로 한 번씩, 새 글은 정해진 분류 묶음에 있다.
  const hub = pages.get(HUB) || "";
  eq(structuredOf(hub)["@type"], "CollectionPage", "허브는 CollectionPage");
  const groups = [...hub.matchAll(/<section class="pubSection" id="section-\d+"><h2>([^<]+) \((\d+)편\)<\/h2>([\s\S]*?)<\/section>/g)].map((m) => ({ category: decode(m[1]), count: Number(m[2]), links: [...m[3].matchAll(/<li><a href="([^"]+)">/g)].map((x) => x[1]) }));
  const cards = groups.flatMap((g) => g.links);
  eq(cards.length, 40, "허브 카드는 40편이다(12 + 20 + 8)");
  eq(new Set(cards).size, cards.length, "허브는 글마다 카드 하나");
  eq(groups.length, 9, "허브 분류 묶음은 9개 그대로다(새 분류 없음)");
  for (const g of groups) eq(g.links.length, g.count, `허브 ${g.category} 묶음의 편수 표시가 카드 수와 같다`);
  for (const path of NEW_PATHS) ok(groups.some((g) => g.category === NEW[path] && g.links.includes(path)), `${path}: 허브 ${NEW[path]} 묶음에 카드가 있다`);
  ok(decode(hub).includes("글 40편을 주제 9개로"), "허브 설명이 40편·주제 9개를 말한다");
  ok(hub.includes(`${REVISION}에 올린`), "허브 머리말의 가장 최근 글이 새 글이다");

  // 6. 보이는 사이트맵·사용 가이드 목록·첫 화면.
  for (const path of NEW_PATHS) ok((pages.get("/site-map") || "").includes(`href="${path}"`), `${path}: 보이는 사이트맵에 있다`);
  ok(decode(pages.get("/guides") || "").includes("40편의 요약과 작성일"), "/guides 의 글 목록 안내가 40편을 말한다");
  // V22.9.104 A-2(H-9 결정): 첫 화면 ‘최근 글’ 이 글 목록 앞 8편이 되어 이 판의 새 글 8편을 모두 가리킨다.
  ok(NEW_PATHS.every((p) => (pages.get("/") || "").includes(`href="${p}"`)), "첫 화면(/) 최근 글이 새 글 8편을 모두 가리킨다(V22.9.104 A-2)");

  // V106: seasonal tax articles stay public but are excluded from both advertising allowlists.
  const siteConfig = stripBuildBlocks(readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8"));
  const listOf = (pattern) => [...((siteConfig.match(pattern) || ["", ""])[1]).matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  const adKeys = listOf(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  const publicPaths = listOf(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/);
  eq(publicPaths.length, 60, "공개 정본 목록은 60개다");
  eq(adKeys.filter((key) => publicPaths.includes(key)).length, 6, "공개 광고 후보는 대표 생활비 글 6편이다");
  for (const path of NEW_PATHS) {
    ok(publicPaths.includes(path), `${path}: 공개 정본 목록에 있다`);
    ok(!adKeys.includes(path), `${path}: 세무 글은 광고 허용 목록에서 제외된다`);
  }

  // 8. 원본: 새 모듈·빌드 목록·카탈로그 연결.
  const moduleSource = stripBuildBlocks(readFileSync(new URL("../src/modules/public/living-cost-articles-v22997.js", import.meta.url), "utf8"));
  for (const path of NEW_PATHS) ok(moduleSource.includes(`"${path.slice(1)}": {`), `${path}: living-cost-articles-v22997.js 에 있다`);
  for (const word of FORBIDDEN) ok(!moduleSource.includes(word), `모듈 원본에 "${word}" 없음`);
  ok(!moduleSource.includes("말해가계부"), "모듈 원본에 서비스 이름이 없다");
  ok(!/https?:\/\/(?!(www\.law\.go\.kr|www\.nts\.go\.kr|call\.nts\.go\.kr)\/)/.test(moduleSource), "모듈 원본의 주소는 국가법령정보센터·국세청뿐이다");
  ok(readFileSync(new URL("../src/modules/MANIFEST.txt", import.meta.url), "utf8").includes("public/living-cost-articles-v22997.js"), "새 모듈이 빌드 목록에 있다");
  ok(readFileSync(new URL("../src/modules/public/content-pages.js", import.meta.url), "utf8").includes("...publicLivingCostArticlesV22997(),"), "공개 문서 카탈로그가 새 글을 펼친다");
} finally {
  globalThis.fetch = originalFetch;
}
eq(outbound, 0, "새 글과 허브는 바깥 요청을 하지 않는다");
if (failures.length) {
  console.error(`V22.9.97 생활비 글 검사 실패 ${failures.length}건`);
  for (const failure of failures.slice(0, 40)) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`V22.9.97 생활비 글 8편·허브 40편·사이트맵 60·광고 화면 목록 검사 통과 (${checks} checks)`);
