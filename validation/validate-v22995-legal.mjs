#!/usr/bin/env node
// V22.9.95 법무 검사(R-9) — 약관·개인정보처리방침 동의와 만 14세 확인, 개인정보처리방침 보강, 이용약관, 사업자 표시.
//   1 로그인 화면: 가입 폼과 카카오 로그인 폼에 동의 칸이 하나씩(필수·미리 체크 없음·두 링크 새 탭), 화면 끝 이용약관·개인정보처리방침 줄,
//     좁은 폭(360px)·다크 모드에서 칸 글이 잘리지 않는 CSS.
//   2 로컬 가입: 동의가 없으면 400(맨 위 요약 + 칸 아래 문구)이고 계정·가입 RPC·시도 기록이 없으며 입력값을 되살린다. 동의하면 303 이고
//     설정 표에 consent:<user_id> 를 upsert 한다. 기록이 실패해도 가입은 되고 consent_record_failed(warn) 가 남는다.
//   3 카카오 시작: 동의 없이 보통 로그인을 시작하면 로그인 화면(400, 오류)이다. consent=1 이면 카카오 인가로 가고 서명된 상태에 consent:1 이 실린다.
//     인앱 자동 로그인(auto=1)·연결(link)·본인 확인(reauth)·로그인 세션이 있는 사람은 예전처럼 카카오로 간다.
//   4 카카오 콜백: 동의한 로그인에서만 새 계정을 만들고 consent:<id>(via kakao)를 남긴다. 동의 없는 상태로 온 새 카카오 계정은 만들지 않고
//     로그인 화면(오류)으로 돌려보낸다. 기존 계정은 동의 표시 없이도 들어오고 동의 기록을 새로 쓰지 않는다.
//   5 /privacy 1~13절(표 2개·보호책임자·위탁과 국외 이전·만 14세·파기·구제기관·변경 고지), 적은 쿠키 이름이 코드에 있는지, /terms 2절, 개정일 상수.
//   6 공개 꼬리말의 대표·문의 이메일(전화번호 없음), /menu 의 이용약관·개인정보처리방침, 카카오 ‘개인정보’ 답이 방침의 문의 경로를 가리킨다.
//   7 공개 첫 화면의 카카오 띠도 같은 동의 폼이다. 8 로그인 대기 화면 스크립트는 폼 제출에만 뜬다(동의 칸을 비우면 뜨지 않는다).
// 실제 번들(src/index.js)의 app.fetch 와 QA 픽스처로 본다. DB·네트워크 없음. 장면 시계는 개정일 12:00 KST 로 고정한다.
//   node validation/validate-v22995-legal.mjs
import { readdirSync, readFileSync, statSync } from "node:fs";
import { isDeepStrictEqual } from "node:util";
import vm from "node:vm";
import { app, BASE, ctx, failure, fixture, formFields, intercept, page, post, settingValue, skill, withClock } from "./lib-audit-v22934.mjs";
import { readPurposeToken } from "../src/index.js";

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

// ── 공통 준비 ────────────────────────────────────────────────────────────────
const siteConfig = read("../src/modules/public/site-config.js");
const REVISION = siteConfig.match(/const POLICY_REVISION_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const [RY, RM, RD] = REVISION.split("-").map(Number);
const REVISION_LABEL = `${RY}년 ${RM}월 ${RD}일`;
// E-17: 공고일(화면에 올린 날) + 7일 = 시행일. 12절의 ‘시행 7일 전 고지’ 와 같은 수.
const NOTICE = siteConfig.match(/const POLICY_NOTICE_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const [NY, NM, ND] = NOTICE.split("-").map(Number);
const NOTICE_LABEL = `${NY}년 ${NM}월 ${ND}일`;
const SCENE_AT = new Date(Date.parse(`${REVISION}T12:00:00+09:00`)).toISOString();
const MESSAGE = "약관·개인정보처리방침 동의와 만 14세 이상 확인이 필요해요";
const LABEL = "이용약관과 개인정보처리방침에 동의하며, 만 14세 이상입니다";
const EMAIL = "admin@malhaebook.com";
const PHONE = /01[016789][-.\s]?\d{3,4}[-.\s]?\d{4}/;
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const CHROME = "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key-v22995", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` };
const SIGNUP = { login_name: "Consent Family", display_name: "동의 사용자", access_code: "safe-password-2026", access_code_confirm: "safe-password-2026" };

const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const clearEvents = () => { if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0; };
const text = (html) => String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, "").replace(/\s+/g, " ");
const parse = (value) => { try { return typeof value === "string" ? JSON.parse(value) : value ?? null; } catch (_) { return null; } };
const consentKeys = (fx) => fx.db.accountbook_settings.filter((row) => String(row.key).startsWith("consent:"));
const styles = (html) => [...String(html || "").matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].map((m) => m[1]).join("\n");
const pairs = (lines) => lines.map((line) => String(line).split(";")[0].trim()).filter((pair) => pair && !pair.endsWith("="));
const sessionUser = (cookies) => { const pair = cookies.find((item) => item.startsWith("ab_user=")); return pair ? decodeURIComponent(pair.slice("ab_user=".length)).split("|")[0] : ""; };
const consentWriteFails = () => intercept(async ({ url, method, init }) => (method === "POST" && url.pathname === "/rest/v1/accountbook_settings" && String(init.body || "").includes('"consent:') ? failure(503, "consent write down") : null));

// 모듈 소스(생성 번들·옛 자산 문자열 제외). 방침에 적은 쿠키 이름이 실제 코드의 이름인지 본다.
function moduleSources() {
  const root = new URL("../src/modules/", import.meta.url);
  const out = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = new URL(name, dir);
      if (statSync(full).isDirectory()) walk(new URL(`${name}/`, dir));
      else if (name.endsWith(".js") && name !== "historical-runtime-assets.js") out.push({ name, source: readFileSync(full, "utf8") });
    }
  };
  walk(root);
  return out;
}

function luminance(hex) {
  const value = String(hex || "").replace("#", "");
  if (!/^[0-9a-fA-F]{6}$/.test(value)) return Number.NaN;
  const [r, g, b] = [0, 2, 4].map((at) => parseInt(value.slice(at, at + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}
function contrast(a, b) { const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x); return (hi + 0.05) / (lo + 0.05); }

async function go(fx, path, { ua = CHROME, cookie = "", headers = {} } = {}) {
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...(cookie ? { cookie } : {}), ...headers } }), fx.env, ctx);
  const lines = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { status: response.status, location: response.headers.get("location") || "", lines, cookies: pairs(lines), html: await response.text() };
}
async function stateOf(fx, location) {
  try { return await readPurposeToken(fx.env, "kakao-oauth", new URL(location).searchParams.get("state") || ""); } catch (_) { return null; }
}

async function scene(task, { kakao = true } = {}) {
  return withClock(REVISION, () => fixture(async (fx) => {
    clearEvents();
    if (kakao) Object.assign(fx.env, KAKAO_ENV);
    return task(fx);
  }));
}

// 카카오 서버(토큰·프로필)와 픽스처에 없는 카카오 식별 연결 RPC(V22.7, validate-data-v22981 과 같은 방식).
function kakaoServer(fx) {
  const server = { id: "8801", nickname: "새 사용자", links: [], restore: () => {} };
  server.restore = intercept(async ({ url, method, init }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") return json({ access_token: "qa-access-token", token_type: "bearer" });
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(server.id), properties: { nickname: server.nickname } });
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_link_kakao_identity_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      server.links.push(body);
      fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: String(body.p_kakao_id), user_id: String(body.p_user_id), login_name: body.p_nickname, created_at: `${REVISION}T00:00:00Z` });
      return json(true);
    }
    return null;
  });
  return server;
}
async function kakaoLogin(fx, server, kakaoId, { start = "/auth/kakao/start?consent=1", ua = CHROME, cookie = "" } = {}) {
  server.id = String(kakaoId);
  const begin = await go(fx, start, { ua, cookie });
  const state = begin.location.startsWith("https://kauth.kakao.com/") ? new URL(begin.location).searchParams.get("state") || "" : "";
  const jar = [cookie, ...begin.cookies].filter(Boolean).join("; ");
  const callback = await go(fx, `/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { ua, cookie: jar });
  return { begin, callback, state, userId: sessionUser(callback.cookies) };
}

