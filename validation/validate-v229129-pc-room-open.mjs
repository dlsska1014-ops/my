// 단톡방 ‘웹 가계부 열기’ 를 PC 카카오톡에서 눌렀을 때(2026-11-17 운영 진단 기록: 휴대폰은 카카오가 식별 값을 붙이고, PC 는 쓸 수 있는 사용자 식별 값 없이 연다).
//  사용자(2026-11-17): "앱 승인 담당자가 말했듯 웹 가계부 열기 누르면 로그인 없이 바로 가계부가 열려야해", "pc에서도 바로 열리게 해줘".
//  E-1 답 카드의 단추 주소는 /my?room=<그 방 가계부 번호> 다(방 표식). 1:1 답과 구성원이 아닌 때는 예전 주소 그대로다.
//  E-2 표식만 온 길(값 없음)에서 세션이 있으면: 그 가계부를 읽을 수 있을 때 그 가계부 홈, 아니면 표식을 뺀 /my — ‘찾을 수 없음’ 을 내지 않고 권한을 넓히지도 않는다.
//  E-3 세션이 없고 카카오톡 밖의 브라우저면: 화면 없는 카카오 로그인을 한 번 해 본다. 되면 그 방 가계부가 열리고, 안 되면 로그인 화면이 그 방 가계부로
//      돌아올 주소를 갖는다. 이미 해 봤거나(ab_kakao_auto) 꺼 두었거나 설정이 없으면 바로 로그인 화면이다. 새 계정은 만들지 않는다.
//  E-4 화면 없는 로그인(auto=1)이 카카오톡 밖의 브라우저에서 허락되는 것은 돌아갈 주소가 정확히 방 표식 주소이고 사람이 바로 연 이동
//      (Sec-Fetch-Site: none)일 때뿐이다. 다른 사이트가 시킨 이동·그 머리가 없는 요청은 로그인 화면으로 간다.
//  E-6 방 답의 다른 ‘웹가계부’ 링크 단추(설명서 카드 — 주소가 정확히 <origin>/my 인 것)에도 같은 표식이 실린다. 방 연결을 읽지 못하면 예전 주소 그대로다.
//  E-5 식별 값이 붙어 온 길(휴대폰·오픈빌더 고정 단추): 채팅으로만 쓰는 계정은 예전처럼 바로 열리고(표식은 빠진다), 웹 계정에 이어진·카카오 로그인이 붙은
//      계정은 세션을 받지 않되 카카오톡 밖의 브라우저에서는 방 표식 주소로 간다(예전에는 가계부 번호를 잃고 /my 시작 화면이었다). 인앱은 예전 그대로다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음, 카카오 서버는 흉내), 시계 2026-11-17 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드에서는 E-1(단추 주소)·E-2·E-3·E-4·E-5(PC 의 방 표식 주소) 단언이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, intercept, withClock } from "./lib-audit-v22934.mjs";
import { readPurposeToken } from "../src/index.js";
// 바탕 코드에는 이 함수가 없다 — 그때는 검사가 하나씩 실패하도록(불러오기 오류로 멈추지 않게) 이름으로 꺼낸다.
const kakaoRoomLedgerLinkOutputsV229129 = (await import("../src/modules/kakao/response-builders.js")).kakaoRoomLedgerLinkOutputsV229129 || (() => undefined);

const { ok, eq, done } = counter("단톡방 ‘웹 가계부 열기’: PC 에서도 방 가계부로(방 표식·화면 없는 카카오 로그인·로그인 뒤 돌아오기) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hex66 = (label) => createHash("sha256").update(`v229129-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229129-pc-room-open-secret";
const DAY = "2026-11-17";
const ROOM = hex66("room-a");
const ROOM_B = hex66("room-b");
const U1 = hex66("user-1"); // ROOM 의 첫 호출자(소유자)
const U2 = hex66("user-2"); // ROOM 의 구성원
const U3 = hex66("user-3"); // ROOM_B 에만 있음
const U_ALIAS = hex66("user-alias");
const U_UNKNOWN = hex66("user-unknown");
const INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const KAKAO_ID = "9129001";

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
  const raw = await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  let body = null;
  try { body = JSON.parse(raw); } catch (_) { body = null; }
  const outputs = body?.template?.outputs || [];
  const links = outputs.flatMap((output) => (output?.textCard?.buttons || output?.basicCard?.buttons || []).filter((button) => button?.action === "webLink").map((button) => ({ label: button.label, url: button.webLinkUrl })));
  const text = outputs.map((output) => output?.simpleText?.text || [output?.textCard?.title, output?.textCard?.description].filter(Boolean).join("\n")).join("\n");
  return { status: response.status, raw, text, links, ledger: links.filter((link) => link.label === "웹 가계부 열기") };
}

