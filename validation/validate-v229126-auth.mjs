// V22.9.126 묶음 auth — 소유자 양도 재확인(FC-9), 카카오 로그인 콜백 한도(FC-8), 로그인 쪽 작은 결함(FC-15) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 2026-11-16 최종 점검에서 확인된 결함을 좁게 고쳤다.
//  FC-9  소유자 양도(POST /my/household/transfer-owner)가 세션만으로 됐다. 소유자가 로그인해 둔 기기를 쓰는 구성원이 자기에게 양도한 뒤
//        가계부를 지울 수 있었다(삭제에는 재확인이 있다). → 삭제와 같은 본인 확인(로그인 비밀번호 또는 카카오 본인 확인 표). 카카오 표는 같은
//        쿠키를 쓰되 용도(owner-transfer)를 내용과 서명에 넣어 삭제용 표와 서로 바꿔 쓸 수 없다. 역할 검사·잠금·소유자 없는 가계부 막기는 그대로.
//  FC-8  카카오 로그인 콜백의 같은 주소 한도가 15분 20번이었다(운영 함수 상한 50). 막힘 안내는 ‘1~2분’ 이었다(실제 15분쯤). → 손으로 누른
//        로그인 칸만 50번(화면 없는 자동 로그인 칸은 20 그대로), ‘15분쯤’.
//  FC-15 ① 비밀번호 재확인의 시도 제한 막힘·장애가 ‘비밀번호가 맞지 않습니다’ 로 보였다 → 이유를 가린다(확인을 못 하면 여전히 실패 쪽).
//        ② 로그인 이름 로그인의 429·503·500 화면이 돌아갈 주소를 잃었다. ③ 로그인·가입이 됐는데 주소에 문장을 실어 일반 오류 문장이 보였다.
//        ④ 계정을 바꾸는 로그인이 앞 계정의 설정 띠 쿠키(ab_setup·ab_bk)를 남겼다. ⑤ 가입 때 옛 이름 확인(ilike)에 입력이 패턴으로 읽혔다.
// 2차(독립 검토 반영): 채팅만 쓰는 방 소유자가 실제로 갈 수 있는 길(1:1 웹 연결 코드 → 내 계정·보안의 첫 비밀번호 → 양도)을 양도 칸이 가리키고
//  그 길과 카카오톡 인앱·브라우저 길을 끝까지 따라간다(FC-9 6·7). 만료·다른 사람 표·부분 실패 복구(8), 로그인 수단 읽기 실패(9), 표 없이 소유자로
//  올리는 다른 길이 없음(10), 같은 계정에 세션을 다시 줄 때는 띠 쿠키를 두기(④), 옛 이름 확인의 PostgreSQL 규칙·쪽이 차면 막기(⑤).
// 3차(독립 검토 2차 반영): 채팅 소유자 칸의 결과 한 문장과 5분 표의 서버 만료(FC-9 6), 비밀번호+카카오 칸의 인앱(7), 로그인 수단 읽기 실패
//  화면(9), 삭제 칸의 같은 길과 다른 상태의 바이트 고정(11), 웹 연결 코드의 돌아갈 곳(12), 시도 제한 기능 장애 문구(FC-8).
// 4차(독립 검토 3차 반영): 한쪽 읽기만 실패하면 읽힌 수단을 그대로 보이고 삭제 칸과 같은 수단(9 의 4차 a~d).
// 실제 요청(app.fetch)과 픽스처 DB 로 본다. 카카오 서버는 가로채 흉내 낸다(네트워크 없음). 장면마다 따로 잡아 하나가 실패해도 나머지를 본다.
//
// ── 실행 ──
//   node validation/validate-v229126-auth.mjs          (분류 표 없는 운영 모드: AB_QA_CATEGORIES_ABSENT=1)
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, failure, fixture, intercept, withClock } from "./lib-audit-v22934.mjs";
import { PASSWORD_KDF_ITERATIONS, newPasswordSalt, pbkdf2PasswordHash } from "../src/modules/auth/crypto-admin-session.js";
import { makeHouseholdDeleteReauthToken, signedPurposeToken } from "../src/modules/auth/identity-reauth.js";

const t = counter("PASS: V22.9.126 auth — owner transfer re-auth, Kakao callback limit, login fixes");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failedSections = [];
async function section(name, task) {
  try {
    await task();
  } catch (error) {
    const line = `${name}: ${String(error?.message || error).split("\n")[0].slice(0, 400)}`;
    failedSections.push(line);
    console.error(`FAIL ${line}`);
  }
}

