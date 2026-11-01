// V22.9.94 — 전체 점검(2026-11-01) 후속 중 코디네이터 몫: R-5 시험 대역의 논리식 평가, R-6 단톡방→웹 온보딩 안내.
//
// ── 왜 생겼는지 ──
//   R-5 `validation/qa-fixture.mjs` 가 `or=`·`and=` 논리식을 무조건 참으로 통과시켰다(옛 35줄 `return true`). 그래서 운영 PostgREST 에서 한 번도
//       돌려 보지 않은 카카오 소유 조건(kakaoOwnerFilterV22979: ‘최근 기록’·‘방금 삭제·수정’의 대상)과 정기 규칙 자리 조건(recurringCronAfterFilter)이
//       문법이 틀려도, 남의 줄이 섞여도 검사를 통과했다. 이제 픽스처가 실제 문법대로 평가하고, 틀린 문법은 실제 서버처럼 400 PGRST100 이다.
//   R-6 단톡방 ‘웹가계부’ 버튼 → /my → 카카오 로그인 → 가계부 없는 새 계정의 ‘새로 만들까요? 참여할까요?’ 화면에서 끝났다. 정답인 1:1 채팅의
//       ‘웹 가계부 열기’ 코드 경로(/my/kakao-claim)가 그 화면에 없어 두 번째 계정을 만들기 쉬웠다. 시작 선택 화면에 그 길을 적는다.
import { fixture, intercept, page } from "./lib-audit-v22934.mjs";
import { createV2265QaFixture } from "./qa-fixture.mjs";
import { getRecentKakaoOwnedTransactionsV2254 } from "../src/modules/kakao/edit-session-v4.js";
import { renderMyStartChoiceHtml } from "../src/modules/auth/local-login-pages.js";

let checks = 0;
const failures = [];
const ok = (value, message) => { checks += 1; if (!value) failures.push(message); };
const eq = (actual, expected, message) => { checks += 1; if (actual !== expected) failures.push(`${message}: ${JSON.stringify(actual)} ≠ ${JSON.stringify(expected)}`); };

