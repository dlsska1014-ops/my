// V22.8.87 — 통합 작업지시서 M1(하단 독·탭 통합, 상단바 정리) 검사.
//
// M1 의 통과 조건은 "390px 에서 겹친 조작 요소 0개, 탭 영역 44px 미만 0건"이다.
// 겹침은 결국 브라우저가 재야 하는 값이라 여기서 픽셀을 재지는 못한다. 대신 겹침이
// 생기는 원인을 없앴는지를 확인한다 — 모바일에 떠 있는 고정 조작 레이어가 없을 것,
// 하단 탭이 다섯 칸을 넘지 않을 것, 본문이 탭 높이만큼 바닥을 비워 둘 것.
// 실기기 확인은 RELEASE-CHECKLIST.md 와 KNOWN-ISSUES.md 로 넘긴다(작업지시서 11장).

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
  const month = "2026-07";
  const householdId = "house-home";
  const get = async (path, cookie = fixture.cookie) => {
    const headers = { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" };
    if (cookie) headers.cookie = cookie;
    const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers }), fixture.env, {});
    return { response, text: await response.text() };
  };

  const home = await get(`/app?month=${month}&household_id=${householdId}`);
  eq(home.response.status, 200, "홈이 렌더된다");
  const bottomNav = (home.text.match(/<nav class="abNavBottom"[\s\S]*?<\/nav>/) || [""])[0];
  ok(bottomNav.length > 0, "하단 탭이 렌더된다");

  // 1. 다섯 칸 유지, 가운데가 기록(＋).
  const tabs = [...bottomNav.matchAll(/<a data-key="([^"]+)"/g)].map((match) => match[1]);
  eq(tabs.length, 5, `하단 탭은 다섯 칸이다 (${tabs.join(", ")})`);
  eq(tabs.join(","), "home,records,quick,stats,budgets", "가운데가 기록 자리다");
  ok(bottomNav.includes('class="abNavQuick"'), "가운데 칸이 기록 버튼 표시를 갖는다");
  ok(bottomNav.includes("data-ab-quick-open"), "가운데 칸이 빠른 입력 경로에 연결된다");

  // 2. ＋ 는 어느 화면에서도 "현재 위치"가 아니다. 파란 원과 현재 탭 표시가 겹쳐 읽히면
  //    지금 어디에 있는지 알 수 없다.
  const quickAnchor = (bottomNav.match(/<a data-key="quick"[^>]*>/) || [""])[0];
  eq(/aria-current/.test(quickAnchor), false, "기록 버튼은 현재 위치로 표시되지 않는다");
  ok(/aria-label="빠른 입력"/.test(quickAnchor), "기록 버튼에 이름이 있다");

  // 3. JS 가 없어도 도달해야 한다. 지시서가 적은 /quick 은 이 앱에 없는 주소라,
  //    이미 동작하는 입력 앵커로 보낸다 — 그 앵커가 실제로 존재하는지 확인한다.
  const quickHref = (bottomNav.match(/data-key="quick"[^>]*href="([^"]+)"/) || [])[1] || "";
  ok(quickHref.includes("#add"), `기록 버튼이 입력 자리를 가리킨다 (${quickHref})`);
  ok(home.text.includes('<section id="add"'), "그 앵커가 홈에 실제로 있다");
  const fallback = await get(quickHref.replaceAll("&amp;", "&").replace(/#.*$/, ""));
  eq(fallback.response.status, 200, "링크만 따라가도 화면이 열린다");
  ok(fallback.text.includes('id="smartInput"'), "그 화면에 입력칸이 있다");

  // 4. 정산은 탭에서 내려왔을 뿐 사라지지 않았다. 주소도 그대로다.
  eq(bottomNav.includes('data-key="settlement"'), false, "정산이 탭 자리를 비웠다");
  const analysis = await get(`/my/analysis?month=${month}&household_id=${householdId}`);
  eq(analysis.response.status, 200, "통계 화면이 열린다");
  ok(/href="\/settlement-summary\?[^"]*"/.test(analysis.text), "통계 화면 머리말에 정산 진입점이 있다");
  ok(home.text.includes('href="/settlement-summary?'), "전체 메뉴 서랍에도 정산이 남아 있다");
  const settlement = await get(`/settlement-summary?month=${month}&household_id=${householdId}`);
  eq(settlement.response.status, 200, "/settlement-summary 주소가 그대로 살아 있다");

  // 5. 상단바 정리. "작업" 버튼이 사라지고 전체 메뉴만 남는다.
  const topBar = (home.text.match(/<div class="abNavMobileTop">[\s\S]*?<\/div>/) || [""])[0];
  ok(topBar.length > 0, "모바일 상단바가 렌더된다");
  const topButtons = [...topBar.matchAll(/<button[^>]*>([\s\S]*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]*>/g, "").trim());
  eq(topButtons.join(","), "전체 메뉴", `상단바 버튼은 전체 메뉴 하나다 (${topButtons.join(", ") || "없음"})`);
  eq(home.text.includes("<span>작업</span>"), false, "작업 버튼이 사라졌다");

  // 6. 겹침의 원인 제거. 모바일에서 떠 있는 조작 레이어가 없어야 한다.
  const shell = await get("/assets/accountbook-shell-v22899.css", "");
  eq(shell.response.status, 200, "셸이 서빙된다");
  ok(shell.text.includes("body.abV22812Shell .abGlobalActions{display:none!important}"), "모바일에서 떠 있는 조작 묶음이 없다");
  ok(shell.text.includes("body.abV22812Shell .abNavDrawerActions"), "그 조작들이 전체 메뉴 서랍 안에 자리를 갖는다");

  // 7. 탭 영역과 안전 영역. 44px 미만이 나오지 않도록 규칙으로 못박는다.
  ok(shell.text.includes("body.abV22812Shell .abNavBottom a{gap:3px!important;min-height:44px!important}"), "탭 다섯 칸이 최소 44px 를 갖는다");
  ok(/\.abNavBottom\{height:calc\(64px \+ var\(--abSafeBottom\)\)!important;padding-bottom:var\(--abSafeBottom\)!important/.test(source), "탭 바가 하단 안전 영역을 반영한다");
  ok(source.includes("padding-bottom:96px"), "본문이 탭 높이만큼 바닥을 비운다");

  // 8. 가운데 원의 규격. 원만 누를 수 있게 하면 44px 규칙을 지키고도 누르기 어려워지므로,
  //    원은 52px 이되 탭 영역은 칸 전체가 받아야 한다.
  const quickRule = (shell.text.match(/body\.abV22812Shell \.abNavBottom a\.abNavQuick i\{[^}]*\}/) || [""])[0];
  ok(quickRule.includes("width:52px!important") && quickRule.includes("height:52px!important"), "가운데 원이 52×52 이다");
  ok(quickRule.includes("margin-top:-14px"), "가운데 원이 탭 바 위로 올라온다");
  ok(quickRule.includes("var(--ab12-action,#1d4ed8)"), "가운데 원이 대비가 확보된 동작색을 쓴다");
  ok(quickRule.includes("var(--ab12-r-lg,16px)"), "가운데 원이 모서리 토큰을 쓴다");
  eq(shell.text.includes("body.abV22812Shell .abNavBottom a.abNavQuick{justify-content:flex-start}"), true, "가운데 칸도 칸 전체가 탭 영역이다");

  // 9. 아이콘. 모르는 이름은 집 모양으로 돌아가므로, ＋ 가 진짜 ＋ 인지 본다.
  ok(source.includes("plus: '<path d=\"M12 5v14M5 12h14\"/>',"), "＋ 아이콘이 아이콘표에 있다");
  const nav = await get("/assets/accountbook-nav-v22893.js", "");
  eq(nav.response.status, 200, "내비 자산이 서빙된다");
  ok(nav.text.includes('plus: \'<path d="M12 5v14M5 12h14"/>\''), "배포되는 자산에도 ＋ 아이콘이 담긴다");

  // 10. 데스크톱은 건드리지 않았다. 하단 탭은 900px 이상에서 숨고, 독은 그대로다.
  ok(source.includes(".abNavBottom{display:none!important}"), "데스크톱에서는 하단 탭이 숨는다");
  ok(source.includes("body.abV22812Shell .abGlobalActions{left:calc(var(--abNavWidth,238px) + 22px);right:auto;top:auto;bottom:18px}"), "데스크톱 독은 그대로 남는다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.87 mobile dock and tabs (${checks} checks)`);
