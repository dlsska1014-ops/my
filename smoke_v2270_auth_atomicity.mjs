import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import app from "./src/index.js";
import { createV2265QaFixture } from "./qa_fixture_v2265.mjs";

let assertions = 0;
const ok = (value, message) => { assert.ok(value, message); assertions += 1; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions += 1; };

const fixture = await createV2265QaFixture();
Object.assign(fixture.env, {
  ADMIN_PASSWORD: "old-admin",
  ADMIN_SESSION_SECRET: "qa-admin-session-v2270-long-secret",
  ADMIN_API_TOKEN: "qa-admin-api-token-v2270",
  MY_IMPORT_TOKEN_SECRET: "qa-import-token-v2270-long-secret",
  FREE_FEATURES_ENABLED: "0",
});
fixture.db.accountbook_user_identities = [];
fixture.db.accountbook_user_security = [];
fixture.db.accountbook_admin_security = [];
fixture.db.accountbook_transaction_audit = [];
fixture.db.accountbook_auth_attempts = [];

const fixtureFetch = globalThis.fetch;
const mutations = [];
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers: { "content-type": "application/json" } });

globalThis.fetch = async (input, init = {}) => {
  const url = new URL(typeof input === "string" ? input : input.url);
  const method = String(init.method || "GET").toUpperCase();
  if (url.hostname === "mock.supabase.co" && ["POST", "PATCH", "PUT", "DELETE"].includes(method)) {
    mutations.push({ method, path: url.pathname, body: String(init.body || "") });
  }
  const rpc = url.pathname.match(/\/rest\/v1\/rpc\/([^/]+)$/)?.[1] || "";
  if (!rpc) return fixtureFetch(input, init);
  const body = init.body ? JSON.parse(String(init.body)) : {};
  if (rpc === "accountbook_auth_attempt") return json({ allowed: true, attempts: body.p_success ? 0 : 1, blocked_until: null });
  if (rpc === "accountbook_set_local_identity_v227") {
    const index = fixture.db.accountbook_user_identities.findIndex((row) => row.provider === "local" && row.user_id === body.p_user_id);
    const identity = {
      user_id: body.p_user_id,
      provider: "local",
      provider_subject: String(body.p_login_name || "").toLowerCase(),
      login_name: body.p_login_name,
      credential_hash: body.p_credential_hash,
      credential_salt: body.p_credential_salt,
      credential_iterations: body.p_credential_iterations,
      credential_version: 2,
    };
    if (index >= 0) fixture.db.accountbook_user_identities[index] = identity;
    else fixture.db.accountbook_user_identities.push(identity);
    let security = fixture.db.accountbook_user_security.find((row) => row.user_id === body.p_user_id);
    if (!security) {
      security = { user_id: body.p_user_id, session_version: 1 };
      fixture.db.accountbook_user_security.push(security);
    }
    if (body.p_revoke_sessions !== false) security.session_version += 1;
    return json({ saved: true, session_version: security.session_version, login_name: identity.provider_subject });
  }
  if (rpc === "accountbook_update_transaction_v227") {
    const row = fixture.db.transactions.find((item) => item.id === body.p_transaction_id && item.household_id === body.p_household_id);
    if (!row) return json({ message: "transaction_not_found" }, 404);
    const before = structuredClone(row);
    Object.assign(row, body.p_patch || {});
    fixture.db.accountbook_transaction_audit.push({ transaction_id: row.id, household_id: row.household_id, action: "update", before_value: before, after_value: structuredClone(row) });
    return json(row);
  }
  if (rpc === "accountbook_delete_transaction_v227") {
    const index = fixture.db.transactions.findIndex((item) => item.id === body.p_transaction_id && item.household_id === body.p_household_id);
    if (index < 0) return json({ message: "transaction_not_found" }, 404);
    const [row] = fixture.db.transactions.splice(index, 1);
    fixture.db.accountbook_transaction_audit.push({ transaction_id: row.id, household_id: row.household_id, action: "delete", before_value: row });
    return json({ deleted: true, id: row.id });
  }
  if (rpc === "accountbook_import_transactions_v227") {
    let inserted = 0;
    let duplicates = 0;
    for (const row of body.p_rows || []) {
      if (fixture.db.transactions.some((item) => item.id === row.id)) duplicates += 1;
      else { fixture.db.transactions.push(structuredClone(row)); inserted += 1; }
    }
    return json({ inserted, duplicates });
  }
  if (rpc === "accountbook_replace_budget_plan_v227") {
    fixture.db.accountbook_budgets = fixture.db.accountbook_budgets.filter((row) => row.household_id !== body.p_household_id || row.month !== body.p_month);
    for (const row of body.p_rows || []) fixture.db.accountbook_budgets.push({ id: crypto.randomUUID(), household_id: body.p_household_id, month: body.p_month, ...row });
    return json({ saved: (body.p_rows || []).length });
  }
  if (rpc === "accountbook_apply_recurring_v227") return json({ inserted: 0 });
  if (rpc === "accountbook_leave_household_v227") {
    const before = fixture.db.household_members.length;
    fixture.db.household_members = fixture.db.household_members.filter((row) => row.household_id !== body.p_household_id || row.user_id !== body.p_user_id);
    return json({ left: fixture.db.household_members.length < before, deleted_memberships: before - fixture.db.household_members.length });
  }
  if (rpc === "accountbook_purge_household_v227") return json({ deleted: true, transactions: 0, members: 0 });
  if (rpc === "accountbook_merge_users_v227") return json({ merged: true, transactions: 0 });
  if (rpc === "accountbook_link_kakao_identity_v227") return json({ linked: true });
  if (rpc === "accountbook_create_local_user_v227") return json({ id: crypto.randomUUID(), nickname: body.p_nickname, kakao_user_key: "local_account:test" });
  if (rpc === "accountbook_bulk_transactions_v227") return json({ processed: (body.p_transaction_ids || []).length, deleted: !!body.p_delete });
  return fixtureFetch(input, init);
};

