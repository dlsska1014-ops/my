// V22.9.80 역할·권한 표시 묶음 검사 (V79 T-21·T-22·T-23·T-34·T-35).
//   T-21  내비(web/unified-nav.js)를 그리는 88곳 가운데 17곳만 역할을 넘겨, 구성원이 /reports·/annual·/settlement-summary 등에서 꼬리표 없는 관리자 전용 링크
//         (참여자·초대, 단톡방 연결 — 누르면 403)를 봤다. 사용자 범위 내비는 이제 소유자·관리자로 확인된 경우에만 표시를 빼고(역할을 모르면 보수적으로 붙인다),
//         역할을 아는 화면은 역할을 넘긴다. 관리자(운영자) 세션 화면은 예전처럼 표시가 없다.
//   T-22  시작가이드(/start-guide)·베타 시작(/beta-start)이 구성원에게 /my/settings·/my/groups·/my/members 링크(403)를 보였다 → 역할에 맞는 링크.
//   T-23  예산 센터(admin/budget-center-recurring.js)의 /my/settings 바닥 링크는 html-postprocess 가 카드를 바꿔 그려 화면에 나온 적 없는 죽은 마크업이었다 → 지움.
//   T-34  기록 입력·수정·삭제와 정기 항목 저장·삭제·반영의 실제 거절(조회 전용·승인 대기·이용 제한·관리 권한 없음)이 자유 문장이라 홈·정기 화면에서
//         ‘입력값을 확인한 뒤 다시 시도해 주세요’로 보였다 → 코드를 보내고 formatMessage 가 안내한다.
//   T-35  역할 조회가 실패(503)하면 ‘권한 없음’으로 읽던 곳(예산 저장·삭제, 정기 항목 추가·수정·삭제, 자산·결제수단, 홈 구성·표시 설정) → 엄격한 조회:
//         실패는 household_role_check_failed 로 알리고 아무것도 바꾸지 않는다. 진짜 거절은 그대로 거절이고, 조회는 요청마다 한 번이다.
// 서버가 그린 화면·리다이렉트는 app.fetch 로 보고, 내비의 역할 규칙은 소스 모듈을 직접 불러 확인한다.
// 사용: node validation/validate-roles-v22980.mjs [nav|guides|footer|denials|lookup|source]
// V22980_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 코드에서 몇 개가 실패하는지 세기 위해). V22980_LIST=1 을 함께 주면 통과한 검사도 모두 적는다.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BASE, counter, failure, fixture, intercept, page, post, withClock } from "./lib-audit-v22934.mjs";
import { formatMessage } from "../src/index.js";
import { renderUnifiedNav } from "../src/modules/web/unified-nav.js";

