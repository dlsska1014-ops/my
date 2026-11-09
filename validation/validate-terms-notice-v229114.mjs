// V22.9.114 약관 안내 검사 — 동의 체크 칸·홈 동의 팝업(V22.9.95 R-9·V22.9.104 L-3)을 ‘이용하면 이용약관에 동의한 것으로 봅니다’ 안내로 바꾼 판.
//
// ── 왜 ──
// 사용자(2026-11-09): "팝업을 없애고 안내 띠로 바꿔줘"(카카오 앱 심사 담당자가 이용약관·개인정보처리방침 팝업을 없애 달라고 함). 개인정보는 계약 이행 근거 처리라
// 동의 대상이 아니고(방침 9절), 약관은 명시·설명 의무만 있다(약관규제법 3조) → 카카오 로그인·카카오톡 시작 화면은 단추 아래 안내 한 줄(.termsNote), 가계부 홈은
// 안내 확인 기록이 없을 때(ab_cs=0) 맨 위 안내 띠(#abTermsBand, ‘확인’ = POST /my/consent, 기록 via band). 로그인 이름 가입 폼의 동의 칸은 그대로 둔다.
// ── 본다 ──
//   A 소스·번들·등록: 옛 팝업·체크 칸·이벤트 이름이 모듈과 번들에서 사라졌고 새 띠·이벤트가 있다. 개정 공고일 = 시행일.
//   B 화면: 로그인 화면(바깥 브라우저)·카카오톡 시작 화면·공개 첫 화면 띠의 카카오 폼은 동의 칸 없이 단추 + 안내 한 줄. 방침 6·12절, 약관 2절.
//   C 카카오 시작·콜백: 보통 로그인은 바로 카카오 인가(303), 상태에 consent 없음. 화면 있는 로그인은 새 계정 + 기록(via kakao) + ab_cs=1,
//     기록 없던 기존 계정도 기록, 자동 로그인(auto=1)은 기록하지 않음(ab_cs=0 → 홈 띠). 카카오 취소는 시작 화면으로.
//   D 홈 띠·POST /my/consent: ab_cs=0 일 때만 띠(돌아갈 곳은 알림 값 뺀 지금 주소), 1·없음·다른 값·관리자는 띠 없음(바이트 동일).
//     ‘확인’ 은 체크 칸 없이 303 + ab_cs=1 + 기록(via band) + terms_notice_closed; 기록이 있으면 다시 쓰지 않음(already), 저장 실패(unrecorded)·읽기 실패(unread)도
//     띠는 닫힘(안내라 사람을 막지 않음). return_to 는 같은 사이트 허용 목록만.
//   E 로그인 이름 가입: 동의 칸은 그대로 필수(400 / 303 + via local).
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처. DB·바깥 요청 없음. 판 이름 전체 글자는 적지 않는다(‘판 번호 정본’ 검사).
//   node validation/validate-terms-notice-v229114.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { app, BASE, counter, failure, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";
import { readPurposeToken } from "../src/index.js";

