// 방 전용 보기: 단톡방 링크 단추의 식별 값으로 확인된 구성원을 로그인 화면 없이 들이되, 그 방 가계부 하나만·보기 전용으로.
//  사용자(2026-11-18): "해당 단톡방에 가계부는 맴버들이 입장할 수 있도록 해야해 다른 가계부 막 들어가는게 아니라 해당 단톡방에서만 해당 단톡방 가계부를
//  로그인 없이 입장할 수 있도록" → 물음에 "구성원 본인으로, 그 방만 보기 전용".
//  R-1 세션 표의 넷째 칸(r:<가계부 번호>): 12시간, 번호는 UUID 모양만, 칸을 떼거나 바꾸면 서명이 맞지 않는다, 끄는 스위치(KAKAO_ROOM_VIEW_DISABLED).
//  R-2 주는 곳: 식별 값이 붙어 온 길에서 주소 값으로는 온전한 세션을 주지 않던 구성원(웹 계정에 이어진 사람·강한 식별이 붙은 사람)뿐이다.
//      카카오톡 안의 브라우저에서 카카오 로그인이 있는 계정은 예전 그대로(인앱 자동 로그인), 채팅으로만 쓰는 계정도 예전 그대로(온전한 세션).
//      승인 대기·이용 제한·구성원 아님·온전한 세션이 있는 브라우저·관리자 쿠키 브라우저에는 주지 않는다.
//  R-3 받은 브라우저: 홈·목록·달력·분석·예산 현황과 그 조회 API 의 GET 에서만 세션이다. 열리는 것은 늘 그 방 가계부(다른 번호를 적어도, 기억 쿠키가
//      달라도)이고 역할은 조회 전용이다. 같은 사람의 다른 가계부 이름·기록은 어느 화면에도 나오지 않는다. 화면 맨 위에 안내 띠가 붙는다.
//  R-4 그 밖의 모든 요청(다른 주소의 GET, 모든 POST)은 로그인하지 않은 사람의 요청과 응답이 같다(화면 요청이 로그인 화면으로 보내지면 그 방 가계부
//      홈으로 돌려보내 띠에서 알린다). 저장소의 기록·가계부·구성원·계정 줄은 하나도 바뀌지 않는다.
//  R-5 다른 방의 단추를 누르면 그 방으로 다시 정한다(같은 사람이면 바로, 다른 사람의 방 전용 세션은 앱에서 바로 연 이동일 때만).
//  R-6 역할 읽기·가계부 목록은 관문과 따로 범위를 지킨다(범위 밖 가계부 = 구성원 아님, 범위 안 = 조회 전용, 초대코드 없음).
//  R-7 방 전용 세션은 만료·세션 판 올림·로그아웃으로 끝난다. 로그인 화면과 카카오 로그인 길에서는 세션이 없는 사람으로 다뤄진다(계정 잇기 불가).
//  R-8 독립 검토 1 반영: 다른 방의 표식(/my?room=<다른 가계부>)은 방 전용 세션으로 받지 않는다(로그인 화면이 그 방으로 돌아올 주소를 갖는다 — 먼저 받은
//      방의 가계부가 그 방인 것처럼 열리지 않는다). 같은 방의 단추를 다시 누르면 표를 새로 받는다(12시간이 다시 시작). 세션 확인을 못 한 요청에는 주지
//      않는다(온전한 세션 쿠키를 덮어쓰지 않는다). 띠는 방 전용 세션으로 그린 화면에만 붙는다(세션이 끝난 뒤의 로그인 화면에는 없다). 허용 화면의 GET 은
//      설정 표에도 쓰지 않고 세션을 다시 주지도 않는다. 카카오 로그인을 하면 온전한 세션으로 바뀐다.
//  R-9 독립 검토 2 반영: 가계부에서 조회 전용인 구성원에게는 ‘로그인하면 기록할 수 있어요’ 라고 하지 않는다. 범위의 가계부를 읽을 수 없게 된 방 전용 세션
//      (승인 대기로 바뀜·내보내짐)은 띠를 붙이는 대신 끝낸다. 방 전용 세션을 뗀 요청은 인앱 자동 로그인으로 보내지 않는다. 다른 방의 단추에서 다시 정하지
//      못하면 들고 있던 방 전용 세션을 끝낸다(앱에서 바로 연 이동일 때만). 허용 화면·조회 API 에 구성원의 카카오 채팅 키·방 키가 실리지 않는다.
//      다른 쿠키(포인트 색·자동 로그인 되풀이 막기·설정 띠)가 있는 브라우저에서도 허용 밖의 요청은 로그인하지 않은 사람과 같다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-18 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 기능이 없는 판)에서는 R-1~R-7 의 단언 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { app, BASE, counter, failure, fixture, intercept, withClock } from "./lib-audit-v22934.mjs";

const sessionModule = await import("../src/modules/auth/user-session.js");
const rowsModule = await import("../src/modules/data/households-members-rows.js");
const rolesModule = await import("../src/modules/domain/users-households.js");
const usersModule = await import("../src/modules/data/users-household-create.js");
const roomModule = await import("../src/modules/auth/kakao-room-open.js");

const { ok, eq, done } = counter("방 전용 보기: 식별된 구성원을 그 방 가계부만·보기 전용으로(세션 범위·관문·역할·목록) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hex66 = (label) => createHash("sha256").update(`v229130-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229130-room-only-view-secret";
const DAY = "2026-11-18";
const ROOM = hex66("room-a");
const ROOM_B = hex66("room-b");
const U1 = hex66("user-1"); // ROOM 의 첫 호출자(소유자)
const U2 = hex66("user-2"); // ROOM 의 구성원
const U3 = hex66("user-3"); // ROOM_B 의 첫 호출자
const U_ALIAS = hex66("user-alias"); // 웹 계정(user-wifi)에 이어진 채팅 키
const INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const HOME_HOUSEHOLD_NAME = "우리집 생활비"; // 픽스처: user-wifi 가 구성원인 다른 가계부(house-home)
const WORD_A1 = "별빛국수", WORD_A2 = "달빛라떼", WORD_B = "은하택배", WORD_HOME = "다른집비밀기록"; // 방 A 의 기록 둘, 방 B 의 기록, 다른 가계부의 기록(모두 화면의 예시 글에 없는 낱말)
const WORD_FAV = "다른집즐겨찾기", WORD_GOAL = "다른집목표"; // 다른 가계부(house-home)에 둔 즐겨찾기·목표
const HOME_ONLY_WORDS = [WORD_HOME, WORD_FAV, WORD_GOAL, "주말 장보기", "가족 카페", "7월 월급", "HOME2265"]; // 그 가계부에만 있는 기록·즐겨찾기·목표·초대코드
const WEB_USER = "user-wifi";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
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
  await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
}