const SOFT = process.env.V22980_SOFT === "1";
const only = process.argv[2] || "";
const run = (name) => !only || only === name;
const base = counter("V22.9.80 역할·권한 표시 검사 통과");
const failures = [];
const checkLog = [];
let softChecks = 0;
const t = {
  ok(value, message) {
    if (SOFT) { softChecks += 1; checkLog.push([!!value, message]); if (!value) failures.push(message); return; }
    base.ok(value, message);
  },
  eq(actual, expected, message) {
    if (SOFT) { softChecks += 1; checkLog.push([actual === expected, message]); if (actual !== expected) failures.push(`${message} (받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`); return; }
    base.eq(actual, expected, message);
  },
};
async function section(name, task) {
  if (!run(name)) return;
  try { await task(); } catch (error) {
    if (!SOFT) throw error;
    softChecks += 1;
    failures.push(`${name} 구간이 끝까지 못 돌았다 — ${String(error?.stack || error).split("\n").slice(0, 2).join(" | ").slice(0, 200)}`);
  }
}

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const read = (relative) => readFileSync(path.join(ROOT, ...relative.split("/")), "utf8");
const HH = "house-home";
const MONTH = "2026-07";
const decode = (value) => String(value || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const text = (html) => decode(String(html || "").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim());
const GENERIC = decode(formatMessage("not_a_known_code_v22980"));
const tagged = (html, key) => new RegExp(`<a data-key="${key}" class="[^"]*abNavAdminOnly`).test(html);
const errOf = (location) => new URL(location || "/", BASE).searchParams.get("err");

// ── 라우터에서 화면 주소를 모아 내비가 있는 화면을 찾는다 ─────────────────────────────────────
const routerSource = read("src/modules/worker/router.js");
const SKIP = /^\/(skill|cron|internal|api|u\/api|admin\/|ops-monitor)|logout|\.json$|\.csv$|\/save$|\/delete$|\/update$|\/create$|\/apply$|\/join$|\/leave$|\/remove$|\.xml$|\.txt$|\.png$|\.ico$|^\/health|^\/assets/;
const ROUTE_PATHS = [...new Set([...routerSource.matchAll(/url\.pathname === "([^"]+)"/g)].map((m) => m[1]))].sort().filter((p) => !SKIP.test(p));
async function crawl(fx, cookie, paths = ROUTE_PATHS) {
  const found = new Map();
  for (const p of paths) {
    let response;
    try { response = await page(fx, `${p}${p.includes("?") ? "&" : "?"}month=${MONTH}&household_id=${HH}`, { cookie }); } catch (_) { continue; }
    const html = response.html || "";
    if (!/<a data-key="members"/.test(html)) continue;
    found.set(p, { status: response.status, scope: (html.match(/data-nav-scope="([a-z]+)"/) || [])[1] || "", members: tagged(html, "members"), groups: tagged(html, "groups") });
  }
  return found;
}
const bothTagged = (info) => !!info && info.members && info.groups;
const noneTagged = (info) => !!info && !info.members && !info.groups;

// 역할을 화면이 아는 사용자 화면(소유자에게는 표시가 없어야 한다)과, 관리자(운영자) 세션에서 예전처럼 표시가 없어야 하는 화면.
const KNOWN_ROLE_PAGES = ["/app", "/m", "/menu", "/reports", "/annual", "/annual-report", "/settlement-summary", "/split-summary", "/meeting-settlement", "/payment-methods",
  "/budget-alerts", "/today-budget", "/monthly-forecast", "/fixed-preview", "/budgets", "/reserve-plans", "/goals", "/savings-goals", "/home-layout", "/smart-tools",
  "/my/premium", "/my/analysis", "/my/households", "/my/members", "/my/groups", "/my/settings", "/my/backup", "/keyword-guide", "/households", "/start-guide",
  "/meeting-households", "/household-templates", "/travel-households"];
const OPERATOR_UNTAGGED = ["/app", "/budgets", "/reserve-plans", "/payment-methods", "/annual", "/goals", "/savings-goals", "/home-layout", "/menu", "/start-guide",
  "/meeting-households", "/backup", "/backup/preview", "/backup/compare", "/backup/select", "/backup/final-check", "/backup/import-history", "/backup/rollback-candidates",
  "/backup/rollback-final-check", "/categories", "/kakao-group-links"];

// ── T-21 ① 내비 규칙(소스 모듈을 직접 호출) ─────────────────────────────────────────────────
await section("nav", async () => {
  const nav = (role, extra = {}) => renderUnifiedNav("budgets", { month: MONTH, householdId: HH, householdName: "우리집", ...(role === undefined ? {} : { role }), ...extra });
  const tags = (html) => (html.match(/<small class="abNavAdminTag">관리자 전용<\/small>/g) || []).length;
  t.ok(tagged(nav(undefined), "members") && tagged(nav(undefined), "groups"), "역할을 넘기지 않은 사용자 범위 내비는 참여자·초대와 단톡방 연결에 ‘관리자 전용’을 붙인다(보수적)");
  t.eq(tags(nav(undefined)), 2, "표시는 그 두 항목에만 붙는다");
  for (const role of ["member", "viewer", "pending", "blocked"]) {
    t.ok(tagged(nav(role), "members") && tagged(nav(role), "groups"), `역할 ${role}: 두 링크에 표시가 붙는다`);
  }
  for (const role of ["owner", "admin", " Owner ", "ADMIN"]) {
    t.ok(!tagged(nav(role), "members") && !tagged(nav(role), "groups") && tags(nav(role)) === 0, `역할 ${JSON.stringify(role)}: 표시가 없다`);
  }
  t.ok(!tagged(nav(""), "members") && tags(nav("")) === 0, "빈 문자열(\"\")로 넘긴 화면 = 가계부 역할이 없는 관리자(운영자) 세션 화면은 예전처럼 표시가 없다");
  t.ok(tags(renderUnifiedNav("operation-center", { showOps: true })) === 0 && tags(renderUnifiedNav("operation-center", { scope: "ops" })) === 0, "운영(ops) 범위 내비는 역할을 안 넘겨도 표시가 없다");
  t.ok(tags(renderUnifiedNav("settings")) === 0 && tags(renderUnifiedNav("households")) === 0 && tags(renderUnifiedNav("home", { scope: "admin" })) === 0, "관리자(admin) 범위 내비도 표시가 없다");
  t.eq((nav(undefined).match(/<a data-key="/g) || []).length, (nav("owner").match(/<a data-key="/g) || []).length, "표시를 붙여도 목적지 수는 그대로다(숨기지 않는다)");
  t.ok(nav(undefined).includes("href=\"/my/members?month=2026-07&amp;household_id=house-home\"") && nav(undefined).includes("href=\"/my/groups?month=2026-07&amp;household_id=house-home\""), "링크 주소는 그대로다");
});

// ── T-21 ② 실제 화면: 라우터의 모든 화면을 역할별로 열어 본다 ───────────────────────────────────────
await section("nav", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const wifiMembership = fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH);
  const memberPages = await crawl(fx, wifi);
  t.ok(memberPages.size >= 50, `구성원이 열 수 있는 내비 화면을 ${memberPages.size}개 찾았다(50개 이상 — 몇 개만 보고 통과하지 않게)`);
  for (const [p, info] of memberPages) {
    if (info.scope === "user") t.ok(bothTagged(info), `구성원 ${p}: 내비의 참여자·초대와 단톡방 연결에 ‘관리자 전용’이 붙는다`);
  }
  for (const p of ["/reports", "/annual", "/settlement-summary", "/payment-methods", "/budget-alerts", "/smart-tools", "/my/premium", "/today-budget", "/monthly-forecast", "/fixed-preview", "/meeting-households"]) {
    t.ok(memberPages.has(p), `구성원이 ${p} 를 연다(내비가 있다)`);
  }
  wifiMembership.role = "viewer";
  const viewerPages = await crawl(fx, wifi, [...memberPages.keys()]);
  t.ok(viewerPages.size >= 50, `조회 전용도 내비 화면을 ${viewerPages.size}개 연다(50개 이상)`);
  const viewerUntagged = [...viewerPages].filter(([, info]) => info.scope === "user" && !bothTagged(info)).map(([p]) => p);
  t.eq(viewerUntagged.join(" "), "", "조회 전용: 사용자 범위 내비 화면에 표시가 빠진 곳이 없다");
  wifiMembership.role = "member";

  const ownerPages = await crawl(fx, fx.cookie);
  for (const p of KNOWN_ROLE_PAGES) t.ok(noneTagged(ownerPages.get(p)), `소유자 ${p}: 화면이 역할을 알아 표시가 없다`);

  fx.env.ADMIN_PASSWORD = "roles-v22980-admin-password";
  fx.env.ADMIN_SESSION_SECRET = "roles-v22980-admin-session-secret";
  const login = await post(fx, "/login", { password: fx.env.ADMIN_PASSWORD }, { cookie: "" });
  const adminCookie = (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
  t.ok(!!adminCookie, "관리자 세션 쿠키를 얻었다");
  const operatorPages = await crawl(fx, adminCookie);
  for (const p of OPERATOR_UNTAGGED) t.ok(noneTagged(operatorPages.get(p)), `관리자 세션 ${p}: 예전처럼 표시가 없다`);
  const operatorTagged = [...operatorPages].filter(([, info]) => info.scope !== "user" && (info.members || info.groups)).map(([p]) => p);
  t.eq(operatorTagged.join(" "), "", "운영·관리자 범위 화면은 어느 것에도 표시가 없다");
})));