const t = counter("PASS: V22.9.114 terms notice line + home notice band replace the consent box and popup");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const siteConfig = read("src/modules/public/site-config.js");
const REVISION = siteConfig.match(/const POLICY_REVISION_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const NOTICE = siteConfig.match(/const POLICY_NOTICE_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const DAY = REVISION || "2026-11-09";
const label = (ymd) => { const [y, m, d] = ymd.split("-").map(Number); return `${y}년 ${m}월 ${d}일`; };
const SECRET = "terms-notice-secret-v229114";
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const APP_NOV = "/app?month=2026-11";
const HOME = "/app?month=2026-07&household_id=house-home";
const NOTE = '<p class="termsNote">계속하면 <a href="/terms" target="_blank">이용약관</a>에 동의한 것으로 봅니다 · <a href="/privacy" target="_blank">개인정보처리방침</a></p>';
const BAND_OPEN = '<div class="abTermsBand" id="abTermsBand" role="region" aria-label="이용약관 안내">';
const BAND_TEXT = '<p>서비스를 이용하면 <a href="/terms">이용약관</a>에 동의한 것으로 봅니다. <a href="/privacy">개인정보처리방침</a>도 확인해 주세요.</p>';
const SIGNUP_MESSAGE = "이용약관 동의와 개인정보처리방침 확인이 필요해요";
const CS_ON = "ab_cs=1; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax";
const CS_OFF = "ab_cs=0; Max-Age=1209600; Path=/; HttpOnly; Secure; SameSite=Lax";
const OLD_WORDS = ["abConsentPop", "kakaoConsent", "consentPopup", "withConsentPopupV229104", "kakao_login_consent_missing", "consent_popup_accepted", "동의하고 계속"];

function resetIsolateState() {
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  for (const name of ["__AB_KAKAO_APP_USER_ID_PROBE", "__AB_KAKAO_LOGIN_CONFLICT_TRACED", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD"]) globalThis[name]?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const cookieLine = (cookies, name) => cookies.find((line) => line.startsWith(`${name}=`)) || "";
const consentRecord = (fx, userId) => { const raw = settingValue(fx, `consent:${userId}`); try { return raw ? JSON.parse(raw) : null; } catch (_) { return null; } };
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const ownedHouseholds = (fx, userId) => fx.db.household_members.filter((row) => row.user_id === userId && row.role === "owner").map((row) => fx.db.households.find((item) => item.id === row.household_id)).filter(Boolean);
const text = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const consentReadFails = (fx, userId) => intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_settings" && url.searchParams.get("key") === `eq.consent:${userId}` ? failure(503) : null));
const consentWriteFails = () => intercept(async ({ url, method, init }) => (method === "POST" && url.pathname === "/rest/v1/accountbook_settings" && String(init?.body || "").includes('"consent:') ? failure(503) : null));

function moduleSources() {
  const base = new URL("src/modules/", root);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = new URL(name, dir);
      if (statSync(full).isDirectory()) walk(new URL(`${name}/`, dir));
      else if (name.endsWith(".js") && name !== "historical-runtime-assets.js") out.push({ path: full.href.slice(base.href.length), source: readFileSync(full, "utf8") });
    }
  };
  walk(base);
  return out;
}

// 쿠키 통(validate-kakao-home-v229104 와 같은 모양).
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
    return [...this.items].filter(([, item]) => item.path === "/" || pathname === item.path || pathname.startsWith(`${item.path}/`)).map(([name, item]) => `${name}=${item.value}`).join("; ");
  }
  get(name) { return this.items.get(name)?.value || ""; }
  has(name) { return this.items.has(name); }
  user() { const raw = this.get("ab_user"); return raw ? decodeURIComponent(raw).split("|")[0] : ""; }
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

async function kakaoLogin(fx, jar, server, kakaoId, { ua = INAPP, start = "/auth/kakao/start", kakaoAnswer = "" } = {}) {
  server.id = String(kakaoId);
  const begin = await go(fx, jar, start, { ua });
  const authorize = new URL(begin.location || `${BASE}/`);
  const state = authorize.searchParams.get("state") || "";
  const query = kakaoAnswer ? `error=${encodeURIComponent(kakaoAnswer)}` : "code=qa-code";
  const callback = await go(fx, jar, `/auth/kakao/callback?${query}&state=${encodeURIComponent(state)}`, { ua });
  return { begin, authorize, state, callback };
}
const stateOf = (fx, location) => readPurposeToken(fx.env, "kakao-oauth", new URL(location, BASE).searchParams.get("state") || "").catch(() => null);

async function scene(task, { kakao = true } = {}) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    fx.env.ADMIN_API_TOKEN = "qa-admin-token-v229114";
    if (kakao) Object.assign(fx.env, KAKAO_ENV);
    const server = kakaoServer(fx);
    try { return await task(fx, server); } finally { server.restore(); resetIsolateState(); }
  }));
}

