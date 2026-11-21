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
  style.textContent = `.abInputReview{display:flex;align-items:center;gap:8px;margin:8px 0 0;color:var(--ab12-text)}.abInputReview .abInputPreview{flex:1;min-width:0;margin:0;font-size:14px;line-height:1.5;overflow-wrap:anywhere}.abAmountActions{display:flex;flex-wrap:wrap;gap:8px;padding:0;margin:0}.abInputReview .abInputFix,.abAmountActions button{min-height:44px;padding:8px 12px;border:1px solid var(--ab12-line);border-radius:12px;background:var(--ab12-surface-raised);color:var(--ab12-text);font:inherit;font-size:13px;overflow-wrap:anywhere;cursor:pointer}.abInputReview .abInputFix{flex:none;padding:8px 16px}.abInputReview .abInputFix:focus-visible,.abAmountActions button:focus-visible{outline:2px solid var(--ab12-accent);outline-offset:3px}.abAmountHint{font-size:13px;line-height:1.6;color:var(--ab12-text);margin:8px 0}.abAmountHint[hidden]{display:none!important}@media(prefers-reduced-motion:reduce){#add .abInputReview *,#add .abAmountActions *{animation:none!important;transition:none!important}}`;
  document.head.appendChild(style);
  style.textContent += '#add .abAmountActions [data-ab-amount-add] .abPrivateAmount{filter:none!important}';
  style.textContent += '.abAmountActions button span{pointer-events:none}.abAmountActions,.abAmountHint{grid-column:1/-1}#add .abAmountActions button{width:auto!important;flex:none;font-size:13px!important;font-weight:600;background:var(--ab12-surface-raised)!important;color:var(--ab12-text)!important;border-color:var(--ab12-line)!important}#add .seg input[type=radio]{display:block!important;position:absolute;width:1px!important;height:1px!important;opacity:0;clip-path:inset(50%);overflow:hidden}#add .seg input:focus-visible+span{outline:2px solid var(--ab12-accent);outline-offset:3px}';
  // V22.9.138(독립 검토): [고치기]가 구분으로 보내면 숨긴 라디오에 초점이 가도 손가락·마우스로 누른 뒤에는 :focus-visible 이 서지 않는다 — 구분 묶음에 표시를 단다.
  // 금액 단축 단추 곁의 결과 줄(.abAmountNow)은 누른 뒤에만 보인다.
  style.textContent += '#add .seg[data-ab-fix-target]{outline:2px solid var(--ab12-accent);outline-offset:3px}.abAmountNow{flex-basis:100%;margin:0;font-size:13px;line-height:1.6;color:var(--ab12-text)}.abAmountNow[hidden]{display:none!important}';
  // V22.9.138 U-16(작업 지시서 7단계 ‘빠른 입력 시트 3층’): 해석 칩 다섯(시트에서 세 줄)을 해석 결과 한 줄 + [고치기] 로 바꾼다(2층).
  // 줄은 ‘지출 · 식비 · 점심 · 12,000원 · 국민카드 · 오늘’ 꼴이다. 모르는 값은 글로 적는다(‘금액 미입력’·‘금액 형식 확인’·‘금액 둘 이상’·‘분류 확인 중’·
  // ‘분류 미입력’·‘내용 미입력’·‘구분 확인 필요’·‘날짜 미입력’ — 색만으로 알리지 않는다). 비어 있는 결제수단은 적지 않는다(저장에 없어도 된다). 날짜는 ‘오늘’·‘어제’·
  // ‘7월 14일’(다른 해는 ‘2025년 12월 31일’)이다 — ISO 날짜를 보이지 않는다(V137:H-7). 저장을 막는 까닭(외화·금액 둘·구분·금액·날짜·내용)은 공용 입력
  // 컨트롤러가 #quickAfter 의 data-ab-quick-block 에 적고, 분류를 묻는 중인지는 data-ab-quick-category 에 적는다 — 안내 글을 읽지 않는다.
  // [고치기]는 그 까닭의 칸으로 초점을 옮긴다: 금액 둘이면 한 줄 입력, 외화·금액이면 금액 칸, 구분, 날짜, 내용, 까닭이 없으면 분류. 3층(접힌 ‘자세히’)은
  // 그 칸이 3층에 있을 때만 연다. 한 줄 입력 아래 안내(.smartHint)는 이 줄이 대신하므로 숨긴다(스크립트가 없으면 그대로 보인다).
  // 금액 단축 단추(+1천 … 지우기)는 3층 맨 끝으로 옮기고(작업 지시서), 금액 안내(형식·예산 넘침)는 금액 칸 바로 아래에 둔다(접혀도 보이게).
  const review = document.createElement("div");
  review.className = "abInputReview";
  review.setAttribute("role", "group");
  review.setAttribute("aria-label", "입력 결과 확인");
  const preview = document.createElement("p");
  preview.className = "abInputPreview";
  preview.id = "abInputPreview";
  const fix = document.createElement("button");
  fix.type = "button";
  fix.className = "abInputFix";
  fix.dataset.abInputFix = "1";
  fix.setAttribute("aria-describedby", "abInputPreview");
  fix.textContent = "고치기";
  review.append(preview, fix);
  const smart = document.getElementById("smartInput");
  const anchor = smart?.closest(".smartLine") || smart || amount;
  anchor.after(review);
  const hint = anchor.parentElement?.querySelector(".smartHint");
  if (hint) hint.hidden = true;
  const typeField = () => form.querySelector('input[name="type"]:checked') || form.querySelector('input[name="type"]');
  const quickState = name => document.getElementById("quickAfter")?.getAttribute(name) || "";
  const blockReason = () => quickState("data-ab-quick-block");
  const seg = form.querySelector(".seg");
  function focusField(field) {
    if (!field) return;
    let parent = field.parentElement;
    while (parent && parent !== form) { if (parent.tagName === "DETAILS") parent.open = true; parent = parent.parentElement; }
    field.focus({ preventScroll: true });
    if (["text", "search", "tel", "number"].includes(field.type)) { try { field.select(); } catch (_error) {} }
    field.scrollIntoView({ block: "nearest", behavior: "auto" });
  }
  function dayLabel(value) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(value || "")) return "";
    const day = offset => new Date(Date.now() + 32400000 + offset * 86400000).toISOString().slice(0, 10);
    if (value === day(0)) return "오늘";
    if (value === day(-1)) return "어제";
    return (value.slice(0, 4) === day(0).slice(0, 4) ? "" : Number(value.slice(0, 4)) + "년 ") + Number(value.slice(5, 7)) + "월 " + Number(value.slice(8, 10)) + "일";
  }
  const more = document.getElementById("quickMore");
  function fixTarget() {
    const reason = blockReason(), memo = document.getElementById("memoInput");
    if (reason === "split") return smart || amount;
    if (reason === "foreign" || reason === "amount") return amount;
    if (reason === "type") return typeField() || amount;
    if (reason === "date") return document.getElementById("txDate") || amount;
    if (reason === "memo") return memo || amount;
    if (!amount.value || !validAmount()) return amount;
    if (memo && !memo.value.trim()) return memo;
    return document.getElementById("catInput") || amount;
  }
  fix.addEventListener("click", () => {
    const target = fixTarget();
    if (seg && target?.type === "radio") seg.setAttribute("data-ab-fix-target", "");
    focusField(target);
  });
  if (seg) for (const type of ["change", "focusout"]) seg.addEventListener(type, () => seg.removeAttribute("data-ab-fix-target"));
  const actions = document.createElement("div");
  actions.className = "abAmountActions";
  actions.setAttribute("role", "group"); actions.setAttribute("aria-label", "빠른 금액 입력");
  // V22.9.138(독립 검토): 단추가 3층 맨 끝이라 누를 때마다 금액 칸(1층)으로 초점을 옮기면 시트가 위로 뛰고 휴대폰 자판이 떠 이어 누르기 어렵다.
  // 초점은 누른 단추에 두고, 결과(‘금액 13,000원’·‘금액을 지웠어요’·더할 수 없는 까닭)를 단추 곁의 결과 줄에 적는다(읽기 프로그램도 읽는다).
  // 금액이 다른 데서 바뀌면 결과 줄을 숨긴다.
  const amountNow = document.createElement("p");
  amountNow.className = "abAmountNow"; amountNow.setAttribute("role", "status"); amountNow.hidden = true;
  let shortcutValue = null;
  const sayAmount = text => { shortcutValue = amount.value; amountNow.textContent = text; amountNow.hidden = false; };
  for (const [label, delta] of [["+1천",1000],["+5천",5000],["+1만",10000],["+5만",50000],["지우기",0]]) {
    const button = document.createElement("button"); button.type = "button"; button.textContent = label;
    button.dataset.abAmountAdd = String(delta);
    button.addEventListener("click", () => {
      const state = quickAmountFieldState(amount);
      const value = amount.value ? state.value : 0;
      if (delta && amount.value && (!state.valid || !amount.validity.valid)) {
        sayAmount("금액 형식과 20억원 상한을 확인한 뒤 더해 주세요."); return;
      }
      amount.value = delta ? (value + delta).toLocaleString("ko-KR") : "";
      shortcutValue = amount.value;
      amount.dispatchEvent(new Event("input", { bubbles: true })); amount.dispatchEvent(new Event("change", { bubbles: true }));
      sayAmount(amount.value ? "금액 " + amount.value + "원" : "금액을 지웠어요");
    });
    actions.appendChild(button);
  }
  actions.appendChild(amountNow);
  const moreBody = more?.querySelector(".quickMoreBody") || more;
  if (moreBody && form.contains(moreBody)) moreBody.appendChild(actions); else amount.after(actions);
  const message = document.createElement("p");
  message.className = "abAmountHint"; message.setAttribute("role", "status"); message.hidden = true;
  amount.after(message);
  const validAmount = () => quickAmountFieldState(amount).valid;
  function render() {
    const reason = blockReason();
    if (!amountNow.hidden && amount.value !== shortcutValue) amountNow.hidden = true;
    const parts = [reason === "type" ? "구분 확인 필요" : typeField()?.value === "income" ? "수입" : "지출"];
    const category = (document.getElementById("catInput")?.value || "").trim();
    parts.push(category || (quickState("data-ab-quick-category") === "pending" ? "분류 확인 중" : "분류 미입력"));
    const memo = (document.getElementById("memoInput")?.value || "").trim();
    parts.push(memo || "내용 미입력");
    parts.push(reason === "split" ? "금액 둘 이상" : !amount.value ? "금액 미입력" : validAmount() ? Number(amount.value.replace(/,/g, "")).toLocaleString("ko-KR") + "원" : "금액 형식 확인");
    const payment = (document.getElementById("payInput")?.value || "").trim();
    if (payment) parts.push(payment);
    parts.push(dayLabel(document.getElementById("txDate")?.value) || "날짜 미입력");
    const text = parts.join(" · ");
    if (preview.textContent !== text) preview.textContent = text;
    if (amount.value && !validAmount()) {
      message.textContent = "금액은 1원부터 20억원까지 숫자로 입력해 주세요."; message.hidden = false; return;
    }
    const after = document.getElementById("quickAfter"), date = document.getElementById("txDate");
    let scope = [];
    try { scope = JSON.parse(after?.getAttribute("data-bsc") || "[]"); } catch (_error) {}
    const rawCategory = document.getElementById("catInput")?.value || "";
    const budgetApplies = scope[1] === 0 || Array.isArray(scope[1]) && scope[1].includes(rawCategory);
    const month = form.querySelector('input[name="month"]')?.value;
    const over = validAmount() && typeField()?.value !== "income" && after?.getAttribute("data-has-budget") === "1" && date?.value.slice(0,7) === month && budgetApplies && Number(amount.value.replace(/,/g,"")) > Number(after.getAttribute("data-remaining") || 0);
    const budgetText = over ? "입력한 금액이 이번 달 남은 예산을 넘습니다. 실제 지출을 저장할 수 있습니다." : "";
    if (message.textContent !== budgetText) message.textContent = budgetText;
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
