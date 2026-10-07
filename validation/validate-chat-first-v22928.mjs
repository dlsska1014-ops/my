// V22.9.28: trusted chat-first personal provisioning and explicit one-time web access.
// All identities, transactions, credentials and requests below are synthetic in-memory QA.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import app, * as runtime from "../src/index.js";
import { createV2265QaFixture } from "./qa-fixture.mjs";

let checks = 0;
let fixtureNumber = 0;
const ok = (value, message) => { assert.ok(value, message); checks += 1; };
const eq = (actual, expected, message) => { assert.equal(actual, expected, message); checks += 1; };
const BASE = "https://malhaebook.com";
const CLAIM_KEY = "kakao_web_claims_v22928";
const codePattern = /[A-HJ-NP-Z2-9]{8}(?:-[A-HJ-NP-Z2-9]{8}){3}/;
const source = readFileSync(new URL("../src/index.js", import.meta.url), "utf8");
const setting = (f, key) => f.db.accountbook_settings.find((row) => row.key === key);
const put = (f, key, value) => {
  const row = setting(f, key);
  if (row) row.value = value;
  else f.db.accountbook_settings.push({ key, value });
};
const marker = (f) => f.db.accountbook_settings.find((row) => row.key.startsWith("kakao_first_record_v22928:"));
const done = (f) => f.db.accountbook_settings.find((row) => row.key.startsWith("kakao_first_record_done_v22928:"));
const textOf = (body) => body.template?.outputs?.map((output) => output.simpleText?.text || "").join("\n") || "";