// ── A. 소스·번들·등록 ─────────────────────────────────────────────────────────
{
  ok(/^\d{4}-\d{2}-\d{2}$/.test(REVISION) && NOTICE === REVISION && REVISION >= "2026-11-09", `A 개정 공고일 = 시행일(불리하지 않은 변경은 알린 날부터)이고 2026-11-09 이후다 (${NOTICE} → ${REVISION})`);
  const oauth = read("src/modules/auth/kakao-oauth.js");
  ok(!oauth.includes("SIGNUP_CONSENT_REQUIRED_MESSAGE") && !oauth.includes("statePayload.consent") && !oauth.includes("loginConsent"), "A 카카오 시작·콜백에 동의 검사(consent=1 → 400)가 없다");
  ok(oauth.includes("{ allowCreate: true, onCreated: (created) => { createdUser = created; } }") && oauth.includes('recordSignupConsent(env, createdUser.id, "kakao")'), "A 화면 있는 로그인은 새 계정을 만들고 기록(via kakao)을 남긴다");
  ok(oauth.includes("const screenLogin = stateProof.mode === \"login\" && !autoMode;") && oauth.includes("consentRead === false && screenLogin && !createdUser?.id"), "A 기록 없던 기존 계정도 화면 있는 로그인이면 기록한다(자동 로그인은 제외)");
  ok(oauth.includes("if (autoMode && emptyAccount && (consentState !== true || !noLinkOffer)) {"), "A 자동 로그인의 빈 계정은 기록이 있을 때만 기본 가계부(V22.9.104 L-1·V22.9.91 그대로)");
  const start = read("src/modules/auth/kakao-start-screen.js");
  ok(start.includes("function withTermsNoticeBandV229114(request, url, eligible, html) {") && start.includes("async function handleMyConsent(request, env) {") && /export \{[\s\S]*withTermsNoticeBandV229114/.test(start), "A 시작 화면 모듈이 띠 삽입과 POST /my/consent 처리를 내보낸다");
  ok(start.includes('const TERMS_BAND_DROP_PARAMS = ["msg", "err", "balert", "saved_rid", "saved_qd", "undo", "restore", "quick", "day_detail", "rid"];'), "A 띠의 돌아갈 곳에서 한 번 쓰는 알림 값을 뺀다");
  ok(start.includes('recordSignupConsent(env, userId, "band")') && start.includes('kind: "terms_notice_closed"') && start.includes("const back = rawBack.startsWith(\"/my/consent\") ? \"/app\" : rawBack;"), "A ‘확인’ 은 via band 기록 + terms_notice_closed 이벤트 + /my/consent 되돌림 방지");
  ok(start.includes("safeUserReturnPath(returnTo || \"\", \"/app\")") && start.includes(BAND_OPEN) && start.includes(BAND_TEXT), "A 띠 조각: 같은 사이트 돌아갈 곳·role=region·안내 문구");
  ok(start.includes("#abStartCard .termsNote{") && !start.includes(".consentRow") && !start.includes(".fieldError"), "A 시작 화면 카드 CSS 는 안내 한 줄만 꾸미고 동의 칸·오류 규칙이 없다");
  ok(!start.includes("abStartModalStyle\").length") && start.split('id="abTermsBandStyle"').length === 2, "A 띠 스타일은 띠와 함께 한 번 실린다(1년 캐시 자산 불변)");
  const home = read("src/modules/my/mobile-home.js");
  eq(home.split("withTermsNoticeBandV229114").length - 1, 2, "A 홈 응답 마무리가 띠 삽입을 (가져오기 + 호출) 두 번 적는다");
  ok(!home.includes("withConsentPopupV229104"), "A 홈 응답 마무리에 옛 팝업 삽입이 없다");
  const login = read("src/modules/auth/local-login-pages.js");
  ok(login.includes('const label = ["kakao", "popup", "band"].includes(via) ? via : "local";') && login.includes("SIGNUP_CONSENT_REQUIRED_MESSAGE"), "A 기록 경로 local·kakao·band(옛 popup 행은 그대로 읽힘) + 로그인 이름 가입의 동의 칸 검사는 유지");
  ok(login.includes('label === "local" ? "/my/local-signup" : "/my/consent"'), "A 기록 실패 이벤트의 경로가 가입/띠에 맞다");
  ok(siteConfig.includes("function termsNoticeLineHtml() {") && siteConfig.includes(NOTE.replace("</p>", "")) && !siteConfig.match(/function kakaoLoginButtonHtml[\s\S]*?\n\}/)?.[0].includes("consentRow"), "A 카카오 단추 조각은 동의 칸 없이 안내 한 줄을 붙인다");
  ok(siteConfig.includes("function signupConsentFieldHtml(id = \"signupConsent\", error = \"\") {"), "A 가입 폼 동의 칸 조각은 남아 있다(로그인 이름 가입만 쓴다)");
  const side = read("src/modules/web/login-page-side-nav.js");
  ok(!side.includes("\"kakao_consent\"") && !side.includes("consentMode") && !side.includes("kakaoConsentError") && side.includes(".termsNote{margin:8px 0 0;color:#5f6b7a;font-size:12.5px;line-height:1.5;text-align:center;overflow-wrap:anywhere}"), "A 로그인 화면은 카카오 동의 오류 모드가 없고 안내 한 줄 CSS 가 있다");
  const pages = read("src/modules/public/content-pages.js");
  ok(pages.includes("ab_cs: 이용약관 안내 확인 기록을 읽은 결과(가계부 홈의 안내 띠를 띄울지), 14일") && pages.includes("이번 개정은 카카오 로그인과 가계부 홈에서 이용약관 동의를 체크하던 칸을 ‘이용하면 이용약관에 동의한 것으로 봅니다’ 안내 줄로 바꾸고") && pages.includes("카카오 로그인과 카카오톡에서 여는 가계부는 서비스를 이용하면 이용약관에 동의한 것으로 보며") && pages.includes(".pubBand .termsNote{"), "A 방침 6·12절·약관 2절·공개 띠 CSS 가 새 모델이다");
  const router = read("src/modules/worker/router.js");
  ok(router.includes('if (url.pathname === "/my/consent" && request.method === "POST") {') && router.includes("return await handleMyConsent(request, env);"), "A POST /my/consent 경로는 그대로다(같은 출처 검사 뒤)");
  const sources = moduleSources();
  for (const word of OLD_WORDS) {
    const hits = sources.filter((item) => item.source.includes(word)).map((item) => item.path);
    eq(hits.join(","), "", `A 모듈 어디에도 옛 말 ‘${word}’ 가 없다`);
  }
  const bundle = read("src/index.js");
  for (const word of ["abConsentPop", 'id="kakaoConsent"', "kakao_login_consent_missing", "consent_popup_accepted", "동의하고 계속", "withConsentPopupV229104"]) ok(!bundle.includes(word), `A 번들에 옛 말 ‘${word}’ 가 없다`);
  for (const word of ["abTermsBand", "terms_notice_closed", 'class="termsNote"', "withTermsNoticeBandV229114"]) ok(bundle.includes(word), `A 번들에 새 말 ‘${word}’ 가 있다`);
  const pkg = JSON.parse(read("package.json"));
  ok(pkg.scripts?.["validate:terms-notice-v229114"] === "node validation/validate-terms-notice-v229114.mjs", "A package.json 에 검사가 등록돼 있다");
  const harness = read(".codex/scripts/verify-repository.mjs");
  // V22.9.115 부터: manifest 이름은 판마다 바뀌므로 ‘이 판 또는 뒤 판’ 을 받는다(하네스는 현재 판 manifest 하나만 이름 짓는다).
  const manifestMinors = [...harness.matchAll(/"BUNDLE_FILE_CHECKSUMS_V22_9_([0-9]+)[.]sha256"/g)].map((m) => Number(m[1]));
  ok(harness.includes("validation/validate-terms-notice-v229114.mjs") && manifestMinors.length > 0 && Math.max(...manifestMinors) >= 114, `A 하네스에 검사와 이 판 또는 뒤 판의 manifest 이름이 있다 (V22_9_${Math.max(...manifestMinors)})`);
  const tool = read("tools/verify-deployment-v22920.mjs");
  ok(tool.includes("Kakao start without a consent box goes straight to Kakao (303, V22.9.114)") && !tool.includes("shows the consent screen (400)"), "A 공개 점검 도구도 동의 없는 시작 = 303 을 기대한다");
  ok(!read("validation/validate-kakao-home-v229104.mjs").includes('"/auth/kakao/start?consent=1"') && read("validation/validate-room-open-v229105.mjs").includes("const isBand") && read("validation/validate-v22995-legal.mjs").includes("const NOTE = "), "A 옛 검사(V104·V105·V95 법무)도 띠 모델로 고쳤다");
}

