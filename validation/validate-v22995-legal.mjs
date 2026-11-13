#!/usr/bin/env node
// V22.9.95 법무 검사(R-9) — 약관·개인정보처리방침 동의와 만 14세 확인, 개인정보처리방침 보강, 이용약관, 사업자 표시.
//   1 로그인 화면: 가입 폼에만 동의 칸(필수·미리 체크 없음·두 링크 새 탭), 카카오 로그인 폼은 단추 아래 ‘계속하면 이용약관에 동의한 것으로 봅니다’ 한 줄(V22.9.114),
//     화면 끝 이용약관·개인정보처리방침 줄,
//     좁은 폭(360px)·다크 모드에서 칸 글이 잘리지 않는 CSS.
//   2 로컬 가입: 동의가 없으면 400(맨 위 요약 + 칸 아래 문구)이고 계정·가입 RPC·시도 기록이 없으며 입력값을 되살린다. 동의하면 303 이고
//     설정 표에 consent:<user_id> 를 upsert 한다. 기록이 실패해도 가입은 되고 consent_record_failed(warn) 가 남는다.
//   3 카카오 시작: 보통 로그인은 동의 칸 없이 바로 카카오 인가로 간다(V22.9.114; 옛 consent 값은 읽지 않고 서명된 상태에도 없다).
//     인앱 자동 로그인(auto=1)·연결(link)·본인 확인(reauth)·로그인 세션이 있는 사람은 예전처럼 카카오로 간다.
//   4 카카오 콜백: 화면 있는 로그인은 새 계정을 만들고 consent:<id>(via kakao, 안내 확인 기록)를 남긴다(V22.9.114). 기록이 없던 기존 계정도 화면 있는
//     로그인이면 한 번 남긴다(이미 있으면 다시 쓰지 않음). 화면 없는 자동 로그인(auto=1)은 계정을 만들지도 기록을 남기지도 않는다.
//   5 /privacy 1~13절(표 2개·보호책임자·위탁과 국외 이전·만 14세·파기·구제기관·변경 고지), 적은 쿠키 이름이 코드에 있는지, /terms 2절, 개정일 상수.
//   6 공개 꼬리말의 대표·문의 이메일(전화번호 없음), /menu 의 이용약관·개인정보처리방침, 카카오 ‘개인정보’ 답이 방침의 문의 경로를 가리킨다.
//   7 공개 첫 화면의 카카오 띠도 같은 폼 + 안내 한 줄이다. 8 로그인 대기 화면 스크립트는 폼 제출에만 뜬다(제출이 막히면 뜨지 않는다).
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
// E-17: 공고일(화면에 올린 날)과 시행일. V22.9.95 는 공고일 + 7일, V22.9.96(재결정) 은 공고일 = 시행일(불리하지 않은 변경은 알린 날부터). 둘 중 하나여야 한다.
const NOTICE = siteConfig.match(/const POLICY_NOTICE_DATE = "(\d{4}-\d{2}-\d{2})";/)?.[1] || "";
const [NY, NM, ND] = NOTICE.split("-").map(Number);
const NOTICE_LABEL = `${NY}년 ${NM}월 ${ND}일`;
const SCENE_AT = new Date(Date.parse(`${REVISION}T12:00:00+09:00`)).toISOString();
// V22.9.104 L-2: 동의 칸은 ‘[필수] 이용약관 동의 + 개인정보처리방침 확인’ 으로 바꿨다(오류 문구도 같은 말). 서버는 여전히 consent=1 을 받아야 진행한다.
// V22.9.104 L-2(커밋 B): 동의 칸·오류 문구에서 만 14세 확인을 뺐다(처리방침 9절: 만 14세 미만도 쓸 수 있다).
const MESSAGE = "이용약관 동의와 개인정보처리방침 확인이 필요해요";
const LABEL = "[필수] 이용약관에 동의하고 개인정보처리방침을 확인했어요";
// V22.9.114: 카카오 로그인 폼은 동의 칸 대신 단추 아래 이 한 줄이다(site-config termsNoticeLineHtml).
const NOTE = '<p class="termsNote">계속하면 <a href="/terms" target="_blank">이용약관</a>에 동의한 것으로 봅니다 · <a href="/privacy" target="_blank">개인정보처리방침</a></p>';
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
async function kakaoLogin(fx, server, kakaoId, { start = "/auth/kakao/start", ua = CHROME, cookie = "" } = {}) {
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
ok(/^\d{4}-\d{2}-\d{2}$/.test(NOTICE) && [0, 7 * 86400000].includes(Date.parse(`${REVISION}T00:00:00Z`) - Date.parse(`${NOTICE}T00:00:00Z`)), `0 공고일 상수 POLICY_NOTICE_DATE 가 날짜이고 시행일이 공고일과 같거나(V22.9.96 E-17 재결정) 공고일 + 7일이다 (${NOTICE} → ${REVISION})`);

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
  ok(!kakaoForm.includes('name="consent"') && !kakaoForm.includes("consentRow") && !kakaoForm.includes("kakaoConsent"), "1 카카오 로그인 폼에 동의 칸이 없다(V22.9.114)");
  ok(kakaoForm.startsWith('<button class="kakaoBtn" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true">') && html.includes(`</svg>카카오 로그인</button></form>${NOTE}`), "1 카카오 단추 바로 아래 ‘계속하면 이용약관에 동의한 것으로 봅니다’ 한 줄(두 링크 새 탭)");
  ok(!kakaoForm.includes('name="return_to"'), "1 돌아갈 곳이 없으면 숨은 return_to 칸도 없다");
  eq((html.match(/class="kakaoBtn"/g) || []).length, 1, "1 카카오 단추는 하나다");
  eq((html.match(/name="consent"/g) || []).length, 1, "1 동의 칸은 가입 폼에만 하나다(V22.9.114)");
  eq((html.match(/class="termsNote"/g) || []).length, 1, "1 안내 한 줄은 카카오 폼 아래 하나다");
  ok(!/name="consent"[^>]*\bchecked\b/.test(html), "1 가입 동의 칸은 미리 체크하지 않는다");
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
  ok(css.includes(".termsNote{margin:8px 0 0;color:#5f6b7a;font-size:12.5px;line-height:1.5;text-align:center;overflow-wrap:anywhere}.termsNote a{font-weight:700;text-decoration:underline}"), "1 안내 한 줄 CSS: 12.5px·가운데·줄바꿈·링크 밑줄(V22.9.114)");
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
    ok(/<a class="authErrorSummary" href="#signupConsent" role="alert"[^>]*>[\s\S]*?이용약관 동의와 개인정보처리방침 확인이 필요해요/.test(missing.text), "2 맨 위 오류 요약이 동의 문구를 말하고 동의 칸을 가리킨다");
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
    eq(parse(settingValue(fx, `consent:${created?.id}`)), { version: REVISION, at: SCENE_AT, via: "local" }, "2 설정 표 consent:<user_id> 에 동의 기록(개정일·시각·local)이 있다");
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
  // V22.9.114: 동의 칸이 없어 보통 로그인도 바로 카카오 인가로 간다. 주소에 consent 가 붙어 와도 읽지 않는다.
  const plain = await go(fx, "/auth/kakao/start");
  eq(plain.status, 303, "3 동의 칸 없이 시작한 보통 로그인은 바로 카카오 인가로 간다(V22.9.114, 400 아님)");
  const plainUrl = new URL(plain.location || `${BASE}/`);
  eq(plainUrl.origin + plainUrl.pathname, "https://kauth.kakao.com/oauth/authorize", "3 카카오 인가 주소");
  ok(!plainUrl.searchParams.has("prompt") && !plainUrl.searchParams.has("scope"), "3 보통 로그인은 prompt 가 없고 동의 항목(scope)을 더 받지 않는다");
  ok(!plain.html.includes(MESSAGE) && !events("kakao_login_consent_missing").length, "3 동의 오류 화면·kakao_login_consent_missing 이벤트가 없다");
  const plainState = await stateOf(fx, plain.location);
  ok(plainState?.mode === "login" && plainState.consent === undefined && plainState.next === undefined && plainState.auto === undefined, `3 서명된 상태에 동의 표시가 없다(mode login) ${show(plainState)}`);
  ok(plain.lines.some((line) => line.startsWith("kakao_oauth_state=") && /Max-Age=600/.test(line)), "3 로그인 상태 쿠키는 10분(600초)이다(방침의 쿠키 목록과 같다)");
  const kept = await go(fx, "/auth/kakao/start?return_to=%2Fmy%2Fanalysis");
  const keptState = await stateOf(fx, kept.location);
  ok(kept.status === 303 && keptState?.next === "/my/analysis", `3 돌아갈 곳은 서명된 상태(next)에 실린다 ${show(keptState)}`);
  const evil = await go(fx, "/auth/kakao/start?return_to=https%3A%2F%2Fevil.example%2F");
  ok(evil.status === 303 && (await stateOf(fx, evil.location))?.next === undefined, "3 바깥 주소는 돌아갈 곳으로 싣지 않는다");
  for (const legacy of ["/auth/kakao/start?consent=1&return_to=%2Fmy%2Fanalysis", "/auth/kakao/start?consent=yes"]) {
    const response = await go(fx, legacy);
    const state = await stateOf(fx, response.location);
    ok(response.status === 303 && state?.mode === "login" && state.consent === undefined, `3 옛 consent 값이 붙어 와도 읽지 않는다(${legacy.split("?")[1]}) ${show(state)}`);
  }

  const auto = await go(fx, "/auth/kakao/start?auto=1", { ua: INAPP });
  ok(auto.status === 303 && auto.location.startsWith("https://kauth.kakao.com/oauth/authorize") && new URL(auto.location).searchParams.get("prompt") === "none", `3 인앱 자동 로그인(auto=1)은 예전처럼 prompt=none 으로 간다 (${auto.status})`);
  const autoState = await stateOf(fx, auto.location);
  ok(autoState?.auto === 1 && autoState.consent === undefined, `3 자동 로그인 상태에는 auto 표시만 있다(새 계정을 만들지 않는 길) ${show(autoState)}`);
  const outsideAuto = await go(fx, "/auth/kakao/start?auto=1");
  ok(outsideAuto.status === 303 && new URL(outsideAuto.location).searchParams.get("prompt") !== "none" && (await stateOf(fx, outsideAuto.location))?.auto === undefined, "3 인앱이 아닌 브라우저의 auto=1 은 보통 로그인(화면 있음)으로 간다");
  const link = await go(fx, "/auth/kakao/start?link=1", { cookie: fx.cookie });
  // 연결은 로그인과 다른 흐름이다(이 픽스처 사용자는 먼저 본인 확인으로 간다).
  ok(link.status === 303 && link.location && !link.html.includes(MESSAGE) && !link.location.startsWith("/auth/kakao/start"), `3 로그인한 사람의 카카오 연결(link=1)은 예전 연결 흐름으로 간다 (${link.status} ${link.location.slice(0, 60)})`);
  const reauth = await go(fx, "/auth/kakao/start?reauth=credential-change", { cookie: fx.cookie });
  ok(reauth.status === 303 && reauth.location.startsWith("https://kauth.kakao.com/oauth/authorize") && !reauth.html.includes(MESSAGE), `3 본인 확인(reauth)은 예전처럼 간다 (${reauth.status})`);
  const signedIn = await go(fx, "/auth/kakao/start", { cookie: fx.cookie });
  const signedState = await stateOf(fx, signedIn.location);
  ok(signedIn.status === 303 && signedState?.mode === "login" && signedState.consent === undefined, `3 로그인 세션이 있는 사람도 같은 보통 로그인이다 ${show(signedState)}`);
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
    eq(parse(settingValue(fx, `consent:${created?.id}`)), { version: REVISION, at: SCENE_AT, via: "kakao" }, "4 새 카카오 계정의 동의 기록(via kakao)");
    eq(Object.keys(server.links[0] || {}).sort(), ["p_kakao_id", "p_nickname", "p_user_id"], "4 카카오 식별 연결은 회원번호·닉네임만 저장한다(방침 6절과 같다)");

    // V22.9.114: 상태에 동의 표시가 없어도(이제 동의 칸이 없다) 화면 있는 로그인이면 새 계정을 만들고 기록(via kakao)을 남긴다. 세션이 있던 사람이 시작해도 같다.
    clearEvents();
    const before = fx.db.users.length;
    const second = await kakaoLogin(fx, server, "8802", { start: "/auth/kakao/start", cookie: fx.cookie });
    eq(second.callback.status, 303, "4 동의 표시 없는 상태로 온 새 카카오 계정도 만들고 로그인한다(V22.9.114)");
    const secondUser = fx.db.users.find((user) => user.kakao_user_key === "kakao_login:8802");
    ok(fx.db.users.length === before + 1 && secondUser && second.userId === secondUser.id, `4 그 계정이 생기고 세션이 붙는다 (${second.userId})`);
    eq(parse(settingValue(fx, `consent:${secondUser?.id}`)), { version: REVISION, at: SCENE_AT, via: "kakao" }, "4 안내 확인 기록(via kakao)을 남긴다");
    ok(server.links.some((body) => String(body.p_kakao_id) === "8802"), "4 카카오 식별 연결도 한다");
    ok(!events("kakao_login_consent_missing").length && !second.callback.html.includes(MESSAGE) && !second.callback.html.includes("kakaoConsentError"), "4 동의 오류 화면·kakao_login_consent_missing 이벤트가 없다");

    // 기존 계정(V22.9.95 전 계정 등, 기록 없음): 화면 있는 로그인이면 한 번 기록한다(V22.9.104 L-4 → V22.9.114 는 체크 조건 없이). 이미 있으면 다시 쓰지 않는다.
    fx.db.users.push({ id: "user-v22995-old", kakao_user_key: "kakao_login:8803", nickname: "기존 사용자", created_at: "2026-08-01T00:00:00Z" });
    const keys = consentKeys(fx).length;
    const old = await kakaoLogin(fx, server, "8803", { start: "/auth/kakao/start", cookie: fx.cookie });
    ok(old.callback.status === 303 && old.userId === "user-v22995-old", `4 기존 카카오 계정은 같은 계정으로 로그인된다 (${old.callback.status} ${old.userId})`);
    eq(consentKeys(fx).length, keys + 1, "4 기록이 없던 기존 계정이 화면 있는 로그인을 하면 그 안내 확인을 기록한다(V22.9.104 L-4 → V22.9.114)");
    const oldRecord = parse(settingValue(fx, "consent:user-v22995-old"));
    eq(oldRecord, { version: REVISION, at: SCENE_AT, via: "kakao" }, "4 그 기록은 via kakao 다(age14 없음)");
    const earlier = JSON.stringify({ ...oldRecord, at: "2026-11-02T03:00:00.000Z" });
    const oldRow = fx.db.accountbook_settings.find((row) => row.key === "consent:user-v22995-old");
    if (oldRow) oldRow.value = earlier;
    const oldAgain = await kakaoLogin(fx, server, "8803");
    ok(oldAgain.callback.status === 303 && oldAgain.userId === "user-v22995-old" && consentKeys(fx).length === keys + 1 && settingValue(fx, "consent:user-v22995-old") === earlier, "4 기록이 있으면 다시 로그인해도 다시 쓰지 않는다(처음 기록의 시각 그대로)");

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
  // V22.9.121: 후원 확인 때 받는 정보(회원 번호·보낸 분 이름·보낸 날짜)와 후원자 표시·공개 명단 이름 줄 ‘후원(원하는 분만)’ 을 더했다.
  // V22.9.121 독립 검토 1차 P2: 회원 번호(내 계정·보안에 보이고, 번호로 계정을 찾는 기억이 남는다)는 후원자만의 일이 아니라 따로 한 줄.
  eq(rowHeads(items), ["카카오 로그인", "로그인 이름 계정", "회원 번호", "카카오톡 챗봇", "가계부 데이터", "거래 변경 이력", "후원(원하는 분만)", "접속·보안 기록", "쿠키"], "5 처리 항목 표의 구분");
  const transfer = table("개인정보 처리 위탁과 국외 이전");
  eq(heads(transfer), ["받는 자(국가)", "맡기는 업무", "이전되는 항목", "이전 시점과 방법", "보유·이용 기간"], "5 위탁·국외 이전 표의 열");
  eq(rowHeads(transfer), ["Cloudflare, Inc.(미국)", "Supabase, Inc.(미국 법인)", "주식회사 카카오(대한민국)", "네이버 주식회사(대한민국)"], "5 위탁·국외 이전 표의 받는 자(E-19: 문의 메일함 네이버 포함)");
  const body = text(html);
  for (const [label, words] of [
    ["카카오 로그인 저장 항목", "카카오 회원번호와 닉네임만 저장하며 프로필 사진·이메일·전화번호는 저장하지 않습니다"],
    ["보호책임자", "성명 백인남(대표), 이메일 admin@malhaebook.com"],
    ["답변 기한", "요구를 받은 날부터 10일 안에 결과를 알립니다"],
    ["거부 방법", "국외 이전을 원하지 않으면 가입하지 않거나 7절의 이메일로 개인정보 삭제를 요청할 수 있습니다"],
    ["데이터센터 리전(E-19 → 2026-11-05 서울 전환: 운영 DB = Supabase 서울 프로젝트, AWS ap-northeast-2; V22.9.103)", "대한민국 서울 리전(AWS ap-northeast-2)의 데이터센터"],
    ["받는 자 연락처: Cloudflare(E-19)", "privacyquestions@cloudflare.com"],
    ["받는 자 연락처: Supabase(E-19)", "privacy@supabase.com"],
    ["메일 전달 위탁(E-19)", "문의 메일(admin@malhaebook.com) 전달(Email Routing)"],
    ["메일함 위탁(E-19)", "문의 메일(admin@malhaebook.com) 수신함 제공"],
    // V22.9.104 L-2(커밋 B): 9절 = 만 14세 미만도 이용, 계약 이행 근거, 동의 근거 처리 없음, 쉬운 말, 법정대리인 요청 창구.
    ["만 14세 미만 이용", "만 14세 미만 아동도 말해가계부를 쓸 수 있습니다"],
    ["계약 이행 근거", "서비스 이용 계약을 지키는 데 필요한 처리(개인정보 보호법 제15조제1항제4호)라서 따로 동의를 받지 않습니다"],
    ["동의 근거 처리 없음", "그런 처리가 필요하면 그 처리에서만 나이를 확인하고 법정대리인(부모 등 보호자)의 동의를 받습니다"],
    ["쉬운 말", "알기 쉬운 말로 씁니다(개인정보 보호법 제22조의2제3항)"],
    ["법정대리인 요청", "7절의 개인정보 보호책임자 이메일로 요청하면 법정대리인인지 확인한 뒤 지체 없이 처리합니다"],
    ["감사 기록 파기", "180일이 지나면 자동으로 삭제합니다"],
    ["개인정보침해신고센터", "privacy.kisa.or.kr, 국번 없이 118"],
    ["개인정보분쟁조정위원회", "www.kopico.go.kr, 1833-6972"],
    ["대검찰청", "대검찰청 사이버수사과: www.spo.go.kr, 국번 없이 1301"],
    ["경찰청", "경찰청 사이버수사국: ecrm.police.go.kr, 국번 없이 182"],
    ["변경 고지 7일", "시행 7일 전부터 서비스 화면에 알립니다"],
    ["중요한 변경 30일", "이용자 권리에 중요한 변경은 시행 30일 전부터 알립니다"],
    ["시행 문장(E-17)", NOTICE === REVISION ? `이 개정 방침은 ${NOTICE_LABEL}에 알리고 같은 날부터 시행합니다` : `이 개정 방침은 ${NOTICE_LABEL}에 알리고 ${REVISION_LABEL}부터 시행합니다`],
    ["불리하지 않은 변경(V22.9.96)", "이용자에게 불리하지 않은 변경은 알린 날부터 적용할 수 있습니다"],
    // V22.9.118: 12절의 ‘이번 개정’ 한 줄을 최신 개정(1절 단톡방 연결키·챗봇 첫 답 약관 안내 — 실제로 안내가 붙는 답만) 내용으로 바꿨다.
    // 단톡방 빈 멘션 인사에는 이용약관 안내만 있다(조정자 결정 2026-11-12) — ‘(인사에는 이용약관 안내만)’.
    // V22.9.118 재검토 P3: 늘 두는 곳(단톡방 설명서 첫 화면·인사)과 처음 쓸 때의 답(늦은 답 등 일부에는 없다)을 나눈 문장으로 기대값 갱신.
    ...(NOTICE === REVISION ? [["이번 개정 성격(V22.9.118)", "이번 개정은 단톡방에서 기록뿐 아니라 조회나 설명서 보기로 봇을 불러도 그 방의 공동 가계부를 준비하는 지금의 동작에 맞춰 1절의 단톡방 연결키 설명을 고치고, 이용약관·개인정보처리방침 안내를 단톡방의 설명서 첫 화면과 봇만 불렀을 때의 인사(인사에는 이용약관 안내만)에 늘 두고 카카오톡 챗봇을 처음 쓸 때의 답(1:1 첫 기록으로 개인 가계부를 준비하는 답, 단톡방 가계부를 준비하거나 그 가계부에 들어가는 답)에도 붙인 것이어서, 처리하는 개인정보 항목과 목적이 그대로인 이용자에게 불리하지 않은 변경입니다. 다만 처음 쓸 때의 답이 늦어지는 등 일부 답에는 안내가 붙지 않을 수 있습니다"]] : []),
    ["6절 쿠키 ab_cs(V22.9.104 L-6 → V22.9.114 띠)", "ab_cs: 이용약관 안내 확인 기록을 읽은 결과(가계부 홈의 안내 띠를 띄울지), 14일"],
    ["6절 쿠키 ab_bk·ab_setup(V22.9.104 L-6)", "ab_bk·ab_setup: 가계부 기본 설정 안내 띠를 띄울지(로그인 비밀번호 설정 여부·가계부 설정 확인 결과), 14일·1시간"],
    ["6절 쿠키 ab_notice_hide(V22.9.104 L-6)", "ab_notice_hide: 공지 띠 ‘오늘 하루 안 보기’, 24시간"],
    // V22.9.121: 후원 줄·ab_sp 쿠키·12절 이번 개정 성격 한 문단(V22.9.118 문단은 그대로).
    ["6절 후원 줄(V22.9.121)", "후원자 표시 기간, 확인 메모(보낸 분 이름·보낸 날짜처럼 후원 확인에 쓴 내용), 공개 명단에 올릴 이름(원하는 분만)"],
    ["6절 후원 줄 수집 시점(V22.9.121)", "후원 사실을 메일이나 오픈채팅으로 알려 주실 때(보낸 분 이름·보낸 날짜·회원 번호로 확인하고, 후원자 표시와 공개 명단에만 씁니다)"],
    ["6절 회원 번호 줄(V22.9.121)", "회원 번호(MB- 로 시작, 계정마다 이미 있는 내부 식별값으로 만든 번호)와 그 번호가 가리키는 계정"],
    ["6절 회원 번호 줄 수집 시점(V22.9.121)", "‘내 계정·보안’ 화면을 열 때(운영자가 후원 확인이나 문의 때 번호로 계정을 찾는 데만 씁니다)"],
    ["6절 후원 줄 보유기간(V22.9.121)", "후원자 표시를 지울 때까지(요청하면 바로 지움). 알려 주신 메일은 8절의 문의 메일 기준을 따릅니다."],
    ["6절 쿠키 ab_sp(V22.9.121)", "ab_sp: 후원자가 고른 포인트 색을 웹 가계부의 다른 화면에도 보이게 하는 표시(값 1, 개인정보 없음), 1일"],
    ...(NOTICE === REVISION ? [["12절 이번 개정 성격(V22.9.121, V22.9.118 과 같은 문단)", "같은 날 개정에는 후원 확인 방법도 들어 있습니다. 후원을 확인할 때 로그인 이름 대신 ‘내 계정·보안’ 에 보이는 회원 번호를 받도록 하면서 회원 번호와 그 번호가 가리키는 계정을 6절 표에 더하고, 후원 확인 때 받는 정보와 보관 기간을 6절 표에 적고, 후원자 포인트 색 쿠키(ab_sp)를 쿠키 목록에 더했습니다. 회원 번호는 계정마다 이미 있는 내부 식별값으로 만든 번호이고 이용자에게서 새로 받는 정보가 없으며 쓰는 곳도 후원 확인과 문의뿐이어서, 이것도 이용자에게 불리하지 않은 변경입니다."]] : []),
    ["3절 문의 경로", "문의 경로는 7절의 개인정보 보호책임자 이메일(admin@malhaebook.com)입니다"],
    ["3절 탈퇴 기능 없음(V22.9.94 R-7 문장)", "계정 자체를 탈퇴·삭제하는 온라인 기능은 제공하지 않으며 개인정보 삭제 요청은 서비스 문의 경로로 확인합니다"],
  ]) ok(body.includes(words), `5 /privacy ${label}: ‘${words}’`);
  ok(html.includes(`href="mailto:${EMAIL}"`), "5 보호책임자에게 이메일 보내기 링크(mailto)가 있다");
  ok(!PHONE.test(body), "5 방침에 휴대전화 번호가 없다(사업자 전화번호는 공개하지 않는다)");
  const sixth = html.slice(html.indexOf('id="section-6"'), html.indexOf('id="section-7"'));
  const names = [...new Set(text(sixth).match(/\b(?:ab|kakao)_[a-z_]+/g) || [])].sort();
  // V22.9.121: 후원자 포인트 색 쿠키 ab_sp 를 목록에 더했다(쓰는 코드는 같은 판의 후원자 표시 작업 — 아래 ‘코드가 실제로 쓰는 이름’ 검사가 함께 본다).
  eq(names, ["ab_account_link", "ab_account_link_later", "ab_account_link_pause", "ab_admin", "ab_bk", "ab_credential_reauth", "ab_cs", "ab_hh", "ab_household_delete_reauth", "ab_kakao_auto", "ab_notice_hide", "ab_setup", "ab_sp", "ab_user", "kakao_oauth_link_user", "kakao_oauth_reauth_household", "kakao_oauth_return_to", "kakao_oauth_state"], "5 6절 쿠키 목록");
  const sources = moduleSources();
  const code = sources.filter((item) => item.name !== "content-pages.js").map((item) => item.source);
  eq(names.filter((name) => !code.some((source) => source.includes(`"${name}"`) || source.includes(`${name}=`))), [], "5 방침에 적은 쿠키 이름은 모두 코드가 실제로 쓰는 이름이다(방침 글 밖의 코드)");

  const terms = await page(fx, "/terms", { cookie: "" });
  ok(terms.status === 200 && terms.html.includes(`시행일 2026년 7월 13일 · 개정 공고 ${NOTICE_LABEL} · 개정 시행 ${REVISION_LABEL}`) && terms.html.includes(`"dateModified":"${NOTICE}"`), "5 /terms 머리가 공고·시행일이고 수정일이 공고일이다");
  const second = text(terms.html.slice(terms.html.indexOf('id="section-2"'), terms.html.indexOf('id="section-3"')));
  // V22.9.118: 2절 안내 줄 문장에 챗봇 첫 답(괄호 안 범위)을 더했다 — 앞뒤 그대로인 부분만 보고, 전체 문장은 validate-copy-fixes-v229118 이 본다.
  ok(second.includes("로그인 이름으로 새 계정을 만들 때는 이용약관 동의 칸을 체크합니다") && second.includes("카카오 로그인과 카카오톡에서 여는 가계부는 서비스를 이용하면 이용약관에 동의한 것으로 보며, 로그인 화면과 가계부 홈의 안내 줄") && second.includes("에서 이용약관과 개인정보처리방침을 볼 수 있습니다") && second.includes("만 14세 미만도 이용할 수 있으며, 아동의 개인정보는 개인정보처리방침 9절에 따라 처리합니다") && !second.includes("만 14세 이상만") && !second.includes("확인하는 절차를 거칩니다"), "5 이용약관 2절에 가입 동의 칸·카카오 이용 간주 안내·만 14세 미만 이용(방침 9절)이 있다(V22.9.114)");
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
  // V22.9.118 P-14: 답에서 ‘아직’ 을 뺐다(미래 약속 금지) — 기대 문구를 지금 사실 문장으로 갱신.
  ok(reply.includes("계정 탈퇴 기능은 없습니다") && reply.includes("개인정보처리방침에 적힌 문의 경로로 요청해 주세요"), `6 카카오 ‘개인정보’ 답의 탈퇴 안내가 방침의 문의 경로를 가리킨다: ${reply.slice(0, 120)}`);
  ok(!/https?:\/\//.test(reply), "6 카카오 답 글에 주소를 넣지 않는다(Y-7, 링크는 버튼)");
}));

