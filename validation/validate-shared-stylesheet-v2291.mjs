// V22.9.1 (개편 1단계) — 공유 CSS 를 화면마다 다시 보내지 않는다.
//
// 개편 전 상태를 숫자로 남겨 둔다. 15개 화면을 렌더해서 잰 값이다:
//   · 홈은 캐시되는 스타일시트를 링크해서 인라인 CSS 가 페이지의 1%(0.2 KB)였다.
//   · 나머지 열네 화면은 자기 CSS 를 매 요청마다 인라인으로 실어 보냈다 — 22~43 KB,
//     페이지의 27~50%.
//   · 그 인라인 CSS 의 고유 규칙 1,094개(95.4 KB) 중 196개(20.0 KB)는 13개 화면 중
//     8개 이상이 **똑같이** 갖고 있었다. 같은 바이트를 열세 번 보내고 있었다.
// 합계 403.7 KB → 113.4 KB. 홈이 이미 쓰던 방식으로 나머지를 옮긴 결과다.
//
// ── 이 검사가 필요한 이유 ──
// 그 290 KB 가 옮겨가는 동안 기존 자동 검사 4,232개는 **하나도 실패하지 않았다.**
// 아무도 이 성질을 보고 있지 않았다는 뜻이다. 되돌아가도 조용할 것이므로 여기서 잡는다.
//
// ── 안전 근거(이게 이 파일의 핵심) ──
// 옮긴 조각 중 셋은 원래 페이지 내용을 보고 **골라서** 넣던 것이다. 공유 자산에는
// 합집합을 담으므로, 어떤 화면은 예전에 안 받던 규칙을 받게 된다. 그게 무해한 이유는
// 그 규칙들의 셀렉터가 전부 페이지 클래스로 가드돼 있기 때문이다 — 해당 클래스가
// 없는 화면에서는 아예 매치되지 않는다. **그 가드가 이 방식의 전제**이므로, 가드 없는
// 규칙이 하나라도 그 조각에 들어오면 여기서 실패해야 한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";
const ASSET = "/assets/ab-uiux-v2290.css";

// ---------------------------------------------------------------------------
// 1) 공유 스타일시트가 캐시되는 자산으로 존재한다
// ---------------------------------------------------------------------------
const assetResponse = await app.fetch(new Request(`${ORIGIN}${ASSET}`), {}, {});
eq(assetResponse.status, 200, "공유 스타일시트가 서빙된다");
eq(assetResponse.headers.get("etag"), '"ab-uiux-v2290-css"', "공유 스타일시트 ETag 가 주소와 맞는다");
ok(String(assetResponse.headers.get("content-type") || "").includes("text/css"), "CSS 로 서빙된다");
ok(String(assetResponse.headers.get("cache-control") || "").includes("immutable"), "1년 캐시 불변 자산이다");
const assetCss = await assetResponse.text();
ok(assetCss.length > 30 * 1024, `공유 스타일시트에 내용이 있다 (${assetCss.length} B)`);

// 조각 하나(V2284)는 상수 자체가 <style> 태그까지 들고 있다. 벗기지 않고 넣으면 CSS
// 파일 안에 태그가 섞여 **그 뒤 규칙이 통째로 죽는다** — 실제로 :root 변수 블록과
// .abPageMenu 규칙이 그렇게 사라졌고, 규칙 집합을 비교해서야 발견했다.
ok(!assetCss.includes("<style"), "CSS 자산에 <style> 태그가 섞여 있지 않다");
ok(!assetCss.includes("</style>"), "CSS 자산에 닫는 태그도 섞여 있지 않다");
const braces = [(assetCss.match(/\{/g) || []).length, (assetCss.match(/\}/g) || []).length];
eq(braces[0], braces[1], `중괄호 짝이 맞는다 (${braces[0]})`);

