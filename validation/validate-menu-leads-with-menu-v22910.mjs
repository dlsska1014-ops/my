// V22.9.10 — "전체 메뉴"를 누르면 메뉴가 보인다.
//
// 브라우저로 열어 재 보니 /menu 의 첫 화면(390×844)에 **메뉴 링크가 0개**였다.
// 22개 링크 중 첫 번째가 949px 지점에서 시작했다. 그 위를 채우고 있던 것:
//
//   header.menuHeader        248px  (제목 + 설명문 + 가계부·월 고르기 + 기준 변경)
//   nav.menuJourney           70px  (처음 사용 3단계)
//   section.abAppearancePanel 543px (화면 설정 — 라이트/다크와 컬러톤 고르기)
//
// 가장 큰 것이 화면 설정이었다. 한 번 정하고 마는 설정이 메뉴 화면에서 가장 목 좋은
// 자리를 543px 차지하고 있었다. 지우지 않고 순서만 바꿨다 — 메뉴가 먼저, 설정은 끝.
//
// ── 이 검사가 보는 것 ──
// 링크 개수나 특정 문구가 아니라 **첫 화면에 메뉴가 실제로 보이는가**를 본다.
// 그래서 나중에 누가 다른 블록을 메뉴 위에 새로 얹어도 여기서 걸린다.
// 렌더 위치를 알아야 하므로 브라우저 없이 재려면 마크업 순서로 본다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";

const fixture = await createV2265QaFixture();
try {
  const response = await app.fetch(new Request(`${ORIGIN}/menu?month=2026-07&household_id=house-home`,
    { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {});
  eq(response.status, 200, "전체 메뉴가 열린다");
  const html = await response.text();
  // <main> 의 속성은 후처리기가 덧붙인다(id·tabindex). 여는 태그를 문자열로 박아 두면
  // 그 후처리가 바뀔 때 검사가 조용히 빈 문자열을 보게 된다 — 실제로 한 번 그랬다.
  const mainStart = html.search(/<main\b[^>]*class="[^"]*menuPage/);
  const main = mainStart < 0 ? "" : html.slice(mainStart, html.indexOf("</main>", mainStart));
  ok(main.length > 500, "메뉴 본문을 찾았다");

  // 1) 메뉴가 설정보다 **먼저** 온다
  const firstLink = main.indexOf('<a class="featuredCard"');
  const appearance = main.indexOf('class="abAppearancePanel"');
  const journey = main.indexOf('class="menuJourney"');
  ok(firstLink > 0, "메뉴 링크가 있다");
  ok(appearance > 0, "화면 설정도 여전히 메뉴 화면에 있다(지운 게 아니라 내렸다)");
  // 첫 링크 하나와만 견주면 약하다 — 설정을 두 번째 묶음 위로 올려도 통과한다.
  // 실제로 그렇게 넣어 보고 알았다. **마지막 메뉴 링크보다도 뒤**인지를 본다.
  const lastLink = main.lastIndexOf('<a class="menuRow"');
  ok(lastLink > firstLink, "메뉴 링크가 여러 개다");
  ok(lastLink < appearance, `화면 설정이 모든 메뉴 링크보다 뒤에 온다 (마지막 링크 ${lastLink} · 설정 ${appearance})`);
  ok(journey > 0 && lastLink < journey, `처음 사용 3단계도 메뉴 뒤에 온다 (3단계 ${journey})`);

  // 2) 메뉴 위에 쌓인 것이 머리말 하나뿐이다
  const beforeMenu = main.slice(0, firstLink);
  eq((beforeMenu.match(/<section\b/g) || []).length, 1, "메뉴 앞에 오는 <section> 은 하나뿐이다(머리말 묶음)");
  ok(!beforeMenu.includes("abAppearancePanel"), "메뉴 앞에 화면 설정이 없다");
  ok(!beforeMenu.includes("menuJourney"), "메뉴 앞에 처음 사용 3단계가 없다");
  ok(!/<p>자주 쓰는 기능은 크게/.test(beforeMenu), "머리말의 설명 문장은 걷어냈다");

  // 3) 목적지가 하나도 사라지지 않았다
  const links = [...main.matchAll(/<a class="(?:menuRow|featuredCard)" href="([^"]+)"/g)].map((m) => m[1]);
  eq(links.length, 22, `메뉴 목적지 22개가 그대로다 (${links.length}개)`);
  eq(new Set(links).size, links.length, "같은 목적지를 두 번 싣지 않는다");

  // 4) 아이콘이 글자가 아니라 그림이다
  //    유니코드 글리프(✎ ▤ ↔ ◴ ▣ …)를 아이콘으로 쓰면 폰트마다 굵기·크기·세로 정렬이
  //    달라 줄이 안 맞는다. 사이드바가 이미 쓰는 SVG 세트를 같이 쓴다.
  const iconSlots = [...main.matchAll(/class="(?:menuRowIcon|featuredIcon)"[^>]*/g)].map((m) => m[0]);
  eq(iconSlots.length, 22, `아이콘 자리가 22개다 (${iconSlots.length}개)`);
  eq(iconSlots.filter((slot) => slot.includes("data-ab-nav-icon=")).length, 22, "아이콘 자리가 전부 공용 SVG 이름을 가리킨다");
  for (const glyph of ["✎", "▤", "↔", "◴", "▣", "↻", "⇄", "⌁", "◇", "⇩"]) {
    ok(!main.includes(`aria-hidden="true">${glyph}<`), `글리프 아이콘 "${glyph}" 가 남아 있지 않다`);
  }
  // 이름이 실제로 그려질 수 있는 것들인지 — 내비 런타임이 아는 이름이어야 한다.
  const runtime = await (await app.fetch(new Request(`${ORIGIN}/assets/accountbook-nav-v22893.js`), {}, {})).text();
  const used = [...new Set([...main.matchAll(/data-ab-nav-icon="([^"]+)"/g)].map((m) => m[1]))];
  ok(used.length >= 15, `쓰는 아이콘 종류가 충분하다 (${used.length}종)`);
  for (const name of used) ok(new RegExp(`\\b${name}:\\s*'`).test(runtime), `내비 런타임이 "${name}" 아이콘을 그릴 줄 안다`);
  ok(main.includes('data-ab-nav-icon') && html.includes("accountbook-nav-v22893.js"), "그 SVG 를 그리는 런타임이 이 화면에 실려 있다");

  // 5) 기준 변경은 조용한 보조 버튼이다
  ok(source.includes('body.abV22812Shell.abPageMenu main.menuPage form.menuContext button[type="submit"]{grid-column:auto!important;background:var(--ab12-surface)!important'),
    "기준 변경은 면 색이 아니라 테두리로 그린다");
  ok(source.includes("body.abV22812Shell.abPageMenu .menuContext{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto!important"),
    "가계부·월·기준 변경이 한 줄에 놓인다");
} finally {
  fixture.restore();
}

console.log(`V22.9.10 전체 메뉴 구성 검사 통과 (${checks} checks)`);
