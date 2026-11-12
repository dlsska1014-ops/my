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
// 후속(독립 검토 반영, 2026-11-12):
//  P2-1 방 단추의 강한 식별은 계정 잇기·본인 확인과 같은 두 종류(provider kakao·local)만 센다 — 다른 종류의 행만 있는 채팅 계정은 지금처럼 바로 열린다.
//  P2-2 계정 전체 횟수는 AUTH_ACCOUNT_GLOBAL_RATE_LIMIT=off(또는 0)로 끌 수 있다(세고 이벤트는 남기되 막지 않는다).
//  P3-1 IPv6 /64 묶기는 비밀번호를 대조하는 길(관리자 로그인·로그인 이름 로그인·비밀번호 재확인)에만 — 가입·방 단추·웹 연결 코드는 주소 그대로.
//  P3-2 운영 이벤트는 허용에서 막힘으로 바뀐 첫 응답에 한 번(운영 함수가 돌려주는 횟수에 기대지 않는다).
//  P3-3 로그인 이름 비밀번호만 붙은 채팅 계정은 카카오 자동 로그인이 아니라 로그인 이름 칸을 연 보통 로그인 화면으로 간다.
//  P3-4 되돌린 뒤 /health·/ready 는 배포 전 판의 응답과 다시 쓴 /ready(cached)를 세지 않는다.
// 재검토(같은 날, 후속 커밋 검토):
//  P2  판 이름이 같은 버전으로 되돌리면 늘 실패하고 /ready 를 보지 않았다 → 경고로 남기고(배포 API 로 확인한 활성 version id 를 함께) 판 제외 없이
//      /health 연속 확인과 /ready 로 종료 코드를 정한다.
//  P3  다시 쓴 /ready 는 ok 가 아니면 ‘준비 안 됨’, ok 면 checked_at 이 배포 요청 뒤일 때만 센다(칸이 없으면 예전처럼 기다린다).
//  P3  끄기 값: off·false·no·none·disabled 또는 0 이하 숫자(00·0.0·-0·음수)는 끔, 그 밖의 숫자 아닌 글자는 기본 50 + 운영 이벤트 warn(isolate 당 한 번).
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

function freshLimiter(fx, { enforce = true } = {}) {
  fx.db.__enforce_auth_rate = enforce;
  fx.db.__auth_attempts = new Map();
  globalThis.__AB_TRAFFIC_BUCKETS?.clear?.();
  globalThis.__AB_AUTH_WIDE_BLOCKED?.clear?.();
  delete globalThis.__AB_AUTH_WIDE_SETTING_WARNED;
  if (Array.isArray(globalThis.__AB_OPS_EVENTS)) globalThis.__AB_OPS_EVENTS.length = 0;
}

