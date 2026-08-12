import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.89-QUICK-SHEET-TWO-TIER"'), "runtime exposes the V22.8.79 release");

// 테마 런타임 본문만 떼어내 검사한다. 다른 곳의 "system"(actorKind 등)에 걸리지 않게 한다.
const themeStart = source.indexOf("function accountbookThemeClientMain()");
ok(themeStart > 0, "the theme runtime is present");
const themeBody = source.slice(themeStart, source.indexOf("\nfunction ", themeStart + 10));

// ---------------------------------------------------------------------------
// P2-A. 테마 = 라이트/다크 2택 (시스템 제거)
// ---------------------------------------------------------------------------

// 1. 목록과 기본값이 2택이다.
ok(themeBody.includes('var themes = ["light", "dark"];'), "the theme list is light/dark only");
ok(themeBody.includes('return valid(read(themeKey, "light"), themes, "light");'), "the stored theme falls back to light");

// 2. resolved() 에서 system 분기가 사라졌다.
ok(themeBody.includes('return theme === "dark" ? "dark" : "light";'), "resolved() maps straight to light or dark");
eq(/prefers-color-scheme/.test(themeBody), false, "the theme runtime no longer reads the OS preference");
eq(/matchMedia/.test(themeBody), false, "the matchMedia handle is gone");
eq(/onSystemChange/.test(themeBody), false, "the dead system listener is removed");

// 3. 폴백이 전부 light 다. 테마 런타임 어디에도 "system" 이 남지 않는다.
eq(themeBody.includes('"system"'), false, "no system value survives anywhere in the theme runtime");
ok(themeBody.includes('theme = valid(theme, themes, "light");'), "apply() falls back to light");
ok(themeBody.includes('var theme = valid(button.getAttribute("data-ab-theme-choice"), themes, "light");'), "the button handler falls back to light");

// 4. 마이그레이션: 예전에 저장된 "system" 은 valid() 가 light 로 정정한다.
//    별도 코드가 필요 없다는 것이 요점이므로 계약을 그대로 재현해 확인한다.
const themes = ["light", "dark"];
const valid = (value, allowed, fallback) => (allowed.includes(value) ? value : fallback);
eq(valid("system", themes, "light"), "light", "a stored 'system' value migrates to light");
eq(valid("dark", themes, "light"), "dark", "a stored 'dark' value is preserved");
eq(valid("light", themes, "light"), "light", "a stored 'light' value is preserved");
eq(valid(null, themes, "light"), "light", "an empty store falls back to light");

// 5. 상태 문구 맵에서도 시스템이 빠졌다.
ok(themeBody.includes('var themeLabel = { light: "라이트 모드", dark: "다크 모드" }[theme];'), "the status copy map is light/dark only");

// 6. 화면 설정 버튼이 2개다 (설정 패널 + 전역 다이얼로그 양쪽).
eq(source.includes('data-ab-theme-choice="system"'), false, "no system button remains in any appearance panel");
eq((source.match(/data-ab-theme-choice="light"/g) || []).length, 2, "both appearance panels keep the light button");
eq((source.match(/data-ab-theme-choice="dark"/g) || []).length, 2, "both appearance panels keep the dark button");

// 7. 테마 런타임은 자산으로 나가고 immutable 캐시라 경로가 올라가야 반영된다.
ok(source.includes('const ACCOUNTBOOK_THEME_JS_ASSET_PATH = "/assets/accountbook-theme-v22879.js"'), "the theme runtime asset path is bumped");
ok(source.includes('\'"accountbook-theme-v22879-js"\''), "the theme runtime ETag matches its path");
eq(source.includes("accountbook-theme-v22812"), false, "no stale theme runtime reference remains");

// 8. 다크 커버리지는 회귀하지 않는다.
ok((source.match(/html\[data-ab-resolved-theme="dark"\]/g) || []).length > 120, "dark theme coverage is still broad");
ok(source.includes('root.setAttribute("data-ab-resolved-theme", mode)'), "the resolved theme attribute is still stamped");

// ---------------------------------------------------------------------------
// P2-B. 라이트 사이드바 대/하위 메뉴 위계
//   색을 더 얹지 않고 구조 신호로만 층을 나눈다. 다크는 건드리지 않는다.
// ---------------------------------------------------------------------------

const lightOnly = 'html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell';

// 9. 대메뉴는 섹션 헤더가 된다 — 그룹 사이 구분선 + 자간.
ok(source.includes(`${lightOnly} .abNavGroup+.abNavGroup{border-top:1px solid var(--line)!important`), "groups are separated by a divider in light");
ok(source.includes(`${lightOnly} .abNavGroup summary b{letter-spacing:.055em!important`), "group titles get section-header tracking");

// 10. abNavGroupPrimary 는 상시 강조된다(대비를 낮추지 않고 올리는 방향).
ok(source.includes(`${lightOnly} .abNavGroupPrimary>summary b{color:var(--text)!important}`), "the primary group title is always emphasised");

// 11. 하위는 들여쓰기 레일로 층을 만든다.
ok(source.includes(`${lightOnly} .abNavLinks{margin-left:17px!important;padding-left:11px!important;border-left:1px solid var(--line)!important}`), "sub items sit inside an indent rail");
ok(source.includes(`${lightOnly} .abNavLinks a{padding-left:10px!important`), "sub items keep their own left padding");

// 12. 접힌 사이드바에서는 레일을 걷어낸다(아이콘만 남는 폭이라 선이 남으면 깨진다).
ok(source.includes(`${lightOnly}.abNavCollapsed .abNavLinks{margin-left:0!important;padding-left:0!important;border-left:0!important}`), "the rail is removed while the sidebar is collapsed");

// 13. 라이트 전용이어야 한다. 이 블록의 모든 규칙이 :not(dark) 로 막혀 있다.
const tierRules = (source.match(/^html:not\(\[data-ab-resolved-theme="dark"\]\) body\.abV22812Shell[^\n]*$/gm) || []);
ok(tierRules.length >= 6, "the hierarchy block is present");
for (const rule of tierRules) {
  ok(rule.startsWith('html:not([data-ab-resolved-theme="dark"])'), `light-only guard on: ${rule.slice(60, 110)}`);
}

// 14. 활성 항목만 포인트색을 갖는다(비활성은 뉴트럴 유지).
ok(source.includes("body.abV22812Shell .abNavLinks a{display:flex!important;justify-content:flex-start!important;gap:11px!important;min-height:42px!important;padding:9px 12px 9px 14px!important;border-radius:11px!important;background:transparent!important;color:var(--sub)!important"), "inactive sub items stay neutral");
ok(source.includes("body.abV22812Shell .abNavLinks a.active{background:var(--accent-weak)!important;color:var(--accent)!important;font-weight:800!important}"), "only the active sub item carries the accent colour");

// 15. 위계 규칙이 대비를 낮추지 않는다 — --faint 로 내리는 선언이 없어야 한다.
for (const rule of tierRules) {
  eq(/color:var\(--faint\)/.test(rule), false, `the hierarchy block never weakens contrast: ${rule.slice(60, 110)}`);
}

console.log(`PASS: V22.8.79 theme duo and sidebar tier (${checks} checks)`);
