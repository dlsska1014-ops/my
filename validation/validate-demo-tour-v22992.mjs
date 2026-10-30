// V22.9.92 공개 기능 둘러보기(/demo) 검사.
//
// 사용자(2026-10-30): 애드핏 심사자가 "가입 없이 전체 기능들과 필요한 주소들을 체험할 수 있는 무언가" → 조사 권장 ‘기능 둘러보기’ 승인.
// /demo 는 공개·같은 호스트·상시 화면이라 애드핏 정책(심사 전용 임시 페이지 금지)에 맞고, 손으로 만든 미리보기가 앱과 어긋나지 않게
// 실제 동작과 대조한다. 이 검사는 다음을 확인한다.
//   1. 둘러보기 자리·여섯 단계·읽기 전용(폼·단추·스크립트 없음, 쿠키 없음, 링크는 열리는 공개 화면과 #example 뿐)
//   2. 카카오톡 답 예시 = 픽스처의 실제 /skill 저장 답(가계부 이름은 같고 분류·지출자만 예제 값)
//   3. 리포트 표 = 실제 리포트 ‘지출 상위 분류’ 줄 모양이고 값은 같은 화면 예산 예제의 네 기록에서 나온다
//   4. 주요 화면 주소 표: ‘누구나’는 로그인 없이 열리고, ‘로그인한 사람’은 로그인 없이 열면 로그인 화면으로 가고 로그인하면 열린다
//   5. 둘러보기 문장의 사실(9월 17일 홈, 되돌리기 5초, 수정 명령)이 앱과 맞다, 다른 공개 화면은 그대로다
// 렌더링은 QA 픽스처와 app.fetch 로만 한다(서버·네트워크 없음).
import { readFileSync } from "node:fs";
import vm from "node:vm";
import { parse } from "../tools/vendor/acorn.mjs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { fixture, withClock, skill, page, post } from "./lib-audit-v22934.mjs";

const ORIGIN = "https://malhaebook.com";
const STOPS = ["kakao", "home", "edit", "report", "budget", "group"];
const ROW_RE = /^<tr><td><b>[^<]+<\/b><\/td><td>[0-9,]+원<\/td><td>[0-9,]+건<\/td><\/tr>$/;

let passed = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  passed += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
  passed += 1;
}
const countOf = (text, needle) => String(text || "").split(needle).length - 1;
const decode = (text) => String(text).replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const plain = (html) => decode(String(html).replace(/<[^>]+>/g, "")).trim();
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const pagesModule = readFileSync(new URL("../src/modules/public/content-pages.js", import.meta.url), "utf8");

// 앱 알림 스크립트(v5-bundle-mains.js accountbookSaveFeedbackClientMain)를 되돌리기 단추가 있는 삭제 알림 화면에서 돌리고 건 타이머 시간을 돌려준다.
// 알림 틀은 validate-user-feedback-v22990 의 toastHarness 를 줄인 것이다(180ms 는 닫힘 효과 타이머라 뺀다).
function restoreToastTimers() {
  const v5 = readFileSync(new URL("../src/modules/client/v5-bundle-mains.js", import.meta.url), "utf8");
  const node = parse(v5, { ecmaVersion: "latest", sourceType: "module" }).body.find((n) => n.type === "FunctionDeclaration" && n.id.name === "accountbookSaveFeedbackClientMain");
  const timers = [];
  const feedback = {
    classList: { add() {}, remove() {}, contains: () => false }, getAttribute: (key) => (key === "data-ab-feedback-kind" ? "success" : null), hasAttribute: () => false, setAttribute() {},
    querySelector: (selector) => (selector === "[data-ab-restore]" ? { name: "되돌리기" } : null), addEventListener() {}, contains: () => false,
  };
  const context = vm.createContext({
    document: { readyState: "interactive", activeElement: null, addEventListener() {}, getElementById: () => null, querySelector: (selector) => (selector === "[data-ab-save-feedback]" ? feedback : null) },
    window: { history: { replaceState() {} } }, location: { pathname: "/app", search: "?tab=transactions&msg=deleted&restore=abc.def", hash: "" }, URLSearchParams,
    requestAnimationFrame: (fn) => fn(), setTimeout: (_fn, ms) => { timers.push(ms); return timers.length; }, clearTimeout() {},
  });
  vm.runInContext(`${v5.slice(node.start, node.end)}\naccountbookSaveFeedbackClientMain();`, context);
  return timers.filter((ms) => ms !== 180);
}

