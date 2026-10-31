// V22.9.79 — 금액·분류·결제수단 해석 묶음: V44 A-07·A-10·A-16, V77 N-11·N-13.
//
// ── 이 파일이 왜 생겼는지 ──
// 같은 문장을 웹 한 줄 입력(홈 자산 안의 빠른 입력)과 카카오에 보내면 서로 다르게 읽는 곳이 남아 있었다.
//   A-07 ‘택시 만 오천원’: 카카오(서버)는 한 금액 15,000원인데 웹 미리 보기는 ‘만’ 10,000원 + ‘오천원’ 두 금액이었다.
//   A-10 ‘아이패드’·‘카펫’: 서버는 낱말 속 글자를 걸러 기타지출인데 웹 화면 쪽 분류 추정은 육아/자녀·반려동물이었다.
//   A-16 전각 숫자 ‘커피 ４５００’을 못 읽었고, ‘1+1 우유 3000’(덤 행사)·‘생수 2 박스’ 같은 수량이 금액으로 읽혀 거절됐다.
//   N-11 ‘토스트 3000’: 웹의 결제수단 판정은 V22.9.77 N-1 수정 전 그대로라 결제수단 ‘토스’·메모 ‘트’였다.
//   N-13 ‘교통카드 충전’의 메모가 ‘교통 충전’, 띄어 쓴 ‘카드 지갑’·‘신용 회복’이 결제수단 ‘카드’·‘신용카드’를 정했다.
// 원인은 서버(nlu/*), 홈 인라인 스크립트(my/mobile-home.js), 옛 화면(client/legacy-ui-runtime.js)이 같은 판정을 따로 들고 있던 것이다.
// 이제 판정은 공유 함수(client/shared-input-nlu.js)가 정본이고 서버와 화면이 같은 본문을 쓴다.
//
// ── 어떻게 잡는가 ──
// 같은 문장을 ① 카카오 해석(parseTransaction·parseMultipleTransactions, 그리고 /skill 저장), ② 홈이 실제로 받는 자산을 가짜 DOM 에서 돌린
// 웹 빠른 입력, ③ 옛 화면 런타임, ④ 서버 분류 API(/u/api/input-classification)에 넣어 금액·메모·결제수단·분류·구분·날짜가 같은지 본다.
// 항목마다 고쳐진 것(양성)과 예전 그대로여야 하는 것(음성)을 함께 둔다.
// V22979_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 확인하는 용도).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, api, counter, fixture, page, post, withClock } from "./lib-audit-v22934.mjs";
import { moneyTokenSpans, parseMultipleTransactions, parseTransaction } from "../src/index.js";

const SOFT = process.env.V22979_SOFT === "1";
const base = counter("V22.9.79 금액·분류·결제수단 해석(A-07·A-10·A-16·N-11·N-13) 웹·카카오 같은 해석 검사");
const failures = [];
let softChecks = 0;
const t = {
  ok(value, message) {
    if (SOFT) { softChecks += 1; if (!value) failures.push(message); return; }
    base.ok(value, message);
  },
  eq(actual, expected, message) {
    if (SOFT) { softChecks += 1; if (actual !== expected) failures.push(`${message} (받음 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`); return; }
    base.eq(actual, expected, message);
  },
};

const HH = "house-home";
const DAY = "2026-08-05";
const bundleSource = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const slice = (text, from, to) => {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`조각을 못 찾음: ${from.slice(0, 50)}`);
  const end = text.indexOf(to, start);
  if (end < 0) throw new Error(`조각 끝을 못 찾음: ${to.slice(0, 50)}`);
  return text.slice(start, end);
};

// ── 카카오 쪽 해석 ───────────────────────────────────────────────────────────────
function kakao(text) {
  const rows = parseMultipleTransactions(text, {});
  const one = parseTransaction(text, {});
  const row = rows[0];
  return { rows, one, row, ok: rows.length > 0, view: row ? { amount: row.amount, memo: row.memo, payment: row.payment_method, category: row.category, type: row.type, date: row.transaction_date } : null };
}

