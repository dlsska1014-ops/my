// V22.9.40 www 정본 308 검사.
//
// 운영에서 https://www.malhaebook.com/budget-guide 가 리디렉션 없이 200 으로 같은 문서를 냈다(실제 브라우저 확인,
// 2026-10-12). canonicalRedirectResponse 는 CANONICAL_REDIRECT=1 일 때만 동작했는데 운영 변수에는 그 값이 없었다.
// 이제 www.<정본 호스트>(publicBaseUrl 의 host) 로 온 GET 은 변수와 무관하게 정본의 같은 경로·쿼리로 308 한다.
// 이 검사가 지키는 것:
//   1. www GET → 308, location = 정본 + 같은 경로·쿼리, cache-control: no-store, 본문 없음
//   2. 제외 경로(/health·/ops-snapshot.json·/meme-card-catalog.json)와 GET 이 아닌 요청(POST /skill·HEAD·OPTIONS)은 그대로
//   3. 정본(apex)은 변수와 무관하게 바뀌지 않는다
//   4. 다른 호스트(옛 도메인·workers.dev·다른 www·닮은 호스트)는 예전처럼 CANONICAL_REDIRECT=1 일 때만 옮긴다
// validate-brand-rename-v22920 이 검사 파일에 옛 도메인 문자열을 두지 못하게 하므로 다른 호스트는 대역(example) 호스트로
// 확인한다. 실제 옛 도메인의 CANONICAL_REDIRECT=1 → 308 과 POST 스킬 무영향은 그 검사가 본다.
// 렌더링은 QA 픽스처와 app.fetch 로만 한다(서버·네트워크 없음).
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  checks += 1;
}

const CANONICAL = "https://malhaebook.com";
const WWW = "https://www.malhaebook.com";
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const fixture = await createV2265QaFixture();
const withVar = { ...fixture.env, CANONICAL_REDIRECT: "1" };
const defaultBase = { ...fixture.env };
delete defaultBase.PUBLIC_BASE_URL;

async function call(url, { method = "GET", env = fixture.env, headers = {}, body = null } = {}) {
  const response = await app.fetch(new Request(url, { method, headers: { "user-agent": UA, ...headers }, ...(body ? { body } : {}) }), env, ctx);
  return { status: response.status, location: response.headers.get("location"), cacheControl: response.headers.get("cache-control"), text: await response.text() };
}

function skillBody(utterance) {
  return JSON.stringify({
    intent: { id: "qa-www", name: "폴백" },
    userRequest: {
      timezone: "Asia/Seoul", params: {}, block: { id: "qa-www", name: "폴백" }, utterance, lang: "ko",
      user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } },
    },
    bot: { id: "qa-bot", name: "말해가계부" },
    action: { id: "qa-www-action", name: "폴백", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  });
}

// ── 0. 소스 ───────────────────────────────────────────────────────────────
{
  const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
  const start = source.indexOf("function canonicalRedirectResponse(");
  const block = start >= 0 ? source.slice(start, source.indexOf("\n}\n", start)) : "";
  ok(block.includes("currentHost !== `www.${targetHost}`"), "www.<정본 호스트> 규칙이 canonicalRedirectResponse 안에 있다");
  ok(block.includes('String(env.CANONICAL_REDIRECT || "").trim() !== "1"'), "다른 호스트는 여전히 CANONICAL_REDIRECT=1 일 때만 옮긴다");
  ok(block.includes('["/health", "/ops-snapshot.json", "/meme-card-catalog.json"].includes(url.pathname)'), "제외 경로 목록은 그대로다");
  eq((block.match(/status: 308/g) || []).length, 1, "308 응답은 이 함수의 한 곳에서만 만든다");
  eq(fixture.env.PUBLIC_BASE_URL, CANONICAL, "픽스처의 PUBLIC_BASE_URL 은 정본 https://malhaebook.com 이다");
  ok(source.includes(`const DEFAULT_PUBLIC_BASE_URL = "${CANONICAL}"`), "PUBLIC_BASE_URL 이 없어도 기본 정본은 https://malhaebook.com 이다");
}

