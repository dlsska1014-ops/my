// V22.9.91 — 계정 잇기 동작 검사(카카오톡 인앱 브라우저 자동 로그인 + 갈라진 계정 잇기 + 관리자 통합과 같은 합치기 순서).
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자(2026-10-30): "로그인 없이 바로 가계부가 나오도록 계정 잇기가 필요해". 같은 날 "좋아 추천으로 진행하자"로 권장안 A 를 정했다
// (조사 review-artifacts/identity-link-2026-10-30/RESEARCH.md). 이 판이 하는 일은 셋이다.
//   1) 카카오톡 인앱 브라우저에서 세션 없이 /my·/app 을 열면 prompt=none 카카오 로그인을 먼저 해 본다. 비회원(consent_required)·오류·쿠키 막힘이면
//      지금처럼 로그인 화면이고 되풀이하지 않는다(쿠키 ab_kakao_auto, 주소 auto=0). 직접 로그아웃하면 30일 멈춘다.
//   2) 단톡방 기록 계정과 웹 카카오 로그인 계정이 갈라진 사람(V22.9.77 B-7 충돌)은 채팅이 ‘잇기 제안’만 남기고, 같은 카카오 계정으로
//      방금 로그인한 브라우저에서만 합친다. 한쪽이 비면 바로, 둘 다 있으면 확인 화면 뒤, 같은 종류의 로그인이 둘이면 잇지 않는다.
//      합친 뒤 보조 계정의 옛 세션은 풀리고(판 올림), 다음 웹 로그인·채팅은 이은 계정으로 간다.
//   3) 관리자 통합(/admin/identity/merge)과 계정 잇기가 같은 합치기 순서(performIdentityMerge)를 쓴다. 강한 식별이 없는 옛 웹 가입자를 합쳐도
//      다음 웹 로그인에 빈 새 계정이 생기지 않는다(링크 표의 kakao_login:<id>).
// 실제 요청(/my·/app·/auth/kakao/start·callback·/my/account-link·/my/account-link/run·/skill·/my/logout·/identity-audit)과 저장된 행으로 확인한다.
// 가짜는 카카오 서버 두 곳(토큰·프로필)과 합치기 RPC 뿐이다. 합치기 RPC 는 schema_v22_7_0_auth_atomicity.sql 의 효과만 흉내 낸다(실제 DB 에 닿지 않는다).
//
// 병합 전 독립 검토(review-artifacts/v91-identity-link-2026-10-30/independent-review/REVIEW.md)의 일곱 가지를 12~17번과 2·8·11번에 더했다.
//   통합된 계정을 가리키는 카카오 로그인(되풀이 없음) · 자동 로그인은 새 계정·빈 계정에 들이지 않음 · 확인 화면의 멈춤 쿠키와 ‘나중에’ 먼저 ·
//   계정 잇기 스위치 KAKAO_ACCOUNT_LINK_ENABLED(기본 꺼짐) · 방이 많아도 세션·제안 정리 먼저와 풀지 못한 잠금 없음 · 자동 로그인 한도 칸 따로 · 겹친 실행 안내.
//
// ── 실행 ──
//   node validation/validate-identity-link-v22991.mjs
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { app, BASE, counter, failure, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";
import { kakaoGroupLinkItemSettingsKey, readPurposeToken } from "../src/index.js";

const t = counter("PASS: V22.9.91 identity link");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);

const SECRET = "identity-secret-v22991";
const DAY = "2026-10-30";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const SCRAPER = "facebookexternalhit/1.1; kakaotalk-scrap/1.0";
// 계정 잇기 스위치는 운영 기본이 꺼짐이다. 잇기 동작을 보는 검사는 켜고, 15번이 꺼진 동작을 본다(linkFixture 의 link: false).
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const OFFERS_KEY = "kakao_login_link_offers_v22991";
const RETURN_APP = "/app?month=2026-07&household_id=house-home";
const offerHash = (kakaoId) => createHash("sha256").update(`kakao-login-link-offer:v1:${kakaoId}`).digest("hex");

// isolate 전역(1분 제안 캐시·appUserId 진단·충돌 10분 표시·통합 계정 캐시)은 픽스처마다 비운다. 모듈이 객체를 잡고 있으므로 바꾸지 않고 비운다.
function resetIsolateState() {
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  for (const name of ["__AB_KAKAO_APP_USER_ID_PROBE", "__AB_KAKAO_LOGIN_CONFLICT_TRACED", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
}

async function linkFixture(task, { kakao = true, link = true } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v22991";
    if (kakao) Object.assign(fx.env, KAKAO_ENV);
    if (!link) delete fx.env.KAKAO_ACCOUNT_LINK_ENABLED;
    const server = kakaoServer(fx);
    try {
      return await task(fx, server);
    } finally {
      server.restore();
      resetIsolateState();
    }
  }));
}

// ── 쿠키 통 ──
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

