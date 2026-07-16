import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const fixture = await createV2265QaFixture();
fixture.env.ADMIN_PASSWORD = "old-admin";
fixture.env.ADMIN_API_TOKEN = "qa-admin-api-v2281";
fixture.env.ADMIN_SESSION_SECRET = "qa-admin-session-v2281";

async function request(path, options = {}) {
  const cookie = options.cookie === undefined ? fixture.cookie : options.cookie;
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, {
    ...options,
    redirect: "manual",
    headers: { ...(cookie ? { cookie } : {}), ...(options.headers || {}) },
  }), fixture.env, {});
}

async function post(path, entries, options = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, String(value));
  return request(path, {
    ...options,
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", ...(options.headers || {}) },
    body,
  });
}

function responseCookie(response, name) {
  const header = String(response.headers.get("set-cookie") || "");
  const match = header.match(new RegExp(`(?:^|,\\s*)(${name}=[^;]+)`));
  return match?.[1] || "";
}

const editEntries = (userId) => [
  ["id", "tx-expense-2"],
  ["household_id", "house-home"],
  ["month", "2026-07"],
  ["type", "expense"],
  ["transaction_date", "2026-07-07"],
  ["amount", "72000"],
  ["category", "교통"],
  ["memo", "주유"],
  ["payment_method", "현대카드"],
  ["user_id", userId],
  ["return_to", "/app?month=2026-07&household_id=house-home&feed=all#feed"],
];

try {
  const health = await (await request("/health")).json();
  eq(health.version, "V22.8.1-GUIDED-UIUX-FULL-OVERHAUL", "health exposes V22.8.1");
  eq(health.mode, "asset-dashboard-complete-stability", "health preserves the stable asset mode");
  eq(health.integrity, "auth-atomicity-spender-audit", "current auth and spender integrity remains active");

  let response = await request("/settings", { cookie: "" });
  eq(response.status, 401, "security settings ask for authentication without redirecting to home");
  let html = await response.text();
  ok(html.includes('name="return_to" value="/settings"'), "security login retains the requested settings path");
  ok(!response.headers.get("location"), "security settings do not issue a root redirect before authentication");

  const requestedRoute = "/settings?panel=security#password";
  response = await post("/login", [["password", "wrong"], ["return_to", requestedRoute]], { cookie: "" });
  eq(response.status, 401, "an invalid password stays on the authentication form");
  html = await response.text();
  ok(html.includes("비밀번호가 맞지 않습니다."), "an invalid password has a Korean explanation");
  ok(html.includes('value="/settings?panel=security#password"'), "an invalid attempt still retains the requested route");

  const adminOptions = { cookie: "", headers: { authorization: `Bearer ${fixture.env.ADMIN_API_TOKEN}` } };
  response = await request(requestedRoute, adminOptions);
  eq(response.status, 200, "the authenticated security route opens directly");
  html = await response.text();
  ok(html.includes("보안 설정") && html.includes("관리자 비밀번호"), "the requested security settings content is present");

  response = await request("/app?month=2026-07&household_id=house-home&feed=all");
  eq(response.status, 200, "the mobile record page opens");
  html = await response.text();
  for (const token of ["지출자 WIFI♥", "지출자 Bin", "수입자 Bin"]) ok(html.includes(token), `record list displays ${token}`);
  ok(html.includes('name="user_id" required'), "manager record editing includes a required spender selector");
  ok(html.includes('<option value="user-wifi"'), "the spender selector contains same-household participants");
  for (const token of ['id="feed"', "빠른 입력", "수정/삭제"]) ok(html.includes(token), `mobile page retains ${token}`);

  response = await request("/ledger?month=2026-07&household_id=house-home", adminOptions);
  if (response.status === 303) response = await request(String(response.headers.get("location") || "/?legacy=1&tab=transactions"), adminOptions);
  eq(response.status, 200, "the desktop record page opens");
  html = await response.text();
  ok(html.includes("수입자·지출자") && html.includes('id="txm_user" required'), "desktop record editing also requires a participant selector");

  response = await post("/admin/update", editEntries("user-wifi"));
  eq(response.status, 303, "the owner can change the spender of an expense");
  eq(fixture.db.transactions.find((row) => row.id === "tx-expense-2")?.user_id, "user-wifi", "the changed spender is persisted");
  ok(String(response.headers.get("location") || "").includes("msg=updated"), "spender edit returns with a completion message");

  response = await post("/admin/update", editEntries("user-outsider"));
  eq(response.status, 303, "an invalid spender is rejected with a safe return");
  eq(fixture.db.transactions.find((row) => row.id === "tx-expense-2")?.user_id, "user-wifi", "an outsider cannot become a spender");
  const invalidSpenderLocation = new URL(String(response.headers.get("location") || ""), "https://ttokttok-accountbook.com");
  ok(invalidSpenderLocation.searchParams.get("err")?.includes("선택한 지출자가 이 가계부의 참여자가 아닙니다."), "invalid spender rejection explains the reason");

  response = await post("/admin/member/nickname", [
    ["household_id", "house-home"],
    ["user_id", "user-wifi"],
    ["nickname", "와이파이"],
    ["return_to", "/my/members?household_id=house-home&month=2026-07"],
  ]);
  eq(response.status, 303, "member name update returns safely");
  response = await request(String(response.headers.get("location") || ""));
  html = await response.text();
  ok(html.includes("참여자 이름을 수정했습니다."), "member name update uses a Korean completion message");
  ok(!html.includes(">member_alias_updated<"), "the raw member update code is not displayed");
  ok(html.includes("표시 이름과 권한으로 구분합니다."), "member cards use human-readable identity guidance");
  ok(!html.includes("사용자키"), "member management does not expose a user key label");

  response = await request("/start-guide?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(!html.includes("좋은 기능은 참고하되"), "the requested start-guide footer phrase is removed");

  response = await request("/settlement-summary?month=2026-07&household_id=house-home&mode=equal");
  html = await response.text();
  ok(!html.includes("<th>사용자ID</th>"), "settlement tables do not expose a user ID column");
  ok(!/<td>\s*user-(?:bin|wifi)\s*<\/td>/.test(html), "settlement rows do not visibly print raw user IDs");

  response = await request("/households", adminOptions);
  html = await response.text();
  ok(!html.includes("<th>사용자키</th>"), "administrator household tables do not expose a user-key column");

  for (const path of ["/meme-lab", "/meme-archive", "/card-benefits"]) {
    response = await request(path);
    eq(response.status, 404, `${path} remains hidden while incomplete`);
  }

  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  for (const token of ["safeAdminReturnPath", "참여자 이름을 수정했습니다.", "선택한 지출자가 이 가계부의 참여자가 아닙니다.", "v8-spender"]) ok(source.includes(token), `source contains ${token}`);
  ok(!source.includes("좋은 기능은 참고하되, 특정 앱의 화면이나 브랜드 표현을 복제하지 않고 우리 서비스 흐름에 맞게 재구성했습니다."), "removed guide copy is absent from source");
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2269_SECURITY_SPENDER_PRIVACY_OK assertions=${assertions}`);
