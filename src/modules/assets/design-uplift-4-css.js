// V22.9.87 (디자인 작업 지시서 4단계 — 데스크톱 T-19): 셸 CSS(accountbook-shell-css.js) 끝, V22.9.86 3단계 뒤·V22.9.40 (C) 블록 앞에 붙는다.
// 색은 모두 --ab12-* 토큰이라 톤 8개·라이트/다크에서 같은 규칙으로 바뀐다. 900px 아래(모바일) 화면은 바꾸지 않는다.
// 자리 옮기기는 nav-search-notif-mains.js(placeDeskActions·bindQuickCompact)가 한다. JS 가 없으면 독 자체가 없어 이 규칙도 할 일이 없다.
// 크기·모양은 시안 Desktop(.navitem 검색 줄·.iconbtn 44px·.badge·.fab 56px)을 따른다.

// 사이드바 거래 검색 한 줄: 브랜드 아래, 1px 선, 오른쪽에 ‘/’ 단축키 표시. 글자 크기는 옆 메뉴 링크(13.5px)에 맞춘다.
// 사이드바를 접으면 아이콘만 남기고 이름은 보조기기용으로 숨긴다(메뉴 링크와 같은 방식).
function deskSearchCss() {
  return [
    `body.abV22812Shell .abNavKbd{display:none}`,
    `body.abV22812Shell .abNavSearchSlot{padding:2px 10px 6px}`,
    `body.abV22812Shell .abNavSearchSlot .abGlobalAction{display:flex;width:100%;min-height:44px;justify-content:flex-start;gap:12px;padding:0 10px 0 12px;border:1px solid var(--ab12-line)!important;border-radius:12px;background:transparent!important;color:var(--ab12-muted)!important;box-shadow:none;font-size:13.5px;font-weight:600}`,
    `body.abV22812Shell .abNavSearchSlot .abGlobalAction:hover{border-color:var(--ab12-accent)!important;color:var(--ab12-text)!important}`,
    `body.abV22812Shell .abNavSearchSlot .abGlobalAction>span{flex:1;min-width:0;text-align:left}`,
    `body.abV22812Shell .abNavSearchSlot .abNavKbd{display:inline-block;flex:none;padding:2px 6px;border-radius:6px;background:var(--ab12-surface-raised);color:var(--ab12-muted);font:inherit;font-size:11px;font-weight:700;line-height:1.4}`,
    `body.abV22812Shell.abNavCollapsed .abNavSearchSlot{padding-inline:14px}`,
    `body.abV22812Shell.abNavCollapsed .abNavSearchSlot .abGlobalAction{justify-content:center;padding:0}`,
    `body.abV22812Shell.abNavCollapsed .abNavSearchSlot .abGlobalAction>span{position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}`,
    `body.abV22812Shell.abNavCollapsed .abNavSearchSlot .abNavKbd{display:none}`,
  ].join("\n");
}

