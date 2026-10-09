// V22.9.34 — 감사(docs/codex/AUDIT_FINDINGS_V22_9_33.md)의 금액·날짜 해석 결함을 고정한다.
//   D1·N2 금액: 날짜(10/3·10.3·7-15)·시각(19:40)·카드 끝자리((1234)·끝자리 1234)·카드 문자의 누적 금액을 금액으로 읽지 않는다.
//   D2 구분: "부모님 용돈", "조카 세뱃돈", "용돈 드림", 수수료·배송비는 지출이다. 아무 말 없는 "용돈 30000"은 수입으로 둔다.
//   N6·D8·D4 날짜: 엊그제·그끄저께, "이틀/일주일/한 달 전", 말일, 작년·올해·내년, 연도 없는 연말 날짜를 웹·카카오가 같은 날로 읽는다.
//   N11 금액: 단위 없는 한 자리 숫자("택시 7")를 7원으로 저장하지 않고 다시 묻는다.
//   D15 자정: 화면을 연 뒤 자정을 넘기면 빠른 입력의 오늘도 다음 날이 된다.
import vm from "node:vm";
import {
  explicitDateIntent, moneyTokenSpans, parseMultipleTransactions, parseTransaction, quickInputDate, transactionTypeFromText,
} from "../src/index.js";
import { BASE, app, counter, ctx, fixture, page, post, skill, withClock } from "./lib-audit-v22934.mjs";

const { ok, eq, deepEq, done } = counter("V22.9.34 금액·날짜 해석 검사 통과");
const amounts = (text) => moneyTokenSpans(text).map((span) => span.amount);

// ── D1·N2 금액 후보 ─────────────────────────────────────────
for (const [text, expected] of [
  ["10/3 52000 마트", [52000]],
  ["10.3 52000 마트", [52000]],
  ["7-15 택시 12000", [12000]],
  ["19:40 택시 12000", [12000]],
  ["택시 12000 19:40", [12000]],
  ["국민카드(1234) 승인 52,000원 일시불 10/03 19:40 스타벅스", [52000]],
  ["[Web발신] 신한카드(5678)승인 홍*동 12,300원(일시불)10/09 12:31 김밥천국 누적1,234,567원", [12300]],
  ["카드 끝자리 1234 결제 15000원", [15000]],
  ["1234-****-****-5678 결제 8000원", [8000]],
  // 바뀌지 않아야 하는 대조군
  ["1.5만 커피", [15000]],
  ["10.5만원 가방", [105000]],
  ["커피 4500 빵 3000", [4500, 3000]],
  ["3/4 1만원 장보기", [10000]],
  ["2시간 주차 3000원", [3000]],
]) deepEq(amounts(text), expected, `D1 금액 후보: ${text}`);

await withClock("2026-10-09", async () => {
  for (const [text, count, amount, date] of [
    ["10/3 52000 마트", 1, 52000, "2026-10-03"],
    ["19:40 택시 12000", 1, 12000, "2026-10-09"],
    ["국민카드(1234) 승인 52,000원 일시불 10/03 19:40 스타벅스", 1, 52000, "2026-10-03"],
    ["[Web발신] 신한카드(5678)승인 홍*동 12,300원(일시불)10/09 12:31 김밥천국 누적1,234,567원", 1, 12300, "2026-10-09"],
  ]) {
    const rows = parseMultipleTransactions(text, {});
    ok(rows.length === count && rows[0]?.amount === amount && rows[0]?.transaction_date === date, `D1 카카오는 한 건으로 저장한다: ${text} → ${rows.map((row) => `${row.amount}@${row.transaction_date}`).join(", ")}`);
  }
});

// ── D2 수입·지출 구분 ───────────────────────────────────────
for (const text of ["부모님 용돈 30만원", "조카 세뱃돈 5만원", "용돈 드림 10만원", "아이 용돈 2만원", "판매 수수료 3000원", "배송비 3000원"]) eq(transactionTypeFromText(text), "expense", `D2 지출: ${text}`);
for (const text of ["용돈 받음 5만원", "엄마한테 용돈 받았어 3만원", "용돈 30000", "세뱃돈 30000", "중고 판매 50000원", "용돈수입 50000", "수수료 환급 3000원"]) eq(transactionTypeFromText(text), "income", `D2 수입: ${text}`);

