import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let passed = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  passed += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  passed += 1;
}

const fixture = await createV2265QaFixture();
const fixtureFetch = globalThis.fetch;
let calls = [];
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "mock.supabase.co") calls.push(url.pathname + url.search);
  return fixtureFetch(input, init);
};

function request(path, options = {}) {
  calls = [];
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method: options.method || "GET",
    headers: {
      cookie: fixture.cookie,
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ...(options.headers || {}),
    },
  }), fixture.env, {});
}

try {
  const entry = await request("/my");
  eq(entry.status, 303, "personal entry redirects directly to the selected accountbook");
  ok(calls.length <= 4, "personal entry uses at most four database calls");
  ok(calls.some((path) => path.includes("/households?id=in.")), "accountbooks are fetched in one bulk query");
  ok(!calls.some((path) => path.includes("/households?id=eq.")), "personal entry avoids per-accountbook lookup queries");

  const home = await request("/app?month=2026-07&household_id=house-home");
  eq(home.status, 200, "optimized personal home renders");
  const homeHtml = await home.text();
  const homeBytes = Buffer.byteLength(homeHtml);
  ok(homeBytes < 35000, `personal home HTML stays below 35KB (${homeBytes} bytes)`);
  ok(homeHtml.includes('href="/assets/mobile-home-v22810.css"'), "personal home loads the versioned shared stylesheet");
  ok(homeHtml.includes('src="/assets/mobile-home-v22810.js"'), "personal home loads the versioned shared runtime");
  ok(!homeHtml.includes('id="v2281GuidedUiUxStyle"'), "large shared style is not repeated inline");
  ok(!homeHtml.includes("parseKoreanAmount(text)"), "large smart-input runtime is not repeated inline");
  ok(homeHtml.includes("우리집 생활비"), "optimized home preserves selected accountbook data");
  ok(homeHtml.includes("3,200,000"), "optimized home preserves monthly amount rendering");
  ok(calls.length <= 9, `personal home uses at most nine database calls (${calls.length})`);
  eq(calls.filter((path) => path.includes("/accountbook_settings?")).length, 1, "home settings are fetched in one combined query");
  ok(calls.some((path) => path.includes("/users?id=in.")), "member profiles are fetched in one bulk query");
  ok(!calls.some((path) => /\/users\?id=eq\.(?:user-bin|user-wifi)/.test(path)), "home avoids per-member profile queries");
  ok(!calls.some((path) => /[?&]offset=(?!0(?:&|$))/.test(decodeURIComponent(path))), "short transaction lists stop without an empty pagination probe");

  const cssResponse = await request("/assets/mobile-home-v22810.css");
  eq(cssResponse.status, 200, "shared home stylesheet is served");
  const css = await cssResponse.text();
  ok(cssResponse.headers.get("cache-control")?.includes("immutable"), "shared stylesheet has immutable browser caching");
  ok(cssResponse.headers.get("content-type")?.startsWith("text/css"), "shared stylesheet has the correct content type");
  ok(css.includes(".homeBudget") && css.includes(".abMobileAppSurface"), "shared stylesheet contains mobile-home and guided styles");
  eq(calls.length, 0, "shared stylesheet requires no database access");

  const jsResponse = await request("/assets/mobile-home-v22810.js");
  eq(jsResponse.status, 200, "shared home runtime is served");
  const runtime = await jsResponse.text();
  ok(jsResponse.headers.get("cache-control")?.includes("immutable"), "shared runtime has immutable browser caching");
  ok(jsResponse.headers.get("content-type")?.startsWith("text/javascript"), "shared runtime has the correct content type");
  ok(runtime.includes("parseKoreanAmount") && runtime.includes("guidedUiUxClientMain"), "shared runtime preserves smart input and action feedback");
  eq(calls.length, 0, "shared runtime requires no database access");

  const assetHead = await request("/assets/mobile-home-v22810.js", { method: "HEAD" });
  eq(assetHead.status, 200, "shared runtime supports HEAD requests");
  eq((await assetHead.text()).length, 0, "HEAD response has no body");

  const households = await request("/my/households?household_id=house-home");
  eq(households.status, 200, "accountbook management remains available");
  const householdsHtml = await households.text();
  ok(householdsHtml.includes("가계부 전환·관리"), "accountbook management content is preserved");
  ok(calls.some((path) => path.includes("/users?id=in.")), "accountbook management also bulk-loads member profiles");

  console.log(`smoke_home_performance_cleanup: ${passed} checks passed`);
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}