// 머리말 오른쪽 위 아이콘 단추 묶음(알림·화면 설정·금액 가리기). 머리말(블록) 첫 자식이라 float 로 오른쪽에 띄우면
// 제목·안내문은 그 옆으로 줄을 바꾸고, 조작 줄(form·grid·flex)은 그 옆 남은 너비로 좁아진다 — 겹치지 않는다.
// 위치: 제목(22px, 28px 줄) 가운데에 단추(44px) 가운데를 맞춘다(-8px). 홈 머리말(.appTop)은 제목이 화면에 없고
// 첫 줄이 가계부·월 조작(46px, 위 여백 14px)이라 그 줄에 맞춘다. 머리말이 없는 화면은 본문 맨 위 오른쪽 한 줄이다.
// 이름은 aria-label·숨긴 글자로 그대로 읽히고, 알림 배지는 시안처럼 18px·2px 바탕색 테두리다.
// 화면 전용 CSS(리포트 머리말의 button 여백 3px 등)가 단추 크기를 바꾸지 못하게 바깥 여백까지 고정한다.
function deskHeadActionsCss() {
  return [
    `body.abV22812Shell .abDeskActions{display:flex;align-items:center;gap:8px}`,
    `body.abV22812Shell .abV5PageHeader>.abDeskActions{float:right;margin:-8px 0 6px 16px}`,
    `body.abV22812Shell .appTop.abV5PageHeader>.abDeskActions{margin-top:14px}`,
    `body.abV22812Shell .abDeskActionsRow{justify-content:flex-end;margin:12px 0}`,
    `body.abV22812Shell .abDeskActions :is(.abGlobalAction,.abPrivacyEye){position:relative;display:grid!important;place-items:center;flex:none;box-sizing:border-box;width:44px!important;height:44px!important;min-width:44px!important;min-height:44px!important;margin:0!important;padding:0!important;border:1px solid var(--ab12-line)!important;border-radius:12px!important;background:var(--ab12-surface)!important;color:var(--ab12-text)!important;box-shadow:none!important}`,
    `body.abV22812Shell .abDeskActions :is(.abGlobalAction,.abPrivacyEye):hover{border-color:var(--ab12-accent)!important;color:var(--ab12-text)!important}`,
    `body.abV22812Shell .abDeskActions .abGlobalAction>span:not(.abV5NotifBadge){position:absolute!important;width:1px!important;height:1px!important;margin:-1px!important;padding:0!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}`,
    `body.abV22812Shell .abDeskActions :is(.abNavIconSvg,.abPrivacyEye svg){width:20px!important;height:20px!important}`,
    `body.abV22812Shell .abDeskActions .abV5NotifBadge{top:-4px;right:-4px;box-sizing:border-box;min-width:18px;height:18px;padding:0 5px;border:2px solid var(--ab12-surface);font-size:11px;line-height:14px}`,
    `@media(max-width:899px){body.abV22812Shell :is(.abDeskActions,.abNavSearchSlot){display:none!important}}`,
  ].join("\n");
}

// 빠른 입력 단추 하나: 독은 이제 이 단추만 담는 틀이다(바탕·테두리·흐림 없음). 오른쪽 28px·아래 24px, 높이 56px 알약.
// 아래로 스크롤하면(.abQuickCompact) 56px 원으로 줄고 위로 올리면 펼친다. 왼쪽 안쪽 여백을 16px 로 두어 줄어도 + 가 가운데에
// 그대로 남는다(16+24+16). 너비는 max-width 로 옮겨 그 사이를 그린다(눈금 --ab12-dur ‘나타남·접힘’). 움직임 줄이기에서는 전환이 없어 바로 바뀐다.
// 오른쪽 활동 레일(1320px 이상)이 있으면 그 왼쪽에 둔다. 몸통 아래 여백(94px)은 독 때와 같아 마지막 줄을 덮지 않는다.
function quickFabCss() {
  return [
    `@media(min-width:900px){`,
    `body.abV22812Shell .abGlobalActions[data-ab-quick-dock]{left:auto!important;right:28px;bottom:24px;transform:none;gap:0;padding:0!important;border:0!important;border-radius:999px;background:transparent!important;-webkit-backdrop-filter:none;backdrop-filter:none;box-shadow:none!important}`,
    `body.abV22812Shell.abHasActivityRail .abGlobalActions[data-ab-quick-dock]{right:calc(var(--abActivityRailW,0px) + 28px)}`,
    `body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{box-sizing:border-box;max-width:220px;height:56px;min-height:56px;min-width:0;justify-content:flex-start;gap:8px;padding:0 22px 0 16px;border-radius:999px;font-size:15.5px;font-weight:800;white-space:nowrap;overflow:hidden;box-shadow:0 16px 40px rgba(15,23,42,.18)!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{box-shadow:0 16px 40px rgba(0,0,0,.55)!important}`,
    `body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick .abNavIconSvg{width:24px!important;height:24px!important;flex:0 0 24px;stroke-width:2.2}`,
    `body.abV22812Shell .abGlobalActions[data-ab-quick-dock].abQuickCompact .abGlobalActionQuick{max-width:56px;padding-right:0}`,
    `}`,
    `@media(min-width:900px) and (prefers-reduced-motion:no-preference){body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{transition:max-width var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),padding var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}}`,
  ].join("\n");
}