// ── B. 화면 ─────────────────────────────────────────────────────────────────
await scene(async (fx) => {
  const login = await go(fx, new Jar(), "/my", { ua: CHROME });
  eq(login.status, 200, "B 로그인 화면(바깥 브라우저)");
  const kakaoForm = login.html.match(/<form class="kakaoStart" method="get" action="\/auth\/kakao\/start">([\s\S]*?)<\/form>/)?.[1] || "";
  ok(kakaoForm.startsWith('<button class="kakaoBtn" type="submit">') && !kakaoForm.includes('name="consent"'), "B 카카오 폼은 단추뿐이다(동의 칸 없음)");
  ok(login.html.includes(`</svg>카카오 로그인</button></form>${NOTE}`), "B 카카오 단추 바로 아래 안내 한 줄(이용약관·개인정보처리방침 새 탭)");
  eq((login.html.match(/name="consent"/g) || []).length, 1, "B 동의 칸은 로그인 이름 가입 폼에만 하나");
  ok(login.html.includes('<input id="signupConsent" name="consent" type="checkbox" value="1" required/>'), "B 가입 폼 동의 칸은 그대로(필수·미리 체크 없음)");
  ok(login.html.includes(".termsNote{margin:8px 0 0;color:#5f6b7a;font-size:12.5px;") && !login.html.includes("kakaoConsent"), "B 안내 한 줄 CSS 가 실리고 옛 칸 id 가 없다");
  const back = await go(fx, new Jar(), "/my?return_to=%2Fmy%2Fanalysis", { ua: CHROME });
  ok(back.html.includes('<form class="kakaoStart" method="get" action="/auth/kakao/start"><input type="hidden" name="return_to" value="/my/analysis"/><button class="kakaoBtn" type="submit">'), "B 돌아갈 곳이 있으면 숨은 칸 뒤 바로 단추");

  const start = await go(fx, new Jar("ab_kakao_auto=skip"), APP_NOV, { ua: INAPP });
  ok(start.status === 200 && start.html.includes('id="abKakaoStart"'), "B 카카오톡 인앱 시작 화면");
  ok(start.html.includes(`<form class="kakaoStart" method="get" action="/auth/kakao/start"><input type="hidden" name="return_to" value="${APP_NOV}"/><button class="kakaoBtn" type="submit">`) && start.html.includes(`</svg>카카오로 계속하기</button></form>${NOTE}`), "B 시작 화면: 돌아갈 곳 + ‘카카오로 계속하기’ + 안내 한 줄");
  ok(!start.html.includes('name="consent"') && !start.html.includes("consentRow") && start.html.includes("#abStartCard .termsNote{"), "B 시작 화면에 동의 칸이 없고 안내 한 줄 CSS 가 있다");
  ok(!/무료/.test(start.html), "B 시작 화면에 ‘무료’ 가 없다");

  const landing = await go(fx, new Jar(), "/", { ua: CHROME });
  const band = landing.html.match(/<section class="pubBand"[\s\S]*?<\/section>/)?.[0] || "";
  ok(band.includes('<form class="kakaoStart" method="get" action="/auth/kakao/start"><button class="kakaoBtn" type="submit">') && band.includes(`</form>${NOTE}`) && !band.includes('name="consent"'), "B 공개 첫 화면 카카오 띠도 단추 + 안내 한 줄");
  ok(landing.html.includes(".pubBand .termsNote{margin:8px 0 0;color:#5f6b7a;font-size:12.5px;line-height:1.5;text-align:center;overflow-wrap:anywhere}") && !landing.html.includes(".consentRow"), "B 공개 첫 화면 CSS 는 안내 한 줄만 꾸민다");

  const privacy = await go(fx, new Jar(), "/privacy", { ua: CHROME });
  const body = text(privacy.html);
  ok(body.includes("ab_cs: 이용약관 안내 확인 기록을 읽은 결과(가계부 홈의 안내 띠를 띄울지), 14일"), "B 방침 6절 ab_cs 설명이 띠 모델이다");
  ok(body.includes("이번 개정은 카카오 로그인과 가계부 홈에서 이용약관 동의를 체크하던 칸을 ‘이용하면 이용약관에 동의한 것으로 봅니다’ 안내 줄로 바꾸고 6절의 쿠키 설명을 그에 맞춘 것이어서, 처리하는 개인정보 항목과 목적이 그대로인 이용자에게 불리하지 않은 변경입니다"), "B 방침 12절이 이번 개정의 성격(불리하지 않은 변경)을 적는다");
  ok(body.includes(`이 개정 방침은 ${label(NOTICE)}에 알리고 같은 날부터 시행합니다`) && privacy.html.includes(`개정 공고 ${label(NOTICE)} · 개정 시행 ${label(REVISION)}`), "B 방침 머리와 12절의 공고일·시행일");
  ok(body.includes("서비스 이용 계약을 지키는 데 필요한 처리(개인정보 보호법 제15조제1항제4호)라서 따로 동의를 받지 않습니다"), "B 방침 9절의 계약 이행 근거(동의 대상 아님)는 그대로다");
  const terms = await go(fx, new Jar(), "/terms", { ua: CHROME });
  const second = text(terms.html.slice(terms.html.indexOf('id="section-2"'), terms.html.indexOf('id="section-3"')));
  ok(second.includes("로그인 이름으로 새 계정을 만들 때는 이용약관 동의 칸을 체크합니다. 카카오 로그인과 카카오톡에서 여는 가계부는 서비스를 이용하면 이용약관에 동의한 것으로 보며, 로그인 화면과 가계부 홈의 안내 줄에서 이용약관과 개인정보처리방침을 볼 수 있습니다."), "B 약관 2절: 가입 동의 칸 + 카카오 이용 간주 안내");
  ok(terms.html.includes(`개정 공고 ${label(NOTICE)} · 개정 시행 ${label(REVISION)}`), "B 약관 머리의 공고일·시행일");
});

