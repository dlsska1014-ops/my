// V22.9.79 visual 패키지 — 브라우저 없이 지킬 수 있는 화면 결함 검사.
//   V44 F-4  긴 가계부 이름·큰 금액·긴 표시 이름이 360·390px 화면을 밖으로 미는 것(원인이 된 격자·줄바꿈 규칙)
//   V44 F-5  다크 모드 '챗봇 명령어'(/kakao-commands) 카드 제목·설명이 배경과 같은 색(1.00:1)
//   V44 F-8  날짜 칩 '오늘·어제'가 기기 시간대를 쓰던 것 → KST 날짜
//   V44 F-10 관리자 백업 화면: 다크 경고 상자 1.05~1.08:1, /backup/apply 입력칸이 카드 밖으로 잘림, 표가 카드 밖으로 잘림
//   V44 D-27 역할 조회가 실패(503)했는데 권한이 있는 사람에게 "권한이 없다"고 안내하던 것(resolveTransactionAccess)
// 실제 Chrome 으로 잰 넘침·대비·스크린샷은 review-artifacts/v79-improvements-2026-10-25/visual/ 에 있다. 이 검사는 그 측정이 가리킨 원인이
// 고쳐졌는지를 오프라인으로 지킨다: 규칙이 화면에 도착하는지, 색 쌍의 대비 값(CSS 토큰에서 계산), 날짜 칩 스크립트를 가짜 시계·여러 시간대로
// 돌린 결과, 권한 조회 실패 때의 응답.
// 사용: node validation/validate-visual-v22979.mjs [--soft]   (--soft: 실패를 세어 끝까지 돌고 마지막에 목록을 찍는다 — 옛 코드에서 몇 개가 깨지는지 볼 때)
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { app, BASE, counter, ctx, failure, fixture, intercept, page, post, withClock } from "./lib-audit-v22934.mjs";

const SOFT = process.argv.includes("--soft");
const base = counter("V22.9.79 시각 결함 검사 통과");
const failed = [];
const passed = [];
let total = 0;
function guard(fn, message) {
  total += 1;
  try { fn(); passed.push(message); } catch (error) {
    if (!SOFT) throw error;
    const detail = String(error.message).split("\n")[0];
    failed.push(detail === message ? message : `${message} — ${detail.slice(0, 120)}`);
  }
}
const ok = (value, message) => guard(() => base.ok(value, message), message);
const eq = (actual, expected, message) => guard(() => base.eq(actual, expected, message), message);
const deepEq = (actual, expected, message) => guard(() => base.deepEq(actual, expected, message), message);
async function section(name, task) {
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    total += 1;
    failed.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error.message).split("\n")[0].slice(0, 160)}`);
  }
}

const HH = "house-home";
const DESKTOP = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0";
const bundle = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// ── 공용: WCAG 대비 ─────────────────────────────────────────────────────────────
const hex = (value) => { const v = String(value).replace("#", ""); const f = v.length === 3 ? v.split("").map((c) => c + c).join("") : v; return [0, 2, 4].map((i) => parseInt(f.slice(i, i + 2), 16)); };
const channel = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
const luminance = ([r, g, b]) => 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
const contrast = (fg, bg) => { const a = luminance(hex(fg)), b = luminance(hex(bg)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
const aa = (fg, bg, label, need = 4.5) => { const r = contrast(fg, bg); ok(r >= need, `${label} — ${fg} on ${bg} = ${r.toFixed(2)}:1 ≥ ${need}:1`); };
const styleText = (html) => [...String(html).matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
// 같은 명시도의 :root 선언은 뒤에 온 것이 이긴다. 다크 변수는 html[data-ab-resolved-theme="dark"](0,1,1)이 :root(0,1,0)를 이긴다.
function effectiveVar(css, name, dark) {
  const find = (re) => { const hits = [...css.matchAll(re)].map((m) => (m[1].match(new RegExp(`${name}:\\s*(#[0-9a-fA-F]{3,6})`)) || [])[1]).filter(Boolean); return hits[hits.length - 1] || ""; };
  const light = find(/:root\{([^}]*)\}/g);
  const night = find(/html\[data-ab-resolved-theme="dark"\]\{([^}]*)\}/g);
  return dark ? night || light : light;
}
async function asset(fx, path, cookie = fx.cookie) {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: cookie ? { cookie } : {} }), fx.env, ctx);
  return { status: response.status, text: await response.text() };
}
const assetPath = (html, re) => (String(html).match(re) || [])[1] || "";
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "visual-admin-2026";
  fx.env.ADMIN_SESSION_SECRET = "visual-admin-session-secret";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
}

