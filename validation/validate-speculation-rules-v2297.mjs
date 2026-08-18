// V22.9.7 — 다음 화면을 미리 준비하되, 누르지도 않은 화면을 열지는 않는다.
//
// 이 앱은 링크로 도는 MPA 라 월 전환·탭 전환이 전부 전체 페이지 로드다. Speculation
// Rules 는 그 구조를 위해 만들어진 API 라 SPA 로 갈아엎지 않고 다음 화면을 미리
// 준비할 수 있다. JS 는 한 줄도 없고 JSON 한 덩어리(242 B)가 전부다.
//
// ── 이 검사가 지켜야 하는 두 가지 ──
//
// 1) **eagerness 가 conservative 여야 한다.**
//    moderate/eager 는 마우스를 올리거나 링크가 화면에 들어오기만 해도 그 주소를
//    실제로 연다. 홈 한 번에 DB 호출이 10회쯤 드는 앱에서 누르지도 않은 링크마다
//    그만큼이 더 나간다. conservative 는 사용자가 이미 누르기 시작한 뒤에야 움직이므로
//    어차피 일어날 요청 하나를 앞당길 뿐이다 — 서버 부하가 늘지 않는다.
//    이 한 낱말이 "무료 한도 안에서 쓴다"는 조건 전체를 지탱한다.
//
// 2) **prerender 대상에 데이터를 바꾸는 주소가 없어야 한다.**
//    prerender 는 그 주소를 진짜로 연다. GET 인데 쓰기가 일어나는 주소가 하나라도
//    걸리면 사용자가 누르지도 않았는데 데이터가 바뀐다. 규칙의 제외 목록이 실제로
//    그런 경로를 덮는지 문자열이 아니라 **매칭을 흉내 내서** 확인한다.

import assert from "node:assert/strict";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ORIGIN = "https://ttokttok-accountbook.com";

