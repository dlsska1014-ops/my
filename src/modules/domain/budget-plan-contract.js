// Pure budget-only contract. Both the Worker and its isolated browser asset inject
// the same normalizer and exact unit scanner; neither implementation rounds won.
function createBudgetPlanContract(normalizeCategory, scanMoney) {
  const maxAmount = 2000000000, maxInputRows = 200, maxPlanRows = 100;
  const incomeDefaults = ["월급", "상여/성과급", "부수입", "기타수입"];
  function parseAmount(value = "") {
    const raw = String(value ?? "").trim();
    if (!raw) return 0;
    if (raw.length > 256) return NaN;
    const integer = raw.match(/^(?:[₩￦]\s*)?(\d+|\d{1,3}(?:,\d{3})+)\s*원?$/);
    if (integer) {
      const amount = Number(integer[1].replace(/,/g, ""));
      return Number.isSafeInteger(amount) ? amount : NaN;
    }
    if (!/[십백천만억]/.test(raw)) return NaN;
    const spans = scanMoney(raw);
    return spans.length === 1 && spans[0].raw === raw && Number.isSafeInteger(spans[0].amount) ? spans[0].amount : NaN;
  }
  function calculate(input = {}) {
    const { incomeNames = [], incomeAmounts = [], expenseNames = [], expenseAmounts = [] } = input;
    const errors = [], notes = [], entries = [], plan = new Map();
    const error = (kind, index, field, code, message) => errors.push({ kind, index, field, code, message });
    if (![incomeNames, incomeAmounts, expenseNames, expenseAmounts].every(Array.isArray)
      || incomeNames.length !== incomeAmounts.length || expenseNames.length !== expenseAmounts.length) {
      error("plan", -1, "", "budget_input_shape", "이름과 금액 행의 개수가 다릅니다. 계획을 다시 열어 같은 행에 이름과 금액을 입력해 주세요.");
      return { valid: false, errors, notes, entries, rows: [], income: null, expense: null, net: null };
    }
    if (incomeNames.length + expenseNames.length > maxInputRows) error("plan", -1, "", "budget_input_too_many", "입력 행은 수입과 지출을 합쳐 200개까지 가능합니다. 빈 행도 제거해 주세요.");
    for (const [kind, names, amounts, length] of [["income", incomeNames, incomeAmounts, 60], ["expense", expenseNames, expenseAmounts, 80]]) {
      for (let index = 0; index < names.length; index += 1) {
        const amount = parseAmount(amounts[index]);
        // Amount validation precedes both blank-name and zero-row exclusion.
        if (!Number.isSafeInteger(amount) || amount < 0 || amount > maxAmount) {
          error(kind, index, "amount", "invalid_budget_amount", "0원부터 20억원까지 정수 금액을 입력해 주세요. 소수 원·부호·지수·잘못된 쉼표는 사용할 수 없습니다.");
          continue;
        }
        const rawName = String(names[index] ?? "").trim();
        const name = rawName.slice(0, length).trim() || (kind === "income" ? incomeDefaults[index] || `수입${index + 1}` : "");
        const entry = { kind, index, name, amount, included: false };
        entries.push(entry);
        if (!amount) { notes.push({ kind, index, message: "빈 금액·0원 행은 새 계획에 저장하지 않습니다. 기존 행도 전체 교체 시 제외됩니다." }); continue; }
        if (!name) { notes.push({ kind, index, message: "지출 이름이 비어 있어 이 금액은 합계와 저장에서 제외됩니다. 포함하려면 분류를 입력해 주세요." }); continue; }
        if (kind === "expense" && /^__(?:total$|income(?::|$))/.test(name)) {
          error(kind, index, "name", "budget_reserved_category", "이 이름은 이전 총액·수입의 예약 이름입니다. 일반 지출 분류 이름으로 바꿔 주세요.");
          continue;
        }
        if (name !== rawName) notes.push({ kind, index, message: `저장 이름: ${name}${rawName ? ` (앞 ${length}자)` : " (현재 행 순서의 기본 이름)"}` });
        const category = kind === "income" ? `__income:${name}` : name;
        // Type is part of identity; normalizing '__income:' must never merge
        // a normal expense called 'income 월급' with an income called '월급'.
        const key = `${kind}:${normalizeCategory(category)}`;
        const prior = plan.get(key);
        if (prior && prior.amount !== amount) {
          const message = `같은 정규화 이름의 ${prior.index + 1}행과 금액이 다릅니다. 한 행만 남기거나 같은 금액으로 맞춰 주세요.`;
          error(kind, index, "amount", "budget_duplicate_category", message);
          error(kind, prior.index, "amount", "budget_duplicate_category", `${index + 1}행과 같은 이름에 서로 다른 금액이 있습니다. 중복을 정리해 주세요.`);
        } else if (prior) notes.push({ kind, index, message: "같은 이름·같은 금액의 중복 행입니다. 합계와 저장에 한 번만 반영합니다." });
        else { plan.set(key, { category, amount, kind, index }); entry.included = true; }
      }
    }
    const rows = [...plan.values()].map(({ category, amount }) => ({ category, amount }));
    if (rows.length > maxPlanRows) error("plan", -1, "", "budget_plan_too_many", "저장할 양수 계획은 중복을 제외하고 100행까지 가능합니다. 행을 줄여 주세요.");
    const income = [...plan.values()].filter(row => row.kind === "income").reduce((sum, row) => sum + row.amount, 0);
    const expense = [...plan.values()].filter(row => row.kind === "expense").reduce((sum, row) => sum + row.amount, 0);
    if (![income, expense, income - expense].every(Number.isSafeInteger)) error("plan", -1, "", "invalid_budget_amount", "합계가 안전한 정수 범위를 넘었습니다. 금액을 줄여 주세요.");
    const valid = errors.length === 0;
    return { valid, errors, notes, entries, rows: valid ? rows : [], income: valid ? income : null, expense: valid ? expense : null, net: valid ? income - expense : null };
  }
  return { parseAmount, calculate, maxAmount, maxInputRows, maxPlanRows };
}

// @build:exports-start
export { createBudgetPlanContract };
// @build:exports-end
