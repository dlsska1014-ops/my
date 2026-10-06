// V22.9.26 — 라우터가 핸들러의 거부(rejection)를 직접 받는다.
//
// 라우터 `route()` 는 마지막 catch 에서 안전모드 화면·카카오 안전 문구·JSON 오류를 돌려주도록
// 만들어져 있었다. 그런데 거의 모든 분기가 `return handleX(request, env)` 처럼 await 없이
// 프라미스를 돌려줘서, 핸들러가 던진 오류는 그 catch 를 건너뛰고 `fetch()` 밖으로 빠져나갔다.
// Workers 런타임은 그 경우 Cloudflare 의 1101 "Worker threw exception" 페이지를 보여 준다.
// DB(Supabase)가 503 을 돌려주는 동안 모든 저장·수정·삭제 POST 와 /menu·/my/settings 같은
// safeHtmlRoute 밖의 GET 이 그 길로 떨어졌다(2026-10-06 출시 점검에서 확인).
//
// 이 검사는 (1) 라우터 안에 await 없는 핸들러 반환이 다시 생기지 않는지, (2) DB 가 죽었을 때
// 브라우저 폼 제출은 안전모드 HTML, API 호출은 JSON 오류, 카카오는 안전 문구를 받는지,
// (3) 그 과정에서 거래가 저장되지 않고 운영 이벤트가 남는지를 본다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// 1) 라우터 본문: 줄 시작과 인라인 조건문 모두 await 없는 `return handleX(` 가 0곳이어야 한다.
const routeStart = source.indexOf("  async route(request, env, ctx) {");
const routeEnd = source.indexOf("  async scheduled(controller, env, ctx) {", routeStart);
ok(routeStart > 0 && routeEnd > routeStart, "라우터 본문을 찾았다");
const routeBody = source.slice(routeStart, routeEnd);
const unawaited = [...routeBody.matchAll(/\breturn\s+(?!await\b)(handle[A-Za-z0-9]*|abMonitorDatabaseProbe)\s*\(/g)].map((m) => m[1]);
eq(unawaited.length, 0, `라우터에 await 없는 핸들러 반환이 없다${unawaited.length ? " — " + unawaited.slice(0, 5).join(", ") : ""}`);
ok((routeBody.match(/^\s+return await (handle[A-Za-z0-9]*|abMonitorDatabaseProbe)\(/gm) || []).length >= 200, "라우터가 핸들러를 await 로 받는다");
ok(routeBody.includes("browserFormRequestFailed(request, failUrl)"), "마지막 catch 가 브라우저 폼 제출을 구분한다");
ok(source.includes("function browserFormRequestFailed(") && source.includes("function emergencyReturnUrl("), "폼 실패 판별·복귀 주소 도우미가 있다");

const BASE = "https://malhaebook.com";
const BROWSER_ACCEPT = "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8";
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fixture = await createV2265QaFixture();
const mockFetch = globalThis.fetch;
let dbDown = false;
let failHouseholdUserRows = false;
globalThis.fetch = async (input, init) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if ((dbDown || (failHouseholdUserRows && url.pathname === "/rest/v1/users")) && url.hostname === "mock.supabase.co") {
    return new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
  }
  return mockFetch(input, init);
};
const ctx = { waitUntil() {} };
const call = async (method, path, { cookie = fixture.cookie, body, contentType = "application/x-www-form-urlencoded", accept = BROWSER_ACCEPT, referer = `${BASE}/app?month=2026-07&household_id=house-home` } = {}) => {
  const headers = { accept };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = contentType;
  if (method !== "GET") { headers.origin = BASE; headers["sec-fetch-site"] = "same-origin"; headers.referer = referer; }
  let response;
  let threw = null;
  try {
    response = await app.fetch(new Request(BASE + path, { method, headers, body }), fixture.env, ctx);
  } catch (error) {
    threw = error;
  }
  const text = response ? await response.text() : "";
  return { response, text, threw, type: String(response?.headers.get("content-type") || "").split(";")[0] };
};

try {
  const txBefore = fixture.db.transactions.length;
  const eventsBefore = (globalThis.__AB_OPS_EVENTS || []).length;
  dbDown = true;

  // 2) 브라우저 폼 제출 → 안전모드 HTML
  const formBody = new URLSearchParams({ household_id: "house-home", month: "2026-07", type: "expense", transaction_date: "2026-07-10", amount: "1000", memo: "db down" }).toString();
  const post = await call("POST", "/my/transactions", { body: formBody });
  eq(post.threw, null, "DB 장애 중 폼 제출이 fetch 밖으로 예외를 던지지 않는다");
  eq(post.response.status, 500, "폼 제출 실패는 HTTP 500 을 유지한다");
  eq(post.type, "text/html", "폼 제출 실패는 HTML 안전모드 화면이다");
  ok(post.text.includes("요청을 완료하지 못했어요"), "안전모드 화면이 요청 실패를 설명한다");
  ok(post.text.includes('href="https://malhaebook.com/app?month=2026-07&amp;household_id=house-home"'), "다시 시도 링크가 제출한 화면(referer)으로 돌아간다");
  eq(post.response.headers.get("cache-control"), "no-store", "안전모드 화면은 캐시되지 않는다");
  ok(post.response.headers.get("content-security-policy"), "안전모드 화면에도 보안 헤더가 붙는다");

  const postOtherSite = await call("POST", "/my/transactions", { body: formBody, referer: "https://evil.example/app" });
  ok(postOtherSite.text.includes('href="https://malhaebook.com/my"'), "다른 출처 referer 는 무시하고 /my 로 돌아간다");

  // 3) JSON 을 기대하는 호출 → JSON 오류
  const postJson = await call("POST", "/my/transactions", { body: formBody, accept: "application/json" });
  eq(postJson.response.status, 500, "JSON 을 기대하는 제출 실패는 500 이다");
  eq(postJson.type, "application/json", "JSON 을 기대하는 제출은 JSON 오류를 받는다");
  eq(JSON.parse(postJson.text).error, "server_error", "JSON 오류 코드는 server_error 다");
  const api = await call("GET", "/u/api/recent-transactions?household_id=house-home", { accept: "application/json" });
  eq(api.threw, null, "DB 장애 중 /u/api 호출이 예외를 던지지 않는다");
  eq(api.type, "application/json", "/u/api 는 accept 와 무관하게 JSON 오류를 받는다");
  const apiHtmlAccept = await call("GET", "/u/api/recent-transactions?household_id=house-home");
  eq(apiHtmlAccept.type, "application/json", "/u/api 는 브라우저 accept 로도 HTML 이 아니라 JSON 이다");

  // 4) safeHtmlRoute 밖의 GET 화면 → 안전모드 HTML
  for (const path of ["/menu?household_id=house-home", "/my/settings?household_id=house-home", "/my/members?household_id=house-home", "/my/profile"]) {
    const page = await call("GET", path);
    eq(page.threw, null, `DB 장애 중 GET ${path.split("?")[0]} 이 예외를 던지지 않는다`);
    eq(page.response.status, 500, `GET ${path.split("?")[0]} 실패는 HTTP 500 이다`);
    ok(page.type === "text/html" && page.text.includes("안전모드"), `GET ${path.split("?")[0]} 은 안전모드 화면을 보여 준다`);
  }

  // 5) 카카오 스킬은 예전처럼 안전 문구(200)를 돌려준다.
  const skill = await call("POST", "/skill", {
    cookie: "",
    contentType: "application/json",
    accept: "*/*",
    body: JSON.stringify({ userRequest: { utterance: "커피 4500", user: { id: "u", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } } }, bot: { id: "b" }, intent: { id: "i" }, action: { params: {} } }),
  });
  eq(skill.response.status, 200, "DB 장애 중 카카오 스킬은 HTTP 200 안전 문구다");
  eq(JSON.parse(skill.text).version, "2.0", "카카오 응답 규격을 유지한다");

  // 6) 저장은 없고 운영 이벤트는 남는다.
  eq(fixture.db.transactions.length, txBefore, "DB 장애 중 거래가 저장되지 않았다");
  const serverErrors = (globalThis.__AB_OPS_EVENTS || []).slice(eventsBefore).filter((event) => event.kind === "server_error");
  ok(serverErrors.some((event) => event.path === "/my/transactions" && event.method === "POST"), "폼 제출 실패가 server_error 운영 이벤트로 남는다");
  ok(serverErrors.some((event) => event.path === "/menu"), "GET 화면 실패도 server_error 운영 이벤트로 남는다");

  // 7) 폼이 아닌 본문(잘못된 content-type)도 1101 이 아니라 안전모드다.
  dbDown = false;
  const plain = await call("POST", "/my/transactions", { body: "garbage", contentType: "text/plain" });
  eq(plain.threw, null, "폼이 아닌 본문의 POST 가 예외를 던지지 않는다");
  eq(plain.response.status, 500, "폼이 아닌 본문의 POST 는 500 안전모드다");
  eq(plain.type, "text/html", "폼이 아닌 본문의 POST 도 브라우저에는 HTML 로 답한다");

  // 8) DB 가 돌아오면 같은 제출이 정상 저장된다.
  const okPost = await call("POST", "/my/transactions", { body: formBody });
  eq(okPost.response.status, 303, "DB 복구 후 같은 제출이 저장된다");
  ok(String(okPost.response.headers.get("location") || "").includes("msg=created"), "복구 후 저장 완료 안내로 돌아간다");
  eq(fixture.db.transactions.length, txBefore + 1, "복구 후 거래가 한 건 저장됐다");

  // 9) 유효 세션으로 사용자 분기가 실제 성공한 뒤, 선택적으로 DB 503을 주어도
  // 인라인 return이 라우터 catch를 건너뛰지 않는다.
  const householdsHealthy = await call("GET", "/households?household_id=house-home");
  eq(householdsHealthy.threw, null, "유효 세션의 /households 사용자 분기가 정상 호출된다");
  eq(householdsHealthy.response.status, 200, "DB 정상 시 /households 사용자 화면이 열린다");
  failHouseholdUserRows = true;
  const householdsDown = await call("GET", "/households?household_id=house-home");
  eq(householdsDown.threw, null, "DB 503 중 /households 사용자 분기가 fetch 밖으로 예외를 던지지 않는다");
  eq(householdsDown.response.status, 500, "DB 503 중 /households 사용자 분기는 HTTP 500 안전모드다");
  ok(householdsDown.type === "text/html" && householdsDown.text.includes("안전모드"), "DB 503 중 /households 사용자 분기가 안전모드 화면을 돌려준다");
} finally {
  globalThis.fetch = mockFetch;
  fixture.restore();
  delete globalThis.__AB_QA_FIXED_NOW_MS;
}

console.log(`PASS: launch hardening — router await·safe failure (${checks} checks)`);
