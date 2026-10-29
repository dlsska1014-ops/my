// V22.9.40 (C) — 체감 성능과 최신 UI 다듬기.
//
// ── 이 검사가 지키는 것 ──
// C1 리포트 기간 내비게이터
//   · 기존 핀(마크업·aria-label·aria-current·호출 서명·모바일 격자)은 그대로이고, JS 없이도 월 입력 + 이동 폼이 동작한다.
//   · JS 가 있으면 "2026년 7월" 단추가 브라우저 월 선택기(showPicker)를 연다. 못 열면 원래 입력칸으로 돌아가 초점을 주고,
//     month 입력을 모르는 브라우저에서는 아무것도 바꾸지 않는다. "이동"은 다른 달을 고른 뒤에만 보인다.
//   · 모든 조작 요소 44px(다른 달일 때의 '이번 달' 링크 포함), 리포트 인라인 CSS 순증 1 KiB 이하·화면 24 KiB 상한.
// C2 셸 CSS 의 점진적 최신 규칙
//   · 셸 CSS 끝의 한 블록만 더했고, 모르는 브라우저에서 아무것도 바뀌지 않게 @supports 안이거나 무시되는 속성만 쓴다.
//   · 제목은 text-wrap-style(긴 이름)만 쓴다 — 줄임 이름 text-wrap 은 nowrap 제목(.topLine h1 말줄임)을 이긴다.
//   · 등장 전환은 움직임 줄이기가 아닐 때만, 눈금(var(--ab12-dur…))으로만 움직인다. 주소는 v22940, 옛 v22937 은 은퇴.
// C3 Early Hints 재료(Link preload 머리)
//   · 셸을 링크한 화면의 200 응답에만 붙고, 값은 그 화면이 링크한 자산 주소와 글자까지 같다. HTML 바이트는 그대로다.
//   · 공개 화면(자체 인라인 CSS)·/skill·API·없는 주소에는 붙지 않는다.
// C4 홈의 Speculation-Rules 머리
//   · 홈은 인라인 규칙(242 B) 대신 같은 규칙 파일을 머리로 받는다. 다른 화면은 인라인 그대로(로그인 화면 데이터 블록 보존).
//   · 규칙은 prerender·conservative 그대로다 — prefetch·moderate·eager 를 더하지 않았다(V22.9.7 무료 한도 조건).

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, { renderReportMonthNavigator } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const ORIGIN = "https://malhaebook.com";
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const shellModule = readFileSync(new URL("../src/modules/assets/accountbook-shell-css.js", import.meta.url), "utf8");
const previousClock = globalThis.__AB_QA_FIXED_NOW_MS;
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-15T12:00:00+09:00");

const SHELL_CSS = "/assets/accountbook-shell-v22986.css";
const RETIRED_SHELL_CSS = "/assets/accountbook-shell-v22937.css";
const RULES_FILE = "/assets/speculation-rules-v22940.json";
const inlineCssBytes = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)].reduce((sum, m) => sum + Buffer.byteLength(m[1]), 0);
const countOf = (text, needle) => text.split(needle).length - 1;

// ---------------------------------------------------------------------------
// C1-1) 마크업 핀은 그대로이고, 내비게이터 바로 뒤에 단추 런타임이 붙는다
// ---------------------------------------------------------------------------
const navCurrent = renderReportMonthNavigator({ path: "/reports", month: "2026-07", householdId: "hh", extra: { range: "week" } });
const navOther = renderReportMonthNavigator({ path: "/reports", month: "2026-06", householdId: "hh", extra: { range: "week" } });
ok(navCurrent.startsWith('<nav class="reportMonthNav" aria-label="리포트 기준 월 이동">'), "내비게이터 클래스와 접근 이름이 그대로다");
ok(navCurrent.includes('aria-label="이전 달 2026-06로 이동">‹ <span>이전 달</span></a>'), "U10 이전 달 화살표 이름이 그대로다");
ok(navCurrent.includes('aria-label="다음 달 2026-08로 이동"><span>다음 달</span> ›</a>'), "U10 다음 달 화살표 이름이 그대로다");
ok(navCurrent.includes('<span class="reportMonthCurrent" aria-current="date">이번 달</span>'), "이번 달이면 aria-current 표식이다");
ok(navOther.includes('<a class="reportMonthCurrent" href="/reports?month=2026-07&amp;household_id=hh&amp;range=week">이번 달</a>'), "다른 달이면 주간 보기를 유지한 '이번 달' 링크다");
ok(navCurrent.includes('<input type="month" name="month" value="2026-07" aria-label="리포트 기준 월"/>') && navCurrent.includes('<button type="submit">이동</button>'), "JS 없이도 월 입력 + 이동 폼이 그대로 있다");
ok(navCurrent.includes('<input type="hidden" name="range" value="week"/>') && navCurrent.includes('<input type="hidden" name="household_id" value="hh"/>'), "숨은 입력(extra·가계부)이 그대로 실린다");
ok(source.includes('renderReportMonthNavigator({ path: "/reports", month, householdId: selected.id, extra: range === "week" ? { range: "week" } : {} })'), "/reports 호출 서명이 그대로다");
ok(navCurrent.includes('</nav><script>(function reportMonthPickerClientMain() {') && navCurrent.endsWith("})();</script>"), "단추 런타임이 내비게이터 바로 뒤에서 자기 내비게이터를 찾는다");
ok(!/<button[^>]*reportMonthPick/.test(navCurrent), "기준 월 단추는 JS 가 만든다(JS 없는 화면에 죽은 단추가 없다)");

