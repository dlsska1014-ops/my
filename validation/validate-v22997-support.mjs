#!/usr/bin/env node
// V22.9.97 후원 검사 — 후원 진입점 3곳·경유 주소 /support/go/<kind>·일별 집계 support_stats:<KST 날짜>·/internal/ops-usage 의 support 칸.
//   1. 진입점: 로그인 홈(/app 홈 탭 아래 한 줄)·데스크톱 사이드바 아래쪽(사용자 화면만)·화면 설정 패널(후원자가 아닐 때만)에 /support 링크가 하나씩,
//      조작 높이 44px, 홈 HTML 35 KiB 예산. 후원자에게는 기존 포인트 색 선택지와 고마움 문구. 로그인 전 화면(/my·/my/kakao-claim·/admin-view)·관리자 화면에는 없다.
//   2. /support/go/<kind>: 변수가 있으면 302(Location = 변수 값, no-store·no-referrer·noindex, 쿠키 없음), 없거나 http(s) 가 아니거나 모르는 종류면 404 안내.
//      후원자 방(supporter-openchat)은 지금 켜진 후원자 세션에만 302. /support 의 송금·오픈채팅 링크는 경유 주소이고 원래 주소는 싣지 않는다.
//   3. 집계: 하루 한 줄(support_stats:<KST 날짜>)에 더한다. 방문은 /support 화면이 실제로 보일 때 보내는 신호(POST /support/visit)로 세고 GET /support 는
//      아무것도 쓰지 않는다(미리 렌더링은 열릴 때 한 번 — 스크립트를 가짜 문서에서 돌려 본다). 클릭은 경유 302. 읽기·올리기 요청 모양, 사용자 id 없음,
//      봇·미리 받기·화면 이동 아님(경유)·같은 출처 아님(신호)·UA 없음·HEAD·관리자 세션은 세지 않음, 응답은 집계를 기다리지 않음(waitUntil),
//      DB 읽기·쓰기 실패에도 응답 그대로, 한국 날짜 경계, 저장된 틀린 값 정리.
//   4. /internal/ops-usage: support 칸(30일 합계·켜진 후원자 수·as_of) 모양과 합산, 추가 읽기 2번·쓰기 없음, 읽기 실패면 칸을 뺀다(0 이 아님),
//      예약 실행 머리 경로에도 있다, 관제 1.6.0 의 계약 검사(sanitizeUsage)가 그대로 받는다, 토큰이 틀리면 읽지 않는다.
//   5. 집계 키는 한 모듈만 다루고, 사이트맵에 경유 주소가 없다.
// 관제 쪽(저장·‘후원(대략, 30일)’ 줄·옛 앱 ‘-’)은 monitoring/test-d1.mjs 가 본다.
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음. 장면 시계는 2026-07-15(KST) 로 고정한다.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import { app, BASE, failure, fixture, intercept, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";
import { sanitizeUsage } from "../monitoring/model.mjs";

let checks = 0;
const failures = [];
const show = (value) => { try { return String(JSON.stringify(value)).slice(0, 260); } catch (_) { return String(value).slice(0, 260); } };
function ok(cond, msg) { checks += 1; if (!cond) failures.push(msg); }
function eq(actual, expected, msg) { checks += 1; if (!isDeepStrictEqual(actual, expected)) failures.push(`${msg} — 실제 ${show(actual)} · 기대 ${show(expected)}`); }
async function section(name, task) {
  try { await task(); } catch (error) {
    checks += 1;
    failures.push(`${name}: 구간이 끝까지 돌지 못했다 — ${String(error?.stack || error).split("\n").slice(0, 3).join(" ").slice(0, 320)}`);
  }
}
const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");

const TODAY = "2026-07-15";
const KEY = `support_stats:${TODAY}`;
const HUMAN = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";
const VARS = Object.freeze({
  SUPPORT_KAKAOPAY_URL: "https://qr.kakaopay.com/qa-v22997-kakaopay",
  SUPPORT_BANK_ACCOUNT: "QA은행 000-00-0000000 도담 네트워크",
  SUPPORT_TOSS_URL: "https://toss.me/qa-v22997-toss",
  COMMUNITY_OPENCHAT_URL: "https://open.kakao.com/o/qaV22997Community",
  SUPPORTER_OPENCHAT_URL: "https://open.kakao.com/o/qaV22997Supporters",
});
const ZERO = Object.freeze({ kakaopay: 0, toss: 0, openchat: 0, supporter_openchat: 0 });
const SAMPLE = JSON.parse(read("./usage-summary-sample-v22982.json"));
const OPS_TOKEN = "qa-v22997-ops-token";
const ADMIN_PASSWORD = "qa-v22997-support-admin";
const H = "household_id=house-home&month=2026-07";
const flag = (since, until = null) => JSON.stringify({ since, until, note: "QA", public_name: null });

function setVars(fx, vars) {
  for (const name of Object.keys(VARS)) delete fx.env[name];
  Object.assign(fx.env, vars);
}
const clearStats = (fx) => { fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !String(row.key).startsWith("support_stats:")); };
const dropSetting = (fx, key) => { fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== key); };
const stat = (fx, key = KEY) => { const value = settingValue(fx, key); return typeof value === "string" ? JSON.parse(value) : value ?? null; };

