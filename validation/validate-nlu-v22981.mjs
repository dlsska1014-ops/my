// V22.9.81 — 입력 해석 묶음(nlu): V80 새 발견 U-24·U-9·U-25·U-6·U-7·U-8·U-10.
//
// ── 이 파일이 왜 생겼는지 ──
//   U-24 여러 건 입력의 머리 날짜에 ‘지난·저번 + 요일’·‘모레’·‘20260731’·달 없이 쓴 ‘25일’이 없어, "지난 금요일 커피 4500원 택시 8000원"의
//        택시가 오늘로 저장됐다(커피만 7월 31일). 카카오 저장도 같았다.
//   U-9  ‘월세 오십 오만원’이 두 건(50원·50,000원)으로 나뉘었다(서버·웹 같음).
//   U-25 ‘2월 30일 요약’이 3월 2일 금액을 ‘2월 30일’ 제목으로 보였고(분석 링크는 3월), ‘13월 5일 요약’은 ‘2025년 13월 5일’이었다.
//   U-6  ‘지지난달 요약’·‘지지난주 요약’을 지난달·지난주로 읽었다.
//   U-7  같은 ‘통신비 50000 자동이체’가 웹은 자동이체, 카카오는 계좌이체로 저장됐다.
//   U-8  홈 빠른 입력의 분류 이름 맞춤(서버 분류를 못 부를 때)이 낱말 속 이름을 찾았다(‘점심 9000 급여통장’ → 급여).
//   U-10 카카오 기록 수정에서 구분을 바꿀 때 다시 분류하는 근거에 저절로 채운 메모가 들어갔다(‘용돈 9000 농협체크’를 지출로 → 장보기).
//   V81-a 한 건 입력·웹이 ‘지지난주·저저번주 금요일’을 지난주 금요일로, ‘지지난달 25일·말일’을 지난달로 읽었다(메모 ‘지 커피’).
//   V81-c ‘다음·오는·이번·지난번 금요일’을 가장 가까운 지난 금요일로 읽었다.
//   V81-b 카카오 예산 명령이 ‘지지난달·저저번달’을 지난달로 읽고 분류 이름에 남겨(‘지지난달 식비’) ‘등록된 카테고리를 찾지 못했어요’로 끝났다.
//   V81-g 세 낱말 사슬 ‘오십 오만 오천원’이 두 건(50원·55,000원)으로 나뉘었다(서버·웹 같음).
//   V81-h 윤년의 2월 29일 전에 보낸 ‘2월 29일 요약’이 지난해(그날이 없는 해)로 옮겨져 ‘없는 날짜’ 답을 받았다.
//   V81-d 메모에 날짜 말 ‘모레·지금·방금’과 8자리 날짜가 남았다(‘모레 커피’·‘20260731 커피’).
//   X-29 카카오 대표 명령어 ‘기록하기’를 누르고 이어 쓴 ‘기록하기 점심 12000원’이 메모 ‘기록하기 점심’으로 저장됐다(앞머리는 ‘기록 ’·‘입력 ’만 뗐다).
//
// ── 어떻게 잡는가 ──
// 같은 문장을 ① 카카오 해석(parseMultipleTransactions)과 POST /skill 저장, ② 홈이 실제로 받는 자산을 가짜 DOM 에서 돌린 웹 빠른 입력,
// ③ 웹 폼 저장(POST /admin/transactions)에 넣어 결과와 서로의 같음을 본다. 항목마다 고쳐진 것(양성)과 예전 그대로여야 하는 것(음성)을 함께 둔다.
// 요일 말은 수요일(2026-08-05)·금요일·토요일·일요일·월요일 기준일에서 모두 본다(‘지난 금요일’과 ‘지난주 금요일’은 주말에 다르다).
// V22981_SOFT=1 이면 실패해도 멈추지 않고 모아서 끝에 보여 준다(고치기 전 번들에서 어느 검사가 떨어지는지 세는 용도).
import vm from "node:vm";
import { readFileSync } from "node:fs";
import { app, BASE, ctx, counter, fixture, page, post, putSetting, withClock } from "./lib-audit-v22934.mjs";
import { parseMultipleTransactions, parseTransaction } from "../src/index.js";
import { extractLeadingDateHint, hasDateHint } from "../src/modules/nlu/transaction-parser.js";
import { joinSpacedKoreanAmount, normalizeInputText } from "../src/modules/client/shared-input-nlu.js";
import { applyUserSettingsToParsedTransactions, resolveManualInputClassification } from "../src/modules/settings/payment-assets.js";
import { parseDirectBudgetSetCommand, parseKakaoSummaryRange } from "../src/modules/kakao/household-budget-commands.js";
import { normalizeDateValue, nowKstDate, resolveWeekdayPhrase } from "../src/modules/nlu/date-payment.js";
// 새 함수는 이름공간으로 받는다(고치기 전 번들에서 SOFT 모드로 셀 때 없는 이름 때문에 파일 전체가 멈추지 않게).
import * as dashboardFragments from "../src/modules/admin/dashboard-fragments.js";
const paymentListOptionsHtml = dashboardFragments.paymentListOptionsHtml || (() => "");

const SOFT = process.env.V22981_SOFT === "1";
const base = counter("V22.9.81 입력 해석(U-24 여러 건 머리 날짜·U-9 띄어 쓴 금액·U-25 없는 날짜 요약·U-6 지지난달·U-7 자동이체·U-8 분류 이름 낱말·U-10 구분 바꿀 때 분류·V81 지지난주와 다가올 요일·예산 달·세 낱말 금액·윤년 2월 29일·메모 날짜 말·기록하기 앞머리) 웹·카카오 같은 해석 검사");
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
const DAY = "2026-08-05"; // 수요일
const BIN = "kakao_login:2265";

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
const rowsOf = (list) => (Array.isArray(list) ? list : []).map((row) => ({ memo: row.memo, amount: row.amount, date: row.transaction_date, payment: row.payment_method || "", category: row.category }));
const show = (list) => JSON.stringify(rowsOf(list).map((row) => `${row.memo}:${row.amount}:${row.date}`));
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");
const slice = (text, from, to) => {
  const start = text.indexOf(from);
  if (start < 0) throw new Error(`조각을 못 찾음: ${from.slice(0, 50)}`);
  const end = text.indexOf(to, start);
  if (end < 0) throw new Error(`조각 끝을 못 찾음: ${to.slice(0, 50)}`);
  return text.slice(start, end);
};
// 카카오 쪽 해석(서버): 여러 건 해석 + 등록 결제수단·사용자 분류 판정(저장 직전과 같은 순서)
function kakaoRows(text, assets = []) {
  return applyUserSettingsToParsedTransactions(parseMultipleTransactions(text, {}), [], assets)
    .map((row) => ({ amount: row.amount, memo: row.memo, payment: row.payment_method || "", category: row.category }));
}

// ── 웹 쪽 해석: 홈이 받는 자산을 가짜 DOM 에서 돌린다(validate-nlu-v22980 의 makeWebFactory 와 같은 방식).
// 목록(datalist)의 option 은 실제 DOM 처럼 속성(getAttribute)을 가진다. 서버 분류 API(fetch)는 넣지 않는다 — 홈은 그때 화면 안의
// 대체 추정(inferQuickCategory)으로 분류 칸을 채운다(U-8 이 고친 길).
const optionNode = ({ value, attrs = {} }) => ({ value, getAttribute(key) { return Object.prototype.hasOwnProperty.call(attrs, key) ? attrs[key] : null; } });
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
        if (selector === "#categoryList option") return categoryOptions.map(optionNode);
        if (selector === "#paymentList option") return paymentOptions.map(optionNode);
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
      edit(id, value) { fields[id].value = value; fire(fields[id], "input"); return this; },
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

// ── 옛 화면 인라인 런타임(mobileUiUxClientMain): 번들의 본문과 홈 자산의 공유 함수를 이어 Enter 로 돌린다(validate-nlu-v22980 과 같은 방식).
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
      querySelectorAll(selector) { return selector === "#paymentList option" ? paymentOptions.map(optionNode) : []; },
      querySelector(selector) {
        if (selector === ".smartHint") return node();
        const match = selector.match(/input\[name="type"\]\[value="(income|expense)"\]/);
        return match ? radios[match[1]] : null;
      },
    };
    vm.runInContext(pageScript, vm.createContext({ document, window: { AB_CATEGORY_RULES: rules, addEventListener() {} }, location: { pathname: "/", search: "", hash: "" }, history: { replaceState() {} }, navigator: {}, Intl, Date, URLSearchParams }));
    fields.smartInput.value = text;
    for (const fn of handlers.keydown || []) fn.call(fields.smartInput, { key: "Enter", preventDefault() {}, stopImmediatePropagation() {} });
    return { amount: Number(String(fields.amountInput.value).replace(/,/g, "")) || 0, memo: fields.memoInput.value, payment: fields.payInput.value, category: fields.catInput.value, date: fields.txDate.value };
  };
}
// 홈 HTML 의 datalist option(값과 속성)
const unescapeAttr = (value) => value.replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
const datalistOptions = (html, id) => [...((html.match(new RegExp(`<datalist id="${id}">([\\s\\S]*?)</datalist>`)) || [])[1] || "").matchAll(/<option ([^>]*)>/g)].map((m) => {
  const attrs = Object.create(null);
  for (const [, key, value] of m[1].matchAll(/([\w-]+)="([^"]*)"/g)) attrs[key] = unescapeAttr(value);
  return { value: attrs.value || "", attrs };
});
// 홈을 열어 빠른 입력 자산·목록을 받아 웹·옛 화면 해석기를 만든다
async function webHarness(fx, assets = null) {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  if (assets) putSetting(fx, `payment_assets:${HH}`, JSON.stringify(assets));
  const home = await page(fx, `/app?month=${DAY.slice(0, 7)}&household_id=${HH}`);
  const runtimeSrc = (home.html.match(/<script id="mobileAppInlineRuntime" src="(\/assets\/mobile-home-shell-v\d+\.js)"/) || [])[1] || "";
  if (!runtimeSrc) throw new Error("홈이 빠른 입력 런타임 자산을 부르지 않음");
  const script = await (await app.fetch(new Request(`${BASE}${runtimeSrc}`), fx.env, ctx)).text();
  const rules = JSON.parse((script.match(/^window\.AB_CATEGORY_RULES=(\[.*?\]);window\.AB_TYPE_HINTS=/s) || [])[1] || "[]");
  const paymentOptions = datalistOptions(home.html, "paymentList"), categoryOptions = datalistOptions(home.html, "categoryList");
  const createState = makeWebFactory(script, { paymentOptions, categoryOptions });
  const legacySource = slice(read("src/index.js"), "function mobileUiUxClientMain() {", "\nfunction mobileShellUiClientMain");
  const runLegacy = makeLegacyRunner(`${slice(script, "function moneyTokenSpans(", "(function(){var q=")}\n(${legacySource})();`, rules);
  const client = vm.createContext({});
  vm.runInContext(slice(script, "function moneyTokenSpans(", "(function(){var q="), client);
  return {
    home, script, paymentOptions, categoryOptions, createState,
    web: (text) => createState().fill(text).view(),
    legacy: (text) => runLegacy(text, { paymentOptions }),
    inBrowser: (call) => { try { return vm.runInContext(call, client); } catch (error) { return `ERR ${error.message}`; } },
  };
}