// ── T-22 시작가이드·베타 시작: 구성원에게 403 링크를 보이지 않는다 ───────────────────────────────────────
await section("guides", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const wifiMembership = fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH);
  const withoutNav = (html) => html.replace(/<a data-key="[^"]*"[\s\S]*?<\/a>/g, "");
  const adminHrefs = (html) => [...withoutNav(html).matchAll(/href="(\/my\/(?:settings|groups|members)[^"]*)"/g)].map((m) => decode(m[1]));
  const panelHref = (html, id) => decode((html.match(new RegExp(`<section class="tabPanel[^"]*" data-panel="${id}">[\\s\\S]*?<a class="goBtn" href="([^"]+)">`)) || [, ""])[1]);
  const q = `month=${MONTH}&household_id=${HH}`;
  for (const route of ["/start-guide", "/beta-start"]) {
    const owner = await page(fx, `${route}?${q}`);
    t.eq(owner.status, 200, `소유자 ${route} 가 열린다`);
    t.ok(adminHrefs(owner.html).length >= 3, `소유자 ${route}: 예산·단톡방·참여자 링크가 그대로 있다(${adminHrefs(owner.html).length}개)`);
    for (const role of ["member", "viewer"]) {
      wifiMembership.role = role;
      const response = await page(fx, `${route}?${q}`, { cookie: wifi });
      t.eq(response.status, 200, `${role} ${route} 가 열린다`);
      t.eq(adminHrefs(response.html).join(" "), "", `${role} ${route}: 소유자·관리자 전용 주소(/my/settings·/my/groups·/my/members) 링크가 본문에 없다`);
    }
  }
  wifiMembership.role = "member";
  const guide = await page(fx, `/start-guide?${q}`, { cookie: wifi });
  t.ok(/^\/budgets\?/.test(panelHref(guide.html, "settings")), "구성원 시작가이드: ‘예산·키워드’ 탭은 볼 수 있는 예산 화면(/budgets)으로 간다");
  t.eq(panelHref(guide.html, "group"), "/kakao-commands", "구성원 시작가이드: 단톡방 탭은 챗봇 명령어 안내로 간다(연결은 관리자가 한다)");
  t.eq(panelHref(guide.html, "members"), "/my/profile", "구성원 시작가이드: 참여자 탭은 내 표시 이름(/my/profile)으로 간다");
  const ownerGuide = await page(fx, `/start-guide?${q}`);
  t.ok(/^\/my\/settings\?/.test(panelHref(ownerGuide.html, "settings")) && /^\/my\/groups\?/.test(panelHref(ownerGuide.html, "group")) && /^\/my\/members\?/.test(panelHref(ownerGuide.html, "members")), "소유자 시작가이드의 탭 링크는 그대로다");
  const optional = (html) => [...(html.match(/<details class="card"><summary><b>함께 쓰기[\s\S]*?<\/details>/) || [""])[0].matchAll(/<a class="goBtn" href="[^"]*">([^<]*)<\/a>/g)].map((m) => m[1].replace(/^✓ /, ""));
  t.ok(!optional(guide.html).includes("참여자 초대") && !optional(guide.html).includes("단톡방 연결") && optional(guide.html).includes("예산 보기"), `구성원 시작가이드의 ‘추가 설정’에는 참여자 초대·단톡방 연결이 없고 ‘예산 보기’가 있다(${optional(guide.html).join(",")})`);
  t.ok(optional(ownerGuide.html).includes("참여자 초대") && optional(ownerGuide.html).includes("단톡방 연결") && optional(ownerGuide.html).includes("예산·분류"), "소유자의 ‘추가 설정’은 그대로다");
  const beta = await page(fx, `/beta-start?${q}`, { cookie: wifi });
  t.ok(/href="\/budgets\?[^"]*">예산 보기<\/a>/.test(decode(beta.html)), "구성원 베타 시작의 6단계는 ‘예산 보기’(/budgets)다");
  for (const target of ["/budgets", "/my/profile", "/kakao-commands"]) {
    const reached = await page(fx, `${target}?${q}`, { cookie: wifi });
    t.eq(reached.status, 200, `구성원이 대신 가는 ${target} 는 실제로 열린다`);
  }
})));

