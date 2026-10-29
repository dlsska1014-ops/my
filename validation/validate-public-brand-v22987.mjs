// V22.9.87 — 공개·로그인 묶음(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-20 · T-21 · T-22) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-20 /my 시작 화면은 기능 미리보기가 먼저이고 카카오 로그인 버튼은 한참 아래(390×812 에서 y 3320)에 있었다. 첫 화면의 채운 버튼은
//        ‘기능 먼저 보기’ 파란 버튼이었고, 로그인 이름 칸의 오류는 맨 위 요약에만 있었다.
//   T-21 공개 페이지는 노란 ₩ 로고·검은 헤더 버튼·남색 주 버튼·노란 히어로 버튼·theme-color #312e81·매니페스트 이름 ‘말해 가계부’로
//        앱(파란 장부 마크 #3182f6, 주 버튼 --ab12-action)과 브랜드가 달랐고, 첫 화면에 앱 화면이 없었다.
//   T-22 공개 페이지에 og:image 가 없어 카카오톡·SNS 공유 미리보기가 글자뿐이었다.
//
// ── 어떻게 잡는가 ──
// 화면은 픽스처(카카오 로그인을 켠 env 와 끈 env)로 그린 HTML 의 순서·속성·문구를 보고, 로그인 칸 스크립트(loginFieldRuntime)는 vm 의 가짜 DOM 에서
// 실제로 돌린다. 공개 미리보기는 같은 픽스처로 그린 앱 홈(T-12 예산 카드)과 셸 CSS(카테고리 색·아이콘·브랜드 토큰)에 대조한다.
// 첫 화면 위치(카카오 버튼 y, /demo 예산 카드)와 채운 버튼 수는 review-artifacts/design-uplift-2026-10-28/v87/public/ 의 브라우저 측정이 맡는다.
// 공유 이미지는 생성 파일(src/modules/assets/og-image.js)의 SHA-256 과 PNG SHA-256 을 아래에 고정하고, 카드 HTML(tools/build-og-images.mjs)이
// 생성 파일 머리에 적힌 것과 같은지(카드를 고치고 다시 만들지 않은 채 두지 않게), 응답 머리·크기, 공개 페이지 머리의 og 태그를 본다.
import vm from "node:vm";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { categoryKey } from "../src/index.js";
import { LEDGER_MARK_SVG, LIBVIPS_VERSION, OG_HEIGHT, OG_IMAGE_ALT, OG_IMAGE_PATH, OG_WIDTH, SHARP_VERSION, checkToolVersions, ogCardHtml } from "../tools/build-og-images.mjs";
import { app, BASE, ctx, counter, fixture, page, post, withClock } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.87 공개·로그인 묶음(T-20 로그인 먼저 시작 화면·T-21 공개 브랜드와 앱 미리보기·T-22 공유 미리보기 이미지)");
// T-22: 생성 파일과 PNG 의 SHA-256. 다시 만들면(tools/build-og-images.mjs) 두 값을 새로 적는다.
const OG_MODULE_SHA256 = "c017d2fca8eb7f20f8f2db7c3812990385cc3b906bde68b1e47c6f62ecc8ac5e";
const OG_PNG_SHA256 = "83b5aa2fd6d5d0a39c6bd293e3544a82b8f28f482af38e8fd5d72f9235791376";
const KAKAO = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` };
const RETURN = "/my?return_to=%2Fapp%3Fmonth%3D2026-10%26household_id%3Dhouse-home";
const count = (text, needle) => String(text).split(needle).length - 1;
const between = (html, start, end) => { const i = html.indexOf(start); const j = html.indexOf(end, i + 1); return i < 0 || j < 0 ? "" : html.slice(i, j); };
const script = (html, id) => (html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)</script>`)) || [, ""])[1];
const svgShape = (svg) => ({ rect: (svg.match(/<rect\b([^>]*?)\/?>/) || [, ""])[1].replace(/\s+/g, " ").trim(), path: (svg.match(/<path d="([^"]+)"/) || [, ""])[1] });

// ── T-20 카카오 로그인이 켜진 시작 화면 ──
await fixture(async (fx) => {
  Object.assign(fx.env, KAKAO);
  let outbound = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { outbound += 1; return realFetch(...args); };
  let view;
  try { view = await page(fx, RETURN, { cookie: "" }); } finally { globalThis.fetch = realFetch; }
  const html = view.html;
  t.eq(view.status, 200, "로그아웃 /my 가 그려진다");
  t.eq(outbound, 0, "로그아웃 /my 는 DB·바깥 요청을 하지 않는다(데이터 요청 0회)");
  t.ok(Buffer.byteLength(html) <= 48 * 1024, `시작 화면 HTML 이 48 KiB 안이다 (${Buffer.byteLength(html)} B)`);
  t.ok(html.includes('<meta name="theme-color" content="#3182f6"/>'), "시작 화면 브라우저 색이 브랜드 #3182f6 이다");

  // 머리: 장부 마크 타일 → /, 오른쪽 ‘서비스 소개’
  t.ok(html.includes('<header class="loginTop"><a class="loginBrand" href="/"><span class="loginMark"><svg viewBox="0 0 24 24" aria-hidden="true">'), "머리 왼쪽은 장부 마크 타일이고 / 로 간다");
  t.ok(html.includes('<b>말해가계부</b></a><a class="loginAbout" href="/">서비스 소개</a></header>'), "머리 오른쪽에 ‘서비스 소개’ 링크가 있다");
  t.ok(html.indexOf('<header class="loginTop">') < html.indexOf("<main"), "머리는 본문 앞에 있다");

  // 순서: 제목 → 카카오 → 로그인 이름 칸 → 카카오 기록 이어 열기 → 새 계정·둘러보기 → 예시 카드 → 가입 → 기능 미리보기
  const marks = ['<h1 id="landingTitle">', '<a class="kakaoBtn" href="/auth/kakao/start">', '<details class="loginLocal" id="login-local">', 'id="kakao-claim-start"', '<p class="loginNext">', '<section class="loginExample"', '<details class="card signupCard" id="signup-start">', '<section id="feature-preview"'];
  const at = marks.map((mark) => html.indexOf(mark));
  t.ok(at.every((value, index) => value > 0 && (index === 0 || value > at[index - 1])), `시작 화면 순서가 지시서와 같다 (${at.join(" < ")})`);
  t.ok(html.includes('<h1 id="landingTitle">말하듯 기록하고,<br/><strong>숫자로 바로 이해하세요.</strong></h1><p class="heroLead">카카오톡에서 한 줄로 적고, 웹에서 예산과 정산까지 확인해요.</p>'), "제목과 한 줄 소개");

  // 카카오 로그인 버튼(§3-4)
  const kakao = between(html, '<a class="kakaoBtn"', "</a>");
  t.ok(kakao.includes('<path d="M12 3.5c-5.247 0-9.5 3.343-9.5 7.466') && kakao.endsWith("카카오 로그인"), "카카오 버튼은 말풍선 심볼과 ‘카카오 로그인’ 라벨이다");
  t.eq(count(html, 'class="kakaoBtn"'), 1, "카카오 로그인 버튼은 하나다");
  t.ok(html.includes(".kakaoBtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:12px;background:#fee500!important;color:rgba(0,0,0,.85)!important"), "카카오 버튼: 높이 54·모서리 12·#FEE500·글씨 rgba(0,0,0,.85)");
  t.ok(html.includes(".kakaoBtn svg{width:22px;height:22px;fill:#000}"), "카카오 심볼은 검정이다");
  t.ok(!html.includes("가장 간편한 방법") && !html.includes('class="sep"'), "예전 안내 상자·‘다른 방법으로 접속’ 구분선이 없다");

  // 첫 화면 채운 버튼은 카카오 하나: 로그인 구간에서 카카오 앞뒤로 다른 채운 단추가 열려 있지 않다
  const hero = between(html, '<section id="login-start"', '<section class="loginExample"');
  const beforeLocal = hero.slice(0, hero.indexOf('<details class="loginLocal"'));
  t.ok(!beforeLocal.includes("<button") && !hero.includes('class="cta'), "카카오 버튼 앞뒤의 첫 화면에는 다른 단추가 없다");
  t.ok(hero.includes('<details class="loginLocal" id="login-local"><summary>') && hero.includes('<details class="loginOptional" id="kakao-claim-start"><summary'), "로그인 이름 칸과 카카오 기록 이어 열기는 접힌 채다(그 안의 제출 단추는 첫 화면에 없다)");
  t.ok(!html.includes('class="cta ctaPrimary"') && !html.includes("기능 먼저 보기"), "예전 ‘기능 먼저 보기’ 파란 버튼이 없다");

  // 로그인 이름 칸(<details>, 스크립트 없이 열리고 제출된다)
  const local = between(html, '<details class="loginLocal" id="login-local">', '<details class="loginOptional" id="kakao-claim-start">');
  t.ok(local.includes("로그인 이름으로 로그인</summary><div class=\"card loginCard\">"), "접힌 칸 이름은 ‘로그인 이름으로 로그인’이다");
  t.ok(local.includes('<form method="post" action="/my/local-login"><input type="hidden" name="return_to" value="/app?month=2026-10&amp;household_id=house-home"/>'), "기존 로그인 폼 주소와 돌아갈 곳이 그대로다");
  t.ok(local.includes('<input id="loginName" name="login_name" autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="next" placeholder="PC에서 쓰던 로그인 이름" aria-describedby="loginNameError" required/><p class="fieldError" id="loginNameError"></p>'), "로그인 이름 칸은 칸 아래 오류 자리(aria-describedby)를 가리키고, 오류가 없으면 그 자리는 비어 있다");
  t.ok(local.includes('name="access_code" type="password" autocomplete="current-password" minlength="4" enterkeyhint="go" placeholder="계정 로그인 비밀번호" aria-describedby="loginPasswordError" required/>'), "비밀번호 칸은 서버와 같은 4자리 기준(minlength 4)과 오류 자리를 가진다");
  t.ok(local.includes('<button class="pwToggle" id="loginPasswordToggle" type="button" aria-controls="loginPassword" aria-pressed="false" aria-label="비밀번호 보기" hidden>'), "비밀번호 보기 버튼은 type=button 이고 스크립트가 켤 때까지 숨어 있다");
  t.ok(local.includes('<button type="submit">로그인</button></form><p class="hint legacyHelp"><b>기존 4자리 접속코드도 사용할 수 있습니다.</b>'), "로그인 단추와 4자리 접속코드 안내가 칸 안에 있다");
  t.ok(html.includes(".fieldError:empty,.pwToggle[hidden]{display:none}") && html.includes('body.abPageLogin .field input[aria-invalid="true"]{border-color:var(--neg,#c0362c)!important}'), "빈 오류 자리와 숨은 보기 버튼은 보이지 않고, 틀린 칸은 --neg 테두리다");
  t.ok(html.includes("body.abPageLogin .loginLocal>summary{display:flex;") && html.includes("min-height:52px;border:1px solid var(--ab12-line,#e9ebee)"), "접힌 칸 단추는 높이 52 의 테두리 단추다(채운 단추가 아니다)");

  // 아래 줄·예시 카드·미리보기
  t.ok(html.includes('<p class="loginNext"><span>처음이신가요? <a href="#signup-start" data-signup-entry>새 계정 만들기</a></span><a class="loginTour" href="/demo">먼저 둘러보기 →</a></p>'), "‘처음이신가요? 새 계정 만들기’(#signup-start)와 ‘먼저 둘러보기 →’(/demo)");
  const example = between(html, '<section class="loginExample"', "</section>");
  t.ok(example.includes('<p class="exBubble">점심 12000 국민카드</p>') && example.includes('<span class="abCat" data-ck="food" aria-hidden="true"><i class="abCatIcon"></i></span><div><b>점심</b><small>식비 · 국민카드 · 오늘</small></div><strong>-12,000원</strong>'), "예시 카드: 카톡 한 줄 → 앱과 같은 카테고리 동그라미 행");
  t.ok(!/<form|<button|fetch\(|localStorage|document\.cookie/.test(example), "예시 카드는 읽기만 한다(폼·단추·요청·저장 없음)");
  // 결정 D-2: 카카오 노랑은 카카오 로그인 버튼에만 쓴다. 카톡 말풍선(예시 카드·기존 기능 미리보기)도 노랑이 아니라 브랜드 옅은 면이다(통합 때 고침).
  t.ok(html.includes(".exBubble{justify-self:end;max-width:85%;padding:10px 14px;border-radius:16px 16px 4px 16px;background:var(--ab12-accent-soft,#e8f3ff);color:var(--ab12-text,#191f28);"), "예시 말풍선은 브랜드 옅은 면·본문 글자다(D-2)");
  t.eq((html.match(/#fee500/gi) || []).length, 1, "시작 화면의 카카오 노랑은 카카오 로그인 버튼 한 곳뿐이다(D-2)");
  t.ok(html.includes(".chatBubble.user{justify-self:end;background:var(--ab12-accent-soft,#e8f3ff);color:var(--ab12-text,#191f28);"), "기존 기능 미리보기의 내 말풍선도 브랜드 옅은 면·본문 글자다(D-2)");
  t.ok(!/#ffeb57/i.test(html), "시작 화면에 예전 노란 말풍선 색(#ffeb57)이 없다(D-2)");
  t.ok(html.includes('<span class="eyebrow">로그인 전 기능 미리보기</span>'), "기존 기능 미리보기는 예시 카드·가입 아래에 그대로 있다");
  t.ok(!html.includes('<details class="loginLocal" id="login-local" open>'), "카카오 로그인이 되는 처음 화면은 로그인 이름 칸을 접어 둔다");

  // 장부 마크는 앱 메뉴의 브랜드 아이콘과 같은 모양이다
  const appHtml = (await page(fx, "/app?month=2026-07&household_id=house-home")).html;
  const appIcon = (appHtml.match(/<svg class="abBrandIcon"[\s\S]*?<\/svg>/) || [""])[0];
  const mark = between(html, '<span class="loginMark">', "</span>");
  t.ok(appIcon && mark, "앱 메뉴 브랜드 아이콘과 시작 화면 장부 마크를 찾았다");
  t.deepEq(svgShape(mark), svgShape(appIcon), "시작 화면 장부 마크의 rect·path 가 앱 메뉴 브랜드 아이콘과 같다");
  t.ok(html.includes(".loginMark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--ab12-brand,#3182f6)}"), "장부 마크 타일: 32×32·모서리 10·브랜드 #3182f6");
});

// ── T-20 칸 아래 오류(서버가 다시 그린 화면) ──
await fixture(async (fx) => {
  const noName = await post(fx, "/my/local-login", { access_code: "1234" }, { cookie: "" });
  t.eq(noName.status, 400, "이름 없는 로그인은 기존대로 400 이다");
  t.ok(noName.text.includes("<span>로그인 이름을 입력하세요.</span>"), "서버 문구(로그인 이름을 입력하세요.)는 맨 위 요약에 그대로다");
  t.ok(noName.text.includes('aria-describedby="loginNameError" required aria-invalid="true"/><p class="fieldError" id="loginNameError">로그인 이름을 입력해 주세요</p>'), "이름 칸에 aria-invalid 와 칸 아래 오류 ‘로그인 이름을 입력해 주세요’");
  t.ok(noName.text.includes('<details class="loginLocal" id="login-local" open>'), "오류로 다시 그린 화면은 로그인 이름 칸을 연다");
  t.ok(!between(noName.text, '<details class="loginLocal"', "<form").includes('class="error"'), "칸에 붙은 오류는 상자로 한 번 더 쓰지 않는다");
  t.eq(count(noName.text, 'role="alert"'), 1, "알림 역할은 맨 위 요약 하나다");

  const shortPassword = await post(fx, "/my/local-login", { login_name: "bin", access_code: "12" }, { cookie: "" });
  t.eq(shortPassword.status, 400, "짧은 비밀번호도 기존대로 400 이다");
  t.ok(shortPassword.text.includes("<span>비밀번호를 4자리 이상 입력하세요.</span>"), "서버 문구(비밀번호를 4자리 이상 입력하세요.)는 그대로다");
  t.ok(shortPassword.text.includes('aria-describedby="loginPasswordError" required aria-invalid="true"/>') && shortPassword.text.includes('<p class="fieldError" id="loginPasswordError">비밀번호는 4자리 이상이에요</p>'), "비밀번호 칸에 aria-invalid 와 ‘비밀번호는 4자리 이상이에요’");
  t.ok(!shortPassword.text.includes('id="loginName" name="login_name" autocomplete="username" autocapitalize="none" spellcheck="false" enterkeyhint="next" placeholder="PC에서 쓰던 로그인 이름" aria-describedby="loginNameError" required aria-invalid'), "맞게 쓴 이름 칸은 틀렸다고 표시하지 않는다");

  const wrong = await post(fx, "/my/local-login", { login_name: "없는사람", access_code: "wrong-pass-123" }, { cookie: "" });
  t.ok(wrong.status >= 400 && between(wrong.text, '<details class="loginLocal" id="login-local" open>', "<form").includes('<div class="error">'), "칸이 정해지지 않은 오류(틀린 비밀번호)는 열린 칸의 폼 위 상자로 보인다");
  t.ok(!/<input\b[^>]*aria-invalid="true"/.test(wrong.text), "칸이 정해지지 않은 오류는 어느 칸도 틀렸다고 표시하지 않는다");

  const off = await page(fx, "/my", { cookie: "" });
  t.ok(!off.html.includes('class="kakaoBtn"') && off.html.includes('<details class="loginLocal" id="login-local" open>'), "카카오 로그인이 꺼진 env 에서는 로그인 이름 칸이 열린 채 첫 경로다");
});

// ── T-20 로그인 칸 스크립트(가짜 DOM) ──
await fixture(async (fx) => {
  const html = (await page(fx, "/my", { cookie: "" })).html;
  const code = script(html, "loginFieldRuntime");
  t.ok(code.includes('{nameId:"loginName",passwordId:"loginPassword",toggleId:"loginPasswordToggle",min:4,nameMsg:"로그인 이름을 입력해 주세요",passwordMsg:"비밀번호는 4자리 이상이에요"}'), "스크립트 설정: 칸 id·4자리 기준·두 문구");
  t.ok(!/fetch\(|localStorage|sessionStorage|document\.cookie/.test(code), "로그인 칸 스크립트는 요청·저장소를 쓰지 않는다");
  const listeners = {}; const clicks = [];
  const form = { noValidate: false, addEventListener(type, fn) { (listeners[type] ||= []).push(fn); } };
  const field = (id, type) => {
    const attrs = new Map();
    return { id, type, value: "", form, focused: 0, setAttribute(k, v) { attrs.set(k, String(v)); }, getAttribute(k) { return attrs.has(k) ? attrs.get(k) : null; }, removeAttribute(k) { attrs.delete(k); }, focus() { this.focused += 1; } };
  };
  const name = field("loginName", "text"); const password = field("loginPassword", "password");
  const toggleAttrs = new Map([["aria-pressed", "false"], ["aria-label", "비밀번호 보기"]]);
  const toggle = { hidden: true, setAttribute(k, v) { toggleAttrs.set(k, String(v)); }, getAttribute(k) { return toggleAttrs.get(k) ?? null; }, addEventListener(type, fn) { if (type === "click") clicks.push(fn); } };
  const notes = { loginNameError: { textContent: "" }, loginPasswordError: { textContent: "" } };
  const byId = { loginName: name, loginPassword: password, loginPasswordToggle: toggle, ...notes };
  vm.runInContext(code, vm.createContext({ document: { getElementById: (id) => byId[id] || null }, String }));
  const submit = () => { let prevented = false; for (const fn of listeners.submit || []) fn({ preventDefault() { prevented = true; } }); return prevented; };
  const input = (target) => { for (const fn of listeners.input || []) fn({ target }); };
  t.ok(form.noValidate === true && toggle.hidden === false, "스크립트가 있으면 기본 말풍선 대신 칸 아래 오류를 쓰고, 보기 버튼을 켠다");
  t.ok(submit(), "빈 칸으로 제출하면 막는다");
  t.ok(name.getAttribute("aria-invalid") === "true" && notes.loginNameError.textContent === "로그인 이름을 입력해 주세요", "빈 이름 칸: aria-invalid 와 칸 아래 문구");
  t.ok(password.getAttribute("aria-invalid") === "true" && notes.loginPasswordError.textContent === "비밀번호는 4자리 이상이에요", "빈 비밀번호 칸: aria-invalid 와 칸 아래 문구");
  t.ok(name.focused === 1 && password.focused === 0, "첫 번째 틀린 칸(이름)으로 초점을 옮긴다");
  name.value = "가족"; input(name);
  t.ok(name.getAttribute("aria-invalid") === null && notes.loginNameError.textContent === "", "고쳐 쓰면 그 칸의 오류가 바로 사라진다");
  password.value = "1234"; input(password);
  t.ok(password.getAttribute("aria-invalid") === null && notes.loginPasswordError.textContent === "", "예전 4자리 접속코드는 스크립트 검사에서 막지 않는다");
  clicks.forEach((fn) => fn({}));
  t.ok(password.type === "text" && toggleAttrs.get("aria-pressed") === "true" && toggleAttrs.get("aria-label") === "비밀번호 숨기기", "보기 버튼: 글자로 보이고 aria-pressed·이름이 바뀐다");
  t.ok(!submit(), "맞게 쓰면 제출을 막지 않는다");
  t.ok(password.type === "password" && toggleAttrs.get("aria-pressed") === "false", "제출할 때 보이던 비밀번호를 다시 가린다");
});

// ── T-21 공개 페이지 브랜드(로고·주 버튼·theme-color·매니페스트) ──
const OLD_PUBLIC_COLORS = ["#312e81", "#3730a3", "#5145a5", "#373078", "#eeedfa", "#1c2141", "#7554d9", "#FEE500"];
await fixture(async (fx) => {
  Object.assign(fx.env, KAKAO);
  let outbound = 0;
  const realFetch = globalThis.fetch;
  globalThis.fetch = async (...args) => { outbound += 1; return realFetch(...args); };
  const pages = new Map();
  try {
    for (const path of ["/", "/demo", "/guides", "/articles", "/budget-ratio-guide", "/household-spending-statistics", "/faq"]) pages.set(path, await page(fx, path, { cookie: "" }));
  } finally { globalThis.fetch = realFetch; }
  t.eq(outbound, 0, "공개 페이지는 바깥 요청을 하지 않는다");
  // 앱 홈은 이번 달일 때만 속도 문장·오늘 표시를 그린다. 픽스처 기록 달(2026-07)의 15일로 시계를 고정해 비교한다.
  const appHtml = await withClock("2026-07-15", async () => (await page(fx, "/app?month=2026-07&household_id=house-home")).html);
  const appIcon = (appHtml.match(/<svg class="abBrandIcon"[\s\S]*?<\/svg>/) || [""])[0];
  for (const [path, view] of pages) {
    const html = view.html;
    t.eq(view.status, 200, `${path}: 공개 페이지가 열린다`);
    t.eq(view.setCookie, "", `${path}: 쿠키를 만들지 않는다`);
    t.ok(html.includes('<meta name="theme-color" content="#3182f6"/>') && !html.includes('content="#312e81"'), `${path}: theme-color 가 앱 브랜드 #3182f6 이다`);
    const mark = between(html, '<a class="pubBrand" href="/"><span class="pubMark">', "</span>");
    t.ok(mark.includes('<svg viewBox="0 0 24 24" aria-hidden="true">') && !html.includes("<span>₩</span>"), `${path}: 머리 로고는 장부 마크 타일이고 노란 ₩ 타일이 없다`);
    t.deepEq(svgShape(mark), svgShape(appIcon), `${path}: 공개 머리 장부 마크의 rect·path 가 앱 메뉴 아이콘과 같다`);
    t.ok(html.includes('<a class="pubStart" href="/my">로그인</a>'), `${path}: 머리 오른쪽 /my 링크는 ‘로그인’ 글자 링크다`);
    const css = (html.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
    t.ok(css.includes(".pubMark{display:grid;place-items:center;width:32px;height:32px;border-radius:10px;background:var(--ab12-brand,#3182f6)}"), `${path}: 로고 타일은 32×32·모서리 10·브랜드 #3182f6 이다`);
    t.ok(css.includes(".pubStart{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 12px;border-radius:12px;color:var(--ab12-accent,#1d4ed8);") && !css.includes("background:#172033"), `${path}: 머리 버튼은 검게 채우지 않은 accent 글자 링크다`);
    t.ok(css.includes("min-height:50px;border-radius:12px;background:var(--ab12-action,#1d4ed8);color:#fff;") && css.includes(".pubBtn{min-height:54px;border-radius:14px}"), `${path}: 주 버튼은 --ab12-action 면·흰 글자, 높이 50/모바일 54(§3-4)다`);
    const left = OLD_PUBLIC_COLORS.filter((color) => html.includes(color));
    t.eq(left.join(" "), "", `${path}: 예전 남색·보라·노랑 브랜드 색이 남지 않았다`);
    t.ok(!/\.pubHome \.pubHero\{background/.test(css), `${path}: 어두운 히어로 상자가 없다`);
    if (path !== "/" && path !== "/demo") t.ok(!css.includes(".pubPreview") && !css.includes(".pubLand"), `${path}: 미리보기·랜딩 CSS 는 홈과 /demo 에만 싣는다`);
  }
  const fee = pages.get("/").html.match(/#fee500/gi) || [];
  t.eq(fee.length, 1, "카카오 노랑은 홈에서 카카오 로그인 버튼 한 곳뿐이다");
  t.ok(pages.get("/").html.includes(".kakaoBtn{display:flex;align-items:center;justify-content:center;gap:10px;min-height:54px;border-radius:12px;background:#fee500;color:rgba(0,0,0,.85);"), "띠의 카카오 버튼: 높이 54·모서리 12·#FEE500·글씨 rgba(0,0,0,.85)(§3-4)");

  // 셸 CSS 토큰과 같은 값인지(공개 화면은 셸 CSS 를 싣지 않아 대체값으로 쓴다)
  const shellPath = (appHtml.match(/<link rel="stylesheet" href="(\/assets\/accountbook-shell-v\d+\.css)"\/>/) || [, ""])[1];
  const shell = shellPath ? await (await app.fetch(new Request(`${BASE}${shellPath}`), fx.env, ctx)).text() : "";
  t.ok(shell.includes("--ab12-brand:#3182f6;--ab12-accent:#1d4ed8;--ab12-action:#1d4ed8;--ab12-accent-soft:#e8f3ff"), `셸 CSS(${shellPath}) 의 라이트 토큰이 공개 대체값(brand #3182f6·accent/action #1d4ed8·accent-soft #e8f3ff)과 같다`);

  // 매니페스트
  const manifest = await app.fetch(new Request(`${BASE}/manifest.json`), fx.env, ctx);
  const parsed = JSON.parse(await manifest.text());
  t.ok(parsed.name === "말해가계부" && parsed.theme_color === "#3182f6", "매니페스트 이름은 ‘말해가계부’, 색은 #3182f6 이다");
  t.eq(manifest.headers.get("etag"), '"ab-manifest-v22987"', "매니페스트 내용이 바뀌어 ETag 를 올렸다");

  // ── T-21 공개 첫 화면 순서·문구 ──
  const home = pages.get("/").html;
  const order = ["<h1>", '<div class="pubHeroActions">', '<section class="pubLand pubLandPreview" id="app-preview"', 'aria-labelledby="land-steps"', '<section class="pubLand pubLandGroup"', '<section class="pubLand pubLandNote"', '<section class="pubSection" id="section-1">', "</article>", '<div class="pubReadingNext">', '<section class="pubBand"', '<footer class="pubFooter">'];
  // 미리보기 거래 행도 <article> 이라, 표지마다 앞 표지 뒤에서부터 찾는다.
  const at = [];
  for (const mark of order) at.push(home.indexOf(mark, at.length ? at[at.length - 1] + 1 : 0));
  t.ok(at.every((value) => value > 0), `홈 순서: 히어로 → 미리보기 → 세 걸음 → 공동 가계부 → 알아 둘 점 → 안내 절 → 카카오 로그인 띠 → 바닥글 (${at.join(" < ")})`);
  t.ok(home.indexOf('<section class="pubSection" id="section-1">') > home.indexOf('<section class="pubLand pubLandNote"'), "안내 절은 랜딩 묶음 뒤에 온다");
  t.ok(home.includes('<div class="pubHeroActions"><a class="pubBtn" href="/my">내 가계부 시작하기</a><a class="pubBtn secondary" href="/demo">가상 가계부 둘러보기</a></div>'), "히어로 주 버튼 ‘내 가계부 시작하기’, 보조 ‘가상 가계부 둘러보기’");
  t.ok(home.includes("<h1>말한 기록이, 함께 보는 생활비가 됩니다</h1>"), "히어로 제목은 지금 문구 그대로다");
  t.ok(!home.includes('<nav class="pubToc"'), "랜딩은 목차 대신 미리보기가 머리 바로 아래에 온다");
  t.ok(home.includes("<h2 id=\"land-steps\">기록은 세 걸음이면 끝나요</h2>") && ["카카오톡에 한 줄", "금액·내용·결제수단 정리", "웹에서 예산 확인"].every((step) => home.includes(`<b>${step}</b>`)), "세 걸음: 카톡에 한 줄 / 금액·내용·결제수단 정리 / 웹에서 예산 확인");
  t.ok(home.includes('<h2 id="land-group">단톡방이면 공동 가계부가 돼요</h2>') && between(home, '<section class="pubLand pubLandGroup"', "</section>").includes('href="/group-accountbook"'), "공동 가계부·정산 묶음과 정산 사례 링크");
  t.eq(count(home, "함께 쓴 돈은 계산 근거까지 확인하세요"), 0, "예전 정산 절은 공동 가계부 묶음으로 합쳤다");
  const independent = "말해가계부는 사용자가 입력한 생활비를 정리하는 독립 서비스입니다. 은행·카드사 계정을 자동으로 연결하거나 투자·세무 판단을 대신하지 않습니다. 카카오가 직접 제공하는 공식 가계부 서비스는 아닙니다.";
  t.ok(between(home, '<section class="pubLand pubLandNote"', "</section>").includes(independent) && count(home, independent) === 1, "알아 둘 점은 지금 문구(은행·카드 자동 연결 안 함, 카카오 공식 아님) 그대로이고 한 번만 나온다");
  const band = between(home, '<section class="pubBand"', "</section>");
  t.ok(band.includes('<a class="kakaoBtn" href="/auth/kakao/start">') && band.includes('<a class="pubBtn secondary" href="/demo">가상 가계부 둘러보기</a>'), "카카오 로그인 띠: 카카오 로그인(설정된 서버) + 가상 가계부 둘러보기");
  const heroActions = between(home, '<div class="pubHeroActions">', "</div>");
  t.eq(count(heroActions, 'class="pubBtn"'), 1, "히어로의 채운 주 버튼은 하나다");

  // ── T-21 앱 화면 미리보기(T-12·T-13 과 같은 마크업) ──
  const preview = between(home, '<figure class="pubPreview">', "</figure>");
  const budget = between(preview, '<section class="homeBudget">', "</section>");
  const appBudget = (appHtml.match(/<section class="homeBudget[^"]*"[^>]*>[\s\S]*?<\/section>/) || [""])[0];
  const classes = (fragment) => [...fragment.matchAll(/class="([^"]+)"/g)].map((m) => m[1]);
  const appClasses = classes(appBudget).filter((name) => !["homeBudgetToday", "income", "expense", "abDailyHelp"].includes(name));
  t.ok(appBudget.length > 0, "비교할 앱 홈 예산 카드를 찾았다");
  t.deepEq(classes(budget), appClasses, `미리보기 예산 카드의 클래스 순서가 앱 홈(T-12)과 같다(오늘 쓴 돈·계산 도움말 줄만 뺐다: ${appClasses.join(" > ")})`);
  const sentence = (fragment) => (fragment.match(/<div class="homeDailyPlan homePace"><p>([\s\S]*?)<\/p>/) || [, ""])[1].replace(/<span[^>]*>/g, "<span>").replace(/\d[\d,]*/g, "#");
  t.ok(sentence(appBudget).length > 0 && sentence(budget) === sentence(appBudget), `속도 문장 틀이 앱과 같다 (${sentence(budget)})`);
  const num = (text) => Number(String(text).replace(/,/g, ""));
  const remaining = num((budget.match(/<div class="homeBudgetAmount"><b>([\d,]+)<\/b>/) || [])[1]);
  const total = num((budget.match(/전체 예산 ([\d,]+)원/) || [])[1]);
  const spent = num((budget.match(/지출 ([\d,]+)원/) || [])[1]);
  t.eq(total - spent, remaining, "남은 돈 = 전체 예산 − 지출(981,400 = 1,230,000 − 248,600)");
  const rate = Math.round((spent / total) * 100);
  t.ok(budget.includes(`<em>예산 사용률 <span>${rate}%</span></em>`) && budget.includes(`<i style="width:${rate}%"></i>`) && budget.includes(`예산은 ${rate}%만 썼어요`), `사용률 ${rate}% 가 머리·게이지·문장에서 같다`);
  const day = 12, days = 31;
  t.ok(budget.includes(`style="--ab-today:${Math.round((day / days) * 100)}%"`) && budget.includes(`이번 달의 ${Math.round((day / days) * 100)}%가 지났고`), "오늘 표시와 경과율: 10월 12일 = 31일 중 39%");
  t.ok(budget.includes(`<span data-ab-num="${Math.floor(remaining / (days - day + 1))}">${Math.floor(remaining / (days - day + 1)).toLocaleString("en-US")}</span>원씩`), "하루 금액 = 남은 돈 ÷ 오늘 포함 남은 20일(앱 규칙, 원 미만 버림)");
  const rows = [...preview.matchAll(/<article class="v8-tx" data-type="(expense|income)"><div class="v8-tx-main"><span class="abCat" data-ck="(\w+)" aria-hidden="true"><i class="abCatIcon"><\/i><\/span><div><b>([^<]+)<\/b><span>([^<]+)<\/span><\/div><strong class="(expense|income)">([+-])[\d,]+원<\/strong><\/div><\/article>/g)];
  t.eq(rows.length, 3, "거래 3행이 앱 거래 행(T-13 동그라미 포함)과 같은 마크업이다");
  for (const [, type, ck, title, line, cls, sign] of rows) {
    t.ok(cls === type && sign === (type === "income" ? "+" : "-"), `${title}: 금액 클래스·부호가 수입/지출과 맞다`);
    t.eq(ck, categoryKey(line.split(" · ")[0], type, title), `${title}: 동그라미 키(${ck})가 앱 판정(categoryKey)과 같다`);
  }
  t.ok(!/<a\b|<button|<form|<input|<script|fetch\(|localStorage|sessionStorage|document\.cookie/.test(preview), "미리보기는 읽기 전용이다(링크·단추·폼·스크립트·저장 없음)");
  const lightTokens = (shell.match(/(?:^|\n)body\.abV22812Shell\{(--ab12-cat-[^}]+)\}/) || [, ""])[1];
  const homeCss = (home.match(/<style>([\s\S]*?)<\/style>/) || [, ""])[1];
  for (const key of ["food", "cafe", "income"]) {
    const pair = lightTokens.match(new RegExp(`--ab12-cat-${key}-bg:(#[0-9a-f]+);--ab12-cat-${key}-ink:(#[0-9a-f]+)`)) || [];
    const shellIcon = (shell.match(new RegExp(`\\.abCat\\[data-ck="${key}"\\]\\{[^}]*--ab-ck-ico:(url\\("[^"]+"\\))`)) || [, ""])[1];
    t.ok(pair[1] && homeCss.includes(`.pubPreview .abCat[data-ck="${key}"]{--ab-ck-bg:${pair[1]};--ab-ck-ink:${pair[2]};--ab-ck-ico:${shellIcon}}`), `${key}: 동그라미 바탕·잉크·아이콘이 셸 CSS 라이트 값과 같다(${pair[1]}/${pair[2]})`);
  }

  // ── T-21 /demo 위쪽의 같은 미리보기(읽기 전용) ──
  const demo = pages.get("/demo").html;
  const demoPreview = between(demo, '<figure class="pubPreview">', "</figure>");
  t.ok(demoPreview.includes(budget) && rows.every((row) => demoPreview.includes(row[0])), "/demo 미리보기는 홈과 같은 예산 카드·거래 3행이다");
  t.ok(demo.indexOf('<figure class="pubPreview">') > demo.indexOf("<h1>") && demo.indexOf('<figure class="pubPreview">') < demo.indexOf('<p class="pubMeta">') && demo.indexOf('<figure class="pubPreview">') < demo.indexOf('<section class="pubDemo"'), "/demo 미리보기는 머리 영역 소개 바로 아래(계산 예제보다 위)에 있다");
  t.ok(demoPreview.includes('<p class="pubPreviewLabel">웹 가계부 홈 화면 예시 · 가상 데이터</p>') && demoPreview.includes("아래 예산 계산 예제와는 다른 숫자이고"), "/demo 미리보기는 홈 화면 예시·가상 데이터이고 계산 예제와 다른 숫자라고 적는다");
  t.eq(pages.get("/demo").setCookie, "", "/demo 는 쿠키를 만들지 않는다");
  t.ok(!/fetch\(|localStorage|sessionStorage|document\.cookie/.test(demo), "/demo 는 요청·저장소를 쓰지 않는다");
});

// ── T-21 카카오 로그인이 꺼진 서버의 띠 ──
await fixture(async (fx) => {
  const home = (await page(fx, "/", { cookie: "" })).html;
  const band = between(home, '<section class="pubBand"', "</section>");
  t.ok(!home.includes('class="kakaoBtn"') && band.includes('<a class="pubBtn" href="/my">내 가계부 시작하기</a>'), "카카오 로그인이 꺼진 env 의 띠는 /my 로 가는 주 버튼이다(오류 주소로 보내지 않는다)");
});

// ── T-22 공유 미리보기 이미지(og:image) ──
const sha256 = (data) => createHash("sha256").update(data).digest("hex");
const ogModule = readFileSync(new URL("../src/modules/assets/og-image.js", import.meta.url));
const ogText = ogModule.toString("utf8");
t.eq(sha256(ogModule), OG_MODULE_SHA256, "생성 파일 og-image.js 가 고정한 SHA-256 과 같다(다시 만들었으면 위 두 값을 새로 적는다)");
t.ok(ogText.startsWith("// 생성 파일이다 — 손으로 고치지 않는다. 다시 만드는 법은 tools/build-og-images.mjs 머리에 있다.\n"), "생성 파일 머리가 다시 만드는 방법을 가리킨다");
t.ok(ogText.includes(`// 카드 HTML SHA-256 ${sha256(ogCardHtml())} ·`), "생성 파일이 지금 카드 HTML(tools/build-og-images.mjs ogCardHtml)로 만든 것이다");
t.ok(ogText.includes(`sharp ${SHARP_VERSION} (libvips ${LIBVIPS_VERSION})`) && ogText.includes(" · 글꼴 Noto Sans KR\n"), `고정한 sharp ${SHARP_VERSION}(libvips ${LIBVIPS_VERSION})로 줄였고 글자는 Noto Sans KR 하나로 그렸다`);
t.ok(Buffer.byteLength(ogText) <= 100 * 1024, `이미지 하나의 Worker 증가(생성 파일 ${Buffer.byteLength(ogText)} B)가 100 KB 이하다`);
let refused = 0;
for (const versions of [{ sharp: "0.35.4", vips: LIBVIPS_VERSION }, { sharp: "0.36.0", vips: LIBVIPS_VERSION }, { sharp: SHARP_VERSION, vips: "8.17.3" }, {}]) {
  try { checkToolVersions(versions); } catch (_) { refused += 1; }
}
t.eq(refused, 4, "빌드 스크립트는 고정한 판이 아닌 sharp·libvips 를 거절한다");
t.ok(checkToolVersions({ sharp: SHARP_VERSION, vips: LIBVIPS_VERSION }), "고정한 판(sharp·libvips)은 받아들인다");
const ogBuild = readFileSync(new URL("../tools/build-og-images.mjs", import.meta.url), "utf8");
t.ok(ogBuild.includes(`npm install sharp@${SHARP_VERSION} --ignore-scripts --save-exact`) && ogBuild.includes("sharp-0.35.5.tgz sha256 3b6bbbe6b308f5c383938ca4a31926cd5d79c4651ed8c5fda16a97da2014a9ac") && ogBuild.includes("sharp-win32-x64-0.35.5.tgz sha256 16a804181ddd258ca6fe7079b2faa0c0356654c9db3d93ab0a80ec5e5161c3d4"), "빌드 스크립트 머리에 고정 판을 받는 법과 꾸러미 SHA-256 이 있다");
t.ok(!/^import [^\n]*sharp/m.test(ogBuild), "빌드 스크립트는 sharp 를 맨 위에서 불러오지 않는다(검사·저장소는 sharp 없이 돈다)");

await fixture(async (fx) => {
  Object.assign(fx.env, KAKAO);
  const appHtml = (await page(fx, "/app?month=2026-07&household_id=house-home")).html;
  const appIcon = (appHtml.match(/<svg class="abBrandIcon"[\s\S]*?<\/svg>/) || [""])[0];
  t.deepEq(svgShape(LEDGER_MARK_SVG), svgShape(appIcon), "공유 이미지 카드의 장부 마크가 앱 메뉴 아이콘과 같은 rect·path 다");
  const version = (OG_IMAGE_PATH.match(/^\/assets\/og-malhaebook-(v\d{5})\.png$/) || [])[1];
  t.ok(version && ogText.includes(`const AB_OG_IMAGE_PATH = "${OG_IMAGE_PATH}";`), `공유 이미지는 판 번호가 붙은 /assets 주소다(${OG_IMAGE_PATH})`);

  const url = `${BASE}${OG_IMAGE_PATH}`;
  const response = await app.fetch(new Request(url), fx.env, ctx);
  const png = Buffer.from(await response.arrayBuffer());
  t.eq(response.status, 200, "공유 이미지가 내려간다");
  t.eq(response.headers.get("content-type"), "image/png", "content-type 은 image/png 다");
  t.eq(response.headers.get("cache-control"), "public, max-age=31536000, immutable", "1년 캐시·immutable 이다");
  t.eq(response.headers.get("x-content-type-options"), "nosniff", "nosniff 를 붙인다");
  t.eq(response.headers.get("cross-origin-resource-policy"), "cross-origin", "다른 출처의 미리보기 수집기가 읽을 수 있다(CORP cross-origin)");
  t.ok((response.headers.get("etag") || "").includes(version || "-"), `ETag 가 주소와 같은 판이다(${response.headers.get("etag")})`);
  t.eq(sha256(png), OG_PNG_SHA256, "내려가는 PNG 가 고정한 SHA-256 과 같다");
  t.ok(ogText.includes(`PNG ${png.length} B · SHA-256 ${OG_PNG_SHA256}`), "생성 파일 머리의 PNG 크기·SHA-256 이 내려가는 바이트와 같다");
  const pngSignature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  t.ok(png.subarray(0, 8).equals(pngSignature) && png.toString("latin1", 12, 16) === "IHDR" && png.readUInt32BE(16) === OG_WIDTH && png.readUInt32BE(20) === OG_HEIGHT && png[25] === 3, `PNG 머리: ${OG_WIDTH}×${OG_HEIGHT}, 팔레트(색 형식 3)`);
  t.ok(png.length <= 75 * 1024, `PNG ${png.length} B — base64 로 담아도 이미지당 100 KB 안이다`);
  const head = await app.fetch(new Request(url, { method: "HEAD" }), fx.env, ctx);
  t.ok(head.status === 200 && head.headers.get("content-type") === "image/png" && (await head.arrayBuffer()).byteLength === 0, "HEAD 는 머리만 보낸다");
  const again = Buffer.from(await (await app.fetch(new Request(url), fx.env, ctx)).arrayBuffer());
  t.eq(sha256(again), OG_PNG_SHA256, "두 번째 요청도 같은 바이트다(디코드한 바이트를 한 번만 만들고 복사해 보낸다)");

  // 공개 페이지 머리: 정본 출처의 절대 주소, 크기, 대체 글, 큰 이미지 카드. og:url 바로 뒤에 한 번씩.
  const meta = `<meta property="og:image" content="${BASE}${OG_IMAGE_PATH}"/><meta property="og:image:type" content="image/png"/><meta property="og:image:width" content="${OG_WIDTH}"/><meta property="og:image:height" content="${OG_HEIGHT}"/><meta property="og:image:alt" content="${OG_IMAGE_ALT}"/><meta name="twitter:card" content="summary_large_image"/>`;
  const sitemap = await (await app.fetch(new Request(`${BASE}/sitemap.xml`), fx.env, ctx)).text();
  const paths = [...new Set([...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => new URL(m[1]).pathname))];
  const entry = ["/", "/demo", "/guides", "/articles", "/budget-ratio-guide", "/fixed-cost-checklist"];
  t.ok(entry.filter((path) => path !== "/fixed-cost-checklist").every((path) => paths.includes(path)), `사이트맵에 공개 진입 페이지가 있다(${paths.length}개)`);
  let withOg = 0;
  const missing = [];
  for (const path of [...new Set([...entry, ...paths])]) {
    const view = await page(fx, path, { cookie: "" });
    if (view.status !== 200 || !view.html.includes('<meta property="og:title"')) continue;
    const headHtml = view.html.slice(0, view.html.indexOf("</head>"));
    const ok = count(headHtml, meta) === 1 && count(view.html, 'property="og:image"') === 1 && /<meta property="og:url" content="[^"]+"\/><meta property="og:image" /.test(headHtml);
    if (ok) withOg += 1; else missing.push(path);
  }
  t.eq(missing.join(" "), "", `og:title 이 있는 공개 페이지 ${withOg}개 모두 og:image·크기·대체 글·twitter:card 를 머리에 한 번 싣는다`);
  t.ok(withOg >= paths.length, `사이트맵의 공개 페이지(${paths.length}개)를 빠짐없이 봤다(${withOg}개)`);
  for (const path of ["/", "/demo", "/guides", "/articles", "/budget-ratio-guide"]) {
    t.ok(count((await page(fx, path, { cookie: "" })).html, meta) === 1, `${path}: 공유 이미지 태그가 있다`);
  }
  t.ok(OG_IMAGE_ALT.includes("말해가계부") && OG_IMAGE_ALT.includes("가상 데이터"), "대체 글이 이미지 내용(장부 마크·문구·가상 데이터 화면)을 말한다");
});

t.done();
