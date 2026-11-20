// 여는 중 화면: 가계부로 들어오는 첫 요청에 저장소를 읽기 전에 로딩 화면(퍼센트가 오르는 한 장)을 먼저 보낸다.
//  사용자(2026-11-20): "모바일에서 웹 가계부 들어갈떼 오래걸려서 멈춘것 같아 로딩화면처럼 만들어서 퍼센트 올라가는것 처럼 개선해서 멈춘게 아니라는 인식이
//  필요해 그냥 빙글빙글 도는 에니메이션도 뭔가 버그라서 멈춘걸로 인식할 수도 있잖아".
//  P-1 주는 요청: 사람이 바로 연(Sec-Fetch-Site: none) /my·/app·/m 의 화면 이동 가운데 카카오톡 안의 브라우저이거나 세션 쿠키가 있는 것.
//      주지 않는 요청: 카카오 값이 붙은 주소, 카카오톡 밖 브라우저의 방 표식, 로그인 화면을 바로 여는 주소, 세션 없는 보통 브라우저, 머리가 없는 요청,
//      미리 읽기, 다른 주소, GET 이 아닌 요청, 끈 운영.
//  P-2 화면 한 장: 바깥 파일을 부르지 않는다, 쿠키를 주지 않는다, 요청의 값은 표식을 붙인 주소(글자를 바꿔 적은 것)로만 실린다, 머리·크기.
//  P-3 움직임: transform·opacity 의 애니메이션뿐이고 steps·delay 가 없다. 숫자 띠와 막대는 늘 오르고 99 에서 끝난다(100 은 없다).
//  P-4 화면의 스크립트: 화면을 그린 뒤에 같은 주소를 다시 열고(# 이 있으면 새로 고침), 같은 탭에서 또 받았거나 탭 기억을 쓸 수 없으면 표식을 붙인다.
//  P-5 끼워도 결과가 같다: 장면마다 끈 운영과 켠 운영의 넘김·끝 화면·세션·쿠키·진단 기록·저장소가 같다(둘째 요청의 다섯 방식, 카카오 로그인 왕복 포함).
//  P-6 되풀이가 없다: 표식이 붙은 요청과 바로 연 이동이 아닌 요청에는 어떤 경우에도 주지 않는다.
//  P-7 응답 마무리(공지 띠·설정 띠·포인트 색)가 이 화면을 건드리지 않는다. 표식은 처리기에 가기 전에 떼어진다(세 주소에서만). 오류는 예전 처리로 돌아간다.
//  P-8 결과 기록: 설정 표에 시각·판·횟수만, 기기별로.
//  P-9 원본: Sec-Fetch-Site 를 읽는 곳의 목록(늘면 이 화면을 주는 조건을 다시 본다), 카카오 값 이름, 라우터의 자리, 쿠키를 쓰지 않음.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-11-20 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드(이 화면이 없는 판)에서는 P-1~P-8 의 단언 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import vm from "node:vm";
import { app, BASE, counter, fixture, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("여는 중 화면: 가계부 첫 요청에 로딩 화면을 먼저(주는 조건·화면·움직임·스크립트·끼워도 같은 결과·되풀이 없음) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 320)}`); } };
const read = (path) => { try { return readFileSync(new URL(`../${path}`, import.meta.url), "utf8"); } catch (_) { return ""; } }; // 없는 파일은 빈 글(바탕 코드에서도 끝까지 돌아 실패를 센다)
const hex66 = (label) => createHash("sha256").update(`v229132-${label}`).digest("hex") + "ab";

const SECRET = "validate-v229132-entry-progress-secret";
const DAY = "2026-11-20";
const ROOM = hex66("room-a");
const ROOM_B = hex66("room-b");
const U1 = hex66("user-1"); // ROOM 의 첫 호출자(소유자)
const U2 = hex66("user-2"); // ROOM 의 구성원(채팅으로만 쓰는 계정)
const U3 = hex66("user-3"); // ROOM_B 의 첫 호출자
const U_ALIAS = hex66("user-alias"); // 웹 계정(user-wifi)에 이어진 채팅 키
const U_NOBODY = hex66("user-nobody"); // 어느 계정도 아닌 키
const WEB_USER = "user-wifi";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; SM-S918N) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36";
const IPHONE = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Mobile/15E148 Safari/604.1";
const INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430";
const INAPP_IOS = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 11.2.0";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const SHELL_TITLE = "말해가계부 · 여는 중";
const PROBE_PREFIX = "entry_progress_probe_v229132:";
const marked = (path, digit = 1) => `${path}${path.includes("?") ? "&" : "?"}_o=${digit}`;

function resetIsolateState() {
  for (const name of ["__AB_ENTRY_PROGRESS_PROBE", "__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
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

// 브라우저의 쿠키 통.
class Jar {
  constructor(from = null) { this.items = new Map(from ? from.items : []); }
  static of(header = "") { const jar = new Jar(); for (const part of String(header).split(";")) { const at = part.indexOf("="); if (at > 0) jar.items.set(part.slice(0, at).trim(), part.slice(at + 1).trim()); } return jar; }
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
  // 견줄 쿠키 모습: 이름과 값(세션 표는 만든 때가 값에 들어 있어 사용자·범위로 적는다).
  snapshot() { return [...this.items].map(([name, value]) => (name === "ab_user" ? `ab_user=<${this.user()}|${this.scope()}|${this.parts().length}칸>` : `${name}=${value}`)).sort().join("; "); }
}

// 브라우저 한 번의 요청(따라가지 않는다).
//  site: Sec-Fetch-Site("" 이면 보내지 않는다). dest: Sec-Fetch-Dest — 요즘 브라우저의 화면 이동은 document 를 보낸다("" 이면 보내지 않는다 = 옛 브라우저·도구).
//  gesture: 사람이 누른 표시(Sec-Fetch-User: ?1) — 주소를 직접 열거나 링크를 누른 이동에 붙고, 스크립트가 시킨 이동에는 없다.
async function send(fx, path, { method = "GET", ua = PC, jar = null, cookie = "", site = "none", mode = "navigate", dest = "document", gesture = null, headers = {}, accept = "text/html" } = {}) {
  const jobs = [];
  const line = [jar ? jar.header() : "", cookie].filter(Boolean).join("; ");
  const pressed = gesture === null ? site === "none" : gesture;
  const requestHeaders = {
    "user-agent": ua, accept,
    ...(mode ? { "sec-fetch-mode": mode } : {}), ...(site ? { "sec-fetch-site": site } : {}), ...(dest ? { "sec-fetch-dest": dest } : {}), ...(pressed && site ? { "sec-fetch-user": "?1" } : {}),
    ...(method === "POST" ? { "content-type": "application/x-www-form-urlencoded", origin: BASE } : {}),
    ...(line ? { cookie: line } : {}), ...headers,
  };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { method, headers: requestHeaders, ...(method === "POST" ? { body: "" } : {}) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (jar) jar.take(cookies);
  const html = method === "HEAD" ? "" : await response.text();
  return { status: response.status, location: response.headers.get("location") || "", cookies, headers: response.headers, type: response.headers.get("content-type") || "", html, title: (/<title>([^<]*)<\/title>/.exec(html) || ["", ""])[1] };
}
const isShell = (result) => result.status === 200 && result.title === SHELL_TITLE && result.html.includes('class="abOpeningStrip"');
const tapped = (path, { user = U1, room = ROOM } = {}) => {
  const url = new URL(path, BASE);
  if (user !== null) url.searchParams.set("botUserKey", user);
  url.searchParams.set("appUserId", "1801267359");
  if (room !== null) url.searchParams.set("botGroupKey", room);
  return `${url.pathname}${url.search}`;
};
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const opsEvents = () => (globalThis.__AB_OPS_EVENTS || []).filter((event) => !/^entry_progress/.test(event.kind)).map((event) => `${event.kind}|${event.severity}|${event.detail}`);
const unescapeHtml = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const strongKakao = (userId) => ({ id: `ident-v229132-${userId}`, user_id: userId, provider: "kakao", provider_subject: "9132001", created_at: `${DAY}T01:00:00Z` });
const strongLocal = (userId) => ({ id: `ident-v229132-local-${userId}`, user_id: userId, provider: "local", provider_subject: "v229132room", credential_hash: "a".repeat(64), credential_salt: "b".repeat(32), credential_iterations: 100000, created_at: `${DAY}T01:00:00Z` });

// 방 둘(ROOM = U1 소유·U2 구성원, ROOM_B = U3 소유)과, 웹 계정 user-wifi 를 ROOM 의 가계부 구성원으로 두고 채팅 키 U_ALIAS 를 그 웹 계정에 잇는다.
async function world(task, { role = "member", env = {} } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
    delete fx.env.KAKAO_ROOM_QUIET_LOGIN;
    delete fx.env.ENTRY_PROGRESS_DISABLED;
    try {
      await say(fx, "별빛국수 12000원", { user: U1, room: ROOM });
      await say(fx, "달빛라떼 4500원", { user: U2, room: ROOM });
      await say(fx, "은하택배 8000원", { user: U3, room: ROOM_B });
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
      Object.assign(fx.env, env);
      resetIsolateState();
      return await task(fx, { u1, u2, u3, hh: String(household.id), hhB: String(householdB.id) });
    } finally {
      resetIsolateState();
    }
  }));
}
async function scene(task, options = {}) {
  try { return await world(task, options); } catch (error) { failures.push(`장면이 끝까지 가지 못함: ${String(error?.message || error).split(/\r?\n/)[0].slice(0, 240)}`); return undefined; }
}

// 저장소의 모습. 진단 기록(누를 때마다 시각이 바뀌는 줄)과 이 화면의 결과 기록만 뺀다.
const dbText = (fx) => JSON.stringify([
  ...["transactions", "households", "household_members", "users", "budgets", "accountbook_user_identities", "accountbook_user_security"].map((table) => fx.db[table] || []),
  (fx.db.accountbook_settings || []).filter((row) => !String(row.key).startsWith("kakao_room_open_probe_v229105:") && !String(row.key).startsWith(PROBE_PREFIX)).map((row) => [row.key, row.value]).sort(),
]);

// ── 브라우저 한 사람의 ‘바로 연 이동’ 을 끝까지 따라간다 ─────────────────────────────────────────
// 규칙(Fetch Metadata): 사람이 바로 연 요청과 그 넘김(30x)은 Sec-Fetch-Site: none 이다. 화면의 스크립트가 시킨 이동은 same-origin 이고, 그 넘김이
// 다른 사이트(카카오 로그인)를 거쳐 돌아오면 cross-site 다.
// ‘여는 중’ 화면을 받으면 방식(way)대로 둘째 요청을 보낸다(화면의 스크립트가 하는 일 — P-4 가 그 스크립트를 따로 돌려 본다):
//   script   — 보통 브라우저: 같은 주소, same-origin.
//   storage  — 탭 기억을 쓸 수 없는 브라우저: 표식 _o=2 를 붙인 주소, same-origin.
//   noscript — 스크립트를 끈 브라우저: 화면의 noscript 넘김 주소(_o=1), same-origin.
//   native   — 스크립트의 이동을 none 으로 보내는 브라우저(있을 법하지 않다): 화면을 한 번 더 받고, 스크립트가 표식 _o=3 을 붙인다.
//   reloads  — 그 이동을 none 으로 보내고 새로 고침으로 적는 브라우저(더 있을 법하지 않다): 화면을 세 번 받고 셋째에 표식 _o=3 을 붙인다.
// 카카오 로그인으로 넘어가면 카카오가 ‘로그인돼 있지 않음’ 으로 돌려보낸 것처럼 이어 간다(화면 없는 로그인의 보통 끝).
async function browse(fx, start, { ua = PC, jar = new Jar(), way = "script" } = {}) {
  const hops = [];
  let path = start, site = "none", shells = 0;
  for (let step = 0; step < 16; step += 1) {
    const result = await send(fx, path, { ua, jar, site, gesture: site === "none" && shells === 0 });
    if (result.status >= 300 && result.status < 400 && result.location) {
      const next = new URL(result.location, new URL(path, BASE));
      hops.push(`${result.status} ${result.location.replace(/([?&]state=)[^&]+/, "$1…")}`);
      if (next.origin !== BASE) {
        if (next.hostname !== "kauth.kakao.com") return { hops, shells, end: "external", status: result.status, title: "", html: "", path: `${next.origin}${next.pathname}`, jar };
        // 카카오: prompt=none 인데 로그인돼 있지 않으면 error=login_required 로, 화면 있는 로그인은 사람이 취소한 것으로 돌려보낸다.
        const quiet = next.searchParams.get("prompt") === "none";
        path = `/auth/kakao/callback?error=${quiet ? "login_required" : "access_denied"}&error_description=${quiet ? "user%20authentication%20required." : "User%20denied%20access"}&state=${encodeURIComponent(next.searchParams.get("state") || "")}`;
        if (site !== "none") site = "cross-site";
        continue;
      }
      path = `${next.pathname}${next.search}`;
      continue;
    }
    if (isShell(result)) {
      shells += 1;
      if (shells > 3) return { hops, shells, end: "loop", status: result.status, title: result.title, html: "", path, jar };
      if (way === "script") { site = "same-origin"; }
      else if (way === "storage") { path = marked(path, 2); site = "same-origin"; }
      else if (way === "noscript") { path = unescapeHtml((/<noscript><meta http-equiv="refresh" content="0;url=([^"]*)"\/><\/noscript>/.exec(result.html) || ["", "/__missing__"])[1]); site = "same-origin"; }
      else if (way === "native") { if (shells >= 2) { path = marked(path, 3); site = "same-origin"; } }
      else if (way === "reloads") { if (shells >= 3) { path = marked(path, 3); site = "same-origin"; } }
      continue;
    }
    return { hops, shells, end: "page", status: result.status, title: result.title, html: result.html, path, jar };
  }
  return { hops, shells, end: "too-long", status: 0, title: "", html: "", path, jar };
}
// 견줄 것들. 장면마다 새로 만들어지는 번호(가계부·사용자·기록의 UUID)·시각·초대코드·추적 번호는 이름을 바꿔 적는다(같은 흐름이면 같은 글이 된다).
function outcome(fx, run) {
  const ids = new Map();
  const clean = (text) => String(text)
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, (id) => { if (!ids.has(id)) ids.set(id, `<id${ids.size + 1}>`); return ids.get(id); })
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g, "<time>")
    .replace(/(invite_code\\?":\\?")[A-Z0-9]{6,12}/g, "$1<code>")
    .replace(/trace=[A-Z0-9]{6,12}/g, "trace=<trace>"); // 카카오 로그인 왕복의 추적 번호(요청마다 새로 만든다)
  return {
    hops: clean(run.hops.join(" → ")), end: run.end, status: String(run.status), title: run.title, page: clean(run.html || ""),
    cookies: clean(run.jar.snapshot()), events: clean(opsEvents().join(" ¶ ")), db: clean(dbText(fx)),
  };
}
// 두 결과가 처음 달라지는 곳(없으면 빈 글).
function firstDifference(a, b) {
  for (const key of Object.keys(a)) {
    if (a[key] === b[key]) continue;
    let at = 0;
    while (at < a[key].length && at < b[key].length && a[key][at] === b[key][at]) at += 1;
    return `${key} @${at}: 「${a[key].slice(Math.max(0, at - 50), at + 70)}」 ≠ 「${b[key].slice(Math.max(0, at - 50), at + 70)}」`;
  }
  return "";
}

// ── P-1. 주는 요청과 주지 않는 요청 ───────────────────────────────────────────
await scene(async (fx, { hh }) => {
  const member = Jar.of(fx.cookie);
  const yes = [
    ["세션 + /my(PC)", "/my", { jar: new Jar(member), ua: PC }],
    ["세션 + /app(휴대폰)", "/app", { jar: new Jar(member), ua: ANDROID }],
    ["세션 + /app(아이폰)", "/app", { jar: new Jar(member), ua: IPHONE }],
    ["세션 + /m", "/m", { jar: new Jar(member), ua: ANDROID }],
    ["세션 + 값이 있는 /app", `/app?household_id=${hh}&month=2026-11`, { jar: new Jar(member), ua: ANDROID }],
    ["세션 + 공유로 연 /app(share_text)", "/app?share_title=&share_text=%EC%B9%B4%EB%93%9C%20%EC%8A%B9%EC%9D%B8%2012%2C000%EC%9B%90", { jar: new Jar(member), ua: ANDROID }],
    ["세션 없음 + 카카오톡 안의 브라우저(안드로이드) /my", "/my", { ua: INAPP }],
    ["세션 없음 + 카카오톡 안의 브라우저(아이폰) /app", "/app", { ua: INAPP_IOS }],
    ["카카오톡 안의 브라우저 + 방 표식", `/my?room=${hh}`, { ua: INAPP }],
    ["카카오톡 안의 브라우저 + 방 가계부 주소", `/app?household_id=${hh}`, { ua: INAPP }],
    ["낡은 세션 쿠키 + /my", "/my", { cookie: "ab_user=stale.token.value", ua: PC }],
    ["사람이 누른 표시가 없는 바로 연 이동", "/my", { jar: new Jar(member), gesture: false }],
  ];
  for (const [label, path, options] of yes) {
    const result = await send(fx, path, options);
    check(() => ok(isShell(result), `P-1 주는 요청 — ${label}(${result.status} ${result.location || result.title})`), `shell for ${label}`);
    check(() => eq(result.cookies.length, 0, `P-1 ${label}: 쿠키를 주지 않는다(${result.cookies.join(" | ")})`), `shell no cookie ${label}`);
  }
  const no = [
    ["세션 없는 보통 브라우저의 /my(로그인 화면)", "/my", { ua: PC }],
    ["세션 없는 휴대폰 브라우저의 /app", "/app", { ua: ANDROID }],
    ["카카오 값이 붙은 주소(세션 있음)", tapped("/my"), { jar: new Jar(member), ua: PC }],
    ["카카오 값이 붙은 주소(카카오톡 안의 브라우저)", tapped(`/my?room=${hh}`), { ua: INAPP }],
    ["카카오 값 하나만(botUserKey)", `/my?botUserKey=${U1}`, { ua: INAPP }],
    ["카카오 값 하나만(appUserId)", "/app?appUserId=1801267359", { jar: new Jar(member), ua: ANDROID }],
    ["카카오 값 하나만(botGroupKey)", `/m?botGroupKey=${ROOM}`, { ua: INAPP }],
    ["카카오 값(이름을 % 로 적은 것)", `/my?bot%55serKey=${U1}&botGroupKey=${ROOM}`, { ua: INAPP }],
    ["카카오톡 밖 브라우저의 방 표식(세션 있음)", `/my?room=${hh}`, { jar: new Jar(member), ua: PC }],
    ["카카오톡 밖 브라우저의 방 표식(세션 없음)", `/my?room=${hh}`, { ua: PC }],
    ["로그인 화면을 바로 여는 주소(auto=0)", "/my?auto=0", { jar: new Jar(member), ua: INAPP }],
    ["로그인 화면을 바로 여는 주소(login=1)", "/my?login=1", { ua: INAPP }],
    ["same-origin 이동", "/my", { jar: new Jar(member), site: "same-origin" }],
    ["same-site 이동", "/my", { jar: new Jar(member), site: "same-site" }],
    ["cross-site 이동", "/app", { jar: new Jar(member), site: "cross-site" }],
    ["Sec-Fetch-Site 가 없는 요청", "/my", { jar: new Jar(member), site: "" }],
    ["Sec-Fetch-Dest 가 없는 요청(옛 브라우저·도구)", "/my", { jar: new Jar(member), dest: "" }],
    ["Sec-Fetch-Mode 가 없는 요청", "/my", { jar: new Jar(member), mode: "" }],
    ["머리가 하나도 없는 요청", "/app", { jar: new Jar(member), site: "", mode: "", dest: "" }],
    ["틀 안의 화면(iframe)", "/my", { jar: new Jar(member), dest: "iframe" }],
    ["fetch 요청", "/app", { jar: new Jar(member), mode: "cors", dest: "empty" }],
    ["미리 읽기(Sec-Purpose)", "/app", { jar: new Jar(member), headers: { "sec-purpose": "prefetch;prerender" } }],
    ["미리 읽기(Purpose)", "/my", { jar: new Jar(member), headers: { purpose: "prefetch" } }],
    ["표식이 붙은 주소", marked("/my", 1), { jar: new Jar(member) }],
    ["표식이 붙은 주소(값 뒤)", marked("/app?month=2026-11", 3), { jar: new Jar(member) }],
    ["다른 주소(/my/households)", "/my/households", { jar: new Jar(member) }],
    ["다른 주소(/my/transactions)", "/my/transactions", { jar: new Jar(member), ua: INAPP }],
    ["다른 주소(/budgets — 홈 화면 아이콘의 둘째 자리)", "/budgets", { jar: new Jar(member), ua: ANDROID }],
    ["공개 첫 화면", "/", { jar: new Jar(member), ua: INAPP }],
    ["대문자 경로", "/MY", { jar: new Jar(member) }],
    ["끝에 빗금이 붙은 경로", "/my/", { jar: new Jar(member) }],
    ["HEAD", "/my", { jar: new Jar(member), method: "HEAD" }],
    ["POST", "/my", { jar: new Jar(member), method: "POST", site: "same-origin" }],
  ];
  for (const [label, path, options] of no) {
    const result = await send(fx, path, options);
    check(() => ok(!isShell(result), `P-1 주지 않는 요청 — ${label}(${result.status} ${result.location || result.title})`), `no shell for ${label}`);
  }
  // 끈 운영: 주는 요청 모두에 주지 않는다. 다시 켜면 준다. 끄는 값은 1·true·on.
  for (const value of ["1", "true", "on"]) {
    fx.env.ENTRY_PROGRESS_DISABLED = value;
    for (const [label, path, options] of yes.slice(0, 7)) {
      const result = await send(fx, path, { ...options, jar: options.jar ? new Jar(member) : null });
      check(() => ok(!isShell(result), `P-1 끈 운영(${value}) — ${label}: 주지 않는다(${result.status} ${result.location || result.title})`), `disabled ${value} ${label}`);
    }
  }
  for (const value of ["0", "", "off"]) {
    fx.env.ENTRY_PROGRESS_DISABLED = value;
    const result = await send(fx, "/my", { jar: new Jar(member) });
    check(() => ok(isShell(result), `P-1 끄지 않은 값("${value}"): 준다`), `not disabled "${value}"`);
  }
  delete fx.env.ENTRY_PROGRESS_DISABLED;
});

// ── P-2. 화면 한 장 ─────────────────────────────────────────────────────────
let SHELL_HTML = "";
await scene(async (fx, { hh }) => {
  const member = Jar.of(fx.cookie);
  const result = await send(fx, "/my", { jar: new Jar(member) });
  SHELL_HTML = result.html;
  const html = result.html;
  const bytes = Buffer.byteLength(html);
  check(() => ok(bytes > 4000 && bytes <= 10000, `P-2 화면 크기 10,000바이트 이하(${bytes})`), "shell size");
  check(() => ok(/^<!doctype html><html lang="ko"><head><meta charset="utf-8"\/>/.test(html) && /<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"\/>/.test(html), "P-2 문서 머리(한국어·글자 집합·화면 폭)"), "doc head");
  check(() => ok(/<meta name="robots" content="noindex"\/>/.test(html), "P-2 검색에 싣지 않는다(meta)"), "noindex meta");
  check(() => eq(result.title, SHELL_TITLE, "P-2 제목"), "title");
  check(() => ok(!/<link\b|<img\b|<iframe\b|<object\b|<embed\b|<video\b|<audio\b|<form\b|<input\b|<button\b/i.test(html), "P-2 바깥 파일·폼을 쓰는 태그가 없다"), "no external tags");
  check(() => ok(!/\bsrc\s*=/.test(html) && !/url\(/.test(html) && !/@import/.test(html) && !/https?:\/\//.test(html), "P-2 바깥 주소가 하나도 없다(src·url()·@import·http)"), "no external urls");
  check(() => eq((html.match(/<script\b/g) || []).length, 1, "P-2 스크립트는 하나"), "one script");
  check(() => eq((html.match(/<style\b/g) || []).length, 1, "P-2 스타일은 하나"), "one style");
  check(() => ok(!/\son[a-z]+\s*=/.test(html.replace(/<script>[\s\S]*?<\/script>/, "").replace(/<style>[\s\S]*?<\/style>/, "")), "P-2 태그에 붙인 이벤트 속성이 없다"), "no inline handlers");
  check(() => ok(/<main class="abOpening"><div role="status">/.test(html) && !/<main[^>]*\brole=/.test(html) && /<h1 class="abOpeningTitle">가계부를 여는 중이에요<\/h1>/.test(html), "P-2 상태 알림 영역(main 안의 칸)과 큰 제목"), "status + heading");
  check(() => ok(/<p class="abOpeningText">가계부를 불러오고 있어요\. 잠시만 기다려 주세요\.<\/p>/.test(html), "P-2 안내 글"), "text");
  check(() => ok(/<div class="abOpeningNum" aria-hidden="true">/.test(html) && /<div class="abOpeningBar" aria-hidden="true">/.test(html), "P-2 숫자·막대는 읽어 주는 도구에 숨긴다(값이 어림이라)"), "aria hidden visuals");
  check(() => ok(/<p class="abOpeningLate" id="abOpeningLate" aria-hidden="true">평소보다 오래 걸리고 있어요\. <a href="\/my\?_o=1" tabindex="-1">다시 열기<\/a><\/p>/.test(html), "P-2 늦은 안내와 [다시 열기](표식을 붙인 주소)"), "late block");
  check(() => ok(/<noscript><meta http-equiv="refresh" content="0;url=\/my\?_o=1"\/><\/noscript>/.test(html), "P-2 스크립트를 끈 브라우저는 표식을 붙인 주소로 바로 넘어간다"), "noscript refresh");
  const strip = (/<div class="abOpeningStrip">((?:<div class="abOpeningTen">[^<]*<\/div>)*)<\/div><\/div><span class="abOpeningUnit">%<\/span>/.exec(html) || ["", ""])[1];
  const tens = [...strip.matchAll(/<div class="abOpeningTen">([^<]*)<\/div>/g)].map((m) => m[1]);
  check(() => eq(tens.join("\n"), Array.from({ length: 100 }, (_, value) => String(value)).join("\n"), "P-2 숫자 띠에는 0~99 가 한 줄씩 적혀 있다(100 은 없다)"), "digit strip");
  check(() => ok(tens.length === 10 && tens.every((part) => part.split("\n").length === 10), `P-2 숫자 띠는 열 줄씩 열 조각이다(큰 레이어 하나로 두지 않는다 — ${tens.length}조각)`), "digit chunks");
  check(() => ok(!/무료|평생|언제나|100\s*%/.test(html.replace(/<style>[\s\S]*?<\/style>/, "")), "P-2 화면 글에 ‘무료’·앞날 약속·100% 가 없다"), "copy rules");
  // 응답 머리: 보통 화면과 같은 보안 머리 + 저장하지 않음 + 검색 제외. 쿠키는 없다.
  const h = (name) => String(result.headers.get(name) || "");
  check(() => eq(h("content-type"), "text/html; charset=utf-8", "P-2 content-type"), "content type");
  check(() => eq(h("cache-control"), "no-store", "P-2 저장하지 않는다(no-store)"), "no-store");
  check(() => ok(/noindex/.test(h("x-robots-tag")), "P-2 X-Robots-Tag noindex"), "robots header");
  check(() => eq(h("referrer-policy"), "no-referrer", "P-2 Referrer-Policy no-referrer(둘째 요청에 이 주소가 실려 가지 않는다)"), "referrer policy");
  check(() => eq(h("x-frame-options"), "DENY", "P-2 틀 안에 넣지 못한다"), "frame options");
  check(() => ok(/default-src 'self'/.test(h("content-security-policy")) && /frame-ancestors 'none'/.test(h("content-security-policy")), "P-2 보통 화면과 같은 CSP"), "csp");
  check(() => ok(!h("location") && !h("link") && !h("speculation-rules") && !h("set-cookie"), "P-2 넘김·미리 받기·쿠키 머리가 없다"), "no extra headers");
  // 값이 있는 주소: 화면에는 표식을 붙인 주소가 글자를 바꿔 실린다. 스크립트 안에는 요청의 값이 없다.
  const hostile = `/app?month=2026-11&household_id=${hh}&x=%22%3E%3Cscript%3Ealert(1)%3C%2Fscript%3E&y='%3B--&z=%3C/script%3E&e=1&quot;x&lt;b&amp;c`;
  const loud = await send(fx, hostile, { jar: new Jar(member) });
  check(() => ok(isShell(loud), `P-2 값이 많은 주소에도 준다(${loud.status})`), "hostile is shell");
  const script = (/<script>([\s\S]*?)<\/script>/.exec(loud.html) || ["", ""])[1];
  check(() => eq(script, (/<script>([\s\S]*?)<\/script>/.exec(html) || ["", ""])[1], "P-2 스크립트는 어느 주소에서나 같은 글이다(요청의 값을 싣지 않는다)"), "static script");
  check(() => eq((/<style>([\s\S]*?)<\/style>/.exec(loud.html) || ["", ""])[1], (/<style>([\s\S]*?)<\/style>/.exec(html) || ["", ""])[1], "P-2 스타일도 어느 주소에서나 같다"), "static style");
  const outside = loud.html.replace(/<script>[\s\S]*?<\/script>/, "").replace(/<style>[\s\S]*?<\/style>/, "");
  const tagsOf = (text) => (text.match(/<\/?[a-zA-Z!][^>]*>/g) || []).map((tag) => tag.replace(/(href|content)="[^"]*"/g, '$1="…"'));
  check(() => eq(tagsOf(outside).join(""), tagsOf(html.replace(/<script>[\s\S]*?<\/script>/, "").replace(/<style>[\s\S]*?<\/style>/, "")).join(""), "P-2 주소의 글자가 태그를 만들지 못한다(태그가 값 없는 주소의 화면과 같다)"), "no injection");
  check(() => ok(!outside.includes("<script") && !outside.includes("alert(1)<") && (loud.html.match(/<script\b/g) || []).length === 1 && (loud.html.match(/"/g) || []).length === (html.match(/"/g) || []).length, "P-2 주소의 따옴표·꺾쇠가 그대로 실리지 않는다"), "no raw quotes");
  // 주소에 든 ‘&quot;’·‘&lt;’ 같은 글자는 ‘&’ 부터 바꿔 적혀 있어야 한다(바꿔 적지 않으면 브라우저가 따옴표·꺾쇠로 되읽는다).
  const rawRefresh = (/<noscript><meta http-equiv="refresh" content="0;url=([^"]*)"\/><\/noscript>/.exec(loud.html) || ["", ""])[1];
  check(() => ok(rawRefresh.includes("&amp;e=1&amp;quot;x&amp;lt;b&amp;amp;c&amp;_o=1") && !/&(?!amp;|#39;)/.test(rawRefresh), `P-2 주소의 ‘&’ 는 모두 바꿔 적힌다(${rawRefresh.slice(-60)})`), "ampersands escaped");
  const refresh = unescapeHtml(rawRefresh);
  const expected = new URL(hostile, BASE);
  check(() => eq(refresh, `${expected.pathname}${expected.search}&_o=1`, "P-2 noscript 넘김 주소 = 연 주소 + 표식(글자를 되돌리면 그대로)"), "noscript url exact");
  check(() => ok(refresh.startsWith("/app?") && !refresh.startsWith("//"), "P-2 넘김 주소는 이 사이트 안의 경로다"), "noscript same site");
  const link = unescapeHtml((/<a href="([^"]*)" tabindex="-1">다시 열기<\/a>/.exec(loud.html) || ["", ""])[1]);
  check(() => eq(link, refresh, "P-2 [다시 열기] 의 주소도 같다"), "retry url");
  // 어느 브라우저에서나 같은 화면(주소만 다르다).
  const inapp = await send(fx, "/my", { ua: INAPP_IOS });
  check(() => eq(inapp.html, html, "P-2 카카오톡 안의 브라우저(아이폰)에도 같은 화면"), "same shell everywhere");
});

// ── P-3. 움직임 ─────────────────────────────────────────────────────────────
const HAS_SHELL = SHELL_HTML.includes('class="abOpeningStrip"');
if (!HAS_SHELL) failures.push("P-3 움직임: ‘여는 중’ 화면을 받지 못해 볼 수 없다"); else {
  const style = (/<style>([\s\S]*?)<\/style>/.exec(SHELL_HTML) || ["", ""])[1];
  const block = (name) => {
    const head = `@keyframes ${name}{`;
    const from = style.indexOf(head);
    if (from < 0) return "";
    let depth = 0;
    for (let at = from + head.length - 1; at < style.length; at += 1) {
      if (style[at] === "{") depth += 1;
      else if (style[at] === "}") { depth -= 1; if (depth === 0) return style.slice(from + head.length, at); }
    }
    return "";
  };
  const frames = (name, pattern) => [...block(name).matchAll(/([\d.]+)%\{transform:([a-zA-Z]+)\(([^)]*)\)\}/g)].map((m) => ({ at: Number(m[1]), fn: m[2], value: pattern(m[3]) }));
  const digit = frames("abOpeningNum", (text) => (text === "0" ? 0 : Number(String(text).replace(/^-/, "").replace(/em$/, "")) / 1.2));
  const bar = frames("abOpeningBar", (text) => Number(text) * 100);
  const seconds = Number((/\.abOpeningStrip\{[^}]*animation:abOpeningNum ([\d.]+)s linear both\}/.exec(style) || ["", "0"])[1]);
  check(() => ok(seconds >= 40 && seconds <= 50, `P-3 숫자 띠의 길이 40~50초(${seconds})`), "duration");
  check(() => ok(new RegExp(`\\.abOpeningFill\\{[^}]*animation:abOpeningBar ${seconds}s linear both\\}`).test(style) && new RegExp(`\\.abOpeningLate\\{[^}]*animation:abOpeningLate ${seconds}s linear both\\}`).test(style), "P-3 막대·늦은 안내도 같은 길이로 처음부터 돈다"), "same duration");
  check(() => ok(!/steps\(|step-start|step-end/.test(style), "P-3 steps 를 쓰지 않는다(아이폰은 다음 화면을 기다리는 동안 끊어 그리는 움직임을 그리지 않는다)"), "no steps");
  check(() => ok(!/animation-delay|transition/.test(style) && !/animation:[^;}]*\s[\d.]+m?s\s[^;}]*\s[\d.]+m?s/.test(style), "P-3 늦게 시작하는 애니메이션·전환이 없다"), "no delay");
  const animated = [...style.matchAll(/@keyframes [a-zA-Z]+\{/g)].length;
  check(() => eq(animated, 4, "P-3 애니메이션은 넷(숫자·막대·빛·늦은 안내)"), "four animations");
  const props = new Set([...style.matchAll(/[\d.]+%(?:,[\d.]+%)*\{([a-z-]+):/g)].map((m) => m[1]));
  check(() => eq([...props].sort().join(","), "opacity,transform", "P-3 움직이는 값은 transform·opacity 뿐이다"), "only transform opacity");
  check(() => ok(digit.length >= 40 && digit.length <= 110 && digit.every((frame) => frame.fn === "translateY"), `P-3 숫자 띠 keyframes ${digit.length}개(translateY 만)`), "digit frames");
  check(() => ok(bar.length >= 20 && bar.length <= 70 && bar.every((frame) => frame.fn === "scaleX"), `P-3 막대 keyframes ${bar.length}개(scaleX 만)`), "bar frames");
  for (const [label, list] of [["숫자 띠", digit], ["막대", bar]]) {
    check(() => ok(list.length > 2 && list[0].at === 0 && list[0].value === 0, `P-3 ${label}: 0 에서 시작`), `${label} starts 0`);
    check(() => ok(list.every((frame, index) => index === 0 || frame.at > list[index - 1].at), `P-3 ${label}: 시각이 늘 뒤로 간다`), `${label} time order`);
    check(() => ok(list.every((frame, index) => index === 0 || frame.value >= list[index - 1].value - 1e-9), `P-3 ${label}: 값이 내려가지 않는다`), `${label} monotonic`);
    check(() => ok(Math.abs(list.at(-1).value - 99) < 1e-6 && list.at(-1).at === 100, `P-3 ${label}: 99 에서 끝난다(${list.at(-1).value})`), `${label} ends 99`);
    check(() => ok(list.every((frame) => frame.value <= 99 + 1e-9), `P-3 ${label}: 99 를 넘지 않는다`), `${label} cap`);
  }
  check(() => ok(digit.every((frame) => Math.abs(frame.value - Math.round(frame.value)) < 1e-6), "P-3 숫자 띠는 늘 숫자 한 줄에 맞춰 선다(반 줄에 멈추지 않는다)"), "digit integer stops");
  // 지난 시간의 값(초 → 퍼센트). 처음에는 빨리, 갈수록 천천히.
  const valueAt = (list, sec) => {
    const at = Math.min(100, (sec / seconds) * 100);
    let before = list[0], after = list.at(-1);
    for (let index = 1; index < list.length; index += 1) { if (list[index].at >= at) { before = list[index - 1]; after = list[index]; break; } }
    if (at >= after.at) return after.value;
    return before.value + (after.value - before.value) * ((at - before.at) / (after.at - before.at));
  };
  const bands = [[0.5, 12, 24], [1, 27, 37], [2, 45, 56], [3, 57, 67], [4, 64, 74], [6, 73, 82], [9, 80, 88], [14, 87, 94], [20, 91, 97], [30, 95, 99], [46, 99, 99], [300, 99, 99]];
  for (const [sec, low, high] of bands) {
    const value = valueAt(digit, sec), fill = valueAt(bar, sec);
    check(() => ok(value >= low && value <= high, `P-3 ${sec}초의 숫자 ${low}~${high}(${value.toFixed(1)})`), `digit at ${sec}s`);
    check(() => ok(Math.abs(fill - value) <= 2.5, `P-3 ${sec}초의 막대가 숫자와 맞는다(${fill.toFixed(1)} · ${value.toFixed(1)})`), `bar at ${sec}s`);
  }
  // 멈춘 것처럼 보이지 않는다: 처음 20초 동안은 숫자가 2.5초 넘게 머물지 않고, 그 뒤에도 막대의 빛이 계속 지나간다.
  let longest = 0, longestLate = 0;
  for (let index = 1; index < digit.length; index += 1) {
    if (digit[index].value !== digit[index - 1].value) continue;
    const from = (digit[index - 1].at / 100) * seconds, held = ((digit[index].at - digit[index - 1].at) / 100) * seconds;
    if (from < 20) longest = Math.max(longest, held); else longestLate = Math.max(longestLate, held);
  }
  check(() => ok(longest > 0 && longest <= 2.5, `P-3 처음 20초 동안은 숫자가 2.5초 넘게 머물지 않는다(가장 긴 머묾 ${longest.toFixed(2)}초)`), "longest hold");
  check(() => ok(longestLate > longest && longestLate <= 12.5, `P-3 그 뒤에는 느려진다(가장 긴 머묾 ${longestLate.toFixed(2)}초) — 그동안에도 막대의 빛은 지나가고 늦은 안내가 보인다`), "late holds");
  check(() => ok(/\.abOpeningSheen\{[^}]*animation:abOpeningSheen 1\.5s linear infinite\}/.test(style) && /@keyframes abOpeningSheen\{0%\{transform:translateX\(-110%\)\}100%\{transform:translateX\(290%\)\}\}/.test(style), "P-3 막대의 빛은 끝없이 지나간다(1.5초마다)"), "sheen infinite");
  const late = (/@keyframes abOpeningLate\{0%,([\d.]+)%\{opacity:0\}([\d.]+)%,100%\{opacity:1\}\}/.exec(style) || ["", "0", "0"]).slice(1).map(Number);
  check(() => ok((late[0] / 100) * seconds >= 9 && (late[1] / 100) * seconds <= 11 && late[1] > late[0], `P-3 늦은 안내는 9~11초 사이에 나타난다(${((late[0] / 100) * seconds).toFixed(1)}~${((late[1] / 100) * seconds).toFixed(1)}초)`), "late timing");
  check(() => ok(/\.abOpeningLate\{[^}]*opacity:0;/.test(style) && /\.abOpeningLate:focus-within\{opacity:1!important\}/.test(style), "P-3 늦은 안내는 처음에 안 보이고, 글쇠로 닿으면 보인다"), "late hidden + focus");
  check(() => ok(/@media \(prefers-reduced-motion:reduce\)\{\.abOpeningSheen\{display:none;animation:none\}\}/.test(style), "P-3 움직임 줄이기를 켠 기기에서는 빛을 끈다(숫자·막대는 남는다)"), "reduced motion");
  check(() => ok(/\.abOpeningRoll\{height:1\.2em;[^}]*overflow:hidden/.test(style) && /\.abOpeningTen\{white-space:pre;will-change:transform\}/.test(style) && /line-height:1\.2;/.test(style), "P-3 숫자 창은 한 줄 높이(1.2em)이고 띠는 줄마다 1.2em 이다(조각마다 작은 레이어)"), "roll window");
  check(() => ok(/\.abOpeningStrip\{will-change:transform;animation:abOpeningNum /.test(style) && !/\.abOpeningStrip\{[^}]*(?:white-space|background|color)/.test(style), "P-3 움직이는 띠는 조각들을 담은 틀일 뿐 자기 그림이 없다"), "strip is a container");
  check(() => ok(/body\{[^}]*background:#f6f7fb;color:#111827;/.test(style) && !/prefers-color-scheme/.test(style), "P-3 바탕은 가계부 화면의 밝은 색(다음 화면과 이어진다)"), "background");
  check(() => ok(/\.abOpeningDark body\{background:#141519;color:#edeff3\}/.test(style) && /\.abOpeningDark \.abOpeningBrand,\.abOpeningDark \.abOpeningNum,\.abOpeningDark \.abOpeningLate a\{color:#4e96fa\}/.test(style) && /\.abOpeningDark \.abOpeningFill\{background:#4e96fa\}/.test(style) && /\.abOpeningDark \.abOpeningBar\{background:#3b475a\}/.test(style), "P-3 어두운 테마를 쓰는 브라우저에는 가계부 화면의 어두운 바탕·글자색"), "dark palette");
  check(() => ok(!/--ab12-[a-z-]+\s*:/.test(style), "P-3 가계부 화면의 색 토큰을 새로 정하지 않는다(--ab12-action 은 흰 글자를 얹는 바탕용이다 — 어두운 화면의 파란색은 값으로 적는다)"), "no token redefinition");
  check(() => ok((style.match(/var\(--ab12-action,#2457d6\)/g) || []).length === 4 && !/(?:color|background):#2457d6/.test(style), "P-3 주 색은 토큰으로 칠한다(네 곳)"), "action token");
}

// ── P-4. 화면의 스크립트 ────────────────────────────────────────────────────
if (!HAS_SHELL) failures.push("P-4 스크립트: ‘여는 중’ 화면을 받지 못해 볼 수 없다"); else {
  const script = (/<script>([\s\S]*?)<\/script>/.exec(SHELL_HTML) || ["", ""])[1];
  check(() => ok(script.length > 300 && script.length < 1800, `P-4 스크립트 크기(${script.length})`), "script size");
  // 가짜 브라우저에서 돌린다. 프레임·타이머는 모아 두었다가 순서대로 부른다.
  //  storage: fresh(처음) · seen(탭 기억에 [몇 초 전, 몇 번째] 가 있다) · throws(쓸 수 없다). navType: 이 화면이 열린 길(navigate·reload). theme: 저장된 테마.
  const play = ({ pathname = "/my", search = "", hash = "", storage = "fresh", seen = [3000, 1], navType = "navigate", raf = true, replaceThrows = false, theme = null, themeThrows = false, perf = "entries" } = {}) => {
    const timers = [], frames = [], calls = [], listeners = {};
    const link = { attrs: { href: "/my?_o=1", tabindex: "-1" }, setAttribute(name, value) { this.attrs[name] = value; }, removeAttribute(name) { delete this.attrs[name]; } };
    const late = { style: {}, attrs: { "aria-hidden": "true" }, removeAttribute(name) { delete this.attrs[name]; }, getElementsByTagName: (tag) => (tag === "a" ? [link] : []) };
    const meta = { attrs: { content: "#f6f7fb" }, setAttribute(name, value) { this.attrs[name] = value; } };
    const root = { className: "" };
    const store = new Map(storage === "seen" ? [["abOpeningAt", `${Date.now() - seen[0]},${seen[1]}`]] : []);
    const sessionStorage = storage === "throws" ? { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); } } : { getItem: (key) => (store.has(key) ? store.get(key) : null), setItem: (key, value) => { store.set(key, String(value)); } };
    const localStorage = { getItem(key) { if (themeThrows) throw new Error("denied"); return key === "ab:appearance:theme" ? theme : null; } };
    const location = { pathname, search, hash, replace(target) { if (replaceThrows) throw new Error("blocked"); calls.push(["replace", target]); }, reload() { if (replaceThrows) throw new Error("blocked"); calls.push(["reload", ""]); } };
    Object.defineProperty(location, "href", { set(target) { calls.push(["href", target]); }, get() { return `${BASE}${pathname}${search}${hash}`; } });
    const performance = perf === "entries" ? { getEntriesByType: (kind) => (kind === "navigation" ? [{ type: navType }] : []) } : perf === "legacy" ? { getEntriesByType: () => [], navigation: { type: navType === "reload" ? 1 : 0 } } : undefined;
    const window = { setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, addEventListener: (type, fn) => { listeners[type] = fn; }, sessionStorage, localStorage, performance };
    if (raf) window.requestAnimationFrame = (fn) => { frames.push(fn); return frames.length; };
    const document = { documentElement: root, getElementById: (id) => (id === "abOpeningLate" ? late : null), querySelector: (selector) => (selector === "meta[name=theme-color]" ? meta : null) };
    vm.runInNewContext(script, { window, document, location, Date });
    const beforePaint = calls.length;
    const drainFrames = () => { for (let round = 0; round < 4 && frames.length; round += 1) for (const fn of frames.splice(0)) fn(); };
    const runTimers = (limit) => { for (const timer of timers.filter((item) => !item.ran && item.ms <= limit).sort((a, b) => a.ms - b.ms)) { timer.ran = true; timer.fn(); } };
    return { calls, link, late, meta, root, listeners, store, timers, beforePaint, drainFrames, runTimers };
  };
  const first = (options) => { const run = play(options); run.drainFrames(); run.runTimers(1000); return run; };
  {
    const run = play();
    check(() => eq(run.beforePaint, 0, "P-4 화면을 그리기 전에는 다시 열지 않는다(스크립트가 돈 직후에는 아무것도 하지 않는다)"), "waits for paint");
    run.drainFrames();
    check(() => eq(run.calls.length, 0, "P-4 두 프레임 뒤에도 조금(90ms) 더 기다린다"), "waits after frames");
    check(() => ok(run.timers.some((timer) => timer.ms === 90) && run.timers.some((timer) => timer.ms === 700), "P-4 프레임 뒤 90ms, 프레임이 안 와도 700ms 뒤에 연다"), "timers");
    run.runTimers(1000);
    check(() => eq(JSON.stringify(run.calls), JSON.stringify([["replace", "/my"]]), "P-4 보통 브라우저: 같은 주소를 한 번만 다시 연다(replace — 뒤로 가기에 남지 않는다)"), "plain replace once");
    const kept = String(run.store.get("abOpeningAt") || "").split(",");
    check(() => ok(Number(kept[0]) > 0 && kept[1] === "1", `P-4 이 탭이 화면을 받은 때와 횟수를 적어 둔다(${kept[1]}번째)`), "remembers tab");
    check(() => eq(run.link.attrs.href, "/my?_o=6", "P-4 [다시 열기] 의 주소 = 지금 주소 + 표식(누른 것은 _o=6)"), "retry href");
    check(() => eq(run.late.style.pointerEvents, "none", "P-4 [다시 열기] 는 보이기 전에는 눌리지 않는다"), "late not clickable");
    check(() => ok(run.root.className === "" && run.meta.attrs.content === "#f6f7fb", "P-4 저장된 테마가 없으면 밝은 화면 그대로"), "light by default");
    run.runTimers(20000);
    check(() => ok(run.late.style.pointerEvents === "" && !("aria-hidden" in run.late.attrs) && !("tabindex" in run.link.attrs), "P-4 10초쯤 뒤에는 눌리고, 읽어 주는 도구·글쇠로도 닿는다"), "late becomes reachable");
    check(() => ok(run.timers.some((timer) => timer.ms >= 9500 && timer.ms <= 11000), "P-4 그 때는 9.5~11초"), "late timer");
    check(() => eq(run.calls.length, 1, "P-4 그 뒤에도 다시 여는 것은 한 번뿐"), "still once");
  }
  const cases = [
    ["값이 있는 주소", { pathname: "/app", search: "?month=2026-11&household_id=h1" }, ["replace", "/app?month=2026-11&household_id=h1"]],
    ["주소에 # 이 있을 때(같은 주소로 가라고 하면 새로 요청하지 않는다 — 새로 고친다)", { pathname: "/app", hash: "#add" }, ["reload", ""]],
    ["# + 값", { search: "?a=1", hash: "#tab" }, ["reload", ""]],
    ["같은 탭에서 15초 안에 또 받았을 때(둘째)", { storage: "seen", seen: [3000, 1] }, ["replace", "/my?_o=3"]],
    ["또 받았는데 값·# 이 있을 때", { pathname: "/app", search: "?a=1", hash: "#add", storage: "seen", seen: [3000, 1] }, ["replace", "/app?a=1&_o=3#add"]],
    ["새로 고침으로 받은 둘째(한 번 더 그대로 연다)", { storage: "seen", seen: [3000, 1], navType: "reload" }, ["replace", "/my"]],
    ["새로 고침으로 받은 둘째(옛 방식으로 읽는 브라우저)", { storage: "seen", seen: [3000, 1], navType: "reload", perf: "legacy" }, ["replace", "/my"]],
    ["셋째에는 새로 고침이어도 표식", { storage: "seen", seen: [3000, 2], navType: "reload" }, ["replace", "/my?_o=3"]],
    ["넷째도 표식", { storage: "seen", seen: [1000, 3] }, ["replace", "/my?_o=3"]],
    ["같은 탭에서 15초 지난 뒤(처음으로 다시 센다)", { storage: "seen", seen: [16000, 2] }, ["replace", "/my"]],
    ["탭 기억을 쓸 수 없는 브라우저", { storage: "throws" }, ["replace", "/my?_o=2"]],
    ["탭 기억을 쓸 수 없는데 값·# 이 있을 때", { search: "?month=2026-11", hash: "#add", storage: "throws" }, ["replace", "/my?month=2026-11&_o=2#add"]],
    ["열린 길을 알 수 없는 브라우저(둘째는 표식)", { storage: "seen", seen: [3000, 1], navType: "reload", perf: "none" }, ["replace", "/my?_o=3"]],
    ["프레임 알림이 없는 브라우저", { raf: false }, ["replace", "/my"]],
    ["다시 여는 호출을 막은 브라우저", { replaceThrows: true }, ["href", "/my?_o=4"]],
    ["막았는데 # 이 있을 때", { hash: "#add", replaceThrows: true }, ["href", "/my?_o=4#add"]],
  ];
  for (const [label, options, expected] of cases) {
    const run = first(options);
    check(() => eq(JSON.stringify(run.calls), JSON.stringify([expected]), `P-4 ${label}: ${expected[0]} ${expected[1]}`), `script ${label}`);
  }
  {
    const second = first({ storage: "seen", seen: [3000, 1] });
    check(() => eq(String(second.store.get("abOpeningAt") || "").split(",")[1], "2", "P-4 또 받으면 횟수를 올려 적는다"), "counts up");
    const late = first({ storage: "seen", seen: [16000, 5] });
    check(() => eq(String(late.store.get("abOpeningAt") || "").split(",")[1], "1", "P-4 15초가 지나면 처음으로 돌아간다"), "count resets");
    const run = first({ hash: "#tab", search: "?a=1" });
    check(() => eq(run.link.attrs.href, "/my?a=1&_o=6#tab", "P-4 [다시 열기] 의 주소에 값·# 이 그대로 실린다"), "retry href with hash");
  }
  {
    const dark = first({ theme: "dark" });
    check(() => ok(dark.root.className === "abOpeningDark" && dark.meta.attrs.content === "#141519", "P-4 저장된 테마가 dark 면 어두운 화면으로(주소 띠 색도)"), "dark theme");
    const light = first({ theme: "light" });
    check(() => eq(light.root.className, "", "P-4 저장된 테마가 light 면 밝은 화면"), "light theme");
    const blocked = first({ themeThrows: true });
    check(() => eq(JSON.stringify(blocked.calls), JSON.stringify([["replace", "/my"]]), "P-4 저장된 테마를 읽지 못해도 다시 연다"), "theme read failure");
  }
  {
    const run = first();
    run.listeners.pageshow?.({ persisted: false });
    check(() => eq(run.calls.length, 1, "P-4 보통의 pageshow 에는 다시 열지 않는다"), "pageshow normal");
    run.listeners.pageshow?.({ persisted: true });
    check(() => eq(run.calls.length, 2, "P-4 뒤로 가기 보관함에서 되살아나면 다시 연다"), "pageshow persisted");
  }
  check(() => ok(!/fetch\(|XMLHttpRequest|eval\(|innerHTML|document\.write|cookie/.test(script), "P-4 스크립트는 요청을 보내거나 글을 바꾸지 않고 쿠키를 읽지 않는다"), "script scope");
}

// ── P-5. 끼워도 결과가 같다 ─────────────────────────────────────────────────
// 장면마다: 끈 운영(예전 그대로)에서 바로 연 이동을 끝까지 따라간 결과와, 켠 운영에서 둘째 요청의 다섯 방식으로 따라간 결과를 견준다.
// 견주는 것: 넘김(상태·주소)의 순서, 끝 화면(상태·제목·글 전체), 쿠키(이름·값 — 세션은 사용자·범위), 진단 이벤트(종류·등급·내용), 저장소.
const SCENES = [
  { name: "세션이 있는 브라우저의 /my", shells: 1, prepare: (fx) => ({ path: "/my", ua: PC, jar: Jar.of(fx.cookie) }) },
  { name: "세션이 있는 휴대폰의 /app", shells: 1, prepare: (fx) => ({ path: "/app", ua: ANDROID, jar: Jar.of(fx.cookie) }) },
  { name: "세션이 있는 아이폰의 /app", shells: 1, prepare: (fx) => ({ path: "/app", ua: IPHONE, jar: Jar.of(fx.cookie) }) },
  { name: "세션이 있는 휴대폰의 /m", shells: 1, prepare: (fx) => ({ path: "/m", ua: ANDROID, jar: Jar.of(fx.cookie) }) },
  { name: "세션 + 달·가계부 값", shells: 1, prepare: (fx) => ({ path: "/app?month=2026-10", ua: ANDROID, jar: Jar.of(fx.cookie) }) },
  { name: "세션 + 공유로 연 /app(share_text)", shells: 1, prepare: (fx) => ({ path: "/app?share_title=&share_text=%EC%B9%B4%EB%93%9C%20%EC%8A%B9%EC%9D%B8%2012%2C000%EC%9B%90", ua: ANDROID, jar: Jar.of(fx.cookie) }) },
  { name: "세션 + 가계부 기억 쿠키", shells: 1, prepare: (fx) => { const jar = Jar.of(fx.cookie); jar.items.set("ab_hh", "house-home"); return { path: "/my", ua: ANDROID, jar }; } },
  { name: "세션 + 설정 띠·포인트 색 쿠키", shells: 1, prepare: (fx) => { const jar = Jar.of(fx.cookie); jar.items.set("ab_sp", "1"); jar.items.set("ab_cs", "0"); return { path: "/app", ua: ANDROID, jar }; } },
  { name: "세션 + 관리자 쿠키", shells: 1, prepare: (fx) => { const jar = Jar.of(fx.cookie); jar.items.set("ab_admin", "x"); return { path: "/app", ua: PC, jar }; } },
  { name: "낡은 세션 쿠키(로그인 화면으로 끝난다)", shells: 1, prepare: () => ({ path: "/my", ua: PC, jar: Jar.of("ab_user=stale.token.value") }) },
  { name: "카카오톡 안의 브라우저, 세션 없음, /my(화면 없는 카카오 로그인 왕복)", shells: 1, prepare: () => ({ path: "/my", ua: INAPP, jar: new Jar() }) },
  { name: "카카오톡 안의 브라우저(아이폰), 세션 없음, /app", shells: 1, prepare: () => ({ path: "/app", ua: INAPP_IOS, jar: new Jar() }) },
  { name: "카카오톡 안의 브라우저, 세션 없음, 방 표식", shells: 1, prepare: (fx, w) => ({ path: `/my?room=${w.hh}`, ua: INAPP, jar: new Jar() }) },
  { name: "카카오톡 안의 브라우저, 이미 자동 로그인을 해 본 브라우저(시작 화면)", shells: 1, prepare: () => ({ path: "/my", ua: INAPP, jar: Jar.of("ab_kakao_auto=try") }) },
  { name: "단추: 채팅으로만 쓰는 구성원, 카카오톡 안의 브라우저(값 처리 → 방 가계부 홈)", shells: 1, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U2 }), ua: INAPP, jar: new Jar() }) },
  { name: "단추: 채팅으로만 쓰는 구성원, 아이폰", shells: 1, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U2 }), ua: INAPP_IOS, jar: new Jar() }) },
  { name: "단추: 채팅으로만 쓰는 구성원, PC", shells: 1, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U2 }), ua: PC, jar: new Jar() }) },
  { name: "단추: 같은 사람의 세션이 이미 있는 브라우저", shells: 1, prepare: async (fx, w) => { const jar = new Jar(); await send(fx, tapped("/my", { user: U2 }), { ua: INAPP, jar, dest: "" }); return { path: tapped(`/my?room=${w.hh}`, { user: U2 }), ua: INAPP, jar }; } },
  { name: "단추: 웹 계정에 이어진 구성원, PC(방 전용 보기)", shells: 1, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_ALIAS }), ua: PC, jar: new Jar() }) },
  { name: "단추: 웹 계정에 이어진 구성원, 카카오톡 안의 브라우저(화면 없는 카카오 로그인 왕복)", shells: 1, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_ALIAS }), ua: INAPP, jar: new Jar() }) },
  { name: "단추: 다른 계정의 세션이 있는 브라우저(누른 사람으로 바뀐다 — 바로 연 이동)", shells: 1, prepare: (fx) => ({ path: tapped("/my", { user: U2 }), ua: PC, jar: Jar.of(fx.cookie) }) },
  { name: "단추: 구성원이 아닌 방(세션 있음)", shells: 1, prepare: (fx) => ({ path: tapped("/my", { user: U2, room: ROOM_B }), ua: PC, jar: Jar.of(fx.cookie) }) },
  { name: "단추: 구성원이 아닌 방(카카오톡 안의 브라우저, 세션 없음)", shells: 1, prepare: () => ({ path: tapped("/my", { user: U2, room: ROOM_B }), ua: INAPP, jar: new Jar() }) },
  { name: "단추: 어느 계정도 아닌 값(PC, 세션 없음 — 로그인 화면)", shells: 0, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_NOBODY }), ua: PC, jar: new Jar() }) },
  { name: "단추: 다른 방의 방 전용 세션을 든 브라우저(그 세션을 끝낸다 — 바로 연 이동)", shells: 0, prepare: async (fx, w) => { const jar = new Jar(); fx.db.household_members.push({ household_id: w.hhB, user_id: WEB_USER, role: "member", created_at: `${DAY}T01:10:00Z` }); await send(fx, tapped("/my", { user: U_ALIAS, room: ROOM_B }), { ua: PC, jar, dest: "" }); fx.db.household_members = fx.db.household_members.filter((row) => !(row.household_id === w.hh && row.user_id === WEB_USER)); return { path: tapped("/my", { user: U_ALIAS, room: ROOM }), ua: PC, jar }; } },
  { name: "방 전용 세션으로 다시 들어온 브라우저(/app)", shells: 1, prepare: async (fx, w) => { const jar = new Jar(); await send(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, jar, dest: "" }); return { path: `/app?household_id=${w.hh}`, ua: PC, jar }; } },
  { name: "방 전용 세션으로 볼 수 없는 화면을 연 브라우저(/my — 돌려보낸다)", shells: 1, prepare: async (fx) => { const jar = new Jar(); await send(fx, tapped("/my", { user: U_ALIAS }), { ua: PC, jar, dest: "" }); return { path: "/my", ua: PC, jar }; } },
  { name: "PC 의 방 표식, 세션 없음(로그인 화면 — 화면을 주지 않는다)", shells: 0, prepare: (fx, w) => ({ path: `/my?room=${w.hh}`, ua: PC, jar: new Jar() }) },
  { name: "PC 의 방 표식, 세션 있음(그 가계부로 넘긴 다음 주소에서 준다)", shells: 1, prepare: (fx, w) => { fx.db.household_members.push({ household_id: w.hh, user_id: Jar.of(fx.cookie).user(), role: "member", created_at: `${DAY}T01:20:00Z` }); return { path: `/my?room=${w.hh}`, ua: PC, jar: Jar.of(fx.cookie) }; } },
  { name: "PC 의 방 표식 + 화면 없는 로그인을 켠 운영(바로 연 이동이라 해 본다)", shells: 0, env: { KAKAO_ROOM_QUIET_LOGIN: "1" }, prepare: (fx, w) => ({ path: `/my?room=${w.hh}`, ua: PC, jar: new Jar() }) },
  { name: "방 전용 보기를 끈 운영의 단추(PC, 이어진 구성원 → 방 표식 길 → 로그인 화면)", shells: 0, env: { KAKAO_ROOM_VIEW_DISABLED: "1" }, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_ALIAS }), ua: PC, jar: new Jar() }) },
  { name: "방 전용 보기를 끄고 화면 없는 로그인을 켠 운영의 단추(PC)", shells: 0, env: { KAKAO_ROOM_VIEW_DISABLED: "1", KAKAO_ROOM_QUIET_LOGIN: "1" }, prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_ALIAS }), ua: PC, jar: new Jar() }) },
  { name: "단추: 카카오 로그인이 붙은 구성원, 카카오톡 안의 브라우저", shells: 1, prepare: (fx, w) => { fx.db.accountbook_user_identities.push(strongKakao(w.u1.id)); return { path: tapped("/my"), ua: INAPP, jar: new Jar() }; } },
  { name: "단추: 로그인 이름만 붙은 구성원, 카카오톡 안의 브라우저(방 전용 보기)", shells: 1, prepare: (fx, w) => { fx.db.accountbook_user_identities.push(strongLocal(w.u1.id)); return { path: tapped("/my"), ua: INAPP, jar: new Jar() }; } },
  { name: "단추: 승인 대기 구성원(PC)", shells: 0, role: "pending", prepare: (fx, w) => ({ path: tapped(`/my?room=${w.hh}`, { user: U_ALIAS }), ua: PC, jar: new Jar() }) },
  { name: "자동 로그인을 끈 운영, 카카오톡 안의 브라우저, 세션 없음", shells: 1, env: { KAKAO_INAPP_AUTO_LOGIN: "0" }, prepare: () => ({ path: "/app", ua: INAPP, jar: new Jar() }) },
];
const WAYS = [["script", 1], ["storage", 1], ["noscript", 1], ["native", 2], ["reloads", 3]];
let walkedKakao = 0;
for (const item of SCENES) {
  const runWith = (way) => scene(async (fx, w) => {
    if (way === "off") fx.env.ENTRY_PROGRESS_DISABLED = "1";
    const start = await item.prepare(fx, w);
    resetIsolateState();
    const run = await browse(fx, start.path, { ua: start.ua, jar: start.jar, way: way === "off" ? "script" : way });
    return { run, out: outcome(fx, run) };
  }, { role: item.role, env: item.env });
  const base = await runWith("off");
  if (!base) continue;
  if (base.run.hops.some((hop) => hop.includes("kauth.kakao.com"))) walkedKakao += 1;
  check(() => ok(base.run.shells === 0 && ["page", "external"].includes(base.run.end), `P-5 [${item.name}] 끈 운영: 화면 없이 끝까지 간다(${base.run.end}, ${base.run.hops.length}번 넘김)`), `${item.name} base`);
  const again = await runWith("off");
  const drift = again ? firstDifference(base.out, again.out) : "장면이 돌지 않음";
  check(() => ok(drift === "", `P-5 [${item.name}] 끈 운영을 두 번 돌리면 결과가 같다(견줄 수 있는 장면이다) — 다른 곳: ${drift}`), `${item.name} deterministic`);
  for (const [way, perShell] of WAYS) {
    const live = await runWith(way);
    if (!live) continue;
    const expectedShells = item.shells === 0 ? 0 : perShell;
    check(() => eq(live.run.shells, expectedShells, `P-5 [${item.name}] ${way}: ‘여는 중’ 화면 ${expectedShells}번`), `${item.name} ${way} shells`);
    const gap = firstDifference(base.out, live.out);
    check(() => ok(gap === "", `P-5 [${item.name}] ${way}: 끈 운영과 넘김·끝 화면·쿠키·진단 기록·저장소가 같다 — 다른 곳: ${gap}`), `${item.name} ${way} same`);
    if (live.run.end === "page") check(() => ok(!/[?&]_o=\d/.test(live.run.html) && !live.run.html.includes("abOpening"), `P-5 [${item.name}] ${way}: 끝 화면에 표식·‘여는 중’ 화면의 글이 없다`), `${item.name} ${way} clean`);
  }
}
check(() => ok(walkedKakao >= 4, `P-5 카카오 로그인 왕복(우리 → 카카오 → 우리)까지 따라간 장면이 넷 이상이다(${walkedKakao})`), "kakao round trips walked");
// 화면이 보이는 자리: 단추의 첫 요청(카카오 값이 붙은 주소)에는 주지 않고, 값을 처리한 서버가 넘긴 다음 주소에서 준다.
await scene(async (fx, { hh }) => {
  const jar = new Jar();
  const first = await send(fx, tapped(`/my?room=${hh}`, { user: U2 }), { ua: INAPP, jar });
  check(() => ok(first.status === 303 && first.location === `/app?household_id=${hh}` && jar.user(), `P-5 단추의 첫 요청은 예전 그대로 값을 처리하고 넘긴다(${first.status} ${first.location})`), "tap handled first");
  check(() => ok(!/botUserKey|botGroupKey|appUserId/.test(first.location) && first.html === "", "P-5 그 응답에 카카오 값이 없다(화면도 없다)"), "tap clean");
  const second = await send(fx, first.location, { ua: INAPP, jar });
  check(() => ok(isShell(second), "P-5 넘겨받은 주소(바로 연 이동의 넘김 — none 그대로)에서 ‘여는 중’ 화면을 준다"), "shell after tap");
  check(() => ok(!/[0-9a-f]{64}/.test(second.html), "P-5 그 화면에 카카오 값(긴 16진 글)이 없다"), "no kakao values in shell");
  const third = await send(fx, first.location, { ua: INAPP, jar, site: "same-origin" });
  check(() => ok(third.status === 200 && third.title !== SHELL_TITLE && third.html.length > 10000, `P-5 둘째 요청은 그 방 가계부 홈이다(${third.status} ${third.title})`), "home after shell");
});

