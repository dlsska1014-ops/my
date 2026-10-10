// @build:imports-start
import { quickChipIconCss } from "../web/quick-chip-icons.js";
import { ACCOUNTBOOK_SHELL_V22811_CSS } from "./asset-registry.js";
// @build:imports-end

const ACCOUNTBOOK_SHELL_CSS = ACCOUNTBOOK_SHELL_V22811_CSS
  .replaceAll("abV22811Shell", "abV22812Shell")
  .replaceAll("--ab11", "--ab12")
  + `
html{background:#f2f4f6;color-scheme:light}
html[data-ab-resolved-theme="dark"]{background:#141519;color-scheme:dark}
body.abV22812Shell{--ab12-bg:#f2f4f6;--ab12-surface:#fff;--ab12-surface-raised:#f4f6f8;--ab12-text:#191f28;--ab12-muted:#5f6b7a;--ab12-line:#e9ebee;--ab12-brand:#3182f6;--ab12-accent:#1d4ed8;--ab12-action:#1d4ed8;--ab12-accent-soft:#e8f3ff;--ab12-placeholder:#52606f;--ab12-nav-inactive:#475569;--ab12-notice-bg:#111827;--ab12-notice-title:#86efac;--ab12-notice-text:#d1fae5;--ab12-input-bg:#fff;--ab12-warn-bg:#fff7ed;--ab12-warn-text:#9a3412;--ab12-warn-line:#fed7aa}
/* V22.8.85 통합 작업지시서 2.2: 색 말고 나머지 축(간격·타이포·모서리·그림자·전환)에도
   토큰을 준다. 화면마다 톤이 달랐던 원인이 여기였다 — 각 페이지 인라인 CSS 가 제 값을
   따로 적어 왔다. 지금은 아무도 쓰지 않으므로 이 커밋의 화면 변화는 0건이고, 이후 PR 이
   리터럴을 이 토큰으로 옮겨 온다. 리터럴을 새로 적기 전에 여기를 먼저 본다.
   간격은 6단계 고정이고 중간값을 쓰지 않는다. --ab12-fs-* 는 크기, --ab12-fw-* 는 그
   크기에 딸린 굵기다(지시서가 "34px / 700" 로 적은 것을 CSS 가 담을 수 있게 나눴다). */
body.abV22812Shell{--ab12-sp-1:4px;--ab12-sp-2:8px;--ab12-sp-3:12px;--ab12-sp-4:16px;--ab12-sp-5:24px;--ab12-sp-6:32px;--ab12-r-sm:8px;--ab12-r-md:12px;--ab12-r-lg:16px;--ab12-fs-num-xl:34px;--ab12-fw-num-xl:700;--ab12-fs-num-lg:22px;--ab12-fw-num-lg:700;--ab12-fs-title:16px;--ab12-fw-title:700;--ab12-fs-body:14px;--ab12-fw-body:400;--ab12-fs-cap:12px;--ab12-fw-cap:500;--ab12-disabled:#94a3b8;--ab12-elev-card:0 1px 2px rgba(0,0,0,.04);--ab12-elev-float:0 8px 24px rgba(0,0,0,.12);--ab12-dur:180ms;--ab12-ease:cubic-bezier(.2,.8,.2,1);--ab12-dur-fast:120ms;--ab12-dur-slow:320ms;--ab12-dur-gauge:620ms;--ab12-ease-gauge:cubic-bezier(.2,.8,.2,1)}
/* V22.8.85 통합 작업지시서 2.1: 증감(--ab12-up/down)과 파싱 밑줄(--ab12-parse-*)은
   톤을 따라가지 않는다. 뜻을 가리키는 색이지 강조색이 아니라서, 톤을 바꿨다고 "늘었다"가
   보라색이 되면 안 된다. 그래서 톤 선택자에는 넣지 않고 여기 한 곳에만 둔다.
   다크에서만 명도를 올린다 — 같은 뜻, 어두운 바탕에서 읽히는 값. */
body.abV22812Shell{--ab12-up:#c2410c;--ab12-down:#0f766e;--ab12-parse-text:#3182f6;--ab12-parse-amount:#c2410c;--ab12-parse-method:#0f766e;--ab12-gauge-warn:#c2410c;--ab12-gauge-over:#b91c1c}
html[data-ab-resolved-theme="dark"] body.abV22812Shell{--ab12-up:#fb923c;--ab12-down:#2dd4bf;--ab12-parse-text:#60a5fa;--ab12-parse-amount:#fb923c;--ab12-parse-method:#2dd4bf;--ab12-gauge-warn:#fbbf24;--ab12-gauge-over:#f87171}
/* V22.8.82: 경고색은 일부러 톤을 따라가지 않는다. 파란 경고는 경고로 읽히지 않는다.
   대신 값을 흩뿌리지 않고 --ab12-warn-* 한 곳에 모아 "안 바뀌는 것이 의도"임을 남긴다.
   강조색(--ab12-accent*)을 써야 할 자리에 이 값을 쓰면 톤 전환이 닿지 않는다. */
html[data-ab-tone="emerald"] body.abV22812Shell{--ab12-brand:#157a54;--ab12-accent:#047857;--ab12-action:#047857;--ab12-accent-soft:#dff7ed}
html[data-ab-tone="violet"] body.abV22812Shell{--ab12-brand:#7c3aed;--ab12-accent:#6d28d9;--ab12-action:#6d28d9;--ab12-accent-soft:#f0e8ff}
html[data-ab-tone="amber"] body.abV22812Shell{--ab12-brand:#b45309;--ab12-accent:#92400e;--ab12-action:#92400e;--ab12-accent-soft:#fff3d6}
html[data-ab-resolved-theme="dark"] body.abV22812Shell{--ab12-bg:#141519;--ab12-surface:#1e2026;--ab12-surface-raised:#282b33;--ab12-text:#edeff3;--ab12-muted:#b3bdc9;--ab12-line:#3b475a;--ab12-brand:#4e96fa;--ab12-accent:#93c5fd;--ab12-action:#2563eb;--ab12-accent-soft:#1d2c42;--ab12-placeholder:#cbd5e1;--ab12-nav-inactive:#cbd5e1;--ab12-notice-bg:#101216;--ab12-notice-title:#86efac;--ab12-notice-text:#d1fae5;--ab12-input-bg:#181a20;--ab12-shadow:0 6px 20px rgba(0,0,0,.22);--ab12-warn-bg:#49351a;--ab12-warn-text:#fcd34d;--ab12-warn-line:#765b26}
html[data-ab-resolved-theme="dark"][data-ab-tone="emerald"] body.abV22812Shell{--ab12-brand:#3baa7c;--ab12-accent:#6ee7b7;--ab12-action:#047857;--ab12-accent-soft:#123c33}
html[data-ab-resolved-theme="dark"][data-ab-tone="violet"] body.abV22812Shell{--ab12-brand:#8b5cf6;--ab12-accent:#c4b5fd;--ab12-action:#6d28d9;--ab12-accent-soft:#35255d}
html[data-ab-resolved-theme="dark"][data-ab-tone="amber"] body.abV22812Shell{--ab12-brand:#d97706;--ab12-accent:#fcd34d;--ab12-action:#92400e;--ab12-accent-soft:#49351a}
body.abV22812Shell :is(input,select,textarea){background:var(--ab12-input-bg)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell :is(input,textarea)::placeholder{color:var(--ab12-placeholder)!important;opacity:1!important}
body.abV22812Shell .homeNotice{background:var(--ab12-notice-bg)!important;border:1px solid color-mix(in srgb,var(--ab12-notice-title) 28%,transparent)!important}
body.abV22812Shell .homeNotice b{color:var(--ab12-notice-title)!important}
body.abV22812Shell .homeNotice p{color:var(--ab12-notice-text)!important}
body.abV22812Shell :is(.bottom a,.abNavBottom a,.abUxBottom a){color:var(--ab12-nav-inactive)!important}
body.abV22812Shell :is(.bottom a.active,.abNavBottom a.active,.abUxBottom a.active){color:var(--ab12-accent)!important}
body.abV22812Shell :is(.seg button:not(.on),.seg input:not(:checked)+span){color:var(--ab12-nav-inactive)!important}
body.abV22812Shell :is(.bottom a.active:before,.abNavBottom a.active:before,.abUxBottom a.active:before){background:var(--ab12-accent)!important}
body.abV22812Shell :is(.bottom a.tabAdd i,.bottom a.abPrimary i,.abNavBottom a.abPrimary i,.abUxBottom a.abPrimary i,.homeDesktopBrand i){background:var(--ab12-action)!important;color:#fff!important}
body.abV22812Shell :is(.homeDesktopNav nav a.active,.abNavLinks a.active,.appMenu a.active,.feedControls a.active,.seg input:checked+span){background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
body.abV22812Shell :is(.tchip small,.kpi small:not(.up):not(.down),.cardHead .sub,.dRow .pct,.hTop span small,.txDate span,.txRow .mid span,.emptyBox,details.twin th,.dataNote){color:var(--ab12-muted)!important}
body.abV22812Shell [style*="color:#8B95A1"],body.abV22812Shell [style*="color:#8b95a1"]{color:var(--ab12-muted)!important}
body.abV22812Shell :is(.muted,.note,.smartHint,.homeEmpty,.homeBudgetTop span,.homeMetric span,.homeTx span,.homeBarRow span){color:var(--ab12-muted)!important}
body.abV22812Shell a{color:var(--ab12-accent)}
body.abV22812Shell :is(.smartLine button,.form button:not(.danger),.loginCard button[type="submit"],.signupCard button[type="submit"],form[action="/my/backup-login"] button[type="submit"],.menuContext button){background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
.abAppearancePanel{margin:0 0 28px;padding:18px;border:1px solid var(--ab12-line);border-radius:18px;background:var(--ab12-surface);box-shadow:var(--ab12-shadow)}.abCursorPref{margin-top:14px;padding-top:14px;border-top:1px solid var(--ab12-line);display:grid;gap:10px}.abCursorPick{display:flex;align-items:flex-start;gap:10px;min-height:44px;cursor:pointer}.abCursorPick input{width:22px;height:22px;margin-top:2px;flex:none}.abCursorPick b{display:block;font-size:14px}.abCursorPick small{display:block;color:var(--ab12-muted);font-size:12px;line-height:1.6;margin-top:3px}.abCursorPref button{min-height:44px;border:1px solid var(--ab12-line);border-radius:var(--ab12-r-sm,8px);background:var(--ab12-surface);color:var(--ab12-text);font-weight:1000;cursor:pointer;justify-self:start;padding:0 14px}
.abAppearanceHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start}.abAppearanceHead h2{margin:0;color:var(--ab12-text);font-size:18px}.abAppearanceHead p{margin:5px 0 0;color:var(--ab12-muted);font-size:13px;line-height:1.5}.abAppearanceDevice{display:inline-flex;border-radius:999px;background:var(--ab12-surface-raised);border:1px solid var(--ab12-line);color:var(--ab12-muted);padding:6px 9px;font-size:11px;font-weight:750;white-space:nowrap}
.abAppearanceRows{display:grid;grid-template-columns:1fr 1.35fr;gap:18px;margin-top:16px}.abAppearanceRows>div>b{display:block;margin-bottom:8px;color:var(--ab12-text);font-size:13px}.abAppearanceChoices{display:flex;flex-wrap:wrap;gap:7px}.menuPage .abAppearanceChoices button{display:inline-flex;align-items:center;justify-content:center;gap:7px;min-height:42px;padding:0 13px!important;border:1px solid var(--ab12-line)!important;border-radius:12px!important;background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;font-size:13px;font-weight:750}.menuPage .abAppearanceChoices button[aria-pressed="true"]{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important;color:var(--ab12-accent)!important;box-shadow:0 0 0 2px color-mix(in srgb,var(--ab12-accent) 16%,transparent)}
.abToneDot{width:12px;height:12px;border-radius:50%;box-shadow:0 0 0 2px var(--ab12-surface),0 0 0 3px var(--ab12-line)}.abToneBlue{background:#1d4ed8}.abToneEmerald{background:#047857}.abToneViolet{background:#6d28d9}.abToneAmber{background:#92400e}.abAppearanceStatus{margin:13px 0 0;color:var(--ab12-muted);font-size:12px;line-height:1.5}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abPageReserve .reserveCard.alert :is(b,strong,span,small):not(.reserveEdit *){color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell{background:var(--ab12-bg)!important;color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abV2281 input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]),html[data-ab-resolved-theme="dark"] body.abV22812Shell.abV2281 :is(select,textarea){background:var(--ab12-input-bg)!important;background-color:var(--ab12-input-bg)!important;color:var(--ab12-text)!important;-webkit-text-fill-color:var(--ab12-text)!important;border-color:var(--ab12-line)!important;color-scheme:dark}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeBudget,.homeMetric,.homeCard,.homeOnboarding,.homeQuick a,.homeTx,.panel,.stat,.v8-stat,.v8-tx,.tx,.card,.record,.startPanel,.kpi,.iChip,.tchip,.metric,.summaryBox,.usageCard,.moneyList li,.stepCard,.tabPanel,.kwBox,.featuredCard,.menuRow,.menuStep,.appMenu,.abLayoutNav,.homeDesktopNav,.bottom,.abUxBottom,.abNavBottom,.appTop,.tableWrap,.scroll,table,.accountSecurity,.hhCard,.inviteStage,.settingsForm,.readOnlyNote,.empty){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeUsage{background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeUsage small,.homeTrendSeg a){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeUsage small b{color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeUsage .abNavBudgetTrack{background:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeTrendSeg a{background:var(--ab12-surface-raised)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeTrendSeg .homeTrendOn{background:var(--ab12-accent)!important;color:#0b1220!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.txTabHead,.txTabFilter,.homeReserveCard){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeReserveEyebrow,.homeReserveCard small){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeReserveGo,.budgetTableSet){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.txTabHead p,.txPickLabel>span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.txTabHome,.txPager b){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.txTabFilter #v8Search,.txPickLabel select){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .txPager span{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMonthAwayBadge{background:rgba(251,146,60,.16)!important;border-color:rgba(251,146,60,.42)!important;color:#fdba74!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMonthAwayGo{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .hero:has(.heroTop){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.menuPage,.wrap,.pageMain,.menuSecondary,.menuSection,.featuredSection){background:transparent!important;color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(h1,h2,h3,h4,strong,label,.menuRowTitle,.featuredCopy b,.journeyCopy b,.homeQuick b,.homeTx b,.metric b,.summaryBox b,.appMenu summary){color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeIcon,.homeProgress,.homeBar,.homeOnboardingStep,.hTrack,.meterBig,.miniBar,.progress,.summaryBox,.keywordFilter,.assetOptional,.memberUse,.basisGrid>div,.basisGrid li,.menuLink,.homeCalendarToggle a,.filterQuick a,.feedControls a,.filterAdvanced,.seg span,.seg button,.appMenuBody .navGroup a,.heroBtns a,.pchip,.fBtn,.fPanel,.csvBtn,.optionGrid a,.hhActions a:not(.primary),.stageActions a,.accountSecurity>a,.reauthButton,.box,.gaugeCard,.dailyCell,.weekdayCell,.trendChart,.seriesChart,.insight,.insightList li,.feature,.candidate,.criteria,.identity,.emptyTree){background:var(--ab12-surface-raised)!important;border-color:var(--ab12-line)!important;color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.abNavLogo,.abNavToggle,.abNavItemIcon,.abNavGuide,.journeyNum,.featuredIcon,.menuRowIcon){background:var(--ab12-surface-raised)!important;border-color:var(--ab12-line)!important;color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(th,.tableWrap:before){background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(td,tr,.menuList,.menuRow,.txRow,.bRow,.txDate){border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.menuHeader,.menuList,.advancedGroup>summary,.privacyDisclosure,.assetFormStep){border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeQuick a:hover,.homeTx:hover,.menuRow:hover,.featuredCard:hover,.dRow:hover,.hRow:hover,a.txRow:hover){background:var(--ab12-surface-raised)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.muted,.note,.smartHint,.homeEmpty,.hero p,.homeBudgetTop span,.homeBudgetFoot,.homeBudgetFoot span,.homeMetric span,.homeTx span,.homeBarRow span,.tchip small,.kpi small:not(.up):not(.down),.cardHead .sub,.dRow .pct,.hTop span small,.txDate span,.txRow .mid span,.emptyBox,.dataNote,.abAppearanceHead p,.abAppearanceDevice,.abAppearanceStatus,.navGroupTitle){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .abLayoutNav :is(b,strong){color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .abLayoutNav :is(small,i){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell a{color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeDesktopNav nav a.active,.abNavLinks a.active,.appMenu a.active,.feedControls a.active,.seg input:checked+span,.menuPage .abAppearanceChoices button[aria-pressed="true"]){color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abV2281 :is(a.btn,a.primaryBtn,a.primaryButton,a.savePlan,.filters a.dark,.heroBtns a.dark){background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface #feed>a.btn.homeFeedAllBtn{background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abV2281 :is(a.btn.secondary,a.btn.light,a.secondaryBtn,a.secondaryButton){background:var(--ab12-surface-raised)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.hero,.planColumn,.planLine label,.weight,.itemSplit,.checks label,.note,.copy,.incomeSummary li,.incomeSummary .emptyIncome,details.fold,.keywordCard){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.homeBudget,.homeMetric,.homeCard,.homeOnboarding,.homeQuick a,.homeTx,.panel,.stat,.v8-stat,.v8-tx,.tx,.card,.record,.startPanel,.kpi,.iChip,.tchip,.metric,.summaryBox,.usageCard,.moneyList li,.stepCard,.tabPanel,.kwBox,.featuredCard,.menuRow,.menuStep,.appMenu,.accountSecurity,.hhCard,.inviteStage,.settingsForm,.readOnlyNote,.empty,.optionGrid a,.box,.gaugeCard,.dailyCell,.weekdayCell,.trendChart,.seriesChart,.insight,.insightList li,.feature,.candidate,.criteria,.identity) :is(h1,h2,h3,h4,b,strong,label,summary,p,span,small,em,dt,dd,li){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.eyebrow,.sectionHead>b,.addLine,.addBtn){background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.guide,.legacy,.sectionNote){background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.ok,.notice.ok){background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.error,.notice.error){background:#3f1d2a!important;color:#fecaca!important;border-color:#7f3545!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.tip,.budgetOk,.status.ok,.modeTag.auto,.okmsg,.reauthOk){background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.budgetWarn,.status.warn,.warn,.foot,.guideLine,.inviteFold code,.inviteCode){background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.status.bad,.errmsg,.dangerZone){background:#3f1d2a!important;color:#fecaca!important;border-color:#7f3545!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.guide,.guideLine,.legacy,.sectionNote,.ok,.notice.ok,.error,.notice.error,.tip,.budgetOk,.status.ok,.modeTag.auto,.okmsg,.reauthOk,.budgetWarn,.status.warn,.warn,.foot,.privacyNote,.unregBox,.inviteFold code,.inviteCode,.status.bad,.errmsg,.dangerZone) :is(b,strong,p,span,small,label){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .modeTag.manual{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMenu :is(.menuEyebrow,.menuHeader p,.journeyCopy span,.menuSectionHead span,.featuredCopy span,.menuRowDesc,.advancedGroup>summary span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMenu .advancedGroup>summary b{color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.donut i,.assetRow,.assetRow>summary,.rowBody,.editBox,.assetOptional,.assetOptionalGrid .chk,.kindChip span){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.donut i,.assetRow,.rowBody,.editBox,.assetOptional,.assetOptionalGrid .chk,.kindChip span) :is(b,strong,label,summary,span,small,em){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.rowMain small,.rowVal small,.groupSum small,.assetLegend em,.assetOptional>summary span,.assetCoreGrid label small,.assetOptionalGrid .chk small){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets .timeBadge{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.assetKindField legend,.assetFormStep h3){color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets .badge.okb{background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets :is(.privacyNote,.unregBox,.preset.warn,.regLink){background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard :is(b,strong,span,small):not(.reserveEdit *){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard:not(.alert) :is(span,small):not(.reserveEdit *){color:var(--ab12-muted)!important}
/* V22.9.18: 정기 화면의 배지·수정 단추·수입/지출 세그먼트는 페이지 인라인 CSS 가 밝은 바탕만 알았다. 다크에서 글자가 1.05~1.65:1 로 사라져 여기서 다크 짝을 준다. */
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveKind.kindExpense{background:rgba(248,113,113,.18);color:#fca5a5!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveKind.kindIncome{background:rgba(52,211,153,.18);color:#6ee7b7!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveKind.kindRepeat{background:rgba(129,140,248,.22);color:#c7d2fe!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveEdit summary{background:rgba(147,197,253,.16);color:#bfdbfe}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveEdit[open]{background:var(--ab12-surface,#1e2026);border-color:var(--ab12-line,#3b475a)}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveTypeSeg span{background:var(--ab12-surface-raised,#262a33);color:var(--ab12-text,#edeff3)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveTypeSeg input:checked+span{background:#1d4ed8;color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageReserve .reserveCard.alert{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageHouseholds .hhCard.active{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageHouseholds :is(.accountSecurity span,.hhMain span,.sectionHead p,.inlineHelp,.exitGuide,.optionGrid span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageHouseholds :is(.flow span,.stepBadge,.hhMain em){background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageHouseholds .hhActions a.primary{background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageBudgets :is(.metric.actual,.metric.plan,.empty,.usageCard dl div){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageSettlement :is(.metric,.weight,.itemSplit,.checks label,.note,.copy){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageSettings :is(.summaryBox,.incomeSummary li,.incomeSummary .emptyIncome,details.fold,.keywordCard){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageSettings a.btn.secondary{background:var(--ab12-surface-raised)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords :is(.kwBox,.kwHead,.kwBody,.kwChip,.kwCount,.kwNoResult,.guideCard){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords :is(.kwBox,.kwHead,.kwBody,.kwChip,.kwNoResult,.guideCard) :is(b,strong,p,span,small,code){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords :is(.kwHead b,.kwToggle){color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .kwCount{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .kwHint{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .guideCard span{color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .guideCard code{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .kwRemove{background:transparent!important;color:#fca5a5!important;border-color:transparent!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .kwAdd{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageKeywords .keywordToolbar>button{background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMembers .inviteBox{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMembers .inviteBox :is(code,b,strong,span){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMembers .ownerBadge{background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageBackup .alias{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageBackup .alias :is(b,strong,span){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageBackup .alias span{color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageGuide :is(.tabBtn,.ckList li){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageGuide .ckList li :is(b,strong,small){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageGuide .ckList li:not(.done) small{color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageGuide .ckList li.done{background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageGuide .ckList li a{background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .pchip.on{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .seg button.on{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.income,.up,.positive,.plus,.homeTxAmt.income){color:#6ee7b7!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.expense,.down,.negative,.minus,.homeTxAmt:not(.income)){color:#fca5a5!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeToday b[style*="#059669"]{color:#6ee7b7!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.danger,.delBtn,.dangerZone button[type="submit"]){background:#3f1d2a!important;color:#fecaca!important;border-color:#7f3545!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.smartLine button,.form button:not(.danger),.loginCard button[type="submit"],.signupCard button[type="submit"],form[action="/my/backup-login"] button[type="submit"],.menuContext button,.bottom a.tabAdd i,.bottom a.abPrimary i,.abNavBottom a.abPrimary i,.abUxBottom a.abPrimary i,.homeDesktopBrand i){color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .bottom :is(a.tabAdd,a.abPrimary) i{background:var(--ab12-action)!important;color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeNotice b{color:var(--ab12-notice-title)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .homeNotice p{color:var(--ab12-notice-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageMenu .advancedGroup .menuRow .menuRowTitle{color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(.hero,.card){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(h1,h2,h3,strong,b,label,summary){color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(.muted,.hint,.credentialFeedback,.sep,.signupCard summary span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(.badge,.kakaoBtn){background:#FEE500!important;color:#191919!important;border-color:#d6c100!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) .notice:not(.error):not(.ok){background:#123c33!important;color:#d1fae5!important;border-color:#2f6f5e!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) :is(.warn,.guide){background:var(--ab12-warn-bg)!important;color:var(--ab12-warn-text)!important;border-color:var(--ab12-warn-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin .mobileAccessHelp{background:var(--ab12-surface-raised)!important;color:var(--ab12-muted)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin .mobileAccessHelp b{color:var(--ab12-text)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAccountSecurity .identity{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAccountSecurity main.wrap a.btn.secondary{background:var(--ab12-surface-raised)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) .credentialFeedback[data-state="error"]{color:#fca5a5!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell:is(.abPageLogin,.abPageAccountSecurity) .credentialFeedback[data-state="success"]{color:#6ee7b7!important}
/* V22.9.37 감사 U4: 다크 모드로 둔 채 로그아웃하면 시작 화면의 글자색만 밝아지고 미리보기·인증 카드는 흰 배경으로 남아 1.05~1.90:1 이었다.
   그 표면(.demoPanel·.sampleCard·.authIntro·.sampleWindow·기록 카드 칸·.miniRow·.person·보조 버튼)에도 다크 표면과 토큰 글자색을 준다. */
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.demoPanel,.sampleCard,.authIntro,.sampleWindow,.recordCard dl div,.miniRow,.person,.ctaSecondary){background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.recordCard,.chatBubble.bot,.miniMark){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.heroLead,.heroNote,.sectionHead p,.chatCaption,.miniRow span,.recordCard dt,.cardKicker,.metricLine span,.sampleMeta,.summaryList span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.landingHero h1 strong,.landingPage .ctaSecondary){color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin :is(.progressTrack,.summaryList div){background:var(--ab12-line)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageLogin .summaryList div{background:transparent!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell svg text{fill:var(--ab12-text)!important}
body.abV22812Shell.abMobileAppSurface .homeSpendMeta{display:flex;gap:8px;flex-wrap:wrap;margin-top:16px}
body.abV22812Shell.abMobileAppSurface .homeSpendMeta>span{display:inline-flex;align-items:center;gap:5px;min-height:34px;padding:0 11px;border-radius:999px;background:var(--ab12-surface-raised);border:1px solid var(--ab12-line);color:var(--ab12-muted);font-size:12px;font-weight:850}
body.abV22812Shell.abMobileAppSurface .homeSpendMeta b{color:var(--ab12-accent)}
/* V22.8.88 M2·M3: 세 카드("N월 지출"·"쓸 수 있는 돈"·"오늘 쓴 돈")를 P0 하나로 합쳤다.
   오늘 쓴 돈은 카드가 아니라 P0 안의 한 줄이고, 하루 환산은 구분선 아래에 붙는다. */
/* V22.8.91 지시서 4.3 — "이번 달 리포트" 4장. 데스크톱은 2×2, 모바일은 앞의 둘만
   보여 준다(5장 M2 의 "리포트 2칸"). 같은 마크업을 CSS 로 나누므로 두 화면이 같은
   집계를 두 번 그리지 않는다. */
body.abV22812Shell .homeReports{margin:var(--ab12-sp-4,16px) 0}
body.abV22812Shell .homeReports>h2{margin:0 0 var(--ab12-sp-2,8px);font-size:var(--ab12-fs-title,16px);font-weight:800;color:var(--ab12-text)}
body.abV22812Shell .homeReportGrid{display:grid;grid-template-columns:1fr 1fr;gap:var(--ab12-sp-2,8px)}
body.abV22812Shell .homeReport{display:flex;flex-direction:column;gap:6px;min-width:0;padding:var(--ab12-sp-3,12px);border:1px solid var(--ab12-line);border-radius:var(--ab12-r-md,12px);background:var(--ab12-surface);box-shadow:var(--ab12-elev-card,0 1px 2px rgba(0,0,0,.04))}
body.abV22812Shell .homeReportTop{display:flex;align-items:center;justify-content:space-between;gap:8px}
body.abV22812Shell .homeReportTop>span{color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:800}
/* 카드마다 링크는 하나뿐이다. 둘 이상이면 어디로 가는 카드인지 흐려진다. */
body.abV22812Shell .homeReportTop>a{flex:none;display:inline-flex;align-items:center;min-height:44px;color:var(--ab12-action);font-size:var(--ab12-fs-cap,12px);font-weight:800;text-decoration:none}
body.abV22812Shell .homeReport>b{font-size:var(--ab12-fs-num-lg,22px);font-weight:var(--ab12-fw-num-lg,700);line-height:1.15;letter-spacing:-.03em;color:var(--ab12-text);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}
body.abV22812Shell .homeReport>small{color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:700;line-height:1.5}
body.abV22812Shell .homeReportBars{display:flex;gap:3px;min-height:3px}
body.abV22812Shell .homeReportBars i{height:3px;border-radius:999px;background:var(--ab12-brand)}
/* 쓰는 속도: 지난 4주. 자료가 없는 주는 0원 막대가 아니라 빈 자리로 둔다 —
   0으로 그리면 "안 썼다"로 읽힌다. */
body.abV22812Shell .homeReportPace{display:flex;align-items:flex-end;gap:5px;height:34px}
body.abV22812Shell .homeReportPace i{flex:1 1 0;min-width:0;border-radius:3px 3px 0 0;background:var(--ab12-brand)}
body.abV22812Shell .homeReportPace i.isBlank{height:100%;background:repeating-linear-gradient(135deg,var(--ab12-line) 0 3px,transparent 3px 6px)}
@media(max-width:899px){
  /* M2 리포트 2칸 — 앞의 둘(어디에 썼나·쓰는 속도)만 남긴다. */
  body.abV22812Shell .homeReport:nth-child(n+3){display:none}
}
/* V22.8.89 M4: 빠른 입력을 2단으로. 1단은 늘 보이고, 날짜·지출자·결제수단·분류는
   "자세히" 안으로 들어간다. 접힌 채로도 무엇이 들어갈지 알 수 있게 헤더가 요약을 든다 —
   요약이 없으면 접는 것이 곧 값을 숨기는 일이 된다. */
body.abV22812Shell .quickMore{margin:var(--ab12-sp-2,8px) 0;border:1px solid var(--ab12-line);border-radius:var(--ab12-r-md,12px);background:var(--ab12-surface)}
body.abV22812Shell .quickMore>summary{display:flex;align-items:center;justify-content:space-between;gap:8px;min-height:44px;padding:0 var(--ab12-sp-3,12px);cursor:pointer;list-style:none;color:var(--ab12-text);font-size:13px;font-weight:800}
body.abV22812Shell .quickMore>summary::-webkit-details-marker{display:none}
body.abV22812Shell .quickMore>summary em{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-align:right;color:var(--ab12-muted);font-style:normal;font-size:var(--ab12-fs-cap,12px);font-weight:700}
body.abV22812Shell .quickMoreBody{display:grid;gap:var(--ab12-sp-2,8px);padding:0 var(--ab12-sp-3,12px) var(--ab12-sp-3,12px)}
/* 저장 버튼은 시트 아래에 붙어 있어야 한다. 시트를 스크롤해도 따라오지 않으면
   긴 화면에서 저장까지 내려가야 하고, 그것이 M4 가 지목한 문제였다. */
body.abV22812Shell .quickSubmit{position:sticky;bottom:0;z-index:2;margin-top:var(--ab12-sp-2,8px);padding-bottom:env(safe-area-inset-bottom,0px);background:var(--ab12-surface)}
body.abV22812Shell .quickSubmit>button[type="submit"]{width:100%;min-height:52px}
body.abV22812Shell .quickAfter{margin:6px 0 0;color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:750;text-align:center;font-variant-numeric:tabular-nums}
/* 기본 버튼이 톤을 따라가지 않던 이유. V22.8.1 층이 background:var(--ab-blue)!important
   로 primary 를 칠하는데, --ab-blue 는 이름 그대로 파란색 상수라 톤을 emerald 로 바꿔도
   "기록 저장" 버튼만 파랗게 남았다. 화면 하나가 아니라 primary 버튼이 있는 모든 화면이
   그랬다. 규칙을 새로 덮어쓰는 대신 그 변수 자체를 톤 토큰으로 가리킨다 — 기존
   var(--ab-blue) 자리 전부가 한 번에 톤을 따라간다. 셸 안에서만 바꾸므로 셸이 없는
   공개 페이지의 파란색은 그대로다. */
body.abV22812Shell{--ab-blue:var(--ab12-action);--ab-blue-soft:var(--ab12-accent-soft)}
/* "기록 저장"은 화면 폭을 꽉 채운 52px 짜리 굵기 1000 덩어리였다. 누르는 자리로는
   44px 면 충분하고, 굵기 1000 은 강조가 아니라 소음이다. 토큰 값으로 되돌린다. */
body.abV22812Shell .quickSubmit>button[type="submit"]{min-height:48px;border-radius:var(--ab12-r-md,12px);font-weight:var(--ab12-fw-title,700)}
/* 결제수단 칩이 전부 파란 채움이라 무엇을 골랐는지 읽을 수 없었다. 선택만 채운다. */
body.abV22812Shell #add .chipRow button{min-height:44px;border-radius:var(--ab12-r-sm,8px);background:var(--ab12-surface);border:1px solid var(--ab12-line);color:var(--ab12-text)}
body.abV22812Shell #add .chipRow button[aria-pressed="true"],body.abV22812Shell #add .chipRow button.isOn{background:var(--ab12-accent-soft);border-color:var(--ab12-action);color:var(--ab12-action)}
body.abV22812Shell.abMobileAppSurface .homeBudgetToday{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-top:var(--ab12-sp-3,12px);color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:850}
body.abV22812Shell.abMobileAppSurface .homeBudgetToday b{font-size:15px;font-variant-numeric:tabular-nums}
/* 구분선은 지시서 M3 의 "P0 하단 구분선 아래"를 그대로 옮긴 것이다. 하루 환산은
   남은 예산을 다시 적는 줄이 아니라 그 돈을 오늘의 크기로 바꿔 주는 줄이라, 같은
   카드 안에서도 선 하나로 층을 나눈다. */
body.abV22812Shell.abMobileAppSurface .homeDailyPlan{margin-top:var(--ab12-sp-3,12px);padding-top:var(--ab12-sp-3,12px);border-top:1px solid var(--ab12-line)}
body.abV22812Shell.abMobileAppSurface .homeDailyPlan>span{display:block;color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:850}
body.abV22812Shell.abMobileAppSurface .homeDailyPlan>b{display:block;margin-top:2px;color:var(--ab12-text);font-size:20px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.03em}
body.abV22812Shell.abMobileAppSurface .homeDailyPlan>small{display:block;margin-top:3px;color:var(--ab12-muted);font-size:var(--ab12-fs-cap,12px);font-weight:800}
body.abV22812Shell.abMobileAppSurface .homeDailyPlanEmpty a{display:inline-flex;align-items:center;min-height:44px;color:var(--ab12-action);font-size:13px;font-weight:850;text-decoration:underline}
/* 초과는 톤을 따라가지 않는다(2.1). 파란 경고는 경고로 읽히지 않는다. */
body.abV22812Shell.abMobileAppSurface .homeDailyPlanOver{border-top-color:var(--ab12-warn-line)}
body.abV22812Shell.abMobileAppSurface .homeDailyPlanOver b{display:block;color:var(--ab12-warn-text);font-size:15px;font-weight:900}
body.abV22812Shell.abMobileAppSurface .homeBudget{background:var(--ab12-surface)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell.abMobileAppSurface .homeBudget:after{display:none!important}
body.abV22812Shell.abMobileAppSurface .homeProgress i{background:var(--ab12-action)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar{padding:20px!important;overflow:visible}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calHead h2{font-size:20px}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calClose,
body.abV22812Shell.abMobileAppSurface .homeCalendar .calNav a{background:var(--ab12-surface-raised)!important;color:var(--ab12-accent)!important;border:1px solid var(--ab12-line)!important;box-shadow:none!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calGrid{gap:3px}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay{min-height:62px;padding:7px 2px;border:1px solid transparent!important;border-radius:11px;background:transparent!important;color:var(--ab12-text)!important;opacity:1!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.noRec{background:transparent!important;color:var(--ab12-muted)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar a.calDay.hasRec{background:var(--ab12-accent-soft)!important;border-color:color-mix(in srgb,var(--ab12-accent) 34%,var(--ab12-line))!important;color:var(--ab12-text)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar a.calDay.hasRec.sel{background:var(--ab12-action)!important;border-color:var(--ab12-action)!important;color:#fff!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calRecordDot{background:var(--ab12-accent)!important;box-shadow:0 0 0 2px var(--ab12-surface)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar a.calDay.hasRec.sel .calRecordDot{background:#fff!important;box-shadow:0 0 0 2px color-mix(in srgb,#fff 32%,transparent)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.isToday b{display:grid;place-items:center;width:24px;height:24px;margin:-2px auto 1px;border-radius:50%;background:var(--ab12-action);color:#fff!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.sun:not(.sel):not(.isToday) b{color:#b4233e!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.sat:not(.sel):not(.isToday) b{color:#1d4ed8!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay strong{color:#b42318!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay em{color:#067647!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay small,
body.abV22812Shell.abMobileAppSurface .homeCalendar .calHint,
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDow{color:var(--ab12-muted)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDow.sun{color:#b4233e!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDow.sat{color:#1d4ed8!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calSelected{background:var(--ab12-accent-soft)!important;color:var(--ab12-text)!important;border:1px solid var(--ab12-line)!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calSelected a{color:var(--ab12-accent)!important}

body.abV22812Shell.abPageInsight .filterBar{top:8px;margin:12px 0;padding:12px;background:var(--ab12-surface)!important;background:color-mix(in srgb,var(--ab12-surface) 96%,transparent)!important;border:1px solid var(--ab12-line)!important;border-radius:18px;box-shadow:0 8px 24px rgba(15,23,42,.06)}
body.abV22812Shell.abPageInsight :is(.pchip,.fBtn,.tchip,.rangeRow input,.searchBox input,.moreBtn,.csvBtn){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell.abPageInsight .seg{background:var(--ab12-surface-raised)!important;border:1px solid var(--ab12-line)!important}
body.abV22812Shell.abPageInsight .seg button{color:var(--ab12-muted)!important}
body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn){background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important;box-shadow:none!important}
body.abV22812Shell.abPageInsight .tchip.on small{color:#fff!important}
body.abV22812Shell.abPageInsight .fPanel{background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell.abPageInsight .fGroup>b{color:var(--ab12-muted)!important}
body.abV22812Shell.abPageInsight .aChip{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border:1px solid var(--ab12-line)!important}
body.abV22812Shell.abPageInsight :is(.dRow.sel,.hRow.sel){background:var(--ab12-accent-soft)!important;color:var(--ab12-text)!important}
body.abV22812Shell.abPageInsight :is(.dRow:hover,.hRow:hover,a.txRow:hover){background:var(--ab12-surface-raised)!important}
body.abV22812Shell.abPageInsight :is(.card,.kpi){border-radius:var(--ab12-radius,20px)!important;box-shadow:none!important}
body.abV22812Shell.abPageInsight .kpiRow{gap:10px}
body.abV22812Shell.abPageInsight .kpi{min-height:108px;padding:17px}
body.abV22812Shell.abPageInsight .kpi b{font-size:23px}
body.abV22812Shell.abPageInsight :is(.hTrack,.meterBig){background:var(--ab12-surface-raised)!important;border:1px solid var(--ab12-line)!important}
body.abV22812Shell .appMenu>summary{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell .appMenu>summary:after{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMenu>summary{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .appMenu>summary:after{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important}
body.abV22812Shell.abPageInsight svg [stroke="#EEF1F4"],body.abV22812Shell.abPageInsight svg [stroke="#D9DEE4"]{stroke:var(--ab12-line)!important}
body.abV22812Shell.abPageInsight svg [fill="#191F28"],body.abV22812Shell.abPageInsight svg [fill="#4E5968"],body.abV22812Shell.abPageInsight svg [fill="#8B95A1"]{fill:var(--ab12-text)!important}

body.abV22812Shell.abPageAnalysisReport :is(.hero,.card,.box,.gaugeCard){border-radius:var(--ab12-radius,20px)!important;box-shadow:none!important}
body.abV22812Shell.abPageAnalysisReport .hero{background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border:1px solid var(--ab12-line)!important}
body.abV22812Shell.abPageAnalysisReport .hero p{color:var(--ab12-muted)!important}
body.abV22812Shell.abPageCalendar .hero{background:var(--ab12-surface)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important;box-shadow:none!important}
body.abV22812Shell.abPageCalendar .hero p{color:var(--ab12-muted)!important}
body.abV22812Shell.abPageCalendar .card{border-radius:var(--ab12-radius,20px)!important;box-shadow:none!important}body.abV22812Shell.abPageCalendar .day{border-radius:18px!important;box-shadow:none!important}
body.abV22812Shell.abPageCalendar .fullCalendar summary{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
body.abV22812Shell.abPageCalendar .day.emptyDay{background:transparent!important;border-color:transparent!important;color:var(--ab12-muted)!important;opacity:1!important}
body.abV22812Shell.abPageCalendar .day.hasSpend{background:var(--ab12-accent-soft)!important;border-color:color-mix(in srgb,var(--ab12-accent) 34%,var(--ab12-line))!important;color:var(--ab12-text)!important}
body.abV22812Shell.abPageCalendar .day :is(em,small){color:var(--ab12-muted)!important}
body.abV22812Shell.abPageCalendar .day span{color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.sun:not(.sel):not(.isToday) b{color:#fda4af!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.sat:not(.sel):not(.isToday) b{color:#93c5fd!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDow.sun{color:#fda4af!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDow.sat{color:#93c5fd!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay strong{color:#fca5a5!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay em{color:#6ee7b7!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .filterBar{box-shadow:0 10px 26px rgba(0,0,0,.24)}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight :is(.pchip.on,.fBtn.on,.seg button.on,.tchip.on,.applyBtn){background:var(--ab12-action)!important;color:#fff!important;border-color:var(--ab12-action)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .tchip.on small{color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .kpi small.up{color:#fca5a5!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .kpi small.down{color:#6ee7b7!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .iChip.good{background:rgba(6,95,70,.28)!important;border-color:#34d399!important;color:#a7f3d0!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageInsight .iChip.bad{background:rgba(127,29,29,.32)!important;border-color:#f87171!important;color:#fecaca!important}
body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay.hasRec.sel :is(b,strong,em,small){color:#fff!important}

@media(min-width:900px){body.abV22812Shell.abPageInsight .kpiRow{grid-template-columns:repeat(5,minmax(0,1fr))}}
@media(max-width:640px){body.abV22812Shell.abMobileAppSurface .homeCalendar{padding:14px!important}body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay{min-height:55px;padding:5px 1px}body.abV22812Shell.abMobileAppSurface .homeCalendar .calDay small{display:none}body.abV22812Shell.abMobileAppSurface .homeCalendar :is(.calClose,.calNav a){min-height:44px}body.abV22812Shell.abPageInsight .filterBar{top:4px;padding:10px;border-radius:16px}body.abV22812Shell.abPageInsight .fRow{align-items:stretch}body.abV22812Shell.abPageInsight .searchBox{flex-basis:100%}body.abV22812Shell.abPageInsight :is(.pchip,.fBtn,.tchip,.aChip,.seg button,.applyBtn,.moreBtn,.csvBtn,.rangeRow input,.searchBox input){min-height:44px}}
@media(max-width:360px){body.abV22812Shell.abMobileAppSurface .homeCalendar{padding:8px!important}body.abV22812Shell.abMobileAppSurface .homeCalendar .calGrid{gap:2px}}
@media(max-width:720px){.abAppearancePanel{padding:15px;margin-bottom:22px}.abAppearanceHead{display:block}.abAppearanceDevice{margin-top:9px}.abAppearanceRows{grid-template-columns:1fr}.abAppearanceChoices{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}.menuPage .abAppearanceChoices button{width:100%}}

/* V22.8.18 UI/UX stage 4: supplied unified dashboard + navigation system. */
body.abV22812Shell{
  --bg:var(--ab12-bg);--card:var(--ab12-surface);--card-2:var(--ab12-surface-raised);
  --text:var(--ab12-text);--sub:var(--ab12-muted);--faint:var(--ab12-muted);--line:var(--ab12-line);
  --brand:var(--ab12-brand);--accent:var(--ab12-accent);--accent-weak:var(--ab12-accent-soft);--on-accent:#fff;
  /* V22.8.61: 별칭이 빠져 있던 토큰. --action 미정의 탓에 하단 "입력" 버튼이 배경 없는 흰 아이콘으로 사라졌다. */
  --action:var(--ab12-action);--accent-soft:var(--ab12-accent-soft);--soft:var(--ab12-surface-raised);
  --pos:#087a55;--neg:#c0362c;--warn:#a15c00;--purple:#7b6fe0;
  --radius:var(--ab12-radius,20px);--radius-sm:12px;--radius-xs:10px;
  --space-1:8px;--space-2:16px;--space-3:24px;--space-4:32px;
  --shadow:0 0 0 1px rgba(25,31,40,.06),0 1px 2px rgba(25,31,40,.03);--shadow-2:0 6px 22px rgba(25,31,40,.08);
  background:var(--bg)!important;color:var(--text)!important;
  font-family:"Pretendard Variable",Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif;
  font-feature-settings:"tnum";letter-spacing:-.01em
}
html[data-ab-resolved-theme="dark"] body.abV22812Shell{
  --pos:#6ee7b7;--neg:#fca5a5;--warn:#fcd34d;--purple:#c4b5fd;
  --shadow:0 1px 4px rgba(0,0,0,.3);--shadow-2:0 6px 22px rgba(0,0,0,.4)
}
body.abV22812Shell :is(h1,h2,h3){letter-spacing:-.03em}
body.abV22812Shell main.wrap{max-width:1180px;margin-inline:auto;padding:22px}
body.abV22812Shell :is(.hero,.card,.panel,.metric,.kpi,.homeBudget,.homeMetric,.homeCard,.homeCalendar){
  background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important;
  border-radius:var(--radius)!important;box-shadow:var(--shadow)!important
}
/* V22.8.19 contrast hotfix: semantic heroes and empty states outrank the shared card cascade. */
body.abV22812Shell.abPageAssets .hero{background:linear-gradient(135deg,#0b1739,#153878)!important;color:#fff!important;border-color:transparent!important}
body.abV22812Shell.abPageAssets .hero :is(h1,h2,h3,b,strong,span){color:#fff!important}
body.abV22812Shell.abPageAssets .hero :is(p,.heroLabel,.heroDelta,.note){color:#dbeafe!important}
body.abV22812Shell.abPageAssets .heroChips span{background:rgba(255,255,255,.1)!important;color:#fff!important;border-color:rgba(255,255,255,.22)!important}
body.abV22812Shell.abPageAssets .assetEmptyMark{background:var(--accent-weak)!important;color:var(--accent)!important}
body.abV22812Shell.abPageAssets .preset{background:var(--card-2)!important;color:var(--text)!important;border-color:var(--line)!important}
body.abV22812Shell.abPageAssets .presetRow>span{color:var(--sub)!important}
body.abV22812Shell.abPageAssets .emptyCta{background:var(--accent)!important;color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.zero,.orText){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets .assetEmptyMark{background:#1e3a5f!important;color:#bfdbfe!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets .preset{background:var(--ab12-surface-raised)!important;color:#bfdbfe!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAssets .emptyCta{background:#1d4ed8!important;color:#fff!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.flowCard,.copyBox){background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .flowCard :is(b,p,span){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .flowCard>span{background:var(--ab12-accent-soft)!important;color:var(--ab12-accent)!important;border-color:var(--ab12-accent)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport .insightList>div{background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport .insightList>div :is(b,span){color:inherit!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport .insightList>div .muted{color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport .trendLabel{color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport :is(.trendValue,.seriesLegend span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell.abPageAnalysisReport .deltaUp{color:#fca5a5!important}
/* V22.9.2: 패널 기하를 한 규칙에서 정한다. .card/.panel 패딩은 이미 다른 한 줄이
   20px 22px 로 통일하고 있었는데 .hero 는 빠져 있어 화면마다 제각각이었다. 그 줄을
   여기로 합치고 .hero 를 넣는다 — .card 값은 그대로라 보이는 변화가 없고 .hero 만
   같은 값으로 들어온다. 좁은 화면 값도 여기서 정한다(이 규칙이 화면별 미디어쿼리를
   이기므로 그 책임까지 가져와야 한다).

   margin 도 여기서 정한다. 셸에는 이 셋의 margin 규칙이 하나도 없어서 화면별 값이
   그대로 이겼고, 14px 0 이 66곳 · 12px 0 이 41곳으로 갈려 있었다 — 카드 사이 세로
   간격이 화면마다 달랐다는 뜻이다. 어느 쪽도 "설계값"이 아니라 토큰 눈금 위에 있는
   12px(--ab12-sp-3)을 정본으로 삼는다. 14px 을 쓰던 자리는 2px 좁아진다. */
body.abV22812Shell :is(.card,.hero,.panel,.homeCard,.startPanel){padding:20px 22px!important;margin:var(--ab12-sp-3,12px) 0!important}
@media(max-width:760px){body.abV22812Shell :is(.card,.hero,.panel,.homeCard,.startPanel){padding:var(--ab12-sp-4,16px)!important}}
/* V22.9.4 (개편 4단계): 화면 전환.

   이 앱은 링크로 도는 MPA 다 — 월 바꾸기, 탭 전환, 메뉴 이동이 전부 전체 페이지
   로드다. 그래서 누를 때마다 화면이 하얗게 깜빡였고, 실기기에서 "밋밋하다"고 지적된
   것의 절반이 이것이었다.

   @view-transition 은 그 깜빡임만 없앤다. 지원하지 않는 브라우저(현재 Firefox)는
   이 at-rule 을 무시하므로 지금과 **완전히 동일하게** 동작한다 — 폴백 코드가 필요
   없다는 뜻이다. 자바스크립트도 쓰지 않는다.

   내비와 상단 헤더에는 이름을 준다. 이름이 없으면 문서 전체가 한 덩어리로 교차
   페이드되는데, 그러면 양쪽 화면에 똑같이 있는 내비까지 같이 흐려진다. 이름을 주면
   그 요소는 제자리에 남고 본문만 바뀐다 — 화면이 "넘어간다"가 아니라 "이어진다"로
   읽히는 이유가 그것이다.

   이름은 문서 안에서 유일해야 한다. 셋 다 화면당 한 번만 나오는 요소다. */
@view-transition{navigation:auto}
body.abV22812Shell .abLayoutNav{view-transition-name:abNav}
body.abV22812Shell .abNavBottom{view-transition-name:abBottomNav}
body.abV22812Shell .appTop{view-transition-name:abTopBar}
/* 동작 줄이기를 켠 사람에게는 전환을 걷어낸다. 이 앱은 이미 게이지·숫자 전환에서
   같은 규칙을 지키고 있다(V22.8.93). 전환만 끄고 이동 자체는 그대로 동작한다. */
@media(prefers-reduced-motion:reduce){
  ::view-transition-group(*),::view-transition-old(*),::view-transition-new(*){animation:none!important}
}

body.abV22812Shell :is(.muted,.note,.subtitle,.dataNote){color:var(--sub)!important;line-height:1.55}
body.abV22812Shell :is(button,.btn){transition:filter var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),background var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),border-color var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1));box-shadow:none}
body.abV22812Shell :is(.ghost,.secondary,.soft,.light,.btn.ghost){background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important}
body.abV22812Shell :is(.ghost,.secondary,.soft,.light,.btn.ghost):hover{background:var(--card-2)!important;color:var(--text)!important}
body.abV22812Shell :is(input,select,textarea){background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:var(--radius-xs)!important}
body.abV22812Shell :is(input,textarea)::placeholder{color:var(--faint)!important;opacity:1}
body.abV22812Shell :is(.field label,.formField label){font-size:11.5px;font-weight:700;color:var(--sub)!important}
body.abV22812Shell :is(.filterCard,.filterBar,.filterAdvanced,.fPanel){background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important;border-radius:var(--radius-sm)!important;box-shadow:var(--shadow)!important}
body.abV22812Shell :is(.chip,.pchip,.fBtn,.tchip,.aChip,.feedControls a,.dateChip){background:var(--card-2)!important;color:var(--sub)!important;border-color:transparent!important;border-radius:999px!important;box-shadow:none!important}
body.abV22812Shell :is(.chip.blue,.pchip.on,.fBtn.on,.tchip.on,.aChip,.feedControls a.active,.dateChip.on){background:var(--accent-weak)!important;color:var(--accent)!important;border-color:var(--line)!important}
body.abV22812Shell :is(.tableWrap,.scroll){background:var(--card)!important;border:1px solid var(--line)!important;border-radius:var(--radius-sm)!important;box-shadow:none!important}
body.abV22812Shell table{background:var(--card)!important;color:var(--text)!important;border-collapse:collapse}
body.abV22812Shell :is(th,td){border-color:var(--line)!important}
body.abV22812Shell th{background:var(--card-2)!important;color:var(--sub)!important;font-size:11.5px;font-weight:700}
body.abV22812Shell :is(.txItem,.txRow,.record){background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important;border-radius:var(--radius-sm)!important;box-shadow:none!important}
body.abV22812Shell :is(.txMeta span,.txCount,.txLiveCount,.summaryBox,.emptyBox){background:var(--card-2)!important;color:var(--sub)!important;border-color:var(--line)!important}
body.abV22812Shell .tabs{display:flex;flex-wrap:nowrap;gap:6px;overflow-x:auto;background:var(--card)!important;border-radius:var(--radius-sm);padding:7px;box-shadow:var(--shadow);scrollbar-width:none}
body.abV22812Shell .tabs::-webkit-scrollbar{display:none}
body.abV22812Shell .tab{flex:0 0 auto;background:transparent!important;color:var(--sub)!important;border-radius:var(--radius-xs)}
body.abV22812Shell .tab.active{background:var(--text)!important;color:var(--bg)!important}

/* V22.8.21 UI V5 step 1: one navigation shell for desktop and mobile. */
body.abV22812Shell{--abNavW:238px;--abNavCollapsed:72px;--abSafeTop:env(safe-area-inset-top,0px);--abSafeBottom:env(safe-area-inset-bottom,0px)}
body.abV22812Shell .abLayoutNav{position:fixed;left:0;top:0;bottom:0;width:var(--abNavW);z-index:2100;display:flex;flex-direction:column;transition:width var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1));background:var(--card)!important;border-right:1px solid var(--line)!important}
body.abV22812Shell .abNavMobileTop,body.abV22812Shell .abNavBottom{display:none}
body.abV22812Shell .abNavTop{display:flex;align-items:center;justify-content:space-between;gap:8px}
body.abV22812Shell .abNavBrand{display:flex;align-items:center;gap:10px;min-width:0;text-decoration:none}
body.abV22812Shell .abBrandMark{width:19px;height:18px;display:flex;align-items:flex-end;justify-content:center;gap:2px}
body.abV22812Shell .abBrandMark i{display:block;width:5px;border-radius:2px 2px 1px 1px;background:currentColor}
body.abV22812Shell .abBrandMark i:nth-child(1){height:8px}body.abV22812Shell .abBrandMark i:nth-child(2){height:14px}body.abV22812Shell .abBrandMark i:nth-child(3){height:18px}
body.abV22812Shell .abNavBrandText{display:flex;flex-direction:column;min-width:0;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.abV22812Shell .abNavToggle{display:grid;place-items:center;flex:none;cursor:pointer}
body.abV22812Shell .abNavBody{flex:1;overflow:auto;overscroll-behavior:contain}
body.abV22812Shell .abNavGroup summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:10px}
body.abV22812Shell .abNavGroup summary::-webkit-details-marker{display:none}
body.abV22812Shell .abNavLinks a{align-items:center;text-decoration:none}
body.abV22812Shell .abNavItemIcon,body.abV22812Shell .abNavGroup summary>i{display:grid;place-items:center;font-style:normal}
body.abV22812Shell .abNavBottom a{position:relative;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;min-width:0;text-decoration:none;text-align:center}
body.abV22812Shell .abNavBottom a i{display:grid;place-items:center;font-style:normal}
body.abV22812Shell .abNavBottom a span{display:block;font-size:10px}
body.abV22812Shell .abNavBottom a.active:before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:26px;height:3px;border-radius:0 0 4px 4px}
body.abV22812Shell.abNavCollapsed .abNavBrandText,body.abV22812Shell.abNavCollapsed .abNavGuide small{display:none!important}
body.abV22812Shell.abNavCollapsed :is(.abNavLinks a>span,.abNavGroup summary b,.abNavGuide span){position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}
body.abV22812Shell.abNavCollapsed .abNavTop{justify-content:center;flex-direction:column}
body.abV22812Shell.abNavCollapsed .abNavToggle{transform:rotate(180deg)}

body.abV22812Shell .abLayoutNav{font-family:inherit!important;color:var(--text)!important;background:var(--card)!important;border-right:1px solid var(--line)!important;box-shadow:none!important}
body.abV22812Shell .abNavTop{padding:16px 14px!important;border-color:var(--line)!important}
body.abV22812Shell .abNavBrand{gap:10px!important;color:var(--text)!important;font-weight:800!important}
body.abV22812Shell .abNavLogo{width:38px!important;height:38px!important;flex:none;border-radius:12px!important;display:grid!important;place-items:center!important;background:var(--brand)!important;color:var(--on-accent)!important;border-color:transparent!important;box-shadow:var(--shadow)!important;font-size:19px!important;font-weight:800!important;line-height:1!important}
/* 브랜드 아이콘은 SVG(renderAccountbookBrandIcon)라 stroke 가 컨테이너 대비색을 그대로 받아야 한다.
   .abNavLogo 선언이 여러 곳(V2281_GUIDED_NAV_STYLE·renderUnifiedNav·이 파일)에 흩어져 있어
   어느 것이 이기든 아이콘 크기와 stroke 색이 같아지도록 여기서 못박는다. */
body.abV22812Shell :is(.abNavLogo,.abNavMobileLogo)>svg{width:22px!important;height:22px!important;display:block!important;fill:none!important;stroke:currentColor!important;color:inherit!important}
body.abV22812Shell .abNavMobileLogo>svg{width:18px!important;height:18px!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .abNavLogo{background:var(--brand)!important;color:#fff!important;border-color:transparent!important}
body.abV22812Shell :is(.abNavLogo,.abNavMobileTop a>span) .abBrandMark i{background:var(--on-accent)!important}
body.abV22812Shell .abNavBrandText small{color:var(--faint)!important;font-weight:700!important}
body.abV22812Shell .abNavToggle{width:34px!important;height:34px!important;border-radius:11px!important;background:var(--card-2)!important;color:var(--sub)!important;border:0!important}
body.abV22812Shell .abNavBody{padding:10px 10px 16px!important}
body.abV22812Shell .abNavGroup{margin:4px 0!important;border-radius:14px!important}
body.abV22812Shell .abNavGroup summary{min-height:42px!important;padding:0 12px!important;border-radius:12px!important;background:transparent!important;color:var(--sub)!important;box-shadow:none!important;font-weight:700!important}
body.abV22812Shell .abNavGroup summary:hover{background:var(--card-2)!important;color:var(--text)!important}
body.abV22812Shell .abNavGroup[open] summary{color:var(--text)!important}
body.abV22812Shell .abNavGroup summary i{width:24px!important;flex:0 0 24px!important;color:var(--faint)!important;font-size:16px!important}
body.abV22812Shell .abNavIconSvg{width:20px!important;height:20px!important;stroke:currentColor!important;fill:none!important}
body.abV22812Shell .abNavGroup summary b{font-size:12.5px!important;font-weight:700!important;text-transform:none!important}
body.abV22812Shell .abNavLinks{display:flex!important;flex-direction:column!important;gap:2px!important;padding:4px 0 8px!important}
body.abV22812Shell .abNavLinks a{display:flex!important;justify-content:flex-start!important;gap:11px!important;min-height:42px!important;padding:9px 12px 9px 14px!important;border-radius:11px!important;background:transparent!important;color:var(--sub)!important;font-size:13.5px!important;font-weight:600!important;box-shadow:none!important}
body.abV22812Shell .abNavLinks a:hover{background:var(--card-2)!important;color:var(--text)!important}
body.abV22812Shell .abNavLinks a.active{background:var(--accent-weak)!important;color:var(--accent)!important;font-weight:800!important}
/* 라이트 사이드바의 대메뉴/하위 위계.
   색을 더 얹지 않고 구조 신호(구분선·자간·들여쓰기 레일)로만 층을 나눈다.
   대비를 낮추는 변경은 넣지 않는다 — 강조하는 쪽(abNavGroupPrimary)만 --text 로 올린다.
   다크는 그대로 둔다(회귀 방지). */
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell .abNavGroup+.abNavGroup{border-top:1px solid var(--line)!important;margin-top:9px!important;padding-top:7px!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell .abNavGroup summary b{letter-spacing:.055em!important;font-size:11.5px!important;font-weight:800!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell .abNavGroupPrimary>summary b{color:var(--text)!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell .abNavLinks{margin-left:17px!important;padding-left:11px!important;border-left:1px solid var(--line)!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell .abNavLinks a{padding-left:10px!important;font-size:13.5px!important;letter-spacing:0!important}
html:not([data-ab-resolved-theme="dark"]) body.abV22812Shell.abNavCollapsed .abNavLinks{margin-left:0!important;padding-left:0!important;border-left:0!important}
body.abV22812Shell .abNavItemIcon{width:22px!important;height:auto!important;flex:0 0 22px!important;background:transparent!important;color:inherit!important;font-size:15px!important}
body.abV22812Shell .abNavFooter{padding:12px 10px!important;border-color:var(--line)!important}
body.abV22812Shell .abNavGuide{background:var(--card-2)!important;border:1px solid var(--line)!important;color:var(--accent)!important;border-radius:12px!important;box-shadow:none!important}
body.abV22812Shell .abNavGuide small{color:var(--sub)!important}
body.abV22812Shell .abNavMobileTop,body.abV22812Shell .abNavMobileDrawer,body.abV22812Shell .abNavBottom{background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important}
body.abV22812Shell .abNavMobileTop a{color:var(--text)!important}
body.abV22812Shell .abNavMobileTop a>span{display:inline-grid;place-items:center;width:28px;height:28px;margin-right:6px;border-radius:9px;background:var(--accent);color:var(--on-accent)}
body.abV22812Shell .abNavMobileTop button{background:var(--card-2)!important;color:var(--sub)!important;border:0!important}
body.abV22812Shell .abNavBottom a{color:var(--faint)!important;font-weight:700!important}
body.abV22812Shell .abNavBottom a.active{color:var(--accent)!important}
body.abV22812Shell .abNavBottom a.active:before{background:var(--accent)!important}

@media(min-width:900px){
  :root{--abNavW:238px;--abNavCollapsed:72px}
  body.abV22812Shell{--abNavW:238px}
  body.abV22812Shell.abAppSurface,body.abV22812Shell.abMobileAppSurface{padding-left:var(--abNavW)!important}
  body.abV22812Shell .abLayoutNav{width:var(--abNavW)!important}
  body.abV22812Shell.abNavCollapsed{padding-left:var(--abNavCollapsed)!important}
  body.abV22812Shell.abNavCollapsed .abLayoutNav{width:var(--abNavCollapsed)!important}
  body.abV22812Shell.abNavCollapsed .abNavLinks a,body.abV22812Shell.abNavCollapsed .abNavGroup summary{justify-content:center!important;padding-inline:0!important}
  body.abV22812Shell.abNavCollapsed .abNavLinks{display:flex!important;padding-inline:5px!important}
  body.abV22812Shell.abNavCollapsed :is(.abNavLinks a>span,.abNavGroup summary b){position:absolute!important;width:1px!important;height:1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important}
  body.abV22812Shell .homeDesktopNav{width:var(--abNavW)!important;background:var(--card)!important;border-color:var(--line)!important;padding:22px 14px!important}
  body.abV22812Shell .homeDesktopNav nav a{min-height:44px!important;border-radius:11px!important;color:var(--sub)!important;font-size:13.5px!important;font-weight:650!important}
  body.abV22812Shell .homeDesktopNav nav a:hover{background:var(--card-2)!important;color:var(--text)!important}
  body.abV22812Shell .homeDesktopNav nav a.active{background:var(--accent-weak)!important;color:var(--accent)!important}
}
@media(max-width:899px){
  body.abV22812Shell.abAppSurface,body.abV22812Shell.abMobileAppSurface{padding-top:calc(52px + var(--abSafeTop))!important;padding-bottom:calc(74px + var(--abSafeBottom))!important}
  body.abV22812Shell .abLayoutNav{display:none!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav{display:flex!important;left:12px!important;right:12px!important;top:calc(60px + var(--abSafeTop))!important;bottom:calc(76px + var(--abSafeBottom))!important;width:auto!important;max-width:420px!important;z-index:2199!important;border:1px solid var(--line)!important;border-radius:18px!important;box-shadow:0 18px 44px rgba(15,23,42,.2)!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavToggle{display:none!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavLinks{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:6px!important;padding:4px 0 10px!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavLinks a{background:var(--card-2)!important;border:1px solid var(--line)!important;min-height:44px!important}
  body.abV22812Shell.abMobileNavOpen:after{content:"";position:fixed;inset:0;background:rgba(15,23,42,.28);z-index:2198}
  body.abV22812Shell.abMobileNavOpen{overflow:hidden!important}
  body.abV22812Shell .abNavMobileTop{position:fixed;display:flex!important;align-items:center;justify-content:space-between;left:0;right:0;top:0;z-index:2200}
  body.abV22812Shell .abNavMobileTop a{display:flex;align-items:center;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;text-decoration:none;font-weight:800}
  body.abV22812Shell .abNavBottom{position:fixed;display:grid!important;grid-template-columns:repeat(5,minmax(0,1fr));left:0;right:0;bottom:0;z-index:2200;border-top:1px solid var(--line)!important}
  body.abV22812Shell .abNavMobileTop{height:calc(52px + var(--abSafeTop))!important;padding:var(--abSafeTop) 16px 0!important}
  body.abV22812Shell .abNavMobileTop button{min-width:44px!important;min-height:44px!important;padding:0 12px!important}
  body.abV22812Shell .abNavBottom{height:calc(64px + var(--abSafeBottom))!important;padding-bottom:var(--abSafeBottom)!important;backdrop-filter:none!important}
  body.abV22812Shell .abNavBottom a{gap:3px!important;min-height:44px!important}
  /* V22.8.87 M1: 가운데 기록 버튼. 지시서의 52×52 · --ab12-r-lg · margin-top:-14px 를
     그대로 쓰되 색은 --ab12-action 으로 잡아 톤 4종을 따라가게 한다(--ab12-brand 는
     흰 글자에서 대비가 모자란다 — 2.1). 토큰이 닿지 않는 옛 셸을 위해 폴백을 둔다.
     탭 영역은 원이 아니라 칸 전체가 받는다 — 원만 누를 수 있게 하면 44px 규칙을
     지키고도 실제로는 누르기 어려워진다. */
  body.abV22812Shell .abNavBottom a.abNavQuick{justify-content:flex-start}
  body.abV22812Shell .abNavBottom a.abNavQuick i{width:52px!important;height:52px!important;margin-top:-14px;border-radius:var(--ab12-r-lg,16px);background:var(--ab12-action,#1d4ed8);color:#fff;display:grid;place-items:center;opacity:1!important;box-shadow:var(--ab12-elev-float,0 8px 24px rgba(0,0,0,.12))}
  body.abV22812Shell .abNavBottom a.abNavQuick i .abNavIconSvg{width:26px;height:26px;stroke-width:2.2}
  body.abV22812Shell .abNavBottom a.abNavQuick:before{display:none!important}
  body.abV22812Shell .abNavBottom a i{font-size:20px!important}
  body.abV22812Shell main.wrap{padding:14px!important}
}
@media(max-width:560px){body.abV22812Shell.abMobileNavOpen .abLayoutNav{max-width:none!important}body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavLinks{grid-template-columns:1fr!important}}

/* V22.8.44 measured theme contrast and assistive display safeguards. */
@media(prefers-contrast:more){
  body.abV22812Shell{--ab12-muted:#4b5563;--ab12-line:#cbd5e1}
  html[data-ab-resolved-theme="dark"] body.abV22812Shell{--ab12-muted:#d5dbe4;--ab12-line:#64748b}
}
@media(forced-colors:active){
  body.abV22812Shell :is(a,button,input,select,textarea,summary){border:1px solid ButtonText!important}
  body.abV22812Shell :is(a,button,input,select,textarea,summary):focus-visible{outline:3px solid Highlight!important;outline-offset:3px!important}
  body.abV22812Shell :is(.abNavLinks a.active,.abNavBottom a.active,.seg input:checked+span){outline:2px solid Highlight!important}
}
@media(prefers-reduced-motion:reduce){
  body.abV22812Shell,body.abV22812Shell *,body.abV22812Shell *:before,body.abV22812Shell *:after{scroll-behavior:auto!important;animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}

/* V22.8.22 UI V5 step 2: shared page header, controls, KPI and content surfaces. */
body.abV22812Shell .abV5PageHeader{max-width:1280px;margin:14px auto!important;padding:22px!important;background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:18px!important;box-shadow:var(--shadow)!important}
body.abV22812Shell .abV5PageHeaderTop{display:flex;align-items:flex-start;justify-content:space-between;gap:20px}
body.abV22812Shell .abV5PageTitle{min-width:0}
body.abV22812Shell .abV5PageHeader h1{margin:0!important;color:var(--text)!important;font-size:28px!important;line-height:1.25;letter-spacing:-.035em}
body.abV22812Shell .abV5PageHeader p{margin:7px 0 0!important;color:var(--sub)!important;line-height:1.55!important}
body.abV22812Shell .abV5HeaderActions{display:flex;align-items:center;justify-content:flex-end;gap:8px;flex-wrap:wrap}
body.abV22812Shell .abV5HeaderActions :is(a,button){display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 14px;border:1px solid var(--line)!important;border-radius:12px!important;background:var(--card-2)!important;color:var(--text)!important;text-decoration:none;font-weight:800;white-space:nowrap}
body.abV22812Shell .abV5HeaderActions .primary{border-color:var(--ab12-action)!important;background:var(--ab12-action)!important;color:#fff!important}
body.abV22812Shell .abV5ControlBar{display:grid;gap:8px;margin-top:16px}
body.abV22812Shell .abV5ControlBar :is(input,select,button){min-height:46px!important}
body.abV22812Shell .abV5KpiGrid{display:grid!important;grid-template-columns:repeat(auto-fit,minmax(190px,1fr))!important;gap:10px!important;margin:14px 0!important}
body.abV22812Shell .abV5KpiGrid :is(.kpi,.metric,.homeMetric){min-width:0;padding:16px!important;background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:16px!important;box-shadow:none!important}
body.abV22812Shell .abV5KpiGrid :is(.kpi,.metric,.homeMetric)>span{color:var(--sub)!important;font-size:12px!important;font-weight:750!important}
body.abV22812Shell .abV5KpiGrid :is(.kpi,.metric,.homeMetric)>b{display:block;margin:6px 0 0!important;color:var(--text)!important;font-size:clamp(19px,1.7vw,25px)!important;line-height:1.25!important;font-variant-numeric:tabular-nums;white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere}
body.abV22812Shell .abV5KpiGrid :is(.kpi,.metric,.homeMetric)>small{display:block;margin-top:5px;color:var(--sub)!important;font-size:11px!important}
body.abV22812Shell .abV5SectionCard{background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:var(--ab12-radius,20px)!important;box-shadow:none!important}
body.abV22812Shell .abV5FilterBar{background:color-mix(in srgb,var(--bg) 90%,transparent)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:16px!important;box-shadow:none!important;padding:10px!important}
body.abV22812Shell .abV5FilterBar :is(.pchip,.fBtn,.tchip,.aChip){min-height:40px}
body.abV22812Shell .abV5FilterBar .searchBox input{min-height:42px!important}
body.abV22812Shell .pageMain{min-width:0}
body.abV22812Shell .abNavGuide{display:grid!important;gap:2px!important;padding:10px 11px!important;text-decoration:none!important;line-height:1.25!important}
body.abV22812Shell .abNavGuide span,body.abV22812Shell .abNavGuide small{display:block!important;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.abV22812Shell.abMobileAppSurface .appTop.abV5PageHeader{position:relative!important;top:auto!important;z-index:20;width:auto!important}
body.abV22812Shell.abMobileAppSurface .appTop.abV5PageHeader .selectLine{margin-top:14px!important}
@media(max-width:899px){
  body.abV22812Shell .abV5PageHeader{margin:10px 0!important;padding:17px 16px!important;border-radius:16px!important}
  body.abV22812Shell .abV5PageHeaderTop{display:grid;gap:12px}
  body.abV22812Shell .abV5PageHeader h1{font-size:23px!important}
  body.abV22812Shell .abV5HeaderActions{justify-content:flex-start}
  body.abV22812Shell .abV5KpiGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important;gap:8px!important}
  body.abV22812Shell .abV5FilterBar{position:relative!important;top:auto!important;margin:10px 0!important}
}
@media(max-width:420px){body.abV22812Shell .abV5KpiGrid{grid-template-columns:1fr!important}body.abV22812Shell .abV5HeaderActions{display:grid;grid-template-columns:1fr 1fr;width:100%}}

/* V22.8.23 UI V5 step 3: remaining authenticated pages and legacy-layout retirement. */
body.abV22812Shell.abV5RemainingPage main.wrap{width:min(100%,1280px)!important;max-width:1280px!important;margin:0 auto!important;padding:14px 18px 48px!important}
body.abV22812Shell.abV5RemainingPage .pageMain{min-width:0;width:100%}
body.abV22812Shell.abV5RemainingPage .appLayout{display:block!important}
body.abV22812Shell.abV5RemainingPage .appMenu{display:none!important}
body.abV22812Shell.abV5RemainingPage .abV5RemainingHeader{background:var(--card)!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:var(--shadow)!important}
body.abV22812Shell.abV5RemainingPage .abV5RemainingHeader :is(h1,h2){color:var(--text)!important}
body.abV22812Shell.abV5RemainingPage .abV5RemainingHeader p{color:var(--sub)!important;opacity:1!important}
body.abV22812Shell.abV5RemainingPage .abV5SectionCard{margin:12px 0!important;padding:18px!important}
body.abV22812Shell.abV5RemainingPage .abV5SectionCard :is(h2,h3){color:var(--text)!important}
body.abV22812Shell.abV5RemainingPage :is(.box,.summaryBox,.feature,.candidate,.memberCard,.catCard,.alias,.hhCard){min-width:0;background:var(--card-2)!important;color:var(--text)!important;border-color:var(--line)!important;box-shadow:none!important}
body.abV22812Shell.abV5RemainingPage :is(.muted,.note,.feature span,.candidate span,.candidate small,.memberHead span,.catHead span,.alias span){color:var(--sub)!important}
body.abV22812Shell.abV5RemainingPage :is(.box,.summaryBox,.metric)>b{white-space:normal!important;overflow:visible!important;text-overflow:clip!important;overflow-wrap:anywhere}
body.abV22812Shell.abV5RemainingPage .abV5ControlBar{padding:10px!important;background:var(--card-2)!important;border:1px solid var(--line)!important;border-radius:16px!important}
body.abV22812Shell.abV5RemainingPage :is(.tableWrap,.scroll){max-width:100%;overflow:auto!important;border-color:var(--line)!important}
body.abV22812Shell.abV5RemainingPage table{background:var(--card)!important;color:var(--text)!important}
body.abV22812Shell.abV5RemainingPage :is(th,td){border-color:var(--line)!important}
body.abV22812Shell.abV5RemainingPage :is(.btn,button:not(.danger)){border-radius:12px!important}
@media(max-width:899px){body.abV22812Shell.abV5RemainingPage main.wrap{padding:10px 12px 94px!important}body.abV22812Shell.abV5RemainingPage .abV5SectionCard{padding:16px!important}body.abV22812Shell.abV5RemainingPage :is(.grid,.grid2col,.toolGrid,.budgetForm,.keywordGrid){grid-template-columns:1fr!important}}
@media(max-width:420px){body.abV22812Shell.abV5RemainingPage main.wrap{padding-left:10px!important;padding-right:10px!important}body.abV22812Shell.abV5RemainingPage .abV5SectionCard{border-radius:var(--ab12-radius,20px)!important}}

/* V22.8.24 UI V5 shell correctness: 900px boundary, route state and focus-ready drawer. */
body.abV22812Shell .abLayoutNav a[aria-current="page"]{font-weight:800!important}

/* V22.8.25 UI V5 global actions: search, quick entry, alerts and appearance without inline HTML growth. */
body.abV22812Shell .abGlobalActions{position:fixed;z-index:2210;top:12px;right:18px;display:flex;align-items:center;gap:7px}
body.abV22812Shell .abGlobalAction{display:inline-flex;min-height:42px;align-items:center;justify-content:center;gap:7px;padding:0 12px;border:1px solid var(--line)!important;border-radius:12px;background:var(--card)!important;color:var(--text)!important;box-shadow:var(--shadow);font:inherit;font-size:13px;font-weight:800;text-decoration:none;cursor:pointer}
body.abV22812Shell .abGlobalAction:hover{border-color:var(--accent)!important;color:var(--accent)!important}
body.abV22812Shell .abGlobalActionPrimary{border-color:var(--ab12-action)!important;background:var(--ab12-action)!important;color:#fff!important}
body.abV22812Shell .abGlobalActionPrimary:hover{color:#fff!important;filter:brightness(.96)}
html[data-ab-resolved-theme="dark"] body.abV22812Shell a.abGlobalActionPrimary,
html[data-ab-resolved-theme="dark"] body.abV22812Shell a.abGlobalActionPrimary span{color:#fff!important}
body.abV22812Shell .abGlobalAction .abNavIconSvg{width:18px;height:18px;flex:0 0 18px}

body.abV22812Shell .abGlobalDialog{width:min(560px,calc(100% - 32px));max-height:min(720px,calc(100dvh - 32px));margin:auto;padding:0;border:1px solid var(--line);border-radius:20px;background:var(--card);color:var(--text);box-shadow:0 24px 70px rgba(15,23,42,.28);overflow:auto}
body.abV22812Shell .abGlobalDialog::backdrop{background:rgba(15,23,42,.58);backdrop-filter:blur(3px)}
body.abV22812Shell.abGlobalDialogOpen{overflow:hidden!important}
body.abV22812Shell .abGlobalDialogHeader{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:20px 20px 14px;background:var(--card);border-bottom:1px solid var(--line)}
body.abV22812Shell .abGlobalDialogHeader h2{margin:0;color:var(--text);font-size:21px;line-height:1.3}
body.abV22812Shell .abGlobalDialogHeader p{margin:5px 0 0;color:var(--sub);font-size:13px;line-height:1.45}
body.abV22812Shell .abGlobalDialogClose{display:grid;flex:0 0 40px;width:40px;height:40px;place-items:center;border:1px solid var(--line);border-radius:12px;background:var(--card-2);color:var(--text);font:inherit;font-size:21px;cursor:pointer}
body.abV22812Shell .abGlobalDialogBody{display:grid;gap:14px;padding:18px 20px 22px}
body.abV22812Shell .abGlobalDialog [hidden]{display:none!important}
body.abV22812Shell .abGlobalActionGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}
body.abV22812Shell .abGlobalActionChoice{display:flex;min-width:0;min-height:70px;align-items:center;gap:11px;padding:13px;border:1px solid var(--line);border-radius:15px;background:var(--card-2);color:var(--text);text-align:left;text-decoration:none;font:inherit;font-weight:800;cursor:pointer}
body.abV22812Shell .abGlobalActionChoice:hover{border-color:var(--accent);color:var(--accent)}
body.abV22812Shell .abGlobalActionChoice .abNavIconSvg{width:21px;height:21px;flex:0 0 21px}
body.abV22812Shell .abGlobalSearchForm{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px}
body.abV22812Shell .abGlobalSearchForm input[type="search"]{min-width:0;min-height:48px;padding:0 14px;border:1px solid var(--line);border-radius:13px;background:var(--card-2);color:var(--text);font:inherit}
body.abV22812Shell .abGlobalSearchForm button{min-height:48px;padding:0 17px;border:1px solid var(--ab12-action);border-radius:13px;background:var(--ab12-action);color:#fff;font:inherit;font-weight:800;cursor:pointer}
body.abV22812Shell .abGlobalAppearance{display:grid;gap:15px}
body.abV22812Shell .abGlobalAppearanceRow{display:grid;gap:8px}
body.abV22812Shell .abGlobalAppearanceRow>b{color:var(--text);font-size:13px}
body.abV22812Shell .abGlobalAppearanceChoices{display:flex;flex-wrap:wrap;gap:7px}
body.abV22812Shell .abGlobalAppearanceChoices button{min-height:40px;padding:0 12px;border:1px solid var(--line);border-radius:11px;background:var(--card-2);color:var(--text);font:inherit;font-weight:750;cursor:pointer}
body.abV22812Shell .abGlobalAppearanceChoices button[aria-pressed="true"]{border-color:var(--accent);background:color-mix(in srgb,var(--accent) 14%,var(--card));color:var(--accent)}
body.abV22812Shell .abGlobalAppearanceNote{margin:0;color:var(--sub);font-size:12px;line-height:1.5}
@media(min-width:900px){body.abV22812Shell .abGlobalActions{left:calc(var(--abNavWidth,238px) + 22px);right:auto;top:auto;bottom:18px}body.abV22812Shell.abNavCollapsed .abGlobalActions{left:90px}}
@media(max-width:899px){/* V22.8.87 M1: 모바일에서 이 독은 화면에 남지 않는다. 검색·알림·화면 설정은
   전체 메뉴 서랍 안으로 옮겼고(syncGlobalActionPlacement), 빠른 입력은 하단 탭
   가운데 ＋ 가 맡는다. 상단 오른쪽에 떠 있던 조작 묶음이 사라지면서 좁은 화면에서
   가계부 이름과 자리를 다투던 것도 함께 없어진다. */
body.abV22812Shell .abGlobalActions{display:none!important}
body.abV22812Shell .abNavDrawerActions{display:grid;grid-template-columns:1fr 1fr;gap:7px;padding:0 0 10px}
body.abV22812Shell .abNavDrawerActions .abGlobalAction{display:inline-flex;align-items:center;justify-content:flex-start;gap:8px;width:auto;min-height:44px;padding:0 12px;border-radius:var(--ab12-r-md,12px);border:1px solid var(--ab12-line,#edf1f6);background:var(--ab12-surface,#fff);color:var(--ab12-text,#191f28);font-size:var(--ab12-fs-cap,12px);font-weight:700;box-shadow:none;position:static}
body.abV22812Shell .abNavDrawerActions .abGlobalAction span{position:static;width:auto;height:auto;overflow:visible;clip:auto;white-space:nowrap}
body.abV22812Shell .abNavDrawerActions [data-ab-global-open='appearance']{grid-column:1/-1}body.abV22812Shell .abGlobalDialog{width:calc(100% - 20px);max-height:calc(100dvh - 20px);margin:auto 10px 10px;border-radius:20px 20px 14px 14px}body.abV22812Shell .abGlobalDialogHeader{padding:18px 16px 13px}body.abV22812Shell .abGlobalDialogBody{padding:16px}body.abV22812Shell .abGlobalActionGrid{grid-template-columns:1fr 1fr}}
@media(max-width:420px){body.abV22812Shell .abGlobalActionGrid{grid-template-columns:1fr}body.abV22812Shell .abGlobalSearchForm{grid-template-columns:1fr}body.abV22812Shell .abGlobalSearchForm button{width:100%}}

/* V22.8.25 V5 통합 검색 오버레이. */
body.abV22812Shell .abV5SearchOverlay{position:fixed;inset:0;z-index:3000;display:flex;align-items:flex-start;justify-content:center;padding:14vh 16px 16px}
body.abV22812Shell .abV5SearchOverlay[hidden]{display:none}
body.abV22812Shell .abV5SearchScrim{position:absolute;inset:0;background:rgba(15,23,42,.42)}
body.abV22812Shell .abV5SearchPanel{position:relative;width:min(100%,600px);background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);overflow:hidden}
body.abV22812Shell .abV5SearchBar{display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--line)!important}
body.abV22812Shell .abV5SearchIcon{font-size:16px;opacity:.7}
body.abV22812Shell .abV5SearchBar input{flex:1;min-width:0;border:0!important;background:transparent!important;color:var(--text)!important;font-size:16px;padding:6px 2px;outline:none}
body.abV22812Shell .abV5SearchClose{flex:none;border:1px solid var(--line)!important;background:var(--card-2)!important;color:var(--sub)!important;border-radius:9px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer}
body.abV22812Shell .abV5SearchResults{max-height:min(56vh,460px);overflow:auto;padding:6px}
body.abV22812Shell .abV5SearchRow{display:flex;align-items:center;gap:12px;justify-content:space-between;padding:11px 12px;border-radius:12px;text-decoration:none;color:var(--text)!important}
body.abV22812Shell .abV5SearchRow:hover,body.abV22812Shell .abV5SearchRow:focus-visible{background:var(--card-2)!important;outline:none}
body.abV22812Shell .abV5SearchRowMain{min-width:0}
body.abV22812Shell .abV5SearchRowMain b{display:block;font-size:14px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.abV22812Shell .abV5SearchRowMain small{display:block;margin-top:2px;color:var(--sub)!important;font-size:11.5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.abV22812Shell .abV5SearchAmt{flex:none;font-weight:800;font-variant-numeric:tabular-nums;font-size:13.5px}
body.abV22812Shell .abV5SearchAmt.isExpense{color:var(--neg)!important}
body.abV22812Shell .abV5SearchAmt.isIncome{color:var(--accent)!important}
body.abV22812Shell .abV5SearchEmpty{padding:24px 16px;text-align:center;color:var(--sub)!important;font-size:13px}
body.abV22812Shell .abV5SearchHint{padding:10px 16px;border-top:1px solid var(--line)!important;color:var(--faint)!important;font-size:11px}
body.abV5SearchOpen{overflow:hidden!important}
@media(max-width:560px){body.abV22812Shell .abV5SearchOverlay{padding:8vh 10px 10px}body.abV22812Shell .abV5SearchPanel{border-radius:16px}}
/* V22.8.26 검색 진입 버튼 + 결과 포커스 하이라이트. */
body.abV22812Shell .abNavTopActions,body.abV22812Shell .abNavMobileActions{display:flex;align-items:center;gap:6px;flex:none}
body.abV22812Shell .abNavSearchBtn{display:grid;place-items:center;width:34px;height:34px;flex:none;border:0!important;border-radius:11px!important;background:var(--card-2)!important;color:var(--sub)!important;cursor:pointer;font-size:15px;line-height:1;padding:0}
body.abV22812Shell .abNavSearchBtn:hover{color:var(--text)!important}
body.abV22812Shell .abNavSearchBtn:focus-visible{outline:2px solid var(--accent)!important;outline-offset:2px}
body.abV22812Shell.abNavCollapsed .abNavTopActions{flex-direction:column;gap:8px}
/* P1-4: 238px 데스크톱 헤더에서 긴 가계부명 + 검색·알림·토글이 한 줄에 몰려 깨지는 문제 해결.
   펼침 상태에서는 브랜드(로고+이름)를 첫 줄 전체폭(말줄임)으로, 액션 버튼들을 둘째 줄로 내린다. */
@media(min-width:900px){
  body.abV22812Shell:not(.abNavCollapsed) .abNavTop{flex-wrap:wrap;gap:6px 8px}
  body.abV22812Shell:not(.abNavCollapsed) .abNavBrand{flex:1 1 100%;min-width:0}
  body.abV22812Shell:not(.abNavCollapsed) .abNavBrandText{max-width:100%}
  body.abV22812Shell:not(.abNavCollapsed) .abNavTopActions{flex:1 1 100%;justify-content:flex-end;flex-wrap:nowrap}
}
body.abV22812Shell .abV5Focus{animation:abV5FocusPulse 2.4s ease-out 1;border-radius:14px}
@keyframes abV5FocusPulse{0%{box-shadow:0 0 0 0 var(--accent-weak),0 0 0 2px var(--accent)}30%{box-shadow:0 0 0 6px var(--accent-weak),0 0 0 2px var(--accent)}100%{box-shadow:0 0 0 0 rgba(0,0,0,0),0 0 0 0 rgba(0,0,0,0)}}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abV5Focus{animation:none;box-shadow:0 0 0 2px var(--accent)}}
/* V22.8.27 알림 센터 + 홈 예산위험 배너. */
body.abV22812Shell .abNavBellBtn{position:relative}
body.abV22812Shell .abV5NotifBadge{position:absolute;top:-2px;right:-2px;min-width:16px;height:16px;padding:0 4px;border-radius:999px;background:var(--neg)!important;color:#fff!important;font-size:10px;font-weight:800;line-height:16px;text-align:center}
body.abV22812Shell .abV5NotifBadge[hidden]{display:none}
body.abV22812Shell .abV5NotifOverlay{position:fixed;inset:0;z-index:3000;display:flex;align-items:flex-start;justify-content:flex-end;padding:12px}
body.abV22812Shell .abV5NotifOverlay[hidden]{display:none}
body.abV22812Shell .abV5NotifScrim{position:absolute;inset:0;background:rgba(15,23,42,.42)}
body.abV22812Shell .abV5NotifPanel{position:relative;width:min(100%,400px);max-height:min(80vh,640px);display:flex;flex-direction:column;background:var(--card)!important;color:var(--text)!important;border:1px solid var(--line)!important;border-radius:18px;box-shadow:0 24px 60px rgba(15,23,42,.28);overflow:hidden}
body.abV22812Shell .abV5NotifHead{display:flex;align-items:center;justify-content:space-between;padding:14px 16px;border-bottom:1px solid var(--line)!important}
body.abV22812Shell .abV5NotifHead b{font-size:15px}
body.abV22812Shell .abV5NotifClose{border:1px solid var(--line)!important;background:var(--card-2)!important;color:var(--sub)!important;border-radius:9px;padding:5px 9px;font-size:11px;font-weight:800;cursor:pointer}
body.abV22812Shell .abV5NotifList{overflow:auto;padding:8px}
body.abV22812Shell .abV5NotifItem{display:flex;gap:10px;align-items:flex-start;padding:12px;border-radius:12px;border:1px solid var(--line)!important;margin:6px 0;background:var(--card-2)!important;border-left:4px solid var(--sub)!important}
body.abV22812Shell .abV5NotifItem.lvl-danger{border-left-color:var(--neg)!important}
body.abV22812Shell .abV5NotifItem.lvl-warn{border-left-color:var(--warn)!important}
body.abV22812Shell .abV5NotifItem.lvl-info{border-left-color:var(--accent)!important}
body.abV22812Shell .abV5NotifItemBody{min-width:0;flex:1}
body.abV22812Shell .abV5NotifItemBody a{text-decoration:none;color:var(--text)!important}
body.abV22812Shell .abV5NotifItemBody b{display:block;font-size:13.5px;font-weight:700}
body.abV22812Shell .abV5NotifItemBody span{display:block;margin-top:3px;color:var(--sub)!important;font-size:12px;line-height:1.45}
body.abV22812Shell .abV5NotifDismiss{flex:none;border:0!important;background:transparent!important;color:var(--faint)!important;font-size:16px;line-height:1;cursor:pointer;padding:2px 4px}
body.abV22812Shell .abV5NotifEmpty{padding:28px 16px;text-align:center;color:var(--sub)!important;font-size:13px}
body.abV22812Shell .abV5Banner{position:fixed;left:50%;transform:translateX(-50%);top:calc(60px + var(--abSafeTop));z-index:2050;width:min(calc(100% - 24px),560px);display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--card)!important;border:1px solid var(--line)!important;border-left:4px solid var(--neg)!important;border-radius:14px;box-shadow:0 14px 34px rgba(15,23,42,.16)}
body.abV22812Shell .abV5Banner.lvl-warn{border-left-color:var(--warn)!important}
body.abV22812Shell .abV5Banner a{flex:1;min-width:0;text-decoration:none;color:var(--text)!important}
body.abV22812Shell .abV5Banner b{display:block;font-size:13.5px;font-weight:800}
body.abV22812Shell .abV5Banner span{display:block;margin-top:2px;color:var(--sub)!important;font-size:12px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.abV22812Shell .abV5BannerClose{flex:none;border:0!important;background:transparent!important;color:var(--faint)!important;font-size:18px;line-height:1;cursor:pointer;padding:2px 6px}
@media(min-width:900px){body.abV22812Shell .abV5Banner{left:calc(50% + var(--abNavW)/2);top:20px}body.abV22812Shell.abNavCollapsed .abV5Banner{left:calc(50% + var(--abNavCollapsed)/2)}}
/* V22.8.28 검색 결과 즐겨찾기(★) 토글. */
body.abV22812Shell .abV5SearchRow{gap:8px}
body.abV22812Shell .abV5SearchRowLink{flex:1;min-width:0;display:flex;align-items:center;gap:12px;justify-content:space-between;text-decoration:none;color:var(--text)!important}
body.abV22812Shell .abV5SearchFav{flex:none;border:0!important;background:transparent!important;color:var(--faint)!important;font-size:16px;line-height:1;cursor:pointer;padding:4px 6px;border-radius:8px}
body.abV22812Shell .abV5SearchFav.isFav{color:#f5a623!important}
body.abV22812Shell .abV5SearchFav:hover{background:var(--card-2)!important}
body.abV22812Shell .abV5SearchFav:focus-visible{outline:2px solid var(--accent)!important;outline-offset:1px}
body.abV22812Shell .abV5SearchFavHead{padding:8px 10px 2px;color:var(--faint)!important;font-size:11px;font-weight:800}
/* V22.8.33 거래목록 행 즐겨찾기(★). */
body.abV22812Shell .abV5RowFav{display:inline-flex;align-items:center;justify-content:center;align-self:center;flex:none;width:30px;min-width:30px;height:30px;margin-left:2px;color:var(--faint)!important;font-size:15px;line-height:1;cursor:pointer;-webkit-user-select:none;user-select:none;border-radius:8px}
body.abV22812Shell .abV5RowFav.isFav{color:#f5a623!important}
body.abV22812Shell .abV5RowFav:hover{color:var(--text)!important;background:var(--card-2)!important}
body.abV22812Shell .abV5RowFav:focus-visible{outline:2px solid var(--accent)!important;outline-offset:1px}
/* V22.8.47 UI/UX stage 1: desktop sidebar calendar and live budget usage. */
body.abV22812Shell{--abNavW:252px}
body.abV22812Shell .abNavDashboard{flex:none;padding:0 12px 10px;border-bottom:1px solid var(--line)!important;display:grid;gap:9px}
body.abV22812Shell .abNavCalendar,body.abV22812Shell .abNavBudget{display:block;background:var(--card-2)!important;border:1px solid var(--line)!important;border-radius:13px;color:var(--text)!important;text-decoration:none}
body.abV22812Shell .abNavCalendar{padding:10px}
body.abV22812Shell .abNavCalHead{display:grid;grid-template-columns:28px 1fr 28px;align-items:center;gap:4px;margin-bottom:7px}
body.abV22812Shell .abNavCalHead b{text-align:center;font-size:12.5px;font-weight:800;color:var(--text)!important}
body.abV22812Shell .abNavCalHead a{display:grid;place-items:center;width:28px;height:28px;border-radius:8px;color:var(--sub)!important;text-decoration:none;font-size:20px;line-height:1}
body.abV22812Shell .abNavCalHead a:hover{background:var(--card)!important;color:var(--text)!important}
body.abV22812Shell .abNavCalDows,body.abV22812Shell .abNavCalGrid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:2px}
body.abV22812Shell .abNavCalDows span{text-align:center;font-size:9.5px;font-weight:700;color:var(--faint)!important;padding:2px 0 4px}
body.abV22812Shell .abNavCalDay,body.abV22812Shell .abNavCalBlank{aspect-ratio:1;min-width:0}
body.abV22812Shell .abNavCalDay{position:relative;display:grid;place-items:center;border-radius:8px;color:var(--sub)!important;text-decoration:none;font-size:10.5px;font-weight:700}
body.abV22812Shell .abNavCalDay:hover{background:var(--card)!important;color:var(--text)!important}
body.abV22812Shell .abNavCalDay.isToday{background:var(--accent)!important;color:#fff!important;font-weight:900}
body.abV22812Shell .abNavCalDay i{position:absolute;left:50%;bottom:2px;transform:translateX(-50%);width:4px;height:4px;border-radius:50%;background:var(--accent)!important}
body.abV22812Shell .abNavCalDay.isToday i{background:#fff!important}
body.abV22812Shell .abNavCalToday{display:block;margin-top:6px;text-align:right;color:var(--accent)!important;text-decoration:none;font-size:10.5px;font-weight:800}
body.abV22812Shell .abNavBudget{padding:11px 12px}
body.abV22812Shell .abNavBudget>span{display:flex;align-items:center;justify-content:space-between;gap:8px}
body.abV22812Shell .abNavBudget>span b{font-size:11.5px;font-weight:750;color:var(--sub)!important}
body.abV22812Shell .abNavBudget>span em{font-style:normal;font-size:12px;font-weight:850;color:var(--accent)!important}
body.abV22812Shell .abNavBudget.isWarn>span em{color:#f59e0b!important}
body.abV22812Shell .abNavBudget.isOver>span em{color:#f04452!important}
body.abV22812Shell .abNavBudgetTrack{height:7px;margin:8px 0 7px;overflow:hidden;border-radius:999px;background:var(--line)!important}
body.abV22812Shell .abNavBudgetTrack i{display:block;height:100%;border-radius:inherit;background:var(--accent)!important;transition:width var(--ab12-dur-gauge,620ms) var(--ab12-ease-gauge,cubic-bezier(.2,.8,.2,1))}
/* 홈의 "수입 대비 사용" 막대는 .homeUsage.isOver 로 이미 상태를 달고 있었고, 그 색도
   MOBILE_V81_CSS 에 적혀 있었다. 그런데 위 한 줄이 !important 로 강조색을 덮어써서
   127% 인 막대가 초록으로 나왔다 — 상태를 붙여 놓고 색이 닿지 않는 자리였다.
   아래 두 줄이 사이드바(.abNavBudget)만 보고 홈(.homeUsage)을 빠뜨린 것이 원인이라,
   같은 뜻을 가진 두 자리를 한 규칙에 함께 적는다. 값은 톤을 따라가지 않는 토큰이다. */
body.abV22812Shell :is(.abNavBudget,.homeUsage).isWarn .abNavBudgetTrack i{background:var(--ab12-gauge-warn)!important}
body.abV22812Shell :is(.abNavBudget,.homeUsage).isOver .abNavBudgetTrack i{background:var(--ab12-gauge-over)!important}
/* P0 게이지와 예산 항목 카드도 같은 규칙을 따른다. 100% 에서 막대가 멈추므로
   색이 유일한 구별 수단이다. */
body.abV22812Shell .homeBudget.isWarn .homeProgress i{background:var(--ab12-gauge-warn)!important}
body.abV22812Shell .homeBudget.isOver .homeProgress i{background:var(--ab12-gauge-over)!important}
body.abV22812Shell .homeBudget.isOver .homeBudgetTop em{color:var(--ab12-gauge-over)!important}
body.abV22812Shell .homeBudget.isWarn .homeBudgetTop em{color:var(--ab12-gauge-warn)!important}
body.abV22812Shell .homeReport.isWarn .homeReportBars i{background:var(--ab12-gauge-warn)!important}
body.abV22812Shell .homeReport.isOver .homeReportBars i{background:var(--ab12-gauge-over)!important}
body.abV22812Shell .homeReport.isOver>b{color:var(--ab12-gauge-over)!important}
body.abV22812Shell .abNavBudget small{display:block;color:var(--faint)!important;font-size:10.5px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
body.abV22812Shell .abNavBudget small b{color:var(--sub)!important;font-weight:800}
body.abV22812Shell .abNavBudgetEmpty small{margin-top:5px;white-space:normal;line-height:1.35}
body.abV22812Shell .abNavBudgetEmpty strong{display:block;margin-top:7px;color:var(--accent)!important;font-size:10.5px}
body.abV22812Shell.abNavCollapsed .abNavDashboard{display:none!important}
@media(min-width:900px){body.abV22812Shell.abMobileAppSurface{padding-left:252px!important}body.abV22812Shell.abAppSurface{padding-left:252px!important}body.abV22812Shell.abAppSurface .abLayoutNav{width:252px!important}}
@media(max-height:760px) and (min-width:900px){body.abV22812Shell .abNavCalendar{padding:8px}body.abV22812Shell .abNavCalDay{font-size:9.5px}body.abV22812Shell .abNavBody{padding-top:6px!important}}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abNavBudgetTrack i{transition:none}}
/* V22.8.48 UI/UX stage 2: day transaction detail modal and mobile bottom sheet. */
body.abDayDetailOpen{overflow:hidden!important}
body.abV22812Shell .abDayDetailOverlay{position:fixed;inset:0;z-index:3300;display:flex;align-items:center;justify-content:center;padding:28px 28px 28px calc(var(--abNavW,252px) + 28px)}
body.abV22812Shell .abDayDetailOverlay[hidden]{display:none!important}
body.abV22812Shell.abNavCollapsed .abDayDetailOverlay{padding-left:calc(var(--abNavCollapsed,72px) + 28px)}
body.abV22812Shell .abDayDetailScrim{position:absolute;inset:0;background:rgba(15,23,42,.48);backdrop-filter:blur(2px)}
body.abV22812Shell .abDayDetailPanel{position:relative;width:min(100%,640px);max-height:min(82dvh,720px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line)!important;border-radius:22px;background:var(--card)!important;color:var(--text)!important;box-shadow:0 30px 80px rgba(15,23,42,.3)}
body.abV22812Shell .abDayDetailHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px;padding:19px 20px 15px;border-bottom:1px solid var(--line)!important}
body.abV22812Shell .abDayDetailHead b{display:block;font-size:19px;font-weight:850;letter-spacing:-.025em}
body.abV22812Shell .abDayDetailHead small{display:block;margin-top:4px;color:var(--sub)!important;font-size:12px;font-weight:650}
body.abV22812Shell .abDayDetailClose{display:grid;place-items:center;flex:none;width:38px;height:38px;padding:0;border:1px solid var(--line)!important;border-radius:12px;background:var(--card-2)!important;color:var(--sub)!important;font:inherit;font-size:16px;cursor:pointer}
body.abV22812Shell .abDayDetailBody{min-height:0;overflow:auto;padding:16px 20px 18px}
body.abV22812Shell .abDayDetailSums{display:grid;grid-template-columns:1fr 1fr;gap:10px;margin-bottom:14px}
body.abV22812Shell .abDayDetailSum{padding:13px 14px;border:1px solid var(--line)!important;border-radius:15px;background:var(--card-2)!important}
body.abV22812Shell .abDayDetailSum span{display:block;color:var(--sub)!important;font-size:11px;font-weight:750}
body.abV22812Shell .abDayDetailSum b{display:block;margin-top:4px;font-size:19px;font-weight:850;font-variant-numeric:tabular-nums}
body.abV22812Shell .abDayDetailSum.isExpense b{color:var(--neg)!important}
body.abV22812Shell .abDayDetailSum.isIncome b{color:var(--accent)!important}
body.abV22812Shell .abDayDetailList{display:grid;gap:8px}
body.abV22812Shell .abDayDetailItem{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:10px;padding:12px;border:1px solid var(--line)!important;border-radius:15px;background:var(--card)!important}
body.abV22812Shell .abDayDetailType{display:inline-flex;align-items:center;justify-content:center;min-width:42px;height:27px;border-radius:999px;background:color-mix(in srgb,var(--neg) 11%,var(--card));color:var(--neg)!important;font-size:10.5px;font-weight:850}
body.abV22812Shell .abDayDetailItem.isIncome .abDayDetailType{background:color-mix(in srgb,var(--accent) 12%,var(--card));color:var(--accent)!important}
body.abV22812Shell .abDayDetailCopy{min-width:0}
body.abV22812Shell .abDayDetailCopy b{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;font-size:13.5px;font-weight:800}
body.abV22812Shell .abDayDetailCopy span{display:block;margin-top:3px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--sub)!important;font-size:11.5px}
body.abV22812Shell .abDayDetailItem>strong{white-space:nowrap;font-size:13.5px;font-weight:850;font-variant-numeric:tabular-nums;color:var(--neg)!important}
body.abV22812Shell .abDayDetailItem.isIncome>strong{color:var(--accent)!important}
body.abV22812Shell .abDayDetailActions{grid-column:1/-1;display:flex;align-items:flex-start;justify-content:flex-end;gap:8px;padding-top:9px;border-top:1px solid var(--line)!important}
body.abV22812Shell .abDayDetailEdit{flex:1;min-width:0;border:1px solid var(--line)!important;border-radius:12px;background:var(--card-2)!important;overflow:hidden}
body.abV22812Shell .abDayDetailEdit summary{display:flex;align-items:center;min-height:44px;padding:0 13px;color:var(--text)!important;font-size:12px;font-weight:800;cursor:pointer}
body.abV22812Shell .abDayDetailEdit form{display:grid;gap:10px;padding:0 12px 12px}
body.abV22812Shell .abDayDetailEditGrid{display:grid;grid-template-columns:1fr 1fr;gap:9px}
body.abV22812Shell .abDayDetailEditGrid label{display:grid;gap:5px;min-width:0;color:#475467!important;font-size:11px;font-weight:750}
/* V22.9.37 감사 U9: 수정 폼의 11px 라벨이 보조색(--sub)으로 4.35:1 이었다. 작은 글자는 더 진한 #475467(밝은 카드 위 7:1)로, 다크는 보조 토큰. */
body.abV22812Shell :is(.v8-edit-field>span,.v8-spender-readonly>span){color:#475467!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.v8-edit-field>span,.v8-spender-readonly>span){color:var(--ab12-muted)!important}
html[data-ab-resolved-theme="dark"] body.abV22812Shell .abDayDetailEditGrid label{color:var(--ab12-muted)!important}
/* V22.9.37 감사 U14: 일반 참여자에게 관리자 전용 메뉴(참여자·초대, 단톡방 연결)를 표시한다. 글자는 보조 토큰(4.5:1). */
body.abV22812Shell .abNavAdminTag{margin-left:auto;padding-left:6px;font-size:10px;font-weight:800;color:var(--ab12-muted);white-space:nowrap}
body.abV22812Shell .abNavLinks a.abNavAdminOnly .abNavItemIcon{opacity:.75}
body.abV22812Shell .abDayDetailEditGrid label>span{color:var(--sub)!important}
body.abV22812Shell .abDayDetailEditGrid :is(input,select){width:100%;min-width:0;min-height:44px;padding:0 10px;border:1px solid var(--line)!important;border-radius:10px;background:var(--card)!important;color:var(--text)!important;font:inherit;font-size:13px}
body.abV22812Shell .abDayDetailMemo{grid-column:1/-1}
body.abV22812Shell .abDayDetailSpender{grid-column:1/-1;margin:0;color:var(--sub)!important;font-size:11.5px}
body.abV22812Shell .abDayDetailSave,body.abV22812Shell .abDayDetailDelete button{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border:0;border-radius:11px;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
body.abV22812Shell .abDayDetailSave{background:var(--action)!important;color:#fff!important}
body.abV22812Shell .abDayDetailDelete{flex:none;margin:0}
body.abV22812Shell .abDayDetailDelete button{background:color-mix(in srgb,var(--neg) 12%,var(--card))!important;color:var(--neg)!important;border:1px solid color-mix(in srgb,var(--neg) 28%,var(--line))!important}
body.abV22812Shell [data-ab-day-write][aria-busy="true"]{opacity:.72;pointer-events:none}
body.abV22812Shell .abDayDetailLoading,body.abV22812Shell .abDayDetailEmpty{display:grid;place-items:center;gap:8px;min-height:180px;padding:24px;text-align:center;border:1px dashed var(--line)!important;border-radius:16px;background:var(--card-2)!important;color:var(--sub)!important}
body.abV22812Shell .abDayDetailLoading i{width:24px;height:24px;border:3px solid var(--line);border-top-color:var(--accent);border-radius:50%;animation:abDaySpin .8s linear infinite}
body.abV22812Shell .abDayDetailEmpty b{color:var(--text)!important;font-size:14px}
body.abV22812Shell .abDayDetailEmpty span{max-width:340px;font-size:12px;line-height:1.5}
body.abV22812Shell .abDayDetailEmpty button{min-height:38px;padding:0 13px;border:0;border-radius:11px;background:var(--action)!important;color:#fff!important;font:inherit;font-size:12px;font-weight:800;cursor:pointer}
body.abV22812Shell .abDayDetailMore{padding:11px 12px;border-radius:12px;background:var(--card-2)!important;color:var(--sub)!important;font-size:11.5px;line-height:1.5;text-align:center}
body.abV22812Shell .abDayDetailFoot{display:flex;align-items:center;justify-content:flex-end;gap:8px;padding:13px 20px calc(13px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line)!important;background:var(--card)!important}
body.abV22812Shell .abDayDetailFoot a,body.abV22812Shell .abDayDetailFoot button{display:inline-flex;align-items:center;justify-content:center;min-height:42px;padding:0 15px;border-radius:12px;font:inherit;font-size:12.5px;font-weight:800;text-decoration:none;cursor:pointer}
body.abV22812Shell .abDayDetailFoot a{background:var(--action)!important;color:#fff!important;border:1px solid var(--action)!important}
body.abV22812Shell .abDayDetailFoot button{background:var(--card-2)!important;color:var(--sub)!important;border:1px solid var(--line)!important}
@keyframes abDaySpin{to{transform:rotate(360deg)}}
@media(max-width:899px){body.abV22812Shell .abDayDetailOverlay{align-items:flex-end;padding:0}body.abV22812Shell .abDayDetailPanel{width:100%;max-height:min(88dvh,760px);border-width:1px 0 0!important;border-radius:22px 22px 0 0}body.abV22812Shell .abDayDetailPanel:before{content:"";display:block;flex:none;width:38px;height:4px;margin:8px auto 0;border-radius:999px;background:var(--line)!important}body.abV22812Shell .abDayDetailHead{padding:13px 16px}body.abV22812Shell .abDayDetailBody{padding:14px 14px 16px}body.abV22812Shell .abDayDetailFoot{padding:11px 14px calc(11px + env(safe-area-inset-bottom,0px))}body.abV22812Shell .abDayDetailFoot a{flex:1}body.abV22812Shell .abDayDetailItem{grid-template-columns:auto minmax(0,1fr);gap:8px}body.abV22812Shell .abDayDetailItem>strong{grid-column:2;text-align:left;margin-top:-2px}}
@media(max-width:420px){body.abV22812Shell .abDayDetailSums{grid-template-columns:1fr 1fr}body.abV22812Shell .abDayDetailSum{padding:11px}body.abV22812Shell .abDayDetailSum b{font-size:16px}body.abV22812Shell .abDayDetailEditGrid{grid-template-columns:1fr}body.abV22812Shell .abDayDetailMemo{grid-column:auto}body.abV22812Shell .abDayDetailEditGrid :is(input,select){font-size:16px}}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abDayDetailLoading i{animation:none}}
/* V22.8.49 UI/UX stage 3: shared quick-input modal on desktop and bottom sheet on mobile. */
body.abV22812Shell .abQuickInputOverlay{position:fixed;inset:0;z-index:3600;display:flex;align-items:center;justify-content:center;padding:24px}
body.abV22812Shell .abQuickInputOverlay[hidden]{display:none}
body.abV22812Shell .abQuickInputScrim{position:absolute;inset:0;background:rgba(15,23,42,.54);backdrop-filter:blur(2px)}
body.abV22812Shell .abQuickInputPanel{position:relative;width:min(100%,620px);max-height:min(90dvh,820px);display:flex;flex-direction:column;overflow:hidden;border:1px solid var(--line)!important;border-radius:22px;background:var(--card)!important;color:var(--text)!important;box-shadow:0 28px 80px rgba(15,23,42,.35)}
body.abV22812Shell .abQuickInputHead{display:flex;align-items:center;justify-content:space-between;gap:12px;flex:none;padding:16px 18px;border-bottom:1px solid var(--line)!important;background:var(--card)!important}
body.abV22812Shell .abQuickInputHead b{display:block;font-size:18px;font-weight:850}
body.abV22812Shell .abQuickInputHead small{display:block;margin-top:3px;color:var(--sub)!important;font-size:11.5px}
body.abV22812Shell .abQuickInputClose{display:grid;place-items:center;width:38px;height:38px;flex:none;border:1px solid var(--line)!important;border-radius:12px;background:var(--card-2)!important;color:var(--sub)!important;font:inherit;font-size:15px;cursor:pointer}
body.abV22812Shell .abQuickInputBody{overflow:auto;padding:16px 18px 20px}
body.abV22812Shell .abQuickInputContent{margin:0!important;padding:0!important;border:0!important;border-radius:0!important;background:transparent!important;box-shadow:none!important}
body.abV22812Shell .abQuickInputOriginalTitle{display:none!important}
body.abV22812Shell .abQuickInputContent .smartLine{margin-top:0}
body.abV22812Shell .abQuickInputContent form.form{display:grid;gap:10px}
body.abV22812Shell .abQuickInputContent input,body.abV22812Shell .abQuickInputContent select,body.abV22812Shell .abQuickInputContent button{font-size:16px}
body.abQuickInputOpen{overflow:hidden!important}
body.abV22812Shell .abDayDetailAdd{background:var(--action)!important;color:#fff!important;border:1px solid var(--action)!important}
body.abV22812Shell .abDayDetailView{background:var(--card-2)!important;color:var(--text)!important;border:1px solid var(--line)!important}
body.abV22812Shell .abNavBottom a.abNavQuickInput{position:relative;z-index:2;transform:translateY(-8px)}
body.abV22812Shell .abNavBottom a.abNavQuickInput i{width:48px;height:48px;border-radius:17px;background:var(--action)!important;color:#fff!important;box-shadow:0 9px 22px color-mix(in srgb,var(--action) 32%,transparent)}
body.abV22812Shell .abNavBottom a.abNavQuickInput span{margin-top:-3px;color:var(--text)!important;font-weight:850}
body.abV22812Shell .abNavBottom a.abNavQuickInput:before{display:none!important}
@media(max-width:899px){body.abV22812Shell .abQuickInputOverlay{align-items:flex-end;padding:0}body.abV22812Shell .abQuickInputPanel{width:100%;max-height:min(92dvh,840px);border-width:1px 0 0!important;border-radius:24px 24px 0 0}body.abV22812Shell .abQuickInputPanel:before{content:"";display:block;flex:none;width:38px;height:4px;margin:8px auto 0;border-radius:999px;background:var(--line)!important}body.abV22812Shell .abQuickInputHead{padding:11px 15px 13px}body.abV22812Shell .abQuickInputBody{padding:13px 14px calc(22px + env(safe-area-inset-bottom,0px))}body.abV22812Shell .abQuickInputContent .chipRow{max-height:92px;overflow:auto}body.abV22812Shell .abDayDetailFoot{flex-wrap:wrap}body.abV22812Shell .abDayDetailFoot .abDayDetailAdd{order:0;flex:1 1 100%}body.abV22812Shell .abDayDetailFoot .abDayDetailView{order:1;flex:1}body.abV22812Shell .abDayDetailFoot [data-ab-day-close]{order:2}}
@media(max-width:420px){body.abV22812Shell .abQuickInputHead b{font-size:17px}body.abV22812Shell .abQuickInputBody{padding-left:12px;padding-right:12px}body.abV22812Shell .abQuickInputContent .grid2{grid-template-columns:1fr}}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abNavBottom a.abNavQuickInput{transform:none}}
/* V22.8.50 UI/UX stage 4: desktop quick dock, save feedback, and date return flow. */
@media(min-width:900px){
  body.abV22812Shell{padding-bottom:94px!important}
  body.abV22812Shell .abGlobalActions[data-ab-quick-dock]{left:calc(50% + (var(--abNavWidth,238px) / 2));right:auto;top:auto;bottom:18px;transform:translateX(-50%);display:flex;gap:6px;padding:7px;border:1px solid color-mix(in srgb,var(--line) 88%,transparent)!important;border-radius:19px;background:color-mix(in srgb,var(--card) 88%,transparent)!important;backdrop-filter:blur(18px);box-shadow:0 16px 42px rgba(15,23,42,.18)}
  body.abV22812Shell.abNavCollapsed .abGlobalActions[data-ab-quick-dock]{left:calc(50% + (var(--abNavCollapsed,72px) / 2))}
  body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalAction{min-height:46px;border-radius:13px;box-shadow:none!important}
  body.abV22812Shell .abGlobalActions[data-ab-quick-dock] .abGlobalActionQuick{min-width:132px;padding-left:17px;padding-right:17px}
}
body.abV22812Shell .abSaveFeedback{position:fixed;z-index:3900;left:calc(50% + (var(--abNavWidth,238px) / 2));bottom:86px;transform:translate(-50%,18px);width:min(520px,calc(100vw - var(--abNavWidth,238px) - 40px));display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:11px;padding:13px 14px;border:1px solid var(--line)!important;border-radius:17px;background:color-mix(in srgb,var(--card) 94%,transparent)!important;color:var(--text)!important;box-shadow:0 18px 48px rgba(15,23,42,.24);backdrop-filter:blur(18px);opacity:0;pointer-events:none;transition:opacity var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),transform var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
body.abV22812Shell.abNavCollapsed .abSaveFeedback{left:calc(50% + (var(--abNavCollapsed,72px) / 2));width:min(520px,calc(100vw - var(--abNavCollapsed,72px) - 40px))}
body.abV22812Shell .abSaveFeedback.isVisible{opacity:1;transform:translate(-50%,0);pointer-events:auto}
body.abV22812Shell .abSaveFeedback.isLeaving{opacity:0;transform:translate(-50%,10px);pointer-events:none}
body.abV22812Shell .abSaveFeedbackMark{display:grid;place-items:center;width:36px;height:36px;border-radius:12px;background:color-mix(in srgb,var(--pos) 14%,var(--card));color:var(--pos)!important;font-size:18px;font-weight:900}
body.abV22812Shell .abSaveFeedback.isWarning .abSaveFeedbackMark{background:color-mix(in srgb,var(--warn) 16%,var(--card));color:var(--warn)!important}
body.abV22812Shell .abSaveFeedback.isError .abSaveFeedbackMark{background:color-mix(in srgb,var(--neg) 14%,var(--card));color:var(--neg)!important}
body.abV22812Shell .abSaveFeedbackCopy{min-width:0}
body.abV22812Shell .abSaveFeedbackCopy b{display:block;font-size:13.5px;font-weight:850}
body.abV22812Shell .abSaveFeedbackCopy span{display:block;margin-top:3px;color:var(--sub)!important;font-size:12px;line-height:1.45}
body.abV22812Shell .abSaveFeedbackClose{display:grid;place-items:center;width:34px;height:34px;border:1px solid var(--line)!important;border-radius:11px;background:var(--card-2)!important;color:var(--sub)!important;font:inherit;font-size:15px;cursor:pointer}
@media(max-width:899px){
  body.abV22812Shell .abSaveFeedback,body.abV22812Shell.abNavCollapsed .abSaveFeedback{left:12px;right:12px;bottom:calc(76px + env(safe-area-inset-bottom,0px));width:auto;transform:translateY(18px)}
  body.abV22812Shell .abSaveFeedback.isVisible{transform:translateY(0)}
  body.abV22812Shell .abSaveFeedback.isLeaving{transform:translateY(10px)}
}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abSaveFeedback{transition:none}}
/* V22.8.58: 날짜형 챌린지와 범주 SVG 아이콘 기반 최근 기록 가독성 개선. */
body.abV22812Shell .abBrandIcon{display:block;width:22px;height:22px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
body.abV22812Shell .abNavMobileLogo{display:grid;place-items:center;width:30px;height:30px;border-radius:9px;background:var(--accent-soft)!important;color:var(--accent)!important}
body.abV22812Shell .abNavToggleIcon{display:block;width:18px;height:18px;fill:none;stroke:currentColor;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;transition:transform var(--ab12-dur,180ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
body.abV22812Shell.abNavCollapsed .abNavToggleIcon{transform:rotate(180deg)}
@media(min-width:900px){
  body.abV22812Shell .abLayoutNav{overflow:visible!important}
  body.abV22812Shell .abNavTop,body.abV22812Shell.abNavCollapsed .abNavTop{position:relative!important;display:flex!important;flex-flow:row nowrap!important;align-items:center!important;justify-content:flex-start!important;min-height:76px;padding:16px 30px 16px 16px!important;overflow:visible!important}
  body.abV22812Shell .abNavBrand{flex:1 1 auto!important;min-width:0!important;max-width:100%!important;gap:10px!important}
  body.abV22812Shell .abNavBrandText{display:flex!important;max-width:158px!important;min-width:0!important;overflow:hidden!important}
  body.abV22812Shell .abNavBrandText{white-space:normal!important;overflow-wrap:anywhere;text-overflow:clip!important;overflow:visible!important}
  body.abV22812Shell .abNavBrandText small{white-space:nowrap!important;overflow:hidden!important}
  body.abV22812Shell.abNavCollapsed .abNavBrandText{display:none!important}
  body.abV22812Shell .abNavToggle,body.abV22812Shell.abNavCollapsed .abNavToggle{position:absolute!important;right:-15px!important;top:20px!important;z-index:6!important;width:32px!important;height:36px!important;display:grid!important;place-items:center!important;padding:0!important;border:1px solid var(--line)!important;border-radius:11px!important;background:var(--card)!important;color:var(--sub)!important;box-shadow:0 6px 16px rgba(15,23,42,.1)!important;transform:none!important}
  body.abV22812Shell .abNavToggle:hover{background:var(--accent-soft)!important;color:var(--accent)!important}
  body.abV22812Shell.abNavCollapsed .abNavBrand{justify-content:center!important}
  body.abV22812Shell.abMobileAppSurface .appTop,body.abV22812Shell.abMobileAppSurface main.wrap{box-sizing:border-box!important;width:calc(100% - 32px)!important;max-width:1280px!important;margin-left:auto!important;margin-right:auto!important}
  body.abV22812Shell.abMobileAppSurface .appTop{padding:22px 24px 20px!important}
  body.abV22812Shell.abMobileAppSurface main.wrap{padding:22px 24px 120px!important}
}
body.abV22812Shell .abActivityRail{display:none}
@media(min-width:901px) and (max-width:1180px){
  body.abV22812Shell.abPageSettings .rowform{grid-template-columns:repeat(2,minmax(0,1fr))}
}
@media(min-width:1320px){
  :root{--abActivityRailW:340px}
  body.abV22812Shell.abHasActivityRail{padding-right:var(--abActivityRailW)!important}
  body.abV22812Shell.abHasActivityRail .abGlobalActions[data-ab-quick-dock]{left:calc(50% + (var(--abNavWidth,238px) / 2) - (var(--abActivityRailW) / 2))}
  body.abV22812Shell.abHasActivityRail.abNavCollapsed .abGlobalActions[data-ab-quick-dock]{left:calc(50% + (var(--abNavCollapsed,72px) / 2) - (var(--abActivityRailW) / 2))}
  body.abV22812Shell.abHasActivityRail .abSaveFeedback{left:calc(50% + (var(--abNavWidth,238px) / 2) - (var(--abActivityRailW) / 2));width:min(520px,calc(100vw - var(--abNavWidth,238px) - var(--abActivityRailW) - 40px))}
  body.abV22812Shell.abHasActivityRail.abNavCollapsed .abSaveFeedback{left:calc(50% + (var(--abNavCollapsed,72px) / 2) - (var(--abActivityRailW) / 2));width:min(520px,calc(100vw - var(--abNavCollapsed,72px) - var(--abActivityRailW) - 40px))}
  body.abV22812Shell.abHasActivityRail .abDayDetailOverlay,body.abV22812Shell.abHasActivityRail .abQuickInputOverlay{padding-right:calc(var(--abActivityRailW) + 28px)}
  body.abV22812Shell .abActivityRail{position:fixed;right:0;top:0;bottom:0;z-index:2080;width:var(--abActivityRailW);display:flex;flex-direction:column;min-width:0;background:var(--card)!important;color:var(--text)!important;border-left:1px solid var(--line)!important;box-shadow:-10px 0 30px rgba(15,23,42,.07)}
  body.abV22812Shell .abActivityRail[hidden]{display:none!important}
}
body.abV22812Shell .abActivityHead{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;padding:21px 18px 13px}
body.abV22812Shell .abActivityHead span{display:block;color:var(--faint)!important;font-size:11px;font-weight:750}
body.abV22812Shell .abActivityHead h2{margin:2px 0 0;font-size:18px;font-weight:850;letter-spacing:-.025em}
body.abV22812Shell .abActivityHead a{color:var(--accent)!important;text-decoration:none;font-size:11.5px;font-weight:800;padding-top:3px}
body.abV22812Shell .abActivityTabs{display:grid;grid-template-columns:repeat(3,1fr);gap:4px;margin:0 16px 12px;padding:4px;border-radius:12px;background:var(--card-2)!important}
body.abV22812Shell .abActivityTabs button{min-height:31px;padding:0 7px;border:0;border-radius:9px;background:transparent;color:var(--faint)!important;font:inherit;font-size:11px;font-weight:750;cursor:pointer}
body.abV22812Shell .abActivityTabs button.active{background:var(--card)!important;color:var(--text)!important;box-shadow:0 3px 10px rgba(15,23,42,.08)}
body.abV22812Shell .abActivityAdd{display:flex;align-items:center;gap:10px;min-height:50px;margin:0 16px 12px;padding:0 14px;border:1px solid var(--line)!important;border-radius:14px;background:var(--card)!important;color:var(--text)!important;text-decoration:none;font-size:12.5px;font-weight:750}
body.abV22812Shell .abActivityAdd b{display:grid;place-items:center;width:25px;height:25px;border-radius:9px;background:var(--accent-soft)!important;color:var(--accent)!important;font-size:17px}
body.abV22812Shell .abActivityList{flex:1;min-height:0;overflow:auto;overscroll-behavior:contain;border-top:1px solid var(--line)!important;padding:8px 0 14px}
body.abV22812Shell .abActivityLoading,body.abV22812Shell .abActivityEmpty{display:grid;place-items:center;gap:7px;min-height:180px;padding:24px;text-align:center;color:var(--sub)!important}
body.abV22812Shell .abActivityLoading i{width:22px;height:22px;border:3px solid var(--line)!important;border-top-color:var(--accent)!important;border-radius:50%;animation:abActivitySpin .8s linear infinite}
body.abV22812Shell .abActivityEmpty b{color:var(--text)!important;font-size:13px}
body.abV22812Shell .abActivityEmpty span{font-size:11.5px;line-height:1.5}
body.abV22812Shell .abActivityEmpty button{min-height:36px;padding:0 12px;border:1px solid var(--line)!important;border-radius:10px;background:var(--card-2)!important;color:var(--text)!important;font:inherit;font-size:11.5px;font-weight:750;cursor:pointer}
body.abV22812Shell .abActivityGroup{padding:0 14px}
body.abV22812Shell .abActivityGroup>header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:10px 3px 7px}
body.abV22812Shell .abActivityGroup>header b,body.abV22812Shell .abActivityGroup>header span{color:var(--faint)!important;font-size:10.5px;font-weight:800}
body.abV22812Shell .abActivityGroup>header span{display:flex;align-items:center;gap:7px}body.abV22812Shell .abActivityGroup>header span em{padding:2px 6px;border-radius:999px;background:var(--card-2)!important;color:var(--sub)!important;font-style:normal}body.abV22812Shell .abActivityGroup>header span b{color:var(--neg)!important;font-variant-numeric:tabular-nums}
body.abV22812Shell .abActivityItem{display:grid;grid-template-columns:40px minmax(0,1fr) auto;align-items:center;gap:10px;min-height:66px;padding:8px 3px;border-bottom:1px solid color-mix(in srgb,var(--line) 72%,transparent)!important;color:var(--text)!important;text-decoration:none}
body.abV22812Shell .abActivityItem:hover,body.abV22812Shell .abActivityItem:focus-visible{background:var(--card-2)!important;border-radius:13px;padding-left:7px;padding-right:7px}
body.abV22812Shell .abActivityItem:focus-visible{outline:3px solid var(--accent)!important;outline-offset:-1px}
body.abV22812Shell .abActivityTypeIcon{display:grid;place-items:center;width:38px;height:38px;border-radius:13px;background:var(--card-2)!important;color:var(--sub)!important;font-style:normal}
body.abV22812Shell .abActivityTypeIcon svg{display:block;width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
body.abV22812Shell .abActivityTypeIcon.kind-income{background:color-mix(in srgb,var(--pos) 14%,var(--card))!important;color:var(--pos)!important}
body.abV22812Shell .abActivityTypeIcon.kind-cafe,body.abV22812Shell .abActivityTypeIcon.kind-food{background:color-mix(in srgb,#f59e0b 16%,var(--card))!important;color:#a85400!important}
body.abV22812Shell .abActivityTypeIcon.kind-transport{background:color-mix(in srgb,#3b82f6 14%,var(--card))!important;color:#1d5fc1!important}
body.abV22812Shell .abActivityTypeIcon.kind-medical{background:color-mix(in srgb,var(--neg) 13%,var(--card))!important;color:var(--neg)!important}
body.abV22812Shell .abActivityTypeIcon.kind-shopping{background:color-mix(in srgb,#ec4899 13%,var(--card))!important;color:#b52169!important}
body.abV22812Shell .abActivityTypeIcon.kind-housing{background:color-mix(in srgb,#8b5cf6 13%,var(--card))!important;color:#7442cc!important}
body.abV22812Shell .abActivityTypeIcon.kind-subscription,body.abV22812Shell .abActivityTypeIcon.kind-education{background:color-mix(in srgb,#14b8a6 13%,var(--card))!important;color:#087f73!important}
body.abV22812Shell .abActivityTypeIcon.kind-leisure{background:color-mix(in srgb,#0ea5e9 13%,var(--card))!important;color:#087cae!important}
body.abV22812Shell .abActivityItem>span{min-width:0}
body.abV22812Shell .abActivityItem>span b,body.abV22812Shell .abActivityItem>span small{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.abV22812Shell .abActivityItem>span b{font-size:12.5px;font-weight:800}
body.abV22812Shell .abActivityItem>span small{display:flex;align-items:center;gap:5px;margin-top:4px;color:var(--faint)!important;font-size:10px}
body.abV22812Shell .abActivityItem>span small em{flex:none;padding:2px 5px;border-radius:999px;background:var(--card-2)!important;color:var(--sub)!important;font-style:normal;font-weight:750}
body.abV22812Shell .abActivityItem>span small span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
body.abV22812Shell .abActivityItem>strong{display:flex;align-items:baseline;gap:2px;white-space:nowrap;color:var(--neg)!important;font-size:12.5px;font-weight:850;font-variant-numeric:tabular-nums}
body.abV22812Shell .abActivityItem>strong>b{font:inherit}body.abV22812Shell .abActivityItem>strong>small{font-size:9px;font-weight:750;color:currentColor!important}
body.abV22812Shell .abActivityItem.isIncome>strong{color:var(--pos)!important}
body.abV22812Shell .abActivitySummary{flex:none;padding:12px 16px calc(14px + env(safe-area-inset-bottom,0px));border-top:1px solid var(--line)!important;background:var(--card)!important}
body.abV22812Shell .abActivitySummary>div{display:inline-flex;align-items:center;gap:5px;margin-right:10px;font-size:10.5px}
body.abV22812Shell .abActivitySummary>div span{color:var(--faint)!important}
body.abV22812Shell .abActivitySummary>div b{color:var(--text)!important;font-size:10.5px}
body.abV22812Shell .abActivitySummary>div:first-child b{color:var(--pos)!important}
body.abV22812Shell .abActivitySummary>div:nth-child(2) b{color:var(--neg)!important}
body.abV22812Shell .abActivitySummary p{display:flex;align-items:center;justify-content:space-between;margin:9px 0 0;padding-top:9px;border-top:1px solid var(--line)!important;font-size:11px}
body.abV22812Shell .abActivitySummary p span{color:var(--faint)!important}
body.abV22812Shell .abActivitySummary p strong{color:var(--pos)!important;font-size:12px}
body.abV22812Shell .abActivitySummary p strong.isNegative{color:var(--neg)!important}
body.abV22812Shell .abActivityLimitNote{margin:8px 14px 14px;padding:9px 10px;border:1px dashed var(--line)!important;border-radius:10px;color:var(--faint)!important;background:var(--soft)!important;font-size:10.5px;line-height:1.45;text-align:center}
@keyframes abActivitySpin{to{transform:rotate(360deg)}}
/* 홈에서도 챌린지를 카드로 표시하고 라이트·다크 모드 토큰을 함께 사용한다. */
body.abV22812Shell .reportChallenge{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:18px;align-items:center;background:linear-gradient(135deg,#171a2b,#222741)!important;color:#fff!important;border:1px solid #343b5f!important;border-radius:22px;padding:18px;margin:14px 0}
body.abV22812Shell .reportChallengeBadge{display:inline-flex;padding:5px 9px;border-radius:999px;background:var(--action,#6d5dfc)!important;color:#fff!important;font-size:11px;font-weight:900}
body.abV22812Shell .reportChallenge h2{margin:9px 0 5px;color:#fff!important;font-size:18px}
body.abV22812Shell .reportChallenge p{margin:0;color:#c7cce0!important;font-size:12.5px;line-height:1.55}
body.abV22812Shell .reportChallengeDates{color:#aeb6d3!important;font-size:11px}
body.abV22812Shell .reportChallengeTrack{height:9px;border-radius:999px;background:#30364d;overflow:hidden;margin:13px 0 7px}
body.abV22812Shell .reportChallengeTrack i{display:block;height:100%;background:linear-gradient(90deg,#ffd45b,var(--accent,#6d5dfc));border-radius:inherit}
body.abV22812Shell .reportChallengeMain>strong{font-size:12px;color:#ffd45b!important}
body.abV22812Shell .reportChallengeManage{display:inline-flex;align-items:center;justify-content:center;min-height:44px;padding:0 14px;border:1px solid #4b557c;border-radius:12px;color:#fff!important;text-decoration:none;font-size:12px;font-weight:800;white-space:nowrap}
body.abV22812Shell .reportChallengeActions{align-self:center;min-width:0}body.abV22812Shell .reportChallengeFormStatus{margin:8px 0 0!important;padding:8px 10px;border:1px solid #387966!important;border-radius:10px;background:#17372f!important;color:#9af0d3!important;font-size:11px!important;font-weight:750}body.abV22812Shell .reportChallengeFormStatus.isError{border-color:#86515a!important;background:#3a2229!important;color:#ffabb3!important}body.abV22812Shell .reportChallenge button{min-height:44px}


body.abV22812Shell .reportChallengeDays{list-style:none;display:grid;grid-template-columns:repeat(auto-fit,minmax(48px,1fr));gap:7px;margin:14px 0 9px;padding:0}body.abV22812Shell .reportChallengeDays li{position:relative;display:grid;grid-template-columns:1fr auto;grid-template-rows:auto auto;align-items:center;min-height:58px;padding:7px 8px;border:1px solid #3d4569;border-radius:12px;background:#20253b}body.abV22812Shell .reportChallengeDays li>span{font-size:10px;color:#aeb6d3!important}body.abV22812Shell .reportChallengeDays li>b{grid-row:2;font-size:15px;color:#fff!important}body.abV22812Shell .reportChallengeDays li>i{grid-column:2;grid-row:1/3;display:grid;place-items:center;width:21px;height:21px;border-radius:50%;font-style:normal;font-size:11px}body.abV22812Shell .reportChallengeDays .is-success{border-color:#387966;background:#17372f}body.abV22812Shell .reportChallengeDays .is-success>i{background:#53d7ad;color:#08251d!important}body.abV22812Shell .reportChallengeDays .is-spent{border-color:#86515a;background:#3a2229}body.abV22812Shell .reportChallengeDays .is-spent>i{background:#ff7c88;color:#351218!important}body.abV22812Shell .reportChallengeDays .is-today{border-color:#ffd45b;box-shadow:inset 0 0 0 1px #ffd45b}body.abV22812Shell .reportChallengeDays .is-today>i{background:#ffd45b;color:#332600!important}body.abV22812Shell .reportChallengeDays .is-future>i{border:1px solid #59617d}body.abV22812Shell .reportChallengeLegend{display:flex;flex-wrap:wrap;gap:6px 12px;margin:-1px 0 9px;color:#c7cce0!important;font-size:10px;font-weight:750}body.abV22812Shell .reportChallengeLegend .is-success{color:#7ce6c3!important}body.abV22812Shell .reportChallengeLegend .is-spent{color:#ff9ba4!important}body.abV22812Shell .reportChallengeLegend .is-today{color:#ffd45b!important}body.abV22812Shell .reportChallengePercent{display:grid;grid-template-columns:auto minmax(120px,1fr) auto;align-items:center;gap:10px;margin:13px 0 8px}body.abV22812Shell .reportChallengePercent>b{font-size:22px;color:#ffd45b!important}body.abV22812Shell .reportChallengePercent .reportChallengeTrack{margin:0}body.abV22812Shell .reportChallengePercent>span{font-size:11px;color:#c7cce0!important;white-space:nowrap}

body.abV22812Shell .reportChallengeDays li:after{content:"";grid-column:2;grid-row:1/3;display:grid;place-items:center;width:21px;height:21px;border:1px solid #59617d;border-radius:50%;font-size:11px}body.abV22812Shell .reportChallengeDays .is-success:after{content:"✓";border-color:#53d7ad;background:#53d7ad;color:#08251d}body.abV22812Shell .reportChallengeDays .is-spent:after{content:"−";border-color:#ff7c88;background:#ff7c88;color:#351218}body.abV22812Shell .reportChallengeDays .is-today:after{content:"●";border-color:#ffd45b;background:#ffd45b;color:#332600}
body.abV22812Shell .v8-tx summary{display:flex;align-items:center;min-height:44px;padding:4px 0}body.abV22812Shell .kwRemove{width:32px!important;height:32px!important;min-height:32px!important}
@media(max-width:899px){body.abV22812Shell .reportChallenge{grid-template-columns:1fr;padding:15px;border-radius:19px}body.abV22812Shell .kwRemove{width:40px!important;height:40px!important;min-height:40px!important}}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abActivityLoading i{animation:none}body.abV22812Shell .abNavToggleIcon{transition:none}}

/* V22.8.61 모바일 상단바·전체 메뉴·빠른 입력 시트 정리.
   공통 작업 버튼을 상단바 안으로 넣어 "전체 메뉴"와 겹치지 않게 하고,
   서랍에서는 메뉴 목록이 쓰는 높이와 터치 영역을 되돌린다. */

@media(max-width:899px){
  body.abV22812Shell .abNavMobileTop{gap:8px}
  body.abV22812Shell .abNavMobileTop>a{flex:1 1 auto;min-width:0}
  /* V22.8.87 M1: "작업" 버튼이 사라지면서 상단바의 버튼이 감싸는 묶음 밖으로 나왔다.
     그 묶음이 막아 주던 것을 여기서 다시 막는다 — 일부 화면의 전역
     button{width:100%} 규칙이 "전체 메뉴" 버튼을 상단바 폭 전체로 늘려 가계부 이름을
     밀어낸다. (지시서 M6 의 전역 규칙 정리는 별건이고, 여기서는 상단바만 지킨다.) */
  body.abV22812Shell .abNavMobileTop>button{flex:0 0 auto;width:auto!important}

  /* 서랍에서는 홈에도 있는 달력·예산 위젯을 접어 메뉴 목록에 높이를 돌려준다. */
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavDashboard{display:none!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavTop{flex:none}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavFooter{flex:none}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavBody{flex:1 1 auto;min-height:0;overflow:auto;overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavGroup summary{min-height:48px!important}
  body.abV22812Shell.abMobileNavOpen .abLayoutNav .abNavLinks a{min-height:48px!important;padding:0 12px!important}
  /* 빠른 입력 시트는 시트 본문 하나만 스크롤한다. 칩 영역이 따로 스크롤되면 손가락이 배경으로 빠진다. */
  body.abV22812Shell .abQuickInputPanel{overscroll-behavior:contain}
  body.abV22812Shell .abQuickInputBody{overscroll-behavior:contain;-webkit-overflow-scrolling:touch}
  body.abV22812Shell .abQuickInputContent .chipRow{max-height:none;overflow:visible}
  /* 최근 내역 필터: 1fr(=minmax(auto,1fr))이라 선택 상자의 최소 너비가 폼 밖으로 칸을 밀어냈다. */
  body.abV22812Shell .mobileFilterForm{grid-template-columns:minmax(0,1fr)!important}
  body.abV22812Shell .mobileFilterForm>*{min-width:0}
  body.abV22812Shell :is(.filterQuick,.filterAdvancedGrid){grid-template-columns:repeat(2,minmax(0,1fr))}
  body.abV22812Shell .mobileFilterForm :is(input,select,button,a){min-width:0}
}
/* 날짜 입력은 고유 최소 너비가 커서 그리드 칸을 밀어낸다. 항상 칸 안에서 줄어들게 한다. */
body.abV22812Shell :is(input[type="date"],input[type="month"],input[type="time"],input[type="number"]){min-width:0;max-width:100%}
/* 고정 상단바가 있는 화면에서 #add·#feed·#calendar 앵커가 헤더 아래로 들어가지 않게 한다. */
@media(max-width:899px){html{scroll-padding-top:calc(64px + env(safe-area-inset-top,0px))}}
@media(min-width:900px){html{scroll-padding-top:20px}}

/* V22.8.65 라이트·다크 글자 대비 보정.
   각 화면 CSS가 "어두운 히어로/상자"를 전제로 밝은 글자색을 고정해 두었는데,
   V5 셸이 배경만 표면색으로 바꾸면서 글자가 배경에 묻혔다.
   남아 있던 고정 색을 테마 토큰으로 되돌린다. */
/* 연간 리포트: 연도 이동 버튼이 흰 배경에 흰 글자로 사라졌다. */
body.abV22812Shell .yearNav :is(a,span){background:var(--card-2)!important;color:var(--text)!important}
body.abV22812Shell .yearNav :is(a.disabled,span.disabled){color:var(--sub)!important;opacity:1!important}
/* 연간 리포트: 연말정산 참고 상자는 셸이 다시 칠하지 않아 다크에서 흰 배경에 흰 글자가 됐다. */
body.abV22812Shell .deductBox{background:var(--card-2)!important;border-color:var(--line)!important;color:var(--text)!important}
body.abV22812Shell .deductBox :is(b,strong){color:var(--text)!important}
body.abV22812Shell .deductBox small{color:var(--sub)!important}
/* 히어로가 표면색으로 바뀐 화면(자산·계좌, 저축·목표, 연간 리포트)의 안내 문구. */
/* 자체 배경을 가진 칩·배지는 스스로 대비를 맞추므로 아래 규칙에서 제외한다. */
body.abV22812Shell :is(.hero,.abV5RemainingHeader) :is(p,small,.note,.muted,.heroLabel,.heroDelta){color:var(--sub)!important}
body.abV22812Shell :is(.hero,.abV5RemainingHeader) :is(h1,h2,h3){color:var(--text)!important}
/* 자산·계좌는 어두운 히어로용 색을 같은 특이도로 고정해 두어 짝이 되는 규칙이 따로 필요하다. */
body.abV22812Shell.abPageAssets .hero :is(p,.heroLabel,.heroDelta,.note){color:var(--sub)!important}
body.abV22812Shell.abPageAssets .hero :is(h1,h2,h3){color:var(--text)!important}
body.abV22812Shell.abPageAssets .hero :is(b,strong){color:var(--text)!important}
body.abV22812Shell.abPageAssets .heroChips span{background:var(--card-2)!important;border-color:var(--line)!important;color:var(--text)!important}
/* 일별 소비 흐름 격자. 원래 이 31칸은 칸마다 style="" 로 같은 CSS 를 700 B 씩 다시
   적어 보내서, 홈 HTML 이 27KB 늘었다(실사용 부하 33,545 → 60,705 B). 그 무게 때문에
   "그래프는 눌러야 열린다"는 절충이 생겼고, 결과적으로 홈의 주요 카드가 늘 비어 있었다.
   같은 CSS 를 1년 캐시되는 이 자산에 한 번만 두면 마크업에는 날짜·금액·막대 길이만
   남는다. 절충의 전제였던 무게 자체를 없앤 셈이다. */
body.abV22812Shell .readableTrendGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(64px,1fr));gap:6px;width:100%;box-sizing:border-box}
body.abV22812Shell .readableTrendGrid .dailyCell{display:grid;gap:6px;background:#F8F9FB;border:1px solid #EEF0F3;border-radius:13px;padding:8px 9px;box-sizing:border-box;text-decoration:none;color:inherit}
body.abV22812Shell .readableTrendGrid .dailyCell.hasValue{background:#EFF6FF;border-color:#DBEAFE}
body.abV22812Shell .readableTrendGrid .dailyTop{display:flex;align-items:center;justify-content:space-between;gap:6px}
body.abV22812Shell .readableTrendGrid .dailyTop b{font-size:14px;line-height:1;color:#4E5968}
body.abV22812Shell .readableTrendGrid .dailyTop small{font-size:10px;font-weight:800;color:#8B95A1}
body.abV22812Shell .readableTrendGrid .dailyAmt{font-size:13px;font-weight:800;color:#B0B8C1;white-space:nowrap;letter-spacing:-.02em}
body.abV22812Shell .readableTrendGrid .hasValue .dailyAmt{color:var(--accent)!important}
body.abV22812Shell .readableTrendGrid .dailyTrack{height:6px;background:#E8EBEF;border-radius:999px;overflow:hidden}
body.abV22812Shell .readableTrendGrid .dailyTrack i{display:block;height:100%;background:var(--accent);border-radius:999px}
body.abV22812Shell .dailyDrill{display:inline-flex;align-items:center;min-height:44px;margin-top:var(--ab12-sp-2,8px);color:var(--ab12-action);font-size:var(--ab12-fs-cap,12px);font-weight:800;text-decoration:none}
/* 챌린지 카드는 라이트에서도 어두운 표면이라 폼 라벨을 밝게 유지해야 한다. */
body.abV22812Shell .reportChallenge :is(label,label>span,summary){color:#d7dbee!important}
body.abV22812Shell .reportChallenge summary{color:#fff!important}
/* 일자별 셀: 빈 날 표시와 금액 요약이 4.5:1을 넘기지 못했다. */
body.abV22812Shell .dailyCell.noValue{opacity:.78!important}
body.abV22812Shell .dailyCell :is(span,small){color:var(--sub)!important}
body.abV22812Shell .dailyCell.hasValue span{color:var(--accent)!important}
/* 증감 배지는 밝은 카드 위에서 4.5:1을 넘기지 못했다. 대비가 확보된 토큰으로 맞춘다. */
body.abV22812Shell :is(.deltaDown,.deltaUp){color:var(--pos)!important}
body.abV22812Shell .deltaUp{color:var(--neg)!important}

/* V22.8.68 모바일 조작 영역.
   접기 헤더와 카드 헤더의 액션 링크가 14~36px밖에 되지 않아 손가락으로 정확히 누르기 어려웠다.
   레이아웃을 늘리지 않도록 min-height 로만 키우고, 이미 충분히 큰 요소는 건드리지 않는다. */
@media(max-width:899px){
  /* 접기 헤더는 목록 표시(::marker)를 유지해야 하므로 display 를 바꾸지 않는다.
     align-content 는 지원하는 브라우저에서만 세로 가운데로 놓이고, 아니면 위쪽 정렬로 남는다. */
  body.abV22812Shell details>summary{min-height:44px;box-sizing:border-box;align-content:center}
  /* 상단바의 가계부 이름 링크는 모든 화면에 있고 28px였다. */
  body.abV22812Shell .abNavMobileTop>a{min-height:44px;align-items:center}
  /* 카드 헤더·섹션 제목 옆의 "더 보기" 계열 링크. */
  body.abV22812Shell :is(.homeCard>h2,.reportCockpitHead,.reportSectionTitle,.sectionHead)>a,
  body.abV22812Shell :is(.homeOnboardingStep>a,.closeLink,.regLink,a.preset){display:inline-flex;align-items:center;min-height:44px}
  /* 가계부 카드의 열기·옵션·멤버는 39px로 1px 모자랐다. */
  body.abV22812Shell .hhActions>a{min-height:44px}
  /* 체크박스를 감싼 얇은 라벨. 실제 탭 영역은 라벨 전체다.
     inline 라벨에는 min-height 가 걸리지 않으므로 표시 방식을 함께 바꾼다. */
  body.abV22812Shell .reportChallengeToggle{min-height:44px;align-content:center}
  body.abV22812Shell form:is(#myImportForm,.complete)>label:has(input){display:flex;align-items:center;gap:6px;min-height:44px}
  /* 표 안의 링크는 행 높이를 늘리지 않도록 여백만 바깥으로 넓힌다. */
  body.abV22812Shell :is(table,.tableWrap) td>a:not(.btn){display:inline-block;padding-block:12px;margin-block:-12px}
}

/* V22.8.72 본문 바로가기.
   키보드로만 쓰는 사람은 화면을 넘길 때마다 상단바와 사이드바를 처음부터 다시 지나야 했다.
   데스크톱 홈은 사이드바 달력 때문에 Tab 을 55번 눌러야 본문 첫 요소에 닿았다.
   display:none·visibility:hidden 으로 감추면 포커스가 가지 않아 없는 것과 같으므로,
   화면 밖으로 밀어 두었다가 포커스를 받으면 제자리로 가져온다. */
body.abV22812Shell .abSkipLink{position:fixed;left:12px;top:-100px;z-index:2147483647;display:inline-flex;align-items:center;min-height:44px;padding:0 16px;border-radius:12px;background:var(--ab12-action,#1d4ed8);color:#fff!important;font-weight:900;text-decoration:none;box-shadow:0 10px 28px rgba(15,23,42,.28);transition:top var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))-out}
body.abV22812Shell .abSkipLink:focus,body.abV22812Shell .abSkipLink:focus-visible{top:12px}
/* 건너뛴 목적지에는 기본 포커스 테두리를 두지 않는다. 본문 전체를 두르는 굵은 사각형은
   "여기로 왔다"는 신호보다 오류처럼 읽힌다. 대신 왼쪽에 짧은 표시만 남긴다. */
body.abV22812Shell main:focus{outline:none!important}
body.abV22812Shell main:focus-visible{outline:none!important;box-shadow:inset 3px 0 0 var(--ab12-action,#1d4ed8)}
@media(prefers-reduced-motion:reduce){body.abV22812Shell .abSkipLink{transition:none}}

/* V22.8.74 다크 테마 대비 보정.
   라이트·다크 × 포인트 4종 8조합을 실기기 화면 크기로 렌더해 글자 대비를 다시 쟀다. */

/* 빈 상태 상자는 밝은 배경(#f8fafc)이 !important 로 박혀 있어 다크에서도 그대로 남았다.
   글자만 다크용 흐린 색으로 바뀌어 흰 상자에 연회색 글자가 되고 1.82:1 까지 떨어졌다. */
html[data-ab-resolved-theme="dark"] body.abV22812Shell :is(.empty,.homeEmpty){background:var(--ab12-surface-raised)!important;border-color:var(--ab12-line)!important;color:var(--ab12-muted)!important}

/* 다크의 전역 링크색 규칙이 이 배지의 흰 글자를 덮어써, 파란 배경 위에 연한 파란
   글자가 남았다(2.87:1). 같은 조건으로 한 번 더 눌러 흰 글자를 되돌린다. */
html[data-ab-resolved-theme="dark"] body.abV22812Shell a.abSkipLink{color:#fff!important}
`
  + `\n/* 빠른 입력 칩 아이콘. 홈 HTML 예산을 지키기 위해 마크업 대신 기존 data 속성으로 그린다. */\n${quickChipIconCss()}\n`
  + `\n/* V22.9.9 (개편 5단계): 머리말이 첫 화면을 먹지 않게 조인다.

   재 보니 390×844 화면에서 머리말 높이가 화면마다 이랬다:
     자산 547px · 정산 400px · 예산 388px · 분석 278px · 홈 275px
   상단 앱바(104px)까지 더하면 자산 화면은 첫 화면의 77%가 머리말이었다. 홈은
   가장 중요한 숫자("이번 달 쓸 수 있는 돈")가 그만큼 접힘 아래로 밀려 있었다.

   지우는 게 아니라 조인다. 안내문은 접을 수 있게 하고(접은 상태는 브라우저가 기억),
   제목·여백·컨트롤은 눈금을 한 단계씩 내린다. */
body.abV22812Shell .abV5PageHeader{margin:var(--ab12-sp-3,12px) auto!important;padding:16px 18px!important}
body.abV22812Shell .abV5PageHeader h1{font-size:22px!important;letter-spacing:-.02em}
body.abV22812Shell .abHeadNote{position:relative;margin:6px 0 0}
/* V22.9.10: 전체 메뉴의 "기준 변경"은 화면에서 가장 강한 요소였다 — 큰 파란 덩어리가
   폭 전체를 차지했다. 하는 일은 가계부·월 필터를 적용하는 것이고, 이 화면의 주된
   행동(= 어디로 갈지 고르기)이 아니다. 조용한 보조 버튼으로 내리고 고르는 것들과
   한 줄에 둔다.

   셀렉터가 긴 이유: 이 버튼을 파랗게 칠하는 규칙이
   .abV2281 button[type="submit"]:not(.danger):not(.delBtn):not(.secondary) 인데
   특이도가 (0,5,1) 이다 — [type="submit"] 도 클래스 한 칸으로 센다. 처음에 (0,4,3)
   으로 적었다가 졌고, 이겼는지 아닌지는 브라우저에 직접 물어서(CDP) 확인했다. */
body.abV22812Shell.abPageMenu .menuContext{display:grid!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto!important;gap:8px!important;align-items:center}
body.abV22812Shell.abPageMenu main.menuPage form.menuContext button[type="submit"]{grid-column:auto!important;background:var(--ab12-surface)!important;color:var(--ab12-accent)!important;border:1px solid var(--ab12-line)!important;font-weight:700!important;padding-inline:14px!important;white-space:nowrap}
body.abV22812Shell.abPageMenu main.menuPage form.menuContext button[type="submit"]:hover{background:var(--ab12-accent-soft)!important;border-color:var(--ab12-accent)!important}
body.abV22812Shell.abPageMenu .menuContext :is(select,input,button){min-height:40px!important}
/* 메뉴 아이콘은 이제 사이드바와 같은 SVG 다. 글리프 시절의 폰트 크기 대신
   선 굵기와 상자 크기로 맞춘다. */
body.abV22812Shell.abPageMenu :is(.menuRowIcon,.featuredIcon) svg{width:20px;height:20px;stroke-width:1.7}
body.abV22812Shell.abPageMenu .menuRowIcon{display:inline-flex;align-items:center;justify-content:center;color:var(--ab12-accent)!important}
body.abV22812Shell.abPageMenu .featuredIcon{display:inline-flex;align-items:center;justify-content:center;color:var(--ab12-accent)!important}
/* V22.9.11 (개편 7단계): 데스크톱에서 비어 있던 340px 과, 모바일에서 하단 탭에
   깔려 있던 마지막 줄.

   ── 1) 오른쪽 340px ──
   홈은 1280px 창에서 본문이 656px 만 쓰고 오른쪽 356px 이 비어 있었다. 원인은
   body 의 padding-right:340px 인데, 그 자리는 활동 레일(.abActivityRail)을 위한
   것이다. 그런데 레일은 [hidden] 상태였다 — **없는 것을 위해 자리를 비워 두고
   있었다.** 레일이 실제로 열려 있을 때만 비운다. 레일 폭 변수 하나만 0 으로
   바꾸면 이 변수를 쓰는 도킹 바·저장 알림 위치 계산이 전부 따라온다.

   :has() 를 모르는 브라우저는 지금과 똑같이 340px 을 비운다(퇴보 없음). */
@media(min-width:1181px){
  body.abV22812Shell:not(.abHasActivityRail){--abActivityRailW:0px}
}
/* V22.9.12 (개편 8단계): 움직임을 설계한다.

   재 보니 상호작용 요소 188개 중 전환 효과가 붙은 것은 43개(23%)뿐이었고, 그 43개도
   전부 0.12s ease 한 규격이었다 — 속도가 하나뿐이면 무엇이 빠르고 무엇이 느려야
   하는지에 대한 판단이 없다는 뜻이다. 소스에는 반대로 값이 흩어져 있었다:
   .08 .12 .14 .15 .16 .18 .22 .4 .45 .5 .6초와 620ms — 열세 가지.
   특히 "막대가 차오른다"는 같은 몸짓 하나에 네 가지 속도(.4/.45/.5/620ms)가 있었다.

   눈금을 넷으로 나누고 **무엇이 움직이는가**로 고르게 한다:
     fast 120ms  손끝 반응(색·배경·테두리)   — 누른 티가 즉시 나야 한다
     base 180ms  나타남·접힘
     slow 320ms  크게 움직이는 것
     gauge 520ms 값이 차오르는 것            — 읽을 시간이 필요하다 */
body.abV22812Shell :is(a,summary,label,.chip,.tab,[role="button"]){transition:color var(--ab12-dur-fast,120ms) var(--ab12-ease),background-color var(--ab12-dur-fast,120ms) var(--ab12-ease),border-color var(--ab12-dur-fast,120ms) var(--ab12-ease)}
/* 입력 칸도 같은 눈금을 쓴다. 초점 테두리가 툭 나타나면 어디를 눌렀는지보다
   "무언가 튀었다"가 먼저 읽힌다. */
body.abV22812Shell :is(input,select,textarea){transition:border-color var(--ab12-dur-fast,120ms) var(--ab12-ease),box-shadow var(--ab12-dur-fast,120ms) var(--ab12-ease),background-color var(--ab12-dur-fast,120ms) var(--ab12-ease)}
/* 링크·요약 줄은 마우스를 올려도 아무 일이 없었다. 배경을 아주 옅게 깔아 "여기 눌린다"만
   말한다 — 글자를 움직이거나 색을 바꾸면 목록이 흔들려 보인다. */
body.abV22812Shell :is(.menuRow,.abNavLinks a,.abNavGroup>summary):hover{background:var(--ab12-accent-soft)!important}
body.abV22812Shell a.featuredCard:hover{border-color:var(--ab12-accent)!important}
/* 누를 때는 아주 살짝 눌린다. 되돌아오는 것은 더 빨라야 손끝에 붙는 느낌이 난다. */
body.abV22812Shell :is(a.featuredCard,a.menuRow,.abNavLinks a):active{transform:translateY(1px)}

/* 사이드바 그룹 펼치기.
   <details> 는 기본적으로 애니메이션되지 않는다 — 높이가 한 프레임에 바뀐다.
   재 봤을 때도 280 → 280 → 280 → 280 으로, 열림이 아니라 점프로 보였다.
   ::details-content 와 interpolate-size 를 아는 브라우저에서만 켠다. 모르는
   브라우저는 지금과 똑같이 즉시 열린다 — 폴백 코드가 필요 없다. */
@supports (interpolate-size: allow-keywords) and selector(details::details-content){
  body.abV22812Shell{interpolate-size:allow-keywords}
  body.abV22812Shell .abNavGroup::details-content{height:0;overflow:hidden;opacity:0;transition:height var(--ab12-dur,180ms) var(--ab12-ease),opacity var(--ab12-dur,180ms) var(--ab12-ease),content-visibility var(--ab12-dur,180ms) allow-discrete}
  body.abV22812Shell .abNavGroup[open]::details-content{height:auto;opacity:1}
}
/* 그룹 머리글의 화살표도 같이 돈다. 열렸는지는 지금 색으로만 말하고 있었다. */
body.abV22812Shell .abNavGroup>summary>i{transition:transform var(--ab12-dur,180ms) var(--ab12-ease)}

/* 동작 줄이기를 켠 사람에게는 위의 모든 것을 걷어낸다. 게이지도 즉시 채운다 —
   차오르는 동안 숫자를 못 읽는 것보다 바로 보이는 편이 낫다. */
@media(prefers-reduced-motion:reduce){
  body.abV22812Shell *,body.abV22812Shell *::before,body.abV22812Shell *::after{transition-duration:1ms!important;animation-duration:1ms!important}
  body.abV22812Shell :is(a.featuredCard,a.menuRow,.abNavLinks a):active{transform:none}
}
/* V22.9.13 (개편 9단계): 같은 것은 같게 그린다.

   화면을 띄워 재 보니 카드 면 자체는 이미 통일돼 있었다 — 열한 화면 모두 흰 배경에
   같은 테두리색이다. 갈려 있던 것은 **모서리와 강조 면**이었다.

   ── 1) 모서리 16 / 18 / 20px ──
   같은 .card 클래스가 화면에 따라 세 가지로 그려졌다(예산 20px · 분석 18px ·
   자산 16px). 페이지별 CSS 가 각자 값을 적어 왔기 때문이다.

   처음에 --ab12-r-lg(16px)로 모으려다 잘못 짚었다. 카드 모서리의 정본은 이미
   --ab12-radius(20px)이고, 내 규칙은 그 정본과 싸우면서 16px 짜리 무리를 하나 더
   만들고 있었다. 정본을 새로 만들 게 아니라 정본을 따르게 되돌리는 것이 맞다. */

/* ── 2) 어두운 강조 면 둘이 서로 다른 어두움 ──
   홈에는 어두운 블록이 둘 있다 — 챌린지 카드와 SMART NOTICE. 그런데 하나는
   그라디언트(#171a2b→#222741), 하나는 단색(#111827)이고 모서리도 달랐다. 흰 카드
   사이에서 강조하겠다는 같은 뜻인데 다른 얼굴이라 톤이 붕 뜬다.

   판단: 그라디언트 대신 단색 --ab12-notice-bg 로 둘을 맞춘다. 어두운 블록이 한 화면에
   둘이나 있는 상황에서는 조용한 쪽이 낫다고 봤다. 되돌리려면 이 규칙만 지우면 된다. */
body.abV22812Shell :is(.reportChallenge,.homeNotice){background:var(--ab12-notice-bg,#111827)!important;background-image:none!important;border:1px solid rgba(255,255,255,.08)!important;border-radius:var(--ab12-radius,20px)!important}

/* ── 3) 카드 머리말 링크 하나만 밑줄 ──
   "홈 구성"은 16px·굵기 400·밑줄이었는데, 같은 자리의 다른 링크("주별"·"월별")는
   13px·굵기 1000·밑줄 없음이다. 하나만 브라우저 기본 링크처럼 보였다. */
body.abV22812Shell .homeReportsEdit{font-size:13px!important;font-weight:800!important;text-decoration:none!important;color:var(--ab12-accent)!important}
body.abV22812Shell .homeReportsEdit:hover{text-decoration:underline!important;text-underline-offset:3px}
/* V22.9.14: 월별 소비 흐름이 홈에서 글자 뭉텅이로 나오던 것.

   홈의 소비 흐름 "월별" 탭은 "수입지출 / 25만07월" 처럼 라벨이 붙어 나왔다. 일별·주별은
   멀쩡했다. 마크업을 보니 정상이었다 — 막대(<i>)와 금액(<b>)과 월(<span>)이 제대로 있다.
   문제는 CSS 였다: .series* 규칙이 **분석 화면의 인라인 CSS 안에만** 있어서, 같은
   컴포넌트를 그리는 홈은 그 CSS 를 한 번도 받지 못했다. 막대는 크기가 없어 안 보이고,
   <b> 와 <span> 은 인라인이라 "25만" 과 "07월" 이 그대로 붙었다. 범례의 "수입지출" 도
   같은 이유다(색 네모가 크기 0).

   컴포넌트를 두 화면이 쓰면 그 CSS 는 공용 자산에 있어야 한다. 옮기면서 색도 토큰으로
   바꾼다 — 리터럴이면 다크 모드와 컬러톤에서 또 어긋난다. */
body.abV22812Shell .seriesChart{display:flex;align-items:flex-end;gap:14px;padding:14px;border:1px solid var(--ab12-line,#e8edf4);border-radius:var(--ab12-radius,20px);background:var(--ab12-surface-raised,#f8fafc);overflow-x:auto}
body.abV22812Shell .seriesCol{display:grid;justify-items:center;gap:4px;min-width:52px}
body.abV22812Shell .seriesBars{display:flex;align-items:flex-end;gap:4px;height:124px}
body.abV22812Shell .seriesBars i{display:inline-block;width:15px;border-radius:6px 6px 0 0}
/* 두 막대는 **계열 색**이다 — 상태 색(--ab12-up/down)도, 강조 색(--ab12-action)도 쓰지
   않는다. 상태 색은 "늘었다/줄었다"는 뜻을 갖고 있어 수입·지출 구분에 쓰면 거짓말이 되고,
   강조 색은 톤을 따라가므로 그린 톤에서 수입과 지출이 같은 초록이 되어 범례가 무너진다.
   서로 구별되기만 하면 되는 자리라 고정색으로 둔다. */
body.abV22812Shell :is(.seriesBars,.seriesLegend) i.in{background:#10b981}
body.abV22812Shell :is(.seriesBars,.seriesLegend) i.ex{background:#3182f6}
body.abV22812Shell .seriesCol b{font-size:11px;color:var(--ab12-text,#334155)}
body.abV22812Shell .seriesCol span{font-size:11px;color:var(--ab12-muted,#64748b)}
body.abV22812Shell .seriesLegend{display:flex;gap:14px;margin:0 0 8px;color:var(--ab12-muted,#64748b);font-size:12px;align-items:center}
body.abV22812Shell .seriesLegend span{display:inline-flex;align-items:center}
body.abV22812Shell .seriesLegend i{display:inline-block;width:10px;height:10px;border-radius:3px;margin-right:5px}
@media(max-width:760px){body.abV22812Shell .seriesCol{min-width:44px}}
body.abV22812Shell .heroChips{display:flex!important;flex-wrap:wrap;gap:6px!important;margin-top:8px!important}
body.abV22812Shell .heroChips>span{min-height:0!important;padding:5px 10px!important;font-size:12px!important}
body.abV22812Shell .abHeadNote p{margin:0!important;font-size:13px!important;line-height:1.5!important;color:var(--sub)!important}
body.abV22812Shell .abHeadNote.isFolded p{display:none}
/* 접기 버튼은 안내문의 일부처럼 조용해야 한다 — 화면의 주된 행동이 아니다. */
/* 접기 버튼은 안내문 **문장 끝에 이어 붙는다**. 처음엔 문단 아래 블록 버튼으로 뒀는데,
   1023px 이하에서 터치 타깃 44px 을 강제하는 규칙에 걸려 버튼 혼자 44px 을 먹었다 —
   높이를 줄이려고 만든 것이 높이를 늘리고 있었다. 인라인 요소에는 min-height 가
   적용되지 않으므로, 텍스트처럼 흐르게 두면 그 규칙과 싸우지 않고도 0px 을 쓴다.
   대신 좌우 여백을 넉넉히 줘서 손가락으로 누를 폭은 확보한다. */
body.abV22812Shell .abHeadNote{display:block}
body.abV22812Shell .abHeadNote p{display:inline}
body.abV22812Shell .abHeadNote .abHeadNoteToggle{display:inline-block!important;vertical-align:baseline;margin:0 0 0 6px!important;padding:0 6px!important;min-height:0!important;height:auto!important;background:none!important;border:0!important;color:var(--sub)!important;font-size:12px!important;font-weight:700;text-decoration:underline;text-underline-offset:3px;cursor:pointer;white-space:nowrap}
body.abV22812Shell .abHeadNoteToggle:hover{color:var(--text)!important}
/* 가계부·월 고르기는 매번 바꾸는 값이 아니다. 세로로 쌓아 세 줄을 먹던 것을
   한 줄로 눕히고, 조회 버튼은 폭을 내용에 맞춘다. */
body.abV22812Shell .abV5ControlBar{margin-top:12px!important;grid-template-columns:minmax(0,1fr) minmax(0,1fr) auto!important;align-items:center}
body.abV22812Shell .abV5PageHeader .abV5ControlBar :is(input,select,button){min-height:40px!important;height:auto!important}
body.abV22812Shell .abV5ControlBar button{padding-inline:16px!important}
@media(max-width:480px){
  body.abV22812Shell .abV5PageHeader{padding:13px 14px!important}
  body.abV22812Shell .abV5PageHeader h1{font-size:20px!important}
}
`;
// @build:exports-start
export { ACCOUNTBOOK_SHELL_CSS };
// @build:exports-end
