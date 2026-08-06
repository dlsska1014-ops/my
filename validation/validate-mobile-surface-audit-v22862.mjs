import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.74-BUDGET-DARK-CONTRAST"'), "runtime exposes the audit fix release");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22874.css"'), "changed shell uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22862.js"'), "navigation runtime uses a new immutable path");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22873.js"'), "unchanged V5 runtime keeps its immutable path");
ok(source.includes('const MOBILE_HOME_CSS_ASSET_PATH = "/assets/mobile-home-v22873.css"'), "byte-pinned legacy home stylesheet keeps its path");

// 1. 상단바에 도킹한 버튼은 전역 button{width:100%} 규칙에 늘어나면 안 된다.
ok(source.includes("body.abV22812Shell .abNavMobileTopActions>*{flex:0 0 auto;width:auto!important}"), "docked top-bar controls keep their intrinsic width");

// 2. 최근 내역 필터가 폼 밖으로 칸을 밀어내면 안 된다.
ok(source.includes("body.abV22812Shell .mobileFilterForm{grid-template-columns:minmax(0,1fr)!important}"), "mobile filter form track can shrink");
ok(source.includes("body.abV22812Shell .mobileFilterForm>*{min-width:0}"), "mobile filter form children can shrink");
ok(source.includes("body.abV22812Shell :is(.filterQuick,.filterAdvancedGrid){grid-template-columns:repeat(2,minmax(0,1fr))}"), "filter sub-grids can shrink");

// 3. 고정 상단바가 있는 화면에서 앵커가 헤더 아래로 들어가면 안 된다.
ok(source.includes("@media(max-width:899px){html{scroll-padding-top:calc(64px + env(safe-area-inset-top,0px))}}"), "mobile anchors clear the fixed top bar");
ok(source.includes("@media(min-width:900px){html{scroll-padding-top:20px}}"), "desktop anchors keep a small offset");

async function request(fixture, path, { method = "GET", cookie = fixture.cookie, headers = {} } = {}) {
  const mergedHeaders = { "user-agent": "Mozilla/5.0", ...headers };
  if (cookie) mergedHeaders.cookie = cookie;
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { method, headers: mergedHeaders }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const shell = await request(fixture, "/assets/accountbook-shell-v22874.css", { cookie: "" });
  eq(shell.response.status, 200, "new shell asset is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22874-css"', "new shell ETag is correct");
  ok(shell.text.includes("width:auto!important"), "deployed shell pins the docked control width");
  ok(shell.text.includes(".mobileFilterForm{grid-template-columns:minmax(0,1fr)!important}"), "deployed shell ships the shrinkable filter grid");
  ok(shell.text.includes("scroll-padding-top:calc(64px + env(safe-area-inset-top,0px))"), "deployed shell ships the anchor offset");
  ok(shell.text.includes("--action:var(--ab12-action)"), "V22.8.61 token aliases are preserved");
  ok(shell.text.includes(".chipRow button:before{content:var(--ab-chip-icon"), "V22.8.61 chip icons are preserved");

  const nav = await request(fixture, "/assets/accountbook-nav-v22862.js", { cookie: "" });
  eq(nav.response.status, 200, "new navigation asset is served");
  eq(nav.response.headers.get("etag"), '"accountbook-nav-v22862-js"', "new navigation ETag is correct");
  ok(nav.text.includes("dockMobileAction"), "deployed navigation runtime still docks the mobile action button");

  // 점검한 모든 사용자 탭이 200으로 응답하고 새 셸을 정확히 한 번 참조해야 한다.
  const month = "2026-07";
  const hh = "house-home";
  const q = `month=${month}&household_id=${hh}`;
  const tabs = [
    ["홈", `/app?${q}`],
    ["캘린더", `/app?${q}&view=calendar`],
    ["정기지출", `/reserve-plans?${q}`],
    ["영수증", `/receipts?${q}`],
    ["자산·계좌", `/payment-methods?${q}`],
    ["저축·목표", `/goals?${q}`],
    ["통계", `/my/analysis?${q}`],
    ["종합 리포트", `/my/analysis?${q}&view=report`],
    ["예산", `/budgets?${q}`],
    ["월 마감", `/reports?${q}`],
    ["스마트 도구", `/smart-tools?${q}`],
    ["예산 알림", `/budget-alerts?${q}`],
    ["부부 정산", `/settlement-summary?${q}`],
    ["참여자·초대", `/my/members?${q}`],
    ["단톡방 연결", `/my/groups?${q}`],
    ["가계부 전환·추가", `/my/households?${q}`],
    ["분류·키워드", `/keyword-guide?${q}`],
    ["백업·복구", `/my/backup?${q}&mode=backup`],
    ["전체 메뉴", `/menu?${q}`],
    ["처음 사용 가이드", `/start-guide?${q}`],
  ];
  for (const [name, path] of tabs) {
    const page = await request(fixture, path);
    eq(page.response.status, 200, `${name} 탭이 200으로 응답한다`);
    const shellRefs = page.text.split('href="/assets/accountbook-shell-v22874.css"').length - 1;
    eq(shellRefs, 1, `${name} 탭이 새 셸을 정확히 한 번 참조한다`);
    ok(!page.text.includes("accountbook-shell-v22861.css") && !page.text.includes("accountbook-nav-v22861.js"), `${name} 탭에 이전 버전 자산이 남아 있지 않다`);
    ok(page.text.includes('class="abNavMobileTop"'), `${name} 탭이 모바일 상단바를 렌더한다`);
  }

  eq(fixture.db.transactions.length, beforeTransactions, "탭 점검은 거래 데이터를 바꾸지 않는다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.62 mobile surface audit fix (${checks} checks)`);