// ── 웹 쪽 해석: 홈이 받는 자산을 가짜 DOM 에서 돌린다(validate-audit-corrections-v22930 의 createState 와 같은 방식) ─────────
function makeWebFactory(script, { paymentOptions = [], categoryOptions = [], fetchImpl = null } = {}) {
  const end = script.indexOf("\n(function mobileShellUiClientMain");
  if (end < 0) throw new Error("홈 자산에서 빠른 입력 끝 경계를 못 찾음");
  const body = script.slice(0, end);
  return function createState({ today = DAY, household = "" } = {}) {
    const form = {
      handlers: {}, hidden: [],
      appendChild(node) { this.hidden.push(node); },
      querySelector(selector) {
        if (selector === 'input[name="month"]') return { value: today.slice(0, 7) };
        if (selector === 'input[name="household_id"]' && household) return { value: household };
        return null;
      },
      addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); },
    };
    const node = (value = "", attrs = {}) => ({
      value, textContent: "", attrs, handlers: {}, focus() {},
      getAttribute(key) { return this.attrs[key] ?? null; }, setAttribute(key, v) { this.attrs[key] = String(v); },
      setCustomValidity(v) { this.validity = v; }, addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); }, closest() { return form; },
    });
    const fields = { smartInput: node(), amountInput: node(), memoInput: node(), payInput: node(), catInput: node(), txDate: node(today), rawTextInput: node(), quickAfter: node("", {}), type: "expense" };
    const radios = { expense: node(), income: node() };
    for (const [kind, radio] of Object.entries(radios)) Object.defineProperty(radio, "checked", { get() { return fields.type === kind; }, set(v) { if (v) fields.type = kind; } });
    const document = {
      getElementById(id) { return fields[id] || null; },
      createElement() { return node(); },
      addEventListener() {},
      querySelectorAll(selector) {
        if (selector === "#categoryList option") return categoryOptions.map((value) => ({ value }));
        if (selector === "#paymentList option") return paymentOptions.map((value) => ({ value }));
        if (selector === "input[name=type]") return Object.values(radios);
        return [];
      },
      querySelector(selector) {
        if (selector === "#add form.form") return form;
        if (selector === "input[name=type][value=income]:checked") return fields.type === "income" ? radios.income : null;
        const match = selector.match(/input\[name=type\]\[value="?(income|expense)"?\]/);
        return match ? radios[match[1]] : null;
      },
    };
    vm.runInContext(body, vm.createContext({ document, window: { addEventListener() {} }, location: { hash: "" }, navigator: {}, Intl, Date, setTimeout, clearTimeout, URLSearchParams, ...(fetchImpl ? { fetch: fetchImpl, AbortController } : {}) }));
    const fire = (field, kind) => { for (const fn of field.handlers[kind] || []) fn.call(field, { target: field }); };
    return {
      fields, form,
      fill(text) { fields.smartInput.value = text; fire(fields.smartInput, "input"); return this; },
      edit(id, value) { fields[id].value = value; fire(fields[id], "input"); return this; },
      submit() { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const fn of form.handlers.submit || []) fn.call(form, event); return !event.defaultPrevented; },
      values() {
        return {
          household_id: HH, month: today.slice(0, 7), type: fields.type, transaction_date: fields.txDate.value, amount: fields.amountInput.value, memo: fields.memoInput.value,
          category: fields.catInput.value, payment_method: fields.payInput.value, raw_text: fields.rawTextInput.value, user_id: "user-bin", return_to: `/app?month=${today.slice(0, 7)}&household_id=${HH}`,
          ...Object.fromEntries(form.hidden.map((hidden) => [hidden.name, hidden.value])),
        };
      },
      view() { return { amount: Number(String(fields.amountInput.value).replace(/,/g, "")) || 0, memo: fields.memoInput.value, payment: fields.payInput.value, category: fields.catInput.value, type: fields.type, date: fields.txDate.value }; },
    };
  };
}

// ── 옛 화면 런타임(mobileUiUxClientMain): 홈이 아닌 화면에 인라인으로 실리는 사본. Enter 로 채운다 ─────────────────────────────
function makeLegacyRunner(helpersSource, rules) {
  const legacySource = slice(bundleSource, "function mobileUiUxClientMain() {", "\nfunction mobileShellUiClientMain");
  return function runLegacy(text, { paymentOptions = [] } = {}) {
    const node = (value = "") => ({ value, textContent: "", focus() {}, setAttribute() {}, addEventListener() {}, getAttribute() { return null; } });
    const fields = { smartInput: node(), amountInput: node(), memoInput: node(), payInput: node(), catInput: node(), txDate: node(DAY), rawTextInput: node(), type: "expense" };
    const handlers = {};
    fields.smartInput.addEventListener = (kind, fn) => { (handlers[kind] ||= []).push(fn); };
    const radios = { expense: {}, income: {} };
    for (const [kind, radio] of Object.entries(radios)) Object.defineProperty(radio, "checked", { get() { return fields.type === kind; }, set(v) { if (v) fields.type = kind; } });
    const hint = node();
    const document = {
      getElementById(id) { return fields[id] || null; },
      querySelectorAll(selector) { return selector === "#paymentList option" ? paymentOptions.map((value) => ({ value })) : []; },
      querySelector(selector) {
        if (selector === ".smartHint") return hint;
        const match = selector.match(/input\[name="type"\]\[value="(income|expense)"\]/);
        return match ? radios[match[1]] : null;
      },
    };
    const sandbox = vm.createContext({ document, window: { AB_CATEGORY_RULES: rules, addEventListener() {} }, location: { pathname: "/app", search: "", hash: "" }, history: { replaceState() {} }, navigator: {}, Intl, Date, URLSearchParams });
    vm.runInContext(`${helpersSource}\n(${legacySource})();`, sandbox);
    fields.smartInput.value = text;
    for (const fn of handlers.keydown || []) fn.call(fields.smartInput, { key: "Enter", preventDefault() {}, stopImmediatePropagation() {} });
    return { amount: Number(String(fields.amountInput.value).replace(/,/g, "")) || 0, memo: fields.memoInput.value, payment: fields.payInput.value, category: fields.catInput.value, type: fields.type, raw: fields.rawTextInput.value };
  };
}

