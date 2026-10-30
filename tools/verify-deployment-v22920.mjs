// 공개 GET 경로만 점검한다. 사용자 기록이나 운영 설정은 변경하지 않는다.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import app from "../src/index.js";
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const args = process.argv.slice(2);
function option(name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  if (!args[index + 1] || args[index + 1].startsWith("--")) throw new Error(`${name} requires a value`);
  return args[index + 1];
}
function origin(value) {
  const url = new URL(value);
  if (url.protocol !== "https:" || url.pathname !== "/" || url.search || url.hash || url.username || url.password) {
    throw new Error("Expected an HTTPS origin without credentials, path, query or fragment");
  }
  return url.origin;
}
const base = origin(option("--origin", "https://malhaebook.com"));
const legacyValue = option("--legacy-origin", "");
const legacy = legacyValue ? origin(legacyValue) : "";
const version = option("--version", readFileSync(new URL("../VERSION.txt", import.meta.url), "utf8").trim());
let checks = 0;
let failures = 0;
function check(value, label) {
  checks += 1;
  if (!value) { failures += 1; console.error(`FAIL: ${label}`); }
}
async function request(path, method = "GET", requestBase = base) {
  return fetch(`${requestBase}${path}`, {
    method, redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { "user-agent": `MalhaebookReleaseCheck/${version}`, accept: "*/*" },
  });
}
// V22.9.40: the ad gate (ADS_MODE) is reported by /ready as ads_mode ("review" | "live"). /ready is read once
// and shared by the readiness and AdSense checks. A missing field means a release from before the gate, which
// is review mode. Review: no ad runtime anywhere (as before). Live: the public guides (/ included, it is in
// AD_PAGE_KEYS) carry exactly one fixed-publisher loader; the login and policy/identity pages carry none.
// V22.9.92: ads_mode may also be "adfit" (Kakao AdFit), and then /ready adds adfit_unit ("ok" | "missing"). AdFit:
// the public guides carry exactly one AdFit slot and the SDK, no Google ad code; the same pages stay ad-free. Pre-merge review:
// AdFit pages also widen font-src/media-src (creative frames inherit the CSP), swap prerender for prefetch, and /privacy·/faq
// name Kakao with the opt-out page; review and live pages carry no AdFit code.
const AD_LOADER = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3546469870344416";
const AD_FREE_PATHS = ["/my", "/privacy", "/terms", "/cookies", "/contact", "/about", "/site-map"];
const ADFIT_SDK = "https://t1.kakaocdn.net/kas/static/ba.min.js";
function adfitSlotCount(html) {
  return html.split('class="kakao_ad_area"').length - 1;
}
let readyResult;
function readReady() {
  readyResult ??= request("/ready").then(async (r) => ({ status: r.status, data: await r.json() }));
  return readyResult;
}
function adLoaderCount(html) {
  return html.split("adsbygoogle.js").length - 1;
}
const tasks = [
  ["health", async () => {
    const r = await request("/health");
    check(r.status === 200, "health HTTP 200");
    const data = await r.json();
    check(data.alive === true && data.version === version, "health alive and current version");
    check(data.missing_count === 0, "health required configuration present");
  }],
  ["ready", async () => {
    const { status, data } = await readReady();
    check(status === 200, "ready HTTP 200");
    check(data.ready === true, "required database readiness");
  }],
  ["manifest", async () => {
    const r = await request("/manifest.json");
    check(r.status === 200, "manifest HTTP 200");
    // V22.9.87 T-21: 매니페스트 이름을 ‘말해가계부’로 붙여 쓰며 ETag 를 v22987 로 올렸다. 이 판부터 배포 확인은 새 값을 본다.
    check((r.headers.get("etag") || "").replace(/^W\//, "") === '"ab-manifest-v22987"', "manifest ETag");
    const data = await r.json();
    check(data.name === "말해가계부", "manifest brand name");
  }],
  ["AdSense owner", async () => {
    const r = await request("/ads.txt");
    check(r.status === 200, "ads.txt HTTP 200");
    check((r.headers.get("content-type") || "").includes("text/plain"), "ads.txt content type");
    check((await r.text()).trim() === "google.com, pub-3546469870344416, DIRECT, f08c47fec0942fa0", "ads.txt matches the connected publisher");
    const html = await (await request("/")).text();
    check(html.includes('<meta name="google-adsense-account" content="ca-pub-3546469870344416"/>'), "public ownership metadata matches the connected publisher");
    const adsMode = (await readReady()).data?.ads_mode ?? "review";
    if (adsMode === "live") {
      check(adLoaderCount(html) === 1 && html.includes(AD_LOADER), "live: / has exactly one fixed-publisher ad loader");
      const guide = await (await request("/budget-guide")).text();
      check(adLoaderCount(guide) === 1 && guide.includes(AD_LOADER), "live: /budget-guide has exactly one fixed-publisher ad loader");
      check(adfitSlotCount(html) + adfitSlotCount(guide) === 0 && !html.includes(ADFIT_SDK) && !guide.includes(ADFIT_SDK), "live: / and /budget-guide carry no AdFit code");
      // Sequential on purpose: the task batches below already keep four requests in flight.
      for (const path of AD_FREE_PATHS) {
        const page = await request(path);
        check(page.status === 200 && adLoaderCount(await page.text()) === 0, `live: ${path} has no ad loader`);
      }
    } else if (adsMode === "adfit") {
      const unit = (await readReady()).data?.adfit_unit;
      check(unit === "ok", `adfit: ready reports adfit_unit ok (got ${JSON.stringify(unit)})`);
      const guideResponse = await request("/budget-guide");
      const guide = await guideResponse.text();
      const csp = guideResponse.headers.get("content-security-policy") || "";
      check(csp.includes("font-src 'self' data: https:") && csp.includes("media-src 'self' https: blob:") && csp.includes("frame-src 'self' https:"), "adfit: /budget-guide CSP lets the creative frames load fonts, media and frames");
      check(guide.includes('<script type="speculationrules">{"prefetch":') && !guide.includes('{"prerender":'), "adfit: /budget-guide prefetches instead of prerendering");
      for (const [path, page] of [["/", html], ["/budget-guide", guide]]) {
        check(adfitSlotCount(page) === 1 && page.split(ADFIT_SDK).length - 1 === 1 && adLoaderCount(page) === 0, `adfit: ${path} has exactly one AdFit slot and SDK and no Google ad loader`);
      }
      for (const path of AD_FREE_PATHS) {
        const page = await request(path);
        const text = await page.text();
        check(page.status === 200 && adfitSlotCount(text) === 0 && !text.includes(ADFIT_SDK) && adLoaderCount(text) === 0, `adfit: ${path} has no ad code`);
        if (path === "/privacy") check(text.includes("카카오 애드핏 광고를 표시합니다") && text.includes('href="https://info.ds.kakao.com/optout.do"'), "adfit: /privacy names Kakao AdFit and links the opt-out page");
      }
      const faq = await (await request("/faq")).text();
      check(faq.includes("카카오 애드핏 광고를 표시하며") && faq.includes("https://info.ds.kakao.com/optout.do"), "adfit: /faq names Kakao AdFit and the opt-out page");
    } else {
      if (adsMode !== "review") check(false, `ready reports ads_mode review, live or adfit (got ${JSON.stringify(adsMode)})`);
      check(!html.includes("adsbygoogle.js"), "ad runtime remains disabled during review");
      check(adfitSlotCount(html) === 0 && !html.includes(ADFIT_SDK), "review: / carries no AdFit code");
    }
  }],
  ["kakao login", async () => {
    const r = await request("/auth/kakao/start");
    check(r.status === 303, "Kakao login configuration ready");
    const location = r.headers.get("location");
    if (!location) return check(false, "Kakao authorization location present");
    const url = new URL(location);
    check(url.origin === "https://kauth.kakao.com", "Kakao authorization host");
    check(url.searchParams.get("redirect_uri") === `${base}/auth/kakao/callback`, "Kakao callback uses new origin");
  }],
];
for (const path of ["/", "/about", "/privacy", "/terms", "/my"]) {
  tasks.push([path, async () => {
    const r = await request(path);
    check(r.status === 200, `${path} HTTP 200`);
    const html = await r.text();
    check(html.includes("말해가계부") || html.includes("말해 가계부"), `${path} new brand`);
    check(!html.includes("똑똑한가계부"), `${path} old brand absent`);
    if (path === "/my") check((r.headers.get("cache-control") || "").includes("no-store"), "login no-store");
  }]);
}
const assetPaths = [...new Set([...source.matchAll(/const \w+_ASSET_PATH = "(\/assets\/[^"\n]+)";/g)].map((match) => match[1]))];
if (assetPaths.length === 0) throw new Error("No current asset paths found in the release source");
for (const path of assetPaths) {
  tasks.push([path, async () => {
    const r = await request(path);
    check(r.status === 200, `${path} HTTP 200`);
    check((r.headers.get("cache-control") || "").includes("immutable"), `${path} immutable cache`);
    check((r.headers.get("content-type") || "").includes(path.endsWith(".css") ? "text/css" : "javascript"), `${path} content type`);
    const expected = await app.fetch(new Request(`${base}${path}`), {}, {});
    check(expected.status === 200, `${path} local release asset available`);
    const digest = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    check(digest(await r.arrayBuffer()) === digest(await expected.arrayBuffer()), `${path} matches the local release bytes`);
  }]);
}
// V22.9.87 T-22: 공유 미리보기 이미지(og:image)는 PNG 라 위 CSS·JS 자산 확인과 따로 본다(1년 캐시·image/png·로컬 바이트와 같음).
const ogImagePath = (source.match(/const AB_OG_IMAGE_PATH = "(\/assets\/[^"\n]+\.png)";/) || [])[1];
if (ogImagePath) {
  tasks.push([ogImagePath, async () => {
    const r = await request(ogImagePath);
    check(r.status === 200, `${ogImagePath} HTTP 200`);
    check((r.headers.get("cache-control") || "").includes("immutable"), `${ogImagePath} immutable cache`);
    check((r.headers.get("content-type") || "").startsWith("image/png"), `${ogImagePath} content type`);
    const expected = await app.fetch(new Request(`${base}${ogImagePath}`), {}, {});
    const digest = (bytes) => createHash("sha256").update(Buffer.from(bytes)).digest("hex");
    check(digest(await r.arrayBuffer()) === digest(await expected.arrayBuffer()), `${ogImagePath} matches the local release bytes`);
  }]);
}
if (legacy) {
  tasks.push(["legacy redirect", async () => {
    const path = "/my?month=2026-10";
    const r = await request(path, "GET", legacy);
    check(r.status === 308, "legacy GET HTTP 308");
    check(r.headers.get("location") === `${base}${path}`, "legacy path and query preserved");
    const health = await request("/health", "GET", legacy);
    check(health.status === 200, "legacy health remains accessible");
    check((await health.json()).version === version, "legacy domain uses the current Worker");
  }]);
}
// Limit public verification to four concurrent requests.
for (let index = 0; index < tasks.length; index += 4) {
  await Promise.all(tasks.slice(index, index + 4).map(async ([label, run]) => {
    try { await run(); }
    catch (error) { check(false, `${label}: ${error.cause?.code || error.name}`); }
  }));
}
console.log(`Deployment check: ${checks - failures}/${checks} passed; ${failures} failed.`);
console.log("Manual checks remain: OAuth callback, existing account data, OpenBuilder POST, device UX, external site registration.");
process.exitCode = failures ? 1 : 0;