let userCookie = fixture.cookie;
async function request(path, options = {}, env = fixture.env) {
  const cookie = options.cookie === undefined ? userCookie : options.cookie;
  const headers = new Headers(options.headers || {});
  if (cookie) headers.set("cookie", cookie);
  if (["POST", "PATCH", "PUT", "DELETE"].includes(String(options.method || "GET").toUpperCase()) && !headers.has("origin")) {
    headers.set("origin", "https://ttokttok-accountbook.com");
  }
  return app.fetch(new Request(`https://ttokttok-accountbook.com${path}`, { ...options, headers, redirect: "manual" }), env, {});
}

async function post(path, entries = [], options = {}) {
  const body = new URLSearchParams();
  for (const [key, value] of entries) body.append(key, String(value));
  return request(path, { ...options, method: "POST", headers: { "content-type": "application/x-www-form-urlencoded", ...(options.headers || {}) }, body });
}

function responseCookie(response, name) {
  const raw = String(response.headers.get("set-cookie") || "");
  return raw.match(new RegExp(`(?:^|,\\s*)(${name}=[^;]+)`))?.[1] || "";
}

try {
  let response = await request("/health", { cookie: "" });
  let payload = await response.json();
  eq(payload.version, "V22.8.6-RECEIPT-SCREEN-OPTIMIZATION", "health exposes V22.8.2");
  eq(payload.mode, "asset-dashboard-complete-stability", "health preserves the stable asset mode");
  eq(payload.ready, true, "health is ready with all required configuration");

  response = await request("/ready", { cookie: "" });
  eq(response.status, 200, "readiness verifies required tables");
  payload = await response.json();
  eq(payload.ready, true, "readiness succeeds");

  response = await request("/ready", { cookie: "" }, {});
  eq(response.status, 503, "readiness fails closed without required configuration");
  payload = await response.json();
  ok(Number(payload.missing_count) > 0 && !Object.hasOwn(payload, "missing"), "readiness does not expose secret names");

  response = await request("/my/household/delete", { method: "POST", cookie: "", headers: { origin: "https://evil.example", "sec-fetch-site": "cross-site" }, body: new URLSearchParams() });
  eq(response.status, 403, "cross-site writes are rejected before authentication or storage");

  response = await request("/settings", { cookie: "" });
  eq(response.status, 401, "security settings stay on an authentication screen");
  let html = await response.text();
  ok(html.includes('name="return_to" value="/settings"'), "security login preserves the requested route");
  ok(!response.headers.get("location"), "security settings do not bounce to the site root");

  const exactSecurityRoute = "/settings?panel=security#password";
  response = await post("/login", [["password", "wrong"], ["return_to", exactSecurityRoute]], { cookie: "" });
  eq(response.status, 401, "wrong administrator password remains on the login form");
  html = await response.text();
  ok(html.includes("비밀번호가 맞지 않습니다.") && html.includes(exactSecurityRoute.replaceAll("&", "&amp;")), "wrong-password guidance remains Korean and preserves context");

  response = await post("/login", [["password", "old-admin"], ["return_to", exactSecurityRoute]], { cookie: "" });
  eq(response.status, 303, "administrator login succeeds");
  eq(response.headers.get("location"), exactSecurityRoute, "administrator login returns to the exact security route");
  let adminCookie = responseCookie(response, "ab_admin");
  ok(adminCookie.startsWith("ab_admin="), "administrator login issues a secure session");
  response = await request(exactSecurityRoute, { cookie: adminCookie });
  eq(response.status, 200, "authenticated security settings open directly");
  html = await response.text();
  ok(html.includes("보안 설정") && html.includes("관리자 비밀번호"), "security settings content is present");

  response = await post("/admin/settings/password", [["current_password", "old-admin"], ["new_password", "new-admin-77"], ["confirm_password", "new-admin-77"]], { cookie: adminCookie });
  eq(response.status, 303, "administrator password change completes");
  eq(response.headers.get("location"), "/settings?msg=password_updated", "password change stays in security settings");
  adminCookie = responseCookie(response, "ab_admin");
  response = await request("/settings?msg=password_updated", { cookie: adminCookie });
  html = await response.text();
  ok(html.includes("관리자 비밀번호를 변경했습니다. 보안 설정 화면을 그대로 유지했습니다."), "password completion message is Korean and keeps the route");

  const usersBeforeWrongLogin = fixture.db.users.length;
  response = await post("/my/local-login", [["login_name", "없는사용자"], ["access_code", "wrong-password"]], { cookie: "" });
  eq(response.status, 401, "unknown local login is rejected");
  eq(fixture.db.users.length, usersBeforeWrongLogin, "wrong login never creates an account");

  const personalReturn = "/my/households?month=2026-07&household_id=house-home&manage=house-home#manage";
  response = await post("/my/backup-login", [["login_name", "Bin로그인"], ["access_code", "secret-227"], ["access_code_confirm", "secret-227"], ["return_to", personalReturn]]);
  eq(response.status, 303, "personal password setup succeeds");
  ok(String(response.headers.get("location") || "").startsWith("/my/households?"), "personal password returns to household settings");
  ok(String(response.headers.get("location") || "").endsWith("#manage"), "personal password preserves the section anchor");
  ok(response.headers.get("location") !== "/", "personal password never redirects to the site root");
  userCookie = responseCookie(response, "ab_user");
  ok(userCookie.startsWith("ab_user="), "password change refreshes the user session");

  response = await request("/app?month=2026-07&household_id=house-home&feed=all");
  eq(response.status, 200, "mobile home renders");
  html = await response.text();
  for (const token of ["지출자 WIFI♥", "지출자 Bin", 'name="user_id"']) ok(html.includes(token), `mobile records include ${token}`);
  ok(!/<footer\b[^>]*class=["'][^"']*abBusinessFooter/i.test(html), "authenticated app does not place a business footer above the fixed nav");

  response = await post("/my/update", [["id", "tx-expense-2"], ["household_id", "house-home"], ["month", "2026-07"], ["type", "expense"], ["transaction_date", "2026-07-07"], ["amount", "72000"], ["category", "교통"], ["memo", "주유"], ["payment_method", "현대카드"], ["user_id", "user-wifi"]]);
  eq(response.status, 303, "expense spender can be edited");
  eq(fixture.db.transactions.find((row) => row.id === "tx-expense-2")?.user_id, "user-wifi", "edited spender is persisted atomically");
  ok(fixture.db.accountbook_transaction_audit.some((row) => row.transaction_id === "tx-expense-2" && row.action === "update"), "spender edit creates an audit record");

  const importSpenderId = "514bfce1-7de6-4bf6-8ff2-86c7c6361b91";
  fixture.db.users.push({ id: importSpenderId, nickname: "옮김담당", kakao_user_key: "qa-import-spender", created_at: "2026-07-01T00:00:00Z" });
  fixture.db.household_members.push({ household_id: "house-home", user_id: importSpenderId, role: "member", created_at: "2026-07-01T00:00:00Z" });
  const importBefore = fixture.db.transactions.length;
  response = await post("/my/import", [
    ["import_action", "preview"],
    ["household_id", "house-home"],
    ["month", "2026-07"],
    ["skip_duplicates", "1"],
    ["csv_text", "승인일,입출금구분,승인금액,대분류,가맹점명,카드명,결제자\n2026-07-12,출금,19999,문화,회귀시험 연극,국민카드,옮김담당\n어제 간식 6789원 현금"],
  ]);
  eq(response.status, 200, "flexible import preview succeeds without writing");
  html = await response.text();
  eq(fixture.db.transactions.length, importBefore, "import preview never writes transactions");
  ok(html.includes("저장 전 미리보기") && html.includes("결제자"), "import preview explains the recognized mapping");
  const importToken = html.match(/name="import_token" value="([^"]+)"/)?.[1] || "";
  const importRows = [...html.matchAll(/name="selected_rows" value="(\d+)"/g)].map((match) => match[1]);
  ok(importToken && importRows.length >= 2, "table aliases and natural-language rows are both recognized");

  response = await post("/my/import", [["import_action", "commit"], ["import_token", importToken], ["selected_rows", importRows[0]]]);
  eq(response.status, 200, "selected import row is committed atomically");
  html = await response.text();
  eq(fixture.db.transactions.length, importBefore + 1, "only one selected import row is saved");
  const importedRow = fixture.db.transactions.find((row) => Number(row.amount) === 19999 && row.transaction_date === "2026-07-12");
  eq(importedRow?.user_id, importSpenderId, "imported spender alias resolves to the matching household member");
  ok(html.includes("저장 완료") && html.includes("선택한 행"), "import result reports the selected-row outcome");

  response = await request("/my/backup.csv?month=2026-07&household_id=house-home");
  eq(response.status, 200, "household backup CSV downloads");
  const backupCsv = await response.text();
  ok(backupCsv.replace(/^\ufeff/, "").startsWith("날짜,구분,금액,분류,내용,결제수단,지출자,출처,기록ID"), "backup CSV preserves a user-facing spender column");
  ok(backupCsv.includes("WIFI♥") && backupCsv.includes("Bin"), "backup CSV exports spender display names instead of user UUIDs");
  ok(!backupCsv.includes(importSpenderId), "backup CSV does not expose the imported spender UUID");

  response = await post("/my/import", [["import_action", "commit"], ["import_token", importToken], ["selected_rows", importRows[0]]]);
  eq(response.status, 200, "replayed import commit returns a safe result");
  html = await response.text();
  eq(fixture.db.transactions.length, importBefore + 1, "replayed import commit cannot duplicate the row");
  ok(html.includes("중복 제외"), "replayed import is explained as a duplicate");

  response = await post("/my/budget-bulk/save", [
    ["household_id", "house-home"], ["month", "2026-07"], ["budget_return", "budgets"],
    ["income_name", "급여"], ["income_amount", "3500000"],
    ["income_name", "부수입"], ["income_amount", "250000"],
    ["budget_category", "식비"], ["budget_amount", "550000"],
    ["budget_category", "교통"], ["budget_amount", "180000"],
  ]);
  eq(response.status, 303, "income and category budget plan saves atomically");
  ok(String(response.headers.get("location") || "").includes("msg=budget_saved"), "budget save returns to the originating budget screen");
  const savedBudgetRows = fixture.db.accountbook_budgets.filter((row) => row.household_id === "house-home" && row.month === "2026-07");
  eq(savedBudgetRows.length, 4, "atomic budget replacement stores only the submitted non-zero rows");
  ok(savedBudgetRows.some((row) => row.category === "__income:급여" && Number(row.amount) === 3500000), "income plan is stored by income category");
  ok(savedBudgetRows.some((row) => row.category === "식비" && Number(row.amount) === 550000), "expense plan is stored by expense category");

  response = await post("/admin/recurring/apply", [["household_id", "house-home"], ["month", "2026-07"], ["return_to", "/reserve-plans?month=2026-07&household_id=house-home"]]);
  eq(response.status, 303, "recurring application uses the atomic route");
  ok(String(response.headers.get("location") || "").includes("msg="), "recurring application reports its inserted count");

  response = await request("/my/members?month=2026-07&household_id=house-home&msg=member_alias_updated");
  html = await response.text();
  ok(html.includes("참여자 이름을 수정했습니다."), "member-name completion is shown in Korean");
  ok(!html.includes(">member_alias_updated<"), "raw member-name status code is hidden");

  response = await request("/menu?month=2026-07&household_id=house-home");
  html = await response.text();
  for (const label of [">홈<", ">기록<", ">입력<", ">정산<", ">메뉴<"]) ok(html.includes(label), `canonical mobile nav includes ${label}`);
  ok(!html.includes('class="abNavBottom"><a') || !html.includes(">모임<"), "canonical bottom nav no longer replaces Home with Groups");

  response = await request("/smart-tools?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(html.includes("초기 서비스 · 모두 무료") && html.includes("무료로 사용할 수 있는 기능"), "smart tools stay free even when the legacy flag is disabled");
  ok(!html.includes("결제하기") && !html.includes("잠금 해제"), "free smart tools have no paywall action");

  for (const path of ["/meme-lab", "/meme-archive", "/card-benefits", "/meme-card-catalog.json"]) {
    response = await request(path);
    eq(response.status, 404, `${path} remains hidden while incomplete`);
    ok(/noindex/i.test(response.headers.get("x-robots-tag") || ""), `${path} is excluded from indexing`);
  }

  response = await request("/start-guide?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(!html.includes("좋은 기능은 참고하되"), "requested guide footer copy remains removed");
  response = await request("/settlement-summary?month=2026-07&household_id=house-home");
  html = await response.text();
  ok(!html.includes("<th>사용자ID</th>") && !/<td>\s*user-(?:bin|wifi)\s*<\/td>/.test(html), "settlement does not expose raw user IDs");

  const householdName = fixture.db.households.find((row) => row.id === "house-home")?.name || "우리집 가계부";
  const purgeCount = () => mutations.filter((item) => item.path.endsWith("/rpc/accountbook_purge_household_v227")).length;
  const purgeBefore = purgeCount();
  response = await post("/my/household/delete", [["household_id", "house-home"], ["month", "2026-07"], ["confirm_name", `${householdName} 오타`], ["understand_members", "1"], ["access_code", "secret-227"]]);
  eq(response.status, 303, "household deletion rejects a mismatched confirmation name");
  eq(purgeCount(), purgeBefore, "mismatched deletion confirmation never calls the purge RPC");

  response = await post("/my/household/delete", [["household_id", "house-home"], ["month", "2026-07"], ["confirm_name", householdName], ["understand_members", "1"], ["access_code", "secret-227"]]);
  eq(response.status, 303, "owner can complete guarded household deletion");
  eq(response.headers.get("location"), "/my/households?month=2026-07&msg=household_deleted", "successful deletion returns to the household list");
  eq(purgeCount(), purgeBefore + 1, "successful deletion invokes exactly one atomic purge RPC");

  const source = await readFile(new URL("./src/index.js", import.meta.url), "utf8");
  const migration = await readFile(new URL("./schema_v22_7_0_auth_atomicity.sql", import.meta.url), "utf8");
  for (const token of ["fetchPostgrestRows", "supabaseExactCount", "accountbook_leave_household_v227", "accountbook_bulk_transactions_v227", "accountbook_import_transactions_v227", "redactOpsDetail", 'return true;']) ok(source.includes(token), `source contains ${token}`);
  ok(/function premiumBetaEnabled\([^)]*\)\s*\{[\s\S]{0,400}?return true;/.test(source), "completed smart functions are unconditionally free");
  ok(/PBKDF2[\s\S]{0,500}?SHA-256/.test(source), "password hashing uses PBKDF2 SHA-256");
  ok(!/ADMIN_SESSION_SECRET\s*\|\|\s*env\.ADMIN_PASSWORD/.test(source), "administrator sessions have no password-secret fallback");
  ok(!/USER_SESSION_SECRET\s*\|\|/.test(source), "user sessions have no weak secret fallback");
  for (const token of ["accountbook_user_identities", "accountbook_user_security", "accountbook_admin_security", "accountbook_transaction_audit", "accountbook_purge_household_v227", "accountbook_replace_budget_plan_v227", "accountbook_apply_recurring_v227", "accountbook_merge_users_v227", "accountbook_update_transaction_v227", "accountbook_delete_transaction_v227", "accountbook_leave_household_v227"]) ok(migration.includes(token), `migration contains ${token}`);
  eq((migration.match(/create or replace function public\./g) || []).length, (migration.match(/revoke all on function public\./g) || []).length, "every migration function has an explicit revoke");
  eq((migration.match(/create or replace function public\./g) || []).length, (migration.match(/grant execute on function public\./g) || []).length, "every migration function grants only the service role");
  ok(!/grant execute on function[^;]+to\s+(?:public|anon|authenticated)/i.test(migration), "atomic RPCs are not executable by public roles");
  ok(/^begin;/m.test(migration) && /^commit;/m.test(migration), "migration itself is transactional");

  const routeMatches = [...source.matchAll(/url\.pathname === "([^"]+)"\s*&&\s*request\.method === "(POST|PATCH|PUT|DELETE)"/g)];
  const publicMutationEntrypoints = new Set(["/skill", "/login", "/my/local-login", "/my/local-signup"]);
  for (const [, path, method] of routeMatches) {
    if (publicMutationEntrypoints.has(path)) continue;
    const before = mutations.length;
    await request(path, { method, cookie: "", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams() });
    eq(mutations.length, before, `${method} ${path} performs no storage mutation without authentication`);
  }
} finally {
  fixture.restore();
}

console.log(`SMOKE_V2270_AUTH_ATOMICITY_OK assertions=${assertions}`);