// 한 문장을 카카오·웹(·옛 화면)에 넣어 기대한 값과 서로의 같음을 함께 본다. expected 의 키만 비교한다.
function expectParse(label, text, expected, { web, legacy, legacyKeys = ["amount", "memo", "payment", "category", "type"] } = {}) {
  const k = kakao(text);
  const w = web(text);
  t.ok(k.ok, `${label} 카카오가 읽는다: "${text}"`);
  for (const [key, value] of Object.entries(expected)) {
    t.eq(k.view?.[key], value, `${label} 카카오 ${key}: "${text}"`);
    t.eq(w.view()[key], value, `${label} 웹 ${key}: "${text}"`);
  }
  for (const key of ["amount", "memo", "payment", "category", "type", "date"]) t.eq(w.view()[key], k.view?.[key], `${label} 웹과 카카오가 같다(${key}): "${text}"`);
  if (legacy) {
    const l = legacy(text);
    // 옛 화면은 걸린 분류가 없으면 분류 칸을 채우지 않는다(예전과 같음). 그 밖에는 카카오와 같아야 한다.
    for (const key of legacyKeys) t.eq(l[key], key === "category" && k.view?.[key] === "기타지출" ? "" : k.view?.[key], `${label} 옛 화면도 카카오와 같다(${key}): "${text}"`);
  }
}
function expectRejected(label, text, { web }) {
  const k = kakao(text);
  const w = web(text);
  t.ok(!k.ok, `${label} 카카오는 거절한다(금액 없음): "${text}"`);
  t.eq(w.view().amount, 0, `${label} 웹 금액 칸도 비어 있다: "${text}"`);
  t.eq(w.submit(), false, `${label} 웹은 저장 버튼이 막힌다: "${text}"`);
}

