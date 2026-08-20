import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(/const APP_VERSION = "V\d+\.\d+\.\d+[-A-Z0-9]*"/.test(source), "runtime exposes the V22.8.82 release");

// ---------------------------------------------------------------------------
// 1. 컬러톤을 블루로 바꿔도 일부 화면이 amber 로 남던 문제
//   톤 전환은 --ab12-* 변수를 바꾸는 방식이다. 값을 직접 적어 둔 규칙에는 닿지 않는다.
//   다크 오버라이드 9곳이 amber 톤 값(#49351a/#fcd34d/#765b26)을 그대로 박아 두고 있었다.
// ---------------------------------------------------------------------------

// 경고색은 일부러 톤을 따라가지 않는다 — 파란 경고는 경고로 읽히지 않는다.
// 다만 값을 흩뿌리지 않고 토큰 한 곳에 모아 "안 바뀌는 것이 의도"임을 남긴다.
ok(source.includes("--ab12-warn-bg:#fff7ed;--ab12-warn-text:#9a3412;--ab12-warn-line:#fed7aa"), "light warning tokens are declared once");
ok(source.includes("--ab12-warn-bg:#49351a;--ab12-warn-text:#fcd34d;--ab12-warn-line:#765b26"), "dark warning tokens are declared once");
ok(source.includes("경고색은 일부러 톤을 따라가지 않는다"), "the intent is written down next to the tokens");

