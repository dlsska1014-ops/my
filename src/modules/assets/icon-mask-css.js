// @build:imports-start
import { AB_CATEGORY_ICON_PATHS, AB_UI_ICON_PATHS } from "./icon-paths.js";
import { categoryKeyRules } from "../web/quick-chip-icons.js";
// @build:imports-end

// V22.9.85 (디자인 작업 지시서 T-09 §3-2·T-10): 카테고리 동그라미 색과 아이콘 마스크. 셸 CSS(accountbook-shell-css.js) 끝에 붙는다.
// - 색: 키마다 동그라미 바탕(bg)과 아이콘 잉크(ink)를 라이트·다크 한 쌍씩 둔다. 지시서 §3-2 값 그대로이고 톤(파랑·초록 …)과 무관하다.
//   validate-design-uplift-v22985 가 §3-2 와 같은지와 잉크 대비(바탕 위 3:1 이상)를 잰다.
// - 모양: 생성 파일 icon-paths.js(Lucide)의 path 를 data: SVG 마스크로 감싼다. CSP img-src 가 data: 를 허용하고 홈 HTML 에는 SVG 를 넣지 않는다.
//   선 굵기 2·둥근 끝은 Lucide 기본값이다. 마스크는 모양만 쓰므로 SVG 안 선 색은 검정으로 두고, 색은 background 가 정한다.
// - 마크업(3단계 T-13): <span class="abCat" data-ck="food"><i class="abCatIcon"></i></span>. 지시서 T-10 예시 선택자 .abCatIcon[data-ck] 는
//   T-13 마크업(data-ck 가 바깥 동그라미에 있다)과 맞지 않아, .abCat[data-ck] 가 바탕·잉크·모양을 변수로 내려 주고 .abCatIcon 이 그 변수를 쓴다.
//   data-ck 가 없거나 모르는 키면 잉크가 투명이라 빈 ‘기타’ 동그라미로 보인다(네모 칠이 보이지 않는다).
const AB_CATEGORY_PALETTE = {
  food: { light: ["#fff1e6", "#c2410c"], dark: ["#3a2516", "#fdba74"] },
  cafe: { light: ["#f8efe2", "#8a4b0f"], dark: ["#352a1b", "#f5c98a"] },
  transport: { light: ["#e8f1ff", "#1d4ed8"], dark: ["#1d2c42", "#93c5fd"] },
  grocery: { light: ["#e6f6ee", "#047857"], dark: ["#143328", "#6ee7b7"] },
  shopping: { light: ["#f1ecff", "#6d28d9"], dark: ["#2d2447", "#c4b5fd"] },
  medical: { light: ["#ffecef", "#be123c"], dark: ["#3d1d26", "#fda4af"] },
  housing: { light: ["#e2f5f3", "#0f766e"], dark: ["#123532", "#5eead4"] },
  utility: { light: ["#fdf5d6", "#854d0e"], dark: ["#372f12", "#fde047"] },
  sub: { light: ["#eceffe", "#4338ca"], dark: ["#252a4a", "#a5b4fc"] },
  culture: { light: ["#fdeaf4", "#be185d"], dark: ["#3c1d30", "#f9a8d4"] },
  goods: { light: ["#e1f3f9", "#0e7490"], dark: ["#123340", "#67e8f9"] },
  baby: { light: ["#edf6dd", "#4d7c0f"], dark: ["#25331a", "#bef264"] },
  gift: { light: ["#feecea", "#b91c1c"], dark: ["#3d1d1d", "#fca5a5"] },
  income: { light: ["#e2f4ec", "#087a55"], dark: ["#143328", "#6ee7b7"] },
  etc: { light: ["#eef1f4", "#5f6b7a"], dark: ["#2a2e36", "#cbd5e1"] },
};

function iconMaskUrl(d) {
  return `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='black' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='${d}'/%3E%3C/svg%3E")`;
}

// 마스크 한 벌: --ab-ico 에 모양을 담고, 칠은 그 요소의 background 가 한다(-webkit- 은 Chromium 120 이전 삼성 인터넷·웹뷰용).
const AB_ICON_MASK = "-webkit-mask:var(--ab-ico) center/contain no-repeat;mask:var(--ab-ico) center/contain no-repeat";

function categoryIconCss() {
  const keys = categoryKeyRules().map((rule) => rule.key);
  const tokens = (scheme) => keys
    .map((key) => `--ab12-cat-${key}-bg:${AB_CATEGORY_PALETTE[key][scheme][0]};--ab12-cat-${key}-ink:${AB_CATEGORY_PALETTE[key][scheme][1]}`)
    .join(";");
  return [
    `/*! Lucide icons (lucide-static 1.56.0) ISC · Feather-derived icons MIT · https://lucide.dev/license */`,
    `/* V22.9.85 T-09·T-10: 카테고리 동그라미 — 바탕(--ab12-cat-<키>-bg)과 아이콘 잉크(--ab12-cat-<키>-ink). 톤 선택자에 넣지 않는다. */`,
    `body.abV22812Shell{${tokens("light")}}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell{${tokens("dark")}}`,
    `body.abV22812Shell .abCat{display:inline-grid;place-items:center;flex:none;width:42px;height:42px;border-radius:50%;background:var(--ab-ck-bg,var(--ab12-cat-etc-bg,#eef1f4))}`,
    `body.abV22812Shell .abCatIcon{display:block;width:50%;height:50%;background:var(--ab-ck-ink,transparent);-webkit-mask:var(--ab-ck-ico) center/contain no-repeat;mask:var(--ab-ck-ico) center/contain no-repeat}`,
    ...keys.map((key) => `body.abV22812Shell .abCat[data-ck="${key}"]{--ab-ck-bg:var(--ab12-cat-${key}-bg);--ab-ck-ink:var(--ab12-cat-${key}-ink);--ab-ck-ico:${iconMaskUrl(AB_CATEGORY_ICON_PATHS[key])}}`),
  ].join("\n");
}

// V22.9.85 T-10 §3-3 ‘이모지 → 아이콘(웹 화면만)’. 카카오톡 메시지 속 이모지는 그대로다.
// - 무지출 불꽃(🔥 → flame): 홈 챌린지 배지만 빈 <i> 를 내고(renderReportChallenge home), 분석·리포트 화면(보호 화면)은 이모지를 그대로 둔다.
// - 캘린더 펼치기 링크(📅 → calendar): 글자 앞 장식. 링크 이름은 ‘캘린더’ 그대로다.
// - 저장 알림의 예산 경고(△·⚠️ → triangle-alert): 알림 표식 칸에 그린다. 문구 앞 ⚠️·🚨 는 budgetAlertText 가 더 붙이지 않는다.
function uiIconCss() {
  return [
    `body.abV22812Shell .reportChallengeBadge>i:empty{--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.flame)};display:block;flex:none;align-self:center;width:12px;height:12px;margin-right:4px;background:currentColor;${AB_ICON_MASK}}`,
    `body.abV22812Shell .homeCalendarToggle a:before{--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.calendar)};content:"";flex:none;width:18px;height:18px;background:currentColor;${AB_ICON_MASK}}`,
    `body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark:empty:before{--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["triangle-alert"])};content:"";width:20px;height:20px;background:currentColor;${AB_ICON_MASK}}`,
  ].join("\n");
}

function designUpliftIconCss() {
  return `${categoryIconCss()}\n${uiIconCss()}`;
}
// @build:exports-start
export { designUpliftIconCss };
// @build:exports-end
