// V22.9.86 — 디자인 보강 3단계(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-11 ~ T-18, T-16 은 보고만)와 아이콘 생성 고침 검사.
//
// ── 이 파일이 왜 생겼는지 ──
//   아이콘 생성기(tools/build-icons.mjs)가 맨 앞 상대 이동 "m x y dx dy …" 을 "M x y dx dy …" 로만 바꿔 뒤 좌표 쌍까지 절대 좌표가 됐다
//        (V22.9.85 표에서 6개 아이콘이 일그러짐 — 메뉴 정산·전환·검색, 카테고리 구독·장보기, 화면 경고 삼각). Lucide 의 채운 점(palette·tag)은
//        선 마스크에서 구멍이 됐다.
//   T-11 모바일 홈 머리말에 가계부 이름이 두 번(상단 바·가계부 고르기) 나오고 달 고르기가 기본 날짜 칸이었다.
//   T-13 거래 행·빠른 입력 칩에 카테고리 동그라미가 없었다. T-14 빠른 입력이 본문 칸과 시트 두 곳이었고 저장 단추가 늘 켜져 있었다.
//   T-15 저장 알림의 표식이 글자(✓ !)였고 행동 단추가 없었다. T-17 하단 탭 현재 탭이 26×3px 막대 하나였다. T-18 빈 달 안내가 글 한 줄이었다.
//
// ── 어떻게 잡는가 ──
// 생성기는 함수를 직접 부르고, 생성 표는 path 를 풀어 모든 끝점이 24×24 안인지 잰다(V22.9.85 의 일그러진 꺾쇠 "M6 9 6 6 6-6" 은 실패한다).
// 화면은 픽스처 홈 HTML 과 1년 캐시 자산 바이트(셸 CSS·V5·홈 셸)를 보고, 빠른 입력 미리보기(홈 셸)와 저장 알림·새 행 강조(V5)는 vm 의
// 가짜 DOM 에서 실제로 돌려 저장 단추·문구·주소 정리를 본다. 실제 화면(390·1280 라이트/다크)은 review-artifacts/design-uplift-2026-10-28/v86/
// 의 브라우저 확인이 맡는다.
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { parse } from "../tools/vendor/acorn.mjs";
import { app, BASE, ctx, counter, fixture, withClock, page } from "./lib-audit-v22934.mjs";
import { AB_CATEGORY_ICON_PATHS, AB_NAV_ICON_PATHS, AB_UI_ICON_PATHS } from "../src/index.js";
import { absoluteFirstMove, NAV_ICONS, UI_ICONS } from "../tools/build-icons.mjs";

const t = counter("V22.9.86 디자인 보강 3단계(모바일 홈 머리말·카테고리 동그라미·입력 바와 시트·저장 알림·탭 바·빈 상태)와 아이콘 생성 고침");
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const SHELL = "/assets/accountbook-shell-v22986.css";
const V5 = "/assets/accountbook-v5-v22986.js";
const HOME_SHELL_JS = "/assets/mobile-home-shell-v22986.js";
const count = (text, needle) => String(text).split(needle).length - 1;
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  t.eq(response.status, 200, `${path} 가 내려간다`);
  return response.text();
};
const home = async (fx, path = HOME, cookie = fx.cookie) => (await page(fx, path, { cookie, headers: { "user-agent": UA } })).html;

// ── 아이콘 생성기: 맨 앞 상대 이동 ──
for (const [input, output, label] of [
  ["m16 3 4 4-4 4", "M16 3l4 4-4 4", "뒤 좌표 쌍은 상대 직선(l)으로 남는다"],
  ["m6 9 6 6 6-6", "M6 9l6 6 6-6", "꺾쇠(chevron-down)의 두 쌍도 상대 직선이다"],
  ["M3 3h18", "M3 3h18", "이미 절대 이동이면 그대로다"],
  ["m12 -3", "M12-3", "쌍이 하나면 l 을 붙이지 않는다"],
  ["m1 2z", "M1 2z", "닫기(z) 앞에서도 그대로다"],
]) t.eq(absoluteFirstMove(input), output, `생성기: ${label}`);

// path 의 끝점을 절대 좌표로 푼다(M m L l H h V v C c S s Q q T t A a Z z). 그림이 24×24 칸 밖으로 나가면 일그러진 것이다.
function endpoints(d) {
  const tokens = String(d).match(/[a-zA-Z]|[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g) || [];
  const arity = { m: 2, l: 2, h: 1, v: 1, c: 6, s: 4, q: 4, t: 2, a: 7, z: 0 };
  const points = [];
  let i = 0, cmd = "", x = 0, y = 0, startX = 0, startY = 0, first = true;
  while (i < tokens.length) {
    if (/[a-zA-Z]/.test(tokens[i])) cmd = tokens[i++];
    const lower = cmd.toLowerCase(), rel = cmd === lower && !(first && lower === "m");
    if (lower === "z") { x = startX; y = startY; points.push([x, y]); first = false; continue; }
    const n = arity[lower];
    if (n === undefined) throw new Error(`모르는 명령 ${cmd}`);
    const args = tokens.slice(i, i + n).map(Number);
    if (args.length < n || args.some(Number.isNaN)) throw new Error(`좌표가 모자란다: ${d.slice(0, 40)}`);
    i += n;
    if (lower === "h") x = rel ? x + args[0] : args[0];
    else if (lower === "v") y = rel ? y + args[0] : args[0];
    else { const [ex, ey] = args.slice(-2); x = rel ? x + ex : ex; y = rel ? y + ey : ey; }
    points.push([x, y]);
    if (lower === "m") { startX = x; startY = y; cmd = cmd === "m" ? "l" : "L"; }
    first = false;
  }
  return points;
}
const inBox = (d) => endpoints(d).every(([x, y]) => x >= -0.001 && x <= 24.001 && y >= -0.001 && y <= 24.001);
t.ok(!inBox("M6 9 6 6 6-6"), "끝점 검사가 V22.9.85 의 일그러진 꺾쇠(M 뒤 쌍을 절대 좌표로 읽은 것)를 잡는다");
t.ok(inBox("m6 9 6 6 6-6") && inBox("M6 9l6 6 6-6"), "끝점 검사: 맨 앞 m 은 절대, 뒤 쌍은 상대로 읽는다");
for (const [table, paths] of [["메뉴", AB_NAV_ICON_PATHS], ["카테고리", AB_CATEGORY_ICON_PATHS], ["화면", AB_UI_ICON_PATHS]]) {
  for (const [key, d] of Object.entries(paths)) {
    t.ok(d.startsWith("M"), `${table} 아이콘 ${key} 의 path 가 대문자 M 으로 시작한다(이어 붙여도 앞 도형 끝에서 재지 않는다)`);
    t.ok(inBox(d), `${table} 아이콘 ${key} 의 모든 끝점이 24×24 안이다`);
  }
}
// Lucide 의 채운 점: palette 4개·tag 1개. 길이 0 선(h0)의 둥근 끝이 점을 칠한다(SVGO 가 지우지 않도록 최적화 뒤에 붙는다).
const navKey = (name) => Object.keys(NAV_ICONS).find((key) => NAV_ICONS[key] === name);
t.eq(count(AB_NAV_ICON_PATHS[navKey("palette")], "h0"), 4, "palette 의 칠한 점 4개가 h0 끝으로 남는다");
t.eq(count(AB_NAV_ICON_PATHS[navKey("tag")], "h0"), 1, "tag 의 칠한 점 1개가 h0 끝으로 남는다");
for (const name of ["clock", "chevron-down", "chevron-left", "chevron-right", "x", "check", "circle-alert", "notebook-pen"]) {
  t.ok(Object.values(UI_ICONS).includes(name) && typeof AB_UI_ICON_PATHS[name] === "string", `3단계 화면 아이콘 ${name} 이 생성 표에 있다`);
}

const maskPath = (css, selector) => {
  const at = css.indexOf(selector);
  if (at < 0) return null;
  const rule = css.slice(at, css.indexOf("}", at));
  const url = rule.match(/url\("data:image\/svg\+xml,([^"]+)"\)/)?.[1];
  if (!url) return null;
  return /<path d='([^']+)'\/>/.exec(decodeURIComponent(url))?.[1] || null;
};

