// @build:imports-start
import { AB_UI_ICON_PATHS } from "./icon-paths.js";
import { AB_ICON_MASK, iconMaskUrl } from "./icon-mask-css.js";
// @build:imports-end

// V22.9.86 (디자인 작업 지시서 3단계 — 모바일 홈·빠른 입력): 셸 CSS(accountbook-shell-css.js) 끝, V22.9.40 (C) 블록 앞에 붙는다.
// 색은 모두 --ab12-* 토큰이라 톤 8개·라이트/다크에서 같은 규칙으로 바뀐다. 아이콘은 icon-paths.js(Lucide) 마스크다(CSP 그대로).
// 홈 HTML 에는 마크업을 거의 더하지 않는다 — 머리말·시트는 JS(theme-home-assets.js) 가 만들고, JS 가 없으면 지금 화면 그대로다.

// T-11 모바일 홈 머리말: 가계부 이름은 상단 바에 한 번(이름 단추 → 가계부 고르기 시트), 머리말은 ‹ 7월 › 한 줄.
function homeHeaderCss() {
  return [
    `/* V22.9.86 T-11: 모바일 홈 머리말 — JS 가 body.abHomeHeadV86 을 붙인 뒤에만 select 를 숨긴다(JS 가 없으면 그대로). */`,
    `@media(max-width:899px){`,
    `body.abV22812Shell.abHomeHeadV86 .appTop.abV5PageHeader{padding-top:6px!important;padding-bottom:6px!important}`,
    `body.abV22812Shell.abHomeHeadV86 .appTop.abV5PageHeader .selectLine{display:flex!important;justify-content:center;margin-top:0!important}`,
    `body.abV22812Shell.abHomeHeadV86 .appTop .selectLine>select[name="household_id"]{display:none!important}`,
    `body.abV22812Shell .abMonthNav{display:flex;align-items:center;justify-content:center;gap:4px}`,
    `body.abV22812Shell .abV5PageHeader .abV5ControlBar .abMonthStep{display:inline-grid;place-items:center;width:44px;height:44px!important;min-height:44px!important;padding:0!important;border:0!important;border-radius:12px;background:transparent!important;color:var(--ab12-text)!important}`,
    `body.abV22812Shell .abMonthStep:before{content:"";width:22px;height:22px;background:currentColor;${AB_ICON_MASK}}`,
    `body.abV22812Shell .abMonthPrev:before{--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["chevron-left"])}}`,
    `body.abV22812Shell .abMonthNext:before{--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["chevron-right"])}}`,
    `body.abV22812Shell .abMonthFace{position:relative;display:inline-grid;place-items:center;min-width:104px;min-height:44px;padding:0 12px;border-radius:12px;color:var(--ab12-text);font-size:18px;font-weight:800;font-variant-numeric:tabular-nums}`,
    `body.abV22812Shell .abMonthFace>input{position:absolute;inset:0;width:100%!important;height:100%!important;min-height:0!important;margin:0!important;padding:0!important;border:0!important;opacity:0;cursor:pointer}`,
    `body.abV22812Shell .abMonthFace:focus-within{outline:3px solid var(--ab12-accent);outline-offset:2px}`,
    `body.abV22812Shell .abMonthFace.abMonthPlain>span{display:none}`,
    `body.abV22812Shell .abMonthFace.abMonthPlain>input{position:static;opacity:1}`,
    `body.abV22812Shell .abNavMobileTop>a[role="button"]{cursor:pointer}`,
    `body.abV22812Shell .abNavMobileTop .abHhName{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}`,
    `body.abV22812Shell .abNavMobileTop .abHhChevron{flex:none;width:18px;height:18px;margin-left:4px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["chevron-down"])};${AB_ICON_MASK}}`,
    `}`,
    // 900px 이상: 머리말은 예전 그대로다. JS 가 월 입력을 감싼 틀은 사라지고(display:contents) 단추·글자만 숨는다.
    `@media(min-width:900px){body.abV22812Shell :is(.abMonthNav,.abMonthFace){display:contents}body.abV22812Shell :is(.abMonthStep,.abMonthFace>span,.abHhChevron){display:none!important}}`,
  ].join("\n");
}

