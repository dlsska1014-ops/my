// V22.9.81 데이터 묶음 검사 — 저장 응답 본문을 잃은 쓰기(U-22), 카카오 닉네임 ‘(통합됨)’ 로그인 잠김(U-23), 카카오 날짜 목록 밖 기록의
// 번호(U-13), 수동 ‘기록하기’ 지출자 없는 규칙이 섞인 경우의 묶음 반영(U-14), 가져오기 메모(U-11)와 카드 자리 머리글·짧은 머리글(U-12).
// 메모리 픽스처(validation/qa-fixture.mjs)로 재현하며 네트워크를 쓰지 않는다.
//
// ── 이 파일이 왜 생겼는지 ──
//   U-22 저장 요청이 2xx 머리를 받은 뒤 본문 받기가 끊기거나(연결 끊김) 쓰기 시한에 걸리면 ‘결과 불확실’로 보지 않았다. 저장소는 이미 반영했는데
//        웹 입력은 ‘저장하지 못했습니다’, 카카오는 ‘저장하지 못했어요… 다시 보내 주세요’, 백업 적용은 ‘저장하지 못함(기존 데이터 유지)’로 안내해
//        다시 보내면 두 번 저장됐다. 이제 그 쓰기도 결과 불확실이고, 부르는 곳마다 있던 다시 읽기·확인 필요 처리를 탄다.
//
// 옛 코드(V22.9.80)에서 무엇이 깨지는지 보려면 V22981_SOFT=1 로 돌린다(실패한 검사를 모두 적고 끝낸다).
// 사용: node validation/validate-data-v22981.mjs
import assert from "node:assert/strict";
import app from "../src/index.js";
import { supabase } from "../src/modules/data/supabase-client.js";
import { BASE, ctx, counter, fixture, intercept, post, putSetting, skill } from "./lib-audit-v22934.mjs";

const SOFT = process.env.V22981_SOFT === "1";
const t = counter("V22.9.81 데이터 묶음 검사 통과(본문을 잃은 저장의 결과 불확실·카카오 닉네임 통합 표식·날짜 목록 밖 번호·정기 기록하기 묶음·가져오기 메모·카드 자리 머리글)");
const failures = [];
let checks = 0;
const ok = (value, message) => {
  checks += 1;
  if (value) return t.ok(true, message);
  if (!SOFT) assert.fail(message);
  failures.push(message);
  return undefined;
};
const eq = (actual, expected, message) => ok(actual === expected, `${message} (실제 ${JSON.stringify(actual)}, 기대 ${JSON.stringify(expected)})`);
// 옛 코드에서 함수·값이 없어 예외가 나도 검사 하나의 실패로 모은다(SOFT).
const attempt = async (label, task) => {
  try { return await task(); } catch (error) {
    checks += 1;
    if (!SOFT) throw error;
    failures.push(`${label}: 예외 ${String(error?.message || error).slice(0, 160)}`);
    return undefined;
  }
};

const HH = "house-home";
const BIN = "11111111-1111-4111-8111-111111111111";
const WIFI = "22222222-2222-4222-8222-222222222222";
globalThis.__AB_QA_FIXED_NOW_MS = Date.parse("2026-07-21T12:00:00+09:00");

// 운영 users.id 는 uuid 다. 가져오기가 uuid 가 아닌 user_id 를 지우므로 픽스처 id 를 uuid 로 바꾼다.
async function uuidFixture(fx) {
  for (const [name, rows] of Object.entries(fx.db)) {
    if (Array.isArray(rows)) fx.db[name] = JSON.parse(JSON.stringify(rows).replaceAll("user-bin", BIN).replaceAll("user-wifi", WIFI));
  }
  fx.cookie = await fx.cookieFor(BIN);
  fx.db.__import_rpc_available = true;
  return fx;
}
const metricOf = (html, label) => String(html || "").match(new RegExp(`<span>${label}</span><b>([^<]*)</b>`))?.[1];

