// 간격·색 정리와 방 전용 보기 다듬기(작업 지시: 사용자 2026-11-21 "모두 이번주 부터" — 남은 UI/UX 의 첫 판).
//  A. 방 전용 보기 띠(V22.9.130 측정 — 폭 768·1033·1280·1440 에서 [로그인] 과 [보기 끝내기] 가 두 줄로 나뉨, 320 에서 띠 128px, 데스크톱에서 두 단추 높이 32·44):
//     두 단추를 한 묶음(.abRoomViewBandActions, 줄을 바꾸지 않음)에 넣고, 두 단추의 높이는 한 규칙(32px, 900px 아래 44px)으로, 띠의 규칙은 id(#abRoomViewBand)로
//     건다(예산 화면의 단추 규칙이 [보기 끝내기] 만 키우지 못하게). 간격·글자는 눈금(패딩 8·16, 480px 아래 8·12, 사이 8·12, 글자 13px).
//  B. 열 수 없는 링크(V130:B-8): 방 전용 세션으로 그린 화면에서 이 사이트 안의 링크 가운데 방 전용 세션으로 열리지 않는 곳(허용 목록도 공개 화면도 아닌 곳)에
//     data-ab-rv-off·aria-disabled="true"·title 을 달아 흐리게(.45) 보인다. 링크는 그대로 눌리고, 누르면 예전처럼 그 방 홈으로 돌아와 띠가 알린다.
//     스크립트·스타일 안의 글은 건드리지 않는다. 띠를 붙이지 않은 화면(보통 세션·로그인 전)에는 표시가 없다.
//  C. 어두운 테마의 선택 구분(화면 측정 2026-11-21 — 예산·설정·정기 화면 위 탭, 정기 수입·지출 고르기, 분석 칩·수입/지출 칸의 면 대비 2.1~2.7, 3:1 미만):
//     고른 칸의 테두리·안쪽 선을 밝은 강조색으로. 네 톤 모두 안 고른 칸의 테두리·옆 칸의 면과 3:1 이상. 공개 화면 머리 메뉴의 현재 위치(1440, 면 대비 1.12)에 안쪽 1px 선.
//  D. 간격·글자색 눈금: 화면에 실제로 쓰인 3px 이상 홀수 px 간격을 가까운 4의 배수로(차이 1px), 눈금 근처의 회색·파랑 글자색을 눈금(#191f28·#475467·#5f6b7a·
//     #1d4ed8)으로. 세 스타일시트의 홀수 간격 선언 수·눈금 근처 글자색 수는 늘지 않는다(상한). 1년 캐시 자산 주소 셋은 v229136 으로 올리고 옛 주소 v229125 는
//     옛 바이트 그대로 내려간다(운영 V22.9.125~135 화면이 쓴다).
// 브라우저로만 잴 수 있는 것(두 단추가 한 줄인지·띠 높이·화면별 대비·선택 구분)은 증거 폴더의 측정 도구가 본다. 여기서는 그 결과를 만드는 글과 값을 정확히 고정한다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음). 판 이름 글자는 적지 않는다. 바탕 코드(이 판 앞)에서는 대부분이 실패한다.
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { app, BASE, counter, fixture, withClock } from "./lib-audit-v22934.mjs";

const { PUBLIC_CONTENT_PATHS } = await import("../src/modules/public/site-config.js");