async function formPost(fx, path, values, { ip = "", ua = UA, cookie = "" } = {}) {
  const response = await app.fetch(new Request(`${BASE}${path}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "user-agent": ua, ...(ip ? { "cf-connecting-ip": ip } : {}), ...(cookie ? { cookie } : {}) },
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

// 시도 제한 RPC 요청 본문을 모은다. failKey 가 주어지면 그 키의 요청만 실패(503)시킨다. answer(body) 가 값을 돌려주면 그 키의 응답을 그 값으로 바꾼다.
const rpcAnswer = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
async function captureAuthCalls(task, { failKey = "", answer = null } = {}) {
  const bodies = [];
  const restore = intercept(async ({ url, method, init }) => {
    if (method !== "POST" || url.pathname !== "/rest/v1/rpc/accountbook_auth_attempt") return null;
    const body = JSON.parse(String(init?.body || "{}"));
    bodies.push(body);
    if (failKey && body.p_key === failKey) return failure(503);
    const replaced = answer ? answer(body) : null;
    return replaced ? rpcAnswer(replaced) : null;
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
  ok(/String\(env\?\.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT \?\? ""\)/.test(cryptoSource) && /boundedRuntimeNumber\(number, 50, 10, 50\)/.test(cryptoSource), "S-1 0 전체 횟수 한도는 변수로 바꿀 수 있다(기본 50, 10~50 — 운영 함수가 50 위를 자른다)");
  ok(/new Set\(\["off", "false", "no", "none", "disabled"\]\)/.test(cryptoSource) && /number <= 0 \? \{ enforce: false/.test(cryptoSource), "S-1 0 끄기는 off·false·no·none·disabled 또는 0 이하 숫자(독립 검토 P2-2, 재검토 P3)");
  ok(/scope === "ip" \? \(options\.groupIpv6 \? authAttemptNetwork\(request\) : trafficClientIp\(request\)\)/.test(cryptoSource), "S-1 0 ip 범위는 groupIpv6 로 부를 때만 IPv6 를 /64 로 묶는다(그 밖은 주소 그대로, 독립 검토 P3-1)");
  ok(!/Number\(result\.attempts\) === limit \+ 1/.test(cryptoSource), "S-1 0 운영 이벤트가 운영 함수가 돌려준 횟수(한도 + 1)에 기대지 않는다(독립 검토 P3-2)");
  // /64 묶기를 쓰는 곳은 비밀번호를 대조하는 세 길뿐이다.
  const reauthSource = read("src/modules/auth/identity-reauth.js");
  const grouped = (source) => (source.match(/groupIpv6: true/g) || []).length;
  eq(grouped(adminSource), 3, "S-1 0 관리자 로그인: 입장·IP 횟수·성공 뒤 지우기 셋이 /64 묶기");
  eq(grouped(reauthSource), 4, "S-1 0 비밀번호 재확인: 입장·IP 횟수·지우기 둘이 /64 묶기");
  ok(/"\/my\/local-login-admission", false, \{ limit: 40, groupIpv6: true \}/.test(loginSource), "S-1 0 로그인 이름 로그인: 입장 제한이 /64 묶기");
  ok(/"\/my\/local-signup", false, \{ scope: "ip", limit: boundedRuntimeNumber\(env\.AUTH_SIGNUP_IP_LIMIT, 20, 5, 200\) \}\)/.test(loginSource), "S-1 0 가입의 IP 상한은 예전 그대로(주소 그대로)");
  for (const path of ["src/modules/auth/kakao-room-open.js", "src/modules/auth/kakao-web-claim.js", "src/modules/auth/kakao-oauth.js"]) {
    ok(!read(path).includes("groupIpv6"), `S-1 0 ${path.split("/").pop()}: IP 단위 제한은 주소 그대로(/64 로 묶지 않는다)`);
  }
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

// ── S-1 8. IPv6 /64 묶기는 비밀번호를 대조하는 길에만(독립 검토 P3-1) ─────────────────────────
const V6_RAW = "2001:db8:5a5:1::77";
const V6_NET = "2001:db8:5a5:1::/64";
await section("S-1 /64 는 비밀번호 길만", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  await signup(fx, "v229118net", "pass-word-118g");
  freshLimiter(fx, { enforce: false });
  const keysOf = (bodies) => new Set(bodies.map((body) => body.p_key));
  // 비밀번호를 대조하는 길: /64 하나로 센다.
  const admin = keysOf((await captureAuthCalls(() => adminLogin(fx, "wrong", V6_RAW))).bodies);
  ok(admin.has(fingerprint(`auth|ip|/login-admission|${V6_NET}`)) && admin.has(fingerprint(`auth|ip|/login|${V6_NET}`)), "S-1 8 관리자 로그인: 입장·IP 횟수는 /64 하나로 센다");
  const local = keysOf((await captureAuthCalls(() => localLogin(fx, "v229118net", "wrong-pass-118", V6_RAW))).bodies);
  ok(local.has(fingerprint(`auth|ip|/my/local-login-admission|${V6_NET}`)) && local.has(fingerprint(`auth|account|/my/local-login|${V6_NET}|v229118net`)), "S-1 8 로그인 이름 로그인: 입장·‘주소|이름’ 은 /64 하나로 센다");
  const reauth = await captureAuthCalls(() => formPost(fx, "/my/account-reauth", { current_password: "wrong-pass-118" }, { ip: V6_RAW, cookie: fx.cookie }));
  const reauthKeys = keysOf(reauth.bodies);
  ok(reauth.result.status === 303 && reauthKeys.has(fingerprint(`auth|ip|/my/password-reauth-admission|${V6_NET}`)) && reauthKeys.has(fingerprint(`auth|ip|/my/password-reauth|${V6_NET}`)), "S-1 8 비밀번호 재확인: 입장·IP 횟수는 /64 하나로 센다");
  // 그 밖의 IP 단위 제한: 예전처럼 주소 그대로(같은 /64 뒤의 다른 사람과 묶지 않는다).
  const signupRun = await captureAuthCalls(() => formPost(fx, "/my/local-signup", { login_name: "v229118net2", display_name: "넷", access_code: "pass-word-118h", access_code_confirm: "pass-word-118h", consent: "1" }, { ip: V6_RAW }));
  const signupKeys = keysOf(signupRun.bodies);
  ok(signupRun.result.status === 303 && signupKeys.has(fingerprint(`auth|ip|/my/local-signup|${V6_RAW}`)) && !signupKeys.has(fingerprint(`auth|ip|/my/local-signup|${V6_NET}`)), "S-1 8 가입의 IP 상한은 주소 그대로 센다");
  const claimRun = await captureAuthCalls(() => formPost(fx, "/my/kakao-claim", { kakao_claim_code: "ABCDEFGH".repeat(4) }, { ip: V6_RAW }));
  const claimKeys = keysOf(claimRun.bodies);
  ok(claimKeys.has(fingerprint(`auth|ip|/my/kakao-claim-admission|${V6_RAW}`)) && !claimKeys.has(fingerprint(`auth|ip|/my/kakao-claim-admission|${V6_NET}`)), "S-1 8 웹 연결 코드 입장 제한은 주소 그대로 센다");
}));

// ── S-1 9. 계정 전체 횟수 끄기(독립 검토 P2-2: 남이 일부러 채워 잠근 계정을 운영자가 바로 푼다) ─────────
await section("S-1 전체 횟수 끄기", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = "off";
  freshLimiter(fx);
  const statuses = [];
  const run = await captureAuthCalls(async () => {
    for (let n = 1; n <= 52; n += 1) {
      const block = 0x400 + Math.floor((n - 1) / 8);
      statuses.push((await adminLogin(fx, `wrong-password-${n}`, v6(block, ((n - 1) % 8) + 1))).status);
    }
  });
  ok(statuses.every((status) => status === 401), "S-1 9 off: 전체 50번을 넘겨도 막지 않는다(틀린 비밀번호는 401 그대로)");
  eq(attemptsOf(fx, ADMIN_WIDE), 52, "S-1 9 off: 전체 횟수는 그대로 센다");
  ok(run.bodies.filter((body) => body.p_key === ADMIN_WIDE).every((body) => body.p_limit === 50), "S-1 9 off: 세는 한도는 50");
  const reached = events("auth_account_limit_reached");
  eq(reached.length, 1, "S-1 9 off: 막힐 자리에 운영 이벤트는 한 번 남긴다");
  eq(reached[0]?.detail, "limit 50, window 900s, off (not blocking)", "S-1 9 off: 이벤트에 끈 상태가 보인다");
  const right = await adminLogin(fx, ADMIN_PASSWORD, v6(0x4ff, 1));
  ok(right.status === 303 && right.setCookie.startsWith("ab_admin="), "S-1 9 off: 차 있어도 맞는 비밀번호로 들어간다(막힌 계정을 푸는 길)");
  eq(attemptsOf(fx, ADMIN_WIDE), 0, "S-1 9 off: 로그인 성공은 전체 횟수를 지운다(다시 켜도 막혀 있지 않다)");
  // "0" 과 대문자·빈칸도 끔이다. 운영 함수가 막힘을 돌려주거나 읽지 못해도 막지 않는다.
  for (const value of ["0", " OFF "]) {
    fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = value;
    freshLimiter(fx, { enforce: false });
    const blocked = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "198.51.100.60"), { answer: (body) => (body.p_key === ADMIN_WIDE && !body.p_success ? { allowed: false, attempts: 77, blocked_until: "2026-11-12T03:15:00Z" } : null) });
    ok(blocked.result.status === 303 && blocked.result.setCookie.startsWith("ab_admin="), `S-1 9 ${JSON.stringify(value)}: 운영 함수가 막힘을 돌려줘도 막지 않는다`);
    freshLimiter(fx, { enforce: false });
    const failed = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "198.51.100.61"), { failKey: ADMIN_WIDE });
    ok(failed.result.status === 303, `S-1 9 ${JSON.stringify(value)}: 끈 동안은 전체 횟수를 읽지 못해도 막지 않는다`);
  }
  // 켜 두면(기본) 같은 막힘 응답은 429 다.
  delete fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT;
  freshLimiter(fx, { enforce: false });
  const on = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "198.51.100.62"), { answer: (body) => (body.p_key === ADMIN_WIDE && !body.p_success ? { allowed: false, attempts: 77, blocked_until: "2026-11-12T03:15:00Z" } : null) });
  eq(on.result.status, 429, "S-1 9 켜 두면(변수 없음) 같은 막힘 응답은 429");
}));

// ── S-1 10. 운영 이벤트는 허용 → 막힘으로 바뀐 첫 응답에 한 번(독립 검토 P3-2) ──────────────────────
await section("S-1 이벤트는 바뀔 때 한 번", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  freshLimiter(fx, { enforce: false });
  // 운영 함수가 막힌 뒤 횟수를 늘리지 않고(50) 또는 0 으로 돌려줘도 처음 막힐 때 한 번 남긴다.
  let state = { allowed: false, attempts: 50 };
  const answer = (body) => (body.p_key === ADMIN_WIDE && !body.p_success ? { ...state, blocked_until: "2026-11-12T03:15:00Z" } : null);
  const tries = async (count) => {
    const out = [];
    for (let n = 0; n < count; n += 1) out.push((await captureAuthCalls(() => adminLogin(fx, "wrong", `198.51.100.${70 + n}`), { answer })).result.status);
    return out;
  };
  eq((await tries(3)).join(","), "429,429,429", "S-1 10 막힘 응답이면 429");
  eq(events("auth_account_limit_reached").length, 1, "S-1 10 횟수가 그대로(50)여도 처음 막힐 때 이벤트 한 건(예전에는 한도 + 1 일 때만)");
  state = { allowed: true, attempts: 3 };
  eq((await tries(1)).join(","), "401", "S-1 10 허용 응답이면 예전처럼 비밀번호를 본다");
  state = { allowed: false, attempts: 0 };
  await tries(2);
  eq(events("auth_account_limit_reached").length, 2, "S-1 10 허용 뒤 다시 막히면 한 건 더(횟수 0 으로 돌려줘도)");
  // 막힘이 창(900초)보다 오래 이어지면 창마다 한 번.
  const memory = globalThis.__AB_AUTH_WIDE_BLOCKED;
  ok(memory instanceof Map && memory.size === 1 && [...memory.keys()].every((key) => key === "/login|admin"), "S-1 10 처음 막힌 때는 isolate 메모리에만(경로|계정 키)");
  for (const key of memory.keys()) memory.set(key, Date.now() - 901 * 1000);
  await tries(1);
  eq(events("auth_account_limit_reached").length, 3, "S-1 10 같은 막힘이 창보다 오래 이어지면 다시 한 건");
  await tries(1);
  eq(events("auth_account_limit_reached").length, 3, "S-1 10 그 창 안에서는 더 남기지 않는다");
  // 성공은 기억을 지운다.
  state = { allowed: true, attempts: 0 };
  const right = await captureAuthCalls(() => adminLogin(fx, ADMIN_PASSWORD, "198.51.100.90"), { answer });
  ok(right.result.status === 303 && memory.size === 0, "S-1 10 로그인 성공은 처음 막힌 때 기억을 지운다");
}));

// ── S-1 11. 끄기 값 읽기(재검토 P3: "00"·"0.0"·"-0" 이 숫자 0 으로 읽혀 하한 10 — 가장 엄한 한도 — 이 되던 것) ─────────────
await section("S-1 끄기 값", () => fixture(async (fx) => {
  Object.assign(fx.env, ADMIN_ENV);
  const blocked = (body) => (body.p_key === ADMIN_WIDE && !body.p_success ? { allowed: false, attempts: 77, blocked_until: "2026-11-12T03:15:00Z" } : null);
  let host = 120;
  const tryAs = async (value, password) => {
    fx.env.AUTH_ACCOUNT_GLOBAL_RATE_LIMIT = value;
    freshLimiter(fx, { enforce: false });
    const run = await captureAuthCalls(() => adminLogin(fx, password, `198.51.100.${host++}`), { answer: blocked });
    return { status: run.result.status, limit: run.bodies.find((body) => body.p_key === ADMIN_WIDE)?.p_limit, unknown: events("auth_account_limit_value_unknown") };
  };
  // 끔: 운영 함수가 막힘을 돌려줘도 맞는 비밀번호로 들어가고, 세는 한도는 50, 모르는 값 이벤트는 없다.
  for (const value of ["00", "0.0", "-0", "-5", " -0.5 ", "0e0", "off", " OFF ", "false", "False", "no", " No ", "none", "NONE", "disabled", " Disabled "]) {
    const run = await tryAs(value, ADMIN_PASSWORD);
    ok(run.status === 303 && run.limit === 50 && run.unknown.length === 0, `S-1 11 ${JSON.stringify(value)} 는 끔: 막힘 응답에도 막지 않는다(세는 한도 50)`);
  }
  // 켬: 0 보다 큰 숫자는 10~50(반올림, 1~9 는 예전처럼 10), 빈칸만이면 기본 50.
  for (const [value, expected] of [["1", 10], ["9", 10], ["0.4", 10], ["10", 10], ["12.6", 13], ["50", 50], ["500", 50], ["   ", 50]]) {
    const run = await tryAs(value, ADMIN_PASSWORD);
    ok(run.status === 429 && run.limit === expected && run.unknown.length === 0, `S-1 11 ${JSON.stringify(value)} 는 켬: 한도 ${expected}, 막힘 응답이면 429`);
  }
  // 그 밖의 글자: 기본 50 으로 막고 운영 이벤트 warn 을 남긴다.
  for (const value of ["on", "true", "yes", "50%", "1,000", "Infinity"]) {
    const run = await tryAs(value, ADMIN_PASSWORD);
    ok(run.status === 429 && run.limit === 50 && run.unknown.length === 1, `S-1 11 ${JSON.stringify(value)} 는 모르는 값: 기본 50 으로 막고 운영 이벤트 한 건`);
  }
  const longValue = `maybe-later-${"z".repeat(48)}`;
  const first = await tryAs(longValue, "wrong-password-118");
  const warned = first.unknown[0];
  ok(first.status === 429 && warned?.severity === "warn" && warned?.label === "AUTH_ACCOUNT_GLOBAL_RATE_LIMIT" && warned?.path === "/login", "S-1 11 모르는 값 이벤트는 warn·변수 이름·읽은 경로");
  ok(String(warned?.detail).includes(JSON.stringify(longValue.slice(0, 40))) && String(warned?.detail).includes("limit 50"), "S-1 11 이벤트에 값 원문은 40자까지");
  // 같은 isolate 에서는 다시 남기지 않는다(관리자·로그인 이름 어느 쪽에서 읽어도).
  await captureAuthCalls(() => adminLogin(fx, "wrong", `198.51.100.${host++}`));
  await captureAuthCalls(() => localLogin(fx, "nobody-v229118", "wrong-pass-118", `198.51.100.${host++}`));
  eq(events("auth_account_limit_value_unknown").length, 1, "S-1 11 같은 isolate 에서는 모르는 값 이벤트를 한 번만 남긴다");
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
  const strongAt = code.indexOf("await kakaoRoomOpenStrongIdentity(env, identity.userId)");
  const sessionAt = code.indexOf("makeUserSession(env, identity.userId)");
  ok(rawAt > 0 && keptAt > rawAt && strongAt > keptAt && sessionAt > strongAt, "S-2 0 강한 식별 확인은 세션을 만들 길에서만, 세션 만들기 바로 앞에서 한다");
  ok(/accountbook_user_identities\?user_id=eq\.\$\{encodeURIComponent\(uid\)\}&provider=in\.\(\$\{KAKAO_ROOM_OPEN_STRONG_PROVIDERS\.join\(","\)\}\)&select=provider&limit=2/.test(code), "S-2 0 강한 식별 표를 그 계정의 두 종류(kakao·local) 줄만 읽는다(독립 검토 P2-1)");
  ok(/const KAKAO_ROOM_OPEN_STRONG_PROVIDERS = \["kakao", "local"\];/.test(code), "S-2 0 세는 종류는 계정 잇기·본인 확인(fetchStrongIdentityForUser)과 같은 kakao·local");
  ok(/provider === "kakao" \? "kakao" : "local"/.test(read("src/modules/auth/identity-reauth.js")), "S-2 0 (대조) 본인 확인이 믿는 강한 식별도 kakao·local 두 종류다");
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

// ── S-2 3. 로그인 이름·비밀번호만 붙은 채팅 계정: 세션을 주지 않고, 카카오 자동 로그인이 아니라 로그인 이름 칸을 연 로그인 화면으로 ──
// (독립 검토 P3-3: 카카오 자동 로그인은 휴대폰의 카카오 계정으로 들어가 다른 계정에 닿을 수 있다.) 같은 방의 보통 계정은 그대로.
const ROOM_LOGIN_NAME = "v229118room";
const ROOM_LOGIN_PASSWORD = "room-pass-118";
async function realLocalIdentity(userId) {
  const salt = authCrypto.newPasswordSalt();
  const hash = await authCrypto.pbkdf2PasswordHash(ROOM_LOGIN_PASSWORD, salt, 100000);
  return { ...strongIdentity(userId, "local"), provider_subject: ROOM_LOGIN_NAME, login_name: ROOM_LOGIN_NAME, credential_hash: hash, credential_salt: salt, credential_iterations: 100000 };
}
await section("S-2 비밀번호 계정", () => roomFixture(async (fx, { u1, u2, hh }) => {
  fx.db.accountbook_user_identities.push(await realLocalIdentity(u2.id));
  const roomHome = `/app?household_id=${hh}`;
  const loginScreen = `/my?${new URLSearchParams({ auto: "0", login: "1", return_to: decodeURIComponent(roomHome) }).toString()}#login-local`;
  const tap = await go(fx, tapped("/my", { user: U2 }));
  ok(tap.status === 303 && tap.cookies.length === 0, "S-2 3 비밀번호 로그인만 있는 계정은 주소 값으로 세션을 주지 않는다");
  eq(tap.location, loginScreen, "S-2 3 자동 로그인을 끈(auto=0) 로그인 화면의 로그인 이름 칸으로, 돌아갈 곳은 그 방 가계부 홈");
  eq(lastRoomOpen(), "strong_local_account", "S-2 3 결과 strong_local_account");
  // 그 주소는 인앱 브라우저에서도 카카오 자동 로그인·시작 팝업이 아니라 로그인 이름 칸이 열린 로그인 화면이다.
  const screen = await go(fx, tap.location.split("#")[0]);
  ok(screen.status === 200 && !screen.location && !screen.html.includes('id="abKakaoStart"'), "S-2 3 인앱 브라우저에서도 자동 로그인으로 넘기지 않고 로그인 화면을 그린다");
  ok(screen.html.includes('action="/my/local-login"') && screen.html.includes(decodeURIComponent(roomHome).replace(/&/g, "&amp;")), "S-2 3 로그인 이름 폼과 돌아갈 곳(그 방 가계부 홈)이 있다");
  // 로그인 이름·비밀번호로 들어가면 그 방 가계부 홈으로 돌아간다.
  const login = await formPost(fx, "/my/local-login", { login_name: ROOM_LOGIN_NAME, access_code: ROOM_LOGIN_PASSWORD, return_to: decodeURIComponent(roomHome) }, { ua: INAPP });
  ok(login.status === 303 && login.location === decodeURIComponent(roomHome), "S-2 3 로그인하면 그 방 가계부 홈으로 돌아간다");
  const loginCookies = login.setCookie.split(/,(?=\s*ab_)/).map((line) => line.trim());
  eq(sessionUser(loginCookies), u2.id, "S-2 3 그 채팅 계정(U2)으로 로그인된다");
  const home = await go(fx, login.location, { cookie: jarOf(loginCookies) });
  ok(home.status === 200 && home.html.includes(ROOM_HOUSEHOLD_NAME), "S-2 3 그 방 가계부 홈이 열린다");
  const pc = await go(fx, tapped("/my", { user: U2 }), { ua: PC });
  ok(pc.location === loginScreen && pc.cookies.length === 0 && lastRoomOpen() === "strong_local_account", "S-2 3 PC 브라우저에서도 같은 로그인 화면으로");
  const probe = JSON.parse(settingValue(fx, `${PROBE}strong_local_account`) || "{}");
  eq(Object.keys(probe).sort().join(","), "app_version,at,version", "S-2 3 진단 기록 칸 strong_local_account 에는 시각·판만 남는다");
  // 카카오 로그인도 붙어 있으면 예전처럼 인앱 자동 로그인 길(strong_account)이다.
  fx.db.accountbook_user_identities.push({ ...strongIdentity(u2.id, "kakao"), id: "ident-v229118-u2-kakao", provider_subject: "9118002" });
  const both = await go(fx, tapped("/my", { user: U2 }));
  ok(both.location === roomHome && both.cookies.length === 0 && lastRoomOpen() === "strong_account", "S-2 3 카카오 로그인도 있으면 그 방 가계부 주소로(인앱 자동 로그인)");
  const plain = await go(fx, tapped("/my", { user: U1 }));
  eq(sessionUser(plain.cookies), u1.id, "S-2 3 같은 방의 보통 채팅 계정(U1)은 그대로 바로 열린다");
  eq(lastRoomOpen(), "ok", "S-2 3 U1 결과 ok");
}));

