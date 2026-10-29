// V22.9.84 — 디자인 보강 1단계(docs/ux/MALHAEBOOK_UX_WORK_ORDER.md T-01 ~ T-07) 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// Claude Design 시안 검토(2026-10-28)에서 빠른 입력 칸과 홈 목록을 8테마(파랑·초록·보라·호박 × 라이트·다크)로 그려 보니 이런 것들이 나왔다.
//   T-01 바탕 규칙의 '.form button:not(.danger)'가 폼 안 모든 단추를 주 단추(파란 채움)로 칠했다. 메모·결제수단·날짜 칩과
//        '기록 저장'이 같은 무게로 보였고, 어느 칩을 골랐는지 알리는 상태도 없었다.
//   T-02 지출·수입 세그먼트의 고른 칸이 라이트용 리터럴(#1b64da 글자·#b7d8ff 테두리)이었고, 다크에서는 면 목록(.seg span)에 묶여
//        고른 칸과 안 고른 칸이 같은 면이었다.
//   T-03 거래 행의 읽기 이름이 글자를 그대로 이어 "가족 카페2026-07-09 · 카페/간식 · 카카오페이지출자 Bin-28,600원수정·삭제 상세 보기"처럼 붙어 읽혔다.
//   T-04 입력 카드 테두리만 리터럴(#dbe7f4·#e8edf4)이라 다크에서 바로 아래 피드 카드와 달랐다.
//   T-05 금액 색: 지출은 본문색, 수입은 --pos 로 맞춘다(빨강은 초과·오류만 — 시안 승인).
//   T-06 한국어 낱말이 음절 중간에서 끊겼다(카카/오페이).
//   T-07 단추·칩·하단 탭·거래 행에 누름 반응이 없었다.
//
// ── 어떻게 잡는가 ──
// 메모리 픽스처로 화면과 1년 캐시 자산을 실제로 받아 규칙을 확인하고, 칩 상태 함수는 자산 바이트에서 떼어 작은 가짜 DOM 에서 돌린다.
// 이 단계는 홈 HTML 에 아무것도 더하지 않는다(규칙·코드는 캐시 자산에만) — 홈 HTML 과 셸 CSS 를 바이트·!important 상한으로 묶는다.
// 상한은 이 판의 실측이다. 늘리는 판은 티켓 번호와 이유를 적고 값을 고친다(작업 지시서 §1-3, T-24).
import vm from "node:vm";
import { app, BASE, ctx, counter, fixture, withClock, page } from "./lib-audit-v22934.mjs";

const t = counter("V22.9.84 디자인 보강 1단계(칩·세그먼트·거래 행 읽기 이름·입력 카드 테두리·금액 색·줄바꿈·누름 반응)");
const HH = "house-home";
const HOME = `/app?month=2026-07&household_id=${HH}`;
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)";
const count = (text, needle) => String(text).split(needle).length - 1;
const asset = async (path) => {
  const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
  t.eq(response.status, 200, `${path} 가 내려간다`);
  return response.text();
};
const homeHtml = async (fx) => (await app.fetch(new Request(`${BASE}${HOME}`, { headers: { cookie: fx.cookie, "user-agent": UA } }), fx.env, ctx)).text();

