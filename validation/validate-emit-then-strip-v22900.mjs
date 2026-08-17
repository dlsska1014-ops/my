// V22.8.100 — 만들었다 지우는 마크업을 없애고, 다시 생기지 않게 잠근다.
//
// V22.8.99 자체 점검에서 발견한 것: renderMobileV81Html 이 홈에 "예산 관리" 패널을
// 만들어 붙이고, 그 직후 normalizeUserFacingUi 가 정규식으로 다시 걷어냈다. 매 요청마다
// 만들었다 지운다. 내보내는 바이트에는 영향이 없으니 사용자는 모르지만, 요청마다 헛일이고
// 무엇보다 **읽는 사람을 속인다** — 렌더 함수만 보면 홈에 예산 패널이 있는 것처럼 보인다.
//
// 실제로 그 착각이 검사 하나를 망가뜨렸다. validate-home-tab-stops-v22896 은 빠른 입력
// 구간의 끝 경계를 '<section id="budget"' 로 잡았는데 응답에 그 문자열이 없어서
// indexOf 가 -1 을 돌려줬고, 정지점 하한이 아무것도 재지 못했다. 없는 마크업을 있다고
// 믿게 만드는 코드는 그 자체로 결함을 부른다.
//
// 그래서 걷어내는 쪽이 아니라 **만들지 않는 쪽**으로 고쳤다. 이 파일은 두 가지를 잠근다.
//   1) 후처리에 `class="panel"` 섹션을 지우는 정규식이 하나도 없다 (일반 규칙).
//   2) 예산 패널이 사라져도 사용자가 예산에 닿는 길은 그대로다 (사용자 쪽 보장).
//
// ── 남겨 두는 것과 그 이유 ──
// MOBILE_V81_CSS 의 `.progress{...}` / `.progress i{...}` 두 규칙(132 B)은 이제 이 화면
// 어디에도 쓰이지 않는다. 그런데도 지우지 않았다. 그 CSS 는 1년 캐시 immutable 자산이라
// 내용을 바꾸면 주소를 바꿔야 하고, 그러면 **재방문자 전원이 59,201 B 를 다시 받는다.**
// 132 B 를 아끼려고 59 KB 를 다시 내려받게 하는 것은 손해다. 그 자산이 다른 이유로 주소를
// 바꾸는 날 같이 지우면 된다. 그때 잊지 않도록 여기 적어 둔다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

ok(source.includes('const APP_VERSION = "V22.8.100-DEAD-MARKUP"'), "런타임이 V22.8.100 을 알린다");

// ---------------------------------------------------------------------------
// 1) 만들었다 지우는 패턴 자체를 금지한다
// ---------------------------------------------------------------------------
// 지우는 쪽만 세면 "예산 패널"이라는 개별 사례만 막힌다. 같은 실수는 다른 id 로 언제든
// 다시 들어올 수 있으므로, 규칙을 사례가 아니라 **모양**으로 적는다.
const STRIPPER_PATTERN = /source\s*=\s*source\.replace\(\s*\/<section id="([a-zA-Z0-9_-]+)" class="panel">[\s\S]*?\/\s*,\s*""\s*\)/g;

// 세는 법이 실제로 잡는지 **먼저** 확인한다 — 아무것도 못 잡는 정규식은 언제나 통과하고,
// 그러면 이 절은 지켜지는 것처럼 보이면서 아무것도 지키지 않는다. 지운 코드 원문을 그대로
// 넣어 본다.
const stripperProbe = 'source = source.replace(/<section id="budget" class="panel">[\\s\\S]*?<\\/section>/, "");';
eq([...stripperProbe.matchAll(STRIPPER_PATTERN)].map((m) => m[1]).join(","), "budget", "이 정규식은 실제로 그 패턴을 잡는다");
eq([...'source = source.replace(/<div class="x">/, "");'.matchAll(STRIPPER_PATTERN)].length, 0, "관계없는 치환까지 잡지는 않는다");

const panelStrippers = [...source.matchAll(STRIPPER_PATTERN)].map((match) => match[1]);
eq(panelStrippers.length, 0, `후처리가 지우는 패널 섹션이 없다 (있으면: ${panelStrippers.join(", ") || "없음"})`);

