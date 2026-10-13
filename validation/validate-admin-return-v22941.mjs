// V22.9.41 관리자 로그인 복귀·옛 관리자 화면 내비 스타일 검사.
//
// 2026-10-13 운영에서 관리자가 /ops-monitor 를 열면 로그인 창이 나오고, 로그인 뒤 요청한 화면이 아니라
// /?legacy=1 옛 관리자 화면에 떨어졌다. 관리자 전용 화면이 세션 없을 때 /admin-view 로만 보내 return_to 를
// 잃었기 때문이다. 같은 날 그 옛 관리자 화면은 사이드바 글자가 맨글자로 나오고 브랜드 아이콘이 화면을 덮었다.
// 옛 관리자 화면은 셸 CSS 를 쓰지 않는데 renderUnifiedNav 를 user 범위로 불러 인라인 내비 스타일이 빠졌고,
// 후처리가 범위 표식만 admin 으로 바꿔 스타일 없는 내비가 남았다(V22.8.44 이후).
// 이 검사가 지키는 것:
//   1. 세션 없는 /ops-monitor·/ops-monitor/open·/nlu-ops·/skill-ops·/ops-skill 은 /admin-view?return_to=<요청 경로·쿼리> 로 간다
//   2. /admin-view 의 로그인 폼은 return_to 를 숨은 칸에 싣고, 외부 주소·/login 은 기본값 /?legacy=1 로 되돌린다
//   3. 로그인 뒤 return_to 로 돌아가고 세션 쿠키가 붙는다
//   4. /?legacy=1·/admin-view 옛 관리자 화면은 head 안에 인라인 내비 스타일(unifiedNavStyle)을 갖고 셸 CSS 는 쓰지 않는다
//   5. 사용자 범위 화면(/app)은 그대로 셸 CSS 를 쓰고 인라인 내비 스타일이 없다
// 렌더링은 QA 픽스처와 app.fetch 로만 한다(서버·네트워크 없음).
import { readFileSync } from "node:fs";
import { fixture, page, post, counter } from "./lib-audit-v22934.mjs";

const LABEL = "V22.9.41 관리자 로그인 복귀·옛 관리자 화면 내비 스타일 검사 통과";
const { ok, eq, done } = counter(LABEL);
const ADMIN_PASSWORD = "admin-return-2026";
const MOBILE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1";
const hiddenReturnTo = (html) => (html.match(/name="return_to"[^>]*value="([^"]*)"/) || html.match(/value="([^"]*)"[^>]*name="return_to"/) || [])[1];
const hasInlineNavStyleInHead = (html) => {
  const style = html.indexOf('<style id="unifiedNavStyle">');
  const head = html.indexOf("</head>");
  return style >= 0 && head > style && html.slice(style, html.indexOf("</style>", style)).includes(".abLayoutNav{");
};

