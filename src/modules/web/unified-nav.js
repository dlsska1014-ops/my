// @build:imports-start
import { safeArray } from "../admin/backup-compare.js";
import {
  renderNavMiniCalendar, safeNavHouseholdId, safeNavMonth,
} from "../admin/ops-diagnostics-pages.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function renderAccountbookBrandIcon(className = "abBrandIcon") {
  return `<svg class="${escapeHtml(className)}" viewBox="0 0 24 24" aria-hidden="true" focusable="false"><rect x="4" y="3.5" width="16" height="17" rx="3"></rect><path d="M8 3.5v17M11 8h5M11 12h5M11 16h3"></path></svg>`;
}

function renderUnifiedNav(active = "home", opts = {}) {
  const month = safeNavMonth(opts.month);
  const householdId = safeNavHouseholdId(opts.householdId);
  const hh = householdId ? `&household_id=${encodeURIComponent(householdId)}` : "";
  const householdName = String(opts.householdName || opts.name || "가계부").trim() || "가계부";
  const sidebarRows = safeArray(opts.sidebarRows);
  const sidebarBudget = opts.sidebarBudget && typeof opts.sidebarBudget === "object" ? opts.sidebarBudget : {};
  // 사이드바 챌린지 사본은 걷어냈다. 이 사본을 그리던 화면은 셋(홈·통계·종합 리포트)
  // 뿐이었는데 셋 다 본문에 큰 챌린지 카드를 이미 들고 있었다 — 어느 화면에서도
  // "사이드바가 유일한 접점"인 적이 없었다. 같은 정보를 한 화면에 두 번 그리면서,
  // 좁은 사이드바 쪽은 7일 체크가 뭉개져 읽히지도 않았다. 사본이 사라졌으므로
  // compact 렌더 경로와 그 CSS 도 함께 지운다(죽은 채로 두면 다음 사람이 있다고 믿는다).
  const showSidebarDashboard = !!opts.showSidebarDashboard && !!householdId;
  const sidebarDashboardHtml = showSidebarDashboard
    ? `<div class="abNavDashboard">${renderNavMiniCalendar(month, householdId, sidebarRows)}</div>`
    : "";
  const cat = `/keyword-guide?month=${encodeURIComponent(month)}${hh}`;
  const app = `/app?month=${encodeURIComponent(month)}${hh}`;
  // V22.9.5 (개편 3단계): 묶는 기준을 **시스템 개념에서 하는 일로** 바꾼다.
  //
  // 계획서에는 "목적지 21개 → 3개"라고 적었는데, 재 보니 그 진단이 과장이었다.
  // 사이드바는 이미 그룹마다 <details> 로 접혀 있어서 한 번에 보이는 조작 요소는
  // 13~15개다. 21개 항목 중 20개는 실제로 서로 다른 화면이고(본문 해시로 확인),
  // 겹치는 것은 "가져오기"와 "백업·복구" 한 쌍뿐이다 — 그 둘은 같은 페이지의 두
  // 앵커이고 mode 파라미터는 서버 렌더를 바꾸지 않는다(활성 표시만 정한다).
  //
  // 그래서 줄일 것은 개수가 아니라 **분류 기준**이다. 옛 묶음은 자산·리포트·함께·관리
  // 처럼 시스템이 데이터를 나눈 방식이었고, 그 결과 "리포트" 한 그룹에 보기(통계·분석·
  // 월 마감·연간)와 계획(예산·정기·예산 알림)과 도구(스마트 도구)가 7개나 섞여 있었다.
  // 사람이 가계부에서 하는 일은 셋이다 — 적는다 · 본다 · 계획한다. 그 셋으로 나누고
  // 나머지는 설정으로 내린다. 항목은 하나도 지우지 않고 주소도 그대로다.
  //
  // 5/2/7/3/4 → 5/5/4/7. 가장 큰 그룹이 "설정"이 되는데, 설정은 훑어보는 곳이 아니라
  // 찾아가는 곳이라 그 자리가 낫다.
  let groups = [
    { key: "record", label: "적는다", icon: "records", items: [["app", "홈", app, "home"], ["records", "거래 내역", `/app?month=${encodeURIComponent(month)}${hh}&tab=transactions`, "records"], ["calendar", "캘린더", `/app?month=${encodeURIComponent(month)}${hh}&view=calendar#calendar`, "calendar"], ["import", "가져오기", `/my/backup?month=${encodeURIComponent(month)}${hh}&mode=import#myImportForm`, "import"]] },
    { key: "review", label: "본다", icon: "report", items: [["stats", "통계", `/my/analysis?month=${encodeURIComponent(month)}${hh}`, "stats"], ["analysis", "분석", `/my/analysis?month=${encodeURIComponent(month)}${hh}&view=report`, "report"], ["reports", "월 마감", `/reports?month=${encodeURIComponent(month)}${hh}`, "file"], ["annual", "연간 리포트", `/annual?year=${encodeURIComponent(month.slice(0, 4))}${hh}`, "report"], ["settlement", "정산 요약", `/settlement-summary?month=${encodeURIComponent(month)}${hh}`, "settlement"]] },
    { key: "plan", label: "계획한다", icon: "budget", items: [["budgets", "예산·정기", `/budgets?month=${encodeURIComponent(month)}${hh}`, "budget"], ["budget-alerts", "예산 알림", `/budget-alerts?month=${encodeURIComponent(month)}${hh}`, "bell"], ["goals", "저축·목표", `/goals?month=${encodeURIComponent(month)}${hh}`, "sparkle"], ["payment-methods", "자산·계좌", `/payment-methods?month=${encodeURIComponent(month)}${hh}`, "wallet"]] },
    { key: "settings", label: "설정", icon: "tools", items: [["members", "참여자·초대", `/my/members?month=${encodeURIComponent(month)}${hh}`, "users"], ["groups", "단톡방 연결", `/my/groups?month=${encodeURIComponent(month)}${hh}`, "chat"], ["my-households", "가계부 전환·추가", `/my/households?month=${encodeURIComponent(month)}${hh}`, "switch"], ["categories", "분류·키워드", cat, "tag"], ["smart-tools", "스마트 도구", `/smart-tools?month=${encodeURIComponent(month)}${hh}`, "sparkle"], ["backup", "백업·복구", `/my/backup?month=${encodeURIComponent(month)}${hh}&mode=backup`, "backup"], ["backup-login", "내 계정·보안", `/my/backup-login?return_to=${encodeURIComponent(`/menu?month=${encodeURIComponent(month)}${hh}`)}`, "shield"]] },
    { key: "ops", label: "운영 관리", icon: "shield", items: [["operation-center", "운영센터", "/operation-center", "tools"], ["release-candidate", "릴리스 후보", "/release-candidate", "check"], ["household-create-join", "가계부 생성·참여", "/household-create-join", "users"], ["ops-dashboard", "운영 대시보드", "/ops-dashboard", "report"], ["ops-duplicates", "중복 방어", "/ops-duplicates", "shield"], ["ops-traffic", "트래픽", "/ops-traffic", "report"], ["skill-ops", "스킬", "/skill-ops", "sparkle"], ["diagnostics", "시스템 진단", "/diagnostics", "tools"], ["deployment-check", "배포점검", "/deployment-check", "check"], ["ui-polish-check", "화면점검", "/ui-polish-check", "check"], ["final-release", "배포 확인", "/final-release", "check"]] },
  ];
  if (!opts.showOps) groups = groups.filter((g) => g.key !== "ops");
  const backupKeys = new Set(["backup-preview", "backup-compare", "backup-select", "backup-final", "backup-apply", "import-history", "rollback-candidates", "rollback-final"]);
  const opsKeys = new Set(["operation-center", "release-candidate", "ops-audit", "ops-dashboard", "ops-duplicates", "duplicate-safety", "ops-events", "ops-health", "ops-traffic", "skill-ops", "nav-audit", "route-audit", "ui-audit", "flow-audit", "filter-audit", "deployment-check", "ui-polish-check", "final-release", "feature-map", "deploy-runbook", "release-check", "user-ready-check", "release-dry-run", "diagnostics", "review-ready", "beta-ready"]);
  const adminKeys = new Set(["settings", "identity-audit"]);
  const implicitAdminScope = adminKeys.has(active) || (active === "households" && Object.keys(opts || {}).length === 0);
  const requestedScope = String(opts.scope || "").trim().toLowerCase();
  const navScope = ["user", "ops", "admin"].includes(requestedScope)
    ? requestedScope
    : (implicitAdminScope ? "admin" : opts.showOps || opsKeys.has(active) ? "ops" : "user");
  // V22.8.81: 예산·정기·설정은 한 묶음이라 어느 탭에 있어도 "예산·정기" 하나만 켠다.
  const activeAliases = new Map([["home", "app"], ["keyword-guide", "categories"], ["households", "my-households"], ["reserve-plans", "budgets"], ["settings", "budgets"]]);
  const activeKey = backupKeys.has(active) ? "backup" : opsKeys.has(active) ? "operation-center" : activeAliases.get(active) || active;
  const activeGroup = groups.find((g) => g.items.some((x) => x[0] === activeKey))?.key || "record";
  // V22.9.37 감사 U14: 참여자·초대와 단톡방 연결은 소유자·관리자만 열 수 있다. 일반 참여자(member·viewer)에게는
  // 숨기지 않고 "관리자 전용"을 붙인다 — 목적지 20개는 그대로 두되 눌러서 403 을 만나기 전에 알린다.
  // 역할을 넘기지 않은 화면(관리자 범위 등)은 예전과 같다.
  const navRole = String(opts.role || "").trim().toLowerCase();
  const adminOnlyKeys = ["member", "viewer"].includes(navRole) ? new Set(["members", "groups"]) : new Set();
  const groupHtml = groups.map((g) => {
    const open = g.key === activeGroup;
    const links = g.items.map(([key, label, href, itemIcon = "home"]) => {
      const adminOnly = adminOnlyKeys.has(key);
      const classes = [key === activeKey ? "active" : "", adminOnly ? "abNavAdminOnly" : ""].filter(Boolean).join(" ");
      return `<a data-key="${escapeHtml(key)}"${classes ? ` class="${classes}"` : ""} href="${escapeHtml(href)}"${adminOnly ? ' title="관리자 전용"' : ""}${key === activeKey ? ' aria-current="page"' : ""}><i class="abNavItemIcon" data-ab-nav-icon="${escapeHtml(itemIcon)}"></i><span>${escapeHtml(label)}</span>${adminOnly ? '<small class="abNavAdminTag">관리자 전용</small>' : ""}</a>`;
    }).join("");
    return `<details class="abNavGroup ${g.key === "record" ? "abNavGroupPrimary" : ""}"${open ? " open" : ""}><summary><i data-ab-nav-icon="${escapeHtml(g.icon)}"></i><b>${escapeHtml(g.label)}</b></summary><div class="abNavLinks">${links}</div></details>`;
  }).join("");
  // V22.8.87 통합 작업지시서 M1. 다섯 칸은 유지하되 가운데를 기록으로 넘긴다.
  // 정산은 다섯 손가락 자리를 차지할 만큼 자주 쓰는 화면이 아니라 통계 화면
  // 머리말의 진입점으로 내렸다. /settlement-summary 주소는 그대로다 — 기존 링크와
  // 북마크가 살아 있어야 한다.
  //
  // ＋ 를 <button> 이 아니라 <a> 로 둔 이유: 지시서는 "시트를 여는 버튼"이라고
  // 적었지만, 버튼은 JS 가 없으면 아무 데도 가지 못한다. 링크로 두면 JS 가 있을 때
  // 시트를 열고(기존 data-ab-quick-open 경로) 없으면 입력 자리로 이동한다.
  // 지시서가 대체 목적지로 적은 /quick 은 이 앱에 없는 주소여서, 이미 동작하는
  // 입력 앵커를 쓴다.
  const bottomDefs = [
    ["home", "홈", "home", app, false],
    ["records", "거래", "records", `${app}&tab=transactions`, false],
    ["quick", "입력", "plus", `${app}#add`, true],
    ["stats", "통계", "stats", `/my/analysis?month=${encodeURIComponent(month)}${hh}`, false],
    ["budgets", "예산", "budget", `/budgets?month=${encodeURIComponent(month)}${hh}`, false],
  ];
  const bottomLinks = bottomDefs.map(([key, label, icon, href, isQuick]) => {
    // ＋ 는 어느 화면에 있든 "현재 위치"가 아니다. active 를 주면 파란 원이
    // 현재 탭 표시와 겹쳐 읽힌다.
    const on = !isQuick && (key === activeKey
      || (key === "home" && activeKey === "app")
      || (key === "records" && activeKey === "calendar")
      || (key === "stats" && activeKey === "analysis"));
    const cls = [isQuick ? "abNavQuick" : "", on ? "active" : ""].filter(Boolean).join(" ");
    return `<a data-key="${escapeHtml(key)}"${isQuick ? ' data-ab-quick-open aria-label="빠른 입력"' : ""} class="${cls}" ${on ? `aria-current="page"` : ""} href="${escapeHtml(href)}"><i data-ab-nav-icon="${escapeHtml(icon)}"></i><span>${escapeHtml(label)}</span></a>`;
  }).join("");
  // V22.9.37 감사 H1·U3: 실제로 그린 가계부·월을 표식에 싣는다. 쿠키로 채운 진입(설치 앱 /app, 예산 바로가기)은 주소에
  // household_id 가 없어서 검색·알림·즐겨찾기·목표·활동 레일이 첫 가계부로 갔다. 클라이언트는 이 표식을 먼저 읽는다.
  return `<div class="abNavScope" data-nav-scope="${navScope}" data-ab-hh="${escapeHtml(householdId)}" hidden></div>${navScope === "user" ? "" : `<style id="unifiedNavStyle">
:root{--abNavW:238px;--abNavCollapsed:72px;--abSafeTop:env(safe-area-inset-top,0px);--abSafeBottom:env(safe-area-inset-bottom,0px)}
.abLayoutNav{font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;color:#111827}
.abNavIconSvg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
@media(min-width:900px){
  body{padding-left:var(--abNavW)!important;transition:padding-left var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
  body.abNavCollapsed{padding-left:var(--abNavCollapsed)!important}
  .abLayoutNav{position:fixed;left:0;top:0;bottom:0;width:var(--abNavW);z-index:2100;background:linear-gradient(180deg,#ffffff 0%,#fbfcff 100%);border-right:1px solid #edf0f5;box-shadow:10px 0 28px rgba(15,23,42,.055);display:flex;flex-direction:column;transition:width var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
  body.abNavCollapsed .abLayoutNav{width:var(--abNavCollapsed)}
  .abNavMobileTop,.abNavBottom{display:none!important}
}
@media(max-width:899px){
  body{padding-left:0!important;padding-top:calc(48px + var(--abSafeTop))!important;padding-bottom:calc(82px + var(--abSafeBottom))!important;overflow-x:hidden!important}
  .abLayoutNav{display:none!important}
  .abNavMobileTop{position:fixed;top:0;left:0;right:0;height:calc(48px + var(--abSafeTop));z-index:2200;background:rgba(255,255,255,.96);backdrop-filter:blur(14px);border-bottom:1px solid #eef0f3;display:flex;align-items:center;justify-content:space-between;padding:var(--abSafeTop) 14px 0 14px;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;transition:transform var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
  body.abTopHidden .abNavMobileTop{transform:translateY(-110%)}
  .abNavMobileTop a{color:#111827;text-decoration:none;font-weight:800;font-size:15px;max-width:72vw;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .abNavMobileTop button{border:0;background:#F2F4F6;color:#333;border-radius:11px;min-height:32px;padding:0 12px;font-weight:800;font-size:13px}
  .abNavMobileDrawer{position:fixed;left:0;right:0;top:calc(48px + var(--abSafeTop));z-index:2199;background:#fff;border-bottom:1px solid #e5e7eb;box-shadow:0 18px 36px rgba(15,23,42,.16);padding:10px;max-height:calc(80vh - var(--abSafeTop));overflow:auto;-webkit-overflow-scrolling:touch;display:none}
  body.abMobileNavOpen .abNavMobileDrawer{display:block!important}
  .abNavBottom{position:fixed;left:0;right:0;bottom:0;z-index:2200;height:calc(72px + var(--abSafeBottom));padding-bottom:var(--abSafeBottom);background:rgba(255,255,255,.97);backdrop-filter:blur(18px);border-top:1px solid #eef0f3;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}
  .abNavBottom a{display:flex;align-items:center;justify-content:center;color:#8b95a1;text-decoration:none;font-size:12px;font-weight:800;min-width:0;min-height:48px;text-align:center;padding:0 2px;line-height:1.2}
}
.abNavTop{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:13px 12px;border-bottom:1px solid #f1f5f9}
.abNavBrand{display:flex;align-items:center;gap:9px;min-width:0;text-decoration:none;color:#111827!important;font-weight:1000}
.abNavLogo{width:40px;height:40px;border-radius:16px;background:linear-gradient(135deg,#FEE500,#ffd84d);color:#191919;display:grid;place-items:center;box-shadow:0 10px 20px rgba(250,204,21,.22)}
.abNavBrandText{display:flex;flex-direction:column;line-height:1.15}.abNavBrandText small{font-size:11px;color:#8b95a1;margin-top:2px;font-weight:800}
.abNavToggle{width:36px;height:36px;border:0;border-radius:13px;background:#f3f4f6;color:#111827;font-size:18px;font-weight:1000;cursor:pointer}
.abNavBody{flex:1;overflow:auto;padding:10px}
.abNavGroup{margin:6px 0;border-radius:16px}
.abNavGroup summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px;min-height:42px;padding:0 11px;border-radius:15px;color:#4b5563;font-weight:1000}
.abNavGroup summary::-webkit-details-marker{display:none}
.abNavGroup[open] summary{background:#f3f6fb;color:#111827;box-shadow:inset 0 0 0 1px #eef2f7}.abNavGroup summary i{font-style:normal;width:26px;text-align:center;font-size:17px;flex:0 0 26px}.abNavGroup summary b{font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.abNavLinks{display:grid;gap:4px;padding:6px 0 8px 36px}.abNavLinks a{min-height:38px;display:flex;align-items:center;border-radius:13px;padding:0 10px;color:#374151;text-decoration:none;font-size:13px;font-weight:900}.abNavLinks a:hover{background:#f3f4f6}.abNavLinks a.active{background:linear-gradient(135deg,#111827,#334155);color:#fff!important;box-shadow:0 8px 18px rgba(15,23,42,.18)}
.abNavFooter{padding:12px;border-top:1px solid #f1f5f9}.abNavGuide{display:block;text-decoration:none;background:linear-gradient(135deg,#ecfdf5,#f0fdfa);border:1px solid #a7f3d0;color:#065f46;border-radius:18px;padding:12px;font-weight:1000;font-size:13px;box-shadow:0 8px 18px rgba(16,185,129,.08)}.abNavGuide small{display:block;color:#047857;font-size:11px;margin-top:3px;font-weight:800}.abNavGuideActive{background:linear-gradient(135deg,#10b981,#059669);border-color:#059669;color:#fff!important;box-shadow:0 10px 22px rgba(16,185,129,.28)}.abNavGuideActive small{color:#d1fae5!important}
body.abNavCollapsed .abNavBrandText,body.abNavCollapsed .abNavGroup summary b,body.abNavCollapsed .abNavLinks,body.abNavCollapsed .abNavGuide small,body.abNavCollapsed .abNavGuide span{display:none}
body.abNavCollapsed .abNavTop{justify-content:center;flex-direction:column}body.abNavCollapsed .abNavToggle{transform:rotate(180deg)}body.abNavCollapsed .abNavGroup summary{justify-content:center;padding:0}body.abNavCollapsed .abNavFooter{padding:9px}.abNavMobileDrawer .abNavGroup summary{min-height:44px}.abNavMobileDrawer .abNavLinks{padding-left:10px;grid-template-columns:1fr;display:grid}.abNavMobileDrawer .abNavLinks a{min-height:48px;background:#f8fafc}
.abNavBottom a{flex-direction:column;gap:3px;letter-spacing:-.04em;position:relative}.abNavBottom a i{font-style:normal;font-size:19px;line-height:1;opacity:.75}.abNavBottom a span{display:block;font-size:10px}.abNavBottom a.active{color:#111827!important}.abNavBottom a.active i{opacity:1}.abNavBottom a.active span{font-weight:900}.abNavBottom a.active:before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:26px;height:3px;border-radius:0 0 4px 4px;background:#FEE500}
body.abMobileNavOpen{overflow:hidden!important}
body.abMobileNavOpen .abNavMobileTop{transform:none!important}
body.abMobileNavOpen:after{content:"";position:fixed;left:0;right:0;top:calc(48px + var(--abSafeTop));bottom:calc(58px + var(--abSafeBottom));background:rgba(15,23,42,.22);z-index:2198}
.abNavMobileDrawer{border-radius:0 0 22px 22px}.abNavMobileDrawer .abNavGroup[open] summary{background:#111827;color:#fff}.abNavMobileDrawer .abNavLinks a.active{background:#FEE500!important;color:#191919!important}
@media(max-width:420px){.abNavMobileTop button{min-width:64px}.abNavMobileDrawer .abNavLinks{grid-template-columns:1fr}.abNavBottom a{font-size:11px}.abNavBottom a span{font-size:10px}}
/* v18.8 global stability additions */
select[size],select:focus{max-height:45vh}
@media(max-width:640px){
  .weekdayTrendGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .readableTrendGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .activeDayGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}
  .fullCalendar .calendarGrid{max-height:none;overflow:visible}
}

/* v18.7 visual readability stabilizer */
.hero,.card,.panel,.homeBudget,.heroCard{box-shadow:0 12px 28px rgba(15,23,42,.055)}
button,.filters button,.formGrid button{font-weight:1000;letter-spacing:-.03em}
.note,.tip,.muted{line-height:1.55}
@media(max-width:640px){
  .basisGrid li{grid-template-columns:1fr auto!important}
  .basisGrid li b{font-size:15px!important;word-break:keep-all!important}
  .basisGrid li span{font-size:14px!important;white-space:nowrap!important}
  .readableTrendGrid{grid-template-columns:repeat(3,1fr)!important}
}

/* v18.6 common UI/UX stabilizer */
*{min-width:0}
html{scroll-padding-top:calc(60px + var(--abSafeTop));}
body{overflow-x:hidden!important}
.card,.panel,.hero,.heroCard,.homeBudget{overflow:hidden}
input,select,textarea,button{max-width:100%;font-family:inherit}
button,a,.abNavLinks a,.abNavBottom a{-webkit-tap-highlight-color:rgba(254,229,0,.35)}
.tableWrap,.calendarWrap{max-width:100%;overflow-x:auto;-webkit-overflow-scrolling:touch}
@media(min-width:900px){
  main.wrap,.wrap{max-width:min(1180px,calc(100vw - var(--abNavW) - 32px));}
  body.abNavCollapsed main.wrap,body.abNavCollapsed .wrap{max-width:min(1240px,calc(100vw - var(--abNavCollapsed) - 32px));}
}
@media(max-width:899px){
  main,.wrap,header{width:100%!important;max-width:100%!important}
  .wrap,main{padding-left:12px!important;padding-right:12px!important}
  .hero,.card,.panel,.homeBudget,.heroCard{border-radius:20px!important}
  .appTop{top:calc(48px + var(--abSafeTop))!important;z-index:1800!important}
  .selectLine,.filters,.formGrid,.manualGrid,.mobileFilterForm{grid-template-columns:1fr!important}
  .filters select,.filters input,.filters button,.formGrid input,.formGrid select,.formGrid button,.manualGrid input,.manualGrid select,.manualGrid button,.mobileFilterForm input,.mobileFilterForm select,.mobileFilterForm button,.selectLine select,.selectLine input{width:100%!important;min-height:46px!important;font-size:16px!important}
  .toolbar,.topbar,.row{gap:8px!important}
  .toolbar>*,.row>*{min-width:0}
  table{font-size:13px}
  th,td{white-space:normal}
}
@media(max-width:640px){
  .hero h1,.heroCard h1{font-size:23px!important;line-height:1.25!important}
  .card,.panel{padding:14px!important}
  .metricGrid,.grid-kpi{grid-template-columns:1fr 1fr!important}.basisGrid{grid-template-columns:1fr!important}
  .metric b,.kpi b{font-size:20px!important}
  .tableWrap:before,.calendarWrap:before{content:"좌우로 밀어서 전체 보기";display:block;color:#64748b;font-size:11px;margin:0 0 6px 2px}
}

/* ================================================================
   v19.0 통합 디자인 시스템 — 화면마다 제각각이던 히어로 색상/그림자/여백을
   카카오톡·토스 스타일의 하나의 톤(화이트 베이스 + 옐로우 포인트)으로 통일합니다.
   기존 각 화면의 <style>은 그대로 두고, 아래 규칙으로 겉모습만 안전하게 덮어씁니다.
   ================================================================ */
:root{
  --ab-bg:#F7F8FA;--ab-surface:#FFFFFF;--ab-ink:#191919;--ab-sub:#6B7280;
  --ab-line:#ECEFF3;--ab-accent:#FEE500;--ab-dark:#111827;--ab-blue:#3182F6;
  --ab-green:#0AA96B;--ab-red:#F04452;
  --ab-shadow:0 2px 14px rgba(15,23,42,.06);
  --ab-radius:20px;--ab-radius-sm:16px;
}
body{background:var(--ab-bg)!important}
/* 히어로: 화면마다 다른 보라/초록/주황/남색 그라데이션 → 하나의 화이트 톤 */
.hero{background:var(--ab-surface)!important;color:var(--ab-ink)!important;border:1px solid var(--ab-line)!important;box-shadow:var(--ab-shadow)!important;border-radius:var(--ab-radius)!important;padding:22px 20px!important}
.hero h1{color:var(--ab-ink)!important;font-size:21px!important;font-weight:800!important;letter-spacing:-.02em!important;margin:0 0 6px!important;opacity:1!important}
.hero p{color:var(--ab-sub)!important;font-size:14px!important;line-height:1.6!important;opacity:1!important;margin:0}
.hero .progress,.hero .skill{background:#EEF0F3!important;color:var(--ab-ink)!important}
.hero .progress i,.hero .bar{background:var(--ab-accent)!important}
/* 카드/위젯류: 과한 그림자를 하나의 은은한 그림자로, 모서리도 하나의 값으로 통일 */
.card,.panel,.metric,.opCard,.link,.hhCard,.memberCard,.catCard,.guideCard,.assetCard,
.reserveCard,.ex,.flowCard,.sample,.menuCard,.step,.stepCard,.linkCard,.miniMetric,
.groupCard{box-shadow:var(--ab-shadow)!important;border-radius:18px!important}
.metric,.miniMetric{border-radius:16px!important}
.card,.panel{padding:18px!important}
main.wrap>section,.wrap>section{margin:14px 0!important}
.card h2,.panel h2,.card h3,.panel h3{font-size:16px!important;font-weight:800!important;margin:0 0 10px!important;color:var(--ab-ink)!important}
/* 숫자 위계: 핵심 숫자는 크고 굵게, 라벨은 작고 흐리게 — 화면마다 다르던 크기를 통일 */
.metric span,.miniMetric span{color:var(--ab-sub)!important;font-size:12px!important;font-weight:700!important}
.metric b,.miniMetric b{font-size:21px!important;font-weight:800!important;letter-spacing:-.02em!important;color:var(--ab-ink)!important;margin-top:6px!important}
/* 버튼: 터치 영역과 굵기를 통일(의미가 있는 색상은 그대로 유지) */
.btn,.filters button,.formGrid button,.kwForm button,.miniForm button,form>button[type="submit"]{border-radius:14px!important;font-weight:800!important;letter-spacing:-.01em!important;min-height:44px!important}
input,select,textarea{border-radius:13px!important}
.tableWrap table,table{font-size:13px!important}
.tableWrap th,.tableWrap td,table th,table td{padding:12px 10px!important}
@media(max-width:760px){
  main.wrap,.wrap{padding:12px 12px 28px!important}
  main.wrap>section,.wrap>section{margin:12px 0!important}
  .hero{padding:18px 16px!important;border-radius:16px!important}
  .hero h1{font-size:19px!important}
  .card,.panel{padding:16px!important;border-radius:16px!important}
  .grid{gap:8px!important}
}
@media(min-width:900px){
  .hero{padding:26px 26px!important}
  .hero h1{font-size:24px!important}
  .card,.panel{padding:22px!important}
  .metric b{font-size:24px!important}
}
</style>`}<aside id="abDesktopSidebar" class="abLayoutNav abNavMobileDrawer" aria-label="가계부 전체 메뉴"><div class="abNavTop"><a class="abNavBrand" href="${escapeHtml(app)}"><span class="abNavLogo">${renderAccountbookBrandIcon()}</span><span class="abNavBrandText" title="${escapeHtml(householdName)}">${escapeHtml(householdName)}<small>말해가계부</small></span></a><button id="abDesktopNavToggle" class="abNavToggle" type="button" onclick="toggleAbSideNav()" aria-controls="abDesktopSidebar" aria-expanded="true" aria-label="사이드바 접기"><svg class="abNavToggleIcon" viewBox="0 0 20 20" aria-hidden="true" focusable="false"><path d="m12.5 5-5 5 5 5"></path></svg></button></div>${sidebarDashboardHtml}<nav class="abNavBody">${groupHtml}</nav><div class="abNavFooter"><a class="abNavGuide" href="/start-guide?month=${encodeURIComponent(month)}${hh}"><span>처음 사용 가이드</span><small>첫 기록까지 차근차근</small></a></div></aside><div class="abNavMobileTop"><a href="${escapeHtml(app)}"><span class="abNavMobileLogo">${renderAccountbookBrandIcon("abBrandIcon abBrandIconMobile")}</span>${escapeHtml(householdName)}</a><button id="abMobileMenuButton" type="button" onclick="toggleAbMobileNav()" aria-controls="abDesktopSidebar" aria-expanded="false">전체 메뉴</button></div><nav class="abNavBottom" aria-label="가계부 주요 메뉴">${bottomLinks}</nav>${navScope === "user" ? "" : `<script>(function(){function syncMobileMenu(open){document.body.classList.toggle("abMobileNavOpen",!!open);var button=document.getElementById("abMobileMenuButton");if(button)button.setAttribute("aria-expanded",open?"true":"false");}function syncSideNav(collapsed){document.body.classList.toggle("abNavCollapsed",!!collapsed);var button=document.getElementById("abDesktopNavToggle");if(button){button.setAttribute("aria-expanded",collapsed?"false":"true");button.setAttribute("aria-label",collapsed?"사이드바 펼치기":"사이드바 접기");}}window.syncAbMobileMenu=syncMobileMenu;window.syncAbSideNav=syncSideNav;try{syncSideNav(localStorage.getItem("abNavCollapsed")==="1")}catch(e){syncSideNav(false)}document.addEventListener("click",function(ev){var link=ev.target&&ev.target.closest&&ev.target.closest(".abLayoutNav a");if(link&&window.matchMedia&&window.matchMedia("(max-width:899px)").matches){syncMobileMenu(false);return;}var drawer=ev.target&&ev.target.closest&&ev.target.closest(".abLayoutNav");var top=ev.target&&ev.target.closest&&ev.target.closest(".abNavMobileTop");if(document.body.classList.contains("abMobileNavOpen")&&!drawer&&!top)syncMobileMenu(false);});document.addEventListener("keydown",function(ev){if(ev.key==="Escape")syncMobileMenu(false);});})();function toggleAbSideNav(){var collapsed=!document.body.classList.contains("abNavCollapsed");if(window.syncAbSideNav)window.syncAbSideNav(collapsed);try{localStorage.setItem("abNavCollapsed",collapsed?"1":"0")}catch(e){}}function toggleAbMobileNav(){if(window.syncAbMobileMenu)window.syncAbMobileMenu(!document.body.classList.contains("abMobileNavOpen"))}</script>`}`;
}
// @build:exports-start
export { renderUnifiedNav };
// @build:exports-end
