import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.78-DRAFT-PERSISTENCE"'), "runtime exposes the contrast release");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22874.css"'), "changed shell uses a new immutable path");

// 1. 연간 리포트: 연도 이동 버튼이 흰 배경에 흰 글자로 사라졌다.
ok(source.includes("body.abV22812Shell .yearNav :is(a,span){background:var(--card-2)!important;color:var(--text)!important}"), "year navigation uses theme tokens");
ok(source.includes("body.abV22812Shell .yearNav :is(a.disabled,span.disabled){color:var(--sub)!important;opacity:1!important}"), "disabled year navigation stays legible");
// 2. 연간 리포트: 연말정산 참고 상자가 다크에서 흰 배경에 흰 글자였다.
ok(source.includes("body.abV22812Shell .deductBox{background:var(--card-2)!important"), "deduction boxes follow the theme surface");
ok(source.includes("body.abV22812Shell .deductBox small{color:var(--sub)!important}"), "deduction captions follow the theme");
// 3. 표면색으로 바뀐 히어로의 안내 문구.
ok(source.includes("body.abV22812Shell :is(.hero,.abV5RemainingHeader) :is(p,small,.note,.muted,.heroLabel,.heroDelta){color:var(--sub)!important}"), "hero body copy follows the theme");
ok(source.includes("body.abV22812Shell.abPageAssets .hero :is(p,.heroLabel,.heroDelta,.note){color:var(--sub)!important}"), "assets hero copy matches the competing rule specificity");
ok(source.includes("body.abV22812Shell.abPageAssets .heroChips span{background:var(--card-2)!important"), "assets hero chips follow the theme");
// 4. 어두운 챌린지 카드 위의 폼 라벨.
ok(source.includes("body.abV22812Shell .reportChallenge :is(label,label>span,summary){color:#d7dbee!important}"), "challenge form labels stay light on the dark card");
// 5. 일자별 셀과 증감 배지.
ok(source.includes("body.abV22812Shell .dailyCell.noValue{opacity:.78!important}"), "empty day cells are no longer dimmed below the threshold");
ok(source.includes("body.abV22812Shell .dailyCell.hasValue span{color:var(--accent)!important}"), "day cell amounts use an accessible accent");
ok(source.includes("body.abV22812Shell :is(.deltaDown,.deltaUp){color:var(--pos)!important}"), "positive delta badges use the accessible token");
ok(source.includes("body.abV22812Shell .deltaUp{color:var(--neg)!important}"), "negative delta badges use the accessible token");
// 자체 배경을 가진 배지를 히어로 규칙이 덮으면 안 된다.
ok(!source.includes("body.abV22812Shell :is(.abV5RemainingHeader,.abPageAssets .hero) :is(h1,h2,h3,b,strong,span)"), "hero rules no longer blanket-override chips and badges");

// 대비 계산은 검증 안에서도 같은 공식을 쓴다.
const luminance = ({ r, g, b }) => {
  const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
};
const contrast = (a, b) => {
  const hi = Math.max(luminance(a), luminance(b));
  const lo = Math.min(luminance(a), luminance(b));
  return (hi + 0.05) / (lo + 0.05);
};
const hex = (value) => {
  let body = value.replace("#", "");
  if (body.length === 3) body = body.split("").map((c) => c + c).join("");
  return { r: parseInt(body.slice(0, 2), 16), g: parseInt(body.slice(2, 4), 16), b: parseInt(body.slice(4, 6), 16) };
};

// 셸이 쓰는 토큰 조합이 실제로 4.5:1을 넘는지 값으로 확인한다.
const LIGHT = { text: "#191f28", sub: "#5f6b7a", surface: "#fff", raised: "#f4f6f8", accent: "#1d4ed8" };
const DARK = { text: "#edeff3", sub: "#b3bdc9", surface: "#1e2026", raised: "#282b33", accent: "#93c5fd" };
for (const [name, t] of [["light", LIGHT], ["dark", DARK]]) {
  for (const [label, fg, bg] of [
    [`${name} 본문/표면`, t.text, t.surface],
    [`${name} 본문/보조표면`, t.text, t.raised],
    [`${name} 보조/표면`, t.sub, t.surface],
    [`${name} 보조/보조표면`, t.sub, t.raised],
    [`${name} 강조/보조표면`, t.accent, t.raised],
  ]) {
    const value = contrast(hex(fg), hex(bg));
    ok(value >= 4.5, `${label} 대비가 4.5:1 이상 (${Math.round(value * 100) / 100}:1)`);
  }
}
// 챌린지 카드는 항상 어두운 표면이므로 고정 라벨색이 기준을 넘어야 한다.
ok(contrast(hex("#d7dbee"), hex("#212640")) >= 4.5, "challenge label colour clears 4.5:1 on the dark card");

async function request(fixture, path) {
  const response = await app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { headers: { cookie: fixture.cookie, "user-agent": "Mozilla/5.0" } }), fixture.env, {});
  return { response, text: await response.text() };
}

const fixture = await createV2265QaFixture();
try {
  const beforeTransactions = fixture.db.transactions.length;

  const shell = await request(fixture, "/assets/accountbook-shell-v22874.css");
  eq(shell.response.status, 200, "new shell asset is served");
  eq(shell.response.headers.get("etag"), '"accountbook-shell-v22874-css"', "new shell ETag is correct");
  for (const rule of [".yearNav :is(a,span)", ".deductBox{background:var(--card-2)", ".reportChallenge :is(label,label>span,summary)", ".dailyCell.noValue{opacity:.78", ".heroChips span"]) {
    ok(shell.text.includes(rule), `deployed shell ships ${rule}`);
  }
  ok(shell.text.includes("--action:var(--ab12-action)"), "V22.8.61 token aliases are preserved");
  ok(shell.text.includes(".chipRow button:before{content:var(--ab-chip-icon"), "V22.8.61 chip icons are preserved");
  ok(shell.text.includes("scroll-padding-top:calc(64px + env(safe-area-inset-top,0px))"), "V22.8.62 anchor offset is preserved");

  const q = "month=2026-07&household_id=house-home";
  for (const [name, path] of [["연간 리포트", "/annual?year=2026&household_id=house-home"], ["자산·계좌", `/payment-methods?${q}`], ["종합 리포트", `/my/analysis?${q}&view=report`], ["스마트 도구", `/smart-tools?${q}`]]) {
    const page = await request(fixture, path);
    eq(page.response.status, 200, `${name} 화면이 200으로 응답한다`);
    eq(page.text.split('href="/assets/accountbook-shell-v22874.css"').length - 1, 1, `${name} 화면이 새 셸을 정확히 한 번 참조한다`);
    ok(!page.text.includes("accountbook-shell-v22862.css"), `${name} 화면에 이전 셸이 남아 있지 않다`);
  }

  eq(fixture.db.transactions.length, beforeTransactions, "대비 보정은 거래 데이터를 바꾸지 않는다");
} finally {
  fixture.restore();
}

console.log(`PASS: V22.8.65 theme text contrast (${checks} checks)`);
