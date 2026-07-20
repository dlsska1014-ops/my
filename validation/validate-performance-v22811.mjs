import { createHash } from "node:crypto";
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
      cookie: Object.prototype.hasOwnProperty.call(options, "cookie") ? options.cookie : options.public ? "" : fixture.cookie,
      "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
      ...(options.headers || {}),
    },
  }), fixture.env, {});
}

function countOf(source, text) {
  return String(source || "").split(text).length - 1;
}

function exerciseHomeNavState(runtime) {
  function link(href, active = false) {
    const attributes = new Map([["href", href]]);
    const classes = new Set(active ? ["active"] : []);
    const listeners = new Map();
    return {
      classList: {
        contains(name) { return classes.has(name); },
        toggle(name, force) { force ? classes.add(name) : classes.delete(name); },
      },
      getAttribute(name) { return attributes.get(name) || null; },
      setAttribute(name, value) { attributes.set(name, String(value)); },
      removeAttribute(name) { attributes.delete(name); },
      addEventListener(type, listener) { listeners.set(type, listener); },
      fire(type) { listeners.get(type)?.(); },
    };
  }
  const mobile = ["#top", "#feed", "#add", "/settlement-summary", "/menu"].map((href, index) => link(href, index === 0));
  const desktop = ["#top", "#feed", "#add", "/settlement-summary", "/my/analysis", "/budgets", "/menu"].map((href, index) => link(href, index === 0));
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const media = { matches: false, addEventListener(type, listener) { mediaListeners.set(type, listener); } };
  const windowStub = {
    location: { hash: "" },
    matchMedia() { return media; },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    requestAnimationFrame(listener) { listener(); },
  };
  const documentStub = {
    querySelectorAll(selector) {
      if (selector === ".bottom a.tab") return mobile;
      if (selector === ".homeDesktopNav nav a") return desktop;
      return [];
    },
  };
  new Function("document", "window", runtime)(documentStub, windowStub);
  const all = mobile.concat(desktop);
  const currentCount = () => all.filter((item) => item.getAttribute("aria-current")).length;
  if (currentCount() !== 1 || mobile[0].getAttribute("aria-current") !== "location") return false;
  media.matches = true;
  mediaListeners.get("change")?.();
  desktop[1].fire("click");
  if (currentCount() !== 1 || desktop[1].getAttribute("aria-current") !== "location") return false;
  windowStub.location.hash = "#add";
  windowListeners.get("hashchange")?.();
  return currentCount() === 1 && desktop[2].getAttribute("aria-current") === "location";
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
  const externalScripts = Array.from(homeHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi), (match) => match[1]);
  ok(homeBytes < 35000, `personal home HTML stays below 35KB (${homeBytes} bytes)`);
  eq(countOf(homeHtml, 'href="/assets/mobile-home-v22810.css"'), 1, "home loads the byte-preserved base stylesheet once");
  eq(countOf(homeHtml, 'href="/assets/accountbook-shell-v22811.css"'), 1, "home loads the V22.8.11 shell stylesheet once");
  ok(externalScripts.length === 1 && externalScripts[0] === "/assets/mobile-home-shell-v22811.js", "home loads one V22.8.11 external runtime");
  ok(!homeHtml.includes("mobile-home-v22810-home-shell"), "unreleased first-pass asset path is absent");
  ok(homeHtml.includes('class="abV2281 abMobileAppSurface abV22811Shell"'), "home opts into the scoped V22.8.11 shell");
  ok(homeHtml.includes('class="homeDesktopNav"') && homeHtml.includes('aria-label="모바일 주요 메뉴"'), "home exposes desktop and mobile navigation landmarks");
  ok(homeHtml.includes("/settlement-summary?month=2026-07&household_id=house-home"), "home navigation preserves month and accountbook context");
  ok(homeHtml.includes("우리집 생활비") && homeHtml.includes("3,200,000"), "home preserves selected accountbook data and amounts");
  ok(!homeHtml.includes('id="v2281GuidedUiUxStyle"') && !homeHtml.includes("parseKoreanAmount(text)"), "large shared CSS and runtime are not repeated inline");
  ok(calls.length <= 9, `personal home uses at most nine database calls (${calls.length})`);
  eq(calls.filter((path) => path.includes("/accountbook_settings?")).length, 1, "home settings are fetched once");
  ok(calls.some((path) => path.includes("/users?id=in.")), "member profiles are fetched in one bulk query");
  ok(!calls.some((path) => /[?&]offset=(?!0(?:&|$))/.test(decodeURIComponent(path))), "short lists stop without an empty pagination probe");
  ok(home.headers.get("cache-control")?.includes("no-store"), "personal home HTML remains no-store");

  const cssPaths = ["/assets/mobile-home-v22810.css", "/assets/accountbook-shell-v22811.css"];
  for (const path of cssPaths) {
    const get = await request(path);
    const bytes = Buffer.from(await get.arrayBuffer());
    const body = bytes.toString("utf8");
    const getDatabaseCalls = calls.length;
    const head = await request(path, { method: "HEAD" });
    const headBody = await head.text();
    const headDatabaseCalls = calls.length;
    eq(get.status, 200, `${path} GET succeeds`);
    ok(head.status === 200 && headBody.length === 0, `${path} HEAD succeeds without a body`);
    ok(get.headers.get("content-type")?.startsWith("text/css") && head.headers.get("content-type")?.startsWith("text/css"), `${path} uses CSS MIME for GET and HEAD`);
    ok(get.headers.get("cache-control")?.includes("immutable") && get.headers.get("etag") === head.headers.get("etag"), `${path} keeps immutable caching and matching ETags`);
    ok(body.length > 100, `${path} returns non-empty CSS`);
    eq(getDatabaseCalls, 0, `${path} GET requires no database access`);
    eq(headDatabaseCalls, 0, `${path} HEAD requires no database access`);
    if (path === "/assets/mobile-home-v22810.css") {
      eq(createHash("sha256").update(bytes).digest("hex"), "edfcdd9988dcf3200fd1eb78fc3ac129f4aa6c4ebd496b6e36455804923a9b36", "legacy home stylesheet bytes remain pinned");
    }
  }

  const legacyJs = await request("/assets/mobile-home-v22810.js");
  const legacyBytes = Buffer.from(await legacyJs.arrayBuffer());
  const legacyJsGetDatabaseCalls = calls.length;
  const legacyHead = await request("/assets/mobile-home-v22810.js", { method: "HEAD" });
  const legacyJsHeadDatabaseCalls = calls.length;
  eq(createHash("sha256").update(legacyBytes).digest("hex"), "caa780bdad0d317ae6446ddae87adfa4abd1bca682aa007dae55a06e658a509b", "legacy home runtime bytes remain pinned");
  eq(legacyJs.headers.get("etag"), '"mobile-home-v22810-js"', "legacy home runtime ETag remains pinned");
  ok(legacyHead.status === 200 && legacyHead.headers.get("etag") === legacyJs.headers.get("etag"), "legacy runtime HEAD preserves its ETag");
  eq(legacyJsGetDatabaseCalls, 0, "legacy runtime GET requires no database access");
  eq(legacyJsHeadDatabaseCalls, 0, "legacy runtime HEAD requires no database access");

  const shellJs = await request("/assets/mobile-home-shell-v22811.js");
  const shellRuntime = await shellJs.text();
  const shellJsGetDatabaseCalls = calls.length;
  const shellHead = await request("/assets/mobile-home-shell-v22811.js", { method: "HEAD" });
  const shellHeadBody = await shellHead.text();
  const shellJsHeadDatabaseCalls = calls.length;
  eq(shellJs.status, 200, "V22.8.11 home runtime GET succeeds");
  ok(shellHead.status === 200 && shellHeadBody.length === 0, "V22.8.11 home runtime HEAD succeeds without a body");
  ok(shellJs.headers.get("content-type")?.startsWith("text/javascript") && shellJs.headers.get("cache-control")?.includes("immutable"), "V22.8.11 runtime uses immutable JavaScript delivery");
  ok(shellJs.headers.get("etag") === shellHead.headers.get("etag"), "V22.8.11 runtime GET and HEAD ETags match");
  const navStart = shellRuntime.lastIndexOf("(function mobileHomeNavStateClientMain");
  ok(shellRuntime.includes("parseKoreanAmount") && navStart >= 0 && exerciseHomeNavState(shellRuntime.slice(navStart)), "new runtime preserves legacy behavior and synchronizes one current navigation item");
  eq(shellJsGetDatabaseCalls, 0, "V22.8.11 runtime GET requires no database access");
  eq(shellJsHeadDatabaseCalls, 0, "V22.8.11 runtime HEAD requires no database access");

  const oldShellCss = await request("/assets/mobile-home-v22810-home-shell.css");
  const oldShellJs = await request("/assets/mobile-home-v22810-home-shell.js");
  ok(oldShellCss.status === 404 && oldShellJs.status === 404, "unreleased first-pass assets are not served");

  const shellCssResponse = await request("/assets/accountbook-shell-v22811.css");
  const shellCss = await shellCssResponse.text();
  ok(shellCss.includes("body.abV22811Shell") && shellCss.includes("--ab11-accent:#3182f6") && shellCss.includes("--abNavW:238px"), "shared shell is body-scoped and carries the approved tokens");
  ok(shellCss.includes("prefers-reduced-motion") && shellCss.includes("focus-visible") && shellCss.includes("font-size:16px"), "shared shell includes motion, focus, and mobile input safeguards");
  ok(shellCss.includes("--ab11-action:#2563eb") && shellCss.includes("background:var(--ab11-action)!important;color:#fff!important"), "white-text form actions use the contrast-safe action token");
  ok(shellCss.includes("body.abV22811Shell.abAppSurface .abLayoutNav{width:238px!important}") && shellCss.includes("body.abV22811Shell.abAppSurface{padding-left:238px!important}"), "unified desktop navigation and body offset share the enforced 238px width");
  ok(shellCss.includes("body.abV22811Shell.abAppSurface.abNavCollapsed{padding-left:var(--abNavCollapsed)!important}") && shellCss.includes("body.abV22811Shell.abAppSurface.abNavCollapsed .abLayoutNav{width:var(--abNavCollapsed)!important}"), "collapsed unified navigation keeps its existing compact width contract");

  const households = await request("/my/households?month=2026-07&household_id=house-home");
  const householdsHtml = await households.text();
  eq(households.status, 200, "accountbook management renders");
  eq(countOf(householdsHtml, 'href="/assets/accountbook-shell-v22811.css"'), 1, "accountbook management loads the shell once");
  ok(householdsHtml.includes("abV22811Shell") && householdsHtml.includes("가계부 전환·관리"), "management shell preserves the accountbook management surface");
  ok(householdsHtml.includes("month=2026-07") && householdsHtml.includes("household_id=house-home"), "management navigation preserves month and accountbook context");
  ok(householdsHtml.lastIndexOf('href="/assets/accountbook-shell-v22811.css"') > householdsHtml.lastIndexOf("</style>"), "accountbook shell is the final stylesheet cascade");

  const backup = await request("/my/backup-login?return_to=%2Fapp");
  const backupHtml = await backup.text();
  eq(countOf(backupHtml, 'href="/assets/accountbook-shell-v22811.css"'), 1, "account security loads the shell once");
  ok(backupHtml.includes('action="/my/backup-login"') && backupHtml.includes('name="access_code_confirm"'), "account security form action and confirmation field remain intact");

  const login = await request("/my", { public: true });
  const loginHtml = await login.text();
  eq(login.status, 200, "public login renders");
  eq(countOf(loginHtml, 'href="/assets/accountbook-shell-v22811.css"'), 1, "login loads the shell once");
  ok(loginHtml.includes('action="/my/local-login"') && loginHtml.includes('action="/my/local-signup"'), "login and signup form actions remain intact");

  const context = "month=2026-07&household_id=house-home";
  const userShellPaths = [
    `/menu?${context}`,
    `/budgets?${context}`,
    `/payment-methods?${context}`,
    `/reserve-plans?${context}`,
    `/settlement-summary?${context}`,
    `/smart-tools?${context}`,
    `/receipts?${context}`,
    `/my/households?${context}`,
    `/households?${context}`,
  ];
  for (const path of userShellPaths) {
    const response = await request(path);
    const html = await response.text();
    ok(response.status === 200 && countOf(html, 'href="/assets/accountbook-shell-v22811.css"') === 1 && html.includes("abV22811Shell") && html.includes('data-nav-scope="user"'), `${path} receives the user-scoped shell exactly once`);
  }

  fixture.env.ADMIN_SESSION_SECRET = "qa-admin-session-v22811";
  fixture.env.ADMIN_API_TOKEN = "qa-admin-api-v22811";
  const adminHeaders = { authorization: `Bearer ${fixture.env.ADMIN_API_TOKEN}` };
  const excludedShellPaths = [
    { path: "/?legacy=1", headers: adminHeaders },
    { path: "/admin-view", headers: adminHeaders },
    { path: `/households?${context}`, headers: adminHeaders, scope: "admin" },
    { path: `/identity-audit?${context}`, headers: adminHeaders, scope: "admin" },
    { path: "/settings", headers: adminHeaders, scope: "admin" },
    { path: "/deployment-check", headers: adminHeaders, scope: "ops" },
    { path: "/ui-polish-check", headers: adminHeaders, scope: "ops" },
    { path: "/final-release", headers: adminHeaders, scope: "ops" },
    { path: "/route-audit", headers: adminHeaders, scope: "ops" },
    { path: "/nav-audit", headers: adminHeaders, scope: "ops" },
    { path: "/ui-audit", headers: adminHeaders, scope: "ops" },
    { path: "/flow-audit", headers: adminHeaders, scope: "ops" },
    { path: "/filter-audit", headers: adminHeaders, scope: "ops" },
    { path: "/feature-map", headers: adminHeaders, scope: "ops" },
    { path: "/deploy-runbook", headers: adminHeaders, scope: "ops" },
    { path: "/release-check", headers: adminHeaders, scope: "ops" },
    { path: "/user-ready-check", headers: adminHeaders, scope: "ops" },
    { path: "/release-dry-run", headers: adminHeaders, scope: "ops" },
    { path: "/diagnostics", headers: adminHeaders, scope: "ops" },
    { path: "/operation-center", headers: adminHeaders, scope: "ops" },
    { path: "/ops-dashboard", headers: adminHeaders, scope: "ops" },
    { path: "/about", public: true },
  ];
  for (const item of excludedShellPaths) {
    const response = await request(item.path, { cookie: "", headers: item.headers, public: item.public });
    const html = await response.text();
    const hasExpectedScope = !item.scope || html.includes(`data-nav-scope="${item.scope}"`);
    ok(response.status === 200 && hasExpectedScope && !html.includes('data-nav-scope="user"') && !html.includes("accountbook-shell-v22811") && !html.includes("abV22811Shell"), `${item.path} stays outside the user shell${item.scope ? ` with ${item.scope} scope` : ""} (status=${response.status}, expectedScope=${hasExpectedScope}, userScope=${html.includes('data-nav-scope="user"')}, shellLink=${html.includes("accountbook-shell-v22811")}, shellClass=${html.includes("abV22811Shell")})`);
  }

  console.log(`smoke_home_ux_shell_expansion: ${passed} checks passed`);
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}