// ── U-22 2xx 머리 뒤 본문을 잃은 쓰기 ────────────────────────────────────────────
// 저장소가 요청을 처리해 2xx 머리를 보냈지만 본문 도중 연결이 끊긴 응답(운영의 연결 끊김·응답 도중 시한과 같은 모양).
const lostBody = (status = 201) => new Response(new ReadableStream({
  start(controller) { controller.enqueue(new TextEncoder().encode("[{\"id\":")); controller.error(new TypeError("Network connection lost")); },
}), { status, headers: { "content-type": "application/json" } });
// 머리는 왔지만 본문이 끝나지 않는 응답. 요청을 끊으면(시한) 본문 받기도 끝난다.
const stalledBody = (init, status = 201) => new Response(new ReadableStream({
  start(controller) {
    controller.enqueue(new TextEncoder().encode("["));
    init?.signal?.addEventListener("abort", () => controller.error(Object.assign(new Error("aborted"), { name: "AbortError" })), { once: true });
  },
}), { status, headers: { "content-type": "application/json" } });
const clientEnv = (extra = {}) => ({
  SUPABASE_URL: "https://mock.supabase.co", SUPABASE_SERVICE_ROLE_KEY: "synthetic-service-key",
  SUPABASE_READ_ATTEMPT_MS: "500", SUPABASE_WRITE_TIMEOUT_MS: "3000",
  __AB_MONITOR_REQUEST: { db_count: 0, db_ms: 0, db_failures: 0, db_retries: 0 },
  __AB_DB_BUDGET: { used: 0, limit: 50 },
  ...extra,
});
async function clientCall(respond, path, init) {
  const previous = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async (input, requestInit = {}) => { calls += 1; return respond(requestInit); };
  try {
    const value = await supabase(clientEnv(), path, init);
    return { value, error: null, calls };
  } catch (error) {
    return { value: undefined, error, calls };
  } finally {
    globalThis.fetch = previous;
  }
}
const uncertain = (error) => error?.uncertain_write === true && error?.code === "supabase_write_result_unknown" && error?.name === "SupabaseWriteUncertainError";

// 1) 저장소 함수: 쓰기는 결과 불확실, 조회·4xx 는 예전 그대로다.
{
  const post201 = await clientCall(() => lostBody(201), "/rest/v1/transactions", { method: "POST", headers: { Prefer: "return=representation" }, body: "{}" });
  ok(uncertain(post201.error), `U-22 저장소: 201 머리 뒤 본문이 끊긴 POST 는 결과 불확실(supabase_write_result_unknown)이다 (실제 ${post201.error?.code || post201.error?.message})`);
  eq(post201.calls, 1, "U-22 저장소: 결과 불확실 쓰기는 다시 보내지 않는다");
  ok(/Network connection lost/.test(String(post201.error?.cause?.message || "")), "U-22 저장소: 원래 오류는 cause 에 남는다");
  const patch200 = await clientCall(() => lostBody(200), "/rest/v1/accountbook_recurring?id=eq.r1", { method: "PATCH", body: "{}" });
  ok(uncertain(patch200.error), "U-22 저장소: 200 머리 뒤 본문이 끊긴 PATCH 도 결과 불확실이다");
  const rpc200 = await clientCall(() => lostBody(200), "/rest/v1/rpc/accountbook_commit_import_v22960", { method: "POST", body: "{}" });
  ok(uncertain(rpc200.error), "U-22 저장소: 200 머리 뒤 본문이 끊긴 RPC 도 결과 불확실이다");
  const stalled = await clientCall((init) => stalledBody(init, 201), "/rest/v1/transactions", { method: "POST", body: "{}" });
  ok(uncertain(stalled.error), `U-22 저장소: 201 머리 뒤 본문을 기다리다 쓰기 시한(3초)에 걸린 POST 는 결과 불확실이다(조회 시한 오류가 아니다) (실제 ${stalled.error?.code})`);
  const read200 = await clientCall(() => lostBody(200), "/rest/v1/transactions?select=id", { method: "GET" });
  ok(read200.error && !read200.error.uncertain_write, "U-22 저장소: 조회의 본문 끊김은 예전처럼 조회 실패다(쓰기 불확실이 아니다)");
  const post400 = await clientCall(() => lostBody(400), "/rest/v1/transactions", { method: "POST", body: "{}" });
  ok(post400.error && !post400.error.uncertain_write, "U-22 저장소: 4xx 거절은 본문이 끊겨도 분명한 실패다(결과 불확실로 바꾸지 않는다)");
  const whole = await clientCall(() => new Response(JSON.stringify([{ id: "a" }]), { status: 201, headers: { "content-type": "application/json" } }), "/rest/v1/transactions", { method: "POST", body: "{}" });
  eq(whole.value?.[0]?.id, "a", "U-22 저장소: 본문을 다 받은 쓰기는 예전처럼 결과를 돌려준다");
}