// 화면 하나를 연다(값이 undefined 인 머리는 보내지 않는다). waitUntil 로 넘긴 일은 끝까지 기다린 뒤 돌려준다(집계가 끝난 상태를 본다).
async function open(fx, path, { method = "GET", cookie = "", ua = HUMAN, headers = {} } = {}) {
  const pending = [];
  const context = { waitUntil(task) { pending.push(task); }, passThroughOnException() {} };
  const sent = Object.entries({ accept: "text/html", ...(ua ? { "user-agent": ua } : {}), ...(cookie ? { cookie } : {}), ...headers }).filter(([, value]) => value !== undefined);
  const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: Object.fromEntries(sent) }), fx.env, context);
  const html = await response.text();
  await Promise.allSettled(pending);
  return { status: response.status, headers: response.headers, location: response.headers.get("location") || "", html };
}
// Supabase 로 가는 요청을 적는다. handler 가 Response 를 돌려주면 그 응답을 쓴다(나머지는 픽스처가 받는다).
async function withDb(task, handler = null) {
  const log = [];
  const restore = intercept(async (request) => {
    const { url, method, init } = request;
    if (url.hostname.endsWith("supabase.co")) {
      const path = `${url.pathname}${url.search}`;
      log.push({ method, path, decoded: decodeURIComponent(path), prefer: new Headers(init?.headers || {}).get("prefer") || "", body: typeof init?.body === "string" ? init.body : "" });
    }
    return handler ? handler(request) : null;
  });
  try { return { result: await task(), log }; } finally { restore(); }
}
const statReads = (log) => log.filter((row) => row.method === "GET" && row.decoded.includes("support_stats"));
const statWrites = (log) => log.filter((row) => row.method === "POST" && row.body.includes("support_stats:"));
async function captureWarn(task) {
  const lines = [];
  const previous = console.warn;
  console.warn = (...args) => { lines.push(args.map(String).join(" ")); };
  try { return { result: await task(), lines }; } finally { console.warn = previous; }
}

