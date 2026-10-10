// V22.9.26 — 출시 점검(2026-10-06)에서 찾은 결함의 회귀 검사.
//
// 카카오: "예산 50만원"이 50만원 지출로 저장되던 것, 생성 경로의 금액 상한 없음, 슬래시 구분
// 복수 입력 유실, 확정 실패 때 "다시 보내지 말라" 안내, "환불" 지출 처리, 요일 상대 날짜.
// 인증: 레이트리밋이 User-Agent 를 포함한 클라이언트 키에만 걸려 계정·IP 단위가 없던 것,
// 닉네임 "(통합됨)" 꼬리표로 통합 해석 경로가 켜지고 광역 조회가 빈 secondary 를 통과시키던 것.
// 시간: UTC 런타임에서 요일이 하루 밀리던 것, 29·30·31일 정기지출이 짧은 달에 영영 미적용,
// cron 단계 격리, today 검증, 억 단위 반올림.
// 거래: 가져오기 제목행 오인, 설정 읽기 실패 때 덮어쓰기, 예산 폼 12행 잘림, 예산 금액 1,000
// 미만·잘못된 달, 가져오기 중복의 가계부 범위, 음수 금액 환불 처리, 전체 기간 백업.
// 화면: err/msg 반사 스푸핑, 진단 화면 관리자 게이트, CSV nosniff, 조각 응답 헤더, robots,
// 인라인 JSON 안전화, 상세 수정 폼 금액 필수, 엑셀 변환 재시도, 카카오 대기 화면 보조키.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const BASE = "https://malhaebook.com";
const KST = (iso) => Date.parse(`${iso}+09:00`);

const fixture = await createV2265QaFixture();
const mockFetch = globalThis.fetch;
const rpcCalls = [];
let hooks = { settingsGetFail: 0, txPostMode: "", householdsFail: false, denyAuthKey: "" };
globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = String(init.method || "GET").toUpperCase();
  if (url.hostname === "mock.supabase.co") {
    if (url.pathname.endsWith("/rpc/accountbook_auth_attempt")) {
      const body = JSON.parse(String(init.body || "{}"));
      rpcCalls.push(body);
      if (hooks.denyAuthKey && body.p_key === hooks.denyAuthKey) {
        return new Response(JSON.stringify({ allowed: false, attempts: 99, blocked_until: null }), { status: 200, headers: { "content-type": "application/json" } });
      }
    }
    if (hooks.settingsGetFail > 0 && method === "GET" && url.pathname.endsWith("/accountbook_settings")) {
      hooks.settingsGetFail -= 1;
      return new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    if (hooks.householdsFail && method === "GET" && url.pathname.endsWith("/households")) {
      return new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    }
    if (hooks.txPostMode && method === "POST" && url.pathname.endsWith("/transactions")) {
      if (hooks.txPostMode === "503") return new Response(JSON.stringify({ message: "upstream unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
      if (hooks.txPostMode === "400") return new Response(JSON.stringify({ message: "synthetic authoritative rejection" }), { status: 400, headers: { "content-type": "application/json" } });
      throw new TypeError("fetch failed: ECONNRESET");
    }
  }
  return mockFetch(input, init);
};
const ctx = { waitUntil() {} };
const form = (path, body, cookie = fixture.cookie, extraHeaders = {}) => app.fetch(new Request(BASE + path, {
  method: "POST",
  headers: { cookie, "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", ...extraHeaders },
  body: new URLSearchParams(body).toString(),
}), fixture.env, ctx);
const get = (path, cookie = fixture.cookie) => app.fetch(new Request(BASE + path, { headers: cookie ? { cookie, accept: "text/html" } : { accept: "text/html" } }), fixture.env, ctx);
const locParam = (response, key) => { try { return new URL(response.headers.get("location") || "", BASE).searchParams.get(key); } catch (_) { return null; } };
const skill = async (utterance, extra = {}) => {
  const response = await app.fetch(new Request(BASE + "/skill", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      intent: { id: "i1", name: "블록" },
      userRequest: { timezone: "Asia/Seoul", params: {}, block: { id: "b1", name: "블록" }, utterance, lang: "kr", user: { id: "kakao_login:2265", type: "botUserKey", properties: { botUserKey: "kakao_login:2265", ...extra } } },
      bot: { id: "bot1", name: "말해가계부" },
      action: { id: "a1", name: "스킬", params: {}, detailParams: {}, clientExtra: {} },
      contexts: [],
    }),
  }), fixture.env, ctx);
  const data = JSON.parse(await response.text());
  return String(data?.template?.outputs?.[0]?.simpleText?.text || "");
};
const txBy = (predicate) => fixture.db.transactions.filter(predicate);