async function withFixture(test) {
  const f = await createV2265QaFixture();
  f.env.KAKAO_SKILL_SECRET = "synthetic-v28-skill-secret-not-production";
  f.key = `qa-v28-chat-first-${++fixtureNumber}`;
  f.agent = `v28-in-memory-qa-${fixtureNumber}`;
  try { await test(f); } finally { f.restore(); }
}
async function skill(f, utterance, { key = f.key, properties = {}, group = "", auth = true, type = "botUserKey" } = {}) {
  const user = { id: key, type, properties: { ...properties, ...(group ? { botGroupKey: group } : {}) } };
  const headers = { "content-type": "application/json", "user-agent": f.agent };
  if (auth) headers["x-kakao-skill-secret"] = f.env.KAKAO_SKILL_SECRET;
  const response = await app.fetch(new Request(`${BASE}/skill`, { method: "POST", headers, body: JSON.stringify({ userRequest: { utterance, user } }) }), f.env, { waitUntil() {} });
  return { response, body: await response.json() };
}
async function web(f, method, path, { code = "", cookie = "", extra = {}, origin = BASE } = {}) {
  const headers = { accept: "text/html", "user-agent": f.agent };
  if (cookie) headers.cookie = cookie;
  const body = method === "POST" ? new URLSearchParams({ kakao_claim_code: code, ...extra }) : undefined;
  if (body) Object.assign(headers, { "content-type": "application/x-www-form-urlencoded", origin, "sec-fetch-site": origin === BASE ? "same-origin" : "cross-site" });
  return app.fetch(new Request(BASE + path, { method, headers, body }), f.env, { waitUntil() {} });
}
async function issue(f) {
  const result = await skill(f, "웹 가계부 열기");
  const text = textOf(result.body);
  const code = text.match(codePattern)?.[0] || "";
  ok(code, "private trusted existing user receives an opaque code");
  eq((text.match(/https:\/\//g) || []).length, 1, "private link contains exactly one URL");
  ok(text.includes(`${BASE}/my`) && !text.includes("household_id="), "private URL stays generic /my");
  return code;
}
const cookieFrom = (response) => response.headers.get("set-cookie")?.split(";")[0] || "";
const userFromCookie = (cookie) => decodeURIComponent(cookie.slice(cookie.indexOf("=") + 1)).split("|")[0];

ok(source.includes("trustedChatFirstSkillCaller(request, env)"), "new flows require an actual configured-secret match");
ok(source.includes("kakao_first_record_done_v22928:"), "completion tombstone is separate from pending state");
ok(source.includes("kakao-web-claim-used:${hash}"), "one-time redemption has a per-code database lease");
ok(source.includes("Deliberately do not release the use lease"), "used credential lease is retained through expiry");
ok(source.includes("Date.parse(record.expires_at) <= Date.now()"), "expiry is checked at redemption");
ok(source.includes('return await handleMyKakaoClaim(request, env)'), "new POST handler is awaited by the router");

// Brand-new trusted identities can save a first record without a web account or cookie.
for (const variant of ["bot-id", "bot-property", "app-only"]) {
  await withFixture(async (f) => {
    const before = { users: f.db.users.length, households: f.db.households.length, tx: f.db.transactions.length };
    const props = variant === "bot-property" ? { botUserKey: f.key } : variant === "app-only" ? { appUserId: `${f.key}-app` } : {};
    const result = await skill(f, "@챗봇 점심 만원", { properties: props, ...(variant === "app-only" ? { key: "", type: "appUserId" } : {}) });
    eq(result.response.status, 200, `${variant}: Skill succeeds`);
    eq(f.db.users.length - before.users, 1, `${variant}: one user`);
    eq(f.db.households.length - before.households, 1, `${variant}: one personal household`);
    eq(f.db.transactions.length - before.tx, 1, `${variant}: one saved record`);
    const tx = f.db.transactions.at(-1);
    eq(tx.amount, 10000, `${variant}: spoken ten thousand amount`);
    eq(tx.memo, "점심", `${variant}: mention is not part of the memo`);
    eq(f.db.household_members.find((row) => row.household_id === tx.household_id && row.user_id === tx.user_id)?.role, "owner", `${variant}: actor owns personal household`);
    eq(JSON.parse(marker(f).value).state, "complete", `${variant}: complete state persisted`);
    ok(done(f) && !done(f).value.includes(tx.household_id), `${variant}: durable completion contains no household reference`);
    ok(!JSON.parse(marker(f).value).candidate_id, `${variant}: pending household reference removed`);
    ok(textOf(result.body).includes("웹 로그인 없이"), `${variant}: optional-web guidance`);
    ok(!result.response.headers.has("set-cookie"), `${variant}: Skill does not create web cookies`);
    if (variant === "app-only") {
      const aliases = JSON.parse(setting(f, "user_identity_links").value);
      eq(aliases[`kakao_login:${f.key}-app`]?.user_id, tx.user_id, "OAuth subject alias stays on the bot-created user");
    }
  });
}

await withFixture(async (f) => {
  const before = f.db.households.length;
  await skill(f, "시작");
  eq(f.db.households.length, before, "start prepares identity but creates no household");
  eq(JSON.parse(marker(f).value).state, "pending", "first-use eligibility survives an earlier start command");
  await skill(f, "점심 만원");
  eq(f.db.households.length, before + 1, "first record after start is automatic");
});

await withFixture(async (f) => {
  const before = { users: f.db.users.length, households: f.db.households.length, tx: f.db.transactions.length };
  const unauthorized = await skill(f, "점심 만원", { auth: false });
  eq(unauthorized.response.status, 403, "missing caller secret is rejected");
  eq(f.db.users.length, before.users, "unauthenticated payload creates no user");
  eq(f.db.households.length, before.households, "unauthenticated payload creates no household");
  eq(f.db.transactions.length, before.tx, "unauthenticated payload writes no record");
  f.env.KAKAO_SKILL_AUTH_MODE = "observe";
  await skill(f, "점심 만원", { key: `${f.key}-observe`, auth: false });
  eq(f.db.households.length, before.households, "observe mode still cannot grant new automatic provisioning");
  const legacy = await skill(f, "점심 만원", { key: "", type: "plusfriendUserKey", properties: { plusfriendUserKey: `${f.key}-legacy` } });
  eq(legacy.response.status, 200, "legacy identifier keeps ordinary compatibility");
  eq(f.db.households.length, before.households, "legacy-only identifier cannot seed a new automatic household");
});

await withFixture(async (f) => {
  const before = f.db.households.length;
  const grouped = await skill(f, "점심 만원", { group: `${f.key}-unbound-group` });
  eq(f.db.households.length, before, "unbound group creates no personal/shared household");
  ok(!grouped.body.template?.quickReplies, "group response contains no QuickReplies");
  const link = await skill(f, "웹 가계부 열기", { group: `${f.key}-unbound-group` });
  ok(!codePattern.test(textOf(link.body)), "group response never exposes a web credential");
  ok(!setting(f, CLAIM_KEY), "group link does not issue a credential");
});

// A returning identity, even with zero memberships, is not first use.
await withFixture(async (f) => {
  f.db.users.push({ id: `${f.key}-returning`, kakao_user_key: f.key, nickname: "Synthetic returning user" });
  const before = f.db.households.length;
  await skill(f, "점심 만원");
  eq(f.db.households.length, before, "returning zero-household user is not reprovisioned");
  ok(!marker(f), "existing identity does not receive a new first-use marker");
});
for (const role of ["viewer", "pending", "blocked"]) {
  await withFixture(async (f) => {
    const id = `${f.key}-role`;
    f.db.users.push({ id, kakao_user_key: f.key, nickname: "Synthetic restricted user" });
    f.db.household_members.push({ household_id: "house-home", user_id: id, role });
    put(f, `kakao_selected_household_v2251:${id}`, "house-home");
    const before = { households: f.db.households.length, tx: f.db.transactions.length };
    await skill(f, "점심 만원");
    eq(f.db.households.length, before.households, `${role}: no personal fallback`);
    eq(f.db.transactions.length, before.tx, `${role}: no transaction write`);
  });
}

await withFixture(async (f) => {
  const before = f.db.households.length;
  const replies = await Promise.all([skill(f, "점심 만원"), skill(f, "커피 오천원")]);
  eq(f.db.households.length, before + 1, "concurrent first messages create one personal household");
  eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 2, "different concurrent records are both retained");
  ok(replies.every((reply) => textOf(reply.body).includes("저장했어요")), "both concurrent replies confirm persisted records");
  await skill(f, "점심 만원");
  eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 2, "same-delivery replay adds no record");
});

// Failure recovery reuses the server-generated candidate rather than creating another ledger.
for (const failure of ["membership", "transaction", "network-after-commit", "aliases"]) {
  await withFixture(async (f) => {
    const original = globalThis.fetch;
    let failed = false;
    const postedHouseholds = [];
    globalThis.fetch = async (url, init = {}) => {
      const parsed = new URL(String(url));
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const method = String(init.method || "GET");
      if (method === "POST" && parsed.pathname === "/rest/v1/households") postedHouseholds.push(body.id);
      const target = failure === "membership" ? parsed.pathname === "/rest/v1/household_members" :
        failure === "aliases" ? parsed.pathname === "/rest/v1/accountbook_settings" && body.key === "user_identity_links" : parsed.pathname === "/rest/v1/transactions";
      if (!failed && method === "POST" && target) {
        failed = true;
        if (failure === "network-after-commit") { await original(url, init); throw new TypeError("Synthetic network lost after commit"); }
        return new Response("Synthetic QA storage failure", { status: 503 });
      }
      return original(url, init);
    };
    const before = f.db.households.length;
    const first = await skill(f, "점심 만원");
    ok(!textOf(first.body).includes("저장했어요"), `${failure}: failure never falsely claims save success`);
    if (failure === "membership") eq(f.db.households.length, before, "failed owner assignment compensates orphan household");
    globalThis.fetch = original;
    await skill(f, "점심 만원");
    eq(f.db.households.length, before + 1, `${failure}: retry leaves one personal household`);
    eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 1, `${failure}: retry saves exactly once`);
    eq(JSON.parse(marker(f).value).state, "complete", `${failure}: retry completes the original preparation`);
    if (postedHouseholds.length > 1) eq(new Set(postedHouseholds).size, 1, "creation retries use one stable candidate UUID");
  });
}