// ---------------------------------------------------------------------------
// 2) 합집합을 담아도 안전한 근거 — 조건부 조각은 전부 클래스로 가드돼 있다
// ---------------------------------------------------------------------------
// 이 절이 이 방식의 전제다. 가드 없는 규칙이 들어오면 전 화면으로 새어 나간다.
function block(name) {
  const head = `const ${name} = \``;
  const start = source.indexOf(head);
  if (start < 0) return "";
  return source.slice(start + head.length, source.indexOf("`;", start));
}
function selectorsOf(css) {
  return (css.match(/[^{}]+\{/g) || [])
    .map((part) => part.slice(0, -1).replace(/\s+/g, " ").trim())
    .filter((part) => part && !part.startsWith("@") && !part.startsWith("/*") && !part.startsWith("<"));
}
for (const [name, guard] of [["V2285_MENU_STYLE", "abPageMenu"], ["V2285_LOGIN_STYLE", "abPageLogin"]]) {
  const selectors = selectorsOf(block(name));
  ok(selectors.length > 10, `${name} 에 규칙이 있다 (${selectors.length}개)`);
  const unguarded = selectors.filter((selector) => !selector.includes(guard));
  eq(unguarded.length, 0, `${name} 의 모든 규칙이 .${guard} 로 가드돼 있다${unguarded.length ? ` — 새는 것: ${unguarded[0]}` : ""}`);
}
// V2284 는 구역별로 가드가 다르다. 구역 경계는 주석이고, 그 순서가 코드와 같아야 한다.
const v2284 = block("V2284_UI_REVALIDATION_STYLE");
const sections = [
  ["/* 모바일 홈", "/* 영수증", "abMobileAppSurface"],
  ["/* 영수증", "/* 키워드", "abPageReceipts"],
  ["/* 키워드", "/* 파일 가져오기", "abPageKeywords"],
  ["/* 파일 가져오기", "@media(max-width:900px)", "abPageBackup"],
];
for (const [from, to, guard] of sections) {
  const start = v2284.indexOf(from);
  const end = v2284.indexOf(to, start + from.length);
  ok(start >= 0 && end > start, `V2284 의 ${guard} 구역 경계가 실제로 있다`);
  const selectors = selectorsOf(v2284.slice(start, end));
  ok(selectors.length > 0, `${guard} 구역에 규칙이 있다 (${selectors.length}개)`);
  const unguarded = selectors.filter((selector) => !selector.includes(guard));
  eq(unguarded.length, 0, `${guard} 구역의 모든 규칙이 그 클래스로 가드돼 있다${unguarded.length ? ` — 새는 것: ${unguarded[0]}` : ""}`);
}
// 내비 조각은 일부러 자산에 넣지 않았다 — :root 에 변수를 전역으로 푸는 유일한 조각이라
// 가드가 없다. 조건부 인라인으로 남겨 두는 것이 의도이므로 그 상태를 고정한다.
ok(source.includes("function v2285NavStyleFor"), "내비 조각은 조건부 인라인으로 남아 있다");
ok(!assetCss.includes("--abNavW"), "가드 없는 내비 변수는 공유 자산에 들어가지 않았다");

// ---------------------------------------------------------------------------
// 3) 화면이 실제로 링크를 쓰고, 인라인으로 되돌아가지 않았다
// ---------------------------------------------------------------------------
const SCREENS = [
  "/budgets", "/reserve-plans", "/my/analysis", "/my/analysis?view=report",
  "/menu", "/receipts", "/my/settings", "/my/households", "/my/members",
  "/my/backup", "/keyword-guide", "/smart-tools", "/start-guide", "/home-layout",
];
const fixture = await createV2265QaFixture();
try {
  const get = async (path) => {
    const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}month=2026-07&household_id=house-home`;
    const response = await app.fetch(new Request(url, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
    eq(response.status, 200, `${path} 가 렌더된다`);
    return response.text();
  };
  const inlineCssBytes = (html) => [...html.matchAll(/<style[^>]*>([\s\S]*?)<\/style>/g)]
    .reduce((sum, match) => sum + Buffer.byteLength(match[1]), 0);

  let total = 0;
  for (const path of SCREENS) {
    const html = await get(path);
    ok(html.includes(`href="${ASSET}"`), `${path} 가 공유 스타일시트를 링크한다`);
    // 옮긴 조각들이 인라인으로 돌아오면 여기서 걸린다. id 로 확인하는 것이 가장 곧다.
    ok(!html.includes('id="v2262UiUxStyle"'), `${path} 가 공유 조각을 인라인으로 다시 넣지 않는다`);
    ok(!html.includes('id="v2281GuidedUiUxStyle"'), `${path} 가 안내 스타일을 인라인으로 다시 넣지 않는다`);
    ok(!html.includes('id="v2284UiRevalidationStyle"'), `${path} 가 재검토 스타일을 인라인으로 다시 넣지 않는다`);
    const bytes = inlineCssBytes(html);
    total += bytes;
    // 개편 전 이 화면들은 22~43 KB 를 인라인으로 실었다. 지금 가장 무거운 화면이
    // 22.8 KB(종합 리포트, 그 화면 고유 CSS 다). 24 KB 를 천장으로 못 박는다.
    ok(bytes <= 24 * 1024, `${path} 의 인라인 CSS 가 24 KiB 이하다 (${bytes} B)`);
  }
  // 합계도 함께 본다. 화면 하나씩은 천장 밑이면서 전체가 다시 불어나는 것을 막는다.
  ok(total <= 130 * 1024, `열네 화면의 인라인 CSS 합계가 130 KiB 이하다 (${total} B, 개편 전 403.7 KB)`);

  // 홈은 이 개편의 기준점이었다 — 원래도 링크를 쓰고 있었으므로 달라지면 안 된다.
  const home = await get("/app");
  ok(home.includes("mobile-home-v2290.css"), "홈은 자기 스타일시트를 그대로 쓴다");
  ok(!home.includes(`href="${ASSET}"`), "홈은 공유 스타일시트를 중복으로 받지 않는다");
  ok(inlineCssBytes(home) <= 1024, `홈의 인라인 CSS 가 여전히 1 KiB 이하다 (${inlineCssBytes(home)} B)`);

  // 링크가 셸 CSS **앞**에 와야 한다. 셸이 마지막 캐스케이드라는 규칙은 이 저장소가
  // 오래 지켜 온 것이고(다크 모드 보호), 순서가 뒤집히면 어느 규칙이 이기는지 바뀐다.
  const budgets = await get("/budgets");
  const uiuxAt = budgets.indexOf(`href="${ASSET}"`);
  const shellAt = budgets.indexOf("accountbook-shell-v22911.css");
  ok(uiuxAt > 0 && shellAt > 0, "두 스타일시트가 모두 링크돼 있다");
  ok(uiuxAt < shellAt, `공유 스타일시트가 셸보다 먼저 온다 (${uiuxAt} < ${shellAt})`);
} finally {
  fixture.restore();
}

// ---------------------------------------------------------------------------
// 4) 패널 기하는 한 규칙에서만 정한다 (개편 2단계)
// ---------------------------------------------------------------------------
// 화면마다 .card/.hero 정의가 흩어져 있었다 — 소스에 177곳, 모서리 22/24/26/28px 이
// 고르게 섞여 있어 어느 하나가 설계값이라고 볼 수 없었다. 다만 **실제로 이기는 값**을
// 재 보니 배경·테두리·모서리·그림자는 셸이 이미 통일하고 있었고, .card 패딩도
// `:is(.card,.panel){padding:20px 22px}` 한 줄이 이미 잡고 있었다. 빠진 것은 .hero
// 뿐이었다. 그래서 두 줄을 하나로 합치고 .hero 를 넣었다.
//
// (여기서 한 번 틀렸다. 처음 쓴 측정 도구가 `:is()` 셀렉터를 콤마로 잘라 버려서
//  .card 가 다섯 가지로 보였고, 이미 통일된 것을 다시 통일하려 했다. 도구가 틀리면
//  진단도 틀린다 — 그래서 이 검사는 서빙된 CSS 문자열을 그대로 확인한다.)
const shellCss = await (await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22911.css`), {}, {})).text();
const PANEL_BASE = "body.abV22812Shell :is(.card,.hero,.panel,.homeCard,.startPanel){padding:20px 22px!important;margin:var(--ab12-sp-3,12px) 0!important}";
const PANEL_NARROW = "@media(max-width:760px){body.abV22812Shell :is(.card,.hero,.panel,.homeCard,.startPanel){padding:var(--ab12-sp-4,16px)!important}}";
eq(shellCss.split(PANEL_BASE).length - 1, 1, "패널 패딩 정본이 셸에 정확히 하나 있다");
eq(shellCss.split(PANEL_NARROW).length - 1, 1, "좁은 화면 값도 같은 규칙이 책임진다");
// 합치기 전의 두 줄짜리 상태로 돌아가지 않는지 본다.
eq(shellCss.split("body.abV22812Shell :is(.card,.panel){padding:").length - 1, 0, "합치기 전의 .card 전용 패딩 줄이 되살아나지 않았다");
// 정본 뒤에서 같은 것을 다시 정하면 정본이 정본이 아니게 된다.
const afterBase = shellCss.slice(shellCss.indexOf(PANEL_BASE) + PANEL_BASE.length);
const rivals = (afterBase.match(/[^{}]*\{[^{}]*\}/g) || []).filter((rule) => {
  const [selector, body = ""] = [rule.slice(0, rule.indexOf("{")), rule.slice(rule.indexOf("{"))];
  return /\.card\b|\.hero\b|\.panel\b/.test(selector) && /padding:/.test(body) && /!important/.test(body);
});
// 남아도 되는 것은 바로 위에서 확인한 좁은 화면 규칙 하나뿐이다.
eq(rivals.length, 1, `정본 뒤에 패딩을 다시 정하는 규칙이 좁은 화면 하나뿐이다 (${rivals.length})`);
// .hero 가 빠지면 이 통일은 뜻이 없다 — 원래 빠져 있던 것이 그것이다.
ok(PANEL_BASE.includes(".hero"), "정본이 .hero 를 포함한다");
// margin 은 셸에 규칙이 **하나도 없어서** 화면별 값이 그대로 이겼다 — 14px 0 이 66곳,
// 12px 0 이 41곳으로 갈려 카드 사이 세로 간격이 화면마다 달랐다. 정본이 margin 도
// 정하는지, 그리고 그 뒤에서 다시 정하는 규칙이 없는지 함께 본다.
ok(PANEL_BASE.includes("margin:"), "정본이 margin 도 정한다");
const marginRules = (shellCss.match(/[^{}]*\{[^{}]*\}/g) || []).filter((rule) => {
  const selector = rule.slice(0, rule.indexOf("{"));
  const body = rule.slice(rule.indexOf("{"));
  return /\.card\b|\.hero\b|\.panel\b/.test(selector) && /margin:/.test(body) && /!important/.test(body);
});
eq(marginRules.length, 1, `패널 margin 을 정하는 셸 규칙이 정확히 하나다 (${marginRules.length})`);
// 배경까지 묶으면 어두운 그라디언트 히어로 30개가 흰 카드가 된다. 기하만 묶는 것이 의도다.
ok(!/:is\(\.card,\.hero,\.panel,\.homeCard,\.startPanel\)\{[^}]*background/.test(shellCss), "정본은 배경을 건드리지 않는다(그라디언트 히어로 보존)");
ok(shellCss.includes("linear-gradient"), "그라디언트 히어로 스타일이 살아 있다");