// ════════════════════════════════════════════════════════════════════════════════════
// U-24. 여러 건 입력의 머리 날짜는 한 건 입력이 그 말을 읽는 날짜를 모든 거래에 준다
// ════════════════════════════════════════════════════════════════════════════════════
// 한 건 파서(quickInputDate·resolveWeekdayPhrase)가 날짜로 읽는 말. 머리 날짜 표(AB_DATE_PHRASES)의 꼴마다 하나 이상 둔다.
const DATE_HEADS = [
  "지난 금요일", "지난금요일", "저번 금요일", "저번금요일", "지난 월요일", "저번 일요일", // U-24 본 결함(V22.9.78 N-12 의 주 없는 꼴)
  "모레", "20260731", "25일", "3일", "31일", // 머리 날짜에서 빠져 있던 다른 꼴
  "지난주 금요일", "저번주 금요일", "전주 화요일", "이번주 월요일", "금주 수요일", "다음주 월요일", "내주 화요일", "금요일", "일요일",
  "지지난주 금요일", "저저번주 금요일", "지지난 금요일", "지난번 금요일", "이번 금요일", "다음 금요일", "오는 금요일", "돌아오는 금요일", // V81-a·c
  "지지난달 25일", "지지난달 말일", "저저번달 5일", // V81-a
  "오늘", "어제", "그제", "그저께", "엊그제", "그끄저께", "어젯밤", "전날", "내일", "어제저녁", "오늘아침",
  "하루 전", "이틀 전", "사흘 전", "보름 전", "3일 전", "2주 전", "일주일 전", "한 달 전", "두 달 전",
  "지난달 말일", "이번 달 말일", "말일", "지난달 25일", "저번 달 5일", "이번달 3일", "이달 1일",
  "2026.7.31", "2026-07-31", "2026년 7월 31일", "7월 31일", "7/31", "7.31", "작년 12월 25일", "올해 3월 1일", "작년 12/25",
];
// 머리 날짜가 아닌 말: 낱말 속 하루 말·한 건 파서도 그 뜻으로 읽지 않는 주 말·날짜가 아닌 ‘일’
// 때 말이 붙은 하루 말은 하루 말만 머리 날짜로 넘긴다(예전 그대로 — 때 말까지 넘기면 뒤 거래 메모에 ‘저녁’이 붙는다).
const HINT_OF = Object.freeze({ "어제저녁": "어제", "오늘아침": "오늘" });
// 달 없이 쓴 ‘N일’은 머리 날짜로만 본다(뒤 조각의 ‘숙박 2일’은 기간이기도 해서 조각의 제 날짜로 보지 않는다 — 예전 그대로 머리 날짜를 받는다).
const DAY_ONLY_HEADS = new Set(["25일", "3일", "31일"]);
const NOT_DATE_HEADS = ["오늘의집 쿠션", "내일배움카드", "아모레 크림", "모레아 소품", "15일치 약값", "지난 주말"];
const CLOCKS = [["2026-08-05", "수"], ["2026-08-07", "금"], ["2026-08-08", "토"], ["2026-08-09", "일"], ["2026-08-03", "월"]];

await scene("U-24 해석", async () => {
  for (const [day, dow] of CLOCKS) {
    await withClock(day, async () => {
      // 말 하나에 검사 하나: 한 건 파서의 날짜(기준) · 머리 날짜 · 조각 날짜 판정 · 네 가지 나눔(띄어쓰기·쉼표·줄바꿈·‘그리고’)의 두 거래 날짜가 모두 맞아야 통과
      for (const head of DATE_HEADS) {
        const want = parseTransaction(`${head} 커피 4500원`, {}).transaction_date;
        const problems = [];
        if (!/^20\d{2}-\d{2}-\d{2}$/.test(want || "") || parseTransaction(`${head} 택시 8000원`, {}).transaction_date !== want) problems.push(`한 건 파서 ${want}`);
        const hint = extractLeadingDateHint(`${head} 커피 4500원 택시 8000원`);
        if (hint !== (HINT_OF[head] || head)) problems.push(`머리 날짜 ${JSON.stringify(hint)}`);
        if (hasDateHint(`${head} 택시 8000원`) !== !DAY_ONLY_HEADS.has(head)) problems.push(`조각 날짜 판정 ${hasDateHint(`${head} 택시 8000원`)}`);
        for (const text of [`${head} 커피 4500원 택시 8000원`, `${head} 커피 4500원, 택시 8000원`, `${head} 커피 4500원\n택시 8000원`, `${head} 커피 4500원 그리고 택시 8000원`]) {
          const rows = rowsOf(parseMultipleTransactions(text, {}));
          if (!(rows.length === 2 && rows.every((row) => row.date === want) && rows[0].amount === 4500 && rows[1].amount === 8000)) problems.push(`${JSON.stringify(text)} → ${show(parseMultipleTransactions(text, {}))}`);
          // 메모도 한 건 입력과 같다: 첫 거래는 그 말 그대로, 뒤 거래는 머리 날짜를 받은 한 건(머리 날짜가 두 번 붙지 않는다)
          const memos = [parseTransaction(`${head} 커피 4500원`, {}).memo, parseTransaction(`${HINT_OF[head] || head} 택시 8000원`, {}).memo];
          if (rows.length === 2 && (rows[0].memo !== memos[0] || rows[1].memo !== memos[1])) problems.push(`메모 ${JSON.stringify(rows.map((row) => row.memo))} ≠ ${JSON.stringify(memos)}`);
        }
        t.ok(!problems.length, `U-24 (${day} ${dow}) ‘${head}’ 머리 날짜를 여러 건의 두 거래가 한 건과 같은 ${want} 로 받는다 ${problems.join(" · ")}`);
      }
      // 조각이 제 날짜를 가지면 그 날짜다(머리 날짜가 덮지 않는다)
      const today = parseTransaction("커피 4500원", {}).transaction_date;
      for (const [text, wantFirst, wantSecond] of [
        ["어제 커피 4500원 20260731 택시 8000원", "어제 커피 4500원", "20260731 택시 8000원"],
        ["어제 커피 4500원 모레 택시 8000원", "어제 커피 4500원", "모레 택시 8000원"],
        ["지난 금요일 커피 4500원 어제 택시 8000원", "지난 금요일 커피 4500원", "어제 택시 8000원"],
        ["25일 월세 800000원 지난주 금요일 택시 8000원", "25일 월세 800000원", "지난주 금요일 택시 8000원"],
        ["20260731 커피 4500원 7월 30일 택시 8000원", "20260731 커피 4500원", "7월 30일 택시 8000원"],
      ]) {
        const rows = rowsOf(parseMultipleTransactions(text, {}));
        const first = parseTransaction(wantFirst, {}).transaction_date, last = parseTransaction(wantSecond, {}).transaction_date;
        t.ok(rows.length === 2 && rows[0].date === first && rows[1].date === last, `U-24 (${day}) 제 날짜를 가진 조각은 그 날짜: ${JSON.stringify(text)} → ${first}·${last} (받음 ${show(parseMultipleTransactions(text, {}))})`);
      }
      // 뒤 조각의 달 없는 ‘N일’(‘숙박 2일’ — 기간이기도 하다)과 날짜 꼴이 아닌 8자리 수(주문번호)는 조각의 날짜로 보지 않아 머리 날짜를 받는다(예전 그대로)
      for (const text of ["어제 커피 4500원 숙박 2일 120000원", "어제 커피 4500원 주차 3일 15000원", "어제 커피 4500원 주문번호 20123456 택배 3000원"]) {
        const rows = rowsOf(parseMultipleTransactions(text, {})), want = parseTransaction("어제 커피 4500원", {}).transaction_date;
        t.ok(rows.length === 2 && rows.every((row) => row.date === want), `U-24 (${day}) ${JSON.stringify(text)} → 두 건 모두 머리 날짜 ${want} (받음 ${show(parseMultipleTransactions(text, {}))})`);
      }
      // 날짜가 아닌 머리 말은 뒤 거래에 넘기지 않는다(예전 그대로)
      const taken = NOT_DATE_HEADS.filter((head) => extractLeadingDateHint(`${head} 20000원 택시 8000원`) !== "");
      t.ok(!taken.length, `U-24 (${day}) 날짜가 아닌 머리 말은 머리 날짜가 아니다 ${JSON.stringify(taken)}`);
      t.ok(!hasDateHint("아모레 크림 30000원") && !hasDateHint("모레아 소품 30000원") && !hasDateHint("15일치 약값 30000원"), "U-24 낱말 속 ‘모레’·‘15일치’는 조각의 날짜가 아니다");
      const cream = rowsOf(parseMultipleTransactions("어제 커피 4500원 아모레 크림 30000원", {}));
      t.ok(cream.length === 2 && cream[1].date === parseTransaction("어제 커피 4500원", {}).transaction_date, `U-24 (${day}) ‘아모레 크림’ 조각은 머리 날짜(어제)를 받는다 (받음 ${JSON.stringify(cream)})`);
      const plain = rowsOf(parseMultipleTransactions("오늘의집 쿠션 20000원 택시 8000원", {}));
      t.ok(plain.length === 2 && plain.every((row) => row.date === today), `U-24 (${day}) 머리 날짜가 없으면 예전처럼 오늘 (받음 ${JSON.stringify(plain)})`);
    });
  }
  // 고른 읽기(V22.9.78 N-12, 운영자 결정 2026-10-23 그대로): 주 없이 쓴 ‘지난·저번 금요일’은 오늘을 뺀 바로 앞의 금요일, ‘지난주 금요일’은
  // 월요일에 시작하는 지난주의 금요일이다. 둘은 토·일요일에 다르다. 여러 건의 모든 거래가 한 건과 같은 쪽을 따른다.
  for (const [day, last, lastWeek] of [["2026-08-05", "2026-07-31", "2026-07-31"], ["2026-08-07", "2026-07-31", "2026-07-31"], ["2026-08-08", "2026-08-07", "2026-07-31"], ["2026-08-09", "2026-08-07", "2026-07-31"], ["2026-08-03", "2026-07-31", "2026-07-31"]]) {
    await withClock(day, async () => {
      t.ok(rowsOf(parseMultipleTransactions("지난 금요일 커피 4500원 택시 8000원", {})).every((row) => row.date === last), `U-24 ${day}: ‘지난 금요일’ 두 건 모두 ${last}`);
      t.ok(rowsOf(parseMultipleTransactions("지난주 금요일 커피 4500원 택시 8000원", {})).every((row) => row.date === lastWeek), `U-24 ${day}: ‘지난주 금요일’ 두 건 모두 ${lastWeek}`);
    });
  }
});