await withClock("2026-07-15", () => fixture(async (fx) => {
  const shell = await asset(SHELL);
  const v5 = await asset(V5);
  const homeShell = await asset(HOME_SHELL_JS);
  const v5Module = readFileSync(new URL("../src/modules/client/v5-bundle-mains.js", import.meta.url), "utf8");
  const html = await home(fx);
  t.ok(html.includes(SHELL) && html.includes(V5), "홈이 v22986 셸 CSS·V5 자산을 쓴다");
  t.ok(Buffer.byteLength(html) <= 35840, `기준 픽스처 홈 HTML 이 35 KiB 안이다 (${Buffer.byteLength(html)} B)`);

  // ── T-11 모바일 홈 머리말 ──
  for (const [needle, label] of [
    ["function homeHeaderClientMain", "머리말 스크립트가 홈 셸에 있다"],
    ['header.appTop.abV5PageHeader form.selectLine[action="/app"]', "홈과 내역 탭의 달 폼을 찾는다"],
    ["가계부 고르기", "가계부 고르기 시트 제목"],
    ['"aria-haspopup", "dialog"', "상단 이름 단추가 대화상자를 연다고 알린다"],
    ['"이전 달 "', "이전 달 단추 이름"],
    ['"다음 달 "', "다음 달 단추 이름"],
    ["abHomeHeadV86", "머리말 모양을 켜는 body 이름"],
  ]) t.ok(homeShell.includes(needle), `T-11 ${label}`);
  t.ok(/body\.abV22812Shell \.abV5PageHeader \.abV5ControlBar \.abMonthStep\{[^}]*width:44px;height:44px!important;min-height:44px!important/.test(shell), "T-11 달 넘김 단추는 44×44 다(머리말 단추의 40px 규칙을 이긴다)");
  t.eq(maskPath(shell, "body.abV22812Shell .abMonthPrev:before{"), AB_UI_ICON_PATHS["chevron-left"], "T-11 이전 달 단추가 chevron-left 마스크다");
  t.eq(maskPath(shell, "body.abV22812Shell .abMonthNext:before{"), AB_UI_ICON_PATHS["chevron-right"], "T-11 다음 달 단추가 chevron-right 마스크다");
  t.eq(maskPath(shell, "body.abV22812Shell .abNavMobileTop .abHhChevron{"), AB_UI_ICON_PATHS["chevron-down"], "T-11 상단 가계부 이름 뒤 chevron-down 마스크");
  t.ok(/@media\(min-width:900px\)\{[^@]*:is\(\.abMonthNav,\.abMonthFace\)\{display:contents\}/.test(shell), "T-11 900px 이상은 머리말을 지금 모양(기본 달 칸)으로 둔다");

  // 바텀시트(가계부 고르기)
  t.ok(shell.includes("body.abV22812Shell .abSheet{position:fixed;inset:0;z-index:12000;"), "시트는 무지출 축하(11900)보다 위(12000)다");
  t.ok(shell.includes("body.abV22812Shell .abSheetScrim{position:absolute;inset:0;background:rgba(17,24,39,.42)}") && shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSheetScrim{background:rgba(0,0,0,.6)}'), "§3-4 뒤 막 라이트 .42·다크 .6");
  t.ok(/\.abSheetPanel\{[^}]*max-height:90%;[^}]*padding:8px 20px calc\(20px \+ env\(safe-area-inset-bottom,0px\)\);border-radius:24px 24px 0 0/.test(shell), "§3-4 시트 모서리 24 24 0 0·패딩 8 20 20·최대 높이 90%");
  t.ok(shell.includes("body.abV22812Shell .abSheetPanel:before{content:\"\";display:block;width:40px;height:5px;"), "§3-4 손잡이 40×5");
  t.ok(shell.includes("body.abV22812Shell .abHhList button{") && /\.abHhList button\{[^}]*min-height:52px!important/.test(shell), "가계부 목록 단추는 52px 다");
  t.eq(maskPath(shell, 'body.abV22812Shell .abHhList button[aria-current="true"]:after{'), AB_UI_ICON_PATHS.check, "지금 가계부에 check 표시");
  t.eq(maskPath(shell, "body.abV22812Shell .abSheetClose:before{"), AB_UI_ICON_PATHS.x, "시트 닫기는 x 마스크다");
  t.ok(/@media\(prefers-reduced-motion:no-preference\)\{body\.abV22812Shell \.abSheet:not\(\[hidden\]\) \.abSheetPanel\{animation:abSheetUp 260ms/.test(shell), "§3-5 시트 등장 260ms 는 움직임 줄이기에서 끈다");
  const v86Css = shell.slice(shell.indexOf("/* V22.9.86 T-11"), shell.indexOf(".abEmptyAction:focus-visible"));
  t.ok(v86Css.length > 12000 && !v86Css.includes(".abQuickInputOverlay{z-index") && shell.includes(".abQuickInputOverlay{position:fixed;inset:0;z-index:3600"), "빠른 입력 시트는 옛 층(3600)이다 — 저장 알림(3900)이 위라 실패 이유가 보인다");

  // ── T-13 카테고리 동그라미: V5 자산의 함수를 가짜 DOM(서버가 그린 행·칩 값)에서 돌린다 ──
  const circleSource = functionSource(v5Module, "accountbookCategoryCircleClientMain");
  t.ok(v5.includes(`(${circleSource})();`), "T-13 V5 자산이 카테고리 동그라미 함수를 그대로 싣고 부른다");
  const keyHead = "return categoryKey})();";
  t.ok(v5.startsWith("window.abCategoryKey=(function(){") && v5.includes(keyHead), "T-13 브라우저 분류 판정(window.abCategoryKey)이 V5 맨 앞에 있다");
  const circles = circleHarness(v5.slice(0, v5.indexOf(keyHead) + keyHead.length), circleSource, html);
  t.eq(circles.row.title, "가족 카페", "T-13 픽스처 첫 거래 행을 읽었다");
  t.deepEq(circles.keys(), ["cafe", "food", "cafe", "shopping", "medical", "grocery"], "T-13 행(카페/간식)·칩(외식·카페/간식·쇼핑·의료/병원·장보기)의 동그라미 키가 서버 판정과 같다");
  t.ok(circles.all().every((node) => node.className === "abCat" && node.attrs["aria-hidden"] === "true" && node.innerHTML === '<i class="abCatIcon"></i>'), "T-13 동그라미는 aria-hidden 이고 아이콘 칸 하나다(읽기 이름은 행 글자 그대로)");
  circles.again();
  t.eq(circles.all().length, 6, "T-13 다시 불러도 동그라미를 겹쳐 넣지 않는다");
  t.ok(shell.includes("body.abV22812Shell #add .chipRow button:has(>.abCat){padding:0 14px 0 6px!important;gap:6px}"), "T-13 동그라미가 있는 칩은 §3-4 패딩 0 14 0 6·gap 6");
  t.ok(shell.includes("body.abV22812Shell .chipRow button>.abCat{width:32px;height:32px}") && shell.includes("body.abV22812Shell .chipRow button>.abCat>.abCatIcon{width:17px;height:17px}"), "T-13 칩 동그라미 32px·아이콘 17px");

  // ── T-14 입력 바·빠른 입력 시트 ──
  const bar = '<a class="abEntryBar" data-ab-quick-open href="#add">한 줄로 기록하기 <small>예: 점심 12000 국민카드</small></a>';
  t.eq(count(html, bar), 1, "T-14 예산 카드 아래 입력 바가 한 번 있다");
  t.ok(html.includes(`</section>${bar}`), "T-14 입력 바는 예산 카드 바로 다음이다");
  t.ok(/<p[^>]*id="quickAfter"[^>]*data-income="3380000"/.test(html), "T-14 미리보기 줄이 이번 달 수입 합계(3,380,000)를 안다");
  t.ok(/\.abEntryBar\{display:flex;[^}]*min-height:56px/.test(shell) && shell.includes("@media(min-width:900px){body.abV22812Shell .abEntryBar{display:none}}"), "T-14 입력 바 56px, 900px 이상은 숨김");
  t.eq(maskPath(shell, "body.abV22812Shell .abEntryBar:before{"), AB_UI_ICON_PATHS["notebook-pen"], "T-14 입력 바 앞 notebook-pen 마스크");
  t.ok(shell.includes("@media(max-width:899px){body.abV22812Shell.abQuickSheetOnly #add.panel:not(.abQuickInputContent){display:none!important}}"), "T-14 모바일 홈은 같은 폼을 본문에 다시 그리지 않는다");
  t.ok(v5.includes('document.querySelector(".abEntryBar") && findSection()) document.body.classList.add("abQuickSheetOnly")'), "T-14 시트를 열 수 있을 때만 본문 칸을 숨긴다(JS 가 없으면 그대로)");
  t.ok(v5.includes('aria-label="닫기"></button>') && !v5.includes('aria-label="빠른 입력 닫기">✕</button>'), "T-14 시트 닫기 이름은 \"닫기\"·글자 없는 아이콘 단추");
  t.ok(shell.includes("body.abV22812Shell .quickSubmit .quickAfter{order:-1;margin:0 0 10px}"), "T-14 §3-6 미리보기 줄은 저장 단추 위다");
  t.ok(/\.quickSubmit button\[type="submit"\]:disabled\{background:var\(--ab12-surface-raised\)!important;color:var\(--ab12-muted\)!important/.test(shell), "T-14 꺼진 저장 단추는 §3-4 비활성(surface-raised·muted)");

  // 빠른 입력 미리보기: 홈 셸 자산을 가짜 DOM 에서 돌린다(validate-lucian-a-prereq-v22948.mjs 의 draftFixture 와 같은 틀).
  const attrs = Object.fromEntries([...html.match(/<p[^>]*id="quickAfter"[^>]*>/)[0].matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], m[2].replace(/&quot;/g, '"')]));
  const quick = quickHarness(homeShell, attrs);
  t.eq(quick.submit.disabled, true, "T-14 처음에는 저장 단추가 꺼져 있다(금액·내용 전)");
  t.eq(quick.after.textContent, "금액을 넣으면 저장 뒤 남는 예산을 미리 보여드려요", "T-14 예산이 있는 가계부의 금액 전 문장");
  t.eq(quick.after.attrs["aria-live"], undefined, "T-14 처음 문장은 조용히 바꾼다(aria-live 를 붙이지 않는다)");
  quick.fill("점심 12000");
  t.eq(quick.fields.amountInput.value, "12,000", "T-14 한 줄 해석이 금액을 채운다(쉼표 표기)");
  t.eq(quick.submit.disabled, false, "T-14 금액과 내용이 있으면 저장 단추가 켜진다");
  t.eq(quick.after.attrs["aria-live"], "polite", "T-14 입력 뒤 미리보기는 polite 로 읽힌다");
  quick.manual("memoInput", "");
  t.eq(quick.submit.disabled, true, "T-14 내용을 지우면 저장 단추가 다시 꺼진다");
  t.eq(quick.after.textContent, "내용을 적으면 저장할 수 있어요", "T-14 내용 전 문장이 분류 확인 문구보다 먼저다");
  quick.manualType("income");
  quick.manual("memoInput", "용돈");
  quick.manual("amountInput", "50000");
  t.eq(quick.submit.disabled, false, "T-14 수입도 금액·내용이 있으면 켜진다");
  t.eq(quick.after.textContent, "저장하면 이번 달 수입이 3,430,000원이 돼요", "T-14 §3-6 수입 미리보기(이번 달 수입 합계 + 금액)");
  quick.manualType("expense");
  // 픽스처 가계부는 분류 예산이 길어 미리보기 범위(data-bsc, 96바이트 상한)를 싣지 않는다 — 지출은 저장 뒤 확인 문장이다(지금 동작 그대로).
  t.eq(attrs["data-bsc"], "[20260715,false]", "T-14 픽스처의 예산 범위는 싣지 않은 값(false)이다");
  t.eq(quick.after.textContent, "기록의 분류·날짜를 확인하세요. 해당 월 예산 잔액은 저장 후 확인할 수 있습니다.", "T-14 범위를 모르면 지출은 저장 뒤 확인 문장");
  const totalBudget = quickHarness(homeShell, { ...attrs, "data-bsc": "[20260715,0]" });
  totalBudget.fill("점심 12000");
  t.eq(totalBudget.after.textContent, "저장하면 남는 예산 969,400원 · 하루 57,023원", "T-14 §3-6 전체 예산이면 \"저장하면 남는 예산\"(옛 \"남은\")·하루 금액(981,400 − 12,000, 남은 17일)");
  t.ok(homeShell.includes('"저장하면 남는 예산 "') && !homeShell.includes('"저장하면 남은 예산 "'), "T-14 지출 미리보기 낱말이 §3-6 \"남는\" 이다");
  t.ok(homeShell.includes("abQuickSyncMore();abSmartState.preview(true);var addForm") && !homeShell.includes("abQuickSyncMore();abQuickSyncAfter();var addForm"), "T-14 홈 스크립트의 첫 동기화도 조용히 부른다(V22.9.85 까지는 뜨자마자 aria-live)");

  // ── V85:R-12 날짜 칩·R-13 빠른 입력 초점 (T-14 시트) ──
  t.ok(shell.includes("body.abV22812Shell #add .dateChip{min-height:44px!important;padding:0 14px!important;border-radius:999px!important;background:var(--ab12-surface)!important;border:1px solid var(--ab12-line)!important;color:var(--ab12-text)!important;font-weight:600!important}"), "R-12 날짜 칩은 T-01 칩 규격(surface·line·text 600)");
  t.ok(shell.includes('body.abV22812Shell #add .dateChip[aria-pressed="true"]{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important;font-weight:800!important}'), "R-12 고른 날짜 칩은 accent-soft·accent 800");
  t.ok(shell.includes('body.abV22812Shell #add :is(input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]),select,textarea):focus-visible{outline:3px solid var(--ab12-accent)!important;outline-offset:1px!important}'), "R-13 빠른 입력 칸 초점은 강조색 3px(옛 outline:0 규칙을 #add 로 이긴다)");
  for (const [tz, nowIso, value, pressed, summary, label] of [
    ["Asia/Seoul", "2026-07-15T03:00:00Z", "2026-07-15", ["true", "false"], "오늘", "오늘 날짜면 ‘오늘’ 칩"],
    ["Asia/Seoul", "2026-07-15T03:00:00Z", "2026-07-14", ["false", "true"], "2026-07-14", "어제 날짜면 ‘어제’ 칩"],
    ["Asia/Seoul", "2026-07-15T03:00:00Z", "2026-07-10", ["false", "false"], "2026-07-10", "다른 날이면 둘 다 안 고름"],
    ["America/Los_Angeles", "2026-07-15T17:30:00Z", "2026-07-16", ["true", "false"], "오늘", "LA 기기(현지 7월 15일, KST 16일)도 KST 오늘"],
  ]) {
    const chips = dateChipHarness(homeShell, { tz, nowIso, value });
    t.deepEq(chips.pressed, pressed, `R-12 ${label}: aria-pressed`);
    t.deepEq(chips.on, pressed.map((p) => p === "true"), `R-12 ${label}: 옛 .on 도 같은 상태`);
    t.eq(chips.summary.split(" · ")[0], summary, `R-12 ${label}: 요약 줄의 날짜`);
  }

  // ── T-15 저장 알림 ──
  const toast = (text) => (text.match(/<div class="abSaveFeedback[^]*?<\/button><\/div>/) || [""])[0];
  const success = toast(await home(fx, `${HOME}&msg=added&saved_rid=tx-expense-3`));
  t.ok(success.includes('class="abSaveFeedback isSuccess"') && success.includes('role="status" aria-live="polite"'), "T-15 성공 알림 role·aria-live 는 그대로다");
  t.ok(success.includes('<span class="abSaveFeedbackMark" aria-hidden="true"></span>'), "T-15 성공 표식은 글자 없이 CSS 체크 원이다");
  t.ok(!success.includes("abSaveFeedbackAction") && !success.includes("실행 취소"), "T-15/T-16 성공 알림에 실행 취소를 두지 않았다(보안 판단 보고)");
  t.ok(success.includes('data-ab-feedback-close aria-label="알림 닫기"></button>'), "T-15 닫기는 이름을 지키고 x 아이콘으로 그린다");
  t.ok(success.includes("기록을 저장했습니다") && success.includes("남은 예산 "), "T-15 제목·둘째 줄(남은 예산 …)은 지금 문구다");
  const warning = toast(await home(fx, `${HOME}&msg=added&balert=${encodeURIComponent("식비 예산의 85%를 썼습니다")}`));
  t.ok(warning.includes('class="abSaveFeedback isWarning"') && warning.includes('role="status" aria-live="polite"'), "T-15 경고 알림 role·aria-live 는 그대로다");
  t.ok(warning.includes('<a class="abSaveFeedbackAction" href="/budget-alerts?month=2026-07&amp;household_id=house-home">예산 보기</a>'), "T-15 경고 알림 버튼은 예산 보기(예산 알림 화면)");
  const errorQuick = toast(await home(fx, `${HOME}&err=amount_required&quick=1`));
  t.ok(errorQuick.includes('class="abSaveFeedback isError"') && errorQuick.includes('role="alert" aria-live="assertive"'), "T-15 오류 알림 role·aria-live 는 그대로다");
  t.ok(errorQuick.includes('<a class="abSaveFeedbackAction" data-ab-feedback-retry href="#add">다시 시도</a>'), "T-15 빠른 입력 저장 실패 알림 버튼은 다시 시도");
  t.ok(errorQuick.includes('<span class="abSaveFeedbackMark" aria-hidden="true"></span>'), "T-15 오류 표식도 CSS 느낌표 원이다");
  const errorOther = toast(await home(fx, `${HOME}&err=record_delete_failed`));
  t.ok(errorOther.includes("isError") && !errorOther.includes("abSaveFeedbackAction"), "T-15 빠른 입력이 아닌 실패(삭제 등)에는 다시 시도를 두지 않는다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "viewer";
  const reader = await home(fx, `${HOME}&err=amount_required&quick=1`, await fx.cookieFor("user-wifi"));
  t.ok(toast(reader).includes("isError") && !reader.includes("data-ab-feedback-retry") && !reader.includes('class="abEntryBar"'), "T-14·T-15 쓰기 권한이 없으면 입력 바·다시 시도가 없다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "member";
  for (const [needle, label] of [
    ["body.abV22812Shell .abSaveFeedback{display:flex;gap:12px;padding:10px 6px 10px 14px;border-color:transparent!important;border-radius:16px;background:#191f28!important;color:#fff!important;", "라이트 면 #191f28·글자 #fff·모서리 16"],
    ['html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSaveFeedback{background:#edeff3!important;color:#141519!important}', "다크 면 #edeff3·글자 #141519"],
    ["body.abV22812Shell .abSaveFeedbackCopy span{color:#d1d5db!important}", "라이트 보조 #d1d5db"],
    ['html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.abSaveFeedbackCopy span,.abSaveFeedbackClose){color:#374151!important}', "다크 보조 #374151"],
    ["color:#93c5fd!important", "라이트 버튼 #93c5fd"],
    ['html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSaveFeedbackAction{color:#1d4ed8!important}', "다크 버튼 #1d4ed8"],
    ["body.abV22812Shell .abSaveFeedbackMark{flex:none;width:34px;height:34px;border-radius:50%;background:#087a55;color:#fff!important}", "34px 표시 원·성공 #087a55"],
    ["body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark{background:#c2410c;color:#fff!important}", "경고 #c2410c"],
    ["body.abV22812Shell .abSaveFeedback.isError .abSaveFeedbackMark{background:#b91c1c;color:#fff!important}", "오류 #b91c1c"],
    ["@media(max-width:899px){body.abV22812Shell .abSaveFeedback,body.abV22812Shell.abNavCollapsed .abSaveFeedback{bottom:calc(84px + env(safe-area-inset-bottom,0px))}", "모바일은 탭 바 위(아래에서 84px)"],
    ["@media(prefers-reduced-motion:no-preference){body.abV22812Shell .abTxNew{animation:abTxNew 1.8s ", "새 행 강조 1.8초는 움직임 줄이기에서 없다"],
    ["@keyframes abTxNew{from{background-color:var(--ab12-accent-soft)}}", "강조는 accent-soft 에서 행의 원래 바탕으로"],
  ]) t.ok(shell.includes(needle), `T-15 §3-4·§3-5 ${label}`);
  t.eq(maskPath(shell, "body.abV22812Shell .abSaveFeedback.isSuccess .abSaveFeedbackMark:empty:before{"), AB_UI_ICON_PATHS.check, "T-15 성공 표식은 check 마스크");
  t.eq(maskPath(shell, "body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark:empty:before{"), AB_UI_ICON_PATHS["triangle-alert"], "T-15 경고 표식은 triangle-alert 마스크(V22.9.85 규칙)");
  t.eq(maskPath(shell, "body.abV22812Shell .abSaveFeedback.isError .abSaveFeedbackMark:empty:before{"), AB_UI_ICON_PATHS["circle-alert"], "T-15 오류 표식은 circle-alert 마스크를 두 배로(느낌표만 보인다)");
  t.ok(/\.isError \.abSaveFeedbackMark:empty:before\{[^}]*-webkit-mask-size:200%;mask-size:200%\}/.test(shell), "T-15 오류 표식의 바깥 원은 잘린다(마스크 200%)");
  t.eq(maskPath(shell, "body.abV22812Shell .abSaveFeedbackClose:before{"), AB_UI_ICON_PATHS.x, "T-15 알림 닫기는 x 마스크");

  // 저장 알림 자산(V5 accountbookSaveFeedbackClientMain)을 가짜 DOM 에서 돌린다: 새 행 강조 한 번, 주소 정리(초안 정리 뒤), 다시 시도.
  const feedbackSource = functionSource(v5Module, "accountbookSaveFeedbackClientMain");
  t.ok(v5.includes(`(${feedbackSource})();`), "T-15 V5 자산이 고친 저장 알림 함수를 그대로 싣고 부른다");
  const rid = "1f6c7a2e-4b1d-4c2a-9e3f-1a2b3c4d5e6f";
  const run = feedbackHarness(feedbackSource, { search: `?month=2026-07&household_id=${HH}&msg=added&saved_rid=${rid}&saved_qd=${rid}`, kind: "success", rowId: `tx-${rid}` });
  t.ok(run.row.classes.has("abTxNew"), "T-15 saved_rid 행에 .abTxNew 를 준다");
  t.ok(!run.location.search.includes("msg=") && run.location.search.includes("saved_rid="), "T-15 알림 값(msg)은 바로 지우고 saved_rid 는 남긴다(빠른 입력 초안 정리가 먼저 읽는다)");
  run.flush(0);
  t.ok(!run.location.search.includes("saved_rid") && !run.location.search.includes("saved_qd") && run.location.search.includes("household_id=house-home"), "T-15 한 틱 뒤 saved_rid·saved_qd 를 지워 다시 불러와도 강조하지 않는다");
  run.flush(1900);
  t.ok(!run.row.classes.has("abTxNew"), "T-15 1.9초 뒤 강조 이름을 뗀다(애니메이션 1.8초)");
  const forged = feedbackHarness(feedbackSource, { search: `?msg=added&saved_rid=${encodeURIComponent('x"><img')}`, kind: "success", rowId: 'tx-x"><img' });
  t.ok(!forged.row.classes.has("abTxNew") && forged.lookups === 0, "T-15 기록 번호 꼴이 아니면 행을 찾지 않는다");
  const retry = feedbackHarness(feedbackSource, { search: `?month=2026-07&err=amount_required&quick=1`, kind: "error", retry: true, visible: [".abGlobalActionQuick"] });
  retry.clickRetry();
  t.eq(retry.opened.length, 1, "T-15 다시 시도가 빠른 입력 시트를 연다");
  t.eq(retry.opened[0][1]?.selector, ".abGlobalActionQuick", "T-15 시트를 닫으면 초점이 보이는 빠른 입력 단추로 돌아간다(데스크톱 오른쪽 아래)");
  t.ok(retry.feedback.classes.has("isLeaving"), "T-15 다시 시도를 누르면 알림을 닫는다");

  // ── T-17 하단 탭 바 ──
  for (const [needle, label] of [
    ["body.abV22812Shell .abNavBottom{height:calc(72px + var(--abSafeBottom))!important}", "높이 72"],
    ["body.abV22812Shell .abNavBottom a{min-height:52px!important;gap:4px!important}", "탭 ≥52px"],
    ["body.abV22812Shell .abNavBottom a span{font-size:11px}", "라벨 11px"],
    ["body.abV22812Shell .abNavBottom a:not(.abNavQuick,.abNavQuickInput) i{width:48px;height:30px;border-radius:999px;", "알약 48×30"],
    ["body.abV22812Shell .abNavBottom a.active:not(.abNavQuick,.abNavQuickInput) i{background:var(--ab12-accent-soft);box-shadow:inset 0 0 0 1px var(--ab12-accent)}", "현재 탭은 알약 모양(accent-soft 면 + accent 윤곽선, 칩 고른 상태 규칙)으로도 구분"],
    ["body.abV22812Shell .abNavBottom a.active{font-weight:800!important}", "현재 탭 글자 800"],
    ["body.abV22812Shell .abNavBottom a.active:before{display:none!important}", "옛 위쪽 막대는 알약으로 바꾼다"],
    ["body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput) i{width:52px!important;height:52px!important;border-radius:50%!important;margin-top:-22px!important;", "가운데 ＋ 52px 원이 솟는다"],
  ]) t.ok(shell.includes(needle), `T-17 §3-4 ${label}`);
  t.ok(shell.includes("@media(forced-colors:active)"), "T-17 강제 색상 모드 규칙은 그대로다");
  t.ok(shell.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .abNavBottom a:not(.active){color:var(--ab12-nav-inactive)!important}'), "R-8 다크에서도 안 고른 탭 글자는 보조색이다(모든 링크 강조색 규칙을 이긴다)");
  t.ok(shell.includes("body.abV22812Shell .abNavBottom a:not(.abNavQuick,.abNavQuickInput) i .abNavIconSvg{width:22px!important;height:22px!important}") && shell.includes("body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput) i .abNavIconSvg{width:26px!important;height:26px!important;stroke-width:2.2}"), "T-17 §3-3 탭 아이콘 22px·가운데 ＋ 26px(선 2.2) — 셸의 20px!important 를 이긴다");
  t.ok(shell.includes("body.abV22812Shell .abNavIconSvg{stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}"), "V86:V-6 셸 화면의 메뉴 아이콘 선은 1.8·둥근 끝이다(칠한 점 h0 이 보인다)");
  t.ok(html.includes('data-nav-scope="user"') && !html.includes('<style id="unifiedNavStyle">'), "V86:V-6 홈은 메뉴 인라인 규칙을 싣지 않는 화면이라 셸 규칙이 선을 정한다");

  // ── V85:R-15·R-16 홈 카드 ──
  t.ok(html.includes("이번 달 지출의 60%⁠를 차지합니다") && !html.includes("60%를 차지합니다"), "R-15 ‘60%를’은 단어 잇개(U+2060)로 ‘%’ 뒤에서 줄을 바꾸지 않는다");
  t.ok(shell.includes("body.abV22812Shell .reportChallenge :is(a,summary,input,button):focus-visible{outline-color:#fff!important}"), "R-16 어두운 챌린지 카드 안 초점 링은 흰색");

  // ── T-18 빈 상태 ──
  t.ok(/\.abEmptyState\{display:grid;[^}]*border:2px dashed var\(--ab12-line\)/.test(shell), "T-18 빈 상태는 점선 상자다");
  t.ok(/\.abEmptyIcon\{[^}]*width:52px;height:52px;[^}]*background:var\(--ab12-accent-soft\)/.test(shell), "T-18 52px accent-soft 아이콘 칸");
  t.eq(maskPath(shell, "body.abV22812Shell .abEmptyIcon:before{"), AB_UI_ICON_PATHS["notebook-pen"], "T-18 아이콘은 notebook-pen 마스크");
  t.ok(/\.abEmptyState \.abEmptyAction\{[^}]*min-height:48px;[^}]*background:var\(--ab12-action\)!important/.test(shell), "T-18 행동 버튼은 주 버튼(48px)");
  const box = (title, line, action) => `<span class="abEmptyIcon" aria-hidden="true"></span><h3>${title}</h3><p>${line}</p>${action ? '<a class="abEmptyAction" href="#add" data-ab-quick-open>첫 기록 남기기</a>' : ""}</div>`;
  const writerLine = "카카오톡에 “점심 만원”처럼 보내거나 여기서 바로 적어 보세요.";
  const july = fx.db.transactions.filter((row) => row.household_id === HH);
  for (const row of july) row.transaction_date = row.transaction_date.replace("2026-07", "2026-06");
  const emptyHome = await home(fx);
  t.ok(emptyHome.includes(`<div class="abEmptyState">${box("아직 이번 달 기록이 없어요", writerLine, true)}`), "T-18 §3-6 기록 없는 이번 달 홈: 제목·한 줄·첫 기록 남기기(시트를 연다)");
  t.ok(!emptyHome.includes("data-ab-empty-folder"), "T-18 다른 달에 기록이 있으면 새 가계부 빈 폴더가 아니다");
  t.ok(emptyHome.includes('<span>들어온 돈</span><b class="income">0원</b>') && emptyHome.includes('<span>나간 돈</span><b class="expense">0원</b>') && !/[+-]0원/.test(emptyHome), "V86:V-5 빈 달의 들어온 돈·나간 돈은 부호 없는 0원이다(옛 ‘+0원 · -0원’)");
  t.ok(html.includes('<span>들어온 돈</span><b class="income">+3,380,000원</b>') && html.includes('<span>나간 돈</span><b class="expense">-248,600원</b>'), "V86:V-5 금액이 있으면 부호는 그대로다");
  const emptyTab = await home(fx, `${HOME}&tab=transactions`);
  t.ok(emptyTab.includes(`<div class="abEmptyState abTxEmpty">${box("아직 이번 달 기록이 없어요", writerLine, true)}`), "T-18 내역 탭도 같은 빈 상태");
  const future = await home(fx, `/app?month=2026-08&household_id=${HH}&tab=transactions`);
  t.ok(future.includes("<h3>이 달에는 기록이 없어요</h3>") && !future.includes("아직 이번 달 기록이 없어요"), "T-18 이번 달이 아니면 \"이번 달\"이라 하지 않는다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "viewer";
  const readerEmpty = await home(fx, HOME, await fx.cookieFor("user-wifi"));
  t.ok(readerEmpty.includes(`<div class="abEmptyState">${box("아직 이번 달 기록이 없어요", "기록이 생기면 여기에 보여요.", false)}`), "T-18 쓰기 권한이 없으면 단추와 적으라는 말이 없다");
  fx.db.household_members.find((m) => m.user_id === "user-wifi" && m.household_id === HH).role = "member";
  fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
  const fresh = await home(fx);
  t.ok(fresh.includes("data-ab-empty-folder") && !fresh.includes('class="abEmptyState"'), "T-18 기록이 하나도 없는 새 가계부는 온보딩(빈 폴더) 그대로다");
}));

// ── V86:V-7 화면 감사 도구(사람이 돌린다, 하네스 밖): 아이콘 칸에 그린 선택 표시와 안쪽 윤곽선도 잰다 ──
const auditTool = readFileSync(new URL("../tools/screen-audit.mjs", import.meta.url), "utf8");
t.ok(auditTool.includes('const SLOTS = ["top", "right", "bottom", "left", "::before", "::after", "ring"];') && auditTool.includes("/\\binset\\b/.test(part)"), "V86:V-7 감사 도구가 안쪽 윤곽선(box-shadow inset)을 한 변으로 잰다");
t.ok(auditTool.includes("mine.textContent.trim() || theirs.textContent.trim()") && auditTool.includes("best = { ...child, via: label(mine) }"), "V86:V-7 표시가 글자 없는 자식(아이콘 칸)에 있으면 같은 자리의 자식끼리도 견준다");
t.ok(auditTool.includes("const peers = exact.length ? exact : found;"), "V86:V-7 같은 클래스 형제가 있으면 그것들과만 견준다(고른 탭을 가운데 ＋ 단추와 견주지 않는다)");

// ── T-16 실행 취소: 구현하지 않고 보고 ──
const findings = readFileSync(new URL("../docs/codex/DESIGN_FINDINGS_V22_9_86.md", import.meta.url), "utf8");
t.ok(/## T-16 실행 취소/.test(findings) && findings.includes("saved_rid") && findings.includes("handleMyDeleteTransaction"), "T-16 구현하지 않은 이유와 제안이 문서에 있다");

t.done();

function functionSource(source, name) {
  const node = parse(source, { ecmaVersion: "latest", sourceType: "module" }).body.find((n) => n.type === "FunctionDeclaration" && n.id.name === name);
  if (!node) throw new Error(`${name} 이 없다`);
  return source.slice(node.start, node.end);
}

// 홈 스크립트의 abQuickSyncMore 를 꺼내 가짜 DOM·가짜 시계·기기 시간대(process.env.TZ, V8 이 바로 반영한다)로 돌린다.
function dateChipHarness(runtime, { tz, nowIso, value }) {
  const start = runtime.indexOf("function abQuickSyncMore(){");
  const end = runtime.indexOf("function abQuickSyncAfter(", start);
  if (start < 0 || end < 0) throw new Error("abQuickSyncMore 가 없다");
  const chips = [0, -1].map((day) => {
    const c = { attrs: { "data-day": String(day) }, on: false, getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); } };
    c.classList = { toggle: (name, force) => { if (name === "on") c.on = !!force; } };
    return c;
  });
  const out = { textContent: "" };
  const fields = { txDate: { value }, payInput: { value: "" }, catInput: { value: "" } };
  const document = { getElementById: (id) => fields[id] || null, querySelectorAll: (s) => (s === ".dateChip" ? chips : []), querySelector: (s) => (s === "[data-ab-quick-summary]" ? out : null) };
  const previous = process.env.TZ;
  process.env.TZ = tz;
  try {
    const context = vm.createContext({ document, abQuickTypeLabels() {} });
    vm.runInContext(`(() => { const Real = Date; const FIXED = ${Date.parse(nowIso)}; globalThis.Date = class extends Real { constructor(...a) { if (a.length === 0) super(FIXED); else super(...a); } static now() { return FIXED; } }; })()`, context);
    vm.runInContext(`${runtime.slice(start, end)}abQuickSyncMore();`, context);
  } finally {
    if (previous === undefined) delete process.env.TZ; else process.env.TZ = previous;
  }
  return { pressed: chips.map((c) => c.attrs["aria-pressed"]), on: chips.map((c) => c.on), summary: out.textContent };
}

// 서버가 그린 첫 거래 행과 빠른 입력 칩 값으로 가짜 DOM 을 만들고, V5 맨 앞의 분류 판정과 동그라미 함수를 돌린다.
function circleHarness(keyPrefix, source, html) {
  const el = (attrs = {}, extra = {}) => ({
    attrs, children: [], className: "", innerHTML: "", ...extra,
    setAttribute(k, v) { this.attrs[k] = String(v); }, getAttribute(k) { return this.attrs[k] ?? null; },
    insertBefore(child) { this.children.unshift(child); },
    get firstChild() { return this.children[0] || null; },
  });
  const [, type, title, line] = html.match(/<article class="v8-tx" id="[^"]+" data-type="(\w+)">[^]*?<summary class="v8-tx-main"><div><b>([^<]*)<\/b><span>([^<]*)<\/span>/);
  const article = el({ "data-type": type });
  const main = el({}, { closest: () => article });
  main.querySelector = (s) => s === ".abCat" ? main.children.find((c) => c.className === "abCat") || null : s === "span:not(.v8-spender)" ? { textContent: line } : s === "b" ? { textContent: title } : null;
  const chips = [...html.match(/<div class="chipRow" id="freqChips">[^]*?<\/div>/)[0].matchAll(/<button type="button" data-memo="([^"]*)" data-cat="([^"]*)"/g)].map(([, memo, cat]) => {
    const chip = el({ "data-memo": memo, "data-cat": cat });
    chip.querySelector = (s) => s === ".abCat" ? chip.children.find((c) => c.className === "abCat") || null : null;
    return chip;
  });
  const document = {
    createElement: () => el(),
    querySelectorAll: (s) => s === "article.v8-tx .v8-tx-main" ? [main] : s === ".chipRow button[data-memo]" ? chips : [],
  };
  const context = vm.createContext({ window: {}, document });
  vm.runInContext(keyPrefix, context);
  const run = () => vm.runInContext(`(${source})();`, context);
  run();
  const all = () => [main, ...chips].flatMap((node) => node.children);
  return { row: { type, title, line }, all, keys: () => all().map((node) => node.attrs["data-ck"]), again: run };
}

function quickHarness(runtime, afterAttrs) {
  const byName = new Map();
  const submit = { disabled: false };
  const form = {
    handlers: {}, hidden: [],
    appendChild(n) { this.hidden.push(n); byName.set(n.name, n); },
    querySelector(s) { if (s === 'input[name="month"]') return { value: "2026-07" }; if (s === 'input[name="household_id"]') return null; if (s === '.quickSubmit button[type="submit"]') return submit; return select(s); },
    addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); },
    dispatchEvent(e) { for (const fn of this.handlers[e.type] || []) fn(e); },
  };
  function node(value = "", name = "", type = "text", attrs = {}) {
    const n = {
      value, name, type, textContent: "", attrs, handlers: {}, classList: { add() {}, remove() {} },
      getAttribute(k) { return this.attrs[k] ?? null; }, setAttribute(k, v) { this.attrs[k] = String(v); },
      setCustomValidity() {}, addEventListener(type, fn) { (this.handlers[type] ||= []).push(fn); }, closest() { return form; }, focus() {},
      dispatchEvent(e) { for (const fn of this.handlers[e.type] || []) fn.call(this, { ...e, target: this }); },
    };
    if (name) byName.set(name, n);
    return n;
  }
  const fields = { smartInput: node(), amountInput: node("", "amount"), memoInput: node("", "memo"), payInput: node("", "payment_method"), catInput: node("", "category"), txDate: node("2026-07-15", "transaction_date", "date"), rawTextInput: node("", "raw_text", "hidden"), quickAfter: node("", "", "", { ...afterAttrs }), type: "expense" };
  const radios = { expense: node("expense", "", "radio"), income: node("income", "", "radio") };
  for (const [kind, n] of Object.entries(radios)) Object.defineProperty(n, "checked", { get() { return fields.type === kind; }, set(v) { if (v) fields.type = kind; } });
  function select(s) {
    if (s === "form") return form;
    if (s === "#smartInput") return fields.smartInput;
    const type = s.match(/\[name="?type"?\](?:\[value="?(income|expense)"?\])?/);
    if (type) return type[1] ? radios[type[1]] : radios[fields.type];
    const name = s.match(/\[name="?([\w_]+)"?\]/)?.[1];
    return byName.get(name) || null;
  }
  const document = {
    getElementById(id) { return fields[id] || null; }, createElement() { return node(); }, addEventListener() {}, dispatchEvent() {},
    querySelectorAll(s) { return s === "input[name=type]" ? Object.values(radios) : []; },
    querySelector(s) { if (s === "#add form.form") return form; if (s === "input[name=type][value=income]:checked") return fields.type === "income" ? radios.income : null; return select(s); },
  };
  const Event = class { constructor(type, opts = {}) { this.type = type; Object.assign(this, opts); } };
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [Date.parse("2026-07-15T03:00:00Z")])); } static now() { return Date.parse("2026-07-15T03:00:00Z"); } }
  const context = vm.createContext({ document, window: { addEventListener() {}, sessionStorage: { getItem() { return null; }, setItem() {}, removeItem() {} } }, location: { pathname: "/app", search: "?month=2026-07&household_id=house-home", hash: "" }, navigator: {}, Intl, URLSearchParams, Date: ClockDate, Event, CustomEvent: Event, setTimeout, clearTimeout });
  vm.runInContext(runtime.slice(0, runtime.indexOf("\n(function mobileShellUiClientMain")), context);
  const fire = (field, type) => field.dispatchEvent({ type });
  return {
    fields, submit, after: fields.quickAfter,
    fill(text) { fields.smartInput.value = text; fire(fields.smartInput, "input"); },
    manual(id, value) { fields[id].value = value; fire(fields[id], "input"); },
    manualType(kind) { radios[kind].checked = true; fire(radios[kind], "change"); },
  };
}

