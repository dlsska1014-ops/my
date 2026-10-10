// V22.9.37 감사 묶음 C(화면·클라이언트·내비게이션·자산) 검사.
// docs/codex/AUDIT_FINDINGS_V22_9_33.md 의 H1·U3·U6, H4, H8, H9, H11, H12, U2, U4, U5, U7, U8, U9, U10, U11, U12,
// U13, U14, N12 를 메모리 픽스처(validation/qa-fixture.mjs)로 재현한 뒤 고친 상태를 확인한다. 네트워크를 쓰지 않는다.
//
// 항목마다 `// ── <ID>` 묶음이 있고, 각 묶음의 첫 검사는 고치기 전 코드에서 실패하던 것이다.
// AB_AUDIT_SOFT=1 로 돌리면 실패를 모아 보고만 하고 멈추지 않는다(재현 기록용). 기본은 첫 실패에서 멈춘다.
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
import { BASE, api, app, counter, ctx, fixture, intercept, page, post, settingValue } from "./lib-audit-v22934.mjs";

const LABEL = "V22.9.37 감사 묶음 C(화면·클라이언트) 통과";
function softCounter(label) {
  let checks = 0;
  let failed = 0;
  const report = (passed, message) => { checks += 1; if (!passed) { failed += 1; console.log(`  FAIL ${message}`); } };
  return {
    ok(value, message) { report(!!value, message); },
    eq(actual, expected, message) { report(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`); },
    done() { console.log(`${label} (${checks} checks, ${failed} failed)`); return checks; },
  };
}
const { ok, eq, done } = process.env.AB_AUDIT_SOFT === "1" ? softCounter(LABEL) : counter(LABEL);
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// 이번 릴리스의 자산 주소. 바뀐 자산은 주소를 올렸고(불변 캐시), 옛 JS 주소는 AB_HISTORICAL_RUNTIME_ASSETS 로 그대로 내려간다.
const SHELL_CSS = "/assets/accountbook-shell-v22937.css";
const NAV_JS = "/assets/accountbook-nav-v22937.js";
const V5_JS = "/assets/accountbook-v5-v22937.js";
const GOALS_JS = "/assets/accountbook-goals-v22937.js";
const PREVIOUS_ASSETS = {
  "/assets/accountbook-nav-v22930.js": ["accountbook-nav-v22930-js", "b76bebe25f3f0138e918129c7f34e4fa973f1dc53fec0ea905afc4a04bb9de60"],
  "/assets/accountbook-v5-v22934.js": ["accountbook-v5-v22934-js", "0c85fadaee93b78357fd32e9c9b595b66edd5d33601e51fc30ee6a746ad4463d"],
  "/assets/accountbook-goals-v22929.js": ["accountbook-goals-v22929-js", "1f52fca714cf0683555a75c8a2768f2b007273130ac05081757577aaedc38fe5"],
  "/assets/accountbook-favrows-v22836.js": ["accountbook-favrows-v22836-js", "04b2c5df73273baffbaf09b00a0f1e69871febafc24dae81d1f7238a9e3e9aa7"],
  "/assets/accountbook-search-v22929.js": ["accountbook-search-v22929-js", "965589e96d188674d7a1dc151446201ec2197da3e0d4eada885c0f4bef8695ae"],
  "/assets/accountbook-notif-v22836.js": ["accountbook-notif-v22836-js", "7a6ef7fe4ca223901e2dc29550add0fe23f3f61803b884ecfb4d6edba33cfc07"],
};
const assetCache = new Map();
async function asset(path) {
  if (!assetCache.has(path)) {
    const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
    assetCache.set(path, { status: response.status, etag: response.headers.get("etag") || "", text: await response.text() });
  }
  return assetCache.get(path);
}
const ADMIN_PASSWORD = "audit-c-admin-2026";
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = ADMIN_PASSWORD;
  fx.env.ADMIN_SESSION_SECRET = "audit-c-admin-session-secret";
  const login = await post(fx, "/login", { password: ADMIN_PASSWORD }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
}
function contrast(fg, bg) {
  const channel = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  const lum = (hex) => { const [r, g, b] = channel(hex); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const [a, b] = [lum(fg), lum(bg)];
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}
const navOf = (html) => { const start = html.indexOf('class="abLayoutNav'); return start < 0 ? "" : html.slice(start, html.indexOf("</nav>", start)); };

// ── 자산 주소: 바뀐 자산은 새 주소·새 ETag, 옛 JS 주소는 바이트 그대로 ───────────────
{
  for (const [path, version] of [[SHELL_CSS, "v22937"], [NAV_JS, "v22937"], [V5_JS, "v22937"], [GOALS_JS, "v22937"], ["/assets/accountbook-favrows-v22937.js", "v22937"], ["/assets/accountbook-search-v22937.js", "v22937"], ["/assets/accountbook-notif-v22937.js", "v22937"]]) {
    const served = await asset(path);
    ok(served.status === 200 && served.etag.includes(version), `${path} 가 ${version} ETag 로 내려온다 (${served.etag || served.status})`);
  }
  for (const [path, [etag, sha256]] of Object.entries(PREVIOUS_ASSETS)) {
    const served = await asset(path);
    const measured = createHash("sha256").update(served.text).digest("hex");
    ok(served.status === 200 && served.etag === `"${etag}"` && measured === sha256, `${path} 는 옛 바이트·ETag 그대로 내려온다(이미 받아 간 화면 보호)`);
  }
  await fixture(async (fx) => {
    const home = await page(fx, "/app?month=2026-07&household_id=house-home");
    ok(home.html.includes(`href="${SHELL_CSS}"`) && home.html.includes(`src="${NAV_JS}"`) && home.html.includes(`src="${V5_JS}"`), "홈이 새 자산 주소를 쓴다");
    const goals = await page(fx, "/goals?month=2026-07&household_id=house-home");
    ok(goals.html.includes(`src="${GOALS_JS}"`), "목표 화면이 새 목표 스크립트 주소를 쓴다");
  });
}

// ── H1·U3 화면에 실제 그린 가계부가 클라이언트 요청에 실린다 ─────────────────────
await fixture(async (fx) => {
  const explicit = await page(fx, "/app?month=2026-07&household_id=house-trip");
  ok(explicit.html.includes('<div class="abNavScope" data-nav-scope="user" data-ab-hh="house-trip" hidden></div>'), "H1 주소로 고른 가계부가 내비 범위 표식(data-ab-hh)에 실린다");
  const injected = await page(fx, "/app?month=2026-07", { cookie: `${fx.cookie}; ab_hh=house-home` });
  eq(injected.status, 200, "U3 주소에 가계부가 없는 설치 앱 진입이 열린다");
  ok(injected.html.includes('data-ab-hh="house-home"'), "U3 쿠키로 그린 가계부(생활비)가 표식에 실린다 — 첫 가계부(제주여행)가 아니다");
  ok(!injected.html.includes('data-ab-hh="house-trip"'), "U3 표식이 다른 가계부를 가리키지 않는다");
  const nav = await asset(NAV_JS);
  ok(nav.text.includes('.abNavScope[data-ab-hh]'), "H1 내비 스크립트가 화면의 가계부 표식을 읽어 링크에 싣는다");
  const v5 = await asset(V5_JS);
  ok((v5.text.match(/\.abNavScope\[data-ab-hh\]/g) || []).length >= 5, "U3 검색·알림·행 즐겨찾기·빠른 입력·활동 레일이 모두 화면의 가계부를 쓴다");
  const goals = await asset(GOALS_JS);
  ok(goals.text.includes('.abNavScope[data-ab-hh]'), "H1 목표 저장이 화면의 가계부를 쓴다");
  ok(!/function currentHousehold\(\) \{\s*try \{\s*var p = new URLSearchParams\(location\.search\);\s*return p\.get\("household"\)/.test(v5.text), "주소만 보고 가계부를 정하던 코드가 남아 있지 않다");

  const noHousehold = await api(fx, "/u/api/goals", "POST", { action: "create", name: "가계부 없는 목표", target: 10000 });
  eq(noHousehold.status, 400, "H1 가계부 없는 목표 저장은 400 이다 (예전에는 첫 가계부에 저장됐다)");
  eq(noHousehold.data?.reason, "household_required", "H1 이유 코드 household_required");
  ok(!settingValue(fx, "goals:v5:house-trip") && !settingValue(fx, "goals:v5:house-home"), "H1 가계부 없는 저장은 어느 가계부에도 쓰지 않는다");
  const noHouseholdFavorite = await api(fx, "/u/api/favorites", "POST", { id: "tx-expense-1", tx: { id: "tx-expense-1", type: "expense", amount: 148000, memo: "주말 장보기", transaction_date: "2026-07-04" } });
  eq(noHouseholdFavorite.status, 400, "H1 가계부 없는 즐겨찾기 저장은 400 이다");
  const withHousehold = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "create", name: "생활비 비상금", target: 10000 });
  eq(withHousehold.status, 200, "가계부를 실은 저장은 그대로 된다");
  eq(withHousehold.data?.household_id, "house-home", "실은 가계부에 저장된다");
  const notifications = await api(fx, "/u/api/notifications?household=house-home&month=2026-07");
  eq(notifications.data?.household_id, "house-home", "조회도 실은 가계부 범위를 지킨다");
});

// ── U6 "마우스 따라오는 표시"는 사용자 설정이다 ─────────────────────────────────
await fixture(async (fx) => {
  const off = await post(fx, "/cursor-preference/save", { household_id: "house-home", month: "2026-07" });
  eq(off.status, 303, "끄기 저장은 리다이렉트로 끝난다");
  const withoutHousehold = await api(fx, "/cursor-preference");
  eq(withoutHousehold.data?.on, false, "U6 주소에 가계부가 없는 화면에서도 끈 상태다 (예전에는 다시 켜졌다)");
  const otherHousehold = await api(fx, "/cursor-preference?household_id=house-trip");
  eq(otherHousehold.data?.on, false, "U6 다른 가계부 화면에서도 끈 상태다");
  const menuTrip = await page(fx, "/menu?month=2026-07&household_id=house-trip");
  ok(menuTrip.html.includes("마우스 따라오는 표시") && !/name="cursor" value="on" checked/.test(menuTrip.html), "U6 다른 가계부의 전체 메뉴도 꺼짐으로 보인다");
  eq(settingValue(fx, "cursor:v1:user:user-bin"), "off", "U6 사용자 키 한 줄에 저장된다");
  const wifi = await app.fetch(new Request(`${BASE}/cursor-preference`, { headers: { cookie: await fx.cookieFor("user-wifi") } }), fx.env, ctx);
  eq((await wifi.json()).on, true, "다른 사용자에게는 기본값(켜짐) 그대로다");
  const on = await post(fx, "/cursor-preference/save", { household_id: "house-trip", month: "2026-07", cursor: "on" });
  eq(on.status, 303, "다시 켤 수 있다");
  eq((await api(fx, "/cursor-preference?household_id=house-home")).data?.on, true, "어느 가계부에서 켜도 모든 화면에 적용된다");
});

// ── H4 승인 대기 가계부는 기억하지 않는다 · 세션을 새로 주면 기억을 지운다 ─────────────
await fixture(async (fx) => {
  fx.db.households.push({ id: "house-wait", name: "대기중 모임", invite_code: "WAIT2265", created_at: "2026-07-05T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: "house-wait", user_id: "user-bin", role: "pending", created_at: "2026-07-05T00:00:00.000Z" });
  const list = await page(fx, "/my/households?month=2026-07&household_id=house-wait&msg=approval_pending");
  eq(list.status, 200, "참여 요청 뒤 돌아오는 가계부 목록은 열린다");
  ok(!/ab_hh=house-wait/.test(list.setCookie), "H4 승인 대기 가계부를 기억하지 않는다 (예전에는 쿠키에 남아 모든 화면이 403 이 됐다)");
  const stale = await page(fx, "/app?month=2026-07", { cookie: `${fx.cookie}; ab_hh=house-wait` });
  eq(stale.status, 403, "기억한 가계부가 승인 대기면 접근 안내 화면이다");
  ok(/ab_hh=;[^,]*Max-Age=0/.test(stale.setCookie), "H4 그 안내 화면이 낡은 기억을 지운다");
  const next = await page(fx, "/app?month=2026-07");
  eq(next.status, 200, "기억이 지워진 다음 화면은 다시 열린다");
  const signup = await post(fx, "/my/local-signup", { login_name: "cookiereset", display_name: "쿠키초기화", access_code: "cookie-reset-2026", access_code_confirm: "cookie-reset-2026" }, { cookie: "ab_hh=house-home" });
  eq(signup.status, 303, "새 계정 만들기가 된다");
  ok(/ab_user=[^;]/.test(signup.setCookie) && /ab_hh=;[^,]*Max-Age=0/.test(signup.setCookie), "H4 가입으로 세션을 발급하면 이전 사람의 가계부 기억을 지운다");
  const login = await post(fx, "/my/local-login", { login_name: "cookiereset", access_code: "cookie-reset-2026" }, { cookie: "ab_hh=house-home" });
  eq(login.status, 303, "로그인이 된다");
  ok(/ab_user=[^;]/.test(login.setCookie) && /ab_hh=;[^,]*Max-Age=0/.test(login.setCookie), "H4 로그인으로 세션을 발급하면 가계부 기억을 지운다");
  const plain = await page(fx, "/app?month=2026-07&household_id=house-home");
  ok(/ab_hh=house-home/.test(plain.setCookie), "읽을 수 있는 가계부를 그린 화면은 예전처럼 기억한다");
});

// ── H8 관리자 /households 는 가계부 수에 따라 DB 호출을 세 배로 늘리지 않는다 ─────────────
await fixture(async (fx) => {
  // 감사 기준(16개부터 예산 초과)보다 많은 18개. 픽스처는 HEAD count 를 흉내 내지 않아 거래 수 조회가 가계부마다 두 번 나간다 —
  // 그래서 절대 횟수 대신 "참여자 조회가 가계부 수에 비례하지 않는다"를 보고, 예산(50회) 안에 드는지만 함께 본다.
  for (let i = 0; i < 16; i += 1) {
    const id = `house-many-${String(i).padStart(2, "0")}`;
    fx.db.households.push({ id, name: `모임 ${i}`, invite_code: `MANY${String(i).padStart(4, "0")}`, created_at: `2026-06-${String(i + 1).padStart(2, "0")}T00:00:00.000Z` });
    fx.db.household_members.push({ household_id: id, user_id: "user-bin", role: "owner", created_at: "2026-06-01T00:00:00.000Z" }, { household_id: id, user_id: "user-wifi", role: "member", created_at: "2026-06-02T00:00:00.000Z" });
  }
  const cookie = await adminCookie(fx);
  const paths = [];
  const restore = intercept(async ({ url }) => { paths.push(url.pathname + url.search); return null; });
  const admin = await page(fx, "/households?household_id=house-home", { cookie });
  restore();
  eq(admin.status, 200, "H8 가계부 18개에서도 관리자 가계부 화면이 열린다 (예전에는 요청당 DB 호출 예산 50회를 넘어 오류)");
  const memberQueries = paths.filter((path) => path.includes("/household_members"));
  ok(memberQueries.length <= 3, `H8 참여자 조회가 가계부 수에 비례하지 않는다 (${memberQueries.length}회: 묶음 1 + 선택 가계부 명단)`);
  ok(memberQueries.some((path) => decodeURIComponent(path).includes("household_id=in.(")), "H8 참여자 수는 in.(…) 묶음 조회 한 번으로 센다");
  ok(paths.length < 50, `전체 DB 호출이 요청당 예산(50회) 안이다 (${paths.length}회)`);
  ok(admin.html.includes("참여자 2명") && admin.html.includes("<h2>우리집 생활비</h2>"), "묶음 조회로 센 참여자 수와 선택한 가계부 명단이 맞다");
});

// ── H9 잘못된 가계부 id 는 첫 가계부로 바꾸지 않고 찾을 수 없다고 알린다 ─────────────
await fixture(async (fx) => {
  const menu = await page(fx, "/menu?month=2026-07&household_id=house-gone");
  eq(menu.status, 404, "H9 전체 메뉴의 없는 가계부는 404 다 (예전에는 첫 가계부로 바꿔 200)");
  ok(menu.html.includes("가계부를 찾을 수 없어요") && menu.html.includes('href="/my/households"'), "안내 문구와 가계부 목록 링크가 있다");
  ok(!menu.html.includes("7월 제주여행") && !menu.html.includes("우리집 생활비"), "다른 가계부를 대신 그리지 않는다");
  eq((await page(fx, "/start-guide?month=2026-07&household_id=house-gone")).status, 404, "H9 시작 안내의 없는 가계부도 404 다");
  eq((await page(fx, "/households?month=2026-07&household_id=house-gone")).status, 404, "H9 가계부·참여자 화면의 없는 가계부도 404 다");
  eq((await page(fx, "/home-layout?month=2026-07&household_id=house-gone")).status, 404, "H9 홈 구성 화면의 없는 가계부도 404 다");
  const cookie = await adminCookie(fx);
  const adminMenu = await page(fx, "/menu?month=2026-07&household_id=house-gone", { cookie });
  eq(adminMenu.status, 404, "H9 관리자 전체 메뉴도 첫 가계부로 바꾸지 않는다");
  ok(adminMenu.html.includes('href="/households"'), "관리자에게는 관리자 가계부 목록으로 안내한다");
  eq((await page(fx, "/start-guide?month=2026-07&household_id=house-gone", { cookie })).status, 404, "H9 관리자 시작 안내도 404 다");
  const dashboard = await page(fx, "/?legacy=1&month=2026-07&household_id=house-gone", { cookie });
  ok(dashboard.html.includes("가계부를 찾을 수 없어요"), "H9 관리자 대시보드가 없는 가계부를 알린다");
  ok(!/name="household_id" value="house-(?:home|trip)"/.test(dashboard.html), "H9 숨은 저장 칸에 첫 가계부를 넣지 않는다");
  ok(!dashboard.html.includes("abV22812Shell") && !/accountbook-theme-v\d+/.test(dashboard.html), "관리자 안내 화면은 사용자 셸 밖에 있다");
});

// ── H11 나간 사람의 이름은 기록 당시 사용자 이름으로 보여 준다 ─────────────────────
await fixture(async (fx) => {
  fx.db.users.push({ id: "user-left", kakao_user_key: "kakao_login:9901", nickname: "떠난사람", created_at: "2026-06-01T00:00:00.000Z" });
  fx.db.transactions.push(
    { id: "tx-left-1", household_id: "house-home", user_id: "user-left", transaction_date: "2026-07-06", type: "expense", amount: 5400, category: "식비", memo: "떠난사람 커피", payment_method: "현금", source: "web", raw_text: "커피 5400", created_at: "2026-07-06T03:00:00.000Z" },
    { id: "tx-ghost-1", household_id: "house-home", user_id: "user-ghost", transaction_date: "2026-07-07", type: "expense", amount: 1200, category: "식비", memo: "기록만 남은 지출", payment_method: "현금", source: "web", raw_text: "", created_at: "2026-07-07T03:00:00.000Z" },
  );
  const day = await api(fx, "/u/api/day-transactions?date=2026-07-06&household=house-home");
  eq(day.data?.items?.[0]?.member, "떠난사람", "H11 참여 행이 지워졔도 사용자 행의 이름을 쓴다 (예전에는 '이전 구성원')");
  const search = await api(fx, "/u/api/tx/search?q=떠난사람&household=house-home");
  eq(search.data?.results?.[0]?.member, "떠난사람", "H11 전 기간 검색도 그 이름을 쓴다");
  const recent = await api(fx, "/u/api/recent-transactions?month=2026-07&household=house-home");
  ok(recent.data?.rows?.some((row) => row.id === "tx-left-1" && row.member === "떠난사람"), "H11 최근 기록 레일도 그 이름을 쓴다");
  const ghost = await api(fx, "/u/api/day-transactions?date=2026-07-07&household=house-home");
  eq(ghost.data?.items?.[0]?.member, "이전 구성원", "아무것도 알 수 없을 때만 '이전 구성원'이다");
});

// ── H12 웹 연결 시도 제한은 코드·IP 묶음으로 센다 ──────────────────────────────
await fixture(async (fx) => {
  const keys = [];
  const restore = intercept(async ({ url, method, init }) => {
    if (method === "POST" && url.pathname.endsWith("/rpc/accountbook_auth_attempt")) keys.push(JSON.parse(init.body).p_key);
    return null;
  });
  const first = await post(fx, "/my/kakao-claim", { kakao_claim_code: "ABCDEFGHJKLMNPQRSTUVWXYZ23456789" }, { cookie: "" });
  const afterFirst = keys.length;
  const second = await post(fx, "/my/kakao-claim", { kakao_claim_code: "23456789ABCDEFGHJKLMNPQRSTUVWXYZ" }, { cookie: "" });
  restore();
  ok(first.status === 401 && second.status === 401, "모르는 코드는 401 로 거절된다");
  ok(afterFirst >= 2 && keys.length >= afterFirst + 2, `시도마다 입장 제한과 코드 제한을 센다 (${keys.length}건)`);
  const firstKeys = new Set(keys.slice(0, afterFirst));
  ok(keys.slice(afterFirst).some((key) => !firstKeys.has(key)), "H12 다른 코드의 시도는 다른 제한 키를 쓴다 (예전에는 IP·클라이언트 키만 세어 같은 IP 사용자 모두가 막혔다)");
  ok(keys.slice(afterFirst).some((key) => firstKeys.has(key)), "같은 IP 의 입장 제한(느슨한 상한)은 그대로 함께 센다");
  ok(source.includes('"/my/kakao-claim", false, { scope: "subject-client", key: claimSubject }'), "H12 코드 해시·IP 묶음 키로 센다");
  ok(!source.includes('"/my/kakao-claim", false, scope === "ip" ? { scope, limit: 20 } : {}'), "H12 IP 20회 상한 키가 남아 있지 않다");
});

// ── U2 알림 배지는 내비가 그려진 뒤에도 찾는다 ───────────────────────────────
{
  const nav = await asset(NAV_JS);
  ok(nav.text.includes('document.dispatchEvent(new CustomEvent("ab:nav-ready"))'), "U2 내비가 배지 자리를 그린 뒤 알린다");
  const v5 = await asset(V5_JS);
  const notif = v5.text.slice(v5.text.indexOf("function accountbookNotifClientMain"));
  ok(/function setBadge\(\) \{\s*var n = visible\(\)\.length;\s*var badges = document\.querySelectorAll\("\.abV5NotifBadge"\);/.test(notif), "U2 setBadge 가 부를 때마다 배지를 새로 찾는다 (예전에는 시작할 때 한 번만 찾아 빈 목록이었다)");
  ok(notif.includes('document.addEventListener("ab:nav-ready", setBadge);'), "U2 내비가 그려지면 배지를 다시 그린다");
  ok(!/var badges = document\.querySelectorAll\("\.abV5NotifBadge"\);\s*if \(!overlay/.test(notif), "시작할 때 한 번만 찾는 배지 목록이 없다");
}

// ── U4 다크 모드의 로그인·시작 화면 ─────────────────────────────────────────
await fixture(async (fx) => {
  const css = (await asset(SHELL_CSS)).text;
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.demoPanel,.sampleCard,.authIntro,.sampleWindow,.recordCard dl div,.miniRow,.person,.ctaSecondary){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}'), "U4 미리보기·인증 카드가 다크 표면을 받는다 (예전에는 흰 카드 위 밝은 글자)");
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.recordCard,.chatBubble.bot,.miniMark){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}'), "U4 기록 카드·챗봇 말풍선·분류 표식도 다크 표면이다");
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.heroLead,.heroNote,.sectionHead p,.chatCaption,.miniRow span,.recordCard dt,.cardKicker,.metricLine span,.sampleMeta,.summaryList span){color:var(--ab12-muted)!important}'), "U4 보조 글자는 보조 토큰을 쓴다");
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.landingHero h1 strong,.landingPage .ctaSecondary){color:var(--ab12-accent)!important}'), "U4 강조 글자와 보조 버튼 글자도 다크 대비를 지킨다");
  ok(contrast("#edeff3", "#1e2026") >= 4.5 && contrast("#b3bdc9", "#1e2026") >= 4.5 && contrast("#edeff3", "#282b33") >= 4.5, "다크 표면 위 본문·보조 글자 대비가 4.5:1 이상이다");
  const login = await page(fx, "/my", { cookie: "" });
  ok(login.html.includes("abPageLogin") && /accountbook-theme-v\d+\.js/.test(login.html) && login.html.includes(`href="${SHELL_CSS}"`), "로그아웃 시작 화면이 테마 스크립트와 셸을 받아 위 규칙이 닿는다");
});

// ── U5 알림 키에 월(또는 기한)이 들어가 다음 달에 다시 보인다 ──────────────────────
await fixture(async (fx) => {
  fx.db.transactions.push({ id: "tx-uncat-1", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-08", type: "expense", amount: 12000, category: "", memo: "분류 없는 지출", payment_method: "", source: "web", raw_text: "", created_at: "2026-07-08T03:00:00.000Z" });
  const july = await api(fx, "/u/api/notifications?household=house-home&month=2026-07");
  const keys = (july.data?.notifications || []).map((item) => item.key);
  ok(keys.length > 0, `7월에 알림이 있다 (${keys.join(", ")})`);
  ok(keys.every((key) => /:\d{4}-\d{2}(?:-\d{2})?$/.test(key)), `U5 모든 알림 키에 월 또는 기한이 붙는다 (${keys.join(", ")}) — 예전 키는 budget-over·uncat 처럼 달이 없어 한 번 닫으면 다음 달에도 숨었다`);
  ok(keys.includes("uncat:2026-07"), "U5 미분류 알림 키가 uncat:2026-07 이다");
  const june = await api(fx, "/u/api/notifications?household=house-home&month=2026-06");
  ok(!(june.data?.notifications || []).some((item) => item.key === "uncat:2026-07"), "다른 달은 다른 키다");
  const v5 = await asset(V5_JS);
  ok(v5.text.includes("var DISMISS_TTL_MS = 62 * 24 * 60 * 60 * 1000;"), "U5 닫은 기록은 두 달 뒤 만료된다(저장소가 끝없이 자라지 않는다)");
});

// ── U7 지난달 홈의 월간 리포트 링크와 /analysis 리다이렉트 ──────────────────────
await fixture(async (fx) => {
  const home = await page(fx, "/app?month=2026-06&household_id=house-home");
  eq(home.status, 200, "지난달 홈이 열린다");
  ok(home.html.includes('<a href="/my/analysis?month=2026-06&household_id=house-home" class="homeCategoryLink">월간 리포트 →</a>'), "U7 카테고리 비율의 월간 리포트 링크가 보고 있던 달의 분석으로 바로 간다 (예전에는 /analysis 리다이렉트가 조건을 버려 이번 달이 열렸다)");
  ok(!home.html.includes('href="/analysis?'), "홈에 옛 /analysis 주소가 남아 있지 않다");
  const redirect = await page(fx, "/analysis?month=2026-06&household_id=house-home");
  eq(redirect.status, 303, "/analysis 는 사용자 분석으로 보낸다");
  eq(redirect.location, "/my/analysis?month=2026-06&household_id=house-home", "U7 리다이렉트가 조회 조건(월·가계부)을 유지한다");
});

// ── U8 다크 모드 도움말의 입력 예시 ─────────────────────────────────────────
await fixture(async (fx) => {
  const help = await page(fx, "/quick-input-help");
  eq(help.status, 200, "스마트 입력 도움말이 열린다");
  ok(help.html.includes("code{background:#f1f5f9;border-radius:10px;padding:4px 7px;font-family:inherit;font-weight:900;white-space:pre-wrap;color:#111827}"), "U8 입력 예시 글자색을 정한다 (예전에는 다크 본문색을 물려받아 1.05:1)");
  ok(help.html.includes('html[data-ab-resolved-theme="dark"] code{background:#282b33;color:#edeff3}'), "U8 다크 모드의 코드 예시 규칙이 있다");
  const commands = await page(fx, "/kakao-commands", { cookie: "" });
  eq(commands.status, 200, "카카오 명령어 안내가 열린다");
  ok(/<script src="\/assets\/accountbook-theme-v\d+\.js"><\/script>/.test(commands.html), "U8 카카오 명령어 안내에 테마 스크립트가 있다 (예전에는 다크에서도 밝게 그려졌다)");
  ok(commands.html.includes('html[data-ab-resolved-theme="dark"] body{background:#141519;color:#edeff3}') && commands.html.includes('html[data-ab-resolved-theme="dark"] code{background:#282b33;color:#edeff3}'), "U8 카카오 명령어 안내의 다크 규칙");
  ok(commands.html.includes("code{white-space:pre-wrap;background:#f1f5f9;border-radius:10px;padding:6px 8px;font-family:inherit;font-weight:900;color:#111827}"), "U8 카카오 명령어 코드 예시도 글자색을 정한다");
});

// ── U9 포커스된 바로가기 링크와 수정 폼 라벨 대비 ───────────────────────────────
await fixture(async (fx) => {
  const login = await page(fx, "/my", { cookie: "" });
  ok(login.html.includes(".skipLink{position:absolute;left:12px;top:-80px;z-index:10000;background:#111827;color:#fff!important;padding:12px 16px;border-radius:12px;font-weight:800}"), "U9 바로가기 글자색이 공통 링크색(body.abV22812Shell a)보다 우선한다 (예전에는 파란 글자로 2.65:1)");
  ok(contrast("#ffffff", "#111827") >= 4.5, "흰 글자와 검은 바탕은 4.5:1 을 넘는다");
  const css = (await asset(SHELL_CSS)).text;
  ok(css.includes("body.abV22812Shell .abDayDetailEditGrid label{display:grid;gap:5px;min-width:0;color:#475467!important;font-size:11px;font-weight:750}"), "U9 날짜 시트 수정 폼의 11px 라벨이 더 진하다");
  ok(css.includes("body.abV22812Shell :is(.v8-edit-field>span,.v8-spender-readonly>span){color:#475467!important}"), "U9 홈 수정 폼의 11px 라벨도 더 진하다");
  ok(css.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.v8-edit-field>span,.v8-spender-readonly>span){color:var(--ab12-muted)!important}'), "U9 다크 모드에서는 보조 토큰으로 돌아간다");
  ok(contrast("#475467", "#f8fafc") >= 4.5 && contrast("#475467", "#ffffff") >= 4.5, `진한 라벨은 밝은 카드 위에서도 4.5:1 을 넘는다 (${contrast("#475467", "#f8fafc").toFixed(2)}:1)`);
});

// ── U10 보이는 글자가 접근성 이름에 들어간다 ───────────────────────────────────
await fixture(async (fx) => {
  const home = await page(fx, "/app?month=2026-07&household_id=house-home");
  ok(home.html.includes('<a class="abNavBrand" href="/app?month=2026-07&amp;household_id=house-home"><span class="abNavLogo">') && home.html.includes('<span class="abNavBrandText" title="우리집 생활비">우리집 생활비<small>말해가계부</small></span>'), "U10 브랜드 링크의 접근성 이름은 보이는 글자(가계부 이름·말해가계부) 그대로다 (예전에는 고정 '가계부 홈')");
  const reports = await page(fx, "/reports?month=2026-07&household_id=house-home");
  ok(reports.html.includes('aria-label="이전 달 2026-06로 이동">‹ <span>이전 달</span></a>'), "U10 '‹ 이전 달' 화살표 이름에 보이는 글자가 들어간다");
  ok(reports.html.includes('aria-label="다음 달 2026-08로 이동"><span>다음 달</span> ›</a>'), "U10 '다음 달 ›' 화살표도 같다");
  const v5 = await asset(V5_JS);
  ok(v5.text.includes('aria-label=\\"Esc · 검색 닫기\\">Esc</button>') && v5.text.includes('aria-label=\\"Esc · 알림 닫기\\">Esc</button>'), "U10 검색·알림 닫기 버튼 이름에 보이는 Esc 가 들어간다");
  ok(!home.html.includes('aria-label="가계부 홈"'), "고정 이름이 남아 있지 않다");
});

// ── U11 긴 가계부 이름에도 조회 버튼이 화면 안에 있다 ───────────────────────────────
await fixture(async (fx) => {
  const annual = await page(fx, "/annual?year=2026&household_id=house-home");
  ok(annual.html.includes(".filters{display:grid;grid-template-columns:minmax(0,1fr) 130px;gap:8px;margin-top:12px}") && annual.html.includes(".filters select{min-width:0;width:100%}"), "U11 연간 리포트 조회 줄의 가계부 칸이 줄어들 수 있다 (예전에는 1fr 이라 이름 길이만큼 버튼이 밀렸다)");
  const goals = await page(fx, "/goals?month=2026-07&household_id=house-home");
  ok(goals.html.includes(".filters{display:grid;grid-template-columns:minmax(0,1fr) 110px;gap:8px;margin-top:14px}") && goals.html.includes(".filters select{min-width:0;width:100%}"), "U11 저축·목표 조회 줄도 같다");
});

// ── U12 로그아웃 화면은 알림·즐겨찾기 API 를 부르지 않는다 ───────────────────────────
await fixture(async (fx) => {
  const v5 = await asset(V5_JS);
  eq((v5.text.match(/if \(!document\.querySelector\('\.abNavScope\[data-nav-scope="user"\]'\)\)/g) || []).length, 2, "U12 알림·행 즐겨찾기 로드가 사용자 내비가 없으면 요청을 보내지 않는다 (예전에는 로그아웃 화면 6곳에서 401 이 두 번씩 났다)");
  const login = await page(fx, "/my", { cookie: "" });
  ok(login.html.includes(`src="${V5_JS}"`) && !login.html.includes('data-nav-scope="user"'), "로그아웃 시작 화면에는 번들은 있지만 사용자 내비 범위가 없다 — 그래서 위 보호가 이 화면에 적용된다");
  const home = await page(fx, "/app?month=2026-07&household_id=house-home");
  ok(home.html.includes('data-nav-scope="user"'), "로그인 화면에는 사용자 내비 범위가 있어 알림·즐겨찾기를 계속 부른다");
});

// ── U13 사용자 도움말의 운영자 링크는 관리자 세션에서만 보인다 ─────────────────────────
await fixture(async (fx) => {
  const help = await page(fx, "/quick-input-help");
  ok(!help.html.includes('href="/operation-center"') && !help.html.includes('href="/beta-checklist"'), "U13 스마트 입력 도움말에 운영센터·베타 체크 링크가 없다 (예전에는 모두에게 보였다)");
  ok(help.html.includes('href="/quick-input-help"') && help.html.includes('href="/app"'), "사용자용 링크는 그대로다");
  const commands = await page(fx, "/kakao-commands");
  ok(!commands.html.includes('href="/openbuilder-guide"') && !commands.html.includes('href="/beta-start"'), "U13 카카오 명령어 안내에 오픈빌더 설정·베타 시작 링크가 없다");
  const cookie = await adminCookie(fx);
  const adminHelp = await page(fx, "/quick-input-help", { cookie });
  ok(adminHelp.html.includes('href="/operation-center"') && adminHelp.html.includes('href="/beta-checklist"'), "관리자에게는 운영자 링크가 보인다");
  const adminCommands = await page(fx, "/kakao-commands", { cookie });
  ok(adminCommands.html.includes('href="/openbuilder-guide"') && adminCommands.html.includes('href="/beta-start"'), "관리자에게는 오픈빌더 설정·베타 시작이 보인다");
});

// ── U14 일반 참여자에게 관리자 전용 메뉴를 표시한다 ───────────────────────────────
await fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const memberHome = await page(fx, "/app?month=2026-07&household_id=house-home", { cookie: wifi });
  eq(memberHome.status, 200, "일반 참여자의 홈이 열린다");
  const nav = navOf(memberHome.html);
  ok(nav.includes('<a data-key="members" class="abNavAdminOnly" href="/my/members?month=2026-07&amp;household_id=house-home" title="관리자 전용">'), "U14 참여자·초대 메뉴가 관리자 전용으로 표시된다 (예전에는 누르면 403 화면)");
  ok(nav.includes('<a data-key="groups" class="abNavAdminOnly" href="/my/groups?month=2026-07&amp;household_id=house-home" title="관리자 전용">'), "U14 단톡방 연결 메뉴도 표시된다");
  eq((nav.match(/<small class="abNavAdminTag">관리자 전용<\/small>/g) || []).length, 2, "표시는 두 항목에만 붙는다");
  eq((nav.match(/<a data-key="/g) || []).length, 20, "목적지 수는 20개 그대로다(숨기지 않는다)");
  const ownerHome = await page(fx, "/app?month=2026-07&household_id=house-home");
  ok(!ownerHome.html.includes("abNavAdminOnly"), "소유자에게는 표시가 없다");
  const memberMenu = await page(fx, "/menu?month=2026-07&household_id=house-home", { cookie: wifi });
  ok(memberMenu.html.includes("관리자 전용 · 구성원과 권한 관리"), "U14 전체 메뉴의 참여자·초대 줄도 관리자 전용을 말한다");
  const memberBackup = await page(fx, "/my/backup?month=2026-07&household_id=house-home", { cookie: wifi });
  ok(memberBackup.status === 200 && navOf(memberBackup.html).includes("abNavAdminOnly"), "U14 옛 사이드바를 승격한 화면(백업)도 역할을 읽어 표시한다");
  const ownerBackup = await page(fx, "/my/backup?month=2026-07&household_id=house-home");
  ok(ownerBackup.status === 200 && !ownerBackup.html.includes("abNavAdminOnly"), "승격한 화면도 소유자에게는 표시가 없다");
  const css = (await asset(SHELL_CSS)).text;
  ok(css.includes("body.abV22812Shell .abNavAdminTag{margin-left:auto;padding-left:6px;font-size:10px;font-weight:800;color:var(--ab12-muted);white-space:nowrap}"), "표시 글자는 보조 토큰(4.5:1)을 쓴다");
});

// ── N12 목표 마감월·즐겨찾기 날짜를 검증한다 ─────────────────────────────────────
await fixture(async (fx) => {
  const badDeadline = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "create", name: "틀린 마감", target: 10000, deadline: "2026-13" });
  eq(badDeadline.status, 400, "N12 13월 마감은 400 이다 (예전에는 '2026-13' 그대로 저장)");
  eq(badDeadline.data?.reason, "invalid_deadline", "N12 이유 코드 invalid_deadline");
  ok(!settingValue(fx, "goals:v5:house-home"), "거절한 목표는 저장하지 않는다");
  const good = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "create", name: "맞는 마감", target: 10000, deadline: "2026-12" });
  eq(good.status, 200, "YYYY-MM 마감은 저장된다");
  eq(good.data?.goals?.[0]?.deadline, "2026-12", "마감월이 그대로 남는다");
  const id = good.data?.goals?.[0]?.id;
  eq((await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "update", id, deadline: "2026/12" })).status, 400, "N12 수정의 틀린 마감도 400 이다");
  eq((await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "update", id, deadline: "" })).status, 200, "마감을 비우는 수정은 된다");
  const badDate = await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "fav-bad-date", tx: { id: "fav-bad-date", type: "expense", amount: 1000, memo: "x", transaction_date: "2026-02-30" } });
  eq(badDate.status, 400, "N12 2월 30일 즐겨찾기는 400 이다 (예전에는 그대로 저장)");
  eq(badDate.data?.reason, "invalid_date", "N12 이유 코드 invalid_date");
  eq((await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "fav-bad-month", tx: { id: "fav-bad-month", type: "expense", amount: 1000, transaction_date: "2026-07-04", month: "2026-7" } })).status, 400, "N12 틀린 월 표기도 400 이다");
  const goodFavorite = await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "fav-good", tx: { id: "fav-good", type: "expense", amount: 1000, transaction_date: "2026-07-04" } });
  eq(goodFavorite.status, 200, "맞는 날짜의 즐겨찾기는 저장된다");
  eq(goodFavorite.data?.favorites?.[0]?.month, "2026-07", "월은 날짜에서 만든다");
  ok(!String(settingValue(fx, "favorites:v5:house-home:user-bin") || "").includes("2026-02-30"), "틀린 날짜는 저장소에 없다");
});

done();