// ── F-8. 날짜 칩 '오늘·어제'는 기기 시간대가 아니라 KST ──────────────────────────────────────
// 칩 스크립트는 홈 자산 두 곳(mobile-home-*.js, mobile-home-shell-*.js)에 같은 글자로 들어 있다. 그 조각을 꺼내 가짜 DOM·가짜 시계로 돌린다.
// 시간대는 process.env.TZ 로 바꾼다(V8 이 바로 반영한다). 예전 코드는 new Date() 의 로컬 getFullYear/getDate 를 써서 KST 가 아닌 기기에서 다른 날을 골랐다.
function chipHandlerOf(js) {
  const head = "document.querySelectorAll('.dateChip').forEach(";
  const start = js.indexOf(head);
  if (start < 0) return "";
  let depth = 0;
  for (let i = start + head.length - 1; i < js.length; i += 1) {
    if (js[i] === "(") depth += 1;
    else if (js[i] === ")") { depth -= 1; if (depth === 0) return `${js.slice(start, i + 1)};`; }
  }
  return "";
}
function clickChips(handler, nowMs) {
  const input = { value: "", events: [], dispatchEvent(event) { this.events.push(event.type); } };
  const classes = new Set();
  const button = (day) => ({ attrs: { "data-day": String(day) }, handlers: {}, getAttribute(name) { return this.attrs[name]; }, classList: { add: (c) => classes.add(c), remove: (c) => classes.delete(c) }, addEventListener(type, fn) { this.handlers[type] = fn; } });
  const buttons = [button(0), button(-1)];
  const context = vm.createContext({ document: { querySelectorAll: (selector) => (selector === ".dateChip" ? buttons : []), getElementById: (id) => (id === "txDate" ? input : null) }, Event: class { constructor(type) { this.type = type; } } });
  vm.runInContext(`(() => { const Real = Date; const FIXED = ${nowMs}; globalThis.Date = class extends Real { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }; })()`, context);
  vm.runInContext(handler, context);
  const values = [];
  for (const b of buttons) { b.handlers.click.call(b); values.push(input.value); }
  return { values, events: input.events.length };
}
await section("F-8", () => fixture(async (fx) => {
  const home = await page(fx, `/app?household_id=${HH}&month=2026-07`, { headers: { "user-agent": DESKTOP } });
  const shellPath = assetPath(home.html, /id="mobileAppInlineRuntime" src="([^"]+)"/);
  ok(shellPath.startsWith("/assets/mobile-home-shell-"), `홈이 칩 스크립트를 담은 셸 자산을 받는다 (${shellPath})`);
  const homeJsPath = (bundle.match(/const MOBILE_HOME_JS_ASSET_PATH = "([^"]+)"/) || [])[1] || "";
  ok(homeJsPath.startsWith("/assets/mobile-home-"), `홈 스크립트 자산 주소가 있다 (${homeJsPath})`);
  const handlers = [];
  for (const path of [shellPath, homeJsPath]) {
    const js = await asset(fx, path);
    eq(js.status, 200, `${path} 가 내려온다`);
    const handler = chipHandlerOf(js.text);
    ok(handler.length > 100, `${path} 에 날짜 칩 스크립트가 있다`);
    handlers.push(handler);
  }
  eq(handlers[0], handlers[1], "두 자산에 들어간 칩 스크립트는 글자까지 같다");
  const kst = (ms, add) => new Date(ms + 9 * 3600000 + add * 86400000).toISOString().slice(0, 10);
  const instants = [
    ["KST 새벽 05:00(UTC 전날 20:00)", Date.parse("2026-10-24T20:00:00Z")],
    ["KST 밤 23:30", Date.parse("2026-10-25T14:30:00Z")],
    ["KST 자정 정각", Date.parse("2026-10-25T15:00:00Z")],
    ["KST 연말 자정(새해 첫 시각)", Date.parse("2026-12-31T15:00:00Z")],
  ];
  // 2026-10-25 03:00Z 기준 UTC 와의 차(분). 이 값이 아니면 이 환경은 시간대를 못 바꾸는 것이라 검사가 의미 없다.
  const zones = [["Asia/Seoul", -540], ["America/Los_Angeles", 420], ["America/New_York", 240], ["Europe/London", 0], ["Pacific/Kiritimati", -840], ["Asia/Kolkata", -330], ["UTC", 0]];
  const savedTz = process.env.TZ;
  try {
    for (const [zone, offset] of zones) {
      process.env.TZ = zone;
      eq(new Date(Date.UTC(2026, 9, 25, 3)).getTimezoneOffset(), offset, `검사 환경이 ${zone} 시간대로 바뀐다`);
      for (const [label, ms] of instants) {
        const result = clickChips(handlers[0], ms);
        eq(result.values.join(" / "), `${kst(ms, 0)} / ${kst(ms, -1)}`, `${zone} 기기, ${label}: 오늘·어제 칩이 KST 날짜를 고른다`);
      }
    }
    process.env.TZ = "America/Los_Angeles";
    eq(clickChips(handlers[1], Date.parse("2026-10-24T20:00:00Z")).values.join(" / "), "2026-10-25 / 2026-10-24", "다른 자산(mobile-home-*.js)의 칩도 LA 기기에서 KST 날짜를 고른다");
    eq(clickChips(handlers[0], Date.parse("2026-10-24T20:00:00Z")).events, 2, "칩을 누를 때마다 날짜 칸에 change 가 한 번씩 간다(한 줄 입력이 새 날짜를 읽는다)");
  } finally {
    if (savedTz === undefined) delete process.env.TZ; else process.env.TZ = savedTz;
  }
}));

