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
  ok(total <= 56, `가벼운 픽스처의 전체 정지점이 56개 이하다 (${total})`);
  ok(desktop <= 49, `가벼운 픽스처의 데스크톱 정지점이 49개 이하다 (${desktop})`);
  ok(mobile <= 42, `가벼운 픽스처의 모바일 정지점이 42개 이하다 (${mobile})`);

  // -------------------------------------------------------------------------
  // 실사용 부하에서 다시 잰다 — 여기가 진짜 천장이다
  // -------------------------------------------------------------------------
  // V22.8.99: 처음에는 기본 픽스처(기록 5건)로만 쟀다. 그런데 정지점이 가장 많아지는
  // 곳은 최근 내역이고, 그 목록은 기록이 많을수록 길어진다(행마다 수정 접기 하나).
  // 기록 5건짜리 화면을 재고 "42개"라고 못 박으면, 정작 사람들이 쓰는 화면은
  // 재지 않은 채로 남는다 — 세는 법을 고쳐 놓고 쉬운 경우만 잰 셈이었다.
  // 성능 예산과 같은 200행 부하에서 다시 재고, 그 값을 천장으로 삼는다.
  const heavy = await createV2265QaFixture();
  let heavyHtml = "";
  try {
    const categories = ["식비", "교통", "쇼핑"];
    const payments = ["국민카드", "현금"];
    for (let index = 0; index < 200; index += 1) {
      const day = String((index % 28) + 1).padStart(2, "0");
      heavy.db.transactions.push({
        id: `stop-${index}`, household_id: "house-home", user_id: "user-bin",
        transaction_date: `2026-07-${day}`, type: index % 9 === 0 ? "income" : "expense",
        amount: 1000 + (index * 137) % 90000, category: categories[index % 3],
        memo: `기록 ${index}`, payment_method: payments[index % 2], source: "web",
        created_at: `2026-07-${day}T09:00:00.000Z`,
      });
    }
    const heavyResponse = await app.fetch(new Request(`${ORIGIN}/app?month=2026-07&household_id=house-home`, { headers: { cookie: heavy.cookie, "user-agent": "Mozilla/5.0" } }), heavy.env, {});
    heavyHtml = await heavyResponse.text();
  } finally {
    heavy.restore();
  }
  const heavySlice = (start, end) => countTabStops(heavyHtml.slice(start, end)).length;
  const heavySidebar = heavySlice(heavyHtml.indexOf('<aside id="abDesktopSidebar"'), heavyHtml.indexOf("</aside>"));
  const heavyMobileTopStart = heavyHtml.indexOf('<div class="abNavMobileTop"');
  const heavyBottomStart = heavyHtml.indexOf('<nav class="abNavBottom"');
  const heavyMobileTop = heavySlice(heavyMobileTopStart, heavyBottomStart);
  const heavyBottom = heavySlice(heavyBottomStart, heavyHtml.indexOf("</nav>", heavyBottomStart));
  const heavyTotal = countTabStops(heavyHtml).length;
  const heavyDesktop = heavyTotal - heavyMobileTop - heavyBottom;
  const heavyMobile = heavyTotal - heavySidebar;

  // 부하가 걸린 쪽이 실제로 더 많아야 한다. 같거나 적으면 픽스처가 부하를 만들지
  // 못한 것이고, 그러면 이 절이 아무것도 지키지 못한다.
  ok(heavyTotal > total, `부하 픽스처가 실제로 더 많은 정지점을 만든다 (${total} → ${heavyTotal})`);
  ok(heavyTotal <= 62, `실사용 부하의 전체 정지점이 62개 이하다 (${heavyTotal})`);
  ok(heavyDesktop <= 55, `실사용 부하의 데스크톱 정지점이 55개 이하다 (${heavyDesktop})`);
  ok(heavyMobile <= 48, `실사용 부하의 모바일 정지점이 48개 이하다 (${heavyMobile})`);
  // 지시서의 출발점(모바일 54)보다는 부하가 걸린 쪽에서도 아래여야 한다.
  ok(heavyMobile < 54, `부하가 걸려도 모바일 정지점이 지시서 기준선 54보다 적다 (${heavyMobile})`);

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
  // V22.8.99: 경계를 '<section id="budget"' 로 잡고 있었는데 그 섹션은 후처리에서
  // 걷어내져 응답에 없다. indexOf 가 -1 을 돌려주면 slice 는 "끝에서 한 글자 앞"
  // 까지를 뜻하므로, 이 조각은 사실상 문서 나머지 전체였다 — includes 검사는 그래도
  // 통과했지만 정지점 하한은 아무것도 재지 못하고 있었다. 실제로 있는 경계로 바꾼다.
  const addStart = html.indexOf('<section id="add" class="panel">');
  const addEnd = html.indexOf('<section id="feed"');
  ok(addStart > 0 && addEnd > addStart, "빠른 입력 구간의 경계가 응답에 실제로 있다");
  const addPanel = html.slice(addStart, addEnd);
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
  // M2 블록 3 — 최근 7일 스트립은 정지점을 하나도 쓰지 않는다
  // -------------------------------------------------------------------------
  // 일곱 칸을 링크로 두면 그것만으로 정지점이 일곱 개 늘어난다. 달력에서 이미
  // 같은 실수를 했고(PR6), 그래서 이 블록은 정보 표시로만 만들었다.
  const now = new Date().toISOString().slice(0, 7);
  const thisMonth = await app.fetch(new Request(`${ORIGIN}/app?month=${now}&household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  const thisMonthHtml = await thisMonth.text();
  const stripStart = thisMonthHtml.indexOf('<ol class="homeWeek"');
  ok(stripStart > 0, "이번 달 홈에 7일 스트립이 있다");
  const strip = thisMonthHtml.slice(stripStart, thisMonthHtml.indexOf("</ol>", stripStart));
  eq(countTabStops(strip).length, 0, "스트립은 탭 정지점을 쓰지 않는다");
  eq((strip.match(/<li/g) || []).length, 7, "칸은 일곱 개다");
  eq((strip.match(/aria-current="date"/g) || []).length, 1, "오늘이 한 칸만 표시된다");
  // 지난 달에는 그리지 않는다 — "최근 7일"은 오늘 기준이라 지난 달에서는 뜻이 없다.
  const pastHtml = html;
  eq(pastHtml.includes('<ol class="homeWeek"'), false, "지난 달 화면에는 7일 스트립을 그리지 않는다");
  // 7.1 이 지시한 중복 제거가 되돌아가지 않았는지.
  eq(thisMonthHtml.includes('class="homeSpendHero"'), false, "'N월 지출' 카드가 다시 생기지 않았다");

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
