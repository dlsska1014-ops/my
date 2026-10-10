// @build:imports-start
import {
  AB_ACCOUNTBOOK_FAVROWS_JS_CACHE, AB_ACCOUNTBOOK_GOALS_JS_CACHE, AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE,
  ACCOUNTBOOK_V5_NOTIF_OVERLAY_HTML, ACCOUNTBOOK_V5_SEARCH_OVERLAY_HTML,
} from "../assets/asset-registry.js";
import {
  accountbookNotifClientMain, accountbookSearchClientMain,
} from "./nav-search-notif-mains.js";
// @build:imports-end
function accountbookGoalsClientMain() {
  var root = document.getElementById("goalsRoot");
  if (!root) return;
  var overallPct = document.getElementById("goalsOverallPct");
  var overallBar = document.getElementById("goalsOverallBar");
  var overallSub = document.getElementById("goalsOverallSub");
  var addForm = document.getElementById("goalAddForm");
  var toast = document.getElementById("goalToast");
  var toastMsg = document.getElementById("goalToastMsg");
  var toastUndo = document.getElementById("goalToastUndo");
  var state = { goals: [], total_saved: 0, total_target: 0, overall_progress: 0, can_write: false };
  var pending = null;
  // V22.9.37 감사 H1: 서버가 실제로 그린 가계부(내비 범위 표식)를 먼저 쓴다. 주소에 가계부가 없으면 첫 가계부에 목표가 저장됐다.
  function hh() { try { var scope = document.querySelector(".abNavScope[data-ab-hh]"); var marked = scope ? scope.getAttribute("data-ab-hh") : ""; if (marked) return marked; var p = new URLSearchParams(location.search); return p.get("household") || p.get("household_id") || ""; } catch (e) { return ""; } }
  function fmt(n) { try { return Number(n || 0).toLocaleString("ko-KR"); } catch (e) { return String(n || 0); } }
  function api(body, options) {
    return fetch("/u/api/goals", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, credentials: "same-origin", keepalive: !!(options && options.keepalive), body: JSON.stringify(Object.assign({ household: hh() }, body)) })
      .then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (res.ok) return data;
          data.status = res.status;
          return Promise.reject(data);
        });
      });
  }
  function failureMessage(err) {
    if (err && err.message) return String(err.message);
    if (err && err.status === 409) return "다른 목표 변경을 처리 중입니다. 잠시 후 다시 시도해 주세요.";
    return "목표 변경을 저장하지 못했습니다. 기존 목표를 다시 불러왔습니다.";
  }
  function showError(err) {
    if (!toast || !toastMsg) return;
    toastMsg.textContent = failureMessage(err);
    if (toastUndo) toastUndo.hidden = true;
    toast.hidden = false;
    if (!(err && err.error === "db_write_unknown")) setTimeout(function () { if (!pending) toast.hidden = true; }, 5000);
  }
  function statusLabel(s) { return s === "done" ? "달성" : s === "behind" ? "부족" : "순조"; }
  function setOverall() {
    if (overallPct) overallPct.textContent = state.overall_progress + "%";
    if (overallBar) overallBar.style.width = Math.min(100, state.overall_progress) + "%";
    if (overallSub) overallSub.textContent = fmt(state.total_saved) + "원 / " + fmt(state.total_target) + "원";
  }
  function applyPayload(p) {
    state.goals = (p && p.goals) || [];
    state.total_saved = (p && p.total_saved) || 0;
    state.total_target = (p && p.total_target) || 0;
    state.overall_progress = (p && p.overall_progress) || 0;
    state.can_write = !!(p && p.can_write);
    if (addForm) addForm.closest("section").hidden = !state.can_write;
  }
  function render() {
    setOverall();
    root.textContent = "";
    if (!state.goals.length) {
      var e = document.createElement("div");
      e.className = "card goalEmpty";
      e.textContent = state.can_write ? "아직 목표가 없어요. 위에서 첫 목표를 추가해 보세요." : "아직 등록된 목표가 없어요.";
      root.appendChild(e);
      return;
    }
    state.goals.forEach(function (g) {
      var card = document.createElement("div");
      card.className = "card goalCard";
      var head = document.createElement("div"); head.className = "goalHead";
      var em = document.createElement("span"); em.className = "goalEmoji"; em.textContent = g.emoji || "🎯";
      var titleWrap = document.createElement("div");
      var b = document.createElement("b"); b.textContent = g.name;
      var small = document.createElement("small");
      var sub = [];
      if (g.deadline) sub.push(g.deadline);
      if (g.monthsLeft != null) sub.push("남은 " + g.monthsLeft + "개월");
      small.textContent = sub.join(" · ") || "마감월 없음";
      titleWrap.appendChild(b); titleWrap.appendChild(small);
      var st = document.createElement("span"); st.className = "goalStatus st-" + g.status; st.textContent = statusLabel(g.status);
      head.appendChild(em); head.appendChild(titleWrap); head.appendChild(st);
      var bar = document.createElement("div"); bar.className = "goalBar";
      var barIn = document.createElement("span"); barIn.style.width = Math.min(100, g.progress) + "%"; bar.appendChild(barIn);
      var meta = document.createElement("div"); meta.className = "goalMeta";
      var m1 = document.createElement("span"); m1.innerHTML = "<b>" + fmt(g.saved) + "원</b> / " + fmt(g.target) + "원 (" + g.progress + "%)";
      var m2 = document.createElement("span");
      m2.textContent = "월 " + fmt(g.monthly) + "원" + (g.neededMonthly != null ? " · 필요 " + fmt(g.neededMonthly) + "원" : "");
      meta.appendChild(m1); meta.appendChild(m2);
      var actions = document.createElement("div"); actions.className = "goalActions";
      var fund = document.createElement("button"); fund.type = "button"; fund.className = "fund"; fund.textContent = "+" + fmt(g.monthly || 0) + "원 납입";
      fund.disabled = !(g.monthly > 0);
      fund.addEventListener("click", function () { doFund(g.id); });
      var del = document.createElement("button"); del.type = "button"; del.className = "del"; del.textContent = "삭제";
      del.addEventListener("click", function () { doDelete(g.id); });
      actions.appendChild(fund); actions.appendChild(del);
      card.appendChild(head); card.appendChild(bar); card.appendChild(meta);
      if (state.can_write) card.appendChild(actions);
      root.appendChild(card);
    });
  }
  function recomputeTotals() {
    state.total_saved = state.goals.reduce(function (a, g) { return a + Number(g.saved || 0); }, 0);
    state.total_target = state.goals.reduce(function (a, g) { return a + Number(g.target || 0); }, 0);
    state.overall_progress = state.total_target > 0 ? Math.min(100, Math.round(state.total_saved / state.total_target * 100)) : 0;
    state.goals.forEach(function (g) {
      g.progress = g.target > 0 ? Math.min(100, Math.round(g.saved / g.target * 100)) : 0;
      if (g.target > 0 && g.saved >= g.target) g.status = "done";
    });
  }
  function commitPending(options) {
    if (!pending) return;
    clearTimeout(pending.timer);
    var body = pending.commit;
    pending = null;
    hideToast();
    api(body, options).then(function (p) { applyPayload(p); render(); }).catch(function (err) { if (!(options && options.keepalive)) { showError(err); load(); } });
  }
  function showToast(msg, undoFn) {
    toastMsg.textContent = msg;
    if (toastUndo) toastUndo.hidden = false;
    toast.hidden = false;
    pending.undo = undoFn;
    pending.timer = setTimeout(commitPending, 5000);
  }
  function hideToast() { toast.hidden = true; }
  function startPending(commitBody, optimistic, undoLocal, msg) {
    if (pending) commitPending();
    pending = { commit: commitBody };
    optimistic();
    recomputeTotals();
    render();
    showToast(msg, undoLocal);
  }
  function doFund(id) {
    var g = state.goals.filter(function (x) { return x.id === id; })[0];
    if (!g || !(g.monthly > 0)) return;
    var amount = g.monthly;
    startPending({ action: "fund", id: id, amount: amount },
      function () { g.saved = Math.max(0, g.saved + amount); },
      function () { g.saved = Math.max(0, g.saved - amount); recomputeTotals(); render(); },
      g.name + "에 " + fmt(amount) + "원 납입했어요");
  }
  function doDelete(id) {
    var idx = -1;
    for (var i = 0; i < state.goals.length; i++) { if (state.goals[i].id === id) { idx = i; break; } }
    if (idx < 0) return;
    var removed = state.goals[idx];
    startPending({ action: "delete", id: id },
      function () { state.goals.splice(idx, 1); },
      function () { state.goals.splice(idx, 0, removed); recomputeTotals(); render(); },
      removed.name + " 목표를 삭제했어요");
  }
  if (toastUndo) toastUndo.addEventListener("click", function () {
    if (!pending) return;
    clearTimeout(pending.timer);
    var undo = pending.undo;
    pending = null;
    hideToast();
    if (undo) undo();
  });
  if (addForm) addForm.addEventListener("submit", function (ev) {
    ev.preventDefault();
    if (pending) commitPending();
    var f = addForm;
    var body = {
      action: "create",
      name: f.name.value,
      emoji: f.emoji.value,
      target: String(f.target.value || "").replace(/[^0-9]/g, ""),
      monthly: String(f.monthly.value || "").replace(/[^0-9]/g, ""),
      deadline: f.deadline.value,
    };
    if (!String(body.name || "").trim()) { f.name.focus(); return; }
    if (!(Number(body.target) > 0)) { f.target.focus(); return; }
    api(body).then(function (p) { applyPayload(p); render(); f.name.value = ""; f.target.value = ""; f.monthly.value = ""; f.deadline.value = ""; f.emoji.value = "🎯"; }).catch(function (err) { if (err && err.error === "db_write_unknown") { load().then(function () { showError(err); }); } else { showError(err); } });
  });
  function load() {
    var url = "/u/api/goals";
    var h = hh();
    if (h) url += "?household=" + encodeURIComponent(h);
    return fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (p) { applyPayload(p); render(); })
      .catch(function (err) { root.textContent = ""; var e = document.createElement("div"); e.className = "card goalEmpty"; e.textContent = err === 401 ? "로그인이 필요해요." : "목표를 불러오지 못했어요."; root.appendChild(e); });
  }
  window.addEventListener("pagehide", function () { commitPending({ keepalive: true }); });
  load();
}
function accountbookGoalsJsAsset() {
  if (!AB_ACCOUNTBOOK_GOALS_JS_CACHE) {
    AB_ACCOUNTBOOK_GOALS_JS_CACHE = `(${accountbookGoalsClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_GOALS_JS_CACHE;
}

// V22.8.33 거래목록 행 즐겨찾기(★, §3.2): 피드 렌더러와 분리된 에셋으로 [data-fav-key] 행을 강화.
// 콘텐츠 기반 키(date|type|amount|memo)로 검색 오버레이와 일관.
function accountbookFavRowsClientMain() {
  // V22.9.37 감사 U3: 서버가 실제로 그린 가계부(내비 범위 표식)를 먼저 쓴다.
  function hh() { try { var scope = document.querySelector(".abNavScope[data-ab-hh]"); var marked = scope ? scope.getAttribute("data-ab-hh") : ""; if (marked) return marked; var p = new URLSearchParams(location.search); return p.get("household") || p.get("household_id") || ""; } catch (e) { return ""; } }
  var favSet = Object.create(null);
  var loaded = false;
  function apiUrl() { var u = "/u/api/favorites"; var h = hh(); if (h) u += "?household=" + encodeURIComponent(h); return u; }
  function markAll() {
    var rows = document.querySelectorAll("[data-fav-key]");
    Array.prototype.forEach.call(rows, function (row) {
      var key = row.getAttribute("data-fav-key");
      var star = row.querySelector(".abV5RowFav");
      if (star) { var on = !!favSet[key]; star.classList.toggle("isFav", on); star.setAttribute("aria-pressed", on ? "true" : "false"); }
    });
  }
  function doToggle(row, key, star) {
    var on = !favSet[key];
    favSet[key] = on;
    star.classList.toggle("isFav", on);
    star.setAttribute("aria-pressed", on ? "true" : "false");
    var tx; try { tx = JSON.parse(row.getAttribute("data-fav-tx") || "{}"); } catch (e) { tx = { id: key }; }
    var body = on ? { household: hh(), id: key, tx: tx } : { household: hh(), id: key, remove: true };
    fetch("/u/api/favorites", { method: "POST", headers: { "content-type": "application/json", accept: "application/json" }, credentials: "same-origin", body: JSON.stringify(body) })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (json) { favSet = {}; ((json && json.favorites) || []).forEach(function (f) { favSet[f.id] = true; }); markAll(); })
      .catch(function () { favSet[key] = !on; star.classList.toggle("isFav", !on); star.setAttribute("aria-pressed", !on ? "true" : "false"); });
  }
  function enhance() {
    var rows = document.querySelectorAll("[data-fav-key]");
    Array.prototype.forEach.call(rows, function (row) {
      if (row.__favDone) return;
      row.__favDone = true;
      var key = row.getAttribute("data-fav-key");
      var star = document.createElement("span");
      star.className = "abV5RowFav" + (favSet[key] ? " isFav" : "");
      star.setAttribute("role", "button");
      star.setAttribute("tabindex", "0");
      star.setAttribute("aria-label", "즐겨찾기");
      star.setAttribute("aria-pressed", favSet[key] ? "true" : "false");
      star.textContent = "★";
      function toggle(ev) { ev.preventDefault(); ev.stopPropagation(); doToggle(row, key, star); }
      star.addEventListener("click", toggle);
      star.addEventListener("keydown", function (ev) { if (ev.key === "Enter" || ev.key === " ") toggle(ev); });
      row.appendChild(star);
    });
  }
  function load() {
    // V22.9.37 감사 U12: 로그아웃 화면(사용자 내비 없음)에서는 부르지 않는다 — 401 과 콘솔 오류만 남겼다.
    if (!document.querySelector('.abNavScope[data-nav-scope="user"]')) { loaded = true; enhance(); return; }
    fetch(apiUrl(), { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function (res) { return res.ok ? res.json() : Promise.reject(res.status); })
      .then(function (json) { favSet = {}; ((json && json.favorites) || []).forEach(function (f) { favSet[f.id] = true; }); loaded = true; enhance(); markAll(); })
      .catch(function () { loaded = true; enhance(); });
  }
  var target = document.getElementById("txList") || document.body;
  if (window.MutationObserver && target) {
    var obs = new MutationObserver(function () { enhance(); markAll(); });
    obs.observe(target, { childList: true, subtree: true });
  }
  load();
  setTimeout(function () { enhance(); markAll(); }, 500);
}
function accountbookFavRowsJsAsset() {
  if (!AB_ACCOUNTBOOK_FAVROWS_JS_CACHE) {
    AB_ACCOUNTBOOK_FAVROWS_JS_CACHE = `(${accountbookFavRowsClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_FAVROWS_JS_CACHE;
}

function accountbookSidebarDashboardClientMain() {
  function fmt(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  function addMonth(ym, delta) {
    var p = String(ym || "").split("-");
    var d = new Date(Number(p[0]), Number(p[1] || 1) - 1 + delta, 1);
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0");
  }
  function qs(month, householdId, extra) {
    var out = "/app?month=" + encodeURIComponent(month);
    if (householdId) out += "&household_id=" + encodeURIComponent(householdId);
    return out + (extra || "");
  }
  function renderCalendar(root) {
    var month = root.getAttribute("data-month") || "";
    var householdId = root.getAttribute("data-household-id") || "";
    var p = month.split("-");
    var year = Number(p[0]), mon = Number(p[1]);
    if (!year || !mon) return;
    var active = Object.create(null);
    String(root.getAttribute("data-active-days") || "").split(",").forEach(function (v) { var d = Number(v); if (d) active[d] = true; });
    var firstDow = new Date(Date.UTC(year, mon - 1, 1)).getUTCDay();
    var days = new Date(Date.UTC(year, mon, 0)).getUTCDate();
    var today = new Date();
    var todayKey = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    var html = '<div class="abNavCalHead"><a href="' + qs(addMonth(month, -1), householdId) + '" aria-label="이전 달">‹</a><b>' + year + '년 ' + mon + '월</b><a href="' + qs(addMonth(month, 1), householdId) + '" aria-label="다음 달">›</a></div>';
    html += '<div class="abNavCalDows" aria-hidden="true"><span>일</span><span>월</span><span>화</span><span>수</span><span>목</span><span>금</span><span>토</span></div><div class="abNavCalGrid" role="grid" aria-label="' + year + '년 ' + mon + '월 달력">';
    for (var b = 0; b < firstDow; b++) html += '<span class="abNavCalBlank" role="presentation"></span>';
    // V22.8.90 지시서 4.2: 격자는 탭 정지점 하나다. 42칸을 각각 링크로 두면 그것만으로
    // 정지점이 마흔 개 넘게 생기고, 사이드바를 지나 본문에 닿기까지 탭을 그만큼 눌러야 한다.
    // 한 칸만 tabindex=0 으로 두고 나머지는 -1 로 내린 뒤 방향키로 옮긴다(roving tabindex).
    var focusDay = todayKey.slice(0, 7) === month ? Number(todayKey.slice(8, 10)) : 1;
    for (var day = 1; day <= days; day++) {
      var date = month + "-" + String(day).padStart(2, "0");
      var cls = "abNavCalDay" + (active[day] ? " hasRecord" : "") + (date === todayKey ? " isToday" : "");
      var href = qs(month, householdId, "&view=calendar&date=" + encodeURIComponent(date) + "&feed=all#feed");
      html += '<a class="' + cls + '" role="gridcell" tabindex="' + (day === focusDay ? "0" : "-1") + '" href="' + href + '" data-ab-day="' + date + '" data-ab-household-id="' + householdId + '" aria-label="' + mon + '월 ' + day + '일' + (active[day] ? ', 기록 있음' : ', 기록 없음') + '"><span>' + day + '</span>' + (active[day] ? '<i aria-hidden="true"></i>' : '') + '</a>';
    }
    html += '</div><a class="abNavCalToday" href="' + qs(todayKey.slice(0, 7), householdId) + '">오늘이 있는 달로</a>';
    root.innerHTML = html;
    bindCalendarRoving(root);
  }
  // 방향키로 날짜를 옮긴다. 격자를 벗어나는 이동은 하지 않는다 — 마지막 칸에서 오른쪽을
  // 누르면 다음 달로 넘어가는 대신 그 자리에 머무는 편이 예측 가능하다.
  function bindCalendarRoving(root) {
    var grid = root.querySelector('[role="grid"]');
    if (!grid) return;
    grid.addEventListener("keydown", function (event) {
      var step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1
        : event.key === "ArrowDown" ? 7 : event.key === "ArrowUp" ? -7 : 0;
      var cells = Array.prototype.slice.call(grid.querySelectorAll('[role="gridcell"]'));
      if (!cells.length) return;
      var index = cells.indexOf(event.target);
      if (index < 0) return;
      var next = index;
      if (step) next = index + step;
      else if (event.key === "Home") next = 0;
      else if (event.key === "End") next = cells.length - 1;
      else return;
      if (next < 0 || next >= cells.length) return;
      event.preventDefault();
      cells[index].setAttribute("tabindex", "-1");
      cells[next].setAttribute("tabindex", "0");
      cells[next].focus();
    });
  }
  function renderChallengeDays(root) {
    var states = { s: ["success", "✓", "무지출 성공"], x: ["spent", "−", "지출 있음"], t: ["today", "●", "오늘 진행 중"], f: ["future", "", "예정"] };
    var slots = String(root.getAttribute("data-ab-challenge-slots") || "").split(",").filter(Boolean);
    root.setAttribute("role", "list");
    root.setAttribute("aria-label", "날짜별 챌린지 진행 상태");
    root.innerHTML = slots.map(function(slot) {
      var parts = slot.split(":");
      var full = root.hasAttribute("data-ab-challenge-full");
      var state = states[parts[full ? 2 : 1]] || states.f;
      if (full) return '<li class="is-' + state[0] + '" aria-label="' + parts[0] + '일, ' + state[2] + '"><span>' + (parts[1] || "") + '</span><b>' + parts[0] + '</b></li>';
      return '<span class="is-' + state[0] + '" role="listitem" aria-label="' + parts[0] + '일, ' + state[2] + '"><i>' + parts[0] + '</i><b aria-hidden="true">' + state[1] + '</b></span>';
    }).join("");
  }
  document.querySelectorAll("[data-ab-nav-calendar]").forEach(renderCalendar);
  document.querySelectorAll("[data-ab-challenge-slots]").forEach(renderChallengeDays);
}

function accountbookQuickInputClientMain() {
  var overlay = null;
  var panel = null;
  var body = null;
  var section = null;
  var returnFocus = null;
  var lockedScrollY = 0;
  var scrollLocked = false;
  function validDate(value) { return /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(String(value || "")); }
  // 모바일 사파리·인앱 브라우저는 body의 overflow:hidden만으로 스크롤이 잠기지 않는다.
  // 시트를 밀면 뒤 배경이 대신 올라가므로 스크롤 위치를 고정했다가 닫을 때 되돌린다.
  function isMobileViewport() { return !window.matchMedia || window.matchMedia("(max-width:899px)").matches; }
  function lockScroll() {
    if (scrollLocked || !isMobileViewport()) return;
    lockedScrollY = window.scrollY || window.pageYOffset || 0;
    var style = document.body.style;
    style.position = "fixed";
    style.top = -lockedScrollY + "px";
    style.left = "0";
    style.right = "0";
    style.width = "100%";
    scrollLocked = true;
  }
  function unlockScroll() {
    if (!scrollLocked) return;
    var style = document.body.style;
    style.position = "";
    style.top = "";
    style.left = "";
    style.right = "";
    style.width = "";
    scrollLocked = false;
    window.scrollTo(0, lockedScrollY);
    lockedScrollY = 0;
  }
  function currentContext() {
    var params = new URLSearchParams(location.search);
    var month = params.get("month") || new Date(Date.now() + 32400000).toISOString().slice(0, 7);
    // V22.9.37 감사 U3: 서버가 실제로 그린 가계부(내비 범위 표식)를 먼저 쓴다.
    var scope = document.querySelector(".abNavScope[data-ab-hh]");
    var household = (scope && scope.getAttribute("data-ab-hh")) || params.get("household_id") || "";
    return { month: month, household: household };
  }
  function fallbackUrl(date) {
    var context = currentContext();
    var month = validDate(date) ? String(date).slice(0, 7) : context.month;
    var out = "/app?month=" + encodeURIComponent(month);
    if (context.household) out += "&household_id=" + encodeURIComponent(context.household);
    out += "&quick=1";
    if (validDate(date)) out += "&date=" + encodeURIComponent(date);
    return out + "#quick";
  }
  function returnUrlForDate(date) {
    var context = currentContext();
    var month = validDate(date) ? String(date).slice(0, 7) : context.month;
    var out = "/app?month=" + encodeURIComponent(month);
    if (context.household) out += "&household_id=" + encodeURIComponent(context.household);
    if (validDate(date)) out += "&view=calendar&date=" + encodeURIComponent(date) + "&feed=all";
    return out + "#calendar";
  }
  function findSection() { return document.querySelector('section#add.panel,section#add'); }
  function syncReturnTarget(date) {
    if (!section || !validDate(date)) return;
    var field = section.querySelector('input[name="return_to"]');
    if (field) field.value = returnUrlForDate(date);
  }
  function ensure() {
    if (overlay) return overlay;
    section = findSection();
    if (!section) return null;
    overlay = document.createElement("div");
    overlay.className = "abQuickInputOverlay";
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="abQuickInputScrim" data-ab-quick-close></div><section class="abQuickInputPanel" role="dialog" aria-modal="true" aria-labelledby="abQuickInputTitle" aria-describedby="abQuickInputDescription" tabindex="-1"><header class="abQuickInputHead"><div><b id="abQuickInputTitle">빠른 입력</b><small id="abQuickInputDescription">현재 가계부에 지출 또는 수입을 기록합니다.</small></div><button type="button" class="abQuickInputClose" data-ab-quick-close aria-label="빠른 입력 닫기">✕</button></header><div class="abQuickInputBody" data-ab-quick-body></div></section>';
    document.body.appendChild(overlay);
    panel = overlay.querySelector(".abQuickInputPanel");
    body = overlay.querySelector("[data-ab-quick-body]");
    section.classList.add("abQuickInputContent");
    var originalTitle = Array.prototype.find.call(section.children || [], function(child) { return child && child.tagName === "H2"; });
    if (originalTitle) { originalTitle.classList.add("abQuickInputOriginalTitle"); originalTitle.setAttribute("aria-hidden", "true"); }
    body.appendChild(section);
    var form = section.querySelector("form");
    if (form) form.addEventListener("submit", function() {
      var input = section.querySelector('input[name="transaction_date"],#txDate');
      if (input) syncReturnTarget(input.value);
      rememberDraft(form);
    });
    // 새로고침이나 화면 이탈은 경고 없이 일어난다. 적는 동안에도 남겨 둬야
    // 돌아왔을 때 이어서 쓸 수 있다.
    if (form) {
      var draftTimer = null;
      form.addEventListener("input", function() {
        if (draftTimer) clearTimeout(draftTimer);
        draftTimer = setTimeout(function() { rememberDraft(form); }, 400);
      });
    }
    overlay.addEventListener("click", function(event) {
      if (event.target && event.target.closest && event.target.closest("[data-ab-quick-close]")) close();
    });
    return overlay;
  }
  // 저장에 실패하면 지금까지는 적은 내용이 전부 사라져 처음부터 다시 써야 했다.
  // 주소로 돌려보내면 메모가 주소창과 방문 기록에 남으므로 브라우저 안에만 둔다.
  var DRAFT_KEY = "abQuickInputDraft";
  var DRAFT_FIELDS = ["amount", "memo", "category", "payment_method", "transaction_date", "type", "user_id"];
  function draftStore() {
    try { return window.sessionStorage; } catch (_error) { return null; }
  }
  var DRAFT_MAX_AGE_MS = 30 * 60 * 1000;
  function rememberDraft(form) {
    var store = draftStore();
    if (!store || !form) return;
    var draft = { at: Date.now() };
    var typed = false;
    DRAFT_FIELDS.forEach(function (name) {
      var field = form.querySelector('[name="' + name + '"]:checked') || form.querySelector('[name="' + name + '"]');
      if (field && field.value) { draft[name] = String(field.value).slice(0, 200); }
      if (field && field.value && (name === "amount" || name === "memo")) typed = true;
    });
    // 날짜·유형은 기본값이라 그것만으로는 "적던 중"이 아니다.
    if (!typed) { forgetDraft(); return; }
    try { store.setItem(DRAFT_KEY, JSON.stringify(draft)); } catch (_error) {}
  }
  function forgetDraft() {
    var store = draftStore();
    if (store) { try { store.removeItem(DRAFT_KEY); } catch (_error) {} }
  }
  function restoreDraft() {
    var store = draftStore();
    if (!store || !section) return false;
    var raw = "";
    try { raw = store.getItem(DRAFT_KEY) || ""; } catch (_error) { return false; }
    if (!raw) return false;
    forgetDraft();
    var draft = null;
    try { draft = JSON.parse(raw); } catch (_error) { return false; }
    if (!draft || typeof draft !== "object") return false;
    // 오래된 초안이 되살아나면 지난번에 그만둔 입력이 엉뚱하게 끼어든다.
    if (draft.at && Date.now() - Number(draft.at) > DRAFT_MAX_AGE_MS) return false;
    var restored = false;
    DRAFT_FIELDS.forEach(function (name) {
      var value = draft[name];
      if (!value) return;
      var radio = section.querySelector('[name="' + name + '"][value="' + String(value).replace(/"/g, "") + '"]');
      if (radio && (radio.type === "radio" || radio.type === "checkbox")) { radio.checked = true; restored = true; return; }
      var field = section.querySelector('[name="' + name + '"]');
      if (!field || field.type === "radio" || field.type === "checkbox") return;
      // 이미 적혀 있는 칸은 덮지 않는다.
      if (field.value && name !== "transaction_date") return;
      field.value = value;
      field.dispatchEvent(new Event("change", { bubbles: true }));
      restored = true;
    });
    return restored;
  }
  function setDate(date) {
    var input = section && section.querySelector('input[name="transaction_date"],#txDate');
    if (input && validDate(date)) {
      input.value = date;
      input.dispatchEvent(new Event("change", { bubbles: true }));
      syncReturnTarget(date);
    }
    var description = overlay && overlay.querySelector("#abQuickInputDescription");
    if (description) description.textContent = validDate(date) ? date + " 기록을 현재 가계부에 추가합니다." : "현재 가계부에 지출 또는 수입을 기록합니다.";
  }
  function open(date, trigger) {
    var node = ensure();
    if (!node) { location.href = fallbackUrl(date); return; }
    returnFocus = trigger || document.activeElement;
    var dateInput = section.querySelector('input[name="transaction_date"],#txDate');
    var selectedDate = validDate(date) ? date : (dateInput ? dateInput.value : "");
    setDate(selectedDate);
    node.removeAttribute("hidden");
    node.setAttribute("aria-hidden", "false");
    document.body.classList.add("abQuickInputOpen");
    lockScroll();
    var target = section.querySelector("#smartInput") || section.querySelector("#amountInput") || section.querySelector("input:not([type=hidden]),select,button");
    if (target && target.focus) { try { target.focus(); } catch (_error) {} }
  }
  function close() {
    if (!overlay || overlay.hasAttribute("hidden")) return;
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("abQuickInputOpen");
    unlockScroll();
    if (returnFocus && returnFocus.focus) { try { returnFocus.focus(); } catch (_error) {} }
    returnFocus = null;
  }
  function requestedDate(trigger) {
    var direct = trigger && trigger.getAttribute && trigger.getAttribute("data-ab-quick-date");
    if (validDate(direct)) return direct;
    var params = new URLSearchParams(location.search);
    var queryDate = params.get("date") || "";
    return validDate(queryDate) ? queryDate : "";
  }
  window.openAbQuickInput = function(date, trigger) { open(date, trigger); };
  window.closeAbQuickInput = close;
  document.addEventListener("click", function(event) {
    var trigger = event.target && event.target.closest && event.target.closest('[data-ab-quick-open],a[href^="/app?"][href$="#add"],a[href^="/app?"][href$="#quick"]');
    if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(requestedDate(trigger), trigger);
  });
  document.addEventListener("keydown", function(event) {
    if (!overlay || overlay.hasAttribute("hidden")) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || !panel) return;
    var focusable = Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function(el) { return !el.hasAttribute("hidden") && el.offsetParent !== null; });
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  function autoOpen() {
    var params = new URLSearchParams(location.search);
    var hash = String(location.hash || "");
    // 저장에 성공했으면 남은 초안은 버린다. 그 밖에는 되살릴 기회를 준다 —
    // 저장 실패로 돌아온 경우와, 적다가 새로고침한 경우가 모두 여기에 해당한다.
    if (params.get("msg")) { forgetDraft(); return; }
    if (location.pathname !== "/app" || !(params.get("quick") === "1" || hash === "#add" || hash === "#quick")) return;
    open(requestedDate(null), null);
    if (restoreDraft()) {
      var dateField = section && section.querySelector('input[name="transaction_date"],#txDate');
      setDate(dateField ? dateField.value : "");
    }
    if (params.get("quick") === "1" && window.history && window.history.replaceState) {
      params.delete("quick");
      var query = params.toString();
      window.history.replaceState({}, "", location.pathname + (query ? "?" + query : "") + location.hash);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoOpen, { once: true });
  else autoOpen();
}

function accountbookActivityRailClientMain() {
  "use strict";
  if (String(location.pathname || "") !== "/app") return;
  var transactionMode = new URLSearchParams(location.search).get("tab") === "transactions";
  var desktop = typeof window.matchMedia === "function" ? window.matchMedia("(min-width:1320px)") : null;
  var rail = null;
  var payload = null;
  var loading = false;
  var loaded = false;
  var filter = "all";
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function(char) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char];
    });
  }
  function fmt(value) { return Number(value || 0).toLocaleString("ko-KR"); }
  function context() {
    var params = new URLSearchParams(location.search);
    // V22.9.37 감사 H1: 활동 레일도 서버가 실제로 그린 가계부(내비 범위 표식)를 먼저 쓴다.
    var scope = document.querySelector(".abNavScope[data-ab-hh]");
    return { month: params.get("month") || new Date(Date.now() + 32400000).toISOString().slice(0, 7), household: (scope && scope.getAttribute("data-ab-hh")) || params.get("household_id") || "" };
  }
  function endpoint() {
    var ctx = context();
    return "/u/api/recent-transactions?month=" + encodeURIComponent(ctx.month) + (ctx.household ? "&household_id=" + encodeURIComponent(ctx.household) : "");
  }
  function recordsHref() {
    var ctx = context();
    return "/app?month=" + encodeURIComponent(ctx.month) + (ctx.household ? "&household_id=" + encodeURIComponent(ctx.household) : "") + "&tab=transactions&feed=all#feed";
  }
  function quickHref() {
    var ctx = context();
    return "/app?month=" + encodeURIComponent(ctx.month) + (ctx.household ? "&household_id=" + encodeURIComponent(ctx.household) : "") + "&quick=1#quick";
  }
  function ensure() {
    if (rail) return rail;
    rail = document.createElement("aside");
    rail.className = "abActivityRail";
    rail.setAttribute("data-ab-activity-rail", "");
    rail.setAttribute("aria-label", "최근 사용 내역");
    if (transactionMode) {
      rail.classList.add("abTransactionRail");
      rail.setAttribute("aria-label", "거래 검색 결과 요약");
      var head = document.querySelector(".txTabHead");
      var data = head ? head.dataset : {};
      rail.innerHTML = '<header class="abActivityHead"><div><span>현재 검색 결과</span><h2>거래 요약</h2></div></header><div class="abTransactionSummary"><span>조건에 맞는 기록</span><b>' + fmt(data.count) + '건</b><dl><div><dt>수입</dt><dd class="income">+' + fmt(data.income) + '원</dd></div><div><dt>지출</dt><dd class="expense">−' + fmt(data.expense) + '원</dd></div></dl></div><div class="abTransactionConditions"><h3>적용한 조건</h3><p data-ab-transaction-conditions></p></div><div class="abTransactionTools"><h3>기록 정리</h3><nav aria-label="거래 정리 필터"></nav></div><p class="abTransactionHint">거래를 누르면 상세 내용을 확인할 수 있습니다. 수정·삭제는 상세 화면에서 선택하세요.</p><a class="abActivityAdd" data-ab-quick-open href="' + quickHref() + '"><b>＋</b><span>거래 추가하기</span></a>';
      var conditionForm = document.querySelector(".txFilterMore form");
      var conditions = [];
      if (conditionForm) ["q", "date", "category", "payment_method", "type", "quality"].forEach(function(name) {
        var field = conditionForm.querySelector('[name="' + name + '"]');
        if (!field || !field.value || field.value === "all") return;
        var labels = { q: "내용", date: "날짜", category: "분류", payment_method: "결제수단", type: "구분", quality: "정리 상태" };
        var value = field.tagName === "SELECT" ? field.options[field.selectedIndex].textContent : field.value;
        conditions.push(labels[name] + ": " + value);
      });
      rail.querySelector("[data-ab-transaction-conditions]").textContent = conditions.length ? conditions.join("\n") : "선택한 달의 전체 기록입니다.";
      document.querySelectorAll(".txChipBar a").forEach(function(link) { rail.querySelector(".abTransactionTools nav").appendChild(link.cloneNode(true)); });
      var pager = document.querySelector(".txPager");
      if (pager) rail.querySelector(".abTransactionSummary").appendChild(pager.cloneNode(true));
      document.body.appendChild(rail);
      return rail;
    }
    rail.innerHTML = '<header class="abActivityHead"><div><span>이번 달</span><h2>사용 내역</h2></div><a data-ab-activity-all href="' + recordsHref() + '">전체 보기</a></header>' +
      '<div class="abActivityTabs" role="group" aria-label="사용 내역 기간"><button type="button" data-ab-activity-filter="today">오늘</button><button type="button" data-ab-activity-filter="week">이번 주</button><button type="button" data-ab-activity-filter="all" class="active" aria-pressed="true">전체</button></div>' +
      '<a class="abActivityAdd" data-ab-quick-open href="' + quickHref() + '"><b>＋</b><span>거래 추가하기</span></a>' +
      '<div class="abActivityList" data-ab-activity-list><div class="abActivityLoading"><i></i><span>최근 기록을 불러오는 중입니다.</span></div></div>' +
      '<footer class="abActivitySummary" data-ab-activity-summary hidden><div><span>현재 목록 수입</span><b data-ab-activity-income>0원</b></div><div><span>현재 목록 지출</span><b data-ab-activity-expense>0원</b></div><p><span>현재 목록 잔액</span><strong data-ab-activity-balance>0원</strong></p></footer>';
    document.body.appendChild(rail);
    rail.addEventListener("click", function(event) {
      var button = event.target && event.target.closest && event.target.closest("[data-ab-activity-filter]");
      if (!button) return;
      filter = button.getAttribute("data-ab-activity-filter") || "all";
      rail.querySelectorAll("[data-ab-activity-filter]").forEach(function(item) {
        var active = item === button;
        item.classList.toggle("active", active);
        item.setAttribute("aria-pressed", active ? "true" : "false");
      });
      render();
    });
    return rail;
  }
  function dateLabel(date) {
    if (!payload) return date;
    if (date === payload.today) return "오늘";
    var today = new Date(payload.today + "T00:00:00");
    today.setDate(today.getDate() - 1);
    var yesterday = today.getFullYear() + "-" + String(today.getMonth() + 1).padStart(2, "0") + "-" + String(today.getDate()).padStart(2, "0");
    if (date === yesterday) return "어제";
    var parts = String(date || "").split("-");
    return parts.length === 3 ? Number(parts[1]) + "월 " + Number(parts[2]) + "일" : date;
  }
  function iconKind(row) {
    var value = String((row && row.category) || "").toLowerCase();
    if (row && row.type === "income") return "income";
    if (/카페|커피|간식|디저트/.test(value)) return "cafe";
    if (/식|마트|외식|음식|배달/.test(value)) return "food";
    if (/교통|택시|주유|버스|지하철|자동차/.test(value)) return "transport";
    if (/의료|병원|약|건강/.test(value)) return "medical";
    if (/쇼핑|생활|의류|뷰티/.test(value)) return "shopping";
    if (/주거|월세|관리비|공과금/.test(value)) return "housing";
    if (/통신|보험|구독|정기/.test(value)) return "subscription";
    if (/교육|학원|도서|육아/.test(value)) return "education";
    if (/여행|여가|문화|취미/.test(value)) return "leisure";
    return "receipt";
  }
  function iconSvg(kind) {
    var paths = {
      income: '<path d="M4 7.5h16v10H4z"/><path d="M4 10.5h16M8 14h.01M16 14h.01"/>',
      cafe: '<path d="M5 7h11v8a4 4 0 0 1-4 4H9a4 4 0 0 1-4-4z"/><path d="M16 9h1.5a2.5 2.5 0 0 1 0 5H16M8 4v1M12 4v1"/>',
      food: '<path d="M7 3v7M4 3v4a3 3 0 0 0 6 0V3M7 10v11M16 3v18M16 3c3 2 4 5 4 8h-4"/>',
      transport: '<path d="M5 16h14l-1-7H6z"/><path d="m7 9 1.5-4h7L17 9M7 16v2M17 16v2M8 13h.01M16 13h.01"/>',
      medical: '<path d="M9 4h6v5h5v6h-5v5H9v-5H4V9h5z"/>',
      shopping: '<path d="M5 8h14l-1 12H6z"/><path d="M9 9V6a3 3 0 0 1 6 0v3"/>',
      housing: '<path d="m3 11 9-7 9 7"/><path d="M5 10v10h14V10M9 20v-6h6v6"/>',
      subscription: '<path d="M20 7h-5V2M4 17h5v5"/><path d="M18.5 9A7 7 0 0 0 6 5.5L4 7M5.5 15A7 7 0 0 0 18 18.5l2-1.5"/>',
      education: '<path d="M4 5.5A3.5 3.5 0 0 1 7.5 2H12v17H7.5A3.5 3.5 0 0 0 4 22z"/><path d="M20 5.5A3.5 3.5 0 0 0 16.5 2H12v17h4.5A3.5 3.5 0 0 1 20 22z"/>',
      leisure: '<path d="m3 11 18-7-7 18-2-8z"/><path d="m12 14-4 4"/>',
      receipt: '<path d="M6 3h12v18l-3-2-3 2-3-2-3 2z"/><path d="M9 8h6M9 12h6M9 16h4"/>'
    };
    return '<svg viewBox="0 0 24 24" focusable="false" aria-hidden="true">' + (paths[kind] || paths.receipt) + '</svg>';
  }
  function visibleRows() {
    var rows = payload && Array.isArray(payload.rows) ? payload.rows : [];
    if (filter === "today") return rows.filter(function(row) { return row.transaction_date === payload.today; });
    if (filter === "week") return rows.filter(function(row) { return row.transaction_date >= payload.week_start && row.transaction_date <= payload.today; });
    return rows;
  }
  function render() {
    if (!rail || !payload) return;
    var rows = visibleRows();
    var list = rail.querySelector("[data-ab-activity-list]");
    var summary = rail.querySelector("[data-ab-activity-summary]");
    if (summary) {
      var income = rows.reduce(function(total, row) { return total + (row.type === "income" ? Number(row.amount || 0) : 0); }, 0);
      var expense = rows.reduce(function(total, row) { return total + (row.type === "income" ? 0 : Number(row.amount || 0)); }, 0);
      summary.hidden = false;
      summary.querySelector("[data-ab-activity-income]").textContent = "+" + fmt(income) + "원";
      summary.querySelector("[data-ab-activity-expense]").textContent = "−" + fmt(expense) + "원";
      var balance = income - expense;
      var balanceNode = summary.querySelector("[data-ab-activity-balance]");
      balanceNode.textContent = (balance >= 0 ? "+" : "−") + fmt(Math.abs(balance)) + "원";
      balanceNode.classList.toggle("isNegative", balance < 0);
    }
    if (!rows.length) {
      list.innerHTML = '<div class="abActivityEmpty"><b>표시할 기록이 없습니다.</b><span>빠른 입력으로 첫 기록을 남겨보세요.</span></div>';
      return;
    }
    var groups = Object.create(null);
    rows.slice(0, 40).forEach(function(row) {
      var date = String(row.transaction_date || "");
      if (!groups[date]) groups[date] = [];
      groups[date].push(row);
    });
    var ctx = context();
    list.innerHTML = Object.keys(groups).sort().reverse().map(function(date) {
      var dayRows = groups[date];
      var dayTotal = dayRows.reduce(function(total, row) { return total + (row.type === "income" ? 0 : Number(row.amount || 0)); }, 0);
      var items = dayRows.map(function(row) {
        var income = row.type === "income";
        var kind = iconKind(row);
        var href = "/app?month=" + encodeURIComponent(String(date).slice(0, 7) || ctx.month) + (ctx.household ? "&household_id=" + encodeURIComponent(ctx.household) : "") + "&view=calendar&date=" + encodeURIComponent(date) + "&feed=all&day_detail=1#calendar";
        var category = row.category || (income ? "수입" : "미분류");
        var meta = [row.payment_method || "", row.member || ""].filter(Boolean).join(" · ");
        var spokenAmount = (income ? "수입 " : "지출 ") + fmt(row.amount) + "원";
        return '<a class="abActivityItem ' + (income ? "isIncome" : "isExpense") + '" href="' + href + '" aria-label="' + esc((row.memo || category || "기록") + ", " + category + ", " + spokenAmount) + '"><i class="abActivityTypeIcon kind-' + kind + '" aria-hidden="true">' + iconSvg(kind) + '</i><span><b>' + esc(row.memo || category || "기록") + '</b><small><em>' + esc(category) + '</em>' + (meta ? '<span>' + esc(meta) + '</span>' : '') + '</small></span><strong><b>' + (income ? "+" : "−") + fmt(row.amount) + '</b><small>원</small></strong></a>';
      }).join("");
      return '<section class="abActivityGroup"><header><b>' + esc(dateLabel(date)) + '</b><span><em>' + fmt(dayRows.length) + '건</em>' + (dayTotal ? '<b>−' + fmt(dayTotal) + '원</b>' : '') + '</span></header>' + items + '</section>';
    }).join("") + (payload.has_more && filter === "all" ? '<p class="abActivityLimitNote">최근 80건을 표시합니다. 전체 기록은 전체 보기에서 확인하세요.</p>' : "");
  }
  function fail(message) {
    var node = ensure();
    var list = node.querySelector("[data-ab-activity-list]");
    list.innerHTML = '<div class="abActivityEmpty isError"><b>사용 내역을 불러오지 못했습니다.</b><span>' + esc(message || "잠시 후 다시 시도해 주세요.") + '</span><button type="button" data-ab-activity-retry>다시 시도</button></div>';
    var retry = list.querySelector("[data-ab-activity-retry]");
    if (retry) retry.addEventListener("click", function() { loaded = false; load(); });
  }
  function load() {
    if (transactionMode) return;
    if (loading || loaded) return;
    loading = true;
    var node = ensure();
    node.hidden = false;
    fetch(endpoint(), { headers: { accept: "application/json" }, credentials: "same-origin" })
      .then(function(response) { return response.ok ? response.json() : response.json().then(function(data) { throw new Error(data && data.message || "조회 실패"); }); })
      .then(function(data) {
        if (!data || !data.ok) throw new Error(data && data.message || "조회 실패");
        payload = data;
        loaded = true;
        var all = rail.querySelector("[data-ab-activity-all]");
        if (all) all.setAttribute("href", recordsHref());
        render();
      })
      .catch(function(error) { fail(error && error.message); })
      .finally(function() { loading = false; });
  }
  function sync() {
    var wide = !desktop || desktop.matches;
    var node = ensure();
    node.hidden = !wide;
    document.body.classList.toggle("abHasActivityRail", wide);
    if (wide) load();
  }
  if (desktop) {
    if (typeof desktop.addEventListener === "function") desktop.addEventListener("change", sync);
    else if (typeof desktop.addListener === "function") desktop.addListener(sync);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", sync, { once: true });
  else sync();
}

function accountbookSaveFeedbackClientMain() {
  var feedback = document.querySelector("[data-ab-save-feedback]");
  if (!feedback) return;
  var timer = null;
  var kind = feedback.getAttribute("data-ab-feedback-kind") || "success";
  function close() {
    if (!feedback || feedback.hasAttribute("hidden")) return;
    feedback.classList.remove("isVisible");
    feedback.classList.add("isLeaving");
    setTimeout(function() { if (feedback) feedback.setAttribute("hidden", ""); }, 180);
  }
  var closer = feedback.querySelector("[data-ab-feedback-close]");
  if (closer) closer.addEventListener("click", close);
  requestAnimationFrame(function() { feedback.classList.add("isVisible"); });
  if (kind === "success") timer = setTimeout(close, 5200);
  else if (kind === "warning") timer = setTimeout(close, 9000);
  feedback.addEventListener("mouseenter", function() { if (timer) clearTimeout(timer); });
  feedback.addEventListener("mouseleave", function() {
    if (kind === "success") timer = setTimeout(close, 2400);
    else if (kind === "warning") timer = setTimeout(close, 4200);
  });
  try {
    var params = new URLSearchParams(location.search);
    var changed = false;
    ["msg", "err", "balert"].forEach(function(key) { if (params.has(key)) { params.delete(key); changed = true; } });
    if (changed && window.history && window.history.replaceState) {
      var query = params.toString();
      window.history.replaceState({}, "", location.pathname + (query ? "?" + query : "") + location.hash);
    }
  } catch (_error) {}
}

function accountbookDayDetailClientMain() {
  var overlay = null;
  var panel = null;
  var lastTrigger = null;
  var activeRequest = null;
  var activeDate = "";
  var activeHouseholdId = "";
  function esc(value) {
    return String(value == null ? "" : value).replace(/[&<>"']/g, function (ch) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[ch];
    });
  }
  function fmt(n) { return Number(n || 0).toLocaleString("ko-KR"); }
  function titleFor(date) {
    var p = String(date || "").split("-");
    return p.length === 3 ? Number(p[0]) + "년 " + Number(p[1]) + "월 " + Number(p[2]) + "일" : String(date || "");
  }
  function validDate(value) { return /^20\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])$/.test(String(value || "")); }
  function returnTo(date, householdId) {
    var out = "/app?month=" + encodeURIComponent(String(date || "").slice(0, 7));
    if (householdId) out += "&household_id=" + encodeURIComponent(householdId);
    return out + "&view=calendar&date=" + encodeURIComponent(date) + "&feed=all&day_detail=1#calendar";
  }
  function memberOptions(members, selected) {
    return (Array.isArray(members) ? members : []).map(function (member) {
      var id = String(member && member.user_id || "");
      return '<option value="' + esc(id) + '"' + (id === String(selected || "") ? " selected" : "") + '>' + esc(member && member.nickname || "구성원") + " (" + esc(member && member.role || "member") + ")</option>";
    }).join("");
  }
  function renderItemActions(item, data) {
    if (!item || (!item.can_edit && !item.can_delete)) return "";
    var date = String(item.transaction_date || activeDate || "");
    var householdId = String(data && data.household_id || activeHouseholdId || "");
    var hidden = '<input type="hidden" name="id" value="' + esc(item.id) + '"/><input type="hidden" name="month" value="' + esc(date.slice(0, 7)) + '"/><input type="hidden" name="household_id" value="' + esc(householdId) + '"/><input type="hidden" name="return_to" value="' + esc(returnTo(date, householdId)) + '"/>';
    var rawMemo = item.memo_raw != null ? String(item.memo_raw) : String(item.memo || "");
    var orig = ["type", "transaction_date", "amount", "category", "memo", "payment_method", "user_id"].map(function (key) {
      var value = key === "type" ? (item.type === "income" ? "income" : "expense") : key === "memo" ? rawMemo : (item[key] == null ? "" : String(item[key]));
      return '<input type="hidden" name="orig_' + key + '" value="' + esc(value) + '"/>';
    }).join("");
    var spender = data && data.can_manage_spender
      ? '<label><span>' + (item.type === "income" ? "수입자" : "지출자") + '</span><select name="user_id" required>' + memberOptions(data.members, item.user_id) + "</select></label>"
      : '<input type="hidden" name="user_id" value="' + esc(item.user_id || "") + '"/><p class="abDayDetailSpender">' + (item.type === "income" ? "수입자" : "지출자") + " " + esc(item.member || "미지정") + "</p>";
    var edit = item.can_edit ? '<details class="abDayDetailEdit"><summary>수정</summary><form method="post" action="/admin/update" data-ab-day-write data-ab-day-update>' + hidden + orig + '<div class="abDayDetailEditGrid"><label><span>구분</span><select name="type"><option value="expense"' + (item.type !== "income" ? " selected" : "") + '>지출</option><option value="income"' + (item.type === "income" ? " selected" : "") + '>수입</option></select></label><label><span>날짜</span><input type="date" name="transaction_date" value="' + esc(date) + '" required/></label><label><span>금액</span><input name="amount" inputmode="numeric" value="' + esc(item.amount || 0) + '" required/></label><label><span>분류</span><input name="category" value="' + esc(item.category || "") + '"/></label><label><span>결제수단</span><input name="payment_method" value="' + esc(item.payment_method || "") + '"/></label><label class="abDayDetailMemo"><span>메모</span><input name="memo" value="' + esc(rawMemo) + '" placeholder="' + esc(item.memo || "메모") + '"/></label>' + spender + '</div><button type="submit" class="abDayDetailSave">수정 저장</button></form></details>' : "";
    var description = (item.memo || "내용 없음") + " · " + fmt(item.amount) + "원";
    var remove = item.can_delete ? '<form method="post" action="/admin/delete" class="abDayDetailDelete" data-ab-day-write data-ab-day-delete data-confirm="' + esc(description + " 기록을 삭제할까요?") + '">' + hidden + '<button type="submit">삭제</button></form>' : "";
    return '<div class="abDayDetailActions">' + edit + remove + "</div>";
  }
  function ensure() {
    if (overlay) return overlay;
    overlay = document.createElement("div");
    overlay.className = "abDayDetailOverlay";
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    overlay.innerHTML = '<div class="abDayDetailScrim" data-ab-day-close></div><section class="abDayDetailPanel" role="dialog" aria-modal="true" aria-labelledby="abDayDetailTitle" aria-describedby="abDayDetailStatus" tabindex="-1"><header class="abDayDetailHead"><div><b id="abDayDetailTitle">일별 상세</b><small id="abDayDetailStatus" aria-live="polite">거래를 불러오는 중입니다.</small></div><button type="button" class="abDayDetailClose" data-ab-day-close aria-label="일별 상세 닫기">✕</button></header><div class="abDayDetailBody"><div class="abDayDetailSums" data-ab-day-sums hidden><div class="abDayDetailSum isExpense"><span>지출</span><b data-ab-day-expense>0원</b></div><div class="abDayDetailSum isIncome"><span>수입</span><b data-ab-day-income>0원</b></div></div><div class="abDayDetailList" data-ab-day-list></div></div><footer class="abDayDetailFoot"><button type="button" class="abDayDetailAdd" data-ab-day-add hidden>이 날 기록 추가</button><a class="abDayDetailView" data-ab-day-view href="#">전체 기록에서 보기</a><button type="button" data-ab-day-close>닫기</button></footer></section>';
    document.body.appendChild(overlay);
    panel = overlay.querySelector(".abDayDetailPanel");
    overlay.addEventListener("click", function (event) {
      var add = event.target && event.target.closest && event.target.closest("[data-ab-day-add]");
      if (add) {
        var date = activeDate;
        var householdId = activeHouseholdId;
        close();
        setTimeout(function() {
          if (typeof window.openAbQuickInput === "function") window.openAbQuickInput(date, lastTrigger);
          else {
            var out = "/app?month=" + encodeURIComponent(String(date || "").slice(0, 7));
            if (householdId) out += "&household_id=" + encodeURIComponent(householdId);
            location.href = out + "&quick=1&date=" + encodeURIComponent(date) + "#quick";
          }
        }, 0);
        return;
      }
      if (event.target.closest("[data-ab-day-close]")) close();
    });
    overlay.addEventListener("submit", function (event) {
      var form = event.target && event.target.closest && event.target.closest("[data-ab-day-write]");
      if (!form) return;
      if (form.hasAttribute("data-ab-day-delete") && !window.confirm(form.getAttribute("data-confirm") || "이 기록을 삭제할까요?")) {
        event.preventDefault();
        return;
      }
      var nextDate = activeDate;
      var dateInput = form.querySelector('[name="transaction_date"]');
      if (dateInput && validDate(dateInput.value)) nextDate = dateInput.value;
      var returnInput = form.querySelector('[name="return_to"]');
      if (returnInput) returnInput.value = returnTo(nextDate, activeHouseholdId);
      var monthInput = form.querySelector('[name="month"]');
      if (monthInput) monthInput.value = String(nextDate || "").slice(0, 7);
      form.setAttribute("aria-busy", "true");
      var submit = form.querySelector('button[type="submit"]');
      if (submit) submit.textContent = form.hasAttribute("data-ab-day-delete") ? "삭제 중…" : "수정 중…";
      var status = overlay.querySelector("#abDayDetailStatus");
      if (status) status.textContent = form.hasAttribute("data-ab-day-delete") ? "기록을 삭제하는 중입니다." : "수정 내용을 저장하는 중입니다.";
    });
    return overlay;
  }
  function setLoading(date, href) {
    var node = ensure();
    node.querySelector("#abDayDetailTitle").textContent = titleFor(date);
    node.querySelector("#abDayDetailStatus").textContent = titleFor(date) + " 기록을 불러오는 중입니다.";
    node.querySelector("[data-ab-day-sums]").setAttribute("hidden", "");
    node.querySelector("[data-ab-day-add]").setAttribute("hidden", "");
    node.querySelector("[data-ab-day-list]").innerHTML = '<div class="abDayDetailLoading"><i aria-hidden="true"></i><span>일별 기록을 확인하고 있습니다.</span></div>';
    node.querySelector("[data-ab-day-view]").setAttribute("href", href || "#");
  }
  function renderError(message, date, householdId, href) {
    var node = ensure();
    node.querySelector("#abDayDetailStatus").textContent = "불러오지 못했습니다.";
    node.querySelector("[data-ab-day-sums]").setAttribute("hidden", "");
    var list = node.querySelector("[data-ab-day-list]");
    list.innerHTML = '<div class="abDayDetailEmpty"><b>일별 기록을 불러오지 못했습니다.</b><span>' + esc(message || "잠시 후 다시 시도해 주세요.") + '</span><button type="button" data-ab-day-retry>다시 시도</button></div>';
    var retry = list.querySelector("[data-ab-day-retry]");
    if (retry) retry.addEventListener("click", function () { load(date, householdId, href); });
  }
  function renderData(data, href) {
    var node = ensure();
    var count = Number(data && data.count || 0);
    node.querySelector("#abDayDetailStatus").textContent = count + "건" + (data && data.has_more ? " · 최근 " + Number(data.displayed_count || 0) + "건 표시" : "");
    var sums = node.querySelector("[data-ab-day-sums]");
    sums.removeAttribute("hidden");
    node.querySelector("[data-ab-day-expense]").textContent = "−" + fmt(data && data.expense) + "원";
    node.querySelector("[data-ab-day-income]").textContent = "+" + fmt(data && data.income) + "원";
    node.querySelector("[data-ab-day-view]").setAttribute("href", href || "#");
    var add = node.querySelector("[data-ab-day-add]");
    if (data && data.can_write) add.removeAttribute("hidden");
    else add.setAttribute("hidden", "");
    var items = Array.isArray(data && data.items) ? data.items : [];
    var list = node.querySelector("[data-ab-day-list]");
    if (!items.length) {
      list.innerHTML = '<div class="abDayDetailEmpty"><b>이 날은 기록이 없습니다.</b><span>이 날짜가 선택된 빠른 입력을 바로 열 수 있습니다.</span></div>';
      return;
    }
    list.innerHTML = items.map(function (item) {
      var income = item.type === "income";
      var category = item.category || (income ? "수입" : "미분류");
      var memo = item.memo || "내용 없음";
      var meta = [item.payment_method, item.member].filter(Boolean).map(esc).join(" · ");
      return '<article class="abDayDetailItem ' + (income ? "isIncome" : "isExpense") + '"><span class="abDayDetailType">' + (income ? "수입" : "지출") + '</span><div class="abDayDetailCopy"><b>' + esc(memo) + '</b><span>' + esc(category) + (meta ? " · " + meta : "") + '</span></div><strong>' + (income ? "+" : "−") + fmt(item.amount) + '원</strong>' + renderItemActions(item, data) + '</article>';
    }).join("") + (data && data.has_more ? '<div class="abDayDetailMore">거래가 많아 최근 ' + Number(data.displayed_count || 0) + '건만 표시했습니다. 전체 기록에서 나머지를 확인하세요.</div>' : "");
  }
  function load(date, householdId, href) {
    if (activeRequest && typeof activeRequest.abort === "function") activeRequest.abort();
    activeRequest = typeof AbortController === "function" ? new AbortController() : null;
    setLoading(date, href);
    var url = "/u/api/day-transactions?date=" + encodeURIComponent(date);
    if (householdId) url += "&household_id=" + encodeURIComponent(householdId);
    fetch(url, { headers: { accept: "application/json" }, credentials: "same-origin", signal: activeRequest ? activeRequest.signal : undefined })
      .then(function (response) { return response.json().catch(function () { return {}; }).then(function (json) { if (!response.ok || !json.ok) throw new Error(json.message || "조회에 실패했습니다."); return json; }); })
      .then(function (json) { renderData(json, href); })
      .catch(function (error) { if (error && error.name === "AbortError") return; renderError(error && error.message, date, householdId, href); });
  }
  function open(trigger) {
    var date = trigger.getAttribute("data-ab-day") || "";
    if (!date) return;
    lastTrigger = trigger;
    activeDate = date;
    activeHouseholdId = trigger.getAttribute("data-ab-household-id") || "";
    var node = ensure();
    node.removeAttribute("hidden");
    node.setAttribute("aria-hidden", "false");
    document.body.classList.add("abDayDetailOpen");
    load(date, trigger.getAttribute("data-ab-household-id") || "", trigger.getAttribute("href") || "#");
    var closeButton = node.querySelector(".abDayDetailClose");
    if (closeButton && closeButton.focus) { try { closeButton.focus(); } catch (_error) {} }
  }
  function close() {
    if (!overlay || overlay.hasAttribute("hidden")) return;
    if (activeRequest && typeof activeRequest.abort === "function") activeRequest.abort();
    overlay.setAttribute("hidden", "");
    overlay.setAttribute("aria-hidden", "true");
    document.body.classList.remove("abDayDetailOpen");
    if (lastTrigger && lastTrigger.focus) { try { lastTrigger.focus(); } catch (_error) {} }
  }
  document.addEventListener("click", function (event) {
    var trigger = event.target && event.target.closest && event.target.closest("a.abNavCalDay[data-ab-day],a.calDay.hasRec[data-ab-day]");
    if (!trigger || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    open(trigger);
  });
  document.addEventListener("keydown", function (event) {
    if (!overlay || overlay.hasAttribute("hidden")) return;
    if (event.key === "Escape") { event.preventDefault(); close(); return; }
    if (event.key !== "Tab" || !panel) return;
    var focusable = Array.prototype.slice.call(panel.querySelectorAll('a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])')).filter(function (el) { return !el.hasAttribute("hidden"); });
    if (!focusable.length) { event.preventDefault(); panel.focus(); return; }
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
  function autoOpenReturnedDate() {
    var params;
    try { params = new URLSearchParams(location.search); } catch (_error) { return; }
    var date = params.get("date") || "";
    if (location.pathname !== "/app" || params.get("day_detail") !== "1" || !validDate(date)) return;
    var trigger = document.querySelector('a.abNavCalDay[data-ab-day="' + date + '"],a.calDay.hasRec[data-ab-day="' + date + '"]');
    if (!trigger) return;
    open(trigger);
    if (window.history && window.history.replaceState) {
      params.delete("day_detail");
      var query = params.toString();
      window.history.replaceState({}, "", location.pathname + (query ? "?" + query : "") + location.hash);
    }
  }
  // V22.8.92 (7.3): 상태 문구를 담은 시트를 첫 열기 *전에* 문서에 붙인다.
  // aria-live 는 이미 등록된 영역의 글자가 바뀔 때만 읽힌다. 시트를 여는 순간
  // 만들어 붙이면 그 안의 문구는 "변화"가 아니라 처음부터 있던 글자라서
  // 첫 열기에서만 통째로 묵음이 됐다. 미리 붙여 두고, 여는 순간의 문구를
  // 날짜가 들어간 다른 문장으로 바꿔 실제 변화가 일어나게 한다.
  function prepareLiveRegion() { ensure(); }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", function () { prepareLiveRegion(); autoOpenReturnedDate(); }, { once: true });
  else { prepareLiveRegion(); autoOpenReturnedDate(); }
}

function accountbookChallengeClientMain() {
  "use strict";
  function syncFields(form) {
    if (!form || !form.querySelector) return;
    var type = form.querySelector("[data-report-challenge-type]");
    var value = type ? type.value : "no_spend_days";
    var amount = form.querySelector("[data-report-challenge-amount]");
    var category = form.querySelector("[data-report-challenge-category]");
    if (amount) {
      amount.hidden = value === "no_spend_days";
      var amountInput = amount.querySelector("input");
      if (amountInput) amountInput.required = value !== "no_spend_days";
    }
    if (category) {
      category.hidden = value !== "category_spend_limit_days";
      var categoryInput = category.querySelector("input");
      if (categoryInput) categoryInput.required = value === "category_spend_limit_days";
    }
  }
  function statusElement(scope) {
    return scope && scope.querySelector ? scope.querySelector("[data-report-challenge-status]") : null;
  }
  function showStatus(scope, message, failed) {
    var target = statusElement(scope);
    if (!target) return;
    target.hidden = false;
    target.classList.toggle("isError", !!failed);
    target.textContent = String(message || (failed ? "저장하지 못했습니다." : "저장했습니다."));
  }
  function replaceChallenge(html) {
    var current = document.getElementById("reportChallenge");
    if (!current || !html) return current;
    var template = document.createElement("template");
    template.innerHTML = String(html).trim();
    var next = template.content.firstElementChild;
    if (!next) return current;
    current.replaceWith(next);
    var details = next.querySelector("details");
    if (details) details.open = true;
    syncFields(next.querySelector("form[data-report-challenge-form]"));
    return next;
  }
  document.addEventListener("change", function (event) {
    if (!event.target || !event.target.matches || !event.target.matches("[data-report-challenge-type]")) return;
    syncFields(event.target.closest("form[data-report-challenge-form]"));
  });
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || !form.matches || !form.matches("form[data-report-challenge-form]")) return;
    if (!window.fetch || !window.FormData) return;
    event.preventDefault();
    var section = form.closest("#reportChallenge") || form.parentElement;
    var button = form.querySelector('button[type="submit"]');
    var original = button ? button.textContent : "";
    if (button) {
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      button.textContent = "저장 중…";
    }
    showStatus(section, "챌린지 설정을 저장하고 있습니다.", false);
    fetch(form.action, {
      method: "POST",
      body: new FormData(form),
      credentials: "same-origin",
      headers: { accept: "application/json", "x-accountbook-inline": "1" },
    }).then(function (response) {
      return response.json().catch(function () { return { ok: false, message: "서버 응답을 확인하지 못했습니다." }; }).then(function (data) {
        if (!response.ok || !data.ok) {
          var error = new Error(String(data.message || "챌린지 설정을 저장하지 못했습니다."));
          error.payload = data;
          throw error;
        }
        return data;
      });
    }).then(function (data) {
      section = replaceChallenge(data.challenge_html) || section;
      showStatus(section, data.message || "챌린지 설정을 저장했습니다.", false);
    }).catch(function (error) {
      showStatus(section, error && error.message ? error.message : "챌린지 설정을 저장하지 못했습니다. 다시 시도해 주세요.", true);
    }).finally(function () {
      var activeButton = section && section.querySelector ? section.querySelector('form[data-report-challenge-form] button[type="submit"]') : button;
      if (activeButton) {
        activeButton.disabled = false;
        activeButton.removeAttribute("aria-busy");
        activeButton.textContent = original || "설정 저장";
      }
    });
  });
  function initialize() {
    Array.prototype.forEach.call(document.querySelectorAll("form[data-report-challenge-form]"), syncFields);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initialize, { once: true });
  else initialize();
}

// V22.8.34: V5 오버레이 3종(검색·알림·행즐겨찾기)을 1개 immutable 에셋으로 번들링하고
// 오버레이 마크업도 여기서 생성 → 페이지 HTML(홈 35KB 예산)에서 스크립트·마크업 제거.
function accountbookDetailExperienceClientMain() {
  "use strict";
  var dialog = null, owner = null, slot = null, opener = null;
  function dismissHelp() {
    if (typeof HTMLElement.prototype.hidePopover !== "function") return;
    document.querySelectorAll(".abHelpPopover:popover-open").forEach(function(help) { help.hidePopover(); });
  }
  function ensureDialog() {
    if (dialog) return dialog;
    dialog = document.createElement("dialog");
    if (typeof dialog.showModal !== "function") { dialog = null; return null; }
    dialog.className = "abTxDetail";
    dialog.setAttribute("aria-labelledby", "abTxDetailTitle");
    dialog.innerHTML = '<header class="abTxDetailHead"><h2 id="abTxDetailTitle">거래 상세</h2><button type="button" data-ab-tx-close aria-label="거래 상세 닫기">×</button></header><div class="abTxDetailBody"><section class="abTxOverview" data-ab-tx-overview></section><div data-ab-tx-editor hidden></div></div><footer class="abTxDetailFoot"><button type="button" data-ab-tx-edit>수정하기</button><button type="button" class="secondary" data-ab-tx-close>닫기</button></footer>';
    document.body.appendChild(dialog);
    new MutationObserver(function() {
      var focused = document.activeElement;
      dialog.querySelectorAll('.v8-edit [aria-label]').forEach(function(field) {
        if (field.closest('label')) return;
        var label = document.createElement('label');
        label.className = 'abTxField';
        var caption = document.createElement('span');
        caption.textContent = field.getAttribute('aria-label');
        field.before(label);
        label.append(caption, field);
      });
      if (focused && focused !== document.activeElement && dialog.open && dialog.contains(focused) && focused.getClientRects().length) focused.focus({ preventScroll: true });
    }).observe(dialog, { childList: true, subtree: true });
    dialog.addEventListener("keydown", function(event) {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); dialog.close(); }
      if (event.key === "Tab") {
        var targets = Array.from(dialog.querySelectorAll('a[href],button,input,select,textarea,[tabindex="0"]')).filter(function(target) { return !target.disabled && target.getClientRects().length > 0; });
        var index = targets.indexOf(document.activeElement);
        if (targets.length && (index < 0 || event.shiftKey && index === 0 || !event.shiftKey && index === targets.length - 1)) {
          event.preventDefault();
          targets[event.shiftKey ? targets.length - 1 : 0].focus();
        }
      }
    });
    dialog.addEventListener("click", function(event) {
      if (event.target.closest("[data-ab-tx-close]")) dialog.close();
      if (event.target === dialog) {
        var rect = dialog.getBoundingClientRect();
        if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
      }
      if (event.target.closest("[data-ab-tx-edit]") && owner && slot) {
        dialog.querySelector("[data-ab-tx-overview]").hidden = true;
        var editor = dialog.querySelector("[data-ab-tx-editor]");
        editor.hidden = false;
        owner._abEditSlot = slot;
        editor.appendChild(slot);
        event.target.hidden = true;
        owner.open = true;
        if (owner.dataset.abEditState === "ready") {
          var field = slot.querySelector('select:not(:disabled),input:not([type="hidden"]):not(:disabled),button:not(:disabled)');
          if (field) field.focus();
        }
      }
    });
    dialog.addEventListener("close", function() {
      if (owner && slot) {
        owner.open = false;
        owner.appendChild(slot);
        delete owner._abEditSlot;
      }
      document.body.classList.remove("abTxDetailOpen");
      var target = opener;
      owner = null; slot = null; opener = null;
      if (target && target.isConnected) target.focus({ preventScroll: true });
    });
    return dialog;
  }
  function showRow(main) {
    var node = ensureDialog();
    if (!node || node.open) return false;
    dismissHelp();
    var details = main.closest("details[data-ab-edit-src]");
    owner = details;
    slot = details && details.querySelector(".v8-editSlot");
    opener = main;
    var overview = node.querySelector("[data-ab-tx-overview]");
    overview.replaceChildren();
    overview.hidden = false;
    var title = document.createElement("h3");
    title.textContent = main.querySelector("b")?.textContent || "거래 기록";
    var amount = main.querySelector("strong");
    overview.appendChild(title);
    if (amount) { var value = amount.cloneNode(true); value.classList.add("abTxDetailAmount"); overview.appendChild(value); }
    var copy = document.createElement("p");
    copy.textContent = Array.from(main.querySelectorAll("div > span")).map(function(item) { return item.textContent; }).join("\n");
    overview.appendChild(copy);
    var note = document.createElement("p");
    note.className = "abTxDetailNote";
    note.textContent = details ? "기록을 확인한 뒤 필요한 항목만 수정할 수 있습니다." : "현재 권한으로는 이 기록을 조회할 수 있습니다.";
    overview.appendChild(note);
    node.querySelector("[data-ab-tx-editor]").hidden = true;
    node.querySelector("[data-ab-tx-edit]").hidden = !details;
    document.body.classList.add("abTxDetailOpen");
    try { node.showModal(); } catch (_error) { document.body.classList.remove("abTxDetailOpen"); owner = null; slot = null; opener = null; return false; }
    return true;
  }
  document.addEventListener("click", function(event) {
    var main = event.target.closest && event.target.closest(".v8-tx-main");
    if (!main || event.target.closest("a,input,button,select,textarea") || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    if (showRow(main)) { event.preventDefault(); event.stopPropagation(); }
  }, true);
  // V22.9.26: 실제 마크업은 article.v8-tx > details > summary.v8-tx-main 이라 자손 선택자여야 한다.
  // 자식 선택자로는 한 번도 맞지 않아 키보드·보조기기 사용자에게 상세 시트가 열리지 않았다.
  document.querySelectorAll(".v8-tx .v8-tx-main").forEach(function(main) {
    if (typeof HTMLDialogElement === "undefined" || typeof HTMLDialogElement.prototype.showModal !== "function") return;
    main.tabIndex = 0;
    main.setAttribute("role", "button");
    main.setAttribute("aria-label", main.textContent.trim().replace(/\s+/g, " ") + " 상세 보기");
    main.addEventListener("keydown", function(event) { if (event.key === "Enter" || event.key === " ") { if (showRow(main)) event.preventDefault(); } });
  });

  // Read submitted values, including manual corrections, without re-running the parser.
  var summaryQueued = false;
  function syncQuickSummary() {
    summaryQueued = false;
    var form = document.querySelector("#add form.form");
    if (!form) return;
    var amount = Number(String(form.elements.amount?.value || "").replace(/[^0-9]/g, ""));
    var memo = String(form.elements.memo?.value || "").trim();
    var summary = form.querySelector(".abQuickValue");
    if (!summary) {
      summary = document.createElement("div");
      summary.className = "abQuickValue";
      summary.innerHTML = '<span>저장할 내용</span><b></b><small></small>';
      form.querySelector(".quickSubmit")?.before(summary);
    }
    summary.hidden = !amount && !memo;
    var income = form.querySelector('input[name="type"][value="income"]:checked');
    summary.querySelector("b").textContent = (income ? "수입 " : "지출 ") + (amount ? amount.toLocaleString("ko-KR") + "원" : "금액을 입력하세요");
    summary.querySelector("small").textContent = memo || "내용을 입력하면 이곳에 표시됩니다.";
  }
  function scheduleSummary() { if (!summaryQueued) { summaryQueued = true; queueMicrotask(syncQuickSummary); } }
  document.addEventListener("input", scheduleSummary);
  document.addEventListener("change", scheduleSummary);
  document.addEventListener("click", function(event) {
    if (event.target.closest && event.target.closest("#add,[data-ab-quick-open]")) scheduleSummary();
    if (event.target.closest && event.target.closest("[data-ab-quick-open]")) dismissHelp();
  });
  window.addEventListener("pageshow", scheduleSummary);
  syncQuickSummary();

  // The details fallback remains usable if popovers are unavailable.
  document.querySelectorAll("details.abDailyHelp").forEach(function(details, index) {
    if (typeof HTMLElement.prototype.showPopover !== "function") return;
    var button = document.createElement("button");
    button.type = "button"; button.className = "abHelpButton";
    button.textContent = details.querySelector("summary").textContent;
    var popover = document.createElement("div");
    popover.id = "abDailyHelp" + index;
    popover.className = "abHelpPopover";
    popover.setAttribute("popover", "auto");
    popover.textContent = details.querySelector("p").textContent;
    button.setAttribute("popovertarget", popover.id);
    button.style.setProperty("anchor-name", "--ab-daily-help-" + index);
    popover.style.setProperty("position-anchor", "--ab-daily-help-" + index);
    details.replaceWith(button);
    document.body.appendChild(popover);
  });
}

