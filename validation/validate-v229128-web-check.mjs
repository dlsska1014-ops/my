// 2026-11-17 운영 웹 확인(공개 화면)에서 나온 두 가지.
//  W-1 머리말 안내문의 ‘접기’ 단추는 그 단추를 움직이는 테마 스크립트(bindHeadNotes)와 꾸미는 셸 스타일시트
//      (body.abV22812Shell .abHeadNote …)가 함께 실린 화면에만 붙는다. 로그인 전 /start-guide 는 셸이 없는데도
//      단추가 붙어, 눌러도 아무 일이 없는 기본 모양 단추가 보였다.
//  W-2 없는 주소 화면(404)의 제목이 휴대폰 폭에서 낱말 가운데(‘없습니/다.’)에서 꺾이지 않게 낱말 단위로 줄을 바꾼다.
// 오프라인: 픽스처 + app.fetch(DB·바깥 요청 없음), 시계 2026-07-15 12:00 KST. 판 이름 글자는 적지 않는다.
// 바탕 코드에서는 W-1(로그인 전 /start-guide 에 단추가 있음)과 W-2(낱말 단위 줄바꿈 없음) 단언이 실패한다.
import fs from "node:fs";
import { app, BASE, counter, ctx, fixture, page, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, done } = counter("웹 확인 수정: 움직이지 않는 ‘접기’ 단추를 내지 않고 404 제목이 낱말 단위로 꺾이는지 검사 통과");
const failures = [];
const check = (fn, label) => { try { fn(); } catch (error) { failures.push(`${label}: ${String(error.message || error).split("\n")[0].slice(0, 300)}`); } };

const H = "household_id=house-home";
const M = "month=2026-07";
const THEME_JS = /<script src="(\/assets\/accountbook-theme-v\d+\.js)"><\/script>/;
const SHELL_CSS = /<link rel="stylesheet" href="(\/assets\/accountbook-shell-v\d+\.css)"\/>/;
const SHELL_BODY = /<body\b[^>]*\bclass="[^"]*\babV22812Shell\b/;
const toggles = (html) => (html.match(/class="abHeadNoteToggle"/g) || []).length;
const notes = (html) => (html.match(/class="abHeadNote"/g) || []).length;
const GUIDE_NOTE = "가계부를 만들거나 참여한 뒤 단톡방 연결과 첫 기록까지 차례로 진행해보세요.";

// 단추가 계속 붙어야 하는 화면(소유자 로그인) — 고치면서 덜 붙게 되지 않았는지 본다.
const OWNER_WITH_NOTE = [
  `/budgets?${M}&${H}`, `/reports?${M}&${H}`, `/my/settings?${H}`, `/my/members?${H}`, `/split-summary?${H}`, `/payment-methods?${H}`, `/reserve-plans?${H}`,
  `/smart-tools?${H}`, `/start-guide?${M}&${H}`, "/start-guide", "/my/households", `/my/backup?${H}`, `/my/groups?${H}`, `/my/setup?${H}`, `/keyword-guide?${H}`, `/my/analysis?${M}&${H}`,
];
// 훑는 주소: 사용자 화면·공개 화면·없는 주소. 응답마다 "단추가 있으면 스크립트·스타일·바탕 표식이 다 있다" 를 본다.
const SWEEP = [
  ...OWNER_WITH_NOTE, `/app?${M}&${H}`, `/app?${M}&${H}&view=calendar`, `/app?${M}&${H}&tab=transactions`, `/annual?${H}`, `/menu?${H}`, `/goals?${H}`, `/my/profile?${H}`,
  `/quick-input-help?${H}`, `/kakao-guide?${H}`, `/today-budget?${H}`, `/travel-households?${H}`, "/support", "/my", "/demo", "/", "/articles", "/faq", "/privacy", "/terms",
  "/group-accountbook", "/kakao-guide", "/quick-input-help", "/budget-alert-guide", "/households", "/my/backup-login", "/about", "/contact", "/budgets", "/reports", "/smart-tools",
  "/payment-methods", "/reserve-plans", "/split-summary", "/keyword-guide",
];
const ADMIN_PATHS = ["/backup", "/households", `/households?${H}`, "/identity-audit", "/ops-dashboard", "/?legacy=1", "/", "/categories", "/start-guide", "/budgets", "/payment-methods", "/reserve-plans", "/smart-tools", "/reports"];

async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": "198.51.100.128" },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}