// ── 1. www GET → 정본 308 (변수 없음·CANONICAL_REDIRECT=1·PUBLIC_BASE_URL 없음 모두) ──────────────
const WWW_PATHS = [
  "/",
  "/budget-guide?x=1",
  "/reports",
  "/my?month=2026-10&return_to=%2Fapp%3Fview%3Dcalendar",
  "/guides?q=%EA%B0%80%EA%B3%84%EB%B6%80&a=1&a=2",
];
for (const [name, env] of [["변수 없음", fixture.env], ["CANONICAL_REDIRECT=1", withVar], ["PUBLIC_BASE_URL 없음", defaultBase]]) {
  for (const path of WWW_PATHS) {
    const r = await call(`${WWW}${path}`, { env });
    eq(r.status, 308, `${name}: www GET ${path} 는 308 이다`);
    eq(r.location, `${CANONICAL}${path}`, `${name}: www GET ${path} 는 정본의 같은 경로·쿼리로 간다`);
    eq(r.cacheControl, "no-store", `${name}: www GET ${path} 의 308 은 no-store 다`);
  }
}
{
  const r = await call(`${WWW}/budget-guide?x=1`);
  eq(r.text, "", "308 응답에는 본문이 없다");
  const signedIn = await call(`${WWW}/reports?month=2026-07&household_id=house-home`, { headers: { cookie: fixture.cookie } });
  eq(signedIn.status, 308, "로그인 쿠키가 있어도 www 는 인증 전에 정본으로 보낸다");
  eq(signedIn.location, `${CANONICAL}/reports?month=2026-07&household_id=house-home`, "로그인 화면 주소도 쿼리를 그대로 옮긴다");
  const plain = await call("http://www.malhaebook.com/guides?a=1");
  eq(plain.status, 308, "http 로 온 www 도 308 이다");
  eq(plain.location, `${CANONICAL}/guides?a=1`, "http 로 온 www 는 정본 https 주소로 간다");
  const upper = await call("https://WWW.MALHAEBOOK.COM/faq?Q=A");
  eq(upper.status, 308, "대문자 호스트도 같은 www 로 본다");
  eq(upper.location, `${CANONICAL}/faq?Q=A`, "경로·쿼리의 대소문자는 바꾸지 않는다");
}

// ── 2. 제외 경로와 GET 이 아닌 요청 ────────────────────────────────────────────
{
  const health = await call(`${WWW}/health`);
  eq(health.status, 200, "www /health 는 리디렉션 없이 200 이다");
  eq(health.location, null, "www /health 에는 location 이 없다");
  ok(JSON.parse(health.text).alive === true, "www /health 는 alive 를 그대로 답한다");
  for (const path of ["/ops-snapshot.json", "/meme-card-catalog.json"]) {
    const r = await call(`${WWW}${path}`);
    ok(r.status !== 308 && r.location === null, `www ${path} 는 제외 경로라 옮기지 않는다 (${r.status})`);
  }
  const skill = await call(`${WWW}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: skillBody("도움말") });
  eq(skill.status, 200, "www POST /skill 은 리디렉션하지 않고 처리한다");
  eq(skill.location, null, "www POST /skill 에는 location 이 없다");
  eq(JSON.parse(skill.text).version, "2.0", "www POST /skill 은 카카오 스킬 응답을 낸다");
  const head = await call(`${WWW}/`, { method: "HEAD" });
  ok(head.status !== 308 && head.location === null, `www HEAD 는 지금처럼 옮기지 않는다(GET 전용, ${head.status})`);
  const options = await call(`${WWW}/skill`, { method: "OPTIONS" });
  eq(options.status, 204, "www OPTIONS 는 지금처럼 204 다");
}

// ── 3. 정본(apex)은 그대로 ────────────────────────────────────────────────────
for (const path of ["/", "/budget-guide?x=1"]) {
  const bodies = [];
  for (const [name, env] of [["변수 없음", fixture.env], ["CANONICAL_REDIRECT=1", withVar], ["PUBLIC_BASE_URL 없음", defaultBase]]) {
    const r = await call(`${CANONICAL}${path}`, { env });
    eq(r.status, 200, `${name}: 정본 GET ${path} 는 200 이다`);
    eq(r.location, null, `${name}: 정본 GET ${path} 에는 location 이 없다`);
    bodies.push(r.text);
  }
  ok(bodies.every((body) => body === bodies[0]), `정본 GET ${path} 본문은 변수와 무관하게 같다`);
}
{
  const reports = await call(`${CANONICAL}/reports?month=2026-07&household_id=house-home`, { headers: { cookie: fixture.cookie } });
  eq(reports.status, 200, "정본 /reports 는 로그인 화면을 그대로 연다");
  const skill = await call(`${CANONICAL}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: skillBody("도움말") });
  eq(skill.status, 200, "정본 POST /skill 도 그대로다");
  for (const env of [fixture.env, withVar]) {
    const r = await call("http://malhaebook.com/faq", { env });
    ok(r.status === 200 && r.location === null, "정본을 http 로 받아도 호스트가 같아 이 함수는 옮기지 않는다(HTTPS 전환은 Cloudflare 설정)");
  }
}

