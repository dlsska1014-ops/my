// V22.9.14 — 컴포넌트를 두 화면이 쓰면 그 CSS 도 두 화면에 가야 한다.
//
// 홈의 소비 흐름 "월별" 탭이 이렇게 나왔다:
//
//   수입지출
//   0 02월  0 03월  0 04월  0 05월  0 06월  25만07월
//
// 일별·주별은 멀쩡했다. 마크업도 정상이었다 — 막대(<i>)·금액(<b>)·월(<span>)이 다 있다.
// 문제는 .series* CSS 가 **분석 화면의 인라인 CSS 안에만** 있었다는 것이다. 같은
// 컴포넌트를 그리는 홈은 그 CSS 를 한 번도 받지 못했고, 막대는 크기가 없어 사라지고
// <b>/<span> 은 인라인이라 "25만"과 "07월"이 붙었다. 범례의 "수입지출"도 같은 이유다.
//
// 자동 검사 4,735개가 이걸 하나도 못 잡았다. 마크업이 있는지는 봤지만 **그 마크업을
// 그릴 CSS 가 그 화면에 도착했는지**는 아무도 안 봤다.
//
// 같은 커밋에서 하나 더 잡았다: 컬러톤을 그린으로 바꿔도 "기록 저장"이 파랗게 남았다.
// 토큰은 톤을 따라가는데(--ab-blue=#047857) 버튼은 네 톤 모두 #2457d6 으로 그려졌다.
// V22.9.0 에서 이걸 고쳤다고 적었지만, 그때 확인한 것은 토큰이지 렌더된 버튼이 아니었다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

const shellCss = await (await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22914.css`), {}, {})).text();

// ---------------------------------------------------------------------------
// 1) 월별 그래프의 CSS 가 공용 자산에 있다
// ---------------------------------------------------------------------------
for (const rule of [".seriesChart{", ".seriesCol{", ".seriesBars{", ".seriesLegend{"]) {
  ok(shellCss.includes(rule), `월별 그래프 규칙이 공용 셸에 있다 (${rule})`);
}
// 라벨이 붙어 보이던 직접 원인: <b> 와 <span> 이 각자 줄을 갖지 못했다.
ok(shellCss.includes("body.abV22812Shell .seriesCol{display:grid;justify-items:center"),
  "금액과 월이 각자 칸을 갖는다 — 이것이 없으면 \"25만07월\"로 붙는다");
// 범례가 "수입지출"로 붙던 직접 원인: 색 네모가 크기 0 이었다.
ok(shellCss.includes("body.abV22812Shell .seriesLegend i{display:inline-block;width:10px;height:10px"),
  "범례 색 네모에 크기가 있다 — 이것이 없으면 \"수입지출\"로 붙는다");
ok(shellCss.includes("body.abV22812Shell .seriesBars i{display:inline-block;width:15px"),
  "막대에 폭이 있다 — 이것이 없으면 그래프가 통째로 사라진다");

// 계열 색은 상태 색도 강조 색도 아니어야 한다.
ok(!/i\.in\{background:var\(--ab12-(up|down)/.test(shellCss), "수입 막대에 상태 색을 쓰지 않는다(늘었다/줄었다는 뜻이 섞인다)");
ok(!/i\.(in|ex)\{background:var\(--ab12-action/.test(shellCss), "계열 색이 톤을 따라가지 않는다(그린 톤에서 둘 다 초록이 된다)");

// ---------------------------------------------------------------------------
// 2) 그 컴포넌트를 쓰는 두 화면이 모두 그 CSS 를 받는다
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
try {
  const get = async (path) => (await app.fetch(new Request(`${ORIGIN}${path}`,
    { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {})).text();

  for (const [name, path] of [["홈(월별 탭)", "/app?month=2026-07&household_id=house-home&trend=monthly"],
                              ["분석", "/my/analysis?month=2026-07&household_id=house-home"]]) {
    const html = await get(path);
    if (!html.includes("seriesChart")) { ok(true, `${name}: 이 화면은 월별 그래프를 그리지 않는다`); continue; }
    // 마크업이 있으면 그 CSS 를 실어 오는 스타일시트도 링크돼 있어야 한다.
    const links = [...html.matchAll(/<link rel="stylesheet" href="([^"]+)"/g)].map((m) => m[1]);
    let styled = /\.seriesChart\{/.test(html);
    for (const href of links) {
      if (styled) break;
      styled = /\.seriesChart\{/.test(await (await app.fetch(new Request(`${ORIGIN}${href}`), {}, {})).text());
    }
    ok(styled, `${name}: 월별 그래프 마크업이 있으면 그 CSS 도 도착한다`);
  }
} finally {
  fixture.restore();
}

// ---------------------------------------------------------------------------
// 3) 주 버튼이 컬러톤을 따라간다
// ---------------------------------------------------------------------------
// 리터럴이 하나라도 규칙 자리에 남으면 그 화면만 파랗게 남는다.
const literalRules = [...source.matchAll(/(?:background|background-color|border-color|color)\s*:\s*#2457d6/g)];
eq(literalRules.length, 0, `주 색을 리터럴로 칠하는 규칙이 없다 (${literalRules.length}곳)`);
ok(source.includes("var(--ab12-action,#2457d6)"), "그 자리들이 톤 토큰을 쓰고 폴백으로만 옛 값을 남긴다");
// 토큰 자체는 톤에 따라 바뀌어야 한다 — 고정값이면 위 치환이 의미가 없다.
for (const tone of ["emerald", "violet", "amber"]) {
  ok(new RegExp(`data-ab-tone="${tone}"[^{]*\\{[^}]*--ab12-action:`).test(source)
     || new RegExp(`--ab12-action:[^;}]+`).test(source), `${tone} 톤에도 --ab12-action 이 정의된다`);
}

console.log(`V22.9.14 컴포넌트 CSS 전달 검사 통과 (${checks} checks)`);
