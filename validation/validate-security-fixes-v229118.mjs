// V22.9.118 S-1·S-2·O-4 — 로그인 시도 제한 보강, 방 단추 바로 열기의 세션 범위, 배포 도구 되돌리기 안전장치 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 전체 점검(2026-11-12, review-artifacts/project-review-2026-11-12/REVIEW.md 2절)의 세 항목을 좁게 고쳤다.
//  S-1 관리자·로그인 이름의 ‘계정 단위’ 시도 키에 IP 가 들어 있었다(IP|admin, IP|로그인 이름). 주석은 ‘클라이언트와 무관한 전체 횟수’ 라고
//      했지만 IPv6 /64 안에서 주소를 바꾸면 새로 8~10번씩 허용됐다(오프라인 재현: 관리자 120번 연속 401, 잠금 없음).
//      → IP 와 무관한 계정 전체 횟수(기본 50번/15분, 변수 AUTH_ACCOUNT_GLOBAL_RATE_LIMIT 10~50)를 더하고, 시도 제한의 IP 단위는 IPv6 를 /64 로
//        묶는다. 그 창에서 처음 막힐 때 운영 이벤트 auth_account_limit_reached 한 건(IP·로그인 이름 없음). 예전 단위·한도는 그대로다.
//  S-2 방 단추 바로 열기(V105)가 원래 채팅 행이면 강한 식별(카카오 로그인·로그인 이름 비밀번호)이 붙은 계정에도 주소 값만으로 세션을 줬다.
//      계정 잇기를 마치면 주 계정이 방 기록 계정이라, 그 값을 아는 사람이 만료 없이 그 사람의 모든 가계부를 열었다.
//      → 그런 계정은 세션 없이 그 방 가계부 주소로만 보내 인앱 자동 로그인 길로 간다(V105 독립 검토 R-6 의 뜻). 웹 자격이 없는 보통 채팅
//        사용자의 ‘방 단추 → 로그인 화면 없이 방 가계부 홈’(카카오 심사 요구)은 그대로다.
//  O-4 배포 도구가 승격 뒤 실행할 수 있는 되돌리기 명령 줄을 출력했고(2026-10-19 사고 뒤 규칙과 어긋남), 서울 DB 전환 버전(#333)보다 앞선
//      버전(옛 시드니 Secret)으로 내리는 것을 막지 않았고, 되돌린 뒤 /ready 를 보지 않았다.
// 실제 요청(/login·/my/local-login·/my·/app)과 픽스처 DB(시도 횟수 흉내 __enforce_auth_rate)로 본다. 배포 도구는 가짜 Cloudflare API 로 돌린다.
// 장면(section)마다 따로 잡아, 옛 코드에서는 어느 항목이 실패하는지 한 번에 보인다. 하나라도 실패하면 끝에서 실패로 끝난다.
//
// ── 실행 ──
//   node validation/validate-security-fixes-v229118.mjs
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import * as authCrypto from "../src/modules/auth/crypto-admin-session.js";
import * as deployTool from "../tools/deploy-worker-version.mjs";
import { app, BASE, counter, ctx, failure, fixture, intercept, settingValue, withClock } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.118 login attempt limits, room-open session scope and rollback guard");
const ok = (value, message) => t.ok(!!value, message);
const eq = (actual, expected, message) => t.ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const failedSections = [];
async function section(name, task) {
  try {
    await task();
  } catch (error) {
    failedSections.push(`${name}: ${String(error?.message || error).split("\n")[0].slice(0, 300)}`);
    console.error(`FAIL ${name}: ${String(error?.message || error).split("\n")[0].slice(0, 300)}`);
  }
}
const events = (kind) => (globalThis.__AB_OPS_EVENTS || []).filter((event) => event.kind === kind);
const fingerprint = (text) => createHash("sha256").update(text).digest("hex");

// ═════════════════════════════════════════════════════════════════════════════════════
// S-1 로그인 시도 제한
// ═════════════════════════════════════════════════════════════════════════════════════
const ADMIN_PASSWORD = "qa-admin-password-v229118";
const ADMIN_ENV = { ADMIN_PASSWORD, ADMIN_SESSION_SECRET: "qa-admin-session-secret-v229118" };
const ADMIN_WIDE = fingerprint("auth|global|/login|admin");
const nameWide = (name) => fingerprint(`auth|global|/my/local-login|${name}`);
const UA = "QA-Login/118";
// 주소 묶음(/64) 하나에 한 칸. block 이 같으면 같은 /64, host 만 다르면 그 안의 다른 주소다.
const v6 = (block, host = 1) => `2001:db8:${block.toString(16)}:1::${host.toString(16)}`;
const attemptsOf = (fx, key) => fx.db.__auth_attempts?.get(key);

function freshLimiter(fx) {
  fx.db.__enforce_auth_rate = true;
  fx.db.__auth_attempts = new Map();
  globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

async function formPost(fx, path, values, { ip = "", ua = UA } = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "user-agent": ua, ...(ip ? { "cf-connecting-ip": ip } : {}) },
    body: new URLSearchParams(values).toString(),
  }), fx.env, ctx);
  return { status: response.status, retryAfter: response.headers.get("retry-after") || "", setCookie: response.headers.get("set-cookie") || "", location: response.headers.get("location") || "", html: await response.text() };
}
const adminLogin = (fx, password, ip, ua = UA) => formPost(fx, "/login", { password, return_to: "/admin" }, { ip, ua });
const localLogin = (fx, name, password, ip, ua = UA) => formPost(fx, "/my/local-login", { login_name: name, access_code: password }, { ip, ua });
async function signup(fx, name, password) {
  const response = await formPost(fx, "/my/local-signup", { login_name: name, display_name: name, access_code: password, access_code_confirm: password, consent: "1" }, { ip: "198.51.100.200" });
  ok(response.status === 303, `S-1 준비: 로그인 이름 ‘${name}’ 계정을 만든다`);
}

// 시도 제한 RPC 요청 본문을 모은다. failKey 가 주어지면 그 키의 요청만 실패(503)시킨다.
async function captureAuthCalls(task, { failKey = "" } = {}) {
  const bodies = [];
  const restore = intercept(async ({ url, method, init }) => {
    if (method !== "POST" || url.pathname !== "/rest/v1/rpc/accountbook_auth_attempt") return null;
    const body = JSON.parse(String(init?.body || "{}"));
    bodies.push(body);
    return failKey && body.p_key === failKey ? failure(503) : null;
  });
  try {
    return { result: await task(), bodies };
  } finally {
    restore();
  }
}

