import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.74-BUDGET-DARK-CONTRAST"'), "runtime exposes the skip-to-content release");
ok(source.includes("function addSkipToContentLink("), "the shell inserts a skip-to-content link");
// 감추는 방식이 중요하다. display:none·visibility:hidden 이면 포커스가 가지 않아 링크가 없는 것과 같다.
ok(!/\.abSkipLink\{[^}]*(display:none|visibility:hidden)/.test(source), "the skip link is not hidden in a way that blocks focus");
ok(/body\.abV22812Shell \.abSkipLink\{[^}]*position:fixed/.test(source), "the skip link is taken out of the layout flow");
ok(/\.abSkipLink:focus[^{]*\{[^}]*top:12px/.test(source), "the skip link comes into view when focused");
ok(/\.abSkipLink\{[^}]*min-height:44px/.test(source), "the skip link meets the 44px target size");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22874.css"'), "the shell stylesheet moved to a new immutable address");
ok(source.includes('"accountbook-shell-v22874-css"'), "the shell stylesheet ships a matching ETag");

const ORIGIN = "https://ttokttok-accountbook.com";
const q = "month=2026-08&household_id=house-home";
// 사용자가 실제로 여는 화면 전부. 한 화면이라도 빠지면 그 화면에서만 키보드 사용자가 갇힌다.
const PAGES = [
  ["홈", `/app?${q}`],
  ["거래 내역", `/app?${q}&tab=transactions`],
  ["캘린더", `/app?${q}&view=calendar`],
  ["정기지출", `/reserve-plans?${q}`],
  ["가져오기", `/my/backup?${q}&mode=import`],
  ["영수증 기록", `/receipts?${q}`],
  ["자산·계좌", `/payment-methods?${q}`],
  ["저축·목표", `/goals?${q}`],
  ["통계", `/my/analysis?${q}`],
  ["종합 리포트", `/my/analysis?${q}&view=report`],
  ["예산", `/budgets?${q}`],
  ["월 마감", `/reports?${q}`],
  ["연간 리포트", `/annual?year=2026&household_id=house-home`],
  ["스마트 도구", `/smart-tools?${q}`],
  ["예산 알림", `/budget-alerts?${q}`],
  ["부부 정산", `/settlement-summary?${q}`],
  ["참여자·초대", `/my/members?${q}`],
  ["단톡방 연결", `/my/groups?${q}`],
  ["가계부 전환·추가", `/my/households?${q}`],
  ["분류·키워드", `/keyword-guide?${q}`],
  ["백업·복구", `/my/backup?${q}&mode=backup`],
  ["설정", `/my/settings?${q}`],
  ["전체 메뉴", `/menu?${q}`],
  ["처음 사용 가이드", `/start-guide?${q}`],
];

const fixture = await createV2265QaFixture();
try {
  for (const [name, path] of PAGES) {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { cookie: fixture.cookie } }), fixture.env, {});
    eq(response.status, 200, `${name} 화면이 열린다`);
    const html = await response.text();

    const skip = html.match(/<a class="abSkipLink" href="#([^"]+)">([^<]+)<\/a>/);
    ok(skip, `${name}: 본문 바로가기 링크가 있다`);
    if (!skip) continue;
    eq(skip[2], "본문 바로가기", `${name}: 링크 문구가 무엇을 하는지 말한다`);

    // 문서에서 첫 번째로 포커스되는 것이어야 뜻이 있다. 뒤에 있으면 이미 내비를 다 지난 뒤다.
    const bodyStart = html.search(/<body\b[^>]*>/i);
    const firstFocusable = html.slice(bodyStart).search(/<(?:a\s[^>]*href|button|input|select|textarea|summary)\b/i);
    const skipAt = html.slice(bodyStart).indexOf('<a class="abSkipLink"');
    eq(skipAt, firstFocusable, `${name}: 본문 바로가기가 첫 번째 포커스 대상이다`);

    // 목적지가 실재하고 포커스를 받을 수 있어야 다음 Tab 이 본문에서 이어진다.
    const target = new RegExp(`<main\\b[^>]*id="${skip[1]}"[^>]*>|<main\\b[^>]*>`, "i").exec(html);
    ok(target && target[0].includes(`id="${skip[1]}"`), `${name}: 링크가 가리키는 main 이 실제로 있다`);
    ok(target && /tabindex="-1"/.test(target[0]), `${name}: main 이 포커스를 받을 수 있다`);
    eq((html.match(/<a class="abSkipLink"/g) || []).length, 1, `${name}: 본문 바로가기가 중복되지 않는다`);
  }

  // 이미 id 가 있는 main 은 그 id 를 그대로 쓴다. 갈아 끼우면 그 id 를 쓰던 링크가 끊긴다.
  ok(source.includes("const existing = raw.match(/\\bid\\s*=\\s*([\"'])(.*?)\\1/i);"), "an existing main id is reused rather than replaced");

  // 셸을 쓰지 않는 화면(카카오 스킬 안내 등)에는 넣지 않는다.
  const skillPage = await app.fetch(new Request(`${ORIGIN}/skill`), fixture.env, {});
  const skillHtml = await skillPage.text();
  ok(!skillHtml.includes('class="abSkipLink"'), "셸을 쓰지 않는 화면에는 넣지 않는다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.72 skip to content (${checks} checks)`);
