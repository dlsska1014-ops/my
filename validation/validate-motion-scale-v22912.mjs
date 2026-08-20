// V22.9.12 — 움직임에 눈금이 있다.
//
// 브라우저로 재 보니 상호작용 요소 188개 중 전환 효과가 붙은 것은 43개(23%)뿐이었고,
// 그 43개도 전부 0.12s ease 한 규격이었다. 속도가 하나뿐이라는 건 "무엇이 빠르고
// 무엇이 느려야 하는가"에 대한 판단이 없다는 뜻이다. 마우스를 올려도 아무 일이 없고,
// 사이드바 그룹은 높이가 280 → 280 → 280 으로 한 프레임에 튀었다(<details> 는 기본적으로
// 애니메이션되지 않는다).
//
// 그런데 소스에는 값이 흩어져 있었다 — .08 .12 .14 .15 .16 .18 .22 .4 .45 .5 .6초와
// 620ms, 열세 가지. 특히 "막대가 차오른다"는 **같은 몸짓 하나에 네 가지 속도**가 있었다.
//
// ── 이 검사가 보는 것 ──
// 개수가 아니라 성질 셋:
//   1) 모든 전환이 눈금에서 값을 가져온다 — 리터럴이 다시 들어오면 실패한다.
//   2) 같은 몸짓은 같은 속도다 — 게이지 넷이 한 값을 쓴다.
//   3) 동작 줄이기를 켜면 전부 멈춘다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) 눈금이 있고, 네 칸이 서로 다른 뜻을 가진다
// ---------------------------------------------------------------------------
for (const [token, meaning] of [
  ["--ab12-dur-fast:120ms", "손끝 반응"],
  ["--ab12-dur:180ms", "나타남·접힘"],
  ["--ab12-dur-slow:320ms", "크게 움직이는 것"],
  ["--ab12-dur-gauge:620ms", "값이 차오르는 것"],
]) ok(source.includes(token), `눈금에 "${meaning}" 칸이 있다 (${token})`);
ok(source.includes("--ab12-ease:cubic-bezier(.2,.8,.2,1)"), "가속 곡선도 한 곳에서 정한다");

// ---------------------------------------------------------------------------
// 2) 전환이 눈금 밖에서 값을 지어내지 않는다
// ---------------------------------------------------------------------------
// 되돌아가는 방식은 하나다: 급할 때 ".15s" 라고 적는 것. 그 순간 눈금은 장식이 된다.
const declarations = [...source.matchAll(/transition:[^;}`]{0,220}/g)].map((m) => m[0]);
ok(declarations.length >= 25, `전환 선언을 찾았다 (${declarations.length}개)`);
const offenders = declarations.filter((decl) => {
  if (decl.startsWith("transition:none")) return false;
  if (decl.includes("var(--ab12-dur")) return false;
  return /\d+\s*m?s/.test(decl);
});
eq(offenders.length, 0, `눈금 밖 리터럴이 없다${offenders.length ? " — " + offenders.slice(0, 3).join(" / ") : ""}`);

// 이 검사가 실제로 리터럴을 잡는지 그 자리에서 확인한다.
ok(/\d+\s*m?s/.test("transition:opacity .15s ease"), "이 검사는 옛 리터럴 표기를 실제로 알아본다");
ok(!/\d+\s*m?s/.test("transition:opacity var(--x) var(--y)"), "토큰만 쓴 선언은 잡지 않는다");

// ---------------------------------------------------------------------------
// 3) 같은 몸짓은 같은 속도
// ---------------------------------------------------------------------------
// 게이지 넷(.homeProgress·.obar·셸 막대·accent 막대)이 .4/.45/.5/620ms 로 갈려 있었다.
// 처음엔 "gauge 를 쓰는 것들끼리 값이 같은가"만 봤는데, 그러면 넷 중 하나를 다른
// 칸으로 옮겨도 그 하나가 검사 대상에서 빠져나가 통과한다 — 실제로 그렇게 통과했다.
// **개수와 값을 함께** 본다.
const gaugeUses = declarations.filter((decl) => decl.includes("--ab12-dur-gauge"));
eq(gaugeUses.length, 4, `차오르는 막대 네 곳이 모두 gauge 칸을 쓴다 (${gaugeUses.length}곳)`);
const gaugeSpeeds = new Set(gaugeUses.map((decl) => decl.trim()));
eq(gaugeSpeeds.size, 1, `그 넷이 글자까지 같은 선언이다 (${gaugeSpeeds.size}가지)`);
ok([...gaugeSpeeds][0].includes("--ab12-ease-gauge"), "가속 곡선도 막대 전용 칸을 쓴다");

// ---------------------------------------------------------------------------
// 4) 사이드바 그룹이 열릴 때 튀지 않는다
// ---------------------------------------------------------------------------
ok(source.includes("@supports (interpolate-size: allow-keywords) and selector(details::details-content)"),
  "펼침 애니메이션은 아는 브라우저에서만 켠다");
ok(source.includes(".abNavGroup::details-content{height:0"), "닫힌 높이를 0 에서 시작한다");
ok(source.includes(".abNavGroup[open]::details-content{height:auto"), "열린 높이는 내용에 맞춘다");
// @supports 안에만 있어야 한다 — 밖으로 새면 미지원 브라우저에서 그룹이 아예 안 열린다.
const supportsAt = source.indexOf("@supports (interpolate-size: allow-keywords)");
const detailsAt = source.indexOf(".abNavGroup::details-content{height:0");
ok(detailsAt > supportsAt && detailsAt - supportsAt < 400, "그 규칙이 @supports 블록 안에 있다");

// ---------------------------------------------------------------------------
// 5) 동작 줄이기를 존중한다
// ---------------------------------------------------------------------------
ok(source.includes("@media(prefers-reduced-motion:reduce){\n  body.abV22812Shell *,body.abV22812Shell *::before,body.abV22812Shell *::after{transition-duration:1ms!important;animation-duration:1ms!important}"),
  "동작 줄이기를 켜면 전환과 애니메이션이 모두 멈춘다");
ok(source.includes("body.abV22812Shell :is(a.featuredCard,a.menuRow,.abNavLinks a):active{transform:none}"),
  "누를 때의 움직임도 함께 꺼진다");

// ---------------------------------------------------------------------------
// 6) 실제로 서빙되는 CSS 에 들어 있다
// ---------------------------------------------------------------------------
const shell = await (await app.fetch(new Request("https://ttokttok-accountbook.com/assets/accountbook-shell-v22914.css"), {}, {})).text();
ok(shell.includes("--ab12-dur-gauge:620ms"), "눈금이 셸 CSS 로 나간다");
ok(shell.includes("::details-content"), "펼침 애니메이션이 셸 CSS 로 나간다");

console.log(`V22.9.12 움직임 눈금 검사 통과 (${checks} checks)`);