// 브라우저 한 번의 요청(따라가지 않는다). 쿠키는 통(jar)에 모은다.
class Jar {
  constructor(from = null) { this.items = new Map(from ? from.items : []); }
  take(lines) {
    for (const line of lines) {
      const [pair, ...attrs] = line.split(";").map((item) => item.trim());
      const at = pair.indexOf("=");
      const name = pair.slice(0, at), value = pair.slice(at + 1);
      const maxAge = attrs.find((item) => /^max-age=/i.test(item));
      if (!value || (maxAge && Number(maxAge.split("=")[1]) <= 0)) this.items.delete(name); else this.items.set(name, value);
    }
  }
  header() { return [...this.items].map(([name, value]) => `${name}=${value}`).join("; "); }
  token() { const raw = this.items.get("ab_user") || ""; return raw ? decodeURIComponent(raw) : ""; }
  parts() { const token = this.token(); return token ? token.slice(0, token.lastIndexOf(".")).split("|") : []; }
  user() { return this.parts()[0] || ""; }
  scope() { return (this.parts()[3] || "").replace(/^r:/, ""); }
}
// site: Sec-Fetch-Site 머리. 기본 "none" = 사람이 바로 연 이동. "" 이면 머리를 보내지 않는다.
async function send(fx, method, path, { ua = PC, jar = null, headers = {}, site = "none", body = null, accept = "text/html" } = {}) {
  const jobs = [];
  const line = jar ? jar.header() : "";
  const post = method !== "GET" && method !== "HEAD";
  const requestHeaders = {
    "user-agent": ua, accept,
    ...(post ? { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" } : { "sec-fetch-mode": "navigate", ...(site ? { "sec-fetch-site": site } : {}) }),
    ...(line ? { cookie: line } : {}), ...headers,
  };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { method, headers: requestHeaders, ...(post ? { body: new URLSearchParams(body || {}).toString() } : {}) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (jar) jar.take(cookies);
  return { status: response.status, location: response.headers.get("location") || "", cookies, type: response.headers.get("content-type") || "", html: await response.text() };
}
const go = (fx, path, options = {}) => send(fx, "GET", path, options);
const tapped = (path, { user = U1, room = ROOM } = {}) => {
  const url = new URL(path, BASE);
  if (user !== null) url.searchParams.set("botUserKey", user);
  url.searchParams.set("appUserId", "1801267359");
  if (room !== null) url.searchParams.set("botGroupKey", room);
  return `${url.pathname}${url.search}`;
};
const issuesSession = (cookies) => cookies.some((line) => /^ab_user=[^;]/.test(line));
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const lastRoomOpen = () => events("kakao_room_open").at(-1)?.detail || "";
const entryPath = (householdId) => `/my?room=${householdId}`;
const strongKakao = (userId) => ({ id: `ident-v229130-${userId}`, user_id: userId, provider: "kakao", provider_subject: "9130001", created_at: `${DAY}T01:00:00Z` });
const strongLocal = (userId) => ({ id: `ident-v229130-local-${userId}`, user_id: userId, provider: "local", provider_subject: "v229130room", credential_hash: "a".repeat(64), credential_salt: "b".repeat(32), credential_iterations: 100000, created_at: `${DAY}T01:00:00Z` });

// 방 둘(ROOM = U1 소유·U2 구성원, ROOM_B = U3 소유)과, 웹 계정 user-wifi(픽스처에서 ‘우리집 생활비’ 의 구성원)를 ROOM 의 가계부 구성원으로 두고
// 채팅 키 U_ALIAS 를 그 웹 계정에 잇는다(별칭). alsoB 면 user-wifi 를 ROOM_B 의 가계부에도 넣는다.
// 장면 하나가 중간에 멈춰도(바탕 코드에는 방 전용 세션이 없어 준비 단계에서 멈춘다) 검사 전체가 죽지 않고 그 장면의 실패로 적힌다.
async function roomFixture(task, options = {}) {
  try { return await roomFixtureRaw(task, options); } catch (error) { failures.push(`장면이 끝까지 가지 못함: ${String(error?.message || error).split(/\r?\n/)[0].slice(0, 200)}`); return undefined; }
}
async function roomFixtureRaw(task, { alsoB = false, role = "member" } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
    delete fx.env.KAKAO_ROOM_QUIET_LOGIN;
    try {
      await say(fx, `${WORD_A1} 12000원`, { user: U1, room: ROOM });
      await say(fx, `${WORD_A2} 4500원`, { user: U2, room: ROOM });
      await say(fx, `${WORD_B} 8000원`, { user: U3, room: ROOM_B });
      // 같은 사람의 다른 가계부(house-home)에 같은 달의 기록을 하나 둔다 — 범위가 새면 홈·목록·API 에 이 낱말이 보인다.
      // 같은 사람의 다른 가계부에 즐겨찾기(가계부·사람 단위)와 목표(가계부 단위)도 둔다(독립 검토 1 P2 — 조회 API 가 범위 밖의 것을 내면 잡힌다).
      fx.db.accountbook_settings.push({ key: `favorites:v5:house-home:${WEB_USER}`, value: JSON.stringify([{ id: "fav-v229130-other", type: "expense", amount: 5100, category: "기타", memo: WORD_FAV, payment_method: "카드", transaction_date: DAY, month: DAY.slice(0, 7) }]) });
      fx.db.accountbook_settings.push({ key: "goals:v5:house-home", value: JSON.stringify([{ id: "goal_v229130_other", name: WORD_GOAL, emoji: "🎯", target: 1000000, saved: 0 }]) });
      fx.db.transactions.push({ id: "tx-v229130-other", household_id: "house-home", user_id: WEB_USER, transaction_date: DAY, type: "expense", amount: 7700, category: "기타", memo: WORD_HOME, payment_method: "카드", created_at: `${DAY}T02:00:00Z`, updated_at: `${DAY}T02:00:00Z` });
      const u1 = userByKey(fx, U1), u2 = userByKey(fx, U2), u3 = userByKey(fx, U3);
      const ownerOf = (userId) => fx.db.households.find((row) => fx.db.household_members.some((m) => m.user_id === userId && m.household_id === row.id && m.role === "owner") && row.name === ROOM_HOUSEHOLD_NAME);
      const household = ownerOf(u1?.id), householdB = ownerOf(u3?.id);
      if (!u1 || !u2 || !u3 || !household || !householdB) throw new Error("room fixture not ready");
      if (!UUID.test(String(household.id)) || !UUID.test(String(householdB.id))) throw new Error(`room household id is not uuid-shaped: ${household.id}`);
      const links = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "user_identity_links")?.value || "{}");
      links[`skill_identity:${U_ALIAS}`] = { user_id: WEB_USER, source: "skill", linked_at: `${DAY}T01:00:00Z` };
      const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
      if (row) row.value = JSON.stringify(links); else fx.db.accountbook_settings.push({ key: "user_identity_links", value: JSON.stringify(links) });
      fx.db.household_members.push({ household_id: household.id, user_id: WEB_USER, role, created_at: `${DAY}T01:00:00Z` });
      if (alsoB) fx.db.household_members.push({ household_id: householdB.id, user_id: WEB_USER, role: "member", created_at: `${DAY}T01:10:00Z` });
      resetIsolateState();
      return await task(fx, { u1, u2, u3, hh: String(household.id), hhB: String(householdB.id) });
    } finally {
      resetIsolateState();
    }
  }));
}
// 웹 계정에 이어진 구성원이 PC 에서 방 단추를 눌러 받은 방 전용 세션.
async function roomViewJar(fx, { user = U_ALIAS, room = ROOM, path = "/my" } = {}) {
  const jar = new Jar();
  const opened = await go(fx, tapped(path, { user, room }), { ua: PC, jar });
  if (!jar.scope()) throw new Error(`no room view session: ${opened.status} ${opened.location} ${lastRoomOpen()}`);
  return jar;
}
const coreSnapshot = (fx) => JSON.stringify(["transactions", "households", "household_members", "users", "budgets", "accountbook_user_identities", "accountbook_user_security"].map((table) => fx.db[table] || []));
// 설정 표까지 넣은 모습(독립 검토 1 P2). 방 열기 진단 기록(누를 때마다 시각이 바뀐다)만 뺀다.
const settingsSnapshot = (fx) => JSON.stringify((fx.db.accountbook_settings || []).filter((row) => !String(row.key).startsWith("kakao_room_open_probe_v229105:")).map((row) => [row.key, row.value]).sort());
const hasAny = (text, words) => words.filter((word) => String(text).includes(word));

// ── R-1. 세션 표의 넷째 칸 ───────────────────────────────────────────────────
await roomFixture(async (fx, { u1, hh, hhB }) => {
  const make = sessionModule.makeUserSession;
  const full = await make(fx.env, u1.id);
  const scoped = await make(fx.env, u1.id, { roomViewHouseholdId: hh });
  const fullParts = full.slice(0, full.lastIndexOf(".")).split("|"), scopedParts = scoped.slice(0, scoped.lastIndexOf(".")).split("|");
  const now = Math.floor(Date.now() / 1000); // 세션 표의 만료는 실제 시계 기준이다(픽스처 시계는 기록 날짜에만 쓰인다)
  check(() => ok(fullParts.length === 3 && Math.abs(Number(fullParts[1]) - now - 14 * 86400) <= 5, `R-1 보통 세션은 예전 그대로 세 칸·14일(${fullParts.length}칸, ${Number(fullParts[1]) - now}초)`), "full token shape");
  check(() => ok(scopedParts.length === 4 && scopedParts[0] === u1.id && scopedParts[2] === fullParts[2] && scopedParts[3] === `r:${hh}`, `R-1 방 전용 세션은 네 칸(사용자·만료·세션 판·r:<가계부>): ${scopedParts.slice(2).join("|")}`), "scoped token shape");
  check(() => ok(Math.abs(Number(scopedParts[1]) - now - 12 * 3600) <= 5, `R-1 방 전용 세션의 수명은 12시간(${Number(scopedParts[1]) - now}초)`), "scoped token ttl");
  check(() => eq(sessionModule.ROOM_VIEW_SESSION_SECONDS_V229130, 12 * 3600, "R-1 수명 상수"), "ttl const");
  for (const [label, bad] of [["UUID 아님", "house-home"], ["대문자", hh.toUpperCase()], ["뒤에 글자", `${hh}x`], ["칸 나눔 글자", `${hh}|r:${hhB}`], ["빈칸 포함", ` ${hh}`]]) {
    let threw = false;
    try { await make(fx.env, u1.id, { roomViewHouseholdId: bad }); } catch (_) { threw = true; }
    check(() => ok(threw, `R-1 가계부 번호가 UUID 모양이 아니면 만들지 않는다(${label})`), `scope shape ${label}`);
  }
  // 쿠키로 받았을 때: 서명·모양이 맞아야만 방 전용으로 읽힌다.
  const readScope = async (token, env = fx.env) => sessionModule.roomViewSessionOfRequestV229130(new Request(`${BASE}/app`, { headers: { cookie: `ab_user=${encodeURIComponent(token)}` } }), env);
  const good = await readScope(scoped);
  check(() => ok(good && good.userId === u1.id && good.householdId === hh, "R-1 맞는 표는 { 사용자, 가계부 } 로 읽힌다"), "scope read");
  const fullRead = await readScope(full);
  check(() => eq(fullRead, null, "R-1 보통 세션은 방 전용이 아니다"), "full is not scoped");
  const sig = scoped.slice(scoped.lastIndexOf("."));
  const swapped = `${scopedParts.slice(0, 3).join("|")}|r:${hhB}${sig}`;
  const dropped = `${scopedParts.slice(0, 3).join("|")}${sig}`;
  const swappedRead = await readScope(swapped), extraRead = await readScope(`${scopedParts.join("|")}|r:${hhB}${sig}`), disabledRead = await readScope(scoped, { ...fx.env, KAKAO_ROOM_VIEW_DISABLED: "1" });
  check(() => eq(swappedRead, null, "R-1 가계부 번호를 바꾼 표는 서명이 맞지 않는다"), "scope swap rejected");
  check(() => eq(extraRead, null, "R-1 칸을 더 붙인 표는 받지 않는다"), "extra part rejected");
  check(() => eq(disabledRead, null, "R-1 스위치를 끈 운영은 방 전용 표를 받지 않는다"), "disabled rejects");
  // 넷째 칸을 뗀 표·바꾼 표로는 로그인되지 않는다(온전한 세션으로 올릴 수 없다).
  for (const [label, token] of [["넷째 칸을 뗀 표", dropped], ["가계부 번호를 바꾼 표", swapped]]) {
    const page = await go(fx, "/app", { headers: { cookie: `ab_user=${encodeURIComponent(token)}` } });
    check(() => ok(page.status === 303 && page.location.startsWith("/my"), `R-1 ${label}: 로그인되지 않는다(${page.status} ${page.location})`), `tampered ${label}`);
  }
  check(() => ok(/parts\.length !== 2 && parts\.length !== 3 && parts\.length !== 4/.test(read("src/modules/auth/user-session.js")), "원본: 세션 표는 둘·셋·넷 칸만 받는다"), "source parts");
});

