// V22.9.105 R-1·R-6~R-11 — 단톡방 링크 단추로 로그인 화면 없이 그 방 가계부 홈 열기 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 사용자(2026-11-06): "첫 기록 후 웹가계부 들어가면 바로 가계부가 나오고 팝업으로 개인정보 관련 나와야한다니까 왜 자꾸 별도 페이지로 안내해서 가계부가
// 바로 안나오는거야 앱 승인 담당자가 별도 화면없이 바로 가계부 홈 화면 나와야 한다고 했다고 몇번 말하니".
// 카카오 그룹 챗봇 안내서: 팀채팅방에서 챗봇 링크 단추를 누르면 카카오가 누른 사람의 botUserKey·appUserId 와 방 botGroupKey 를 주소 뒤에 붙인다.
// 웹(auth/kakao-room-open.js)은 두 값(botUserKey·botGroupKey)이 다 있고 그 사람의 원래 채팅 계정이 그 방 가계부 구성원이면 세션을 만들어 그 방 가계부
// 홈으로 보낸다. 동의 기록이 없으면 홈 위에 동의 팝업(V22.9.104 L-3)이 뜬다. 안 맞으면 카카오 값을 뺀 같은 주소로 보내고 그 뒤는 V22.9.104 그대로다.
// 독립 보안 검토(2026-11-06)로 더한 것: 웹 계정에 이어진 사람은 세션 없이 넘기기(R-6), 로그인 뒤 화면이 아닌 주소는 값만 지우기(R-7), 기억한 가계부
// 무시(R-8), 같은 값 두 번·다른 계정 세션 바꾸기 조건·답 단추 주소의 값 지우기(R-9), 16진 키 모양(R-10), 링크 미리보기 수집기 제외(R-11).
// 실제 요청(/skill·/my·/app·/m·/my/*·/my/consent·공개 문서)과 저장된 행으로 본다. 가짜는 픽스처 DB 와 일부 실패 흉내뿐이다.
//
// ── 실행 ──
//   node validation/validate-room-open-v229105.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { kakaoGroupCompatibleResponse, kakaoText } from "../src/modules/kakao/response-builders.js";
import { app, BASE, counter, failure, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.105 room link opens the room household home without a login screen");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";

const SECRET = "room-open-secret-v229105";
const DAY = "2026-11-06";
const ROOM = hex66("room-a");
const ROOM_B = hex66("room-b");
const ROOM_EMPTY = hex66("room-empty");
const U1 = hex66("user-1");
const U2 = hex66("user-2");
const U3 = hex66("user-3");
const U_ALIAS = hex66("user-alias");
const U_UNKNOWN = hex66("user-unknown");
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const ANDROID_INAPP = "Mozilla/5.0 (Linux; Android 14; SM-S918N Build/UP1A.231005.007; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/130.0.0.0 Mobile Safari/537.36;KAKAOTALK 2410430";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const PROBE = "kakao_room_open_probe_v229105:";
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const APP_DIRECT = { "sec-fetch-site": "none" };

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

async function sayRaw(fx, utterance, options) {
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
  return JSON.parse(raw);
}

// 브라우저 한 번의 요청(따라가지 않는다). waitUntil 일(진단 기록)은 끝까지 기다린다.
async function go(fx, path, { ua = INAPP, cookie = "", method = "GET", headers = {}, body } = {}) {
  const jobs = [];
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...(cookie ? { cookie } : {}), ...headers };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { method, headers: requestHeaders, ...(body ? { body } : {}) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { status: response.status, location: response.headers.get("location") || "", cookies, headers: response.headers, html: await response.text() };
}

const tapped = (path, { user = U1, room = ROOM, appUserId = "1801267359" } = {}) => {
  const url = new URL(path, BASE);
  if (user !== null) url.searchParams.set("botUserKey", user);
  if (appUserId) url.searchParams.set("appUserId", appUserId);
  if (room !== null) url.searchParams.set("botGroupKey", room);
  return `${url.pathname}${url.search}`;
};
const cookieLine = (cookies, name) => cookies.find((line) => line.startsWith(`${name}=`)) || "";
const sessionUser = (cookies) => { const line = cookieLine(cookies, "ab_user"); return line ? decodeURIComponent(line.split(";")[0].slice("ab_user=".length)).split("|")[0] : ""; };
const jarOf = (cookies) => cookies.filter((line) => !/Max-Age=0/i.test(line)).map((line) => line.split(";")[0]).join("; ");
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const lastRoomOpen = () => events("kakao_room_open").at(-1)?.detail || "";
const noKakaoValues = (location) => !/botUserKey|botGroupKey|appUserId/.test(location);
const isStart = (html) => html.includes('id="abKakaoStart"');
const isPopup = (html) => html.includes('id="abConsentPop"');
const probeRows = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).startsWith(PROBE)).length;

function putSetting(fx, key, value) {
  const row = fx.db.accountbook_settings.find((item) => item.key === key);
  if (row) row.value = value; else fx.db.accountbook_settings.push({ key, value });
}

