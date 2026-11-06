// V22.9.104 L-1·L-3 — 카카오톡 인앱 시작 화면, 첫 카카오 로그인의 기본 가계부, 홈 동의 팝업 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자(2026-11-06): "카카오에서 기록하고 가계부 열면 https://malhaebook.com/app?month=2026-11 화면나오고 이어열기 누르면 개인정보 관련해서 체크하고
// 로그인하라고 나와. 내가 원하는건 바로 가계부 홈이 나와야하고 개인정보 관련이나 체크 필요한것들은 팝업으로 나와야해".
//   L-1 시작 화면: 카카오톡 인앱 브라우저에서 세션 없이 /my·/app·/m 을 열면 화면 없는 자동 로그인(V22.9.91)을 먼저 해 보고, 그게 안 됐거나(auto=0·쿠키
//       ab_kakao_auto) 할 수 없으면 긴 로그인 화면 대신 홈 모양 빈 미리보기 위의 팝업(동의 칸 + ‘카카오로 계속하기’)을 그린다. login=1·관리자 쿠키·
//       인앱이 아닌 브라우저는 예전 그대로다. 시작 화면은 스스로 다른 곳으로 보내지 않는다(되풀이 없음).
//   L-1 기본 가계부: 동의하고 누른 카카오 로그인(또는 동의 기록이 있는 자동 로그인)인데 가계부가 없고 이을 계정도 없으면 ‘내 가계부’ 를 만들고 홈으로 간다.
//       잇기 제안이 있으면 만들지 않고 합치기 단계로 간다. 동의 기록이 없는 빈 계정의 자동 로그인은 지금처럼 시작 화면으로 간다.
//   L-3 동의 팝업: 세션을 만들 때 동의 기록을 한 번 읽어 쿠키 ab_cs(1/0)를 적고, 홈은 ab_cs=0 일 때만 팝업을 붙인다(DB 읽기 0회). 팝업은 POST /my/consent.
// 실제 요청(/app·/my·/m·/auth/kakao/start·callback·/my/kakao-claim·/my/consent·/my/logout·/my/local-signup·/my/local-login·/skill)과 저장된 행으로 본다.
// 가짜는 카카오 서버 두 곳(토큰·프로필)과 픽스처 DB 뿐이다.
//
// ── 실행 ──
//   node validation/validate-kakao-home-v229104.mjs
import { readFileSync } from "node:fs";
import { app, BASE, counter, failure, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.104 kakao in-app start screen + first household + consent popup");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");

const SECRET = "kakao-home-secret-v229104";
const DAY = "2026-11-06";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const ANDROID_INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const OFFERS_KEY = "kakao_login_link_offers_v22991";
const APP_NOV = "/app?month=2026-11";
const HOME = "/app?month=2026-07&household_id=house-home";
const CONSENT_MESSAGE = "이용약관 동의와 개인정보처리방침 확인(만 14세 이상)이 필요해요";
const CODE = /[A-HJ-NP-Z2-9]{8}(?:-[A-HJ-NP-Z2-9]{8}){3}/;
const siteConfig = read("src/modules/public/site-config.js");
const REVISION = siteConfig.match(/const POLICY_REVISION_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const CS_ON = "ab_cs=1; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax";
const CS_OFF = "ab_cs=0; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax";
const CS_CLEAR = "ab_cs=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Lax";

function resetIsolateState() {
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  for (const name of ["__AB_KAKAO_APP_USER_ID_PROBE", "__AB_KAKAO_LOGIN_CONFLICT_TRACED", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

async function homeFixture(task, { kakao = true } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v229104";
    if (kakao) Object.assign(fx.env, KAKAO_ENV);
    const server = kakaoServer(fx);
    try {
      return await task(fx, server);
    } finally {
      server.restore();
      resetIsolateState();
    }
  }));
}

// ── 쿠키 통(validate-identity-link-v22991 과 같은 모양) ──
class Jar {
  constructor(cookie = "") {
    this.items = new Map();
    for (const pair of String(cookie || "").split(";").map((item) => item.trim()).filter(Boolean)) {
      const at = pair.indexOf("=");
      this.items.set(pair.slice(0, at), { value: pair.slice(at + 1), path: "/" });
    }
  }
  take(response) {
    const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
    for (const line of lines) {
      const [pair, ...attrs] = line.split(";").map((item) => item.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at);
      const value = pair.slice(at + 1);
      const maxAge = attrs.find((item) => /^max-age=/i.test(item));
      const path = (attrs.find((item) => /^path=/i.test(item)) || "Path=/").slice(5) || "/";
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.items.delete(name);
      else this.items.set(name, { value, path });
    }
    return lines;
  }
  header(pathname) {
    return [...this.items].filter(([, item]) => item.path === "/" || pathname === item.path || pathname.startsWith(`${item.path}/`))
      .map(([name, item]) => `${name}=${item.value}`).join("; ");
  }
  get(name) { return this.items.get(name)?.value || ""; }
  has(name) { return this.items.has(name); }
  user() {
    const raw = this.get("ab_user");
    return raw ? decodeURIComponent(raw).split("|")[0] : "";
  }
}

async function go(fx, jar, path, { method = "GET", ua = CHROME, form = null, headers = {}, origin = BASE } = {}) {
  const url = new URL(path, BASE);
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...headers };
  const cookie = jar ? jar.header(url.pathname) : "";
  if (cookie) requestHeaders.cookie = cookie;
  const init = { method, headers: requestHeaders };
  if (form) {
    Object.assign(requestHeaders, { "content-type": "application/x-www-form-urlencoded", origin, "sec-fetch-site": origin === BASE ? "same-origin" : "cross-site" });
    init.body = new URLSearchParams(form).toString();
  }
  const response = await app.fetch(new Request(url.href, init), fx.env, { waitUntil() {}, passThroughOnException() {} });
  const cookies = jar ? jar.take(response) : (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []);
  return { status: response.status, location: response.headers.get("location") || "", headers: response.headers, cookies, html: await response.text() };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function putSetting(fx, key, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = text; else fx.db.accountbook_settings.push({ key, value: text });
}

// 카카오 서버(토큰·프로필)와 새 카카오 계정의 식별 연결 RPC(validate-v22995-legal 과 같은 흉내).
function kakaoServer(fx) {
  const server = { id: "2265", nickname: "Bin", restore: () => {} };
  server.restore = intercept(async ({ url, method, init }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") return json({ access_token: "qa-access-token", token_type: "bearer" });
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(server.id), properties: { nickname: server.nickname } });
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_link_kakao_identity_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: String(body.p_kakao_id), user_id: String(body.p_user_id), login_name: body.p_nickname, created_at: `${DAY}T00:00:00Z` });
      return json(true);
    }
    return null;
  });
  return server;
}

// 카카오 로그인 시작 → (카카오 화면 대신) 콜백. 콜백 응답까지 돌려준다(따라가지 않는다). kakaoAnswer 가 있으면 카카오가 그 오류로 돌려보낸 것이다.
async function kakaoLogin(fx, jar, server, kakaoId, { ua = INAPP, start = "/auth/kakao/start?consent=1", kakaoAnswer = "" } = {}) {
  server.id = String(kakaoId);
  const begin = await go(fx, jar, start, { ua });
  const authorize = new URL(begin.location || `${BASE}/`);
  const state = authorize.searchParams.get("state") || "";
  const query = kakaoAnswer ? `error=${encodeURIComponent(kakaoAnswer)}` : "code=qa-code";
  const callback = await go(fx, jar, `/auth/kakao/callback?${query}&state=${encodeURIComponent(state)}`, { ua });
  return { begin, authorize, state, callback };
}