// ── R-2. 주는 곳 ───────────────────────────────────────────────────────────
await roomFixture(async (fx, { u1, u2, hh }) => {
  // 웹 계정에 이어진 구성원, PC: 방 전용 세션 + 그 방 가계부 홈.
  const jar = new Jar();
  const open = await go(fx, tapped(entryPath(hh), { user: U_ALIAS }), { ua: PC, jar });
  check(() => ok(open.status === 303 && open.location === `/app?household_id=${hh}`, `R-2 PC 이어진 구성원: 그 방 가계부 홈으로(${open.status} ${open.location})`), "linked pc location");
  check(() => ok(jar.user() === WEB_USER && jar.scope() === hh && jar.parts().length === 4, `R-2 PC 이어진 구성원: 방 전용 세션(${jar.parts().slice(2).join("|")})`), "linked pc scoped");
  check(() => eq(lastRoomOpen(), "linked_room_view", "R-2 결과 linked_room_view"), "linked pc event");
  const line = open.cookies.find((cookie) => /^ab_user=/.test(cookie)) || "";
  check(() => ok(/Max-Age=43200\b/.test(line) && /HttpOnly/.test(line) && /Secure/.test(line) && /SameSite=Lax/.test(line) && /Path=\//.test(line), `R-2 쿠키: 12시간·HttpOnly·Secure·SameSite=Lax(${line.replace(/=[^;]+/, "=…")})`), "linked pc cookie attrs");
  for (const name of ["ab_hh", "ab_setup", "ab_bk", "ab_cs"]) check(() => ok(open.cookies.some((cookie) => new RegExp(`^${name}=;`).test(cookie) && /Max-Age=0/.test(cookie)), `R-2 ${name} 쿠키를 지운다`), `linked pc clears ${name}`);
  check(() => ok(!/botUserKey|botGroupKey|appUserId|room=/.test(open.location), "R-2 넘기는 주소에 카카오 값·방 표식이 없다"), "linked pc clean location");
  const probe = fx.db.accountbook_settings.find((row) => row.key === "kakao_room_open_probe_v229105:linked_room_view");
  check(() => ok(probe && Object.keys(typeof probe.value === "string" ? JSON.parse(probe.value) : probe.value).sort().join(",") === "app_version,at,version", "R-2 진단 기록: linked_room_view 에 시각·판만"), "linked pc probe");
  // 앞사람의 후원자 포인트 색 쿠키가 남아 있던 브라우저: 방 전용 세션을 주는 응답이 그 쿠키를 지운다(응답 마무리 — my/supporter-accent.js).
  const tinted = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, headers: { cookie: "ab_sp=1" } });
  check(() => ok(issuesSession(tinted.cookies) && tinted.cookies.some((line) => /^ab_sp=;/.test(line) || (/^ab_sp=/.test(line) && /Max-Age=0/.test(line))), "R-9 방 전용 세션을 줄 때 앞사람의 포인트 색 쿠키(ab_sp)를 지운다"), "clears accent cookie");
  // 카카오톡 안의 브라우저: 예전 그대로(세션 없음, 그 방 가계부 주소 → 인앱 자동 로그인이 맡는다).
  const inapp = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: INAPP });
  check(() => ok(inapp.status === 303 && inapp.location === `/app?household_id=${hh}` && !issuesSession(inapp.cookies) && lastRoomOpen() === "linked_account", `R-2 인앱 이어진 구성원: 예전 그대로(${inapp.location}, ${lastRoomOpen()})`), "linked inapp unchanged");
  // 채팅으로만 쓰는 구성원: 예전 그대로 온전한 세션(세 칸).
  const chat = new Jar();
  const chatOpen = await go(fx, tapped("/my", { user: U2 }), { ua: PC, jar: chat });
  check(() => ok(chatOpen.location === `/app?household_id=${hh}` && chat.user() === u2.id && chat.parts().length === 3 && lastRoomOpen() === "ok", `R-2 채팅 계정: 예전 그대로 온전한 세션(${chat.parts().length}칸, ${lastRoomOpen()})`), "chat only unchanged");
  // 카카오 로그인이 붙은 구성원: PC 는 방 전용, 인앱은 예전 그대로.
  fx.db.accountbook_user_identities.push(strongKakao(u1.id));
  const strongJar = new Jar();
  const strongPc = await go(fx, tapped("/my"), { ua: PC, jar: strongJar });
  check(() => ok(strongPc.location === `/app?household_id=${hh}` && strongJar.user() === u1.id && strongJar.scope() === hh && lastRoomOpen() === "strong_room_view", `R-2 PC 카카오 로그인 계정: 방 전용 세션(${strongPc.location}, ${lastRoomOpen()})`), "strong pc scoped");
  const strongInapp = await go(fx, tapped("/my"), { ua: INAPP });
  check(() => ok(strongInapp.location === `/app?household_id=${hh}` && !issuesSession(strongInapp.cookies) && lastRoomOpen() === "strong_account", `R-2 인앱 카카오 로그인 계정: 예전 그대로(${lastRoomOpen()})`), "strong inapp unchanged");
});
await roomFixture(async (fx, { u1, hh }) => {
  // 로그인 이름 비밀번호만 붙은 구성원: 자동 로그인이 닿지 않으므로 어느 브라우저에서나 방 전용.
  fx.db.accountbook_user_identities.push(strongLocal(u1.id));
  for (const [name, ua] of [["PC", PC], ["인앱", INAPP]]) {
    const jar = new Jar();
    const open = await go(fx, tapped("/my"), { ua, jar });
    check(() => ok(open.location === `/app?household_id=${hh}` && jar.user() === u1.id && jar.scope() === hh && lastRoomOpen() === "strong_local_room_view", `R-2 ${name} 로그인 이름 계정: 방 전용 세션(${open.location}, ${lastRoomOpen()})`), `strong local ${name}`);
  }
});
for (const role of ["pending", "blocked"]) {
  await roomFixture(async (fx) => {
    const open = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC });
    check(() => ok(!issuesSession(open.cookies) && !/room_view/.test(lastRoomOpen()), `R-2 ${role} 구성원에게는 방 전용 세션을 주지 않는다(${open.location}, ${lastRoomOpen()})`), `no view for ${role}`);
  }, { role });
}
await roomFixture(async (fx, { hh, hhB }) => {
  // 구성원이 아닌 방(ROOM_B)의 단추: 주지 않는다.
  const other = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC });
  check(() => ok(!issuesSession(other.cookies) && lastRoomOpen() === "not_member", `R-2 구성원이 아닌 방: 주지 않는다(${lastRoomOpen()})`), "no view for non member");
  // 온전한 세션(다른 계정 — 이 방 가계부를 못 읽음)이 있는 브라우저: 건드리지 않는다.
  const kept = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, headers: { cookie: fx.cookie } });
  check(() => ok(!issuesSession(kept.cookies) && lastRoomOpen() === "linked_other_session", `R-2 온전한 세션(다른 계정)이 있으면 그대로 둔다(${lastRoomOpen()})`), "full other kept");
  // 관리자 쿠키가 있는 브라우저: 열지 않는다.
  const admin = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, headers: { cookie: "ab_admin=x" } });
  check(() => ok(!issuesSession(admin.cookies) && lastRoomOpen() === "admin_browser", `R-2 관리자 쿠키 브라우저: 주지 않는다(${lastRoomOpen()})`), "admin browser");
  // 스위치를 끈 운영: 예전 길(방 표식 주소 → 로그인 화면), 이미 받은 표도 로그인되지 않은 것으로.
  const jar = await roomViewJar(fx);
  fx.env.KAKAO_ROOM_VIEW_DISABLED = "1";
  const off = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC });
  check(() => ok(off.location === entryPath(hh) && !issuesSession(off.cookies) && lastRoomOpen() === "linked_account", `R-2 스위치 끔: 예전처럼 방 표식 주소로(${off.location}, ${lastRoomOpen()})`), "disabled falls back");
  const offHome = await go(fx, `/app?household_id=${hh}`, { jar: new Jar(jar) });
  check(() => ok(offHome.status === 303 && offHome.location.startsWith("/my"), `R-2 스위치 끔: 이미 받은 방 전용 표는 로그인되지 않은 것(${offHome.status} ${offHome.location})`), "disabled invalidates");
  delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
  check(() => ok(hhB !== hh, "픽스처: 방 둘의 가계부가 다르다"), "fixture two rooms");
});