const HOME = "house-home";
const HOME_NAME = "우리집 생활비";
const MONTH = "2026-07";
const MEMBERS = `/my/members?household_id=${HOME}&month=${MONTH}`;
const DELETE_BACK = `/my/households?month=${MONTH}&household_id=${HOME}&manage=${HOME}#manage`;
const PASSWORD = "v126-owner-pass";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` };

// 실제 요청 한 번. POST 는 같은 출처 머리글을 달고, 메모리 요청 한도(분당 8번)를 비운 뒤 보낸다(검사가 같은 주소로 여러 번 보낸다).
async function http(fx, method, path, { cookie = "", form = null, headers = {}, ua = PC } = {}) {
  if (method !== "GET") globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
  const h = { "user-agent": ua, accept: "text/html", ...(cookie ? { cookie } : {}), ...(method !== "GET" ? { origin: BASE, "sec-fetch-site": "same-origin" } : {}), ...headers };
  let body;
  if (form) { h["content-type"] = "application/x-www-form-urlencoded"; body = new URLSearchParams(form).toString(); }
  const jobs = [];
  const response = await app.fetch(new Request(new URL(path, BASE).href, { method, headers: h, ...(body !== undefined ? { body } : {}) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const html = await response.text();
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { status: response.status, location: response.headers.get("location") || "", cookies, retryAfter: response.headers.get("retry-after") || "", html };
}
const pairOf = (cookies, name) => (cookies.find((line) => line.startsWith(`${name}=`) && !/Max-Age=0/i.test(line)) || "").split(";")[0];
const clears = (cookies, name) => cookies.some((line) => line.startsWith(`${name}=;`) && /Max-Age=0/i.test(line));
const sets = (cookies, name) => cookies.some((line) => line.startsWith(`${name}=`) && !line.startsWith(`${name}=;`));
const jarFrom = (text) => new Map(String(text || "").split(/;\s*/).filter(Boolean).map((kv) => [kv.slice(0, kv.indexOf("=")), kv.slice(kv.indexOf("=") + 1)]));
const applySet = (jar, setCookies) => {
  for (const line of setCookies) {
    const first = line.split(";")[0];
    const name = first.slice(0, first.indexOf("="));
    if (/Max-Age=0/i.test(line)) jar.delete(name); else jar.set(name, first.slice(first.indexOf("=") + 1));
  }
  return jar;
};
const jarStr = (jar) => [...jar].map(([k, v]) => `${k}=${v}`).join("; ");
const box = (html, cls) => (html.match(new RegExp(`<div class="${cls}">([^<]*)</div>`)) || [])[1] || "";
const roleOf = (fx, uid, hid = HOME) => fx.db.household_members.find((row) => row.household_id === hid && String(row.user_id) === String(uid))?.role || "";
const rolesNow = (fx) => `user-bin:${roleOf(fx, "user-bin")},user-wifi:${roleOf(fx, "user-wifi")}`;
const transferForms = (html) => html.split('action="/my/household/transfer-owner"').length - 1;
function freshLimiter(fx, enforce = true) {
  fx.db.__enforce_auth_rate = enforce;
  fx.db.__auth_attempts = new Map();
  globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
  globalThis.__AB_AUTH_WIDE_BLOCKED?.clear?.();
}

// 로그인 비밀번호를 붙인다(운영 저장과 같은 PBKDF2 행). 세션 판은 올리지 않는다(이 검사의 세션 쿠키를 그대로 쓴다).
async function givePassword(fx, userId, loginName, password = PASSWORD) {
  const salt = newPasswordSalt();
  const hash = await pbkdf2PasswordHash(password, salt, PASSWORD_KDF_ITERATIONS);
  fx.db.accountbook_user_identities = fx.db.accountbook_user_identities.filter((row) => !(row.provider === "local" && row.user_id === userId));
  fx.db.accountbook_user_identities.push({ user_id: userId, provider: "local", provider_subject: loginName.toLowerCase(), login_name: loginName, credential_hash: hash, credential_salt: salt, credential_iterations: PASSWORD_KDF_ITERATIONS, credential_version: 2 });
}

// 카카오 서버 흉내(토큰·프로필). 2265 = user-bin 의 카카오 로그인.
function kakaoServers(kakaoId = 2265) {
  return intercept(async ({ url }) => {
    if (url.hostname === "kauth.kakao.com" && url.pathname === "/oauth/token") return new Response(JSON.stringify({ access_token: "qa-v126-access", token_type: "bearer" }), { headers: { "content-type": "application/json" } });
    if (url.hostname === "kapi.kakao.com") return new Response(JSON.stringify({ id: Number(kakaoId), properties: { nickname: "Bin" } }), { headers: { "content-type": "application/json" } });
    if (/kakao\.com$/.test(url.hostname)) return failure(400, "offline");
    return null;
  });
}
// 실제 /auth/kakao/start → /auth/kakao/callback 본인 확인. 돌려받은 표 쿠키(이름=값)를 돌려준다.
async function kakaoReauth(fx, purpose, returnTo, { cookie = fx.cookie, household = HOME, kakaoId = 2265, ua = PC } = {}) {
  const start = await http(fx, "GET", `/auth/kakao/start?reauth=${purpose}&household_id=${encodeURIComponent(household)}&return_to=${encodeURIComponent(returnTo)}`, { cookie, ua });
  const jar = applySet(jarFrom(cookie), start.cookies);
  const state = decodeURIComponent(jar.get("kakao_oauth_state") || "");
  if (!state) return { start, callback: null, ticket: "" };
  const restore = kakaoServers(kakaoId);
  let callback;
  try { callback = await http(fx, "GET", `/auth/kakao/callback?code=qa-v126&state=${encodeURIComponent(state)}`, { cookie: jarStr(jar), ua }); }
  finally { restore(); }
  return { start, callback, ticket: pairOf(callback.cookies, "ab_household_delete_reauth") };
}
const transfer = (fx, { cookie = fx.cookie, target = "user-wifi", password = "", household = HOME, month = MONTH, ua = PC } = {}) => http(fx, "POST", "/my/household/transfer-owner", { cookie, ua, form: { household_id: household, user_id: target, month, ...(password ? { access_code: password } : {}) } });
const removeHousehold = (fx, { cookie = fx.cookie, password = "" } = {}) => http(fx, "POST", "/my/household/delete", { cookie, form: { household_id: HOME, month: MONTH, confirm_name: HOME_NAME, understand_members: "1", ...(password ? { access_code: password } : {}) } });
const pageAt = async (fx, location, cookie = fx.cookie) => http(fx, "GET", location.replace(/#.*$/, ""), { cookie });

// ── 채팅 계정(봇 키만) 도우미: 공식 그룹 챗봇 요청 모양(V22.9.115 검사와 같다). 방의 첫 호출자가 소유자, 둘째가 구성원이 된다. ──
const SKILL_SECRET = "v126-skill-secret";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";
async function say(fx, utterance, { user, room = "", appUserId = "" }) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user, ...(appUserId ? { appUserId } : {}) } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SKILL_SECRET }, body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const text = await response.text();
  for (let round = 0; round < 6 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  return text;
}
const claimCodeOf = (reply) => (String(reply).replace(/\\n/g, "\n").match(/\b([A-Z0-9]{8}(?:-[A-Z0-9]{8}){3})\b/) || [])[1] || "";
const sessionUserOf = (jar) => decodeURIComponent(jar.get("ab_user") || "").split("|")[0];
async function roomHousehold(fx, label, { appUserId = "" } = {}) {
  fx.env.KAKAO_SKILL_SECRET = SKILL_SECRET;
  const owner = hex66(`v126-${label}-owner`);
  const member = hex66(`v126-${label}-member`);
  const room = hex66(`v126-${label}-room`);
  await say(fx, "점심 9000원", { user: owner, room, appUserId });
  await say(fx, "커피 4000원", { user: member, room });
  const ownerId = String(fx.db.users.find((row) => row.kakao_user_key === owner)?.id || "");
  const memberId = String(fx.db.users.find((row) => row.kakao_user_key === member)?.id || "");
  const hid = String(fx.db.household_members.find((row) => String(row.user_id) === ownerId && row.role === "owner")?.household_id || "");
  return { owner, member, room, ownerId, memberId, hid, month: "2026-11", membersPath: `/my/members?household_id=${encodeURIComponent(hid)}&month=2026-11` };
}
// 방 링크 단추(카카오가 botUserKey·botGroupKey 를 붙인 주소)를 카카오톡 인앱 브라우저로 열고 넘기는 곳까지 따라간다. 쿠키 통을 돌려준다.
async function openFromRoom(fx, room) {
  const jar = new Map();
  let r = await http(fx, "GET", `/my?botUserKey=${room.owner}&botGroupKey=${room.room}`, { ua: INAPP });
  applySet(jar, r.cookies);
  for (let hop = 0; hop < 4 && r.status >= 300 && r.status < 400 && r.location.startsWith("/"); hop += 1) {
    r = await http(fx, "GET", r.location, { cookie: jarStr(jar), ua: INAPP });
    applySet(jar, r.cookies);
  }
  return jar;
}
// (3차) 채팅만 쓰는 소유자 칸(양도·삭제)의 결과 한 문장, 로그인 수단을 읽지 못했을 때의 한 줄, 삭제 칸 조각.
const CONSEQUENCE = "저장하면 다른 기기·브라우저는 로그아웃되고, 그 뒤 로그인돼 있지 않은 브라우저에서 단톡방의 웹 가계부 단추를 누르면 홈 대신 로그인 이름과 비밀번호를 먼저 물어요.";
const RELOAD_LINE = "로그인 수단을 지금 확인하지 못했어요. 잠시 후 이 화면을 새로고침해 주세요.";
const panelOf = (html) => (html.match(/<(form|div)[^>]*class="dangerZone"[\s\S]*?<\/\1>/) || [""])[0];
const sha = (text) => createHash("sha256").update(text).digest("hex");
const identitiesDown = () => intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_user_identities" ? failure(503) : null));
// (4차) 읽기 하나만 503 으로 떨어뜨리고 실제로 불렸는지 센다. LINKS = 식별 링크 설정(두 확인이 모두 마지막에 읽는다), LOCAL = 로그인 비밀번호 행.
const LINKS = (url) => url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === "eq.user_identity_links";
const LOCAL = (url) => url.pathname === "/rest/v1/accountbook_user_identities" && url.searchParams.get("provider") === "eq.local";
function readsDown(match) {
  const state = { hits: 0 };
  state.restore = intercept(async ({ url, method }) => (method === "GET" && match(url) ? (state.hits += 1, failure(503)) : null));
  return state;
}
const reloadOnly = (html) => html.includes(`<div class="transferBox"><p class="muted">${RELOAD_LINE}</p></div>`) && transferForms(html) === 0 && !html.includes("웹 연결 코드 넣기") && !html.includes(">카카오 계정으로 본인 확인</a>");
const passwordBoxShown = (html) => transferForms(html) === 1 && html.includes('<label>내 계정 로그인 비밀번호<input name="access_code" type="password"') && !html.includes(RELOAD_LINE);
const kakaoBoxShown = (html) => html.includes("먼저 이 계정에 연결된 카카오 계정으로 본인 확인을 완료하세요.") && html.includes('href="/auth/kakao/start?reauth=owner-transfer&amp;') && !html.includes(RELOAD_LINE);
const deleteHasPassword = (panel) => panel.includes('action="/my/household/delete"') && panel.includes('<label>내 계정 로그인 비밀번호<input name="access_code" type="password"');
const deleteHasKakao = (panel) => !panel.includes('action="/my/household/delete"') && panel.includes(">카카오 계정으로 본인 확인</a>");

// ═════════════════════════════════════════════════════════════════════════════════════
// 0. 소스: 고친 자리
// ═════════════════════════════════════════════════════════════════════════════════════
await section("0 소스", async () => {
  const members = read("src/modules/my/members-page.js");
  const reauth = read("src/modules/auth/identity-reauth.js");
  const oauth = read("src/modules/auth/kakao-oauth.js");
  const handler = members.slice(members.indexOf("async function handleMyOwnerTransfer(request, env) {"));
  const reauthAt = handler.indexOf("await ownerTransferReauthErrorV229126(request, env, String(userId), householdId, accessCode);");
  const leaseAt = handler.indexOf("withKakaoUserLifecycleLease(env, [String(userId), targetId].sort()");
  ok(reauthAt > 0 && leaseAt > reauthAt, "FC-9 0 양도 처리기는 잠금을 잡기 전에 본인 확인을 받는다");
  ok(handler.indexOf('if (actorRoleBefore !== "owner") return redirectResponse(back("err=owner_transfer_not_owner"));') < reauthAt && handler.includes('const [actorRole, targetRole] = await Promise.all([getHouseholdMemberRoleStrict(env, String(userId), householdId), getHouseholdMemberRoleStrict(env, targetId, householdId)]);'), "FC-9 0 역할은 본인 확인 전에 한 번, 잠금 안에서 다시 한 번 읽는다(잠금 안 확인은 그대로)");
  ok(reauth.includes("const signature = await hmacSha256(userSessionSecret(env), `${payload.purpose}:${data}`);") && reauth.includes("const expected = await hmacSha256(userSessionSecret(env), `${purpose}:${data}`);") && reauth.includes("&& payload?.purpose === purpose"), "FC-9 0 본인 확인 표는 용도를 서명 문자열과 내용 둘 다로 묶는다");
  ok(oauth.includes('["household-delete", "owner-transfer", "credential-change"].includes(url.searchParams.get("reauth"))'), "FC-9 0 카카오 본인 확인 시작이 owner-transfer 용도를 받는다");
  ok(oauth.includes('"/auth/kakao/callback", false, {limit: autoMode ? 20 : 50});') && !oauth.includes("{limit: 50});"), "FC-8 0 콜백 한도: 손으로 누른 로그인 칸만 50, 자동 로그인 칸은 20 그대로");
  // 부정 단정은 이 묶음이 고친 두 모듈에만 건다(번들 전체에 걸면 다른 묶음의 같은 말에 엉뚱하게 실패한다).
  const accountLink = read("src/modules/auth/kakao-account-link.js");
  ok(oauth.includes("카카오 로그인 요청이 잠시 많아 처리하지 못했습니다. 15분쯤 뒤 다시 시도하거나") && accountLink.includes("카카오 로그인 요청이 잠시 많아요. 15분쯤 뒤 다시 시도해 주세요.") && !oauth.includes("1~2분 뒤 다시 시도") && !accountLink.includes("1~2분 뒤 다시 시도"), "FC-8 0 막힘 안내(로그인 화면·계정 잇기 화면)가 ‘15분쯤’ 이다");
  // ‘15분쯤’ 근거: 시도 제한 창(AUTH_RATE_WINDOW_SECONDS 없으면 900초)과 저장소 SQL(넘으면 blocked_until = 지금 + 창).
  const cryptoSource = read("src/modules/auth/crypto-admin-session.js");
  const sql = read("schema_v22_7_0_auth_atomicity.sql");
  ok(cryptoSource.includes("p_window_seconds: boundedRuntimeNumber(env.AUTH_RATE_WINDOW_SECONDS, 900, 60, 86400),") && sql.includes("p_window_seconds integer default 900") && sql.includes("then v_now + make_interval(secs => v_window)") && sql.includes("v_limit integer := least(50, greatest(3, coalesce(p_limit, 8)));"), "FC-8·15 0 막힘은 창(기본 900초 = 15분) 동안이고 운영 함수 한도 상한은 50");
});

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 1. 고치기 전 결함 장면: 세션 쿠키만으로 양도 → 이제 거절, 역할 그대로
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 1 세션만으로 양도", () => fixture(async (fx) => {
  const before = rolesNow(fx);
  const r = await transfer(fx);
  ok(r.status === 303 && r.location.includes("err=owner_transfer_reauth_required") && !r.location.includes("msg=owner_transferred"), `FC-9 1 세션만으로 보낸 양도는 거절된다 (${r.location})`);
  eq(rolesNow(fx), before, "FC-9 1 역할이 바뀌지 않았다");
  const shown = await pageAt(fx, r.location);
  ok(box(shown.html, "error").includes("소유자 양도 전에 내 계정으로 본인 확인을 완료하세요"), "FC-9 1 화면이 본인 확인이 필요하다고 알린다");
  // 카카오 로그인만 있는 소유자(user-bin)의 화면: 양도 칸 = 카카오 본인 확인 단추(양도 폼은 확인 뒤에 열린다)
  ok(transferForms(shown.html) === 0 && shown.html.includes(`<a class="reauthButton" href="/auth/kakao/start?reauth=owner-transfer&amp;household_id=${HOME}&amp;return_to=${encodeURIComponent(MEMBERS).replace(/&/g, "&amp;")}">카카오 계정으로 본인 확인</a>`) && shown.html.includes("확인 후 양도 단추가 열립니다"), "FC-9 1 카카오만 있는 소유자에게는 ‘카카오 계정으로 본인 확인’ 단추가 보이고 폼은 아직 없다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 2. 로그인 비밀번호: 틀리면 거절, 맞으면 양도. 관리자는 자기 비밀번호가 맞아도 거절
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 2 비밀번호", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const view = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  ok(view.html.includes('<input type="hidden" name="user_id" value="user-wifi"/><input type="hidden" name="month" value="2026-07"/><label>내 계정 로그인 비밀번호<input name="access_code" type="password" autocomplete="current-password" required/></label><button class="transferButton" type="submit">소유자 양도</button></form><div class="orText">또는</div><a class="reauthButton" href="/auth/kakao/start?reauth=owner-transfer&amp;'), "FC-9 2 비밀번호가 있는 소유자의 양도 폼에 비밀번호 칸(삭제 화면과 같은 칸)과 ‘또는 카카오’ 단추");
  eq(transferForms(view.html), 1, "FC-9 2 양도 폼은 구성원 카드에 하나(소유자 자신 제외)");
  const wrong = await transfer(fx, { password: "wrong-password-1" });
  ok(wrong.status === 303 && wrong.location.includes("err=personal_password_invalid"), `FC-9 2 틀린 비밀번호는 거절 (${wrong.location})`);
  eq(rolesNow(fx), "user-bin:owner,user-wifi:member", "FC-9 2 틀린 비밀번호 뒤 역할 그대로");
  eq(box((await pageAt(fx, wrong.location)).html, "error"), "내 계정 로그인 비밀번호가 맞지 않습니다. 다시 확인하거나 계정·보안에서 변경하세요.", "FC-9 2 틀린 비밀번호 안내는 삭제와 같은 문장 그대로");
  const done = await transfer(fx, { password: PASSWORD });
  eq(done.location, `${MEMBERS}&msg=owner_transferred`, "FC-9 2 맞는 비밀번호면 양도된다");
  eq(rolesNow(fx), "user-bin:admin,user-wifi:owner", "FC-9 2 대상이 소유자, 나는 관리자");
  ok(clears(done.cookies, "ab_household_delete_reauth"), "FC-9 2 양도가 끝나면 본인 확인 표 쿠키를 지운다");
  eq(fx.db.household_members.filter((row) => row.household_id === HOME && row.role === "owner").length, 1, "FC-9 2 소유자는 한 명");
  // 관리자가 된 전 소유자: 자기 비밀번호가 맞아도 양도할 수 없다(역할 검사 그대로)
  const adminTry = await transfer(fx, { password: PASSWORD });
  ok(adminTry.location.includes("err=owner_transfer_not_owner") && roleOf(fx, "user-wifi") === "owner", "FC-9 2 관리자(전 소유자)는 맞는 비밀번호로도 양도할 수 없다");
  const adminView = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  ok(adminView.status === 200 && transferForms(adminView.html) === 0 && !adminView.html.includes('class="transferBox"'), "FC-9 2 관리자 화면에는 양도 칸이 없다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 3. 카카오 본인 확인 표(owner-transfer): 실제 시작·콜백 → 양도. 삭제용 표와는 서로 바꿔 쓸 수 없다
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 3 카카오 표", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  // 삭제용 표로는 양도할 수 없다
  const del = await kakaoReauth(fx, "household-delete", DELETE_BACK);
  ok(del.callback?.location.includes("msg=kakao_reauth_verified") && !del.callback.location.includes("kakao_reauth_verified_transfer") && del.ticket.startsWith("ab_household_delete_reauth="), "FC-9 3 가계부 삭제 본인 확인은 예전처럼 끝난다(msg=kakao_reauth_verified, 표 쿠키)");
  const withDeleteTicket = `${fx.cookie}; ${del.ticket}`;
  const deleteTicketTransfer = await transfer(fx, { cookie: withDeleteTicket });
  ok(deleteTicketTransfer.location.includes("err=owner_transfer_reauth_required") && rolesNow(fx) === "user-bin:owner,user-wifi:member", "FC-9 3 삭제용 표로 보낸 양도는 거절(역할 그대로)");
  ok(!(await http(fx, "GET", MEMBERS, { cookie: withDeleteTicket })).html.includes("카카오 계정 본인 확인 완료"), "FC-9 3 삭제용 표로는 양도 칸이 ‘확인 완료’ 가 되지 않는다");
  // 내용의 용도만 owner-transfer 로 고친 삭제 표(서명은 그대로)도 안 된다
  const [data, signature] = decodeURIComponent(del.ticket.slice("ab_household_delete_reauth=".length)).split(".");
  const forged = Buffer.from(JSON.stringify({ ...JSON.parse(Buffer.from(data, "base64url").toString("utf8")), purpose: "owner-transfer" })).toString("base64url");
  const forgedTry = await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${forged}.${signature}` });
  ok(forgedTry.location.includes("err=owner_transfer_reauth_required") && rolesNow(fx) === "user-bin:owner,user-wifi:member", "FC-9 3 용도만 고친 표는 서명이 맞지 않아 거절");
  // 양도용 표: 실제 시작·콜백
  const own = await kakaoReauth(fx, "owner-transfer", MEMBERS);
  eq(own.callback?.location, `${MEMBERS}&msg=kakao_reauth_verified_transfer`, "FC-9 3 양도 본인 확인은 참여자 화면으로 돌아오고 양도용 안내를 단다");
  ok(own.ticket.startsWith("ab_household_delete_reauth=") && own.ticket !== del.ticket, "FC-9 3 양도용 표 쿠키(같은 이름, 다른 값)");
  const withTransferTicket = `${fx.cookie}; ${own.ticket}`;
  const verifiedView = await http(fx, "GET", `${MEMBERS}&msg=kakao_reauth_verified_transfer`, { cookie: withTransferTicket });
  ok(box(verifiedView.html, "ok") === "카카오 계정 본인 확인을 완료했습니다. 5분 안에 소유자 양도를 마치세요." && verifiedView.html.includes('<input type="hidden" name="month" value="2026-07"/><div class="reauthOk">카카오 계정 본인 확인 완료 · 5분 동안 유효</div><button class="transferButton" type="submit">소유자 양도</button>') && !verifiedView.html.includes('name="access_code"'), "FC-9 3 확인 뒤 양도 칸: ‘확인 완료 · 5분’ 과 양도 단추(비밀번호 칸 없음)");
  // 양도용 표로는 삭제할 수 없다
  const transferTicketDelete = await removeHousehold(fx, { cookie: withTransferTicket });
  ok(transferTicketDelete.location.includes("err=account_reauth_required") && fx.db.households.some((row) => row.id === HOME), "FC-9 3 양도용 표로 보낸 가계부 삭제는 거절(가계부 그대로)");
  ok(!(await pageAt(fx, DELETE_BACK, withTransferTicket)).html.includes("카카오 계정 본인 확인 완료"), "FC-9 3 양도용 표로는 삭제 칸이 ‘확인 완료’ 가 되지 않는다");
  // 다른 가계부·다른 사람의 양도용 표도 안 된다(픽스처 비밀값으로 같은 함수가 만든 표)
  const otherHousehold = await makeHouseholdDeleteReauthToken(fx.env, "user-bin", "house-trip", "owner-transfer");
  ok((await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${otherHousehold}` })).location.includes("err=owner_transfer_reauth_required"), "FC-9 3 다른 가계부의 양도용 표는 거절");
  // 양도용 표 + 세션 → 양도된다, 표는 쓴 뒤 지운다
  const done = await transfer(fx, { cookie: withTransferTicket });
  eq(done.location, `${MEMBERS}&msg=owner_transferred`, "FC-9 3 양도용 표가 있으면 비밀번호 없이 양도된다");
  eq(rolesNow(fx), "user-bin:admin,user-wifi:owner", "FC-9 3 역할이 바뀌었다");
  ok(clears(done.cookies, "ab_household_delete_reauth"), "FC-9 3 쓴 표는 지운다");
  // 관리자는 자기 양도용 표가 있어도 양도할 수 없다(역할 검사가 먼저)
  const adminTicket = await makeHouseholdDeleteReauthToken(fx.env, "user-bin", HOME, "owner-transfer");
  ok((await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${adminTicket}` })).location.includes("err=owner_transfer_not_owner") && roleOf(fx, "user-wifi") === "owner", "FC-9 3 관리자는 양도용 표가 있어도 거절");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 4. 구성원·관리자는 카카오 양도 확인을 시작하지 못하고, 채팅만 쓰는 소유자에게는 로그인 수단 안내
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 4 시작 권한·안내", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const wifi = await fx.cookieFor("user-wifi");
  const memberStart = await http(fx, "GET", `/auth/kakao/start?reauth=owner-transfer&household_id=${HOME}&return_to=${encodeURIComponent(MEMBERS)}`, { cookie: wifi });
  ok(memberStart.status === 303 && memberStart.location.includes("err=owner_transfer_not_owner") && !memberStart.cookies.some((line) => line.startsWith("kakao_oauth_state=") && !/Max-Age=0/i.test(line)), `FC-9 4 구성원은 양도 본인 확인을 시작하지 못한다 (${memberStart.location})`);
  fx.db.household_members.find((row) => row.household_id === HOME && row.user_id === "user-wifi").role = "admin";
  await givePassword(fx, "user-wifi", "v126wifi");
  const adminTry = await transfer(fx, { cookie: wifi, target: "user-bin", password: PASSWORD });
  ok(adminTry.location.includes("err=owner_transfer_not_owner") && rolesNow(fx) === "user-bin:owner,user-wifi:admin", "FC-9 4 관리자는 자기 비밀번호가 맞아도 양도할 수 없다(역할 그대로)");
  // 채팅만 쓰는 소유자(카카오 로그인·비밀번호 없음): 양도 칸에 실제로 갈 수 있는 길(웹 연결 코드 → 첫 비밀번호), 폼 없음, 보내도 거절. 끝까지 가는 장면은 FC-9 6.
  fx.db.users.find((row) => row.id === "user-bin").kakao_user_key = "v126-chat-only-key";
  const chatOnly = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  const claimHref = `/my/kakao-claim?auto=0&return_to=${encodeURIComponent(`/my/backup-login?return_to=${encodeURIComponent(MEMBERS)}`)}#kakao-claim-start`;
  ok(chatOnly.status === 200 && transferForms(chatOnly.html) === 0 && chatOnly.html.includes("소유자를 양도하려면 내 계정 로그인 비밀번호가 필요해요. 카카오 1:1 채팅에서 ‘웹 가계부 열기’를 보내 웹 연결 코드를 받은 뒤, 아래 ‘웹 연결 코드 넣기’에서 코드를 붙여 넣으세요.") && chatOnly.html.includes(`<a class="reauthButton" href="${claimHref.replace(/&/g, "&amp;")}">웹 연결 코드 넣기</a>`) && !chatOnly.html.includes("로그인 수단을 연결해 주세요"), "FC-9 4 채팅만 쓰는 소유자에게는 웹 연결 코드 길 안내와 ‘웹 연결 코드 넣기’ 단추(예전 ‘로그인 수단을 연결’ 은 갈 수 없는 길)");
  const chatTry = await transfer(fx);
  ok(chatTry.location.includes("err=owner_transfer_reauth_required") && rolesNow(fx) === "user-bin:owner,user-wifi:admin", "FC-9 4 채팅만 쓰는 소유자의 양도도 거절(역할 그대로)");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 5. 가계부 삭제는 예전 그대로(비밀번호·카카오 표)
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 5 삭제 그대로(비밀번호)", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const wrong = await removeHousehold(fx, { password: "wrong-password-1" });
  ok(wrong.location.includes("err=personal_password_invalid") && fx.db.households.some((row) => row.id === HOME), "FC-9 5 삭제: 틀린 비밀번호는 예전처럼 personal_password_invalid");
  const none = await removeHousehold(fx);
  ok(none.location.includes("err=account_reauth_required"), "FC-9 5 삭제: 비밀번호 없이 보내면 예전처럼 account_reauth_required");
  const done = await removeHousehold(fx, { password: PASSWORD });
  ok(done.location.includes("msg=household_deleted") && !fx.db.households.some((row) => row.id === HOME), "FC-9 5 삭제: 맞는 비밀번호면 예전처럼 지운다");
}));
await section("FC-9 5 삭제 그대로(카카오 표)", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const del = await kakaoReauth(fx, "household-delete", DELETE_BACK);
  const verified = await pageAt(fx, DELETE_BACK, `${fx.cookie}; ${del.ticket}`);
  ok(verified.html.includes("카카오 계정 본인 확인 완료"), "FC-9 5 삭제 칸: 삭제용 표로 ‘확인 완료’ 가 예전처럼 열린다");
  const done = await removeHousehold(fx, { cookie: `${fx.cookie}; ${del.ticket}` });
  ok(done.location.includes("msg=household_deleted") && !fx.db.households.some((row) => row.id === HOME) && clears(done.cookies, "ab_household_delete_reauth"), "FC-9 5 삭제: 삭제용 표로 예전처럼 지우고 표를 지운다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 6. (2차, 독립 검토 P2) 채팅만 쓰는 방 소유자: 양도 칸이 가리키는 길을 끝까지 — 방 링크 단추(카카오톡 인앱) → ‘웹 연결 코드 넣기’
//         → 1:1 ‘웹 가계부 열기’ 코드 → 내 계정·보안에서 첫 비밀번호(코드가 준 5분 본인 확인) → 참여자 화면으로 돌아와 그 비밀번호로 양도
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 6 채팅만 쓰는 방 소유자의 길", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const room = await roomHousehold(fx, "chat-only");
  ok(room.ownerId && room.memberId && room.hid && roleOf(fx, room.ownerId, room.hid) === "owner" && roleOf(fx, room.memberId, room.hid) === "member", `FC-9 6 준비: 방의 첫 호출자가 소유자, 둘째가 구성원 (${room.ownerId}/${room.memberId})`);
  ok(!fx.db.accountbook_user_identities.some((row) => String(row.user_id) === room.ownerId), "FC-9 6 준비: 소유자는 채팅 계정뿐(로그인 비밀번호·카카오 로그인 식별 없음)");
  const jar = await openFromRoom(fx, room);
  const cookie = () => jarStr(jar);
  ok(sessionUserOf(jar) === room.ownerId && !jar.has("ab_credential_reauth"), "FC-9 6 방 링크 단추(인앱)로 연 세션은 그 소유자이고, 비밀번호를 정할 본인 확인 표는 없다");
  // (3차) 같은 소유자가 다른 브라우저에서도 방 링크로 열어 둔 세션 — 첫 비밀번호 저장 뒤 로그아웃되는지 본다(양도 칸의 결과 문장).
  const otherBrowser = await openFromRoom(fx, room);
  ok(sessionUserOf(otherBrowser) === room.ownerId, "FC-9 6 준비: 다른 브라우저에도 같은 소유자 세션");
  const backupPath = `/my/backup-login?return_to=${encodeURIComponent(room.membersPath)}`;
  const claimHref = `/my/kakao-claim?auto=0&return_to=${encodeURIComponent(backupPath)}#kakao-claim-start`;
  const view = await http(fx, "GET", room.membersPath, { cookie: cookie(), ua: INAPP });
  ok(view.status === 200 && transferForms(view.html) === 0 && view.html.includes(`<a class="reauthButton" href="${claimHref.replace(/&/g, "&amp;")}">웹 연결 코드 넣기</a>`) && view.html.includes("이어서 열리는 ‘내 계정·보안’에서 5분 안에 로그인 이름과 비밀번호를 저장하면 이 화면으로 돌아와 그 비밀번호로 양도할 수 있어요."), "FC-9 6 양도 칸: 웹 연결 코드 길 안내와 ‘웹 연결 코드 넣기’ 단추");
  ok(view.html.includes(`그 비밀번호로 양도할 수 있어요. ${CONSEQUENCE}</p>`), "FC-9 6 (3차) 양도 칸이 저장의 결과(다른 기기·브라우저 로그아웃, 로그인돼 있지 않은 브라우저의 방 단추는 로그인 이름·비밀번호)를 한 문장으로 알린다");
  const sessionOnly = await transfer(fx, { cookie: cookie(), target: room.memberId, household: room.hid, month: room.month, ua: INAPP });
  ok(sessionOnly.location.includes("err=owner_transfer_reauth_required") && roleOf(fx, room.ownerId, room.hid) === "owner", "FC-9 6 방 링크 세션만으로는 양도되지 않는다");
  const leaveForm = { household_id: room.hid, month: room.month, understand_history: "1" };
  const leaveAsOwner = await http(fx, "POST", "/my/household/leave", { cookie: cookie(), ua: INAPP, form: leaveForm });
  ok(leaveAsOwner.location.includes("err=household_leave_owner_blocked"), "FC-9 6 소유자는 나가기도 막혀 있다(양도한 뒤 나가라는 안내) — 그래서 양도 길이 막히면 나가지도 못했다");
  // 예전 안내가 가리키던 길은 막혀 있다: 카카오 본인 확인(인앱 403, 브라우저에서도 카카오 로그인 없음), 본인 확인 표 없는 첫 비밀번호.
  const reauthStart = `/auth/kakao/start?reauth=owner-transfer&household_id=${encodeURIComponent(room.hid)}&return_to=${encodeURIComponent(room.membersPath)}`;
  const kakaoInApp = await http(fx, "GET", reauthStart, { cookie: cookie(), ua: INAPP });
  ok(kakaoInApp.status === 403 && kakaoInApp.html.includes("본인 확인은 Chrome 또는 Safari에서 이 주소를 열어 진행해 주세요."), "FC-9 6 카카오톡 안의 카카오 본인 확인 시작은 403(그 화면 문장)");
  const kakaoBrowser = await http(fx, "GET", reauthStart, { cookie: cookie() });
  ok(kakaoBrowser.location.includes("err=kakao_reauth_unavailable"), `FC-9 6 보통 브라우저에서도 카카오 로그인이 없는 계정은 카카오 본인 확인을 할 수 없다 (${kakaoBrowser.location})`);
  const ROOM_PASS = "v126-room-owner-pass";
  const saveForm = { login_name: "v126roomowner", access_code: ROOM_PASS, access_code_confirm: ROOM_PASS, current_password: "", return_to: room.membersPath };
  const noProof = await http(fx, "POST", "/my/backup-login", { cookie: cookie(), ua: INAPP, form: saveForm });
  ok(noProof.status === 403 && noProof.html.includes("현재 로그인 비밀번호 또는 원래 연결한 카카오 계정으로 먼저 본인 확인을 완료하세요."), "FC-9 6 본인 확인 표 없이는 첫 비밀번호도 저장되지 않는다(예전 안내만 따르면 막다른 길)");
  // 단추 → 웹 연결 코드 칸(인앱에서 자동 로그인 없이). 코드 뒤 돌아갈 곳 = 내 계정·보안(그 뒤 참여자 화면).
  const claimPage = await http(fx, "GET", claimHref.replace(/#.*$/, ""), { cookie: cookie(), ua: INAPP });
  const claimForm = (claimPage.html.match(/<form method="post" action="\/my\/kakao-claim">[\s\S]*?<\/form>/) || [""])[0];
  ok(claimPage.status === 200 && claimPage.html.includes('id="kakao-claim-start" open') && claimForm.includes(`name="return_to" value="${backupPath.replace(/&/g, "&amp;")}"`), `FC-9 6 ‘웹 연결 코드 넣기’ 는 코드 칸을 펼쳐 열고 코드 뒤 돌아갈 곳을 싣는다 (${claimPage.status})`);
  const code = claimCodeOf(await say(fx, "웹 가계부 열기", { user: room.owner }));
  ok(code, "FC-9 6 1:1 채팅 ‘웹 가계부 열기’ 가 웹 연결 코드를 준다");
  const claim = await http(fx, "POST", "/my/kakao-claim", { cookie: cookie(), ua: INAPP, form: { kakao_claim_code: code, return_to: backupPath } });
  applySet(jar, claim.cookies);
  ok(claim.status === 303 && claim.location === backupPath && sessionUserOf(jar) === room.ownerId && jar.has("ab_credential_reauth"), `FC-9 6 코드를 넣으면 같은 계정 세션과 5분 본인 확인 표를 받고 내 계정·보안으로 간다 (${claim.location})`);
  // (3차, 독립 검토 2차 P3) 서버의 만료를 본다: 같은 표 쿠키를 그대로 싣고 시계만 6분 앞으로(withClock 은 자연어 날짜만 바꾸므로 Date.now 를 옮긴다).
  const realNow = Date.now;
  let late;
  Date.now = () => realNow() + 6 * 60 * 1000;
  try { late = await http(fx, "POST", "/my/backup-login", { cookie: cookie(), ua: INAPP, form: saveForm }); }
  finally { Date.now = realNow; }
  ok(jar.has("ab_credential_reauth") && late.status === 403 && !fx.db.accountbook_user_identities.some((row) => String(row.user_id) === room.ownerId), `FC-9 6 받은 지 6분 된 표(쿠키는 그대로)로는 서버가 첫 비밀번호를 거절한다 — 새 코드로 다시 (${late.status})`);
  const security = await http(fx, "GET", claim.location, { cookie: cookie(), ua: INAPP });
  ok(security.status === 200 && security.html.includes("본인 확인을 마쳤어요. 5분 안에 아래 2번에서 로그인 이름과 비밀번호를 정해 저장하세요. 현재 비밀번호 칸은 비워 두세요."), "FC-9 6 내 계정·보안 1번 칸이 ‘본인 확인을 마쳤어요’ 라고 말한다");
  const saved = await http(fx, "POST", "/my/backup-login", { cookie: cookie(), ua: INAPP, form: saveForm });
  applySet(jar, saved.cookies);
  eq(saved.location, `${room.membersPath}&msg=backup_login_saved`, "FC-9 6 첫 비밀번호를 저장하면 참여자 화면으로 돌아온다");
  const otherAfter = await http(fx, "GET", room.membersPath, { cookie: jarStr(otherBrowser), ua: INAPP });
  ok(otherAfter.status === 303 && !otherAfter.html.includes("참여자·초대 관리"), `FC-9 6 (3차) 저장하면 다른 브라우저의 세션은 끊긴다(로그아웃) (${otherAfter.status} ${otherAfter.location.slice(0, 60)})`);
  const back = await http(fx, "GET", room.membersPath, { cookie: cookie(), ua: INAPP });
  ok(transferForms(back.html) === 1 && back.html.includes('<label>내 계정 로그인 비밀번호<input name="access_code" type="password" autocomplete="current-password" required/></label>'), "FC-9 6 이제 양도 칸에 비밀번호 칸과 양도 단추가 있다");
  const done = await transfer(fx, { cookie: cookie(), target: room.memberId, household: room.hid, month: room.month, password: ROOM_PASS, ua: INAPP });
  ok(done.location.includes("msg=owner_transferred") && roleOf(fx, room.ownerId, room.hid) === "admin" && roleOf(fx, room.memberId, room.hid) === "owner", `FC-9 6 그 비밀번호로 양도된다(카카오톡 안에서도) (${done.location})`);
  // 그 뒤의 방 링크 단추(바꾸지 않은 V22.9.118 S-2 규칙, 보고서에 적는 결과): 로그인 이름이 붙은 채팅 계정이라 같은 브라우저 세션이 살아 있으면
  // 그대로 홈, 세션이 없는 브라우저는 로그인 이름 칸을 연 로그인 화면을 거친다.
  const roomLink = `/my?botUserKey=${room.owner}&botGroupKey=${room.room}`;
  const sameBrowser = await http(fx, "GET", roomLink, { cookie: cookie(), ua: INAPP });
  const freshBrowser = await http(fx, "GET", roomLink, { ua: INAPP });
  const loggedOutBrowser = await http(fx, "GET", roomLink, { cookie: jarStr(otherBrowser), ua: INAPP });
  // V22.9.130 방 전용 보기: 세션이 없는 브라우저는 로그인 이름 화면 대신 그 방 가계부만·보기 전용으로 들어온다. 온전한 세션은 여전히 주지 않는다
  // (받는 표는 넷째 칸 r:<가계부 번호> 가 붙은 방 전용 표다 — 양도·비밀번호 같은 계정 일은 로그인해야 한다).
  const freshToken = decodeURIComponent(pairOf(freshBrowser.cookies, "ab_user").slice("ab_user=".length)).split(".")[0].split("|");
  ok(sameBrowser.location && !sameBrowser.location.includes("login=1") && freshBrowser.location === `/app?household_id=${room.hid}` && freshToken.length === 4 && freshToken[0] === room.ownerId && freshToken[3] === `r:${room.hid}`, `FC-9 6 그 뒤 방 링크: 같은 브라우저는 홈, 세션 없는 브라우저는 그 방 가계부만·보기 전용 (${sameBrowser.location} / ${freshBrowser.location} / ${freshToken.length}칸)`);
  eq(loggedOutBrowser.location, freshBrowser.location, "FC-9 6 (3차) 로그아웃된 다른 브라우저의 방 단추도 같다(그 방 가계부만·보기 전용)");
  const leaveAfter = await http(fx, "POST", "/my/household/leave", { cookie: cookie(), ua: INAPP, form: leaveForm });
  ok(leaveAfter.location.includes("msg=household_left") && !roleOf(fx, room.ownerId, room.hid) && roleOf(fx, room.memberId, room.hid) === "owner", `FC-9 6 양도한 뒤에는 그 가계부에서 나갈 수 있다 (${leaveAfter.location})`);
})));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 7. (2차) 카카오 로그인이 있는 소유자: 카카오톡 안에서는 갈 길(Chrome·Safari)을 적고, 그 길로 끝까지 — 채팅 요청에 카카오 id 가 오는 방 소유자 포함
// ═════════════════════════════════════════════════════════════════════════════════════
const IN_APP_NOTE = "카카오톡 안에서는 카카오 본인 확인이 열리지 않아요. Chrome·Safari에서 ‘카카오 로그인’으로 로그인한 뒤 ‘참여자·초대’에서 이 단추를 눌러 주세요.";
await section("FC-9 7 카카오 로그인 소유자의 인앱 안내와 브라우저 길", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const inApp = await http(fx, "GET", MEMBERS, { cookie: fx.cookie, ua: INAPP });
  const pc = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  ok(inApp.html.includes(IN_APP_NOTE) && !pc.html.includes(IN_APP_NOTE) && pc.html.includes("확인 후 양도 단추가 열립니다."), "FC-9 7 카카오 단추만 있는 양도 칸: 카카오톡 안에서만 Chrome·Safari 길을 적는다");
  const start = await http(fx, "GET", `/auth/kakao/start?reauth=owner-transfer&household_id=${HOME}&return_to=${encodeURIComponent(MEMBERS)}`, { cookie: fx.cookie, ua: INAPP });
  ok(start.status === 403 && start.html.includes("본인 확인은 Chrome 또는 Safari에서 이 주소를 열어 진행해 주세요."), "FC-9 7 카카오톡 안에서 단추를 누르면 403(안내가 미리 말한 대로)");
  // 채팅 요청에 카카오 id(appUserId)가 오는 방 소유자: 채팅 계정에 kakao_login 별칭이 붙어 카카오 단추 칸이 된다.
  const room = await roomHousehold(fx, "kakao-alias", { appUserId: "5501" });
  const jar = await openFromRoom(fx, room);
  const roomView = await http(fx, "GET", room.membersPath, { cookie: jarStr(jar), ua: INAPP });
  ok(sessionUserOf(jar) === room.ownerId && roomView.html.includes(IN_APP_NOTE) && transferForms(roomView.html) === 0, "FC-9 7 그 방 소유자가 방 링크(인앱)로 열면 Chrome·Safari 안내가 보인다");
  // Chrome·Safari: 카카오로 로그인 → 참여자·초대 → 카카오 본인 확인 → 양도
  const browser = new Map();
  applySet(browser, (await http(fx, "GET", "/auth/kakao/start")).cookies);
  const restore = kakaoServers(5501);
  let login;
  try { login = await http(fx, "GET", `/auth/kakao/callback?code=qa-v126&state=${encodeURIComponent(decodeURIComponent(browser.get("kakao_oauth_state") || ""))}`, { cookie: jarStr(browser) }); }
  finally { restore(); }
  applySet(browser, login.cookies);
  eq(sessionUserOf(browser), room.ownerId, "FC-9 7 브라우저에서 카카오로 로그인하면 그 방 소유자(채팅 계정)로 들어간다");
  const pcView = await http(fx, "GET", room.membersPath, { cookie: jarStr(browser) });
  ok(!pcView.html.includes(IN_APP_NOTE) && pcView.html.includes(">카카오 계정으로 본인 확인</a>"), "FC-9 7 브라우저의 양도 칸은 카카오 본인 확인 단추");
  const own = await kakaoReauth(fx, "owner-transfer", room.membersPath, { cookie: jarStr(browser), household: room.hid, kakaoId: 5501 });
  ok(own.callback?.location === `${room.membersPath}&msg=kakao_reauth_verified_transfer` && own.ticket, `FC-9 7 카카오 본인 확인을 마치고 참여자 화면으로 돌아온다 (${own.callback?.location})`);
  const done = await transfer(fx, { cookie: `${jarStr(browser)}; ${own.ticket}`, target: room.memberId, household: room.hid, month: room.month });
  ok(done.location.includes("msg=owner_transferred") && roleOf(fx, room.ownerId, room.hid) === "admin" && roleOf(fx, room.memberId, room.hid) === "owner", "FC-9 7 그 표로 양도된다");
})));
// (3차, 독립 검토 2차 P3) 비밀번호와 카카오가 모두 있는 칸(①)도 카카오톡 인앱에서는 ‘또는 카카오’ 단추가 403 으로 끝났다 → 인앱에서는 그 단추를 뺀다.
await section("FC-9 7 비밀번호+카카오 소유자의 인앱", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  await givePassword(fx, "user-bin", "v126bin");
  const inApp = await http(fx, "GET", MEMBERS, { cookie: fx.cookie, ua: INAPP });
  const pc = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  ok(transferForms(inApp.html) === 1 && inApp.html.includes('<label>내 계정 로그인 비밀번호<input name="access_code" type="password"') && !inApp.html.includes(">카카오 계정으로 본인 확인</a>") && !inApp.html.includes('<div class="orText">또는</div>'), "FC-9 7 카카오톡 인앱의 ① 칸: 비밀번호 칸만(누르면 403 인 ‘또는 카카오’ 단추는 뺀다)");
  ok(transferForms(pc.html) === 1 && pc.html.includes('<div class="orText">또는</div><a class="reauthButton"') && pc.html.includes(">카카오 계정으로 본인 확인</a>"), "FC-9 7 보통 브라우저의 ① 칸은 예전처럼 ‘또는 카카오’ 단추가 있다");
  ok((await transfer(fx, { password: PASSWORD, ua: INAPP })).location.includes("msg=owner_transferred"), "FC-9 7 인앱에서도 비밀번호로 양도된다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 8. (2차, 검사 빈틈) 만료된 양도용 표, 같은 가계부의 다른 사람에게 나온 표, 부분 실패 뒤 카카오 표로 다시 눌러 복구
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 8 만료·다른 사람 표", () => fixture(async (fx) => {
  const realNow = Date.now;
  let expired = "";
  Date.now = () => realNow() - 6 * 60 * 1000;
  try { expired = await makeHouseholdDeleteReauthToken(fx.env, "user-bin", HOME, "owner-transfer"); }
  finally { Date.now = realNow; }
  const late = await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${expired}` });
  ok(late.location.includes("err=owner_transfer_reauth_required") && rolesNow(fx) === "user-bin:owner,user-wifi:member", "FC-9 8 6분 전에 받은 양도용 표(5분 지남)는 거절, 역할 그대로");
  ok(!(await http(fx, "GET", MEMBERS, { cookie: `${fx.cookie}; ab_household_delete_reauth=${expired}` })).html.includes("카카오 계정 본인 확인 완료"), "FC-9 8 만료된 표로는 양도 칸이 ‘확인 완료’ 가 되지 않는다");
  const wifiTicket = await makeHouseholdDeleteReauthToken(fx.env, "user-wifi", HOME, "owner-transfer");
  const borrowed = await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${wifiTicket}` });
  ok(borrowed.location.includes("err=owner_transfer_reauth_required") && rolesNow(fx) === "user-bin:owner,user-wifi:member", "FC-9 8 같은 가계부의 다른 사람(user-wifi)에게 나온 양도용 표는 소유자 세션에서도 거절");
  const fresh = await makeHouseholdDeleteReauthToken(fx.env, "user-bin", HOME, "owner-transfer");
  ok((await transfer(fx, { cookie: `${fx.cookie}; ab_household_delete_reauth=${fresh}` })).location.includes("msg=owner_transferred"), "FC-9 8 대조: 지금 받은 자기 표로는 양도된다");
}));
await section("FC-9 8 부분 실패 뒤 카카오 표로 복구", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const own = await kakaoReauth(fx, "owner-transfer", MEMBERS);
  const cookie = `${fx.cookie}; ${own.ticket}`;
  let failures = 1;
  const restore = intercept(async ({ url, method }) => (method === "PATCH" && url.pathname === "/rest/v1/household_members" && url.searchParams.get("user_id") === "eq.user-bin" && url.searchParams.get("role") === "eq.owner" && failures-- > 0 ? failure(503) : null));
  let partial;
  try { partial = await transfer(fx, { cookie }); }
  finally { restore(); }
  ok(partial.location.includes("err=owner_transfer_partial") && roleOf(fx, "user-wifi") === "owner" && roleOf(fx, "user-bin") === "owner" && !clears(partial.cookies, "ab_household_delete_reauth"), `FC-9 8 나를 내리는 쓰기가 실패하면 부분 실패로 알리고 카카오 표는 남긴다 (${partial.location})`);
  const recovered = await transfer(fx, { cookie });
  ok(recovered.location.includes("msg=owner_transferred") && rolesNow(fx) === "user-bin:admin,user-wifi:owner" && clears(recovered.cookies, "ab_household_delete_reauth"), "FC-9 8 같은 카카오 표로 다시 누르면 나만 내려 끝나고(복구) 표를 지운다");
  eq(fx.db.household_members.filter((row) => row.household_id === HOME && row.role === "owner").length, 1, "FC-9 8 복구 뒤 소유자는 한 명");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 9. (2차) 로그인 수단을 읽지 못하면 맞는 비밀번호에도 ‘본인 확인을 완료하세요’ 가 나왔다 → ‘잠시 후 다시’(양도는 하지 않는다)
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 9 로그인 수단 읽기 실패", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const restore = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_user_identities" && url.searchParams.get("provider") === "eq.local" ? failure(503) : null));
  let withPassword, withoutPassword;
  try {
    withPassword = await transfer(fx, { password: PASSWORD });
    withoutPassword = await transfer(fx);
  } finally { restore(); }
  ok(withPassword.location.includes("err=password_reauth_unavailable") && rolesNow(fx) === "user-bin:owner,user-wifi:member", `FC-9 9 읽기 실패 + 맞는 비밀번호 → ‘확인 못 함’, 역할 그대로 (${withPassword.location})`);
  ok(box((await pageAt(fx, withPassword.location)).html, "error").includes("본인 확인을 지금 하지 못했습니다"), "FC-9 9 화면 안내는 ‘잠시 후 다시’ 쪽");
  ok(withoutPassword.location.includes("err=owner_transfer_reauth_required"), "FC-9 9 비밀번호 없이 보낸 양도는 예전처럼 ‘본인 확인을 완료하세요’");
  ok((await transfer(fx, { password: PASSWORD })).location.includes("msg=owner_transferred"), "FC-9 9 읽기가 돌아오면 같은 비밀번호로 양도된다");
}));
// (3차, 독립 검토 2차 P3) 읽기 실패 때 화면이 비밀번호가 있는 소유자에게 ②(카카오) 또는 ④(웹 연결 코드) 길을 그렸다 → 새로고침 한 줄만, 양도 단추 없음.
await section("FC-9 9 로그인 수단 읽기 실패 — 화면", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  await givePassword(fx, "user-bin", "v126bin");
  const room = await roomHousehold(fx, "lookup-fail");
  await givePassword(fx, room.ownerId, "v126lookup");
  const roomCookie = await fx.cookieFor(room.ownerId);
  const roomDelete = `/my/households?month=${room.month}&household_id=${encodeURIComponent(room.hid)}&manage=${encodeURIComponent(room.hid)}`;
  const restore = identitiesDown();
  let bin, chat, binPost, chatPost, chatDelete;
  try {
    bin = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
    chat = await http(fx, "GET", room.membersPath, { cookie: roomCookie, ua: INAPP });
    binPost = await transfer(fx, { password: PASSWORD });
    chatPost = await transfer(fx, { cookie: roomCookie, target: room.memberId, household: room.hid, month: room.month, password: PASSWORD, ua: INAPP });
    chatDelete = panelOf((await http(fx, "GET", roomDelete, { cookie: roomCookie, ua: INAPP })).html);
  } finally { restore(); }
  const onlyReload = (html) => html.includes(`<div class="transferBox"><p class="muted">${RELOAD_LINE}</p></div>`) && transferForms(html) === 0 && !html.includes("웹 연결 코드 넣기") && !html.includes(">카카오 계정으로 본인 확인</a>");
  ok(onlyReload(bin.html), "FC-9 9 비밀번호(+카카오) 소유자 + 로그인 수단 읽기 실패: 새로고침 한 줄만(예전 ② 카카오 안내 아님), 양도 단추 없음");
  ok(onlyReload(chat.html), "FC-9 9 비밀번호가 있는 방 소유자 + 읽기 실패: 새로고침 한 줄만(예전 ④ 웹 연결 코드 안내 아님)");
  ok(binPost.location.includes("err=password_reauth_unavailable") && chatPost.location.includes("err=password_reauth_unavailable") && rolesNow(fx) === "user-bin:owner,user-wifi:member" && roleOf(fx, room.ownerId, room.hid) === "owner", "FC-9 9 그 상태에서 맞는 비밀번호를 보내도 거절(확인 못 함), 역할 그대로");
  eq(chatDelete, `<div class="dangerZone"><h3>가계부 영구 삭제</h3><p>${RELOAD_LINE}</p></div>`, "FC-9 9 같은 읽기 실패의 삭제 칸(채팅 계정 갈래)도 새 웹 연결 코드 길 대신 새로고침 한 줄");
  const recovered = await http(fx, "GET", room.membersPath, { cookie: roomCookie, ua: INAPP });
  ok(transferForms(recovered.html) === 1 && !recovered.html.includes(RELOAD_LINE), "FC-9 9 읽기가 돌아오면 비밀번호 칸이 다시 보인다");
})));
// (4차, 독립 검토 3차 P3) 두 확인이 실패 표시 하나를 같이 써서, 한쪽 읽기만 실패해도 읽힌 비밀번호 칸·카카오 단추까지 새로고침 한 줄로 가렸다(깨진 링크 줄이면
//  계속). → 읽힌 수단은 삭제 칸과 같은 순서로 그대로 보이고, 새로고침 한 줄은 둘 다 실패했거나 수단을 하나도 못 찾았을 때만. 삭제 칸은 바꾸지 않았다.
const roomDeletePath = (room) => `/my/households?month=${room.month}&household_id=${encodeURIComponent(room.hid)}&manage=${encodeURIComponent(room.hid)}`;
await section("FC-9 9 (4차 a) 식별 링크 읽기만 실패 — 비밀번호 소유자", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const room = await roomHousehold(fx, "links-down");
  await givePassword(fx, room.ownerId, "v126linksdown");
  const cookie = await fx.cookieFor(room.ownerId);
  const down = readsDown(LINKS);
  let members, panel, done;
  try {
    members = await http(fx, "GET", room.membersPath, { cookie });
    panel = panelOf((await http(fx, "GET", roomDeletePath(room), { cookie })).html);
    done = await transfer(fx, { cookie, target: room.memberId, household: room.hid, month: room.month, password: PASSWORD });
  } finally { down.restore(); }
  ok(down.hits > 0 && passwordBoxShown(members.html), `FC-9 9 (4차 a) 비밀번호가 있는 방 소유자 + 식별 링크 설정 읽기만 실패(503 ${down.hits}회): 비밀번호 칸이 보인다`);
  ok(deleteHasPassword(panel), "FC-9 9 (4차 a) 같은 실패의 삭제 칸도 비밀번호 칸(두 칸이 같은 수단)");
  ok(done.location.includes("msg=owner_transferred") && roleOf(fx, room.memberId, room.hid) === "owner" && roleOf(fx, room.ownerId, room.hid) === "admin", `FC-9 9 (4차 a) 그 비밀번호로 양도된다 (${done.location.slice(-40)})`);
})));
await section("FC-9 9 (4차 b) 비밀번호 쪽 읽기만 실패 — 카카오만 있는 소유자", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  for (const [label, match] of [["로그인 비밀번호 행 읽기", LOCAL], ["식별 링크 설정 읽기(비밀번호 쪽만 읽는다)", LINKS]]) {
    const down = readsDown(match);
    let members, panel;
    try {
      members = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
      panel = panelOf((await http(fx, "GET", DELETE_BACK.replace(/#.*$/, ""), { cookie: fx.cookie })).html);
    } finally { down.restore(); }
    ok(down.hits > 0 && kakaoBoxShown(members.html) && transferForms(members.html) === 0, `FC-9 9 (4차 b) 카카오만 있는 소유자 + ${label}만 실패(503 ${down.hits}회): 카카오 본인 확인 단추가 보인다`);
    ok(deleteHasKakao(panel), `FC-9 9 (4차 b) ${label}만 실패한 삭제 칸도 카카오 단추(두 칸이 같은 수단)`);
  }
}));
await section("FC-9 9 (4차 c) 두 읽기 모두 실패", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  await givePassword(fx, "user-bin", "v126bin");
  const room = await roomHousehold(fx, "both-down");
  await givePassword(fx, room.ownerId, "v126bothdown");
  const roomCookie = await fx.cookieFor(room.ownerId);
  const down = readsDown((url) => LINKS(url) || url.pathname === "/rest/v1/accountbook_user_identities");
  let bin, chat;
  try {
    bin = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
    chat = await http(fx, "GET", room.membersPath, { cookie: roomCookie });
  } finally { down.restore(); }
  ok(down.hits > 0 && reloadOnly(bin.html) && reloadOnly(chat.html), "FC-9 9 (4차 c) 두 읽기가 모두 실패하면 3차처럼 새로고침 한 줄만(비밀번호+카카오 소유자, 비밀번호가 있는 방 소유자)");
})));
await section("FC-9 9 (4차 d) 식별 링크 설정이 풀리지 않음", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const room = await roomHousehold(fx, "links-broken");
  await givePassword(fx, room.ownerId, "v126linksbroken");
  const cookie = await fx.cookieFor(room.ownerId);
  // 읽기는 되지만 JSON 으로 풀리지 않는 링크 줄(계속 깨져 있는 경우). 설정 표는 key 가 기본 키다.
  const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
  if (row) row.value = "{not json";
  else fx.db.accountbook_settings.push({ key: "user_identity_links", value: "{not json", created_at: "2026-11-16T00:00:00.000Z" });
  const members = await http(fx, "GET", room.membersPath, { cookie });
  const panel = panelOf((await http(fx, "GET", roomDeletePath(room), { cookie })).html);
  const kakaoOnly = await http(fx, "GET", MEMBERS, { cookie: fx.cookie });
  const done = await transfer(fx, { cookie, target: room.memberId, household: room.hid, month: room.month, password: PASSWORD });
  ok(passwordBoxShown(members.html) && deleteHasPassword(panel), "FC-9 9 (4차 d) 링크 줄이 깨져 있어도 비밀번호가 있는 방 소유자에게 양도·삭제 칸 모두 비밀번호 칸(a 와 같다)");
  ok(kakaoBoxShown(kakaoOnly.html), "FC-9 9 (4차 d) 같은 상태에서 카카오만 있는 소유자에게는 카카오 단추");
  ok(done.location.includes("msg=owner_transferred") && roleOf(fx, room.memberId, room.hid) === "owner", `FC-9 9 (4차 d) 그 비밀번호로 양도된다 (${done.location.slice(-40)})`);
})));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 10. (2차, 확인이 필요한 가정 1) 표 없이 소유자로 올리는 다른 길: 권한 저장(/admin/member/update)·카카오 채팅. 고치기 전 번들에서도 같아야 한다.
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 10 다른 길로 소유자 올리기", () => withClock("2026-11-16", () => fixture(async (fx) => {
  const update = (cookie, target, role) => http(fx, "POST", "/admin/member/update", { cookie, form: { household_id: HOME, user_id: target, role, return_to: MEMBERS } });
  // 거절한 자리까지 본다(앞단의 다른 오류로 막힌 것이면 이 장면은 아무것도 증명하지 못한다).
  const errOf = (response) => new URL(response.location || "/", BASE).searchParams.get("err") || "";
  const before = rolesNow(fx);
  const ownerRaise = await update(fx.cookie, "user-wifi", "owner");
  ok(errOf(ownerRaise).startsWith("이미 소유자가 있습니다.") && rolesNow(fx) === before, `FC-9 10 소유자 세션의 권한 저장 role=owner(화면 select 에 없는 값)는 ‘이미 소유자가 있습니다’ 로 거절, 역할 그대로 (${errOf(ownerRaise).slice(0, 80)})`);
  const ownerDrop = await update(fx.cookie, "user-bin", "admin");
  ok(errOf(ownerDrop).startsWith("유일한 소유자는 다른 역할로 변경할 수 없") && rolesNow(fx) === before, `FC-9 10 유일한 소유자가 자기를 관리자로 내리는 것도 거절(양도 말고는 소유자가 바뀌지 않는다) (${errOf(ownerDrop).slice(0, 80)})`);
  fx.db.household_members.find((row) => row.household_id === HOME && row.user_id === "user-wifi").role = "admin";
  fx.db.users.push({ id: "user-v126-third", kakao_user_key: "kakao_login:2299", nickname: "셋째", created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: HOME, user_id: "user-v126-third", role: "member", created_at: "2026-07-01T00:00:00.000Z" });
  const wifi = await fx.cookieFor("user-wifi");
  const adminTries = [await update(wifi, "user-v126-third", "owner"), await update(wifi, "user-wifi", "owner"), await update(wifi, "user-bin", "member")];
  ok(adminTries.every((r) => errOf(r) === "member_manage_not_allowed") && roleOf(fx, "user-bin") === "owner" && roleOf(fx, "user-wifi") === "admin" && roleOf(fx, "user-v126-third") === "member", `FC-9 10 관리자 세션은 다른 구성원·자기를 소유자로 올리지 못하고 소유자를 내리지도 못한다(member_manage_not_allowed) (${adminTries.map(errOf).join(",")})`);
  // 카카오 채팅에는 역할을 바꾸는 명령이 없다: 방 구성원이 방·1:1 에서 무엇을 보내도 역할 그대로.
  const room = await roomHousehold(fx, "escalate");
  const replies = [];
  for (const utterance of ["소유자 양도", "나를 소유자로 바꿔줘", "권한 변경 소유자", "관리자로 바꿔줘", "소유자 넘겨줘", "구성원 권한 기록 수정"]) {
    replies.push(await say(fx, utterance, { user: room.member, room: room.room }));
    replies.push(await say(fx, utterance, { user: room.member }));
  }
  ok(replies.every((text) => String(text).includes('"version":"2.0"')), "FC-9 10 채팅 12문장은 모두 보통 답을 받았다(요청이 앞단에서 버려진 것이 아니다)");
  ok(roleOf(fx, room.ownerId, room.hid) === "owner" && roleOf(fx, room.memberId, room.hid) === "member" && fx.db.household_members.filter((row) => row.household_id === room.hid && row.role === "owner").length === 1, "FC-9 10 방 구성원이 카카오 채팅으로 권한·소유자 말을 보내도 역할 그대로(소유자 한 명)");
})));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 11. (3차, 독립 검토 2차 P3) 삭제 칸의 채팅만 쓰는 소유자 안내는 막다른 길(내 계정·보안 열기)이었다 → 양도 칸과 같은 길로, 삭제 칸으로
//          돌아와 그 비밀번호로 삭제. 다른 삭제 칸 상태는 고치기 전(main) 번들과 같은 바이트여야 한다.
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 11 삭제 칸 — 채팅만 쓰는 소유자의 길", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const room = await roomHousehold(fx, "chat-delete");
  const jar = await openFromRoom(fx, room);
  const cookie = () => jarStr(jar);
  const deleteBack = `/my/households?month=${room.month}&household_id=${encodeURIComponent(room.hid)}&manage=${encodeURIComponent(room.hid)}#manage`;
  const backupPath = `/my/backup-login?return_to=${encodeURIComponent(deleteBack)}`;
  const claimHref = `/my/kakao-claim?auto=0&return_to=${encodeURIComponent(backupPath)}#kakao-claim-start`;
  const before = panelOf((await http(fx, "GET", deleteBack.replace(/#.*$/, ""), { cookie: cookie(), ua: INAPP })).html);
  ok(before.includes("<p>가계부를 영구 삭제하려면 내 계정 로그인 비밀번호가 필요해요. 카카오 1:1 채팅에서 ‘웹 가계부 열기’를 보내 웹 연결 코드를 받은 뒤, 아래 ‘웹 연결 코드 넣기’에서 코드를 붙여 넣으세요. 이어서 열리는 ‘내 계정·보안’에서 5분 안에 로그인 이름과 비밀번호를 저장하면 이 화면으로 돌아와 그 비밀번호로 삭제할 수 있어요.") && before.includes(`${CONSEQUENCE}</p>`), "FC-9 11 삭제 칸: 양도 칸과 같은 웹 연결 코드 길과 결과 한 문장");
  ok(before.includes(`<a class="reauthButton" href="${claimHref.replace(/&/g, "&amp;")}">웹 연결 코드 넣기</a>`) && !before.includes("내 계정·보안 열기") && !before.includes('action="/my/household/delete"'), "FC-9 11 삭제 칸 단추 = 웹 연결 코드 칸(돌아갈 곳 = 내 계정·보안 → 이 삭제 칸), 삭제 폼은 아직 없다");
  const name = fx.db.households.find((row) => row.id === room.hid)?.name || "";
  const noProof = await http(fx, "POST", "/my/household/delete", { cookie: cookie(), ua: INAPP, form: { household_id: room.hid, month: room.month, confirm_name: name, understand_members: "1" } });
  ok(name && noProof.location.includes("err=account_reauth_required") && fx.db.households.some((row) => row.id === room.hid), `FC-9 11 방 링크 세션만으로는 삭제되지 않는다(이름·확인 칸이 맞아도 본인 확인 필요) (${noProof.location.slice(-60)})`);
  const claimPage = await http(fx, "GET", claimHref.replace(/#.*$/, ""), { cookie: cookie(), ua: INAPP });
  const claimForm = (claimPage.html.match(/<form method="post" action="\/my\/kakao-claim">[\s\S]*?<\/form>/) || [""])[0];
  ok(claimPage.html.includes('id="kakao-claim-start" open') && claimForm.includes(`name="return_to" value="${backupPath.replace(/&/g, "&amp;")}"`), "FC-9 11 코드 칸이 펼쳐 열리고 코드 뒤 갈 곳(내 계정·보안 → 삭제 칸)을 싣는다");
  const code = claimCodeOf(await say(fx, "웹 가계부 열기", { user: room.owner }));
  const claim = await http(fx, "POST", "/my/kakao-claim", { cookie: cookie(), ua: INAPP, form: { kakao_claim_code: code, return_to: backupPath } });
  applySet(jar, claim.cookies);
  ok(claim.location === backupPath && sessionUserOf(jar) === room.ownerId && jar.has("ab_credential_reauth"), `FC-9 11 코드를 넣으면 같은 계정 + 5분 표로 내 계정·보안으로 간다 (${claim.location})`);
  const DELETE_PASS = "v126-room-delete-pass";
  const saved = await http(fx, "POST", "/my/backup-login", { cookie: cookie(), ua: INAPP, form: { login_name: "v126roomdelete", access_code: DELETE_PASS, access_code_confirm: DELETE_PASS, current_password: "", return_to: deleteBack } });
  applySet(jar, saved.cookies);
  eq(saved.location, `/my/households?month=${room.month}&household_id=${encodeURIComponent(room.hid)}&manage=${encodeURIComponent(room.hid)}&msg=backup_login_saved#manage`, "FC-9 11 첫 비밀번호를 저장하면 그 삭제 칸(#manage)으로 돌아온다");
  const after = panelOf((await http(fx, "GET", saved.location.replace(/#.*$/, ""), { cookie: cookie(), ua: INAPP })).html);
  ok(after.includes('action="/my/household/delete"') && after.includes('<label>내 계정 로그인 비밀번호<input name="access_code" type="password" autocomplete="current-password" required/></label>'), "FC-9 11 이제 삭제 칸에 비밀번호 칸과 삭제 폼이 있다");
  const done = await http(fx, "POST", "/my/household/delete", { cookie: cookie(), ua: INAPP, form: { household_id: room.hid, month: room.month, confirm_name: name, understand_members: "1", access_code: DELETE_PASS } });
  ok(done.location.includes("msg=household_deleted") && !fx.db.households.some((row) => row.id === room.hid), `FC-9 11 그 비밀번호로 방 가계부가 삭제된다(카카오톡 안에서도) (${done.location})`);
})));
await section("FC-9 11 삭제 칸 — 다른 상태 그대로", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  // 고치기 전(main) 번들로 같은 픽스처에서 그린 삭제 칸의 sha256. 채팅만 쓰는 소유자 갈래 말고는 한 바이트도 바뀌면 안 된다.
  const PINNED = {
    kakaoOnly: "f70210ce214c2740437992ab7afb6012e9179dad57012dc7dd086ba53b54a6ee",
    kakaoVerified: "cac142ec8452dd87930d223bf7d43b73c6188de4fe9e85643ad60f60f99ff89a",
    password: "f98e8caa5b84992c0cebb5a5231172124ba181a76229134d08aaf1cc2d79daa9",
    leave: "c0f5a423fcaabfe39ac5649699299555974b4e02af7f8700545e809c0b8e6431",
  };
  const panelAt = async (cookie, ua = PC) => panelOf((await http(fx, "GET", DELETE_BACK.replace(/#.*$/, ""), { cookie, ua })).html);
  const kakaoOnly = [await panelAt(fx.cookie), await panelAt(fx.cookie, INAPP)];
  const restore = identitiesDown();
  try { kakaoOnly.push(await panelAt(fx.cookie)); } finally { restore(); }
  const ticket = await makeHouseholdDeleteReauthToken(fx.env, "user-bin", HOME);
  const verified = await panelAt(`${fx.cookie}; ab_household_delete_reauth=${ticket}`);
  await givePassword(fx, "user-bin", "v126bin");
  const password = [await panelAt(fx.cookie), await panelAt(fx.cookie, INAPP)];
  ok(kakaoOnly.every((panel) => sha(panel) === PINNED.kakaoOnly), `FC-9 11 카카오만 있는 소유자의 삭제 칸(PC·인앱·로그인 수단 읽기 실패)은 고치기 전과 같은 바이트 (${kakaoOnly.map((p) => sha(p).slice(0, 8)).join(",")})`);
  ok(sha(verified) === PINNED.kakaoVerified, `FC-9 11 카카오 확인을 마친 삭제 칸은 고치기 전과 같은 바이트 (${sha(verified).slice(0, 8)})`);
  ok(password.every((panel) => sha(panel) === PINNED.password), `FC-9 11 비밀번호(+카카오) 소유자의 삭제 칸(PC·인앱)은 고치기 전과 같은 바이트 (${password.map((p) => sha(p).slice(0, 8)).join(",")})`);
  // 구성원·관리자: 같은 자리의 위험 칸은 ‘가계부에서 나가기’ 이고 삭제 폼은 없다(고치기 전과 같은 바이트).
  const wifi = await fx.cookieFor("user-wifi");
  const memberPage = (await http(fx, "GET", DELETE_BACK.replace(/#.*$/, ""), { cookie: wifi })).html;
  fx.db.household_members.find((row) => row.household_id === HOME && row.user_id === "user-wifi").role = "admin";
  const adminPage = (await http(fx, "GET", DELETE_BACK.replace(/#.*$/, ""), { cookie: wifi })).html;
  ok([memberPage, adminPage].every((html) => sha(panelOf(html)) === PINNED.leave && !html.includes('action="/my/household/delete"')), "FC-9 11 구성원·관리자에게는 예전처럼 나가기 칸만 있고 삭제 폼은 없다(같은 바이트)");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-9 12. (3차, 확인이 필요한 가정) 웹 연결 코드의 돌아갈 곳은 사이트 안에만 머문다 — 새 단추가 만드는 겹친 주소 포함
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-9 12 웹 연결 코드의 돌아갈 곳", () => withClock("2026-11-16", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const room = await roomHousehold(fx, "return-to");
  const claimWith = async (returnTo) => {
    const code = claimCodeOf(await say(fx, "웹 가계부 열기", { user: room.owner }));
    return http(fx, "POST", "/my/kakao-claim", { ua: INAPP, form: { kakao_claim_code: code, return_to: returnTo } });
  };
  const outside = [];
  for (const returnTo of ["https://evil.example/", "//evil.example", "/\\evil.example"]) outside.push((await claimWith(returnTo)).location);
  ok(outside.every((location) => location === "/my"), `FC-9 12 바깥 주소(https://·//·/\\)는 /my 로 (${outside.join(" ; ")})`);
  const nested = `/my/backup-login?return_to=${encodeURIComponent(room.membersPath)}`;
  eq((await claimWith(nested)).location, nested, "FC-9 12 양도·삭제 칸 단추가 만드는 겹친 주소는 그대로 내 계정·보안으로");
  const nestedOutside = `/my/backup-login?return_to=${encodeURIComponent("https://evil.example/")}`;
  const viaBackup = await claimWith(nestedOutside);
  const jar = applySet(new Map(), viaBackup.cookies);
  const saved = await http(fx, "POST", "/my/backup-login", { cookie: jarStr(jar), ua: INAPP, form: { login_name: "v126returnto", access_code: "v126-return-pass", access_code_confirm: "v126-return-pass", current_password: "", return_to: "https://evil.example/" } });
  ok(viaBackup.location === nestedOutside && saved.location === "/my/households?msg=backup_login_saved", `FC-9 12 겹친 주소 안의 바깥 주소는 내 계정·보안 저장 뒤 /my/households 로 (${saved.location})`);
})));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-15 ① 재확인 이유: 시도 제한 장애·막힘은 ‘비밀번호가 맞지 않습니다’ 가 아니다(그리고 아무것도 바꾸지 않는다)
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-15 1 제한 장애", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const identityBefore = JSON.stringify(fx.db.accountbook_user_identities);
  const restore = intercept(async ({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_auth_attempt" ? failure(503) : null));
  let moved, deleted, account, backup;
  try {
    moved = await transfer(fx, { password: PASSWORD });
    deleted = await removeHousehold(fx, { password: PASSWORD });
    account = await http(fx, "POST", "/my/account-reauth", { cookie: fx.cookie, form: { current_password: PASSWORD } });
    backup = await http(fx, "POST", "/my/backup-login", { cookie: fx.cookie, form: { login_name: "v126bin", access_code: "v126-new-pass-1", access_code_confirm: "v126-new-pass-1", current_password: PASSWORD, return_to: "/my/households" } });
  } finally { restore(); }
  ok(moved.location.includes("err=password_reauth_unavailable") && rolesNow(fx) === "user-bin:owner,user-wifi:member", `FC-15 1 양도: 맞는 비밀번호 + 제한 기능 장애 → ‘확인 못 함’, 역할 그대로 (${moved.location})`);
  ok(deleted.location.includes("err=password_reauth_unavailable") && fx.db.households.some((row) => row.id === HOME), `FC-15 1 삭제: 같은 장애 → ‘확인 못 함’, 가계부 그대로 (예전 personal_password_invalid) (${deleted.location})`);
  const deletedPage = box((await pageAt(fx, deleted.location)).html, "error");
  ok(deletedPage.includes("본인 확인을 지금 하지 못했습니다") && !deletedPage.includes("맞지 않습니다"), `FC-15 1 삭제 화면 안내 (${deletedPage})`);
  ok(account.location === "/my/backup-login?err=password_reauth_unavailable" && !sets(account.cookies, "ab_credential_reauth"), `FC-15 1 계정 재확인: 장애면 확인 표를 주지 않고 이유를 알린다 (${account.location})`);
  ok((await pageAt(fx, account.location)).html.includes("본인 확인을 지금 하지 못했어요. 잠시 후 다시 시도해 주세요."), "FC-15 1 계정·보안 화면 안내");
  ok(backup.status === 503 && backup.html.includes("본인 확인을 지금 하지 못했어요") && JSON.stringify(fx.db.accountbook_user_identities) === identityBefore && !sets(backup.cookies, "ab_user"), "FC-15 1 비밀번호 변경: 장애면 503 과 이유, 비밀번호 그대로");
}));
await section("FC-15 1 시도 제한", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  freshLimiter(fx);
  for (let n = 1; n <= 8; n += 1) await transfer(fx, { password: `wrong-password-${n}` });
  const limited = await transfer(fx, { password: PASSWORD });
  ok(limited.location.includes("err=password_reauth_limited") && rolesNow(fx) === "user-bin:owner,user-wifi:member", `FC-15 1 양도: 틀린 8번 뒤에는 맞는 비밀번호도 ‘시도 많음’, 역할 그대로 (${limited.location})`);
  const limitedText = box((await pageAt(fx, limited.location)).html, "error");
  ok(limitedText.includes("15분쯤 뒤 다시 시도해 주세요") && !limitedText.includes("맞지 않습니다"), `FC-15 1 양도 화면 안내 (${limitedText})`);
  const deleted = await removeHousehold(fx, { password: PASSWORD });
  ok(deleted.location.includes("err=password_reauth_limited") && fx.db.households.some((row) => row.id === HOME), "FC-15 1 삭제도 같은 시도 제한(양도와 같은 칸)을 쓴다 — 가계부 그대로");
  const account = await http(fx, "POST", "/my/account-reauth", { cookie: fx.cookie, form: { current_password: PASSWORD } });
  ok(account.location === "/my/backup-login?err=password_reauth_limited" && !sets(account.cookies, "ab_credential_reauth"), "FC-15 1 계정 재확인도 ‘시도 많음’");
  const backup = await http(fx, "POST", "/my/backup-login", { cookie: fx.cookie, form: { login_name: "v126bin", access_code: "v126-new-pass-1", access_code_confirm: "v126-new-pass-1", current_password: PASSWORD, return_to: "/my/households" } });
  ok(backup.status === 429 && backup.retryAfter === "900" && backup.html.includes("본인 확인 시도가 많아 잠시 막혔어요"), "FC-15 1 비밀번호 변경도 429 + 이유");
  freshLimiter(fx);
  const later = await transfer(fx, { password: PASSWORD });
  ok(later.location.includes("msg=owner_transferred"), "FC-15 1 제한이 풀리면(15분 창) 맞는 비밀번호로 양도된다");
}));
await section("FC-15 1 틀린 비밀번호 안내 그대로", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const account = await http(fx, "POST", "/my/account-reauth", { cookie: fx.cookie, form: { current_password: "wrong-password-1" } });
  eq(account.location, "/my/backup-login?err=account_reauth_required", "FC-15 1 계정 재확인: 틀린 비밀번호는 예전 코드");
  const backup = await http(fx, "POST", "/my/backup-login", { cookie: fx.cookie, form: { login_name: "v126bin", access_code: "v126-new-pass-1", access_code_confirm: "v126-new-pass-1", current_password: "wrong-password-1", return_to: "/my/households" } });
  ok(backup.status === 403 && backup.html.includes("현재 로그인 비밀번호 또는 원래 연결한 카카오 계정으로 먼저 본인 확인을 완료하세요."), "FC-15 1 비밀번호 변경: 틀린 비밀번호는 예전 403 문장");
  const good = await http(fx, "POST", "/my/account-reauth", { cookie: fx.cookie, form: { current_password: PASSWORD } });
  ok(good.location === "/my/backup-login?msg=account_reauth_verified" && sets(good.cookies, "ab_credential_reauth"), "FC-15 1 계정 재확인: 맞는 비밀번호는 예전처럼 확인 표");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-15 ② 로그인 이름 로그인: 막힘·장애·처리 오류 화면도 돌아갈 주소를 싣는다
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-15 2 돌아갈 주소", () => fixture(async (fx) => {
  const signup = await http(fx, "POST", "/my/local-signup", { form: { login_name: "v126return", display_name: "복귀", access_code: "v126-return-pass", access_code_confirm: "v126-return-pass", consent: "1" } });
  eq(signup.status, 303, "FC-15 2 준비: 로그인 이름 계정을 만든다");
  const RT = "/app?household_id=house-home";
  const keepsReturn = (html) => html.includes(`<input type="hidden" name="return_to" value="${RT}"`);
  const answer = (value) => new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  const nth = (n, response) => { let count = 0; return intercept(async ({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_auth_attempt" && (count += 1) === n ? response() : null)); };
  const scenes = [
    ["주소·브라우저 단위 막힘(429)", () => nth(2, () => answer({ allowed: false, attempts: 9 })), 429, "로그인 시도가 너무 많습니다"],
    ["주소·브라우저 단위 장애(503)", () => nth(2, () => failure(503)), 503, "로그인 보호 기능에 연결하지 못했습니다"],
    ["주소·이름 단위 막힘(429)", () => nth(3, () => answer({ allowed: false, attempts: 11 })), 429, "이 로그인 이름으로 시도가 너무 많습니다"],
    ["주소·이름 단위 장애(503)", () => nth(3, () => failure(503)), 503, "로그인 보호 기능에 연결하지 못했습니다"],
    ["이름 전체 막힘(429)", () => nth(4, () => answer({ allowed: false, attempts: 51 })), 429, "이 로그인 이름으로 시도가 너무 많습니다"],
    ["이름 전체 장애(503)", () => nth(4, () => failure(503)), 503, "로그인 보호 기능에 연결하지 못했습니다"],
    ["처리 오류(500)", () => intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_user_identities" ? failure(503) : null)), 500, "로그인을 처리하지 못했습니다"],
  ];
  for (const [label, makeRestore, status, words] of scenes) {
    const restore = makeRestore();
    let r;
    try { r = await http(fx, "POST", "/my/local-login", { form: { login_name: "v126return", access_code: "v126-return-pass", return_to: RT } }); }
    finally { restore(); }
    ok(r.status === status && r.html.includes(words) && keepsReturn(r.html), `FC-15 2 ${label}: 같은 안내 + 돌아갈 주소 (상태 ${r.status})`);
  }
  const fine = await http(fx, "POST", "/my/local-login", { form: { login_name: "v126return", access_code: "v126-return-pass", return_to: RT } });
  eq(fine.location, RT, "FC-15 2 정상 로그인은 예전처럼 돌아갈 주소로 간다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-15 ③ 로그인·가입이 됐는데 일반 오류 문장이 보이던 길 → 알려진 코드
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-15 3 알려진 코드", () => fixture(async (fx) => {
  const signup = await http(fx, "POST", "/my/local-signup", { form: { login_name: "v126invite", display_name: "초대", access_code: "v126-invite-pass", access_code_confirm: "v126-invite-pass", consent: "1" } });
  eq(signup.status, 303, "FC-15 3 준비: 로그인 이름 계정");
  const login = await http(fx, "POST", "/my/local-login", { form: { login_name: "v126invite", access_code: "v126-invite-pass", invite_code: "NOPE1234" } });
  eq(login.location, "/my/households?msg=login_invite_code_not_found", "FC-15 3 로그인 + 없는 초대코드 → 안내 코드(문장을 주소에 싣지 않는다)");
  ok(sets(login.cookies, "ab_user"), "FC-15 3 로그인은 됐다(세션 쿠키)");
  const shown = await pageAt(fx, login.location, pairOf(login.cookies, "ab_user"));
  ok(box(shown.html, "ok").startsWith("로그인은 완료되었습니다.") && !shown.html.includes("요청을 처리하지 못했습니다. 입력값을 확인한 뒤 다시 시도해 주세요."), "FC-15 3 화면은 ‘로그인은 완료’ 안내(일반 오류 문장 아님)");
  const restore = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/households" && String(url.searchParams.get("invite_code") || "").startsWith("eq.") ? failure(503) : null));
  let joined;
  try { joined = await http(fx, "POST", "/my/local-signup", { form: { login_name: "v126invite2", display_name: "초대2", access_code: "v126-invite-pass", access_code_confirm: "v126-invite-pass", consent: "1", invite_code: "HOME2265" } }); }
  finally { restore(); }
  eq(joined.location, "/my/households?first=1&err=signup_invite_join_failed", "FC-15 3 가입 + 초대 참여 오류 → 안내 코드");
  const joinedPage = await pageAt(fx, joined.location, pairOf(joined.cookies, "ab_user"));
  eq(box(joinedPage.html, "error"), "계정은 생성되었지만 초대 참여를 완료하지 못했습니다. 가계부 전환·추가에서 다시 참여해 주세요.", "FC-15 3 화면은 ‘계정은 생성되었지만’ 문장(일반 오류 문장 아님)");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-15 ④ 계정을 바꾸는 로그인은 앞 계정의 설정 띠 쿠키(ab_setup·ab_bk)를 지운다(응답이 스스로 적은 쿠키는 그대로)
// ═════════════════════════════════════════════════════════════════════════════════════
const STALE = `ab_setup=${encodeURIComponent("house-home.name-me")}; ab_bk=0`;
await section("FC-15 4 로그인 이름", () => fixture(async (fx) => {
  await http(fx, "POST", "/my/local-signup", { form: { login_name: "v126switch", display_name: "B", access_code: "v126-switch-pass", access_code_confirm: "v126-switch-pass", consent: "1" } });
  const before = await http(fx, "GET", "/my/households", { cookie: `${fx.cookie}; ${STALE}` });
  ok(before.html.includes('class="abSetupBand"'), "FC-15 4 준비: 앞 계정(A)의 ab_setup 이 있으면 설정 띠가 보인다");
  const jar = jarFrom(`${fx.cookie}; ${STALE}`);
  const wrong = await http(fx, "POST", "/my/local-login", { cookie: jarStr(jar), form: { login_name: "v126switch", access_code: "wrong-password-1" } });
  ok(wrong.status === 401 && !clears(wrong.cookies, "ab_setup"), "FC-15 4 세션을 주지 않는 응답(틀린 비밀번호)은 설정 쿠키를 건드리지 않는다");
  const login = await http(fx, "POST", "/my/local-login", { cookie: jarStr(jar), form: { login_name: "v126switch", access_code: "v126-switch-pass" } });
  ok(login.status === 303 && clears(login.cookies, "ab_setup") && pairOf(login.cookies, "ab_bk") === "ab_bk=1" && !clears(login.cookies, "ab_bk"), "FC-15 4 로그인 이름 로그인: ab_setup 은 지우고, 응답이 새로 적은 ab_bk=1 은 그대로");
  applySet(jar, login.cookies);
  ok(!jar.has("ab_setup"), "FC-15 4 브라우저에 앞 계정의 ab_setup 이 남지 않는다");
  const after = await http(fx, "GET", "/my/households", { cookie: jarStr(jar) });
  ok(after.status === 200 && !after.html.includes('class="abSetupBand"'), "FC-15 4 바뀐 계정(B) 화면에 앞 계정의 설정 띠가 없다");
}));
await section("FC-15 4 카카오 콜백", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  // 앞 계정(A = user-wifi)이 로그인해 둔 브라우저에서 카카오 로그인(user-bin)으로 바꾼다.
  const jar = jarFrom(`${await fx.cookieFor("user-wifi")}; ${STALE}`);
  const start = await http(fx, "GET", "/auth/kakao/start", { cookie: jarStr(jar) });
  applySet(jar, start.cookies);
  const restore = kakaoServers();
  let callback;
  try { callback = await http(fx, "GET", `/auth/kakao/callback?code=qa-v126&state=${encodeURIComponent(decodeURIComponent(jar.get("kakao_oauth_state") || ""))}`, { cookie: jarStr(jar) }); }
  finally { restore(); }
  ok(callback.status === 303 && sets(callback.cookies, "ab_user") && clears(callback.cookies, "ab_setup") && sets(callback.cookies, "ab_bk") && !clears(callback.cookies, "ab_bk"), "FC-15 4 카카오 로그인 콜백: ab_setup 은 지우고, 콜백이 새로 적은 ab_bk 는 그대로");
}));
await section("FC-15 4 웹 연결 코드", () => withClock("2026-11-16", () => fixture(async (fx) => {
  const SECRET = "v126-skill-secret";
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  const chatUser = createHash("sha256").update("v126-claim-user").digest("hex") + "ab";
  const say = async (utterance) => {
    globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
    globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
    const jobs = [];
    const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: chatUser, type: "botUserKey", properties: { botUserKey: chatUser } } };
    const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET }, body: JSON.stringify({ bot: { id: "bot1" }, intent: { id: "i1" }, userRequest, action: { id: "a1", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
    const text = await response.text();
    for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
    return text;
  };
  await say("점심 9000원");
  const reply = await say("웹 가계부 열기");
  const code = (reply.replace(/\\n/g, "\n").match(/\b([A-Z0-9]{8}(?:[- ][A-Z0-9]{8}){3})\b/) || [])[1] || "";
  ok(code, "FC-15 4 준비: 웹 연결 코드를 받는다");
  const claim = await http(fx, "POST", "/my/kakao-claim", { cookie: `${fx.cookie}; ${STALE}`, form: { kakao_claim_code: code } });
  ok(claim.status === 303 && sets(claim.cookies, "ab_user") && clears(claim.cookies, "ab_setup") && clears(claim.cookies, "ab_bk"), "FC-15 4 웹 연결 코드 로그인: 앞 계정의 ab_setup·ab_bk 를 둘 다 지운다(이 응답은 ab_bk 를 적지 않는다)");
  // (2차) 같은 채팅 계정이 코드를 다시 넣으면(같은 사람에게 세션을 다시 줌) 띠 쿠키를 지우지 않는다.
  const again = claimCodeOf(await say("웹 가계부 열기"));
  const sameAccount = await http(fx, "POST", "/my/kakao-claim", { cookie: `${pairOf(claim.cookies, "ab_user")}; ${STALE}`, form: { kakao_claim_code: again } });
  ok(sameAccount.status === 303 && sets(sameAccount.cookies, "ab_user") && !clears(sameAccount.cookies, "ab_setup") && !clears(sameAccount.cookies, "ab_bk"), "FC-15 4 같은 계정에 세션을 다시 주는 웹 연결 코드는 ab_setup·ab_bk 를 지우지 않는다");
})));
await section("FC-15 4 같은 계정·앞 세션 없음", () => fixture(async (fx) => {
  await givePassword(fx, "user-bin", "v126bin");
  const save = await http(fx, "POST", "/my/backup-login", { cookie: `${fx.cookie}; ${STALE}`, form: { login_name: "v126bin", access_code: "v126-new-pass-1", access_code_confirm: "v126-new-pass-1", current_password: PASSWORD, return_to: "/my/households" } });
  ok(save.status === 303 && sets(save.cookies, "ab_user") && !clears(save.cookies, "ab_setup") && pairOf(save.cookies, "ab_bk") === "ab_bk=1", "FC-15 4 같은 계정의 비밀번호 변경(세션을 다시 줌)은 ab_setup 을 지우지 않는다(ab_bk=1 은 이 응답이 적는다)");
  await http(fx, "POST", "/my/local-signup", { form: { login_name: "v126fresh", display_name: "C", access_code: "v126-fresh-pass", access_code_confirm: "v126-fresh-pass", consent: "1" } });
  const anonymous = await http(fx, "POST", "/my/local-login", { cookie: STALE, form: { login_name: "v126fresh", access_code: "v126-fresh-pass" } });
  ok(anonymous.status === 303 && clears(anonymous.cookies, "ab_setup"), "FC-15 4 앞 세션이 없는 브라우저(남은 띠 쿠키만)의 로그인은 그 ab_setup 을 지운다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-15 ⑤ 가입의 옛 이름 확인: 패턴 글자는 글자 그대로, 같은 이름만 막는다
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-15 5 옛 이름 확인", () => fixture(async (fx) => {
  fx.db.users.push(
    { id: "v126-legacy-1", kakao_user_key: "local_web:v126a", nickname: "abc", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "v126-legacy-2", kakao_user_key: "local_web:v126b", nickname: "50xoff", created_at: "2026-01-01T00:00:00.000Z" },
    { id: "v126-legacy-3", kakao_user_key: "local_web:v126c", nickname: "LegacyName", created_at: "2026-01-01T00:00:00.000Z" },
  );
  const seen = [];
  const restore = intercept(async ({ url, method }) => { if (method === "GET" && url.pathname === "/rest/v1/users" && String(url.searchParams.get("nickname") || "").startsWith("ilike.")) seen.push(url.searchParams); return null; });
  const signupAs = (name) => http(fx, "POST", "/my/local-signup", { form: { login_name: name, display_name: "가입", access_code: "v126-signup-pass", access_code_confirm: "v126-signup-pass", consent: "1" } });
  let star, percent, underscore, legacy;
  try {
    star = await signupAs("a*");
    percent = await signupAs("50%off");
    underscore = await signupAs("kim_01");
    legacy = await signupAs("legacyname");
  } finally { restore(); }
  eq(star.status, 303, "FC-15 5 ‘a*’ 는 옛 이름 ‘abc’ 에 걸리지 않는다(예전에는 409)");
  eq(percent.status, 303, "FC-15 5 ‘50%off’ 는 옛 이름 ‘50xoff’ 에 걸리지 않는다(예전에는 409)");
  eq(underscore.status, 303, "FC-15 5 ‘kim_01’ 가입");
  ok(legacy.status === 409 && legacy.html.includes("이미 사용 중인 로그인 이름입니다"), "FC-15 5 대소문자만 다른 옛 이름(LegacyName)은 예전처럼 막는다");
  const nick = seen.map((params) => params.get("nickname"));
  ok(nick.includes("ilike.a_") && nick.includes("ilike.50\\%off") && nick.includes("ilike.kim\\_01") && nick.includes("ilike.legacyname"), `FC-15 5 보낸 패턴: % · _ 는 글자 그대로(\\), * 는 한 글자 _ (${nick.join(" | ")})`);
  ok(seen.every((params) => params.get("select") === "id,nickname" && params.get("limit") === "50" && params.get("order") === "id"), "FC-15 5 읽어 온 이름을 정규화해 견준다(select=id,nickname, 순서 id, 한 쪽 50)");
}));

// (2차, 독립 검토 P3) 픽스처의 like/ilike(qa-fixture.mjs wildcardRegex)는 \ 와 _ 를 글자로, %·* 를 아무 글자열로 읽어 PostgreSQL 의 이스케이프를
// 증명하지 못한다. 그래서 이 장면들은 옛 이름 조회만 PostgREST·PostgreSQL 규칙 흉내로 답한다: PostgREST 가 * 를 % 로 바꾸고, PostgreSQL 은
// \ 다음 글자를 글자 그대로, _ 를 한 글자, % 를 아무 글자열로 읽는다(기본 ESCAPE 는 \). 실제 서버의 동작은 이 흉내가 맞다는 가정 위에 있다.
function pgLike(pattern, value, insensitive = true) {
  const text = String(pattern).replace(/\*/g, "%");
  let source = "";
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (ch === "\\") { i += 1; source += (text[i] ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
    else if (ch === "%") source += "[\\s\\S]*";
    else if (ch === "_") source += "[\\s\\S]";
    else source += ch.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }
  return new RegExp(`^${source}$`, insensitive ? "iu" : "u").test(String(value));
}
function legacyNameServer(fx, seen) {
  return intercept(async ({ url, method }) => {
    const nickname = url.searchParams.get("nickname") || "";
    if (method !== "GET" || url.pathname !== "/rest/v1/users" || !nickname.startsWith("ilike.")) return null;
    seen.push(url.searchParams);
    const keyFilter = url.searchParams.get("kakao_user_key") || "";
    let rows = fx.db.users.filter((row) => pgLike(nickname.slice("ilike.".length), row.nickname || "") && (!keyFilter.startsWith("like.") || pgLike(keyFilter.slice("like.".length), row.kakao_user_key || "", false)));
    if (url.searchParams.get("order") === "id") rows = rows.slice().sort((a, b) => (String(a.id) < String(b.id) ? -1 : String(a.id) > String(b.id) ? 1 : 0));
    const limit = Number(url.searchParams.get("limit") || 0);
    if (limit > 0) rows = rows.slice(0, limit);
    return new Response(JSON.stringify(rows.map((row) => ({ id: row.id, nickname: row.nickname }))), { headers: { "content-type": "application/json" } });
  });
}
await section("FC-15 5 옛 이름 확인(PostgreSQL 규칙)", () => fixture(async (fx) => {
  ok(pgLike("kim\\_01", "KIM_01") && !pgLike("kim\\_01", "kimx01") && pgLike("kim_01", "kimx01") && pgLike("50\\%off", "50%OFF") && !pgLike("50\\%off", "50xoff") && pgLike("local_web:*", "local_web:abc", false), "FC-15 5 흉내 자체: \\_·\\% 는 글자, 맨 _ 는 한 글자, * 는 아무 글자열");
  const legacy = (id, nickname) => ({ id, kakao_user_key: `local_web:${id}`, nickname, created_at: "2026-01-01T00:00:00.000Z" });
  fx.db.users.push(legacy("v126-pg-1", "kim_01"), legacy("v126-pg-2", "50%off"), legacy("v126-pg-3", "kimx01"));
  // * 로 넓힌 패턴이 한 쪽(50행)을 넘게 맞는 경우: id 순서로 앞 50행에는 같은 이름이 없고 51번째 뒤에 옛 이름 ‘a*’ 가 있다.
  const fillers = "0123456789bcdefghijklmnopqrstuvwxyz가나다라마바사아자차카타파하거너더러머버서어저처커터퍼허";
  for (let i = 0; i < 60; i += 1) fx.db.users.push(legacy(`v126-star-${String(i).padStart(3, "0")}`, `a${fillers[i]}`));
  fx.db.users.push(legacy("v126-star-zzz", "a*"));
  const seen = [];
  const restore = legacyNameServer(fx, seen);
  const signupAs = (name) => http(fx, "POST", "/my/local-signup", { form: { login_name: name, display_name: "가입", access_code: "v126-signup-pass", access_code_confirm: "v126-signup-pass", consent: "1" } });
  let underscore, percent, star, fewStar;
  try {
    underscore = await signupAs("KIM_01");
    percent = await signupAs("50%OFF");
    star = await signupAs("A*");
    fewStar = await signupAs("q*");
  } finally { restore(); }
  ok(underscore.status === 409 && underscore.html.includes("이미 사용 중인 로그인 이름입니다"), `FC-15 5 옛 이름 ‘kim_01’ 이 있으면 대소문자만 다른 ‘KIM_01’ 가입은 막는다(\\_ 가 글자 _ 로 맞는다) (${underscore.status})`);
  ok(percent.status === 409 && percent.html.includes("이미 사용 중인 로그인 이름입니다"), `FC-15 5 옛 이름 ‘50%off’ 가 있으면 ‘50%OFF’ 가입은 막는다 (${percent.status})`);
  ok(star.status === 409 && star.html.includes("이미 사용 중인 로그인 이름입니다"), `FC-15 5 ‘A*’: 넓힌 패턴이 한 쪽을 채우면(앞 50행에 같은 이름 없음) 이미 쓰는 이름으로 닫는다 (${star.status})`);
  eq(fewStar.status, 303, "FC-15 5 대조: 맞는 옛 이름이 적은 ‘q*’ 는 가입된다");
  const sent = seen.map((params) => `${params.get("nickname")}|${params.get("order")}|${params.get("limit")}`);
  ok(sent.includes("ilike.KIM\\_01|id|50") && sent.includes("ilike.50\\%OFF|id|50") && sent.includes("ilike.A_|id|50"), `FC-15 5 보낸 조회: 이스케이프한 패턴, 순서 id, 한 쪽 50 (${sent.join(" ; ")})`);
  ok(!fx.db.accountbook_user_identities.some((row) => ["kim_01", "50%off", "a*"].includes(String(row.provider_subject || "").toLowerCase())), "FC-15 5 막힌 이름으로는 로그인 이름이 만들어지지 않았다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// FC-8 카카오 로그인 콜백: 같은 주소 50번까지, 51번째에 ‘15분쯤’
// ═════════════════════════════════════════════════════════════════════════════════════
await section("FC-8 콜백 한도", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  freshLimiter(fx);
  const limits = [];
  const restore = intercept(async ({ url, method, init }) => {
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_auth_attempt") limits.push(Number(JSON.parse(String(init?.body || "{}")).p_limit));
    if (/kakao\.com$/.test(url.hostname)) return failure(400, "offline");
    return null;
  });
  try {
    const start = await http(fx, "GET", "/auth/kakao/start");
    const stateCookie = start.cookies.find((line) => line.startsWith("kakao_oauth_state=")).split(";")[0];
    const state = decodeURIComponent(stateCookie.slice("kakao_oauth_state=".length));
    let firstBusy = 0;
    let busy = null;
    // 카카오 토큰 단계 실패(가로챈 400)가 요청마다 오류 줄을 남긴다 — 이 반복 동안만 그 줄을 숨긴다.
    const consoleError = console.error;
    console.error = (...args) => { if (!String(args[0] || "").includes('"event":"kakao_login_error"')) consoleError(...args); };
    try {
      for (let n = 1; n <= 51; n += 1) {
        const r = await http(fx, "GET", `/auth/kakao/callback?code=c${n}&state=${encodeURIComponent(state)}`, { cookie: stateCookie, headers: { "cf-connecting-ip": "203.0.113.7" } });
        if (!firstBusy && r.html.includes("카카오 로그인 요청이 잠시 많아")) { firstBusy = n; busy = r; }
      }
    } finally { console.error = consoleError; }
    eq(firstBusy, 51, "FC-8 같은 주소의 콜백은 50번까지 받고 51번째에 막는다(예전 21번째)");
    ok(busy?.status === 429 && busy.html.includes("15분쯤 뒤 다시 시도하거나") && !busy.html.includes("1~2분"), "FC-8 막힘 안내는 ‘15분쯤’");
    ok(limits.length === 51 && limits.every((value) => value === 50), `FC-8 시도 제한에 보낸 한도는 50 (${[...new Set(limits)].join(",")})`);
    // (2차, 독립 검토 P3) 화면 없는 자동 로그인 칸(카카오톡 인앱 auto=1)은 20 그대로다.
    const before = limits.length;
    const autoStart = await http(fx, "GET", "/auth/kakao/start?auto=1", { ua: INAPP });
    const autoState = autoStart.cookies.find((line) => line.startsWith("kakao_oauth_state=")).split(";")[0];
    const consoleErrorAuto = console.error;
    console.error = (...args) => { if (!String(args[0] || "").includes('"event":"kakao_login_error"')) consoleErrorAuto(...args); };
    try { await http(fx, "GET", `/auth/kakao/callback?code=auto1&state=${encodeURIComponent(decodeURIComponent(autoState.slice("kakao_oauth_state=".length)))}`, { cookie: autoState, ua: INAPP, headers: { "cf-connecting-ip": "203.0.113.8" } }); }
    finally { console.error = consoleErrorAuto; }
    const autoLimits = limits.slice(before);
    ok(autoLimits.length === 1 && autoLimits[0] === 20, `FC-8 자동 로그인 콜백의 한도는 20 그대로 (${autoLimits.join(",")})`);
  } finally { restore(); }
}));
// (3차, 독립 검토 2차 P3) 시도 제한 기능 장애(RPC 503)도 ‘요청이 많아 … 15분쯤’ 으로 보였다 → 장애는 ‘잠시 후 다시’, 실제 막힘(429)은 ‘15분쯤’ 그대로.
await section("FC-8 제한 기능 장애", () => fixture(async (fx) => {
  Object.assign(fx.env, KAKAO_ENV);
  const limiter = (mode) => intercept(async ({ url }) => (url.pathname === "/rest/v1/rpc/accountbook_auth_attempt"
    ? (mode === "down" ? failure(503) : new Response(JSON.stringify([{ allowed: false, attempts: 51 }]), { headers: { "content-type": "application/json" } }))
    : null));
  const seen = {};
  const consoleError = console.error;
  console.error = (...args) => { if (!String(args[0] || "").includes('"event":')) consoleError(...args); };
  try {
    for (const mode of ["down", "limited"]) {
      const start = await http(fx, "GET", "/auth/kakao/start");
      const jar = applySet(new Map(), start.cookies);
      const state = decodeURIComponent(jar.get("kakao_oauth_state") || "");
      let restore = limiter(mode);
      try { seen[`login-${mode}`] = await http(fx, "GET", `/auth/kakao/callback?code=c-${mode}&state=${encodeURIComponent(state)}`, { cookie: jarStr(jar) }); }
      finally { restore(); }
      // 계정 잇기 흐름의 서명된 상태(실제 시작 화면은 잇기 제안이 있어야 열리므로 상태만 같은 서명으로 만든다). 제한 확인은 제안 확인보다 앞이다.
      const linkState = await signedPurposeToken(fx.env, "kakao-oauth", { nonce: `n-${mode}`, user_id: "user-bin", mode: "account-link", household_id: "", return_to: "/my", offer: "user-wifi" }, 600);
      restore = limiter(mode);
      try { seen[`link-${mode}`] = await http(fx, "GET", `/auth/kakao/callback?code=l-${mode}&state=${encodeURIComponent(linkState)}`, { cookie: `${fx.cookie}; kakao_oauth_state=${encodeURIComponent(linkState)}; kakao_oauth_link_user=user-bin` }); }
      finally { restore(); }
    }
  } finally { console.error = consoleError; }
  const down = seen["login-down"];
  const limited = seen["login-limited"];
  ok(down.status === 503 && down.html.includes("카카오 로그인을 지금 확인하지 못했습니다. 잠시 후 다시 시도하거나 아래 다른 방법으로 접속해주세요.") && !down.html.includes("15분쯤") && !down.html.includes("요청이 잠시 많아"), "FC-8 제한 기능 장애(503): ‘잠시 후 다시’(15분·‘요청이 많아’ 말 없음)");
  ok(limited.status === 429 && limited.html.includes("카카오 로그인 요청이 잠시 많아 처리하지 못했습니다. 15분쯤 뒤 다시 시도하거나") && !limited.html.includes("지금 확인하지 못했습니다"), "FC-8 실제 막힘(429)은 ‘15분쯤’ 그대로");
  ok(seen["link-down"].location === "/my/account-link?err=kakao_unavailable" && seen["link-limited"].location === "/my/account-link?err=busy", `FC-8 계정 잇기: 장애는 kakao_unavailable(‘잠시 후 다시’), 막힘은 busy(‘15분쯤’) (${seen["link-down"].location} / ${seen["link-limited"].location})`);
  ok(read("src/modules/auth/kakao-account-link.js").includes('kakao_unavailable: "카카오 확인을 지금 쓸 수 없어요. 잠시 후 다시 시도해 주세요."'), "FC-8 계정 잇기 화면의 kakao_unavailable 문장은 ‘잠시 후 다시’(있던 문장)");
}));

const checks = t.done();
if (failedSections.length) {
  for (const line of failedSections) console.error(`실패: ${line}`);
  console.error(`V22.9.126 auth 검사 실패 (장면 ${failedSections.length}개, 통과 ${checks})`);
  process.exit(1);
}
if (checks < 80) throw new Error(`검사 수가 너무 적다: ${checks}`);
