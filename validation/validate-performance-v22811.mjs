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

function contrastRatio(foreground, background) {
  const luminance = (hex) => {
    const channels = String(hex).slice(1).match(/../g).map((value) => Number.parseInt(value, 16) / 255);
    const linear = channels.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const first = luminance(foreground);
  const second = luminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
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

function exerciseThemeRuntime(runtime) {
  function control(attributes = {}) {
    const values = new Map(Object.entries(attributes));
    const listeners = new Map();
    return {
      textContent: "",
      getAttribute(name) { return values.get(name) || null; },
      setAttribute(name, value) { values.set(name, String(value)); },
      addEventListener(type, listener) { listeners.set(type, listener); },
      fire(type) { listeners.get(type)?.(); },
    };
  }
  const root = control();
  root.style = {};
  const status = control();
  const meta = control();
  const themeButtons = ["system", "light", "dark"].map((value) => control({ "data-ab-theme-choice": value }));
  const toneButtons = ["blue", "emerald", "violet", "amber"].map((value) => control({ "data-ab-tone-choice": value }));
  const storage = new Map();
  const windowListeners = new Map();
  const mediaListeners = new Map();
  const media = {
    matches: false,
    addEventListener(type, listener) { mediaListeners.set(type, listener); },
  };
  const documentStub = {
    documentElement: root,
    readyState: "complete",
    querySelector(selector) { return selector === 'meta[name="theme-color"]' ? meta : null; },
    querySelectorAll(selector) {
      if (selector === "[data-ab-theme-choice]") return themeButtons;
      if (selector === "[data-ab-tone-choice]") return toneButtons;
      return [];
    },
    getElementById(id) { return id === "abAppearanceStatus" ? status : null; },
    addEventListener() {},
  };
  const windowStub = {
    localStorage: {
      getItem(key) { return storage.get(key) || null; },
      setItem(key, value) { storage.set(key, String(value)); },
    },
    matchMedia() { return media; },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
  };
  new Function("document", "window", runtime)(documentStub, windowStub);
  const defaultsWork = root.getAttribute("data-ab-theme") === "system"
    && root.getAttribute("data-ab-resolved-theme") === "light"
    && root.getAttribute("data-ab-tone") === "blue";
  themeButtons[2].fire("click");
  toneButtons[2].fire("click");
  const choicesPersist = storage.get("ab:appearance:theme") === "dark"
    && storage.get("ab:appearance:tone") === "violet"
    && root.getAttribute("data-ab-resolved-theme") === "dark"
    && root.getAttribute("data-ab-tone") === "violet"
    && themeButtons[2].getAttribute("aria-pressed") === "true"
    && toneButtons[2].getAttribute("aria-pressed") === "true";
  themeButtons[0].fire("click");
  media.matches = true;
  mediaListeners.get("change")?.();
  const systemSyncs = root.getAttribute("data-ab-theme") === "system"
    && root.getAttribute("data-ab-resolved-theme") === "dark";
  return defaultsWork && choicesPersist && systemSyncs && status.textContent.includes("시스템 설정");
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
  eq(countOf(homeHtml, 'href="/assets/accountbook-shell-v22813.css"'), 1, "home loads the V22.8.13 shell stylesheet once");
  ok(externalScripts.length === 2 && externalScripts.includes("/assets/accountbook-theme-v22812.js") && externalScripts.includes("/assets/mobile-home-shell-v22811.js"), "home loads the V22.8.12 theme runtime and preserved mobile runtime");
  ok(!homeHtml.includes("mobile-home-v22810-home-shell"), "unreleased first-pass asset path is absent");
  ok(homeHtml.includes('class="abV2281 abMobileAppSurface abV22812Shell"'), "home opts into the scoped V22.8.12 shell");
  ok(homeHtml.includes('class="homeDesktopNav"') && homeHtml.includes('aria-label="모바일 주요 메뉴"'), "home exposes desktop and mobile navigation landmarks");
  ok(homeHtml.includes("/settlement-summary?month=2026-07&household_id=house-home"), "home navigation preserves month and accountbook context");
  ok(homeHtml.includes("우리집 생활비") && homeHtml.includes("3,200,000"), "home preserves selected accountbook data and amounts");
  ok(!homeHtml.includes('id="v2281GuidedUiUxStyle"') && !homeHtml.includes("parseKoreanAmount(text)"), "large shared CSS and runtime are not repeated inline");
  ok(calls.length <= 9, `personal home uses at most nine database calls (${calls.length})`);
  eq(calls.filter((path) => path.includes("/accountbook_settings?")).length, 1, "home settings are fetched once");
  ok(calls.some((path) => path.includes("/users?id=in.")), "member profiles are fetched in one bulk query");
  ok(!calls.some((path) => /[?&]offset=(?!0(?:&|$))/.test(decodeURIComponent(path))), "short lists stop without an empty pagination probe");
  ok(home.headers.get("cache-control")?.includes("no-store"), "personal home HTML remains no-store");

  const cssPaths = ["/assets/mobile-home-v22810.css", "/assets/accountbook-shell-v22811.css", "/assets/accountbook-shell-v22813.css"];
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

  const legacyShellCss = await request("/assets/accountbook-shell-v22811.css");
  const legacyShellBytes = Buffer.from(await legacyShellCss.arrayBuffer());
  eq(createHash("sha256").update(legacyShellBytes).digest("hex"), "2322ba028d2faed65d0d2ca68d844584aae7f72fef2733522dd96008d5d08fcf", "V22.8.11 shell stylesheet bytes remain pinned");
  eq(legacyShellCss.headers.get("etag"), '"accountbook-shell-v22811-css"', "V22.8.11 shell stylesheet ETag remains pinned");

  const shellCssResponse = await request("/assets/accountbook-shell-v22813.css");
  const shellCss = await shellCssResponse.text();
  const normalizedShellCss = shellCss.replace(/#fff(?![0-9a-f])/gi, "#ffffff");
  const verifiedContrastPairs = [
    ["#86efac", "#111827"],
    ["#d1fae5", "#111827"],
    ["#52606f", "#ffffff"],
    ["#475569", "#ffffff"],
    ["#1d4ed8", "#ffffff"],
    ["#047857", "#ffffff"],
    ["#6d28d9", "#ffffff"],
    ["#92400e", "#ffffff"],
    ["#cbd5e1", "#172033"],
    ["#93c5fd", "#172033"],
    ["#6ee7b7", "#172033"],
    ["#c4b5fd", "#172033"],
    ["#fcd34d", "#172033"],
  ];
  ok(shellCss.includes("body.abV22812Shell") && shellCss.includes("--ab12-accent:#1d4ed8") && shellCss.includes("--abNavW:238px") && verifiedContrastPairs.every(([foreground, background]) => normalizedShellCss.includes(foreground) && normalizedShellCss.includes(background) && contrastRatio(foreground, background) >= 4.5), "shared shell is body-scoped and every declared text/background pair meets WCAG AA");
  ok(shellCss.includes("prefers-reduced-motion") && shellCss.includes("focus-visible") && shellCss.includes("font-size:16px"), "shared shell includes motion, focus, and mobile input safeguards");
  ok(shellCss.includes("--ab12-action:#1d4ed8") && shellCss.includes("background:var(--ab12-action)!important;color:#fff!important"), "white-text form actions use the contrast-safe action token");
  ok(shellCss.includes('html[data-ab-resolved-theme="dark"]') && shellCss.includes('html[data-ab-tone="emerald"]') && shellCss.includes('html[data-ab-tone="violet"]') && shellCss.includes('html[data-ab-tone="amber"]') && shellCss.includes("body.abV22812Shell *{color:var(--ab12-text)!important}") && shellCss.includes(".homeOnboardingStep") && shellCss.includes(".appMenuBody .navGroup a") && shellCss.includes(".seg button.on"), "shared shell includes dark mode, legacy-cascade repairs, and all approved color tones");
  ok(shellCss.includes(".homeNotice b{color:var(--ab12-notice-title)!important}") && shellCss.includes(".homeNotice p{color:var(--ab12-notice-text)!important}"), "smart notice foreground follows its dark background");
  ok(shellCss.includes("a.btn,a.primaryBtn") && shellCss.includes("a.btn.secondary,a.btn.light") && shellCss.includes("color:#fff!important"), "dark-mode primary and secondary link buttons keep explicit contrasting foregrounds");
  ok(shellCss.includes("abPageBudgets") && shellCss.includes("abPageSettlement") && shellCss.includes("abPageSettings") && shellCss.includes(".incomeSummary .emptyIncome") && shellCss.includes(".checks label") && shellCss.includes(".kwCount") && shellCss.includes(".seg button:not(.on)"), "theme coverage includes budgets, settlement, personal settings keywords, and inactive analysis filters");
  ok(shellCss.includes("::placeholder{color:var(--ab12-placeholder)!important") && shellCss.includes("--ab12-placeholder:#52606f"), "placeholder text uses the contrast-safe token");
  ok(shellCss.includes("body.abV22812Shell.abAppSurface .abLayoutNav{width:238px!important}") && shellCss.includes("body.abV22812Shell.abAppSurface{padding-left:238px!important}"), "unified desktop navigation and body offset share the enforced 238px width");
  ok(shellCss.includes("body.abV22812Shell.abAppSurface.abNavCollapsed{padding-left:var(--abNavCollapsed)!important}") && shellCss.includes("body.abV22812Shell.abAppSurface.abNavCollapsed .abLayoutNav{width:var(--abNavCollapsed)!important}"), "collapsed unified navigation keeps its existing compact width contract");

  const themeJs = await request("/assets/accountbook-theme-v22812.js");
  const themeRuntime = await themeJs.text();
  const themeJsGetDatabaseCalls = calls.length;
  const themeHead = await request("/assets/accountbook-theme-v22812.js", { method: "HEAD" });
  const themeJsHeadDatabaseCalls = calls.length;
  ok(themeJs.status === 200 && themeHead.status === 200 && themeHead.headers.get("etag") === themeJs.headers.get("etag"), "theme runtime GET and HEAD succeed with matching ETags");
  ok(themeJs.headers.get("content-type")?.startsWith("text/javascript") && themeJs.headers.get("cache-control")?.includes("immutable"), "theme runtime uses immutable JavaScript delivery");
  ok(exerciseThemeRuntime(themeRuntime), "theme runtime persists system/light/dark and color-tone choices");
  eq(themeJsGetDatabaseCalls, 0, "theme runtime GET requires no database access");
  eq(themeJsHeadDatabaseCalls, 0, "theme runtime HEAD requires no database access");

  const households = await request("/my/households?month=2026-07&household_id=house-home");
  const householdsHtml = await households.text();
  eq(households.status, 200, "accountbook management renders");
  eq(countOf(householdsHtml, 'href="/assets/accountbook-shell-v22813.css"'), 1, "accountbook management loads the shell once");
  ok(householdsHtml.includes("abV22812Shell") && householdsHtml.includes("가계부 전환·관리"), "management shell preserves the accountbook management surface");
  ok(householdsHtml.includes("month=2026-07") && householdsHtml.includes("household_id=house-home"), "management navigation preserves month and accountbook context");
  ok(householdsHtml.lastIndexOf('href="/assets/accountbook-shell-v22813.css"') > householdsHtml.lastIndexOf("</style>"), "accountbook shell is the final stylesheet cascade");

  const backup = await request("/my/backup-login?return_to=%2Fapp");
  const backupHtml = await backup.text();
  eq(countOf(backupHtml, 'href="/assets/accountbook-shell-v22813.css"'), 1, "account security loads the shell once");
  ok(backupHtml.includes('action="/my/backup-login"') && backupHtml.includes('name="access_code_confirm"'), "account security form action and confirmation field remain intact");

  const login = await request("/my", { public: true });
  const loginHtml = await login.text();
  eq(login.status, 200, "public login renders");
  eq(countOf(loginHtml, 'href="/assets/accountbook-shell-v22813.css"'), 1, "login loads the shell once");
  ok(loginHtml.includes('action="/my/local-login"') && loginHtml.includes('action="/my/local-signup"'), "login and signup form actions remain intact");

  const context = "month=2026-07&household_id=house-home";
  const userShellPaths = [
    `/menu?${context}`,
    `/budgets?${context}`,
    `/my/settings?${context}`,
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
    const hasUserNavigation = path.startsWith("/my/settings?")
      ? html.includes('class="appMenu"')
      : html.includes('data-nav-scope="user"');
    ok(response.status === 200 && countOf(html, 'href="/assets/accountbook-shell-v22813.css"') === 1 && countOf(html, 'src="/assets/accountbook-theme-v22812.js"') === 1 && html.includes("abV22812Shell") && hasUserNavigation, `${path} receives the user-scoped theme shell exactly once`);
    if (path.startsWith("/budgets?")) ok(html.includes("abPageBudgets"), "budget center receives its dark-mode route scope");
    if (path.startsWith("/settlement-summary?")) ok(html.includes("abPageSettlement"), "settlement receives its dark-mode route scope");
    if (path.startsWith("/my/settings?")) ok(html.includes("abPageSettings"), "personal settings receives its dark-mode route scope");
    if (path.startsWith("/menu?")) {
      ok(html.includes("화면 설정") && html.includes('data-ab-theme-choice="system"') && html.includes('data-ab-theme-choice="dark"') && html.includes('data-ab-tone-choice="amber"'), "menu exposes accessible theme and color-tone controls");
    }
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
    ok(response.status === 200 && hasExpectedScope && !html.includes('data-nav-scope="user"') && !html.includes("accountbook-shell-v22813") && !html.includes("accountbook-theme-v22812") && !html.includes("abV22812Shell"), `${item.path} stays outside the user theme shell${item.scope ? ` with ${item.scope} scope` : ""} (status=${response.status}, expectedScope=${hasExpectedScope}, userScope=${html.includes('data-nav-scope="user"')}, shellLink=${html.includes("accountbook-shell-v22813")}, shellClass=${html.includes("abV22812Shell")})`);
  }

  console.log(`smoke_dark_mode_full_coverage: ${passed} checks passed`);
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}
