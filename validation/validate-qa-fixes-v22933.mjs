// V22.9.33 — 외부 품질 점검 보고서(2026-10-09)의 결함 9건(B01~B09)과 감사에서 찾은 웹 수정 폼 결함(T1)을 고정한다.
//
// 모든 재현은 메모리 픽스처(validation/qa-fixture.mjs)로 하며 네트워크를 쓰지 않는다.
//   B01 목표 금액: "1e309" 같은 값이 Infinity → JSON null → 0원으로 바뀌던 것을 저장 전에 거부한다.
//   B02 즐겨찾기: 읽기 실패·깨진 JSON 을 빈 목록으로 보고 덮어쓰지 않는다(엄격한 읽기 + 가계부 설정 잠금).
//   B03 3개월 평균: 기록이 있는 달은 지출 0원이어도 분모에 넣는다([0,0,30000] → 10,000원).
//   B04 요일 날짜: 웹 빠른 입력이 "지난주 금요일"을 카카오와 같은 날로 읽고, 서버도 문장 속 날짜와 폼 날짜를 대조한다.
//   B05 조회 완전성: 한도를 넘는 기록을 조용히 잘라 합계·리포트·백업·검색을 만들지 않는다.
//   B06 수정 이력: 읽기 실패 뒤 기존 이력을 덮어쓰지 않고, 거래 수정 자체는 성공으로 남긴다.
//   B07 챌린지: "챌린지 표시"를 끈 챌린지는 홈에 그리지 않는다.
//   B08 접근성 이름: 화면 라벨이 연결된 칸에 다른 말의 aria-label 을 덧붙이지 않는다(WCAG 2.5.3).
//   B09 간격: 카카오 연결 버튼 아래 보안 안내가 버튼과 겹치지 않는다.
//   T1 웹 수정 폼: 권한 판정용 세 칸짜리 행이 아니라 전체 행으로 폼을 그린다(운영 PostgREST 는 select 한 칸만 준다).

import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import app, { explicitDateIntent, quickInputDate, resolveWeekdayPhrase } from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };

const BASE = "https://malhaebook.com";
const ctx = { waitUntil() {}, passThroughOnException() {} };
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const setting = (fx, key) => fx.db.accountbook_settings.find((row) => row.key === key)?.value;
const withClock = async (ymd, task) => {
  const previous = globalThis.__AB_QA_FIXED_NOW_MS;
  globalThis.__AB_QA_FIXED_NOW_MS = Date.parse(`${ymd}T12:00:00+09:00`);
  try { return await task(); } finally { globalThis.__AB_QA_FIXED_NOW_MS = previous; }
};
const fixture = async (task) => {
  const fx = await createV2265QaFixture();
  try { return await task(fx); } finally { fx.restore(); }
};
const api = async (fx, path, method = "GET", body) => {
  const response = await app.fetch(new Request(`${BASE}${path}`, { method, headers: { cookie: fx.cookie, "content-type": "application/json", accept: "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) }), fx.env, ctx);
  let data = null;
  try { data = await response.json(); } catch (_) {}
  return { status: response.status, data };
};
const page = async (fx, path, { cookie = fx.cookie, headers = {}, env = {} } = {}) => {
  const response = await app.fetch(new Request(`${BASE}${path}`, { headers: { ...(cookie ? { cookie } : {}), accept: "text/html", ...headers } }), { ...fx.env, ...env }, ctx);
  return { status: response.status, location: response.headers.get("location") || "", html: await response.text() };
};
const post = (fx, path, values, cookie = fx.cookie) => app.fetch(new Request(`${BASE}${path}`, {
  method: "POST",
  headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" },
  body: new URLSearchParams(values).toString(),
}), fx.env, ctx);
const skill = async (fx, utterance) => {
  const response = await app.fetch(new Request(`${BASE}/skill`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent: { id: "i1", name: "블록" },
      userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265" } } },
      bot: { id: "bot1", name: "말해가계부" },
      action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} },
      contexts: [],
    }),
  }), fx.env, ctx);
  const data = JSON.parse(await response.text());
  return String(data?.template?.outputs?.[0]?.simpleText?.text || "");
};
const bulkRows = (count, { householdId = "house-home", month = "2026-10", prefix = "bulk" } = {}) => Array.from({ length: count }, (_, index) => {
  const date = `${month}-${String(1 + (index % 28)).padStart(2, "0")}`;
  return { id: `${prefix}-${index}`, household_id: householdId, user_id: "user-bin", transaction_date: date, type: "expense", amount: 1000, category: "식비", memo: "대량", payment_method: "카드", created_at: `${date}T00:00:00Z` };
});

