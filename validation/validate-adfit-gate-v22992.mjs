// V22.9.92 카카오 애드핏 광고 게이트(ADS_MODE=adfit) 검사.
//
// 사용자(2026-10-30): 구글 애드센스 대신 카카오 애드핏 심사를 넣으려 한다 → 조사 권장(review-artifacts/adfit-2026-10-30/RESEARCH.md) 승인.
// 애드핏은 광고 단위를 만들고 설치 코드가 실제로 광고를 부른 뒤 심사한다. 그래서 코드는 지금 넣되, 운영 변수 ADS_MODE 가 정확히
// "adfit" 이고 광고 단위(ID·크기)가 맞을 때만 광고가 붙어야 한다. 애드핏을 ADS_MODE 의 새 값으로 둔 것은 되돌리기 때문이다
// (이 판 전의 판은 "adfit" 을 review 로 읽어 광고를 싣지 않는다. live 에 네트워크 변수를 더하면 옛 판이 Google 로더를 싣는다).
// 이 검사는 다음을 확인한다.
//   0. 소스: adsMode 는 정확히 "adfit" 만 애드핏으로 보고, 게이트가 읽는 운영 변수는 넷뿐이며, 광고 단위 변수는 한 함수에서만 읽고,
//      애드핏 호스트·설치 코드·고지 링크는 게이트 블록 밖에 없다
//   1. 기본값과 AdSense 는 그대로: ADS_MODE 가 정확히 "adfit" 이 아니면 광고 단위 변수가 있어도 review·AdSense live 와 바이트 동일,
//      광고 단위가 맞지 않으면 review 와 바이트 동일(광고·CSP 확장 없음)
//   2. 애드핏 공개 화면 45쪽: 설치 코드 하나(공식 SDK 코드 그대로)·Google 광고 코드 없음·본문 끝 자리·CSP 확장
//   3. 애드핏 로그인 뒤 화면 5개(운영정책 5.2)와 금지 화면: review 와 바이트 동일
//   4. 광고 단위 값 검증(ID·크기), 5. 정책 화면 문구(카카오 기준), 6. /ready 의 ads_mode·adfit_unit, /health 는 그대로
// 렌더링은 QA 픽스처와 app.fetch 로만 한다(서버·네트워크 없음).
import { readFileSync, existsSync } from "node:fs";
import vm from "node:vm";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const ORIGIN = "https://malhaebook.com";
const SDK = '<script async type="text/javascript" charset="utf-8" src="https://t1.kakaocdn.net/kas/static/ba.min.js"></script>';
const NOAD_BODY = 'function malhaeAdfitNoAd(el){var slot=el&&el.closest?el.closest(".adSlot"):null;if(slot)slot.style.display="none";}';
// 병합 전 검토(P3): SDK 를 받지 못하면 onfail 이 불리지 않으므로 자리 안 스크립트의 불러오기 실패(캡처 단계 error)도 같은 함수로 숨긴다.
const SDK_ERROR_HOOK = 'addEventListener("error",function(e){var t=e.target;if(t&&t.tagName==="SCRIPT")malhaeAdfitNoAd(t);},true);';
const SLOT_SCRIPT = NOAD_BODY + SDK_ERROR_HOOK;
// 병합 전 검토(P2): 자리 좌우 안쪽 여백을 없애고, 화면 폭이 단위 폭 + 37px 이하이면 화면 양 끝까지 넓힌다.
const adfitCss = (width) => `html body .adSlot.adfitSlot.adfitSlot{padding-left:0;padding-right:0;text-align:center}@media (max-width:${Number(width) + 37}px){html body .adSlot.adfitSlot.adfitSlot{margin-left:calc(50% - 50vw)!important;margin-right:calc(50% - 50vw)!important;border-left:0;border-right:0;border-radius:0}}`;
const specTags = (html) => [...String(html).matchAll(/<script type="speculationrules">([\s\S]*?)<\/script>/g)].map((m) => ({ index: m.index, rules: JSON.parse(m[1]) }));
const UNIT = "DAN-qaAdfit92Unit01";
const insFor = (id, width, height) => `<ins class="kakao_ad_area" style="display:none;width:100%;" data-ad-unit="${id}" data-ad-width="${width}" data-ad-height="${height}" data-ad-onfail="malhaeAdfitNoAd"></ins>`;
const SLOT_PATTERN = /<section class="card adSlot noPrint adfitSlot" style="min-height:(\d+)px" aria-label="광고">([\s\S]*?)<\/section>/g;
const GOOGLE_AD_PATTERN = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead|data-ad-(?:client|slot)/i;
const ADFIT_PATTERN = /kakao_ad_area|kas\/static\/ba\.min\.js|data-ad-unit|malhaeAdfitNoAd|adfitSlot/;
const C = "month=2026-07&household_id=house-home";
const SIGNED_IN = [
  { path: `/reports?${C}`, key: "/reports" },
  { path: "/annual?year=2026&household_id=house-home", key: "/annual" },
  { path: `/smart-tools?${C}`, key: "/smart-tools" },
  { path: `/start-guide?${C}`, key: "/start-guide" },
  { path: `/keyword-guide?${C}`, key: "/keyword-guide" },
  { path: `/reports?${C}&range=week&week=2026-07-06`, key: "/reports" },
  { path: "/annual-report?year=2026&household_id=house-home", key: "/annual" },
  { path: `/my/premium?${C}`, key: "/smart-tools" },
];
const POLICY_PAGES = ["/privacy", "/terms", "/cookies", "/contact", "/about", "/site-map"];