async function go(fx, jar, path, { method = "GET", ua = CHROME, form = null, headers = {} } = {}) {
  const url = new URL(path, BASE);
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...headers };
  const cookie = jar ? jar.header(url.pathname) : "";
  if (cookie) requestHeaders.cookie = cookie;
  const init = { method, headers: requestHeaders };
  if (form) {
    Object.assign(requestHeaders, { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" });
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

// 카카오 서버(토큰·프로필)와 합치기 RPC(schema_v22_7_0_auth_atomicity.sql 의 효과만). id 는 지금 카카오에 로그인한 사람의 카카오 id.
function kakaoServer(fx) {
  const server = { id: "2265", nickname: "Bin", exchanges: 0, merges: [], restore: () => {} };
  server.restore = intercept(async ({ url, init }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") { server.exchanges += 1; return json({ access_token: "qa-access-token", token_type: "bearer" }); }
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(server.id), properties: { nickname: server.nickname } });
    if (url.pathname === "/rest/v1/rpc/accountbook_merge_users_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      server.merges.push(body);
      return json({ merged: true, transactions: applyStoredMergeSql(fx, body) });
    }
    return null;
  });
  return server;
}

function applyStoredMergeSql(fx, { p_primary_user_id: primary, p_secondary_user_id: secondary }) {
  const ranks = { owner: 60, admin: 50, member: 40, viewer: 30, pending: 20, blocked: 10 };
  for (const old of fx.db.household_members.filter((item) => item.user_id === secondary)) {
    const existing = fx.db.household_members.find((item) => item.user_id === primary && item.household_id === old.household_id);
    if (existing) { if (ranks[old.role] > ranks[existing.role]) existing.role = old.role; } else fx.db.household_members.push({ ...old, user_id: primary });
  }
  let moved = 0;
  for (const item of fx.db.transactions) if (item.user_id === secondary) { item.user_id = primary; moved += 1; }
  for (const item of fx.db.accountbook_recurring || []) if (item.user_id === secondary) item.user_id = primary;
  fx.db.accountbook_user_identities = fx.db.accountbook_user_identities.filter((item) => !(item.user_id === secondary && fx.db.accountbook_user_identities.some((other) => other.user_id === primary && other.provider === item.provider)));
  for (const item of fx.db.accountbook_user_identities) if (item.user_id === secondary) item.user_id = primary;
  fx.db.household_members = fx.db.household_members.filter((item) => item.user_id !== secondary);
  fx.db.accountbook_user_security = fx.db.accountbook_user_security.filter((item) => item.user_id !== secondary);
  putSetting(fx, `identity_merge_redirect:${secondary}`, { primary_user_id: primary, secondary_user_id: secondary, merged_at: new Date().toISOString() });
  const old = fx.db.users.find((item) => item.id === secondary);
  old.kakao_user_key = `merged:${secondary}:synthetic`;
  old.nickname = `${old.nickname || "이전 계정"} (통합됨)`;
  return moved;
}

// 공식 그룹 챗봇 모양(v1.11.1). V22.9.77 검사와 같다.
function payloadFor(utterance, { user, room = "", appUserId = "" }) {
  const properties = { botUserKey: user, ...(appUserId ? { appUserId } : {}) };
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

// 카카오 스킬 호출. 뒤로 미룬 일(waitUntil: 잇기 제안 쓰기 포함)까지 기다린다.
async function say(fx, utterance, options) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(options.secret === false ? {} : { "x-kakao-skill-secret": SECRET }) },
    body: JSON.stringify(payloadFor(utterance, options)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  return (parsed?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}

const offers = (fx) => JSON.parse(settingValue(fx, OFFERS_KEY) || "{}");
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const userRow = (fx, id) => fx.db.users.find((user) => user.id === id);
const memberships = (fx, id) => fx.db.household_members.filter((row) => row.user_id === id);
const newest = (fx) => fx.db.transactions.at(-1);
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const securityVersion = (fx, id) => Number(fx.db.accountbook_user_security.find((row) => row.user_id === id)?.session_version || 0);

// 웹 카카오 로그인(start → callback). 콜백 응답까지 돌려준다(따라가지 않는다).
async function kakaoLogin(fx, jar, server, kakaoId, { ua = CHROME, start = "/auth/kakao/start" } = {}) {
  server.id = String(kakaoId);
  const begin = await go(fx, jar, start, { ua });
  const authorize = new URL(begin.location || `${BASE}/`);
  const state = authorize.searchParams.get("state") || "";
  const callback = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { ua });
  return { begin, authorize, state, callback };
}

async function stateOf(fx, authorizeUrl) {
  return readPurposeToken(fx.env, "kakao-oauth", new URL(authorizeUrl).searchParams.get("state") || "");
}

// 한 요청 동안 Supabase 로 나간 호출 수(한 요청 50회 한도 확인).
async function countDb(fx, task) {
  const origin = new URL(fx.env.SUPABASE_URL).origin;
  let calls = 0;
  const restore = intercept(async ({ url }) => { if (url.origin === origin) calls += 1; return null; });
  try {
    const value = await task();
    return { value, calls };
  } finally {
    restore();
  }
}

// 채팅으로 기록 계정을 만든다(봇 키만, Secret 확인). 첫 기록이 저장되고 개인 가계부가 생긴다.
async function chatAccount(fx, bot, utterance = "커피 4100") {
  await say(fx, utterance, { user: bot });
  const chat = userByKey(fx, bot)?.id;
  ok(chat && newest(fx)?.user_id === chat && memberships(fx, chat).length > 0, `준비: 봇 키 ${bot} 로 채팅 계정이 생기고 첫 기록·가계부가 있다`);
  return chat;
}

// ── 1. 인앱 브라우저 자동 로그인으로 보내는 조건 ─────────────────────────────
await linkFixture(async (fx) => {
  const auto = await go(fx, new Jar(), "/my", { ua: INAPP });
  eq(auto.status, 303, "1 인앱 브라우저·세션 없음 /my 는 카카오 자동 로그인으로 보낸다");
  eq(auto.location, "/auth/kakao/start?auto=1", "1 /my 는 돌아갈 곳 없이 보낸다(로그인 뒤 기본 화면)");
  const deep = await go(fx, new Jar(), RETURN_APP, { ua: INAPP });
  eq(deep.location, `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(RETURN_APP)}`, "1 /app 깊은 주소는 돌아갈 곳(return_to)을 싣는다");
  eq((await go(fx, new Jar(), "/my/settings", { ua: INAPP })).location, "/auth/kakao/start?auto=1&return_to=%2Fmy%2Fsettings", "1 /my 아래 화면도 돌아갈 곳을 싣는다");
  for (const [label, path, options] of [
    ["보통 브라우저", "/my", { ua: CHROME }],
    ["링크 미리보기 수집기", "/my", { ua: SCRAPER }],
    ["페이지 이동이 아닌 fetch", "/my", { ua: INAPP, headers: { "sec-fetch-mode": "cors" } }],
    ["미리 읽기", "/my", { ua: INAPP, headers: { "sec-purpose": "prefetch" } }],
    ["주소의 auto=0", "/my?auto=0", { ua: INAPP }],
    ["계정 잇기 화면", "/my/account-link", { ua: INAPP }],
  ]) {
    const response = await go(fx, new Jar(), path, options);
    ok(!response.location.startsWith("/auth/kakao/start"), `1 ${label}는 자동 로그인으로 보내지 않는다 (${response.status} ${response.location})`);
  }
  for (const kind of ["try", "skip", "off"]) {
    const response = await go(fx, new Jar(`ab_kakao_auto=${kind}`), "/my", { ua: INAPP });
    eq(response.status, 200, `1 이미 해 본 표시(ab_kakao_auto=${kind})가 있으면 로그인 화면을 그린다`);
  }
  const signedIn = await go(fx, new Jar(fx.cookie), "/my", { ua: INAPP });
  ok(signedIn.status === 303 && signedIn.location.startsWith("/app?"), `1 세션이 있으면 지금처럼 가계부로 간다 (${signedIn.location})`);
  const admin = await go(fx, new Jar("ab_admin=qa"), "/app", { ua: INAPP });
  ok(!admin.location.startsWith("/auth/kakao/start"), "1 관리자 쿠키가 있는 브라우저의 /app 은 건드리지 않는다");
  fx.env.KAKAO_INAPP_AUTO_LOGIN = "0";
  ok(!(await go(fx, new Jar(), "/my", { ua: INAPP })).location.startsWith("/auth/kakao/start"), "1 KAKAO_INAPP_AUTO_LOGIN=0 이면 끈다");
  delete fx.env.KAKAO_INAPP_AUTO_LOGIN;
});
await linkFixture(async (fx) => {
  const off = await go(fx, new Jar(), "/my", { ua: INAPP });
  eq(off.status, 200, "1 웹 카카오 로그인이 꺼진 곳에서는 자동 로그인을 하지 않는다");
}, { kakao: false });

// ── 2. 자동 로그인 시작과 콜백 ───────────────────────────────────────────
await linkFixture(async (fx, server) => {
  const jar = new Jar();
  const start = await go(fx, jar, `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(RETURN_APP)}`, { ua: INAPP });
  const authorize = new URL(start.location);
  eq(authorize.origin + authorize.pathname, "https://kauth.kakao.com/oauth/authorize", "2 자동 로그인은 카카오 인가로 간다");
  eq(authorize.searchParams.get("prompt"), "none", "2 자동 로그인은 prompt=none(카카오 화면 없음)");
  const state = await stateOf(fx, start.location);
  ok(state?.mode === "login" && state.auto === 1 && state.next === RETURN_APP, `2 서명된 상태에 자동 표시와 돌아갈 곳이 있다 (${JSON.stringify(state)})`);
  eq(jar.get("ab_kakao_auto"), "try", "2 되풀이 막기 쿠키(try)를 둔다");

  const plain = await go(fx, new Jar(), "/auth/kakao/start?auto=1", { ua: CHROME });
  ok(!new URL(plain.location).searchParams.has("prompt") && !plain.cookies.some((line) => line.startsWith("ab_kakao_auto=")), "2 인앱이 아닌 브라우저의 auto=1 은 보통 로그인이다");
  const back = await go(fx, new Jar(), "/auth/kakao/start?return_to=%2Fmy%2Fanalysis", { ua: CHROME });
  eq((await stateOf(fx, back.location))?.next, "/my/analysis", "2 보통 로그인도 돌아갈 곳을 상태에 싣는다");
  eq((await stateOf(fx, (await go(fx, new Jar(), "/auth/kakao/start?return_to=https%3A%2F%2Fevil.example%2F", { ua: CHROME })).location))?.next, undefined, "2 바깥 주소는 돌아갈 곳으로 받지 않는다");

  // 비회원(consent_required): 로그인 화면으로, 하루 멈춤, 토큰 교환 없음.
  const before = server.exchanges;
  const nonmember = await go(fx, jar, `/auth/kakao/callback?error=consent_required&state=${encodeURIComponent(authorize.searchParams.get("state"))}`, { ua: INAPP });
  eq(nonmember.status, 303, "2 비회원이면 로그인 화면으로 돌려보낸다(오류 화면 아님)");
  eq(nonmember.location, `/my?auto=0&return_to=${encodeURIComponent(RETURN_APP)}`, "2 돌아갈 곳을 들고 로그인 화면으로 간다(auto=0 이 되풀이를 끊는다)");
  eq(jar.get("ab_kakao_auto"), "skip", "2 하루 동안 다시 보내지 않는다(skip)");
  ok(nonmember.cookies.some((line) => line.startsWith("ab_kakao_auto=skip") && /Max-Age=86400/.test(line)), "2 skip 은 하루(86400초)다");
  eq(server.exchanges, before, "2 비회원 응답은 카카오 토큰을 바꾸지 않는다");
  ok(events("kakao_auto_login_nonmember").length > 0, "2 비회원 자동 로그인은 운영 이벤트(info)로 남긴다");
  const loginPage = await go(fx, jar, nonmember.location, { ua: INAPP });
  eq(loginPage.status, 200, "2 돌아간 로그인 화면은 다시 자동 로그인으로 보내지 않는다");
  ok(loginPage.html.includes(`<a class="kakaoBtn" href="/auth/kakao/start?return_to=${encodeURIComponent(RETURN_APP)}">`), "2 로그인 화면의 카카오 버튼이 돌아갈 곳을 싣는다");
  eq((await go(fx, new Jar(), "/my?auto=0", { ua: INAPP })).status, 200, "2 쿠키가 막힌 브라우저도 주소의 auto=0 으로 되풀이가 끊긴다");

  // 쿠키가 막혀 상태 쿠키가 없다: 오류 화면 대신 로그인 화면, 토큰 교환 없음.
  const fresh = await go(fx, new Jar(), "/auth/kakao/start?auto=1", { ua: INAPP });
  const noCookie = await go(fx, new Jar(), `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(new URL(fresh.location).searchParams.get("state"))}`, { ua: INAPP });
  ok(noCookie.status === 303 && noCookie.location === "/my?auto=0", `2 상태 쿠키가 없으면 로그인 화면으로 (${noCookie.status} ${noCookie.location})`);
  eq(server.exchanges, before, "2 상태가 맞지 않으면 토큰을 바꾸지 않는다");
  const odd = await go(fx, new Jar(), `/auth/kakao/callback?error=server_error&state=${encodeURIComponent(new URL(fresh.location).searchParams.get("state"))}`, { ua: INAPP });
  ok(odd.location === "/my?auto=0" && events("kakao_auto_login_error").length > 0, "2 그 밖의 카카오 오류도 로그인 화면으로 가고 경고 이벤트를 남긴다");

  // 보통(자동 아님) 로그인의 오류 화면은 그대로.
  const plainState = new URL((await go(fx, new Jar(), "/auth/kakao/start", { ua: CHROME })).location).searchParams.get("state");
  const cancelled = await go(fx, new Jar(), `/auth/kakao/callback?error=access_denied&state=${encodeURIComponent(plainState)}`, { ua: CHROME });
  ok(cancelled.status === 400 && cancelled.html.includes("카카오 로그인을 취소했습니다"), "2 직접 누른 로그인의 취소 화면은 예전과 같다");
});

// 회원이면 화면 없이 로그인되고 보던 화면으로 간다.
await linkFixture(async (fx, server) => {
  const jar = new Jar();
  const hop = await go(fx, jar, RETURN_APP, { ua: INAPP });
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: INAPP, start: hop.location });
  eq(login.authorize.searchParams.get("prompt"), "none", "2 회원 자동 로그인도 prompt=none");
  eq(login.callback.status, 303, "2 회원 자동 로그인은 바로 넘어간다");
  eq(login.callback.location, RETURN_APP, "2 로그인 뒤 처음 열던 화면으로 간다");
  eq(jar.user(), "user-bin", "2 웹 계정(user-bin)으로 로그인된다");
  eq(jar.get("ab_kakao_auto"), "try", "2 자동 로그인은 되풀이 막기(try, 10분)를 남긴다(세션이 거절돼도 다시 보내지 않는다 — 독립 검토)");
  const home = await go(fx, jar, RETURN_APP, { ua: INAPP });
  eq(home.status, 200, "2 로그인 뒤 가계부 홈이 열린다");

  // 같은 곳의 카카오 로그인이 한도를 넘으면: 자동은 로그인 화면, 직접은 ‘잠시 많음’ 안내(예전: 확인 시간이 지났습니다).
  const restore = intercept(async ({ url }) => url.pathname.endsWith("/rpc/accountbook_auth_attempt") ? json([{ allowed: false, attempts: 21 }]) : null);
  try {
    const autoJar = new Jar();
    const autoBusy = await kakaoLogin(fx, autoJar, server, "2265", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
    ok(autoBusy.callback.location === "/my?auto=0" && autoJar.get("ab_kakao_auto") === "skip", "2 한도에 걸린 자동 로그인은 로그인 화면으로 간다");
    const busy = await kakaoLogin(fx, new Jar(), server, "2265", { ua: CHROME });
    ok(busy.callback.status === 429 && busy.callback.html.includes("카카오 로그인 요청이 잠시 많아"), `2 한도에 걸린 직접 로그인은 ‘잠시 많음’ 안내다 (${busy.callback.status})`);
    ok(!busy.callback.html.includes("로그인 확인 시간이 지났습니다"), "2 한도 안내를 ‘확인 시간이 지났습니다’로 쓰지 않는다");
  } finally {
    restore();
  }
});