// V85:R-9(T-19 에서 고친다고 적어 둔 것): 데스크톱 사이드바 현재 메뉴는 면 대비가 1.10~1.40:1 이고 테두리가 없었다. 라이트 글자는 옛 V22.8.11 셸 규칙의
// #1b64da 로 고정돼 톤을 따르지 않았고, 다크에서는 R-3(다크 링크 강조색) 때문에 모든 메뉴 글자가 강조색이라 글자로도 구분되지 않았다.
// 900px 이상에서 모든 메뉴 링크에 투명 1px 테두리를 두고(고른 것만 색이 생겨 글자가 밀리지 않는다) 현재 메뉴만 강조색 테두리·글자로 그린다.
// --ab12-accent 는 톤마다 AA 로 맞춘 값이라 accent-soft 면 위 글자도, 흰·어두운 사이드바 위 테두리(3:1 이상)도 된다. 다크의 다른 메뉴 글자는 보조색이다.
function deskNavCurrentCss() {
  return [
    `@media(min-width:900px){`,
    `body.abV22812Shell .abLayoutNav .abNavLinks a{border:1px solid transparent!important}`,
    `body.abV22812Shell .abLayoutNav .abNavLinks a.active{border-color:var(--ab12-accent)!important;background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abLayoutNav .abNavLinks a:not(.active){color:var(--ab12-muted)!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abLayoutNav .abNavLinks a:not(.active):hover{color:var(--ab12-text)!important}`,
    `}`,
  ].join("\n");
}

// T-16 저장 알림 ‘실행 취소’: 폼(POST /my/undo)은 상자를 만들지 않고(display:contents) 단추가 알림 줄의 한 칸이 된다.
// 모양·색은 옆 ‘예산 보기’·‘다시 시도’ 링크(.abSaveFeedbackAction, 시안 .undo 의 toastlink 색)와 같고, 단추 기본 테두리·바탕·글꼴만 지운다.
// 테두리에는 !important 를 쓰지 않는다 — 고대비(forced-colors) 모드에서 셸의 단추 테두리 규칙(ButtonText 1px)이 옆 링크처럼 이 단추에도 걸려야 한다.
// 바탕·글자색만 !important 로 덮는다(V87:W-4): 홈 자산(mobile-home-v22985.css)의 `.abV2281 button[type="submit"]:not(.danger)…`
// {background:var(--ab-blue)!important;color:#fff!important}(특이도 0,5,1)가 이 단추를 파랗게 채운 단추로 칠했다. 아래 두 줄은 0,5,3·0,6,3 이다.
// 예산 경고 알림(사용자 결정 2026-10-29)은 ‘예산 보기’·‘실행 취소’ 둘이라 문구 아래 한 줄로 내린다(hasActionRow). 첫 단추 글자가 문구와
// 같은 세로줄에 서도록 단추 안쪽 여백(8px)만큼 왼쪽으로 당기고, 44px 누름 칸의 아래 여백은 알림 안쪽 여백으로 들어간다.
function quickUndoCss() {
  return [
    `body.abV22812Shell .abSaveFeedbackUndo{display:contents}`,
    `body.abV22812Shell button.abSaveFeedbackAction{margin:0;border:0;background:transparent;font:inherit;font-size:14px;font-weight:800;cursor:pointer}`,
    `html body.abV22812Shell .abSaveFeedback button.abSaveFeedbackAction[data-ab-undo][type="submit"]{background:transparent!important;color:#93c5fd!important}`,
    `html[data-ab-resolved-theme="dark"] body.abV22812Shell .abSaveFeedback button.abSaveFeedbackAction[data-ab-undo][type="submit"]{color:#1d4ed8!important}`,
    `body.abV22812Shell .abSaveFeedback.hasActionRow{align-items:flex-start}`,
    `body.abV22812Shell .abSaveFeedbackActions{display:flex;flex-wrap:wrap;gap:4px;margin:2px 0 -10px -8px}`,
  ].join("\n");
}

