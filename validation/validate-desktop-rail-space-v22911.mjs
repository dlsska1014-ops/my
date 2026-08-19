// V22.9.11 — 없는 것을 위해 자리를 비워 두지 않는다.
//
// 홈은 1280px 창에서 본문이 656px 만 쓰고 오른쪽 356px 이 비어 있었다. 원인은
// body 의 padding-right:340px 인데, 그 자리는 활동 레일(.abActivityRail)의 것이다.
// 그런데 1181~1359px 구간에서는 레일이 [hidden] 이었다 — 자리만 비워 두고 아무것도
// 놓지 않았다. 그 폭에서 본문은 656px → 996px 이 된다.
//
// ── 재면서 내가 세 번 틀렸다는 기록 ──
// 처음에 "1280·1440·1920 모두 19~28% 가 빈다"고 적었는데, 1360px 이상에서는 레일이
// 실제로 열려 있어서 그 공간은 낭비가 아니었다(뷰포트에서 본문 오른쪽 끝을 뺀 값만
// 보고 그 자리에 무엇이 있는지 확인하지 않았다). "떠 있는 바가 본문을 덮는다"도,
// "사이드바 안내 상자가 설정 그룹을 가린다"도 마찬가지로 도구의 착각이었다 —
// 앞의 것은 부드러운 스크롤이 끝나기 전에 쟀고, 뒤의 것은 스크롤 컨테이너가 잘라내는
// 영역을 계산에 넣지 않았다. 그래서 이 검사는 **레일이 없을 때만 자리를 비우지 않는다**는
// 성질 하나만 본다. 재서 확인한 것이 그것뿐이기 때문이다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// 레일 폭 변수 하나로 자리를 정한다 — 도킹 바·저장 알림 위치도 이 변수에서 나오므로
// 변수만 0 이 되면 나머지가 따라온다. 값을 여러 군데 적어 두면 그 중 하나가 남는다.
ok(source.includes(":root{--abActivityRailW:340px}"), "레일 폭이 변수 하나에서 나온다");
ok(source.includes("body.abV22812Shell.abMobileAppSurface{padding-right:var(--abActivityRailW)!important}"),
  "본문 오른쪽 여백이 그 변수를 그대로 쓴다");
ok(source.includes("body.abV22812Shell.abMobileAppSurface:has(.abActivityRail[hidden]){--abActivityRailW:0px}"),
  "레일이 숨어 있으면 그 폭이 0 이 된다");

// :has() 를 모르는 브라우저에서 화면이 깨지지 않아야 한다. 이 규칙은 값을 **줄이는**
// 방향으로만 쓰므로, 규칙이 무시되면 개편 전과 똑같이 340px 을 비운다(퇴보 없음).
const hasRule = source.slice(source.indexOf(":has(.abActivityRail[hidden])"), source.indexOf(":has(.abActivityRail[hidden])") + 120);
ok(hasRule.includes("--abActivityRailW:0px"), "그 규칙이 하는 일은 폭을 0 으로 두는 것뿐이다");
ok(!hasRule.includes("display:none") && !hasRule.includes("position:"), "레이아웃을 다시 짜지 않는다 — 미지원 브라우저는 예전 그대로 동작한다");

// 도킹 바·저장 알림이 같은 변수에서 위치를 계산하는지 — 하나만 고치고 나머지를
// 잊으면 레일이 없는 폭에서 바가 가운데가 아닌 곳에 선다.
for (const consumer of [
  "body.abV22812Shell.abMobileAppSurface .abGlobalActions[data-ab-quick-dock]{left:calc(50% + (var(--abNavWidth,238px) / 2) - (var(--abActivityRailW) / 2))}",
  "body.abV22812Shell.abMobileAppSurface .abSaveFeedback{left:calc(50% + (var(--abNavWidth,238px) / 2) - (var(--abActivityRailW) / 2))",
]) {
  ok(source.includes(consumer), `위치 계산이 같은 변수를 쓴다: ${consumer.slice(0, 60)}…`);
}

console.log(`V22.9.11 데스크톱 레일 자리 검사 통과 (${checks} checks)`);
