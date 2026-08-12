// V22.8.85 — 통합 작업지시서 2장(디자인 토큰) 도입분 검사.
//
// 이 PR 은 토큰을 "선언만" 한다. 아무도 아직 쓰지 않으므로 화면 변화는 0건이어야 하고,
// 그 사실 자체가 검사 대상이다. 이후 PR 들이 페이지 인라인 CSS 의 리터럴을 이 토큰으로
// 옮겨 올 때, 옮길 대상이 실제로 존재한다는 보장이 여기서 나온다.
//
// 왜 굳이 검사하는가:
//   - 셸은 immutable 1년 캐시다. 내용을 바꾸고 주소를 안 올리면 새 토큰이 조용히 죽는다.
//   - 톤 비의존 토큰(up/down/parse-*)이 톤 선택자에 섞여 들어가면 "늘었다"가 보라색이 된다.
//     그 사고는 눈으로 보기 전까지 드러나지 않으므로 선언 위치를 직접 확인한다.

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

// 1. 셸 자산 주소와 ETag 가 함께 올라갔는지. 둘 중 하나만 올리면 캐시가 어긋난다.
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22888.css"'), "shell stylesheet moved to a new immutable address");
ok(source.includes('\'"accountbook-shell-v22888-css"\''), "shell stylesheet ETag matches its new path");

// 2. 실제로 배달되는 셸 CSS 를 받아서 확인한다. 소스 문자열만 보면 조립 과정에서
//    빠진 경우를 놓친다(작업지시서 1장: 실제 렌더로 확인).
const fixture = await createV2265QaFixture();
let shellCss = "";
try {
  const response = await app.fetch(new Request("https://ttokttok-accountbook.com/assets/accountbook-shell-v22888.css"), fixture.env, {});
  eq(response.status, 200, "the bumped shell stylesheet is served");
  eq(response.headers.get("etag"), '"accountbook-shell-v22888-css"', "the served ETag matches the path");
  shellCss = await response.text();
} finally {
  fixture.restore();
}

// 3. 2.2 표의 토큰이 전부 선언돼 있는지. 값까지 본다 — 이름만 맞고 값이 다르면
//    화면마다 간격이 어긋나던 원래 문제가 그대로 돌아온다.
const declarations = [
  ["--ab12-sp-1", "4px"], ["--ab12-sp-2", "8px"], ["--ab12-sp-3", "12px"],
  ["--ab12-sp-4", "16px"], ["--ab12-sp-5", "24px"], ["--ab12-sp-6", "32px"],
  ["--ab12-r-sm", "8px"], ["--ab12-r-md", "12px"], ["--ab12-r-lg", "16px"],
  ["--ab12-fs-num-xl", "34px"], ["--ab12-fw-num-xl", "700"],
  ["--ab12-fs-num-lg", "22px"], ["--ab12-fw-num-lg", "700"],
  ["--ab12-fs-title", "16px"], ["--ab12-fw-title", "700"],
  ["--ab12-fs-body", "14px"], ["--ab12-fw-body", "400"],
  ["--ab12-fs-cap", "12px"], ["--ab12-fw-cap", "500"],
  ["--ab12-up", "#c2410c"], ["--ab12-down", "#0f766e"],
  ["--ab12-disabled", "#94a3b8"],
  ["--ab12-parse-text", "#3182f6"], ["--ab12-parse-amount", "#c2410c"], ["--ab12-parse-method", "#0f766e"],
  ["--ab12-elev-card", "0 1px 2px rgba(0,0,0,.04)"], ["--ab12-elev-float", "0 8px 24px rgba(0,0,0,.12)"],
  ["--ab12-dur", "180ms"], ["--ab12-ease", "cubic-bezier(.2,.8,.2,1)"],
];
for (const [token, value] of declarations) {
  ok(shellCss.includes(`${token}:${value}`), `shell declares ${token}:${value}`);
}