// 지시서 §3-4 바텀시트: 모서리 24 24 0 0, 손잡이 40×5, 패딩 8 20 20, 최대 높이 90%, 뒤 막 라이트 rgba(17,24,39,.42)·다크 rgba(0,0,0,.6).
// 등장은 §3-5(260ms, 아래에서 16px, 뒤 막 180ms 페이드), 움직임 줄이기에서는 끈다. 가계부 고르기 시트(.abSheet)가 쓴다.
// 층: 시트는 대화상자라 화면 아래 알림(무지출 축하 .abCelebration z 11900)보다 위(12000)다 — 아래면 알림이 시트 항목 누름을 가로챈다(V22.9.86 실측).
// 빠른 입력 시트(.abQuickInputOverlay)는 옛 층(3600)을 그대로 둔다 — 저장 알림(3900) 아래라야 저장 실패로 시트가 다시 열려도 실패 이유가 보인다.
function bottomSheetCss() {
  return [
    `/* V22.9.86 T-11·T-14: 바텀시트(지시서 §3-4·§3-5) */`,
    `body.abV22812Shell .abSheet{position:fixed;inset:0;z-index:12000;display:flex;align-items:flex-end;justify-content:center}`,
    `body.abV22812Shell .abSheet[hidden]{display:none}`,
    `body.abV22812Shell .abSheetScrim{position:absolute;inset:0;background:rgba(17,24,39,.42)}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSheetScrim{background:rgba(0,0,0,.6)}`,
    `body.abV22812Shell .abSheetPanel{position:relative;box-sizing:border-box;width:min(100%,560px);max-height:90%;overflow:auto;overscroll-behavior:contain;padding:8px 20px calc(20px + env(safe-area-inset-bottom,0px));border-radius:24px 24px 0 0;background:var(--ab12-surface);color:var(--ab12-text);box-shadow:0 -12px 40px rgba(15,23,42,.18)}`,
    `body.abV22812Shell .abSheetPanel:before{content:"";display:block;width:40px;height:5px;margin:0 auto 10px;border-radius:999px;background:var(--ab12-line)}`,
    `body.abV22812Shell .abSheetHead{display:flex;align-items:center;justify-content:space-between;gap:12px;min-height:44px;margin-bottom:8px}`,
    `body.abV22812Shell .abSheetHead b{font-size:18px;font-weight:800}`,
    `body.abV22812Shell .abSheetClose{display:inline-grid;place-items:center;flex:none;width:44px;height:44px;padding:0;border:0;border-radius:12px;background:var(--ab12-surface-raised);color:var(--ab12-text)}`,
    `body.abV22812Shell .abSheetClose:before{content:"";width:20px;height:20px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.x)};${AB_ICON_MASK}}`,
    `body.abV22812Shell .abHhList{display:grid;gap:8px;margin:0;padding:0;list-style:none}`,
    `body.abV22812Shell .abHhList button{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:52px!important;padding:0 16px;border:1px solid var(--ab12-line);border-radius:14px;background:var(--ab12-surface);color:var(--ab12-text);font:inherit;font-size:16px;font-weight:600;text-align:left}`,
    `body.abV22812Shell .abHhList button[aria-current="true"]{border-color:var(--ab12-accent);background:var(--ab12-accent-soft);color:var(--ab12-accent);font-weight:800}`,
    `body.abV22812Shell .abHhList button[aria-current="true"]:after{content:"";flex:none;width:20px;height:20px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.check)};${AB_ICON_MASK}}`,
    `@media(prefers-reduced-motion:no-preference){body.abV22812Shell .abSheet:not([hidden]) .abSheetPanel{animation:abSheetUp 260ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}body.abV22812Shell .abSheet:not([hidden]) .abSheetScrim{animation:abSheetFade 180ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}}`,
    `@keyframes abSheetUp{from{opacity:0;transform:translateY(16px)}}`,
    `@keyframes abSheetFade{from{opacity:0}}`,
  ].join("\n");
}

// T-13 카테고리 동그라미: 행 42px(아이콘 21, V22.9.85 .abCat 기본값)·칩 32px(17). 마크업은 V5 자산(accountbookCategoryCircleClientMain)이 넣는다.
// 칩은 §3-4 칩 패딩(0 14px 0 6px, gap 6)을 동그라미가 있을 때만 쓴다.
function categoryCircleCss() {
  return [
    `/* V22.9.86 T-13: 거래 행·빠른 입력 칩의 카테고리 동그라미(브라우저가 넣는다, aria-hidden) */`,
    `body.abV22812Shell .v8-tx-main>.abCat{align-self:center}`,
    `body.abV22812Shell .v8-tx-main>.abCat+div{flex:1 1 auto}`,
    // 칩 바탕 규칙(셸 CSS body.abV22812Shell #add .chipRow button{padding:0 14px!important})이 #add 를 품어 같은 #add 로 맞춘다.
    `body.abV22812Shell #add .chipRow button:has(>.abCat){padding:0 14px 0 6px!important;gap:6px}`,
    `body.abV22812Shell .chipRow button>.abCat{width:32px;height:32px}`,
    `body.abV22812Shell .chipRow button>.abCat>.abCatIcon{width:17px;height:17px}`,
  ].join("\n");
}