// ── 3. 직접 로그아웃은 자동 로그인을 30일 멈춘다 ─────────────────────────────
await linkFixture(async (fx, server) => {
  const jar = new Jar(fx.cookie);
  const out = await go(fx, jar, "/my/logout", { method: "POST", form: {} });
  eq(out.status, 303, "3 로그아웃은 예전처럼 303");
  ok(out.cookies.some((line) => line.startsWith("ab_user=;") && /Max-Age=0/.test(line)), "3 로그인 쿠키를 지운다");
  ok(out.cookies.some((line) => line.startsWith("ab_kakao_auto=off") && /Max-Age=2592000/.test(line)), "3 자동 로그인을 30일 멈춘다(off)");
  eq((await go(fx, jar, "/my", { ua: INAPP })).status, 200, "3 로그아웃한 인앱 브라우저는 로그인 화면을 그린다(바로 다시 로그인하지 않는다)");
  const again = await kakaoLogin(fx, jar, server, "2265", { ua: INAPP });
  ok(again.callback.status === 303 && jar.user() === "user-bin" && !jar.has("ab_kakao_auto"), "3 직접 카카오 로그인하면 멈춤을 푼다");
});

// ── 4. 채팅은 잇기 제안만 남긴다 ───────────────────────────────────────
await linkFixture(async (fx) => {
  const chat = await chatAccount(fx, "bot-v91-offer");
  const offerEventsBefore = events("kakao_account_link_offer").length;
  await say(fx, "점심 8100", { user: "bot-v91-offer", appUserId: "2265" });
  ok(newest(fx).amount === 8100 && newest(fx).user_id === chat, "4 충돌해도 채팅은 지금 계정으로 기록한다(V22.9.77 B-7 그대로)");
  eq(userRow(fx, "user-bin").kakao_user_key, "kakao_login:2265", "4 채팅은 계정을 합치지 않는다");
  const table = offers(fx);
  ok(table["user-bin"]?.chat_user_id === chat, `4 웹 계정 → 채팅 계정 잇기 제안을 남긴다 (${JSON.stringify(table).slice(0, 200)})`);
  eq(table["user-bin"]?.kakao_hash, offerHash("2265"), "4 카카오 로그인 id 는 해시로만 남긴다");
  ok(!JSON.stringify(Object.values(table).map(({ kakao_hash, ...rest }) => rest)).includes("2265"), "4 제안 표에 카카오 id 를 그대로 쓰지 않는다");
  const offerEvents = events("kakao_account_link_offer").slice(offerEventsBefore);
  ok(offerEvents.length === 1 && !JSON.stringify(offerEvents).includes("2265"), "4 제안 운영 이벤트는 한 번, 카카오 id 없이");
  const probe = JSON.parse(settingValue(fx, "kakao_app_user_id_probe_v22991:present:direct") || "{}");
  ok(probe.version === 1 && probe.at && !JSON.stringify(probe).includes("2265"), "4 appUserId 가 왔다는 진단(시각만)을 남긴다");
  const updated = table["user-bin"].updated_at;
  await say(fx, "저녁 9100", { user: "bot-v91-offer", appUserId: "2265" });
  eq(offers(fx)["user-bin"]?.updated_at, updated, "4 같은 제안은 다시 쓰지 않는다");
  await say(fx, "간식 2100", { user: "bot-v91-offer" });
  ok(settingValue(fx, "kakao_app_user_id_probe_v22991:absent:direct"), "4 appUserId 가 없는 요청도 진단 칸에 남긴다");
});
await linkFixture(async (fx) => {
  await chatAccount(fx, "bot-v91-untrusted");
  await say(fx, "점심 8200", { user: "bot-v91-untrusted", appUserId: "2265", secret: false });
  ok(!settingValue(fx, OFFERS_KEY), "4 Secret 으로 확인되지 않은 요청은 제안을 남기지 않는다");
});
await linkFixture(async (fx) => {
  await chatAccount(fx, "bot-v91-nologin");
  const before = events("kakao_login_alias_conflict").length;
  await say(fx, "점심 8300", { user: "bot-v91-nologin", appUserId: "2265" });
  ok(events("kakao_login_alias_conflict").length > before, "4 웹 카카오 로그인이 꺼져도 충돌 이벤트는 그대로다");
  ok(!settingValue(fx, OFFERS_KEY) && !fx.db.accountbook_settings.some((row) => row.key.startsWith("kakao_app_user_id_probe_v22991:")), "4 웹 카카오 로그인이 꺼진 곳은 제안·진단을 남기지 않는다");
}, { kakao: false });