// ── R-3. 받은 브라우저에서 열리는 것 ────────────────────────────────────────
await roomFixture(async (fx, { hh, hhB }) => {
  const jar = await roomViewJar(fx);
  const before = coreSnapshot(fx), settingsBefore = settingsSnapshot(fx);
  const reissued = [];
  const home = await go(fx, `/app?household_id=${hh}`, { jar });
  check(() => ok(home.status === 200 && home.html.includes(ROOM_HOUSEHOLD_NAME), `R-3 홈이 열리고 그 방 가계부 이름이 보인다(${home.status})`), "home opens");
  check(() => ok(home.html.includes('id="abRoomViewBand"') && home.html.includes("방 전용 보기") && home.html.includes(">로그인</a>"), "R-3 홈 맨 위에 안내 띠와 [로그인]"), "home band");
  check(() => ok(!/<form[^>]*>(?:(?!<\/form>)[\s\S])*abRoomViewBand/.test(home.html) && !/id="abRoomViewBand"[\s\S]{0,900}<form/.test(home.html.slice(home.html.indexOf('id="abRoomViewBand"'), home.html.indexOf('id="abRoomViewBand"') + 900).replace(/<\/div>[\s\S]*$/, "</div>")), "R-3 띠에는 저장으로 이어지는 폼이 없다"), "band has no form");
  check(() => ok(!home.html.includes("abTermsBand"), "R-3 약관 안내 띠(저장 폼)는 붙지 않는다"), "no terms band");
  check(() => ok(home.html.includes("다른 화면을 열거나 내 권한대로 쓰려면 로그인해 주세요.") && !home.html.includes("기록은 단톡방에서 말로 남기고"), "R-9 띠의 말은 어느 역할에게나 맞다(기록할 수 있다고 약속하지 않는다)"), "band wording neutral");
  const keyLeaks = [];
  check(() => ok(!home.html.includes(HOME_HOUSEHOLD_NAME) && !home.html.includes("house-home") && hasAny(home.html, HOME_ONLY_WORDS).length === 0, `R-3 같은 사람의 다른 가계부 이름·번호·기록이 홈에 없다(${hasAny(home.html, HOME_ONLY_WORDS).join(",")})`), "home hides other household");
  check(() => ok(home.html.includes(WORD_A1) && home.html.includes(WORD_A2), "R-3 그 방의 기록(다른 구성원이 남긴 것 포함)이 보인다"), "home shows room records");
  check(() => ok(home.html.includes("방 전용 보기에서는 기록할 수 없어요.") && !home.html.includes("가계부 관리자에게 권한을 요청하세요") && !/<form[^>]+action="\/my\/transactions"/.test(home.html) && !home.html.includes('id="smartInput"'), "R-3 입력 칸 대신 ‘방 전용 보기에서는 기록할 수 없어요 … 로그인하면’ 안내가 나온다(관리자에게 요청하라는 말이 아니다)"), "home read only");
  check(() => ok(!home.cookies.some((cookie) => /^ab_hh=[^;]/.test(cookie)) && !issuesSession(home.cookies), "R-3 가계부 기억 쿠키를 새로 적지 않고 세션을 다시 주지도 않는다"), "home no memory cookie");
  // 번호를 안 적어도, 다른 번호를 적어도, 기억 쿠키가 다른 가계부를 가리켜도, 기억 머리를 꾸며 보내도 그 방 가계부다.
  const cases = [["번호 없음", "/app", {}], ["다른 가계부 번호", "/app?household_id=house-home", {}], ["다른 방 가계부 번호", `/app?household_id=${hhB}`, {}], ["꾸민 기억 머리", "/app?household_id=house-home", { headers: { "x-ab-household-memory": "1" } }]];
  for (const [label, path, options] of cases) {
    const page = await go(fx, path, { jar: new Jar(jar), ...options });
    check(() => ok(page.status === 200 && page.html.includes(ROOM_HOUSEHOLD_NAME) && page.html.includes(WORD_A1) && !page.html.includes(HOME_HOUSEHOLD_NAME) && !page.html.includes(WORD_B) && hasAny(page.html, HOME_ONLY_WORDS).length === 0, `R-3 ${label}: 그 방 가계부가 열린다(${page.status} ${page.location})`), `forced household ${label}`);
  }
  const remembered = new Jar(jar);
  remembered.items.set("ab_hh", "house-home");
  const stale = await go(fx, "/app", { jar: remembered });
  check(() => ok(stale.status === 200 && stale.html.includes(ROOM_HOUSEHOLD_NAME) && !stale.html.includes(HOME_HOUSEHOLD_NAME), `R-3 기억 쿠키가 다른 가계부여도 그 방 가계부(${stale.status} ${stale.location})`), "memory cookie ignored");
  const my = await go(fx, "/my", { jar: new Jar(jar) });
  check(() => ok(my.status === 303 && my.location.startsWith("/app?") && my.location.includes(`household_id=${hh}`), `R-3 /my 는 그 방 가계부 홈으로 보낸다(${my.location})`), "my redirects home");
  for (const path of ["/budgets", "/my/analysis", `/app?tab=transactions&household_id=${hh}`, `/app?view=calendar&household_id=${hh}`]) {
    const page = await go(fx, path, { jar: new Jar(jar) });
    if (issuesSession(page.cookies)) reissued.push(path);
    for (const [name, key] of [["U1", U1], ["U2", U2], ["이어진 키", U_ALIAS], ["방 키", ROOM]]) if (page.html.includes(key)) keyLeaks.push(`${path.split("?")[0]}:${name}`);
    check(() => ok(page.status === 200 && page.html.includes('id="abRoomViewBand"') && !page.html.includes(HOME_HOUSEHOLD_NAME) && hasAny(page.html, HOME_ONLY_WORDS).length === 0, `R-3 ${path.split("?")[0]}${path.includes("tab=") ? " 목록" : path.includes("view=") ? " 달력" : ""}: 열리고 띠가 붙고 다른 가계부가 없다(${page.status} ${page.location})`), `allowed page ${path}`);
  }
  for (const path of ["/my/calendar", "/calendar", "/analysis"]) {
    const page = await go(fx, path, { jar: new Jar(jar) });
    check(() => ok(page.status === 303 && /^\/(?:app|my\/analysis)\b/.test(page.location) && !page.location.includes("house-home"), `R-3 ${path}: 보기 화면으로 넘긴다(${page.status} ${page.location})`), `redirect page ${path}`);
  }
  // 조회 API: 다른 가계부 번호를 적어도 그 방 가계부의 것만 답한다.
  for (const path of ["/u/api/recent-transactions?month=2026-11&household_id=house-home", "/u/api/day-transactions?date=2026-11-18&household_id=house-home", `/u/api/tx/search?q=${encodeURIComponent(WORD_HOME.slice(0, 3))}&household=house-home`, "/u/api/notifications?household=house-home", "/u/api/favorites?household=house-home", "/u/api/goals?household=house-home", "/u/api/recent-transactions?month=2026-07&household_id=house-home"]) {
    const data = await go(fx, path, { jar: new Jar(jar), accept: "application/json" });
    if (issuesSession(data.cookies)) reissued.push(path);
    for (const [name, key] of [["U1", U1], ["U2", U2], ["이어진 키", U_ALIAS], ["방 키", ROOM]]) if (data.html.includes(key)) keyLeaks.push(`${path.split("?")[0]}:${name}`);
    check(() => ok(data.status === 200 && /json/.test(data.type) && !data.html.includes("house-home") && hasAny(data.html, [...HOME_ONLY_WORDS, HOME_HOUSEHOLD_NAME]).length === 0, `R-3 ${path.split("?")[0]}: 그 방 가계부의 것만(${data.status}, ${hasAny(data.html, HOME_ONLY_WORDS).join(",")})`), `api scoped ${path}`);
  }
  const recent = await go(fx, `/u/api/recent-transactions?month=2026-11&household_id=${hh}`, { jar: new Jar(jar), accept: "application/json" });
  check(() => ok(recent.html.includes(WORD_A1) && recent.html.includes(WORD_A2), "R-3 조회 API 는 그 방의 기록을 답한다"), "api room rows");
  const day = await go(fx, `/u/api/day-transactions?date=${DAY}&household_id=${hh}`, { jar: new Jar(jar), accept: "application/json" });
  check(() => ok(/"can_write":false/.test(day.html) && !/"can_edit":true|"can_delete":true/.test(day.html), "R-3 날짜별 기록: 쓸 수 없음으로 답한다(can_write false)"), "api read only flags");
  const cursor = await go(fx, "/cursor-preference?household_id=house-home", { jar: new Jar(jar), accept: "application/json" });
  if (issuesSession(cursor.cookies) || issuesSession(my.cookies)) reissued.push("/cursor-preference·/my");
  check(() => ok(cursor.status === 200 && !cursor.html.includes("house-home"), `R-8 /cursor-preference 는 열리고 다른 가계부 번호를 내지 않는다(${cursor.status})`), "cursor preference");
  const favorites = await go(fx, "/u/api/favorites?household=house-home", { jar: new Jar(jar), accept: "application/json" });
  const goals = await go(fx, "/u/api/goals?household=house-home", { jar: new Jar(jar), accept: "application/json" });
  check(() => ok(favorites.status === 200 && goals.status === 200 && !favorites.html.includes(WORD_FAV) && !goals.html.includes(WORD_GOAL) && favorites.html.includes(hh) , `R-8 즐겨찾기·목표 조회: 다른 가계부의 것이 나오지 않고 그 방 가계부 번호로 답한다(${favorites.status}/${goals.status})`), "favorites goals scoped");
  check(() => eq(coreSnapshot(fx), before, "R-3 보기만으로는 저장소가 바뀌지 않는다"), "viewing changes nothing");
  check(() => eq(settingsSnapshot(fx), settingsBefore, "R-8 보기만으로는 설정 표도 바뀌지 않는다(진단 기록 제외)"), "viewing changes no settings");
  check(() => ok(reissued.length === 0, `R-8 허용 화면·조회 API 의 GET 은 세션을 다시 주지 않는다(${reissued.join(",")})`), "allowed get issues no session");
  for (const [name, key] of [["U1", U1], ["U2", U2], ["이어진 키", U_ALIAS], ["방 키", ROOM]]) if (home.html.includes(key) || recent.html.includes(key) || day.html.includes(key)) keyLeaks.push(`home/api:${name}`);
  check(() => ok(keyLeaks.length === 0, `R-9 허용 화면·조회 API 에 구성원의 카카오 채팅 키·방 키가 실리지 않는다 — 읽기가 다른 구성원의 세션으로 넓어지지 않는다(${keyLeaks.join(",")})`), "no chat keys exposed");
  // 보통 세션에는 띠가 붙지 않는다.
  const normal = await go(fx, "/app", { headers: { cookie: fx.cookie } });
  check(() => ok(normal.status === 200 && !normal.html.includes("abRoomViewBand"), "R-3 보통 세션의 홈에는 띠가 없다"), "no band for normal session");
});

