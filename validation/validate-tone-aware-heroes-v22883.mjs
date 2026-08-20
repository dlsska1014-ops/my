import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(/const APP_VERSION = "V\d+\.\d+\.\d+[-A-Z0-9]*"/.test(source), "runtime exposes the V22.8.83 release");

// ---------------------------------------------------------------------------
// 1. 히어로 그라디언트 62곳이 컬러톤을 따라간다
//   V22.8.82 는 눈에 띄던 3곳만 옮겼다. 같은 종류의 리터럴이 62개 더 있어서
//   통계·저축·영수증 탭으로 넘어가면 톤과 어긋난 청록·보라 히어로가 그대로 떴다.
// ---------------------------------------------------------------------------

const heroLiteral = /\.hero\{[^}]*linear-gradient\(135deg,#111827,#[0-9a-fA-F]{6}\)/g;
eq((source.match(heroLiteral) || []).length, 0, "no hero gradient pins its accent colour any more");

const heroToken = /linear-gradient\(135deg,#111827,var\(--ab12-action,(#[0-9a-fA-F]{6})\)\)/g;
const heroFallbacks = [...source.matchAll(heroToken)].map((m) => m[1]);
eq(heroFallbacks.length, 65, "every hero gradient reads the tone token (62 swept + 3 from V22.8.82)");

// 폴백은 원래 색이어야 한다. 셸 밖(--ab12-* 미정의)에서는 예전과 똑같이 보인다.
ok(heroFallbacks.includes("#0f766e"), "the teal heroes keep teal as their fallback");
ok(heroFallbacks.includes("#7c3aed"), "the violet heroes keep violet as their fallback");
ok(heroFallbacks.includes("#b45309"), "the amber heroes keep amber as their fallback");
eq(new Set(heroFallbacks).size, 19, "all nineteen original hero colours survive as fallbacks");

// ---------------------------------------------------------------------------
// 2. 왜 --ab12-brand 가 아니라 --ab12-action 인가
//   히어로는 흰 글자를 이고 있다. brand 는 8개 톤·테마 조합 중 5개에서 흰 글자
//   4.5:1 을 못 넘긴다(최저 2.91). action 은 white-text 전용 대비 안전 토큰이다.
// ---------------------------------------------------------------------------

const luminance = (hex) => {
  const channels = hex.slice(1).match(/../g).map((v) => Number.parseInt(v, 16) / 255);
  const linear = channels.map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
};
const contrast = (a, b) => {
  const x = luminance(a);
  const y = luminance(b);
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
};

// 셸이 실제로 선언한 값을 읽어 온다(검사에 값을 다시 적으면 서로 어긋난다).
const actionValues = [...source.matchAll(/--ab12-action:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]);
eq(new Set(actionValues).size >= 4, true, "every tone declares its own action colour");
for (const value of new Set(actionValues)) {
  ok(contrast("#ffffff", value) >= 4.5, `white hero copy clears 4.5:1 on ${value} (${contrast("#ffffff", value).toFixed(2)})`);
}
// brand 를 쓰면 왜 안 되는지도 함께 못박는다. 이 검사가 깨지는 날 = brand 가
// 밝아져 히어로에 써도 되게 된 날이므로 그때 다시 판단하면 된다.
const brandValues = [...new Set([...source.matchAll(/--ab12-brand:(#[0-9a-fA-F]{6})/g)].map((m) => m[1]))];
const brandFailures = brandValues.filter((value) => contrast("#ffffff", value) < 4.5);
ok(brandFailures.length > 0, `--ab12-brand still fails white-text contrast somewhere (${brandFailures.join(", ")}), so heroes must not use it`);
eq((source.match(/linear-gradient\(135deg,#111827,var\(--ab12-brand,/g) || []).length, 0, "no hero gradient reads the non-contrast-safe brand token");

// ---------------------------------------------------------------------------
// 3. 브랜드·장식 그라디언트는 건드리지 않는다
//   카카오 노랑은 브랜드 색이고, 배지·썸네일·테마 색은 톤과 무관하다.
// ---------------------------------------------------------------------------

for (const [gradient, why] of [
  ["linear-gradient(135deg,#FEE500,#ffd84d)", "the Kakao brand yellow"],
  ["linear-gradient(135deg,#111827,#eab308)", "the named taxi theme"],
  ["linear-gradient(135deg,#db2777,#f97316)", "a decorative badge"],
  ["linear-gradient(135deg,#0b1739,#153878)", "the kakao command guide hero"],
]) {
  ok(source.includes(gradient), `${why} is left alone`);
}
// #334155(슬레이트)는 히어로 한 곳 말고는 내비 활성·썸네일 장식이라 그대로 둔다.
ok(source.includes("linear-gradient(135deg,#111827,#334155)"), "the slate decorations are left alone");

// ---------------------------------------------------------------------------
// 4. 셸 CSS 는 바뀌지 않았다 → 자산 주소를 올릴 필요가 없다
//   히어로는 전부 페이지 인라인 CSS 에 있다. 셸이 바뀌었는데 주소를 안 올리면
//   immutable 1년 캐시 때문에 사용자에게 영영 반영되지 않는다.
// ---------------------------------------------------------------------------

ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22914.css"'), "the shell stylesheet path is unchanged because its content is unchanged");
eq(/\.hero\{[^}]*linear-gradient\(135deg,#111827,#[0-9a-fA-F]{6}\)/.test(source), false, "the swept literals are gone from the shell too");

// ---------------------------------------------------------------------------
// 실제 렌더
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  headers: { cookie: fixture.cookie },
}), fixture.env, {});
const hh = "month=2026-07&household_id=house-home";

// 사용자가 실제로 도는 화면에서 톤이 닿는지 본다.
// 소스만 보면 이 화면이 셸 클래스를 다는지 알 수 없어 놓친다.
for (const [name, path, fallback] of [
  ["저축·목표", `/goals?${hh}`, "#0f766e"],
  ["정산 요약", `/settlement-summary?${hh}`, "#0f766e"],
  ["정기 수입·지출", `/reserve-plans?${hh}`, "#b45309"],
  ["예산 알림", `/budget-alerts?${hh}`, "#b45309"],
  ["단톡방 연결", `/my/groups?${hh}`, "#2563eb"],
  ["연간 리포트", "/annual?year=2026&household_id=house-home", "#1d4ed8"],
  ["스마트 도구", `/smart-tools?${hh}`, "#0f766e"],
]) {
  const res = await get(path);
  eq(res.status, 200, `${name} renders`);
  const html = await res.text();
  ok(html.includes(`linear-gradient(135deg,#111827,var(--ab12-action,${fallback}))`), `${name} ships a tone-aware hero`);
  ok(html.includes("abV22812Shell"), `${name} carries the shell that defines the tone tokens`);
  eq(html.includes(`linear-gradient(135deg,#111827,${fallback});`), false, `${name} no longer pins its hero colour`);
}

// 셸 CSS 는 정말로 그대로다(내용이 같으면 주소를 올리지 않는 것이 맞다).
const shellRes = await get("/assets/accountbook-shell-v22914.css");
eq(shellRes.status, 200, "the shell stylesheet is still served at its current address");
const shellCss = await shellRes.text();
eq(/\.hero\{[^}]*linear-gradient\(135deg,#111827,#[0-9a-fA-F]{6}\)/.test(shellCss), false, "the shipped shell has no pinned hero colour either");

// V22.8.82 의 계약도 그대로 살아 있어야 한다(같은 파일을 다시 쓸었으므로 확인한다).
ok(shellCss.includes("--ab12-warn-bg:#49351a;--ab12-warn-text:#fcd34d;--ab12-warn-line:#765b26"), "the warning tokens survive the sweep");
ok(shellCss.includes('body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important'), "the reserve emphasis rule survives the sweep");

console.log(`PASS: V22.8.83 tone-aware heroes (${checks} checks)`);