// ── 5. 웹 계정이 비어 있으면 로그인하자마자 잇는다(주 계정 = 채팅 계정) ─────────────
await linkFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-web-v91", kakao_user_key: "kakao_login:3300", nickname: "웹사용자", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-web-v91", provider: "kakao", provider_subject: "3300", login_name: "", credential_version: 2 });
  const chat = await chatAccount(fx, "bot-v91-empty-web");
  const chatHouseholds = memberships(fx, chat).map((row) => row.household_id);
  await say(fx, "점심 8100", { user: "bot-v91-empty-web", appUserId: "3300" });
  eq(offers(fx)["user-web-v91"]?.chat_user_id, chat, "5 빈 웹 계정 → 채팅 계정 제안");

  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "3300", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
  eq(login.callback.location, "/my/account-link/run", "5 제안이 있는 로그인은 합치기 단계로 간다");
  eq(jar.user(), "user-web-v91", "5 콜백은 웹 계정으로 로그인한다");
  ok(jar.has("ab_account_link") && /Path=\/my\/account-link/.test(login.callback.cookies.find((line) => line.startsWith("ab_account_link=")) || ""), "5 합치기 표는 /my/account-link 에만 보낸다");
  const oldSession = `ab_user=${jar.get("ab_user")}`;
  const { value: run, calls } = await countDb(fx, () => go(fx, jar, "/my/account-link/run", { ua: INAPP }));
  eq(run.status, 303, "5 합치기는 303 으로 끝난다");
  eq(run.location, "/my?msg=account_linked", "5 합친 뒤 가계부로 가며 안내를 싣는다");
  ok(calls < 50, `5 합치기 요청의 DB 호출이 한 요청 한도(50) 안이다 (${calls}회)`);
  console.log(`account-link run (빈 웹 계정, 보조 가계부 0개): DB ${calls}회`);
  eq(server.merges.length, 1, "5 합치기 RPC 를 한 번 부른다");
  ok(server.merges[0]?.p_primary_user_id === chat && server.merges[0]?.p_secondary_user_id === "user-web-v91", "5 빈 쪽(웹)을 보조로, 채팅 계정을 주 계정으로 합친다");
  eq(jar.user(), chat, "5 이 브라우저는 채팅 계정 세션을 새로 받는다");
  ok(!jar.has("ab_account_link"), "5 합치기 표를 지운다");
  ok(userRow(fx, "user-web-v91").kakao_user_key.startsWith("merged:"), "5 웹 계정은 ‘통합됨’으로 남는다");
  ok(!offers(fx)["user-web-v91"], "5 이은 제안은 지운다");
  eq(securityVersion(fx, "user-web-v91"), 2, "5 보조 계정의 세션 판을 올린다(옛 쿠키가 풀린다)");
  ok(events("kakao_account_link_merged").length > 0, "5 잇기 완료 운영 이벤트를 남긴다");

  const home = await go(fx, jar, run.location, { ua: INAPP });
  ok(home.status === 303 && home.location.includes(`household_id=${encodeURIComponent(chatHouseholds[0])}`) && home.location.includes("msg=account_linked"), `5 /my 는 채팅 가계부로 안내와 함께 간다 (${home.location})`);
  const app2 = await go(fx, jar, home.location, { ua: INAPP });
  ok(app2.status === 200 && app2.html.includes("카카오톡 방 가계부와 웹 계정을 하나로 이었습니다"), "5 가계부 홈에 잇기 완료 안내가 보인다");

  const stale = await go(fx, new Jar(oldSession), "/my", { ua: CHROME });
  ok(stale.status === 200 && !stale.headers.get("x-accountbook-session-recovered") && !stale.cookies.some((line) => line.startsWith("ab_user=") && !line.startsWith("ab_user=;")), `5 보조 계정의 옛 세션은 주 계정 세션으로 이어지지 않는다 (${stale.status} ${stale.location})`);
  const relogin = new Jar();
  await kakaoLogin(fx, relogin, server, "3300", { ua: CHROME });
  eq(relogin.user(), chat, "5 같은 카카오로 다시 웹 로그인하면 이은 계정으로 들어간다");
  const conflictsBefore = events("kakao_login_alias_conflict").length;
  await say(fx, "커피 4400", { user: "bot-v91-empty-web", appUserId: "3300" });
  ok(newest(fx).amount === 4400 && newest(fx).user_id === chat, "5 이은 뒤 채팅 기록도 같은 계정이다");
  eq(events("kakao_login_alias_conflict").length, conflictsBefore, "5 이은 뒤에는 충돌 이벤트가 없다");
});

// ── 6. 채팅 계정이 비어 있으면 웹 계정을 주 계정으로 잇는다 ──────────────────────
await linkFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-chat-v91-empty", kakao_user_key: "bot-v91-empty-chat", nickname: "카카오사용자", created_at: "2026-10-01T00:00:00.000Z" });
  await say(fx, "이번 달 요약", { user: "bot-v91-empty-chat", appUserId: "2265" });
  eq(offers(fx)["user-bin"]?.chat_user_id, "user-chat-v91-empty", "6 웹 계정 → 빈 채팅 계정 제안");
  ok(memberships(fx, "user-chat-v91-empty").length === 0 && !fx.db.transactions.some((row) => row.user_id === "user-chat-v91-empty"), "6 준비: 채팅 계정에는 가계부·기록이 없다");
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: CHROME, start: `/auth/kakao/start?return_to=${encodeURIComponent(RETURN_APP)}` });
  eq(login.callback.location, "/my/account-link/run", "6 로그인 뒤 합치기 단계로 간다");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  ok(server.merges[0]?.p_primary_user_id === "user-bin" && server.merges[0]?.p_secondary_user_id === "user-chat-v91-empty", "6 빈 채팅 계정을 웹 계정으로 합친다");
  eq(run.location, `${RETURN_APP}&msg=account_linked`, "6 로그인 때 열던 화면으로 안내와 함께 간다");
  eq(jar.user(), "user-bin", "6 세션은 웹 계정 그대로");
  const pick = await say(fx, "커피 5100", { user: "bot-v91-empty-chat", appUserId: "2265" });
  ok(pick.includes("우리집 생활비") && pick.includes("7월 제주여행"), `6 이은 뒤 채팅은 웹 계정의 가계부를 고르게 한다 (${pick.slice(0, 80)})`);
  await say(fx, "2", { user: "bot-v91-empty-chat", appUserId: "2265" });
  await say(fx, "커피 5100", { user: "bot-v91-empty-chat", appUserId: "2265" });
  ok(newest(fx).amount === 5100 && newest(fx).user_id === "user-bin" && newest(fx).household_id === "house-home", "6 이은 뒤 채팅 기록은 웹 계정의 고른 가계부로 저장된다");
});