// ── R-4. 그 밖의 모든 요청은 로그인하지 않은 사람과 같다 ─────────────────────
const ALLOWED = ["/app", "/m", "/my", "/budgets", "/my/analysis", "/my/analysis/app.js", "/my/calendar", "/calendar", "/analysis", "/cursor-preference", "/u/api/recent-transactions", "/u/api/day-transactions", "/u/api/tx/search", "/u/api/tx/presence", "/u/api/notifications", "/u/api/favorites", "/u/api/goals"];
function sourceRoutes() {
  const files = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith(".js") && !/historical-runtime-assets/.test(entry.name)) files.push(full); } };
  walk(new URL("../src/modules/", import.meta.url));
  const found = new Set();
  for (const file of files) {
    const text = readFileSync(file, "utf8");
    for (const m of text.matchAll(/(?:pathname|path|p) *(?:===|==) *"(\/[A-Za-z0-9_\-./]*)"/g)) found.add(m[1]);
    for (const m of text.matchAll(/"(\/[a-z][A-Za-z0-9_\-/]*)" *(?:===|==) *(?:url\.)?(?:pathname|path)\b/g)) found.add(m[1]);
    for (const m of text.matchAll(/(?:href|action)=\\?"(\/[a-z][A-Za-z0-9_\-/]*)(?:[?#"\\])/g)) found.add(m[1]);
  }
  return [...found].filter((path) => path.length > 1 && !/^\/(?:skill|cron|internal|__)/.test(path)).sort();
}
const ROUTES = sourceRoutes();
// 견줄 때 지우는 것: 요청마다 새로 만드는 값(카카오 로그인 state, 한 번 쓰는 표).
const norm = (text) => String(text || "").replace(/state=[A-Za-z0-9._%-]+/g, "state=…").replace(/nonce="[^"]+"/g, 'nonce="…"').replace(/"(?:time|last_at)":"[^"]*"/g, '"time":"…"');
await roomFixture(async (fx, { hh }) => {
  const jar = await roomViewJar(fx);
  check(() => ok(ROUTES.length >= 300, `원본에서 주소 ${ROUTES.length}개를 찾았다(300개 이상이어야 한다)`), "route list size");
  const before = coreSnapshot(fx), settingsBeforeRequests = settingsSnapshot(fx);
  let same = 0, bounced = 0;
  const different = [], leaked = [], sessions = [];
  const extra = ["/my/backup.csv", "/my/account-link/run", "/my/account-link", "/my/kakao-claim", "/my/profile", "/my/backup-login", "/my/households", "/households", "/transactions/edit?id=tx-expense-1&household_id=house-home", "/my/settings?household_id=house-home", "/my/members?household_id=house-home", `/my/settings?household_id=${hh}`, `/my/members?household_id=${hh}`, `/my/backup.csv?household_id=${hh}`, `/my/setup?household_id=${hh}`, `/reports?household_id=${hh}`, `/menu?household_id=${hh}`, `/goals?household_id=${hh}`, "/auth/kakao/start", "/auth/kakao/start?link=1", "/auth/kakao/start?reauth=1", "/my/kakao-link", "/my?login=1", "/my?auto=0", `/my?auto=0&return_to=${encodeURIComponent(entryPath(hh))}`];
  const targets = [...new Set([...ROUTES, ...extra])].filter((path) => !ALLOWED.includes(path.split("?")[0]) || /^\/my\?(?:login|auto=0)/.test(path));
  for (const path of targets) {
    for (const accept of path.startsWith("/u/api/") || path.endsWith(".json") ? ["application/json"] : ["text/html"]) {
      const scoped = await go(fx, path, { jar: new Jar(jar), accept });
      const anonymous = await go(fx, path, { accept });
      const bounce = anonymous.status >= 300 && anonymous.status < 400 && /^\/my(?:[?#]|$)/.test(anonymous.location) && accept === "text/html" && path.split("?")[0] !== "/my" && !path.startsWith("/auth/");
      if (bounce && scoped.status === 303 && scoped.location === `/app?household_id=${hh}&rv=login`) bounced += 1;
      else if (scoped.status === anonymous.status && norm(scoped.location) === norm(anonymous.location) && norm(scoped.html) === norm(anonymous.html)) same += 1;
      else different.push(`${path} → ${scoped.status} ${scoped.location.slice(0, 60)} (로그인 안 함 ${anonymous.status} ${anonymous.location.slice(0, 60)})`);
      const words = hasAny(scoped.html, [HOME_HOUSEHOLD_NAME, ROOM_HOUSEHOLD_NAME, ...HOME_ONLY_WORDS, "user-wifi", "WIFI♥"]);
      if (words.length && norm(scoped.html) !== norm(anonymous.html)) leaked.push(`${path}: ${words.join(",")}`);
      if (issuesSession(scoped.cookies) && !issuesSession(anonymous.cookies)) sessions.push(path);
    }
  }
  check(() => ok(different.length === 0, `R-4 허용 목록 밖의 GET ${targets.length}개: 로그인하지 않은 사람과 응답이 같거나 그 방 홈으로 돌려보낸다(다른 것 ${different.length}: ${different.slice(0, 6).join(" / ")})`), "get equals anonymous");
  check(() => ok(leaked.length === 0, `R-4 허용 목록 밖의 화면에 가계부·계정 글자가 없다(${leaked.slice(0, 6).join(" / ")})`), "get leaks nothing");
  check(() => ok(sessions.length === 0, `R-4 허용 목록 밖의 GET 이 세션을 새로 주지 않는다(${sessions.slice(0, 6).join(",")})`), "get issues no session");
  check(() => ok(same >= 200 && bounced >= 60, `R-4 견준 수: 같음 ${same}, 그 방 홈으로 돌려보냄 ${bounced}`), "get counts");
  // 로그인하려는 길은 로그인 화면 그대로다(홈으로 돌려보내지 않는다).
  const login = await go(fx, "/my?login=1", { jar: new Jar(jar) });
  check(() => ok(login.status === 200 && /로그인/.test(login.html) && !login.html.includes("abRoomViewBand") && !login.html.includes(ROOM_HOUSEHOLD_NAME), `R-4 /my?login=1 은 로그인 화면(${login.status})`), "login screen reachable");
  const start = await go(fx, "/auth/kakao/start", { jar: new Jar(jar) });
  check(() => ok(start.status >= 300 && start.status < 400 && /kauth\.kakao\.com/.test(start.location), `R-4 카카오 로그인 시작은 카카오로 간다(${start.status})`), "kakao start reachable");
  const link = await go(fx, "/auth/kakao/start?link=1", { jar: new Jar(jar) });
  const linkAnonymous = await go(fx, "/auth/kakao/start?link=1", {});
  check(() => ok(link.status === linkAnonymous.status && norm(link.location) === norm(linkAnonymous.location) && !/kauth\.kakao\.com.*link/.test(link.location), `R-4 계정에 카카오 로그인을 잇는 길(link=1)은 세션 없는 사람과 같다(${link.status} ${norm(link.location).slice(0, 50)})`), "kakao link not available");
  // 모든 저장 요청: 로그인하지 않은 사람과 같고, 저장소가 바뀌지 않는다.
  const posts = [
    ["/my/transactions", { household_id: hh, month: "2026-11", text: "방전용시험 1300원" }], ["/my/update", { household_id: hh, id: "x" }], ["/my/delete", { household_id: hh, id: "x" }], ["/my/undo", { household_id: hh }], ["/my/restore", { household_id: hh }],
    ["/my/budget/save", { household_id: hh, category: "식비", amount: "1000" }], ["/my/budget-bulk/save", { household_id: hh }], ["/my/category-keywords/save", { household_id: hh }], ["/my/category-keywords/bulk-save", { household_id: hh }],
    ["/my/recurring/save", { household_id: hh }], ["/my/recurring/delete", { household_id: hh }], ["/my/recurring/from-candidate", { household_id: hh }], ["/my/import", { household_id: hh }],
    ["/my/household/update", { household_id: hh, name: "바뀐 이름" }], ["/my/household/delete", { household_id: hh }], ["/my/household/leave", { household_id: hh }], ["/my/household/transfer-owner", { household_id: hh, user_id: WEB_USER }], ["/my/member-policy/save", { household_id: hh, mode: "record_only" }],
    ["/my/setup/name", { household_id: hh, name: "바뀐 이름" }], ["/my/setup/me", { household_id: hh, nickname: "바뀐 사람" }], ["/my/create", { name: "새 가계부" }], ["/my/join", { invite_code: "HOME2265" }],
    ["/my/profile", { nickname: "바뀐 사람" }], ["/my/consent", { return_to: "/app" }], ["/my/account-link", {}], ["/my/account-reauth", { password: "x" }], ["/my/backup-login", { login_name: "roomviewer", password: "Abcdef12!@" }], ["/my/local-signup", { login_name: "roomviewer2", password: "Abcdef12!@" }],
    ["/my/report-preference/save", { household_id: hh }], ["/my/card-target/save", { household_id: hh }], ["/my/report-challenge/save", { household_id: hh }], ["/my/settlement/save", { household_id: hh }], ["/my/settlement/refund-link", { household_id: hh }], ["/my/settlement/refund-unlink", { household_id: hh }], ["/my/settlement/refund-keep", { household_id: hh }], ["/my/settlement/refund-preview", { household_id: hh }], ["/my/member-code/seen", {}],
    ["/admin/transactions", { household_id: hh, text: "방전용시험 1300원" }], ["/admin/update", { household_id: hh, id: "x" }], ["/admin/delete", { household_id: hh, id: "x" }], ["/admin/budget/save", { household_id: hh }], ["/admin/budget/delete", { household_id: hh }], ["/admin/recurring/save", { household_id: hh }], ["/admin/recurring/delete", { household_id: hh }], ["/admin/recurring/apply", { household_id: hh }],
    ["/admin/member/update", { household_id: hh, user_id: WEB_USER, role: "owner" }], ["/admin/member/remove", { household_id: hh, user_id: WEB_USER }], ["/admin/member/nickname", { household_id: hh, user_id: WEB_USER, nickname: "x" }], ["/admin/reserve-plan/create", { household_id: hh }], ["/admin/reserve-plan/update", { household_id: hh }], ["/admin/reserve-plan/delete", { household_id: hh }], ["/admin/payment-asset/create", { household_id: hh }], ["/admin/payment-asset/update", { household_id: hh }], ["/admin/payment-asset/delete", { household_id: hh }], ["/admin/meme/react", { household_id: hh }], ["/admin/meme/save", { household_id: hh }], ["/admin/meme/delete", { household_id: hh }],
    ["/home-layout/save", { household_id: hh }], ["/cursor-preference/save", { household_id: hh, mode: "default" }], ["/u/api/favorites", { household: hh, text: "점심 1300원" }], ["/u/api/goals", { household: hh, name: "목표", target: "1000" }], ["/u/api/input-classification", { household_id: hh, text: "점심 1300원" }],
  ];
  const postDifferent = [];
  for (const [path, body] of posts) {
    const accept = path.startsWith("/u/api/") ? "application/json" : "text/html";
    const scoped = await send(fx, "POST", path, { jar: new Jar(jar), body, accept });
    const anonymous = await send(fx, "POST", path, { body, accept });
    if (!(scoped.status === anonymous.status && norm(scoped.location) === norm(anonymous.location)) || issuesSession(scoped.cookies) !== issuesSession(anonymous.cookies)) postDifferent.push(`${path} → ${scoped.status} ${scoped.location.slice(0, 50)} (로그인 안 함 ${anonymous.status} ${anonymous.location.slice(0, 50)})`);
  }
  check(() => ok(postDifferent.length === 0, `R-4 저장 요청 ${posts.length}개: 로그인하지 않은 사람과 응답이 같다(다른 것: ${postDifferent.slice(0, 6).join(" / ")})`), "post equals anonymous");
  // 새로 생긴 계정 줄(로그인하지 않은 사람도 만들 수 있는 가입)은 빼고 견준다: 가입 시험이 만든 줄을 지운 뒤의 모습이 처음과 같아야 한다.
  const strip = (snapshot) => JSON.stringify(JSON.parse(snapshot).map((rows) => rows.filter((row) => !/roomviewer/.test(JSON.stringify(row)))));
  const signupUsers = new Set((fx.db.accountbook_user_identities || []).filter((row) => /roomviewer/.test(String(row.provider_subject || ""))).map((row) => row.user_id));
  const after = JSON.stringify(JSON.parse(coreSnapshot(fx)).map((rows) => rows.filter((row) => !signupUsers.has(row.id) && !signupUsers.has(row.user_id) && !/roomviewer/.test(JSON.stringify(row)))));
  check(() => eq(after, strip(before), "R-4 방 전용 세션의 저장 요청으로는 기록·가계부·구성원·계정 줄이 하나도 바뀌지 않는다"), "post changes nothing");
  // 설정 표도 그대로다(진단 기록 제외). 로그인하지 않은 사람의 가입·로그인 시도가 남기는 줄이 있다면 여기서 드러난다 — 그때는 그 줄이 방 전용 세션 때문이 아님을 확인한다.
  const settingsAfterRequests = settingsSnapshot(fx);
  check(() => eq(settingsAfterRequests, settingsBeforeRequests, "R-8 방 전용 세션의 GET·저장 요청으로는 설정 표도 바뀌지 않는다(진단 기록 제외)"), "requests change no settings");
  check(() => ok(!fx.db.transactions.some((row) => /방전용시험/.test(JSON.stringify(row))), "R-4 시험 기록이 저장되지 않았다"), "no test record saved");
  check(() => ok(!(fx.db.accountbook_user_identities || []).some((row) => row.user_id === WEB_USER && /roomviewer/.test(String(row.provider_subject || ""))), "R-4 방 전용 세션으로 그 계정에 로그인 이름을 붙일 수 없다"), "no credential on scoped user");
  // 로그아웃은 된다.
  const outJar = new Jar(jar);
  const out = await send(fx, "POST", "/my/logout", { jar: outJar });
  check(() => ok(out.status === 303 && !outJar.token(), `R-4 로그아웃하면 방 전용 세션이 지워진다(${out.status})`), "logout clears");
});

// ── R-5. 다른 방의 단추 ─────────────────────────────────────────────────────
await roomFixture(async (fx, { u1, hh, hhB }) => {
  const jar = await roomViewJar(fx);
  // 같은 사람이 다른 방(ROOM_B — 거기도 구성원)의 단추를 누른다: 그 방으로 다시 정한다(Sec-Fetch-Site 머리가 없어도).
  const again = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC, jar, site: "" });
  check(() => ok(again.location === `/app?household_id=${hhB}` && jar.user() === WEB_USER && jar.scope() === hhB && lastRoomOpen() === "linked_room_view", `R-5 같은 사람·다른 방: 그 방으로 다시 정한다(${again.location}, ${jar.scope() === hhB}, ${lastRoomOpen()})`), "rescope same user");
  const homeB = await go(fx, "/app", { jar: new Jar(jar) });
  check(() => ok(homeB.status === 200 && homeB.html.includes(WORD_B) && !homeB.html.includes(WORD_A1) && !homeB.html.includes(HOME_HOUSEHOLD_NAME), "R-5 다시 정한 뒤에는 그 방의 기록만 보인다"), "rescoped home");
  // 같은 방의 단추를 다시 누르면 그대로다(새 표를 주지 않는다).
  const sameRoom = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC, jar: new Jar(jar) });
  check(() => ok(sameRoom.location === `/app?household_id=${hhB}` && issuesSession(sameRoom.cookies) && lastRoomOpen() === "linked_room_view" && /Max-Age=43200\b/.test(sameRoom.cookies.find((line) => /^ab_user=/.test(line)) || ""), `R-8 같은 방의 단추를 다시 누르면 표를 새로 받는다 — 12시간이 다시 시작된다(${lastRoomOpen()})`), "same room reissued");
  // 다른 사람(카카오 로그인이 붙은 U1)이 같은 브라우저에서 ROOM 의 단추를 누른다: 앱에서 바로 연 이동일 때만 바꾼다.
  fx.db.accountbook_user_identities.push(strongKakao(u1.id));
  const crossJar = new Jar(jar);
  const cross = await go(fx, tapped("/my", { user: U1, room: ROOM }), { ua: PC, jar: crossJar, site: "cross-site" });
  check(() => ok(crossJar.user() === WEB_USER && crossJar.scope() === hhB && !issuesSession(cross.cookies), `R-5 다른 사이트가 시킨 이동은 방 전용 세션을 바꾸지 않는다(${lastRoomOpen()})`), "other user not swapped indirect");
  const directJar = new Jar(jar);
  const direct = await go(fx, tapped("/my", { user: U1, room: ROOM }), { ua: PC, jar: directJar, site: "none" });
  check(() => ok(directJar.user() === u1.id && directJar.scope() === hh && lastRoomOpen() === "strong_room_view", `R-5 바로 연 이동이면 누른 사람의 방 전용 세션으로 바꾼다(${direct.location}, ${lastRoomOpen()})`), "other user swapped direct");
  // 방 표식만 온 길(식별 값 없음): 범위 안이면 그 방 홈, 범위 밖 표식은 버리고 지금의 방 홈.
  const marker = await go(fx, entryPath(hhB), { jar: new Jar(jar) });
  check(() => ok(marker.status === 303 && marker.location === `/app?household_id=${hhB}`, `R-5 방 표식(범위 안): 그 방 홈(${marker.location})`), "marker in scope");
  const markerOther = await go(fx, entryPath(hh), { jar: new Jar(jar) });
  const markerAnonymous = await go(fx, entryPath(hh), {});
  check(() => ok(markerOther.status === 303 && markerOther.location === `/my?auto=0&return_to=${encodeURIComponent(entryPath(hh))}` && markerOther.location === markerAnonymous.location && !issuesSession(markerOther.cookies), `R-8 다른 방의 표식: 방 전용 세션으로 받지 않는다 — 로그인하지 않은 사람처럼 그 방으로 돌아올 로그인 화면으로(${markerOther.location})`), "marker out of scope");
  const markerLogin = await go(fx, markerOther.location, { jar: new Jar(jar) });
  check(() => ok(markerLogin.status === 200 && !markerLogin.html.includes("abRoomViewBand") && !markerLogin.html.includes(WORD_B) && !markerLogin.html.includes(ROOM_HOUSEHOLD_NAME), `R-8 그 로그인 화면에는 띠도 먼저 받은 방의 가계부도 없다(${markerLogin.status})`), "marker login screen clean");
  const markerWithValues = await go(fx, tapped(entryPath(hh), { user: null }), { jar: new Jar(jar) });
  check(() => ok(markerWithValues.status === 303 && markerWithValues.location === entryPath(hh), `R-8 사용자 키 없이 온 다른 방의 단추: 값을 뺀 그 방의 표식 주소로(${markerWithValues.location})`), "no user key other room");
}, { alsoB: true });

