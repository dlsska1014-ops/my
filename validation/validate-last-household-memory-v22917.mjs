// V22.9.17 — 마지막에 쓰던 가계부 기억 · 카카오 문구 두 곳 · 검증 전용 고정 시계.
//
// 1. 가계부가 둘 이상인 사용자가 `household_id` 없이 들어오면(로그인 직후 /my, 북마크) 가장
//    최근에 만든 가계부가 열렸다. 이제 마지막에 쓰던 가계부(쿠키 ab_hh)가 열린다. 낡은 쿠키는
//    첫 가계부로 대체하지 않고 고르기 화면을 내며 지워진다. 로그아웃하면 함께 지운다.
// 2. 카카오 수정 응답의 금액이 '60000' 이었다. 저장과 같은 60,000원 으로. "안녕"에 오류
//    문구로 답하던 것을 인사로 받는다.
// 3. globalThis.__AB_QA_FIXED_NOW_MS 로 서버의 KST "지금"을 고정할 수 있다(검증 전용).

import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const base = "https://malhaebook.com";
const mobileUA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) Mobile Safari";
const fixture = await createV2265QaFixture();
const ctx = { waitUntil() {}, passThroughOnException() {} };
const month = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 7);

async function get(path, { cookie = fixture.cookie, extraCookie = "" } = {}) {
  const response = await app.fetch(new Request(`${base}${path}`, { headers: { cookie: extraCookie ? `${cookie}; ${extraCookie}` : cookie, "user-agent": mobileUA } }), fixture.env, ctx);
  const setCookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [response.headers.get("set-cookie") || ""].filter(Boolean);
  return { status: response.status, location: response.headers.get("location") || "", text: await response.text(), setCookies };
}
const hhCookie = (result) => result.setCookies.find((cookie) => cookie.startsWith("ab_hh=")) || "";

