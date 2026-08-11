import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.86-DEFERRED-EDIT-FORMS"'), "runtime exposes the V22.8.79 release");

// ---------------------------------------------------------------------------
// 정적 계약
// ---------------------------------------------------------------------------

// 1. 새 라우트를 만들지 않는다. tab 파라미터 분기만 쓴다.
ok(source.includes('const focusTab = url.searchParams.get("tab") === "transactions" ? "transactions" : "home";'), "the tab is read from the query string");
eq(/url\.pathname === "\/transactions"/.test(source), false, "no dedicated /transactions route was added");

// 2. 서버 필터는 홈과 공유하며 로직을 바꾸지 않는다.
ok(source.includes("function filterMobileTransactionRows(rows = [], filters = {}) {"), "the shared server filter is untouched");
ok(source.includes("const txAll = feedSource;"), "the transactions tab reuses the shared filtered rows");

// 3. 페이지 파라미터가 배선돼 있고 상한이 걸려 있다.
ok(source.includes('const txPage = Math.max(1, Math.min(9999, Math.floor(Number(url.searchParams.get("page")) || 1)));'), "the page parameter is clamped");
ok(source.includes("const txPageSize = 50;"), "the page size is fixed at 50");

// 4. 분류 select 를 제공한다(자유 입력 datalist 와 병행).
ok(source.includes('<span>분류로 보기</span><select name="category">'), "the tab offers a category dropdown");
ok(source.includes('<option value="">분류 전체</option>'), "the dropdown has an all-categories option");

// 5. 필터를 걸어도 탭에 남는다.
ok(source.includes(`'action="/app"><input type="hidden" name="tab" value="transactions"/>'`), "the filter form keeps the tab parameter");

// 6. 클라 즉시검색은 그대로 병행한다.
ok(source.includes('<input id="v8Search" placeholder="이 페이지에서 빠른 검색"/>'), "the client-side quick search stays");

// 7. 카드 렌더는 기존 함수를 재사용한다.
ok(source.includes("renderV8TxCards(txRows,"), "the tab reuses renderV8TxCards");

// 8. 라이트/다크 스타일이 모두 있다.
for (const cls of ["txTabHead", "txTabFilter", "txPager", "txPickLabel"]) {
  ok(source.includes(`.${cls}{`) || source.includes(`.${cls} `), `light styling exists for .${cls}`);
}
// 셀렉터 목록은 다른 단계에서 늘어날 수 있으므로 두 클래스가 덮이는지만 본다.
const darkSurfaceRule = (source.match(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell :is\([^)]*\.txTabHead[^)]*\)\{[^}]*\}/) || [""])[0];
ok(darkSurfaceRule.includes(".txTabHead") && darkSurfaceRule.includes(".txTabFilter"), "dark coverage exists for the tab surfaces");
ok(/background:var\(--ab12-surface\)!important/.test(darkSurfaceRule), "the dark rule repaints the tab surfaces");
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .txPager span'), "dark coverage exists for the pager");

// 9. 하단탭 "거래" 는 이제 앵커가 아니라 탭 주소를 가리킨다.
ok(source.includes('["records", "거래", "records", `${app}&tab=transactions`],'), "the unified bottom tab points at the transactions tab without a dead anchor");
eq(source.includes("tab=transactions#feed"), false, "the dead #feed anchor is gone");

// ---------------------------------------------------------------------------
// 페이지 나누기 계산 — 실제 렌더 없이 경계를 직접 잰다.
// ---------------------------------------------------------------------------
function pageWindow(total, page, size = 50) {
  const pages = Math.max(1, Math.ceil(total / size));
  const current = Math.min(Math.max(1, Number(page) || 1), pages);
  const start = (current - 1) * size;
  return { pages, current, start, count: Math.max(0, Math.min(size, total - start)) };
}
eq(pageWindow(0, 1).pages, 1, "an empty list still reports one page");
eq(pageWindow(0, 1).count, 0, "an empty list shows no rows");
eq(pageWindow(50, 1).pages, 1, "exactly one page worth of rows stays on one page");
eq(pageWindow(51, 1).pages, 2, "one extra row creates a second page");
eq(pageWindow(51, 2).count, 1, "the second page carries the remainder");
eq(pageWindow(51, 2).start, 50, "the second page starts after the first");
eq(pageWindow(120, 3).count, 20, "the last page carries the remainder");
eq(pageWindow(120, 9).current, 3, "an out-of-range page clamps to the last page");
eq(pageWindow(120, 0).current, 1, "page zero clamps to the first page");
eq(pageWindow(120, -5).current, 1, "a negative page clamps to the first page");
eq(pageWindow(120, "abc").current, 1, "a non-numeric page clamps to the first page");

