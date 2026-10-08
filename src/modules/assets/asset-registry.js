const MOBILE_HOME_CSS_ASSET_PATH = "/assets/mobile-home-v22919.css";
const AB_UIUX_CSS_ASSET_PATH = "/assets/ab-uiux-v22919.css";
const MOBILE_HOME_JS_ASSET_PATH = "/assets/mobile-home-v22930.js";
const LEGACY_ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22811.css";
const ACCOUNTBOOK_SHELL_CSS_ASSET_PATH = "/assets/accountbook-shell-v22925.css";
const ACCOUNTBOOK_EXPERIENCE_CSS = `
/* V22.9.25: scoped enhancements preserve the analysis surface and theme tokens. */
body.abV22812Shell .homeReports{container-type:inline-size;container-name:home-reports}
@container home-reports (min-width:760px){body.abV22812Shell .homeReportGrid{grid-template-columns:repeat(4,minmax(0,1fr))}}
body.abV22812Shell .homeReportTop>span,body.abV22812Shell .homeReport>small{font-weight:500}
body.abV22812Shell .homeMetrics{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
body.abV22812Shell .homeMetrics>.homeUsage{grid-column:1/-1}
body.abV22812Shell .homeMetric{min-width:0;padding:14px!important}
body.abV22812Shell .homeMetric>b{font-variant-numeric:tabular-nums;font-size:clamp(17px,3.8vw,24px)!important;overflow-wrap:anywhere}
body.abV22812Shell .homeMetric>span{font-weight:500!important}
body.abV22812Shell .homeReportsEdit{display:inline-flex;align-items:center;min-height:44px;padding:0 8px}
body.abV22812Shell .homeInsights{margin:12px 0;border:1px solid var(--line);border-radius:16px;background:var(--card)}
body.abV22812Shell .homeInsights>summary{display:flex;justify-content:space-between;align-items:center;gap:12px;min-height:64px;padding:12px 16px;cursor:pointer;list-style:none}
body.abV22812Shell .homeInsights>summary::-webkit-details-marker{display:none}
body.abV22812Shell .homeInsights>summary:after{content:'＋';flex:none;color:var(--sub)}
body.abV22812Shell .homeInsights[open]>summary:after{content:'−'}
body.abV22812Shell .homeInsights>summary{font-size:14px;font-weight:650}
body.abV22812Shell .homeCategoryHead{display:flex;align-items:center;justify-content:space-between;gap:8px}
body.abV22812Shell .homeCategoryLink{display:inline-flex;align-items:center;min-height:44px;font-size:12px;color:var(--ab12-accent);text-decoration:none;font-weight:600}
body.abV22812Shell .homeSpender{width:100%;min-height:44px;border:1px solid var(--line);border-radius:15px;padding:0 12px}
body.abV22812Shell .homeInsights .homeGrid{margin:0;padding:0 12px 12px}
body.abV22812Shell .txTabFilter{padding:8px 16px!important;margin:8px 0!important;box-shadow:none}
body.abV22812Shell .txFilterMore>summary{min-height:44px;display:flex;align-items:center;font-weight:600}
body.abV22812Shell .abQuickValue{padding:12px 14px;margin-top:12px;border-left:3px solid var(--accent);background:var(--card-2);border-radius:8px;display:grid;gap:4px;overflow-wrap:anywhere}
body.abV22812Shell .abQuickValue[hidden]{display:none}
body.abV22812Shell .abQuickValue>span{font-size:12px;color:var(--sub)}
body.abV22812Shell .abQuickValue>b{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums}
body.abV22812Shell .abQuickValue>small{font-size:14px;color:var(--text);line-height:1.5}
body.abV22812Shell .abDailyHelp{margin-top:4px;font-size:12px;color:var(--sub)}
body.abV22812Shell .abDailyHelp>summary,body.abV22812Shell .abHelpButton{display:inline-flex;align-items:center;min-height:44px;padding:0 4px;font:inherit;font-size:12px;color:var(--sub)!important;background:transparent!important;border:0;cursor:pointer}
body.abV22812Shell .abHelpPopover{position:fixed;inset:50% auto auto 50%;transform:translate(-50%,-50%);width:min(320px,calc(100vw - 32px));margin:0;padding:16px;color:var(--text);background:var(--card);border:1px solid var(--line);border-radius:14px;line-height:1.6;font-size:14px;box-shadow:var(--shadow)}
@supports(position-area:bottom){body.abV22812Shell .abHelpPopover{inset:auto;transform:none;position-area:bottom;position-try-fallbacks:flip-block,flip-inline;margin:8px}}
body.abTxDetailOpen{overflow:hidden}
body.abV22812Shell .abTxDetail{padding:0;width:min(560px,calc(100vw - 32px));max-height:calc(100dvh - 40px);max-width:calc(100vw - 32px);border:1px solid var(--line);border-radius:22px;background:var(--card);color:var(--text);box-shadow:var(--shadow)}
body.abV22812Shell .abTxDetail::backdrop{background:rgba(15,23,42,.48)}
body.abV22812Shell .abTxDetailHead{display:flex;justify-content:space-between;align-items:center;gap:16px;padding:16px 20px;border-bottom:1px solid var(--line)}
body.abV22812Shell .abTxDetailHead h2{font-size:18px;font-weight:700;margin:0}
body.abV22812Shell .abTxDetailHead button{width:44px;min-height:44px;border:0;background:var(--card-2);color:var(--text);border-radius:12px;font-size:24px;cursor:pointer}
body.abV22812Shell .abTxDetailBody{padding:20px;overflow:auto;max-height:calc(100dvh - 230px);overscroll-behavior:contain}
body.abV22812Shell .abTxOverview h3{font-size:19px;margin:0 0 16px;overflow-wrap:anywhere;font-weight:600}
body.abV22812Shell .abTxDetailAmount{display:block;font-size:30px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
body.abV22812Shell .abTxOverview p{white-space:pre-line;line-height:1.7;font-size:14px;overflow-wrap:anywhere}
body.abV22812Shell .abTxDetailNote{color:var(--sub);font-size:13px!important}
body.abV22812Shell .abTxDetailFoot{display:flex;gap:8px;padding:12px 20px calc(12px + env(safe-area-inset-bottom));border-top:1px solid var(--line);background:var(--card)}
body.abV22812Shell .abTxDetailFoot button{flex:1;min-height:48px;font-size:15px}
body.abV22812Shell .abTxDetail .v8-edit{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:0}
body.abV22812Shell .abTxDetail .v8-edit :is(input,select){min-width:0;width:100%;min-height:48px;font-size:16px}
body.abV22812Shell .abTxDetail .v8-edit button{min-height:48px}
body.abV22812Shell .abTxDetail .abTxField{display:grid;gap:6px;min-width:0;font-size:13px;color:var(--sub)}
body.abV22812Shell .abTxDetail .v8-spender-readonly,body.abV22812Shell .abTxDetail .v8-edit-field{grid-column:1/-1}
body.abV22812Shell .abEditStatus{font-size:14px;line-height:1.6;color:var(--sub)}
body.abV22812Shell .importSelectionSummary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin:16px 0;padding:16px;background:var(--card-2);border:1px solid var(--line);border-radius:14px}
body.abV22812Shell .importSelectionSummary>div{display:grid;gap:6px;min-width:0}
body.abV22812Shell .importSelectionSummary span{font-size:13px;color:var(--sub)}
body.abV22812Shell .importSelectionSummary b{font-size:22px;font-weight:700;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
body.abV22812Shell .importSelectionSummary>p,body.abV22812Shell .importSelectionSummary>small{grid-column:1/-1;margin:0;font-size:13px;line-height:1.6;color:var(--sub)}
body.abV22812Shell .importReviewBadge{color:var(--ab12-warn-text)!important;background:var(--ab12-warn-bg);padding:6px 8px;border-radius:6px}
body.abV22812Shell .importPick{margin:0;cursor:pointer}
body.abV22812Shell .importPickTarget{display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;cursor:pointer}
body.abV22812Shell.abImportPreview .mapping span{background:var(--card-2);color:var(--text);border-color:var(--line)}
body.abV22812Shell.abImportPreview .notice{background:var(--card-2)!important;color:var(--sub)!important;border-color:var(--line)}
body.abV22812Shell.abImportPreview .soft{background:var(--card-2)!important;color:var(--text)!important;border:1px solid var(--line)}
body.abV22812Shell.abImportPreview td small{color:var(--sub)}
body.abV22812Shell.abImportPreview #myImportCommitForm .toolbar a.btn{background:var(--card-2);color:var(--text);border:1px solid var(--line)}
body.abV22812Shell .abTransactionSummary,body.abV22812Shell .abTransactionConditions,body.abV22812Shell .abTransactionTools{padding:20px;border-bottom:1px solid var(--line)}
body.abV22812Shell .abTransactionSummary>span{font-size:13px;color:var(--sub)}
body.abV22812Shell .abTransactionSummary>b{display:block;margin:8px 0;font-size:32px;font-weight:700}
body.abV22812Shell .abTransactionSummary dl>div{display:flex;justify-content:space-between;gap:12px;margin:12px 0}
body.abV22812Shell .abTransactionSummary dd{margin:0;font-weight:650;font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
body.abV22812Shell .abTransactionConditions h3,body.abV22812Shell .abTransactionTools h3{font-size:14px;margin:0 0 12px;font-weight:650}
body.abV22812Shell .abTransactionConditions p{white-space:pre-line;overflow-wrap:anywhere;font-size:14px;line-height:1.7;color:var(--sub);margin:0}
body.abV22812Shell .abTransactionTools nav{display:grid;gap:8px;grid-template-columns:repeat(2,minmax(0,1fr))}
body.abV22812Shell .abTransactionTools a{display:flex;align-items:center;min-height:44px;padding:10px;font-size:13px;white-space:normal}
body.abV22812Shell .abTransactionHint{padding:0 20px;font-size:13px;line-height:1.7;color:var(--sub)}
body.abV22812Shell .abTransactionRail{overflow:auto}
@media(max-width:599px){body.abV22812Shell .abTxDetail{margin:auto 0 0;width:100%;max-width:100%;max-height:90dvh;border-radius:22px 22px 0 0;border-bottom:0}body.abV22812Shell .abTxDetail .v8-edit{grid-template-columns:minmax(0,1fr)}}
@media(max-width:599px){
body.abV22812Shell.abImportPreview #myImportCommitForm .tableWrap{overflow:visible;border:0}
body.abV22812Shell.abImportPreview #myImportCommitForm table{display:block;min-width:0;width:100%}
body.abV22812Shell.abImportPreview #myImportCommitForm thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
body.abV22812Shell.abImportPreview #myImportCommitForm tbody{display:grid;gap:12px}
body.abV22812Shell.abImportPreview #myImportCommitForm tr{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));padding:12px;border:1px solid var(--line);border-radius:14px;background:var(--card)}
body.abV22812Shell.abImportPreview #myImportCommitForm tr[hidden]{display:none}
body.abV22812Shell.abImportPreview #myImportCommitForm td{display:block;min-width:0;padding:6px;border:0;overflow-wrap:anywhere}
body.abV22812Shell.abImportPreview #myImportCommitForm td:before{content:attr(data-label);display:block;font-size:12px;color:var(--sub);margin-bottom:6px}
body.abV22812Shell.abImportPreview #myImportCommitForm td:first-child{display:flex;align-items:center;gap:8px}
body.abV22812Shell.abImportPreview #myImportCommitForm td:nth-child(5),body.abV22812Shell.abImportPreview #myImportCommitForm td:nth-child(6),body.abV22812Shell.abImportPreview #myImportCommitForm td:nth-child(7){grid-column:1/-1}
body.abV22812Shell.abImportPreview #myImportCommitForm td:nth-child(5){font-size:20px;font-weight:700;font-variant-numeric:tabular-nums}
}
@media(prefers-reduced-motion:no-preference){body.abV22812Shell .abTxDetail[open]{animation:abTxAppear 140ms ease-out}@keyframes abTxAppear{from{opacity:0;translate:0 12px}to{opacity:1;translate:0 0}}}
`;
const ACCOUNTBOOK_THEME_JS_ASSET_PATH = "/assets/accountbook-theme-v2299.js";
const MOBILE_HOME_SHELL_JS_ASSET_PATH = "/assets/mobile-home-shell-v22930.js";
const ACCOUNTBOOK_STAGE4_NAV_JS_ASSET_PATH = "/assets/accountbook-nav-v22930.js";
const ACCOUNTBOOK_SEARCH_JS_ASSET_PATH = "/assets/accountbook-search-v22929.js";
const ACCOUNTBOOK_NOTIF_JS_ASSET_PATH = "/assets/accountbook-notif-v22836.js";
const ACCOUNTBOOK_GOALS_JS_ASSET_PATH = "/assets/accountbook-goals-v22929.js";
const ACCOUNTBOOK_FAVROWS_JS_ASSET_PATH = "/assets/accountbook-favrows-v22836.js";
const ACCOUNTBOOK_V5_BUNDLE_JS_ASSET_PATH = "/assets/accountbook-v5-v22930.js";
let AB_MOBILE_HOME_CSS_CACHE = "";
let AB_MOBILE_HOME_JS_CACHE = "";
let AB_MOBILE_HOME_SHELL_JS_CACHE = "";
let AB_ACCOUNTBOOK_STAGE4_NAV_JS_CACHE = "";
let AB_ACCOUNTBOOK_SEARCH_JS_CACHE = "";
let AB_ACCOUNTBOOK_NOTIF_JS_CACHE = "";
let AB_ACCOUNTBOOK_GOALS_JS_CACHE = "";
let AB_ACCOUNTBOOK_FAVROWS_JS_CACHE = "";
let AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE = "";
let AB_ACCOUNTBOOK_THEME_JS_CACHE = "";