// 로그인 화면에 실리는 대기 화면 스크립트를 가짜 DOM 에서 돌린다(폼·단추·대기 화면만).
function progressSandbox(source, { withForm = true } = {}) {
  const listeners = new Map();
  const on = (target) => (type, handler) => { listeners.set(`${target}:${type}`, handler); };
  const attrs = new Map();
  const button = { addEventListener: on("button"), setAttribute: (key, value) => attrs.set(key, value), removeAttribute: (key) => attrs.delete(key) };
  const form = { querySelector: (selector) => (selector === ".kakaoBtn" ? button : null), addEventListener: on("form") };
  const node = () => ({ hidden: true, textContent: "", addEventListener: () => {} });
  const nodes = { kakaoLoginProgress: node(), kakaoProgressTip: node(), kakaoProgressSlow: node(), kakaoProgressCancel: { addEventListener: on("cancel") } };
  const classes = new Set();
  vm.runInNewContext(source, {
    document: {
      querySelector: (selector) => (withForm && selector === 'form.kakaoStart[action="/auth/kakao/start"]' ? form : null),
      getElementById: (id) => nodes[id] || null,
      documentElement: { classList: { add: (name) => classes.add(name), remove: (name) => classes.delete(name) } },
    },
    window: { addEventListener: on("window"), stop() {} },
    setInterval: () => 1, clearInterval() {}, setTimeout: () => 1, clearTimeout() {},
  });
  return { attrs, nodes, classes, fire: (key, event = {}) => listeners.get(key)?.(event) };
}

ok(/^\d{4}-\d{2}-\d{2}$/.test(REVISION) && Number.isFinite(Date.parse(`${REVISION}T00:00:00Z`)), `0 개정일 상수 POLICY_REVISION_DATE 가 날짜다 (${REVISION})`);
ok(/^\d{4}-\d{2}-\d{2}$/.test(NOTICE) && Date.parse(`${REVISION}T00:00:00Z`) - Date.parse(`${NOTICE}T00:00:00Z`) === 7 * 86400000, `0 공고일 상수 POLICY_NOTICE_DATE 가 날짜이고 시행일이 공고일 + 7일이다 (${NOTICE} → ${REVISION}, E-17)`);

