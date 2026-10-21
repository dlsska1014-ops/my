// V22.9.74 생활비 가이드 글 20편·글 목록 허브(/articles)·작성자와 검토 방식 절 검사.
// AdSense "가치가 별로 없는 콘텐츠" 재심사 보강: 글마다 작성일·수정일·읽는 시간·핵심 요약·참고 자료·함께 읽을 글이 있고,
// 서로 다른 구조로 쓰였으며(틀로 찍은 글이 아님), 본문이 서비스를 홍보하지 않고, 외부 출처는 공식 기관만 쓴다.
// 화면은 기본 env 로 app.fetch 로 그리고 바깥 요청은 0회여야 한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { stripBuildBlocks } from "../tools/build-worker.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };

const origin = "https://malhaebook.com";
const get = (path, method = "GET", env = {}) => app.fetch(new Request(`${origin}${path}`, { method }), env, {});
const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");

const HUB = "/articles";
const ARTICLES = [
  "/household-spending-statistics", "/single-household-living-cost", "/food-cost-benchmark", "/utility-bills-seasonality",
  "/inflation-budget-update", "/card-income-deduction-basics", "/year-end-tax-expense-check", "/rent-tax-credit-records",
  "/apartment-maintenance-fee", "/mobile-plan-cost-review", "/sinking-fund-annual-expenses", "/debt-repayment-order",
  "/savings-rate-tracking", "/first-job-budget", "/car-ownership-cost", "/childcare-cost-planning",
  "/couple-account-structure", "/roommate-shared-ledger", "/monthly-closing-routine", "/expense-review-questions",
];
const V22940 = ["/budget-ratio-guide", "/fixed-cost-checklist", "/subscription-cleanup", "/card-spending-threshold", "/shared-living-cost-rules", "/accountbook-habit", "/payday-budget-cycle", "/expense-category-rules", "/emergency-fund-basics", "/weekly-report-reading", "/family-roles-accountbook", "/cash-flow-table"];
const LEGACY = ["/", "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide", "/group-accountbook", "/security", "/faq", "/about", "/contact", "/privacy", "/terms", "/cookies", "/site-map", "/guides", "/demo", "/report-guide", "/import-guide"];
const CATEGORIES = ["예산 세우기", "고정비·구독", "공동 생활비", "기록 습관", "리포트·분석", "저축·비상금·부채", "카드·세금", "통계로 보는 생활비", "생활 영역별 지출"];
const FORBIDDEN = ["낭비", "헛돈", "추천 카드", "대출 추천", "투자 추천", "후기", "사용자 수", "무조건", "최고의", "반드시", "대박", "꿀팁", "완벽"];
const SOURCE_HOST = /(^|\.)(go\.kr|gov\.kr)$|^(www\.)?(kosis\.kr|fss\.or\.kr|finlife\.fss\.or\.kr|bok\.or\.kr|ecos\.bok\.or\.kr|smartchoice\.or\.kr|nhis\.or\.kr|nps\.or\.kr|kftc\.or\.kr|policies\.google\.com|support\.google\.com)$/;
const AD_RUNTIME = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead/i;
const REVISION = "2026-10-21";

const articleOf = (html) => (html.match(/<article>([\s\S]*?)<\/article>/) || [])[1] || "";
const sectionsOf = (html) => [...html.matchAll(/<section class="pubSection" id="section-\d+">([\s\S]*?)<\/section>/g)].map((m) => m[1]);
const textOf = (fragment) => decode(fragment.replace(/<\/(p|li|td|th|caption|h2|aside|a|small|summary)>/g, "\n").replace(/<[^>]+>/g, " "));
const bodyOf = (html) => articleOf(html).replace(/<header class="pubHero">[\s\S]*?<\/header>/, "").replace(/<nav class="pubToc"[\s\S]*?<\/nav>/, "");
const hangul = (text) => (text.match(/[가-힣]/g) || []).length;
const linesOf = (html) => sectionsOf(html).map(textOf).join("\n").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const structuredOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);

const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("Public articles must not contact a data service"); };

