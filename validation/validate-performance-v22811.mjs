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

  // V22.8.56: 실사용 부하 기준 홈 HTML 예산(AGENTS.md 필수 보호 기준).
  // 200행은 한 달 활발한 사용의 상한선에 가깝고, 그 이상에서는 피드가 10장으로
  // 고정돼 크기가 평탄해진다(400행·3,200행 모두 43.5KB 부근).
  // 35KB는 카드가 6장뿐인 기준 픽스처에서 정한 값이라 실사용 부하에는 적용되지 않는다.
  // V22.8.55 마크업 축소 후 실측 42.5KB(43,542바이트)를 근거로 44KB를 예산으로 정했다.
  // 여유는 약 1.4KB뿐이므로 카드 마크업이 커지면 여기서 먼저 실패한다.
  const REALISTIC_HOME_BUDGET = 44 * 1024;
  const realisticFixture = await createV2265QaFixture();
  let realisticHomeBytes = 0;
  let realisticFeedCards = 0;
  try {
    const categories = ["식비", "카페/간식", "교통/차량", "장보기", "주거/관리", "쇼핑", "의료/건강", "구독"];
    const payments = ["국민카드", "현대카드", "카카오페이", "현금", "계좌이체"];
    for (let index = 0; index < 200; index += 1) {
      const day = String((index % 28) + 1).padStart(2, "0");
      realisticFixture.db.transactions.push({ id: `budget-${index}`, household_id: "house-home", user_id: "user-bin", transaction_date: `2026-07-${day}`, type: index % 9 === 0 ? "income" : "expense", amount: 1000 + (index * 137) % 90000, category: categories[index % categories.length], memo: `실사용 기록 ${index} 항목`, payment_method: payments[index % payments.length], source: "web", created_at: `2026-07-${day}T09:00:00.000Z` });
    }
    const realisticHome = await app.fetch(new Request("https://ttokttok-accountbook.com/app?month=2026-07&household_id=house-home", { headers: { cookie: realisticFixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), realisticFixture.env, {});
    const realisticHtml = await realisticHome.text();
    realisticHomeBytes = Buffer.byteLength(realisticHtml);
    realisticFeedCards = (realisticHtml.match(/class="v8-tx"/g) || []).length;
  } finally {
    realisticFixture.restore();
  }
  const externalScripts = Array.from(homeHtml.matchAll(/<script\b[^>]*\bsrc="([^"]+)"/gi), (match) => match[1]);
  ok(homeBytes < 35 * 1024, `personal home HTML stays below the 35 KiB baseline-fixture budget (${homeBytes} bytes)`);
  // 6행 픽스처는 피드 카드가 6장뿐이라 예산에 항상 들어간다. 실사용 부하에서도
  // 예산을 지키는지 확인해야 카드 마크업이 커지는 회귀를 잡을 수 있다.
  ok(realisticHomeBytes <= REALISTIC_HOME_BUDGET, `personal home HTML stays within the 44 KiB realistic-load budget with 200 monthly rows (${realisticHomeBytes} bytes, budget ${REALISTIC_HOME_BUDGET})`);
  eq(realisticFeedCards, 10, "realistic home still renders the standard ten feed cards");
  eq(countOf(homeHtml, 'href="/assets/mobile-home-v22810.css"'), 1, "home loads the byte-preserved base stylesheet once");
  eq(countOf(homeHtml, 'href="/assets/accountbook-shell-v22859.css"'), 1, "home loads the current shell stylesheet once");
  ok(externalScripts.length === 4 && externalScripts.includes("/assets/accountbook-theme-v22812.js") && externalScripts.includes("/assets/mobile-home-shell-v22855.js") && externalScripts.includes("/assets/accountbook-nav-v22850.js") && externalScripts.includes("/assets/accountbook-v5-v22859.js"), "home loads the theme, preserved mobile runtime, versioned V5 navigation, and shared V5 bundle");
  ok(!homeHtml.includes("mobile-home-v22810-home-shell"), "unreleased first-pass asset path is absent");
  ok(/<body class="[^"]*abMobileAppSurface[^"]*abV22812Shell[^"]*">/.test(homeHtml), "home opts into the scoped theme and unified app shell");
  ok(homeHtml.includes('class="abLayoutNav abNavMobileDrawer"') && !homeHtml.includes('class="homeDesktopNav"') && !homeHtml.includes('class="bottom"') && homeHtml.includes('class="appTop abV5PageHeader"') && homeHtml.includes('class="homeMetrics abV5KpiGrid"') && homeHtml.includes('aria-label="가계부 주요 메뉴"'), "home uses the shared V5 header, KPI grid, and functional mobile-drawer navigation landmarks");
  ok(homeHtml.includes("/settlement-summary?month=2026-07&amp;household_id=house-home"), "home navigation preserves escaped month and accountbook context");
  ok(homeHtml.includes("우리집 생활비") && homeHtml.includes("3,200,000"), "home preserves selected accountbook data and amounts");
  ok(!homeHtml.includes('id="v2281GuidedUiUxStyle"') && !homeHtml.includes("parseKoreanAmount(text)"), "large shared CSS and runtime are not repeated inline");
  ok(calls.length <= 9, `personal home uses at most nine database calls (${calls.length})`);
  eq(calls.filter((path) => path.includes("/accountbook_settings?")).length, 1, "home settings are fetched once");
  ok(calls.some((path) => path.includes("/users?id=in.")), "member profiles are fetched in one bulk query");
  ok(!calls.some((path) => /[?&]offset=(?!0(?:&|$))/.test(decodeURIComponent(path))), "short lists stop without an empty pagination probe");
  ok(home.headers.get("cache-control")?.includes("no-store"), "personal home HTML remains no-store");

  const feedExpansionRows = Array.from({ length: 6 }, (_, index) => ({
    id: `tx-home-feed-${index + 1}`,
    household_id: "house-home",
    user_id: "user-bin",
    transaction_date: `2026-07-${String(index + 10).padStart(2, "0")}`,
    type: "expense",
    amount: 1000 + index,
    category: "생활용품",
    memo: `홈 더보기 검증 ${index + 1}`,
    payment_method: "국민카드",
    source: "web",
    raw_text: `홈 더보기 검증 ${index + 1}`,
  }));
  fixture.db.transactions.push(...feedExpansionRows);
  const expandedHome = await request("/app?month=2026-07&household_id=house-home");
  const expandedHomeHtml = await expandedHome.text();
  ok(expandedHome.status === 200 && /<a class="btn homeFeedAllBtn"[^>]*href="[^"]*feed=all[^"]*#feed"[^>]*>전체 11건 조회<\/a>/.test(expandedHomeHtml), "home renders the real 11-row feed button with its dedicated contrast scope");
  fixture.db.transactions.splice(fixture.db.transactions.length - feedExpansionRows.length, feedExpansionRows.length);

  const cssPaths = ["/assets/mobile-home-v22810.css", "/assets/accountbook-shell-v22811.css", "/assets/accountbook-shell-v22859.css"];
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

  const legacyJs = await request("/assets/mobile-home-v22855.js");
  const legacyBytes = Buffer.from(await legacyJs.arrayBuffer());
  const legacyJsGetDatabaseCalls = calls.length;
  const legacyHead = await request("/assets/mobile-home-v22855.js", { method: "HEAD" });
  const legacyJsHeadDatabaseCalls = calls.length;
  eq(createHash("sha256").update(legacyBytes).digest("hex"), "ebb5795c7fbb2685fe0603c93ab041088a4ee3c0384c34010ccf56a560cdaf89", "legacy home runtime bytes remain pinned");
  eq(legacyJs.headers.get("etag"), '"mobile-home-v22855-js"', "legacy home runtime ETag remains pinned");
  ok(legacyHead.status === 200 && legacyHead.headers.get("etag") === legacyJs.headers.get("etag"), "legacy runtime HEAD preserves its ETag");
  eq(legacyJsGetDatabaseCalls, 0, "legacy runtime GET requires no database access");
  eq(legacyJsHeadDatabaseCalls, 0, "legacy runtime HEAD requires no database access");

  const shellJs = await request("/assets/mobile-home-shell-v22855.js");
  const shellRuntime = await shellJs.text();
  const shellJsGetDatabaseCalls = calls.length;
  const shellHead = await request("/assets/mobile-home-shell-v22855.js", { method: "HEAD" });
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

  // 이 런타임은 템플릿 리터럴 안에 문자열로 작성되므로 `\d`, `\s`, `\B`의
  // 백슬래시가 조용히 소실될 수 있다. 문법 오류가 나지 않아 문자열 포함
  // 검사로는 잡히지 않으므로 배포되는 자산에서 함수를 꺼내 실제로 실행한다.
  const shippedFunction = (name) => {
    const head = shellRuntime.indexOf(`function ${name}(`);
    if (head < 0) return null;
    let depth = 0;
    let started = false;
    for (let index = head; index < shellRuntime.length; index += 1) {
      if (shellRuntime[index] === "{") { depth += 1; started = true; }
      else if (shellRuntime[index] === "}") {
        depth -= 1;
        if (started && depth === 0) return new Function(`${shellRuntime.slice(head, index + 1)}; return ${name};`)();
      }
    }
    return null;
  };
  const shippedParseKoreanAmount = shippedFunction("parseKoreanAmount");
  const shippedAbNorm = shippedFunction("abNorm");
  ok(typeof shippedParseKoreanAmount === "function" && typeof shippedAbNorm === "function", "shipped runtime exposes the quick-input parsers");
  for (const [utterance, expected] of [["커피 5천", 5000], ["월급 250만원", 2500000], ["3만 5천", 35000], ["점심 12000", 12000], ["택시 1만2천", 12000]]) {
    eq(shippedParseKoreanAmount(utterance), expected, `shipped quick-input parser reads "${utterance}" (regex escapes survived template serialization)`);
  }
  eq(shippedAbNorm("starbucks coffee 5000"), "starbucks coffee 5000", "shipped text normalizer keeps latin letters instead of eating an unescaped \\s");
  const shippedThousands = shellRuntime.match(/replace\(\/(\\B\(\?=\(\\d\{3\}\)\+\(\?!\\d\)\))\/g,','\)/);
  ok(!!shippedThousands, "shipped runtime keeps a working thousands-separator regex");
  eq(String(1234567).replace(new RegExp(shippedThousands[1], "g"), ","), "1,234,567", "shipped thousands-separator regex formats an amount");

  const stage4NavJs = await request("/assets/accountbook-nav-v22850.js");
  const stage4NavRuntime = await stage4NavJs.text();
  const stage4NavGetDatabaseCalls = calls.length;
  const stage4NavHead = await request("/assets/accountbook-nav-v22850.js", { method: "HEAD" });
  const stage4NavHeadBody = await stage4NavHead.text();
  const stage4NavHeadDatabaseCalls = calls.length;
  eq(stage4NavJs.status, 200, "V22.8.18 stage 4 navigation runtime GET succeeds");
  ok(stage4NavHead.status === 200 && stage4NavHeadBody.length === 0, "V22.8.18 stage 4 navigation runtime HEAD succeeds without a body");
  ok(stage4NavJs.headers.get("content-type")?.startsWith("text/javascript") && stage4NavJs.headers.get("cache-control")?.includes("immutable"), "stage 4 navigation runtime uses immutable JavaScript delivery");
  eq(stage4NavJs.headers.get("etag"), '"accountbook-nav-v22850-js"', "V5 navigation runtime has a versioned ETag");
  ok(stage4NavRuntime.includes('label: "기록"') && stage4NavRuntime.includes('label: "입력"') && stage4NavRuntime.includes('label: "예산"') && stage4NavRuntime.includes('label: "전체"') && stage4NavRuntime.includes('path === "/my/households"') && stage4NavRuntime.includes('event.key !== "Tab"') && stage4NavRuntime.includes('var sidebarActive = active === "home" ? "app" : active') && stage4NavRuntime.includes('if (!document.querySelector(".abLayoutNav")) return') && stage4NavRuntime.includes('data-abv5-search-open') && stage4NavRuntime.includes('data-ab-theme-choice="dark"') && stage4NavRuntime.includes('event.key === "Escape" && dialog && dialog.open') && stage4NavRuntime.includes('event.key === "/"'), "V5 runtime maps the home sidebar state and connects Escape-safe authenticated search, quick actions, and appearance controls");
  eq(stage4NavGetDatabaseCalls, 0, "stage 4 navigation runtime GET requires no database access");
  eq(stage4NavHeadDatabaseCalls, 0, "stage 4 navigation runtime HEAD requires no database access");

  const oldShellCss = await request("/assets/mobile-home-v22810-home-shell.css");
  const oldShellJs = await request("/assets/mobile-home-v22810-home-shell.js");
  ok(oldShellCss.status === 404 && oldShellJs.status === 404, "unreleased first-pass assets are not served");

  const legacyShellCss = await request("/assets/accountbook-shell-v22811.css");
  const legacyShellBytes = Buffer.from(await legacyShellCss.arrayBuffer());
  eq(createHash("sha256").update(legacyShellBytes).digest("hex"), "2322ba028d2faed65d0d2ca68d844584aae7f72fef2733522dd96008d5d08fcf", "V22.8.11 shell stylesheet bytes remain pinned");
  eq(legacyShellCss.headers.get("etag"), '"accountbook-shell-v22811-css"', "V22.8.11 shell stylesheet ETag remains pinned");

  const shellCssResponse = await request("/assets/accountbook-shell-v22859.css");
  const shellCss = await shellCssResponse.text();
  const normalizedShellCss = shellCss.replace(/#fff(?![0-9a-f])/gi, "#ffffff").toLowerCase();
  const verifiedContrastPairs = [
    ["#86efac", "#111827"],
    ["#d1fae5", "#111827"],
    ["#52606f", "#ffffff"],
    ["#475569", "#ffffff"],
    ["#1d4ed8", "#ffffff"],
    ["#047857", "#ffffff"],
    ["#6d28d9", "#ffffff"],
    ["#92400e", "#ffffff"],
    ["#b3bdc9", "#1e2026"],
    ["#93c5fd", "#1e2026"],
    ["#6ee7b7", "#1e2026"],
    ["#c4b5fd", "#1e2026"],
    ["#fcd34d", "#1e2026"],
    ["#191919", "#fee500"],
    ["#d1fae5", "#123c33"],
    ["#fcd34d", "#49351a"],
  ];
  const lightMutedPairs = [["#5f6b7a", "#ffffff"], ["#5f6b7a", "#f4f6f8"], ["#5f6b7a", "#f2f4f6"]];
  const tonePairs = [
    ["#1d4ed8", "#e8f3ff"], ["#047857", "#dff7ed"], ["#6d28d9", "#f0e8ff"], ["#92400e", "#fff3d6"],
    ["#93c5fd", "#1d2c42"], ["#6ee7b7", "#123c33"], ["#c4b5fd", "#35255d"], ["#fcd34d", "#49351a"],
  ];
  ok(shellCss.includes("body.abV22812Shell") && shellCss.includes('html[data-ab-resolved-theme="dark"]{background:#141519;color-scheme:dark}') && shellCss.includes("--ab12-accent:#1d4ed8") && shellCss.includes("--abNavW:238px") && shellCss.includes("V22.8.23 UI V5 step 3") && shellCss.includes("V22.8.24 UI V5 shell correctness") && shellCss.includes("V22.8.25 UI V5 global actions") && shellCss.includes(".abGlobalDialog::backdrop") && shellCss.includes(".abGlobalDialog [hidden]{display:none!important}") && shellCss.includes("z-index:2210") && shellCss.includes(".abGlobalActionsMobile") && shellCss.includes("@media(max-width:899px)") && shellCss.includes("@media(min-width:900px)") && shellCss.includes("body.abV22812Shell.abV5RemainingPage") && shellCss.includes("white-space:normal!important;overflow:visible!important;text-overflow:clip!important") && verifiedContrastPairs.every(([foreground, background]) => normalizedShellCss.includes(foreground) && normalizedShellCss.includes(background) && contrastRatio(foreground, background) >= 4.5), "shared shell preserves contrast, full KPI values, and the dark document canvas while adding visible, correctly layered responsive global actions");
  ok(shellCss.includes("prefers-reduced-motion") && shellCss.includes("focus-visible") && shellCss.includes("font-size:16px"), "shared shell includes motion, focus, and mobile input safeguards");
  ok(lightMutedPairs.every(([foreground, background]) => contrastRatio(foreground, background) >= 4.5) && shellCss.includes("--ab12-muted:#5f6b7a"), "measured light muted text clears 4.5:1 on page, card, and raised surfaces");
  ok(tonePairs.every(([foreground, background]) => contrastRatio(foreground, background) >= 4.5), "all light and dark accent-soft tone pairs clear 4.5:1");
  ok(shellCss.includes("@media(prefers-contrast:more)") && shellCss.includes("@media(forced-colors:active)") && shellCss.includes("min-width:44px!important;min-height:44px!important") && shellCss.includes("color-scheme:light") && shellCss.includes("color-scheme:dark"), "shell supports increased contrast, forced colors, color schemes, and a 44px mobile menu target");
  ok(shellCss.includes("--ab12-action:#1d4ed8") && shellCss.includes("background:var(--ab12-action)!important;color:#fff!important") && shellCss.includes('a.abGlobalActionPrimary span{color:#fff!important}'), "white-text form and global actions use the contrast-safe action token");
  ok(shellCss.includes('html[data-ab-resolved-theme="dark"]') && shellCss.includes('html[data-ab-tone="emerald"]') && shellCss.includes('html[data-ab-tone="violet"]') && shellCss.includes('html[data-ab-tone="amber"]') && !shellCss.includes("body.abV22812Shell:not(.abPageLogin):not(.abPageAccountSecurity) *{color:var(--ab12-text)!important}") && !shellCss.includes("body.abV22812Shell *{color:var(--ab12-text)!important}") && shellCss.includes(".homeOnboardingStep") && shellCss.includes(".appMenuBody .navGroup a") && shellCss.includes(".seg button.on"), "shared shell removes the unsafe global foreground override and keeps all approved color tones");
  ok(shellCss.includes(":is(.badge,.kakaoBtn){background:#FEE500!important;color:#191919!important") && shellCss.includes(".notice:not(.error):not(.ok){background:#123c33!important;color:#d1fae5!important") && shellCss.includes(":is(.warn,.guide){background:#49351a!important;color:#fcd34d!important") && shellCss.includes("body.abV22812Shell.abPageLogin .mobileAccessHelp") && shellCss.includes("body.abV22812Shell.abPageAccountSecurity .identity") && shellCss.includes("body.abV22812Shell.abPageAccountSecurity main.wrap a.btn.secondary"), "dark authentication surfaces preserve Kakao, notice, warning, mobile help, identity, and secondary-action foregrounds");
  ok(shellCss.includes(".homeNotice b{color:var(--ab12-notice-title)!important}") && shellCss.includes(".homeNotice p{color:var(--ab12-notice-text)!important}"), "smart notice foreground follows its dark background");
  ok(shellCss.includes("a.btn,a.primaryBtn") && shellCss.includes("a.btn.secondary,a.btn.light") && shellCss.includes("color:#fff!important"), "dark-mode primary and secondary link buttons keep explicit contrasting foregrounds");
  ok(shellCss.includes("#feed>a.btn.homeFeedAllBtn") && shellCss.includes("background:var(--ab12-action)!important;color:#fff!important"), "dark home full-feed button has an ID-scoped white-text action rule that wins the legacy cascade");
  ok(shellCss.includes("abPageBudgets") && shellCss.includes("abPageSettlement") && shellCss.includes("abPageSettings") && shellCss.includes(".incomeSummary .emptyIncome") && shellCss.includes(".checks label") && shellCss.includes(".kwCount") && shellCss.includes(".seg button:not(.on)"), "theme coverage includes budgets, settlement, personal settings keywords, and inactive analysis filters");
  ok(shellCss.includes("::placeholder{color:var(--ab12-placeholder)!important") && shellCss.includes("--ab12-placeholder:#52606f") && shellCss.includes('body.abV22812Shell.abV2281 input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"])') && shellCss.includes('background:var(--ab12-input-bg)!important;background-color:var(--ab12-input-bg)!important;color:var(--ab12-text)!important;-webkit-text-fill-color:var(--ab12-text)!important'), "dark form controls outrank the legacy input selector and placeholder text uses explicit contrast-safe tokens");
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
  eq(countOf(householdsHtml, 'href="/assets/accountbook-shell-v22859.css"'), 1, "accountbook management loads the shell once");
  ok(householdsHtml.includes("abV22812Shell") && householdsHtml.includes("abPageHouseholds") && householdsHtml.includes("가계부 전환·관리") && householdsHtml.includes('data-key="my-households" class="active"') && !householdsHtml.includes('data-key="members" class="active"') && householdsHtml.includes('class="accountSecurity"') && householdsHtml.includes('class="hhCard active"') && householdsHtml.includes('class="optionGrid"') && shellCss.includes("body.abV22812Shell.abPageHouseholds .hhCard.active") && shellCss.includes("body.abV22812Shell.abPageHouseholds :is(.accountSecurity span,.hhMain span,.sectionHead p,.inlineHelp,.exitGuide,.optionGrid span)"), "management shell scopes its surfaces and selects the exact accountbook-management route");
  ok(householdsHtml.includes("month=2026-07") && householdsHtml.includes("household_id=house-home"), "management navigation preserves month and accountbook context");
  ok(householdsHtml.lastIndexOf('href="/assets/accountbook-shell-v22859.css"') > householdsHtml.lastIndexOf("</style>"), "accountbook shell is the final stylesheet cascade");

  const backup = await request("/my/backup-login?return_to=%2Fapp");
  const backupHtml = await backup.text();
  eq(countOf(backupHtml, 'href="/assets/accountbook-shell-v22859.css"'), 1, "account security loads the shell once");
  ok(backupHtml.includes('action="/my/backup-login"') && backupHtml.includes('name="access_code_confirm"'), "account security form action and confirmation field remain intact");
  ok(backupHtml.includes("abPageAccountSecurity") && backupHtml.includes('class="abLayoutNav ') && backupHtml.includes("abV5RemainingPage"), "account security receives the shared navigation and isolated dark-mode surface scope");

  const login = await request("/my", { public: true });
  const loginHtml = await login.text();
  eq(login.status, 200, "public login renders");
  eq(countOf(loginHtml, 'href="/assets/accountbook-shell-v22859.css"'), 1, "login loads the shell once");
  ok(loginHtml.includes('action="/my/local-login"') && loginHtml.includes('action="/my/local-signup"'), "login and signup form actions remain intact");
  ok(loginHtml.includes("abPageLogin") && loginHtml.includes(".sep{text-align:center;color:#667085;"), "login receives its isolated dark scope and contrast-safe light separator");

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
    `/my/members?${context}`,
    `/keyword-guide?${context}`,
    `/my/backup?${context}`,
    `/my/groups?${context}`,
    `/start-guide?${context}`,
    `/reports?${context}`,
    `/my/analysis?${context}`,
    `/households?${context}`,
  ];
  for (const path of userShellPaths) {
    const response = await request(path);
    const html = await response.text();
    const hasUserNavigation = html.includes('data-nav-scope="user"') && html.includes('class="abLayoutNav ') && !html.includes('class="appMenu"')
      && (!path.startsWith("/my/analysis?") || (html.includes('class="filterBar abV5FilterBar"') && html.includes('class="kpiRow abV5KpiGrid"')));
    const expectsRemainingPage = ["/budgets?", "/my/settings?", "/payment-methods?", "/reserve-plans?", "/smart-tools?", "/my/households?", "/my/members?", "/keyword-guide?", "/my/backup?", "/my/groups?", "/start-guide?", "/reports?", "/households?"].some((prefix) => path.startsWith(prefix));
    const hasRemainingPageContract = !expectsRemainingPage || (html.includes("abV5RemainingPage") && html.includes("abV5PageHeader"));
    ok(response.status === 200 && countOf(html, 'href="/assets/accountbook-shell-v22859.css"') === 1 && countOf(html, 'src="/assets/accountbook-theme-v22812.js"') === 1 && html.includes("abV22812Shell") && hasUserNavigation && hasRemainingPageContract, `${path} receives one centralized user navigation and the V5 authenticated-page contract exactly once`);
    if (path.startsWith("/budgets?")) ok(html.includes("abPageBudgets"), "budget center receives its dark-mode route scope");
    if (path.startsWith("/settlement-summary?")) ok(html.includes("abPageSettlement") && html.includes('<h1>정산</h1>') && html.includes('class="filters abV5ControlBar"') && html.includes('class="grid abV5KpiGrid"'), "settlement receives its V5 page header, controls, KPI grid, and dark-mode route scope");
    if (path.startsWith("/my/settings?")) ok(html.includes("abPageSettings"), "personal settings receives its dark-mode route scope");
    if (path.startsWith("/my/members?")) ok(html.includes("abPageMembers"), "member management receives its dark-mode route scope");
    if (path.startsWith("/keyword-guide?")) ok(html.includes("abPageKeywords"), "standalone keyword management receives its dark-mode route scope");
    if (path.startsWith("/my/backup?")) ok(html.includes("abPageBackup"), "backup management receives its dark-mode route scope");
    if (path.startsWith("/start-guide?")) ok(html.includes("abPageGuide"), "start guide receives its dark-mode route scope");
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
    const hasAnyUserShellAsset = /accountbook-shell-v\d+/i.test(html);
    ok(response.status === 200 && hasExpectedScope && !html.includes('data-nav-scope="user"') && !hasAnyUserShellAsset && !html.includes("accountbook-theme-v22812") && !html.includes("abV22812Shell"), `${item.path} stays outside every version of the user theme shell${item.scope ? ` with ${item.scope} scope` : ""} (status=${response.status}, expectedScope=${hasExpectedScope}, userScope=${html.includes('data-nav-scope="user"')}, shellAsset=${hasAnyUserShellAsset}, shellClass=${html.includes("abV22812Shell")})`);
  }

  // V22.8.53: 초과 지출 시 홈의 예산 사용률 표기가 100%에서 잘리지 않아야 한다.
  // 막대 너비만 100%에서 멈추고 숫자는 실제 사용률을 보여준다.
  const overspendFixture = await createV2265QaFixture();
  try {
    const overspendPost = (path, values) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
      method: "POST",
      headers: { cookie: overspendFixture.cookie, origin: "https://ttokttok-accountbook.com", "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(values).toString(),
    }), overspendFixture.env, {});
    await overspendPost("/admin/transactions", { household_id: "house-home", month: "2026-08", type: "expense", amount: "400000", category: "식비", memo: "초과지출", transaction_date: "2026-08-05", user_id: "user-bin" });
    await overspendPost("/admin/budget/save", { household_id: "house-home", month: "2026-08", category: "식비", amount: "200000" });
    const overspendHome = await app.fetch(new Request("https://ttokttok-accountbook.com/app?household_id=house-home&month=2026-08", { headers: { cookie: overspendFixture.cookie } }), overspendFixture.env, {});
    const overspendHtml = await overspendHome.text();
    const shownRate = overspendHtml.match(/예산 사용률 (\d+)%/);
    const barWidth = overspendHtml.match(/homeProgress"><i style="width:(\d+)%"/);
    eq(shownRate?.[1], "200", "home shows the real budget usage rate when spending exceeds the budget");
    eq(barWidth?.[1], "100", "home progress bar still stops at 100% width");
  } finally {
    overspendFixture.restore();
  }

  // V22.8.54: 대량 데이터에서 페이지 왕복 횟수가 줄었는지 + 데이터 손실이 없는지.
  // 페이지 크기를 PostgREST max-rows보다 크게 잡으면 짧은 페이지를 데이터 끝으로
  // 오인해 조용히 잘리므로 합계까지 함께 검증한다.
  const bulkFixture = await createV2265QaFixture();
  const bulkOuterFetch = globalThis.fetch;
  let bulkCalls = [];
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.hostname === "mock.supabase.co") bulkCalls.push(decodeURIComponent(url.pathname + url.search));
    return bulkOuterFetch(input, init);
  };
  try {
    let expectedExpense = 0;
    for (let index = 0; index < 2500; index += 1) {
      const day = String((index % 28) + 1).padStart(2, "0");
      const amount = 1000 + index;
      expectedExpense += amount;
      bulkFixture.db.transactions.push({ id: `perf-${index}`, household_id: "house-home", user_id: "user-bin", transaction_date: `2026-06-${day}`, type: "expense", amount, category: "식비", memo: `perf${index}`, payment_method: "현금", source: "web", created_at: `2026-06-${day}T09:00:00.000Z` });
    }
    bulkCalls = [];
    const bulkHome = await app.fetch(new Request("https://ttokttok-accountbook.com/app?household_id=house-home&month=2026-06", { headers: { cookie: bulkFixture.cookie } }), bulkFixture.env, {});
    const bulkHtml = await bulkHome.text();
    const transactionQueries = bulkCalls.filter((entry) => entry.startsWith("/rest/v1/transactions"));
    const pageSizes = [...new Set(transactionQueries.map((entry) => entry.match(/limit=(\d+)/)?.[1]))];
    eq(bulkHome.status, 200, "home renders with 2,500 monthly transactions");
    ok(pageSizes.includes("1000"), `bulk transaction pages request 1000 rows (saw ${pageSizes.join(",")})`);
    ok(transactionQueries.length <= 5, `bulk month needs at most five transaction queries (saw ${transactionQueries.length})`);
    const bulkShown = bulkHtml.match(/나간 돈<\/span><b class="expense">-([\d,]+)원/);
    eq(Number(String(bulkShown?.[1]).replace(/,/g, "")), expectedExpense, "larger pages still total every row (no silent truncation)");
  } finally {
    globalThis.fetch = bulkOuterFetch;
    bulkFixture.restore();
  }

  console.log(`smoke_home_feed_button_contrast: ${passed} checks passed`);
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}