// ── R-5 ① 픽스처 논리식 평가 ──
{
  const fx = await createV2265QaFixture();
  try {
    fx.db.transactions = [
      { id: "t1", household_id: "h1", user_id: "u1", source_user_key: "k1", amount: 100, memo: "a,b" },
      { id: "t2", household_id: "h1", user_id: "u1", source_user_key: null, amount: 200, memo: "x.y" },
      { id: "t3", household_id: "h1", user_id: "u1", source_user_key: "", amount: 300, memo: "q\"z" },
      { id: "t4", household_id: "h1", user_id: "u2", source_user_key: "k2", amount: 400, memo: "p" },
      { id: "t5", household_id: "h1", user_id: "u2", source_user_key: null, amount: 500, memo: "(r)" },
    ];
    const get = async (qs, method = "GET") => {
      const response = await fetch(`https://mock.supabase.co/rest/v1/transactions?select=id&${qs}`, { method, headers: {} });
      const body = await response.json();
      return { status: response.status, ids: Array.isArray(body) ? body.map((row) => row.id).join(",") : "", code: body?.code || "" };
    };
    const cases = [
      ["카카오 소유 조건(내 키 + 내 user_id 의 빈 키)", "or=(source_user_key.eq.\"k1\",and(user_id.eq.\"u1\",or(source_user_key.is.null,source_user_key.eq.\"\")))", "t1,t2,t3"],
      ["카카오 소유 조건(다른 사람)", "or=(source_user_key.eq.\"k2\",and(user_id.eq.\"u2\",or(source_user_key.is.null,source_user_key.eq.\"\")))", "t4,t5"],
      ["카카오 소유 조건(키 없이 user_id 만)", "and=(user_id.eq.\"u1\",or(source_user_key.is.null,source_user_key.eq.\"\"))", "t2,t3"],
      ["단순 or", "or=(amount.gt.400,amount.lt.200)", "t1,t5"],
      ["정기 규칙 자리 조건 꼴(중첩 or/and)", "and=(or(amount.gt.100,and(amount.eq.100,id.gt.\"t0\")),amount.lt.500)", "t1,t2,t3,t4"],
      ["따옴표 안의 쉼표·점", "or=(memo.eq.\"a,b\",memo.eq.\"x.y\")", "t1,t2"],
      ["이스케이프한 따옴표·괄호 값", "or=(memo.eq.\"q\\\"z\",memo.eq.\"(r)\")", "t3,t5"],
      ["논리식 안의 in 목록", "or=(id.in.(t1,t4),amount.eq.500)", "t1,t4,t5"],
      ["칸.not.연산자", "and=(amount.not.eq.100,amount.not.gt.300)", "t2,t3"],
      ["맨 위 not.or", "not.or=(amount.lt.300,amount.gt.400)", "t3,t4"],
      ["중첩 not.and", "or=(not.and(amount.gt.100,amount.lt.500))", "t1,t5"],
      ["운영 정기 규칙 or 조건(null 포함)", "or=(last_applied_month.is.null,last_applied_month.lt.2026-07)", "t1,t2,t3,t4,t5"],
    ];
    for (const [label, qs, expected] of cases) {
      const result = await get(qs);
      eq(result.status, 200, `R-5 ${label} 200`);
      eq(result.ids, expected, `R-5 ${label} 결과 줄`);
    }
    const broken = ["or=(amount.gt.100", "or=amount.gt.100", "or=(amount.gt.100,)", "or=(amount)", "and=(source_user_key.eq.\"unterminated)", "or=()", "and=(amount.gt)"];
    for (const qs of broken) {
      const result = await get(qs);
      eq(result.status, 400, `R-5 틀린 문법은 400: ${qs}`);
      eq(result.code, "PGRST100", `R-5 틀린 문법 코드: ${qs}`);
    }
    const patch = await fetch("https://mock.supabase.co/rest/v1/transactions?or=(amount.eq.100,amount.eq.500)", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ memo: "patched" }) });
    eq(patch.status, 200, "R-5 PATCH 도 논리식을 평가한다");
    eq(fx.db.transactions.filter((row) => row.memo === "patched").map((row) => row.id).join(","), "t1,t5", "R-5 PATCH 가 맞는 줄만 바꾼다");
    const del = await fetch("https://mock.supabase.co/rest/v1/transactions?and=(user_id.eq.\"u2\",or(source_user_key.is.null,source_user_key.eq.\"\"))", { method: "DELETE", headers: {} });
    eq(del.status, 200, "R-5 DELETE 도 논리식을 평가한다");
    eq(fx.db.transactions.map((row) => row.id).join(","), "t1,t2,t3,t4", "R-5 DELETE 가 맞는 줄만 지운다");
    fx.db.__permissive_logic_filters = true;
    const permissive = await get("or=(amount.gt.100");
    eq(permissive.status, 200, "R-5 옛 동작 스위치(__permissive_logic_filters)는 문법을 보지 않는다");
    eq(permissive.ids, "t1,t2,t3,t4", "R-5 옛 동작 스위치는 모든 줄을 돌려준다");
    fx.db.__permissive_logic_filters = false;
    const strictAgain = await get("or=(amount.gt.100");
    eq(strictAgain.status, 400, "R-5 스위치를 끄면 다시 엄격하다");
  } finally {
    fx.restore();
  }
}