// 이 판의 실측(2026-10-28). 홈 HTML 은 V22.9.83 과 같은 바이트여야 한다.
// V22.9.86: 3단계 T-14 의 "한 줄로 기록하기" 입력 바(링크 하나)와 미리보기 줄의 data-income(+148 B), V85:R-15 의 단어 잇개(U+2060, +3 B)로
// 기준 35,768 B·200행 40,432 B 가 됐다.
// 지시서 §1 의 35 KiB(35,840 B) 기준 안이다. 3단계의 다른 티켓(T-11·T-13·T-15·T-17·T-18)은 홈 HTML 에 더하지 않는다(JS·CSS·빈 달에서만).
// V22.9.86 T-12(단독 커밋): SMART NOTICE 띠를 빼고 하루 계획 줄을 속도 문장 하나로 바꿔 기준 35,698 B·200행 40,391 B 로 줄었다.
const HOME_BASE_MAX = 35698;
const HOME_200_MAX = 40391;
// V22.9.85: 2단계(T-09 카테고리 토큰·마스크 15개, T-10 화면 아이콘 마스크 3개)와 R-1·R-3·R-6·R-7·의료 제외 낱말로 셸이 239,647 B(gzip 49,917)가 됐다.
// V22.9.86: 3단계(T-11 머리말·가계부 고르기 시트, T-13 동그라미, T-14 입력 바·시트, T-15 알림·새 행 강조, T-17 탭 바, T-18 빈 상태)가
// design-uplift-3-css.js 로 붙고, V85 검토 후속 R-8(다크 탭 글자)·R-12(날짜 칩)·R-13(빠른 입력 초점)·R-16(챌린지 카드 초점)과 메뉴 아이콘 선(V86:V-6)·탭 아이콘 크기가 더해져
// 셸이 257,952 B 가 됐다(하단 탭 알약 윤곽선 46 B 포함). T-12(단독 커밋)의 속도 문장 면·시계 마스크·게이지 오늘 표시 규칙으로 259,828 B 다.
const SHELL_CSS_MAX_BYTES = 259828;
// V22.9.85: R-3·R-6·R-7 의 다크·초점 규칙이 이미 !important 인 규칙(모든 링크 강조색·다크 표면 목록·옛 2px 초점 링)을 이겨야 해서 12회 늘었다.
// V22.9.86: 81회 늘었다. 모두 이미 !important 인 옛 규칙(머리말 단추 40px·탭 바 높이·칩 패딩·빠른 입력 시트·알림 면 색·옛 칩 무리·outline:0)을 이겨야 하는 자리다.
const SHELL_IMPORTANT_MAX = 1599;
const HOME_CSS_IMPORTANT_MAX = 368;

const SHELL = "/assets/accountbook-shell-v22986.css";
const HOME_CSS = "/assets/mobile-home-v22985.css";
const V5 = "/assets/accountbook-v5-v22986.js";
const HOME_JS = "/assets/mobile-home-v22986.js";
const HOME_SHELL_JS = "/assets/mobile-home-shell-v22986.js";