// V85:R-10(사용자 결정 2026-10-29, 추천안): 생활비 리포트(/reports)의 기간 탭(월간·주간, .lrSeg)은 고른 칸 흰 면과 트랙의 대비가 1.08:1
// (다크 1.15:1)이었고, 다크에서는 R-3 의 링크 강조색 규칙(!important) 때문에 두 탭 글자가 같은 강조색이었다. R-9 처럼 고른 칸만 강조색 테두리·
// 옅은 면·톤 글자로, 안 고른 칸은 보조색 글자로 가른다. 모든 칸에 투명 1px 테두리를 두어 고를 때 글자가 밀리지 않는다.
// 소비 분석(/my/analysis)의 두 보기 탭(.lrSeg.abAnalysisViews)은 지시서 §1-7(분석 화면은 바꾸지 않는다)대로 그대로 둔다.
function reportPeriodTabsCss() {
  return [
    `body.abV22812Shell .lrSeg:not(.abAnalysisViews) a{border:1px solid transparent;color:var(--ab12-muted)!important}`,
    `body.abV22812Shell .lrSeg:not(.abAnalysisViews) a[aria-current="true"]{border-color:var(--ab12-accent);background:var(--ab12-accent-soft);color:var(--ab12-accent)!important;box-shadow:none}`,
  ].join("\n");
}

// T-23(결정 D-1 = 지시서 B ‘스택 정리’, 사용자 2026-10-29 "추천으로"): 글꼴 목록에서 Pretendard 를 뺀다. 자체 서빙(A)은 woff2 를 번들에 넣어야 해
// Free 3 MB 한도·첫 화면 속도에 걸리고, 글꼴 파일을 싣지 않는 지금은 Pretendard 를 따로 설치한 기기에서만 이름이 쓰였다.
// 목록은 앱의 다른 화면 규칙이 이미 쓰는 한 줄이다. 지시서 B 처럼 "Apple SD Gothic Neo"·"Malgun Gothic" 을 앞세우면 윈도의 숫자·영문이
// Segoe UI 에서 맑은 고딕 글자로 바뀌어 넣지 않았다(한글은 lang="ko" 와 운영체제 대체 글꼴이 그 두 글꼴을 고른다).
// 셸 본문 규칙(accountbook-shell-css.js)과 생활비 리포트 인라인 CSS 는 원문에서 뺐다. 옛 UI 런타임 규칙 body.abV2281{font-family:Pretendard,…!important}
// 은 1년 캐시 자산 두 개(ab-uiux-v22919.css·mobile-home-v22985.css)에 구워져 있어 주소를 올리지 않고 이 한 줄(특이도 0,2,1 > 0,1,1)로 덮는다.
// 옛 규칙은 5단계 T-24(CSS 계층 정리)에서 지운다.
function fontStackCss() {
  return `body.abV22812Shell.abV2281{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif!important}`;
}

function designUplift4Css() {
  return [`/* V22.9.87 T-19: 데스크톱 독 → 사이드바 검색 · 머리말 아이콘 단추 · 빠른 입력 단추 하나 / R-9 사이드바 현재 메뉴 / T-16 실행 취소 / R-10 리포트 기간 탭 / T-23 글꼴 */`, deskSearchCss(), deskHeadActionsCss(), quickFabCss(), deskNavCurrentCss(), quickUndoCss(), reportPeriodTabsCss(), fontStackCss()].join("\n");
}
// @build:exports-start
export { designUplift4Css };
// @build:exports-end