// ── R-5 ② 카카오 소유 조건이 실제 코드 경로에서 운영 문법으로 통과하고 내 줄만 돌려준다 ──
await fixture(async (fx) => {
  const HH = "house-home";
  fx.db.transactions = [
    { id: "k-1", household_id: HH, user_id: "user-bin", source_user_key: "kakao_login:2265", type: "expense", amount: 1000, memo: "내 카카오 기록", transaction_date: "2026-07-15", created_at: "2026-07-15T01:00:00.000Z" },
    { id: "k-2", household_id: HH, user_id: "user-bin", source_user_key: null, type: "expense", amount: 2000, memo: "내 웹 기록(키 없음)", transaction_date: "2026-07-15", created_at: "2026-07-15T02:00:00.000Z" },
    { id: "k-3", household_id: HH, user_id: "user-bin", source_user_key: "", type: "expense", amount: 2500, memo: "내 웹 기록(빈 키)", transaction_date: "2026-07-15", created_at: "2026-07-15T02:30:00.000Z" },
    { id: "k-4", household_id: HH, user_id: "user-wifi", source_user_key: "kakao_login:2266", type: "expense", amount: 3000, memo: "남의 카카오 기록", transaction_date: "2026-07-15", created_at: "2026-07-15T03:00:00.000Z" },
    { id: "k-5", household_id: HH, user_id: "user-bin", source_user_key: "kakao_login:2266", type: "expense", amount: 4000, memo: "내 user_id 지만 남의 키", transaction_date: "2026-07-15", created_at: "2026-07-15T04:00:00.000Z" },
    { id: "k-6", household_id: HH, user_id: "user-wifi", source_user_key: null, type: "expense", amount: 5000, memo: "남의 웹 기록", transaction_date: "2026-07-15", created_at: "2026-07-15T05:00:00.000Z" },
    { id: "k-7", household_id: "house-trip", user_id: "user-bin", source_user_key: "kakao_login:2265", type: "expense", amount: 6000, memo: "다른 가계부", transaction_date: "2026-07-15", created_at: "2026-07-15T06:00:00.000Z" },
  ];
  const seen = [];
  const stop = intercept(async ({ url, method }) => { if (method === "GET" && url.pathname.endsWith("/transactions")) seen.push(url); return null; });
  try {
    const rows = await getRecentKakaoOwnedTransactionsV2254(fx.env, HH, "user-bin", "kakao_login:2265", 10);
    eq(rows.map((row) => row.id).join(","), "k-3,k-2,k-1", "R-5 내 줄만, 최근 순(남의 키·남의 줄·다른 가계부 제외)");
    eq(seen.length, 1, "R-5 서버 조건이 거절되지 않아 조회는 한 번이다(예전 조회로 되돌아가지 않음)");
    const sent = seen[0]?.searchParams.get("or") || "";
    ok(sent.startsWith("(source_user_key.eq.\"kakao_login:2265\",and(user_id.eq.\"user-bin\",or(source_user_key.is.null,source_user_key.eq.\"\")))"), `R-5 보낸 or 조건이 운영 문법 그대로다: ${sent}`);
    eq(seen[0]?.searchParams.get("limit"), "10", "R-5 서버 조건이 있으면 limit 이 내 기록에만 걸린다");

    seen.length = 0;
    const onlyUser = await getRecentKakaoOwnedTransactionsV2254(fx.env, HH, "user-bin", "", 10);
    eq(onlyUser.map((row) => row.id).join(","), "k-3,k-2", "R-5 카카오 키 없이 user_id 만 있으면 빈 키의 내 줄만");
    eq(seen[0]?.searchParams.get("and") || "", "(user_id.eq.\"user-bin\",or(source_user_key.is.null,source_user_key.eq.\"\"))", "R-5 키 없는 조건은 and= 하나다");

    seen.length = 0;
    const onlyKey = await getRecentKakaoOwnedTransactionsV2254(fx.env, HH, "", "kakao_login:2266", 10);
    eq(onlyKey.map((row) => row.id).join(","), "k-5,k-4", "R-5 user_id 없이 키만 있으면 그 키의 줄만(user_id 와 무관)");
  } finally {
    stop();
  }

  // 서버가 조건을 거절하면(4xx) 예전 조회로 한 번 더 읽고, 마지막에 같은 규칙으로 다시 거른다.
  const seenAfter = [];
  const stopReject = intercept(async ({ url, method }) => {
    if (method === "GET" && url.pathname.endsWith("/transactions")) {
      seenAfter.push(url);
      if (url.searchParams.has("or")) return new Response(JSON.stringify({ code: "PGRST100", message: "simulated parse error" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return null;
  });
  try {
    const rows = await getRecentKakaoOwnedTransactionsV2254(fx.env, HH, "user-bin", "kakao_login:2265", 10);
    eq(rows.map((row) => row.id).join(","), "k-3,k-2,k-1", "R-5 서버가 조건을 거절해도 남의 줄은 나가지 않는다");
    eq(seenAfter.length, 2, "R-5 거절 뒤 예전 조회 한 번");
    ok(!seenAfter[1].searchParams.has("or"), "R-5 두 번째 조회에는 논리 조건이 없다");
  } finally {
    stopReject();
  }
});

// ── R-6 단톡방→웹 온보딩: 가계부 없는 계정의 시작 선택 화면에 1:1 ‘웹 가계부 열기’ 길이 있다 ──
{
  const html = renderMyStartChoiceHtml({ env: { APP_NAME: "말해가계부" }, user: { nickname: "테스트" } });
  ok(html.includes("카카오톡에서 이미 기록하고 있었나요?"), "R-6 시작 선택 화면에 카카오 기록 안내 제목");
  ok(html.includes("href=\"/my/kakao-claim\""), "R-6 안내가 /my/kakao-claim 으로 이어진다");
  ok(html.includes("<b>웹 가계부 열기</b>"), "R-6 1:1 채팅에서 보낼 말이 적혀 있다");
  ok(html.includes("단톡방의 ‘웹가계부’ 버튼으로 들어왔는데 가계부가 비어 있을 때"), "R-6 어떤 상황인지 적혀 있다");
  ok(!html.includes("아래 두 가지 중"), "R-6 선택지가 셋이라 ‘두 가지’ 라고 하지 않는다");
  ok(html.indexOf("새 가계부 만들기</h2>") < html.indexOf("카카오톡에서 이미 기록하고 있었나요?"), "R-6 새 가계부·참여 다음에 온다(기존 흐름 유지)");
}

await fixture(async (fx) => {
  fx.db.users.push({ id: "user-solo", kakao_user_key: "kakao_login:9999", nickname: "솔로", created_at: "2026-07-01T00:00:00.000Z" });
  const cookie = await fx.cookieFor("user-solo");
  let result = await page(fx, "/my", { cookie });
  for (let hop = 0; hop < 3 && result.status >= 300 && result.status < 400 && result.location; hop += 1) {
    const next = result.location.startsWith("http") ? new URL(result.location).pathname + new URL(result.location).search : result.location;
    result = await page(fx, next, { cookie });
  }
  eq(result.status, 200, "R-6 가계부 없는 계정의 /my 가 화면을 그린다");
  ok(result.html.includes("가계부 전환·관리") && result.html.includes("id=\"create\""), "R-6 그 화면은 가계부 만들기·참여 화면(/my/households#create)이다");
  ok(result.html.includes("id=\"kakao-record-link\""), "R-6 실제 경로에서도 카카오 기록 안내가 보인다");
  ok(result.html.includes("href=\"/my/kakao-claim\""), "R-6 실제 경로에서도 /my/kakao-claim 링크가 있다");
  ok(result.html.indexOf("id=\"create\"") < result.html.indexOf("id=\"kakao-record-link\""), "R-6 안내는 만들기·참여 카드 뒤에 온다");

  const withHousehold = await page(fx, "/my/households");
  eq(withHousehold.status, 200, "R-6 가계부가 있는 계정의 가계부 관리 화면");
  ok(!withHousehold.html.includes("id=\"kakao-record-link\""), "R-6 가계부가 있으면 안내 카드를 보이지 않는다");

  const claim = await page(fx, "/my/kakao-claim", { cookie });
  eq(claim.status, 200, "R-6 로그인한 채로도 /my/kakao-claim 이 열린다");
  ok(claim.html.includes("id=\"kakao-claim-start\" open"), "R-6 연결 코드 칸이 펼쳐져 있다");
  ok(claim.html.includes("name=\"kakao_claim_code\""), "R-6 연결 코드 입력 칸");
  const anonymous = await page(fx, "/my/kakao-claim", { cookie: "" });
  eq(anonymous.status, 200, "R-6 로그인 전에도 /my/kakao-claim 이 열린다");
  ok(anonymous.html.includes("id=\"kakao-claim-start\" open"), "R-6 로그인 전에도 연결 코드 칸이 펼쳐져 있다");
});

if (failures.length) {
  console.error(failures.slice(0, 60).join("\n"));
  console.error(`V22.9.94 점검 후속(시험 대역 논리식·온보딩 안내) 검사 실패 ${failures.length}건 / ${checks}`);
  process.exit(1);
}
console.log(`V22.9.94 점검 후속(시험 대역 논리식·온보딩 안내) 검사 통과 (${checks} checks)`);