const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");
const fx = await createV2265QaFixture();
async function get(path, { cookie = "", method = "GET" } = {}) {
  const response = await app.fetch(new Request(`${ORIGIN}${path}`, { method, headers: { accept: "text/html", ...(cookie ? { cookie } : {}) } }), fx.env, {});
  return { status: response.status, location: response.headers.get("location") || "", headers: response.headers, html: await response.text() };
}

try {
  // ── 1. 자리·단계·읽기 전용 ─────────────────────────────────────────────────
  const demo = await get("/demo");
  eq(demo.status, 200, "/demo 는 로그인 없이 열린다");
  ok(demo.headers.get("cache-control") === "public, max-age=300, stale-while-revalidate=600" && demo.headers.get("x-robots-tag") === "index, follow" && demo.headers.get("set-cookie") === null, "/demo 는 공개 캐시·색인 대상이고 쿠키를 굽지 않는다");
  const html = demo.html;
  ok(/<title>가입 없이 말해가계부 기능을 둘러보세요/.test(html) && html.includes("<h1>가입 없이 말해가계부 기능을 둘러보세요</h1>") && html.includes(">가입 없이 보는 기능 둘러보기</span>"), "제목·머리 문구가 기능 둘러보기다");
  ok(Buffer.byteLength(html) <= 72 * 1024, `/demo HTML 은 72 KiB 이하다 (${Buffer.byteLength(html)} B)`);
  // 내용을 바꾼 날을 안내 수정일로 보인다(공통 기본값 2026-10-11 이 아니다). 사이트맵 lastmod 도 같은 값이다.
  ok(html.includes(`안내 수정 <time datetime="2026-10-30">2026-10-30</time>`), "/demo 의 안내 수정일은 기능 둘러보기로 바꾼 2026-10-30 이다");
  ok(/<loc>https:\/\/malhaebook\.com\/demo<\/loc>\s*<lastmod>2026-10-30<\/lastmod>/.test((await get("/sitemap.xml")).html), "사이트맵의 /demo lastmod 도 2026-10-30 이다");
  eq(countOf(html, '<section class="pubSection pubTour" id="tour" aria-labelledby="tour-title">'), 1, "둘러보기 절은 하나다");
  const tourStart = html.indexOf('<section class="pubSection pubTour"');
  const tourEnd = html.indexOf("</ol></section>", tourStart) + "</ol></section>".length;
  const tour = html.slice(tourStart, tourEnd);
  ok(html.lastIndexOf("</header>", tourStart) > html.indexOf('<header class="pubHero">') && html.indexOf('<section class="pubSection" id="section-1">') > tourEnd, "둘러보기는 머리(웹 홈 미리보기) 바로 아래, 예제 질문 절 위다");
  ok(html.indexOf('id="example"') > tourEnd, "예산 계산 예제(#example)는 둘러보기 아래에 그대로 있다");
  const stopIds = [...tour.matchAll(/<li class="pubTourStop" id="tour-([a-z]+)"><h3><span aria-hidden="true">(\d)<\/span>([^<]+)<\/h3>/g)];
  eq(JSON.stringify(stopIds.map((m) => m[1])), JSON.stringify(STOPS), "여섯 단계가 정한 순서로 있다");
  eq(JSON.stringify(stopIds.map((m) => m[2])), JSON.stringify(["1", "2", "3", "4", "5", "6"]), "단계 번호가 1~6 이다");
  eq(countOf(tour, '<p class="pubTourWhere">어디서: '), 6, "단계마다 ‘어디서’ 줄이 있다");
  ok(!/<(?:form|button|input|select|textarea|script|iframe|details)\b/i.test(tour), "둘러보기 안에는 폼·단추·입력·스크립트가 없다(읽기 전용)");
  ok(!/\son[a-z]+=/i.test(tour) && !/style="/.test(tour), "둘러보기 안에 인라인 처리기·인라인 스타일이 없다");
  const hrefs = [...tour.matchAll(/href="([^"]+)"/g)].map((m) => m[1]);
  ok(hrefs.length >= 7 && hrefs.every((href) => href === "#example" || /^\/[a-z-]*$/.test(href)), "둘러보기 링크는 공개 안내 주소와 #example 뿐이다");
  for (const href of new Set(hrefs.filter((href) => href.startsWith("/")))) {
    const page = await get(href);
    eq(page.status, 200, `둘러보기 링크 ${href} 는 로그인 없이 열린다`);
  }
  ok(!/<script\b[^>]*\bsrc=/i.test(html), "/demo 는 바깥 스크립트를 싣지 않는다(광고를 켜지 않았을 때)");
  for (const path of ["/", "/guides", "/budget-guide"]) {
    const other = (await get(path)).html;
    ok(!other.includes("pubTour") && !other.includes("pubChat"), `${path} 에는 둘러보기 HTML·CSS 가 없다(/demo 에만 싣는다)`);
  }

  // ── 2. 카카오톡 답 예시 = 실제 저장 답 ────────────────────────────────────
  // 화면 읽기 프로그램이 누가 한 말인지 알도록 내 말풍선 앞에 숨은 이름표를 둔다(봇 말풍선은 ‘말해가계부’가 보인다).
  const meMatch = tour.match(/<p class="pubChatMe"><span class="pubSr">내가 보낸 말: <\/span>([\s\S]*?)<\/p>/);
  ok(!!meMatch && html.includes(".pubTour .pubSr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}"), "내 말풍선에 화면에는 숨은 ‘내가 보낸 말’ 이름표가 있다");
  ok(tour.includes('<ol class="pubTourList" role="list">'), "목록 점을 지운 단계 목록도 목록으로 읽히게 role=\"list\" 를 단다");
  const me = plain(meMatch[1]);
  const botMatch = tour.match(/<div class="pubChatBot"><b>말해가계부<\/b><p>([\s\S]*?)<\/p><\/div>/);
  ok(!!botMatch, "봇 말풍선이 있다");
  const preview = decode(botMatch[1]).split("\n");
  eq(me, "식사 60000원 카드", "내 말풍선은 9월 9일 예제 기록 문장이다");
  const real = await fixture(async (kfx) => withClock("2026-09-09", async () => {
    const choose = await skill(kfx, me);
    ok(choose.includes("우리집 생활비"), "픽스처 계정은 처음에 가계부를 고르게 한다");
    await skill(kfx, "우리집 생활비");
    const before = kfx.db.transactions.length;
    const reply = await skill(kfx, me);
    const saved = kfx.db.transactions.slice(before);
    ok(saved.length === 1 && Number(saved[0].amount) === 60000 && saved[0].payment_method === "카드" && saved[0].transaction_date === "2026-09-09", "실제 /skill 이 같은 문장을 9월 9일 카드 지출 60,000원 한 건으로 저장한다");
    return reply;
  }));
  const realLines = real.split("\n");
  eq(countOf(real, " / 외식"), 1, "픽스처 답의 분류(외식)는 한 번 나온다(바꿀 값이 있다)");
  eq(countOf(real, "지출자: Bin"), 1, "픽스처 답의 지출자(Bin)는 한 번 나온다(바꿀 값이 있다)");
  const mapped = realLines.map((line) => line.replace(/ \/ 외식$/, " / 식비").replace(/^지출자: Bin$/, "지출자: 민지"));
  eq(JSON.stringify(preview), JSON.stringify(mapped), "봇 말풍선은 실제 저장 답과 줄마다 같다(분류·지출자만 예제 값)");
  ok(preview.includes("가계부: 우리집 생활비"), "가계부 이름은 실제 답과 같은 ‘우리집 생활비’다");
  ok(html.includes("<tr><th scope=\"row\">2026-09-09</th><td>식비</td><td>식사</td><td>60,000원</td></tr>"), "말풍선 기록은 아래 예제 표의 9월 9일 식사 60,000원(식비)과 같다");

  // ── 3. 리포트 표 ─────────────────────────────────────────────────────────
  ok(pagesModule.includes("renderReportTopRows({ top_categories: publicTourTopCategories() })"), "리포트 표는 실제 리포트 줄 함수(renderReportTopRows)로 그린다");
  const previewRows = [...(tour.match(/<figure class="pubTourPreview pubTourReport">[\s\S]*?<tbody>([\s\S]*?)<\/tbody>/) || ["", ""])[1].matchAll(/<tr>[\s\S]*?<\/tr>/g)].map((m) => m[0]);
  ok(previewRows.length === 3 && previewRows.every((row) => ROW_RE.test(row)), "둘러보기 리포트 표는 세 줄이고 리포트 줄 모양이다");
  const exampleRows = [...html.matchAll(/<tr><th scope="row">(2026-09-\d\d)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><td>([0-9,]+)원<\/td><\/tr>/g)].map((m) => ({ category: m[2], amount: Number(m[4].replace(/,/g, "")) }));
  eq(exampleRows.length, 4, "같은 화면 예산 예제 표의 기록은 네 건이다");
  const grouped = new Map();
  for (const row of exampleRows) grouped.set(row.category, { amount: (grouped.get(row.category)?.amount || 0) + row.amount, count: (grouped.get(row.category)?.count || 0) + 1 });
  const expected = [...grouped.entries()].sort((a, b) => b[1].amount - a[1].amount).map(([name, v]) => `<tr><td><b>${name}</b></td><td>${v.amount.toLocaleString("ko-KR")}원</td><td>${v.count}건</td></tr>`);
  eq(JSON.stringify(previewRows), JSON.stringify(expected), "리포트 표 값은 예제 네 기록을 분류별로 합친 것이다(큰 금액 순)");
  ok(html.includes('<dd id="demo-total">255,000원</dd>') && [...grouped.values()].reduce((sum, v) => sum + v.amount, 0) === 255000, "리포트 표 합계는 예산 예제의 전체 지출 255,000원과 같다");
  const report = await get("/reports?month=2026-07&household_id=house-home", { cookie: fx.cookie });
  eq(report.status, 200, "실제 리포트 화면이 열린다(대조용)");
  const realReportRows = [...(((report.html.split("<h2>지출 상위 분류</h2>")[1] || "").split("<tbody>")[1] || "").split("</tbody>")[0].matchAll(/<tr>[\s\S]*?<\/tr>/g))].map((m) => m[0]);
  ok(realReportRows.length >= 1 && realReportRows.every((row) => ROW_RE.test(row)), "실제 리포트의 ‘지출 상위 분류’ 줄도 같은 모양이다");

  // ── 4. 주요 화면 주소 표 ─────────────────────────────────────────────────
  const tableHtml = (html.split('<caption id="table-3">말해가계부의 주요 화면과 주소</caption>')[1] || "").split("</table>")[0];
  const addressRows = [...tableHtml.matchAll(/<tr><th scope="row">([^<]+)<\/th><td>([^<]+)<\/td><td>([^<]+)<\/td><\/tr>/g)].map((m) => ({ name: decode(m[1]), path: m[2], who: m[3] }));
  eq(addressRows.length, 16, "주요 화면 주소 표는 16줄이다");
  const publicPaths = [...(source.match(/const PUBLIC_CONTENT_PATHS = Object\.freeze\(\[([\s\S]*?)\]\);/) || ["", ""])[1].matchAll(/"([^"]+)"/g)].map((m) => m[1]);
  // 로그인 줄은 열리기만 하는 것이 아니라 표의 이름과 같은 화면이어야 한다(병합 전 검토: /my 는 홈으로 넘기고, /app 은 거래 내역이 아니라 홈이었다).
  // 로그인한 화면의 메뉴에서 현재 화면(aria-current="page")으로 표시된 항목 이름이 표의 이름과 같은지 본다. 표의 ‘웹 가계부 홈’은 메뉴의 ‘홈’이다.
  const NAV_NAME = { "웹 가계부 홈": "홈" };
  for (const row of addressRows) {
    ok(row.who === "누구나" || row.who === "로그인한 사람", `${row.path}: 볼 수 있는 사람은 ‘누구나’ 또는 ‘로그인한 사람’이다`);
    const anon = await get(row.path);
    const user = await get(row.path, { cookie: fx.cookie });
    if (row.who === "누구나") {
      ok(anon.status === 200 && publicPaths.includes(row.path), `${row.path}(${row.name}): 로그인 없이 열리는 공개 정본 화면이다`);
    } else {
      ok(!publicPaths.includes(row.path.split("?")[0]), `${row.path}(${row.name}): 공개 정본 화면이 아니다`);
      ok(anon.status === 303 && anon.location === "/my", `${row.path}(${row.name}): 로그인 없이 열면 로그인 화면(/my)으로 간다`);
      eq(user.status, 200, `${row.path}(${row.name}): 로그인하면 바로 열린다(다른 주소로 넘기지 않는다)`);
      const current = [...user.html.matchAll(/<a data-key="[a-z-]+"[^>]*\saria-current="page"[^>]*>([\s\S]*?)<\/a>/g)].map((m) => plain(m[1]));
      ok(current.includes(NAV_NAME[row.name] || row.name), `${row.path}(${row.name}): 로그인한 화면의 메뉴에서 현재 화면 항목이 표의 이름과 같다 (기대 ‘${NAV_NAME[row.name] || row.name}’, 실제 ${[...new Set(current)].join(", ")})`);
    }
  }
  eq(addressRows.filter((row) => row.who === "누구나").length, 7, "공개 주소 7개");
  for (const m of tour.matchAll(/어디서: ([^<]+)<\/p>/g)) {
    for (const path of m[1].match(/\/[a-z/-]+(?:\?[a-z_]+=[a-z_]+)?/g) || []) ok(addressRows.some((row) => row.path === path), `‘어디서’ 줄의 ${path} 는 주요 화면 주소 표에 있다`);
  }

  // ── 5. 문장의 사실 ───────────────────────────────────────────────────────
  ok(tour.includes("9월 17일에 홈으로 본 모습") && html.includes("아래 예제를 웹 가계부 홈 화면으로 본 모습 · 2026년 9월 17일 기준"), "‘9월 17일 홈’ 문장이 맨 위 미리보기 기준일과 같다");
  // ‘되돌리기 5초’: 문자열이 아니라 앱의 알림 스크립트를 가짜 화면에서 돌려, 되돌리기 단추가 있는 삭제 알림이 닫히는 시간을 잰다.
  ok(tour.includes("지운 직후 5초 동안은 ‘되돌리기’로"), "둘러보기는 ‘지운 직후 5초 동안 되돌리기’라고 적는다");
  eq(JSON.stringify(restoreToastTimers()), "[5000]", "앱 알림 스크립트를 돌리면 되돌리기 단추가 있는 삭제 알림은 5초(5000ms) 뒤 닫힌다");
  // 단추가 실제로 나오는지: 픽스처에서 로그인 사용자가 거래 내역의 기록을 지우고, 돌아간 화면의 삭제 알림에 ‘되돌리기’ 폼이 있는지 본다.
  const undo = await fixture(async (kfx) => {
    const back = "/app?month=2026-07&household_id=house-home&tab=transactions";
    const res = await post(kfx, "/admin/delete", { id: "tx-expense-2", household_id: "house-home", month: "2026-07", return_to: back }, { accept: "application/json" });
    const data = JSON.parse(res.text);
    const location = data.location || res.location;
    const shown = (await page(kfx, location, { headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } })).html;
    return { deleted: data.deleted === true && !kfx.db.transactions.some((row) => String(row.id) === "tx-expense-2"), location, toast: (shown.match(/<div class="abSaveFeedback[^]*?<\/button><\/div>/) || [""])[0] };
  }, { auditDeletes: true });
  ok(undo.deleted && new URL(undo.location, ORIGIN).searchParams.get("tab") === "transactions", "픽스처: 거래 내역에서 지우면 바로 지우고 거래 내역으로 돌아간다");
  ok(undo.toast.includes("<b>기록을 삭제했습니다</b>") && /<form class="abSaveFeedbackUndo" method="post" action="\/my\/restore">[^]*<button type="submit" class="abSaveFeedbackAction" data-ab-restore>되돌리기<\/button>/.test(undo.toast), "픽스처: 돌아간 화면의 삭제 알림에 ‘되돌리기’ 단추(POST /my/restore)가 있다");
  ok(tour.includes("‘수정 01번 금액 13000’, ‘삭제 01번’") && real.includes('"수정 01번 금액 13000"') && real.includes('"삭제 01번"'), "카카오 수정·삭제 명령 예시가 실제 저장 답의 안내와 같다");
  ok(tour.includes("‘예산 안 정한 지출’") && html.includes("예산 안 정한 지출 30,000원"), "‘예산 안 정한 지출’ 이름이 맨 위 홈 미리보기·앱 홈과 같다");
  const head = await get("/demo", { method: "HEAD" });
  ok(head.status === 200 && head.html === "", "HEAD /demo 는 본문 없이 열린다");

  console.log(`V22.9.92 기능 둘러보기 검사 통과 (${passed} checks)`);
} finally {
  fx.restore();
  globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
}
