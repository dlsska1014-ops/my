import assert from "node:assert/strict";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const fixture = await createV2265QaFixture();

async function get(path, cookie = fixture.cookie) {
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }), fixture.env, {});
}

try {
  let response = await get("/my/households?month=2026-07&household_id=house-home");
  eq(response.status, 200, "user household switch page opens directly");
  let html = await response.text();
  ok(html.includes("가계부 전환·관리") && html.includes("새 가계부 만들기"), "household switch/create content is rendered");
  ok(!html.includes("관리자 비밀번호를 입력하세요"), "household switch page never asks for the global admin password");

  response = await get("/menu?month=2026-07&household_id=house-home");
  eq(response.status, 200, "user menu opens");
  html = await response.text();
  for (const href of [
    "/my/households?month=2026-07&amp;household_id=house-home",
    "/my/members?month=2026-07&amp;household_id=house-home",
    "/budgets?month=2026-07&amp;household_id=house-home",
    "/my/backup-login?return_to=",
  ]) ok(html.includes(href), `user menu contains ${href}`);
  ok(!html.includes('href="/settings"'), "user menu does not expose the admin settings link");

  response = await get("/settings");
  eq(response.status, 303, "logged-in user is recovered away from admin settings");
  ok(String(response.headers.get("location") || "").startsWith("/my/backup-login?return_to="), "user is sent to personal password settings");

  response = await get("/settings", "");
  eq(response.status, 401, "unauthenticated admin settings remains protected");
  html = await response.text();
  ok(html.includes("관리자 비밀번호를 입력하세요"), "administrator authentication is retained only for the admin route");
} finally {
  fixture.restore();
}

console.log(`V22.7.3 user-navigation smoke passed: ${checks} checks`);