// ── S-1 0. 소스: 주석이 실제 동작과 맞다 ─────────────────────────────────────────────
await section("S-1 소스", async () => {
  const adminSource = read("src/modules/admin/transactions-households.js");
  const loginSource = read("src/modules/auth/local-login-pages.js");
  const cryptoSource = read("src/modules/auth/crypto-admin-session.js");
  ok(!adminSource.includes("클라이언트와 무관한 전체 횟수도 센다."), "S-1 0 관리자 로그인의 옛 주석(‘클라이언트와 무관한 전체 횟수도 센다’, 실제로는 IP 를 품은 키)을 고쳤다");
  ok(!loginSource.includes("계정 단위 횟수는 어디서 보내든 같은 계정이면 함께 줄어든다."), "S-1 0 로그인 이름 단위의 옛 주석(‘어디서 보내든 함께 줄어든다’, 실제로는 주소|이름 키)을 고쳤다");
  ok(/recordAuthAccountWideAttempt\(env, request, "\/login", "admin", false,/.test(adminSource), "S-1 0 관리자 로그인이 IP 와 무관한 관리자 전체 횟수를 센다");
  ok(/recordAuthAccountWideAttempt\(env, request, "\/my\/local-login", loginName, false,/.test(loginSource), "S-1 0 로그인 이름 로그인이 IP 와 무관한 이름 전체 횟수를 센다");
  ok(/boundedRuntimeNumber\(env\?\.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT, 50, 10, 50\)/.test(cryptoSource), "S-1 0 전체 횟수 한도는 변수로 바꿀 수 있다(기본 50, 10~50 — 운영 함수가 50 위를 자른다)");
  ok(/scope === "ip" \? authAttemptNetwork\(request\)/.test(cryptoSource), "S-1 0 ip 범위 시도 제한은 IPv6 를 /64 로 묶어 센다");
});

// ── S-1 1. IPv6 /64 묶기 ──────────────────────────────────────────────────────────
await section("S-1 /64 묶기", async () => {
  const network = authCrypto.authAttemptNetwork;
  eq(typeof network, "function", "S-1 1 시도 제한용 주소 묶음 도우미가 있다");
  const of = (headers) => network(new Request("https://qa.invalid/", { headers }));
  const cases = [
    [{ "cf-connecting-ip": "198.51.100.7" }, "198.51.100.7", "IPv4 는 주소 그대로(예전 키와 같다)"],
    [{}, "unknown", "주소 머리가 없으면 예전처럼 unknown"],
    [{ "cf-connecting-ip": "2001:db8:77:1:aaaa:bbbb:cccc:dddd" }, "2001:db8:77:1::/64", "IPv6 는 앞 64비트"],
    [{ "cf-connecting-ip": "2001:db8:77:1::5" }, "2001:db8:77:1::/64", "같은 /64 의 다른 주소는 같은 묶음"],
    [{ "cf-connecting-ip": "2001:0DB8:0077:0001:0000:0000:0000:0009" }, "2001:db8:77:1::/64", "대문자·앞자리 0 을 써도 같은 묶음"],
    [{ "cf-connecting-ip": "2001:db8::1" }, "2001:db8:0:0::/64", "가운데 0 을 줄인 꼴(::)도 읽는다"],
    [{ "cf-connecting-ip": "::ffff:203.0.113.9" }, "203.0.113.9", "IPv4 를 담은 IPv6(::ffff:)는 그 IPv4"],
    [{ "cf-connecting-ip": "2001:db8:1:2:3:4:1.2.3.4" }, "2001:db8:1:2::/64", "끝에 IPv4 를 적은 꼴도 앞 64비트"],
    [{ "cf-connecting-ip": "[2001:db8:77:1::6]" }, "2001:db8:77:1::/64", "대괄호를 친 꼴도 같은 묶음"],
    [{ "cf-connecting-ip": "fe80::1%eth0" }, "fe80:0:0:0::/64", "영역 표시(%)는 뗀다"],
    [{ "x-forwarded-for": "2001:db8:77:1::9, 10.0.0.1" }, "2001:db8:77:1::/64", "x-forwarded-for 는 첫 주소"],
    [{ "cf-connecting-ip": "2001:db8:::1" }, "2001:db8:::1", "모양을 읽지 못하면 주소 그대로(남과 합치지 않는다)"],
    [{ "cf-connecting-ip": "1:2:3:4:5:6:7:8:9" }, "1:2:3:4:5:6:7:8:9", "칸이 아홉이면 주소 그대로"],
  ];
  for (const [headers, expected, message] of cases) eq(of(headers), expected, `S-1 1 ${message}`);
  eq(of({ "cf-connecting-ip": "2001:db8:77:2::1" }) === of({ "cf-connecting-ip": "2001:db8:77:1::1" }), false, "S-1 1 다른 /64 는 다른 묶음");
});

// ── S-1 2. 같은 /64 안에서 주소를 바꿔도 관리자 9번째 시도는 막힌다 ──────────────────────
await section("S-1 같은 /64 관리자", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  freshLimiter(fx);
  const statuses = [];
  let blocked = null;
  for (let host = 1; host <= 9; host += 1) {
    const response = await adminLogin(fx, `wrong-${host}`, v6(0x77, host));
    statuses.push(response.status);
    if (host === 9) blocked = response;
  }
  eq(statuses.slice(0, 8).join(","), "401,401,401,401,401,401,401,401", "S-1 2 같은 /64 의 다른 주소 8곳: 틀린 비밀번호는 401");
  eq(blocked?.status, 429, "S-1 2 같은 /64 의 아홉째 주소는 429(예전에는 주소를 바꿀 때마다 새로 셌다)");
  ok(blocked?.html.includes("로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.") && blocked?.retryAfter === "900", "S-1 2 기존 문구와 retry-after 900 을 쓴다");
  eq(attemptsOf(fx, fingerprint(`auth|ip|/login|2001:db8:77:1::/64`)), 9, "S-1 2 관리자 IP 횟수는 /64 하나로 센다");
  eq(attemptsOf(fx, fingerprint(`auth|account|/login|2001:db8:77:1::/64|admin`)), 8, "S-1 2 ‘주소|admin’ 키도 /64 로 센다(막힌 아홉째는 그 앞에서 끝난다)");
  // 다른 /64 의 관리자는 맞는 비밀번호로 들어간다.
  const admin = await adminLogin(fx, ADMIN_PASSWORD, v6(0x78, 1));
  eq(admin.status, 303, "S-1 2 다른 /64 에서 맞는 비밀번호는 들어간다");
  ok(admin.setCookie.startsWith("ab_admin="), "S-1 2 관리자 세션 쿠키를 준다");
}));

