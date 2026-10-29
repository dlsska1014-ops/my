// @build:imports-start
import { accountbookAmountMaskClientMain } from "../client/lucian-e-mains.js";
import {
  explicitDateIntent, moneyTokenSpans, parseMobileAmountText, quickAmountFieldState, quickInputDate,
  transactionTypeFromText,
} from "../client/shared-input-parsers.js";
import {
  cleanInputMemo, detectInputPayment, foldInputWidth, inferInputCategory, inputPaymentNameIn,
  inputPaymentPatterns, joinSpacedKoreanAmount, normalizeInputText,
} from "../client/shared-input-nlu.js";
import {
  UIUX_RUNTIME_STYLE, V2281_GUIDED_UIUX_STYLE, V2284_UI_REVALIDATION_STYLE, V2285_LOGIN_STYLE,
  V2285_MENU_STYLE, guidedUiUxClientMain, mobileShellUiClientMain, v2284UiStyleFor,
} from "../client/legacy-ui-runtime.js";
import { budgetSummary } from "../domain/budgets.js";
import { MOBILE_V81_CSS } from "./mobile-v81-css.js";
import {
  AB_ACCOUNTBOOK_THEME_JS_CACHE, AB_MOBILE_HOME_CSS_CACHE, AB_MOBILE_HOME_JS_CACHE,
} from "./asset-registry.js";
import { renderMobileV81Html } from "../my/mobile-home.js";
import { calculateStats } from "../domain/transactions-core.js";
// @build:imports-end

function accountbookThemeClientMain() {
  var root = document.documentElement;
  var themeKey = "ab:appearance:theme";
  var toneKey = "ab:appearance:tone";
  var themes = ["light", "dark"];
  var tones = ["blue", "emerald", "violet", "amber"];
  function read(key, fallback) {
    try { return window.localStorage?.getItem(key) || fallback; } catch (_error) { return fallback; }
  }
  function write(key, value) {
    try { window.localStorage?.setItem(key, value); } catch (_error) {}
  }
  function valid(value, allowed, fallback) {
    return allowed.includes(value) ? value : fallback;
  }
  function currentTheme() {
    return valid(read(themeKey, "light"), themes, "light");
  }
  function currentTone() {
    return valid(read(toneKey, "blue"), tones, "blue");
  }
  function resolved(theme) {
    return theme === "dark" ? "dark" : "light";
  }
  function syncMeta(mode, tone) {
    var light = { blue: "#1d4ed8", emerald: "#047857", violet: "#6d28d9", amber: "#92400e" };
    var dark = { blue: "#0f172a", emerald: "#0f172a", violet: "#0f172a", amber: "#0f172a" };
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", (mode === "dark" ? dark : light)[tone] || "#1d4ed8");
  }
  function syncControls(theme, tone, announce) {
    document.querySelectorAll("[data-ab-theme-choice]").forEach(function(button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-ab-theme-choice") === theme));
    });
    document.querySelectorAll("[data-ab-tone-choice]").forEach(function(button) {
      button.setAttribute("aria-pressed", String(button.getAttribute("data-ab-tone-choice") === tone));
    });
    var status = document.getElementById("abAppearanceStatus");
    if (status) {
      var themeLabel = { light: "라이트 모드", dark: "다크 모드" }[theme];
      var toneLabel = { blue: "블루", emerald: "그린", violet: "바이올렛", amber: "앰버" }[tone];
      status.textContent = (announce ? "저장했습니다. " : "") + themeLabel + " · " + toneLabel + " 컬러톤";
    }
  }
  function apply(theme, tone, announce) {
    // Lucian #138: this blocking head asset applies device privacy before paint.
    if (read("abHideAmounts", "0") === "1") root.setAttribute("data-ab-hide-amounts", "");
    else root.removeAttribute("data-ab-hide-amounts");
    theme = valid(theme, themes, "light");
    tone = valid(tone, tones, "blue");
    var mode = resolved(theme);
    root.setAttribute("data-ab-theme", theme);
    root.setAttribute("data-ab-resolved-theme", mode);
    root.setAttribute("data-ab-tone", tone);
    root.style.colorScheme = mode;
    syncMeta(mode, tone);
    syncControls(theme, tone, announce);
  }
  function bind() {
    document.querySelectorAll("[data-ab-theme-choice]").forEach(function(button) {
      if (button.getAttribute("data-ab-bound") === "1") return;
      button.setAttribute("data-ab-bound", "1");
      button.addEventListener("click", function() {
        var theme = valid(button.getAttribute("data-ab-theme-choice"), themes, "light");
        write(themeKey, theme);
        apply(theme, currentTone(), true);
      });
    });
    document.querySelectorAll("[data-ab-tone-choice]").forEach(function(button) {
      if (button.getAttribute("data-ab-bound") === "1") return;
      button.setAttribute("data-ab-bound", "1");
      button.addEventListener("click", function() {
        var tone = valid(button.getAttribute("data-ab-tone-choice"), tones, "blue");
        write(toneKey, tone);
        apply(currentTheme(), tone, true);
      });
    });
    apply(currentTheme(), currentTone(), false);
    bindHeadNotes();
  }
  // V22.9.9: 화면 안내문을 접고, 접은 상태를 이 브라우저에 기억한다.
  // 화면별로 따로 기억한다 — 예산 안내를 접었다고 정산 안내까지 사라지면
  // 처음 가는 화면에서 설명을 못 보게 된다.
  function bindHeadNotes() {
    document.querySelectorAll("[data-ab-note]").forEach(function(note) {
      var key = "ab:note:" + note.getAttribute("data-ab-note");
      var button = note.querySelector(".abHeadNoteToggle");
      if (!button) return;
      function render(folded) {
        note.classList.toggle("isFolded", folded);
        button.setAttribute("aria-expanded", folded ? "false" : "true");
        button.textContent = folded ? "화면 안내" : "접기";
      }
      render(read(key, "") === "1");
      if (button.getAttribute("data-ab-bound") === "1") return;
      button.setAttribute("data-ab-bound", "1");
      button.addEventListener("click", function() {
        var folded = !note.classList.contains("isFolded");
        write(key, folded ? "1" : "0");
        render(folded);
      });
    });
  }
  apply(currentTheme(), currentTone(), false);
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", bind, { once: true });
  else bind();
  window.addEventListener("storage", function(event) {
    if (event.key === themeKey || event.key === toneKey || event.key === "abHideAmounts") apply(currentTheme(), currentTone(), false);
  });
  window.addEventListener("pageshow", function() { apply(currentTheme(), currentTone(), false); });
}