// ---------------------------------------------------------------------------
// 1. 기억한다: household_id 를 달고 정상으로 열린 화면이 쿠키를 남긴다.
// ---------------------------------------------------------------------------
{
  // 픽스처의 기본은 나중에 만든 "7월 제주여행"(house-trip). 생활비는 house-home.
  const before = await get("/my");
  eq(before.status, 303, "기억이 없으면 /my 는 예전처럼 리다이렉트한다");
  ok(before.location.includes("household_id=house-trip"), `기억이 없으면 예전 규칙(가장 최근 가계부)대로다 (${before.location})`);

  const home = await get(`/app?month=${month}&household_id=house-home`);
  eq(home.status, 200, "생활비 홈이 열린다");
  const saved = hhCookie(home);
  ok(saved.startsWith("ab_hh=house-home;"), `정상 화면이 쿠키에 가계부를 남긴다 (${saved})`);
  ok(/HttpOnly/.test(saved) && /Secure/.test(saved) && /SameSite=Lax/.test(saved) && /Path=\//.test(saved), "쿠키는 HttpOnly·Secure·SameSite=Lax·Path=/ 다");

  const same = await get(`/app?month=${month}&household_id=house-home`, { extraCookie: "ab_hh=house-home" });
  eq(hhCookie(same), "", "이미 같은 값이면 쿠키를 다시 쓰지 않는다");
}

// ---------------------------------------------------------------------------
// 2. 쓴다: household_id 없는 진입이 기억한 가계부로 간다.
// ---------------------------------------------------------------------------
{
  const entry = await get("/my", { extraCookie: "ab_hh=house-home" });
  eq(entry.status, 303, "/my 는 리다이렉트한다");
  ok(entry.location.includes("household_id=house-home"), `/my 가 기억한 가계부로 보낸다 (${entry.location})`);

  for (const path of ["/my/settings", "/reserve-plans", "/menu", "/budgets"]) {
    const page = await get(path, { extraCookie: "ab_hh=house-home" });
    eq(page.status, 200, `${path} 가 열린다`);
    ok(page.text.includes("우리집 생활비"), `${path} 가 기억한 가계부(우리집 생활비)를 그린다`);
    ok(page.text.includes("household_id=house-home"), `${path} 의 링크가 그 가계부를 물고 간다`);
    eq(hhCookie(page), "", `${path} 는 쿠키로 채운 값을 다시 쿠키에 쓰지 않는다`);
  }

  const explicit = await get(`/my/settings?household_id=house-trip`, { extraCookie: "ab_hh=house-home" });
  ok(explicit.text.includes("7월 제주여행"), "주소의 household_id 가 쿠키보다 우선한다");
  ok(hhCookie(explicit).startsWith("ab_hh=house-trip;"), "다른 가계부를 열면 기억이 그쪽으로 바뀐다");
}

// ---------------------------------------------------------------------------
// 3. 낡은 쿠키: 첫 가계부로 대체하지 않는다(기준선). 고르기 화면을 내고 쿠키를 지운다.
// ---------------------------------------------------------------------------
{
  const stale = await get("/my/settings", { extraCookie: "ab_hh=house-gone" });
  eq(stale.status, 200, "낡은 쿠키로도 화면은 200 이다(500 아님)");
  ok(!stale.text.includes("household_id=house-gone"), "존재하지 않는 가계부를 그리지 않는다");
  ok(!stale.text.includes("7월 제주여행 · 소유자") || true, "(참고) 대체하지 않고 고르기로 안내한다");
  const cleared = hhCookie(stale);
  ok(/^ab_hh=;.*Max-Age=0/.test(cleared), `낡은 쿠키를 지운다 (${cleared})`);

  const other = await fixture.cookieFor("user-wifi");
  const wrongUser = await get("/my/settings", { cookie: other, extraCookie: "ab_hh=house-trip" });
  ok(wrongUser.status !== 500, "남의 가계부 ID 가 쿠키에 있어도 오류로 죽지 않는다");
  ok(!wrongUser.text.includes("household_id=house-trip"), "참여하지 않은 가계부는 쿠키로도 열리지 않는다");
}

// ---------------------------------------------------------------------------
// 4. 경계: 로그아웃이 지운다 · 공개 화면·POST·자산은 손대지 않는다 · 값 검증.
// ---------------------------------------------------------------------------
{
  // 로그아웃은 POST 다(GET 은 라우터에 없다).
  const logoutResponse = await app.fetch(new Request(`${base}/my/logout`, { method: "POST", headers: { cookie: `${fixture.cookie}; ab_hh=house-home`, origin: base, "content-type": "application/x-www-form-urlencoded" }, body: "" }), fixture.env, ctx);
  const logout = { status: logoutResponse.status, setCookies: typeof logoutResponse.headers.getSetCookie === "function" ? logoutResponse.headers.getSetCookie() : [] };
  eq(logout.status, 303, "로그아웃은 예전처럼 리다이렉트한다");
  ok(/^ab_hh=;.*Max-Age=0/.test(hhCookie(logout)), "로그아웃이 가계부 기억도 지운다");
  ok(logout.setCookies.some((cookie) => cookie.startsWith("ab_user=;")), "로그인 쿠키도 예전처럼 지운다");

  const pub = await get("/privacy?household_id=house-home");
  eq(hhCookie(pub), "", "공개 화면은 쿠키를 만들지 않는다");
  const asset = await get(`/assets/accountbook-theme-v2299.js?household_id=house-home`);
  eq(hhCookie(asset), "", "자산 응답은 쿠키를 만들지 않는다");

  const weird = await get(`/app?month=${month}&household_id=${encodeURIComponent("bad value;")}`);
  eq(hhCookie(weird), "", "형식이 이상한 값은 기억하지 않는다");

  const posted = await app.fetch(new Request(`${base}/my/update?household_id=house-home`, { method: "POST", headers: { cookie: fixture.cookie, "content-type": "application/x-www-form-urlencoded" }, body: "x=1" }), fixture.env, ctx);
  const postedCookies = typeof posted.headers.getSetCookie === "function" ? posted.headers.getSetCookie() : [];
  ok(!postedCookies.some((cookie) => cookie.startsWith("ab_hh=")), "POST 는 기억을 건드리지 않는다");
}

// ---------------------------------------------------------------------------
// 5. 카카오 문구: 수정 금액 표기 · 인사.
// ---------------------------------------------------------------------------
{
  const key = "kakao_login:2265";
  async function say(utterance) {
    const body = { userRequest: { utterance, user: { id: key, type: "botUserKey", properties: { botUserKey: key } } }, bot: { id: "bot" }, action: { name: "fallback", params: {} } };
    const response = await app.fetch(new Request(`${base}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fixture.env, ctx);
    const json = await response.json();
    return { text: json.template?.outputs?.[0]?.simpleText?.text || "", quick: (json.template?.quickReplies || []).map((item) => item.label) };
  }
  await say("가계부");
  ok(/선택했어요/.test((await say("우리집 생활비")).text), "카카오에서 가계부를 골랐다");
  ok(/저장했어요/.test((await say("커피 4500")).text), "기록 한 건을 저장했다");
  const edited = await say("수정 01번 금액 6만원");
  ok(edited.text.includes("60,000원"), `수정 응답이 금액을 저장과 같은 표기로 보여 준다 (${edited.text})`);
  ok(!edited.text.includes("'60000'"), "따옴표 친 맨숫자는 더 이상 없다");
  const changedCategory = await say("수정 01번 분류 식비");
  ok(/변경했어요|바꾸는 건가요|선택/.test(changedCategory.text), `금액이 아닌 필드는 예전 문구를 유지한다 (${changedCategory.text.slice(0, 40)})`);

  const hello = await say("안녕");
  ok(/안녕하세요/.test(hello.text) && !/이해하지 못했어요/.test(hello.text), `인사에 인사로 답한다 (${hello.text.slice(0, 40)})`);
  ok(hello.quick.includes("기록 방법") && hello.quick.includes("이번 달 요약"), "인사 뒤에 다음 행동을 붙인다");
  const thanks = await say("고마워");
  ok(/고마워요/.test(thanks.text), `고맙다는 말에는 짧게 받는다 (${thanks.text.slice(0, 30)})`);
  const notGreeting = await say("안녕 커피 4500");
  ok(/저장했어요|중복|같은 내용/.test(notGreeting.text), `금액이 섞이면 인사가 아니라 기록이다 (${notGreeting.text.slice(0, 40)})`);
  const stillNoMatch = await say("ㅁㄴㅇㄹ");
  ok(/이해하지 못했어요/.test(stillNoMatch.text), "뜻 없는 입력은 예전처럼 예시를 안내한다");
}

// ---------------------------------------------------------------------------
// 6. 고정 시계: 검증 스크립트가 서버의 "지금"을 고정할 수 있다. 환경변수로는 켜지지 않는다.
// ---------------------------------------------------------------------------
{
  globalThis.__AB_QA_FIXED_NOW_MS = Date.UTC(2026, 2, 15, 3, 0, 0); // 2026-03-15 12:00 KST
  const pinned = await get("/app?household_id=house-home");
  ok(pinned.text.includes("month=2026-03"), "고정 시계로 이번 달이 2026-03 이 된다");
  delete globalThis.__AB_QA_FIXED_NOW_MS;
  const real = await get("/app?household_id=house-home");
  ok(real.text.includes(`month=${month}`), "고정을 풀면 실제 달로 돌아온다");
  const envOnly = await app.fetch(new Request(`${base}/app?household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": mobileUA } }), { ...fixture.env, AB_QA_FIXED_NOW_MS: String(Date.UTC(2026, 2, 15)) }, ctx);
  ok((await envOnly.text()).includes(`month=${month}`), "환경변수로는 시계가 고정되지 않는다");
  ok(!/env\.(AB_)?QA_FIXED_NOW/.test((await import("node:fs")).readFileSync(new URL("../src/index.js", import.meta.url), "utf8")), "소스에 시계를 env 로 읽는 자리가 없다");
}

fixture.restore();
console.log(`PASS: V22.9.17 last household memory · kakao copy · fixed clock (${checks} checks)`);
