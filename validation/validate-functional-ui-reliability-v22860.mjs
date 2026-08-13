import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { shiftChallengeDate } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.92-SCREEN-CLEANUP"'), "runtime exposes the functional UI reliability release");
ok(source.includes('data-report-challenge-form'), "challenge settings opt into inline save");
ok(source.includes('"x-accountbook-inline": "1"'), "challenge client marks only its own inline request");
ok(source.includes('event.preventDefault()'), "inline challenge save prevents full-page form navigation");
ok(source.includes('button.setAttribute("aria-busy", "true")'), "challenge save exposes its busy state");
ok(source.includes('challenge_html: renderReportChallenge'), "inline response returns authoritative refreshed challenge markup");
ok(source.includes('sidebar_html: renderReportChallenge'), "inline response refreshes the shared sidebar challenge");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22891.css"'), "changed shell uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22889.js"'), "changed navigation uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22890.js"'), "changed challenge runtime uses a new immutable path");
ok(source.includes('path === "/goals" || path === "/savings-goals"'), "client navigation recognizes goals routes");
ok(source.includes('path === "/annual" || path === "/annual-report"'), "client navigation recognizes annual report routes");
ok(source.includes('["/budget-alerts", "/today-budget", "/monthly-forecast", "/fixed-preview"]'), "client navigation recognizes all budget alert aliases");
ok(source.includes('const KAKAO_SKILL_MAX_BODY_BYTES = 256 * 1024'), "Kakao skill request size has an explicit bound");
ok(source.includes('readRequestTextBounded(request)'), "Kakao skill no longer buffers an unbounded request body");

async function request(fixture, path, { method = "GET", cookie = fixture.cookie, body, headers = {} } = {}) {
  const mergedHeaders = { "user-agent": "Mozilla/5.0", ...headers };
  if (cookie) mergedHeaders.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers: mergedHeaders, body }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const rootHead = await request(fixture, "/", { method: "HEAD", cookie: "" });
  eq(rootHead.response.status, 200, "public landing supports HEAD probes");
  eq(rootHead.text, "", "public landing HEAD response has no body");
  ok(String(rootHead.response.headers.get("content-type") || "").includes("text/html"), "public landing HEAD preserves the GET content type");

  const adsHead = await request(fixture, "/ads.txt", { method: "HEAD", cookie: "" });
  eq(adsHead.response.status, 200, "ads.txt supports HEAD probes");
  eq(adsHead.text, "", "ads.txt HEAD response has no body");
  ok(String(adsHead.response.headers.get("content-type") || "").includes("text/plain"), "ads.txt HEAD preserves its text content type");

  const shell = await request(fixture, "/assets/accountbook-shell-v22891.css", { cookie: "" });
  eq(shell.response.status, 200, "new shell asset is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22891-css"', "new shell ETag is correct");
  ok(shell.text.includes(".v8-tx summary{display:flex;align-items:center;min-height:44px"), "transaction edit control has a 44px touch target");
  ok(shell.text.includes(".kwRemove{width:40px!important;height:40px!important"), "mobile keyword remove control has a larger touch target");

  const nav = await request(fixture, "/assets/accountbook-nav-v22889.js", { cookie: "" });
  eq(nav.response.status, 200, "new navigation asset is served");
  eq(nav.response.headers.get("etag"), '"accountbook-nav-v22889-js"', "new navigation ETag is correct");
  ok(nav.text.includes('return "goals"') && nav.text.includes('return "annual"') && nav.text.includes('return "budget-alerts"'), "navigation asset preserves all newly mapped active keys");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22890.js", { cookie: "" });
  eq(v5.response.status, 200, "new V5 runtime asset is served");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22890-js"', "new V5 runtime ETag is correct");
  ok(v5.text.includes("data-report-challenge-form") && v5.text.includes("x-accountbook-inline"), "deployed V5 runtime contains inline challenge save");

  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const targetDate = shiftChallengeDate(today, 7);
  const invalidBody = new URLSearchParams({ household_id: "house-home", month: today.slice(0, 7), title: "8일 무지출", start_date: today, target_date: targetDate, target_days: "9", enabled: "1" });
  const invalid = await request(fixture, "/my/report-challenge/save", { method: "POST", body: invalidBody, headers: { accept: "application/json", "x-accountbook-inline": "1" } });
  eq(invalid.response.status, 422, "invalid inline challenge target is rejected without navigation");
  eq(JSON.parse(invalid.text).reason, "challenge_invalid", "invalid inline challenge returns a stable reason");
  eq(invalid.response.headers.get("location"), null, "invalid inline challenge never redirects");

  const body = new URLSearchParams({ household_id: "house-home", month: today.slice(0, 7), title: "8일 무지출", start_date: today, target_date: targetDate, target_days: "8", enabled: "1" });
  const saved = await request(fixture, "/my/report-challenge/save", { method: "POST", body, headers: { accept: "application/json", "x-accountbook-inline": "1" } });
  eq(saved.response.status, 200, "valid eight-day challenge saves inline");
  eq(saved.response.headers.get("location"), null, "successful inline challenge save never redirects");
  const savedPayload = JSON.parse(saved.text);
  eq(savedPayload.ok, true, "inline challenge response reports success");
  ok(savedPayload.challenge_html.includes('class="reportChallengePercent"'), "eight-day challenge immediately switches to percent mode");
  ok(savedPayload.sidebar_html.includes('class="abChallengePercent"'), "sidebar challenge immediately switches to percent mode");
  const stored = fixture.db.accountbook_settings.find((row) => row.key === "report_challenge:house-home");
  ok(stored, "eight-day challenge is persisted in the household setting");
  eq(JSON.parse(stored.value).target_days, 8, "persisted challenge target is eight days");

  const fallback = await request(fixture, "/my/report-challenge/save", { method: "POST", body: new URLSearchParams(body) });
  eq(fallback.response.status, 303, "non-JavaScript challenge save keeps progressive fallback");
  ok(String(fallback.response.headers.get("location") || "").includes("msg=challenge_saved"), "fallback redirects back with a success message");

  const noAuth = await request(fixture, "/my/report-challenge/save", { method: "POST", cookie: "", body: new URLSearchParams(body), headers: { accept: "application/json", "x-accountbook-inline": "1" } });
  eq(noAuth.response.status, 401, "expired inline session receives an explicit unauthorized response");
  eq(JSON.parse(noAuth.text).reason, "session_required", "expired inline session has a stable reason");

  const oversized = await request(fixture, "/skill", { method: "POST", cookie: "", body: "x".repeat(256 * 1024 + 1), headers: { "content-type": "application/json" } });
  eq(oversized.response.status, 200, "oversized Kakao request fails safely within the Kakao response contract");
  ok(oversized.text.includes("version"), "oversized Kakao request returns structured Kakao JSON");
  eq(fixture.db.transactions.length, beforeTransactions, "all reliability probes preserve transaction data");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.60 functional UI reliability (${checks} checks)`);
