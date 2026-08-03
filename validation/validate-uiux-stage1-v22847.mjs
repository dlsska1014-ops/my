import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
let checks = 0;
const ok = (value, message) => { checks += 1; assert.ok(value, message); };

ok(source.includes('const APP_VERSION = "V22.8.69-KAKAO-MEMO-REPEAT-FIX"'), "stage 1 runtime version is explicit");
ok(source.includes('function buildNavMonthSummary('), "sidebar month summary helper exists");
ok(source.includes('function renderNavMiniCalendar('), "desktop mini calendar renderer exists");
ok(source.includes('function renderNavBudgetUsage('), "live budget usage renderer exists");
ok(source.includes('showSidebarDashboard: true, sidebarRows: rows, sidebarBudget: budget'), "app reuses already-fetched rows and budget without a new DB request");
ok(source.includes('class="abNavDashboard"'), "sidebar dashboard container is rendered");
ok(source.includes('class="abNavCalendar"'), "sidebar calendar markup is rendered");
ok(source.includes('class="abNavBudget'), "sidebar budget markup is rendered");
ok(source.includes('role=\"progressbar\"'), "budget usage exposes progressbar semantics in the client renderer");
ok(source.includes("aria-valuenow=\"' + barRate + '\""), "budget progress exposes the clamped rate");
ok(source.includes('rawRate >= 90 ? "isOver" : rawRate >= 70 ? "isWarn" : "isSafe"'), "budget threshold colors use 70 and 90 percent boundaries");
ok(source.includes('Math.min(100, rawRate)'), "budget bar width is capped at 100 percent");
ok(source.includes('new Date(Date.UTC(year, mon - 1, 1)).getUTCDay()'), "calendar weekday offset is computed in the external runtime");
ok(source.includes('for (var b = 0; b < firstDow; b++)'), "calendar renders computed leading blanks");
ok(source.includes('&view=calendar&date=" + encodeURIComponent(date) + "&feed=all#feed'), "calendar date links preserve the existing date-filter flow");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22868.css"'), "current release uses a fresh immutable shell asset");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22861.js"'), "current release uses a fresh immutable V5 bundle");
ok(source.includes('"accountbook-shell-v22868-css"'), "current shell has a distinct ETag");
ok(source.includes('body.abV22812Shell{--abNavW:252px}'), "desktop sidebar width follows the design handoff");
ok(source.includes('.abNavCalGrid{display:grid;grid-template-columns:repeat(7'), "mini calendar uses a seven-column grid");
ok(source.includes('.abNavBudget.isWarn'), "warning state style exists");
ok(source.includes('.abNavBudget.isOver'), "over-budget state style exists");
ok(source.includes('body.abV22812Shell.abNavCollapsed .abNavDashboard{display:none!important}'), "collapsed navigation hides the dashboard cleanly");
ok(!source.includes('fetchSidebar'), "stage 1 does not introduce a new sidebar fetch path");

console.log(`V22.8.48 cumulative UIUX stage 1 validation passed: ${checks} checks`);
