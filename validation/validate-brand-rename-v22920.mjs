// V22.9.20 — 서비스명 똑똑한가계부 → 말해가계부, 도메인 ttokttok-accountbook.com → malhaebook.com.
//
// 오래전부터 있는 "똑똑가계부" 앱·상표와 부딪혀 이름을 바꿨다. 이 검사가 지키는 것은 셋이다.
// 1. 옛 이름·옛 도메인이 소스와 검사에 다시 들어오지 않는다(옛 멘션을 받는 자리만 예외).
// 2. 새 이름이 실제로 화면·매니페스트·카카오 응답에 도착한다 — 상수만 바꾸고 화면은 옛
//    글자를 내는 상태를 막는다.
// 3. 단톡방에 남은 옛 멘션(@똑똑한가계부 …)으로 부른 요청도 새 멘션과 똑같이 처리한다.

import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const read = (name) => readFileSync(new URL(`../${name}`, import.meta.url), "utf8");

const NEW_NAME = "말해가계부";
const OLD_NAME = "똑똑한가계부";
const NEW_ORIGIN = "https://malhaebook.com";
const OLD_HOST = "ttokttok-accountbook.com";

// ---------------------------------------------------------------------------
// 1. 소스·검사에 옛 이름이 남지 않는다.
// ---------------------------------------------------------------------------
const source = read("src/index.js");
ok(source.includes(`const DEFAULT_PUBLIC_BASE_URL = "${NEW_ORIGIN}"`), "기본 공개 주소가 새 도메인이다");
ok(!source.includes(OLD_HOST), "소스에 옛 도메인이 없다");
ok(source.includes(`env.APP_NAME || env.BRAND_NAME || "${NEW_NAME}"`), "기본 서비스명이 새 이름이다");