await withClock(TODAY, () => fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "qa-v22997-support-session";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/admin/supporters" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "0 관리자 로그인 쿠키를 받는다(검사 준비)");

  // ── 1. 진입점 3곳 ───────────────────────────────────────────────────────
  await section("1 진입점", async () => {
    setVars(fx, {});
    const home = await open(fx, `/app?${H}`, { cookie: fx.cookie, ua: "Mozilla/5.0 (iPhone)" });
    const homeLines = home.html.match(/<p class="abHomeSupport"[^>]*><a href="\/support"[^>]*>후원하기 — 운영 비용 함께 나누기<\/a><\/p>/g) || [];
    ok(home.status === 200 && homeLines.length === 1, `1-a 로그인 홈(/app 홈 탭) 아래쪽에 ‘후원하기 — 운영 비용 함께 나누기’ 한 줄이 하나 있다: ${home.status} · ${homeLines.length}`);
    const navLinks = home.html.match(/<a class="abNavSupport" href="\/support"[^>]*>후원하기<\/a>/g) || [];
    const footer = home.html.slice(home.html.indexOf('<div class="abNavFooter">'));
    ok(navLinks.length === 1 && home.html.includes('<div class="abNavFooter">') && footer.includes('class="abNavSupport"'), `1-b 데스크톱 셸 사이드바 아래쪽(abNavFooter)에 ‘후원하기’ 링크가 하나 있다: ${navLinks.length}`);
    ok(Buffer.byteLength(home.html) < 35 * 1024, `1-c 홈 HTML 이 35 KiB 예산 안이다 (${Buffer.byteLength(home.html)} B)`);
    const menu = await open(fx, `/menu?${H}`, { cookie: fx.cookie });
    const invites = menu.html.match(/<p class="abAppearanceStatus" data-ab-support-invite[^>]*>후원자에게는 포인트 색 3가지를 더 드려요\. <a href="\/support"[^>]*>후원하기 — 운영 비용 함께 나누기<\/a><\/p>/g) || [];
    ok(menu.status === 200 && invites.length === 1 && !menu.html.includes("data-ab-accent-choice"), `1-d 화면 설정 패널: 후원자가 아니면 포인트 색 안내 옆에 ‘후원하기’ 링크 한 줄(선택지 없음): ${invites.length}`);
    ok([homeLines[0], navLinks[0], invites[0]].every((html) => String(html || "").includes("min-height:44px")), "1-e 새 링크 셋은 조작 높이 44px 이다");
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const supporterMenu = await open(fx, `/menu?${H}`, { cookie: fx.cookie });
    dropSetting(fx, "supporter:user-bin");
    ok(!supporterMenu.html.includes("data-ab-support-invite") && supporterMenu.html.includes("data-ab-accent-choice") && supporterMenu.html.includes("후원해 주셔서 고마워요"),
      "1-f 후원자에게는 안내 링크 대신 기존 포인트 색 선택지와 ‘후원해 주셔서 고마워요’ 문구");
    const signedOut = [];
    for (const path of ["/my", "/my/kakao-claim", "/admin-view"]) {
      const page = await open(fx, path);
      signedOut.push({ path, status: page.status, support: page.html.includes("/support"), word: page.html.includes("후원") });
    }
    ok(signedOut.every((row) => row.status === 200 && !row.support && !row.word), `1-g 로그인 전 화면(/my 로그인·가입·/my/kakao-claim·관리자 비밀번호 /admin-view)에는 후원 링크·문구가 없다: ${show(signedOut)}`);
    const adminPage = await open(fx, "/admin/supporters", { cookie: admin });
    ok(adminPage.status === 200 && !adminPage.html.includes("abNavSupport") && !adminPage.html.includes("abHomeSupport"), `1-h 관리자 화면 사이드바에는 ‘후원하기’ 링크를 더하지 않는다: ${adminPage.status}`);
  });

  // ── 2. 경유 주소 /support/go/<kind> ─────────────────────────────────────
  await section("2 경유 주소", async () => {
    setVars(fx, {});
    clearStats(fx);
    const missing = [];
    for (const kind of ["kakaopay", "toss", "openchat", "supporter-openchat"]) {
      const page = await open(fx, `/support/go/${kind}`);
      if (!(page.status === 404 && page.html.includes("후원 링크를 찾을 수 없어요") && page.html.includes('href="/support"') && /noindex/.test(page.headers.get("x-robots-tag") || ""))) missing.push(`${kind}:${page.status}`);
    }
    ok(missing.length === 0, `2-a 변수가 없으면 네 종류 모두 404 안내(후원 안내로 돌아가기, noindex): ${missing.join(", ")}`);
    eq(stat(fx), null, "2-b 404 는 세지 않는다");
    setVars(fx, VARS);
    const kakao = await open(fx, "/support/go/kakaopay");
    ok(kakao.status === 302 && kakao.location === VARS.SUPPORT_KAKAOPAY_URL && kakao.headers.get("cache-control") === "no-store" && kakao.headers.get("referrer-policy") === "no-referrer"
      && /noindex/.test(kakao.headers.get("x-robots-tag") || "") && !kakao.headers.get("set-cookie") && kakao.html === "",
      `2-c 변수가 있으면 302(Location = 변수 값, no-store·no-referrer·noindex, 쿠키·몸 없음): ${kakao.status} ${kakao.location}`);
    const toss = await open(fx, "/support/go/toss");
    const chat = await open(fx, "/support/go/openchat");
    const slash = await open(fx, "/support/go/kakaopay/");
    eq([toss.status, toss.location, chat.status, chat.location, slash.status, slash.location], [302, VARS.SUPPORT_TOSS_URL, 302, VARS.COMMUNITY_OPENCHAT_URL, 302, VARS.SUPPORT_KAKAOPAY_URL],
      "2-d 토스·소통 오픈채팅도 변수 주소로 302(끝의 / 하나는 같은 주소)");
    setVars(fx, { ...VARS, SUPPORT_KAKAOPAY_URL: "javascript:alert(1)", SUPPORT_TOSS_URL: "ftp://toss.example/qa", COMMUNITY_OPENCHAT_URL: "open.kakao.com/o/qaNoScheme" });
    const notHttp = [];
    for (const kind of ["kakaopay", "toss", "openchat"]) notHttp.push(await open(fx, `/support/go/${kind}`));
    ok(notHttp.every((page) => page.status === 404 && !page.location), `2-e http(s) 가 아닌 변수 값은 404: ${notHttp.map((page) => page.status).join(",")}`);
    setVars(fx, VARS);
    const unknown = [];
    for (const kind of ["bank", "KAKAOPAY", "kakao", "supporter_openchat", ""]) unknown.push(await open(fx, `/support/go/${kind}`));
    ok(unknown.every((page) => page.status === 404 && !page.location), `2-f 모르는 종류(계좌 bank 포함 — 계좌는 글자라 경유하지 않는다)는 404: ${unknown.map((page) => page.status).join(",")}`);
    const posted = await open(fx, "/support/go/kakaopay", { method: "POST" });
    ok(posted.status !== 302 && !posted.location, `2-g GET·HEAD 밖(POST)은 경유하지 않는다: ${posted.status}`);
    const head = await open(fx, "/support/go/kakaopay", { method: "HEAD" });
    ok(head.status === 302 && head.location === VARS.SUPPORT_KAKAOPAY_URL && head.html === "", `2-h HEAD 는 몸 없이 302: ${head.status}`);
    const anon = await open(fx, "/support/go/supporter-openchat");
    const plain = await open(fx, "/support/go/supporter-openchat", { cookie: fx.cookie });
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const member = await open(fx, "/support/go/supporter-openchat", { cookie: fx.cookie });
    putSetting(fx, "supporter:user-bin", flag("2026-06-01", "2026-07-10"));
    const ended = await open(fx, "/support/go/supporter-openchat", { cookie: fx.cookie });
    dropSetting(fx, "supporter:user-bin");
    eq([anon.status, plain.status, member.status, member.location, ended.status], [404, 404, 302, VARS.SUPPORTER_OPENCHAT_URL, 404],
      "2-i 후원자 방 경유는 지금 켜진 후원자 세션에만 302(로그인 전·후원자 아님·끝난 후원은 다른 ‘없음’ 과 같은 404)");
    ok([anon, plain, ended].every((page) => !page.html.includes(VARS.SUPPORTER_OPENCHAT_URL) && !page.location), "2-j 404 안내에 후원자 방 주소가 없다");
    const support = await open(fx, "/support", { ua: "" });
    ok(support.status === 200 && ["/support/go/kakaopay", "/support/go/toss", "/support/go/openchat"].every((path) => support.html.includes(`href="${path}"`))
      && Object.entries(VARS).filter(([name]) => name !== "SUPPORT_BANK_ACCOUNT").every(([, value]) => !support.html.includes(value)) && support.html.includes("QA은행"),
      "2-k /support 의 송금·오픈채팅 링크는 경유 주소이고 원래 주소는 싣지 않는다(계좌 줄은 그대로)");
  });

  // ── 3. 집계 support_stats:<KST 날짜> ────────────────────────────────────
  await section("3 집계", async () => {
    setVars(fx, VARS);
    clearStats(fx);
    // 방문은 /support 화면이 실제로 보일 때 그 화면의 스크립트가 보내는 신호(POST /support/visit, sendBeacon 꼴 머리)로 센다.
    // GET /support 에서 세면 미리 렌더링(conservative, 누르기 시작할 때)으로 열린 방문이 빠지고 ‘GET 무변경’ 약속(validate-speculation-rules-v2297)이 깨진다.
    const beacon = (options = {}) => open(fx, "/support/visit", { ...options, method: options.method || "POST",
      headers: { origin: BASE, "sec-fetch-site": "same-origin", "sec-fetch-mode": "no-cors", "sec-fetch-dest": "empty", ...(options.headers || {}) } });
    const view = await withDb(() => open(fx, "/support", { headers: { "sec-fetch-mode": "navigate" } }));
    const scripts = view.result.html.match(/<script>[^<]*sendBeacon[^<]*<\/script>/g) || [];
    ok(view.result.status === 200 && statReads(view.log).length === 0 && statWrites(view.log).length === 0 && scripts.length === 1,
      `3-a /support GET 은 집계를 읽지도 쓰지도 않고 방문 신호 스크립트 하나를 싣는다: ${scripts.length} · ${show(view.log.map((row) => `${row.method} ${row.decoded}`))}`);
    // 스크립트를 가짜 문서에서 돌린다: 보통 열림이면 바로 한 번, 미리 렌더링이면 보내지 않다가 실제로 열릴 때(prerenderingchange) 한 번.
    const runVisitScript = (prerendering) => {
      const sent = [];
      const listeners = [];
      const document = { prerendering, addEventListener: (type, fn, options) => listeners.push({ type, fn, once: options?.once === true }) };
      vm.runInNewContext(String(scripts[0] || "").replace(/^<script>|<\/script>$/g, ""), { document, navigator: { sendBeacon: (path) => { sent.push(path); return true; } } });
      return { sent, listeners };
    };
    const normal = runVisitScript(false);
    const prerendered = runVisitScript(true);
    const beforeActivation = prerendered.sent.length;
    for (const listener of prerendered.listeners.filter((item) => item.type === "prerenderingchange")) listener.fn();
    eq([normal.sent, beforeActivation, prerendered.sent, prerendered.listeners.map((item) => `${item.type}:${item.once}`)], [["/support/visit"], 0, ["/support/visit"], ["prerenderingchange:true"]],
      "3-b 방문 신호 스크립트: 보통 열림이면 바로 한 번, 미리 렌더링이면 보내지 않다가 실제로 열릴 때 한 번");
    const first = await withDb(() => beacon());
    const reads = statReads(first.log);
    const writes = statWrites(first.log);
    ok(first.result.status === 204 && first.result.html === "" && first.result.headers.get("cache-control") === "no-store"
      && reads.length === 1 && reads[0].decoded.includes(`key=eq.${KEY}`) && reads[0].decoded.includes("limit=1")
      && writes.length === 1 && writes[0].path === "/rest/v1/accountbook_settings?on_conflict=key" && writes[0].prefer.includes("resolution=merge-duplicates"),
      `3-c 방문 신호: 204(몸·캐시 없음), 그날 줄을 한 번 읽고 설정 표에 한 번 올린다(upsert merge-duplicates): ${first.result.status} · ${show(first.log.map((row) => `${row.method} ${row.decoded}`))}`);
    eq(writes[0]?.body, JSON.stringify([{ key: KEY, value: { visits: 1, clicks: ZERO } }]), "3-d 올리는 본문은 그날 키와 수뿐이다(사용자 id·IP·UA 없음)");
    const signedIn = await withDb(() => beacon({ cookie: fx.cookie, headers: { "sec-fetch-site": undefined } }));
    ok(signedIn.result.status === 204 && statWrites(signedIn.log).length === 1 && !statWrites(signedIn.log)[0].body.includes("user-bin") && stat(fx)?.visits === 2,
      "3-e 로그인한 방문(Sec-Fetch-Site 머리 없는 옛 브라우저 꼴)도 세고 사용자 id 는 적지 않는다");
    for (const kind of ["kakaopay", "toss", "openchat"]) await open(fx, `/support/go/${kind}`);
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    await open(fx, "/support/go/supporter-openchat", { cookie: fx.cookie });
    dropSetting(fx, "supporter:user-bin");
    eq([fx.db.accountbook_settings.filter((row) => String(row.key).startsWith("support_stats:")).length, stat(fx)], [1, { visits: 2, clicks: { kakaopay: 1, toss: 1, openchat: 1, supporter_openchat: 1 } }],
      "3-f 경유 302 마다 그 종류 클릭 +1, 하루 한 줄");
    const before = JSON.stringify(stat(fx));
    const untouched = async (runs) => {
      const { result: statuses, log } = await withDb(async () => { const out = []; for (const run of runs) out.push((await run()).status); return out; });
      return statuses.every((status) => [200, 204, 302].includes(status)) && statReads(log).length === 0 && statWrites(log).length === 0 && JSON.stringify(stat(fx)) === before;
    };
    const bots = [
      "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)", "Mozilla/5.0 (compatible; Yeti/1.1; +http://naver.me/spd)",
      "Mozilla/5.0 (compatible; Daum/4.1; +http://cs.daum.net/faq/15/4118.html?faqId=28966)", "kakaotalk-scrap/1.0; +https://devtalk.kakao.com/",
      "facebookexternalhit/1.1", "Mozilla/5.0 (Linux; Android 11) Chrome-Lighthouse", "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0.0.0 Safari/537.36",
    ];
    ok(await untouched(bots.flatMap((ua) => [() => beacon({ ua }), () => open(fx, "/support/go/toss", { ua })])),
      "3-g 봇 UA(구글·네이버 Yeti·다음·카카오톡 미리보기·페이스북·Lighthouse·HeadlessChrome)는 세지 않는다");
    ok(await untouched([{ "sec-purpose": "prefetch" }, { "sec-purpose": "prefetch;prerender" }, { purpose: "prefetch" }]
      .flatMap((headers) => [() => open(fx, "/support", { headers }), () => open(fx, "/support/go/toss", { headers }), () => beacon({ headers })])),
      "3-h 미리 받기·미리 렌더링(Sec-Purpose·Purpose)은 /support·경유 주소·방문 신호 어디서도 세지 않는다");
    ok(await untouched([{ "sec-fetch-mode": "cors" }, { "sec-fetch-mode": "no-cors" }].map((headers) => () => open(fx, "/support/go/kakaopay", { headers }))),
      "3-i 경유 주소는 화면 이동이 아닌 요청(Sec-Fetch-Mode cors·no-cors)을 세지 않는다");
    ok(await untouched([() => beacon({ headers: { "sec-fetch-site": "same-site" } }), () => beacon({ headers: { "sec-fetch-site": "none" } })]),
      "3-j 같은 출처가 아닌 방문 신호(Sec-Fetch-Site same-site·none)는 세지 않는다");
    const crossSite = await withDb(() => beacon({ headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" } }));
    const getVisit = await withDb(() => open(fx, "/support/visit"));
    ok(crossSite.result.status !== 204 && getVisit.result.status === 404 && [...crossSite.log, ...getVisit.log].every((row) => !row.decoded.includes("support_stats")) && JSON.stringify(stat(fx)) === before,
      `3-k 다른 출처의 방문 신호는 라우터(csrfOriginAllowed)가 먼저 막고, 방문 신호 주소의 GET 은 없는 주소다: ${crossSite.result.status} · ${getVisit.result.status}`);
    ok(await untouched([() => beacon({ ua: "" }), () => open(fx, "/support/go/openchat", { ua: "   " })]), "3-l UA 가 없는 요청은 세지 않는다");
    ok(await untouched([() => open(fx, "/support/go/kakaopay", { method: "HEAD" })]), "3-m 경유 주소의 HEAD 는 세지 않는다");
    ok(await untouched([() => beacon({ cookie: admin }), () => open(fx, "/support/go/toss", { cookie: admin })]), "3-n 관리자 세션은 세지 않는다(그날 줄도 읽지 않는다)");

    // 응답은 집계를 기다리지 않는다: 그날 줄 읽기를 붙잡아 둔 채 응답이 먼저 오는지 본다.
    let release = () => {};
    const gate = new Promise((resolve) => { release = resolve; });
    const pending = [];
    const restore = intercept(async ({ url, method }) => { if (method === "GET" && decodeURIComponent(url.search).includes("support_stats")) await gate; return null; });
    try {
      const responding = app.fetch(new Request(`${BASE}/support/go/toss`, { headers: { accept: "text/html", "user-agent": HUMAN } }), fx.env, { waitUntil(task) { pending.push(task); }, passThroughOnException() {} });
      const firstOut = await Promise.race([responding.then((response) => response.status), new Promise((resolve) => setTimeout(() => resolve("timeout"), 3000))]);
      const handed = pending.length;
      release();
      await Promise.allSettled(pending);
      ok(firstOut === 302 && handed >= 1 && stat(fx)?.clicks?.toss === 2, `3-o 응답은 집계를 기다리지 않고(waitUntil 로 넘김) 집계는 그 뒤에 끝난다: ${firstOut} · waitUntil ${handed} · toss ${stat(fx)?.clicks?.toss}`);
    } finally { release(); restore(); }

    const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T15:30:00Z");
    try { await beacon(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previousClock; }
    eq(stat(fx, "support_stats:2026-07-16"), { visits: 1, clicks: ZERO }, "3-p 날짜 키는 한국 날짜다(UTC 15:30 = 다음 날 00:30 KST)");
    putSetting(fx, KEY, { visits: -3, clicks: { kakaopay: 2, toss: "x", openchat: 1.5 }, ip: "203.0.113.7" });
    await open(fx, "/support/go/openchat");
    eq(stat(fx), { visits: 0, clicks: { kakaopay: 2, toss: 0, openchat: 1, supporter_openchat: 0 } }, "3-q 저장된 값의 틀린 수는 0 으로, 모르는 칸(ip)은 버리고 더한다");
    putSetting(fx, KEY, JSON.stringify({ visits: 4, clicks: { toss: 1 } }));
    await beacon();
    eq(stat(fx), { visits: 5, clicks: { ...ZERO, toss: 1 } }, "3-r 글(JSON)로 저장된 값도 읽어 더한다");

    const snapshot = JSON.stringify(stat(fx));
    const readFail = await captureWarn(() => withDb(() => beacon(), ({ url, method }) => (method === "GET" && decodeURIComponent(url.search).includes("support_stats") ? failure(503) : null)));
    ok(readFail.result.result.status === 204 && statWrites(readFail.result.log).length === 0 && JSON.stringify(stat(fx)) === snapshot
      && readFail.lines.some((line) => line.includes('"event":"support_stats_failed"') && line.includes('"field":"visits"')),
      `3-s 그날 줄을 읽지 못하면 응답은 204 그대로, 0 부터 다시 세어 덮지 않고(쓰기 없음) 경고 한 줄: ${show(readFail.lines)}`);
    fx.db.__fail_next_settings_write = true;
    const writeFail = await captureWarn(() => open(fx, "/support/go/kakaopay"));
    ok(writeFail.result.status === 302 && fx.db.__fail_next_settings_write === false && writeFail.lines.some((line) => line.includes('"event":"support_stats_failed"') && line.includes('"field":"kakaopay"')),
      `3-t 올리기에 실패해도 302 그대로이고 경고 한 줄: ${writeFail.result.status} · ${show(writeFail.lines)}`);
  });

  // ── 4. /internal/ops-usage 의 support 칸 ────────────────────────────────
  await section("4 이용 현황 support 칸", async () => {
    clearStats(fx);
    fx.env.OPS_MONITOR_TOKEN = OPS_TOKEN;
    putSetting(fx, "support_stats:2026-07-15", { visits: 3, clicks: { kakaopay: 1, toss: 0, openchat: 2, supporter_openchat: 0 } });
    putSetting(fx, "support_stats:2026-07-01", JSON.stringify({ visits: 2, clicks: { toss: 1 } }));
    putSetting(fx, "support_stats:2026-06-16", { visits: 5, clicks: { kakaopay: 2, supporter_openchat: 1 } }); // 오늘 포함 30일의 첫날
    putSetting(fx, "support_stats:2026-06-15", { visits: 100, clicks: { kakaopay: 100 } }); // 31일 전: 빼기
    putSetting(fx, "support_stats:2026-07-16", { visits: 50 }); // 내일: 빼기
    putSetting(fx, "support_stats:oops", { visits: 70 }); // 날짜가 아닌 키: 빼기
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    putSetting(fx, "supporter:user-wifi", flag("2026-06-01", "2026-07-01")); // 끝남
    putSetting(fx, "supporter:user-qa-today", flag("2026-07-01", TODAY)); // 오늘 끝남: 켜짐
    putSetting(fx, "supporter:user-qa-later", flag("2026-08-01")); // 시작 전
    const expected = { days: 30, visits: 10, clicks: { kakaopay: 3, toss: 1, openchat: 2, supporter_openchat: 1 }, clicks_total: 7, supporters_active: 2, as_of: TODAY };
    const rpc = ({ url }) => (url.pathname === "/rest/v1/rpc/accountbook_usage_summary_v22982" ? new Response(JSON.stringify(SAMPLE), { status: 200, headers: { "content-type": "application/json" } }) : null);
    const usage = (headers = {}, handler = rpc) => withDb(async () => {
      const response = await app.fetch(new Request(`${BASE}/internal/ops-usage`, { headers: { authorization: `Bearer ${OPS_TOKEN}`, ...headers } }), fx.env, { waitUntil() {}, passThroughOnException() {} });
      return { status: response.status, body: await response.json() };
    }, handler);
    const good = await usage();
    eq([good.result.status, good.result.body.ok, good.result.body.usage?.support], [200, true, expected],
      "4-a support 칸: 오늘(KST)까지 30일 합계(31일 전·내일·날짜 아닌 키 제외)·켜진 후원자 수(끝나는 날 당일 포함, 끝남·시작 전 제외)·as_of");
    const settingsGets = good.log.filter((row) => row.path.startsWith("/rest/v1/accountbook_settings"));
    ok(settingsGets.length === 2 && settingsGets.every((row) => row.method === "GET") && good.log.every((row) => row.method === "GET")
      && settingsGets.some((row) => row.decoded.includes("key=like.support_stats:*") && row.decoded.includes("order=key.desc") && row.decoded.includes("limit=31"))
      && settingsGets.some((row) => row.decoded.includes("key=like.supporter:*") && row.decoded.includes("limit=200")),
      `4-b 추가 조회는 설정 표 읽기 2번(그날 줄 31·후원자 200)이고 쓰기는 없다: ${show(good.log.map((row) => `${row.method} ${row.decoded}`))}`);
    eq(sanitizeUsage(good.result.body.usage).support, good.result.body.usage?.support, "4-c 관제 1.6.0 의 계약 검사(sanitizeUsage)가 앱의 support 칸을 그대로 받는다");
    const failStats = await usage({}, (request) => rpc(request) || (request.method === "GET" && decodeURIComponent(request.url.search).includes("support_stats") ? failure(503) : null));
    const failSupporters = await usage({}, (request) => rpc(request) || (request.method === "GET" && decodeURIComponent(request.url.search).includes("like.supporter:") ? failure(503) : null));
    ok([failStats, failSupporters].every(({ result }) => result.status === 200 && result.body.ok === true && result.body.usage && !("support" in result.body.usage)),
      `4-d 후원 집계를 읽지 못하면 support 칸을 빼고(0 이 아님) 이용 현황은 200 그대로: ${show([failStats.result.status, failSupporters.result.status])}`);
    const cron = await usage({ "x-ab-monitor-cron": "1" });
    eq([cron.result.status, cron.result.body.usage?.support], [200, expected], "4-e 예약 실행 머리(x-ab-monitor-cron: 1) 경로에도 같은 support 칸이 있다");
    const denied = await withDb(async () => {
      const response = await app.fetch(new Request(`${BASE}/internal/ops-usage`, { headers: { authorization: "Bearer qa-wrong-token" } }), fx.env, { waitUntil() {}, passThroughOnException() {} });
      return response.status;
    });
    ok(denied.result === 401 && !denied.log.some((row) => row.decoded.includes("support")), `4-f 토큰이 틀리면 401 이고 후원 집계를 읽지 않는다: ${denied.result}`);
    for (const key of ["supporter:user-bin", "supporter:user-wifi", "supporter:user-qa-today", "supporter:user-qa-later"]) dropSetting(fx, key);
    clearStats(fx);
  });

  // ── 5. 소스·사이트맵 ────────────────────────────────────────────────────
  await section("5 소스·사이트맵", async () => {
    const modules = read("../src/modules/MANIFEST.txt").split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".js"));
    eq(modules.filter((file) => read(`../src/modules/${file}`).includes("support_stats:")), ["public/support-page.js"], "5-a 집계 키(support_stats:)는 한 모듈(public/support-page.js)만 다룬다");
    const sitemap = await open(fx, "/sitemap.xml", { headers: { accept: "application/xml" } });
    ok(sitemap.status === 200 && sitemap.html.includes("/support</loc>") && !sitemap.html.includes("/support/go"), "5-b 사이트맵에 /support 는 있고 경유 주소는 없다");
  });
}));

if (failures.length) for (const line of failures) console.error(`실패: ${line}`);
if (failures.length) { console.error(`V22.9.97 후원 검사 실패 checks ${checks} failed ${failures.length}`); process.exit(1); }
console.log(`V22.9.97 후원 검사 통과 (${checks} checks)`);