// ── 1. 로그인 화면 ───────────────────────────────────────────────────────────
await section("1 로그인 화면", () => scene(async (fx) => {
  const view = await page(fx, "/my", { cookie: "" });
  eq(view.status, 200, "1 /my 시작 화면이 열린다");
  const html = view.html;
  const signup = formFields(html, "/my/local-signup");
  ok(signup.found, "1 가입 폼이 있다");
  const signupBox = signup.form.match(/<label class="consentRow">[\s\S]*?<\/label>/)?.[0] || "";
  ok(signupBox.includes('<input id="signupConsent" name="consent" type="checkbox" value="1" required/>'), `1 가입 폼의 동의 칸은 필수 체크 칸이다: ${signupBox.slice(0, 160)}`);
  eq(text(signupBox).trim(), LABEL, "1 가입 동의 칸 문구");
  ok(signupBox.includes('<a href="/terms" target="_blank">이용약관</a>') && signupBox.includes('<a href="/privacy" target="_blank">개인정보처리방침</a>'), "1 동의 칸의 이용약관·개인정보처리방침 링크는 새 탭으로 연다");
  ok(!signup.fields.has("consent"), "1 동의 칸은 미리 체크돼 있지 않다(그대로 보내면 consent 가 없다)");
  ok(signup.form.indexOf('id="signupConsent"') > 0 && signup.form.indexOf('id="signupConsent"') < signup.form.indexOf('id="signupPasswordSubmit"'), "1 동의 칸은 ‘새 계정 만들기’ 단추 앞에 있다");

  const kakaoForm = html.match(/<form class="kakaoStart" method="get" action="\/auth\/kakao\/start">([\s\S]*?)<\/form>/)?.[1] || "";
  ok(kakaoForm, "1 카카오 로그인은 /auth/kakao/start 로 가는 GET 폼이다(스크립트 없이 동작)");
  ok(kakaoForm.includes('<input id="kakaoConsent" name="consent" type="checkbox" value="1" required/>'), "1 카카오 로그인 폼에 필수 동의 칸이 있다");
  eq(text(kakaoForm.match(/<label class="consentRow">[\s\S]*?<\/label>/)?.[0]).trim(), LABEL, "1 카카오 동의 칸 문구는 가입 폼과 같다");
  ok(kakaoForm.indexOf('id="kakaoConsent"') >= 0 && kakaoForm.indexOf('id="kakaoConsent"') < kakaoForm.indexOf('<button class="kakaoBtn" type="submit">'), "1 동의 칸은 카카오 로그인 단추 위에 있다");
  ok(!kakaoForm.includes('name="return_to"'), "1 돌아갈 곳이 없으면 숨은 return_to 칸도 없다");
  eq((html.match(/class="kakaoBtn"/g) || []).length, 1, "1 카카오 단추는 하나다");
  eq((html.match(/name="consent"/g) || []).length, 2, "1 동의 칸은 가입 폼과 카카오 폼에 하나씩이다");
  ok(!/name="consent"[^>]*\bchecked\b/.test(html), "1 어느 동의 칸도 미리 체크하지 않는다");
  const legal = html.match(/<p class="loginLegal">([\s\S]*?)<\/p>/)?.[1] || "";
  ok(legal.includes('<a href="/terms">이용약관</a>') && legal.includes('<a href="/privacy"><b>개인정보처리방침</b></a>') && legal.includes('<a href="/contact">문의</a>'), "1 화면 끝에 이용약관·개인정보처리방침(굵게)·문의 줄이 있다");
  const back = await page(fx, "/my?return_to=%2Fmy%2Fanalysis", { cookie: "" });
  ok(back.html.includes('<input type="hidden" name="return_to" value="/my/analysis"/>'), "1 로그인이 풀려 온 화면의 카카오 폼은 돌아갈 곳을 숨은 칸으로 싣는다");

  // 좁은 폭(360px)·다크 모드: 칸 글은 줄바꿈되고 체크 칸은 줄지 않는다. 다크에서는 셸 규칙이 글·링크를 밝게 한다.
  const css = styles(html);
  const rules = css.split("}").filter((rule) => rule.includes(".consentRow"));
  ok(/\.consentRow\{display:flex;align-items:flex-start;/.test(css), "1 동의 칸은 flex(체크 칸 + 글)다");
  ok(css.includes(".consentRow span{min-width:0;overflow-wrap:anywhere}"), "1 동의 글은 좁은 폭에서 줄바꿈된다(min-width:0·overflow-wrap)");
  ok(/\.consentRow input\{flex:none;width:20px;height:20px;/.test(css), "1 체크 칸은 20px 로 줄지 않는다");
  ok(rules.length >= 4 && !rules.some((rule) => /nowrap|overflow:hidden|text-overflow|line-clamp/.test(rule)), `1 동의 칸 규칙에 글을 자르는 값이 없다 (규칙 ${rules.length}개)`);
  const size = Number(css.match(/\.consentRow\{[^}]*font-size:([\d.]+)px/)?.[1] || 0);
  ok(size >= 13, `1 동의 글은 13px 이상이다 (${size}px)`);
  ok(css.includes("body.abPageLogin .kakaoStart button.kakaoBtn{min-height:54px!important;"), "1 카카오 단추는 <button> 이 되어도 54px 높이다(셸의 단추 최소 44px 를 덮는다)");
  const bodyClass = html.match(/<body class="([^"]*)"/)?.[1] || "";
  ok(/\babV22812Shell\b/.test(bodyClass) && /\babPageLogin\b/.test(bodyClass), `1 로그인 화면 body 는 셸 다크 규칙 대상이다 (${bodyClass})`);
  const shellHref = html.match(/<link rel="stylesheet" href="(\/assets\/accountbook-shell-v\d+\.css)"\/>/)?.[1] || "";
  const shell = shellHref ? (await page(fx, shellHref, { cookie: "" })).html : "";
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(h1,h2,h3,strong,b,label,summary){color:var(--ab12-text)!important}'), "1 다크 모드에서 동의 칸 글(label)은 셸이 밝은 글색으로 바꾼다");
  ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell a{color:var(--ab12-accent)!important}'), "1 다크 모드에서 칸 안 링크는 셸의 밝은 강조색이다");
  // 셸에는 같은 선택자의 다크 묶음이 여럿이다. 바탕(--ab12-bg)이 있는 묶음을 고른다.
  const darkVars = [...shell.matchAll(/html\[data-ab-resolved-theme="dark"\] body\.abV22812Shell\{([^}]*)\}/g)].map((m) => m[1]).find((block) => block.includes("--ab12-bg:")) || "";
  const variable = (name) => darkVars.match(new RegExp(`--ab12-${name}:(#[0-9a-fA-F]{6})`))?.[1] || "";
  const textRatio = contrast(variable("text"), variable("bg"));
  const linkRatio = contrast(variable("accent"), variable("bg"));
  ok(textRatio >= 4.5 && linkRatio >= 4.5, `1 다크 모드 글·링크 대비가 4.5:1 이상이다 (글 ${textRatio.toFixed(2)} · 링크 ${linkRatio.toFixed(2)})`);
}));