// T-17 하단 탭 바(§3-4): 높이 72·5칸·탭 ≥52·라벨 11px. 활성은 아이콘 뒤 48×30 accent-soft 알약 + accent 글자 800(색 말고 모양으로도 구분)이고,
// 가운데 ＋ 는 52px 원(action)이 22px 솟고 떠 있는 그림자를 둔다. 옛 활성 위쪽 막대(a.active:before)는 알약으로 바꾼다.
// 알약에는 지시서 칩 고른 상태(§3-4 accent-soft 면 + accent 테두리)처럼 1px accent 윤곽선을 더한다. 알약 면만으로는 탭 바와 1.12:1(다크 1.16:1)이라
// 옛 막대(강조색)보다 약하다. 윤곽선은 탭 바 면과 3:1 을 넘는다(WCAG 1.4.11, V86 문서 ‘지시서와 다르게 한 것’).
// 강제 색상 모드(셸 CSS @media(forced-colors:active) 의 Highlight 윤곽선)는 그대로다 — 알약 바탕은 강제 색상에서 사라지고 윤곽선이 남는다.
// 본문 아래 여백(셸 CSS padding-bottom 74px)은 탭 바 72px 보다 커서 그대로 둔다.
// 가운데 단추는 서버 HTML 에서 .abNavQuick, 메뉴 런타임이 다시 그린 뒤에는 .abNavQuickInput(-8px 띄움·48px 둥근 네모)이라 둘 다 같은 원으로 맞춘다.
// V86:V-6 메뉴 선 아이콘(.abNavIconSvg)의 선 굵기·끝 모양: 셸을 받는 화면(nav scope user)은 unified-nav.js 의 인라인 규칙
// (stroke-width 1.8·둥근 끝)을 싣지 않아, 셸의 .abNavIconSvg 규칙(크기·색만)대로 기본값 1px·각진 끝으로 그려졌다(V22.9.85 실측도 같다).
// 지시서 §3-3 의 선 1.8 로 맞춘다. 둥근 끝이라야 palette·tag 의 칠한 점(길이 0 선, icon-paths.js)도 보인다.
function navIconStrokeCss() {
  return `body.abV22812Shell .abNavIconSvg{stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}`;
}