// ── T-23 화면에 나온 적 없는 /my/settings 바닥 링크 마크업 ───────────────────────────────────────
await section("footer", async () => {
  const source = read("src/modules/admin/budget-center-recurring.js");
  t.eq((source.match(/정기지출·분류 키워드 설정/g) || []).length, 0, "예산 센터 소스에서 죽은 바닥 링크(‘정기지출·분류 키워드 설정’)를 지웠다");
  t.ok(!/<a href="\/my\/settings\?\$\{hh\}">/.test(source), "예산 센터 소스에 /my/settings?${hh} 바닥 링크 마크업이 없다");
  await withClock("2026-07-15", () => fixture(async (fx) => {
    const wifi = await fx.cookieFor("user-wifi");
    for (const [label, cookie] of [["소유자", fx.cookie], ["구성원", wifi]]) {
      const response = await page(fx, `/budgets?month=${MONTH}&household_id=${HH}`, { cookie });
      t.eq(response.status, 200, `${label} 예산 화면이 열린다`);
      t.ok(!response.html.includes("정기지출·분류 키워드 설정") && response.html.includes("<details class=\"card calculationHelp\"><summary>계산 기준 보기</summary>"), `${label} 예산 화면: ‘계산 기준’은 접이식 카드이고 바닥 링크는 없다(화면은 예전과 같다)`);
    }
  }));
});