// 브라우저 한 번의 요청(따라가지 않는다). 쿠키는 통(jar)에 모은다.
class Jar {
  constructor() { this.items = new Map(); }
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
  user() { const raw = this.items.get("ab_user") || ""; return raw ? decodeURIComponent(raw).split("|")[0] : ""; }
}
// site: Sec-Fetch-Site 머리. 기본 "none" = 사람이 바로 연 이동(카카오톡이 띄운 브라우저·주소 입력). "" 이면 머리를 보내지 않는다.
async function go(fx, path, { ua = PC, jar = null, cookie = "", headers = {}, site = "none" } = {}) {
  const jobs = [];
  const line = jar ? jar.header() : cookie;
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...(site ? { "sec-fetch-site": site } : {}), ...(line ? { cookie: line } : {}), ...headers };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { method: "GET", headers: requestHeaders }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (jar) jar.take(cookies);
  return { status: response.status, location: response.headers.get("location") || "", cookies, headers: response.headers, html: await response.text() };
}
const tapped = (path, { user = U1, room = ROOM, appUserId = "1801267359" } = {}) => {
  const url = new URL(path, BASE);
  if (user !== null) url.searchParams.set("botUserKey", user);
  if (appUserId) url.searchParams.set("appUserId", appUserId);
  if (room !== null) url.searchParams.set("botGroupKey", room);
  return `${url.pathname}${url.search}`;
};
const issuesSession = (cookies) => cookies.some((line) => /^ab_user=[^;]/.test(line));
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const lastRoomOpen = () => events("kakao_room_open").at(-1)?.detail || "";
const lastEntry = () => events("kakao_room_entry").at(-1)?.detail || "";
// 진단 기록(설정 표): 방 표식 길의 결과는 kakao_room_open_probe_v229105:entry_<결과> 에 시각·판만 남는다.
const PROBE = "kakao_room_open_probe_v229105:";
const probeRows = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).startsWith(PROBE));
const probeKeys = (fx, slot) => {
  const row = fx.db.accountbook_settings.find((item) => item.key === `${PROBE}${slot}`);
  if (!row) return "";
  try { return Object.keys(typeof row.value === "string" ? JSON.parse(row.value) : row.value).sort().join(","); } catch (_) { return "unreadable"; }
};
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const entryPath = (householdId) => `/my?room=${householdId}`;
const quietStart = (householdId) => `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(entryPath(householdId))}`;
const loginScreen = (householdId) => `/my?auto=0&return_to=${encodeURIComponent(entryPath(householdId))}`;
const strongKakao = (userId) => ({ id: `ident-v229129-${userId}`, user_id: userId, provider: "kakao", provider_subject: KAKAO_ID, created_at: `${DAY}T01:00:00Z` });
const strongLocal = (userId) => ({ id: `ident-v229129-local-${userId}`, user_id: userId, provider: "local", provider_subject: "v229129room", credential_hash: "a".repeat(64), credential_salt: "b".repeat(32), credential_iterations: 100000, created_at: `${DAY}T01:00:00Z` });

// 카카오 서버 흉내(토큰·프로필). id 는 지금 그 브라우저에 로그인된 카카오 계정.
function kakaoServer() {
  const server = { id: KAKAO_ID, exchanges: 0, restore: () => {} };
  server.restore = intercept(async ({ url }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") { server.exchanges += 1; return json({ access_token: "qa-access-token", token_type: "bearer" }); }
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(server.id), properties: { nickname: "피시" } });
    return null;
  });
  return server;
}

// 방 가계부: U1 이 ROOM 에서 첫 기록(→ 방 가계부·소유자), U2 가 같은 방에서 기록(→ 구성원), U3 은 다른 방(ROOM_B)에서만 기록.
async function roomFixture(task, { kakao = true } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    if (kakao) Object.assign(fx.env, KAKAO_ENV);
    const server = kakaoServer();
    try {
      await say(fx, "점심 12000원", { user: U1, room: ROOM });
      await say(fx, "커피 4500원", { user: U2, room: ROOM });
      await say(fx, "택시 8000원", { user: U3, room: ROOM_B });
      const u1 = userByKey(fx, U1), u2 = userByKey(fx, U2), u3 = userByKey(fx, U3);
      const ownerOf = (userId) => fx.db.households.find((row) => fx.db.household_members.some((m) => m.user_id === userId && m.household_id === row.id && m.role === "owner") && row.name === ROOM_HOUSEHOLD_NAME);
      const household = ownerOf(u1?.id), householdB = ownerOf(u3?.id);
      if (!u1 || !u2 || !u3 || !household || !householdB) throw new Error("room fixture not ready");
      resetIsolateState();
      return await task(fx, { u1, u2, u3, hh: household.id, hhB: householdB.id, server });
    } finally {
      server.restore();
      resetIsolateState();
    }
  }));
}
// 채팅 계정 세션(식별 값이 붙은 길로 받는다 — 휴대폰에서 누른 것과 같다).
async function chatSession(fx, user, room = ROOM) {
  const jar = new Jar();
  const opened = await go(fx, tapped("/my", { user, room }), { ua: INAPP, jar });
  if (!jar.user()) throw new Error(`no chat session: ${opened.status} ${opened.location}`);
  return jar;
}