// ── 2. 로컬 가입 ─────────────────────────────────────────────────────────────
await section("2 로컬 가입", () => scene(async (fx) => {
  const calls = { create: 0, attempts: 0, consentWrites: [] };
  const restore = intercept(async ({ url, method, init }) => {
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_create_local_user_v227") calls.create += 1;
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_auth_attempt") calls.attempts += 1;
    if (method === "POST" && url.pathname === "/rest/v1/accountbook_settings") {
      const body = parse(String(init.body || "null"));
      for (const item of Array.isArray(body) ? body : [body]) {
        if (String(item?.key || "").startsWith("consent:")) calls.consentWrites.push({ key: item.key, search: url.search, prefer: new Headers(init.headers || {}).get("Prefer") || "" });
      }
    }
    return null;
  });
  try {
    const users = fx.db.users.length;
    const missing = await post(fx, "/my/local-signup", SIGNUP, { cookie: "" });
    eq(missing.status, 400, "2 동의 없이 보낸 가입은 400 이다");
    ok(/<a class="authErrorSummary" href="#signupConsent" role="alert"[^>]*>[\s\S]*?약관·개인정보처리방침 동의와 만 14세 이상 확인이 필요해요/.test(missing.text), "2 맨 위 오류 요약이 동의 문구를 말하고 동의 칸을 가리킨다");
    ok(missing.text.includes('<input id="signupConsent" name="consent" type="checkbox" value="1" required aria-invalid="true" aria-describedby="signupConsentError"/>'), "2 동의 칸에 aria-invalid·aria-describedby 가 붙는다");
    const again = formFields(missing.text, "/my/local-signup");
    ok(again.form.includes(`<p class="fieldError" id="signupConsentError">${MESSAGE}</p>`), "2 가입 폼 안, 칸 아래에 같은 짧은 문구가 있다");
    eq(fx.db.users.length, users, "2 동의가 없으면 계정을 만들지 않는다(users 표 그대로)");
    eq(calls.create, 0, "2 동의가 없으면 가입 RPC 를 부르지 않는다");
    eq(calls.attempts, 0, "2 동의를 빠뜨린 요청은 가입 시도 횟수를 쓰지 않는다");
    ok(!missing.setCookie.includes("ab_user="), "2 동의가 없으면 로그인 세션도 주지 않는다");
    eq([again.fields.get("login_name"), again.fields.get("display_name")], [SIGNUP.login_name, SIGNUP.display_name], "2 다시 그린 폼은 로그인 이름·표시 이름을 되살린다");
    ok(!missing.text.includes(SIGNUP.access_code) && !again.fields.has("consent"), "2 비밀번호는 되살리지 않고 동의 칸은 다시 비운다");
    const other = await post(fx, "/my/local-signup", { ...SIGNUP, consent: "on" }, { cookie: "" });
    ok(other.status === 400 && fx.db.users.length === users, "2 consent 값이 1 이 아니면(on) 동의로 보지 않는다");

    const done = await post(fx, "/my/local-signup", { ...SIGNUP, consent: "1" }, { cookie: "" });
    eq(done.status, 303, "2 동의하고 보내면 가입된다(303)");
    eq(fx.db.users.length, users + 1, "2 계정이 하나 생긴다");
    const created = fx.db.users[fx.db.users.length - 1];
    eq(parse(settingValue(fx, `consent:${created?.id}`)), { version: REVISION, at: SCENE_AT, via: "local", age14: true }, "2 설정 표 consent:<user_id> 에 동의 기록(개정일·시각·local·만 14세)이 있다");
    eq(calls.consentWrites.map((write) => write.key), [`consent:${created?.id}`], "2 동의 기록은 새 계정에 한 번 쓴다");
    ok(calls.consentWrites[0]?.search === "?on_conflict=key" && /resolution=merge-duplicates/.test(calls.consentWrites[0]?.prefer || ""), `2 동의 기록은 설정 표 upsert(on_conflict=key·merge-duplicates)다 ${show(calls.consentWrites[0])}`);
    ok(done.setCookie.includes("ab_user=") && /Max-Age=1209600/.test(done.setCookie), "2 로그인 세션 쿠키는 14일(1209600초)이다(방침의 쿠키 목록과 같다)");

    // 동의 기록이 실패해도 가입은 막지 않는다.
    clearEvents();
    const failRestore = consentWriteFails();
    try {
      const second = await post(fx, "/my/local-signup", { ...SIGNUP, login_name: "Consent Family Two", consent: "1" }, { cookie: "" });
      eq(second.status, 303, "2 동의 기록이 실패해도 가입은 된다");
      eq(fx.db.users.length, users + 2, "2 그 계정도 만들어진다");
      ok(!settingValue(fx, `consent:${fx.db.users[fx.db.users.length - 1]?.id}`), "2 실패한 기록은 남지 않는다");
      const warn = events("consent_record_failed");
      ok(warn.length === 1 && warn[0].severity === "warn" && warn[0].path === "/my/local-signup", `2 실패는 운영 이벤트 consent_record_failed(warn)로 남는다 ${show(warn)}`);
    } finally {
      failRestore();
    }
  } finally {
    restore();
  }
}));