function payloadFor(utterance, { user, room = "", appUserId = "" }) {
  const properties = { botUserKey: user, ...(appUserId ? { appUserId } : {}) };
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

async function say(fx, utterance, options) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify(payloadFor(utterance, options)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  return (parsed?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}

const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const ownedHouseholds = (fx, userId) => fx.db.household_members.filter((row) => row.user_id === userId && row.role === "owner").map((row) => fx.db.households.find((item) => item.id === row.household_id)).filter(Boolean);
const memberships = (fx, userId) => fx.db.household_members.filter((row) => row.user_id === userId);
const consentRecord = (fx, userId) => { const raw = settingValue(fx, `consent:${userId}`); try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; } };
const isStart = (html) => html.includes('id="abKakaoStart"');
const isFullLogin = (html) => html.includes('id="login-local"') && html.includes('class="landingPage"');
const noFree = (html) => !/무료/.test(html);
const cookieLine = (cookies, name) => cookies.find((line) => line.startsWith(`${name}=`)) || "";
const consentReadFails = (fx, userId) => intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.consent:${userId}` ? failure(503) : null));

// ── 0. 소스·등록 ──────────────────────────────────────────────────────────────
{
  const router = read("src/modules/worker/router.js");
  const manifest = read("src/modules/MANIFEST.txt");
  const start = read("src/modules/auth/kakao-start-screen.js");
  const autoAt = router.indexOf("const kakaoAutoLogin = await kakaoInAppAutoLoginResponse(request, env, url);");
  const startAt = router.indexOf("const kakaoStart = await kakaoInAppStartResponse(request, env, url);");
  ok(autoAt > 0 && startAt > autoAt && startAt - autoAt < 900, "0 라우터는 자동 로그인 바로 다음에 시작 화면을 고른다(자동 로그인이 늘 먼저)");
  ok(router.includes('if (url.pathname === "/my/consent" && request.method === "POST") {') && router.includes("return await handleMyConsent(request, env);"), "0 POST /my/consent 경로가 있다");
  ok(router.indexOf("if (!csrfOriginAllowed(request, url)) {") < router.indexOf('url.pathname === "/my/consent"'), "0 /my/consent 앞에 같은 출처 검사가 있다");
  ok(/web\/login-page-side-nav\.js\nauth\/kakao-start-screen\.js\n/.test(manifest), "0 새 모듈이 MANIFEST 에 있다");
  ok(noFree(start) && !/계속 무료/.test(start), "0 새 모듈에 ‘무료’ 말이 없다");
  ok(!/http-equiv=["']?refresh/i.test(start) && !/location\.(replace|href\s*=)/.test(start), "0 시작 화면은 스스로 다른 곳으로 보내는 코드가 없다(meta refresh·location.replace 없음)");
  // 홈·셸 CSS 의 .abV2281 button[type="submit"]:not(…)×3 (명시도 0,5,1, !important 파란 채움)을 카드 id 범위(1,1,0)로 이긴다. 카카오 단추는 카카오 노랑.
  ok(start.includes("#abStartCard .kakaoBtn{background:#fee500!important;color:rgba(0,0,0,.85)!important}") && start.includes("#abStartCard .abStartAlt a,#abStartCard .abStartAlt button{"), "0 팝업 단추 모양은 카드 id 범위의 !important 규칙이다(카카오 노랑·글자 단추)");
  const zIndex = Number(start.match(/\.abStartModal\{position:fixed;inset:0;z-index:(\d+);/)?.[1] || 0);
  ok(zIndex > 12000 && zIndex < 2147483647, `0 덮개는 홈의 축하 효과·시트(11901·12000)보다 위다 (${zIndex})`);
  const pkg = JSON.parse(read("package.json"));
  ok(pkg.scripts?.["validate:kakao-home-v229104"] === "node validation/validate-kakao-home-v229104.mjs", "0 package.json 에 검사가 등록돼 있다");
  ok(read(".codex/scripts/verify-repository.mjs").includes("validation/validate-kakao-home-v229104.mjs"), "0 하네스에 검사가 등록돼 있다");
}

// ── 1. 자동 로그인은 그대로(먼저) ───────────────────────────────────────────────
await homeFixture(async (fx) => {
  const auto = await go(fx, new Jar(), APP_NOV, { ua: INAPP });
  eq(auto.status, 303, "1 인앱·세션 없음·쿠키 없음 /app 은 지금처럼 화면 없는 자동 로그인으로 보낸다");
  eq(auto.location, `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(APP_NOV)}`, "1 자동 로그인 주소와 돌아갈 곳은 그대로다");
  eq((await go(fx, new Jar(), "/my", { ua: ANDROID_INAPP })).location, "/auth/kakao/start?auto=1", "1 안드로이드 인앱 /my 도 자동 로그인이 먼저다");
  ok(!events("kakao_inapp_start_shown").length, "1 자동 로그인을 보낸 요청은 시작 화면 이벤트를 남기지 않는다");
});

// ── 2. 시작 화면(쿠키 skip·off·try, auto=0) ─────────────────────────────────────
await homeFixture(async (fx) => {
  for (const kind of ["skip", "off", "try"]) {
    const response = await go(fx, new Jar(`ab_kakao_auto=${kind}`), APP_NOV, { ua: INAPP });
    eq(response.status, 200, `2 ab_kakao_auto=${kind} 인 인앱 /app 은 시작 화면(200)이다`);
    ok(isStart(response.html) && !isFullLogin(response.html), `2 ab_kakao_auto=${kind}: 긴 로그인 화면이 아니라 시작 화면이다`);
    eq(response.location, "", `2 ab_kakao_auto=${kind}: 다른 곳으로 보내지 않는다`);
  }
  const page = await go(fx, new Jar("ab_kakao_auto=skip"), APP_NOV, { ua: INAPP });
  const html = page.html;
  ok(html.includes('<h2 id="abKakaoStartTitle">카카오 계정으로 가계부 열기</h2>'), "2 팝업 제목");
  ok(html.includes(">카카오톡에서 기록한 가계부를 바로 열어요.</p>"), "2 팝업 안내 한 줄");
  ok(html.includes('<div class="abStartModal" id="abKakaoStart" role="dialog" aria-modal="true"'), "2 팝업은 서버가 열린 상태로 그린다(스크립트 없이 보임, hidden 없음)");
  ok(html.includes(`<form class="kakaoStart" method="get" action="/auth/kakao/start"><input type="hidden" name="return_to" value="${APP_NOV}"/><label class="consentRow"><input id="kakaoConsent" name="consent" type="checkbox" value="1" required/>`), "2 GET 폼: 숨은 돌아갈 곳 + 필수 동의 칸(미리 체크 없음)");
  ok(!/id="kakaoConsent"[^>]*checked/.test(html), "2 동의 칸은 미리 체크돼 있지 않다");
  ok(html.includes("[필수] <a href=\"/terms\" target=\"_blank\">이용약관</a>에 동의하고 <a href=\"/privacy\" target=\"_blank\">개인정보처리방침</a>을 확인했어요"), "2 동의 칸 문구와 새 탭 링크 두 개");
  ok(/<button class="kakaoBtn" type="submit"><svg[^>]*>[\s\S]*?<\/svg>카카오로 계속하기<\/button><\/form>/.test(html), "2 ‘카카오로 계속하기’ 단추");
  ok(html.includes(`href="/my?auto=0&amp;login=1&amp;return_to=${encodeURIComponent(APP_NOV)}#login-local">로그인 이름으로 로그인</a>`), "2 ‘로그인 이름으로 로그인’ 은 auto=0·login=1 긴 로그인 화면");
  ok(html.includes(`href="/my/kakao-claim?auto=0&amp;return_to=${encodeURIComponent(APP_NOV)}#kakao-claim-start">웹 연결 코드로 열기</a>`), "2 ‘웹 연결 코드로 열기’ 는 1:1 코드 칸");
  ok(html.includes('<div class="abStartPreview" aria-hidden="true" inert>') && html.includes('<nav class="bottom">'), "2 바탕은 화면 읽기·초점에서 빠진 홈 모양 미리보기다");
  ok(!html.includes("우리집 생활비") && !html.includes("7월 월급") && !html.includes("Bin") && !html.includes("house-home"), "2 미리보기에 가계부 데이터가 없다");
  ok(!/http-equiv=["']?refresh/i.test(html), "2 시작 화면에 자동 이동(meta refresh)이 없다");
  ok(html.includes('id="kakaoLoginProgress"') && html.includes('<script id="kakaoLoginProgressRuntime">'), "2 카카오 단추의 대기 화면(J-13 location.assign)이 붙는다");
  ok(page.headers.get("content-security-policy")?.includes("form-action 'self' https://kauth.kakao.com https://accounts.kakao.com"), "2 CSP form-action 이 카카오 인가 두 곳을 허용한다(J-13)");
  ok(noFree(html), "2 시작 화면에 ‘무료’ 가 없다");
  ok(events("kakao_inapp_start_shown").some((event) => event.severity === "info" && event.detail === "cookie=skip"), "2 운영 이벤트 kakao_inapp_start_shown(info)를 남긴다");

  const my = await go(fx, new Jar("ab_kakao_auto=skip"), "/my", { ua: INAPP });
  ok(my.status === 200 && isStart(my.html) && my.html.includes('<form class="kakaoStart" method="get" action="/auth/kakao/start"><label class="consentRow">'), "2 /my(1:1 링크 주소)도 시작 화면, 돌아갈 곳 없음");
  const mobile = await go(fx, new Jar("ab_kakao_auto=off"), "/m", { ua: INAPP });
  ok(mobile.status === 200 && isStart(mobile.html), "2 /m 도 시작 화면");
  const deep = await go(fx, new Jar("ab_kakao_auto=skip"), "/my?return_to=%2Fbudgets%3Fmonth%3D2026-11", { ua: INAPP });
  ok(deep.html.includes('<input type="hidden" name="return_to" value="/budgets?month=2026-11"/>'), "2 /my 의 return_to 를 그대로 싣는다");

  const fallback = await go(fx, new Jar(), `/my?auto=0&return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
  ok(fallback.status === 200 && isStart(fallback.html) && fallback.html.includes(`value="${APP_NOV}"`), "2 자동 로그인이 돌려보낸 /my?auto=0 은 쿠키 없이도 시작 화면이다");
  ok(events("kakao_inapp_start_shown").some((event) => event.detail === "auto=0"), "2 auto=0 시작 화면도 이벤트를 남긴다");
  const login = await go(fx, new Jar(), `/my?auto=0&login=1&return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
  ok(login.status === 200 && isFullLogin(login.html) && !isStart(login.html), "2 login=1 은 긴 로그인 화면이다");
  ok(login.html.includes('<details class="loginLocal" id="login-local" open>') && login.html.includes(`<form method="post" action="/my/local-login"><input type="hidden" name="return_to" value="${APP_NOV}"/>`), "2 login=1 은 로그인 이름 칸을 열고 돌아갈 곳을 싣는다");
  const claim = await go(fx, new Jar(), `/my/kakao-claim?auto=0&return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
  ok(claim.status === 200 && claim.html.includes('id="kakao-claim-start" open') && !isStart(claim.html), "2 웹 연결 코드 칸은 열린 채 그려진다(자동 로그인·시작 화면 없음)");

  const outside = await go(fx, new Jar(), "/my", { ua: CHROME });
  ok(outside.status === 200 && isFullLogin(outside.html) && !isStart(outside.html), "2 인앱이 아닌 브라우저의 /my 는 예전 로그인 화면이다");
  ok(outside.html.includes("[필수] <a href=\"/terms\" target=\"_blank\">이용약관</a>에 동의하고") && noFree(outside.html), "2 바깥 브라우저는 동의 칸 문구만 바뀐다");
  const outsideApp = await go(fx, new Jar(), APP_NOV, { ua: CHROME });
  ok(outsideApp.status === 303 && outsideApp.location === "/my", "2 바깥 브라우저의 세션 없는 /app 은 예전처럼 /my 로 간다");
  const admin = await go(fx, new Jar("ab_admin=qa; ab_kakao_auto=skip"), "/my", { ua: INAPP });
  ok(admin.status === 200 && !isStart(admin.html), "2 관리자 쿠키가 있는 브라우저는 시작 화면을 그리지 않는다");
  const evil = await go(fx, new Jar("ab_kakao_auto=skip"), "/my?return_to=https%3A%2F%2Fevil.example%2Fx", { ua: INAPP });
  ok(isStart(evil.html) && !evil.html.includes("evil.example"), "2 바깥 주소 return_to 는 싣지 않는다");
  const evil2 = await go(fx, new Jar("ab_kakao_auto=skip"), "/my?return_to=%2F%2Fevil.example%2Fx", { ua: INAPP });
  ok(isStart(evil2.html) && !evil2.html.includes("evil.example"), "2 //로 시작하는 return_to 도 싣지 않는다");
  const signedIn = await go(fx, new Jar(`${fx.cookie}; ab_kakao_auto=skip`), HOME, { ua: INAPP });
  ok(signedIn.status === 200 && !isStart(signedIn.html) && !signedIn.html.includes('id="abConsentPop"'), "2 세션이 있으면 홈이다(동의 쿠키가 없으면 팝업도 없음)");
});
await homeFixture(async (fx) => {
  const off = await go(fx, new Jar("ab_kakao_auto=skip"), "/my", { ua: INAPP });
  ok(off.status === 200 && !isStart(off.html), "2 카카오 로그인이 준비되지 않은 서버는 시작 화면을 그리지 않는다");
}, { kakao: false });