// ── C. 카카오 시작·콜백 ────────────────────────────────────────────────────────
await scene(async (fx, server) => {
  const plain = await go(fx, new Jar(), `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}`, { ua: INAPP });
  const authorize = new URL(plain.location || `${BASE}/`);
  ok(plain.status === 303 && authorize.origin === "https://kauth.kakao.com" && authorize.pathname === "/oauth/authorize" && !authorize.searchParams.has("prompt"), `C 동의 칸 없는 보통 로그인은 바로 카카오 인가로 간다(prompt 없음) (${plain.status})`);
  const state = await stateOf(fx, plain.location);
  ok(state?.mode === "login" && state.next === APP_NOV && state.consent === undefined && state.auto === undefined, `C 서명된 상태에 consent 가 없다 ${JSON.stringify(state)}`);
  ok((await go(fx, new Jar(), "/auth/kakao/start", { ua: CHROME })).status === 303, "C 바깥 브라우저도 303");
  const legacy = await go(fx, new Jar(), "/auth/kakao/start?consent=1", { ua: CHROME });
  ok(legacy.status === 303 && (await stateOf(fx, legacy.location))?.consent === undefined, "C 옛 consent=1 이 붙어 와도 읽지 않는다");
  ok(!events("kakao_login_consent_missing").length, "C kakao_login_consent_missing 이벤트는 더 없다");

  // 새 계정(인앱, 화면 있는 로그인): 계정 + ‘내 가계부’ + 기록(via kakao) + ab_cs=1 → 홈에 띠 없음.
  const users = fx.db.users.length;
  const jar = new Jar();
  const fresh = await kakaoLogin(fx, jar, server, "7701", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}` });
  eq(fresh.callback.location, APP_NOV, "C 새 카카오 사용자는 동의 칸 없이 로그인되어 돌아갈 곳(홈)으로 간다");
  const created = userByKey(fx, "kakao_login:7701");
  ok(created && jar.user() === created.id && fx.db.users.length === users + 1, "C 새 계정 하나에 세션이 붙는다");
  ok(ownedHouseholds(fx, created?.id).length === 1 && ownedHouseholds(fx, created?.id)[0].name === "내 가계부", "C ‘내 가계부’ 하나를 만든다(V22.9.104 L-1 그대로)");
  const record = consentRecord(fx, created?.id);
  ok(record?.via === "kakao" && record.version === REVISION && !("age14" in record), `C 안내 확인 기록(via kakao, 개정일) ${JSON.stringify(record)}`);
  eq(cookieLine(fresh.callback.cookies, "ab_cs"), CS_ON, "C ab_cs=1");
  const home = await go(fx, jar, APP_NOV, { ua: INAPP });
  ok(home.status === 200 && !home.html.includes("abTermsBand") && !home.html.includes("abConsentPop") && home.html.includes("내 가계부"), "C 홈이 바로 나오고 띠·팝업이 없다");

  // 바깥 브라우저의 새 계정: 첫 가계부 화면(P2-2) + 기록.
  const chromeJar = new Jar();
  const chrome = await kakaoLogin(fx, chromeJar, server, "7702", { ua: CHROME });
  const chromeUser = userByKey(fx, "kakao_login:7702");
  ok(chrome.callback.location === "/my/households?first=1#create" && chromeUser && consentRecord(fx, chromeUser.id)?.via === "kakao" && cookieLine(chrome.callback.cookies, "ab_cs") === CS_ON, "C 인앱이 아닌 새 계정은 첫 가계부 화면으로 가고 기록·ab_cs=1 은 같다");

  // 기록 없던 기존 계정(user-bin): 화면 있는 로그인이면 기록한다. 자동 로그인은 기록하지 않는다(ab_cs=0 → 띠).
  ok(!consentRecord(fx, "user-bin"), "C 준비: 픽스처 사용자에게 기록이 없다");
  const existing = await kakaoLogin(fx, new Jar(), server, "2265", { start: `/auth/kakao/start?return_to=${encodeURIComponent(HOME)}` });
  ok(existing.callback.location === HOME && consentRecord(fx, "user-bin")?.via === "kakao" && cookieLine(existing.callback.cookies, "ab_cs") === CS_ON, "C 기록 없던 기존 계정도 화면 있는 로그인이면 기록(via kakao)·ab_cs=1");
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "consent:user-bin");
  const autoJar = new Jar();
  const auto = await kakaoLogin(fx, autoJar, server, "2265", { start: `/auth/kakao/start?auto=1&return_to=${encodeURIComponent(HOME)}` });
  ok(auto.authorize.searchParams.get("prompt") === "none" && auto.callback.location === HOME && autoJar.user() === "user-bin", "C 자동 로그인(prompt=none)은 가계부가 있는 계정을 들인다");
  ok(cookieLine(auto.callback.cookies, "ab_cs") === CS_OFF && !consentRecord(fx, "user-bin"), "C 자동 로그인은 기록하지 않는다(ab_cs=0)");
  const autoHome = await go(fx, autoJar, HOME, { ua: INAPP });
  ok(autoHome.status === 200 && autoHome.html.includes(BAND_OPEN), "C 그 홈 맨 위에 약관 안내 띠");

  // 카카오 취소: 시작 화면(알림) + 계정 없음.
  const cancelJar = new Jar();
  const cancelled = await kakaoLogin(fx, cancelJar, server, "7799", { start: `/auth/kakao/start?return_to=${encodeURIComponent(APP_NOV)}`, kakaoAnswer: "access_denied" });
  ok(cancelled.callback.status < 500 && cancelled.callback.html.includes('id="abKakaoStart"') && cancelled.callback.html.includes('role="alert"') && !cancelJar.has("ab_user") && !userByKey(fx, "kakao_login:7799"), "C 카카오를 취소하면 시작 화면(알림)으로 돌아오고 계정을 만들지 않는다");
});

// ── D. 홈 띠 · POST /my/consent ──────────────────────────────────────────────
await scene(async (fx) => {
  const off = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), HOME, { ua: CHROME });
  ok(off.status === 200 && off.html.includes(BAND_OPEN) && off.html.includes(BAND_TEXT), "D ab_cs=0 홈 맨 위에 띠");
  ok(off.html.includes(`<form method="post" action="/my/consent"><input type="hidden" name="return_to" value="${HOME.replace("&", "&amp;")}"/><button class="secondary" type="submit" aria-label="이용약관 안내 확인하고 닫기">확인</button></form></div>`), "D ‘확인’ 폼(돌아갈 곳 = 지금 홈 주소)");
  const bandAt = off.html.indexOf('id="abTermsBand"');
  ok(bandAt > off.html.indexOf("<body") && bandAt < off.html.indexOf("<main") && off.html.split('class="abTermsBand"').length === 2, "D 띠는 본문 앞에 한 번");
  ok(!off.html.includes("abConsentPop") && !off.html.includes('name="consent"') && !off.html.includes("동의하고 계속"), "D 동의 팝업·체크 칸·‘동의하고 계속’ 이 없다");
  const stripped = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), `${HOME}&msg=saved&saved_rid=r1&undo=t1&quick=1`, { ua: CHROME });
  ok(stripped.html.includes(`name="return_to" value="${HOME.replace("&", "&amp;")}"/>`), "D 돌아갈 곳에서 알림 값(msg·saved_rid·undo·quick)을 뺀다");
  const mobile = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/m?month=2026-07&household_id=house-home", { ua: CHROME });
  ok(mobile.html.includes(BAND_OPEN) && mobile.html.includes('name="return_to" value="/app?month=2026-07&amp;household_id=house-home"/>'), "D /m 의 띠는 /app 으로 돌아간다");
  const missing = await go(fx, new Jar(fx.cookie), HOME, { ua: CHROME });
  const on = await go(fx, new Jar(`${fx.cookie}; ab_cs=1`), HOME, { ua: CHROME });
  const odd = await go(fx, new Jar(`${fx.cookie}; ab_cs=yes`), HOME, { ua: CHROME });
  ok(!missing.html.includes("abTermsBand") && !on.html.includes("abTermsBand") && !odd.html.includes("abTermsBand"), "D ab_cs 없음(모름)·1·다른 값이면 띠 없음");
  eq(on.html.length, missing.html.length, "D 띠 없는 홈 HTML 은 한 바이트도 늘지 않는다");
  const admin = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), HOME, { ua: CHROME, headers: { authorization: `Bearer ${fx.env.ADMIN_API_TOKEN}` } });
  ok(admin.status === 200 && !admin.html.includes("abTermsBand"), "D 관리자 세션에는 띠 없음");

  const anonymous = await go(fx, new Jar(), "/my/consent", { method: "POST", form: { return_to: HOME } });
  ok(anonymous.status === 303 && anonymous.location === "/my" && !consentRecord(fx, "user-bin"), "D 세션 없는 ‘확인’ 은 /my, 기록 없음");
  const cross = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { return_to: HOME }, origin: "https://evil.example" });
  ok(cross.status === 403 && !consentRecord(fx, "user-bin") && !cookieLine(cross.cookies, "ab_cs"), "D 다른 사이트의 ‘확인’ 은 403");
  const jar = new Jar(`${fx.cookie}; ab_cs=0`);
  const accepted = await go(fx, jar, "/my/consent", { method: "POST", form: { return_to: HOME } });
  ok(accepted.status === 303 && accepted.location === HOME && cookieLine(accepted.cookies, "ab_cs") === CS_ON, "D ‘확인’ 은 체크 칸 없이 303 + ab_cs=1(14일)");
  const record = consentRecord(fx, "user-bin");
  ok(record?.via === "band" && record.version === REVISION && !("age14" in record) && Number.isFinite(Date.parse(record.at)), `D 기록 consent:user-bin(via band) ${JSON.stringify(record)}`);
  ok(events("terms_notice_closed").some((event) => event.severity === "info" && event.detail === "recorded" && event.path === "/my/consent"), "D 운영 이벤트 terms_notice_closed(info, recorded)");
  ok((await go(fx, jar, HOME, { ua: CHROME })).html.includes("abTermsBand") === false, "D 돌아간 홈에 띠 없음");
  const firstAt = record?.at;
  const again = await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { return_to: HOME, consent: "1" } });
  ok(again.status === 303 && consentRecord(fx, "user-bin")?.at === firstAt && cookieLine(again.cookies, "ab_cs") === CS_ON && events("terms_notice_closed").some((event) => event.detail === "already"), "D 기록이 있으면 다시 쓰지 않고(already) 쿠키만 맞춘다");
  fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "consent:user-bin");
  const writeRestore = consentWriteFails();
  let refused;
  try { refused = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/my/consent", { method: "POST", form: { return_to: HOME } }); } finally { writeRestore(); }
  ok(refused.status === 303 && cookieLine(refused.cookies, "ab_cs") === CS_ON && !consentRecord(fx, "user-bin"), "D 저장 실패도 띠는 닫힌다(303·ab_cs=1, 기록 없음 → 다음 세션에 다시)");
  ok(events("terms_notice_closed").some((event) => event.severity === "warn" && event.detail === "unrecorded") && events("consent_record_failed").some((event) => event.path === "/my/consent" && event.method === "POST"), "D 저장 실패 이벤트 unrecorded(warn) + consent_record_failed");
  const readRestore = consentReadFails(fx, "user-bin");
  let unread;
  try { unread = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/my/consent", { method: "POST", form: { return_to: HOME } }); } finally { readRestore(); }
  ok(unread.status === 303 && cookieLine(unread.cookies, "ab_cs") === CS_ON && !consentRecord(fx, "user-bin") && events("terms_notice_closed").some((event) => event.detail === "unread"), "D 읽기 실패는 쓰지 않고(unread) 띠만 닫는다");
  for (const [raw, name] of [["https://evil.example/x", "바깥 주소"], ["//evil.example/x", "//"], ["/my/consent", "/my/consent"], ["/support", "허용 목록 밖"], ["", "빈 값"]]) {
    eq((await go(fx, new Jar(fx.cookie), "/my/consent", { method: "POST", form: { return_to: raw } })).location, "/app", `D return_to ${name} → /app`);
  }
  const logout = await go(fx, new Jar(`${fx.cookie}; ab_cs=0`), "/my/logout", { method: "POST", form: {} });
  ok(logout.status === 303 && logout.cookies.some((line) => line.startsWith("ab_cs=;")), "D 로그아웃은 ab_cs 를 지운다");
});

// ── E. 로그인 이름 가입의 동의 칸은 그대로 ─────────────────────────────────────────
await scene(async (fx) => {
  const form = { login_name: "Notice Family", display_name: "안내 사용자", access_code: "safe-password-2026", access_code_confirm: "safe-password-2026" };
  const users = fx.db.users.length;
  const missing = await go(fx, new Jar(), "/my/local-signup", { method: "POST", form });
  ok(missing.status === 400 && missing.html.includes(SIGNUP_MESSAGE) && fx.db.users.length === users, "E 동의 칸 없는 가입은 400(계정 없음)");
  const jar = new Jar();
  const done = await go(fx, jar, "/my/local-signup", { method: "POST", form: { ...form, consent: "1" } });
  ok(done.status === 303 && jar.user() && consentRecord(fx, jar.user())?.via === "local" && cookieLine(done.cookies, "ab_cs") === CS_ON, "E 동의하고 가입하면 303 + 기록(via local) + ab_cs=1");
});

// 판 단일 출처
{
  const versionTxt = read("VERSION.txt").trim();
  const appVersion = (read("src/index.js").match(/const APP_VERSION = "([^"]+)"/) || [])[1];
  ok(versionTxt === appVersion, `VERSION.txt 와 번들 APP_VERSION 이 같다 (${appVersion})`);
}

t.done();