function bottomTabCss() {
  return [
    `/* V22.9.86 T-17: 하단 탭 바(지시서 §3-4) */`,
    `@media(max-width:899px){`,
    `body.abV22812Shell .abNavBottom{height:calc(72px + var(--abSafeBottom))!important}`,
    `body.abV22812Shell .abNavBottom a{min-height:52px!important;gap:4px!important}`,
    `body.abV22812Shell .abNavBottom a span{font-size:11px}`,
    `body.abV22812Shell .abNavBottom a:not(.abNavQuick,.abNavQuickInput) i{width:48px;height:30px;border-radius:999px;transition:background-color var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}`,
    `body.abV22812Shell .abNavBottom a.active:not(.abNavQuick,.abNavQuickInput) i{background:var(--ab12-accent-soft);box-shadow:inset 0 0 0 1px var(--ab12-accent)}`,
    `body.abV22812Shell .abNavBottom a.active{font-weight:800!important}`,
    `body.abV22812Shell .abNavBottom a.active:before{display:none!important}`,
    // V85:R-8: 다크의 ‘모든 링크 강조색’ 규칙(html[…dark] body a, 특이도 0,2,3)이 탭 바의 안 고른 색(0,2,2)을 이겨 다섯 탭 글자가 모두 강조색이었다.
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abNavBottom a:not(.active){color:var(--ab12-nav-inactive)!important}`,
    `body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput){justify-content:flex-start!important;transform:none!important}`,
    `@media(prefers-reduced-motion:no-preference){body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput):active{transform:scale(.97)!important}}`,
    `body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput) i{width:52px!important;height:52px!important;border-radius:50%!important;margin-top:-22px!important;box-shadow:0 10px 24px rgba(15,23,42,.22),0 2px 6px rgba(15,23,42,.12)!important}`,
    // §3-3 아이콘 크기: 하단 탭 22px(선 1.8, unified-nav 기본), 가운데 ＋ 26px(선 2.2). 셸의 .abNavIconSvg{20px!important} 가 모든 메뉴 아이콘을
    // 20px 로 묶어 옛 ＋ 26px 규칙(!important 없음)도 먹지 않았다.
    `body.abV22812Shell .abNavBottom a:not(.abNavQuick,.abNavQuickInput) i .abNavIconSvg{width:22px!important;height:22px!important}`,
    `body.abV22812Shell .abNavBottom a:is(.abNavQuick,.abNavQuickInput) i .abNavIconSvg{width:26px!important;height:26px!important;stroke-width:2.2}`,
    `}`,
  ].join("\n");
}

// T-14 입력 바·빠른 입력 시트: 바는 모바일 홈 예산 카드 아래 링크(900px 이상 숨김). 시트(V5 .abQuickInputOverlay)는 §3-4 바텀시트 값으로 맞추고
// (뒤 막·손잡이 40×5·패딩 8 20 20·최대 높이 90%·닫기 44px 아이콘), 미리보기 줄을 저장 단추 위로 올린다(§3-6 순서). 꺼진 저장 단추는 §3-4 주 버튼
// 비활성(surface-raised 면 + muted 글자)이다. 모바일 홈에서는 같은 폼을 본문에 다시 그리지 않는다(body.abQuickSheetOnly, V5 자산이 붙인다).
function quickEntryCss() {
  return [
    `/* V22.9.86 T-14: 한 줄로 기록하기 입력 바·빠른 입력 시트(지시서 §3-4·§3-6) */`,
    `body.abV22812Shell .abEntryBar{display:flex;align-items:center;gap:10px;min-height:56px;margin:12px 0 0;padding:0 16px;border:1px solid var(--ab12-line);border-radius:16px;background:var(--ab12-surface);color:var(--ab12-text)!important;font-size:16px;font-weight:800;text-decoration:none!important;box-shadow:0 1px 2px rgba(15,23,42,.05)}`,
    `body.abV22812Shell .abEntryBar:before{content:"";flex:none;width:22px;height:22px;background:var(--ab12-accent);--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["notebook-pen"])};${AB_ICON_MASK}}`,
    `body.abV22812Shell .abEntryBar small{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ab12-muted);font-size:13px;font-weight:600}`,
    `body.abV22812Shell .abEntryBar:focus-visible{outline:3px solid var(--ab12-accent);outline-offset:2px}`,
    `@media(min-width:900px){body.abV22812Shell .abEntryBar{display:none}}`,
    `@media(max-width:899px){body.abV22812Shell.abQuickSheetOnly #add.panel:not(.abQuickInputContent){display:none!important}}`,
    `body.abV22812Shell .abQuickInputScrim{background:rgba(17,24,39,.42);backdrop-filter:none}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abQuickInputScrim{background:rgba(0,0,0,.6)}`,
    `body.abV22812Shell .abQuickInputClose{width:44px;height:44px;border:0!important;background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important}`,
    `body.abV22812Shell .abQuickInputClose:before{content:"";width:20px;height:20px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.x)};${AB_ICON_MASK}}`,
    `@media(max-width:899px){`,
    `body.abV22812Shell .abQuickInputPanel{max-height:90vh;max-height:90dvh}`,
    `body.abV22812Shell .abQuickInputPanel:before{width:40px;height:5px;margin:8px auto 0}`,
    `body.abV22812Shell .abQuickInputHead{padding:4px 20px 8px;border-bottom:0!important}`,
    `body.abV22812Shell .abQuickInputBody{padding:0 20px calc(20px + env(safe-area-inset-bottom,0px))}`,
    `}`,
    `@media(max-width:899px) and (prefers-reduced-motion:no-preference){body.abV22812Shell .abQuickInputOverlay:not([hidden]) .abQuickInputPanel{animation:abSheetUp 260ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}body.abV22812Shell .abQuickInputOverlay:not([hidden]) .abQuickInputScrim{animation:abSheetFade 180ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}}`,
    `body.abV22812Shell .quickSubmit{display:flex;flex-direction:column}`,
    `body.abV22812Shell .quickSubmit .quickAfter{order:-1;margin:0 0 10px}`,
    `body.abV22812Shell .quickSubmit button[type="submit"]:disabled{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important;border-color:transparent!important;box-shadow:none!important;cursor:not-allowed}`,
    // V85:R-12: 날짜 칩(오늘·어제)도 T-01 칩 규격(surface 면·line 테두리·text 600, 고른 칩 accent-soft·accent 800)이다. 고른 상태는 aria-pressed(홈 스크립트).
    `body.abV22812Shell #add .dateChip{min-height:44px!important;padding:0 14px!important;border-radius:999px!important;background:var(--ab12-surface)!important;border:1px solid var(--ab12-line)!important;color:var(--ab12-text)!important;font-weight:600!important}`,
    `body.abV22812Shell #add .dateChip[aria-pressed="true"]{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important;font-weight:800!important}`,
    // V85:R-13: 빠른 입력 칸의 초점은 강조색 3px 윤곽선이다. 옛 런타임 규칙(.abV2281 input…:focus{outline:0!important}, 12% 그림자 고리)은 다크에서
    // 거의 보이지 않았다. #add 를 품어 그 규칙을 이긴다. 다른 화면의 입력칸은 그대로다(남은 것).
    `body.abV22812Shell #add :is(input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]),select,textarea):focus-visible{outline:3px solid var(--ab12-accent)!important;outline-offset:1px!important}`,
  ].join("\n");
}