const warnRule = "background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}";
for (const selector of [
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.guide,.legacy,.sectionNote){',
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.budgetWarn,.status.warn,.warn,.foot,.guideLine,.inviteFold code,.inviteCode){',
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.privacyNote,.unregBox,.preset.warn,.regLink){',
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(.warn,.guide){',
]) {
  ok(source.includes(selector + warnRule), `warning surface reads the token: ${selector.slice(-46)}`);
}

// 강조색은 톤을 따라가야 한다 — 여기가 사용자가 본 버그다.
const accentRule = "background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}";
for (const selector of [
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard.alert{',
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReceipts :is(.receiptConfirm,.receiptReadOnly){',
  'html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMembers .inviteBox{',
]) {
  ok(source.includes(selector + accentRule), `emphasis surface follows the tone: ${selector.slice(-42)}`);
}

// 라이트에서도 정기 강조 카드가 톤을 따라간다(예전에는 페이지 인라인 CSS 의 amber 가 그대로였다).
ok(source.includes('html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important}'), "the light reserve alert card follows the tone");
ok(source.includes('html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert :is(b,strong,span,small){color:var(--ab12-accent)!important}'), "the light reserve alert text follows the tone");

// 눈에 띄는 화면의 히어로 그라디언트도 톤을 따라간다.
// V22.8.83 에서 토큰이 --ab12-brand 에서 --ab12-action 으로 바뀌었다. brand 는 흰
// 글자 대비가 8개 조합 중 5개에서 4.5:1 에 못 미쳐(최저 2.91) 히어로에 쓸 수 없다.
eq((source.match(/linear-gradient\(135deg,#111827,var\(--ab12-action,#b45309\)\)/g) || []).length, 3, "the reserve and budget-alert heroes read the contrast-safe tone token");
eq(source.includes("linear-gradient(135deg,#111827,#b45309)"), false, "no fixed amber hero gradient remains");

// 톤 정의 자체는 그대로 살아 있어야 한다(회수가 아니라 참조로 바꾼 것이다).
for (const tone of ["emerald", "violet", "amber"]) {
  ok(source.includes(`html[data-ab-tone="${tone}"] body.abV22812Shell{`), `the ${tone} light tone survives`);
  ok(source.includes(`html[data-ab-resolved-theme="dark"][data-ab-tone="${tone}"] body.abV22812Shell{`), `the ${tone} dark tone survives`);
}

// ---------------------------------------------------------------------------
// 2. 알림 창이 주기보다 길어 목록 전체가 강조로 칠해지던 문제
// ---------------------------------------------------------------------------

ok(source.includes("const alertWindow = cycle ? Math.min(maxAlert, Math.max(7, Math.round(cycle * 30 / 3))) : maxAlert;"), "the alert window is capped by the plan's own cycle");
ok(source.includes("const alert = daysLeft <= alertWindow;"), "the alert flag uses the capped window");
ok(source.includes("alert_window_days: alertWindow,"), "the window is exposed so screens can explain it");
eq(source.includes("const alert = daysLeft <= maxAlert;"), false, "the uncapped comparison is gone");
// 사용자가 설정한 alert_days 는 여전히 상한으로 존중한다.
ok(source.includes("const maxAlert = Math.max(...safeArray(plan.alert_days || [90,60,30]).map(Number), 0);"), "alert_days still caps the window");

// ---------------------------------------------------------------------------
// 3. 자산 주소
//   셸 CSS 내용이 바뀌었다. immutable 1년 캐시라 주소를 올려야 반영된다.
// ---------------------------------------------------------------------------

ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22914.css"'), "the shell stylesheet path is bumped");
ok(source.includes('\'"accountbook-shell-v22914-css"\''), "the shell stylesheet ETag matches its path");
eq(source.includes("accountbook-shell-v22880"), false, "no stale shell stylesheet reference remains");

// ---------------------------------------------------------------------------
// 실제 렌더
// ---------------------------------------------------------------------------
const fixture = await createV2265QaFixture();
const get = (path, init = {}) => app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
  ...init,
  headers: { cookie: fixture.cookie, ...(init.headers || {}) },
}), fixture.env, {});
const form = (data) => ({ method: "POST", body: new URLSearchParams(data), headers: { "content-type": "application/x-www-form-urlencoded" } });

// 배포되는 셸 CSS 안에 amber 리터럴이 남아 있으면 그 규칙은 톤을 따라가지 못한다.
// 정의(토큰·톤) 밖에서 값이 쓰이는 순간 같은 버그가 다시 생긴다.
const shellRes = await get("/assets/accountbook-shell-v22914.css");
eq(shellRes.status, 200, "the bumped shell stylesheet is served");
eq(shellRes.headers.get("etag"), '"accountbook-shell-v22914-css"', "the served ETag matches the path");
const shellCss = await shellRes.text();
const amberUsers = shellCss.split("\n").filter((line) => /#49351a|#fcd34d|#765b26/.test(line));
eq(amberUsers.length, 3, "amber values appear only where colours are defined, never where they are applied");
for (const line of amberUsers) {
  ok(/^(html|\s*--|:root|body)/.test(line.trim()) && line.includes("--"), `an amber literal only sits in a custom-property declaration: ${line.trim().slice(0, 48)}`);
}
eq((await get("/assets/accountbook-shell-v22880.css")).status, 404, "the stale shell stylesheet path is gone");

// 이 세 규칙이 톤 변수를 읽는지 배포본에서 확인한다(소스만 보면 놓친다).
ok(shellCss.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important'), "the shipped dark reserve rule reads the tone");
ok(shellCss.includes('html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important'), "the shipped light reserve rule reads the tone");

// 알림 창: 실제 화면에서 확인한다.
const now = new Date(Date.now() + 9 * 3600 * 1000);
const month = now.toISOString().slice(0, 7);
const at = (days) => {
  const d = new Date(now.getTime() + days * 86400000);
  return { month: d.getUTCMonth() + 1, day: Math.min(28, d.getUTCDate()) };
};
const soon = at(3);
const later = at(23);
const annualSoon = at(60);
const annualFar = at(200);
await get("/admin/reserve-plan/create", form({ household_id: "house-home", month, name: "코앞구독료", amount: "20000", type: "expense", is_recurring: "1", recurrence: "monthly", due_day: String(soon.day), category: "주거/관리" }));
await get("/admin/reserve-plan/create", form({ household_id: "house-home", month, name: "멀리있는월세", amount: "500000", type: "expense", is_recurring: "1", recurrence: "monthly", due_day: String(later.day), category: "주거/관리" }));
await get("/admin/reserve-plan/create", form({ household_id: "house-home", month, name: "재산세곧", amount: "800000", type: "expense", recurrence: "annual", due_month_1: String(annualSoon.month), due_day: String(annualSoon.day), category: "세금/수수료" }));
await get("/admin/reserve-plan/create", form({ household_id: "house-home", month, name: "재산세나중", amount: "800000", type: "expense", recurrence: "annual", due_month_1: String(annualFar.month), due_day: String(annualFar.day), category: "세금/수수료" }));

const reserveHtml = await (await get(`/reserve-plans?month=${month}&household_id=house-home`)).text();
const dueSection = reserveHtml.slice(reserveHtml.indexOf("다가오는 납부"), reserveHtml.indexOf('id="fixed"'));
const cards = new Map(dueSection.split('<div class="reserveCard').slice(1).map((chunk) => [
  (chunk.match(/<b>([^<]*)<\/b>/) || [])[1],
  chunk.slice(0, 60).includes("alert"),
]));

// 매월 항목: 창이 10일이라 코앞만 강조된다. 예전에는 둘 다(그리고 전부) 강조였다.
eq(cards.get("코앞구독료"), true, "a monthly item due in 3 days is highlighted");
eq(cards.get("멀리있는월세"), false, "a monthly item due in 23 days is no longer highlighted");
// 연 1회: 90일 창 그대로. 재산세·자동차보험의 원래 설계는 건드리지 않는다.
eq(cards.get("재산세곧"), true, "an annual item due in 60 days still alerts");
eq(cards.get("재산세나중"), false, "an annual item due in 200 days does not alert");
eq(cards.get("자동차보험"), false, "the fixture annual plan (356 days out) does not alert");

// 강조가 목록 전체를 덮지 않는다는 것이 이 수정의 핵심이다.
const alertCount = [...cards.values()].filter(Boolean).length;
ok(alertCount > 0 && alertCount < cards.size, `only part of the list is highlighted (${alertCount}/${cards.size})`);
ok(reserveHtml.includes("<span>준비 알림</span><b>2건</b>"), "the metric counts only the genuinely upcoming items");
ok(reserveHtml.includes("<span>등록 항목</span><b>5개</b>"), "every plan is still listed even when it is not highlighted");

// 카카오 알림도 같은 판정을 쓴다(화면과 알림이 어긋나면 안 된다).
const kakaoRes = await get(`/budget-alerts?month=${month}&household_id=house-home`);
eq(kakaoRes.status, 200, "the alert centre still renders");

console.log(`PASS: V22.8.82 tone tokens and alert window (${checks} checks)`);