function feedbackHarness(source, { search, kind, rowId = "", retry = false, visible = [] }) {
  const timers = [];
  const classes = () => { const set = new Set(); return { set, add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) }; };
  const rowClasses = classes(), feedbackClasses = classes();
  const row = { classList: rowClasses, classes: rowClasses.set };
  let lookups = 0, retryHandler = null;
  const opened = [];
  const retryLink = { addEventListener(type, fn) { if (type === "click") retryHandler = fn; } };
  const feedback = {
    classes: feedbackClasses.set, classList: feedbackClasses, attrs: {},
    getAttribute(k) { return k === "data-ab-feedback-kind" ? kind : null; }, hasAttribute(k) { return k in this.attrs; }, setAttribute(k, v) { this.attrs[k] = v; },
    querySelector(s) { return s === "[data-ab-feedback-retry]" && retry ? retryLink : null; }, addEventListener() {},
  };
  const location = { pathname: "/app", search, hash: "" };
  const document = {
    readyState: "interactive", addEventListener() {},
    getElementById(id) { lookups += 1; return id === rowId ? row : null; },
    querySelector(s) {
      if (s === "[data-ab-save-feedback]") return feedback;
      return { selector: s, getClientRects: () => (visible.includes(s) ? [{}] : []) };
    },
  };
  const window = {
    history: { replaceState(_state, _title, url) { location.search = url.includes("?") ? url.slice(url.indexOf("?")).replace(/#.*$/, "") : ""; } },
    openAbQuickInput(date, trigger) { opened.push([date, trigger]); },
  };
  const context = vm.createContext({ document, window, location, URLSearchParams, requestAnimationFrame: (fn) => fn(), setTimeout: (fn, ms) => { timers.push({ fn, ms }); return timers.length; }, clearTimeout() {} });
  vm.runInContext(`${source}\naccountbookSaveFeedbackClientMain();`, context);
  return {
    row, feedback, location, opened,
    get lookups() { return lookups; },
    flush(upTo) { for (const timer of timers.splice(0).sort((a, b) => a.ms - b.ms)) { if (timer.ms <= upTo) timer.fn(); else timers.push(timer); } },
    clickRetry() { retryHandler({ button: 0, preventDefault() {} }); },
  };
}
