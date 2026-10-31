// V22.9.76 — 2026-10-14 감사에서 아직 재현되던 데이터·분류·백업·운영 화면 결함의 동작 검사.
//
// ── 이 파일이 왜 생겼는지 ──
// 감사(docs/codex/AUDIT_FINDINGS_V22_9_44.md)가 찾은 결함 가운데 출시 직전까지 그대로 재현되던 것들을 고쳤다.
// 소스 문자열이 아니라 실제 요청(app.fetch)·카카오 발화·저장된 행으로 확인한다. 항목마다 한 절이다.
//   D-9  키워드 편집기에 저장한 카드(통신·교육/육아·용돈·부수입·급여…)가 자동 분류에 쓰이지 않던 것
//   A-10 낱말 속 글자가 분류를 정하던 것(커피+농협카드→장보기, 수술비→외식, 전기차 충전→공과금)
//   E-16 백업센터의 "전체 가계부 백업"이 고른 한 달 치만 담던 것
//   E-7  관리자 JSON 복구가 같은 날 같은 거래 두 건 중 한 건을 영구히 빠뜨리던 것
//   D-8  자산 잔액만 저장해도 꺼 둔 "총자산에 포함"이 다시 켜지던 것
//   F-9  가입 오류 뒤 폼이 빈 채로 다시 그려지던 것(비밀번호는 다시 쓰지 않는다)
//   D-27 운영 화면 역할 선택의 admin 누락, 역할 조회 실패를 "권한 없음"으로 답하던 것, 이름 바꾸기 500
//   G-2  단톡방 2개 이상에 연결된 가계부를 지우면 호출 한도를 넘어 잠금·연결 행이 남던 것
//   C-2  복귀 경로를 정규화 전 문자열로만 봐서 /.//x 가 //x(다른 사이트)로 나가던 것
//   E-17 옛 관리자 가져오기 화면이 CSV를 UTF-8로만 읽어 CP949 파일의 한글이 깨지던 것
//   D-20 정산에서 조회 전용이 1/N 부담자가 되고 나간 사람이 모두 '이전 구성원'으로 같아지던 것
//
// ── 실행 ──
//   node validation/validate-data-fixes-v22976.mjs
//   V22975_ONLY=D-9,A-10   그 절만 돌린다.
//   V22975_SOFT=1           실패해도 멈추지 않고 실패한 검사를 모두 적는다(옛 코드에서 무엇이 깨지는지 볼 때).
import assert from "node:assert/strict";
import vm from "node:vm";
import { app, BASE, ctx, counter, failure, fixture, page, post, api, skill, putSetting, settingValue, intercept, withClock, formFields } from "./lib-audit-v22934.mjs";