// ---------------------------------------------------------------------------
// B01 목표 금액
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  const created = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "create", name: "여행", target: "1000000", monthly: "100000" });
  eq(created.status, 200, "B01 정상 목표는 만들어진다");
  const id = created.data.goals[0].id;
  eq((await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "fund", id, amount: 12345 })).data.goals[0].saved, 12345, "B01 정상 납입은 더해진다");
  const stored = () => JSON.parse(setting(fx, "goals:v5:house-home"))[0].saved;
  const rejected = [];
  for (const bad of ["1e309", "Infinity", "NaN", "-5", "1.5", "99999999999999999999", "1e3", "0x10", null, 0, 2_000_000_001]) {
    const result = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "fund", id, amount: bad });
    if (result.status !== 400 || stored() !== 12345) rejected.push(JSON.stringify(bad));
  }
  eq(rejected.join(","), "", "B01 지수·무한·NaN·음수·소수·상한 초과 납입은 400 이고 모은 금액 12,345원이 그대로다");
  for (const [label, body] of [
    ["목표 금액 1e309", { action: "create", name: "x", target: "1e309" }],
    ["월 납입액 1e309", { action: "create", name: "x", target: "1000", monthly: "1e309" }],
    ["수정 목표 1e400", { action: "update", id, target: "1e400" }],
    ["복구 모은 금액 무한", { action: "restore", goal: { id: "g2", name: "y", target: 1000, saved: "1e309" } }],
  ]) eq((await api(fx, "/u/api/goals", "POST", { household: "house-home", ...body })).status, 400, `B01 ${label}은 거부한다`);
  const updated = await api(fx, "/u/api/goals", "POST", { household: "house-home", action: "update", id, target: "2,000,000원" });
  ok(updated.status === 200 && updated.data.goals[0].target === 2000000 && updated.data.goals[0].saved === 12345, "B01 쉼표·원 표기는 받아들이고 모은 금액을 지킨다");
});

// ---------------------------------------------------------------------------
// B02 즐겨찾기
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  const key = "favorites:v5:house-home:user-bin";
  const tx = (id, amount) => ({ id, type: "expense", amount, memo: "qa", category: "식비", payment_method: "카드", transaction_date: "2026-07-04", month: "2026-07" });
  fx.db.accountbook_settings.push({ id: "fav", key, value: JSON.stringify([tx("tx-expense-1", 148000), tx("tx-expense-2", 72000)]), created_at: "2026-07-01T00:00:00Z" });
  fx.db.__fail_settings_read_key = key;
  const add = await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "tx-expense-3", tx: tx("tx-expense-3", 28600) });
  ok(add.status === 503 && JSON.parse(setting(fx, key)).length === 2, "B02 읽기 실패 뒤 추가는 거절하고 기존 즐겨찾기 2개를 지킨다");
  eq((await api(fx, "/u/api/favorites?household=house-home")).status, 503, "B02 읽기 실패는 빈 목록이 아니라 오류로 알린다");
  fx.db.__fail_settings_read_key = "";
  const merged = await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "tx-expense-3", tx: tx("tx-expense-3", 28600) });
  ok(merged.status === 200 && JSON.parse(setting(fx, key)).length === 3, "B02 정상 추가는 기존 목록에 합친다");
  fx.db.accountbook_settings.find((row) => row.key === key).value = "{broken";
  const broken = await api(fx, "/u/api/favorites", "POST", { household: "house-home", id: "tx-income-1", tx: tx("tx-income-1", 3200000) });
  ok(broken.status === 503 && setting(fx, key) === "{broken", "B02 깨진 JSON 을 덮어쓰지 않는다");
});

