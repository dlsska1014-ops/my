import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const productionOrigin = "https://ttokttok-accountbook.com";
const readyEnv = {
  KAKAO_LOGIN_ENABLED: "1",
  KAKAO_REST_API_KEY: "rest-key-for-test",
  PUBLIC_BASE_URL: productionOrigin,
  KAKAO_REDIRECT_URI: `${productionOrigin}/auth/kakao/callback`,
};

async function get(url, env = {}, headers = {}) {
  const target = url.startsWith("http") ? url : `https://preview.example${url}`;
  return app.fetch(new Request(target, { headers, redirect: "manual" }), env, { waitUntil() {} });
}

let response = await get("/my", { KAKAO_REST_API_KEY: "key-without-explicit-enable" });
let html = await response.text();
eq(response.status, 200, "login page opens when Kakao is not explicitly enabled");
ok(!html.includes('href="/auth/kakao/start"'), "API key alone never exposes Kakao login");
ok(html.includes("카카오 로그인을 잠시 사용할 수 없어요"), "local login remains available");

response = await get("/auth/kakao/start", { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "key" });
eq(response.status, 503, "incomplete Kakao configuration fails closed");
eq(response.headers.get("location"), null, "incomplete configuration never redirects to Kakao");

response = await get("/auth/kakao/start", { ...readyEnv, KAKAO_REDIRECT_URI: "https://wrong.example/auth/kakao/callback" });
eq(response.status, 503, "mismatched redirect origin is blocked");

response = await get("/auth/kakao/start?link=1", readyEnv);
eq(response.status, 303, "alternate host is canonicalized before OAuth state creation");
eq(response.headers.get("location"), `${productionOrigin}/auth/kakao/start?link=1`, "canonical OAuth start keeps query string");

response = await get(`${productionOrigin}/auth/kakao/start`, readyEnv);
eq(response.status, 303, "ready configuration starts OAuth");
const authorizeUrl = new URL(response.headers.get("location"));
eq(authorizeUrl.origin, "https://kauth.kakao.com", "OAuth uses Kakao authorization host");
eq(authorizeUrl.searchParams.get("redirect_uri"), readyEnv.KAKAO_REDIRECT_URI, "OAuth uses the explicit fixed redirect URI");
const state = authorizeUrl.searchParams.get("state") || "";
ok(/^[A-Za-z0-9]{32}$/.test(state), "OAuth state is random and bounded");
let setCookie = response.headers.get("set-cookie") || "";
ok(setCookie.includes("kakao_oauth_state="), "OAuth state cookie is set");
ok(setCookie.includes("kakao_oauth_link_user=;"), "stale link-mode cookie is cleared");

response = await get(`${productionOrigin}/auth/kakao/callback?code=fake&state=wrong`, readyEnv, { cookie: `kakao_oauth_state=${state}` });
eq(response.status, 400, "state mismatch is rejected before token exchange");
setCookie = response.headers.get("set-cookie") || "";
ok(setCookie.includes("kakao_oauth_state=;"), "state cookie is cleared on failure");
ok(setCookie.includes("kakao_oauth_link_user=;"), "link cookie is cleared on failure");

response = await get(`${productionOrigin}/auth/kakao/callback?error=access_denied&state=${state}`, readyEnv, { cookie: `kakao_oauth_state=${state}` });
eq(response.status, 400, "user cancellation is handled locally");
ok((await response.text()).includes("카카오 로그인을 취소했습니다"), "cancellation has a readable fallback");

response = await get("/kakao-login-check", { ...readyEnv, KAKAO_REDIRECT_URI: "https://wrong.example/auth/kakao/callback" });
html = await response.text();
ok(html.includes("공개 주소와 Redirect URI 호스트 불일치"), "diagnostics report the redirect mismatch");
ok(html.includes("관리자센터 등록 여부까지 자동 확인할 수 없습니다"), "diagnostics do not claim to verify Kakao console state");

response = await get(`${productionOrigin}/my`, readyEnv);
html = await response.text();
ok(html.includes('href="/auth/kakao/start"'), "Kakao button appears only for a locally complete configuration");

const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
ok(source.includes('const APP_VERSION = "V22.8.6-RECEIPT-SCREEN-OPTIMIZATION"'), "V22.8.2 version is active");
ok(source.includes("event.defaultPrevented"), "submit lock respects cancelled confirmation and validation");
ok(source.includes("data-onboarding-result-check"), "onboarding requires an explicit result check");
ok(source.includes('["영수증 기록", `/receipts?${monthQs}`'), "full menu includes receipt tools");
ok(source.includes('["자동 리포트", `/reports?${monthQs}`'), "full menu includes reports");
ok(source.includes('["backup", "백업·복구", `/my/backup?'), "unified navigation uses one backup route");

console.log(`SMOKE_V2282_AUTH_UI_STABILITY_OK checks=${checks}`);