// ── S-1 3. 주소 묶음을 바꿔 가도 관리자 비밀번호 전체 횟수는 50번 ─────────────────────────
await section("S-1 관리자 전체 횟수", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  freshLimiter(fx);
  let firstBlocked = 0;
  let firstBlockedResponse = null;
  let reachedAfterFirst = null;
  const statuses = [];
  for (let n = 1; n <= 52; n += 1) {
    const block = 0x100 + Math.floor((n - 1) / 8); // /64 하나에 8번(그 /64 의 IP 한도)까지
    const response = await adminLogin(fx, `wrong-password-${n}`, v6(block, ((n - 1) % 8) + 1));
    statuses.push(response.status);
    if (response.status === 429 && !firstBlocked) {
      firstBlocked = n;
      firstBlockedResponse = response;
      reachedAfterFirst = events("auth_account_limit_reached").map((event) => ({ ...event }));
    }
  }
  ok(statuses.slice(0, 50).every((status) => status === 401), "S-1 3 전체 50번까지는 틀린 비밀번호 401(정상 사용자가 걸릴 일이 없는 넉넉한 한도)");
  eq(firstBlocked, 51, "S-1 3 주소 묶음 일곱 곳에 나눠도 51번째부터 막힌다(예전에는 120번도 401)");
  ok(firstBlockedResponse?.html.includes("로그인 시도가 너무 많습니다. 잠시 후 다시 시도하세요.") && firstBlockedResponse?.retryAfter === "900", "S-1 3 막힐 때도 기존 문구·retry-after 900");
  eq(attemptsOf(fx, ADMIN_WIDE), 52, "S-1 3 관리자 전체 횟수는 IP 와 무관한 키 하나에 쌓인다");
  eq(reachedAfterFirst?.length, 1, "S-1 3 처음 막힌 시도에 운영 이벤트 auth_account_limit_reached 한 건");
  eq(events("auth_account_limit_reached").length, 1, "S-1 3 같은 창에서 계속 막혀도 이벤트를 더 남기지 않는다(이벤트 칸을 채우지 않게)");
  const event = reachedAfterFirst?.[0] || {};
  eq(`${event.severity}|${event.path}|${event.method}|${event.label}|${event.detail}`, "warn|/login|POST|관리자 로그인|limit 50, window 900s", "S-1 3 이벤트에는 경로·종류·한도·창만 있다");
  ok(!/2001:db8|wrong-password|qa-admin/.test(JSON.stringify(event)), "S-1 3 이벤트에 IP·비밀번호가 없다");
  // 그 창에서는 맞는 비밀번호도 로그인 화면에서 막힌다(이미 있는 관리자 세션 12시간은 그대로) — 한도를 넉넉히 둔 까닭이다.
  const right = await adminLogin(fx, ADMIN_PASSWORD, v6(0x1ff, 1));
  ok(right.status === 429 && !right.setCookie.includes("ab_admin="), "S-1 3 전체 횟수가 차 있는 동안은 맞는 비밀번호도 429(세션을 주지 않는다)");
}));

// ── S-1 4. 로그인 이름 전체 횟수, 다른 이름은 영향 없음 ─────────────────────────────────
await section("S-1 로그인 이름 전체 횟수", () => fixture(async (fx) => {
  fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = "10"; // 변수로 낮춘 한도(아래쪽 끝). PBKDF2 계산이 있어 시도 수를 줄인다.
  await signup(fx, "v229118fam", "pass-word-118a");
  await signup(fx, "v229118other", "pass-word-118b");
  freshLimiter(fx);
  const statuses = [];
  let blocked = null;
  for (let n = 1; n <= 11; n += 1) {
    const response = await localLogin(fx, "V229118Fam", "wrong-pass-118", v6(0x200 + n));
    statuses.push(response.status);
    if (n === 11) blocked = response;
  }
  eq(statuses.slice(0, 10).join(","), "401,401,401,401,401,401,401,401,401,401", "S-1 4 주소 묶음 열 곳에서 한 번씩: 틀린 비밀번호는 401");
  eq(blocked?.status, 429, "S-1 4 열한째 묶음에서는 429(예전에는 주소를 바꾸면 새로 셌다)");
  ok(blocked?.html.includes("이 로그인 이름으로 시도가 너무 많습니다. 잠시 후 다시 시도하세요.") && blocked?.retryAfter === "900", "S-1 4 기존 ‘이 로그인 이름으로’ 문구와 retry-after 900");
  eq(attemptsOf(fx, nameWide("v229118fam")), 11, "S-1 4 대소문자가 달라도 같은 이름의 전체 횟수 하나에 쌓인다");
  const reached = events("auth_account_limit_reached");
  eq(reached.length, 1, "S-1 4 처음 막힐 때 운영 이벤트 한 건");
  eq(`${reached[0]?.path}|${reached[0]?.label}|${reached[0]?.detail}`, "/my/local-login|로그인 이름|limit 10, window 900s", "S-1 4 이벤트는 경로·종류·한도(변수 값)·창만");
  ok(!/v229118fam|2001:db8|wrong-pass/i.test(JSON.stringify(reached)), "S-1 4 이벤트에 로그인 이름·IP·비밀번호가 없다");
  // 다른 로그인 이름은 영향이 없다.
  const other = await localLogin(fx, "v229118other", "pass-word-118b", v6(0x2ff));
  eq(other.status, 303, "S-1 4 다른 로그인 이름의 정상 로그인은 그대로 된다");
  ok(other.setCookie.includes("ab_user="), "S-1 4 다른 로그인 이름은 세션을 받는다");
  // 막힌 이름은 그 창에서 맞는 비밀번호도 막힌다(카카오 로그인은 그대로).
  const right = await localLogin(fx, "v229118fam", "pass-word-118a", v6(0x2fe));
  ok(right.status === 429 && !right.setCookie.includes("ab_user="), "S-1 4 막힌 이름은 그 창에서는 맞는 비밀번호도 429");
}));

// ── S-1 5. 성공하면 그 계정의 전체 횟수가 지워진다(정상 로그인) ───────────────────────────
await section("S-1 성공 뒤 초기화", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = "10";
  await signup(fx, "v229118reset", "pass-word-118c");
  freshLimiter(fx);
  for (let n = 1; n <= 5; n += 1) eq((await localLogin(fx, "v229118reset", "wrong-pass-118", v6(0x300 + n))).status, 401, `S-1 5 틀린 비밀번호 ${n}번째 401`);
  eq(attemptsOf(fx, nameWide("v229118reset")), 5, "S-1 5 이름 전체 횟수 5");
  const right = await localLogin(fx, "v229118reset", "pass-word-118c", v6(0x306));
  ok(right.status === 303 && right.setCookie.includes("ab_user="), "S-1 5 맞는 비밀번호는 정상 로그인(303·세션)");
  eq(attemptsOf(fx, nameWide("v229118reset")), 0, "S-1 5 로그인 성공은 이름 전체 횟수를 지운다");
  eq(attemptsOf(fx, fingerprint("auth|account|/my/local-login|2001:db8:306:1::/64|v229118reset")), 0, "S-1 5 ‘주소|이름’ 횟수도 예전처럼 지운다");
  const statuses = [];
  for (let n = 1; n <= 10; n += 1) statuses.push((await localLogin(fx, "v229118reset", "wrong-pass-118", v6(0x310 + n))).status);
  eq(statuses.join(","), "401,401,401,401,401,401,401,401,401,401", "S-1 5 지운 뒤에는 다시 한도(10)까지 401(지우지 않았다면 여섯째부터 막혔다)");
  // 관리자도 같다.
  for (let n = 1; n <= 4; n += 1) await adminLogin(fx, "wrong", v6(0x320 + n));
  eq(attemptsOf(fx, ADMIN_WIDE), 4, "S-1 5 관리자 전체 횟수 4");
  const admin = await adminLogin(fx, ADMIN_PASSWORD, v6(0x330));
  eq(admin.status, 303, "S-1 5 관리자 정상 로그인");
  eq(attemptsOf(fx, ADMIN_WIDE), 0, "S-1 5 관리자 로그인 성공은 관리자 전체 횟수를 지운다");
}));