// ---------------------------------------------------------------------------
// 5) 화면 전환 (개편 4단계)
// ---------------------------------------------------------------------------
// 이 앱은 링크로 도는 MPA 라 월 전환·탭 전환이 전부 전체 페이지 로드다. 그래서 누를
// 때마다 화면이 하얗게 깜빡였고, 실기기에서 "밋밋하다"고 지적된 것의 절반이 그것이었다.
// @view-transition 은 그 깜빡임만 없애고, 지원하지 않는 브라우저는 at-rule 을 무시해
// 지금과 완전히 같게 동작한다 — 그래서 폴백도 자바스크립트도 없다.
eq(shellCss.split("@view-transition{navigation:auto}").length - 1, 1, "문서 간 전환이 셸에 한 번 선언돼 있다");
ok(/@media\(prefers-reduced-motion:reduce\)\{[^}]*::view-transition-group\(\*\)/.test(shellCss.replace(/\s+/g, "")), "동작 줄이기를 켜면 전환 애니메이션을 걷어낸다");

// 이름이 이 방식의 전제다. view-transition-name 은 **문서 안에서 유일**해야 하고,
// 중복되면 브라우저가 전환을 통째로 취소한다 — 조용히 아무 일도 안 일어난다.
// 그래서 이름을 준 요소가 화면마다 한 번만 나오는지 직접 센다.
const NAMED = [["abLayoutNav", /class="[^"]*\babLayoutNav\b/g], ["abNavBottom", /class="[^"]*\babNavBottom\b/g], ["appTop", /class="[^"]*\bappTop\b/g]];
for (const [cls] of NAMED) ok(shellCss.includes(`.${cls}{view-transition-name:`), `.${cls} 에 전환 이름이 있다`);
// 이름이 겹치는 길은 둘이다. (1) 같은 클래스가 한 문서에 두 번 나온다 — 아래에서 센다.
// (2) **서로 다른 셀렉터가 같은 이름을 쓴다** — 이쪽이 더 흔한 실수인데, 처음 쓴 검사는
// (1)만 보고 있어서 .abNavBody 에 abNav 를 또 준 실패 사례를 놓쳤다. 둘 다 본다.
const assigned = [...shellCss.matchAll(/([^{}]+)\{[^{}]*view-transition-name:([a-zA-Z][\w-]*)/g)]
  .map((match) => [match[2], match[1].replace(/\s+/g, " ").trim()]);
ok(assigned.length >= NAMED.length, `전환 이름이 실제로 배정돼 있다 (${assigned.length}개)`);
const byName = new Map();
for (const [name, selector] of assigned) byName.set(name, [...(byName.get(name) || []), selector]);
for (const [name, selectors] of byName) {
  eq(selectors.length, 1, `전환 이름 ${name} 을 쓰는 셀렉터가 하나다${selectors.length > 1 ? ` — 겹침: ${selectors.join(" / ")}` : ""}`);
}
const nameFixture = await createV2265QaFixture();
try {
  for (const path of ["/app", "/app?tab=transactions", "/budgets", "/my/analysis", "/menu", "/receipts", "/my/settings"]) {
    const url = `${ORIGIN}${path}${path.includes("?") ? "&" : "?"}month=2026-07&household_id=house-home`;
    const response = await app.fetch(new Request(url, { headers: { cookie: nameFixture.cookie, "user-agent": "Mozilla/5.0" } }), nameFixture.env, {});
    eq(response.status, 200, `${path} 가 렌더된다(전환 이름 확인)`);
    const html = await response.text();
    for (const [cls, pattern] of NAMED) {
      const count = (html.match(pattern) || []).length;
      ok(count <= 1, `${path} 의 .${cls} 가 문서에 한 번만 있다 (${count})`);
    }
  }
} finally {
  nameFixture.restore();
}
// 전환을 넣자고 스크립트를 늘리지 않았다는 것도 함께 본다 — 이게 이 단계의 값이다.
ok(!source.includes("startViewTransition"), "전환에 자바스크립트를 쓰지 않는다");

console.log(`V22.9.1 공유 스타일시트 검사 통과 (${checks} checks)`);
