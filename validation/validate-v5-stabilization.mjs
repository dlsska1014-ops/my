import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), "runtime reports the challenge and activity UX release");
ok(source.includes("function selectRequestedScopedHousehold"), "user APIs share strict household selection");
ok(source.includes('"&household_id=" + encodeURIComponent(currentHousehold())'), "search result links retain the active household");
ok(source.includes("favIds[fk] = !on"), "favorite optimistic rollback restores the previous state");
ok(source.includes('window.addEventListener("pagehide"'), "goal undo persistence uses pagehide");
ok(source.includes("keepalive: !!(options && options.keepalive)"), "goal pagehide request enables keepalive");
ok(source.includes("if (returnFocus && returnFocus.focus) returnFocus.focus()") && source.includes('closest("[data-abv5-search-open]")') && source.includes('closest("[data-abv5-notif-open]")') && source.includes('querySelector(\'[data-ab-global-open="actions"]\')') && source.includes("if (!overlay || !listBox) return;"), "V5 overlays restore focus and initialize dynamically-created search and notification triggers");
ok(source.includes('k === "Tab" && isOpen() && panel'), "V5 overlays trap keyboard focus");

async function request(fixture, path, { cookie = fixture.cookie, method = "GET", body } = {}) {
  const headers = { accept: "application/json" };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    method, headers, body: body === undefined ? undefined : JSON.stringify(body),
  }), fixture.env, {});
  const text = await response.text();
  let data = null;
  try { data = JSON.parse(text); } catch (error) {}
  return { response, text, data };
}

const fixture = await createV2265QaFixture();
try {
  const unauth = await request(fixture, "/u/api/tx/search?q=월급", { cookie: "" });
  eq(unauth.response.status, 401, "global search rejects anonymous access");

  const search = await request(fixture, "/u/api/tx/search?household=house-home&q=월급");
  eq(search.response.status, 200, "global search accepts the signed-in owner");
  eq(search.data.household_id, "house-home", "global search stays in the requested household");
  ok(search.data.results.some((row) => row.id === "tx-income-1"), "global search finds an all-period transaction");

  const badSearch = await request(fixture, "/u/api/tx/search?household=missing-household&q=월급");
  eq(badSearch.response.status, 404, "global search never falls back from an invalid household");
  const badNotifications = await request(fixture, "/u/api/notifications?household=missing-household&month=2026-07");
  eq(badNotifications.response.status, 404, "notifications never fall back from an invalid household");
  const settingsBefore = fixture.db.accountbook_settings.length;
  const badFavorite = await request(fixture, "/u/api/favorites", { method: "POST", body: { household: "missing-household", id: "tx-income-1", tx: { id: "tx-income-1" } } });
  eq(badFavorite.response.status, 404, "favorites never write to a fallback household");
  eq(fixture.db.accountbook_settings.length, settingsBefore, "invalid favorite request creates no setting");

  for (const [path, mime] of [
    ["/assets/accountbook-shell-v22910.css", "text/css"],
    ["/assets/accountbook-nav-v22893.js", "javascript"],
    ["/assets/accountbook-v5-v22890.js", "javascript"],
    ["/assets/accountbook-goals-v22843.js", "javascript"],
  ]) {
    const asset = await request(fixture, path);
    eq(asset.response.status, 200, `${path} is served`);
    ok(String(asset.response.headers.get("content-type") || "").includes(mime), `${path} has the correct MIME type`);
  }

  const home = await request(fixture, "/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "V5 home renders");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "V5 home keeps the HTML shell below 35 KiB");
  ok(home.text.includes("accountbook-v5-v22890.js"), "V5 home loads the shared bundle");
  ok(home.text.includes("accountbook-nav-v22893.js"), "V5 home loads the shared navigation runtime");

  const annual = await request(fixture, "/annual?month=2026-07&household_id=house-home");
  eq(annual.response.status, 200, "annual report renders in the selected household");
  const invalidAnnual = await request(fixture, "/annual?month=2026-07&household_id=missing-household");
  eq(invalidAnnual.response.status, 303, "annual report rejects an invalid household");

  const viewerMembership = fixture.db.household_members.find((row) => row.household_id === "house-home" && row.user_id === "user-wifi");
  viewerMembership.role = "viewer";
  const viewerCookie = await fixture.cookieFor("user-wifi");
  const viewerGoals = await request(fixture, "/u/api/goals?household=house-home", { cookie: viewerCookie });
  eq(viewerGoals.response.status, 200, "viewer can read goals");
  eq(viewerGoals.data.can_write, false, "goals API exposes viewer read-only state");
  const viewerPage = await request(fixture, "/goals?household_id=house-home&month=2026-07", { cookie: viewerCookie });
  eq(viewerPage.response.status, 200, "viewer goals page renders");
  ok(viewerPage.text.includes("조회 전용"), "viewer goals page explains read-only access");
  const viewerWrite = await request(fixture, "/u/api/goals", { cookie: viewerCookie, method: "POST", body: { household: "house-home", action: "create", name: "차단 목표", target: 10000 } });
  eq(viewerWrite.response.status, 403, "viewer cannot create a goal");
  ok(!fixture.db.accountbook_settings.some((row) => row.key === "goals:v5:house-home"), "viewer mutation persists nothing");

  fixture.db.accountbook_operation_locks.push({ operation_key: "goals-write:house-home", owner: "other-request", locked_until: new Date(Date.now() + 60000).toISOString(), updated_at: new Date().toISOString() });
  const busyGoal = await request(fixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "동시 목표", target: 10000 } });
  eq(busyGoal.response.status, 409, "concurrent goal write is rejected instead of overwriting settings");
  fixture.db.accountbook_operation_locks.find((row) => row.operation_key === "goals-write:house-home").locked_until = new Date(0).toISOString();

  const invalidGoal = await request(fixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "금액 없음", target: 0 } });
  eq(invalidGoal.response.status, 400, "goal target must be greater than zero");
  const validGoal = await request(fixture, "/u/api/goals", { method: "POST", body: { household: "house-home", action: "create", name: "비상금", target: 1000000, monthly: 100000 } });
  eq(validGoal.response.status, 200, "owner can create a valid goal");
  eq(validGoal.data.can_write, true, "goal mutation response retains write capability");
  eq(validGoal.data.goals[0].target, 1000000, "valid goal amount persists without truncation");
} finally {
  fixture.restore();
}

console.log(`V22.8.46 V5 stabilization: ${checks} checks passed`);