// ---------------------------------------------------------------------------
// B03 3개월 평균(관리자 분석 탭의 "3개월 평균 대비" 카드)
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  fx.env.ADMIN_API_TOKEN = "qa-admin-api-v22933";
  const row = (id, date, type, amount) => ({ id, household_id: "house-home", user_id: "user-bin", transaction_date: date, type, amount, category: type === "income" ? "급여" : "식비", memo: "qa", payment_method: "카드", created_at: `${date}T00:00:00Z` });
  fx.db.transactions = [row("a1", "2026-08-10", "income", 100000), row("a2", "2026-09-10", "income", 100000), row("a3", "2026-10-05", "expense", 30000)];
  const result = await page(fx, "/?legacy=1&tab=analysis&month=2026-10&household_id=house-home", { cookie: "", headers: { authorization: "Bearer qa-admin-api-v22933" } });
  const at = result.html.indexOf("3개월 평균 대비");
  const card = at >= 0 ? result.html.slice(at, at + 600).replace(/<[^>]+>/g, " ") : "";
  ok(/10,000원/.test(card), "B03 [0원, 0원, 30,000원] 석 달 평균은 10,000원이다");
  ok(/기록이 있는 3개월/.test(card), "B03 카드가 평균에 넣은 달 수를 알린다");
});

// ---------------------------------------------------------------------------
// B04 요일 날짜 — 웹 해석과 카카오 해석의 대조, 서버 대조, 내려가는 자산
// ---------------------------------------------------------------------------
{
  eq(quickInputDate("지난주 금요일 점심 12000원", "2026-10-09"), "2026-10-02", "B04 기준일 2026-10-09 의 '지난주 금요일'은 2026-10-02 다");
  eq(explicitDateIntent("지난주 금요일 점심 12000원"), true, "B04 요일 표현을 날짜 표현으로 감지한다");
  eq(quickInputDate("10월 2일 금요일 점심", "2026-10-20"), "2026-10-02", "B04 명시 날짜가 요일보다 먼저다");
  const scopes = ["", "지난주 ", "지난 주 ", "저번주 ", "전주 ", "이번주 ", "이번 주 ", "금주 ", "다음주 ", "다음 주 ", "내주 "];
  const bases = [];
  const addBase = (ymd, days) => { const d = new Date(`${ymd}T00:00:00Z`); for (let i = 0; i < days; i += 1) { bases.push(new Date(d.getTime() + i * 86400000).toISOString().slice(0, 10)); } };
  addBase("2026-10-05", 14);
  addBase("2026-12-26", 10);
  addBase("2028-02-24", 8);
  const mismatches = [];
  let compared = 0;
  for (const base of bases) {
    const [y, m, d] = base.split("-").map(Number);
    const kakaoNow = new Date(y, m - 1, d, 12, 0, 0);
    for (const scope of scopes) {
      for (const day of "월화수목금토일") {
        const text = `${scope}${day}요일 점심 12000원`;
        const web = quickInputDate(text, base);
        const kakao = resolveWeekdayPhrase(text, kakaoNow);
        compared += 1;
        if (web !== kakao) mismatches.push(`${base} ${text}: web ${web} / kakao ${kakao}`);
      }
    }
  }
  ok(compared >= 2000, `B04 대조한 경우가 충분하다 (${compared}개)`);
  eq(mismatches.slice(0, 3).join(" | "), "", "B04 웹과 카카오의 요일 날짜가 모든 기준일·주 범위·요일에서 같다");
}
await withClock("2026-10-09", () => fixture(async (fx) => {
  const values = (date) => ({ month: "2026-10", household_id: "house-home", type: "expense", amount: "12000", transaction_date: date, raw_text: "지난주 금요일 점심 12000원", memo: "점심", category: "식비", payment_method: "카드", quick_manual_date: "0", quick_manual_amount: "0" });
  const before = fx.db.transactions.length;
  const stale = await post(fx, "/admin/transactions", values("2026-10-09"));
  ok(/err=invalid_date/.test(stale.headers.get("location") || "") && fx.db.transactions.length === before, "B04 문장 속 날짜(10-02)와 다른 폼 날짜(오늘)는 저장하지 않는다");
  const fresh = await post(fx, "/admin/transactions", values("2026-10-02"));
  ok(fresh.status === 303 && fx.db.transactions.some((row) => row.transaction_date === "2026-10-02" && Number(row.amount) === 12000), "B04 문장과 같은 날짜면 저장한다");
  const manual = await post(fx, "/admin/transactions", { ...values("2026-10-05"), quick_manual_date: "1" });
  ok(manual.status === 303 && fx.db.transactions.some((row) => row.transaction_date === "2026-10-05" && Number(row.amount) === 12000), "B04 날짜를 직접 고친 경우는 폼 날짜를 따른다");
}));
await fixture(async (fx) => {
  const assets = {};
  for (const path of ["/assets/mobile-home-v22930.js", "/assets/mobile-home-shell-v22930.js", "/assets/mobile-home-v22933.js", "/assets/mobile-home-shell-v22933.js"]) {
    const response = await app.fetch(new Request(`${BASE}${path}`), {}, ctx);
    assets[path] = { status: response.status, etag: response.headers.get("etag"), cache: response.headers.get("cache-control") || "", body: Buffer.from(await response.arrayBuffer()) };
  }
  eq(sha256(assets["/assets/mobile-home-v22930.js"].body), "ff513d9d5936fe1393489b98170ca7f7681ed8500d6edfe3f0eb4c9d10e1c416", "B04 이전 홈 자산 v22930 바이트를 그대로 보존한다");
  eq(sha256(assets["/assets/mobile-home-shell-v22930.js"].body), "ba1c9fc28e05a228fe47a8fa052c843d34964aa03be53e38b7cf068518bd4239", "B04 이전 홈 셸 자산 v22930 바이트를 그대로 보존한다");
  ok(Object.values(assets).every((asset) => asset.status === 200 && asset.cache.includes("immutable")), "B04 이전·새 주소 모두 불변 자산으로 내려간다");
  ok(["/assets/mobile-home-v22933.js", "/assets/mobile-home-shell-v22933.js"].every((path) => assets[path].body.toString("utf8").includes("([월화수목금토일])요일") && assets[path].etag.includes("v22933")), "B04 새 자산이 요일 해석을 싣고 새 판의 ETag 를 단다");
  const home = await page(fx, "/app?month=2026-07&household_id=house-home");
  ok(!/mobile-home(?:-shell)?-v22930\.js/.test(home.html), "B04 새 화면은 v22930 자산을 부르지 않는다");
});