await fixture(async (fx) => {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "admin-return-session-secret";

  // 1. 세션 없는 관리자 전용 화면은 요청 경로를 들고 로그인으로 간다.
  for (const [path, expected] of [
    ["/ops-monitor", "/admin-view?return_to=%2Fops-monitor"],
    ["/ops-monitor/open", "/admin-view?return_to=%2Fops-monitor%2Fopen"],
    ["/nlu-ops?hours=24", "/admin-view?return_to=%2Fnlu-ops%3Fhours%3D24"],
    ["/skill-ops", "/admin-view?return_to=%2Fskill-ops"],
    ["/ops-skill", "/admin-view?return_to=%2Fops-skill"],
  ]) {
    const r = await page(fx, path, { cookie: "" });
    eq(r.status, 303, `세션 없는 ${path} 은 303 으로 로그인에 보낸다`);
    eq(r.location, expected, `${path} 의 로그인 위치가 요청 경로·쿼리를 return_to 로 싣는다`);
  }
  const api = await page(fx, "/ops-monitor/api/summary", { cookie: "" });
  eq(api.status, 401, "관제 API 는 전처럼 401 JSON 이고 리디렉션하지 않는다");

  // 2. 로그인 폼은 return_to 를 숨은 칸에 싣고 안전하지 않은 값은 기본값으로 되돌린다.
  const form = await page(fx, "/admin-view?return_to=%2Fops-monitor", { cookie: "" });
  eq(form.status, 200, "/admin-view 는 로그인 폼을 낸다");
  eq(hiddenReturnTo(form.html), "/ops-monitor", "로그인 폼의 return_to 숨은 칸이 /ops-monitor 다");
  ok(form.html.includes("인증 후 요청한 화면으로 돌아갑니다"), "로그인 폼이 요청한 화면으로 돌아간다고 안내한다");
  for (const bad of ["%2F%2Fevil.example%2Fx", "https%3A%2F%2Fevil.example%2Fx", "%2Flogin", "%2Fmy%2Flogout"]) {
    const r = await page(fx, `/admin-view?return_to=${bad}`, { cookie: "" });
    eq(hiddenReturnTo(r.html), "/?legacy=1", `return_to=${decodeURIComponent(bad)} 는 기본값 /?legacy=1 로 되돌린다`);
  }
  eq(hiddenReturnTo((await page(fx, "/admin-view", { cookie: "" })).html), "/?legacy=1", "return_to 없는 /admin-view 의 기본값은 그대로 /?legacy=1 이다");

  // 3. 로그인 뒤 요청한 화면으로 돌아간다.
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/ops-monitor" }, { cookie: "" });
  eq(login.status, 303, "로그인 성공은 303 이다");
  eq(login.location, "/ops-monitor", "로그인 뒤 return_to 인 /ops-monitor 로 돌아간다");
  const admin = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  ok(admin.length > "ab_admin=".length, "로그인 응답에 관리자 세션 쿠키가 붙는다");
  const monitor = await page(fx, "/ops-monitor", { cookie: admin });
  ok(monitor.status !== 303 && !monitor.location, "세션이 있으면 /ops-monitor 는 더 이상 로그인으로 보내지 않는다");
  ok(monitor.status === 503 && monitor.html.includes("종합 관제 연결"), "픽스처(관제 바인딩 없음)에서는 연결 준비 안내를 낸다");
  const bounce = await post(fx, "/login", { password: ADMIN_PASSWORD, return_to: "/login" }, { cookie: "" });
  eq(bounce.location, "/?legacy=1", "return_to 가 /login 이면 기본값으로 돌아간다");
  const wrong = await post(fx, "/login", { password: "nope", return_to: "/ops-monitor" }, { cookie: "" });
  eq(wrong.status, 401, "틀린 비밀번호는 401 이다");
  eq(hiddenReturnTo(wrong.text), "/ops-monitor", "틀린 비밀번호 뒤에도 폼이 return_to 를 유지한다");

  // 4. 옛 관리자 화면은 인라인 내비 스타일을 head 에 갖고 셸 CSS 는 쓰지 않는다.
  for (const path of ["/?legacy=1", "/admin-view", "/?legacy=1&tab=transactions"]) {
    const r = await page(fx, path, { cookie: admin });
    eq(r.status, 200, `${path} 는 관리자 세션으로 200 이다`);
    ok(hasInlineNavStyleInHead(r.html), `${path} 의 head 에 인라인 내비 스타일(.abLayoutNav 규칙)이 있다`);
    ok(r.html.includes('data-nav-scope="admin"') && !r.html.includes('data-nav-scope="user"'), `${path} 의 내비 범위 표식은 admin 이다`);
    ok(r.html.includes('id="abDesktopSidebar"'), `${path} 에 사이드바가 있다`);
    ok(!/accountbook-shell-v\d+\.css/.test(r.html), `${path} 는 셸 CSS 를 쓰지 않는다(옛 화면 인라인 CSS 와 충돌 방지)`);
    eq((r.html.match(/<style id="unifiedNavStyle">/g) || []).length, 1, `${path} 의 인라인 내비 스타일은 한 번만 있다`);
  }
  const mobile = await page(fx, "/?legacy=1", { cookie: admin, headers: { "user-agent": MOBILE_UA } });
  ok(mobile.status === 200 && hasInlineNavStyleInHead(mobile.html), "휴대폰에서도 ?legacy=1 은 같은 화면을 인라인 내비 스타일과 함께 낸다");

  // 5. 사용자 범위 화면은 바뀌지 않는다.
  const app = await page(fx, "/app");
  eq(app.status, 200, "/app 은 사용자 세션으로 200 이다");
  ok(!app.html.includes('id="unifiedNavStyle"') && /accountbook-shell-v\d+\.css/.test(app.html), "/app 은 전처럼 셸 CSS 를 쓰고 인라인 내비 스타일이 없다");
  ok(app.html.includes('data-nav-scope="user"'), "/app 의 내비 범위 표식은 user 다");
});

// 6. 소스 고정: 관리자 전용 화면은 공용 도우미로 로그인 위치를 만든다.
const read = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8");
const opsMonitor = read("src/modules/runtime/ops-monitor.js");
const nluOps = read("src/modules/admin/nlu-openbuilder-ops.js");
const dashboard = read("src/modules/admin/dashboard-page.js");
const session = read("src/modules/auth/crypto-admin-session.js");
const bundle = read("src/index.js");
ok(opsMonitor.includes("redirectResponse(adminLoginLocation(url))") && !opsMonitor.includes('redirectResponse("/admin-view")'), "ops-monitor 는 adminLoginLocation 으로 로그인 위치를 만든다");
eq((nluOps.match(/redirectResponse\(adminLoginLocation\(url\)\)/g) || []).length, 2, "NLU·스킬 운영 화면 둘 다 adminLoginLocation 을 쓴다");
ok(!nluOps.includes('redirectResponse("/admin-view")'), "NLU·스킬 운영 화면에 return_to 없는 /admin-view 리디렉션이 남지 않았다");
ok(dashboard.includes('householdId: householdValue, scope: "admin" })'), "옛 관리자 화면은 renderUnifiedNav 를 admin 범위로 부른다(인라인 내비 스타일 포함)");
ok(session.includes("function adminLoginLocation(url)") && session.includes("safeAdminReturnPath(requested, \"\")"), "adminLoginLocation 은 safeAdminReturnPath 로 거른 경로만 return_to 에 싣는다");
eq((bundle.match(/function adminLoginLocation\(url\)/g) || []).length, 1, "빌드된 Worker 에 adminLoginLocation 이 한 번 들어 있다");

done();
