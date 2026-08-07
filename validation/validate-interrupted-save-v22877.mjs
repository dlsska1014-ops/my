// V22.8.77: 11단계 — 끊김·중단 상황에서의 복구
//
// 세션이 풀린 채로 저장하면 예전 관리자 화면(/?legacy=1)으로 던져졌다.
// 왜 안 됐는지 안내도 없고, 적어 둔 금액·메모도 잃고, 로그인해도 원래 화면으로
// 돌아오지 못했다. 이제 로그인으로 보내고 로그인 뒤 쓰던 화면으로 되돌린다.
import { readFileSync } from "node:fs";
import app from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const ORIGIN = "https://ttokttok-accountbook.com";
const MONTH = new Date().toISOString().slice(0, 7);
let checks = 0;

function ok(value, message) {
  checks++;
  if (!value) throw new Error(`FAIL: ${message}`);
}

function eq(actual, expected, message) {
  ok(actual === expected, `${message} (expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)})`);
}

const fixture = await createV2265QaFixture();
const post = (path, body, cookie = "") => app.fetch(new Request(`${ORIGIN}${path}`, {
  method: "POST",
  redirect: "manual",
  headers: {
    ...(cookie ? { cookie } : {}),
    "content-type": "application/x-www-form-urlencoded",
    "user-agent": "Mozilla/5.0",
  },
  body: new URLSearchParams(body).toString(),
}), fixture.env, {});

const homeReturn = `/app?month=${MONTH}&household_id=house-home`;
const entry = {
  household_id: "house-home",
  month: MONTH,
  return_to: homeReturn,
  type: "expense",
  amount: "7200",
  memo: "세션끊김",
  category: "식비",
  transaction_date: `${MONTH}-05`,
  user_id: "user-bin",
};

// ---------------------------------------------------------------------------
// 1. 저장 후 뒤로 가기 — 다시 제출되지 않아야 한다
// ---------------------------------------------------------------------------
// 쓰기 응답이 본문이면 뒤로 가기가 "양식을 다시 제출하시겠습니까"를 띄우고,
// 확인을 누르면 같은 기록이 한 번 더 남는다. 303 이면 그 일이 없다.
{
  const saved = await post("/admin/transactions", { ...entry, memo: "뒤로가기시험" }, fixture.cookie);
  eq(saved.status, 303, "저장은 리다이렉트로 끝나 뒤로 가기가 재제출되지 않는다");
  eq((await post("/my/budget-bulk/save", { household_id: "house-home", month: MONTH, budget_category: "식비", budget_amount: "1000" }, fixture.cookie)).status, 303, "예산 저장도 리다이렉트로 끝난다");
}

// ---------------------------------------------------------------------------
// 2. 세션이 풀린 채로 저장하면
// ---------------------------------------------------------------------------
{
  const before = fixture.db.transactions.length;
  const bounced = await post("/admin/transactions", entry, "ab_user=expired-token");
  eq(bounced.status, 303, "세션이 풀린 저장도 리다이렉트로 끝난다");
  eq(fixture.db.transactions.length, before, "세션이 풀렸으면 아무것도 저장되지 않는다");

  const location = String(bounced.headers.get("location") || "");
  ok(location.startsWith("/my?return_to="), "예전 관리자 화면이 아니라 로그인으로 보낸다");
  ok(!location.startsWith("/?legacy=1"), "일반 사용자를 관리자 화면으로 던지지 않는다");

  const carried = decodeURIComponent(location.slice("/my?return_to=".length));
  ok(carried.startsWith("/app?"), "쓰던 화면으로 돌아갈 주소를 지닌다");
  ok(carried.includes("quick=1"), "돌아가면 입력 시트가 다시 열린다");
  const readable = decodeURIComponent(carried.replace(/\+/g, "%20"));
  ok(readable.includes("로그인이 풀려서"), "왜 저장되지 않았는지 알려준다");
  ok(!/amount=7200|memo=%EC%84%B8%EC%85%98/.test(carried), "적어 둔 내용은 주소에 실리지 않는다");

  // 로그인 화면이 그 주소를 폼에 실어야 로그인 뒤 돌아올 수 있다.
  const loginHtml = await (await app.fetch(new Request(`${ORIGIN}${location}`, { headers: { "user-agent": "Mozilla/5.0" } }), fixture.env, {})).text();
  const field = loginHtml.match(/name="return_to"\s+value="([^"]*)"/);
  ok(field, "로그인 화면이 돌아갈 주소를 폼에 싣는다");
  ok(String(field[1]).replace(/&amp;/g, "&").startsWith("/app?"), "폼이 지닌 주소가 쓰던 화면이다");
}