let passed = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  passed += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  passed += 1;
}
function same(actual, expected, label) {
  if (actual !== expected) {
    const a = String(actual), b = String(expected);
    let i = 0;
    while (i < a.length && i < b.length && a[i] === b[i]) i += 1;
    throw new Error(`FAIL: ${label} (first difference at ${i}: got ${JSON.stringify(a.slice(Math.max(0, i - 60), i + 60))} expected ${JSON.stringify(b.slice(Math.max(0, i - 60), i + 60))})`);
  }
  passed += 1;
}
const countOf = (text, needle) => String(text || "").split(needle).length - 1;
const slots = (html) => [...html.matchAll(SLOT_PATTERN)].map((m) => ({ index: m.index, html: m[0], minHeight: Number(m[1]), inner: m[2] }));
const sectionOf = (html, title) => {
  const start = html.indexOf(`<h2>${title}</h2>`);
  return start < 0 ? "" : html.slice(start, html.indexOf("</section>", start));
};

// ── 0. 소스 ────────────────────────────────────────────────────────────────
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const moduleSource = readFileSync(new URL("../src/modules/public/site-config.js", import.meta.url), "utf8");
const gateStart = source.indexOf("function adsMode(");
const gateEnd = gateStart < 0 ? -1 : source.indexOf("\n}\n", source.indexOf("function adsHeaders(", gateStart)) + 3;
ok(gateStart > 0 && gateEnd > gateStart, "광고 게이트 블록(adsMode~adsHeaders)이 있다");
const gate = source.slice(gateStart, gateEnd);
const outside = source.slice(0, gateStart) + source.slice(gateEnd);
for (const name of ["function adfitUnit(", "function adfitUnitStatus(", "function adsPolicyNetwork(", "const ADFIT_UNIT_SIZES = Object.freeze([", "const ADFIT_SDK_URL = ", "const ADFIT_POLICY_TEXT = Object.freeze({"]) {
  eq(countOf(gate, name), 1, `${name} 는 게이트 블록 안에 한 번 있다`);
  eq(countOf(outside, name), 0, `${name} 는 블록 밖에 없다`);
}
const fnBlock = (name) => {
  const start = source.indexOf(`function ${name}(`);
  return start < 0 ? "" : source.slice(start, source.indexOf("\n}\n", start) + 3);
};
ok(fnBlock("adsMode").includes('value === "adfit" ? "adfit" : "review"'), "adsMode 는 ADS_MODE 가 정확히 \"adfit\" 일 때만 애드핏으로 본다(그 밖의 값은 review)");
const envReads = [...new Set([...gate.matchAll(/\benv\??\.([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]))].sort();
eq(JSON.stringify(envReads), JSON.stringify(["ADFIT_UNIT_CONTENT", "ADFIT_UNIT_SIZE", "ADS_MODE", "ADS_SLOT_CONTENT"]), "게이트가 읽는 운영 변수는 ADS_MODE·ADS_SLOT_CONTENT·ADFIT_UNIT_CONTENT·ADFIT_UNIT_SIZE 넷이다(광고 네트워크를 고르는 변수를 따로 두지 않는다)");
eq(countOf(source, ".ADFIT_UNIT_CONTENT"), 1, "ADFIT_UNIT_CONTENT 는 한 곳에서만 읽는다");
eq(countOf(source, ".ADFIT_UNIT_SIZE"), 1, "ADFIT_UNIT_SIZE 는 한 곳에서만 읽는다");
ok(fnBlock("adfitUnit").includes(".ADFIT_UNIT_CONTENT") && fnBlock("adfitUnit").includes(".ADFIT_UNIT_SIZE") && fnBlock("adfitUnit").includes("/^DAN-[A-Za-z0-9]{6,32}$/"), "광고 단위 변수는 adfitUnit 에서만 읽고 ID 는 DAN-영문·숫자만 받는다");
for (const name of ["ADFIT_UNIT_CONTENT", "ADFIT_UNIT_SIZE"]) eq(countOf(outside, name), 0, `게이트 블록 밖에는 ${name} 가 없다`);
ok(!/\[\s*["'`](?:ADFIT_UNIT_CONTENT|ADFIT_UNIT_SIZE)["'`]\s*\]/.test(source) && !/\{[^}]*\b(?:ADFIT_UNIT_CONTENT|ADFIT_UNIT_SIZE)\b[^}]*\}\s*=/.test(source), "대괄호·구조 분해로 애드핏 변수를 읽는 우회가 없다");
for (const [pattern, label] of [[/kakaocdn\.net\/kas/, "애드핏 SDK 호스트"], [/kakao_ad_area/, "애드핏 광고 자리 클래스"], [/data-ad-(?:unit|width|height|onfail)/, "애드핏 설치 코드 속성"], [/info\.ds\.kakao\.com/, "카카오 맞춤형 광고 안내 주소"], [/adfitSlot/, "애드핏 자리 클래스"]]) {
  ok(!pattern.test(outside), `게이트 블록 밖에는 ${label} 문자열이 없다`);
}
eq(countOf(source, "https://t1.kakaocdn.net/kas/static/ba.min.js"), 1, "애드핏 SDK 주소는 소스에 한 번만 있다");
ok(gate.includes("https://github.com/adfit/adfit-web-sdk"), "설치 코드 근거(공식 SDK 안내 주소)를 소스 주석에 남긴다");
ok(moduleSource.includes("운영정책 5.2"), "로그인 뒤 화면을 빼는 근거(애드핏 운영정책 5.2)를 모듈 주석에 남긴다");
for (const path of ["wrangler.toml", "wrangler.json", "wrangler.jsonc", "monitoring/wrangler.jsonc", "tools/staging/wrangler.toml", "tools/staging/wrangler.jsonc"]) {
  const file = new URL(`../${path}`, import.meta.url);
  ok(!existsSync(file) || !/ADFIT_UNIT/.test(readFileSync(file, "utf8")), `${path} 에 애드핏 변수를 넣지 않았다(운영 대시보드에서만 설정)`);
}
const pageKeys = [...(source.match(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const publicPaths = [...(source.match(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const PUBLIC_ALLOWED = pageKeys.filter((key) => publicPaths.includes(key));
eq(PUBLIC_ALLOWED.length, 45, "애드핏 허용 화면은 공개 정본 문서 45쪽이다(AD_PAGE_KEYS ∩ PUBLIC_CONTENT_PATHS)");
eq(JSON.stringify(pageKeys.filter((key) => !publicPaths.includes(key))), JSON.stringify(["/reports", "/annual", "/smart-tools", "/start-guide", "/keyword-guide"]), "애드핏에서 빠지는 화면은 로그인 뒤 읽는 5개뿐이다");

// ── 렌더 준비 ─────────────────────────────────────────────────────────────
const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fixture = await createV2265QaFixture();

async function render(path, { ads = {}, cookie = false, method = "GET", env = {} } = {}) {
  const headers = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)", ...(cookie ? { cookie: fixture.cookie } : {}) };
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, { method, headers }), { ...fixture.env, ...env, ...ads }, {});
  const html = await response.text();
  const headerText = [...response.headers.entries()].sort().map(([key, value]) => `${key}: ${value}`).join("\n");
  return { status: response.status, headers: response.headers, headerText, html };
}
const UNIT_VARS = { ADFIT_UNIT_CONTENT: UNIT, ADFIT_UNIT_SIZE: "320x100" };
const ADFIT = { ADS_MODE: "adfit", ...UNIT_VARS };
const ADSENSE = { ADS_MODE: "live", ADS_SLOT_CONTENT: "1234567890" };
const ALL = [...PUBLIC_ALLOWED.map((path) => ({ path, key: path, kind: "public" })), ...SIGNED_IN.map((spec) => ({ ...spec, kind: "signed-in", cookie: true }))];

try {
  // ── 1. 기본값·AdSense 는 그대로, 정확히 adfit 이 아니거나 광고 단위가 없으면 광고 없음 ──────────
  const review = new Map();
  const adsense = new Map();
  for (const spec of ALL) {
    const opts = { cookie: !!spec.cookie };
    const base = await render(spec.path, opts);
    eq(base.status, 200, `${spec.path}: 기본값에서 열린다`);
    ok(!ADFIT_PATTERN.test(base.html), `${spec.path}: 기본값에는 애드핏 코드가 없다`);
    review.set(spec.path, base);
    for (const ads of [
      { ...UNIT_VARS },
      { ADS_MODE: "review", ...UNIT_VARS },
      { ADS_MODE: "ADFIT", ...UNIT_VARS },
      { ADS_MODE: "Adfit", ...UNIT_VARS },
      { ADS_MODE: " adfit", ...UNIT_VARS },
      { ADS_MODE: "adfit ", ...UNIT_VARS },
      { ADS_MODE: "kakao", ...UNIT_VARS },
      { ADS_MODE: "adfit" },
      { ADS_MODE: "adfit", ADFIT_UNIT_CONTENT: UNIT },
      { ADS_MODE: "adfit", ADFIT_UNIT_SIZE: "320x100" },
    ]) {
      const variant = await render(spec.path, { ...opts, ads });
      same(variant.html, base.html, `${spec.path} ${JSON.stringify(ads)}: HTML 이 review 와 바이트 동일하다`);
      same(variant.headerText, base.headerText, `${spec.path} ${JSON.stringify(ads)}: 헤더(CSP 포함)가 review 와 같다`);
    }
    const google = await render(spec.path, { ...opts, ads: ADSENSE });
    adsense.set(spec.path, google);
    ok(google.html.includes("adsbygoogle.js?client=") && !ADFIT_PATTERN.test(google.html), `${spec.path}: AdSense live 는 지금처럼 Google 로더를 싣고 애드핏 코드는 없다`);
    const googleWithUnit = await render(spec.path, { ...opts, ads: { ...ADSENSE, ...UNIT_VARS } });
    same(googleWithUnit.html, google.html, `${spec.path}: AdSense live 는 애드핏 광고 단위 변수가 있어도 바이트 동일하다`);
    same(googleWithUnit.headerText, google.headerText, `${spec.path}: AdSense live 헤더도 애드핏 광고 단위 변수와 상관없다`);
  }

  // ── 2·3. 애드핏 ───────────────────────────────────────────────────────────
  const liveCsp = adsense.get("/budget-guide").headers.get("content-security-policy");
  const reviewCsp = review.get("/budget-guide").headers.get("content-security-policy");
  ok(liveCsp !== reviewCsp && liveCsp.includes("frame-src 'self' https:"), "AdSense live CSP 는 review 보다 넓다(비교 기준)");
  ok(liveCsp.includes("font-src 'self' data:;") && !liveCsp.includes("media-src"), "AdSense live CSP 의 font-src·media-src 는 그대로다(애드핏만 더 연다)");
  // 애드핏 SDK 는 광고 틀을 같은 출처 iframe 에 써서 이 화면 CSP 를 물려받는다 → 애드핏 화면만 font-src 에 https:, media-src 'self' https: blob: 를 더한다.
  const adfitCsp = `${liveCsp.replace("font-src 'self' data:;", "font-src 'self' data: https:;")}; media-src 'self' https: blob:`;
  ok(countOf(adfitCsp, "font-src 'self' data: https:;") === 1 && adfitCsp.endsWith("; media-src 'self' https: blob:"), "애드핏 CSP 기대값 = AdSense live + font-src https: + media-src");
  // 공통 미리 렌더링 규칙(review 화면의 것)과 같은 대상·같은 시점의 미리 받기 규칙이 애드핏 화면의 기대값이다.
  const reviewRules = specTags(review.get("/budget-guide").html);
  ok(reviewRules.length === 1 && Object.keys(reviewRules[0].rules).join() === "prerender", "review 공개 화면은 공통 미리 렌더링 규칙 하나를 싣는다(비교 기준)");
  const adfitRules = JSON.stringify({ prefetch: reviewRules[0].rules.prerender });
  for (const spec of ALL) {
    const page = await render(spec.path, { cookie: !!spec.cookie, ads: ADFIT });
    const html = page.html;
    eq(page.status, 200, `${spec.path}: 애드핏에서 열린다`);
    ok(!GOOGLE_AD_PATTERN.test(html), `${spec.path}: 애드핏에는 Google 광고 코드가 없다(운영정책 5.2: 다른 광고 네트워크 스크립트 동시 게재 금지)`);
    if (spec.kind === "signed-in") {
      same(html, review.get(spec.path).html, `${spec.path}: 로그인 뒤 화면은 애드핏에서도 review 와 바이트 동일하다(광고 없음)`);
      same(page.headerText, review.get(spec.path).headerText, `${spec.path}: 로그인 뒤 화면의 헤더(CSP)도 review 와 같다`);
      continue;
    }
    const found = slots(html);
    eq(found.length, 1, `${spec.path}: 애드핏 자리는 하나다(한 페이지 4개 이하)`);
    eq(countOf(html, "kakao_ad_area"), 1, `${spec.path}: 광고 단위 ins 는 하나다`);
    eq(countOf(html, SDK), 1, `${spec.path}: SDK 는 공식 설치 코드 그대로 한 번 싣는다`);
    const slot = found[0];
    same(slot.inner, insFor(UNIT, "320", "100") + `<script>${SLOT_SCRIPT}</script>` + SDK, `${spec.path}: 자리 안은 ins(발급 값 그대로)·빈 자리 숨김·SDK 뿐이다`);
    eq(slot.minHeight, 156, `${spec.path}: 320x100 자리는 156px(100+56) 높이를 먼저 잡는다`);
    ok(html.slice(0, slot.index).endsWith("</article>") && html.slice(slot.index + slot.html.length).startsWith('<div class="pubReadingNext">'), `${spec.path}: 자리는 본문(article) 끝, 관련 글·바닥글 위다`);
    ok(html.indexOf(SDK) > html.indexOf("</head>"), `${spec.path}: SDK 는 본문 아래쪽에 있다(head 아님)`);
    eq(countOf(html, ".adSlot{display:block;min-height:120px;"), 1, `${spec.path}: 광고 자리 CSS 는 head 에 한 번 있다`);
    const headCss = `${adfitCss(320)}</style>`;
    ok(countOf(html, headCss) === 1 && html.indexOf(headCss) < html.indexOf("</head>"), `${spec.path}: 애드핏 자리 CSS(좌우 여백 없음·357px 이하 화면 끝까지)가 head 에 한 번 있다`);
    const rules = specTags(html);
    ok(rules.length === 1 && rules[0].index < html.indexOf("</head>") && JSON.stringify(rules[0].rules) === adfitRules && !page.headers.get("speculation-rules"), `${spec.path}: 미리 렌더링 대신 같은 대상·시점의 미리 받기 규칙 하나만 있다(보이지 않는 광고 요청 방지)`);
    eq(page.headers.get("content-security-policy"), adfitCsp, `${spec.path}: 애드핏 CSP 는 AdSense live 확장 + font-src·media-src 다`);
    ok(page.headers.get("x-frame-options") === "DENY" && page.headers.get("set-cookie") === null, `${spec.path}: 다른 보안 헤더는 그대로이고 쿠키를 굽지 않는다`);
    const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/type="(?:application\/ld\+json|speculationrules)"/.test(m[1]) && m[2].trim());
    for (const m of inline) new vm.Script(m[2]);
    ok(inline.some((m) => m[2] === SLOT_SCRIPT), `${spec.path}: 인라인 스크립트가 모두 문법상 온전하고 빈 자리 숨김 함수가 있다`);
    same((await render(spec.path, { ads: { ...ADFIT, ADS_SLOT_CONTENT: "1234567890" } })).html, html, `${spec.path}: 애드핏 렌더는 요청마다 같고 AdSense 슬롯 변수를 쓰지 않는다`);
  }
  // 빈 자리 숨김 함수는 광고 자리만 숨긴다.
  {
    const context = { hidden: null };
    vm.runInNewContext(`${NOAD_BODY}; malhaeAdfitNoAd({ closest(selector) { return selector === ".adSlot" ? slot : null; } }); malhaeAdfitNoAd(null); malhaeAdfitNoAd({});`, Object.assign(context, { slot: { style: {} } }));
    eq(context.slot.style.display, "none", "광고가 없으면 data-ad-onfail 함수가 광고 자리를 숨긴다(빈 인자에도 오류 없음)");
  }
  // SDK 를 받지 못하면(광고 차단·네트워크) 캡처 단계 error 처리기가 그 스크립트가 든 광고 자리만 숨긴다.
  {
    const listeners = [];
    const slot = { style: {} }, other = { style: {} };
    const context = { addEventListener: (type, fn, capture) => listeners.push({ type, fn, capture }) };
    vm.runInNewContext(SLOT_SCRIPT, context);
    ok(listeners.length === 1 && listeners[0].type === "error" && listeners[0].capture === true, "SDK 불러오기 실패는 window 캡처 단계 error 로 받는다(스크립트 오류 이벤트는 거품이 일지 않는다)");
    const fire = (target) => listeners[0].fn({ target });
    fire({ tagName: "IMG", closest: () => other });
    fire({ tagName: "SCRIPT", closest: () => null });
    fire(null);
    fire({});
    ok(!("display" in other.style), "광고 자리 밖 스크립트·이미지 오류는 아무것도 숨기지 않는다");
    fire({ tagName: "SCRIPT", closest: (selector) => (selector === ".adSlot" ? slot : null) });
    eq(slot.style.display, "none", "광고 자리 안 스크립트(SDK)를 받지 못하면 그 자리를 숨긴다");
  }
  const head = await render("/budget-guide", { method: "HEAD", ads: ADFIT });
  ok(head.status === 200 && head.html === "" && head.headers.get("content-security-policy") === adfitCsp, "HEAD 응답도 애드핏 헤더를 본문 없이 낸다");
  // 금지 화면: 정책·신원 화면, 로그인·가계부·관리·API 화면에는 광고가 없다.
  for (const spec of [
    ...POLICY_PAGES.map((path) => ({ path })),
    { path: "/my" }, { path: "/auth/kakao/start" }, { path: "/kakao-commands" }, { path: "/ads.txt" }, { path: "/not-a-public-guide" },
    { path: `/app?${C}`, cookie: true }, { path: `/budgets?${C}`, cookie: true }, { path: `/my/analysis?${C}`, cookie: true },
    { path: `/my/members?${C}`, cookie: true }, { path: `/my/backup?${C}`, cookie: true }, { path: "/my", cookie: true },
  ]) {
    const base = await render(spec.path, { cookie: !!spec.cookie });
    const page = await render(spec.path, { cookie: !!spec.cookie, ads: ADFIT });
    ok(!/kakao_ad_area|kas\/static\/ba\.min\.js|data-ad-unit/.test(page.html) && !GOOGLE_AD_PATTERN.test(page.html), `${spec.path}: 애드핏 금지 화면에는 광고 코드가 없다`);
    eq(page.headers.get("content-security-policy"), base.headers.get("content-security-policy"), `${spec.path}: 금지 화면의 CSP 는 review 와 같다`);
    if (!POLICY_PAGES.includes(spec.path) && spec.path !== "/my") same(page.html, base.html, `${spec.path}: 금지 화면 HTML 은 review 와 바이트 동일하다`);
  }

  // ── 4. 광고 단위 값 검증 ─────────────────────────────────────────────────
  for (const [size, w, h] of [["320x50", "320", "50"], ["320x100", "320", "100"], ["300x250", "300", "250"], ["250x250", "250", "250"]]) {
    for (const id of ["DAN-abcdef", "DAN-AbC123xyz789QRS", `DAN-${"a".repeat(32)}`]) {
      const html = (await render("/demo", { ads: { ...ADFIT, ADFIT_UNIT_CONTENT: id, ADFIT_UNIT_SIZE: size } })).html;
      const found = slots(html);
      ok(found.length === 1 && found[0].inner.startsWith(insFor(id, w, h)) && found[0].minHeight === Number(h) + 56, `/demo ${id} ${size}: 받은 값 그대로 한 자리를 그린다`);
      ok(countOf(html, adfitCss(w)) === 1, `/demo ${id} ${size}: 화면 끝까지 넓히는 폭 기준이 단위 폭 + 37px(${Number(w) + 37}px)이다`);
    }
  }
  const base = review.get("/demo");
  for (const bad of [
    { ADFIT_UNIT_CONTENT: "DAN-abcde" }, { ADFIT_UNIT_CONTENT: `DAN-${"a".repeat(33)}` }, { ADFIT_UNIT_CONTENT: "dan-abcdefgh" },
    { ADFIT_UNIT_CONTENT: " DAN-abcdefgh" }, { ADFIT_UNIT_CONTENT: "DAN-abcdefgh " }, { ADFIT_UNIT_CONTENT: 'DAN-abc"><script>alert(1)</script>' },
    { ADFIT_UNIT_CONTENT: "DAN-abc_defgh" }, { ADFIT_UNIT_CONTENT: "DAN-abcdefgh\n" }, { ADFIT_UNIT_CONTENT: "" }, { ADFIT_UNIT_CONTENT: 12345678 },
    { ADFIT_UNIT_SIZE: "728x90" }, { ADFIT_UNIT_SIZE: "160x600" }, { ADFIT_UNIT_SIZE: "320X100" }, { ADFIT_UNIT_SIZE: " 320x100" },
    { ADFIT_UNIT_SIZE: "320x100 " }, { ADFIT_UNIT_SIZE: "320*100" }, { ADFIT_UNIT_SIZE: "" }, { ADFIT_UNIT_SIZE: 320 },
  ]) {
    const page = await render("/demo", { ads: { ...ADFIT, ...bad } });
    same(page.html, base.html, `/demo ${JSON.stringify(bad)}: 맞지 않는 광고 단위 값은 없는 것과 같다(review 와 바이트 동일, 값이 HTML 에 옮겨지지 않음)`);
    same(page.headerText, base.headerText, `/demo ${JSON.stringify(bad)}: CSP 도 넓히지 않는다`);
  }

  // ── 5. 정책 화면 문구 ────────────────────────────────────────────────────
  const privacy = (await render("/privacy", { ads: ADFIT })).html;
  const privacyAds = sectionOf(privacy, "4. 제3자 광고와 쿠키");
  ok(privacyAds.includes("카카오 애드핏 광고를 표시합니다") && privacyAds.includes("주식회사 카카오") && privacyAds.includes("행태정보") && privacyAds.includes("로그인한 사람만 보는 화면"), "/privacy 애드핏: 광고 사업자·행태정보·광고를 두지 않는 화면을 적는다");
  ok(privacyAds.includes("광고를 누른 방문자의 개인정보를 따로 수집하지 않고") && privacyAds.includes("쿠키를 지우면 거부 설정도 함께 지워질 수 있습니다"), "/privacy 애드핏: 수집하지 않는 것과 거부 방법·쿠키 삭제 주의를 적는다");
  ok(privacyAds.includes('href="https://info.ds.kakao.com/optout.do"') && privacyAds.includes('href="https://www.kakao.com/policy/privacy"'), "/privacy 애드핏: 카카오 맞춤형 광고 안내·카카오 개인정보처리방침 링크");
  ok(!/Google|google\.com/.test(privacyAds), "/privacy 애드핏: 광고 절에 Google 안내가 남지 않는다");
  const cookies = (await render("/cookies", { ads: ADFIT })).html;
  const cookieAds = sectionOf(cookies, "광고 및 측정 기술");
  ok(cookieAds.includes("카카오 애드핏 광고를 표시합니다") && cookieAds.includes("카카오 맞춤형 광고 안내 화면과 브라우저의 사이트별 쿠키 설정") && cookieAds.includes('href="https://info.ds.kakao.com/optout.do"') && !/Google|google\.com/.test(cookieAds), "/cookies 애드핏: 광고 절은 카카오 기준 문장·링크다");
  ok(sectionOf(cookies, "쿠키 관리").includes("카카오 맞춤형 광고 안내 확인") && !sectionOf(cookies, "쿠키 관리").includes("Google") && !cookies.includes("<h2>지역별 동의</h2>"), "/cookies 애드핏: 쿠키 관리 목록은 카카오 안내이고 Google 지역별 동의 절은 없다");
  const faq = (await render("/faq", { ads: ADFIT })).html;
  ok(faq.includes("카카오 애드핏 광고를 표시하며") && !faq.includes("Google 광고를 실행하지 않습니다"), "/faq 애드핏: 광고 질문의 답이 카카오 기준이다");
  ok(faq.includes("맞춤형 광고는 카카오 맞춤형 광고 안내(https://info.ds.kakao.com/optout.do)에서 끌 수 있습니다."), "/faq 애드핏: 맞춤형 광고를 끄는 주소를 답에 적는다");
  for (const path of ["/privacy", "/cookies", "/faq"]) {
    const google = await render(path, { ads: ADSENSE });
    same((await render(path, { ads: { ...ADSENSE, ...UNIT_VARS } })).html, google.html, `${path}: AdSense live 는 애드핏 광고 단위 변수가 있어도 AdSense 문구 그대로다`);
    const reviewHtml = (await render(path)).html;
    same((await render(path, { ads: { ADS_MODE: "adfit" } })).html, reviewHtml, `${path}: 애드핏 광고 단위가 없으면(광고가 나가지 않으면) 지금 문장 그대로다`);
    same((await render(path, { ads: { ADS_MODE: "Adfit", ...UNIT_VARS } })).html, reviewHtml, `${path}: ADS_MODE 가 정확히 adfit 이 아니면 지금 문장 그대로다`);
    ok(!/카카오 애드핏/.test(reviewHtml) && !/카카오 애드핏/.test(google.html), `${path}: review·AdSense 화면에는 애드핏 문구가 없다`);
  }

  // ── 6. /ready 의 ads_mode·adfit_unit, /health 는 그대로 ──────────────────
  const readyEnv = { ADMIN_SESSION_SECRET: "qa-adfit-session", ADMIN_API_TOKEN: "qa-adfit-admin" };
  for (const [ads, mode, unit] of [
    [{}, "review", undefined], [{ ...UNIT_VARS }, "review", undefined], [{ ADS_MODE: "ADFIT", ...UNIT_VARS }, "review", undefined],
    [ADSENSE, "live", undefined], [{ ...ADSENSE, ...UNIT_VARS }, "live", undefined],
    [ADFIT, "adfit", "ok"], [{ ADS_MODE: "adfit" }, "adfit", "missing"],
    [{ ...ADFIT, ADFIT_UNIT_SIZE: "728x90" }, "adfit", "missing"], [{ ...ADFIT, ADFIT_UNIT_CONTENT: "DAN-abc" }, "adfit", "missing"],
  ]) {
    const missing = JSON.parse((await render("/ready", { ads })).html);
    const full = JSON.parse((await render("/ready", { ads, env: readyEnv })).html);
    for (const [label, body] of [["필수 설정 누락 503", missing], ["점검 경로", full]]) {
      eq(body.ads_mode, mode, `/ready (${label}) ads_mode=${mode} (${JSON.stringify(ads)})`);
      eq(body.adfit_unit, unit, `/ready (${label}) adfit_unit=${unit} (${JSON.stringify(ads)})`);
      ok(unit !== undefined || !("adfit_unit" in body), `/ready (${label}): 애드핏이 아니면 adfit_unit 키를 더하지 않는다 (${JSON.stringify(ads)})`);
      ok(!JSON.stringify(body).includes(UNIT), `/ready (${label}): 광고 단위 ID 를 내보이지 않는다 (${JSON.stringify(ads)})`);
    }
  }
  const healthReview = JSON.parse((await render("/health")).html);
  const healthAdfit = JSON.parse((await render("/health", { ads: ADFIT })).html);
  ok(!("adfit_unit" in healthAdfit) && !("ads_mode" in healthAdfit) && JSON.stringify(Object.keys(healthAdfit)) === JSON.stringify(Object.keys(healthReview)), "/health 의 모양은 바뀌지 않는다");

  console.log(`V22.9.92 애드핏 광고 게이트 검사 통과 (${passed} checks)`);
} finally {
  fixture.restore();
  globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
}