// ── E-1. 답 카드의 단추 주소 ────────────────────────────────────────────────
await roomFixture(async (fx, { hh, hhB }) => {
  for (const utterance of ["웹가계부", "웹 가계부 열기"]) {
    const owner = await say(fx, utterance, { user: U1, room: ROOM });
    check(() => eq(owner.ledger.length, 1, `E-1 소유자 ‘${utterance}’: ‘웹 가계부 열기’ 단추 하나`), `card count ${utterance}`);
    check(() => eq(owner.ledger[0]?.url, `${BASE}/my?room=${hh}`, `E-1 소유자 ‘${utterance}’: 단추 주소에 이 방 가계부 표식`), `card url ${utterance}`);
    check(() => ok(owner.text.includes("아래 버튼을 누르면 이 방 가계부가 열려요.") && !/https?:\/\//.test(owner.text), `E-1 ‘${utterance}’: 카드 글은 그대로이고 글에 주소가 없다`), `card text ${utterance}`);
  }
  const member = await say(fx, "웹가계부", { user: U2, room: ROOM });
  check(() => eq(member.ledger[0]?.url, `${BASE}/my?room=${hh}`, "E-1 구성원: 같은 방 표식"), "card url member");
  const other = await say(fx, "웹가계부", { user: U3, room: ROOM_B });
  check(() => eq(other.ledger[0]?.url, `${BASE}/my?room=${hhB}`, "E-1 다른 방: 그 방의 표식"), "card url other room");
  // 새 방의 첫 호출: 방 가계부가 준비되고(첫 호출자가 소유자) 그 번호가 실린다.
  const NEW_ROOM = hex66("room-new"), NEW_USER = hex66("user-new");
  const first = await say(fx, "웹가계부", { user: NEW_USER, room: NEW_ROOM });
  const created = fx.db.households.find((row) => fx.db.household_members.some((m) => m.user_id === userByKey(fx, NEW_USER)?.id && m.household_id === row.id && m.role === "owner"));
  check(() => ok(created?.id && first.ledger.length === 1 && first.ledger[0]?.url === `${BASE}/my?room=${created.id}`, `E-1 새 방의 첫 호출: 방금 준비한 방 가계부의 표식(${first.ledger[0]?.url})`), "card url new room");
  check(() => ok(first.text.includes("이 방의 공동 가계부를 준비했어요."), "E-1 새 방의 첫 호출: 준비 안내 줄은 그대로 앞에 붙는다"), "card new room lead");
  // 식별 값·남의 값이 주소에 실리지 않는다.
  check(() => ok(!/botUserKey|botGroupKey|appUserId/.test(JSON.stringify([first.links, member.links, other.links])), "E-1 단추 주소에 카카오 식별 값이 없다"), "card no kakao values");
  // 1:1 채팅: 방이 없으므로 방 표식도 없다.
  const direct = await say(fx, "웹가계부", { user: U1 });
  check(() => ok(!direct.raw.includes("room=") && direct.links.some((link) => link.url === `${BASE}/my`), "E-1 1:1 채팅의 답에는 방 표식이 없다(예전 주소 그대로)"), "direct no room");
});

// ── E-2. 표식만 온 길 — 세션이 있을 때 ─────────────────────────────────────────
await roomFixture(async (fx, { u1, u3, hh, hhB }) => {
  const owner = await chatSession(fx, U1);
  const open = await go(fx, entryPath(hh), { jar: owner });
  check(() => ok(open.status === 303 && open.location === `/app?household_id=${hh}`, `E-2 구성원 세션: 그 방 가계부 홈으로(${open.status} ${open.location})`), "session readable");
  check(() => ok(open.cookies.length === 0 && open.headers.get("referrer-policy") === "no-referrer", "E-2 구성원 세션: 쿠키를 건드리지 않고 Referrer-Policy no-referrer"), "session readable headers");
  check(() => eq(lastEntry(), "session_readable", "E-2 운영 이벤트 session_readable"), "session readable event");
  const home = await go(fx, open.location, { jar: owner });
  check(() => ok(home.status === 200 && home.html.includes(ROOM_HOUSEHOLD_NAME), "E-2 그 방 가계부 홈이 열린다"), "session home");
  // 남의 방 표식: 열리지 않고, ‘찾을 수 없음’ 도 아니고, 자기 가계부로 간다.
  const foreign = await go(fx, entryPath(hhB), { jar: owner });
  check(() => ok(foreign.status === 303 && foreign.location === "/my", `E-2 읽을 수 없는 가계부의 표식: 표식을 뺀 /my 로(${foreign.status} ${foreign.location})`), "session foreign");
  check(() => eq(lastEntry(), "session_other", "E-2 운영 이벤트 session_other"), "session foreign event");
  const own = await go(fx, foreign.location, { jar: owner });
  check(() => ok(own.status === 303 && own.location.includes(`household_id=${hh}`) && !own.location.includes(hhB), `E-2 그 뒤에는 자기 가계부가 열린다(${own.location})`), "session foreign own");
  // 직접 적은 남의 가계부 번호는 예전처럼 ‘찾을 수 없음’ 이다(표식이 그 규칙을 바꾸지 않는다).
  const explicit = await go(fx, `/app?household_id=${hhB}`, { jar: owner });
  check(() => ok(explicit.status === 404 || explicit.status === 403, `E-2 직접 적은 남의 가계부 번호는 예전처럼 열리지 않는다(${explicit.status})`), "explicit foreign");
  // 다른 방 사람(U3)이 이 방 표식을 열어도 이 방 가계부는 열리지 않는다.
  const outsider = await chatSession(fx, U3, ROOM_B).catch(() => null);
  if (outsider) {
    const tried = await go(fx, entryPath(hh), { jar: outsider });
    check(() => ok(tried.status === 303 && tried.location === "/my" && outsider.user() === u3.id, "E-2 다른 방 사람: 이 방 가계부가 열리지 않고 세션도 그대로"), "outsider");
  } else failures.push("outsider session: U3 chat session not issued");
  // 모양이 틀린 표식·두 번 온 표식은 버린다.
  for (const bad of ["/my?room=", "/my?room=a%2Fb", "/my?room=" + "x".repeat(81), `/my?room=${hh}&room=${hhB}`, "/my?room=%3Cscript%3E"]) {
    const out = await go(fx, bad, { jar: owner });
    check(() => ok(out.status === 303 && out.location === "/my" && out.cookies.length === 0, `E-2 틀린 표식은 버린다: ${bad.slice(0, 40)} → ${out.status} ${out.location}`), `bad ${bad.slice(0, 24)}`);
  }
  // 화면 이동이 아닌 요청(미리 읽기·fetch)은 건드리지 않는다.
  const fetched = await go(fx, entryPath(hh), { jar: owner, headers: { "sec-fetch-mode": "cors", accept: "application/json" } });
  check(() => ok(fetched.location !== `/app?household_id=${hh}`, `E-2 fetch 요청은 이 길이 받지 않는다(${fetched.status} ${fetched.location})`), "fetch untouched");
  const prefetch = await go(fx, entryPath(hh), { jar: owner, headers: { "sec-purpose": "prefetch" } });
  check(() => ok(prefetch.location !== `/app?household_id=${hh}`, "E-2 미리 읽기 요청은 이 길이 받지 않는다"), "prefetch untouched");
  // 웹 계정(픽스처의 소유자)도 자기 가계부 표식은 열린다.
  const web = await go(fx, entryPath("house-home"), { cookie: fx.cookie });
  check(() => ok(web.status === 303 && web.location === "/app?household_id=house-home", "E-2 웹 계정: 읽을 수 있는 가계부의 표식은 그 가계부로"), "web session");
  check(() => ok(u1.id && !JSON.stringify(globalThis.__AB_OPS_EVENTS || []).includes(hh), "E-2 운영 이벤트에 가계부 번호를 남기지 않는다"), "event no id");
  check(() => eq(probeKeys(fx, "entry_session_readable"), "app_version,at,version", "E-2 진단 기록 entry_session_readable 에는 시각·판만 남는다"), "probe session readable");
  check(() => eq(probeKeys(fx, "entry_session_other"), "app_version,at,version", "E-2 진단 기록 entry_session_other 에는 시각·판만 남는다"), "probe session other");
  check(() => ok(probeRows(fx).every((row) => ![hh, hhB, u1.id, U1, ROOM].some((secret) => JSON.stringify(row).includes(secret))), "E-2 진단 기록에 가계부 번호·계정·카카오 값이 없다"), "probe no ids");
});

// ── E-3. 표식만 온 길 — 세션이 없는 PC 브라우저 ─────────────────────────────────
await roomFixture(async (fx, { u1, hh }) => {
  fx.db.accountbook_user_identities.push(strongKakao(u1.id)); // U1 = 카카오 로그인이 붙은 계정(운영자 계정 같은 경우)
  // 1) 화면 없는 카카오 로그인으로 넘긴다.
  const jar = new Jar();
  const first = await go(fx, entryPath(hh), { jar });
  check(() => ok(first.status === 303 && first.location === quietStart(hh), `E-3 세션 없는 PC: 화면 없는 카카오 로그인 시작으로(${first.status} ${first.location})`), "pc quiet start");
  check(() => ok(first.cookies.length === 0 && first.headers.get("referrer-policy") === "no-referrer", "E-3 이 넘김은 쿠키를 주지 않는다"), "pc quiet no cookie");
  check(() => eq(lastEntry(), "quiet_login", "E-3 운영 이벤트 quiet_login"), "pc quiet event");
  check(() => eq(probeKeys(fx, "entry_quiet_login"), "app_version,at,version", "E-3 진단 기록 entry_quiet_login 에는 시각·판만 남는다"), "probe quiet login");
  const start = await go(fx, first.location, { jar });
  const authorize = new URL(start.location || "/", BASE);
  check(() => ok(start.status === 303 && authorize.origin + authorize.pathname === "https://kauth.kakao.com/oauth/authorize" && authorize.searchParams.get("prompt") === "none", `E-3 카카오 인가에 prompt=none 으로 간다(${start.location.slice(0, 80)})`), "pc authorize quiet");
  const state = await readPurposeToken(fx.env, "kakao-oauth", authorize.searchParams.get("state") || "");
  check(() => ok(state?.mode === "login" && state?.auto === 1 && state?.next === entryPath(hh), `E-3 서명된 상태: 자동 로그인·돌아갈 곳은 방 표식 주소(${JSON.stringify({ mode: state?.mode, auto: state?.auto, next: state?.next })})`), "pc state");
  check(() => ok(jar.items.get("ab_kakao_auto") === "try", "E-3 한 번 해 봤다는 표시(ab_kakao_auto=try)를 남긴다"), "pc try cookie");
  // 2) 그 브라우저에 카카오 로그인이 돼 있고 회원이면: 화면 없이 들어와 그 방 가계부가 열린다.
  const callback = await go(fx, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state") || "")}`, { jar, site: "cross-site" });
  check(() => ok(callback.status === 303 && callback.location === entryPath(hh) && jar.user() === u1.id, `E-3 콜백: 그 카카오 계정의 세션을 주고 방 표식 주소로 돌아온다(${callback.status} ${callback.location})`), "pc callback");
  const back = await go(fx, callback.location, { jar, site: "cross-site" });
  check(() => ok(back.status === 303 && back.location === `/app?household_id=${hh}`, "E-3 돌아와서는 그 방 가계부 홈으로"), "pc back");
  const home = await go(fx, back.location, { jar, site: "cross-site" });
  check(() => ok(home.status === 200 && home.html.includes(ROOM_HOUSEHOLD_NAME) && !home.html.includes('id="abKakaoStart"'), "E-3 로그인 화면 없이 그 방 가계부 홈이 열린다"), "pc home");
});
await roomFixture(async (fx, { u1, hh }) => {
  fx.db.accountbook_user_identities.push(strongKakao(u1.id));
  // 3) 그 브라우저에 카카오 로그인이 없으면(카카오가 login_required 로 답함): 로그인 화면이 돌아올 주소를 갖고 열린다. 되풀이하지 않는다.
  const jar = new Jar();
  const first = await go(fx, entryPath(hh), { jar });
  const start = await go(fx, first.location, { jar });
  const authorize = new URL(start.location || "/", BASE);
  const denied = await go(fx, `/auth/kakao/callback?error=login_required&state=${encodeURIComponent(authorize.searchParams.get("state") || "")}`, { jar, site: "cross-site" });
  check(() => ok(denied.status === 303 && denied.location === loginScreen(hh) && !jar.user(), `E-3 화면 없는 로그인이 안 되면 로그인 화면으로(돌아올 주소 포함): ${denied.status} ${denied.location}`), "pc denied");
  check(() => ok(jar.items.get("ab_kakao_auto") === "skip", "E-3 다시 보내지 않게 표시(ab_kakao_auto=skip)를 남긴다"), "pc skip cookie");
  const screen = await go(fx, denied.location, { jar, site: "cross-site" });
  {
    const kakaoForm = (/<form class="kakaoStart" method="get" action="\/auth\/kakao\/start">[\s\S]*?<\/form>/.exec(screen.html) || [""])[0];
    const hidden = `name="return_to" value="${entryPath(hh)}"`;
    check(() => ok(screen.status === 200 && kakaoForm.includes(hidden), `E-3 로그인 화면의 카카오 로그인 단추가 방 표식 주소로 돌아오게 돼 있다(${kakaoForm.length})`), "pc login screen return");
    check(() => ok(screen.html.split(hidden).length - 1 >= 2, "E-3 로그인 화면의 다른 로그인 칸도 같은 돌아올 주소를 갖는다"), "pc login screen other forms");
  }
  const again = await go(fx, entryPath(hh), { jar });
  check(() => ok(again.status === 303 && again.location === loginScreen(hh), `E-3 이미 해 본 브라우저는 다시 카카오로 보내지 않는다(${again.location})`), "pc no loop");
  check(() => eq(lastEntry(), "login_screen", "E-3 운영 이벤트 login_screen"), "pc login screen event");
  check(() => eq(probeKeys(fx, "entry_login_screen"), "app_version,at,version", "E-3 진단 기록 entry_login_screen 에는 시각·판만 남는다"), "probe login screen");
  // 4) 로그인 화면에서 직접 카카오 로그인(화면 있는 로그인)을 하면 그 방 가계부로 돌아온다.
  const manual = await go(fx, `/auth/kakao/start?return_to=${encodeURIComponent(entryPath(hh))}`, { jar, site: "same-origin" });
  const manualAuthorize = new URL(manual.location || "/", BASE);
  check(() => ok(manualAuthorize.searchParams.get("prompt") !== "none", "E-3 직접 누른 카카오 로그인은 화면 있는 로그인이다(prompt=none 아님)"), "pc manual prompt");
  const manualBack = await go(fx, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(manualAuthorize.searchParams.get("state") || "")}`, { jar, site: "cross-site" });
  check(() => ok(manualBack.status === 303 && manualBack.location === entryPath(hh) && jar.user() === u1.id, `E-3 직접 로그인한 뒤 방 표식 주소로 돌아온다(${manualBack.location})`), "pc manual back");
  const manualHome = await go(fx, manualBack.location, { jar, site: "cross-site" });
  check(() => eq(manualHome.location, `/app?household_id=${hh}`, "E-3 그리고 그 방 가계부 홈으로"), "pc manual home");
});
await roomFixture(async (fx, { hh }) => {
  // 5) 회원이 아닌 카카오 계정(웹 계정 없음): 화면 없는 로그인은 새 계정을 만들지 않고 로그인 화면으로 간다.
  const before = fx.db.users.length;
  const jar = new Jar();
  const first = await go(fx, entryPath(hh), { jar });
  const start = await go(fx, first.location, { jar });
  const authorize = new URL(start.location || "/", BASE);
  const callback = await go(fx, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(authorize.searchParams.get("state") || "")}`, { jar, site: "cross-site" });
  check(() => ok(callback.status === 303 && callback.location === loginScreen(hh) && !jar.user(), `E-3 회원이 아닌 카카오 계정: 로그인 화면으로(${callback.location})`), "pc nonmember");
  check(() => eq(fx.db.users.length, before, "E-3 화면 없는 로그인은 새 계정을 만들지 않는다"), "pc no new account");
  // 6) 관리자 쿠키 브라우저·인앱 브라우저는 이 길이 받지 않는다(예전 그대로).
  const admin = await go(fx, entryPath(hh), { cookie: "ab_admin=x" });
  check(() => ok(!(admin.status === 303 && admin.location.startsWith("/auth/kakao/start")), `E-3 관리자 쿠키 브라우저는 카카오로 보내지 않는다(${admin.status} ${admin.location})`), "admin browser");
  const inapp = await go(fx, entryPath(hh), { ua: INAPP });
  check(() => ok(inapp.status === 303 && inapp.location === quietStart(hh), `E-3 인앱 브라우저: 예전의 인앱 자동 로그인이 맡고 돌아갈 주소에 방 표식이 실린다(${inapp.location})`), "inapp same target");
});
await roomFixture(async (fx, { u1, hh }) => {
  // 6-1) 다른 사이트의 링크·넘김이 시킨 이동, 같은 사이트 안의 이동, 그 머리가 없는 요청: 화면 없는 로그인을 하지 않고 로그인 화면으로 간다.
  fx.db.accountbook_user_identities.push(strongKakao(u1.id));
  for (const [label, site] of [["다른 사이트", "cross-site"], ["같은 사이트의 다른 주소", "same-site"], ["같은 출처", "same-origin"], ["머리 없음", ""]]) {
    const out = await go(fx, entryPath(hh), { site });
    check(() => ok(out.status === 303 && out.location === loginScreen(hh) && out.cookies.length === 0, `E-3 ${label}에서 온 이동: 화면 없는 로그인 없이 로그인 화면으로(${out.status} ${out.location})`), `indirect ${label}`);
    check(() => eq(lastEntry(), "login_screen_indirect", `E-3 ${label}: 운영 이벤트 login_screen_indirect`), `indirect event ${label}`);
  }
  check(() => eq(probeKeys(fx, "entry_login_screen_indirect"), "app_version,at,version", "E-3 진단 기록 entry_login_screen_indirect 에는 시각·판만 남는다"), "probe indirect");
  // 세션이 있으면 어디서 왔든 그 방 가계부로 간다(로그인을 만들지 않는 넘김이라 막지 않는다 — 카카오에서 돌아온 길이 이 꼴이다).
  const owner = await chatSession(fx, U2);
  const crossWithSession = await go(fx, entryPath(hh), { jar: owner, site: "cross-site" });
  check(() => eq(crossWithSession.location, `/app?household_id=${hh}`, "E-3 세션이 있으면 다른 사이트에서 온 이동도 그 방 가계부로"), "cross with session");
  // 링크 미리보기 수집기는 이 길이 받지 않는다(카카오로 보내지 않는다).
  for (const ua of ["facebookexternalhit/1.1", "kakaotalk-scrap/1.0", "Mozilla/5.0 (compatible; Googlebot/2.1)"]) {
    const crawler = await go(fx, entryPath(hh), { ua });
    check(() => ok(!crawler.location.startsWith("/auth/kakao/start") && crawler.location !== loginScreen(hh), `E-3 수집기(${ua.slice(0, 20)})는 이 길이 받지 않는다(${crawler.status} ${crawler.location})`), `crawler ${ua.slice(0, 12)}`);
  }
  // 직접 로그아웃한 브라우저(ab_kakao_auto=off)는 다시 말없이 로그인시키지 않는다.
  const off = await go(fx, entryPath(hh), { cookie: "ab_kakao_auto=off" });
  check(() => eq(off.location, loginScreen(hh), "E-3 직접 로그아웃한 브라우저는 화면 없는 로그인을 하지 않는다"), "logout off");
});
await roomFixture(async (fx, { hh }) => {
  // 7) 자동 로그인을 꺼 두었으면 바로 로그인 화면.
  fx.env.KAKAO_INAPP_AUTO_LOGIN = "0";
  const off = await go(fx, entryPath(hh));
  check(() => ok(off.status === 303 && off.location === loginScreen(hh), `E-3 자동 로그인을 끈 운영: 바로 로그인 화면(${off.location})`), "auto off");
});
await roomFixture(async (fx, { hh }) => {
  // 8) 카카오 로그인 설정이 없으면 바로 로그인 화면(카카오로 보내지 않는다).
  const none = await go(fx, entryPath(hh));
  check(() => ok(none.status === 303 && none.location === loginScreen(hh), `E-3 카카오 로그인 설정이 없는 운영: 바로 로그인 화면(${none.location})`), "kakao not ready");
  const screen = await go(fx, none.location);
  check(() => eq(screen.status, 200, "E-3 그 로그인 화면이 열린다"), "kakao not ready screen");
}, { kakao: false });

// ── E-4. 화면 없는 로그인을 허락하는 조건 ───────────────────────────────────────
await roomFixture(async (fx, { hh }) => {
  const prompt = async (path, ua, site = "none") => { const out = await go(fx, path, { ua, site }); const location = new URL(out.location || "/", BASE); const state = location.searchParams.get("state") ? await readPurposeToken(fx.env, "kakao-oauth", location.searchParams.get("state")) : null; return { out, quiet: location.searchParams.get("prompt") === "none", auto: state?.auto === 1, next: state?.next || "" }; };
  const exact = await prompt(quietStart(hh), PC);
  check(() => ok(exact.quiet && exact.auto, "E-4 PC: 돌아갈 주소가 방 표식 주소이면 화면 없는 로그인"), "exact quiet");
  for (const [label, returnTo] of [["다른 화면", "/app"], ["가계부 번호를 직접 적은 주소", `/app?household_id=${hh}`], ["표식에 다른 값이 더 붙은 주소", `${entryPath(hh)}&x=1`], ["모양이 틀린 표식", "/my?room=a%2Fb"], ["빈 표식", "/my?room="], ["표식 둘", `${entryPath(hh)}&room=${hh}`], ["돌아갈 주소 없음", ""]]) {
    const path = `/auth/kakao/start?auto=1${returnTo ? `&return_to=${encodeURIComponent(returnTo)}` : ""}`;
    const other = await prompt(path, PC);
    check(() => ok(!other.quiet && !other.auto, `E-4 PC: ${label}로는 화면 없는 로그인이 아니다(${other.out.location.slice(0, 60)})`), `not quiet ${label}`);
  }
  for (const [label, site] of [["다른 사이트", "cross-site"], ["같은 출처", "same-origin"], ["머리 없음", ""]]) {
    const indirect = await prompt(quietStart(hh), PC, site);
    check(() => ok(!indirect.quiet && !indirect.auto, `E-4 PC: 방 표식 주소라도 ${label}에서 온 시작은 화면 없는 로그인이 아니다`), `start indirect ${label}`);
  }
  const inapp = await prompt("/auth/kakao/start?auto=1&return_to=%2Fapp", INAPP, "cross-site");
  check(() => ok(inapp.quiet && inapp.auto, "E-4 인앱 브라우저는 예전처럼 어느 화면이든·어디서 왔든 화면 없는 로그인"), "inapp quiet");
  const link = await prompt(`/auth/kakao/start?auto=1&link=1&return_to=${encodeURIComponent(entryPath(hh))}`, PC);
  check(() => ok(!link.quiet, "E-4 계정 잇기(link=1)는 화면 없는 로그인이 아니다"), "link not quiet");
});

// ── E-5. 식별 값이 붙어 온 길 ──────────────────────────────────────────────────
await roomFixture(async (fx, { u1, u2, hh }) => {
  // 채팅으로만 쓰는 계정: 예전처럼 바로 열린다. 방 표식은 빠진다(PC·인앱 모두).
  for (const [name, ua] of [["인앱", INAPP], ["PC", PC]]) {
    const jar = new Jar();
    const open = await go(fx, tapped(entryPath(hh), { user: U2 }), { ua, jar });
    check(() => ok(open.status === 303 && open.location === `/app?household_id=${hh}` && jar.user() === u2.id, `E-5 ${name} 채팅 계정: 세션을 받고 그 방 가계부 홈으로(표식 없음): ${open.location}`), `chat ok ${name}`);
    check(() => eq(lastRoomOpen(), "ok", `E-5 ${name} 채팅 계정: 결과 ok`), `chat ok event ${name}`);
  }
  // 카카오 로그인이 붙은 계정: 세션을 주지 않는다. 인앱은 예전 주소, PC 는 방 표식 주소.
  fx.db.accountbook_user_identities.push(strongKakao(u1.id));
  const inapp = await go(fx, tapped("/my"), { ua: INAPP });
  check(() => ok(inapp.status === 303 && inapp.location === `/app?household_id=${hh}` && !issuesSession(inapp.cookies), `E-5 인앱 카카오 로그인 계정: 예전처럼 그 방 가계부 주소로(세션 없음): ${inapp.location}`), "strong inapp");
  const pc = await go(fx, tapped("/my"), { ua: PC });
  check(() => ok(pc.status === 303 && pc.location === entryPath(hh) && !issuesSession(pc.cookies), `E-5 PC 카카오 로그인 계정: 방 표식 주소로(세션 없음): ${pc.location}`), "strong pc");
  check(() => eq(lastRoomOpen(), "strong_account", "E-5 PC 카카오 로그인 계정: 결과 strong_account"), "strong pc event");
  const next = await go(fx, pc.location, { ua: PC });
  check(() => eq(next.location, quietStart(hh), "E-5 그다음은 화면 없는 카카오 로그인 시도"), "strong pc next");
  check(() => ok(!/botUserKey|botGroupKey|appUserId/.test(pc.location + next.location), "E-5 넘기는 주소에 카카오 식별 값이 없다"), "strong pc no values");
  // 우리 단추(방 표식이 이미 붙은 주소)에 식별 값이 온 경우도 같다.
  const pcMarked = await go(fx, tapped(entryPath(hh)), { ua: PC });
  check(() => eq(pcMarked.location, entryPath(hh), "E-5 방 표식이 붙은 단추 + 식별 값(PC, 카카오 로그인 계정): 방 표식 주소 하나로"), "strong pc marked");
});
await roomFixture(async (fx, { hh }) => {
  // 웹 계정에 이어진 사람(별칭): 같은 규칙.
  const links = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "user_identity_links")?.value || "{}");
  links[`skill_identity:${U_ALIAS}`] = { user_id: "user-wifi", source: "skill", linked_at: `${DAY}T01:00:00Z` };
  const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
  if (row) row.value = JSON.stringify(links); else fx.db.accountbook_settings.push({ key: "user_identity_links", value: JSON.stringify(links) });
  fx.db.household_members.push({ household_id: hh, user_id: "user-wifi", role: "member", created_at: `${DAY}T01:00:00Z` });
  globalThis.__AB_EFFECTIVE_USER_CACHE?.clear?.();
  const inapp = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: INAPP });
  const pc = await go(fx, tapped("/my", { user: U_ALIAS }), { ua: PC });
  if (lastRoomOpen() === "linked_account") {
    check(() => ok(inapp.location === `/app?household_id=${hh}` && !issuesSession(inapp.cookies), `E-5 인앱 이어진 계정: 예전 주소(${inapp.location})`), "linked inapp");
    check(() => ok(pc.location === entryPath(hh) && !issuesSession(pc.cookies), `E-5 PC 이어진 계정: 방 표식 주소(${pc.location})`), "linked pc");
  } else failures.push(`linked fixture: expected linked_account, got ${lastRoomOpen()} (${pc.status} ${pc.location})`);
  // 모르는 사용자 키: 세션 없음, 값을 뺀 같은 주소(우리 단추면 방 표식이 남아 다음 걸음이 이어 받는다).
  const unknown = await go(fx, tapped(entryPath(hh), { user: U_UNKNOWN }), { ua: PC });
  check(() => ok(unknown.status === 303 && unknown.location === entryPath(hh) && !issuesSession(unknown.cookies), `E-5 모르는 사용자 키 + 방 표식: 값을 뺀 방 표식 주소(${unknown.location})`), "unknown marked");
  const unknownPlain = await go(fx, tapped("/my", { user: U_UNKNOWN }), { ua: PC });
  check(() => eq(unknownPlain.location, "/my", "E-5 모르는 사용자 키(표식 없는 주소): 예전처럼 /my"), "unknown plain");
  // 사용자 키가 없는 PC 링크(2026-11-17 운영에서 본 꼴): 값을 뺀 방 표식 주소.
  const noUser = await go(fx, tapped(entryPath(hh), { user: null }), { ua: PC });
  check(() => ok(noUser.location === entryPath(hh) && lastRoomOpen() === "no_user_key", `E-5 사용자 키가 없는 링크 + 방 표식: 방 표식 주소(${noUser.location}, ${lastRoomOpen()})`), "no user key marked");
});
await roomFixture(async (fx, { u1, hh }) => {
  // 로그인 이름 비밀번호만 붙은 계정: 예전 그대로(로그인 이름 칸을 연 로그인 화면, 그 방 가계부로 돌아옴).
  fx.db.accountbook_user_identities.push(strongLocal(u1.id));
  const pc = await go(fx, tapped("/my"), { ua: PC });
  check(() => ok(pc.status === 303 && pc.location.startsWith("/my?auto=0&login=1&return_to=") && pc.location.includes(encodeURIComponent(`/app?household_id=${hh}`)) && lastRoomOpen() === "strong_local_account", `E-5 로그인 이름 계정: 예전 그대로(${pc.location})`), "strong local unchanged");
});