// ── 7. 둘 다 가계부·기록이 있으면 확인 화면 → 카카오로 다시 확인 → 잇기 ─────────────────
await linkFixture(async (fx, server) => {
  const chat = await chatAccount(fx, "bot-v91-confirm");
  await say(fx, "점심 8100", { user: "bot-v91-confirm", appUserId: "2265" });
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  eq(login.callback.location, "/my/account-link/run", "7 로그인 뒤 합치기 단계로 간다");
  const firstRun = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(firstRun.location, "/my/account-link", "7 둘 다 있으면 합치지 않고 확인 화면으로 보낸다");
  eq(server.merges.length, 0, "7 확인 전에는 합치지 않는다");
  ok(!jar.has("ab_account_link"), "7 로그인 때 받은 합치기 표는 지운다");
  const ask = await go(fx, jar, "/my", { ua: CHROME });
  eq(ask.location, "/my/account-link", "7 /my 는 제안이 있으면 확인 화면을 먼저 보인다");
  const confirm = await go(fx, jar, "/my/account-link", { ua: CHROME });
  ok(confirm.status === 200 && confirm.html.includes("카카오톡 방 가계부와 웹 계정을 이을까요?") && confirm.html.includes('<form method="post" action="/my/account-link"'), "7 확인 화면에 잇기 단추가 있다");
  const counts = [...confirm.html.matchAll(/<li><b>(방|웹)<\/b><span>([^<]+)<\/span><\/li>/g)].map((m) => `${m[1]}:${m[2]}`);
  ok(counts[0] === "방:카카오톡 방 기록 계정 · 가계부 1개 · 내가 쓴 기록 2건" && /^웹:웹 로그인 계정 · 가계부 2개 · 내가 쓴 기록 \d+건$/.test(counts[1] || ""), `7 두 계정의 가계부·기록 수를 보인다 (${counts.join(" / ")})`);
  ok(confirm.html.includes('name="robots" content="noindex,nofollow"'), "7 확인 화면은 검색에 싣지 않는다");

  const later = await go(fx, jar, "/my/account-link?later=1", { ua: CHROME });
  ok(later.location === "/my" && jar.get("ab_account_link_later") === offerHash("2265").slice(0, 16), "7 ‘나중에 하기’는 이 제안을 7일 묻지 않게 한다");
  ok(later.cookies.some((line) => /Max-Age=604800/.test(line)), "7 나중에 하기는 7일");
  ok((await go(fx, jar, "/my", { ua: CHROME })).location.startsWith("/app?"), "7 나중에 하기 뒤 /my 는 가계부로 간다");

  // 다른 카카오 계정으로 확인하면 잇지 않는다.
  const start = await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: CHROME });
  const authorize = new URL(start.location);
  ok(authorize.href.startsWith("https://kauth.kakao.com/oauth/authorize") && !authorize.searchParams.has("prompt"), "7 보통 브라우저의 잇기 확인은 카카오 인가(화면 있음)로 간다");
  const linkState = await stateOf(fx, start.location);
  ok(linkState?.mode === "account-link" && linkState.offer === "user-bin" && linkState.user_id === "user-bin", "7 상태는 계정 잇기 모드·제안·세션 사용자에 묶인다");
  server.id = "2266";
  const mismatch = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state"))}`, { ua: CHROME });
  eq(mismatch.location, "/my/account-link?err=kakao_account_mismatch", "7 다른 카카오 계정이면 잇지 않고 이유를 보인다");
  eq(server.merges.length, 0, "7 다른 카카오 계정으로는 합치지 않는다");
  ok((await go(fx, jar, "/my/account-link?err=kakao_account_mismatch", { ua: CHROME })).html.includes("확인한 카카오 계정이 이 가계부의 카카오 계정과 달라요"), "7 확인 화면이 그 이유를 보인다");
  const expired = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(expired.location, "/my/account-link?err=expired", "7 합치기 표 없이 합치기 단계를 열면 확인 화면으로");

  // 인앱 브라우저의 확인은 화면 없이(prompt=none), 안 되면 다음 확인은 카카오 화면.
  const inappStart = await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: INAPP });
  eq(new URL(inappStart.location).searchParams.get("prompt"), "none", "7 인앱 브라우저의 잇기 확인은 화면 없이(prompt=none)");
  const quietFail = await go(fx, jar, `/auth/kakao/callback?error=consent_required&state=${encodeURIComponent(new URL(inappStart.location).searchParams.get("state"))}`, { ua: INAPP });
  eq(quietFail.location, "/my/account-link?err=kakao_retry", "7 화면 없는 확인이 안 되면 다시 누르라고 안내한다");
  const retryPage = await go(fx, jar, quietFail.location, { ua: INAPP });
  ok(retryPage.html.includes('<input type="hidden" name="interactive" value="1"/>'), "7 다시 누르는 단추는 카카오 화면을 띄운다(interactive)");
  const interactive = await go(fx, jar, "/my/account-link", { method: "POST", form: { interactive: "1" }, ua: INAPP });
  ok(!new URL(interactive.location).searchParams.has("prompt"), "7 interactive 확인은 prompt 없이 카카오 화면으로 간다");

  // 같은 카카오 계정으로 확인하면 잇는다(주 계정 = 채팅 계정).
  server.id = "2265";
  const oldBin = `ab_user=${jar.get("ab_user")}`;
  const restart = await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: CHROME });
  const verified = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(new URL(restart.location).searchParams.get("state"))}`, { ua: CHROME });
  eq(verified.location, "/my/account-link/run", "7 같은 카카오 계정이면 합치기 단계로 간다");
  const binHouseholds = memberships(fx, "user-bin").map((row) => `${row.household_id}:${row.role}`).sort();
  const binRecords = fx.db.transactions.filter((row) => row.user_id === "user-bin").length;
  const { value: run, calls } = await countDb(fx, () => go(fx, jar, "/my/account-link/run", { ua: CHROME }));
  eq(run.location, "/my?msg=account_linked", "7 확인 뒤 합치고 가계부로 간다");
  ok(calls < 50, `7 둘 다 있는 합치기도 한 요청 DB 한도(50) 안이다 (${calls}회)`);
  console.log(`account-link run (확인 뒤, 보조 가계부 2개): DB ${calls}회`);
  ok(server.merges.length === 1 && server.merges[0].p_primary_user_id === chat && server.merges[0].p_secondary_user_id === "user-bin", "7 채팅 계정을 주 계정으로 합친다");
  eq(jar.user(), chat, "7 이 브라우저는 채팅 계정 세션을 받는다");
  const chatHouseholds = memberships(fx, chat).map((row) => `${row.household_id}:${row.role}`);
  ok(binHouseholds.every((item) => chatHouseholds.includes(item)), `7 웹 계정의 가계부·역할이 채팅 계정으로 옮겨진다 (${chatHouseholds.join(",")})`);
  eq(fx.db.transactions.filter((row) => row.user_id === chat).length >= binRecords + 2, true, "7 웹 계정의 기록이 채팅 계정으로 옮겨진다");
  ok(JSON.parse(settingValue(fx, "member_aliases:house-home") || "{}")[chat] === "Bin", "7 가계부 표시 이름(Bin)도 옮겨진다");
  const map = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
  eq(map["kakao_login:2265"]?.user_id, chat, "7 링크 표의 kakao_login:2265 가 주 계정을 가리킨다");
  ok(!offers(fx)["user-bin"] && !jar.has("ab_account_link_later"), "7 제안과 ‘나중에’ 표시를 지운다");
  ok(securityVersion(fx, "user-bin") >= 2, "7 웹 계정의 옛 세션을 푼다");
  const stale = await go(fx, new Jar(oldBin), "/my", { ua: CHROME });
  ok(stale.status === 200 && !stale.headers.get("x-accountbook-session-recovered"), "7 웹 계정의 옛 쿠키는 이은 계정으로 이어지지 않는다");
  const relogin = new Jar();
  await kakaoLogin(fx, relogin, server, "2265", { ua: CHROME });
  eq(relogin.user(), chat, "7 다시 웹 로그인하면 이은 계정으로 들어간다");
  eq(userRow(fx, chat).kakao_user_key, "bot-v91-confirm", "7 주 계정의 봇 키는 그대로");
  await say(fx, "저녁 9900", { user: "bot-v91-confirm", appUserId: "2265" });
  ok(newest(fx).amount === 9900 && newest(fx).user_id === chat, "7 이은 뒤 채팅 기록도 같은 계정이다");
});

// ── 8. 같은 종류의 로그인이 둘이면 잇지 않는다 ──────────────────────────────
await linkFixture(async (fx, server) => {
  const chat = await chatAccount(fx, "bot-v91-blocked");
  fx.db.accountbook_user_identities.push({ user_id: chat, provider: "local", provider_subject: "", login_name: "chat-login", credential_version: 2 });
  fx.db.accountbook_user_identities.push({ user_id: "user-bin", provider: "local", provider_subject: "", login_name: "bin-login", credential_version: 2 });
  await say(fx, "점심 8100", { user: "bot-v91-blocked", appUserId: "2265" });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my/account-link", "8 이을 수 없으면 확인 화면으로 이유를 보이러 간다");
  const page = await go(fx, jar, "/my/account-link", { ua: CHROME });
  ok(page.html.includes("두 계정을 자동으로 이을 수 없어요") && !page.html.includes('action="/my/account-link"'), "8 확인 화면은 이유만 보이고 잇기 단추가 없다");
  eq(server.merges.length, 0, "8 합치지 않는다");
  ok(page.html.includes('href="/my/account-link?later=blocked"'), "8 ‘가계부로 가기’는 이을 수 없는 제안의 나중에(later=blocked)다");
  const later = await go(fx, jar, "/my/account-link?later=blocked", { ua: CHROME });
  ok(later.location === "/my" && later.cookies.some((line) => line.startsWith("ab_account_link_later=") && /Max-Age=2592000/.test(line)), "8 이을 수 없는 제안은 30일 묻지 않는다(계정 확인 없이 받는다)");
});

// ── 9. 관리자 통합도 같은 순서이고, 옛 웹 가입자를 합쳐도 다음 로그인에 새 계정이 생기지 않는다 ───────
await linkFixture(async (fx, server) => {
  ok(!fx.db.accountbook_user_identities.some((row) => row.user_id === "user-wifi"), "9 준비: user-wifi 는 강한 식별이 없는 옛 웹 가입자(kakao_login:2266)");
  const merged = await app.fetch(new Request(`${BASE}/admin/identity/merge`, {
    method: "POST",
    headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
    body: new URLSearchParams({ household_id: "house-home", primary_user_id: "user-bin", secondary_user_id: "user-wifi", confirm_text: "통합" }).toString(),
  }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  ok((merged.headers.get("location") || "").includes("msg="), "9 관리자 통합이 끝난다");
  ok(server.merges.length === 1 && server.merges[0].p_primary_user_id === "user-bin", "9 관리자 통합은 고른 방향 그대로 합친다");
  eq(securityVersion(fx, "user-wifi"), 0, "9 관리자 통합은 예전처럼 보조 계정 세션 판을 따로 올리지 않는다");
  eq(JSON.parse(settingValue(fx, "user_identity_links") || "{}")["kakao_login:2266"]?.user_id, "user-bin", "9 링크 표의 kakao_login:2266 이 주 계정을 가리킨다");
  const usersBefore = fx.db.users.length;
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2266", { ua: CHROME });
  eq(jar.user(), "user-bin", "9 통합된 옛 웹 가입자가 다시 로그인하면 주 계정으로 들어간다(예전: 빈 새 계정)");
  eq(fx.db.users.length, usersBefore, "9 새 사용자를 만들지 않는다");

  const audit = await go(fx, null, "/identity-audit?household_id=house-home", { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(audit.status === 200 && audit.html.includes("카카오 로그인 연결 진단") && audit.html.includes("남은 계정 잇기 제안: 0건"), "9 관리자 점검 화면에 연결 진단 칸이 있다");
});
await linkFixture(async (fx) => {
  await chatAccount(fx, "bot-v91-audit");
  await say(fx, "점심 8100", { user: "bot-v91-audit", appUserId: "2265" });
  const audit = await go(fx, null, "/identity-audit?household_id=house-home", { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(audit.html.includes("남은 계정 잇기 제안: 1건") && /appUserId 옴<\/th>.*?<td>단톡방<\/td><td>기록 없음<\/td>.*?<td>1:1<\/td><td>2026-10-30 \d\d:\d\d:\d\d \(UTC\)<\/td>/s.test(audit.html), "9 진단 칸에 appUserId 가 온 때와 남은 제안 수가 보인다");
  const card = audit.html.slice(audit.html.indexOf("<h2>카카오 로그인 연결 진단</h2>"), audit.html.indexOf("</section>", audit.html.indexOf("<h2>카카오 로그인 연결 진단</h2>")));
  ok(card.length > 0 && !card.includes("2265"), "9 진단 칸에 카카오 id 를 보이지 않는다");
});

// ── 10. 로그인 쿠키와 남의 표 ──────────────────────────────────────────
await linkFixture(async (fx, server) => {
  await chatAccount(fx, "bot-v91-replay");
  await say(fx, "점심 8100", { user: "bot-v91-replay", appUserId: "2265" });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const proof = jar.get("ab_account_link");
  ok(proof, "10 준비: 합치기 표가 있다");
  const other = await go(fx, new Jar(`ab_account_link=${proof}`), "/my/account-link/run", { ua: CHROME });
  eq(other.location, "/my", "10 세션 없는 브라우저로 옮긴 표는 쓰지 못한다");
  const wifiJar = new Jar();
  await kakaoLogin(fx, wifiJar, server, "2266", { ua: CHROME });
  wifiJar.items.set("ab_account_link", { value: proof, path: "/my/account-link" });
  const stolen = await go(fx, wifiJar, "/my/account-link/run", { ua: CHROME });
  ok(stolen.location === "/my/account-link?err=expired" && server.merges.length === 0, "10 다른 사람의 세션에서는 남의 합치기 표를 쓰지 못한다");
  const forged = await go(fx, wifiJar, "/my/account-link", { method: "POST", form: {}, ua: CHROME });
  eq(forged.location, "/my", "10 제안이 없는 사람의 잇기 확인 요청은 가계부로 돌려보낸다");
  const crossSite = await app.fetch(new Request(`${BASE}/my/account-link`, { method: "POST", headers: { cookie: jar.header("/my/account-link"), "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: "" }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  ok(crossSite.status >= 400 && !(crossSite.headers.get("location") || "").startsWith("https://kauth.kakao.com"), "10 다른 사이트에서 보낸 잇기 확인은 막는다(CSRF)");
});

// ── 11. 가계부·방이 많아 한 요청 한도에 닿아도 이은 사람의 세션과 제안 정리는 끝난다 ─────────────
// 독립 검토 5: 보조 계정이 연결한 방이 많으면 방 연결 정리가 한도를 다 써서, 예전에는 새 세션을 못 만들거나 제안 표 잠금이 90초 남았다.
await linkFixture(async (fx, server) => {
  const chat = await chatAccount(fx, "bot-v91-many");
  const rooms = [];
  for (let i = 1; i <= 8; i += 1) {
    const id = `house-many-${i}`;
    fx.db.households.push({ id, name: `모임 ${i}`, invite_code: `MANY${String(i).padStart(4, "0")}`, created_at: "2026-10-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "member", created_at: "2026-10-01T00:00:00.000Z" });
    putSetting(fx, `member_aliases:${id}`, { "user-bin": `빈${i}` });
    if (i <= 6) {
      rooms.push(`qa-room-many-${i}`);
      putSetting(fx, kakaoGroupLinkItemSettingsKey(`qa-room-many-${i}`), { group_key: `qa-room-many-${i}`, household_id: id, household_name: `모임 ${i}`, invite_code: `MANY${String(i).padStart(4, "0")}`, linked_by: "user-bin", linked_at: "2026-10-01T00:00:00.000Z" });
    }
  }
  await say(fx, "점심 8100", { user: "bot-v91-many", appUserId: "2265" });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  const restart = await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: CHROME });
  await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(new URL(restart.location).searchParams.get("state"))}`, { ua: CHROME });
  const deferredBefore = events("identity_alias_cleanup_deferred").length;
  const roomDeferredBefore = events("identity_group_link_cleanup_deferred").length;
  const { value: run, calls } = await countDb(fx, () => go(fx, jar, "/my/account-link/run", { ua: CHROME }));
  console.log(`account-link run (확인 뒤, 보조 가계부 10개·방 6개): DB ${calls}회`);
  ok(calls <= 50, `11 가계부 10개·방 6개를 옮겨도 한 요청 DB 한도(50)를 넘지 않는다 (${calls}회)`);
  eq(run.location, "/my?msg=account_linked", "11 합치기는 끝나고 가계부로 간다");
  eq(jar.user(), chat, "11 이 브라우저는 이은 계정 세션을 받는다(방 정리보다 먼저)");
  ok(!offers(fx)["user-bin"], "11 제안을 지운다(방 정리보다 먼저)");
  ok(memberships(fx, chat).length >= 10, "11 가계부 참여는 모두 옮겨진다(합치기 RPC 한 번)");
  ok(events("identity_alias_cleanup_deferred").length > deferredBefore, "11 다 못 고친 표시 별명은 운영 이벤트로 남긴다");
  const owners = rooms.map((key) => JSON.parse(settingValue(fx, kakaoGroupLinkItemSettingsKey(key)) || "{}").linked_by);
  const moved = owners.filter((id) => id === chat).length;
  ok(owners.every((id) => id === chat || id === "user-bin"), `11 방 연결은 주 계정이나 그대로다 (${owners.join(",")})`);
  const roomEvents = events("identity_group_link_cleanup_deferred").slice(roomDeferredBefore);
  ok(moved === rooms.length || roomEvents.some((event) => event.detail.includes(`${rooms.length - moved} room(s)`)), `11 다 못 옮긴 방 연결 수를 운영 이벤트로 남긴다 (옮김 ${moved}/${rooms.length}, ${roomEvents.map((event) => event.detail).join(" / ")})`);
  const held = fx.db.accountbook_operation_locks.filter((row) => Date.parse(row.locked_until) > Date.now()).map((row) => row.operation_key);
  eq(held.length, 0, `11 잡은 잠금은 모두 푼다(한도에 걸려 90초 남는 잠금 없음: ${held.join(",")})`);
});