await withFixture(async (f) => {
  await skill(f, "점심 만원");
  const tx = f.db.transactions.find((row) => row.source_user_key === f.key);
  f.db.household_members = f.db.household_members.filter((row) => row.household_id !== tx.household_id);
  f.db.households = f.db.households.filter((row) => row.id !== tx.household_id);
  put(f, `kakao_selected_household_v2251:${tx.user_id}`, "");
  // Simulate a late pending JSON write after a completed ledger has been deleted.
  marker(f).value = JSON.stringify({ version: 1, state: "pending", user_id: tx.user_id, candidate_id: tx.household_id, created_at: new Date().toISOString() });
  const before = f.db.households.length;
  await skill(f, "택시 만원");
  eq(f.db.households.length, before, "completion tombstone blocks resurrection/reprovision after deletion");
  eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 1, "deleted context receives no fallback write");
});

// Explicit private credential reaches the same UUID and never merges another web account.
await withFixture(async (f) => {
  await skill(f, "점심 만원");
  const tx = f.db.transactions.find((row) => row.source_user_key === f.key);
  const code = await issue(f);
  const savedMap = setting(f, CLAIM_KEY).value;
  ok(!savedMap.includes(code.replaceAll("-", "")), "storage contains hashes, not plaintext credentials");
  const before = { users: f.db.users.length, households: f.db.households.length, tx: f.db.transactions.length };
  const first = await web(f, "POST", "/my/kakao-claim", { code, cookie: f.cookie, extra: { user_id: "user-other", household_id: "house-other", return_to: "/my/settings" } });
  eq(first.status, 303, "one-time credential authenticates");
  eq(first.headers.get("location"), "/my/settings", "safe return_to preserved");
  eq(userFromCookie(cookieFrom(first)), tx.user_id, "session targets the original bot user despite forged IDs/current other session");
  ok(/HttpOnly; Secure; SameSite=Lax/.test(first.headers.get("set-cookie") || ""), "normal signed-session cookie flags preserved");
  ok((first.headers.get("set-cookie") || "").includes("ab_hh=;"), "another account's household cookie is cleared");
  eq(f.db.users.length, before.users, "claim creates no second user");
  eq(f.db.households.length, before.households, "claim creates no household");
  eq(f.db.transactions.length, before.tx, "claim writes no transaction");
  const replay = await web(f, "POST", "/my/kakao-claim", { code });
  eq(replay.status, 401, "used credential is rejected");
  ok(!replay.headers.has("set-cookie"), "replay sets no session");
  // Simulate a late global JSON write restoring the consumed hash.
  put(f, CLAIM_KEY, savedMap);
  const resurrected = await web(f, "POST", "/my/kakao-claim", { code });
  eq(resurrected.status, 401, "atomic per-code used lease blocks resurrected credential");
  ok(!resurrected.headers.has("set-cookie"), "resurrected credential sets no session");
  const usedLocks = f.db.accountbook_operation_locks.filter((row) => row.operation_key.startsWith("kakao-web-claim-used:"));
  eq(usedLocks.length, 1, "one credential has one retained use lock");
  ok(Date.parse(usedLocks[0].locked_until) > Date.parse(Object.values(JSON.parse(savedMap))[0].expires_at), "use lock outlives the credential");
  const page = await web(f, "GET", "/my/kakao-claim", { cookie: f.cookie });
  const html = await page.text();
  eq(page.status, 200, "explicit claim entry remains available while another account is logged in");
  ok(html.includes('id="kakao-claim-start" open'), "claim entry opens its input");
  ok(!page.headers.has("set-cookie"), "claim GET never creates a session");
});