// ── E-6. 방 답의 다른 ‘웹가계부’ 링크 단추 ───────────────────────────────────────
await roomFixture(async (fx, { hh, hhB }) => {
  const webLinks = (reply) => reply.links.filter((link) => link.label === "웹가계부");
  for (const utterance of ["웹관리하기", "정기지출"]) {
    const card = await say(fx, utterance, { user: U1, room: ROOM });
    check(() => ok(webLinks(card).length === 1 && webLinks(card)[0].url === `${BASE}/my?room=${hh}`, `E-6 방의 설명서 ‘${utterance}’: [웹가계부] 단추에 이 방 가계부 표식(${webLinks(card)[0]?.url})`), `manual ${utterance}`);
  }
  const otherRoom = await say(fx, "웹관리하기", { user: U3, room: ROOM_B });
  check(() => eq(webLinks(otherRoom)[0]?.url, `${BASE}/my?room=${hhB}`, "E-6 다른 방의 설명서: 그 방의 표식"), "manual other room");
  // 아직 방 가계부를 부른 적이 없는 사람이 눌러도(그 사람은 답 뒤에 들어온다) 단추는 이 방을 가리킨다.
  const stranger = await say(fx, "웹관리하기", { user: hex66("user-stranger"), room: ROOM });
  check(() => eq(webLinks(stranger)[0]?.url, `${BASE}/my?room=${hh}`, "E-6 처음 부른 사람의 설명서: 이 방의 표식"), "manual stranger");
  // 가계부가 아직 없는 방: 표식을 지어내지 않는다(예전 주소 그대로).
  const fresh = await say(fx, "웹관리하기", { user: hex66("user-fresh"), room: hex66("room-fresh") });
  check(() => eq(webLinks(fresh)[0]?.url, `${BASE}/my`, "E-6 가계부가 아직 없는 방: 예전 주소 그대로"), "manual fresh room");
  // 1:1 채팅의 설명서: 링크 단추로 바꾸지 않는다(예전 그대로 메시지 단추).
  const direct = await say(fx, "웹관리하기", { user: U1 });
  check(() => ok(!direct.raw.includes("room=") && !direct.links.length, "E-6 1:1 채팅의 설명서에는 방 표식이 없다"), "manual direct");
  // 다른 주소의 링크 단추(가계부 번호를 직접 실은 분석 화면 등)는 건드리지 않는다.
  const summary = await say(fx, "이번달요약", { user: U1, room: ROOM });
  check(() => ok(summary.links.length >= 1 && summary.links.every((link) => !link.url.includes("room=")), `E-6 다른 화면으로 가는 단추는 그대로(${summary.links.map((link) => new URL(link.url).pathname).join(",")})`), "other links untouched");
  // 방 연결을 읽지 못하면: 답은 그대로 나가고(200) 단추는 예전 주소다.
  const restore = intercept(async ({ url }) => (url.pathname === "/rest/v1/accountbook_settings" && /kakao_group_link|group_link/.test(decodeURIComponent(url.search)) ? new Response("upstream", { status: 503 }) : null));
  let failed;
  try { failed = await say(fx, "웹관리하기", { user: U1, room: ROOM }); } finally { restore(); }
  check(() => ok(failed.status === 200 && webLinks(failed).length === 1 && webLinks(failed)[0].url === `${BASE}/my`, `E-6 방 연결을 읽지 못하면 예전 주소로 답한다(${failed.status} ${webLinks(failed)[0]?.url})`), "manual read failed");
  // 읽기 한 번만 더한다(방 연결 한 줄).
  let reads = 0;
  const count = intercept(async ({ url }) => { if (url.pathname.startsWith("/rest/v1/")) reads += 1; return null; });
  try { await say(fx, "웹관리하기", { user: U1, room: ROOM }); } finally { count(); }
  let plainReads = 0;
  const countPlain = intercept(async ({ url }) => { if (url.pathname.startsWith("/rest/v1/")) plainReads += 1; return null; });
  try { await say(fx, "함께쓰기", { user: U1, room: ROOM }); } finally { countPlain(); }
  check(() => ok(reads >= 1 && reads <= plainReads + 1, `E-6 [웹가계부] 단추가 있는 설명서 답은 DB 호출을 하나만 더 쓴다(${reads} 대 ${plainReads})`), "manual one more read");
});
// 순수 변환: 정확히 <origin>/my 인 링크 단추만 바꾼다.
{
  const outputs = [
    { simpleText: { text: "글" } },
    { textCard: { title: "t", buttons: [
      { label: "웹가계부", action: "webLink", webLinkUrl: `${BASE}/my` },
      { label: "설정", action: "webLink", webLinkUrl: `${BASE}/my/settings` },
      { label: "표식 있음", action: "webLink", webLinkUrl: `${BASE}/my?room=other` },
      { label: "바깥", action: "webLink", webLinkUrl: "https://example.com/my" },
      { label: "메시지", action: "message", messageText: `${BASE}/my` },
    ] } },
  ];
  const next = kakaoRoomLedgerLinkOutputsV229129(outputs, BASE, "hh-1");
  check(() => ok(next && next[1].textCard.buttons[0].webLinkUrl === `${BASE}/my?room=hh-1`, "E-6 변환: 정확히 /my 인 링크 단추에 표식"), "pure marked");
  check(() => ok(next && next[1].textCard.buttons.slice(1).every((button, index) => JSON.stringify(button) === JSON.stringify(outputs[1].textCard.buttons[index + 1])) && next[0] === outputs[0], "E-6 변환: 다른 단추·다른 출력은 그대로"), "pure untouched");
  check(() => eq(outputs[1].textCard.buttons[0].webLinkUrl, `${BASE}/my`, "E-6 변환: 받은 값을 고치지 않는다"), "pure no mutation");
  for (const [label, id] of [["빈 번호", ""], ["모양이 틀린 번호", "a/b"], ["너무 긴 번호", "x".repeat(81)], ["꺾쇠", "<x>"]]) {
    check(() => eq(kakaoRoomLedgerLinkOutputsV229129(outputs, BASE, id), null, `E-6 변환: ${label}는 바꾸지 않는다`), `pure bad id ${label}`);
  }
  check(() => eq(kakaoRoomLedgerLinkOutputsV229129([{ simpleText: { text: "x" } }], BASE, "hh-1"), null, "E-6 변환: 그런 단추가 없으면 null"), "pure none");
  check(() => eq(kakaoRoomLedgerLinkOutputsV229129(outputs, "", "hh-1"), null, "E-6 변환: origin 이 없으면 null"), "pure no origin");
}

// ── 원본: 부르는 자리와 조건 ───────────────────────────────────────────────────
{
  const router = read("src/modules/worker/router.js");
  const open = router.indexOf("await kakaoRoomOpenResponse(request, env, url, ctx)");
  const entry = router.indexOf("await kakaoRoomEntryResponse(request, env, url, ctx)");
  const auto = router.indexOf("await kakaoInAppAutoLoginResponse(request, env, url)");
  check(() => ok(open > 0 && entry > open && auto > entry, "원본: 라우터가 식별 값 길 → 방 표식 길 → 인앱 자동 로그인 차례로 부른다"), "router order");
  const mod = read("src/modules/auth/kakao-room-open.js");
  const body = mod.slice(mod.indexOf("async function kakaoRoomEntryResponse"));
  check(() => ok(!/makeUserSession|ab_user=/.test(body.slice(0, body.indexOf("// @build:exports-start"))), "원본: 방 표식 길은 세션을 만들지 않는다"), "entry no session");
}

if (failures.length) {
  console.error(`실패 ${failures.length}건:`);
  for (const line of failures.slice(0, Number(process.env.AB_SHOW_FAILURES) || 80)) console.error(`  - ${line}`);
  process.exit(1);
}
done();