// ── 3. 카카오 로그인 시작 ────────────────────────────────────────────────────
await section("3 카카오 시작", () => scene(async (fx) => {
  const plain = await go(fx, "/auth/kakao/start");
  eq(plain.status, 400, "3 동의 없이 시작한 보통 로그인은 로그인 화면(400)으로 돌아간다");
  eq(plain.location, "", "3 카카오 인가로 보내지 않는다");
  ok(!plain.cookies.some((pair) => pair.startsWith("kakao_oauth_state=")), "3 로그인 상태 쿠키를 만들지 않는다");
  ok(/<a class="authErrorSummary" href="#kakaoConsent" role="alert"[^>]*>[\s\S]*?약관·개인정보처리방침 동의와 만 14세 이상 확인이 필요해요[\s\S]*?카카오 로그인으로 이동/.test(plain.html), "3 맨 위 오류 요약이 카카오 동의 칸을 가리킨다");
  ok(plain.html.includes('<input id="kakaoConsent" name="consent" type="checkbox" value="1" required aria-invalid="true" aria-describedby="kakaoConsentError"/>') && plain.html.includes(`<p class="fieldError" id="kakaoConsentError">${MESSAGE}</p>`), "3 카카오 동의 칸에 오류 표시와 칸 아래 문구가 있다");
  ok(events("kakao_login_consent_missing").some((event) => event.detail === "start" && event.severity === "info"), "3 동의 없는 시작은 운영 이벤트(info)로 남는다");
  const kept = await go(fx, "/auth/kakao/start?return_to=%2Fmy%2Fanalysis");
  ok(kept.status === 400 && kept.html.includes('<input type="hidden" name="return_to" value="/my/analysis"/>'), "3 되돌린 화면의 카카오 폼은 돌아갈 곳을 그대로 싣는다");
  const evil = await go(fx, "/auth/kakao/start?return_to=https%3A%2F%2Fevil.example%2F");
  ok(evil.status === 400 && !evil.html.includes("evil.example"), "3 바깥 주소는 돌아갈 곳으로 싣지 않는다");
  eq((await go(fx, "/auth/kakao/start?consent=yes")).status, 400, "3 consent 값이 1 이 아니면 동의로 보지 않는다");

  const agreed = await go(fx, "/auth/kakao/start?consent=1&return_to=%2Fmy%2Fanalysis");
  eq(agreed.status, 303, "3 동의하고 시작하면 카카오 인가로 간다");
  const authorize = new URL(agreed.location || `${BASE}/`);
  eq(authorize.origin + authorize.pathname, "https://kauth.kakao.com/oauth/authorize", "3 카카오 인가 주소");
  ok(!authorize.searchParams.has("prompt") && !authorize.searchParams.has("scope"), "3 보통 로그인은 prompt 가 없고 동의 항목(scope)을 더 받지 않는다");
  const state = await stateOf(fx, agreed.location);
  ok(state?.mode === "login" && state.consent === 1 && state.next === "/my/analysis" && state.auto === undefined, `3 서명된 상태에 동의(consent:1)와 돌아갈 곳이 있다 ${show(state)}`);
  ok(agreed.lines.some((line) => line.startsWith("kakao_oauth_state=") && /Max-Age=600/.test(line)), "3 로그인 상태 쿠키는 10분(600초)이다(방침의 쿠키 목록과 같다)");

  const auto = await go(fx, "/auth/kakao/start?auto=1", { ua: INAPP });
  ok(auto.status === 303 && auto.location.startsWith("https://kauth.kakao.com/oauth/authorize") && new URL(auto.location).searchParams.get("prompt") === "none", `3 인앱 자동 로그인(auto=1)은 동의 없이도 예전처럼 prompt=none 으로 간다 (${auto.status})`);
  const autoState = await stateOf(fx, auto.location);
  ok(autoState?.auto === 1 && autoState.consent === undefined, `3 자동 로그인 상태에는 동의 표시가 없다(새 계정을 만들지 않는 길) ${show(autoState)}`);
  eq((await go(fx, "/auth/kakao/start?auto=1")).status, 400, "3 인앱이 아닌 브라우저의 auto=1 은 보통 로그인이라 동의가 필요하다");
  const link = await go(fx, "/auth/kakao/start?link=1", { cookie: fx.cookie });
  // 연결은 동의 검사 앞에서 갈린다(예전과 같은 흐름: 이 픽스처 사용자는 먼저 본인 확인으로 간다).
  ok(link.status === 303 && link.location && !link.html.includes(MESSAGE) && !link.location.startsWith("/auth/kakao/start"), `3 로그인한 사람의 카카오 연결(link=1)은 동의 화면 없이 예전 연결 흐름으로 간다 (${link.status} ${link.location.slice(0, 60)})`);
  const reauth = await go(fx, "/auth/kakao/start?reauth=credential-change", { cookie: fx.cookie });
  ok(reauth.status === 303 && reauth.location.startsWith("https://kauth.kakao.com/oauth/authorize") && !reauth.html.includes(MESSAGE), `3 본인 확인(reauth)은 동의 요구 없이 예전처럼 간다 (${reauth.status})`);
  const signedIn = await go(fx, "/auth/kakao/start", { cookie: fx.cookie });
  const signedState = await stateOf(fx, signedIn.location);
  ok(signedIn.status === 303 && signedState?.mode === "login" && signedState.consent === undefined, `3 로그인 세션이 있는 사람은 막지 않되 상태에 동의가 없다 ${show(signedState)}`);
}));