// ── P-6. 되풀이가 없다 ──────────────────────────────────────────────────────
await scene(async (fx) => {
  const member = Jar.of(fx.cookie);
  const sites = ["none", "same-origin", "same-site", "cross-site", ""];
  for (const ua of [PC, INAPP, INAPP_IOS]) {
    for (const site of sites) {
      for (const path of ["/my", "/app", "/m", "/app?month=2026-11"]) {
        for (const digit of [1, 2, 3, 4, 6, 9]) {
          const got = await send(fx, marked(path, digit), { ua, jar: new Jar(member), site });
          check(() => ok(!isShell(got), `P-6 표식이 붙은 요청에는 주지 않는다(${path}, _o=${digit}, ${site || "머리 없음"})`), `marked ${ua.length} ${site} ${path} ${digit}`);
        }
        if (site !== "none") {
          const other = await send(fx, path, { ua, jar: new Jar(member), site });
          check(() => ok(!isShell(other), `P-6 바로 연 이동이 아니면 주지 않는다(${path}, ${site || "머리 없음"})`), `not direct ${ua.length} ${site} ${path}`);
        }
      }
    }
  }
  // 표식은 맨 끝의 그 모양만 뗀다(숫자 1~9 한 글자). 다른 자리·다른 값은 보통 값이다(그런 주소는 화면을 줄 수 있고, 그 둘째 요청도 끝난다).
  for (const path of ["/my?_o=1&x=1", "/my?_o=0", "/my?_o=12", "/my?_o=", "/my?x_o=1", "/my?a=1&_o=1x", "/my?_o=a"]) {
    const result = await send(fx, path, { jar: new Jar(member) });
    check(() => ok(isShell(result), `P-6 끝에 붙은 표식이 아니면 보통 값이다(${path})`), `not a marker ${path}`);
    const after = await send(fx, path, { jar: new Jar(member), site: "same-origin" });
    check(() => ok(!isShell(after) && after.status < 500, `P-6 그 주소의 둘째 요청도 끝난다(${path} → ${after.status})`), `not a marker resumes ${path}`);
  }
});