await scene("U-24 카카오 저장", async () => {
  for (const [day, text, dates] of [
    ["2026-08-05", "지난 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-05", "저번 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-08", "지난 금요일 커피 4500원 택시 8000원", ["2026-08-07", "2026-08-07"]],
    ["2026-08-09", "지난주 금요일 커피 4500원 택시 8000원", ["2026-07-31", "2026-07-31"]],
    ["2026-08-05", "25일 월세 800000원 관리비 200000원", ["2026-07-25", "2026-07-25"]],
  ]) {
    await withClock(day, () => fixture(async (fx) => {
      putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      const saved = fx.db.transactions.slice(before).map((row) => row.transaction_date);
      t.ok(saved.length === 2 && saved.every((date, i) => date === dates[i]), `U-24 카카오 저장(${day}) "${text}" → ${dates.join("·")} (받음 ${JSON.stringify(saved)})`);
      t.ok(dates.every((date) => reply.includes(date)), `U-24 카카오 답장(${day})이 두 거래의 날짜를 보인다`);
    }));
  }
  // 머리 날짜를 뗀 본문이 수정 명령이면 새 기록으로 저장하지 않는다(D3 — ‘지난주 금요일 01번 금액 5000’과 같다). 예전에는 ‘지난 금요일’·‘25일’
  // 머리를 떼지 못해 ‘01번 금액’ 5,000원이 새 지출로 저장됐다.
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    for (const text of ["지난주 금요일 01번 금액 5000", "지난 금요일 01번 금액 5000", "저번 금요일 01번 삭제", "25일 01번 금액 5000", "모레 01번 금액 5000", "지난 금요일 수정 01번 금액 5000"]) {
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      t.ok(fx.db.transactions.length === before && !reply.includes("저장했어요"), `U-24 날짜를 붙인 수정 말 "${text}"는 새 기록이 아니다 (${reply.slice(0, 50).replace(/\n/g, " / ")})`);
    }
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-9. 띄어 쓴 금액: 앞이 십·백·천만 가진 수이고 뒤가 ‘만·억’으로 끝나며 그 머리가 앞의 가장 작은 단위보다 작으면 한 금액
// ════════════════════════════════════════════════════════════════════════════════════
// 오탐 검토 목록(운영자 검토용으로 여기 남긴다). 서버(카카오)·웹 빠른 입력·옛 화면이 같은 공유 함수(joinSpacedKoreanAmount)를 쓴다.
// 잇는 말: [문장, 금액]
const SPACED_JOIN = [
  ["월세 오십 오만원", 550000], ["월세 오십 오만", 550000], ["오십 오만 현금", 550000], ["오십 오만원 월세", 550000],
  ["구십 구만원", 990000], ["이십 삼만원", 230000], ["십 오만원", 150000], ["삼백 오만원", 3050000], ["삼백오십 오만원", 3550000],
  ["백오십 오만원", 1550000], ["오십 5만원", 550000], ["삼백 50만원", 3500000], ["이천 500만원", 25000000],
  ["삼억 오십 오만원", 300550000], ["이백 오십 오만원", 2550000], ["십 오억", 1500000000],
  // 예전부터 잇던 말(앞이 천·백으로 끝나는 꼴, V22.9.80 T-17) — 그대로
  ["삼백 오십만원", 3500000], ["이천 오백만원", 25000000], ["천 오백만원", 15000000], ["천오백 오십만원", 15500000],
  // 받아들인 위험: 지명 ‘이천’ 바로 뒤의 금액도 이어 읽는다. 예전부터 ‘이천 오백만원’을 이어 읽었고, 잇지 않아도 ‘이천’을 2,000원으로 읽어 두 건이었다.
  ["이천 오만원", 20050000],
];
// 잇지 않는 말: [문장, 띄운 채 남아야 하는 두 낱말]
const SPACED_KEEP = [
  ["월세 오십 오십만원", "오십 오십만"], ["오십 15만원", "오십 15만"], // 머리가 앞의 가장 작은 단위보다 크거나 같다
  ["커피 오십 오천", "오십 오천"], // 뒤가 ‘만·억’으로 끝나지 않는다(세 낱말 사슬 ‘오십 오만 오천원’은 V81-g 가 한 금액으로 읽는다)
  ["명품 백 오만원", "백 오만"], ["커튼 천 오만원", "천 오만"], // 단위 한 글자 ‘백’(가방)·‘천’(옷감)은 앞 수로 보지 않는다
  ["오십 오만 월세", "오십 오만"], ["오십 오만 현금영수증", "오십 오만"], // 뒤따르는 말이 ‘원’·문장 끝·결제수단이 아니다(V80 규칙과 같다)
  ["만 오천만원", "만 오천만"], // 앞이 만이고 뒤도 만(V80 T-17 그대로)
];
await scene("U-9", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const { web, legacy, inBrowser } = await webHarness(fx);
    for (const [text, amount] of SPACED_JOIN) {
      const rows = kakaoRows(text), w = web(text), l = legacy(text);
      t.ok(rows.length === 1 && rows[0].amount === amount && w.amount === amount && l.amount === amount,
        `U-9 "${text}" → 한 건 ${amount}원 (카카오 ${JSON.stringify(rows.map((row) => row.amount))} · 웹 ${w.amount} · 옛 화면 ${l.amount})`);
    }
    for (const [text, pair] of SPACED_KEEP) {
      const server = normalizeInputText(text), browser = inBrowser(`normalizeInputText(${JSON.stringify(text)})`);
      t.ok(server.includes(pair) && browser === server && kakaoRows(text).length !== 1, `U-9 음성 "${text}"의 ‘${pair}’는 잇지 않는다 (서버 ${JSON.stringify(server)} · 화면 ${JSON.stringify(browser)})`);
    }
    // 서버와 화면 자산이 같은 함수 본문을 쓴다(한쪽만 고치지 않았다)
    t.eq(inBrowser(`joinSpacedKoreanAmount.toString()`), joinSpacedKoreanAmount.toString(), "U-9 홈 자산의 joinSpacedKoreanAmount 가 서버 함수와 같은 본문이다");
    // 카카오 저장·웹 폼 저장이 같은 한 건
    const { createState } = await webHarness(fx);
    for (const [text, amount, memo] of [["월세 오십 오만원", 550000, "월세"], ["관리비 십 오만원 현금", 150000, "관리비"]]) {
      const before = fx.db.transactions.length;
      await say(fx, text);
      const saved = fx.db.transactions.slice(before);
      t.ok(saved.length === 1 && saved[0].amount === amount && saved[0].memo === memo, `U-9 카카오 저장 "${text}" → 한 건 ${amount}원 (받음 ${JSON.stringify(saved.map((row) => `${row.memo}:${row.amount}`))})`);
      const state = createState().fill(text);
      const webBefore = fx.db.transactions.length;
      await post(fx, "/admin/transactions", { ...state.values(), transaction_date: "2026-08-04" });
      const webSaved = fx.db.transactions.slice(webBefore);
      t.ok(state.submit() && webSaved.length === 1 && webSaved[0].amount === amount && webSaved[0].category === saved[0]?.category, `U-9 웹 저장도 한 건 ${amount}원·같은 분류 (받음 ${JSON.stringify(webSaved.map((row) => `${row.memo}:${row.amount}:${row.category}`))})`);
    }
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// V81-g. 세 낱말 사슬(십·백·천 수 + 만·억 낱말 + 그 아래 수)도 한 금액이다. 예전에는 ‘오십 오만 오천원’이 50원 + 55,000원 두 건이었다.
//   같은 공유 함수(joinSpacedKoreanAmount)를 서버(카카오)·웹 홈 자산·옛 화면이 쓴다.
// ════════════════════════════════════════════════════════════════════════════════════
const SPACED_CHAIN = [
  ["오십 오만 오천원", 555000], ["월세 오십 오만 오천원", 555000], ["십 오만 삼천원", 153000], ["이십 삼만 오천원 현금", 235000], ["관리비 오십 오만 오천", 555000],
  ["오십 오만 오천오백원", 555500], ["오십 오만 5천원", 555000], ["오십 5만 오천원", 555000], ["삼백 오만 오천원", 3055000], ["천오백 오만 오천원", 15055000],
  ["구십 구만 구천원", 999000],
];
// 잇지 않는 말: [문장, 띄운 채 남아야 하는 두 낱말]
const SPACED_CHAIN_KEEP = [
  ["오십 오만 오천만원", "오십 오만"], // 뒤 낱말이 ‘만’으로 끝난다(예전 그대로)
  ["오십 오만 오천 현금영수증", "오십 오만"], // 뒤따르는 말이 ‘원’·문장 끝·결제수단이 아니다(U-9·V80 규칙과 같다)
  ["백 오만 오천원", "백 오만"], // 단위 한 글자 ‘백’(가방)은 앞 수로 보지 않는다
  ["오십 오십만 오천원", "오십 오십만"], // 머리가 앞의 가장 작은 단위보다 크거나 같다
];
await scene("V81-g", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const { web, legacy, inBrowser, createState } = await webHarness(fx);
    for (const [text, amount] of SPACED_CHAIN) {
      const rows = kakaoRows(text), w = web(text), l = legacy(text);
      t.ok(rows.length === 1 && rows[0].amount === amount && w.amount === amount && l.amount === amount,
        `V81-g "${text}" → 한 건 ${amount}원 (카카오 ${JSON.stringify(rows.map((row) => row.amount))} · 웹 ${w.amount} · 옛 화면 ${l.amount})`);
    }
    for (const [text, pair] of SPACED_CHAIN_KEEP) {
      const server = normalizeInputText(text), browser = inBrowser(`normalizeInputText(${JSON.stringify(text)})`);
      t.ok(server.includes(pair) && browser === server && kakaoRows(text).length !== 1, `V81-g 음성 "${text}"의 ‘${pair}’는 잇지 않는다 (서버 ${JSON.stringify(server)} · 화면 ${JSON.stringify(browser)})`);
    }
    const multi = kakaoRows("오십 오만 오천원 택시 8000원").map((row) => row.amount);
    t.ok(JSON.stringify(multi) === "[555000,8000]", `V81-g 여러 건 "오십 오만 오천원 택시 8000원" → 555,000원 + 8,000원 (받음 ${JSON.stringify(multi)})`);
    // 카카오 저장·웹 폼 저장이 같은 한 건
    const before = fx.db.transactions.length;
    await say(fx, "월세 오십 오만 오천원");
    const saved = fx.db.transactions.slice(before);
    t.ok(saved.length === 1 && saved[0].amount === 555000 && saved[0].memo === "월세", `V81-g 카카오 저장 "월세 오십 오만 오천원" → 한 건 555,000원 (받음 ${JSON.stringify(saved.map((row) => `${row.memo}:${row.amount}`))})`);
    const state = createState().fill("월세 오십 오만 오천원");
    const webBefore = fx.db.transactions.length;
    await post(fx, "/admin/transactions", { ...state.values(), transaction_date: "2026-08-04" });
    const webSaved = fx.db.transactions.slice(webBefore);
    t.ok(state.submit() && webSaved.length === 1 && webSaved[0].amount === 555000 && webSaved[0].category === saved[0]?.category, `V81-g 웹 저장도 한 건 555,000원·같은 분류 (받음 ${JSON.stringify(webSaved.map((row) => `${row.memo}:${row.amount}:${row.category}`))})`);
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-25. 달력에 없는 날의 요약은 다른 날로 넘기지 않고 ‘없는 날짜’로 안내한다(제목·분석 링크 없음)
// ════════════════════════════════════════════════════════════════════════════════════
const ymd = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
// 요약을 볼 기록: 기준일 2026-08-05 앞의 몇 주·몇 달(지지난주 = 7월 20~26일, 지지난달 = 6월)
const SUMMARY_ROWS = [["2026-06-10", "유월점심", 10000], ["2026-07-10", "칠월점심", 10000], ["2026-07-22", "지지난주점심", 22000], ["2026-07-29", "지난주점심", 29000], ["2026-03-02", "삼월이틀점심", 32000], ["2026-07-01", "칠월하루점심", 31000]];
const addSummaryRows = (fx) => {
  for (const [date, memo, amount] of SUMMARY_ROWS) fx.db.transactions.push({ id: `tx-v81-${date}`, household_id: HH, user_id: "user-bin", transaction_date: date, type: "expense", amount, category: "식비", memo, payment_method: "현금", source: "kakao", raw_text: memo, created_at: `${date}T03:00:00.000Z` });
};
await scene("U-25", async () => {
  await withClock(DAY, async () => {
    for (const [text, shown] of [
      ["2월 30일 요약", "2월 30일"], ["13월 5일 요약", "13월 5일"], ["0월 5일 요약", "0월 5일"], ["2월 0일 요약", "2월 0일"], ["2월 29일 요약", "2월 29일"],
      ["2026년 2월 29일 요약", "2026년 2월 29일"], ["6월 31일 요약", "6월 31일"], ["4월 31일 현황", "4월 31일"], ["2026년 13월 1일 요약", "2026년 13월 1일"],
      ["2월 30일 얼마나 썼어", "2월 30일"], ["13월 5일 얼마 썼어", "13월 5일"],
    ]) {
      const range = parseKakaoSummaryRange(text);
      t.ok(range?.invalidDate === true && range.text === shown && !range.start, `U-25 ‘${text}’는 없는 날짜(${shown})로 읽는다 (받음 ${JSON.stringify(range)})`);
    }
    // 있는 날은 예전 그대로(연도 없이 오늘보다 뒤면 작년 — D-7)
    for (const [text, start, label] of [["6월 10일 요약", "2026-06-10", "6월 10일"], ["7월 31일 요약", "2026-07-31", "7월 31일"], ["12월 25일 요약", "2025-12-25", "2025년 12월 25일"], ["2028년 2월 29일 요약", "2028-02-29", "2028년 2월 29일"], ["3월 2일 요약", "2026-03-02", "3월 2일"]]) {
      const range = parseKakaoSummaryRange(text);
      t.ok(range && !range.invalidDate && range.start === start && range.label === label, `U-25 있는 날 ‘${text}’는 예전처럼 ${start} (받음 ${JSON.stringify(range)})`);
    }
  });
  await withClock("2028-03-10", async () => {
    const range = parseKakaoSummaryRange("2월 29일 요약");
    t.ok(range && !range.invalidDate && range.start === "2028-02-29", `U-25 윤년(2028-03-10 기준) ‘2월 29일 요약’은 2028-02-29 (받음 ${JSON.stringify(range)})`);
  });
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    addSummaryRows(fx);
    for (const text of ["2월 30일 요약", "13월 5일 요약", "6월 31일 요약", "2월 30일 얼마나 썼어"]) {
      const reply = await say(fx, text);
      t.ok(reply.includes("달력에 없는 날짜라서 요약하지 않았어요") && !reply.includes("📊") && !reply.includes("/my/analysis") && !/32,000원|31,000원/.test(reply), `U-25 카카오 ‘${text}’는 없는 날짜 안내만(제목·금액·분석 링크 없음) (${reply.slice(0, 60).replace(/\n/g, " / ")})`);
    }
    const valid = await say(fx, "3월 2일 요약");
    t.ok(valid.includes("📊 3월 2일 요약") && valid.includes("32,000원"), `U-25 있는 날 ‘3월 2일 요약’은 예전처럼 그날 금액 (${valid.slice(0, 60).replace(/\n/g, " / ")})`);
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// V81-h. 윤년의 2월 29일 전에 보낸 ‘2월 29일 요약’은 올해 그날이다. 예전에는 D-7 이 지난해(그날이 없는 해)로 옮겨 ‘없는 날짜’로 답했다.
//   지난해로 옮기는 것은 지난해 달력에 그날이 있을 때만이다. 다른 날(D-7)·없는 날(U-25)은 예전 그대로다.
// ════════════════════════════════════════════════════════════════════════════════════
await scene("V81-h", async () => {
  for (const day of ["2028-01-01", "2028-01-15", "2028-02-28"]) {
    await withClock(day, async () => {
      for (const text of ["2월 29일 요약", "2월 29일 얼마나 썼어", "2월 29일 현황"]) {
        const range = parseKakaoSummaryRange(text);
        t.ok(range && !range.invalidDate && range.start === "2028-02-29" && range.end === "2028-03-01" && range.label === "2월 29일", `V81-h (${day}) ‘${text}’ → 2028-02-29(올해 그날) (받음 ${JSON.stringify(range)})`);
      }
      // 대조(예전 그대로): 다른 날은 D-7(오늘보다 뒤면 지난해), 없는 날은 U-25, 연도를 쓴 날은 그해
      const back = day < "2028-02-28" ? ["2027-02-28", "2027년 2월 28일"] : ["2028-02-28", "2월 28일"];
      for (const [text, start, label] of [["2월 28일 요약", ...back], ["3월 1일 요약", "2027-03-01", "2027년 3월 1일"], ["12월 25일 요약", "2027-12-25", "2027년 12월 25일"], ["2028년 2월 29일 요약", "2028-02-29", "2월 29일"]]) {
        const range = parseKakaoSummaryRange(text);
        t.ok(range && !range.invalidDate && range.start === start && range.label === label, `V81-h 대조 (${day}) ‘${text}’ → ${start} (받음 ${JSON.stringify(range)})`);
      }
      for (const text of ["2월 30일 요약", "2027년 2월 29일 요약"]) t.ok(parseKakaoSummaryRange(text)?.invalidDate === true, `V81-h 대조 (${day}) ‘${text}’는 없는 날짜`);
    });
  }
  // 윤년이 아닌 해(지난해도 아님)의 ‘2월 29일 요약’은 U-25 그대로 없는 날짜
  await withClock("2027-01-15", async () => t.ok(parseKakaoSummaryRange("2월 29일 요약")?.invalidDate === true, "V81-h 대조 (2027-01-15) ‘2월 29일 요약’은 없는 날짜(2027·2026 모두 2월 29일이 없다)"));
  // 카카오 끝까지: 미리 적은 2028-02-29 기록의 금액을 그날 제목으로 답한다
  await withClock("2028-01-15", () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    fx.db.transactions.push({ id: "tx-v81-leap", household_id: HH, user_id: "user-bin", transaction_date: "2028-02-29", type: "expense", amount: 29000, category: "식비", memo: "윤일점심", payment_method: "현금", source: "kakao", raw_text: "윤일점심", created_at: "2028-01-10T03:00:00.000Z" });
    const reply = await say(fx, "2월 29일 요약");
    t.ok(reply.includes("📊 2월 29일 요약") && reply.includes("29,000원") && !reply.includes("달력에 없는 날짜"), `V81-h 카카오 (2028-01-15) ‘2월 29일 요약’ → 2028-02-29 그날 금액 (${reply.slice(0, 60).replace(/\n/g, " / ")})`);
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-6. ‘지지난달’·‘지지난주’는 두 단계 전 기간(T-39 의 ‘얼마나 썼어’ 꼴도 같은 판정)
// ════════════════════════════════════════════════════════════════════════════════════
const weekRange = (day, back) => {
  const [y, m, d] = day.split("-").map(Number), now = new Date(y, m - 1, d), monday = new Date(y, m - 1, d - (now.getDay() + 6) % 7);
  return { start: ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * back)), end: ymd(new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() - 7 * (back - 1))) };
};
const monthRange = (day, back) => {
  const [y, m] = day.split("-").map(Number), start = new Date(y, m - 1 - back, 1);
  return { start: ymd(start), end: ymd(new Date(start.getFullYear(), start.getMonth() + 1, 1)), label: `${start.getFullYear() === y ? "" : `${start.getFullYear()}년 `}${start.getMonth() + 1}월`, month: ymd(start).slice(0, 7) };
};
await scene("U-6", async () => {
  // 수요일·일요일·월요일(주 첫날)·1월(해 넘김)·2월(해 넘김) 기준일
  for (const day of [DAY, "2026-08-09", "2026-01-05", "2026-01-15", "2026-02-10"]) {
    await withClock(day, async () => {
      const twoWeeks = weekRange(day, 2), oneWeek = weekRange(day, 1), twoMonths = monthRange(day, 2), oneMonth = monthRange(day, 1);
      for (const text of ["지지난주 요약", "지지난 주 요약", "지지난주", "지지난주 얼마 나갔어", "지지난주 얼마나 썼어", "지지난주 얼마 썼어", "지지난주 뭐 썼어", "지지난주 수입"]) {
        const range = parseKakaoSummaryRange(text);
        t.ok(range && range.start === twoWeeks.start && range.end === twoWeeks.end && range.label === "지지난 주", `U-6 (${day}) ‘${text}’ → 지지난 주 ${twoWeeks.start}~${twoWeeks.end} (받음 ${JSON.stringify(range)})`);
      }
      for (const text of ["지지난달 요약", "지지난 달 요약", "지지난달", "지지난달 얼마나 썼어", "지지난달 얼마 썼어", "지지난달 뭐 썼어", "지지난달 쓴 거", "지지난달 수입", "지지난달 수입 얼마"]) {
        const range = parseKakaoSummaryRange(text);
        t.ok(range && range.start === twoMonths.start && range.end === twoMonths.end && range.label === twoMonths.label && range.month === twoMonths.month, `U-6 (${day}) ‘${text}’ → ${twoMonths.label} ${twoMonths.start}~${twoMonths.end} (받음 ${JSON.stringify(range)})`);
      }
      t.eq(parseKakaoSummaryRange("지지난달 수입")?.focus, "income", `U-6 (${day}) ‘지지난달 수입’은 수입 줄을 함께 보인다`);
      // 예전 그대로: 지난주·지난달은 한 단계 전, 읽지 못하는 두 단계 전 말(저저번·지지난해)은 이번 달로 바꾸지 않는다
      const lastWeek = parseKakaoSummaryRange("지난주 요약"), lastMonth = parseKakaoSummaryRange("지난달 요약");
      t.ok(lastWeek?.start === oneWeek.start && lastWeek?.end === oneWeek.end && lastMonth?.start === oneMonth.start && lastMonth?.end === oneMonth.end, `U-6 (${day}) 지난주·지난달은 예전처럼 한 단계 전`);
      const unread = ["저저번달 요약", "저저번주 요약", "저저번달 얼마나 썼어", "지지난해 얼마나 썼어"].filter((text) => !parseKakaoSummaryRange(text)?.unreadable);
      t.ok(!unread.length, `U-6 (${day}) 저저번달·저저번주·지지난해는 예전처럼 읽지 못한 기간 ${JSON.stringify(unread)}`);
    });
  }
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    addSummaryRows(fx);
    const before = fx.db.transactions.length;
    // 분석 링크는 하루 한 번만 붙으므로(maybeKakaoCta) 첫 답장에서 본다
    const linked = await say(fx, "지지난달 요약");
    t.ok(linked.includes("month=2026-06") && !linked.includes("month=2026-07"), "U-6 카카오 ‘지지난달 요약’의 분석 링크는 6월");
    for (const [text, header, money] of [["지지난달 요약", "📊 6월 요약", "10,000원"], ["지지난달 얼마나 썼어", "📊 6월 요약", "10,000원"], ["지지난주 요약", "📊 지지난 주 요약", "22,000원"], ["지지난주 얼마 나갔어", "📊 지지난 주 요약", "22,000원"]]) {
      const reply = await say(fx, text);
      t.ok(reply.includes(header) && reply.includes(`지출: ${money}`), `U-6 카카오 ‘${text}’ → ${header} ${money} (${reply.slice(0, 50).replace(/\n/g, " / ")})`);
    }
    t.eq(fx.db.transactions.length, before, "U-6 요약 물음은 기록을 만들지 않는다");
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-7. 글로 쓴 ‘자동이체’는 카카오와 같은 이름(공유 판정 → 계좌이체)으로 저장한다. 목록에서 직접 고르면 그대로다.
// ════════════════════════════════════════════════════════════════════════════════════
const AUTO_DEBIT_TEXTS = ["통신비 50000 자동이체", "관리비 120000 자동이체로", "보험료 자동이체 30000", "자동이체 넷플릭스 13500"];
await scene("U-7", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const { paymentOptions, web, legacy, createState } = await webHarness(fx);
    const pick = paymentOptions.filter((option) => option.attrs["data-ab-pick"] === "1").map((option) => option.value);
    t.ok(pick.length === 1 && pick[0] === "자동이체" && paymentOptions.some((option) => option.value === "자동이체"), `U-7 홈 결제수단 목록의 ‘자동이체’는 고를 수만 있게 표시된다(목록에는 그대로 있다) ${JSON.stringify(pick)}`);
    for (const text of AUTO_DEBIT_TEXTS) {
      const kakao = kakaoRows(text)[0]?.payment, w = web(text).payment, l = legacy(text).payment;
      t.ok(kakao === "계좌이체" && w === kakao && l === kakao, `U-7 "${text}" → 웹·옛 화면도 카카오와 같은 ${kakao} (웹 ${w} · 옛 화면 ${l})`);
    }
    // 다른 기본 이름은 예전처럼 글에서 찾는다(공유 판정이 제 이름으로 읽는 말)
    for (const [text, payment] of [["점심 9000 계좌이체", "계좌이체"], ["점심 9000 체크카드", "체크카드"], ["점심 9000 국민카드", "국민카드"], ["택시 8000 현금", "현금"]]) {
      t.ok(web(text).payment === payment && kakaoRows(text)[0]?.payment === payment, `U-7 음성 "${text}"는 예전처럼 ${payment}`);
    }
    // 카카오 저장과 웹 폼 저장이 같은 이름
    const before = fx.db.transactions.length;
    await say(fx, "통신비 50000 자동이체");
    const saved = fx.db.transactions.slice(before);
    const state = createState().fill("통신비 50000 자동이체");
    const webBefore = fx.db.transactions.length;
    await post(fx, "/admin/transactions", { ...state.values(), transaction_date: "2026-08-04" });
    const webSaved = fx.db.transactions.slice(webBefore);
    t.ok(saved.length === 1 && saved[0].payment_method === "계좌이체" && webSaved.length === 1 && webSaved[0].payment_method === "계좌이체", `U-7 카카오 저장·웹 저장 모두 계좌이체 (카카오 ${JSON.stringify(saved.map((row) => row.payment_method))} · 웹 ${JSON.stringify(webSaved.map((row) => row.payment_method))})`);
    // 목록에서 직접 고른 ‘자동이체’는 그대로 저장한다
    const picked = createState().fill("통신비 50000").edit("payInput", "자동이체");
    const pickedBefore = fx.db.transactions.length;
    await post(fx, "/admin/transactions", { ...picked.values(), transaction_date: "2026-08-03" });
    const pickedRow = fx.db.transactions.slice(pickedBefore)[0];
    t.ok(picked.values().quick_manual_payment === "1" && pickedRow?.payment_method === "자동이체", `U-7 목록에서 직접 고른 자동이체는 그대로 자동이체 (받음 ${pickedRow?.payment_method})`);
  }));
  // 등록 결제수단 이름이 ‘자동이체’면 카카오도 그 이름으로 읽으므로 웹도 글에서 찾는다(고를 수만 있는 표시 없음)
  await withClock(DAY, () => fixture(async (fx) => {
    const assets = [{ id: "asset-1", name: "국민카드", kind: "credit_card", balance: 0 }, { id: "asset-v81-auto", name: "자동이체", kind: "bank_account", balance: 0 }];
    const { paymentOptions, web, legacy } = await webHarness(fx, assets);
    t.ok(!paymentOptions.some((option) => option.attrs["data-ab-pick"]), "U-7 등록 결제수단 ‘자동이체’는 고를 수만 있는 표시가 없다");
    for (const text of AUTO_DEBIT_TEXTS.slice(0, 2)) {
      const kakao = kakaoRows(text, assets)[0]?.payment, w = web(text).payment, l = legacy(text).payment;
      t.ok(kakao === "자동이체" && w === kakao && l === kakao, `U-7 등록 결제수단 ‘자동이체’: "${text}" → 웹·옛 화면·카카오 모두 자동이체 (카카오 ${kakao} · 웹 ${w} · 옛 화면 ${l})`);
    }
  }));
  // 옛 관리자 화면의 빠른 기록(옛 화면 런타임)도 같은 목록 표시를 받는다
  t.eq(paymentListOptionsHtml(["계좌이체", "자동이체", "회사카드"], []), '<option value="계좌이체"></option><option value="자동이체" data-ab-pick="1"></option><option value="회사카드"></option>', "U-7 목록 option: 기본 목록의 ‘자동이체’만 고를 수만 있게 표시한다");
  t.eq(paymentListOptionsHtml(["자동이체"], ["자동이체"]), '<option value="자동이체"></option>', "U-7 등록 결제수단과 같은 이름이면 표시하지 않는다");
  const dashboardSource = read("src/modules/admin/dashboard-page.js");
  t.ok(dashboardSource.includes('<datalist id="paymentList">${paymentListOptionsHtml(paymentOptions, paymentAssetRows.map((p) => p.name))}</datalist>'), "U-7 옛 관리자 화면의 결제수단 목록도 같은 함수로 만든다");
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-8. 홈 빠른 입력의 분류 이름 맞춤(서버 분류를 부를 수 없을 때의 화면 안 추정)은 낱말 끝에서만 맞는다
// ════════════════════════════════════════════════════════════════════════════════════
await scene("U-8", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const { script, paymentOptions, categoryOptions } = await webHarness(fx);
    // 지난 기록의 분류 이름(사용자가 만든 이름)도 목록에 든다 — 한글 이름·영문 대문자 이름
    const createState = makeWebFactory(script, { paymentOptions, categoryOptions: [...categoryOptions, { value: "반찬가게", attrs: {} }, { value: "OTT", attrs: {} }] });
    const web = (text) => createState().fill(text).view().category;
    // 낱말 속 분류 이름은 맞지 않는다 — 웹도 카카오(공유 규칙)와 같은 분류다. 앞의 셋은 예전에 낱말 속 이름이 맞아 카카오와 달랐고(급여·기타·반찬가게),
    // 뒤의 셋은 공유 규칙도 같은 분류로 읽는 말이라 예전부터 같았다(바뀌지 않음을 본다).
    for (const [text, inside] of [["점심 9000 급여통장", "급여"], ["기타줄 15000", "기타"], ["반찬가게아저씨 선물 12000", "반찬가게"], ["운동화 59000", "운동"], ["도서관 복사 3000", "도서"], ["교통카드 충전 20000", "교통"]]) {
      const kakao = kakaoRows(text)[0]?.category, w = web(text);
      t.ok(w === kakao, `U-8 "${text}"의 낱말 속 ‘${inside}’는 분류 이름으로 맞지 않는다 — 카카오와 같은 ${kakao} (웹 ${w})`);
    }
    // 낱말 끝의 분류 이름은 예전처럼 맞는다(조사·꼬리·합성어 끝)
    for (const [text, category] of [["식비 9000", "식비"], ["식비로 9000", "식비"], ["대중교통 1250", "교통"], ["외식했어 30000", "외식"], ["반찬가게 12000", "반찬가게"], ["반찬가게에서 12000", "반찬가게"], ["동네 반찬가게, 12000", "반찬가게"]]) {
      t.eq(web(text), category, `U-8 낱말 끝의 분류 이름 "${text}" → ${category}`);
    }
    // 이름과 글을 모두 소문자로 견준다(예전에는 이름이 대문자면 맞지 않았다). 영문으로 끝나는 이름 뒤에 영문·숫자가 붙으면 맞지 않는다.
    t.eq(web("ott 13500"), "OTT", "U-8 영문 대문자 분류 이름 ‘OTT’도 소문자 글에서 맞는다");
    t.ok(web("ottx 13500") !== "OTT", "U-8 영문 이름 뒤에 영문이 이어지면(‘ottx’) 맞지 않는다");
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// U-10. 카카오 기록 수정에서 구분을 바꿀 때, 원문에서 저절로 채운 메모는 분류 근거에 다시 넣지 않는다(T-18 저장 때 분류와 같다)
// ════════════════════════════════════════════════════════════════════════════════════
async function typeChange(fx, text, edits = []) {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  const before = fx.db.transactions.length;
  await say(fx, text);
  const row = fx.db.transactions.slice(before)[0];
  const saved = { type: row?.type, category: row?.category, memo: row?.memo, raw_text: row?.raw_text };
  for (const line of edits) await say(fx, line);
  const list = await say(fx, "오늘 기록");
  const seq = (list.match(new RegExp(`(\\d{2})번[^\\n]*?${numberWithCommasLocal(row?.amount || 0)}원`)) || [])[1] || "01";
  const toType = saved.type === "income" ? "expense" : "income";
  const reply = await say(fx, `수정 ${seq}번 구분 ${toType === "income" ? "수입" : "지출"}`);
  const after = fx.db.transactions.find((item) => item.id === row?.id) || {};
  return { saved, after, toType, reply, rowsAdded: fx.db.transactions.length - before };
}
const numberWithCommasLocal = (value) => String(value).replace(/\B(?=(\d{3})+(?!\d))/g, ",");
await scene("U-10", async () => {
  // 수입으로 저장된 문장을 지출로 바꾼다 — 메모 ‘○○ 농협’의 ‘농협’(결제수단 ‘농협체크’에서 남은 말)이 장보기를 정하지 않는다
  for (const text of ["용돈 9000 농협체크", "환급 9000 농협체크", "월급 9000 농협체크", "캐시백 3000 농협체크"]) {
    await withClock(DAY, () => fixture(async (fx) => {
      const { saved, after, toType, reply, rowsAdded } = await typeChange(fx, text);
      const expected = (await resolveManualInputClassification(fx.env, HH, toType, { raw_text: saved.raw_text, memo: saved.memo, manual_memo: false })).category;
      t.ok(saved.type === "income" && after.type === "expense" && after.category === expected && expected !== "장보기" && reply.includes(`→ ${expected}`) && rowsAdded === 1,
        `U-10 "${text}"(수입, 메모 ‘${saved.memo}’)를 지출로 바꾸면 원문만으로 정한 ${expected} (받음 ${after.type}/${after.category} · ${reply.slice(0, 50).replace(/\n/g, " / ")})`);
    }));
  }
  // 직접 고친 메모는 예전처럼 근거에 넣는다
  await withClock(DAY, () => fixture(async (fx) => {
    const { after } = await typeChange(fx, "용돈 9000 농협체크", ["수정 01번 내용 동네 마트 장보기"]);
    t.ok(after.type === "expense" && after.category === "장보기" && after.memo === "동네 마트 장보기", `U-10 직접 고친 메모(‘동네 마트 장보기’)는 예전처럼 분류를 정한다 (받음 ${after.type}/${after.category})`);
  }));
  // 지출 → 수입, 여러 건으로 저장한 기록(원문이 그 조각), 원문 없는 기록도 예전과 같다
  await withClock(DAY, () => fixture(async (fx) => {
    const { after } = await typeChange(fx, "점심 9000 농협체크");
    t.ok(after.type === "income" && after.category === "기타수입", `U-10 지출 → 수입은 예전처럼 기타수입 (받음 ${after.type}/${after.category})`);
  }));
  await withClock(DAY, () => fixture(async (fx) => {
    const { saved, after } = await typeChange(fx, "월급 2500000 농협체크, 커피 4500");
    t.ok(saved.raw_text === "월급 2500000 농협체크" && after.type === "expense" && after.category !== "장보기", `U-10 여러 건으로 저장한 기록(원문 = 그 조각)도 저절로 채운 메모를 넣지 않는다 (받음 ${after.type}/${after.category})`);
  }));
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    fx.db.transactions.push({ id: "tx-v81-noraw", household_id: HH, user_id: "user-bin", transaction_date: DAY, type: "income", amount: 7000, category: "기타수입", memo: "동네 마트", payment_method: "", source: "web", raw_text: "", created_at: `${DAY}T03:00:00.000Z` });
    const list = await say(fx, "오늘 기록");
    const seq = (list.match(/(\d{2})번[^\n]*?7,000원/) || [])[1] || "01";
    await say(fx, `수정 ${seq}번 구분 지출`);
    const after = fx.db.transactions.find((item) => item.id === "tx-v81-noraw") || {};
    t.ok(after.type === "expense" && after.category === "장보기", `U-10 원문 없는 기록은 예전처럼 메모(‘동네 마트’)로 분류한다 (받음 ${after.type}/${after.category})`);
  }));
});

// ═══════════════════════════════════════════════════════════════════════════════════════
// V81-a·c. 두 번 앞(지지난주·저저번주·지지난·지지난달·저저번달)과 다가올 요일(다음·오는·이번·지난번 + 요일)은 한 건 입력에서도 그 뜻이다.
//   서버(parseTransaction·resolveWeekdayPhrase)·웹 홈 자산·옛 화면 인라인이 같은 날을 읽고, 메모에 날짜 말이 남지 않는다.
//   예전에는 ‘지지난주 금요일’이 지난주 금요일, ‘지지난달 25일’이 지난달 25일(메모 ‘지 커피’), ‘다음·오는·이번 금요일’이 가장 가까운 지난 금요일이었다.
// ═══════════════════════════════════════════════════════════════════════════════════════
// 기대 날짜는 파서의 식을 빌리지 않고 따로 센다. 주는 월요일에 시작한다(V22.9.26 규칙).
const isoAdd = (iso, days) => new Date(Date.parse(`${iso}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
const monIndex = (iso) => (new Date(`${iso}T00:00:00Z`).getUTCDay() + 6) % 7; // 월요일 0 … 일요일 6
function expectWeekday(base, scope, dow) {
  const monday = isoAdd(base, -monIndex(base));
  const step = (dir) => { for (let k = 1; k <= 7; k += 1) { const d = isoAdd(base, dir * k); if (monIndex(d) === dow) return d; } return ""; };
  return { week0: isoAdd(monday, dow), week1: isoAdd(monday, dow + 7), "week-1": isoAdd(monday, dow - 7), "week-2": isoAdd(monday, dow - 14),
    prev: step(-1), prev2: isoAdd(step(-1), -7), next: step(1), bare: monIndex(base) === dow ? base : step(-1) }[scope];
}
const monthDay = (base, shift, day) => {
  const [y, m] = base.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + shift, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(day === "말일" ? last : day).padStart(2, "0")}`;
};
// [말, 기대(요일 범위 또는 [달 이동, 날])]. 끝의 ‘예전 그대로’ 줄은 이번에 바뀌지 않아야 하는 대조다.
const V81_WEEKDAY = [
  ["지지난주 금요일", "week-2", 4], ["저저번주 금요일", "week-2", 4], ["지지난 주 금요일", "week-2", 4], ["저저번 주 월요일", "week-2", 0], ["지지난주 일요일", "week-2", 6],
  ["지지난 금요일", "prev2", 4], ["저저번 금요일", "prev2", 4], ["지지난번 화요일", "prev2", 1],
  ["지난번 금요일", "prev", 4], ["지난번 일요일", "prev", 6],
  ["이번 금요일", "week0", 4], ["이번 월요일", "week0", 0], ["이번 일요일", "week0", 6],
  ["다음 금요일", "next", 4], ["오는 금요일", "next", 4], ["돌아오는 금요일", "next", 4], ["다가오는 수요일", "next", 2], ["다음 월요일", "next", 0],
  ["지난 금요일", "prev", 4], ["지난주 금요일", "week-1", 4], ["이번주 금요일", "week0", 4], ["다음주 금요일", "week1", 4], ["금요일", "bare", 4], // 예전 그대로
];
const V81_MONTH = [
  ["지지난달 25일", -2, 25], ["저저번달 25일", -2, 25], ["지지난 달 5일", -2, 5], ["저저번 달 1일", -2, 1], ["지지난달 말일", -2, "말일"], ["저저번달 말일", -2, "말일"],
  ["지난달 25일", -1, 25], ["지난달 말일", -1, "말일"], ["다음달 3일", 1, 3], // 예전 그대로
];
const V81_CONTROL = new Set(["지난 금요일", "지난주 금요일", "이번주 금요일", "다음주 금요일", "금요일", "지난달 25일", "지난달 말일", "다음달 3일"]);
const V81_CLOCKS = ["2026-08-05", "2026-08-07", "2026-08-08", "2026-08-09", "2026-08-03", "2026-01-02", "2026-02-10"];
await scene("V81-a·c 한 건 해석", async () => {
  for (const day of V81_CLOCKS) {
    await withClock(day, () => fixture(async (fx) => {
      const { createState, legacy, inBrowser } = await webHarness(fx);
      const cases = [
        ...V81_WEEKDAY.map(([head, scope, dow]) => [head, expectWeekday(day, scope, dow), true]),
        ...V81_MONTH.map(([head, shift, date]) => [head, monthDay(day, shift, date), false]),
      ];
      for (const [head, want, weekday] of cases) {
        const text = `${head} 커피 4500원`;
        const problems = [];
        const server = parseTransaction(text, {});
        if (server.transaction_date !== want || server.memo !== "커피") problems.push(`서버 ${server.transaction_date}/${server.memo}`);
        if (weekday && resolveWeekdayPhrase(head, nowKstDate()) !== want) problems.push(`resolveWeekdayPhrase ${resolveWeekdayPhrase(head, nowKstDate())}`);
        if (normalizeDateValue(head) !== want) problems.push(`카카오 날짜 칸 ${normalizeDateValue(head)}`);
        // 웹 홈 자산·옛 화면 인라인은 같은 자산 함수(quickInputDate)로 날짜를 읽는다. 메모는 각 화면 흐름 그대로 본다.
        const webDate = inBrowser(`quickInputDate(${JSON.stringify(text)}, ${JSON.stringify(day)})`);
        if (webDate !== want) problems.push(`웹 자산 날짜 ${webDate}`);
        const webMemo = createState().fill(text).view().memo, oldMemo = legacy(text).memo;
        if (webMemo !== "커피" || oldMemo !== "커피") problems.push(`메모 웹 ${webMemo} · 옛 화면 ${oldMemo}`);
        const tag = /지지난|저저번/.test(head) ? "V81-a" : V81_CONTROL.has(head) ? "V81-대조" : "V81-c";
        t.ok(!problems.length, `${tag} (${day}) ‘${head}’ → ${want} 메모 ‘커피’ (서버·요일 풀이·카카오 날짜 칸·웹 자산·웹/옛 화면 메모) ${problems.join(" · ")}`);
      }
    }));
  }
});
// 앞날 정책(바꾸지 않고 따른다): 날짜 말이 앞날을 가리키면 그날 그대로 저장한다(미리 적는 기록 — ‘내일’·‘다음주 금요일’·연도 없이 쓴 반년 안의
// ‘10월 30일’·‘25일 월세’). 막거나 작년으로 돌리지 않는다. 연도 없는 ‘월 일’만 반년(183일) 넘게 뒤면 작년이다(V22.9.34 D4). 카카오 날짜 칸(‘모레’)도 같다.
await scene("V81-c 앞날", async () => {
  await withClock("2026-10-27", () => fixture(async (fx) => {
    const { inBrowser } = await webHarness(fx);
    for (const [text, want] of [
      ["10월 30일 커피 4500원", "2026-10-30"], ["다음 금요일 커피 4500원", "2026-10-30"], ["이번 금요일 커피 4500원", "2026-10-30"], ["오는 일요일 커피 4500원", "2026-11-01"],
      ["모레 커피 4500원", "2026-10-29"], ["다음주 금요일 커피 4500원", "2026-11-06"],
    ]) {
      const server = parseTransaction(text, {}).transaction_date, web = inBrowser(`quickInputDate(${JSON.stringify(text)}, "2026-10-27")`);
      t.ok(server === want && web === want, `V81-c 앞날 정책: "${text}" (2026-10-27 화) → ${want} 서버·웹 같음 (서버 ${server} · 웹 ${web})`);
    }
    for (const [value, want] of [["모레", "2026-10-29"], ["다음 금요일", "2026-10-30"], ["10월 30일", "2026-10-30"], ["오는 금요일", "2026-10-30"]]) {
      t.ok(normalizeDateValue(value) === want, `V81-c 카카오 날짜 칸 ‘${value}’ → ${want} (글로 쓴 것과 같은 앞날 정책, 받음 ${normalizeDateValue(value)})`);
    }
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    const before = fx.db.transactions.length;
    await say(fx, "다음 금요일 회식 52000원 택시 8000원");
    const saved = fx.db.transactions.slice(before).map((row) => row.transaction_date);
    t.ok(saved.length === 2 && saved.every((date) => date === "2026-10-30"), `V81-c 카카오 저장 "다음 금요일 회식 52000원 택시 8000원" → 두 건 모두 2026-10-30 (받음 ${JSON.stringify(saved)})`);
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// V81-b. 카카오 예산 명령의 ‘지지난달·저저번달’은 두 달 전이고, 달 말은 분류 이름에 남지 않는다(요약의 U-6 ‘지지난달’과 같은 두 달 전).
//   예전에는 안의 ‘지난달’을 읽어 지난달로 보았고 분류 이름이 ‘지지난달 식비’가 되어 ‘등록된 카테고리를 찾지 못했어요’로 끝났다.
// ════════════════════════════════════════════════════════════════════════════════════
const monthOf = (day, shift) => monthDay(day, shift, 1).slice(0, 7);
// [문장, 달 이동, 분류, 금액]. 앞의 네 꼴(첫 갈래 ‘… 예산 금액’·띄어 쓴 달·‘예산설정’ 갈래·‘전체’)을 다 둔다. 끝의 ‘예전 그대로’ 줄은 대조다.
const V81_BUDGET = [
  ["지지난달 식비 예산 30만원", -2, "식비", 300000], ["저저번달 식비 예산 30만원", -2, "식비", 300000], ["지지난 달 식비 예산 30만원", -2, "식비", 300000],
  ["저저번 달 교통 예산 10만원", -2, "교통", 100000], ["지지난달 예산 300만원", -2, "__total", 3000000], ["지지난달 식비 예산설정 30만원", -2, "식비", 300000],
  ["저저번달 예산설정 300만원", -2, "__total", 3000000], ["지지난달 전체 예산 300만원", -2, "__total", 3000000], ["지지난달 식비 예산 저장 30만원", -2, "식비", 300000],
  ["지난달 식비 예산 30만원", -1, "식비", 300000], ["저번 달 식비 예산 30만원", -1, "식비", 300000], ["식비 예산 30만원", 0, "식비", 300000], // 예전 그대로
  ["다음달 식비 예산 30만원", 1, "식비", 300000], ["지난달 예산설정 300만원", -1, "__total", 3000000], ["이번달 예산 80만원", 0, "__total", 800000], // 예전 그대로
];
await scene("V81-b 예산 달", async () => {
  for (const day of ["2026-08-05", "2026-01-02", "2026-02-10", "2026-12-20"]) {
    await withClock(day, async () => {
      for (const [text, shift, category, amount] of V81_BUDGET) {
        const got = parseDirectBudgetSetCommand(text);
        const want = { month: monthOf(day, shift), category, amount };
        const tag = shift === -2 ? "V81-b" : "V81-b 대조";
        t.ok(JSON.stringify(got) === JSON.stringify(want), `${tag} (${day}) "${text}" → ${want.month} ${category} ${amount} (받음 ${JSON.stringify(got)})`);
      }
    });
  }
  // 카카오 끝까지: 저장되는 행·답장. 해가 바뀌는 때(1월)도 본다. 지난달 예산은 건드리지 않는다.
  for (const [day, text, category, amount, label] of [
    ["2026-08-05", "지지난달 식비 예산 30만원", "식비", 300000, "식비"], ["2026-08-05", "저저번달 예산 300만원", "__total", 3000000, "전체 월"],
    ["2026-01-02", "지지난달 교통 예산 10만원", "교통", 100000, "교통"],
  ]) {
    await withClock(day, () => fixture(async (fx) => {
      putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
      const month = monthOf(day, -2), last = monthOf(day, -1);
      const reply = await say(fx, text);
      const rows = (fx.db.accountbook_budgets || []).filter((row) => row.household_id === HH && row.category === category && Number(row.amount) === amount);
      t.ok(rows.length === 1 && rows[0].month === month && reply.includes(`✅ ${month} ${label} 예산을 설정했어요`) && !reply.includes("찾지 못했어요"),
        `V81-b 카카오 (${day}) "${text}" → ${month} ${label} 예산 저장·답장, 지난달(${last})은 그대로 (행 ${JSON.stringify(rows.map((row) => row.month))} · 답 ${reply.split("\n")[0]})`);
    }));
  }
});

// ════════════════════════════════════════════════════════════════════════════════════
// V81-d. 날짜 파서가 읽는 하루 말 ‘모레·지금·방금’과 맞는 8자리 날짜는 메모에 남지 않는다(날짜 파서와 같은 낱말 경계).
//   예전에는 ‘모레 커피 4500원’의 메모가 ‘모레 커피’, ‘20260731 커피 4500원’이 ‘20260731 커피’였다. 서버·웹 홈 자산·옛 화면이 같은 공유 함수(cleanInputMemo)를 쓴다.
// ════════════════════════════════════════════════════════════════════════════════════
const MEMO_DROP = [
  ["모레 커피 4500원", "커피"], ["커피 모레 4500원", "커피"], ["지금 커피 4500원", "커피"], ["방금 택시 8000원", "택시"], ["택시 8000원 지금", "택시"],
  ["20260731 커피 4500원", "커피"], ["커피 4500원 20260731", "커피"], ["모레아침 커피 4500원", "아침 커피"], ["모레 아모레 크림 30000원", "아모레 크림"],
  ["아모레퍼시픽 모레 30000원", "아모레퍼시픽"],
];
// 그대로 남아야 하는 말: 낱말 속 ‘모레’·‘지금’·‘방금’, 날짜 파서도 날짜로 읽지 않는 꼴, 달·날이 맞지 않는 8자리 수(주문번호)
const MEMO_KEEP = [
  ["아모레 크림 30000원", "아모레 크림"], ["모레아 소품 30000원", "모레아 소품"], ["지금껏 최고 커피 4500원", "지금껏 최고 커피"], ["방금전 택시 8000원", "방금전 택시"],
  ["모레까지 커피 4500원", "모레까지 커피"], ["어제 커피 4500원 주문번호 20123456", "커피 주문번호 20123456"],
];
await scene("V81-d 메모", async () => {
  await withClock(DAY, () => fixture(async (fx) => {
    const { createState, legacy } = await webHarness(fx);
    for (const [list, tag] of [[MEMO_DROP, "V81-d"], [MEMO_KEEP, "V81-d 대조"]]) {
      for (const [text, want] of list) {
        const server = parseTransaction(text, {}).memo, webMemo = createState().fill(text).view().memo, oldMemo = legacy(text).memo;
        t.ok(server === want && webMemo === want && oldMemo === want, `${tag} "${text}" 메모 ‘${want}’ (서버 ${server} · 웹 ${webMemo} · 옛 화면 ${oldMemo})`);
      }
    }
    const memos = rowsOf(parseMultipleTransactions("모레 커피 4500원 택시 8000원", {})).map((row) => `${row.memo}:${row.date}`);
    t.ok(JSON.stringify(memos) === JSON.stringify(["커피:2026-08-07", "택시:2026-08-07"]), `V81-d 여러 건 "모레 커피 4500원 택시 8000원" → 메모 커피·택시, 두 건 모두 2026-08-07 (받음 ${JSON.stringify(memos)})`);
    const before = fx.db.transactions.length;
    await say(fx, "모레 커피 4500원");
    const saved = fx.db.transactions.slice(before).map((row) => `${row.memo}:${row.transaction_date}`);
    t.ok(JSON.stringify(saved) === JSON.stringify(["커피:2026-08-07"]), `V81-d 카카오 저장 "모레 커피 4500원" → 메모 ‘커피’ 2026-08-07 (받음 ${JSON.stringify(saved)})`);
    const state = createState().fill("20260731 커피 4500원");
    const webBefore = fx.db.transactions.length;
    await post(fx, "/admin/transactions", state.values());
    const webSaved = fx.db.transactions.slice(webBefore).map((row) => `${row.memo}:${row.transaction_date}`);
    t.ok(state.submit() && JSON.stringify(webSaved) === JSON.stringify(["커피:2026-07-31"]), `V81-d 웹 저장 "20260731 커피 4500원" → 메모 ‘커피’ 2026-07-31 (받음 ${JSON.stringify(webSaved)})`);
  }));
});

// ════════════════════════════════════════════════════════════════════════════════════
// X-29. 대표 명령어 ‘기록하기’ 뒤에 이어 쓴 거래: 앞머리 ‘기록하기·입력하기’(쌍점 포함)도 ‘기록·입력’처럼 떼고 저장한다
// ════════════════════════════════════════════════════════════════════════════════════
// 카카오 그룹 챗봇은 대표 명령어를 누르면 입력창에 명령어를 넣고, 사용자는 그 뒤에 이어 쓴다(카카오 안내 슬라이드 25·46).
// 2026-10-27 앱 승인 담당자가 대표 명령어에 ‘기록하기’를 더해 달라고 했다. 예전에는 ‘기록하기 점심 12000원’이 메모 ‘기록하기 점심’으로 저장됐다.
// 거래마다 새 픽스처를 써서 같은 내용 중복 막기가 끼어들지 않게 한다.
const RECORD_COMMAND_HEADS = [
  ["기록하기 점심 12000원", ["점심:12000:2026-08-05"]],
  ["/기록하기 김밥 3500원", ["김밥:3500:2026-08-05"]],
  ["@말해가계부 기록하기 저녁 15000원", ["저녁:15000:2026-08-05"]],
  ["기록하기: 커피 4500원", ["커피:4500:2026-08-05"]],
  ["기록하기 : 라떼 5200원", ["라떼:5200:2026-08-05"]],
  ["기록하기:빵 3000원", ["빵:3000:2026-08-05"]],
  ["기록하기 어제 택시 8000원", ["택시:8000:2026-08-04"]],
  ["기록하기 지난 금요일 우유 2500원 버스 1500원", ["우유:2500:2026-07-31", "버스:1500:2026-07-31"]],
  ["입력하기 약국 6000원", ["약국:6000:2026-08-05"]],
  ["입력하기: 주차 2000원", ["주차:2000:2026-08-05"]],
  // 바뀌면 안 되는 것: 예전부터 떼던 ‘기록 ’·‘입력 ’.
  ["기록 점심 12000원", ["점심:12000:2026-08-05"]],
  ["입력 커피 4500원", ["커피:4500:2026-08-05"]],
];
await scene("X-29", async () => {
  for (const [text, expected] of RECORD_COMMAND_HEADS) {
    await withClock(DAY, () => fixture(async (fx) => {
      putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      t.eq(show(fx.db.transactions.slice(before)), JSON.stringify(expected), `X-29 카카오 "${text}" 저장 메모에 명령어가 남지 않는다 (${reply.slice(0, 40).replace(/\n/g, " / ")})`);
    }));
  }
  // 명령어만 보내면 예전처럼 기록 방법 안내만 하고 저장하지 않는다(OpenBuilder 01_도움말_전체안내 패턴·KAKAO_MANUAL_TRIGGERS.record).
  await withClock(DAY, () => fixture(async (fx) => {
    putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
    for (const text of ["기록하기", "/기록하기", "@말해가계부 기록하기", "입력하기", "기록하기 "]) {
      const before = fx.db.transactions.length;
      const reply = await say(fx, text);
      t.ok(fx.db.transactions.length === before && reply.includes("처럼 보내면 바로 기록돼요"), `X-29 명령어만 보낸 "${text}"는 기록 방법 안내 (${reply.slice(0, 40).replace(/\n/g, " / ")})`);
    }
  }));
});

if (SOFT) {
  console.log(`V22981_SOFT: 통과 ${softChecks - failures.length} · 실패 ${failures.length} (검사 ${softChecks}개)`);
  for (const message of failures) console.log(`  실패: ${message}`);
  if (failures.length) process.exitCode = 1;
} else {
  base.done();
}
