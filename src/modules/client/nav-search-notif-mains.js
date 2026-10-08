
function mobileHomeNavStateClientMain() {
  var mobileLinks = Array.from(document.querySelectorAll(".bottom a.tab"));
  var desktopLinks = Array.from(document.querySelectorAll(".homeDesktopNav nav a"));
  if (!mobileLinks.length && !desktopLinks.length) return;
  var desktopMedia = typeof window.matchMedia === "function" ? window.matchMedia("(min-width:1024px)") : null;
  var allLinks = mobileLinks.concat(desktopLinks);
  function sectionKey(link) {
    var href = String(link?.getAttribute("href") || "");
    if (href === "#feed") return "feed";
    if (href === "#add") return "add";
    if (href === "#top") return "top";
    return "";
  }
  function hashKey() {
    var hash = String(window.location?.hash || "");
    return hash === "#feed" ? "feed" : hash === "#add" ? "add" : "top";
  }
  function activeMobileKey() {
    var active = mobileLinks.find(function(link) { return link.classList.contains("active") && sectionKey(link); });
    return active ? sectionKey(active) : hashKey();
  }
  function setCurrent(key) {
    var nextKey = ["top", "feed", "add"].includes(key) ? key : "top";
    allLinks.forEach(function(link) {
      var matches = sectionKey(link) === nextKey;
      if (sectionKey(link)) link.classList.toggle("active", matches);
      link.removeAttribute("aria-current");
    });
    var visibleLinks = desktopMedia?.matches ? desktopLinks : mobileLinks;
    var current = visibleLinks.find(function(link) { return sectionKey(link) === nextKey; });
    if (current) current.setAttribute("aria-current", "location");
  }
  function syncAfterScroll() {
    var run = function() { setCurrent(activeMobileKey()); };
    if (typeof window.requestAnimationFrame === "function") window.requestAnimationFrame(run);
    else run();
  }
  allLinks.forEach(function(link) {
    link.addEventListener("click", function() {
      var key = sectionKey(link);
      if (key) setCurrent(key);
    });
  });
  window.addEventListener("hashchange", function() { setCurrent(hashKey()); });
  window.addEventListener("scroll", syncAfterScroll, { passive: true });
  if (desktopMedia) {
    var syncMedia = function() { setCurrent(activeMobileKey()); };
    if (typeof desktopMedia.addEventListener === "function") desktopMedia.addEventListener("change", syncMedia);
    else if (typeof desktopMedia.addListener === "function") desktopMedia.addListener(syncMedia);
  }
  setCurrent(window.location?.hash ? hashKey() : activeMobileKey());
}

function mobileHomeShellJsAsset() {
  if (!AB_MOBILE_HOME_SHELL_JS_CACHE) {
    AB_MOBILE_HOME_SHELL_JS_CACHE = [
      // 분류 규칙이 먼저 정의돼 있어야 이 아래 빠른입력 파서가 읽을 수 있다.
      // 홈은 이 자산을 이미 받고 있으므로 요청이 늘지 않는다.
      abCategoryRulesJsAsset(),
      mobileHomeJsAsset(),
      `(${mobileHomeNavStateClientMain.toString()})();`,
    ].join("\n");
  }
  return AB_MOBILE_HOME_SHELL_JS_CACHE;
}