const { ok, eq, done } = counter("간격·색 정리와 방 전용 보기 다듬기(띠 한 묶음·열 수 없는 링크 표시·어두운 테마 선택 구분·간격과 글자색 눈금·자산 주소) 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const checkAsync = async (fn, label) => { try { await fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const sha = (text) => createHash("sha256").update(text).digest("hex");
const hex66 = (label) => createHash("sha256").update(`v229136-${label}`).digest("hex") + "ab";

// ── 색 대비(WCAG 2.x 상대 휘도) ─────────────────────────────────────────────
const channel = (hex) => {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? raw.split("").map((x) => x + x).join("") : raw;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
};
const luminance = (hex) => { const [r, g, b] = channel(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
const r2 = (value) => Math.round(value * 100) / 100;

// ── CSS 선택자 우선순위(id, class·속성·가상 클래스, 태그). :is()·:not()·:has() 는 안의 가장 큰 값, :where() 는 0 ─────
const compareSpec = (x, y) => (x[0] - y[0]) || (x[1] - y[1]) || (x[2] - y[2]);
function specificity(selector) {
  let a = 0, b = 0, c = 0;
  let s = ` ${selector} `;
  s = s.replace(/\[[^\]]*\]/g, () => { b += 1; return " "; });
  for (let round = 0; round < 4 && /:(is|not|has|where)\(/.test(s); round += 1) {
    s = s.replace(/:(is|not|has|where)\(([^()]*)\)/g, (_, name, inner) => {
      if (name !== "where") {
        const best = inner.split(",").map((part) => specificity(part.trim())).reduce((x, y) => (compareSpec(x, y) >= 0 ? x : y), [0, 0, 0]);
        a += best[0]; b += best[1]; c += best[2];
      }
      return " ";
    });
  }
  s = s.replace(/#[\w-]+/g, () => { a += 1; return " "; });
  s = s.replace(/::[\w-]+/g, () => { c += 1; return " "; });
  s = s.replace(/:[\w-]+/g, () => { b += 1; return " "; });
  s = s.replace(/\.[\w-]+/g, () => { b += 1; return " "; });
  for (const _ of s.matchAll(/[a-zA-Z][\w-]*/g)) c += 1;
  return [a, b, c];
}

// ── 스타일시트 세기(간격 선언의 3px 이상 홀수·소수 px, 눈금 근처 글자색) ──────────────────────
const SPACE = /(?<![-\w])((?:margin|padding)(?:-(?:top|right|bottom|left|inline|block)(?:-(?:start|end))?)?|gap|row-gap|column-gap)\s*:\s*([^;}]+)/g;
const NEAR_SCALE = ["#172033", "#111827", "#101828", "#1f2937", "#4e5968", "#475569", "#566175", "#344054", "#333d4b", "#667085", "#687385", "#64748b", "#6b7684", "#1b64da", "#2563eb"];
const COLOR = /(?<![-\w])color\s*:\s*(#[0-9a-fA-F]{6})\b/g;
const oddPx = (value) => [...value.matchAll(/(-?\d*\.?\d+)px\b/g)].some((m) => { const n = Number(m[1]); return n >= 2.5 && (!Number.isInteger(n) || n % 2 === 1); });
function sheetCounts(css) {
  let odd = 0, near = 0;
  for (const m of css.matchAll(SPACE)) if (/px/.test(m[2]) && oddPx(m[2])) odd += 1;
  for (const m of css.matchAll(COLOR)) if (NEAR_SCALE.includes(m[1].toLowerCase())) near += 1;
  return { odd, near };
}
// 선택자 그대로의 규칙 글(앞 글자가 } 나 빈칸·줄바꿈인 곳만 — 더 긴 선택자의 끝부분을 잡지 않는다).
function rulesOf(css, selector) {
  const out = [];
  let at = -1;
  while ((at = css.indexOf(`${selector}{`, at + 1)) >= 0) {
    if (at > 0 && !/[}\s]/.test(css[at - 1])) continue;
    out.push(css.slice(at, css.indexOf("}", at) + 1));
  }
  return out;
}
// 같은 선택자 블록들의 사용자 정의 속성(뒤의 것이 이긴다). media 가 주어지면 그 @media 안의 블록만, 아니면 @media 밖의 블록만.
function tokensOf(css, selector, media = "") {
  const tokens = {};
  let at = -1;
  while ((at = css.indexOf(`${selector}{`, at + 1)) >= 0) {
    if (at > 0 && !/[}\s]/.test(css[at - 1])) continue;
    let depth = 0;
    for (let i = 0; i < at; i += 1) { if (css[i] === "{") depth += 1; else if (css[i] === "}") depth -= 1; }
    const open = css.lastIndexOf("@media", at);
    const inMedia = depth > 0 && open >= 0 ? css.slice(open, css.indexOf("{", open)).replace(/\s+/g, "") : "";
    if (media ? inMedia !== media : depth !== 0) continue;
    const rule = css.slice(at, css.indexOf("}", at) + 1);
    for (const m of rule.matchAll(/(--ab12-[\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\b/g)) tokens[m[1]] = m[2].toLowerCase();
  }
  return tokens;
}

// ── 방 전용 보기 장면(V22.9.130 검사의 도움 함수를 줄여 옮김) ──────────────────────
const SECRET = "validate-v229136-spacing-color-secret";
const DAY = "2026-11-21";
const ROOM = hex66("room"), U1 = hex66("user-1"), U2 = hex66("user-2"), U_ALIAS = hex66("alias");
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const WEB_USER = "user-wifi";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS", "__AB_SKILL_RATE_BUCKETS"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}
async function say(fx, utterance, user) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } }, chat: { id: ROOM, type: "botGroupKey", properties: { botGroupKey: ROOM } } };
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify({ bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
}
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
  scope() { const raw = this.items.get("ab_user") || ""; const token = raw ? decodeURIComponent(raw) : ""; return token ? (token.slice(0, token.lastIndexOf(".")).split("|")[3] || "").replace(/^r:/, "") : ""; }
}
// 브라우저의 화면 이동 한 번(따라가지 않는다).
async function go(fx, path, { jar = null, cookie = "", ua = PC } = {}) {
  const jobs = [];
  const line = jar ? jar.header() : cookie;
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", "sec-fetch-site": "none", ...(line ? { cookie: line } : {}) } }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  if (jar) jar.take(cookies);
  return { status: response.status, location: response.headers.get("location") || "", html: await response.text() };
}
async function asset(fx, path) {
  const response = await app.fetch(new Request(`${BASE}${path}`), fx.env, { waitUntil() {}, passThroughOnException() {} });
  return { status: response.status, etag: response.headers.get("etag") || "", cache: response.headers.get("cache-control") || "", text: await response.text() };
}

// 화면 HTML 의 링크(스크립트·스타일 밖)를 열리는 곳·열 수 없는 곳으로 가른다.
const room = read("src/modules/auth/kakao-room-open.js");
const allowBlock = (() => { const at = room.indexOf("const ROOM_VIEW_PATHS_V229130 = new Set(["); return at < 0 ? "" : room.slice(at, room.indexOf("]);", at) + 3); })();
const ALLOW = new Set([...allowBlock.matchAll(/"(\/[^"]*)"/g)].map((m) => m[1]));
const opensInRoomView = (pathname) => ALLOW.has(pathname) || PUBLIC_CONTENT_PATHS.includes(pathname) || pathname === "/start-guide" || pathname.startsWith("/assets/");
const outsideBlocks = (html) => html.replace(/<script\b[\s\S]*?<\/script\s*>|<style\b[\s\S]*?<\/style\s*>/gi, "");
function classifyLinks(html) {
  const result = { marked: [], open: [], wronglyMarked: [], missed: [], badMarks: [] };
  for (const [tag] of outsideBlocks(html).matchAll(/<a\b(?:[^>"'<]|"[^"<]*"|'[^'<]*')*>/gi)) {
    const href = (tag.match(/\shref="([^"]*)"/i) || [])[1];
    if (!href || !href.startsWith("/") || href.startsWith("//")) continue;
    const pathname = new URL(href.replace(/&amp;/g, "&"), BASE).pathname;
    const marked = /\sdata-ab-rv-off=""/.test(tag);
    const expectOpen = opensInRoomView(pathname);
    (marked ? result.marked : result.open).push(pathname);
    if (marked && expectOpen) result.wronglyMarked.push(pathname);
    if (!marked && !expectOpen) result.missed.push(pathname);
    if (marked && (!/\saria-disabled="true"/.test(tag) || (tag.match(/\stitle="/g) || []).length !== 1)) result.badMarks.push(tag.slice(0, 160));
  }
  return result;
}
const scriptsOf = (html) => [...html.matchAll(/<script\b[\s\S]*?<\/script\s*>/gi)].map((m) => m[0]);
const bandStyleOf = (html) => (html.match(/<style id="abRoomViewBandStyle">[\s\S]*?<\/style>/) || [""])[0];
const BAND_STYLE_SHA = "c12f3637272ced9c4691d476ec23aa30e95fdac4f0e239636d78450b1afa16e1";

// ── A·B. 방 전용 보기 ──────────────────────────────────────────────────────
await checkAsync(() => withClock(DAY, () => fixture(async (fx) => {
  resetIsolateState();
  fx.env.KAKAO_SKILL_SECRET = SECRET;
  Object.assign(fx.env, KAKAO_ENV);
  delete fx.env.KAKAO_ROOM_VIEW_DISABLED;
  delete fx.env.KAKAO_ROOM_QUIET_LOGIN;
  try {
    await say(fx, "별빛국수 12000원", U1);
    await say(fx, "달빛라떼 4500원", U2);
    const u1 = fx.db.users.find((user) => user.kakao_user_key === U1);
    const household = fx.db.households.find((row) => row.name === ROOM_HOUSEHOLD_NAME && fx.db.household_members.some((m) => m.user_id === u1?.id && m.household_id === row.id && m.role === "owner"));
    if (!u1 || !household) throw new Error("room fixture not ready");
    const hh = String(household.id);
    const links = JSON.parse(fx.db.accountbook_settings.find((row) => row.key === "user_identity_links")?.value || "{}");
    links[`skill_identity:${U_ALIAS}`] = { user_id: WEB_USER, source: "skill", linked_at: `${DAY}T01:00:00Z` };
    const row = fx.db.accountbook_settings.find((item) => item.key === "user_identity_links");
    if (row) row.value = JSON.stringify(links); else fx.db.accountbook_settings.push({ key: "user_identity_links", value: JSON.stringify(links) });
    fx.db.household_members.push({ household_id: household.id, user_id: WEB_USER, role: "member", created_at: `${DAY}T01:00:00Z` });
    resetIsolateState();
    const jar = new Jar();
    await go(fx, `/my?botUserKey=${U_ALIAS}&appUserId=1801267359&botGroupKey=${ROOM}`, { jar });
    if (jar.scope() !== hh) throw new Error(`no room view session (${jar.scope() || "none"})`);

    const pages = {
      home: await go(fx, `/app?household_id=${hh}`, { jar }),
      bounced: await go(fx, `/app?household_id=${hh}&rv=login`, { jar }),
      budgets: await go(fx, `/budgets?household_id=${hh}`, { jar }),
      analysis: await go(fx, `/my/analysis?household_id=${hh}`, { jar }),
    };
    for (const [name, page] of Object.entries(pages)) check(() => ok(page.status === 200 && page.html.includes('id="abRoomViewBand"'), `A ${name}: 방 전용 보기 화면에 띠가 붙는다(${page.status})`), `band on ${name}`);
    const home = pages.home.html;

    // A-1. 띠의 짜임: 글 한 단락 + 두 단추를 한 묶음에.
    check(() => ok(/<div class="abRoomViewBand" id="abRoomViewBand" role="region" aria-label="방 전용 보기 안내"><p>[^<]*<b>방 전용 보기<\/b> · [^<]+<\/p><div class="abRoomViewBandActions"><a href="\/my\?[^"]+">로그인<\/a><form method="post" action="\/my\/logout"><button class="secondary" type="submit" aria-label="방 전용 보기 끝내기">보기 끝내기<\/button><\/form><\/div><\/div>/.test(home),
      "A-1 띠: [로그인] 과 [보기 끝내기] 가 한 묶음(.abRoomViewBandActions) 안에 있다"), "band markup");
    check(() => ok(/<p><b>방금 누른 화면은 로그인해야 열 수 있어요\.<\/b> <b>방 전용 보기<\/b>/.test(pages.bounced.html) && pages.bounced.html.includes('<div class="abRoomViewBandActions">'), "A-1 돌려보낸 화면의 띠도 같은 짜임에 까닭 한 줄"), "bounced band markup");
    const style = bandStyleOf(home);
    check(() => eq(sha(style), BAND_STYLE_SHA, "A-2 띠 스타일 블록은 이 판의 글 그대로다"), "band style pinned");
    for (const [needle, label] of [
      ["#abRoomViewBand{display:flex;align-items:center;justify-content:center;gap:8px 12px;flex-wrap:wrap;margin:0;padding:8px 16px;", "띠는 눈금 간격(패딩 8·16, 사이 8·12)으로 줄을 바꿀 수 있다"],
      ["font-size:13px;line-height:1.5;", "띠 글자 13px"],
      ["#abRoomViewBand .abRoomViewBandActions{display:flex;flex:none;flex-wrap:nowrap;align-items:center;justify-content:center;gap:8px}", "두 단추 묶음은 나뉘지 않는다(줄바꿈 없음·줄지 않음)"],
      ["#abRoomViewBand a,#abRoomViewBand button.secondary{display:inline-flex!important;align-items:center;justify-content:center;box-sizing:border-box;min-height:32px!important;margin:0!important;padding:4px 14px!important;", "두 단추의 높이·여백은 한 규칙(32px)"],
      ["white-space:nowrap;", "단추 글자는 줄을 바꾸지 않는다"],
      ["@media (max-width:900px){#abRoomViewBand a,#abRoomViewBand button.secondary{min-height:44px!important}}", "900px 아래에서는 두 단추 모두 44px(터치 영역)"],
      ["@media (max-width:480px){#abRoomViewBand{padding:8px 12px;gap:8px}}", "좁은 폭에서는 띠 여백을 줄인다(패딩 8·12, 사이 8)"],
      ["a[data-ab-rv-off]:not(.homeReserveCard){opacity:.45!important}", "열 수 없는 링크는 흐리게(정보를 담은 ‘정기 수입·지출’ 카드는 빼고)"],
      ["a[data-ab-rv-off]:not(.homeReserveCard):hover,a[data-ab-rv-off]:not(.homeReserveCard):focus-visible{opacity:.7!important}", "흐린 링크도 가리키거나 초점이 가면 조금 진해진다"],
      ["a.homeReserveCard[data-ab-rv-off] .homeReserveGo{opacity:.45!important}", "‘정기 수입·지출’ 카드는 그대로 읽히고 그 안의 ‘관리 →’ 만 흐리다"],
    ]) check(() => ok(style.includes(needle), `A-2 띠 스타일: ${label}`), `band style ${label}`);
    // 독립 검토(P3): 카드를 통째로 흐리는 규칙(예전 꼴)이 남아 있지 않다 — 흐림 규칙은 모두 정보 카드를 뺀다.
    check(() => { const dims = [...style.matchAll(/([^{}]+)\{opacity:[^}]*\}/g)].map((m) => m[1]); ok(dims.length === 3 && dims.every((selector) => selector.split(",").every((part) => part.includes(":not(.homeReserveCard)") || part.includes(".homeReserveGo"))), `A-2 흐림 규칙 ${dims.length}개가 모두 정보 카드를 통째로 흐리지 않는다(${dims.join(" / ")})`); }, "band dim rules spare info cards");
    check(() => ok(style && !/\.abRoomViewBand[\s{,]/.test(style.replace(/\.abRoomViewBandActions/g, "")), "A-2 띠 규칙은 id 로만 건다(클래스 규칙이 남아 있지 않다)"), "band rules by id");
    check(() => { const odd = [...style.matchAll(SPACE)].filter((m) => /px/.test(m[2]) && oddPx(m[2])); ok(style && odd.length === 0, `A-2 띠 스타일의 간격에 3px 이상 홀수 px 가 없다(${odd.map((m) => m[0]).join(" / ")})`); }, "band style even spacing");
    for (const [fg, bg, label] of [["#7a4b00", "#fff7e6", "밝은 띠 글"], ["#7a4b00", "#ffffff", "밝은 띠 단추"], ["#ffe2a8", "#3a2a05", "어두운 띠 글"], ["#ffe2a8", "#5a4108", "어두운 띠 단추"]]) {
      check(() => ok(style.includes(fg) && style.includes(bg === "#ffffff" ? "background:#fff!important" : bg) && contrast(fg, bg) >= 4.5, `A-2 ${label} 대비 ${r2(contrast(fg, bg))}:1 ≥ 4.5`), `band contrast ${label}`);
    }

    // B-1. 열 수 없는 링크 표시: 허용 목록·공개 화면 밖의 이 사이트 링크는 모두, 그리고 그것만.
    for (const [name, page] of Object.entries(pages)) {
      const links2 = classifyLinks(page.html);
      check(() => ok(links2.marked.length >= 8 && links2.wronglyMarked.length === 0 && links2.missed.length === 0 && links2.badMarks.length === 0,
        `B-1 ${name}: 열 수 없는 링크 ${links2.marked.length}개에 표시, 열리는 링크 ${links2.open.length}개는 그대로(잘못 표시 ${links2.wronglyMarked.join(",") || 0} · 빠짐 ${[...new Set(links2.missed)].join(",") || 0} · 표시 모양 ${links2.badMarks.length})`), `marks ${name}`);
    }
    const homeLinks = classifyLinks(home);
    for (const path of ["/menu", "/my/households", "/reports", "/payment-methods"]) check(() => ok(homeLinks.marked.includes(path), `B-1 홈: ${path} 링크에 표시(표시한 곳: ${[...new Set(homeLinks.marked)].sort().join(",")})`), `marked ${path}`);
    for (const path of ["/app", "/budgets"]) check(() => ok(homeLinks.open.includes(path) && !homeLinks.marked.includes(path), `B-1 홈: ${path} 링크는 그대로(방 전용 세션으로 열린다)`), `open ${path}`);
    check(() => ok(homeLinks.open.some((path) => PUBLIC_CONTENT_PATHS.includes(path) || path === "/start-guide") && !homeLinks.marked.some((path) => PUBLIC_CONTENT_PATHS.includes(path)), "B-1 홈: 공개 화면 링크(로그인 없이 열린다)는 그대로"), "public links open");
    // B-2. 스크립트 안의 글은 그대로(표시가 들어가지 않는다).
    check(() => { const scripts = scriptsOf(home); ok(scripts.length > 0 && scripts.every((block) => !block.includes("data-ab-rv-off")), `B-2 홈의 스크립트 ${scripts.length}개에 표시가 들어가지 않는다`); }, "scripts untouched");
    // B-3. 표시한 링크도 그대로 눌린다 — 누르면 그 방 홈으로 돌아와 띠가 알린다(예전과 같은 길).
    for (const path of ["/menu", "/my/settings"]) {
      const opened = await go(fx, `${path}?household_id=${hh}`, { jar });
      check(() => ok(opened.status === 303 && opened.location.endsWith(`/app?household_id=${encodeURIComponent(hh)}&rv=login`), `B-3 표시한 ${path} 을 누르면 그 방 홈(rv=login)으로 돌아온다(${opened.status} ${opened.location})`), `bounce ${path}`);
    }
    // B-4. 띠를 붙이지 않는 화면에는 표시가 없다: 같은 가계부를 보통 세션으로, 로그인 전 공개 화면.
    const normal = await go(fx, `/app?household_id=${hh}`, { cookie: await fx.cookieFor(WEB_USER) });
    check(() => ok(normal.status === 200 && !normal.html.includes("abRoomViewBand") && !normal.html.includes("data-ab-rv-off"), `B-4 보통 세션 화면에는 띠도 표시도 없다(${normal.status})`), "normal session unmarked");
    const support = await go(fx, "/support");
    check(() => ok(support.status === 200 && !support.html.includes("data-ab-rv-off"), "B-4 로그인 전 공개 화면에는 표시가 없다"), "public unmarked");
    // B-5. 원본: 표시는 띠를 붙인 화면에서만 한다.
    check(() => ok(/if \(out !== source\) \{\n\s+try \{ out = markRoomViewClosedLinksV229136\(out\); \} catch \(_\) \{/.test(room) && (room.match(/markRoomViewClosedLinksV229136\(/g) || []).length === 2, "B-5 원본: 표시는 띠를 붙인 응답에서만 한 번 한다"), "mark only with band");
    // B-7. 정보를 담은 카드 링크(안에 블록 요소가 있는 링크)는 표시를 달되 흐림 규칙이 빼는 카드여야 한다 — 지금은 홈의 ‘정기 수입·지출’ 카드 하나다(독립 검토 P3).
    for (const [name, page] of Object.entries(pages)) {
      const cards = [...outsideBlocks(page.html).matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)].filter((m) => /\sdata-ab-rv-off=""/.test(m[1]) && /<div\b/i.test(m[2]));
      const strays = cards.filter((m) => !/\sclass="homeReserveCard"/.test(m[1]));
      check(() => ok(strays.length === 0, `B-7 ${name}: 표시한 카드 링크 ${cards.length}개가 모두 흐리지 않는 정보 카드다(그 밖 ${strays.map((m) => m[1].slice(0, 60)).join(" / ") || 0})`), `info cards ${name}`);
    }
    check(() => { const card = (home.match(/<a class="homeReserveCard"[^>]*>[\s\S]*?<\/a>/) || [""])[0]; ok(/\sdata-ab-rv-off="" aria-disabled="true" title="로그인해야 열 수 있어요">/.test(card) && card.includes('<span class="homeReserveGo" aria-hidden="true">관리 →</span>'), "B-7 홈의 ‘정기 수입·지출’ 카드: 표시(열 수 없음·까닭)는 달고, 흐리는 것은 ‘관리 →’ 뿐(A-2 규칙)"); }, "reserve card marked");
    // B-8. 띠가 붙는 화면의 모든 링크는 표시 함수가 읽는 꼴(href="…" — 큰따옴표·등호 앞뒤 빈칸 없음)이다. 다른 꼴이 생기면 표시가 소리 없이 빠진다.
    for (const [name, page] of Object.entries(pages)) {
      const tags = [...outsideBlocks(page.html).matchAll(/<a\b(?:[^>"'<]|"[^"<]*"|'[^'<]*')*>/gi)].map((m) => m[0]);
      const other = tags.filter((tag) => /\shref\s*=/i.test(tag.replace(/"[^"]*"|'[^']*'/g, '""')) && !/\shref="/.test(tag));
      const unreadable = (outsideBlocks(page.html).match(/<a\b/gi) || []).length - tags.length;
      check(() => ok(tags.length > 20 && other.length === 0 && unreadable === 0, `B-8 ${name}: 링크 ${tags.length}개가 모두 href="…" 꼴이고 따옴표째 읽힌다(다른 꼴 ${other.map((tag) => tag.slice(0, 60)).join(" / ") || 0} · 읽지 못한 태그 ${unreadable})`), `link shapes ${name}`);
    }
  } finally {
    resetIsolateState();
  }
})), "방 전용 보기 장면");

// B-6. 표시 함수 자체(원본의 글을 그대로 꺼내 돌린다): 꾸민 HTML 로 경계를 본다.
check(() => {
  const at = room.indexOf("const ROOM_VIEW_PUBLIC_EXTRA_PATHS_V229136");
  const end = room.indexOf("async function roomViewBandResponseV229130(");
  if (at < 0 || end < at || !allowBlock) throw new Error("source blocks not found");
  const mark = new Function("PUBLIC_CONTENT_PATHS", `${allowBlock}\n${room.slice(at, end)}\nreturn markRoomViewClosedLinksV229136;`)(PUBLIC_CONTENT_PATHS);
  const T = ' data-ab-rv-off="" aria-disabled="true" title="로그인해야 열 수 있어요"';
  const cases = [
    ['<a href="/menu">전체메뉴</a>', `<a href="/menu"${T}>전체메뉴</a>`, "열 수 없는 화면"],
    ['<a class="x" href="/my/settings?a=1&amp;b=2" target="_self">설정</a>', `<a class="x" href="/my/settings?a=1&amp;b=2" target="_self"${T}>설정</a>`, "속성·쿼리가 붙은 링크(속성은 그대로)"],
    ['<a title="먼저 있던 설명" href="/reports">리포트</a>', '<a title="먼저 있던 설명" href="/reports" data-ab-rv-off="" aria-disabled="true">리포트</a>', "이미 title 이 있으면 덧붙이지 않는다"],
    ['<a href="/app?household_id=x">홈</a><a href="/budgets">예산</a><a href="/my/analysis">분석</a>', null, "허용 목록 화면"],
    ['<a href="/support">후원</a><a href="/privacy">개인정보</a><a href="/start-guide">가이드</a><a href="/assets/x.css">자산</a>', null, "공개 화면·자산"],
    ['<a href="//other.example/menu">x</a><a href="https://other.example/menu">y</a><a href="#top">z</a>', null, "바깥·같은 화면 안 링크"],
    ['<script>var s=\'<a href="/menu">x</a>\';</script><style>a[href="/menu"]{color:red}</style>', null, "스크립트·스타일 안의 글"],
    ['<a href="/menu" data-ab-rv-off="" aria-disabled="true">이미</a>', null, "이미 표시한 링크"],
    // 독립 검토(P3): 속성 값 안의 ‘>’ 에서 태그가 끝난 것으로 보면 속성이 깨지고 글자가 화면에 흐른다.
    ['<a href="/menu" data-x="a>b">메뉴</a>', `<a href="/menu" data-x="a>b"${T}>메뉴</a>`, "href 뒤 속성 값 안의 ‘>’"],
    ['<a onclick="return a>0" href="/reports">리포트</a>', `<a onclick="return a>0" href="/reports"${T}>리포트</a>`, "href 앞 속성 값 안의 ‘>’"],
    ["<a data-note=' href=\"/menu\"' href=\"/app\">홈</a>", null, "따옴표 안의 href 글은 링크 주소가 아니다"],
    ['<a aria-label="안내 title=설명" href="/menu">메뉴</a>', `<a aria-label="안내 title=설명" href="/menu"${T}>메뉴</a>`, "따옴표 안의 title 글은 title 속성이 아니다"],
    ['<a href="/menu" data-note="열린 따옴표>메뉴</a><a href="/app">홈</a>', null, "따옴표가 닫히지 않은 태그는 건드리지 않는다(화면 그대로)"],
  ];
  const wrong = [];
  for (const [input, expected, label] of cases) {
    const output = mark(input);
    if (output !== (expected ?? input)) wrong.push(`${label}: ${output.slice(0, 200)}`);
  }
  ok(wrong.length === 0, `B-6 표시 함수 경계 ${cases.length}가지(${wrong.join(" / ")})`);
}, "marker unit cases");

// ── C·D. 스타일시트 ────────────────────────────────────────────────────────
const NEW = { shell: "/assets/accountbook-shell-v229136.css", home: "/assets/mobile-home-v229138.css", ux: "/assets/ab-uiux-v229136.css" };
const OLD = {
  "/assets/accountbook-shell-v229125.css": "00cf0e5db858612c9b92f6eb5f356eaa071c5f741c36cfa537f536a65cce69ce",
  "/assets/mobile-home-v229125.css": "8c6e0ea2b68525b80ee6d4661ed2bd5e28386b48b7f7ba036fe4ae694d87b602",
  "/assets/ab-uiux-v229125.css": "232228f164aa99d4a93f5b03f4174702e249d0a580b4462d3d1e52ea4099f249",
};
// 이 판 뒤의 세기(바탕 927cab5b: 셸 107·4 → 63, 홈 61·41 → 41, 공통 31·35 → 14 / 글자색 셸 6 → 4, 홈 41 → 22, 공통 35 → 14). 늘면 실패한다.
const CAPS = { shell: { odd: 63, near: 4 }, home: { odd: 41, near: 22 }, ux: { odd: 14, near: 14 } };
await checkAsync(() => fixture(async (fx) => {
  const sheets = {};
  for (const [key, path] of Object.entries(NEW)) {
    const served = await asset(fx, path);
    sheets[key] = served.text;
    check(() => ok(served.status === 200 && served.etag === `"${path.slice(8, -4)}-css"` && /max-age=31536000/.test(served.cache) && /immutable/.test(served.cache), `D-1 ${path} 가 1년 캐시로 내려간다(${served.status} ${served.etag})`), `serve ${key}`);
  }
  for (const [path, expected] of Object.entries(OLD)) {
    const served = await asset(fx, path);
    check(() => ok(served.status === 200 && sha(served.text) === expected, `D-1 옛 주소 ${path} 는 옛 바이트 그대로(운영 앞 판 화면이 쓴다)`), `old ${path}`);
  }
  const { shell = "", home = "", ux = "" } = sheets;

  // C-1. 어두운 테마의 선택 구분 규칙.
  const DARK_RESERVE = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveTypeSeg input:checked+span{box-shadow:inset 0 0 0 2px #93c5fd}';
  const DARK_CHIP_SELECTOR = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.tchip.on):not(.applyBtn)';
  const DARK_CHIP = `${DARK_CHIP_SELECTOR}{border-color:var(--ab12-accent)!important;box-shadow:inset 0 0 0 1px var(--ab12-accent)!important}`;
  const DARK_SEG_SELECTOR = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .seg button.on';
  const DARK_SEG = `${DARK_SEG_SELECTOR}{box-shadow:inset 0 0 0 2px var(--ab12-accent)!important}`;
  const OLD_DARK_FILL = 'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn){background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}';
  const OLD_LIGHT_FILL_SELECTOR = "body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn)";
  for (const [rule, label] of [[DARK_RESERVE, "정기 수입·지출 고르기: 고른 칸에 안쪽 2px 밝은 파랑 선"], [DARK_CHIP, "분석 칩: 고른 칩의 테두리와 안쪽 1px 선을 톤의 밝은 강조색으로"], [DARK_SEG, "분석 수입·지출 칸: 고른 칸에 안쪽 2px 강조색 선"]]) {
    check(() => ok(shell.split(rule).length === 2, `C-1 ${label}`), `dark rule ${label}`);
  }
  check(() => {
    const oldAt = shell.indexOf(OLD_DARK_FILL), chipAt = shell.indexOf(DARK_CHIP), segAt = shell.indexOf(DARK_SEG);
    const chip = specificity(DARK_CHIP_SELECTOR), fill = specificity(OLD_DARK_FILL.slice(0, OLD_DARK_FILL.indexOf("{"))), seg = specificity(DARK_SEG_SELECTOR), light = specificity(OLD_LIGHT_FILL_SELECTOR);
    ok(oldAt >= 0 && chipAt > oldAt && segAt > oldAt && compareSpec(chip, fill) > 0 && compareSpec(seg, light) > 0,
      `C-1 새 규칙이 옛 채움 규칙을 이긴다(칩 ${chip.join(",")} > ${fill.join(",")}, 칸 ${seg.join(",")} > 밝은 채움 ${light.join(",")}, 뒤에 놓임)`);
  }, "dark rules win");
  // C-2. 네 톤 모두: 고른 칸의 선(강조색)이 안 고른 칸의 테두리·옆 칸의 면과 3:1 이상.
  //      대비 높이기 설정(@media(prefers-contrast:more))에서는 안 고른 칩의 테두리가 밝아져 테두리끼리는 3:1 이 안 될 수 있다 — 그때는 칩의 안쪽 선이 옆 칸의 면과 가른다.
  const dark = tokensOf(shell, 'html[data-ab-resolved-theme="dark"] body.abV22812Shell');
  const darkMore = tokensOf(shell, 'html[data-ab-resolved-theme="dark"] body.abV22812Shell', "@media(prefers-contrast:more)");
  check(() => ok(dark["--ab12-line"] === "#3b475a" && dark["--ab12-surface-raised"] === "#282b33" && darkMore["--ab12-line"], `C-2 어두운 테마의 테두리·면 토큰을 읽었다(테두리 ${dark["--ab12-line"]}, 대비 높이기 ${darkMore["--ab12-line"]}, 면 ${dark["--ab12-surface-raised"]})`), "dark tokens read");
  for (const tone of ["blue", "emerald", "violet", "amber"]) {
    const toneTokens = tone === "blue" ? {} : tokensOf(shell, `html[data-ab-resolved-theme="dark"][data-ab-tone="${tone}"] body.abV22812Shell`);
    const accent = toneTokens["--ab12-accent"] || dark["--ab12-accent"];
    const line = dark["--ab12-line"], raised = dark["--ab12-surface-raised"], surface = dark["--ab12-surface"];
    check(() => ok(accent && line && raised && surface && contrast(accent, line) >= 3 && contrast(accent, raised) >= 3 && contrast(accent, surface) >= 3,
      `C-2 어두운 ${tone} 톤: 강조색 ${accent} 이 테두리 ${line}(${r2(contrast(accent || "#000", line || "#000"))}:1)·면 ${raised}(${r2(contrast(accent || "#000", raised || "#000"))}:1)·${surface} 와 3:1 이상`), `tone ${tone}`);
    check(() => ok(DARK_CHIP.includes("box-shadow:inset 0 0 0 1px var(--ab12-accent)") && shell.includes(DARK_CHIP) && contrast(accent, raised) >= 3,
      `C-2 어두운 ${tone} 톤 + 대비 높이기: 테두리끼리 ${r2(contrast(accent || "#000", darkMore["--ab12-line"] || "#000"))}:1 이어도 칩의 안쪽 선이 옆 칸의 면과 ${r2(contrast(accent || "#000", raised || "#000"))}:1`), `tone ${tone} more`);
  }
  check(() => ok(contrast("#93c5fd", dark["--ab12-surface-raised"] || "#000") >= 3 && contrast("#93c5fd", "#1d4ed8") >= 1, `C-2 정기 고르기의 안쪽 선 #93c5fd 는 옆 칸의 면과 ${r2(contrast("#93c5fd", dark["--ab12-surface-raised"] || "#000"))}:1`), "reserve ring");

  // D-2. 간격·글자색 눈금: 화면에서 가장 많이 보이던 자리의 규칙(정확한 글).
  const pins = [
    ["shell", "html body.abV22812Shell .abNavSection .abNavLinks a{min-height:36px!important;padding:8px 12px!important}", "사이드바 메뉴 링크 여백 7 → 8px"],
    ["shell", "body.abV22812Shell .readableTrendGrid .dailyCell{display:grid;gap:6px;background:#F8F9FB;border:1px solid #EEF0F3;border-radius:12px;padding:8px 8px;box-sizing:border-box;text-decoration:none;color:inherit}", "날짜별 칸 여백 9 → 8px"],
    ["shell", "body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay{min-height:62px;padding:8px 2px;border:1px solid transparent!important;border-radius:12px;background:transparent!important;color:var(--ab12-text)!important;opacity:1!important}", "홈 달력 칸 여백 7 → 8px"],
    ["shell", "body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay{min-height:55px;padding:4px 1px}", "좁은 폭 달력 칸 여백 5 → 4px"],
    ["shell", "body.abV22812Shell .abGlobalAction{display:inline-flex;min-height:42px;align-items:center;justify-content:center;gap:8px;padding:0 12px;", "머리말 단추 사이 7 → 8px"],
    ["shell", "body.abV22812Shell .homeBudgetTop em{background:var(--ab12-accent-soft)!important;color:#1d4ed8!important;border:0!important;box-shadow:none!important}", "예산 상단 칩 글자색 #1b64da → 강조 눈금 #1d4ed8"],
    ["home", ".v8-tx{background:#fff;border:1px solid #e8edf4;border-radius:20px;padding:12px;margin:8px 0;box-shadow:0 8px 20px rgba(15,23,42,.04)}", "거래 카드 여백 13 → 12px·사이 9 → 8px"],
    ["home", ".abMobileAppSurface .homeQuick a{min-height:64px;padding:12px 8px!important;background:#fff!important;border:1px solid var(--ab-line)!important;border-radius:12px!important;box-shadow:none!important}", "홈 바로가기 여백 11·7 → 12·8px"],
    ["home", ".homeWeek li{display:grid;justify-items:center;align-content:end;gap:4px;padding:8px 0;border-radius:var(--ab12-r-sm,8px);min-height:64px}", "최근 7일 칸 사이 5 → 4px"],
    ["home", ".v8-spender{color:#475467!important;font-weight:400}", "지출자 글자색 → 보조 눈금 #475467"],
    ["home", ".abMobileAppSurface .homeQuick span{color:#5f6b7a!important}", "바로가기 보조 글자색 → 흐린 눈금 #5f6b7a"],
    ["ux", ".abPageMenu .menuRow{display:grid;grid-template-columns:30px minmax(0,1fr) minmax(130px,.8fr) 18px;align-items:center;gap:10px;min-height:55px;padding:8px 2px;text-decoration:none;color:#191f28;border-bottom:1px solid #e7eaf0}", "전체 메뉴 줄 여백 9 → 8px·글자색 → 본문 눈금 #191f28"],
    ["ux", ".abV2281 th{background:#f8fafc;color:#5f6b7a!important;font-weight:600!important}", "표 머리 글자색 #667085 → 흐린 눈금 #5f6b7a"],
  ];
  for (const [key, needle, label] of pins) check(() => ok(sheets[key]?.includes(needle), `D-2 ${label}`), `pin ${label}`);
  check(() => ok(!shell.includes(".homeBudgetTop em{background:var(--ab12-accent-soft)!important;color:#1b64da!important"), "D-2 예산 상단 칩의 옛 글자색 규칙은 남지 않는다(바탕 규칙 바꾸기)"), "pair replaced");
  check(() => ok(shell.includes("--ab12-placeholder:#52606f;--ab12-nav-inactive:#475467;") && shell.includes("--ab12-placeholder:#cbd5e1;--ab12-nav-inactive:#cbd5e1;"), "D-2 사이드바의 고르지 않은 메뉴 글자는 밝은 테마에서 보조 눈금 #475467(어두운 테마 #cbd5e1 그대로)"), "nav inactive");
  for (const [key, css] of [["home", home], ["ux", ux]]) check(() => ok(css.includes(":root{--ab-bg:#f7f8fa;--ab-surface:#fff;--ab-text:#191f28;--ab-muted:#5f6b7a;"), `D-2 ${key}: 옛 UI 화면의 본문 글자 토큰도 본문 눈금 #191f28`), `ab-text ${key}`);
  // D-3. 세기의 상한(늘지 않는다). 시트가 비어 있으면(주소가 없으면) 센 것이 아니다.
  for (const [key, css] of Object.entries(sheets)) {
    const counts = sheetCounts(css);
    check(() => ok(css.length > 30000 && counts.odd <= CAPS[key].odd && counts.near <= CAPS[key].near, `D-3 ${NEW[key]}(${css.length}자): 3px 이상 홀수·소수 px 간격 선언 ${counts.odd}(상한 ${CAPS[key].odd}) · 눈금 근처 글자색 ${counts.near}(상한 ${CAPS[key].near})`), `caps ${key}`);
  }
  // D-4. 눈금의 글자색은 쓰이는 바탕 위에서 4.5:1 이상.
  for (const fg of ["#191f28", "#475467", "#5f6b7a", "#1d4ed8"]) for (const bg of ["#ffffff", "#f2f4f6", "#f7f8fa", "#f8fafc"]) {
    check(() => ok(contrast(fg, bg) >= 4.5, `D-4 ${fg} on ${bg} ${r2(contrast(fg, bg))}:1 ≥ 4.5`), `scale ${fg} ${bg}`);
  }
  check(() => ok(contrast("#1d4ed8", "#e8f3ff") >= 4.5, `D-4 예산 상단 칩 #1d4ed8 on #e8f3ff ${r2(contrast("#1d4ed8", "#e8f3ff"))}:1`), "chip contrast");

  // C-3·D-5. 화면 인라인 규칙(예산 위 탭·정기 화면·공개 화면).
  const cookie = await fx.cookieFor("user-wifi");
  const page = async (path) => (await go(fx, path, { cookie })).html;
  const budgets = await page("/budgets?month=2026-07&household_id=house-home");
  check(() => ok(budgets.includes('html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a{background:#1e2026;border-color:#3b475a;color:#edeff3!important}')
    && budgets.includes('html[data-ab-resolved-theme="dark"] .abMoneyPlanTabs a.on{background:#1d4ed8;border-color:#93c5fd;box-shadow:inset 0 0 0 1px #93c5fd;color:#fff!important}')
    && contrast("#93c5fd", "#3b475a") >= 3 && contrast("#ffffff", "#1d4ed8") >= 4.5 && contrast("#dbeafe", "#1d4ed8") >= 4.5,
    `C-3 예산·설정·정기 위 탭(어두운 테마): 고른 탭의 테두리·안쪽 선 #93c5fd 가 안 고른 탭의 테두리와 ${r2(contrast("#93c5fd", "#3b475a"))}:1`), "money plan tabs dark");
  check(() => ok(budgets.includes(".abMoneyPlanTabs{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin:12px 0}") && budgets.includes(".abMoneyPlanTabs a{display:grid;gap:4px;align-content:center;padding:12px;") && budgets.includes(".abMoneyPlanTabs a small{font-size:11px;color:#5f6b7a;font-weight:400}"), "D-5 위 탭의 간격(사이 4·여백 12·바깥 12)과 보조 글자색"), "money plan tabs light");
  const reserve = await page("/reserve-plans?month=2026-07&household_id=house-home");
  check(() => ok(reserve.includes(".reserveCard span:not(.reserveEdit *),.reserveAmt small,.note{display:block;color:#5f6b7a;"), "D-5 정기 화면 보조 글자색 → 흐린 눈금 #5f6b7a"), "reserve sub text");
  const demo = await page("/demo");
  check(() => ok(demo.includes(".pubHeader nav a:hover,.pubHeader nav a.active{background:#e8f3ff;color:#1d4ed8}.pubHeader nav a.active{box-shadow:inset 0 0 0 1px #1d4ed8}") && /<a class="active" aria-current="page" href="[^"]+">/.test(demo) && contrast("#1d4ed8", "#ffffff") >= 3,
    "C-3 공개 화면 머리 메뉴: 현재 위치(aria-current)에만 안쪽 1px 선(흰 바탕 6.7:1), 마우스를 올린 메뉴는 면만"), "public nav current");
  const support = await page("/support");
  check(() => ok(support.includes(".abBusinessFooterItem{display:inline-flex;gap:4px;align-items:baseline;min-width:0}") && support.includes(".pubFooterLinks a{display:inline-flex;align-items:center;min-height:44px;color:#475467;font-size:13px}") && support.includes(".abBusinessFooter{margin:18px 0 0;padding:12px 0 2px;"), "D-5 공개 화면 꼬리말: 사업자 칸 사이 5 → 4px, 링크 글자색 → #475467, 위 여백 13 → 12px"), "public footer");
  // D-6. 화면은 새 주소만 부른다(옛 주소는 앞 판 화면을 위해 남았을 뿐).
  const seen = new Set();
  for (const path of ["/app?month=2026-07&household_id=house-home", "/reports?month=2026-07&household_id=house-home", "/menu?household_id=house-home", "/my/settings?household_id=house-home"]) {
    const html = await page(path);
    for (const m of html.matchAll(/\/assets\/(accountbook-shell|mobile-home|ab-uiux)-v\d+\.css/g)) seen.add(m[0]);
  }
  check(() => ok(Object.values(NEW).every((path) => seen.has(path)) && ![...seen].some((path) => /-v229125\.css$/.test(path)), `D-6 화면이 부르는 스타일시트 주소: ${[...seen].sort().join(", ")}`), "pages use new addresses");
}), "스타일시트·화면 장면");

if (failures.length) {
  console.error(`간격·색 정리 검사 실패 ${failures.length}건:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
done();