// ── T-34 실제 거절은 코드로 보내 안내한다 ─────────────────────────────────────────────────────
await section("denials", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const wifiMembership = () => fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH);
  const back = `/app?month=${MONTH}&household_id=${HH}`;
  const base = { household_id: HH, month: MONTH, return_to: back };
  const addValues = { ...base, type: "expense", transaction_date: "2026-07-10", amount: "5000", category: "식비", memo: "거절 확인", payment_method: "현금" };
  const rowsBefore = fx.db.transactions.length;
  const shown = async (response, cookie = wifi) => (response.location.startsWith("/") ? text((await page(fx, response.location, { cookie })).html) : "");

  // formatMessage 표: 새 코드마다 일반 안내가 아닌 자기 안내가 있다.
  const CODES = { write_denied_viewer: "조회 전용", write_denied_pending: "승인을 기다리는", write_denied_blocked: "이용이 제한", write_denied_not_member: "참여자가 아니어서", household_scope: "참여자가 아니거나", manage_required: "소유자 또는 관리자만", not_my_record: "내가 만든 기록", household_role_check_failed: "권한을 확인하지 못해" };
  for (const [code, needle] of Object.entries(CODES)) {
    const message = decode(formatMessage(code));
    t.ok(message !== GENERIC && message.includes(needle), `formatMessage(${code}) 는 일반 안내가 아닌 자기 안내를 한다`);
  }

  // 조회 전용(viewer): 기록 입력·수정·삭제·수정 화면
  wifiMembership().role = "viewer";
  const add = await post(fx, "/admin/transactions", addValues, { cookie: wifi });
  t.eq(errOf(add.location), "write_denied_viewer", "조회 전용의 기록 입력 거절은 코드(write_denied_viewer)로 간다");
  t.ok((await shown(add)).includes("조회 전용 권한이라 기록을 추가·수정·삭제할 수 없습니다"), "홈이 ‘조회 전용 권한이라 기록을 …할 수 없습니다’ 라고 안내한다(입력값 오류 문구가 아니다)");
  t.ok(!(await shown(add)).includes(GENERIC), "홈은 일반 오류 문구로 닫지 않는다");
  const del = await post(fx, "/admin/delete", { ...base, id: "tx-expense-1" }, { cookie: wifi });
  t.eq(errOf(del.location), "write_denied_viewer", "조회 전용의 기록 삭제 거절도 코드로 간다");
  const upd = await post(fx, "/admin/update", { ...base, id: "tx-expense-1", type: "expense", transaction_date: "2026-07-04", amount: "150000", category: "식비" }, { cookie: wifi });
  t.eq(errOf(upd.location), "write_denied_viewer", "조회 전용의 기록 수정 거절도 코드로 간다");
  const edit = await page(fx, `/transactions/edit?id=tx-expense-1&return_to=${encodeURIComponent(back)}`, { cookie: wifi });
  t.eq(errOf(edit.location), "write_denied_viewer", "조회 전용이 수정 화면 주소를 열면 코드로 돌려보낸다(이 화면의 주소에는 가계부 id 가 없어도)");
  t.ok((await shown(edit)).includes("조회 전용 권한이라"), "수정 화면 거절도 홈에서 알아볼 수 있게 안내한다");
  // 기록 id 가 어느 가계부에 있는지·있는지 없는지는 거절 문구로 새지 않는다.
  const missing = await post(fx, "/admin/delete", { ...base, id: "tx-nope" }, { cookie: wifi });
  const elsewhere = await post(fx, "/admin/delete", { ...base, id: "tx-trip-1" }, { cookie: wifi });
  t.eq(errOf(missing.location), "not_my_record", "없는 기록 삭제는 not_my_record 다");
  t.eq(missing.location, elsewhere.location, "다른 가계부의 기록 삭제도 없는 기록과 똑같은 거절이다(가계부·존재 여부가 새지 않는다)");
  const editMissing = await page(fx, `/transactions/edit?id=tx-nope&return_to=${encodeURIComponent(back)}`, { cookie: wifi });
  const editElsewhere = await page(fx, `/transactions/edit?id=tx-trip-1&return_to=${encodeURIComponent(back)}`, { cookie: wifi });
  t.eq(editMissing.location, editElsewhere.location, "수정 화면도 없는 기록과 다른 가계부의 기록을 구별하지 않는다");
  t.eq(fx.db.transactions.length, rowsBefore, "거절된 요청은 아무 기록도 바꾸지 않았다");

  // 승인 대기·이용 제한·참여자 아님
  wifiMembership().role = "pending";
  t.eq(errOf((await post(fx, "/admin/transactions", addValues, { cookie: wifi })).location), "write_denied_pending", "승인 대기의 기록 입력 거절은 write_denied_pending");
  wifiMembership().role = "blocked";
  t.eq(errOf((await post(fx, "/admin/transactions", addValues, { cookie: wifi })).location), "write_denied_blocked", "이용 제한의 기록 입력 거절은 write_denied_blocked");
  t.eq(errOf((await post(fx, "/admin/update", { ...base, id: "tx-expense-1", type: "expense", transaction_date: "2026-07-04", amount: "1", category: "식비" }, { cookie: wifi })).location), "write_denied_blocked", "이용 제한의 기록 수정 거절도 write_denied_blocked");
  fx.db.household_members = fx.db.household_members.filter((m) => !(m.user_id === "user-wifi" && m.household_id === HH));
  t.eq(errOf((await post(fx, "/admin/transactions", addValues, { cookie: wifi })).location), "write_denied_not_member", "참여자가 아닌 사람의 기록 입력 거절은 write_denied_not_member");
  fx.db.household_members.push({ household_id: HH, user_id: "user-wifi", role: "member", created_at: "2026-07-02T00:00:00.000Z" });

  // 구성원이 남의 기록을 고치려 할 때는 예전처럼 not_my_record
  t.eq(errOf((await post(fx, "/admin/delete", { ...base, id: "tx-income-1" }, { cookie: wifi })).location), "not_my_record", "구성원이 남의 기록을 지우려 하면 not_my_record");

  // 정기 항목 화면: 조회 전용·구성원은 manage_required 를 안내로 본다
  for (const role of ["viewer", "member"]) {
    wifiMembership().role = role;
    for (const [label, route, values] of [
      ["저장", "/admin/recurring/save", { household_id: HH, month: MONTH, type: "expense", memo: "구독", amount: "9900", category: "구독", day_of_month: "1", user_id: "user-wifi" }],
      ["삭제", "/admin/recurring/delete", { household_id: HH, month: MONTH, id: "recurring-rent" }],
      ["반영", "/admin/recurring/apply", { household_id: HH, month: MONTH }],
    ]) {
      const response = await post(fx, route, values, { cookie: wifi });
      t.eq(errOf(response.location), "manage_required", `${role} 의 정기 항목 ${label} 거절은 코드(manage_required)로 간다`);
      const html = await shown(response);
      t.ok(html.includes("가계부 소유자 또는 관리자만 변경할 수 있습니다") && !html.includes(GENERIC), `${role} 정기 항목 ${label}: 정기 화면이 ‘소유자 또는 관리자만 변경할 수 있습니다’ 라고 안내한다`);
    }
  }
  wifiMembership().role = "member";

  // 홈 구성·표시 설정의 가계부 범위 거절(household_scope)도 안내가 있다.
  const stranger = await post(fx, "/home-layout/save", { household_id: "house-nope", month: MONTH });
  t.eq(errOf(stranger.location), "household_scope", "참여하지 않은 가계부의 홈 구성 저장 거절은 household_scope");
  t.ok((await shown(stranger, fx.cookie)).includes("참여자가 아니거나 승인 대기·이용 제한 상태여서 설정을 저장하지 않았습니다"), "홈이 household_scope 를 안내한다");
  t.eq(fx.db.transactions.length, rowsBefore, "거절된 요청이 기록을 만들지 않았다");
})));