// ---------------------------------------------------------------------------
// 실제 렌더
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" },
}), fixture.env, {});
const hh = "&household_id=house-home";

const homeRes = await get(`/app?month=2026-07${hh}`);
const home = await homeRes.text();
eq(homeRes.status, 200, "home still renders");
eq(home.includes('class="txTabHead"'), false, "home does not show the transactions view");
ok(home.includes('class="homeBudget"'), "home keeps its widgets");

const tabRes = await get(`/app?month=2026-07&tab=transactions${hh}`);
const tab = await tabRes.text();
eq(tabRes.status, 200, "the transactions tab renders");
ok(tab.includes('class="txTabHead"'), "the transactions view is the main content");
eq(tab.includes('class="homeBudget"'), false, "home widgets are hidden on the tab");
ok(tab.includes('class="mobileFilterForm"'), "the shared filter form is on the tab");
ok(tab.includes("분류로 보기"), "the category dropdown renders");
ok(tab.includes('id="v8Search"'), "the quick search input renders");
ok(tab.includes('name="tab" value="transactions"'), "the filter form carries the tab forward");

// 하단탭 활성 상태 — 셸이 레거시 nav.bottom 을 걷어내므로 통합 내비를 본다.
const navItems = (html) => {
  const nav = html.match(/<nav class="abNavBottom"[\s\S]*?<\/nav>/);
  return nav ? [...nav[0].matchAll(/<a[^>]*class="([^"]*)"[^>]*href="([^"]*)"[\s\S]*?<span>([^<]*)<\/span>/g)]
    .map((m) => ({ label: m[3], active: /active/.test(m[1]), href: m[2] })) : [];
};
const homeNav = navItems(home);
const tabNav = navItems(tab);
ok(homeNav.length >= 5 && tabNav.length >= 5, "the unified bottom nav renders on both views");
eq(homeNav.find((i) => i.label === "홈")?.active, true, "home marks the home tab active");
eq(homeNav.find((i) => i.label === "거래")?.active, false, "home does not mark the records tab active");
eq(tabNav.find((i) => i.label === "거래")?.active, true, "the transactions view marks the records tab active");
eq(tabNav.find((i) => i.label === "홈")?.active, false, "the transactions view releases the home tab");
ok(tabNav.find((i) => i.label === "거래")?.href.includes("tab=transactions"), "the records tab links to the transactions tab");

// 서버 필터가 탭에서도 실제로 걸린다.
const cardCount = (html) => (html.match(/class="v8-tx"/g) || []).length;
const allCount = cardCount(tab);
const incomeOnly = await (await get(`/app?month=2026-07&tab=transactions&type=income${hh}`)).text();
ok(incomeOnly.includes('class="txTabHead"'), "filtering keeps you on the transactions tab");
ok(cardCount(incomeOnly) < allCount, "the income filter narrows the list");
ok(cardCount(incomeOnly) > 0, "the income filter still returns rows");

// 범위를 벗어난 page 는 조용히 첫 페이지로 접힌다(빈 화면이 되면 안 된다).
const farPage = await (await get(`/app?month=2026-07&tab=transactions&page=999${hh}`)).text();
ok(farPage.includes('class="txTabHead"'), "an out-of-range page still renders the tab");
eq(cardCount(farPage), allCount, "an out-of-range page clamps back to the only page");

// 홈 HTML 예산은 거래내역 분기가 생겨도 늘어나면 안 된다(응답에는 한쪽만 담긴다).
ok(Buffer.byteLength(home) < 47104, `home HTML stays within budget (${Buffer.byteLength(home)}B)`);

console.log(`PASS: V22.8.79 transactions tab (${checks} checks)`);