const ACCOUNTBOOK_V5_SEARCH_OVERLAY_HTML = `<div id="abV5Search" class="abV5SearchOverlay" hidden aria-hidden="true"><div class="abV5SearchScrim" data-abv5-search-close></div><div class="abV5SearchPanel" role="dialog" aria-modal="true" aria-labelledby="abV5SearchTitle" aria-describedby="abV5SearchHint" tabindex="-1"><h2 id="abV5SearchTitle" class="srOnly">통합 검색</h2><div class="abV5SearchBar"><span class="abV5SearchIcon" aria-hidden="true">🔍</span><input id="abV5SearchInput" type="search" autocomplete="off" placeholder="메모·분류·결제수단·금액 검색" aria-label="검색어"/><button type="button" class="abV5SearchClose" data-abv5-search-close aria-label="검색 닫기">Esc</button></div><div id="abV5SearchResults" class="abV5SearchResults" role="list" aria-live="polite"></div><div id="abV5SearchHint" class="abV5SearchHint">전체 거래에서 찾아요 · <b>Ctrl/⌘K</b></div></div></div>`;
const ACCOUNTBOOK_V5_NOTIF_OVERLAY_HTML = `<div id="abV5Notif" class="abV5NotifOverlay" hidden aria-hidden="true"><div class="abV5NotifScrim" data-abv5-notif-close></div><div class="abV5NotifPanel" role="dialog" aria-modal="true" aria-labelledby="abV5NotifTitle" tabindex="-1"><div class="abV5NotifHead"><b id="abV5NotifTitle">알림</b><button type="button" class="abV5NotifClose" data-abv5-notif-close aria-label="알림 닫기">Esc</button></div><div id="abV5NotifList" class="abV5NotifList" aria-live="polite"></div></div></div>`;