// ── 3. 동의 없이 누른 카카오 시작·카카오 취소 ─────────────────────────────────────
await homeFixture(async (fx, server) => {
  const plain = await go(fx, new Jar(), `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
  eq(plain.status, 400, "3 동의 칸 없이 시작하면 400");
  ok(isStart(plain.html) && plain.html.includes(`<p class="fieldError" id="kakaoConsentError">${CONSENT_MESSAGE}</p>`) && plain.html.includes(`value="${APP_NOV}"`), "3 인앱은 시작 화면의 동의 칸 아래에 오류를 적는다(돌아갈 곳 유지)");
  const outside = await go(fx, new Jar(), "/auth/kakao/start", { ua: CHROME });
  ok(outside.status === 400 && isFullLogin(outside.html) && !isStart(outside.html), "3 바깥 브라우저는 예전 로그인 화면(동의 칸 오류)이다");
  const begin = await go(fx, new Jar(), `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1`, { ua: INAPP });
  const authorize = new URL(begin.location || `${BASE}/`);
  ok(begin.status === 303 && authorize.origin === "https://kauth.kakao.com" && authorize.pathname === "/oauth/authorize", "3 동의하고 누르면 카카오 인가 화면으로 간다");
  ok(authorize.searchParams.get("prompt") !== "none", "3 화면 있는 보통 로그인이다(prompt=none 아님)");
  const jar = new Jar();
  const cancelled = await kakaoLogin(fx, jar, server, "7799", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1`, kakaoAnswer: "access_denied" });
  ok(cancelled.callback.status < 500 && isStart(cancelled.callback.html) && cancelled.callback.html.includes('role="alert"') && cancelled.callback.html.includes(`value="${APP_NOV}"`), "3 인앱에서 카카오를 취소하면 시작 화면에 알림과 돌아갈 곳을 다시 보인다");
  ok(!jar.has("ab_user") && !fx.db.users.some((user) => user.kakao_user_key === "kakao_login:7799"), "3 취소는 계정을 만들지 않는다");
});