for (const scenario of ["expired", "cross-site", "reissued", "malformed-store"]) {
  await withFixture(async (f) => {
    await skill(f, "점심 만원");
    const code = await issue(f);
    if (scenario === "expired") {
      const claims = JSON.parse(setting(f, CLAIM_KEY).value);
      for (const record of Object.values(claims)) record.expires_at = new Date(Date.now() - 1000).toISOString();
      put(f, CLAIM_KEY, JSON.stringify(claims));
    }
    if (scenario === "reissued") await issue(f);
    if (scenario === "malformed-store") put(f, CLAIM_KEY, "{broken");
    const response = await web(f, "POST", "/my/kakao-claim", { code, ...(scenario === "cross-site" ? { origin: "https://not-the-service.invalid" } : {}) });
    eq(response.status, scenario === "cross-site" ? 403 : scenario === "malformed-store" ? 503 : 401, `${scenario}: fails closed`);
    ok(!response.headers.has("set-cookie"), `${scenario}: no session cookie`);
    if (scenario === "malformed-store") eq(setting(f, CLAIM_KEY).value, "{broken", "corrupt claim JSON is not replaced");
    if (scenario !== "cross-site") {
      const html = await response.text();
      eq((html.match(/role="alert"/g) || []).length, 1, `${scenario}: one error alert`);
      ok(html.includes('href="#kakaoClaimCode"') && html.includes('id="kakaoClaimCode"'), `${scenario}: error targets focusable code input`);
    }
  });
}

// Explicit household use consumes first-use eligibility, even before an auto record.
for (const manual of ["create", "join"]) {
  await withFixture(async (f) => {
    await skill(f, "시작");
    const userId = JSON.parse(marker(f).value).user_id;
    let householdId = "";
    if (manual === "create") householdId = (await runtime.createUserHousehold(f.env, userId, "Synthetic manual ledger", "Synthetic actor")).id;
    else {
      householdId = f.db.households[0].id;
      await skill(f, `참여 ${f.db.households[0].invite_code}`);
    }
    ok(setting(f, `kakao_first_record_history_v22928:${userId}`), `${manual}: explicit use has a durable history marker`);
    f.db.household_members = f.db.household_members.filter((row) => row.user_id !== userId);
    if (manual === "create") f.db.households = f.db.households.filter((row) => row.id !== householdId);
    put(f, `kakao_selected_household_v2251:${userId}`, "");
    const before = f.db.households.length;
    await skill(f, "점심 만원");
    eq(f.db.households.length, before, `${manual}: leave/delete before an auto record does not recreate a ledger`);
    eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 0, `${manual}: no fallback transaction`);
  });
}