// ---------------------------------------------------------------------------
// B05 조회 완전성
// ---------------------------------------------------------------------------
await withClock("2026-10-09", () => fixture(async (fx) => {
  fx.db.transactions.push(...bulkRows(20001, { month: "2026-03", prefix: "year" }));
  const over = await page(fx, "/annual?year=2026&household_id=house-home");
  ok(over.status === 200 && over.html.includes("연간 리포트를 만들 수 없습니다") && !over.html.includes('<section class="grid">'), "B05 한 해 기록이 2만 건을 넘으면 일부로 연간 합계를 내지 않고 이유를 알린다");
  const control = await page(fx, "/annual?year=2025&household_id=house-home");
  ok(control.status === 200 && control.html.includes('<section class="grid">') && !control.html.includes("연간 리포트를 만들 수 없습니다"), "B05 한도 안의 해는 연간 리포트를 그대로 그린다");
}));
await withClock("2026-10-09", () => fixture(async (fx) => {
  fx.db.transactions.push(...bulkRows(6001, { month: "2026-10", prefix: "kakao" }), ...bulkRows(6001, { householdId: "house-trip", month: "2026-10", prefix: "kakao-trip" }));
  await skill(fx, "이번달 요약");
  await skill(fx, "2");
  const reply = await skill(fx, "이번달 요약");
  ok(reply.includes("기록이 너무 많아 합계를 정확히 계산하지 못했어요"), "B05 카카오 기간 요약은 일부 기록으로 합계를 말하지 않는다");
}));
await withClock("2026-10-09", () => fixture(async (fx) => {
  await skill(fx, "7월 요약");
  await skill(fx, "2");
  const reply = await skill(fx, "7월 요약");
  ok(!reply.includes("기록이 너무 많아") && /지출|수입/.test(reply), "B05 한도 안의 기간 요약은 그대로 답한다");
}));
await withClock("2026-10-09", () => fixture(async (fx) => {
  fx.db.transactions.push(...bulkRows(40001, { month: "2026-05", prefix: "backup" }));
  const all = await page(fx, "/my/backup.csv?household_id=house-home&month=2026-10&range=all");
  ok(all.status >= 300 && all.status < 400 && /err=backup_too_large/.test(all.location), "B05 전체 백업이 4만 건을 넘으면 일부만 담긴 파일을 내려보내지 않는다");
  const shown = await page(fx, `/my/backup?household_id=house-home&month=2026-10&err=backup_too_large`);
  ok(shown.html.includes("월별 CSV로 나눠 내려받아"), "B05 백업 화면이 이유와 대안을 알린다");
  const month = await app.fetch(new Request(`${BASE}/my/backup.csv?household_id=house-home&month=2026-07`, { headers: { cookie: fx.cookie } }), fx.env, ctx);
  ok(month.status === 200 && /text\/csv/.test(month.headers.get("content-type") || ""), "B05 월별 백업은 그대로 내려간다");
  const search = await api(fx, "/u/api/tx/search?household=house-home&q=%EB%8C%80%EB%9F%89");
  ok(search.status === 422 && search.data?.error === "too_many_rows", "B05 전체 기간 검색도 일부만 훑지 않고 이유를 알린다");
}));

