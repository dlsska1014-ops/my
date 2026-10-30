// Lucian UX/UI Prompt #092 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#092
function accountbookTransactionFilterClientMain() {
  if (location.hash !== "#abTxResults") return;
  var heading = document.getElementById("abTxResults");
  var summary = document.querySelector(".txTabHead[data-count]");
  if (!heading || !summary) return;
  var live = document.createElement("p");
  live.className = "srOnly";
  live.setAttribute("role", "status");
  live.setAttribute("aria-live", "polite");
  summary.appendChild(live);
  heading.focus();
  setTimeout(function () { live.textContent = "조건을 해제한 결과 " + Number(summary.getAttribute("data-count") || 0).toLocaleString("ko-KR") + "건의 기록이 있습니다."; }, 50);
}

// Lucian UX/UI Prompt #070, #071 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#071
// V22.9.90(사용자 피드백 2026-10-30 "삭제하면 5초뒤 삭제되는데 바로 삭제되게하고 되돌리기를 5초 유지해줘"): 삭제는 누르는 즉시 서버에 보낸다
// (예전에는 5초 기다렸다 보냈고 그동안만 되돌리기가 있었다). 서버가 지운 뒤 준 돌아갈 주소(msg=deleted, 로그인 사용자면 되살리기 표 restore)로
// 목록을 다시 불러오고, 그 화면의 알림이 ‘되돌리기’(POST /my/restore)를 5초 보인다(v5-bundle-mains.js accountbookSaveFeedbackClientMain).
// 결과를 모르는 삭제(응답 유실·시간 초과)는 예전처럼 다시 보내지 않고 같은 기록의 삭제를 막은 채 현재 기록을 조회한다.
// 확인 없이 바로 보내는 것은 ‘되돌리기’가 따라오는 삭제뿐이다 — 서버가 로그인 사용자 화면의 삭제 폼·단추에 data-ab-delete-restorable 을 달고,
// 돌아갈 곳이 그 단추를 그리는 홈(/app, /my 는 /app 으로 넘김)일 때. 그 밖(관리자 세션·다른 돌아갈 곳·표시 없는 폼)은 보내기 전에 먼저 묻는다.
function accountbookTransactionDeleteClientMain() {
  if (typeof fetch !== "function" || typeof FormData !== "function") return;
  if (["/app", "/transactions/edit"].indexOf(location.pathname) < 0 && !document.querySelector('button[formaction="/admin/delete"],form[action="/admin/delete"]')) return;
  var active = null, toast = null, dismissTimer = 0, away = false;
  var unresolved = Object.create(null);
  var buttonDefaults = new WeakMap();
  var storageKey = "abTxDeletePending";
  var hadDeleteInteraction = false;
  function key(entry) { return entry.household_id + ":" + entry.transaction_id; }
  function readStorage() {
    try {
      var values = JSON.parse(sessionStorage.getItem(storageKey) || "[]");
      if (!Array.isArray(values)) return;
      values.slice(0, 100).forEach(function (entry) {
        if (!entry || typeof entry.household_id !== "string" || typeof entry.transaction_id !== "string" || !entry.household_id || !entry.transaction_id || entry.household_id.length > 120 || entry.transaction_id.length > 120) return;
        unresolved[key(entry)] = { household_id: entry.household_id, transaction_id: entry.transaction_id, state: "unknown" };
      });
    } catch (_error) {}
  }
  function persist() {
    try {
      var entries = Object.keys(unresolved).map(function (id) { var item = unresolved[id]; return { household_id: item.household_id, transaction_id: item.transaction_id, state: item.state }; });
      if (entries.length) sessionStorage.setItem(storageKey, JSON.stringify(entries));
      else sessionStorage.removeItem(storageKey);
    } catch (_error) {}
  }
  function isDelete(form, button) {
    if (!form || form.tagName !== "FORM" || String(form.method || form.getAttribute("method")).toLowerCase() !== "post") return false;
    try { return new URL(button && button.getAttribute("formaction") || form.getAttribute("action") || "", location.href).pathname === "/admin/delete"; }
    catch (_error) { return false; }
  }
  function scopeOf(form) {
    var data = new FormData(form);
    return { household_id: String(data.get("household_id") || "").trim(), transaction_id: String(data.get("id") || "").trim(), month: String(data.get("month") || ""), return_to: String(data.get("return_to") || location.pathname + location.search) };
  }
  function restorable(form, button, entry) {
    if (!form.hasAttribute("data-ab-delete-restorable") && !(button && button.hasAttribute("data-ab-delete-restorable"))) return false;
    try { var next = new URL(entry.return_to, location.href); return next.origin === location.origin && ["/app", "/my"].indexOf(next.pathname) >= 0; }
    catch (_error) { return false; }
  }
  function controls() {
    document.querySelectorAll('button[formaction="/admin/delete"],form[action="/admin/delete"] button[type="submit"]').forEach(function (button) {
      if (!buttonDefaults.has(button)) buttonDefaults.set(button, { disabled: button.disabled, title: button.getAttribute("title") });
      var original = buttonDefaults.get(button), entry;
      try { entry = scopeOf(button.form || button.closest("form")); } catch (_error) { return; }
      var blocked = !!unresolved[key(entry)];
      button.disabled = original.disabled || !!active || blocked;
      if (blocked) button.setAttribute("title", "삭제 결과 확인이 필요한 기록입니다. 먼저 현재 기록을 조회해 주세요.");
      else if (active) button.setAttribute("title", "앞선 기록의 삭제 요청을 처리 중입니다.");
      else if (original.title === null) button.removeAttribute("title");
      else button.setAttribute("title", original.title);
    });
  }
  function ensureToast() {
    if (toast) return toast;
    toast = document.createElement("section");
    toast.className = "abDeleteNotice";
    toast.setAttribute("role", "region");
    toast.setAttribute("aria-label", "기록 삭제 알림");
    toast.tabIndex = -1;
    toast.innerHTML = '<div><p class="abDeleteMessage" role="status" aria-live="polite"></p><small class="abDeleteHelp"></small></div><div class="abDeleteActions"><button type="button" data-ab-delete-check hidden>현재 기록 조회</button><button type="button" data-ab-delete-refresh hidden>목록 다시 불러오기</button></div>';
    document.body.appendChild(toast);
    toast.querySelector("[data-ab-delete-refresh]").addEventListener("click", function () { location.reload(); });
    return toast;
  }
  function modalContainer() {
    return document.querySelector("dialog[open]") || Array.from(document.querySelectorAll('[role="dialog"][aria-modal="true"]')).find(function (node) {
      return node.getClientRects().length && !node.closest('[aria-hidden="true"],[hidden]');
    }) || document.body;
  }
  function syncNoticeContainer() {
    if (!toast || toast.hidden) return;
    var container = modalContainer();
    if (toast.parentElement !== container) container.appendChild(toast);
  }
  function notice(message, help, mode, entry) {
    if (away) return;
    if (dismissTimer) clearTimeout(dismissTimer);
    var node = ensureToast();
    node.hidden = false;
    node.setAttribute("data-state", mode);
    node.querySelector(".abDeleteMessage").textContent = message;
    node.querySelector(".abDeleteHelp").textContent = help || "";
    var check = node.querySelector("[data-ab-delete-check]");
    check.hidden = mode !== "unknown";
    check.disabled = false;
    check.onclick = entry ? function () { checkPresence(entry); } : null;
    node.querySelector("[data-ab-delete-refresh]").hidden = mode !== "unknown" && mode !== "success";
    syncNoticeContainer();
    if (mode === "failed") dismissTimer = setTimeout(function () { if (!active) { node.hidden = true; showUnresolved(); } }, 6000);
  }
  function rowFor(entry, form) { return document.getElementById("tx-" + entry.transaction_id) || form && (form.closest(".abDayDetailItem,.v8-tx") || form); }
  function restoreRow(entry) {
    if (entry.row) { entry.row.removeAttribute("data-ab-delete-pending"); entry.row.removeAttribute("aria-busy"); }
  }
  function focusRow(entry) {
    var target = entry.button;
    if (!target || !target.isConnected || !target.getClientRects().length) target = entry.row && entry.row.querySelector("summary,button,a[href]");
    var modal = modalContainer();
    if (modal !== document.body && target && !modal.contains(target)) target = toast;
    if (target && target.isConnected && target.getClientRects().length) target.focus({ preventScroll: true });
    else if (toast) toast.focus({ preventScroll: true });
  }
  function currentHouseholdId() {
    var field = document.querySelector('.v8-edit input[name="household_id"],form[action="/admin/delete"] input[name="household_id"]');
    if (location.pathname === "/transactions/edit" && field && field.value) return String(field.value);
    return new URLSearchParams(location.search).get("household_id") || document.querySelector("[data-ab-hh]")?.getAttribute("data-ab-hh") || field && String(field.value || "") || "";
  }
  function showUnresolved() {
    if (active || away) return;
    var householdId = currentHouseholdId();
    var entry = Object.keys(unresolved).map(function (id) { return unresolved[id]; }).find(function (item) { return item.household_id === householdId; });
    if (entry) notice("삭제 결과를 확인하지 못했습니다.", "같은 기록을 다시 삭제하지 말고 현재 기록을 조회해 주세요. 다른 기록은 삭제할 수 있습니다.", "unknown", entry);
  }
  function markUnknown(entry) {
    entry.state = "unknown";
    unresolved[key(entry)] = entry;
    persist(); restoreRow(entry);
    if (active === entry) active = null;
    controls();
    notice("삭제 결과를 확인하지 못했습니다.", "자동으로 다시 삭제하지 않습니다. 현재 기록의 존재 여부를 확인합니다.", "unknown", entry);
    checkPresence(entry);
  }
  function checkPresence(entry) {
    if (entry.checking) return;
    entry.checking = true;
    var button = toast && toast.querySelector("[data-ab-delete-check]");
    if (button) button.disabled = true;
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 12000) : 0;
    fetch("/u/api/tx/presence?household_id=" + encodeURIComponent(entry.household_id) + "&id=" + encodeURIComponent(entry.transaction_id), { credentials: "same-origin", headers: { accept: "application/json" }, signal: controller ? controller.signal : undefined }).then(function (response) {
      if (!response.ok || !/application\/json/i.test(response.headers.get("content-type") || "")) throw new Error("presence_unavailable");
      return response.json();
    }).then(function (data) {
      if (!data.ok || data.household_id !== entry.household_id || data.transaction_id !== entry.transaction_id || typeof data.exists !== "boolean") throw new Error("presence_invalid");
      if (!active) notice("삭제 결과를 확인하지 못했습니다.", data.exists ? "현재 기록이 존재합니다. 지연된 삭제 요청이 아직 진행 중일 수 있어 같은 기록의 삭제는 막았습니다." : "현재 기록을 찾지 못했습니다. 이번 요청의 성공으로 단정할 수 없으므로 목록을 다시 불러와 확인해 주세요.", "unknown", entry);
    }).catch(function () {
      if (!active) notice("삭제 결과를 확인하지 못했습니다.", "현재 기록 조회도 완료하지 못했습니다. 현재 기록 조회 버튼으로 다시 확인해 주세요.", "unknown", entry);
    }).finally(function () { clearTimeout(timeout); entry.checking = false; if (button) button.disabled = false; controls(); });
  }
  function send(entry) {
    if (active !== entry || away) return;
    entry.state = "requesting";
    unresolved[key(entry)] = entry;
    persist(); controls();
    notice("기록을 삭제하는 중입니다.", entry.restorable ? "서버에서 결과를 확인하고 있습니다. 지운 뒤 다음 화면 알림의 되돌리기로 5초 안에 되살릴 수 있습니다." : "서버에서 결과를 확인하고 있습니다. 요청한 뒤에는 되돌릴 수 없습니다.", "sending");
    var controller = typeof AbortController === "function" ? new AbortController() : null;
    var timeout = controller ? setTimeout(function () { controller.abort(); }, 15000) : 0;
    var body = new URLSearchParams({ id: entry.transaction_id, household_id: entry.household_id, month: entry.month, return_to: entry.return_to });
    fetch("/admin/delete", { method: "POST", credentials: "same-origin", redirect: "error", headers: { accept: "application/json", "content-type": "application/x-www-form-urlencoded" }, body: body.toString(), signal: controller ? controller.signal : undefined }).then(function (response) {
      if (!/application\/json/i.test(response.headers.get("content-type") || "")) throw new Error("delete_response_invalid");
      return response.json().then(function (data) { return { response: response, data: data }; });
    }).then(function (result) {
      var response = result.response, data = result.data;
      if (response.ok && data.ok === true && data.deleted === true && data.transaction_id === entry.transaction_id && data.household_id === entry.household_id) {
        delete unresolved[key(entry)]; persist(); active = null; controls();
        notice("기록을 삭제했습니다.", "확인한 결과로 목록과 합계를 다시 불러옵니다.", "success");
        if (!away) {
          var next = new URL(data.location || entry.return_to, location.href);
          if (next.origin === location.origin && ["/app", "/my", "/admin-view", "/"].includes(next.pathname)) location.assign(next.pathname + next.search + next.hash);
          else location.reload();
        }
        return;
      }
      var definite = ["unauthorized", "forbidden", "record_not_found", "invalid_scope", "invalid_record", "record_policy_denied", "cross_site_request_blocked", "rate_limited", "record_delete_failed"];
      if (response.status >= 400 && data.ok === false && data.uncertain !== true && definite.indexOf(data.error) >= 0) {
        delete unresolved[key(entry)]; persist(); active = null; restoreRow(entry); controls();
        notice(data.message || "기록을 삭제하지 못했습니다.", "기록을 다시 표시했습니다. 안내를 확인한 뒤 처리해 주세요.", "failed"); focusRow(entry);
      } else markUnknown(entry);
    }).catch(function () { markUnknown(entry); }).finally(function () { clearTimeout(timeout); });
  }
  function start(form, button) {
    var entry = scopeOf(form);
    if (!entry.household_id || !entry.transaction_id) { notice("삭제할 기록을 확인하지 못했습니다.", "목록을 새로고침해 주세요.", "failed"); return; }
    if (active) return;
    if (unresolved[key(entry)]) { showUnresolved(); return; }
    entry.restorable = restorable(form, button, entry);
    if (!entry.restorable && !window.confirm((form.getAttribute("data-confirm") || "이 기록을 삭제할까요?") + "\n지운 뒤에는 되돌릴 수 없습니다.")) return;
    entry.button = button; entry.row = rowFor(entry, form); active = entry; hadDeleteInteraction = true;
    var dialog = form.closest("dialog");
    if (dialog && dialog.open) dialog.close();
    var day = form.closest(".abDayDetailOverlay");
    if (day) { var close = day.querySelector("[data-ab-day-close]"); if (close) close.click(); }
    if (entry.row) { entry.row.setAttribute("data-ab-delete-pending", ""); entry.row.setAttribute("aria-busy", "true"); }
    send(entry);
    if (toast) toast.focus({ preventScroll: true });
  }
  document.addEventListener("click", function (event) {
    var button = event.target.closest && event.target.closest("button,input[type=submit]");
    if (button && isDelete(button.form || button.closest("form"), button)) button.removeAttribute("onclick");
  }, true);
  document.addEventListener("submit", function (event) {
    var form = event.target, button = event.submitter;
    if (!isDelete(form, button)) return;
    event.preventDefault(); event.stopImmediatePropagation();
    start(form, button);
  }, true);
  window.addEventListener("pagehide", function () { away = true; clearTimeout(dismissTimer); });
  window.addEventListener("pageshow", function (event) {
    away = false;
    if (event.persisted && hadDeleteInteraction) { location.reload(); return; }
    controls();
  });
  new MutationObserver(function () { controls(); syncNoticeContainer(); }).observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["open", "hidden", "aria-hidden", "class"] });
  readStorage(); controls(); showUnresolved();
  var restored = Object.keys(unresolved).map(function (id) { return unresolved[id]; });
  var currentHousehold = currentHouseholdId();
  if (restored.some(function (entry) { return entry.household_id === currentHousehold; }) && document.querySelector(".txTabHead,.v8-tx,.homeCalendar,.v8-edit")) hadDeleteInteraction = true;
  restored.filter(function (entry) { return entry.household_id === currentHousehold; }).forEach(checkPresence);
}
// @build:exports-start
export { accountbookTransactionDeleteClientMain, accountbookTransactionFilterClientMain };
// @build:exports-end
