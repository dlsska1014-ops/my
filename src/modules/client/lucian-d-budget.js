// @build:imports-start
import { moneyTokenSpans } from "./shared-input-parsers.js";
import { createBudgetPlanContract } from "../domain/budget-plan-contract.js";
import { normalizeText } from "../nlu/amount-parser.js";
import { escapeHtml, numberWithCommas } from "../domain/transactions-core.js";
// @build:imports-end

const BUDGET_PREVIEW_JS_PATH = "/assets/accountbook-budget-preview-v22993.js";

function budgetPlanInput(incomeRows = [], expenseRows = []) {
  return {
    incomeNames: incomeRows.map(row => row.name), incomeAmounts: incomeRows.map(row => row.amount),
    expenseNames: expenseRows.map(row => row.name), expenseAmounts: expenseRows.map(row => row.amount),
  };
}

function budgetDraftRows(draft, kind) {
  const names = kind === "income" ? draft.incomeNames : draft.expenseNames;
  const amounts = kind === "income" ? draft.incomeAmounts : draft.expenseAmounts;
  return Array.from({ length: Math.max(names.length, amounts.length) }, (_, index) => ({ name: names[index] ?? "", amount: amounts[index] ?? "" }));
}

// Lucian UX/UI Prompt #143 · MIT License (c) 2026 Seokwoooo · https://lucianlabs.dev/uxui-prompt/#143
// The editing calculation pattern is adapted; the sample's coercion and arrow-key
// overrides are not used. All money is calculated by the shared save contract.
function renderBudgetPlanPreview(incomeRows = [], expenseRows = [], budgets = [], failure = "", reloadUrl = "") {
  const result = createBudgetPlanContract(normalizeText, moneyTokenSpans).calculate(budgetPlanInput(incomeRows, expenseRows));
  const amount = value => result.valid ? `${numberWithCommas(value)}원` : "계산 보류";
  const legacy = budgets.filter(row => row.category === "__total" || row.category === "__income");
  const initialState = result.valid
    ? "처음 표시한 입력의 합계입니다. 자동 계산이 준비되면 편집한 값을 갱신합니다. 음수 차액도 저장할 수 있으며, 실제 수입·지출 요약과 구분합니다."
    : "오류가 있어 현재 합계를 계산하지 않았습니다. 아래 안내에 따라 입력을 고쳐 주세요.";
  return `<style>${budgetPlanPreviewCss()}</style><section class="abBudgetPreview" aria-label="저장 전 미리보기" data-budget-preview data-state="initial"><h3>저장 전 미리보기</h3><p>현재 입력한 계획입니다. 아래 저장 버튼을 눌러야 이 가계부·월의 계획 전체가 교체됩니다.</p><dl><div><dt>예상 수입 합계</dt><dd><output data-budget-total="income" aria-live="off">${amount(result.income)}</output></dd></div><div><dt>계획한 지출 합계</dt><dd><output data-budget-total="expense" aria-live="off">${amount(result.expense)}</output></dd></div><div><dt>계획상 차액</dt><dd><output data-budget-total="net" aria-live="off">${amount(result.net)}</output></dd></div></dl><p data-budget-preview-state>${escapeHtml(initialState)}</p><div data-budget-errors>${result.errors.map(item => `<p>${escapeHtml(item.kind === "plan" ? "계획" : `${item.kind === "income" ? "수입" : "지출"} ${item.index + 1}행`)}: ${escapeHtml(item.message)}</p>`).join("")}</div><p>빈 금액은 0원입니다. 0원 행과 이름이 빈 지출 행은 교체할 계획에서 빠지며 기존 행도 제외됩니다. 같은 이름·같은 금액은 한 번만 반영합니다. 수입 이름은 앞 60자, 지출 이름은 앞 80자를 사용합니다. 입력은 총 200행, 저장할 양수 계획은 100행까지 가능합니다.</p>${legacy.length ? `<p class="abBudgetLegacy"><b>이전 총액 행은 이 미리보기에 포함하지 않습니다.</b> ${legacy.map(row => `${row.category === "__total" ? "월 전체 예산" : "월 수입 기준"} ${numberWithCommas(row.amount)}원`).join(" · ")}. 저장하면 이 특수 행은 제외되고 현재 종류별 수입·분류별 지출로 전체 교체됩니다. 예상 수입이 없어도 실제 수입을 미리보기에 더하지 않습니다.</p>` : ""}${failure ? `<p class="abBudgetFailure" role="alert">${escapeHtml(budgetDraftFailureMessage(failure))} 입력값과 처음 열린 계획의 확인값을 보존했습니다. <a href="${escapeHtml(reloadUrl)}" data-budget-reload>최신 저장 계획 다시 열기</a></p>` : ""}<p class="abBudgetLive" data-budget-live role="status" aria-live="polite" aria-atomic="true"></p><noscript><p>입력 중 자동 계산은 JavaScript가 필요합니다. 현재 합계는 처음 표시한 값이며 저장할 때 서버가 모든 입력을 다시 검사합니다.</p></noscript></section><script src="${BUDGET_PREVIEW_JS_PATH}" defer></script>`;
}

