// V22.8.96 — 홈 탭 정지점을 **세는 법**과 그 수를 고정한다.
//
// 지시서 PR6 의 통과 조건은 "홈 탭 정지점 54 → 30 이하(달력은 1개)"였고, 지금까지
// 이 숫자는 아무도 재지 않았다. 재지 않는 목표는 지킬 수 없다. 그래서 세는 법부터
// 코드로 고정한다.
//
// 세는 법이 이 파일의 절반이다. 흔한 오답 셋:
//   1) 닫힌 <details> 안의 요소를 센다 — 접어 둔 것은 탭 순서에 들어가지 않는다.
//      이걸 무시하면 실제 56 인 화면이 104 로 나온다(실제로 그렇게 나왔다).
//   2) type="hidden" 인풋과 disabled·tabindex="-1" 을 센다 — 전부 정지점이 아니다.
//   3) 한 HTML 을 그대로 센다 — /app 은 데스크톱과 모바일에 **바이트 동일한 HTML**
//      을 보내고, 어느 내비가 살아 있는지는 CSS 가 정한다. 그래서 총합이 아니라
//      화면 폭별로 따로 세야 뜻이 있다. 지시서의 "54"는 모바일 기준 숫자다.
//
// 그리고 이 파일은 **양쪽을 다 지킨다.** 정지점을 줄이라는 요구와, M4 가 1단에
// 두라고 정한 입력 요소들은 서로 반대 방향으로 당긴다. 숫자를 맞추려고 빠른 입력을
// 접어 버리는 "개선"이 들어오면 여기서 실패한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

function countTabStops(html) {
  const tokens = [...html.matchAll(/<(\/?)(details|summary|a|button|input|select|textarea)((?:\s[^>]*)?)>/g)];
  let depth = 0;      // 열린 <details> 중첩 깊이
  let closedAt = -1;  // 닫힌 <details> 가 시작된 깊이 (-1 이면 열린 곳에 있다)
  const stops = [];
  for (const match of tokens) {
    const [, slash, tag, attrs = ""] = match;
    if (tag === "details") {
      if (slash) { depth -= 1; if (closedAt > depth) closedAt = -1; continue; }
      depth += 1;
      if (closedAt === -1 && !/\sopen(\s|=|$)/.test(attrs)) closedAt = depth;
      continue;
    }
    if (slash) continue;
    // 닫힌 details 안에서는 그 details 의 summary 하나만 정지점이다.
    if (closedAt !== -1 && !(tag === "summary" && depth === closedAt)) continue;
    if (/\stabindex="-1"/.test(attrs)) continue;
    if (/\sdisabled(\s|=|>|$)/.test(attrs)) continue;
    if (tag === "a" && !/\shref=/.test(attrs)) continue;
    if (tag === "input" && /type="hidden"/.test(attrs)) continue;
    stops.push({ tag, attrs });
  }
  return stops;
}

// ---------------------------------------------------------------------------
// 세는 법이 결함을 잡는지 먼저 확인한다(11장: "검사가 결함을 잡는지 먼저 확인한 뒤
// 신뢰합니다"). 이 자체 점검이 없으면 counter 가 조용히 0을 세도 알 수 없다.
// ---------------------------------------------------------------------------
eq(countTabStops('<a href="/x">x</a>').length, 1, "링크를 센다");
eq(countTabStops("<a>앵커 아님</a>").length, 0, "href 없는 <a> 는 세지 않는다");
eq(countTabStops('<input type="hidden" name="x"/>').length, 0, "히든 인풋은 세지 않는다");
eq(countTabStops('<button disabled>x</button>').length, 0, "비활성 버튼은 세지 않는다");
eq(countTabStops('<a href="/x" tabindex="-1">x</a>').length, 0, "tabindex=-1 은 세지 않는다");
eq(countTabStops('<details><summary>s</summary><a href="/a">a</a><a href="/b">b</a></details>').length, 1, "닫힌 접기 안은 summary 하나만 센다");
eq(countTabStops('<details open><summary>s</summary><a href="/a">a</a><a href="/b">b</a></details>').length, 3, "열린 접기 안은 전부 센다");
eq(countTabStops('<details><summary>s</summary><details open><summary>t</summary><a href="/a">a</a></details></details>').length, 1, "닫힌 접기 안의 열린 접기도 세지 않는다");
eq(countTabStops('<details open><summary>s</summary><details><summary>t</summary><a href="/a">a</a></details></details>').length, 2, "열린 접기 안의 닫힌 접기는 summary 만 센다");

