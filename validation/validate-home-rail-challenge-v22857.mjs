import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, {
  shiftChallengeDate,
  challengePeriodDays,
  normalizeReportChallenge,
  buildReportChallenge,
  renderReportChallenge,
} from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.76-KAKAO-INTENT-SKILL-AUTH"'), "current runtime version is explicit");
ok(source.includes('if (url.pathname === "/u/api/recent-transactions" && request.method === "GET")'), "recent transaction API is GET-only");
ok(!source.includes('url.pathname === "/u/api/recent-transactions" && request.method === "POST"'), "right rail adds no write route");
ok(source.includes("async function handleUserRecentTransactions"), "scoped recent transaction handler exists");
ok(source.includes("getScopedHouseholdsForPage(request, env)"), "recent transaction API uses authenticated household scope");
ok(source.includes("selectRequestedScopedHousehold(scope.households, requested)"), "requested household is validated against the session scope");
ok(source.includes("rows.slice(0, 80).map"), "right rail response is bounded");
ok(source.includes("function accountbookActivityRailClientMain"), "desktop activity rail client exists");
ok(source.includes('window.matchMedia("(min-width:1320px)")'), "activity rail stays desktop-only");
ok(source.includes('(${accountbookActivityRailClientMain.toString()})();'), "activity rail ships in the immutable shared bundle");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22874.css"'), "changed shell uses a fresh immutable asset URL");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22873.js"'), "changed V5 behavior uses a fresh immutable asset URL");
ok(source.includes('"accountbook-shell-v22874-css"'), "shell ETag is refreshed");
ok(source.includes('"accountbook-v5-v22873-js"'), "V5 bundle ETag is refreshed");
ok(source.includes("renderAccountbookBrandIcon"), "navigation uses one SVG brand icon renderer");
ok(source.includes('class="abNavToggleIcon"'), "collapse button uses a stable SVG chevron");
ok(source.includes(".abNavCollapsed .abNavToggleIcon{transform:rotate(180deg)"), "only the collapse icon rotates");
ok(source.includes("right:-15px!important;top:20px!important"), "collapse control stays on the sidebar edge in both states");
ok(source.includes("width:calc(100% - 32px)!important;max-width:1280px!important"), "home header and content share the same desktop width contract");
ok(source.includes(":root{--abActivityRailW:340px}"), "right rail width is explicit");
ok(source.includes("padding-right:var(--abActivityRailW)!important"), "desktop home reserves space for the right rail");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const target = shiftChallengeDate(today, 6);
eq(challengePeriodDays(today, target), 7, "inclusive challenge range counts seven days");
eq(shiftChallengeDate("2026-07-30", 2), "2026-08-01", "challenge dates cross month boundaries safely");
const normalized = normalizeReportChallenge({ target_days: 7, start_date: today, target_date: target, title: "  절약   주간  " });
eq(normalized.targetDays, 7, "challenge preserves a valid seven-day target");
eq(normalized.periodDays, 7, "challenge exposes the configured date range");
eq(normalized.title, "절약 주간", "challenge title is normalized");
const newChallenge = buildReportChallenge([], today.slice(0, 7), { target_days: 7, start_date: today, target_date: target, title: "절약 주간" });
eq(newChallenge.currentDay, 1, "new challenge starts on day one");
eq(newChallenge.evaluatedDays, 0, "the unfinished current day is not awarded");
eq(newChallenge.progress, 0, "a newly saved seven-day challenge never appears as 7/7");
eq(newChallenge.rate, 0, "new challenge progress starts at zero percent");
const pastChallenge = buildReportChallenge([
  { type: "expense", amount: 1000, transaction_date: "2025-02-03" },
], "2025-02", { target_days: 4, start_date: "2025-02-01", target_date: "2025-02-07" });
eq(pastChallenge.completedDays, 6, "past range counts only finalized no-spend days");
eq(pastChallenge.progress, 4, "completed progress is capped at the configured target");
eq(pastChallenge.rate, 100, "completed challenge reaches one hundred percent");
const rendered = renderReportChallenge(newChallenge, { householdId: "hh-1", canManage: true });
ok(rendered.includes('name="start_date"'), "challenge form exposes a start date");
ok(rendered.includes('name="target_date"'), "challenge form exposes a target date");
ok(rendered.includes("오늘"), "challenge shows the current reference date");
ok(rendered.includes("무지출 0/7일"), "challenge distinguishes completed days from period position");