try {
  // 1. 사이트맵: 정본 51개(가이드 18 + 글 12 + 허브 1 + 글 20). 새 글과 허브의 lastmod 는 이번 판 이후다.
  const xml = await (await get("/sitemap.xml")).text();
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  eq(entries.length, LEGACY.length + V22940.length + ARTICLES.length + 1, "sitemap lists the 51 canonical public documents");
  for (const path of [HUB, ...ARTICLES]) {
    const entry = entries.find((e) => e.path === path);
    ok(entry, `${path}: listed in XML sitemap`);
    ok(entry && entry.lastmod >= REVISION, `${path}: sitemap lastmod is this revision or later (${entry?.lastmod})`);
  }

  // 2. 모든 공개 페이지를 한 번씩 그린다. 머리글 내비에 글 허브가 있고, 허브에서는 현재 항목으로 표시된다.
  const pages = new Map();
  for (const entry of entries) {
    const response = await get(entry.path);
    eq(response.status, 200, `${entry.path}: public page renders`);
    pages.set(entry.path, await response.text());
  }
  for (const [path, html] of pages) ok(html.includes('href="/articles">생활비 글</a>'), `${path}: header nav links the article hub`);
  ok(pages.get(HUB).includes('aria-current="page" href="/articles">생활비 글</a>'), "hub nav item is marked as the current page");

  // 3. 새 글마다: 응답·색인·정본·구조·분량·작성일·요약·출처·함께 읽을 글·표현·광고.
  const signatures = new Map();
  const sectionCounts = new Set();
  const windows = new Map();
  const titles = new Set();
  const addWindows = (path, html) => {
    for (const line of linesOf(html)) for (let i = 0; i + 40 <= line.length; i++) {
      const piece = line.slice(i, i + 40);
      if (!windows.has(piece)) windows.set(piece, new Set());
      windows.get(piece).add(path);
    }
  };
  for (const path of ARTICLES) {
    const response = await get(path);
    const html = pages.get(path);
    eq(response.headers.get("x-robots-tag"), "index, follow", `${path}: explicitly indexable`);
    eq(response.headers.get("set-cookie"), null, `${path}: no cookie`);
    ok(String(response.headers.get("cache-control")).includes("public"), `${path}: publicly cacheable`);
    ok(html.includes(`<link rel="canonical" href="${origin}${path}"/>`), `${path}: canonical is exact`);
    const head = await get(path, "HEAD");
    eq(head.status, 200, `${path}: HEAD 200`);
    eq(await head.text(), "", `${path}: HEAD has no body`);
    const slash = await get(`${path}/`);
    eq(slash.status, 308, `${path}/: trailing slash consolidates`);
    eq(slash.headers.get("location"), `${origin}${path}`, `${path}/: canonical target`);

    const h1 = decode(html.match(/<h1>([^<]+)<\/h1>/)[1]);
    eq((html.match(/<h1[ >]/g) || []).length, 1, `${path}: exactly one H1`);
    ok(!titles.has(h1), `${path}: title is unique (${h1})`); titles.add(h1);
    ok(`${h1} · 말해가계부`.length <= 40, `${path}: title tag within 40 characters`);
    const description = decode(html.match(/name="description" content="([^"]+)"/)[1]);
    ok(description.length >= 70 && description.length <= 110, `${path}: description 70-110 characters (${description.length})`);
    const h2 = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => decode(m[1]));
    const topical = sectionsOf(html).length;
    ok(topical >= 4 && topical <= 8, `${path}: 4-8 topical sections (${topical})`);
    ok(h2.includes("자주 묻는 질문"), `${path}: has a FAQ section`);
    ok(!h2.includes("말해가계부에서는") && !h2.includes("다음에 읽을 글"), `${path}: no templated closing sections`);
    sectionCounts.add(topical);

    const body = bodyOf(html);
    const count = hangul(textOf(body));
    ok(count >= 2400 && count <= 5200, `${path}: body has ${count} Hangul syllables (2,400-5,200)`);
    ok(/<aside class="pubSummary" aria-label="핵심 요약"><b>핵심 요약<\/b><ul>(<li>[^<]+<\/li>){3}<\/ul><\/aside>/.test(html), `${path}: three-line summary box`);
    const meta = (html.match(/<p class="pubMeta">([\s\S]*?)<\/p>/) || [])[1] || "";
    const updated = (meta.match(/수정 <time datetime="(\d{4}-\d{2}-\d{2})">\1<\/time>/) || [])[1];
    const published = (meta.match(/작성 <time class="pubPublished" datetime="(\d{4}-\d{2}-\d{2})">\1<\/time>/) || [])[1];
    ok(updated && published && published <= updated && updated >= REVISION, `${path}: visible publication and revision dates (${published} / ${updated})`);
    ok(meta.includes('작성·관리: <a href="/about">도담 네트워크 운영팀</a>'), `${path}: byline links the editorial page`);
    ok(/읽는 시간 약 \d+분/.test(meta), `${path}: shows reading time`);
    ok(html.includes('<a href="/articles">생활비 가이드 글</a> / '), `${path}: breadcrumb passes through the hub`);
    eq(entries.find((e) => e.path === path)?.lastmod, updated, `${path}: sitemap lastmod equals the visible revision date`);

    const structured = structuredOf(html);
    eq(structured["@type"], "Article", `${path}: JSON-LD Article`);
    eq(structured.headline, h1, `${path}: JSON-LD headline matches H1`);
    eq(structured.datePublished, published, `${path}: JSON-LD datePublished`);
    eq(structured.dateModified, updated, `${path}: JSON-LD dateModified`);
    ok(CATEGORIES.includes(structured.articleSection), `${path}: JSON-LD articleSection is a known category (${structured.articleSection})`);
    eq(structured.author?.url, `${origin}/about`, `${path}: accountable author page`);
    eq(structured.isAccessibleForFree, true, `${path}: free to read`);
    eq(structured.mainEntityOfPage, `${origin}${path}`, `${path}: JSON-LD main entity is canonical`);
    ok(html.includes(`<span class="pubEyebrow">생활비 가이드 · ${structured.articleSection}</span>`), `${path}: eyebrow names the category`);

    const related = (html.match(/<aside class="pubRelated"><b>함께 읽을 글<\/b>([\s\S]*?)<\/aside>/) || [])[1] || "";
    const relatedLinks = [...related.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], decode(m[2])]);
    ok(relatedLinks.length >= 2 && relatedLinks.length <= 3, `${path}: two or three related links (${relatedLinks.length})`);
    for (const [href, label] of relatedLinks) ok(pages.has(href) && href !== path && label.length >= 8, `${path}: related link ${href} is another public page with descriptive text`);
    const faq = (html.match(/<section class="pubSection" id="questions">([\s\S]*?)<\/section>/) || [])[1] || "";
    const questions = (faq.match(/<details>/g) || []).length;
    ok(questions >= 2 && questions <= 4, `${path}: 2-4 FAQ entries (${questions})`);
    ok(faq.includes('href="/articles"'), `${path}: FAQ block points back to the hub`);
    const sources = (html.match(/<section class="pubSection pubSources" id="sources">([\s\S]*?)<\/section>/) || [])[1] || "";
    for (const [, href] of sources.matchAll(/<a href="([^"]+)"/g)) {
      ok(SOURCE_HOST.test(new URL(href).hostname) && href.startsWith("https://"), `${path}: source ${href} is an official https host`);
      ok(sources.includes(`<a href="${href}" target="_blank" rel="noopener noreferrer">`), `${path}: source ${href} opens safely in a new tab`);
    }
    for (const [, href] of body.matchAll(/href="(https?:[^"]+)"/g)) ok(SOURCE_HOST.test(new URL(href).hostname), `${path}: external link ${href} is an allowed official source`);
    for (const [, href] of body.matchAll(/href="(\/[^"#]*)"/g)) ok(pages.has(href), `${path}: internal link ${href} is a public canonical page`);
    ok(!/https?:\/\//.test(sectionsOf(html).map(textOf).join("\n")), `${path}: prose carries no raw URLs`);

    const visible = `${h1}\n${description}\n${sectionsOf(html).map(textOf).join("\n")}\n${textOf(faq)}`;
    for (const word of FORBIDDEN) ok(!visible.includes(word), `${path}: avoids "${word}"`);
    ok(!visible.includes("말해가계부"), `${path}: body does not promote the service`);
    ok(!AD_RUNTIME.test(html), `${path}: no ad runtime with the default environment`);
    eq((html.match(/<meta name="google-adsense-account"/g) || []).length, 1, `${path}: one ownership meta`);
    ok(html.includes('<div class="pubReadingNext"><a href="/articles">'), `${path}: footer link returns to the hub`);
    for (const table of html.match(/<table class="pubTable">[\s\S]*?<\/table>/g) || []) ok(table.includes("<caption") && table.includes('<th scope="col">'), `${path}: table has a caption and column headers`);
    ok(/<table class="pubTable">/.test(html) || /<section class="pubSection"[^>]*>[\s\S]*?<ol>/.test(html), `${path}: has a table or numbered steps`);

    const signature = sectionsOf(html).map((s) => `${/<table/.test(s) ? "t" : ""}${/<ol>/.test(s) ? "s" : ""}${/<ul>/.test(s) ? "b" : ""}${/<p>/.test(s) ? "p" : ""}${/<aside class="pubNote">/.test(s) ? "n" : ""}`).join("-");
    if (!signatures.has(signature)) signatures.set(signature, path);
    addWindows(path, html);
  }
  ok(sectionCounts.size >= 3, `articles use at least three different section counts (${[...sectionCounts].sort().join(",")})`);
  ok(signatures.size >= 15, `at least 15 distinct block structures among 20 articles (${signatures.size})`);

  // 4. 글끼리(새 글 20편 사이, 그리고 V22.9.40 글 12편과) 40자 이상 같은 구절을 되풀이하지 않는다.
  for (const path of V22940) addWindows(path, pages.get(path));
  let repeated = 0;
  for (const [piece, owners] of windows) if (owners.size > 1 && [...owners].some((p) => ARTICLES.includes(p))) { repeated++; if (repeated <= 5) console.error(`repeated: ${[...owners].join(", ")} :: ${piece}`); }
  eq(repeated, 0, "no 40-character run is shared between a V22.9.74 article and another article");

  // 5. 허브: 모든 글을 주제별로 한 번씩, 작성일과 요약과 함께 보여 준다.
  const hub = pages.get(HUB);
  eq(structuredOf(hub)["@type"], "CollectionPage", "hub is a CollectionPage");
  eq((hub.match(/<h1[ >]/g) || []).length, 1, "hub has one H1");
  const cardLinks = [...hub.matchAll(/<ul class="pubCards">([\s\S]*?)<\/ul>/g)].flatMap((m) => [...m[1].matchAll(/<li><a href="([^"]+)">/g)].map((x) => x[1]));
  eq(cardLinks.length, V22940.length + ARTICLES.length, "hub lists every article as a card");
  eq(new Set(cardLinks).size, cardLinks.length, "hub lists each article once");
  for (const path of [...V22940, ...ARTICLES]) ok(cardLinks.includes(path), `${path}: has a card on the hub`);
  eq((hub.match(/<small>작성 \d{4}-\d{2}-\d{2}/g) || []).length, cardLinks.length, "every card shows its publication date");
  for (const category of CATEGORIES) ok(hub.includes(`<h2>${category} (`), `hub groups articles under ${category}`);
  ok(hub.includes('href="/about"'), "hub links the editorial section");
  ok(hub.includes('<a href="/">말해가계부</a> / 생활비 가이드 글 전체 목록</nav>'), "hub breadcrumb sits directly under home");

  // 6. 홈 최근 글·소개의 작성자와 검토 방식·사용 가이드 허브·사이트맵 연결.
  const recent = (pages.get("/").match(/<section class="pubSection" id="section-\d+"><h2>최근 글<\/h2>[\s\S]*?<\/section>/) || [""])[0];
  ok([...recent.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((href) => ARTICLES.includes(href)).length >= 3, "home recent articles link at least three V22.9.74 articles");
  ok(recent.includes('href="/articles"'), "home recent articles link the hub");
  const editorial = (pages.get("/about").match(/<h2>글을 쓰는 사람과 검토 방식<\/h2>([\s\S]*?)<\/section>/) || [])[1] || "";
  const editorialText = textOf(editorial);
  eq((editorial.match(/<p>/g) || []).length, 3, "editorial section has three paragraphs");
  for (const word of ["운영자", "공식 자료", "수정일", "글쓰기 도구", "권하지 않", "광고"]) ok(editorialText.includes(word), `about editorial section mentions ${word}`);
  ok(editorial.includes('href="/articles"'), "editorial section links the hub");
  ok(pages.get("/guides").includes('href="/articles"'), "/guides links the hub");
  for (const path of [HUB, ...ARTICLES]) ok(pages.get("/site-map").includes(`href="${path}"`), `${path}: listed on the visible site map`);

  // 7. V22.9.40 글 12편: 분류·작성일이 붙고, 마지막 두 절은 보조 상자로 바뀌었다.
  for (const path of V22940) {
    const html = pages.get(path);
    ok(html.includes('<aside class="pubService"><b>말해가계부에서는</b>') && html.includes('<aside class="pubRelated"><b>함께 읽을 글</b>'), `${path}: service note and related links are aside boxes`);
    ok(html.includes('작성 <time class="pubPublished" datetime="2026-10-12">2026-10-12</time>'), `${path}: shows its original publication date`);
    ok(CATEGORIES.includes(structuredOf(html).articleSection), `${path}: JSON-LD articleSection`);
  }

  // 8. 원본: 글 20편이 새 모듈에 있고, 모듈·내비·빌드 목록이 맞다.
  const moduleSource = stripBuildBlocks(readFileSync(new URL("../src/modules/public/living-cost-articles-v22974.js", import.meta.url), "utf8"));
  for (const path of ARTICLES) ok(moduleSource.includes(`"${path.slice(1)}": {`), `${path}: defined in living-cost-articles-v22974.js`);
  for (const word of FORBIDDEN) ok(!moduleSource.includes(word), `module source avoids "${word}"`);
  const siteConfig = stripBuildBlocks(readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8"));
  ok(siteConfig.includes('["articles", "생활비 글", "/articles"]'), "header nav includes the article hub");
  ok(readFileSync(new URL("../src/modules/MANIFEST.txt", import.meta.url), "utf8").includes("public/living-cost-articles-v22974.js"), "module is in the build manifest");
} finally {
  globalThis.fetch = originalFetch;
}
eq(outbound, 0, "public articles made no outbound request");
console.log(`V22.9.74 생활비 가이드 글 20편·글 목록 허브 검사 통과 (${checks} checks)`);