// ── 4. 콜백: 새 계정 + 기본 가계부 ────────────────────────────────────────────────
await homeFixture(async (fx, server) => {
  const users = fx.db.users.length;
  const households = fx.db.households.length;
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "7701", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1` });
  eq(login.callback.status, 303, "4 동의한 새 카카오 사용자는 로그인된다");
  eq(login.callback.location, APP_NOV, "4 첫 가계부 화면이 아니라 돌아갈 곳(홈)으로 간다");
  const created = userByKey(fx, "kakao_login:7701");
  ok(created && jar.user() === created.id && fx.db.users.length === users + 1, "4 새 계정 하나에 세션이 붙는다");
  const owned = ownedHouseholds(fx, created?.id);
  ok(owned.length === 1 && owned[0].name === "내 가계부" && fx.db.households.length === households + 1, `4 ‘내 가계부’ 하나를 이 계정 소유로 만든다 (${owned.map((row) => row.name).join(",")})`);
  eq(cookieLine(login.callback.cookies, "ab_cs"), CS_ON, "4 방금 남긴 동의 기록은 ab_cs=1(14일)로 이어진다");
  eq(consentRecord(fx, created?.id)?.via, "kakao", "4 동의 기록(via kakao)을 남긴다");
  ok(events("kakao_first_household").some((event) => event.severity === "info" && /^new_account;login;trace=/.test(event.detail)), "4 운영 이벤트 kakao_first_household(info)");
  const home = await go(fx, jar, login.callback.location, { ua: INAPP });
  ok(home.status === 200 && !isStart(home.html) && !home.html.includes('id="abConsentPop"') && home.html.includes("내 가계부"), "4 홈이 바로 나온다(팝업 없음)");

  const plainJar = new Jar();
  const plain = await kakaoLogin(fx, plainJar, server, "7702");
  eq(plain.callback.location, "/app", "4 돌아갈 곳이 없으면 /app 으로 간다");
  eq(ownedHouseholds(fx, userByKey(fx, "kakao_login:7702")?.id).length, 1, "4 그 계정도 기본 가계부 하나");
  const again = await kakaoLogin(fx, new Jar(), server, "7702");
  eq(again.callback.location, "/my", "4 다시 로그인하면 이미 있는 가계부로 간다(돌아갈 곳 없으면 /my, 예전과 같다)");
  eq(ownedHouseholds(fx, userByKey(fx, "kakao_login:7702")?.id).length, 1, "4 다시 로그인해도 가계부를 더 만들지 않는다");

  const existing = await kakaoLogin(fx, new Jar(), server, "2265", { start: `/auth/kakao/start?return_to=${encodeURIComponent(HOME)}&consent=1` });
  eq(existing.callback.location, HOME, "4 가계부가 있는 기존 계정은 돌아갈 곳으로 간다");
  // 통합 검토: 체크하고 누른 로그인이면 기록이 없던 기존 계정에도 기록을 남긴다(방금 체크한 사람이 홈 팝업을 또 보지 않게).
  eq(cookieLine(existing.callback.cookies, "ab_cs"), CS_ON, "4 동의 기록이 없던 기존 계정도 체크하고 누른 로그인이면 ab_cs=1");
  ok(consentRecord(fx, "user-bin")?.via === "kakao" && consentRecord(fx, "user-bin")?.version === REVISION, "4 그 동의를 기록한다(via kakao)");
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "consent:user-bin");
  eq(ownedHouseholds(fx, "user-bin").length, 2, "4 기존 계정에는 가계부를 만들지 않는다");
  putSetting(fx, "consent:user-bin", { version: REVISION, at: "2026-11-02T03:00:00.000Z", via: "local", age14: true });
  const known = await kakaoLogin(fx, new Jar(), server, "2265");
  eq(cookieLine(known.callback.cookies, "ab_cs"), CS_ON, "4 동의 기록이 있으면 ab_cs=1");
  const restore = consentReadFails(fx, "user-bin");
  let unread;
  try { unread = await kakaoLogin(fx, new Jar(), server, "2265"); } finally { restore(); }
  ok(unread.callback.status === 303 && unread.callback.location === "/my" && cookieLine(unread.callback.cookies, "ab_cs") === CS_CLEAR, "4 동의 기록을 읽지 못하면 로그인은 되고 남은 ab_cs 를 지운다(모름 = 팝업 없음, 독립 검토 P3-4)");
});

// ── 4b. 이미 있던 계정의 동의 기록(통합 검토) ─────────────────────────────────────
// 시작 화면에서 체크하고 누른 로그인은 기록이 없던 계정(V22.9.95 전 계정, 단톡방에서 먼저 써 봇이 만든 계정)에도 기록을 남긴다.
// 체크 없이 들어온 자동 로그인은 남기지 않는다(홈 팝업이 받는다).
await homeFixture(async (fx, server) => {
  const autoJar = new Jar();
  const auto = await kakaoLogin(fx, autoJar, server, "2265", { start: `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(HOME)}` });
  ok(auto.callback.status === 303 && auto.callback.location === HOME && autoJar.user() === "user-bin", "4b 가계부가 있는 계정의 자동 로그인은 그대로 들인다");
  eq(cookieLine(auto.callback.cookies, "ab_cs"), CS_OFF, "4b 체크 없이 들어온 자동 로그인은 ab_cs=0");
  ok(!consentRecord(fx, "user-bin"), "4b 자동 로그인은 동의 기록을 남기지 않는다");
  const autoHome = await go(fx, autoJar, HOME, { ua: INAPP });
  ok(autoHome.status === 200 && autoHome.html.includes('id="abConsentPop"'), "4b 그 홈에는 동의 팝업");

  await say(fx, "커피 4100", { user: "bot-v104-first", appUserId: "4400" });
  const chat = userByKey(fx, "bot-v104-first")?.id;
  ok(chat && memberships(fx, chat).length > 0 && !consentRecord(fx, chat), "4b 준비: 봇이 만든 계정과 가계부(동의 기록 없음)");
  const households = fx.db.households.length;
  const users = fx.db.users.length;
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "4400", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1` });
  eq(login.callback.location, APP_NOV, "4b 단톡방에서 먼저 쓴 사람은 돌아갈 곳(기록한 가계부 홈)으로 간다");
  ok(jar.user() === chat && fx.db.households.length === households && fx.db.users.length === users, "4b 봇이 만든 계정에 세션이 붙고 새 계정·가계부를 만들지 않는다");
  eq(cookieLine(login.callback.cookies, "ab_cs"), CS_ON, "4b 시작 화면에서 체크한 동의는 ab_cs=1");
  eq(consentRecord(fx, chat)?.via, "kakao", "4b 동의 기록(via kakao)을 남긴다");
  const home = await go(fx, jar, login.callback.location, { ua: INAPP });
  ok(home.status === 200 && !home.html.includes('id="abConsentPop"') && !isStart(home.html), "4b 홈이 바로 나온다(팝업 없음)");

  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== `consent:${chat}`);
  const refuse = intercept(async ({ url, method, init }) => (method === "POST" && url.pathname === "/rest/v1/accountbook_settings" && String(init?.body || "").includes('"key":"consent:') ? failure(503) : null));
  let failed;
  try { failed = await kakaoLogin(fx, new Jar(), server, "4400", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1` }); } finally { refuse(); }
  ok(failed.callback.status === 303 && failed.callback.location === APP_NOV && cookieLine(failed.callback.cookies, "ab_cs") === CS_OFF && !consentRecord(fx, chat), "4b 기록 저장이 실패하면 로그인은 되고 ab_cs=0(팝업이 다시 받는다)");
});

// ── 5. 잇기 제안이 있으면 가계부를 만들지 않고 합치기 단계 ──────────────────────────
await homeFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-web-v104", kakao_user_key: "kakao_login:3300", nickname: "웹사용자", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-web-v104", provider: "kakao", provider_subject: "3300", login_name: "", credential_version: 2 });
  await say(fx, "커피 4100", { user: "bot-v104-link" });
  const chat = userByKey(fx, "bot-v104-link")?.id;
  ok(chat && memberships(fx, chat).length > 0, "5 준비: 채팅 계정과 가계부");
  await say(fx, "점심 8100", { user: "bot-v104-link", appUserId: "3300" });
  ok(JSON.parse(settingValue(fx, OFFERS_KEY) || "{}")["user-web-v104"]?.chat_user_id === chat, "5 준비: 빈 웹 계정 → 채팅 계정 잇기 제안");
  const households = fx.db.households.length;
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "3300", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1` });
  eq(login.callback.location, "/my/account-link/run", "5 잇기 제안이 있으면 합치기 단계로 간다");
  ok(memberships(fx, "user-web-v104").length === 0 && fx.db.households.length === households, "5 기본 가계부를 만들지 않는다(기록이 갈라지지 않게)");
  ok(!events("kakao_first_household").length, "5 기본 가계부 이벤트가 없다");
});