// 방 가계부를 만든다: U1 이 ROOM 에서 첫 기록(→ 방 가계부·소유자), U2 가 같은 방에서 기록(→ 구성원), U3 은 다른 방(ROOM_B)에서만 기록.
async function roomFixture(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    try {
      await sayRaw(fx, "점심 12000원", { user: U1, room: ROOM });
      await sayRaw(fx, "커피 4500원", { user: U2, room: ROOM });
      await sayRaw(fx, "택시 8000원", { user: U3, room: ROOM_B });
      const u1 = userByKey(fx, U1);
      const u2 = userByKey(fx, U2);
      const u3 = userByKey(fx, U3);
      const memberRow = (userId) => fx.db.household_members.filter((row) => row.user_id === userId);
      const household = fx.db.households.find((row) => memberRow(u1?.id).some((m) => m.household_id === row.id && m.role === "owner") && row.name === ROOM_HOUSEHOLD_NAME);
      resetIsolateState();
      return await task(fx, { u1, u2, u3, household });
    } finally {
      resetIsolateState();
    }
  }));
}

// ── 0. 소스·등록 ──────────────────────────────────────────────────────────────
{
  const router = read("src/modules/worker/router.js");
  const manifest = read("src/modules/MANIFEST.txt");
  const mod = read("src/modules/auth/kakao-room-open.js");
  const code = mod.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  const csrfAt = router.indexOf("if (!csrfOriginAllowed(request, url)) {");
  const roomAt = router.indexOf("const kakaoRoomOpen = await kakaoRoomOpenResponse(request, env, url, ctx);");
  const hiddenAt = router.indexOf("const hiddenFeature = hiddenIncompleteFeatureResponse(request, env, url);");
  const noticeAt = router.indexOf('if (url.pathname === "/notice/hide")');
  const publicAt = router.indexOf("const publicDocument = await publicDocumentResponse(request, env, url);");
  const autoAt = router.indexOf("const kakaoAutoLogin = await kakaoInAppAutoLoginResponse(request, env, url);");
  ok(csrfAt > 0 && roomAt > csrfAt, "0 라우터는 같은 출처 검사 다음에 단톡방 링크 열기를 본다");
  ok(roomAt < hiddenAt && hiddenAt < noticeAt && noticeAt < publicAt && publicAt < autoAt, "0 숨긴 기능·공지·후원·공개 문서·인앱 자동 로그인보다 먼저 본다(R-7: 공개 문서 주소의 값도 지운다)");
  eq(router.split("kakaoRoomOpenResponse(").length - 1, 1, "0 라우터는 한 곳에서만 부른다");
  ok(/auth\/kakao-start-screen\.js\nauth\/kakao-room-open\.js\n/.test(manifest), "0 새 모듈이 MANIFEST 에 있다(시작 화면 모듈 다음)");
  ok(!/무료/.test(mod), "0 새 모듈에 ‘무료’ 말이 없다");
  ok(!code.includes("ab_credential_reauth") && !code.includes("makeCredentialProof"), "0 본인 확인 표(비밀번호·로그인 이름 바꾸기용)는 주지 않는다");
  ok(!code.includes("kakaoLoginUserKey") && !code.includes('searchParams.get("appUserId")'), "0 appUserId 로는 계정을 찾지 않는다(주소에서 지우기만 한다)");
  ok(mod.includes("const KAKAO_ROOM_OPEN_KEY_SHAPE = /^[0-9A-Fa-f]{32,128}$/;"), "0 키 모양은 16진 32~128자만 받는다(R-10: 내부 키 ‘:’·QA 키 모양을 거른다)");
  ok(!/ensureUser\(|persistIdentityAliases|createUser/.test(code), "0 새 모듈은 사용자를 만들거나 별칭을 쓰지 않는다(읽기만)");
  ok(mod.includes('const KAKAO_ROOM_OPEN_HEADERS = { "referrer-policy": "no-referrer" };'), "0 넘기는 응답은 Referer 를 보내지 않게 한다");
  ok(mod.includes('import { AB_HOUSEHOLD_MEMORY_HEADER } from "../runtime/config-readiness.js";') && /export \{[^}]*\bAB_HOUSEHOLD_MEMORY_HEADER\b[^}]*\}/.test(read("src/modules/runtime/config-readiness.js")), "0 기억한 가계부 표시 머리 이름은 라우터 쪽 상수를 그대로 쓴다(R-8)");
  const rawCheckAt = code.indexOf("if (!identity.raw)");
  const sessionAt = code.indexOf("makeUserSession(env, identity.userId)");
  ok(rawCheckAt > 0 && sessionAt > rawCheckAt, "0 세션은 원래 채팅 계정(raw)일 때만 만든다(R-6: 이 확인이 세션 만들기보다 앞)");
  const pkg = JSON.parse(read("package.json"));
  ok(pkg.scripts?.["validate:room-open-v229105"] === "node validation/validate-room-open-v229105.mjs", "0 package.json 에 검사가 등록돼 있다");
  ok(read(".codex/scripts/verify-repository.mjs").includes("validation/validate-room-open-v229105.mjs"), "0 하네스에 검사가 등록돼 있다");
  const builders = read("src/modules/kakao/response-builders.js");
  ok(builders.includes('description: "전체 기록과 분석을 웹에서 크게 볼 수 있어요.\\n아래 버튼을 누르면 이 방 가계부가 열려요."'), "0 단톡방 ‘웹가계부’ 카드 문구는 ‘이 방 가계부가 열려요’ 다(‘처음에는 로그인’ 없음)");
  ok(!builders.includes("웹은 그 값으로 로그인하거나 권한을 정하지 않는다"), "0 옛 주석(카카오 값으로 로그인하지 않음)을 새 동작으로 고쳤다");
  ok(builders.includes('const KAKAO_LINK_BUTTON_STRIP_PARAMS = ["botUserKey", "appUserId", "botGroupKey"];'), "0 답 단추 주소에서 카카오 값을 지운다(R-9)");
}

