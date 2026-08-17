// V22.8.90 — 통합 작업지시서 4.2(좌측 내비게이션) 검사.
//
// PR6 의 통과 조건은 "홈 탭 정지점 54 → 30 이하(달력은 1개)"다. 이 검사는 그중
// 달력과 예산 위젯 몫을 확인한다. 나머지는 4.3·4.4(PR7)의 본문 재배치 몫이다.
//
// 중요한 점: 이 화면의 탭 정지점은 서버 HTML 만 세면 크게 어긋난다. 사이드바 달력은
// 서버가 빈 <section> 만 보내고 클라이언트가 날짜 칸을 만든다 — 그래서 서버 HTML 에는
// 0개로 보이지만 실제 화면에서는 하루에 하나씩 앵커가 생겨 서른 개를 넘긴다.
// 그것이 지시서가 "42칸을 각각 링크로 두면 정지점이 42개가 된다"고 적은 상황이고,
// 실제로 그렇게 되어 있었다. 그래서 여기서는 배달되는 런타임 코드를 직접 본다.

import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
function ok(value, label) {
  if (!value) throw new Error(`FAIL: ${label}`);
  checks += 1;
}
function eq(actual, expected, label) {
  if (actual !== expected) throw new Error(`FAIL: ${label} (expected ${expected}, got ${actual})`);
  checks += 1;
}

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const fixture = await createV2265QaFixture();

try {
  const get = async (path, cookie = fixture.cookie) => {
    const headers = { "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120" };
    if (cookie) headers.cookie = cookie;
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
    return { response, text: await response.text() };
  };

  const home = await get("/app?month=2026-07&household_id=house-home");
  eq(home.response.status, 200, "데스크톱 홈이 렌더된다");
  const runtime = await get("/assets/accountbook-v5-v22890.js", "");
  eq(runtime.response.status, 200, "사이드바 런타임이 서빙된다");

  // 1. 달력은 격자다. 칸마다 링크를 두는 대신 격자 하나가 정지점을 갖는다.
  ok(runtime.text.includes('role="grid"'), "달력이 격자 의미를 갖는다");
  ok(runtime.text.includes('role="gridcell"'), "날짜 칸이 격자 칸이 된다");
  ok(runtime.text.includes("var focusDay ="), "격자에 들어올 칸을 하나 고른다");
  ok(runtime.text.includes('(day === focusDay ? "0" : "-1")'), "그 한 칸만 탭으로 들어오고 나머지는 -1 이다");
  // 빈 칸은 격자 의미에서 빠진다. aria-hidden 은 격자 안에서 칸 수를 어긋나게 한다.
  ok(runtime.text.includes('class="abNavCalBlank" role="presentation"'), "앞쪽 빈 칸은 격자 칸으로 세지 않는다");

  // 2. 방향키로 옮긴다. 격자에 들어온 뒤 날짜를 고르는 유일한 길이다.
  ok(runtime.text.includes("function bindCalendarRoving(root)"), "방향키 이동이 붙는다");
  for (const key of ["ArrowRight", "ArrowLeft", "ArrowDown", "ArrowUp", "Home", "End"]) {
    ok(runtime.text.includes(`"${key}"`), `${key} 를 처리한다`);
  }
  ok(runtime.text.includes('cells[index].setAttribute("tabindex", "-1")') && runtime.text.includes('cells[next].setAttribute("tabindex", "0")'), "옮길 때 정지점도 함께 옮긴다");
  ok(runtime.text.includes("if (next < 0 || next >= cells.length) return;"), "격자 밖으로 나가지 않는다");

  // 3. 달력이 만드는 정지점을 실제로 센다. 런타임이 조립하는 HTML 을 그대로 흉내내
  //    tabindex="0" 인 칸이 하나뿐인지 본다.
  const cellTabindexes = [...runtime.text.matchAll(/tabindex="' \+ \(day === focusDay \? "0" : "-1"\) \+ '"/g)];
  eq(cellTabindexes.length, 1, "날짜 칸의 tabindex 는 한 규칙으로만 결정된다");

  // 4. 좌측 예산 위젯 제거. 중앙 P0 와 같은 숫자를 두 번 말하고 있었고,
  //    빈 링크 하나가 정지점을 차지했다.
  eq(home.text.includes('class="abNavBudget"'), false, "사이드바 예산 위젯이 사라졌다");
  eq(source.includes("function renderNavBudgetUsage("), false, "그 렌더 함수도 남아 있지 않다");
  eq(runtime.text.includes("data-ab-nav-budget"), false, "클라이언트 렌더러도 사라졌다");
  // 예산 사용률 자체는 사라지지 않았다 — 홈 P0 가 말한다(V22.8.88).
  ok(home.text.includes("이번 달 쓸 수 있는 돈"), "예산 사용률은 홈 P0 에서 계속 보인다");
  ok(home.text.includes('class="homeProgress"'), "사용률 게이지도 그대로다");

  // 5. 사이드바 달력 자체는 남는다. 지시서는 "달력은 남깁니다"라고 명시한다.
  ok(home.text.includes('class="abNavCalendar"'), "사이드바 달력은 그대로 남는다");
  ok(source.includes("function renderNavMiniCalendar("), "달력 렌더러가 남아 있다");
  // 숫자를 42칸에 넣지 않는다 — 날짜와 기록 유무 표시만.
  ok(runtime.text.includes("><span>' + day + '</span>'"), "칸에는 날짜만 쓴다");
  eq(runtime.text.includes("numberWithCommas"), false, "칸에 금액을 넣지 않는다");

  // 6. 본문 바로가기는 유지된다(통과 조건에 함께 적혀 있다). 달력을 격자로 묶어도
  //    본문으로 건너뛰는 길이 사라지면 안 된다.
  ok(home.text.includes("본문 바로가기") || home.text.includes("abSkipToContent"), "본문 바로가기가 남아 있다");

  // 7. 새 질의는 없다. 사이드바는 이미 받아 둔 rows·budget 을 그대로 쓴다.
  ok(source.includes("showSidebarDashboard: true, sidebarRows: rows, sidebarBudget: budget"), "사이드바가 이미 받은 값을 재사용한다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.90 desktop nav grid (${checks} checks)`);