// ── 6. 자동 로그인(화면 없음)의 빈 계정 ─────────────────────────────────────────
await homeFixture(async (fx, server) => {
  for (const [id, kakaoId] of [["user-empty-104", "9910"], ["user-empty-105", "9911"]]) {
    fx.db.users.push({ id, kakao_user_key: `kakao_login:${kakaoId}`, nickname: "빈웹", created_at: "2026-10-01T00:00:00.000Z" });
    fx.db.accountbook_user_identities.push({ user_id: id, provider: "kakao", provider_subject: kakaoId, login_name: "", credential_version: 2 });
  }
  putSetting(fx, "consent:user-empty-104", { version: REVISION, at: "2026-11-02T03:00:00.000Z", via: "kakao", age14: true });
  const autoStart = `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(APP_NOV)}`;
  const jar = new Jar();
  const withConsent = await kakaoLogin(fx, jar, server, "9910", { start: autoStart });
  ok(withConsent.authorize.searchParams.get("prompt") === "none", "6 자동 로그인은 화면 없는 카카오 로그인이다(prompt=none)");
  eq(withConsent.callback.location, APP_NOV, "6 동의 기록이 있는 빈 계정은 기본 가계부를 만들고 들인다");
  ok(jar.user() === "user-empty-104" && ownedHouseholds(fx, "user-empty-104").length === 1 && ownedHouseholds(fx, "user-empty-104")[0].name === "내 가계부", "6 세션과 ‘내 가계부’ 하나");
  eq(cookieLine(withConsent.callback.cookies, "ab_cs"), CS_ON, "6 ab_cs=1");
  ok(events("kakao_first_household").some((event) => /^empty_account;auto;/.test(event.detail)), "6 운영 이벤트(empty_account;auto)");
  const noJar = new Jar();
  const without = await kakaoLogin(fx, noJar, server, "9911", { start: autoStart });
  eq(without.callback.location, `/my?auto=0&return_to=${encodeURIComponent(APP_NOV)}`, "6 동의 기록이 없는 빈 계정은 지금처럼 시작 화면으로 돌려보낸다");
  ok(!noJar.has("ab_user") && noJar.get("ab_kakao_auto") === "skip" && memberships(fx, "user-empty-105").length === 0, "6 세션 없음·하루 쉼·가계부 없음");
  const back = await go(fx, noJar, without.callback.location, { ua: INAPP });
  ok(back.status === 200 && isStart(back.html), "6 돌아간 곳은 시작 화면이다");
  const none = await kakaoLogin(fx, new Jar(), server, "9988", { start: autoStart });
  ok(none.callback.location.startsWith("/my?auto=0") && !userByKey(fx, "kakao_login:9988"), "6 웹 계정이 없는 카카오 회원의 자동 로그인은 계정을 만들지 않는다(그대로)");
});