// ── 1. 첫 기록 → ‘웹가계부’ 단추 → 바로 그 방 가계부 홈 + 동의 팝업 ─────────────────
await roomFixture(async (fx, { u1, u2, u3, household }) => {
  ok(u1?.id && u2?.id && u3?.id && household?.id, "1 준비: 방 첫 기록으로 방 가계부·소유자(U1)가 생기고, U2 는 같은 방, U3 은 다른 방 사람이다");
  ok(fx.db.household_members.some((row) => row.user_id === u2.id && row.household_id === household.id), "1 준비: U2 는 방 가계부 구성원이다");
  ok(!fx.db.household_members.some((row) => row.user_id === u3.id && row.household_id === household.id), "1 준비: U3 은 방 가계부 구성원이 아니다");
  const card = await sayRaw(fx, "웹가계부", { user: U1, room: ROOM });
  const button = card?.template?.outputs?.[0]?.textCard?.buttons?.[0] || {};
  eq(button.action, "webLink", "1 단톡방 ‘웹가계부’ 답은 링크 단추다");
  eq(button.webLinkUrl, `${BASE}/my`, "1 단추 주소는 /my 그대로다(카카오가 누른 사람 값을 붙인다)");
  ok(!JSON.stringify(card).includes(U1) && !JSON.stringify(card).includes(ROOM), "1 답에는 botUserKey·botGroupKey 가 없다");
  for (const [name, ua] of [["아이폰 인앱", INAPP], ["안드로이드 인앱", ANDROID_INAPP], ["PC 브라우저", PC]]) {
    const first = await go(fx, tapped("/my"), { ua });
    eq(first.status, 303, `1 ${name}: 단추를 누르면 바로 넘긴다(로그인 화면 없음)`);
    eq(first.location, `/app?household_id=${encodeURIComponent(household.id)}`, `1 ${name}: 그 방 가계부 홈(/app)으로 간다`);
    ok(noKakaoValues(first.location), `1 ${name}: 넘기는 주소에 카카오 값이 없다`);
    eq(first.headers.get("referrer-policy"), "no-referrer", `1 ${name}: Referer 를 보내지 않는다`);
    ok(/no-store/.test(first.headers.get("cache-control") || ""), `1 ${name}: 넘기는 응답은 저장하지 않는다(no-store)`);
    eq(sessionUser(first.cookies), u1.id, `1 ${name}: 누른 사람(U1)의 채팅 계정 세션이다`);
    ok(/^ab_user=[^;]+; Path=\/; Max-Age=1209600; HttpOnly; Secure; SameSite=Lax$/.test(cookieLine(first.cookies, "ab_user")), `1 ${name}: 세션 쿠키 모양은 다른 로그인과 같다(14일·HttpOnly·Secure·Lax)`);
    eq(cookieLine(first.cookies, "ab_hh"), "ab_hh=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax", `1 ${name}: 옛 가계부 선택 쿠키는 지운다`);
    ok(cookieLine(first.cookies, "ab_cs").startsWith("ab_cs=0;"), `1 ${name}: 동의 기록이 없어 ab_cs=0(홈 팝업)`);
    ok(!cookieLine(first.cookies, "ab_credential_reauth"), `1 ${name}: 본인 확인 표는 주지 않는다`);
    const home = await go(fx, first.location, { ua, cookie: jarOf(first.cookies) });
    eq(home.status, 200, `1 ${name}: 홈이 바로 열린다`);
    ok(!isStart(home.html) && !home.html.includes('class="landingPage"'), `1 ${name}: 시작 팝업·로그인 화면이 아니다`);
    ok(home.html.includes(ROOM_HOUSEHOLD_NAME) && home.html.includes("12,000"), `1 ${name}: 그 방 가계부(이름·첫 기록 12,000원)가 보인다`);
    ok(isPopup(home.html), `1 ${name}: 홈 위에 개인정보 동의 팝업이 뜬다`);
  }
  ok(/^ok$/.test(lastRoomOpen()), "1 운영 이벤트 kakao_room_open = ok");
  const probe = JSON.parse(settingValue(fx, `${PROBE}ok`) || "{}");
  ok(probe.version === 1 && /^V22\.9\.\d+/.test(probe.app_version || "") && Number.isFinite(Date.parse(probe.at || "")), "1 진단 기록(설정 표)에 결과·시각·판이 남는다");
  eq(Object.keys(probe).sort().join(","), "app_version,at,version", "1 진단 기록에는 식별자를 남기지 않는다");
  ok(!fx.db.accountbook_settings.some((row) => row.key.startsWith(PROBE) && (String(row.value).includes(U1) || String(row.key).includes(U1))), "1 진단 기록 어디에도 botUserKey 가 없다");

  // 팝업에서 동의 → 다음부터 팝업 없음. 같은 사람이 다시 누르면 세션을 바꾸지 않고 홈으로만 보낸다.
  const first = await go(fx, tapped("/my"));
  const jar = jarOf(first.cookies);
  const agreed = await go(fx, "/my/consent", { method: "POST", cookie: jar, headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" }, body: new URLSearchParams({ consent: "1", return_to: first.location }).toString() });
  eq(agreed.status, 303, "1b 팝업 ‘동의’ 는 홈으로 돌아간다");
  ok(cookieLine(agreed.cookies, "ab_cs").startsWith("ab_cs=1;"), "1b 동의 뒤 ab_cs=1");
  ok(JSON.parse(settingValue(fx, `consent:${u1.id}`) || "{}").via === "popup", "1b 동의 기록이 남는다(via popup)");
  const jar2 = `${jar.replace(/ab_cs=0/, "ab_cs=1")}`;
  const again = await go(fx, tapped("/my"), { cookie: jar2 });
  eq(again.status, 303, "1b 같은 사람이 다시 누르면 넘긴다");
  eq(again.location, `/app?household_id=${encodeURIComponent(household.id)}`, "1b 그 방 가계부 홈으로");
  ok(!cookieLine(again.cookies, "ab_user"), "1b 이미 같은 사람 세션이면 세션을 새로 만들지 않는다");
  ok(/^same_session$/.test(lastRoomOpen()), "1b 운영 이벤트 = same_session");
  const homeAfter = await go(fx, again.location, { cookie: jar2 });
  ok(homeAfter.status === 200 && !isPopup(homeAfter.html) && homeAfter.html.includes(ROOM_HOUSEHOLD_NAME), "1b 동의한 뒤의 홈에는 팝업이 없다");
});

// ── 2. 주소 모양: /app·/m·/my/*, 로그인 뒤 화면이 아닌 주소는 값만 지운다(R-7) ─────────────
await roomFixture(async (fx, { household }) => {
  const hh = encodeURIComponent(household.id);
  eq((await go(fx, tapped("/app?month=2026-11"))).location, `/app?month=2026-11&household_id=${hh}`, "2 /app?month= 는 달을 지키고 방 가계부 번호를 붙인다");
  eq((await go(fx, tapped("/m"))).location, `/app?household_id=${hh}`, "2 /m 은 /app 홈으로");
  eq((await go(fx, tapped("/my/settings?month=2026-11"))).location, `/my/settings?month=2026-11&household_id=${hh}`, "2 /my/* 는 그 화면을 지키고 방 가계부 번호를 붙인다");
  eq((await go(fx, tapped(`/my/analysis?household_id=${hh}`))).location, `/my/analysis?household_id=${hh}`, "2 이미 가계부 번호가 있으면 그대로 둔다");
  for (const [name, path] of [["/my/logout", "/my/logout"], ["/my/account-link", "/my/account-link"], ["정적 파일 주소", "/my/app.js"]]) {
    const response = await go(fx, tapped(path));
    ok(response.status === 303 && response.location === path && !sessionUser(response.cookies) && !cookieLine(response.cookies, "ab_cs"), `2 ${name}: 세션을 만들지 않고 값만 지운다(303 ${path})`);
  }
});
await roomFixture(async (fx) => {
  const before = probeRows(fx);
  const strippedBefore = events("kakao_room_values_stripped").length;
  const publicPaths = ["/", "/privacy", "/terms", "/kakao-guide", "/support", "/articles", "/demo", "/faq", "/chatbot-edit-guide", "/login"];
  for (const path of publicPaths) {
    const response = await go(fx, tapped(path));
    eq(response.status, 303, `2b 공개 주소 ${path}: 값이 붙어 오면 넘긴다`);
    eq(response.location, path, `2b 공개 주소 ${path}: 카카오 값만 뺀 같은 주소로`);
    eq(response.cookies.length, 0, `2b 공개 주소 ${path}: 쿠키를 하나도 만들지 않는다`);
    eq(response.headers.get("referrer-policy"), "no-referrer", `2b 공개 주소 ${path}: Referer 를 보내지 않는다`);
    ok(/no-store/.test(response.headers.get("cache-control") || ""), `2b 공개 주소 ${path}: 저장하지 않는다(no-store)`);
  }
  eq((await go(fx, tapped("/privacy?from=room#top"))).location, "/privacy?from=room", "2b 공개 주소의 다른 값(from)은 지킨다");
  eq((await go(fx, "/support?botGroupKey=abc")).location, "/support", "2b 값 하나만 있어도(모양이 달라도) 지운다");
  eq(events("kakao_room_values_stripped").length - strippedBefore, publicPaths.length + 2, "2b 지운 일은 운영 이벤트 kakao_room_values_stripped 로만 남는다");
  eq(probeRows(fx), before, "2b 공개 주소에서는 DB 를 읽거나 쓰지 않는다(진단 행 없음)");
  const after = await go(fx, "/privacy");
  ok(after.status === 200 && after.html.includes("개인정보처리방침") && after.cookies.length === 0, "2b 넘긴 뒤의 공개 문서는 예전 그대로다(200·쿠키 없음)");
  const fetchCall = await go(fx, tapped("/privacy"), { headers: { "sec-fetch-mode": "cors", accept: "application/json" } });
  ok(fetchCall.status !== 303, "2b 페이지 이동이 아닌 요청은 건드리지 않는다");
});

// ── 3. 열지 않는 경우: 카카오 값을 뺀 같은 주소로 → V22.9.104 그대로 ───────────────
await roomFixture(async (fx, { u2 }) => {
  const plainCases = [
    ["botGroupKey 없음(1:1 채팅 등)", tapped("/my", { room: null }), "no_group_key"],
    ["botUserKey 없음", tapped("/my", { user: null }), "no_user_key"],
    ["appUserId 만 있음", "/my?appUserId=1801267359", "no_user_key"],
    ["botUserKey 에 ‘:’(내부 키 kakao_login:2265)", tapped("/my", { user: "kakao_login:2265" }), "bad_key_shape"],
    ["botUserKey 에 ‘:’(local_web:)", tapped("/my", { user: "local_web:bin" }), "bad_key_shape"],
    ["botUserKey 가 너무 짧음", tapped("/my", { user: "abc" }), "bad_key_shape"],
    ["QA 키 모양(test-bot-user-key)", tapped("/my", { user: "test-bot-user-key" }), "bad_key_shape"],
    ["16진이 아닌 66자", tapped("/my", { user: "g".repeat(66) }), "bad_key_shape"],
    ["16진 31자", tapped("/my", { user: "a".repeat(31) }), "bad_key_shape"],
    ["16진 129자", tapped("/my", { user: "a".repeat(129) }), "bad_key_shape"],
    ["botGroupKey 가 16진이 아님", tapped("/my", { room: "link-buttons-room" }), "bad_key_shape"],
    ["botUserKey 가 두 번(앞에 남의 값)", `/my?botUserKey=${U3}&botUserKey=${U1}&botGroupKey=${ROOM}`, "duplicate_values"],
    ["botGroupKey 가 두 번", `/my?botUserKey=${U1}&botGroupKey=${ROOM_B}&botGroupKey=${ROOM}`, "duplicate_values"],
    ["appUserId 가 두 번", `/my?botUserKey=${U1}&appUserId=1&appUserId=2&botGroupKey=${ROOM}`, "duplicate_values"],
    ["없는 botUserKey", tapped("/my", { user: U_UNKNOWN }), "no_user"],
    ["다른 방 사람(U3, 이 방 가계부 구성원 아님)", tapped("/my", { user: U3 }), "not_member"],
    ["가계부가 이어지지 않은 방", tapped("/my", { room: ROOM_EMPTY }), "no_room_household"],
    ["다른 방의 botGroupKey(U1 은 ROOM_B 구성원 아님)", tapped("/my", { room: ROOM_B }), "not_member"],
  ];
  for (const [name, path, result] of plainCases) {
    const response = await go(fx, path);
    eq(response.status, 303, `3 ${name}: 넘긴다`);
    eq(response.location, "/my", `3 ${name}: 카카오 값을 뺀 같은 주소(/my)로`);
    ok(!sessionUser(response.cookies) && !cookieLine(response.cookies, "ab_cs"), `3 ${name}: 세션·동의 쿠키를 만들지 않는다`);
    eq(lastRoomOpen(), result, `3 ${name}: 운영 이벤트 결과`);
  }
  const plain = await go(fx, "/my");
  eq(plain.status, 303, "3 그 다음 /my 는 V22.9.104 그대로(인앱 자동 로그인)");
  eq(plain.location, "/auth/kakao/start?auto=1", "3 자동 로그인 주소");
  const keep = await go(fx, tapped("/app?month=2026-11", { user: U_UNKNOWN }));
  eq(keep.location, "/app?month=2026-11", "3 열지 못해도 다른 주소 값(month)은 지킨다");
  // 관리자 쿠키가 있는 브라우저는 열지 않는다.
  const admin = await go(fx, tapped("/my"), { cookie: "ab_admin=qa-admin" });
  ok(admin.status === 303 && admin.location === "/my" && !sessionUser(admin.cookies), "3 관리자 쿠키가 있는 브라우저는 열지 않고 카카오 값만 뺀다");
  eq(lastRoomOpen(), "admin_browser", "3 운영 이벤트 = admin_browser");
  // 링크 미리보기 수집기(카카오톡·슬랙·네이버 등)는 세션을 받지 않는다(R-11).
  for (const [name, ua] of [
    ["카카오톡 미리보기", "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/docs/latest/kakaotalk-link-scrap"],
    ["슬랙 미리보기", "Slackbot-LinkExpanding 1.0 (+https://api.slack.com/robots)"],
    ["네이버 수집기", "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)"],
    ["헤드리스 크롬", "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) HeadlessChrome/130.0.0.0 Safari/537.36"],
  ]) {
    const crawler = await go(fx, tapped("/my"), { ua });
    ok(crawler.status === 303 && crawler.location === "/my" && !sessionUser(crawler.cookies), `3 ${name}: 세션 없이 카카오 값만 뺀다`);
    eq(lastRoomOpen(), "crawler", `3 ${name}: 운영 이벤트 = crawler`);
  }
  // 페이지 이동이 아닌 요청·미리 읽기·POST 는 이 처리 대상이 아니다.
  const fetchCall = await go(fx, tapped("/my"), { headers: { "sec-fetch-mode": "cors" } });
  ok(!sessionUser(fetchCall.cookies), "3 fetch(cors) 요청은 세션을 만들지 않는다");
  const prefetch = await go(fx, tapped("/my"), { headers: { "sec-purpose": "prefetch" } });
  ok(!sessionUser(prefetch.cookies), "3 미리 읽기는 세션을 만들지 않는다");
  const posted = await go(fx, tapped("/my"), { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin" }, body: "x=1" });
  ok(!sessionUser(posted.cookies), "3 POST 는 세션을 만들지 않는다");
  // U2 의 내부 키 모양(kakao_login:)으로 꾸며도 U2 웹 계정이 열리지 않는다.
  ok(u2?.id && !sessionUser((await go(fx, tapped("/my", { user: `kakao_login:${u2.id}` }))).cookies), "3 꾸민 내부 키로는 어떤 계정도 열지 않는다");
});

// ── 4. 실패·제한: DB 오류·시도 제한 ───────────────────────────────────────────────
await roomFixture(async (fx) => {
  let restore = intercept(async ({ url, method }) => (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_auth_attempt" ? failure(503) : null));
  try {
    const response = await go(fx, tapped("/my"));
    ok(response.location === "/my" && !sessionUser(response.cookies), "4 시도 제한 확인이 안 되면 열지 않는다");
    eq(lastRoomOpen(), "limiter_unavailable", "4 운영 이벤트 = limiter_unavailable");
  } finally { restore(); }
  restore = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/users" && String(url.searchParams.get("kakao_user_key") || "").startsWith("eq.") ? failure(503) : null));
  try {
    const response = await go(fx, tapped("/my"));
    ok(response.status === 303 && response.location === "/my" && !sessionUser(response.cookies), "4 계정 조회가 실패하면 열지 않는다");
    ok(lastRoomOpen().startsWith("lookup_failed"), "4 운영 이벤트 = lookup_failed");
  } finally { restore(); }
  fx.db.__enforce_auth_rate = true;
  let blockedAt = 0;
  for (let i = 1; i <= 62; i += 1) {
    const response = await go(fx, tapped("/my", { user: U_UNKNOWN }));
    if (lastRoomOpen() === "rate_limited") { blockedAt = i; break; }
    if (response.status !== 303) break;
  }
  eq(blockedAt, 61, "4 같은 IP 의 시도는 15분 60번까지(61번째부터 막힘)");
  const blocked = await go(fx, tapped("/my"));
  ok(blocked.location === "/my" && !sessionUser(blocked.cookies), "4 막힌 뒤에는 맞는 값이어도 열지 않는다(카카오 값만 뺀다)");
  fx.db.__enforce_auth_rate = false;
});

// ── 5. 이미 세션이 있을 때, 기억한 가계부(ab_hh) ────────────────────────────────────
await roomFixture(async (fx, { u1, u2, household }) => {
  const hh = encodeURIComponent(household.id);
  // 같은 방 구성원(U2) 세션이 있는 브라우저에서 U1 값으로 누르면: 세션을 바꾸지 않고 방 가계부 홈으로.
  const u2Cookie = await fx.cookieFor(u2.id);
  const member = await go(fx, tapped("/my"), { cookie: u2Cookie });
  ok(member.status === 303 && member.location === `/app?household_id=${hh}` && !cookieLine(member.cookies, "ab_user"), "5 이 방 가계부를 읽을 수 있는 세션이면 세션을 바꾸지 않는다");
  eq(lastRoomOpen(), "member_session", "5 운영 이벤트 = member_session");
  // 방 가계부 구성원이 아닌 웹 계정(user-bin = kakao_login:2265) 세션: 앱에서 바로 연 이동(Sec-Fetch-Site: none)일 때만 누른 사람 세션으로 바꾼다(R-9).
  for (const [name, headers] of [["머리 없음", {}], ["다른 사이트 링크(cross-site)", { "sec-fetch-site": "cross-site" }], ["같은 사이트 안 링크(same-origin)", { "sec-fetch-site": "same-origin" }]]) {
    const kept = await go(fx, tapped("/my"), { cookie: fx.cookie, headers });
    ok(kept.status === 303 && kept.location === "/my" && !cookieLine(kept.cookies, "ab_user"), `5 다른 계정 세션 + ${name}: 세션을 바꾸지 않고 카카오 값만 뺀다`);
    eq(lastRoomOpen(), "session_kept", `5 다른 계정 세션 + ${name}: 운영 이벤트 = session_kept`);
  }
  const other = await go(fx, tapped("/my"), { cookie: fx.cookie, headers: APP_DIRECT });
  eq(sessionUser(other.cookies), u1.id, "5 다른 계정 세션 + 앱에서 바로 연 이동: 누른 사람 세션으로 바꾼다");
  eq(other.location, `/app?household_id=${hh}`, "5 그리고 방 가계부 홈으로");
  eq(lastRoomOpen(), "switched", "5 운영 이벤트 = switched");

  // 기억한 가계부(ab_hh = house-home)가 있는 브라우저(R-8): 라우터가 채운 household_id 는 방 가계부를 이기지 않는다.
  const remembered = `${u2Cookie}; ab_hh=house-home`;
  const rememberedMember = await go(fx, tapped("/my"), { cookie: remembered });
  eq(rememberedMember.location, `/app?household_id=${hh}`, "5 구성원 세션 + 기억한 다른 가계부: 그래도 방 가계부 홈으로");
  const rememberedHome = await go(fx, rememberedMember.location, { cookie: remembered });
  ok(rememberedHome.status === 200 && rememberedHome.html.includes(ROOM_HOUSEHOLD_NAME), "5 구성원 세션 + 기억한 다른 가계부: 그 홈이 열린다(404 아님)");
  const freshRemembered = await go(fx, tapped("/my"), { cookie: "ab_hh=house-home" });
  eq(freshRemembered.location, `/app?household_id=${hh}`, "5 세션 없음 + 기억한 다른 가계부: 방 가계부 홈으로");
  eq(sessionUser(freshRemembered.cookies), u1.id, "5 세션 없음 + 기억한 다른 가계부: 누른 사람 세션");
  const freshHome = await go(fx, freshRemembered.location, { cookie: jarOf(freshRemembered.cookies) });
  ok(freshHome.status === 200 && freshHome.html.includes(ROOM_HOUSEHOLD_NAME), "5 세션 없음 + 기억한 다른 가계부: 그 홈이 열린다(404 아님)");
  const strangerRemembered = await go(fx, tapped("/my", { user: U_UNKNOWN }), { cookie: "ab_hh=house-home" });
  eq(strangerRemembered.location, "/my", "5 열지 못할 때도 기억한 가계부 번호를 주소에 굳혀 넣지 않는다");
  const roomExplicit = await go(fx, tapped("/my/settings?household_id=house-home"), { cookie: u2Cookie });
  eq(roomExplicit.location, "/my/settings?household_id=house-home", "5 주소에 직접 적힌 가계부 번호는 그대로 둔다(접근은 그 화면이 다시 확인)");
});

// ── 6. 웹 계정에 이어진 사람(별칭·통합), 승인 대기·이용 제한 ─────────────────────────────
await roomFixture(async (fx, { household }) => {
  const hh = encodeURIComponent(household.id);
  // 별칭만 있는 계정: users 행에 그 botUserKey 가 없고 식별 연결표(skill_identity:)가 웹 계정 user-wifi 를 가리킨다(R-6).
  fx.db.household_members.push({ household_id: household.id, user_id: "user-wifi", role: "member", created_at: `${DAY}T01:00:00Z` });
  const links = JSON.parse(settingValue(fx, "user_identity_links") || "{}");
  links[`skill_identity:${U_ALIAS}`] = { user_id: "user-wifi", source: "skill", linked_at: `${DAY}T01:00:00Z` };
  putSetting(fx, "user_identity_links", JSON.stringify(links));
  const alias = await go(fx, tapped("/my", { user: U_ALIAS }));
  eq(alias.status, 303, "6 별칭 계정: 넘긴다");
  eq(alias.location, `/app?household_id=${hh}`, "6 별칭 계정: 그 방 가계부 주소로");
  eq(alias.cookies.length, 0, "6 별칭 계정: 주소 값으로는 웹 계정 세션을 만들지 않는다(쿠키 0개)");
  eq(lastRoomOpen(), "linked_account", "6 운영 이벤트 = linked_account");
  const aliasNext = await go(fx, alias.location);
  ok(aliasNext.status === 303 && aliasNext.location.startsWith("/auth/kakao/start?auto=1"), "6 별칭 계정: 그 다음은 인앱 자동 로그인(카카오 계정으로 그 웹 계정에 로그인)");
  const wifiCookie = await fx.cookieFor("user-wifi");
  const aliasSame = await go(fx, tapped("/my", { user: U_ALIAS }), { cookie: wifiCookie });
  ok(aliasSame.location === `/app?household_id=${hh}` && !cookieLine(aliasSame.cookies, "ab_user"), "6 별칭 계정 + 그 웹 계정 세션: 그대로 방 가계부 홈으로");
  eq(lastRoomOpen(), "same_session", "6 운영 이벤트 = same_session");
  const aliasOther = await go(fx, tapped("/my", { user: U_ALIAS }), { cookie: fx.cookie, headers: APP_DIRECT });
  ok(aliasOther.location === "/my" && !cookieLine(aliasOther.cookies, "ab_user"), "6 별칭 계정 + 이 방을 못 읽는 다른 계정 세션: 세션을 바꾸지 않는다");
  eq(lastRoomOpen(), "linked_other_session", "6 운영 이벤트 = linked_other_session");

  // 통합된 채팅 행: 행은 그 botUserKey 그대로지만 ‘(통합됨)’ 이고 웹 계정(user-wifi)으로 합쳐졌다 → 세션 없이 방 가계부 주소로.
  const mergedKey = hex66("user-merged-redirect");
  fx.db.users.push({ id: "user-merged-redirect", kakao_user_key: mergedKey, nickname: "옛 채팅 계정 (통합됨)", created_at: `${DAY}T01:00:00Z` });
  putSetting(fx, "identity_merge_redirect:user-merged-redirect", JSON.stringify({ secondary_user_id: "user-merged-redirect", primary_user_id: "user-wifi" }));
  const mergedRedirect = await go(fx, tapped("/my", { user: mergedKey }));
  ok(mergedRedirect.location === `/app?household_id=${hh}` && mergedRedirect.cookies.length === 0, "6 통합된 채팅 행: 합친 웹 계정 세션을 주소 값으로 만들지 않는다");
  eq(lastRoomOpen(), "linked_account", "6 통합된 채팅 행: 운영 이벤트 = linked_account");
  // 합친 곳을 못 찾는 ‘(통합됨)’ 행은 열지 않는다.
  const orphanKey = hex66("user-merged-orphan");
  fx.db.users.push({ id: "user-merged-orphan", kakao_user_key: orphanKey, nickname: "옛 계정 (통합됨)", created_at: `${DAY}T01:00:00Z` });
  fx.db.household_members.push({ household_id: household.id, user_id: "user-merged-orphan", role: "member", created_at: `${DAY}T01:00:00Z` });
  const orphan = await go(fx, tapped("/my", { user: orphanKey }));
  ok(orphan.location === "/my" && !sessionUser(orphan.cookies), "6 합친 곳 없는 ‘(통합됨)’ 행: 열지 않는다");
  eq(lastRoomOpen(), "no_user", "6 운영 이벤트 = no_user");

  // 승인 대기(pending) 구성원은 세션은 만들되 /my 의 상태 화면으로 간다.
  const pendingKey = hex66("user-pending");
  fx.db.users.push({ id: "user-pending", kakao_user_key: pendingKey, nickname: "대기", created_at: `${DAY}T01:00:00Z` });
  fx.db.household_members.push({ household_id: household.id, user_id: "user-pending", role: "pending", created_at: `${DAY}T01:00:00Z` });
  const pending = await go(fx, tapped("/my", { user: pendingKey }));
  eq(sessionUser(pending.cookies), "user-pending", "6 승인 대기 구성원도 누른 사람 세션은 만든다");
  eq(pending.location, `/my?household_id=${hh}`, "6 승인 대기면 /my 상태 화면으로(가계부 내용은 보이지 않는다)");
  // 이용 제한(blocked) 구성원은 열지 않는다.
  const blockedKey = hex66("user-blocked");
  fx.db.users.push({ id: "user-blocked", kakao_user_key: blockedKey, nickname: "제한", created_at: `${DAY}T01:00:00Z` });
  fx.db.household_members.push({ household_id: household.id, user_id: "user-blocked", role: "blocked", created_at: `${DAY}T01:00:00Z` });
  const blocked = await go(fx, tapped("/my", { user: blockedKey }));
  ok(blocked.location === "/my" && !sessionUser(blocked.cookies), "6 이용 제한 구성원: 열지 않는다");
  eq(lastRoomOpen(), "not_member", "6 이용 제한 구성원: 운영 이벤트 = not_member");
});

// ── 7. 1:1 채팅 답은 그대로(웹 연결 코드) ───────────────────────────────────────────
await roomFixture(async (fx) => {
  const direct = await sayRaw(fx, "웹가계부", { user: U1 });
  const text = JSON.stringify(direct);
  ok(text.includes("웹 연결 코드") || text.includes("/my"), "7 1:1 ‘웹가계부’ 답은 지금처럼 웹 연결 코드 안내다");
  ok(!text.includes("이 방 가계부가 열려요"), "7 1:1 답에는 단톡방 카드 문구가 없다");
});

// ── 8. 답 글의 우리 주소에 카카오 값이 적혀 있으면 단추 주소에서 지운다(R-9) ───────────────
{
  const payload = { userRequest: { utterance: "x", user: { id: U1, type: "botUserKey", properties: { botUserKey: U1 } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } } };
  const finish = async (text) => (await kakaoGroupCompatibleResponse(kakaoText(text), payload, BASE)).json();
  const webLinks = (body) => (body.template?.outputs || []).flatMap((output) => ((output.textCard || output.basicCard || {}).buttons || [])).filter((button) => button.action === "webLink").map((button) => button.webLinkUrl);
  const filled = await finish(["웹 가계부", `${BASE}/my?month=2026-11&botUserKey=${U3}&appUserId=9&botGroupKey=${ROOM_B}`].join("\n"));
  eq(webLinks(filled).join(","), `${BASE}/my?month=2026-11`, "8 남의 값이 적힌 우리 주소는 값을 뺀 주소로 단추가 된다(누른 사람 값만 붙게)");
  const plain = await finish(["상세 분석 보기", `${BASE}/my/analysis?month=2026-11&q=a%20b`].join("\n"));
  eq(webLinks(plain).join(","), `${BASE}/my/analysis?month=2026-11&q=a%20b`, "8 값이 없는 주소는 한 글자도 바꾸지 않는다");
}

const checks = t.done();
if (checks < 120) throw new Error(`검사 수가 너무 적다: ${checks}`);