// ── 7. 공개 첫 화면의 카카오 띠 ──────────────────────────────────────────────
await section("7 공개 첫 화면 띠", () => scene(async (fx) => {
  const view = await page(fx, "/", { cookie: "" });
  const band = view.html.match(/<section class="pubBand"[\s\S]*?<\/section>/)?.[0] || "";
  ok(band.includes('<form class="kakaoStart" method="get" action="/auth/kakao/start"><button class="kakaoBtn" type="submit">') && band.includes(`</svg>카카오 로그인</button></form>${NOTE}`) && !band.includes('name="consent"'), "7 공개 첫 화면 카카오 띠도 동의 칸 없는 폼 + 안내 한 줄이다(V22.9.114)");
  const css = styles(view.html);
  ok(css.includes("button.kakaoBtn{width:100%;border:0;font:inherit;") && css.includes(".pubBand .termsNote{margin:8px 0 0;color:#5f6b7a;font-size:12.5px;line-height:1.5;text-align:center;overflow-wrap:anywhere}") && css.includes(".pubBand .termsNote a{color:#1d4ed8;font-weight:700;text-decoration:underline}") && !css.includes(".consentRow"), "7 띠의 단추는 폭을 채우고 안내 한 줄은 가운데 정렬·줄바꿈·링크 밑줄이다(동의 칸 CSS 없음)");
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
  ok(run.nodes.kakaoLoginProgress.hidden === true, "8 단추를 눌러도 폼이 제출되지 않으면(브라우저가 제출을 막음) 대기 화면을 띄우지 않는다");
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