// ── 7. 기본 가계부를 만들지 못하면 ───────────────────────────────────────────────
await homeFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-empty-106", kakao_user_key: "kakao_login:9920", nickname: "빈웹", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-empty-106", provider: "kakao", provider_subject: "9920", login_name: "", credential_version: 2 });
  putSetting(fx, "consent:user-empty-106", { version: REVISION, at: "2026-11-02T03:00:00.000Z", via: "kakao", age14: true });
  const restore = intercept(async ({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/households" ? failure(400, "simulated household create refusal") : null));
  try {
    const manual = new Jar();
    const login = await kakaoLogin(fx, manual, server, "9920");
    eq(login.callback.location, "/my/households?first=1#create", "7 보통 로그인은 예전처럼 첫 가계부 화면으로 간다");
    eq(manual.user(), "user-empty-106", "7 로그인은 된다");
    const autoJar = new Jar();
    const auto = await kakaoLogin(fx, autoJar, server, "9920", { start: "/auth/kakao/start?auto=1" });
    ok(auto.callback.location === "/my?auto=0" && !autoJar.has("ab_user"), "7 자동 로그인은 시작 화면으로 돌려보낸다");
  } finally {
    restore();
  }
  ok(events("kakao_first_household_failed").some((event) => event.severity === "warn"), "7 운영 이벤트 kakao_first_household_failed(warn)");
  eq(memberships(fx, "user-empty-106").length, 0, "7 가계부는 생기지 않았다");
});

// ── 7b. 잇기 확인이 실패하면(제안 표 읽기 오류) 기본 가계부를 만들지 않는다 ─────────────────
// 이을 계정(단톡방 기록 계정)이 있을 수 있어서다. 만들면 기록이 갈라지고 다음 합치기가 ‘확인’ 단계로 바뀐다.
await homeFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-empty-107", kakao_user_key: "kakao_login:9930", nickname: "빈웹", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-empty-107", provider: "kakao", provider_subject: "9930", login_name: "", credential_version: 2 });
  putSetting(fx, "consent:user-empty-107", { version: REVISION, at: "2026-11-02T03:00:00.000Z", via: "kakao" });
  const households = fx.db.households.length;
  const restore = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.${OFFERS_KEY}` ? failure(503) : null));
  try {
    const manual = new Jar();
    const login = await kakaoLogin(fx, manual, server, "9930");
    eq(login.callback.location, "/my/households?first=1#create", "7b 잇기 확인이 실패하면 보통 로그인은 예전처럼 첫 가계부 화면으로 간다");
    eq(manual.user(), "user-empty-107", "7b 로그인은 된다");
    const autoJar = new Jar();
    const auto = await kakaoLogin(fx, autoJar, server, "9930", { start: "/auth/kakao/start?auto=1" });
    ok(auto.callback.location === "/my?auto=0" && !autoJar.has("ab_user"), "7b 자동 로그인은 동의 기록이 있어도 시작 화면으로 돌려보낸다");
  } finally {
    restore();
  }
  ok(memberships(fx, "user-empty-107").length === 0 && fx.db.households.length === households, "7b 가계부를 만들지 않는다(이을 계정이 있을 수 있다)");
  ok(events("kakao_account_link_check_failed").some((event) => event.severity === "warn"), "7b 운영 이벤트 kakao_account_link_check_failed(warn)");
  ok(!events("kakao_first_household").length && !events("kakao_first_household_failed").length, "7b 기본 가계부 이벤트가 없다");
});

// ── 8. 되풀이 없음(3번 다시 열기) ────────────────────────────────────────────────
await homeFixture(async (fx, server) => {
  const jar = new Jar();
  const hops = [];
  let path = APP_NOV;
  let last = null;
  for (let step = 0; step < 8; step += 1) {
    const response = await go(fx, jar, path, { ua: INAPP });
    hops.push(`${response.status} ${path}`);
    last = response;
    if (response.status !== 303) break;
    const next = new URL(response.location, BASE);
    if (next.origin === "https://kauth.kakao.com") {
      // 카카오 비회원(prompt=none)은 consent_required 로 돌려보낸다.
      path = `/auth/kakao/callback?error=consent_required&state=${encodeURIComponent(next.searchParams.get("state") || "")}`;
    } else path = `${next.pathname}${next.search}`;
  }
  ok(last?.status === 200 && isStart(last.html), `8 첫 열기: 자동 로그인 한 번 뒤 시작 화면에서 멈춘다 (${hops.join(" → ")})`);
  ok(hops.length <= 4, `8 첫 열기의 이동은 4번 이하다 (${hops.length})`);
  for (let round = 1; round <= 3; round += 1) {
    const again = await go(fx, jar, APP_NOV, { ua: INAPP });
    ok(again.status === 200 && isStart(again.html) && !again.location, `8 ${round}번째 다시 열기: 바로 시작 화면(이동 0번)`);
  }
  // 쿠키가 막힌 인앱 브라우저: 매번 쿠키 없이 와도 auto=0 주소는 이동하지 않는다.
  for (let round = 1; round <= 3; round += 1) {
    const blocked = await go(fx, new Jar(), `/my?auto=0&return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
    ok(blocked.status === 200 && isStart(blocked.html), `8 쿠키 없는 ${round}번째 auto=0: 시작 화면(이동 없음)`);
  }
  void server;
});

// ── 9. 웹 연결 코드(1:1 ‘웹 가계부 열기’) ───────────────────────────────────────
await homeFixture(async (fx) => {
  await say(fx, "커피 4100", { user: "bot-v104-claim" });
  const chat = userByKey(fx, "bot-v104-claim")?.id;
  ok(chat && memberships(fx, chat).length > 0 && !consentRecord(fx, chat), "9 준비: 단톡방·1:1 에서 먼저 생긴 채팅 계정(동의 기록 없음)");
  const reply = await say(fx, "웹 가계부 열기", { user: "bot-v104-claim" });
  const code = reply.match(CODE)?.[0] || "";
  ok(code, "9 1:1 ‘웹 가계부 열기’ 가 웹 연결 코드를 준다");
  const jar = new Jar("ab_kakao_auto=skip");
  const start = await go(fx, jar, "/my", { ua: INAPP });
  ok(isStart(start.html) && start.html.includes('href="/my/kakao-claim?auto=0#kakao-claim-start">웹 연결 코드로 열기</a>'), "9 1:1 링크(/my)의 시작 화면에서 코드 칸으로 간다");
  const form = await go(fx, jar, "/my/kakao-claim?auto=0", { ua: INAPP });
  ok(form.status === 200 && form.html.includes('<form method="post" action="/my/kakao-claim">'), "9 코드 칸이 그려진다");
  const redeem = await go(fx, jar, "/my/kakao-claim", { ua: INAPP, method: "POST", form: { kakao_claim_code: code } });
  ok(redeem.status === 303 && jar.user() === chat, `9 코드로 채팅 계정에 로그인된다 (${redeem.status} ${redeem.location})`);
  eq(cookieLine(redeem.cookies, "ab_cs"), CS_OFF, "9 동의 기록이 없는 계정이라 ab_cs=0");
  ok(redeem.cookies[0]?.startsWith("ab_user="), "9 첫 쿠키는 여전히 세션(ab_user)이다");
  const home = await go(fx, jar, "/app", { ua: INAPP });
  ok(home.status === 200 && home.html.includes('id="abConsentPop"') && !isStart(home.html), "9 홈이 나오고 그 위에 동의 팝업이 뜬다");
  const accepted = await go(fx, jar, "/my/consent", { ua: INAPP, method: "POST", form: { consent: "1", return_to: "/app" } });
  ok(accepted.status === 303 && accepted.location === "/app" && consentRecord(fx, chat)?.via === "popup", "9 팝업에서 동의하면 기록(via popup)을 남기고 홈으로 돌아간다");
  const after = await go(fx, jar, "/app", { ua: INAPP });
  ok(after.status === 200 && !after.html.includes('id="abConsentPop"'), "9 다음 홈에는 팝업이 없다");
});