// ── 4. 카카오 로그인 콜백 ────────────────────────────────────────────────────
await section("4 카카오 콜백", () => scene(async (fx) => {
  const server = kakaoServer(fx);
  try {
    const users = fx.db.users.length;
    const fresh = await kakaoLogin(fx, server, "8801");
    eq(fresh.callback.status, 303, "4 동의한 새 카카오 사용자는 로그인된다");
    eq(fx.db.users.length, users + 1, "4 새 계정이 하나 생긴다");
    const created = fx.db.users.find((user) => user.kakao_user_key === "kakao_login:8801");
    ok(created && fresh.userId === created.id, `4 세션은 새 계정이다 (${fresh.userId})`);
    eq(parse(settingValue(fx, `consent:${created?.id}`)), { version: REVISION, at: SCENE_AT, via: "kakao", age14: true }, "4 새 카카오 계정의 동의 기록(via kakao)");
    eq(Object.keys(server.links[0] || {}).sort(), ["p_kakao_id", "p_nickname", "p_user_id"], "4 카카오 식별 연결은 회원번호·닉네임만 저장한다(방침 6절과 같다)");

    // 세션이 있던 사람이 시작한 로그인(상태에 동의 없음)으로 온 새 카카오 계정은 만들지 않는다.
    clearEvents();
    const before = fx.db.users.length;
    const noConsent = await kakaoLogin(fx, server, "8802", { start: "/auth/kakao/start", cookie: fx.cookie });
    eq(noConsent.callback.status, 400, "4 동의 없는 상태로 온 새 카카오 계정은 로그인 화면(400)으로 돌려보낸다");
    ok(noConsent.callback.html.includes(`<p class="fieldError" id="kakaoConsentError">${MESSAGE}</p>`), "4 돌려보낸 화면은 카카오 동의 칸 오류를 보인다");
    eq(fx.db.users.length, before, "4 그 계정은 만들지 않는다");
    ok(!fx.db.users.some((user) => user.kakao_user_key === "kakao_login:8802") && !server.links.some((body) => String(body.p_kakao_id) === "8802"), "4 카카오 식별 연결도 하지 않는다");
    ok(noConsent.callback.lines.some((line) => /^kakao_oauth_state=;/.test(line) && /Max-Age=0/.test(line)), "4 로그인 상태 쿠키를 지운다");
    ok(events("kakao_login_consent_missing").some((event) => /^new_account/.test(event.detail)), "4 운영 이벤트(new_account)를 남긴다");

    // 기존 계정은 동의 표시 없이도 들어온다(이번 판은 기존 사용자에게 다시 묻지 않는다). 동의 기록을 새로 쓰지 않는다.
    fx.db.users.push({ id: "user-v22995-old", kakao_user_key: "kakao_login:8803", nickname: "기존 사용자", created_at: "2026-08-01T00:00:00Z" });
    const keys = consentKeys(fx).length;
    const old = await kakaoLogin(fx, server, "8803", { start: "/auth/kakao/start", cookie: fx.cookie });
    ok(old.callback.status === 303 && old.userId === "user-v22995-old", `4 기존 카카오 계정은 동의 표시 없는 상태로도 로그인된다 (${old.callback.status} ${old.userId})`);
    const oldAgain = await kakaoLogin(fx, server, "8803");
    ok(oldAgain.callback.status === 303 && oldAgain.userId === "user-v22995-old", `4 기존 계정이 동의하고 로그인해도 같은 계정이다 (${oldAgain.userId})`);
    eq(consentKeys(fx).length, keys, "4 기존 계정의 로그인은 동의 기록을 새로 쓰지 않는다");

    // 자동 로그인은 동의와 상관없이 새 계정을 만들지 않는다(V22.9.91).
    const auto = await kakaoLogin(fx, server, "8804", { start: "/auth/kakao/start?auto=1", ua: INAPP });
    ok(!fx.db.users.some((user) => user.kakao_user_key === "kakao_login:8804") && auto.userId === "", `4 인앱 자동 로그인은 새 계정을 만들지 않는다 (${auto.callback.status} ${auto.callback.location})`);

    // 동의 기록이 실패해도 카카오 가입은 막지 않는다.
    clearEvents();
    const failRestore = consentWriteFails();
    try {
      const failed = await kakaoLogin(fx, server, "8805");
      const user = fx.db.users.find((item) => item.kakao_user_key === "kakao_login:8805");
      ok(failed.callback.status === 303 && user && failed.userId === user.id, `4 동의 기록이 실패해도 카카오 가입·로그인은 된다 (${failed.callback.status})`);
      ok(!settingValue(fx, `consent:${user?.id}`), "4 실패한 기록은 남지 않는다");
      const warn = events("consent_record_failed");
      ok(warn.length === 1 && warn[0].severity === "warn" && warn[0].path === "/auth/kakao/callback", `4 실패는 consent_record_failed(warn)로 남는다 ${show(warn)}`);
    } finally {
      failRestore();
    }
  } finally {
    server.restore();
  }
}));