// 저장 요청은 픽스처가 반영하게 보내고, 응답만 본문 도중 끊는다(match 에 맞는 첫 요청 한 번).
function loseResponseBody(match) {
  let lost = 0;
  const stop = intercept(async ({ url, method, forward }) => {
    if (lost || url.hostname !== "mock.supabase.co" || !match(url, method)) return null;
    lost += 1;
    const stored = await forward();
    await stored.text();
    return lostBody(stored.status >= 200 && stored.status < 300 ? stored.status : 201);
  });
  return { stop, lost: () => lost };
}

// 2) 웹 입력: 요청 번호가 있으면 다시 읽어 저장을 확인하고, 없으면 ‘결과 확인 필요’다(‘저장하지 못함’이 아니다).
await attempt("U-22 웹 입력", () => fixture(async (fx) => {
  await uuidFixture(fx);
  const before = fx.db.transactions.length;
  const requestId = "33333333-3333-4333-8333-333333333333";
  const lose = loseResponseBody((url, method) => method === "POST" && url.pathname === "/rest/v1/transactions");
  const withId = await post(fx, "/my/transactions", { household_id: HH, month: "2026-07", type: "expense", transaction_date: "2026-07-21", amount: "8700", memo: "U22 점심", request_id: requestId });
  lose.stop();
  eq(lose.lost(), 1, "U-22 웹 입력(요청 번호 있음): 저장 응답 본문을 한 번 잃었다");
  eq(fx.db.transactions.length, before + 1, "U-22 웹 입력(요청 번호 있음): 저장소에는 한 건 저장됐다");
  ok(/msg=created/.test(withId.location) && !/err=/.test(withId.location), `U-22 웹 입력(요청 번호 있음): 다시 읽어 저장을 확인하고 ‘저장됨’으로 돌아간다 (실제 ${withId.location})`);
  const lose2 = loseResponseBody((url, method) => method === "POST" && url.pathname === "/rest/v1/transactions");
  const noId = await post(fx, "/my/transactions", { household_id: HH, month: "2026-07", type: "expense", transaction_date: "2026-07-21", amount: "6100", memo: "U22 커피" });
  lose2.stop();
  eq(fx.db.transactions.length, before + 2, "U-22 웹 입력(요청 번호 없음): 저장소에는 한 건 저장됐다");
  ok(/err=db_write_unknown/.test(noId.location), `U-22 웹 입력(요청 번호 없음): 다시 보내라는 안내(db_delay·save_failed)가 아니라 ‘결과 확인 필요’(db_write_unknown)로 돌아간다 (실제 ${noId.location})`);
}));

// 3) 카카오 기록: 고른 id 로 다시 읽어 저장을 확인하고 저장 답장을 낸다(‘저장하지 못했어요… 다시 보내 주세요’가 아니다).
await attempt("U-22 카카오 기록", () => fixture(async (fx) => {
  putSetting(fx, "kakao_selected_household_v2251:user-bin", HH);
  const before = fx.db.transactions.filter((row) => row.source === "kakao_skill").length;
  const lose = loseResponseBody((url, method) => method === "POST" && url.pathname === "/rest/v1/transactions");
  const reply = await skill(fx, "U22김밥 4300");
  lose.stop();
  eq(lose.lost(), 1, "U-22 카카오: 저장 응답 본문을 한 번 잃었다");
  eq(fx.db.transactions.filter((row) => row.source === "kakao_skill").length, before + 1, "U-22 카카오: 저장소에는 한 건 저장됐다");
  ok(!/저장하지 못했어요/.test(reply) && /4,300원/.test(reply), `U-22 카카오: 다시 읽어 확인한 저장 답장을 낸다(‘저장하지 못했어요’가 아니다) (실제 ${JSON.stringify(reply.slice(0, 120))})`);
}));

