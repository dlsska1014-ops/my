import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");

ok(source.includes('const APP_VERSION = "V22.8.83-TONE-AWARE-HEROES"'), "runtime exposes the month reset and brand icon release");

// ---------------------------------------------------------------------------
// P0-1. 월이 계속 지난달로 고정되는 문제
//   서버 기본값은 원래 정상이다. URL 에 month 가 한 번 박히면 앱 내부 링크가 그
//   달을 계속 물고 다니는 것이 원인이라, 되돌아올 길만 만든다.
// ---------------------------------------------------------------------------

// 1. 서버 기본값은 그대로여야 한다. 특정 달로 리다이렉트하면 공유링크가 깨진다.
ok(source.includes('validMonth(url.searchParams.get("month")) || currentMonthKst()'), "server still defaults to the current month instead of redirecting");

// 2. 되돌아갈 주소는 현재 필터·보기를 유지한 채 month 만 이번 달로 바꾼다.
ok(source.includes("const backToCurrentMonthParams = new URLSearchParams(appParams)"), "the back link reuses the current app params");
ok(source.includes('backToCurrentMonthParams.set("month", appCurrentMonth)'), "the back link overrides only the month");
ok(source.includes("const backToCurrentMonthPath = `/app?${backToCurrentMonthParams.toString()}`"), "the back link points at /app");

// 3. 이번 달일 때는 아무것도 보이지 않는다.
ok(source.includes("const monthAwayHtml = isCurrentMonth\n    ? \"\""), "the badge is hidden while viewing the current month");

// 4. 과거/미래를 구분해 문구를 고른다.
ok(source.includes('const monthAwayLabel = month < appCurrentMonth ? "지난달 보는 중" : "다음 달 보는 중"'), "past and future months get distinct badge copy");

// 5. 배지와 이동 링크가 모두 그려진다.
ok(source.includes('class="appMonthAwayBadge"'), "the away badge is rendered");
ok(source.includes('class="appMonthAwayGo"'), "the go-to-current-month link is rendered");
ok(source.includes(">이번 달로 이동</a>"), "the link carries the expected copy");

// 6. 헤더의 월 선택 폼 바로 뒤에 붙는다.
ok(source.includes('onchange="this.form.submit()"/></form>${monthAwayHtml}</header>'), "the badge sits right after the month picker in the app header");

// 7. 사용자 문자열은 escapeHtml 을 통과한다.
ok(source.includes("${escapeHtml(monthAwayLabel)}"), "the badge label is escaped");
ok(source.includes("${escapeHtml(backToCurrentMonthPath)}"), "the back link href is escaped");

// 8. 라이트/다크 양쪽 스타일이 있어야 한다.
ok(source.includes(".appMonthAwayBadge{display:inline-flex"), "light styling exists for the badge");
ok(source.includes(".appMonthAwayGo{display:inline-flex"), "light styling exists for the link");
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMonthAwayBadge'), "dark coverage exists for the badge");
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMonthAwayGo'), "dark coverage exists for the link");

// 9. 월 계산 함수 자체는 손대지 않는다.
ok(source.includes("function validMonth(value) {"), "validMonth is untouched");
ok(source.includes("return /^20\\d{2}-(?:0[1-9]|1[0-2])$/.test(String(value || \"\")) ? String(value) : null;"), "validMonth keeps its original body");

// ---------------------------------------------------------------------------
// P0-2. 좌측상단 브랜드 아이콘 깨짐
//   .abNavLogo 가 여러 곳에 중복 정의돼 어느 것이 이기느냐에 따라 SVG stroke 색이
//   배경과 붙어 버렸다. 아이콘 규격을 한 곳에서 못박는다.
// ---------------------------------------------------------------------------

// 10. 로고는 계속 SVG 다. 이모지로 되돌리지 않는다.
ok(source.includes("function renderAccountbookBrandIcon(className = \"abBrandIcon\")"), "the brand icon helper is kept");
ok(source.includes('<rect x="4" y="3.5" width="16" height="17" rx="3"></rect>'), "the brand icon SVG path is unchanged");
ok(source.includes('class="abNavLogo">${renderAccountbookBrandIcon()}</span>'), "the sidebar logo still renders the SVG");

// 11. 아이콘 규격을 한 규칙으로 못박아 stroke 가 컨테이너 대비색을 그대로 받는다.
ok(source.includes("body.abV22812Shell :is(.abNavLogo,.abNavMobileLogo)>svg{"), "one rule pins the brand icon geometry");
ok(source.includes("stroke:currentColor!important;color:inherit!important}"), "the icon stroke follows the container contrast colour");
ok(source.includes("body.abV22812Shell .abNavMobileLogo>svg{width:18px!important;height:18px!important}"), "the mobile logo keeps a smaller icon");

// 12. 중복 선언 3곳이 모두 가운데 정렬 + 대비색을 갖는다(어느 것이 이겨도 같은 결과).
// 크기를 정하는 선언이 곧 컨테이너 정의다. 배경·색만 바꾸는 다크 오버라이드는 제외한다.
const navLogoBoxRules = (source.match(/\.abNavLogo\{[^}]*\}/g) || []).filter((rule) => rule.includes("width:"));
eq(navLogoBoxRules.length, 3, "the three historical .abNavLogo container declarations are still accounted for");
for (const rule of navLogoBoxRules) {
  ok(/display:(grid|flex)/.test(rule), `every .abNavLogo container centres its child: ${rule.slice(0, 60)}`);
  ok(/place-items:center|align-items:center/.test(rule), `every .abNavLogo container centres on both axes: ${rule.slice(0, 60)}`);
  ok(/(?:^|[;{])color:/.test(rule), `every .abNavLogo container sets an icon colour: ${rule.slice(0, 60)}`);
}

// 13. 노랑 그라디언트 로고는 어두운 아이콘을 쓴다(예전에는 색을 상속해 사라졌다).
ok(source.includes("background:linear-gradient(135deg,#FEE500,#ffd84d);color:#191919;display:grid;place-items:center"), "the yellow logo pins a dark icon colour");

// 14. 다크에서도 브랜드 배경 + 흰 아이콘을 유지한다.
ok(source.includes('html[data-ab-resolved-theme="dark"] body.abV22812Shell .abNavLogo{background:var(--brand)!important;color:#fff!important;border-color:transparent!important}'), "dark keeps the brand background and a white icon");

// 15. 자산은 immutable 1년 캐시라 내용이 바뀌면 경로가 올라가야 반영된다.
ok(source.includes('const MOBILE_HOME_CSS_ASSET_PATH = "/assets/mobile-home-v22879.css"'), "the mobile home stylesheet path is bumped");
ok(source.includes('const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22882.css"'), "the shell stylesheet path is bumped");
ok(source.includes("'\"mobile-home-v22879-css\"'") || source.includes('\'"mobile-home-v22879-css"\''), "the mobile home stylesheet ETag matches its path");
ok(source.includes('\'"accountbook-shell-v22882-css"\''), "the shell stylesheet ETag matches its path");
eq(source.includes("accountbook-shell-v22874"), false, "no stale shell stylesheet reference remains");
eq(source.includes("mobile-home-v22875"), false, "no stale mobile home stylesheet reference remains");

console.log(`PASS: V22.8.79 month reset and brand icon (${checks} checks)`);