// ── F-5. 다크 모드 '챗봇 명령어' 카드 ─────────────────────────────────────────────────────────
// 후처리기가 모든 화면 body 에 붙이는 body.abV2281{color:var(--ab-text)!important;background:var(--ab-bg)!important}가 이 화면의 다크 body 규칙을 이겼다.
// 그래서 카드만 어두워지고 제목·설명은 어두운 #172033 으로 남았다(1.00:1). 변수를 다크 값으로 바꾸고 흰 표·표 머리를 덮었는지 본다.
await section("F-5", () => fixture(async (fx) => {
  const response = await page(fx, "/kakao-commands", { cookie: "" });
  eq(response.status, 200, "/kakao-commands 가 로그아웃 상태로 열린다");
  // 가이드 스타일(V2281·V2284)은 화면에 박히지 않고 /assets/ab-uiux-*.css 로 내려온다. 화면 안 <style> 보다 먼저 읽힌다.
  const uiuxPath = assetPath(response.html, /href="(\/assets\/ab-uiux-[^"]+\.css)"/);
  ok(!!uiuxPath, `화면이 가이드 스타일시트를 받는다 (${uiuxPath})`);
  const uiux = (await asset(fx, uiuxPath, "")).text;
  const css = `${uiux}\n${styleText(response.html)}`;
  ok(/<body class="[^"]*\babV2281\b/.test(response.html), "후처리기가 이 화면 body 에도 abV2281 을 붙인다(이 결함의 원인이 그대로 있다)");
  ok(/body\.abV2281\{[^}]*color:var\(--ab-text\)!important/.test(uiux), "가이드 스타일이 body 글자색을 var(--ab-text)!important 로 고정한다(화면의 다크 body 규칙보다 세다)");
  const darkText = effectiveVar(css, "--ab-text", true), darkBg = effectiveVar(css, "--ab-bg", true);
  const lightText = effectiveVar(css, "--ab-text", false);
  ok(/^#[0-9a-f]{6}$/i.test(darkText) && /^#[0-9a-f]{6}$/i.test(darkBg) && darkText !== lightText && darkBg !== effectiveVar(css, "--ab-bg", false), `다크일 때 --ab-text·--ab-bg 가 라이트 값과 다른 다크 값으로 바뀐다 (${lightText} → ${darkText} / ${darkBg})`);
  const cardBg = (css.match(/html\[data-ab-resolved-theme="dark"\] \.card\{background:(#[0-9a-fA-F]{6})/) || [])[1] || "#ffffff";
  aa(darkText || "#172033", cardBg, "다크 카드 제목·설명(상속받는 --ab-text)이 카드 바탕에서 읽힌다");
  aa(darkText || "#172033", darkBg || "#f6f8fb", "다크 본문 글자가 페이지 바탕에서 읽힌다");
  ok(/body\.abV2281 table\{background:transparent!important\}/.test(css), "다크에서 가이드 스타일의 흰 표 바탕(!important)을 덮는다");
  ok(/body\.abV2281 :is\(td,th\)\{border-color:#3b475a!important\}/.test(css), "다크 표 구분선이 밝은 값(!important)으로 남지 않는다");
  const thRule = (css.match(/html\[data-ab-resolved-theme="dark"\] body\.abV2281 th\{background:(#[0-9a-fA-F]{6});color:(#[0-9a-fA-F]{6})!important\}/) || []);
  ok(thRule.length === 3, "다크 표 머리 규칙이 있다");
  if (thRule.length === 3) aa(thRule[2], thRule[1], "다크 표 머리 글자");
  aa("#edeff3", "#282b33", "다크 발화 칩(code) 글자");
  aa("#dbeafe", "#1e2a5a", "다크 OpenBuilder 칩 글자");
  aa(effectiveVar(css, "--ab-text", false) || "#172033", "#ffffff", "라이트 모드 카드 제목·설명은 그대로 읽힌다");
  const lightBg = effectiveVar(css, "--ab-bg", false);
  ok(!!lightBg && lightBg !== darkBg, "라이트 모드 바탕 변수는 다크 값으로 바뀌지 않는다");
}));

// ── F-10. 관리자 백업 화면 ──────────────────────────────────────────────────────────────────────
await section("F-10", () => fixture(async (fx) => {
  const admin = await adminCookie(fx);
  const backup = await page(fx, `/backup?month=2026-07&household_id=${HH}`, { cookie: admin });
  eq(backup.status, 200, "관리자 백업센터가 열린다");
  const shellPath = assetPath(backup.html, /href="(\/assets\/accountbook-shell-[^"]+\.css)"/);
  ok(!!shellPath, `백업센터가 셸 스타일시트를 받는다 (${shellPath})`);
  const shell = (await asset(fx, shellPath, admin)).text;
  // (1) 다크 경고·위험 상자: 상자 규칙이 .warnBox·.dangerBox 를 알아야 한다(예전에는 글자만 밝아지고 바탕은 밝은 주황·분홍으로 남았다)
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .warnBox{background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}'), "다크 .warnBox 가 경고 토큰(바탕·글자·선)을 받는다");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .dangerBox{background:#3f1d2a!important;color:#fecaca!important;border-color:#7f3545!important}'), "다크 .dangerBox 가 어두운 위험 값(#3f1d2a 바탕·#fecaca 글자)을 받는다");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.warnBox,.dangerBox) :is(b,strong,p,span,small,label){color:inherit!important}'), "두 상자 안의 b·p·span 도 상자 글자색을 이어받는다(굵은 글씨 '가져오기 적용'이 따로 밝아지지 않는다)");
  const darkWarn = (shell.match(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell\{[^}]*--ab12-warn-bg:(#[0-9a-fA-F]{6});--ab12-warn-text:(#[0-9a-fA-F]{6})/) || []);
  ok(darkWarn.length === 3, "다크 경고 토큰(--ab12-warn-bg·-text)을 CSS 에서 읽었다");
  if (darkWarn.length === 3) aa(darkWarn[2], darkWarn[1], "다크 경고 상자 글자(.warnBox)");
  aa("#fecaca", "#3f1d2a", "다크 위험 상자 글자(.dangerBox)");
  // 예전 값: 상자 바탕은 밝은 주황(#fff7ed)인데 글자가 다크 본문색(#edeff3)이라 1.08:1
  ok(contrast("#edeff3", "#fff7ed") < 1.2 && contrast("#edeff3", "#fef2f2") < 1.2, "(참고) 예전 조합 #edeff3 on #fff7ed·#fef2f2 는 1.2:1 미만이다 — 이 결함이 실제였다");
  // (2) 미리보기 요약 칸(.summaryGrid>div): 밝은 바탕(#f8fafc)에 다크 글자 1.10:1
  ok(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell \.summaryGrid>div\{background:var\(--ab12-surface-raised\)!important;border-color:var\(--ab12-line\)!important\}/.test(shell), "다크 요약 칸이 어두운 바탕을 받는다");
  aa("#d5dbe4", "#282b33", "다크 요약 칸 라벨(--ab12-muted #d5dbe4)");
  aa("#edeff3", "#282b33", "다크 요약 칸 값(--ab12-text)");
  // (3) /backup/apply 입력 격자와 카드 안 표
  const apply = await page(fx, `/backup/apply?month=2026-07&household_id=${HH}`, { cookie: admin });
  ok(/<form class="upload"[^>]*action="\/backup\/apply"/.test(apply.html) || /<form[^>]*class="upload"[^>]*action="\/backup\/apply"/.test(apply.html) || /action="\/backup\/apply"[^>]*class="upload"/.test(apply.html), "실제 적용 화면의 입력 폼은 form.upload[action=/backup/apply] 이다(셸 규칙이 겨냥하는 마크업)");
  ok(apply.html.includes('class="dangerBox"'), "실제 적용 화면에 .dangerBox 경고가 있다");
  ok(/@media\(min-width:981px\)\{body\.abV22812Shell form\.upload\[action="\/backup\/apply"\]\{grid-template-columns:repeat\(auto-fit,minmax\(min\(100%,150px\),1fr\)\)\}/.test(shell), "데스크톱 폭에서 5칸 격자를 칸 수가 줄어드는 격자로 바꾼다(고정 155+155+165+170px 가 카드 밖으로 나갔다)");
  ok(shell.includes('form.upload[action="/backup/apply"] input[type=file]{grid-column:1/-1}'), "파일 칸은 한 줄을 다 쓴다");
  ok(/@media\(max-width:980px\)\{body\.abV22812Shell form\.upload\{grid-template-columns:minmax\(0,1fr\)\}\}/.test(shell), "980px 아래 한 열은 minmax(0,1fr) 이라 긴 가계부 이름이 든 select 가 열을 넓히지 않는다");
  ok(shell.includes("body.abV22812Shell form.upload :is(input,select,button){min-width:0}"), "입력 격자의 입력칸이 줄어들 수 있다(min-width:0)");
  ok(shell.includes("body.abV22812Shell .filters select{min-width:0;max-width:100%}"), "백업센터·이력·되돌리기 후보의 조회 줄: 긴 가계부 이름이 든 select 가 줄 폭 안으로 줄어든다");
  ok(shell.includes("body.abV22812Shell .card:has(>table){overflow-x:auto}") && shell.includes("body.abV22812Shell .card:has(>table) :is(th,td){word-break:keep-all}"), "표가 바로 든 카드는 안에서 밀어 보고, 좁은 열의 한글이 글자 하나씩 줄바꿈되지 않는다");
  // 미리보기 결과 화면에 실제로 요약 칸 마크업이 나온다(규칙이 겨냥하는 요소가 있다)
  const exported = await app.fetch(new Request(`${BASE}/admin/export/json?month=2026-07&household_id=${HH}`, { headers: { cookie: admin } }), fx.env, ctx);
  const backupText = await exported.text();
  const form = new FormData();
  form.append("backup_file", new File([backupText], "backup.json", { type: "application/json" }));
  const preview = await app.fetch(new Request(`${BASE}/backup/preview`, { method: "POST", headers: { cookie: admin, origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" }, body: form }), fx.env, ctx);
  const previewHtml = await preview.text();
  eq(preview.status, 200, "백업 미리보기 결과가 나온다");
  ok(previewHtml.includes('class="summaryGrid"') && previewHtml.includes("<span>백업 버전</span>"), "미리보기 결과에 .summaryGrid 요약 칸이 있다");
}));

// ── F-4. 긴 이름·큰 금액이 화면 밖으로 밀지 않게 하는 규칙들이 화면에 도착하는가 ────────────────────────────
// 원인은 한 가지다: grid 의 암묵 열·`1fr` 은 minmax(auto,1fr) 라 줄바꿈 없는 글자 하나(nowrap 요약 줄, 영문 닉네임, 긴 결제수단)가 열 전체를 넓힌다.
// Chrome 으로 잰 위반(예전 코드, 360px): 홈 빠른 입력 패널 R=555, 최근 내역 금액 R=526~872, 참여자 카드 R=576, 예산 알림 조회 줄 R=637, 수정 폼 지출자 R=620, 결제수단 막대 R=432.
await section("F-4", () => fixture(async (fx) => {
  const home = await page(fx, `/app?household_id=${HH}&month=2026-07`, { headers: { "user-agent": DESKTOP } });
  const homeCssPath = assetPath(home.html, /href="(\/assets\/mobile-home-[^"]+\.css)"/);
  const homeCss = (await asset(fx, homeCssPath)).text;
  ok(homeCss.includes(".form,.v8-edit,.v8-edit-field{grid-template-columns:minmax(0,1fr)}"), "홈: 빠른 입력 폼·수정 폼 격자가 minmax(0,1fr) 한 열이다");
  ok(homeCss.includes(".v8-edit-field select,.v8-edit select,.v8-edit input{min-width:0;max-width:100%}"), "홈: 수정 폼의 지출자 select 가 폼 폭 안에서 줄어든다");
  ok(homeCss.includes(".v8-tx-main>div{min-width:0;overflow-wrap:anywhere}"), "홈: 최근 내역 행의 내용 칸이 줄어들고 줄바꿈 없는 긴 글자도 꺾여 금액이 밀려나지 않는다");
  ok(homeCss.includes(".chipRow button{max-width:100%;white-space:normal;overflow-wrap:anywhere}"), "홈: 줄 폭보다 긴 결제수단 칩은 잘리지 않고 줄 폭 안에서 줄바꿈된다");
  ok(/\.v8-tx-main strong\{white-space:nowrap\}/.test(homeCss), "금액은 여전히 한 줄(nowrap)이다 — 줄 바꿈은 내용 칸이 맡는다");
  const alerts = await page(fx, `/budget-alerts?month=2026-07&household_id=${HH}`);
  ok(alerts.html.includes(".filters{display:grid;grid-template-columns:minmax(0,1fr) 160px 110px;gap:8px;margin-top:12px}") && alerts.html.includes(".filters select,.filters input,.filters button{min-width:0;width:100%;height:44px;"), "예산 알림: 조회 줄이 minmax(0,1fr) 이고 입력칸이 줄어든다");
  ok(alerts.html.includes(".hero h1{font-size:25px}.filters{grid-template-columns:minmax(0,1fr)}") && !alerts.html.includes(".filters{grid-template-columns:1fr}"), "예산 알림: 모바일 한 열도 minmax(0,1fr) 이다(예전 1fr 은 긴 가계부 이름에 열이 넓어졌다)");
  const members = await page(fx, `/my/members?month=2026-07&household_id=${HH}`);
  ok(members.html.includes(".toolbar,.nameForm,.roleForm{grid-template-columns:minmax(0,1fr)}.memberGrid{grid-template-columns:minmax(0,1fr)}"), "참여자: 모바일 격자가 minmax(0,1fr) 이다");
  ok(members.html.includes(".memberHead>div:last-child{min-width:0}.avatar{flex:none}.memberHead b{overflow-wrap:anywhere}"), "참여자: 긴 표시 이름이 카드 안에서 꺾인다");
  const analysis = await page(fx, `/my/analysis?month=2026-07&household_id=${HH}`);
  ok(analysis.html.includes(".hRows{display:grid;grid-template-columns:minmax(0,1fr);gap:4px}") && analysis.html.includes(".hRow{display:grid;grid-template-columns:minmax(0,1fr);gap:5px;"), "소비 분석: 결제수단·구성원 막대 행이 minmax(0,1fr) 한 열이다");
  ok(analysis.html.includes(".hTop b{min-width:0;font-size:13px;"), "소비 분석: 막대 행의 이름 칸이 줄어들고 말줄임된다");
  const tx = fx.db.transactions.find((t) => t.household_id === HH && t.user_id === "user-wifi");
  const edit = await page(fx, `/transactions/edit?id=${tx.id}&household_id=${HH}`);
  eq(edit.status, 200, "수정 화면(JS 없이 오는 길)이 열린다");
  ok(edit.html.includes(".v8-edit,.v8-edit-field{display:grid;gap:8px;grid-template-columns:minmax(0,1fr)}") && edit.html.includes(".v8-edit select,.v8-edit input{min-width:0;max-width:100%;width:100%}"), "수정 화면: 홈 스타일시트를 받지 않는 이 화면이 폼을 한 열 격자로 두고 지출자 select 를 폭 안에 가둔다");
  const homeShellPath = assetPath(home.html, /href="(\/assets\/accountbook-shell-[^"]+\.css)"/);
  const homeShell = (await asset(fx, homeShellPath)).text;
  ok(homeShell.includes("body.abV22812Shell .quickMore>summary>span{flex:none;white-space:nowrap}"), "홈 '자세히' 줄: 긴 지출자 이름이 와도 라벨(자세히)은 한 줄로 남고 요약만 말줄임된다");
  ok(homeShell.includes("@media(max-width:560px){body.abV22812Shell .abV5ControlBar:has(select~select){grid-template-columns:repeat(2,minmax(0,1fr))!important}}"), "머리말 조회 줄에 select 가 둘(정산: 가계부·방식)이면 모바일에서 두 열로 쌓아 월 입력이 88px 로 줄지 않는다");
  ok(homeShell.includes("body.abV22812Shell .abV5PageHeader h1{overflow-wrap:anywhere}"), "머리말 제목('…님 시작가이드')의 줄바꿈 없는 긴 표시 이름이 360px 밖으로 나가지 않고 꺾인다");
  const backupLogin = await page(fx, `/my/backup-login?household_id=${HH}`);
  eq(backupLogin.status, 200, "내 계정 로그인 설정 화면이 열린다");
  ok(backupLogin.html.includes(".identity{background:#f8fafc;border:1px solid #e2e8f0;border-radius:16px;padding:13px;color:#475467;line-height:1.6;overflow-wrap:anywhere}"), "내 계정: '현재 표시 이름' 상자가 줄바꿈 없는 긴 표시 이름을 꺾는다");
  const settlement = await page(fx, `/settlement-summary?month=2026-07&household_id=${HH}`);
  ok(settlement.html.includes(".copy{background:#f8fafc;border:1px solid #e5e7eb;color:#475569;overflow-wrap:anywhere}"), "정산: 공유 문구 상자가 줄바꿈 없는 긴 표시 이름을 꺾는다");
}));

// ── D-27. 역할 조회가 실패했을 때의 안내 ────────────────────────────────────────────────────────────
// resolveTransactionAccess 는 getHouseholdMemberRole(조회 실패 = 빈 역할)을 써서 503 이어도 "권한이 없습니다" 로 갔다. 엄격 조회로 바꿔
// 실패는 lookupFailed 로 구분하고, 쿼리로 돌아가는 화면은 formatMessage 가 아는 코드(household_role_check_failed), JSON·조각은 문장을 쓴다.
const ROLE_FAILED_TEXT = "권한을 확인하지 못해 아무것도 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.";
const feedback = (html) => { const m = String(html).match(/<div class="abSaveFeedbackCopy"><b>([^<]*)<\/b><span>([^<]*)<\/span>/); return m ? m[2] : ""; };
await section("D-27", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const memberLookups = () => intercept(({ url, method }) => (method === "GET" && url.pathname.endsWith("/household_members") && url.searchParams.get("user_id") ? failure(503) : undefined));
  const quick = { household_id: HH, month: "2026-07", type: "expense", amount: "1000", memo: "시험", transaction_date: "2026-07-10", user_id: "user-wifi", return_to: `/app?month=2026-07&household_id=${HH}` };
  const own = fx.db.transactions.find((t) => t.household_id === HH && t.user_id === "user-wifi");
  const before = fx.db.transactions.length;

  // 기준선: 조회가 되면 구성원은 예전처럼 기록할 수 있다
  let r = await post(fx, "/admin/transactions", quick, { cookie: wifi });
  ok(/msg=added/.test(r.decoded), `조회가 되면 구성원이 기록을 더할 수 있다 (${r.decoded.slice(0, 80)})`);
  eq(fx.db.transactions.length, before + 1, "그 기록이 저장됐다");
  const afterAdd = fx.db.transactions.length;

  // (1) 기록 추가 — 조회 실패
  let restore = memberLookups();
  r = await post(fx, "/admin/transactions", { ...quick, memo: "실패" }, { cookie: wifi });
  restore();
  ok(/[?&]err=household_role_check_failed(?:&|$)/.test(r.decoded), `추가: 조회 실패는 '권한 없음'이 아니라 household_role_check_failed 로 돌아간다 (${r.decoded.replace(/^.*[?&]err=/, "err=").slice(0, 70)})`);
  eq(fx.db.transactions.length, afterAdd, "추가: 조회가 실패하면 아무것도 저장하지 않는다");
  eq(feedback((await page(fx, r.location, { cookie: wifi })).html), ROLE_FAILED_TEXT, "추가: 홈이 '권한을 확인하지 못해 아무것도 바꾸지 않았습니다' 로 안내한다(예전에는 일반 오류 문구)");

  // (2) 기록 삭제 — JSON 과 폼
  const del = (cookie, accept) => app.fetch(new Request(`${BASE}/admin/delete`, { method: "POST", headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept }, body: new URLSearchParams({ id: own.id, household_id: HH, month: "2026-07" }).toString() }), fx.env, ctx);
  restore = memberLookups();
  const delJson = await del(wifi, "application/json");
  const delJsonBody = await delJson.json().catch(() => ({}));
  deepEq([delJson.status, delJsonBody.error], [503, "role_check_failed"], "삭제(JSON): 조회 실패는 403 forbidden 이 아니라 503 role_check_failed 다");
  eq(delJsonBody.message, ROLE_FAILED_TEXT, "삭제(JSON): 메시지는 아무것도 바꾸지 않았다는 안내다");
  const delForm = await del(wifi, "text/html");
  restore();
  ok(/[?&]err=household_role_check_failed(?:&|$)/.test(decodeURIComponent(delForm.headers.get("location") || "")), "삭제(폼): 조회 실패 코드로 돌아간다");
  ok(fx.db.transactions.some((t) => t.id === own.id), "삭제: 조회가 실패하면 기록은 그대로다");

  // (3) 수정 화면(조각·전체) — 조회 실패
  restore = memberLookups();
  const fragment = await page(fx, `/transactions/edit?id=${own.id}&household_id=${HH}&fragment=1`, { cookie: wifi });
  const full = await page(fx, `/transactions/edit?id=${own.id}&household_id=${HH}`, { cookie: wifi });
  restore();
  eq(fragment.status, 503, "수정 조각: 조회 실패는 403 이 아니라 503 이다(화면이 '다시 시도'를 안내한다)");
  ok(fragment.html.includes(ROLE_FAILED_TEXT), "수정 조각: 본문이 권한 확인 실패 안내다");
  ok(/[?&]err=household_role_check_failed(?:&|$)/.test(decodeURIComponent(full.location)), "수정 전체 화면: 코드로 돌아간다");

  // (4) 수정 저장 — 조회 실패
  restore = memberLookups();
  r = await post(fx, "/admin/update", { id: own.id, household_id: HH, month: "2026-07", type: "expense", amount: "2000", memo: "바꿈", transaction_date: "2026-07-10", user_id: "user-wifi" }, { cookie: wifi });
  restore();
  ok(/[?&]err=household_role_check_failed(?:&|$)/.test(r.decoded), "수정 저장: 조회 실패는 코드로 돌아간다");
  ok(fx.db.transactions.find((t) => t.id === own.id).amount !== 2000, "수정 저장: 조회가 실패하면 값을 바꾸지 않는다");

  // (5) 고정지출 저장·반영 — 소유자가 조회 실패
  restore = memberLookups();
  r = await post(fx, "/admin/recurring/save", { household_id: HH, month: "2026-07", name: "x", amount: "1000", day_of_month: "5", type: "expense", category: "주거", user_id: "user-bin" });
  const save = r.decoded;
  r = await post(fx, "/admin/recurring/apply", { household_id: HH, month: "2026-07" });
  const applyLoc = r.decoded;
  restore();
  ok(/[?&]err=household_role_check_failed#fixed$/.test(save), `고정지출 저장: 조회 실패는 코드로 돌아간다 (${save.replace(/^.*[?&]err=/, "err=")})`);
  ok(/[?&]err=household_role_check_failed#fixed$/.test(applyLoc), "고정지출 반영: 조회 실패는 코드로 돌아간다");
  const recurringPage = await page(fx, "/reserve-plans?month=2026-07&household_id=" + HH + "&err=household_role_check_failed");
  ok(recurringPage.html.includes(ROLE_FAILED_TEXT), "정기 화면이 그 코드를 '권한을 확인하지 못해…' 로 풀어 보여 준다(예전에는 일반 오류 문구)");

  // (6) 진짜 거절은 그대로: 조회는 되지만 권한이 없는 경우(조회 전용)
  fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "viewer";
  r = await post(fx, "/admin/transactions", { ...quick, memo: "viewer" }, { cookie: wifi });
  // V22.9.80 T-34: 진짜 거절(조회 전용)은 여전히 거절이다. 다만 자유 문장 대신 코드(write_denied_viewer)로 보내 홈이 안내한다(예전 문장은 홈에서 일반 오류 문구로 닫혔다).
  ok(/[?&]err=write_denied_viewer(?:&|$)/.test(r.decoded), `조회가 되고 조회 전용이면 거절 코드(write_denied_viewer)로 간다 (${r.decoded.replace(/^.*[?&]err=/, "err=").slice(0, 60)})`);
  const denyJson = await del(wifi, "application/json");
  eq(denyJson.status, 403, "삭제(JSON): 조회 전용의 거절은 그대로 403");
  fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "member";

  // (7) 관리자 세션은 역할 조회를 하지 않으므로 조회가 죽어도 그대로 통과한다
  const admin = await adminCookie(fx);
  restore = memberLookups();
  r = await post(fx, "/admin/transactions", { ...quick, memo: "관리자", user_id: "user-bin" }, { cookie: admin });
  restore();
  ok(/msg=added/.test(r.decoded), "관리자 세션은 역할 조회가 실패해도 기록을 더할 수 있다(조회하지 않는다)");
})));

if (SOFT) {
  console.log(`${failed.length} of ${total} checks fail`);
  for (const line of failed) console.log(`  FAIL ${line}`);
  if (process.argv.includes("--all")) for (const line of passed) console.log(`  pass ${line}`);
  process.exit(failed.length ? 1 : 0);
}
base.done();
