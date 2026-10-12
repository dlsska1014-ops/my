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
const AD_LOADER = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-3546469870344416";
const AD_FREE_PATHS = ["/my", "/privacy", "/terms", "/cookies", "/contact", "/about", "/site-map"];
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
    check((r.headers.get("etag") || "").replace(/^W\//, "") === '"ab-manifest-v22920"', "manifest ETag");
    const data = await r.json();
    check(data.name === "말해 가계부", "manifest brand name");
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
      // Sequential on purpose: the task batches below already keep four requests in flight.
      for (const path of AD_FREE_PATHS) {
        const page = await request(path);
        check(page.status === 200 && adLoaderCount(await page.text()) === 0, `live: ${path} has no ad loader`);
      }
    } else {
      if (adsMode !== "review") check(false, `ready reports ads_mode review or live (got ${JSON.stringify(adsMode)})`);
      check(!html.includes("adsbygoogle.js"), "ad runtime remains disabled during review");
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
