// V22.9.40 (B) 광고 게이트(ADS_MODE) 검사.
//
// AdSense 재심사 중에는 광고 게이트가 생기기 전과 같은 HTML·헤더를 내야 하고(기본값 = review),
// 승인 뒤 운영 변수 ADS_MODE 를 정확히 "live" 로 바꿨을 때만 허용 화면에 광고 로더·슬롯·CSP 확장이
// 붙어야 한다. 이 검사는 다음을 확인한다.
//   0. 소스: 게이트 블록 하나, 변수는 한 함수에서만 읽음, 블록 밖에는 광고 호스트·슬롯 마크업 없음
//   1. ADS_MODE 가 없거나 "live" 가 아닌 값이면 허용 화면의 HTML·헤더가 미설정과 바이트 동일
//   2. live 허용 화면: 로더 정확히 1개·고정 게시자, 슬롯은 유효한 ADS_SLOT_CONTENT 일 때만 1개
//   3. live 금지 화면(입력·설정·분석·로그인·관리자·API·/skill·404·안전모드): 광고 0, 헤더·HTML 동일
//   4. live CSP: frame-src 와 광고 호스트 허용, 나머지 보호 지시어는 그대로
//   5. /reports: 인라인 CSS 24 KiB 이하·no-store·기존 핀 유지, 광고 절 안에 조작 요소 없음
//   6. 정책 문구 전환, 7. /ready 의 ads_mode, 8. html-postprocess 를 거친 최종 HTML 의 스크립트
// 렌더링은 QA 픽스처와 app.fetch 로만 한다(서버·네트워크 없음).
import { readFileSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import vm from "node:vm";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { beforeBotObservationRenderer } from "./lib-audit-v22934.mjs";

const ORIGIN = "https://malhaebook.com";
const PUBLISHER_CLIENT = "ca-pub-3546469870344416";
const LOADER = `<script async src="https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${PUBLISHER_CLIENT}" crossorigin="anonymous"></script>`;
const PUSH_BODY = "(adsbygoogle=window.adsbygoogle||[]).push({});";
const PUSH = `<script>${PUSH_BODY}</script>`;
const SLOT = "1234567890";
const INS = `<ins class="adsbygoogle" style="display:block" data-ad-client="${PUBLISHER_CLIENT}" data-ad-slot="${SLOT}" data-ad-format="auto" data-full-width-responsive="true"></ins>`;
const AD_RUNTIME_PATTERN = /adsbygoogle|googlesyndication|googleadservices|doubleclick|pagead/i;
const AD_COOKIE_PATTERN = /__gads|__gpi|__eoi/i;
const AD_SECTION_PATTERN = /<section class="card adSlot noPrint[^"]*" aria-label="광고">([\s\S]*?)<\/section>/g;
const REVIEW_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://cdn.jsdelivr.net https://developers.kakao.com; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://kauth.kakao.com https://kapi.kakao.com; worker-src 'self' blob: https://cdn.jsdelivr.net";
// 출처: https://support.google.com/adsense/answer/16283098 (AdSense 는 strict CSP 또는 그보다 느슨한 정책만 지원).
const LIVE_CSP = "default-src 'self'; base-uri 'self'; object-src 'none'; frame-ancestors 'none'; form-action 'self'; script-src 'self' 'unsafe-inline' https://cdn.sheetjs.com https://cdn.jsdelivr.net https://developers.kakao.com 'unsafe-eval' https:; style-src 'self' 'unsafe-inline' https:; img-src 'self' data: blob: https:; font-src 'self' data:; connect-src 'self' https://cdn.jsdelivr.net https://cdn.sheetjs.com https://kauth.kakao.com https://kapi.kakao.com https:; worker-src 'self' blob: https://cdn.jsdelivr.net; frame-src 'self' https:";
const C = "month=2026-07&household_id=house-home";
// V22.9.40 (D 병합): 생활비 가이드 글 12편도 공개 허용 화면이다(정본 30 − 정책·신원 6 = 24). 렌더 검사도 같은 기준으로 돈다.
const PUBLIC_ARTICLES = ["/budget-ratio-guide", "/fixed-cost-checklist", "/subscription-cleanup", "/card-spending-threshold", "/shared-living-cost-rules", "/accountbook-habit", "/payday-budget-cycle", "/expense-category-rules", "/emergency-fund-basics", "/weekly-report-reading", "/family-roles-accountbook", "/cash-flow-table"];
// V22.9.74: 글 목록 허브 1쪽 + 생활비 가이드 글 20편도 공개 허용 화면이다(정본 51 − 정책·신원 6 = 45).
const PUBLIC_ARTICLES_V22974 = ["/articles", "/household-spending-statistics", "/single-household-living-cost", "/food-cost-benchmark", "/utility-bills-seasonality", "/inflation-budget-update", "/card-income-deduction-basics", "/year-end-tax-expense-check", "/rent-tax-credit-records", "/apartment-maintenance-fee", "/mobile-plan-cost-review", "/sinking-fund-annual-expenses", "/debt-repayment-order", "/savings-rate-tracking", "/first-job-budget", "/car-ownership-cost", "/childcare-cost-planning", "/couple-account-structure", "/roommate-shared-ledger", "/monthly-closing-routine", "/expense-review-questions"];
const PUBLIC_ALLOWED = ["/", "/service-guide", "/how-it-works", "/kakao-guide", "/budget-guide", "/group-accountbook", "/security", "/faq", "/guides", "/demo", "/report-guide", "/import-guide", ...PUBLIC_ARTICLES, ...PUBLIC_ARTICLES_V22974];
const POLICY_PAGES = ["/privacy", "/terms", "/cookies", "/contact", "/about", "/site-map"];
const SIGNED_IN_ALLOWED = ["/reports", "/annual", "/smart-tools", "/start-guide", "/keyword-guide"];