// ---------------------------------------------------------------------------
// C1-2) 단추 런타임의 동작 — 가짜 DOM 으로 실제 직렬화된 함수를 돌린다
// ---------------------------------------------------------------------------
const runtime = navCurrent.match(/<\/nav><script>([\s\S]*?)<\/script>$/)[1];
function exercise({ type = "month", value = "2026-07", picker = "ok" } = {}) {
  const calls = { showPicker: 0, focus: 0, created: 0 };
  const classes = new Set(["reportMonthNav"]);
  const withAttributes = (object) => {
    object.attributes = new Map();
    object.setAttribute = (name, v) => object.attributes.set(name, String(v));
    object.removeAttribute = (name) => { object.attributes.delete(name); if (name === "tabindex") delete object.tabIndex; };
    return object;
  };
  const listeners = {};
  const label = withAttributes({ inserted: [], before(node) { this.inserted.push(node); node.connected = true; } });
  const input = withAttributes({
    type, value,
    closest: (selector) => (selector === "label" ? label : null),
    addEventListener: (name, fn) => { (listeners[name] ||= []).push(fn); },
    focus() { calls.focus += 1; },
  });
  if (picker === "ok") input.showPicker = () => { calls.showPicker += 1; };
  if (picker === "throws") input.showPicker = () => { calls.showPicker += 1; throw new Error("NotAllowedError"); };
  const nav = {
    classList: {
      add: (name) => classes.add(name), remove: (name) => classes.delete(name), contains: (name) => classes.has(name),
      toggle: (name, force) => { if (force ?? !classes.has(name)) classes.add(name); else classes.delete(name); },
    },
    querySelector: (selector) => (selector === 'input[type="month"]' ? input : null),
  };
  let pick = null;
  const documentStub = {
    currentScript: { previousElementSibling: nav },
    createElement(tag) {
      calls.created += 1;
      pick = withAttributes({ tag, connected: false, textContent: "", handlers: {}, addEventListener(name, fn) { this.handlers[name] = fn; }, remove() { this.connected = false; } });
      return pick;
    },
  };
  new Function("document", runtime)(documentStub);
  const fire = (name) => (listeners[name] || []).forEach((fn) => fn({ target: input }));
  return { calls, classes, label, input, pick, fire };
}
{
  const t = exercise();
  eq(t.calls.created, 1, "month 입력을 아는 브라우저에서 기준 월 단추를 하나 만든다");
  ok(t.label.inserted[0] === t.pick && t.pick.connected, "단추는 월 입력 라벨 바로 앞(같은 폼 칸)에 들어간다");
  ok(t.pick.type === "button" && t.pick.className === "reportMonthPick", "폼을 제출하지 않는 type=button 단추다");
  eq(t.pick.textContent, "2026년 7월", "기준 월이 한국어로 보인다");
  eq(t.pick.attributes.get("aria-label"), "기준 월 2026년 7월, 다른 달 고르기", "단추 이름에 보이는 글자가 들어 있다(이름 속 라벨)");
  ok(t.classes.has("abPick") && !t.classes.has("isMonthChanged"), "단추 모드에서 처음에는 이동 단추를 감춘다(바꾼 달이 없다)");
  ok(t.input.tabIndex === -1 && t.label.attributes.get("aria-hidden") === "true", "투명하게 남은 월 입력은 탭 순서와 보조기기 트리에서 빠진다");
  eq(t.input.autocomplete, "off", "뒤로 가기 때 고른 값만 되살아나 단추 글자와 어긋나지 않는다");
  t.pick.handlers.click();
  ok(t.calls.showPicker === 1 && t.pick.connected && t.classes.has("abPick") && t.calls.focus === 0, "단추를 누르면 브라우저 월 선택기를 연다");
  t.input.value = "2026-09";
  t.fire("change");
  eq(t.pick.textContent, "2026년 9월", "고른 달이 단추 글자에 바로 보인다");
  ok(t.classes.has("isMonthChanged"), "다른 달을 고르면 이동 단추가 나타난다(바로 이동하지 않는다)");
  eq(t.pick.attributes.get("aria-label"), "기준 월 2026년 9월, 이동 단추를 눌러 적용", "보조기기에도 다음 행동을 알린다");
  t.input.value = "2026-07";
  t.fire("input");
  ok(!t.classes.has("isMonthChanged") && t.pick.textContent === "2026년 7월", "원래 달로 되돌리면 이동 단추가 다시 숨는다");
  t.input.value = "2026-10";
  t.fire("input");
  eq(t.pick.textContent, "2026년 10월", "두 자리 달도 그대로 읽는다");
}
for (const picker of ["throws", "missing"]) {
  const t = exercise({ picker });
  t.pick.handlers.click();
  ok(!t.pick.connected && !t.classes.has("abPick"), `${picker}: 선택기를 못 열면 단추를 걷고 원래 월 입력을 되돌린다`);
  ok(!t.label.attributes.has("aria-hidden") && t.input.tabIndex === undefined && t.calls.focus === 1, `${picker}: 되돌린 월 입력이 다시 보조기기·탭 순서에 들어오고 초점을 받는다`);
}
{
  const t = exercise({ type: "text" });
  ok(t.calls.created === 0 && !t.classes.has("abPick") && !t.label.inserted.length, "month 입력을 모르는 브라우저(type=text)에서는 아무것도 바꾸지 않는다");
}