// 4. 다크에서만 명도를 올린다(2.1). 같은 뜻, 어두운 바탕에서 읽히는 값.
const darkBlock = shellCss.split("\n").find((line) => line.startsWith('html[data-ab-resolved-theme="dark"] body.abV22812Shell{--ab12-up:'));
ok(Boolean(darkBlock), "a dark override exists for the tone-independent tokens");
for (const [token, value] of [["--ab12-up", "#fb923c"], ["--ab12-down", "#2dd4bf"], ["--ab12-parse-text", "#60a5fa"], ["--ab12-parse-amount", "#fb923c"], ["--ab12-parse-method", "#2dd4bf"]]) {
  ok(darkBlock.includes(`${token}:${value}`), `dark raises ${token} to ${value}`);
}

// 5. 톤 비의존이 진짜 지켜지는지 — 톤 선택자 어디에도 이 5개가 없어야 한다.
//    여기가 뚫리면 톤을 바꿨을 때 증감·파싱 색이 따라 움직인다.
const toneRules = shellCss.split("\n").filter((line) => line.includes("[data-ab-tone=") && line.includes("body.abV22812Shell{"));
ok(toneRules.length >= 6, `tone overrides are present to check against (${toneRules.length})`);
for (const token of ["--ab12-up", "--ab12-down", "--ab12-parse-text", "--ab12-parse-amount", "--ab12-parse-method"]) {
  eq(toneRules.some((rule) => rule.includes(`${token}:`)), false, `no tone override touches ${token}`);
}

// 6. V22.8.85 에서는 "아직 아무도 안 쓴다"를 검사했다(그것이 화면 변화 0건의 근거였다).
//    V22.8.87(M1)이 첫 소비자다 — 하단 탭 가운데 ＋ 와 서랍 안 조작 묶음이 토큰을 읽는다.
//    그래서 검사를 "쓰기 시작한 것은 폴백과 함께 쓴다"로 바꾼다. 셸은 immutable 1년
//    캐시라, 새 마크업이 옛 셸을 만나는 창이 존재한다. 그때 폴백이 없으면 ＋ 가 배경 없이
//    투명하게 뜬다 — 눌러야 할 것이 보이지 않는 상태가 가장 나쁘다.
const consumedWithFallback = [
  ["--ab12-r-lg", "16px"],
  ["--ab12-action", "#1d4ed8"],
  ["--ab12-elev-float", "0 8px 24px rgba(0,0,0,.12)"],
  ["--ab12-r-md", "12px"],
  ["--ab12-line", "#edf1f6"],
  ["--ab12-surface", "#fff"],
  ["--ab12-text", "#191f28"],
  ["--ab12-fs-cap", "12px"],
  // V22.8.88(M2·M3): 합쳐진 P0 카드가 간격 토큰을 읽는다.
  ["--ab12-sp-3", "12px"],
];
for (const [token, fallback] of consumedWithFallback) {
  ok(shellCss.includes(`var(${token},${fallback})`), `${token} is consumed with a fallback for stale cached shells`);
}
// 아직 쓰지 않는 것들은 그대로 두고, 쓰기 시작하는 PR 이 이 목록을 의도적으로 옮기게 한다.
const notYetConsumed = ["--ab12-fw-", "--ab12-fs-num-", "--ab12-parse-", "--ab12-dur", "--ab12-ease", "--ab12-up", "--ab12-down", "--ab12-disabled", "--ab12-elev-card"];
for (const token of notYetConsumed) {
  eq(shellCss.includes(`var(${token}`), false, `nothing consumes ${token}* yet`);
}

// 7. 홈 초기 HTML 은 1바이트도 늘지 않아야 한다. 토큰은 외부 셸 자산에만 있고,
//    주소 길이도 v22882 → v22885 로 같다.
const homeFixture = await createV2265QaFixture();
try {
  const home = await app.fetch(new Request("https://ttokttok-accountbook.com/app?month=2026-07&household_id=house-home", { headers: { cookie: homeFixture.cookie, "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" } }), homeFixture.env, {});
  const html = await home.text();
  eq(home.status, 200, "home still renders");
  eq((html.match(/href="\/assets\/accountbook-shell-v22888\.css"/g) || []).length, 1, "home loads the bumped shell exactly once");
  eq(html.includes("--ab12-sp-"), false, "no design token leaks into the home HTML payload");
} finally {
  homeFixture.restore();
}

console.log(`PASS: V22.8.85 design tokens (${checks} checks)`);