let passed = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  passed += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  passed += 1;
}
// 긴 HTML 을 비교할 때는 처음 달라지는 자리만 보여 준다.
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
const withoutCsp = (headerText) => headerText.split("\n").filter((line) => !line.startsWith("content-security-policy:")).join("\n");
const inlineCssBytes = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((sum, m) => sum + Buffer.byteLength(m[1]), 0);
const h2s = (html) => [...html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)].map((m) => ({ index: m.index, text: m[1].replace(/<[^>]+>/g, "").trim() }));
const adSections = (html) => [...html.matchAll(AD_SECTION_PATTERN)].map((m) => ({ index: m.index, html: m[0], inner: m[1] }));

function cspDirectives(policy) {
  const map = new Map();
  for (const part of String(policy || "").split(";")) {
    const tokens = part.trim().split(" ").filter(Boolean);
    if (tokens.length) map.set(tokens[0], tokens.slice(1));
  }
  return map;
}
// 지시어 하나가 그 주소를 허용하는지(없으면 대체 지시어 → default-src). 스킴·'self'·호스트·*.호스트만 다룬다.
function cspAllows(policy, directive, address, fallbacks = []) {
  const map = cspDirectives(policy);
  const name = [directive, ...fallbacks, "default-src"].find((key) => map.has(key));
  const target = new URL(address);
  return (map.get(name) || []).some((source) => {
    if (source === "'self'") return target.origin === ORIGIN;
    if (/^[a-z][a-z0-9+.-]*:$/.test(source)) return target.protocol === source;
    if (source.startsWith("'")) return false;
    const m = source.match(/^(https?):\/\/(\*\.)?([^/:]+)/);
    if (!m || `${m[1]}:` !== target.protocol) return false;
    return m[2] ? target.hostname.endsWith(`.${m[3]}`) : target.hostname === m[3];
  });
}

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
function functionBlock(name) {
  const start = source.indexOf(`function ${name}(`);
  const end = start < 0 ? -1 : source.indexOf("\n}\n", start);
  return start < 0 || end < 0 ? "" : source.slice(start, end + 2);
}
function functionBlockHash(marker) {
  const start = source.indexOf(marker);
  const end = source.indexOf("\nfunction ", start + marker.length);
  const block = source.slice(start, end);
  return createHash("sha256").update(marker === "function renderMyAnalysisHtml(" ? beforeBotObservationRenderer(block) : block).digest("hex");
}