// ── S-1 6. 새 횟수를 읽지 못하면 예전처럼 닫힌다(503) ───────────────────────────────────
await section("S-1 DB 실패", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  await signup(fx, "v229118dbfail", "pass-word-118d");
  freshLimiter(fx);
  const admin = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "203.0.113.30"), { failKey: ADMIN_WIDE });
  eq(admin.result.status, 503, "S-1 6 관리자 전체 횟수를 못 세면 맞는 비밀번호여도 503");
  ok(admin.result.html.includes("로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.") && !admin.result.setCookie.includes("ab_admin="), "S-1 6 기존 문구, 세션 없음");
  ok(events("auth_rate_db_unavailable").length >= 1, "S-1 6 운영 이벤트 auth_rate_db_unavailable(기존)");
  const local = await captureAuthCalls(() => localLogin(fx, "v229118dbfail", "pass-word-118d", "203.0.113.31"), { failKey: nameWide("v229118dbfail") });
  eq(local.result.status, 503, "S-1 6 이름 전체 횟수를 못 세면 맞는 비밀번호여도 503");
  ok(local.result.html.includes("로그인 보호 기능에 연결하지 못했습니다. 잠시 후 다시 시도하세요.") && !local.result.setCookie.includes("ab_user="), "S-1 6 기존 문구, 세션 없음");
  // 기존 키가 실패해도 예전 그대로 503(앞 단계에서 닫힌다).
  const ipKey = fingerprint("auth|ip|/login|203.0.113.32");
  const old = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "203.0.113.32"), { failKey: ipKey });
  ok(old.result.status === 503 && !old.bodies.some((body) => body.p_key === ADMIN_WIDE), "S-1 6 기존 IP 횟수 실패도 그대로 503(전체 횟수까지 가지 않는다)");
}));