// ── N6·D8·D4 날짜 ───────────────────────────────────────────
const dateCases = [
  ["2026-10-09", "엊그제 커피 4500", "2026-10-07"],
  ["2026-10-09", "그끄저께 택시 8000", "2026-10-06"],
  ["2026-10-09", "이틀 전 점심 9000", "2026-10-07"],
  ["2026-10-09", "일주일 전 택시 8000", "2026-10-02"],
  ["2026-10-09", "2주일 후 병원 20000", "2026-10-23"],
  ["2026-10-09", "한 달 전 미용실 30000", "2026-09-09"],
  ["2026-10-09", "3개월 전 보험 50000", "2026-07-09"],
  ["2026-10-09", "지난달 말일 관리비 150000", "2026-09-30"],
  ["2026-10-09", "이번달 말일 월세 500000", "2026-10-31"],
  ["2026-10-09", "다음달 말일 카드값 300000", "2026-11-30"],
  ["2026-10-09", "작년 12월 25일 선물 30000", "2025-12-25"],
  ["2026-10-09", "올해 12월 25일 선물 30000", "2026-12-25"],
  ["2026-10-09", "내년 1월 2일 여행 300000", "2027-01-02"],
  ["2026-10-09", "재작년 3/1 회비 10000", "2024-03-01"],
  ["2026-10-09", "1일 전기요금 50000", "2026-10-01"],
  ["2026-01-05", "12월 28일 송년회 50000", "2025-12-28"],
  ["2026-01-05", "12/28 송년회 50000", "2025-12-28"],
  ["2026-01-05", "1월 3일 마트 30000", "2026-01-03"],
  ["2026-07-15", "10/3 마트 52000", "2026-10-03"],
  ["2026-07-15", "2월 1일 병원 20000", "2026-02-01"],
  ["2026-03-31", "한 달 전 미용실 30000", "2026-02-28"],
];
for (const [today, text, expected] of dateCases) {
  eq(quickInputDate(text, today), expected, `날짜(웹 공용 해석) ${today} 기준: ${text}`);
  await withClock(today, async () => {
    eq(parseTransaction(text, {}).transaction_date, expected, `날짜(카카오 해석) ${today} 기준: ${text}`);
  });
}
for (const text of ["엊그제 커피", "말일 관리비", "일주일 전 택시", "작년 12월 25일 선물", "이틀 전 점심"]) ok(explicitDateIntent(text), `날짜를 말한 문장으로 본다: ${text}`);
await withClock("2026-10-09", async () => {
  const row = parseMultipleTransactions("1일 전기요금 50000", {})[0];
  eq(row?.memo, "전기요금", "D8 \"1일 전기요금\"의 메모가 \"기요금\"으로 잘리지 않는다");
  for (const [text, memo] of [["작년 12월 25일 선물 30000", "선물"], ["엊그제 커피 4500", "커피"], ["일주일 전 택시 8000", "택시"], ["지난달 말일 관리비 150000", "관리비"]]) {
    eq(parseMultipleTransactions(text, {})[0]?.memo, memo, `날짜 말은 메모에 남지 않는다: ${text}`);
  }
});

// ── N11 단위 없는 한 자리 금액 ──────────────────────────────
await withClock("2026-10-09", async () => {
  await fixture(async (fx) => {
    await skill(fx, "안녕");
    await skill(fx, "2");
    const before = fx.db.transactions.length;
    const reply = await skill(fx, "택시 7");
    ok(/7원으로 읽혀 저장하지 않았어요/.test(reply) && fx.db.transactions.length === before, "N11 카카오: \"택시 7\"은 저장하지 않고 단위를 묻는다");
    await skill(fx, "택시 7원");
    ok(fx.db.transactions.some((row) => Number(row.amount) === 7), "N11 카카오: \"7원\"처럼 원을 붙이면 저장한다");
    await skill(fx, "택시 7000");
    ok(fx.db.transactions.some((row) => Number(row.amount) === 7000), "N11 카카오: 가계부 선택 뒤 보통 금액은 그대로 저장된다");
  });
  await fixture(async (fx) => {
    const base = { household_id: "house-home", month: "2026-10", type: "expense", transaction_date: "2026-10-09", memo: "택시", category: "교통", payment_method: "", user_id: "user-bin", return_to: "/app?month=2026-10&household_id=house-home", quick_manual_date: "0" };
    const before = fx.db.transactions.length;
    const refused = await post(fx, "/admin/transactions", { ...base, amount: "7", raw_text: "택시 7", quick_manual_amount: "0" });
    ok(refused.decoded.includes("amount_unit_required") && fx.db.transactions.length === before, "N11 웹: 문장 속 금액이 단위 없는 한 자리면 저장하지 않는다");
    const manual = await post(fx, "/admin/transactions", { ...base, amount: "7", raw_text: "택시 7", quick_manual_amount: "1" });
    ok(!manual.decoded.includes("amount_unit_required") && fx.db.transactions.some((row) => Number(row.amount) === 7), "N11 웹: 금액 칸을 직접 고친 저장은 받는다");
    const dated = await post(fx, "/admin/transactions", { ...base, amount: "4500", raw_text: "엊그제 커피 4500", memo: "커피", category: "카페/간식", transaction_date: "2026-10-07", quick_manual_amount: "0" });
    ok(!dated.decoded.includes("invalid_date") && fx.db.transactions.some((row) => Number(row.amount) === 4500 && row.transaction_date === "2026-10-07"), "새 날짜 표현도 웹 화면과 서버가 같은 날로 읽어 저장한다");
  });
});

