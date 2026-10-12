// V22.9.40 (D) 생활비 가이드 글 검사.
// AdSense "가치가 별로 없는 콘텐츠" 보강으로 더한 공개 글이 색인·정본·작성자·분량·출처·계산·기능 서술 기준을
// 지키는지 본다. 화면은 QA 픽스처 없이(기본 env) app.fetch 로 그리고, 바깥 요청은 0회여야 한다.
// 마지막에 QA 픽스처 env 로도 한 번 더 그려 광고 실행 코드가 없는지 확인한다.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { buildSettlementModel, parseTransaction } from "../src/index.js";
import { stripBuildBlocks } from "../tools/build-worker.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };

const origin = "https://malhaebook.com";
const UPDATED = "2026-10-12";
const AUTHOR = "도담 네트워크";
const ARTICLES = [
  "/budget-ratio-guide", "/fixed-cost-checklist", "/subscription-cleanup", "/card-spending-threshold",
  "/shared-living-cost-rules", "/accountbook-habit", "/payday-budget-cycle", "/expense-category-rules",
  "/emergency-fund-basics", "/weekly-report-reading", "/family-roles-accountbook", "/cash-flow-table",
];
// 공개 페이지 18개는 validate-public-guides-v22939 가 자세히 본다. 여기서는 새 글과 연결 지점만 본다.
const LEGACY = ["/", "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide", "/group-accountbook", "/security", "/faq", "/about", "/contact", "/privacy", "/terms", "/cookies", "/site-map", "/guides", "/demo", "/report-guide", "/import-guide"];
const FORBIDDEN = ["낭비", "헛돈", "추천 카드", "대출 추천", "투자 추천", "후기", "사용자 수"];
const EXTERNAL_ALLOWED = [/(^|\.)gov\.kr$/, /(^|\.)go\.kr$/, /^policies\.google\.com$/, /^support\.google\.com$/];
const AD_RUNTIME = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead/i;
const AD_COOKIE = /__gads|__gpi|__eoi/i;

const get = (path, method = "GET", env = {}) => app.fetch(new Request(`${origin}${path}`, { method }), env, {});
const won = (n) => n.toLocaleString("en-US").replace(/^-/, "−");
const decode = (text) => text.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, "\"").replace(/&#39;/g, "'");

// 본문 한글 글자 수: <article> 안의 <section class="pubSection"> 들만 모은다. 이렇게 하면 사이트 머리글 내비,
// 현재 위치 내비, 제목·소개·작성자·버튼이 있는 머리 영역(<header class="pubHero">), 목차(<nav class="pubToc">),
// 글 밖의 "다른 사용 가이드" 링크와 푸터가 모두 빠진다. 태그를 지운 뒤 한글 음절(가-힣)만 세므로
// 공백·구두점·숫자·영문은 세지 않는다.
const sectionsOf = (html) => [...html.matchAll(/<section class="pubSection" id="section-\d+">([\s\S]*?)<\/section>/g)].map((m) => m[1]);
const textOf = (fragment) => decode(fragment.replace(/<\/(p|li|td|th|caption|h2|aside|a)>/g, "\n").replace(/<[^>]+>/g, " "));
const hangulCount = (html) => (sectionsOf(html).map(textOf).join(" ").match(/[가-힣]/g) || []).length;
// 같은 문장 검사는 문단·목록·표 칸 단위로 줄을 나눈 뒤 공백을 하나로 줄여 비교한다.
const linesOf = (html) => sectionsOf(html).map(textOf).join("\n").split("\n").map((s) => s.replace(/\s+/g, " ").trim()).filter(Boolean);
const sentencesOf = (html) => linesOf(html).flatMap((line) => line.split(/(?<=[.!?])\s+/)).filter(Boolean);
const articleOf = (html) => (html.match(/<article>([\s\S]*?)<\/article>/) || [])[1] || "";
const sectionByTitle = (html, title) => sectionsOf(html).find((s) => s.startsWith(`<h2>${title}</h2>`)) || "";

const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("Public articles must not contact a data service"); };