const t = counter("PASS: V22.9.76 data fixes");
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
      ["아이패드 50만원", "쇼핑"], // V22.9.93 Q-3: 낱말로 쇼핑에 들어갔다(‘아이’가 육아로 읽히지 않는 것이 이 줄의 뜻).
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
  return adminLogin(fx);
}
// /login 은 클라이언트(주소+브라우저)마다 1분에 8번까지만 받는다(메모리, 같은 프로세스의 모든 픽스처가 나눠 쓴다).
// 여러 절이 관리자 로그인을 하므로 요청마다 다른 문서용 주소(198.51.100.x)를 써서 서로의 한도를 먹지 않게 한다.
let adminLoginSeq = 0;
async function adminLoginRequest(fx, returnTo = "/ops-monitor") {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  adminLoginSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${(adminLoginSeq % 250) + 1}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: returnTo }).toString(),
  }), fx.env, ctx);
  return { status: response.status, location: response.headers.get("location") || "", setCookie: response.headers.get("set-cookie") || "", text: await response.text() };
}
async function adminLogin(fx) {
  const login = await adminLoginRequest(fx);
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

// ── D-8 잔액만 저장해도 '총자산에 포함' 해제가 풀리지 않는다 ──
// 잔액 저장 폼(mode=balance)은 include_in_asset 칸을 보내지 않는데, 저장이 '없음'을 '포함'으로 읽어
// 사용자가 뺀 전세보증금 같은 자산이 잔액을 고칠 때마다 순자산에 다시 들어갔다.
await section("D-8", async () => {
  await fixture(async (fx) => {
    const assetsOf = () => JSON.parse(settingValue(fx, `payment_assets:${HH}`) || "[]");
    const netWorth = (html) => (String(html || "").replace(/<style[\s\S]*?<\/style>|<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").match(/순자산[^원]{0,40}원/) || [""])[0];
    putSetting(fx, `payment_assets:${HH}`, JSON.stringify([
      { id: "asset-1", name: "국민카드", kind: "credit_card", balance: 0 },
      { id: "asset-2", name: "급여통장", kind: "bank_account", balance: 5200000, include_in_asset: true },
      { id: "asset-dep", name: "전세보증금", kind: "real_estate", balance: 300000000, include_in_asset: false },
    ]));
    const before = await page(fx, `/payment-methods?month=2026-10&household_id=${HH}`);
    const quick = before.html.match(/<form class="quickBal"[^>]*>(?:(?!<\/form>)[\s\S])*?name="id" value="asset-dep"[\s\S]*?<\/form>/)?.[0] || "";
    ok(!!quick, "자산 화면에 전세보증금의 잔액 저장 폼이 있다");
    const fields = new URLSearchParams();
    for (const m of quick.matchAll(/<input\b([^>]*)>/g)) {
      const name = (m[1].match(/\bname="([^"]+)"/) || [])[1];
      if (name) fields.append(name, decode((m[1].match(/\bvalue="([^"]*)"/) || [, ""])[1]));
    }
    eq(fields.get("mode"), "balance", "잔액 저장 폼은 mode=balance 로 보낸다");
    ok(!fields.has("include_in_asset"), "잔액 저장 폼에는 총자산 포함 칸이 없다");
    fields.set("balance", "310000000");
    const saved = await post(fx, "/admin/payment-asset/update", fields);
    ok(saved.decoded.includes("payment_asset_balance_updated"), `잔액 저장이 성공한다 (${saved.decoded.replace(/^.*\?/, "")})`);
    const dep = assetsOf().find((asset) => asset.id === "asset-dep");
    eq(dep?.balance, 310000000, "새 잔액이 저장된다");
    eq(dep?.include_in_asset, false, "잔액만 저장해도 '총자산에 포함' 해제가 그대로다");
    const after = await page(fx, `/payment-methods?month=2026-10&household_id=${HH}`);
    eq(netWorth(after.html), netWorth(before.html), "순자산 숫자가 잔액 저장 전과 같다(전세보증금이 다시 들어가지 않는다)");

    // 상세 수정 폼은 체크 칸 그대로 켜고 끈다(고치기 전과 같음).
    const edit = (include) => post(fx, "/admin/payment-asset/update", { household_id: HH, month: "2026-10", id: "asset-dep", mode: "edit", name: "전세보증금", kind: "real_estate", issuer: "", memo: "", balance: "310000000", ...(include ? { include_in_asset: "on" } : {}) });
    await edit(true);
    eq(assetsOf().find((asset) => asset.id === "asset-dep")?.include_in_asset, true, "상세 수정에서 체크하면 총자산에 포함된다");
    await edit(false);
    eq(assetsOf().find((asset) => asset.id === "asset-dep")?.include_in_asset, false, "상세 수정에서 체크를 풀면 총자산에서 빠진다");
  });
});

// ── F-9 가입 오류 뒤에도 적은 내용(비밀번호 빼고)이 남는다 ──
// 가입 폼은 오류가 나면 빈 폼으로 다시 그려져 로그인 이름·표시 이름·초대 코드를 처음부터 다시 적어야 했다.
// 비밀이 아닌 세 칸만 HTML 이스케이프해서 다시 채우고, 비밀번호 두 칸은 절대 다시 쓰지 않는다.
await section("F-9", async () => {
  await fixture(async (fx) => {
    const inputValue = (html, id) => {
      const tag = String(html || "").match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`))?.[0] || "";
      return tag ? decode((tag.match(/\bvalue="([^"]*)"/) || [, ""])[1]) : null;
    };
    const signup = (values) => post(fx, "/my/local-signup", values, { cookie: "" });
    const typed = { login_name: "새가족\"<b>", display_name: "엄마 & 아빠", invite_code: "ab12cd", access_code: "secret-pass-1", access_code_confirm: "secret-pass-2" };
    const mismatch = await signup(typed);
    eq(mismatch.status, 400, "비밀번호 확인이 다르면 가입 폼을 오류와 함께 다시 그린다");
    eq(inputValue(mismatch.text, "signupName"), typed.login_name, "로그인 이름 칸에 적은 값이 남는다");
    eq(inputValue(mismatch.text, "signupDisplay"), typed.display_name, "표시 이름 칸에 적은 값이 남는다");
    eq(inputValue(mismatch.text, "signupInvite"), "AB12CD", "초대 코드 칸에 적은 값이 남는다(대문자로)");
    ok(!mismatch.text.includes("secret-pass-1") && !mismatch.text.includes("secret-pass-2"), "비밀번호는 다시 그린 화면 어디에도 나오지 않는다");
    ok(!mismatch.text.includes("<b>\" ") && !mismatch.text.includes("새가족\"<b>"), "적은 값은 이스케이프돼서 태그나 속성을 깨지 않는다");
    const short = await signup({ ...typed, access_code: "short", access_code_confirm: "short" });
    eq(inputValue(short.text, "signupDisplay"), typed.display_name, "비밀번호가 짧다는 오류 뒤에도 표시 이름이 남는다");
    // 다른 사람이 쓰는 로그인 이름이면(가입 자체가 거절) 역시 적은 값이 남는다.
    const first = await signup({ login_name: "taken-name", display_name: "첫사람", access_code: "first-pass-123", access_code_confirm: "first-pass-123" });
    ok(first.status === 302 || first.status === 303, `첫 가입은 된다 (${first.status})`);
    const taken = await signup({ login_name: "taken-name", display_name: "둘째", invite_code: "", access_code: "second-pass-123", access_code_confirm: "second-pass-123" });
    ok(taken.status >= 400, `같은 로그인 이름 가입은 거절된다 (${taken.status})`);
    eq(inputValue(taken.text, "signupDisplay"), "둘째", "로그인 이름이 이미 쓰인다는 오류 뒤에도 표시 이름이 남는다");
    ok(!taken.text.includes("second-pass-123"), "그 화면에도 비밀번호는 나오지 않는다");
    const plain = await page(fx, "/my", { cookie: "" });
    eq(inputValue(plain.html, "signupName"), "", "처음 여는 가입 폼은 비어 있다");
  });
});

// ── D-27 운영·참여자 화면의 역할과 오류 안내 ──
// (1) 운영 화면 역할 선택에 admin 이 없어 관리자 행에서 '권한저장'을 누르면 승인 대기로 강등됐다.
// (2) 역할 조회가 503 이면 "권한이 없습니다"·"참여자가 아닙니다"로 답했다. (3) 참여자 이름 바꾸기·운영 화면 가계부
// 이름 바꾸기가 실패하면 500 안전모드 화면이 됐다. 참여자 화면은 코드만 안내로 바꾸므로 오류는 코드로 보낸다.
await section("D-27", async () => {
  const errorBox = async (fx, location, cookie) => {
    const shown = await page(fx, location.replace(/^https?:\/\/[^/]+/, ""), cookie ? { cookie } : {});
    return decode((shown.html.match(/<div class="error">([^<]*)<\/div>/) || [, "(오류 안내 없음)"])[1]);
  };
  const failMemberLookupOnce = () => {
    let fired = false;
    return intercept(({ url, method }) => {
      if (!fired && method === "GET" && url.pathname.endsWith("/household_members") && url.searchParams.get("user_id")) { fired = true; return failure(503); }
      return undefined;
    });
  };
  await withClock("2026-07-15", () => fixture(async (fx) => {
    // (1) 운영 화면에서 관리자(admin) 참여자 행을 그대로 저장
    fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "admin";
    const admin = await adminLogin(fx);
    const ops = await page(fx, `/households?household_id=${HH}`, { cookie: admin });
    const forms = [...ops.html.matchAll(/<form method="post" action="\/admin\/member\/update"[\s\S]*?<\/form>/g)].map((m) => m[0]);
    const wifiForm = forms.find((form) => form.includes('name="user_id" value="user-wifi"')) || "";
    const selected = (wifiForm.match(/<option value="([^"]*)"[^>]*selected/) || wifiForm.match(/<option value="([^"]*)"/) || [, ""])[1];
    eq(selected, "admin", "운영 화면 역할 선택이 관리자(admin) 참여자를 관리자로 보여 준다");
    ok(/<option value="owner"[^>]*>소유자<\/option>/.test(wifiForm), "소유자(owner) 선택지는 '소유자'라고 적힌다");
    await post(fx, "/admin/member/update", { household_id: HH, user_id: "user-wifi", role: selected }, { cookie: admin });
    eq(fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role, "admin", "그대로 '권한저장'을 눌러도 관리자 역할이 유지된다");
    fx.db.household_members.find((m) => m.household_id === HH && m.user_id === "user-wifi").role = "member";

    // (2) 역할 조회 실패는 '권한 없음'이 아니다
    let restore = failMemberLookupOnce();
    const rename = await post(fx, "/my/household/update", { household_id: HH, month: "2026-07", household_name: "새 이름" });
    restore();
    ok(rename.decoded.includes("err=household_role_check_failed"), `역할 조회가 실패하면 가계부 이름 변경이 '권한 확인 실패'로 끝난다 (${rename.decoded.replace(/^.*\?/, "")})`);
    ok((await errorBox(fx, rename.location)).includes("권한을 확인하지 못해"), "화면이 권한을 확인하지 못했다고 안내한다");
    eq(fx.db.households.find((h) => h.id === HH)?.name, "우리집 생활비", "가계부 이름은 바뀌지 않는다");
    const wifi = await fx.cookieFor("user-wifi");
    restore = failMemberLookupOnce();
    const leave = await post(fx, "/my/household/leave", { household_id: HH, month: "2026-07", understand_history: "1" }, { cookie: wifi });
    restore();
    ok(leave.decoded.includes("err=household_role_check_failed"), `역할 조회가 실패하면 나가기가 '참여자가 아님'이 아니라 '권한 확인 실패'로 끝난다 (${leave.decoded.replace(/^.*\?/, "")})`);
    ok(fx.db.household_members.some((m) => m.household_id === HH && m.user_id === "user-wifi"), "참여 상태는 그대로다");
    const notOwner = await post(fx, "/my/household/update", { household_id: HH, month: "2026-07", household_name: "남의 이름" }, { cookie: wifi });
    ok(notOwner.decoded.includes("err=household_manage_not_allowed"), "조회가 되면 구성원의 이름 변경은 예전처럼 '권한 없음'이다");

    // (3) 참여자 이름 바꾸기가 500 이 되지 않는다
    const members = `/my/members?household_id=${HH}`;
    fx.db.__fail_settings_read_key = `member_aliases:${HH}`;
    const aliasFail = await post(fx, "/admin/member/nickname", { household_id: HH, user_id: "user-wifi", nickname: "와이파이", return_to: members });
    delete fx.db.__fail_settings_read_key;
    eq(aliasFail.status, 303, "설정 읽기가 실패해도 이름 바꾸기는 500 이 아니라 참여자 화면으로 돌아간다");
    ok(aliasFail.decoded.includes("err=member_alias_save_failed"), "이름을 저장하지 못했다는 코드로 돌아간다");
    ok((await errorBox(fx, aliasFail.location)).includes("참여자 이름을 저장하지 못했습니다"), "참여자 화면이 이름 저장 실패를 안내한다");
    fx.db.household_members = fx.db.household_members.filter((m) => !(m.household_id === HH && m.user_id === "user-wifi"));
    const gone = await post(fx, "/admin/member/nickname", { household_id: HH, user_id: "user-wifi", nickname: "와이파이", return_to: members });
    eq(gone.status, 303, "이미 나간 참여자의 이름 바꾸기도 500 이 아니다");
    ok(gone.decoded.includes("err=member_missing"), "참여자를 찾지 못했다는 코드로 돌아간다");
    ok((await errorBox(fx, gone.location)).includes("참여자를 찾지 못했습니다"), "참여자 화면이 대상을 찾지 못했다고 안내한다");

    // 운영 화면의 가계부 이름 저장 실패(거절이 확실한 400; 응답을 잃은 5xx 는 "결과 확인 필요"로 안내한다)
    restore = intercept(({ url, method }) => method === "PATCH" && url.pathname.endsWith("/households") ? failure(400, "rejected") : undefined);
    const opsRename = await post(fx, "/admin/household/update", { id: HH, name: "운영 이름" }, { cookie: admin });
    restore();
    eq(opsRename.status, 303, "운영 화면 가계부 이름 저장이 실패해도 500 이 아니다");
    ok((await errorBox(fx, opsRename.location, admin)).includes("가계부 이름을 저장하지 못했습니다"), "운영 화면이 이름 저장 실패를 안내한다");
  }));

  // 참여자 화면에서 역할 저장이 DB 규칙에 거절되면 그 이유가 보인다(예전에는 일반 안내로 덮였다).
  await withClock("2026-07-15", () => fixture(async (fx) => {
    fx.db.users.push({ id: "user-c", kakao_user_key: "kakao_login:2267", nickname: "C", created_at: "2026-07-01T00:00:00.000Z" });
    fx.db.household_members.push({ household_id: HH, user_id: "user-c", role: "member", created_at: "2026-07-03T00:00:00.000Z" });
    const restore = intercept(({ url, method }) => method === "PATCH" && url.pathname.endsWith("/household_members") ? failure(400, "new row violates check constraint household_members_role_check 23514") : undefined);
    const rejected = await post(fx, "/admin/member/update", { household_id: HH, user_id: "user-c", role: "admin", return_to: `/my/members?household_id=${HH}&month=2026-07` });
    restore();
    ok((await errorBox(fx, rejected.location)).includes("데이터베이스 역할 규칙"), "참여자 화면이 DB 역할 규칙 때문에 저장하지 못했다고 안내한다");
    eq(fx.db.household_members.find((m) => m.user_id === "user-c")?.role, "member", "기존 역할은 그대로다");
  }));
});

// ── G-2 단톡방 여러 개에 연결된 가계부 삭제 ──
// 방마다 잠금을 다시 잡고 표식·연결 행·옛 연결표를 하나씩 고치느라 방 2개부터 저장소 호출이 한 요청 한도(50회)를 넘었다.
// 그러면 잠금 해제와 연결 정리가 빠진 채 "삭제됨"으로 끝나, 그 방은 잠금이 풀릴 때까지 쓸 수 없고 삭제된 가계부를 가리키는
// 연결 행이 남았다. 이제 방 6개까지는 한도 안에서 끝나고, 그보다 많으면 아무것도 지우지 않고 이유를 알린다.
const jsonResponse = (value) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });
const cookiePairs = (headers) => headers.getSetCookie().map((value) => value.split(";")[0]);
async function householdDeleteReauthCookie(fx) {
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", KAKAO_REDIRECT_URI: "https://malhaebook.com/auth/kakao/callback" });
  const stop = intercept(({ url }) => {
    if (url.hostname === "kauth.kakao.com") return jsonResponse({ access_token: "synthetic-token", token_type: "bearer" });
    if (url.hostname === "kapi.kakao.com") return jsonResponse({ id: 2265, properties: { nickname: "Bin" } });
    return undefined;
  });
  try {
    const returnTo = `/my/households?month=2026-07&household_id=${HH}&manage=${HH}#manage`;
    const start = await app.fetch(new Request(`${BASE}/auth/kakao/start?reauth=household-delete&household_id=${HH}&return_to=${encodeURIComponent(returnTo)}`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
    const state = new URL(start.headers.get("location")).searchParams.get("state");
    const callback = await app.fetch(new Request(`${BASE}/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { headers: { cookie: [fx.cookie, ...cookiePairs(start.headers)].join("; ") } }), fx.env, ctx);
    return cookiePairs(callback.headers).find((value) => value.startsWith("ab_household_delete_reauth=")) || "";
  } finally { stop(); }
}
const activeLocks = (fx) => fx.db.accountbook_operation_locks.filter((row) => Date.parse(row.locked_until) > Date.now()).map((row) => row.operation_key);
const linkRowsFor = (fx, householdId) => fx.db.accountbook_settings
  .filter((row) => (row.key.startsWith("kakao_group_link_v2254:") || row.key === "kakao_group_links") && String(row.value || "").includes(householdId))
  .map((row) => row.key);
const homeExists = (fx) => fx.db.households.some((row) => row.id === HH);
async function linkRooms(fx, prefix, count) {
  const rooms = [];
  for (let index = 0; index < count; index += 1) {
    const room = `${prefix}-${index}`;
    if (/연결 완료/.test(await skill(fx, "@말해가계부 방 연결 HOME2265", { groupKey: room }))) rooms.push(room);
  }
  return rooms;
}
async function deleteHome(fx, { inject } = {}) {
  const reauth = await householdDeleteReauthCookie(fx);
  let requests = 0;
  const stop = intercept((request) => { requests += 1; return inject ? inject(request) : undefined; });
  try {
    const response = await post(fx, "/my/household/delete", { household_id: HH, month: "2026-07", confirm_name: "우리집 생활비", understand_members: "1" }, { cookie: [fx.cookie, reauth].join("; ") });
    return { ...response, requests };
  } finally { stop(); }
}

await section("G-2", async () => {
  for (const count of [0, 2, 5]) {
    await fixture(async (fx) => withClock("2026-07-15", async () => {
      const rooms = await linkRooms(fx, `g2-room-${count}`, count);
      eq(rooms.length, count, `G-2 방 ${count}개를 이 가계부에 연결했다`);
      const del = await deleteHome(fx);
      ok(del.decoded.includes("msg=household_deleted"), `G-2 방 ${count}개: 삭제가 끝났다고 답한다 (${del.decoded.slice(0, 90)})`);
      ok(!homeExists(fx), `G-2 방 ${count}개: 가계부가 지워졌다`);
      ok(del.requests <= 46, `G-2 방 ${count}개: 저장소 호출이 한 요청 한도(50회) 안에서 여유 있게 끝난다 (${del.requests}회)`);
      eq(activeLocks(fx).join(","), "", `G-2 방 ${count}개: 삭제 뒤 풀리지 않은 잠금이 없다`);
      eq(linkRowsFor(fx, HH).join(","), "", `G-2 방 ${count}개: 삭제된 가계부를 가리키는 방 연결 행(옛 연결표 포함)이 남지 않는다`);
      for (const room of rooms) {
        const before = fx.db.transactions.length;
        const reply = await skill(fx, "@말해가계부 택시 7100", { groupKey: room });
        ok(!/처리 중|잠시 후/.test(reply), `G-2 방 ${count}개: 삭제 뒤 그 방이 "처리 중"이라 답하지 않는다 (${reply.slice(0, 70)})`);
        eq(fx.db.transactions.length, before, `G-2 방 ${count}개: 삭제 뒤 그 방 기록은 어디에도 저장되지 않는다`);
      }
    }), { categoriesPresent: false });
  }

  // 한도 안에 끝낼 수 없으면 잠금을 잡기 전에 거절한다. 가계부·기록·연결은 그대로이고 방도 바로 쓸 수 있다.
  await fixture(async (fx) => withClock("2026-07-15", async () => {
    const rooms = await linkRooms(fx, "g2-many", 7);
    eq(rooms.length, 7, "G-2 방 7개를 연결했다");
    const txBefore = fx.db.transactions.filter((row) => row.household_id === HH).length;
    const linksBefore = linkRowsFor(fx, HH).length;
    const del = await deleteHome(fx);
    ok(del.decoded.includes("err=household_delete_too_large"), `G-2 방 7개: 한도 안에 끝낼 수 없으면 시작하지 않고 이유를 알린다 (${del.decoded.slice(0, 90)})`);
    ok(homeExists(fx), "G-2 방 7개: 가계부는 그대로다");
    eq(fx.db.transactions.filter((row) => row.household_id === HH).length, txBefore, "G-2 방 7개: 기록은 하나도 지워지지 않았다");
    eq(linkRowsFor(fx, HH).length, linksBefore, "G-2 방 7개: 방 연결도 그대로다");
    eq(activeLocks(fx).join(","), "", "G-2 방 7개: 거절한 뒤 잠금이 남지 않는다");
    ok(del.requests <= 15, `G-2 방 7개: 방 잠금을 하나도 잡기 전에 거절한다 (${del.requests}회)`);
    const shown = await page(fx, del.location.replace(BASE, ""));
    ok(decode(shown.html).includes("연결된 단톡방이나 정리할 항목이 많아 한 번에 삭제할 수 없습니다"), "G-2 방 7개: 가계부 화면이 거절 이유를 한국어로 보여 준다");
    const before = fx.db.transactions.length;
    const reply = await skill(fx, "@말해가계부 택시 7200", { groupKey: rooms[0] });
    ok(!/처리 중|잠시 후/.test(reply) && fx.db.transactions.length === before + 1, `G-2 방 7개: 거절 뒤에도 방은 바로 기록할 수 있다 (${reply.slice(0, 60)})`);
  }), { categoriesPresent: false });

  // 잠금 안의 방 연결 행 정리가 한 번 실패해도 잠금은 남지 않고, 남은 연결은 정리하거나 그 방의 다음 메시지가 지운다.
  await fixture(async (fx) => withClock("2026-07-15", async () => {
    const rooms = await linkRooms(fx, "g2-fail", 2);
    let fired = 0;
    const del = await deleteHome(fx, { inject: ({ url, method }) => {
      if (fired || method !== "DELETE" || !decodeURIComponent(url.search).includes("kakao_group_link_v2254:")) return undefined;
      fired += 1;
      return failure(503);
    } });
    eq(fired, 1, "G-2 방 연결 행 정리 실패를 한 번 흉내 냈다");
    ok(del.decoded.includes("msg=household_deleted"), `G-2 연결 정리 실패: 이미 끝난 삭제는 삭제됨으로 답한다 (${del.decoded.slice(0, 90)})`);
    ok(del.requests <= 50, `G-2 연결 정리 실패: 다시 정리하더라도 한도(50회)를 넘지 않는다 (${del.requests}회)`);
    eq(activeLocks(fx).join(","), "", "G-2 연결 정리 실패: 잠금이 남지 않는다");
    for (const room of rooms) {
      const reply = await skill(fx, "@말해가계부 택시 7300", { groupKey: room });
      ok(!/처리 중|잠시 후/.test(reply), `G-2 연결 정리 실패: 그 방이 "처리 중"이라 답하지 않는다 (${reply.slice(0, 60)})`);
    }
    eq(linkRowsFor(fx, HH).join(","), "", "G-2 연결 정리 실패: 남은 연결은 그 방의 다음 메시지까지 모두 정리된다");
  }), { categoriesPresent: false });

  // 관리자 화면 삭제가 실패하면 500 안전 화면 대신 가계부 관리 화면으로 돌아가 이유를 보여 준다.
  await fixture(async (fx) => withClock("2026-07-15", async () => {
    const admin = await adminFixture(fx);
    const restore = intercept(({ url }) => url.pathname.endsWith("/rpc/accountbook_purge_household_v22960") ? failure(400, "rejected") : undefined);
    const res = await post(fx, "/admin/household/delete", { id: HH, confirm_text: "삭제" }, { cookie: admin });
    restore();
    eq(res.status, 303, "G-2 관리자 삭제 실패: 오류 화면 대신 가계부 관리 화면으로 돌려보낸다");
    ok(res.decoded.includes("err=household_delete_failed"), `G-2 관리자 삭제 실패: 실패 코드를 넘긴다 (${res.decoded.slice(0, 90)})`);
    ok(homeExists(fx), "G-2 관리자 삭제 실패: 가계부는 그대로다");
    eq(activeLocks(fx).join(","), "", "G-2 관리자 삭제 실패: 잠금이 남지 않는다");
    const shown = await page(fx, res.location.replace(BASE, ""), { cookie: admin });
    ok(decode(shown.html).includes("가계부 삭제를 완료하지 못했습니다"), "G-2 관리자 삭제 실패: 관리 화면이 이유를 한국어로 보여 준다");
  }), { categoriesPresent: false });
});

// ── C-2 복귀 경로는 정규화한 뒤에 같은 사이트인지 본다 ──
// "/.//x" 는 "/" 로 시작하고 "//" 로 시작하지 않아 검사를 통과했지만, URL 로 정규화하면 "//x"(다른 사이트 주소)가 됐다.
// 관리자 로그인 뒤 복귀(safeAdminReturnPath)와 관리자 일괄 처리 뒤 복귀(returnLocation)로 그대로 나갈 수 있었다.
const sameOriginLocation = (location) => Boolean(location) && !location.startsWith("//") && new URL(location, BASE).origin === new URL(BASE).origin;
await section("C-2", async () => {
  const hostile = ["/.//evil.example/x", "/%2e//evil.example", "/\\evil.example", "/\t/evil.example"];
  await fixture(async (fx) => {
    for (const target of hostile) {
      const login = await adminLoginRequest(fx, target);
      ok(sameOriginLocation(login.location), `C-2 관리자 로그인 뒤 복귀 경로 ${JSON.stringify(target)} 는 다른 사이트로 나가지 않는다 (${login.location})`);
    }
    const normal = await adminLoginRequest(fx, "/ops-monitor");
    eq(normal.location, "/ops-monitor", `C-2 정상 복귀 경로는 그대로 돌아간다 (응답 ${normal.status} ${decode(normal.text).replace(/<[^>]+>/g, " ").replace(/ +/g, " ").slice(0, 160)})`);
    const admin = (normal.setCookie.match(/ab_admin=[^;]+/) || [""])[0];
    for (const target of hostile) {
      const bulk = await post(fx, "/admin/bulk", { month: "2026-07", household_id: HH, return_to: target }, { cookie: admin });
      ok(sameOriginLocation(bulk.location), `C-2 관리자 일괄 처리 뒤 복귀 경로 ${JSON.stringify(target)} 는 다른 사이트로 나가지 않는다 (${bulk.location})`);
    }
    const kept = await post(fx, "/admin/bulk", { month: "2026-07", household_id: HH, return_to: "/?legacy=1&month=2026-07" }, { cookie: admin });
    ok(kept.location.startsWith("/?legacy=1&month=2026-07") && kept.decoded.replace(/[+]/g, " ").includes("선택된 거래가 없습니다"), `C-2 정상 복귀 경로와 안내는 그대로다 (${kept.decoded})`);
  });
});

// ── E-17 옛 관리자 가져오기 화면이 CP949 CSV를 깨뜨리지 않는다 ──
// 이 화면의 스크립트는 CSV·TXT 파일을 FileReader.readAsText(file, "utf-8") 로만 읽어, 한글 윈도우·엑셀이 저장한
// CP949 파일의 한글이 "�"로 깨진 채 미리보기와 업로드 칸에 들어갔다. 화면이 실제로 내려보내는 스크립트를 가짜 DOM에서
// 돌려 파일 선택을 흉내 낸다(브라우저처럼 readAsText 는 지정한 인코딩으로, readAsArrayBuffer 는 바이트 그대로 준다).
async function legacyImportScripts(fx) {
  const admin = await adminLogin(fx);
  const html = (await page(fx, `/?legacy=1&tab=import&household_id=${HH}&month=2026-07`, { cookie: admin })).html;
  return [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map((match) => match[1]).filter((code) => code.includes("importFile"));
}
function pickImportFile(scripts, file) {
  const elements = new Map();
  const element = (id) => {
    if (!elements.has(id)) {
      elements.set(id, {
        id, value: "", innerHTML: "", textContent: "", className: "", style: {}, dataset: {}, listeners: {},
        addEventListener(type, handler) { this.listeners[type] = handler; },
        classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
        setAttribute() {}, removeAttribute() {}, querySelector: () => null, querySelectorAll: () => [],
      });
    }
    return elements.get(id);
  };
  class BrowserLikeFileReader {
    readAsArrayBuffer(blob) { const bytes = blob.bytes; this.onload({ target: { result: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) } }); }
    readAsText(blob, encoding) { this.onload({ target: { result: new TextDecoder(encoding || "utf-8").decode(blob.bytes) } }); }
  }
  const sandbox = {
    document: { getElementById: (id) => element(id), querySelector: () => null, querySelectorAll: () => [], addEventListener() {} },
    FileReader: BrowserLikeFileReader, TextDecoder, Uint8Array, console, setTimeout, clearTimeout,
    location: { href: `${BASE}/?legacy=1&tab=import` }, alert() {}, confirm: () => false,
    fetch: async () => { throw new Error("이 검사는 네트워크를 쓰지 않는다"); },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  for (const code of scripts) vm.runInContext(code, sandbox);
  element("importFile").listeners.change({ target: { files: [file] } });
  return { text: String(element("importText").value || ""), status: String(element("importStatus").textContent || "") };
}
const concatBytes = (...parts) => {
  const arrays = parts.map((part) => (typeof part === "string" ? new TextEncoder().encode(part) : Uint8Array.from(part)));
  const out = new Uint8Array(arrays.reduce((sum, array) => sum + array.length, 0));
  let offset = 0;
  for (const array of arrays) { out.set(array, offset); offset += array.length; }
  return out;
};

await section("E-17", async () => {
  await fixture(async (fx) => {
    const scripts = await legacyImportScripts(fx);
    ok(scripts.length > 0, "E-17 옛 관리자 가져오기 화면이 파일 선택 스크립트를 내려보낸다");
    // CP949: 날짜(B3AF C2A5) 내용(B3BB BFEB) 금액(B1DD BED7) 커피(C4BF C7C7)
    const cp949 = concatBytes([0xb3, 0xaf, 0xc2, 0xa5], ",", [0xb3, 0xbb, 0xbf, 0xeb], ",", [0xb1, 0xdd, 0xbe, 0xd7], "\n2026-07-01,", [0xc4, 0xbf, 0xc7, 0xc7], ",4500\n");
    eq(new TextDecoder("euc-kr").decode(cp949), "날짜,내용,금액\n2026-07-01,커피,4500\n", "E-17 검사용 CP949 바이트가 맞다");
    const korean = pickImportFile(scripts, { name: "카드내역.csv", bytes: cp949 });
    ok(korean.text.includes("날짜,내용,금액") && korean.text.includes("커피,4500") && !korean.text.includes("�"), `E-17 CP949 CSV의 한글이 깨지지 않는다 (${JSON.stringify(korean.text.slice(0, 40))})`);
    ok(korean.status.includes("CP949") && korean.status.includes("미리보기 2행"), `E-17 CP949로 읽었다고 미리보기 행 수와 함께 알려 준다 (${korean.status})`);
    const utf8 = pickImportFile(scripts, { name: "export.csv", bytes: new TextEncoder().encode("﻿날짜,내용,금액\n2026-07-02,택시,7100\n") });
    ok(utf8.text.startsWith("날짜,내용,금액") && utf8.text.includes("택시,7100"), `E-17 UTF-8(BOM) 파일은 그대로 읽고 BOM은 빠진다 (${JSON.stringify(utf8.text.slice(0, 20))})`);
    ok(!/CP949|UTF-16/.test(utf8.status), `E-17 UTF-8 파일에는 인코딩 안내를 붙이지 않는다 (${utf8.status})`);
    const utf16Text = "날짜,내용,금액\n2026-07-03,점심,12000\n";
    const utf16 = concatBytes([0xff, 0xfe], [...utf16Text].flatMap((ch) => [ch.charCodeAt(0) & 0xff, ch.charCodeAt(0) >> 8]));
    const unicode = pickImportFile(scripts, { name: "unicode.txt", bytes: utf16 });
    ok(unicode.text.includes("점심,12000") && !unicode.text.includes("�"), `E-17 엑셀 유니코드 텍스트(UTF-16)도 읽는다 (${JSON.stringify(unicode.text.slice(0, 20))})`);
  });
});

// ── D-20 정산 참여자: 조회 전용은 돈이 오갔을 때만, 나간 사람은 서로 구분해서 ──
// 조회 전용(viewer)은 기록할 수 없는데도 1/N 부담자로 들어가 늘 "보낼 금액"이 생겼고, 나간 사람은 모두 "이전 구성원"으로
// 같아져 정산 표와 송금 제안에서 누가 누구인지 알 수 없었다(완료 이력에도 그 이름으로 저장됐다).
const plainText = (html) => decode(String(html).replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
const settlementPart = (html) => { const text = plainText(html); return text.slice(text.indexOf("참여자별 정산"), text.indexOf("받을 금액과 보낼 금액을")); };
function addMember(fx, householdId, id, nickname, role, key) {
  fx.db.users.push({ id, kakao_user_key: key, nickname, created_at: "2026-07-01T00:00:00.000Z" });
  fx.db.household_members.push({ household_id: householdId, user_id: id, role, created_at: "2026-07-02T00:00:00.000Z" });
}

await section("D-20", async () => {
  await withClock("2026-07-15", () => fixture(async (fx) => {
    addMember(fx, HH, "user-viewer", "구경꾼", "viewer", "kakao_login:3201");
    const q = `/settlement-summary?month=2026-07&household_id=${HH}`;
    const plain = settlementPart((await page(fx, q)).html);
    ok(!plain.includes("구경꾼"), `D-20 지출이 없는 조회 전용 참여자는 정산에 들어가지 않는다 (${plain.slice(0, 160)})`);
    ok((plain.match(/124,300원/g) || []).length === 2, `D-20 두 사람이 248,600원을 반씩 부담한다 (${plain.slice(0, 160)})`);
    const ratio = (await page(fx, `${q}&mode=ratio`)).html;
    ok(!ratio.includes('name="weight_user-viewer"'), "D-20 비율 분배 입력에도 지출이 없는 조회 전용은 나오지 않는다");
    fx.db.transactions.push({ id: "t-viewer", household_id: HH, user_id: "user-viewer", transaction_date: "2026-07-10", type: "expense", amount: 30000, category: "식비", memo: "장보기 대신 결제", payment_method: "카드", source: "web", raw_text: "v" });
    const paid = settlementPart((await page(fx, q)).html);
    ok(paid.includes("구경꾼 30,000원"), `D-20 조회 전용이라도 이 달에 지출을 냈으면 정산에 들어간다 (${paid.slice(0, 200)})`);
    ok((await page(fx, `${q}&mode=ratio`)).html.includes('name="weight_user-viewer"'), "D-20 지출을 낸 조회 전용은 비율 분배 입력에도 나온다");
  }));

  await withClock("2026-07-15", () => fixture(async (fx) => {
    addMember(fx, "house-trip", "user-ms", "민수", "member", "kakao_login:3101");
    addMember(fx, "house-trip", "user-jy", "지영", "member", "kakao_login:3102");
    fx.db.transactions.push(
      { id: "t-ms", household_id: "house-trip", user_id: "user-ms", transaction_date: "2026-07-12", type: "expense", amount: 90000, category: "여행", memo: "렌터카", payment_method: "카드", source: "web", raw_text: "x" },
      { id: "t-jy", household_id: "house-trip", user_id: "user-jy", transaction_date: "2026-07-13", type: "expense", amount: 30000, category: "여행", memo: "간식", payment_method: "카드", source: "web", raw_text: "y" },
    );
    for (const uid of ["user-ms", "user-jy"]) {
      await post(fx, "/my/household/leave", { household_id: "house-trip", month: "2026-07", understand_history: "1" }, { cookie: await fx.cookieFor(uid) });
    }
    eq(fx.db.household_members.filter((m) => m.household_id === "house-trip" && ["user-ms", "user-jy"].includes(m.user_id)).length, 0, "D-20 두 사람이 가계부에서 나갔다");
    const q = "/settlement-summary?month=2026-07&household_id=house-trip";
    const html = (await page(fx, q)).html;
    const named = settlementPart(html);
    ok(named.includes("민수(나간 구성원) 90,000원") && named.includes("지영(나간 구성원) 30,000원"), `D-20 나간 두 사람을 기록 당시 이름으로 구분해 보여 준다 (${named.slice(0, 220)})`);
    ok(named.includes("지영(나간 구성원) Bin") && named.includes("민수(나간 구성원) Bin"), `D-20 송금 제안도 누가 보내는지 구분된다 (${named.slice(-160)})`);
    const completion = formFields(html, "/my/settlement/save");
    ok(completion.found, "D-20 정산 완료 폼이 있다");
    completion.fields.set("confirmed", "yes");
    const saved = await post(fx, "/my/settlement/save", completion.fields);
    ok(saved.status === 303 && !saved.decoded.includes("err="), `D-20 정산 완료를 저장했다 (${saved.decoded.slice(0, 120)})`);
    const history = JSON.parse(settingValue(fx, "settlement_history:house-trip") || "[]");
    const names = (history.at(-1)?.shares || []).map((share) => share.name).sort();
    eq(names.join(","), "Bin,민수(나간 구성원),지영(나간 구성원)", "D-20 완료 이력에도 나간 사람을 구분된 이름으로 저장한다");

    // 사용자 이름을 알 수 없으면 번호로 구분한다.
    for (const user of fx.db.users) if (["user-ms", "user-jy"].includes(user.id)) user.nickname = "";
    const numbered = settlementPart((await page(fx, q)).html);
    ok(numbered.includes("이전 구성원 1") && numbered.includes("이전 구성원 2"), `D-20 이름을 모르는 나간 사람은 번호로 구분한다 (${numbered.slice(0, 220)})`);
  }));
});

if (failures.length) {
  console.error(`FAIL: ${failures.length} checks failed`);
  for (const message of failures) console.error(`  - ${message}`);
  process.exit(1);
}
t.done();