// ---------------------------------------------------------------------------
// C1-3) 리포트 CSS — 44px·토큰·바이트 예산
// ---------------------------------------------------------------------------
const uxStart = source.indexOf("function reportUxCss() {\n  return `");
const uxBody = source.slice(source.indexOf("`", uxStart) + 1, source.indexOf("`;\n}", uxStart));
ok(uxStart > 0 && !uxBody.includes("${"), "reportUxCss 는 고정 CSS 문자열이다");
const REPORT_UX_CSS_BASELINE = 12116; // V22.9.39 (a93db22) 의 reportUxCss() 바이트
const uxBytes = Buffer.byteLength(uxBody);
ok(uxBytes - REPORT_UX_CSS_BASELINE <= 1024, `C1 의 리포트 CSS 순증이 1 KiB 이하다 (${uxBytes - REPORT_UX_CSS_BASELINE} B)`);
ok(uxBody.includes(".reportMonthNav.abPick label{grid-area:1/1;opacity:0;pointer-events:none}"), "투명한 월 입력이 단추와 같은 칸에 남아 선택기 위치를 잡는다");
ok(uxBody.includes(".reportMonthNav.abPick .reportMonthPick{grid-area:1/1;") && uxBody.includes("color:var(--ab12-text,#191f28)!important;font-size:16px}"), "기준 월 단추 글자색이 리포트의 button{color:#fff!important} 를 이긴다");
ok(uxBody.includes(".reportMonthNav.abPick:not(.isMonthChanged) button[type=submit]{display:none}"), "바꾼 달이 없으면 이동 단추가 감춰진다");
ok(uxBody.includes(".reportMonthNav form{display:grid;grid-template-columns:minmax(0,1fr);grid-auto-flow:column;gap:7px}"), "이동 단추가 없을 때 빈 칸 간격이 남지 않는다(암묵 열)");
const mobileAt = uxBody.indexOf("@media(max-width:899px){");
const pinned36 = uxBody.indexOf(".reportMonthNav>a.reportMonthCurrent{grid-column:1/-1;grid-row:2;min-height:36px}", mobileAt);
const override44 = uxBody.indexOf(".reportMonthNav>a.reportMonthCurrent{justify-self:center;min-height:44px;padding:0 20px}", mobileAt);
ok(mobileAt > 0 && pinned36 > mobileAt && override44 > pinned36 && override44 < uxBody.indexOf("}}", mobileAt) + 2, "모바일 '이번 달' 링크는 고정된 둘째 줄 규칙 뒤에서 44px 로 덮인다");
ok(uxBody.includes(".reportMonthNav input{min-width:0;width:100%;min-height:44px;"), "JS 없는 월 입력도 44px 이다");
ok(!uxBody.includes(".reportMonthNav label{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:8px;min-height:44px;border:"), "월 입력의 이중 테두리(라벨 테두리)가 사라졌다");
const addedNavRules = uxBody.split("}").filter((rule) => /abPick|reportMonthPick|span\.reportMonthCurrent/.test(rule));
ok(addedNavRules.length >= 5 && addedNavRules.every((rule) => !/(?<![,(])#[0-9a-f]{3,8}\b/i.test(rule)), "새 내비게이터 규칙의 색은 모두 var(--ab12-…, 대체값) 토큰이다");

// ---------------------------------------------------------------------------
// C2) 셸 CSS 끝의 점진적 최신 규칙
// ---------------------------------------------------------------------------
const MARKER = "/* ── V22.9.40 (C) 점진적 최신 규칙 ──";
eq(countOf(shellModule, MARKER), 1, "셸 CSS 모듈에 패키지 C 블록이 하나다");
const blockAt = shellModule.indexOf(MARKER);
const blockEnd = shellModule.indexOf("`;\n// @build:exports-start");
ok(blockAt > shellModule.lastIndexOf("@media(max-width:480px){") && blockEnd > blockAt && blockEnd === shellModule.lastIndexOf("`;\n// @build:exports-start"), "블록은 셸 CSS 의 맨 끝에만 있다(다른 패키지의 수정과 겹치지 않는다)");
const block = shellModule.slice(blockAt, blockEnd);
ok(!block.includes("${") && !block.includes("\\"), "블록에 템플릿 치환·백슬래시가 없다");
ok(block.includes("html{scrollbar-gutter:stable}"), "스크롤 막대 자리를 늘 잡아 열고 닫을 때 화면이 옆으로 밀리지 않는다");
ok(block.includes("body.abV22812Shell :is(h1,h2,h3){text-wrap-style:balance}"), "제목은 줄 길이를 고르게 나눈다");
ok(block.includes("body.abV22812Shell p{text-wrap-style:pretty}"), "본문 문단은 마지막 줄에 한 낱말만 남기지 않는다");
ok(block.includes("@supports (field-sizing:content){body.abV22812Shell textarea:is(.share,[readonly]){field-sizing:content;max-height:min(60vh,560px)}}"), "공유 문구 글상자는 내용 높이를 따르되 최대 높이가 있다(@supports 안)");
ok(block.includes("body.abV22812Shell :is(.abGlobalDialog,.abV5SearchResults,.abV5NotifList,.abDayDetailBody,.abTransactionRail){overscroll-behavior:contain}"), "창·시트·목록의 스크롤이 뒤 화면으로 번지지 않는다");
const css = block.replace(/\/\*[\s\S]*?\*\//g, "");
const reducedAt = css.indexOf("@media(prefers-reduced-motion:no-preference){");
const discreteAt = css.indexOf("@supports (transition-behavior:allow-discrete){", reducedAt);
const startingAt = css.indexOf("@starting-style{", discreteAt);
const overlayAt = css.indexOf("@supports (overlay:auto){", reducedAt);
ok(reducedAt > 0 && discreteAt > reducedAt && startingAt > discreteAt && overlayAt > startingAt, "등장(@starting-style)·닫힘(overlay) 전환은 움직임 줄이기가 아닐 때 + 지원 확인(@supports) 안에만 있다");
ok(css.includes("transition-behavior:allow-discrete") && css.includes("transition-property:opacity,translate,overlay,display"), "display·overlay 를 끊지 않고 닫힘까지 이어 움직인다");
const transitions = [...css.matchAll(/transition:([^;}]*)/g)].map((m) => m[1]);
ok(transitions.length >= 2 && transitions.every((t) => t.includes("var(--ab12-dur)") && t.includes("var(--ab12-ease)") && !/\d+\s*m?s\b/.test(t)), "전환 속도는 눈금 토큰만 쓴다(리터럴 없음)");
ok(transitions.every((t, i) => css.indexOf(`transition:${t}`) > reducedAt), "모든 전환 선언이 움직임 줄이기 아님 조건 안에 있다");
ok([...css.matchAll(/:is\(dialog[^{]*\{/g)].every((m) => m[0].includes(":not(.abTxDetail)")), "자기 등장 애니메이션이 있는 거래 상세 창은 빠진다");
// 지원하지 않는 브라우저: @supports·@media 밖의 맨 위 규칙은 모르면 통째로 무시되는 속성만 쓴다.
let top = css;
for (let guard = 0; /@(supports|media)[^{]*\{/.test(top) && guard < 20; guard += 1) {
  const at = top.search(/@(supports|media)[^{]*\{/);
  let depth = 0, end = top.indexOf("{", at);
  for (; end < top.length; end += 1) { if (top[end] === "{") depth += 1; else if (top[end] === "}") { depth -= 1; if (!depth) break; } }
  top = top.slice(0, at) + top.slice(end + 1);
}
const topProps = [...top.matchAll(/\{([^{}]*)\}/g)].flatMap((m) => m[1].split(";").map((d) => d.split(":")[0].trim()).filter(Boolean));
ok(topProps.length >= 4 && topProps.every((p) => ["scrollbar-gutter", "text-wrap-style", "overscroll-behavior"].includes(p)), `@supports 밖에서는 모르면 무시되는 속성만 쓴다 (${[...new Set(topProps)].join(", ")})`);
const fixture = await createV2265QaFixture();
try {
  const asset = await app.fetch(new Request(`${ORIGIN}${SHELL_CSS}`), fixture.env, {});
  const shellCss = await asset.text();
  eq(asset.status, 200, "새 셸 주소(v22940)가 내려온다");
  ok(String(asset.headers.get("content-type")).startsWith("text/css") && String(asset.headers.get("cache-control")).includes("immutable"), "셸은 1년 불변 CSS 다");
  eq(countOf(shellCss, MARKER), 1, "내려가는 셸 CSS 에 블록이 한 번 들어 있다");
  ok(!/text-wrap\s*:/.test(shellCss), "셸 어디에도 줄임 이름 text-wrap 이 없다(nowrap 제목 보호)");
  ok(shellCss.includes("@media(prefers-reduced-motion:reduce){\n  body.abV22812Shell *,body.abV22812Shell *::before,body.abV22812Shell *::after{transition-duration:1ms!important;animation-duration:1ms!important}"), "기존 움직임 줄이기 전역 규칙도 그대로 있다");
  ok(source.includes(`const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "${SHELL_CSS}"`), "셸 주소 상수가 v22940 이다");
  eq((await app.fetch(new Request(`${ORIGIN}${RETIRED_SHELL_CSS}`), fixture.env, {})).status, 404, "옛 셸 주소(v22937)는 V22.9.37 의 CSS 관례대로 은퇴했다");

  // -------------------------------------------------------------------------
  // C1-4·C3·C4) 화면 — 인라인 CSS 상한, Link preload, Speculation-Rules
  // -------------------------------------------------------------------------
  const open = async (path, { signedIn = true } = {}) => {
    const response = await app.fetch(new Request(`${ORIGIN}${path}`, { headers: { ...(signedIn ? { cookie: fixture.cookie } : {}), accept: "text/html", "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, { waitUntil() {} });
    return { status: response.status, html: await response.text(), link: response.headers.get("link"), rules: response.headers.get("speculation-rules") };
  };
  const H = "household_id=house-home";
  for (const path of [`/reports?month=2026-07&${H}`, `/my/analysis?month=2026-07&${H}`, `/my/analysis?month=2026-07&${H}&view=report`]) {
    const page = await open(path);
    eq(page.status, 200, `${path} 가 열린다`);
    ok(inlineCssBytes(page.html) <= 24 * 1024, `${path} 인라인 CSS 가 24 KiB 이하다 (${inlineCssBytes(page.html)} B)`);
    eq(countOf(page.html, 'class="reportMonthNav"'), 1, `${path} 에 내비게이터가 하나다`);
    ok(page.html.includes("</nav><script>(function reportMonthPickerClientMain() {"), `${path} 에 기준 월 단추 런타임이 붙는다`);
  }

  const expectedLink = (html) => {
    const cssPath = (html.match(/<link rel="stylesheet" href="(\/assets\/accountbook-shell-v\d+\.css)"\/>/) || [])[1];
    const navPath = (html.match(/<script id="v22818Stage4NavRuntime" src="(\/assets\/accountbook-nav-v\d+\.js)" defer><\/script>/) || [])[1];
    return [cssPath && `<${cssPath}>; rel=preload; as=style`, navPath && `<${navPath}>; rel=preload; as=script`].filter(Boolean).join(", ");
  };
  for (const [name, path, signedIn] of [["홈", `/app?${H}`, true], ["생활비 리포트", `/reports?month=2026-07&${H}`, true], ["전체 메뉴", `/menu?${H}`, true], ["로그인", "/my", false]]) {
    const page = await open(path, { signedIn });
    eq(page.status, 200, `${name} 화면이 열린다`);
    const expected = expectedLink(page.html);
    ok(expected.includes(SHELL_CSS) && expected.includes("/assets/accountbook-nav-"), `${name} 화면은 셸 CSS 와 내비 JS 를 링크한다`);
    eq(page.link, expected, `${name} 화면의 Link 머리가 그 화면이 링크한 자산과 글자까지 같다`);
    eq(countOf(page.html, `href="${SHELL_CSS}"`), 1, `${name} 화면이 셸을 한 번만 링크한다(머리만 더하고 HTML 은 그대로)`);
    ok(!/rel=["']?preload/i.test(page.html), `${name} 화면 HTML 에 preload 태그를 더하지 않았다`);
  }
  for (const [name, path, signedIn] of [["공개 첫 화면", "/", false], ["공개 가이드", "/budget-guide", false], ["개인정보 처리방침", "/privacy", false], ["카카오 스킬(GET)", "/skill", false], ["API", "/api/me", true], ["없는 주소", "/no-such-page-v22940", true], ["없는 가계부의 메뉴(404 HTML)", "/menu?household_id=house-nope", true]]) {
    const page = await open(path, { signedIn });
    eq(page.link, null, `${name}(${page.status})에는 Link 머리가 없다`);
    eq(page.rules, null, `${name}에는 Speculation-Rules 머리가 없다`);
  }
  ok(source.includes("function shellResponseHints(html = \"\", status = 200) {\n  if (status !== 200) return {};"), "Link·규칙 머리는 200 응답에만 붙는다");

  const home = await open(`/app?${H}`);
  ok(!home.html.includes('type="speculationrules"'), "홈 HTML 에 인라인 규칙이 없다(242 B 절약)");
  eq(home.rules, `"${RULES_FILE}"`, "홈은 같은 규칙 파일을 Speculation-Rules 머리로 받는다");
  ok(Buffer.byteLength(home.html) < 35 * 1024, `홈 HTML 이 35 KiB 예산 안이다 (${Buffer.byteLength(home.html)} B)`);
  const rulesResponse = await app.fetch(new Request(`${ORIGIN}${RULES_FILE}`), fixture.env, {});
  const rulesText = await rulesResponse.text();
  eq(rulesResponse.status, 200, "규칙 파일이 내려온다");
  eq(rulesResponse.headers.get("content-type"), "application/speculationrules+json", "규칙 파일 MIME 이 speculationrules+json 이다(아니면 브라우저가 버린다)");
  ok(String(rulesResponse.headers.get("cache-control")).includes("immutable") && String(rulesResponse.headers.get("etag")).includes("v22940"), "규칙 파일은 판이 붙은 1년 불변 주소다");
  const reports = await open(`/reports?month=2026-07&${H}`);
  const login = await open("/my", { signedIn: false });
  const inlineRules = (html) => (html.match(/<script type="speculationrules">([\s\S]*?)<\/script>/) || [])[1];
  eq(inlineRules(reports.html), rulesText, "다른 화면의 인라인 규칙과 머리 파일이 글자까지 같다");
  ok(inlineRules(login.html) && login.rules === null, "로그인 화면은 인라인 규칙(데이터 블록)을 그대로 둔다");
  const rules = JSON.parse(rulesText);
  eq(Object.keys(rules).join(","), "prerender", "규칙은 prerender 하나뿐이다(prefetch 를 더하지 않았다)");
  eq(rules.prerender.map((r) => r.eagerness).join(","), "conservative", "누른 뒤에만 움직인다(moderate·eager 없음)");
} finally {
  fixture.restore();
  globalThis.__AB_QA_FIXED_NOW_MS = previousClock;
}

console.log(`V22.9.40 (C) 체감 성능·최신 UI 검사 통과 (${checks} checks)`);