// 4) 내 가계부 가져오기: 다시 읽어 저장을 확인한다(‘저장 안 됨’으로 세지 않는다).
await attempt("U-22 내 가져오기", () => fixture(async (fx) => {
  await uuidFixture(fx);
  const text = "날짜,금액,내용\n2026-07-11,11000,U22 가져오기 하나\n2026-07-12,12000,U22 가져오기 둘";
  const preview = await post(fx, "/my/import", { import_action: "preview", household_id: HH, month: "2026-07", csv_text: text, skip_duplicates: "1" });
  const token = preview.text.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
  const payload = token ? JSON.parse(Buffer.from(token.split(".")[0], "base64url").toString("utf8")) : null;
  const ready = payload?.ready || [];
  eq(ready.length, 2, "U-22 내 가져오기: 두 행이 저장 후보다");
  const values = new URLSearchParams({ import_action: "commit", import_token: token, household_id: HH, month: "2026-07" });
  for (const entry of ready) values.append("selected_rows", String(entry.row_number));
  const lose = loseResponseBody((url, method) => method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_commit_import_v22960");
  const saved = await post(fx, "/my/import", values);
  lose.stop();
  eq(lose.lost(), 1, "U-22 내 가져오기: 저장 RPC 응답 본문을 한 번 잃었다");
  eq(fx.db.transactions.filter((row) => /^U22 가져오기/.test(row.memo)).length, 2, "U-22 내 가져오기: 저장소에는 두 건 저장됐다");
  eq(metricOf(saved.text, "저장 완료"), "2", "U-22 내 가져오기: 다시 읽어 확인한 두 건을 ‘저장 완료’로 센다");
  eq(metricOf(saved.text, "저장 안 됨"), "0", "U-22 내 가져오기: ‘저장 안 됨’으로 세지 않는다");
}));

// 5) 관리자 복구 적용: 다시 읽어 확인하고, ‘저장하지 못함(기존 데이터 유지)’으로 적지 않는다.
let adminLoginSeq = 0;
async function adminCookie(fx) {
  fx.env.ADMIN_PASSWORD = "admin-pass";
  fx.env.ADMIN_SESSION_SECRET = "admin-secret";
  adminLoginSeq += 1;
  const response = await app.fetch(new Request(`${BASE}/login`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", origin: BASE, "sec-fetch-site": "same-origin", accept: "text/html", "cf-connecting-ip": `198.51.100.${(adminLoginSeq % 250) + 1}` },
    body: new URLSearchParams({ password: "admin-pass", return_to: "/backup" }).toString(),
  }), fx.env, ctx);
  return ((response.headers.get("set-cookie") || "").match(/ab_admin=[^;]+/) || [""])[0];
}
async function sendPlan(fx, cookie, rows) {
  const form = new FormData();
  for (const [key, value] of Object.entries({ household_id: HH, month: "2026-07", admin_password: "admin-pass", confirm_text: "가져오기 적용" })) form.set(key, value);
  form.set("plan_file", new File([JSON.stringify({ app: "kakao-accountbook", mode: "candidate_plan_only_no_db_write", selected_count: rows.length, selected: rows })], "plan.json", { type: "application/json" }));
  const response = await app.fetch(new Request(`${BASE}/backup/apply`, { method: "POST", headers: { cookie, origin: BASE, "sec-fetch-site": "same-origin" }, body: form }), fx.env, ctx);
  return { status: response.status, text: await response.text() };
}
await attempt("U-22 관리자 복구 적용", () => fixture(async (fx) => {
  await uuidFixture(fx);
  const admin = await adminCookie(fx);
  ok(!!admin, "U-22 관리자 복구 적용: 관리자 로그인");
  const rows = [
    { transaction_date: "2026-07-13", type: "expense", amount: 13100, category: "식비", memo: "U22 복구 하나", payment_method: "", user_id: BIN },
    { transaction_date: "2026-07-14", type: "expense", amount: 14200, category: "식비", memo: "U22 복구 둘", payment_method: "", user_id: BIN },
  ];
  const lose = loseResponseBody((url, method) => method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_commit_import_v22960");
  const applied = await sendPlan(fx, admin, rows);
  lose.stop();
  eq(lose.lost(), 1, "U-22 관리자 복구 적용: 첫 행의 저장 RPC 응답 본문을 한 번 잃었다");
  eq(fx.db.transactions.filter((row) => /^U22 복구/.test(row.memo)).length, 2, "U-22 관리자 복구 적용: 저장소에는 두 건 저장됐다");
  ok(!applied.text.includes("저장하지 못함(기존 데이터 유지)"), "U-22 관리자 복구 적용: 저장된 행을 ‘저장하지 못함(기존 데이터 유지)’으로 적지 않는다");
  ok(/<span>성공<\/span><b>2<\/b>/.test(applied.text), "U-22 관리자 복구 적용: 다시 읽어 확인한 두 건이 ‘성공’이다");
}));

// ── U-23 카카오 프로필 이름 끝의 ‘(통합됨)’ ─────────────────────────────────────────
// 웹 카카오 로그인(/auth/kakao/start → /auth/kakao/callback)을 그대로 밟는다. 카카오 서버 두 곳만 가짜 응답으로 바꾸고, 콜백이 준
// 세션 쿠키로 /my/profile 을 열어 로그인이 실제로 통하는지(세션 확인이 거절하면 /my 로 돌려보낸다) 본다.
function setCookiePairs(headers) {
  const all = typeof headers.getSetCookie === "function" ? headers.getSetCookie() : [headers.get("set-cookie") || ""];
  return all.map((item) => String(item).split(";")[0].trim()).filter((pair) => pair && !pair.endsWith("="));
}
async function kakaoWebLogin(fx, kakaoId, nickname) {
  Object.assign(fx.env, { KAKAO_LOGIN_ENABLED: "1", KAKAO_REST_API_KEY: "qa-rest-api-key", KAKAO_REDIRECT_URI: `${BASE}/auth/kakao/callback` });
  const json = (body) => new Response(JSON.stringify(body), { status: 200, headers: { "content-type": "application/json" } });
  const restore = intercept(async ({ url, method, init }) => {
    if (url.href === "https://kauth.kakao.com/oauth/token") return json({ access_token: "qa-access-token", token_type: "bearer" });
    if (url.href === "https://kapi.kakao.com/v2/user/me") return json({ id: Number(kakaoId), properties: { nickname } });
    // 픽스처에 없는 카카오 식별 연결 RPC(V22.7)를 운영처럼 받아 준다(새 사용자를 만들 때 쓴다).
    if (method === "POST" && url.pathname === "/rest/v1/rpc/accountbook_link_kakao_identity_v227") {
      const body = JSON.parse(String(init.body || "{}"));
      fx.db.accountbook_user_identities.push({ provider: "kakao", provider_subject: String(body.p_kakao_id), user_id: String(body.p_user_id), login_name: body.p_nickname, created_at: "2026-07-21T00:00:00Z" });
      return json(true);
    }
    return null;
  });
  try {
    const start = await app.fetch(new Request(`${BASE}/auth/kakao/start`), fx.env, ctx);
    const state = new URL(start.headers.get("location") || `${BASE}/`).searchParams.get("state") || "";
    const callback = await app.fetch(new Request(`${BASE}/auth/kakao/callback?code=qa-code&state=${encodeURIComponent(state)}`, { headers: { cookie: setCookiePairs(start.headers).join("; ") } }), fx.env, ctx);
    const cookie = setCookiePairs(callback.headers).find((pair) => pair.startsWith("ab_user=")) || "";
    const profile = cookie ? await app.fetch(new Request(`${BASE}/my/profile`, { headers: { cookie, accept: "text/html" } }), fx.env, ctx) : null;
    return { userId: cookie ? decodeURIComponent(cookie.slice("ab_user=".length)).split("|")[0] : "", signedIn: profile?.status === 200 };
  } finally {
    restore();
  }
}
const storedName = (fx, where) => fx.db.users.find(where)?.nickname;
await attempt("U-23 카카오 로그인", () => fixture(async (fx) => {
  const placeholder = (id, kakaoId) => fx.db.users.push({ id, kakao_user_key: `kakao_login:${kakaoId}`, nickname: "카카오사용자", created_at: "2026-07-01T00:00:00Z" });
  // 1) 자리표시 이름으로 저장된 계정 + 프로필 이름 ‘길동 (통합됨)’
  placeholder("user-u23-a", "7001");
  const first = await kakaoWebLogin(fx, "7001", "길동 (통합됨)");
  eq(first.userId, "user-u23-a", "U-23 자리표시 이름 계정: 로그인 콜백이 그 계정으로 세션을 준다");
  eq(storedName(fx, (user) => user.id === "user-u23-a"), "길동", "U-23 자리표시 이름 계정: 프로필 이름을 표식을 떼고 저장한다");
  ok(first.signedIn, "U-23 자리표시 이름 계정: 그 세션으로 내 화면이 열린다(통합된 계정으로 거절하지 않는다)");
  ok((await kakaoWebLogin(fx, "7001", "길동 (통합됨)")).signedIn, "U-23 자리표시 이름 계정: 다음 로그인도 통한다");
  // 2) 처음 로그인하는 사용자 + 프로필 이름 ‘카카오사용자(통합됨)’(표식을 떼면 자리표시 이름)
  const fresh = await kakaoWebLogin(fx, "7002", "카카오사용자(통합됨)");
  eq(storedName(fx, (user) => user.kakao_user_key === "kakao_login:7002"), "카카오사용자", "U-23 새 사용자: ‘카카오사용자(통합됨)’은 표식 없이 자리표시 이름으로 남는다");
  ok(fresh.signedIn, "U-23 새 사용자: 그 세션으로 내 화면이 열린다");
  // 3) 표식이 네 번 겹친 이름
  placeholder("user-u23-c", "7003");
  const many = await kakaoWebLogin(fx, "7003", "길동 (통합됨) (통합됨) (통합됨) (통합됨)");
  eq(storedName(fx, (user) => user.id === "user-u23-c"), "길동", "U-23 표식이 네 번 겹쳐도 모두 떼고 저장한다");
  ok(many.signedIn, "U-23 표식이 네 번 겹친 이름: 로그인이 통한다");
  // 4) 보통 이름은 예전 그대로다.
  placeholder("user-u23-d", "7004");
  const plain = await kakaoWebLogin(fx, "7004", "민지");
  eq(storedName(fx, (user) => user.id === "user-u23-d"), "민지", "U-23 보통 프로필 이름은 예전처럼 그대로 저장한다");
  ok(plain.signedIn, "U-23 보통 프로필 이름: 로그인이 통한다");
  // 5) 결정: 이미 표식 이름으로 저장된 계정은 스스로 풀지 않는다. 옛 통합(V22.7 이전)이 이름에만 표식을 남겼을 수 있어
  //    통합된 계정과 구별할 수 없다(운영 확인 뒤 운영자가 정한다). 세션 확인은 예전 그대로 거절한다.
  fx.db.users.push({ id: "user-u23-e", kakao_user_key: "kakao_login:7005", nickname: "길동 (통합됨)", created_at: "2026-07-01T00:00:00Z" });
  const locked = await kakaoWebLogin(fx, "7005", "길동");
  eq(storedName(fx, (user) => user.id === "user-u23-e"), "길동 (통합됨)", "U-23 이미 표식 이름인 계정은 로그인이 이름을 바꾸지 않는다(통합 여부를 증명할 수 없음)");
  ok(!locked.signedIn, "U-23 이미 표식 이름인 계정은 세션 확인이 예전처럼 거절한다");
}));

if (SOFT && failures.length) {
  console.log(`V22981_SOFT: ${failures.length}개 검사 실패 (전체 ${checks}개)`);
  for (const failure of failures) console.log(` - ${failure}`);
  process.exitCode = 1;
} else {
  t.done();
}
