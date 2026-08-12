import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { resolveQuickChipIcon, resolveQuickPaymentIcon, quickChipIconCss } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.91-HOME-REPORTS"'), "runtime exposes the mobile surface repair release");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22891.css"'), "changed shell uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22889.js"'), "changed navigation uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22890.js"'), "changed quick input runtime uses a new immutable path");
ok(source.includes('const MOBILE_HOME_CSS_ASSET_PATH = "/assets/mobile-home-v22889.css"'), "byte-pinned legacy home stylesheet keeps its path");

// 1. 정의되지 않은 CSS 변수가 남으면 하단 "입력" 버튼처럼 배경이 사라지는 회귀가 다시 생긴다.
const usedVariables = new Set();
const definedVariables = new Set();
for (const match of source.matchAll(/var\(\s*(--[A-Za-z0-9_-]+)\s*([),])/g)) {
  if (match[2] === ")") usedVariables.add(match[1]);
}
for (const match of source.matchAll(/(--[A-Za-z0-9_-]+)\s*:/g)) definedVariables.add(match[1]);
const undefinedVariables = [...usedVariables].filter((name) => !definedVariables.has(name)).sort();
eq(undefinedVariables.join(","), "", `every fallback-free CSS custom property is defined (${undefinedVariables.join(", ") || "none"})`);
ok(source.includes("--action:var(--ab12-action);--accent-soft:var(--ab12-accent-soft);--soft:var(--ab12-surface-raised);"), "shell aliases the action, accent-soft and soft tokens");

// 2. V22.8.61 은 "작업" 버튼을 상단바 안으로 넣어 "전체 메뉴"와의 겹침을 없앴다.
//    V22.8.87(M1)은 그 버튼 자체를 없애 같은 문제를 한 단계 위에서 해소한다 —
//    버튼이 없으면 겹칠 것도 없다. 지켜야 할 성질은 그대로다: 모바일 상단에 떠 있는
//    조작 레이어가 없을 것, 그리고 그 버튼이 열던 기능이 사라지지 않을 것.
ok(!source.includes('<span>작업</span>'), "the mobile action button is gone rather than docked");
ok(!source.includes("abGlobalActionsMobile"), "no styling survives for the retired mobile action button");
ok(source.includes("body.abV22812Shell .abGlobalActions{display:none!important}"), "no floating action layer remains on mobile to overlap the top bar");
// 기능은 전체 메뉴 서랍으로 옮겨 간다. 옮기고 끝내면 창을 넓혔을 때 데스크톱 독에서
// 사라지므로, 되돌리는 경로가 함께 있어야 한다.
ok(source.includes("function syncGlobalActionPlacement()"), "global actions are placed by viewport rather than docked once");
ok(source.includes('group.className = "abNavDrawerActions"'), "mobile places search, notifications and appearance inside the drawer");
ok(source.includes("GLOBAL_ACTION_ORDER") && source.includes("mobileActionQuery"), "desktop restores the dock in its original order when the viewport grows");
ok(!source.includes("body.abV22812Shell .abGlobalActions{top:calc(env(safe-area-inset-top) + 8px);right:92px"), "hard-coded 92px offset that collided with the menu button is gone");

// 3. 전체 메뉴 서랍은 달력 위젯이 아니라 메뉴 목록에 높이를 써야 한다.
ok(source.includes("body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavDashboard{display:none!important}"), "mobile drawer hides the duplicated calendar dashboard");
ok(source.includes("body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavLinks a{min-height:48px!important"), "drawer menu links keep a 48px touch target");
ok(source.includes("body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavGroup summary{min-height:48px!important}"), "drawer group headers keep a 48px touch target");
ok(source.includes('class="abNavDashboard"'), "sidebar dashboard markup is preserved for desktop");