// ── 10. 홈 동의 팝업 ─────────────────────────────────────────────────────────
await homeFixture(async (fx) => {
  const off = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), HOME, { ua: CHROME });
  ok(off.status === 200 && off.html.includes('<div class="abStartModal" id="abConsentPop" role="dialog" aria-modal="true"'), "10 ab_cs=0 이면 홈 위에 동의 팝업");
  ok(off.html.includes('<h2 id="abConsentPopTitle">이용약관을 확인해 주세요</h2>'), "10 팝업 제목");
  ok(off.html.includes(`<form method="post" action="/my/consent"><input type="hidden" name="return_to" value="${HOME.replace("&", "&amp;")}"/><label class="consentRow"><input id="consentPopup" name="consent" type="checkbox" value="1" required/>`), "10 POST 폼: 돌아갈 곳 + 미리 체크 없는 필수 칸");
  ok(off.html.includes('<button class="abStartGo" type="submit">동의하고 계속</button></form><form class="abStartAlt" method="post" action="/my/logout"><button type="submit">로그아웃</button></form>'), "10 ‘동의하고 계속’ 과 작은 로그아웃");
  ok(off.html.indexOf('id="abConsentPop"') > off.html.indexOf('<nav class="bottom"') || off.html.indexOf('id="abConsentPop"') > off.html.lastIndexOf("<main"), "10 팝업은 홈 뒤(</body> 앞)에 붙는다");
  ok(noFree(off.html.slice(off.html.indexOf('id="abConsentPop"'))), "10 팝업에 ‘무료’ 가 없다");
  const msg = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), `${HOME}&msg=saved&saved_rid=r1&undo=t1`, { ua: CHROME });
  ok(msg.html.includes(`name="return_to" value="${HOME.replace("&", "&amp;")}"/>`), "10 돌아갈 곳에서 한 번 쓰는 알림 값(msg·saved_rid·undo)은 뺀다");
  const missing = await go(fx, new Jar(fx.cookie), HOME, { ua: CHROME });
  const on = await go(fx, new Jar(`${fx.cookie}; ab_cs=1`), HOME, { ua: CHROME });
  ok(!missing.html.includes("abConsentPop") && !on.html.includes("abConsentPop"), "10 ab_cs 가 없거나(모름) 1 이면 팝업이 없다");
  eq(on.html.length, missing.html.length, "10 팝업이 없을 때 홈 HTML 은 한 바이트도 늘지 않는다");
  const strange = await go(fx, new Jar(`${fx.cookie}; ab_cs=yes`), HOME, { ua: CHROME });
  ok(!strange.html.includes("abConsentPop"), "10 다른 값은 모름(팝업 없음)");
  const admin = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), HOME, { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(admin.status === 200 && !admin.html.includes("abConsentPop"), "10 관리자 세션에는 팝업이 없다");
  console.log(`홈 HTML: 팝업 없음 ${Buffer.byteLength(missing.html)} B, 팝업 있음 ${Buffer.byteLength(off.html)} B (+${Buffer.byteLength(off.html) - Buffer.byteLength(missing.html)} B, ab_cs=0 일 때만)`);
});

// ── 11. POST /my/consent ─────────────────────────────────────────────────────
await homeFixture(async (fx) => {
  const anonymous = await go(fx, new Jar(), "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME } });
  ok(anonymous.status === 303 && anonymous.location === "/my" && !consentRecord(fx, "user-bin"), "11 세션이 없으면 /my 로 보내고 아무것도 남기지 않는다");
  const cross = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME }, origin: "https://evil.example" });
  ok(cross.status === 403 && !consentRecord(fx, "user-bin") && !cookieLine(cross.cookies, "ab_cs"), `11 다른 사이트에서 보낸 요청은 막는다 (${cross.status})`);
  const box = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { return_to: HOME } });
  ok(box.status === 400 && box.html.includes('id="abConsentPop"') && box.html.includes(`<p class="fieldError" id="consentPopupError">${CONSENT_MESSAGE}</p>`) && box.html.includes(`value="${HOME.replace("&", "&amp;")}"`), "11 칸을 체크하지 않으면 400 으로 팝업을 다시 그린다(칸 아래 오류, 돌아갈 곳 유지)");
  ok(!consentRecord(fx, "user-bin") && !cookieLine(box.cookies, "ab_cs"), "11 칸 없는 요청은 기록·쿠키를 남기지 않는다");
  ok(box.html.split('id="abStartModalStyle"').length === 2 && noFree(box.html), "11 다시 그린 화면: 스타일 한 번, ‘무료’ 없음");
  const failed = intercept(async ({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/accountbook_settings" ? failure(503) : null));
  let refused;
  try { refused = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME } }); } finally { failed(); }
  ok(refused.status === 503 && refused.html.includes("동의 기록을 저장하지 못했어요") && !cookieLine(refused.cookies, "ab_cs"), "11 기록을 저장하지 못하면 503 으로 다시 그리고 쿠키를 적지 않는다");
  const jar = new Jar(`${fx.cookie}; ab_cs=0`);
  const accepted = await go(fx, jar, "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME } });
  eq(accepted.status, 303, "11 동의하면 303");
  eq(accepted.location, HOME, "11 돌아갈 곳(같은 사이트)으로 간다");
  eq(cookieLine(accepted.cookies, "ab_cs"), CS_ON, "11 ab_cs=1(HttpOnly·Secure·SameSite=Lax·14일)");
  const record = consentRecord(fx, "user-bin");
  ok(record && record.version === REVISION && record.via === "popup" && record.age14 === true && Number.isFinite(Date.parse(record.at)), `11 동의 기록(consent:user-bin, via popup) ${JSON.stringify(record)}`);
  ok(events("consent_popup_accepted").some((event) => event.detail === "recorded"), "11 운영 이벤트 consent_popup_accepted");
  const home = await go(fx, jar, HOME, { ua: CHROME });
  ok(home.status === 200 && !home.html.includes("abConsentPop"), "11 돌아간 홈에는 팝업이 없다");
  const firstAt = record?.at;
  const twice = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME } });
  ok(twice.status === 303 && consentRecord(fx, "user-bin")?.at === firstAt && cookieLine(twice.cookies, "ab_cs") === CS_ON, "11 이미 기록이 있으면 다시 쓰지 않고 쿠키만 맞춘다");
  for (const [raw, label] of [["https://evil.example/x", "바깥 주소"], ["//evil.example/x", "//"], ["/my/consent", "/my/consent"], ["/support", "허용 목록 밖"], ["", "빈 값"]]) {
    const response = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { consent: "1", return_to: raw } });
    eq(response.location, "/app", `11 return_to ${label} 은 /app 으로 간다`);
  }
});