// ── S-2 3b. 다른 종류의 식별 행만 있는 채팅 계정은 지금처럼 바로 열린다(독립 검토 P2-1) ────────────────
await section("S-2 다른 종류 행", () => roomFixture(async (fx, { u1, hh }) => {
  fx.db.accountbook_user_identities.push({ ...strongIdentity(u1.id, "kakao"), provider: "apple", provider_subject: "apple-v229118" });
  const reads = [];
  const restore = intercept(async ({ url, method }) => {
    if (method === "GET" && url.pathname === "/rest/v1/accountbook_user_identities") reads.push(decodeURIComponent(url.search));
    return null;
  });
  let tap;
  try {
    tap = await go(fx, tapped("/my"));
  } finally {
    restore();
  }
  ok(tap.location === `/app?household_id=${hh}` && sessionUser(tap.cookies) === u1.id, "S-2 3b 카카오·비밀번호가 아닌 종류의 행만 있으면 보통 채팅 계정처럼 바로 열린다");
  eq(lastRoomOpen(), "ok", "S-2 3b 결과 ok");
  ok(reads.length === 1 && reads[0].includes("provider=in.(kakao,local)"), "S-2 3b 강한 식별 읽기는 kakao·local 두 종류로 거른다");
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

// ── S-2 7. 방 단추 입장 제한은 IPv6 도 주소 그대로(독립 검토 P3-1), 비밀번호 계정 길의 DB 호출 ─────────────
await section("S-2 입장 제한 주소", () => roomFixture(async (fx, { u1, u2 }) => {
  const run = await captureAuthCalls(() => go(fx, tapped("/my"), { headers: { "cf-connecting-ip": V6_RAW } }));
  const keys = new Set(run.bodies.map((body) => body.p_key));
  ok(keys.has(fingerprint(`auth|ip|/my/room-open-admission|${V6_RAW}`)) && !keys.has(fingerprint(`auth|ip|/my/room-open-admission|${V6_NET}`)), "S-2 7 방 단추 입장 제한은 IPv6 도 주소 그대로 센다(/64 로 묶지 않는다)");
  eq(sessionUser(run.result.cookies), u1.id, "S-2 7 보통 계정은 그대로 열린다");
  fx.db.accountbook_user_identities.push(strongIdentity(u2.id, "local"));
  resetIsolateState();
  const local = await countedGo(fx, tapped("/my", { user: U2 }));
  ok(lastRoomOpen() === "strong_local_account" && local.seen.filter((line) => line === IDENTITY_READ).length === 1, "S-2 7 비밀번호 계정: 강한 식별 읽기는 한 번");
  ok(local.seen.length <= ROOM_OPEN_DB_CAP, `S-2 7 비밀번호 계정 한 번 누름의 DB 호출 ${local.seen.length}회 ≤ ${ROOM_OPEN_DB_CAP}`);
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

// /health·/ready 의 판은 지금 배포된 버전의 것이다(배포 전 = V-LIVE, 되돌린 뒤 = V-TARGET). ready 는 "ok"·"down" 이거나 순서 배열이다:
// "ok"(되돌린 버전이 직접 점검), "down"(503), "cached"(인스턴스가 다시 쓴 ok — 점검 시각이 배포 요청 전), "live"(이전 버전 인스턴스의 ok),
// "fresh"(배포 요청 뒤 점검을 다시 쓴 ok), "cdown"(다시 쓴 503). 배포 요청 시각 = 아래 deps.now() = 2026-11-12T03:00:00Z.
function rollbackFake(target, { ready = "ok", sameVersion = false } = {}) {
  const calls = [];
  let readyCalls = 0;
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
    const activeVersion = deployments[0].versions[0].version_id === LIVE_ID || sameVersion ? "V-LIVE" : "V-TARGET";
    calls.push({ method, origin: address.origin, path: address.pathname, version: activeVersion });
    if (address.origin === DEPLOY_ORIGIN && address.pathname === "/health") return reply(200, { alive: true, version: activeVersion, missing_count: 0 });
    if (address.origin === DEPLOY_ORIGIN && address.pathname === "/ready") {
      const step = Array.isArray(ready) ? ready[readyCalls] ?? "down" : ready;
      readyCalls += 1;
      if (step === "down") return reply(503, { ok: false, ready: false, version: activeVersion, failed_tables: ["users", "transactions"], missing_rpcs: [] });
      if (step === "cdown") return reply(503, { ok: false, ready: false, version: activeVersion, failed_tables: ["users", "transactions"], missing_rpcs: [], cached: true, checked_at: "2026-11-12T03:00:05.000Z" });
      const reuse = step === "cached" ? { cached: true, checked_at: "2026-11-12T02:59:30.000Z" } : step === "fresh" ? { cached: true, checked_at: "2026-11-12T03:00:05.000Z" } : {};
      return reply(200, { ok: true, ready: true, version: step === "live" ? "V-LIVE" : activeVersion, failed_tables: [], missing_rpcs: [], ...reuse });
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

async function rollback(target, { extra = [], ready = "ok", sameVersion = false } = {}) {
  const fake = rollbackFake(target, { ready, sameVersion });
  const logs = [];
  const files = new Map();
  const sleeps = [];
  const deps = {
    root: process.cwd(),
    env: { CLOUDFLARE_API_TOKEN: CF_TOKEN, CLOUDFLARE_ACCOUNT_ID: CF_ACCOUNT },
    fetch: fake.fetch,
    now: () => new Date("2026-11-12T03:00:00.000Z"),
    sleep: async (ms) => { sleeps.push(ms); },
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
  return { code, output: logs.join("\n"), calls: fake.calls, sleeps, record: record ? JSON.parse(record[1]) : null };
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

// ── O-4 4. 되돌린 버전이 직접 점검한 /ready 만 센다(독립 검토 P3-4) ─────────────────────────────────
await section("O-4 되돌린 버전의 응답만", async () => {
  const done = await rollback(LATER);
  const deployAt = done.calls.findIndex((call) => call.method === "POST");
  const firstHealth = done.calls.findIndex((call) => call.origin === DEPLOY_ORIGIN && call.path === "/health");
  ok(firstHealth >= 0 && firstHealth < deployAt, "O-4 4 배포 요청 전에 /health 의 판을 한 번 읽는다");
  eq(done.record?.before?.version, "V-LIVE", "O-4 4 되돌리기 기록에 배포 전 판이 남는다");
  ok(done.calls.slice(deployAt).filter((call) => call.origin === DEPLOY_ORIGIN).every((call) => call.version === "V-TARGET"), "O-4 4 되돌린 뒤 센 /health·/ready 는 되돌린 버전의 판이다");
  // 이전 버전 인스턴스의 ok 는 세지 않고 연속을 끊는다.
  const live = await rollback(LATER, { ready: ["live", "ok", "live", "ok", "ok"] });
  eq(live.code, 0, "O-4 4 이전 판 응답이 섞여도 되돌린 판의 연속 ok 면 통과");
  eq(live.calls.filter((call) => call.path === "/ready").length, 5, "O-4 4 이전 판(V-LIVE)의 ok 는 세지 않는다(예전에는 둘째에서 통과)");
  eq(live.record?.ready?.previous_version, 2, "O-4 4 기록에 이전 판 응답 수");
  const onlyLive = await rollback(LATER, { ready: Array(6).fill("live") });
  ok(onlyLive.code === 1 && /배포 전 판의 응답이 이어집니다/.test(onlyLive.output), "O-4 4 이전 판의 ok 만 오면 실패로 알린다");
  // 다시 쓴 응답(cached:true)은 세지도 끊지도 않고, 다시 쓰기(60초)가 끝날 만큼 기다렸다 다시 본다.
  const cached = await rollback(LATER, { ready: ["ok", "cached", "ok"] });
  eq(cached.code, 0, "O-4 4 다시 쓴 응답 뒤 되돌린 버전의 ok 가 하나 더 오면 통과");
  eq(cached.calls.filter((call) => call.path === "/ready").length, 3, "O-4 4 다시 쓴 ok 는 세지 않는다(예전에는 둘째에서 통과)");
  ok(cached.record?.ready?.cached_skipped === 1 && cached.sleeps.some((ms) => ms > 60000), "O-4 4 다시 쓴 응답 수가 기록에 남고, 그 뒤로는 60초 넘게 기다린다");
  const onlyCached = await rollback(LATER, { ready: Array(6).fill("cached") });
  ok(onlyCached.code === 1 && /직접 점검한 응답을 받지 못했습니다/.test(onlyCached.output), "O-4 4 다시 쓴 응답만 오면 실패로 알린다");
  // 판 이름이 같은 버전(설정만 바꾼 버전)은 응답으로 가릴 수 없다. 재검토 P2 로 기대값을 바꿨다: 예전 ‘실패·/ready 0번’ 은 DB 준비 여부를 전혀
  // 보고하지 않아, 지금은 경고를 남기고 판 제외 없이 /health·/ready 로 종료 코드를 정한다(자세한 장면은 ‘O-4 같은 판 되돌리기’).
  const same = await rollback(LATER, { sameVersion: true });
  ok(same.code === 0 && /경고: 판 이름이 같아 응답만으로는 되돌린 버전인지 가릴 수 없습니다/.test(same.output) && same.calls.filter((call) => call.path === "/ready").length === (deployTool.READY_CONSECUTIVE ?? -1), "O-4 4 판 이름이 같은 버전이면 경고하고, 판 제외 없이 /ready 까지 보고 통과");
  ok(!RUNNABLE_ROLLBACK.test(same.output + onlyCached.output + onlyLive.output), "O-4 4 실패·경고 출력에도 되돌리기 명령 줄이 없다");
});

// ── O-4 5. 판 이름이 같은 버전으로 되돌리기(재검토 P2) ───────────────────────────────────────────
await section("O-4 같은 판 되돌리기", async () => {
  const same = await rollback(LATER, { sameVersion: true });
  eq(same.code, 0, "O-4 5 판 이름이 같은 버전: /health 가 살아 있고 /ready 가 ok 면 통과(예전에는 늘 실패)");
  ok(/배포 기록의 활성 version id 로 확인하세요/.test(same.output) && same.output.includes(`배포 API 의 활성 버전은 ${LATER_ID} 100% 로 확인했습니다`), "O-4 5 경고 옆에 배포 API 로 확인한 활성 version id 를 적는다");
  eq(same.calls.filter((call) => call.path === "/ready").length, deployTool.READY_CONSECUTIVE ?? -1, "O-4 5 판 제외 없이 /ready 를 연속으로 본다(예전에는 0번)");
  ok(same.record?.warnings?.length === 1 && same.record?.health_version_filtered?.ok === false && same.record?.health?.ok === true && same.record?.ready?.ok === true, "O-4 5 기록에 경고·판으로 가린 확인(실패)·판 제외 확인·/ready 결과가 남는다");
  ok(/경고 1건/.test(same.output) && same.output.includes(`되돌리기 전 배포 버전(기록만): ${LIVE_ID}`), "O-4 5 끝 줄에 경고가 있고, 이전 버전은 id 만 기록으로 적는다");
  const sameDown = await rollback(LATER, { sameVersion: true, ready: "down" });
  eq(sameDown.code, 1, "O-4 5 판 이름이 같아도 /ready 가 준비 안 됨(503)이면 실패");
  ok(/경고: 판 이름이 같아/.test(sameDown.output) && /DB 를 쓸 수 없는 버전일 수 있습니다/.test(sameDown.output) && sameDown.record?.ready?.ok === false, "O-4 5 경고와 /ready 503 을 그대로 보고한다");
  ok(!RUNNABLE_ROLLBACK.test(same.output + sameDown.output), "O-4 5 출력에 되돌리기 명령 줄이 없다");
  // 판이 다른 보통 되돌리기에는 경고가 없다.
  const plain = await rollback(LATER);
  ok(plain.code === 0 && !/경고/.test(plain.output) && !plain.record?.warnings, "O-4 5 판이 다른 되돌리기에는 경고가 없다");
});

// ── O-4 6. 다시 쓴 /ready(재검토 P3) ───────────────────────────────────────────────────────────
await section("O-4 다시 쓴 /ready", async () => {
  const fresh = await rollback(LATER, { ready: ["ok", "fresh"] });
  ok(fresh.code === 0 && fresh.calls.filter((call) => call.path === "/ready").length === 2 && fresh.record?.ready?.cached_counted === 1, "O-4 6 배포 요청 뒤 점검(checked_at)을 다시 쓴 ok 는 센다");
  ok(!fresh.sleeps.some((ms) => ms > 60000), "O-4 6 그때는 60초를 기다리지 않는다");
  eq(fresh.record?.deploy_requested_at, "2026-11-12T03:00:00.000Z", "O-4 6 기록에 배포 요청 시각이 남는다");
  const stale = await rollback(LATER, { ready: ["ok", "cached", "ok"] });
  ok(stale.code === 0 && stale.calls.filter((call) => call.path === "/ready").length === 3 && stale.record?.ready?.cached_skipped === 1, "O-4 6 배포 요청 전 점검을 다시 쓴 ok 는 세지 않고 기다렸다 다시 본다");
  const cdown = await rollback(LATER, { ready: ["ok", "cdown", "ok", "ok"] });
  ok(cdown.code === 0 && cdown.calls.filter((call) => call.path === "/ready").length === 4 && cdown.record?.ready?.not_ok === 1 && cdown.record?.ready?.cached_not_ok === 1, "O-4 6 다시 쓴 503 은 ‘준비 안 됨’으로 세고 연속을 끊는다");
  const between = await rollback(LATER, { ready: ["ok", "cdown", "ok"] });
  eq(between.code, 1, "O-4 6 ok → 다시 쓴 503 → ok 는 통과가 아니다(재검토가 짚은 순서, 예전에는 셋째에서 통과)");
  const onlyCdown = await rollback(LATER, { ready: Array(6).fill("cdown") });
  ok(onlyCdown.code === 1 && /DB 를 쓸 수 없는 버전일 수 있습니다/.test(onlyCdown.output) && onlyCdown.record?.ready?.cached_not_ok === 6, "O-4 6 다시 쓴 503 만 오면 준비 안 됨으로 실패");
});

if (failedSections.length) {
  throw new Error(`V22.9.118 보안 보강 검사 실패 ${failedSections.length}건:\n- ${failedSections.join("\n- ")}`);
}
const checks = t.done();
if (checks < 150) throw new Error(`검사 수가 너무 적다: ${checks}`);