function budgetDraftFailureMessage(code = "") {
  const messages = {
    budget_changed: "다른 사용자가 계획을 바꾸어 저장하지 않았습니다. 최신 계획을 확인하고 내용을 비교해 주세요.",
    budget_form_stale: "처음 열린 계획을 확인할 수 없어 저장하지 않았습니다. 최신 계획을 다시 열어 비교해 주세요.",
    budget_read_failed: "최신 예산을 읽지 못해 저장하지 않았습니다. 입력을 보존한 채 잠시 후 다시 시도할 수 있습니다.",
    budget_busy: "다른 저장이 진행 중이어서 저장하지 않았습니다. 잠시 후 다시 시도해 주세요.",
    db_write_unknown: "저장 결과를 확인하지 못했습니다. 성공으로 처리하지 않았습니다. 다시 제출하기 전에 최신 저장 계획을 확인해 주세요.",
    budget_save_failed: "계획을 저장하지 못했습니다. 입력 내용을 보존했습니다. 잠시 후 다시 시도해 주세요.",
  };
  return messages[code] || "입력 오류가 있어 저장하지 않았습니다. 행 안내를 확인하고 고친 뒤 다시 저장해 주세요.";
}

function budgetPlanPreviewCss() {
  return `.abBudgetPreview{margin:18px 0;padding:16px;border:1px solid var(--line,#cbd5e1);border-radius:var(--ab12-r-lg,16px);background:var(--card-2,#f8fafc);color:var(--text,#101828);overflow-wrap:anywhere;min-width:0}.abBudgetPreview h3{margin:0 0 8px}.abBudgetPreview p{font-size:13px;line-height:1.65}.abBudgetPreview dl{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.abBudgetPreview dl>div{min-width:0}.abBudgetPreview dt{font-size:13px;color:var(--sub,#475467)}.abBudgetPreview dd{margin:6px 0;font-weight:700;font-size:clamp(18px,3vw,24px);font-variant-numeric:tabular-nums;overflow-wrap:anywhere}.abBudgetPreview [data-budget-errors],.abBudgetRowNote.isError{color:var(--ab12-gauge-over,#b91c1c)}.abBudgetPreview[data-state=invalid]{border-style:dashed}.abBudgetPreview [data-budget-preview-state]{font-weight:600}.abBudgetRowNote{grid-column:1/-1;margin:4px 0 8px;font-size:13px;line-height:1.6;overflow-wrap:anywhere;color:var(--sub,#475467)}.abBudgetRemove{grid-column:1/-1;justify-self:start;min-height:44px;padding:8px 12px;font:inherit;border:1px solid var(--line,#cbd5e1);border-radius:10px;background:var(--card,#fff);color:var(--text,#101828)!important}.abBudgetPreview a{color:var(--accent,#1d4ed8)}.abBudgetPreview :focus-visible,.abBudgetRemove:focus-visible{outline:3px solid var(--accent,#1d4ed8);outline-offset:3px}.abBudgetLive{position:absolute;width:1px;height:1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}.abBudgetLegacy,.abBudgetFailure{padding:10px;border:1px solid currentColor;border-radius:10px}html[data-ab-resolved-theme=dark] .abBudgetRowNote.isError,html[data-ab-theme=dark] .abBudgetRowNote.isError{color:#fca5a5}@media(max-width:600px){.abBudgetPreview dl{grid-template-columns:1fr}.abBudgetPreview dd{font-size:22px}}@media(prefers-reduced-motion:reduce){.abBudgetPreview *{animation:none!important;transition:none!important}}`;
}