// ---------------------------------------------------------------------------
// B06 수정 이력
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  const key = "transaction_edit_history:house-home";
  const prior = { "tx-expense-2": [{ at: "2026-07-08T00:00:00Z", edited_by: "user-bin", changes: [{ field: "amount", label: "금액", before: "70,000원", after: "72,000원" }] }] };
  fx.db.accountbook_settings.push({ id: "hist", key, value: JSON.stringify(prior), created_at: "2026-07-01T00:00:00Z" });
  const values = (amount) => ({ id: "tx-expense-1", month: "2026-07", household_id: "house-home", transaction_date: "2026-07-04", amount: String(amount), type: "expense", memo: "주말 장보기", category: "식비", payment_method: "현대카드", user_id: "user-wifi" });
  fx.db.__fail_settings_read_key = key;
  const first = await post(fx, "/my/update", values(150000));
  const kept = JSON.parse(setting(fx, key));
  ok(/msg=updated/.test(first.headers.get("location") || "") && fx.db.transactions.find((row) => row.id === "tx-expense-1").amount === 150000, "B06 이력 읽기가 실패해도 거래 수정은 저장되고 성공으로 알린다");
  ok(kept["tx-expense-2"]?.length === 1 && !kept["tx-expense-1"], "B06 이력 읽기 실패 뒤 기존 이력을 덮어쓰지 않는다");
  fx.db.__fail_settings_read_key = "";
  await post(fx, "/my/update", values(160000));
  const merged = JSON.parse(setting(fx, key));
  ok(merged["tx-expense-2"]?.length === 1 && merged["tx-expense-1"]?.length === 1, "B06 다음 수정은 기존 이력에 합친다");
});

// ---------------------------------------------------------------------------
// B07 챌린지 표시
// ---------------------------------------------------------------------------
await withClock("2026-10-09", () => fixture(async (fx) => {
  const key = "report_challenge:house-home";
  const save = (enabled) => {
    fx.db.accountbook_settings = fx.db.accountbook_settings.filter((row) => row.key !== key);
    fx.db.accountbook_settings.push({ id: "challenge", key, value: JSON.stringify({ schema_version: 2, type: "no_spend_days", enabled, target_days: 3, title: "무지출 데이", start_date: "2026-10-01", target_date: "2026-10-07" }), created_at: "2026-07-01T00:00:00Z" });
  };
  save(false);
  ok(!/id="reportChallenge"/.test((await page(fx, "/app?month=2026-10&household_id=house-home")).html), "B07 챌린지 표시를 끄면 홈에 카드가 없다");
  save(true);
  ok(/id="reportChallenge"/.test((await page(fx, "/app?month=2026-10&household_id=house-home")).html), "B07 다시 켜면 홈에 카드가 있다");
  ok((await page(fx, "/my/analysis?view=report&month=2026-10&household_id=house-home")).html.includes("2026-10-07에 끝난 챌린지입니다"), "B07 끝난 챌린지는 리포트 화면이 끝난 날짜와 함께 알린다");
}));