// ── T-35 역할 조회가 실패하면 ‘권한 없음’이 아니라 ‘확인하지 못함’ ────────────────────────────────────────
await section("lookup", () => withClock("2026-07-15", () => fixture(async (fx) => {
  const wifi = await fx.cookieFor("user-wifi");
  const scope = { household_id: HH, month: MONTH };
  const budgetBack = `/budgets?month=${MONTH}&household_id=${HH}`;
  const LOOKUP_FAILED_TEXT = "권한을 확인하지 못해 아무것도 바꾸지 않았습니다. 잠시 후 다시 시도해 주세요.";
  const reserveValues = { ...scope, name: "검증항목", amount: "100000", type: "expense", recurrence: "annual", due_month_1: "9", due_day: "16", category: "세금/수수료" };
  const CASES = [
    ["예산 저장", "/admin/budget/save", { ...scope, category: "식비", amount: "300000", return_to: budgetBack }, "code"],
    ["예산 삭제", "/admin/budget/delete", { ...scope, category: "식비", return_to: budgetBack }, "code"],
    ["정기 항목 추가", "/admin/reserve-plan/create", reserveValues, "code"],
    ["정기 항목 수정", "/admin/reserve-plan/update", { ...reserveValues, id: "reserve-1", name: "자동차보험" }, "code"],
    ["정기 항목 삭제", "/admin/reserve-plan/delete", { ...scope, id: "reserve-1" }, "code"],
    ["자산·결제수단 추가", "/admin/payment-asset/create", { ...scope, name: "새통장", kind: "bank_account", balance: "1000" }, "text"],
    ["자산·결제수단 삭제", "/admin/payment-asset/delete", { ...scope, id: "asset-1" }, "text"],
    ["홈 구성 저장", "/home-layout/save", scope, "code"],
    ["표시 설정 저장", "/cursor-preference/save", scope, "code"],
  ];
  const snapshot = () => JSON.stringify([fx.db.accountbook_budgets, fx.db.accountbook_settings, fx.db.transactions]);
  const before = snapshot();
  for (const [label, route, values, kind] of CASES) {
    let reads = 0;
    const restore = intercept(({ url, method }) => {
      if (method === "GET" && url.pathname.endsWith("/household_members")) { reads += 1; return failure(503, "role table down"); }
      return null;
    });
    let response;
    try { response = await post(fx, route, values); } finally { restore(); }
    const err = errOf(response.location);
    if (kind === "code") t.eq(err, "household_role_check_failed", `${label}: 역할 조회가 실패하면 household_role_check_failed 로 알린다(‘권한 없음’이 아니다)`);
    else t.eq(err, LOOKUP_FAILED_TEXT, `${label}: 역할 조회가 실패하면 ‘권한을 확인하지 못해 …’ 로 알린다(‘소유자와 관리자만 …’이 아니다)`);
    t.eq(reads, 1, `${label}: 역할 조회는 요청마다 한 번이다(읽기 ${reads}번)`);
    t.eq(snapshot(), before, `${label}: 조회가 실패했으면 아무것도 바꾸지 않는다`);
    const html = response.location.startsWith("/") ? text((await page(fx, response.location)).html) : "";
    t.ok(html.includes("권한을 확인하지 못해 아무것도 바꾸지 않았습니다") && !html.includes(GENERIC), `${label}: 돌아간 화면이 ‘권한을 확인하지 못해 아무것도 바꾸지 않았습니다’ 라고 보여 준다`);
  }

  // 진짜 거절은 그대로 거절이다(구성원 = 관리 권한 없음, 참여자 아님 = 가계부 범위 밖).
  const manageDenied = { "예산 저장": "manage_required", "예산 삭제": "manage_required", "정기 항목 추가": "manage_required", "정기 항목 수정": "manage_required", "정기 항목 삭제": "manage_required" };
  for (const [label, route, values, kind] of CASES) {
    if (Object.hasOwn(manageDenied, label)) {
      const denied = await post(fx, route, values, { cookie: wifi });
      t.eq(errOf(denied.location), manageDenied[label], `${label}: 구성원의 실제 거절은 ${manageDenied[label]} 로 간다`);
    } else if (kind === "text") {
      const denied = await post(fx, route, values, { cookie: wifi });
      t.eq(errOf(denied.location), "자산·결제수단 관리는 가계부 소유자와 관리자만 할 수 있습니다.", `${label}: 구성원의 실제 거절은 ‘소유자와 관리자만 …’ 이다`);
    }
  }
  t.eq(snapshot(), before, "구성원의 거절된 요청도 아무것도 바꾸지 않았다");
  for (const route of ["/home-layout/save", "/cursor-preference/save"]) {
    const outsider = await post(fx, route, { household_id: "house-nope", month: MONTH });
    t.eq(errOf(outsider.location), "household_scope", `${route}: 참여하지 않은 가계부는 조회가 성공해도 household_scope 로 거절한다`);
  }

  // 조회가 성공하는 보통의 경우는 그대로 저장된다.
  const saved = await post(fx, "/admin/budget/save", { ...scope, category: "식비", amount: "310000", return_to: budgetBack });
  t.eq(errOf(saved.location), null, "소유자의 예산 저장은 보통 때처럼 성공한다");
  t.eq(fx.db.accountbook_budgets.find((row) => row.category === "식비" && row.month === MONTH)?.amount, 310000, "저장된 예산 금액이 바뀌었다");
  const created = await post(fx, "/admin/reserve-plan/create", reserveValues);
  t.eq(errOf(created.location), null, "소유자의 정기 항목 추가는 보통 때처럼 성공한다");
  const layout = await post(fx, "/home-layout/save", scope);
  t.eq(errOf(layout.location), null, "소유자의 홈 구성 저장은 보통 때처럼 성공한다");
})));

// ── T-35 소스: 이 화면들이 느슨한 조회(getHouseholdMemberRole)를 더는 쓰지 않는다 ──────────────────────────
await section("source", async () => {
  for (const file of ["admin/pc-analysis-calendar.js", "settings/payment-assets.js", "settings/reserve-plans.js", "my/money-plan-home-layout.js"]) {
    t.ok(!/\bgetHouseholdMemberRole\b/.test(read(`src/modules/${file}`)), `${file} 는 실패를 빈 역할로 바꾸는 getHouseholdMemberRole 을 쓰지 않는다`);
  }
});

if (SOFT) {
  console.log(`V22980_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  if (process.env.V22980_LIST === "1") for (const [pass, message] of checkLog) console.log(`  ${pass ? "통과" : "실패"}: ${message}`);
  else for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