function accountbookThemeJsAsset() {
  if (!AB_ACCOUNTBOOK_THEME_JS_CACHE) {
    AB_ACCOUNTBOOK_THEME_JS_CACHE = `(${accountbookThemeClientMain.toString()})();(${accountbookAmountMaskClientMain.toString()})();`;
  }
  return AB_ACCOUNTBOOK_THEME_JS_CACHE;
}

function unwrapStyleElement(style = "") {
  return String(style || "")
    .replace(/^\s*<style\b[^>]*>/i, "")
    .replace(/<\/style>\s*$/i, "");
}

// 홈을 뺀 열네 화면은 이 CSS 를 **요청마다 인라인으로** 새로 내려보내고 있었다.
// 화면당 22~43 KB, 페이지의 27~50% 였고, 13개 화면이 공유하는 규칙만 20 KB 였다.
// 홈만 캐시되는 스타일시트를 링크해서 1% 였다 — 나머지를 홈과 같은 방식으로 바꾼다.
//
// 조각 넷은 원래 페이지 내용을 보고 골라 넣던 것이다(v2284 는 구역을 잘라내고,
// v2285 는 메뉴·로그인 블록을 더한다). 여기서는 **합집합**을 담는다. 안전한 이유는
// 그 조각들의 셀렉터가 전부 페이지 클래스로 가드돼 있기 때문이다 — abMobileAppSurface,
// abPageKeywords, abPageBackup, abPageMenu, abPageLogin. 해당 클래스가
// 없는 화면에서는 규칙이 아예 매치되지 않으므로 실려 있어도 아무 일도 하지 않는다.
// (그 가드를 실제로 세어서 확인했고, 검사로 고정해 뒀다.)
//
// V2285_NAV_STYLE 은 일부러 뺐다. 그 조각만 :root 에 변수를 전역으로 푼다 — 가드가
// 없는 유일한 조각이라 조건부 인라인으로 남긴다.
let AB_UIUX_CSS_CACHE = "";
function abUiuxCssAsset() {
  if (!AB_UIUX_CSS_CACHE) {
    AB_UIUX_CSS_CACHE = [
      unwrapStyleElement(UIUX_RUNTIME_STYLE),
      unwrapStyleElement(V2281_GUIDED_UIUX_STYLE),
      // V2284 상수는 <style> 태그까지 들고 있다(V2285 조각들은 아니다). 그대로 넣으면
      // CSS 파일 안에 태그가 섞여 그 뒤 규칙 하나가 통째로 죽는다 — 실제로 :root 변수
      // 블록과 .abPageMenu 규칙이 그렇게 사라졌고, 규칙 집합 비교 검사가 그걸 잡았다.
      unwrapStyleElement(V2284_UI_REVALIDATION_STYLE),
      V2285_MENU_STYLE,
      V2285_LOGIN_STYLE,
    ].filter(Boolean).join("\n");
  }
  return AB_UIUX_CSS_CACHE;
}