function budgetPlanPreviewClientMain(contract) {
  const form = document.querySelector("#budgetBulkForm,#budgetPlanForm");
  if (!form || form.dataset.budgetPreviewReady) return;
  const preview = form.querySelector("[data-budget-preview]");
  if (!preview) return;
  form.dataset.budgetPreviewReady = "1";
  const live = preview.querySelector("[data-budget-live]"), composing = new Set();
  const state = preview.querySelector("[data-budget-preview-state]");
  const errorsBox = preview.querySelector("[data-budget-errors]");
  const kinds = ["income", "expense"], names = { income: "income_name", expense: "budget_category" }, amounts = { income: "income_amount", expense: "budget_amount" };
  const containers = { income: form.querySelector("#incomeRows"), expense: form.querySelector("#expenseRows") };
  const templates = Object.create(null), initial = Object.create(null);
  let noteId = 0, announceTimer, pendingNotice = null, latestResult = null, revision = 0, liveKind = "message", suspended = false;
  const hiddenAmountMessage = "저장 전 미리보기의 금액을 갱신했습니다.";
  const lines = kind => Array.from(containers[kind].children).filter(line => line.querySelector(`[name="${names[kind]}"]`));
  function read() {
    const input = Object.create(null);
    kinds.forEach(kind => {
      input[kind + "Names"] = lines(kind).map(line => line.querySelector(`[name="${names[kind]}"]`).value);
      input[kind + "Amounts"] = lines(kind).map(line => line.querySelector(`[name="${amounts[kind]}"]`).value);
    });
    return input;
  }
  function decorate(line, kind) {
    if (line.querySelector("[data-budget-remove]")) return;
    const remove = document.createElement("button");
    remove.type = "button"; remove.className = "abBudgetRemove"; remove.dataset.budgetRemove = kind; remove.textContent = "이 행 제거";
    const note = document.createElement("p"); note.className = "abBudgetRowNote"; note.dataset.budgetRowNote = ""; note.id = "budgetRowNote" + (++noteId);
    line.querySelectorAll("input").forEach(input => input.setAttribute("aria-describedby", ((input.getAttribute("aria-describedby") || "") + " " + note.id).trim()));
    line.append(remove, note);
  }
  function make(kind, name = "", amount = "") {
    const line = templates[kind].cloneNode(true);
    line.querySelectorAll("[id]").forEach(node => node.removeAttribute("id"));
    line.querySelectorAll("[data-budget-remove],[data-budget-row-note]").forEach(node => node.remove());
    line.querySelectorAll("input").forEach(input => { input.removeAttribute("aria-describedby"); input.setCustomValidity(""); input.removeAttribute("aria-invalid"); });
    const nameInput = line.querySelector(`[name="${names[kind]}"]`), amountInput = line.querySelector(`[name="${amounts[kind]}"]`);
    nameInput.value = String(name); amountInput.value = String(amount); nameInput.defaultValue = String(name); amountInput.defaultValue = String(amount);
    decorate(line, kind); return line;
  }
  kinds.forEach(kind => {
    const current = lines(kind);
    if (current.length) templates[kind] = current[0].cloneNode(true);
    else {
      const line = document.createElement("div"); line.className = form.id === "budgetPlanForm" ? "planLine" : "budgetLine";
      const name = document.createElement("input"), amount = document.createElement("input");
      name.name = names[kind]; name.setAttribute("aria-label", kind === "income" ? "수입 종류" : "지출 분류");
      amount.name = amounts[kind]; amount.inputMode = "numeric"; amount.setAttribute("aria-label", "금액");
      line.append(name, amount); templates[kind] = line;
    }
    initial[kind] = current.map(line => ({ name: line.querySelector(`[name="${names[kind]}"]`).value, amount: line.querySelector(`[name="${amounts[kind]}"]`).value }));
    current.forEach(line => decorate(line, kind));
  });
  function cancelAnnouncement() {
    clearTimeout(announceTimer);
    pendingNotice = null;
  }
  function writeAnnouncement(message, kind) {
    liveKind = kind;
    if (live.textContent !== message) live.textContent = message;
  }
  function announce(message, immediate = false, kind = "message") {
    cancelAnnouncement();
    const notice = { message, kind, revision };
    pendingNotice = notice;
    announceTimer = setTimeout(() => {
      if (pendingNotice !== notice) return;
      pendingNotice = null;
      if (suspended || composing.size || notice.revision !== revision) return;
      if (kind === "totals") {
        if (!latestResult?.valid) return;
        const result = latestResult;
        message = document.documentElement.hasAttribute("data-ab-hide-amounts") ? hiddenAmountMessage : `예상 수입 ${result.income.toLocaleString("ko-KR")}원, 계획한 지출 ${result.expense.toLocaleString("ko-KR")}원, 계획상 차액 ${result.net.toLocaleString("ko-KR")}원. ${state.textContent}`;
      }
      writeAnnouncement(message, kind);
    }, immediate ? 0 : 650);
  }
  function privacyChanged(hidden = document.documentElement.hasAttribute("data-ab-hide-amounts")) {
    const pendingTotal = pendingNotice?.kind === "totals";
    if (pendingTotal) cancelAnnouncement();
    // Clear only monetary summaries, including during IME composition. Keep
    // row numbers, limits and validation instructions in general notices.
    if (hidden && (pendingTotal || liveKind === "totals")) writeAnnouncement(hiddenAmountMessage, "totals");
  }
  function update(speak = true, immediate = false) {
    cancelAnnouncement(); revision++; latestResult = null;
    if (composing.size) {
      preview.dataset.state = "composing";
      state.textContent = "입력을 확정하면 다시 계산합니다. 현재 합계는 계산 중입니다.";
      preview.querySelectorAll("[data-budget-total]").forEach(output => { output.textContent = "계산 중"; });
      return null;
    }
    const result = contract.calculate(read());
    latestResult = result;
    kinds.forEach(kind => lines(kind).forEach((line, index) => {
      const name = line.querySelector(`[name="${names[kind]}"]`), amount = line.querySelector(`[name="${amounts[kind]}"]`);
      const errors = result.errors.filter(error => error.kind === kind && error.index === index);
      [name, amount].forEach((input, at) => { const error = errors.find(error => error.field === (at ? "amount" : "name")); input.setCustomValidity(error?.message || ""); input.setAttribute("aria-invalid", error ? "true" : "false"); });
      const note = line.querySelector("[data-budget-row-note]");
      const notes = result.notes.filter(item => item.kind === kind && item.index === index && (String(amount.value).trim() || String(amount.defaultValue).trim() || !/빈 금액/.test(item.message)));
      const text = [...errors, ...notes].map(item => item.message).join(" ");
      if (note.textContent !== text) note.textContent = text;
      note.hidden = !text; note.classList.toggle("isError", errors.length > 0);
      line.querySelector("[data-budget-remove]").setAttribute("aria-label", `${kind === "income" ? "수입" : "지출"} ${index + 1}행 제거`);
    }));
    preview.dataset.state = result.valid ? "valid" : "invalid";
    preview.querySelectorAll("[data-budget-total]").forEach(output => {
      const text = result.valid ? result[output.dataset.budgetTotal].toLocaleString("ko-KR") + "원" : "계산 보류";
      if (output.textContent !== text) output.textContent = text;
    });
    const message = result.valid ? result.net < 0 ? "계획한 지출이 예상 수입보다 큽니다. 음수 차액도 저장할 수 있습니다." : "현재 입력한 계획을 계산했습니다. 저장 버튼을 눌러 확정해 주세요." : "오류가 있어 현재 합계를 계산하지 않았습니다. 표시한 행을 고쳐 주세요.";
    state.textContent = message;
    const errorText = result.errors.map(error => `${error.kind === "plan" ? "계획" : `${error.kind === "income" ? "수입" : "지출"} ${error.index + 1}행`}: ${error.message}`).join(" ");
    errorsBox.textContent = errorText;
    if (speak) announce(result.valid ? "" : errorText, immediate, result.valid ? "totals" : "message");
    return result;
  }
  const relevant = target => target?.matches?.('[name="income_name"],[name="income_amount"],[name="budget_category"],[name="budget_amount"]');
  form.addEventListener("compositionstart", event => { if (relevant(event.target)) { composing.add(event.target); event.target.setCustomValidity(""); event.target.removeAttribute("aria-invalid"); update(false); } });
  form.addEventListener("compositionend", event => { composing.delete(event.target); if (relevant(event.target)) update(); });
  form.addEventListener("input", event => { if (relevant(event.target) && !event.isComposing) update(); });
  form.addEventListener("change", event => { if (relevant(event.target)) update(true, true); });
  form.addEventListener("focusout", event => { if (relevant(event.target) && !composing.size) update(true, true); });
  form.addEventListener("click", event => {
    const add = event.target.closest("[data-add]");
    if (add && form.contains(add)) {
      const kind = add.dataset.add;
      if (!kinds.includes(kind)) return;
      if (kinds.reduce((n, type) => n + lines(type).length, 0) >= contract.maxInputRows) { state.textContent = "입력은 수입과 지출을 합쳐 200행까지 가능합니다. 먼저 불필요한 행을 제거해 주세요."; announce(state.textContent, true); return; }
      const line = make(kind); containers[kind].appendChild(line); line.querySelector("input").focus(); update(true, true); return;
    }
    const remove = event.target.closest("[data-budget-remove]");
    if (remove && form.contains(remove)) {
      const kind = remove.dataset.budgetRemove, line = remove.closest(".budgetLine,.planLine");
      const next = line.nextElementSibling || line.previousElementSibling;
      line.remove(); (next?.querySelector("input") || form.querySelector(`[data-add="${kind}"]`)).focus(); update(true, true); return;
    }
    const picker = event.target.closest(".pickValue");
    if (picker) return;
  });
  form.addEventListener("change", event => {
    const select = event.target.closest(".pickValue");
    if (!select || !select.value) return;
    const input = select.closest(".budgetLine,.planLine")?.querySelector("input");
    if (input) { input.value = select.value; update(true, true); }
  });
  form.addEventListener("reset", event => {
    event.preventDefault(); composing.clear();
    kinds.forEach(kind => { containers[kind].replaceChildren(...initial[kind].map(row => make(kind, row.name, row.amount))); });
    update(true, true);
  });
  form.addEventListener("submit", event => {
    const result = update(false);
    if (!result?.valid) { event.preventDefault(); announce(result ? errorsBox.textContent : "입력을 확정한 뒤 저장해 주세요.", true); form.querySelector('[aria-invalid="true"]')?.focus(); }
  });
  // Reload is an explicit reconciliation action. No stale token is ever refreshed
  // in place, and no browser storage or editing-time request is introduced.
  const reload = form.querySelector("[data-budget-reload]");
  if (reload) { const query = new URLSearchParams({ household_id: form.elements.household_id.value, month: form.elements.month.value }); reload.href = (form.id === "budgetPlanForm" ? "/budgets?" : "/my/settings?") + query; }
  window.addEventListener("ab:amount-privacy", () => privacyChanged());
  // The blocking theme also changes this attribute on storage/pageshow before
  // E emits its event. Observe just this one attribute, not document contents,
  // so an existing live total is cleared before E rewraps it as private text.
  const privacyObserver = new MutationObserver(() => privacyChanged());
  const observePrivacy = () => privacyObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["data-ab-hide-amounts"] });
  observePrivacy();
  window.addEventListener("pagehide", () => { suspended = true; cancelAnnouncement(); privacyObserver.disconnect(); });
  window.addEventListener("pageshow", () => {
    suspended = false; cancelAnnouncement();
    // Theme restoration may set the privacy attribute after this listener.
    // Never retain or replay a monetary announcement from the previous page.
    if (liveKind === "totals") writeAnnouncement("", "message");
    observePrivacy(); update(false); privacyChanged();
  });
  update(false);
  privacyChanged();
}

