
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
    if (event.key === themeKey || event.key === toneKey) apply(currentTheme(), currentTone(), false);
  });
  window.addEventListener("pageshow", function() { apply(currentTheme(), currentTone(), false); });
}

function accountbookThemeJsAsset() {
  if (!AB_ACCOUNTBOOK_THEME_JS_CACHE) {
    AB_ACCOUNTBOOK_THEME_JS_CACHE = `(${accountbookThemeClientMain.toString()})();`;
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

function mobileHomeJsAsset() {
  if (!AB_MOBILE_HOME_JS_CACHE) {
    AB_MOBILE_HOME_JS_CACHE = [
      moneyTokenSpans.toString(), transactionTypeFromText.toString(), quickInputDate.toString(), explicitDateIntent.toString(), parseMobileAmountText.toString(),
      rawMobileHomeInlineRuntime(),
      `(${mobileShellUiClientMain.toString()})();`,
      `(${guidedUiUxClientMain.toString()})();`,
    ].join("\n");
  }
  return AB_MOBILE_HOME_JS_CACHE;
}