function accountbookStage4NavClientMain() {
  "use strict";
  function iconSvg(name) {
    var paths = {
      home: '<path d="M3 10.5 12 3l9 7.5"/><path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7"/>',
      records: '<path d="M6 3h12a2 2 0 0 1 2 2v16H4V5a2 2 0 0 1 2-2Z"/><path d="M8 8h8M8 12h8M8 16h5"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01"/>',
      recurring: '<path d="M20 7h-6V1"/><path d="M20 7a9 9 0 1 0 1 8"/>',
      receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2V3Z"/><path d="M9 8h6M9 12h6M9 16h3"/>',
      import: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M4 19h16"/>',
      settlement: '<path d="M7 7h13M16 3l4 4-4 4M17 17H4M8 13l-4 4 4 4"/>',
      // V22.8.87: 없던 키였다. iconSvg 는 모르는 이름을 home 으로 되돌려 주므로
      // "빠른 입력" 버튼이 집 모양을 달고 있었다. M1 의 가운데 ＋ 도 이 키를 쓴다.
      plus: '<path d="M12 5v14M5 12h14"/>',
      report: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
      stats: '<path d="M4 20V12M10 20V7M16 20V3M22 20H2"/>',
      budget: '<rect x="3" y="6" width="18" height="14" rx="3"/><path d="M16 11h5M7 6V4h10v2"/>',
      file: '<path d="M6 2h8l4 4v16H6V2Z"/><path d="M14 2v5h5M9 12h6M9 16h6"/>',
      sparkle: '<path d="m12 3 1.3 3.7L17 8l-3.7 1.3L12 13l-1.3-3.7L7 8l3.7-1.3L12 3ZM5 14l.8 2.2L8 17l-2.2.8L5 20l-.8-2.2L2 17l2.2-.8L5 14ZM19 13l.7 1.8 1.8.7-1.8.7L19 18l-.7-1.8-1.8-.7 1.8-.7L19 13Z"/>',
      bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8ZM22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      chat: '<path d="M21 15a4 4 0 0 1-4 4H8l-5 3v-7a7 7 0 0 1-1-4 8 8 0 0 1 8-8h3a8 8 0 0 1 8 8v4Z"/><path d="M7 10h.01M12 10h.01M17 10h.01"/>',
      switch: '<path d="M17 3l4 4-4 4M3 7h18M7 21l-4-4 4-4M21 17H3"/>',
      wallet: '<path d="M4 5h14a2 2 0 0 1 2 2v13H4a2 2 0 0 1-2-2V5a3 3 0 0 1 3-3h12"/><path d="M15 11h7v5h-7a2.5 2.5 0 0 1 0-5Z"/>',
      tag: '<path d="M20 13 13 20l-9-9V4h7l9 9Z"/><path d="M8.5 8.5h.01"/>',
      backup: '<ellipse cx="12" cy="5" rx="8" ry="3"/><path d="M4 5v6c0 1.7 3.6 3 8 3s8-1.3 8-3V5M4 11v6c0 1.7 3.6 3 8 3s8-1.3 8-3v-6"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/><path d="m9 12 2 2 4-4"/>',
      tools: '<path d="M14.7 6.3a4 4 0 0 0-5-5L7 4l3 3 2.7-2.7a4 4 0 0 0 2 2ZM5 13l6 6-2 2-6-6 2-2ZM14 14l7 7"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/>',
      plus: '<path d="M12 5v14M5 12h14"/>',
      palette: '<path d="M12 3a9 9 0 0 0 0 18h1.5a2.5 2.5 0 0 0 0-5H12a1.5 1.5 0 0 1 0-3h3a6 6 0 0 0 0-12h-3Z"/><path d="M7.5 9h.01M9 6h.01M13 6h.01"/>',
      more: '<circle cx="5" cy="12" r="1"/><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/>',
      check: '<path d="M20 6 9 17l-5-5"/>',
    };
    return '<svg class="abNavIconSvg" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + (paths[name] || paths.home) + "</svg>";
  }
  function contextQuery() {
    var params = new URLSearchParams(location.search);
    var month = params.get("month") || new Date(Date.now() + 32400000).toISOString().slice(0, 7);
    var household = params.get("household_id") || "";
    return "month=" + encodeURIComponent(month) + (household ? "&household_id=" + encodeURIComponent(household) : "");
  }
  function items() {
    var query = contextQuery();
    return [
      { key: "home", icon: "home", label: "홈", href: "/app?" + query },
      { key: "records", icon: "records", label: "기록", href: "/app?" + query + "&tab=transactions" },
      { key: "quick", icon: "plus", label: "입력", href: "/app?" + query + "&quick=1#quick", quick: true },
      { key: "budgets", icon: "budget", label: "예산", href: "/budgets?" + query },
      { key: "menu", icon: "more", label: "전체", href: "/menu?" + query },
    ];
  }
  function activeKey() {
    var path = String(location.pathname || "");
    var params = new URLSearchParams(location.search);
    if (path.indexOf("settlement") >= 0) return "settlement";
    if (path === "/my/analysis") return params.get("view") === "report" ? "analysis" : "stats";
    if (path.indexOf("budgets") >= 0) return "budgets";
    if (path === "/menu") return "menu";
    if (path === "/my/households") return "my-households";
    if (path === "/my/members") return "members";
    if (path === "/my/groups") return "groups";
    if (path === "/my/backup") return params.get("mode") === "import" || location.hash === "#myImportForm" ? "import" : "backup";
    if (path === "/payment-methods") return "payment-methods";
    if (path === "/reserve-plans") return "reserve-plans";
    if (path === "/reports") return "reports";
    if (path === "/annual" || path === "/annual-report") return "annual";
    if (path === "/goals" || path === "/savings-goals") return "goals";
    if (["/budget-alerts", "/today-budget", "/monthly-forecast", "/fixed-preview"].indexOf(path) >= 0) return "budget-alerts";
    if (path === "/smart-tools" || path === "/my/premium") return "smart-tools";
    if (path === "/keyword-guide" || path === "/categories") return "categories";
    if (path === "/my/backup-login") return "backup-login";
    if (path === "/app" && params.get("view") === "calendar") return "calendar";
    if (path === "/app" && (location.hash === "#feed" || params.get("tab") === "transactions")) return "records";
    if (path === "/app") return "home";
    return "";
  }
  function render(nav) {
    var active = activeKey();
    nav.setAttribute("aria-label", "모바일 주요 메뉴");
    nav.innerHTML = items().map(function(item) {
      var on = item.key === active;
      var classes = (on ? "active " : "") + (item.quick ? "abNavQuickInput" : "");
      return '<a data-key="' + item.key + '" class="' + classes.trim() + '" ' + (item.quick ? 'data-ab-quick-open ' : '') + (on ? 'aria-current="page" ' : "") + 'href="' + item.href + '"><i>' + iconSvg(item.icon) + "</i><span>" + item.label + "</span></a>";
    }).join("");
  }
  function hydrateIcons() {
    Array.from(document.querySelectorAll("[data-ab-nav-icon]")).forEach(function(target) {
      target.innerHTML = iconSvg(target.getAttribute("data-ab-nav-icon") || "home");
    });
  }
  var mobileMenuReturnFocus = null;
  function syncActiveNavigation() {
    var active = activeKey();
    var sidebarActive = active === "home" ? "app" : active;
    Array.from(document.querySelectorAll(".abLayoutNav a[data-key]")).forEach(function(link) {
      var on = link.getAttribute("data-key") === sidebarActive;
      link.classList.toggle("active", on);
      if (on) {
        link.setAttribute("aria-current", "page");
        var group = link.closest("details.abNavGroup");
        if (group) group.open = true;
      } else link.removeAttribute("aria-current");
    });
    Array.from(document.querySelectorAll(".abNavBottom a[data-key]")).forEach(function(link) {
      var key = link.getAttribute("data-key") || "";
      var on = key === active || (key === "home" && active === "app") || (key === "records" && active === "calendar") || (key === "stats" && active === "analysis");
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }
  function syncMobileMenu(open) {
    document.body.classList.toggle("abMobileNavOpen", !!open);
    var button = document.getElementById("abMobileMenuButton");
    if (button) button.setAttribute("aria-expanded", open ? "true" : "false");
    var drawer = document.getElementById("abDesktopSidebar");
    if (drawer && window.matchMedia && window.matchMedia("(max-width:899px)").matches) drawer.setAttribute("aria-hidden", open ? "false" : "true");
    if (open) {
      mobileMenuReturnFocus = document.activeElement;
      var activeLink = drawer && drawer.querySelector('a[aria-current="page"]');
      var target = activeLink || (drawer && drawer.querySelector("a,summary,button"));
      if (target && target.focus) target.focus();
    } else if (mobileMenuReturnFocus && mobileMenuReturnFocus.focus) {
      mobileMenuReturnFocus.focus();
      mobileMenuReturnFocus = null;
    }
  }
  function syncSideNav(collapsed) {
    document.body.classList.toggle("abNavCollapsed", !!collapsed);
    var button = document.getElementById("abDesktopNavToggle");
    if (button) {
      button.setAttribute("aria-expanded", collapsed ? "false" : "true");
      button.setAttribute("aria-label", collapsed ? "사이드바 펼치기" : "사이드바 접기");
    }
  }
  function bindShell() {
    window.syncAbMobileMenu = syncMobileMenu;
    window.syncAbSideNav = syncSideNav;
    window.toggleAbSideNav = function() {
      var collapsed = !document.body.classList.contains("abNavCollapsed");
      syncSideNav(collapsed);
      try { localStorage.setItem("abNavCollapsed", collapsed ? "1" : "0"); } catch (_error) {}
    };
    window.toggleAbMobileNav = function() { syncMobileMenu(!document.body.classList.contains("abMobileNavOpen")); };
    try { syncSideNav(localStorage.getItem("abNavCollapsed") === "1"); } catch (_error) { syncSideNav(false); }
    var mobileMedia = window.matchMedia ? window.matchMedia("(max-width:899px)") : null;
    var syncShellMedia = function() {
      var drawer = document.getElementById("abDesktopSidebar");
      if (!drawer) return;
      if (mobileMedia && mobileMedia.matches) drawer.setAttribute("aria-hidden", document.body.classList.contains("abMobileNavOpen") ? "false" : "true");
      else {
        document.body.classList.remove("abMobileNavOpen");
        drawer.removeAttribute("aria-hidden");
        var button = document.getElementById("abMobileMenuButton");
        if (button) button.setAttribute("aria-expanded", "false");
      }
    };
    syncShellMedia();
    if (mobileMedia) {
      if (typeof mobileMedia.addEventListener === "function") mobileMedia.addEventListener("change", syncShellMedia);
      else if (typeof mobileMedia.addListener === "function") mobileMedia.addListener(syncShellMedia);
    }
    document.addEventListener("click", function(event) {
      var link = event.target && event.target.closest && event.target.closest(".abLayoutNav a");
      if (link && window.matchMedia && window.matchMedia("(max-width:899px)").matches) { syncMobileMenu(false); return; }
      var drawer = event.target && event.target.closest && event.target.closest(".abLayoutNav");
      var top = event.target && event.target.closest && event.target.closest(".abNavMobileTop");
      if (document.body.classList.contains("abMobileNavOpen") && !drawer && !top) syncMobileMenu(false);
    });
    document.addEventListener("keydown", function(event) {
      if (event.key === "Escape") { syncMobileMenu(false); return; }
      if (event.key !== "Tab" || !document.body.classList.contains("abMobileNavOpen")) return;
      var drawer = document.getElementById("abDesktopSidebar");
      if (!drawer) return;
      var focusable = Array.from(drawer.querySelectorAll("a,button,summary")).filter(function(node) { return node.offsetParent !== null && !node.hasAttribute("disabled"); });
      if (!focusable.length) return;
      var first = focusable[0], last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    });
  }
  var globalActionReturnFocus = null;
  function globalActionMarkup() {
    return '<div class="abGlobalActions" data-ab-quick-dock aria-label="빠른 실행">' +
      '<button type="button" class="abGlobalAction" data-abv5-search-open>' + iconSvg("search") + '<span>거래 검색</span></button>' +
      '<a class="abGlobalAction abGlobalActionPrimary abGlobalActionQuick" data-ab-global-direct="quick" data-ab-quick-open href="/app?' + contextQuery() + '#add">' + iconSvg("plus") + '<span>빠른 입력</span></a>' +
      '<button type="button" class="abGlobalAction" data-abv5-notif-open aria-label="알림 센터">' + iconSvg("bell") + '<span>알림</span><span class="abV5NotifBadge" hidden></span></button>' +
      '<button type="button" class="abGlobalAction" data-ab-global-open="appearance">' + iconSvg("palette") + '<span>화면 설정</span></button>' +
      // V22.8.87 M1: 모바일 상단바의 "작업" 버튼을 뺐다. 그 버튼이 열던 목록은
      // 검색·알림·화면 설정 셋이었고, 셋 다 이제 전체 메뉴 서랍 안에 직접 놓인다.
      // 상단바에 아이콘을 쌓으면 좁은 화면에서 가계부 이름과 자리를 다툰다.
      '</div>';
  }
  function dialogMarkup() {
    return '<dialog id="abGlobalActionDialog" class="abGlobalDialog" aria-labelledby="abGlobalDialogTitle">' +
      '<header class="abGlobalDialogHeader"><div><h2 id="abGlobalDialogTitle">공통 작업</h2><p id="abGlobalDialogDescription">현재 가계부와 기준 월을 유지합니다.</p></div><button type="button" class="abGlobalDialogClose" data-ab-global-close aria-label="닫기">×</button></header>' +
      '<div class="abGlobalDialogBody" data-ab-global-panel="actions"><div class="abGlobalActionGrid">' +
      '<button type="button" class="abGlobalActionChoice" data-abv5-search-open>' + iconSvg("search") + '<span>거래 검색</span></button>' +
      '<a class="abGlobalActionChoice" data-ab-quick-open href="/app?' + contextQuery() + '#add">' + iconSvg("plus") + '<span>빠른 입력</span></a>' +
      '<button type="button" class="abGlobalActionChoice" data-abv5-notif-open>' + iconSvg("bell") + '<span>알림 센터</span><span class="abV5NotifBadge" hidden></span></button>' +
      '<button type="button" class="abGlobalActionChoice" data-ab-global-open="appearance">' + iconSvg("palette") + '<span>화면 설정</span></button>' +
      '</div></div>' +
      '<div class="abGlobalDialogBody" data-ab-global-panel="appearance" hidden><div class="abGlobalAppearance"><div class="abGlobalAppearanceRow"><b>화면 모드</b><div class="abGlobalAppearanceChoices" role="group" aria-label="화면 모드"><button type="button" data-ab-theme-choice="light" aria-pressed="false">라이트</button><button type="button" data-ab-theme-choice="dark" aria-pressed="false">다크</button></div></div><div class="abGlobalAppearanceRow"><b>컬러톤</b><div class="abGlobalAppearanceChoices" role="group" aria-label="컬러톤"><button type="button" data-ab-tone-choice="blue" aria-pressed="false">블루</button><button type="button" data-ab-tone-choice="emerald" aria-pressed="false">그린</button><button type="button" data-ab-tone-choice="violet" aria-pressed="false">바이올렛</button><button type="button" data-ab-tone-choice="amber" aria-pressed="false">앰버</button></div></div><p class="abGlobalAppearanceNote">설정은 이 브라우저에 저장되며 모든 로그인 후 화면에 적용됩니다.</p></div></div>' +
      '</dialog>';
  }
  function openGlobalAction(panelName, trigger) {
    var dialog = document.getElementById("abGlobalActionDialog");
    if (!dialog) return;
    if (!dialog.open) globalActionReturnFocus = trigger || document.activeElement;
    Array.from(dialog.querySelectorAll("[data-ab-global-panel]")).forEach(function(panel) { panel.hidden = panel.getAttribute("data-ab-global-panel") !== panelName; });
    var titles = { actions: ["공통 작업", "현재 가계부와 기준 월을 유지합니다."], appearance: ["화면 설정", "라이트·다크 모드와 포인트 컬러를 선택합니다."] };
    var copy = titles[panelName] || titles.actions;
    var title = document.getElementById("abGlobalDialogTitle");
    var description = document.getElementById("abGlobalDialogDescription");
    if (title) title.textContent = copy[0];
    if (description) description.textContent = copy[1];
    document.body.classList.add("abGlobalDialogOpen");
    if (typeof dialog.showModal === "function" && !dialog.open) dialog.showModal();
    else dialog.setAttribute("open", "");
    var focusTarget = dialog.querySelector('[data-ab-global-panel="' + panelName + '"] button, [data-ab-global-panel="' + panelName + '"] a');
    if (focusTarget && focusTarget.focus) focusTarget.focus();
  }
  function closeGlobalAction() {
    var dialog = document.getElementById("abGlobalActionDialog");
    if (!dialog) return;
    if (typeof dialog.close === "function" && dialog.open) dialog.close();
    else dialog.removeAttribute("open");
    document.body.classList.remove("abGlobalDialogOpen");
    if (globalActionReturnFocus && globalActionReturnFocus.focus) globalActionReturnFocus.focus();
    globalActionReturnFocus = null;
  }
  function restoreGlobalActionFocus() {
    document.body.classList.remove("abGlobalDialogOpen");
    if (globalActionReturnFocus && globalActionReturnFocus.focus) globalActionReturnFocus.focus();
    globalActionReturnFocus = null;
  }
  // V22.8.87 M1: 예전에는 "작업" 버튼을 상단바로 옮겨 붙였다. 이제 그 버튼이 없고,
  // 검색·알림·화면 설정 셋을 전체 메뉴 서랍 안으로 옮긴다.
  //
  // 복제가 아니라 이동을 쓴다: 검색·알림 트리거는 첫 번째 요소에만 묶일 수 있어
  // 복제본은 눌러도 아무 일이 없는 채로 조용히 남을 수 있다.
  // 대신 되돌리는 길을 만든다 — 이 셋은 데스크톱 독에서도 쓰는 요소라, 창을 넓혔을 때
  // 서랍에 남아 있으면 데스크톱에서 사라진다. 폭이 바뀔 때마다 제자리를 다시 잡는다.
  var GLOBAL_ACTION_ORDER = ["[data-abv5-search-open]", "[data-ab-quick-open]", "[data-abv5-notif-open]", "[data-ab-global-open='appearance']"];
  var mobileActionQuery = window.matchMedia ? window.matchMedia("(max-width:899px)") : null;
  function findGlobalAction(selector) {
    return document.querySelector(".abGlobalActions " + selector) || document.querySelector(".abNavDrawerActions " + selector);
  }
  function syncGlobalActionPlacement() {
    var actions = document.querySelector(".abGlobalActions");
    var footer = document.querySelector(".abLayoutNav .abNavFooter");
    if (!actions || !footer) return;
    var wantDrawer = mobileActionQuery ? mobileActionQuery.matches : false;
    var group = footer.querySelector(".abNavDrawerActions");
    if (wantDrawer) {
      if (!group) {
        group = document.createElement("div");
        group.className = "abNavDrawerActions";
        group.setAttribute("aria-label", "빠른 실행");
        footer.insertBefore(group, footer.firstChild);
      }
      // 빠른 입력은 옮기지 않는다 — 모바일에서는 하단 탭 가운데 ＋ 가 그 일을 한다.
      ["[data-abv5-search-open]", "[data-abv5-notif-open]", "[data-ab-global-open='appearance']"].forEach(function(selector) {
        var element = findGlobalAction(selector);
        if (element && element.parentNode !== group) group.appendChild(element);
      });
      return;
    }
    if (!group) return;
    // 데스크톱으로 돌아갈 때는 원래 순서대로 다시 붙인다. 옮겨 온 것만 되돌리면
    // 빠른 입력이 맨 앞으로 밀려 독의 차례가 뒤집힌다.
    GLOBAL_ACTION_ORDER.forEach(function(selector) {
      var element = findGlobalAction(selector);
      if (element) actions.appendChild(element);
    });
    group.remove();
  }
  function bindGlobalActions() {
    if (!document.querySelector(".abLayoutNav")) return;
    if (document.getElementById("abGlobalActionDialog")) return;
    document.body.insertAdjacentHTML("beforeend", globalActionMarkup() + dialogMarkup());
    syncGlobalActionPlacement();
    if (mobileActionQuery) {
      if (mobileActionQuery.addEventListener) mobileActionQuery.addEventListener("change", syncGlobalActionPlacement);
      else if (mobileActionQuery.addListener) mobileActionQuery.addListener(syncGlobalActionPlacement);
    }
    var dialog = document.getElementById("abGlobalActionDialog");
    document.addEventListener("click", function(event) {
      var v5Action = event.target && event.target.closest && event.target.closest("[data-abv5-search-open],[data-abv5-notif-open],[data-ab-quick-open]");
      if (v5Action && dialog && dialog.open) closeGlobalAction();
      var open = event.target && event.target.closest && event.target.closest("[data-ab-global-open]");
      if (open) { openGlobalAction(open.getAttribute("data-ab-global-open") || "actions", open); return; }
      var close = event.target && event.target.closest && event.target.closest("[data-ab-global-close]");
      if (close) closeGlobalAction();
    });
    if (dialog) {
      dialog.addEventListener("cancel", function() { document.body.classList.remove("abGlobalDialogOpen"); });
      dialog.addEventListener("close", restoreGlobalActionFocus);
      dialog.addEventListener("click", function(event) { if (event.target === dialog) closeGlobalAction(); });
    }
    document.addEventListener("keydown", function(event) {
      var target = event.target;
      var editing = target && (target.matches && target.matches("input,textarea,select,[contenteditable=true]"));
      if (event.key === "Escape" && dialog && dialog.open) { event.preventDefault(); closeGlobalAction(); return; }
      if (event.key === "/" && !event.ctrlKey && !event.metaKey && !event.altKey && !editing) {
        var searchTrigger = document.querySelector("[data-abv5-search-open]");
        if (searchTrigger) { event.preventDefault(); searchTrigger.click(); }
      }
    });
  }
  // V22.8.86 지연 로드 계약(작업지시서 4.5). 수정 폼은 초기 HTML 에 없다.
  // <details> 를 처음 열 때 조각을 받아 슬롯을 채운다. 실패하면 슬롯에 남아 있는
  // 링크를 그대로 두어 화면 이동으로 도달할 수 있게 한다 — 되돌아갈 길을 지운 뒤
  // 실패하는 것이 가장 나쁘다. 이 스크립트가 아예 안 와도 링크는 처음부터 있다.
  function bindDeferredEditForms(root) {
    var scope = root && root.querySelectorAll ? root : document;
    Array.from(scope.querySelectorAll("details[data-ab-edit-src]")).forEach(function (details) {
      if (details.getAttribute("data-ab-edit-bound") === "1") return;
      details.setAttribute("data-ab-edit-bound", "1");
      details.addEventListener("toggle", function () {
        if (!details.open) return;
        if (details.getAttribute("data-ab-edit-state")) return;
        var slot = details._abEditSlot || details.querySelector(".v8-editSlot");
        var src = details.getAttribute("data-ab-edit-src");
        if (!slot || !src) return;
        details.setAttribute("data-ab-edit-state", "loading");
        slot.setAttribute("aria-busy", "true");
        slot.querySelectorAll(".abEditStatus,[data-ab-edit-retry]").forEach(function(node) { node.remove(); });
        var status = document.createElement("p");
        status.className = "abEditStatus";
        status.setAttribute("role", "status");
        status.textContent = "수정 항목을 불러오는 중입니다.";
        slot.prepend(status);
        fetch(src + (src.indexOf("?") >= 0 ? "&" : "?") + "fragment=1", { credentials: "same-origin", headers: { "x-requested-with": "fetch" } })
          .then(function (response) {
            if (!response.ok) throw new Error("status " + response.status);
            return response.text();
          })
          .then(function (html) {
            if (!html) throw new Error("empty");
            slot.innerHTML = html;
            slot.removeAttribute("aria-busy");
            details.setAttribute("data-ab-edit-state", "ready");
            var first = slot.querySelector('select:not(:disabled),input:not([type="hidden"]):not(:disabled),button:not(:disabled)');
            if (first && details.open && slot.getClientRects().length && typeof first.focus === "function") first.focus();
          })
          .catch(function () {
            // 링크는 지우지 않았으므로 그대로 남는다. 재시도할 수 있게 상태만 푼다.
            slot.removeAttribute("aria-busy");
            details.removeAttribute("data-ab-edit-state");
            status.textContent = "수정 항목을 불러오지 못했습니다. 다시 시도하거나 수정 화면을 열어 주세요.";
            var retry = document.createElement("button");
            retry.type = "button";
            retry.setAttribute("data-ab-edit-retry", "");
            retry.textContent = "다시 시도";
            retry.addEventListener("click", function() {
              status.remove(); retry.remove();
              details.open = false;
              requestAnimationFrame(function() { details.open = true; });
            });
            slot.appendChild(retry);
          });
      });
    });
  }

  // V22.8.93 (9장): 서버는 완성된 글자를 보내고(9.3), 여기서는 **값이 처음 바뀌는
  // 순간에만** 그 자리를 <number-flow> 로 바꾼다. 그래서 JS 가 없거나 늦어도 화면은
  // 처음부터 완성 상태이고, 첫 진입에서 0부터 올라오는 카운트업도 일어나지 않는다(9.2).
  // 라이브러리는 초기 HTML 에 없다 — 첫 값 변화 때 import() 로만 내려온다(9.4).
  var abFlowModule = null;
  function abLoadNumberFlow() {
    if (abFlowModule) return abFlowModule;
    abFlowModule = import("/assets/number-flow-v22893.mjs")
      .then(function () { return customElements.whenDefined("number-flow"); });
    return abFlowModule;
  }
  function abNumValue(node) {
    var raw = node && node.getAttribute ? node.getAttribute("data-ab-num") : "";
    var value = Number(raw);
    return raw === "" || raw === null || !isFinite(value) ? null : value;
  }
  // 9.5: 그림자 DOM 안에는 0~9 자릿수 더미가 들어 있어 그대로 읽히면 뜻이 없는 소리가
  // 된다. 단위까지 포함한 완성 문장을 값이 바뀔 때마다 다시 붙인다.
  function abFlowLabel(host, text) {
    var label = (host.getAttribute("data-ab-num-label") || "").trim();
    if (!label) {
      var box = host.closest(".homeBudget,.homeDailyPlan,.budgetP0");
      var lead = box && box.querySelector("span");
      label = lead ? (lead.textContent || "").trim() : "";
    }
    return (label ? label + " " : "") + text + (host.getAttribute("data-ab-num-unit") || "");
  }
  function abUpgradeNumber(host, next) {
    return abLoadNumberFlow().then(function () {
      var flow = host.__abFlow;
      if (!flow) {
        flow = document.createElement("number-flow");
        // 9.5: 설정은 업그레이드 후 · update() 전. 엘리먼트가 정의되기 전에 대입하면
        // 세터에 닿지 않고 죽은 속성으로 남는다 — whenDefined 뒤에 넣는 이유다.
        var spin = { duration: 620, easing: "cubic-bezier(.2,.8,.2,1)" };
        flow.transformTiming = spin;
        flow.spinTiming = spin;
        flow.opacityTiming = { duration: 340, easing: "ease-out" };
        flow.locales = "ko-KR";
        // 퍼센트는 비율을 받는다. 29 를 넘기면 Intl 이 다시 100 을 곱해 2,900% 가 된다.
        if (host.getAttribute("data-ab-num-style") === "percent") flow.format = { style: "percent" };
        flow.style.lineHeight = "0.85";
        flow.style.fontVariantNumeric = "tabular-nums";
        host.textContent = "";
        host.appendChild(flow);
        host.__abFlow = flow;
        // 첫 교체는 지금 화면에 있는 값에서 출발해야 굴러가는 방향이 뜻과 맞는다.
        flow.update(abNumValue(host));
      }
      flow.update(next);
      host.setAttribute("aria-label", abFlowLabel(host, flow.textContent || String(next)));
      host.setAttribute("data-ab-num", String(next));
    });
  }
  // 밖에서 값을 바꿀 때 쓰는 하나의 입구. 값이 그대로면 아무것도 하지 않는다 —
  // 바뀌지 않은 숫자를 굴리면 "무언가 달라졌다"는 거짓 신호가 된다.
  window.abSetNumber = function (host, next) {
    if (!host || !isFinite(Number(next))) return;
    if (abNumValue(host) === Number(next)) return;
    abUpgradeNumber(host, Number(next));
  };
  // 8.2: 저장하고 돌아오면 게이지가 이전 값에서 출발해 실제 값으로 움직인다. 서버가
  // 담아 준 이전 값으로 한 프레임 되돌린 뒤 실제 값을 돌려준다. 동작 줄이기가 켜져
  // 있으면 CSS 쪽 전환이 0 이라 결과만 바뀐다(전환을 건너뛴 것과 같다).
  function bindGaugeHandoff(root) {
    Array.from((root || document).querySelectorAll(".homeProgress i[data-ab-prev-used]")).forEach(function (bar) {
      if (bar.__abHandoff) return;
      bar.__abHandoff = true;
      var target = bar.style.width;
      bar.style.width = bar.getAttribute("data-ab-prev-used") + "%";
      requestAnimationFrame(function () {
        requestAnimationFrame(function () { bar.style.width = target; });
      });
    });
  }

  // V22.8.95 (10장): 데스크톱 커서 로더. 켜는 조건 넷을 **모두** 만족할 때만
  // 스크립트를 내려받는다. 터치 기기와 899px 이하에서는 네트워크에 아무것도 뜨지
  // 않는다(10.5). 초기 HTML 증가 0바이트 — 로더는 이미 내려가던 이 자산 안에 있다.
  var abCursorModule = null;
  var abCursorMotion = null;
  function abCursorAllowed() {
    if (!window.matchMedia) return false;
    if (!window.matchMedia("(hover:hover) and (pointer:fine)").matches) return false;
    if (abCursorMotion && abCursorMotion.matches) return false;
    return Math.min(window.innerWidth || 0, (document.documentElement || {}).clientWidth || 0) >= 900;
  }
  function abCursorStop() {
    if (abCursorModule) abCursorModule.then(function (mod) { if (mod && mod.stop) mod.stop(); });
  }
  function abCursorStart() {
    if (abCursorModule || !abCursorAllowed()) return;
    // 스위치는 (가계부·사용자) 설정이다. 기본은 켜짐이고, 못 읽으면 켜지 않는다 —
    // 꺼 둔 사람에게 잘못 켜는 쪽이 그 반대보다 나쁘다.
    abCursorModule = fetch("/cursor-preference" + location.search, { credentials: "same-origin" })
      .then(function (response) { return response.ok ? response.json() : { on: false }; })
      .then(function (pref) {
        if (!pref || pref.on === false || !abCursorAllowed()) return null;
        return import("/assets/ab-cursor-v22895.mjs").then(function (mod) { mod.start(); return mod; });
      })
      .catch(function () { return null; });
  }
  function bindCursorEffect() {
    if (!window.matchMedia) return;
    abCursorMotion = window.matchMedia("(prefers-reduced-motion:reduce)");
    // 동작 줄이기를 켜면 즉시 해제하고 캔버스를 지운다. 다시 끄면 되살아난다.
    var onMotion = function () { if (abCursorMotion.matches) { abCursorStop(); abCursorModule = null; } };
    if (abCursorMotion.addEventListener) abCursorMotion.addEventListener("change", onMotion);
    else if (abCursorMotion.addListener) abCursorMotion.addListener(onMotion);
    if (!abCursorAllowed()) return;
    window.addEventListener("mousemove", abCursorStart, { once: true });
  }

  function apply() {
    bindGlobalActions();
    Array.from(document.querySelectorAll("nav.bottom,nav.abNavBottom,nav.abUxBottom")).forEach(render);
    hydrateIcons();
    syncActiveNavigation();
    bindDeferredEditForms(document);
    bindGaugeHandoff(document);
  }
  bindCursorEffect();
  bindShell();
  apply();
  window.addEventListener("hashchange", apply);
  window.addEventListener("pageshow", apply);
}

function accountbookStage4NavJsAsset() {
  if (!AB_ACCOUNTBOOK_STAGE4_NAV_JS_CACHE) {
    AB_ACCOUNTBOOK_STAGE4_NAV_JS_CACHE = `(${accountbookStage4NavClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_STAGE4_NAV_JS_CACHE;
}

function accountbookSearchClientMain() {
  var overlay = document.getElementById("abV5Search");
  if (!overlay) return;
  var input = document.getElementById("abV5SearchInput");
  var resultsBox = document.getElementById("abV5SearchResults");
  var timer = null;
  var lastQ = null;
  var favIds = {};
  var favList = [];
  var returnFocus = null;
  var panel = overlay.querySelector(".abV5SearchPanel");
  function favKeyOf(r) {
    return (r.transaction_date || "") + "|" + (r.type || "expense") + "|" + (r.amount || 0) + "|" + String(r.memo || r.category || "").trim();
  }
  function currentHousehold() {
    try {
      var p = new URLSearchParams(location.search);
      return p.get("household") || p.get("household_id") || "";
    } catch (e) { return ""; }
  }
  function isOpen() { return !overlay.hidden; }
  function fmt(n) { try { return Number(n || 0).toLocaleString("ko-KR"); } catch (e) { return String(n || 0); } }
  function setMessage(text) {
    resultsBox.textContent = "";
    var d = document.createElement("div");
    d.className = "abV5SearchEmpty";
    d.textContent = text;
    resultsBox.appendChild(d);
  }
  function focusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
  }
  function open(trigger) {
    if (!isOpen()) returnFocus = trigger || document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("abV5SearchOpen");
    lastQ = null;
    setTimeout(function () { if (input) { input.focus(); input.select(); } }, 30);
    run(input ? input.value : "");
    loadFavorites();
  }
  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("abV5SearchOpen");
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }
  function buildRow(r) {
    var row = document.createElement("div");
    row.className = "abV5SearchRow";
    var a = document.createElement("a");
    a.className = "abV5SearchRowLink";
    a.href = "/app?month=" + encodeURIComponent(r.month || "")
      + (currentHousehold() ? "&household_id=" + encodeURIComponent(currentHousehold()) : "")
      + (r.transaction_date ? "&date=" + encodeURIComponent(r.transaction_date) : "")
      + "&abfm=" + encodeURIComponent(r.memo || r.category || "")
      + "&abfa=" + encodeURIComponent(String(r.amount || ""))
      + "#feed";
    a.setAttribute("role", "listitem");
    var main = document.createElement("div");
    main.className = "abV5SearchRowMain";
    var memo = document.createElement("b");
    memo.textContent = r.memo || r.category || "(메모 없음)";
    var meta = document.createElement("small");
    var parts = [];
    if (r.transaction_date) parts.push(r.transaction_date);
    if (r.category) parts.push(r.category);
    if (r.payment_method) parts.push(r.payment_method);
    if (r.member) parts.push(r.member);
    meta.textContent = parts.join(" · ");
    main.appendChild(memo);
    main.appendChild(meta);
    var amt = document.createElement("span");
    amt.className = "abV5SearchAmt " + (r.type === "income" ? "isIncome" : "isExpense");
    amt.textContent = (r.type === "income" ? "+" : "-") + fmt(r.amount) + "원";
    a.appendChild(main);
    a.appendChild(amt);
    var star = document.createElement("button");
    star.type = "button";
    var fk = favKeyOf(r);
    star.className = "abV5SearchFav" + (favIds[fk] ? " isFav" : "");
    star.setAttribute("aria-label", "즐겨찾기");
    star.setAttribute("aria-pressed", favIds[fk] ? "true" : "false");
    star.textContent = "★";
    star.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); toggleFav(r, star); });
    row.appendChild(a);
    row.appendChild(star);
    return row;
  }
  function render(data) {
    resultsBox.textContent = "";
    var list = (data && data.results) || [];
    if (!list.length) { setMessage("검색 결과가 없어요."); return; }
    if (data && data.has_more) {
      var notice = document.createElement("p");
      notice.className = "abV5SearchFavHead";
      notice.setAttribute("role", "status");
      notice.textContent = "더 많은 결과가 있어 처음 50건만 표시합니다. 검색어를 더 구체적으로 입력해 주세요.";
      resultsBox.appendChild(notice);
    }
    list.forEach(function (r) { resultsBox.appendChild(buildRow(r)); });
  }
  function renderFavorites() {
    resultsBox.textContent = "";
    if (!favList.length) { setMessage("메모·분류·결제수단·금액으로 검색하거나 ★로 자주 보는 거래를 즐겨찾기하세요."); return; }
    var head = document.createElement("div");
    head.className = "abV5SearchFavHead";
    head.textContent = "즐겨찾기";
    resultsBox.appendChild(head);
    favList.forEach(function (r) { resultsBox.appendChild(buildRow(r)); });
  }
  function loadFavorites() {
    var url = "/u/api/favorites";
    var hh = currentHousehold();
    if (hh) url += "?household=" + encodeURIComponent(hh);
    fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (json) {
        favList = (json && json.favorites) || [];
        favIds = {};
        favList.forEach(function (f) { favIds[f.id] = true; });
        if (isOpen() && !String((input && input.value) || "").trim()) renderFavorites();
      })
      .catch(function () {});
  }
  function toggleFav(r, btn) {
    var fk = favKeyOf(r);
    var on = !favIds[fk];
    favIds[fk] = on;
    if (btn) { btn.classList.toggle("isFav", on); btn.setAttribute("aria-pressed", on ? "true" : "false"); }
    var body = on ? { household: currentHousehold(), id: fk, tx: { id: fk, type: r.type, amount: r.amount, memo: r.memo, category: r.category, payment_method: r.payment_method, transaction_date: r.transaction_date, month: r.month } } : { household: currentHousehold(), id: fk, remove: true };
    fetch("/u/api/favorites", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (json) { favList = (json && json.favorites) || favList; favIds = {}; favList.forEach(function (f) { favIds[f.id] = true; }); })
      .catch(function () { favIds[fk] = !on; if (btn) { btn.classList.toggle("isFav", !on); btn.setAttribute("aria-pressed", !on ? "true" : "false"); } });
  }
  function run(q) {
    var query = String(q || "").trim();
    if (query === lastQ) return;
    lastQ = query;
    if (!query) { renderFavorites(); return; }
    setMessage("검색 중…");
    var url = "/u/api/tx/search?q=" + encodeURIComponent(query);
    var hh = currentHousehold();
    if (hh) url += "&household=" + encodeURIComponent(hh);
    fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (data) { if (lastQ === query) render(data); })
      .catch(function (err) { if (lastQ === query) setMessage(err === 401 ? "로그인이 필요해요." : "검색 중 문제가 생겼어요."); });
  }
  if (input) {
    input.addEventListener("input", function () {
      clearTimeout(timer);
      var v = input.value;
      timer = setTimeout(function () { run(v); }, 350);
    });
  }
  overlay.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("[data-abv5-search-close]")) { close(); }
  });
  document.addEventListener("keydown", function (ev) {
    var k = ev.key;
    if ((ev.metaKey || ev.ctrlKey) && (k === "k" || k === "K")) {
      ev.preventDefault();
      if (isOpen()) { close(); } else { open(document.activeElement); }
    } else if (k === "Escape" && isOpen()) {
      ev.preventDefault();
      close();
    } else if (k === "Tab" && isOpen() && panel) {
      var nodes = focusable(panel);
      if (!nodes.length) { ev.preventDefault(); panel.focus(); return; }
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("[data-abv5-search-open]");
    if (!btn) return;
    ev.preventDefault();
    var focusTarget = btn.closest && btn.closest("#abGlobalActionDialog")
      ? document.querySelector('[data-ab-global-open="actions"]') || btn
      : btn;
    open(focusTarget);
  });
  setMessage("메모·분류·결제수단·금액으로 검색해 보세요.");
  function tryFocusFromUrl() {
    var p; try { p = new URLSearchParams(location.search); } catch (e) { return; }
    var memo = (p.get("abfm") || "").trim();
    var amtDigits = (p.get("abfa") || "").replace(/[^0-9]/g, "");
    if (!memo && !amtDigits) return;
    var tries = 0;
    function attempt() {
      tries += 1;
      var candidates = document.querySelectorAll(".txRow,.txItem,.timelineItem");
      var found = null;
      for (var i = 0; i < candidates.length; i++) {
        var node = candidates[i];
        if (node.closest && node.closest("#abV5Search")) continue;
        var text = node.textContent || "";
        var okMemo = !memo || text.indexOf(memo) >= 0;
        var okAmt = !amtDigits || text.replace(/[^0-9]/g, "").indexOf(amtDigits) >= 0;
        if (okMemo && okAmt) { found = node; break; }
      }
      if (found) {
        try { found.scrollIntoView({ behavior: "smooth", block: "center" }); } catch (e) {}
        found.classList.add("abV5Focus");
        setTimeout(function () { found.classList.remove("abV5Focus"); }, 2600);
        return;
      }
      if (tries < 12) setTimeout(attempt, 300);
    }
    attempt();
  }
  tryFocusFromUrl();
}

function accountbookSearchJsAsset() {
  if (!AB_ACCOUNTBOOK_SEARCH_JS_CACHE) {
    AB_ACCOUNTBOOK_SEARCH_JS_CACHE = `(${accountbookSearchClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_SEARCH_JS_CACHE;
}

function accountbookNotifClientMain() {
  var overlay = document.getElementById("abV5Notif");
  var listBox = document.getElementById("abV5NotifList");
  var badges = document.querySelectorAll(".abV5NotifBadge");
  if (!overlay || !listBox) return;
  var data = [];
  var dismissed = {};
  var returnFocus = null;
  var panel = overlay.querySelector(".abV5NotifPanel");
  function currentHousehold() {
    try { var p = new URLSearchParams(location.search); return p.get("household") || p.get("household_id") || ""; } catch (e) { return ""; }
  }
  var storeKey = "abV5NotifDismissed:" + currentHousehold();
  function loadDismissed() {
    try {
      var raw = localStorage.getItem(storeKey);
      var arr = raw ? JSON.parse(raw) : [];
      dismissed = {};
      (arr || []).forEach(function (k) { dismissed[k] = true; });
    } catch (e) { dismissed = {}; }
  }
  function saveDismissed() {
    try { localStorage.setItem(storeKey, JSON.stringify(Object.keys(dismissed))); } catch (e) {}
  }
  function visible() { return data.filter(function (n) { return !dismissed[n.key]; }); }
  function isOpen() { return !overlay.hidden; }
  function focusable(container) {
    return Array.prototype.slice.call(container.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (node) { return node.offsetParent !== null; });
  }
  function setBadge() {
    var n = visible().length;
    Array.prototype.forEach.call(badges, function (b) {
      if (n > 0) { b.textContent = n > 99 ? "99+" : String(n); b.hidden = false; }
      else { b.hidden = true; }
    });
  }
  function open(trigger) {
    if (!isOpen()) returnFocus = trigger || document.activeElement;
    overlay.hidden = false;
    overlay.setAttribute("aria-hidden", "false");
    document.body.classList.add("abV5SearchOpen");
    renderList();
    setTimeout(function () {
      var nodes = panel ? focusable(panel) : [];
      var target = nodes[0] || panel;
      if (target && target.focus) target.focus();
    }, 0);
  }
  function close() {
    overlay.hidden = true;
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("abV5SearchOpen");
    if (returnFocus && returnFocus.focus) returnFocus.focus();
    returnFocus = null;
  }
  function dismiss(key) { dismissed[key] = true; saveDismissed(); renderList(); setBadge(); renderBanner(); }
  function renderList() {
    listBox.textContent = "";
    var list = visible();
    if (!list.length) {
      var e = document.createElement("div");
      e.className = "abV5NotifEmpty";
      e.textContent = "새 알림이 없어요.";
      listBox.appendChild(e);
      return;
    }
    list.forEach(function (n) {
      var item = document.createElement("div");
      item.className = "abV5NotifItem lvl-" + (n.level || "info");
      var body = document.createElement("div");
      body.className = "abV5NotifItemBody";
      var a = document.createElement("a");
      a.href = n.href || "#";
      var b = document.createElement("b"); b.textContent = n.title || "";
      var s = document.createElement("span"); s.textContent = n.body || "";
      a.appendChild(b); a.appendChild(s);
      body.appendChild(a);
      var x = document.createElement("button");
      x.type = "button"; x.className = "abV5NotifDismiss"; x.setAttribute("aria-label", "이 알림 지우기"); x.textContent = "×";
      x.addEventListener("click", function (ev) { ev.preventDefault(); ev.stopPropagation(); dismiss(n.key); });
      item.appendChild(body); item.appendChild(x);
      listBox.appendChild(item);
    });
  }
  function renderBanner() {
    var existing = document.getElementById("abV5Banner");
    if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    if (location.pathname !== "/app") return;
    var list = visible();
    var top = null;
    for (var i = 0; i < list.length; i++) {
      if (list[i].banner && (list[i].level === "danger" || list[i].level === "warn")) { top = list[i]; break; }
    }
    if (!top) return;
    var bar = document.createElement("div");
    bar.id = "abV5Banner";
    bar.className = "abV5Banner lvl-" + top.level;
    var a = document.createElement("a"); a.href = top.href || "#";
    var b = document.createElement("b"); b.textContent = top.title || "";
    var s = document.createElement("span"); s.textContent = top.body || "";
    a.appendChild(b); a.appendChild(s);
    var x = document.createElement("button");
    x.type = "button"; x.className = "abV5BannerClose"; x.setAttribute("aria-label", "배너 닫기"); x.textContent = "×";
    x.addEventListener("click", function (ev) { ev.preventDefault(); dismiss(top.key); });
    bar.appendChild(a); bar.appendChild(x);
    document.body.appendChild(bar);
  }
  function load() {
    var url = "/u/api/notifications";
    var hh = currentHousehold();
    if (hh) url += "?household=" + encodeURIComponent(hh);
    fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (json) { data = (json && json.notifications) || []; setBadge(); renderBanner(); if (isOpen()) renderList(); })
      .catch(function () { data = []; setBadge(); });
  }
  document.addEventListener("click", function (ev) {
    var btn = ev.target && ev.target.closest && ev.target.closest("[data-abv5-notif-open]");
    if (!btn) return;
    ev.preventDefault();
    var focusTarget = btn.closest && btn.closest("#abGlobalActionDialog")
      ? document.querySelector('[data-ab-global-open="actions"]') || btn
      : btn;
    if (isOpen()) close(); else open(focusTarget);
  });
  overlay.addEventListener("click", function (ev) {
    var t = ev.target;
    if (t && t.closest && t.closest("[data-abv5-notif-close]")) close();
  });
  document.addEventListener("keydown", function (ev) {
    if (ev.key === "Escape" && isOpen()) { ev.preventDefault(); close(); }
    else if (ev.key === "Tab" && isOpen() && panel) {
      var nodes = focusable(panel);
      if (!nodes.length) { ev.preventDefault(); panel.focus(); return; }
      var first = nodes[0], last = nodes[nodes.length - 1];
      if (ev.shiftKey && document.activeElement === first) { ev.preventDefault(); last.focus(); }
      else if (!ev.shiftKey && document.activeElement === last) { ev.preventDefault(); first.focus(); }
    }
  });
  loadDismissed();
  load();
}

function accountbookNotifJsAsset() {
  if (!AB_ACCOUNTBOOK_NOTIF_JS_CACHE) {
    AB_ACCOUNTBOOK_NOTIF_JS_CACHE = `(${accountbookNotifClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_NOTIF_JS_CACHE;
}