// 옛 이름이 허용되는 자리: 멘션을 벗기는 정규식과 브랜드 질문 인식 — 그 밖에는 없어야 한다.
const oldNameLines = source.split("\n").filter((line) => line.includes(OLD_NAME));
const allowed = oldNameLines.filter((line) => /replace\(\/|\.test\(normalizeText/.test(line));
eq(oldNameLines.length - allowed.length, 0, `옛 이름은 멘션·브랜드 인식 자리에만 남는다 (그 밖 ${oldNameLines.length - allowed.length}곳)`);
ok(allowed.length >= 3, `옛 멘션·브랜드 질문을 받는 자리가 있다 (${allowed.length}곳)`);
ok(allowed.every((line) => line.includes(NEW_NAME)), "그 자리들은 새 이름도 함께 받는다");

const validationDir = new URL("./", import.meta.url);
const leaking = readdirSync(validationDir)
  .filter((name) => name.endsWith(".mjs") && name !== "validate-brand-rename-v22920.mjs")
  .filter((name) => {
    const text = readFileSync(new URL(name, validationDir), "utf8");
    return text.includes(OLD_NAME) || text.includes(OLD_HOST);
  });
eq(leaking.length, 0, `검사에 옛 이름·옛 도메인이 없다${leaking.length ? " — " + leaking.slice(0, 3).join(", ") : ""}`);
ok(read("tools/screen-audit.mjs").includes(NEW_ORIGIN), "화면 실측 도구가 새 도메인을 쓴다");

// ---------------------------------------------------------------------------
// 2. 새 이름이 화면·매니페스트·카카오 응답에 도착한다.
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const ctx = { waitUntil() {}, passThroughOnException() {} };
const get = (path, headers = {}) => app.fetch(new Request(`${NEW_ORIGIN}${path}`, { headers: { "user-agent": "Mozilla/5.0", ...headers } }), fixture.env, ctx);

for (const path of ["/", "/about", "/how-it-works", "/privacy", "/terms", "/site-map"]) {
  const response = await get(path);
  eq(response.status, 200, `${path} 가 열린다`);
  const html = await response.text();
  ok(html.includes(NEW_NAME), `${path} 에 새 이름이 있다`);
  ok(!html.includes(OLD_NAME) && !html.includes(OLD_HOST), `${path} 에 옛 이름·옛 도메인이 없다`);
}

{
  const response = await get("/manifest.json");
  const manifest = JSON.parse(await response.text());
  eq(manifest.name, "말해 가계부", "매니페스트 이름이 새 이름이다");
  eq(response.headers.get("etag"), '"ab-manifest-v22920"', "매니페스트 내용이 바뀌어 ETag 를 올렸다");
}

{
  const home = await get(`/app?month=2026-07&household_id=house-home`, { cookie: fixture.cookie });
  eq(home.status, 200, "개인 홈이 열린다");
  const html = await home.text();
  ok(html.includes(`<small>${NEW_NAME}</small>`), "사이드바 브랜드가 새 이름이다");
  ok(!html.includes(OLD_NAME), "개인 홈에 옛 이름이 없다");
}

// 환경변수 APP_NAME 이 비어 있어도 기본값으로 새 이름을 낸다(운영에서 변수를 지운 경우).
{
  const env = { ...fixture.env };
  delete env.APP_NAME;
  const response = await app.fetch(new Request(`${NEW_ORIGIN}/about`, { headers: { "user-agent": "Mozilla/5.0" } }), env, ctx);
  const html = await response.text();
  ok(html.includes(NEW_NAME) && !html.includes(OLD_NAME), "APP_NAME 없이도 새 이름이 기본이다");
}

// ---------------------------------------------------------------------------
// 3. 카카오: 새 멘션과 옛 멘션이 같은 답을 낸다.
// ---------------------------------------------------------------------------
// 픽스처 사용자에게 선택 가계부를 심어 두어야 "오늘 요약"이 가계부 고르기 대화로 빠지지 않는다.
fixture.db.accountbook_settings.push(
  { id: "setting-sel-bin-rename", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00.000Z" },
);
function skillPayload(utterance, userKey = "kakao_login:2265") {
  return {
    intent: { id: "qa-rename", name: "폴백" },
    userRequest: {
      timezone: "Asia/Seoul", params: {}, block: { id: "qa-rename", name: "폴백" },
      utterance, lang: "ko",
      user: { id: userKey, type: "botUserKey", properties: { botUserKey: userKey } },
    },
    bot: { id: "qa-bot", name: NEW_NAME },
    action: { id: "qa-rename-action", name: "폴백", params: {}, detailParams: {}, clientExtra: {} },
    contexts: [],
  };
}
async function say(utterance) {
  const response = await app.fetch(new Request(`${NEW_ORIGIN}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify(skillPayload(utterance)),
  }), fixture.env, ctx);
  eq(response.status, 200, `skill 200: ${utterance}`);
  const data = JSON.parse(await response.text());
  return (data?.template?.outputs || []).map((o) => o?.simpleText?.text || "").join("\n");
}

// 멘션이 붙은 요청은 단톡방 응답 형태(링크 블록 없음)로 나가므로 멘션 없는 답과 글자
// 그대로 같지는 않다. 지키는 성질은 "옛 멘션 == 새 멘션" 이고, 둘 다 본문을 이해했다는 것이다.
for (const [request, marker] of [["도움말", "사용법"], ["오늘 요약", "오늘 요약"]]) {
  const plain = await say(request);
  const withNew = await say(`@${NEW_NAME} ${request}`);
  const withOld = await say(`@${OLD_NAME} ${request}`);
  ok(plain.includes(marker), `"${request}" 에 답한다`);
  ok(withNew.includes(marker), `@${NEW_NAME} 멘션을 벗기고 본문을 이해한다: ${request}`);
  eq(withOld, withNew, `@${OLD_NAME} 옛 멘션도 새 멘션과 같은 답을 낸다: ${request}`);
  ok(!plain.includes(OLD_NAME) && !withNew.includes(OLD_NAME), `"${request}" 응답에 옛 이름이 없다`);
}

{
  const help = await say("도움말");
  ok(help.includes(NEW_NAME), "도움말이 새 이름을 말한다");
}

// 콜백 변수 누락·호스트 불일치는 카카오 로그인을 막는다. 공개 주소와 함께 전환한다.
const loginEnv = {
  ...fixture.env,
  KAKAO_LOGIN_ENABLED: "1",
  KAKAO_REST_API_KEY: "qa-rename-rest-key",
  KAKAO_REDIRECT_URI: `${NEW_ORIGIN}/auth/kakao/callback`,
  ADMIN_API_TOKEN: "qa-rename-admin-token",
};
const startLogin = (env) => app.fetch(new Request(`${NEW_ORIGIN}/auth/kakao/start`), env, ctx);
{
  const response = await startLogin(loginEnv);
  eq(response.status, 303, "새 도메인과 콜백을 함께 설정하면 카카오 로그인을 시작한다");
  const location = new URL(response.headers.get("location"));
  eq(location.origin, "https://kauth.kakao.com", "카카오 인증 서버로 이동한다");
  eq(location.searchParams.get("redirect_uri"), loginEnv.KAKAO_REDIRECT_URI, "설정된 새 콜백을 사용한다");
  ok(response.headers.get("set-cookie").includes("kakao_oauth_state="), "로그인 상태 쿠키를 발급한다");
}
for (const redirectUri of [undefined, `https://${OLD_HOST}/auth/kakao/callback`]) {
  const response = await startLogin({ ...loginEnv, KAKAO_REDIRECT_URI: redirectUri });
  eq(response.status, 503, "콜백 누락 또는 다른 호스트는 로그인을 시작하지 않는다");
  eq(response.headers.get("location"), null, "설정 오류를 카카오 인증 서버로 보내지 않는다");
}
for (const [env, marker] of [
  [loginEnv, "사용 가능"],
  [{ ...loginEnv, KAKAO_REDIRECT_URI: undefined }, "redirect_uri_missing"],
  [{ ...loginEnv, KAKAO_REDIRECT_URI: `https://${OLD_HOST}/auth/kakao/callback` }, "redirect_origin_mismatch"],
]) {
  const response = await app.fetch(new Request(`${NEW_ORIGIN}/domain-migration`, {
    headers: { authorization: `Bearer ${env.ADMIN_API_TOKEN}` },
  }), env, ctx);
  eq(response.status, 200, "관리자 도메인 이전 화면이 열린다");
  const html = await response.text();
  ok(html.includes(marker), `도메인 이전 화면이 실제 로그인 상태를 표시한다: ${marker}`);
  ok(html.includes(`KAKAO_REDIRECT_URI=${NEW_ORIGIN}/auth/kakao/callback`), "복사용 Worker 설정에 콜백 변수가 있다");
}
{
  const env = { ...loginEnv, CANONICAL_REDIRECT: "1" };
  const response = await app.fetch(new Request(`https://${OLD_HOST}/my?month=2026-10`), env, ctx);
  eq(response.status, 308, "옛 GET 주소는 308로 이동한다");
  eq(response.headers.get("location"), `${NEW_ORIGIN}/my?month=2026-10`, "이동할 때 경로와 질의 문자열을 유지한다");
  const skill = await app.fetch(new Request(`https://${OLD_HOST}/skill`, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(skillPayload("도움말")),
  }), env, ctx);
  eq(skill.status, 200, "옛 도메인의 POST 스킬도 처리한다");
  eq(skill.headers.get("location"), null, "POST 스킬을 리디렉션하지 않는다");
}
{
  const env = { ...loginEnv, PUBLIC_BASE_URL: `https://${OLD_HOST}`, KAKAO_REDIRECT_URI: `https://${OLD_HOST}/auth/kakao/callback` };
  const response = await app.fetch(new Request(`https://${OLD_HOST}/domain-migration`, {
    headers: { authorization: `Bearer ${env.ADMIN_API_TOKEN}` },
  }), env, ctx);
  eq(response.status, 200, "전환 전 환경에서도 도메인 이전 안내가 열린다");
  const html = await response.text();
  ok(html.includes(`Web domain: ${NEW_ORIGIN}`), "전환 전에도 Developers 등록 예시는 새 도메인이다");
  ok(html.includes(`Redirect URI: ${NEW_ORIGIN}/auth/kakao/callback`), "전환 전에도 Developers 콜백 예시는 새 도메인이다");
  ok(!html.includes(`Web domain: https://${OLD_HOST}`), "옛 도메인을 전환할 목표로 안내하지 않는다");
}
fixture.restore();

console.log(`V22.9.20 서비스명·도메인 변경 검사 통과 (${checks} checks)`);