function accountbookV5BundleJsAsset() {
  if (!AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE) {
    const ensureOverlays = `(function(){try{if(!document.getElementById("abV5Search"))document.body.insertAdjacentHTML("beforeend",${JSON.stringify(ACCOUNTBOOK_V5_SEARCH_OVERLAY_HTML)});if(!document.getElementById("abV5Notif"))document.body.insertAdjacentHTML("beforeend",${JSON.stringify(ACCOUNTBOOK_V5_NOTIF_OVERLAY_HTML)});}catch(e){}})();`;
    AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE = `${ensureOverlays}(${accountbookSearchClientMain.toString()})();(${accountbookNotifClientMain.toString()})();(${accountbookFavRowsClientMain.toString()})();(${accountbookSidebarDashboardClientMain.toString()})();(${accountbookQuickInputClientMain.toString()})();(${accountbookDayDetailClientMain.toString()})();(${accountbookActivityRailClientMain.toString()})();(${accountbookSaveFeedbackClientMain.toString()})();(${accountbookChallengeClientMain.toString()})();(${accountbookDetailExperienceClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_V5_BUNDLE_JS_CACHE;
}
// @build:exports-start
export { accountbookFavRowsJsAsset, accountbookGoalsJsAsset, accountbookV5BundleJsAsset };
// @build:exports-end