// ── P-7. 응답 마무리가 화면을 건드리지 않는다 · 표식은 떼어진다 · 오류는 예전 처리로 ───────────
await scene(async (fx, { hh }) => {
  const member = Jar.of(fx.cookie);
  const plain = await send(fx, "/my", { jar: new Jar(member), ua: ANDROID });
  fx.env.NOTICE_TEXT = "점검 안내: 오늘 밤 잠시 느려질 수 있어요";
  const decorated = new Jar(member);
  for (const [name, value] of [["ab_setup", `${hh}.1`], ["ab_sp", "1"], ["ab_bk", "1"], ["ab_cs", "0"], ["ab_hh", "house-home"]]) decorated.items.set(name, value);
  const busy = await send(fx, "/my", { jar: decorated, ua: ANDROID });
  check(() => ok(isShell(busy) && busy.html === plain.html, "P-7 공지 띠·설정 띠·포인트 색·가계부 기억이 있는 브라우저에도 화면은 글자 하나 다르지 않다"), "finishers bypassed");
  check(() => eq(busy.cookies.length, 0, `P-7 그 응답은 쿠키를 건드리지 않는다(${busy.cookies.join(" | ")})`), "finishers cookies");
  check(() => ok(!busy.html.includes("점검 안내"), "P-7 공지 글이 화면에 붙지 않는다"), "no notice");
  // 둘째 요청의 응답은 예전처럼 마무리를 받는다(공지 띠가 붙는다).
  const next = await browse(fx, "/app", { ua: ANDROID, jar: new Jar(member), way: "script" });
  check(() => ok(next.end === "page" && next.html.includes("점검 안내"), "P-7 둘째 요청의 화면에는 공지 띠가 예전처럼 붙는다"), "notice on real page");
  delete fx.env.NOTICE_TEXT;
  // 표식이 붙은 요청과 붙지 않은 요청의 응답이 같다(처리기가 표식을 보지 않는다).
  for (const path of ["/app?month=2026-10", "/my", "/m"]) {
    for (const digit of [1, 3, 6]) {
      const a = await send(fx, path, { jar: new Jar(member), ua: ANDROID, site: "same-origin" });
      const b = await send(fx, marked(path, digit), { jar: new Jar(member), ua: ANDROID, site: "same-origin" });
      check(() => ok(a.status === b.status && a.location === b.location && a.html === b.html, `P-7 표식을 뗀 요청으로 처리된다(${path} _o=${digit}: ${a.status} ${a.location || a.title} · ${b.status} ${b.location || b.title})`), `marker stripped ${path} ${digit}`);
      check(() => ok(!/_o=\d/.test(b.location) && !/[?&]_o=\d/.test(b.html), `P-7 응답(넘김 주소·화면)에 표식이 남지 않는다(${path} _o=${digit})`), `marker not echoed ${path} ${digit}`);
    }
  }
  // 세 주소 밖에서는 같은 글자를 건드리지 않는다: 값을 지우고 같은 주소로 넘기는 길에서 그 글자가 넘김 주소에 그대로 남는다.
  const kept = await send(fx, `/my/households?botUserKey=${"z".repeat(40)}&_o=1`, { jar: new Jar(member), site: "none", dest: "" });
  check(() => ok(kept.status === 303 && kept.location === "/my/households?_o=1", `P-7 /my·/app·/m 밖의 주소에서는 그 글자를 떼지 않는다(${kept.status} ${kept.location})`), "marker other path kept");
  const stripped = await send(fx, `/my?botUserKey=${"z".repeat(40)}&_o=1`, { jar: new Jar(member), site: "none", dest: "" });
  check(() => ok(stripped.status === 303 && stripped.location === "/my", `P-7 세 주소에서는 뗀다(${stripped.status} ${stripped.location})`), "marker entry path stripped");
  // 이 모듈 안에서 오류가 나도 요청은 예전 처리로 간다. ① 화면을 만들다 오류 ② 표식을 뗀 요청을 만들다 오류.
  const direct = await send(fx, "/my", { jar: new Jar(member), ua: ANDROID, site: "same-origin" });
  const RealResponse = globalThis.Response, RealRequest = globalThis.Request;
  globalThis.Response = class extends RealResponse { constructor(body, init) { if (typeof body === "string" && body.includes('class="abOpeningStrip"')) throw new Error("simulated shell failure"); super(body, init); } };
  let failedShell = null;
  try { failedShell = await send(fx, "/my", { jar: new Jar(member), ua: ANDROID }); } finally { globalThis.Response = RealResponse; }
  check(() => ok(failedShell && !isShell(failedShell) && failedShell.status === direct.status && failedShell.location === direct.location, `P-7 화면을 만들다 오류가 나면 예전 그대로 처리한다(${failedShell?.status} ${failedShell?.location})`), "fail open shell");
  let armed = false;
  globalThis.Request = class extends RealRequest { constructor(input, init) { if (armed && typeof input === "string" && input.endsWith("/my") && init && init.method === "GET" && init.headers && !init.body) { armed = false; throw new Error("simulated gate failure"); } super(input, init); } };
  let failedGate = null;
  try {
    const request = new RealRequest(`${BASE}${marked("/my", 3)}`, { headers: { "user-agent": ANDROID, accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-site": "same-origin", "sec-fetch-dest": "document", cookie: member.header() } });
    armed = true;
    const response = await app.fetch(request, fx.env, { waitUntil() {}, passThroughOnException() {} });
    failedGate = { status: response.status, location: response.headers.get("location") || "", armed };
  } finally { globalThis.Request = RealRequest; }
  check(() => ok(failedGate && failedGate.armed === false && failedGate.status < 500 && failedGate.status === direct.status, `P-7 표식을 뗀 요청을 만들다 오류가 나면 받은 요청 그대로 처리한다(${failedGate?.status} ${failedGate?.location})`), "fail open gate");
  // 관제 표본: ‘여는 중’ 화면은 표본에 들어가지 않고(저장소를 읽지 않는 빠른 답이 화면 응답 시간에 섞이지 않게), 둘째 요청은 예전처럼 들어간다.
  // 표본은 요청의 2% 만 보내므로 난수를 0 으로 고정해 늘 보내게 하고 센다.
  const samples = [];
  fx.env.OPS_MONITOR = { fetch: async (_address, init) => { samples.push(JSON.parse(init.body)); return new Response("ok"); } };
  fx.env.OPS_MONITOR_TOKEN = "validate-v229132-monitor-token";
  const realRandom = Math.random;
  Math.random = () => 0;
  try {
    const quick = await send(fx, "/app", { jar: new Jar(member), ua: ANDROID });
    check(() => ok(isShell(quick) && samples.length === 0, `P-7 ‘여는 중’ 화면은 관제 표본에 들어가지 않는다(표본 ${samples.length}건)`), "monitor skips shell");
    const real = await send(fx, "/app", { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
    check(() => ok(!isShell(real) && samples.length === 1 && samples[0].route === "web" && samples[0].status === real.status, `P-7 둘째 요청은 예전처럼 표본에 들어간다(표본 ${samples.length}건, ${samples[0]?.route} ${samples[0]?.status})`), "monitor samples real page");
  } finally { Math.random = realRandom; delete fx.env.OPS_MONITOR; delete fx.env.OPS_MONITOR_TOKEN; }
});

// ── P-8. 결과 기록 ──────────────────────────────────────────────────────────
await scene(async (fx) => {
  const member = Jar.of(fx.cookie);
  const rows = () => fx.db.accountbook_settings.filter((item) => String(item.key).startsWith(PROBE_PREFIX));
  const value = (slot) => { const found = fx.db.accountbook_settings.find((item) => item.key === `${PROBE_PREFIX}${slot}`); return found ? (typeof found.value === "string" ? JSON.parse(found.value) : found.value) : null; };
  check(() => eq(rows().length, 0, "P-8 처음에는 기록이 없다"), "probe empty");
  await send(fx, "/my", { jar: new Jar(member), ua: ANDROID });                                   // 화면을 줌(안드로이드)
  await send(fx, "/my", { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false }); // 화면이 이어 보낸 둘째 요청
  await send(fx, "/app", { ua: INAPP_IOS });                                                        // 화면을 줌(아이폰, 카카오톡 안)
  await send(fx, marked("/app", 3), { ua: INAPP_IOS, site: "same-origin", gesture: false });        // 또 받아서 표식을 붙여 옴
  await send(fx, marked("/my", 1), { jar: new Jar(member), ua: PC, site: "same-origin", gesture: false }); // 스크립트를 끈 브라우저
  await send(fx, marked("/my", 6), { jar: new Jar(member), ua: PC, site: "same-origin", gesture: true });  // [다시 열기] 를 누름
  await send(fx, marked("/my", 2), { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
  await send(fx, marked("/my", 4), { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
  await send(fx, marked("/my", 9), { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
  const expectedSlots = ["shell_android", "resumed_android", "shell_ios", "marked_repeat_ios", "marked_noscript_other", "marked_retry_other", "marked_storage_android", "marked_error_android", "marked_other_android"];
  for (const slot of expectedSlots) {
    const saved = value(slot);
    check(() => ok(saved && Object.keys(saved).sort().join(",") === "app_version,at,count,version" && saved.version === 1 && saved.count === 1 && /^\d{4}-\d{2}-\d{2}T/.test(saved.at), `P-8 ${slot}: 시각·판·횟수만 남는다(${JSON.stringify(saved)})`), `probe ${slot}`);
  }
  check(() => eq(rows().map((item) => item.key.slice(PROBE_PREFIX.length)).sort().join(" "), [...expectedSlots].sort().join(" "), "P-8 그 밖의 줄은 생기지 않는다"), "probe only expected slots");
  const all = JSON.stringify(rows());
  check(() => ok(!all.includes(member.user()) && !/household|cookie|\/my|\/app|Mozilla/.test(all), "P-8 기록에 사용자·가계부·주소·브라우저 이름표가 없다"), "probe no identifiers");
  // 세지 않는 것: 사람이 누른 same-origin 이동(사이트 안의 링크), 화면을 받을 만하지 않은 요청, 화면 이동이 아닌 요청.
  const before = JSON.stringify(rows().map((item) => [item.key, item.value]).sort());
  await send(fx, "/my", { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: true });
  await send(fx, "/my", { ua: ANDROID, site: "same-origin", gesture: false });
  await send(fx, "/my?auto=0", { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
  await send(fx, "/my/households", { jar: new Jar(member), ua: ANDROID, site: "same-origin", gesture: false });
  await send(fx, marked("/my", 1), { jar: new Jar(member), ua: ANDROID, site: "same-origin", dest: "" });
  await send(fx, "/my", { jar: new Jar(member), ua: ANDROID, site: "cross-site", gesture: false });
  const counts = (slot) => globalThis.__AB_ENTRY_PROGRESS_PROBE.get(slot)?.count || 0;
  check(() => ok(JSON.stringify(rows().map((item) => [item.key, item.value]).sort()) === before && counts("resumed_android") === 0 && counts("marked_noscript_android") === 0, "P-8 사람이 누른 이동·받을 만하지 않은 요청·화면 이동이 아닌 요청은 세지 않는다"), "probe not counted");
  // 같은 isolate 에서는 줄별 10분에 한 번만 쓴다(그동안의 횟수는 다음 기록에 실린다).
  await send(fx, "/app", { jar: new Jar(member), ua: ANDROID });
  await send(fx, "/m", { jar: new Jar(member), ua: ANDROID });
  check(() => eq(value("shell_android")?.count, 1, "P-8 10분 안에는 다시 쓰지 않는다"), "probe throttled");
  globalThis.__AB_ENTRY_PROGRESS_PROBE.get("shell_android").at -= 11 * 60 * 1000;
  await send(fx, "/my", { jar: new Jar(member), ua: ANDROID });
  check(() => eq(value("shell_android")?.count, 3, "P-8 10분이 지나면 그동안의 횟수(3)와 함께 다시 쓴다"), "probe count carried");
  const kinds = (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === "entry_progress").map((event) => event.detail);
  check(() => ok(kinds.length >= 9 && kinds.every((detail) => /^[a-z_]+: \d+$/.test(detail)), `P-8 운영 이벤트에는 결과 이름과 횟수만 남는다(${kinds.slice(0, 3).join(" / ")})`), "ops events");
});
// 저장소가 기록을 받지 못해도 화면은 그대로 나간다.
await scene(async (fx) => {
  const member = Jar.of(fx.cookie);
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = String(typeof input === "string" ? input : input.url);
    if (/accountbook_settings/.test(url) && /entry_progress_probe/.test(`${url} ${init.body || ""}`)) return new Response(JSON.stringify({ message: "simulated" }), { status: 503, headers: { "content-type": "application/json" } });
    return original(input, init);
  };
  try {
    const result = await send(fx, "/my", { jar: new Jar(member) });
    check(() => ok(isShell(result), "P-8 결과 기록이 실패해도 화면은 나간다"), "probe failure harmless");
  } finally { globalThis.fetch = original; }
});

// ── P-9. 원본 ───────────────────────────────────────────────────────────────
{
  const entry = read("src/modules/web/entry-progress.js");
  const router = read("src/modules/worker/router.js");
  const room = read("src/modules/auth/kakao-room-open.js");
  const manifest = read("src/modules/MANIFEST.txt");
  // Sec-Fetch-Site 를 읽는 모듈(머리 이름을 따옴표로 적은 곳 — 대소문자 가리지 않고 센다). ‘여는 중’ 화면의 둘째 요청은 none 이 아니라 same-origin 으로
  // 온다 — 이 값을 보는 처리가 /my·/app·/m 길에 새로 생기면 그 요청에 화면을 줘도 되는지(web/entry-progress.js 의 주는 조건) 다시 봐야 한다.
  const readers = [];
  const walk = (dir, prefix) => { for (const item of readdirSync(dir, { withFileTypes: true })) { const full = new URL(`${item.name}${item.isDirectory() ? "/" : ""}`, dir); if (item.isDirectory()) walk(full, `${prefix}${item.name}/`); else if (item.name.endsWith(".js") && !/historical-runtime-assets/.test(item.name)) { const count = (readFileSync(full, "utf8").match(/["'`]sec-fetch-site["'`]/gi) || []).length; if (count) readers.push(`${prefix}${item.name}:${count}`); } } };
  walk(new URL("../src/modules/", import.meta.url), "");
  check(() => eq(readers.sort().join(" "), "auth/kakao-oauth.js:1 auth/kakao-room-open.js:3 my/member-code.js:1 public/support-page.js:1 runtime/ops-telemetry.js:2 web/entry-progress.js:2", "원본: Sec-Fetch-Site 를 읽는 곳이 알려진 목록과 같다(바뀌면 ‘여는 중’ 화면을 주는 조건을 다시 본다)"), "sec-fetch-site readers");
  const roomParams = ((/const KAKAO_ROOM_OPEN_PARAMS = \[([^\]]*)\];/.exec(room) || ["", ""])[1].match(/"[^"]+"/g) || []).join(",");
  const entryParams = ((/const ENTRY_PROGRESS_KAKAO_VALUE_PARAMS_V229132 = \[([^\]]*)\];/.exec(entry) || ["", ""])[1].match(/"[^"]+"/g) || []).join(",");
  check(() => ok(roomParams.length > 10 && roomParams === entryParams, `원본: 화면을 주지 않는 카카오 값 이름이 방 열기가 받는 이름과 같다(${entryParams})`), "kakao value names");
  check(() => ok(/const ENTRY_PROGRESS_PATHS_V229132 = new Set\(\["\/my", "\/app", "\/m"\]\);/.test(entry), "원본: 화면을 주는 주소는 /my·/app·/m 셋"), "paths");
  check(() => ok(entry.includes('return isKakaoTalkInAppBrowser(request) || (!!getCookie(request, "ab_user") && !query.has("room"));'), "원본: 카카오톡 밖의 브라우저는 세션 쿠키가 있고 방 표식이 없을 때만"), "outside rule");
  check(() => ok(entry.includes('if (entryProgressHeaderV229132(request, "sec-fetch-site") !== "none" || !entryProgressCandidateV229132(request, url)) return null;') && entry.includes('entryProgressHeaderV229132(request, "sec-fetch-dest") !== "document"'), "원본: 바로 연 화면 이동(none·document)에만"), "direct rule");
  check(() => ok(!/headers\.set\(|new Headers\(/.test(entry), "원본: 요청의 머리를 바꾸지 않는다"), "no header rewrite");
  check(() => ok(!/set-cookie|Set-Cookie|document\.cookie|d\.cookie|Max-Age/.test(entry), "원본: 쿠키를 주지도 읽게 하지도 않는다(방침의 쿠키 목록·HttpOnly 설명이 그대로 맞는다)"), "no cookies");
  check(() => ok(!/supabase\(|verifyUserSession|makeUserSession/.test(entry) && (entry.match(/saveSettingValue\(/g) || []).length === 1, "원본: 저장소는 결과 기록 한 곳에서만 쓴다(읽지 않는다)"), "no db reads");
  const csrf = router.indexOf("if (!csrfOriginAllowed(request, url)) {"), shell = router.indexOf("const entryProgressShell = entryProgressShellResponseV229132(request, env, url, ctx);"), open = router.indexOf("const kakaoRoomOpen = await kakaoRoomOpenResponse(request, env, url, ctx);"), canonical = router.indexOf("const canonicalRedirect = canonicalRedirectResponse(request, env, url);"), guard = router.indexOf("const trafficGuard = checkTrafficGuard(request, env, url);");
  check(() => ok(canonical > 0 && canonical < guard && guard < csrf && csrf < shell && shell < open, "원본: 화면 판정은 대표 주소 넘김·요청 제한·같은 출처 검사 다음, 방 열기 앞이다"), "route position");
  const gate = router.indexOf("request = entryProgressGateV229132(request, requestEnv, ctx);"), view = router.indexOf("const roomViewToken = await roomViewSessionOfRequestV229130(request, requestEnv);"), routed = router.indexOf("const routedResponse = await ACCOUNTBOOK_WORKER.route(routed.request, requestEnv, ctx);"), bypass = router.indexOf("if (entryProgressIsShellV229132(requestEnv, routedResponse)) return routedResponse;"), finish = router.indexOf("const response = roomViewBounceResponseV229130(");
  check(() => ok(gate > 0 && gate < view && view < routed && routed < bypass && bypass < finish, "원본: 표식 떼기는 맨 앞, 화면은 응답 마무리·관제 표본 앞에서 그대로 나간다"), "fetch position");
  check(() => ok(manifest.split("\n").includes("web/entry-progress.js") && manifest.indexOf("web/entry-progress.js") > manifest.indexOf("auth/kakao-room-open.js"), "원본: 빌드 목록에 실려 있다"), "manifest");
  check(() => eq((router.match(/entryProgress[A-Za-z]+V229132\(/g) || []).length, 3, "원본: 라우터가 부르는 곳은 셋(표식 떼기·화면 판정·그대로 내보내기)"), "router call sites");
}

if (failures.length) {
  console.error(`여는 중 화면 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
