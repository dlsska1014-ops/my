// V22.9.80 — 입력 해석 묶음(nlu): V79 새 발견 T-15·T-16·T-17·T-18·T-19·T-27 과 카카오 물음 T-39.
//
// ── 이 파일이 왜 생겼는지 ──
//   T-15 등록한 결제수단 이름을 낱말 속에서도 찾았다. 결제수단 ‘카카오’를 등록하면 "카카오택시 15000"이 카카오·웹 모두 결제수단 카카오로
//        저장됐다(웹은 목록에 늘 드는 기본 이름 때문에 등록하지 않아도 ‘현금영수증’이 현금, ‘교통카드 충전’·‘카드 지갑’이 카드였다).
//   T-16 낱말 속 분류 낱말: 가스레인지·전기밥솥 → 공과금, 주식회사 설립 → 저축/투자, 시장조사 → 장보기, 아이유 콘서트 → 육아/자녀, 카페인 → 카페/간식.
//   T-17 ‘집 삼억 오천만원’·‘택시 만 오천 현금’이 두 금액(두 건)으로 나뉘었다(서버·웹 같음).
//   T-18 저장 때 분류가 원문·메모·분류·결제수단을 이어 붙여 판정해, 분류가 비면 결제수단 칸의 ‘농협’이 장보기를 정했다(웹 A-10 과 같은 틈).
//   T-19 amount-parser.js 에 부르는 곳 없는 옛 금액 후보 함수가 남아 있었다.
//   T-27 nowKstDate() 가 부를 때마다 Intl.DateTimeFormat 을 새로 만들었다(고정 UTC+9 계산과 값이 같다).
//   T-39 카카오 ‘얼마나 썼어’·‘얼마 나갔어’·‘지난달 얼마나 썼지?’가 "무슨 뜻인지 이해하지 못했어요"였다.
//
// ── 어떻게 잡는가 ──
// 같은 문장을 ① 카카오(parseMultipleTransactions·POST /skill 저장), ② 홈이 실제로 받는 자산을 가짜 DOM 에서 돌린 웹 빠른 입력, ③ 옛 화면
// 인라인 런타임(번들의 mobileUiUxClientMain + 홈 자산의 공유 함수), ④ 웹 폼 저장(POST /admin/transactions)에 넣어 결과와 서로의 같음을 본다. 항목마다 고쳐진 것
// (양성)과 예전 그대로여야 하는 것(음성)을 함께 둔다. 시각은 Intl 기준값과 KST 자정·월말·연말·윤일 앞뒤에서 맞춰 본다.
// V22980_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 세는 용도).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { inferCategory } from "../src/modules/nlu/category-rules.js";
import { currentMonthKst, nowKstDate, withKstNowScope } from "../src/modules/nlu/date-payment.js";
import { applyUserSettingsToParsedTransactions, resolveManualInputClassification } from "../src/modules/settings/payment-assets.js";
import { attachUiUxRuntime } from "../src/modules/web/html-postprocess.js";

const SOFT = process.env.V22980_SOFT === "1";
const base = counter("V22.9.80 입력 해석(T-15 결제수단 이름·T-16 분류 낱말·T-17 띄어 쓴 금액·T-18 저장 때 분류·T-19 정리·T-27 KST 시각·T-39 얼마나 썼어) 웹·카카오 같은 해석 검사");
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
// 장면 하나가 고치기 전 코드에서 예외로 멈춰도(없는 함수 등) SOFT 모드에서는 실패 하나로 세고 다음 장면으로 간다.
async function scene(name, task) {
  if (!SOFT) return task();
  try { await task(); } catch (error) { softChecks += 1; failures.push(`${name} 장면이 멈춤: ${error?.message || error}`); }
}

const HH = "house-home";
const DAY = "2026-08-05";
const BIN = "kakao_login:2265";
const WIFI = "kakao_login:2266";
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const slice = (text, from, to) => {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`조각을 못 찾음: ${from.slice(0, 50)}`);
  const end = text.indexOf(to, start);
  if (end < 0) throw new Error(`조각 끝을 못 찾음: ${to.slice(0, 50)}`);
  return text.slice(start, end);
};
// 등록 결제수단: 픽스처의 국민카드·급여통장에 낱말 속에 잘 들어가는 이름을 더한다(카카오 → 카카오택시, KB → KBS, 법인카드 → 법인카드 지갑).
const ASSETS = [
  { id: "asset-1", name: "국민카드", kind: "credit_card", balance: 0 },
  { id: "asset-2", name: "급여통장", kind: "bank_account", balance: 5200000 },
  { id: "asset-v80-1", name: "카카오", kind: "bank_account", balance: 0 },
  { id: "asset-v80-2", name: "KB", kind: "credit_card", balance: 0 },
  { id: "asset-v80-3", name: "법인카드", kind: "credit_card", balance: 0 },
  { id: "asset-v80-4", name: "생활비", kind: "bank_account", balance: 0 },
];

// ── 카카오 쪽 해석(서버) ─────────────────────────────────────────────────────────────
function kakaoRows(text, assets = []) {
  const rows = applyUserSettingsToParsedTransactions(parseMultipleTransactions(text, {}), [], assets);
  return rows.map((row) => ({ amount: row.amount, memo: row.memo, payment: row.payment_method || "", category: row.category }));
}