// ── 5. 개인정보처리방침·이용약관 ─────────────────────────────────────────────
await section("5 개인정보처리방침·이용약관", () => scene(async (fx) => {
  const privacy = await page(fx, "/privacy", { cookie: "" });
  eq(privacy.status, 200, "5 /privacy 가 열린다");
  const html = privacy.html;
  const titles = [...html.matchAll(/<section class="pubSection" id="section-\d+"><h2>([^<]*)<\/h2>/g)].map((m) => m[1]);
  eq(titles.map((title) => Number(title.split(".")[0])), Array.from({ length: 13 }, (_, i) => i + 1), "5 1~13절 번호가 차례대로다");
  eq(titles.slice(5), ["6. 처리하는 개인정보 항목과 보유기간", "7. 개인정보 보호책임자", "8. 개인정보 처리 위탁과 국외 이전", "9. 만 14세 미만 아동의 개인정보", "10. 개인정보의 파기 절차와 방법", "11. 권익침해 구제 방법", "12. 개인정보처리방침의 변경", "13. 안전성 확보 조치"], "5 6~13절 제목");
  ok(html.includes(`시행일 2026년 7월 13일 · 개정 공고 ${NOTICE_LABEL} · 개정 시행 ${REVISION_LABEL}`), "5 머리에 최초 시행일·개정 공고일·개정 시행일이 있다");
  ok(html.includes(`"dateModified":"${NOTICE}"`) && html.includes(`<time datetime="${NOTICE}">`), "5 수정일(구조화 데이터·화면)이 개정 공고일(화면에 올린 날)이다");
  const tables = [...html.matchAll(/<table class="pubTable"><caption id="[^"]+">([^<]*)<\/caption><thead><tr>([\s\S]*?)<\/tr><\/thead><tbody>([\s\S]*?)<\/tbody><\/table>/g)];
  const table = (caption) => tables.find((m) => m[1] === caption);
  const heads = (m) => [...(m?.[2] || "").matchAll(/<th scope="col">([^<]*)<\/th>/g)].map((x) => x[1]);
  const rowHeads = (m) => [...(m?.[3] || "").matchAll(/<tr><th scope="row">([^<]*)<\/th>/g)].map((x) => x[1]);
  const items = table("처리하는 개인정보 항목, 수집 시점과 보유기간");
  eq(heads(items), ["구분", "처리 항목", "수집 시점", "보유기간"], "5 처리 항목 표의 열(구분·항목·수집 시점·보유기간)");
  eq(rowHeads(items), ["카카오 로그인", "로그인 이름 계정", "카카오톡 챗봇", "가계부 데이터", "거래 변경 이력", "접속·보안 기록", "쿠키"], "5 처리 항목 표의 구분");
  const transfer = table("개인정보 처리 위탁과 국외 이전");
  eq(heads(transfer), ["받는 자(국가)", "맡기는 업무", "이전되는 항목", "이전 시점과 방법", "보유·이용 기간"], "5 위탁·국외 이전 표의 열");
  eq(rowHeads(transfer), ["Cloudflare, Inc.(미국)", "Supabase, Inc.(미국 법인)", "주식회사 카카오(대한민국)", "네이버 주식회사(대한민국)"], "5 위탁·국외 이전 표의 받는 자(E-19: 문의 메일함 네이버 포함)");
  const body = text(html);
  for (const [label, words] of [
    ["카카오 로그인 저장 항목", "카카오 회원번호와 닉네임만 저장하며 프로필 사진·이메일·전화번호는 저장하지 않습니다"],
    ["보호책임자", "성명 백인남(대표), 이메일 admin@malhaebook.com"],
    ["답변 기한", "요구를 받은 날부터 10일 안에 결과를 알립니다"],
    ["거부 방법", "국외 이전을 원하지 않으면 가입하지 않거나 7절의 이메일로 개인정보 삭제를 요청할 수 있습니다"],
    ["데이터센터 리전(E-19, 운영 DB 호스트 주소 → AWS ap-southeast-2)", "호주 시드니 리전(AWS ap-southeast-2)의 데이터센터"],
    ["받는 자 연락처: Cloudflare(E-19)", "privacyquestions@cloudflare.com"],
    ["받는 자 연락처: Supabase(E-19)", "privacy@supabase.com"],
    ["메일 전달 위탁(E-19)", "문의 메일(admin@malhaebook.com) 전달(Email Routing)"],
    ["메일함 위탁(E-19)", "문의 메일(admin@malhaebook.com) 수신함 제공"],
    ["만 14세 미만", "만 14세 미만 아동은 가입하거나 서비스를 이용할 수 없습니다"],
    ["만 14세 미만 삭제", "만 14세 미만 아동의 계정이나 개인정보임을 알게 되면 지체 없이 삭제합니다"],
    ["감사 기록 파기", "180일이 지나면 자동으로 삭제합니다"],
    ["개인정보침해신고센터", "privacy.kisa.or.kr, 국번 없이 118"],
    ["개인정보분쟁조정위원회", "www.kopico.go.kr, 1833-6972"],
    ["대검찰청", "대검찰청 사이버수사과: www.spo.go.kr, 국번 없이 1301"],
    ["경찰청", "경찰청 사이버수사국: ecrm.police.go.kr, 국번 없이 182"],
    ["변경 고지 7일", "시행 7일 전부터 서비스 화면에 알립니다"],
    ["중요한 변경 30일", "이용자 권리에 중요한 변경은 시행 30일 전부터 알립니다"],
    ["시행 문장(E-17)", `이 개정 방침은 ${NOTICE_LABEL}에 알리고 ${REVISION_LABEL}부터 시행합니다`],
    ["3절 문의 경로", "문의 경로는 7절의 개인정보 보호책임자 이메일(admin@malhaebook.com)입니다"],
    ["3절 탈퇴 기능 없음(V22.9.94 R-7 문장)", "계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로 확인합니다"],
  ]) ok(body.includes(words), `5 /privacy ${label}: ‘${words}’`);
  ok(html.includes(`href="mailto:${EMAIL}"`), "5 보호책임자에게 이메일 보내기 링크(mailto)가 있다");
  ok(!PHONE.test(body), "5 방침에 휴대전화 번호가 없다(사업자 전화번호는 공개하지 않는다)");
  const sixth = html.slice(html.indexOf('id="section-6"'), html.indexOf('id="section-7"'));
  const names = [...new Set(text(sixth).match(/\b(?:ab|kakao)_[a-z_]+/g) || [])].sort();
  eq(names, ["ab_account_link", "ab_account_link_later", "ab_account_link_pause", "ab_admin", "ab_credential_reauth", "ab_hh", "ab_household_delete_reauth", "ab_kakao_auto", "ab_user", "kakao_oauth_link_user", "kakao_oauth_reauth_household", "kakao_oauth_return_to", "kakao_oauth_state"], "5 6절 쿠키 목록");
  const sources = moduleSources();
  const code = sources.filter((item) => item.name !== "content-pages.js").map((item) => item.source);
  eq(names.filter((name) => !code.some((source) => source.includes(`"${name}"`) || source.includes(`${name}=`))), [], "5 방침에 적은 쿠키 이름은 모두 코드가 실제로 쓰는 이름이다(방침 글 밖의 코드)");

  const terms = await page(fx, "/terms", { cookie: "" });
  ok(terms.status === 200 && terms.html.includes(`시행일 2026년 7월 13일 · 개정 공고 ${NOTICE_LABEL} · 개정 시행 ${REVISION_LABEL}`) && terms.html.includes(`"dateModified":"${NOTICE}"`), "5 /terms 머리가 공고·시행일이고 수정일이 공고일이다");
  const second = text(terms.html.slice(terms.html.indexOf('id="section-2"'), terms.html.indexOf('id="section-3"')));
  ok(second.includes("말해가계부는 만 14세 이상만 이용할 수 있습니다") && second.includes("이용약관과 개인정보처리방침에 동의하고 만 14세 이상임을 확인하는 절차를 거칩니다"), "5 이용약관 2절에 만 14세 이상과 동의 절차가 있다");
  const pagesSource = read("../src/modules/public/content-pages.js");
  ok(!pagesSource.includes(REVISION) && !pagesSource.includes(REVISION_LABEL) && pagesSource.includes("policyDateLabel(POLICY_REVISION_DATE)"), "5 방침·약관은 개정일을 상수(POLICY_REVISION_DATE)로만 쓴다");
  ok(!pagesSource.includes(NOTICE) && !pagesSource.includes(NOTICE_LABEL) && pagesSource.includes("policyDateLabel(POLICY_NOTICE_DATE)"), "5 방침·약관은 공고일을 상수(POLICY_NOTICE_DATE)로만 쓴다");
  eq(sources.map((item) => item.source).join("\n").match(/const POLICY_REVISION_DATE = /g)?.length || 0, 1, "5 개정일 상수는 한 곳뿐이다");
  eq(sources.map((item) => item.source).join("\n").match(/const POLICY_NOTICE_DATE = /g)?.length || 0, 1, "5 공고일 상수는 한 곳뿐이다");
}));

// ── 6. 꼬리말·메뉴·카카오 답 ─────────────────────────────────────────────────
await section("6 꼬리말·메뉴·카카오 답", () => scene(async (fx) => {
  for (const path of ["/privacy", "/"]) {
    const view = await page(fx, path, { cookie: "" });
    const footer = view.html.match(/<footer class="abBusinessFooter"[\s\S]*?<\/footer>/)?.[0] || "";
    ok(footer.includes("<b>대표</b>백인남") && footer.includes(`<b>문의</b><a href="mailto:${EMAIL}">${EMAIL}</a>`), `6 ${path} 사업자 꼬리말에 대표와 문의 이메일(mailto)이 있다`);
    ok(footer && !PHONE.test(text(footer)) && !/전화|tel:/.test(footer), `6 ${path} 꼬리말에 전화번호가 없다`);
  }
  const info = siteConfig.match(/const BUSINESS_FOOTER_INFO = Object\.freeze\(\{([\s\S]*?)\}\);/)?.[1] || "";
  ok(info.includes('representative: "백인남"') && info.includes(`email: "${EMAIL}"`) && !/phone|tel|전화/i.test(info), "6 BUSINESS_FOOTER_INFO 에 대표자·이메일이 있고 전화번호 칸은 없다");
  const menu = await page(fx, "/menu");
  ok(menu.status === 200 && /<a class="menuRow" href="\/terms"><span class="menuRowIcon"[^>]*><\/span><span class="menuRowTitle">이용약관<\/span>/.test(menu.html) && /<a class="menuRow" href="\/privacy"><span class="menuRowIcon"[^>]*><\/span><span class="menuRowTitle">개인정보처리방침<\/span>/.test(menu.html), `6 /menu ‘도움말과 안내’에 이용약관·개인정보처리방침 링크가 있다 (${menu.status})`);
  const reply = await skill(fx, "개인정보");
  ok(reply.includes("계정 탈퇴 기능은 아직 없습니다") && reply.includes("개인정보처리방침에 적힌 문의 경로로 요청해 주세요"), `6 카카오 ‘개인정보’ 답의 탈퇴 안내가 방침의 문의 경로를 가리킨다: ${reply.slice(0, 120)}`);
  ok(!/https?:\/\//.test(reply), "6 카카오 답 글에 주소를 넣지 않는다(Y-7, 링크는 버튼)");
}));

// ── 7. 공개 첫 화면의 카카오 띠 ──────────────────────────────────────────────
await section("7 공개 첫 화면 띠", () => scene(async (fx) => {
  const view = await page(fx, "/", { cookie: "" });
  const band = view.html.match(/<section class="pubBand"[\s\S]*?<\/section>/)?.[0] || "";
  ok(band.includes('<form class="kakaoStart" method="get" action="/auth/kakao/start"><label class="consentRow"><input id="kakaoConsent" name="consent" type="checkbox" value="1" required/>'), "7 공개 첫 화면 카카오 띠도 동의 칸이 있는 폼이다");
  const css = styles(view.html);
  ok(css.includes("button.kakaoBtn{width:100%;border:0;font:inherit;") && /\.consentRow\{display:flex;align-items:flex-start;[^}]*text-align:left/.test(css) && css.includes(".consentRow span{min-width:0}"), "7 띠의 동의 칸은 가운데 정렬 띠 안에서 왼쪽 정렬·줄바꿈이고 단추는 폭을 채운다");
}));
await section("7 공개 첫 화면 띠(카카오 꺼짐)", () => scene(async (fx) => {
  const band = (await page(fx, "/", { cookie: "" })).html.match(/<section class="pubBand"[\s\S]*?<\/section>/)?.[0] || "";
  ok(band.includes('<a class="pubBtn" href="/my">') && !band.includes('name="consent"'), "7 카카오 로그인이 꺼진 서버의 띠는 /my 로 가는 단추이고 동의 칸이 없다(동의는 가입 폼에서)");
}, { kakao: false }));

// ── 8. 로그인 대기 화면 스크립트 ─────────────────────────────────────────────
await section("8 대기 화면 스크립트", () => scene(async (fx) => {
  const view = await page(fx, "/my", { cookie: "" });
  const source = view.html.match(/<script id="kakaoLoginProgressRuntime">([\s\S]*?)<\/script>/)?.[1] || "";
  ok(source.includes('form.kakaoStart[action="/auth/kakao/start"]') && !source.includes("a.kakaoBtn"), "8 대기 화면 스크립트는 카카오 폼을 찾는다(예전 링크 선택자 없음)");
  const run = progressSandbox(source);
  run.fire("button:click", { button: 0 });
  ok(run.nodes.kakaoLoginProgress.hidden === true, "8 단추를 눌러도 폼이 제출되지 않으면(동의 칸 비움) 대기 화면을 띄우지 않는다");
  run.fire("form:submit", { defaultPrevented: false });
  ok(run.nodes.kakaoLoginProgress.hidden === false && run.attrs.get("aria-busy") === "true" && run.classes.has("kakaoProgressOpen") && run.nodes.kakaoProgressTip.textContent.length > 0, "8 폼이 제출되면 대기 화면과 팁을 띄운다");
  run.fire("cancel:click");
  ok(run.nodes.kakaoLoginProgress.hidden === true && !run.attrs.has("aria-busy") && !run.classes.has("kakaoProgressOpen"), "8 취소하면 대기 화면을 거둔다");
  run.fire("button:click", { button: 0, ctrlKey: true });
  run.fire("form:submit", {});
  ok(run.nodes.kakaoLoginProgress.hidden === true, "8 보조키로 누른 제출(새 탭)에는 대기 화면을 덮지 않는다");
  run.fire("button:click", { button: 0 });
  run.fire("form:submit", { defaultPrevented: true });
  ok(run.nodes.kakaoLoginProgress.hidden === true, "8 다른 스크립트가 막은 제출에는 띄우지 않는다");
  let threw = "";
  try { progressSandbox(source, { withForm: false }); } catch (error) { threw = String(error); }
  eq(threw, "", "8 카카오 폼이 없는 화면에서도 오류 없이 끝난다");
}));

if (failures.length) {
  for (const line of failures) console.error(`실패: ${line}`);
  console.error(`V22.9.95 법무 검사 checks ${checks} failed ${failures.length}`);
  process.exit(1);
}
console.log(`V22.9.95 법무 검사 통과 (${checks} checks)`);