try {
  // 1. 사이트맵: PUBLIC_CONTENT_PATHS 가 정본 목록이다. 새 글이 모두 들어 있고 수정일이 이번 판이다.
  const xml = await (await get("/sitemap.xml")).text();
  const entries = [...xml.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  const publicPaths = entries.map((e) => e.path);
  eq(new Set(publicPaths).size, publicPaths.length, "sitemap lists each canonical path once");
  eq(publicPaths.length, LEGACY.length + ARTICLES.length, "sitemap holds the 18 earlier public pages plus the new articles");
  for (const path of LEGACY) ok(publicPaths.includes(path), `${path}: earlier public page stays in the sitemap`);
  for (const path of ARTICLES) {
    const entry = entries.find((e) => e.path === path);
    ok(entry, `${path}: listed in XML sitemap`);
    eq(entry.lastmod, UPDATED, `${path}: sitemap lastmod is this revision`);
  }

  // 2. 공개 페이지 전체: 제목·설명이 서로 겹치지 않는다. 작성자 표기는 Article 에만 "운영팀"을 붙인다.
  const pages = new Map();
  const titles = new Map(), descriptions = new Map();
  for (const path of publicPaths) {
    const response = await get(path);
    eq(response.status, 200, `${path}: public page renders`);
    const html = await response.text();
    pages.set(path, html);
    const title = decode(html.match(/<title>([^<]+)<\/title>/)[1]);
    const description = decode(html.match(/name="description" content="([^"]+)"/)[1]);
    ok(!titles.has(title), `${path}: title is unique (${title})`);
    ok(!descriptions.has(description), `${path}: description is unique`);
    titles.set(title, path); descriptions.set(description, path);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    if (structured["@type"] === "Article") {
      ok(html.includes(`작성·관리: <a href="/about">${AUTHOR} 운영팀</a>`), `${path}: article byline names the operations team`);
      eq(structured.author?.name, AUTHOR, `${path}: JSON-LD author stays the operating company`);
    } else {
      ok(html.includes(`운영: <a href="/about">${AUTHOR}</a>`) && !html.includes(`${AUTHOR} 운영팀</a>`), `${path}: non-article pages keep the operator label`);
    }
  }

  // 3. 새 글마다: 응답·색인·정본·구조·분량·작성자·링크·표현·광고.
  const articleText = new Map();
  for (const path of ARTICLES) {
    const response = await get(path);
    const html = pages.get(path);
    eq(response.status, 200, `${path}: GET 200`);
    eq(response.headers.get("x-robots-tag"), "index, follow", `${path}: explicitly indexable`);
    eq(response.headers.get("set-cookie"), null, `${path}: no cookie`);
    ok(String(response.headers.get("cache-control")).includes("public"), `${path}: publicly cacheable`);
    ok(html.includes(`<link rel="canonical" href="${origin}${path}"/>`), `${path}: canonical is exact`);
    const head = await get(path, "HEAD");
    eq(head.status, 200, `${path}: HEAD 200`);
    eq(await head.text(), "", `${path}: HEAD has no body`);
    eq(head.headers.get("x-robots-tag"), "index, follow", `${path}: HEAD indexing matches GET`);
    eq(head.headers.get("set-cookie"), null, `${path}: HEAD sets no cookie`);
    for (const suffix of ["/", "/?utm_source=guide"]) {
      const slash = await get(`${path}${suffix}`);
      eq(slash.status, 308, `${path}${suffix}: trailing slash consolidates`);
      eq(slash.headers.get("location"), `${origin}${path}${suffix.slice(1)}`, `${path}${suffix}: fixed canonical target keeps the query`);
    }

    const title = decode(html.match(/<h1>([^<]+)<\/h1>/)[1]);
    const description = decode(html.match(/name="description" content="([^"]+)"/)[1]);
    eq((html.match(/<h1[ >]/g) || []).length, 1, `${path}: exactly one H1`);
    const h2 = (html.match(/<h2[ >]/g) || []).length;
    ok(h2 >= 5 && h2 <= 8, `${path}: 5-8 H2 sections (${h2})`);
    ok(`${title} · 말해가계부`.length <= 40, `${path}: title tag within 40 characters`);
    ok(description.length >= 70 && description.length <= 110, `${path}: description 70-110 characters (${description.length})`);
    const hangul = hangulCount(html);
    ok(hangul >= 1800, `${path}: body has at least 1,800 Hangul syllables (${hangul})`);
    ok(hangul <= 2600, `${path}: body stays within 2,600 Hangul syllables (${hangul})`);
    ok(/<table class="pubTable">/.test(html) || /<section class="pubSection"[^>]*>[\s\S]*?<ol>/.test(html), `${path}: has a table or numbered steps`);
    for (const table of html.match(/<table class="pubTable">[\s\S]*?<\/table>/g) || []) ok(table.includes("<caption") && table.includes('<th scope="col">'), `${path}: table has a caption and column headers`);
    ok(html.includes("가상 사례"), `${path}: numbers are labelled 가상 사례`);
    ok(html.includes(`<time datetime="${UPDATED}">${UPDATED}</time>`), `${path}: visible revision date`);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    eq(structured["@type"], "Article", `${path}: JSON-LD Article`);
    eq(structured.dateModified, UPDATED, `${path}: JSON-LD dateModified`);
    eq(structured.headline, title, `${path}: JSON-LD headline matches H1`);
    eq(structured.mainEntityOfPage, `${origin}${path}`, `${path}: JSON-LD main entity is canonical`);
    eq(structured.author?.url, `${origin}/about`, `${path}: accountable author page`);

    const body = articleOf(html);
    const internal = [...body.matchAll(/href="(\/[^"#]*)"/g)].map((m) => m[1]);
    ok(internal.length >= 2, `${path}: at least two internal links`);
    for (const href of internal) ok(publicPaths.includes(href), `${path}: internal link ${href} is a public canonical page`);
    for (const [, href] of body.matchAll(/href="(https?:[^"]+)"/g)) ok(EXTERNAL_ALLOWED.some((rule) => rule.test(new URL(href).hostname)), `${path}: external link ${href} is an allowed official source`);
    const titlesH2 = [...html.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => decode(m[1]));
    ok(titlesH2.some((t) => t.includes("자주 하는 실수")), `${path}: has a common-mistakes section`);
    ok(titlesH2.at(-2) === "말해가계부에서는" && titlesH2.at(-1) === "다음에 읽을 글", `${path}: ends with the service note and further reading`);
    const service = textOf(sectionByTitle(html, "말해가계부에서는")).trim().replace(/^말해가계부에서는/, "");
    const serviceSentences = (service.match(/[.!?](\s|$)/g) || []).length;
    ok(serviceSentences >= 2 && serviceSentences <= 4, `${path}: service note has 2-4 sentences (${serviceSentences})`);
    const next = sectionByTitle(html, "다음에 읽을 글");
    const nextLinks = [...next.matchAll(/<a href="([^"]+)"[^>]*>([^<]+)</g)].map((m) => [m[1], decode(m[2])]);
    ok(nextLinks.length >= 2 && nextLinks.length <= 3, `${path}: two or three further-reading links`);
    ok(nextLinks.some(([href]) => ARTICLES.includes(href)) && nextLinks.some(([href]) => !ARTICLES.includes(href)), `${path}: further reading mixes new articles with existing guides or the demo`);
    for (const [href, label] of nextLinks) ok(href !== path && label.length >= 8 && !/^(여기|더 ?보기|바로가기|클릭|링크)$/.test(label), `${path}: link text describes ${href}`);
    const visible = `${title}\n${description}\n${textOf(body)}`;
    for (const word of FORBIDDEN) ok(!visible.includes(word), `${path}: avoids "${word}"`);
    eq((html.match(/<meta name="google-adsense-account"/g) || []).length, 1, `${path}: one ownership meta`);
    ok(!AD_RUNTIME.test(html) && !AD_COOKIE.test(html), `${path}: no ad runtime with the default environment`);
    ok(pages.get("/guides").includes(`href="${path}"`), `${path}: listed on the /guides hub`);
    ok(pages.get("/site-map").includes(`href="${path}"`), `${path}: listed on the visible site map`);
    const longSentences = sentencesOf(html).filter((s) => s.length >= 40).length;
    ok(longSentences >= 25, `${path}: duplicate check sees the article's sentences (${longSentences})`);
    articleText.set(path, linesOf(html));
  }

  // 4. 글끼리, 그리고 기존 공개 페이지와 40자 이상 같은 문장을 되풀이하지 않는다. 문장 전체가 같은 경우뿐 아니라
  //    문장 일부라도 연속한 40자가 겹치면 실패로 본다(40자 창을 한 글자씩 밀며 비교).
  const WINDOW = 40;
  const windows = new Map();
  for (const [path, html] of pages) for (const line of (articleText.get(path) || linesOf(html))) {
    for (let i = 0; i + WINDOW <= line.length; i++) {
      const piece = line.slice(i, i + WINDOW);
      if (!windows.has(piece)) windows.set(piece, new Set());
      windows.get(piece).add(path);
    }
  }
  let repeated = 0;
  for (const [piece, paths] of windows) if (paths.size > 1 && [...paths].some((p) => ARTICLES.includes(p))) { repeated++; if (repeated <= 5) console.error(`repeated: ${[...paths].join(", ")} :: ${piece}`); }
  eq(repeated, 0, "no 40-character run is shared between a new article and another public page");
  const sentenceOwners = new Map();
  for (const path of ARTICLES) for (const sentence of sentencesOf(pages.get(path))) {
    if (sentence.length < 40) continue;
    eq(sentenceOwners.get(sentence) ?? path, path, `${path}: 40+ character sentence is not reused from ${sentenceOwners.get(sentence)}`);
    sentenceOwners.set(sentence, path);
  }

  // 5. 허브·홈·소개 연결.
  const recent = sectionByTitle(pages.get("/"), "최근 글");
  const recentLinks = [...recent.matchAll(/href="([^"]+)"/g)].map((m) => m[1]).filter((href) => ARTICLES.includes(href));
  ok(recentLinks.length >= 3 && recentLinks.length <= 4, `home "최근 글" links three or four new articles (${recentLinks.length})`);
  ok(recent.includes('href="/guides"'), "home \"최근 글\" points to the full list");
  eq(sectionsOf(pages.get("/")).filter((s) => s.startsWith("<h2>최근 글</h2>")).length, 1, "home adds a single recent-articles section");
  const hub = sectionByTitle(pages.get("/guides"), "생활비 가이드 글");
  eq([...hub.matchAll(/href="([^"]+)"/g)].filter((m) => ARTICLES.includes(m[1])).length, ARTICLES.length, "/guides hub section lists every new article once");
  for (const [, label] of hub.matchAll(/<a href="[^"]+">([^<]+)</g)) ok(decode(label).includes(": "), `/guides hub entry carries a one-line description (${decode(label)})`);
  const about = textOf(sectionByTitle(pages.get("/about"), "운영팀과 글 작성 원칙"));
  ok(about.includes("도담 네트워크 운영팀") && about.includes("가상 사례") && about.includes("권하지 않") && about.includes("문의") && about.includes("날짜"), "about explains the team, virtual examples, no product advice, corrections and dates");
  const aboutSentences = (about.match(/[.!?](\s|$)/g) || []).length;
  ok(aboutSentences >= 3 && aboutSentences <= 5, `about team section has 3-5 sentences (${aboutSentences})`);
  for (const word of FORBIDDEN) ok(!about.includes(word) && !textOf(recent).includes(word) && !textOf(hub).includes(word), `hub, home and about additions avoid "${word}"`);
  for (const path of ["/", "/guides", "/about", "/site-map"]) eq(entries.find((e) => e.path === path).lastmod, UPDATED, `${path}: revision date moved with its content`);

  // 6. 원본 글 블록: 금지 표현이 없고, 모든 글이 같은 작성일을 쓴다.
  const moduleSource = stripBuildBlocks(readFileSync(new URL("../src/modules/public/guide-content.js", import.meta.url), "utf8"));
  const block = moduleSource.slice(moduleSource.indexOf("// ── V22.9.40 (D) 생활비 가이드 글 ──"));
  ok(block.includes("function publicLivingCostArticles()"), "article block is one marked section at the end of guide-content.js");
  for (const word of FORBIDDEN) ok(!block.includes(word), `article source avoids "${word}"`);
  for (const path of ARTICLES) ok(block.includes(`"${path.slice(1)}": article(`), `${path}: defined in the marked article block`);

  // 7. 가상 사례 숫자를 다시 계산하고 화면에 그 숫자가 있는지 본다.
  const sum = (...values) => values.reduce((a, b) => a + b, 0);
  const facts = {
    "/budget-ratio-guide": [
      [sum(600000, 150000, 110000, 190000, 150000, 450000), 1650000], [sum(280000, 70000, 150000, 150000, 100000), 750000],
      [sum(300000, 150000, 150000), 600000], [sum(1650000, 750000, 600000), 3000000], [sum(1720000, 820000, 460000), 3000000],
      [sum(1700000, 680000, 620000), 3000000], [(1720000 + 1700000) / 2, 1710000], [(460000 + 620000) / 2, 540000],
      [750000 - (1710000 - 1650000), 690000], [sum(1710000, 690000, 600000), 3000000],
    ],
    "/fixed-cost-checklist": [[sum(135000, 210000, 46800, 180000, 320000), 891800], [sum(113000, 210000, 23900, 180000, 320000), 846900], [891800 - 846900, 44900], [22000 + 22900, 44900], [44900 * 12, 538800]],
    "/subscription-cleanup": [[sum(13500, 10900, 2200, 60000 / 12, 9500, 120000 / 12), 51100], [51100 * 12, 613200], [51100 - 9500, 41600], [41600 - 10000, 31600], [9900 * 3, 29700]],
    "/card-spending-threshold": [[300000 - 260000, 40000], [450000 / 2, 225000], [300000 * 2 - 450000, 150000], [10000 + 8000, 18000], [10000 * 12, 120000], [120000 - 15000, 105000]],
    "/shared-living-cost-rules": [[sum(150000, 30000, 120000, 60000), 360000], [150000 + 60000, 210000]],
    "/payday-budget-cycle": [[1500000 - 80000, 1420000], [sum(450000, 300000, 250000), 1000000], [3000000 + 1000000, 4000000], [Math.floor(1500000 * 24 / 31 / 1000) * 1000, 1161000]],
    "/expense-category-rules": [[180000 + 95000, 275000], [275000 - 260000, 15000]],
    "/emergency-fund-basics": [[sum(750000, 450000, 300000, 150000, 150000), 1800000], [1800000 * 3, 5400000], [1800000 * 6, 10800000], [sum(720000, 600000, 360000, 480000, 240000), 2400000], [2400000 / 12, 200000], [sum(60000, 50000, 30000, 40000, 20000), 200000], [1200000 / 300000, 4, "4개월"], [5400000 / 300000, 18, "18개월"], [10800000 / 300000, 36, "36개월"]],
    "/weekly-report-reading": [[sum(82000, 54000, 38000, 15500, 22600), 212100], [sum(64000, 61000, 12000, 14000, 22600), 173600], [212100 - 173600, 38500], [301000 - 212100, 88900], [(54000 + 38000) - (61000 + 12000), 19000], [38000 - 12000, 26000]],
    "/family-roles-accountbook": [[3500000 * 4 / 7, 2000000], [3500000 * 3 / 7, 1500000], [3200000 - 2000000, 1200000], [2400000 - 1500000, 900000], [1200000 - 400000 + 900000 - 400000, 1300000], [3200000 + 2400000, 5600000], [1200000 + 900000, 2100000]],
    "/cash-flow-table": [[3200000 - 1150000 - 1020000 - 180000 - 600000, 250000], [3000000 - 1150000 - 1240000 - 0 - 600000, 10000], [3000000 - 1180000 - 980000 - 450000 - 600000, -210000], [250000 + 10000 - 210000, 50000], [1180000 - 1150000, 30000]],
  };
  for (const [path, list] of Object.entries(facts)) for (const [actual, expected, shown = won(expected)] of list) {
    eq(actual, expected, `${path}: worked example arithmetic ${shown}`);
    ok(pages.get(path).includes(shown), `${path}: shows ${shown}`);
  }
  for (const [path, ratio, label] of [["/budget-ratio-guide", 1650000 / 3000000, "55%"], ["/budget-ratio-guide", 1710000 / 3000000, "57/23/20"], ["/accountbook-habit", 24 / 30, "80%"], ["/accountbook-habit", 19 / 31, "약 61%"], ["/accountbook-habit", 27 / 30, "90%"], ["/weekly-report-reading", 38500 / 173600, "약 22%"], ["/cash-flow-table", 1150000 / 3200000, "약 36%"], ["/cash-flow-table", 1020000 / 3200000, "약 32%"]]) {
    eq(`${Math.round(ratio * 100)}`, label.match(/\d+/)[0], `${path}: rounded share ${label}`);
    ok(pages.get(path).includes(label), `${path}: shows ${label}`);
  }
  const shares = [1150000, 1020000, 180000, 600000, 250000].map((v) => (v / 3200000 * 100).toFixed(1));
  eq(shares.join(" "), "35.9 31.9 5.6 18.8 7.8", "cash-flow shares round to the published values");
  eq(shares.reduce((a, b) => a + Number(b), 0).toFixed(1), "100.0", "cash-flow published shares add up to 100%");
  for (const share of shares) ok(pages.get("/cash-flow-table").includes(`${share}%`), `cash-flow table shows ${share}%`);
  ok(99000 / 9900 === 10 && pages.get("/subscription-cleanup").includes("99,000 ÷ 9,900 = 10"), "annual-plan break-even month count");
  ok(38000 / 12000 > 3 && pages.get("/weekly-report-reading").includes("3배가 넘지만"), "delivery ratio statement is true");

  // 8. 공동 생활비 네 방식은 실제 정산 모델과 같은 결과다.
  const rows = [
    { id: "r1", type: "expense", user_id: "a", amount: 150000 }, { id: "r2", type: "expense", user_id: "b", amount: 30000 },
    { id: "r3", type: "expense", user_id: "c", amount: 120000 }, { id: "r4", type: "expense", user_id: "a", amount: 60000 },
  ];
  const members = [{ user_id: "a", role: "owner", nickname: "A" }, { user_id: "b", role: "member", nickname: "B" }, { user_id: "c", role: "member", nickname: "C" }];
  const shared = pages.get("/shared-living-cost-rules");
  for (const [label, options, expectedShares, expectedTransfers, row] of [
    ["동일", { mode: "equal" }, { A: 120000, B: 120000, C: 120000 }, [["B", "A", 90000]], "동일 분배</th><td>120,000</td><td>120,000</td><td>120,000</td><td>B가 A에게 90,000</td>"],
    ["비율", { mode: "ratio", weights: { a: 4, b: 3, c: 3 } }, { A: 144000, B: 108000, C: 108000 }, [["B", "A", 66000], ["B", "C", 12000]], "비율 4:3:3</th><td>144,000</td><td>108,000</td><td>108,000</td><td>B가 A에게 66,000, C에게 12,000</td>"],
    ["인원수", { mode: "headcount", weights: { a: 2, b: 1, c: 1 } }, { A: 180000, B: 90000, C: 90000 }, [["B", "A", 30000], ["B", "C", 30000]], "인원수 2:1:1</th><td>180,000</td><td>90,000</td><td>90,000</td><td>B가 A와 C에게 30,000씩</td>"],
    ["품목별", { mode: "item", itemParticipants: { r3: ["b", "c"] } }, { A: 80000, B: 140000, C: 140000 }, [["B", "A", 110000], ["C", "A", 20000]], "품목별</th><td>80,000</td><td>140,000</td><td>140,000</td><td>B가 A에게 110,000, C가 A에게 20,000</td>"],
  ]) {
    const model = buildSettlementModel(rows, members, options);
    eq(model.totalExpense, 360000, `${label}: settlement total`);
    for (const person of model.people) eq(person.share, expectedShares[person.name], `${label}: ${person.name} share agrees with the published table`);
    eq(JSON.stringify(model.transfers.map((t) => [t.from, t.to, t.amount])), JSON.stringify(expectedTransfers), `${label}: published transfer suggestion agrees with the model`);
    ok(shared.includes(row), `${label}: row is published as computed`);
  }

  // 9. "말해가계부에서는" 절의 문장 예시는 실제 해석기 결과와 같다.
  for (const [text, field, expected, path] of [
    ["음악 구독 10900원", "category", "구독", "/subscription-cleanup"], ["점심 12000원 국민카드", "payment_method", "국민카드", "/card-spending-threshold"],
    ["점심 12000원", "category", "외식", "/accountbook-habit"], ["배민 23000원", "category", "배달", "/expense-category-rules"],
    ["스타벅스 5600원", "category", "카페/간식", "/expense-category-rules"], ["상여 1000000원", "type", "income", "/payday-budget-cycle"],
  ]) {
    eq(parseTransaction(text)[field], expected, `"${text}" is parsed as ${field}=${expected}`);
    ok(pages.get(path).includes(`‘${text}’`), `${path}: quotes the parsed example ‘${text}’`);
  }

  // 10. 글이 말하는 기능이 소스에 그대로 있다. 기능이 바뀌면 이 검사가 글을 다시 보라고 알린다.
  const worker = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  for (const anchor of [
    "카드별 사용액과 실적 목표", "고정비와 구독", "최근 석 달에 두 번 이상 보인 지출", "지난달 예산 복사", "동일 분배", "비율 분배", "인원수 분배", "품목별 참여자",
    "송금 횟수를 줄인 제안", "정산 완료로 저장", "지출자 미지정", "매주 일요일 주간 리포트", "월 준비 권장액", "30일 안에 나갈 적립 계획", "이번 달 고정지출 기록하기",
    "같은 달에 여러 번 눌러도 이미 반영된 항목은 다시 들어가지 않습니다", "카테고리별 키워드", "지난주 같은 요일까지 대비", "지난주 전체 대비", "무지출", "이번 달 정기수입",
    "\"식비\",\"외식\",\"배달\",\"카페/간식\",\"장보기\",\"편의점\"", "기록된 결제수단 기준 사용액이에요",
  ]) ok(worker.includes(anchor), `service feature described in the articles still exists: ${anchor}`);

  eq(outbound, 0, "anonymous article requests made zero outbound calls");
} finally { globalThis.fetch = originalFetch; }

// 11. QA 픽스처 env 에서도 광고 실행 코드 없이 같은 정본으로 그린다.
const fixture = await createV2265QaFixture();
try {
  for (const path of ARTICLES) {
    const response = await get(path, "GET", fixture.env);
    eq(response.status, 200, `${path}: renders with the QA fixture environment`);
    const html = await response.text();
    ok(!AD_RUNTIME.test(html) && !AD_COOKIE.test(html), `${path}: no ad runtime with the QA fixture environment`);
    ok(html.includes(`<link rel="canonical" href="${origin}${path}"/>`), `${path}: canonical is stable across environments`);
  }
} finally { fixture.restore(); }

console.log(`Public living-cost articles: ${checks} checks passed`);