// ---------------------------------------------------------------------------
// 3. 로그인하면 쓰던 화면으로 돌아오는가
// ---------------------------------------------------------------------------
{
  const credentials = { login_name: "복귀시험", access_code: "pw123456789" };
  eq((await post("/my/local-signup", { ...credentials, display_name: "복귀씨", access_code_confirm: credentials.access_code })).status, 303, "시험용 계정을 만든다");

  const back = `${homeReturn}&err=${encodeURIComponent("로그인이 풀려서 저장하지 못했습니다.")}&quick=1`;
  const signedIn = await post("/my/local-login", { ...credentials, return_to: back });
  const target = String(signedIn.headers.get("location") || "");
  ok(target.startsWith("/app?"), "로그인하면 쓰던 화면으로 돌아온다");
  ok(target.includes("quick=1"), "돌아온 화면에서 입력 시트가 열린다");

  // 돌아갈 주소는 남이 정해 준 곳으로 갈 수 없어야 한다.
  for (const [label, evil] of [
    ["외부 주소", "https://evil.example/steal"],
    ["스킴 없는 외부 주소", "//evil.example/steal"],
    ["관리자 경로", "/admin/secret"],
    ["줄바꿈 섞기", "/app\r\nSet-Cookie: a=b"],
  ]) {
    const blocked = await post("/my/local-login", { ...credentials, return_to: evil });
    eq(String(blocked.headers.get("location") || ""), "/my", `${label}로는 돌려보내지 않는다`);
  }

  // 비밀번호를 틀려도 돌아갈 주소를 잃으면 안 된다.
  const retry = await post("/my/local-login", { login_name: "복귀시험", access_code: "wrongpassword", return_to: back });
  eq(retry.status, 401, "비밀번호가 틀리면 다시 묻는다");
  const retryHtml = await retry.text();
  const retryField = retryHtml.match(/name="return_to"\s+value="([^"]*)"/);
  ok(retryField && String(retryField[1]).replace(/&amp;/g, "&").startsWith("/app?"), "다시 묻는 화면도 돌아갈 주소를 지닌다");
}

// ---------------------------------------------------------------------------
// 4. 소스 수준 고정
// ---------------------------------------------------------------------------
ok(source.includes("function signedOutWriteRedirect(form)"), "세션이 풀린 쓰기의 돌아갈 곳이 한 곳에서 정해진다");
ok(source.includes("return redirectResponse(signedOutWriteRedirect(form));"), "거래 쓰기가 그 규칙을 쓴다");
eq(source.split("return redirectResponse(signedOutWriteRedirect(form));").length - 1, 3, "거래 추가·삭제·수정 세 곳 모두 적용됐다");
ok(source.includes('const loginReturnTo = safeUserReturnPath(String(form.get("return_to") || ""), "");'), "로그인이 돌아갈 주소를 안전하게 읽는다");
ok(source.includes('let location = loginReturnTo || "/my";'), "로그인 성공 시 그 주소로 돌아간다");

await fixture.cleanup?.();
console.log(`PASS: V22.8.77 interrupted save recovery (${checks} checks)`);