const ACCOUNTBOOK_SHELL_V22811_CSS = `
body.abV22811Shell{--ab11-bg:#f2f4f6;--ab11-surface:#fff;--ab11-text:#191f28;--ab11-muted:#6b7684;--ab11-line:#e9ebee;--ab11-accent:#3182f6;--ab11-action:#2563eb;--ab11-accent-soft:#e8f3ff;--ab11-radius:20px;--ab11-shadow:0 4px 16px rgba(15,23,42,.045);--abNavW:238px;background:var(--ab11-bg)!important;color:var(--ab11-text)!important;letter-spacing:-.025em}
body.abV22811Shell .homeDesktopNav{display:none}
body.abV22811Shell .appTop{background:rgba(242,244,246,.94)!important;border-bottom:1px solid var(--ab11-line)!important;box-shadow:none!important}
body.abV22811Shell .topLine h1{color:var(--ab11-text);font-size:20px!important;font-weight:900!important}
body.abV22811Shell .topActions a{background:var(--ab11-surface)!important;color:var(--ab11-muted)!important;border:1px solid var(--ab11-line)}
body.abV22811Shell .topActions a.menuLink{background:var(--ab11-text)!important;color:#fff!important;border-color:var(--ab11-text)}
body.abV22811Shell :is(input,select,textarea){border-color:var(--ab11-line)!important;border-radius:14px!important;color:var(--ab11-text)}
body.abV22811Shell :is(.homeBudget,.homeMetric,.homeCard,.homeQuick a,.panel,.stat,.v8-stat,.card,.record,.startPanel){background:var(--ab11-surface)!important;border:1px solid var(--ab11-line)!important;border-radius:var(--ab11-radius)!important;box-shadow:var(--ab11-shadow)!important}
body.abV22811Shell .homeBudget{padding:22px!important}body.abV22811Shell .homeBudget:after{display:none!important}
body.abV22811Shell :is(.homeBudgetTop span,.homeMetric span,.homeTx span,.homeBarRow span,.smartHint,.homeEmpty,.muted,.note){color:var(--ab11-muted)!important}
body.abV22811Shell .homeBudgetTop em{background:var(--ab11-accent-soft)!important;color:#1b64da!important;border:0!important;box-shadow:none!important}
body.abV22811Shell .homeBudgetAmount b{color:var(--ab11-text);font-size:36px!important;font-weight:900}
body.abV22811Shell :is(.homeProgress,.homeBar){background:#edf0f3!important}body.abV22811Shell .homeProgress i{background:var(--ab11-accent)!important}
body.abV22811Shell :is(.homeMetric b,.homeTx b,.homeCard h2,.panel h2,.card h2){color:var(--ab11-text)}
body.abV22811Shell .homeQuick a{min-height:68px;box-shadow:none!important}body.abV22811Shell .homeQuick a:hover,body.abV22811Shell .homeQuick a:active{transform:none!important;background:#f8f9fa!important;box-shadow:none!important}
body.abV22811Shell .homeIcon{background:#f2f4f6!important;box-shadow:none!important}
body.abV22811Shell .homeNotice{background:var(--ab11-text)!important;border-radius:var(--ab11-radius)!important;box-shadow:var(--ab11-shadow)!important}
body.abV22811Shell :is(.smartLine button,.form button:not(.danger),.loginCard button[type="submit"],.signupCard button[type="submit"],form[action="/my/backup-login"] button[type="submit"]){background:var(--ab11-action)!important;color:#fff!important;border-radius:14px!important}
body.abV22811Shell .smartLine input{background:#fff!important;border:1px solid var(--ab11-line)!important}body.abV22811Shell .smartLine button{min-height:48px}
body.abV22811Shell :is(.seg input:checked+span,.feedControls a.active){background:var(--ab11-accent-soft)!important;color:#1b64da!important;border:1px solid #b7d8ff!important}
body.abV22811Shell .bottom{background:rgba(255,255,255,.98)!important;border-top:1px solid var(--ab11-line)!important;box-shadow:0 -4px 16px rgba(15,23,42,.035)}
body.abV22811Shell .bottom a{color:#8b95a1!important;min-height:48px}body.abV22811Shell .bottom a.active{background:transparent!important;border:0!important;color:var(--ab11-accent)!important}
body.abV22811Shell .bottom a.tabAdd i{background:var(--ab11-accent)!important;box-shadow:0 6px 16px rgba(49,130,246,.26)}
body.abV22811Shell .abLayoutNav{background:#fff!important;border-right:1px solid var(--ab11-line)!important;box-shadow:none!important}
body.abV22811Shell .abNavLinks a.active,body.abV22811Shell .abNavMobileDrawer .abNavLinks a.active{background:var(--ab11-accent-soft)!important;color:#1b64da!important;box-shadow:none!important}
body.abV22811Shell .abNavBottom a.active{color:var(--ab11-accent)!important}body.abV22811Shell .abNavBottom a.active:before{background:var(--ab11-accent)!important}
body.abV22811Shell .appLayout{grid-template-columns:238px minmax(0,1fr)!important}
body.abV22811Shell .appMenu{background:#fff!important;border-color:var(--ab11-line)!important;box-shadow:none!important}
body.abV22811Shell .appMenu a.active{background:var(--ab11-accent-soft)!important;color:#1b64da!important}
body.abV22811Shell :is(a,button,input,select,textarea,summary):focus-visible{outline:3px solid var(--ab11-accent)!important;outline-offset:3px!important}
@media(max-width:1023px){body.abV22811Shell :is(input,select,textarea){font-size:16px!important}body.abV22811Shell :is(.topActions a,.bottom a,.homeQuick a,.chipRow button,.dateChip,.feedControls a,.abNavBottom a,.appMenu summary,.appMenu a,button,.btn){min-height:44px!important}body.abV22811Shell .appLayout{grid-template-columns:1fr!important}}
@media(min-width:1024px){
  body.abV22811Shell.abMobileAppSurface{padding-left:238px!important;padding-bottom:24px!important}
  body.abV22811Shell.abAppSurface{padding-left:238px!important}
  body.abV22811Shell.abAppSurface .abLayoutNav{width:238px!important}
  body.abV22811Shell.abAppSurface.abNavCollapsed{padding-left:var(--abNavCollapsed)!important}
  body.abV22811Shell.abAppSurface.abNavCollapsed .abLayoutNav{width:var(--abNavCollapsed)!important}
  body.abV22811Shell .homeDesktopNav{position:fixed;inset:0 auto 0 0;z-index:80;width:238px;background:#fff;border-right:1px solid var(--ab11-line);padding:22px 14px;display:flex;flex-direction:column}
  body.abV22811Shell .homeDesktopBrand{display:flex;align-items:center;gap:10px;color:var(--ab11-text);text-decoration:none;font-size:17px;font-weight:900;padding:0 10px 20px}
  body.abV22811Shell .homeDesktopBrand i{width:36px;height:36px;border-radius:13px;background:var(--ab11-accent);color:#fff;display:grid;place-items:center;font-style:normal}
  body.abV22811Shell .homeDesktopNav nav{display:flex;flex:1;flex-direction:column;gap:4px}body.abV22811Shell .homeDesktopNav nav a{display:flex;align-items:center;min-height:46px;border-radius:14px;padding:0 14px;color:var(--ab11-muted);text-decoration:none;font-size:14px;font-weight:800}
  body.abV22811Shell .homeDesktopNav nav a:hover{background:#f5f7f9;color:var(--ab11-text)}body.abV22811Shell .homeDesktopNav nav a.active{background:var(--ab11-accent-soft);color:#1b64da}
  body.abV22811Shell .homeDesktopMore{margin-top:auto!important;border-top:1px solid var(--ab11-line);padding-top:12px!important}
  body.abV22811Shell .appTop{padding:16px 22px!important}body.abV22811Shell .wrap{padding:22px!important}body.abV22811Shell .bottom{display:none!important}
}
@media(prefers-reduced-motion:reduce){body.abV22811Shell{scroll-behavior:auto!important}body.abV22811Shell *,body.abV22811Shell *:before,body.abV22811Shell *:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}}
`;