// ── R-6. 역할 읽기·가계부 목록 ───────────────────────────────────────────────
await roomFixture(async (fx, { u1, u2, hh, hhB }) => {
  const scopedEnv = (userId, householdId) => ({ ...fx.env, __AB_ROOM_VIEW: { userId, householdId } });
  const readers = [["getHouseholdMemberRole", async (env, user, household) => rolesModule.getHouseholdMemberRole(env, user, household)], ["getHouseholdMemberRoleStrict", async (env, user, household) => rolesModule.getHouseholdMemberRoleStrict(env, user, household)], ["readHouseholdRoleOrFailure", async (env, user, household) => (await rolesModule.readHouseholdRoleOrFailure(env, user, household, { path: "/app", method: "GET" })).role]];
  for (const [name, readRole] of readers) {
    const plain = [await readRole(fx.env, WEB_USER, hh), await readRole(fx.env, WEB_USER, "house-home"), await readRole(fx.env, u1.id, hh)];
    check(() => ok(plain[0] === "member" && plain[1] === "member" && plain[2] === "owner", `R-6 ${name}: 범위가 없으면 예전 값(${plain.join(",")})`), `${name} unscoped`);
    const env = scopedEnv(WEB_USER, hh);
    const scoped = [await readRole(env, WEB_USER, hh), await readRole(env, WEB_USER, "house-home"), await readRole(env, WEB_USER, hhB), await readRole(env, u2.id, hh), await readRole(env, "user-bin", "house-home")];
    check(() => ok(scoped[0] === "viewer", `R-6 ${name}: 범위 안 가계부는 조회 전용(${scoped[0]})`), `${name} in scope`);
    check(() => ok(scoped[1] === "" && scoped[2] === "", `R-6 ${name}: 범위 밖 가계부는 구성원 아님(${JSON.stringify(scoped.slice(1, 3))})`), `${name} out of scope`);
    check(() => ok(scoped[3] === "member" && scoped[4] === "owner", `R-6 ${name}: 다른 사람 번호로 읽는 값은 그대로(${scoped.slice(3).join(",")})`), `${name} other users`);
    const ownerScoped = await readRole(scopedEnv(u1.id, hh), u1.id, hh);
    check(() => eq(ownerScoped, "viewer", `R-6 ${name}: 소유자도 방 전용에서는 조회 전용`), `${name} owner capped`);
  }
  const member = fx.db.household_members.find((row) => row.user_id === WEB_USER && row.household_id === hh);
  for (const role of ["pending", "blocked"]) {
    member.role = role;
    const value = await rolesModule.getHouseholdMemberRole(scopedEnv(WEB_USER, hh), WEB_USER, hh);
    check(() => eq(value, role, `R-6 ${role} 는 범위 안에서도 그대로 ${role}(읽을 수 없던 사람이 읽게 되지 않는다)`), `role stays ${role}`);
  }
  member.role = "member";
  const all = await usersModule.fetchUserHouseholds(fx.env, WEB_USER);
  check(() => ok(all.length === 2 && all.some((h) => h.id === "house-home" && h.invite_code === "HOME2265"), `R-6 범위가 없으면 가계부 목록 그대로(${all.length}개)`), "list unscoped");
  const narrowed = await usersModule.fetchUserHouseholds(scopedEnv(WEB_USER, hh), WEB_USER);
  check(() => ok(narrowed.length === 1 && narrowed[0].id === hh && narrowed[0].role === "viewer" && narrowed[0].invite_code === "", `R-6 범위가 있으면 그 방 가계부 하나·조회 전용·초대코드 없음(${JSON.stringify(narrowed.map((h) => [h.role, h.invite_code]))})`), "list scoped");
  const otherUser = await usersModule.fetchUserHouseholds(scopedEnv(WEB_USER, hh), "user-bin");
  check(() => ok(otherUser.length === 2, `R-6 다른 사람 번호로 읽는 목록은 그대로(${otherUser.length}개)`), "list other user");
  check(() => ok(rowsModule.roomViewRoleV229130(fx.env, WEB_USER, hh, "owner") === "owner" && rowsModule.roomViewScopeForV229130(fx.env, WEB_USER) === null, "R-6 범위가 없으면 역할을 글자 하나 바꾸지 않는다"), "helper passthrough");
});

