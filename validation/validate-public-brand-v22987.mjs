// V22.9.87 — 공개·로그인 묶음(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-20 · T-21 · T-22) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-20 /my 시작 화면은 기능 미리보기가 먼저이고 카카오 로그인 버튼은 한참 아래(390×812 에서 y 3320)에 있었다. 첫 화면의 채운 버튼은
//        ‘기능 먼저 보기’ 파란 버튼이었고, 로그인 이름 칸의 오류는 맨 위 요약에만 있었다.
//
// ── 어떻게 잡는가 ──
// 화면은 픽스처(카카오 로그인을 켠 env 와 끈 env)로 그린 HTML 의 순서·속성·문구를 보고, 로그인 칸 스크립트(loginFieldRuntime)는 vm 의 가짜 DOM 에서
// 실제로 돌린다. 첫 화면 위치(카카오 버튼 y)와 채운 버튼 수는 review-artifacts/design-uplift-2026-10-28/v87/public/ 의 브라우저 측정이 맡는다.
import vm from "node:vm";
import { app, BASE, ctx, counter, fixture, page, post } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.87 공개·로그인 묶음(T-20 로그인 먼저 시작 화면)");
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

t.done();
