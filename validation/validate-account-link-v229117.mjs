// V22.9.117 — 계정 잇기 확인: 같은 웹 계정의 다른 카카오 로그인으로 확인해도 잇고, 확인 화면 배치를 고친다.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자(2026-11-10): "로그아웃하고 구글에서 검색해서 들어가려면 [계정 잇기 화면 · ‘확인한 카카오 계정이 이 가계부의 카카오 계정과 달라요’]
// 이렇게 나오는데 왜그러는거야 ui 배치도 좀 엉망이고".
// 원인(운영 DB 덤프 2026-11-10 13:44 를 해시로만 대조): 운영자의 웹 계정에는 카카오 로그인이 둘 있다. 7월 5일 웹 카카오 로그인 둘이 7월 13일 관리자
// 통합으로 한 계정에 모였고(하나는 강한 식별, 하나는 링크 표의 kakao_login 별칭), 카카오톡 방은 둘째 카카오 계정을 쓴다. 잇기 제안의 카카오 id 는
// 방 요청의 appUserId(= 둘째)인데, 확인 단계(V22.9.91)는 방금 확인한 카카오 id 가 꼭 그것이어야 해서 첫째 카카오 계정으로 로그인한 브라우저에서는
// 늘 ‘다른 카카오 계정’ 이었고, /my 를 열 때마다 이 화면으로 돌아왔다(‘나중에 하기’ 7일 뒤 다시).
// 고친 것:
//   1) 확인 화면에서 단추를 누른 뒤, 확인한 카카오 id 의 주인이 제안의 웹 계정이고 제안의 카카오 id 도 아직 그 웹 계정의 카카오 로그인이면(그 자리에서
//      다시 읽음, 웹 로그인·관리자 통합이 쓴 별칭만) 받는다. 로그인 콜백만으로는 다른 카카오 로그인으로 잇지 않는다(빈 쪽이 있어도, 1·4번).
//      아무 카카오 계정이나 받지 않고(2·3번), 단톡방 요청이 쓴 별칭으로도 받지 않는다(7번, 독립 보안 검토 P2 — 위조 요청으로 심은 별칭).
//      확인한 뒤 제안의 방 기록 계정이 바뀌면 합치지 않는다(8번). 믿는 카카오 로그인은 강한 식별과 옛 웹 카카오 로그인이 쓴 별칭(provider kakao_login)뿐이고,
//      방금 확인한 카카오 id 와 제안의 카카오 id 가 둘 다 그래야 한다. 사용자 키(웹 로그인 꼴의 위조 봇 키로 만든 계정)와 관리자 통합·계정 잇기가 쓴 별칭
//      (provider identity_merge — 위조 키 계정을 V22.9.91 잇기로 합치면 생긴다)은 믿지 않는다(9번). 그런 별칭뿐인 계정은 다시 확인 단추로 그 카카오
//      계정에 직접 로그인하면 잇는다(10번).
//   2) ‘다른 카카오 계정’ 문구를 사실대로 고치고, 보통 브라우저에서는 카카오 로그인 화면을 새로 띄우는 다시 확인 단추(prompt=login)를 둔다.
//      카카오톡 인앱 브라우저는 카카오 계정을 바꿀 수 없어(카카오 문서) 전과 같다.
//   3) 확인 화면 배치: 한글 낱말 가운데 줄바꿈(keep-all), 안내 상자와 단추 사이 간격, 오류를 제목 바로 아래로, 두 계정 줄을 이름·숫자 두 줄로,
//      첫 단추 글자 굵기(font:inherit 가 덮던 것), 테마 스크립트.
// 실제 요청(/admin/identity/merge·/auth/kakao/start·callback·/my·/my/account-link·/my/account-link/run·/skill)과 저장된 행으로 확인한다.
// 가짜는 카카오 서버 두 곳(토큰·프로필)과 합치기 RPC 뿐이다(V22.9.91 검사와 같은 흉내).
//
// ── 실행 ──
//   node validation/validate-account-link-v229117.mjs
import { createHash } from "node:crypto";
import { app, BASE, counter, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";
import { readPurposeToken } from "../src/index.js";

const t = counter("PASS: V22.9.117 account link");
// V229117_SOFT=1 은 옛 코드(운영 V22.9.116 번들)에 이 검사를 돌려 몇 개가 실패하는지 셀 때만 쓴다(실패를 모으고 끝에 센다, 장면 안 예외도 한 건으로).
const SOFT = process.env.V229117_SOFT === "1";
const softFailures = [];
const ok = (value, message) => { if (SOFT && !value) { softFailures.push(message); return; } t.ok(!!value, message); };
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);

const SECRET = "identity-secret-v229117";
const DAY = "2026-11-10";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const CHROME = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const OFFERS_KEY = "kakao_login_link_offers_v22991";
const RETURN_APP = "/app?month=2026-11&household_id=house-home";
const MISMATCH_TEXT = "확인한 카카오 계정은 이 웹 계정에 연결된 카카오 계정이 아니에요. 계정은 잇지 않았고 가계부와 기록은 그대로예요.";
const RELOGIN_HINT = "아래 단추로 카카오톡에서 쓰는 카카오 계정에 다시 로그인해 주세요.";
const INAPP_HINT = "카카오톡 안에서는 카카오 계정을 바꿀 수 없어요. 인터넷 브라우저(크롬·사파리 등)로 다시 들어와 그 방에서 쓰는 카카오 계정으로 확인해 주세요.";
const UNVERIFIED_TEXT = "이 잇기 제안의 카카오 계정이 이 웹 계정에 연결돼 있는지 확인하지 못했어요. 계정은 잇지 않았고 가계부와 기록은 그대로예요.";
const OLD_MISMATCH_TEXT = "이 가계부의 카카오 계정과 달라요";
const offerHash = (kakaoId) => createHash("sha256").update(`kakao-login-link-offer:v1:${kakaoId}`).digest("hex");

// isolate 전역(1분 제안 캐시·appUserId 진단·충돌 표시·통합 계정 캐시)은 픽스처마다 비운다(V22.9.91 검사와 같다).
function resetIsolateState() {
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  for (const name of ["__AB_KAKAO_APP_USER_ID_PROBE", "__AB_KAKAO_LOGIN_CONFLICT_TRACED", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_KAKAO_IDENTITY_WORK_DONE"]) globalThis[name]?.clear?.();
}

async function linkFixture(task) {
  if (SOFT) {
    try { return await linkFixtureRun(task); } catch (err) { softFailures.push(`장면 안 예외: ${String(err?.message || err).slice(0, 200)}`); return null; }
  }
  return linkFixtureRun(task);
}

async function linkFixtureRun(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v229117";
    Object.assign(fx.env, KAKAO_ENV);
    const server = kakaoServer(fx);
    try {
      return await task(fx, server);
    } finally {
      server.restore();
      resetIsolateState();
    }
  }));
}

// ── 쿠키 통(V22.9.91 검사와 같다) ──
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