// 렌더 쪽도 함께 본다. 지우는 코드가 없어도 만드는 코드가 남아 있으면 이번엔 진짜로
// 나가 버린다 — 그건 다른 종류의 회귀이고, 여기서 같이 막는다.
eq(source.split('<section id="budget" class="panel">').length - 1, 0, "예산 패널을 만드는 코드가 남아 있지 않다");
eq(source.split('<section id="fixed" class="panel">').length - 1, 0, "고정지출 패널을 만드는 코드도, 지우는 코드도 없다");

// ---------------------------------------------------------------------------
// 2) 사용자 쪽 보장 — 없앤 것은 중복이지 길이 아니다
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
try {
  const appPath = "/app?month=2026-07&household_id=house-home";
  const response = await app.fetch(new Request(`${ORIGIN}${appPath}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(response.status, 200, "홈이 렌더된다");
  const html = await response.text();

  // 응답에 남아 있는 패널은 빠른 입력과 최근 내역 둘뿐이다. 지금 상태를 못 박아 두면,
  // 다시 만들었다 지우는 섹션이 끼어드는 순간 여기서 드러난다.
  const panels = [...html.matchAll(/<section id="([a-z0-9_-]+)" class="panel">/g)].map((match) => match[1]);
  assert.deepEqual(panels, ["add", "feed"], `응답의 패널은 빠른 입력·최근 내역 둘뿐이다 (실제: ${panels.join(", ")})`);
  checks += 1;

  // 예산 패널이 하던 일은 셋이었다 — 사용률을 보여 주고, 분류별 초과를 알리고,
  // 예산 화면으로 보냈다. 셋 다 홈에 그대로 있다. 하나라도 사라지면 이건 정리가 아니라
  // 기능 삭제다.
  ok(html.includes("/budgets?month=2026-07"), "예산 화면으로 가는 길이 홈에 남아 있다");
  ok(/예산/.test(html), "홈이 예산을 언급한다");
  ok(html.includes('<nav class="abNavBottom"') || html.includes('class="tab"'), "하단 탭이 살아 있다");

  // 사용률은 P0 게이지가 이어받았다. 숫자가 통째로 사라진 채로 이 검사가 통과하면 안 된다.
  ok(/homeProgress/.test(html), "홈 P0 게이지가 사용률 자리를 지킨다");

  // 예산 화면 자체도 열려야 한다. 홈에서 링크만 남기고 목적지가 깨져 있으면 뜻이 없다.
  const budgetsResponse = await app.fetch(new Request(`${ORIGIN}/budgets?month=2026-07&household_id=house-home`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(budgetsResponse.status, 200, "예산 화면이 열린다");
  const budgetsHtml = await budgetsResponse.text();
  ok(budgetsHtml.includes("예산"), "예산 화면이 예산을 다룬다");

  // 기록이 없는 계정에서도 같아야 한다. 패널 제거가 빈 화면 경로를 건드리지 않았는지 본다.
  const emptyPath = "/app?month=2020-01&household_id=house-home";
  const emptyResponse = await app.fetch(new Request(`${ORIGIN}${emptyPath}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(emptyResponse.status, 200, "기록 없는 달도 렌더된다");
  const emptyHtml = await emptyResponse.text();
  ok(!emptyHtml.includes('id="budget"'), "기록 없는 달에도 예산 패널이 만들어지지 않는다");
  ok(!emptyHtml.includes('id="fixed"'), "기록 없는 달에도 고정지출 패널이 만들어지지 않는다");

  // 기록 탭에서도 마찬가지다 — 원래 이 탭에서는 패널이 아예 만들어지지 않았다.
  const txResponse = await app.fetch(new Request(`${ORIGIN}${appPath}&tab=transactions`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  eq(txResponse.status, 200, "기록 탭이 렌더된다");
  ok(!(await txResponse.text()).includes('id="budget"'), "기록 탭에도 예산 패널이 없다");
} finally {
  fixture.restore();
}

console.log(`V22.8.100 만들었다 지우는 마크업 검사 통과 (${checks} checks)`);
