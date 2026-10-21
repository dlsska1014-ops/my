// V22.9.75 — 2026-10-14 감사에서 아직 재현되던 데이터·분류·백업·운영 화면 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 감사(docs/codex/AUDIT_FINDINGS_V22_9_44.md)가 찾은 결함 가운데 출시 직전까지 그대로 재현되던 것들을 고쳤다.
// 소스 문자열이 아니라 실제 요청(app.fetch)·카카오 발화·저장된 행으로 확인한다. 항목마다 한 절이다.
//   D-9  키워드 편집기에 저장한 카드(통신·교육/육아·용돈·부수입·급여…)가 자동 분류에 쓰이지 않던 것
//   A-10 낱말 속 글자가 분류를 정하던 것(커피+농협카드→장보기, 수술비→외식, 전기차 충전→공과금)
//
// ── 실행 ──
//   node validation/validate-data-fixes-v22975.mjs
//   V22975_ONLY=D-9,A-10   그 절만 돌린다.
//   V22975_SOFT=1           실패해도 멈추지 않고 실패한 검사를 모두 적는다(옛 코드에서 무엇이 깨지는지 볼 때).
import assert from "node:assert/strict";
import { counter, fixture, page, post, api, skill, putSetting, settingValue, intercept } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.75 data fixes");
const SOFT = process.env.V22975_SOFT === "1";
const ONLY = String(process.env.V22975_ONLY || "").split(",").map((item) => item.trim()).filter(Boolean);
const failures = [];
const ok = (value, message) => {
  if (value) return t.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
async function section(name, task) {
  if (ONLY.length && !ONLY.includes(name)) return;
  await task();
}

const HH = "house-home";
const decode = (text) => String(text || "").replace(/&quot;/g, "\"").replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");
async function kakaoRecord(fx, utterance) {
  const before = new Set(fx.db.transactions.map((row) => row.id));
  const reply = await skill(fx, utterance);
  const row = fx.db.transactions.find((item) => !before.has(item.id));
  return { reply, row, label: row ? `${row.type}/${row.category}` : "(저장 안 됨)" };
}
async function webRecord(fx, type, memo, amount) {
  const before = new Set(fx.db.transactions.map((row) => row.id));
  await post(fx, "/my/transactions", { household_id: HH, month: "2026-10", type, amount: String(amount), memo, transaction_date: "2026-10-14", user_id: "user-bin" });
  const row = fx.db.transactions.find((item) => !before.has(item.id));
  return row ? `${row.type}/${row.category}` : "(저장 안 됨)";
}
const classify = async (fx, type, rawText) => (await api(fx, "/u/api/input-classification", "POST", { household_id: HH, type, raw_text: rawText })).data?.category;
async function selectKakaoHousehold(fx) {
  await skill(fx, "오늘기록");
  await skill(fx, "2");
}

// ── D-9 키워드 편집기 카드가 자동 분류에 쓰인다 ──
// 편집기(/keyword-guide)는 통신·교육/육아·용돈·부수입처럼 기본 분류 이름에 없는 카드를 보여 주고 저장도 했지만,
// 분류에 쓰는 행은 기본 분류 이름에 맞는 키만 골라 만들어서 이 카드들의 키워드는 버려졌다. 수입 카드(급여·부수입)는
// 지출 칸(expense::)에 저장돼 수입 기록에 쓰이지 않았다. 카카오와 웹이 같은 설정 한 번 읽기로 판단하는지도 본다.
await section("D-9", async () => {
  const cardsOf = (html) => [...html.matchAll(/<details class="kwBox" data-type="([^"]*)" data-name="([^"]*)" data-orig="([^"]*)"/g)]
    .map((m) => ({ type: m[1], name: decode(m[2]), orig: decode(m[3]) }));
  const ADD = { "통신": "헬로모바일", "교육/육아": "눈높이교실,키즈카페", "용돈": "주간용돈봉투", "부수입": "크몽정산", "급여": "에이전시입금" };
  for (const present of [false, true]) {
    const mode = present ? "분류 표 있음" : "분류 표 없음(운영)";
    const shift = present ? 500 : 0;
    await fixture(async (fx) => {
      const guide = await page(fx, `/keyword-guide?household_id=${HH}`);
      const cards = cardsOf(guide.html);
      for (const name of Object.keys(ADD)) ok(cards.some((card) => card.name === name), `[${mode}] 편집기에 '${name}' 카드가 있다`);
      eq(cards.find((card) => card.name === "급여")?.type, "income", `[${mode}] '급여' 카드는 수입 카드다`);
      eq(cards.find((card) => card.name === "부수입")?.type, "income", `[${mode}] '부수입' 카드는 수입 카드다`);
      eq(cards.find((card) => card.name === "통신")?.type, "expense", `[${mode}] '통신' 카드는 지출 카드다`);
      const form = new URLSearchParams({ household_id: HH, month: "2026-10", return_to: "guide" });
      for (const card of cards) {
        form.append("kw_type", card.type);
        form.append("kw_name", card.name);
        form.append("kw_keywords", [card.orig, ADD[card.name] || ""].filter(Boolean).join(","));
        form.append("kw_orig", card.orig);
      }
      const saved = await post(fx, "/my/category-keywords/bulk-save", form);
      ok(saved.status === 302 || saved.status === 303, `[${mode}] 키워드 일괄 저장이 끝난다 (${saved.status})`);
      const map = JSON.parse(settingValue(fx, `category_keywords:${HH}`) || "{}");
      ok((map["income::급여"] || []).includes("에이전시입금"), `[${mode}] '급여' 카드 키워드는 수입 칸(income::급여)에 저장된다`);
      ok((map["income::부수입"] || []).includes("크몽정산"), `[${mode}] '부수입' 카드 키워드는 수입 칸(income::부수입)에 저장된다`);

      const CASES = [
        ["expense", "헬로모바일 요금", "통신"],
        ["expense", "눈높이교실 회비", "교육/육아"],
        ["expense", "주간용돈봉투", "용돈"],
        ["income", "크몽정산", "부수입"],
        ["income", "에이전시입금", "급여"],
        // 사용자 키워드가 기본 규칙(카페 → 카페/간식, 키즈 → 육아/자녀)보다 먼저다.
        ["expense", "키즈카페", "교육/육아"],
      ];
      let amount = 30000 + shift;
      for (const [type, memo, expected] of CASES) {
        amount += 1;
        eq(await webRecord(fx, type, memo, amount), `${type}/${expected}`, `[${mode}] 웹 직접 입력 '${memo}'`);
        eq(await classify(fx, type, memo), expected, `[${mode}] 홈 빠른 입력 분류 API '${memo}'`);
      }
      await selectKakaoHousehold(fx);
      const KAKAO = [
        ["헬로모바일", 33000, "원", "expense/통신"],
        ["눈높이교실", 45000, "원", "expense/교육/육아"],
        ["주간용돈봉투", 10000, "원", "expense/용돈"],
        ["크몽정산", 41005, "원 입금", "income/부수입"],
        ["에이전시입금", 3000000, "원 수입", "income/급여"],
        ["키즈카페", 15000, "원", "expense/교육/육아"],
      ];
      for (const [word, won, tail, expected] of KAKAO) {
        const said = `${word} ${won + shift}${tail}`;
        eq((await kakaoRecord(fx, said)).label, expected, `[${mode}] 카카오 '${said}'`);
      }
    }, { categoriesPresent: present });
  }

  // 옛 판은 수입 카드 키워드를 expense:: 칸에 저장했다. 그 설정도 수입 분류에 쓰이고 편집기 수입 카드에 보인다.
  await fixture(async (fx) => {
    putSetting(fx, `category_keywords:${HH}`, JSON.stringify({ "expense::급여": ["에이전시입금"], "expense::부수입": ["크몽정산"] }));
    const guide = await page(fx, `/keyword-guide?household_id=${HH}`);
    const salary = cardsOf(guide.html).find((card) => card.name === "급여");
    ok(salary?.type === "income" && salary.orig.split(",").includes("에이전시입금"), "옛 expense::급여 키워드가 편집기의 수입 '급여' 카드에 보인다");
    eq(await classify(fx, "income", "크몽정산"), "부수입", "옛 expense::부수입 키워드로 수입 분류가 정해진다");
    await selectKakaoHousehold(fx);
    eq((await kakaoRecord(fx, "에이전시입금 2900000원 수입")).label, "income/급여", "옛 expense::급여 키워드로 카카오 수입 분류가 정해진다");
  });

  // DB 왕복은 늘지 않는다: 카드 행은 이미 읽은 설정 한 줄(category_keywords)에서 만든다.
  // (고치기 전 코드에서도 같은 수다 — 이 세 검사는 결함 검사가 아니라 회귀 방지다.)
  await fixture(async (fx) => {
    putSetting(fx, `category_keywords:${HH}`, JSON.stringify({ "expense::통신": ["헬로모바일"] }));
    await selectKakaoHousehold(fx);
    const log = [];
    const stop = intercept(({ url, method }) => { log.push(`${method} ${url.pathname}`); });
    try {
      const saved = await kakaoRecord(fx, "헬로모바일 33900원");
      eq(log.length, 12, "카카오 한 건 저장의 Supabase 요청 수는 12회 그대로다");
      eq(log.filter((line) => line.startsWith("GET") && line.includes("accountbook_settings")).length, 2, "카카오 한 건 저장의 설정 읽기는 2회 그대로다");
      eq(saved.label, "expense/통신", "왕복 측정용 카카오 기록이 통신으로 저장된다");
      log.length = 0;
      const category = await classify(fx, "expense", "헬로모바일");
      eq(log.length, 5, "홈 빠른 입력 분류 API의 Supabase 요청 수는 5회 그대로다");
      eq(category, "통신", "왕복 측정용 분류 API가 통신을 돌려준다");
    } finally {
      stop();
    }
  });
});

// ── A-10 낱말 속 글자가 분류를 정하지 않는다 ──
// 규칙 표의 낱말을 들어온 글의 아무 위치에서나 찾아 점수를 더했기 때문에 '농협카드'의 '농협'(장보기),
// '수술'·'미술'의 '술'(외식), '전기차'의 '전기'(공과금)가 분류를 정했다. 다른 규칙의 더 긴 낱말 안에 든 낱말은
// 세지 않고, 규칙마다 적은 예외 말(except)이 덮는 낱말도 세지 않는다. 겹치지 않는 낱말끼리는 예전처럼 겨룬다.
await section("A-10", async () => {
  await fixture(async (fx) => {
    await selectKakaoHousehold(fx);
    const FIXED = [
      ["커피 4500원 농협카드", "카페/간식"],
      ["점심 12500원 농협카드", "외식"],
      ["수술비 200만원", "의료/병원"],
      ["전기차 충전 30000원", "주유/충전"],
      ["미술학원 10만원", "교육/학습"],
      ["동물병원 50000원", "반려동물"],
      ["스마트폰 케이스 20000원", "기타지출"],
      ["아이패드 50만원", "기타지출"],
      ["이마트24 3000원", "편의점"],
      ["아이스 아메리카노 4500원", "카페/간식"],
      ["에이전시 수수료 50000원", "세금/수수료"],
    ];
    // 고치기 전에도 맞던 것: 겹치지 않는 낱말의 겨루기와 같은 규칙 안의 겹친 낱말은 그대로다.
    const KEPT = [
      ["맥도날드 배달 9000원", "배달"],
      ["이마트 장보기 54000원", "장보기"],
      ["미용실 커트 20000원", "미용"],
      ["전기요금 45000원", "공과금"],
      ["병원 진료비 15000원", "의료/병원"],
      ["술값 40000원", "외식"],
      ["강아지 사료 32000원", "반려동물"],
    ];
    for (const [utterance, expected] of [...FIXED, ...KEPT]) {
      eq((await kakaoRecord(fx, utterance)).label, `expense/${expected}`, `카카오 '${utterance}'`);
    }
    for (const [rawText, expected] of [["커피 농협카드", "카페/간식"], ["수술비", "의료/병원"], ["전기차 충전", "주유/충전"], ["스마트폰 케이스", "기타지출"]]) {
      eq(await classify(fx, "expense", rawText), expected, `홈 빠른 입력 분류 API '${rawText}'`);
    }
  });
});

if (failures.length) {
  console.error(`FAIL: ${failures.length} checks failed`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
t.done();