// ── R-7. 끝나는 때 ──────────────────────────────────────────────────────────
await roomFixture(async (fx, { hh }) => {
  const jar = await roomViewJar(fx);
  const alive = await go(fx, "/app", { jar: new Jar(jar) });
  check(() => eq(alive.status, 200, "R-7 받은 직후에는 열린다"), "alive");
  // 세션 판이 오르면(비밀번호 바꾸기 등) 끝난다.
  const security = fx.db.accountbook_user_security.find((row) => row.user_id === WEB_USER);
  const version = Number(jar.parts()[2]);
  if (security) security.session_version = version + 1; else fx.db.accountbook_user_security.push({ user_id: WEB_USER, session_version: version + 1 });
  const revoked = await go(fx, "/app", { jar: new Jar(jar) });
  check(() => ok(revoked.status === 303 && revoked.location.startsWith("/my"), `R-7 세션 판이 오르면 끝난다(${revoked.status} ${revoked.location})`), "revoked by version");
  const revokedLogin = await go(fx, "/my", { jar: new Jar(jar) });
  check(() => ok(revokedLogin.status === 200 && !revokedLogin.html.includes("abRoomViewBand") && !revokedLogin.html.includes(ROOM_HOUSEHOLD_NAME), `R-8 세션이 끝난 뒤의 로그인 화면에는 ‘방 전용 보기’ 띠가 없다(${revokedLogin.status})`), "no band after revoke");
  if (security) security.session_version = version; else fx.db.accountbook_user_security.pop();
  // 12시간이 지나면 끝난다.
  const realNow = Date.now;
  Date.now = () => realNow() + (12 * 3600 + 5) * 1000;
  try {
    const expired = await go(fx, "/app", { jar: new Jar(jar) });
    check(() => ok(expired.status === 303 && expired.location.startsWith("/my"), `R-7 12시간이 지나면 끝난다(${expired.status} ${expired.location})`), "expired");
  } finally { Date.now = realNow; }
  Date.now = () => realNow() + (12 * 3600 - 60) * 1000;
  try {
    const late = await go(fx, "/app", { jar: new Jar(jar) });
    check(() => eq(late.status, 200, "R-7 12시간이 되기 전에는 열린다"), "not yet expired");
  } finally { Date.now = realNow; }
  // 돌려보낸 화면: 띠가 까닭을 말한다.
  const bounced = await go(fx, `/app?household_id=${hh}&rv=login`, { jar: new Jar(jar) });
  check(() => ok(bounced.status === 200 && bounced.html.includes("방금 누른 화면은 로그인하면 볼 수 있어요."), "R-7 돌려보낸 홈의 띠가 까닭을 말한다"), "bounce notice");
  const band = alive.html.slice(alive.html.indexOf('<div class="abRoomViewBand"'), alive.html.indexOf("</div>", alive.html.indexOf('<div class="abRoomViewBand"')));
  check(() => ok(band.includes(`href="/my?auto=0&amp;return_to=${encodeURIComponent(entryPath(hh))}"`) && !/무료|평생|언제나/.test(band), `R-7 띠의 [로그인] 은 로그인 화면으로 가고 로그인 뒤 이 방 가계부로 돌아온다(${(band.match(/href="[^"]+"/) || [""])[0]})`), "band login link");
});

// ── R-8. 독립 검토 1 반영 장면 ───────────────────────────────────────────────
await roomFixture(async (fx, { hh }) => {
  // 온전한 세션이 있는 브라우저에서 세션 확인(users 읽기)이 잠깐 실패한 순간에 방 단추를 누른다: 방 전용 쿠키로 덮어쓰지 않는다.
  const full = new Jar();
  full.items.set("ab_user", encodeURIComponent(await sessionModule.makeUserSession(fx.env, WEB_USER)));
  const fullToken = full.token();
  const stop = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/users" && /accountbook_user_security/.test(decodeURIComponent(url.search)) ? failure(503, "simulated session store failure") : null));
  let outage;
  try { outage = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, jar: full }); } finally { stop(); }
  check(() => ok(!issuesSession(outage.cookies) && full.token() === fullToken && !/room_view/.test(lastRoomOpen()), `R-8 세션 확인을 못 한 요청에는 방 전용 세션을 주지 않는다 — 온전한 세션 쿠키가 그대로다(${outage.status} ${outage.location}, ${lastRoomOpen()})`), "no issue on session outage");
  // 확인이 되는 때에는 온전한 세션 그대로 그 방 가계부(예전 그대로).
  const fine = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, jar: full });
  check(() => ok(fine.location === `/app?household_id=${hh}` && full.token() === fullToken && lastRoomOpen() === "same_session", `R-8 온전한 세션이 있으면 예전 그대로(${lastRoomOpen()})`), "full session unchanged");
});
await roomFixture(async (fx, { hh }) => {
  // 방 전용 세션을 받은 뒤 승인 대기로 바뀐 구성원: 가계부가 열리지 않고, 상태 화면에는 띠가 없다.
  const jar = await roomViewJar(fx);
  fx.db.household_members.find((row) => row.user_id === WEB_USER && row.household_id === hh).role = "pending";
  const home = await go(fx, "/app", { jar: new Jar(jar) });
  check(() => ok(home.status !== 200 || !home.html.includes(WORD_A1), `R-8 승인 대기로 바뀌면 그 방의 기록이 보이지 않는다(${home.status} ${home.location})`), "pending after issue");
  const status = await go(fx, "/my", { jar: new Jar(jar) });
  check(() => ok(!status.html.includes("abRoomViewBand") && !status.html.includes(WORD_A1), `R-8 그때의 /my 화면에는 띠도 기록도 없다(${status.status} ${status.location})`), "pending status no band");
});
await roomFixture(async (fx, { hh }) => {
  // 방 전용 세션이 있는 브라우저에서 카카오 로그인을 한다: 세션 없는 사람의 로그인과 같은 길이고, 끝나면 온전한 세션(세 칸)이다.
  fx.db.accountbook_user_identities.push({ id: "ident-v229130-web", user_id: WEB_USER, provider: "kakao", provider_subject: "9130777", created_at: `${DAY}T01:00:00Z` });
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const stop = intercept(async ({ url }) => (url.href === "https://kauth.kakao.com/oauth/token" ? json({ access_token: "qa-access-token", token_type: "bearer" }) : url.href === "https://kapi.kakao.com/v2/user/me" ? json({ id: 9130777, properties: { nickname: "피시" } }) : null));
  try {
    const jar = await roomViewJar(fx);
    const band = await go(fx, `/app?household_id=${hh}`, { jar: new Jar(jar) });
    const loginHref = (/<div class="abRoomViewBand"[\s\S]*?href="([^"]+)"/.exec(band.html) || ["", ""])[1].replace(/&amp;/g, "&");
    const screen = await go(fx, loginHref, { jar });
    check(() => ok(screen.status === 200 && !screen.html.includes("abRoomViewBand") && /카카오/.test(screen.html), `R-8 띠의 [로그인] 은 로그인 화면을 연다(${screen.status} ${loginHref})`), "band login opens screen");
    const start = await go(fx, `/auth/kakao/start?return_to=${encodeURIComponent(entryPath(hh))}`, { jar });
    const authorize = new URL(start.location || "/", BASE);
    check(() => ok(/kauth\.kakao\.com/.test(start.location) && authorize.searchParams.get("prompt") !== "none", `R-8 카카오 로그인 시작: 화면 있는 보통 로그인(${start.status})`), "kakao start plain");
    const callback = await go(fx, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state") || "")}`, { jar, site: "cross-site" });
    check(() => ok(callback.status === 303 && jar.user() === WEB_USER && jar.parts().length === 3 && !jar.scope(), `R-8 로그인하면 온전한 세션(세 칸)으로 바뀐다(${callback.status} ${callback.location}, ${jar.parts().length}칸)`), "login upgrades to full");
    const after = await go(fx, callback.location || "/my", { jar });
    const landed = after.status === 303 ? await go(fx, after.location, { jar }) : after;
    check(() => ok(landed.status === 200 && !landed.html.includes("abRoomViewBand") && landed.html.includes(WORD_A1), `R-8 로그인 뒤에는 띠 없이 그 방 가계부가 열린다(${after.status} ${after.location} → ${landed.status})`), "after login room household");
    const other = await go(fx, "/app?household_id=house-home", { jar });
    check(() => ok(other.status === 200 && other.html.includes(HOME_HOUSEHOLD_NAME), `R-8 온전한 세션에서는 다른 가계부도 열린다(${other.status})`), "full session other household");
  } finally { stop(); }
});