// ── 12. 세션을 만드는 다른 곳(가입·로그인 이름 로그인·로그아웃) ─────────────────────────
await homeFixture(async (fx) => {
  const signupForm = { login_name: "Home Family", display_name: "홈 사용자", access_code: "safe-password-2026", access_code_confirm: "safe-password-2026" };
  const noConsent = await go(fx, new Jar(), "/my/local-signup", { method: "POST", form: signupForm });
  ok(noConsent.status === 400 && noConsent.html.includes(CONSENT_MESSAGE), "12 동의 없는 가입은 그대로 400(같은 동의 문구)");
  const jar = new Jar();
  const signup = await go(fx, jar, "/my/local-signup", { method: "POST", form: { ...signupForm, consent: "1" } });
  ok(signup.status === 303 && jar.user() && signup.cookies[0]?.startsWith("ab_user="), "12 가입은 세션을 만든다(첫 쿠키 ab_user)");
  eq(cookieLine(signup.cookies, "ab_cs"), CS_ON, "12 가입 동의 기록 → ab_cs=1");
  const newUser = jar.user();
  const login = await go(fx, new Jar(), "/my/local-login", { method: "POST", form: { login_name: "Home Family", access_code: "safe-password-2026" } });
  ok(login.status === 303 && login.cookies[0]?.startsWith("ab_user="), "12 로그인 이름 로그인은 세션을 만든다");
  eq(cookieLine(login.cookies, "ab_cs"), CS_ON, "12 로그인 이름 로그인도 동의 기록을 한 번 읽어 ab_cs 를 적는다");
  ok(cookieLine(login.cookies, "ab_bk").startsWith("ab_bk=1"), "12 비밀번호 항목 쿠키(ab_bk=1)는 그대로다");
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== `consent:${newUser}`);
  const noRecord = await go(fx, new Jar(), "/my/local-login", { method: "POST", form: { login_name: "Home Family", access_code: "safe-password-2026" } });
  eq(cookieLine(noRecord.cookies, "ab_cs"), CS_OFF, "12 기록이 없으면 ab_cs=0");
  const restore = consentReadFails(fx, newUser);
  let unread;
  try { unread = await go(fx, new Jar(), "/my/local-login", { method: "POST", form: { login_name: "Home Family", access_code: "safe-password-2026" } }); } finally { restore(); }
  ok(unread.status === 303 && unread.cookies[0]?.startsWith("ab_user=") && cookieLine(unread.cookies, "ab_cs") === CS_CLEAR, "12 읽지 못하면 로그인은 되고 남은 ab_cs 를 지운다(모름, 독립 검토 P3-4)");
  const logout = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/my/logout", { method: "POST", form: {} });
  ok(logout.status === 303 && logout.cookies.includes(CS_CLEAR), "12 로그아웃은 ab_cs 를 지운다");
  ok(logout.cookies.some((line) => line.startsWith("ab_user=;")) && logout.cookies.some((line) => line.startsWith("ab_kakao_auto=off")), "12 로그아웃의 다른 쿠키(세션 지움·자동 로그인 멈춤)는 그대로다");
});

// ── 13. 독립 검토 고침(2026-11-06) ────────────────────────────────────────────
// P2-1 주소를 꾸민 auto=1&consent=1 은 화면 없는 로그인이라 동의를 기록하지 않는다. P2-2 기본 가계부는 카카오톡 인앱에서만 만든다.
// P3-1 첫 가계부로 갈 때 돌아갈 곳의 household_id 를 뺀다. P3-2 기록을 읽지 못하면 POST /my/consent 는 쓰지 않는다. P3-3 /m 은 /app 으로 돌아간다.
await homeFixture(async (fx, server) => {
  const crafted = `/auth/kakao/start?auto=1&consent=1&return_to=${encodeURIComponent(HOME)}`;
  const withBooks = await kakaoLogin(fx, new Jar(), server, "2265", { start: crafted });
  ok(withBooks.authorize.searchParams.get("prompt") === "none", "13 꾸민 auto=1&consent=1 도 화면 없는 카카오 로그인이다(prompt=none)");
  ok(withBooks.callback.status === 303 && withBooks.callback.location === HOME && cookieLine(withBooks.callback.cookies, "ab_cs") === CS_OFF && !consentRecord(fx, "user-bin"), "13 P2-1 가계부가 있는 계정: 들어오지만 동의를 기록하지 않는다(ab_cs=0, 홈 팝업이 받는다)");
  fx.db.users.push({ id: "user-empty-13", kakao_user_key: "kakao_login:9913", nickname: "빈웹", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-empty-13", provider: "kakao", provider_subject: "9913", login_name: "", credential_version: 2 });
  const emptyJar = new Jar();
  const empty = await kakaoLogin(fx, emptyJar, server, "9913", { start: `/auth/kakao/start?auto=1&consent=1&return_to=${encodeURIComponent(APP_NOV)}` });
  ok(empty.callback.location.startsWith("/my?auto=0") && !emptyJar.has("ab_user") && !consentRecord(fx, "user-empty-13") && memberships(fx, "user-empty-13").length === 0, `13 P2-1 빈 계정: 기록·가계부·세션 없이 시작 화면으로 돌려보낸다 (${empty.callback.location})`);

  const chromeJar = new Jar();
  const chrome = await kakaoLogin(fx, chromeJar, server, "7799", { ua: CHROME, start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}&consent=1` });
  const chromeUser = userByKey(fx, "kakao_login:7799");
  eq(chrome.callback.location, "/my/households?first=1#create", "13 P2-2 인앱이 아닌 브라우저의 새 계정은 예전처럼 첫 가계부 화면(만들기·초대코드 참여)으로 간다");
  ok(chromeUser && chromeJar.user() === chromeUser.id && memberships(fx, chromeUser.id).length === 0, "13 P2-2 그 계정에는 가계부를 만들지 않는다");
  ok(consentRecord(fx, chromeUser?.id)?.via === "kakao" && cookieLine(chrome.callback.cookies, "ab_cs") === CS_ON, "13 P2-2 새 계정의 동의 기록과 ab_cs=1 은 그대로다");

  const deepJar = new Jar();
  const deep = await kakaoLogin(fx, deepJar, server, "7798", { start: `/auth/kakao/start?return_to=${encodeURIComponent(HOME)}&consent=1` });
  const deepUser = userByKey(fx, "kakao_login:7798");
  eq(deep.callback.location, "/app?month=2026-07", "13 P3-1 방금 만든 첫 가계부로 갈 때 남의 가계부 household_id 를 뺀다");
  ok(ownedHouseholds(fx, deepUser?.id).length === 1, "13 P3-1 그 계정은 ‘내 가계부’ 하나");
  const deepHome = await go(fx, deepJar, deep.callback.location, { ua: INAPP });
  ok(deepHome.status === 200 && deepHome.html.includes("내 가계부"), `13 P3-1 그 주소는 404 가 아니라 새 가계부 홈이다 (${deepHome.status})`);

  putSetting(fx, "consent:user-bin", { version: REVISION, at: "2026-11-02T03:00:00.000Z", via: "kakao", age14: true });
  const before = settingValue(fx, "consent:user-bin");
  const restore = consentReadFails(fx, "user-bin");
  let unreadable;
  try { unreadable = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { consent: "1", return_to: HOME } }); } finally { restore(); }
  ok(unreadable.status === 503 && unreadable.html.includes("동의 기록을 저장하지 못했어요") && settingValue(fx, "consent:user-bin") === before && !cookieLine(unreadable.cookies, "ab_cs"), "13 P3-2 기록을 읽지 못하면 쓰지 않고(처음 기록 그대로) 503 으로 다시 누르게 한다");

  const mobile = await go(fx, new Jar("ab_kakao_auto=skip"), "/m?month=2026-11", { ua: INAPP });
  ok(mobile.status === 200 && isStart(mobile.html) && mobile.html.includes('<input type="hidden" name="return_to" value="/app?month=2026-11"/>'), "13 P3-3 /m 시작 화면은 /app(같은 달)으로 돌아간다");
  const mobilePop = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/m?month=2026-07&household_id=house-home", { ua: CHROME });
  ok(mobilePop.status === 200 && mobilePop.html.includes('name="return_to" value="/app?month=2026-07&amp;household_id=house-home"/>'), "13 P3-3 /m 홈 팝업도 /app(같은 달·가계부)으로 돌아간다");
});

t.done();