// 4. 빠른 입력 시트는 배경 대신 시트 본문만 움직여야 한다.
ok(source.includes("function lockScroll()") && source.includes("function unlockScroll()"), "quick input sheet locks and restores background scroll");
ok(source.includes('style.position = "fixed";'), "scroll lock pins the document instead of relying on overflow alone");
ok(source.includes("window.scrollTo(0, lockedScrollY)"), "closing the sheet restores the original scroll position");
ok(source.includes("body.abV22812Shell .abQuickInputBody{overscroll-behavior:contain"), "sheet body stops scroll chaining to the page");
ok(source.includes("body.abV22812Shell .abQuickInputContent .chipRow{max-height:none;overflow:visible}"), "nested chip scroller is removed so the sheet has one scroll surface");

// 5. 빠른 입력 칩과 결제수단 칩은 아이콘으로 구분한다.
ok(source.includes("const QUICK_CHIP_ICON_RULES = [") && source.includes("const QUICK_PAYMENT_ICON_RULES = ["), "quick input chips have one shared icon table");
eq(resolveQuickChipIcon("커피", "카페/간식"), "☕", "cafe chip resolves the cafe icon");
eq(resolveQuickChipIcon("점심", "외식"), "🍚", "meal chip resolves the meal icon");
eq(resolveQuickChipIcon("마트", "장보기"), "🛒", "grocery chip resolves the grocery icon");
eq(resolveQuickChipIcon("병원", "의료/병원"), "🏥", "clinic chip resolves the clinic icon");
eq(resolveQuickChipIcon("쿠팡", "쇼핑"), "📦", "shopping chip resolves the parcel icon");
eq(resolveQuickChipIcon("", ""), "🏷️", "unknown chip falls back to one neutral icon");
eq(resolveQuickPaymentIcon("현금"), "💵", "cash chip resolves the cash icon");
eq(resolveQuickPaymentIcon("삼성페이"), "📱", "pay chip resolves the mobile pay icon");
eq(resolveQuickPaymentIcon("계좌이체"), "🏦", "transfer chip resolves the bank icon");
eq(resolveQuickPaymentIcon("현대카드"), "💳", "card chip resolves the card icon");

// 아이콘은 마크업이 아니라 CSS로 그려야 홈 HTML 35KB·44KB 예산을 건드리지 않는다.
const chipCss = quickChipIconCss();
ok(chipCss.includes('body.abV22812Shell .chipRow button{display:inline-flex;align-items:center;gap:5px}'), "chip icon and label stay on one aligned row");
ok(chipCss.includes('button:before{content:var(--ab-chip-icon,"🏷️")'), "chips fall back to one neutral icon in CSS too");
ok(chipCss.includes('button[data-pay-only]{--ab-chip-icon:"💳"}'), "payment chips default to the card icon");
for (const [selector, icon] of [['button[data-cat*="커피"]', "☕"], ['button[data-memo*="마트"]', "🛒"], ['button[data-pay-only*="현금"]', "💵"]]) {
  const index = chipCss.indexOf(selector);
  ok(index >= 0 && chipCss.slice(index).startsWith(selector) === true && chipCss.slice(index).includes(icon), `${selector} is mapped in the generated CSS`);
}
// CSS는 같은 특이도라 뒤 규칙이 이긴다. 우선순위가 높은 항목이 뒤에 와야 해석이 일치한다.
ok(chipCss.indexOf('[data-cat*="커피"]') > chipCss.indexOf('[data-cat*="식비"]'), "higher priority chip rules are emitted later so CSS matches the resolver");
ok(chipCss.indexOf('[data-pay-only*="현금"]') > chipCss.indexOf('[data-pay-only*="페이"]'), "higher priority payment rules are emitted later");
ok(!source.includes('<i class="chipIcon"'), "no per-chip icon markup is added to the budgeted home HTML");

