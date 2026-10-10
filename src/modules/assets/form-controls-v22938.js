const AB_CONTROLS_38_CSS_PATH = "/assets/accountbook-controls-v22938.css";
const AB_CONTROLS_38_JS_PATH = "/assets/accountbook-controls-v22938.js";
const AB_CONTROLS_38_CSS = `
body.abControls38{--ab38-bg:#fff;--ab38-fg:#172033;--ab38-muted:#475467;--ab38-line:#98a2b3;--ab38-active:#e8efff}
html[data-ab-resolved-theme="dark"] body.abControls38{--ab38-bg:#182333;--ab38-fg:#f2f4f7;--ab38-muted:#d0d5dd;--ab38-line:#667085;--ab38-active:#294265}
body.abControls38 :is(button,select,input:not([type=hidden]):not([type=checkbox]):not([type=radio]),.btn,.lrSeg a,.lrWeeks a,.reportMonthNav a){min-height:44px!important}
body.abControls38 :is(button,input,select,textarea,a):focus-visible{outline:3px solid #537fe7!important;outline-offset:3px}
body.abControls38 .ab38Combo{position:relative;min-width:0;display:block}
body.abControls38 .ab38Combo>input{width:100%;box-sizing:border-box;min-width:0}
body.abControls38 .ab38Options{position:absolute;z-index:80;top:100%;left:0;right:0;max-height:264px;overflow:auto;background:var(--ab38-bg);color:var(--ab38-fg);border:1px solid var(--ab38-line);border-radius:12px;box-shadow:0 10px 28px #0003;margin:4px 0;padding:4px;text-align:left;font-size:14px;font-weight:500}
body.abControls38 .ab38Options [role=option]{display:flex;align-items:center;min-height:44px;padding:8px 12px;box-sizing:border-box;border-radius:8px;cursor:pointer;overflow-wrap:anywhere}
body.abControls38 .ab38Options [aria-selected=true]{background:var(--ab38-active);font-weight:700}
body.abControls38 .ab38Options p{padding:10px;margin:0;color:var(--ab38-muted)}
body.abControls38 .ab38Sr{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
body.abControls38 [hidden]{display:none!important}
body.abControls38 .ab38MenuSearch{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;margin:18px 0;padding:16px;border:1px solid var(--ab38-line);border-radius:18px;background:var(--ab38-bg);color:var(--ab38-fg)}
body.abControls38 .ab38MenuSearch label{display:grid;gap:6px;min-width:0;font-weight:700}
body.abControls38 .ab38MenuSearch input{background:var(--ab38-bg);color:var(--ab38-fg);border:1px solid var(--ab38-line);border-radius:10px;padding:10px;width:100%;box-sizing:border-box;font:inherit}
body.abControls38 .ab38MenuSearch button{align-self:end;background:var(--ab38-active);color:var(--ab38-fg);border:1px solid var(--ab38-line);border-radius:10px;padding:8px 14px;font:inherit}
body.abControls38 .ab38MenuSearch p{grid-column:1/-1;color:var(--ab38-muted);margin:0}
body.abPageSettings.abControls38 .budgetLine{grid-template-columns:minmax(0,1fr) minmax(100px,.7fr)}
body.abPageSettings.abControls38 .budgetLine:not(:has(.ab38Combo)){grid-template-columns:minmax(0,1fr) minmax(0,.8fr) minmax(90px,.7fr)}
body.abPageSettings.abControls38 .ab38Recurring td{vertical-align:top}
body.abPageReserve.abControls38 .reserveEdit[open]>.reserveSmartForm[data-guided-layout="1"]{display:block!important}
body.abPageReserve.abControls38 :is(.reservePrimaryGrid,.reserveSchedule,.reserveOptionalGrid)>*{min-width:0}
body.abControls38 .reserveEdit:not([open])>form{display:none!important}
body.abControls38 .reserveEdit summary{min-height:44px!important}
body.abPageReserve.abControls38 .reserveActions:has(.reserveEdit[open]){grid-column:1/-1;width:100%}
body.abPageReserve.abControls38 .reserveEdit[open]{width:100%;box-sizing:border-box}
@media(max-width:700px){
body.abPageSettings.abControls38 .ab38Recurring,body.abPageSettings.abControls38 .ab38Recurring tbody{display:block;width:100%}
body.abPageSettings.abControls38 .ab38Recurring thead{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%)}
body.abPageSettings.abControls38 .ab38Recurring tr{display:grid;grid-template-columns:1fr 1fr;gap:8px;border:1px solid var(--ab38-line);border-radius:16px;padding:14px;margin:12px 0;background:var(--ab38-bg);color:var(--ab38-fg)}
body.abPageSettings.abControls38 .ab38Recurring td{display:block;border:0;padding:4px;min-width:0;overflow-wrap:anywhere;white-space:normal}
body.abPageSettings.abControls38 .ab38Recurring td::before{content:attr(data-label);display:block;color:var(--ab38-muted);font-size:12px;margin-bottom:4px}
body.abPageSettings.abControls38 .ab38Recurring td:last-child,body.abPageSettings.abControls38 .ab38Recurring td[colspan]{grid-column:1/-1}
body.abPageSettings.abControls38 .ab38Recurring .formGrid{display:grid;grid-template-columns:1fr;gap:10px}
body.abPageSettings.abControls38 .ab38Recurring .reserveEdit summary{min-height:44px;display:flex;align-items:center;cursor:pointer}
body.abPageSettings.abControls38 .ab38Recurring input,body.abPageSettings.abControls38 .ab38Recurring select{max-width:100%;box-sizing:border-box}
}
`;

