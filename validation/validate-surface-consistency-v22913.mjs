// V22.9.13 — 같은 것은 같게 그린다.
//
// 화면 열한 개를 띄워 카드 면을 재 보니, 배경과 테두리는 이미 통일돼 있었다 —
// 전부 흰 배경에 같은 테두리색이다. 갈려 있던 것은 셋이었다:
//
//   1) 모서리  같은 .card 가 화면에 따라 20 / 18 / 16px 로 그려졌다.
//      원인은 **같은 것을 정하는 토큰이 둘**이었다는 것 — --ab12-radius(20px)와
//      --radius(18px). 거기에 화면별 리터럴 override 가 얹혀 있었다.
//   2) 어두운 강조 면  홈의 챌린지 카드는 그라디언트(#171a2b→#222741),
//      SMART NOTICE 는 단색(#111827). 같은 뜻인데 다른 얼굴이었다.
//   3) 링크 하나  "홈 구성"만 16px·굵기 400·밑줄. 같은 자리의 다른 링크는
//      13px·굵기 1000·밑줄 없음이었다.
//
// ── 이 검사가 보는 것 ──
// 리터럴을 세지 않는다. **정본 토큰 하나에서 값이 나오는가**를 본다. 리터럴을 세면
// 다음 사람이 같은 값을 다른 곳에 또 적어도 통과한다.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

// ---------------------------------------------------------------------------
// 1) 모서리를 정하는 곳이 하나다
// ---------------------------------------------------------------------------
ok(source.includes("--ab11-radius:20px"), "카드 모서리 정본이 있다 (--ab12-radius, 20px)");
ok(source.includes("--radius:var(--ab12-radius,20px)"), "두 번째 토큰(--radius)이 정본을 가리킨다 — 제 값을 갖지 않는다");
// 화면별로 제 값을 적던 네 곳이 정본을 쓰는지.
for (const rule of [
  "body.abV22812Shell .abV5SectionCard{background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:var(--ab12-radius,20px)!important",
  "body.abV22812Shell.abV5RemainingPage .abV5SectionCard{border-radius:var(--ab12-radius,20px)!important}",
  "body.abV22812Shell.abPageInsight :is(.card,.kpi){border-radius:var(--ab12-radius,20px)!important",
  "body.abV22812Shell.abPageAnalysisReport :is(.hero,.card,.box,.gaugeCard){border-radius:var(--ab12-radius,20px)!important",
]) ok(source.includes(rule), `화면별 규칙이 정본을 쓴다: ${rule.slice(0, 62)}…`);

// ---------------------------------------------------------------------------
// 2) 화면에서 실제로 그려지는 모서리가 한 가지다
// ---------------------------------------------------------------------------
// 소스가 아니라 렌더 결과를 본다. 소스에서 토큰을 써도 더 센 규칙이 이기면 소용없다.
const ORIGIN = "https://ttokttok-accountbook.com";
const { createV2265QaFixture } = await import("./qa-fixture.mjs");
const fixture = await createV2265QaFixture();
try {
  // 소스 전체에서 리터럴을 세면 안 된다 — 페이지 CSS 에는 셸이 이미 덮어 버린 죽은
  // 정의가 123곳 있고, 그것들은 화면에 아무 영향이 없다. 그걸 세면 검사가 "지워라"라고
  // 말하게 되는데, 화면이 바뀌지 않는 삭제를 강요하는 검사는 쓸모보다 위험이 크다.
  //
  // 대신 **캐스케이드에서 이기는 층**만 본다. 셸 CSS 는 head 의 마지막 스타일시트라
  // 여기서 정한 값이 화면에 나온다. 그 층 안의 카드 규칙이 토큰을 쓰면 결과가 하나가 된다.
  const shellCss = await (await app.fetch(new Request(`${ORIGIN}/assets/accountbook-shell-v22914.css`), {}, {})).text();
  const shellCardRules = [...shellCss.matchAll(/[^{}]{0,160}\{[^{}]*border-radius:[^{}]*\}/g)]
    .map((m) => m[0])
    .filter((rule) => /\.(card|panel|homeCard|abV5SectionCard|gaugeCard)\b/.test(rule.split("{")[0]));
  ok(shellCardRules.length >= 4, `셸 층에서 카드 모서리를 정하는 규칙을 찾았다 (${shellCardRules.length}개)`);
  const literalInShell = shellCardRules.filter((rule) => /border-radius:\s*\d+px/.test(rule));
  eq(literalInShell.length, 0, `셸 층에는 리터럴 모서리가 없다${literalInShell.length ? " — " + literalInShell[0].slice(0, 100) : ""}`);

  const home = await (await app.fetch(new Request(`${ORIGIN}/app?month=2026-07&household_id=house-home`,
    { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0 (iPhone)" } }), fixture.env, {})).text();
  ok(home.includes('class="reportChallenge"') && home.includes('class="homeNotice"'), "홈에 어두운 블록이 둘 다 있다");
} finally {
  fixture.restore();
}

// ---------------------------------------------------------------------------
// 3) 어두운 강조 면 둘이 같은 얼굴이다
// ---------------------------------------------------------------------------
ok(source.includes('body.abV22812Shell :is(.reportChallenge,.homeNotice){background:var(--ab12-notice-bg,#111827)!important;background-image:none!important'),
  "두 어두운 블록이 같은 색 토큰을 쓴다");
ok(source.includes("border-radius:var(--ab12-radius,20px)!important}\n\n/* ── 3) 카드 머리말 링크"),
  "그 둘의 모서리도 카드 정본을 따른다");

// ---------------------------------------------------------------------------
// 4) 링크 하나만 브라우저 기본처럼 보이지 않는다
// ---------------------------------------------------------------------------
ok(source.includes("body.abV22812Shell .homeReportsEdit{font-size:13px!important;font-weight:800!important;text-decoration:none!important"),
  '"홈 구성"이 같은 자리 다른 링크와 같은 규격이다');
ok(source.includes("body.abV22812Shell .homeReportsEdit:hover{text-decoration:underline!important"),
  "밑줄은 마우스를 올렸을 때만 나온다");

console.log(`V22.9.13 면·링크 일관성 검사 통과 (${checks} checks)`);