// 6. 날짜 입력이 카드 밖으로 밀려나지 않아야 한다.
ok(source.includes('.reportChallenge label{display:grid;grid-template-columns:76px minmax(0,1fr)'), "challenge settings rows can shrink below the date input intrinsic width");
ok(source.includes(".reportChallenge input{width:100%;min-width:0;max-width:100%;"), "challenge inputs stay inside their grid cell");
ok(source.includes('body.abV22812Shell :is(input[type="date"],input[type="month"],input[type="time"],input[type="number"]){min-width:0;max-width:100%}'), "date-like inputs never widen their container");
ok(!source.includes(".reportChallenge label{display:grid;grid-template-columns:76px 1fr"), "overflowing challenge grid template is gone");

async function request(fixture, path, { method = "GET", cookie = fixture.cookie, headers = {} } = {}) {
  const mergedHeaders = { "user-agent": "Mozilla/5.0", ...headers };
  if (cookie) mergedHeaders.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers: mergedHeaders }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const shell = await request(fixture, "/assets/accountbook-shell-v22891.css", { cookie: "" });
  eq(shell.response.status, 200, "new shell asset is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22891-css"', "new shell ETag is correct");
  ok(shell.text.includes("--action:var(--ab12-action)"), "deployed shell defines the action token");
  ok(shell.text.includes(".abNavDrawerActions"), "deployed shell styles the drawer action group that replaced the top-bar dock");
  ok(!shell.text.includes(".abNavMobileTopActions"), "deployed shell carries no styling for the retired top-bar dock");
  ok(shell.text.includes("body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavDashboard{display:none!important}"), "deployed shell frees drawer height for the menu list");
  ok(shell.text.includes(".abQuickInputBody{overscroll-behavior:contain"), "deployed shell contains the quick input scroll");
  ok(shell.text.includes('.chipRow button:before{content:var(--ab-chip-icon'), "deployed shell draws quick input chip icons");

  const nav = await request(fixture, "/assets/accountbook-nav-v22889.js", { cookie: "" });
  eq(nav.response.status, 200, "new navigation asset is served");
  eq(nav.response.headers.get("etag"), '"accountbook-nav-v22889-js"', "new navigation ETag is correct");
  ok(nav.text.includes("syncGlobalActionPlacement"), "deployed navigation runtime places the global actions by viewport");
  ok(!nav.text.includes("dockMobileAction"), "deployed navigation runtime no longer docks a mobile action button");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22890.js", { cookie: "" });
  eq(v5.response.status, 200, "new V5 runtime asset is served");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22890-js"', "new V5 runtime ETag is correct");
  ok(v5.text.includes("function lockScroll()") && v5.text.includes("window.scrollTo(0, lockedScrollY)"), "deployed quick input runtime carries the scroll lock");

  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "personal home still renders");
  ok(home.text.includes("/assets/accountbook-shell-v22891.css"), "home loads the refreshed shell");
  ok(home.text.includes("/assets/accountbook-nav-v22889.js"), "home loads the refreshed navigation runtime");
  ok(home.text.includes("/assets/accountbook-v5-v22890.js"), "home loads the refreshed V5 runtime");
  ok(home.text.includes('class="abNavMobileTop"') && home.text.includes('id="abMobileMenuButton"'), "home keeps the mobile top bar and menu button the action docks beside");
  ok(home.text.includes('data-memo="점심"') && home.text.includes('data-pay-only='), "home quick input chips keep the attributes the icon CSS targets");
  ok(!home.text.includes('class="bottom"'), "home keeps the single unified bottom navigation");

  const report = await request(fixture, "/my/analysis?view=report&month=2026-07&household_id=house-home");
  eq(report.response.status, 200, "report page still renders");
  ok(report.text.includes('grid-template-columns:76px minmax(0,1fr)'), "report challenge settings ship the shrinkable grid");
  ok(report.text.includes('<input type="date" name="start_date"') && report.text.includes('<input type="date" name="target_date"'), "challenge date fields are unchanged");

  eq(fixture.db.transactions.length, beforeTransactions, "surface repairs write no transaction data");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.61 mobile surface repair (${checks} checks)`);