// ── R-9. 독립 검토 2 반영 장면 ───────────────────────────────────────────────
await roomFixture(async (fx, { hh }) => {
  // 가계부에서 조회 전용인 구성원: 들어오되, ‘로그인하면 기록할 수 있어요’ 라고 하지 않는다(로그인해도 기록할 수 없다).
  const jar = await roomViewJar(fx);
  const home = await go(fx, `/app?household_id=${hh}`, { jar: new Jar(jar) });
  check(() => ok(home.status === 200 && home.html.includes(WORD_A1) && home.html.includes('id="abRoomViewBand"'), `R-9 조회 전용 구성원도 방 전용 보기로 들어온다(${home.status})`), "viewer member enters");
  check(() => ok(!home.html.includes("로그인하면 여기서 기록할 수 있어요") && home.html.includes("현재 권한(조회 전용/승인 대기)은 입력이 제한됩니다."), "R-9 조회 전용 구성원에게는 기록할 수 있다고 말하지 않는다"), "viewer member wording");
}, { role: "viewer" });
await roomFixture(async (fx, { hh }) => {
  // 받은 뒤 승인 대기로 바뀌거나 내보내진 구성원: 띠를 붙인 상태 화면 대신 방 전용 세션을 끝내고 로그인 화면으로.
  for (const [label, change] of [["승인 대기로 바뀜", (row) => { row.role = "pending"; }], ["내보내짐", (row) => { fx.db.household_members.splice(fx.db.household_members.indexOf(row), 1); }]]) {
    const jar = await roomViewJar(fx);
    const row = fx.db.household_members.find((item) => item.user_id === WEB_USER && item.household_id === hh);
    const kept = { ...row };
    change(row);
    const ended = await go(fx, "/app", { jar });
    check(() => ok(ended.status === 303 && ended.location === "/my" && !jar.token() && ended.cookies.some((line) => /^ab_user=;/.test(line) && /Max-Age=0/.test(line)), `R-9 ${label}: 방 전용 세션을 끝내고 /my 로(${ended.status} ${ended.location})`), `ended ${label}`);
    const after = await go(fx, "/my", { jar });
    check(() => ok(after.status === 200 && !after.html.includes("abRoomViewBand") && !after.html.includes(WORD_A1), `R-9 ${label}: 그 뒤는 로그인 화면(띠·기록 없음)(${after.status})`), `ended then login ${label}`);
    if (!fx.db.household_members.includes(row)) fx.db.household_members.push(kept); else row.role = kept.role;
  }
});
await roomFixture(async (fx, { u1, hh }) => {
  // 카카오톡 안의 브라우저에서 방 전용 세션을 받은 로그인 이름 계정이 허용 밖의 화면을 연다: 화면 없는 카카오 로그인으로 보내지 않고 그 방 홈으로 돌려보낸다.
  fx.db.accountbook_user_identities.push(strongLocal(u1.id));
  const jar = new Jar();
  await go(fx, tapped("/my"), { ua: INAPP, jar });
  check(() => ok(jar.user() === u1.id && jar.scope() === hh, "R-9 준비: 인앱의 로그인 이름 계정이 방 전용 세션을 받았다"), "inapp local ready");
  for (const target of ["/my/households", "/my/settings", "/my/members", "/menu"]) {
    const moved = await go(fx, target, { ua: INAPP, jar: new Jar(jar) });
    check(() => ok(moved.status === 303 && moved.location === `/app?household_id=${hh}&rv=login` && !/auth\/kakao\/start/.test(moved.location) && !issuesSession(moved.cookies), `R-9 인앱 ${target}: 화면 없는 카카오 로그인이 아니라 그 방 홈으로(${moved.status} ${moved.location})`), `inapp stripped ${target}`);
  }
  const inappHome = await go(fx, "/app", { ua: INAPP, jar: new Jar(jar) });
  check(() => ok(inappHome.status === 200 && inappHome.html.includes('id="abRoomViewBand"') && !inappHome.html.includes('id="abKakaoStart"'), `R-9 인앱에서도 방 전용 홈이 열린다(시작 팝업 없음)(${inappHome.status})`), "inapp home");
});
await roomFixture(async (fx, { hh, hhB }) => {
  // 방 A 의 방 전용 세션을 든 브라우저에서, 구성원이 아닌 방 B 의 표식 없는 단추(옛 카드)를 누른다: 다시 정하지 못하므로 들고 있던 세션을 끝낸다.
  const jar = await roomViewJar(fx);
  const pressed = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC, jar, site: "none" });
  check(() => ok(lastRoomOpen() === "not_member" && !jar.token() && pressed.cookies.some((line) => /^ab_user=;/.test(line) && /Max-Age=0/.test(line)), `R-9 구성원이 아닌 다른 방의 단추: 들고 있던 방 전용 세션을 끝낸다(${lastRoomOpen()}, ${pressed.location})`), "held view dropped");
  const landed = await go(fx, pressed.location, { jar });
  check(() => ok(!(landed.status === 200 && landed.html.includes(WORD_A1)) && !landed.html.includes("abRoomViewBand"), `R-9 그 뒤 화면에 먼저 받은 방의 가계부가 열리지 않는다(${landed.status} ${landed.location})`), "no stale room after drop");
  // 다른 사이트가 시킨 이동은 세션을 끝내지 않는다.
  const jar2 = await roomViewJar(fx);
  const cross = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC, jar: jar2, site: "cross-site" });
  check(() => ok(jar2.scope() === hh && !cross.cookies.some((line) => /^ab_user=/.test(line)), `R-9 다른 사이트가 시킨 이동은 방 전용 세션을 끝내지 않는다(${lastRoomOpen()})`), "held view kept on indirect");
  // 같은 방(구성원)의 단추면 끝내지 않고 새로 준다.
  const same = await go(fx, tapped("/my", { user: U_ALIAS, room: ROOM }), { ua: PC, jar: jar2, site: "none" });
  check(() => ok(jar2.scope() === hh && issuesSession(same.cookies), "R-9 같은 방의 단추는 새 표를 준다(끝내지 않는다)"), "same room not dropped");
  check(() => ok(hhB !== hh, "픽스처"), "fixture rooms");
});
await roomFixture(async (fx, { hh }) => {
  // 다른 쿠키(포인트 색·자동 로그인 되풀이 막기·설정 띠)가 있는 브라우저: 허용 밖의 GET 은 그래도 로그인하지 않은 사람(같은 쿠키, 세션만 없음)과 같다.
  const jar = await roomViewJar(fx);
  const extras = [["ab_sp", "1"], ["ab_kakao_auto", "skip"], ["ab_setup", encodeURIComponent(`${hh}|name`)], ["ab_bk", "0"], ["ab_cs", "0"]];
  const scopedJar = new Jar(jar), plainJar = new Jar();
  for (const [name, value] of extras) { scopedJar.items.set(name, value); plainJar.items.set(name, value); }
  const differs = [];
  const sample = [...new Set([...ROUTES.filter((route, index) => index % 4 === 0), "/menu", "/my/settings", "/my/members", "/my/households", "/households", "/reports", "/start-guide", "/support", "/faq", "/", "/kakao-guide", "/my?login=1", "/my?auto=0"])].filter((route) => !ALLOWED.includes(route.split("?")[0]) || /^\/my\?(?:login|auto=0)/.test(route));
  for (const route of sample) {
    const scoped = await go(fx, route, { jar: new Jar(scopedJar) });
    const anonymous = await go(fx, route, { jar: new Jar(plainJar) });
    const bounce = anonymous.status >= 300 && anonymous.status < 400 && /^\/my(?:[?#]|$)/.test(anonymous.location) && route.split("?")[0] !== "/my" && !route.startsWith("/auth/");
    if (bounce && scoped.status === 303 && scoped.location === `/app?household_id=${hh}&rv=login`) continue;
    if (!(scoped.status === anonymous.status && norm(scoped.location) === norm(anonymous.location) && norm(scoped.html) === norm(anonymous.html))) differs.push(`${route} → ${scoped.status} (로그인 안 함 ${anonymous.status})`);
  }
  check(() => ok(sample.length >= 80 && differs.length === 0, `R-9 다른 쿠키가 있는 브라우저에서도 허용 밖의 GET ${sample.length}개가 로그인하지 않은 사람과 같다(다른 것: ${differs.slice(0, 6).join(" / ")})`), "equal with other cookies");
});

// ── 원본 ────────────────────────────────────────────────────────────────────
{
  const room = read("src/modules/auth/kakao-room-open.js");
  const router = read("src/modules/worker/router.js");
  const listed = (/const ROOM_VIEW_PATHS_V229130 = new Set\(\[([\s\S]*?)\]\);/.exec(room) || ["", ""])[1].match(/"[^"]+"/g) || [];
  check(() => eq(listed.map((item) => item.slice(1, -1)).sort().join(" "), [...ALLOWED].sort().join(" "), "원본: 방 전용 세션이 인정되는 주소 목록이 이 검사의 목록과 같다(늘리려면 이 검사도 함께 고친다)"), "allow list pinned");
  const moduleFiles = [];
  const walk = (dir) => { for (const entry of readdirSync(dir, { withFileTypes: true })) { const full = new URL(`${entry.name}${entry.isDirectory() ? "/" : ""}`, dir); if (entry.isDirectory()) walk(full); else if (entry.name.endsWith(".js") && !/historical-runtime-assets/.test(entry.name)) moduleFiles.push(full); } };
  walk(new URL("../src/modules/", import.meta.url));
  const issuers = moduleFiles.filter((file) => /roomViewHouseholdId\s*:/.test(readFileSync(file, "utf8"))).map((file) => String(file).split("/src/modules/")[1]);
  check(() => eq(issuers.join(" "), "auth/kakao-room-open.js", "원본: 방 전용 세션을 만드는 곳은 한 파일뿐이다"), "single issuer");
  check(() => eq((room.match(/roomViewHouseholdId\s*:/g) || []).length, 1, "원본: 그 파일에서도 한 곳뿐이다"), "single issue site");
  const open = router.indexOf("const kakaoRoomOpen = await kakaoRoomOpenResponse(request, env, url, ctx);"), gate = router.indexOf("roomViewGateV229130(request, env, url, env.__AB_ROOM_VIEW_TOKEN)"), entry = router.indexOf("const kakaoRoomEntry = await kakaoRoomEntryResponse(request, env, url, ctx);"), csrf = router.indexOf("if (!csrfOriginAllowed(request, url))");
  check(() => ok(csrf > 0 && csrf < open && open < gate && gate < entry, "원본: 관문은 같은 출처 검사·방 열기 다음, 방 표식 길과 그 밖의 모든 라우팅보다 앞이다"), "gate position");
  check(() => ok(/const routed = roomViewToken \? \{ request, eligible: false, injected: false, remembered: "" \} : rememberedHouseholdRequest\(request\);/.test(router), "원본: 방 전용 세션의 요청에는 가계부 기억 쿠키를 쓰지 않는다"), "memory skipped");
  check(() => ok(room.includes('if (method !== "GET" && method !== "HEAD") return false;') && room.includes("if (!url || !ROOM_VIEW_PATHS_V229130.has(url.pathname)) return false;"), "원본: 허용 판정은 GET·HEAD 와 목록의 주소만"), "allow predicate");
  check(() => ok(room.includes('if (marks.length !== 1 || marks[0] !== String(householdId || "")) return false;'), "원본: 다른 방의 표식은 허용하지 않는다"), "marker predicate");
  check(() => ok(room.includes("&& !(!current && env?.__AB_SESSION_UNAVAILABLE === true)"), "원본: 세션 확인을 못 한 요청에는 방 전용 세션을 주지 않는다"), "outage guard");
  check(() => ok(!room.includes("room_view_same"), "원본: 같은 방을 다시 눌러도 새 표를 준다(예전 이름 room_view_same 이 없다)"), "no stale result name");
  check(() => ok(read("src/modules/auth/kakao-account-link.js").includes("async function kakaoInAppAutoLoginResponse(request, env, url) {") && /async function kakaoInAppAutoLoginResponse\(request, env, url\) \{\n(?:  \/\/[^\n]*\n)*  if \(env\?\.__AB_ROOM_VIEW_STRIPPED\) return null;/.test(read("src/modules/auth/kakao-account-link.js")), "원본: 방 전용 세션을 뗀 요청은 인앱 자동 로그인으로 보내지 않는다(함수의 첫 판정)"), "auto login skipped when stripped");
  check(() => ok(router.includes("if (requestEnv.__AB_ROOM_VIEW_STRIPPED_REQUEST) routed.request = requestEnv.__AB_ROOM_VIEW_STRIPPED_REQUEST;") && router.indexOf("if (requestEnv.__AB_ROOM_VIEW_STRIPPED_REQUEST) routed.request") < router.indexOf("const response = roomViewBounceResponseV229130(routed.request, requestEnv,"), "원본: 응답 마무리는 뗀 요청을 본다"), "wrappers see stripped request");
}

if (failures.length) {
  console.error(`방 전용 보기 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