await withClock("2026-07-15", () => fixture(async (fx) => {
  // ── W-1: 로그인 전 /start-guide ────────────────────────────────────────────
  for (const path of ["/start-guide", `/start-guide?${M}&${H}`]) {
    const out = await page(fx, path, { cookie: "" });
    check(() => eq(out.status, 200, `W-1 로그인 전 ${path} 는 열린다`), `out-status ${path}`);
    check(() => ok(!THEME_JS.test(out.html) && !SHELL_CSS.test(out.html) && !SHELL_BODY.test(out.html), `W-1 로그인 전 ${path} 에는 셸(테마 스크립트·셸 스타일시트·바탕 표식)이 없다`), `out-shell ${path}`);
    check(() => eq(toggles(out.html), 0, `W-1 로그인 전 ${path} 에는 움직이지 않는 ‘접기’ 단추를 내지 않는다`), `out-toggle ${path}`);
    check(() => ok(notes(out.html) === 0 && !out.html.includes("data-ab-note="), `W-1 로그인 전 ${path} 에는 접는 칸 표식도 없다`), `out-note ${path}`);
    check(() => ok(out.html.includes(`<h1>말해가계부 시작가이드</h1><p>${GUIDE_NOTE}</p>`), `W-1 로그인 전 ${path} 의 안내 문장은 제목 바로 아래에 그대로 있다`), `out-text ${path}`);
    check(() => ok(out.html.includes('<a class="btn" href="/my">가계부 시작하기</a>') && out.html.includes("처음 사용 순서"), `W-1 로그인 전 ${path} 의 시작 단추와 순서 안내는 그대로다`), `out-rest ${path}`);
  }

  // ── W-1: 로그인한 화면은 예전처럼 접을 수 있다 ───────────────────────────────
  const inGuide = await page(fx, "/start-guide");
  check(() => eq(toggles(inGuide.html), 1, "W-1 로그인한 /start-guide 에는 ‘접기’ 단추가 하나 있다"), "in-guide toggle");
  check(() => ok(/<h1>[^<]*시작가이드<\/h1><div class="abHeadNote" data-ab-note="말해가계부-시작가이드"><p>[^<]+<\/p><button type="button" class="abHeadNoteToggle" aria-expanded="true">접기<\/button><\/div>/.test(inGuide.html), "W-1 로그인한 /start-guide 의 접는 칸은 예전 모양 그대로다(제목 바로 아래, 화면별 열쇠, 펼친 상태)"), "in-guide markup");
  for (const path of OWNER_WITH_NOTE) {
    const out = await page(fx, path);
    check(() => eq(out.status, 200, `W-1 소유자 ${path} 는 열린다`), `owner-status ${path}`);
    check(() => eq(toggles(out.html), 1, `W-1 소유자 ${path} 의 ‘접기’ 단추는 그대로 하나다`), `owner-toggle ${path}`);
    check(() => eq(notes(out.html), 1, `W-1 소유자 ${path} 의 접는 칸은 하나다`), `owner-note ${path}`);
    check(() => ok(THEME_JS.test(out.html) && SHELL_CSS.test(out.html) && SHELL_BODY.test(out.html), `W-1 소유자 ${path} 에는 단추를 움직이는 스크립트와 스타일이 실린다`), `owner-shell ${path}`);
  }

  // ── W-1: 어느 화면이든 "단추가 있으면 스크립트·스타일·바탕 표식이 다 있다" ──────────
  const admin = await adminCookie(fx);
  check(() => ok(admin.startsWith("ab_admin="), "훑기: 관리자 세션을 만든다"), "admin cookie");
  const states = [["로그인 전", "", SWEEP], ["소유자", fx.cookie, SWEEP], ["관리자", admin, [...ADMIN_PATHS, ...SWEEP]], ["관리자+소유자", `${admin}; ${fx.cookie}`, [...ADMIN_PATHS, ...SWEEP]]];
  let htmlResponses = 0;
  let withToggle = 0;
  for (const [name, cookie, paths] of states) {
    for (const path of [...new Set(paths)]) {
      const out = await page(fx, path, { cookie });
      if (out.status !== 200 || !/<html/i.test(out.html)) continue;
      htmlResponses += 1;
      const count = toggles(out.html);
      if (!count) {
        check(() => eq(notes(out.html), 0, `훑기 ${name} ${path}: 단추가 없으면 접는 칸도 없다`), `sweep-note ${name} ${path}`);
        continue;
      }
      withToggle += 1;
      check(() => eq(count, 1, `훑기 ${name} ${path}: ‘접기’ 단추는 화면에 하나뿐이다`), `sweep-count ${name} ${path}`);
      check(() => ok(THEME_JS.test(out.html), `훑기 ${name} ${path}: 단추가 있으면 테마 스크립트가 실린다`), `sweep-js ${name} ${path}`);
      check(() => ok(SHELL_CSS.test(out.html), `훑기 ${name} ${path}: 단추가 있으면 셸 스타일시트가 실린다`), `sweep-css ${name} ${path}`);
      check(() => ok(SHELL_BODY.test(out.html), `훑기 ${name} ${path}: 단추가 있으면 바탕에 셸 표식이 있다`), `sweep-body ${name} ${path}`);
    }
  }
  check(() => ok(htmlResponses >= 150, `훑기: HTML 응답을 넉넉히 봤다(${htmlResponses})`), "sweep size");
  check(() => ok(withToggle >= 40, `훑기: ‘접기’ 가 있는 응답이 줄지 않았다(${withToggle})`), "sweep toggles");

  // ── W-1: 단추를 움직이는 코드와 꾸미는 규칙이 그 두 자산에 실제로 들어 있다 ─────────
  const shellPage = await page(fx, `/budgets?${M}&${H}`);
  const themePath = (shellPage.html.match(THEME_JS) || [])[1] || "";
  const cssPath = (shellPage.html.match(SHELL_CSS) || [])[1] || "";
  const themeAsset = await page(fx, themePath, { cookie: "" });
  const cssAsset = await page(fx, cssPath, { cookie: "" });
  check(() => ok(themeAsset.status === 200 && themeAsset.html.includes("[data-ab-note]") && themeAsset.html.includes(".abHeadNoteToggle") && themeAsset.html.includes("화면 안내") && themeAsset.html.includes("isFolded"), "W-1 테마 스크립트가 접는 칸을 찾아 단추를 묶는다"), "theme asset");
  check(() => ok(cssAsset.status === 200 && cssAsset.html.includes("body.abV22812Shell .abHeadNote .abHeadNoteToggle{") && cssAsset.html.includes(".abHeadNote.isFolded"), "W-1 셸 스타일시트가 접는 칸과 단추를 꾸민다(바탕 표식 아래에서만)"), "css asset");

  // ── W-2: 없는 주소 화면 ────────────────────────────────────────────────────
  for (const [name, cookie] of [["로그인 전", ""], ["소유자", fx.cookie]]) {
    for (const path of ["/no-such-page", "/my/no-such-page"]) {
      const out = await page(fx, path, { cookie });
      check(() => eq(out.status, 404, `W-2 ${name} ${path} 는 404 다`), `404-status ${name} ${path}`);
      check(() => ok(/<main style="[^"]*;word-break:keep-all">\s*<h1>페이지를 찾을 수 없습니다\.<\/h1>/.test(out.html), `W-2 ${name} ${path}: 제목이 낱말 단위로 줄을 바꾼다`), `404-keepall ${name} ${path}`);
      check(() => ok(out.html.includes('<a href="/my"') && out.html.includes("내 가계부로 이동") && out.html.includes('<a href="/"') && out.html.includes("처음 화면"), `W-2 ${name} ${path}: 두 링크는 그대로다`), `404-links ${name} ${path}`);
      check(() => ok(out.html.includes('<meta name="robots" content="noindex,nofollow"/>') && out.html.includes("요청한 페이지가 없거나 현재 사용할 수 없습니다."), `W-2 ${name} ${path}: 색인 금지 표식과 안내 문장은 그대로다`), `404-rest ${name} ${path}`);
    }
  }
  const notFound = await app.fetch(new Request(`${BASE}/no-such-page`, { headers: { accept: "text/html" } }), fx.env, ctx);
  check(() => ok(notFound.status === 404 && /text\/html/.test(notFound.headers.get("content-type") || "") && (notFound.headers.get("x-robots-tag") || "").includes("noindex"), "W-2 404 응답의 종류와 색인 금지 머리줄은 그대로다"), "404 headers");
}));

// ── 원본: 단추를 붙이는 자리가 조건 뒤에 있다 ─────────────────────────────────
const source = fs.readFileSync(new URL("../src/modules/web/html-postprocess.js", import.meta.url), "utf8");
check(() => ok(/const headNoteReady = source\.includes\(`src="\$\{ACCOUNTBOOK_THEME_JS_ASSET_PATH\}"`\)\s*&& source\.includes\(v22812ShellLink\)\s*&& \/<body\\b\[\^>\]\*\\bclass="\[\^"\]\*\\babV22812Shell\\b\/\.test\(source\);/.test(source), "W-1 원본: 스크립트·스타일·바탕 표식 셋을 다 본다"), "source guard");
check(() => ok(source.includes('if (headNoteReady && source.includes("abV5PageHeader")) {'), "W-1 원본: 그 조건 안에서만 접는 칸을 만든다"), "source if");
check(() => eq((source.match(/class="abHeadNoteToggle"/g) || []).length, 2, "W-1 원본: 단추를 만드는 자리는 두 곳뿐이다(둘 다 그 조건 안)"), "source count");

if (failures.length) {
  console.error(`실패 ${failures.length}건:`);
  for (const line of failures.slice(0, Number(process.env.AB_SHOW_FAILURES) || 80)) console.error(`  - ${line}`);
  process.exit(1);
}
done();