async function request(fixture, path, { cookie = fixture.cookie, method = "GET" } = {}) {
  const headers = { accept: "text/html,application/json", "user-agent": "Mozilla/5.0" };
  if (cookie) headers.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const before = fixture.db.transactions.length;
  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "home renders with the restored dashboard layout");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "home remains below the protected 35 KiB HTML budget");
  ok(home.text.includes('/assets/accountbook-shell-v22874.css'), "home loads the refreshed shell asset");
  ok(home.text.includes('/assets/accountbook-v5-v22873.js'), "home loads the refreshed V5 bundle");
  ok(home.text.includes('class="reportChallenge"'), "challenge is visible in the home content");
  ok(home.text.includes('class="abNavChallenge'), "challenge is also available in the expanded desktop sidebar");
  ok(home.text.includes('class="abBrandIcon"'), "home navigation renders the SVG brand icon");
  ok(home.text.includes('class="abNavToggleIcon"'), "home navigation renders the corrected collapse icon");
  ok(!home.text.includes('class="abActivityRail"'), "right rail markup stays out of initial HTML and loads responsively");
  eq(fixture.db.transactions.length, before, "home rendering stays read-only");

  const noAuth = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-home", { cookie: "" });
  eq(noAuth.response.status, 401, "anonymous recent transaction access is rejected");
  eq(JSON.parse(noAuth.text).reason, "unauthorized", "anonymous response uses the stable reason");
  const memberCookie = await fixture.cookieFor("user-wifi");
  const forbidden = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-trip", { cookie: memberCookie });
  eq(forbidden.response.status, 404, "a member cannot inspect another household in the right rail");

  const rail = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-home");
  eq(rail.response.status, 200, "scoped recent transaction API succeeds");
  const data = JSON.parse(rail.text);
  eq(data.household_id, "house-home", "right rail preserves selected household scope");
  eq(data.count, 5, "right rail counts all scoped monthly fixture rows");
  eq(data.totals.income, 3380000, "right rail totals monthly income");
  eq(data.totals.expense, 248600, "right rail totals monthly expense");
  eq(data.totals.balance, 3131400, "right rail calculates monthly balance");
  ok(data.rows.some((row) => row.member === "WIFI♥"), "right rail resolves household member names");
  eq(fixture.db.transactions.length, before, "right rail API remains read-only");

  const shell = await request(fixture, "/assets/accountbook-shell-v22874.css");
  eq(shell.response.status, 200, "refreshed shell asset is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22874-css"', "refreshed shell ETag is correct");
  ok(shell.text.includes(".abActivityRail"), "shell contains restored activity rail styles");
  ok(shell.text.includes("body.abV22812Shell .reportChallenge{"), "shell contains home challenge styles");
  ok(shell.text.includes("right:-15px!important;top:20px!important"), "shell contains stable collapse button placement");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22873.js");
  eq(v5.response.status, 200, "refreshed V5 asset is served");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22873-js"', "refreshed V5 ETag is correct");
  ok(v5.text.includes("/u/api/recent-transactions"), "V5 bundle calls only the scoped recent transaction endpoint");
  ok(v5.text.includes("data-ab-activity-rail"), "V5 bundle contains responsive activity rail behavior");
  eq(fixture.db.transactions.length, before, "asset delivery does not mutate transactions");
} finally {
  fixture.restore();
}

console.log(`PASS: preserved home rail and challenge baseline (${checks} checks)`);
