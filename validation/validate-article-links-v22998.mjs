// V22.9.98: V97:H-8. Published articles must link directly to all eight new seasonal articles.
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
  ["card-income-deduction-basics", "payment-method-switch-nov-dec"],
  ["year-end-tax-expense-check", "year-end-tax-timeline-checklist"],
  ["rent-tax-credit-records", "housing-deductions-overview"],
  ["childcare-cost-planning", "medical-education-donation-deductions"],
  ["couple-account-structure", "dual-income-deduction-allocation"],
  ["savings-rate-tracking", "pension-savings-irp-tax-credit"],
  ["single-household-living-cost", "single-household-year-end-tax"],
  ["debt-repayment-order", "tax-refund-money-plan"],
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
  eq(entries.length, 60, "The sitemap retains 60 public canonical pages");
  const pages = new Map();
  for (const { path } of entries) {
    const response = await get(path);
    eq(response.status, 200, `${path} is publicly readable`);
    pages.set(path, { html: await response.text(), headers: response.headers });
  }
  const articles = [...pages].filter(([, page]) => relatedOf(page.html));
  eq(articles.length, 40, "All 40 articles retain related reading");
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