const fixture = await createV2265QaFixture();
try {
  const get = async (path) => {
    const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}month=2026-07&household_id=house-home`;
    const response = await app.fetch(new Request(url, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {});
    eq(response.status, 200, `${path} 가 열린다`);
    return response.text();
  };

  const SCREENS = ["/app", "/budgets", "/menu", "/my/analysis", "/receipts", "/goals", "/reports", "/my/members", "/payment-methods", "/settlement-summary"];
  let rules = null;
  for (const path of SCREENS) {
    const html = await get(path);
    const found = [...html.matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)];
    eq(found.length, 1, `${path} 에 규칙이 정확히 하나 있다`);
    const parsed = JSON.parse(found[0][1]);
    if (!rules) rules = parsed;
    else eq(JSON.stringify(parsed), JSON.stringify(rules), `${path} 도 같은 규칙을 쓴다`);
  }

  // -------------------------------------------------------------------------
  // 1) 누르기 전에는 움직이지 않는다
  // -------------------------------------------------------------------------
  eq(rules.prerender.length, 1, "규칙은 하나다");
  eq(rules.prerender[0].eagerness, "conservative", "누른 뒤에야 움직인다 — 이 값이 무료 한도 조건을 지탱한다");
  ok(!JSON.stringify(rules).includes("moderate") && !JSON.stringify(rules).includes('"eager"'),
    "화면에 들어오거나 마우스만 올려도 여는 설정이 섞여 있지 않다");

  // -------------------------------------------------------------------------
  // 2) 제외 목록이 쓰기 경로를 실제로 덮는가
  // -------------------------------------------------------------------------
  const conditions = rules.prerender[0].where.and;
  const excluded = conditions.find((c) => c.not)?.not.href_matches || [];
  ok(Array.isArray(excluded) && excluded.length >= 6, `제외 목록이 있다 (${excluded.length}개 패턴)`);

  // 문자열 비교가 아니라 패턴 매칭을 흉내 낸다. "/admin/*" 이 목록에 있다는 것과
  // "/admin/transactions/delete" 가 실제로 걸린다는 것은 다른 이야기다.
  const matches = (pattern, path) => new RegExp("^" + pattern.split("*").map((p) => p.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*") + "$").test(path);
  const blocked = (path) => excluded.some((pattern) => matches(pattern, path));
  for (const path of [
    "/admin/transactions/delete", "/admin/household/delete", "/admin/budget/delete",
    "/backup/apply", "/backup/import-apply", "/cron/recurring/apply",
    "/logout", "/my/logout", "/assets/mobile-home-v2296.js",
  ]) {
    ok(blocked(path), `"${path}" 는 미리 열리지 않는다`);
  }
  // 반대로 평범한 화면은 막히면 안 된다 — 전부 막아 놓고 통과시키는 규칙이 되지 않도록.
  for (const path of ["/app", "/budgets", "/my/analysis", "/receipts", "/menu"]) {
    ok(!blocked(path), `"${path}" 는 정상적으로 미리 준비된다`);
  }

  // -------------------------------------------------------------------------
  // 3) 링크된 주소를 GET 으로 열어도 데이터가 바뀌지 않는다
  // -------------------------------------------------------------------------
  // prerender 는 그 주소를 진짜로 연다. 이 성질이 깨지면 위 제외 목록으로는 못 막는다
  // (새로 생긴 주소는 목록에 없을 테니까). 그래서 성질 자체를 여기서 지킨다.
  const home = await get("/app");
  const hrefs = [...new Set([...home.matchAll(/href="(\/[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&")))]
    .filter((href) => !href.startsWith("/assets/") && !blocked(href.split("?")[0]));
  ok(hrefs.length >= 20, `홈에서 미리 열릴 수 있는 주소가 ${hrefs.length}개다`);

  const realFetch = globalThis.fetch;
  let writes = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    // HEAD 는 개수를 세는 조회다. 쓰기로 세면 멀쩡한 주소가 걸린다.
    if (url.hostname === "mock.supabase.co" && !["GET", "HEAD"].includes(method)) writes.push(`${method} ${url.pathname}`);
    return realFetch(input, init);
  };
  const dirty = [];
  try {
    for (const href of hrefs) {
      writes = [];
      try {
        await app.fetch(new Request(`${ORIGIN}${href}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {});
      } catch { /* 열리지 않는 주소는 prerender 도 못 연다 */ }
      if (writes.length) dirty.push(`${href} → ${[...new Set(writes)].join(", ")}`);
    }
  } finally { globalThis.fetch = realFetch; }
  eq(dirty.length, 0, `미리 열릴 수 있는 주소 중 데이터를 바꾸는 것은 없다${dirty.length ? ` — ${dirty.join(" / ")}` : ""}`);

  // 세는 법 확인 — 이 탐지가 실제로 쓰기를 잡는지 일부러 한 번 일으켜 본다.
  writes = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    const method = String((init && init.method) || (input && input.method) || "GET").toUpperCase();
    if (url.hostname === "mock.supabase.co" && !["GET", "HEAD"].includes(method)) writes.push(`${method} ${url.pathname}`);
    return realFetch(input, init);
  };
  try {
    await app.fetch(new Request(`${ORIGIN}/admin/transactions`, {
      method: "POST",
      headers: { cookie: fixture.cookie, "content-type": "application/x-www-form-urlencoded" },
      body: "household_id=house-home&type=expense&amount=1000&memo=검사용&transaction_date=2026-07-15",
    }), fixture.env, {});
  } catch { /* 저장이 막혀도 상관없다 — 쓰기를 감지하는지만 본다 */ }
  finally { globalThis.fetch = realFetch; }
  ok(writes.length > 0, "이 쓰기 탐지가 실제 쓰기를 잡는다 (위 0건이 '아무것도 안 본 0건'이 아니다)");
} finally {
  fixture.restore();
}

console.log(`V22.9.7 화면 미리 준비 검사 통과 (${checks} checks)`);