// V85:R-16 (3단계 홈 카드): 챌린지 카드(.reportChallenge)는 톤·라이트/다크와 관계없이 어두운 남색 면(#171a2b → #222741)이라, 카드 안
// 초점 링이 강조색이면 호박 톤 라이트에서 2.5:1 이었다. 카드 안에서는 흰 링(15:1 이상)을 쓴다.
// (R-15 ‘60%를’ 줄바꿈은 CSS 로 못 막아 home-sections.js 에서 고쳤다 — 그 문장은 이미 keep-all 이다.)
function homeCardFollowupCss() {
  return `body.abV22812Shell .reportChallenge :is(a,summary,input,button):focus-visible{outline-color:#fff!important}`;
}

// T-15 저장 알림(§3-4·§3-5): 화면 아래 반전 면(라이트 #191f28 / 다크 #edeff3), 모서리 16, 왼쪽 34px 표시 원(성공 #087a55 체크·경고 #c2410c 삼각·
// 오류 #b91c1c 느낌표, 기호는 흰색). 경고 삼각은 V22.9.85 규칙(icon-mask-css.js)을 그대로 쓴다. 느낌표는 Lucide circle-alert 를 두 배로 키워
// 가운데(! 부분)만 보인다 — 바깥 원(r=10)은 보이는 칸(가운데 ±6, 모서리 8.5)보다 멀어 잘린다. 위치는 모바일 탭 바 위(아래에서 84px),
// 데스크톱은 지금처럼 본문 가운데 아래다. 등장 260ms·16px(움직임 줄이기에서는 셸 CSS 가 transition 을 끈다). 층(3900)은 그대로다.
// 새 행 강조 .abTxNew 는 accent-soft 에서 그 행의 원래 바탕(날짜 묶음 안은 투명)으로 1.8초 — 끝 칸을 비워 두면 원래 값으로 끝난다.
function saveFeedbackCss() {
  return [
    `/* V22.9.86 T-15: 저장 알림·새 행 강조(지시서 §3-4·§3-5) */`,
    `body.abV22812Shell .abSaveFeedback{display:flex;gap:12px;padding:10px 6px 10px 14px;border-color:transparent!important;border-radius:16px;background:#191f28!important;color:#fff!important;backdrop-filter:none;transition-duration:260ms}`,
    `body.abV22812Shell .abSaveFeedbackMark{flex:none;width:34px;height:34px;border-radius:50%;background:#087a55;color:#fff!important}`,
    `body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark{background:#c2410c;color:#fff!important}`,
    `body.abV22812Shell .abSaveFeedback.isError .abSaveFeedbackMark{background:#b91c1c;color:#fff!important}`,
    `body.abV22812Shell .abSaveFeedback.isSuccess .abSaveFeedbackMark:empty:before{content:"";width:20px;height:20px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.check)};${AB_ICON_MASK}}`,
    `body.abV22812Shell .abSaveFeedback.isError .abSaveFeedbackMark:empty:before{content:"";width:16px;height:16px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["circle-alert"])};${AB_ICON_MASK};-webkit-mask-size:200%;mask-size:200%}`,
    `body.abV22812Shell .abSaveFeedbackCopy{flex:1 1 auto}`,
    `body.abV22812Shell .abSaveFeedbackCopy span{color:#d1d5db!important}`,
    `body.abV22812Shell .abSaveFeedbackAction{flex:none;display:inline-flex;align-items:center;min-height:44px;padding:0 8px;border-radius:10px;color:#93c5fd!important;font-size:14px;font-weight:800;text-decoration:none!important;white-space:nowrap}`,
    `body.abV22812Shell .abSaveFeedbackAction:focus-visible,body.abV22812Shell .abSaveFeedbackClose:focus-visible{outline:3px solid currentColor;outline-offset:-3px}`,
    `body.abV22812Shell .abSaveFeedbackClose{flex:none;width:44px;height:44px;border:0!important;border-radius:12px;background:transparent!important;color:#d1d5db!important}`,
    `body.abV22812Shell .abSaveFeedbackClose:before{content:"";width:18px;height:18px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS.x)};${AB_ICON_MASK}}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSaveFeedback{background:#edeff3!important;color:#141519!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.abSaveFeedbackCopy span,.abSaveFeedbackClose){color:#374151!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSaveFeedbackAction{color:#1d4ed8!important}`,
    `@media(min-width:900px){body.abV22812Shell .abSaveFeedback:not(.isVisible,.isLeaving){transform:translate(-50%,16px)}}`,
    `@media(max-width:899px){body.abV22812Shell .abSaveFeedback,body.abV22812Shell.abNavCollapsed .abSaveFeedback{bottom:calc(84px + env(safe-area-inset-bottom,0px))}body.abV22812Shell .abSaveFeedback:not(.isVisible,.isLeaving){transform:translateY(16px)}}`,
    `@media(prefers-reduced-motion:no-preference){body.abV22812Shell .abTxNew{animation:abTxNew 1.8s var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}}`,
    `@keyframes abTxNew{from{background-color:var(--ab12-accent-soft)}}`,
  ].join("\n");
}

