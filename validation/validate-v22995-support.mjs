#!/usr/bin/env node
// V22.9.95 후원 검사 — 공개 후원 안내(/support)·후원자 표시(설정 키 supporter:<user_id>)·배지·포인트 색·관리자 후원자 설정.
//   1. /support: 200·제목·절 구성(왜 필요한가(비용 표 없음, E-18)·쓰는 곳·약속·방법·혜택·이야기하는 곳·문의), 운영 변수가 없으면 ‘준비 중’ 한 줄과 송금 링크 0,
//      변수가 있으면 카카오페이·토스·소통 오픈채팅 링크 3 과 계좌 줄, http(s) 가 아닌 값은 무시, 후원자 방 주소는 공개 페이지에 없음,
//      광고 모드(AdSense live·애드핏)에서도 광고 없음, ‘기부’ 라는 말 없음, 사이트맵·사이트맵 페이지·꼬리말 링크, /contact 그대로.
//   2. 후원자 표시: 플래그 없는 사용자는 /menu·/app 에 배지·data-supporter·포인트 색이 없고, 켜진 사용자는 있다(선택지 3).
//      끝난 플래그·시작 전 플래그·값 오류는 꺼짐, 끝나는 날 당일은 켜짐. 조회는 기존 설정 읽기에 얹혀 화면별 요청 수가 그대로다.
//   3. 참여자 화면: 켜진 구성원 이름 옆 배지, 구성원 id 를 모아 한 번 읽는다, 읽지 못하면 배지 없이 200.
//   4. 관리자 /admin/supporters: 세션 없으면 비밀번호 화면, 추가(user_id·로그인 이름·표시 이름) → 설정 upsert 요청 모양, 고치기·검증,
//      제거(확인 문구) → DELETE, 다른 출처 POST 는 거부, 공개 명단은 public_name 있는 켜진 분만. 운영 대시보드 링크.
//   5. 포인트 색 CSS 는 data-supporter="1" 로 막혀 있고 1 KB 이하, 스크립트 1 KB 이하, 밝은·다크 대비 4.5:1 이상.
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음. 장면 시계는 2026-07-15(KST) 로 고정한다.
import { readFileSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import { app, BASE, ctx, failure, fixture, intercept, page, post, putSetting, settingValue, withClock } from "./lib-audit-v22934.mjs";

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
const SUPPORT_VARS = Object.freeze({
  SUPPORT_KAKAOPAY_URL: "https://qr.kakaopay.com/qa-v22995-kakaopay",
  SUPPORT_BANK_ACCOUNT: "QA은행 000-00-0000000 도담 네트워크",
  SUPPORT_TOSS_URL: "https://toss.me/qa-v22995-toss",
  COMMUNITY_OPENCHAT_URL: "https://open.kakao.com/o/qaV22995Community",
  SUPPORTER_OPENCHAT_URL: "https://open.kakao.com/o/qaV22995Supporters",
});
const VAR_NAMES = Object.keys(SUPPORT_VARS);
const ADMIN_PASSWORD = "qa-v22995-support-admin";
const MENU = "/menu?household_id=house-home&month=2026-07";
const HOME = "/app?month=2026-07&household_id=house-home";
const MEMBERS = "/my/members?household_id=house-home&month=2026-07";
const flag = (since, until = null, extra = {}) => JSON.stringify({ since, until, note: "QA", public_name: null, ...extra });

// Supabase 로 가는 요청만 적는다(픽스처 fetch 는 그대로 돈다).
async function withDb(task) {
  const log = [];
  const restore = intercept(({ url, method, init }) => {
    if (url.hostname.endsWith("supabase.co")) {
      const headers = new Headers(init?.headers || {});
      const path = `${url.pathname}${url.search}`;
      log.push({ method, path, decoded: decodeURIComponent(path), prefer: headers.get("prefer") || "", body: typeof init?.body === "string" ? init.body : "" });
    }
    return null;
  });
  try { return { result: await task(), log }; } finally { restore(); }
}
async function withEnv(fx, vars, task) {
  const previous = Object.fromEntries(Object.keys(vars).map((key) => [key, fx.env[key]]));
  Object.assign(fx.env, vars);
  try { return await task(); } finally {
    for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete fx.env[key]; else fx.env[key] = value; }
  }
}
function sectionsOf(html) {
  return [...html.matchAll(/<section class="pubSection" id="section-(\d+)"><h2>([^<]*)<\/h2>([\s\S]*?)<\/section>/g)].map((m) => ({ n: Number(m[1]), title: m[2], body: m[3] }));
}
const hrefs = (html) => [...String(html || "").matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
const SUPPORTER_MARKERS = /data-supporter=|abSupporterBadge|data-ab-accent-choice|abSupporterAccent|abSupporterStyle/;

// 대비(WCAG 상대 휘도).
function luminance(hex) {
  const value = hex.replace("#", "");
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
// 포인트 색 스크립트를 가짜 문서에서 돌린다(브라우저 없이 저장·적용·단추 상태·컬러톤 누름을 본다).
function runAccentScript(script, { supporter = true, stored = null } = {}) {
  const attrs = new Map(supporter ? [["data-supporter", "1"]] : []);
  const store = new Map(stored ? [["ab:appearance:accent", stored]] : []);
  const node = (map, text) => ({ attrs: map, textContent: text, getAttribute(n) { return this.attrs.has(n) ? this.attrs.get(n) : null; }, setAttribute(n, v) { this.attrs.set(n, String(v)); }, closest(selector) { return [...this.attrs.keys()].some((k) => selector.includes(`[${k}]`)) ? this : null; } });
  const buttons = [["", "기본"], ["coral", "코랄"], ["mint", "민트"], ["lavender", "라벤더"]].map(([v, label]) => node(new Map([["data-ab-accent-choice", v]]), label));
  const tone = node(new Map([["data-ab-tone-choice", "emerald"]]), "그린");
  const status = { textContent: "" };
  const listeners = {};
  const documentElement = { getAttribute: (n) => (attrs.has(n) ? attrs.get(n) : null), setAttribute: (n, v) => attrs.set(n, String(v)), removeAttribute: (n) => attrs.delete(n) };
  const document = { documentElement, querySelectorAll: () => buttons, getElementById: () => status, addEventListener: (type, fn) => { listeners[type] = fn; } };
  const localStorage = { getItem: (k) => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: (k) => store.delete(k) };
  vm.runInNewContext(script, { document, localStorage });
  return { attrs, store, buttons, tone, status, listeners, pressed: () => buttons.map((b) => b.attrs.get("aria-pressed")) };
}
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

await withClock(TODAY, () => fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "qa-v22995-support-session";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/admin/supporters" }, { cookie: "" });
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "0 관리자 로그인 쿠키를 받는다(검사 준비)");

  // ── 1. 공개 /support ────────────────────────────────────────────────────
  await section("1 /support 기본", async () => {
    const { result: support, log } = await withDb(() => page(fx, "/support", { cookie: "" }));
    eq(support.status, 200, "1-a /support 가 별칭(308)이 아니라 200 페이지다");
    ok(/<title>말해가계부 후원 안내 · [^<]+<\/title>/.test(support.html) && (support.html.match(/<h1\b/g) || []).length === 1 && support.html.includes(">말해가계부 후원 안내</h1>"), "1-b 제목과 h1 하나");
    ok(support.html.includes('<link rel="canonical" href="https://malhaebook.com/support"'), "1-c 정본 주소는 /support");
    const secs = sectionsOf(support.html);
    eq(secs.map((s) => s.title), ["왜 후원이 필요한가요", "후원금은 이렇게 써요", "후원하는 방법", "후원자에게 드리는 것", "함께 이야기하는 곳", "문의"], "1-d 절 구성(명단이 없으면 명단 절은 없다)");
    const cost = secs[0]?.body || "";
    ok(!/<table|달러|요금제|4만 5천|한 달 운영 비용/.test(cost) && cost.includes("운영 비용과 유지보수·업데이트에 큰 도움이 됩니다") && cost.includes("금액은 정해져 있지 않아요"), "1-e 첫 절: 비용 표·금액 없이 ‘서버 운영 비용과 유지보수·업데이트에 큰 도움’(E-18, 사용자 결정)");
    ok(!/달러|요금제|4만 5천|한 달 운영 비용/.test(support.html), "1-e′ 페이지 어디에도 요금제·달러·예정 금액이 없다(E-18)");
    ok(secs[1]?.body.includes("외부 저장소 비용") && !/계속 무료|후원하지 않아도/.test(support.html), "1-f 서버·저장소 비용 안내, 미래 이용료 약속 없음");
    const ways = secs[2]?.body || "";
    ok(ways.includes("후원 창구를 준비하고 있어요(출시 뒤 안내).") && hrefs(ways).length === 0 && !/<ul>/.test(ways), "1-g 변수가 없으면 ‘준비 중’ 한 줄만, 링크 0");
    ok(!/kakaopay|toss\.me|open\.kakao\.com/.test(support.html), "1-h 변수가 없으면 송금·오픈채팅 주소가 페이지 어디에도 없다");
    ok(secs[3]?.body.includes("‘후원자’ 배지") && secs[3]?.body.includes("코랄·민트·라벤더") && secs[3]?.body.includes("후원자 오픈채팅방 초대") && secs[3]?.body.includes("원하는 분만"), "1-i 후원자에게 드리는 것: 배지·포인트 색·후원자 방·명단(원하는 분만)");
    ok(hrefs(secs[5]?.body).includes("mailto:admin@malhaebook.com") && hrefs(secs[5]?.body).includes("/contact"), "1-j 문의: admin@malhaebook.com 메일과 문의 안내 링크");
    ok(!support.html.includes("기부"), "1-k ‘기부’ 라는 말을 쓰지 않는다");
    ok(support.html.includes("729-24-02288") && /<footer class="pubFooter">[\s\S]*<a href="\/support">후원하기<\/a>[\s\S]*<\/footer>/.test(support.html), "1-l 사업자 정보 꼬리말과 꼬리말 ‘후원하기’ 링크");
    ok(!/01[016789]-?\d{3,4}-?\d{4}/.test(support.html), "1-m 전화번호를 싣지 않는다");
    const reads = log.filter((r) => r.method === "GET");
    ok(reads.length === 1 && reads[0].decoded.includes("/rest/v1/accountbook_settings?key=like.supporter:*"), `1-n GET 은 후원자 명단 읽기 한 번뿐(실제 ${log.length}건)`);
    const head = await withDb(() => app.fetch(new Request(`${BASE}/support`, { method: "HEAD" }), fx.env, ctx));
    ok(head.result.status === 200 && head.log.length === 0, "1-o HEAD 는 200 이고 DB 를 읽지 않는다");
    const slash = await page(fx, "/support/", { cookie: "" });
    ok(slash.status === 308 && slash.location.endsWith("/support"), "1-p 끝 빗금 /support/ 는 /support 로 308");
  });

  await section("1 /support 변수", async () => {
    const full = await withEnv(fx, SUPPORT_VARS, () => page(fx, "/support", { cookie: "" }));
    const secs = sectionsOf(full.html);
    const ways = secs.find((s) => s.title === "후원하는 방법")?.body || "";
    // V22.9.97 후원 지표: 송금·오픈채팅 단추는 변수 주소 대신 경유 주소(/support/go/<kind>)를 싣는다(누른 수를 세고 같은 주소로 302,
    // validate-v22997-support). 2-a·2-d·2-e·2-g 의 기대값을 변수 주소 → 경유 주소로 바꿨다. 순서·개수·새 창 규칙은 그대로다.
    eq(hrefs(ways), ["/support/go/kakaopay", "/support/go/toss"], "2-a 송금 링크는 카카오페이 → 토스 순서 둘(경유 주소, V22.9.97)");
    ok(ways.includes(`계좌이체: ${SUPPORT_VARS.SUPPORT_BANK_ACCOUNT}`) && ways.indexOf("카카오페이 송금") < ways.indexOf("계좌이체") && ways.indexOf("계좌이체") < ways.indexOf("토스 송금"), "2-b 계좌 줄은 글로, 카카오페이 → 계좌이체 → 토스 순서");
    ok(!ways.includes("준비하고 있어요") && ways.includes("영수증을 발행하지 않아요"), "2-c 창구가 있으면 ‘준비 중’ 줄이 없고 영수증 안내가 있다");
    const talk = secs.find((s) => s.title === "함께 이야기하는 곳")?.body || "";
    eq(hrefs(talk), ["/support/go/openchat"], "2-d 누구나 들어오는 오픈채팅 링크 하나(경유 주소, V22.9.97)");
    const configured = hrefs(full.html).filter((href) => href.startsWith("/support/go/") || Object.values(SUPPORT_VARS).includes(href));
    eq(configured, ["/support/go/kakaopay", "/support/go/toss", "/support/go/openchat"], "2-e 변수 링크는 페이지 전체에서 3개(카카오페이·토스·소통방, 경유 주소 — 변수 주소는 페이지에 없다, V22.9.97)");
    ok(!full.html.includes(SUPPORT_VARS.SUPPORTER_OPENCHAT_URL) && talk.includes("후원을 확인한 분께"), "2-f 후원자 오픈채팅 주소는 공개 페이지에 싣지 않는다(안내 문장만)");
    ok(/<a href="\/support\/go\/kakaopay" target="_blank" rel="noopener noreferrer">/.test(ways), "2-g 바깥 송금 링크는 새 창 + noopener(경유 주소도 바깥 링크로 표시, V22.9.97)");
    const bad = await withEnv(fx, { SUPPORT_KAKAOPAY_URL: "javascript:alert(1)", SUPPORT_TOSS_URL: "ftp://toss.me/x", COMMUNITY_OPENCHAT_URL: "open.kakao.com/o/noScheme", SUPPORTER_OPENCHAT_URL: "https://open.kakao.com/o/x\"onmouseover=\"1", SUPPORT_BANK_ACCOUNT: "   " }, () => page(fx, "/support", { cookie: "" }));
    const badWays = sectionsOf(bad.html).find((s) => s.title === "후원하는 방법")?.body || "";
    ok(badWays.includes("후원 창구를 준비하고 있어요(출시 뒤 안내).") && hrefs(badWays).length === 0, "2-h http(s) 가 아닌 값·빈 계좌는 없는 것으로 본다(준비 중)");
    ok(!/javascript:|ftp:|noScheme|onmouseover/.test(bad.html), "2-i 무시한 값은 페이지 어디에도 나오지 않는다");
    const bankOnly = await withEnv(fx, { SUPPORT_BANK_ACCOUNT: SUPPORT_VARS.SUPPORT_BANK_ACCOUNT }, () => page(fx, "/support", { cookie: "" }));
    const bankWays = sectionsOf(bankOnly.html).find((s) => s.title === "후원하는 방법")?.body || "";
    ok(bankWays.includes("계좌이체: ") && hrefs(bankWays).length === 0, "2-j 계좌만 있으면 계좌 줄만, 송금 링크 0");
    const health = await withEnv(fx, SUPPORT_VARS, () => page(fx, "/health", { cookie: "" }));
    const ready = await withEnv(fx, SUPPORT_VARS, () => page(fx, "/ready", { cookie: admin }));
    ok([health.html, ready.html].every((text) => !VAR_NAMES.some((name) => text.includes(name)) && !Object.values(SUPPORT_VARS).some((value) => text.includes(value))), "2-k /health·/ready 에 후원 변수 이름·값이 없다");
    for (const [label, vars] of [["애드핏", { ADS_MODE: "adfit", ADFIT_UNIT_CONTENT: "DAN-qaAdfit95Unit01", ADFIT_UNIT_SIZE: "320x100" }], ["AdSense live", { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" }]]) {
      const [own, guide] = await withEnv(fx, vars, async () => [await page(fx, "/support", { cookie: "" }), await page(fx, "/budget-guide", { cookie: "" })]);
      const pattern = /kakao_ad_area|data-ad-unit|adsbygoogle|data-ad-slot/;
      ok(!pattern.test(own.html) && pattern.test(guide.html), `2-l ${label} 모드에서 /support 에는 광고가 없다(같은 모드의 /budget-guide 에는 있다)`);
    }
  });

  await section("1 사이트맵·별칭", async () => {
    const sitemap = await page(fx, "/sitemap.xml", { cookie: "" });
    ok(sitemap.html.includes("<loc>https://malhaebook.com/support</loc>"), "3-a XML 사이트맵에 /support");
    const siteMap = await page(fx, "/site-map", { cookie: "" });
    ok(hrefs(siteMap.html).includes("/support"), "3-b 사이트맵 페이지 ‘운영 정보와 정책’ 에 후원 안내");
    const contact = await page(fx, "/contact", { cookie: "" });
    ok(contact.status === 200 && contact.html.includes(">사용 문의와 잘못된 안내 신고</h1>"), "3-c /contact 는 그대로 문의 안내");
    const legacy = await page(fx, "/cookie-policy", { cookie: "" });
    ok(legacy.status === 308 && legacy.location.endsWith("/cookies"), "3-d 다른 별칭은 그대로(/cookie-policy → /cookies)");
    const home = await page(fx, "/", { cookie: "" });
    const footer = home.html.match(/<footer class="pubFooter">[\s\S]*?<\/footer>/)?.[0] || "";
    const links = hrefs(footer);
    ok(links.includes("/support") && links.at(-1) === "https://tools.malhaebook.com/" && links.indexOf("/support") === links.length - 2, "3-e 공개 꼬리말: ‘후원하기’ 는 자기 링크의 끝, 형제 사이트 링크는 맨 끝 그대로");
  });

  // ── 2. 후원자 표시: 전체 메뉴·홈 ──────────────────────────────────────────
  await section("2 비후원자", async () => {
    const { result: menu, log } = await withDb(() => page(fx, MENU));
    eq(menu.status, 200, "4-a 전체 메뉴 200");
    const details = menu.html.match(/<details class="advancedGroup">[\s\S]*?<\/details>/)?.[0] || "";
    const rows = [...details.matchAll(/<a class="menuRow" href="([^"]*)"/g)].map((m) => m[1]);
    ok(rows.at(-1) === "/support" && details.includes(">후원하기</span>"), "4-b ‘도움말과 안내’ 목록 끝에 ‘후원하기’(/support)");
    ok(!SUPPORTER_MARKERS.test(menu.html), "4-c 플래그 없는 사용자의 전체 메뉴: 배지·data-supporter·포인트 색 선택·스크립트 없음");
    const prefRead = log.filter((r) => r.decoded.includes("cursor:v1:user:user-bin"));
    ok(prefRead.length === 1 && prefRead[0].decoded.includes("key=in.(") && prefRead[0].decoded.includes("supporter:user-bin"), "4-d 마우스 표시 설정과 후원자 표시를 한 번에 읽는다");
    fx.__menuReads = log.length;
    putSetting(fx, "cursor:v1:user:user-bin", "off");
    const off = await page(fx, MENU);
    ok(off.html.includes("마우스 따라오는 표시") && !/name="cursor" value="on" checked/.test(off.html), "4-e 합친 읽기에서도 마우스 표시 꺼짐이 그대로 보인다");
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "cursor:v1:user:user-bin");
    const { result: home, log: homeLog } = await withDb(() => page(fx, HOME));
    ok(home.status === 200 && !SUPPORTER_MARKERS.test(home.html), "4-f 플래그 없는 사용자의 홈: 배지·data-supporter·포인트 색 없음");
    const homeSettings = homeLog.filter((r) => r.decoded.includes("supporter:user-bin"));
    ok(homeSettings.length === 1 && homeSettings[0].decoded.includes("key=in.(") && homeSettings[0].decoded.includes("member_alias"), "4-g 홈은 후원자 표시를 기존 설정 조회(in.) 한 번에 얹는다");
    fx.__homeReads = homeLog.length;
    const adminHome = await withDb(() => page(fx, HOME, { cookie: admin }));
    ok(adminHome.result.status === 200 && !adminHome.log.some((r) => r.decoded.includes("supporter:")) && !SUPPORTER_MARKERS.test(adminHome.result.html), "4-h 관리자 세션의 홈은 후원자 표시를 읽지 않는다");
  });

  await section("2 후원자", async () => {
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const { result: menu, log } = await withDb(() => page(fx, MENU));
    ok(menu.html.includes('<html lang="ko" data-supporter="1">'), "5-a 후원자의 전체 메뉴 <html> 에 data-supporter=\"1\"");
    ok(/<p class="abSupporterThanks"><span class="abSupporterBadge" role="img" aria-label="후원자"[^>]*><svg[^>]*aria-hidden="true"[^>]*>[\s\S]*?<\/svg>후원자<\/span>/.test(menu.html), "5-b 머리말 배지: 글자 + 아이콘, aria-label=\"후원자\"");
    eq([...menu.html.matchAll(/data-ab-accent-choice="([^"]*)"/g)].map((m) => m[1]), ["", "coral", "mint", "lavender"], "5-c 화면 설정에 포인트 색 선택지 3(+ 기본)");
    ok(/<div class="abAccentRow"[^>]*>[\s\S]*?<p id="abAccentStatus" class="abAppearanceStatus" aria-live="polite">/.test(menu.html) && menu.html.indexOf("abAccentRow") > menu.html.indexOf("abAppearanceRows") && menu.html.indexOf("abAccentRow") < menu.html.indexOf('id="abAppearanceStatus"'), "5-d 포인트 색 줄은 화면 설정 패널 안, 상태 문구는 aria-live");
    ok(!menu.html.includes(SUPPORT_VARS.SUPPORTER_OPENCHAT_URL), "5-e 후원자 방 주소 변수가 없으면 단추 없음");
    eq(log.length, fx.__menuReads, "5-f 후원자여도 전체 메뉴 조회 수는 그대로");
    const style = menu.html.match(/<style id="abSupporterStyle">([\s\S]*?)<\/style>/)?.[1] || "";
    const script = menu.html.match(/<script id="abSupporterAccent">([\s\S]*?)<\/script>/)?.[1] || "";
    const accentCss = style.slice(style.indexOf("[data-supporter"));
    const blocks = [...accentCss.matchAll(/([^{}]+)\{([^}]*)\}/g)].map((m) => ({ selector: m[1], vars: Object.fromEntries([...m[2].matchAll(/(--ab12-[a-z-]+):(#[0-9a-f]{6})/g)].map((v) => [v[1], v[2]])) }));
    ok(blocks.length === 6 && blocks.every((b) => b.selector.startsWith('[data-supporter="1"][data-ab-accent=') && b.selector.endsWith(" .abV22812Shell")), "5-g 포인트 색 CSS 는 모두 data-supporter=\"1\" + data-ab-accent 로 막혀 있고 셸 변수만 덮는다");
    ok(Buffer.byteLength(accentCss) <= 1024 && Buffer.byteLength(script) <= 1024 && script.length > 0, `5-h 포인트 색 CSS ${Buffer.byteLength(accentCss)} B·스크립트 ${Buffer.byteLength(script)} B 모두 1 KB 이하`);
    ok(script.includes('"ab:appearance:accent"') && script.includes('getAttribute("data-supporter")!=="1"') && menu.html.indexOf('id="abSupporterAccent"') < menu.html.indexOf("</head>"), "5-i 스크립트는 머리 안에서 저장값(ab:appearance:accent)을 읽고 data-supporter 없는 화면에서는 멈춘다");
    const light = blocks.filter((b) => !b.selector.includes("dark"));
    const dark = blocks.filter((b) => b.selector.includes("dark"));
    ok(light.length === 3 && light.every((b) => contrast("#ffffff", b.vars["--ab12-action"]) >= 4.5 && contrast(b.vars["--ab12-accent"], "#ffffff") >= 4.5 && contrast(b.vars["--ab12-accent"], b.vars["--ab12-accent-soft"]) >= 4.5), "5-j 밝은 화면 대비: 단추 흰 글자·강조 글자·옅은 배경 위 강조 글자 4.5:1 이상");
    ok(dark.length === 3 && dark.every((b) => contrast("#ffffff", b.vars["--ab12-action"]) >= 4.5 && contrast(b.vars["--ab12-accent"], "#1e2026") >= 4.5 && contrast(b.vars["--ab12-accent"], b.vars["--ab12-accent-soft"]) >= 4.5), "5-k 다크 대비: 단추 흰 글자·면 위 강조 글자·옅은 배경 위 강조 글자 4.5:1 이상");
    const badgeLight = style.match(/\.abSupporterBadge\{[^}]*background:(#[0-9a-f]{6});color:(#[0-9a-f]{6})/);
    const badgeDark = style.match(/dark"\] \.abSupporterBadge\{background:(#[0-9a-f]{6});border-color:#[0-9a-f]{6};color:(#[0-9a-f]{6})/);
    ok(!!badgeLight && !!badgeDark && contrast(badgeLight[1], badgeLight[2]) >= 4.5 && contrast(badgeDark[1], badgeDark[2]) >= 4.5, "5-l 배지 글자 대비 4.5:1 이상(밝은·다크)");
    const run = runAccentScript(script, { stored: "mint" });
    run.listeners.DOMContentLoaded?.();
    ok(run.attrs.get("data-ab-accent") === "mint" && isDeepStrictEqual(run.pressed(), ["false", "false", "true", "false"]) && run.status.textContent === "포인트 색: 민트", "5-l2 스크립트: 저장값(민트)을 그리기 전에 붙이고 단추·상태 문구를 맞춘다");
    run.listeners.click({ target: run.buttons[1] });
    ok(run.store.get("ab:appearance:accent") === "coral" && run.attrs.get("data-ab-accent") === "coral" && run.status.textContent === "저장했어요. 포인트 색: 코랄", "5-l3 스크립트: 코랄을 누르면 저장하고 바로 바꾼다");
    run.listeners.click({ target: run.tone });
    ok(!run.store.has("ab:appearance:accent") && !run.attrs.has("data-ab-accent") && isDeepStrictEqual(run.pressed(), ["true", "false", "false", "false"]), "5-l4 스크립트: 컬러톤을 누르면 포인트 색을 끈다(고른 컬러톤이 보이게)");
    const ended = runAccentScript(script, { supporter: false, stored: "coral" });
    const forged = runAccentScript(script, { stored: "red;}body{x:1" });
    ok(!ended.attrs.has("data-ab-accent") && !forged.attrs.has("data-ab-accent"), "5-l5 스크립트: data-supporter 가 없거나 저장값이 세 색이 아니면 아무것도 붙이지 않는다");
    const { result: home, log: homeLog } = await withDb(() => page(fx, HOME));
    ok(home.html.includes('<html lang="ko" data-supporter="1">') && /<header class="appTop[^"]*"[^>]*><div class="topLine[^"]*">(?:<div class="abV5PageTitle">)?<h1[^>]*>우리집 생활비<\/h1><span class="abSupporterBadge" role="img" aria-label="후원자"/.test(home.html) && home.html.includes('<script id="abSupporterAccent">'), "5-m 후원자의 홈: data-supporter·머리말 배지·포인트 색 스크립트");
    eq(homeLog.length, fx.__homeReads, "5-n 후원자여도 홈 조회 수는 그대로");
    const chat = await withEnv(fx, { SUPPORTER_OPENCHAT_URL: SUPPORT_VARS.SUPPORTER_OPENCHAT_URL }, () => page(fx, MENU));
    // V22.9.97 후원 지표: 후원자 방 단추도 경유 주소(/support/go/supporter-openchat, 켜진 후원자 세션에만 방으로 302)로 간다. 방 주소는 화면에 싣지 않는다.
    ok(chat.html.includes(`<a class="abSupporterChat" href="/support/go/supporter-openchat" target="_blank" rel="noopener noreferrer">후원자 오픈채팅 들어가기</a>`) && !chat.html.includes(SUPPORT_VARS.SUPPORTER_OPENCHAT_URL), "5-o 후원자 방 주소가 있으면 후원자의 화면 설정에만 들어가기 단추(경유 주소, V22.9.97)");
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "supporter:user-bin");
    const chatNon = await withEnv(fx, { SUPPORTER_OPENCHAT_URL: SUPPORT_VARS.SUPPORTER_OPENCHAT_URL }, () => page(fx, MENU));
    // V22.9.97: 방 주소는 이제 누구 화면에도 없으므로 단추(경유 주소·abSupporterChat) 자체가 없는지 본다(검사의 뜻 그대로).
    ok(!chatNon.html.includes(SUPPORT_VARS.SUPPORTER_OPENCHAT_URL) && !chatNon.html.includes("abSupporterChat") && !chatNon.html.includes("/support/go/supporter-openchat"), "5-p 비후원자에게는 후원자 방 단추가 없다");
  });

  await section("2 기간", async () => {
    const state = async (value) => { putSetting(fx, "supporter:user-bin", value); return (await page(fx, MENU)).html.includes('data-supporter="1"'); };
    eq(await state(flag("2026-06-01", "2026-07-14")), false, "6-a 끝나는 날이 지난 플래그는 꺼짐(저장값이 남아도 포인트 색 없음)");
    eq(await state(flag("2026-06-01", TODAY)), true, "6-b 끝나는 날 당일은 켜짐");
    eq(await state(flag("2026-07-16")), false, "6-c 시작 전 플래그는 꺼짐");
    eq(await state("{not json"), false, "6-d 값 오류는 꺼짐");
    eq(await state(JSON.parse(flag("2026-07-01"))), true, "6-e jsonb 객체로 저장돼 있어도 읽는다");
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const restore = intercept(({ url }) => (decodeURIComponent(url.search).includes("supporter:") ? failure(503) : null));
    let failed;
    try { failed = await page(fx, MENU); } finally { restore(); }
    ok(failed.status === 200 && !SUPPORTER_MARKERS.test(failed.html) && /name="cursor" value="on" checked/.test(failed.html), "6-f 설정 읽기가 실패하면 조용히 후원자 아님·마우스 표시 기본(켜짐)");
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== "supporter:user-bin");
  });

  // ── 3. 참여자 화면 ─────────────────────────────────────────────────────────
  await section("3 참여자", async () => {
    const base = await withDb(() => page(fx, MEMBERS));
    ok(base.result.status === 200 && !SUPPORTER_MARKERS.test(base.result.html), "7-a 후원자가 없으면 참여자 화면에 배지·배지 CSS 없음");
    putSetting(fx, "supporter:user-wifi", flag("2026-07-01"));
    putSetting(fx, "supporter:user-bin", flag("2026-06-01", "2026-07-01"));
    const { result: members, log } = await withDb(() => page(fx, MEMBERS));
    const badges = [...members.html.matchAll(/<b>([^<]*)<span class="abSupporterBadge" role="img" aria-label="후원자"/g)].map((m) => m[1]);
    eq(badges, ["WIFI♥"], "7-b 켜진 구성원(WIFI♥) 이름 옆에만 배지(끝난 플래그인 Bin 은 없음)");
    ok(members.html.includes('<style id="abSupporterStyle">') && !members.html.includes("abSupporterAccent") && !members.html.includes("data-supporter="), "7-c 보는 사람이 후원자가 아니면 배지 CSS 만(포인트 색·data-supporter 없음)");
    const flagReads = log.filter((r) => r.decoded.includes("supporter:"));
    ok(flagReads.length === 1 && flagReads[0].decoded.includes("key=in.(") && flagReads[0].decoded.includes('"supporter:user-bin"') && flagReads[0].decoded.includes('"supporter:user-wifi"'), "7-d 구성원 id 를 모아 in.(…) 한 번으로 읽는다");
    ok(base.log.filter((r) => r.decoded.includes("supporter:")).length === 1 && log.length === base.log.length, `7-e 참여자 화면의 후원자 읽기는 한 번뿐이고 후원자가 있어도 조회 수(${log.length}회)는 같다`);
    const restore = intercept(({ url }) => (decodeURIComponent(url.search).includes("supporter:") ? failure(503) : null));
    let failed;
    try { failed = await page(fx, MEMBERS); } finally { restore(); }
    ok(failed.status === 200 && !failed.html.includes("abSupporterBadge") && failed.html.includes("WIFI♥"), "7-f 후원자 읽기가 실패해도 참여자 화면은 배지 없이 그린다");
    putSetting(fx, "supporter:user-bin", flag("2026-07-01"));
    const viewer = await page(fx, MEMBERS);
    ok(viewer.html.includes('<html lang="ko" data-supporter="1">') && viewer.html.includes('<script id="abSupporterAccent">') && (viewer.html.match(/<span class="abSupporterBadge"/g) || []).length === 2, "7-g 보는 사람(소유자)이 후원자면 참여자 화면에도 data-supporter·포인트 색, 배지는 켜진 두 사람");
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !String(row.key).startsWith("supporter:"));
  });

  // ── 4. 관리자 /admin/supporters ───────────────────────────────────────────
  await section("4 관리자", async () => {
    const anon = await page(fx, "/admin/supporters", { cookie: "" });
    ok(anon.status === 303 && anon.location.endsWith("/admin-view?return_to=%2Fadmin%2Fsupporters"), "8-a 세션 없으면 관리자 비밀번호 화면으로(돌아올 곳 /admin/supporters)");
    const gate = await page(fx, "/admin-view?return_to=%2Fadmin%2Fsupporters", { cookie: "" });
    ok(gate.status === 200 && /type="password"/.test(gate.html), "8-b 돌아간 곳은 비밀번호 화면");
    const userOnly = await page(fx, "/admin/supporters");
    ok(userOnly.status === 303 && userOnly.location.includes("/admin-view"), "8-c 일반 사용자 세션도 들어가지 못한다");
    const empty = await page(fx, "/admin/supporters", { cookie: admin });
    ok(empty.status === 200 && empty.html.includes("<h1>후원자 관리</h1>") && empty.html.includes("아직 후원자 표시가 없어요.") && /<form method="post" action="\/admin\/supporters\/save">/.test(empty.html) && /<select name="by">/.test(empty.html), "8-d 관리자 화면: 빈 목록과 추가 폼(찾는 방법 선택)");

    const { result: saved, log } = await withDb(() => post(fx, "/admin/supporters/save", { by: "user_id", who: "user-wifi", since: "", until: "", note: "QA 송금 확인", public_name: "와이파이" }, { cookie: admin }));
    ok(saved.status === 303 && saved.location === "/admin/supporters?msg=saved", "8-e 추가하면 목록으로 돌아가며 저장 알림");
    const upsert = log.filter((r) => r.method === "POST" && r.path.startsWith("/rest/v1/accountbook_settings"));
    let body = null;
    try { body = JSON.parse(upsert[0]?.body || "null"); } catch (_) { body = null; }
    ok(upsert.length === 1 && upsert[0].path === "/rest/v1/accountbook_settings?on_conflict=key" && upsert[0].prefer.includes("resolution=merge-duplicates"), "8-f 설정 upsert 한 번(on_conflict=key, merge-duplicates)");
    eq(body && typeof body.value === "string" ? { key: body.key, value: JSON.parse(body.value) } : body, { key: "supporter:user-wifi", value: { since: TODAY, until: null, note: "QA 송금 확인", public_name: "와이파이" } }, "8-g 올린 값: 키 supporter:<user_id>, 시작일 오늘, 끝나는 날 null, 메모·명단 이름");
    const list = await page(fx, "/admin/supporters", { cookie: admin });
    ok(list.html.includes("<code>user-wifi</code>") && list.html.includes("WIFI♥") && list.html.includes('<span class="state on">켜짐</span>') && list.html.includes("QA 송금 확인") && list.html.includes("와이파이"), "8-h 목록: user_id·표시 이름·상태·메모·명단 이름");

    const before = settingValue(fx, "supporter:user-wifi");
    const backwards = await post(fx, "/admin/supporters/save", { user_id: "user-wifi", since: "2026-07-10", until: "2026-07-01", note: "", public_name: "" }, { cookie: admin });
    const badDate = await post(fx, "/admin/supporters/save", { user_id: "user-wifi", since: "", until: "2026-13-01", note: "", public_name: "" }, { cookie: admin });
    const nobody = await post(fx, "/admin/supporters/save", { by: "user_id", who: "user-nobody", until: "", note: "", public_name: "" }, { cookie: admin });
    ok(backwards.location.includes("err=until_before_since") && badDate.location.includes("err=until_invalid") && nobody.location.includes("err=user_not_found") && settingValue(fx, "supporter:user-wifi") === before, "8-i 끝나는 날이 시작일보다 빠르거나 날짜가 틀리거나 사용자가 없으면 저장하지 않는다");
    const edit = await page(fx, "/admin/supporters?user_id=user-wifi", { cookie: admin });
    ok(edit.html.includes("후원자 표시 고치기") && edit.html.includes('<input type="hidden" name="user_id" value="user-wifi"/>') && edit.html.includes('value="와이파이"'), "8-j 고치기 폼은 지금 값으로 채워진다");
    const extended = await post(fx, "/admin/supporters/save", { user_id: "user-wifi", since: "", until: "2026-12-31", note: "연간", public_name: "와이파이" }, { cookie: admin });
    const extendedValue = JSON.parse(settingValue(fx, "supporter:user-wifi") || "{}");
    ok(extended.location === "/admin/supporters?msg=saved" && extendedValue.since === TODAY && extendedValue.until === "2026-12-31" && extendedValue.note === "연간", "8-k 고치면 시작일은 그대로 두고 끝나는 날·메모를 바꾼다");

    const byNickname = await post(fx, "/admin/supporters/save", { by: "nickname", who: "Bin", until: "", note: "", public_name: "" }, { cookie: admin });
    ok(byNickname.location === "/admin/supporters?msg=saved" && JSON.parse(settingValue(fx, "supporter:user-bin") || "{}").public_name === null, "8-l 표시 이름(한 명)으로 찾아 넣는다(명단 이름 없음 = null)");
    fx.db.accountbook_user_identities.push({ id: "qa-v22995-login", user_id: "user-trip", provider: "local", provider_subject: "qatrip95", created_at: "2026-07-01T00:00:00Z" });
    const tripUser = fx.db.users.find((row) => row.id === "user-trip");
    if (!tripUser) fx.db.users.push({ id: "user-trip", nickname: "여행 QA", created_at: "2026-07-01T00:00:00Z" });
    const byLogin = await post(fx, "/admin/supporters/save", { by: "login", who: "  QATrip95 ", until: "2026-07-01", since: "2026-06-01", note: "", public_name: "지난 후원자" }, { cookie: admin });
    ok(byLogin.location === "/admin/supporters?msg=saved" && JSON.parse(settingValue(fx, "supporter:user-trip") || "{}").until === "2026-07-01", "8-m 로그인 이름(대소문자·앞뒤 공백 정리)으로 찾아 넣는다");

    const support = await page(fx, "/support", { cookie: "" });
    const thanks = sectionsOf(support.html).find((s) => s.title === "고마운 후원자")?.body || "";
    ok(thanks.includes("와이파이") && !thanks.includes("지난 후원자") && !thanks.includes("Bin"), "8-n 공개 명단은 지금 켜져 있고 명단 이름을 준 분만(끝난 분·이름 없는 분 제외)");
    const restore = intercept(({ url }) => (decodeURIComponent(url.search).includes("like.supporter") ? failure(503) : null));
    let noList;
    try { noList = await page(fx, "/support", { cookie: "" }); } finally { restore(); }
    ok(noList.status === 200 && !noList.html.includes("고마운 후원자"), "8-o 명단을 읽지 못하면 명단 절을 빼고 200");

    const forged = await withDb(() => app.fetch(new Request(`${BASE}/admin/supporters/save`, { method: "POST", headers: { cookie: admin, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site", accept: "text/html" }, body: new URLSearchParams({ by: "user_id", who: "user-bin", public_name: "가짜" }).toString() }), fx.env, ctx));
    ok(forged.result.status === 403 && !forged.log.some((r) => r.method !== "GET"), "8-p 다른 출처 POST(CSRF)는 403 이고 아무것도 쓰지 않는다");
    const forgedRemove = await app.fetch(new Request(`${BASE}/admin/supporters/remove`, { method: "POST", headers: { cookie: admin, "content-type": "application/x-www-form-urlencoded", origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: "user_id=user-wifi&confirm_text=%EC%A0%9C%EA%B1%B0" }), fx.env, ctx);
    ok(forgedRemove.status === 403 && !!settingValue(fx, "supporter:user-wifi"), "8-q 다른 출처의 제거도 403 이고 줄이 남는다");
    const userPost = await post(fx, "/admin/supporters/save", { by: "user_id", who: "user-bin", public_name: "가짜" });
    ok(userPost.status === 303 && userPost.location.includes("/admin-view") && JSON.parse(settingValue(fx, "supporter:user-bin") || "{}").public_name === null, "8-r 관리자 세션이 없는 POST 는 비밀번호 화면으로 보내고 쓰지 않는다");

    const unconfirmed = await post(fx, "/admin/supporters/remove", { user_id: "user-wifi", confirm_text: "삭제" }, { cookie: admin });
    ok(unconfirmed.location.includes("err=confirm_required") && !!settingValue(fx, "supporter:user-wifi"), "8-s 확인 문구가 ‘제거’ 가 아니면 지우지 않는다");
    const { result: removed, log: removeLog } = await withDb(() => post(fx, "/admin/supporters/remove", { user_id: "user-wifi", confirm_text: "제거" }, { cookie: admin }));
    const deletes = removeLog.filter((r) => r.method === "DELETE");
    ok(removed.location === "/admin/supporters?msg=removed" && deletes.length === 1 && deletes[0].path === "/rest/v1/accountbook_settings?key=eq.supporter%3Auser-wifi" && settingValue(fx, "supporter:user-wifi") === undefined, "8-t 제거는 그 키 하나를 DELETE 한다");
    const dashboard = await page(fx, "/ops-dashboard", { cookie: admin });
    ok(dashboard.status === 200 && dashboard.html.includes('<a class="btn light" href="/admin/supporters">후원자 관리</a>'), "8-u 운영 대시보드에 ‘후원자 관리’ 링크 한 줄");
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => !String(row.key).startsWith("supporter:"));
  });
}));

// ── 5. 소스 ────────────────────────────────────────────────────────────────
await section("5 소스", async () => {
  const modules = read("../src/modules/MANIFEST.txt").split("\n").map((line) => line.trim()).filter((line) => line.endsWith(".js"));
  const readers = modules.filter((file) => VAR_NAMES.some((name) => read(`../src/modules/${file}`).includes(name)));
  eq(readers, ["public/support-page.js"], "9-a 후원 변수는 한 곳(public/support-page.js)에서만 읽는다");
  ok(["public/support-page.js", "my/supporters.js", "admin/supporters-admin.js"].every((file) => modules.includes(file) && !read(`../src/modules/${file}`).includes("기부")), "9-b 새 모듈 셋이 MANIFEST 에 있고 ‘기부’ 라는 말이 없다");
  const paths = read("../src/modules/public/site-config.js");
  const adKeys = paths.slice(paths.indexOf("const AD_PAGE_KEYS"), paths.indexOf("]", paths.indexOf("const AD_PAGE_KEYS")));
  ok(!adKeys.includes('"/support"'), "9-c /support 는 광고 화면 목록(AD_PAGE_KEYS)에 없다");
});

if (failures.length) for (const line of failures) console.error(`실패: ${line}`);
if (failures.length) { console.error(`V22.9.95 후원 검사 실패 checks ${checks} failed ${failures.length}`); process.exit(1); }
console.log(`V22.9.95 후원 검사 통과 (${checks} checks)`);
