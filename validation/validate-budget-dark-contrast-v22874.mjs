import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const perf = readFileSync(new URL("./validate-performance-v22811.mjs", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.86-DEFERRED-EDIT-FORMS"'), "runtime exposes the budget and dark contrast release");

// ── 1. 예산 검사가 "이번 달"을 재야 한다 ────────────────────────────
// 2026-07 을 고정으로 보면 그 달이 지난 뒤에는 오늘 표시가 빠져 더 작게 측정된다.
// 그러면 검사가 통과해도 사용자가 흔히 보는 화면은 예산을 넘고 있을 수 있다.
ok(perf.includes("const realisticMonth = new Date().toISOString().slice(0, 7);"), "the realistic budget check measures the current month");
ok(!perf.includes('/app?month=2026-07&household_id=house-home", { headers: { cookie: realisticFixture.cookie'), "the realistic budget check no longer pins a past month");
ok(perf.includes("const REALISTIC_HOME_BUDGET = 46 * 1024;"), "the realistic budget was reset from measured evidence");

// ── 2. 선택되지 않은 option 에 잉여 공백이 남지 않는다 ────────────────
// `value="x" ${cond ? "selected" : ""}` 는 선택되지 않으면 `value="x" >` 가 되어
// option 하나마다 1바이트가 새어 나간다. 공백을 조건 안으로 옮겨 회수했다.
ok(!/" \$\{[^{}]*\? "selected" : ""\}/.test(source), "no option template leaks a trailing space when unselected");
ok(!/" \$\{[^{}]*\? "checked" : ""\}/.test(source), "no checkbox template leaks a trailing space when unchecked");
ok(source.includes('? " selected" : ""'), "the space moved inside the selected branch");

// ── 3. 다크 테마 대비 ────────────────────────────────────────────
// 빈 상태 상자는 밝은 배경이 !important 로 박혀 있어 다크에서 글자만 흐려졌다(1.82:1).
ok(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell :is\(\.empty,\.homeEmpty\)\{[^}]*background:var\(--ab12-surface-raised\)!important/.test(source), "empty-state boxes take a dark surface in dark mode");
// 본문 바로가기는 다크의 전역 링크색에 밀려 파란 배경에 연한 파란 글자가 됐다(2.87:1).
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell a.abSkipLink{color:#fff!important}'), "the skip link keeps white text in dark mode");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22885.css"'), "the shell stylesheet moved to a new immutable address");
ok(source.includes('"accountbook-shell-v22885-css"'), "the shell stylesheet ships a matching ETag");

const ORIGIN = "https://ttokttok-accountbook.com";
const fixture = await createV2265QaFixture();
try {
  // 규칙이 실제로 셸 자원에 실려 나가는지 확인한다. 소스에만 있고 서빙되지 않으면 소용없다.
  const shell = await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22885.css`), fixture.env, {});
  eq(shell.status, 200, "the new shell stylesheet is served");
  const css = await shell.text();
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell a.abSkipLink{color:#fff!important}'), "the served shell carries the skip link dark fix");
  ok(css.includes("html[data-ab-resolved-theme=\"dark\"] body.abV22812Shell :is(.empty,.homeEmpty)"), "the served shell carries the empty-state dark fix");
  eq((await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22873.css`), fixture.env, {})).status, 404, "the previous shell address is retired");

  // 이번 달을 보는 화면이 실제로 예산 안에 있는지 직접 잰다.
  const month = new Date().toISOString().slice(0, 7);
  const categories = ["식비", "카페/간식", "교통/차량", "장보기", "주거/관리", "쇼핑", "의료/건강", "구독"];
  const payments = ["국민카드", "현대카드", "카카오페이", "현금", "계좌이체"];
  for (let index = 0; index < 200; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    fixture.db.transactions.push({ id: `b74-${index}`, household_id: "house-home", user_id: "user-bin", transaction_date: `${month}-${day}`, type: index % 9 === 0 ? "income" : "expense", amount: 1000 + (index * 137) % 90000, category: categories[index % categories.length], memo: `실사용 기록 ${index} 항목`, payment_method: payments[index % payments.length], source: "web", created_at: `${month}-${day}T09:00:00.000Z` });
  }
  const home = await app.fetch(new Request(`${ORIGIN}/app?month=${month}&household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), fixture.env, {});
  eq(home.status, 200, "the current-month home renders under realistic load");
  const bytes = Buffer.byteLength(await home.text());
  ok(bytes <= 46 * 1024, `the current-month home stays inside the 46 KiB budget (${bytes} bytes)`);
  // 예산이 의미를 가지려면 여유가 카드 한 장보다 커야 한다. 피드 카드는 약 1.7KB 다.
  ok(46 * 1024 - bytes >= 1700, `the budget keeps at least one feed card of headroom (${46 * 1024 - bytes} bytes free)`);
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.74 budget review and dark contrast (${checks} checks)`);