// Keep the published V53 immutable asset byte-for-byte stable while the server
// normalizer changes its allocation strategy. The budget contract remains p2.
function pinnedBudgetNormalizeText(text) {
  return String(text || "")
    .replace(/^@[\w가-힣_-]+\s*/, "")
    .replace(/^\/+/, "")
    .replace(/[，]/g, ",")
    .replace(/[₩￦]/g, "원")
    .replace(/원정/g, "원")
    .replace(/만 원/g, "만원")
    .replace(/천 원/g, "천원")
    .replace(/처넌/g, "천원")
    .replace(/처눤/g, "천원")
    .replace(/백 원/g, "백원")
    .replace(/십 원/g, "십원")
    // V22.9.34 감사 D1·N2: 시각(19:40)·괄호 속 카드 끝자리((1234))·가린 카드번호·카드 문자의 누적·잔액·한도
    // 금액은 기호를 지우기 전에 뺀다. 지우고 나면 "19 40", " 1234 " 가 되어 금액으로 읽혔다.
    .replace(/\b\d{1,2}:\d{2}(?::\d{2})?\b/g, " ")
    .replace(/\(\s*\d{2,4}\s*\)/g, " ")
    .replace(/\d{2,4}(?:[-\s]?[*＊xX]{2,})+(?:[-\s]?\d{2,4})?/g, " ")
    .replace(/[*＊xX]{2,}[-\s]?\d{2,4}/g, " ")
    .replace(/(?:누적|잔액|잔고|남은\s*한도|한도)\s*:?\s*[\d,]+\s*원?/g, " ")
    .replace(/[~!@#$^&*_=\`|\\{}\[\]:;"'<>?]/g, " ")
    .replace(/[()]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function budgetPlanPreviewJsAsset() {
  return `(${budgetPlanPreviewClientMain.toString()})((${createBudgetPlanContract.toString()})(${pinnedBudgetNormalizeText.toString().replace("function pinnedBudgetNormalizeText(", "function normalizeText(")},${moneyTokenSpans.toString()}));`;
}

// @build:exports-start
export {
  BUDGET_PREVIEW_JS_PATH, budgetDraftRows, budgetPlanPreviewJsAsset, renderBudgetPlanPreview,
};
// @build:exports-end