async function go(fx, jar, path, { method = "GET", ua = CHROME, form = null, headers = {}, ctx = null } = {}) {
  const url = new URL(path, BASE);
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...headers };
  const cookie = jar ? jar.header(url.pathname) : "";
  if (cookie) requestHeaders.cookie = cookie;
  const init = { method, headers: requestHeaders };
  if (form) {
    Object.assign(requestHeaders, { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" });
    init.body = new URLSearchParams(form).toString();
  }
  const response = await app.fetch(new Request(url.href, init), fx.env, ctx || { waitUntil() {}, passThroughOnException() {} });
  const cookies = jar ? jar.take(response) : (typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : []);
  return { status: response.status, location: response.headers.get("location") || "", headers: response.headers, cookies, html: await response.text() };
}

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function putSetting(fx, key, value) {
  const text = typeof value === "string" ? value : JSON.stringify(value);
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = text; else fx.db.accountbook_settings.push({ key, value: text });
}

// 카카오 서버(토큰·프로필)와 합치기 RPC(schema_v22_7_0_auth_atomicity.sql 의 효과만, V22.9.91 검사와 같다).
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

// 공식 그룹 챗봇 모양(v1.11.1). V22.9.91 검사와 같다.
function payloadFor(utterance, { user, room = "", appUserId = "" }) {
  const properties = { botUserKey: user, ...(appUserId ? { appUserId } : {}) };
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

async function say(fx, utterance, options, { secret = true } = {}) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", ...(secret ? { "x-kakao-skill-secret": SECRET } : {}) },
    body: JSON.stringify(payloadFor(utterance, options)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let parsed = null;
  try { parsed = JSON.parse(raw); } catch (_) {}
  return (parsed?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}

const offers = (fx) => JSON.parse(settingValue(fx, OFFERS_KEY) || "{}");
const links = (fx) => JSON.parse(settingValue(fx, "user_identity_links") || "{}");
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const memberships = (fx, id) => fx.db.household_members.filter((row) => row.user_id === id);
const newest = (fx) => fx.db.transactions.at(-1);

// 웹 카카오 로그인(start → callback). 콜백 응답까지 돌려준다(따라가지 않는다). 직접 누르는 로그인은 동의 칸(consent=1)을 붙인다(V22.9.91 검사와 같다).
const withConsent = (path) => (/[?&](auto|consent)=/.test(path) ? path : `${path}${path.includes("?") ? "&" : "?"}consent=1`);
async function kakaoLogin(fx, jar, server, kakaoId, { ua = CHROME, start = "/auth/kakao/start" } = {}) {
  server.id = String(kakaoId);
  const begin = await go(fx, jar, withConsent(start), { ua });
  const authorize = new URL(begin.location || `${BASE}/`);
  const state = authorize.searchParams.get("state") || "";
  const callback = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { ua });
  return { begin, authorize, state, callback };
}

// 확인 화면의 ‘카카오로 확인하고 잇기’(POST) → 카카오 인가 → 콜백. kakaoId 는 그때 카카오에 로그인된 계정.
async function confirmWith(fx, jar, server, kakaoId, { ua = CHROME, form = {} } = {}) {
  const start = await go(fx, jar, "/my/account-link", { method: "POST", form, ua });
  const authorize = new URL(start.location);
  server.id = String(kakaoId);
  const callback = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state") || "")}`, { ua });
  return { start, authorize, callback };
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

// 운영자 계정의 모양: 웹 계정(user-bin)에 카카오 로그인 둘. 2265 는 웹 로그인으로 생긴 강한 식별, 2266 은 관리자 통합으로 옮겨 온 옛 웹 가입자
// (user-wifi, kakao_login:2266)의 링크 표 별칭. 운영 덤프의 두 카카오 로그인(7월 5일 웹 로그인 둘 → 7월 13일 관리자 통합)과 같은 자리다.
// 운영의 그 별칭은 7월 웹 로그인이 쓴 것이라 provider kakao_login 이고, 관리자 통합이 provider 를 그대로 옮겼다(덤프: linked 07-05 08:37Z, merged 07-13).
// legacyAlias false 는 그 별칭 없이 관리자 통합만 한 모양이다(통합이 사용자 키로 provider identity_merge 별칭을 쓴다, 10번).
async function twoKakaoLoginWebAccount(fx, server, label, { legacyAlias = true } = {}) {
  if (legacyAlias) putSetting(fx, "user_identity_links", { ...links(fx), "kakao_login:2266": { user_id: "user-wifi", provider: "kakao_login", linked_at: "2026-07-05T08:37:38.000Z" } });
  // 운영의 첫째 카카오 로그인은 강한 식별(provider kakao)이다. 픽스처의 user-bin 은 옛 사용자 키(kakao_login:2265)만 있어 그 자리를 채운다.
  fx.db.accountbook_user_identities.push({ user_id: "user-bin", provider: "kakao", provider_subject: "2265", login_name: "", credential_version: 2 });
  const merged = await app.fetch(new Request(`${BASE}/admin/identity/merge`, {
    method: "POST",
    headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}`, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" },
    body: new URLSearchParams({ household_id: "house-home", primary_user_id: "user-bin", secondary_user_id: "user-wifi", confirm_text: "통합" }).toString(),
  }), fx.env, { waitUntil() {}, passThroughOnException() {} });
  ok((merged.headers.get("location") || "").includes("msg="), `${label} 준비: 관리자 통합(user-wifi → user-bin)이 끝난다`);
  eq(links(fx)["kakao_login:2266"]?.user_id, "user-bin", `${label} 준비: 링크 표의 kakao_login:2266 이 웹 계정을 가리킨다(둘째 카카오 로그인)`);
  eq(links(fx)["kakao_login:2266"]?.provider, legacyAlias ? "kakao_login" : "identity_merge", `${label} 준비: 그 별칭의 provider (${legacyAlias ? "옛 웹 로그인 그대로" : "관리자 통합만"})`);
  const first = new Jar();
  await kakaoLogin(fx, first, server, "2265", { ua: CHROME });
  eq(first.user(), "user-bin", `${label} 준비: 카카오 2265 웹 로그인은 웹 계정`);
  ok(fx.db.accountbook_user_identities.filter((row) => row.user_id === "user-bin" && row.provider === "kakao").map((row) => row.provider_subject).join(",") === "2265", `${label} 준비: 웹 계정의 강한 식별은 2265 하나(2266 은 링크 표 별칭으로만 있다)`);
  const second = new Jar();
  await kakaoLogin(fx, second, server, "2266", { ua: CHROME });
  eq(second.user(), "user-bin", `${label} 준비: 카카오 2266 웹 로그인도 같은 웹 계정`);
  return server.merges.length;
}

// 카카오톡 방의 기록 계정(봇 키만) + appUserId 2266(방은 둘째 카카오 계정을 쓴다) → 잇기 제안.
async function roomAccountWithOffer(fx, bot, label, { empty = false } = {}) {
  let chat;
  if (empty) {
    chat = `user-chat-${bot}`;
    fx.db.users.push({ id: chat, kakao_user_key: bot, nickname: "카카오사용자", created_at: "2026-10-01T00:00:00.000Z" });
    await say(fx, "이번 달 요약", { user: bot, appUserId: "2266" });
  } else {
    await say(fx, "커피 4100", { user: bot });
    chat = userByKey(fx, bot)?.id;
    ok(chat && memberships(fx, chat).length > 0 && newest(fx)?.user_id === chat, `${label} 준비: 방 기록 계정에 가계부·기록이 있다`);
    await say(fx, "점심 8100", { user: bot, appUserId: "2266" });
  }
  eq(offers(fx)["user-bin"]?.chat_user_id, chat, `${label} 준비: 방 기록 계정 → 웹 계정 잇기 제안`);
  eq(offers(fx)["user-bin"]?.kakao_hash, offerHash("2266"), `${label} 준비: 제안의 카카오 id 는 방의 appUserId(2266, 웹 계정의 둘째 카카오 로그인)`);
  return chat;
}

// ── 1. 운영자 장면: 첫째 카카오 계정(2265)으로 로그인한 브라우저에서 확인해도 잇는다 ─────────────────────
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "1");
  const chat = await roomAccountWithOffer(fx, "bot-v117-room", "1");
  const jar = new Jar();
  const { value: login, calls: loginCalls } = await countDb(fx, () => kakaoLogin(fx, jar, server, "2265", { ua: CHROME }));
  console.log(`web login with the other Kakao login of the web account: DB ${loginCalls}회 (start + callback)`);
  eq(login.callback.location, "/my", "1 다른 카카오 로그인(2265)의 로그인 콜백은 합치기 단계로 가지 않고 가계부로 간다(로그인만으로는 잇지 않는다)");
  ok(!jar.has("ab_account_link"), "1 로그인 콜백은 합치기 표를 주지 않는다");
  ok(loginCalls <= 50, `1 로그인 콜백은 한 요청 DB 한도(50) 안이다 (${loginCalls}회)`);
  eq(jar.user(), "user-bin", "1 세션은 웹 계정");
  eq((await go(fx, jar, "/my", { ua: CHROME })).location, "/my/account-link", "1 /my 는 확인 화면으로 보낸다(사용자가 본 화면)");
  eq(server.merges.length, base, "1 확인 전에는 합치지 않는다");
  const page = await go(fx, jar, "/my/account-link", { ua: CHROME });
  ok(page.status === 200 && page.html.includes("카카오톡 방 가계부와 웹 계정을 이을까요?") && page.html.includes(">카카오로 확인하고 잇기</button>"), "1 확인 화면과 잇기 단추");
  const start = await go(fx, jar, "/my/account-link", { method: "POST", form: {}, ua: CHROME });
  const authorize = new URL(start.location);
  ok(authorize.href.startsWith("https://kauth.kakao.com/oauth/authorize") && !authorize.searchParams.has("prompt"), "1 처음 확인은 지금처럼 카카오 인가(prompt 없음)");
  server.id = "2265";
  const { value: callback, calls } = await countDb(fx, () => go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state"))}`, { ua: CHROME }));
  console.log(`account-link confirm callback with the other Kakao login: DB ${calls}회`);
  eq(callback.location, "/my/account-link/run", "1 웹 계정의 다른 카카오 로그인으로 확인해도 받는다(예전: ?err=kakao_account_mismatch)");
  ok(calls <= 50, `1 확인 콜백은 한 요청 DB 한도(50) 안이다 (${calls}회)`);
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my?msg=account_linked", "1 합치고 가계부로 안내와 함께 간다");
  ok(server.merges.length === base + 1 && server.merges.at(-1)?.p_primary_user_id === chat && server.merges.at(-1)?.p_secondary_user_id === "user-bin", "1 주 계정 = 방 기록 계정, 보조 = 웹 계정(V22.9.91 confirm 그대로)");
  eq(jar.user(), chat, "1 이 브라우저는 이은 계정 세션을 받는다");
  ok(!offers(fx)["user-bin"], "1 제안을 지운다");
  for (const kakaoId of ["2265", "2266"]) {
    const again = new Jar();
    await kakaoLogin(fx, again, server, kakaoId, { ua: CHROME });
    eq(again.user(), chat, `1 이은 뒤 카카오 ${kakaoId} 웹 로그인은 이은 계정으로 들어간다`);
  }
  await say(fx, "커피 4400", { user: "bot-v117-room", appUserId: "2266" });
  ok(newest(fx).amount === 4400 && newest(fx).user_id === chat, "1 이은 뒤 방 기록도 같은 계정이다");
  ok(!offers(fx)["user-bin"] && !Object.keys(offers(fx)).length, "1 이은 뒤 방 기록이 제안을 다시 만들지 않는다");
});

// ── 2. 이 웹 계정의 것이 아닌 카카오 계정은 여전히 잇지 않는다 + 다시 확인 단추(prompt=login) ───────────────
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "2");
  const chat = await roomAccountWithOffer(fx, "bot-v117-other", "2");
  fx.db.users.push({ id: "user-other-v117", kakao_user_key: "kakao_login:2277", nickname: "다른 사람", created_at: "2026-10-01T00:00:00.000Z" });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  for (const [kakaoId, label] of [["2299", "어느 계정에도 없는 카카오 계정"], ["2277", "다른 사람 계정의 카카오 계정"]]) {
    const { callback } = await confirmWith(fx, jar, server, kakaoId);
    eq(callback.location, "/my/account-link?err=kakao_account_mismatch", `2 ${label}(${kakaoId})으로 확인하면 잇지 않고 이유를 보인다`);
    eq(server.merges.length, base, `2 ${label}으로는 합치지 않는다`);
  }
  ok(offers(fx)["user-bin"]?.chat_user_id === chat, "2 제안은 그대로 남는다(맞는 계정으로 다시 확인할 수 있다)");
  const errorPage = await go(fx, jar, "/my/account-link?err=kakao_account_mismatch", { ua: CHROME });
  ok(errorPage.html.includes(`<p class="linkError" role="alert">${MISMATCH_TEXT} ${RELOGIN_HINT}</p>`), "2 보통 브라우저: 사실대로 고친 문구 + 다시 로그인 안내");
  ok(!errorPage.html.includes(OLD_MISMATCH_TEXT), "2 옛 문구(‘이 가계부의 카카오 계정과 달라요’)는 없다");
  ok(errorPage.html.includes('<input type="hidden" name="relogin" value="1"/>') && errorPage.html.includes(">다른 카카오 계정으로 확인하고 잇기</button>"), "2 보통 브라우저: 다시 확인 단추는 relogin 을 싣는다");
  const inappPage = await go(fx, jar, "/my/account-link?err=kakao_account_mismatch", { ua: INAPP });
  ok(inappPage.html.includes(`<p class="linkError" role="alert">${MISMATCH_TEXT} ${INAPP_HINT}</p>`) && !inappPage.html.includes(RELOGIN_HINT), "2 카카오톡 인앱: 다시 로그인 단추 대신 인터넷 브라우저 안내(카카오 계정을 바꿀 수 없다)");
  ok(!inappPage.html.includes('name="relogin"') && inappPage.html.includes(">카카오로 확인하고 잇기</button>"), "2 카카오톡 인앱: 단추는 지금 그대로");
  const inappStart = await go(fx, jar, "/my/account-link", { method: "POST", form: { relogin: "1" }, ua: INAPP });
  eq(new URL(inappStart.location).searchParams.get("prompt"), "none", "2 인앱에서 relogin 이 와도 화면 없는 확인(prompt=none) 그대로");
  const retryPage = await go(fx, jar, "/my/account-link?err=kakao_retry", { ua: INAPP });
  ok(retryPage.html.includes('<input type="hidden" name="interactive" value="1"/>') && !retryPage.html.includes('name="relogin"'), "2 인앱 kakao_retry 화면은 예전처럼 interactive 만");
  const relogin = await go(fx, jar, "/my/account-link", { method: "POST", form: { relogin: "1" }, ua: CHROME });
  const reloginUrl = new URL(relogin.location);
  eq(reloginUrl.searchParams.get("prompt"), "login", "2 보통 브라우저의 다시 확인은 카카오 로그인 화면을 새로 띄운다(prompt=login)");
  const reloginState = await readPurposeToken(fx.env, "kakao-oauth", reloginUrl.searchParams.get("state") || "");
  ok(reloginState?.mode === "account-link" && reloginState.offer === "user-bin" && reloginState.user_id === "user-bin" && !reloginState.auto, "2 다시 확인의 상태도 계정 잇기 모드·제안·세션 사용자에 묶인다");
  server.id = "2266";
  const callback = await go(fx, jar, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(reloginUrl.searchParams.get("state"))}`, { ua: CHROME });
  eq(callback.location, "/my/account-link/run", "2 카카오 로그인 화면에서 방의 카카오 계정(2266)으로 로그인하면 받는다(제안과 같은 id, 예전부터)");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  ok(run.location === "/my?msg=account_linked" && server.merges.at(-1)?.p_primary_user_id === chat, "2 그때 잇는다");
});

// ── 3. 제안의 카카오 id 가 더는 이 웹 계정의 것이 아니면 다른 카카오 로그인으로는 잇지 않는다 ───────────────
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "3");
  await roomAccountWithOffer(fx, "bot-v117-moved", "3");
  // (a) 링크 표의 kakao_login:2266 이 다른 사람을 가리키게 됐다(관리자 정리 등).
  fx.db.users.push({ id: "user-moved-v117", kakao_user_key: "bot-moved-v117", nickname: "옮긴 사람", created_at: "2026-10-01T00:00:00.000Z" });
  const moved = links(fx);
  moved["kakao_login:2266"] = { ...moved["kakao_login:2266"], user_id: "user-moved-v117" };
  putSetting(fx, "user_identity_links", moved);
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  eq(login.callback.location, "/my", "3a 로그인 콜백은 합치기 단계로 가지 않는다(다른 카카오 로그인)");
  ok(!jar.has("ab_account_link"), "3a 합치기 표를 주지 않는다");
  const { callback } = await confirmWith(fx, jar, server, "2265");
  eq(callback.location, "/my/account-link?err=kakao_offer_unverified", "3a 확인 화면에서 2265 로 확인해도 잇지 않고, 제안의 카카오 계정을 확인하지 못했다고 알린다(2265 는 이 웹 계정 것이다)");
  eq(server.merges.length, base, "3a 합치지 않는다");
});
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "3");
  await roomAccountWithOffer(fx, "bot-v117-strong", "3");
  // (b) 링크 표는 그대로인데 2266 의 강한 식별이 다른 사람에게 있다 — 로그인과 같은 순서(강한 식별 먼저)로 주인을 다시 읽는다.
  fx.db.users.push({ id: "user-strong-v117", kakao_user_key: "bot-strong-v117", nickname: "강한 식별", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-strong-v117", provider: "kakao", provider_subject: "2266", login_name: "", credential_version: 2 });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const { callback } = await confirmWith(fx, jar, server, "2265");
  eq(callback.location, "/my/account-link?err=kakao_offer_unverified", "3b 제안의 카카오 id 의 주인이 바뀌었으면(강한 식별) 잇지 않는다");
  eq(server.merges.length, base, "3b 합치지 않는다");
});

// ── 4. 한쪽이 비어도 다른 카카오 로그인으로는 로그인만으로 잇지 않는다 — 확인 화면 단추 뒤에 잇는다(독립 보안 검토) ───────────────
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "4");
  const chat = await roomAccountWithOffer(fx, "bot-v117-empty", "4", { empty: true });
  ok(memberships(fx, chat).length === 0 && !fx.db.transactions.some((row) => row.user_id === chat), "4 준비: 방 기록 계정은 비어 있다");
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "2265", { ua: CHROME, start: `/auth/kakao/start?return_to=${encodeURIComponent(RETURN_APP)}` });
  eq(login.callback.location, RETURN_APP, "4 다른 카카오 로그인(2265)의 로그인 콜백은 빈 쪽이 있어도 잇지 않고 열던 화면으로 간다");
  ok(!jar.has("ab_account_link") && server.merges.length === base, "4 로그인만으로는 합치지 않는다(합치기 표 없음)");
  eq((await go(fx, jar, "/my", { ua: CHROME })).location, "/my/account-link", "4 /my 는 확인 화면으로 보낸다");
  const page = await go(fx, jar, "/my/account-link", { ua: CHROME });
  ok(page.html.includes("카카오톡 방 가계부와 웹을 이어 드릴게요") && page.html.includes(">카카오로 확인하고 잇기</button>"), "4 빈 쪽 확인 화면(auto)과 잇기 단추");
  const { callback } = await confirmWith(fx, jar, server, "2265");
  eq(callback.location, "/my/account-link/run", "4 확인 화면에서 2265 로 확인하면 받는다");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my?msg=account_linked", "4 빈 방 기록 계정을 잇고 가계부로 간다");
  ok(server.merges.length === base + 1 && server.merges.at(-1)?.p_primary_user_id === "user-bin" && server.merges.at(-1)?.p_secondary_user_id === chat, "4 빈 방 기록 계정을 웹 계정으로 합친다");
  eq(jar.user(), "user-bin", "4 세션은 웹 계정 그대로");
});

// ── 5. 확인 화면 배치(사용자 "ui 배치도 좀 엉망이고") ─────────────────────────────
await linkFixture(async (fx, server) => {
  await twoKakaoLoginWebAccount(fx, server, "5");
  await roomAccountWithOffer(fx, "bot-v117-layout", "5");
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const page = await go(fx, jar, "/my/account-link", { ua: CHROME });
  const html = page.html;
  ok(html.includes('<section class="card linkCard">'), "5 확인 카드에 이 화면 전용 이름(linkCard)이 있다");
  ok(html.includes(".linkCard{word-break:keep-all;overflow-wrap:break-word}"), "5 한글을 낱말 가운데서 끊지 않는다(keep-all)");
  ok(html.includes(".linkCard .guide{margin:0 0 16px}"), "5 안내 상자와 단추 사이에 간격이 있다");
  ok(html.includes("button.btn{border:0;font:inherit;font-weight:1000;cursor:pointer}"), "5 첫 단추(button)도 두 번째 단추(a)처럼 굵다");
  ok(html.includes("html{min-height:100%}"), "5 배경이 화면 끝까지 이어진다(넓은 화면에서 배경 무늬가 되풀이되지 않음)");
  ok(/<script src="\/assets\/accountbook-theme-v\d+\.js"><\/script>/.test(html), "5 테마 스크립트를 싣는다(다크를 고른 사람에게 흰 화면이 아니다)");
  ok(html.includes('html[data-ab-resolved-theme="dark"] .linkError{'), "5 오류 상자의 다크 값이 있다");
  const rows = [...html.matchAll(/<li><b>(방|웹)<\/b><span><strong>([^<]+)<\/strong><small>([^<]+)<\/small><\/span><\/li>/g)].map((m) => `${m[1]}|${m[2]}|${m[3]}`);
  ok(rows.length === 2 && rows[0] === "방|카카오톡 방 기록 계정|가계부 1개 · 내가 쓴 기록 2건" && /^웹\|웹 로그인 계정\|가계부 \d+개 · 내가 쓴 기록 \d+건$/.test(rows[1]), `5 두 계정 줄은 이름과 숫자를 두 줄로 (${rows.join(" / ")})`);
  ok(html.includes('<p class="note">카카오톡 안에서는 확인 화면 없이 바로 지나가요.'), "5 아래 작은 글씨는 note 로(설명 글과 구분)");
  ok(!html.includes('class="linkError"'), "5 오류가 없으면 오류 상자도 없다");
  const errorHtml = (await go(fx, jar, "/my/account-link?err=kakao_account_mismatch", { ua: CHROME })).html;
  const at = (needle) => errorHtml.indexOf(needle);
  ok(at("</h1>") > 0 && at("</h1>") < at('<p class="linkError"') && at('<p class="linkError"') < at('<p class="sub">') && at('<p class="sub">') < at('<ol class="linkRows">') && at('<ol class="linkRows">') < at('<div class="guide">') && at('<div class="guide">') < at('<form method="post" action="/my/account-link" class="actions">') && at('<form method="post"') < at('<p class="note">'),
    "5 순서: 제목 → 오류 → 설명 → 두 계정 → 안내 → 단추 → 작은 글씨");
  const unverified = await go(fx, jar, "/my/account-link?err=kakao_offer_unverified", { ua: CHROME });
  ok(unverified.html.includes(`<p class="linkError" role="alert">${UNVERIFIED_TEXT} ${RELOGIN_HINT}</p>`) && unverified.html.includes('<input type="hidden" name="relogin" value="1"/>') && unverified.html.includes(">다른 카카오 계정으로 확인하고 잇기</button>"), "5 제안의 카카오 계정을 확인하지 못한 오류에도 다시 로그인 안내·단추(보통 브라우저)");
  const unverifiedInapp = await go(fx, jar, "/my/account-link?err=kakao_offer_unverified", { ua: INAPP });
  ok(unverifiedInapp.html.includes(`<p class="linkError" role="alert">${UNVERIFIED_TEXT} ${INAPP_HINT}</p>`) && !unverifiedInapp.html.includes('name="relogin"'), "5 카카오톡 인앱: 인터넷 브라우저 안내, relogin 없음");
  for (const err of ["constructor", "toString", "__proto__", "hasOwnProperty", "valueOf"]) {
    const odd = (await go(fx, jar, `/my/account-link?err=${err}`, { ua: CHROME })).html;
    ok(!odd.includes('class="linkError"') && !odd.includes("[native code]"), `5 표에 없는 오류 이름(${err})은 오류 상자를 그리지 않는다`);
  }
  for (const err of ["expired", "unavailable", "failed", "result_unknown", "session", "kakao_unavailable", "kakao_retry", "cancelled", "busy", "in_progress"]) {
    const other = (await go(fx, jar, `/my/account-link?err=${err}`, { ua: CHROME })).html;
    ok(other.includes('<p class="linkError" role="alert">') && !other.includes(RELOGIN_HINT) && !other.includes(INAPP_HINT) && !other.includes('name="relogin"'), `5 다른 오류(${err})에는 다시 로그인 안내·relogin 이 붙지 않는다`);
  }
});

// ── 6. 이을 수 없는 두 계정(같은 종류의 로그인) 화면은 그대로다 ─────────────────────────────
await linkFixture(async (fx, server) => {
  await twoKakaoLoginWebAccount(fx, server, "6");
  const chat = await roomAccountWithOffer(fx, "bot-v117-blocked", "6");
  fx.db.accountbook_user_identities.push({ user_id: chat, provider: "kakao", provider_subject: "bot-only-v117", login_name: "", credential_version: 2 });
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  eq((await go(fx, jar, "/my", { ua: CHROME })).location, "/my/account-link", "6 /my 는 확인 화면으로 이유를 보이러 간다");
  const page = await go(fx, jar, "/my/account-link?err=kakao_account_mismatch", { ua: CHROME });
  ok(page.html.includes("두 계정을 자동으로 이을 수 없어요") && !page.html.includes('action="/my/account-link"') && !page.html.includes('name="relogin"'), "6 이을 수 없는 화면에는 잇기 단추·다시 로그인 단추가 없다");
  ok(page.html.includes('href="/my/account-link?later=blocked"'), "6 ‘가계부로 가기’ 는 그대로");
});

// ── 7. 단톡방 요청이 쓴 별칭으로는 다른 카카오 로그인 확인을 받지 않는다(독립 보안 검토 P2) ─────────────────────────────
// Secret 이 새거나 확인 모드(observe)면 위조 요청으로 남의 카카오 id(4001)를 자기 채팅 계정에 심을 수 있다(provider skill). 피해자의 다음 방 기록이
// 그 계정 앞으로 잇기 제안을 만들고, 공격자가 자기 카카오(3001)로 웹 로그인해 확인하면 V22.9.117 첫 초안은 피해자의 방 기록 계정을 이었다(공격자
// 브라우저가 피해자 계정 세션을 받음, 빈 공격자 계정은 확인도 없이). 이제 그 별칭은 후보가 아니다. 운영은 enforce 라 위조 요청은 막힌다(마지막 장면).
for (const attackerEmpty of [true, false]) {
  await linkFixture(async (fx, server) => {
    fx.env.KAKAO_SKILL_AUTH_MODE = "observe";
    const label = attackerEmpty ? "7 (공격자 계정 빔)" : "7 (공격자 계정에 기록)";
    await say(fx, "커피 4100", { user: "bot-victim-v117" });
    const victim = userByKey(fx, "bot-victim-v117")?.id;
    let attacker;
    if (attackerEmpty) {
      attacker = "user-attacker-v117";
      fx.db.users.push({ id: attacker, kakao_user_key: "bot-attacker-v117", nickname: "공격자", created_at: "2026-10-01T00:00:00.000Z" });
      await say(fx, "이번 달 요약", { user: "bot-attacker-v117", appUserId: "3001" });
    } else {
      await say(fx, "커피 1000", { user: "bot-attacker-v117", appUserId: "3001" });
      attacker = userByKey(fx, "bot-attacker-v117")?.id;
    }
    await say(fx, "이번 달 요약", { user: "bot-attacker-v117", appUserId: "4001" }, { secret: false });
    const planted = links(fx)["kakao_login:4001"];
    ok(victim && attacker && planted?.user_id === attacker && planted?.provider === "skill", `${label} 준비: 위조 요청이 kakao_login:4001(피해자 카카오 id)을 공격자 채팅 계정에 심는다(provider skill)`);
    await say(fx, "점심 8100", { user: "bot-victim-v117", appUserId: "4001" });
    ok(offers(fx)[attacker]?.chat_user_id === victim && offers(fx)[attacker]?.kakao_hash === offerHash("4001"), `${label} 준비: 피해자의 방 기록이 공격자 계정 앞으로 잇기 제안을 만든다`);
    const merges = server.merges.length;
    const jar = new Jar();
    const login = await kakaoLogin(fx, jar, server, "3001", { ua: CHROME });
    eq(jar.user(), attacker, `${label} 준비: 공격자는 자기 카카오(3001)로 웹 로그인한다`);
    ok(login.callback.location !== "/my/account-link/run" && !jar.has("ab_account_link"), `${label} 로그인 콜백은 합치기 표를 주지 않는다 (${login.callback.location})`);
    const { callback } = await confirmWith(fx, jar, server, "3001");
    eq(callback.location, "/my/account-link?err=kakao_offer_unverified", `${label} 확인 화면에서 자기 카카오로 확인해도 잇지 않는다(심은 별칭은 믿지 않는다)`);
    const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
    ok(run.location !== "/my?msg=account_linked" && server.merges.length === merges, `${label} 합치지 않는다`);
    eq(jar.user(), attacker, `${label} 공격자 브라우저는 피해자 계정 세션을 받지 않는다`);
    ok(memberships(fx, victim).length > 0 && fx.db.transactions.some((row) => row.user_id === victim), `${label} 피해자의 방 기록 계정은 그대로다`);
  });
}
await linkFixture(async (fx) => {
  // enforce(운영 /ready: skill_caller_auth.mode=enforce): Secret 없는 요청은 처음부터 막혀 별칭이 심기지 않는다.
  await say(fx, "커피 4100", { user: "bot-victim-v117e" });
  await say(fx, "이번 달 요약", { user: "bot-attacker-v117e", appUserId: "4002" }, { secret: false });
  ok(!links(fx)["kakao_login:4002"] && !userByKey(fx, "bot-attacker-v117e"), "7 enforce: Secret 없는 요청은 계정·별칭을 만들지 못한다");
});

// ── 8. 확인한 뒤 제안의 방 기록 계정이 바뀌면 합치지 않는다(확인 표에 방 기록 계정을 묶음, 독립 보안 검토 P3) ─────────────
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "8");
  const chat = await roomAccountWithOffer(fx, "bot-v117-swap", "8");
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const { callback } = await confirmWith(fx, jar, server, "2265");
  eq(callback.location, "/my/account-link/run", "8 준비: 확인을 받는다");
  const proof = await readPurposeToken(fx.env, "account-link", decodeURIComponent(jar.get("ab_account_link")));
  eq(proof?.c, chat, "8 확인 표에 제안의 방 기록 계정이 묶인다");
  fx.db.users.push({ id: "user-swap-v117", kakao_user_key: "bot-swap-v117", nickname: "다른 방 기록 계정", created_at: "2026-10-01T00:00:00.000Z" });
  putSetting(fx, OFFERS_KEY, { ...offers(fx), "user-bin": { ...offers(fx)["user-bin"], chat_user_id: "user-swap-v117" } });
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my", "8 그 사이 제안이 다른 방 기록 계정으로 바뀌었으면 합치지 않고 가계부로 간다");
  eq(server.merges.length, base, "8 합치지 않는다");
  ok(!jar.has("ab_account_link"), "8 확인 표를 지운다");
});

// ── 9. 웹 로그인 사용자 키 꼴의 위조 봇 키로 만든 계정으로도 받지 않는다(보안 검토 뒤 Claude 재시험) ─────────────────────────────
// Secret 이 새면 위조 요청이 봇 키를 웹 로그인 사용자 키 꼴(kakao_login:4001, 피해자 카카오 id)로 보내 새 채팅 계정을 만들 수 있다(봇 키 모양은 검사하지
// 않는다 — V117:L-10, 남음). 그 계정의 사용자 키는 웹 로그인처럼 보여서, 사용자 키를 믿던 보안 수정 첫 판은 피해자의 다음 방 기록이 그 계정 앞으로 만든
// 제안을 공격자가 자기 카카오(3001, 위조 요청이 쓴 별칭으로 그 계정에 묶임)로 확인하게 해 피해자의 방 기록 계정을 이었다. 이제 사용자 키는 믿지 않고,
// 방금 확인한 카카오 id 도 그 웹 계정의 믿는 카카오 로그인(강한 식별·웹 로그인·관리자 통합 별칭)이어야 한다. 피해자가 웹에서 4001 로 로그인해 강한 식별이
// 그 계정으로 간 모양에서도(한 계정의 강한 식별은 하나라 3001 은 단톡방 요청 별칭으로만 남는다) 받지 않는다.
await linkFixture(async (fx, server) => {
  await say(fx, "커피 4100", { user: "bot-victim-v117k" });
  const victim = userByKey(fx, "bot-victim-v117k")?.id;
  await say(fx, "커피 1000", { user: "kakao_login:4001", appUserId: "3001" });
  const squat = userByKey(fx, "kakao_login:4001")?.id;
  ok(victim && squat && links(fx)["kakao_login:3001"]?.user_id === squat && links(fx)["kakao_login:3001"]?.provider === "skill", "9 준비: Secret 이 샌 위조 요청(봇 키 kakao_login:4001)이 새 채팅 계정을 만들고 공격자 카카오(3001) 별칭이 그쪽을 가리킨다");
  await say(fx, "점심 8100", { user: "bot-victim-v117k", appUserId: "4001" });
  ok(offers(fx)[squat]?.chat_user_id === victim && offers(fx)[squat]?.kakao_hash === offerHash("4001"), "9 준비: 피해자의 방 기록이 그 계정 앞으로 잇기 제안을 만든다");
  const merges = server.merges.length;
  const jar = new Jar();
  const login = await kakaoLogin(fx, jar, server, "3001", { ua: CHROME });
  eq(jar.user(), squat, "9 준비: 공격자는 자기 카카오(3001)로 그 계정에 웹 로그인한다");
  ok(login.callback.location !== "/my/account-link/run" && !jar.has("ab_account_link"), `9 로그인 콜백은 합치기 표를 주지 않는다 (${login.callback.location})`);
  const first = await confirmWith(fx, jar, server, "3001");
  eq(first.callback.location, "/my/account-link?err=kakao_offer_unverified", "9 사용자 키(kakao_login:4001)만으로는 제안의 카카오 id 를 그 계정 것으로 믿지 않는다");
  const strong = fx.db.accountbook_user_identities.find((row) => row.user_id === squat && row.provider === "kakao");
  if (strong) strong.provider_subject = "4001";
  else fx.db.accountbook_user_identities.push({ user_id: squat, provider: "kakao", provider_subject: "4001", login_name: "", credential_version: 2 });
  const second = await confirmWith(fx, jar, server, "3001");
  eq(second.callback.location, "/my/account-link?err=kakao_offer_unverified", "9 제안의 카카오 id 가 그 계정의 강한 식별이어도, 방금 확인한 카카오 id(3001)가 단톡방 요청 별칭뿐이면 받지 않는다");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  ok(run.location !== "/my?msg=account_linked" && server.merges.length === merges, "9 합치지 않는다");
  eq(jar.user(), squat, "9 공격자 브라우저는 피해자 계정 세션을 받지 않는다");
  ok(memberships(fx, victim).length > 0 && fx.db.transactions.some((row) => row.user_id === victim), "9 피해자의 방 기록 계정은 그대로다");
});

await linkFixture(async (fx, server) => {
  // 공격자의 웹 계정(카카오 3001 웹 로그인으로 생긴 모양: 사용자 키 + 강한 식별).
  fx.db.users.push({ id: "user-attacker-web-v117", kakao_user_key: "kakao_login:3001", nickname: "공격자 웹", created_at: "2026-10-01T00:00:00.000Z" });
  fx.db.accountbook_user_identities.push({ user_id: "user-attacker-web-v117", provider: "kakao", provider_subject: "3001", login_name: "", credential_version: 2 });
  await say(fx, "커피 4100", { user: "bot-victim-v117m" });
  const victim = userByKey(fx, "bot-victim-v117m")?.id;
  // Secret 이 샌 위조 요청: 봇 키 kakao_login:4001(피해자 카카오 id)로 새 채팅 계정, 다음 요청에 자기 카카오 3001 을 실어 자기 웹 계정 앞 잇기 제안.
  await say(fx, "커피 1000", { user: "kakao_login:4001" });
  const squat = userByKey(fx, "kakao_login:4001")?.id;
  await say(fx, "이번 달 요약", { user: "kakao_login:4001", appUserId: "3001" });
  ok(victim && squat && offers(fx)["user-attacker-web-v117"]?.chat_user_id === squat, "9b 준비: 위조 키 계정 → 공격자 웹 계정 잇기 제안(공격자 자기 카카오 3001)");
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "3001", { ua: CHROME });
  if (jar.has("ab_account_link")) await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  else { const { callback } = await confirmWith(fx, jar, server, "3001"); if (callback.location === "/my/account-link/run") await go(fx, jar, "/my/account-link/run", { ua: CHROME }); }
  eq(jar.user(), squat, "9b 준비: 같은 카카오(3001)로 확인한 V22.9.91 잇기가 두 공격자 계정을 합친다(주 계정 = 기록 있는 위조 키 계정)");
  ok(links(fx)["kakao_login:4001"]?.user_id === squat && links(fx)["kakao_login:4001"]?.provider === "identity_merge", "9b 준비: 합치기가 위조 사용자 키를 kakao_login:4001 별칭(provider identity_merge)으로 남긴다");
  await say(fx, "점심 8100", { user: "bot-victim-v117m", appUserId: "4001" });
  ok(offers(fx)[squat]?.chat_user_id === victim && offers(fx)[squat]?.kakao_hash === offerHash("4001"), "9b 준비: 피해자의 방 기록이 공격자 계정 앞으로 잇기 제안을 만든다");
  const merges = server.merges.length;
  const { callback } = await confirmWith(fx, jar, server, "3001");
  eq(callback.location, "/my/account-link?err=kakao_offer_unverified", "9b 관리자 통합·계정 잇기가 쓴 별칭(identity_merge)으로는 제안의 카카오 id 를 믿지 않는다");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  ok(run.location !== "/my?msg=account_linked" && server.merges.length === merges, "9b 합치지 않는다");
  eq(jar.user(), squat, "9b 공격자 브라우저는 피해자 계정 세션을 받지 않는다");
  ok(memberships(fx, victim).length > 0 && fx.db.transactions.some((row) => row.user_id === victim), "9b 피해자의 방 기록 계정은 그대로다");
});

// ── 10. 관리자 통합만으로 붙은 둘째 카카오 로그인(별칭 provider identity_merge)은 다른 카카오 로그인 확인을 받지 않는다 — 다시 확인 단추로 그 카카오
// 계정에 직접 로그인하면 잇는다(예전 V22.9.91 규칙 그대로). 운영자 계정은 이 모양이 아니다(둘째 별칭이 옛 웹 로그인 것).
await linkFixture(async (fx, server) => {
  const base = await twoKakaoLoginWebAccount(fx, server, "10", { legacyAlias: false });
  const chat = await roomAccountWithOffer(fx, "bot-v117-merge-only", "10");
  const jar = new Jar();
  await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
  const { callback } = await confirmWith(fx, jar, server, "2265");
  eq(callback.location, "/my/account-link?err=kakao_offer_unverified", "10 관리자 통합만으로 붙은 별칭으로는 다른 카카오 로그인(2265) 확인을 받지 않는다");
  const page = await go(fx, jar, "/my/account-link?err=kakao_offer_unverified", { ua: CHROME });
  ok(page.html.includes(UNVERIFIED_TEXT) && page.html.includes('<input type="hidden" name="relogin" value="1"/>'), "10 안내와 다시 확인 단추(prompt=login)가 보인다");
  eq(server.merges.length, base, "10 아직 합치지 않는다");
  const relogin = await confirmWith(fx, jar, server, "2266", { form: { relogin: "1" } });
  eq(new URL(relogin.start.location).searchParams.get("prompt"), "login", "10 다시 확인은 카카오 로그인 화면을 새로 띄운다");
  eq(relogin.callback.location, "/my/account-link/run", "10 제안의 카카오 계정(2266)으로 직접 확인하면 받는다");
  const run = await go(fx, jar, "/my/account-link/run", { ua: CHROME });
  eq(run.location, "/my?msg=account_linked", "10 합친다");
  ok(server.merges.length === base + 1 && server.merges.at(-1)?.p_primary_user_id === chat && server.merges.at(-1)?.p_secondary_user_id === "user-bin", "10 주 계정 = 방 기록 계정");
});

// ── 11. (V22.9.121) 계정 잇기로 합칠 때도 설정 줄(후원자 표시·안내 확인 기록) 옮기기는 합치기 뒤처리의 맨 끝이고, 잇기 경로는 합친 뒤 DB 를 쓰지
// 않는다(독립 검토 V22.9.121 3차 P3: 관리자 통합 경로에만 검사가 있었다). 옮기기는 요청 예산의 남은 호출만 쓰므로, 부르는 쪽이 그 뒤에 DB 를 쓰면
// 그 호출이 예산에 밀릴 수 있다. 답 뒤 일(waitUntil)은 약속을 모아 다 끝날 때까지 기다린 뒤 가로채기를 푼다(4차 P3). 옮기기 호출은 네 키를 한 번에
// 읽는 줄과 예상한 키의 쓰기로만 고른다 — 그 밖의 설정 읽기·쓰기는 ‘다른 호출’ 로 센다(4차 P3). 빈 방 기록 계정(보조)에 후원자 표시·확인 기록이
// 있고, 웹 계정(주)에 확인 기록이 없을 때(옮김, 11a)와 있을 때(그대로, 11b) 둘 다 본다.
for (const primaryConsent of [false, true]) {
  const label = primaryConsent ? "11b" : "11a";
  await linkFixture(async (fx, server) => {
    const base = await twoKakaoLoginWebAccount(fx, server, label);
    const chat = await roomAccountWithOffer(fx, `bot-v121-carry-${label}`, label, { empty: true });
    const jar = new Jar();
    await kakaoLogin(fx, jar, server, "2265", { ua: CHROME });
    const { callback } = await confirmWith(fx, jar, server, "2265");
    eq(callback.location, "/my/account-link/run", `${label} 확인 화면에서 2265 로 확인하면 받는다`);
    // 설정 줄은 잇기 직전에 둔다(앞의 로그인·확인 단계가 건드리지 않게).
    const supporter = JSON.stringify({ since: "2026-06-01", until: null, note: "QA 송금", public_name: "방 기록" });
    const consent = JSON.stringify({ version: "2026-11-13", at: "2026-07-02T00:00:00.000Z", via: "kakao" });
    const primaryConsentValue = JSON.stringify({ version: "2026-11-13", at: "2026-07-05T00:00:00.000Z", via: "web" });
    putSetting(fx, `supporter:${chat}`, supporter);
    putSetting(fx, `consent:${chat}`, consent);
    const kept = fx.db.accountbook_settings.findIndex((row) => row.key === "consent:user-bin");
    if (kept >= 0) fx.db.accountbook_settings.splice(kept, 1);
    if (primaryConsent) putSetting(fx, "consent:user-bin", primaryConsentValue);
    const origin = new URL(fx.env.SUPABASE_URL).origin;
    const log = [];
    const pending = [];
    const ctx = { waitUntil(promise) { pending.push(Promise.resolve(promise).catch(() => {})); }, passThroughOnException() {} };
    const restore = intercept(async ({ url, method, init }) => {
      if (url.origin === origin) log.push({ method, decoded: decodeURIComponent(`${url.pathname}${url.search}`), body: typeof init?.body === "string" ? init.body : "" });
      return null;
    });
    let run;
    try {
      run = await go(fx, jar, "/my/account-link/run", { ua: CHROME, ctx });
      for (let round = 0; round < 5; round += 1) {
        const seen = pending.length;
        await Promise.allSettled(pending);
        await new Promise((resolve) => setTimeout(resolve, 0));
        if (pending.length === seen) break;
      }
    } finally {
      restore();
    }
    eq(run.location, "/my?msg=account_linked", `${label} 합치고 가계부로 간다`);
    ok(server.merges.length === base + 1 && server.merges.at(-1)?.p_primary_user_id === "user-bin" && server.merges.at(-1)?.p_secondary_user_id === chat, `${label} 빈 방 기록 계정(보조)을 웹 계정(주)으로 합친다`);
    eq(jar.user(), "user-bin", `${label} 이 브라우저의 세션은 웹 계정 그대로(잇기 응답의 쿠키, 4번 장면과 같음)`);
    const carryKeys = ["supporter:user-bin", `supporter:${chat}`, "consent:user-bin", `consent:${chat}`];
    const writeKeys = primaryConsent ? ["supporter:user-bin"] : ["supporter:user-bin", "consent:user-bin"];
    const bodyKey = (row) => { try { return String(JSON.parse(row.body || "{}")?.key || ""); } catch (_) { return ""; } };
    const isCarry = (row) => (row.method === "GET" && row.decoded.startsWith("/rest/v1/accountbook_settings?key=in.(") && carryKeys.every((key) => row.decoded.includes(key)))
      || (row.method === "POST" && row.decoded === "/rest/v1/accountbook_settings?on_conflict=key" && writeKeys.includes(bodyKey(row)))
      || (row.method === "DELETE" && row.decoded === `/rest/v1/accountbook_settings?key=eq.supporter:${chat}`);
    const mergeAt = log.findIndex((row) => row.decoded.startsWith("/rest/v1/rpc/accountbook_merge_users_v227"));
    const firstCarryAt = log.findIndex(isCarry);
    const lastOtherAt = log.map((row, index) => (isCarry(row) ? -1 : index)).filter((index) => index >= 0).at(-1) ?? -1;
    const carry = log.filter(isCarry);
    const expected = 1 + writeKeys.length + 1;
    ok(mergeAt >= 0 && firstCarryAt > mergeAt && firstCarryAt > lastOtherAt && carry.length === expected && carry[0].method === "GET",
      `${label} 설정 줄 옮기기 호출(읽기 1 + 쓰기 ${expected - 1})은 합치기 RPC 와 다른 모든 DB 호출 뒤(맨 끝)다 — 잇기 경로는 합친 뒤 답 뒤 일까지 DB 를 쓰지 않는다: 합치기 ${mergeAt} · 옮기기 첫 호출 ${firstCarryAt} · 다른 마지막 호출 ${lastOtherAt} · 옮기기 ${carry.length}회`);
    ok(log.length <= 50, `${label} 잇기 한 요청의 DB 호출은 한도(50) 안이다 (${log.length}회)`);
    ok(JSON.parse(settingValue(fx, "supporter:user-bin") || "null")?.since === "2026-06-01" && settingValue(fx, `supporter:${chat}`) === undefined,
      `${label} 후원자 표시가 웹 계정(주)으로 옮겨지고 방 기록 계정 줄은 지워진다`);
    ok(primaryConsent ? settingValue(fx, "consent:user-bin") === primaryConsentValue && settingValue(fx, `consent:${chat}`) === consent : settingValue(fx, "consent:user-bin") === consent,
      `${label} 안내 확인 기록은 웹 계정에 없을 때만 옮긴다(웹 계정에 ${primaryConsent ? "있음 → 그대로, 방 기록 계정 줄도 그대로" : "없음 → 옮김"}): 주 ${settingValue(fx, "consent:user-bin")} · 보조 ${settingValue(fx, `consent:${chat}`)} · 옮기기 ${carry.map((row) => `${row.method} ${row.decoded.slice(0, 60)}`).join(" | ")}`);
  });
}

if (SOFT) {
  console.log(`soft failures: ${softFailures.length}`);
  for (const item of softFailures) console.log(`✗ ${item}`);
  if (softFailures.length) process.exitCode = 1;
}
t.done();