function accountbookControls38Main() {
  if (!document.body.classList.contains("abControls38")) return;
  let sequence = 0;
  const enhanced = new WeakSet();
  const sourceValues = new WeakMap();
  const sources = new WeakMap();
  function enhance(input) {
    if (input.disabled || input.type === "hidden") return;
    const line = input.closest(".budgetLine,.planLine");
    const select = line && line.querySelector(".pickValue");
    const list = document.getElementById(input.getAttribute("list") || "");
    const options = list || sources.get(input) || select;
    if (!options) return;
    const values = Array.from(new Set(Array.from(options.querySelectorAll("option")).map(option => option.value).filter(Boolean)));
    if (!values.length) return;
    sources.set(input, options);
    sourceValues.set(input, values);
    if (enhanced.has(input)) {
      if (input.hasAttribute("list")) input.removeAttribute("list");
      return;
    }
    enhanced.add(input);
    const wrap = document.createElement("span");
    wrap.className = "ab38Combo";
    input.before(wrap);
    wrap.appendChild(input);
    const popup = document.createElement("span");
    popup.className = "ab38Options";
    popup.id = `ab38-options-${++sequence}`;
    popup.setAttribute("role", "listbox");
    popup.hidden = true;
    const help = document.createElement("span");
    help.className = "ab38Sr";
    help.id = `ab38-help-${sequence}`;
    help.textContent = "분류를 검색하거나 직접 입력하세요. 방향키로 선택하고 Enter로 적용합니다. Escape로 닫습니다.";
    wrap.append(popup, help);
    input.setAttribute("role", "combobox");
    input.setAttribute("aria-autocomplete", "list");
    input.setAttribute("aria-controls", popup.id);
    input.setAttribute("aria-expanded", "false");
    input.setAttribute("aria-describedby", [input.getAttribute("aria-describedby"), help.id].filter(Boolean).join(" "));
    if (!input.labels?.length && !input.getAttribute("aria-label")) input.setAttribute("aria-label", input.name === "income_name" ? "수입 종류" : "분류");
    input.removeAttribute("list");
    input.autocomplete = "off";
    if (select) {
      const label = select.closest("label");
      (label && label !== input.closest("label") ? label : select).hidden = true;
    }
    let items = [], active = -1;
    const close = () => { popup.hidden = true; input.setAttribute("aria-expanded", "false"); input.removeAttribute("aria-activedescendant"); active = -1; };
    const selectIndex = index => {
      active = index;
      Array.from(popup.querySelectorAll('[role="option"]')).forEach((option, i) => option.setAttribute("aria-selected", String(i === active)));
      const option = popup.children[active];
      if (option && items.length) { input.setAttribute("aria-activedescendant", option.id); option.scrollIntoView({ block: "nearest" }); }
      else input.removeAttribute("aria-activedescendant");
    };
    const choose = index => {
      if (items[index] === undefined) return;
      input.value = items[index];
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
      close(); input.focus();
    };
    const open = () => {
      const query = input.value.trim().toLocaleLowerCase();
      items = sourceValues.get(input).filter(value => !query || value.toLocaleLowerCase().includes(query)).slice(0, 60);
      popup.replaceChildren(); active = -1;
      for (let index = 0; index < items.length; index++) {
        const option = document.createElement("span");
        option.id = `${popup.id}-${index}`; option.setAttribute("role", "option"); option.setAttribute("aria-selected", "false");
        option.textContent = items[index];
        option.addEventListener("pointerdown", event => event.preventDefault());
        option.addEventListener("click", () => choose(index));
        popup.appendChild(option);
      }
      if (!items.length) { const empty = document.createElement("p"); empty.textContent = "일치하는 분류가 없습니다. 입력한 내용을 그대로 사용할 수 있어요."; popup.appendChild(empty); }
      popup.hidden = false; input.setAttribute("aria-expanded", "true"); input.removeAttribute("aria-activedescendant");
    };
    input.addEventListener("focus", open);
    input.addEventListener("input", open);
    input.addEventListener("keydown", event => {
      if (event.isComposing) return;
      if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        event.preventDefault(); if (popup.hidden) open();
        if (items.length) selectIndex(event.key === "ArrowDown" ? (active + 1) % items.length : (active <= 0 ? items.length : active) - 1);
      } else if (event.key === "Enter" && !popup.hidden && active >= 0) { event.preventDefault(); choose(active); }
      else if (event.key === "Escape" && !popup.hidden) { event.preventDefault(); event.stopPropagation(); close(); }
      else if (event.key === "Tab") close();
    });
    wrap.addEventListener("focusout", () => setTimeout(() => { if (!wrap.contains(document.activeElement)) close(); }, 0));
    document.addEventListener("pointerdown", event => { if (!wrap.contains(event.target)) close(); });
  }
  function scan() {
    document.querySelectorAll('.ab38Combo>input,input[list],.budgetLine input[name="budget_category"],.budgetLine input[name="income_name"],.planLine input[name="budget_category"],.planLine input[name="income_name"]').forEach(enhance);
  }
  scan();
  let queued = false;
  const observer = new MutationObserver(records => {
    if (!records.some(record => record.type === "attributes" || (!record.target.closest?.(".ab38Combo") && Array.from(record.addedNodes).some(node => node.nodeType === 1)))) return;
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; scan(); });
  });
  observer.observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ["list"] });
  if (!document.body.classList.contains("abPageMenu")) return;
  const context = document.querySelector(".menuContext");
  if (!context) return;
  const panel = document.createElement("div"); panel.className = "ab38MenuSearch";
  const label = document.createElement("label"); label.textContent = "메뉴 찾기";
  const search = document.createElement("input"); search.type = "search"; search.placeholder = "예: 예산, 생활비 리포트"; search.id = "ab38-menu-search";
  label.appendChild(search);
  const reset = document.createElement("button"); reset.type = "button"; reset.textContent = "검색 지우기";
  const status = document.createElement("p"); status.setAttribute("role", "status"); status.setAttribute("aria-live", "polite");
  panel.append(label, reset, status); context.after(panel);
  const links = Array.from(document.querySelectorAll(".menuRow,.featuredCard"));
  const groups = Array.from(document.querySelectorAll(".menuSection,.advancedGroup"));
  const advanced = document.querySelector(".advancedGroup");
  const originalOpen = advanced?.open;
  function filter() {
    const query = search.value.trim().toLocaleLowerCase(); let count = 0;
    links.forEach(link => { link.hidden = !!query && !link.textContent.toLocaleLowerCase().includes(query); if (!link.hidden) count++; });
    groups.forEach(group => { group.hidden = !Array.from(group.querySelectorAll(".menuRow,.featuredCard")).some(link => !link.hidden); });
    if (advanced) advanced.open = query ? !advanced.hidden : originalOpen;
    status.textContent = query ? count ? `${count}개 메뉴를 찾았습니다.` : "검색 결과가 없습니다. 다른 단어로 검색하거나 검색을 지워 주세요." : "전체 메뉴를 표시합니다.";
    reset.hidden = !query;
  }
  search.addEventListener("input", filter);
  search.addEventListener("keydown", event => { if (event.key === "Escape") { search.value = ""; filter(); } });
  reset.addEventListener("click", () => { search.value = ""; filter(); search.focus(); });
  filter();
}

function accountbookControls38JsAsset() {
  return `(${accountbookControls38Main.toString()})();`;
}
// @build:exports-start
export {
  AB_CONTROLS_38_CSS, AB_CONTROLS_38_CSS_PATH, AB_CONTROLS_38_JS_PATH, accountbookControls38JsAsset,
};
// @build:exports-end