// 카카오 스킬 호출. 같은 발화를 막는 장치(프로세스 전역)를 매번 비우고, 뒤로 미룬 저장(waitUntil)까지 기다린다.
async function say(fx, utterance, user = BIN) {
  globalThis.__AB_KAKAO_INFLIGHT?.clear?.();
  globalThis.__AB_KAKAO_REPEAT_GUARD?.clear?.();
  const jobs = [];
  const userRequest = { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "폴백 블록" }, utterance, lang: "ko", user: { id: user, type: "botUserKey", properties: { botUserKey: user } } };
  const body = { bot: { id: "bot1", name: "말해가계부" }, intent: { id: "i1", name: "폴백 블록" }, userRequest, action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} }, contexts: [] };
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body) }), fx.env, { waitUntil(job) { jobs.push(job); }, passThroughOnException() {} });
  const raw = await response.text();
  await Promise.allSettled(jobs);
  await Promise.allSettled(jobs);
  let json = null;
  try { json = JSON.parse(raw); } catch (_) {}
  return (json?.template?.outputs || []).map((o) => o?.simpleText?.text || [o?.textCard?.title, o?.textCard?.description].filter(Boolean).join("\n")).join("\n") || raw;
}

// ── 웹 쪽 해석: 홈이 받는 자산을 가짜 DOM 에서 돌린다(validate-nlu-v22979 의 makeWebFactory 와 같은 방식) ─────────────
function makeWebFactory(script, { paymentOptions = [], categoryOptions = [] } = {}) {
  const end = script.indexOf("\n(function mobileShellUiClientMain");
  if (end < 0) throw new Error("홈 자산에서 빠른 입력 끝 경계를 못 찾음");
  const body = script.slice(0, end);
  return function createState() {
    const form = {
      handlers: {}, hidden: [],
      appendChild(node) { this.hidden.push(node); },
      querySelector(selector) { return selector === 'input[name="month"]' ? { value: DAY.slice(0, 7) } : null; },
      addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); },
    };
    const node = (value = "", attrs = {}) => ({
      value, textContent: "", attrs, handlers: {}, focus() {},
      getAttribute(key) { return this.attrs[key] ?? null; }, setAttribute(key, v) { this.attrs[key] = String(v); },
      setCustomValidity(v) { this.validity = v; }, addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); }, closest() { return form; },
    });
    const fields = { smartInput: node(), amountInput: node(), memoInput: node(), payInput: node(), catInput: node(), txDate: node(DAY), rawTextInput: node(), quickAfter: node("", {}), type: "expense" };
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
    vm.runInContext(body, vm.createContext({ document, window: { addEventListener() {} }, location: { hash: "" }, navigator: {}, Intl, Date, setTimeout, clearTimeout, URLSearchParams }));
    const fire = (field, kind) => { for (const fn of field.handlers[kind] || []) fn.call(field, { target: field }); };
    return {
      fill(text) { fields.smartInput.value = text; fire(fields.smartInput, "input"); return this; },
      submit() { const event = { defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }; for (const fn of form.handlers.submit || []) fn.call(form, event); return !event.defaultPrevented; },
      values() {
        return {
          household_id: HH, month: DAY.slice(0, 7), type: fields.type, transaction_date: fields.txDate.value, amount: fields.amountInput.value, memo: fields.memoInput.value,
          category: fields.catInput.value, payment_method: fields.payInput.value, raw_text: fields.rawTextInput.value, user_id: "user-bin", return_to: `/app?month=${DAY.slice(0, 7)}&household_id=${HH}`,
          ...Object.fromEntries(form.hidden.map((hidden) => [hidden.name, hidden.value])),
        };
      },
      view() { return { amount: Number(String(fields.amountInput.value).replace(/,/g, "")) || 0, memo: fields.memoInput.value, payment: fields.payInput.value, category: fields.catInput.value }; },
    };
  };
}