try {
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-07-15T12:00:00"); // 수요일
  fixture.db.accountbook_settings.push({ id: "sel-bin", key: "kakao_selected_household_v2251:user-bin", value: "house-home", created_at: "2026-07-01T00:00:00.000Z" });

  // ── 카카오 ──────────────────────────────────────────────────────────────
  let before = fixture.db.transactions.length;
  let reply = await skill("예산 50만원");
  eq(fixture.db.transactions.length, before, "'예산 50만원'은 지출을 만들지 않는다");
  ok(reply.includes("전체 월 예산을 설정했어요"), `'예산 50만원'은 전체 월 예산을 설정한다 (${reply.split("\n")[0]})`);
  eq(Number(fixture.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.month === "2026-07" && b.category === "__total")?.amount), 500000, "전체 예산 50만원이 저장된다");
  reply = await skill("예산 설정 70만원");
  eq(Number(fixture.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.month === "2026-07" && b.category === "__total")?.amount), 700000, "'예산 설정 70만원'도 전체 예산이다");
  reply = await skill("이번달 예산 80만원");
  eq(Number(fixture.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.month === "2026-07" && b.category === "__total")?.amount), 800000, "'이번달 예산 80만원'도 전체 예산이다");
  reply = await skill("식비 예산 30만원");
  eq(Number(fixture.db.accountbook_budgets.find((b) => b.household_id === "house-home" && b.month === "2026-07" && b.category === "식비")?.amount), 300000, "분류 예산 문장은 예전처럼 분류 예산이다");
  eq(fixture.db.transactions.length, before, "예산 문장 넷이 거래를 만들지 않았다");

  reply = await skill("커피 45000000000000");
  eq(fixture.db.transactions.length, before, "20억 초과 금액은 저장하지 않는다");
  ok(reply.includes("금액이 너무 커서"), "20억 초과 금액은 이유를 안내한다");

  reply = await skill("커피 4500 / 점심 9000");
  const slashRows = txBy((t) => t.household_id === "house-home" && ["커피", "점심"].includes(t.memo) && [4500, 9000].includes(Number(t.amount)));
  eq(slashRows.length, 2, "슬래시로 나눈 두 거래가 모두 저장된다");
  ok(!txBy((t) => String(t.memo || "").includes("/")).length, "슬래시가 메모에 남지 않는다");
  reply = await skill("10/3 마트 52000");
  ok(txBy((t) => t.transaction_date === "2026-10-03" && Number(t.amount) === 52000).length === 1, "날짜 슬래시(10/3)는 나누지 않는다");

  reply = await skill("환불 12000");
  const refund = txBy((t) => Number(t.amount) === 12000 && t.raw_text === "환불 12000")[0];
  eq(refund?.type, "income", "'환불 12000'은 수입이다");
  eq(refund?.category, "환급", "'환불 12000'은 환급 분류다");
  reply = await skill("환불 수수료 3100");
  eq(txBy((t) => Number(t.amount) === 3100)[0]?.type, "expense", "'환불 수수료'는 지출이다");

  reply = await skill("지난주 금요일 술 51000");
  const lastFri = txBy((t) => Number(t.amount) === 51000)[0];
  eq(lastFri?.transaction_date, "2026-07-10", "'지난주 금요일'은 지난주 금요일 날짜다");
  ok(!/요일|지난주/.test(String(lastFri?.memo || "")), `요일 말이 메모에 남지 않는다 (${lastFri?.memo})`);
  reply = await skill("이번주 월요일 커피 3100");
  eq(txBy((t) => Number(t.amount) === 3100 && t.memo === "커피")[0]?.transaction_date, "2026-07-13", "'이번주 월요일'은 이번 주 월요일이다");
  reply = await skill("금요일 치킨 21000");
  eq(txBy((t) => Number(t.amount) === 21000)[0]?.transaction_date, "2026-07-10", "주 말이 없는 요일은 가장 가까운 지난 요일이다");
  reply = await skill("2월 31일 책 15500");
  eq(txBy((t) => Number(t.amount) === 15500).length, 0, "invalid explicit date stores no transaction");

  hooks.txPostMode = "503";
  before = fixture.db.transactions.length;
  reply = await skill("라면 4100");
  eq(fixture.db.transactions.length, before, "저장소 503 중 거래는 저장되지 않는다");
  ok(reply.includes("저장 확인이 지연") && reply.includes("다시 보내지 말고"), "503 응답은 커밋을 부정하지 않고 확인부터 안내한다");
  hooks.txPostMode = "400";
  reply = await skill("라면 4110");
  eq(fixture.db.transactions.length, before, "명확한 400 거부 중 거래는 저장되지 않는다");
  ok(reply.includes("저장하지 못했어요") && reply.includes("다시 보내"), "명확한 400 거부만 다시 보내 달라고 안내한다");
  hooks.txPostMode = "neterr";
  reply = await skill("김밥 4200");
  ok(reply.includes("저장 확인이 지연") && reply.includes("다시 보내지 말고"), "응답 없는 실패는 저장 여부가 불확실하다고 안내한다");
  hooks.txPostMode = "";

  // ── 인증 ────────────────────────────────────────────────────────────────
  rpcCalls.length = 0;
  let response = await form("/my/local-signup", { login_name: "launchfam", display_name: "출시 (통합됨)", access_code: "pass-word-2026", access_code_confirm: "pass-word-2026" }, "");
  eq(response.status, 303, "가입이 된다");
  const signupKeys = [...new Set(rpcCalls.map((c) => c.p_key))];
  eq(signupKeys.length, 2, "가입은 클라이언트·IP 두 범위를 센다");
  ok(!rpcCalls.some((c) => c.p_success === true), "가입 성공이 횟수를 지우지 않는다");
  const newUser = fixture.db.users.at(-1);
  eq(newUser.nickname, "출시", "가입 표시 이름의 '(통합됨)' 꼬리표를 뗀다");

  rpcCalls.length = 0;
  response = await form("/my/local-login", { login_name: "launchfam", access_code: "pass-word-2026" }, "");
  eq(response.status, 303, "로그인이 된다");
  const loginKeys = [...new Set(rpcCalls.filter((c) => c.p_success !== true).map((c) => c.p_key))];
  eq(loginKeys.length, 3, "login uses persistent IP admission plus subject/caller failure limits");
  eq(rpcCalls.filter((c) => c.p_success === true).length, 2, "로그인 성공은 두 범위 모두 지운다");
  hooks.denyAuthKey = loginKeys[2];
  response = await form("/my/local-login", { login_name: "LaunchFam", access_code: "pass-word-2026" }, "", { "user-agent": "rotated-agent/1.0" });
  eq(response.status, 429, "계정 단위 횟수가 차면 User-Agent 를 바꿔도 429 다");
  ok((await response.text()).includes("이 로그인 이름으로"), "계정 단위 차단 문구를 보여 준다");
  hooks.denyAuthKey = "";

  rpcCalls.length = 0;
  response = await form("/login", { password: "wrong-admin-password" }, "");
  ok(rpcCalls.length >= 3 && new Set(rpcCalls.map((c) => c.p_key)).size === 3, "admin admission and caller failures use independent scopes");

  const launchCookie = await fixture.cookieFor(newUser.id);
  response = await form("/my/profile", { nickname: "출시 (통합됨) (통합됨)" }, launchCookie);
  eq(fixture.db.users.find((u) => u.id === newUser.id)?.nickname, "출시", "프로필 이름의 '(통합됨)' 꼬리표를 모두 뗀다");

  fixture.db.users.push({ id: "user-mt", kakao_user_key: "kakao_login:9999", nickname: "테스트 (통합됨)", created_at: "2026-07-01T00:00:00.000Z" });
  fixture.db.accountbook_settings.push({ id: "legacy-merge", key: "identity_merge_audit:legacy:user-other", value: JSON.stringify({ primary_user_id: "user-bin" }), created_at: "2026-07-01T00:00:00.000Z" });
  const mtCookie = await fixture.cookieFor("user-mt");
  response = await get("/my/profile", mtCookie);
  eq(response.status, 303, "merged-looking raw token requires fresh login");
  ok(!String(response.headers.get("set-cookie") || "").includes("user-bin"), "다른 사용자의 세션 쿠키가 발급되지 않는다");
  fixture.db.accountbook_settings.push({ id: "real-merge", key: "identity_merge_audit:real:user-mt", value: JSON.stringify({ primary_user_id: "user-bin", secondary_user_id: "user-mt" }), created_at: "2026-07-01T00:00:00.000Z" });
  globalThis.__AB_EFFECTIVE_USER_CACHE?.clear?.();
  response = await get("/my/profile", mtCookie);
  eq(response.status, 303, "secondary 가 일치하는 정식 통합 기록은 예전처럼 주 계정으로 복구한다");
  eq(response.headers.get("x-accountbook-session-recovered"), null, "old merged token cannot mint a primary-account session");

  // ── 시간·cron ───────────────────────────────────────────────────────────
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-07-13T12:00:00"); // 월요일
  response = await app.fetch(new Request(BASE + "/u/api/recent-transactions?household_id=house-home", { headers: { cookie: fixture.cookie, accept: "application/json" } }), fixture.env, ctx);
  eq(JSON.parse(await response.text()).week_start, "2026-07-13", "월요일의 이번 주 시작일은 그날이다");
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-07-15T12:00:00");
  response = await get("/my/analysis?household_id=house-home&month=2026-07&view=report");
  let html = await response.text();
  const weekdayCells = [...html.matchAll(/<div class="weekdayCell[^"]*"[\s\S]*?<\/div><\/div>/g)].map((m) => m[0]);
  eq(weekdayCells.length, 7, "요일별 소비 칸이 일곱 개다");
  const satCell = weekdayCells.find((cell) => />토</.test(cell));
  ok(satCell && />1건</.test(satCell) && />15만</.test(satCell), "7월 4일(토) 148,000원이 토요일 칸에 집계된다");
  const tueCell = weekdayCells.find((cell) => />화</.test(cell));
  ok(tueCell && />1건</.test(tueCell) && />7만</.test(tueCell), "7월 7일(화) 72,000원이 화요일 칸에 집계된다");
  fixture.db.transactions.push({ id: "tx-big", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-07-20", type: "expense", amount: 150000000, category: "주거/월세", memo: "전세금", payment_method: "", source: "web", raw_text: "" });
  response = await get("/app?household_id=house-home&month=2026-07&view=calendar");
  html = await response.text();
  ok(html.includes("1.5억"), "1억 5천만원은 '1.5억'으로 줄여 쓴다");
  fixture.db.transactions = fixture.db.transactions.filter((t) => t.id !== "tx-big");

  const rentRow = fixture.db.accountbook_recurring.find((r) => r.id === "recurring-rent");
  if (rentRow) rentRow.is_active = false;
  fixture.db.accountbook_recurring.push({ id: "rec-31", household_id: "house-home", type: "expense", amount: 55000, category: "통신비", memo: "휴대폰", payment_method: "카드", day_of_month: 31, user_id: "user-bin", is_active: true, last_applied_month: "2026-01", created_at: "2026-01-01T00:00:00.000Z" });
  const runScheduled = async () => {
    const pending = [];
    let error = null;
    try { await app.scheduled({ cron: "10 0 * * *", scheduledTime: Date.now() }, fixture.env, { waitUntil(p) { pending.push(p); } }); } catch (err) { error = err; }
    for (const p of pending) { try { await p; } catch (err) { error = error || err; } }
    return error;
  };
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-02-15T09:10:00");
  await runScheduled();
  eq(txBy((t) => t.raw_text === "recurring:rec-31:2026-02").length, 0, "2월 15일에는 31일 항목을 아직 적용하지 않는다");
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-02-28T09:10:00");
  await runScheduled();
  const febRow = txBy((t) => t.raw_text === "recurring:rec-31:2026-02")[0];
  eq(febRow?.transaction_date, "2026-02-28", "31일 항목은 2월 말일에 적용된다");
  eq(fixture.db.accountbook_recurring.find((r) => r.id === "rec-31")?.last_applied_month, "2026-02", "적용한 달을 기록한다");

  const eventsBefore = (globalThis.__AB_OPS_EVENTS || []).length;
  rpcCalls.length = 0;
  const leaseKeys = [];
  const innerFetch = globalThis.fetch;
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(typeof input === "string" ? input : input.url);
    if (url.pathname.endsWith("/rpc/accountbook_claim_operation")) leaseKeys.push(String(JSON.parse(String(init.body || "{}")).p_key || ""));
    return innerFetch(input, init);
  };
  hooks.householdsFail = true;
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-03-01T09:10:00");
  const cronError = await runScheduled();
  hooks.householdsFail = false;
  globalThis.fetch = innerFetch;
  ok(cronError, "정기지출 단계가 실패하면 예약 실행은 끝에 오류를 던진다");
  const newEvents = (globalThis.__AB_OPS_EVENTS || []).slice(eventsBefore);
  ok(newEvents.some((e) => e.kind === "scheduled_error" && e.path === "/cron/recurring/apply"), "정기지출 단계 오류가 기록된다");
  ok(leaseKeys.some((k) => k.startsWith("cron:reports:")), "정기지출 단계가 실패해도 자동 리포트 단계는 실행된다");

  response = await app.fetch(new Request(BASE + "/cron/reports/generate?today=garbage", { method: "POST", headers: { "x-cron-secret": "c" } }), { ...fixture.env, CRON_SECRET: "c" }, ctx);
  const cronBody = JSON.parse(await response.text());
  ok(/^\d{4}-\d{2}-\d{2}$/.test(String(cronBody.today || "")), `잘못된 today 는 버리고 오늘 날짜를 쓴다 (${cronBody.today})`);

  // ── 거래·가져오기·예산 ──────────────────────────────────────────────────
  globalThis.__AB_QA_FIXED_NOW_MS = KST("2026-07-15T12:00:00");
  const csv = ["날짜,구분,금액,내용,분류,결제수단", "2026-07-01,지출,4500,스타벅스,카페/간식,카드", "2026-07-01,수입,50000,용돈,기타수입,계좌", "2026-07-01,출금,4500,스타벅스,식비,은행", "2026-07-02,지출,-5000,취소건,식비,카드", "2026-07-16,지출,12000,점심,식비,국민카드"].join("\n");
  fixture.db.transactions.push({ id: "tx-wifi-lunch", household_id: "house-home", user_id: "user-wifi", transaction_date: "2026-07-16", type: "expense", amount: 12000, category: "식비", memo: "점심", payment_method: "국민카드", source: "my_import", raw_text: "2026-07-16,지출,12000,점심,식비,국민카드" });
  response = await form("/my/import", { household_id: "house-home", month: "2026-07", csv_text: csv, skip_duplicates: "1" });
  eq(response.status, 200, "가져오기 미리보기가 열린다");
  html = await response.text();
  ok(!html.includes("반복된 제목 행"), "거래 행을 반복된 제목으로 오인하지 않는다");
  eq((html.match(/class="importPick"/g) || []).length, 4, "거래 행 5건 중 다른 구성원의 기존 기록과 겹치는 1건을 뺀 4건이 저장 후보다");
  ok(/data-amount="5000"[^>]*data-type="income"[^>]*data-review-needed="1"/.test(html), "지출 구분의 음수 금액은 환급(수입)·확인 필요로 표시한다");
  ok(html.includes("기존 기록과 중복"), "다른 구성원이 올린 같은 거래는 가계부 단위로 중복 처리한다");
  fixture.db.transactions = fixture.db.transactions.filter((t) => t.id !== "tx-wifi-lunch");

  before = fixture.db.accountbook_settings.length;
  await form("/my/category-keywords/save", { household_id: "house-home", month: "2026-07", type: "expense", name: "식비", keywords: "배민, 쿠팡이츠" });
  const kwKey = fixture.db.accountbook_settings.find((s) => s.key === "category_keywords:house-home" || String(s.key).startsWith("category_keywords"))?.key;
  ok(kwKey, "키워드 설정이 저장된다");
  const kwBefore = fixture.db.accountbook_settings.find((s) => s.key === kwKey)?.value;
  hooks.settingsGetFail = 1;
  response = await form("/my/category-keywords/save", { household_id: "house-home", month: "2026-07", type: "expense", name: "교통", keywords: "택시" });
  hooks.settingsGetFail = 0;
  ok(locParam(response, "err"), "설정 읽기 실패 중 키워드 저장은 오류로 돌아간다");
  eq(fixture.db.accountbook_settings.find((s) => s.key === kwKey)?.value, kwBefore, "읽기 실패 중에는 기존 키워드를 덮어쓰지 않는다");

  const reserveBefore = fixture.db.accountbook_settings.find((s) => s.key === "reserve_plans:house-home")?.value;
  hooks.settingsGetFail = 1;
  response = await form("/admin/reserve-plan/create", { household_id: "house-home", month: "2026-07", name: "재산세", amount: "300000", recurrence: "annual", due_months: "9" });
  hooks.settingsGetFail = 0;
  eq(fixture.db.accountbook_settings.find((s) => s.key === "reserve_plans:house-home")?.value, reserveBefore, "읽기 실패 중에는 기존 적립계획을 덮어쓰지 않는다");
  ok(JSON.parse(reserveBefore).some((p) => p.name === "자동차보험"), "기존 적립계획이 그대로 남아 있다");

  for (let i = 1; i <= 15; i += 1) fixture.db.accountbook_budgets.push({ id: `b-many-${i}`, household_id: "house-home", month: "2026-08", category: `분류${String(i).padStart(2, "0")}`, amount: 10000 * i, created_at: "2026-07-01T00:00:00.000Z" });
  const manyNames = Array.from({ length: 15 }, (_, i) => `분류${String(i + 1).padStart(2, "0")}`);
  const renderedBudgetInputs = (page) => manyNames.filter((name) => new RegExp(`name="budget_category" value="${name}"`).test(page)).length;
  response = await get("/my/settings?household_id=house-home&month=2026-08");
  html = await response.text();
  eq(renderedBudgetInputs(html), 15, "설정 화면이 예산 분류 15개를 모두 입력란으로 그린다");
  response = await get("/budgets?household_id=house-home&month=2026-08");
  html = await response.text();
  eq(renderedBudgetInputs(html), 15, "예산 화면도 분류 15개를 모두 입력란으로 그린다");

  // V22.9.34 감사 S3: 일괄 예산 저장은 폼이 그려질 때의 계획 지문을 함께 보낸다.
  const septemberFingerprint = ((await (await get("/budgets?household_id=house-home&month=2026-09")).text()).match(/name="plan_fingerprint" value="([^"]+)"/) || [])[1] || "";
  response = await form("/my/budget-bulk/save", { household_id: "house-home", month: "2026-09", plan_fingerprint: septemberFingerprint, budget_category: "식비", budget_amount: "999" });
  eq(Number(fixture.db.accountbook_budgets.find((b) => b.month === "2026-09" && b.category === "식비")?.amount), 999, "1,000원 미만 예산도 그대로 저장된다");
  const sepRows = fixture.db.accountbook_budgets.filter((b) => b.month === "2026-09").length;
  response = await form("/my/budget-bulk/save", { household_id: "house-home", month: "2026-13", budget_category: "유일", budget_amount: "1000" });
  eq(locParam(response, "err"), "invalid_month", "잘못된 달은 거절한다");
  eq(fixture.db.accountbook_budgets.filter((b) => b.month === "2026-09").length, sepRows, "잘못된 달 제출이 다른 달 계획을 바꾸지 않는다");
  ok(!fixture.db.accountbook_budgets.some((b) => b.month === currentMonthOf() && b.category === "유일"), "잘못된 달 제출이 현재 달 계획을 바꾸지 않는다");

  fixture.db.transactions.push({ id: "tx-june", household_id: "house-home", user_id: "user-bin", transaction_date: "2026-06-03", type: "expense", amount: 3300, category: "외식", memo: "JUNE-ROW", payment_method: "", source: "web", raw_text: "" });
  response = await get("/my/backup.csv?household_id=house-home&month=2026-07&range=all");
  const csvText = await response.text();
  ok(csvText.includes("JUNE-ROW") && csvText.includes("주말 장보기"), "전체 기간 CSV 는 다른 달의 기록도 담는다");
  ok(String(response.headers.get("content-disposition") || "").includes("accountbook_all_"), "전체 기간 CSV 파일 이름에 all 이 붙는다");
  eq(response.headers.get("x-content-type-options"), "nosniff", "CSV 응답에 nosniff 가 붙는다");
  response = await get("/my/backup?household_id=house-home&month=2026-07");
  ok((await response.text()).includes("range=all"), "백업 화면이 전체 기간 CSV 링크를 보여 준다");

  // ── 화면·헤더 ───────────────────────────────────────────────────────────
  response = await get("/app?household_id=house-home&month=2026-07&err=" + encodeURIComponent("계정이 정지되었습니다. http://evil.example/login 에서 재인증하세요"));
  html = await response.text();
  ok(!html.includes("evil.example"), "주소가 섞인 err 문장은 그대로 보여 주지 않는다");
  response = await get("/app?household_id=house-home&month=2026-07&err=" + encodeURIComponent("참여자 권한 변경 권한이 없습니다."));
  html = await response.text();
  ok(!html.includes("참여자 권한 변경 권한이 없습니다.") && html.includes("요청을 처리하지 못했습니다."), "출처 없는 짧은 한국어 err 문장도 일반 안내로 바꾼다");
  response = await get("/app?household_id=house-home&month=2026-07&err=amount_too_large");
  ok((await response.text()).includes("20억 원 이하"), "열거한 오류 코드는 기존 안내 문구를 유지한다");
  response = await get("/kakao-login-check", "");
  eq(response.status, 303, "카카오 설정 진단 화면은 관리자만 연다");
  response = await get("/transactions/edit?id=tx-expense-1&household_id=house-home&fragment=1");
  ok(response.headers.get("content-security-policy"), "수정 폼 조각 응답에도 CSP 가 붙는다");
  response = await get("/robots.txt", "");
  const robots = await response.text();
  ok(robots.includes("Disallow: /u/") && robots.includes("Disallow: /ops-"), "robots.txt 가 API·운영 경로를 막는다");
  fixture.db.households.find((h) => h.id === "house-home").invite_code = "AB</script><script>alert(1)</script>";
  response = await get("/my/members?household_id=house-home&month=2026-07");
  html = await response.text();
  ok(!html.includes("</script><script>alert(1)"), "초대코드가 인라인 스크립트를 끊지 못한다");
  ok(html.includes("\\u003c/script>"), "인라인 JSON 이 < 를 이스케이프한다");
  fixture.db.households.find((h) => h.id === "house-home").invite_code = "HOME2265";
  response = await get("/transactions/edit?id=tx-expense-1&household_id=house-home&fragment=1");
  ok(/name="amount"[^>]*required min="1"/.test(await response.text()), "상세 수정 폼의 금액은 필수·1원 이상이다");
  ok((source.match(/xlsxPromise = null;/g) || []).length >= 4, "엑셀 변환 모듈 로더는 실패한 약속을 캐시하지 않는다");
  ok(source.includes("event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;"), "카카오 대기 화면은 새 탭 열기 클릭을 건너뛴다");
  ok(source.includes('querySelectorAll(".v8-tx .v8-tx-main")'), "거래 상세 키보드 진입 선택자가 실제 마크업과 맞는다");
  ok(source.includes('"/assets/accountbook-v5-v22937.js"'), "V5 번들 내용이 바뀌어 새 불변 주소를 쓴다");
} finally {
  globalThis.fetch = mockFetch;
  fixture.restore();
  delete globalThis.__AB_QA_FIXED_NOW_MS;
}

function currentMonthOf() { return "2026-07"; }

console.log(`PASS: launch fixes — kakao·auth·time·import·budget·headers (${checks} checks)`);