// ── S-1 7. 예전 단위·한도·키는 그대로(IPv4), 새 키 하나만 더해진다 ────────────────────────
await section("S-1 예전 단위 그대로", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  await signup(fx, "v229118keys", "pass-word-118e");
  freshLimiter(fx);
  const ip = "198.51.100.7";
  const admin = await captureAuthCalls(() => adminLogin(fx, "wrong", ip));
  const adminLimits = new Map(admin.bodies.map((body) => [body.p_key, body.p_limit]));
  eq(adminLimits.get(fingerprint(`auth|ip|/login-admission|${ip}`)), 40, "S-1 7 관리자 입장 제한: 키·한도(40) 그대로");
  eq(adminLimits.get(fingerprint(`auth|ip|/login|${ip}`)), 8, "S-1 7 관리자 IP 횟수: 키·한도(8) 그대로");
  eq(adminLimits.get(fingerprint(`auth|account|/login|${ip}|admin`)), 30, "S-1 7 관리자 ‘IP|admin’ 횟수: 키·한도(30) 그대로");
  const loginIp = "198.51.100.8";
  const local = await captureAuthCalls(() => localLogin(fx, "v229118keys", "wrong-pass-118", loginIp));
  const localLimits = new Map(local.bodies.map((body) => [body.p_key, body.p_limit]));
  eq(localLimits.get(fingerprint(`auth|ip|/my/local-login-admission|${loginIp}`)), 40, "S-1 7 로그인 입장 제한: 키·한도(40) 그대로");
  eq(localLimits.get(fingerprint(`auth|subject-client|/my/local-login|${loginIp}|v229118keys|${loginIp}|${UA.toLowerCase()}`)), 8, "S-1 7 로그인 ‘IP|이름|클라이언트’ 횟수: 키·한도(8) 그대로");
  eq(localLimits.get(fingerprint(`auth|account|/my/local-login|${loginIp}|v229118keys`)), 10, "S-1 7 로그인 ‘IP|이름’ 횟수: 키·한도(10) 그대로");
  // 같은 IPv4 에서 User-Agent 만 바꿔도 관리자 9번째는 예전처럼 막힌다.
  freshLimiter(fx);
  const statuses = [];
  for (let n = 1; n <= 9; n += 1) statuses.push((await adminLogin(fx, "wrong", "198.51.100.9", `QA-Agent-${n}/118`)).status);
  eq(statuses.join(","), "401,401,401,401,401,401,401,401,429", "S-1 7 같은 IPv4 의 관리자 9번째는 예전처럼 429");
}));
await section("S-1 새 키", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  await signup(fx, "v229118keys2", "pass-word-118f");
  freshLimiter(fx);
  const admin = await captureAuthCalls(() => adminLogin(fx, "wrong", "198.51.100.10"));
  eq(admin.bodies.length, 4, "S-1 7b 관리자 로그인 한 번은 시도 제한 네 범위(예전 셋 + 관리자 전체 횟수)");
  eq(admin.bodies.find((body) => body.p_key === ADMIN_WIDE)?.p_limit, 50, "S-1 7b 관리자 전체 횟수 기본 한도 50");
  const local = await captureAuthCalls(() => localLogin(fx, "v229118keys2", "wrong-pass-118", "198.51.100.11"));
  eq(local.bodies.length, 4, "S-1 7b 로그인 한 번은 시도 제한 네 범위(예전 셋 + 이름 전체 횟수)");
  eq(local.bodies.find((body) => body.p_key === nameWide("v229118keys2"))?.p_limit, 50, "S-1 7b 이름 전체 횟수 기본 한도 50");
  // 변수 범위: 10~50(운영 함수가 50 위를 자른다), 숫자가 아니면 기본 50, 소수는 반올림.
  for (const [value, expected] of [["5", 10], ["500", 50], ["25", 25], ["abc", 50], ["12.6", 13]]) {
    fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = value;
    globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
    const run = await captureAuthCalls(() => adminLogin(fx, "wrong", `198.51.100.${20 + expected}`));
    eq(run.bodies.find((body) => body.p_key === ADMIN_WIDE)?.p_limit, expected, `S-1 7b AUTH_ACCOUNT_GLOBAL_RATE_LIMIT=${value} → 한도 ${expected}`);
  }
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// S-2 방 단추 바로 열기(V105)의 세션 범위
// ═════════════════════════════════════════════════════════════════════════════════════
const hex66 = (label) => createHash("sha256").update(label).digest("hex") + "ab";
const SECRET = "room-open-secret-v229118";
const DAY = "2026-11-12";
const ROOM = hex66("v229118-room-a");
const U1 = hex66("v229118-user-1");
const U2 = hex66("v229118-user-2");
const INAPP = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 KAKAOTALK 10.8.0";
const PC = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36";
const KAKAO_ENV = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", PUBLIC_BASE_URL: BASE, KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, KAKAO_ACCOUNT_LINK_ENABLED: "1" };
const PROBE = "kakao_room_open_probe_v229105:";
const ROOM_HOUSEHOLD_NAME = "이 방의 공동 가계부";
const APP_DIRECT = { "sec-fetch-site": "none" };
const IDENTITY_READ = "GET /rest/v1/accountbook_user_identities";

function resetIsolateState() {
  for (const name of ["__AB_KAKAO_ROOM_OPEN_PROBE", "__AB_KAKAO_APP_USER_ID_PROBE", "__AB_EFFECTIVE_USER_CACHE", "__AB_KAKAO_INFLIGHT", "__AB_KAKAO_REPEAT_GUARD", "__AB_TRAFFIC_BUCKETS"]) globalThis[name]?.clear?.();
  const cache = globalThis.__AB_KAKAO_ACCOUNT_LINK_OFFERS_CACHE;
  if (cache) { cache.at = 0; cache.value = null; }
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

function payloadFor(utterance, { user, room = "" }) {
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  if (room) userRequest.chat = { id: room, type: "botGroupKey", properties: { botGroupKey: room } };
  return { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
}

async function sayRaw(fx, utterance, options) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-kakao-skill-secret": SECRET },
    body: JSON.stringify(payloadFor(utterance, options)),
  }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  for (let round = 0; round < 5 && jobs.length; round += 1) await Promise.allSettled(jobs.splice(0));
  return JSON.parse(raw);
}

// 브라우저 한 번의 요청(따라가지 않는다). waitUntil 일(진단 기록)은 끝까지 기다린다.
async function go(fx, path, { ua = INAPP, cookie = "", headers = {} } = {}) {
  const jobs = [];
  const requestHeaders = { "user-agent": ua, accept: "text/html", "sec-fetch-mode": "navigate", ...(cookie ? { cookie } : {}), ...headers };
  const response = await app.fetch(new Request(new URL(path, BASE).href, { headers: requestHeaders }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  await Promise.allSettled(jobs);
  const cookies = typeof response.headers.getSetCookie === "function" ? response.headers.getSetCookie() : [];
  return { status: response.status, location: response.headers.get("location") || "", cookies, html: await response.text() };
}
// DB(픽스처 Supabase) 요청을 세면서 한 번 요청한다.
async function countedGo(fx, path, options) {
  const seen = [];
  const restore = intercept(async ({ url, method }) => {
    if (url.hostname === "mock.supabase.co") seen.push(`${method} ${url.pathname}`);
    return null;
  });
  try {
    return { ...(await go(fx, path, options)), seen };
  } finally {
    restore();
  }
}

const tapped = (path, { user = U1, room = ROOM, appUserId = "1801267359" } = {}) => {
  const url = new URL(path, BASE);
  if (user !== null) url.searchParams.set("botUserKey", user);
  if (appUserId) url.searchParams.set("appUserId", appUserId);
  if (room !== null) url.searchParams.set("botGroupKey", room);
  return `${url.pathname}${url.search}`;
};
const cookieLine = (cookies, name) => cookies.find((line) => line.startsWith(`${name}=`)) || "";
const sessionUser = (cookies) => { const line = cookieLine(cookies, "ab_user"); return line ? decodeURIComponent(line.split(";")[0].slice("ab_user=".length)).split("|")[0] : ""; };
const jarOf = (cookies) => cookies.filter((line) => !/Max-Age=0/i.test(line)).map((line) => line.split(";")[0]).join("; ");
const userByKey = (fx, key) => fx.db.users.find((user) => user.kakao_user_key === key);
const lastRoomOpen = () => events("kakao_room_open").at(-1)?.detail || "";
const strongIdentity = (userId, provider = "kakao") => provider === "kakao"
  ? { id: `ident-v229118-${userId}`, user_id: userId, provider: "kakao", provider_subject: "9118001", created_at: `${DAY}T01:00:00Z` }
  : { id: `ident-v229118-${userId}`, user_id: userId, provider: "local", provider_subject: "v229118room", credential_hash: "a".repeat(64), credential_salt: "b".repeat(32), credential_iterations: 100000, created_at: `${DAY}T01:00:00Z` };

// 방 가계부를 만든다: U1 이 ROOM 에서 첫 기록(→ 방 가계부·소유자), U2 가 같은 방에서 기록(→ 구성원). 둘 다 웹 자격이 없는 채팅 계정이다.
async function roomFixture(task) {
  return withClock(DAY, () => fixture(async (fx) => {
    resetIsolateState();
    fx.env.KAKAO_SKILL_SECRET = SECRET;
    Object.assign(fx.env, KAKAO_ENV);
    try {
      await sayRaw(fx, "점심 12000원", { user: U1, room: ROOM });
      await sayRaw(fx, "커피 4500원", { user: U2, room: ROOM });
      const u1 = userByKey(fx, U1);
      const u2 = userByKey(fx, U2);
      const household = fx.db.households.find((row) => row.name === ROOM_HOUSEHOLD_NAME && fx.db.household_members.some((m) => m.household_id === row.id && m.user_id === u1?.id && m.role === "owner"));
      ok(u1?.id && u2?.id && household?.id, "S-2 준비: 방 첫 기록으로 방 가계부(소유자 U1)와 구성원 U2 가 생긴다");
      ok(!fx.db.accountbook_user_identities.some((row) => row.user_id === u1.id || row.user_id === u2.id), "S-2 준비: 두 채팅 계정에는 강한 식별(카카오 로그인·비밀번호)이 없다");
      resetIsolateState();
      return await task(fx, { u1, u2, household, hh: encodeURIComponent(household.id) });
    } finally {
      resetIsolateState();
    }
  }));
}

// ── S-2 0. 소스 ────────────────────────────────────────────────────────────────
await section("S-2 소스", async () => {
  const mod = read("src/modules/auth/kakao-room-open.js");
  const code = mod.split("\n").filter((line) => !line.trim().startsWith("//")).join("\n");
  const rawAt = code.indexOf("if (!identity.raw)");
  const keptAt = code.indexOf('finish("session_kept", plain)');
  const strongAt = code.indexOf("await kakaoRoomOpenHasStrongIdentity(env, identity.userId)");
  const sessionAt = code.indexOf("makeUserSession(env, identity.userId)");
  ok(rawAt > 0 && keptAt > rawAt && strongAt > keptAt && sessionAt > strongAt, "S-2 0 강한 식별 확인은 세션을 만들 길에서만, 세션 만들기 바로 앞에서 한다");
  ok(/accountbook_user_identities\?user_id=eq\.\$\{encodeURIComponent\(uid\)\}&select=provider&limit=1/.test(code), "S-2 0 강한 식별 표를 그 계정 한 줄만 읽는다");
  ok(!/ensureUser\(|persistIdentityAliases|createUser|method: "(?:POST|PATCH|DELETE)"/.test(code), "S-2 0 새 확인은 읽기만 한다(사용자·별칭을 만들거나 쓰지 않는다)");
});

// ── S-2 1. 보통 채팅 계정은 지금처럼 로그인 화면 없이 그 방 가계부 홈 ───────────────────────
await section("S-2 보통 채팅 계정", () => roomFixture(async (fx, { u1, u2, hh }) => {
  for (const [name, ua] of [["아이폰 인앱", INAPP], ["PC 브라우저", PC]]) {
    const first = await go(fx, tapped("/my"), { ua });
    eq(first.status, 303, `S-2 1 ${name}: 단추를 누르면 바로 넘긴다`);
    eq(first.location, `/app?household_id=${hh}`, `S-2 1 ${name}: 그 방 가계부 홈으로`);
    eq(sessionUser(first.cookies), u1.id, `S-2 1 ${name}: 누른 사람의 채팅 계정 세션(로그인 화면 없음)`);
    eq(lastRoomOpen(), "ok", `S-2 1 ${name}: 결과 ok`);
    const home = await go(fx, first.location, { ua, cookie: jarOf(first.cookies) });
    ok(home.status === 200 && home.html.includes(ROOM_HOUSEHOLD_NAME) && !home.html.includes('id="abKakaoStart"'), `S-2 1 ${name}: 그 방 가계부 홈이 바로 열린다`);
  }
  const member = await go(fx, tapped("/my", { user: U2 }));
  ok(sessionUser(member.cookies) === u2.id && member.location === `/app?household_id=${hh}`, "S-2 1 구성원(U2)도 그대로 열린다");
}));

// ── S-2 2. 카카오 로그인이 붙은 채팅 계정: 주소 값으로 세션을 주지 않고 인앱 자동 로그인 길로 ─────
await section("S-2 카카오 로그인 계정", () => roomFixture(async (fx, { u1, hh }) => {
  fx.db.accountbook_user_identities.push(strongIdentity(u1.id, "kakao"));
  const tap = await go(fx, tapped("/my"));
  eq(tap.status, 303, "S-2 2 넘긴다");
  eq(tap.location, `/app?household_id=${hh}`, "S-2 2 그 방 가계부 주소로만 보낸다(카카오 값 없음)");
  eq(tap.cookies.length, 0, "S-2 2 쿠키를 하나도 주지 않는다(예전에는 그 계정 세션을 줬다)");
  eq(lastRoomOpen(), "strong_account", "S-2 2 결과 strong_account");
  const next = await go(fx, tap.location);
  ok(next.status === 303 && next.location.startsWith("/auth/kakao/start?auto=1") && !sessionUser(next.cookies), "S-2 2 그 다음은 인앱 자동 로그인(그 카카오 계정으로 로그인하는 길)");
  const pc = await go(fx, tapped("/my"), { ua: PC });
  ok(pc.status === 303 && pc.cookies.length === 0 && lastRoomOpen() === "strong_account", "S-2 2 PC 브라우저에서도 세션을 주지 않는다");
  const probe = JSON.parse(settingValue(fx, `${PROBE}strong_account`) || "{}");
  eq(Object.keys(probe).sort().join(","), "app_version,at,version", "S-2 2 진단 기록 칸 strong_account 에는 시각·판만 남는다(식별자 없음)");
  ok(!JSON.stringify(globalThis.__AB_OPS_EVENTS || []).includes(U1), "S-2 2 운영 이벤트에 botUserKey 가 없다");
}));

// ── S-2 3. 로그인 이름·비밀번호가 붙은 채팅 계정도 같다. 같은 방의 보통 계정은 그대로 ───────────
await section("S-2 비밀번호 계정", () => roomFixture(async (fx, { u1, u2, hh }) => {
  fx.db.accountbook_user_identities.push(strongIdentity(u2.id, "local"));
  const tap = await go(fx, tapped("/my", { user: U2 }));
  ok(tap.status === 303 && tap.location === `/app?household_id=${hh}` && tap.cookies.length === 0, "S-2 3 비밀번호 로그인이 있는 계정은 세션 없이 방 가계부 주소로");
  eq(lastRoomOpen(), "strong_account", "S-2 3 결과 strong_account");
  const plain = await go(fx, tapped("/my", { user: U1 }));
  eq(sessionUser(plain.cookies), u1.id, "S-2 3 같은 방의 보통 채팅 계정(U1)은 그대로 바로 열린다");
  eq(lastRoomOpen(), "ok", "S-2 3 U1 결과 ok");
}));

// ── S-2 4. 이미 세션이 있을 때 ─────────────────────────────────────────────────────
await section("S-2 다른 세션", () => roomFixture(async (fx, { u1, u2, hh }) => {
  fx.db.accountbook_user_identities.push(strongIdentity(u1.id, "kakao"));
  // 이 방 가계부를 못 읽는 다른 웹 계정(user-bin) 세션 + 앱에서 바로 연 이동: 예전에는 누른 사람 세션으로 바꿨다.
  const other = await go(fx, tapped("/my"), { cookie: fx.cookie, headers: APP_DIRECT });
  ok(other.status === 303 && other.location === "/my" && !cookieLine(other.cookies, "ab_user"), "S-2 4 다른 계정 세션은 강한 식별 계정으로 바꾸지 않고 카카오 값만 뺀다");
  eq(lastRoomOpen(), "strong_other_session", "S-2 4 결과 strong_other_session");
  // 같은 사람·이 방 구성원 세션은 예전 그대로다.
  const own = await go(fx, tapped("/my"), { cookie: await fx.cookieFor(u1.id) });
  ok(own.location === `/app?household_id=${hh}` && !cookieLine(own.cookies, "ab_user") && lastRoomOpen() === "same_session", "S-2 4 이미 그 계정 세션이면 그대로 방 가계부 홈(same_session)");
  const member = await go(fx, tapped("/my"), { cookie: await fx.cookieFor(u2.id) });
  ok(member.location === `/app?household_id=${hh}` && !cookieLine(member.cookies, "ab_user") && lastRoomOpen() === "member_session", "S-2 4 이 방 구성원 세션이면 그대로 방 가계부 홈(member_session)");
  const kept = await go(fx, tapped("/my"), { cookie: fx.cookie });
  ok(kept.location === "/my" && !cookieLine(kept.cookies, "ab_user") && lastRoomOpen() === "session_kept", "S-2 4 앱에서 바로 연 이동이 아니면 예전처럼 session_kept");
}));

// ── S-2 5. 강한 식별을 읽지 못하면 열지 않는다 ──────────────────────────────────────────
await section("S-2 읽기 실패", () => roomFixture(async (fx, { u1 }) => {
  const restore = intercept(async ({ url, method }) => (method === "GET" && url.pathname === "/rest/v1/accountbook_user_identities" ? failure(503) : null));
  try {
    const tap = await go(fx, tapped("/my"));
    ok(tap.status === 303 && tap.location === "/my" && !sessionUser(tap.cookies), "S-2 5 강한 식별 표를 못 읽으면 세션을 주지 않고 카카오 값만 뺀다");
    ok(lastRoomOpen().startsWith("lookup_failed"), "S-2 5 결과 lookup_failed");
  } finally {
    restore();
  }
  const again = await go(fx, tapped("/my"));
  ok(sessionUser(again.cookies) === u1.id && lastRoomOpen() === "ok", "S-2 5 읽기가 돌아오면 보통 계정은 다시 바로 열린다");
}));

// ── S-2 6. DB 호출과 기존 차단 조건 ──────────────────────────────────────────────────
// 실측(2026-11-12): 보통 계정 한 번 누름 = 10회(진단 기록 쓰기 포함, 그중 강한 식별 읽기 1회 — 보강 전 9회). 요청 예산은 50.
const ROOM_OPEN_DB_CAP = 12;
await section("S-2 DB 호출·기존 차단", () => roomFixture(async (fx, { u1, household }) => {
  resetIsolateState();
  const plain = await countedGo(fx, tapped("/my"));
  eq(lastRoomOpen(), "ok", "S-2 6 보통 계정 ok");
  eq(plain.seen.filter((line) => line === IDENTITY_READ).length, 1, "S-2 6 보통 계정: 강한 식별 읽기는 한 번");
  ok(plain.seen.length <= ROOM_OPEN_DB_CAP, `S-2 6 보통 계정 한 번 누름의 DB 호출 ${plain.seen.length}회 ≤ ${ROOM_OPEN_DB_CAP}(요청 예산 50)`);
  fx.db.accountbook_user_identities.push(strongIdentity(u1.id, "kakao"));
  resetIsolateState();
  const strong = await countedGo(fx, tapped("/my"));
  eq(lastRoomOpen(), "strong_account", "S-2 6 강한 식별 계정 strong_account");
  eq(strong.seen.filter((line) => line === IDENTITY_READ).length, 1, "S-2 6 강한 식별 계정: 강한 식별 읽기는 한 번");
  ok(strong.seen.length <= plain.seen.length, `S-2 6 강한 식별 계정의 DB 호출 ${strong.seen.length}회 ≤ 보통 계정 ${plain.seen.length}회(세션·안내 쿠키 읽기를 하지 않는다)`);
  // 기존 차단 조건은 그대로이고 강한 식별을 읽기 전에 끝난다.
  const blocks = [
    ["링크 미리보기 수집기", tapped("/my"), { ua: "facebookexternalhit/1.1; kakaotalk-scrap/1.0; +https://devtalk.kakao.com/docs/latest/kakaotalk-link-scrap" }, "crawler"],
    ["값 중복", `/my?botUserKey=${U1}&botUserKey=${U1}&botGroupKey=${ROOM}`, {}, "duplicate_values"],
  ];
  for (const [name, path, options, result] of blocks) {
    const blocked = await countedGo(fx, path, options);
    ok(blocked.location === "/my" && !sessionUser(blocked.cookies) && lastRoomOpen() === result, `S-2 6 ${name}: 예전처럼 열지 않는다(${result})`);
    eq(blocked.seen.filter((line) => line === IDENTITY_READ).length, 0, `S-2 6 ${name}: 강한 식별을 읽지 않는다`);
  }
  const publicPath = await countedGo(fx, tapped("/privacy"));
  ok(publicPath.status === 303 && publicPath.location === "/privacy" && publicPath.seen.length === 0, "S-2 6 공개 주소: 예전처럼 값만 지우고 DB 를 읽지 않는다");
  const blockedKey = hex66("v229118-user-blocked");
  fx.db.users.push({ id: "user-v229118-blocked", kakao_user_key: blockedKey, nickname: "제한", created_at: `${DAY}T01:00:00Z` });
  fx.db.household_members.push({ household_id: household.id, user_id: "user-v229118-blocked", role: "blocked", created_at: `${DAY}T01:00:00Z` });
  const blockedMember = await countedGo(fx, tapped("/my", { user: blockedKey }));
  ok(blockedMember.location === "/my" && !sessionUser(blockedMember.cookies) && lastRoomOpen() === "not_member", "S-2 6 이용 제한 구성원: 예전처럼 열지 않는다(not_member)");
  eq(blockedMember.seen.filter((line) => line === IDENTITY_READ).length, 0, "S-2 6 이용 제한 구성원: 강한 식별을 읽지 않는다");
}));

// ═════════════════════════════════════════════════════════════════════════════════════
// O-4 배포 도구 되돌리기 안전장치
// ═════════════════════════════════════════════════════════════════════════════════════
const CF_ACCOUNT = "0123456789abcdef0123456789abcdef";
const CF_TOKEN = "qa-token-v229118";
const CF_PREFIX = `/client/v4/accounts/${CF_ACCOUNT}/workers/scripts/kakao-accountbook`;
const DEPLOY_ORIGIN = "https://qa-deploy.invalid";
const FLOOR_ID = "ac5f2a4b-de71-46a5-94cc-92b1743a3d8b";
const LIVE_ID = "11111111-1111-4111-8111-111111111111";
const PRE_SEOUL_ID = "33333333-3333-4333-8333-333333333332"; // 서울 전환 직전 버전처럼(#332, 옛 시드니 Secret)
const LATER_ID = "44444444-4444-4444-8444-444444444346"; // 서울 전환 뒤 버전처럼(#346)
const RUNNABLE_ROLLBACK = /--rollback\s+[0-9a-f]{8}-[0-9a-f]{4}-/;

function rollbackFake(target, { ready = "ok" } = {}) {
  const calls = [];
  const resources = {
    bindings: [{ name: "APP_NAME", type: "plain_text", text: "말해가계부" }, { name: "SUPABASE_SERVICE_ROLE_KEY", type: "secret_text" }],
    script: { etag: "etag-qa", handlers: ["fetch", "scheduled"], named_handlers: [] },
    script_runtime: { compatibility_date: "2026-06-16", compatibility_flags: [], usage_model: "standard" },
  };
  const versions = new Map([
    [LIVE_ID, { id: LIVE_ID, number: 349, metadata: { created_on: "2026-11-10T06:15:19Z", source: "api" }, resources: structuredClone(resources) }],
    [target.id, { resources: structuredClone(resources), ...structuredClone(target) }],
  ]);
  const deployments = [{ id: "deployment-live", versions: [{ version_id: LIVE_ID, percentage: 100 }] }];
  const reply = (status, body) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  const success = (result) => reply(200, { success: true, errors: [], messages: [], result });
  async function fetch(url, init = {}) {
    const address = new URL(String(url));
    const method = String(init.method || "GET").toUpperCase();
    calls.push({ method, origin: address.origin, path: address.pathname });
    if (address.origin === DEPLOY_ORIGIN && address.pathname === "/health") return reply(200, { alive: true, version: "V-QA", missing_count: 0 });
    if (address.origin === DEPLOY_ORIGIN && address.pathname === "/ready") {
      return ready === "ok" ? reply(200, { ok: true, ready: true, failed_tables: [], missing_rpcs: [] }) : reply(503, { ok: false, ready: false, failed_tables: ["users", "transactions"], missing_rpcs: [] });
    }
    if (address.origin !== "https://api.cloudflare.com" || !address.pathname.startsWith(CF_PREFIX)) throw new Error(`가짜 API: 예상 밖 요청 ${method} ${address.href}`);
    const path = address.pathname.slice(CF_PREFIX.length);
    if (method === "GET" && path === "/deployments") return success({ deployments: structuredClone(deployments) });
    if (method === "GET" && path.startsWith("/versions/")) {
      const version = versions.get(path.slice("/versions/".length));
      return version ? success(structuredClone(version)) : reply(404, { success: false, errors: [{ code: 10007, message: "version not found" }], messages: [], result: null });
    }
    if (method === "POST" && path === "/deployments") {
      const body = JSON.parse(String(init.body || "{}"));
      const deployment = { id: `deployment-${calls.length}`, versions: body.versions };
      deployments.unshift(deployment);
      return success(structuredClone(deployment));
    }
    throw new Error(`가짜 API: 길 없음 ${method} ${path}`);
  }
  return { fetch, calls };
}

async function rollback(target, { extra = [], ready = "ok" } = {}) {
  const fake = rollbackFake(target, { ready });
  const logs = [];
  const files = new Map();
  const deps = {
    root: process.cwd(),
    env: { CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT },
    fetch: fake.fetch,
    now: () => new Date("2026-11-12T03:00:00.000Z"),
    sleep: async () => {},
    log: (line) => logs.push(String(line)),
    error: (line) => logs.push(String(line)),
    mkdir: () => {},
    writeFile: (path, data) => files.set(String(path), String(data)),
    exists: () => false,
    readFile: () => { throw new Error("되돌리기는 로컬 파일을 읽지 않는다"); },
    listDirectories: () => [],
    git: { head: () => "a".repeat(40), trackedChanges: () => [] },
    build: () => ({ text: "" }),
    runPublicChecks: () => { throw new Error("되돌리기는 공개 검사를 돌리지 않는다"); },
  };
  const code = await deployTool.runDeploy(["--rollback", target.id, "--origin", DEPLOY_ORIGIN, ...extra], deps);
  const record = [...files.entries()].find(([path]) => path.includes(`rollback-${target.id}`));
  return { code, output: logs.join("\n"), calls: fake.calls, record: record ? JSON.parse(record[1]) : null };
}
const PRE_SEOUL = { id: PRE_SEOUL_ID, number: 332, metadata: { created_on: "2026-11-05T08:28:20.551000Z", source: "api" } };
const LATER = { id: LATER_ID, number: 346, metadata: { created_on: "2026-11-09T01:02:43.120000Z", source: "api" } };

await section("O-4 소스", async () => {
  const tool = read("tools/deploy-worker-version.mjs");
  ok(!/--rollback \$\{/.test(tool), "O-4 0 도구 소스에 되돌리기 명령 줄을 만드는 곳이 없다(예전: 승격 뒤 ‘--rollback <이전 id>’ 출력)");
  ok(tool.includes("(기록만): ${previousId}"), "O-4 0 이전 버전은 ‘(기록만): <id>’ 로만 적는다");
});

await section("O-4 하한 판정", async () => {
  const floor = deployTool.ROLLBACK_FLOORS?.["kakao-accountbook"];
  eq(`${floor?.versionId}|${floor?.number}|${floor?.createdOn}`, `${FLOOR_ID}|333|2026-11-05T10:07:18.932265Z`, "O-4 1 하한은 서울 DB 전환 버전 #333(만든 시각은 실제 업로드 기록의 값)");
  eq(typeof deployTool.rollbackFloorProblem, "function", "O-4 1 하한 판정 함수가 있다");
  const problem = (version, versionId = PRE_SEOUL_ID) => deployTool.rollbackFloorProblem({ script: "kakao-accountbook", versionId, version });
  ok(problem(PRE_SEOUL), "O-4 1 #332(서울 전환 직전)는 앞선 버전");
  eq(problem({ number: 333, metadata: { created_on: floor?.createdOn } }, FLOOR_ID), null, "O-4 1 하한 버전 자신은 된다");
  eq(problem(LATER, LATER_ID), null, "O-4 1 하한 뒤 버전은 된다");
  ok(problem({ metadata: {} }, LATER_ID), "O-4 1 번호·만든 시각을 못 읽으면 거절 쪽");
});

await section("O-4 하한 거절", async () => {
  const refused = await rollback(PRE_SEOUL);
  eq(refused.code, 1, "O-4 2 서울 전환 앞 버전으로는 되돌리지 않는다(종료 코드 1)");
  eq(refused.calls.filter((call) => call.method === "POST").length, 0, "O-4 2 배포 요청을 보내지 않는다");
  ok(/시드니/.test(refused.output) && refused.output.includes("--allow-pre-seoul-db"), "O-4 2 이유(옛 시드니 Secret)와 일부러 넘기는 플래그 이름을 알린다");
  ok(!refused.record && !RUNNABLE_ROLLBACK.test(refused.output), "O-4 2 기록을 만들지 않고, 출력에 되돌리기 명령 줄이 없다");
  const forced = await rollback(PRE_SEOUL, { extra: ["--allow-pre-seoul-db"] });
  eq(forced.code, 0, "O-4 2 플래그를 일부러 쓰면 넘긴다");
  ok(/경고/.test(forced.output) && forced.record?.floor?.overridden === true, "O-4 2 넘길 때는 경고와 기록이 남는다");
});

await section("O-4 /ready 와 출력", async () => {
  const done = await rollback(LATER);
  eq(done.code, 0, "O-4 3 하한 뒤 버전으로 되돌린다");
  const paths = done.calls.filter((call) => call.origin === DEPLOY_ORIGIN).map((call) => call.path);
  ok(paths.includes("/ready") && paths.lastIndexOf("/health") < paths.indexOf("/ready"), "O-4 3 되돌린 뒤 /health 다음에 /ready 를 본다");
  eq(paths.filter((path) => path === "/ready").length, deployTool.READY_CONSECUTIVE ?? -1, "O-4 3 /ready 를 연속으로 확인한다");
  ok(done.output.includes(`되돌리기 전 배포 버전(기록만): ${LIVE_ID}`), "O-4 3 되돌리기 전 버전은 id 만 기록으로 적는다");
  ok(!RUNNABLE_ROLLBACK.test(done.output), "O-4 3 출력에 실행할 수 있는 되돌리기 명령 줄이 없다");
  ok(done.record?.ready?.ok === true && done.record?.floor?.ok === true, "O-4 3 되돌리기 기록에 /ready 결과와 하한 통과가 남는다");
  const down = await rollback(LATER, { ready: "down" });
  eq(down.code, 1, "O-4 3 /ready 가 ok 가 아니면 실패로 보고한다(/health 는 살아 있어도)");
  ok(/[/]ready 가 \d+번 연속 ok 가 아닙니다/.test(down.output) && /DB 를 쓸 수 없는 버전일 수 있습니다/.test(down.output), "O-4 3 무엇이 실패했는지 알린다");
  ok(!RUNNABLE_ROLLBACK.test(down.output) && down.output.includes(`되돌리기 전 배포 버전(기록만): ${LIVE_ID}`), "O-4 3 실패해도 명령 줄 없이 id 만 적는다");
  ok(down.record?.ready?.ok === false && down.record?.failures?.length === 1, "O-4 3 되돌리기 기록에 /ready 실패가 남는다");
  eq(down.calls.filter((call) => call.method === "POST").length, 1, "O-4 3 실패해도 스스로 다시 배포하지 않는다");
});

if (failedSections.length) {
  throw new Error(`V22.9.118 보안 보강 검사 실패 ${failedSections.length}건:\n- ${failedSections.join("\n- ")}`);
}
const checks = t.done();
if (checks < 150) throw new Error(`검사 수가 너무 적다: ${checks}`);