// ── D15 자정을 넘긴 빠른 입력 ───────────────────────────────
{
  const KST = (iso) => Date.parse(`${iso}+09:00`);
  let clockMs = KST("2026-10-09T23:50:00");
  const previousNow = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = clockMs;
  try {
    await fixture(async (fx) => {
      const html = (await page(fx, "/app?month=2026-10&household_id=house-home")).html;
      const shellPath = (html.match(/\/assets\/mobile-home-shell-v\d+\.js/) || [])[0];
      ok(!!shellPath, "D15 홈이 빠른 입력 스크립트 자산을 싣는다");
      const script = await (await app.fetch(new Request(BASE + shellPath), fx.env, ctx)).text();
      const end = script.indexOf("\n(function mobileShellUiClientMain");
      ok(end > 0, "D15 빠른 입력 스크립트 경계를 찾는다");
      const decode = (value) => value.replace(/&quot;/g, "\"").replace(/&amp;/g, "&").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");
      const afterTag = html.match(/<p[^>]*id="quickAfter"[^>]*>/)[0];
      const afterAttrs = Object.fromEntries([...afterTag.matchAll(/([a-z-]+)="([^"]*)"/g)].map((m) => [m[1], decode(m[2])]));
      class ClockDate extends Date {
        constructor(...args) { if (args.length) super(...args); else super(clockMs); }
        static now() { return clockMs; }
      }
      const createState = (initialDate) => {
        const form = { handlers: {}, hidden: [], appendChild(node) { this.hidden.push(node); }, querySelector(selector) { return selector === 'input[name="month"]' ? { value: "2026-10" } : null; }, addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); } };
        const node = (value = "", attrs = {}) => ({ value, textContent: "", attrs, handlers: {}, focus() {}, getAttribute(key) { return this.attrs[key] ?? null; }, setAttribute(key, v) { this.attrs[key] = String(v); }, setCustomValidity(v) { this.validity = v; }, addEventListener(kind, fn) { (this.handlers[kind] ||= []).push(fn); }, closest() { return form; } });
        const fields = { smartInput: node(), amountInput: node(), memoInput: node(), payInput: node(), catInput: node(), txDate: node(initialDate), rawTextInput: node(), quickAfter: node("", { ...afterAttrs }), type: "expense" };
        const radios = { expense: node(), income: node() };
        for (const [kind, radio] of Object.entries(radios)) Object.defineProperty(radio, "checked", { get() { return fields.type === kind; }, set(v) { if (v) fields.type = kind; } });
        const document = {
          getElementById(id) { return fields[id] || null; },
          createElement() { return node(); },
          addEventListener() {},
          querySelectorAll(selector) { return selector === "input[name=type]" ? Object.values(radios) : []; },
          querySelector(selector) {
            if (selector === "#add form.form") return form;
            if (selector === "input[name=type][value=income]:checked") return fields.type === "income" ? radios.income : null;
            const match = selector.match(/input\[name=type\]\[value="?(income|expense)"?\]/);
            return match ? radios[match[1]] : null;
          },
        };
        vm.runInContext(script.slice(0, end), vm.createContext({ document, window: { addEventListener() {} }, location: { hash: "" }, navigator: {}, Intl, Date: ClockDate }));
        const fire = (field, kind) => { for (const fn of field.handlers[kind] || []) fn.call(field, { target: field }); };
        return { fields, fill(text) { fields.smartInput.value = text; fire(fields.smartInput, "input"); } };
      };
      clockMs = KST("2026-10-09T23:50:00");
      const beforeMidnight = createState("2026-10-09");
      beforeMidnight.fill("커피 4500");
      eq(beforeMidnight.fields.txDate.value, "2026-10-09", "D15 자정 전에는 화면의 오늘을 쓴다");
      const crossing = createState("2026-10-09");
      clockMs = KST("2026-10-10T00:10:00");
      crossing.fill("커피 4500");
      eq(crossing.fields.txDate.value, "2026-10-10", "D15 화면을 연 뒤 자정을 넘기면 오늘이 다음 날이 된다");
      crossing.fill("어제 커피 4500");
      eq(crossing.fields.txDate.value, "2026-10-09", "D15 자정을 넘긴 뒤의 \"어제\"도 새 오늘 기준이다");
      clockMs = KST("2026-10-09T23:50:00");
      const preset = createState("2026-10-05");
      clockMs = KST("2026-10-10T00:10:00");
      preset.fill("커피 4500");
      eq(preset.fields.txDate.value, "2026-10-05", "D15 달력에서 고른 날짜로 연 폼은 그 날짜를 그대로 쓴다");
    });
  } finally {
    globalThis.__AB_QA_FIXED_NOW_MS = previousNow;
  }
}

done();
