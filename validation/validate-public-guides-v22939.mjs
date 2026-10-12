import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import app, { budgetSummary, buildSettlementModel } from "../src/index.js";
import { stripBuildBlocks } from "../tools/build-worker.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks++; };
const paths = ["/", "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide", "/group-accountbook", "/security", "/faq", "/about", "/contact", "/privacy", "/terms", "/cookies", "/site-map", "/guides", "/demo", "/report-guide", "/import-guide"];
// V22.9.40 (D): 생활비 가이드 글은 validate-public-articles-v22940 이 자세히 검사한다. 여기서는 정본 목록에만 더한다.
const articlePaths = ["/budget-ratio-guide", "/fixed-cost-checklist", "/subscription-cleanup", "/card-spending-threshold", "/shared-living-cost-rules", "/accountbook-habit"];
const allPaths = [...paths, ...articlePaths];
const origin = "https://malhaebook.com";
const get = (path, method = "GET", env = {}, headers = {}) => app.fetch(new Request(`${origin}${path}`, { method, headers }), env, {});
const originalFetch = globalThis.fetch;
let outbound = 0;
globalThis.fetch = async () => { outbound++; throw new Error("Public content must not contact a data service"); };

try {
  const pages = new Map();
  const assets = new Set();
  const titles = new Set(), descriptions = new Set();
  for (const path of paths) {
    const response = await get(path);
    eq(response.status, 200, `${path}: anonymous GET succeeds`);
    eq(response.headers.get("set-cookie"), null, `${path}: no cookie`);
    eq(response.headers.get("x-robots-tag"), "index, follow", `${path}: public guide explicitly allows indexing`);
    ok(response.headers.get("cache-control").includes("public"), `${path}: publicly cacheable`);
    const html = await response.text();
    pages.set(path, html);
    eq((html.match(/<h1>/g) || []).length, 1, `${path}: one main heading`);
    eq((html.match(/<meta name="google-adsense-account"/g) || []).length, 1, `${path}: one ownership meta`);
    ok(!/adsbygoogle|googlesyndication|doubleclick|__gads/.test(html), `${path}: no ad runtime`);
    ok(!/\?{3}|\uFFFD/.test(html), `${path}: no broken text encoding`);
    ok(html.includes(`rel="canonical" href="${origin}${path}"`), `${path}: canonical is the canonical route`);
    const title = html.match(/<title>([^<]+)<\/title>/)[1];
    const description = html.match(/name="description" content="([^"]+)"/)[1];
    ok(!titles.has(title) && !descriptions.has(description), `${path}: distinct title and description`);
    titles.add(title); descriptions.add(description);
    const structured = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
    eq(structured.url, `${origin}${path}`, `${path}: structured canonical`);
    eq(structured.dateModified, html.match(/<time datetime="([^"]+)"/)[1], `${path}: visible and structured modified date agree`);
    if (structured["@type"] === "Article") ok(structured.author?.url === `${origin}/about`, `${path}: accountable article author`);
    const head = await get(path, "HEAD");
    eq(head.status, 200, `${path}: HEAD succeeds`);
    eq(await head.text(), "", `${path}: HEAD is bodyless`);
    eq(head.headers.get("content-type"), response.headers.get("content-type"), `${path}: HEAD type matches GET`);
    eq(head.headers.get("cache-control"), response.headers.get("cache-control"), `${path}: HEAD cache matches GET`);
    eq(head.headers.get("set-cookie"), null, `${path}: HEAD creates no cookie`);
    eq(head.headers.get("x-robots-tag"), response.headers.get("x-robots-tag"), `${path}: HEAD indexing matches GET`);
    for (const [, href] of html.matchAll(/href="([^"]+)"/g)) {
      if (href.startsWith("#")) ok(html.includes(`id="${href.slice(1)}"`), `${path}: anchor ${href} exists`);
      else if (href.startsWith("/assets/") || href === "/manifest.json") assets.add(href);
      else if (href.startsWith("/")) ok(allPaths.includes(href) || ["/my", "/sitemap.xml"].includes(href), `${path}: internal link ${href} has a supported destination`);
    }
    for (const [, src] of html.matchAll(/src="(\/assets\/[^\"]+)"/g)) assets.add(src);
  }
  for (const asset of assets) eq((await get(asset)).status, 200, `shared asset ${asset} is available`);
  for (const [alias, canonical] of [["/sitemap", "/site-map"], ["/service", "/service-guide"], ["/usage-guide", "/how-it-works"], ["/kakao-accountbook-guide", "/kakao-guide"], ["/budget-management-guide", "/budget-guide"], ["/family-accountbook", "/group-accountbook"], ["/data-security", "/security"], ["/about-service", "/about"], ["/support", "/contact"], ["/cookie-policy", "/cookies"], ["/data-policy", "/privacy"], ["/service-policy", "/terms"]]) {
    for (const method of ["GET", "HEAD"]) {
      const response = await get(`${alias}?utm_source=guide`, method);
      eq(response.status, 308, `${alias}: ${method} permanent consolidation`);
      eq(response.headers.get("location"), `${origin}${canonical}?utm_source=guide`, `${alias}: fixed target preserves query`);
      eq(await response.text(), "", `${alias}: no duplicated body`);
      eq(response.headers.get("set-cookie"), null, `${alias}: no cookie`);
    }
  }
  const slash = await get("/budget-guide/");
  eq(slash.status, 308, "known public trailing slash consolidates");
  eq(slash.headers.get("location"), `${origin}/budget-guide`, "trailing slash target");
  const unknown = await get("/not-a-public-guide");
  eq(unknown.status, 404, "unknown public path does not silently render home");
  for (const path of ["/my", "/openbuilder-guide", "/brand-kit", "/kakao-commands", "/backup-safety", "/household-flow", "/start-guide", "/beta-start"]) {
    const internal = await get(path);
    eq(internal.status, 200, `${path}: existing utility screen remains available`);
    eq(internal.headers.get("x-robots-tag"), "noindex, nofollow", `${path}: utility screen is not an indexed public article`);
  }
  const sitemapResponse = await get("/sitemap.xml");
  const xml = await sitemapResponse.text();
  const locations = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  eq(new Set(locations).size, allPaths.length, "sitemap contains each public canonical once");
  for (const path of allPaths) {
    ok(locations.includes(`${origin}${path}`), `${path}: discoverable in XML sitemap`);
    if (path !== "/site-map") ok(pages.get("/site-map").includes(`href="${path}"`), `${path}: discoverable in visible sitemap`);
  }
  // V22.9.40 (D): 고친 페이지는 수정일이 2026-10-11 뒤로 간다. 정확한 날짜 대조는 페이지별 검사(구조화 데이터·표시 날짜)가 맡는다.
  const lastmods = [...xml.matchAll(/<lastmod>(\d{4}-\d{2}-\d{2})<\/lastmod>/g)].map((m) => m[1]);
  eq(lastmods.length, allPaths.length, "every sitemap entry carries a modification date");
  ok(lastmods.every((date) => date >= "2026-10-11"), "sitemap tracks this content revision instead of stale July date");
  for (const path of ["/robots.txt", "/sitemap.xml", "/sitemap.xsl", "/ads.txt"]) {
    const head = await get(path, "HEAD");
    eq(head.status, 200, `${path}: document HEAD supported`);
    eq(await head.text(), "", `${path}: document HEAD bodyless`);
  }
  const robots = await (await get("/robots.txt")).text();
  ok(robots.includes("Allow: /") && robots.includes("Disallow: /my") && robots.includes("Disallow: /app"), "public crawling does not open private pages");
  ok(pages.get("/how-it-works").includes("웹 로그인 없이") && pages.get("/how-it-works").includes("첫 기록"), "personal chat-first remains documented");
  ok(pages.get("/how-it-works").includes("공동 가계부를 준비") && pages.get("/group-accountbook").includes("자동으로 다시 만들지 않으며"), "group creation and lifecycle restrictions both documented");
  ok(pages.get("/kakao-guide").includes("지출 기록") && pages.get("/kakao-guide").includes("식비 예산 50만원"), "record versus budget distinction is explicit");
  ok(!pages.get("/kakao-guide").includes("지출 기록과 예산 설정 중 하나를 선택"), "obsolete ambiguous-category claim removed");
  ok(pages.get("/import-guide").includes("이 단계에서는 거래를 저장하지 않습니다") && pages.get("/import-guide").includes("계정 로그인 정보·참여 권한·예산"), "import preview and limited backup scope explained");
  ok(pages.get("/privacy").includes("거래 입력 원문") && pages.get("/privacy").includes("임시 메모리"), "privacy separates transaction text and error samples");
  ok(!pages.get("/privacy").includes("최대 14일"), "privacy does not promise a false retention cap");
  const retention = await (await get("/privacy", "GET", { NLU_PERSIST_FAILURE_SAMPLES: "1", NLU_STORE_REDACTED_TEXT: "1", NLU_FAILURE_RETENTION_DAYS: "30" })).text();
  ok(retention.includes("30일") && retention.includes("마스킹한 일부 문장을 포함"), "retention disclosure reflects configuration without exposing secrets");
  eq(JSON.parse(pages.get("/contact").match(/application\/ld\+json">([\s\S]*?)<\/script>/)[1])["@type"], "ContactPage", "contact is not a fabricated article");
  const customContact = await (await get("/contact", "GET", { PUBLIC_SUPPORT_EMAIL: "support@example.com" })).text();
  ok(customContact.includes('href="mailto:support@example.com"'), "configured support address is actionable");
  const demo = pages.get("/demo");
  ok(demo.includes("가상 데이터") && demo.includes("서버로 보내거나 브라우저에 보관하지 않습니다"), "demo provenance and data boundary visible");
  ok(demo.includes('id="public-demo-form" hidden') && demo.includes("<noscript>"), "no-JS users see complete static results, no dead form");
  ok(!/src="https?:|fetch\(|localStorage|sessionStorage|document\.cookie/.test(demo), "demo has no remote scripts, data fetches or storage");
  const code = stripBuildBlocks(readFileSync(new URL("../src/modules/public/guide-content.js", import.meta.url), "utf8"));
  const { publicDemoRows: rows, publicDemoSummary: summary, publicDemoClient: client } = vm.runInNewContext(`${code}\n;({publicDemoRows, publicDemoSummary, publicDemoClient});`);
  const values = summary(rows(), 300000, 100000);
  for (const [key, value] of Object.entries({ total: 255000, budget: 400000, covered: 225000, uncovered: 30000, remaining: 175000, over: 0, rate: 56 })) eq(values[key], value, `worked example ${key}`);
  for (const [food, transport] of [[300000, 100000], [100000, 50000], [300000, 0], [0, 100000], [1, 1], [1000000000, 1000000000]]) {
    const example = summary(rows(), food, transport);
    const actual = budgetSummary(rows().map((row) => ({ ...row, type: "expense" })), [{ category: "식비", amount: food }, { category: "교통", amount: transport }]);
    for (const [demoKey, actualKey] of [["budget", "totalBudget"], ["covered", "budgetedExpense"], ["uncovered", "uncoveredExpense"], ["remaining", "remaining"], ["rate", "rate"]]) eq(example[demoKey], actual[actualKey], `demo agrees with app budget rules ${food}/${transport}: ${demoKey}`);
  }
  eq(summary(rows(), 0, 0).rate, null, "zero budgets render unset rather than misleading 0% success");
  const settlement = buildSettlementModel(
    [{ type: "expense", user_id: "a", amount: 90000 }, { type: "expense", user_id: "b", amount: 30000 }],
    [{ user_id: "a", role: "owner", nickname: "가" }, { user_id: "b", role: "member", nickname: "나" }, { user_id: "c", role: "member", nickname: "다" }],
    { mode: "equal" },
  );
  eq(settlement.totalExpense, 120000, "published settlement total agrees with actual model");
  eq(settlement.participantCount, 3, "unpaid participant is included in the example");
  eq(settlement.share, 40000, "published equal share agrees with actual model");
  eq(settlement.people.find((person) => person.user_id === "a").balance, 50000, "published recipient balance agrees with actual model");
  eq(JSON.stringify(settlement.transfers.slice().sort((a, b) => a.amount - b.amount)), JSON.stringify([{ from: "나", to: "가", amount: 10000 }, { from: "다", to: "가", amount: 40000 }]), "published transfer amounts and directions agree with actual model");
  eq((255000 - 300000) / 300000 * 100, -15, "report compares equal periods with correct percentage");
  // Run the shipped browser controller against a small DOM, including invalid inputs.
  const elements = new Map();
  for (const id of ["public-demo-form", "demo-food", "demo-transport", "demo-status", "demo-reset", "demo-total", "demo-budget", "demo-covered", "demo-uncovered", "demo-remaining", "demo-over", "demo-rate"]) elements.set(id, { value: id === "demo-food" ? "300,000" : "100,000", textContent: "", handlers: new Map(), attrs: new Map(), hidden: true, addEventListener(type, fn) { this.handlers.set(type, fn); }, setAttribute(key, value) { this.attrs.set(key, value); }, focus() { this.focused = true; } });
  vm.runInNewContext(`(${client.toString()})(${summary.toString()},${JSON.stringify(rows())});`, { document: { getElementById: (id) => elements.get(id) } });
  const submit = () => elements.get("public-demo-form").handlers.get("submit")({ preventDefault() {} });
  submit(); eq(elements.get("demo-remaining").textContent, "175,000원", "client initial arithmetic");
  for (const bad of ["-1", "1e3", "0x10", "Infinity", "1.2", "1,00", "", "1000000001"]) {
    elements.get("demo-food").value = bad; submit();
    eq(elements.get("demo-food").attrs.get("aria-invalid"), "true", `invalid amount ${bad} rejected`);
    eq(elements.get("demo-remaining").textContent, "175,000원", `invalid amount ${bad} preserves prior results`);
  }
  elements.get("demo-food").value = "100000"; elements.get("demo-transport").value = "50000"; submit();
  eq(elements.get("demo-over").textContent, "75,000원", "client overspend displayed separately");
  elements.get("demo-reset").handlers.get("click")();
  eq(elements.get("demo-remaining").textContent, "175,000원", "client reset restores example");
  const brokenConfig = { PUBLIC_SUPPORT_EMAIL: { toString() { throw new Error("synthetic-public-render-failure"); } } };
  const failure = await get("/guides", "GET", brokenConfig);
  eq(failure.status, 500, "public dispatcher rejection is caught by router");
  ok((await failure.text()).includes("안전모드"), "public rendering failure becomes a safe HTML response");
  eq(failure.headers.get("x-robots-tag"), "noindex, nofollow", "public rendering failure is not indexed");
  eq(outbound, 0, "all anonymous public requests made zero outbound calls");
  console.log(`Public guides remediation: ${checks} checks passed`);
} finally { globalThis.fetch = originalFetch; }
