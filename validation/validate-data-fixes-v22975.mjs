// V22.9.75 — 2026-10-14 감사에서 아직 재현되던 데이터·분류·백업·운영 화면 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 감사(docs/codex/AUDIT_FINDINGS_V22_9_44.md)가 찾은 결함 가운데 출시 직전까지 그대로 재현되던 것들을 고쳤다.
// 소스 문자열이 아니라 실제 요청(app.fetch)·카카오 발화·저장된 행으로 확인한다. 항목마다 한 절이다.
//   D-9  키워드 편집기에 저장한 카드(통신·교육/육아·용돈·부수입·급여…)가 자동 분류에 쓰이지 않던 것
//   A-10 낱말 속 글자가 분류를 정하던 것(커피+농협카드→장보기, 수술비→외식, 전기차 충전→공과금)
//   E-16 백업센터의 "전체 가계부 백업"이 고른 한 달 치만 담던 것
//   E-7  관리자 JSON 복구가 같은 날 같은 거래 두 건 중 한 건을 영구히 빠뜨리던 것
//
// ── 실행 ──
//   node validation/validate-data-fixes-v22975.mjs
//   V22975_ONLY=D-9,A-10   그 절만 돌린다.
//   V22975_SOFT=1           실패해도 멈추지 않고 실패한 검사를 모두 적는다(옛 코드에서 무엇이 깨지는지 볼 때).
import assert from "node:assert/strict";
import { app, BASE, ctx, counter, fixture, page, post, api, skill, putSetting, settingValue, intercept } from "./lib-audit-v22934.mjs";

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