function mobileHomeCssAsset() {
  if (!AB_MOBILE_HOME_CSS_CACHE) {
    const mobileProbe = '<body class="abV2281 abMobileAppSurface"><main id="smartInput"></main></body>';
    AB_MOBILE_HOME_CSS_CACHE = [
      MOBILE_V81_CSS,
      unwrapStyleElement(UIUX_RUNTIME_STYLE),
      unwrapStyleElement(V2281_GUIDED_UIUX_STYLE),
      unwrapStyleElement(v2284UiStyleFor(mobileProbe)),
    ].filter(Boolean).join("\n");
  }
  return AB_MOBILE_HOME_CSS_CACHE;
}

function rawMobileHomeInlineRuntime() {
  const emptyStats = calculateStats([]);
  const sample = renderMobileV81Html({
    title: "가계부",
    month: "2026-01",
    households: [],
    selectedHousehold: { id: "", name: "가계부", role: "viewer" },
    members: [],
    rows: [],
    filteredRows: [],
    stats: emptyStats,
    prevStats: emptyStats,
    budgets: [],
    reservePlans: [],
    budget: budgetSummary([], []),
    recurring: [],
    meme: null,
    categoryOptions: [],
    paymentOptions: [],
    calendarRows: [],
    sessionRole: "viewer",
    sessionUserId: "",
    isAdminSession: false,
  });
  const marker = "<script>(function(){var q=document.getElementById('v8Search');";
  const start = sample.indexOf(marker);
  const end = start < 0 ? -1 : sample.indexOf("</script>", start + marker.length);
  if (start < 0 || end <= start) throw new Error("mobile home runtime extraction failed");
  return sample.slice(start + "<script>".length, end);
}

// V22.9.84 T-01: 빠른 입력 칩의 고른 상태를 aria-pressed 로 알린다. 칩은 내용 칸(결제수단 칩은 결제수단 칸)을 채우는
// 단추라, 칸 값이 칩 값과 같은 동안만 눌린 상태로 둔다 — 손으로 고치거나 저장 뒤 비우면 풀린다.
// 한 줄 입력이 내용 칸을 이벤트 없이 채우고 초안 복원은 ab:quick-restore 만 알리므로, 빠른 입력 칸 전체의 입력·누름 뒤에 한 번 맞춘다.
function quickChipPressedClientMain() {
  var section = document.querySelector("#add");
  var form = section && section.querySelector("form.form");
  if (!form) return;
  function sync() {
    var memo = form.querySelector("#memoInput");
    var pay = form.querySelector("#payInput");
    var memoValue = memo ? String(memo.value || "").trim() : "";
    var payValue = pay ? String(pay.value || "").trim() : "";
    form.querySelectorAll(".chipRow button").forEach(function (chip) {
      var payOnly = chip.hasAttribute("data-pay-only");
      var own = payOnly ? chip.getAttribute("data-pay-only") : chip.getAttribute("data-memo");
      chip.setAttribute("aria-pressed", own && own === (payOnly ? payValue : memoValue) ? "true" : "false");
    });
  }
  var queued = false;
  function later() {
    if (queued) return;
    queued = true;
    setTimeout(function () { queued = false; sync(); }, 0);
  }
  ["input", "change", "click"].forEach(function (type) { section.addEventListener(type, later); });
  form.addEventListener("reset", later);
  form.addEventListener("ab:quick-restore", later);
  sync();
}