await withFixture(async (f) => {
  await skill(f, "점심 만원");
  const code = await issue(f);
  const oldSnapshot = setting(f, CLAIM_KEY).value;
  await issue(f);
  put(f, CLAIM_KEY, oldSnapshot);
  const staleUnused = await web(f, "POST", "/my/kakao-claim", { code });
  eq(staleUnused.status, 401, "reissue revocation survives restoration of an unused old code");
  ok(!staleUnused.headers.has("set-cookie"), "superseded resurrected code creates no cookie");
});

await withFixture(async (f) => {
  await skill(f, "점심 만원");
  const loginCode = await issue(f);
  const login = await web(f, "POST", "/my/kakao-claim", { code: loginCode });
  const cookie = cookieFrom(login);
  const userId = userFromCookie(cookie);
  const unusedCode = await issue(f);
  const security = f.db.accountbook_user_security.find((row) => row.user_id === userId);
  ok(security, "issuance initializes security before first password setup");
  eq(security.session_version, 1, "new explicit security version is one");
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    if (new URL(String(url)).pathname === "/rest/v1/rpc/accountbook_set_local_identity_v227") {
      const body = JSON.parse(String(init.body));
      eq(body.p_user_id, userId, "backup password remains on the claimed bot user");
      ok(body.p_revoke_sessions, "first password requests revocation");
      security.session_version += 1;
      security.password_changed_at = new Date().toISOString();
      f.db.accountbook_user_identities ||= [];
      f.db.accountbook_user_identities.push({ user_id: userId, provider: "local", provider_subject: body.p_login_name, login_name: body.p_login_name });
      return new Response(JSON.stringify({ saved: true, session_version: security.session_version, login_name: body.p_login_name }), { status: 200, headers: { "content-type": "application/json" } });
    }
    return original(url, init);
  };
  const backup = await web(f, "POST", "/my/backup-login", { cookie, extra: { login_name: `synthetic-${f.key}`, access_code: "SyntheticFixturePassword28", access_code_confirm: "SyntheticFixturePassword28", return_to: "/my" } });
  globalThis.fetch = original;
  eq(backup.status, 303, "first password setup completes through the authenticated route");
  eq(security.session_version, 2, "first password advances explicit security version");
  const revoked = await web(f, "POST", "/my/kakao-claim", { code: unusedCode });
  eq(revoked.status, 401, "first password invalidates an outstanding code");
  ok(!revoked.headers.has("set-cookie"), "password-revoked code creates no cookie");
});

for (const merged of ["marked-row", "redirect-only", "missing-security"]) {
  await withFixture(async (f) => {
    await skill(f, "점심 만원");
    const userId = f.db.transactions.find((row) => row.source_user_key === f.key).user_id;
    const code = await issue(f);
    eq(await runtime.resolveEffectiveUserId(f.env, userId), userId, "pre-merge self mapping is cached");
    if (merged === "marked-row") {
      const user = f.db.users.find((row) => row.id === userId);
      user.kakao_user_key = `merged:${userId}`;
      user.nickname += " (통합됨)";
    }
    if (merged !== "missing-security") put(f, `identity_merge_redirect:${userId}`, JSON.stringify({ secondary_user_id: userId, primary_user_id: "user-bin" }));
    f.db.accountbook_user_security = f.db.accountbook_user_security.filter((row) => row.user_id !== userId);
    const response = await web(f, "POST", "/my/kakao-claim", { code });
    eq(response.status, 401, `${merged}: uncached authoritative state rejects old code`);
    ok(!response.headers.has("set-cookie"), `${merged}: no secondary session`);
  });
}

// A stale initial "no history" read must not win after explicit use commits.
for (const manual of ["create", "join"]) {
  await withFixture(async (f) => {
    await skill(f, "시작");
    const userId = JSON.parse(marker(f).value).user_id;
    const historyKey = `kakao_first_record_history_v22928:${userId}`;
    const lifecycleKey = `kakao_first_record_lifecycle_v22928:${userId}`;
    const before = f.db.households.length;
    const original = globalThis.fetch;
    let interleaved = false;
    let lifecycleClaims = 0;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url));
      if (u.pathname === "/rest/v1/rpc/accountbook_claim_operation" && init.method === "POST" && JSON.parse(String(init.body)).p_key === lifecycleKey) lifecycleClaims += 1;
      const response = await original(url, init);
      if (!interleaved && u.pathname === "/rest/v1/accountbook_settings" && u.searchParams.get("key") === `eq.${historyKey}` && (!init.method || init.method === "GET")) {
        interleaved = true;
        if (manual === "create") await runtime.createUserHousehold(f.env, userId, "Synthetic concurrent manual ledger", "Synthetic actor");
        else await runtime.joinHouseholdByCode(f.env, userId, f.db.households[0].invite_code);
      }
      return response;
    };
    const result = await skill(f, "점심 만원");
    globalThis.fetch = original;
    eq(result.response.status, 200, `${manual}: interleaved skill request completes safely`);
    ok(interleaved, `${manual}: explicit use commits after stale initial auto-history read`);
    ok(lifecycleClaims >= 2, `${manual}: explicit and auto paths use the same user database lifecycle lease`);
    eq(f.db.households.length, before + (manual === "create" ? 1 : 0), `${manual}: no automatic fallback ledger after explicit commit`);
    eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 0, `${manual}: no transaction through stale automatic context`);
    ok(setting(f, historyKey), `${manual}: durable explicit history remains`);
  });
}

