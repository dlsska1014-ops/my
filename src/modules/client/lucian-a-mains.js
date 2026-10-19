// @build:imports-start
import { quickAmountFieldState } from "./shared-input-parsers.js";
// @build:imports-end
// Lucian UX/UI Prompt #035 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#035
// Lucian UX/UI Prompt #145 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#145
function accountbookInputReviewClientMain() {
  const amount = document.getElementById("amountInput");
  const form = amount?.closest("form");
  if (!form || form.dataset.abInputReview) return;
  form.dataset.abInputReview = "1";
  const style = document.createElement("style");
  style.textContent = `.abInputReview{margin:12px 0;color:var(--ab12-text)}.abInputReview p{font-size:13px;color:var(--ab12-muted);margin:0 0 8px}.abInputReview ul,.abAmountActions{display:flex;flex-wrap:wrap;gap:8px;padding:0;list-style:none;margin:8px 0}.abInputReview li{min-width:0;max-width:100%}.abInputReview button,.abAmountActions button{min-height:44px;padding:8px 12px;border:1px solid var(--ab12-line);border-radius:12px;background:var(--ab12-surface-raised);color:var(--ab12-text);font:inherit;font-size:13px;overflow-wrap:anywhere;cursor:pointer}.abInputReview button:focus-visible,.abAmountActions button:focus-visible{outline:2px solid var(--ab12-accent);outline-offset:3px}.abInputReview .isUnknown{color:var(--ab12-muted)}.abAmountHint{font-size:13px;line-height:1.6;color:var(--ab12-text);margin:8px 0}.abAmountHint[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){#add .abInputReview *,#add .abAmountActions *{animation:none!important;transition:none!important}}`;
  document.head.appendChild(style);
  style.textContent += '#add .abAmountActions [data-ab-amount-add] .abPrivateAmount{filter:none!important}';
  style.textContent += '.abInputReview button span,.abAmountActions button span{pointer-events:none}.abAmountActions,.abAmountHint{grid-column:1/-1}#add .abAmountActions button{width:auto!important;flex:none;font-size:13px!important;font-weight:600;background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}#add .seg input[type=radio]{display:block!important;position:absolute;width:1px!important;height:1px!important;opacity:0;clip-path:inset(50%);overflow:hidden}#add .seg input:focus-visible+span{outline:2px solid var(--ab12-accent);outline-offset:3px}';
  const review = document.createElement("section");
  review.className = "abInputReview";
  review.setAttribute("aria-label", "입력 결과 확인");
  const intro = document.createElement("p");
  intro.textContent = "항목을 눌러 내용을 확인하고 고치세요.";
  const list = document.createElement("ul");
  review.append(intro, list);
  const smart = document.getElementById("smartInput");
  const anchor = smart?.closest(".smartLine") || smart || amount;
  anchor.after(review);
  const definitions = [
    ["date", "날짜", "txDate"], ["amount", "금액", "amountInput"],
    ["type", "구분", "type"], ["category", "분류", "catInput"], ["payment", "결제수단", "payInput"],
  ];
  const buttons = new Map();
  function targetFor(key, id) {
    if (key === "type") return form.querySelector('input[name="type"]:checked') || form.querySelector('input[name="type"]');
    return document.getElementById(id);
  }
  function focusField(field) {
    if (!field) return;
    let parent = field.parentElement;
    while (parent && parent !== form) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
    field.focus({ preventScroll: true });
    if (["text", "search", "tel", "number"].includes(field.type)) { try { field.select(); } catch (_error) {} }
    field.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  for (const [key, label, id] of definitions) {
    const item = document.createElement("li"), button = document.createElement("button");
    button.type = "button";
    button.dataset.abInputField = key;
    button.addEventListener("click", () => focusField(targetFor(key, id)));
    item.appendChild(button); list.appendChild(item); buttons.set(key, button);
  }
  const actions = document.createElement("div");
  actions.className = "abAmountActions";
  actions.setAttribute("role", "group"); actions.setAttribute("aria-label", "빠른 금액 입력");
  for (const [label, delta] of [["+1천",1000],["+5천",5000],["+1만",10000],["+5만",50000],["지우기",0]]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.dataset.abAmountAdd = String(delta);
    button.addEventListener("click", () => {
      const state = quickAmountFieldState(amount);
      const value = amount.value ? state.value : 0;
      if (delta && amount.value && (!state.valid || !amount.validity.valid)) {
        message.textContent = "금액 형식과 20억원 상한을 확인한 뒤 더해 주세요."; message.hidden = false; return;
      }
      amount.value = delta ? (value + delta).toLocaleString("ko-KR") : "";
      amount.dispatchEvent(new Event("input", { bubbles: true })); amount.dispatchEvent(new Event("change", { bubbles: true }));
      amount.focus({ preventScroll: true });
    });
    actions.appendChild(button);
  }
  amount.after(actions);
  const message = document.createElement("p");
  message.className = "abAmountHint"; message.setAttribute("role", "status"); message.hidden = true;
  actions.after(message);
  const validAmount = () => quickAmountFieldState(amount).valid;
  function render() {
    for (const [key, label, id] of definitions) {
      const field = targetFor(key, id), button = buttons.get(key);
      let value = field?.value || "";
      if (key === "type") value = document.getElementById("quickAfter")?.textContent.includes("수입 또는 지출을 직접") ? "확인 필요" : value === "income" ? "수입" : "지출";
      if (key === "amount" && value) value = validAmount() ? Number(value.replace(/,/g, "")).toLocaleString("ko-KR") + "원" : "형식 확인";
      if (key === "category" && !value && document.getElementById("quickAfter")?.textContent.includes("분류를 확인하고")) value = "확인 중";
      const text = label + " · " + (value || "미입력");
      if (button.textContent !== text) button.textContent = text;
      button.classList.toggle("isUnknown", !field?.value || value === "확인 필요" || value === "형식 확인");
      button.setAttribute("aria-label", text + ". 입력칸으로 이동");
    }
    if (amount.value && !validAmount()) {
      message.textContent = "금액은 1원부터 20억원까지 숫자로 입력해 주세요."; message.hidden = false; return;
    }
    const after = document.getElementById("quickAfter"), date = document.getElementById("txDate");
    let scope = [];
    try { scope = JSON.parse(after?.getAttribute("data-bsc") || "[]"); } catch (_error) {}
    const category = document.getElementById("catInput")?.value || "";
    const budgetApplies = scope[1] === 0 || Array.isArray(scope[1]) && scope[1].includes(category);
    const month = form.querySelector('input[name="month"]')?.value;
    const over = validAmount() && targetFor("type", "type")?.value !== "income" && after?.getAttribute("data-has-budget") === "1" && date?.value.slice(0,7) === month && budgetApplies && Number(amount.value.replace(/,/g,"")) > Number(after.getAttribute("data-remaining") || 0);
    const text = over ? "입력한 금액이 이번 달 남은 예산을 넘습니다. 실제 지출을 저장할 수 있습니다." : "";
    if (message.textContent !== text) message.textContent = text;
    message.hidden = !over;
  }
  // The shared controller publishes after parsing, formatting, validity and preview finish.
  document.addEventListener("ab:quick-update", render);
  for (const type of ["input", "change"]) document.addEventListener(type, event => { if (!event.isComposing && (form.contains(event.target) || event.target === smart)) render(); });
  form.addEventListener("submit", event => { if (!validAmount()) { event.preventDefault(); render(); focusField(amount); } });
  render();
}

function accountbookInputReviewJsAsset() {
  return `// Lucian UX/UI Prompt #035, #145 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/\n(${accountbookInputReviewClientMain.toString()})();`;
}
// @build:exports-start
export { accountbookInputReviewJsAsset };
// @build:exports-end