// T-18 빈 상태(§3-6): 점선 상자 + 52px accent-soft 아이콘 칸(공책·펜) + 제목 + 한 줄 + 주 버튼. 마크업은 mobile-home.js renderRecordEmptyState 다.
// 내역 탭 상자는 옛 .abTxEmpty(Lucian B CSS, 실선·단추 바탕) 이름도 함께 달고 있어 테두리·단추를 이 규칙이 덮는다.
function emptyStateCss() {
  return [
    `/* V22.9.86 T-18: 기록 없는 달의 빈 상태(지시서 §3-6) */`,
    `body.abV22812Shell .abEmptyState{display:grid;justify-items:center;gap:6px;margin:12px 0;padding:24px 20px;border:2px dashed var(--ab12-line);border-radius:20px;background:var(--ab12-surface);color:var(--ab12-text);text-align:center}`,
    `body.abV22812Shell .abEmptyIcon{display:grid;place-items:center;width:52px;height:52px;margin-bottom:6px;border-radius:16px;background:var(--ab12-accent-soft);color:var(--ab12-accent)}`,
    `body.abV22812Shell .abEmptyIcon:before{content:"";width:26px;height:26px;background:currentColor;--ab-ico:${iconMaskUrl(AB_UI_ICON_PATHS["notebook-pen"])};${AB_ICON_MASK}}`,
    `body.abV22812Shell .abEmptyState h3{margin:0;color:var(--ab12-text);font-size:17px;font-weight:800}`,
    `body.abV22812Shell .abEmptyState p{margin:0 0 8px;color:var(--ab12-muted);font-size:14px;line-height:1.55}`,
    `body.abV22812Shell .abEmptyState .abEmptyAction{display:inline-flex;align-items:center;justify-content:center;min-height:48px;padding:0 20px;border:0;border-radius:14px;background:var(--ab12-action)!important;color:#fff!important;font-size:15px;font-weight:800;text-decoration:none}`,
    `body.abV22812Shell .abEmptyState .abEmptyAction:focus-visible{outline:3px solid var(--ab12-accent);outline-offset:3px}`,
  ].join("\n");
}

function designUplift3Css() {
  return [homeHeaderCss(), bottomSheetCss(), categoryCircleCss(), navIconStrokeCss(), bottomTabCss(), quickEntryCss(), saveFeedbackCss(), emptyStateCss(), homeCardFollowupCss()].join("\n");
}
// @build:exports-start
export { designUplift3Css };
// @build:exports-end