// ── 0. 소스 ────────────────────────────────────────────────────────────────
const gateStart = source.indexOf("function adsMode(");
const gateEnd = gateStart < 0 ? -1 : source.indexOf("\n}\n", source.indexOf("function adsHeaders(", gateStart)) + 3;
ok(gateStart > 0 && gateEnd > gateStart, "광고 게이트 블록(adsMode~adsHeaders)이 있다");
eq(countOf(source, "function adsMode("), 1, "adsMode 는 한 번만 선언된다");
eq(countOf(source, "function adsHeaders("), 1, "adsHeaders 는 한 번만 선언된다");
const gate = source.slice(gateStart, gateEnd);
const outside = source.slice(0, gateStart) + source.slice(gateEnd);
for (const name of ["function adsSlotId(", "function adsPageLive(", "function adsHeadMarkup(", "function adSlotMarkup(", "function adsPolicyText(", "function adsPolicyLinks(", "function adsLiveCsp(", "const AD_PAGE_KEYS = Object.freeze(["]) {
  eq(countOf(gate, name), 1, `${name} 는 게이트 블록 안에 한 번 있다`);
  eq(countOf(outside, name), 0, `${name} 는 블록 밖에 없다`);
}
eq(countOf(source, ".ADS_MODE"), 1, "ADS_MODE 는 소스 전체에서 한 곳에서만 읽는다");
ok(functionBlock("adsMode").includes("env?.ADS_MODE === \"live\""), "ADS_MODE 를 읽는 곳은 adsMode 이고 정확히 \"live\" 만 live 로 본다");
eq(countOf(outside, "ADS_MODE"), 0, "게이트 블록 밖에는 ADS_MODE 를 읽거나 적는 곳이 없다");
eq(countOf(source, ".ADS_SLOT_CONTENT"), 1, "ADS_SLOT_CONTENT 는 소스 전체에서 한 곳에서만 읽는다");
ok(functionBlock("adsSlotId").includes(".ADS_SLOT_CONTENT") && functionBlock("adsSlotId").includes("/^[0-9]{8,12}$/"), "ADS_SLOT_CONTENT 는 adsSlotId 에서 숫자 8~12자리로만 받는다");
eq(countOf(outside, "ADS_SLOT_CONTENT"), 0, "게이트 블록 밖에는 ADS_SLOT_CONTENT 가 없다");
ok(!/\[\s*["'`]ADS_(?:MODE|SLOT_CONTENT)["'`]\s*\]/.test(source) && !/\{[^}]*\bADS_(?:MODE|SLOT_CONTENT)\b[^}]*\}\s*=/.test(source), "대괄호·구조 분해로 광고 변수를 읽는 우회가 없다");
for (const [pattern, label] of [[/googlesyndication/i, "Google 광고 런타임 호스트"], [/adsbygoogle/i, "adsbygoogle"], [/doubleclick/i, "DoubleClick"], [/pagead/i, "pagead"], [/googleadservices/i, "googleadservices"], [AD_COOKIE_PATTERN, "광고 쿠키 식별자"], [/data-ad-(?:client|slot)/, "광고 슬롯 속성"], [/class="card adSlot/, "광고 절 마크업"]]) {
  ok(!pattern.test(outside), `게이트 블록 밖에는 ${label} 문자열이 없다`);
}
eq(countOf(source, "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client="), 1, "광고 로더 주소는 소스에 한 번만 있다");
ok(!source.includes("ADSENSE_ENABLED") && !source.includes("ADSENSE_AUTO_ADS"), "예전 활성화 스위치 이름은 여전히 소스에 없다");
ok(gate.includes("support.google.com/adsense/answer/16283098") && gate.includes("developers.google.com/publisher-tag/guides/content-security-policy"), "CSP 확장 근거(공식 문서 주소)를 소스 주석에 남긴다");
ok(source.includes("AdSense review mode is ownership-only"), "심사 모드 소유권 메타 주석은 그대로다");
const pageKeys = [...(source.match(/const AD_PAGE_KEYS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
const publicPaths = [...(source.match(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
eq(publicPaths.length, 51, "공개 정본 문서는 51개다(가이드 18 + V22.9.40 생활비 가이드 글 12 + V22.9.74 허브 1·글 20)");
eq(pageKeys.filter((key) => publicPaths.includes(key)).length, 45, "공개 허용 화면은 45쪽이다(정본 51 − 정책·신원 6)");
eq(JSON.stringify(pageKeys.filter((key) => publicPaths.includes(key)).sort()), JSON.stringify(publicPaths.filter((path) => !POLICY_PAGES.includes(path)).sort()), "공개 허용 화면 = 정본 문서 - 정책·신원 6쪽");
eq(JSON.stringify(pageKeys.filter((key) => !publicPaths.includes(key))), JSON.stringify(SIGNED_IN_ALLOWED), "로그인 뒤 허용 화면은 리포트·연간·스마트 도구·두 가이드뿐이다");
for (const key of ["/app", "/my", "/menu", "/my/settings", "/budgets", "/my/analysis", "/my/households", "/my/members", "/my/backup", "/payment-methods", "/settlement-summary", "/reserve-plans", "/admin-view", "/operation-center", "/skill", "/api", "/u/api", ...POLICY_PAGES]) {
  ok(!pageKeys.includes(key), `${key} 는 허용 화면 키가 아니다`);
}
// V22.9.40 통합: 패키지 A(U10)가 578·687행 aria-label 에 비율을 더해 해시가 c2b199d2…4dc8a 에서 바뀌었다(두 줄을 되돌리면 이전 해시와 같음 — validate-polish-v22940 이 확인). 광고 게이트는 이 클라이언트를 바꾸지 않는다.
// Authorized C/observed-period changes only; 37 unaffected V56 declarations are
// protected by validate-lucian-c-comparison, independent of this whole hash.
eq(functionBlockHash("function insightClientMain("), "754e8bb457aa52aabf5bb8f8b4e1f8d0c250056d761a68908395094b7fd0caad", "광고 게이트는 승인된 C·관측 기간 기준과 비대상 분석 보호를 유지합니다.");
eq(functionBlockHash("function renderMyAnalysisHtml("), "db2edc2887985b44fd9456a38b7b5f014c4a8739bc5e0c4bca2ba21626ff4bfd", "BOT-09 관측 표시 두 곳만 되돌리면 기존 분석 렌더러와 같다");
for (const path of ["wrangler.toml", "wrangler.json", "wrangler.jsonc", "monitoring/wrangler.jsonc"]) {
  const file = new URL(`../${path}`, import.meta.url);
  ok(!existsSync(file) || !/ADS_MODE|ADS_SLOT_CONTENT/.test(readFileSync(file, "utf8")), `${path} 에 광고 변수를 넣지 않았다(운영 대시보드에서만 설정)`);
}

// ── 렌더 준비 ─────────────────────────────────────────────────────────────
const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fixture = await createV2265QaFixture();
const createdAt = "2026-07-02T00:00:00.000Z";
fixture.db.users.push(
  { id: "user-ads-viewer", kakao_user_key: "kakao_login:2940", nickname: "조회", created_at: createdAt },
  { id: "user-ads-solo", kakao_user_key: "kakao_login:2941", nickname: "새 사용자", created_at: createdAt },
);
fixture.db.household_members.push({ household_id: "house-home", user_id: "user-ads-viewer", role: "viewer", created_at: createdAt });
const viewerCookie = await fixture.cookieFor("user-ads-viewer");
const soloCookie = await fixture.cookieFor("user-ads-solo");
const ADMIN_TOKEN = "qa-ads-gate-admin-token";

async function render(path, { ads = {}, cookie = "", admin = false, method = "GET", body = null, env = {}, headers = {} } = {}) {
  const requestHeaders = {
    "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)",
    ...(cookie ? { cookie } : {}),
    ...(admin ? { authorization: `Bearer ${ADMIN_TOKEN}` } : {}),
    ...headers,
  };
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, { method, headers: requestHeaders, ...(body ? { body } : {}) }), { ...fixture.env, ...(admin ? { ADMIN_API_TOKEN: ADMIN_TOKEN } : {}), ...env, ...ads }, {});
  const text = await response.text();
  const headerText = [...response.headers.entries()].sort().map(([key, value]) => `${key}: ${value}`).join("\n");
  return { status: response.status, headers: response.headers, headerText, html: text };
}
const LIVE = { ADS_MODE: "live", ADS_SLOT_CONTENT: SLOT };

const ALLOWED = [
  ...PUBLIC_ALLOWED.map((path) => ({ path, key: path, kind: "public" })),
  { path: `/reports?${C}`, key: "/reports", cookie: true },
  { path: `/annual?year=2026&household_id=house-home`, key: "/annual", cookie: true },
  { path: `/smart-tools?${C}`, key: "/smart-tools", cookie: true },
  { path: `/start-guide?${C}`, key: "/start-guide", cookie: true },
  { path: `/keyword-guide?${C}`, key: "/keyword-guide", cookie: true },
  // 같은 화면을 그리는 다른 주소(주간 리포트, 연간 별칭, 예전 스마트 도구 주소)
  { path: `/reports?${C}&range=week&week=2026-07-06`, key: "/reports", cookie: true },
  { path: `/annual-report?year=2026&household_id=house-home`, key: "/annual", cookie: true },
  { path: `/my/premium?${C}`, key: "/smart-tools", cookie: true },
];
const optionsFor = (spec) => ({ cookie: spec.cookie ? fixture.cookie : "" });

try {
  // ── 1. 기본값(review)의 바이트 동일성 ─────────────────────────────────────
  const review = new Map();
  for (const spec of ALLOWED) {
    const base = await render(spec.path, optionsFor(spec));
    review.set(spec.path, base);
    eq(base.status, 200, `${spec.path}: 기본값에서 열린다`);
    ok(!AD_RUNTIME_PATTERN.test(base.html) && !AD_COOKIE_PATTERN.test(base.html), `${spec.path}: 기본값에는 광고 런타임·슬롯·쿠키 코드가 없다`);
    eq(base.headers.get("content-security-policy"), REVIEW_CSP, `${spec.path}: 기본값의 CSP 는 지금 정책 그대로다`);
    const variants = [
      { ADS_MODE: "review" }, { ADS_MODE: "LIVE" }, { ADS_MODE: "on" }, { ADS_MODE: "1" }, { ADS_MODE: "" },
      { ADS_MODE: " live " }, { ADS_MODE: "Live" }, { ADS_SLOT_CONTENT: SLOT }, { ADS_MODE: "review", ADS_SLOT_CONTENT: SLOT },
    ];
    for (const ads of variants) {
      const variant = await render(spec.path, { ...optionsFor(spec), ads });
      const label = `${spec.path} ${JSON.stringify(ads)}`;
      same(variant.html, base.html, `${label}: HTML 이 미설정과 바이트 동일하다`);
      same(variant.headerText, base.headerText, `${label}: 헤더(CSP 포함)가 미설정과 같다`);
    }
  }

  // ── 2. live 허용 화면 ─────────────────────────────────────────────────────
  const live = new Map();
  for (const spec of ALLOWED) {
    const page = await render(spec.path, { ...optionsFor(spec), ads: LIVE });
    live.set(spec.path, page);
    const html = page.html;
    eq(page.status, 200, `${spec.path}: live 에서 열린다`);
    eq(countOf(html, LOADER), 1, `${spec.path}: 광고 로더는 고정 게시자 주소로 정확히 1개다`);
    ok(html.indexOf(LOADER) < html.indexOf("</head>"), `${spec.path}: 로더는 head 안에 있다`);
    eq(countOf(html, "googlesyndication.com"), 1, `${spec.path}: 광고 호스트는 로더 한 곳에만 나온다`);
    ok([...html.matchAll(/ca-pub-[0-9]+/g)].every((m) => m[0] === PUBLISHER_CLIENT), `${spec.path}: 다른 게시자 ID 가 없다`);
    eq(countOf(html, INS), 1, `${spec.path}: 슬롯은 유효한 슬롯 id 로 정확히 1개다`);
    eq(countOf(html, PUSH), 1, `${spec.path}: 슬롯 초기화 스크립트는 1개다`);
    eq(countOf(html, ".adSlot{display:block;min-height:120px;"), 1, `${spec.path}: 광고 자리 높이를 먼저 잡는 live 전용 CSS 가 1번 있다`);
    ok(html.includes("html body .adSlot.adSlot.adSlot{margin-top:24px!important;margin-bottom:24px!important}") && html.includes("@media print{.adSlot{display:none!important}}"), `${spec.path}: 주변과 24px 띄우고 인쇄에서는 뺀다`);
    const sections = adSections(html);
    eq(sections.length, 1, `${spec.path}: 광고 절은 하나다`);
    const section = sections[0];
    ok(!/<(?:form|button|a|input|select|textarea|summary|details)\b/i.test(section.inner), `${spec.path}: 광고 절 안에 폼·버튼·링크가 없다`);
    ok(/class="card adSlot noPrint/.test(section.html) && !/<h[1-6]\b/i.test(section.inner), `${spec.path}: 광고 절은 noPrint 이고 제목을 더하지 않는다`);
    eq(countOf(html.slice(0, section.index), "<form"), countOf(html.slice(0, section.index), "</form>"), `${spec.path}: 광고 절은 폼 안에 있지 않다`);
    eq(page.headers.get("content-security-policy"), LIVE_CSP, `${spec.path}: live 허용 화면만 CSP 를 넓힌다`);
    same(withoutCsp(page.headerText), withoutCsp(review.get(spec.path).headerText), `${spec.path}: CSP 밖의 헤더(캐시·색인·보안)는 review 와 같다`);
    // 자리: 화면마다 정한 곳 하나.
    const before = h2s(html).filter((h) => h.index < section.index).pop()?.text || "";
    const after = html.slice(section.index + section.html.length);
    const nextH2 = h2s(html).find((h) => h.index > section.index)?.text || "";
    if (spec.kind === "public") {
      ok(html.slice(0, section.index).endsWith("</article>") && after.startsWith('<div class="pubReadingNext">'), `${spec.path}: 공개 가이드는 본문(article) 끝, 관련 가이드·푸터 위에 둔다`);
    } else if (spec.key === "/reports") {
      ok(before === "지출 상위 분류" && nextH2 === "생활 패턴" && after.startsWith('<section class="card abV5SectionCard" id="pattern">'), `${spec.path}: 리포트는 지출 상위 분류 아래·생활 패턴 위(자동 생성 설정보다 위)에 둔다`);
      ok(html.indexOf("<h2>자동 생성 설정</h2>") > section.index, `${spec.path}: 광고는 자동 생성 설정 절보다 위다`);
    } else if (spec.key === "/annual") {
      ok(before === "연간 카테고리 TOP6" && nextH2 === "연말정산 참고", `${spec.path}: 연간 리포트는 본문(TOP6) 아래, 내보내기 버튼과 떨어진 곳에 둔다`);
    } else if (spec.key === "/smart-tools") {
      ok(before === "큰 지출 점검" && after.startsWith('<p class="notice">'), `${spec.path}: 스마트 도구는 본문 아래·안내문 위에 둔다`);
    } else if (spec.key === "/start-guide") {
      ok(before === "입력 예시" && after.startsWith("</div></main>"), `${spec.path}: 시작 가이드는 본문 끝에 둔다`);
    } else if (spec.key === "/keyword-guide") {
      ok(before === "카테고리별 추천 예시" && after.startsWith("</main>"), `${spec.path}: 키워드 안내는 편집기 아래 읽기 전용 예시 뒤에 둔다`);
    }
    same((await render(spec.path, { ...optionsFor(spec), ads: LIVE })).html, html, `${spec.path}: live 렌더는 요청마다 같다(무작위 값 없음)`);
    const noSlot = await render(spec.path, { ...optionsFor(spec), ads: { ADS_MODE: "live" } });
    eq(countOf(noSlot.html, LOADER), 1, `${spec.path}: 슬롯 id 가 없어도 로더는 남는다(자동 광고용)`);
    eq(adSections(noSlot.html).length + countOf(noSlot.html, "data-ad-slot") + countOf(noSlot.html, PUSH), 0, `${spec.path}: 슬롯 id 가 없으면 광고 절·슬롯·초기화가 없다`);
    eq(noSlot.headers.get("content-security-policy"), LIVE_CSP, `${spec.path}: 슬롯 id 가 없어도 로더를 위해 CSP 는 넓힌다`);
    live.set(`${spec.path}#noslot`, noSlot);
  }

  // 잘못된 슬롯 id 는 없는 것과 같다(값이 HTML 에 옮겨지지 않는다).
  for (const path of ["/budget-guide", `/reports?${C}`]) {
    const reference = live.get(`${path}#noslot`).html;
    const cookie = path.startsWith("/reports") ? fixture.cookie : "";
    for (const bad of ["<script>", "abcdefghij", "1234567", "1234567890123", " 1234567890", "1234567890 ", "１２３４５６７８９０", "12345678901234567890", "12345e7890"]) {
      const page = await render(path, { cookie, ads: { ADS_MODE: "live", ADS_SLOT_CONTENT: bad } });
      same(page.html, reference, `${path} 슬롯 ${JSON.stringify(bad)}: 무시하고 슬롯 없는 live 화면과 같다`);
      ok(!page.html.includes(`data-ad-slot="${bad}"`) && (bad === "<script>" || !page.html.includes(bad.trim())), `${path} 슬롯 ${JSON.stringify(bad)}: 값이 HTML 에 나타나지 않는다`);
    }
  }
  const legacyOwner = await render("/budget-guide", { ads: LIVE, env: { ADSENSE_PUBLISHER_ID: "ca-pub-1111111111111111", GOOGLE_ADSENSE_ACCOUNT: "ca-pub-2222222222222222" } });
  ok(!legacyOwner.html.includes("ca-pub-1111111111111111") && !legacyOwner.html.includes("ca-pub-2222222222222222") && countOf(legacyOwner.html, LOADER) === 1, "예전 게시자 변수는 live 에서도 고정 게시자를 바꾸지 못한다");

  // ── 3. live 금지 화면 ─────────────────────────────────────────────────────
  const forbidden = [
    ...[`/app?${C}`, `/app?${C}&view=calendar`, `/menu?${C}`, `/my/settings?${C}`, `/budgets?${C}`, `/my/analysis?${C}`, `/my/analysis?view=report&${C}`,
      `/my/households?${C}`, `/my/members?${C}`, `/my/backup?${C}`, `/payment-methods?${C}`, `/settlement-summary?${C}`, `/reserve-plans?${C}`, `/my/groups?${C}`,
      `/my/profile?${C}`, `/my/backup-login`, `/my/kakao-claim`, `/goals?${C}`, `/budget-alerts?${C}`, `/calendar?${C}`, `/my?${C}`,
      `/api/calendar?${C}`, `/u/api/notifications?household_id=house-home`, `/u/api/recent-transactions?household_id=house-home`, "/u/api/tx/search?q=%EC%A0%90%EC%8B%AC&household_id=house-home"].map((path) => ({ path, cookie: fixture.cookie })),
    ...["/my", "/start-guide", "/auth/kakao/start", "/skill", "/kakao-commands", "/backup-safety", "/household-flow", "/openbuilder-guide", "/welcome", "/not-a-public-guide", "/share", "/ads.txt", "/robots.txt", "/sitemap.xml"].map((path) => ({ path })),
    ...POLICY_PAGES.map((path) => ({ path, policy: true })),
    ...["/?legacy=1", "/admin-view", "/operation-center", "/budgets", "/settings", "/backup", "/start-guide", `/annual?year=2026&household_id=house-home`].map((path) => ({ path, admin: true })),
    // 가계부가 없는 사용자의 시작 화면(만들기·참여 폼), 기록이 없는 기간의 리포트, 조회 전용 참여자의 설정 화면
    { path: `/start-guide?month=2026-07`, cookie: soloCookie },
    { path: `/reports?month=2026-07`, cookie: soloCookie },
    { path: `/reports?month=2026-01&household_id=house-home`, cookie: fixture.cookie },
    { path: `/annual?year=2025&household_id=house-home`, cookie: fixture.cookie },
    { path: `/smart-tools?month=2026-01&household_id=house-home`, cookie: fixture.cookie },
    { path: `/my/settings?${C}`, cookie: viewerCookie },
  ];
  for (const spec of forbidden) {
    const options = { cookie: spec.cookie || "", admin: !!spec.admin };
    const base = await render(spec.path, options);
    const page = await render(spec.path, { ...options, ads: LIVE });
    const who = spec.admin ? "관리자" : spec.cookie ? "로그인" : "비로그인";
    eq(page.status, base.status, `${spec.path} (${who}): live 에서도 상태 코드가 같다`);
    // 개인정보처리방침·쿠키 안내는 live 에서 "DoubleClick 쿠키"를 글로 고지한다(AdSense 필수 고지). 코드만 본다.
    const codePattern = spec.policy ? /adsbygoogle|googlesyndication|googleadservices|pagead|data-ad-(?:client|slot)/i : AD_RUNTIME_PATTERN;
    ok(!codePattern.test(page.html) && !AD_COOKIE_PATTERN.test(page.html), `${spec.path} (${who}): live 에서도 광고 런타임·슬롯·쿠키 코드가 없다`);
    same(page.headerText, base.headerText, `${spec.path} (${who}): live 에서도 헤더(CSP 포함)가 review 와 같다`);
    if (!["/privacy", "/cookies"].includes(spec.path)) same(page.html, base.html, `${spec.path} (${who}): live 에서도 본문이 review 와 바이트 동일하다`);
  }
  const skillBody = JSON.stringify({ intent: { id: "i1", name: "블록" }, userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance: "도움말", lang: "kr", user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } } }, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] });
  for (const ads of [{}, LIVE]) {
    const kakao = await render("/skill", { method: "POST", body: skillBody, headers: { "content-type": "application/json" }, ads });
    ok(kakao.status === 200 && kakao.headers.get("content-type").includes("application/json") && !AD_RUNTIME_PATTERN.test(kakao.html) && !kakao.headers.has("content-security-policy"), `/skill POST ${ads.ADS_MODE || "review"}: 카카오 응답에는 광고·CSP 가 붙지 않는다`);
  }
  const broken = { PUBLIC_SUPPORT_EMAIL: { toString() { throw new Error("synthetic-public-render-failure"); } } };
  const safeMode = await render("/guides", { ads: LIVE, env: broken });
  ok(safeMode.status === 500 && safeMode.html.includes("안전모드") && !AD_RUNTIME_PATTERN.test(safeMode.html) && safeMode.headers.get("content-security-policy") === REVIEW_CSP, "허용 화면이 실패해 안전모드로 바뀌면 광고도 CSP 확장도 없다");

  // ── 4. CSP ────────────────────────────────────────────────────────────────
  const liveCsp = live.get("/budget-guide").headers.get("content-security-policy");
  const reviewDirectives = cspDirectives(REVIEW_CSP);
  const liveDirectives = cspDirectives(liveCsp);
  for (const name of ["default-src", "base-uri", "object-src", "frame-ancestors", "form-action", "img-src", "font-src", "worker-src"]) {
    eq(JSON.stringify(liveDirectives.get(name)), JSON.stringify(reviewDirectives.get(name)), `live CSP 의 ${name} 는 그대로다`);
  }
  for (const name of ["script-src", "style-src", "connect-src"]) {
    ok(liveDirectives.get(name).join(" ").startsWith(reviewDirectives.get(name).join(" ")), `live CSP 의 ${name} 는 기존 출처를 모두 유지하고 뒤에만 더한다`);
  }
  ok(!reviewDirectives.has("frame-src") && JSON.stringify(liveDirectives.get("frame-src")) === JSON.stringify(["'self'", "https:"]), "live CSP 에만 frame-src 'self' https: 가 생긴다");
  ok(liveDirectives.get("script-src").includes("'unsafe-inline'") && liveDirectives.get("script-src").includes("'unsafe-eval'") && !/'nonce-|'strict-dynamic'|'sha(?:256|384|512)-/.test(liveCsp), "nonce·strict-dynamic 을 걸지 않아 기존 인라인 처리기(내비 토글·인쇄)가 계속 동작한다");
  const hosts = {
    "script-src": ["https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js", "https://pagead2.googlesyndication.com/pagead/managed/js/adsense/show_ads_impl.js", "https://tpc.googlesyndication.com/sodar/sodar2.js", "https://googleads.g.doubleclick.net/pagead/x.js", "https://www.googletagservices.com/activeview/js/current/rx_lidar.js", "https://adservice.google.com/adsid/integrator.js", "https://fundingchoicesmessages.google.com/i/pub-3546469870344416", "https://ep2.adtrafficquality.google/sodar/sodar2.js"],
    "frame-src": ["https://googleads.g.doubleclick.net/pagead/ads", "https://tpc.googlesyndication.com/sodar/sodar2/runner.html", "https://www.google.com/recaptcha/api2/aframe", "https://ep2.adtrafficquality.google/sodar/sodar2/runner.html", "https://abc123.safeframe.googlesyndication.com/safeframe/container.html"],
    "connect-src": ["https://pagead2.googlesyndication.com/pagead/ping", "https://ep1.adtrafficquality.google/getconfig/sodar", "https://csi.gstatic.com/csi", "https://googleads.g.doubleclick.net/pagead/conversion"],
    "img-src": ["https://pagead2.googlesyndication.com/pagead/gen_204", "https://tpc.googlesyndication.com/simgad/1"],
  };
  for (const [directive, addresses] of Object.entries(hosts)) {
    for (const address of addresses) {
      ok(cspAllows(liveCsp, directive, address, directive === "frame-src" ? ["child-src"] : []), `live CSP ${directive} 가 ${new URL(address).hostname} 를 허용한다`);
      if (directive !== "img-src") ok(!cspAllows(REVIEW_CSP, directive, address, directive === "frame-src" ? ["child-src"] : []), `review CSP ${directive} 는 ${new URL(address).hostname} 를 막는다(지금 그대로)`);
    }
  }
  ok(cspAllows(liveCsp, "script-src", `${ORIGIN}/assets/accountbook-nav-v22937.js`) && cspAllows(liveCsp, "connect-src", "https://kapi.kakao.com/v2/user/me"), "live CSP 도 기존 자산·카카오 출처를 허용한다");

  // ── 5. /reports ───────────────────────────────────────────────────────────
  const reportReview = review.get(`/reports?${C}`).html;
  const reportLive = live.get(`/reports?${C}`);
  const liveCss = inlineCssBytes(reportLive.html);
  ok(liveCss <= 24 * 1024, `/reports live 인라인 CSS 가 24 KiB 이하다 (${liveCss} B)`);
  eq(liveCss - inlineCssBytes(reportReview), Buffer.byteLength((reportLive.html.match(/<style>(\.adSlot\{[\s\S]*?)<\/style>/) || ["", ""])[1]), "/reports 에 더해진 인라인 CSS 는 광고 자리 CSS 뿐이다");
  ok(reportLive.headers.get("cache-control") === "no-store" && reportLive.headers.get("x-robots-tag") === "noindex, nofollow", "/reports live 도 no-store·noindex 다");
  ok(reportLive.headers.get("x-frame-options") === "DENY" && reportLive.headers.get("referrer-policy") === "no-referrer" && reportLive.headers.get("x-content-type-options") === "nosniff" && reportLive.headers.get("strict-transport-security") === "max-age=31536000; includeSubDomains" && reportLive.headers.get("permissions-policy") === "camera=(self), microphone=(), geolocation=(), payment=()", "/reports live 의 기존 보안 헤더가 그대로다");
  // 머리 그라데이션 핀: 렌더된 /reports 에는 1번(review 실측), 소스 전체에는 65번(validate-tone-aware-heroes-v22883).
  // 광고 CSS 는 그라데이션을 더하지 않으므로 두 수 모두 그대로여야 한다.
  const gradient = "linear-gradient(135deg,#111827,var(--ab12-action";
  eq(countOf(reportReview, gradient), 1, "/reports review 의 머리 그라데이션은 1번이다(실측)");
  eq(countOf(reportLive.html, gradient), countOf(reportReview, gradient), "/reports live 도 머리 그라데이션 수가 review 와 같다");
  eq((source.match(/linear-gradient\(135deg,#111827,var\(--ab12-action,#[0-9a-fA-F]{6}\)\)/g) || []).length, 65, "소스의 톤 토큰 머리 그라데이션은 65개 그대로다");
  eq(h2s(reportLive.html).map((h) => h.text).join("|"), "기간 요약|고정비와 구독|날짜별 지출|지출 상위 분류|생활 패턴|카드별 사용액과 실적 목표|자동 생성 설정|카카오톡에 공유할 문구", "/reports live 의 절 제목과 순서가 그대로다");
  eq(countOf(reportLive.html, "transition-duration"), countOf(reportReview, "transition-duration"), "광고 CSS 는 transition-duration 리터럴을 더하지 않는다");
  const viewerReview = await render(`/reports?${C}`, { cookie: viewerCookie });
  const viewerLive = await render(`/reports?${C}`, { cookie: viewerCookie, ads: LIVE });
  ok(viewerLive.status === 200 && adSections(viewerLive.html).length === 1, "조회 전용 참여자의 리포트에도 광고 자리는 하나다");
  ok(!viewerLive.html.includes('action="/my/card-target/save"') && !viewerLive.html.includes('action="/my/report-preference/save"'), "조회 전용 참여자에게는 live 에서도 저장 폼이 없다");
  eq(countOf(viewerLive.html, 'method="post"'), countOf(viewerReview.html, 'method="post"'), "광고는 POST 폼을 더하지 않는다(조회 전용 참여자)");

  // ── 6. 정책 문구 ──────────────────────────────────────────────────────────
  const policy = {};
  for (const path of ["/privacy", "/cookies", "/faq", "/terms"]) {
    policy[path] = { review: (await render(path)).html, live: (await render(path, { ads: LIVE })).html };
  }
  ok(policy["/privacy"].review.includes("현재 공개 페이지에서는 Google 광고를 실행하지 않습니다. 향후 광고 기능이 활성화되면 Google을 포함한 제3자 광고 사업자가 쿠키를 사용해"), "review 개인정보처리방침은 지금 문장 그대로다");
  ok(policy["/cookies"].review.includes("현재 공개 페이지에서는 Google 광고 실행 코드와 광고 쿠키를 사용하지 않습니다. 향후 광고 기능을 활성화하면"), "review 쿠키 안내는 지금 문장 그대로다");
  ok(policy["/faq"].review.includes("현재 공개 페이지에는 Google 광고를 실행하지 않습니다. 광고 기능을 도입할 때에는 관련 안내와 필요한 절차를 갖춘 뒤 운영합니다."), "review FAQ 는 지금 문장 그대로다");
  for (const path of ["/privacy", "/cookies", "/faq"]) {
    ok(!/DoubleClick|adssettings/.test(policy[path].review), `${path}: review 에는 광고 쿠키 고지·해제 링크가 없다`);
  }
  for (const path of ["/privacy", "/cookies"]) {
    const html = policy[path].live;
    ok(html.includes("Google 광고를 표시합니다") && html.includes("DoubleClick") && html.includes("https://adssettings.google.com") && html.includes("https://policies.google.com/technologies/ads 에서"), `${path}: live 는 광고 표시·광고 쿠키·맞춤 광고 해제·Google 안내 주소를 고지한다`);
    ok(html.includes("거래를 입력·저장하는 화면과 로그인·가입 화면에는 광고"), `${path}: live 는 입력·저장 화면에 광고를 두지 않는다고 적는다`);
    ok(html.includes('<a href="https://adssettings.google.com" target="_blank" rel="noopener noreferrer">Google 광고 설정에서 맞춤 광고 해제'), `${path}: live 는 맞춤 광고 해제 링크를 준다`);
    ok(!html.includes("현재 공개 페이지에서는 Google 광고"), `${path}: live 에서는 "광고를 실행하지 않는다"는 문장이 사라진다`);
    eq(h2s(html).map((h) => h.text).join("|"), h2s(policy[path].review).map((h) => h.text).join("|"), `${path}: live 에서도 절 구성은 같다`);
  }
  const faqLive = policy["/faq"].live;
  ok(faqLive.includes("읽는 화면에 Google 광고를 표시하며") && faqLive.includes("카드사 실적이나 금융상품 안내와도 관계가 없습니다") && faqLive.includes("https://adssettings.google.com") && !faqLive.includes("현재 공개 페이지에는 Google 광고를 실행하지 않습니다"), "live FAQ 는 광고 표시·추천 아님·해제 방법을 답한다");
  const faqStructured = JSON.parse(faqLive.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
  ok(faqStructured.mainEntity.some((q) => q.name === "무료인가요? 광고가 나오나요?" && q.acceptedAnswer.text.includes("Google 광고를 표시하며")), "live FAQ 구조화 데이터의 답이 화면 문장과 같다");
  same(policy["/terms"].live, policy["/terms"].review, "이용약관의 광고 조항은 두 모드에서 같다(이미 광고 표시 가능성을 적고 있다)");

  // ── 7. /ready 의 ads_mode, /health 는 그대로 ─────────────────────────────
  for (const [ads, expected] of [[{}, "review"], [LIVE, "live"], [{ ADS_MODE: "LIVE" }, "review"], [{ ADS_MODE: " live" }, "review"], [{ ADS_MODE: "review" }, "review"]]) {
    const missingConfig = JSON.parse((await render("/ready", { ads })).html);
    eq(missingConfig.ads_mode, expected, `/ready (필수 설정 누락 503) ads_mode=${expected} (${JSON.stringify(ads)})`);
    const full = JSON.parse((await render("/ready", { ads, env: { ADMIN_SESSION_SECRET: "qa-ads-gate-session", ADMIN_API_TOKEN: "qa-ads-gate-admin" } })).html);
    ok(full.ads_mode === expected && full.checked_required_tables === 10, `/ready (점검 경로) ads_mode=${expected} (${JSON.stringify(ads)})`);
  }
  const healthReview = JSON.parse((await render("/health")).html);
  const healthLive = JSON.parse((await render("/health", { ads: LIVE })).html);
  ok(!("ads_mode" in healthLive) && JSON.stringify(Object.keys(healthLive)) === JSON.stringify(Object.keys(healthReview)), "/health 의 모양은 바뀌지 않는다");

  // ── 8. html-postprocess 를 거친 최종 HTML ─────────────────────────────────
  for (const path of ["/budget-guide", `/reports?${C}`, `/start-guide?${C}`, `/keyword-guide?${C}`]) {
    const html = live.get(path).html;
    ok(html.includes(LOADER) && html.includes(INS + PUSH), `${path}: 후처리 뒤에도 로더·슬롯·초기화 스크립트가 원문 그대로다`);
    const scripts = [...html.matchAll(/<script(?![^>]*\bsrc=)([^>]*)>([\s\S]*?)<\/script>/gi)].filter((m) => !/type="(?:application\/ld\+json|speculationrules)"/.test(m[1]) && m[2].trim());
    let parsed = 0;
    for (const m of scripts) { new vm.Script(m[2]); parsed += 1; }
    ok(parsed === scripts.length && scripts.some((m) => m[2] === PUSH_BODY), `${path}: 인라인 스크립트 ${parsed}개가 모두 문법상 온전하다`);
  }
  const head = await render("/budget-guide", { method: "HEAD", ads: LIVE });
  ok(head.status === 200 && head.html === "" && head.headers.get("content-security-policy") === LIVE_CSP && head.headers.get("cache-control") === live.get("/budget-guide").headers.get("cache-control"), "HEAD 응답은 GET 과 같은 live 헤더를 본문 없이 준다");
  const publicLive = live.get("/budget-guide");
  ok(publicLive.headers.get("cache-control") === "public, max-age=300, stale-while-revalidate=600" && publicLive.headers.get("x-robots-tag") === "index, follow" && publicLive.headers.get("set-cookie") === null, "공개 가이드는 live 에서도 공개 캐시·색인 허용·쿠키 없음 그대로다");
  ok(publicLive.html.includes('<meta name="google-adsense-account" content="ca-pub-3546469870344416"/>') && countOf(publicLive.html, 'rel="canonical"') === 1, "live 에서도 소유권 메타·정본 주소는 그대로다");

  console.log(`V22.9.40 광고 게이트 검사 통과 (${passed} checks)`);
} finally {
  fixture.restore();
  globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
}