// ── 4. 다른 호스트는 예전처럼 CANONICAL_REDIRECT=1 일 때만 ─────────────────────────────
{
  const apex = await call(`${CANONICAL}/budget-guide`);
  for (const host of ["https://legacy-domain.example", "https://kakao-accountbook.example.workers.dev", "https://www.legacy-domain.example", "https://www.malhaebook.com.evil.example"]) {
    const r = await call(`${host}/budget-guide`);
    eq(r.status, 200, `변수 없음: ${new URL(host).host} 는 지금처럼 200 이다`);
    eq(r.location, null, `변수 없음: ${new URL(host).host} 에는 location 이 없다`);
    eq(r.text, apex.text, `변수 없음: ${new URL(host).host} 는 정본과 같은 문서를 낸다(예전과 같음)`);
    const moved = await call(`${host}/budget-guide?a=1`, { env: withVar });
    eq(moved.status, 308, `CANONICAL_REDIRECT=1: ${new URL(host).host} 는 예전처럼 308 이다`);
    eq(moved.location, `${CANONICAL}/budget-guide?a=1`, `CANONICAL_REDIRECT=1: ${new URL(host).host} 는 정본의 같은 경로·쿼리로 간다`);
  }
  const legacyPost = await call("https://legacy-domain.example/skill", { method: "POST", headers: { "content-type": "application/json" }, body: skillBody("도움말"), env: withVar });
  ok(legacyPost.status === 200 && legacyPost.location === null, "CANONICAL_REDIRECT=1 이어도 다른 호스트의 POST /skill 은 옮기지 않는다");
}

// ── 5. 규칙은 하드코딩이 아니라 publicBaseUrl 의 host 를 따른다 ─────────────────────────────
{
  const env = { ...fixture.env, PUBLIC_BASE_URL: "https://staging.example" };
  const www = await call("https://www.staging.example/faq?b=2", { env });
  eq(www.status, 308, "PUBLIC_BASE_URL 이 다른 정본이면 그 www 를 옮긴다");
  eq(www.location, "https://staging.example/faq?b=2", "그 정본의 같은 경로·쿼리로 간다");
  const other = await call(`${WWW}/faq`, { env });
  ok(other.status === 200 && other.location === null, "정본이 다르면 www.malhaebook.com 은 다른 호스트로 보고 변수 없이 옮기지 않는다");
}

fixture.restore();
console.log(`V22.9.40 www 정본 308 검사 통과 (${checks} checks)`);
