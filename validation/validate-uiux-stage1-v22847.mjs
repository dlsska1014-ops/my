import fs from "node:fs";
import assert from "node:assert/strict";

const source = fs.readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
let checks = 0;
const ok = (value, message) => { checks += 1; assert.ok(value, message); };

ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), "stage 1 runtime version is explicit");
ok(source.includes('function buildNavMonthSummary('), "sidebar month summary helper exists");
ok(source.includes('function renderNavMiniCalendar('), "desktop mini calendar renderer exists");
// V22.8.90(지시서 4.2): 좌측 예산 위젯을 제거했다. 중앙 P0 와 같은 숫자를 두 번 말하고
// 있었고, 빈 링크 하나가 사이드바에서 탭 정지점을 차지하고 있었다.
// 지켜야 할 성질은 "예산 사용률을 볼 수 있다"이지 "사이드바에 있다"가 아니다 —
// V22.8.88 에서 그 자리는 홈 P0 가 되었으므로 거기서 확인한다.
ok(!source.includes('function renderNavBudgetUsage('), "sidebar budget widget renderer is gone");
ok(!source.includes('data-ab-nav-budget'), "no sidebar budget markup or client renderer remains");
// V22.8.93(9.3): 사용률 숫자와 게이지 막대에 스크립트가 쓸 값이 붙었다. 지키던
// 성질은 "예산 사용률을 한 곳에서, 홈 P0 에서 말한다"이고 그건 그대로다. 마크업이
// 한 벌만 있는지를 보면 되므로 문구와 값 배선만 견주고 속성은 따지지 않는다.
ok(source.includes('<div class="homeBudgetTop"><span>이번 달 쓸 수 있는 돈</span><em>예산 사용률 <span data-ab-num="${budgetUsedRatio}" data-ab-num-style="percent">${displayBudgetPercent}%</span></em></div>'), "budget usage is stated once, in the home P0");
ok((source.match(/예산 사용률 <span data-ab-num/g) || []).length === 1, "the usage sentence exists exactly once");
ok(source.includes('<div class="homeProgress"><i style="width:${budgetBarPercent}%"${homePrevBarAttr}></i></div>'), "the P0 draws the usage gauge");
ok(source.includes('const budgetBarPercent = Math.max(0, Math.min(100, budgetPercent || 0));'), "the gauge is still capped at 100 percent");
ok(source.includes('const displayBudgetPercent = Math.max(0, budgetPercent || 0);'), "the printed rate still shows real overuse above 100 percent");
ok(source.includes('showSidebarDashboard: true, sidebarRows: rows, sidebarBudget: budget'), "app reuses already-fetched rows and budget without a new DB request");
ok(source.includes('class="abNavDashboard"'), "sidebar dashboard container is rendered");
ok(source.includes('class="abNavCalendar"'), "sidebar calendar markup is rendered");
ok(source.includes('new Date(Date.UTC(year, mon - 1, 1)).getUTCDay()'), "calendar weekday offset is computed in the external runtime");
ok(source.includes('for (var b = 0; b < firstDow; b++)'), "calendar renders computed leading blanks");
ok(source.includes('&view=calendar&date=" + encodeURIComponent(date) + "&feed=all#feed'), "calendar date links preserve the existing date-filter flow");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22912.css"'), "current release uses a fresh immutable shell asset");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22890.js"'), "current release uses a fresh immutable V5 bundle");
ok(source.includes('"accountbook-shell-v22912-css"'), "current shell has a distinct ETag");
ok(source.includes('body.abV22812Shell{--abNavW:252px}'), "desktop sidebar width follows the design handoff");
ok(source.includes('.abNavCalGrid{display:grid;grid-template-columns:repeat(7'), "mini calendar uses a seven-column grid");
ok(source.includes('.abNavBudget.isWarn'), "warning state style exists");
ok(source.includes('.abNavBudget.isOver'), "over-budget state style exists");
ok(source.includes('body.abV22812Shell.abNavCollapsed .abNavDashboard{display:none!important}'), "collapsed navigation hides the dashboard cleanly");
ok(!source.includes('fetchSidebar'), "stage 1 does not introduce a new sidebar fetch path");

console.log(`V22.8.48 cumulative UIUX stage 1 validation passed: ${checks} checks`);