await withClock("2026-07-15", () => fixture(async (fx) => {
  const home = await homeHtml(fx);
  const shell = await asset(SHELL);
  const homeCss = await asset(HOME_CSS);
  const v5 = await asset(V5);
  const homeJs = await asset(HOME_JS);
  const homeShellJs = await asset(HOME_SHELL_JS);

  // ── 자산 주소와 홈 HTML 상한 ──
  for (const path of [SHELL, HOME_CSS, V5, HOME_SHELL_JS]) t.eq(count(home, path), 1, `홈이 새 주소 ${path} 를 한 번 받는다`);
  for (const old of ["accountbook-shell-v22983.css", "mobile-home-v22979.css", "accountbook-v5-v22980.js", "mobile-home-shell-v22983.js"]) {
    t.ok(!home.includes(old), `홈이 옛 주소 ${old} 를 받지 않는다(옛 1년 캐시와 섞이지 않는다)`);
  }
  t.ok(Buffer.byteLength(home) <= HOME_BASE_MAX, `기준 픽스처 홈 HTML 이 늘지 않았다 (${Buffer.byteLength(home)} B, 상한 ${HOME_BASE_MAX})`);
  t.ok(Buffer.byteLength(shell) <= SHELL_CSS_MAX_BYTES, `셸 CSS 바이트 상한 (${Buffer.byteLength(shell)} B, 상한 ${SHELL_CSS_MAX_BYTES})`);
  t.ok(count(shell, "!important") <= SHELL_IMPORTANT_MAX, `셸 CSS !important 상한 (${count(shell, "!important")}회, 상한 ${SHELL_IMPORTANT_MAX})`);
  t.ok(count(homeCss, "!important") <= HOME_CSS_IMPORTANT_MAX, `홈 스타일시트 !important 상한 (${count(homeCss, "!important")}회, 상한 ${HOME_CSS_IMPORTANT_MAX})`);

  // ── T-01 칩: 폼 안 모든 단추를 주 단추로 칠하던 줄을 제출 단추로 좁혔다(바탕 규칙과 셸 템플릿 모두) ──
  t.eq(count(shell, ".form button:not(.danger)"), 0, "T-01 셸 CSS 어디에도 폼 안 모든 단추를 칠하는 선택자가 없다");
  t.ok(count(shell, '.form button[type="submit"]:not(.danger)') >= 3, "T-01 바탕 규칙·라이트·다크 줄이 모두 제출 단추로 좁혀졌다");
  t.ok(shell.includes('body.abV22812Shell #add .chipRow button{min-height:44px!important;padding:0 14px!important;gap:6px;border-radius:999px!important;background:var(--ab12-surface)!important;border:1px solid var(--ab12-line)!important;color:var(--ab12-text)!important;font-weight:600!important}'),
    "T-01 칩 기본: 면·선·본문색 600, 높이 44px 이상, 둥근 999px");
  t.ok(shell.includes('body.abV22812Shell #add .chipRow button[aria-pressed="true"],body.abV22812Shell #add .chipRow button.isOn{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important;font-weight:800!important}'),
    "T-01 고른 칩: aria-pressed=true 일 때 accent-soft 면·accent 선과 글자 800");
  const chips = [...home.matchAll(/<div class="chipRow[^"]*"[^>]*>([\s\S]*?)<\/div>/g)].flatMap(([, row]) => [...row.matchAll(/<button\b([^>]*)>/g)].map(([, attrs]) => attrs));
  t.ok(chips.length >= 6 && chips.every((attrs) => /\btype="button"/.test(attrs)), `T-01 칩 ${chips.length}개는 모두 type="button" 이라 제출 단추 칠을 받지 않는다`);
  t.ok(/<div class="quickSubmit"><button type="submit">기록 저장<\/button>/.test(home), "T-01 '기록 저장'은 type=\"submit\" 이라 주 단추 칠을 그대로 받는다");
  t.eq(count(home, "<button>") + [...home.matchAll(/<button\b(?![^>]*\btype=)[^>]*>/g)].length, 0, "T-01 홈에 type 없는(암묵 제출) 단추가 없다");

  // 칩 상태 함수: 홈 스크립트 끝의 즉시 실행 함수를 떼어 가짜 DOM 에서 돌린다.
  const at = homeJs.indexOf("(function quickChipPressedClientMain()");
  t.ok(at > 0 && homeJs.endsWith("})();"), "T-01 홈 스크립트 끝에 칩 상태 함수가 붙어 있다");
  t.ok(homeShellJs.includes(homeJs.slice(at)), "T-01 홈 셸 스크립트도 같은 칩 상태 함수를 싣는다");
  const source = homeJs.slice(at);
  const chip = (attrs) => ({ attrs: { ...attrs }, hasAttribute(name) { return name in this.attrs; }, getAttribute(name) { return name in this.attrs ? this.attrs[name] : null; }, setAttribute(name, value) { this.attrs[name] = String(value); } });
  const dom = () => {
    const memo = { value: "" }, pay = { value: "" };
    const buttons = [chip({ "data-memo": "점심", "data-cat": "외식" }), chip({ "data-memo": "커피", "data-cat": "카페/간식" }), chip({ "data-pay-only": "카카오페이" }), chip({ "data-pay-only": "현대카드" })];
    const listeners = { section: {}, form: {} };
    const on = (bag) => (type, fn) => { (bag[type] ||= []).push(fn); };
    const form = { querySelector: (sel) => (sel === "#memoInput" ? memo : sel === "#payInput" ? pay : null), querySelectorAll: (sel) => (sel === ".chipRow button" ? buttons : []), addEventListener: on(listeners.form) };
    const section = { querySelector: (sel) => (sel === "form.form" ? form : null), addEventListener: on(listeners.section) };
    const timers = [];
    const sandbox = { document: { querySelector: (sel) => (sel === "#add" ? section : null) }, setTimeout: (fn) => { timers.push(fn); return timers.length; } };
    vm.runInNewContext(source, sandbox);
    const fire = (where, type) => (listeners[where][type] || []).forEach((fn) => fn({ type }));
    const flush = () => { const n = timers.length; timers.splice(0).forEach((fn) => fn()); return n; };
    const pressed = () => buttons.filter((b) => b.attrs["aria-pressed"] === "true").map((b) => b.attrs["data-memo"] || b.attrs["data-pay-only"]).join(",");
    return { memo, pay, buttons, listeners, fire, flush, pressed };
  };
  {
    const d = dom();
    t.ok(d.buttons.every((b) => b.attrs["aria-pressed"] === "false"), "T-01 처음에는 모든 칩이 aria-pressed=false");
    t.deepEq(Object.keys(d.listeners.section).sort(), ["change", "click", "input"], "T-01 빠른 입력 칸 전체의 입력·바뀜·누름을 듣는다(한 줄 입력이 칸을 이벤트 없이 채워도 따라간다)");
    t.deepEq(Object.keys(d.listeners.form).sort(), ["ab:quick-restore", "reset"], "T-01 폼 비우기와 초안 복원(ab:quick-restore)도 듣는다");
    d.memo.value = "커피";
    d.fire("section", "click"); d.fire("section", "input");
    t.eq(d.flush(), 1, "T-01 한 번의 누름에 이어진 이벤트는 한 번만 맞춘다");
    t.eq(d.pressed(), "커피", "T-01 내용 칸이 '커피'면 커피 칩만 눌린 상태");
    d.pay.value = "카카오페이"; d.fire("section", "change"); d.flush();
    t.eq(d.pressed(), "커피,카카오페이", "T-01 결제수단 칩은 결제수단 칸 값으로 따로 눌린다");
    d.memo.value = "커피 두 잔"; d.fire("section", "input"); d.flush();
    t.eq(d.pressed(), "카카오페이", "T-01 손으로 내용을 고치면 커피 칩이 풀린다");
    d.memo.value = ""; d.pay.value = ""; d.fire("form", "reset"); d.flush();
    t.eq(d.pressed(), "", "T-01 저장 뒤 폼을 비우면 모든 칩이 풀린다");
    d.memo.value = "점심"; d.fire("form", "ab:quick-restore"); d.flush();
    t.eq(d.pressed(), "점심", "T-01 초안을 되살리면 되살린 내용의 칩이 눌린다");
  }
  {
    const listeners = [];
    vm.runInNewContext(source, { document: { querySelector: () => null }, setTimeout() { listeners.push("timer"); } });
    t.eq(listeners.length, 0, "T-01 빠른 입력 칸이 없는 화면에서는 아무것도 하지 않는다");
  }

  // ── T-02 세그먼트 ──
  t.ok(!shell.includes("color:#1b64da!important;border:1px solid #b7d8ff!important"), "T-02 바탕 규칙의 세그먼트·피드 고른 칸 리터럴(#1b64da·#b7d8ff)이 토큰으로 바뀌었다");
  t.ok(shell.includes("{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border:1px solid var(--ab12-accent)!important}"), "T-02 고른 칸은 accent-soft 면·accent 글자와 선");
  t.ok(!shell.includes(".filterAdvanced,.seg span,") && shell.includes(".filterAdvanced,.seg button,"), "T-02 다크 면 목록에서 .seg span 을 뺐다(고른 칸이 면에 덮이지 않는다)");
  t.ok(shell.includes("body.abV22812Shell #add .seg{background:var(--ab12-surface-raised);padding:4px;border-radius:14px;gap:4px}"), "T-02 트랙은 surface-raised");
  t.ok(shell.includes("body.abV22812Shell #add .seg span{height:44px;border-radius:11px;background:transparent!important;border:1px solid transparent!important;color:var(--ab12-nav-inactive)!important;font-weight:700}"), "T-02 안 고른 칸은 투명 면·nav-inactive 글자, 높이 44px");
  t.ok(shell.includes("body.abV22812Shell #add .seg input:checked+span{background:var(--ab12-surface)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important;font-weight:800;box-shadow:var(--shadow)}"), "T-02 고른 칸은 surface 면·accent 선과 글자 800");
  t.ok(/<div class="seg"><label><input type="radio" name="type" value="expense" checked><span>지출<\/span><\/label><label><input type="radio" name="type" value="income"><span>수입<\/span><\/label><\/div>/.test(home), "T-02 세그먼트 마크업(라디오 + span)은 그대로다");

  // ── T-03 거래 행 읽기 이름 ──
  t.ok(v5.includes('["b", "span:not(.v8-spender)", "span.v8-spender", "strong"]'), "T-03 V5 번들이 제목·날짜 줄·지출자·금액을 따로 읽는다");
  t.ok(v5.includes('parts.join(", ") + ", 수정·삭제 상세 보기"'), "T-03 쉼표로 나누고 끝에 '수정·삭제 상세 보기'를 한 번만 붙인다");
  const text = (html) => html.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").trim().replace(/\s+/g, " ");
  const label = (inner) => {
    const pick = (re) => { const m = inner.match(re); return m ? text(m[1]) : ""; };
    const parts = [pick(/<b\b[^>]*>([\s\S]*?)<\/b>/), pick(/<span(?![^>]*class="v8-spender")[^>]*>([\s\S]*?)<\/span>/), pick(/<span class="v8-spender">([\s\S]*?)<\/span>/), pick(/<strong\b[^>]*>([\s\S]*?)<\/strong>/)].filter(Boolean);
    return { parts, label: `${parts.join(", ")}, 수정·삭제 상세 보기` };
  };
  const rows = [...home.matchAll(/<summary class="v8-tx-main">([\s\S]*?)<\/summary>/g)].map(([, inner]) => label(inner));
  t.ok(rows.length >= 3, `T-03 홈 거래 행 ${rows.length}개`);
  t.eq(rows[0].label, "가족 카페, 2026-07-09 · 카페/간식 · 카카오페이, 지출자 Bin, -28,600원, 수정·삭제 상세 보기", "T-03 첫 행은 제목, 날짜 줄, 지출자, 금액 순으로 쉼표를 두고 읽힌다");
  t.ok(rows.every((row) => row.parts.length >= 3 && !/원수정|[^\s,]지출자/.test(row.label)), "T-03 모든 행이 세 조각 이상이고 금액·지출자가 앞 글자에 붙지 않는다");

  // ── T-04 입력 카드 테두리 ──
  t.ok(homeCss.includes("#add.panel{border:1px solid var(--ab12-line,#dbe7f4);") && homeCss.includes("#add.panel{border:1px solid var(--ab12-line,#e8edf4)!important;"), "T-04 입력 카드 테두리가 피드 카드와 같은 --ab12-line 토큰이다");
  t.ok(!/#add\.panel\{border:1px solid #/.test(homeCss), "T-04 입력 카드 테두리에 리터럴 색이 남지 않았다");

  // ── T-05 금액 색 ──
  t.ok(shell.includes("html[data-ab-resolved-theme] body.abV22812Shell :is(.homeMetric>b.income,.v8-tx strong.income,.homeTxAmt.income){color:var(--pos)!important}"), "T-05 수입 금액은 --pos");
  t.ok(shell.includes("html[data-ab-resolved-theme] body.abV22812Shell :is(.homeMetric>b.expense,.v8-tx strong.expense,.homeTxAmt:not(.income)){color:var(--ab12-text)!important}"), "T-05 지출 금액은 본문색(빨강은 초과·오류만)");
  const analysis = (await page(fx, `/my/analysis?month=2026-07&household_id=${HH}`)).html;
  t.ok(!/class="(?:[^"]*\s)?(?:homeMetric|v8-tx|homeTxAmt)(?:\s[^"]*)?"/.test(analysis), "T-05 금액 색 규칙이 닿는 요소가 분석 화면에는 없다(분석 화면은 바꾸지 않는다)");

  // ── T-06 줄바꿈 ──
  // V22.9.85 R-1: 셸 body 는 anywhere 대신 break-word 다. anywhere 가 최소 폭 계산까지 바꿔 표 칸·가로 배치의 금액을 쪼갰다(119,03/2원).
  t.ok(/body\.abV22812Shell\{[^}]*word-break:keep-all;overflow-wrap:break-word;[^}]*\}/.test(shell), "T-06 셸 바탕 body 규칙이 keep-all·break-word 다(홈·사이드바 화면·/my 로그인)");
  const login = await page(fx, "/my", { cookie: "" });
  t.eq(login.status, 200, "T-06 /my 로그인 화면이 열린다");
  t.ok(login.html.includes(`href="${SHELL}"`) && /<body[^>]*class="[^"]*\babV22812Shell\b/.test(login.html), "T-06 /my 로그인 화면도 셸 CSS·셸 body 를 받아 같은 줄바꿈을 쓴다");
  const landing = await page(fx, "/", { cookie: "" });
  t.ok(landing.status === 200 && landing.html.includes("word-break:keep-all"), "T-06 공개 랜딩은 원래 keep-all 이다");

  // ── T-07 누름 반응 ──
  // V22.9.85 R-7: 내역 거르기 칩(.txChip)도 같은 누름 반응을 받는다(디자인 적합성 점검에서 누름 줄어듦·180ms 색 전환이 없었다).
  const motion = ":is(button,.btn,.chip,.txChip,.abNavBottom a,.v8-tx-main)";
  t.ok(shell.includes(`body.abV22812Shell ${motion}{transition:transform var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),`), "T-07 단추·칩·하단 탭·거래 행 전환에 transform(120ms)이 들어 있다");
  t.ok(/--ab12-dur:180ms;[^}]*--ab12-ease:cubic-bezier\(\.2,\.8,\.2,1\);[^}]*--ab12-dur-fast:120ms;/.test(shell), "T-07 시간·곡선 토큰이 정의돼 있다");
  const pressAt = shell.indexOf(`body.abV22812Shell ${motion}:active:not(:disabled){transform:scale(.97)}`);
  const tabAt = shell.indexOf("body.abV22812Shell .abNavBottom a.abNavQuickInput:active{transform:translateY(-8px) scale(.97)}");
  const reduceAt = shell.indexOf(`@media(prefers-reduced-motion:reduce){body.abV22812Shell ${motion}{transition:none!important}body.abV22812Shell ${motion}:active{transform:none!important}body.abV22812Shell .abNavBottom a.abNavQuickInput:active{transform:none!important}}`);
  t.ok(pressAt > 0, "T-07 누르면 .97 로 줄어든다");
  t.ok(tabAt > pressAt, "T-07 하단 가운데 입력 탭은 위로 8px 솟은 자리를 지킨 채 줄어든다(같은 우선순위, 뒤에 옴)");
  t.ok(reduceAt > tabAt, "T-07 움직임 줄이기에서는 전환·누름 줄어듦을 모두 끈다(누름 규칙 뒤)");
  t.ok(shell.includes("@media(prefers-reduced-motion:reduce){body.abV22812Shell .abNavBottom a.abNavQuickInput{transform:none}}"), "T-07 움직임 줄이기에서는 가운데 탭이 처음부터 솟지 않으므로 눌러도 자리가 그대로다");
  t.ok(shell.includes("body.abV22812Shell #add :is(.chipRow button,.dateChip):active:not(:disabled){transform:scale(.97)!important}") && shell.includes("@media(prefers-reduced-motion:reduce){body.abV22812Shell #add :is(.chipRow button,.dateChip):active:not(:disabled){transform:none!important}}"),
    "T-07 칩은 홈 CSS 의 옛 transform:none 을 이기고 줄어들며, 움직임 줄이기에서는 끈다");
}));

// 200행 실사용 픽스처(validate-performance-v22811.mjs 와 같은 생성식): 홈 HTML 이 늘지 않았다.
await withClock("2026-07-15", () => fixture(async (fx) => {
  const categories = ["식비", "카페/간식", "교통/차량", "장보기", "주거/관리", "쇼핑", "의료/건강", "구독"];
  const payments = ["국민카드", "현대카드", "카카오페이", "현금", "계좌이체"];
  for (let index = 0; index < 200; index += 1) {
    const day = String((index % 28) + 1).padStart(2, "0");
    fx.db.transactions.push({ id: `budget-${index}`, household_id: HH, user_id: "user-bin", transaction_date: `2026-07-${day}`, type: index % 9 === 0 ? "income" : "expense", amount: 1000 + (index * 137) % 90000, category: categories[index % categories.length], memo: `실사용 기록 ${index} 항목`, payment_method: payments[index % payments.length], source: "web", created_at: `2026-07-${day}T09:00:00.000Z` });
  }
  const bytes = Buffer.byteLength(await homeHtml(fx));
  t.ok(bytes <= HOME_200_MAX, `200행 픽스처 홈 HTML 이 늘지 않았다 (${bytes} B, 상한 ${HOME_200_MAX})`);
}));

t.done();
