// V22.9.27 pre-login feature preview and Kakao web-entry regression coverage.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const stagedVersion = readFileSync(new URL("../VERSION.txt", import.meta.url), "utf8").trim();
const BASE = "https://malhaebook.com";
const env = {
  APP_NAME: "말해가계부",
  PUBLIC_BASE_URL: BASE,
  KAKAO_LOGIN_ENABLED: "1",
  KAKAO_REST_API_KEY: "qa-rest-key",
  KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`,
};

async function call(method, path, { body, headers = {} } = {}) {
  const requestHeaders = { ...headers };
  if (body !== undefined && !requestHeaders["content-type"]) requestHeaders["content-type"] = "application/x-www-form-urlencoded";
  if (method !== "GET") {
    requestHeaders.origin = BASE;
    requestHeaders.referer = `${BASE}/my`;
    requestHeaders["sec-fetch-site"] = "same-origin";
  }
  return app.fetch(new Request(BASE + path, { method, headers: requestHeaders, body }), env, { waitUntil() {} });
}

function skillPayload(utterance, groupKey = "") {
  return JSON.stringify({
    userRequest: {
      utterance,
      user: {
        id: groupKey ? "qa-prelogin-group-user" : "qa-prelogin-direct-user",
        type: "botUserKey",
        properties: {
          botUserKey: groupKey ? "qa-prelogin-group-user" : "qa-prelogin-direct-user",
          ...(groupKey ? { botGroupKey: groupKey } : {}),
        },
      },
    },
    bot: { id: "qa-prelogin-bot" },
    intent: { id: "qa-prelogin-intent" },
    action: { params: {} },
  });
}

async function callSkill(utterance, groupKey = "") {
  const response = await call("POST", "/skill", {
    body: skillPayload(utterance, groupKey),
    headers: { "content-type": "application/json; charset=utf-8" },
  });
  return { response, data: JSON.parse(await response.text()) };
}

function responseText(data) {
  return (data?.template?.outputs || []).map((output) => output?.simpleText?.text || [output?.textCard?.title, output?.textCard?.description, ...(output?.textCard?.buttons || []).map((b) => b.label)].filter(Boolean).join("\n")).filter(Boolean).join("\n");
}

// Public pre-login landing renders without a database request or browser state write.
let outboundFetches = 0;
const originalFetch = globalThis.fetch;
globalThis.fetch = async (...args) => {
  outboundFetches += 1;
  return originalFetch(...args);
};
let landingResponse;
let landingHtml;
try {
  landingResponse = await call("GET", "/my?return_to=%2Fapp%3Fmonth%3D2026-10%26household_id%3Dhouse-home");
  landingHtml = await landingResponse.text();
} finally {
  globalThis.fetch = originalFetch;
}

eq(landingResponse.status, 200, "public /my pre-login landing renders");
eq(outboundFetches, 0, "public pre-login landing performs zero outbound or database fetches");
eq(landingResponse.headers.get("cache-control"), "no-store", "pre-login landing remains no-store");
ok(landingResponse.headers.get("content-security-policy"), "pre-login landing keeps the shared content security policy");
eq(landingResponse.headers.get("x-frame-options"), "DENY", "pre-login landing remains frame-protected");
eq(landingResponse.headers.get("set-cookie"), null, "viewing the pre-login landing creates no cookie");
ok(landingHtml.includes('<meta name="robots" content="noindex,nofollow"/>'), "account entry landing is not indexed as a public content page");
ok(!landingHtml.includes("google-adsense-account") && !landingHtml.includes("pagead2.googlesyndication.com"), "account entry landing does not gain AdSense metadata or runtime");
ok(Buffer.byteLength(landingHtml, "utf8") <= 48 * 1024, "pre-login landing stays within a focused 48 KiB HTML budget");

const previewStart = landingHtml.indexOf('<section id="feature-preview"');
const authStart = landingHtml.indexOf('<section id="login-start"');
// V22.9.87 T-20: 시작 화면은 로그인이 먼저다(지시서 T-20). 기능 미리보기는 로그인·예시 카드·가입 아래로 내려갔으므로 순서 검사를 뒤집고,
// 미리보기 구간은 미리보기 시작부터 </main> 까지로 자른다(예전에는 처음부터 로그인 구간 앞까지였다).
ok(authStart > 0 && previewStart > authStart, "authentication section appears before the feature preview (login first)");
const previewHtml = landingHtml.slice(previewStart, landingHtml.indexOf("</main>", previewStart));
ok(previewHtml.includes("로그인 전 기능 미리보기"), "feature preview keeps its pre-login label");
ok(previewHtml.includes("예시 데이터 · 실제 저장 아님"), "fictional data is labeled as not saved");
ok(previewHtml.includes("점심 12000원 국민카드") && previewHtml.includes("어제 택시 18000원"), "chat preview shows clear expense recording examples");
ok(previewHtml.includes("지출 12,000원 기록 예시") && previewHtml.includes("지출 18,000원 기록 예시"), "chat preview shows the structured result of each example");
ok(previewHtml.includes("가상 예산 카드") && previewHtml.includes("가상 월간 리포트") && previewHtml.includes("가상 정산 카드"), "budget, report, and settlement value are visible before login");
ok(previewHtml.includes("민지") && previewHtml.includes("준호"), "preview uses clearly fictional participant names");
ok(!previewHtml.includes("<form") && !previewHtml.includes("<button"), "preview has no fake save form or write button");
ok(!previewHtml.includes("fetch(") && !previewHtml.includes("localStorage") && !previewHtml.includes("sessionStorage") && !previewHtml.includes("document.cookie"), "preview markup contains no network or browser-storage behavior");
ok(!previewHtml.includes("—"), "new preview copy contains no em dash");

// Existing authentication contracts remain intact and secondary to the preview.
ok(landingHtml.includes('<form method="post" action="/my/local-login">'), "existing local login form action remains unchanged");
ok(landingHtml.includes('<form method="post" action="/my/local-signup">'), "existing signup form action remains unchanged");
ok(landingHtml.includes('name="return_to" value="/app?month=2026-10&amp;household_id=house-home"'), "safe return_to is preserved in the login form");
// V22.9.87 T-20: 기존 계정 로그인 카드는 카카오 버튼 아래 접힌 칸(로그인 이름으로 로그인) 안으로 들어갔다. 카카오 로그인이 준비된 화면에서는 접혀 있다.
ok(landingHtml.includes('<details class="loginLocal" id="login-local"><summary>') && landingHtml.includes('로그인 이름으로 로그인</summary><div class="card loginCard">'), "existing account login stays inside the collapsed local-login disclosure under the Kakao button");
ok(landingHtml.includes('<details class="card signupCard" id="signup-start">'), "signup stays a secondary disclosure when no signup error exists");
ok(landingHtml.includes('id="signupPasswordStatus"') && landingHtml.includes('id="credentialMatchRuntime"'), "password feedback and serialized client runtime remain present");
ok(landingHtml.includes('id="kakaoLoginProgressRuntime"') && landingHtml.includes("kakaoLoginProgressClientMain.toString") === false, "rendered login progress runtime contains executable code rather than a function name placeholder");

const rejectedLogin = await call("POST", "/my/local-login", {
  body: new URLSearchParams({ access_code: "1234", return_to: "/app?month=2026-10&household_id=house-home" }).toString(),
});
eq(rejectedLogin.status, 400, "invalid login still returns the existing validation status");
const rejectedHtml = await rejectedLogin.text();
ok(rejectedHtml.includes("로그인 이름을 입력하세요."), "invalid login still explains the missing login name");
ok(rejectedHtml.includes('name="return_to" value="/app?month=2026-10&amp;household_id=house-home"'), "invalid login keeps the callback destination");
const rejectedLoginSummary = rejectedHtml.indexOf('<a class="authErrorSummary" href="#loginName" role="alert" autofocus>');
// V22.9.87 T-20: 첫 구간이 로그인 구간(<section id="login-start" class="landingHero">)이 됐다. 오류 요약은 그보다 앞, 맨 위에 있다.
ok(rejectedLoginSummary > 0 && rejectedLoginSummary < rejectedHtml.indexOf('<section id="login-start"'), "rejected login error summary appears before the login section and the rich preview");
ok(rejectedHtml.includes('<a class="authErrorSummary" href="#loginName" role="alert" autofocus>') && rejectedHtml.includes('<input id="loginName"'), "rejected login error summary is focused and links to the focusable login input");
eq((rejectedHtml.match(/role="alert"/g) || []).length, 1, "rejected login page exposes exactly one alert role");

const rejectedSignup = await call("POST", "/my/local-signup", {
  body: new URLSearchParams({ login_name: "a", display_name: "테스트", access_code: "password", access_code_confirm: "password" }).toString(),
});
eq(rejectedSignup.status, 400, "invalid signup keeps the existing validation status");
const rejectedSignupHtml = await rejectedSignup.text();
ok(rejectedSignupHtml.includes("로그인 이름은 2자 이상 입력하세요."), "invalid signup explains the rejected field");
const rejectedSignupSummary = rejectedSignupHtml.indexOf('<a class="authErrorSummary" href="#signupName" role="alert" autofocus>');
// V22.9.87 T-20: 위와 같은 이유로 기준 위치를 로그인 구간 시작으로 바꿨다.
ok(rejectedSignupSummary > 0 && rejectedSignupSummary < rejectedSignupHtml.indexOf('<section id="login-start"'), "rejected signup error summary appears before the login section and the rich preview");
ok(rejectedSignupHtml.includes('<a class="authErrorSummary" href="#signupName" role="alert" autofocus>') && rejectedSignupHtml.includes('<input id="signupName"'), "rejected signup error summary links to the focusable signup input");
ok(rejectedSignupHtml.includes('<details class="card signupCard" id="signup-start" open>'), "rejected signup opens the existing signup disclosure");
eq((rejectedSignupHtml.match(/role="alert"/g) || []).length, 1, "rejected signup page exposes exactly one alert role");

const oauthErrorResponse = await app.fetch(new Request(`${BASE}/auth/kakao/start`), { ...env, KAKAO_LOGIN_ENABLED: "0" }, { waitUntil() {} });
eq(oauthErrorResponse.status, 200, "disabled OAuth entrance renders its existing recoverable error page");
const oauthErrorHtml = await oauthErrorResponse.text();
ok(oauthErrorHtml.includes("카카오 로그인을 잠시 사용할 수 없습니다."), "OAuth error remains visibly explained");
const oauthErrorSummary = oauthErrorHtml.indexOf('<a class="authErrorSummary" href="#loginName" role="alert" autofocus>');
// V22.9.87 T-20: 위와 같은 이유로 기준 위치를 로그인 구간 시작으로 바꿨다. 카카오 로그인을 쓸 수 없는 화면은 로그인 이름 칸이 열린 채다.
ok(oauthErrorSummary > 0 && oauthErrorSummary < oauthErrorHtml.indexOf('<section id="login-start"') && oauthErrorHtml.includes('<details class="loginLocal" id="login-local" open>'), "OAuth error summary appears before the login section and links to the opened, focusable login input");
eq((oauthErrorHtml.match(/role="alert"/g) || []).length, 1, "OAuth error page exposes exactly one alert role");

// Kakao Help and menu stay URL-free; every explicit website alias returns one focused login URL.
const menu = await callSkill("메뉴");
eq(menu.response.status, 200, "Kakao menu command succeeds without database configuration");
const menuText = responseText(menu.data);
// V22.9.67: 메뉴는 짧은 버튼형 설명서 첫 화면으로 답하고, 웹 진입은 ‘웹 관리 방법’ 화면의 ‘웹 가계부 열기’ 버튼으로 이어진다.
ok(menuText.includes("웹관리하기") || menuText.includes("웹가계부"), "Kakao menu leads to the representative web-entry command");
ok(!/https?:\/\//i.test(menuText) && !menuText.includes("/kakao-command-system"), "Kakao menu contains no URL");
ok(!menuText.includes("—"), "Kakao menu copy contains no em dash");

const help = await callSkill("Help");
eq(help.response.status, 200, "English Help entrance succeeds");
const helpOutput = responseText(help.data);
ok(!/https?:\/\//i.test(helpOutput), "Help response contains no URL");

const website = await callSkill("웹 가계부 열기");
eq(website.response.status, 200, "representative web-entry command succeeds");
const websiteText = responseText(website.data);
// V22.9.88 Y-7: the website address is a webLink button, not text (Kakao review: no raw URL in replies).
const responseLinks = (data) => (data?.template?.outputs || []).flatMap((output) => output?.textCard?.buttons || []).filter((button) => button.action === "webLink").map((button) => button.webLinkUrl);
const websiteLinks = responseLinks(website.data);
ok(websiteLinks.includes(`${BASE}/my`) && !/https?:\/\//i.test(websiteText), "representative web-entry command returns the website login URL as a link button");
eq(websiteLinks.length, 1, "representative web-entry command returns one focused URL");
ok(!websiteLinks.some((url) => url.includes("/start-guide") || url.includes("/keyword-guide")), "representative web-entry command does not append promotional guide links");
ok(!Object.hasOwn(website.data.template || {}, "quickReplies"), "website command does not attach unrelated quick replies");

for (const alias of ["링크", "홈페이지"]) {
  const aliasReply = await callSkill(alias);
  eq(aliasReply.response.status, 200, `${alias} legacy website alias succeeds`);
  const aliasLinks = responseLinks(aliasReply.data);
  ok(aliasLinks.includes(`${BASE}/my`) && !/https?:\/\//i.test(responseText(aliasReply.data)), `${alias} legacy website alias returns the website login URL as a link button`);
  eq(aliasLinks.length, 1, `${alias} legacy website alias returns one focused URL`);
  ok(!aliasLinks.some((url) => url.includes("/start-guide") || url.includes("/keyword-guide") || url.includes("/chatbot-edit-guide")), `${alias} legacy website alias omits guide URLs`);
}

const groupWebsite = await callSkill("웹 가계부 열기", "qa-prelogin-group");
eq(groupWebsite.response.status, 200, "group web-entry command succeeds");
ok(responseLinks(groupWebsite.data).includes(`${BASE}/my`) && !/https?:\/\//i.test(responseText(groupWebsite.data)), "group web-entry command returns the same website URL as a link button");
ok(!Object.hasOwn(groupWebsite.data.template || {}, "quickReplies"), "real group response contains no quickReplies");

const catalogResponse = await call("GET", "/kakao-command-menu.json");
eq(catalogResponse.status, 200, "Kakao command catalog renders");
const catalog = await catalogResponse.json();
const webRepresentative = catalog.representative_commands.find((item) => item.command === "웹 가계부 열기");
ok(webRepresentative && webRepresentative.order === 11, "web-entry command is cataloged as representative order 11");
ok(!catalog.secondary_commands.some((item) => item.command === "웹 가계부 열기"), "web-entry command is not mislabeled as secondary");
eq(catalogResponse.headers.get("cache-control"), "no-store", "command catalog remains no-store");

// Static source guards keep the preview passive and the staged version consistent.
const renderStart = source.indexOf("function renderUserLoginHtml(");
const renderEnd = source.indexOf("\nfunction myNavCss(", renderStart);
ok(renderStart > 0 && renderEnd > renderStart, "pre-login renderer source block is found");
const renderBlock = source.slice(renderStart, renderEnd);
ok(!/\bfetch\s*\(|localStorage|sessionStorage|document\.cookie/.test(renderBlock), "pre-login renderer source has no fetch, storage, or cookie API");
// V22.9.87 T-20: 첫 화면의 파란 ‘기능 먼저 보기’ 버튼(.cta.ctaPrimary)과 그 흰 글씨 규칙은 없어졌다. 첫 화면의 채운 버튼은 카카오 로그인 하나이고(지시서 T-20),
// 그 노란 면·검은 글씨가 셸의 링크색 규칙(body.abV22812Shell a)보다 앞서는지를 대신 본다.
ok(renderBlock.includes(".kakaoBtn{display:flex;") && renderBlock.includes("background:#fee500!important;color:rgba(0,0,0,.85)!important"), "Kakao login button keeps its yellow face and dark label against shared anchor theme rules");
ok(!renderBlock.includes("ctaPrimary") && !renderBlock.includes("class=\"cta "), "the old blue first-screen CTA is gone, so Kakao login is the only filled first-screen button");
ok(source.includes(`const APP_VERSION = "${stagedVersion}";`), "runtime uses the staged VERSION.txt value");

console.log(`PASS: pre-login preview and Kakao entry (${checks} checks)`);