// Definitive failures are not successful lifecycle history.
for (const failure of ["household", "owner", "join"]) {
  await withFixture(async (f) => {
    await skill(f, "시작");
    const userId = JSON.parse(marker(f).value).user_id;
    const original = globalThis.fetch;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(String(init.body)) : {};
      const match = init.method === "POST" && (failure === "household" ? u.pathname === "/rest/v1/households" : u.pathname === "/rest/v1/household_members" && body.role === (failure === "owner" ? "owner" : "pending"));
      if (match) return new Response(JSON.stringify({ message: "synthetic definitive constraint failure" }), { status: 400, headers: { "content-type": "application/json" } });
      return original(url, init);
    };
    let failed = false;
    try {
      if (failure === "join") await runtime.joinHouseholdByCode(f.env, userId, f.db.households[0].invite_code);
      else await runtime.createUserHousehold(f.env, userId, "Synthetic failed creation", "Synthetic actor");
    } catch { failed = true; }
    globalThis.fetch = original;
    ok(failed, `${failure}: definitive failure is reported`);
    ok(!setting(f, `kakao_first_record_history_v22928:${userId}`), `${failure}: failure leaves no completed history`);
    ok(!done(f), `${failure}: failure leaves no first-save completion`);
    await skill(f, "점심 만원");
    eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 1, `${failure}: a genuinely unused user can still save a first private record`);
  });
}

await withFixture(async (f) => {
  await skill(f, "시작");
  await skill(f, "새 가계부 만들기");
  await skill(f, "개인");
  await skill(f, "경합 확인 가계부");
  const results = await Promise.all([skill(f, "응"), skill(f, "이 이름으로 만들기")]);
  eq(f.db.households.filter((row) => row.name === "경합 확인 가계부").length, 1, "concurrent equivalent Kakao creation confirmations make one named household");
  ok(results.every((result) => result.response.status === 200), "both equivalent creation confirmations finish safely");
  const userId = f.db.users.find((row) => row.kakao_user_key === f.key).id;
  const chosen = setting(f, `kakao_selected_household_v2251:${userId}`)?.value;
  const household = f.db.households.find((row) => row.name === "경합 확인 가계부");
  eq(chosen, household.id, "both confirmations converge on one selected household");
});

async function admin(f, path, extra) {
  f.env.ADMIN_API_TOKEN = `synthetic-admin-for-${f.key}`;
  return app.fetch(new Request(BASE + path, { method: "POST", headers: { accept: "text/html", authorization: `Bearer ${f.env.ADMIN_API_TOKEN}`, origin: BASE, "sec-fetch-site": "same-origin", "content-type": "application/x-www-form-urlencoded", "user-agent": f.agent }, body: new URLSearchParams(extra) }), f.env, { waitUntil() {} });
}
async function mergeFixture(f) {
  // Independent synthetic IDs model distinct real accounts without cross-fixture cache collisions.
  const householdId = f.db.households[0].id;
  const primaryId = f.db.household_members.find((row) => row.household_id === householdId && row.role === "owner").user_id;
  // Keep the first ordered key on primary so this same-isolate barrier can mutate secondary before its lock.
  const secondaryId = `${primaryId}:synthetic-merge:${f.key}`;
  f.db.users.push({ id: secondaryId, kakao_user_key: f.key, nickname: "Synthetic merge secondary" });
  f.db.household_members.push({ household_id: householdId, user_id: secondaryId, role: "member" });
  return { primaryId, secondaryId, householdId, form: { household_id: householdId, primary_user_id: primaryId, secondary_user_id: secondaryId, confirm_text: "통합" } };
}
await withFixture(async (f) => {
  const m = await mergeFixture(f);
  const original = globalThis.fetch;
  let attempted = false;
  globalThis.fetch = async (url, init = {}) => {
    if (new URL(String(url)).pathname === "/rest/v1/rpc/accountbook_merge_users_v227") {
      attempted = true;
      return new Response(JSON.stringify({ message: "synthetic definitive merge failure" }), { status: 400, headers: { "content-type": "application/json" } });
    }
    return original(url, init);
  };
  const result = await admin(f, "/admin/identity/merge", m.form);
  globalThis.fetch = original;
  ok(attempted, "definitive merge failure reaches the original atomic RPC");
  ok(result.headers.get("location")?.includes("err="), "definitive merge failure reports an error");
  ok(!setting(f, `kakao_first_record_history_v22928:${m.primaryId}`) && !setting(f, `kakao_first_record_history_v22928:${m.secondaryId}`), "failed merge publishes no successful lifecycle histories");
});