// ── 옛 화면 인라인 런타임(mobileUiUxClientMain): 번들의 본문과 홈 자산의 공유 함수를 이어 Enter 로 돌린다(validate-nlu-v22979 와 같은 방식).
// 실제 페이지에 붙는 인라인 스크립트는 V79 검토 고침 전에는 ‘// ── 옛 화면 인라인 런타임(mobileUiUxClientMain): 실제 페이지(옛 관리자 화면)에서 꺼낸 스크립트를 Enter 로 돌린다 ─────────────’ 치환으로 깨져 있어(통합 쪽에서 고친다) 여기서 직접 돌리지 않는다 ─────────
function makeLegacyRunner(pageScript, rules) {
  return function runLegacy(text, { paymentOptions = [] } = {}) {
    const node = (value = "") => ({ value, textContent: "", focus() {}, setAttribute() {}, addEventListener() {}, getAttribute() { return null; } });
    const fields = { smartInput: node(), amountInput: node(), memoInput: node(), payInput: node(), catInput: node(), txDate: node(DAY), rawTextInput: node(), type: "expense" };
    const handlers = {};
    fields.smartInput.addEventListener = (kind, fn) => { (handlers[kind] ||= []).push(fn); };
    const radios = { expense: {}, income: {} };
    for (const [kind, radio] of Object.entries(radios)) Object.defineProperty(radio, "checked", { get() { return fields.type === kind; }, set(v) { if (v) fields.type = kind; } });
    const document = {
      getElementById(id) { return fields[id] || null; },
      querySelectorAll(selector) { return selector === "#paymentList option" ? paymentOptions.map((value) => ({ value })) : []; },
      querySelector(selector) {
        if (selector === ".smartHint") return node();
        const match = selector.match(/input\[name="type"\]\[value="(income|expense)"\]/);
        return match ? radios[match[1]] : null;
      },
    };
    vm.runInContext(pageScript, vm.createContext({ document, window: { AB_CATEGORY_RULES: rules, addEventListener() {} }, location: { pathname: "/", search: "", hash: "" }, history: { replaceState() {} }, navigator: {}, Intl, Date, URLSearchParams }));
    fields.smartInput.value = text;
    for (const fn of handlers.keydown || []) fn.call(fields.smartInput, { key: "Enter", preventDefault() {}, stopImmediatePropagation() {} });
    return { amount: Number(String(fields.amountInput.value).replace(/,/g, "")) || 0, memo: fields.memoInput.value, payment: fields.payInput.value, category: fields.catInput.value };
  };
}
const datalist = (html, id) => [...((html.match(new RegExp(`<datalist id="${id}">([\\s\\S]*?)</datalist>`)) || [])[1] || "").matchAll(/<option value="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

// ════════════════════════════════════════════════════════════════════════════════════
// T-27. KST 현재 시각: Intl 형식기 없이 고정 UTC+9 로 만든 값이 Intl(Asia/Seoul) 기준값과 같다
// ════════════════════════════════════════════════════════════════════════════════════
await scene("T-27", async () => {
  const reference = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Seoul", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" });
  const want = (ms) => { const p = Object.fromEntries(reference.formatToParts(new Date(ms)).map((x) => [x.type, x.value])); return [+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second, 0].join(","); };
  const got = (ms) => { globalThis.__AB_QA_FIXED_NOW_MS = ms; const d = nowKstDate(); return [d.getFullYear(), d.getMonth(), d.getDate(), d.getHours(), d.getMinutes(), d.getSeconds(), d.getMilliseconds()].join(","); };
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  const OldFormat = Intl.DateTimeFormat;
  let made = 0;
  Intl.DateTimeFormat = new Proxy(OldFormat, {
    construct(target, args, newTarget) { made += 1; return Reflect.construct(target, args, newTarget); },
    apply(target, self, args) { made += 1; return Reflect.apply(target, self, args); },
  });
  const named = [], samples = [];
  let sampleResults = [], madeBySamples = -1, madeByScope = -1, madeByParse = -1, scoped = "", yesterday = "", afterMutation = 0;
  try {
    // KST 자정·월말·연말·윤일 앞뒤(UTC 15:00 = KST 다음 날 0시)와 밀리초 끝자리
    for (const [iso, wall, month] of [
      ["2026-10-25T14:59:59.999Z", "2026,9,25,23,59,59,0", "2026-10"], ["2026-10-25T15:00:00.000Z", "2026,9,26,0,0,0,0", "2026-10"],
      ["2026-10-31T14:59:59.500Z", "2026,9,31,23,59,59,0", "2026-10"], ["2026-10-31T15:00:00.000Z", "2026,10,1,0,0,0,0", "2026-11"],
      ["2026-12-31T14:59:59.999Z", "2026,11,31,23,59,59,0", "2026-12"], ["2026-12-31T15:00:00.000Z", "2027,0,1,0,0,0,0", "2027-01"],
      ["2027-12-31T15:00:00.001Z", "2028,0,1,0,0,0,0", "2028-01"], ["2028-02-28T15:00:00.000Z", "2028,1,29,0,0,0,0", "2028-02"],
      ["2028-02-29T14:59:59.000Z", "2028,1,29,23,59,59,0", "2028-02"], ["2028-02-29T15:00:00.000Z", "2028,2,1,0,0,0,0", "2028-03"],
      ["2026-08-05T03:00:00.000Z", "2026,7,5,12,0,0,0", "2026-08"], ["2099-12-31T15:00:00.000Z", "2100,0,1,0,0,0,0", "2100-01"],
    ]) {
      const value = got(Date.parse(iso));
      named.push([iso, value, wall, currentMonthKst(), month]);
    }
    // 2001~2099년 사이에 흩은 3,000 순간(정해진 씨앗의 선형 합동 수열 — 돌릴 때마다 같다)
    let seed = 2980;
    const from = Date.parse("2001-01-01T00:00:00Z"), span = Date.parse("2099-12-31T00:00:00Z") - from;
    for (let i = 0; i < 3000; i += 1) { seed = (seed * 1103515245 + 12345) % 2147483648; samples.push(from + Math.floor((seed / 2147483648) * span)); }
    const beforeSamples = made;
    sampleResults = samples.map((ms) => got(ms));
    madeBySamples = made - beforeSamples;
    // 가져오기 해석 범위 안에서도, 카카오 문장 한 줄 해석에서도 형식기를 만들지 않는다
    const beforeScope = made;
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-10-31T23:59:59.900+09:00");
    scoped = String(withKstNowScope(() => [nowKstDate().getDate(), (globalThis.__AB_QA_FIXED_NOW_MS += 200, nowKstDate().getDate())]));
    madeByScope = made - beforeScope;
    const beforeParse = made;
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2027-01-01T00:00:00.500+09:00");
    yesterday = parseTransaction("어제 점심 12000원", {}).transaction_date;
    madeByParse = made - beforeParse;
    // 돌려준 Date 를 바꿔도 다음 값은 그대로다(부를 때마다 새로 만든다)
    globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-08-05T12:00:00+09:00");
    nowKstDate().setFullYear(2000);
    afterMutation = nowKstDate().getFullYear();
  } finally {
    Intl.DateTimeFormat = OldFormat;
    globalThis.__AB_QA_FIXED_NOW_MS = previous;
  }
  for (const [iso, actual, wall, monthActual, month] of named) {
    t.eq(actual, wall, `T-27 ${iso} 의 KST 벽시계(년,월-1,일,시,분,초,밀리초)`);
    t.eq(actual, want(Date.parse(iso)), `T-27 ${iso} 의 값이 Intl(Asia/Seoul) 기준값과 같다`);
    t.eq(monthActual, month, `T-27 ${iso} 의 이번 달(currentMonthKst)`);
  }
  const wrong = samples.filter((ms, i) => sampleResults[i] !== want(ms));
  t.eq(wrong.length, 0, `T-27 2001~2099년 3,000 순간 모두 Intl 기준값과 같다(다른 순간 ${wrong.slice(0, 3).map((ms) => new Date(ms).toISOString()).join(", ")})`);
  t.eq(madeBySamples, 0, `T-27 범위 밖 nowKstDate 3,000번이 Intl.DateTimeFormat 을 만들지 않는다(예전에는 부를 때마다 하나 — ${madeBySamples}개)`);
  t.eq(madeByScope, 0, `T-27 가져오기 해석 범위(withKstNowScope) 안에서도 형식기를 만들지 않는다(${madeByScope}개)`);
  t.eq(scoped, "31,1", "T-27 범위 안에서도 시계가 자정을 넘으면 바로 따라간다(10/31 23:59:59.9 → 11/1 00:00:00.1)");
  t.eq(madeByParse, 0, `T-27 카카오 문장 한 줄 해석(‘어제 점심 12000원’)이 형식기를 만들지 않는다(${madeByParse}개)`);
  t.eq(yesterday, "2026-12-31", "T-27 2027-01-01 00:00:00.5 KST 의 ‘어제’는 2026-12-31(연말 자정 직후)");
  t.eq(afterMutation, 2026, "T-27 돌려준 Date 를 바꿔도 다음 nowKstDate 는 그대로다");
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-19. 부르는 곳 없던 옛 금액 후보 함수 정리
// ════════════════════════════════════════════════════════════════════════════════════
await scene("T-19", async () => {
  const source = read("src/modules/nlu/amount-parser.js");
  const bundle = read("src/index.js");
  for (const name of ["collectCombinedNumericUnitCandidates", "parseMixedNumericAmount", "collectSimpleUnitCandidates", "collectStandardNumberCandidates", "collectKoreanNumberCandidates", "isLikelyDateAround", "isLikelyYearOrTime"]) {
    t.ok(!source.includes(`function ${name}(`) && !bundle.includes(`function ${name}(`), `T-19 amount-parser.js·번들에 쓰이지 않던 ${name} 이 없다`);
  }
  t.ok(source.includes("function parseKoreanAmount("), "T-19 parseKoreanAmount 는 남긴다(지시 — 홈 템플릿·성능 검사가 같은 이름을 쓴다)");
  for (const [text, amount] of [["커피 5천", 5000], ["월급 250만원", 2500000], ["택시 1만2천", 12000], ["점심 12,000원", 12000]]) {
    t.eq(parseTransaction(text, {})?.amount, amount, `T-19 정리 뒤에도 금액 해석은 그대로: "${text}"`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-16. 낱말 속 분류 낱말(서버 정본 — 웹은 아래 장면에서 같은 문장으로 본다)
// ════════════════════════════════════════════════════════════════════════════════════
const CATEGORY_CASES = [
  // 양성: 낱말 속 글자가 분류를 정하지 않는다
  ["가스레인지 50000", "기타지출"], ["전기밥솥 80000", "기타지출"], ["주식회사 설립 100000", "기타지출"], ["시장조사 30000", "기타지출"],
  ["아이유 콘서트 150000", "문화/여가"], ["카페인 음료 3000", "기타지출"], ["부탄가스 5000", "기타지출"], ["수도꼭지 교체 20000", "기타지출"],
  ["카페트 30000", "기타지출"], ["점심 9000 카페이", "외식"], ["전기자동차 충전 30000", "주유/충전"], ["아이언 골프채 300000", "운동"],
  // 음성: 진짜 낱말은 예전처럼 분류한다
  ["가스비 30000", "공과금"], ["전기요금 40000", "공과금"], ["전기세 30000", "공과금"], ["도시가스 30000", "공과금"], ["수도세 20000", "공과금"],
  ["주식 100000", "저축/투자"], ["시장 20000", "장보기"], ["전통시장 15000", "장보기"], ["아이 장난감 30000", "육아/자녀"], ["카페 5000", "카페/간식"],
  ["커피 4500 카페이", "카페/간식"], ["전기차 충전 20000", "주유/충전"], ["점심 김밥 4000", "외식"], ["아이스크림 3000", "카페/간식"],
];
await scene("T-16", async () => {
  for (const [text, category] of CATEGORY_CASES) {
    t.eq(inferCategory(text, "expense"), category, `T-16 서버 분류: "${text}"`);
    t.eq(kakaoRows(text)[0]?.category, category, `T-16 카카오 해석 분류: "${text}"`);
  }
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-17. 띄어 쓴 금액(서버 — 웹·저장은 아래 장면)
// ════════════════════════════════════════════════════════════════════════════════════
const AMOUNT_CASES = [
  // [문장, 건수, 첫 건 금액, 결제수단]
  ["집 삼억 오천만원", 1, 350000000, ""], ["택시 만 오천 현금", 1, 15000, "현금"], ["택시 만 오천 카드", 1, 15000, "카드"], ["택시 만 오천 신한카드", 1, 15000, "신한카드"],
  ["차 천 오백만원", 1, 15000000, ""], ["차 이천 오백만원", 1, 25000000, ""], ["이백 오십만원 월세", 1, 2500000, ""], ["천 오백 현금", 1, 1500, "현금"],
  ["적금 일억 이천만원 이체", 1, 120000000, "계좌이체"], ["집 삼억 오천만", 1, 350000000, ""], ["만 오천 현금 택시", 1, 15000, "현금"],
  // 음성: 예전과 같다
  ["택시 만 오천원", 1, 15000, ""], ["커피 오천 이백", 1, 5200, ""], ["점심 만 원", 1, 10000, ""], ["노트북 오백 만원", 1, 5000000, ""],
];
await scene("T-17", async () => {
  for (const [text, count, amount, payment] of AMOUNT_CASES) {
    const rows = kakaoRows(text);
    t.ok(rows.length === count && rows[0]?.amount === amount && rows[0]?.payment === payment, `T-17 카카오 해석 "${text}" → ${count}건 ${amount}원 "${payment}" (받음 ${JSON.stringify(rows)})`);
  }
  // 앞이 만이고 뒤도 만인 말·결제수단이 아닌 말 앞은 예전처럼 붙이지 않는다
  t.eq(kakaoRows("만 오천만원").length, 2, "T-17 ‘만 오천만원’은 예전처럼 두 금액");
  t.ok(kakaoRows("택시 만 오천 토스트").length !== 1 || kakaoRows("택시 만 오천 토스트")[0].amount !== 15000, "T-17 결제수단이 아닌 ‘토스트’ 앞에서는 붙이지 않는다");
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-18. 저장 때 분류: 결제수단 칸·저절로 채운 메모가 분류를 정하지 않는다
// ════════════════════════════════════════════════════════════════════════════════════
await scene("T-18 함수", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const resolve = (fields, type = "expense") => resolveManualInputClassification(fx.env, HH, type, fields);
    t.eq((await resolve({ raw_text: "모임 30000", memo: "모임", category: "", payment_method: "농협" })).category, "기타지출", "T-18 결제수단 칸의 ‘농협’이 비어 있는 분류를 장보기로 정하지 않는다(카카오 ‘모임 30000’과 같음)");
    t.eq((await resolve({ raw_text: "", memo: "모임", category: "", payment_method: "농협" })).category, "기타지출", "T-18 원문 없는 폼(메모 ‘모임’·결제수단 ‘농협’)도 기타지출");
    t.eq((await resolve({ raw_text: "점심 9000 농협체크", memo: "점심 농협", category: "", payment_method: "체크카드", manual_memo: false })).category, "외식", "T-18 빠른 입력이 채운 메모(‘농협체크’에서 남은 ‘농협’)는 분류에 다시 넣지 않는다(카카오 외식과 같음)");
    t.eq((await resolve({ raw_text: "4500", memo: "편의점", category: "", payment_method: "", manual_memo: true })).category, "편의점", "T-18 직접 고친 메모는 예전처럼 분류에 넣는다");
    t.eq((await resolve({ raw_text: "4500", memo: "편의점", category: "", payment_method: "" })).category, "편의점", "T-18 표식 없는 폼의 메모는 예전처럼 분류에 넣는다");
    t.eq((await resolve({ raw_text: "모임 30000", memo: "모임", category: "", payment_method: "" })).payment_method, "", "T-18 결제수단 판정에 분류 칸을 넣지 않는다(비면 비어 있다)");
    t.eq((await resolve({ raw_text: "점심 9000 국민카드", memo: "점심", category: "", payment_method: "" })).payment_method, "국민카드", "T-18 원문의 결제수단은 그대로 읽는다");
    t.eq((await resolve({ raw_text: "점심 9000", memo: "점심", category: "장보기", payment_method: "현금" })).category, "장보기", "T-18 적은 분류는 그대로 둔다");
  }));
  // 카카오 저장의 사용자 설정 판정: 결제수단 칸이 사용자 분류를, 분류 이름이 등록 결제수단을 맞히지 않는다
  const row = { type: "expense", raw_text: "모임 30000", memo: "모임", category: "기타지출", payment_method: "농협" };
  t.eq(applyUserSettingsToParsedTransactions([row], [{ name: "모임통장비", type: "expense", keywords: "농협" }], [])[0].category, "기타지출", "T-18 결제수단 ‘농협’이 사용자 분류 키워드 ‘농협’을 맞히지 않는다");
  t.eq(applyUserSettingsToParsedTransactions([{ ...row, raw_text: "농협 모임 30000" }], [{ name: "모임통장비", type: "expense", keywords: "농협" }], [])[0].category, "모임통장비", "T-18 원문의 낱말은 예전처럼 사용자 분류를 맞힌다");
  t.eq(applyUserSettingsToParsedTransactions(parseMultipleTransactions("주식 100000", {}), [], [{ name: "저축" }])[0].payment_method || "", "", "T-18 분류 이름 ‘저축/투자’가 등록 결제수단 ‘저축’을 맞히지 않는다");
  t.eq(applyUserSettingsToParsedTransactions(parseMultipleTransactions("주식 100000 저축으로", {}), [], [{ name: "저축" }])[0].payment_method || "", "저축", "T-18 원문의 등록 결제수단 이름은 그대로 맞는다");
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-15·T-16·T-17·T-18 을 웹·옛 화면·폼 저장·카카오 저장에서 함께 본다
// ════════════════════════════════════════════════════════════════════════════════════
await scene("웹·카카오", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, `kakao_selected_household_v2251:user-bin`, HH);
    putSetting(fx, `kakao_selected_household_v2251:user-wifi`, HH);
    putSetting(fx, `payment_assets:${HH}`, JSON.stringify(ASSETS));
    const home = await page(fx, `/app?month=${DAY.slice(0, 7)}&household_id=${HH}`);
    const runtimeSrc = (home.html.match(/<script id="mobileAppInlineRuntime" src="(\/assets\/mobile-home-shell-v\d+\.js)"/) || [])[1] || "";
    t.ok(!!runtimeSrc, `홈이 빠른 입력 런타임 자산을 불러온다(${runtimeSrc})`);
    const script = await (await app.fetch(new Request(`${BASE}${runtimeSrc}`), fx.env, ctx)).text();
    const rules = JSON.parse((script.match(/^window\.AB_CATEGORY_RULES=(\[.*?\]);window\.AB_TYPE_HINTS=/s) || [])[1] || "[]");
    const paymentOptions = datalist(home.html, "paymentList"), categoryOptions = datalist(home.html, "categoryList");
    for (const name of ["카카오", "KB", "법인카드", "생활비", "현금", "카드", "토스"]) t.ok(paymentOptions.includes(name), `홈 결제수단 목록에 ‘${name}’이 있다(등록 결제수단·기본 결제수단)`);
    const createState = makeWebFactory(script, { paymentOptions, categoryOptions });
    const web = (text) => createState().fill(text).view();

    // 공유 판정이 홈 자산에 그대로 실린다(뒤돌아보기 정규식 없음)
    const shared = script.slice(script.indexOf("function foldInputWidth("), script.indexOf("(function(){var q="));
    t.ok(shared.includes("function inputPaymentNameIn("), "T-15 홈 자산이 공유 판정 inputPaymentNameIn 을 싣는다");
    t.ok(!/\(\?<[=!]/.test(shared), "T-15 홈 자산의 해석 함수에 뒤돌아보기 정규식이 없다");
    const client = vm.createContext({});
    vm.runInContext(slice(script, "function moneyTokenSpans(", "(function(){var q="), client);
    const inBrowser = (call) => { try { return vm.runInContext(call, client); } catch (error) { return `ERR ${error.message}`; } };
    for (const [raw, name, expected] of [
      ["토스트 3000", "카카오", false], ["카카오택시 15000", "카카오", false], ["카카오로 택시 15000", "카카오", true], ["카카오페이 3000", "카카오", true],
      ["KBS 수신료 2500", "KB", false], ["KB국민카드 5000", "KB", true], ["법인카드 지갑 30000", "법인카드", false], ["법인카드로 점심 30000", "법인카드", true],
      ["생활비통장에서 30000", "생활비", true], ["현금영수증 1000", "현금", false], ["체크 인 3000", "체크", false], ["점심 체크로 3000", "체크", true],
    ]) {
      t.eq(inBrowser(`inputPaymentNameIn(${JSON.stringify(raw)}, ${JSON.stringify(name)})`), expected, `T-15 화면의 inputPaymentNameIn("${raw}", "${name}")`);
    }

    // T-15: 같은 문장을 카카오(등록 결제수단 판정)·웹(실제 목록)·옛 화면이 같은 결제수단으로 읽는다
    const legacyHtml = attachUiUxRuntime('<!doctype html><html lang="ko"><head><title>빠른 입력</title></head><body><form class="form"><input id="smartInput"/></form></body></html>');
    t.ok(legacyHtml.includes("function inputPaymentNameIn(") && legacyHtml.includes("function mobileUiUxClientMain("), "T-15 옛 화면 인라인 런타임(attachUiUxRuntime)이 공유 판정 inputPaymentNameIn 을 싣는다");
    const legacySource = slice(read("src/index.js"), "function mobileUiUxClientMain() {", "\nfunction mobileShellUiClientMain");
    const legacy = makeLegacyRunner(`${slice(script, "function moneyTokenSpans(", "(function(){var q=")}\n(${legacySource})();`, rules);
    const legacyPayments = paymentOptions;
    for (const [text, payment] of [
      ["카카오택시 15000", ""], ["카카오로 택시 15000", "카카오"], ["KBS 수신료 2500", ""], ["법인카드 지갑 30000", ""], ["법인카드로 점심 30000", "법인카드"],
      ["생활비통장에서 마트 30000", "생활비"], ["토스트 3000", ""], ["현금영수증 발급 수수료 1000", ""], ["교통카드 충전 20000", ""], ["카드 지갑 15000", ""],
      ["라면 1500 현대 카드", "현대카드"], ["점심 9000 국민카드", "국민카드"], ["커피 4500 현금", "현금"], ["토스로 3000 커피", "토스"],
    ]) {
      const kakao = kakaoRows(text, ASSETS)[0]?.payment;
      const w = web(text);
      t.eq(kakao, payment, `T-15 카카오 결제수단: "${text}"`);
      t.eq(w.payment, payment, `T-15 웹 결제수단(실제 목록): "${text}"`);
      let l;
      try { l = legacy(text, { paymentOptions: legacyPayments }).payment; } catch (error) { l = `ERR ${error.message}`; }
      t.eq(l, payment, `T-15 옛 화면 결제수단(실제 목록): "${text}"`);
    }

    // T-16·T-17: 웹 빠른 입력도 카카오와 같은 분류·금액
    for (const [text, category] of CATEGORY_CASES) t.eq(web(text).category, category, `T-16 웹 분류: "${text}"`);
    for (const [text, count, amount, payment] of AMOUNT_CASES) {
      if (count !== 1) continue;
      const w = web(text);
      t.ok(w.amount === amount && w.payment === payment, `T-17 웹 금액·결제수단 "${text}" → ${amount}원 "${payment}" (받음 ${w.amount}원 "${w.payment}")`);
    }

    // 카카오 저장과 웹 폼 저장이 같은 금액·결제수단(한 건)
    const rowsNow = () => fx.db.transactions.length;
    let day = 4;
    for (const [text, amount, payment] of [["카카오택시 15000", 15000, ""], ["택시 만 오천 현금", 15000, "현금"], ["집 삼억 오천만원", 350000000, ""], ["법인카드 지갑 30000", 30000, ""]]) {
      const before = rowsNow();
      await say(fx, text);
      const saved = fx.db.transactions.at(-1);
      t.ok(rowsNow() === before + 1 && saved.amount === amount && String(saved.payment_method || "") === payment, `카카오 저장 "${text}" → 한 건 ${amount}원 "${payment}" (받음 ${rowsNow() - before}건 ${saved?.amount}원 "${saved?.payment_method}")`);
      const state = createState().fill(text);
      t.ok(state.submit(), `웹 폼이 제출 가능하다: "${text}"`);
      const webBefore = rowsNow();
      await post(fx, "/admin/transactions", { ...state.values(), transaction_date: `2026-08-0${day--}` });
      const webSaved = fx.db.transactions.at(-1);
      t.ok(rowsNow() === webBefore + 1 && webSaved.amount === amount && String(webSaved.payment_method || "") === payment && webSaved.category === saved.category, `웹 저장도 카카오와 같다 "${text}" → ${amount}원 "${payment}" ${saved.category} (받음 ${webSaved?.amount}원 "${webSaved?.payment_method}" ${webSaved?.category})`);
    }

    // T-18: 분류 칸이 비었거나 ‘기타지출’인 폼 저장 — 저장 끝단(sanitizeTransactionBody)이 분류를 다시 정할 때도 결제수단 칸·저절로 채운 메모를
    // 넣지 않아 카카오(문장만 본다)와 같다. 직접 고친 메모와 원문만 있는 폼은 예전처럼 본다.
    const quick = { quick_manual_memo: "0", quick_manual_amount: "0", quick_manual_date: "0", quick_manual_category: "0", quick_manual_payment: "0", quick_manual_type: "0" };
    for (const [label, values, category] of [
      ["빠른 입력이 ‘기타지출’로 채운 ‘모임 9000 농협체크’(메모 ‘모임 농협’)", { raw_text: "모임 9000 농협체크", memo: "모임 농협", amount: "9000", category: "기타지출", payment_method: "체크카드", transaction_date: "2026-08-01", ...quick }, kakaoRows("모임 9000 농협체크")[0]?.category],
      ["결제수단 ‘농협’을 고르고 분류가 ‘기타지출’인 ‘모임 30000’", { raw_text: "모임 30000", memo: "모임", amount: "30000", category: "기타지출", payment_method: "농협", transaction_date: "2026-07-31", ...quick }, kakaoRows("모임 30000")[0]?.category],
      ["직접 고친 메모 ‘편의점’", { raw_text: "4500", memo: "편의점", amount: "4500", payment_method: "", transaction_date: "2026-07-30", ...quick, quick_manual_memo: "1" }, "편의점"],
      ["원문 없이 메모만 적은 폼 ‘점심’", { raw_text: "", memo: "점심", amount: "9000", payment_method: "현금", transaction_date: "2026-07-29" }, "외식"],
      ["결제수단 ‘농협’을 고른 ‘모임 30000’", { raw_text: "모임 30000", memo: "모임", amount: "30000", payment_method: "농협", transaction_date: "2026-08-03" }, "기타지출"],
      ["빠른 입력이 메모를 채운 ‘점심 9000 농협체크’", { raw_text: "점심 9000 농협체크", memo: "점심 농협", amount: "9000", payment_method: "체크카드", transaction_date: "2026-08-02", quick_manual_memo: "0", quick_manual_amount: "0", quick_manual_date: "0", quick_manual_category: "0", quick_manual_payment: "0", quick_manual_type: "0" }, "외식"],
    ]) {
      const before = rowsNow();
      await post(fx, "/admin/transactions", { household_id: HH, month: DAY.slice(0, 7), type: "expense", category: "", user_id: "user-bin", return_to: `/app?month=${DAY.slice(0, 7)}&household_id=${HH}`, ...values });
      const saved = fx.db.transactions.at(-1);
      t.ok(rowsNow() === before + 1 && saved.category === category, `T-18 웹 폼 저장 ${label} → ${category} (받음 ${rowsNow() - before}건 ${saved?.category})`);
    }
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// T-39. 카카오 ‘얼마나 썼어’·‘얼마 나갔어’·‘지난달 얼마나 썼지?’
// ════════════════════════════════════════════════════════════════════════════════════
await scene("T-39", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, `kakao_selected_household_v2251:user-bin`, HH);
    putSetting(fx, `kakao_selected_household_v2251:user-wifi`, HH);
    await say(fx, "7월 30일 병원 15000");
    await say(fx, "그제 마트 30000");
    await say(fx, "어제 택시 8000");
    await say(fx, "커피 4500");
    const strip = (text) => text.replace(/\n\n상세 분석 보기\n\S+$/, ""); // 첫 요약에만 붙는 ‘상세 분석 보기’ 링크(24시간에 한 번)는 비교에서 뺀다
    const rows = () => fx.db.transactions.length;
    const before = rows();
    const thisMonth = strip(await say(fx, "얼마 썼어"));
    t.ok(thisMonth.includes("요약") && thisMonth.includes("지출"), `‘얼마 썼어’는 이번 달 요약(예전과 같음) (${thisMonth.slice(0, 60)})`);
    for (const ask of ["얼마나 썼어", "얼마 나갔어", "얼마나 나갔어", "돈 얼마나 썼어", "얼마나 썼지?", "얼마나 썼는지 알려줘", "얼마나 썼어요", "커피 얼마나 썼어"]) {
      const reply = strip(await say(fx, ask));
      t.eq(reply, thisMonth, `T-39 ‘${ask}’는 ‘얼마 썼어’와 같은 이번 달 요약 (${reply.slice(0, 50)})`);
    }
    for (const [ask, summary, header] of [
      ["지난달 얼마나 썼지?", "지난달 요약", "📊 7월 요약"], ["지난달 얼마 나갔어", "지난달 요약", "📊 7월 요약"], ["지난달 얼마 썼어요", "지난달 요약", "📊 7월 요약"],
      ["저번달에 얼마나 썼어", "지난달 요약", "📊 7월 요약"], ["이번 달에 얼마나 썼어", "이번 달 요약", "📊 이번 달 요약"], ["이번 주 얼마나 썼어", "이번 주 요약", "📊 이번 주 요약"],
      ["지난주 얼마 나갔어", "지난주 요약", "📊 지난 주 요약"], ["오늘 얼마나 썼어", "오늘 요약", "📊 오늘 요약"], ["어제 얼마나 썼어", "어제 요약", "📊 어제 요약"],
    ]) {
      const expected = strip(await say(fx, summary));
      const reply = strip(await say(fx, ask));
      t.ok(reply === expected && reply.includes(header), `T-39 ‘${ask}’는 ‘${summary}’와 같은 기간 요약(${header}) (${reply.slice(0, 60)})`);
    }
    // 읽지 못하는 기간은 이번 달로 바꾸지 않는다(A-13 — ‘저저번달 뭐 썼어’와 같다)
    // V22.9.81 U-6: ‘지지난달 얼마나 썼어’·‘지지난주 얼마 나갔어’는 두 단계 전 기간의 요약으로 읽게 되어 이 목록에서 뺐다(validate-nlu-v22981 U-6 장면이 본다).
    for (const ask of ["저저번달 얼마나 썼어", "저저번달 얼마 썼어", "작년 얼마나 썼어", "13월 얼마나 썼어", "다음 달 얼마나 썼어"]) {
      const reply = await say(fx, ask);
      t.ok(reply.includes("요약할 기간을 읽지 못했어요") && !reply.includes("📊"), `T-39 읽지 못하는 기간 ‘${ask}’는 이번 달로 답하지 않는다 (${reply.slice(0, 60)})`);
    }
    t.eq(rows(), before, "T-39 물음은 기록을 만들지 않는다");
    // 금액이 있는 말은 예전처럼 기록이다
    for (const [text, amount] of [["얼마나 썼는지 몰라 커피 4500", 4500], ["얼마나 나갔는지 모름 택시 9000", 9000]]) {
      const count = rows();
      await say(fx, text);
      t.ok(rows() === count + 1 && fx.db.transactions.at(-1).amount === amount, `T-39 ‘${text}’는 예전처럼 ${amount}원 기록으로 저장된다`);
    }
    // 조회 전용 참여자도 같은 물음으로 요약을 보고, 기록은 여전히 막힌다
    const member = fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi");
    member.role = "viewer";
    const viewerReply = strip(await say(fx, "지난달 얼마나 썼지?", WIFI));
    t.ok(viewerReply.includes("📊 7월 요약"), `T-39 조회 전용도 ‘지난달 얼마나 썼지?’로 지난달 요약을 본다 (${viewerReply.slice(0, 60)})`);
    t.ok(strip(await say(fx, "얼마나 썼어", WIFI)).includes("요약"), "T-39 조회 전용도 ‘얼마나 썼어’로 이번 달 요약을 본다");
    const viewerRows = rows();
    await say(fx, "얼마나 썼는지 몰라 커피 4500", WIFI);
    t.eq(rows(), viewerRows, "T-39 조회 전용의 ‘얼마나 썼는지 몰라 커피 4500’은 저장되지 않는다");
  }));
});

if (SOFT) {
  console.log(`V22980_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