// V22.9.86 T-11(디자인 작업 지시서 3단계): 모바일 홈(과 같은 /app 의 내역 탭) 머리말 — 가계부 이름은 상단 바에 한 번만 두고, 머리말에는 ‹ 7월 › 월 이동 한 줄만 둔다.
// - 서버 HTML 은 그대로다. JS 가 없거나 여기서 멈추면 지금 select·월 입력이 그대로 보인다(숨김 CSS 는 body.abHomeHeadV86 아래에만 있다).
// - 가계부 고르기는 상단 바 이름 링크를 단추로 쓴다. 상단 바에 <button> 을 더하면 메뉴 단추를 ".abNavMobileTop button" 으로 찾는
//   옛 런타임(legacy-ui-runtime.js)이 그 단추를 잡으므로 링크에 role="button" 을 준다. 홈에서 그 링크는 지금 화면(/app)을 가리킨다.
// - 고르기·월 이동 모두 기존 form(GET /app) 을 제출한다. 900px 이상은 CSS 가 바꾸지 않는다(데스크톱은 지시서 T-19).
function homeHeaderClientMain() {
  "use strict";
  // 홈과 내역 탭(/app?tab=transactions — body 에 abMobileAppSurface 가 없다)은 같은 머리말을 쓴다.
  var form = document.querySelector('header.appTop.abV5PageHeader form.selectLine[action="/app"]');
  var month = form && form.querySelector('input[name="month"]');
  if (!form || !month || !/^\d{4}-\d{2}$/.test(month.value)) return;
  var select = form.querySelector('select[name="household_id"]');
  var thisYear = new Date().getFullYear();
  function label(value) {
    var year = Number(value.slice(0, 4));
    return (year === thisYear ? "" : year + "년 ") + Number(value.slice(5, 7)) + "월";
  }
  function shifted(step) {
    var date = new Date(Number(month.value.slice(0, 4)), Number(month.value.slice(5, 7)) - 1 + step, 1);
    return date.getFullYear() + "-" + String(date.getMonth() + 1).padStart(2, "0");
  }
  // ‹ 7월 ›: 가운데 글자 위에 월 입력을 투명하게 겹쳐, 누르면 기존 월 고르기가 열린다.
  // month 를 모르는 브라우저(입력 type 이 text 가 된다)는 투명하게 두면 보이지 않는 글자를 적게 되므로 입력을 그대로 보인다.
  var nav = document.createElement("div");
  var face = document.createElement("label");
  var text = document.createElement("span");
  nav.className = "abMonthNav";
  face.className = month.type === "month" ? "abMonthFace" : "abMonthFace abMonthPlain";
  text.setAttribute("aria-hidden", "true");
  text.textContent = label(month.value);
  month.parentNode.insertBefore(nav, month);
  [-1, 1].forEach(function (step) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = step < 0 ? "abMonthStep abMonthPrev" : "abMonthStep abMonthNext";
    button.setAttribute("aria-label", (step < 0 ? "이전 달 " : "다음 달 ") + label(shifted(step)));
    button.addEventListener("click", function () { month.value = shifted(step); text.textContent = label(month.value); form.submit(); });
    if (step < 0) nav.appendChild(button);
    else { face.appendChild(text); face.appendChild(month); nav.appendChild(face); nav.appendChild(button); }
  });
  document.body.classList.add("abHomeHeadV86");

  var top = document.querySelector(".abNavMobileTop > a");
  var options = select ? Array.prototype.filter.call(select.options, function (option) { return option.value; }) : [];
  if (!top || options.length < 2) return;
  var sheet = document.createElement("div");
  sheet.id = "abHhSheet";
  sheet.className = "abSheet";
  sheet.hidden = true;
  sheet.innerHTML = '<div class="abSheetScrim" data-ab-sheet-close></div><section class="abSheetPanel" role="dialog" aria-modal="true" aria-labelledby="abHhSheetTitle" tabindex="-1"><header class="abSheetHead"><b id="abHhSheetTitle">가계부 고르기</b><button type="button" class="abSheetClose" data-ab-sheet-close aria-label="닫기"></button></header><ul class="abHhList"></ul></section>';
  var list = sheet.querySelector(".abHhList");
  options.forEach(function (option) {
    var item = document.createElement("li");
    var pick = document.createElement("button");
    pick.type = "button";
    pick.value = option.value;
    pick.textContent = option.getAttribute("data-household-name") || option.textContent;
    if (option.selected) pick.setAttribute("aria-current", "true");
    item.appendChild(pick);
    list.appendChild(item);
  });
  document.body.appendChild(sheet);
  var panel = sheet.querySelector(".abSheetPanel");
  var opener = null;
  top.setAttribute("role", "button");
  top.setAttribute("aria-haspopup", "dialog");
  top.setAttribute("aria-controls", sheet.id);
  top.setAttribute("aria-expanded", "false");
  // 이름 글자만 말줄임하고 꺾쇠는 늘 보이게, 링크 안 글자 마디를 하나로 모은다. span 은 셸 CSS ".abNavMobileTop a>span"(로고 칸 28px)이 잡아 b 를 쓴다.
  var name = document.createElement("b");
  name.className = "abHhName";
  Array.prototype.slice.call(top.childNodes).forEach(function (node) { if (node.nodeType === 3) name.appendChild(node); });
  top.appendChild(name);
  top.insertAdjacentHTML("beforeend", '<i class="abHhChevron" aria-hidden="true"></i>');
  function openSheet() {
    opener = document.activeElement;
    sheet.hidden = false;
    top.setAttribute("aria-expanded", "true");
    document.body.classList.add("abSheetOpen");
    var here = list.querySelector('[aria-current="true"]') || list.querySelector("button");
    if (here) here.focus();
  }
  function closeSheet() {
    if (sheet.hidden) return;
    sheet.hidden = true;
    top.setAttribute("aria-expanded", "false");
    document.body.classList.remove("abSheetOpen");
    if (opener && opener.focus) { try { opener.focus(); } catch (_error) {} }
    opener = null;
  }
  top.addEventListener("click", function (event) {
    if (event.button || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    openSheet();
  });
  top.addEventListener("keydown", function (event) {
    if (event.key === " ") { event.preventDefault(); openSheet(); }
  });
  sheet.addEventListener("click", function (event) {
    if (event.target.closest("[data-ab-sheet-close]")) { closeSheet(); return; }
    var pick = event.target.closest(".abHhList button");
    if (!pick) return;
    if (pick.hasAttribute("aria-current")) { closeSheet(); return; }
    select.value = pick.value;
    form.submit();
  });
  document.addEventListener("keydown", function (event) {
    if (sheet.hidden) return;
    if (event.key === "Escape") { event.preventDefault(); closeSheet(); return; }
    if (event.key !== "Tab") return;
    var focusable = Array.prototype.slice.call(panel.querySelectorAll("button"));
    var first = focusable[0], last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  });
}