for (const mutation of ["join", "remove"]) {
  await withFixture(async (f) => {
    const m = await mergeFixture(f);
    const extraId = `synthetic-extra-ledger-${f.key}`;
    f.db.households.push({ id: extraId, name: "Synthetic concurrent joined ledger", invite_code: "RACE28" });
    put(f, `member_aliases:${extraId}`, JSON.stringify({ [m.secondaryId]: "Synthetic secondary alias" }));
    const original = globalThis.fetch;
    const firstKey = `kakao_first_record_lifecycle_v22928:${[m.primaryId, m.secondaryId].sort()[0]}`;
    let interleaved = false;
    let mergeCalls = 0;
    globalThis.fetch = async (url, init = {}) => {
      const u = new URL(String(url));
      const body = init.body ? JSON.parse(String(init.body)) : {};
      if (!interleaved && u.pathname === "/rest/v1/rpc/accountbook_claim_operation" && body.p_key === firstKey) {
        interleaved = true;
        if (mutation === "join") await runtime.joinHouseholdByCode(f.env, m.secondaryId, "RACE28");
        else await admin(f, "/admin/member/remove", { household_id: m.householdId, user_id: m.secondaryId });
      }
      if (u.pathname === "/rest/v1/rpc/accountbook_merge_users_v227") {
        mergeCalls += 1;
        const user = f.db.users.find((row) => row.id === m.secondaryId);
        user.kakao_user_key = `merged:${m.secondaryId}`;
        user.nickname += " (통합됨)";
        for (const row of f.db.household_members) if (row.user_id === m.secondaryId) row.user_id = m.primaryId;
        f.db.accountbook_user_security = f.db.accountbook_user_security.filter((row) => row.user_id !== m.secondaryId);
        put(f, `identity_merge_redirect:${m.secondaryId}`, JSON.stringify({ secondary_user_id: m.secondaryId, primary_user_id: m.primaryId }));
        return new Response(JSON.stringify({ merged: true, transactions: 0 }), { status: 200, headers: { "content-type": "application/json" } });
      }
      return original(url, init);
    };
    const result = await admin(f, "/admin/identity/merge", m.form);
    globalThis.fetch = original;
    ok(interleaved, `${mutation}: membership mutation commits before merge lifecycle acquisition`);
    if (mutation === "join") {
      eq(mergeCalls, 1, "join: atomic merge runs once after fresh scope capture");
      ok(result.headers.get("location")?.includes("msg="), "join: merge succeeds");
      const aliases = JSON.parse(setting(f, `member_aliases:${extraId}`).value);
      eq(aliases[m.primaryId], "Synthetic secondary alias", "join: late joined household is included in alias cleanup");
      ok(!aliases[m.secondaryId], "join: old alias is removed in the late joined household");
    } else {
      eq(mergeCalls, 0, "remove: fresh selected membership check prevents the merge RPC");
      ok(result.headers.get("location")?.includes("err="), "remove: scope change is reported safely");
    }
  });
}