// ── 12. 독립 검토 1: 카카오 로그인의 주인이 통합된 계정이면 주 계정으로 들어가고, 주 계정을 못 찾으면 멈춘다 ─────────
// 통합 뒤 링크 표 정리가 실패한 모양(kakao_login:<id> 가 통합된 옛 웹 계정을 가리킴). 예전에는 통합된 계정으로 세션을 만들어
// 세션 확인이 거절했고, 카카오톡 자동 로그인은 그 자리를 되풀이했다(토큰 교환 10번).
function staleMergedLink(fx, { kakaoId, userId, primaryId = "" }) {
  fx.db.users.push({ id: userId, kakao_user_key: `merged:${userId}:qa`, nickname: "옛 웹 (통합됨)", created_at: "2026-10-01T00:00:00.000Z" });
  if (primaryId) putSetting(fx, `identity_merge_redirect:${userId}`, { primary_user_id: primaryId, secondary_user_id: userId, merged_at: "2026-10-29T00:00:00.000Z" });
  const links = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
  links[`kakao_login:${kakaoId}`] = { user_id: userId, provider: "kakao_login", linked_at: "2026-10-01T00:00:00.000Z" };
  putSetting(fx, "user_identity_links", links);
}
await linkFixture(async (fx, server) => {
  staleMergedLink(fx, { kakaoId: "4400", userId: "user-old-web", primaryId: "user-bin" });
  const usersBefore = fx.db.users.length;
  const jar = new Jar();
  const hop = await go(fx, jar, RETURN_APP, { ua: INAPP });
  const exchanges = server.exchanges;
  const login = await kakaoLogin(fx, jar, server, "4400", { ua: INAPP, start: hop.location });
  eq(login.callback.location, RETURN_APP, "12 통합된 계정을 가리키는 카카오 로그인도 자동 로그인으로 보던 화면에 간다");
  eq(jar.user(), "user-bin", "12 세션은 주 계정(user-bin)이다(통합된 계정 세션을 만들지 않는다)");
  eq(server.exchanges - exchanges, 1, "12 카카오 토큰 교환은 한 번이다(되풀이 없음)");
  eq((await go(fx, jar, RETURN_APP, { ua: INAPP })).status, 200, "12 가계부 홈이 열린다");
  eq(fx.db.users.length, usersBefore, "12 새 사용자를 만들지 않는다");
  const manual = new Jar();
  await kakaoLogin(fx, manual, server, "4400", { ua: CHROME });
  eq(manual.user(), "user-bin", "12 직접 누른 웹 로그인도 주 계정으로 들어간다");
});
await linkFixture(async (fx, server) => {
  staleMergedLink(fx, { kakaoId: "4600", userId: "user-lost" });
  const usersBefore = fx.db.users.length;
  const autoJar = new Jar();
  const auto = await kakaoLogin(fx, autoJar, server, "4600", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
  ok(auto.callback.location === "/my?auto=0" && !autoJar.has("ab_user") && autoJar.get("ab_kakao_auto") === "skip", `12 주 계정을 못 찾으면 자동 로그인은 로그인 화면으로 간다 (${auto.callback.location})`);
  eq((await go(fx, autoJar, "/my", { ua: INAPP })).status, 200, "12 그 뒤 /my 는 로그인 화면을 그린다(되풀이 없음)");
  const manual = new Jar();
  const direct = await kakaoLogin(fx, manual, server, "4600", { ua: CHROME });
  ok(direct.callback.status >= 400 && !manual.has("ab_user"), `12 직접 로그인도 통합된 계정 세션을 만들지 않고 멈춘다 (${direct.callback.status})`);
  eq(fx.db.users.length, usersBefore, "12 새 계정을 만들지 않는다(기록이 갈라지지 않는다)");
  ok(events("kakao_login_error").some((event) => event.detail.includes("kakao_login_owner_merged_unresolved")), "12 운영 이벤트에 이유를 남긴다");
});
await linkFixture(async (fx) => {
  const chat = await chatAccount(fx, "bot-v91-merged-owner");
  staleMergedLink(fx, { kakaoId: "4500", userId: "user-old-web-2", primaryId: chat });
  const before = events("kakao_login_alias_conflict").length;
  await say(fx, "점심 8100", { user: "bot-v91-merged-owner", appUserId: "4500" });
  ok(newest(fx).amount === 8100 && newest(fx).user_id === chat, "12 채팅은 지금 계정으로 기록한다");
  ok(events("kakao_login_alias_conflict").length === before && !settingValue(fx, OFFERS_KEY), "12 그 카카오 계정이 이미 이 채팅 계정으로 통합됐으면 충돌·잇기 제안이 아니다");
});

// ── 13. 독립 검토 2: 자동 로그인은 새 계정을 만들지 않고, 가계부도 이을 계정도 없는 웹 계정에 말없이 들이지 않는다 ─────────
await linkFixture(async (fx, server) => {
  const usersBefore = fx.db.users.length;
  const jar = new Jar();
  const none = await kakaoLogin(fx, jar, server, "9900", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
  ok(none.callback.location === "/my?auto=0" && !jar.has("ab_user") && jar.get("ab_kakao_auto") === "skip", `13 웹 계정이 없는 카카오 회원의 자동 로그인은 로그인 화면으로 간다(하루 쉼) (${none.callback.location})`);
  eq(fx.db.users.length, usersBefore, "13 자동 로그인은 새 계정을 만들지 않는다");
  ok(events("kakao_auto_login_no_account").length > 0, "13 운영 이벤트(info)로 남긴다");
  // 가계부가 없는 웹 계정(예: 로그인 화면에서 카카오로 가입만 하고 가계부를 만들지 않음).
  fx.db.users.push({ id: "user-empty-web", kakao_user_key: "kakao_login:9910", nickname: "빈웹", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-empty-web", provider: "kakao", provider_subject: "9910", login_name: "", credential_version: 2 });
  const emptyJar = new Jar();
  const empty = await kakaoLogin(fx, emptyJar, server, "9910", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
  ok(empty.callback.location === "/my?auto=0" && !emptyJar.has("ab_user"), `13 가계부가 없고 이을 계정도 없는 웹 계정은 자동 로그인하지 않는다 (${empty.callback.location})`);
  ok(events("kakao_auto_login_empty_account").length > 0, "13 빈 계정 자동 로그인을 건너뛴 것을 운영 이벤트로 남긴다");
  const manual = new Jar();
  const direct = await kakaoLogin(fx, manual, server, "9910", { ua: INAPP });
  ok(direct.callback.location === "/my/households?first=1#create" && manual.user() === "user-empty-web", `13 로그인 화면에서 누른 카카오 로그인은 예전처럼 들어가 첫 가계부 화면으로 간다 (${direct.callback.location})`);
});

// ── 14. 독립 검토 6: 자동 로그인은 콜백 한도를 따로 센다 ─────────────────────
// 같은 IP(통신사 공유 IP·회사)의 화면 없는 자동 로그인이 손으로 누른 로그인을 ‘요청이 많아요’로 막지 않게 한다.
await linkFixture(async (fx, server) => {
  const keys = [];
  const restore = intercept(async ({ url, init }) => {
    if (url.pathname.endsWith("/rpc/accountbook_auth_attempt")) keys.push(String(JSON.parse(String(init.body || "{}")).p_key || ""));
    return null;
  });
  try {
    await kakaoLogin(fx, new Jar(), server, "2265", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
    const autoKeys = keys.splice(0);
    await kakaoLogin(fx, new Jar(), server, "2265", { ua: INAPP });
    const manualKeys = keys.splice(0);
    const autoOnly = autoKeys.filter((key) => !manualKeys.includes(key));
    ok(autoOnly.length > 0 && manualKeys.some((key) => !autoKeys.includes(key)), "14 자동 로그인 콜백과 손으로 누른 콜백은 한도 칸이 다르다");
    fx.db.__enforce_auth_rate = true;
    fx.db.__auth_attempts = new Map(autoOnly.map((key) => [key, 20]));
    const autoJar = new Jar();
    const full = await kakaoLogin(fx, autoJar, server, "2265", { ua: INAPP, start: "/auth/kakao/start?auto=1" });
    ok(full.callback.location === "/my?auto=0" && !autoJar.has("ab_user"), "14 자동 로그인 칸이 차면 로그인 화면으로 간다");
    const manualJar = new Jar();
    const manual = await kakaoLogin(fx, manualJar, server, "2265", { ua: INAPP });
    ok(manual.callback.status === 303 && manualJar.user() === "user-bin", `14 그때도 손으로 누른 카카오 로그인은 된다 (${manual.callback.status})`);
  } finally {
    restore();
    fx.db.__enforce_auth_rate = false;
  }
});

// ── 15. 독립 검토 4: 계정 잇기 스위치(KAKAO_ACCOUNT_LINK_ENABLED)가 꺼져 있으면 제안·진단만 남기고 잇지 않는다(운영 기본) ─────────
await linkFixture(async (fx, server) => {
  const chat = await chatAccount(fx, "bot-v91-switch");
  await say(fx, "점심 8100", { user: "bot-v91-switch", appUserId: "2265" });
  eq(offers(fx)["user-bin"]?.chat_user_id, chat, "15 스위치가 꺼져도 잇기 제안은 남긴다(켜기 전 확인 근거)");
  ok(settingValue(fx, "kakao_app_user_id_probe_v22991:present:direct"), "15 스위치가 꺼져도 appUserId 진단을 남긴다");
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  ok(login.callback.location === "/my" && !jar.has("ab_account_link"), `15 로그인 뒤 합치기 단계로 가지 않는다 (${login.callback.location})`);
  ok((await go(fx, jar, "/my", { ua: CHROME })).location.startsWith("/app?"), "15 /my 는 잇기를 묻지 않고 가계부로 간다");
  eq((await go(fx, jar, "/my/account-link", { ua: CHROME })).location, "/my", "15 확인 화면은 가계부로 돌려보낸다");
  eq((await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: CHROME })).location, "/my", "15 잇기 확인 요청도 카카오로 보내지 않고 가계부로 돌려보낸다");
  fx.env.KAKAO_ACCOUNT_LINK_ENABLED = "1";
  const onJar = new Jar();
  await kakaoLogin(fx, onJar, server, "2265", { ua: CHROME });
  ok(onJar.has("ab_account_link"), "15 준비: 켜진 동안에는 합치기 표를 받는다");
  delete fx.env.KAKAO_ACCOUNT_LINK_ENABLED;
  const run = await go(fx, onJar, "/my/account-link/run", { ua: CHROME });
  ok(run.location === "/my" && server.merges.length === 0 && !onJar.has("ab_account_link"), "15 꺼진 뒤에는 받아 둔 합치기 표로도 합치지 않는다");
  const audit = await go(fx, null, "/identity-audit?household_id=house-home", { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(audit.html.includes("계정 잇기: 꺼짐") && audit.html.includes("KAKAO_ACCOUNT_LINK_ENABLED=1"), "15 관리자 진단 칸이 스위치 상태(꺼짐)와 켜는 법을 보인다");
}, { link: false });
await linkFixture(async (fx) => {
  const audit = await go(fx, null, "/identity-audit?household_id=house-home", { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(audit.html.includes("계정 잇기: 켜짐"), "15 켜져 있으면 진단 칸이 켜짐을 보인다");
});

// ── 16. 독립 검토 3: 확인 화면이 가계부로 돌려보낼 때는 10분 멈추고, ‘나중에’는 계정 확인보다 먼저 받는다 ─────────
// 예전에는 계정 읽기 실패가 503 화면에 가두고(‘나중에 하기’도 같은 확인을 거쳤다), 1분 캐시·지우지 못한 제안이 /my 와 확인 화면을 오가게 했다.
await linkFixture(async (fx, server) => {
  await chatAccount(fx, "bot-v91-pause");
  await say(fx, "점심 8100", { user: "bot-v91-pause", appUserId: "2265" });
  const prepare = async () => {
    const jar = new Jar();
    await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
    await go(fx, jar, "/my/account-link/run", { ua: CHROME });
    eq((await go(fx, jar, "/my", { ua: CHROME })).location, "/my/account-link", "16 준비: /my 가 확인 화면으로 보낸다");
    return jar;
  };
  const pauseSet = (response) => response.status === 303 && response.location === "/my" && response.cookies.some((line) => line.startsWith("ab_account_link_pause=1") && /Max-Age=600/.test(line));

  const planJar = await prepare();
  let restore = intercept(async ({ url }) => url.pathname === "/rest/v1/household_members" && decodeURIComponent(url.search).includes("user_id=in.") ? failure() : null);
  try {
    const page = await go(fx, planJar, "/my/account-link", { ua: CHROME });
    ok(pauseSet(page), `16 계정을 읽지 못하면 오류 화면 대신 가계부로 가고 10분 멈춘다 (${page.status} ${page.location})`);
    ok((await go(fx, planJar, "/my", { ua: CHROME })).location.startsWith("/app?"), "16 멈춘 동안 /my 는 확인 화면으로 다시 보내지 않는다(두 화면을 오가지 않는다)");
    const laterJar = await prepare();
    const later = await go(fx, laterJar, "/my/account-link?later=1", { ua: CHROME });
    ok(later.location === "/my" && laterJar.get("ab_account_link_later") === offerHash("2265").slice(0, 16), "16 계정을 읽지 못해도 ‘나중에 하기’는 받는다");
  } finally {
    restore();
  }
  ok(events("kakao_account_link_plan_failed").length > 0, "16 계정 읽기 실패를 운영 이벤트로 남긴다");

  const readJar = await prepare();
  restore = intercept(async ({ url }) => url.pathname === "/rest/v1/accountbook_settings" && decodeURIComponent(url.search).includes(OFFERS_KEY) ? failure() : null);
  try {
    ok(pauseSet(await go(fx, readJar, "/my/account-link", { ua: CHROME })), "16 제안 표를 읽지 못해도 가계부로 가고 10분 멈춘다");
    ok((await go(fx, readJar, "/my", { ua: CHROME })).location.startsWith("/app?"), "16 1분 캐시에 제안이 남아 있어도 멈춘 동안 다시 보내지 않는다");
  } finally {
    restore();
  }

  const staleJar = await prepare();
  const chatRow = userByKey(fx, "bot-v91-pause");
  chatRow.kakao_user_key = `merged:${chatRow.id}:qa`;
  chatRow.nickname = "카카오사용자 (통합됨)";
  fx.db.__fail_next_operation_claim = true;
  ok(pauseSet(await go(fx, staleJar, "/my/account-link", { ua: CHROME })), "16 지난 제안을 지우지 못해도 가계부로 가고 10분 멈춘다");
  ok(offers(fx)["user-bin"], "16 준비: 제안은 아직 남아 있다(지우기 실패)");
  ok((await go(fx, staleJar, "/my", { ua: CHROME })).location.startsWith("/app?"), "16 지우지 못한 제안이 /my 를 확인 화면으로 되돌리지 않는다");
});

// ── 17. 독립 검토 7: 다른 요청이 두 계정의 잠금을 쥐고 있으면 ‘잇는 중’으로 안내하고 아무것도 바꾸지 않는다 ─────────
await linkFixture(async (fx, server) => {
  fx.db.users.push({ id: "user-web-v91", kakao_user_key: "kakao_login:3300", nickname: "웹사용자", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-web-v91", provider: "kakao", provider_subject: "3300", login_name: "", credential_version: 2 });
  const chat = await chatAccount(fx, "bot-v91-busy");
  await say(fx, "점심 8100", { user: "bot-v91-busy", appUserId: "3300" });
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "3300", { ua: CHROME });
  eq(login.callback.location, "/my/account-link/run", "17 준비: 합치기 단계로 간다");
  // 채팅 기록이 같은 잠금 행을 이미 만들고 풀었다. 그 행을 다른 요청이 쥔 것으로 바꾼다.
  const lockKey = `kakao_first_record_lifecycle_v22928:${chat}`;
  const held = { operation_key: lockKey, owner: "qa-other-request", locked_until: new Date(Date.now() + 60_000).toISOString(), updated_at: new Date().toISOString() };
  const lockRow = fx.db.accountbook_operation_locks.find((row) => row.operation_key === lockKey);
  if (lockRow) Object.assign(lockRow, held); else fx.db.accountbook_operation_locks.push(held);
  const failedBefore = events("kakao_account_link_failed").length;
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my/account-link?err=in_progress", "17 다른 요청이 잠금을 쥐고 있으면 ‘잇는 중’ 안내로 간다(예전: 잇지 못했어요)");
  eq(server.merges.length, 0, "17 합치지 않는다");
  ok(events("kakao_account_link_busy").length > 0 && events("kakao_account_link_failed").length === failedBefore, "17 실패(error)가 아니라 경고 이벤트로 남긴다");
  const page = await go(fx, jar, run.location, { ua: CHROME });
  ok(page.status === 200 && page.html.includes("다른 창이나 카카오톡 방의 요청이 이 계정을 쓰고 있어"), "17 확인 화면이 그 안내를 보인다");
});

t.done();
