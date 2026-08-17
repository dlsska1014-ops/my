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

ok(source.includes('const APP_VERSION = "V22.9.0-UX-REPAIR"'), "V22.8.58 runtime version is explicit");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v2290.css"'), "shell uses a fresh immutable URL");
ok(source.includes('const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22890.js"'), "activity runtime uses a fresh immutable URL");
ok(source.includes('"accountbook-shell-v2290-css"'), "shell ETag is refreshed");
ok(source.includes('"accountbook-v5-v22890-js"'), "activity runtime ETag is refreshed");
ok(source.includes('const displayMode = settings.periodDays <= 7 ? "daily" : "percent"'), "one-week display threshold is explicit");
// V22.8.73 에서 챌린지가 3종으로 늘어 성공 문구가 유형별 라벨이 됐다.
// 무지출 방식은 기존 문구를 그대로 쓰고, 나머지는 자기 라벨을 쓴다.
ok(source.includes('state === "success" ? (settings.type === "no_spend_days" ? "무지출 성공" : settings.successLabel)'), "day slots expose a textual success state");
ok(source.includes('successLabel: "한도 지킴"') && source.includes('successLabel: "분류 한도 지킴"'), "each challenge type names its own success state");
ok(source.includes('state === "spent" ? (settings.type === "no_spend_days" ? "지출 있음" : settings.failureLabel)'), "day slots expose a textual spend state");
ok(source.includes('class="reportChallengeDays"'), "full challenge renders date cells");
// V22.9.0: 사이드바 챌린지 사본과 그 compact 렌더 경로를 걷어냈다. 이 사본을 그리던
// 화면 셋(홈·통계·종합 리포트)은 모두 본문에 큰 카드를 이미 들고 있어서, 사이드바가
// 유일한 접점인 적이 한 번도 없었다. 지키던 성질(짧은 챌린지는 날짜 칸, 긴 챌린지는
// 퍼센트)은 본문 렌더에서 그대로 확인한다 — 아래 두 줄과 longHtml 단언이 그 자리다.
ok(!source.includes('class="abChallengeDays"'), "사이드바 전용 날짜 칸 렌더는 남아 있지 않다");
ok(source.includes('class="reportChallengePercent"'), "long challenge renders percent progress");
ok(!source.includes('class="abChallengePercent"'), "사이드바 전용 퍼센트 렌더도 남아 있지 않다");
ok(source.includes("function iconKind(row)"), "activity rail has deterministic category icon mapping");
ok(source.includes("function iconSvg(kind)"), "activity rail uses controlled inline SVG icons");
ok(source.includes('class="abActivityTypeIcon kind-'), "activity items receive semantic icon classes");
ok(source.includes("spokenAmount") && source.includes('aria-label="'), "activity links expose a descriptive accessible label");
ok(!source.includes('return "◉"'), "ambiguous legacy circle icon is removed");
ok(!source.includes('return "◇"'), "ambiguous legacy diamond icon is removed");
ok(source.includes('if (url.pathname === "/u/api/recent-transactions" && request.method === "GET")'), "recent activity remains GET-only");
ok(!source.includes('url.pathname === "/u/api/recent-transactions" && request.method === "POST"'), "activity UX adds no write route");
ok(source.includes("async function fetchRecentTransactionRows") && source.includes("limit: bounded + 1"), "recent activity is bounded in the database instead of slicing a full month in memory");
ok(source.includes("var income = rows.reduce") && source.includes("var expense = rows.reduce"), "activity summary follows the currently selected list filter");

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const weekTarget = shiftChallengeDate(today, 6);
eq(challengePeriodDays(today, weekTarget), 7, "inclusive one-week challenge has seven dates");
const normalized = normalizeReportChallenge({ target_days: 7, start_date: today, target_date: weekTarget, title: "  커피 0원  " });
eq(normalized.periodDays, 7, "normalization preserves a seven-day period");
eq(normalized.title, "커피 0원", "normalization preserves a concise challenge title");
const fresh = buildReportChallenge([], today.slice(0, 7), { target_days: 7, start_date: today, target_date: weekTarget, title: "커피 0원" });
eq(fresh.displayMode, "daily", "seven days selects date-cell mode");
eq(fresh.daySlots.length, 7, "date-cell mode exposes exactly seven slots");
eq(fresh.daySlots[0].date, today, "first slot is the configured start date");
eq(fresh.daySlots[0].state, "today", "unfinished current date is shown as today");
eq(fresh.daySlots[0].stateLabel, "오늘 진행 중", "today state has a non-color label");
eq(fresh.progress, 0, "a new challenge still starts at zero completed days");
const freshHtml = renderReportChallenge(fresh, { householdId: "hh-1", canManage: true });
ok(freshHtml.includes('class="reportChallengeDays"'), "seven-day full view contains date cells");
eq((freshHtml.match(/<li class="is-/g) || []).length, 7, "seven-day full view contains seven visual slots");
ok(freshHtml.includes("오늘 진행 중"), "date-cell accessible label states today is in progress");
ok(freshHtml.includes("✓ 무지출 · − 지출 · ● 오늘 · ○ 예정"), "full view includes a shape-and-text legend");
// 지연 수화(data-ab-challenge-slots)는 사이드바만의 것이 아니었다. 본문 렌더도 같은
// 계약을 쓰므로, 사본이 사라져도 그 성질은 여기서 계속 확인한다.
ok(source.includes('data-ab-challenge-slots="'), "날짜 칸 수화 계약이 그대로 있다");
ok(source.includes('<ol class="reportChallengeDays" data-ab-challenge-slots'), "수화 경로도 본문 날짜 칸을 쓴다");

const past = buildReportChallenge([
  { type: "expense", amount: 1000, transaction_date: "2025-02-03" },
], "2025-02", { target_days: 4, start_date: "2025-02-01", target_date: "2025-02-07", title: "절약 주간" });
eq(past.displayMode, "daily", "past seven-day period still uses date cells");
eq(past.daySlots[0].state, "success", "past no-spend date is marked successful");
eq(past.daySlots[2].state, "spent", "past expense date is marked as spent");
eq(past.daySlots[6].state, "success", "final no-spend date is marked successful");
eq(past.progress, 4, "target progress remains capped independently from visual slots");

const longTarget = shiftChallengeDate(today, 9);
const longChallenge = buildReportChallenge([], today.slice(0, 7), { target_days: 7, start_date: today, target_date: longTarget, title: "열흘 절약" });
eq(longChallenge.periodDays, 10, "long challenge preserves its ten-day range");
eq(longChallenge.displayMode, "percent", "more than seven days selects percent mode");
eq(longChallenge.daySlots.length, 0, "long mode avoids rendering a dense date grid");
const longHtml = renderReportChallenge(longChallenge, { householdId: "hh-1" });
ok(longHtml.includes('class="reportChallengePercent"'), "long full view renders percent progress");
ok(!longHtml.includes('class="reportChallengeDays"'), "long full view omits date cells");
ok(longHtml.includes('aria-valuemax="100"'), "long progress exposes a percentage range");
// 긴 챌린지가 날짜 칸을 그리지 않는다는 성질은 본문 렌더에서 이미 위에서 확인했다
// (longHtml). 사본이 사라졌으므로 같은 말을 두 번 하지 않는다.

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
  eq(home.response.status, 200, "home renders with the upgraded challenge");
  ok(Buffer.byteLength(home.text) < 35 * 1024, "home remains below the protected 35 KiB budget");
  ok(home.text.includes('/assets/accountbook-shell-v2290.css'), "home loads the refreshed shell");
  ok(home.text.includes('/assets/accountbook-v5-v22890.js'), "home loads the refreshed activity runtime");
  ok(home.text.includes('class="reportChallengeDays"') || home.text.includes('class="reportChallengePercent"'), "home challenge uses one responsive progress mode");
  eq(fixture.db.transactions.length, before, "home rendering remains read-only");

  const noAuth = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-home", { cookie: "" });
  eq(noAuth.response.status, 401, "anonymous activity access is rejected");
  const memberCookie = await fixture.cookieFor("user-wifi");
  const forbidden = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-trip", { cookie: memberCookie });
  eq(forbidden.response.status, 404, "activity endpoint rejects another household");
  const fixtureFetch = globalThis.fetch;
  const activityQueries = [];
  globalThis.fetch = async (input, init = {}) => {
    const target = new URL(typeof input === "string" ? input : input.url);
    if (target.hostname === "mock.supabase.co" && target.pathname.endsWith("/transactions")) activityQueries.push(target);
    return fixtureFetch(input, init);
  };
  const activity = await request(fixture, "/u/api/recent-transactions?month=2026-07&household_id=house-home");
  globalThis.fetch = fixtureFetch;
  eq(activity.response.status, 200, "scoped activity endpoint succeeds");
  const data = JSON.parse(activity.text);
  eq(data.household_id, "house-home", "activity response preserves household scope");
  eq(data.count, 5, "activity response keeps the existing bounded data contract");
  eq(activityQueries.length, 1, "activity endpoint performs one bounded transaction query");
  eq(activityQueries[0].searchParams.get("limit"), "81", "activity endpoint requests one sentinel row beyond the 80-row display bound");
  eq(fixture.db.transactions.length, before, "activity endpoint remains read-only");

  const shell = await request(fixture, "/assets/accountbook-shell-v2290.css");
  eq(shell.response.status, 200, "refreshed shell is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v2290-css"', "refreshed shell ETag is correct");
  ok(shell.text.includes(".reportChallengeDays"), "shell includes challenge date-cell styling");
  // 사이드바 사본과 함께 .abChallengePercent / .abChallengeDays CSS 4.3 KB 도 걷어냈다.
  // 긴 챌린지의 퍼센트 표시는 본문 쪽 .reportChallengePercent 가 계속 담당한다.
  ok(shell.text.includes(".reportChallengePercent"), "shell includes long-period percentage styling");
  ok(!shell.text.includes(".abChallengePercent"), "죽은 사이드바 챌린지 CSS 가 자산에 남아 있지 않다");
  ok(!shell.text.includes(".abNavChallenge"), "죽은 사이드바 챌린지 컨테이너 CSS 도 없다");
  ok(shell.text.includes(".abActivityTypeIcon svg"), "shell includes unified SVG activity icon styling");
  ok(shell.text.includes(".abActivityItem:focus-visible"), "activity items have a visible keyboard focus state");

  const v5 = await request(fixture, "/assets/accountbook-v5-v22890.js");
  eq(v5.response.status, 200, "refreshed activity runtime is served");
  eq(v5.response.headers.get("etag"), '"accountbook-v5-v22890-js"', "refreshed activity runtime ETag is correct");
  ok(v5.text.includes("function iconSvg(kind)"), "runtime contains the controlled SVG icon renderer");
  ok(v5.text.includes('class="abActivityTypeIcon kind-') && v5.text.includes("교통"), "runtime emits semantic category icon classes");
  ok(v5.text.includes("aria-label"), "runtime emits accessible activity labels");
  eq(fixture.db.transactions.length, before, "asset delivery does not mutate transactions");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.58 challenge and activity UX (${checks} checks)`);