// Purge cannot bypass the same user lease held by an automatic retry.
await withFixture(async (f) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => new URL(String(url)).pathname === "/rest/v1/transactions" && init.method === "POST"
    ? new Response(JSON.stringify({ message: "synthetic first-save failure" }), { status: 400, headers: { "content-type": "application/json" } }) : original(url, init);
  await skill(f, "점심 만원");
  globalThis.fetch = original;
  const pending = JSON.parse(marker(f).value);
  const baselineHouseholds = f.db.households.length - 1;
  ok(pending.candidate_id && !done(f), "purge race starts with a pending failed-save candidate");
  let reached;
  let release;
  const paused = new Promise((resolve) => { reached = resolve; });
  const gate = new Promise((resolve) => { release = resolve; });
  let historyReads = 0;
  let purgePosted = false;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    if (u.pathname === "/rest/v1/rpc/accountbook_purge_household_v227") purgePosted = true;
    const response = await original(url, init);
    if (u.pathname === "/rest/v1/accountbook_settings" && u.searchParams.get("key") === `eq.kakao_first_record_history_v22928:${pending.user_id}` && (!init.method || init.method === "GET") && ++historyReads === 2) {
      reached();
      await gate;
    }
    return response;
  };
  const retry = skill(f, "커피 5000원");
  await paused;
  const deletion = admin(f, "/admin/household/delete", { id: pending.candidate_id, confirm_text: "삭제" });
  await new Promise((resolve) => setTimeout(resolve, 0));
  ok(!purgePosted, "purge cannot commit while automatic final check/save holds the user lease");
  ok(f.db.households.some((row) => row.id === pending.candidate_id), "candidate remains while purge waits");
  release();
  const [retryResult, deleted] = await Promise.all([retry, deletion]);
  globalThis.fetch = original;
  eq(retryResult.response.status, 200, "serialized retry finishes");
  ok(deleted.headers.get("location")?.includes("msg=deleted"), "serialized purge succeeds after retry releases the user lease");
  eq(f.db.households.length, baselineHouseholds, "purge leaves no recreated candidate household");
  eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 0, "purge leaves no fallback transaction");
  await skill(f, "저녁 15000원");
  eq(f.db.households.length, baselineHouseholds, "later record does not recreate a purged pending candidate");
});

await withFixture(async (f) => {
  const original = globalThis.fetch;
  globalThis.fetch = async (url, init = {}) => {
    const u = new URL(String(url));
    const body = init.body ? JSON.parse(String(init.body)) : {};
    if (u.pathname === "/rest/v1/household_members" && init.method === "POST" && body.role === "owner") return new Response(JSON.stringify({ message: "synthetic owner failure" }), { status: 400, headers: { "content-type": "application/json" } });
    if (u.pathname === "/rest/v1/households" && init.method === "DELETE") return new Response(JSON.stringify({ message: "synthetic compensation failure" }), { status: 500, headers: { "content-type": "application/json" } });
    return original(url, init);
  };
  await skill(f, "점심 만원");
  globalThis.fetch = original;
  const rawKey = marker(f).key;
  const rawValue = marker(f).value;
  const pending = JSON.parse(rawValue);
  ok(f.db.households.some((row) => row.id === pending.candidate_id), "orphan purge starts with a confirmed provisional household");
  ok(!f.db.household_members.some((row) => row.household_id === pending.candidate_id), "orphan has no completed owner membership");
  const deleted = await admin(f, "/admin/household/delete", { id: pending.candidate_id, confirm_text: "삭제" });
  ok(deleted.headers.get("location")?.includes("msg=deleted"), "confirmed orphan candidate can be explicitly retired");
  put(f, rawKey, rawValue);
  await skill(f, "커피 5000원");
  ok(!f.db.households.some((row) => row.id === pending.candidate_id), "late pending restoration cannot recreate an explicitly retired orphan");
  eq(f.db.transactions.filter((row) => row.source_user_key === f.key).length, 0, "retired orphan receives no fallback record");
});

// Active public manuals must describe chat-first without provisioning on guide reads.
await withFixture(async (f) => {
  const before = Object.fromEntries(["users", "households", "household_members", "transactions"].map((key) => [key, f.db[key].length]));
  let guide = "";
  for (const path of ["/", "/how-it-works"]) {
    const response = await web(f, "GET", path);
    const html = await response.text();
    eq(response.status, 200, `${path} public start manual is available`);
    ok(html.includes("웹 로그인 없이") && html.includes("첫 기록"), `${path} starts with private chat-first, not mandatory web signup`);
    ok(!html.includes("단톡방을 연결하고, 짧은 기록 연습을 거쳐 첫 기록") && !html.includes("처음 사용자는 새 가계부를 만들거나 받은 초대코드로 참여합니다"), `${path} removes obsolete mandatory shared setup before first record`);
    if (path === "/how-it-works") guide = html;
  }
  ok(guide.includes("10분") && guide.includes("카카오에서 기록한 가계부 이어 열기") && guide.includes("다른 계정과 자동 병합하지 않습니다"), "manual explains optional one-time web continuation without account merging");
  ok(guide.includes("단톡방에서는 개인 가계부나 공동 참여를 자동 생성하지 않으며 웹 연결 코드도 제공하지 않습니다"), "manual keeps group creation, participation and code boundaries explicit");
  for (const [key, count] of Object.entries(before)) eq(f.db[key].length, count, `public manual read does not provision ${key}`);
});

console.log(`PASS: trusted chat-first onboarding and one-time web continuation (${checks} checks)`);
