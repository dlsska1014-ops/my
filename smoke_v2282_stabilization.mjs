import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const fixture = await createV2265QaFixture();

const CANONICAL = "https://ttokttok-accountbook.com";
const KAKAO_ENV = {
  ...fixture.env,
  KAKAO_LOGIN_ENABLED: "1",
  KAKAO_REST_API_KEY: "qa-rest-key",
  KAKAO_REDIRECT_URI: `${CANONICAL}/auth/kakao/callback`,
};

async function get(path, { cookie = fixture.cookie, env = fixture.env, base = CANONICAL } = {}) {
  return app.fetch(new Request(`${base}${path}`, {
    headers: cookie ? { cookie } : {},
    redirect: "manual",
  }), env, {});
}

function setCookies(response) {
  return typeof response.headers.getSetCookie === "function"
    ? response.headers.getSetCookie()
    : [response.headers.get("set-cookie") || ""].filter(Boolean);
}

async function sessionCookieFor(userId) {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const data = `${userId}|${expires}`;
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey("raw", encoder.encode(fixture.env.USER_SESSION_SECRET), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const signature = new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(data)));
  return `ab_user=${encodeURIComponent(`${data}.${Buffer.from(signature).toString("base64url")}`)}`;
}

// Route Kakao OAuth endpoints through a controllable mock while keeping the
// fixture's Supabase mock for everything else.
const kakao = { tokenStatus: 200, profileStatus: 200, profileId: "99110022" };
const fixtureFetch = globalThis.fetch;
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  if (url.hostname === "kauth.kakao.com" && url.pathname === "/oauth/token") {
    if (kakao.tokenStatus !== 200) {
      return new Response(JSON.stringify({ error: "invalid_grant", error_description: "mock token failure" }), { status: kakao.tokenStatus, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ access_token: "mock-access-token", token_type: "bearer" }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "kapi.kakao.com" && url.pathname === "/v2/user/me") {
    if (kakao.profileStatus !== 200) {
      return new Response(JSON.stringify({ code: -401, msg: "mock profile failure" }), { status: kakao.profileStatus, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify({ id: kakao.profileId, properties: { nickname: "카나리" } }), { status: 200, headers: { "content-type": "application/json" } });
  }
  if (url.hostname === "mock.supabase.co" && url.pathname === "/rest/v1/rpc/accountbook_link_kakao_identity_v227") {
    const body = init.body ? JSON.parse(String(init.body)) : {};
    fixture.db.accountbook_user_identities = fixture.db.accountbook_user_identities || [];
    fixture.db.accountbook_user_identities.push({ user_id: body.p_user_id, provider: "kakao", provider_subject: body.p_kakao_id });
    return new Response("[]", { status: 200, headers: { "content-type": "application/json" } });
  }
  return fixtureFetch(input, init);
};

try {
  // 1. Version + health
  let response = await get("/health", { cookie: "" });
  eq(response.status, 200, "health endpoint stays available");
  const health = await response.json();
  eq(health.version, "V22.8.2-AUTH-UIUX-STABILIZATION", "V22.8.2 stabilization version is exposed");

  // 2. Fail-closed: enabled but missing explicit redirect URI must not start OAuth
  const brokenEnv = { ...fixture.env, KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-key" };
  response = await get("/auth/kakao/start", { cookie: "", env: brokenEnv });
  eq(response.status, 200, "missing KAKAO_REDIRECT_URI renders the login fallback instead of redirecting");
  let html = await response.text();
  ok(html.includes("카카오 로그인을 준비하고 있습니다"), "misconfigured start explains the fallback path");
  ok(!String(response.headers.get("location") || "").includes("kauth.kakao.com"), "misconfigured start never reaches Kakao");

  response = await get("/my", { cookie: "", env: brokenEnv });
  html = await response.text();
  ok(!html.includes("/auth/kakao/start"), "login button stays hidden while the redirect URI is not pinned");

  // 3. Authorize URL contract with full configuration
  response = await get("/auth/kakao/start", { cookie: "", env: KAKAO_ENV });
  eq(response.status, 303, "configured start redirects to Kakao authorize");
  const authorize = new URL(response.headers.get("location"));
  eq(authorize.origin + authorize.pathname, "https://kauth.kakao.com/oauth/authorize", "authorize endpoint is exact");
  eq(authorize.searchParams.get("client_id"), "qa-rest-key", "client_id comes from env");
  eq(authorize.searchParams.get("redirect_uri"), `${CANONICAL}/auth/kakao/callback`, "redirect_uri is the pinned explicit value");
  eq(authorize.searchParams.get("response_type"), "code", "response_type is code");
  const state = authorize.searchParams.get("state") || "";
  ok(state.length >= 24, "state is long and random");
  const startCookies = setCookies(response).join("\n");
  ok(startCookies.includes("kakao_oauth_state="), "state cookie is set for the callback host");

  const secondStart = await get("/auth/kakao/start", { cookie: "", env: KAKAO_ENV });
  const secondState = new URL(secondStart.headers.get("location")).searchParams.get("state");
  ok(secondState && secondState !== state, "each login attempt gets a unique state");

  // 4. Wrong-host starts are canonicalized before the OAuth round-trip
  response = await get("/auth/kakao/start?link=0", { cookie: "", env: KAKAO_ENV, base: "https://old-name.workers.dev" });
  eq(response.status, 303, "stale host start is redirected");
  eq(response.headers.get("location"), `${CANONICAL}/auth/kakao/start?link=0`, "stale host lands on the canonical host with query preserved");
  ok(!setCookies(response).join("").includes("kakao_oauth_state="), "no state cookie is minted on the stale host");

  // 5. Callback error paths clear the OAuth cookies and stay user-readable
  const stateCookie = `kakao_oauth_state=${encodeURIComponent(state)}`;
  response = await get("/auth/kakao/callback?error=access_denied", { cookie: stateCookie, env: KAKAO_ENV });
  eq(response.status, 400, "user cancel returns a controlled response");
  html = await response.text();
  ok(html.includes("카카오 로그인을 취소했습니다"), "cancel gets its own message");
  ok(setCookies(response).some((c) => c.includes("kakao_oauth_state=;") && c.includes("Max-Age=0")), "cancel expires the state cookie");

  response = await get("/auth/kakao/callback?code=abc&state=mismatch", { cookie: stateCookie, env: KAKAO_ENV });
  eq(response.status, 400, "state mismatch is rejected");
  html = await response.text();
  ok(html.includes("로그인 확인 시간이 지났습니다"), "state mismatch keeps the retry guidance");
  ok(setCookies(response).some((c) => c.includes("kakao_oauth_state=;") && c.includes("Max-Age=0")), "state mismatch expires the state cookie");

  kakao.tokenStatus = 401;
  response = await get(`/auth/kakao/callback?code=abc&state=${encodeURIComponent(state)}`, { cookie: stateCookie, env: KAKAO_ENV });
  eq(response.status, 500, "token failure is a controlled error");
  html = await response.text();
  ok(html.includes("카카오 인증 확인에 실패했습니다"), "token failure gets a token-stage message");
  ok(/오류 코드 K[A-Z0-9]{7}/.test(html), "token failure surfaces a trace code for operators");
  ok(setCookies(response).some((c) => c.includes("kakao_oauth_state=;") && c.includes("Max-Age=0")), "token failure expires the state cookie");
  kakao.tokenStatus = 200;

  kakao.profileStatus = 401;
  response = await get(`/auth/kakao/callback?code=abc&state=${encodeURIComponent(state)}`, { cookie: stateCookie, env: KAKAO_ENV });
  eq(response.status, 500, "profile failure is a controlled error");
  html = await response.text();
  ok(html.includes("카카오 프로필을 불러오지 못했습니다"), "profile failure gets a profile-stage message");
  kakao.profileStatus = 200;

  // 6. Full login canary: authorize -> callback -> session cookie -> next step
  response = await get(`/auth/kakao/callback?code=abc&state=${encodeURIComponent(state)}`, { cookie: stateCookie, env: KAKAO_ENV });
  eq(response.status, 303, "successful callback redirects into the app");
  eq(response.headers.get("location"), "/my/households?first=1#create", "new kakao user is guided to create a household");
  const successCookies = setCookies(response);
  ok(successCookies.some((c) => c.startsWith("ab_user=") && !c.includes("Max-Age=0")), "successful login sets the session cookie");
  ok(successCookies.some((c) => c.includes("kakao_oauth_state=;") && c.includes("Max-Age=0")), "successful login expires the state cookie");
  ok(successCookies.some((c) => c.includes("kakao_oauth_link_user=;") && c.includes("Max-Age=0")), "successful login expires the link cookie");
  ok(fixture.db.users.some((u) => u.kakao_user_key === "kakao_login:99110022"), "kakao user row is created once");

  // 7. kakao-login-check reports fail-closed status
  response = await get("/kakao-login-check", { cookie: "", env: brokenEnv });
  html = await response.text();
  ok(html.includes("KAKAO_REDIRECT_URI 명시값"), "check page verifies the explicit redirect env");
  ok(html.includes("접속 주소 기반 자동 생성은 사용하지 않으므로"), "check page states that origin fallback is gone");
  ok(html.includes("로컬 구성만"), "check page separates local config from external registration");
  ok(html.includes("KOE006"), "check page names the KOE006 failure mode");

  response = await get("/kakao-login-check", { cookie: "", env: KAKAO_ENV });
  html = await response.text();
  ok(html.includes("카카오 로그인 버튼 표시됨"), "fully configured check page reports ready state");

  // 8. Recovery guide page renders (was a ReferenceError on `origin`)
  response = await get("/kakao-login-recovery", { cookie: "" });
  eq(response.status, 200, "kakao-login-recovery renders without server error");
  html = await response.text();
  ok(html.includes(`${CANONICAL}/auth/kakao/callback`), "recovery guide shows the canonical redirect URI");
  ok(!html.includes("안전모드로 전환"), "recovery guide is not the emergency screen");

  // 9. Submit lock respects cancelled submits and restores on back-navigation
  response = await get("/my/households?month=2026-07");
  html = await response.text();
  ok(html.includes("event.defaultPrevented"), "submit lock skips cancelled submissions");
  ok(html.includes('window.addEventListener("pageshow"'), "submit state is restored on back/forward navigation");
  ok(html.includes("restoreSubmitState"), "submit restore helper ships to the browser");

  // 10. Destructive actions render with danger styling and confirmation
  ok(html.includes('<button class="danger" type="submit">이 가계부 영구 삭제</button>'), "household delete is a danger button");

  const memberCookie = await sessionCookieFor("user-wifi");
  response = await get("/my/households?month=2026-07&manage=house-home", { cookie: memberCookie });
  html = await response.text();
  ok(html.includes('<button class="danger" type="submit">이 가계부에서 나가기</button>'), "household leave is a danger button");

  response = await get("/reserve-plans?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes('action="/admin/reserve-plan/delete" onsubmit="return confirm('), "reserve plan delete asks for confirmation");
  ok(/action="\/admin\/reserve-plan\/delete"[^>]*>[\s\S]*?<button class="danger" type="submit">삭제<\/button>/.test(html), "reserve plan delete is a danger button");

  const source = readFileSync("src/index.js", "utf8");
  ok(source.includes('action="/admin/identity/merge"') && /identity\/merge"[\s\S]{0,900}<button class="danger" type="submit">계정 통합 실행<\/button>/.test(source), "identity merge is a danger button");
  ok(/meme\/delete"[^>]*onsubmit="return confirm[\s\S]{0,300}<button class="danger" type="submit">삭제<\/button>/.test(source), "meme delete is a confirmed danger button");
  ok(!source.includes("`${url.origin}/auth/kakao/callback`"), "no code path derives the kakao callback from the request origin");

  // 11. Backup identity lookup stays inside a guarded path
  ok(/async function hasBackupLoginIdentity[\s\S]{0,400}try \{/.test(source), "backup identity lookup is wrapped in try/catch");

  // 12. Backup path is canonicalized for signed-in users
  response = await get("/backup?month=2026-07&household_id=house-home");
  eq(response.status, 303, "admin backup center redirects signed-in users");
  eq(response.headers.get("location"), "/my/backup?month=2026-07&household_id=house-home", "signed-in users land on their own backup page with query preserved");
  response = await get("/menu?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes("/my/backup?month=2026-07"), "user navigation links the user backup path");
  ok(!/href="\/backup\?month=/.test(html), "user navigation no longer links the admin backup path");

  // 13. Guided style keeps functional chips and list rows out of the blue button rule
  response = await get("/app?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes(".abV2281 button.homeTx:not(.danger)"), "home timeline rows stay list-styled");
  ok(html.includes(".abV2281 .chipRow button:not(.danger)"), "quick-input chips keep their light chip styling");
  ok(html.includes(".abV2281 button.dateChip:not(.danger)"), "date chips keep their outline styling");
  ok(html.includes("word-break:keep-all"), "headings avoid mid-word line breaks");
  response = await get("/reports?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes(".abV2281 .abNavMobileTop button:not(.danger)"), "mobile nav toggle stays compact and light on unified-nav pages");
  ok(html.includes(".abV2281 .btn:not(.light):not(.soft):not(.danger):not(.secondary)"), "secondary action links are excluded from the primary blue rule");

  response = await get("/my/profile");
  html = await response.text();
  ok(html.includes("box-sizing:border-box"), "profile page has the border-box reset (no horizontal overflow)");
  ok(html.includes('class="btn secondary"'), "profile secondary link is marked secondary");
} finally {
  globalThis.fetch = fixtureFetch;
  fixture.restore();
}

console.log(`SMOKE_V2282_STABILIZATION_OK checks=${checks}`);
