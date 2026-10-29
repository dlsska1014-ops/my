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
// 그대로 남는다(16+24+16). 너비는 max-width 로 옮겨 그 사이를 그린다. 움직임 줄이기에서는 전환이 없어 바로 바뀐다.
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
    `@media(min-width:900px) and (prefers-reduced-motion:no-preference){body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{transition:max-width 220ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),padding 220ms var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}}`,
  ].join("\n");
}

function designUplift4Css() {
  return [`/* V22.9.87 T-19: 데스크톱 독 → 사이드바 검색 · 머리말 아이콘 단추 · 빠른 입력 단추 하나 */`, deskSearchCss(), deskHeadActionsCss(), quickFabCss()].join("\n");
}
// @build:exports-start
export { designUplift4Css };
// @build:exports-end