const fixture = await createV2265QaFixture();
try {
  const response = await app.fetch(new Request(`${ORIGIN}/app?month=2026-07&household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(response.status, 200, "홈이 렌더된다");
  const html = await response.text();

  // 화면 폭별로 살아 있는 내비가 다르다. 숨은 쪽은 탭 순서에서도 빠진다.
  const slice = (start, end) => countTabStops(html.slice(start, end)).length;
  const sidebar = slice(html.indexOf('<aside id="abDesktopSidebar"'), html.indexOf("</aside>"));
  const mobileTopStart = html.indexOf('<div class="abNavMobileTop"');
  const bottomStart = html.indexOf('<nav class="abNavBottom"');
  const mobileTop = slice(mobileTopStart, bottomStart);
  const bottomNav = slice(bottomStart, html.indexOf("</nav>", bottomStart));
  const total = countTabStops(html).length;
  const desktop = total - mobileTop - bottomNav;
  const mobile = total - sidebar;

  ok(sidebar > 0 && mobileTop > 0 && bottomNav > 0, `양쪽 내비가 모두 HTML 에 있다 (사이드바 ${sidebar} · 상단 ${mobileTop} · 하단 ${bottomNav})`);

  // 지금 값을 천장으로 고정한다. 늘어나면 실패한다 — 이 숫자가 조용히 되돌아가는
  // 것을 막는 것이 이 검사의 목적이다.
  ok(total <= 56, `홈 HTML 전체 정지점이 56개 이하다 (${total})`);
  ok(desktop <= 49, `데스크톱 정지점이 49개 이하다 (${desktop})`);
  ok(mobile <= 42, `모바일 정지점이 42개 이하다 (${mobile})`);
  // 지시서의 출발점(모바일 54)보다는 확실히 아래여야 한다.
  ok(mobile < 54, `모바일 정지점이 지시서 기준선 54보다 적다 (${mobile})`);

  // -------------------------------------------------------------------------
  // 줄인 방법 — 3장 P3 "진입점은 접기 영역에 모음"
  // -------------------------------------------------------------------------
  ok(html.includes('<details class="homeQuickFold"><summary><b>바로가기</b>'), "바로가기는 접기 한 곳에 모인다");
  eq(/<details class="homeQuickFold" open/.test(html), false, "바로가기는 접힌 채로 시작한다");
  ok(html.includes('<details class="homeFeedFilter"'), "최근 내역의 찾기·거르기도 접힌다");
  // 접는 것은 숨기는 것이 아니다 — 열면 그대로 다 있어야 한다.
  const fold = html.slice(html.indexOf('<details class="homeQuickFold"'), html.indexOf("</details>", html.indexOf('<details class="homeQuickFold"')));
  const inside = [...fold.matchAll(/<a [^>]*href=/g)].length;
  ok(inside >= 6, `접기 안에 바로가기가 그대로 있다 (${inside}곳)`);
  // 조건이 걸려 있으면 필터는 스스로 펼쳐진다(걸어 둔 것을 숨기면 안 된다).
  const filtered = await app.fetch(new Request(`${ORIGIN}/app?month=2026-07&household_id=house-home&q=커피`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  const filteredHtml = await filtered.text();
  ok(filteredHtml.includes('<details class="homeFeedFilter" open>'), "필터가 걸려 있으면 접기가 펼쳐진 채로 온다");
  ok(filteredHtml.includes("적용 중"), "접힌 머리말이 필터가 걸렸다고 말한다");

  // -------------------------------------------------------------------------
  // 줄이지 **않는** 것 — M4 가 1단에 두라고 정한 것들
  // -------------------------------------------------------------------------
  // 숫자를 맞추려고 빠른 입력을 접으면 M4 위반이다. 1단은 항상 보여야 한다.
  const addPanel = html.slice(html.indexOf('<section id="add" class="panel">'), html.indexOf('<section id="budget"'));
  eq(/<details class="[^"]*"[^>]*>\s*<summary>[^<]*<\/summary>\s*<div class="smartLine"/.test(addPanel), false, "한 줄 입력을 접지 않는다");
  for (const [label, marker] of [
    ["한 줄 입력", 'id="smartInput"'],
    ["지출/수입", 'name="type" value="expense"'],
    ["금액", 'id="amountInput"'],
    ["내용", 'id="memoInput"'],
    ["분류 제안 칩", 'id="freqChips"'],
    ["자세히 접기", 'id="quickMore"'],
    ["저장", "기록 저장"],
  ]) {
    ok(addPanel.includes(marker), `M4 1단의 ${label} 이 그대로 보인다`);
  }
  // 1단이 실제로 접히지 않은 곳에 있는지 — 정지점으로 세어 확인한다.
  const addStops = countTabStops(addPanel).length;
  ok(addStops >= 10, `빠른 입력 1단이 정지점으로 살아 있다 (${addStops})`);

  // -------------------------------------------------------------------------
  // 달력은 정지점 하나 — PR6 이 정한 규칙이 되돌아가지 않았는지
  // -------------------------------------------------------------------------
  ok(source.includes('role="grid"'), "달력은 격자 하나다");
  ok(source.includes("function bindCalendarRoving("), "격자 안은 방향키로 옮긴다");
  ok(source.includes('tabindex="\' + (day === focusDay ? "0" : "-1") + \'"'), "격자 안 날짜는 하나만 정지점이다");

  // -------------------------------------------------------------------------
  // 도달성 — 접었다고 갈 수 없게 되면 안 된다
  // -------------------------------------------------------------------------
  ok(html.includes('class="abSkipLink" href="#abMainContent"'), "본문 바로가기가 남아 있다");
  for (const href of ["/budgets?", "/reserve-plans?", "/smart-tools?", "/menu?"]) {
    ok(html.includes(href), `접기 안의 ${href} 로 가는 길이 HTML 에 있다`);
  }
} finally {
  fixture.restore();
}

console.log(`V22.8.96 홈 탭 정지점 검사 통과 (${checks} checks)`);