function mobileHomeJsAsset() {
  if (!AB_MOBILE_HOME_JS_CACHE) {
    AB_MOBILE_HOME_JS_CACHE = [
      quickAmountFieldState.toString(), moneyTokenSpans.toString(), transactionTypeFromText.toString(), quickInputDate.toString(), explicitDateIntent.toString(), parseMobileAmountText.toString(),
      // V22.9.79: 서버(nlu/*)와 같은 해석 함수 — 전각·띄어 쓴 금액 정리, 결제수단·분류·메모 판정(client/shared-input-nlu.js).
      foldInputWidth.toString(), joinSpacedKoreanAmount.toString(), normalizeInputText.toString(), inputPaymentPatterns.toString(), detectInputPayment.toString(), inputPaymentNameIn.toString(), inferInputCategory.toString(), cleanInputMemo.toString(),
      rawMobileHomeInlineRuntime(),
      `(${mobileShellUiClientMain.toString()})();`,
      `(${guidedUiUxClientMain.toString()})();`,
      `(${quickChipPressedClientMain.toString()})();`,
      `(${homeHeaderClientMain.toString()})();`,
    ].join("\n");
  }
  return AB_MOBILE_HOME_JS_CACHE;
}
// @build:exports-start
export { abUiuxCssAsset, accountbookThemeJsAsset, mobileHomeCssAsset, mobileHomeJsAsset };
// @build:exports-end