// ---------------------------------------------------------------------------
// B08 접근성 이름 / B09 간격 (로그인 전 /my)
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  const env = { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-key", KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback`, PUBLIC_BASE_URL: BASE };
  const { status, html } = await page(fx, "/my", { cookie: "", env });
  eq(status, 200, "B08 로그인 전 /my 를 그린다");
  const expected = { loginPassword: "비밀번호", signupPassword: "새 비밀번호", signupPasswordConfirm: "새 비밀번호 확인", kakaoClaimCode: "웹 연결 코드", signupDisplay: "가계부에 표시할 이름" };
  for (const [id, label] of Object.entries(expected)) {
    const tag = (html.match(new RegExp(`<(?:input|select|textarea)\\b[^>]*\\bid="${id}"[^>]*>`)) || [""])[0];
    const visible = (html.match(new RegExp(`<label\\b[^>]*\\bfor="${id}"[^>]*>([\\s\\S]*?)</label>`)) || [, ""])[1].replace(/<[^>]+>/g, "").trim();
    const aria = (tag.match(/\baria-label="([^"]*)"/) || [, ""])[1];
    ok(tag && visible === label && (!aria || aria.includes(label)), `B08 #${id} 의 접근성 이름이 화면 라벨 "${label}"을 따른다`);
  }
  // 화면 라벨이 for= 로 연결된 모든 컨트롤에서, aria-label 이 있으면 라벨 문구를 담아야 한다.
  const labels = new Map([...html.matchAll(/<label\b[^>]*\bfor="([^"]+)"[^>]*>([\s\S]*?)<\/label>/g)].map((m) => [m[1], m[2].replace(/<[^>]+>/g, "").trim()]));
  const conflicts = [...html.matchAll(/<(?:input|select|textarea)\b[^>]*>/g)].map((m) => m[0]).filter((tag) => {
    const id = (tag.match(/\bid="([^"]+)"/) || [])[1];
    const aria = (tag.match(/\baria-label="([^"]*)"/) || [])[1];
    return id && aria !== undefined && labels.has(id) && labels.get(id) && !aria.includes(labels.get(id));
  });
  eq(conflicts.length, 0, `B08 라벨이 연결된 칸의 aria-label 이 라벨 문구와 어긋나지 않는다${conflicts.length ? ` — ${conflicts.slice(0, 2).join(" ")}` : ""}`);
  ok(html.includes("form+.hint{margin-top:8px}") && /<\/form><p class="hint">10분 동안 1회 사용/.test(html), "B09 카카오 연결 폼 뒤 보안 안내는 8px 간격을 둔다");
});

// ---------------------------------------------------------------------------
// T1 웹 수정 폼 — 운영 PostgREST 처럼 select 한 칸만 돌려주게 하고 확인한다
// ---------------------------------------------------------------------------
await fixture(async (fx) => {
  fx.db.__honor_select = true;
  const fragment = await page(fx, "/transactions/edit?id=tx-income-1&fragment=1", { headers: { "x-requested-with": "fetch" } });
  const form = (fragment.html.match(/<form class="v8-edit"[\s\S]*?<\/form>/) || [""])[0];
  const fields = new URLSearchParams();
  for (const m of form.matchAll(/<input\b[^>]*>/g)) {
    const tag = m[0];
    const name = (tag.match(/\bname="([^"]+)"/) || [])[1];
    if (!name) continue;
    const type = ((tag.match(/\btype="([^"]+)"/) || [])[1] || "text").toLowerCase();
    if ((type === "radio" || type === "checkbox") && !/\bchecked\b/.test(tag)) continue;
    fields.append(name, (tag.match(/\bvalue="([^"]*)"/) || [, ""])[1].replace(/&amp;/g, "&").replace(/&quot;/g, "\""));
  }
  for (const m of form.matchAll(/<select\b[^>]*\bname="([^"]+)"[^>]*>([\s\S]*?)<\/select>/g)) {
    fields.set(m[1], (m[2].match(/<option\b[^>]*value="([^"]*)"[^>]*\bselected\b/) || [, ""])[1]);
  }
  ok(fragment.status === 200 && ["3,200,000", "3200000"].includes(fields.get("amount")), "T1 수정 폼에 저장된 금액이 채워진다");
  ok(fields.get("transaction_date") === "2026-07-01" && fields.get("category") === "급여" && fields.get("payment_method") === "급여통장", "T1 수정 폼에 날짜·분류·결제수단이 채워진다");
  fields.set("amount", "3300000");
  await app.fetch(new Request(`${BASE}/admin/update`, { method: "POST", headers: { cookie: fx.cookie, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html" }, body: fields.toString() }), fx.env, ctx);
  const row = fx.db.transactions.find((item) => item.id === "tx-income-1");
  ok(Number(row.amount) === 3300000 && row.type === "income" && row.transaction_date === "2026-07-01" && row.category === "급여" && row.memo === "7월 월급" && row.payment_method === "급여통장", "T1 금액만 바꿔 저장하면 나머지 칸은 그대로다");
});

console.log(`V22.9.33 QA 결함 수정 검사 통과 (${checks} checks)`);
