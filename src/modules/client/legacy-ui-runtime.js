// @build:imports-start
import {
  parseMobileAmountText, quickInputDate, transactionTypeFromText,
} from "./shared-input-parsers.js";
import { escapeHtml } from "../domain/transactions-core.js";
// @build:imports-end

function mobileUiUxClientMain() {
  "use strict";

  function normalizeText(value) {
    return String(value || "")
      .replace(/[~!@#$%^&*_=+\x60|\\{}\[\]:;"'<>?]/g, " ")
      .replace(/[()]/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function detectType(text) { return transactionTypeFromText(text); }

  function detectPayment(text) {
    const options = Array.from(document.querySelectorAll("#paymentList option"))
      .map(function(option) { return String(option.value || "").trim(); })
      .filter(Boolean)
      .sort(function(a, b) { return b.length - a.length; });
    for (let i = 0; i < options.length; i += 1) {
      if (text.indexOf(options[i]) >= 0) return options[i];
    }
    const brands = ["신한", "현대", "삼성", "국민", "KB", "우리", "롯데", "하나", "농협", "NH", "BC", "비씨", "카카오", "토스"];
    for (let i = 0; i < brands.length; i += 1) {
      if (new RegExp(brands[i] + "\\s*카드", "i").test(text)) {
        const upper = brands[i].toUpperCase();
        return ["KB", "NH", "BC"].includes(upper) ? upper + "카드" : brands[i] + "카드";
      }
    }
    if (/삼성\s*페이|삼페/.test(text)) return "삼성페이";
    if (/카카오\s*페이|카페이/.test(text)) return "카카오페이";
    if (/네이버\s*페이|네페/.test(text)) return "네이버페이";
    if (/애플\s*페이|애플페이/.test(text)) return "애플페이";
    if (/현금/.test(text)) return "현금";
    if (/계좌|이체|송금|자동이체|무통장/.test(text)) return "계좌이체";
    if (/체크/.test(text)) return "체크카드";
    if (/신용/.test(text)) return "신용카드";
    if (/카드/.test(text)) return "카드";
    return "";
  }

  function detectCategory(text, type) {
    // 규칙은 서버 정본(AB_CATEGORY_RULES)에서 온다. 여기 목록을 다시 적으면
    // 예전처럼 같은 문장에 다른 분류가 나온다.
    var rules = window.AB_CATEGORY_RULES || [];
    text = String(text || "").toLowerCase();
    var toks = text.split(/[^a-z0-9가-힣]+/).filter(Boolean);
    var best = null;
    for (var i = 0; i < rules.length; i += 1) {
      var rule = rules[i];
      if (rule.type !== type) continue;
      var score = 0;
      for (var j = 0; j < rule.words.length; j += 1) {
        var word = rule.words[j];
        if (word && text.indexOf(word) >= 0) score += rule.weight + Math.min(word.length, 8);
      }
      var exact = rule.exact || [];
      for (var k = 0; k < exact.length; k += 1) {
        if (toks.indexOf(exact[k]) >= 0) score += rule.weight + Math.min(exact[k].length, 8);
      }
      if (score > 0 && (!best || score > best.score)) best = { name: rule.name, score: score };
    }
    if (best) return best.name;
    return type === "income" ? "기타수입" : "";
  }

  function cleanMemo(text, payment) {
    let value = normalizeText(text)
      .replace(/(?:오늘|어제|그저께|그제|금일|방금)/g, " ")
      .replace(/(?:20\d{2}[.\-/년\s]+)?\d{1,2}[.\-/월\s]+\d{1,2}\s*일?/g, " ")
      .replace(/\d+(?:[.,]\d+)?\s*(?:억|만|천|백)?\s*원?/g, " ")
      .replace(/(?:수입|입금|지출|출금)\b/g, " ");
    if (payment) value = value.split(payment).join(" ");
    value = value
      .replace(/(?:신한|현대|삼성|국민|KB|우리|롯데|하나|농협|NH|BC|비씨|카카오|토스)\s*카드/gi, " ")
      .replace(/현금|계좌이체|체크카드|신용카드|카드/g, " ");
    return normalizeText(value).slice(0, 80);
  }

  function formatAmount(value) {
    const number = Math.max(0, Number(value || 0));
    return number ? new Intl.NumberFormat("ko-KR").format(number) : "";
  }

  function applySmartInput(event) {
    if (event) {
      event.preventDefault();
      event.stopImmediatePropagation();
    }
    const smart = document.getElementById("smartInput");
    const amount = document.getElementById("amountInput");
    const memo = document.getElementById("memoInput");
    const payment = document.getElementById("payInput");
    const category = document.getElementById("catInput");
    if (!smart || !amount || !memo) return;
    const raw = normalizeText(smart.value);
    const parsedAmount = parseMobileAmountText(raw);
    const dateInput = document.getElementById("txDate");
    const parsedDate = quickInputDate(raw);
    if (dateInput && parsedDate) dateInput.value = parsedDate;
    const type = detectType(raw);
    const parsedPayment = detectPayment(raw);
    const parsedCategory = detectCategory(raw, type);
    const parsedMemo = cleanMemo(raw, parsedPayment);
    const radio = document.querySelector('input[name="type"][value="' + type + '"]');
    if (radio) radio.checked = true;
    amount.value = formatAmount(parsedAmount);
    memo.value = parsedMemo || raw;
    if (payment && parsedPayment) payment.value = parsedPayment;
    if (category && parsedCategory) category.value = parsedCategory;
    const rawInput = document.getElementById("rawTextInput");
    if (rawInput) rawInput.value = raw;
    const status = document.querySelector(".smartHint");
    if (status) {
      status.setAttribute("aria-live", "polite");
      status.textContent = parsedAmount
        ? formatAmount(parsedAmount) + "원 · " + (type === "income" ? "수입" : "지출") + "로 채웠어요. 저장 전 내용을 확인해주세요."
        : "금액을 찾지 못했어요. ‘점심 12000원’처럼 금액을 함께 입력해주세요.";
    }
    if (!parsedAmount) amount.focus();
  }

  const smartInput = document.getElementById("smartInput");
  if (smartInput) {
    smartInput.addEventListener("keydown", function(event) {
      if (event.key === "Enter") applySmartInput(event);
    }, true);
  }
  const amountInput = document.getElementById("amountInput");
  if (amountInput) {
    amountInput.addEventListener("input", function() {
      const raw = String(amountInput.value || "").replace(/[^0-9]/g, "");
      amountInput.value = raw ? formatAmount(raw) : "";
    });
  }

  window.openEdit = function openEdit(id) {
    const item = document.getElementById("tx-" + String(id || ""));
    if (!item) {
      location.hash = "feed";
      return;
    }
    const details = item.querySelector("details");
    if (details) details.open = true;
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = details ? details.querySelector("summary") : item;
    if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    history.replaceState(null, "", "#tx-" + String(id || ""));
  };

  function canonicalBottomItems() {
    const params = new URLSearchParams(location.search);
    const month = params.get("month") || new Date(Date.now() + 32400000).toISOString().slice(0, 7);
    const household = params.get("household_id") || "";
    const query = "month=" + encodeURIComponent(month) + (household ? "&household_id=" + encodeURIComponent(household) : "");
    return [
      { key: "home", icon: "⌂", label: "홈", href: "/app?" + query },
      { key: "records", icon: "📄", label: "기록", href: "/app?" + query + "&tab=transactions" },
      { key: "add", icon: "＋", label: "입력", href: "/app?" + query + "#add" },
      { key: "settlement", icon: "↔", label: "정산", href: "/settlement-summary?" + query },
      { key: "menu", icon: "☰", label: "메뉴", href: "/menu?" + query },
    ];
  }

  function activeBottomKey() {
    if (location.pathname.indexOf("settlement") >= 0) return "settlement";
    if (location.pathname === "/menu" || location.pathname.indexOf("/my/profile") === 0 || location.pathname.indexOf("/my/settings") === 0) return "menu";
    if (location.hash === "#add") return "add";
    if (location.pathname === "/app" && (location.hash === "#feed" || new URLSearchParams(location.search).get("tab") === "transactions")) return "records";
    if (location.pathname === "/app") return "home";
    return "";
  }

  function fillBottomNav(nav) {
    const active = activeBottomKey();
    nav.setAttribute("aria-label", "주요 메뉴");
    nav.innerHTML = canonicalBottomItems().map(function(item) {
      const on = item.key === active;
      return '<a data-key="' + item.key + '" class="' + (on ? "active " : "") + (item.key === "add" ? "abPrimary" : "") + '" ' + (on ? 'aria-current="page"' : "") + ' href="' + item.href + '"><i>' + item.icon + '</i><span>' + item.label + "</span></a>";
    }).join("");
  }

  function syncBottomNav(nav) {
    if (!nav) return;
    const active = activeBottomKey();
    Array.from(nav.querySelectorAll("a[data-key]")).forEach(function(link) {
      const on = link.getAttribute("data-key") === active;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  const appBottom = document.querySelector("nav.bottom");
  if (appBottom) {
    fillBottomNav(appBottom);
    window.addEventListener("hashchange", function() { syncBottomNav(appBottom); });
    appBottom.addEventListener("click", function() { setTimeout(function() { syncBottomNav(appBottom); }, 0); });
  }
  const unifiedBottom = document.querySelector("nav.abNavBottom");
  if (unifiedBottom) {
    unifiedBottom.setAttribute("aria-label", "주요 메뉴");
    syncBottomNav(unifiedBottom);
    window.addEventListener("hashchange", function() { syncBottomNav(unifiedBottom); });
    unifiedBottom.addEventListener("click", function() { setTimeout(function() { syncBottomNav(unifiedBottom); }, 0); });
  }
  if (!appBottom && !unifiedBottom && document.querySelector(".appMenu")) {
    const nav = document.createElement("nav");
    nav.className = "abUxBottom";
    fillBottomNav(nav);
    document.body.appendChild(nav);
    document.body.classList.add("abHasUxBottom");
  }

  const mobileToggle = document.querySelector(".abNavMobileTop button");
  const mobileDrawer = document.querySelector(".abNavMobileDrawer");
  if (mobileToggle && mobileDrawer) {
    mobileDrawer.id = mobileDrawer.id || "abMobileNavDrawer";
    mobileToggle.setAttribute("aria-controls", mobileDrawer.id);
    const syncExpanded = function() {
      mobileToggle.setAttribute("aria-expanded", document.body.classList.contains("abMobileNavOpen") ? "true" : "false");
    };
    syncExpanded();
    new MutationObserver(syncExpanded).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  Array.from(document.querySelectorAll(".abNavBody, .abNavMobileDrawer")).forEach(function(nav) {
    const groups = Array.from(nav.children).filter(function(child) { return child.matches && child.matches("details.abNavGroup"); });
    groups.forEach(function(group) {
      group.addEventListener("toggle", function() {
        if (!group.open) return;
        groups.forEach(function(other) {
          if (other !== group) other.open = false;
        });
      });
    });
  });
}

function mobileShellUiClientMain() {
  "use strict";
  window.openEdit = function openEdit(id) {
    const item = document.getElementById("tx-" + String(id || ""));
    if (!item) {
      location.hash = "feed";
      return;
    }
    const details = item.querySelector("details");
    if (details) details.open = true;
    item.scrollIntoView({ behavior: "smooth", block: "center" });
    const target = details ? details.querySelector("summary") : item;
    if (target && typeof target.focus === "function") target.focus({ preventScroll: true });
    history.replaceState(null, "", "#tx-" + String(id || ""));
  };

  function canonicalBottomItems() {
    const params = new URLSearchParams(location.search);
    const month = params.get("month") || new Date(Date.now() + 32400000).toISOString().slice(0, 7);
    const household = params.get("household_id") || "";
    const query = "month=" + encodeURIComponent(month) + (household ? "&household_id=" + encodeURIComponent(household) : "");
    return [
      { key: "home", icon: "⌂", label: "홈", href: "/app?" + query },
      { key: "records", icon: "📄", label: "기록", href: "/app?" + query + "&tab=transactions" },
      { key: "add", icon: "＋", label: "입력", href: "/app?" + query + "#add" },
      { key: "settlement", icon: "↔", label: "정산", href: "/settlement-summary?" + query },
      { key: "menu", icon: "☰", label: "메뉴", href: "/menu?" + query },
    ];
  }

  function activeBottomKey() {
    if (location.pathname.indexOf("settlement") >= 0) return "settlement";
    if (location.pathname === "/menu" || location.pathname.indexOf("/my/profile") === 0 || location.pathname.indexOf("/my/settings") === 0) return "menu";
    if (location.hash === "#add") return "add";
    if (location.pathname === "/app" && (location.hash === "#feed" || new URLSearchParams(location.search).get("tab") === "transactions")) return "records";
    if (location.pathname === "/app") return "home";
    return "";
  }

  function fillBottomNav(nav) {
    const active = activeBottomKey();
    nav.setAttribute("aria-label", "주요 메뉴");
    nav.innerHTML = canonicalBottomItems().map(function(item) {
      const on = item.key === active;
      return '<a data-key="' + item.key + '" class="' + (on ? "active " : "") + (item.key === "add" ? "abPrimary" : "") + '" ' + (on ? 'aria-current="page"' : "") + ' href="' + item.href + '"><i>' + item.icon + "</i><span>" + item.label + "</span></a>";
    }).join("");
  }

  function syncBottomNav(nav) {
    if (!nav) return;
    const active = activeBottomKey();
    Array.from(nav.querySelectorAll("a[data-key]")).forEach(function(link) {
      const on = link.getAttribute("data-key") === active;
      link.classList.toggle("active", on);
      if (on) link.setAttribute("aria-current", "page");
      else link.removeAttribute("aria-current");
    });
  }

  const appBottom = document.querySelector("nav.bottom");
  if (appBottom) {
    fillBottomNav(appBottom);
    window.addEventListener("hashchange", function() { syncBottomNav(appBottom); });
    appBottom.addEventListener("click", function() { setTimeout(function() { syncBottomNav(appBottom); }, 0); });
  }
  const unifiedBottom = document.querySelector("nav.abNavBottom");
  if (unifiedBottom) {
    unifiedBottom.setAttribute("aria-label", "주요 메뉴");
    syncBottomNav(unifiedBottom);
    window.addEventListener("hashchange", function() { syncBottomNav(unifiedBottom); });
    unifiedBottom.addEventListener("click", function() { setTimeout(function() { syncBottomNav(unifiedBottom); }, 0); });
  }
  if (!appBottom && !unifiedBottom && document.querySelector(".appMenu")) {
    const nav = document.createElement("nav");
    nav.className = "abUxBottom";
    fillBottomNav(nav);
    document.body.appendChild(nav);
    document.body.classList.add("abHasUxBottom");
  }

  const mobileToggle = document.querySelector(".abNavMobileTop button");
  const mobileDrawer = document.querySelector(".abNavMobileDrawer");
  if (mobileToggle && mobileDrawer) {
    mobileDrawer.id = mobileDrawer.id || "abMobileNavDrawer";
    mobileToggle.setAttribute("aria-controls", mobileDrawer.id);
    const syncExpanded = function() {
      mobileToggle.setAttribute("aria-expanded", document.body.classList.contains("abMobileNavOpen") ? "true" : "false");
    };
    syncExpanded();
    new MutationObserver(syncExpanded).observe(document.body, { attributes: true, attributeFilter: ["class"] });
  }

  Array.from(document.querySelectorAll(".abNavBody, .abNavMobileDrawer")).forEach(function(nav) {
    const groups = Array.from(nav.children).filter(function(child) { return child.matches && child.matches("details.abNavGroup"); });
    groups.forEach(function(group) {
      group.addEventListener("toggle", function() {
        if (!group.open) return;
        groups.forEach(function(other) {
          if (other !== group) other.open = false;
        });
      });
    });
  });
}

const UIUX_RUNTIME_STYLE = '<style id="v2262UiUxStyle">:root{--ab-focus:#2563eb}html,body{max-width:100%;overflow-x:hidden}a:focus-visible,button:focus-visible,input:focus-visible,select:focus-visible,textarea:focus-visible,summary:focus-visible{outline:3px solid var(--ab-focus)!important;outline-offset:3px!important}.srOnly{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}.homeTx:is(button){width:100%;border:0;background:transparent;color:inherit;font:inherit;text-align:left;cursor:pointer}.homeTx:is(button):hover{background:#f8fafc}.topLine h1{margin:0;font-size:19px;font-weight:950;line-height:1.2}.metricBasis{max-width:1180px;margin:-4px auto 12px;color:#64748b;font-size:12px;line-height:1.5;padding:0 4px}.abUxBottom{display:none}.bottom a.abPrimary i,.abNavBottom a.abPrimary i,.abUxBottom a.abPrimary i{width:36px;height:36px;border-radius:14px;background:#FEE500;color:#191919;display:grid;place-items:center;font-size:23px;line-height:1;box-shadow:0 6px 14px rgba(250,204,21,.25)}@media(max-width:1023px){.abNavMobileTop button,.chipRow button,.dateChip{min-height:44px!important}body.abHasUxBottom{padding-bottom:calc(116px + env(safe-area-inset-bottom,0px))!important}.abUxBottom{position:fixed;left:0;right:0;bottom:0;z-index:2200;height:calc(72px + env(safe-area-inset-bottom,0px));padding-bottom:env(safe-area-inset-bottom,0px);background:rgba(255,255,255,.97);backdrop-filter:blur(18px);border-top:1px solid #eef0f3;display:grid;grid-template-columns:repeat(5,minmax(0,1fr));font-family:-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif}.abUxBottom a{display:flex;flex-direction:column;gap:3px;align-items:center;justify-content:center;color:#8b95a1;text-decoration:none;font-size:11px;font-weight:850;min-width:0;min-height:48px;position:relative}.abUxBottom a i{font-style:normal;font-size:20px;line-height:1}.abUxBottom a.active{color:#111827}.abUxBottom a.active:before{content:"";position:absolute;top:0;left:50%;transform:translateX(-50%);width:26px;height:3px;border-radius:0 0 4px 4px;background:#FEE500}}@media(prefers-reduced-motion:reduce){html{scroll-behavior:auto!important}*,*:before,*:after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important;scroll-behavior:auto!important}}</style>';

const V2281_GUIDED_UIUX_STYLE = `<style id="v2281GuidedUiUxStyle">
:root{--ab-bg:#f6f8fb;--ab-surface:#fff;--ab-text:#17233c;--ab-muted:#667085;--ab-line:#e2e8f0;--ab-blue:#2563eb;--ab-blue-hover:#1d4ed8;--ab-blue-soft:#eaf2ff;--ab-mint:#2dbe9d;--ab-mint-soft:#e9f8f3;--ab-danger:#c2413b;--ab-warning:#b45309;--ab-radius:16px;--ab-shadow:0 4px 16px rgba(23,35,60,.05)}
html{background:var(--ab-bg);font-size:16px}
body.abV2281{background:var(--ab-bg)!important;color:var(--ab-text)!important;font-family:Pretendard,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans KR",sans-serif!important;font-weight:400;line-height:1.55;letter-spacing:-.018em}
.abV2281 h1,.abV2281 h2,.abV2281 h3{color:inherit;letter-spacing:-.035em;line-height:1.28;font-weight:700!important}
.abV2281 h1{font-size:clamp(24px,2.4vw,34px)}.abV2281 h2{font-size:20px}.abV2281 h3{font-size:16px}
.abV2281 b,.abV2281 strong{font-weight:700}.abV2281 p{word-break:keep-all}.abV2281 .muted,.abV2281 .note{color:var(--ab-muted)!important;font-weight:400!important;line-height:1.62}
.abV2281 a{text-underline-offset:3px}.abV2281 main.wrap{width:min(100%,1180px)!important;margin-inline:auto!important}
.abAppSurface main.wrap{padding:28px 24px 120px!important}
.abAppSurface .hero{background:var(--ab-surface)!important;color:var(--ab-text)!important;border:1px solid var(--ab-line)!important;border-radius:var(--ab-radius)!important;box-shadow:var(--ab-shadow)!important;padding:24px!important;margin:0 0 20px!important}
.abAppSurface .hero p,.abAppSurface .hero .note,.abAppSurface .hero .muted{color:var(--ab-muted)!important;opacity:1!important}
.abAppSurface .card,.abAppSurface .panel,.abAppSurface .group{background:var(--ab-surface)!important;border:1px solid var(--ab-line)!important;border-radius:var(--ab-radius)!important;box-shadow:var(--ab-shadow)!important;padding:22px!important;margin:16px 0!important;min-width:0}
.abAppSurface .metric{border:1px solid var(--ab-line)!important;border-radius:14px!important;box-shadow:none!important;background:#fff!important;padding:16px!important}
.abAppSurface .metric span,.abAppSurface .metric small{color:var(--ab-muted)!important;font-weight:500!important}.abAppSurface .metric b{font-size:24px!important;font-weight:700!important;font-variant-numeric:tabular-nums}
.abV2281 input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]),.abV2281 select,.abV2281 textarea{min-height:46px!important;border:1px solid #cfd8e6!important;border-radius:11px!important;background:#fff!important;color:var(--ab-text)!important;padding:0 12px!important;font:inherit!important;font-weight:500!important;box-shadow:none!important}
.abV2281 textarea{padding-block:11px!important}.abV2281 input::placeholder,.abV2281 textarea::placeholder{color:#98a2b3!important;font-weight:400!important}
.abV2281 label{color:#475467!important;font-size:13px!important;font-weight:600!important;line-height:1.4}
.abV2281 button,.abV2281 .btn,.abV2281 .primaryBtn,.abV2281 .savePlan{min-height:44px;border-radius:11px!important;font-weight:650!important;letter-spacing:-.015em;transition:background var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),transform var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),box-shadow var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}
.abV2281 button[type="submit"]:not(.danger):not(.delBtn):not(.secondary),.abV2281 .btn:not(.light):not(.soft):not(.danger):not(.secondary),.abV2281 .primaryBtn,.abV2281 .savePlan{background:var(--ab-blue)!important;color:#fff!important;border-color:var(--ab-blue)!important}
.abV2281 button:not(:disabled):hover,.abV2281 .btn:hover{transform:translateY(-1px);box-shadow:0 7px 18px rgba(37,99,235,.15)}
.abV2281 button:disabled{opacity:.62;cursor:wait}.abV2281 .danger,.abV2281 .delBtn,.abV2281 .dangerZone button[type="submit"]{background:#fff1f0!important;color:var(--ab-danger)!important;border-color:#f3c7c4!important}
.abV2281 .btn.light,.abV2281 .btn.soft,.abV2281 .addLine,.abV2281 .secondary{background:var(--ab-blue-soft)!important;color:#1d4ed8!important;border:1px solid #c8d9ff!important}
.abV2281 .notice,.abV2281 .tip,.abV2281 .guide,.abV2281 .guideLine,.abV2281 .privacyNote,.abV2281 .warnBox,.abV2281 .legacy{border-radius:12px!important;padding:12px 14px!important;line-height:1.6!important;font-weight:400!important}
.abV2281 .tableWrap{border:1px solid var(--ab-line);border-radius:13px;overflow:auto;background:#fff}.abV2281 table{background:#fff!important}.abV2281 th{background:#f8fafc;color:#667085!important;font-weight:600!important}.abV2281 th,.abV2281 td{border-color:#edf1f6!important;padding:12px!important}.abV2281 tr:last-child td{border-bottom:0!important}
.abV2281 details>summary{list-style:none}.abV2281 details>summary::-webkit-details-marker{display:none}.abV2281 details>summary{cursor:pointer}.abV2281 .empty,.abV2281 .homeEmpty{background:#f8fafc!important;border:1px dashed #cbd5e1!important;border-radius:12px!important;color:var(--ab-muted)!important;text-align:center;padding:20px!important}
.abPageAssets .hero{background:linear-gradient(135deg,#0b1739,#153878)!important;color:#fff!important;border:0!important}.abPageAssets .hero p,.abPageAssets .hero .note,.abPageAssets .hero .heroLabel,.abPageAssets .hero .heroDelta{color:#dbeafe!important}.abPageAssets .heroChips span{background:rgba(255,255,255,.1)!important;border-color:rgba(255,255,255,.2)!important;color:#fff!important}
.abPageAssets .assetEmptyMain{display:grid;grid-template-columns:auto minmax(0,1fr) auto;gap:14px;align-items:center}.abPageAssets .assetEmptyMark{width:44px;height:44px;border-radius:13px;background:var(--ab-blue-soft);color:var(--ab-blue);display:grid;place-items:center;font-size:24px;font-weight:600}.abPageAssets .assetEmptyMain h2,.abPageAssets .assetEmptyMain p{margin:0}.abPageAssets .emptyCta{display:inline-flex;align-items:center;justify-content:center;min-height:42px;border-radius:11px;background:var(--ab-blue);color:#fff;text-decoration:none;font-weight:650;padding:0 14px;white-space:nowrap}.abPageAssets .compactPresets{padding-top:12px;border-top:1px solid var(--ab-line)}
.abPageAssets .assetAddHead{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.abPageAssets .assetAddHead h2,.abPageAssets .assetAddHead p{margin:4px 0 0}.abPageAssets .sectionKicker{color:var(--ab-blue);font-size:12px;font-weight:650}.abPageAssets .timeBadge{background:#f2f4f7;color:#667085;border-radius:999px;padding:5px 9px;font-size:12px;font-weight:600;white-space:nowrap}.abPageAssets .assetKindField{border:0;padding:0;margin:20px 0 0}.abPageAssets .assetKindField legend,.abPageAssets .assetFormStep h3{font-size:14px;font-weight:650;color:#344054;margin:0 0 10px}.abPageAssets .primaryKinds{grid-template-columns:repeat(6,minmax(0,1fr))}.abPageAssets .kindMore{margin-top:10px}.abPageAssets .kindMore>summary{display:inline-flex;align-items:center;color:#475467;font-size:13px;font-weight:600;padding:7px 0}.abPageAssets .kindMore[open]>summary{color:var(--ab-blue)}.abPageAssets .assetFormStep{border-top:1px solid var(--ab-line);margin-top:18px;padding-top:18px}.abPageAssets .assetCoreGrid{display:grid;grid-template-columns:1fr 1fr;gap:12px}.abPageAssets .assetCoreGrid label,.abPageAssets .assetOptionalGrid label{display:grid;gap:6px}.abPageAssets .assetCoreGrid label small{color:var(--ab-muted);font-size:11px;font-weight:400}.abPageAssets .assetOptional{margin-top:12px;border:1px solid var(--ab-line);border-radius:12px;padding:11px 13px;background:#fbfcfe}.abPageAssets .assetOptional>summary{font-size:13px;font-weight:600;color:#475467}.abPageAssets .assetOptional>summary span{color:#98a2b3;font-size:11px;margin-left:4px}.abPageAssets .assetOptionalGrid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-top:12px}.abPageAssets .assetOptionalGrid .chk{display:flex;align-items:center;gap:8px;background:#fff;border:1px solid var(--ab-line);border-radius:11px;padding:0 12px;min-height:46px}.abPageAssets .assetOptionalGrid .chk small{display:block;color:var(--ab-muted);font-weight:400}.abPageAssets .assetFormAction{display:flex;align-items:center;justify-content:flex-end;gap:18px;margin-top:16px}.abPageAssets .assetFormAction p{margin:0;color:var(--ab-muted);font-size:12px}.abPageAssets .assetFormAction button{min-width:180px}.abPageAssets .privacyDisclosure{border-top:1px solid var(--ab-line);margin-top:18px;padding-top:12px}.abPageAssets .privacyDisclosure summary{color:#475467;font-size:13px;font-weight:600}.abPageAssets .privacyDisclosure p{color:var(--ab-muted);font-size:12px;margin:8px 0 0}
.abPageAssets .kindChip span{min-height:66px;justify-content:center;border-radius:12px!important;font-weight:600!important}.abPageAssets .kindChip span i{font-size:17px}.abPageAssets .kindChip input:checked+span{background:var(--ab-blue-soft)!important;border-color:var(--ab-blue)!important;color:#1d4ed8!important;box-shadow:0 0 0 2px rgba(37,99,235,.12)!important}
.abPageReserve .metricGrid{grid-template-columns:repeat(4,minmax(0,1fr))!important}.abPageReserve .formGrid{display:block!important}.abPageReserve .reservePrimaryGrid{display:grid;grid-template-columns:minmax(180px,1.5fr) minmax(150px,1fr) minmax(150px,1fr);gap:12px}.abPageReserve .reserveSchedule{display:grid;grid-template-columns:repeat(4,minmax(120px,1fr));gap:12px;margin-top:14px}.abPageReserve .reserveOptional{margin-top:14px;border-top:1px solid var(--ab-line);padding-top:12px}.abPageReserve .reserveOptional summary{color:#475467;font-weight:650}.abPageReserve .reserveOptionalGrid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:12px}.abPageReserve .reserveSubmit{display:flex;justify-content:flex-end;margin-top:16px}.abPageReserve .reserveSubmit button{min-width:180px}
.abPageBudgets .planGrid{gap:22px!important}.abPageBudgets .planColumn{border:1px solid var(--ab-line);border-radius:14px;padding:16px;background:#fbfcfe}.abPageBudgets .planLine{grid-template-columns:minmax(0,1.35fr) minmax(130px,.85fr)!important;gap:10px!important;margin:10px 0!important}.abPageBudgets .guide{background:transparent!important;border:0!important;color:var(--ab-muted)!important;padding:4px 0!important}.abPageBudgets .calculationHelp{margin-top:14px;color:var(--ab-muted)}.abPageBudgets .calculationHelp summary{font-weight:600;color:#475467}.abPageBudgets .calculationHelp p{margin:8px 0 0;font-size:13px}.abPageBudgets .metrics{grid-template-columns:repeat(3,minmax(0,1fr))!important}
.abPageMenu .menuIntro{display:grid;grid-template-columns:1fr auto;gap:16px;align-items:center}.abPageMenu .menuSteps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin-top:16px}.abPageMenu .menuStep{border:1px solid var(--ab-line);border-radius:12px;padding:12px;background:#fff}.abPageMenu .menuStep b{display:block}.abPageMenu .menuStep span{display:block;color:var(--ab-muted);font-size:12px;margin-top:3px}.abPageMenu .menuCard{background:#fff!important;border-radius:12px!important;padding:14px!important;box-shadow:none!important;transition:border-color var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),background var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}.abPageMenu .menuCard:hover{border-color:#9dbbff!important;background:#f8fbff!important}.abPageMenu .menuCard b{font-size:15px!important}.abPageMenu .menuCard span{font-size:12.5px!important;margin-top:4px!important}
.abMobileAppSurface .appTop{background:rgba(255,255,255,.97)!important;border-color:var(--ab-line)!important}.abMobileAppSurface .homeBudget,.abMobileAppSurface .homeCard,.abMobileAppSurface .homeNotice,.abMobileAppSurface .panel{border-radius:16px!important;box-shadow:var(--ab-shadow)!important;border-color:var(--ab-line)!important}.abMobileAppSurface .homeQuick a{border-radius:13px!important;box-shadow:none!important}.abMobileAppSurface .homeOnboarding{background:#fff;border:1px solid var(--ab-line);border-radius:16px;padding:18px;margin:14px 0;box-shadow:var(--ab-shadow)}.abMobileAppSurface .homeOnboardingHead{display:flex;justify-content:space-between;gap:12px;align-items:start}.abMobileAppSurface .homeOnboardingHead h2{margin:0}.abMobileAppSurface .homeOnboardingHead span{color:var(--ab-blue);font-weight:650;font-size:13px;white-space:nowrap}.abMobileAppSurface .homeOnboardingSteps{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;margin-top:14px}.abMobileAppSurface .homeOnboardingStep{border:1px solid var(--ab-line);border-radius:12px;padding:12px;min-width:0}.abMobileAppSurface .homeOnboardingStep.current{border-color:#8fb1ff;background:#f5f8ff}.abMobileAppSurface .homeOnboardingStep.done{border-color:#a9e6d5;background:var(--ab-mint-soft)}.abMobileAppSurface .homeOnboardingStep b,.abMobileAppSurface .homeOnboardingStep small{display:block}.abMobileAppSurface .homeOnboardingStep small{color:var(--ab-muted);margin-top:3px}.abMobileAppSurface .homeOnboardingStep a{display:inline-flex;margin-top:9px;color:var(--ab-blue);font-weight:650;text-decoration:none;font-size:12px}
.abPageMenu .advancedGroup>summary{display:flex;align-items:center;justify-content:space-between;gap:12px}.abPageMenu .advancedGroup>summary h2{margin:0!important}.abPageMenu .advancedGroup>summary>span{color:var(--ab-muted);font-size:12px}.abPageMenu .advancedGroup[open]>summary{margin-bottom:14px}.abPageMenu .firstUseCard h2{margin-bottom:4px!important}
@media(max-width:900px){.abPageAssets .primaryKinds{grid-template-columns:repeat(3,minmax(0,1fr))}.abPageAssets .assetOptionalGrid{grid-template-columns:1fr 1fr}.abPageReserve .metricGrid{grid-template-columns:repeat(2,minmax(0,1fr))!important}.abPageReserve .reservePrimaryGrid,.abPageReserve .reserveSchedule,.abPageReserve .reserveOptionalGrid{grid-template-columns:1fr 1fr}.abPageBudgets .metrics{grid-template-columns:1fr 1fr!important}.abPageMenu .menuIntro{grid-template-columns:1fr}}
@media(max-width:760px){.abAppSurface main.wrap{padding:14px 12px 104px!important}.abAppSurface .hero,.abAppSurface .card,.abAppSurface .panel,.abAppSurface .group{padding:16px!important;border-radius:14px!important;margin:12px 0!important}.abAppSurface .hero h1{font-size:23px!important}.abPageAssets .assetEmptyMain{grid-template-columns:auto 1fr}.abPageAssets .emptyCta{grid-column:1/-1;width:100%}.abPageAssets .assetCoreGrid,.abPageAssets .assetOptionalGrid{grid-template-columns:1fr}.abPageAssets .assetFormAction{display:grid;gap:8px}.abPageAssets .assetFormAction button{width:100%}.abPageReserve .metricGrid,.abPageReserve .reservePrimaryGrid,.abPageReserve .reserveSchedule,.abPageReserve .reserveOptionalGrid,.abPageBudgets .metrics,.abPageMenu .menuSteps,.abMobileAppSurface .homeOnboardingSteps{grid-template-columns:1fr!important}.abPageReserve .reserveSubmit button{width:100%}.abPageBudgets .planLine{grid-template-columns:1fr!important}.abPageBudgets .planColumn{padding:13px}.abV2281 .tableWrap:before{content:"표는 좌우로 밀어서 전체 내용을 볼 수 있어요";display:block;padding:8px 11px;color:var(--ab-muted);font-size:11px;background:#f8fafc;border-bottom:1px solid var(--ab-line)}}
@media(prefers-reduced-motion:reduce){.abV2281 *{scroll-behavior:auto!important;transition:none!important;animation:none!important}}
</style>`;

const V2284_UI_REVALIDATION_STYLE = `<style id="v2284UiRevalidationStyle">
:root{--ab-bg:#f7f8fa;--ab-surface:#fff;--ab-text:#172033;--ab-muted:#5f6b7a;--ab-line:#dde3ea;--ab-blue:#2457d6;--ab-blue-hover:#1945b8;--ab-primary:#2457d6;--ab-primary-soft:#edf3ff;--ab-positive:#087a55;--ab-negative:#c0362c;--ab-warn:#a15c00;--ab-shadow-soft:0 2px 10px rgba(15,23,42,.045)}
*,*:before,*:after{box-sizing:border-box}
body.abV2281{background:var(--ab-bg)!important;color:var(--ab-text)!important}
.abAppSurface .hero,.abAppSurface .card,.abAppSurface .panel,.abAppSurface .group{border-color:var(--ab-line)!important;box-shadow:var(--ab-shadow-soft)!important}
.abAppSurface .hero{padding:22px!important}.abAppSurface .card,.abAppSurface .panel,.abAppSurface .group{padding:20px!important}
.abV2281 button[type="submit"]:not(.danger):not(.delBtn):not(.secondary),.abV2281 form button:not([type]):not(.danger):not(.delBtn):not(.secondary):not(.light):not(.soft):not(.kwAdd):not(.kwRemove):not(.dateChip):not(.homeTx),.abV2281 .btn:not(.light):not(.soft):not(.danger):not(.secondary),.abV2281 .primaryButton,.abV2281 .primaryBtn,.abV2281 .savePlan{background:var(--ab12-action,#2457d6)!important;color:#fff!important;border-color:var(--ab12-action,#2457d6)!important}
.abV2281 .abNavBrandText small,.abV2281 .abNavGroup summary i,.abV2281 .appMenu .navGroupTitle{color:#5f6b7a!important;opacity:1!important}.abV2281 .dataNote{color:#5f6b7a!important}
.abV2281 .memberFoot small{color:#5f6b7a!important}
.abV2281 .ckNum{background:#087a55!important;color:#fff!important}.abPageAssets .groupHead .cnt,.abPageAssets .groupSum small,.abPageAssets .rowVal small,.abPageAssets .chev,.abPageAssets .assetOptional>summary span{color:#5f6b7a!important}.abPageAssets .sectionKicker{color:#1945b8!important}.abPageAssets .kindChip span{color:#344054!important}.abPageAssets .kindChip input:checked+span{color:#1945b8!important}
.abV2281 button:not(:disabled):hover,.abV2281 .btn:hover{box-shadow:0 4px 12px rgba(36,87,214,.12);transform:none}
.abV2281 input:not([type="radio"]):not([type="checkbox"]):not([type="hidden"]):focus,.abV2281 select:focus,.abV2281 textarea:focus{border-color:#7293e6!important;box-shadow:0 0 0 3px rgba(36,87,214,.12)!important;outline:0!important}
.abV2281 .notice,.abV2281 .tip,.abV2281 .guide,.abV2281 .guideLine,.abV2281 .privacyNote{background:#f4f7fb!important;border-color:#dbe3ee!important;color:#475467!important}

/* 모바일 홈: 파란 면을 정보 카드와 선택 상태로 분리합니다. */
.abMobileAppSurface .homeBudget,.abMobileAppSurface .homeMetric,.abMobileAppSurface .homeCard,.abMobileAppSurface .panel{background:#fff!important;border:1px solid var(--ab-line)!important;border-radius:16px!important;box-shadow:var(--ab-shadow-soft)!important}
.abMobileAppSurface .homeBudget{background:#fff!important;padding:20px!important}.abMobileAppSurface .homeBudget:after{display:none!important}
.abMobileAppSurface .homeBudgetTop span,.abMobileAppSurface .homeBudgetAmount small,.abMobileAppSurface .homeBudgetFoot,.abMobileAppSurface .homeMetric span,.abMobileAppSurface .homeMetric small,.abMobileAppSurface .homeBarRow span{color:#5f6b7a!important}.abMobileAppSurface .income{color:#087a55!important}
.abMobileAppSurface .homeToday b[style*="#059669"]{color:#087a55!important}
.abMobileAppSurface .homeBudgetTop em{background:#fff7cc!important;color:#664d00!important;border:1px solid #f2dc7d!important;box-shadow:none!important}
.abMobileAppSurface .homeProgress,.abMobileAppSurface .homeBar{background:#edf1f5!important}.abMobileAppSurface .homeProgress i{background:var(--ab12-action,#2457d6)!important}
.abMobileAppSurface .homeQuick{gap:8px}.abMobileAppSurface .homeQuick a{min-height:64px;padding:11px 7px!important;background:#fff!important;border:1px solid var(--ab-line)!important;border-radius:13px!important;box-shadow:none!important}.abMobileAppSurface .homeQuick a:hover{background:#f8fafc!important;border-color:#b8c5d6!important;transform:none}.abMobileAppSurface .homeQuick b{color:#172033!important}.abMobileAppSurface .homeQuick span{color:#667085!important}
.abMobileAppSurface .homeGrid{grid-template-columns:minmax(0,1.45fr) minmax(280px,.75fr);gap:12px}.abMobileAppSurface .homeCard{padding:16px!important}.abMobileAppSurface .homeCard h2{font-size:16px!important;color:#172033!important}
.abMobileAppSurface button.homeTx{display:flex!important;width:100%!important;min-height:62px!important;align-items:center!important;justify-content:space-between!important;gap:12px!important;padding:10px 4px!important;background:#fff!important;color:#172033!important;border:0!important;border-bottom:1px solid #edf1f5!important;border-radius:0!important;box-shadow:none!important;text-align:left!important;transform:none!important}.abMobileAppSurface button.homeTx:last-child{border-bottom:0!important}.abMobileAppSurface button.homeTx:hover{background:#f8fafc!important}.abMobileAppSurface .homeTxLeft{min-width:0}.abMobileAppSurface .homeIcon{flex:0 0 38px;width:38px;height:38px;border-radius:11px!important;background:#f1f5f9!important;box-shadow:none!important;color:#475467!important}.abMobileAppSurface .homeTx b{color:#172033!important;font-size:14px!important}.abMobileAppSurface .homeTx span{color:#667085!important;font-size:12px!important}.abMobileAppSurface .homeTxAmt{color:var(--ab-negative)!important;font-size:14px!important}.abMobileAppSurface .homeTxAmt.income{color:var(--ab-positive)!important}.abMobileAppSurface .homeTxAmt small{color:#5f6b7a!important}
.abMobileAppSurface .homeBar .bar0{background:#d84a43!important}.abMobileAppSurface .homeBar .bar1{background:var(--ab12-action,#2457d6)!important}.abMobileAppSurface .homeBar .bar2{background:#bf7300!important}.abMobileAppSurface .homeBar .bar3{background:#7c8797!important}
.abMobileAppSurface .homeNotice{margin:12px 0!important;padding:14px 16px!important;background:#eef8f5!important;color:#174b3c!important;border:1px solid #bfe2d7!important;border-radius:14px!important;box-shadow:none!important}.abMobileAppSurface .homeNotice:after{display:none!important}.abMobileAppSurface .homeNotice b{color:#087a55!important;font-size:11px!important;margin-bottom:4px!important}.abMobileAppSurface .homeNotice p{color:#174b3c!important;font-size:13px!important;font-weight:600!important}
.abMobileAppSurface .smartLine{grid-template-columns:minmax(0,1fr)!important}.abMobileAppSurface .chipRow{display:flex!important;flex-wrap:wrap!important;gap:7px!important}.abMobileAppSurface .chipRow button,.abMobileAppSurface .dateChip{width:auto!important;min-height:38px!important;border:1px solid #d7dee8!important;border-radius:999px!important;background:#fff!important;color:#344054!important;padding:0 12px!important;font-size:13px!important;font-weight:650!important;box-shadow:none!important;transform:none!important}.abMobileAppSurface .chipRow button:hover,.abMobileAppSurface .dateChip:hover,.abMobileAppSurface .dateChip.on{background:var(--ab-primary-soft)!important;color:#1d4ed8!important;border-color:#9eb7ef!important}.abMobileAppSurface .seg span{background:#f1f4f8!important;color:#475467!important;border:1px solid transparent!important}.abMobileAppSurface .seg input:checked+span{background:#172033!important;color:#fff!important;border-color:#172033!important}.abMobileAppSurface #add.panel .form>button[type="submit"]{background:var(--ab12-action,#2457d6)!important;color:#fff!important;border-color:var(--ab12-action,#2457d6)!important;border-radius:11px!important}


/* 키워드 편집기: 4열 카드와 파란 삭제 버튼을 접이식 2열 목록으로 교체합니다. */
.abPageKeywords .kwShell .keywordToolbar>button{background:var(--ab12-action,#2457d6)!important;color:#fff!important;border-color:var(--ab12-action,#2457d6)!important}.abPageKeywords .kwBox{background:#fff!important}.abPageKeywords .kwHead{color:#172033!important}.abPageKeywords .kwRemove{background:transparent!important;color:#b42318!important;border:0!important}.abPageKeywords .kwRemove:hover{background:#fee4e2!important}.abPageKeywords .kwAdd{background:#edf3ff!important;color:#1d4ed8!important;border:1px solid #bfd0f6!important}.abPageKeywords .kwChip{background:#f8fafc!important;color:#344054!important}.abPageKeywords .kwHint{color:#5f6b7a!important}.abPageKeywords .kwNewInput{background:#fff!important}.abPageKeywords .kwNoResult{border:1px dashed #cbd5e1;border-radius:12px;background:#f8fafc}

/* 파일 가져오기: 화면 진입 시에는 텍스트/CSV 흐름만 보여주고 무거운 변환기는 선택 시 준비합니다. */
.abPageBackup .hero{background:#fff!important;color:#172033!important;border:1px solid var(--ab-line)!important}.abPageBackup .hero p{color:#5f6b7a!important}.abPageBackup .fileStatus{background:#f4f7fb!important;color:#475467!important;border-color:#dbe3ee!important}

@media(max-width:900px){.abMobileAppSurface .homeGrid{grid-template-columns:1fr}.abPageKeywords .kwEditorGrid{grid-template-columns:1fr!important}}
@media(max-width:760px){.abAppSurface .hero{padding:17px!important}.abAppSurface .card,.abAppSurface .panel,.abAppSurface .group{padding:16px!important}.abMobileAppSurface .homeQuick{grid-template-columns:repeat(3,minmax(0,1fr))!important}.abMobileAppSurface .homeCard{padding:14px!important}.abMobileAppSurface button.homeTx{min-height:58px!important}.abMobileAppSurface .homeIcon{flex-basis:36px;width:36px;height:36px}.abMobileAppSurface .smartLine{grid-template-columns:1fr!important}}
@media(max-width:380px){.abMobileAppSurface .homeQuick{grid-template-columns:repeat(2,minmax(0,1fr))!important}.abMobileAppSurface .homeMetrics{grid-template-columns:1fr!important}.abMobileAppSurface .homeTxAmt{font-size:13px!important}}
</style>`;

function v2284UiStyleFor(html = "") {
  const source = String(html || "");
  let style = V2284_UI_REVALIDATION_STYLE;
  const stripSection = (start, end) => {
    const from = style.indexOf(start);
    const to = style.indexOf(end, from + start.length);
    if (from >= 0 && to > from) style = style.slice(0, from) + style.slice(to);
  };
  if (!source.includes("abMobileAppSurface")) stripSection("/* 모바일 홈", "/* 키워드");
  if (!source.includes("abPageKeywords")) stripSection("/* 키워드", "/* 파일 가져오기");
  if (!source.includes("abPageBackup")) stripSection("/* 파일 가져오기", "@media(max-width:900px)");
  return style;
}

const V2285_MENU_STYLE = `
.abPageMenu{background:#fff!important}.abPageMenu main.menuPage{width:min(100%,1280px)!important;max-width:1280px!important;padding:34px 34px 118px!important}
.abPageMenu .menuHeader{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:end;gap:28px;padding:4px 0 24px;border-bottom:1px solid #e7eaf0}.abPageMenu .menuEyebrow{display:block;color:#667085;font-size:12px;font-weight:650;margin-bottom:7px}.abPageMenu .menuHeader h1{font-size:34px!important;line-height:1.18!important;margin:0 0 7px!important;font-weight:800!important;color:#172033}.abPageMenu .menuHeader p{margin:0;color:#667085;font-size:15px;line-height:1.55}.abPageMenu .menuContext{display:grid;grid-template-columns:minmax(190px,1fr) 148px auto;gap:8px;align-items:center}.abPageMenu .menuContext select,.abPageMenu .menuContext input,.abPageMenu .menuContext button{min-height:44px!important;margin:0!important}.abPageMenu .menuContext button{white-space:nowrap;padding-inline:17px}
.abPageMenu .menuJourney{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0;padding:24px 0 28px}.abPageMenu .journeyStep{position:relative;display:grid;grid-template-columns:34px minmax(0,1fr);gap:10px;align-items:center;min-width:0;padding-right:34px}.abPageMenu .journeyStep:not(:last-child):after{content:"›";position:absolute;right:14px;top:50%;transform:translateY(-50%);color:#98a2b3;font-size:23px;font-weight:400}.abPageMenu .journeyNum{width:32px;height:32px;border-radius:50%;display:grid;place-items:center;background:#fff;border:1px solid #d6dce5;color:#667085;font-size:13px;font-weight:700}.abPageMenu .journeyStep:first-child .journeyNum{background:#dbeafe;border-color:#dbeafe;color:#1d4ed8}.abPageMenu .journeyCopy b{display:block;font-size:14px;font-weight:750;color:#172033}.abPageMenu .journeyCopy span{display:block;font-size:12px;color:#667085;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.abPageMenu .menuSection{margin:0!important;padding:0!important;background:transparent!important;border:0!important;border-radius:0!important;box-shadow:none!important}.abPageMenu .menuSectionHead{display:flex;align-items:end;justify-content:space-between;gap:14px;margin:0 0 12px}.abPageMenu .menuSectionHead h2{font-size:18px!important;line-height:1.3!important;font-weight:800!important;margin:0!important;color:#172033!important}.abPageMenu .menuSectionHead span{color:#667085;font-size:12px}.abPageMenu .featuredSection{padding:0 0 34px!important}.abPageMenu .featuredGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.abPageMenu .featuredCard{display:grid;grid-template-columns:44px minmax(0,1fr) 20px;align-items:center;gap:13px;min-height:88px;padding:16px 17px;text-decoration:none;color:#172033;background:#fff;border:1px solid #dce2ea;border-radius:15px;transition:border-color var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),box-shadow var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1)),transform var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}.abPageMenu .featuredCard:hover{border-color:#8eafea;box-shadow:0 8px 22px rgba(36,87,214,.08);transform:translateY(-1px)}.abPageMenu .featuredIcon{width:44px;height:44px;border-radius:13px;display:grid;place-items:center;background:#edf3ff;color:var(--ab12-action,#2457d6);font-size:21px;font-weight:750}.abPageMenu .featuredCopy b{display:block;font-size:16px;font-weight:750;color:#172033}.abPageMenu .featuredCopy span{display:block;margin-top:3px;color:#667085;font-size:12.5px}.abPageMenu .menuArrow{color:#98a2b3;font-size:18px;text-align:right}
.abPageMenu .menuSecondary{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:34px 52px}.abPageMenu .menuList{border-top:1px solid #e7eaf0}.abPageMenu .menuRow{display:grid;grid-template-columns:30px minmax(0,1fr) minmax(130px,.8fr) 18px;align-items:center;gap:10px;min-height:55px;padding:9px 2px;text-decoration:none;color:#172033;border-bottom:1px solid #e7eaf0}.abPageMenu .menuRow:hover .menuRowTitle{color:#1d4ed8}.abPageMenu .menuRowIcon{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;color:#7b8494;background:#f4f5f7;font-size:15px}.abPageMenu .menuRowTitle{font-size:14px;font-weight:700;transition:color var(--ab12-dur-fast,120ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}.abPageMenu .menuRowDesc{font-size:12px;color:#667085;text-align:right;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.abPageMenu .advancedGroup{grid-column:1/-1;margin:0!important;border:0!important;border-radius:0!important;background:transparent!important;padding:0!important;box-shadow:none!important}.abPageMenu .advancedGroup>summary{min-height:54px;border-top:1px solid #e7eaf0;border-bottom:1px solid #e7eaf0;padding:0 2px!important;list-style:none;display:flex;align-items:center;justify-content:space-between;gap:12px}.abPageMenu .advancedGroup>summary b{font-size:14px;font-weight:750;color:#172033}.abPageMenu .advancedGroup>summary span{font-size:12px;color:#667085}.abPageMenu .advancedGroup[open]>summary{margin-bottom:0!important}.abPageMenu .advancedGroup .menuList{border-top:0;display:grid;grid-template-columns:1fr 1fr;column-gap:52px}.abPageMenu .adminNote{margin:0 0 24px!important}
.abPageMenu .menuArrow{color:#667085;font-weight:600}.abPageMenu .menuRowIcon{color:#475467;font-weight:600}
@media(max-width:1100px){.abPageMenu main.menuPage{padding-inline:24px!important}.abPageMenu .menuHeader{grid-template-columns:1fr}.abPageMenu .menuContext{grid-template-columns:minmax(0,1fr) 150px auto}.abPageMenu .menuSecondary{gap:30px}}
@media(max-width:760px){.abPageMenu main.menuPage{padding:22px 16px 108px!important}.abPageMenu .menuHeader{gap:18px;padding-bottom:18px}.abPageMenu .menuHeader h1{font-size:28px!important}.abPageMenu .menuHeader p{font-size:14px}.abPageMenu .menuContext{grid-template-columns:minmax(0,1fr) minmax(0,1fr)}.abPageMenu .menuContext button{grid-column:1/-1;width:100%}.abPageMenu .menuJourney{padding:18px 0 24px}.abPageMenu .journeyStep{grid-template-columns:28px minmax(0,1fr);gap:7px;padding-right:20px}.abPageMenu .journeyStep:not(:last-child):after{right:6px}.abPageMenu .journeyNum{width:28px;height:28px}.abPageMenu .journeyCopy b{font-size:12px}.abPageMenu .journeyCopy span{display:none}.abPageMenu .featuredSection{padding-bottom:30px!important}.abPageMenu .featuredGrid{grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.abPageMenu .featuredCard{grid-template-columns:36px minmax(0,1fr);min-height:78px;padding:13px;gap:10px}.abPageMenu .featuredIcon{width:36px;height:36px;border-radius:11px;font-size:18px}.abPageMenu .featuredCopy b{font-size:14px}.abPageMenu .featuredCopy span{font-size:11px;line-height:1.35}.abPageMenu .featuredCard>.menuArrow{display:none}.abPageMenu .menuSecondary{grid-template-columns:1fr;gap:28px}.abPageMenu .menuRow{grid-template-columns:30px minmax(0,1fr) 18px}.abPageMenu .menuRowDesc{display:none}.abPageMenu .advancedGroup .menuList{grid-template-columns:1fr;column-gap:0}}
@media(max-width:350px){.abPageMenu .featuredGrid{grid-template-columns:1fr}.abPageMenu .menuContext{grid-template-columns:1fr}.abPageMenu .menuContext button{grid-column:auto}}
`;

const V2285_LOGIN_STYLE = `
.abPageLogin{background:#f4f6f8!important}.abPageLogin main.loginPage{width:min(100%,960px)!important;max-width:960px!important;padding:24px 20px 96px!important}.abPageLogin .loginHero{padding:24px!important;margin:0 0 14px!important;border-radius:20px!important}.abPageLogin .loginHero h1{font-size:30px!important;margin:14px 0 8px!important}.abPageLogin .loginHero>.muted{max-width:720px;margin:0!important}.abPageLogin .loginGrid{display:grid;grid-template-columns:1.08fr .92fr;gap:14px;align-items:start}.abPageLogin .loginCard,.abPageLogin .signupCard{margin:0!important;border-radius:18px!important;padding:20px!important}.abPageLogin .loginCard h2{font-size:20px!important}.abPageLogin .loginOptional{margin:2px 0 12px;border-top:1px solid #edf0f4;border-bottom:1px solid #edf0f4}.abPageLogin .loginOptional>summary{min-height:44px;display:flex;align-items:center;justify-content:space-between;color:#475467;font-size:13px;font-weight:650}.abPageLogin .loginOptional>summary:after{content:"선택";color:#667085;font-size:11px}.abPageLogin .signupCard>summary{list-style:none;cursor:pointer;display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;min-height:54px}.abPageLogin .signupCard>summary::-webkit-details-marker{display:none}.abPageLogin .signupCard>summary b{font-size:18px;color:#172033}.abPageLogin .signupCard>summary span{font-size:12px;color:#667085}.abPageLogin .signupCard>summary:after{content:"열기";grid-column:2;grid-row:1/3;color:var(--ab12-action,#2457d6);font-size:12px;font-weight:700}.abPageLogin .signupCard[open]>summary:after{content:"접기"}.abPageLogin .signupBody{padding-top:12px;border-top:1px solid #edf0f4;margin-top:10px}.abPageLogin .mobileAccessHelp{background:#f1f6ff;border:1px solid #cad9f2;color:#27456f;border-radius:13px;padding:12px 13px;line-height:1.55;margin:12px 0;font-size:13px}.abPageLogin .mobileAccessHelp b{color:#1d4ed8}.abPageLogin .legacyHelp{margin:14px 0 0!important}.abPageLogin .field{margin:10px 0!important}.abPageLogin .field input{font-size:16px}.abPageLogin .loginCard button[type="submit"]{margin-top:3px}
.abPageLogin main.loginPage{padding-top:20px!important}.abPageLogin .loginHero{padding:20px!important}.abPageLogin .loginCard,.abPageLogin .signupCard{padding:18px!important}
@media(max-width:760px){.abPageLogin main.loginPage{padding:10px 12px calc(92px + env(safe-area-inset-bottom,0px))!important}.abPageLogin .loginHero{padding:14px!important;margin-bottom:10px!important;border-radius:16px!important}.abPageLogin .loginHero .badge{font-size:11px;padding:5px 9px}.abPageLogin .loginHero h1{font-size:24px!important;line-height:1.24!important;margin:10px 0 6px!important}.abPageLogin .loginHero>.muted{font-size:13px!important;line-height:1.5!important}.abPageLogin .loginHero .warn,.abPageLogin .loginHero .notice{padding:10px 11px!important;margin:9px 0 0!important;font-size:13px}.abPageLogin .loginGrid{grid-template-columns:1fr;gap:10px}.abPageLogin .loginCard,.abPageLogin .signupCard{padding:14px!important;border-radius:16px!important}.abPageLogin .loginCard h2{font-size:19px!important;margin-bottom:5px!important}.abPageLogin .loginCard>.muted{font-size:12.5px!important;margin:0 0 8px!important}.abPageLogin .field{gap:5px!important;margin:9px 0!important}.abPageLogin .field input{height:48px!important}.abPageLogin .signupCard>summary b{font-size:16px}.abPageLogin .legacyHelp{font-size:12.5px;padding:11px!important}}
@media(max-width:760px){.abPageLogin .field{margin:8px 0!important}.abPageLogin .loginOptional>summary{min-height:40px}}
`;

const V2285_NAV_STYLE = `
@media(min-width:900px){:root{--abNavW:252px}.abAppSurface .abLayoutNav{width:252px!important}.abAppSurface .abNavBody{padding:14px 12px!important}.abAppSurface .abNavGroup{margin:4px 0!important}.abAppSurface .abNavGroup summary{min-height:42px!important}.abAppSurface .abNavGroup[open] summary{color:#172033!important}.abAppSurface .abNavGroupPrimary{padding-bottom:7px;margin-bottom:9px!important;border-bottom:1px solid #edf0f4}.abAppSurface .abNavGroupPrimary>summary{color:#172033!important}.abAppSurface .abNavLinks{padding-left:8px!important}.abAppSurface .abNavLinks a{min-height:42px!important;gap:9px!important;padding:0 9px!important}.abAppSurface .abNavItemIcon{width:28px;height:28px;flex:0 0 28px;border-radius:9px;display:grid;place-items:center;background:#f2f4f7;color:#667085;font-size:14px;font-style:normal}.abAppSurface .abNavGroupPrimary .abNavItemIcon{background:#edf3ff;color:var(--ab12-action,#2457d6)}.abAppSurface .abNavLinks a>span{font-size:13.5px;font-weight:620}.abAppSurface .abNavGroupPrimary .abNavLinks a>span{font-weight:700}.abAppSurface .abNavLinks a.active{background:#edf3ff!important;color:#1945b8!important}.abAppSurface .abNavLinks a.active .abNavItemIcon{background:var(--ab12-action,#2457d6);color:#fff}.abAppSurface .abNavGroupCount{margin-left:auto;font-size:10px;color:#98a2b3;font-weight:600}.abAppSurface .abNavGroup summary:after{content:"⌄";margin-left:auto;color:#98a2b3;font-size:12px}.abAppSurface .abNavGroup[open] summary:after{content:"⌃"}.abAppSurface .abNavGroup summary i+ b{font-size:12px!important;text-transform:none}.abAppSurface .abNavTop{padding:17px 14px!important}}
@media(max-width:899px){.abNavMobileDrawer .abNavItemIcon{display:none}.abNavMobileDrawer .abNavLinks a>span{font-size:13px}.abNavMobileDrawer .abNavGroupCount{margin-left:auto;font-size:10px;color:#98a2b3}.abNavMobileDrawer .abNavGroup summary:after{content:"⌄";margin-left:auto}.abNavMobileDrawer .abNavGroup[open] summary:after{content:"⌃"}}
`;

// V22.9.1 (개편 1단계): 메뉴·로그인 조각은 공유 자산(abUiuxCssAsset)으로 옮겼다.
// 셀렉터가 전부 abPageMenu / abPageLogin 으로 가드돼 있어서, 그 클래스가 없는 화면에
// 실려 있어도 매치되지 않는다 — 화면마다 다시 보낼 이유가 없었다.
//
// 내비 조각만 여기 남는다. 그 조각은 :root 에 변수를 푸는 유일한 것이라 가드가 없다.
function v2285NavStyleFor(html = "") {
  if (!String(html || "").includes('class="abLayoutNav"')) return "";
  return `<style id="v2285MobileAccessHierarchyStyle">${V2285_NAV_STYLE}</style>`;
}

const V2281_GUIDED_NAV_STYLE = `<style id="v2281GuidedNavStyle">
:root{--abNavW:232px;--abNavCollapsed:68px}
@media(min-width:1024px){body{padding-left:var(--abNavW)!important}.abLayoutNav{width:var(--abNavW)!important;background:#fff!important;border-right:1px solid #e2e8f0!important;box-shadow:none!important}.abNavBody{padding:12px 10px!important}}
.abNavTop{padding:16px 14px!important}.abNavBrand{gap:10px!important;font-weight:700!important}.abNavLogo{width:34px!important;height:34px!important;border-radius:10px!important;display:grid!important;place-items:center!important;background:#eaf2ff!important;box-shadow:none!important;color:#2563eb!important}.abBrandMark{width:19px;height:18px;display:flex;align-items:flex-end;gap:2px}.abBrandMark i{display:block;width:5px;border-radius:2px 2px 1px 1px;background:#2563eb}.abBrandMark i:nth-child(1){height:8px}.abBrandMark i:nth-child(2){height:14px}.abBrandMark i:nth-child(3){height:18px}
.abNavBrandText{font-weight:650!important}.abNavBrandText small{font-weight:500!important;color:#98a2b3!important}.abNavToggle{background:#f7f9fc!important;color:#667085!important;border:1px solid #e2e8f0!important;border-radius:10px!important}
.abNavGroup{margin:3px 0!important}.abNavGroup summary{min-height:42px!important;border-radius:10px!important;color:#667085!important;font-weight:600!important;padding:0 10px!important}.abNavGroup[open] summary{background:transparent!important;box-shadow:none!important;color:#344054!important}.abNavGroup summary i{font-size:16px!important;color:#98a2b3}.abNavGroup summary b{font-size:12px!important;font-weight:600!important;letter-spacing:.01em}.abNavLinks{gap:2px!important;padding:2px 0 7px 36px!important}.abNavLinks a{min-height:38px!important;border-radius:9px!important;padding:0 10px!important;color:#475467!important;font-size:13px!important;font-weight:500!important}.abNavLinks a:hover{background:#f7f9fc!important;color:#1d4ed8!important}.abNavLinks a.active{background:#eaf2ff!important;color:#1d4ed8!important;box-shadow:none!important;font-weight:650!important;position:relative}.abNavLinks a.active:before{content:"";position:absolute;left:0;top:9px;bottom:9px;width:3px;border-radius:3px;background:#2563eb}
.abNavFooter{padding:12px 10px!important}.abNavGuide{background:#f8fbff!important;border:1px solid #d8e5ff!important;color:#1d4ed8!important;border-radius:12px!important;padding:11px!important;box-shadow:none!important;font-size:12px!important;font-weight:650!important}.abNavGuide small{color:#667085!important;font-weight:500!important}
.abNavMobileTop{height:calc(56px + var(--abSafeTop))!important;padding:var(--abSafeTop) 14px 0!important;border-color:#e2e8f0!important}.abNavMobileTop a{display:flex;align-items:center;gap:8px;font-weight:650!important;color:#17233c!important}.abNavMobileTop button{background:#f7f9fc!important;color:#344054!important;border:1px solid #e2e8f0!important;border-radius:10px!important}.abNavMobileDrawer{top:calc(56px + var(--abSafeTop))!important;border-color:#e2e8f0!important;box-shadow:0 16px 30px rgba(23,35,60,.1)!important}.abNavBottom{border-color:#e2e8f0!important;box-shadow:0 -6px 18px rgba(23,35,60,.04)!important}.abNavBottom a{color:#7b8494!important;font-weight:550!important}.abNavBottom a i{font-size:18px!important}.abNavBottom a.active{color:#1d4ed8!important}.abNavBottom a.active:before{background:#2563eb!important}.abNavBottom a.abPrimary i,.bottom a.abPrimary i,.abUxBottom a.abPrimary i{background:#2563eb!important;color:#fff!important;border-radius:12px!important;box-shadow:0 7px 16px rgba(37,99,235,.22)!important}
@media(max-width:1023px){body{padding-top:calc(56px + var(--abSafeTop))!important}.abNavMobileDrawer .abNavLinks{grid-template-columns:1fr;gap:6px;padding:6px 0}.abNavMobileDrawer .abNavLinks a{background:#f8fafc!important;border:1px solid #edf1f6!important;min-height:48px}.abNavMobileDrawer .abNavGroup summary{padding-inline:6px!important}}
</style>`;

function guidedUiUxClientMain() {
  function labelForControl(form, name) {
    const control = form && form.querySelector('[name="' + name + '"]');
    return control && control.closest("label");
  }

  function improveReservePage() {
    if (!document.body.classList.contains("abPageReserve")) return;
    const form = document.querySelector(".reserveSmartForm");
    if (!form || form.dataset.guidedLayout === "1") return;
    form.dataset.guidedLayout = "1";
    const card = form.closest(".card");
    if (card) {
      card.id = "reserveAdd";
      const heading = card.querySelector("h2");
      if (heading) heading.textContent = "정기지출 추가";
      const guide = card.querySelector(".guideLine");
      if (guide) guide.innerHTML = "<b>언제, 얼마가 나가는지만 먼저 입력하세요.</b><br>연 1회·반기·분기를 선택하면 필요한 납부월만 표시됩니다.";
    }
    const primary = document.createElement("div");
    primary.className = "reservePrimaryGrid";
    ["name", "amount", "recurrence"].forEach(function(name) {
      const label = labelForControl(form, name);
      if (label) primary.appendChild(label);
    });
    const schedule = document.createElement("div");
    schedule.className = "reserveSchedule";
    form.querySelectorAll(".dueMonth").forEach(function(label) { schedule.appendChild(label); });
    const dueDay = labelForControl(form, "due_day");
    if (dueDay) schedule.appendChild(dueDay);
    const optional = document.createElement("details");
    optional.className = "reserveOptional";
    const summary = document.createElement("summary");
    summary.textContent = "분류·결제수단·메모 추가 입력";
    const optionalGrid = document.createElement("div");
    optionalGrid.className = "reserveOptionalGrid";
    ["category", "payment_method", "memo"].forEach(function(name) {
      const label = labelForControl(form, name);
      if (label) optionalGrid.appendChild(label);
    });
    optional.append(summary, optionalGrid);
    const submitButton = form.querySelector(':scope > button[type="submit"]');
    const submit = document.createElement("div");
    submit.className = "reserveSubmit";
    if (submitButton) {
      submitButton.textContent = "정기지출 저장";
      submit.appendChild(submitButton);
    }
    const firstVisible = Array.from(form.children).find(function(node) { return node.tagName !== "INPUT" || node.type !== "hidden"; });
    form.insertBefore(primary, firstVisible || null);
    form.insertBefore(schedule, primary.nextSibling);
    form.append(optional, submit);
    const nameInput = form.querySelector('[name="name"]');
    const amountInput = form.querySelector('[name="amount"]');
    const dayInput = form.querySelector('[name="due_day"]');
    if (nameInput) nameInput.required = true;
    if (amountInput) amountInput.required = true;
    if (dayInput) dayInput.required = true;
  }

  function improveBudgetPage() {
    if (!document.body.classList.contains("abPageBudgets")) return;
    const form = document.getElementById("budgetPlanForm");
    if (!form) return;
    const values = { income: [], expense: [] };
    form.querySelectorAll("#incomeRows .pickValue option").forEach(function(option) { if (option.value) values.income.push(option.value); });
    form.querySelectorAll("#expenseRows .pickValue option").forEach(function(option) { if (option.value) values.expense.push(option.value); });
    function ensureList(id, listValues) {
      let list = document.getElementById(id);
      if (!list) {
        list = document.createElement("datalist");
        list.id = id;
        Array.from(new Set(listValues)).forEach(function(value) {
          const option = document.createElement("option");
          option.value = value;
          list.appendChild(option);
        });
        form.appendChild(list);
      }
    }
    ensureList("incomeBudgetSuggestions", values.income);
    ensureList("expenseBudgetSuggestions", values.expense);
    function simplifyLines() {
      form.querySelectorAll(".planLine").forEach(function(line) {
        const select = line.querySelector(".pickValue");
        if (select) {
          const label = select.closest("label");
          if (label) label.remove();
        }
        const income = line.querySelector('[name="income_name"]');
        const expense = line.querySelector('[name="budget_category"]');
        if (income) income.setAttribute("list", "incomeBudgetSuggestions");
        if (expense) expense.setAttribute("list", "expenseBudgetSuggestions");
      });
    }
    simplifyLines();
    form.querySelectorAll("[data-add]").forEach(function(button) {
      button.addEventListener("click", function() { setTimeout(simplifyLines, 0); });
    });
    form.querySelectorAll(".planGrid > div").forEach(function(column) { column.classList.add("planColumn"); });
    const title = form.closest(".card") && form.closest(".card").querySelector("h2");
    if (title) title.textContent = "이번 달 계획 입력";
    const badge = form.closest(".card") && form.closest(".card").querySelector(".sectionHead > b");
    if (badge) badge.remove();
    const save = form.querySelector(".savePlan");
    if (save) save.textContent = "이번 달 계획 저장";
    document.querySelectorAll(".metrics .metric").forEach(function(metric) {
      const label = metric.querySelector("span");
      const text = label ? label.textContent.trim() : "";
      if (text.indexOf("예상 수입") === 0 || text.indexOf("실제 수입 - 실제 지출") === 0) metric.remove();
    });
  }

  function improveGuidePage() {
    if (!document.body.classList.contains("abPageGuide")) return;
    const section = Array.from(document.querySelectorAll("section.card")).find(function(card) {
      const heading = card.querySelector(":scope > h2");
      return heading && heading.textContent.trim() === "화면별 안내";
    });
    if (!section) return;
    const details = document.createElement("details");
    details.className = section.className;
    const summary = document.createElement("summary");
    summary.innerHTML = "<b>화면별 기능 둘러보기</b> <span>선택</span>";
    details.appendChild(summary);
    Array.from(section.children).forEach(function(child) {
      if (child.tagName !== "H2") details.appendChild(child);
    });
    section.replaceWith(details);
  }

  function improveMobileOnboarding() {
    const section = document.querySelector(".homeOnboarding[data-household-id]");
    if (!section || section.getAttribute("data-first-record") !== "1") return;
    const householdId = section.getAttribute("data-household-id") || "default";
    const key = "ab:onboarding:result-checked:" + householdId;
    try {
      if (window.localStorage && window.localStorage.getItem(key) === "1") {
        section.remove();
        return;
      }
    } catch (err) {}
    const link = section.querySelector("[data-onboarding-result-check]");
    if (!link) return;
    link.addEventListener("click", function() {
      try { if (window.localStorage) window.localStorage.setItem(key, "1"); } catch (err) {}
      const step = link.closest(".homeOnboardingStep");
      if (step) {
        step.classList.remove("current");
        step.classList.add("done");
        const small = step.querySelector("small");
        if (small) small.textContent = "최근 기록에서 저장 결과 확인 완료";
        link.remove();
      }
      const count = section.querySelector(".homeOnboardingHead > span");
      if (count) count.textContent = "3/3 완료";
    });
  }

  improveReservePage();
  improveBudgetPage();
  improveGuidePage();
  improveMobileOnboarding();

  function submitControlLabel(button) {
    if (!button) return "";
    return String(button.tagName === "INPUT" ? button.value : button.textContent || "").trim();
  }

  function pendingSubmitLabel(form, button) {
    const action = String(form && form.getAttribute("action") || "").toLowerCase();
    const label = submitControlLabel(button);
    const context = action + " " + label;
    if (/local-login|auth\/kakao/.test(action) || /로그인/.test(label)) return "로그인 중…";
    if (/local-signup/.test(action) || /계정\s*(?:만들|생성)|회원\s*가입/.test(label)) return "계정 만드는 중…";
    if (/\/my\/create(?:$|[?#])/.test(action) || /가계부\s*(?:만들|생성)/.test(label)) return "가계부 만드는 중…";
    if (/\/my\/join(?:$|[?#])/.test(action) || /참여|가입\s*요청/.test(label)) return "참여 요청 중…";
    if (/logout|로그아웃/.test(context)) return "로그아웃 중…";
    if (/identity\/merge|계정\s*통합/.test(context)) return "계정 통합 중…";
    if (/\/(?:delete|remove)(?:$|[?#])|삭제|제거/.test(context)) return "삭제 중…";
    if (/\/leave(?:$|[?#])|탈퇴|나가기/.test(context)) return "탈퇴 처리 중…";
    if (/upload|import|가져오기|업로드/.test(context)) return "가져오는 중…";
    if (/저장|등록|설정|변경|수정|완료|적용/.test(label)) return "저장 중…";
    return "처리 중…";
  }

  function riskySubmitMessage(form, button) {
    const action = String(form && form.getAttribute("action") || "").toLowerCase();
    const label = submitControlLabel(button) || "이 작업";
    const context = action + " " + label;
    if (/identity\/merge|계정\s*통합/.test(context)) return "계정을 통합할까요?\n계정 연결 정보가 변경됩니다.";
    if (/\/leave(?:$|[?#])|탈퇴|나가기/.test(context)) return "가계부에서 탈퇴할까요?\n다시 참여하려면 초대가 필요할 수 있습니다.";
    if (/\/(?:delete|remove)(?:$|[?#])|삭제|제거/.test(context)) return "삭제할까요?\n삭제한 정보는 되돌리기 어려울 수 있습니다.";
    return label + "을 진행할까요?\n기존 정보에 영향을 줄 수 있습니다.";
  }

  function ensureSubmitStatus(form) {
    let status = form.querySelector('[data-ab-submit-status="1"]');
    if (status) return status;
    status = document.createElement("span");
    status.dataset.abSubmitStatus = "1";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.style.position = "absolute";
    status.style.width = "1px";
    status.style.height = "1px";
    status.style.padding = "0";
    status.style.margin = "-1px";
    status.style.overflow = "hidden";
    status.style.clip = "rect(0,0,0,0)";
    status.style.whiteSpace = "nowrap";
    status.style.border = "0";
    form.appendChild(status);
    return status;
  }

  function restoreSubmitState(form) {
    delete form.dataset.abSubmitting;
    delete form.dataset.submitting;
    form.removeAttribute("aria-busy");
    form.querySelectorAll('[data-ab-submit-locked="1"]').forEach(function(button) {
      delete button.dataset.abSubmitLocked;
      button.disabled = false;
      button.removeAttribute("aria-busy");
      if (button.tagName === "BUTTON" && button.dataset.originalText) {
        button.textContent = button.dataset.originalText;
      }
      if (button.tagName === "INPUT" && button.dataset.originalValue) {
        button.value = button.dataset.originalValue;
      }
    });
    const status = form.querySelector('[data-ab-submit-status="1"]');
    if (status) status.textContent = "";
    try { form.dispatchEvent(new Event("ab:submit-restored")); } catch (err) {}
  }

  function isPostForm(form) {
    return form && form.tagName === "FORM" && String(form.getAttribute("method") || "get").toLowerCase() === "post";
  }

  function isRiskyForm(form) {
    const action = String(form && form.getAttribute("action") || "");
    return /\/(delete|remove|leave)(?:$|[?#])/.test(action) || /\/identity\/merge(?:$|[?#])/.test(action);
  }

  // Large transaction pages can contain many forms. Style them once, then use
  // one delegated submit listener instead of attaching multiple listeners to
  // every form.
  document.querySelectorAll('form[method="post"]').forEach(function(form) {
    if (!isRiskyForm(form)) return;
    const submitButton = form.querySelector('button[type="submit"],input[type="submit"]');
    if (submitButton) submitButton.classList.add("danger");
  });

  document.addEventListener("submit", function(event) {
    const form = event.target;
    if (!isPostForm(form)) return;
    const submittedButton = event.submitter && form.contains(event.submitter)
      ? event.submitter
      : form.querySelector('button[type="submit"],input[type="submit"]');
    if (isRiskyForm(form) && !form.hasAttribute("onsubmit") && !window.confirm(riskySubmitMessage(form, submittedButton))) {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented || (typeof form.checkValidity === "function" && !form.checkValidity())) return;
    if (form.dataset.abSubmitting === "1") {
      event.preventDefault();
      return;
    }
    const lock = function() {
      // Target-level validation and confirmation handlers run before this
      // delegated listener. A cancelled submit must remain usable.
      if (event.defaultPrevented) return;
      if (form.dataset.abSubmitting === "1") {
        event.preventDefault();
        return;
      }
      const button = submittedButton;
      if (!button || (button.disabled && button.getAttribute("aria-busy") !== "true")) return;
      form.dataset.abSubmitting = "1";
      form.setAttribute("aria-busy", "true");
      button.dataset.abSubmitLocked = "1";
      button.disabled = true;
      button.setAttribute("aria-busy", "true");
      const pendingLabel = pendingSubmitLabel(form, button);
      if (button.tagName === "BUTTON" && !button.dataset.originalText) {
        button.dataset.originalText = button.textContent || "";
      }
      if (button.tagName === "INPUT" && !button.dataset.originalValue) {
        button.dataset.originalValue = button.value || "";
      }
      if (button.tagName === "BUTTON" && button.textContent === button.dataset.originalText) button.textContent = pendingLabel;
      if (button.tagName === "INPUT" && button.value === button.dataset.originalValue) button.value = pendingLabel;
      ensureSubmitStatus(form).textContent = pendingLabel;
    };
    if (typeof queueMicrotask === "function") queueMicrotask(lock);
    else Promise.resolve().then(lock);
  });

  window.addEventListener("pageshow", function() {
    document.querySelectorAll('form[method="post"]').forEach(restoreSubmitState);
  });
}

// V22.8.18 (B) 결과 피드백 — 제출한 자리 인라인 표기.
// POST 제출 직전에 form action을 기억해 두고, redirect로 돌아온 화면에서
// 상단 결과 배너(.ok/.error/.err/.notice)를 "제출한 폼의 버튼 바로 아래"로
// 옮긴다. 매칭되는 폼이 없거나 여러 개면 기존 상단 표시를 그대로 유지한다
// (기능 삭제 없음 — 순수 점진 개선). 실패 배너가 화면 밖이면 그 자리로
// 스크롤해 사유를 반드시 보게 한다. 서버가 escapeHtml로 렌더한 노드를
// 그대로 이동하므로 새 마크업 주입이 없다(XSS 안전).
function inlineActionResultClientMain() {
  var KEY_ACTION = "abInlineResultAction";
  var KEY_AT = "abInlineResultAt";
  function actionPathOf(raw) {
    var link = document.createElement("a");
    link.href = String(raw || "");
    return link.pathname || String(raw || "");
  }
  document.addEventListener("submit", function (event) {
    var form = event.target;
    if (!form || form.tagName !== "FORM") return;
    if (String(form.getAttribute("method") || "get").toLowerCase() !== "post") return;
    try {
      sessionStorage.setItem(KEY_ACTION, actionPathOf(form.getAttribute("action") || location.pathname));
      sessionStorage.setItem(KEY_AT, String(Date.now()));
    } catch (err) {}
  }, true);

  function findTopBanner() {
    var parents = ["main", ".wrap", ".pageMain"];
    var kinds = [
      { selector: "div.notice.error", error: true }, { selector: "div.error", error: true }, { selector: "div.err", error: true },
      { selector: "div.notice.ok", error: false }, { selector: "div.ok", error: false },
    ];
    for (var k = 0; k < kinds.length; k++) {
      for (var p = 0; p < parents.length; p++) {
        var el = document.querySelector(parents[p] + " > " + kinds[k].selector);
        if (el && String(el.textContent || "").trim()) return { el: el, error: kinds[k].error };
      }
    }
    return null;
  }

  function findSubmittedForm(actionPath) {
    if (!actionPath) return null;
    var forms = document.querySelectorAll('form[method="post"]');
    var hit = null;
    var count = 0;
    for (var i = 0; i < forms.length; i++) {
      if (actionPathOf(forms[i].getAttribute("action") || "") === actionPath) {
        count += 1;
        hit = forms[i];
      }
    }
    return count === 1 ? hit : null; // 같은 action 폼이 여럿이면 특정 불가 → 이동하지 않음
  }

  function run() {
    var banner = findTopBanner();
    if (!banner) return;
    var el = banner.el;
    if (!el.getAttribute("role")) el.setAttribute("role", banner.error ? "alert" : "status");
    var actionPath = "";
    var at = 0;
    try {
      actionPath = sessionStorage.getItem(KEY_ACTION) || "";
      at = Number(sessionStorage.getItem(KEY_AT) || 0);
      sessionStorage.removeItem(KEY_ACTION);
      sessionStorage.removeItem(KEY_AT);
    } catch (err) {}
    var fresh = at && Date.now() - at < 45000;
    var form = fresh ? findSubmittedForm(actionPath) : null;
    if (form) {
      var slot = form.querySelector(".abActionResult");
      if (!slot) {
        slot = document.createElement("div");
        slot.className = "abActionResult";
        var submitControl = form.querySelector('button[type="submit"],input[type="submit"]');
        if (submitControl && submitControl.parentNode) submitControl.parentNode.insertBefore(slot, submitControl.nextSibling);
        else form.appendChild(slot);
      }
      slot.appendChild(el);
      el.classList.add("abInlineResult");
    }
    var rect = el.getBoundingClientRect();
    var viewHeight = window.innerHeight || document.documentElement.clientHeight || 0;
    var offscreen = rect.bottom < 0 || rect.top > viewHeight;
    if (offscreen && (banner.error || form)) {
      var reduceMotion = false;
      try { reduceMotion = !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches); } catch (err) {}
      el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "center" });
    }
    if (!banner.error) {
      setTimeout(function () { el.classList.add("abResultFaded"); }, 3500);
    }
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", run);
  else run();
}

const V22818_INLINE_RESULT_STYLE = '<style id="v22818InlineResultStyle">.abActionResult{margin-top:10px}.abActionResult .abInlineResult{margin:10px 0!important}.abResultFaded{opacity:.55;transition:opacity var(--ab12-dur-slow,320ms) var(--ab12-ease,cubic-bezier(.2,.8,.2,1))}@media (prefers-reduced-motion:reduce){.abResultFaded{transition:none}html{scroll-behavior:auto}}</style>';

const KAKAO_LOGIN_PROGRESS_TIPS = [
  "“점심 12000원”처럼 짧게 적으면 금액과 분류를 알아서 나눠 저장해요.",
  "카드 사용내역은 가져오기 메뉴에서 카드사별 엑셀 파일로 한 번에 등록할 수 있어요.",
  "분류별 예산을 정해 두면 이번 달 남은 금액을 한눈에 볼 수 있어요.",
  "통신비·보험처럼 매달 나가는 돈은 정기지출로 등록하면 잊지 않아요.",
  "가족이나 모임은 초대코드로 함께 쓰는 가계부를 만들 수 있어요.",
  "하루 한 번, 저녁에 몰아서 적어도 월말 정산이 훨씬 쉬워져요.",
  "카카오톡 챗봇에 “커피 4500원”이라고 보내도 바로 기록돼요.",
];

function kakaoLoginProgressClientMain(config) {
  var link = document.querySelector('a.kakaoBtn[href^="/auth/kakao/start"]');
  var overlay = document.getElementById(config.overlayId);
  var tipEl = document.getElementById(config.tipId);
  var slowEl = document.getElementById(config.slowId);
  var cancel = document.getElementById(config.cancelId);
  var tips = config.tips || [];
  if (!link || !overlay || !tipEl) return;
  var tipTimer = 0;
  var slowTimer = 0;
  var index = 0;

  function showTip() {
    tipEl.textContent = tips[index % tips.length] || "";
    index += 1;
  }

  function hide() {
    overlay.hidden = true;
    document.documentElement.classList.remove("kakaoProgressOpen");
    if (slowEl) slowEl.hidden = true;
    clearInterval(tipTimer);
    clearTimeout(slowTimer);
    link.removeAttribute("aria-busy");
  }

  link.addEventListener("click", function (event) {
    // V22.9.26: 새 탭 열기(보조키·가운데 버튼)나 이미 처리된 클릭에는 대기 화면을 덮지 않는다.
    if (event && (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey)) return;
    index = Math.floor(Math.random() * Math.max(tips.length, 1));
    showTip();
    overlay.hidden = false;
    document.documentElement.classList.add("kakaoProgressOpen");
    link.setAttribute("aria-busy", "true");
    clearInterval(tipTimer);
    tipTimer = setInterval(showTip, 3600);
    clearTimeout(slowTimer);
    slowTimer = setTimeout(function () { if (slowEl) slowEl.hidden = false; }, 9000);
  });

  if (cancel) {
    cancel.addEventListener("click", function () {
      try { window.stop(); } catch (err) { /* 일부 브라우저는 stop을 지원하지 않는다 */ }
      hide();
    });
  }

  // 뒤로 가기로 돌아왔을 때 오버레이가 남아 화면을 가리지 않게 한다.
  window.addEventListener("pageshow", function (event) { if (event.persisted) hide(); });
}

function passwordMatchFeedbackClientMain(config) {
  var password = document.getElementById(config.passwordId);
  var confirmation = document.getElementById(config.confirmationId);
  var status = document.getElementById(config.statusId);
  var button = document.getElementById(config.buttonId);
  var form = button && button.form;
  if (!password || !confirmation || !status || !button || !form) return;

  function setFeedback(message, state, invalidMessage, disableButton) {
    status.textContent = message;
    status.dataset.state = state;
    confirmation.setCustomValidity(invalidMessage || "");
    button.disabled = !!disableButton;
    button.setAttribute("aria-disabled", disableButton ? "true" : "false");
  }

  function syncPasswordFeedback() {
    var first = String(password.value || "");
    var second = String(confirmation.value || "");
    if (!first && !second) {
      setFeedback("비밀번호는 8자리 이상 입력해 주세요.", "hint", "", false);
      return;
    }
    if (first.length < 8) {
      setFeedback("비밀번호를 8자리 이상 입력해 주세요.", "error", "비밀번호를 8자리 이상 입력해 주세요.", true);
      return;
    }
    if (!second) {
      setFeedback("확인을 위해 같은 비밀번호를 한 번 더 입력해 주세요.", "hint", "같은 비밀번호를 한 번 더 입력해 주세요.", true);
      return;
    }
    if (first !== second) {
      setFeedback("두 비밀번호가 다릅니다. 다시 확인해 주세요.", "error", "두 비밀번호가 일치하지 않습니다.", true);
      return;
    }
    setFeedback("두 비밀번호가 일치합니다.", "success", "", false);
  }

  password.addEventListener("input", syncPasswordFeedback);
  confirmation.addEventListener("input", syncPasswordFeedback);
  password.addEventListener("change", syncPasswordFeedback);
  confirmation.addEventListener("change", syncPasswordFeedback);
  form.addEventListener("ab:submit-restored", syncPasswordFeedback);
  window.addEventListener("pageshow", syncPasswordFeedback);
  syncPasswordFeedback();
  window.setTimeout(syncPasswordFeedback, 250);
}

function accessibleFieldLabel(name = "", placeholder = "") {
  const labels = {
    nickname: "내 이름", access_code: "개인 접속코드", access_code_confirm: "개인 접속코드 확인",
    invite_code: "초대코드", household_name: "가계부 이름", household_id: "가계부", display_name: "가계부에서 보일 내 이름",
    confirm_name: "삭제 확인용 가계부 이름", income_name: "수입 종류", income_amount: "예상 수입 금액",
    budget_category: "지출 예산 분류", budget_amount: "지출 예산 금액",
    month: "조회 월", amount: "금액", memo: "내용", category: "분류",
    payment_method: "결제수단", transaction_date: "거래 날짜", user_id: "지출자",
    q: "검색어", quality: "정리 상태", type: "거래 유형", name: "이름",
    day_of_month: "적용일", due_day: "납부일", recurrence: "반복 주기",
  };
  return String(labels[String(name || "")] || placeholder || String(name || "").replace(/_/g, " ") || "입력 항목").trim();
}

function attachAccessibleControlNames(html = "") {
  return String(html || "").replace(/<(input|select|textarea)\b([^>]*)>/gi, function(full, tag, attrs) {
    if (/\baria-label(?:ledby)?\s*=/i.test(attrs) || /\btitle\s*=/i.test(attrs)) return full;
    const typeMatch = attrs.match(/\btype\s*=\s*["']?([^"'\s>]+)/i);
    const type = String(typeMatch?.[1] || "").toLowerCase();
    if (["hidden", "radio", "checkbox", "submit", "button", "image"].includes(type)) return full;
    const nameMatch = attrs.match(/\bname\s*=\s*["']([^"']+)["']/i);
    const placeholderMatch = attrs.match(/\bplaceholder\s*=\s*["']([^"']+)["']/i);
    const label = accessibleFieldLabel(nameMatch?.[1] || "", placeholderMatch?.[1] || "");
    const selfClosing = /\/\s*$/.test(attrs);
    const cleanAttrs = selfClosing ? attrs.replace(/\/\s*$/, "") : attrs;
    return "<" + tag + cleanAttrs + ' aria-label="' + escapeHtml(label) + '"' + (selfClosing ? "/>" : ">");
  });
}

function approximateWonLabel(raw = "") {
  const value = Number(String(raw || "").replace(/,/g, "")) || 0;
  if (!value) return "집계 대기";
  if (value >= 1000000) return "약 " + Math.round(value / 10000) + "만원";
  if (value >= 10000) return "약 " + (Math.round(value / 1000) / 10) + "만원";
  return "약 " + new Intl.NumberFormat("ko-KR").format(Math.round(value / 1000) * 1000) + "원";
}

function myBackupImportClientMain() {
  var input = document.getElementById("myImportFile");
  var area = document.getElementById("myImportText");
  var status = document.getElementById("myImportFileStatus");
  var form = document.getElementById("myImportForm");
  var submit = document.getElementById("myImportSubmit");
  var xlsxPromise = null;
  if (!input || !area || !status || !form) return;

  function setStatus(message, bad) {
    status.textContent = message;
    status.style.background = bad ? "#fff7ed" : "#eff6ff";
    status.style.borderColor = bad ? "#fed7aa" : "#bfdbfe";
    status.style.color = bad ? "#9a3412" : "#1e3a8a";
  }

  function loadXlsx() {
    if (window.XLSX) return Promise.resolve(window.XLSX);
    if (xlsxPromise) return xlsxPromise;
    xlsxPromise = new Promise(function(resolve, reject) {
      var script = document.createElement("script");
      script.src = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";
      script.async = true;
      script.onload = function() {
        if (window.XLSX) resolve(window.XLSX);
        else { xlsxPromise = null; reject(new Error("엑셀 변환 모듈 초기화에 실패했습니다.")); }
      };
      script.onerror = function() {
        // V22.9.26: 실패한 약속을 캐시하지 않는다. 그래야 다음 파일 선택에서 다시 시도한다.
        xlsxPromise = null;
        reject(new Error("엑셀 변환 모듈을 불러오지 못했습니다."));
      };
      document.head.appendChild(script);
    });
    return xlsxPromise;
  }

  input.addEventListener("change", async function() {
    var file = input.files && input.files[0];
    if (!file) return;
    var name = String(file.name || "").toLowerCase();
    if (!/\.xlsx?$/.test(name)) {
      setStatus("선택한 " + file.name + " 파일은 서버에서 제목 유사어와 자연어를 분석합니다.", false);
      return;
    }
    setStatus("엑셀 변환 모듈을 준비하고 있습니다…", false);
    try {
      await loadXlsx();
    } catch (error) {
      setStatus(error.message || String(error), true);
      return;
    }
    var reader = new FileReader();
    setStatus("엑셀의 모든 시트를 변환하고 있습니다…", false);
    reader.onload = function(event) {
      try {
        var workbook = window.XLSX.read(new Uint8Array(event.target.result), { type: "array", cellDates: false });
        var chunks = [];
        workbook.SheetNames.forEach(function(sheetName) {
          var sheet = workbook.Sheets[sheetName];
          var tsv = window.XLSX.utils.sheet_to_csv(sheet, { FS: "\t", RS: "\n", rawNumbers: false });
          if (String(tsv || "").trim()) chunks.push("# 시트: " + sheetName + "\n" + String(tsv).trim());
        });
        if (!chunks.length) throw new Error("값이 있는 시트를 찾지 못했습니다.");
        area.value = chunks.join("\n");
        input.value = "";
        setStatus("엑셀 " + workbook.SheetNames.length + "개 시트를 변환했습니다. 아래 내용 확인 후 미리보기를 누르세요.", false);
      } catch (error) {
        setStatus(error.message || String(error), true);
      }
    };
    reader.onerror = function() {
      setStatus("엑셀 파일을 읽지 못했습니다. CSV로 저장하거나 표를 복사해 붙여넣어 주세요.", true);
    };
    reader.readAsArrayBuffer(file);
  });

  form.addEventListener("submit", function(event) {
    var file = input.files && input.files[0];
    if (file && /\.xlsx?$/.test(String(file.name || "").toLowerCase())) {
      event.preventDefault();
      setStatus("엑셀 변환이 끝날 때까지 기다리거나 CSV로 저장해 주세요.", true);
      return;
    }
    if (submit && !submit.disabled) {
      submit.disabled = true;
      submit.setAttribute("aria-busy", "true");
      submit.textContent = "미리보기 분석 중…";
    }
  });
}

function deferHeavyBrowserTools(html = "") {
  let source = String(html || "");
  const sheetJsUrl = "https://cdn.sheetjs.com/xlsx-0.20.3/package/dist/xlsx.full.min.js";

  if (source.includes('id="myImportForm"') && source.includes(sheetJsUrl)) {
    const marker = `<script src="${sheetJsUrl}"></script><script>(function(){var input=document.getElementById('myImportFile')`;
    const start = source.indexOf(marker);
    const end = start < 0 ? -1 : source.indexOf("</script>", start + marker.length);
    if (start >= 0 && end >= 0) {
      source = source.slice(0, start) + `<script id="myBackupImportRuntime">(${myBackupImportClientMain.toString()})();</script>` + source.slice(end + 9);
    }
  }

  if (source.includes("window.__IMPORT_HOUSEHOLD_ID__") && source.includes(sheetJsUrl)) {
    const loader = "function loadAdminSheetJs(){if(window.XLSX)return Promise.resolve(window.XLSX);if(window.__abSheetJsPromise)return window.__abSheetJsPromise;window.__abSheetJsPromise=new Promise(function(resolve,reject){var script=document.createElement('script');script.src='" + sheetJsUrl + "';script.async=true;script.onload=function(){window.XLSX?resolve(window.XLSX):reject(new Error('엑셀 변환 모듈 초기화 실패'));};script.onerror=function(){reject(new Error('엑셀 변환 모듈 다운로드 실패'));};document.head.appendChild(script);});return window.__abSheetJsPromise;}";
    source = source.replace("window.__IMPORT_HOUSEHOLD_ID__=", loader + "window.__IMPORT_HOUSEHOLD_ID__=");
    source = source.replace("document.getElementById('importFile').addEventListener('change',function(ev){", "document.getElementById('importFile').addEventListener('change',async function(ev){");
    source = source.replace("if(/\\.xlsx?$/.test(name)){var reader=new FileReader();", "if(/\\.xlsx?$/.test(name)){setImportStatus('엑셀 변환 모듈을 준비하고 있습니다…','');try{await loadAdminSheetJs();}catch(err){setImportStatus(err.message||String(err),'err');return;}var reader=new FileReader();");
    if (source.includes("function loadAdminSheetJs()") && source.includes("await loadAdminSheetJs()")) {
      source = source.replace(`<script src="${sheetJsUrl}"></script>`, "");
    }
  }
  return source;
}
// @build:exports-start
export {
  KAKAO_LOGIN_PROGRESS_TIPS, UIUX_RUNTIME_STYLE, V22818_INLINE_RESULT_STYLE, V2281_GUIDED_NAV_STYLE,
  V2281_GUIDED_UIUX_STYLE, V2284_UI_REVALIDATION_STYLE, V2285_LOGIN_STYLE, V2285_MENU_STYLE,
  approximateWonLabel, attachAccessibleControlNames, deferHeavyBrowserTools, guidedUiUxClientMain,
  inlineActionResultClientMain, kakaoLoginProgressClientMain, mobileShellUiClientMain,
  mobileUiUxClientMain, passwordMatchFeedbackClientMain, v2284UiStyleFor, v2285NavStyleFor,
};
// @build:exports-end
