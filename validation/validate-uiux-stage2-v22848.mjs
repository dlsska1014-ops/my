import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.51-INPUT-AMOUNT-RUNTIME-REGEX-FIX"'), "stage 2 runtime version is explicit");
ok(source.includes('url.pathname === "/u/api/day-transactions"'), "day detail read endpoint is routed");
ok(source.includes("async function handleUserDayTransactions"), "day detail handler exists");
ok(source.includes("getScopedHouseholdsForPage(request, env)"), "day detail uses signed-in household scope");
ok(source.includes("selectRequestedScopedHousehold(scope.households, requested)"), "day detail never falls back to an unrelated household");
ok(source.includes('fetchAdminRows(env, { month, householdId: household.id, type: "all", date })'), "day detail queries only the selected date");
ok(source.includes("const displayLimit = 250"), "day popup applies a bounded display limit");
ok(source.includes("accountbookDayDetailClientMain"), "day popup client exists");
ok(source.includes('a.abNavCalDay[data-ab-day],a.calDay.hasRec[data-ab-day]'), "sidebar and full calendar use the same popup client");
ok(source.includes('role=\"dialog\" aria-modal=\"true\"'), "popup exposes modal semantics");
ok(source.includes('event.key === "Escape"'), "popup supports Escape close");
ok(source.includes('event.key !== "Tab"'), "popup traps keyboard focus");
ok(source.includes("lastTrigger.focus()"), "popup restores focus to the selected date");
ok(source.includes("activeRequest.abort()"), "repeated date selections cancel stale requests");
ok(source.includes("이 날짜가 선택된 빠른 입력을 바로 열 수 있습니다."), "empty day is connected to quick input in the cumulative release");
ok(source.includes(".abDayDetailOverlay"), "day popup styling exists");
ok(source.includes("@media(max-width:899px){body.abV22812Shell .abDayDetailOverlay{align-items:flex-end"), "mobile day detail becomes a bottom sheet");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22850.css"'), "stage 2 uses a new shell asset");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22850.js"'), "stage 2 uses a new V5 asset");
ok(source.includes('data-ab-day="${escapeHtml(date)}" data-ab-household-id="${escapeHtml(calendarHouseholdId)}"'), "full calendar emits secure day hooks");
ok(source.includes('data-ab-day="\' + date + \'" data-ab-household-id="\' + householdId + \'"'), "sidebar calendar emits day hooks");

async function request(fixture, path, { cookie = fixture.cookie } = {}) {
  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (_) {}
  return { response, text, data };
}

const fixture = await createV2265QaFixture();
try {
  const beforeCount = fixture.db.transactions.length;
  const anonymous = await request(fixture, "/u/api/day-transactions?household_id=house-home&date=2026-07-04", { cookie: "" });
  eq(anonymous.response.status, 401, "anonymous users cannot read day transactions");

  const invalidDate = await request(fixture, "/u/api/day-transactions?household_id=house-home&date=2026-07-99");
  eq(invalidDate.response.status, 400, "invalid dates are rejected");

  const invalidHousehold = await request(fixture, "/u/api/day-transactions?household_id=missing-household&date=2026-07-04");
  eq(invalidHousehold.response.status, 404, "invalid households never fall back");

  const day = await request(fixture, "/u/api/day-transactions?household_id=house-home&date=2026-07-04");
  eq(day.response.status, 200, "owner can read a selected day");
  eq(day.data.household_id, "house-home", "day response stays in the selected household");
  eq(day.data.date, "2026-07-04", "day response retains the requested date");
  eq(day.data.count, 1, "day response reports the exact transaction count");
  eq(day.data.expense, 148000, "day response totals expense accurately");
  eq(day.data.income, 0, "day response totals income accurately");
  eq(day.data.items[0].memo, "주말 장보기", "day response includes the actual memo");
  eq(day.data.items[0].category, "식비", "day response includes the actual category");
  eq(day.data.items[0].payment_method, "국민카드", "day response includes payment method");
  eq(day.data.items[0].member, "WIFI♥", "day response includes the household member display name");

  const empty = await request(fixture, "/u/api/day-transactions?household_id=house-home&date=2026-07-02");
  eq(empty.response.status, 200, "empty days still return a valid response");
  eq(empty.data.count, 0, "empty day count is zero");
  eq(empty.data.items.length, 0, "empty day contains no fabricated items");

  const viewerCookie = await fixture.cookieFor("user-wifi");
  const viewerDay = await request(fixture, "/u/api/day-transactions?household_id=house-home&date=2026-07-04", { cookie: viewerCookie });
  eq(viewerDay.response.status, 200, "viewer household members can read day details");
  const viewerOtherHouse = await request(fixture, "/u/api/day-transactions?household_id=house-trip&date=2026-07-12", { cookie: viewerCookie });
  eq(viewerOtherHouse.response.status, 404, "viewer cannot read a household they did not join");

  eq(fixture.db.transactions.length, beforeCount, "day detail reads do not mutate transactions");

  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "home renders with stage 2 assets");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "default home remains below the 35 KiB HTML budget");
  ok(home.text.includes('/assets/accountbook-v5-v22850.js'), "home loads the stage 2 V5 bundle");
  const calendarHome = await request(fixture, "/app?month=2026-07&household_id=house-home&view=calendar");
  eq(calendarHome.response.status, 200, "calendar view renders with stage 2 hooks");
  ok(calendarHome.text.includes('data-ab-day="2026-07-04"'), "home calendar emits a popup date hook");

  const asset = await request(fixture, "/assets/accountbook-v5-v22850.js");
  eq(asset.response.status, 200, "stage 2 V5 asset is served");
  ok(asset.text.includes("/u/api/day-transactions?date="), "stage 2 asset calls the scoped day endpoint");
  ok(asset.text.includes("abDayDetailOverlay"), "stage 2 asset contains the popup runtime");
} finally {
  fixture.restore();
}

console.log(`V22.8.48 UIUX stage 2 validation passed: ${checks} checks`);