// ── 관리자 백업·복구 공용 도구 ──
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
// 운영 users.id 는 uuid 다. 복구 저장(cleanImportedRowsForInsert)은 uuid 가 아닌 지출자를 지우므로 픽스처 id 를 바꾼다.
async function adminFixture(fx) {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.cookie = await fx.cookieFor(BIN);
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  const login = await post(fx, "/login", { password: "admin-pass", return_to: "/ops-monitor" }, { cookie: "" });
  return (login.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
}
async function sendFile(fx, cookie, path, fields, fileField, json) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.set(key, value);
  form.set(fileField, new File([JSON.stringify(json)], "upload.json", { type: "application/json" }));
  const response = await app.fetch(new Request(`${BASE}${path}`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body: form }), fx.env, ctx);
  return { status: response.status, text: await response.text() };
}
const metrics = (html) => {
  const out = {};
  for (const m of String(html || "").matchAll(/<div class="metric"><span>([^<]+)<\/span><b>([^<]+)<\/b>/g)) if (!(m[1] in out)) out[m[1]] = m[2];
  return out;
};
const candidateRowsOf = (html) => JSON.parse(decode(String(html || "").match(/id="candidateJson" value="([^"]*)"/)?.[1] || "[]"));
const planOf = (rows) => ({ app: "kakao-accountbook", mode: "candidate_plan_only_no_db_write", selected_count: rows.length, selected: rows });
const applyFields = (month) => ({ household_id: HH, month, admin_password: "admin-pass", confirm_text: "가져오기 적용" });

// ── E-16 백업센터의 '전체' 백업이 정말 전체 기간을 담는다 ──
// "전체 가계부 백업" 단추는 모든 가계부의 '고른 한 달'만 내려받았다. 선택한 가계부의 전체 기간 백업 단추를 두고,
// 한 달만 담는 단추는 이름에 그 달을 적는다. 전체 기간 백업 파일로 복구 단계를 밟으면 고른 달만 비교한다.
await section("E-16", async () => {
  await fixture(async (fx) => {
    const admin = await adminFixture(fx);
    const base = fx.db.transactions.find((row) => row.household_id === HH);
    fx.db.transactions.push(
      { ...base, id: "e16-may", transaction_date: "2026-05-10", amount: 11000, memo: "5월 기록", created_at: "2026-05-10T01:00:00Z" },
      { ...base, id: "e16-sep", transaction_date: "2026-09-03", amount: 9000, memo: "9월 기록", created_at: "2026-09-03T01:00:00Z" },
      { ...base, id: "e16-trip", household_id: "house-trip", transaction_date: "2026-05-11", amount: 7000, memo: "다른 가계부", created_at: "2026-05-11T01:00:00Z" },
    );
    fx.db.accountbook_budgets.push({ id: "e16-budget-may", household_id: HH, month: "2026-05", category: "식비", amount: 300000, created_at: "2026-05-01T00:00:00Z" });
    const center = await page(fx, `/backup?household_id=${HH}&month=2026-07`, { cookie: admin });
    const links = [...center.html.matchAll(/<a class="btn[^"]*" href="([^"]+)">([^<]+)<\/a>/g)].map((m) => ({ href: decode(m[1]), label: m[2] }));
    const full = links.find((link) => link.href.startsWith("/admin/export/json") && link.href.includes("range=all"));
    ok(!!full && full.href.includes(`household_id=${HH}`), "백업센터에 선택한 가계부의 전체 기간 백업 단추가 있다");
    ok(!!full && full.label.includes("전체 기간"), `전체 기간 백업 단추 이름이 전체 기간이라고 말한다 (${full?.label})`);
    const monthLinks = links.filter((item) => item.href.startsWith("/admin/export/json") && !item.href.includes("range=all"));
    ok(monthLinks.length === 2 && monthLinks.every((link) => link.label.includes("2026-07")), `한 달만 담는 백업 단추는 이름에 그 달을 적는다 (${monthLinks.map((link) => link.label).join(" / ")})`);

    const log = [];
    const stop = intercept(({ url }) => { log.push(url.pathname); });
    let exported;
    try { exported = await page(fx, `/admin/export/json?household_id=${HH}&month=2026-07&range=all`, { cookie: admin }); } finally { stop(); }
    eq(exported.status, 200, "전체 기간 백업 파일이 만들어진다");
    let backup = {};
    try { backup = JSON.parse(exported.html); } catch (_) {}
    const homeRows = fx.db.transactions.filter((row) => row.household_id === HH);
    eq(backup.transactions?.length, homeRows.length, "전체 기간 백업은 선택한 가계부의 모든 달 거래를 담는다");
    ok(!!backup.transactions?.some((row) => row.id === "e16-may") && backup.transactions.some((row) => row.id === "e16-sep"), "5월·9월 거래도 들어 있다");
    ok(!backup.transactions?.some((row) => row.household_id !== HH), "다른 가계부 거래는 들어 있지 않다");
    eq(backup.scope?.range, "all", "백업 파일 범위가 전체 기간(range: all)으로 적힌다");
    ok(!!backup.budgets?.[HH]?.some((row) => row.month === "2026-05") && backup.budgets[HH].some((row) => row.month === "2026-07"), "예산도 모든 달이 들어 있다");
    const fullRequests = log.length;
    log.length = 0;
    const stopMonth = intercept(({ url }) => { log.push(url.pathname); });
    let monthOnly;
    try { monthOnly = JSON.parse((await page(fx, `/admin/export/json?household_id=${HH}&month=2026-07`, { cookie: admin })).html); } finally { stopMonth(); }
    // 요청 수: 관리자 세션 1 + 가계부 1 + 거래 쪽수(1,000건당 1) + 참여자·예산·정기·분류·적립 읽기. 거래가 한 쪽이면 한 달 백업과 같다.
    eq(fullRequests, log.length, `전체 기간 백업의 Supabase 요청 수가 한 달 백업과 같다(거래 한 쪽일 때, ${fullRequests}회)`);
    ok(monthOnly.transactions.length > 0 && monthOnly.transactions.every((row) => String(row.transaction_date).startsWith("2026-07")), "한 달 백업은 그 달 거래만 담는다(그대로)");

    // 한도를 넘으면 잘린 파일 대신 이유를 알린다. 거래 읽기에 끝없이 1,000건씩 돌려주는 가짜 응답을 끼운다.
    const stopBig = intercept(({ url, method }) => {
      if (method !== "GET" || !url.pathname.endsWith("/transactions")) return null;
      const limit = Number(url.searchParams.get("limit") || 1000);
      const offset = Number(url.searchParams.get("offset") || 0);
      return Response.json(Array.from({ length: limit }, (_, i) => ({ ...base, id: `big-${offset + i}` })));
    });
    let big;
    try { big = await page(fx, `/admin/export/json?household_id=${HH}&month=2026-07&range=all`, { cookie: admin }); } finally { stopBig(); }
    eq(big.status, 413, "거래가 한도를 넘으면 백업 파일을 자르지 않고 거절한다");
    ok(big.html.includes("backup_too_large"), "거절 이유가 너무 큰 백업(backup_too_large)으로 적힌다");

    // 전체 기간 백업 파일로 복구 단계를 밟으면 고른 달의 거래만 비교한다.
    const compared = await sendFile(fx, admin, "/backup/compare", { household_id: HH, month: "2026-05" }, "backup_file", backup);
    const cm = metrics(compared.text);
    eq(cm["백업 거래"], "1", "전체 기간 백업을 비교하면 고른 달(2026-05)의 거래만 센다");
    eq(cm["신규 후보"], "0", "고른 달의 거래가 이미 있으면 신규 후보가 없다");
    ok(compared.text.includes("전체 기간 백업(거래"), "비교 화면이 전체 기간 백업에서 한 달만 비교했다고 알린다");
    const selected = await sendFile(fx, admin, "/backup/select", { household_id: HH, month: "2026-09" }, "backup_file", backup);
    eq(candidateRowsOf(selected.text).length, 0, "후보 화면도 고른 달(2026-09)만 보고, 이미 있는 거래는 후보로 내지 않는다");
  });
});

// ── E-7 같은 날 같은 거래 두 건이 복구에서 두 건 다 돌아온다 ──
// 비교·최종 확인·적용이 '내용이 같은 기록이 하나라도 있으면 중복'으로 봐서 두 번째 건이 영구히 빠졌다.
// 이제 개수로 판단한다. 같은 계획을 다시 적용해도 늘지 않는다(멱등).
await section("E-7", async () => {
  await fixture(async (fx) => {
    const admin = await adminFixture(fx);
    const twin = { household_id: HH, user_id: WIFI, source: "kakao", type: "expense", amount: 4500, transaction_date: "2026-07-21", category: "카페/간식", memo: "스타벅스", payment_method: "신한카드", raw_text: "스타벅스 4500 신한카드", created_at: "2026-07-21T01:00:00Z" };
    fx.db.transactions.push({ ...twin, id: "twin-a" }, { ...twin, id: "twin-b" });
    const twins = () => fx.db.transactions.filter((row) => row.household_id === HH && row.amount === 4500 && row.transaction_date === "2026-07-21" && row.memo === "스타벅스").length;
    const backup = JSON.parse((await page(fx, `/admin/export/json?household_id=${HH}&month=2026-07`, { cookie: admin })).html);
    const total = backup.transactions.length;

    // 1) 가계부 기록이 모두 사라진 뒤 복구
    fx.db.transactions = fx.db.transactions.filter((row) => row.household_id !== HH);
    const candidates = candidateRowsOf((await sendFile(fx, admin, "/backup/select", { household_id: HH }, "backup_file", backup)).text);
    eq(candidates.length, total, "모두 지운 뒤에는 백업의 모든 거래가 신규 후보다");
    const final = await sendFile(fx, admin, "/backup/final-check", { household_id: HH, month: "2026-07", admin_password: "admin-pass" }, "plan_file", planOf(candidates));
    eq(metrics(final.text)["아직 신규"], String(total), "최종 확인에서도 모두 아직 신규다");
    const applied = await sendFile(fx, admin, "/backup/apply", applyFields("2026-07"), "plan_file", planOf(candidates));
    eq(metrics(applied.text)["성공"], String(total), `복구 적용이 ${total}건 모두 저장한다`);
    eq(twins(), 2, "같은 날 같은 거래 두 건이 두 건 모두 돌아온다");
    const again = await sendFile(fx, admin, "/backup/apply", applyFields("2026-07"), "plan_file", planOf(candidates));
    eq(metrics(again.text)["성공"], "0", "같은 계획을 다시 적용해도 더 저장하지 않는다");
    eq(twins(), 2, "다시 적용해도 두 건 그대로다");

    // 2) 두 건 중 한 건만 지워진 경우
    const victim = fx.db.transactions.find((row) => row.household_id === HH && row.amount === 4500 && row.memo === "스타벅스");
    fx.db.transactions = fx.db.transactions.filter((row) => row !== victim);
    const compared = await sendFile(fx, admin, "/backup/compare", { household_id: HH }, "backup_file", backup);
    eq(metrics(compared.text)["신규 후보"], "1", "두 건 중 한 건이 지워졌으면 비교 화면의 신규 후보가 1건이다");
    const partial = candidateRowsOf((await sendFile(fx, admin, "/backup/select", { household_id: HH }, "backup_file", backup)).text);
    eq(partial.length, 1, "후보 화면도 지워진 한 건만 후보로 낸다");
    await sendFile(fx, admin, "/backup/apply", applyFields("2026-07"), "plan_file", planOf(partial));
    eq(twins(), 2, "지워진 한 건을 복구하면 다시 두 건이다");
    await sendFile(fx, admin, "/backup/apply", applyFields("2026-07"), "plan_file", planOf(partial));
    eq(twins(), 2, "그 계획을 다시 적용해도 두 건 그대로다");
  });
});

if (failures.length) {
  console.error(`FAIL: ${failures.length} checks failed`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
t.done();
