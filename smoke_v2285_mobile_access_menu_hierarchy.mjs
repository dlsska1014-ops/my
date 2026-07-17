import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

const fixture = await createV2265QaFixture();
let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

async function get(path, { authenticated = true, env = fixture.env } = {}) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    headers: authenticated ? { cookie: fixture.cookie } : {},
    redirect: "manual",
  }), env, {});
  return { response, html: await response.text() };
}

function mainMarkup(html) {
  const start = html.indexOf('<main class="wrap">');
  const end = html.lastIndexOf("</main>");
  return start >= 0 && end >= start ? html.slice(start, end + 7) : "";
}

try {
  let result = await get("/health", { authenticated: false, env: {} });
  eq(result.response.status, 200, "health opens");
  eq(JSON.parse(result.html).version, "V22.8.5-MOBILE-ACCESS-MENU-HIERARCHY", "V22.8.5 is exposed");

  result = await get("/my", { authenticated: false, env: {} });
  eq(result.response.status, 200, "mobile fallback login opens");
  for (const token of [
    "abPageLogin",
    'action="/my/local-login"',
    "PC의 전체 메뉴 → 개인 비밀번호",
    'class="card signupCard"',
    'class="loginOptional"',
  ]) ok(result.html.includes(token), `login includes ${token}`);
  ok(!result.html.includes('href="/auth/kakao/start"'), "incomplete Kakao configuration never exposes a broken OAuth button");

  result = await get("/menu?month=2026-07&household_id=house-home");
  eq(result.response.status, 200, "hierarchical menu opens");
  eq((result.html.match(/class="featuredCard"/g) || []).length, 4, "exactly four daily actions are featured");
  for (const token of ["menuJourney", "featuredGrid", "menuSecondary", "advancedGroup", "abNavGroupPrimary", "abNavItemIcon"]) {
    ok(result.html.includes(token), `menu includes ${token}`);
  }
  ok(!result.html.includes('class="group"'), "menu removes box-inside-box group cards");
  ok(!result.html.includes('class="abNavGroupCount"'), "sidebar removes decorative group counters");
  ok(result.html.includes("/my/backup-login?return_to="), "mobile recovery is directly reachable from the menu");

  result = await get("/my/analysis?month=2026-07&household_id=house-home");
  eq(result.response.status, 200, "analysis opens");
  const analysisMain = mainMarkup(result.html);
  ok(analysisMain.length > 5000, "analysis main content is present");
  eq(
    createHash("sha256").update(analysisMain).digest("hex"),
    "564b58c13f2a48435d910fb8cf47f6ec784dd9f919cff6d552074b9d134dd17f",
    "analysis main markup remains exactly identical to V22.8.4",
  );

  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  ok(source.includes("V2285_MENU_STYLE"), "route-aware menu layer exists");
  ok(source.includes("V2285_LOGIN_STYLE"), "route-aware login layer exists");
  ok(source.includes("V2285_NAV_STYLE"), "route-aware navigation layer exists");
  ok((source.match(/querySelectorAll\("\.abNavBody, \.abNavMobileDrawer"\)/g) || []).length >= 2, "both full and shell runtimes enforce one-open-group navigation");
  ok(source.includes("const [user, access] = await Promise.all"), "menu user and access lookup are parallelized");

  console.log(`SMOKE_V2285_MOBILE_ACCESS_MENU_HIERARCHY_OK checks=${checks}`);
} finally {
  fixture.restore();
}