await withClock(DAY, () => fixture(async (fx) => {
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear();
  globalThis.__AB_KAKAO_INFLIGHT?.clear();
  fx.db.accountbook_settings.push({ id: "sel-user-bin-v22979", key: "kakao_selected_household_v2251:user-bin", value: HH, created_at: "2026-07-01T00:00:00Z" });

  // 홈이 실제로 받는 자산을 홈 화면의 스크립트 주소에서 찾는다(자산 주소의 판 번호가 올라가도 이 검사는 그대로 쓴다).
  const home = await page(fx, `/app?month=${DAY.slice(0, 7)}&household_id=${HH}`);
  const runtimeSrc = (home.html.match(/<script id="mobileAppInlineRuntime" src="(\/assets\/mobile-home-shell-v\d+\.js)"/) || [])[1] || "";
  t.ok(!!runtimeSrc, `홈이 빠른 입력 런타임 자산을 불러온다(${runtimeSrc})`);
  const script = await (await app.fetch(new Request(`${BASE}${runtimeSrc}`), fx.env, ctx)).text();
  const helpers = slice(script, "function moneyTokenSpans(", "(function(){var q=");
  const rulesAsset = (script.match(/^window\.AB_CATEGORY_RULES=(\[.*?\]);window\.AB_TYPE_HINTS=/s) || [])[1] || "[]";
  const rules = JSON.parse(rulesAsset);
  t.ok(rules.length > 20, "홈 자산이 분류 규칙을 함께 싣는다");

  const createState = makeWebFactory(script);
  const web = (text) => createState().fill(text);
  const legacy = makeLegacyRunner(helpers, rules);

  // ── 공유 해석 함수는 홈 자산에 그대로 실려 간다(뒤돌아보기 정규식 없음) ───────────────────────────────
  const sharedStart = script.indexOf("function foldInputWidth(");
  const shared = sharedStart >= 0 ? script.slice(sharedStart, script.indexOf("(function(){var q=", sharedStart)) : "";
  for (const name of ["foldInputWidth", "joinSpacedKoreanAmount", "normalizeInputText", "inputPaymentPatterns", "detectInputPayment", "inferInputCategory", "cleanInputMemo"]) {
    t.ok(shared.includes(`function ${name}(`), `홈 자산이 공유 함수 ${name} 를 싣는다`);
  }
  t.ok(shared !== "" && !/\(\?<[=!]/.test(shared) && !/\(\?<[=!]/.test(helpers.slice(0, helpers.indexOf("function foldInputWidth("))), "홈 자산의 해석 함수에 뒤돌아보기 정규식이 없다(옛 Safari 가 자산 전체를 못 읽는다)");
  const client = vm.createContext({});
  vm.runInContext(helpers, client);
  // 고치기 전 번들에는 공유 함수가 없다 — 그때는 오류 문구를 돌려줘 검사가 실패로 모이게 한다(SOFT 모드에서 이어서 본다).
  const inBrowser = (call) => { try { return vm.runInContext(call, client); } catch (error) { return `ERR ${error.message}`; } };

  // ── A-16. 전각 숫자 ─────────────────────────────────────────────────────────────
  t.eq(inBrowser('foldInputWidth("１２，０００원 ７/４ １０％ （１２３４） １＋１ １：３０ －５")'), "12,000원 7/4 10% (1234) 1+1 1:30 -5", "A-16 전각 숫자·부호를 반각으로 바꾼다");
  t.eq(inBrowser('foldInputWidth("점심 ＫＢ국민카드 한글 ABC")'), "점심 ＫＢ국민카드 한글 ABC", "A-16 글자(전각 영문 포함)와 한글은 건드리지 않는다");
  t.eq(moneyTokenSpans("커피 ４５００").map((s) => s.amount).join(","), "4500", "A-16 moneyTokenSpans 가 전각 금액을 읽는다");
  t.eq(inBrowser('moneyTokenSpans("커피 ４５００").map(function(s){return s.amount;}).join(",")'), "4500", "A-16 화면 사본도 전각 금액을 읽는다");
  for (const [text, expected] of [
    ["커피 ４５００", { amount: 4500, memo: "커피", category: "카페/간식" }],
    ["점심 １２,０００원", { amount: 12000, memo: "점심", category: "외식" }],
    ["점심 １２，０００원", { amount: 12000, memo: "점심" }],
    ["택시 ３만원", { amount: 30000, memo: "택시", category: "택시" }],
    ["월급 ３００만원", { amount: 3000000, type: "income", category: "급여" }],
    ["점심 １２０００ 신한카드", { amount: 12000, memo: "점심", payment: "신한카드" }],
    ["７/４ 점심 ８０００", { amount: 8000, memo: "점심", date: "2026-07-04" }],
    ["２０２６-０７-０４ 커피 ４５００", { amount: 4500, date: "2026-07-04" }],
    ["점심 10％ 할인 12000", { amount: 12000 }],
  ]) expectParse("A-16 전각", text, expected, { web, legacy });
  // 음성: 반각으로 쓴 같은 문장과 완전히 같다
  for (const text of ["커피 ４５００", "점심 １２,０００원", "택시 ３만원", "７/４ 점심 ８０００"]) {
    const folded = text.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xFEE0)).replace("，", ",");
    t.eq(JSON.stringify(kakao(text).view), JSON.stringify(kakao(folded).view), `A-16 전각 문장은 반각 문장과 같은 결과다: "${text}"`);
  }
  // 여러 건·번호 목록도 전각으로 써도 똑같이 나눠 읽는다(웹 빠른 입력은 한 건만 받으므로 카카오 쪽만 본다)
  t.eq(kakao("커피 ４５００, 점심 ９０００").rows.map((r) => `${r.memo}:${r.amount}`).join("|"), "커피:4500|점심:9000", "A-16 전각 금액이 든 두 건도 나눠 읽는다");
  t.eq(kakao("１. 점심 １２０００원").rows.map((r) => `${r.memo}:${r.amount}`).join("|"), "점심:12000", "A-16 전각 번호 목록 표식(１.)도 뗀다");
  t.eq(kakao("우유 1+1 3000, 커피 4500").rows.map((r) => `${r.memo}:${r.amount}`).join("|"), "우유 1+1:3000|커피:4500", "A-16 덤 행사 표기가 든 건과 다른 건을 함께 보내도 두 건");
  // 수량: 덤 행사 표기·띄어 쓴 단위
  for (const [text, expected] of [
    ["1+1 우유 3000", { amount: 3000, memo: "1+1 우유" }],
    ["우유 2+1 3000", { amount: 3000, memo: "우유 2+1" }],
    ["우유 1+1 3000 카드", { amount: 3000, memo: "우유 1+1", payment: "카드" }],
    ["생수 2 박스 3000", { amount: 3000, memo: "생수 2 박스" }],
    ["쌀 10 kg 30000", { amount: 30000, memo: "쌀 10 kg", category: "장보기" }],
    ["생수 24 개입 12000", { amount: 12000, memo: "생수 24 개입" }],
    ["맥주 4 캔 10000", { amount: 10000, memo: "맥주 4 캔" }],
    ["달걀 2 판 9000", { amount: 9000, memo: "달걀 2 판" }],
    // 예전 그대로: 이미 거르던 단위와 크기 표시
    ["계란 30 구 9000", { amount: 9000 }],
    ["라면 5 봉지 4500", { amount: 4500 }],
    ["티셔츠 35000 L", { amount: 35000 }],
  ]) expectParse("A-16 수량", text, expected, { web, legacy });
  for (const text of ["생수 2 박스", "1+1 우유", "우유 1+1", "쌀 10 kg"]) expectRejected("A-16 수량", text, { web });
  // 예전 그대로 거절: 합계식·부호가 붙은 금액·단위 없는 한 자리
  for (const text of ["점심 3000+2000", "점심 +5000", "점심 -5000"]) expectRejected("A-16 음성", text, { web });
  t.eq(parseTransaction("택시 7", {}).message, "amount_unit_required", "A-16 음성 단위 없는 한 자리 숫자는 예전처럼 다시 묻는다");

  // ── A-07. 띄어 쓴 한글 금액 ─────────────────────────────────────────────────────
  t.eq(inBrowser('joinSpacedKoreanAmount("택시 만 오천원")'), "택시 만오천원", "A-07 ‘만 오천원’을 한 금액으로 붙인다");
  t.eq(inBrowser('joinSpacedKoreanAmount("마트 만 2천원")'), "마트 1만2천원", "A-07 뒤가 숫자면 앞도 숫자 단위로 바꿔 붙인다");
  t.eq(inBrowser('joinSpacedKoreanAmount("점심 삼만 오천")'), "점심 삼만오천", "A-07 문장이 끝나면 ‘원’이 없어도 붙인다");
  // V22.9.80 T-17: 뒤따르는 말이 결제수단이면(‘택시 만 오천 현금’) 한 금액으로 붙인다(예전 음성 → 양성). 결제수단이 아닌 말 앞은 그대로다.
  t.eq(inBrowser('joinSpacedKoreanAmount("택시 만 오천 현금")'), "택시 만오천 현금", "A-07(V22.9.80 T-17) 결제수단이 뒤따르면 ‘원’이 없어도 붙인다");
  for (const same of ["택시 만 오천 현금영수증", "점심 3만 5천원", "택시 천 오천원", "점심 만원 커피 오천원", "점심 오천 원"]) {
    t.eq(inBrowser(`joinSpacedKoreanAmount(${JSON.stringify(same)})`), same, `A-07 음성 붙이지 않는다: "${same}"`);
  }
  for (const [text, expected] of [
    ["택시 만 오천원", { amount: 15000, memo: "택시", category: "택시" }],
    ["점심 삼만 오천원", { amount: 35000, memo: "점심" }],
    ["마트 만 2천원", { amount: 12000, memo: "마트" }],
    ["회식 십만 오천원", { amount: 105000, memo: "회식" }],
    ["커피 사천 오백원", { amount: 4500, memo: "커피" }],
    ["택시 만 오천원 현금", { amount: 15000, memo: "택시", payment: "현금" }],
    ["만 오천원 택시", { amount: 15000, memo: "택시" }],
    ["점심 ３만 5천원", { amount: 35000, memo: "점심" }],
    // 서버는 입구에서 한 번, 금액 판정에서 한 번 더 다듬는다 — 괄호 속 카드 끝자리가 지워진 뒤에야 붙는 금액도 웹이 같게 읽는다
    ["마트 (1234)삼만 오천원", { amount: 35000, memo: "마트" }],
    ["점심 19:40 만 오천원", { amount: 15000, memo: "점심" }],
    // 예전 그대로
    ["점심 3만 5천원", { amount: 35000, memo: "점심" }],
    ["점심 오천 원", { amount: 5000, memo: "점심" }],
    ["월세 오십만 원", { amount: 500000, memo: "월세", category: "주거/월세" }],
  ]) expectParse("A-07", text, expected, { web, legacy });
  t.eq(kakao("점심 만원 커피 오천원").rows.length, 2, "A-07 음성 ‘만원’ 뒤에 다른 내용이 오면 예전처럼 두 건(카카오)");
  t.eq(web("점심 만원 커피 오천원").view().amount, 10000, "A-07 음성 같은 문장의 웹 금액 칸은 첫 금액");

  // ── A-10. 낱말 속 글자가 분류를 정하지 않는다: 서버·웹 대체 추정·옛 화면·서버 분류 API 가 같은 답 ─────────────────────
  const a10 = [
    // V22.9.93 Q-3: ‘아이패드’는 낱말로 쇼핑에 들어갔다. ‘아이’가 육아로 읽히지 않는 것이 이 줄의 뜻이다.
    ["아이패드 500000", "쇼핑"], ["카펫 30000", "기타지출"], ["수술비 150000", "의료/병원"], ["미술학원 200000", "교육/학습"],
    ["전기차 충전 30000", "주유/충전"], ["커피 4500 농협카드", "카페/간식"], ["동물병원 50000", "반려동물"], ["스마트폰 케이스 20000", "기타지출"],
    // 양성: 진짜 낱말은 예전처럼 분류한다
    ["유치원 300000", "육아/자녀"], ["아이 장난감 30000", "육아/자녀"], ["병원 20000", "의료/병원"], ["농협 하나로마트 30000", "장보기"], ["회식 소주 40000", "외식"],
  ];
  for (const [text, category] of a10) {
    expectParse("A-10", text, { category }, { web, legacy });
    const classified = await api(fx, "/u/api/input-classification", "POST", { household_id: HH, type: "expense", raw_text: text, memo: text });
    t.eq(classified.data?.category, category, `A-10 서버 분류 API 도 같은 분류: "${text}"`);
  }
  // 가계부가 정해진 실제 홈에서는 분류를 서버(/u/api/input-classification)에 물어 채운다. 컨트롤러가 보내는 요청 그대로 돌려 본다 —
  // 저절로 채운 메모는 보내지 않는다(‘농협체크’에서 남은 ‘농협’이 막아 둔 낱말을 되살려 외식이 장보기가 되던 것). 직접 고친 메모는 보낸다.
  {
    const bodies = [];
    const askServer = (url, init) => {
      bodies.push(JSON.parse(init.body));
      return app.fetch(new Request(`${BASE}${url}`, { method: init.method, headers: { ...init.headers, cookie: fx.cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body: init.body }), fx.env, ctx);
    };
    const createHouseholdState = makeWebFactory(script, { fetchImpl: askServer });
    const cases = [
      ["점심 9000 농협체크", "외식"], ["마트 장보기 32000 농협체크", "장보기"], ["점심 9000 NH농협카드", "외식"], ["커피 4500 농협카드", "카페/간식"],
      ["아이패드 500000", "쇼핑"], ["수술비 150000", "의료/병원"], ["카펫 30000", "기타지출"],
    ];
    const states = cases.map(([text]) => createHouseholdState({ household: HH }).fill(text));
    const manualMemo = createHouseholdState({ household: HH }).fill("점심 9000").edit("memoInput", "택시");
    await new Promise((done) => setTimeout(done, 450));
    cases.forEach(([text, category], i) => {
      t.eq(kakao(text).view.category, category, `A-10 카카오 분류: "${text}"`);
      t.eq(states[i].view().category, category, `A-10 가계부가 정해진 웹 빠른 입력이 서버에 물어 채운 분류가 카카오와 같다: "${text}"`);
    });
    t.eq(bodies.filter((body) => body.memo !== "" && body.raw_text !== "점심 9000").length, 0, "A-10 저절로 채운 메모는 분류 요청에 싣지 않는다(문장만 보낸다)");
    t.eq(manualMemo.view().category, "택시", "A-10 직접 고친 메모는 분류 요청에 싣는다(메모를 택시로 고치면 분류도 택시)");
    t.ok(bodies.some((body) => body.raw_text === "점심 9000" && body.memo === "택시"), "A-10 직접 고친 메모가 요청 본문에 실린다");
  }
  // 옛 화면의 미완성 분류(기타지출 대신 빈 칸)는 그대로다: 걸린 말이 없으면 채우지 않는다
  t.eq(legacy("점심밥 asdf 12000").category, kakao("점심밥 asdf 12000").view.category === "기타지출" ? "" : kakao("점심밥 asdf 12000").view.category, "A-10 옛 화면은 걸린 말이 없으면 분류 칸을 비워 둔다(예전과 같음)");

  // ── N-11. 결제수단은 낱말 끝에서만(토스트·현금영수증·체크인은 결제수단이 아니다): 웹도 서버와 같은 판정 ─────────────────────
  for (const [text, memo, payment] of [
    ["토스트 3000", "토스트", ""], ["토스터기 30000", "토스터기", ""], ["현금영수증 발급 수수료 1000", "현금영수증 발급 수수료", ""],
    ["호텔 체크인 100000", "호텔 체크인", ""], ["카페이용 5000", "카페이용", ""], ["신용점수 조회료 1000", "신용점수 조회료", ""],
    // 예전 그대로
    ["토스 3000 커피", "커피", "토스"], ["라떼 3100 토스로", "라떼", "토스"], ["택시 8000 현금으로", "택시", "현금"], ["점심 9000 신한카드로", "점심", "신한카드"],
    ["커피 4500 KB국민카드", "커피", "국민카드"], ["우유 2500 KB 국민카드", "우유", "국민카드"], ["김밥 3500 국민체크카드", "김밥", "체크카드"],
    ["토스페이 빵 2000", "빵", "토스"], ["커피 4500 삼성 페이", "커피", "삼성페이"], ["라면 1500 현대 카드", "라면", "현대카드"],
    ["점심 9000 현대카드제로", null, "현대카드"], ["커피 4500 카카오페이머니로", null, "카카오페이"], ["점심 9000 카드결재", null, "카드"],
    ["택시 8000 현금줬어", null, "현금"], ["회비 30000 토스보냄", null, "토스"], ["커피 4500 삼페", "커피", "삼성페이"], ["점심 5000 계좌이체", "점심", "계좌이체"],
  ]) expectParse("N-11", text, { payment, ...(memo === null ? {} : { memo }) }, { web, legacy });
  // 홈 화면에 등록한 결제수단 이름이 먼저 맞는다(웹 전용 동작, 예전과 같음)
  const withAssets = makeWebFactory(script, { paymentOptions: ["우리은행 월급통장"] });
  t.eq(withAssets().fill("점심 9000 우리은행 월급통장").view().payment, "우리은행 월급통장", "N-11 음성 가계부에 등록한 결제수단 이름은 예전처럼 먼저 맞는다");
  t.eq(withAssets().fill("토스트 3000").view().payment, "", "N-11 등록하지 않은 이름에는 영향이 없다");

  // ── N-13. 띄어 쓴 이름 속 결제수단 말: 메모를 자르지 않고 결제수단으로 읽지도 않는다 ─────────────────────────────────
  for (const [text, memo, payment, category] of [
    ["교통카드 충전 20000", "교통카드 충전", "", "교통"], ["카드 지갑 15000", "카드 지갑", "", "의류/잡화"], ["신용 회복 30000", "신용 회복", "", "기타지출"],
    ["현금 영수증 발급 수수료 1000", "현금 영수증 발급 수수료", "", null], ["호텔 체크 인 100000", "호텔 체크 인", "", null],
    ["카드 연회비 15000", "카드 연회비", "", null], ["카드 재발급 수수료 5000", "카드 재발급 수수료", "", null], ["신용 등급 조회 1000", "신용 등급 조회", "", null],
    // 같은 문장에 진짜 결제수단이 따로 있으면 그것만 읽고 지운다
    ["교통카드 충전 20000 신한카드", "교통카드 충전", "신한카드", "교통"], ["카드 지갑 15000 현금", "카드 지갑", "현금", null], ["교통카드 충전 20000 카드로", "교통카드 충전", "카드", "교통"],
    // 예전 그대로: 앞뒤 어디에 쓰든 결제수단이다
    ["점심 카드 12000", "점심", "카드", "외식"], ["카드 점심 12000", "점심", "카드", "외식"], ["점심 12000 카드", "점심", "카드", "외식"],
    ["신용 점심 12000", "점심", "신용카드", "외식"], ["체크 점심 5000", "점심", "체크카드", "외식"], ["현금 커피 3000", "커피", "현금", "카페/간식"],
    ["점심 신용카드 12000", "점심", "신용카드", "외식"], ["점심 체크카드 12000", "점심", "체크카드", "외식"], ["점심 현금 12000", "점심", "현금", "외식"],
  ]) expectParse("N-13", text, { memo, payment, ...(category === null ? {} : { category }) }, { web, legacy });
  // 메모 다듬기: 결제수단 말·카드사 이름·요일 말·날짜 말은 예전처럼 빠진다(앞 글자 조건을 뒤돌아보기 없이 옮긴 것이 같은 결과를 내는지)
  for (const [text, memo, payment, date] of [
    ["지난 금요일 회식 50000", "회식", "", "2026-07-31"], ["저번 토요일 마트 30000", "마트", "", "2026-08-01"], ["이번 주 월요일 저녁 9500", "저녁", "", "2026-08-03"],
    ["어제 점심 12000원 국민카드", "점심", "국민카드", "2026-08-04"], ["커피 4500 IBK기업카드", "커피", "카드", null], ["커피 4500 SC제일카드", "커피", "카드", null],
    ["점심 12000 NH농협카드", "점심", "농협카드", null], ["3일 전 점심 12000 카드", "점심", "카드", "2026-08-02"],
  ]) expectParse("N-13 음성", text, { memo, payment, ...(date ? { date } : {}) }, { web });

  // ── 웹과 카카오가 같은 문장을 같게 읽는다: 여러 문장을 묶어 대조한다 ───────────────────────────────────────────
  const itemsForSweep = ["점심", "커피", "택시", "토스트", "교통카드 충전", "카드 지갑", "신용 회복", "현금 영수증", "아이패드", "카펫", "생수 2 박스", "우유 1+1", "마트 장보기", "전기차 충전", "수술비"];
  const amountsForSweep = ["12000", "12,000원", "３０００", "만 오천원", "삼만 오천원", "1만2천원", "5천원"];
  const paysForSweep = ["", "카드", "현금", "신한카드", "토스", "토스로", "삼성 페이", "KB국민카드", "신용카드"];
  const swept = [];
  let sweepIndex = 0;
  for (const item of itemsForSweep) for (const amount of amountsForSweep) for (const pay of paysForSweep) {
    sweepIndex += 1;
    if (sweepIndex % 3 !== 0) continue; // 3분의 1만 본다(모든 조합은 개발 중 87,000 문장으로 대조했다)
    swept.push(`${item} ${amount} ${pay}`.trim(), `${pay} ${item} ${amount}`.trim());
  }
  const sweepMismatch = [];
  let sweepCompared = 0;
  for (const text of swept) {
    const k = kakao(text);
    if (!k.ok) continue;
    sweepCompared += 1;
    const w = web(text).view();
    for (const key of ["amount", "memo", "payment", "category", "type", "date"]) if (w[key] !== k.view[key]) sweepMismatch.push(`"${text}" ${key}: 웹 ${JSON.stringify(w[key])} · 카카오 ${JSON.stringify(k.view[key])}`);
  }
  t.ok(sweepCompared >= 400, `묶음 대조 문장이 충분하다(${sweepCompared}개)`);
  t.eq(sweepMismatch.slice(0, 5).join(" | "), "", `묶음 대조 ${sweepCompared}개 문장에서 웹과 카카오의 금액·메모·결제수단·분류·구분·날짜가 모두 같다`);

  // ── 저장까지: 카카오 /skill 과 웹 폼 POST 가 같은 값을 저장한다 ───────────────────────────────────────────────────
  async function say(utterance) {
    const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } } };
    const response = await app.fetch(new Request(`${BASE}/skill`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ intent: { id: "i1", name: "블록" }, userRequest, bot: { id: "bot1", name: "말해가계부" }, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] }),
    }), fx.env, ctx);
    return JSON.parse(await response.text());
  }
  const rowsNow = () => fx.db.transactions.length;
  for (const [text, amount, memo, payment] of [
    ["커피 ４５００", 4500, "커피", ""], ["택시 만 오천원", 15000, "택시", ""], ["1+1 우유 3000", 3000, "1+1 우유", ""],
    ["교통카드 충전 20000", 20000, "교통카드 충전", ""], ["토스트 3000", 3000, "토스트", ""], ["카드 지갑 15000 현금", 15000, "카드 지갑", "현금"],
  ]) {
    const before = rowsNow();
    await say(text);
    const saved = fx.db.transactions.at(-1);
    t.ok(rowsNow() === before + 1 && saved.amount === amount && saved.memo === memo && String(saved.payment_method || "") === payment, `카카오 저장 "${text}" → ${amount}원·"${memo}"·"${payment}" (받음 ${saved.amount}·"${saved.memo}"·"${saved.payment_method || ""}")`);
    if (/[０-９]/.test(text)) t.eq(saved.raw_text, text, `카카오 저장한 원문(raw_text)은 받은 그대로(전각 유지): "${text}"`);
    // 같은 문장을 웹 폼으로 저장하면 같은 금액·메모·결제수단이다
    const state = web(text);
    t.ok(state.submit(), `웹 폼이 제출 가능하다: "${text}"`);
    const webBefore = rowsNow();
    // 같은 날 같은 기록은 중복으로 건너뛰므로(카카오가 방금 저장한 기록) 하루 앞 날짜로 보낸다.
    const posted = await post(fx, "/admin/transactions", { ...state.values(), transaction_date: "2026-08-04" });
    const webSaved = fx.db.transactions.at(-1);
    t.ok(rowsNow() === webBefore + 1 && webSaved.amount === saved.amount && webSaved.memo === saved.memo && String(webSaved.payment_method || "") === String(saved.payment_method || ""), `웹 저장도 카카오와 같다 "${text}": ${webSaved.amount}·"${webSaved.memo}"·"${webSaved.payment_method || ""}" (${posted.status})`);
    t.eq(webSaved.raw_text, text, `웹 저장한 원문(raw_text)도 친 그대로: "${text}"`);
  }
  // 금액을 못 읽는 문장은 웹이 저장을 막고, 서버도 (우회해 보내도) 저장하지 않는다
  const blockedState = web("생수 2 박스");
  t.eq(blockedState.submit(), false, "웹은 ‘생수 2 박스’를 저장하지 않는다");
  const blockedBefore = rowsNow();
  await post(fx, "/admin/transactions", { ...blockedState.values(), amount: "2" });
  t.eq(rowsNow(), blockedBefore, "서버도 문장에 금액이 없는데 금액 칸만 2 로 보낸 요청은 저장하지 않는다");
  const kakaoBefore = rowsNow();
  const reply = await say("생수 2 박스");
  t.eq(rowsNow(), kakaoBefore, "카카오는 ‘생수 2 박스’를 저장하지 않는다");
  const replyText = JSON.stringify(reply);
  t.ok(!replyText.includes("2원으로 읽혀") && replyText.includes("예) 점심 12000원 국민카드"), "카카오는 ‘2원으로 읽혀 저장하지 않았어요’ 라고 하지 않고 입력 예시를 안내한다(예전에는 수량 2 를 2원으로 되물었다)");
}));

if (SOFT) {
  console.log(`V22979_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
