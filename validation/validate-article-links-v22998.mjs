// V22.9.98: V97:H-8. Published articles must link directly to all eight new seasonal articles.
// V22.9.142 (AdSense pruning, user decisions 3 and 5 on 11-24): seven of the eight seasonal articles were merged into
// /year-end-tax-expense-check, /card-income-deduction-basics and /rent-tax-credit-records (old addresses answer 308 —
// validate-v229142-adsense-week1). Older articles now recommend the merged year-end article and the remaining pension article.
import app from "../src/index.js";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks++; if (!value) failures.push(message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message}: expected ${expected}, got ${actual}`);
const origin = "https://malhaebook.com";
const revision = "2026-11-03";
// V106 edits six of these source articles; unedited source articles retain the earlier date.
const revisedSources = new Set(['/card-income-deduction-basics','/year-end-tax-expense-check','/rent-tax-credit-records','/childcare-cost-planning','/couple-account-structure','/debt-repayment-order']);
const pairs = [
  ["childcare-cost-planning", "year-end-tax-expense-check"],
  ["couple-account-structure", "year-end-tax-expense-check"],
  ["savings-rate-tracking", "pension-savings-irp-tax-credit"],
  ["single-household-living-cost", "year-end-tax-expense-check"],
  ["debt-repayment-order", "year-end-tax-expense-check"],
].map(([from, to]) => [`/${from}`, `/${to}`]);
const relatedOf = (html) => (html.match(/<aside class="pubRelated"><b>함께 읽을 글<\/b>([\s\S]*?)<\/aside>/) || [])[1] || "";
const linksOf = (html) => [...html.matchAll(/<a\b([^>]*\bhref="([^"]+)"[^>]*)>([^<]+)</g)].map((m) => ({ attributes: m[1], path: m[2], label: m[3] }));
const jsonLdOf = (html) => JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("Public related articles must not request a data service"); };

try {
  const get = (path) => app.fetch(new Request(`${origin}${path}`), {}, {});
  const sitemap = await (await get("/sitemap.xml")).text();
  const entries = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>\s*<lastmod>([^<]+)<\/lastmod>/g)].map((m) => ({ path: new URL(m[1]).pathname, lastmod: m[2] }));
  eq(entries.length, 51, "The sitemap retains 51 public canonical pages (V22.9.142 merged nine articles)");
  const pages = new Map();
  for (const { path } of entries) {
    const response = await get(path);
    eq(response.status, 200, `${path} is publicly readable`);
    pages.set(path, { html: await response.text(), headers: response.headers });
  }
  const articles = [...pages].filter(([, page]) => relatedOf(page.html));
  eq(articles.length, 31, "All 31 articles retain related reading");
  for (const [path, page] of articles) {
    const links = linksOf(relatedOf(page.html));
    ok(links.length >= 2 && links.length <= 3, `${path} has two or three related links`);
    eq(new Set(links.map((link) => link.path)).size, links.length, `${path} has no duplicate related links`);
    for (const link of links) {
      ok(link.path !== path && pages.has(link.path), `${path} links to another canonical public page: ${link.path}`);
      ok(link.label.length >= 8, `${path}: ${link.path} has a descriptive label`);
      ok(!/\brel="[^"]*\bnofollow\b/.test(link.attributes), `${path}: ${link.path} allows crawlers to follow it`);
    }
  }
  for (const [from, to] of pairs) {
    const page = pages.get(from);
    ok(linksOf(relatedOf(page.html)).some((link) => link.path === to), `${from} directly recommends ${to}`);
    eq(linksOf(relatedOf(page.html)).length, 3, `${from} keeps the three-link limit`);
    const data = jsonLdOf(page.html);
    // V22.9.142: 합친 글은 더 이상 이 목록의 출발 글이 아니다. 출발 글의 함께 읽을 글만 바꿨고 본문은 그대로라 수정일도 그대로다.
    const modified = revisedSources.has(from) ? "2026-11-07" : revision;
    eq(data.datePublished, "2026-10-21", `${from} preserves its publication date`);
    eq(data.dateModified, modified, `${from} records the link revision date`);
    ok(page.html.includes(`수정 <time datetime="${modified}">${modified}</time>`), `${from} displays the revision date`);
    eq(entries.find((entry) => entry.path === from)?.lastmod, modified, `${from} has the same sitemap lastmod`);
    const target = pages.get(to);
    eq(target.headers.get("x-robots-tag"), "index, follow", `${to} allows indexing`);
    eq(target.headers.get("set-cookie"), null, `${to} does not require a session`);
    ok(target.html.includes(`<link rel="canonical" href="${origin}${to}"/>`), `${to} is the canonical destination`);
  }
  for (const to of new Set(pairs.map(([, to]) => to))) {
    ok(articles.some(([path, page]) => jsonLdOf(page.html).datePublished < revision && linksOf(relatedOf(page.html)).some((link) => link.path === to)), `${to} has an incoming link from an older article`);
  }
} finally {
  globalThis.fetch = originalFetch;
}
eq(outbound, 0, "Public article navigation performs no outbound requests");
if (failures.length) {
  for (const failure of failures) console.error(` - ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`V22.9.98 public article links passed (${checks} checks)`);
}
